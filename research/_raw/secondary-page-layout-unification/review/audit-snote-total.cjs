/** T6 复审 · 只读：全站 .snote 元素总量与「进入判据」的比例（<script>/<style> 文本不算 DOM）。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const DIR = path.join(ROOT, process.argv[2] || 'dist');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.toLowerCase() === 'index.html') out.push(full);
  }
  return out;
}
const hist = new Map();
let total = 0; let pages = 0; let judged = 0; const multi = [];
for (const file of walk(DIR)) {
  const raw = fs.readFileSync(file, 'utf8');
  const html = raw.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const start = html.search(/<main[\s>]/);
  const end = start < 0 ? -1 : html.indexOf('</main>', start);
  const mainHtml = start < 0 ? '' : html.slice(start, end < 0 ? html.length : end);
  const n = (mainHtml.match(/class\s*=\s*"[^"]*\bsnote\b[^"]*"/g) || []).length;
  hist.set(n, (hist.get(n) || 0) + 1);
  total += n;
  if (n > 0) { pages += 1; judged += 1; }
  if (n > 1) multi.push([path.relative(DIR, file).split(path.sep).join('/'), n]);
}
console.log(`页面数：${[...hist.values()].reduce((a, b) => a + b, 0)}`);
console.log(`<main> 里 .snote 数量分布：${[...hist.entries()].sort((a, b) => a[0] - b[0]).map(([n, c]) => `${n} 条 → ${c} 页`).join(' · ')}`);
console.log(`.snote 元素总数（DOM 口径）：${total}`);
console.log(`§22c 真正量的（每页文档序第一个）：${judged} 个 ⇒ 覆盖率 ${(judged / total * 100).toFixed(1)}%，未被判几何的 ${total - judged} 个`);
console.log(`多说明页样例（前 12）：${multi.slice(0, 12).map(([r, n]) => `${r}=${n}`).join(' ')}`);
