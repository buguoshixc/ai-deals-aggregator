/* diag3: proposed bypass tooth (separator-folded exact equality + namespace suffix) over real data */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const reg = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));
const apiPlans = require(path.join(ROOT, 'api-plans.json')).plans;
const table = require(path.join(ROOT, 'scripts', 'data', 'models.json'));
const gaps = require(path.join(ROOT, 'scripts', 'data', 'model-registry-gaps.json'));
const links = require(path.join(ROOT, 'scripts', 'data', 'model-registry-links.json')).links;

function fold(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .replace(/[（(][^（()）]*[)）]\s*$/, '')
    .replace(/[\s\-._/]+/g, '')
    .toLowerCase();
}
const folded = new Map();
for (const [slug, entry] of Object.entries(table)) {
  if (slug.startsWith('_')) continue;
  if (!folded.has(fold(slug))) folded.set(fold(slug), slug);
  for (const alias of (entry.aliases || [])) if (!folded.has(fold(alias))) folded.set(fold(alias), slug);
}
console.log('folded index size', folded.size);

function suffixForms(key) {
  const parts = String(key).split(/[/.]/);
  const out = [];
  for (let i = 1; i < parts.length; i += 1) out.push(parts.slice(i).join('-'));
  return out;
}
function hitsOf(modelKey, name) {
  const hits = [];
  const probe = (label, value) => {
    if (!value) return;
    const hit = folded.get(fold(value));
    if (hit) hits.push(`${label}「${value}」→ ${hit}`);
    for (const s of suffixForms(value)) {
      const h = folded.get(fold(s));
      if (h) hits.push(`${label}后缀「${s}」→ ${h}`);
    }
  };
  probe('modelKey', modelKey);
  probe('name', name);
  return hits;
}

const NEW = ['036c5f09561e', '8a26562011f2', '929a1f3ec46c', '61aa6c3ed3ff'];
console.log('\n=== API-side declarations (19) under proposed tooth ===');
let apiFlag = 0;
for (const d of gaps.declarations.filter((x) => NEW.includes(x.planId))) {
  const plan = apiPlans.find((p) => p.id === d.planId);
  const entry = plan.models.find((m) => m.modelKey === d.modelName);
  const hits = hitsOf(d.modelName, entry && entry.name);
  if (hits.length) apiFlag += 1;
  console.log(`${hits.length ? 'FLAG' : 'ok  '} ${d.planId} ${d.modelName} :: ${hits.join(' ; ')}`);
}
console.log('flagged', apiFlag, '/ 19');

console.log('\n=== collateral: coding-side declarations (42) ===');
let codFlag = 0;
for (const d of gaps.declarations.filter((x) => !NEW.includes(x.planId))) {
  const hits = hitsOf(null, d.modelName);
  if (hits.length) { codFlag += 1; console.log(`FLAG ${d.planId} 「${d.modelName}」 :: ${hits.join(' ; ')}`); }
}
console.log('flagged', codFlag, '/ 42');

console.log('\n=== collateral: existing API links (would a mapping become "matchable", i.e. redundant?) ===');
console.log('existing api links:', links.filter((l) => l.apiPlanId).length);

console.log('\n=== all registry folded keys ===');
console.log([...folded.keys()].sort().join(' '));
