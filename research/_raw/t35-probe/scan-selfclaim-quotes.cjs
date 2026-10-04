/* count evidence quotes that contain the self-claim marker 逐字 (offline, read-only) */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');

const files = [
  'deals.json', 'plans.json', 'api-plans.json',
  'scripts/data/curated_deals.json', 'scripts/data/curated_plans.json', 'scripts/data/curated_api_plans.json',
  'scripts/data/deal-history.json', 'scripts/data/plan-history.json', 'scripts/data/api-plan-history.json',
  'scripts/data/models.json', 'model-registry-links.json', 'scripts/data/model-registry-gaps.json'
];

function walk(node, at, out) {
  if (Array.isArray(node)) {
    node.forEach((value, index) => walk(value, `${at}[${index}]`, out));
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'quote' && typeof value === 'string' && value.includes('逐字')) out.push(at);
      walk(value, `${at}.${key}`, out);
    }
  }
  return out;
}

let total = 0;
for (const file of files) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  let doc;
  try { doc = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (error) { console.log(`${file}: parse error ${error.message}`); continue; }
  const hits = walk(doc, '', []);
  if (hits.length) { console.log(`${file}: ${hits.length}`); hits.slice(0, 3).forEach((h) => console.log(`   ${h}`)); total += hits.length; }
}
console.log('total quote-with-逐字:', total);

// also: does any gate assert quotes never self-claim?
const tools = fs.readdirSync(path.join(ROOT, 'scripts', 'tools')).filter((f) => f.endsWith('.js'));
const hitsInTools = tools.filter((f) => fs.readFileSync(path.join(ROOT, 'scripts', 'tools', f), 'utf8').includes('逐字'));
console.log('tools mentioning 逐字:', hitsInTools.join(', ') || '(none)');
