#!/usr/bin/env node
/**
 * t11 Stage 3b：为新增 Coding 套餐里**对不上 registry 身份的模型串**补处置登记
 * （`scripts/data/model-registry-gaps.json`），并为唯一能对上的那一串写关系层映射。
 *
 * 为什么必须做：`validatePlanModelCoverage()` 是硬门禁 —— `plans.json` 里任何一个模型串，
 * 「既没有 registry 映射、又不在处置登记表里」就报红（禁止静默留空：每一串都必须人工判一次）。
 *
 * 判据（逐条可核，不猜）：
 *   · `step-3.5-flash`：registry 里**已经有**这个 slug ⇒ 必须写**映射**，不能声明成「对不上」；
 *   · `step-5-preview` / `step-3.7-flash` / `step-3.5-flash-2603`：官方点名了单一模型，但该写法在
 *     registry 里没有精确身份 ⇒ `off-registry-model`（这正是这个 reason 的定义）；
 *   · `stepaudio-2.5-*`（realtime / chat / tts / asr）：语音（TTS/ASR/实时语音）资源，不是文本模型身份
 *     ⇒ `non-text-resource`；
 *   · `step-router-v1`：官方是**自动路由**（router）而不是某一个模型身份 ⇒ `series`
 *     （它代表的是「按任务路由到不同模型」这条产品线，没有落到版本）。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const GAPS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-gaps.json');
const LINKS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');
const PLANS_FILE = path.join(ROOT, 'scripts', 'data', 'curated_plans.json');
const MODELS_FILE = path.join(ROOT, 'scripts', 'data', 'models.json');

const STEPFUN_URL = 'https://platform.stepfun.com/docs/zh/step-plan/overview';

/** 模型串 → 处置理由（只对 Step Plan 那 9 串） */
const GAP_REASONS = {
  'step-5-preview': { reason: 'off-registry-model', note: '官方点名的单一模型（Step 5 Preview，1M 上下文、原生多模态输入），但 registry 里还没有登记这个身份 ⇒ 处置为「点名了但对不上精确身份」。等 registry 补登 Step 5 之后再改成映射。' },
  'step-3.7-flash': { reason: 'off-registry-model', note: '官方点名的单一模型（Flash 档），registry 里没有精确身份（registry 目前只有 step-3.5-flash）。' },
  'step-3.5-flash-2603': { reason: 'off-registry-model', note: '官方点名的单一模型，是 step-3.5-flash 的 2603 版本号写法；registry 的 step-3.5-flash 没有版本后缀 ⇒ 不能凭版本号后缀认定同一身份（禁止用命名差异猜同一模型）。' },
  'step-router-v1': { reason: 'series', note: '官方是**自动路由**能力（按任务路由到不同模型），不是某一个模型身份；没有落到版本。' },
  'stepaudio-2.5-realtime': { reason: 'non-text-resource', note: '实时语音资源（非文本模型身份）。' },
  'stepaudio-2.5-chat': { reason: 'non-text-resource', note: '语音对话资源（非文本模型身份）。' },
  'stepaudio-2.5-tts': { reason: 'non-text-resource', note: '语音合成（TTS）资源（非文本模型身份）。' },
  'stepaudio-2.5-asr': { reason: 'non-text-resource', note: '语音识别（ASR）资源（非文本模型身份）。' }
};

function main() {
  const gaps = JSON.parse(fs.readFileSync(GAPS_FILE, 'utf8'));
  const links = JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8'));
  const plans = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8'));
  const models = JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));

  const stepPlans = plans.filter(plan => ['阶跃星辰', 'stepfun'].includes(String(plan.provider)) && Array.isArray(plan.supportedModels));
  // 关键判据：处置登记与映射都要写 **plan.id**，而 curated_plans.json 里**没有 id**
  // （id = sha1(kind|provider|planNameKey|period)，由 rebuild-plans 派生）⇒ 必须从**已重建的
  // plans.json**（派生产物）里取 id，否则会写出一堆 planId=undefined 的垃圾声明。
  const publishedPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).plans || [];
  const idOf = plan => {
    // 注意：发布产物 plans.json 里 provider 已经**归一成 provider key**（`stepfun`），
    // 而 curated 来源层写的是显示名（`阶跃星辰`）—— 两边都要认，否则永远找不到 id。
    const hit = publishedPlans.find(row => row.planName === plan.planName
      && (row.provider === plan.provider || row.provider === plan.providerKey));
    if (hit) return String(hit.id);
    const byName = publishedPlans.find(row => row.planName === plan.planName);
    return byName ? String(byName.id) : null;
  };
  const modelNames = [...new Set(stepPlans.flatMap(plan => plan.supportedModels.map(item => String(item.name))))];

  const problems = [];
  const newDeclarations = [];
  const newLinks = [];

  for (const plan of stepPlans) {
    const planId = idOf(plan);
    if (!planId) { problems.push(`${plan.provider}/${plan.planName}: 在 plans.json 里找不到派生 id（先跑 plans:rebuild）`); continue; }
    for (const item of plan.supportedModels) {
      const name = String(item.name);
      const role = String(item.role);
      if (name === 'step-3.5-flash') {
        // registry 里已有这个身份 ⇒ 写映射（不是处置）
        const slug = name;
        if (!models[slug]) { problems.push(`${name}: registry 里没有这个 slug，不能写映射`); continue; }
        if (links.links.some(link => link.planId === planId && link.modelName === name)) continue;
        newLinks.push({
          registrySlug: slug, planId, modelName: name,
          // basis=official-plan-page 要求「至少一条官方引文」，而链接的 evidence 只允许**复制被引用
          // 记录自己已有的引文**（不许新造）。套餐记录那边没有为这一串单独写引文（它写的是整张
          // supportedModels 表），所以这里如实走 explicit-mapping 这条出口，并在 note 里写清依据。
          basis: 'explicit-mapping', evidence: [],
          note: '套餐 supportedModels 里逐字写的就是 registry 的既有身份 step-3.5-flash（归一后精确相等）；依据是 Step Plan 官方页的 supportedModels 表本身，而该套餐记录没有为这一串单独写官方引文（引文只允许复制记录已有的，不许新造）⇒ 走 explicit-mapping 出口。'
        });
        continue;
      }
      const spec = GAP_REASONS[name];
      if (!spec) { problems.push(`${name}: 没有登记的处置理由（不许静默留空）`); continue; }
      if (gaps.declarations.some(row => row.planId === planId && row.modelName === name)) continue;
      newDeclarations.push({
        planId, modelName: name, role, reason: spec.reason, sourceUrl: STEPFUN_URL, note: spec.note
      });
    }
  }

  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }

  console.log(`Step Plan 的模型串共 ${modelNames.length} 个不同写法：`);
  console.log(`  写映射 ${newLinks.length} 条（registry 里有精确身份：step-3.5-flash）`);
  console.log(`  写处置登记 ${newDeclarations.length} 条（其余写法：${[...new Set(newDeclarations.map(row => row.reason))].join(' / ')}）`);
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }

  const mergedGaps = [...gaps.declarations, ...newDeclarations]
    .sort((a, b) => {
      if (a.planId !== b.planId) return a.planId < b.planId ? -1 : 1;
      if (a.modelName !== b.modelName) return a.modelName < b.modelName ? -1 : 1;
      return 0;
    });
  const gapsOut = { ...gaps, declarations: mergedGaps };
  fs.writeFileSync(GAPS_FILE, JSON.stringify(gapsOut, null, 2) + '\n', 'utf8');

  const mergedLinks = [...links.links, ...newLinks]
    .sort((a, b) => {
      // 规范序与 `model-registry.js` 的 `orderKeyOfLink()` **逐字一致**：先 api/coding 分组，
      // 再 registrySlug、再 apiPlanId/planId、再 modelKey/modelName（api 侧还有 variant）。
      const key = link => (link.apiPlanId !== undefined
        ? `api\u0000${link.registrySlug}\u0000${link.apiPlanId}\u0000${link.modelKey}\u0000${link.variant === null || link.variant === undefined ? '' : link.variant}`
        : `coding\u0000${link.registrySlug}\u0000${link.planId}\u0000${link.modelName}`);
      const ak = key(a); const bk = key(b);
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });
  const linksOut = { ...links, links: mergedLinks };
  fs.writeFileSync(LINKS_FILE, JSON.stringify(linksOut, null, 2) + '\n', 'utf8');

  console.log(`✅ 已写出 model-registry-gaps.json（${mergedGaps.length} 条声明）与 model-registry-links.json（${mergedLinks.length} 条映射）`);
  console.log('下一步：npm run models:rebuild && check:models:reproducible && selftest:model-registry');
  return 0;
}

process.exit(main());
