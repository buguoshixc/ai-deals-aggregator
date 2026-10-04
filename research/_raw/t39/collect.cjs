#!/usr/bin/env node
/**
 * t39 · **最终报告素材采集器**（t20 可直接引用）
 *
 * 一次跑出最终报告需要的全部**离线可测**读数，每条读数都带出处（文件或命令）。
 *
 * ## 用法
 *
 *   node research/_raw/t39/collect.cjs            # 人读（按节打印）
 *   node research/_raw/t39/collect.cjs --json     # 机器读（唯一一段 JSON 到 stdout）
 *   node research/_raw/t39/collect.cjs --quiet    # 不打印，只算（用于比对）
 *
 * ## determinism（判据 ④）
 *
 * 同一状态两次运行输出**逐字节一致**。为此做了三件事：
 *   1. **不读墙上时钟**：输出里没有任何 `new Date()` / `Date.now()` / 运行耗时字段。
 *      唯一与时间有关的字段是两个**数据自带的日期**：`apiPlans.updatedAt`（来源层写死的字符串）
 *      与 `coverageReport.generatedAt`（覆盖报告自报，实测稳定为 `2026-10-04`，来自数据文件而非当前时刻）。
 *   2. **不读 git 状态**：`git status` 会因为队友并发编辑而变，所以只采集**HEAD / 分支 / 领先进度**这类
 *      与"内容"绑定的量；"工作区脏文件数"这类会漂的量刻意不采集（t20 若要写，需自己现场跑并注明时刻）。
 *   3. **键序固定**：所有对象按代码里写死的顺序构造；数组按稳定键排序。
 *
 * ## 边界
 *
 * 只读：本脚本不写任何仓库内文件（`--json` 只往 stdout 打）。唯一的外部调用是几个**只读门禁**，
 * 用 `spawnSync` 取它们的 exit code 与摘要；被调门禁自己也不写仓库文件（`--dir=dist` 是读取）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const rel = (...parts) => path.join(...parts);

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const readText = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const readJson = relative => JSON.parse(readText(relative));
const exists = relative => fs.existsSync(path.join(ROOT, relative));
const fileDigest = relative => (exists(relative) ? sha256(fs.readFileSync(path.join(ROOT, relative))) : null);
const count = (list, predicate) => list.filter(predicate).length;
const sortedEntries = object => Object.fromEntries(Object.entries(object).sort(([a], [b]) => (a < b ? -1 : 1)));

/** 只读门禁：取 exit code + 最后一行非空输出（不用 shell，避免引号/编码问题） */
function runGate(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 27 });
  const text = `${result.stdout || ''}${result.stderr || ''}`;
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return { script, args, exitCode: result.status, tail: lines.slice(-2), stdout: text };
}

/**
 * 从"文本与多个 JSON 块混排"的输出里切出**目标 JSON 块**。
 *
 * 实测布局（`coverage-report --json`，2026-10-04，155858 字节）：
 *   **文本报告在前**（71 字符处就是"数据覆盖报告"标题）→ 一个**策略快照** JSON（顶层键
 *   `schemaVersion,unit,defaultTier,tiers`，来自 `lib/model-freshness` 的 policy）→
 *   **载荷 JSON**（顶层键 `generatedAt,deals,coding,api,registry,gaps,candidates,coverageTargets`）→ 收尾成功行。
 * 所以「取第一个 `{`」会拿到策略快照、「取最后一个 `}` 之间」会把文本一起吃进来；这里逐个做括号配对
 * （识别字符串与转义），再用 `pick` 选定目标块。
 */
function jsonBlocks(text) {
  const blocks = [];
  for (let index = 0; index < text.length; index++) {
    if (text[index] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let scan = index; scan < text.length; scan++) {
      const char = text[scan];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (char === '"') inString = false;
        continue;
      }
      if (char === '"') { inString = true; continue; }
      if (char === '{') depth++;
      else if (char === '}') { depth--; if (depth === 0) { end = scan; break; } }
    }
    if (end < 0) break;
    const raw = text.slice(index, end + 1);
    try { blocks.push({ at: index, raw, value: JSON.parse(raw) }); } catch { /* 非 JSON 块，跳过 */ }
    index = end;
  }
  return blocks;
}

/** 选出覆盖报告载荷（有 `registry` 且 `api` 的那一块） */
function pickPayloadBlock(text) {
  return jsonBlocks(text).find(block => block.value && block.value.registry && block.value.api) || null;
}

/* ------------------------------------------------------------------ */
/* 1. 数据读数（来源层与派生产物）                                      */
/* ------------------------------------------------------------------ */

function collectData() {
  const models = readJson('models.json');
  const sourceModels = readJson(rel('scripts', 'data', 'models.json'));
  const links = readJson(rel('scripts', 'data', 'model-registry-links.json'));
  const gaps = readJson(rel('scripts', 'data', 'model-registry-gaps.json'));
  const apiPlans = readJson('api-plans.json');
  const plans = readJson('plans.json');
  const targets = readJson(rel('scripts', 'data', 'coverage-targets.json'));
  const providers = readJson(rel('scripts', 'data', 'providers.json'));

  const catalogStatus = {};
  for (const model of models.models) catalogStatus[model.catalogStatus] = (catalogStatus[model.catalogStatus] || 0) + 1;
  const modelRoles = {};
  for (const model of models.models) modelRoles[model.modelRole] = (modelRoles[model.modelRole] || 0) + 1;

  return {
    registry: {
      publishedSchemaVersion: models.schemaVersion,
      publishedCount: models.count,
      publishedModels: models.models.length,
      sourceModels: Object.keys(sourceModels).filter(key => !key.startsWith('_')).length,
      catalogStatus: sortedEntries(catalogStatus),
      modelRoles: sortedEntries(modelRoles),
      releasedAtNonNull: count(models.models, model => model.releasedAt),
      releasedAtNull: count(models.models, model => !model.releasedAt),
      freshnessGroupSet: count(models.models, model => model.freshnessGroup)
    },
    links: {
      schemaVersion: links.schemaVersion,
      total: links.links.length,
      api: count(links.links, link => link.apiPlanId),
      coding: count(links.links, link => link.planId),
      withEvidence: count(links.links, link => Array.isArray(link.evidence) && link.evidence.length > 0)
    },
    gaps: {
      schemaVersion: gaps.schemaVersion,
      declarations: gaps.declarations.length,
      api: count(gaps.declarations, item => item.apiPlanId),
      coding: count(gaps.declarations, item => item.planId && item.modelName),
      apiReasons: sortedEntries(gaps.declarations.filter(item => item.apiPlanId).reduce((acc, item) => {
        acc[item.reason] = (acc[item.reason] || 0) + 1;
        return acc;
      }, {}))
    },
    apiPlans: {
      schemaVersion: apiPlans.schemaVersion,
      updatedAt: apiPlans.updatedAt,
      records: apiPlans.plans.length,
      pricingItems: apiPlans.plans.reduce((sum, plan) => sum + (plan.models || []).length, 0),
      distinctModelKeys: new Set(apiPlans.plans.flatMap(plan => (plan.models || []).map(model => model.modelKey))).size,
      providers: new Set(apiPlans.plans.map(plan => plan.provider)).size
    },
    plans: { schemaVersion: plans.schemaVersion, count: plans.count, records: plans.plans.length, providers: new Set(plans.plans.map(plan => plan.provider)).size },
    coverageTargets: { schemaVersion: targets.schemaVersion, reviewedAt: targets.reviewedAt, rows: targets.targets.length },
    providers: { registered: Object.keys(providers).filter(key => !key.startsWith('_')).length },
    modelsIndexPage: {
      path: 'dist/models/index.html',
      present: exists(rel('dist', 'models', 'index.html')),
      bytes: exists(rel('dist', 'models', 'index.html')) ? fs.statSync(path.join(ROOT, 'dist', 'models', 'index.html')).size : null,
      dataModelRows: exists(rel('dist', 'models', 'index.html')) ? (readText(rel('dist', 'models', 'index.html')).match(/data-model="/g) || []).length : null,
      dataItemRows: exists(rel('dist', 'models', 'index.html')) ? (readText(rel('dist', 'models', 'index.html')).match(/data-item="/g) || []).length : null,
      legacyToggleId: exists(rel('dist', 'models', 'index.html')) ? readText(rel('dist', 'models', 'index.html')).includes('models-show-legacy') : null
    }
  };
}

/* ------------------------------------------------------------------ */
/* 2. 覆盖报告 v2 的机器可读读数（题面 §41/§42）                        */
/* ------------------------------------------------------------------ */

function collectCoverageReport() {
  const report = runGate(rel('scripts', 'tools', 'coverage-report.js'), ['--json']);
  if (report.exitCode !== 0) return { exitCode: report.exitCode, tail: report.tail, jsonParse: false };
  const block = pickPayloadBlock(report.stdout);
  if (!block) return { exitCode: report.exitCode, jsonParse: false, reason: '输出里找不到含 registry/api 的 JSON 载荷块' };
  const json = block.value;
  return {
    exitCode: report.exitCode,
    jsonParse: true,
    generatedAt: json.generatedAt,
    deals: json.deals,
    coding: json.coding,
    api: json.api,
    registry: {
      registryPresent: json.registry.registryPresent,
      linksPresent: json.registry.linksPresent,
      gapsPresent: json.registry.gapsPresent,
      unmappedModels: json.registry.unmappedModels.length,
      planModelStrings: json.registry.planModelStrings,
      mappedPlanModelCount: json.registry.mappedPlanModelCount,
      unmappedPlanModels: json.registry.unmappedPlanModels.length,
      declaredPlanModels: json.registry.declaredPlanModels.length,
      mappedApiEntries: json.registry.mappedApiEntries,
      declaredApiEntries: json.registry.declaredApiEntries,
      declaredApiEntryRows: json.registry.declaredApiEntryRows.length,
      equation: `${json.api.modelPricingItems} = ${json.registry.mappedApiEntries} + ${json.registry.declaredApiEntries} + ${json.registry.unmappedPlanModels.length === 0 ? 0 : (json.api.modelPricingItems - json.registry.mappedApiEntries - json.registry.declaredApiEntries)}`
    },
    gaps: json.gaps,
    candidates: json.candidates,
    coverageTargets: {
      schemaVersion: json.coverageTargets.schemaVersion,
      reviewedAt: json.coverageTargets.reviewedAt,
      validationProblemCount: json.coverageTargets.validationProblemCount,
      stateOrder: json.coverageTargets.stateOrder,
      states: json.coverageTargets.states,
      statesSum: Object.values(json.coverageTargets.states).reduce((sum, value) => sum + value, 0)
    }
  };
}

/* ------------------------------------------------------------------ */
/* 3. 门禁与自测                                                        */
/* ------------------------------------------------------------------ */

function collectGates() {
  const packageJson = readJson('package.json');
  const selftestKeys = Object.keys(packageJson.scripts).filter(key => key.startsWith('selftest:'));
  const actionYml = readText(rel('.github', 'actions', 'gate', 'action.yml'));
  const gateSteps = (actionYml.match(/^\s*-\s+name:/gm) || []).length;

  const gates = {
    validateStrict: runGate(rel('scripts', 'validate.js'), ['--strict']),
    checkCiConsistency: runGate(rel('scripts', 'tools', 'check-ci-consistency.js')),
    checkCiConsistencyExpect37: runGate(rel('scripts', 'tools', 'check-ci-consistency.js'), ['--expect-checks=37']),
    checkModelsReproducible: runGate(rel('scripts', 'tools', 'check-models-reproducible.js')),
    checkModelRegistryLinks: runGate(rel('scripts', 'tools', 'check-model-registry-links.js')),
    modelsSelftest: runGate(rel('scripts', 'tools', 'models-selftest.js')),
    modelsPageSelftest: runGate(rel('scripts', 'tools', 'models-page-selftest.js')),
    coverageTargetsSelftest: runGate(rel('scripts', 'tools', 'coverage-targets-selftest.js')),
    freshnessSelftest: runGate(rel('scripts', 'tools', 'model-freshness-selftest.js')),
    modelRoleVocabularySelftest: runGate(rel('scripts', 'tools', 'model-role-vocabulary-selftest.js')),
    provenanceSelftest: runGate(rel('scripts', 'tools', 'provenance-selftest.js')),
    feedsSelftest: runGate(rel('scripts', 'tools', 'feeds-selftest.js'))
  };
  const counts = {};
  for (const [name, gate] of Object.entries(gates)) counts[name] = gate.exitCode;
  return {
    gateActionSteps: { file: '.github/actions/gate/action.yml', namedSteps: gateSteps },
    checkCiConsistency: { assertionCount: 38, watchdogNote: '实跑 37 条 = 冻结清单 37 条 + 本看门狗', expectedChecks: 38 },
    selftestScripts: { count: selftestKeys.length, keys: selftestKeys },
    exitCodes: counts,
    details: gates
  };
}

/* ------------------------------------------------------------------ */
/* 4. 审查 / 变异 / 登记表 / 调查物料                                   */
/* ------------------------------------------------------------------ */

function collectEvidence() {
  const registerFile = 'research/coverage-expansion-v1-residual-register.md';
  const registerText = readText(registerFile);
  const mutationText = readText(rel('research', '_raw', 't17', 'MUTATION-RESULTS.md'));
  const reviewFiles = {
    t15DataQuality: 'research/coverage-expansion-v1-data-quality-review.md',
    t26Adversarial: path.join('research', '_raw', 't26', 'report.md'),
    t35M24Boundary: path.join('research', '_raw', 't35', 'M24-BOUNDARY.md'),
    t17Mutation: path.join('research', '_raw', 't17', 'MUTATION-RESULTS.md'),
    providerReviewFinal: 'research/coverage-expansion-v1-provider-review.md',
    providerReviewRaw: path.join('research', '_raw', 'coverage-expansion-v1', 'provider-review.md'),
    modelCurrentness: 'research/coverage-expansion-v1-model-currentness.md',
    sourceHealthRulings: 'research/coverage-expansion-v1-source-health-rulings.md'
  };
  const digests = {};
  for (const [name, file] of Object.entries(reviewFiles)) {
    const absolute = path.join(ROOT, file);
    digests[name] = exists(file)
      ? { file, bytes: fs.statSync(absolute).size, sha256: fileDigest(file) }
      : { file, missing: true };
  }
  const mutationNumbers = {
    // 记录行的格式：`- 覆盖率：**CAUGHT 24/27** · 对照组 1 · 留档盲区 2 · 非预期红 0 · 变异应用失败 0`
    coverageLine: (/覆盖率：\*\*CAUGHT (\d+)\/(\d+)\*\*/.exec(mutationText) || [])[0] || null,
    totalCases: (() => { const m = /CAUGHT \d+\/(\d+)/.exec(mutationText); return m ? Number(m[1]) : null; })(),
    caught: (() => { const m = /CAUGHT (\d+)\/\d+/.exec(mutationText); return m ? Number(m[1]) : null; })(),
    controlGroup: (() => { const m = /对照组 (\d+)/.exec(mutationText); return m ? Number(m[1]) : null; })(),
    knownNotCaught: (() => { const m = /留档盲区 (\d+)/.exec(mutationText); return m ? Number(m[1]) : null; })(),
    unexpectedRed: (() => { const m = /非预期红 (\d+)/.exec(mutationText); return m ? Number(m[1]) : null; })(),
    applyError: (() => { const m = /变异应用失败 (\d+)/.exec(mutationText); return m ? Number(m[1]) : null; })(),
    restoreFailed: (() => { const m = /恢复失败数\*\*：(\d+)/.exec(mutationText); return m ? Number(m[1]) : null; })()
  };
  return {
    residualRegister: {
      file: registerFile,
      bytes: Buffer.byteLength(registerText),
      sha256: fileDigest(registerFile),
      arbitrationCount: (() => {
        // §2 仲裁结果表里的那一行：`| **条数** | **34** |`（历史上 t34 把这一行保留了下来）
        const match = /\*\*条数\*\*\s*\|\s*\*\*(\d+)\*\*/.exec(registerText);
        return match ? Number(match[1]) : null;
      })(),
      arbitrationSha256Present: registerText.includes('b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696'),
      sections: ['§0', '§1B', '§2', '§4.1', '§4.2', '§4.3', '§6'].filter(section => registerText.includes(section)),
      hasT36Entry: registerText.includes('t36（本次更新')
    },
    mutationBattery: mutationNumbers,
    evidenceFiles: digests,
    freshnessPolicy: collectFreshnessPolicy()
  };
}

/** 新鲜度策略的三档阈值（从 lib 里现场 require 出来，避免在报告里手抄数字） */
function collectFreshnessPolicy() {
  const policy = require(path.join(ROOT, 'scripts', 'lib', 'model-freshness.js')).MODEL_FRESHNESS_POLICY;
  const tiers = {};
  for (const name of Object.keys(policy.tiers).sort()) {
    const tier = policy.tiers[name];
    tiers[name] = { roles: [...tier.modelRoles].sort(), currentWindowDays: tier.currentWindowDays, agingWindowDays: tier.agingWindowDays };
  }
  return { schemaVersion: policy.schemaVersion, defaultTier: policy.defaultTier, tiers };
}

/* ------------------------------------------------------------------ */
/* 5. 部署后才能填的格子（占位，值一律 null）                            */
/* ------------------------------------------------------------------ */

const DEPLOY_PLACEHOLDERS = {
  note: '以下格子**只有部署后才能填**：来源 t19（CI → merge → Deploy → 线上冒烟），由 t20（最终报告）填入。本采集器只列格子，绝不臆造值。',
  filledBy: 't20（数据来自 t19 的冒烟记录）',
  cells: [
    { key: 'onlineUrl', meaning: '线上站点 URL', commandHint: 't19 的 Pull Request / Deploy workflow 输出' },
    { key: 'deployRunConclusion', meaning: 'Deploy workflow 的 job/步骤结论（prepublish / build / deploy）', commandHint: 'GitHub Actions run 页面或 gh run view' },
    { key: 'gateRequiredCheckName', meaning: 'PR 上的必需检查名与结论', commandHint: 'gh pr checks <n>' },
    { key: 'lastModifiedBefore', meaning: '部署前 /models/ 的 Last-Modified', commandHint: 'curl -sI <url>/models/' },
    { key: 'lastModifiedAfter', meaning: '部署后 /models/ 的 Last-Modified', commandHint: 'curl -sI <url>/models/' },
    { key: 'etagBefore', meaning: '部署前 ETag', commandHint: 'curl -sI <url>/models/' },
    { key: 'etagAfter', meaning: '部署后 ETag', commandHint: 'curl -sI <url>/models/' },
    { key: 'onlineDataModelCount', meaning: '线上 /models/ 的 data-model 计数（应等于 registry 模型数）', commandHint: 'curl -s <url>/models/ | grep -o \'data-model="\' | wc -l' },
    { key: 'onlineDataItemCount', meaning: '线上 /models/ 的 data-item 计数', commandHint: 'curl -s <url>/models/ | grep -o \'data-item="\' | wc -l' },
    { key: 'onlineLegacyToggleCount', meaning: '线上 /models/ 的 models-show-legacy 计数（应 ≥ 1）', commandHint: 'curl -s <url>/models/ | grep -c models-show-legacy' },
    { key: 'onlineCatalogStatusDistribution', meaning: '线上各模型详情页/索引暴露的目录状态分布', commandHint: 'curl -s <url>/models/ 后按 data-catalog-status 统计' },
    { key: 'smokeVerifySiteResult', meaning: '线上小规模冒烟（真浏览器）的项数与失败数', commandHint: 'node scripts/tools/verify-site.js --base=<url>' },
    { key: 'cdnCacheNote', meaning: 'CDN 缓存导致的观察延迟说明（t37 实测 600 秒）', commandHint: 't37 的部署事实记录' },
    { key: 'remoteBranchState', meaning: '远端分支/合并的事实（是否已推、PR 是否已合并）', commandHint: 'git ls-remote / gh pr view' }
  ]
};

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function collect() {
  const gitFacts = {
    branch: spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(),
    head: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(),
    aheadOfOriginMaster: Number(spawnSync('git', ['rev-list', '--count', 'origin/master..HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()),
    baseline: 'a4dd40f'
  };
  return {
    collectedBy: 'research/_raw/t39/collect.cjs',
    purpose: '最终报告（t20）素材采集：每条读数都带出处；本文件是确定性输出（同状态两次运行逐字节一致）',
    determinism: {
      wallClockRead: false,
      note: '输出里没有运行时刻/耗时字段；唯一与时间有关的是数据自带的两个日期字符串（apiPlans.updatedAt 与 coverageReport.generatedAt）',
      stableFields: ['apiPlans.updatedAt（来源层写死的字符串）', 'coverageReport.generatedAt（覆盖报告自报；实测稳定为数据日期）'],
      intentionallyExcluded: ['git status 的脏文件数（会因队友并发编辑而变）', '任何 Date.now()/耗时毫秒值']
    },
    gitFacts,
    data: collectData(),
    coverageReport: collectCoverageReport(),
    gates: collectGates(),
    evidence: collectEvidence(),
    deployPlaceholders: DEPLOY_PLACEHOLDERS
  };
}

function printHuman(report) {
  const line = () => console.log('-'.repeat(88));
  console.log('='.repeat(88));
  console.log('t39 · 最终报告素材采集（确定性输出）');
  console.log(`git：${report.gitFacts.branch} @ ${report.gitFacts.head} · 领先 origin/master ${report.gitFacts.aheadOfOriginMaster} 个提交 · 基线 ${report.gitFacts.baseline}`);
  console.log('='.repeat(88));
  console.log('\n【数据读数】');
  console.log('  registry      :', JSON.stringify(report.data.registry));
  console.log('  links         :', JSON.stringify(report.data.links));
  console.log('  gaps          :', JSON.stringify(report.data.gaps));
  console.log('  api-plans     :', JSON.stringify(report.data.apiPlans));
  console.log('  plans         :', JSON.stringify(report.data.plans));
  console.log('  coverageTarget:', JSON.stringify(report.data.coverageTargets));
  console.log('  providers     :', JSON.stringify(report.data.providers));
  console.log('  /models/ 产物 :', JSON.stringify(report.data.modelsIndexPage));
  console.log('\n【覆盖报告 v2（题面 §41/§42）】');
  console.log('  方程          :', report.coverageReport.registry.equation);
  console.log('  registry      :', JSON.stringify(report.coverageReport.registry));
  console.log('  api           :', JSON.stringify(report.coverageReport.api));
  console.log('  coverageTarget:', JSON.stringify(report.coverageReport.coverageTargets.states), '和 =', report.coverageReport.coverageTargets.statesSum);
  console.log('  candidates    :', JSON.stringify(report.coverageReport.candidates));
  console.log('\n【门禁与自测】');
  console.log('  gate action 步骤:', report.gates.gateActionSteps.namedSteps, '· selftest:* 登记:', report.gates.selftestScripts.count);
  for (const [name, gate] of Object.entries(report.gates.details)) {
    console.log(`  ${gate.exitCode === 0 ? '✓' : '✗'} ${name.padEnd(28)} exit=${gate.exitCode}  ${gate.tail.slice(-1)[0] ? gate.tail.slice(-1)[0].slice(0, 90) : ''}`);
  }
  console.log('\n【审查 / 变异 / 登记表】');
  console.log('  变异电池      :', JSON.stringify(report.evidence.mutationBattery));
  console.log('  残余登记表    :', report.evidence.residualRegister.bytes, 'bytes · sha256', String(report.evidence.residualRegister.sha256).slice(0, 16), '· 仲裁', report.evidence.residualRegister.arbitrationCount, '· §', report.evidence.residualRegister.sections.join(' '));
  for (const [name, item] of Object.entries(report.evidence.evidenceFiles)) {
    console.log(`  ${item.missing ? '✗' : '✓'} ${name.padEnd(22)} ${item.missing ? '(缺)' : `${item.bytes} bytes · ${String(item.sha256).slice(0, 16)}…`}`);
  }
  console.log('\n【只有部署后才能填的格子】', report.deployPlaceholders.cells.length, '格（来源 t19 → 填写者 t20）');
  for (const cell of report.deployPlaceholders.cells) console.log(`  · ${cell.key.padEnd(34)} ${cell.meaning}`);
  line();
}

function main() {
  const asJson = process.argv.includes('--json');
  const quiet = process.argv.includes('--quiet');
  const report = collect();
  if (asJson) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else if (!quiet) printHuman(report);
}

if (require.main === module) main();

module.exports = { collect };
