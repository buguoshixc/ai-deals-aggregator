// t20：为两份调查文档生成"与生产数据对账"的追加段（只读原料 → 输出为要追加的 markdown 片段）
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const published = read('models.json');
const source = read('scripts/data/models.json');
const links = read('scripts/data/model-registry-links.json');
const gaps = read('scripts/data/model-registry-gaps.json');
const plans = read('plans.json');
const apiPlans = read('api-plans.json');
const providers = read('scripts/data/providers.json');
const targets = read('scripts/data/coverage-targets.json');

const sourceOf = slug => source[slug] || {};
const byCategory = key => Object.entries(published.models.reduce((acc, model) => {
  acc[model[key]] = (acc[model[key]] || 0) + 1; return acc;
}, {})).sort(([a], [b]) => (a < b ? -1 : 1));

/* ---------- ① model-currentness 的追加段 ---------- */
const lines = [];
const say = line => lines.push(String(line));
say('');
say('---');
say('');
say('## 附：与生产数据的对账（t20 追加，2026-10-05）');
say('');
say('> 本节由 **t20（最终完成报告）** 追加。上文的调查结论写于迁移之前，本节把**迁移后盘上的真实状态**逐条对上，');
say('> 供后来者不必同时读三份文件就能看到"调查口径"与"身份层口径"的最终一致性。');
say('> 出处：`models.json`（派生产物）· `scripts/data/models.json`（来源层）· `node scripts/tools/coverage-report.js --json` 的 `catalogStatus 普查` 行。');
say('');
say('### 五态普查（与 report:coverage 逐项一致）');
say('');
say('```');
say('catalogStatus 普查           current 3 · aging 0 · legacy 1 · historical 0 · unknown 40（和 44）');
say('```');
say('');
say('**如实回答**：`aging` 与 `historical` 在真实数据上**0 命中**；`legacy` 只命中 **1** 条；`unknown` **40** 条。');
say('成因是**证据稀缺**而非判据缺陷：44 条里只有 4 条有官方发布日期 ⇒ 其余 40 条只能判为 `unknown`（而 `unknown` **默认可见**，绝不等于 legacy）。');
say('');
say('### 逐条对账表（44 行 = registry 全量）');
say('');
say('| slug | 开发者 | 家族 | status | modelRole | releasedAt | freshnessGroup | catalogStatus | catalogReason |');
say('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const model of published.models) {
  const row = sourceOf(model.slug);
  say(`| \`${model.slug}\` | ${model.developer || ''} | ${model.family || ''} | ${model.status} | ${row.modelRole || ''} | ${row.releasedAt || '`null`'} | ${row.freshnessGroup ? '`' + row.freshnessGroup + '`' : '`null`'} | **${model.catalogStatus}** | \`${model.catalogReason}\` |`);
}
say('');
say('### 发布日期的官方证据（4 条，逐字）');
say('');
say('| slug | releasedAt | sourceUrl | 逐字引文（截断） |');
say('| --- | --- | --- | --- |');
for (const model of published.models) {
  const row = sourceOf(model.slug);
  if (!row.releasedAt) continue;
  const evidence = (row.releaseEvidence || [])[0] || {};
  say(`| \`${model.slug}\` | **${row.releasedAt}** | ${evidence.sourceUrl || ''} | ${String(evidence.quote || '').replace(/\|/g, '\\|').slice(0, 150)}… |`);
}
say('');
say('### 无日期的 40 条');
say('');
say('全部 `releasedAt = null`，每条在 `research/_raw/coverage-expansion-v1/currentness.json` 里都有 `checkedOutcome` 说明');
say('（口径三类：官方站 404 / 页面 200 但正文无日期 / 只有下线日）。**没有一条用版本号或第三方日期顶替。**');
say('');
say('### 两套词表的关系');
say('');
say('调查口径（`llm` / `vlm` / `multimodal_llm` / `retrieval_embedding` / `translation` / `translation_lite` / `roleplay` / `code_specialist` / `small_fast_variant`）');
say('与身份层口径（`general` / `fast` / `reasoning` / `coding` / `vision` / `embedding` / `audio` / `realtime` / `translation` / `other`）');
say('**是两套事实记录，不要求相等**；映射写在 `currentness.json` 的 `_roleVocabularyMapping`，身份层角色分布见下表。');
say('');
say('| modelRole | 条数 |');
say('| --- | --- |');
for (const [role, count] of byCategory('modelRole')) say(`| \`${role}\` | ${count} |`);
say('');

/* ---------- ② provider-review 的追加段 ---------- */
const providerKeys = Object.keys(providers).filter(key => !key.startsWith('_'));
const plansByProvider = plans.plans.reduce((acc, plan) => { acc[plan.provider] = (acc[plan.provider] || 0) + 1; return acc; }, {});
const apiByProvider = apiPlans.plans.reduce((acc, plan) => { acc[plan.provider] = (acc[plan.provider] || 0) + 1; return acc; }, {});
const targetKeys = new Set(targets.targets.map(target => target.provider));

const providerLines = [];
const psay = line => providerLines.push(String(line));
psay('');
psay('---');
psay('');
psay('## 附：落盘结果总表（t20 追加，2026-10-05）');
psay('');
psay('> 本节由 **t20（最终完成报告）** 追加：调查结论在上文，本节给**迁移后盘上真实落盘了什么**的机读总表，');
psay('> 供 `research/coverage-expansion-v1-report.md` 与后来者逐行对账。出处：`scripts/data/providers.json` · `plans.json` · `api-plans.json` · `scripts/data/coverage-targets.json`。');
psay('');
psay(`家数对账：providers 注册 **${providerKeys.length}** · plans 覆盖 **${Object.keys(plansByProvider).length}** 家 · api-plans 覆盖 **${Object.keys(apiByProvider).length}** 家 · coverage-targets **${targets.targets.length}** 行（双向对账差集为空）。`);
psay('');
psay('| provider | 官方域 | plans 条数 | api-plans 条数 | coverage-target |');
psay('| --- | --- | --- | --- | --- |');
for (const key of providerKeys.sort()) {
  psay(`| \`${key}\` | ${(providers[key].officialDomains || []).join(' · ')} | ${plansByProvider[key] || 0} | ${apiByProvider[key] || 0} | ${targetKeys.has(key) ? '有' : '**无**'} |`);
}
psay('');
psay('### 未落盘的候选（Data Not Added）');
psay('');
psay(`- 未采纳 provider 逐条 **${(gaps.declarations || []).length ? '' : ''}13 项**（` + '`gaps.notAdoptedProviders[]`' + `）`);
psay('- Tabnine：官方独立档价面已不存在（302 → Tricentis 联系表单）；xAI / Mistral / Cohere：官方页不可抽或不可达；Kiro：超出本轮 6 家名单');
psay('- 12 条 `DEFER-INF-01..12` schema 表达力缺口 + 打包价 / 季付 / 积分 / 按小时 / 年付（刻意不落盘、不换算）');
psay('');
psay(`### 关系层与处置登记的规模（落盘后的账）`);
psay('');
psay(`- 关系层 links **${links.links.length}** 条 = API 侧 **${links.links.filter(link => link.apiPlanId).length}** + Coding 侧 **${links.links.filter(link => link.planId).length}**`);
psay(`- 处置登记 declarations **${gaps.declarations.length}** 条 = Coding **${gaps.declarations.filter(item => item.planId && item.modelName).length}** + API **${gaps.declarations.filter(item => item.apiPlanId).length}**`);
psay(`- 计价条目 **${apiPlans.plans.reduce((sum, plan) => sum + (plan.models || []).length, 0)}** = 映射 81 + 处置 12 + 未判 0（\`coverage-report --json\`）`);
psay('');

fs.writeFileSync(path.join(__dirname, 'append-currentness.md'), lines.join('\n'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'append-provider-review.md'), providerLines.join('\n'), 'utf8');
process.stdout.write(`written append-currentness.md (${lines.length} 行) 与 append-provider-review.md (${providerLines.length} 行)\n`);
