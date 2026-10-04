#!/usr/bin/env node
/**
 * t43 —— **现场数字采集器**（t19 的 PR 正文 / 发布说明里每一个数字都来自这里）。
 *
 * 纪律：不引用历史报告里的数字；能算的都在这里算，并同时给出**基线**（`a4dd40f`）。
 * 只读：只读工作区文件与 `git show`，只写本目录的 `measurements.json`。
 *
 * 用法：node research/_raw/t43/measure.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = path.join(__dirname, 'measurements.json');
const BASELINE = 'a4dd40f';
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const gitShow = rel => execFileSync('git', ['-C', ROOT, 'show', `${BASELINE}:${rel}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const gitShowJson = rel => JSON.parse(gitShow(rel));
const metaKeys = obj => Object.keys(obj).filter(key => !key.startsWith('_'));
const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

const measured = {};
const claims = [];
const add = (key, value, claim) => {
  measured[key] = value;
  if (claim !== undefined) claims.push({ key, claim, measured: value, match: String(claim) === String(value) });
};

/* ---------- 工作区状态 ---------- */
add('head', execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
add('branch', execFileSync('git', ['-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim());
add('baseline', BASELINE);
add('commitsAheadOfBaseline', Number(gitShow !== null ? execFileSync('git', ['-C', ROOT, 'rev-list', '--count', `${BASELINE}..HEAD`], { encoding: 'utf8' }).trim() : 0));

/* ---------- 数据规模（现在 vs 基线） ---------- */
const providersNow = metaKeys(read('scripts/data/providers.json'));
const providersBase = metaKeys(gitShowJson('scripts/data/providers.json'));
add('providersNow', providersNow.length, 34);
add('providersBaseline', providersBase.length, 23);

const plansNow = read('plans.json');
const plansBase = gitShowJson('plans.json');
add('plansNow', plansNow.count !== undefined ? plansNow.count : plansNow.plans.length, 37);
add('plansBaseline', plansBase.count !== undefined ? plansBase.count : plansBase.plans.length, 23);
add('plansProvidersNow', new Set(plansNow.plans.map(plan => plan.provider)).size);

const apiNow = read('api-plans.json');
const apiBase = gitShowJson('api-plans.json');
add('apiPlansNow', apiNow.count !== undefined ? apiNow.count : apiNow.plans.length, 17);
add('apiPlansBaseline', apiBase.count !== undefined ? apiBase.count : apiBase.plans.length, 13);
add('apiPricingItemsNow', apiNow.plans.reduce((sum, plan) => sum + ((plan.models || []).length), 0));

const targetsNow = read('scripts/data/coverage-targets.json');
const targetList = targetsNow.targets || targetsNow.providers || [];
let targetsBaseCount = 0;
try { targetsBaseCount = (gitShowJson('scripts/data/coverage-targets.json').targets || []).length; } catch (error) { targetsBaseCount = 0; }
add('coverageTargetsNow', targetList.length, 34);
add('coverageTargetsBaseline', targetsBaseCount, 0);

const modelsNow = read('models.json');
add('registryModelsNow', modelsNow.models.length, 44);
const catalog = {};
for (const model of modelsNow.models) catalog[model.catalogStatus || '(none)'] = (catalog[model.catalogStatus || '(none)'] || 0) + 1;
add('catalogStatusDistribution', JSON.stringify(catalog));
add('agingPlusHistorical', (catalog.aging || 0) + (catalog.historical || 0), 0);
add('modelsWithOfficialReleasedAt', modelsNow.models.filter(model => model.releasedAt).length, 4);
add('modelsWithReleaseEvidence', modelsNow.models.filter(model => (model.releaseEvidence || []).length).length);

const linksNow = read('scripts/data/model-registry-links.json').links;
const gapsNow = read('scripts/data/model-registry-gaps.json').declarations;
add('linksNow', linksNow.length, 82);
add('linksApiNow', linksNow.filter(link => link.apiPlanId !== undefined).length, 69);
add('linksCodingNow', linksNow.filter(link => link.planId !== undefined).length, 13);
add('linksBaseline', gitShowJson('scripts/data/model-registry-links.json').links.length);
add('gapsNow', gapsNow.length, 54);
add('gapsApiNow', gapsNow.filter(d => d.apiPlanId !== undefined).length, 12);
add('gapsCodingNow', gapsNow.filter(d => d.planId !== undefined).length, 42);
add('gapsBaseline', gitShowJson('scripts/data/model-registry-gaps.json').declarations.length);
// 本版新增的 14 条 API 映射（与基线比）
const baseApiKeys = new Set(gitShowJson('scripts/data/model-registry-links.json').links
  .filter(link => link.apiPlanId !== undefined)
  .map(link => `${link.registrySlug}|${link.apiPlanId}|${link.modelKey}|${link.variant}`));
add('apiLinksAddedVsBaseline', linksNow.filter(link => link.apiPlanId !== undefined
  && !baseApiKeys.has(`${link.registrySlug}|${link.apiPlanId}|${link.modelKey}|${link.variant}`)).length, 14);

/* ---------- 门禁规模 ---------- */
const gateYml = fs.readFileSync(path.join(ROOT, '.github/actions/gate/action.yml'), 'utf8');
const gateBase = gitShow('.github/actions/gate/action.yml');
add('actionYmlStepsNow', (gateYml.match(/^\s+- name: /gm) || []).length, 49);
add('actionYmlStepsBaseline', (gateBase.match(/^\s+- name: /gm) || []).length, 45);
const verifyYml = fs.readFileSync(path.join(ROOT, '.github/workflows/verify.yml'), 'utf8');
add('expectChecks', (verifyYml.match(/--expect-checks=(\d+)/) || [])[1], 38);
add('workflowsNow', fs.readdirSync(path.join(ROOT, '.github/workflows')).length);

/* ---------- 引文未点名 的历史映射（t15 的 34 条口径，自己重算一遍） ---------- */
const apiPlansById = new Map(apiNow.plans.map(plan => [plan.id, plan]));
function fold(value) {
  return String(value === null || value === undefined ? '' : value).normalize('NFKC')
    .replace(/[（(][^（()）]*[）)]\s*$/, '').replace(/[\s\-.‐–—_/／]/g, '').toLowerCase();
}
const unnamed = [];
for (const link of linksNow.filter(item => item.apiPlanId !== undefined)) {
  if (!Array.isArray(link.evidence) || !link.evidence.length) continue; // 只算"有引文"的映射
  const plan = apiPlansById.get(link.apiPlanId);
  const entry = plan && (plan.models || []).find(item => item.modelKey === link.modelKey);
  if (!plan || !entry) continue;
  const needles = [fold(entry.modelKey), fold(entry.name)].filter(Boolean);
  const named = (plan.evidence || []).some(item => {
    const quote = fold(item && item.quote);
    return quote && needles.some(needle => needle.length >= 4 && quote.includes(needle));
  });
  if (!named) unnamed.push(`${plan.id}|${link.modelKey}|${link.registrySlug}`);
}
unnamed.sort();
add('citationLinksWithoutNamedModel', unnamed.length, 34);
add('citationLinksWithoutNamedModelSha256', sha256(unnamed.join('\n')));
add('citationLinksWithEvidenceTotal', linksNow.filter(item => item.apiPlanId !== undefined && Array.isArray(item.evidence) && item.evidence.length).length);

/* ---------- 残余登记表 / 审查 / 变异 ---------- */
const residualPath = path.join(ROOT, 'research/coverage-expansion-v1-residual-register.md');
const residualText = fs.existsSync(residualPath) ? fs.readFileSync(residualPath, 'utf8') : '';
add('residualRegisterExists', Boolean(residualText));
add('residualRegisterSha256', residualText ? sha256(residualText) : null);
const residualIds = new Set([...residualText.matchAll(/^\|\s*(R\d+)\s*\|/gm)].map(match => match[1]));
add('residualRegisterRowIds', residualIds.size, 34);
add('residualHasSection41', /§\s*4\.1/.test(residualText));
add('residualHasSection42', /§\s*4\.2/.test(residualText));
add('residualHasSection43', /§\s*4\.3/.test(residualText));

const reviewT26 = path.join(ROOT, 'research/_raw/t26/report.md');
const reviewT15 = path.join(ROOT, 'research/coverage-expansion-v1-data-quality-review.md');
add('reviewT26Exists', fs.existsSync(reviewT26));
add('reviewT26VerdictPass', fs.existsSync(reviewT26) && /verdict\s*=\s*\*\*pass\*\*/.test(fs.readFileSync(reviewT26, 'utf8')));
add('reviewT15Exists', fs.existsSync(reviewT15));

const mutationPath = path.join(ROOT, 'research/_raw/t17/logs/battery.json');
if (fs.existsSync(mutationPath)) {
  const battery = JSON.parse(fs.readFileSync(mutationPath, 'utf8'));
  const cases = battery.cases || battery.results || battery;
  add('mutationCaseCount', Array.isArray(cases) ? cases.length : Object.keys(cases).length);
  const green = JSON.parse(fs.readFileSync(mutationPath, 'utf8'));
  add('mutationBatteryKeys', Object.keys(green).join(','));
} else {
  add('mutationCaseCount', null);
}

/* ---------- 站点产物（只读 dist/ 与线上） ---------- */
const distSitemap = path.join(ROOT, 'dist/sitemap.xml');
const locsOf = text => [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
if (fs.existsSync(distSitemap)) {
  const localLocs = locsOf(fs.readFileSync(distSitemap, 'utf8'));
  add('sitemapLocalLocCount', localLocs.length);
  const vendorDirs = fs.existsSync(path.join(ROOT, 'dist/vendor'))
    ? fs.readdirSync(path.join(ROOT, 'dist/vendor'), { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name)
    : [];
  add('vendorPageCountLocal', vendorDirs.length);
  add('vendorAwsReplitStepfunPresent', ['aws', 'replit', 'stepfun'].map(slug => `${slug}=${vendorDirs.includes(slug)}`).join(' '));
  const feedDirs = fs.existsSync(path.join(ROOT, 'dist/feed'))
    ? fs.readdirSync(path.join(ROOT, 'dist/feed'), { recursive: true }).filter(name => String(name).endsWith('.xml')).length
    : null;
  add('feedXmlCountLocal', feedDirs);
}

/* ---------- 输出 ---------- */
const report = {
  measuredAt: new Date().toISOString(),
  note: '全部数字由 research/_raw/t43/measure.cjs 现场读取（基线 a4dd40f 用 git show 对照）',
  measured,
  claimComparison: claims.map(item => ({ ...item, match: item.match === true || item.match === 'true' }))
};
fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log('=== 现场数字（t43/measure.cjs）===');
for (const [key, value] of Object.entries(measured)) console.log(`  ${key} = ${typeof value === 'string' && value.length > 120 ? `${value.slice(0, 120)}…` : value}`);
console.log('\n=== 与任务书里的口径对照（claim vs 现场） ===');
for (const item of report.claimComparison) {
  console.log(`  ${item.match ? '✓' : '≠'} ${item.key}: 任务书 ${item.claim} / 现场 ${item.measured}`);
}
console.log(`\n写出：${path.relative(ROOT, OUT)}`);
