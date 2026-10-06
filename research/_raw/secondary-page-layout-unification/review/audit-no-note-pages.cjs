/** T6 复审 · 只读：哪些 wide 族页面没有页面级说明（§22c 对它们「跳过、不算失败」）。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const DIR = path.join(ROOT, process.argv[2] || 'dist');
const pageKinds = require(path.join(ROOT, 'scripts', 'lib', 'page-kinds.js'));
const audienceLib = require(path.join(ROOT, 'scripts', 'lib', 'audience.js'));
const landingsLib = require(path.join(ROOT, 'scripts', 'lib', 'landing.js'));
const kindByRoute = new Map();
for (const p of audienceLib.COLLECTION_PAGES) kindByRoute.set(`${p.slug}/`, 'collection');
for (const p of audienceLib.NEED_PAGES) kindByRoute.set(`need/${p.slug}/`, 'need');
kindByRoute.set(landingsLib.VENDOR_HUB.route, 'hub');
kindByRoute.set(landingsLib.CATEGORY_HUB.route, 'hub');
kindByRoute.set('', 'home');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.toLowerCase() === 'index.html') out.push(full);
  }
  return out;
}
const rows = [];
for (const file of walk(DIR)) {
  const html = fs.readFileSync(file, 'utf8');
  const route = path.relative(DIR, file).split(path.sep).join('/').replace(/index\.html$/, '') || '/';
  const kind = pageKinds.kindOfRoute(route === '/' ? '' : route) || kindByRoute.get(route === '/' ? '' : route) || null;
  const family = kind ? pageKinds.layoutOf(kind) : null;
  const mainStart = html.search(/<main[\s>]/);
  const mainEnd = mainStart < 0 ? -1 : html.indexOf('</main>', mainStart);
  const mainHtml = mainStart < 0 ? '' : html.slice(mainStart, mainEnd < 0 ? html.length : mainEnd);
  const n = (mainHtml.match(/class\s*=\s*"[^"]*\bsnote\b[^"]*"/g) || []).length;
  rows.push({ route, kind, family, notes: n });
}
const wideNoNote = rows.filter(r => r.family === 'wide' && r.notes === 0);
const detailNoNote = rows.filter(r => r.family === 'detail' && r.notes === 0);
console.log(`wide 族里没有 <main> .snote 的页面：${wideNoNote.length} 个 → ${wideNoNote.map(r => r.route + '(' + r.kind + ')').join(' ')}`);
console.log(`detail 族里没有 <main> .snote 的页面：${detailNoNote.length} 个（前 8）→ ${detailNoNote.slice(0, 8).map(r => r.route + '(' + r.kind + ')').join(' ')}`);
console.log(`合计「跳过、不算失败」的页面：${rows.filter(r => r.notes === 0).length}`);
