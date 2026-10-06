#!/usr/bin/env node
/**
 * secondary-page-layout-unification · 非 HTML 文件**逐个 sha256** 对账（t3 证据）
 *
 * 验收原文：「dist 与 dist.baseline 的 **117 个非 HTML 文件逐个 sha256 相等**（0 个不同）」。
 * 这一支只回答这一个问题，判据不掺任何别的东西：
 *   · 非 HTML 文件集合必须一致（少一个/多一个都算不同）；
 *   · 每个文件两侧的 sha256 必须**逐字相等**（不是"大小相同"，是内容摘要相同）。
 *
 * 输出：
 *   · `<out>.json` —— 每个文件的 { path, before, after, equal }，机器可读；
 *   · `<out>.txt`  —— 同样内容的文字清单（可直接进报告，逐行可核对）。
 *
 * 用法：
 *   node research/_raw/secondary-page-layout-unification/diff/nonhtml-sha256.cjs \
 *        --before=dist.baseline --after=dist \
 *        --out=research/_raw/secondary-page-layout-unification/diff/nonhtml-sha256
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const arg = name => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const resolve = p => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const BEFORE = resolve(arg('before') || 'dist.baseline');
const AFTER = resolve(arg('after') || 'dist');
const OUT = resolve(arg('out') || path.join(ROOT, 'research', '_raw', 'secondary-page-layout-unification', 'diff', 'nonhtml-sha256'));

function walk(dir) {
  const out = new Map();
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) stack.push(relPath);
      else out.set(relPath, path.join(dir, relPath));
    }
  }
  return out;
}
const isHtml = rel => rel.toLowerCase().endsWith('.html');
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const beforeAll = walk(BEFORE);
const afterAll = walk(AFTER);
const before = new Map([...beforeAll].filter(([rel]) => !isHtml(rel)));
const after = new Map([...afterAll].filter(([rel]) => !isHtml(rel)));

const rows = [];
const problems = [];
for (const rel of [...new Set([...before.keys(), ...after.keys()])].sort()) {
  const b = before.has(rel) ? sha(before.get(rel)) : null;
  const a = after.has(rel) ? sha(after.get(rel)) : null;
  const equal = Boolean(b) && b === a;
  rows.push({ path: rel, before: b, after: a, equal });
  if (!equal) {
    problems.push(!b ? `${rel}：after 多出的文件` : !a ? `${rel}：after 缺失的文件`
      : `${rel}：sha256 不同（before ${b.slice(0, 16)}… / after ${a.slice(0, 16)}…）`);
  }
}

const different = rows.filter(row => !row.equal).length;
const report = {
  before: path.relative(ROOT, BEFORE).replace(/\\/g, '/'),
  after: path.relative(ROOT, AFTER).replace(/\\/g, '/'),
  at: new Date().toISOString(),
  algorithm: 'sha256',
  filesBefore: before.size, filesAfter: after.size, compared: rows.length, different,
  rows, problems
};

const lines = [
  `# 非 HTML 文件逐个 sha256 对账`,
  `# before=${report.before}  after=${report.after}`,
  `# compared=${report.compared}  different=${report.different}`,
  `# sha256                                                            path`,
  ...rows.map(row => `${row.equal ? '==' : '<>'} ${(row.after || row.before)}  ${row.path}`)
];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(`${OUT}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
fs.writeFileSync(`${OUT}.txt`, `${lines.join('\n')}\n`, 'utf8');

console.log(`改动前：${report.before}（非 HTML ${before.size} 个）`);
console.log(`改动后：${report.after}（非 HTML ${after.size} 个）`);
console.log(`逐个 sha256 相等：${report.compared - different}/${report.compared} · 不同 ${different} 个`);
if (problems.length) problems.forEach(p => console.log(`   ✗ ${p}`));
console.log(`证据已写出：${path.relative(ROOT, OUT).replace(/\\/g, '/')}.json / .txt`);
process.exit(different ? 1 : 0);
