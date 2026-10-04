// t45（只读）：核对 --json 里的文本部分与纯文本模式是否同源，以及三窗口读数的一致性。
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const OUT = __dirname;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const jsonOut = fs.readFileSync(path.join(OUT, 'report-json-1.txt'), 'utf8');
const textOut = fs.readFileSync(path.join(OUT, 'report-text.txt'), 'utf8');

// 找 policy 块起点（--json 里文本部分的终点）
const at = jsonOut.indexOf('{');
let common = 0;
while (common < Math.min(jsonOut.length, textOut.length) && jsonOut[common] === textOut[common]) common++;
console.log('纯文本模式字节数        :', Buffer.byteLength(textOut), 'sha256', sha(textOut).slice(0, 16));
console.log('--json 的前缀          :', at, '字符处开始第一个 JSON 块');
console.log('两者公共前缀           :', common, '字符');
console.log('--json 前缀是否 == 纯文本（去掉尾部收尾行）:', jsonOut.slice(0, at) === textOut.slice(0, at));
console.log('纯文本模式尾部 120 字   :', JSON.stringify(textOut.slice(-120)));
console.log('--json 前缀尾部 120 字  :', JSON.stringify(jsonOut.slice(Math.max(0, at - 120), at)));
console.log('--json 收尾 120 字      :', JSON.stringify(jsonOut.slice(-120)));

// 关键数字两处是否一致（文本行 vs JSON 值）
const nums = [
  ['Target 行数', /Target 行数\s+(\d+)/, jsonOut],
  ['providers.json 身份数', /providers\.json 身份数\s+(\d+)/, jsonOut],
  ['deals provider', /provider 数（仅 type=deal）\s+(\d+)/, jsonOut]
];
console.log('\n文本与 JSON 同源核对：');
const P = (() => { const t = jsonOut.slice(at); let d = 0, s = false, e = false, end = -1; for (let i = 0; i < t.length; i++) { const c = t[i]; if (s) { if (e) { e = false; continue; } if (c === '\\') { e = true; continue; } if (c === '"') s = false; continue; } if (c === '"') { s = true; continue; } if (c === '{') d++; else if (c === '}') { d--; if (d === 0) { end = i; break; } } } return JSON.parse(t.slice(0, end + 1)); })();
for (const [label, re] of nums) {
  const m = jsonOut.match(re);
  console.log(`  ${label}: 文本=${m ? m[1] : '?'}`);
}
console.log('  JSON: coverageTargets.universe.declared =', P.coverageTargets.universe.declared, '| providersRegistered =', P.coverageTargets.universe.providersRegistered, '| deals.providers =', P.deals.providers);
