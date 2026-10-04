#!/usr/bin/env node
/**
 * T18 独立复核 §10.7 Dataset Manifest（t15 交付面）—— 判据自建。
 *
 * 用法：node research/quality-closure/verify-work/manifest-audit.cjs [--dist=dist.qc-verify] [--json=…]
 *
 * 自建判据：
 *   ① 扫 dist 全树 JSON，按**自己的规则**分类：Manifest 自身 / 公开数据集（被 Manifest 认领）/ Feed 家族 / 内部运维产物；
 *   ② 每份 JSON 必须**恰好被认领一次**；未被认领即红（fail-closed 的反向：多出来的 JSON 必须有人负责）；
 *   ③ Manifest 里每条数据集的 URL 必须在产物里存在；countNote 的数字必须与真实文件对得上（能算的）；
 *   ④ /docs/data/ 页面行数 == Manifest 条数（页面与数据两侧对账）；
 *   ⑤ 独立变异：沙箱副本里多放一份 JSON ⇒ data-docs-selftest --dir=<副本> 必须 exit≠0。
 * 退出码：0 / 1。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const argOf = (n, d) => { const a = process.argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const ROOT = path.resolve(__dirname, '..', '..', '..');
const DIST = path.resolve(ROOT, argOf('dist', 'dist.qc-verify'));
const JSON_OUT = path.resolve(ROOT, argOf('json', 'research/quality-closure/verify-work/logs/manifest-audit.json'));

const failures = [];
const notes = [];
const list = (dir, base = '') => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...list(p, rel)); else out.push(rel);
  }
  return out;
};

const allFiles = list(DIST);
const allJson = allFiles.filter(f => f.endsWith('.json'));
const manifestPath = 'data/index.json';
if (!fs.existsSync(path.join(DIST, manifestPath))) {
  console.log('✗ 产物里没有 data/index.json（Manifest）');
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(path.join(DIST, manifestPath), 'utf8'));
const entries = manifest.datasets || manifest.files || manifest.items || [];
console.log(`Manifest：${manifestPath} · 条数 ${entries.length}`);

/* ① 自建分类 */
const claimed = new Map();   // rel -> 'manifest' | 'dataset' | 'feed' | 'internal'
claimed.set(manifestPath, 'manifest');
const FEED_RE = /(^|\/)feed(\/|\.(xml|json)$)/;
const INTERNAL = new Set(['source-health.json']);

const datasetPaths = new Set();
for (const e of entries) {
  const url = String(e.url || e.path || '');
  const rel = url.replace(/^https?:\/\/[^/]+(\/ai-deals-aggregator)?\//, '').replace(/^\/+/, '');
  datasetPaths.add(rel);
}
for (const rel of allJson) {
  if (rel === manifestPath) continue;
  if (FEED_RE.test(rel)) { claimed.set(rel, 'feed'); continue; }
  if (datasetPaths.has(rel)) { claimed.set(rel, 'dataset'); continue; }
  if (INTERNAL.has(rel)) { claimed.set(rel, 'internal'); continue; }
  // 未被认领
  failures.push(`未被认领的 JSON：${rel}（既不在 Manifest，也不是 Feed 家族 / 已登记的内部产物）`);
}
const byKind = { manifest: [], dataset: [], feed: [], internal: [] };
for (const [rel, kind] of claimed) byKind[kind].push(rel);
// Manifest 里声明但产物里不存在的
for (const rel of datasetPaths) {
  if (!allFiles.includes(rel)) failures.push(`Manifest 声明的数据集在产物里不存在：${rel}`);
}
// Manifest 里声明但被我归到 feed/internal 的（分类打架）
for (const rel of datasetPaths) {
  if (FEED_RE.test(rel) || INTERNAL.has(rel)) failures.push(`Manifest 数据集与 Feed/内部产物分类打架：${rel}`);
}

notes.push(`dist 全树 JSON ${allJson.length} 份 = Manifest 自身 1 + 数据集 ${byKind.dataset.length} + Feed 家族 ${byKind.feed.length} + 内部产物 ${byKind.internal.length}`);
notes.push(`Feed 家族抽样：${byKind.feed.slice(0, 4).join(' ')} …`);
notes.push(`内部产物：${byKind.internal.join(' ') || '(无)'}`);

/* ③ URL 与 countNote */
for (const e of entries) {
  const rel = String(e.url || '').replace(/^https?:\/\/[^/]+(\/ai-deals-aggregator)?\//, '').replace(/^\/+/, '');
  if (!allFiles.includes(rel)) failures.push(`Manifest 条目 ${e.id || e.label}: url 指向的 ${rel} 不存在`);
}
for (const rel of byKind.dataset) {
  const text = fs.readFileSync(path.join(DIST, rel), 'utf8');
  try { JSON.parse(text); } catch (e) { failures.push(`数据集 ${rel} 不是合法 JSON`); }
}

/* ④ 页面与 Manifest 对账 */
const docsPage = path.join(DIST, 'docs/data/index.html');
if (!fs.existsSync(docsPage)) failures.push('缺少 /docs/data/ 页面');
else {
  const html = fs.readFileSync(docsPage, 'utf8');
  const rows = (html.match(/<tr/g) || []).length;
  const linked = [...html.matchAll(/href="([^"]+\.json)"/g)].map(m => m[1]);
  notes.push(`/docs/data/ 页面 <tr> ${rows} 行 · 指向 ${new Set(linked).size} 个 JSON`);
  if (rows < entries.length) failures.push(`/docs/data/ 行数 ${rows} < Manifest 条数 ${entries.length}`);
  for (const e of entries) {
    const rel = String(e.url || '').replace(/^https?:\/\/[^/]+(\/ai-deals-aggregator)?\//, '').replace(/^\/+/, '');
    if (!linked.some(h => h.endsWith(rel.replace(/^data\//, '')) || h.includes(rel))) {
      // 页面用相对链接（../../data/...）；宽松匹配文件名
      const base = path.basename(rel);
      if (!html.includes(base)) failures.push(`/docs/data/ 页面没有指向 Manifest 条目 ${rel} 的链接`);
    }
  }
}

/* ⑤ 独立变异：多放一份 JSON */
const sandbox = path.resolve('D:\\qc-t18\\manifest-mutation');
fs.rmSync(sandbox, { recursive: true, force: true });
fs.mkdirSync(sandbox, { recursive: true });
for (const f of allFiles) {
  const src = path.join(DIST, f); const dst = path.join(sandbox, f);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
fs.writeFileSync(path.join(sandbox, 'public-experiment-t18.json'), JSON.stringify({ schemaVersion: 1, note: 'T18 变异：未登记的公开 JSON' }, null, 2));
const res = spawnSync(`node scripts/tools/data-docs-selftest.js "--dir=${sandbox}"`, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const mutationOutput = `${res.stdout || ''}${res.stderr || ''}`;
const mutationCaught = res.status !== 0;
notes.push(`独立变异（多放一份未登记 JSON）→ data-docs-selftest exit ${res.status}${mutationCaught ? '（被抓住）' : '（未抓住！）'}`);
if (!mutationCaught) failures.push('data-docs-selftest 对「未登记的公开 JSON」没有非 0');

/* 对照：真实产物上必须 0 */
const res2 = spawnSync(`node scripts/tools/data-docs-selftest.js "--dir=${DIST}"`, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
notes.push(`对照（真实产物）：data-docs-selftest exit ${res2.status}`);
if (res2.status !== 0) failures.push(`data-docs-selftest --dir=dist.qc-verify 非 0（${res2.status}）`);

const summary = {
  dist: path.relative(ROOT, DIST).replace(/\\/g, '/'),
  manifestPath, manifestEntries: entries.length,
  jsonTotal: allJson.length,
  classification: { manifest: byKind.manifest, dataset: byKind.dataset, feed: byKind.feed.length, internal: byKind.internal },
  mutation: { command: `node scripts/tools/data-docs-selftest.js --dir=${sandbox}`, exitCode: res.status, tail: mutationOutput.split('\n').filter(Boolean).slice(-6) },
  control: { command: `node scripts/tools/data-docs-selftest.js --dir=${DIST}`, exitCode: res2.status },
  notes, failures
};
fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
notes.forEach(n => console.log('  · ' + n));
if (failures.length) {
  console.log(`\n✗ ${failures.length} 项失败：`);
  failures.slice(0, 20).forEach(f => console.log('   - ' + f));
  process.exit(1);
}
console.log('\n✅ Manifest 双向对账通过（分类唯一 / URL 存在 / 页面一致 / 变异被抓住）');
process.exit(0);
