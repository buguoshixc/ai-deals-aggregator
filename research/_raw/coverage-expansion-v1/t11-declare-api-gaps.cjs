#!/usr/bin/env node
/**
 * t11 Stage 5：为新增 4 条 API 记录带来的 **26 条 source pricing identity** 逐条给出结局。
 *
 * 判据（`validatePlanModelCoverage` 的同一条硬门禁）：API 侧每一条 (planId, modelKey, variant)
 * 「既没有 registry 映射、也没有处置登记」就红 —— 每一串都必须人工判一次，禁止静默留空。
 *
 * 本脚本的两条自制判据（与项目既有纪律一致）：
 *   ① **只为「归一后精确相等」的串写映射**：把 provider 的 modelKey 去掉命名空间前缀（`x/`、`x.`）后
 *      与 registry 的 slug 或**已登记的别名**逐字比较；相等才写映射（不相等就绝不猜）。
 *   ② 其余一律写 `off-registry-model` 处置登记：官方点名了单一模型，但该写法在 registry 里没有精确身份。
 *      这不是"没判"，而是"判过：对不上"。
 *
 * 用法：node research/_raw/coverage-expansion-v1/t11-declare-api-gaps.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const GAPS = path.join(ROOT, 'scripts', 'data', 'model-registry-gaps.json');
const LINKS = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');
const API_PLANS = path.join(ROOT, 'api-plans.json');
const MODELS = path.join(ROOT, 'scripts', 'data', 'models.json');
const PROVIDERS = path.join(ROOT, 'scripts', 'data', 'providers.json');

/** registry 身份的归一索引：slug + aliases（都是官方写法），值 = slug */
function registryIndex(models) {
  const index = new Map();
  for (const slug of Object.keys(models)) {
    if (slug.startsWith('_')) continue;
    index.set(slug.toLowerCase(), slug);
    for (const alias of models[slug].aliases || []) index.set(String(alias).toLowerCase(), slug);
  }
  return index;
}

/** 去掉 provider 命名空间前缀后的候选写法（只做确定性切分，不做相似度） */
function candidatesOf(modelKey) {
  const key = String(modelKey).toLowerCase();
  const out = new Set([key]);
  if (key.includes('/')) out.add(key.slice(key.lastIndexOf('/') + 1));
  if (key.includes('.')) out.add(key.slice(key.lastIndexOf('.') + 1));
  // `deepseek-ai.v4.1-flash` 这类：把 provider 段之后的部分整体留下
  const parts = key.split(/[/.]/);
  for (let i = 1; i < parts.length; i++) out.add(parts.slice(i).join('.'));
  for (let i = 1; i < parts.length; i++) out.add(parts.slice(i).join('-'));
  return [...out];
}

function main() {
  const gaps = JSON.parse(fs.readFileSync(GAPS, 'utf8'));
  const links = JSON.parse(fs.readFileSync(LINKS, 'utf8'));
  const apiPlans = JSON.parse(fs.readFileSync(API_PLANS, 'utf8')).plans || [];
  const models = JSON.parse(fs.readFileSync(MODELS, 'utf8'));
  const providers = JSON.parse(fs.readFileSync(PROVIDERS, 'utf8'));
  const index = registryIndex(models);

  const NEW_PROVIDERS = ['groq', 'together', 'fireworks', 'cerebras'];
  const newPlans = apiPlans.filter(plan => NEW_PROVIDERS.includes(plan.provider));
  const newLinks = [];
  const newGaps = [];
  const decisions = [];

  for (const plan of newPlans) {
    const handled = new Set();
    for (const model of plan.models || []) {
      const modelKey = String(model.modelKey);
      const variant = model.variant === null || model.variant === undefined ? null : model.variant;
      const idKey = `${plan.id}\u0000${modelKey}\u0000${variant === null ? '(all)' : variant}`;
      if (handled.has(idKey)) continue;
      handled.add(idKey);

      // 若已有映射（含通配 variant:null）覆盖这条 identity，跳过
      const covered = links.links.some(link => link.apiPlanId === plan.id && link.modelKey === modelKey);
      if (covered) continue;
      if (gaps.declarations.some(row => row.planId === plan.id && row.modelName === modelKey)) continue;

      const slug = candidatesOf(modelKey).map(candidate => index.get(candidate)).find(Boolean) || null;
      if (slug) {
        newLinks.push({
          registrySlug: slug, apiPlanId: plan.id, modelKey, variant,
          basis: 'official-model-id', evidence: [],
          note: `provider 的 modelKey「${modelKey}」与 registry 身份「${slug}」在去掉命名空间前缀后逐字相等（官方写法对官方写法）⇒ 显式映射；依据是该记录自己的官方模型页，不为这条映射新造引文。`
        });
        decisions.push(`${plan.provider}/${modelKey} → 映射 ${slug}`);
      } else {
        newGaps.push({
          planId: plan.id, modelName: modelKey, role: 'included', reason: 'off-registry-model',
          sourceUrl: plan.officialUrl,
          note: `官方在定价页点名了单一模型（${model.name || modelKey}），但该写法在 registry 里没有精确身份（去命名空间前缀后仍与任何 slug/别名不逐字相等）⇒ 判过：对不上。不得凭命名相似度并到某个 registry 身份。`
        });
        decisions.push(`${plan.provider}/${modelKey} → 处置 off-registry-model`);
      }
    }
  }

  console.log(`新增 4 条 API 记录共 ${newPlans.reduce((sum, plan) => sum + (plan.models || []).length, 0)} 条计价条目：`);
  console.log(`  写映射 ${newLinks.length} 条：\n    ` + newLinks.map(link => `${link.provider || ''}${link.modelKey}→${link.registrySlug}`).join('\n    '));
  console.log(`  写处置登记 ${newGaps.length} 条（off-registry-model）`);
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }

  const mergeGaps = [...gaps.declarations, ...newGaps]
    .sort((a, b) => (a.planId !== b.planId ? (a.planId < b.planId ? -1 : 1) : (a.modelName < b.modelName ? -1 : a.modelName > b.modelName ? 1 : 0)));
  fs.writeFileSync(GAPS, JSON.stringify({ ...gaps, declarations: mergeGaps }, null, 2) + '\n', 'utf8');

  const orderKey = link => (link.apiPlanId !== undefined
    ? `api\u0000${link.registrySlug}\u0000${link.apiPlanId}\u0000${link.modelKey}\u0000${link.variant === null || link.variant === undefined ? '' : link.variant}`
    : `coding\u0000${link.registrySlug}\u0000${link.planId}\u0000${link.modelName}`);
  const mergeLinks = [...links.links, ...newLinks].sort((a, b) => (orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0));
  fs.writeFileSync(LINKS, JSON.stringify({ ...links, links: mergeLinks }, null, 2) + '\n', 'utf8');

  console.log(`✅ 已写出 model-registry-gaps.json（${mergeGaps.length} 条）与 model-registry-links.json（${mergeLinks.length} 条）`);
  return 0;
}

process.exit(main());
