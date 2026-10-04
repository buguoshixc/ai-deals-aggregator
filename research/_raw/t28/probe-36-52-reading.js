'use strict';
/**
 * t28 · 两个旧读数（36 / 52）的口径复现探针。
 * 只在 git HEAD 快照与当前盘上数据上做**只读**测算，不写任何生产文件。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const show = rel => JSON.parse(execFileSync('git', ['-C', ROOT, 'show', 'HEAD:' + rel], { encoding: 'utf8' }));
const disk = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const lower = s => String(s === null || s === undefined ? '' : s).toLowerCase();
const quotesOf = link => (Array.isArray(link.evidence) ? link.evidence : [])
  .map(e => (e && typeof e.quote === 'string' ? e.quote : '')).filter(Boolean);
const apiSide = l => Boolean(l && l.apiPlanId);

function ruleCount(linksDoc, apiDoc, opts = {}) {
  const { useName = true, useSlug = true, caseSensitive = false, includeExplicit = false, requireQuote = false } = opts;
  const nameByKey = new Map();
  for (const plan of apiDoc.plans || []) {
    for (const m of plan.models || []) nameByKey.set(`${plan.id}\u0000${m.modelKey}\u0000${m.variant}`, m.name || '');
  }
  return (linksDoc.links || []).filter(link => {
    if (!apiSide(link)) return false;
    if (!includeExplicit && String(link.basis || '') === 'explicit-mapping') return false;
    const quotes = quotesOf(link);
    if (requireQuote && quotes.length === 0) return false;
    const names = [String(link.modelKey || ''),
      useName ? (nameByKey.get(`${link.apiPlanId}\u0000${link.modelKey}\u0000${link.variant}`) || '') : '',
      useSlug ? String(link.registrySlug || '') : ''].filter(Boolean);
    const norm = s => (caseSensitive ? s : lower(s));
    return !quotes.map(norm).some(q => names.map(norm).some(n => q.includes(n)));
  }).length;
}

const cases = [
  ['当前盘上数据（工作区，含 t23 未提交改动）', disk('scripts/data/model-registry-links.json'), disk('api-plans.json')],
  ['git HEAD 快照（已提交的旧数据）', show('scripts/data/model-registry-links.json'), show('api-plans.json')],
];

for (const [label, linksDoc, apiDoc] of cases) {
  const links = linksDoc.links || [];
  const api = links.filter(apiSide);
  console.log('\n######## ' + label + ' ########');
  console.log('  links 总数 ' + links.length + ' · API 侧 ' + api.length + ' · Coding 侧 ' + (links.length - api.length));
  console.log('  API 侧里 basis=explicit-mapping ' + api.filter(l => String(l.basis) === 'explicit-mapping').length
    + ' · 其余 ' + api.filter(l => String(l.basis) !== 'explicit-mapping').length);
  console.log('  【写死规则】' + ruleCount(linksDoc, apiDoc));
  console.log('  变体 A 去掉"记录内 name"这一支：' + ruleCount(linksDoc, apiDoc, { useName: false }));
  console.log('  变体 B 去掉 registrySlug 这一支：' + ruleCount(linksDoc, apiDoc, { useSlug: false }));
  console.log('  变体 C 两支持都不认（只比 modelKey）：' + ruleCount(linksDoc, apiDoc, { useName: false, useSlug: false }));
  console.log('  变体 D 大小写敏感：' + ruleCount(linksDoc, apiDoc, { caseSensitive: true }));
  console.log('  变体 E 连 explicit-mapping 一起算：' + ruleCount(linksDoc, apiDoc, { includeExplicit: true }));
  console.log('  变体 F 只在"至少有一条引文"的 link 里算：' + ruleCount(linksDoc, apiDoc, { requireQuote: true }));
  console.log('  变体 G 只在"引文条数为 0"的 link 里算：'
    + api.filter(l => String(l.basis) !== 'explicit-mapping' && quotesOf(l).length === 0).length);
  console.log('  （对照）API 侧全部 link 数：' + api.length + ' · 非 explicit-mapping 的 API 侧：'
    + api.filter(l => String(l.basis) !== 'explicit-mapping').length);
}
