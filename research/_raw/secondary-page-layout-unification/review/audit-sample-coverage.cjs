/** T6 复审 · 复核 §22c 的样本集是否覆盖每一个通配族（760/360 档只量样本集的可见面）。只读。 */
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
}).sort();
const kindOf = route => pageKinds.kindOfRoute(route) || kindByRoute.get(route) || null;
const isWildcard = route => pageKinds.ROUTE_PATTERNS.some(p => p.re.test(route));

const sample = new Set();
for (const p of audienceLib.COLLECTION_PAGES) sample.add(`${p.slug}/`);
for (const p of audienceLib.NEED_PAGES) sample.add(`need/${p.slug}/`);
sample.add(landingsLib.VENDOR_HUB.route);
sample.add(landingsLib.CATEGORY_HUB.route);
for (const r of routes) if (!isWildcard(r)) sample.add(r);
for (const pattern of pageKinds.ROUTE_PATTERNS) {
  if ([...sample].some(r => kindOf(r) === pattern.kind)) continue;
  const hit = routes.find(r => isWildcard(r) && kindOf(r) === pattern.kind);
  if (hit) sample.add(hit);
}
const list = [...sample].sort();
console.log(`ROUTE_PATTERNS 的通配族：${pageKinds.ROUTE_PATTERNS.map(p => p.kind).join(' ')}`);
console.log(`样本集 ${list.length} 条：`);
for (const r of list) console.log(`   ${(r || '/').padEnd(30)} kind=${kindOf(r)} family=${pageKinds.layoutOf(kindOf(r))} wildcard=${isWildcard(r)}`);
const kindsInSample = new Set(list.map(kindOf).filter(Boolean));
const missingKinds = pageKinds.ROUTE_PATTERNS.map(p => p.kind).filter(k => !kindsInSample.has(k));
console.log(`\n样本集覆盖的 kind：${[...kindsInSample].sort().join(' ')}`);
console.log(`通配族未被样本集覆盖的：${missingKinds.length ? missingKinds.join(' ') : '无'}`);
console.log(`样本集里的非通配静态路由：${list.filter(r => !isWildcard(r)).length} 条（磁盘上全部 ${routes.filter(r => !isWildcard(r)).length} 条）`);
