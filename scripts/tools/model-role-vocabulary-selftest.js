#!/usr/bin/env node
/**
 * coverage-expansion-v1：**模型角色与目录状态枚举的契约守卫**（离线、秒级、零依赖）。
 * owner: captain（本文件由 captain 独占）。
 *
 * ## 为什么需要它（真实事故，不是假想）
 *
 * 本轮开发中同一个枚举出现过**三套词表**：
 *   · 题面 §16 的最小枚举（10 值）：`general / fast / reasoning / coding / vision /
 *     embedding / audio / realtime / translation / other`；
 *   · 调查阶段为了方便写下的 9 值词表（`llm` / `vlm` / `small-fast-variant` / …）；
 *   · 有人把它当成"权威政策表"直接抄进 `model-registry.js`，而 `model-freshness.js`
 *     的档位表又按另一套名字匹配。
 *
 * 后果是**静默的**：角色名对不上档位表 ⇒ 整批模型掉进兜底档（120/240）⇒ 慢周期模型
 * （embedding / translation）被过早判成 `legacy` ⇒ 默认隐藏；而所有页面、报告、构建
 * 都会照常绿。这正是"红的时候没有别的步骤会替它红"的那一类缺陷，所以它必须有自己的牙。
 *
 * ## 判据（三条，全部是**逐字**比对，不做任何归一）
 *
 * 1. `model-registry.js` 的 `MODEL_ROLES` == 题面 §16 的 10 值（顺序也一致）；
 * 2. `model-freshness.js` 的 `MODEL_ROLES` 与它逐字相同；
 * 3. `MODEL_FRESHNESS_POLICY.tiers[].modelRoles` 的并集 == 这 10 值（不多不少）——
 *    少一个 ⇒ 那个角色静默掉兜底档；多一个 ⇒ 引进了第二套词表。
 *
 * 另加两条结构性断言：`catalogStatus` 枚举两处逐字相同；默认隐藏集合恰为 `legacy`+`historical`。
 *
 * 用法：node scripts/tools/model-role-vocabulary-selftest.js
 */

'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const registry = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));
const freshness = require(path.join(ROOT, 'scripts', 'lib', 'model-freshness.js'));

/**
 * 题面 §16 的最小枚举，**逐字写死在这里** —— 这是本文件存在的意义：
 * 它不是"从被测模块再读一遍"（那就成了自证），而是外部钉住的契约。
 * 改这一行 = 一次有意识的契约变更，必须同时改题面对应文档与两处实现。
 */
const CONTRACT_MODEL_ROLES = [
  'general', 'fast', 'reasoning', 'coding', 'vision',
  'embedding', 'audio', 'realtime', 'translation', 'other'
];

/** 题面 §20 的目录状态枚举，同样逐字钉住。 */
const CONTRACT_CATALOG_STATUSES = ['current', 'aging', 'legacy', 'historical', 'unknown'];

/** 题面 §31 的默认隐藏集合。 */
const CONTRACT_HIDDEN = ['legacy', 'historical'];

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${detail ? ` —— ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = list => [...list].sort();

console.log('=== 模型角色 / 目录状态枚举契约守卫 ===');

/* ① model-registry.js 的 MODEL_ROLES 必须逐字等于契约 */
check(
  `model-registry.js 的 MODEL_ROLES 逐字等于题面 §16 的 ${CONTRACT_MODEL_ROLES.length} 值`,
  same(registry.MODEL_ROLES, CONTRACT_MODEL_ROLES),
  `实得 ${JSON.stringify(registry.MODEL_ROLES)}`
);

/* ② model-freshness.js 的 MODEL_ROLES 必须与它逐字相同 */
check(
  'model-freshness.js 的 MODEL_ROLES 与 model-registry.js 逐字相同（两个真相 = 零个真相）',
  same(freshness.MODEL_ROLES, registry.MODEL_ROLES),
  `registry=${JSON.stringify(registry.MODEL_ROLES)} / freshness=${JSON.stringify(freshness.MODEL_ROLES)}`
);

/* ③ 档位表的并集必须正好覆盖这 10 个角色 */
const tierRoles = Object.values(freshness.MODEL_FRESHNESS_POLICY.tiers).flatMap(tier => tier.modelRoles);
const missing = CONTRACT_MODEL_ROLES.filter(role => !tierRoles.includes(role));
const extra = tierRoles.filter(role => !CONTRACT_MODEL_ROLES.includes(role));
check(
  '档位表 tiers[].modelRoles 的并集 == 契约枚举（不多不少）',
  missing.length === 0 && extra.length === 0,
  `${missing.length ? `缺 ${missing.join(' / ')}` : ''}${missing.length && extra.length ? ' · ' : ''}${extra.length ? `多出 ${extra.join(' / ')}` : ''}`
);
check(
  '档位表里没有重复挂同一个角色（重复 = 分档判据不唯一）',
  new Set(tierRoles).size === tierRoles.length,
  `共 ${tierRoles.length} 项，去重后 ${new Set(tierRoles).size} 项`
);

/* ④ catalogStatus 两处逐字相同 */
check(
  'cover：model-registry.js 的 MODEL_CATALOG_STATUS 与 model-freshness.js 的 CATALOG_STATUSES 逐字相同',
  same(registry.MODEL_CATALOG_STATUS, freshness.CATALOG_STATUSES),
  `registry=${JSON.stringify(registry.MODEL_CATALOG_STATUS)} / freshness=${JSON.stringify(freshness.CATALOG_STATUSES)}`
);
check(
  'catalogStatus 逐字等于题面 §20 的枚举',
  same(registry.MODEL_CATALOG_STATUS, CONTRACT_CATALOG_STATUSES),
  `实得 ${JSON.stringify(registry.MODEL_CATALOG_STATUS)}`
);

/* ⑤ 默认可见 / 隐藏集合 */
check(
  '默认隐藏集合恰为 legacy + historical（题面 §31），其余默认可见',
  same(freshness.DEFAULT_HIDDEN_CATALOG_STATUSES, CONTRACT_HIDDEN)
  && same(sorted(freshness.DEFAULT_VISIBLE_CATALOG_STATUSES), sorted(CONTRACT_CATALOG_STATUSES.filter(status => !CONTRACT_HIDDEN.includes(status)))),
  `hidden=${JSON.stringify(freshness.DEFAULT_HIDDEN_CATALOG_STATUSES)} / visible=${JSON.stringify(freshness.DEFAULT_VISIBLE_CATALOG_STATUSES)}`
);

/* ⑥ 现状核对（不是判据，是让读者看见"这套词表现在长什么样"） */
console.log(`\n  现状：registry ${registry.MODEL_ROLES.length} 个角色 · freshness ${freshness.MODEL_ROLES.length} 个角色 · 档位 ${Object.keys(freshness.MODEL_FRESHNESS_POLICY.tiers).length} 档`);
for (const [name, tier] of Object.entries(freshness.MODEL_FRESHNESS_POLICY.tiers)) {
  console.log(`    · ${name}（${tier.currentWindowDays}/${tier.agingWindowDays} 天）= ${tier.modelRoles.join(' / ')}`);
}

console.log(`\n${failures.length ? '❌' : '✅'} 枚举契约守卫：${passed} 项通过，${failures.length} 项失败`);
if (failures.length) {
  failures.forEach(item => console.log(`   ✗ ${item}`));
  process.exit(1);
}
