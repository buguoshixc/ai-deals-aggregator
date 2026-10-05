// 把 coverage.json 的 coverageTargets 网格打成可读表，便于逐条裁决。
// 用法：node research/_raw/coverage-depth-v1/gap-closure/_grid.js research/_raw/coverage-depth-v1/gap-closure/coverage-live.json
const o = require(require('path').resolve(process.argv[2]));
const ct = o.coverageTargets;
console.log('=== universe ===');
console.log(JSON.stringify(ct.universe));
console.log('=== dimensions ===');
console.log(JSON.stringify(ct.dimensions));
console.log('=== states ===');
console.log(JSON.stringify(ct.states));
console.log('=== counts by state ===');
const by = {};
for (const r of ct.rows) for (const d of ['deals', 'coding', 'api', 'models']) {
  const k = r[d] && r[d].state ? r[d].state : (r[d] === null ? 'NULL' : JSON.stringify(r[d]));
  by[d + ':' + k] = (by[d + ':' + k] || 0) + 1;
}
console.log(JSON.stringify(by, null, 2));
console.log('=== MOISSING/PARTIAL rows ===');
for (const r of ct.rows) {
  const bad = ['deals', 'coding', 'api', 'models'].filter(d => r[d] && (r[d].state === 'MISSING' || r[d].state === 'PARTIAL'));
  if (!bad.length) continue;
  for (const d of bad) {
    console.log(`${r.provider}\t${d}\t${r[d].state}\t${JSON.stringify(r[d])}`);
  }
}
console.log('=== missingTargets ===');
console.log(JSON.stringify(ct.missingTargets, null, 1));
console.log('=== partialTargets ===');
console.log(JSON.stringify(ct.partialTargets, null, 1));
