'use strict';
/** t21：在基线 SHA 的隔离副本上跑 build-local，并打印**完整**错误（不靠 pwsh 管道过滤）。 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const tmp = process.argv[2] || 'C:/Users/星澈/AppData/Local/Temp/t21-base-1791131730483';
console.log('cwd=' + tmp);
console.log('node_modules junction exists=' + fs.existsSync(path.join(tmp, 'node_modules')));
const r = spawnSync(process.execPath, ['scripts/tools/build-local.js', '--out=base.building'], { cwd: tmp, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000 });
console.log('exit=' + r.status);
console.log('--- stdout tail ---');
console.log(String(r.stdout || '').split('\n').slice(-12).join('\n'));
console.log('--- stderr head ---');
console.log(String(r.stderr || '').split('\n').slice(0, 14).join('\n'));
const dist = path.join(tmp, 'base.building');
if (fs.existsSync(dist)) {
  const walk = d => { let h = 0, a = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { const s = walk(p); h += s.h; a += s.a; } else { a++; if (e.name.endsWith('.html')) h++; } } return { h, a }; };
  const c = walk(dist);
  const sm = fs.existsSync(path.join(dist, 'sitemap.xml')) ? fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8') : '';
  console.log(`COUNTS html=${c.h} files=${c.a} sitemapLoc=${(sm.match(/<loc>/g) || []).length}`);
} else console.log('no dist produced');
