/**
 * v3.0 Stage D：**Model Registry**（模型身份层）的唯一判据入口。
 *
 * ## 这一层是什么 / 不是什么
 *
 * `scripts/data/models.json` 是**人工来源层**（形态与 `providers.json` 一致：`_` 开头的说明键 +
 * 以 slug 为键的条目）；根目录的 `models.json` 是**派生产物**（`{schemaVersion, updatedAt, count, models}`）。
 * `scripts/data/model-registry-links.json` 是关系层（显式映射）→ 根目录 `model-registry-links.json` 是它的派生产物。
 * `scripts/data/model-registry-gaps.json` 是**关系层的补充**：把"**不对应单一模型身份**"的套餐模型串
 * （模型池 / 系列名 / 一个串里多个模型 / registry 里没有的身份 / 图像语音资源）逐条登记下来，
 * 连理由一起留档。它**不发布**、不写 `registrySlug` —— 它的存在只是为了让"套餐侧一串都没漏判"
 * 变成一条硬门禁（`validatePlanModelCoverage()`），而不是覆盖报告里一个安静的数字。
 *
 * **Model Registry 是索引 / 身份层，不是价格真值层**：价格永远来自 `api-plans.json`，
 * 这一层只回答"这个模型是谁、叫什么、属于哪条产品线、在哪些平台的哪条记录里出现过"。
 *
 * ## 三条纪律
 *
 * 1. **身份靠显式映射，不靠相似度**。`api-plans.json` 的 `modelKey` 一个字节都不改；
 *    某个 `modelKey` 属于哪个 registry 模型，只写在关系层里（人工逐条写）。
 *    本模块只提供 `candidatesOf()` 产出**候选**（供人工 review），它永远不写生产映射 ——
 *    没有任何函数能返回"合并后的 registry"。
 * 2. **派生字段不进手写文件**。`id`（= sha1('model|' + slug) 前 12 位）、`firstSeen` / `lastSeen`
 *    （由引用方派生）、`updatedAt` / `count`（由构建期算）出现在来源层就是校验错误。
 *    与 `plans.json` 的 `derivedMetrics` 同一条纪律。
 * 3. **可重建**：同一份来源层永远得到同一串字节（键序固定、按 slug 规范排序、不读墙上时钟）。
 *
 * ## source pricing identity（唯一性的判据对象）
 *
 * 一条映射**认领**的不是"一个 modelKey 字符串"，而是**计价条目的身份集合**：
 * `(apiPlanId, modelKey, variant)`，其中 variant 是**当前 API schema 里那一条真实写着的值**
 * （`api-plan-schema.js` MATERIALIZE 后 `variant` 恒为具体字符串；解析层对 `null/undefined`
 * 的默认是 `standard`，本模块**不重做**那次默认，也不做"默认值折叠"）。
 *
 * `variant: null`（通配）的语义是"**这条记录里该 modelKey 的全部真实变体**"，所以展开后
 * 通配 `null` 与显式 `standard` 指向**同一个** identity —— 一条 source pricing identity
 * 至多归属 1 个 registry model（`validateLinks()` 的硬门禁），
 * 而**认领集合不相交**的合法不同变体分属两个 registry model 是允许的（§8 牙 #4）。
 *
 * 判据只写在这里：`validate.js`、`rebuild-models.js`、`check-models-reproducible.js`、
 * `check-model-registry-links.js`、`models-selftest.js` 全部调用它，不各写一份。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const provenance = require('./provenance');

const ROOT = path.join(__dirname, '..', '..');
const MODELS_FILE = path.join(__dirname, '..', 'data', 'models.json');
const LINKS_FILE = path.join(__dirname, '..', 'data', 'model-registry-links.json');
const GAPS_FILE = path.join(__dirname, '..', 'data', 'model-registry-gaps.json');
const PUBLISHED_MODELS_FILE = path.join(ROOT, 'models.json');
const PUBLISHED_LINKS_FILE = path.join(ROOT, 'model-registry-links.json');

/** 顶层 schemaVersion（形状变了要 +1，旧文件会被当场拒掉） */
const MODEL_SCHEMA_VERSION = 1;

/** slug 形状：与 providers.json / vendor-slugs.json 同一套（小写、可含点，模型名里点很常见） */
const SLUG_RE = /^[a-z0-9][a-z0-9.-]*$/;

/** 模型状态。`retired` **只由人工依据驱动**（官方页不再列出 / 官方公告下线），绝不由工具推断 */
const MODEL_STATUS = ['active', 'retired', 'unknown'];

/**
 * 关系层的依据枚举。前三条都要官方引文；`explicit-mapping` 是"人工显式映射但没有引文"的
 * 诚实出口（题面 D3：生产关系必须"显式映射**或**基于可靠官方证据"）—— 用它时 `evidence` 必须为空
 * 且 `note` 必须写明为什么没有引文。把"没有引文"写成一条引文才是真的造假。
 */
const LINK_BASIS = ['official-plan-page', 'official-pricing-page', 'official-model-id', 'explicit-mapping'];

/** 来源层条目的字段与顺序（slug 是键，不重复写） */
const ENTRY_KEY_ORDER = ['canonicalName', 'developer', 'owner', 'family', 'aliases', 'officialUrl', 'status', 'note'];

/** 派生产物里每个模型对象的字段与顺序（id / firstSeen / lastSeen 都是派生） */
const PUBLISHED_MODEL_KEY_ORDER = ['id', 'slug', 'canonicalName', 'developer', 'owner', 'family', 'aliases', 'officialUrl', 'status', 'firstSeen', 'lastSeen', 'note'];

/** 关系层两种记录的字段与顺序（API 侧 / Coding 侧） */
const API_LINK_KEY_ORDER = ['registrySlug', 'apiPlanId', 'modelKey', 'variant', 'basis', 'evidence', 'note'];
const CODING_LINK_KEY_ORDER = ['registrySlug', 'planId', 'modelName', 'basis', 'evidence', 'note'];

/**
 * 套餐侧模型串"**不对应单一模型身份**"的理由枚举（见 `scripts/data/model-registry-gaps.json`）。
 *
 * 这张表是**处置登记**，不是映射：能落到一个 registry 身份上的字符串必须去写映射，
 * 写进这张表就是错的（`validateGaps()` 会拿关系层来查这一点）。
 * 每个 code 都对应一种**可判定的缺失**，不是一个"其它"垃圾桶：
 *   · `pool`               官方只给模型池 / 自动调度，未逐一点名（且该条的 role 必须是 `pool`）
 *   · `series`             官方只给产品线系列名，未落到版本
 *   · `multi-model`        一个字符串里写了不止一个模型
 *   · `off-registry-model` 官方点名了单一模型，但该写法在 registry 里没有精确身份
 *   · `non-text-resource`  图像 / 语音等非文本资源，不是文本模型身份
 */
const GAP_REASONS = ['pool', 'series', 'multi-model', 'off-registry-model', 'non-text-resource'];

/** 处置登记的字段与顺序（`registrySlug` 故意不在其中：这张表永远不写映射） */
const GAP_KEY_ORDER = ['planId', 'modelName', 'role', 'reason', 'sourceUrl', 'note'];

/** 来源层里出现即错误的派生字段（它们只能算出来） */
const DERIVED_KEYS = ['id', 'registryModelId', 'firstSeen', 'lastSeen', 'updatedAt', 'count'];

const MAX_NAME_LENGTH = 80;
const MAX_ALIASES = 12;
const MAX_ALIAS_LENGTH = 60;
const MAX_FAMILY_LENGTH = 40;
const MAX_NOTE_LENGTH = 240;
const MAX_EVIDENCE = provenance.MAX_EVIDENCE_ITEMS;
const MAX_QUOTE = provenance.MAX_EVIDENCE_QUOTE_LENGTH;
const LIMITS = { recordsTotal: 2000, linksTotal: 4000 };

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function withoutMeta(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

/** 只用于**候选**与搜索的文本归一（NFKC + 折叠空白 + 小写）；生产身份一律精确相等 */
function normalizeText(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 模型 id：稳定、不可读、**不进手写文件**（与 deal/plan id 同一套做法） */
function modelIdOf(slug) {
  return crypto.createHash('sha1').update(`model|${slug}`).digest('hex').slice(0, 12);
}

function isHttpUrl(value) {
  return /^https?:\/\/\S+$/.test(String(value || ''));
}

function keyOrderOf(object) {
  return Object.keys(withoutMeta(object || {}));
}

/* ------------------------------------------------------------------ */
/* source pricing identity（唯一性的判据对象）                          */
/* ------------------------------------------------------------------ */

/**
 * 记录内某个 `modelKey` 的**真实** pricing entry 列表（顺序 = 记录里写着的顺序）。
 *
 * 身份一律**从当前 api schema 推导**，不写死 `standard` / `long_context` 之类字面量：
 * `api-plans.json` 里 `variant` 是每个计价条目自己的字段，这里只认它。
 * 返回的条目里可能带 `modelKey` / `variant` 以外的字段（rates 等），调用方只读这两项。
 */
function pricingEntriesOf(plan, modelKey) {
  const key = String(modelKey === null || modelKey === undefined ? '' : modelKey);
  return (plan && Array.isArray(plan.models) ? plan.models : [])
    .filter(item => item && String(item.modelKey) === key);
}

/** 记录内某个 `modelKey` 的真实 variant 列表（去重、保持记录顺序） */
function realVariantsOf(plan, modelKey) {
  const seen = new Set();
  for (const entry of pricingEntriesOf(plan, modelKey)) {
    if (entry.variant === null || entry.variant === undefined) continue;
    seen.add(String(entry.variant));
  }
  return [...seen];
}

/** variant 是否"未限定"（通配）。注意：schema 里的 `null` 与"字段没写"同义。 */
function isWildcardVariant(variant) {
  return variant === null || variant === undefined || variant === '';
}

/**
 * 一个 identity 的规范键：`planId \u0000 modelKey \u0000 variant`。
 * variant 是**展开后那个真实变体原文**——不做默认值折叠（`standard` 就是 `standard`，
 * 缺 variant 的条目同样落成 `standard`，两者只有一个键）。
 */
function sourcePricingIdentityKey(identity) {
  const item = identity && typeof identity === 'object' ? identity : {};
  const planId = item.apiPlanId !== undefined && item.apiPlanId !== null ? item.apiPlanId : item.planId;
  const modelKey = item.modelKey !== undefined ? item.modelKey : item.name;
  const variant = isWildcardVariant(item.variant) ? '(all)' : item.variant;
  return `${planId}\u0000${modelKey}\u0000${variant}`;
}

/** identity 的简短可读形式（错误信息用） */
function describeSourcePricingIdentity(identity) {
  return `(${identity.apiPlanId}, ${identity.modelKey}, ${identity.variant})`;
}

/**
 * **一条 link 认领的全部 source pricing identity**（本模块唯一的口径实现）。
 *
 * 返回 `{ identities, expanded, unresolved }`：
 *   · `identities` 展开后的 identity 数组（统一按 `(planId, modelKey, variant)` 规范键去重，
 *     顺序保持记录里的 variant 顺序）—— 冲突、覆盖率、任何"这条映射认领了什么"都读它，
 *     不再读三元组字面量 `${apiPlanId}\u0000${modelKey}\u0000${link.variant}`；
 *   · `expanded` 是否来自通配展开（`variant: null/undefined`）；
 *   · `unresolved` 通配展开**一条真实 variant 都没匹配到**（记录里没有这个 modelKey，
 *     或该 modelKey 没有任何真实 variant）⇒ 由 `validateLinks()` 报红，绝不静默放行。
 *
 * 通配语义 = **该记录中这个 `modelKey` 的全部真实变体**；`apiPlanId` / `modelKey` 找不到记录时
 * 返回空集合（"指向不存在的记录"由 `validateLinks()` 单独报红，两者不互相掩盖）。
 */
function sourcePricingIdentitiesOf(link, apiPlans) {
  const source = link && typeof link === 'object' ? link : {};
  const plan = (apiPlans || []).find(item => item && item.id === source.apiPlanId) || null;
  if (!plan) return { identities: [], expanded: false, unresolved: false };

  const key = String(source.modelKey === null || source.modelKey === undefined ? '' : source.modelKey);
  if (!key) return { identities: [], expanded: false, unresolved: false };

  const variants = realVariantsOf(plan, key);
  if (isWildcardVariant(source.variant)) {
    const identities = [];
    const seen = new Set();
    for (const variant of variants) {
      const identity = { apiPlanId: plan.id, modelKey: key, variant };
      const idKey = sourcePricingIdentityKey(identity);
      if (seen.has(idKey)) continue;
      seen.add(idKey);
      identities.push(identity);
    }
    return { identities, expanded: true, unresolved: variants.length === 0 };
  }

  // 显式 variant：即使那个变体在这条记录里并不存在，也把它当作一条 identity 返回（"认领了什么"
  // 与"这条认领站不站得住"是两件事，后者由 validateLinks 拿真实 variant 表判红）。
  return {
    identities: [{ apiPlanId: plan.id, modelKey: key, variant: source.variant }],
    expanded: false,
    unresolved: variants.length === 0
  };
}

/* ------------------------------------------------------------------ */
/* 读盘（永不 throw：缺失/坏文件由调用方决定怎么办）                     */
/* ------------------------------------------------------------------ */

function readJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { doc: null, file, missing: true, broken: null, raw: null };
    throw new Error(`${file} 读取失败: ${error.message}`);
  }
  try {
    return { doc: JSON.parse(raw), file, missing: false, broken: null, raw };
  } catch (error) {
    return { doc: null, file, missing: false, broken: `不是合法 JSON：${error.message}`, raw };
  }
}

/**
 * 手写 JSON 里**重复的顶层键**。
 *
 * 为什么需要它：`JSON.parse` 对重复键是"后者覆盖前者"，**一声不响**。于是来源层里写了两遍
 * 同一个 slug 时，前一条被静默吃掉，任何门禁都不会红 —— 而那正是"同一条身份被两个人各写一遍、
 * 系统只认后一个"的事故形状（审计 F-v3-registry-004 / M 层 duplicate-slug 变异：check exit 0）。
 *
 * 判定只在**顶层**（深度 1）做：更深的重复键不在身份层的判据范围里，顶层 slug 才是身份键。
 * 返回重复键的**原文**（去重后按出现顺序），非对象/解析失败时返回空数组（那种情况由 broken 报）。
 */
function duplicateTopLevelKeys(rawText) {
  const text = String(rawText === null || rawText === undefined ? '' : rawText);
  if (!text.trim()) return [];
  const keys = [];
  const seen = new Set();
  const duplicates = [];
  let depth = 0;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      // 读一整段 JSON 字符串（含转义），顺带判断它是不是"深度 1 的键"
      let end = index + 1;
      while (end < text.length) {
        if (text[end] === '\\') { end += 2; continue; }
        if (text[end] === '"') break;
        end += 1;
      }
      if (end >= text.length) break;
      const literal = text.slice(index, end + 1);
      let after = end + 1;
      while (after < text.length && /\s/.test(text[after])) after += 1;
      if (depth === 1 && text[after] === ':') keys.push(literal);
      index = end + 1;
      continue;
    }
    if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') depth -= 1;
    index += 1;
  }
  for (const literal of keys) {
    if (seen.has(literal)) {
      if (!duplicates.includes(literal)) duplicates.push(literal);
    } else seen.add(literal);
  }
  return duplicates;
}

/** registry 来源层：`{_note, _rules, <slug>: {...}}` */
function load(file = MODELS_FILE) {
  const loaded = readJson(file);
  if (loaded.missing || loaded.broken) return { ...loaded, table: {}, duplicateKeys: [] };
  if (!loaded.doc || typeof loaded.doc !== 'object' || Array.isArray(loaded.doc)) {
    return { ...loaded, doc: null, table: {}, broken: '顶层必须是对象（键 = 模型 slug）', duplicateKeys: [] };
  }
  return { ...loaded, table: withoutMeta(loaded.doc), duplicateKeys: duplicateTopLevelKeys(loaded.raw) };
}

/** 关系层来源文件 */
function loadLinks(file = LINKS_FILE) {
  const loaded = readJson(file);
  if (loaded.missing || loaded.broken) return { ...loaded, doc: null };
  const doc = loaded.doc;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ...loaded, doc: null, broken: '顶层必须是对象（{schemaVersion, links}）' };
  }
  return loaded;
}

/** 套餐侧处置登记的来源文件（形态与关系层同一条纪律：`_` 说明键 + schemaVersion + 一个数组） */
function loadGaps(file = GAPS_FILE) {
  const loaded = readJson(file);
  if (loaded.missing || loaded.broken) return { ...loaded, doc: null };
  const doc = loaded.doc;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ...loaded, doc: null, broken: '顶层必须是对象（{schemaVersion, declarations}）' };
  }
  return loaded;
}

/* ------------------------------------------------------------------ */
/* 索引                                                                */
/* ------------------------------------------------------------------ */

/**
 * slug / 别名 → slug 的**精确**索引。`byAlias` 的键是别名原文（不做归一）：
 * 别名里的大小写本身就是官方写法的一部分（`DeepSeek-V4.1-Flash`），归一化反而会让两条不同的
 * 官方写法撞成一个身份。
 */
function indexOf(table) {
  const bySlug = new Map();
  const byAlias = new Map();
  for (const [slug, entry] of Object.entries(table || {})) {
    bySlug.set(slug, entry);
    for (const alias of (entry && Array.isArray(entry.aliases) ? entry.aliases : [])) {
      if (!byAlias.has(alias)) byAlias.set(alias, slug);
    }
  }
  return { bySlug, byAlias };
}

/** slug 或别名 → 规范 slug（精确相等；找不到返回 null，绝不猜） */
function resolveSlug(value, table) {
  const key = String(value === null || value === undefined ? '' : value);
  if (!key) return null;
  const { bySlug, byAlias } = indexOf(table);
  if (bySlug.has(key)) return key;
  if (byAlias.has(key)) return byAlias.get(key);
  return null;
}

/* ------------------------------------------------------------------ */
/* 派生：firstSeen / lastSeen（由引用方派生）                            */
/* ------------------------------------------------------------------ */

/** API 侧链接 → 被引用的记录（找不到返回 null，由校验层报红） */
function apiTargetOf(link, apiPlans) {
  const source = link && typeof link === 'object' ? link : {};
  const plan = (apiPlans || []).find(item => item && item.id === source.apiPlanId) || null;
  if (!plan) return null;
  // 变体匹配与 `sourcePricingIdentitiesOf()` 共用同一支判据（通配 = 该 modelKey 在记录里的全部真实变体）
  const { identities } = sourcePricingIdentitiesOf(source, apiPlans);
  const wanted = new Set(identities.map(identity => sourcePricingIdentityKey(identity)));
  const entry = (plan.models || []).find(item => item && wanted.has(sourcePricingIdentityKey({
    apiPlanId: plan.id, modelKey: item.modelKey, variant: item.variant
  }))) || null;
  return entry ? { plan, entry } : null;
}

function codingTargetOf(link, plans) {
  const plan = (plans || []).find(item => item && item.id === link.planId) || null;
  if (!plan) return null;
  const entry = (plan.supportedModels || []).find(item => item && item.name === link.modelName) || null;
  return entry ? { plan, entry } : null;
}

/**
 * 一个模型的派生时间线：**只来自引用它的记录**（没有任何引用 ⇒ 两个 null）。
 * 从不读墙上时钟：`firstSeen` / `lastSeen` 都是记录里写着的日期。
 */
function timelineOf(slug, { table, links, apiPlans, plans } = {}) {
  const seen = [];
  for (const link of linksList(links)) {
    if (!link || link.registrySlug !== slug) continue;
    if (link.apiPlanId) {
      const hit = apiTargetOf(link, apiPlans);
      if (hit) seen.push({ first: hit.plan.firstSeen, last: hit.plan.lastSeen });
    }
    if (link.planId) {
      const hit = codingTargetOf(link, plans);
      if (hit) seen.push({ first: hit.plan.firstSeen, last: hit.plan.lastSeen });
    }
  }
  const firsts = seen.map(item => String(item.first || '')).filter(Boolean).sort();
  const lasts = seen.map(item => String(item.last || '')).filter(Boolean).sort();
  return {
    firstSeen: firsts.length ? firsts[0] : null,
    lastSeen: lasts.length ? lasts[lasts.length - 1] : null
  };
}

/** 接受 `{links:[...]}` 或裸数组 */
function linksList(linksDoc) {
  if (Array.isArray(linksDoc)) return linksDoc;
  if (linksDoc && Array.isArray(linksDoc.links)) return linksDoc.links;
  return [];
}

/** 接受 `{declarations:[...]}` 或裸数组 */
function declarationsList(gapsDoc) {
  if (Array.isArray(gapsDoc)) return gapsDoc;
  if (gapsDoc && Array.isArray(gapsDoc.declarations)) return gapsDoc.declarations;
  return [];
}

/** 处置登记的规范序键：先 planId，再 modelName */
function orderKeyOfDeclaration(declaration) {
  if (!declaration) return '';
  return `${declaration.planId}\u0000${declaration.modelName}`;
}

function sortDeclarations(declarations) {
  return [...(Array.isArray(declarations) ? declarations : [])].sort((a, b) => {
    const ak = orderKeyOfDeclaration(a);
    const bk = orderKeyOfDeclaration(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
}

/* ------------------------------------------------------------------ */
/* 校验：来源层                                                        */
/* ------------------------------------------------------------------ */

/**
 * registry 来源层自检。返回问题列表（空 = 通过）。
 *
 * @param {object} table 去掉 `_` 元信息后的 slug → 条目
 * @param {{extraDevelopers?:string[], duplicateKeys?:string[]}} [opts]
 *        `_developers_extra` 的键（不在 providers.json 里的开发者）；
 *        `duplicateKeys` 手写 JSON 里重复的**顶层 slug 键**原文（`load()` 从原文扫出来，
 *        `JSON.parse` 看不见它们 —— 前一条被静默覆盖）
 */
function validateRegistry(table, opts = {}) {
  const problems = [];
  if (!table || typeof table !== 'object' || Array.isArray(table)) {
    return ['models.json 必须是一个对象（键 = 模型 slug）'];
  }
  // 重复顶层 slug：`JSON.parse` 只留下最后一个，所以判据必须来自**原文**（load() 的 duplicateKeys）。
  for (const key of (opts.duplicateKeys || [])) {
    problems.push(`models.json 的顶层键 ${key} 重复出现 —— 同一个 slug（= 同一个 registry 身份）只能有一条；JSON.parse 会静默只留最后一条，前一条根本进不了判据`);
  }
  const slugs = Object.keys(table);
  if (!slugs.length) problems.push('models.json 里没有任何模型');

  const seenName = new Map();
  const seenAlias = new Map();
  const seenSlug = new Set(slugs);
  const extraDevelopers = new Set((opts.extraDevelopers || []).map(name => String(name)));

  for (const slug of slugs) {
    const where = `models.json 的 ${slug}`;
    const entry = table[slug];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      problems.push(`${where}: 必须是对象`);
      continue;
    }
    if (!SLUG_RE.test(slug)) problems.push(`${where}: slug 必须匹配 ${SLUG_RE}`);

    // 派生字段不得手写（id / firstSeen / lastSeen / updatedAt / count …）
    for (const key of keyOrderOf(entry)) {
      if (DERIVED_KEYS.includes(key)) {
        problems.push(`${where}: 出现派生字段 ${key} —— 它只能由构建期算出来（id 由 slug 派生、firstSeen/lastSeen 由引用方派生），不得手写`);
      } else if (!ENTRY_KEY_ORDER.includes(key)) {
        problems.push(`${where}: 未知字段 ${key}（允许：${ENTRY_KEY_ORDER.join(' / ')}）`);
      }
    }

    const canonicalName = String(entry.canonicalName || '');
    if (!canonicalName.trim()) problems.push(`${where}: canonicalName 不能为空`);
    else if (canonicalName.length > MAX_NAME_LENGTH) problems.push(`${where}: canonicalName 超过 ${MAX_NAME_LENGTH} 字`);
    else if (seenName.has(canonicalName)) {
      // 题面 §8 牙 #1：两个同名模型来自不同开发者，**不许被自动合并**。
      // 这条判定就是它的常驻形态：同一个规范名只能指向一个 slug；
      // 同名但不同开发者的模型必须各自有独立 slug（各写各的 developer）。
      problems.push(`${where}: canonicalName「${canonicalName}」与 ${seenName.get(canonicalName)} 重复 —— 同名不等于同一模型，同名不同开发者必须各自有独立 slug，不许合并`);
    } else seenName.set(canonicalName, slug);

    for (const field of ['developer', 'owner']) {
      const value = entry[field];
      if (value === null || value === undefined) continue;
      if (typeof value !== 'string' || !value.trim()) {
        problems.push(`${where}: ${field} 必须是 null 或非空字符串`);
        continue;
      }
      const allowed = (opts.developers || []).includes(value) || extraDevelopers.has(value);
      if (!allowed) {
        problems.push(`${where}: ${field}「${value}」不在允许的开发者名单里（providers.json 的规范显示名，或 models.json 的 _developers_extra 里逐条登记过的公司）—— 宁可写 null，也不要把一家没登记的公司写成看起来像身份的字符串`);
      }
    }

    const family = entry.family;
    if (family === null || family === undefined || typeof family !== 'string' || !family.trim()) {
      problems.push(`${where}: family 必须是非空字符串（取官方模型名的产品线前缀；不推断版本关系）`);
    } else if (family.length > MAX_FAMILY_LENGTH) problems.push(`${where}: family 超过 ${MAX_FAMILY_LENGTH} 字`);

    const aliases = entry.aliases;
    if (!Array.isArray(aliases)) {
      problems.push(`${where}: aliases 必须是数组（没有就写 []）`);
    } else {
      if (aliases.length > MAX_ALIASES) problems.push(`${where}: aliases 超过 ${MAX_ALIASES} 条`);
      const local = new Set();
      for (const alias of aliases) {
        if (typeof alias !== 'string' || !alias.trim()) { problems.push(`${where}: alias 必须是非空字符串`); continue; }
        if (alias === canonicalName) problems.push(`${where}: alias「${alias}」与 canonicalName 相同（别名要写"别的写法"，不是自己）`);
        if (alias.length > MAX_ALIAS_LENGTH) problems.push(`${where}: alias「${alias}」超过 ${MAX_ALIAS_LENGTH} 字`);
        if (local.has(alias)) problems.push(`${where}: alias「${alias}」在本条内重复`);
        local.add(alias);
        if (seenSlug.has(alias)) {
          problems.push(`${where}: alias「${alias}」与某个 registry slug 冲突 —— 别名与 slug 在同一个名字空间里，不能撞`);
        }
        if (seenAlias.has(alias)) {
          problems.push(`${where}: alias「${alias}」已被 ${seenAlias.get(alias)} 占用（同一个别名只能指向一个模型；这正是 §8 牙 #2）`);
        } else {
          seenAlias.set(alias, slug);
        }
      }
    }

    if (entry.officialUrl !== null && entry.officialUrl !== undefined) {
      if (typeof entry.officialUrl !== 'string' || !isHttpUrl(entry.officialUrl)) {
        problems.push(`${where}: officialUrl 必须是 null 或 http(s) URL`);
      } else if (provenance.isAggregatorUrl(entry.officialUrl)) {
        problems.push(`${where}: officialUrl 指向聚合站（${entry.officialUrl}）—— 只收官方页`);
      }
    }

    if (!MODEL_STATUS.includes(entry.status)) {
      problems.push(`${where}: status 必须是 ${MODEL_STATUS.join(' / ')} 之一（retired 只由人工依据驱动）`);
    }

    if (entry.note !== null && entry.note !== undefined) {
      if (typeof entry.note !== 'string' || !entry.note.trim()) problems.push(`${where}: note 必须是 null 或非空字符串`);
      else if (entry.note.length > MAX_NOTE_LENGTH) problems.push(`${where}: note 超过 ${MAX_NOTE_LENGTH} 字`);
    }
  }

  // 同一个别名/规范名不许同时指向两个 slug（上面已按条报过），这里再加一条"跨表"的：
  // 某个模型的 alias 等于另一个模型的 canonicalName ⇒ 身份已经混了
  for (const [alias, slug] of seenAlias) {
    if (seenName.has(alias) && seenName.get(alias) !== slug) {
      problems.push(`alias「${alias}」（${slug}）与模型 ${seenName.get(alias)} 的 canonicalName 相同 —— 一个名字不能既是甲的名字又是乙的别名`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* 校验：关系层                                                        */
/* ------------------------------------------------------------------ */

function keyOrderProblem(record, order, where, errors) {
  const keys = keyOrderOf(record);
  for (const key of keys) {
    if (DERIVED_KEYS.includes(key)) {
      // registryModelId 是**发布时注入**的派生字段：来源层里手写它同样是错误
      // （来源层只写 registrySlug，id 由构建期算）。
      errors.push(`${where}: 出现派生字段 ${key} —— 它只能由构建期算出来，不得手写`);
    } else if (!order.includes(key)) {
      errors.push(`${where}: 未知字段 ${key}（允许：${order.join(' / ')}）`);
    }
  }
  const expected = keys.filter(key => order.includes(key));
  const canonical = order.filter(key => keys.includes(key));
  if (JSON.stringify(expected) !== JSON.stringify(canonical)) {
    errors.push(`${where}: 字段顺序不是规范序（应为 ${canonical.join(' → ')}，实得 ${expected.join(' → ')}）`);
  }
}

/**
 * 链接的引文校验：**不允许制造第二个事实来源**。
 * 判据：链接里的每一条引文必须**逐字等于**被引用记录自己已经引用过的一条（field / sourceUrl / quote 全同）。
 * 这样"链接的引文"不可能被编出来 —— 它只能是记录里那条官方原文的副本。
 */
function evidenceProblems(evidence, record, where, errors) {
  if (evidence === undefined || evidence === null) {
    errors.push(`${where}: 缺少 evidence（没有官方引文的映射必须显式标成 basis=explicit-mapping 并写 note）`);
    return;
  }
  if (!Array.isArray(evidence)) { errors.push(`${where}: evidence 必须是数组`); return; }
  if (evidence.length > MAX_EVIDENCE) errors.push(`${where}: evidence 超过 ${MAX_EVIDENCE} 条`);
  const own = (record && Array.isArray(record.evidence) ? record.evidence : []);
  evidence.forEach((item, index) => {
    const itemWhere = `${where} evidence[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push(`${itemWhere}: 必须是对象`); return; }
    if (String(item.quote || '').length > MAX_QUOTE) errors.push(`${itemWhere}: 引文超过 ${MAX_QUOTE} 字`);
    if (!isHttpUrl(item.sourceUrl)) errors.push(`${itemWhere}: sourceUrl 必须是 http(s)`);
    else if (provenance.isAggregatorUrl(item.sourceUrl)) errors.push(`${itemWhere}: 出处是聚合站（${item.sourceUrl}）`);
    const match = own.find(own1 => own1
      && own1.field === item.field
      && own1.quote === item.quote
      && own1.sourceUrl === item.sourceUrl);
    if (!match) {
      errors.push(`${itemWhere}: 这条引文不是被引用记录自己的官方引文（field/sourceUrl/quote 必须与记录里的某一条逐字相同）—— 链接只允许复制记录的引文，不许新造一条`);
    }
  });
}

/**
 * 关系层校验。判据（与题面 D3 / §8 的牙一一对应）：
 *   · registrySlug 必须存在（牙 #2/#4：指向不存在的模型 ⇒ 红）；
 *   · API 侧：apiPlanId + modelKey 必须存在，variant 必须真的是该记录的 variant；
 *   · Coding 侧：planId + modelName 必须存在（自由文本 name 逐字相等）；
 *   · **一条 source pricing identity 至多归属 1 个 registry model**：
 *     判据对象是 `sourcePricingIdentitiesOf()` 展开后的 identity 集合
 *     （`variant: null` 展开成该 modelKey 在该记录里的全部真实 variant），
 *     不是三元组字面量 —— 所以"通配 `null` 一条 + 显式 `standard` 一条指向两个 slug"必红，
 *     而认领集合**不相交**的合法不同变体分属两个 slug 是允许的；
 *   · 通配展开一条真实 variant 都没匹配到 ⇒ 红（不许"什么都没认领"还静默通过）；
 *   · 同一 slug 的显式/通配重复认领 ⇒ 红（冗余映射会让人误以为关系层比实际细）；
 *   · **API 侧完整性**：每一条计价条目（真实 identity）都必须被某条映射认领 ——
 *     与 Coding 侧的"每个模型串都必须有结局"同一原则（没有"未判"这一格）；
 *   · basis 合法；有引文类 basis 必须有引文，explicit-mapping 必须没有引文且有 note。
 */
function validateLinks(doc, { table = {}, apiPlans = [], plans = [] } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['model-registry-links.json 必须是一个对象'];
  if (doc.schemaVersion !== MODEL_SCHEMA_VERSION) {
    errors.push(`schemaVersion 应为 ${MODEL_SCHEMA_VERSION}，实际 ${doc.schemaVersion}`);
  }
  for (const key of keyOrderOf(doc)) {
    if (['schemaVersion', 'links'].includes(key)) continue;
    errors.push(`顶层未知字段 ${key}（允许：schemaVersion / links / _ 开头的说明键）`);
  }
  const links = linksList(doc);
  if (!Array.isArray(doc.links)) errors.push('links 必须是数组');
  if (links.length > LIMITS.linksTotal) errors.push(`关系条数 ${links.length} 超过上限 ${LIMITS.linksTotal}`);
  // 没有输入不许假绿：registry 里有模型、关系层却一条映射都没有 ⇒ 那是"没写"，不是"干净"。
  if (!links.length && Object.keys(table || {}).length) {
    errors.push(`关系层一条映射都没有，而 models.json 里有 ${Object.keys(table).length} 个模型 —— 这不是"干净"，是关系层没写（没有映射的模型不会被任何页面引用）`);
  }

  // identity → 认领它的 slug（展开后的**唯一**归属表）
  const seenApi = new Map();
  const seenCoding = new Map();
  // 通配展开覆盖表：identity → { slug, source }（用于抓"同一 slug 的冗余重复认领"）
  const wildcardCoverage = new Map();

  links.forEach((link, index) => {
    const where = `links[${index}] ${link && (link.registrySlug || '(无 slug)')}`;
    if (!link || typeof link !== 'object' || Array.isArray(link)) { errors.push(`${where}: 必须是对象`); return; }

    const isApi = link.apiPlanId !== undefined || link.modelKey !== undefined;
    const isCoding = link.planId !== undefined || link.modelName !== undefined;
    if (isApi === isCoding) {
      errors.push(`${where}: 必须**恰好**是 API 侧（apiPlanId + modelKey）或 Coding 侧（planId + modelName）之一`);
      return;
    }
    keyOrderProblem(link, isApi ? API_LINK_KEY_ORDER : CODING_LINK_KEY_ORDER, where, errors);

    const slug = String(link.registrySlug || '');
    if (!table[slug]) {
      errors.push(`${where}: registrySlug「${slug}」不在 models.json 里（映射必须指向真实存在的模型）`);
    }
    if (!LINK_BASIS.includes(link.basis)) {
      errors.push(`${where}: basis 非法（${link.basis}），允许 ${LINK_BASIS.join(' / ')}`);
    }

    let record = null;
    if (isApi) {
      const plan = (apiPlans || []).find(item => item && item.id === link.apiPlanId);
      if (!plan) {
        errors.push(`${where}: apiPlanId ${link.apiPlanId} 不存在（映射指向了不存在的 API 计费记录）`);
      } else {
        const entry = (plan.models || []).find(item => item && item.modelKey === link.modelKey);
        record = plan;
        if (!entry) {
          errors.push(`${where}: modelKey「${link.modelKey}」在记录 ${plan.id} 里不存在（modelKey 改名后必须**人工**改这条映射，工具不许自动 merge）`);
        } else if (!isWildcardVariant(link.variant)
          && !(plan.models || []).some(item => item && item.modelKey === link.modelKey && item.variant === link.variant)) {
          errors.push(`${where}: variant「${link.variant}」不是记录 ${plan.id} 里的 variant`);
        }
      }

      // 唯一性判据：展开后的 identity 集合（不是三元组字面量）
      const claims = sourcePricingIdentitiesOf(link, apiPlans);
      if (claims.unresolved) {
        errors.push(`${where}: 通配映射（variant=${link.variant === undefined ? '未写' : 'null'}）在这条记录里一条真实 variant 都没匹配到 —— 它什么都没认领，不许静默通过`);
      }
      claims.identities.forEach(identity => {
        const idKey = sourcePricingIdentityKey(identity);
        if (seenApi.has(idKey) && seenApi.get(idKey) !== slug) {
          errors.push(`${where}: source pricing identity ${describeSourcePricingIdentity(identity)}（记录 ${identity.apiPlanId} · modelKey ${identity.modelKey} · variant ${identity.variant}）已经映射到 ${seenApi.get(idKey)} —— 同一条价格记录不许映射到两个 registry 模型`);
        } else {
          seenApi.set(idKey, slug);
        }
        // 同一 slug 的冗余重复认领：显式变体落在自己（或更早）的通配覆盖里
        const covered = wildcardCoverage.get(idKey);
        if (covered && covered.slug === slug && (covered.source < index || !claims.expanded)) {
          errors.push(`${where}: ${describeSourcePricingIdentity(identity)} 已经由 links[${covered.source}]（通配 variant=null）认领到同一个 registry 模型 ${slug} —— 冗余映射（它没有认领任何新条目）`);
        }
      });
      if (claims.expanded) {
        const item = { slug, source: index };
        claims.identities.forEach(identity => wildcardCoverage.set(sourcePricingIdentityKey(identity), item));
      }
    } else {
      const plan = (plans || []).find(item => item && item.id === link.planId);
      if (!plan) {
        errors.push(`${where}: planId ${link.planId} 不存在`);
      } else {
        record = plan;
        if (!(plan.supportedModels || []).some(item => item && item.name === link.modelName)) {
          errors.push(`${where}: modelName「${link.modelName}」不在套餐 ${plan.id} 的 supportedModels 里（Coding 侧只能逐字引用套餐已写下的名字）`);
        }
      }
      const pair = `${link.planId}\u0000${link.modelName}`;
      if (seenCoding.has(pair) && seenCoding.get(pair) !== slug) {
        errors.push(`${where}: (${link.planId}, ${link.modelName}) 已经映射到 ${seenCoding.get(pair)}`);
      } else seenCoding.set(pair, slug);
    }

    if (link.basis === 'explicit-mapping') {
      if (Array.isArray(link.evidence) && link.evidence.length) {
        errors.push(`${where}: basis=explicit-mapping 时 evidence 必须为空数组（有官方引文就该写成对应的引文类 basis）`);
      }
      if (typeof link.note !== 'string' || !link.note.trim()) {
        errors.push(`${where}: basis=explicit-mapping 必须写 note 说明"为什么这条映射没有官方引文"`);
      } else if (link.note.length > MAX_NOTE_LENGTH) {
        errors.push(`${where}: note 超过 ${MAX_NOTE_LENGTH} 字`);
      }
    } else {
      evidenceProblems(link.evidence, record, where, errors);
      if (link.evidence && Array.isArray(link.evidence) && !link.evidence.length) {
        errors.push(`${where}: basis=${link.basis} 要求至少一条官方引文（没有引文请改用 basis=explicit-mapping）`);
      }
      if (link.note !== undefined && link.note !== null) {
        if (typeof link.note !== 'string' || !link.note.trim()) errors.push(`${where}: note 必须是 null 或非空字符串`);
      }
    }
  });

  // API 侧完整性：每一条计价条目都必须被一条映射认领（与 Coding 侧"每一串都必须有结局"同级）。
  // 只在 registry 表非空时判 —— 空表会让"未映射"变成 67 条噪音，掩盖真正的那条错。
  if (Object.keys(table || {}).length) {
    const uncovered = [];
    for (const plan of (apiPlans || [])) {
      for (const entry of (plan && plan.models) || []) {
        if (!entry) continue;
        const identity = { apiPlanId: plan.id, modelKey: entry.modelKey, variant: entry.variant };
        if (!seenApi.has(sourcePricingIdentityKey(identity))) {
          uncovered.push(describeSourcePricingIdentity(identity));
        }
      }
    }
    if (uncovered.length) {
      errors.push(`API 侧 ${uncovered.length} 条计价条目（source pricing identity）既没有 registry 映射、也没有任何处置：${uncovered.slice(0, 5).join(' · ')}${uncovered.length > 5 ? ' …' : ''} —— 每一条都必须人工判一次（删掉一条映射就要在关系层里补回来，禁止静默留空）`);
    }
  }

  // 规范序：打乱人工输入仍必须得到同一串字节
  const sorted = sortLinks(links);
  if (JSON.stringify(links.map(orderKeyOfLink)) !== JSON.stringify(sorted.map(orderKeyOfLink))) {
    errors.push('links 的记录顺序不是规范序（应先按 registrySlug，再按 apiPlanId/planId，再按 modelKey/modelName）');
  }
  const keys = links.map(orderKeyOfLink);
  if (new Set(keys).size !== keys.length) errors.push('links 里有重复记录（同一 registrySlug + 同一记录 + 同一模型键只能有一条）');
  return errors;
}

function orderKeyOfLink(link) {
  if (!link) return '';
  if (link.apiPlanId !== undefined) {
    return `api\u0000${link.registrySlug}\u0000${link.apiPlanId}\u0000${link.modelKey}\u0000${link.variant === null || link.variant === undefined ? '' : link.variant}`;
  }
  return `coding\u0000${link.registrySlug}\u0000${link.planId}\u0000${link.modelName}`;
}

function sortLinks(links) {
  return [...(Array.isArray(links) ? links : [])].sort((a, b) => {
    const ak = orderKeyOfLink(a);
    const bk = orderKeyOfLink(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
}

/* ------------------------------------------------------------------ */
/* 校验：套餐侧模型串的处置登记 + 覆盖完整性                            */
/* ------------------------------------------------------------------ */

/**
 * 处置登记校验（`scripts/data/model-registry-gaps.json`）。判据：
 *   · 顶层形状 / schemaVersion / 未知字段（`registrySlug` 在这里是**未知字段**：本表永远不写映射）；
 *   · `modelName` 必须**逐字**等于该套餐 `supportedModels` 里已经写下的名字；
 *   · `role` 必须逐字等于那一条的 `role`（它是从数据抄来的对照值，抄错即红）；
 *   · **声明必须真的是"映射不上"**：`modelName` 归一后若精确落到某个 registry 身份（slug / 别名），
 *     这条就该去写映射 —— 拿"不对应单一模型身份"绕过映射即红（与 `planCandidatesOf()` 同一支索引）；
 *   · `reason` 只能取 `GAP_REASONS`；`reason==='pool'` 与记录 `role==='pool'` 必须**互为充要**；
 *   · `sourceUrl` 必须是该套餐自己的官方页（`officialUrl` 或 `sourceUrl`）；
 *   · `note` 必须写清"为什么不能对应单一模型身份"（不许留空、不许超长）；
 *   · 同一个 (planId, modelName) 不许既在本表里、又在关系层里有映射（自相矛盾）；
 *   · 规范序 + 不许重复。
 *
 * **完整性不在这里判**：一条串"既没映射也没声明"由 `validatePlanModelCoverage()` 报红 ——
 * 只有那里同时看得到关系层与本表。反过来，这里判的"声明其实能对上"是**本表自己的合法性**。
 */
function validateGaps(doc, { plans = [], links = {}, table = {} } = {}) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['model-registry-gaps.json 必须是一个对象'];
  if (doc.schemaVersion !== MODEL_SCHEMA_VERSION) {
    errors.push(`schemaVersion 应为 ${MODEL_SCHEMA_VERSION}，实际 ${doc.schemaVersion}`);
  }
  for (const key of keyOrderOf(doc)) {
    if (['schemaVersion', 'declarations'].includes(key)) continue;
    errors.push(`顶层未知字段 ${key}（允许：schemaVersion / declarations / _ 开头的说明键）`);
  }
  const declarations = declarationsList(doc);
  if (!Array.isArray(doc.declarations)) errors.push('declarations 必须是数组');
  if (declarations.length > LIMITS.linksTotal) errors.push(`处置条数 ${declarations.length} 超过上限 ${LIMITS.linksTotal}`);

  const mappedCoding = new Set();
  for (const link of linksList(links)) {
    if (link && link.planId !== undefined && link.modelName !== undefined) {
      mappedCoding.add(`${link.planId}\u0000${link.modelName}`);
    }
  }

  // 没有 registry 表就判不了"这条声明是不是其实能对上" ⇒ 不许假绿。
  // （独立审查员 2026-10-02 抓到：不传 table 时，declarations 里写一条能对上的名字会静默通过。）
  const normalized = normalizedIndexOf(table);
  if (!normalized.size && declarations.length) {
    errors.push(`没有拿到 registry 表（table 为空），无法判定这 ${declarations.length} 条声明是不是"其实能对上" —— 这不是通过`);
  }

  const seen = new Set();
  declarations.forEach((declaration, index) => {
    const where = `declarations[${index}] ${declaration && declaration.planId ? declaration.planId : '(无 planId)'}`;
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
      errors.push(`${where}: 必须是对象`);
      return;
    }
    keyOrderProblem(declaration, GAP_KEY_ORDER, where, errors);

    const plan = (plans || []).find(item => item && item.id === declaration.planId);
    let entry = null;
    if (!plan) {
      errors.push(`${where}: planId ${declaration.planId} 不存在（处置只能针对真实存在的套餐）`);
    } else {
      entry = (plan.supportedModels || []).find(item => item && item.name === declaration.modelName) || null;
      if (!entry) {
        errors.push(`${where}: modelName「${declaration.modelName}」不在套餐 ${plan.id} 的 supportedModels 里（本表只能逐字引用套餐已经写下的名字）`);
      } else if (declaration.role !== entry.role) {
        errors.push(`${where}: role「${declaration.role}」与套餐 ${plan.id} 里那一条的 role「${entry.role}」不一致（role 是从数据抄来的对照值，不许自己改）`);
      }
    }

    if (!GAP_REASONS.includes(declaration.reason)) {
      errors.push(`${where}: reason 非法（${declaration.reason}），允许 ${GAP_REASONS.join(' / ')}`);
    } else if (entry) {
      // pool 与记录 role 互为充要：池子必须写成 pool；写成 pool 的那一条，记录的 role 就必须是 pool。
      if (declaration.reason === 'pool' && entry.role !== 'pool') {
        errors.push(`${where}: reason=pool 但套餐里那一条的 role 是「${entry.role}」—— 官方没有说它是模型池，不许用 pool 兜底`);
      }
      if (declaration.reason !== 'pool' && entry.role === 'pool') {
        errors.push(`${where}: 套餐里那一条的 role 是 pool，reason 就必须是 pool（实得 ${declaration.reason}）`);
      }
    }

    if (plan) {
      if (!isHttpUrl(declaration.sourceUrl)) {
        errors.push(`${where}: sourceUrl 必须是 http(s)`);
      } else if (provenance.isAggregatorUrl(declaration.sourceUrl)) {
        errors.push(`${where}: sourceUrl 指向聚合站（${declaration.sourceUrl}）—— 处置只能针对官方页`);
      } else if (declaration.sourceUrl !== plan.officialUrl && declaration.sourceUrl !== plan.sourceUrl) {
        errors.push(`${where}: sourceUrl「${declaration.sourceUrl}」不是套餐 ${plan.id} 自己的官方页（${plan.officialUrl} / ${plan.sourceUrl}）`);
      }
    }

    if (typeof declaration.note !== 'string' || !declaration.note.trim()) {
      errors.push(`${where}: 必须写 note 说明"为什么这串不能对应单一模型身份"（这张表存的是理由，不是一个空表头）`);
    } else if (declaration.note.length > MAX_NOTE_LENGTH) {
      errors.push(`${where}: note 超过 ${MAX_NOTE_LENGTH} 字`);
    }

    const pair = `${declaration.planId}\u0000${declaration.modelName}`;
    if (seen.has(pair)) errors.push(`${where}: 同一个 (planId, modelName) 在本表里重复`);
    seen.add(pair);
    if (mappedCoding.has(pair)) {
      errors.push(`${where}: (${declaration.planId}, ${declaration.modelName}) 已经在关系层里有映射 —— 一件事不能既"已映射"又"声明不对应单一模型身份"`);
    }
    // "其实能对上"也必须红：与 planCandidatesOf() 用同一支归一索引，所以候选规则能算出来的串
    // 不许以"不对应单一模型身份"的名义留在这里。声明表只能装**真的对不上**的串。
    const exactHit = normalized.get(normalizeText(declaration.modelName));
    if (exactHit) {
      errors.push(`${where}: modelName「${declaration.modelName}」归一后精确落到 registry 身份「${exactHit}」—— 能对上的串必须去关系层写映射，不许用"不对应单一模型身份"绕过（候选规则 planCandidatesOf() 正是这么算的）`);
    }
  });

  const sorted = sortDeclarations(declarations);
  if (JSON.stringify(declarations.map(orderKeyOfDeclaration)) !== JSON.stringify(sorted.map(orderKeyOfDeclaration))) {
    errors.push('declarations 的记录顺序不是规范序（应先按 planId，再按 modelName）');
  }
  return errors;
}

/**
 * 覆盖完整性（**硬门禁**）：`plans.json` 里每一个模型串都必须有结局 ——
 * 落进关系层（显式映射）**或**落进处置登记表（明确不对应单一模型身份）。
 * 两者都没有 ⇒ 红。把"没判过"当成"不需要判"是这一层最要防的事：
 * 它不会有任何报错，只会在覆盖报告里安静地多出一行。
 */
function validatePlanModelCoverage({ table = {}, links = {}, gaps = {}, apiPlans = [], plans = [] } = {}) {
  const problems = [];
  if (!Array.isArray(plans) || !plans.length) {
    return ['plans 为空 —— 套餐侧覆盖完整性无从判定（这不是通过）'];
  }
  const coverage = coverageOf({ table, links, apiPlans, plans, gaps });
  coverage.unmappedPlanModels.forEach(item => {
    problems.push(`套餐 ${item.planId}（${item.provider}）的模型串「${item.modelName}」既没有 registry 映射（model-registry-links.json），也没有在 model-registry-gaps.json 里声明理由 —— 每一串都必须人工判一次（禁止静默留空）`);
  });
  return problems;
}

/* ------------------------------------------------------------------ */
/* 派生产物                                                            */
/* ------------------------------------------------------------------ */

/** 某个 slug 的规范数据（含派生字段） */
function modelRecordOf(slug, { table, links, apiPlans, plans } = {}) {
  const entry = table[slug];
  if (!entry) return null;
  const time = timelineOf(slug, { table, links, apiPlans, plans });
  const record = { id: modelIdOf(slug), slug };
  for (const key of PUBLISHED_MODEL_KEY_ORDER) {
    if (key === 'id' || key === 'slug') continue;
    if (key === 'firstSeen' || key === 'lastSeen') { record[key] = time[key]; continue; }
    record[key] = entry[key] === undefined ? null : entry[key];
  }
  return record;
}

/** 派生 `updatedAt`：全部派生 lastSeen 的最大值（不读墙上时钟） */
function canonicalUpdatedAt(models) {
  const dates = (models || []).map(model => String((model && model.lastSeen) || '').slice(0, 10))
    .filter(text => /^\d{4}-\d{2}-\d{2}$/.test(text)).sort();
  return dates.length ? `${dates[dates.length - 1]}T00:00:00+08:00` : null;
}

/** registry 来源层 + 关系层 → 派生的 `models.json` */
function publishedModels({ table, links, apiPlans, plans } = {}) {
  const models = Object.keys(table || {}).sort()
    .map(slug => modelRecordOf(slug, { table, links, apiPlans, plans }))
    .filter(Boolean);
  return {
    schemaVersion: MODEL_SCHEMA_VERSION,
    updatedAt: canonicalUpdatedAt(models),
    count: models.length,
    models
  };
}

/**
 * 关系层 → 派生的 `model-registry-links.json`。
 * `registryModelId` 是**注入的派生字段**（渲染层按 id 匹配，不必自己再 hash 一遍）；
 * 来源文件里手写它同样是错误。
 */
function publishedLinks(doc, table) {
  const links = sortLinks(linksList(doc)).map(link => {
    const out = {};
    for (const key of keyOrderOf(link)) {
      out[key] = link[key];
      if (key === 'registrySlug') out.registryModelId = modelIdOf(link.registrySlug);
    }
    if (out.registryModelId === undefined) out.registryModelId = modelIdOf(link.registrySlug);
    return out;
  });
  const dates = links.map(link => {
    const evidence = Array.isArray(link.evidence) ? link.evidence : [];
    return evidence.map(item => String((item && item.capturedAt) || '')).filter(Boolean);
  }).flat().filter(text => /^\d{4}-\d{2}-\d{2}$/.test(text)).sort();
  return {
    schemaVersion: MODEL_SCHEMA_VERSION,
    updatedAt: dates.length ? `${dates[dates.length - 1]}T00:00:00+08:00` : null,
    count: links.length,
    links
  };
}

/* ------------------------------------------------------------------ */
/* 覆盖报告                                                            */
/* ------------------------------------------------------------------ */

/**
 * 覆盖报告：哪些 source pricing identity / 套餐模型串还没有 registry 映射。
 * 与 `candidatesOf()` 一起，构成"检查过但没收录"的过程留痕。
 *
 * v3.0 修订（API 侧记账口径，2026-10-03）：`mappedApi` 曾经按 `${apiPlanId}\u0000${modelKey}`
 * 记一条 link 就算"整组已映射"—— `variant: null` 的通配映射会把该 modelKey 的**全部**变体
 * 一次性算成已覆盖，于是"展开后其实只认领了 1 条"的映射也能虚高覆盖率。现在改成
 * **按展开后的真实计价条目记账**（`sourcePricingIdentitiesOf()` 的 identity 集合），
 * 一条计价条目 = 一行，通配只能盖住它真实展开到的那些行。
 * `unmappedModelKeys` 因此逐行列出（带 `variant`），它是"**两处都没有**"的条目。
 *
 * v3.0 修订（套餐侧）：`plans.json` 的模型串是自由文本，结局只有两种 —— 映射或**显式声明**
 * "不对应单一模型身份"（`gaps`）。`unmappedPlanModels` 因此是"**两处都没有**"的串，
 * 它必须是空的（由 `validatePlanModelCoverage()` 判红）；已经声明的那些单独列在
 * `declaredPlanModels` 里，连理由一起报出来，不再混进"未映射"里假装成同一个数。
 */
function coverageOf({ table = {}, links = {}, gaps = {}, apiPlans = [], plans = [] } = {}) {
  const list = linksList(links);
  const mappedApi = new Set();
  const mappedCoding = new Set();
  const linkedSlugs = new Set();
  for (const link of list) {
    if (!link) continue;
    if (link.apiPlanId) {
      // 展开记账：通配映射只为它真实展开到的计价条目负责（不再按 (planId, modelKey) 整组算过）
      for (const identity of sourcePricingIdentitiesOf(link, apiPlans).identities) {
        mappedApi.add(sourcePricingIdentityKey(identity));
      }
    }
    if (link.planId) mappedCoding.add(`${link.planId}\u0000${link.modelName}`);
    if (link.registrySlug && table[link.registrySlug]) linkedSlugs.add(link.registrySlug);
  }
  const declaredCoding = new Map();
  for (const declaration of declarationsList(gaps)) {
    if (!declaration) continue;
    declaredCoding.set(`${declaration.planId}\u0000${declaration.modelName}`, declaration);
  }
  const unmappedModelKeys = [];
  for (const plan of apiPlans) {
    for (const entry of (plan.models || [])) {
      const identity = { apiPlanId: plan.id, modelKey: entry.modelKey, variant: entry.variant };
      if (mappedApi.has(sourcePricingIdentityKey(identity))) continue;
      unmappedModelKeys.push({
        apiPlanId: plan.id, provider: plan.provider, modelKey: entry.modelKey, variant: entry.variant
      });
    }
  }
  const unmappedPlanModels = [];
  const declaredPlanModels = [];
  let planModelStrings = 0;
  for (const plan of plans) {
    for (const entry of (plan.supportedModels || [])) {
      planModelStrings += 1;
      const key = `${plan.id}\u0000${entry.name}`;
      const declaration = declaredCoding.get(key);
      if (mappedCoding.has(key)) continue;
      if (declaration) {
        declaredPlanModels.push({
          planId: plan.id, provider: plan.provider, modelName: entry.name,
          role: entry.role, reason: declaration.reason, note: declaration.note
        });
      } else {
        unmappedPlanModels.push({ planId: plan.id, provider: plan.provider, modelName: entry.name });
      }
    }
  }
  const unlinkedModels = Object.keys(table).filter(slug => !linkedSlugs.has(slug));
  return {
    models: Object.keys(table).length,
    linkedModels: linkedSlugs.size,
    unlinkedModels,
    apiLinks: list.filter(link => link && link.apiPlanId).length,
    codingLinks: list.filter(link => link && link.planId).length,
    // API 侧按**展开条目**记账的三项：总条目 / 已被认领 / 未映射（后者逐行在 unmappedModelKeys 里）
    apiPricingItems: apiPlans.reduce((total, plan) => total + ((plan && plan.models) || []).length, 0),
    mappedApiEntries: mappedApi.size,
    unmappedModelKeys,
    planModelStrings,
    unmappedPlanModels,
    declaredPlanModels
  };
}

/**
 * **候选**（只供人工 review，绝不写生产映射）。
 *
 * 判据只有一条、且只做归一后的**精确相等**：把 api-plans 的 `modelKey` 与 registry 的
 * slug / 别名归一后逐字比较。没有 Levenshtein、没有子串、没有 LLM。
 * 输出永远带 `status: 'candidate'`；本模块**没有任何函数**能把它写成 link。
 */
/**
 * 归一后的**精确**索引：`normalizeText(slug|alias) → slug`。
 * 只有这一个索引，`candidatesOf()`（API 侧）与 `planCandidatesOf()`（套餐侧）共用同一支规则，
 * 免得两边各写一份、慢慢长出差异。
 */
function normalizedIndexOf(table) {
  const { bySlug, byAlias } = indexOf(table);
  const normalized = new Map();
  for (const slug of bySlug.keys()) normalized.set(normalizeText(slug), slug);
  for (const [alias, slug] of byAlias) if (!normalized.has(normalizeText(alias))) normalized.set(normalizeText(alias), slug);
  return normalized;
}

function candidatesOf({ table = {}, apiPlans = [] } = {}) {
  const normalized = normalizedIndexOf(table);

  const out = [];
  for (const plan of apiPlans) {
    for (const entry of (plan.models || [])) {
      const hit = normalized.get(normalizeText(entry.modelKey)) || normalized.get(normalizeText(entry.name));
      if (!hit) continue;
      out.push({
        status: 'candidate',
        rule: 'normalized-name-exact',
        registrySlug: hit,
        apiPlanId: plan.id,
        modelKey: entry.modelKey,
        modelName: entry.name,
        note: '归一后精确相等（NFKC + 折叠空白 + 小写），只作人工 review 用；写生产映射必须人工逐条确认'
      });
    }
  }
  return out.sort((a, b) => (a.apiPlanId + a.modelKey < b.apiPlanId + b.modelKey ? -1 : 1));
}

/**
 * **套餐侧候选**（`plans.json` 的 `supportedModels[].name` × registry）。
 *
 * 与 `candidatesOf()` 同一支判据、同一个索引：只做归一后的**精确相等**，没有 Levenshtein、
 * 没有子串、没有 LLM。输出永远带 `status: 'candidate'`，本模块**没有任何函数**能把它写成映射 ——
 * 它只负责让"哪些串其实一眼就能对上"这件事**由规则发现**，而不是靠人凭印象去挑。
 */
function planCandidatesOf({ table = {}, plans = [] } = {}) {
  const normalized = normalizedIndexOf(table);
  const out = [];
  for (const plan of plans) {
    for (const entry of (plan.supportedModels || [])) {
      const hit = normalized.get(normalizeText(entry.name));
      if (!hit) continue;
      out.push({
        status: 'candidate',
        rule: 'normalized-name-exact',
        registrySlug: hit,
        planId: plan.id,
        modelName: entry.name,
        note: '归一后精确相等（NFKC + 折叠空白 + 小写），只作人工 review 用；写生产映射必须人工逐条确认'
      });
    }
  }
  return out.sort((a, b) => (a.planId + a.modelName < b.planId + b.modelName ? -1 : 1));
}

/* ------------------------------------------------------------------ */
/* 汇总 / 断言出口                                                      */
/* ------------------------------------------------------------------ */

function summarize(registry) {
  const models = Array.isArray(registry) ? registry : ((registry && registry.models) || []);
  const byStatus = {};
  for (const status of MODEL_STATUS) byStatus[status] = 0;
  const developers = new Set();
  const families = new Set();
  for (const model of models) {
    byStatus[model.status] = (byStatus[model.status] || 0) + 1;
    if (model.developer) developers.add(model.developer);
    if (model.family) families.add(model.family);
  }
  return { total: models.length, byStatus, developers: developers.size, families: families.size, updatedAt: (registry && registry.updatedAt) || null };
}

/** 断言出口：不合法就 throw（构建期宁可停） */
function assertValidRegistry(table, opts = {}) {
  const problems = validateRegistry(table, opts);
  if (problems.length) {
    throw new Error(`models.json 不合法（${problems.length} 处）：\n  - ${problems.join('\n  - ')}`);
  }
  return table;
}

function assertValidLinks(doc, ctx = {}) {
  const problems = validateLinks(doc, ctx);
  if (problems.length) {
    throw new Error(`model-registry-links.json 不合法（${problems.length} 处）：\n  - ${problems.join('\n  - ')}`);
  }
  return doc;
}

function assertValidGaps(doc, ctx = {}) {
  const problems = validateGaps(doc, ctx);
  if (problems.length) {
    throw new Error(`model-registry-gaps.json 不合法（${problems.length} 处）：\n  - ${problems.join('\n  - ')}`);
  }
  return doc;
}

/** 覆盖完整性断言：任何一条套餐模型串"既没映射也没声明"都在这里停住 */
function assertPlanModelCoverage(ctx = {}) {
  const problems = validatePlanModelCoverage(ctx);
  if (problems.length) {
    throw new Error(`套餐侧模型串覆盖不完整（${problems.length} 处）：\n  - ${problems.join('\n  - ')}`);
  }
  return true;
}

/** 序列化：2 空格缩进 + 末尾换行（与其它派生产物同一套字节纪律） */
function serialize(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

module.exports = {
  ROOT,
  MODELS_FILE,
  LINKS_FILE,
  GAPS_FILE,
  PUBLISHED_MODELS_FILE,
  PUBLISHED_LINKS_FILE,
  MODEL_SCHEMA_VERSION,
  SLUG_RE,
  MODEL_STATUS,
  LINK_BASIS,
  GAP_REASONS,
  ENTRY_KEY_ORDER,
  PUBLISHED_MODEL_KEY_ORDER,
  API_LINK_KEY_ORDER,
  CODING_LINK_KEY_ORDER,
  GAP_KEY_ORDER,
  DERIVED_KEYS,
  LIMITS,
  MAX_ALIASES,
  MAX_ALIAS_LENGTH,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  withoutMeta,
  normalizeText,
  modelIdOf,
  keyOrderOf,
  duplicateTopLevelKeys,
  load,
  loadLinks,
  loadGaps,
  linksList,
  declarationsList,
  indexOf,
  normalizedIndexOf,
  resolveSlug,
  pricingEntriesOf,
  realVariantsOf,
  isWildcardVariant,
  sourcePricingIdentityKey,
  sourcePricingIdentitiesOf,
  describeSourcePricingIdentity,
  apiTargetOf,
  codingTargetOf,
  timelineOf,
  validateRegistry,
  validateLinks,
  validateGaps,
  validatePlanModelCoverage,
  orderKeyOfLink,
  orderKeyOfDeclaration,
  sortLinks,
  sortDeclarations,
  modelRecordOf,
  canonicalUpdatedAt,
  publishedModels,
  publishedLinks,
  coverageOf,
  candidatesOf,
  planCandidatesOf,
  summarize,
  assertValidRegistry,
  assertValidLinks,
  assertValidGaps,
  assertPlanModelCoverage,
  serialize
};
