'use strict';
/** t21：为 self-audit 采集「矩阵/计数」所需的最后一组读数。 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const WT = 'D:/OneDrive/Desktop/Code/AI Page/.worktrees/coverage-expansion-v1';
const R = p => JSON.parse(fs.readFileSync(path.join(WT, p), 'utf8'));
const run = (cmd, args) => spawnSync(cmd, args, { cwd: WT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 600000 });

const out = {};
const prov = R('scripts/data/providers.json');
const ct = R('scripts/data/coverage-targets.json');
const plans = R('plans.json'), api = R('api-plans.json'), models = R('models.json');
const links = R('scripts/data/model-registry-links.json'), gaps = R('scripts/data/model-registry-gaps.json');
const sh = R('scripts/data/source-health.json');

out.facts = {
  providers: Object.keys(prov).filter(k => !k.startsWith('_')).length,
  coverageTargetRows: (ct.targets || []).length,
  coverageTargetProviders: [...new Set((ct.targets || []).map(t => t.provider))].length,
  coverageTargetFieldsPerRow: ct.targets && ct.targets.length ? Object.keys(ct.targets[0]) : [],
  plans: plans.plans.length, planProviders: new Set(plans.plans.map(p => p.provider)).size,
  apiPlans: api.plans.length, apiProviders: new Set(api.plans.map(p => p.provider)).size,
  apiModelEntries: api.plans.reduce((n, p) => n + (p.models || []).length, 0),
  registryModels: models.models.length,
  links: (links.links || []).length, apiLinks: (links.links || []).filter(l => l.apiPlanId).length,
  codingLinks: (links.links || []).filter(l => !l.apiPlanId).length,
  gaps: (gaps.declarations || []).length,
  sourceHealth: { count: (sh.sources || []).length, dist: (sh.sources || []).reduce((a, s) => (a[s.status] = (a[s.status] || 0) + 1, a), {}), generatedAt: sh.generatedAt, futurepedia: ((sh.sources || []).find(s => s.source === 'futurepedia') || {}).consecutiveFailures },
  vendorKeyNullProviders: Object.entries(prov).filter(([k, v]) => !k.startsWith('_') && v && !v.vendorKey).map(([, v]) => v.name),
  catalogStatusCensus: models.models.reduce((a, m) => (a[m.catalogStatus] = (a[m.catalogStatus] || 0) + 1, a), {}),
  releasedAtNonNull: models.models.filter(m => m.releasedAt).length,
  freshnessGroupNonNull: models.models.filter(m => m.freshnessGroup).length,
  modelRoleValues: [...new Set(models.models.map(m => m.modelRole))].sort(),
};
out.registeredDomains = Object.fromEntries(Object.entries(prov).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [k, v.officialDomains || null]));

/* 门禁与自测读数（用于矩阵的 Test-Gate 列） */
const gates = {};
for (const [k, args] of Object.entries({
  validateStrict: ['scripts/validate.js', '--strict'],
  checkCi: ['scripts/tools/check-ci-consistency.js'],
  coverageReport: ['scripts/tools/coverage-report.js'],
  coverageTargetsSelftest: ['scripts/tools/coverage-targets-selftest.js'],
  freshnessSelftest: ['scripts/tools/model-freshness-selftest.js'],
  modelRolesSelftest: ['scripts/tools/model-role-vocabulary-selftest.js'],
  modelsSelftest: ['scripts/tools/models-selftest.js'],
  modelsPageSelftest: ['scripts/tools/models-page-selftest.js'],
  vendorPageSelftest: ['scripts/tools/vendor-page-selftest.js'],
  apiPlansSelftest: ['scripts/tools/api-plans-selftest.js'],
  plansSelftest: ['scripts/tools/plans-selftest.js'],
  feedsSelftest: ['scripts/tools/feeds-selftest.js'],
  provenanceSelftest: ['scripts/tools/provenance-selftest.js'],
  dataDocsSelftest: ['scripts/tools/data-docs-selftest.js'],
})) {
  const r = run(process.execPath, args);
  const txt = String(r.stdout || '') + String(r.stderr || '');
  gates[k] = { exit: r.status, last: txt.trim().split('\n').filter(Boolean).slice(-1)[0].slice(0, 160) };
}
out.gates = gates;

/* package.json / action.yml / verify.yml 的口径 */
const pkg = R('package.json');
out.repoCounts = {
  scripts: Object.keys(pkg.scripts).length,
  selftestScripts: Object.keys(pkg.scripts).filter(k => k.startsWith('selftest:')).length,
  gateSteps: fs.readFileSync(path.join(WT, '.github/actions/gate/action.yml'), 'utf8').split('\n').filter(l => /^\s*-\s+name:/.test(l)).length,
};
fs.mkdirSync(path.join(WT, 'research/_raw/t21'), { recursive: true });
fs.writeFileSync(path.join(WT, 'research/_raw/t21/audit-facts.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(out.facts, null, 1));
console.log('vendorKey=null: ' + out.facts.vendorKeyNullProviders.join(' / '));
console.log('gates: ' + Object.entries(gates).map(([k, v]) => k + '=' + v.exit).join(' '));
console.log('repoCounts: ' + JSON.stringify(out.repoCounts));
console.log('registeredDomains(34): ' + JSON.stringify(out.registeredDomains).length + ' chars');
