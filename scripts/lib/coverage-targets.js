/**
 * coverage-expansion-v1：**Coverage Target 层**（覆盖意图层）的唯一判据入口。
 *
 * ## 这一层回答什么 / 不回答什么
 *
 * 之前整个仓库只有"盘上有什么"（deals / plans / api-plans / registry 的计数），
 * 没有任何地方写下"**我们打算覆盖什么**"。后果是覆盖报告只能对**已经出现的数据**做除法：
 * 一家平台一条记录都没有时，它在报告里根本不存在，缺口看起来永远比实际小。
 *
 * 这一层把"意图"变成一份**人工维护、唯一权威**的来源文件
 * （`scripts/data/coverage-targets.json`）：每个 provider 一行，写清
 * tier / role / intent / 每个维度的适用性与意图 / current targets / 人工裁决理由。
 * **它只写意图，绝不写状态** —— `COVERED` / `PARTIAL` / `MISSING` 一律由本模块从盘上事实**派生**。
 * 手写状态等于把"我声称覆盖了"当成"事实"，那正是这一轮要消灭的东西。
 *
 * 它**不发布**。这里当年写的是「不是公开数据集（不进 `PUBLIC_DATASETS` / Dataset Manifest / Feed /
 * Sitemap）」—— 那条清单、Manifest 与 Feed **都已经随「去数据暴露」整体下架**
 *（`lib/data-docs.js` 与 `lib/feeds.js` 两个模块本身也已删除），
 * 所以今天只剩「不进 Sitemap」这一条仍然按现役机制成立（它不是页面，sitemap 只收页面）。
 * 与 `scripts/data/models.json`、`providers.json` 同一类：内部身份/意图来源层，
 * 只在仓库内被报告与门禁读取。
 *
 * ## 派生七态（唯一出处在这里）
 *
 * 派生对象是 **(provider × dimension)** 格子，dimension ∈ `deals / coding / api / models`。
 * 七态**有优先级**（先命中先返回），顺序即下面这张表从上到下：
 *
 *   1. `NOT_APPLICABLE`  —— `dimensionIntent[dim] === null`：这家在这一维度**没有**可覆盖的东西
 *      （不提供该产品 / 不公开定价 / 在 deals 侧没有独立身份）。必须同时写 `applicabilityNote`。
 *   2. `DEFERRED`        —— 人工裁决"本轮不做，且写明了复查条件"（`rulings[].decision=deferred`）
 *      或 `schema-not-supported`（当前 schema 诚实表达不了）。**永不算 MISSING**。
 *   3. `UNVERIFIABLE`    —— 人工裁决"官方来源不可核"（`rulings[].decision=unverifiable`）。
 *      也**不算 MISSING**：它不是"漏了"，是"查过、核不了"。
 *   4. `BLOCKED_SOURCE`  —— 该维度声明的来源在 `scripts/data/source-health.json` 里
 *      **全部**不是 `healthy`，且盘上一条数据都没有：现在拿不到，不是没人管。
 *   5. `PARTIAL`         —— 有部分事实：声明的 current targets 只兑现了一部分
 *      （或声明全落空、但该维度另有别的记录）。
 *   6. `COVERED`         —— 声明的 current targets 全部兑现；没有更细声明时 = 该维度有记录。
 *   7. `MISSING`         —— 可覆盖、未延期、来源健康，**盘上一条数据都没有**。这才是真缺口。
 *
 * 优先级把"有理由的缺口"（1–4）与"真缺口"（7）分开：报告里 MISSING 必须能与
 * DEFERRED/UNVERIFIABLE/NOT_APPLICABLE/BLOCKED_SOURCE 分得开，否则"延期"会被静默读成"漏了"。
 *
 * ## 硬校验（红 = 意图层与事实层分家）
 *
 *   · `provider` 必须存在于 `scripts/data/providers.json`（指向不存在的身份 ⇒ 红）；
 *   · `models` 维度的 `registrySlug` 必须存在于 `scripts/data/models.json`（指向不存在的模型 ⇒ 红）；
 *   · `deals` 维度声明的 `source` 必须是**真实存在过的采集来源**
 *     （source-health 的 name 或 `deals.json` 里出现过的 `source`）；
 *   · `providers.json` 里每一个 provider 都必须在 Target 层有一行（**双向对账**：
 *     身份表与意图表不许分家 —— 少一行就是"这家平台没人宣称要覆盖"）；
 *   · 手写派生状态字段（`state` / `status` / `coverage` / `covered` …）一律红；
 *   · 顶层与记录内的重复键（`JSON.parse` 只留最后一个）一律红 —— 判据来自**原文**。
 *
 * ## 纯函数
 *
 * 本模块不读墙上时钟、不联网、不写盘。`load()` 只读一个文件；`deriveTargets()` 的输入
 * 是调用方交出的**事实快照**（`buildFacts()` 从盘上现场构造），所以自测可以零依赖地
 * 驱动全部七态，而不必造一份假数据文件。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const TARGETS_FILE = path.join(__dirname, '..', 'data', 'coverage-targets.json');

/** 顶层 schemaVersion（形状变了要 +1，旧文件被当场拒掉） */
const SCHEMA_VERSION = 1;

/** 四个维度（顺序即一切输出顺序） */
const DIMENSIONS = ['deals', 'coding', 'api', 'models'];

const DIMENSION_LABEL = {
  deals: 'Deals 优惠',
  coding: 'Coding 套餐',
  api: 'API 计费',
  models: '模型身份'
};

/** 派生七态 */
const STATES = {
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  DEFERRED: 'DEFERRED',
  UNVERIFIABLE: 'UNVERIFIABLE',
  BLOCKED_SOURCE: 'BLOCKED_SOURCE',
  PARTIAL: 'PARTIAL',
  COVERED: 'COVERED',
  MISSING: 'MISSING'
};

/** 报告里的固定输出序（与优先级无关：优先级见 ATTENTION_ORDER） */
const STATE_ORDER = ['COVERED', 'PARTIAL', 'MISSING', 'DEFERRED', 'UNVERIFIABLE', 'NOT_APPLICABLE', 'BLOCKED_SOURCE'];

/** "需要人来看"的优先级序（`overallState()` 用它挑一格代表一个 provider） */
const ATTENTION_ORDER = ['MISSING', 'PARTIAL', 'BLOCKED_SOURCE', 'UNVERIFIABLE', 'DEFERRED', 'COVERED', 'NOT_APPLICABLE'];

// t35 / M26：这里原来还有一个 `PRECEDENCE = [...]` 常量（外加一条导出），t17 实测**没有任何生产者读它**：
// 把它的顺序改掉，派生行为一个字节都不变 —— 但它读起来像权威判据，是"看起来是判据、其实是死代码"的漂移面。
// 已删除。**七态优先级的唯一判据出处是下面 `deriveDimension()` 的 if 链**（先命中先返回）；
// 本文件里不再有任何"看似参与判定"的常量表。要改优先级请改那串 if，并跑 coverage-targets-selftest。

/** provider 优先级档（tier）。一层一层的含义写在 report 的 Universe 一节 */
const TIERS = ['core', 'major', 'long-tail'];

const TIER_LABEL = { core: '核心', major: '重要', 'long-tail': '长尾' };

/** 这家 provider 在覆盖体系里的角色 */
const ROLES = ['model-developer', 'inference-platform', 'coding-product', 'tool-vendor', 'directory'];

const ROLE_LABEL = {
  'model-developer': '第一方模型开发者',
  'inference-platform': '托管 / 推理平台',
  'coding-product': '编程产品（套餐 / IDE）',
  'tool-vendor': '工具 / SaaS 厂商',
  directory: '目录 / 集市'
};

/**
 * 人工裁决的三种结局（**只有这三种**，且都不等于"覆盖"）：
 *   · `deferred`             本轮不做，必须写明 `revisitBy`（复查条件）；
 *   · `unverifiable`         查过，官方来源不可核；
 *   · `schema-not-supported` 官方定价存在，但当前数据 schema 诚实表达不了（不硬塞、不算漏）。
 *
 * 研究结论里的 `adopted` / `partial` **不写在这里** —— 那是"要不要做"的判断，
 * 做没做成由盘上事实派生（写进来就等于手写状态）。
 */
const RULING_DECISIONS = ['deferred', 'unverifiable', 'schema-not-supported'];

const DECISION_LABEL = {
  deferred: '延期（写明复查条件）',
  unverifiable: '不可核',
  'schema-not-supported': '当前 schema 表达不了'
};

/** 每个维度在 `currentTargets` 里用什么词写"要覆盖的那一条" */
const PAYLOAD_KEY_OF = { deals: 'source', coding: 'planName', api: 'modelKey', models: 'registrySlug' };

/** 顶层键的规范序（`_` 开头的说明键不算） */
const DOC_KEY_ORDER = ['schemaVersion', 'reviewedAt', 'targets'];

/** 每条 target 的字段与顺序 */
const TARGET_KEY_ORDER = ['provider', 'tier', 'role', 'intent', 'applicabilityNote', 'dimensionIntent', 'currentTargets', 'rulings', 'note'];

/** 每条 ruling 的字段与顺序 */
const RULING_KEY_ORDER = ['dimension', 'decision', 'reason', 'revisitBy'];

/**
 * 手写即错误的"状态"字段。它们是**派生**的：写进来源层就是"我声称覆盖了"，
 * 而"声称"与"事实"混在一格里之后，报告再也分不出两者（这一层最该防的事）。
 */
const FORBIDDEN_STATE_KEYS = ['state', 'status', 'coverage', 'covered', 'partial', 'missing', 'selfStatus', 'verdict', 'result'];

const MAX_INTENT = 120;
const MAX_DIMENSION_INTENT = 100;
const MAX_REASON = 240;
const MAX_NOTE = 240;
const MAX_REVISIT = 160;
const LIMITS = { targets: 200, currentTargetsPerTarget: 400, rulingsPerTarget: 200 };

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

/** 去掉 `_` 开头的元信息键（与 providers.json / models.json 同一套约定） */
function withoutMeta(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

function keyOrderOf(object) {
  return Object.keys(withoutMeta(object || {}));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 手写 JSON 里**任意层级**的重复键（`JSON.parse` 对重复键只留最后一个，一声不响）。
 *
 * 为什么不能在解析后的对象上看：解析完就看不见了。所以判据必须来自**原文**。
 * 路径按容器拼出来（`targets[3].tier`），数组下标也进路径 —— 这样报错能直接指到行。
 * 只认**对象键**（字符串后跟 `:`），不把字符串字面量误当键。
 */
function duplicateKeysDeep(rawText) {
  const text = String(rawText === null || rawText === undefined ? '' : rawText);
  if (!text.trim()) return [];
  const duplicates = [];
  // 根也是"对象形状"的容器（它的键就是顶层键）：三种容器里只有 array 需要按逗号数下标。
  const isObjectLike = node => node.type === 'object' || node.type === 'root';
  const stack = [{ type: 'root', path: '', keys: new Set(), index: 0 }];
  let pendingKey = null;
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      let end = index + 1;
      while (end < text.length) {
        if (text[end] === '\\') { end += 2; continue; }
        if (text[end] === '"') break;
        end += 1;
      }
      const literal = text.slice(index, end + 1);
      let after = end + 1;
      while (after < text.length && /\s/.test(text[after])) after += 1;
      const top = stack[stack.length - 1];
      if (isObjectLike(top) && text[after] === ':') {
        let key;
        try { key = JSON.parse(literal); } catch (error) { key = literal.slice(1, -1); }
        const where = top.path || '(顶层)';
        if (top.keys.has(key)) duplicates.push(`${where} 的键 ${literal} 重复出现`);
        top.keys.add(key);
        pendingKey = key;
      }
      index = end + 1;
      continue;
    }
    if (char === '{' || char === '[') {
      const parent = stack[stack.length - 1];
      // 整个文档的根容器：它的键就是顶层键，路径为空（不是某个键的值）。
      const containerPath = stack.length === 1
        ? ''
        : (isObjectLike(parent)
          ? `${parent.path ? `${parent.path}.` : ''}${pendingKey === null ? '(?)' : pendingKey}`
          : `${parent.path}[${parent.index}]`);
      stack.push({ type: char === '{' ? 'object' : 'array', path: containerPath, keys: new Set(), index: 0 });
      pendingKey = null;
      index += 1;
      continue;
    }
    if (char === '}' || char === ']') {
      if (stack.length > 1) stack.pop();
      pendingKey = null;
      index += 1;
      continue;
    }
    if (char === ',') {
      const top = stack[stack.length - 1];
      if (top.type === 'array') top.index += 1;
      index += 1;
      continue;
    }
    index += 1;
  }
  return duplicates;
}

/* ------------------------------------------------------------------ */
/* 读盘（永不 throw：缺失 / 坏文件由调用方决定怎么办）                    */
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
 * 读覆盖意图层。
 *
 * @returns {{doc:object|null, file:string, missing:boolean, broken:string|null, raw:string|null, duplicateKeys:string[]}}
 */
function load(file = TARGETS_FILE) {
  const loaded = readJson(file);
  if (loaded.missing || loaded.broken) return { ...loaded, duplicateKeys: [] };
  if (!isPlainObject(loaded.doc)) {
    return { ...loaded, doc: null, broken: '顶层必须是对象（{schemaVersion, reviewedAt, targets}）', duplicateKeys: [] };
  }
  return { ...loaded, duplicateKeys: duplicateKeysDeep(loaded.raw) };
}

/** 接受 `{targets:[...]}` 或裸数组（自测夹具更省事） */
function targetsList(doc) {
  if (Array.isArray(doc)) return doc;
  if (doc && Array.isArray(doc.targets)) return doc.targets;
  return [];
}

/** 规范序键：provider（唯一身份键） */
function orderKeyOfTarget(target) {
  return String((target && target.provider) || '');
}

function sortTargets(targets) {
  return [...(Array.isArray(targets) ? targets : [])].sort((a, b) => {
    const ak = orderKeyOfTarget(a);
    const bk = orderKeyOfTarget(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
}

/** 某个 target 在某个维度上声明的 current targets（保持记录顺序） */
function declaredTargetsOf(target, dimension) {
  return (Array.isArray(target && target.currentTargets) ? target.currentTargets : [])
    .filter(item => item && item.dimension === dimension);
}

/** 某个 target 在某个维度的 ruling（校验保证至多一条） */
function rulingOf(target, dimension) {
  const rulings = Array.isArray(target && target.rulings) ? target.rulings : [];
  return rulings.find(ruling => ruling && ruling.dimension === dimension) || null;
}

/** target → {dimension: 意图字符串或 null} */
function applicabilityOf(target) {
  const out = {};
  for (const dimension of DIMENSIONS) {
    out[dimension] = isNonEmptyString(target && target.dimensionIntent && target.dimensionIntent[dimension]);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 校验：来源层                                                        */
/* ------------------------------------------------------------------ */

function keyOrderProblem(record, order, where, problems) {
  const keys = keyOrderOf(record);
  for (const key of keys) {
    if (FORBIDDEN_STATE_KEYS.includes(key)) {
      problems.push(`${where}: 出现手写状态字段 ${key} —— 状态（COVERED / PARTIAL / MISSING / …）一律由 lib/coverage-targets.js 从盘上事实派生，来源层只写意图`);
    } else if (!order.includes(key)) {
      problems.push(`${where}: 未知字段 ${key}（允许：${order.join(' / ')}）`);
    }
  }
  const expected = keys.filter(key => order.includes(key));
  const canonical = order.filter(key => keys.includes(key));
  if (JSON.stringify(expected) !== JSON.stringify(canonical)) {
    problems.push(`${where}: 字段顺序不是规范序（应为 ${canonical.join(' → ')}，实得 ${expected.join(' → ')}）`);
  }
}

/**
 * 覆盖意图层自检。返回问题列表（空 = 通过）。
 *
 * @param {object} doc `scripts/data/coverage-targets.json` 的解析结果
 * @param {{
 *   providerTable?: object,   providers.json（去掉 `_` 键）—— provider 必须在这里
 *   modelsTable?: object,     scripts/data/models.json（去掉 `_` 键）—— registrySlug 必须在这里
 *   knownSources?: string[],  真实存在过的采集来源名（source-health 的 name ∪ deals.json 的 source）
 *   duplicateKeys?: string[]  load() 从**原文**扫出来的重复键
 * }} [ctx]
 * @returns {string[]}
 */
function validateTargets(doc, ctx = {}) {
  const problems = [];
  if (!isPlainObject(doc)) return ['coverage-targets.json 必须是一个对象（{schemaVersion, reviewedAt, targets}）'];

  const providerTable = isPlainObject(ctx.providerTable) ? ctx.providerTable : null;
  const modelsTable = isPlainObject(ctx.modelsTable) ? ctx.modelsTable : null;
  const knownSources = new Set((ctx.knownSources || []).map(name => String(name)));

  problems.push(...(ctx.duplicateKeys || []).map(where =>
    `coverage-targets.json ${where} —— JSON.parse 会静默只留最后一个，前一个根本进不了判据（同一件事不许写两遍）`));

  if (doc.schemaVersion !== SCHEMA_VERSION) {
    problems.push(`schemaVersion 应为 ${SCHEMA_VERSION}，实际 ${doc.schemaVersion}`);
  }
  for (const key of keyOrderOf(doc)) {
    if (!DOC_KEY_ORDER.includes(key)) problems.push(`顶层未知字段 ${key}（允许：${DOC_KEY_ORDER.join(' / ')} / _ 开头的说明键）`);
  }
  if (doc.reviewedAt !== null && doc.reviewedAt !== undefined) {
    if (typeof doc.reviewedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.reviewedAt)) {
      problems.push(`reviewedAt 必须是 null 或 YYYY-MM-DD（人工本轮裁决日期，不读墙上时钟）`);
    }
  }
  const targets = targetsList(doc);
  if (!Array.isArray(doc.targets)) problems.push('targets 必须是数组');
  if (!targets.length) problems.push('coverage-targets.json 里一条 target 都没有 —— 意图层是空的，"要覆盖什么"就无从谈起');
  if (targets.length > LIMITS.targets) problems.push(`target 条数 ${targets.length} 超过上限 ${LIMITS.targets}`);

  const seenProvider = new Set();
  targets.forEach((target, index) => {
    const where = `targets[${index}] ${target && target.provider ? target.provider : '(无 provider)'}`;
    if (!isPlainObject(target)) { problems.push(`${where}: 必须是对象`); return; }
    keyOrderProblem(target, TARGET_KEY_ORDER, where, problems);

    const provider = String(target.provider === null || target.provider === undefined ? '' : target.provider);
    if (!provider) problems.push(`${where}: provider 不能为空`);
    else if (providerTable && !Object.prototype.hasOwnProperty.call(providerTable, provider)) {
      problems.push(`${where}: provider「${provider}」不在 scripts/data/providers.json 里 —— 覆盖意图必须挂在真实存在的身份上（先登记 provider，或改掉这个名字）`);
    }
    if (seenProvider.has(provider)) problems.push(`${where}: provider「${provider}」在本文件里出现了不止一次（一家 platform 只能有一行意图）`);
    seenProvider.add(provider);

    if (!TIERS.includes(target.tier)) problems.push(`${where}: tier 非法（${target.tier}），允许 ${TIERS.join(' / ')}`);
    if (!ROLES.includes(target.role)) problems.push(`${where}: role 非法（${target.role}），允许 ${ROLES.join(' / ')}`);

    if (!isNonEmptyString(target.intent)) problems.push(`${where}: intent 不能为空（一句话写清"这家平台我们要覆盖什么"）`);
    else if (target.intent.length > MAX_INTENT) problems.push(`${where}: intent 超过 ${MAX_INTENT} 字`);

    const dimensionIntent = target.dimensionIntent;
    if (!isPlainObject(dimensionIntent)) {
      problems.push(`${where}: dimensionIntent 必须是对象（四个维度都要出现，值为意图字符串或 null）`);
    } else {
      const keys = keyOrderOf(dimensionIntent);
      for (const key of keys) {
        if (!DIMENSIONS.includes(key)) problems.push(`${where}: dimensionIntent 里的未知维度 ${key}（允许：${DIMENSIONS.join(' / ')}）`);
      }
      const missing = DIMENSIONS.filter(dimension => !keys.includes(dimension));
      if (missing.length) problems.push(`${where}: dimensionIntent 缺少维度 ${missing.join(' / ')} —— 四个维度必须逐个表态（适用写意图，不适用写 null），不许靠字段缺席推断`);
      const canonicalDimensions = DIMENSIONS.filter(dimension => keys.includes(dimension));
      if (JSON.stringify(keys) !== JSON.stringify(canonicalDimensions)) {
        problems.push(`${where}: dimensionIntent 的键序不是规范序（应为 ${canonicalDimensions.join(' → ')}，实得 ${keys.join(' → ')}）`);
      }
      let inapplicable = 0;
      for (const dimension of DIMENSIONS) {
        if (!keys.includes(dimension)) continue;
        const value = dimensionIntent[dimension];
        if (value === null) { inapplicable += 1; continue; }
        if (!isNonEmptyString(value)) {
          problems.push(`${where}: dimensionIntent.${dimension} 必须是 null（不适用）或非空意图字符串`);
        } else if (value.length > MAX_DIMENSION_INTENT) {
          problems.push(`${where}: dimensionIntent.${dimension} 超过 ${MAX_DIMENSION_INTENT} 字`);
        }
      }
      if (inapplicable > 0 && !isNonEmptyString(target.applicabilityNote)) {
        problems.push(`${where}: 有 ${
          inapplicable} 个维度标了"不适用"，必须写 applicabilityNote 说明为什么（"不适用"是一个需要理由的断言）`);
      }
      if (isNonEmptyString(target.applicabilityNote) && target.applicabilityNote.length > MAX_NOTE) {
        problems.push(`${where}: applicabilityNote 超过 ${MAX_NOTE} 字`);
      }
      if (target.applicabilityNote !== null && target.applicabilityNote !== undefined && !isNonEmptyString(target.applicabilityNote)) {
        problems.push(`${where}: applicabilityNote 必须是 null 或非空字符串`);
      }

      // rulings 只能针对"适用"的维度：对不适用的一格写延期是没有意义的
      for (const ruling of (Array.isArray(target.rulings) ? target.rulings : [])) {
        if (isPlainObject(ruling) && DIMENSIONS.includes(ruling.dimension) && keys.includes(ruling.dimension)
          && dimensionIntent[ruling.dimension] === null) {
          problems.push(`${where}: rulings 里给不适用维度 ${ruling.dimension} 写了裁决 —— 不适用的格子不需要延期/不可核（那是 applicabilityNote 的事）`);
        }
      }
    }
    if (target.note !== null && target.note !== undefined && !isNonEmptyString(target.note)) {
      problems.push(`${where}: note 必须是 null 或非空字符串`);
    } else if (isNonEmptyString(target.note) && target.note.length > MAX_NOTE) {
      problems.push(`${where}: note 超过 ${MAX_NOTE} 字`);
    }

    /* ---- currentTargets ---- */
    const currentTargets = target.currentTargets;
    if (!Array.isArray(currentTargets)) {
      problems.push(`${where}: currentTargets 必须是数组（没有就写 []）`);
    } else {
      if (currentTargets.length > LIMITS.currentTargetsPerTarget) {
        problems.push(`${where}: currentTargets 超过 ${LIMITS.currentTargetsPerTarget} 条`);
      }
      const seen = new Set();
      currentTargets.forEach((item, itemIndex) => {
        const itemWhere = `${where} currentTargets[${itemIndex}]`;
        if (!isPlainObject(item)) { problems.push(`${itemWhere}: 必须是对象`); return; }
        const keys = keyOrderOf(item);
        const dimension = String(item.dimension === null || item.dimension === undefined ? '' : item.dimension);
        if (!DIMENSIONS.includes(dimension)) {
          problems.push(`${itemWhere}: dimension 非法（${item.dimension}），允许 ${DIMENSIONS.join(' / ')}`);
          return;
        }
        const payloadKey = PAYLOAD_KEY_OF[dimension];
        for (const key of keys) {
          if (key !== 'dimension' && key !== payloadKey) {
            problems.push(`${itemWhere}: 未知字段 ${key}（${DIMENSION_LABEL[dimension]} 维度只写 dimension + ${payloadKey}）`);
          }
        }
        if (JSON.stringify(keys) !== JSON.stringify(['dimension', payloadKey].filter(key => keys.includes(key)))) {
          problems.push(`${itemWhere}: 字段顺序应为 dimension → ${payloadKey}（实得 ${keys.join(' → ')}）`);
        }
        const payload = item[payloadKey];
        if (!isNonEmptyString(payload)) {
          problems.push(`${itemWhere}: ${payloadKey} 不能为空`);
          return;
        }
        if (isPlainObject(dimensionIntent) && dimensionIntent[dimension] === null) {
          problems.push(`${itemWhere}: 这个维度标了"不适用"，却还写了 current target —— 两者只能选一个`);
        }
        if (dimension === 'models' && modelsTable && !Object.prototype.hasOwnProperty.call(modelsTable, payload)) {
          problems.push(`${itemWhere}: registrySlug「${payload}」不在 scripts/data/models.json 里 —— current target 指向不存在的模型身份一律红`);
        }
        if (dimension === 'deals' && knownSources.size && !knownSources.has(payload)) {
          problems.push(`${itemWhere}: source「${payload}」不是真实存在过的采集来源（source-health 的 name 或 deals.json 出现过的 source）—— 不许把权威来源写成一句自我声明`);
        }
        const pair = `${dimension}\u0000${payload}`;
        if (seen.has(pair)) problems.push(`${itemWhere}: (${dimension}, ${payload}) 重复声明`);
        seen.add(pair);
      });
      // 规范序：先按维度序，再按 payload（打乱人工输入也必须得到同一串字节）
      const orderOf = item => `${DIMENSIONS.indexOf(item && item.dimension)}\u0000${String((item && item[PAYLOAD_KEY_OF[item.dimension]]) || '')}`;
      const sorted = [...currentTargets].sort((a, b) => (orderOf(a) < orderOf(b) ? -1 : orderOf(a) > orderOf(b) ? 1 : 0));
      if (JSON.stringify(currentTargets.map(orderOf)) !== JSON.stringify(sorted.map(orderOf))) {
        problems.push(`${where}: currentTargets 不是规范序（先按维度 ${DIMENSIONS.join(' → ')}，再按目标名升序）`);
      }
    }

    /* ---- rulings ---- */
    const rulings = target.rulings;
    if (!Array.isArray(rulings)) {
      problems.push(`${where}: rulings 必须是数组（没有就写 []）`);
    } else {
      if (rulings.length > LIMITS.rulingsPerTarget) problems.push(`${where}: rulings 超过 ${LIMITS.rulingsPerTarget} 条`);
      const seenDimension = new Set();
      rulings.forEach((ruling, rulingIndex) => {
        const rulingWhere = `${where} rulings[${rulingIndex}]`;
        if (!isPlainObject(ruling)) { problems.push(`${rulingWhere}: 必须是对象`); return; }
        keyOrderProblem(ruling, RULING_KEY_ORDER, rulingWhere, problems);
        if (!DIMENSIONS.includes(ruling.dimension)) {
          problems.push(`${rulingWhere}: dimension 非法（${ruling.dimension}），允许 ${DIMENSIONS.join(' / ')}`);
        } else if (seenDimension.has(ruling.dimension)) {
          problems.push(`${rulingWhere}: 维度 ${ruling.dimension} 有不止一条裁决（同一格只能有一个结局，否则优先级就说不清了）`);
        } else {
          seenDimension.add(ruling.dimension);
        }
        if (!RULING_DECISIONS.includes(ruling.decision)) {
          problems.push(`${rulingWhere}: decision 非法（${ruling.decision}），允许 ${RULING_DECISIONS.join(' / ')}`);
        }
        if (!isNonEmptyString(ruling.reason)) {
          problems.push(`${rulingWhere}: 必须写 reason（"延期 / 不可核"都要有理由，否则它是静默缺口）`);
        } else if (ruling.reason.length > MAX_REASON) {
          problems.push(`${rulingWhere}: reason 超过 ${MAX_REASON} 字`);
        }
        const revisit = ruling.revisitBy;
        if (ruling.decision === 'deferred') {
          if (!isNonEmptyString(revisit)) {
            problems.push(`${rulingWhere}: decision=deferred 必须写 revisitBy（复查条件）—— 不写复查条件的延期就是永久静默缺口`);
          } else if (revisit.length > MAX_REVISIT) {
            problems.push(`${rulingWhere}: revisitBy 超过 ${MAX_REVISIT} 字`);
          }
        } else if (revisit !== null && revisit !== undefined) {
          problems.push(`${rulingWhere}: 只有 decision=deferred 才写 revisitBy（实得 ${JSON.stringify(revisit)}）`);
        }
      });
    }
  });

  // 双向对账：providers.json 里每一个身份都必须在意图层有一行。
  // 缺一行 = 这家平台"没人宣称要覆盖"，它在覆盖报告里会彻底消失 —— 正是本轮要消灭的盲区。
  if (providerTable) {
    for (const provider of Object.keys(providerTable)) {
      if (!seenProvider.has(provider)) {
        problems.push(`scripts/data/providers.json 的 ${provider} 在 coverage-targets.json 里没有任何一行意图 —— 身份层与意图层分家了（缺一行就是这家平台没人宣称要覆盖）`);
      }
    }
  }

  const sorted = sortTargets(targets);
  if (JSON.stringify(targets.map(orderKeyOfTarget)) !== JSON.stringify(sorted.map(orderKeyOfTarget))) {
    problems.push('targets 的记录顺序不是规范序（应按 provider 升序）');
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* 事实快照（从盘上现场构造，供 deriveTargets 用）                        */
/* ------------------------------------------------------------------ */

/**
 * 从盘上数据构造事实快照。**这是"事实"的唯一来源**（报告与自测共用同一支），
 * 派生层只读它、不再自己读盘 —— 否则"报告看的"与"门禁看的"会慢慢分家。
 *
 * @param {{
 *   providerTable?: object,       providers.json 的 table
 *   deals?: object[],             deals.json 的 deals 数组（全部记录）
 *   dealVendorOf?: Function,      一条 deal → {key}（A 空间厂商键；由 render-core 提供）
 *   today?: string,               YYYY-MM-DD（判定 deal 是否过期；不传则不做过期切分）
 *   plans?: object[],             plans.json 的 plans
 *   apiPlans?: object[],          api-plans.json 的 plans
 *   modelsTable?: object,         scripts/data/models.json 的 table（slug → 条目）
 *   publishedModels?: object[],   根目录 models.json 的 models 数组（派生层，用于 catalogStatus）
 * }} input
 */
function buildFacts(input = {}) {
  const providerTable = isPlainObject(input.providerTable) ? input.providerTable : {};
  const today = input.today === undefined ? null : input.today;

  const providers = {};
  const keyByVendorKey = new Map();
  const keyByName = new Map();
  for (const [key, entry] of Object.entries(providerTable)) {
    providers[key] = {
      name: String((entry && entry.name) || key),
      slug: (entry && entry.slug) || null,
      vendorKey: entry && entry.vendorKey !== undefined ? entry.vendorKey : null
    };
    if (providers[key].vendorKey) keyByVendorKey.set(providers[key].vendorKey, key);
    if (!keyByName.has(providers[key].name)) keyByName.set(providers[key].name, key);
  }

  const dimensions = {
    deals: { byProvider: {} },
    coding: { byProvider: {} },
    api: { byProvider: {} },
    models: { byProvider: {}, bySlug: {} }
  };
  const bucket = (dimension, key) => {
    const table = dimensions[dimension].byProvider;
    if (!table[key]) {
      table[key] = { count: 0, currentCount: 0, sources: {}, planNames: [], modelKeys: [], slugs: [] };
    }
    return table[key];
  };

  for (const deal of (Array.isArray(input.deals) ? input.deals : [])) {
    if (!isPlainObject(deal)) continue;
    const vendor = typeof input.dealVendorOf === 'function' ? input.dealVendorOf(deal) : null;
    const vendorKey = vendor && vendor.key ? String(vendor.key) : null;
    const key = vendorKey ? keyByVendorKey.get(vendorKey) : null;
    if (!key) continue;
    const entry = bucket('deals', key);
    entry.count += 1;
    const isDeal = deal.type === 'deal';
    const expired = deal.expiresAt && today ? String(deal.expiresAt).slice(0, 10) < today : false;
    if (isDeal && !expired) entry.currentCount += 1;
    const source = String(deal.source === null || deal.source === undefined ? '' : deal.source);
    if (source) entry.sources[source] = (entry.sources[source] || 0) + 1;
  }

  for (const plan of (Array.isArray(input.plans) ? input.plans : [])) {
    if (!isPlainObject(plan) || !plan.provider) continue;
    const entry = bucket('coding', plan.provider);
    entry.count += 1;
    if (isNonEmptyString(plan.planName)) entry.planNames.push(plan.planName);
  }

  for (const plan of (Array.isArray(input.apiPlans) ? input.apiPlans : [])) {
    if (!isPlainObject(plan) || !plan.provider) continue;
    const entry = bucket('api', plan.provider);
    entry.count += 1;
    for (const model of (Array.isArray(plan.models) ? plan.models : [])) {
      if (model && isNonEmptyString(model.modelKey)) entry.modelKeys.push(String(model.modelKey));
    }
  }

  const modelsTable = isPlainObject(input.modelsTable) ? input.modelsTable : {};
  const publishedBySlug = new Map();
  for (const model of (Array.isArray(input.publishedModels) ? input.publishedModels : [])) {
    if (isPlainObject(model) && model.slug) publishedBySlug.set(String(model.slug), model);
  }
  for (const [slug, entry] of Object.entries(modelsTable)) {
    const source = isPlainObject(entry) ? entry : {};
    const published = publishedBySlug.get(slug) || {};
    const developer = source.developer === undefined ? null : source.developer;
    const owner = source.owner === undefined ? null : source.owner;
    const key = [developer, owner].map(name => (name ? keyByName.get(String(name)) : null)).find(Boolean) || null;
    dimensions.models.bySlug[slug] = {
      slug,
      developer,
      owner,
      status: source.status === undefined ? null : source.status,
      releasedAt: source.releasedAt === undefined ? undefined : source.releasedAt,
      modelRole: source.modelRole === undefined ? undefined : source.modelRole,
      freshnessGroup: source.freshnessGroup === undefined ? undefined : source.freshnessGroup,
      catalogStatus: published.catalogStatus === undefined ? undefined : published.catalogStatus,
      catalogReason: published.catalogReason === undefined ? undefined : published.catalogReason,
      provider: key
    };
    if (key) {
      const row = bucket('models', key);
      row.count += 1;
      row.slugs.push(slug);
    }
  }

  const sourceHealth = {};
  const healthSources = (isPlainObject(input.sourceHealthDoc) && Array.isArray(input.sourceHealthDoc.sources))
    ? input.sourceHealthDoc.sources
    : [];
  for (const source of healthSources) {
    if (!isPlainObject(source) || !source.name) continue;
    sourceHealth[String(source.name)] = {
      source: source.source === undefined ? null : source.source,
      status: source.status === undefined ? null : source.status,
      reason: source.reason === undefined ? null : source.reason,
      consecutiveFailures: source.consecutiveFailures === undefined ? 0 : source.consecutiveFailures
    };
  }

  return {
    providers,
    dimensions,
    sourceHealth,
    dealSources: [...new Set((Array.isArray(input.deals) ? input.deals : [])
      .map(deal => (isPlainObject(deal) && isNonEmptyString(deal.source) ? deal.source : null))
      .filter(Boolean))].sort()
  };
}

/** 事实快照里某个 provider × 维度的读数（缺一律当 0，不许把"没有"读成 undefined 崩掉） */
function dataOf(facts, dimension, provider) {
  const table = facts && facts.dimensions && facts.dimensions[dimension] && facts.dimensions[dimension].byProvider;
  const row = table && table[provider];
  return row || { count: 0, currentCount: 0, sources: {}, planNames: [], modelKeys: [], slugs: [] };
}

/* ------------------------------------------------------------------ */
/* 派生：七态                                                          */
/* ------------------------------------------------------------------ */

/** 一条 current target 是否已在盘上兑现 */
function resolveTargetItem(item, dimension, target, facts) {
  const provider = target.provider;
  if (dimension === 'models') {
    const entry = facts && facts.dimensions && facts.dimensions.models && facts.dimensions.models.bySlug
      ? facts.dimensions.models.bySlug[item.registrySlug]
      : null;
    if (!entry) return { resolved: false, reason: 'registry 里没有这个模型身份' };
    const providerName = (facts.providers[provider] || {}).name || provider;
    if (entry.developer !== providerName && entry.owner !== providerName) {
      return {
        resolved: false,
        reason: `registry 里的归属是 developer=${entry.developer || '(空)'} / owner=${entry.owner || '(空)'}，不是这家 provider（${providerName}）`
      };
    }
    return { resolved: true, reason: null };
  }
  const row = dataOf(facts, dimension, provider);
  if (dimension === 'coding') {
    return row.planNames.includes(item.planName)
      ? { resolved: true, reason: null }
      : { resolved: false, reason: `plans.json 里没有这家 provider 的套餐「${item.planName}」` };
  }
  if (dimension === 'api') {
    return row.modelKeys.includes(item.modelKey)
      ? { resolved: true, reason: null }
      : { resolved: false, reason: `api-plans.json 里没有这家 provider 的计价条目 modelKey「${item.modelKey}」` };
  }
  const count = row.sources[item.source] || 0;
  return count > 0
    ? { resolved: true, reason: null }
    : { resolved: false, reason: `deals.json 里这家 provider 名下没有来自「${item.source}」的优惠` };
}

/**
 * 单个 (provider × dimension) 格子的七态派生。判据全文在这里，报告与自测都调它。
 *
 * ⚠️ **七态优先级的唯一判据出处就是下面这串 if**（先命中先返回，顺序即本文件头部那张表）。
 * 本文件里**没有**任何"常量优先级表"参与判定 —— t35/M26 删掉了那个只定义、没人读的
 * `PRECEDENCE`（改它的顺序不影响任何行为，却看起来像权威判据）。要改优先级：
 * 改这串 if 的顺序，然后跑 `npm run selftest:coverage-targets`（它有一条真牙：
 * 给 DEFERRED 分支加「无记录 ⇒ MISSING」短路会立刻变红）。
 *
 * @returns {{dimension:string, state:string, reason:string|null, present:number, declared:number,
 *   resolved:number, items:object[], sources:object[], ruling:object|null, intent:string|null}}
 */
function deriveDimension(target, dimension, facts) {
  const intent = target && target.dimensionIntent ? target.dimensionIntent[dimension] : null;
  const provider = target && target.provider;
  const providerName = (facts.providers && facts.providers[provider] ? facts.providers[provider].name : null) || provider;
  const applicable = isNonEmptyString(intent);
  const declared = declaredTargetsOf(target, dimension);
  const row = dataOf(facts, dimension, provider);
  const ruling = rulingOf(target, dimension);
  const items = declared.map(item => {
    const payloadKey = PAYLOAD_KEY_OF[dimension];
    const outcome = resolveTargetItem(item, dimension, target, facts);
    return { dimension, value: item[payloadKey], resolved: outcome.resolved, reason: outcome.reason };
  });
  const resolved = items.filter(item => item.resolved).length;
  const sources = declared
    .filter(item => isNonEmptyString(item.source))
    .map(item => {
      const health = (facts.sourceHealth || {})[item.source] || null;
      return { name: item.source, health, observed: row.sources[item.source] || 0 };
    });
  const base = {
    dimension,
    provider,
    providerName,
    intent: applicable ? intent : null,
    present: row.count,
    currentPresent: row.currentCount,
    declared: declared.length,
    resolved,
    items,
    sources,
    ruling: ruling || null
  };
  const cell = (state, reason) => ({ ...base, state, reason: reason || null });

  // ================= 七态判据（唯一出处；先命中先返回） =================
  // 顺序即本文件头部那张表：NOT_APPLICABLE → DEFERRED → UNVERIFIABLE → BLOCKED_SOURCE → PARTIAL/COVERED/MISSING。
  // 没有任何常量表参与这里（t35/M26 删掉了 PRECEDENCE）—— 判据就是下面这几条 if。
  // 1. 不适用
  if (!applicable) return cell(STATES.NOT_APPLICABLE, target.applicabilityNote || '人工标注"不适用"');

  // 2 / 3. 人工裁决的两种"有理由的缺口"：延期的**永不算 MISSING**
  if (ruling) {
    if (ruling.decision === 'unverifiable') {
      return cell(STATES.UNVERIFIABLE, `人工裁决不可核：${ruling.reason}`);
    }
    return cell(STATES.DEFERRED, ruling.decision === 'deferred'
      ? `人工裁决延期：${ruling.reason}（复查条件：${ruling.revisitBy}）`
      : `人工裁决"当前 schema 表达不了"：${ruling.reason}`);
  }

  // 4. 来源全坏且一条数据都没有 ⇒ 现在拿不到（不是没人管）
  const unhealthy = sources.filter(source => source.health && source.health.status && source.health.status !== 'healthy');
  if (row.count === 0 && sources.length > 0 && unhealthy.length === sources.length) {
    const detail = unhealthy.map(source => `${source.name}(${source.health.status}${source.health.reason ? '/' + source.health.reason : ''})`).join('、');
    return cell(STATES.BLOCKED_SOURCE, `声明的来源全部不健康且盘上无记录：${detail}`);
  }

  // 5–7. 由盘上事实决定
  if (!declared.length) {
    return row.count > 0
      ? cell(STATES.COVERED, `有 ${row.count} 条记录（未声明更细的 current target）`)
      : cell(STATES.MISSING, '可覆盖、未延期、来源健康，但盘上一条记录都没有');
  }
  if (resolved === declared.length) {
    return cell(STATES.COVERED, `声明的 ${declared.length} 条 current target 全部在盘上兑现`);
  }
  if (resolved > 0) {
    return cell(STATES.PARTIAL, `声明的 ${declared.length} 条 current target 只兑现 ${resolved} 条`);
  }
  return row.count > 0
    ? cell(STATES.PARTIAL, `声明的 ${declared.length} 条 current target 一条都没兑现，但该维度另有 ${row.count} 条记录`)
    : cell(STATES.MISSING, `声明的 ${declared.length} 条 current target 一条都没兑现，且该维度没有任何记录`);
}

/** 一格代表一个 provider：按"需要人来看"的优先级取第一个命中的状态 */
function overallState(cells) {
  const states = DIMENSIONS.map(dimension => cells[dimension] && cells[dimension].state).filter(Boolean);
  for (const state of ATTENTION_ORDER) {
    if (states.includes(state)) return state;
  }
  return STATES.NOT_APPLICABLE;
}

/**
 * 派生整份意图层的七态。
 *
 * @returns {{
 *   dimensions: string[],
 *   states: object,         每个状态命中的格子数
 *   targets: object[],      每个 provider：{provider, name, tier, role, intent, overall, dimensions:{...}}
 *   rows: object[],         扁平行（provider → 维度），报告直接打印它
 *   deferred: object[], unverifiable: object[], notApplicable: object[],
 *   blocked: object[], missing: object[], partial: object[], covered: object[]
 * }}
 */
function deriveTargets(doc, facts = {}) {
  const providerFacts = facts.providers || {};
  const rows = [];
  const targets = [];
  for (const target of sortTargets(targetsList(doc))) {
    if (!isPlainObject(target)) continue;
    const cells = {};
    for (const dimension of DIMENSIONS) {
      const cell = deriveDimension(target, dimension, facts);
      cells[dimension] = cell;
      rows.push(cell);
    }
    targets.push({
      provider: target.provider,
      name: providerFacts[target.provider] ? providerFacts[target.provider].name : null,
      tier: target.tier,
      role: target.role,
      intent: target.intent,
      overall: overallState(cells),
      dimensions: cells
    });
  }
  const states = {};
  for (const state of STATE_ORDER) states[state] = 0;
  for (const row of rows) states[row.state] = (states[row.state] || 0) + 1;
  const pick = state => rows.filter(row => row.state === state);
  return {
    dimensions: DIMENSIONS,
    states,
    targets,
    rows,
    covered: pick(STATES.COVERED),
    partial: pick(STATES.PARTIAL),
    missing: pick(STATES.MISSING),
    deferred: pick(STATES.DEFERRED),
    unverifiable: pick(STATES.UNVERIFIABLE),
    notApplicable: pick(STATES.NOT_APPLICABLE),
    blocked: pick(STATES.BLOCKED_SOURCE)
  };
}

/* ------------------------------------------------------------------ */
/* 汇总 / 断言出口                                                      */
/* ------------------------------------------------------------------ */

/** 断言出口：不合法就 throw（构建期/门禁宁可停） */
function assertValidTargets(doc, ctx = {}) {
  const problems = validateTargets(doc, ctx);
  if (problems.length) {
    throw new Error(`coverage-targets.json 不合法（${problems.length} 处）：\n  - ${problems.join('\n  - ')}`);
  }
  return doc;
}

/** 序列化：2 空格缩进 + 末尾换行（与其它来源层同一套字节纪律） */
function serialize(doc) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

module.exports = {
  TARGETS_FILE,
  SCHEMA_VERSION,
  DIMENSIONS,
  DIMENSION_LABEL,
  STATES,
  STATE_ORDER,
  ATTENTION_ORDER,
  TIERS,
  TIER_LABEL,
  ROLES,
  ROLE_LABEL,
  RULING_DECISIONS,
  DECISION_LABEL,
  PAYLOAD_KEY_OF,
  DOC_KEY_ORDER,
  TARGET_KEY_ORDER,
  RULING_KEY_ORDER,
  FORBIDDEN_STATE_KEYS,
  LIMITS,
  withoutMeta,
  keyOrderOf,
  isNonEmptyString,
  isPlainObject,
  duplicateKeysDeep,
  readJson,
  load,
  targetsList,
  orderKeyOfTarget,
  sortTargets,
  declaredTargetsOf,
  rulingOf,
  applicabilityOf,
  keyOrderProblem,
  validateTargets,
  buildFacts,
  dataOf,
  resolveTargetItem,
  deriveDimension,
  overallState,
  deriveTargets,
  assertValidTargets,
  serialize
};
