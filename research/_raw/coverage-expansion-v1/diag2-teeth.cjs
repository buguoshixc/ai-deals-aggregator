/* diag2: would the proposed anti-bypass teeth flag any of the 19 declarations? (read-only) */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const reg = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));
const apiPlans = require(path.join(ROOT, 'api-plans.json')).plans;
const table = require(path.join(ROOT, 'scripts', 'data', 'models.json'));
const gaps = require(path.join(ROOT, 'scripts', 'data', 'model-registry-gaps.json'));
const links = require(path.join(ROOT, 'scripts', 'data', 'model-registry-links.json')).links;

const idx = reg.normalizedIndexOf(table);
const NEW = ['036c5f09561e', '8a26562011f2', '929a1f3ec46c', '61aa6c3ed3ff'];

console.log('=== registry slugs (+aliases) ===');
for (const slug of Object.keys(table).sort()) {
  const e = table[slug];
  console.log(`${slug} | ${e.canonicalName} | ${e.developer} | aliases=${JSON.stringify(e.aliases)}`);
}

function suffixForms(key) {
  const out = new Set();
  const parts = String(key).split(/[/.]/);
  for (let i = 1; i < parts.length; i += 1) { out.add(parts.slice(i).join('-')); out.add(parts.slice(i).join('.')); out.add(parts.slice(i).join('')); }
  return [...out];
}

console.log('\n=== proposed teeth over the 19 declarations ===');
const decls = gaps.declarations.filter((d) => NEW.includes(d.planId));
for (const d of decls) {
  const plan = apiPlans.find((p) => p.id === d.planId);
  const entry = plan.models.find((m) => m.modelKey === d.modelName);
  const hits = [];
  const consider = (label, value) => {
    if (!value) return;
    const hit = idx.get(reg.normalizeText(value));
    if (hit) hits.push(`${label}「${value}」→ ${hit}`);
    for (const s of suffixForms(value)) {
      const h2 = idx.get(reg.normalizeText(s));
      if (h2) hits.push(`${label}后缀「${s}」→ ${h2}`);
    }
  };
  consider('modelKey', d.modelName);
  consider('name', entry && entry.name);
  console.log(`${d.planId} ${d.modelName} :: name=${entry ? entry.name : '?'} :: ${hits.length ? hits.join(' ; ') : 'no-hit'}`);
}
console.log('\nmapped:', links.filter((l) => l.apiPlanId && NEW.includes(l.apiPlanId)).map((l) => `${l.modelKey}->${l.registrySlug}`).join(', '));
