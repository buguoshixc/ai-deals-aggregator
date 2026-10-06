#!/usr/bin/env node
/**
 * T3 变异牙（M1–M7）：把每个变异**只改一处**地打到被测产物 `dist/index.html` 上，
 * 由 `scripts/tools/verify-site.js` 真跑判红；还原走 `node scripts/tools/build-local.js`
 * （构建对同一份源码是确定性的，已在 T3 里用 sha256 验证：rebuild 前后 dist/index.html 逐位相等）。
 *
 * 为什么变异打在 dist/ 而不是源码：
 *   · 断言读的就是 dist/ 这一份产物 —— 变异它才是「断言有没有牙」的直接证据；
 *   · 源码（index.html / build-local.js）不属于 T3 的写作用域，**一个字节都不碰**；
 *   · 因此「还原后 git diff 为空」是构造上成立的，而 byte-exact 由 sha256 逐次证明。
 *
 * 用法：
 *   node research/_raw/home-topic-entry-cards-v1/t3-mutate.js apply M1   # 打变异（改 dist/index.html）
 *   node research/_raw/home-topic-entry-cards-v1/t3-mutate.js verify     # 校验 dist/index.html 已回到原始 sha
 *   node research/_raw/home-topic-entry-cards-v1/t3-mutate.js summarize  # 汇总 M1–M7 的判红结果 → t3-mutations.json
 *   每个变异前的原始 sha 从 t3-geometry.json 的 distIndexSha256 读（机器产出，不手抄）。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');
const HERE = __dirname;
const GEOM = path.join(HERE, 't3-geometry.json');

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
const shaFile = p => sha(fs.readFileSync(p));

function pristineSha() {
  if (!fs.existsSync(GEOM)) throw new Error(`缺少 ${path.relative(ROOT, GEOM)}（先跑 t3-geometry.js）`);
  return JSON.parse(fs.readFileSync(GEOM, 'utf8')).distIndexSha256.toUpperCase();
}

/** 每条变异：一个「锚点 → 替换」的单点改动 + 期望命中数 */
const pad = n => String(n).padStart(2, '0');
const MUTATIONS = {
  M1: {
    desc: '把整卡重新挂上 facet 控件标记（退回「标签式入口」的语义）：data-facet="need" 加到每张卡的 <a> 上',
    target: 'nav.needs 区块（卡片开标签）',
    expect: 10,
    apply: block => [block.replace(/<a class="need-card" href=/g, '<a class="need-card" data-facet="need" href='),
      (block.match(/<a class="need-card" href=/g) || []).length]
  },
  M2: {
    desc: '删掉卡上的说明行 <small>…</small>（卡片结构残缺）',
    target: 'nav.needs 区块内的 <small>',
    expect: 10,
    apply: block => [block.replace(/<small>[^<]*<\/small>/g, ''),
      (block.match(/<small>[^<]*<\/small>/g) || []).length]
  },
  M3: {
    desc: '删掉导航暗示：<span class="need-arrow">…</span> 整个去掉',
    target: 'nav.needs 区块内的 .need-arrow',
    expect: 10,
    apply: block => [block.replace(/<span class="need-arrow" aria-hidden="true">[^<]*<\/span>/g, ''),
      (block.match(/<span class="need-arrow" aria-hidden="true">[^<]*<\/span>/g) || []).length]
  },
  M4: {
    desc: '整卡从 <a href> 改成 <button>（无 JS 不可导航、href 消失；href 值挪到 data-href 只为留住文案，判据不看它）',
    target: 'nav.needs 区块内的卡片元素',
    expect: 10,
    apply: block => [block.replace(/<a class="need-card" href="([^"]+)">([\s\S]*?)<\/a>/g,
      (m, href, inner) => `<button class="need-card" data-href="${href}">${inner}</button>`),
      (block.match(/<a class="need-card" href="([^"]+)">([\s\S]*?)<\/a>/g) || []).length]
  },
  M5: {
    desc: '给每张卡加选中态 aria-pressed="false"（handoff 里最容易顺手加的属性）',
    target: 'nav.needs 区块（卡片开标签）',
    expect: 10,
    apply: block => [block.replace(/<a class="need-card" href=/g, '<a class="need-card" aria-pressed="false" href='),
      (block.match(/<a class="need-card" href=/g) || []).length]
  },
  M6: {
    desc: '把 .need-grid 的 5 列网格改成 10×220px 的横向滚动容器（nowrap/横滑藏入口）',
    target: '正文 CSS 里的 .need-grid 基础规则（整页 1 处）',
    expect: 1,
    apply: () => null // 这一条作用于 CSS，见 applyMutation 的特殊分支
  },
  M6a: {
    desc: '【T4 原始 finding 形态】只给**基础** .need-grid 规则（display:grid 那条）注入 overflow-x:auto —— 5 列、内容本来没溢出',
    target: '.need-grid 基础规则（整页 1 处，含 display:grid）',
    expect: 1,
    apply: () => null // CSS 分支
  },
  M6b: {
    desc: '【T4 的 M6R 形态】给**全部四条** .need-grid 规则都注入 overflow-x:auto（基础 + ≤1180 + ≤760 + ≤560）',
    target: '全部 .need-grid 规则（整页 4 处）',
    expect: 4,
    apply: () => null // CSS 分支
  },
  M7: {
    desc: '把其中一张卡的 href 指到错 slug（need/ai-coding/ → need/ai-coding-x/）',
    target: 'nav.needs 区块内的第 8 张卡 href',
    expect: 1,
    apply: block => [block.replace('href="need/ai-coding/"', 'href="need/ai-coding-x/"'),
      (block.match(/href="need\/ai-coding\/"/g) || []).length]
  }
};

const NEEDS_BLOCK_RE = /<nav class="needs"[\s\S]*?<\/nav>/;
const NEED_GRID_CSS_RE = /\.need-grid\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\);\s*gap:\s*var\(--s3\);\s*\}/;

function applyMutation(id) {
  const m = MUTATIONS[id];
  if (!m) throw new Error(`未知变异 ${id}`);
  const expected = pristineSha();
  const before = fs.readFileSync(DIST_INDEX, 'utf8');
  const actual = sha(Buffer.from(before, 'utf8'));
  if (actual !== expected) throw new Error(`dist/index.html 不是原始字节（现 ${actual.slice(0, 16)}… / 期望 ${expected.slice(0, 16)}…），拒绝叠加变异`);

  let after = before;
  let hits = 0;
  let matched = '';
  if (id === 'M6') {
    const found = before.match(NEED_GRID_CSS_RE);
    if (!found) throw new Error('找不到 .need-grid 的基础规则（锚点必须唯一且逐字匹配）');
    if ((before.match(new RegExp(NEED_GRID_CSS_RE.source, 'g')) || []).length !== 1) throw new Error('.need-grid 规则在页面里不止 1 处，拒绝替换');
    matched = found[0];
    hits = 1;
    after = before.replace(NEED_GRID_CSS_RE,
      '.need-grid { display: grid; grid-template-columns: repeat(10, 220px); gap: var(--s3); overflow-x: auto; }');
  } else if (id === 'M6a' || id === 'M6b') {
    // T6 返工新增的两种「横向滚动容器」形态：判据不是几何，而是**计算样式**。
    //   ① 只命中基础规则（display:grid 那条）= 复核者 T4 的原始 finding 形态（内容没溢出，纯语义缺陷）；
    //   ② 命中全部四条规则 = T4 的 M6R 形态。
    // 注入前先数命中数：M6a 必须恰好 1 条（含 display:grid），M6b 必须恰好 4 条 —— 静默失配就拒绝写盘。
    const all = [...before.matchAll(/\.need-grid\s*\{([^}]*)\}/g)];
    const wanted = id === 'M6a' ? all.filter(x => /display:\s*grid/.test(x[1])) : all;
    if (wanted.length !== m.expect) {
      throw new Error(`.need-grid 规则命中 ${wanted.length} 处 ≠ 期望 ${m.expect} 处（M6a=基础 1 条 / M6b=全部 4 条），拒绝写盘`);
    }
    let n = 0;
    after = before.replace(/\.need-grid\s*\{([^}]*)\}/g, (whole, decl) => {
      const hit = id === 'M6a' ? /display:\s*grid/.test(decl) : true;
      if (!hit) return whole;
      n++;
      return `.need-grid {${decl} overflow-x:auto; }`;
    });
    hits = n;
    matched = wanted.map(x => x[0].trim()).join(' ／ ');
  } else {
    const block = before.match(NEEDS_BLOCK_RE);
    if (!block) throw new Error('找不到 nav.needs 区块');
    const [newBlock, n] = m.apply(block[0]);
    hits = n;
    matched = block[0].slice(0, 200);
    after = before.replace(NEEDS_BLOCK_RE, () => newBlock);
  }
  if (hits !== m.expect) throw new Error(`锚点命中 ${hits} 处 ≠ 期望 ${m.expect} 处，拒绝写盘`);

  fs.writeFileSync(DIST_INDEX, after, 'utf8');
  const info = {
    id, description: m.desc, target: m.target, anchorHits: hits, expectedHits: m.expect,
    shaBefore: actual, shaAfter: sha(Buffer.from(after, 'utf8')),
    bytesBefore: Buffer.byteLength(before, 'utf8'), bytesAfter: Buffer.byteLength(after, 'utf8'),
    appliedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(HERE, `t3-mut-${id}.apply.json`), JSON.stringify(info, null, 2) + '\n', 'utf8');
  console.log(`[${id}] 已打上变异：${m.desc}`);
  console.log(`[${id}] 锚点命中 ${hits} 处 · sha ${actual.slice(0, 12)}… → ${info.shaAfter.slice(0, 12)}… · ${info.bytesBefore} → ${info.bytesAfter} 字节`);
  console.log(`[${id}] 改动目标：${m.target}`);
  if (id === 'M6') console.log(`[${id}] 规则替换：\n  - ${matched}\n  + .need-grid { display: grid; grid-template-columns: repeat(10, 220px); gap: var(--s3); overflow-x: auto; }`);
}

function verify() {
  const expected = pristineSha();
  const actual = shaFile(DIST_INDEX);
  const ok = actual === expected;
  console.log(`${ok ? '✓' : '✗'} dist/index.html sha256 ${actual}`);
  console.log(`  期望（t3-geometry.json 记录的原始字节）${expected}`);
  console.log(`  byte-exact 还原 = ${ok}`);
  process.exit(ok ? 0 : 1);
}

function summarize(prefix = 't3-mut') {
  // prefix：套件记录的命名前缀（`<prefix>-<id>.json/.log`）。T6 返工用 `t6-mut`，
  // 这样 t2 的 792 项记录（按 792 项断言集跑的）不会被 798 项的新记录覆盖 —— 两份都留着。
  const rows = [];
  for (const id of Object.keys(MUTATIONS)) {
    const applyFile = path.join(HERE, `t3-mut-${id}.apply.json`);
    const reportFile = path.join(HERE, `${prefix}-${id}.json`);
    const logFile = path.join(HERE, `${prefix}-${id}.log`);
    const row = { id, description: MUTATIONS[id].desc, target: MUTATIONS[id].target };
    if (fs.existsSync(applyFile)) Object.assign(row, JSON.parse(fs.readFileSync(applyFile, 'utf8')));
    if (fs.existsSync(reportFile)) {
      const rep = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
      row.reportFile = `${prefix}-${id}.json`;
      row.verifyTotal = rep.total;
      row.verifyFailed = rep.failed;
      row.verifyExitNonZero = rep.failed > 0;
      row.failingChecks = (rep.checks || []).filter(c => !c.ok).map(c => ({ name: c.name, detail: c.detail }));
    }
    if (fs.existsSync(logFile)) {
      const log = fs.readFileSync(logFile, 'utf8');
      row.summaryLine = (log.split('\n').find(l => /^❌|^✅/.test(l.trim())) || '').trim();
      row.rawFailLines = [...new Set(log.split('\n').filter(l => /^\s*✗/.test(l)).map(l => l.trim()))];
    }
    rows.push(row);
  }
  const named = prefix === 't3-mut' ? 't3-mutations.json' : `${prefix}-summary.json`;
  fs.writeFileSync(path.join(HERE, named), JSON.stringify({ generatedAt: new Date().toISOString(), assertionSet: rows[0] && rows[0].verifyTotal, note: prefix === 't3-mut' ? 't2（792 项断言集）' : 'T6 返工后（798 项断言集）', mutations: rows }, null, 2) + '\n', 'utf8');
  console.log(`汇总（前缀 ${prefix}，断言集 ${rows[0] && rows[0].verifyTotal} 项）→ ${named}`);
  for (const r of rows) {
    const verdict = r.reportFile
      ? (r.verifyFailed === 0 ? '未变红 ✗' : `失败 ${r.verifyFailed} 项 ✓`)
      : '（该前缀下没有这个形态的记录）';
    console.log(`${r.id} [${verdict}] ${r.description}`);
    for (const c of r.failingChecks || []) console.log(`    ✗ ${c.name} — ${String(c.detail).slice(0, 160)}`);
  }
}

const [, , cmd, arg] = process.argv;
try {
  if (cmd === 'apply') applyMutation(arg);
  else if (cmd === 'verify') verify();
  else if (cmd === 'summarize') summarize(arg || 't3-mut');
  else { console.log('用法：t3-mutate.js apply <M1..M7|M6a|M6b> | verify | summarize [前缀]'); process.exit(2); }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
void pad;
