#!/usr/bin/env node
/**
 * coverage-expansion-v1 / t4：**新鲜度判据的分支自测**（`scripts/lib/model-freshness.js`）。
 *
 * 本文件只做两件事：
 *   ① 逐条钉住 `catalogStatus` 的**每一个分支**（current / aging / legacy / historical / unknown）；
 *   ② 逐条钉住三条硬不变量与一条分组纪律：
 *      · 跨 `modelRole` / 跨 `family` / 跨 `developer` 的记录**绝不互相淘汰**；
 *      · `freshnessGroup` 覆盖**只影响写了它的那一条**，兄弟条目的结论一个字节都不变；
 *      · 含 active 的比较组必须至少有一条 `current` 或 `unknown`（不许整组静默消失）；
 *      · `unknown` 绝不自动等于 `legacy`。
 *
 * 用法：`node scripts/tools/model-freshness-selftest.js`
 * 退出码：0 = 全部通过；1 = 有失败项（逐条打印）。
 *
 * 本文件**不读墙上时钟**：夹具日期直接写成字面量（与策略里的"相对最新"判据无关），
 * 也不依赖任何生产数据文件 —— 它要能在数据还没迁移完的时候就跑。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const fresh = require('../lib/model-freshness');

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; return; }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

function checkEqual(name, actual, expected) {
  check(name, actual === expected, `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);
}

/** 夹具记录的规范形态（`releasedAt` 是唯一被认的发布日期字段）。 */
function model(slug, developer, family, modelRole, releasedAt, status = 'active', extra = {}) {
  return { slug, developer, family, modelRole, releasedAt, status, ...extra };
}

/** slug → entry。 */
function indexOf(report) {
  return new Map(report.entries.map(entry => [entry.slug, entry]));
}

function statusOfSlug(report, slug) {
  const entry = indexOf(report).get(slug);
  return entry ? entry.catalogStatus : '(不存在)';
}

function reasonOfSlug(report, slug) {
  const entry = indexOf(report).get(slug);
  return entry ? entry.catalogReason : '(不存在)';
}

/* ------------------------------------------------------------------ */
console.log('=== 0) 枚举与策略表自洽 ===');

const CANONICAL_CATALOG_STATUSES = ['current', 'aging', 'legacy', 'historical', 'unknown'];
checkEqual('catalogStatus 枚举 = current/aging/legacy/historical/unknown', fresh.CATALOG_STATUSES.join(','), CANONICAL_CATALOG_STATUSES.join(','));
check('每个 catalogStatus 都有中性标签', CANONICAL_CATALOG_STATUSES.every(status => typeof fresh.CATALOG_STATUS_LABEL[status] === 'string'));
checkEqual('默认展示 = current/aging/unknown', fresh.DEFAULT_VISIBLE_CATALOG_STATUSES.join(','), 'current,aging,unknown');
checkEqual('默认隐藏 = legacy/historical', fresh.DEFAULT_HIDDEN_CATALOG_STATUSES.join(','), 'legacy,historical');
check(
  '默认展示 + 默认隐藏 = 全部枚举（不重不漏）',
  [...fresh.DEFAULT_VISIBLE_CATALOG_STATUSES, ...fresh.DEFAULT_HIDDEN_CATALOG_STATUSES].sort().join(',') === [...fresh.CATALOG_STATUSES].sort().join(',')
);
check('策略档位与角色表非空', Object.keys(fresh.MODEL_FRESHNESS_POLICY.tiers).length >= 3 && fresh.MODEL_FRESHNESS_POLICY.tiers[fresh.MODEL_FRESHNESS_POLICY.defaultTier] !== undefined);
check(
  '每一档都声明了 current/aging 两个窗口且 aging > current',
  Object.values(fresh.MODEL_FRESHNESS_POLICY.tiers).every(tier => tier.currentWindowDays > 0 && tier.agingWindowDays > tier.currentWindowDays)
);
check(
  '题面 §22 的三组候选阈值都在策略里被真正使用',
  (() => {
    const used = new Set(Object.values(fresh.MODEL_FRESHNESS_POLICY.tiers).map(tier => `${tier.currentWindowDays}/${tier.agingWindowDays}`));
    return ['120/240', '180/365', '365/730'].every(profile => used.has(profile));
  })(),
  JSON.stringify(Object.values(fresh.MODEL_FRESHNESS_POLICY.tiers).map(tier => `${tier.tier}:${tier.currentWindowDays}/${tier.agingWindowDays}`))
);

/**
 * 角色表必须与身份层的权威枚举一致（`model-registry.js` 的 MODEL_ROLES）。
 *
 * 为什么不直接 `require` 身份层：本自测要在身份层还没落地时也能跑（它只依赖展示判据层）。
 * 读源码时必须**先剥掉行注释**：身份层文件里描述词表的注释块（`` * `general` 通用文本生成… ``）
 * 与真正的 `const MODEL_ROLES = [...]` 形状极像，注释里那句一旦被正则吃掉，
 * 对账就会拿一份**已经不存在的旧词表**去比 —— 那是假红，比不判更糟。
 * 声明出现多次时取**最后一条**（同一文件里只有最后一个生效）。
 */
const registryPath = path.join(__dirname, '..', 'lib', 'model-registry.js');
const registrySource = fs.readFileSync(registryPath, 'utf8');
const registryCode = registrySource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function declarationListOf(source, name) {
  const matches = [...source.matchAll(new RegExp(`const ${name} = \\[([^\\]]*)\\]`, 'g'))];
  if (!matches.length) return null;
  return matches[matches.length - 1][1]
    .split(',')
    .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

const registryRoles = declarationListOf(registryCode, 'MODEL_ROLES');
const registryStatuses = declarationListOf(registryCode, 'MODEL_CATALOG_STATUS');

if (registryRoles) {
  const tieredRoles = new Set(Object.values(fresh.MODEL_FRESHNESS_POLICY.tiers).flatMap(tier => tier.modelRoles));
  const missing = registryRoles.filter(role => !tieredRoles.has(role));
  check(
    '身份层每个 MODEL_ROLES 都在某个档位里（无"静默掉进兜底档"的角色）',
    missing.length === 0,
    `未覆盖：${missing.join(' / ')}`
  );
  const layerRoles = new Set(fresh.MODEL_ROLES);
  const extra = registryRoles.filter(role => !layerRoles.has(role));
  check('身份层的 MODEL_ROLES 都在展示判据层的 MODEL_ROLES 里', extra.length === 0, `缺：${extra.join(' / ')}`);
  const neverTiered = fresh.MODEL_ROLES.filter(role => !registryRoles.includes(role));
  check('展示判据层的 MODEL_ROLES 里没有身份层不认识的角色', neverTiered.length === 0, `多出：${neverTiered.join(' / ')}`);
} else {
  console.log('  ℹ️  model-registry.js 还没有 MODEL_ROLES（身份层尚未落地）—— 跳过角色表对账');
}
if (registryStatuses) {
  check(
    '身份层的 MODEL_CATALOG_STATUS 与展示判据层的 CATALOG_STATUSES 逐字一致',
    registryStatuses.join(',') === CANONICAL_CATALOG_STATUSES.join(','),
    `身份层 ${registryStatuses.join(',')}`
  );
} else {
  console.log('  ℹ️  model-registry.js 还没有 MODEL_CATALOG_STATUS（身份层尚未落地）—— 跳过枚举对账');
}

/* ------------------------------------------------------------------ */
console.log('\n=== 1) 五个分支：current / aging / legacy / historical / unknown ===');

const BRANCH_MODELS = [
  // conversational 档（120/240）：组内最新 60 天 => current；150 天差 => aging；300 天差 => legacy
  model('c-newest', 'Acme', 'Acme One', 'general', '2026-08-01'),
  model('c-aging', 'Acme', 'Acme One', 'general', '2026-03-04'),   // +150 天
  model('c-legacy', 'Acme', 'Acme One', 'general', '2025-10-05'),  // +300 天
  // historical：人工 retired，新鲜度不参与（哪怕它是最新的）
  model('h-retired', 'Acme', 'Acme Retired', 'general', '2026-09-01', 'retired'),
  // unknown：人工状态未判
  model('u-status', 'Acme', 'Acme Unjudged', 'general', '2026-01-01', 'unknown'),
  // unknown：没有发布日期
  model('u-nodate', 'Acme', 'Acme One', 'general', null),
  // unknown：日期写法不可解析（绝不猜）
  model('u-baddate', 'Acme', 'Acme One', 'general', '2026/08/01'),
  // unknown：整组一条带日期的都没有
  model('u-groupless-a', 'Acme', 'Acme Dateless', 'general', null),
  model('u-groupless-b', 'Acme', 'Acme Dateless', 'general', null)
];

const branchReport = fresh.deriveCatalog({ models: BRANCH_MODELS });
checkEqual('分支夹具：不变量零违规', branchReport.invariantViolations.length, 0);
checkEqual('分支夹具：无重复 slug', branchReport.duplicates.length, 0);
checkEqual('分支夹具：无非法输入', branchReport.invalidInputs.length, 0);

checkEqual('current：组内最新且落在 current 窗口内', statusOfSlug(branchReport, 'c-newest'), 'current');
checkEqual('current 的原因码写清"它是本组最新"', reasonOfSlug(branchReport, 'c-newest'), 'group-newest-within-current-window');
checkEqual('aging：超 current 窗口但未超 aging 窗口', statusOfSlug(branchReport, 'c-aging'), 'aging');
checkEqual('aging 的原因码 = 本组已有更新的记录', reasonOfSlug(branchReport, 'c-aging'), 'newer-comparable-exists');
checkEqual('legacy：超 aging 窗口且本组有更新的记录', statusOfSlug(branchReport, 'c-legacy'), 'legacy');
checkEqual('legacy 的原因码 = 被本组更新记录取代且超老化窗口', reasonOfSlug(branchReport, 'c-legacy'), 'outranked-beyond-aging-window');
checkEqual('historical：人工 retired（新鲜度不参与，哪怕它是最新的）', statusOfSlug(branchReport, 'h-retired'), 'historical');
checkEqual('historical 的原因码指向人工依据', reasonOfSlug(branchReport, 'h-retired'), 'status-retired-human-evidence');
checkEqual('unknown：人工状态未判', statusOfSlug(branchReport, 'u-status'), 'unknown');
checkEqual('unknown 的原因码 = 状态未判（不是"旧"）', reasonOfSlug(branchReport, 'u-status'), 'status-unknown-not-judged');
checkEqual('unknown：没有发布日期 ⇒ 不猜', statusOfSlug(branchReport, 'u-nodate'), 'unknown');
checkEqual('缺失日期的原因码 = release-date-missing', reasonOfSlug(branchReport, 'u-nodate'), 'release-date-missing');
checkEqual('unknown：日期不可解析 ⇒ 不猜', statusOfSlug(branchReport, 'u-baddate'), 'unknown');
checkEqual('不可解析日期的原因码 = release-date-unparsable', reasonOfSlug(branchReport, 'u-baddate'), 'release-date-unparsable');

const fiveBranches = new Set(branchReport.entries.map(entry => entry.catalogStatus));
checkEqual('五个分支在同一份夹具里全部出现', [...fiveBranches].sort().join(','), [...CANONICAL_CATALOG_STATUSES].sort().join(','));

// 判据是"相对本组最新"，所以一个两年前的模型只要仍是本组最新，它就该是 current
const ancientButNewest = fresh.deriveCatalog({ models: [model('old-but-newest', 'Old', 'Old Line', 'embedding', '2020-01-01')] });
checkEqual('相对 gap = 0：两年前的模型只要还是本组最新 ⇒ current（不读墙上时钟）', statusOfSlug(ancientButNewest, 'old-but-newest'), 'current');
checkEqual('相对 gap = 0 时 releaseGapDays 就是 0', indexOf(ancientButNewest).get('old-but-newest').releaseGapDays, 0);

/**
 * 边界（半开区间）：`gap` 恰好等于窗口值**不算**落在窗口内。
 * 这四个样例把 conversational 档（120/240）的四条边都钉死：
 * 少一天 current / 正好 120 就 aging / 239 仍 aging / 正好 240 就 legacy。
 * 边界写错会让"一年整的模型"在默认目录里凭空进出，而门禁不会响 —— 所以必须逐条测。
 */
function gapCase(days) {
  const base = Date.UTC(2026, 7, 1); // 2026-08-01
  const released = new Date(base - days * 86400000).toISOString().slice(0, 10);
  const report = fresh.deriveCatalog({ models: [
    model('gap-newest', 'Edge', 'Edge Line', 'general', '2026-08-01'),
    model('gap-probe', 'Edge', 'Edge Line', 'general', released)
  ] });
  return statusOfSlug(report, 'gap-probe');
}
checkEqual('边界：差 119 天 ⇒ current（< 120）', gapCase(119), 'current');
checkEqual('边界：差 120 天 ⇒ aging（窗口是半开区间）', gapCase(120), 'aging');
checkEqual('边界：差 239 天 ⇒ aging（< 240）', gapCase(239), 'aging');
checkEqual('边界：差 240 天 ⇒ legacy（窗口是半开区间）', gapCase(240), 'legacy');

/* ------------------------------------------------------------------ */
console.log('\n=== 2) 跨 modelRole / family / developer 绝不互相淘汰 ===');

const ISOLATION_MODELS = [
  // 同一 developer + family + role：组内互相淘汰（基线）
  model('iso-a-new', 'Acme', 'Acme One', 'general', '2026-08-01'),
  model('iso-a-old', 'Acme', 'Acme One', 'general', '2025-08-01'),          // +365 天 => legacy
  // 同 developer + family，**不同 role**：即使发布更晚也不许淘汰上面那组
  model('iso-role-young', 'Acme', 'Acme One', 'coding', '2026-09-15'),
  // 同 developer + role，**不同 family**：不许淘汰
  model('iso-family-young', 'Acme', 'Acme Two', 'general', '2026-09-20'),
  // 同 family + role，**不同 developer**：不许淘汰
  model('iso-dev-young', 'Zenith', 'Acme One', 'general', '2026-09-25')
];

const isolation = fresh.deriveCatalog({ models: ISOLATION_MODELS });
checkEqual('隔离夹具：不变量零违规', isolation.invariantViolations.length, 0);
checkEqual('隔离夹具：分了 4 个比较组（chat/one、coding/one、chat/two、chat/zenith）', isolation.groups.length, 4);
checkEqual('同组内老的仍是 legacy（组内确实互相淘汰）', statusOfSlug(isolation, 'iso-a-old'), 'legacy');
checkEqual('跨 role 组：更晚的模型是本组最新 ⇒ current，且不影响 chat 组', statusOfSlug(isolation, 'iso-role-young'), 'current');
checkEqual('跨 family 组：同上', statusOfSlug(isolation, 'iso-family-young'), 'current');
checkEqual('跨 developer 组：同上', statusOfSlug(isolation, 'iso-dev-young'), 'current');
checkEqual('被隔离保护的组最新条仍是 current', statusOfSlug(isolation, 'iso-a-new'), 'current');

// 反证：把三个"更年轻的"模型改成与基线组同一组三要素，组内相对差就会重排 ——
// iso-a-new 与更晚的 iso-dev-young 只差 55 天 ⇒ 仍在 120 天窗口内（说明"当前世代"是**相对**判据），
// 而 iso-a-old 差 420 天 ⇒ legacy。两件事只由分组决定，不是碰巧。
const collapsed = fresh.deriveCatalog({
  models: [
    model('iso-a-new', 'Acme', 'Acme One', 'general', '2026-08-01'),
    model('iso-a-old', 'Acme', 'Acme One', 'general', '2025-08-01'),
    model('iso-dev-young', 'Acme', 'Acme One', 'general', '2026-09-25')
  ]
});
checkEqual('对照：同组里更晚的记录进来后，组内最新变成 iso-dev-young', indexOf(collapsed).get('iso-dev-young').catalogStatus, 'current');
checkEqual('对照：原最新条（差 55 天）仍在 current 窗口内 ⇒ current（判据是相对差，不是绝对年龄）', statusOfSlug(collapsed, 'iso-a-new'), 'current');
checkEqual('对照：原最老条（差 420 天）⇒ legacy', statusOfSlug(collapsed, 'iso-a-old'), 'legacy');

// role 决定档位：同一天的两条记录，infrastructure 档仍是 current，conversational 档已经 legacy
const tierModels = [
  model('tier-chat-new', 'Acme', 'Tier Chat', 'general', '2026-08-01'),
  model('tier-chat-old', 'Acme', 'Tier Chat', 'general', '2025-06-01'),        // +426 天 => legacy(240)
  model('tier-emb-new', 'Acme', 'Tier Emb', 'embedding', '2026-08-01'),
  model('tier-emb-old', 'Acme', 'Tier Emb', 'embedding', '2025-06-01')      // +426 天 => aging(730)
];
const tiers = fresh.deriveCatalog({ models: tierModels });
checkEqual('同一 gap，chat 档判 legacy', statusOfSlug(tiers, 'tier-chat-old'), 'legacy');
checkEqual('同一 gap，embedding 档只判 aging（慢周期不被过早淘汰）', statusOfSlug(tiers, 'tier-emb-old'), 'aging');
check('role 不在档位表里时走兜底档并显式标记', (() => {
  const fallback = fresh.deriveCatalog({ models: [model('fb', 'Acme', 'FB', 'no-such-role', '2026-08-01')] });
  return indexOf(fallback).get('fb').tierDefaulted === true && indexOf(fallback).get('fb').tier === fresh.MODEL_FRESHNESS_POLICY.defaultTier;
})());
check('未写 role 时同样走兜底档并显式标记', (() => {
  const fallback = fresh.deriveCatalog({ models: [{ slug: 'fb2', developer: 'Acme', family: 'FB2', releasedAt: '2026-08-01', status: 'active' }] });
  return indexOf(fallback).get('fb2').tierDefaulted === true;
})());
check('translation / other 落在慢档（不被 120 天窗口当"旧"）', (() => {
  const slow = fresh.deriveCatalog({ models: [
    model('sl-tr-new', 'Acme', 'Tr', 'translation', '2026-08-01'),
    model('sl-tr-old', 'Acme', 'Tr', 'translation', '2025-08-01'),
    model('sl-rp-new', 'Acme', 'Rp', 'other', '2026-08-01'),
    model('sl-rp-old', 'Acme', 'Rp', 'other', '2025-08-01')
  ] });
  return statusOfSlug(slow, 'sl-tr-old') === 'aging' && statusOfSlug(slow, 'sl-rp-old') === 'aging';
})(), 'translation/other 晚 365 天应为 aging（慢档 365/730），不是 legacy');
check('vision 落在 multimodal 档（180/365），不走兜底档', (() => {
  const vision = fresh.deriveCatalog({ models: [
    model('vi-new', 'Acme', 'Vi', 'vision', '2026-08-01'),
    model('vi-old', 'Acme', 'Vi', 'vision', '2025-08-02')      // 差 364 天 ⇒ 在 180/365 档里是 aging
  ] });
  const entry = indexOf(vision).get('vi-old');
  return entry.tier === 'multimodal' && entry.tierDefaulted === false && entry.catalogStatus === 'aging';
})(), '晚 364 天在 180/365 档应为 aging');
check('同一 gap 在 conversational 档会判 legacy（分档真的在起作用）', (() => {
  const chat = fresh.deriveCatalog({ models: [
    model('vi-chat-new', 'Acme', 'ViChat', 'general', '2026-08-01'),
    model('vi-chat-old', 'Acme', 'ViChat', 'general', '2025-08-02')
  ] });
  return statusOfSlug(chat, 'vi-chat-old') === 'legacy';
})());

/* ------------------------------------------------------------------ */
console.log('\n=== 3) freshnessGroup 覆盖：只影响写了它的那一条 ===');

const OVERRIDE_MODELS = [
  model('ovr-pinned', 'Bolt', 'Bolt Line', 'general', '2026-08-01', 'active', { freshnessGroup: 'bolt-pinned' }),
  model('ovr-sibling-new', 'Bolt', 'Bolt Line', 'general', '2026-08-20'),
  model('ovr-sibling-old', 'Bolt', 'Bolt Line', 'general', '2025-08-20'),   // +365 天（对 sibling-new）
  model('ovr-untouched-new', 'Bolt', 'Bolt Other', 'general', '2026-08-01'),
  model('ovr-untouched-old2', 'Bolt', 'Bolt Other', 'general', '2025-06-01')
];
const override = fresh.deriveCatalog({ models: OVERRIDE_MODELS });

checkEqual('override 夹具：不变量零违规', override.invariantViolations.length, 0);
checkEqual('override 那一条进自己的组、且是该组唯一成员', indexOf(override).get('ovr-pinned').comparableGroup, 'bolt-pinned');
checkEqual('override 那一条成为本组最新 ⇒ current', statusOfSlug(override, 'ovr-pinned'), 'current');
checkEqual('override 的判据来自显式分组（不是三要素）', indexOf(override).get('ovr-pinned').comparableGroupKeySource, 'freshnessGroup');
checkEqual('override 组只有 1 条（兄弟条目没被拉进来）', indexOf(override).get('ovr-pinned').comparableGroupSize, 1);
checkEqual('兄弟条目仍在三要素组里互相淘汰', statusOfSlug(override, 'ovr-sibling-old'), 'legacy');
checkEqual('兄弟组的最新条仍是 current', statusOfSlug(override, 'ovr-sibling-new'), 'current');
checkEqual('没写 override 的组完全不受影响（最新条 current）', statusOfSlug(override, 'ovr-untouched-new'), 'current');
checkEqual('没写 override 的组完全不受影响（老的 legacy）', statusOfSlug(override, 'ovr-untouched-old2'), 'legacy');

// 反证：去掉 freshnessGroup，pinned 那一条会被丢回三要素组；它与兄弟只差 19 天 ⇒ 它反而成了本组最新 ⇒ current。
// 这一步证明的是"override 确实在起作用"：加了 override 时它的判据来自独占组（组内只有自己），
// 去掉之后它的判据变成与兄弟的相对差。
const withoutOverride = fresh.deriveCatalog({ models: OVERRIDE_MODELS.map(item => ({ ...item, freshnessGroup: null })) });
checkEqual('对照：去掉 override 后它回到三要素组（不再是独占组）', indexOf(withoutOverride).get('ovr-pinned').comparableGroupKeySource, 'developer-family-role');
checkEqual('对照：去掉 override 后组内最新变成更晚的兄弟', indexOf(withoutOverride).get('ovr-sibling-new').catalogStatus, 'current');
checkEqual('对照：去掉 override 后原 pinned 条（差 19 天）⇒ current', statusOfSlug(withoutOverride, 'ovr-pinned'), 'current');
check('对照：去掉 override 后它不再是"独占组的最新"', indexOf(withoutOverride).get('ovr-pinned').comparableGroupSize > 1);

/* ------------------------------------------------------------------ */
console.log('\n=== 4) 硬不变量：unknown ≠ legacy、整组不许静默消失、组计数与条目一致 ===');

const INVARIANT_MODELS = [
  // 一组全是 unknown 状态：一条可见状态都不许"因为判不了而被隐藏"
  model('inv-unknown-1', 'Core', 'Core Line', 'general', '2026-08-01', 'unknown'),
  model('inv-unknown-2', 'Core', 'Core Line', 'general', '2026-08-02', 'unknown'),
  // 一组全是 active 但都没有日期：必须全部 unknown（可见状态），不许判 legacy
  model('inv-nodate-1', 'Core', 'Core NoDate', 'general', null),
  model('inv-nodate-2', 'Core', 'Core NoDate', 'general', 'not-a-date'),
  // retired 的组：没有 active，也不许凭空造出 current
  model('inv-retired', 'Core', 'Core Old', 'general', '2026-08-01', 'retired')
];
const invariants = fresh.deriveCatalog({ models: INVARIANT_MODELS });
checkEqual('不变量夹具：零违规', invariants.invariantViolations.length, 0);
check('整组 active 无日期 ⇒ 全部 unknown（不是 legacy）', ['inv-nodate-1', 'inv-nodate-2'].every(slug => statusOfSlug(invariants, slug) === 'unknown'));
check('整组 active 无日期 ⇒ 组仍算"默认可见"', invariants.groups.every(group => group.activeCount === 0 || group.visibleByDefault));
check('unknown 的原因码永远不在 superseded 表里', invariants.entries.filter(entry => entry.catalogStatus === 'unknown').every(entry => !fresh.SUPERSEDED_REASONS.includes(entry.catalogReason)));
check('unknown 的原因码必须在 UNKNOWN_REASONS 里', invariants.entries.filter(entry => entry.catalogStatus === 'unknown').every(entry => fresh.UNKNOWN_REASONS.includes(entry.catalogReason)));
const retiredGroup = invariants.groups.find(group => group.memberSlugs.includes('inv-retired'));
check('retired 组全是 historical，且没有 active ⇒ 不许凭空 current', retiredGroup !== undefined
  && retiredGroup.activeCount === 0
  && invariants.entries.filter(entry => entry.comparableGroupKey === retiredGroup.key).every(entry => entry.catalogStatus === 'historical'));

/**
 * 牙（变异测试）：把某一组**唯一的可见状态**改成 legacy，同时**同步改掉组计数**，
 * 这样"组计数对账"不会先替不变量挡枪 —— 报红必须来自那条真正的不变量。
 */
function replicateGroups(groups, countsByKey) {
  return groups.map(group => (countsByKey[group.key] ? { ...group, statusCounts: countsByKey[group.key] } : group));
}

const visibleGroup = invariants.groups.find(group => ['inv-nodate-1', 'inv-nodate-2'].every(slug => group.memberSlugs.includes(slug)));
check('变异前置：找得到"整组 active 无日期"的那一组', visibleGroup !== undefined);
const mutatedEntries = invariants.entries.map(entry => (entry.comparableGroupKey === visibleGroup.key
  ? { ...entry, catalogStatus: 'legacy', catalogReason: 'outranked-beyond-aging-window' }
  : entry));
const mutatedCounts = { [visibleGroup.key]: { current: 0, aging: 0, legacy: visibleGroup.memberSlugs.length, historical: 0, unknown: 0 } };
const tooth = fresh.invariantsOf(mutatedEntries, replicateGroups(invariants.groups, mutatedCounts));
check('牙：把整组唯一可见状态改成 legacy ⇒ active-group-without-current-or-unknown 报红',
  tooth.some(problem => problem.code === 'active-group-without-current-or-unknown'),
  JSON.stringify(tooth.map(problem => problem.code)));

check('牙：unknown 被改成"被取代"原因码 ⇒ unknown-marked-as-superseded 报红', fresh.invariantsOf(
  invariants.entries.map(entry => entry.slug === 'inv-unknown-1' ? { ...entry, catalogReason: 'outranked-beyond-aging-window' } : entry),
  invariants.groups
).some(problem => problem.code === 'unknown-marked-as-superseded'));

check('牙：组计数与条目打架 ⇒ group-status-counts-mismatch 报红', fresh.invariantsOf(invariants.entries, [
  { ...invariants.groups[0], statusCounts: { ...invariants.groups[0].statusCounts, legacy: 99 } },
  ...invariants.groups.slice(1)
]).some(problem => problem.code === 'group-status-counts-mismatch'));

// 本组最新（gap 必须恒为 0）：单独造一组带日期的 active 记录，把它的 gap / 状态改掉，两条牙都必须响
const toothBase = fresh.deriveCatalog({ models: [
  model('tooth-new', 'Tooth', 'Tooth Line', 'general', '2026-08-01'),
  model('tooth-old', 'Tooth', 'Tooth Line', 'general', '2025-01-01')
] });
const toothGroup = toothBase.groups[0];
checkEqual('变异前置：tooth-new 是它那一组的可比最新', indexOf(toothBase).get('tooth-new').latestComparableModel, 'tooth-new');
check('牙：把本组最新的 gap 改成 0 以外 ⇒ latest-comparable-gap-not-zero 报红', fresh.invariantsOf(
  toothBase.entries.map(entry => entry.slug === 'tooth-new' ? { ...entry, releaseGapDays: 5 } : entry),
  toothBase.groups
).some(problem => problem.code === 'latest-comparable-gap-not-zero'));
check('牙：把本组最新的状态改成 aging ⇒ latest-comparable-not-current 报红', fresh.invariantsOf(
  toothBase.entries.map(entry => entry.slug === 'tooth-new' ? { ...entry, catalogStatus: 'aging' } : entry),
  replicateGroups(toothBase.groups, { [toothGroup.key]: { current: 0, aging: 1, legacy: 1, historical: 0, unknown: 0 } })
).some(problem => problem.code === 'latest-comparable-not-current'));
check('牙：把本组最新的状态改成 legacy 且组里再无可见状态 ⇒ 两条牙同时响', (() => {
  const codes = fresh.invariantsOf(
    toothBase.entries.map(entry => entry.slug === 'tooth-new' ? { ...entry, catalogStatus: 'legacy' } : entry),
    replicateGroups(toothBase.groups, { [toothGroup.key]: { current: 0, aging: 0, legacy: 2, historical: 0, unknown: 0 } })
  ).map(problem => problem.code);
  return codes.includes('latest-comparable-not-current') && codes.includes('active-group-without-current-or-unknown');
})());
check('牙：原因码不在封闭表里 ⇒ reason-code-outside-table 报红', fresh.invariantsOf(
  invariants.entries.map(entry => entry.slug === 'inv-unknown-1' ? { ...entry, catalogReason: '随便编的' } : entry),
  invariants.groups
).some(problem => problem.code === 'reason-code-outside-table'));

/* ------------------------------------------------------------------ */
console.log('\n=== 5) 纯函数纪律：不读墙上时钟、不改入参、输出可重建 ===');

const frozenInput = Object.freeze([
  Object.freeze(model('frozen-a', 'Fz', 'Fz Line', 'general', '2026-08-01')),
  Object.freeze(model('frozen-b', 'Fz', 'Fz Line', 'general', '2025-08-01'))
]);

/** 把 Date.now 换成会抛错的函数：任何"偷偷读墙钟"的实现都会在这里当场炸。 */
const realNow = Date.now;
let wallClockTouched = null;
Date.now = function poisonedNow() {
  wallClockTouched = new Error('有人读了 Date.now()');
  throw wallClockTouched;
};
try {
  const report = fresh.deriveCatalog({ models: frozenInput });
  checkEqual('冻结入参也能派生（只读，不改）', report.entries.length, 2);
  checkEqual('不读 Date.now()', wallClockTouched, null);
  const again = fresh.deriveCatalog({ models: frozenInput });
  check('同一输入两次派生逐字节一致（可重建）', JSON.stringify(report.entries) === JSON.stringify(again.entries));
  checkEqual('入参没有被改写（仍是冻结的两条记录）', frozenInput.length, 2);
  check('共享策略常量没有被派生过程改坏', fresh.policyDigestOf(fresh.MODEL_FRESHNESS_POLICY) === report.policyDigest);
} catch (error) {
  check(`不读墙上时钟的派生（实得 ${error.message}）`, false, error.stack);
} finally {
  Date.now = realNow;
}

// 策略扰动必须只改副本：`withPolicyDelta` 之后共享常量仍然是原值
const baselineDigest = fresh.policyDigestOf(fresh.MODEL_FRESHNESS_POLICY);
const shifted = fresh.withPolicyDelta([model('fz-1', 'Fz', 'Fz Line', 'general', '2026-08-01')], { currentDelta: 90 });
check('阈值扰动只改副本，不污染共享策略常量', fresh.policyDigestOf(fresh.MODEL_FRESHNESS_POLICY) === baselineDigest, shifted.policyDigest);
check('扰动后的策略指纹确实变了（说明扰动生效）', shifted.policyDigest !== baselineDigest);

/**
 * **同幅平移（两条轴同时 ±N）真的会换档** —— 这是一条被写错过的事实，必须留下牙。
 *
 * 早先的注释断言"同幅平移等于换一把等长的尺子，结论不变"。实测是**错的**：
 * 边界整体上移后，夹在旧 aging 线与新 aging 线之间的模型会由 `legacy`（隐藏）变 `aging`（可见）；
 * 整体下移后，夹在旧 current 线与新 current 线之间的模型会由 `current` 被隐藏。
 * 真正不变的是**组内相对次序**（所以 gap === 0 的那条永远是 current）。
 */
function uniformShiftCase(gap, currentDelta, agingDelta) {
  const base = Date.UTC(2026, 7, 1); // 2026-08-01
  const probe = [{
    slug: 'uniform-newest', developer: 'Uni', family: 'Uni Line', modelRole: 'general',
    releasedAt: '2026-08-01', status: 'active'
  }, {
    slug: 'uniform-probe', developer: 'Uni', family: 'Uni Line', modelRole: 'general',
    releasedAt: new Date(base - gap * 86400000).toISOString().slice(0, 10), status: 'active'
  }];
  const baseReport = fresh.deriveCatalog({ models: probe });
  const shiftedReport = fresh.withPolicyDelta(probe, { currentDelta, agingDelta });
  const before = baseReport.entries.find(entry => entry.slug === 'uniform-probe');
  const after = shiftedReport.entries.find(entry => entry.slug === 'uniform-probe');
  const newestAfter = shiftedReport.entries.find(entry => entry.slug === 'uniform-newest');
  return { before: before.catalogStatus, after: after.catalogStatus, newestAfter: newestAfter.catalogStatus };
}
checkEqual('同幅平移 +90：gap 300（旧 legacy）变成 aging（可见）—— 平移确实改变结论', uniformShiftCase(300, 90, 90).after, 'aging');
checkEqual('同幅平移 -90：gap 150（旧 aging）变成 legacy（隐藏）—— 平移确实改变结论', uniformShiftCase(150, -90, -90).after, 'legacy');
checkEqual('同幅平移下唯一不变的是组内最新那条（永远 current）', uniformShiftCase(300, 90, 90).newestAfter, 'current');
checkEqual('同幅平移下唯一不变的是组内最新那条（负向也一样）', uniformShiftCase(150, -90, -90).newestAfter, 'current');

// 日期归一：只认 YYYY-MM-DD，其余一律 null（不猜）
checkEqual('日期归一：YYYY-MM-DD 原样', fresh.normalizeReleaseDate('2026-09-01'), '2026-09-01');
checkEqual('日期归一：带时间后缀也认', fresh.normalizeReleaseDate('2026-09-01T12:00:00+08:00'), '2026-09-01');
checkEqual('日期归一：2026/09/01 ⇒ null（不猜）', fresh.normalizeReleaseDate('2026/09/01'), null);
checkEqual('日期归一：2026-9-1 ⇒ null（不猜）', fresh.normalizeReleaseDate('2026-9-1'), null);
checkEqual('日期归一：2026-02-30 ⇒ null（日历非法）', fresh.normalizeReleaseDate('2026-02-30'), null);
checkEqual('日期归一：null ⇒ null', fresh.normalizeReleaseDate(null), null);
checkEqual('只认 releasedAt：releaseDate 字段不算发布日期', fresh.releaseDateOf({ releasedAt: undefined, releaseDate: '2026-01-01' }).normalized, null);
checkEqual('只认 releasedAt：firstSeen 绝不作为回退', fresh.releaseDateOf({ firstSeen: '2026-01-01' }).normalized, null);

/* ------------------------------------------------------------------ */
console.log(`\n${failures.length ? '❌' : '✅'} 新鲜度判据自测：${pass} 项通过，${failures.length} 项失败`);
failures.forEach(message => console.error(`   - ${message}`));
if (failures.length) process.exit(1);
