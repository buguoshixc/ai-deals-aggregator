// t45（只读）：核对 npm run report:coverage 的 stdout 与直接 node 运行的差别（npm banner）。
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const npm = fs.readFileSync(path.join(OUT, 'report-npm-text.txt'));
const direct = fs.readFileSync(path.join(OUT, 'report-text.txt'));
console.log('npm stdout bytes :', npm.length, 'sha256', sha(npm).slice(0, 16));
console.log('direct  bytes    :', direct.length, 'sha256', sha(direct).slice(0, 16));
const n = npm.toString('utf8'), d = direct.toString('utf8');
console.log('\nnpm stdout 前 200 字:', JSON.stringify(n.slice(0, 200)));
console.log('npm stdout 末尾 100 字:', JSON.stringify(n.slice(-100)));
const idx = n.indexOf('数据覆盖报告');
console.log('\n报告标题在 npm stdout 的位置:', idx);
const body = n.slice(idx);
console.log('从标题起的正文 == 直接运行输出 ?', body === d);
let common = 0; while (common < Math.min(body.length, d.length) && body[common] === d[common]) common++;
console.log('公共前缀长度:', common, '/ direct', d.length);
if (body !== d) {
  console.log('首个差异处 body:', JSON.stringify(body.slice(common, common + 80)));
  console.log('首个差异处 direct:', JSON.stringify(d.slice(common, common + 80)));
}
fs.writeFileSync(path.join(OUT, 'report-npm-body.txt'), n.slice(idx));
console.log('\n已另存 npm 输出的报告正文 → report-npm-body.txt', fs.statSync(path.join(OUT, 'report-npm-body.txt')).size, 'bytes sha256', sha(fs.readFileSync(path.join(OUT, 'report-npm-body.txt'))).slice(0, 16));
