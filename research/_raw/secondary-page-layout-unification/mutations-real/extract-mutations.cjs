#!/usr/bin/env node
/**
 * secondary-page-layout-unification · 把 §22c 的变异读数拆成**每条牙一个 JSON**（t3 证据）
 *
 * 输入（全部由 `verify-site.js --dir=dist --json=…` 一轮产出，不额外导航）：
 *   · `<report>.json`    —— 断言明细（`checks[]`）+ 机器可读指标（`metrics`，含条级容器 `metrics.layoutNotes`）
 *   · `mutations.json`   —— 与报告同目录，§22c 自己写的「期望 vs 实测」逐条落盘
 *   · `<dir>`            —— 真实产物目录：**独立地**在磁盘上数一次锚点出现次数（不信浏览器自报）
 *   · 两份产物清单（同一轮运行前后）—— 证明变异零磁盘污染
 *
 * 适配说明（修复轮 r2）：变异清单**现场解析**，不写死 —— 新增的 M8（padding 型收窄）、
 * M9a/M9b（只压非首个）、M10（`@media(min-width:1500px)`，1600 档）会自动出现在输出里；
 * 每条的 `narrowKeys` / `matchedKeys` / `injectedRule` / 新增的要害断言（M8「盒宽没变、有字区域变了」、
 * M9「窄条全部落在选择器命中的条上」）也会被原样收进来。判据细节（`criteria` 段）来自 mutations.json，
 * 不在这里复述 —— 避免出现第二份"我以为的判据"。
 *
 * 输出（`--out-dir`）：`M1.json` … `M10.json` / `M6-control.json` / `no-injection-control.json` /
 * `M5-reuse.json` / `M-summary.json`
 *
 * 用法：
 *   node …/mutations-real/extract-mutations.cjs \
 *        --report=…/geometry/after-verify.json --mutations=…/geometry/mutations.json \
 *        --dir=dist --manifest-before=… --manifest-after=… \
 *        --out-dir=…/mutations-real --label=real-dist
 */

'use strict';

const fs = require('fs');
const path = require('path');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const resolve = p => (p && path.isAbsolute(p) ? p : path.join(ROOT, p || '.'));
const REPORT = resolve(arg('report'));
const MUTATIONS = resolve(arg('mutations'));
const DIR = resolve(arg('dir') || 'dist');
const OUT_DIR = resolve(arg('out-dir') || path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'mutations-real'));
const MANIFEST_BEFORE = arg('manifest-before') ? resolve(arg('manifest-before')) : null;
const MANIFEST_AFTER = arg('manifest-after') ? resolve(arg('manifest-after')) : null;
const LABEL = arg('label') || 'real';
const SELF_TEST = process.argv.includes('--self-test');

for (const [label, file] of [['--report', REPORT], ['--mutations', MUTATIONS]]) {
  if (!fs.existsSync(file)) { console.error(`找不到 ${label}：${file}`); process.exit(2); }
}
const report = JSON.parse(fs.readFileSync(REPORT, 'utf8'));
const mutations = JSON.parse(fs.readFileSync(MUTATIONS, 'utf8'));
const metrics = report.metrics || {};
const round = n => Math.round(n * 100) / 100;

/** 某条牙的**全部**断言（正对照不算在内 —— 它是独立一条牙，单独落盘） */
const checksOf = id => (report.checks || []).filter(check => check.name.startsWith(`§22c ${id} `)
  && !check.name.includes('正对照'));

/**
 * 解析复测断言里的几何读数。兼容两代写法：
 *   r1：`说明 452.81px · 页面列 1380px · detail-main 0 个 · scrollWidth 1440（视口 1440）`
 *   r2：`说明 3 条 · 首条 盒 1380px / 有字区域 452.81px · detail-main 0 个 · scrollWidth 1440（视口 1440） · 窄条 [route#0]`
 */
function parseGeometry(detail) {
  if (!detail) return null;
  const noteCount = /说明 (\d+) 条/.exec(detail);
  const noteWidthLegacy = /说明 ([\d.]+)px/.exec(detail);
  const column = /页面列 ([\d.]+)px/.exec(detail);
  const box = /盒 ([\d.]+)px/.exec(detail);
  const textWidth = /有字区域 ([\d.]+)px/.exec(detail);
  const detailMain = /detail-main (\d+) 个/.exec(detail);
  const scroll = /scrollWidth ([\d.]+)（视口 ([\d.]+)）/.exec(detail);
  const injected = /不可断串注入位置 (\S+)/.exec(detail);
  const narrow = /窄条 \[([^\]]*)\]/.exec(detail);
  return {
    noteCount: noteCount ? Number(noteCount[1]) : null,
    noteWidthLegacy: noteWidthLegacy ? Number(noteWidthLegacy[1]) : null,
    firstNoteBoxWidth: box ? Number(box[1]) : null,
    firstNoteTextWidth: textWidth ? Number(textWidth[1]) : null,
    columnWidthLegacy: column ? Number(column[1]) : null,
    detailMainCount: detailMain ? Number(detailMain[1]) : null,
    scrollWidth: scroll ? Number(scroll[1]) : null,
    viewport: scroll ? Number(scroll[2]) : null,
    injectedAt: injected ? injected[1] : null,
    narrowKeys: narrow ? narrow[1].split(',').map(key => key.trim()).filter(Boolean) : null
  };
}
const parseObserved = detail => {
  const hit = /违规码 \[([^\]]*)\]/.exec(detail || '') || /实测 \[([^\]]*)\]/.exec(detail || '');
  if (!hit) return null;
  return hit[1].split(',').map(code => code.trim()).filter(Boolean);
};

/** 磁盘上独立复核锚点唯一性（只看这一页的 `<style>` 块，与浏览器里那次判据同源但不同实现） */
function anchorOccurrencesOnDisk(route, anchor) {
  const file = path.join(DIR, route, 'index.html');
  if (!fs.existsSync(file)) return { file: null, occurrencesInStyles: null, occurrencesInFile: null };
  const html = fs.readFileSync(file, 'utf8');
  const styles = html.match(/<style[\s\S]*?<\/style>/g) || [];
  return {
    file: path.relative(ROOT, file).replace(/\\/g, '/'),
    occurrencesInStyles: styles.reduce((sum, block) => sum + (block.split(anchor).length - 1), 0),
    occurrencesInFile: html.split(anchor).length - 1
  };
}
/** M7 用：磁盘上这一页的 <main> 是否**原本就**带 detail-main（注入前提） */
function mainHasDetailMainOnDisk(route) {
  const file = path.join(DIR, route, 'index.html');
  if (!fs.existsSync(file)) return null;
  const tag = /<main\b[^>]*>/.exec(fs.readFileSync(file, 'utf8'));
  if (!tag) return { mainTagFound: false, hasDetailMainClass: null };
  const classHit = /class="([^"]*)"/.exec(tag[0]);
  const classes = classHit ? classHit[1].split(/\s+/).filter(Boolean) : [];
  return { mainTagFound: true, mainTag: tag[0].slice(0, 120), classes: classes.join(' '), hasDetailMainClass: classes.includes('detail-main') };
}
/** M9 用：磁盘上 `<main>` 里到底有几条 `.snote`（静态读数，给"选择器命中几条"做旁证） */
function mainSnoteCountOnDisk(route) {
  const file = path.join(DIR, route, 'index.html');
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf8');
  const main = /<main\b[\s\S]*?<\/main>/.exec(html);
  return main ? (main[0].match(/class="[^"]*\bsnote\b[^"]*"/g) || []).length : null;
}

function readManifest(file) {
  if (!file || !fs.existsSync(file)) return null;
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const hit = /^([0-9a-f]{64}) {2}(.+)$/.exec(line.trim());
    if (hit) map.set(hit[2], hit[1]);
  }
  return map;
}
const before = readManifest(MANIFEST_BEFORE);
const after = readManifest(MANIFEST_AFTER);
let manifestDiff = null;
if (before && after) {
  const changed = [];
  for (const [rel, hash] of before) if (after.get(rel) !== hash) changed.push(rel);
  for (const rel of after.keys()) if (!before.has(rel)) changed.push(`${rel}（新增）`);
  manifestDiff = { files: before.size, changed, identical: changed.length === 0 };
}

/** 条级容器（修复轮 r2 新增）：`metrics.layoutNotes` 的逐条读数，按 route#index 索引 */
const noteRows = Array.isArray(metrics.layoutNotes) ? metrics.layoutNotes : [];
const noteRowsByKey = new Map(noteRows.map(row => [`${row.route}#${row.index}`, row]));

const results = [];
const writeJson = (name, payload) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

for (const row of mutations.rows || []) {
  const checks = checksOf(row.id);
  const guard = checks.find(check => check.name.includes('变异锚点唯一') || check.name.includes('DOM 注入前提'));
  const retest = checks.find(check => check.name.includes('变异后复测'));
  const extra = checks.filter(check => check !== guard && check !== retest)
    .map(check => ({ name: check.name, ok: check.ok, detail: check.detail }));
  const retestDetail = retest ? retest.detail : '';
  const geometry = parseGeometry(retestDetail);
  const narrowKeys = (row.narrowKeys && row.narrowKeys.length) ? row.narrowKeys : (geometry.narrowKeys || []);
  const injectedRule = row.injectedRule || null;
  const targetKind = row.domInjection ? 'dom-injection'
    : (injectedRule ? 'extend（冻结串保留，追加一条收窄规则）' : 'replace（逐字替换）');
  const observed = Array.isArray(row.observed) ? row.observed : (parseObserved(retestDetail) || []);
  const productFile = `dist/${row.route}index.html`;
  const payload = {
    label: LABEL,
    id: row.id,
    route: row.route,
    viewport: row.width,
    what: row.what,
    mutationKind: targetKind,
    anchor: row.anchor || (row.domInjection ? '<main> 加 detail-main（DOM 注入）' : null),
    injectedRule,
    selector: row.selector || null,
    injectedTokenLength: row.injectedTokenLength || 0,
    expect: row.expect,
    observed,
    hit: observed.includes(row.expect),
    /** 条级命中：这一条牙把**哪些** `.snote` 打窄了（`route#index`），以及选择器命中的集合 */
    narrowKeys, matchedKeys: row.matchedKeys || null,
    narrowNoteRows: narrowKeys.map(key => noteRowsByKey.get(key)).filter(Boolean),
    anchorUniqueness: {
      fromVerifySite: /出现 (\d+) 次/.exec(guard ? guard.detail : '') ? Number(/出现 (\d+) 次/.exec(guard.detail)[1]) : null,
      fromDiskStatic: row.anchor ? anchorOccurrencesOnDisk(row.route, row.anchor).occurrencesInStyles : null,
      fromDiskWholeFile: row.anchor ? anchorOccurrencesOnDisk(row.route, row.anchor).occurrencesInFile : null,
      guardPassed: Boolean(guard && guard.ok),
      guardDetail: guard ? guard.detail : null,
      disk: row.anchor ? anchorOccurrencesOnDisk(row.route, row.anchor) : null,
      domInjectionGuard: row.domInjection ? mainHasDetailMainOnDisk(row.route) : null,
      mainSnoteCountOnDisk: mainSnoteCountOnDisk(row.route)
    },
    geometry,
    productSha256: before && after ? { before: before.get(productFile) || null, after: after.get(productFile) || null, equal: before.get(productFile) === after.get(productFile) } : null,
    productFile,
    checks: checks.map(check => ({ name: check.name, ok: check.ok, detail: check.detail })),
    keyChecks: extra,
    source: { report: path.relative(ROOT, REPORT).replace(/\\/g, '/'), mutations: path.relative(ROOT, MUTATIONS).replace(/\\/g, '/') }
  };
  writeJson(`${row.id}.json`, payload);
  results.push(payload);
}

/* M6 正对照（r2 起 control 是 { m6, noInjection } 对象；r1 是平铺的） */
{
  const control = (mutations.control && mutations.control.m6) || mutations.control || {};
  const check = (report.checks || []).find(item => item.name.startsWith('§22c M6 正对照'));
  const payload = {
    label: LABEL,
    id: control.id || 'M6-control',
    route: control.route || 'student/',
    viewport: control.width || 390,
    what: '正对照：同样注入 200 字符不可断串、CSS 一个字节都不动',
    mutationKind: 'control（只注入内容，不改 CSS）',
    expect: control.expect || '不得出现 page-overflow@390',
    observed: control.observed || [],
    hit: (control.observed || []).length === 0,
    anchorUniqueness: { note: '正对照不改锚点，因此没有锚点唯一性断言；它的意义是与 M6 成对' },
    geometry: parseGeometry(check ? check.detail : ''),
    productSha256: null,
    checks: check ? [{ name: check.name, ok: check.ok, detail: check.detail }] : [],
    source: { report: path.relative(ROOT, REPORT).replace(/\\/g, '/'), mutations: path.relative(ROOT, MUTATIONS).replace(/\\/g, '/') }
  };
  writeJson('M6-control.json', payload);
  results.push(payload);
}

/* 修复轮 r2 新增：**不注入**的正对照 —— 四个靶页在对应档位本来没有任何窄码 */
let noInjection = null;
{
  const list = (mutations.control && mutations.control.noInjection) || [];
  noInjection = {
    label: LABEL,
    what: '不注入的正对照：M8/M9a/M9b/M10 的靶页在对应档位**本来**一条窄码都没有（否则"注入后变窄"说明不了问题）',
    rows: list,
    allClean: list.length > 0 && list.every(row => row.noteNarrow === 0 && (row.codes || []).length === 0)
  };
  writeJson('no-injection-control.json', noInjection);
}

/* M5：复用 §22b 的既有牙 */
let m5 = null;
{
  const reuse = mutations.m5Reuse || {};
  const check = (report.checks || []).find(item => item.name.startsWith('§22c M5'));
  m5 = {
    label: LABEL,
    id: 'M5-reuse',
    section: reuse.section || '§22b',
    what: '不重复造第二套：§22b 既有的 M1–M5 确实跑了、逐条咬到期望码',
    assertions: reuse.assertions ?? null,
    failing: reuse.failing ?? null,
    codes: reuse.codes || {},
    expect: { M1: 'center', M2: 'width', M3: 'src-width', M4: 'page-overflow@390', M5: 'leaf-consistency', 'M4-control': '[]（空）' },
    hit: check ? check.ok : null,
    check: check ? { name: check.name, ok: check.ok, detail: check.detail } : null
  };
  writeJson('M5-reuse.json', m5);
}

const sweep = mutations.layoutSweep || {};
const summary = {
  label: LABEL,
  at: new Date().toISOString(),
  source: {
    report: path.relative(ROOT, REPORT).replace(/\\/g, '/'),
    reportTotal: report.total, reportFailed: report.failed,
    mutations: path.relative(ROOT, MUTATIONS).replace(/\\/g, '/'),
    target: mutations.target, dir: mutations.dir, generatedAt: mutations.generatedAt,
    productDir: path.relative(ROOT, DIR).replace(/\\/g, '/'),
    criteria: mutations.criteria || null
  },
  layoutSweep: sweep,
  noteLevelContainer: {
    key: 'metrics.layoutNotes',
    rows: noteRows.length,
    rowsAt1600: Array.isArray(metrics.layoutNotesAt1600) ? metrics.layoutNotesAt1600.length : null,
    everyRowHasRouteIndexCodes: noteRows.length > 0 && noteRows.every(row => Number.isInteger(row.index) && typeof row.route === 'string' && Array.isArray(row.codes)),
    note: '修复轮 r2 新增：条级容器逐条读数（route#index），§22c 的判据不再只看每页第一条'
  },
  rows: results.map(payload => ({
    id: payload.id, route: payload.route, viewport: payload.viewport, expect: payload.expect,
    observed: payload.observed, hit: payload.hit, kind: payload.mutationKind,
    narrowKeys: payload.narrowKeys, matchedKeys: payload.matchedKeys,
    anchorFromVerifySite: payload.anchorUniqueness.fromVerifySite,
    anchorFromDisk: payload.anchorUniqueness.fromDiskStatic,
    geometry: payload.geometry,
    sha256Equal: payload.productSha256 ? payload.productSha256.equal : null
  })),
  zeroDiskPollution: manifestDiff,
  noInjectionControl: noInjection,
  m5Reuse: m5
};
writeJson('M-summary.json', summary);

console.log(`变异读数拆分（label=${LABEL}）：${results.map(row => row.id).join(' ')}`);
for (const payload of results) {
  const geometry = payload.geometry || {};
  console.log(`  ${payload.id} ${payload.route}@${payload.viewport} 期望 ${payload.expect} · 实测 [${payload.observed.join(', ') || '无'}]`
    + ` · 锚点 ${payload.anchorUniqueness.fromVerifySite ?? '—'}/${payload.anchorUniqueness.fromDiskStatic ?? '—'}`
    + ` · 窄条 [${(payload.narrowKeys || []).join(', ') || '—'}]`
    + (geometry.firstNoteTextWidth !== null && geometry.firstNoteTextWidth !== undefined ? ` · 有字区域 ${geometry.firstNoteTextWidth}px` : '')
    + (payload.keyChecks && payload.keyChecks.length ? ` · 要害断言 ${payload.keyChecks.filter(check => check.ok).length}/${payload.keyChecks.length}` : ''));
}
console.log(`条级容器：metrics.layoutNotes ${summary.noteLevelContainer.rows} 行（@1600 ${summary.noteLevelContainer.rowsAt1600}）· 每行带 route/index/codes：${summary.noteLevelContainer.everyRowHasRouteIndexCodes}`);
console.log(`不注入正对照：${noInjection && noInjection.allClean ? '✅ 四个靶页本来都是干净的' : `⚠ ${JSON.stringify(noInjection && noInjection.rows)}`}`);
console.log(`§22c 全站计数：${JSON.stringify(sweep)}`);
console.log(`零磁盘污染：${manifestDiff ? (manifestDiff.identical ? `✅ 前后清单逐字节相同（${manifestDiff.files} 文件）` : `❌ ${manifestDiff.changed.length} 个文件不同：${manifestDiff.changed.slice(0, 5).join(', ')}`) : '（未提供两份清单，缺这一条证据）'}`);
console.log(`写出目录：${path.relative(ROOT, OUT_DIR).replace(/\\/g, '/')}`);
if (SELF_TEST) console.log('（--self-test：只验证解析器，不改变判定）');
