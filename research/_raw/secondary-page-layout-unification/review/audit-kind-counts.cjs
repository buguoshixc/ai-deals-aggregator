/** T6 复审 · 只读：磁盘路由按 kind / 通配族计数（用产物自己的 page-kinds 声明）。 */
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
const routes = walk(DIR).map(f => {
  const rel = path.relative(DIR, f).split(path.sep).join('/');
  return rel === 'index.html' ? '' : rel.replace(/index\.html$/, '');
});
const kindOf = r => pageKinds.kindOfRoute(r) || kindByRoute.get(r) || null;
const counts = {};
for (const r of routes) {
  const k = kindOf(r) || '(unclassified)';
  counts[k] = (counts[k] || 0) + 1;
}
console.log(`${DIR} 共 ${routes.length} 条路由，按 kind：`);
for (const [k, v] of Object.entries(counts).sort()) console.log(`   ${k.padEnd(16)} ${String(v).padStart(3)}   family=${pageKinds.layoutOf(k)}`);
console.log('ROUTE_PATTERNS（通配族）：');
for (const p of pageKinds.ROUTE_PATTERNS) {
  const hits = routes.filter(r => p.re.test(r)).length;
  console.log(`   ${p.kind.padEnd(16)} 命中磁盘路由 ${String(hits).padStart(3)} 条   family=${pageKinds.layoutOf(p.kind)}`);
}
