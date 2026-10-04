#!/usr/bin/env node
'use strict';
/**
 * t18 · 门禁跑完之后的只读清点：把「Baseline Integrity Diff」要的对账数字一次性算出来。
 * 只读 dist/ 与根数据文件；不写任何生产文件。
 * 产出：research/_raw/coverage-expansion-v1/t18-post-analysis.json
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const WT = path.join(__dirname, '..', '..', '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(WT, rel), 'utf8'));
const baseline = read('research/_raw/coverage-expansion-v1/baseline.json');

const dist = path.join(WT, 'dist');
const files = [];
const walk = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(path.relative(dist, p).split(path.sep).join('/'));
  }
};
walk(dist);
const html = files.filter(f => f.endsWith('.html'));
const byDir = {};
for (const f of html) {
  const seg = f.includes('/') ? f.split('/')[0] : '(root)';
  byDir[seg] = (byDir[seg] || 0) + 1;
}
const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const locByKind = { deal: 0, model: 0, vendor: 0, plans: 0, need: 0, category: 0, other: 0 };
for (const u of locs) {
  if (u.includes('/deal/')) locByKind.deal += 1;
  else if (u.includes('/models/')) locByKind.model += 1;
  else if (u.includes('/vendor/')) locByKind.vendor += 1;
  else if (u.includes('/plans')) locByKind.plans += 1;
  else if (u.includes('/need/')) locByKind.need += 1;
  else if (u.includes('/category')) locByKind.category += 1;
  else locByKind.other += 1;
}

const deals = read('deals.json'), plans = read('plans.json'), api = read('api-plans.json');
const models = read('models.json'), links = read('scripts/data/model-registry-links.json');
const gaps = read('scripts/data/model-registry-gaps.json'), prov = read('scripts/data/providers.json');
const hist = read('scripts/data/deal-history.json'), planHist = read('scripts/data/plan-history.json');
const apiHist = read('scripts/data/api-plan-history.json');
const feedFiles = files.filter(f => f.startsWith('feed/') || f === 'feed.xml' || f === 'feed.json');
const manifest = fs.existsSync(path.join(dist, 'data/index.json')) ? JSON.parse(fs.readFileSync(path.join(dist, 'data/index.json'), 'utf8')) : null;

const out = {
  generatedAt: new Date().toISOString(),
  dist: {
    totalFiles: files.length, html: html.length, byDir,
    baseline: { html: baseline.site.distHtmlPages, files: baseline.site.distTotalFiles, sitemap: baseline.site.sitemapEntries },
    sitemap: locs.length, sitemapByKind: locByKind,
    feeds: feedFiles.length, baselineFeeds: baseline.site.feedFiles,
  },
  data: {
    deals: { total: deals.deals.length, deal: deals.deals.filter(d => d.type === 'deal').length, tool: deals.deals.filter(d => d.type !== 'deal').length },
    plans: { count: plans.plans.length, providers: new Set(plans.plans.map(p => p.provider)).size },
    apiPlans: { count: api.plans.length, providers: new Set(api.plans.map(p => p.provider)).size, items: api.plans.reduce((n, p) => n + (p.models || []).length, 0) },
    models: { published: models.models.length },
    links: { total: links.links.length, api: links.links.filter(l => l.apiPlanId).length, coding: links.links.filter(l => !l.apiPlanId).length },
    gaps: { declarations: gaps.declarations.length },
    providers: Object.keys(prov).filter(k => !k.startsWith('_')).length,
    history: { dealEvents: (hist.events || []).length, planEvents: (planHist.events || []).length, apiPlanEvents: (apiHist.events || []).length },
  },
  baselineData: baseline.data,
  manifest: manifest ? {
    topKeys: Object.keys(manifest),
    datasets: Array.isArray(manifest.datasets) ? manifest.datasets.length : null,
    fileBytes: fs.statSync(path.join(dist, 'data/index.json')).size,
  } : null,
  sha256: {
    deals: crypto.createHash('sha256').update(fs.readFileSync(path.join(WT, 'deals.json'))).digest('hex'),
    sitemap: crypto.createHash('sha256').update(sitemap).digest('hex'),
    modelsJson: crypto.createHash('sha256').update(fs.readFileSync(path.join(WT, 'models.json'))).digest('hex'),
  },
};
fs.writeFileSync(path.join(WT, 'research/_raw/coverage-expansion-v1/t18-post-analysis.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(out, null, 2));
