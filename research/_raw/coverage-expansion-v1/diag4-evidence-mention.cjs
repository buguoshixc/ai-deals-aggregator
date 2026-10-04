/* diag4: would "official-model-id evidence must actually mention the model" flag existing links? (read-only) */
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const apiPlans = require(path.join(ROOT, 'api-plans.json')).plans;
const plans = require(path.join(ROOT, 'plans.json')).plans;
const linksDoc = require(path.join(ROOT, 'scripts', 'data', 'model-registry-links.json'));
const links = Array.isArray(linksDoc) ? linksDoc : linksDoc.links;

const planById = new Map();
for (const p of apiPlans) planById.set(p.id, p);
for (const p of plans) planById.set(p.id, p);
const apiByModelKey = new Map();
for (const p of apiPlans) for (const m of p.models || []) apiByModelKey.set(`${p.id}\u0000${m.modelKey}`, m);

function mentions(quote, needle) {
  if (!quote || !needle) return false;
  return String(quote).toLowerCase().includes(String(needle).toLowerCase());
}

let checked = 0; let flagged = 0;
for (const l of links) {
  if (!l.apiPlanId) continue;
  const plan = planById.get(l.apiPlanId);
  const entry = plan && (plan.models || []).find((m) => m.modelKey === l.modelKey);
  checked += 1;
  if (l.basis === 'explicit-mapping') continue;
  const ev = Array.isArray(l.evidence) ? l.evidence : [];
  const ok = ev.some((e) => mentions(e.quote, l.modelKey)
    || mentions(e.quote, l.registrySlug)
    || (entry && mentions(e.quote, entry.name)));
  if (!ok) {
    flagged += 1;
    console.log(`NO-MENTION ${l.apiPlanId} ${l.modelKey} -> ${l.registrySlug} basis=${l.basis} evQuotes=${ev.map((e) => String(e.quote).slice(0, 40)).join(' | ')}`);
  }
}
console.log(`api links checked=${checked} flagged=${flagged}`);
console.log('\nbasis distribution (api links):');
const dist = {};
for (const l of links.filter((x) => x.apiPlanId)) dist[l.basis] = (dist[l.basis] || 0) + 1;
console.log(JSON.stringify(dist));
