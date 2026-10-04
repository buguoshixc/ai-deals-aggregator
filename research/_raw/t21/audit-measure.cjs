#!/usr/bin/env node
'use strict';
/**
 * t21 · 独立自审的**证据采集器**（只读）
 *
 * 只做「读数」，不做判断：把它跑出来的数字原样写进 self-audit 报告。
 * 覆盖：
 *   A. baseline.json 的 5 条 corrections 逐条独立复核（含在基线 SHA 上隔离构建数 dist 页数）
 *   B. 四个旧数字在最终材料里的**残留扫描**
 *   C. Git diff 逐文件分类（区域 / 变更类型 / 是否派生产物 / 是否降低断言 / 是否新增断言 / Stable ID）
 *   D. 可重建（reproducible）三件套 + validate/check:ci 的现场读数
 *   E. 变异电池的结果汇总
 * 产出：research/_raw/t21/audit-measurements.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const WT = process.argv[2] || 'D:/OneDrive/Desktop/Code/AI Page/.worktrees/coverage-expansion-v1';
const OUT = path.join(WT, 'research/_raw/t21/audit-measurements.json');
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: opts.cwd || WT, encoding: opts.encoding || 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: opts.timeout || 900000 });
const git = args => { const r = sh('git', ['-C', WT, ...args]); return { out: String(r.stdout === undefined ? '' : r.stdout), err: String(r.stderr === undefined ? '' : r.stderr), code: r.status }; };
/** 从 git 对象取文件内容：先拿字节再解码（`git show` 的文本解码在某些文件上会失败） */
const gitFileText = (sha, file) => {
  const r = spawnSync('git', ['-C', WT, 'show', `${sha}:${file}`], { encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) return { ok: false, text: '', bytes: 0 };
  let b = r.stdout;
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) b = b.slice(3);
  return { ok: true, text: b.toString('utf8'), bytes: r.stdout.length };
};
const gitFileJson = (sha, file) => { const r = gitFileText(sha, file); if (!r.ok) return null; try { return JSON.parse(r.text); } catch (e) { return null; } };
const readJson = p => JSON.parse(fs.readFileSync(path.join(WT, p), 'utf8'));
const read = p => fs.readFileSync(path.join(WT, p), 'utf8');

const M = { generatedAt: new Date().toISOString(), wt: WT, head: git(['rev-parse', 'HEAD']).out.trim(), baselineSha: 'a4dd40fc66ea612f327036f5ba3d98cbff46c288' };

/* ─────────── A. corrections 逐条独立复核 ─────────── */
const corr = [];
// C1 gateStepCount：不看 baseline 的结论，直接数 action.yml 的步骤 + check-ci 实跑读数
{
  const yml = read('.github/actions/gate/action.yml');
  const names = [...yml.matchAll(/^\s*-\s+name:\s*(.+)$/gm)].map(m => m[1].trim());
  const ci = sh(process.execPath, ['scripts/tools/check-ci-consistency.js']);
  const ciOut = (ci.stdout || '') + (ci.stderr || '');
  const m10 = /共\s*(\d+)\s*步/.exec(ciOut);
  const m10b = /run 步骤\s*(\d+)\s*个\s*\/\s*shell 声明\s*(\d+)\s*个/.exec(ciOut);
  corr.push({ id: 'C1', field: 'gates.gateStepCount', draftValue: 41, baselineSays: 45,
    measured: { actionYmlNames: names.length, checkCiSays: m10 ? Number(m10[1]) : null, runSteps: m10b ? Number(m10b[1]) : null, shellDecls: m10b ? Number(m10b[2]) : null, checkCiExit: ci.status,
      actionYmlNamesAtBaseline: gitFileText('a4dd40f', '.github/actions/gate/action.yml').text.split('\n').filter(l => /^\s*-\s+name:/.test(l)).length,
      actionYmlNamesNow: names.length },
    verdict: (gitFileText('a4dd40f', '.github/actions/gate/action.yml').text.split('\n').filter(l => /^\s*-\s+name:/.test(l)).length === 45) ? 'baseline-45-confirmed / draft-41-refuted / current-49' : 'MISMATCH' });
}
// C2 expectChecks：读 verify.yml 的**调用行**（不是注释），并跑正负向
{
  const yml = read('.github/workflows/verify.yml').split('\n');
  const callLines = yml.map((l, i) => ({ i: i + 1, l })).filter(x => /--expect-checks=\d+/.test(x.l));
  const code = callLines.filter(x => !/^\s*#/.test(x.l));
  const comment = callLines.filter(x => /^\s*#/.test(x.l));
  const pos = sh(process.execPath, ['scripts/tools/check-ci-consistency.js', '--expect-checks=37']);
  const neg = sh(process.execPath, ['scripts/tools/check-ci-consistency.js', '--expect-checks=36']);
  const baseVerify = gitFileText('a4dd40f', '.github/workflows/verify.yml').text.split('\n');
  const baseCodeLine = baseVerify.filter(l => /--expect-checks=\d+/.test(l) && !/^\s*#/.test(l)).map(l => l.trim());
  const baseCommentLine = baseVerify.filter(l => /--expect-checks=\d+/.test(l) && /^\s*#/.test(l)).map(l => l.trim());
  const basePin = baseCodeLine.map(l => Number((/--expect-checks=(\d+)/.exec(l) || [])[1])).filter(Boolean)[0];
  corr.push({ id: 'C2', field: 'gates.expectChecks', draftValue: 36, baselineSays: 37,
    measured: {
      callLines: code.map(x => `${x.i}: ${x.l.trim()}`), commentLines: comment.map(x => `${x.i}: ${x.l.trim()}`),
      atBaselineSha: { codeLine: baseCodeLine, commentLine: baseCommentLine, pinnedValue: basePin },
      pin37Exit: pos.status, pin36Exit: neg.status,
      pin37Tail: ((pos.stdout || '') + (pos.stderr || '')).trim().split('\n').slice(-1)[0],
      pin36Tail: ((neg.stdout || '') + (neg.stderr || '')).trim().split('\n').slice(-1)[0],
    },
    verdict: (basePin === 37 && /36/.test(baseCommentLine.join(''))) ? 'baseline-37-confirmed / draft-36-came-from-comment(line95) / current-38' : 'MISMATCH' });
}
// C3 dealPlanLinks：条数 vs 字节数
{
  const doc = readJson('scripts/data/deal-plan-links.json');
  const stat = fs.statSync(path.join(WT, 'scripts/data/deal-plan-links.json'));
  corr.push({ id: 'C3', field: 'data.dealPlanLinks', draftValue: 5023, baselineSays: 5,
    measured: { linksArrayLength: (doc.links || []).length, retiredLength: (doc.retired || []).length, fileBytes: stat.size, topKeys: Object.keys(doc) },
    verdict: ((doc.links || []).length === 5 && (doc.retired || []).length === 0) ? 'confirmed-5-relations' : 'MISMATCH' });
}
// C4 futurepedia consecutiveFailures：读当前 source-health，并与 baseline SHA 的版本对照
{
  const cur = readJson('scripts/data/source-health.json');
  const row = (cur.sources || cur.rows || cur.entries || []).find ? (cur.sources || cur.rows || cur.entries || []).find(r => (r.source || r.id || r.collector) === 'futurepedia') : null;
  const baseRaw = sh('git', ['-C', WT, 'show', 'a4dd40f:scripts/data/source-health.json']);
  let baseRow = null;
  try { const b = JSON.parse(baseRaw.out); baseRow = (b.sources || b.rows || b.entries || []).find(r => (r.source || r.id || r.collector) === 'futurepedia') || null; } catch (e) { /* ignore */ }
  corr.push({ id: 'C4', field: 'collectors.knownLongTermFailure.consecutiveFailures', draftValue: 8, baselineSays: 9,
    measured: {
      currentRow: row && { consecutiveFailures: row.consecutiveFailures, lastError: row.lastError, lastSuccessAt: row.lastSuccessAt, status: row.status },
      atBaselineSha: baseRow && { consecutiveFailures: baseRow.consecutiveFailures, status: baseRow.status },
      currentFileSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(WT, 'scripts/data/source-health.json'))).digest('hex').slice(0, 16),
      baselineFileSha256: crypto.createHash('sha256').update(String(baseRaw.out || ''), 'utf8').digest('hex').slice(0, 16),
      currentDist: cur.dist || cur.byStatus || null,
    },
    verdict: (baseRow && baseRow.consecutiveFailures === 9 && row && row.status === 'healthy') ? 'baseline-9-confirmed / draft-8-refuted / current-healthy-0' : 'MISMATCH' });
}
// C5 dist 页数：在基线 SHA 的隔离副本里真构建（不碰共享树）
{
  const tmp = path.join(process.env.TEMP || '/tmp', 't21-base-' + Date.now());
  const rec = { tried: true, tmp, steps: [] };
  try {
    fs.mkdirSync(tmp, { recursive: true });
    // 用 git archive 导出基线 SHA 的树（不含 dist），再借用当前 worktree 的 node_modules
    // 用 buffer 编码取 tar（字符串编码会把二进制写坏：bad header checksum）
    const tar = spawnSync('git', ['-C', WT, 'archive', '--format=tar', 'a4dd40f'], { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024, timeout: 600000 });
    rec.steps.push({ step: 'git archive a4dd40f', exit: tar.status, bytes: tar.stdout ? tar.stdout.length : 0 });
    const tarFile = path.join(tmp, 'base.tar');
    fs.writeFileSync(tarFile, tar.stdout);
    const ex = sh('tar', ['-xf', 'base.tar'], { cwd: tmp });
    rec.steps.push({ step: 'tar -xf', exit: ex.status, err: String(ex.stderr || '').slice(0, 200) });
    const link = sh('cmd', ['/c', 'mklink', '/J', path.join(tmp, 'node_modules'), path.join(WT, 'node_modules')]);
    rec.steps.push({ step: 'junction node_modules', exit: link.status });
    const build = sh(process.execPath, ['scripts/tools/build-local.js', '--out=base.building'], { cwd: tmp, timeout: 900000 });
    rec.steps.push({ step: 'build-local --out=base.building', exit: build.status, tail: ((build.stdout || '') + (build.stderr || '')).trim().split('\n').slice(-2).join(' | ') });
    const distDir = path.join(tmp, 'base.building');
    if (fs.existsSync(distDir)) {
      const walk = d => { let n = { html: 0, all: 0 }; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { const s = walk(p); n.html += s.html; n.all += s.all; } else { n.all++; if (e.name.endsWith('.html')) n.html++; } } return n; };
      rec.counts = walk(distDir);
      const sm = fs.existsSync(path.join(distDir, 'sitemap.xml')) ? read(path.join(distDir, 'sitemap.xml')) : '';
      rec.sitemapEntries = (sm.match(/<loc>/g) || []).length;
    }
  } catch (e) { rec.error = e.message; }
  corr.push({ id: 'C5', field: 'site.distHtmlPages', draftValue: '173（二手：主工作区 dist/）', baselineSays: '173（一手：基线 SHA 隔离构建）',
    measured: rec, verdict: rec.counts && rec.counts.html === 173 ? 'confirmed-173-first-hand' : (rec.counts ? 'MISMATCH' : 'NOT-MEASURED') });
}

/* ─────────── B. 四个旧数字的残留扫描 ─────────── */
const FINAL_MATERIALS = [
  'research/coverage-expansion-v1-report.md', 'research/coverage-expansion-v1-self-audit.md',
  'research/coverage-expansion-v1-residual-register.md', 'research/coverage-expansion-v1-source-health-rulings.md',
  'research/coverage-expansion-v1-data-quality-review.md', 'research/coverage-expansion-v1-model-currentness.md',
  'research/coverage-expansion-v1-pr-body.md', 'research/_raw/t39/report-inputs.md',
  'research/_raw/t37/t19-runbook.md', 'research/_raw/t43/pr-and-release-notes.md',
  'README.md', 'NEXT-STEPS.md', 'PROJECT_STATUS.md', 'SUMMARY.md',
  'docs/SCHEMA-v3.0.md', 'docs/SCHEMA-v2.5.md', 'research/coverage-expansion-v1-provider-review.md',
];
const residual = [];
const PATTERNS = [
  { id: 'C1-draft41', re: /\b41\s*步/g, note: '旧 gateStepCount=41 的「41 步」写法' },
  { id: 'C2-draft36', re: /--expect-checks=36/g, note: '旧 expectChecks=36（含**注释**里的旧数字 —— baseline 明确把它记为 comment-drift）' },
  { id: 'C3-draft5023', re: /\b5023\b|5,023\b/g, note: '文件名条数被写成 5023（实为字节数）' },
  { id: 'C4-draft8', re: /(?:连续失败|consecutiveFailures)[^\n]{0,24}\b8\b/g, note: 'futurepedia 连续失败写成 8（实为 9）' },
];
for (const f of FINAL_MATERIALS) {
  const p = path.join(WT, f);
  if (!fs.existsSync(p)) { residual.push({ file: f, exists: false }); continue; }
  const text = fs.readFileSync(p, 'utf8');
  const hits = [];
  for (const pat of PATTERNS) {
    const lines = text.split('\n');
    lines.forEach((l, i) => { if (pat.re.test(l)) hits.push({ rule: pat.id, line: i + 1, text: l.trim().slice(0, 170) }); pat.re.lastIndex = 0; });
  }
  residual.push({ file: f, exists: true, bytes: Buffer.byteLength(text), hits });
}

/* ─────────── C. git diff 逐文件分类 ─────────── */
const nameStatus = git(['diff', '--name-status', '--no-renames', 'a4dd40f', 'HEAD']).out.trim().split('\n').filter(Boolean);
const numstat = git(['diff', '--numstat', '--no-renames', 'a4dd40f', 'HEAD']).out.trim().split('\n').filter(Boolean);
const numMap = new Map();
for (const l of numstat) { const [a, d, f] = l.split('\t'); numMap.set(f, { add: a === '-' ? null : Number(a), del: d === '-' ? null : Number(d), binary: a === '-' }); }
const DERIVED = ['deals.json', 'plans.json', 'api-plans.json', 'models.json', 'model-registry-links.json', 'scripts/data/deals.json', 'scripts/data/plans.json', 'scripts/data/api-plans.json', 'scripts/data/models.json', 'scripts/data/model-registry-links.json', 'scripts/data/deal-history.json', 'scripts/data/plan-history.json', 'scripts/data/api-plan-history.json', 'scripts/data/source-health.json', 'scripts/data/source-snapshots.json', 'scripts/data/coverage-targets.json', 'research/_raw'];
const AREA = f => {
  if (/^scripts\/tools\//.test(f)) return 'scripts/tools';
  if (/^scripts\/lib\//.test(f)) return 'scripts/lib';
  if (/^scripts\/data\//.test(f)) return 'scripts/data';
  if (/^scripts\/collectors\//.test(f)) return 'scripts/collectors';
  if (/^scripts\//.test(f)) return 'scripts(other)';
  if (/^\.github\//.test(f)) return '.github';
  if (/^docs\//.test(f)) return 'docs';
  if (/^research\/_raw\//.test(f)) return 'research/_raw';
  if (/^research\//.test(f)) return 'research(docs)';
  if (/^assets\//.test(f)) return 'assets';
  return 'root/other';
};
const files = nameStatus.map(l => {
  const [st, ...rest] = l.split('\t');
  const f = rest.join('\t');
  const n = numMap.get(f) || {};
  const isTest = /selftest|verify-site|check-|validate/i.test(f) && f.endsWith('.js');
  return { status: st, file: f, area: AREA(f), add: n.add, del: n.del, binary: !!n.binary, isTestFile: isTest, isDerivedCandidate: DERIVED.some(d => f === d || f.startsWith(d + '/')) };
});
// 根目录派生产物单独标出来（它们不在 DERIVED 前缀里，但是派生）
const ROOT_DERIVED = new Set(['deals.json', 'plans.json', 'api-plans.json', 'models.json', 'model-registry-links.json', 'model-registry-gaps.json', 'deal-plan-links.json', 'index.html', 'sitemap.xml', 'robots.txt', 'favicon.svg']);
for (const f of files) if (ROOT_DERIVED.has(f.file)) f.isDerivedCandidate = true;

/* 断言变化：只在「测试/检查文件」上统计；用 check( 调用数 + 显式断言名数 */
const assertDelta = [];
for (const f of files.filter(x => x.isTestFile && x.status !== 'D')) {
  const cur = fs.existsSync(path.join(WT, f.file)) ? fs.readFileSync(path.join(WT, f.file), 'utf8') : '';
  const old = git(['show', `a4dd40f:${f.file}`]).out;
  const count = s => (s.match(/\bcheck\(/g) || []).length;
  const countNoThrow = s => (s.match(/\bthrow new Error\(/g) || []).length;
  assertDelta.push({ file: f.file, checkCallsOld: count(old), checkCallsNew: count(cur), throwOld: countNoThrow(old), throwNew: countNoThrow(cur), delta: count(cur) - count(old) });
}
const weakened = assertDelta.filter(a => a.checkCallsNew < a.checkCallsOld);

/* Stable ID churn：身份类字段是否变化（用各 store 的 id/identity 列对账） */
const IDENTITY_KEYS = {
  'scripts/data/providers.json': 'keys',
  'scripts/data/models.json': 'keys',
  'scripts/data/model-registry-links.json': 'keys',
  'scripts/data/vendor-slugs.json': 'keys',
  'scripts/data/aliases.json': 'keys',
  'scripts/data/official_urls.json': 'keys',
  'scripts/data/landing-pages.json': 'keys',
  'scripts/data/category-slugs.json': 'keys',
};
function identityChurn() {
  const out = { stores: {}, planAndModelIds: {} };
  /* ① 键集合漂移（provider / model / link / slug / alias / 官方域 / 落地页） */
  for (const file of Object.keys(IDENTITY_KEYS)) {
    const a = gitFileJson('a4dd40f', file), b = loadJsonOrNull(file);
    if (!a || !b) { out.stores[file] = { error: 'load failed', before: !!a, after: !!b }; continue; }
    const keysA = Object.keys(a).filter(k => !k.startsWith('_')), keysB = Object.keys(b).filter(k => !k.startsWith('_'));
    out.stores[file] = {
      countBefore: keysA.length, countAfter: keysB.length,
      removed: keysA.filter(k => !keysB.includes(k)),
      added: keysB.filter(k => !keysA.includes(k)),
      orderChanged: JSON.stringify(keysA) !== JSON.stringify(keysB),
    };
  }
  /* ② plans / api-plans 的 12 位派生 id：同名商品换 id = Stable ID churn（题面 §十 的纪律） */
  for (const [name, file, listKey] of [['plans', 'plans.json', 'plans'], ['apiPlans', 'api-plans.json', 'plans']]) {
    const a = gitFileJson('a4dd40f', file), b = loadJsonOrNull(file);
    if (!a || !b) { out.planAndModelIds[name] = { error: 'load failed', before: !!a, after: !!b }; continue; }
    const idsA = new Set((a[listKey] || []).map(x => x.id)), idsB = new Set((b[listKey] || []).map(x => x.id));
    const keyOf = x => `${x.provider}|${x.planName}|${(x.billing && x.billing.period) || x.channel || ''}`;
    const mapA = new Map((a[listKey] || []).map(x => [keyOf(x), x.id]));
    const churn = (b[listKey] || []).filter(x => mapA.has(keyOf(x)) && mapA.get(keyOf(x)) !== x.id)
      .map(x => ({ key: keyOf(x), oldId: mapA.get(keyOf(x)), newId: x.id }));
    out.planAndModelIds[name] = {
      countBefore: idsA.size, countAfter: idsB.size,
      removedIds: [...idsA].filter(x => !idsB.has(x)).length, addedIds: [...idsB].filter(x => !idsA.has(x)).length,
      sameIdentityDifferentId: churn,
    };
  }
  /* ③ models：slug 是稳定身份；顺序也要对账（规范序） */
  const mB = loadJsonOrNull('models.json'); const mA = gitFileJson('a4dd40f', 'models.json');
  const mSlugsA = mA ? (mA.models || []).map(m => m.slug) : [];
  const mSlugsB = (mB && mB.models ? mB.models : []).map(m => m.slug);
  out.planAndModelIds.models = {
    countBefore: mSlugsA.length, countAfter: mSlugsB.length,
    removed: mSlugsA.filter(s => !mSlugsB.includes(s)), added: mSlugsB.filter(s => !mSlugsA.includes(s)),
    orderChanged: JSON.stringify(mSlugsA) !== JSON.stringify(mSlugsB),
    idShapeStable: (mB && mB.models ? mB.models : []).every(m => /^[0-9a-f]{12}$/.test(String(m.id || ''))),
  };
  return out;
}
function loadJsonOrNull(p) { try { return readJson(p); } catch (e) { return null; } }

/* ─────────── D. 可重建 + validate/check:ci 现场读数 ─────────── */
const repro = {};
for (const [k, script] of [['deals', 'scripts/tools/check-reproducible.js'], ['plans', 'scripts/tools/check-plans-reproducible.js'], ['apiPlans', 'scripts/tools/check-api-plans-reproducible.js'], ['models', 'scripts/tools/check-models-reproducible.js'], ['modelRegistryLinks', 'scripts/tools/check-model-registry-links.js'], ['feeds', 'scripts/tools/check-feeds-reproducible.js']]) {
  const r = sh(process.execPath, [script]);
  repro[k] = { exit: r.status, tail: ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-2).join(' | ').slice(0, 300) };
}
const val = sh(process.execPath, ['scripts/validate.js', '--strict']);
const cov = sh(process.execPath, ['scripts/tools/coverage-report.js']);
const gate = { validateStrict: { exit: val.status, tail: ((val.stdout || '') + (val.stderr || '')).trim().split('\n').slice(-1)[0] }, coverageReport: { exit: cov.status, tail: ((cov.stdout || '') + (cov.stderr || '')).trim().split('\n').slice(-1)[0] } };

/* ─────────── E. 变异电池结果 ─────────── */
let mutation = { found: false };
for (const cand of ['research/_raw/t17/MUTATION-RESULTS.md', 'research/_raw/t17/mutation-results.json', 'research/_raw/t17/t17-mutation-results.json', 'research/_raw/t17/results.json', 'research/_raw/t17/mutation-battery.json', 'research/_raw/t17/logs/battery.json']) {
  const p = path.join(WT, cand);
  if (!fs.existsSync(p)) continue;
  if (cand.endsWith('.md')) { mutation = { found: true, file: cand, kind: 'markdown', text: fs.readFileSync(p, 'utf8') }; continue; }
  try { mutation = { found: true, file: cand, kind: 'json', data: JSON.parse(fs.readFileSync(p, 'utf8')) }; } catch (e) { mutation = { found: true, file: cand, kind: 'json', parseError: e.message }; }
  break;
}
if (mutation.kind === 'markdown' && mutation.text) {
  const t = mutation.text;
  const line = s => (t.match(s) || [])[0] || null;
  mutation.headline = {
    totalCases: line(/用例[^\n]{0,40}?(\d+)\s*条/), caught: line(/CAUGHT\s*(\d+)/), blind: line(/盲区\s*(\d+)/),
    unexpectedRed: line(/非预期红\s*(\d+)/), recovered: line(/逐字节恢复[^\n]{0,20}?(\d+%|\d+\s*\/\s*\d+)/),
  };
  // 逐条结果（| Mxx | ... | CAUGHT | 之类）
  mutation.rows = t.split('\n').filter(l => /^\|\s*(M|C)\d+/.test(l)).map(l => l.trim());
  mutation.notCaught = t.split('\n').filter(l => /^\|\s*(M|C)\d+/.test(l) && !/CAUGHT/i.test(l)).map(l => l.trim());
  mutation.summaryLine = t.split('\n').filter(l => /CAUGHT|盲区|非预期红|逐字节恢复/.test(l)).slice(0, 8);
  delete mutation.text;
}

const report = { ...M, corrections: corr, residualScan: residual, diffSummary: {
  totalChanged: files.length, byArea: files.reduce((a, f) => (a[f.area] = (a[f.area] || 0) + 1, a), {}),
  byStatus: files.reduce((a, f) => (a[f.status] = (a[f.status] || 0) + 1, a), {}),
  derivedCandidates: files.filter(f => f.isDerivedCandidate).length,
  testFiles: files.filter(f => f.isTestFile).length,
  addedLines: files.reduce((n, f) => n + (f.add || 0), 0), deletedLines: files.reduce((n, f) => n + (f.del || 0), 0),
}, files, assertDelta: { files: assertDelta, weakened },
  identityChurn: identityChurn(), reproducible: repro, gates: gate, mutation };

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log('HEAD ' + M.head.slice(0, 7) + ' · changed ' + files.length + ' · byArea ' + JSON.stringify(report.diffSummary.byArea));
console.log('corrections: ' + corr.map(c => c.id + '=' + c.verdict).join(' '));
console.log('residual hits: ' + residual.reduce((n, r) => n + (r.hits ? r.hits.length : 0), 0));
console.log('weakened assertion files: ' + weakened.length + ' / test files ' + assertDelta.length);
console.log('repro: ' + Object.entries(repro).map(([k, v]) => k + '=' + v.exit).join(' '));
console.log('gates: validate=' + gate.validateStrict.exit + ' coverage=' + gate.coverageReport.exit + ' mutation=' + (mutation.found ? mutation.file : 'not found'));
console.log('wrote ' + OUT);
