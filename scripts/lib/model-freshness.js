/**
 * coverage-expansion-v1：**模型新鲜度（freshness）与目录状态的唯一判据入口**。
 *
 * 本文件回答「**哪些模型值得默认展示**」：一条模型相对**它可比的那批**处于什么世代。
 * registry（`scripts/data/models.json`）只回答「这个模型是谁」，不回答这件事。
 *
 * ## 四条纪律
 *
 * 1. **不读墙上时钟**：`releaseGapDays = latestComparableReleasedAt - releasedAt`
 *    （**相对差值**，不是 `today - releasedAt`）。同一份来源层必须永远得到同一串字节；
 *    一个模型哪怕发布两年，只要它仍是本组最新，它的 gap 就是 `0` ⇒ `current`。
 *    本文件里没有 `new Date()` / `Date.now()`（`Date.UTC` 只用于把 `YYYY-MM-DD` 换算成
 *    整数天，与"现在几点"无关），也**不接受**调用方传入 `today`。
 * 2. **不联网、不用随机数、不读任何数据文件**：输入即全部事实。谁把 registry 读进来、
 *    怎么把字段映射成这里的入参，是调用方（`model-registry.js` / `rebuild-models.js`）的事。
 * 3. **不猜**：没有官方发布日期就是 `unknown` —— 绝不用版本号、名字相似度或「看起来更新」推断。
 *    `firstSeen`（本站第一次看到）语义完全不同，**绝不**作为发布日期回退：那会让
 *    「我们收得晚」变成「这个模型新」，静默改变默认展示集合。
 * 4. **`unknown` 绝不自动等于 `legacy`**：判不了的记录默认**保留展示**，不许静默隐藏。
 *
 * ## 输入（`inputs.models[]`）
 *
 * | 字段 | 必填 | 语义 |
 * | --- | --- | --- |
 * | `slug` | 是 | registry 身份（唯一键；重复进 `duplicates`，不进派生） |
 * | `developer` | 否 | 开发者（默认比较组的第一要素） |
 * | `family` | 否 | 产品线（默认比较组的第二要素） |
 * | `modelRole` | 否 | 模型角色，取值见 `MODEL_ROLES`（默认比较组的第三要素） |
 * | `releasedAt` | 否 | **官方发布时间**（`YYYY-MM-DD` 或 `null`）。刻意只认这一个字段 |
 * | `status` | 是 | registry 人工状态：`active` / `retired` / `unknown` |
 * | `freshnessGroup` | 否 | 可选显式分组覆盖（写了就进这个组，不再按三要素算） |
 *
 * ## 比较组
 *
 * ```
 * comparableGroupOf(record) = record.freshnessGroup || developer + "\u0000" + family + "\u0000" + modelRole
 * ```
 *
 * 跨 developer / 跨 family / 跨 modelRole 的记录**绝不互相淘汰**：各自有各自的时间尺度与产品线。
 * `freshnessGroup` 是**逐条**覆盖，只影响写了它的那一条所在的组，别的组结论不变。
 * 三要素里任一缺失时该组标成 `keyDegraded: true`（「这组分得可能太粗」是事实，不是推测）。
 *
 * ## 派生输出（`deriveCatalog()` 每条 entry）
 *
 * `latestComparableModel` / `latestComparableReleasedAt` / `releaseGapDays` /
 * `catalogStatus` / `catalogReason` / `catalogReasonText`，外加组信息与当轮所用阈值。
 *
 * ## `catalogStatus` 枚举（与 `model-registry.js` 的 `MODEL_CATALOG_STATUS` 同一套）
 *
 * | 值 | 含义 |
 * | --- | --- |
 * | `current` | 相对本组最新记录的时间差在 current 窗口内 |
 * | `aging` | 已有更新的可比较记录，但还没到隐藏阈值 |
 * | `legacy` | 仍可能 active / 有价格 / 有历史关系，但已不应默认占据当前模型目录 |
 * | `historical` | 官方已 retired（人工依据驱动），或只为历史关系保留 |
 * | `unknown` | 没有足够发布时间证据 ⇒ **默认保留展示**，绝不静默隐藏 |
 *
 * ## 硬不变量（由 `invariantsOf()` 报成结构化 `invariantViolations`）
 *
 * 1. **含 active 模型的比较组必须至少有一条 `current` 或 `unknown`** ——
 *    绝不允许「整组 active 却一条都不展示」（那会把整组从默认目录静默淘汰）。
 * 2. **`unknown` 绝不自动等于 `legacy`**，也不许带 legacy 的原因码。
 * 3. **本组最新可比模型必须 `gap === 0` 且为 `current`**（无发布日期时为 `unknown`）。
 * 4. `aging` / `legacy` 只能建立在「本组存在更新的可比记录」之上。
 */

'use strict';

/* ------------------------------------------------------------------ */
/* 枚举                                                                */
/* ------------------------------------------------------------------ */

/**
 * 模型角色枚举。**权威定义在 `model-registry.js` 的 `MODEL_ROLES`**（身份层是唯一来源）；
 * 这里逐字镜像一份是为了让本模块能独立判档（不 require 身份层，避免两层互相耦合），
 * 两处不一致由 `scripts/tools/model-freshness-selftest.js` **当场抓红**：
 * 档位表漏一个角色 = 那个角色静默掉进兜底档（120/240）= 慢周期模型被过早判 `legacy`（默认隐藏）。
 */
const MODEL_ROLES = Object.freeze([
  'general', 'fast', 'reasoning', 'coding', 'vision',
  'embedding', 'audio', 'realtime', 'translation', 'other'
]);

/** 人工状态（与 `model-registry.js` 的 `MODEL_STATUS` 同一枚举）。 */
const MODEL_STATUSES = Object.freeze(['active', 'retired', 'unknown']);

/** `catalogStatus` 的封闭枚举。`retired` **不是**目录状态：它映射到 `historical`。 */
const CATALOG_STATUSES = Object.freeze(['current', 'aging', 'legacy', 'historical', 'unknown']);

/**
 * `catalogStatus` → 页面/报告可用的**中性**中文标签。
 *
 * 刻意不出现「推荐 / 最强 / 最佳 / 过时」这类主观词：这些标签只描述
 * 「相对发布时间的位置」，不评价模型好坏。
 */
const CATALOG_STATUS_LABEL = Object.freeze({
  current: '当前型号',
  aging: '较早型号',
  legacy: '旧型号',
  historical: '历史型号',
  unknown: '发布时间未知'
});

/** `/models/` 默认展示的目录状态：legacy 与 historical 默认隐藏，但可主动查看。 */
const DEFAULT_VISIBLE_CATALOG_STATUSES = Object.freeze(['current', 'aging', 'unknown']);

/** `/models/` 默认隐藏的目录状态。 */
const DEFAULT_HIDDEN_CATALOG_STATUSES = Object.freeze(['legacy', 'historical']);

/**
 * `catalogReason` → 人话。**封闭表**：`invariantsOf()` 断言「每条结果的 reason 都在这张表里」，
 * 于是不会出现「改了一句文案、门禁还在绿」的漂移。
 */
const CATALOG_REASONS = Object.freeze({
  'group-newest-within-current-window': '它是本可比组里最新的型号，且落在当前窗口内',
  'within-current-window': '它落在本组最新的当前窗口内',
  'newer-comparable-exists': '同一比较组里已有更新的型号，差值超过 current 窗口但未超过 aging 窗口',
  'outranked-beyond-aging-window': '同一比较组里已有更新的型号，且差值超过 aging 窗口',
  'status-retired-human-evidence': '人工状态 retired（官方不再列出 / 已公告下线）—— 新鲜度不参与判定',
  'status-unknown-not-judged': '人工状态 unknown（还没人工判过）—— unknown 不等于 legacy，绝不据此淘汰',
  'release-date-missing': '本条没有官方发布日期 —— 判不了新鲜度（不猜）',
  'release-date-unparsable': '本条发布日期不是可解析的 YYYY-MM-DD —— 判不了新鲜度（不猜）',
  'group-has-no-dated-model': '这一组没有任何一条带官方发布日期 —— 判不了新旧'
});

/** 「判不了」的原因码集合（`unknown` 只允许来自这里，外加 `status-unknown-not-judged`）。 */
const UNKNOWN_REASONS = Object.freeze([
  'release-date-missing', 'release-date-unparsable', 'group-has-no-dated-model', 'status-unknown-not-judged'
]);

/** 只有「本组存在更新可比记录」才成立的原因码。 */
const SUPERSEDED_REASONS = Object.freeze(['newer-comparable-exists', 'outranked-beyond-aging-window']);

const GROUP_KEY_SEPARATOR = '\u0000';
const MS_PER_DAY = 86400000;

/* ------------------------------------------------------------------ */
/* 策略（唯一来源）                                                     */
/* ------------------------------------------------------------------ */

/**
 * 分档阈值（天）。`currentWindowDays` / `agingWindowDays` 都是**相对本组最新发布日期**的差值窗口，
 * 边界取**半开区间**（`gap` 恰好等于窗口值**不算**落在窗口内）：
 *
 *   · `gap < currentWindowDays`          ⇒ `current`
 *   · `gap < agingWindowDays`（且超窗口） ⇒ `aging`
 *   · 其余                                ⇒ `legacy`
 *
 * 为什么边界要写死并测：`gap === currentWindowDays` 落哪一档，直接决定"一年整的模型"
 * 有没有在默认目录里。半开区间让窗口值有唯一读法（"**小于** 120 天算当前"），
 * 自测里有 `119 / 120 / 239 / 240` 四个边界样例钉住它。
 *
 * ## 为什么是三档、哪个 role 进哪档
 *
 * 分档依据是**能力类型**（题面 §22 的三组候选值），不是"新旧感"。角色串取自身份层的
 * `MODEL_ROLES`（权威枚举），逐字覆盖，**不留任何角色掉进兜底档**：
 *
 * | 档 | 窗口 | 角色 |
 * | --- | --- | --- |
 * | `conversational` | 120/240 | `llm` · `small-fast-variant` · `code-specialist` |
 * | `multimodal` | 180/365 | `vlm` · `multimodal-llm` |
 * | `infrastructure` | 365/730 | `retrieval-embedding` · `translation` · `translation-lite` · `roleplay` · `other` |
 *
 * 理由：通用文本 / 同代小尺寸档 / 代码专用模型换代最快（官方一年内常见多次刷版）；
 * 视觉与多模态发布的节奏明显慢于文本对话模型；向量、翻译（含 lite）、角色扮演是
 * **慢周期资产** —— 用对话档会把它们过早判成 `legacy`，而 `legacy` 默认隐藏 = 静默淘汰
 * 官方仍在售的模型。
 *
 * **兜底**：`modelRole` 为空或不在任何档里 ⇒ `conversational` 并标 `tierDefaulted: true`
 * （"这条用了兜底档"必须看得见，不许静默）。由于上面已逐字覆盖权威枚举，兜底只发生在
 * "没写 role"或"写了非法 role"两种情况下 —— 自测会对账这件事。
 *
 * 这些数字**不是不可修改的产品真理**：改它们必须同步跑
 * `scripts/tools/model-freshness-sensitivity.js`（阈值扰动会翻哪些模型、哪些组会掉到
 * 0 个可见状态）并更新自测里的期望值 —— 两侧一起改才算一次有意识的策略变更。
 */
const MODEL_FRESHNESS_POLICY = Object.freeze({
  schemaVersion: 1,
  unit: 'days',
  defaultTier: 'conversational',
  tiers: Object.freeze({
    conversational: Object.freeze({
      tier: 'conversational',
      modelRoles: Object.freeze(['general', 'fast', 'reasoning', 'coding']),
      currentWindowDays: 120,
      agingWindowDays: 240
    }),
    multimodal: Object.freeze({
      tier: 'multimodal',
      modelRoles: Object.freeze(['vision', 'audio', 'realtime']),
      currentWindowDays: 180,
      agingWindowDays: 365
    }),
    infrastructure: Object.freeze({
      tier: 'infrastructure',
      modelRoles: Object.freeze(['embedding', 'translation', 'other']),
      currentWindowDays: 365,
      agingWindowDays: 730
    })
  })
});

/* ------------------------------------------------------------------ */
/* 小工具（全部纯函数）                                                 */
/* ------------------------------------------------------------------ */

/** 文本归一：NFKC + 折叠空白 + 小写。**只用于分组/排序**，身份一律精确相等。 */
function normalizeLabel(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 日期归一：只接受 `YYYY-MM-DD`（可带时间后缀）。返回 `null` = 判不了。
 * 用 `Date.UTC` 自校验日历合法性（`2026-02-30` 会被 `Date` 滚到 3 月 ⇒ 不一致 ⇒ null）。
 * **不猜**：`2026/09/01`、`2026-9-1`、`09-01-2026` 一律 null。
 */
function normalizeReleaseDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** `YYYY-MM-DD` → 整数天（UTC）。只做日历算术，与"现在几点"无关。 */
function parseDay(value) {
  const normalized = normalizeReleaseDate(value);
  if (!normalized) return NaN;
  const [year, month, day] = normalized.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/** `to - from` 的整天数（都必须是可解析日期；否则 `null`，绝不猜）。 */
function daysBetween(from, to) {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / MS_PER_DAY);
}

/** 规范化人工状态：非法/缺失 ⇒ `unknown`（宁可不判，也不把脏值当 active）。 */
function statusOf(record) {
  const raw = normalizeLabel(record && record.status);
  return MODEL_STATUSES.includes(raw) ? raw : 'unknown';
}

/** 规范化角色：空 ⇒ `null`（由档位兜底）；不在枚举内 ⇒ 原样保留（由档位兜底并标 `tierDefaulted`）。 */
function resolveModelRole(record) {
  const raw = normalizeLabel(record && record.modelRole);
  return raw || null;
}

/**
 * 本条记录的官方发布日期。**只认 `releasedAt`**（`releaseDate` / `firstSeen` 都不是官方发布日期）。
 *
 * 返回 `{raw, normalized, provided}`：`raw` 是原文，`normalized` 是可判日（不可解析时为 null），
 * `provided` 区分"压根没写"（missing）与"写了但判不了"（unparsable）。
 */
function releaseDateOf(record) {
  const source = record && typeof record === 'object' ? record : {};
  const raw = source.releasedAt;
  const provided = raw !== null && raw !== undefined && String(raw).trim() !== '';
  return { raw: provided ? String(raw).trim() : null, normalized: normalizeReleaseDate(raw), provided };
}

/* ------------------------------------------------------------------ */
/* 档位                                                                */
/* ------------------------------------------------------------------ */

/** 角色 ⇒ 档位定义。角色为空或不在任何档里 ⇒ `null`（由调用方决定兜底）。 */
function tierForRole(modelRole, policy = MODEL_FRESHNESS_POLICY) {
  const wanted = normalizeLabel(modelRole);
  if (!wanted) return null;
  for (const tier of Object.values(policy.tiers)) {
    if (tier.modelRoles.some(role => normalizeLabel(role) === wanted)) return tier;
  }
  return null;
}

/** 档位定义 + 是否走了兜底档。永不抛错（坏策略 ⇒ 兜底档；兜底档也没了才抛）。 */
function tierOf(rawRole, policy = MODEL_FRESHNESS_POLICY) {
  const role = normalizeLabel(rawRole);
  const hit = tierForRole(role, policy);
  if (hit) return { tier: hit, role: role || null, defaulted: false };
  const fallback = policy.tiers[policy.defaultTier];
  if (!fallback) throw new Error(`策略里的 defaultTier「${policy.defaultTier}」不在 tiers 里 —— 策略表坏了`);
  return { tier: fallback, role: role || null, defaulted: true };
}

/** 所有已知角色（档位表展开）。 */
function knownModelRoles(policy = MODEL_FRESHNESS_POLICY) {
  return Object.keys(policy.tiers)
    .sort()
    .flatMap(name => policy.tiers[name].modelRoles.map(role => normalizeLabel(role)))
    .filter(Boolean);
}

/** 某一档的窗口（未知档名 ⇒ 兜底档的窗口）。 */
function windowsOfTier(tierName, policy = MODEL_FRESHNESS_POLICY) {
  const tier = (policy && policy.tiers && policy.tiers[tierName]) || policy.tiers[policy.defaultTier];
  return {
    tier: tier.tier,
    currentWindowDays: tier.currentWindowDays,
    agingWindowDays: tier.agingWindowDays
  };
}

/**
 * 把策略深拷贝成**可变**副本（`MODEL_FRESHNESS_POLICY` 是 `Object.freeze` 的）。
 * 阈值扰动实验（±N 天）必须拿副本改 —— 直接改共享常量会污染同进程里所有调用方。
 */
function clonePolicy(policy = MODEL_FRESHNESS_POLICY) {
  const clone = { ...policy, tiers: {} };
  for (const name of Object.keys(policy.tiers || {})) {
    const tier = policy.tiers[name];
    clone.tiers[name] = {
      ...tier,
      modelRoles: Array.isArray(tier.modelRoles) ? [...tier.modelRoles] : tier.modelRoles
    };
  }
  return clone;
}

/** 策略覆盖：调用方给的覆盖对象与共享常量都不被改（返回的永远是副本）。 */
function readPolicy(override) {
  if (!override) return clonePolicy(MODEL_FRESHNESS_POLICY);
  const merged = { ...MODEL_FRESHNESS_POLICY, ...override, tiers: {} };
  for (const name of Object.keys(MODEL_FRESHNESS_POLICY.tiers)) {
    merged.tiers[name] = { ...MODEL_FRESHNESS_POLICY.tiers[name], ...(override.tiers && override.tiers[name]) };
  }
  for (const name of Object.keys((override && override.tiers) || {})) {
    if (!merged.tiers[name]) merged.tiers[name] = { ...override.tiers[name] };
  }
  return clonePolicy(merged);
}

/** 策略指纹：写进报告，让「这一轮用的是哪版阈值」可见。 */
function policyDigestOf(policy) {
  const parts = [`v${policy.schemaVersion}`, `default=${policy.defaultTier}`];
  for (const name of Object.keys(policy.tiers).sort()) {
    const tier = policy.tiers[name];
    parts.push(`${name}=${tier.currentWindowDays}/${tier.agingWindowDays}`);
  }
  return parts.join(';');
}

/* ------------------------------------------------------------------ */
/* 比较组                                                              */
/* ------------------------------------------------------------------ */

/**
 * 一条记录的比较组键。`freshnessGroup` 优先（**逐条**覆盖）；没写就按三要素算，
 * 三要素任一缺失时退化（键里用 `""` 占位，并由 `keyDegraded` 标出来）。
 *
 * @returns {{key:string, degraded:boolean, source:'freshnessGroup'|'developer-family-role', parts:object}}
 */
function comparableGroupOf(record) {
  const source = record && typeof record === 'object' ? record : {};
  const parts = {
    developer: normalizeLabel(source.developer),
    family: normalizeLabel(source.family),
    modelRole: normalizeLabel(source.modelRole)
  };
  const override = normalizeLabel(source.freshnessGroup);
  if (override) return { key: override, degraded: false, source: 'freshnessGroup', parts };
  const degraded = !parts.developer || !parts.family || !parts.modelRole;
  return {
    key: [parts.developer, parts.family, parts.modelRole].join(GROUP_KEY_SEPARATOR),
    degraded,
    source: 'developer-family-role',
    parts
  };
}

/** 组键的可读形式（报告 / 错误信息用；分隔符换成 ` · `）。 */
function describeGroupKey(key) {
  return String(key === null || key === undefined ? '' : key)
    .split(GROUP_KEY_SEPARATOR)
    .map(part => (part === '' ? '(空)' : part))
    .join(' · ');
}

/** 稳定序：按 slug 的规范次序（保证输出与输入顺序无关）。 */
function sortBySlug(list) {
  return [...list].sort((a, b) => {
    const ak = normalizeLabel(a.slug);
    const bk = normalizeLabel(b.slug);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
}

/**
 * 组内"最新可比记录"的判据：**active** 且**有可解析发布日**的记录里日期最大者；
 * 同日期时按 slug 规范次序取唯一赢家（否则"最新是谁"会随输入顺序变，输出就不可重建）。
 *
 * 为什么排除 retired / unknown：它们**不参与新鲜度淘汰**。
 * 一条 retired 的记录若被当成"本组最新"，会让整组 active 模型变成"被一条不再展示的记录取代"，
 * 输出就成了「组里最新是 historical / unknown」这种自相矛盾（不变量 3 会当场红）。
 */
function winnerOfGroup(members) {
  let best = null;
  let bestDay = -Infinity;
  for (const member of sortBySlug(members)) {
    if (member.status !== 'active') continue;
    if (!member.releaseDate) continue;
    const day = parseDay(member.releaseDate);
    if (!Number.isFinite(day)) continue;
    if (day > bestDay) {
      best = member;
      bestDay = day;
    }
  }
  if (!best) return null;
  return { slug: best.slug, releaseDate: best.releaseDate, day: bestDay };
}

/**
 * 比较组索引：组键 → 组内成员（含 dedup、退化标记、最新赢家）。
 * 独立导出，便于自测直接钉「跨 role / family / developer 不互相淘汰」与「override 只影响指定组」。
 *
 * @returns {{groups:Array, byKey:Map, duplicates:Array, invalid:Array}}
 */
function buildComparableGroups(inputs = {}, policy = MODEL_FRESHNESS_POLICY) {
  const records = Array.isArray(inputs && inputs.models) ? inputs.models : [];
  const invalid = [];
  const duplicates = [];
  const seen = new Map();
  const byKey = new Map();

  records.forEach((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      invalid.push({ index, slug: null, problem: '记录必须是对象' });
      return;
    }
    const slug = String(record.slug === null || record.slug === undefined ? '' : record.slug).trim();
    if (!slug) {
      invalid.push({ index, slug: null, problem: 'slug 不能为空（registry 身份是唯一键）' });
      return;
    }
    if (seen.has(slug)) {
      duplicates.push({ index, slug, firstIndex: seen.get(slug), problem: 'slug 重复 —— 同一条身份只能出现一次' });
      return;
    }
    seen.set(slug, index);

    const group = comparableGroupOf(record);
    const release = releaseDateOf(record);
    const role = tierOf(record.modelRole, policy);
    const member = {
      index,
      slug,
      developer: group.parts.developer || null,
      family: group.parts.family || null,
      modelRole: role.role,
      status: statusOf(record),
      releaseDate: release.normalized,
      releaseDateRaw: release.raw,
      releaseDateProvided: release.provided,
      freshGroupOverride: group.source === 'freshnessGroup' ? group.key : null
    };
    if (!byKey.has(group.key)) {
      byKey.set(group.key, {
        key: group.key,
        description: describeGroupKey(group.key),
        keyDegraded: group.degraded,
        keySource: group.source,
        members: []
      });
    }
    byKey.get(group.key).members.push(member);
  });

  const groups = [];
  for (const key of [...byKey.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    const group = byKey.get(key);
    const newest = winnerOfGroup(group.members);
    const roles = group.members.map(member => member.modelRole).filter(Boolean).sort();
    const primaryRole = roles[0] || null;
    const tier = tierOf(primaryRole, policy);
    groups.push({
      key: group.key,
      description: group.description,
      keyDegraded: group.keyDegraded,
      keySource: group.keySource,
      tier: tier.tier.tier,
      currentWindowDays: tier.tier.currentWindowDays,
      agingWindowDays: tier.tier.agingWindowDays,
      modelRole: primaryRole,
      tierDefaulted: tier.defaulted,
      memberSlugs: sortBySlug(group.members).map(member => member.slug),
      activeCount: group.members.filter(member => member.status === 'active').length,
      datedCount: group.members.filter(member => member.releaseDate).length,
      latestComparableModel: newest ? newest.slug : null,
      latestComparableReleasedAt: newest ? newest.releaseDate : null,
      releaseGapDays: newest ? 0 : null,
      members: sortBySlug(group.members)
    });
  }

  return { groups, byKey, duplicates, invalid };
}

/* ------------------------------------------------------------------ */
/* 逐条派生                                                            */
/* ------------------------------------------------------------------ */

/**
 * 逐条派生 `catalogStatus` / `catalogReason`：**先判"这条自己能不能判"，再判组**。
 *
 * · `retired` ⇒ `historical`（人工依据驱动，新鲜度不参与）；
 * · `status=unknown` ⇒ `unknown`（`status-unknown-not-judged`；**不知道 ≠ 淘汰**）；
 * · 没有可解析的发布日 ⇒ `unknown`（`release-date-*` / `group-has-no-dated-model`），
 *   **绝不**因为"组里它最老"就 legacy；
 * · 其余按**相对本组最新**的 gap 判：`< current 窗口` ⇒ `current`；`< aging 窗口` ⇒ `aging`；
 *   否则 `legacy`（此时组里必然存在更新的可比记录 —— 比它新的那条 gap 更小）。
 */
function statusOfMember(member, group) {
  if (member.status === 'retired') {
    return { status: 'historical', reason: 'status-retired-human-evidence' };
  }
  if (member.status === 'unknown') {
    return { status: 'unknown', reason: 'status-unknown-not-judged' };
  }
  if (!member.releaseDate) {
    // "写了但判不了"（unparsable）与"这一组谁都没有日期"（group-has-no-dated-model）是两件事，
    // 不许含糊成一句"缺日期"：前者要人去修数据写法，后者要人去补证据。
    if (!member.releaseDateProvided) {
      return { status: 'unknown', reason: group.latestComparableModel ? 'release-date-missing' : 'group-has-no-dated-model' };
    }
    return { status: 'unknown', reason: 'release-date-unparsable' };
  }
  const gap = daysBetween(member.releaseDate, group.latestComparableReleasedAt);
  if (gap === null || !Number.isFinite(gap)) return { status: 'unknown', reason: 'release-date-unparsable' };
  if (gap < group.currentWindowDays) {
    return {
      status: 'current',
      reason: gap === 0 ? 'group-newest-within-current-window' : 'within-current-window'
    };
  }
  if (gap < group.agingWindowDays) {
    return { status: 'aging', reason: 'newer-comparable-exists' };
  }
  return { status: 'legacy', reason: 'outranked-beyond-aging-window' };
}

/* ------------------------------------------------------------------ */
/* 主派生                                                              */
/* ------------------------------------------------------------------ */

/** 组条目上的状态计数（与 entry 的判据同源，不重算）。 */
function statusCountsOf(entries) {
  const counts = {};
  for (const status of CATALOG_STATUSES) counts[status] = 0;
  for (const entry of entries) counts[entry.catalogStatus] = (counts[entry.catalogStatus] || 0) + 1;
  return counts;
}

/**
 * 主入口：派生目录状态。
 *
 * @param {{models:Array}} inputs 只收记录数组（**不读墙上时钟**，所以没有 `today`）
 * @param {object} [options]
 * @param {object} [options.policy] 覆盖策略（**深拷贝后**使用，绝不改传入对象/共享常量）
 * @param {boolean} [options.asserts] 默认 `true`：跑不变量自检并挂到 `invariantViolations`
 * @returns {{policy, policyDigest, entries, groups, census, duplicates, invalidInputs, invariantViolations}}
 */
function deriveCatalog(inputs = {}, options = {}) {
  const policy = readPolicy(options.policy);
  const base = buildComparableGroups(inputs, policy);

  const entries = [];
  for (const group of base.groups) {
    // 每条只判一次：计数与实际写出的 catalogStatus 必须来自同一次判定（两面数字打架是最难发现的错）
    const verdicts = new Map(group.members.map(member => [member.slug, statusOfMember(member, group)]));
    const counts = {};
    for (const status of CATALOG_STATUSES) counts[status] = 0;
    for (const verdict of verdicts.values()) counts[verdict.status] = (counts[verdict.status] || 0) + 1;
    for (const member of group.members) {
      const verdict = verdicts.get(member.slug);
      entries.push({
        slug: member.slug,
        developer: member.developer,
        family: member.family,
        modelRole: member.modelRole,
        status: member.status,
        releasedAt: member.releaseDate,
        releaseDateProvided: member.releaseDateProvided,
        releaseGapDays: member.releaseDate && group.latestComparableReleasedAt
          ? daysBetween(member.releaseDate, group.latestComparableReleasedAt)
          : null,
        comparableGroup: group.description,
        comparableGroupKey: group.key,
        comparableGroupKeyDegraded: group.keyDegraded,
        comparableGroupKeySource: group.keySource,
        comparableGroupSize: group.members.length,
        tier: group.tier,
        tierDefaulted: group.tierDefaulted,
        currentWindowDays: group.currentWindowDays,
        agingWindowDays: group.agingWindowDays,
        latestComparableModel: group.latestComparableModel,
        latestComparableReleasedAt: group.latestComparableReleasedAt,
        catalogStatus: verdict.status,
        catalogReason: verdict.reason,
        catalogReasonText: CATALOG_REASONS[verdict.reason] || verdict.reason,
        statusCounts: counts // 与组同一份计数（报告里不必再算一遍）
      });
    }
  }
  entries.sort((a, b) => {
    const ak = normalizeLabel(a.slug);
    const bk = normalizeLabel(b.slug);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });

  const groups = base.groups.map(group => {
    const members = entries.filter(entry => entry.comparableGroupKey === group.key);
    return {
      key: group.key,
      description: group.description,
      keyDegraded: group.keyDegraded,
      keySource: group.keySource,
      tier: group.tier,
      currentWindowDays: group.currentWindowDays,
      agingWindowDays: group.agingWindowDays,
      modelRole: group.modelRole,
      tierDefaulted: group.tierDefaulted,
      memberSlugs: group.memberSlugs,
      activeCount: group.activeCount,
      datedCount: group.datedCount,
      latestComparableModel: group.latestComparableModel,
      latestComparableReleasedAt: group.latestComparableReleasedAt,
      statusCounts: statusCountsOf(members),
      visibleByDefault: members.some(entry => DEFAULT_VISIBLE_CATALOG_STATUSES.includes(entry.catalogStatus))
    };
  });

  const violations = options.asserts === false ? [] : invariantsOf(entries, groups);

  return {
    policy,
    policyDigest: policyDigestOf(policy),
    entries,
    groups,
    census: censusOf(entries),
    duplicates: base.duplicates,
    invalidInputs: base.invalid,
    invariantViolations: violations
  };
}

/** 目录统计（报告用；纯计数）。 */
function censusOf(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const byStatus = {};
  for (const status of CATALOG_STATUSES) byStatus[status] = 0;
  const byTier = {};
  const byTierStatus = {};
  for (const entry of list) {
    byStatus[entry.catalogStatus] = (byStatus[entry.catalogStatus] || 0) + 1;
    const tier = entry.tier || '(未知档)';
    byTier[tier] = (byTier[tier] || 0) + 1;
    if (!byTierStatus[tier]) {
      byTierStatus[tier] = {};
      for (const status of CATALOG_STATUSES) byTierStatus[tier][status] = 0;
    }
    byTierStatus[tier][entry.catalogStatus] = (byTierStatus[tier][entry.catalogStatus] || 0) + 1;
  }
  return {
    total: list.length,
    byStatus,
    byTier,
    byTierStatus,
    visibleByDefault: list.filter(entry => DEFAULT_VISIBLE_CATALOG_STATUSES.includes(entry.catalogStatus)).length,
    hiddenByDefault: list.filter(entry => DEFAULT_HIDDEN_CATALOG_STATUSES.includes(entry.catalogStatus)).length
  };
}

/* ------------------------------------------------------------------ */
/* 不变量                                                              */
/* ------------------------------------------------------------------ */

/**
 * **牙**：四条硬不变量。返回违规列表（空 = 通过）。
 *
 * 1. 含 `active` 的比较组必须至少有一条 `current` 或 `unknown`（"整组被静默淘汰"最怕）；
 * 2. `unknown` 不许带 legacy 的语义（原因码必须在 `UNKNOWN_REASONS` 里，且不得是 superseded 码）；
 * 3. 本组最新可比记录必须 `gap === 0` 且 `catalogStatus === 'current'`（无发布日期时为 `unknown`）；
 * 4. `catalogReason` 必须在封闭表里，且组上的计数必须与条目一致（两面数字打架最难发现）。
 */
function invariantsOf(entries, groups) {
  const problems = [];
  const list = Array.isArray(entries) ? entries : [];
  const byGroup = new Map();
  for (const entry of list) {
    if (!byGroup.has(entry.comparableGroupKey)) byGroup.set(entry.comparableGroupKey, []);
    byGroup.get(entry.comparableGroupKey).push(entry);
  }

  for (const group of (Array.isArray(groups) ? groups : [])) {
    const members = byGroup.get(group.key) || [];
    const activeMembers = members.filter(entry => entry.status === 'active');
    if (activeMembers.length) {
      const visible = members.filter(entry => ['current', 'unknown'].includes(entry.catalogStatus));
      if (!visible.length) {
        problems.push({
          code: 'active-group-without-current-or-unknown',
          group: group.description,
          detail: `比较组「${group.description}」有 ${activeMembers.length} 条 active，却一条 current/unknown 都没有 —— 整组会被默认目录静默淘汰（最新：${group.latestComparableModel || '(无带日期的记录)'}）`
        });
      }
    }
    if (group.latestComparableModel) {
      const newest = members.find(entry => entry.slug === group.latestComparableModel);
      if (!newest) {
        problems.push({
          code: 'latest-comparable-model-missing',
          group: group.description,
          detail: `组内最新是 ${group.latestComparableModel}，但条目表里找不到它`
        });
      } else {
        if (newest.releaseGapDays !== 0) {
          problems.push({
            code: 'latest-comparable-gap-not-zero',
            group: group.description,
            slug: newest.slug,
            detail: `组内最新（${newest.slug}）的 releaseGapDays 是 ${newest.releaseGapDays}，必须是 0（相对本组最新算）`
          });
        }
        if (newest.catalogStatus !== 'current') {
          problems.push({
            code: 'latest-comparable-not-current',
            group: group.description,
            slug: newest.slug,
            detail: `组内最新（${newest.slug}）的 catalogStatus 是 ${newest.catalogStatus}，必须是 current`
          });
        }
      }
    }
    if (group.statusCounts) {
      const actual = statusCountsOf(members);
      for (const status of CATALOG_STATUSES) {
        if ((group.statusCounts[status] || 0) !== (actual[status] || 0)) {
          problems.push({
            code: 'group-status-counts-mismatch',
            group: group.description,
            detail: `组「${group.description}」的 ${status} 计数是 ${group.statusCounts[status] || 0}，条目里实际 ${actual[status] || 0}`
          });
        }
      }
    }
  }

  for (const entry of list) {
    if (!CATALOG_STATUSES.includes(entry.catalogStatus)) {
      problems.push({
        code: 'catalog-status-outside-enum',
        group: entry.comparableGroup,
        slug: entry.slug,
        detail: `${entry.slug} 的 catalogStatus「${entry.catalogStatus}」不在封闭枚举里`
      });
    }
    if (!CATALOG_REASONS[entry.catalogReason]) {
      problems.push({
        code: 'reason-code-outside-table',
        group: entry.comparableGroup,
        slug: entry.slug,
        detail: `${entry.slug} 的 catalogReason「${entry.catalogReason}」不在封闭表 CATALOG_REASONS 里`
      });
    }
    if (entry.catalogStatus === 'unknown' && SUPERSEDED_REASONS.includes(entry.catalogReason)) {
      problems.push({
        code: 'unknown-marked-as-superseded',
        group: entry.comparableGroup,
        slug: entry.slug,
        detail: `${entry.slug} 是 unknown 却带着「被更新记录取代」的原因码 —— unknown 绝不自动等于 legacy`
      });
    }
    if (entry.catalogStatus === 'unknown' && !UNKNOWN_REASONS.includes(entry.catalogReason)) {
      problems.push({
        code: 'unknown-reason-not-in-unknown-table',
        group: entry.comparableGroup,
        slug: entry.slug,
        detail: `${entry.slug} 是 unknown，原因码「${entry.catalogReason}」却不在 UNKNOWN_REASONS 里`
      });
    }
    if (['aging', 'legacy'].includes(entry.catalogStatus) && entry.releaseGapDays === 0) {
      problems.push({
        code: 'newest-marked-aging-or-legacy',
        group: entry.comparableGroup,
        slug: entry.slug,
        detail: `${entry.slug} 的 gap 是 0（本组最新）却被判成 ${entry.catalogStatus}`
      });
    }
  }
  return problems;
}

/** 目录摘要（文本报告用）。 */
function summarizeCatalog(report) {
  const census = report && report.census ? report.census : censusOf((report && report.entries) || []);
  const groups = (report && report.groups) || [];
  const empty = groups.filter(group => !group.visibleByDefault).map(group => group.description);
  return {
    total: census.total,
    byStatus: census.byStatus,
    visibleByDefault: census.visibleByDefault,
    hiddenByDefault: census.hiddenByDefault,
    groupCount: groups.length,
    groupsWithoutVisibleMember: empty,
    groupsWithoutVisibleMemberButActive: groups
      .filter(group => !group.visibleByDefault && group.activeCount > 0)
      .map(group => group.description),
    invariantViolations: ((report && report.invariantViolations) || []).length,
    duplicates: ((report && report.duplicates) || []).length,
    invalidInputs: ((report && report.invalidInputs) || []).length
  };
}

/* ------------------------------------------------------------------ */
/* 阈值扰动（灵敏度复查用；纯函数，不写文件）                            */
/* ------------------------------------------------------------------ */

/**
 * 在**同一批输入**上换一组阈值重跑：`currentDelta` / `agingDelta` 分别加到所有档的
 * current / aging 窗口上。**两条轴必须分别动**才有信息量：判据是相对差值，
 * 两个窗口同时平移同一个 N 天等于换了一把等长的尺子，结论永远不变（那也是有效结论，
 * 但必须如实记录成"该改动对本轮数据无影响"）。
 *
 * ⚠️ 扰动语义是**窗口收窄/放宽**：`currentDelta` 为负会让更多模型落出 current 窗口，
 * 正是"阈值调紧会不会把整族模型挤出默认目录"这个问题。
 */
function withPolicyDelta(models, options = {}) {
  const base = readPolicy(options.policy);
  const currentDelta = Number(options.currentDelta) || 0;
  const agingDelta = Number(options.agingDelta) || 0;
  const tiers = {};
  for (const [name, tier] of Object.entries(base.tiers)) {
    tiers[name] = {
      ...tier,
      currentWindowDays: tier.currentWindowDays + currentDelta,
      agingWindowDays: tier.agingWindowDays + agingDelta
    };
  }
  return deriveCatalog({ models }, { ...options, policy: { ...base, tiers } });
}

/**
 * 灵敏度复查：把基准策略与若干扰动策略逐条对比，列出**发生翻转的真实模型**与
 * 「整组只剩 0 个可见状态（current/unknown）」的组。
 *
 * 判据是「结果变了没有」，不是「数字变了没有」——阈值改了却没有任何模型翻转，
 * 说明这个改动对本轮数据无影响，那也是有效结论（必须如实记录，不能当作"测过了"）。
 *
 * @param {Array} models 规范化的记录数组（与 `deriveCatalog()` 同一入参）
 * @param {Array<{label:string,currentDelta:number,agingDelta:number}>} variants
 * @param {object} [options] 传给 `deriveCatalog()` 的选项（如 `policy`）
 */
function sensitivityOf(models, variants, options = {}) {
  const baseline = deriveCatalog({ models }, options);
  const baseBySlug = new Map(baseline.entries.map(entry => [entry.slug, entry]));
  const rows = [];
  for (const variant of (Array.isArray(variants) ? variants : [])) {
    const shifted = withPolicyDelta(models, {
      ...options,
      currentDelta: variant.currentDelta,
      agingDelta: variant.agingDelta
    });
    const flips = [];
    for (const entry of shifted.entries) {
      const before = baseBySlug.get(entry.slug);
      if (!before || before.catalogStatus === entry.catalogStatus) continue;
      flips.push({
        slug: entry.slug,
        group: entry.comparableGroup,
        tier: entry.tier,
        releaseGapDays: entry.releaseGapDays,
        from: before.catalogStatus,
        to: entry.catalogStatus,
        fromReason: before.catalogReason,
        toReason: entry.catalogReason
      });
    }
    rows.push({
      label: variant.label,
      currentDelta: variant.currentDelta,
      agingDelta: variant.agingDelta,
      policyDigest: shifted.policyDigest,
      census: shifted.census,
      flips: flips.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)),
      groupsWithoutVisibleMember: shifted.groups
        .filter(group => !group.visibleByDefault)
        .map(group => ({
          group: group.description,
          tier: group.tier,
          activeCount: group.activeCount,
          memberSlugs: group.memberSlugs,
          latestComparableModel: group.latestComparableModel,
          statusCounts: group.statusCounts
        })),
      invariantViolations: shifted.invariantViolations.map(problem => problem.code)
    });
  }
  return {
    baseline: {
      census: baseline.census,
      policyDigest: baseline.policyDigest,
      groups: baseline.groups,
      invariantViolations: baseline.invariantViolations
    },
    variants: rows
  };
}

module.exports = {
  MODEL_ROLES,
  MODEL_STATUSES,
  CATALOG_STATUSES,
  CATALOG_STATUS_LABEL,
  DEFAULT_VISIBLE_CATALOG_STATUSES,
  DEFAULT_HIDDEN_CATALOG_STATUSES,
  CATALOG_REASONS,
  UNKNOWN_REASONS,
  SUPERSEDED_REASONS,
  MODEL_FRESHNESS_POLICY,
  GROUP_KEY_SEPARATOR,
  normalizeLabel,
  normalizeReleaseDate,
  parseDay,
  daysBetween,
  statusOf,
  resolveModelRole,
  releaseDateOf,
  tierForRole,
  tierOf,
  knownModelRoles,
  windowsOfTier,
  readPolicy,
  clonePolicy,
  policyDigestOf,
  comparableGroupOf,
  describeGroupKey,
  sortBySlug,
  winnerOfGroup,
  buildComparableGroups,
  statusOfMember,
  deriveCatalog,
  censusOf,
  invariantsOf,
  summarizeCatalog,
  withPolicyDelta,
  sensitivityOf
};
