// 一次性工具：从 `npm run report:coverage --json` 的合并输出里抠出 JSON 块。
// 用法：node research/_raw/coverage-depth-v1/gap-closure/_extract.js <raw.txt> <out.json>
const fs = require('fs');

const [, , src, dst] = process.argv;
const buf = fs.readFileSync(src);
// PowerShell 的 `*>` 重定向在本机落的是 UTF-16LE（带 BOM），node 默认按 utf8 读会读到乱码。
let s;
if (buf[0] === 0xff && buf[1] === 0xfe) s = buf.toString('utf16le');
else if (buf[0] === 0xfe && buf[1] === 0xff) s = buf.swap16().toString('utf16le');
else s = buf.toString('utf8').replace(/^\uFEFF/, '');
const i = s.lastIndexOf('JSON:');
if (i < 0) throw new Error('找不到 JSON: 标记');
const a = s.indexOf('{', i);
// JSON 块以行首的 `}` 结束；从末尾往前找最后一个 `\n}` 或 `\r\n}`
const b = Math.max(s.lastIndexOf('\n}'), s.lastIndexOf('\r}'));
if (a < 0 || b < a) throw new Error('找不到 JSON 块边界');
const o = JSON.parse(s.slice(a, b + 2));
fs.writeFileSync(dst, JSON.stringify(o, null, 2));
console.log('keys: ' + Object.keys(o).join(', '));
console.log('bytes: ' + Buffer.byteLength(JSON.stringify(o)));
