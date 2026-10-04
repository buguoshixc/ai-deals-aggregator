// t45（只读）：npm 输出从第一条分隔线起是否与直接运行逐字节相同。
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const n = fs.readFileSync(path.join(OUT, 'report-npm-text.txt'), 'utf8');
const d = fs.readFileSync(path.join(OUT, 'report-text.txt'), 'utf8');
const start = n.indexOf('='.repeat(70));
const body = n.slice(start);
console.log('body 起点:', start, '| body bytes:', Buffer.byteLength(body), '| sha256:', sha(Buffer.from(body)).slice(0, 16));
console.log('direct     bytes:', Buffer.byteLength(d), '| sha256:', sha(Buffer.from(d)).slice(0, 16));
console.log('从第一条分隔线起逐字节相同:', body === d);
if (body !== d) { let c = 0; while (c < Math.min(body.length, d.length) && body[c] === d[c]) c++; console.log('首个差异 @', c, JSON.stringify(body.slice(c, c + 60)), '|', JSON.stringify(d.slice(c, c + 60))); }
