#!/usr/bin/env node
/**
 * T23 再审计专用：三项独立重做 + 两类「把判定写死」的结构变异。
 *
 * 用法：node research/quality-closure/reauth-work/reauth-probe.cjs [--gold=D:\qc-t23\gold] [--json=out.json]
 *
 * A. M19 形状变异（T25 面）：把模型页两行三格价格对调（行身份/行数/单位文案不变）→
 *    期望**生产门禁自己**判红并点名到格（models-page-selftest --dir=<变异产物>）。
 * B. 硬写判定（captain 提醒）：
 *    R1 registry：把 sourcePricingIdentitiesOf 的返回写死 ⇒ 期望 models-selftest / links-check / validate 红
 *    R2 health：把 headlessReady 写死成恒 true ⇒ 期望 health-selftest 红
 * C. t15 Manifest 双向口径（自己数）：Manifest 9 份 · dist 全树 JSON 36 = 根级 11 + data/index.json 1 + feed/ 24 ·
 *    Feed 家族文件 48 = 24 JSON + 24 XML · /feeds/ 页面唯一订阅地址 == 48（另有 2 条 rel=alternate 单独计）。
 * D. t17 fail-closed：空产物 6/6 非 0 · --allow-missing-dist 6/6 exit 0 且带 OPTIONAL DIAGNOSTIC · 真实产物 6/6 绿。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROOT = path.resolve(__dirname, '..', '..', '..');
const GOLD = path.resolve(argOf('gold', 'D:\\qc-t23\\gold'));
const WORK = path.resolve(argOf('work', 'D:\\qc-t23\\cases'));
const JSON_OUT = path.resolve(ROOT, argOf('json', 'research/quality-closure/reauth-work/logs/reauth-probe.json'));
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';

const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run = (cmd, cwd) => {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, DSH_BASH: GIT_BASH } });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  return { exit: r.status, out, hits: out.split('\n').map(l => l.trim()).filter(l => /✗|❌|失败|问题|格「|漂移/.test(l)).slice(0, 4) };
};
function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.qc-') || e.name.startsWith('dist.qc-')) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    const st = fs.lstatSync(s);
    if (st.isSymbolicLink()) { try { fs.symlinkSync(fs.readlinkSync(s), d, 'junction'); } catch {} continue; }
    if (st.isDirectory()) cpDir(s, d); else { try { fs.copyFileSync(s, d); } catch (err) { if (err.code !== 'EPERM') throw err; } }
  }
}
const results = { A: null, B: [], C: {}, D: [] };

/* ---------- A. M19 形状变异（T25 面） ---------- */
{
  const dir = path.join(WORK, 'A-m19-shape');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  cpDir(GOLD, dir);                     // 完整副本（代码 + 数据 + dist），否则跑不了门禁
  const file = path.join(dir, 'dist/models/glm-4.5v/index.html');
  const html = fs.readFileSync(file, 'utf8');
  const before = sha(file);
  const rows = [...html.matchAll(/<tr class="mapirow"[\s\S]*?<\/tr>/g)];
  const values = rows.map(r => [...r[0].matchAll(/<td class="num">([^<]*)<\/td>/g)].map(m => m[1]));
  let next = html;
  rows.forEach((r, i) => {
    const other = values[(i + 1) % values.length];
    let k = 0;
    const replaced = r[0].replace(/<td class="num">[^<]*<\/td>/g, () => `<td class="num">${other[k++]}</td>`);
    next = next.replace(r[0], replaced);
  });
  fs.writeFileSync(file, next);
  const after = sha(file);
  const gate = run('node scripts/tools/models-page-selftest.js --dir=dist', dir);
  const joinAudit = run('node research/quality-closure/verify-work/join-audit.cjs --dist=dist', dir);
  results.A = {
    mutation: 'glm-4.5v 两行三格价格对调（data-item/data-variant/行数/单位文案不变）',
    file: 'dist/models/glm-4.5v/index.html', shaBefore: before, shaAfter: after,
    productionGate: { command: 'node scripts/tools/models-page-selftest.js --dir=dist（生产门禁）', exit: gate.exit, hits: gate.hits },
    myJoinAudit: { command: 'node research/quality-closure/verify-work/join-audit.cjs --dist=dist（自写独立）', exit: joinAudit.exit, hits: joinAudit.hits }
  };
  console.log(`A. T25-M19 形状变异：生产门禁 exit=${gate.exit}${gate.hits.length ? ' :: ' + gate.hits[0].slice(0, 160) : ''}`);
}

/* ---------- B. 把判定写死 ---------- */
const hardwire = [
  {
    id: 'R1-registry-hardwired',
    file: 'scripts/lib/model-registry.js',
    apply: (root) => {
      const f = path.join(root, 'scripts/lib/model-registry.js');
      const t = fs.readFileSync(f, 'utf8');
      const anchor = 'function sourcePricingIdentitiesOf(link, apiPlans) {';
      if (!t.includes(anchor)) throw new Error('锚点没找到');
      const mutated = t.replace(anchor, `${anchor}\n  // T23 R1 变异：把判定写死（永远返回同一条 identity）\n  if (link && link.registrySlug) return { identities: [{ apiPlanId: 'x', modelKey: 'y', variant: 'standard' }], expanded: false, unresolved: false };`);
      fs.writeFileSync(f, mutated);
    },
    gates: [
      ['models-selftest', 'node scripts/tools/models-selftest.js'],
      ['check-model-registry-links', 'node scripts/tools/check-model-registry-links.js'],
      ['validate-strict', 'node scripts/validate.js --strict']
    ]
  },
  {
    id: 'R2-health-hardwired',
    file: 'scripts/lib/health.js',
    apply: (root) => {
      const f = path.join(root, 'scripts/lib/health.js');
      const t = fs.readFileSync(f, 'utf8');
      const anchor = 'function headlessReady({ isHeadless = false, browserStatus = null, errorCode = null } = {}) {';
      if (!t.includes(anchor)) throw new Error('锚点没找到');
      fs.writeFileSync(f, t.replace(anchor, `${anchor}\n  return true;   // T23 R2 变异：把判定写死成「永远就绪」`));
    },
    gates: [
      ['health-selftest', 'node scripts/tools/health-selftest.js']
    ]
  }
];
for (const h of hardwire) {
  const dir = path.join(WORK, h.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  cpDir(GOLD, dir);
  const target = path.join(dir, h.file);
  const before = sha(target);
  h.apply(dir);
  const after = sha(target);
  const gates = h.gates.map(([name, cmd]) => { const r = run(cmd, dir); return { name, command: cmd, exit: r.exit, hits: r.hits }; });
  fs.copyFileSync(path.join(GOLD, h.file), target);   // 文件级恢复
  const restored = sha(target) === before;
  results.B.push({ id: h.id, file: h.file, shaBefore: before, shaAfter: after, gates, restoredByteExact: restored });
  console.log(`B. ${h.id}：${gates.map(g => `${g.name}=${g.exit}`).join(' · ')} · 恢复BYTE-EXACT=${restored}`);
}

/* ---------- C. Manifest / Feed 口径（自己数） ---------- */
{
  const dist = path.join(GOLD, 'dist');
  const list = (d, b = '') => {
    const out = [];
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = b ? `${b}/${e.name}` : e.name;
      const p = path.join(d, e.name);
      if (e.isDirectory()) out.push(...list(p, r)); else out.push(r);
    }
    return out;
  };
  const all = list(dist);
  const json = all.filter(f => f.endsWith('.json'));
  const rootJson = json.filter(f => !f.includes('/'));
  const dataIdx = json.filter(f => f === 'data/index.json');
  const feedJson = json.filter(f => f.startsWith('feed/'));
  const other = json.filter(f => !rootJson.includes(f) && f !== 'data/index.json' && !f.startsWith('feed/'));
  const feedXml = all.filter(f => f.startsWith('feed/') && f.endsWith('.xml'));
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'data/index.json'), 'utf8'));
  const entries = manifest.datasets || [];
  const feedsPage = fs.readFileSync(path.join(dist, 'feeds/index.html'), 'utf8');
  const hrefs = [...feedsPage.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  const feedHrefs = hrefs.filter(h => /feed\.(xml|json)$/.test(h) || /\/feed\//.test(h));
  const perFeedHrefs = feedHrefs.filter(h => /\/feed\//.test(h));
  const rootFeedHrefs = feedHrefs.filter(h => !/\/feed\//.test(h));
  const relAlternate = [...feedsPage.matchAll(/rel="alternate"[^>]*href="([^"]+)"/g)].map(m => m[1]);
  results.C = {
    manifestEntries: entries.length,
    distJsonTotal: json.length,
    byBucket: { rootLevel: rootJson.length, dataIndex: dataIdx.length, feedDir: feedJson.length, other: other.length },
    feedFamilyFiles: feedJson.length + feedXml.length,
    feedJsonFiles: feedJson.length, feedXmlFiles: feedXml.length,
    feedsPagePerFeedUnique: new Set(perFeedHrefs).size,
    feedsPageRootFeedUnique: new Set(rootFeedHrefs).size,
    feedsPageFeedHrefUnique: new Set(feedHrefs).size,
    feedsPageRelAlternate: relAlternate.length,
    feedsPageRelAlternateHrefs: relAlternate,
    rootJsonFiles: rootJson.sort(),
    otherJsonFiles: other
  };
  console.log(`C. Manifest ${entries.length} 份 · dist JSON ${json.length} = 根级 ${rootJson.length} + data/index.json ${dataIdx.length} + feed/ ${feedJson.length} + 其它 ${other.length} · Feed 文件 ${feedJson.length + feedXml.length}（JSON ${feedJson.length} + XML ${feedXml.length}） · /feeds/ 子订阅唯一地址 ${new Set(perFeedHrefs).size} · 根订阅 href ${new Set(rootFeedHrefs).size}（相对+绝对两种写法） · rel=alternate ${relAlternate.length}`, );
}

/* ---------- D. t17 fail-closed ---------- */
{
  const empty = path.join(WORK, 'D-empty-dist');
  fs.rmSync(empty, { recursive: true, force: true });
  fs.mkdirSync(empty, { recursive: true });
  const tools = ['archive-selftest', 'data-docs-selftest', 'models-page-selftest', 'planshub-selftest', 'vendor-page-selftest', 'check-feeds-reproducible'];
  const dir = path.join(WORK, 'D-run');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  cpDir(GOLD, dir);
  for (const t of tools) {
    const r = run(`node scripts/tools/${t}.js "--dir=${empty}"`, dir);
    const marked = /OPTIONAL DIAGNOSTIC/.test(r.out);
    const r2 = run(`node scripts/tools/${t}.js "--dir=${empty}" --allow-missing-dist`, dir);
    const r3 = run(`node scripts/tools/${t}.js --dir=dist`, dir);
    results.D.push({ tool: t, emptyDistExit: r.exit, allowMissingExit: r2.exit, allowMissingMarked: /OPTIONAL DIAGNOSTIC/.test(r2.out), realDistExit: r3.exit });
  }
  console.log('D. fail-closed：' + results.D.map(x => `${x.tool.replace('-selftest', '')}(空=${x.emptyDistExit},放行=${x.allowMissingExit}${x.allowMissingMarked ? '/标注' : ''},真=${x.realDistExit})`).join(' · '));
}

fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify(results, null, 2));
const bad = [];
if (!(results.A.productionGate.exit !== 0 && results.A.productionGate.hits.some(h => h.includes('格「')))) bad.push('A：生产门禁没有判红或没有点名到格');
for (const b of results.B) for (const g of b.gates) if (g.exit === 0) bad.push(`${b.id}：${g.name} 期望非 0，实测 0`);
if (!results.B.every(b => b.restoredByteExact)) bad.push('B：恢复不是逐字节一致');
if (results.C.manifestEntries !== 9 || results.C.distJsonTotal !== 36 || results.C.byBucket.rootLevel !== 11 || results.C.byBucket.dataIndex !== 1 || results.C.byBucket.feedDir !== 24) bad.push('C：JSON 口径不符（9/36/11/1/24）');
if (results.C.feedFamilyFiles !== 48) bad.push(`C：Feed 文件 ${results.C.feedFamilyFiles} ≠ 48`);
if (results.C.feedsPagePerFeedUnique !== 48) bad.push(`C：/feeds/ 子订阅唯一地址 ${results.C.feedsPagePerFeedUnique} ≠ 48`);
if (results.C.feedsPageRelAlternate !== 2) bad.push(`C：/feeds/ rel=alternate ${results.C.feedsPageRelAlternate} ≠ 2`);
for (const d of results.D) {
  if (d.emptyDistExit === 0) bad.push(`D：${d.tool} 缺产物 exit 0`);
  if (d.allowMissingExit !== 0 || !d.allowMissingMarked) bad.push(`D：${d.tool} --allow-missing-dist 未放行或未标注`);
  if (d.realDistExit !== 0) bad.push(`D：${d.tool} 真实产物 exit ${d.realDistExit}`);
}
console.log(bad.length ? `\n✗ ${bad.length} 项不符：\n   - ${bad.join('\n   - ')}` : '\n✅ A/B/C/D 全部符合预期');
process.exit(bad.length ? 1 : 0);
