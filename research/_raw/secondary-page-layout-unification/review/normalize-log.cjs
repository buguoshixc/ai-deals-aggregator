/** 把 PowerShell 重定向产生的 UTF-16LE 日志转成 UTF-8（幂等），并可选截取一段。 */
const fs = require('fs');
const file = process.argv[2];
const buf = fs.readFileSync(file);
let text;
if (buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString('utf16le');
else if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) text = buf.slice(3).toString('utf8');
else text = buf.toString('utf8');
text = text.replace(/\r\n/g, '\n');
fs.writeFileSync(file, text, 'utf8');
const from = process.argv[3];
const to = process.argv[4];
if (from) {
  const lines = text.split('\n');
  const start = lines.findIndex(l => l.includes(from));
  const end = to ? lines.findIndex((l, i) => i > start && l.includes(to)) : lines.length;
  console.log(lines.slice(start, end < 0 ? lines.length : end).join('\n'));
}
