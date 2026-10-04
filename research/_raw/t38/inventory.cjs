#!/usr/bin/env node
/**
 * t38 预映射的**只读盘点器**：把 §87 判定要用到的盘面事实一次读出来（不写任何生产文件）。
 *
 * 它只回答"东西在不在、数是多少"，**不**回答"要求满足了吗"——后者是 t22 的事。
 * 用法：node research/_raw/t38/inventory.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const PROMPT = 'D:\\AI_DEALS_COVERAGE_EXPANSION_V1_PROMPT.md';

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')); } catch (error) { return null; }
}
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }
function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim(); } catch (error) { return `(git 失败: ${error.message.split('\n')[0]})`; }
}
const countKeys = doc => doc ? Object.keys(doc).filter(key => !key.startsWith('_')).length : null;

/* ---- §87 清单条数（判据来自题面文件本身，不靠人眼数） ---- */
let section87 = [];
if (fs.existsSync(PROMPT)) {
  const raw = fs.readFileSync(PROMPT, 'utf8');
  const start = raw.indexOf('# 87. 最终 Completion Checklist');
  const end = raw.indexOf('# 88.');
  const body = start >= 0 && end > start ? raw.slice(start, end) : '';
  section87 = body.split('\n').filter(line => line.trim().startsWith('- [ ]')).map(line => line.trim().replace(/^- \[ \]\s*/, ''));
}

const modelsSource = readJson('scripts/data/models.json');
const published = readJson('models.json');
const links = readJson('scripts/data/model-registry-links.json');
const gaps = readJson('scripts/data/model-registry-gaps.json');
const apiPlans = readJson('api-plans.json');
const plans = readJson('plans.json');
const targets = readJson('scripts/data/coverage-targets.json');
const providers = readJson('scripts/data/providers.json');
const health = readJson('scripts/data/source-health.json');

const sourceEntries = modelsSource ? Object.entries(modelsSource).filter(([key]) => !key.startsWith('_')) : [];
const withRole = sourceEntries.filter(([, entry]) => entry && entry.modelRole !== undefined && entry.modelRole !== null);
const withDate = sourceEntries.filter(([, entry]) => entry && entry.releasedAt);
const nullDate = sourceEntries.filter(([, entry]) => entry && (entry.releasedAt === null || entry.releasedAt === undefined));
const withEvidence = sourceEntries.filter(([, entry]) => entry && Array.isArray(entry.releaseEvidence) && entry.releaseEvidence.length);
const publishedModels = published && Array.isArray(published.models) ? published.models : [];
const byCatalog = {};
publishedModels.forEach(model => { const key = model.catalogStatus === undefined ? '(缺字段)' : model.catalogStatus; byCatalog[key] = (byCatalog[key] || 0) + 1; });
const apiEntries = (apiPlans && Array.isArray(apiPlans.plans) ? apiPlans.plans : []).reduce((sum, plan) => sum + ((plan && plan.models) || []).length, 0);
const linksList = links && Array.isArray(links.links) ? links.links : [];
const gapList = gaps && Array.isArray(gaps.declarations) ? gaps.declarations : [];

const out = {
  题面: { 文件: PROMPT, 存在: fs.existsSync(PROMPT), 条数: section87.length, 条目: section87 },
  git: {
    HEAD: git(['log', '--oneline', '-1']),
    最近12条: git(['log', '--oneline', '-12']).split('\n'),
    originMaster: git(['log', '--oneline', '-1', 'origin/master']),
    判据_origin_master是HEAD祖先: git(['merge-base', '--is-ancestor', 'origin/master', 'HEAD']) === '',
    HEAD领先origin_master的提交数: git(['rev-list', '--count', 'origin/master..HEAD']),
    工作区改动文件数: git(['status', '--porcelain']).split('\n').filter(Boolean).length
  },
  数据: {
    registry源层条目数: countKeys(modelsSource),
    registry发布产物条目数: publishedModels.length,
    modelRole非空: withRole.length,
    releasedAt有值: withDate.length,
    releasedAt为null或缺失: nullDate.length,
    releaseEvidence非空: withEvidence.length,
    catalogStatus分布: byCatalog,
    links条数: linksList.length,
    links_其中API: linksList.filter(link => link && link.apiPlanId !== undefined).length,
    links_其中Coding: linksList.filter(link => link && link.planId !== undefined).length,
    gaps声明条数: gapList.length,
    gaps_其中API: gapList.filter(d => d && d.apiPlanId !== undefined).length,
    gaps_其中Coding: gapList.filter(d => d && d.planId !== undefined).length,
    apiPlans记录数: apiPlans && apiPlans.count !== undefined ? apiPlans.count : (apiPlans ? apiPlans.plans.length : null),
    计价条目数: apiEntries,
    plans条数: plans && plans.count !== undefined ? plans.count : (plans ? plans.plans.length : null),
    coverageTargets行数: targets && Array.isArray(targets.targets) ? targets.targets.length : null,
    providers身份数: countKeys(providers),
    身份数与目标行数相等: countKeys(providers) === (targets && targets.targets ? targets.targets.length : -1),
    sourceHealth条数: health && Array.isArray(health.sources) ? health.sources.length : null,
    sourceHealth非healthy: health && Array.isArray(health.sources) ? health.sources.filter(s => s.status !== 'healthy').map(s => `${s.source}:${s.status}×${s.consecutiveFailures}`) : null
  },
  产物存在性: {}
};

const ARTIFACTS = [
  'research/coverage-expansion-v1-report.md',
  'research/coverage-expansion-v1-self-audit.md',
  'research/coverage-expansion-v1-residual-register.md',
  'research/coverage-expansion-v1-data-quality-review.md',
  'research/coverage-expansion-v1-provider-review.md',
  'research/coverage-expansion-v1-model-currentness.md',
  'research/_raw/coverage-expansion-v1/firstparty.json',
  'research/_raw/coverage-expansion-v1/inference.json',
  'research/_raw/coverage-expansion-v1/coding.json',
  'research/_raw/coverage-expansion-v1/baseline.json',
  'research/_raw/t17/MUTATION-RESULTS.md',
  'research/_raw/t17/logs/battery.json',
  'research/_raw/t26/report.md',
  'research/_raw/t35/M24-BOUNDARY.md',
  'dist/index.html',
  'dist/models/index.html',
  'dist/data/index.json',
  'dist/sitemap.xml',
  'scripts/data/coverage-targets.json',
  'docs/SCHEMA-v3.0.md'
];
ARTIFACTS.forEach(rel => { out.产物存在性[rel] = exists(rel); });

// 本轮新增模型（对基线 a4dd40f 的来源层 slug 做差集）：用来回答"有没有大量新增旧模型"
const baselineRaw = git(['show', 'a4dd40f:scripts/data/models.json']);
let baselineSlugs = [];
try { baselineSlugs = Object.keys(JSON.parse(baselineRaw)).filter(key => !key.startsWith('_')); } catch (error) { baselineSlugs = []; }
const currentSlugs = sourceEntries.map(([slug]) => slug);
out.身份漂移 = {
  基线slug数: baselineSlugs.length,
  现有slug数: currentSlugs.length,
  新增: currentSlugs.filter(slug => !baselineSlugs.includes(slug)),
  删除: baselineSlugs.filter(slug => !currentSlugs.includes(slug))
};

if (process.argv.includes('--summary')) {
  const g = out.git;
  const d = out.数据;
  console.log(`§87 条数            : ${out.题面.条数}`);
  console.log(`git HEAD           : ${g.HEAD}`);
  console.log(`origin/master      : ${g.originMaster}`);
  console.log(`origin/master 是祖先: ${g['判据_origin_master是HEAD祖先']} · HEAD 领先 ${g['HEAD领先origin_master的提交数']} 个提交 · 工作区改动 ${g['工作区改动文件数']} 个文件`);
  console.log(`registry 源层/产物  : ${d.registry源层条目数} / ${d.registry发布产物条目数}`);
  console.log(`modelRole 非空      : ${d.modelRole非空}`);
  console.log(`releasedAt 有值/空  : ${d.releasedAt有值} / ${d.releasedAt为null或缺失}（releaseEvidence 非空 ${d.releaseEvidence非空}）`);
  console.log(`catalogStatus 分布  : ${JSON.stringify(d.catalogStatus分布)}`);
  console.log(`links               : ${d.links条数} = API ${d.links_其中API} + Coding ${d.links_其中Coding}`);
  console.log(`gaps 声明           : ${d.gaps声明条数} = API ${d.gaps_其中API} + Coding ${d.gaps_其中Coding}`);
  console.log(`api-plans / 条目    : ${d.apiPlans记录数} / ${d.计价条目数}`);
  console.log(`plans               : ${d.plans条数}`);
  console.log(`coverage-targets    : ${d.coverageTargets行数} 行 · providers ${d.providers身份数}（相等 ${d.身份数与目标行数相等}）`);
  console.log(`source-health       : ${d.sourceHealth条数} 条 · 非 healthy ${JSON.stringify(d.sourceHealth非healthy)}`);
  console.log(`身份漂移 vs a4dd40f : 新增 ${JSON.stringify(out.身份漂移.新增)} · 删除 ${JSON.stringify(out.身份漂移.删除)}`);
  console.log('产物存在性          :');
  Object.entries(out.产物存在性).forEach(([rel, ok]) => console.log(`   ${ok ? 'OK  ' : 'MISS'} ${rel}`));
} else {
  console.log(JSON.stringify(out, null, 2));
}
