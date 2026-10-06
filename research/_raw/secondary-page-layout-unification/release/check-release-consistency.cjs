#!/usr/bin/env node
/**
 * t23 · **发布前最终闸门的一致性核对**（只读：不写索引、不碰网络、不触碰生产源码）
 *
 * 一次跑完四件事，全部机器判据（不手抄）：
 *   ① **索引 ⊂ add 清单**：`release/pr-body.md` 的证据索引里每条路径都必须会被 `git add` 带上，
 *      且 add 清单里**不许**出现可再生/越界的东西（scratch 副本、停机快照、png、dist.*、node_modules）；
 *   ② **文档引用**：报告 / self-audit / PROJECT_STATUS / NEXT-STEPS / DESIGN-RULES 里出现的每个
 *      **仓库相对路径**都在盘上存在（`.../` 简写按本版证据根展开）；
 *   ③ **sha 绑定**：文档里「路径 + sha256」同行的那些行，逐个核对盘上真值（缩写 sha 按前缀比）；
 *   ④ **版本 pin**：把 7 个源文件 + 判据脚本 + 发布脚本 + 产物 + 五份文档的 sha256/大小/行数/mtime
 *      写成 `release/version-pins.json`（发布冻结后重跑本脚本即得终值）。
 *
 * ⚠️ **快照语义**：报告与文档在轮 5（t24/t25/t26）落地前仍会变；本脚本的输出是**某一时刻**的快照。
 *    它把"缺失/越界"记为 **FATAL**（退出码 1），把"文档里的 sha 与盘上不一致"记为 **DRIFT**
 *    （退出码 2）—— 后者在修复轮进行中属预期，但必须在冻结后清零。
 *
 * 用法（worktree 根目录）：
 *   node research/_raw/secondary-page-layout-unification/release/check-release-consistency.cjs
 *   node …/check-release-consistency.cjs --json=research/_raw/secondary-page-layout-unification/release/final-gate.json
 *
 * 退出码：0 = FATAL 0 / DRIFT 0；1 = 有 FATAL；2 = 有 DRIFT（无 FATAL）。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = process.cwd();
const HERE = __dirname;
const EV = 'research/_raw/secondary-page-layout-unification';
const PR_BODY = `${EV}/release/pr-body.md`;

const SOURCE_FILES = [
  'index.html',
  'scripts/lib/page-kinds.js',
  'scripts/lib/archive.js',
  'scripts/tools/build-local.js',
  'scripts/tools/verify-site.js',
  'scripts/tools/archive-selftest.js',
  'scripts/tools/seo-selftest.js'
];
const RELEASE_SCRIPTS = ['online-smoke.cjs', 'serve-dist-http.cjs', 'rehearse-online-path.cjs', 'check-evidence-index.cjs'];
const ARTIFACTS = ['dist/index.html', 'dist/sitemap.xml', 'dist.baseline/index.html'];
const DOCS = [
  'research/secondary-page-layout-unification-report.md',
  'research/secondary-page-layout-unification-self-audit.md',
  'PROJECT_STATUS.md',
  'NEXT-STEPS.md',
  'docs/DESIGN-RULES.md'
];
/** add 清单里**不该**出现的形态（可再生 / 越界 / 二进制 / 产物副本 / 停机快照） */
const FORBIDDEN = [
  { name: 'scratch 副本', re: /(^|\/)(_?scratch|scratch)(\/|$)/ },
  { name: '停机快照', re: /(^|\/)_halt-snapshot-/ },
  { name: 'png/截图', re: /\.png$/i },
  { name: 'dist 产物', re: /^dist($|\.)/ },
  { name: 'node_modules', re: /(^|\/)node_modules(\/|$)/ },
  { name: 'git 内部', re: /(^|\/)\.git(\/|$)/ }
];
/**
 * **显式白名单**：`.gitignore` 的 `teeth/_scratch/*` 之外**指名放回**的 4 个文件。
 * 它们是最终报告 §G/§J 点名引用的证据（见 `proposed-gitignore-addendum.txt`），
 * 进索引是**设计意图**，不是越界 —— 装置必须显式豁免，否则会把对的判成错的。
 */
const REINCLUDED = new Set([
  `${EV}/teeth/_scratch/mutations.json`,
  `${EV}/teeth/_scratch/splice-22c.cjs`,
  `${EV}/teeth/_scratch/r4-contents-before.log`,
  `${EV}/teeth/_scratch/r4-contents-after.log`
]);

const argOf = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pins = {};
const pin = rel => {
  const abs = path.resolve(ROOT, rel);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { pins[rel] = { exists: false }; return pins[rel]; }
  const buf = fs.readFileSync(abs);
  pins[rel] = {
    exists: true,
    sha256: crypto.createHash('sha256').update(buf).digest('hex'),
    sha16: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16).toUpperCase(),
    bytes: buf.length,
    lines: buf.toString('utf8').split('\n').length - 1,
    mtime: fs.statSync(abs).mtime.toISOString()
  };
  return pins[rel];
};

const fatal = [];
const drift = [];
const info = [];

/* ---------------- ① add 清单 ---------------- */
const addFiles = [];
const addArgv = ['add', '--dry-run', '--all', '--', ...SOURCE_FILES, EV];
const addRes = spawnSync('git', addArgv, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
if (addRes.error || addRes.status !== 0) {
  fatal.push(`git add --dry-run 跑不起来：${addRes.error ? addRes.error.message : `exit ${addRes.status} ${String(addRes.stderr).trim()}`}`);
} else {
  for (const line of String(addRes.stdout).split('\n')) {
    const m = line.match(/^add '(.+)'$/);
    if (m) addFiles.push(m[1]);
  }
}
let addBytes = 0;
for (const f of addFiles) { try { addBytes += fs.statSync(path.resolve(ROOT, f)).size; } catch { /* 由存在性检查兜 */ } }
const addSet = new Set(addFiles);
info.push(`add 清单：${addFiles.length} 个文件 / ${addBytes} bytes ≈ ${(addBytes / 1048576).toFixed(3)} MB`);
// 越界项**按目录归类**（4,000+ 条逐条打印没有意义，按目录给数量+体积才是可处置的形态）
const offenseGroups = new Map();
for (const f of addFiles) {
  if (REINCLUDED.has(f)) continue;   // 指名放回的 4 个证据文件：设计意图，不算越界（captain 2026-10-06 明确）
  const hit = FORBIDDEN.find(bad => bad.re.test(f));
  const allowed = SOURCE_FILES.includes(f) || f === EV || f.startsWith(`${EV}/`);
  if (!hit && allowed) continue;
  const kind = hit ? hit.name : '清单之外的路径';
  const rel = f.startsWith(`${EV}/`) ? f.slice(EV.length + 1) : f;
  const segs = rel.split('/');
  const group = segs.length > 1 ? segs.slice(0, 2).join('/') : rel;
  const key = `${kind} :: ${group}`;
  const cur = offenseGroups.get(key) || { kind, group, count: 0, bytes: 0, sample: f };
  cur.count += 1;
  try { cur.bytes += fs.statSync(path.resolve(ROOT, f)).size; } catch { /* ignore */ }
  offenseGroups.set(key, cur);
}
const offenses = [...offenseGroups.values()].sort((a, b) => b.count - a.count);
for (const o of offenses) {
  fatal.push(`add 清单越界 [${o.kind}] ${o.group}：${o.count} 个文件 / ${(o.bytes / 1048576).toFixed(2)} MB（例：${o.sample}）`);
}
for (const f of SOURCE_FILES) if (!addSet.has(f)) fatal.push(`源文件不在 add 清单里：${f}`);

/* ---------------- ② 索引（pr-body 标记块内的路径） ---------------- */
const indexPath = path.resolve(ROOT, PR_BODY);
let indexPaths = [];
if (!fs.existsSync(indexPath)) {
  fatal.push(`读不到 ${PR_BODY}`);
} else {
  const text = fs.readFileSync(indexPath, 'utf8');
  const b = text.indexOf('<!-- EVIDENCE-INDEX:BEGIN -->');
  const e = text.indexOf('<!-- EVIDENCE-INDEX:END -->');
  if (b < 0 || e <= b) fatal.push(`${PR_BODY} 里找不到成对的证据索引标记块`);
  else {
    const block = text.slice(b, e);
    indexPaths = [...new Set([...block.matchAll(/`([^`\n]+)`/g)].map(m => m[1].trim())
      .filter(t => /^research\/[\w.\-/*]+$/.test(t)))];
  }
}
info.push(`证据索引：${indexPaths.length} 条路径`);
for (const p of indexPaths) {
  const abs = path.resolve(ROOT, p.replace(/\/$/, ''));
  if (!fs.existsSync(abs)) fatal.push(`索引路径不存在：${p}`);
  const asFile = p.endsWith('/') ? null : p;
  if (asFile && !addSet.has(asFile)) fatal.push(`索引路径不在 add 清单里（提交后会成死链）：${p}`);
}
const ignored = spawnSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--', ...indexPaths.map(p => p.replace(/\/$/, ''))],
  { cwd: ROOT, encoding: 'utf8' });
if (ignored.status === 0 && String(ignored.stdout).trim()) {
  for (const f of String(ignored.stdout).trim().split('\n')) drift.push(`索引路径会被 .gitignore 吃掉：${f.trim()}`);
}

/* ---------------- ③ 文档引用（路径存在性 + sha 绑定） ---------------- */
const SHA64 = /\b[0-9a-fA-F]{64}\b/;
const SHA16 = /\b[0-9a-fA-F]{16}\b/;
/** 站内路由（页面的 URL 路径），不是仓库文件 —— 别把 `/docs/data/` 当成 `docs/` 目录下的东西 */
const ROUTE_RE = /^(deal|models|vendor|category|need|plans|changes|status|feeds|archive|student|developer|free-api|docs\/data|data|source-health\.json|llms\.txt)(\/|$)/;
const PLANNED_RE = /计划|待|未来|未落盘|建议|下一步|将|roadmap|planned|TBD|【R5 待定】/;
const expand = token => {
  let t = token.trim().replace(/[，。；、),）]+$/, '');
  if (t.startsWith('.../')) t = `${EV}/${t.slice(4)}`;
  if (t.startsWith('./')) t = t.slice(2);
  return t;
};
const isPathToken = t =>
  /^(research|docs|scripts|\.github|index\.html|PROJECT_STATUS\.md|NEXT-STEPS\.md|package\.json)/.test(t)
  && !/[*?#<>|]/.test(t) && !t.includes(' ');

/** 证据目录 + 已跟踪文件的全量清单：给「省略号缩写路径」做后缀解析用。 */
const inventoryOf = () => {
  const list = [];
  const walk = dir => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else list.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  };
  walk(path.resolve(ROOT, EV));
  const tracked = spawnSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (tracked.status === 0) list.push(...String(tracked.stdout).split('\n').filter(Boolean));
  return new Set(list);
};
const INVENTORY = inventoryOf();
const resolveAbbrev = token => {
  const flat = token.replace(/…/g, '...');
  const parts = flat.split('...').map(s => s.replace(/^\/+|\/+$/g, '')).filter(Boolean);
  if (!parts.length) return null;
  const tail = parts[parts.length - 1];
  const head = parts[0];
  const hits = [...INVENTORY].filter(f => f.endsWith(`/${tail}`) || f === tail)
    .filter(f => !head || head.startsWith('research') || head.startsWith('docs') ? true : f.includes(head));
  return hits.length === 1 ? hits[0] : (hits.length ? hits.sort((a, b) => a.length - b.length)[0] : null);
};

const docReport = [];
const unboundSha = [];
for (const doc of DOCS) {
  const abs = path.resolve(ROOT, doc);
  if (!fs.existsSync(abs)) { fatal.push(`文档缺失：${doc}`); continue; }
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const paths = new Set();
  const problems = { fatal: [], planned: [], route: [], url: [], vendor: [], pattern: [], abbrevResolved: [], abbrevUnknown: [], lineRefBad: [] };
  const shaRows = [];
  lines.forEach((line, i) => {
    const raw = [...line.matchAll(/`([^`\n]+)`/g)].map(m => expand(m[1])).filter(isPathToken);
    raw.forEach(t => paths.add(t));
    const shaMatch = line.match(SHA64) || line.match(SHA16);
    const sha = shaMatch ? shaMatch[0] : null;
    // sha 绑定只认「同行**恰好一个**路径 token 且它可读」的情形：
    // 一行里既有 action.yml 的 sha 又有别的证据路径时，硬绑出来的"不一致"是解析伪影，不是文档错。
    const readable = raw.map(t => t.split(':')[0]).filter(t => { const a = path.resolve(ROOT, t); return fs.existsSync(a) && !fs.statSync(a).isDirectory(); });
    // 三处额外的排除（都是实测出来的解析伪影）：
    //  ① `sha256 = <值>` / `key = <值>` 形态：那个 sha 描述的是**内容**，不是同行文件的自证；
    //  ② sha 与路径相距很远（>80 字符）：同一表格行里提到别的文件时不该硬绑；
    //  ③ 同一行提到多个路径（raw.length > 1）：无从判断 sha 属于谁。
    const shaIdx = sha ? line.indexOf(sha) : -1;
    const nearSha = (token) => {
      const at = line.indexOf(token);
      return at >= 0 && Math.abs(at - shaIdx) <= 80;
    };
    const assigned = /=\s*$/.test(line.slice(Math.max(0, shaIdx - 12), shaIdx));
    if (sha && raw.length === 1 && readable.length === 1 && !assigned && nearSha(raw[0])) {
      shaRows.push({ line: i + 1, sha, target: readable[0], text: line.trim().slice(0, 140) });
    } else if (sha && (raw.length || /sha256/i.test(line))) {
      // 绑定不成立的行**照样登记**（附原文），由人核对 —— 沉默地不检查等于没检查。
      unboundSha.push({ doc, line: i + 1, sha, text: line.trim().slice(0, 160) });
    }

    for (const token of raw) {
      if (/^https?:|\.(com|cn|org|io)\b/.test(token)) { problems.url.push(`${doc}:${i + 1} ${token}`); continue; }
      // `docs/llms.txt` 这种写法在「官方文档全量索引」上下文里指的是**厂商**的文档站，不是仓库路径。
      if (/^docs\//.test(token) && /官方/.test(line) && !fs.existsSync(path.resolve(ROOT, token))) {
        problems.vendor.push(`${doc}:${i + 1} ${token}（随文标注为「官方文档」，判为非仓库路径）`);
        continue;
      }
      const lineRef = token.match(/^(.*):(\d+)(?:[–\-]\d+)?$/);
      const base = lineRef ? lineRef[1] : token;
      const bare = base.replace(/\/$/, '');
      if (fs.existsSync(path.resolve(ROOT, bare))) {
        if (lineRef) {
          const target = path.resolve(ROOT, bare);
          if (!fs.statSync(target).isDirectory()) {
            const total = fs.readFileSync(target, 'utf8').split('\n').length;
            if (Number(lineRef[2]) > total) problems.lineRefBad.push(`${doc}:${i + 1} 行号超界 ${token}（文件仅 ${total} 行）`);
          }
        }
        continue;
      }
      if (ROUTE_RE.test(bare) || bare.startsWith('/')) { problems.route.push(`${doc}:${i + 1} ${token}`); continue; }
      // `docs/<x>` 在本仓库有两义：顶层 `docs/`（设计文档）与**本版证据根**下的 `docs/`（本轮生成的
      // 壳↔规则映射、diff 统计等）。顶层没有、证据根有 ⇒ 按证据根解析（写进 info，不静默吞掉）。
      if (token.startsWith('docs/') && fs.existsSync(path.resolve(ROOT, EV, token))) {
        problems.abbrevResolved.push(`${doc}:${i + 1} ${token} → ${EV}/${token}`);
        continue;
      }
      if (/…|\.\.\./.test(token)) {
        const hit = resolveAbbrev(token);
        if (hit) problems.abbrevResolved.push(`${doc}:${i + 1} ${token} → ${hit}`);
        else problems.abbrevUnknown.push(`${doc}:${i + 1} ${token}`);
        continue;
      }
      if (/\{|\}/.test(token)) { problems.pattern.push(`${doc}:${i + 1} ${token}`); continue; }
      if (PLANNED_RE.test(line)) { problems.planned.push(`${doc}:${i + 1} ${token}`); continue; }
      // 缺失时给"盘上同名候选"：路径少写了一级目录是本轮反复出现的引用错误形态（如 `.../M-disk.json`
      // 实际在 `mutations-real/` 下）。这样报告里每条缺失都能直接给出应改成什么。
      const tail = path.basename(bare);
      const cands = [...INVENTORY].filter(f => f.endsWith(`/${tail}`)).slice(0, 3);
      problems.fatal.push(`${doc}:${i + 1} 引用的路径不存在：${token}${cands.length ? `（盘上同名候选：${cands.join(' · ')}）` : '（盘上没有同名文件）'}`);
    }
  });
  for (const p of problems.fatal) fatal.push(p);
  for (const p of problems.lineRefBad) drift.push(`行号引用超界：${p}`);
  for (const p of problems.abbrevUnknown) drift.push(`缩写路径解析不出来（可能是笔误）：${p}`);
  for (const p of problems.planned) info.push(`（计划中/未落盘，不计入缺失）${p}`);
  let shaBad = 0;
  for (const row of shaRows) {
    const want = row.sha.toLowerCase();
    const have = sha256(path.resolve(ROOT, row.target));
    if (have === want || have.startsWith(want) || want.startsWith(have.slice(0, want.length))) continue;
    shaBad++;
    drift.push(`${doc}:${row.line} sha「${row.sha}」≠ ${row.target} 的现值 ${have.slice(0, 16)}`);
  }
  docReport.push({
    doc, lines: lines.length, pathTokens: paths.size,
    missingFatal: problems.fatal.length, planned: problems.planned.length, routes: problems.route.length,
    urls: problems.url.length, vendor: problems.vendor.length, patterns: problems.pattern.length,
    abbrevResolved: problems.abbrevResolved.length, abbrevUnknown: problems.abbrevUnknown.length,
    lineRefBad: problems.lineRefBad.length, shaRows: shaRows.length, shaBad
  });
  info.push(`${doc}：引用路径 ${paths.size} 条 · 缺失 ${problems.fatal.length} · 路由 ${problems.route.length} · 厂商文档/URL ${problems.url.length + problems.vendor.length} · 通配 ${problems.pattern.length} · 缩写可解析 ${problems.abbrevResolved.length} / 解析不出 ${problems.abbrevUnknown.length} · sha 行 ${shaRows.length}（对不上 ${shaBad}）`);
}

/* ---------------- ④ 版本 pin ---------------- */
for (const f of [...SOURCE_FILES, ...RELEASE_SCRIPTS.map(f => `${EV}/release/${f}`), ...ARTIFACTS, ...DOCS]) pin(f);
const pinsOut = {
  tool: 'secondary-page-layout-unification/release/check-release-consistency',
  at: new Date().toISOString(),
  node: process.version,
  head: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(),
  originMaster: spawnSync('git', ['rev-parse', 'origin/master'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(),
  note: '轮 5（t24/t25/t26）冻结后必须重跑本脚本，本文件即"提交内容与证据的版本绑定表"',
  pins
};

/* ---------------- 输出 ---------------- */
if (argOf('json')) {
  const out = path.resolve(ROOT, argOf('json'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify({ ...pinsOut, add: { files: addFiles.length, bytes: addBytes }, index: { paths: indexPaths.length }, docs: docReport, unboundSha, fatal, drift }, null, 2)}\n`, 'utf8');
}
const pinsFile = path.join(HERE, 'version-pins.json');
fs.writeFileSync(pinsFile, `${JSON.stringify(pinsOut, null, 2)}\n`, 'utf8');

console.log('== t23 发布前最终闸门 · 一致性核对 ==');
info.forEach(line => console.log(`  · ${line}`));
console.log(`  · FATAL ${fatal.length} 条 · DRIFT ${drift.length} 条（DRIFT 在修复轮进行中属预期，冻结后必须清零）`);
const show = (title, list) => { if (list.length) { console.log(`\n${title}`); list.forEach(item => console.log(`   ✗ ${item}`)); } };
show('FATAL（缺失 / 越界 / 死链）', fatal.slice(0, 40));
show('DRIFT（sha 与盘上不一致）', drift.slice(0, 20));
if (unboundSha.length) {
  console.log(`\n需人工核对的 sha 行（解析器拒绝硬绑，附原文）：${unboundSha.length} 条`);
  unboundSha.slice(0, 12).forEach(row => console.log(`   · ${row.doc}:${row.line} ${row.sha} — ${row.text}`));
}
console.log(`\n版本 pin 已写出：${path.relative(ROOT, pinsFile).split(path.sep).join('/')}`);
console.log(fatal.length ? '❌ FATAL —— 不许进入发布' : (drift.length ? '⚠️ 无 FATAL，但有 DRIFT（轮 5 冻结后重跑）' : '✅ 全部一致'));
process.exit(fatal.length ? 1 : (drift.length ? 2 : 0));
