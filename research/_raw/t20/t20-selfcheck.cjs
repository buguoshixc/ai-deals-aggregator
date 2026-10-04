// t20：三份交付物自检（只读）
// ① 报告十九节齐全 ② catalogStatus 与 report:coverage 一致 ③ 两份调查文档与生产数据一致
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha = rel => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');

const out = [];
const say = line => out.push(String(line));
let fail = 0;
const check = (name, ok, detail = '') => { say(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` —— ${detail}`}`); if (!ok) fail++; };

/* ① 报告十九节 */
const report = read('research/coverage-expansion-v1-report.md');
const SECTIONS = ['Baseline', 'Before → After', 'Coverage Architecture', 'Provider Universe', '12 家 Candidate Review',
  'Coding Review', 'Model Freshness', 'Currentness Migration', 'Coverage Results', 'Data Added', 'Data Not Added',
  'Source Health', 'Reproducibility', 'Gate', 'CI / Deploy', 'Online Smoke', 'Data Integrity',
  'Page-level evidence', 'Remaining Risks'];
const headings = [...report.matchAll(/^##\s+(\d+)\.\s+(.+)$/gm)].map(m => ({ n: Number(m[1]), title: m[2].trim() }));
say(`报告节数：${headings.length}`);
for (const [index, name] of SECTIONS.entries()) {
  const found = headings.some(h => h.n === index + 1);
  check(`第 ${index + 1} 节「${name}」在位`, found);
}
check('小节编号 1..19 连续', headings.map(h => h.n).join(',') === Array.from({ length: 19 }, (_, i) => i + 1).join(','), headings.map(h => h.n).join(','));

/* ② catalogStatus 与 report:coverage 一致 */
const models = JSON.parse(read('models.json'));
const dist = {};
for (const model of models.models) dist[model.catalogStatus] = (dist[model.catalogStatus] || 0) + 1;
const reportRun = spawnSync(process.execPath, ['scripts/tools/coverage-report.js', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 27 });
const stdout = reportRun.stdout || '';
const censusLine = stdout.split(/\r?\n/).find(line => /catalogStatus 普查/.test(line)) || '';
say(`report:coverage 普查行：${censusLine.trim().slice(0, 160)}`);
const censusNumbers = Object.fromEntries(['current', 'aging', 'legacy', 'historical', 'unknown']
  .map(key => [key, Number((new RegExp(`${key} (\\d+)`).exec(censusLine) || [])[1])]));
check('models.json 五态与 report:coverage 文本行逐项一致',
  ['current', 'aging', 'legacy', 'historical', 'unknown'].every(key => (dist[key] || 0) === censusNumbers[key]),
  `models.json ${JSON.stringify(dist)} vs 报告 ${JSON.stringify(censusNumbers)}`);
check('报告里写的分布串与现场一致',
  report.includes('current 3 · aging 0 · legacy 1 · historical 0 · unknown 40'),
  '报告里的分布串与现场不一致');

/* ③ 两份调查文档 */
for (const rel of ['research/coverage-expansion-v1-provider-review.md', 'research/coverage-expansion-v1-model-currentness.md']) {
  const text = read(rel);
  say(`\n--- ${rel} · ${Buffer.byteLength(text)} 字节 · sha256 ${sha(rel).slice(0, 16)}`);
  const has44 = /44/.test(text);
  say(`  含「44」：${has44} · 含五态串：${text.includes('unknown') && text.includes('legacy')} · 含 2026-09-10：${text.includes('2026-09-10')}`);
}
const currentness = JSON.parse(read('research/_raw/coverage-expansion-v1/currentness.json'));
const sourceModels = JSON.parse(read('scripts/data/models.json'));
const sourceSlugs = Object.keys(sourceModels).filter(key => !key.startsWith('_'));
const currentnessSlugs = Object.keys(currentness.models || {});
const dated = sourceSlugs.filter(slug => sourceModels[slug].releasedAt);
check('currentness.json 44 行与来源层 44 键一致', currentnessSlugs.length === 44 && sourceSlugs.length === 44,
  `${currentnessSlugs.length}/${sourceSlugs.length}`);
check('来源层带官方日期的只有 4 条', dated.length === 4, `${dated.length}`);
say(`\n来源层 dated：${dated.map(slug => `${slug}@${sourceModels[slug].releasedAt}`).join(' · ')}`);

say(`\n${fail ? `❌ 自检失败 ${fail} 项` : '✅ 自检全部通过'}`);
fs.writeFileSync(path.join(__dirname, 't20-selfcheck.txt'), out.join('\n') + '\n', 'utf8');
process.stdout.write(out.join('\n') + '\n');
process.exit(fail ? 1 : 0);
