#!/usr/bin/env node
/**
 * coverage-depth-v1：**基线 ID 集合 + 站点产物读数**采集口（只在 cd-baseline 上跑）。
 *
 * 为什么必须现在采：
 *   · 题面 §51 把「既有 model slug / model id / provider key / plan id / api plan id /
 *     deal id 的意外变化」定为 P0。要判「意外变化」，就必须先有一份**基线集合**，
 *     事后再从同一批文件里取集合做双向差 —— 集合关系而不是条数，才不会被数据增长顶翻（§47）。
 *   · 题面 §73/§74 要的 HTML / sitemap / feed / manifest / legacy 路由读数，只有在
 *     **未被本轮改动的树上**构建出来的 dist 才算 Before。
 *
 * 纪律：只在 detached 的 cd-baseline（0 改动、HEAD=ff86368）里运行；产物写到
 * coverage-depth-v1 工作树的 research/_raw/coverage-depth-v1/baseline/。
 *
 * 用法（cwd 必须是 cd-baseline）：
 *   node <coverage-depth-v1>/research/_raw/coverage-depth-v1/baseline/capture-baseline-dist.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const CWD = process.cwd();
const BASELINE_SHA = 'ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8';
const OUT_DIR = process.env.CD_BASELINE_OUT || __dirname;

const readJson = rel => JSON.parse(fs.readFileSync(path.join(CWD, rel), 'utf8'));
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function stableIdSets() {
  const registry = readJson('scripts/data/models.json');
  const published = readJson('models.json');
  const providers = readJson('scripts/data/providers.json');
  const deals = readJson('deals.json');
  const plans = readJson('plans.json');
  const apiPlans = readJson('api-plans.json');
  const links = readJson('scripts/data/model-registry-links.json');
  const targetsDoc = readJson('scripts/data/coverage-targets.json');
  const sortFn = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  return {
    note: '题面 §51 的 P0 基线集合：事后必须做双向差（新增允许、消失必查）',
    registrySlugs: Object.keys(registry).filter(k => !k.startsWith('_')).sort(sortFn),
    publishedModelIds: published.models.map(m => m.id).sort(sortFn),
    publishedModelSlugs: published.models.map(m => m.slug).sort(sortFn),
    providerKeys: Object.keys(providers).filter(k => !k.startsWith('_')).sort(sortFn),
    dealIds: deals.deals.map(d => d.id).sort(sortFn),
    planIds: plans.plans.map(p => p.id).sort(sortFn),
    apiPlanIds: apiPlans.plans.map(p => p.id).sort(sortFn),
    registryLinkIds: (links.links || []).map(l => l.id).filter(Boolean).sort(sortFn),
    coverageTargetProviders: targetsDoc.targets.map(t => t.provider).sort(sortFn),
    coverageTargetSig: sha256(Buffer.from(JSON.stringify(targetsDoc.targets.map(t => [t.provider, t.tier, t.role, t.dimensionIntent, t.currentTargets, t.rulings])), 'utf8'))
  };
}

function dirStats(dir) {
  if (!fs.existsSync(dir)) return null;
  const all = [];
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(next);
      else all.push(next);
    }
  };
  walk('');
  all.sort();
  return all;
}

function main() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: CWD, encoding: 'utf8' }).stdout.trim();
  const dirty = spawnSync('git', ['status', '--porcelain=v1'], { cwd: CWD, encoding: 'utf8' }).stdout.trim();
  if (head !== BASELINE_SHA || dirty) {
    console.error(`❌ 基线工作树不满足前提（head=${head}, dirty=${dirty ? dirty.split('\n').length : 0}）`);
    process.exit(1);
  }

  const summary = { capturedAt: new Date().toISOString(), baselineSha: BASELINE_SHA, cwd: CWD };

  /* ---- ① Stable ID 集合（纯读数据，不依赖构建） ---- */
  const ids = stableIdSets();
  fs.writeFileSync(path.join(OUT_DIR, 'stable-ids.json'), `${JSON.stringify(ids, null, 2)}\n`, 'utf8');
  summary.stableIds = Object.fromEntries(Object.entries(ids)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => [k, { count: v.length, sha256OfSortedList: sha256(Buffer.from(v.join('\n'), 'utf8')) }]));
  summary.stableIds.coverageTargetSig = ids.coverageTargetSig;

  /* ---- ② 站点产物：在基线树上构建一次 ---- */
  const buildLog = path.join(OUT_DIR, 'baseline-build.log');
  const fd = fs.openSync(buildLog, 'w');
  const build = spawnSync(process.execPath, ['scripts/tools/build-local.js'], {
    cwd: CWD, stdio: ['ignore', fd, fd], maxBuffer: 512 * 1024 * 1024
  });
  fs.closeSync(fd);
  summary.build = { exitCode: build.status, log: path.basename(buildLog) };

  const dist = path.join(CWD, 'dist');
  const files = dirStats(dist);
  summary.dist = {
    totalFiles: files ? files.length : 0,
    htmlFiles: files ? files.filter(f => f.endsWith('.html')).length : 0,
    jsonFiles: files ? files.filter(f => f.endsWith('.json')).length : 0,
    modelDetailRoutes: files ? files.filter(f => /^models\/[^/]+\/index\.html$/.test(f)).length : 0
  };

  if (files) {
    fs.writeFileSync(path.join(OUT_DIR, 'dist-file-list.txt'), `${files.join('\n')}\n`, 'utf8');
    summary.dist.fileListSha256 = sha256(Buffer.from(files.join('\n'), 'utf8'));

    const sitemapFile = path.join(dist, 'sitemap.xml');
    if (fs.existsSync(sitemapFile)) {
      const sitemap = fs.readFileSync(sitemapFile, 'utf8');
      const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort();
      fs.writeFileSync(path.join(OUT_DIR, 'sitemap-urls.txt'), `${urls.join('\n')}\n`, 'utf8');
      summary.dist.sitemapUrls = urls.length;
      summary.dist.sitemapSha256 = sha256(fs.readFileSync(sitemapFile));
      summary.dist.sitemapModelUrls = urls.filter(u => u.includes('/models/')).length;
      summary.dist.sitemapHasLegacyModel = urls.some(u => /\/models\/deepseek-v3\.2\/?$/.test(u));
    }
    for (const [label, rel] of [['feedXml', 'feed.xml'], ['feedJson', 'feed.json'], ['datasetManifest', 'data/index.json']]) {
      const p = path.join(dist, rel);
      if (!fs.existsSync(p)) { summary.dist[label] = null; continue; }
      const buf = fs.readFileSync(p);
      summary.dist[label] = { bytes: buf.length, sha256: sha256(buf) };
      if (label === 'feedXml') summary.dist.feedEntries = (buf.toString('utf8').match(/<entry>/g) || []).length;
      if (label === 'feedJson') {
        const doc = JSON.parse(buf.toString('utf8'));
        summary.dist.feedJsonItems = (doc.items || []).length;
      }
      if (label === 'datasetManifest') {
        const doc = JSON.parse(buf.toString('utf8'));
        summary.dist.datasetManifestEntries = (doc.datasets || []).length;
        summary.dist.datasetManifestIds = (doc.datasets || []).map(d => d.id).sort();
      }
    }
    const legacy = path.join(dist, 'models', 'deepseek-v3.2', 'index.html');
    summary.dist.legacyDetailRouteExists = fs.existsSync(legacy);
    if (fs.existsSync(legacy)) summary.dist.legacyDetailRouteSha256 = sha256(fs.readFileSync(legacy));
    const modelsHub = path.join(dist, 'models', 'index.html');
    if (fs.existsSync(modelsHub)) summary.dist.modelsHubSha256 = sha256(fs.readFileSync(modelsHub));
    const home = path.join(dist, 'index.html');
    if (fs.existsSync(home)) summary.dist.homeSha256 = sha256(fs.readFileSync(home));
  }

  fs.writeFileSync(path.join(OUT_DIR, 'baseline-dist.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\n✅ 基线产物读数已写出：baseline-dist.json（构建 exit=${build.status}）`);
  return build.status === 0 ? 0 : 1;
}

process.exit(main());
