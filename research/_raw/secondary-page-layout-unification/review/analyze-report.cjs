/**
 * T6 复审 · 读 --json 报告：① 失败项按小节归类；② §22c 的失败原因；③ layoutViolations 与静态清单对账。
 * 用法：node analyze-report.cjs <report.json> [dist|dist.baseline]
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');

const report = JSON.parse(fs.readFileSync(path.resolve(ROOT, process.argv[2]), 'utf8'));
const productDir = process.argv[3] ? path.join(ROOT, process.argv[3]) : null;

const sectionOf = name => {
  const m = name.match(/§(\d+[a-z]?)/);
  if (m) return `§${m[1]}`;
  const m2 = name.match(/^(\d+)\)/);
  return m2 ? `${m2[1]})` : (name.slice(0, 12));
};

const failed = report.checks.filter(c => !c.ok);
const bySection = new Map();
for (const c of failed) {
  const s = sectionOf(c.name);
  bySection.set(s, (bySection.get(s) || 0) + 1);
}
console.log(`报告：${process.argv[2]}`);
console.log(`断言 ${report.total} 项 · 失败 ${report.failed} 项`);
console.log(`失败项按小节：${[...bySection.entries()].map(([s, n]) => `${s}=${n}`).join(' ') || '（无）'}`);
console.log('\n失败项逐条：');
for (const c of failed) console.log(`   ✗ ${c.name.slice(0, 110)}\n        ${String(c.detail).slice(0, 260)}`);

const m = report.metrics;
if (m.layoutSweep) {
  console.log(`\nmetrics.layoutSweep = ${JSON.stringify(m.layoutSweep)}`);
  console.log(`metrics.layoutFrozenRule.pagesExactlyOnce = ${m.layoutFrozenRule.pagesExactlyOnce}/${m.layoutFrozenRule.pagesTotal} · drift(前10) = ${JSON.stringify(m.layoutFrozenRule.drift)}`);
  console.log(`metrics.layoutDataRegions = ${JSON.stringify(m.layoutDataRegions)}`);
  console.log(`metrics.layoutNoteAnchors = ${JSON.stringify(m.layoutNoteAnchors)}`);
  console.log(`metrics.layoutScan = ${JSON.stringify(m.layoutScan)}`);
  console.log(`metrics.layoutViolations：${m.layoutViolations.length} 页`);
  const codeHist = new Map();
  for (const v of m.layoutViolations) for (const code of v.codes) codeHist.set(code, (codeHist.get(code) || 0) + 1);
  console.log(`   违规码分布：${[...codeHist.entries()].map(([c, n]) => `${c}=${n}`).join(' ') || '（无）'}`);
  console.log(`   路由清单：${m.layoutViolations.map(v => (v.route || '/')).join(' ')}`);
  console.log(`metrics.layoutMutationCodes = ${JSON.stringify(m.layoutMutationCodes)}`);
} else {
  console.log('\n（报告里没有 layoutSweep 键 —— 例如 --url= 线上模式）');
}

if (productDir) {
  const FROZEN_70 = /max-width:\s*70ch/;
  function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f, out);
      else if (e.name === 'index.html') out.push(f);
    }
    return out;
  }
  const narrow = [];
  for (const file of walk(productDir)) {
    const html = fs.readFileSync(file, 'utf8');
    const route = path.relative(productDir, file).split(path.sep).join('/').replace(/index\.html$/, '') || '/';
    let styles = '';
    for (const mm of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles += mm[1];
    if (/\.snote[^{}]*\{[^{}]*max-width:\s*70ch/.test(styles)) narrow.push(route);
  }
  console.log(`\n静态清单（${process.argv[3]}）：内联样式里带「.snote … max-width: 70ch」的页面 ${narrow.length} 个`);
  console.log(`   ${narrow.join(' ')}`);
  if (m.layoutViolations) {
    const hit = new Set(m.layoutViolations.filter(v => v.codes.includes('note-narrow')).map(v => v.route || '/'));
    const sameSet = hit.size === narrow.length && narrow.every(r => hit.has(r));
    console.log(`   与报告里 note-narrow 命中集合一致：${sameSet}（报告 ${hit.size} 页）`);
    if (!sameSet) {
      console.log(`   仅在报告：${[...hit].filter(r => !narrow.includes(r)).join(' ')}`);
      console.log(`   仅在静态：${narrow.filter(r => !hit.has(r)).join(' ')}`);
    }
    void FROZEN_70;
  }
}
