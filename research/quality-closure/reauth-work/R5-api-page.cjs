#!/usr/bin/env node
/**
 * T23 现场诊断：`/plans/api/` 页面的逐格数值有没有门禁（T20-N2 的同类面）。
 *
 * 变异：把**现场产物** dist/plans/api/index.html 某一行的「输入价」格改成明显错误值
 *      （行 data-item / 行数 / 列结构不变）。
 * 期望（若该面有守卫）：至少一道**生产门禁**非 0 并点名该行/该格。
 * 跑的门禁：api-plans-selftest · models-page-selftest(--dir=dist) · seo-verify(--dir=dist) ·
 *           data-docs-selftest(--dir=dist) · verify-site(--dir=dist，真浏览器) · MY join-audit
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const GOLD = 'D:\\qc-t23\\gold';
const DIR = 'D:\\qc-t23\\extra\\R5-api-page';
const OUT = path.resolve(__dirname, 'logs', 'R5-api-page.json');
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run = (cmd, cwd) => {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, DSH_BASH: GIT_BASH } });
  return { exit: r.status, out: `${r.stdout || ''}\n${r.stderr || ''}` };
};
function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.qc-') || e.name.startsWith('dist.qc-')) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    const st = fs.lstatSync(s);
    if (st.isSymbolicLink()) { try { fs.symlinkSync(fs.readlinkSync(s), d, 'junction'); } catch {} continue; }
    if (st.isDirectory()) cpDir(s, d); else { try { fs.copyFileSync(s, d); } catch (err) { if (err.code !== 'EPERM') throw err; } }
  }
}
fs.rmSync(DIR, { recursive: true, force: true });
cpDir(GOLD, DIR);
const page = path.join(DIR, 'dist/plans/api/index.html');
const html = fs.readFileSync(page, 'utf8');
const before = sha(page);
const rowMatch = html.match(/<tr data-item="[^"]*"[\s\S]*?<\/tr>/);
const row = rowMatch[0];
const mutatedRow = row.replace(/(<td class="num">)([^<]*)(<\/td>)/, '$1¥999999$3');
const mutated = html.replace(row, mutatedRow);
fs.writeFileSync(page, mutated);
const after = sha(page);
console.log('变异：第一个 data-item 行的输入价 → ¥999999');
console.log('  行摘要：', mutatedRow.replace(/\s+/g, ' ').slice(0, 200));
console.log('  sha', before.slice(0, 12), '→', after.slice(0, 12), '· 变了：', before !== after);

const GATES = [
  ['api-plans-selftest', 'node scripts/tools/api-plans-selftest.js'],
  ['models-page-selftest --dir=dist', 'node scripts/tools/models-page-selftest.js --dir=dist'],
  ['seo-verify --dir=dist', 'node scripts/tools/seo-verify.js --dir=dist'],
  ['data-docs-selftest --dir=dist', 'node scripts/tools/data-docs-selftest.js --dir=dist'],
  ['verify-site --dir=dist（真浏览器）', 'node scripts/tools/verify-site.js --dir=dist'],
  ['MY join-audit --dist=dist', 'node research/quality-closure/verify-work/join-audit.cjs --dist=dist']
];
const results = [];
for (const [name, cmd] of GATES) {
  const t0 = Date.now();
  const r = run(cmd, DIR);
  const hits = r.out.split('\n').map(l => l.trim()).filter(l => /✗|❌|失败|不一致|漂移/.test(l)).slice(0, 2);
  results.push({ name, command: cmd, exit: r.exit, ms: Date.now() - t0, hits });
  console.log(`${r.exit === 0 ? 'GREEN' : 'RED  '} ${name.padEnd(38)} exit=${r.exit}${hits.length ? ' :: ' + hits[0].slice(0, 140) : ''}`);
}
fs.copyFileSync(path.join(GOLD, 'dist/plans/api/index.html'), page);
const restored = sha(page) === before;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const caught = results.filter(r => r.exit !== 0);
fs.writeFileSync(OUT, JSON.stringify({ mutation: 'dist/plans/api/index.html 第一行输入价 → ¥999999', shaBefore: before, shaAfter: after, restoredByteExact: restored, caught, results }, null, 2));
console.log(`\n抓到的门禁：${caught.length ? caught.map(c => c.name).join(' / ') : '（无 —— 这是一个未覆盖的面）'} · 恢复逐字节=${restored}`);
process.exit(caught.length ? 0 : 2);
