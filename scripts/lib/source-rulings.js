/**
 * coverage-depth-v1（Workstream D）：**source-rulings 判据层**。
 *
 * ## 这一层回答什么 / 不回答什么
 *
 * 长期失败的采集来源（例如 `futurepedia` 连续失败 10 次、HTTP 403）此前只有一个**读数**
 * （`scripts/data/source-health.json` 的 status / consecutiveFailures），没有一个**裁决**：
 * 修它、迁到无头链路、明知不健康但保留、还是干脆退出采集链路 —— 没人写下过结论。
 * 后果是同一个来源会年复一年地出现在"失败来源"清单里，而清单读起来像一份待办，
 * 实际上没有任何一条真的被决定过（"延期"与"没人管"长得一模一样）。
 *
 * 这一层把裁决变成一份**人工维护、唯一权威**的来源文件
 * （`scripts/data/source-rulings.json`，workstream C 的写域），并在这里给出：
 *
 *   1. **schema 校验**（`validateRulings()`）：冻结字段与顺序、枚举、日期、数组的规范序、
 *      以及"哪种裁决必须写哪几个字段"（`keep-degraded` 必填 `whyKept` + `revisitBy`、
 *      `repair` 必填 `revisitBy`、`headless-migrate` 必填 `headlessStability`）；
 *   2. **按 source 的 code-unit 稳定序**（`orderKeyOfRuling()` / `sortRulings()`）——
 *      两次读取同一份文件必须得到同一串字节，与调用方给的顺序无关；
 *   3. **三方对账**（`reconcileRulings()`）：**裁决 ↔ `scripts/collectors` 注册表 ↔ source-health**。
 *
 * ## 三方对账的三条硬关系（红 = 三层在自说自话）
 *
 *   · `retire` 的来源**不得**再出现在采集器注册表里 —— 既裁决退出、又还挂在采集链路上，
 *     等于"退了但没退"（读者会以为这个来源还在被采集）；
 *   · `consecutiveFailures >= 3` 的来源**必须**有一条裁决 —— 连续失败到第 3 次就必须有人表态，
 *     否则"长期失败"这件事永远只以读数的形式存在；
 *   · `repair` / `headless-migrate` 的来源**必须**在注册表里 —— 裁决说要修 / 要迁，而注册表里
 *     根本没有这个身份，那这条裁决只是写给读者看的。
 *
 * ## 纯函数
 *
 * 本模块不读墙上时钟、不联网、无随机、不写盘。`load()` 只读一个文件（与
 * `lib/coverage-targets.js` 的 `load()` 同一套形状），**其余全部是拿输入算输出的纯函数**：
 * 注册表与心跳都由调用方交进来（`scripts/collectors/index.js` 的 `list()` 与
 * `scripts/data/source-health.json` 的 `sources`），所以自测可以零依赖地驱动全部对账分支，
 * 不必造假的采集器、也不必碰盘上的心跳文件。
 *
 * ⚠️ 本文件是**内部维护层**：不发布。这里当年写的是「不进 `PUBLIC_DATASETS` / Dataset Manifest /
 *    Sitemap / Feed」—— 其中 `PUBLIC_DATASETS`、Manifest 与 Feed **都已随「去数据暴露」下架**
 *    （`lib/data-docs.js` / `lib/feeds.js` 也已删除），只剩「不是页面、不进 Sitemap」这条仍然成立。
 *    与 `scripts/data/coverage-targets.json`、`models.json`、`providers.json` 同一类。
 */

'use strict';

const fs = require('fs');
const path = require('path');

/** 默认路径：`scripts/data/source-rulings.json`（调用方可用 `load(file)` 换一份） */
const RULINGS_FILE = path.join(__dirname, '..', 'data', 'source-rulings.json');

/** 顶层 schemaVersion（形状变了要 +1，旧文件被当场拒掉） */
const SCHEMA_VERSION = 1;

/**
 * 四种裁决（**只有这四种**，且没有一种是"继续观察"）：
 *
 *   · `repair`           留在静态链路上修（页面改版 / 规则失效 / 反爬拦截）；
 *   · `headless-migrate` 迁到无头链路（需要真浏览器渲染才拿得到）；
 *   · `keep-degraded`    明知不健康也保留（独有价值 > 维护成本）——**必须写清为什么值得留、什么时候复查**；
 *   · `retire`           退出采集链路（注册表里不得再有它）。
 *
 * 为什么没有第五种"待定"：待定 = 没有裁决，它会与"长期失败"这个读数长得一模一样 ——
 * 正是这一层要消灭的东西。要"先放着"就写 `keep-degraded` 并把复查条件写出来。
 */
const DECISIONS = ['repair', 'headless-migrate', 'keep-degraded', 'retire'];

const DECISION_MEANING = {
  repair: '留在静态链路上修（页面改版 / 规则失效 / 反爬拦截）',
  'headless-migrate': '迁到无头链路（需要真浏览器渲染）',
  'keep-degraded': '明知不健康但保留（独有价值大于维护成本）',
  retire: '退出采集链路（注册表里不得再有它）'
};

const DECISION_LABEL = {
  repair: '修复',
  'headless-migrate': '迁无头',
  'keep-degraded': '保留降级',
  retire: '退出'
};

/** `overlap.maintenanceCost` 的枚举（维护成本的粗档，不是分数） */
const MAINTENANCE_COSTS = ['low', 'medium', 'high'];

const MAINTENANCE_COST_LABEL = { low: '低', medium: '中', high: '高' };

/** 顶层键的规范序（`_` 开头的说明键不算） */
const DOC_KEY_ORDER = ['schemaVersion', 'reviewedAt', 'rulings'];

/** 每条裁决的字段与顺序（冻结；追加新字段要同时改这里与自测的白名单） */
const RULING_KEY_ORDER = ['source', 'decision', 'reason', 'evidence', 'overlap', 'whyKept', 'revisitBy', 'headlessStability'];

/** 每条证据的字段与顺序 */
const EVIDENCE_KEY_ORDER = ['url', 'capturedAt', 'reading'];

/** `overlap` 的字段与顺序 */
const OVERLAP_KEY_ORDER = ['historicalItems', 'uniqueItems', 'overlapItems', 'maintenanceCost'];

/**
 * 哪种裁决必须写哪几个字段（**必填项的判据就在这里**，别处不另写一份）。
 *
 *   非必填字段允许写 `null` 或一段说明串（例如 `retire` 也可以顺手写 `revisitBy`）——
 *   只有**必填项缺席或写成空串**才判红。这样既不放过"该写没写"，也不会把"多写一句"判成错。
 */
const REQUIRED_BY_DECISION = {
  repair: ['revisitBy'],
  'headless-migrate': ['headlessStability'],
  'keep-degraded': ['whyKept', 'revisitBy'],
  retire: []
};

/**
 * 连续失败到第几次就**必须**有人写下裁决。
 *
 * ⚠️ 这个 3 不是从 `lib/health.js` 抄来的阈值，也不是它的别名：
 * `health.js` 的 `ZERO_OUTPUT_FAIL_AFTER = 3` 是"连续零产出升级为 failed"的**判定阈值**，
 * 这里是"连续失败多少次就必须有人表态"的**维护纪律**。两者语义不同、可以各自演化，
 * 值相同纯属巧合 —— 所以本模块**拒绝**去 require health.js（那会把两件事钉死在一起，
 * 以后想改维护纪律就得动采集判定）。要改纪律，改这一行，并跑 coverage-targets-selftest。
 */
const HEALTH_FAILURES_REQUIRING_RULING = 3;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "这是一个绝对地址"的判据：`scheme://…`。
 *
 * 刻意**不点名任何具体 scheme**（也不写它的字面量）：本层不判"这个域名官不官方"
 * （那是证据稽核的事），只判"这一条证据有没有可回访的地址，而不是一句自我声明"。
 */
const ABSOLUTE_URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** 数量上限（防呆；**不设字数上限** —— 裁决理由与逐字引文写多长由写的人负责） */
const LIMITS = { rulings: 200, evidencePerRuling: 20 };

/* ------------------------------------------------------------------ */
/* 小工具（与 lib/coverage-targets.js 同一套形状；本模块不 require 它，  */
/* 因为这一层要能被零依赖地单测 —— 这些是通用 JSON 形状检查，不是口径）   */
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

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

/** 字段集与字段顺序：未知字段红、已知字段顺序不是规范序也红 */
function keyOrderProblem(record, order, where, problems) {
  const keys = keyOrderOf(record);
  for (const key of keys) {
    if (!order.includes(key)) problems.push(`${where}: 未知字段 ${key}（允许：${order.join(' / ')}）`);
  }
  const expected = keys.filter(key => order.includes(key));
  const canonical = order.filter(key => keys.includes(key));
  if (JSON.stringify(expected) !== JSON.stringify(canonical)) {
    problems.push(`${where}: 字段顺序不是规范序（应为 ${canonical.join(' → ')}，实得 ${expected.join(' → ')}）`);
  }
}

/** 稳定序的排序键：**source 的 code-unit 序**（不用 localeCompare —— 它随 ICU 版本变） */
function orderKeyOfRuling(ruling) {
  const source = ruling && ruling.source !== null && ruling.source !== undefined ? String(ruling.source) : '';
  return source;
}

/** 按 source 的 code-unit 序排（与调用方给的顺序无关 ⇒ 同一份文件永远同一串字节） */
function sortRulings(list) {
  return [...(Array.isArray(list) ? list : [])].sort((a, b) => {
    const ak = orderKeyOfRuling(a);
    const bk = orderKeyOfRuling(b);
    return ak < bk ? -1 : ak > bk ? 1 : 0;
  });
}

/* ------------------------------------------------------------------ */
/* 读盘（永不 throw：缺失 / 坏文件由调用方决定怎么办）                    */
/* ------------------------------------------------------------------ */

/**
 * 读 `scripts/data/source-rulings.json`。
 *
 * 三种结局**必须分开报**（与 `lib/coverage-targets.js` 的 `load()` 逐字同一套语义）：
 * 文件不在盘上（`missing`）≠ 文件在盘上但读不出来（`broken`）≠ 读出来了（两者皆假）。
 * 把前两者混成一个 `null`，调用方就再也说不出"尚未落盘"与"这份文件坏了"的区别。
 */
function readJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { doc: null, file, missing: true, broken: null, raw: null };
    return { doc: null, file, missing: false, broken: `读取失败：${error.message}`, raw: null };
  }
  try {
    return { doc: JSON.parse(raw), file, missing: false, broken: null, raw };
  } catch (error) {
    return { doc: null, file, missing: false, broken: error.message, raw };
  }
}

function load(file = RULINGS_FILE) {
  const read = readJson(file);
  return {
    doc: read.doc,
    file: read.file,
    missing: read.missing,
    broken: read.broken,
    rulings: rulingsList(read.doc)
  };
}

/** 裁决数组（不是数组时给空数组：调用方靠 `validateRulings` 报"必须数组"） */
function rulingsList(doc) {
  return isPlainObject(doc) && Array.isArray(doc.rulings) ? doc.rulings : [];
}

/* ------------------------------------------------------------------ */
/* schema 校验                                                          */
/* ------------------------------------------------------------------ */

/**
 * 来源裁决表的 schema 校验。返回问题列表（空 = 通过）。**判据全文只在这里**。
 *
 * @param {object} doc `scripts/data/source-rulings.json` 的解析结果
 * @returns {string[]}
 */
function validateRulings(doc) {
  const problems = [];
  if (!isPlainObject(doc)) {
    return ['scripts/data/source-rulings.json 必须是一个对象（{schemaVersion, reviewedAt, _note, rulings}）'];
  }

  if (doc.schemaVersion !== SCHEMA_VERSION) {
    problems.push(`schemaVersion 应为 ${SCHEMA_VERSION}，实际 ${doc.schemaVersion}`);
  }
  for (const key of keyOrderOf(doc)) {
    if (!DOC_KEY_ORDER.includes(key)) {
      problems.push(`顶层未知字段 ${key}（允许：${DOC_KEY_ORDER.join(' / ')} / _ 开头的说明键）`);
    }
  }
  if (doc.reviewedAt !== null && doc.reviewedAt !== undefined) {
    if (typeof doc.reviewedAt !== 'string' || !DATE_RE.test(doc.reviewedAt)) {
      problems.push('reviewedAt 必须是 null 或 YYYY-MM-DD（人工本轮裁决日期，不读墙上时钟）');
    }
  }
  if (!Array.isArray(doc.rulings)) {
    problems.push('rulings 必须是数组（没有任何裁决时写 []，不要省略这个键）');
    return problems;
  }
  const rulings = rulingsList(doc);
  if (rulings.length > LIMITS.rulings) {
    problems.push(`裁决条数 ${rulings.length} 超过上限 ${LIMITS.rulings}`);
  }

  const seenSource = new Set();
  rulings.forEach((ruling, index) => {
    const where = `rulings[${index}] ${ruling && ruling.source ? ruling.source : '(无 source)'}`;
    if (!isPlainObject(ruling)) { problems.push(`${where}: 必须是对象`); return; }
    keyOrderProblem(ruling, RULING_KEY_ORDER, where, problems);

    const source = ruling.source === null || ruling.source === undefined ? '' : String(ruling.source);
    if (!isNonEmptyString(source)) problems.push(`${where}: source 不能为空（写采集器注册表里的 id，或 source-health 里的 name）`);
    else if (seenSource.has(source)) problems.push(`${where}: source「${source}」在本文件里出现了不止一次（一个来源只能有一条裁决）`);
    seenSource.add(source);

    if (!DECISIONS.includes(ruling.decision)) {
      problems.push(`${where}: decision 非法（${ruling.decision}），允许 ${DECISIONS.join(' / ')} —— 没有"待定"这一档`);
    }
    if (!isNonEmptyString(ruling.reason)) {
      problems.push(`${where}: reason 不能为空（一句话写清为什么这么裁决）`);
    }

    /* --- evidence：必须是数组（可以为空），每条三要素齐全 --- */
    if (!Array.isArray(ruling.evidence)) {
      problems.push(`${where}: evidence 必须是数组（没有取证时写 []）`);
    } else {
      if (ruling.evidence.length > LIMITS.evidencePerRuling) {
        problems.push(`${where}: evidence 条数 ${ruling.evidence.length} 超过上限 ${LIMITS.evidencePerRuling}`);
      }
      ruling.evidence.forEach((evidence, at) => {
        const spot = `${where} 的 evidence[${at}]`;
        if (!isPlainObject(evidence)) { problems.push(`${spot}: 必须是对象`); return; }
        keyOrderProblem(evidence, EVIDENCE_KEY_ORDER, spot, problems);
        if (!isNonEmptyString(evidence.url)) {
          problems.push(`${spot}: url 不能为空（这一条证据能不能被回访，就看它）`);
        } else if (!ABSOLUTE_URL_RE.test(evidence.url.trim())) {
          problems.push(`${spot}: url「${evidence.url}」不是绝对地址（要写 scheme://…，不许写一句自我声明）`);
        }
        if (!isNonEmptyString(evidence.capturedAt) || !DATE_RE.test(String(evidence.capturedAt))) {
          problems.push(`${spot}: capturedAt 必须是 YYYY-MM-DD（这条证据是哪天取到的）`);
        }
        if (!isNonEmptyString(evidence.reading)) {
          problems.push(`${spot}: reading 不能为空（逐字引文或机器读数，别写"看过了"）`);
        }
      });
    }

    /* --- overlap：存量重叠 / 独有价值 / 维护成本 --- */
    if (!isPlainObject(ruling.overlap)) {
      problems.push(`${where}: overlap 必须是对象（{historicalItems, uniqueItems, overlapItems, maintenanceCost}）`);
    } else {
      keyOrderProblem(ruling.overlap, OVERLAP_KEY_ORDER, `${where} 的 overlap`, problems);
      for (const key of ['historicalItems', 'uniqueItems', 'overlapItems']) {
        if (!isNonNegativeInteger(ruling.overlap[key])) {
          problems.push(`${where} 的 overlap.${key} 必须是非负整数（实得 ${JSON.stringify(ruling.overlap[key])}）`);
        }
      }
      if (!MAINTENANCE_COSTS.includes(ruling.overlap.maintenanceCost)) {
        problems.push(`${where} 的 overlap.maintenanceCost 非法（${ruling.overlap.maintenanceCost}），允许 ${MAINTENANCE_COSTS.join(' / ')}`);
      }
    }

    /* --- "哪种裁决必须写哪几个字段"：必填项缺席 / 空串一律红 --- */
    if (DECISIONS.includes(ruling.decision)) {
      for (const field of REQUIRED_BY_DECISION[ruling.decision]) {
        if (!isNonEmptyString(ruling[field])) {
          problems.push(`${where}: decision=${ruling.decision} 必须写 ${field}（这是"有理由的保留/修复"与"没人管"的唯一区别）`);
        }
      }
    }
  });

  /* --- 数组的规范序：按 source 的 code-unit 序 --- */
  const actual = rulings.map(orderKeyOfRuling);
  const canonical = [...actual].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    problems.push(`rulings 数组不是规范序（应按 source 的 code-unit 序：${canonical.join(' → ')}，实得 ${actual.join(' → ')}）`
      + ' —— 文件里的顺序就是读者看到的顺序，两次读取必须得到同一串字节');
  }

  return problems;
}

/* ------------------------------------------------------------------ */
/* 三方对账：裁决 ↔ 采集器注册表 ↔ source-health                        */
/* ------------------------------------------------------------------ */

/**
 * 把「注册表 + 心跳」编成"身份索引"。
 *
 * 采集器注册表用 **id**（`scripts/collectors/index.js` 的 `list()`），source-health 的每一行
 * 同时有 **id**（`.source`）与 **name**（`.name`）；两者对同一个来源是两套写法。
 * 裁决里的 `source` 允许写其中任意一种（要的是**同一个身份**，不是同一个字符串写法），
 * 但必须**恰好命中一个身份** —— 命中不了 = 这条裁决在对一个不存在的来源说话。
 */
function identityIndex(registrySources, healthSources) {
  const rows = [];
  const byToken = new Map();
  const put = (token, row, where) => {
    if (!token) return;
    if (!byToken.has(token)) byToken.set(token, { row, where });
  };
  /* source-health 的 id 字段叫 `source`，采集器注册表叫 `id` —— 两张表都要能直接喂进来，
     否则调用方得先自己写一层字段改名（那就是第二份口径的起点）。 */
  const idOf = row => {
    const raw = row.id !== undefined && row.id !== null ? row.id : row.source;
    return raw === undefined || raw === null ? '' : String(raw);
  };
  for (const source of registrySources) {
    const sourceId = idOf(source);
    const row = rows.find(candidate => candidate.id === sourceId) || {
      id: sourceId,
      name: source.name || null,
      headless: source.headless === true,
      registry: null,
      health: null
    };
    row.registry = { id: sourceId, name: source.name || null, headless: source.headless === true, region: source.region === undefined ? null : source.region };
    if (row.name === null && source.name) row.name = source.name;
    if (!rows.includes(row)) rows.push(row);
    put(sourceId, row, 'registry-id');
    put(source.name, row, 'registry-name');
  }
  for (const source of healthSources) {
    const sourceId = idOf(source);
    const row = rows.find(candidate => (sourceId && candidate.id === sourceId)
      || (source.name && candidate.name === source.name)) || {
      id: sourceId || null,
      name: source.name || null,
      headless: null,
      registry: null,
      health: null
    };
    row.health = {
      id: sourceId || null,
      name: source.name || null,
      status: source.status === undefined ? null : source.status,
      reason: source.reason === undefined ? null : source.reason,
      consecutiveFailures: Number.isFinite(source.consecutiveFailures) ? source.consecutiveFailures : 0
    };
    if (row.name === null && source.name) row.name = source.name;
    if (!rows.includes(row)) rows.push(row);
    put(sourceId, row, 'health-id');
    put(source.name, row, 'health-name');
  }
  return { rows, byToken };
}

/**
 * 三方对账：**裁决 ↔ `scripts/collectors` 注册表 ↔ source-health**。
 *
 * 纯函数：注册表与心跳都由调用方交进来。返回
 * `{ present, rows, problems, byDecision, counts, ... 三组差集 }`。
 *
 * @param {{
 *   doc?: object|null,                             source-rulings.json 的解析结果（null = 未落盘）
 *   registrySources?: object[],                    scripts/collectors 的 list()：`{id,name,region,headless}`
 *   healthSources?: object[],                      source-health.json 的 sources：`{source,name,status,consecutiveFailures}`
 * }} [input]
 */
function reconcileRulings(input = {}) {
  const doc = isPlainObject(input.doc) ? input.doc : null;
  const registrySources = (Array.isArray(input.registrySources) ? input.registrySources : []).filter(isPlainObject);
  const healthSources = (Array.isArray(input.healthSources) ? input.healthSources : []).filter(isPlainObject);
  const index = identityIndex(registrySources, healthSources);
  const rulings = sortRulings(rulingsList(doc));

  const rows = rulings.map(ruling => {
    const source = ruling && ruling.source !== null && ruling.source !== undefined ? String(ruling.source) : '';
    const hit = index.byToken.get(source) || null;
    const identity = hit ? hit.row : null;
    return {
      source,
      decision: ruling && ruling.decision !== undefined ? ruling.decision : null,
      reason: ruling && ruling.reason !== undefined ? ruling.reason : null,
      whyKept: ruling && ruling.whyKept !== undefined ? ruling.whyKept : null,
      revisitBy: ruling && ruling.revisitBy !== undefined ? ruling.revisitBy : null,
      headlessStability: ruling && ruling.headlessStability !== undefined ? ruling.headlessStability : null,
      evidenceCount: ruling && Array.isArray(ruling.evidence) ? ruling.evidence.length : 0,
      overlap: ruling && isPlainObject(ruling.overlap) ? {
        historicalItems: ruling.overlap.historicalItems,
        uniqueItems: ruling.overlap.uniqueItems,
        overlapItems: ruling.overlap.overlapItems,
        maintenanceCost: ruling.overlap.maintenanceCost
      } : null,
      resolvedBy: hit ? hit.where : null,
      registry: identity && identity.registry ? {
        id: identity.registry.id,
        name: identity.registry.name,
        headless: identity.registry.headless
      } : null,
      health: identity && identity.health ? {
        id: identity.health.id,
        name: identity.health.name,
        status: identity.health.status,
        reason: identity.health.reason,
        consecutiveFailures: identity.health.consecutiveFailures
      } : null
    };
  });

  const problems = [];
  const reasons = new Map();   // source → 命中的裁决（同一 source 只可能有一条，重复由 schema 校验报红）
  for (const row of rows) if (!reasons.has(row.source)) reasons.set(row.source, row);

  /* 关系 1：retire 的来源不得再出现在采集器注册表里 */
  const retireStillRegistered = rows
    .filter(row => row.decision === 'retire' && row.registry)
    .map(row => ({ source: row.source, registryId: row.registry.id, registryName: row.registry.name }));
  for (const item of retireStillRegistered) {
    problems.push(`已裁决 retire 的来源「${item.source}」仍然挂在采集器注册表里（registry id ${item.registryId}）`
      + ' —— "退出采集链路"与"还在被采集"不能同时成立：要么从 scripts/collectors 摘掉它，要么把裁决改成 repair / keep-degraded。');
  }

  /* 关系 2：连续失败 >= 3 的来源必须有裁决 */
  const failuresRequiringRuling = healthSources
    .filter(source => Number.isFinite(source.consecutiveFailures) && source.consecutiveFailures >= HEALTH_FAILURES_REQUIRING_RULING)
    .map(source => ({
      source: source.source === undefined || source.source === null ? null : String(source.source),
      name: source.name === undefined || source.name === null ? null : String(source.name),
      status: source.status === undefined ? null : source.status,
      consecutiveFailures: source.consecutiveFailures
    }));
  const missingRulingsForFailures = failuresRequiringRuling.filter(item => !(item.source && reasons.has(item.source)))
    .map(item => item.source || item.name || '(未署名)');
  for (const name of missingRulingsForFailures) {
    problems.push(`来源「${name}」连续失败已达 ${HEALTH_FAILURES_REQUIRING_RULING} 次以上，却没有在 scripts/data/source-rulings.json 里留下裁决`
      + ' —— 长期失败必须有人表态（repair / headless-migrate / keep-degraded / retire 四选一），不许只以读数的形式常驻。');
  }

  /* 关系 3：repair / headless-migrate 的来源必须在注册表里 */
  const repairOrMigrateUnregistered = rows
    .filter(row => (row.decision === 'repair' || row.decision === 'headless-migrate') && !row.registry)
    .map(row => ({ source: row.source, decision: row.decision }));
  for (const item of repairOrMigrateUnregistered) {
    problems.push(`已裁决 ${item.decision} 的来源「${item.source}」不在采集器注册表里`
      + ' —— 裁决说要修 / 要迁，注册表里却没有这个身份，这条裁决只是写给读者看的（先把它登记回 scripts/collectors，或改成 retire）。');
  }

  /* 关系 4（兜底）：非 retire 的裁决必须能命中一个真实身份 —— 否则是在对一个不存在的来源说话。
     retire 允许完全不在任何一层：退出去的来源本来就可能已经从注册表与心跳里删干净了。 */
  const unresolvedSources = rows
    .filter(row => !row.resolvedBy && row.decision !== 'retire')
    .map(row => row.source);
  for (const source of unresolvedSources) {
    problems.push(`裁决的 source「${source}」在采集器注册表与 source-health 里都找不到同一个身份`
      + ' —— 不是"没有这个来源"，就是名字写错了（写注册表的 id 或 source-health 的 name 都行，但必须命中）。');
  }

  /* 三组差集（观测用；其中"注册表里没人裁决"不是错误，只是缺口清单） */
  const ruledRegistryIds = new Set(rows.filter(row => row.registry).map(row => row.registry.id));
  const unruledRegistrySources = index.rows
    .filter(row => row.registry && !ruledRegistryIds.has(row.registry.id))
    .map(row => row.registry.id)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const retireStillInHealth = rows
    .filter(row => row.decision === 'retire' && row.health)
    .map(row => row.source);

  const byDecision = {};
  for (const decision of DECISIONS) byDecision[decision] = rows.filter(row => row.decision === decision).length;

  return {
    doc,
    present: Boolean(doc),
    rulings: rows.length,
    rows,
    problems,
    byDecision,
    decisionOrder: DECISIONS.slice(),
    registryRowCount: index.rows.filter(row => row.registry).length,
    registryIds: index.rows.filter(row => row.registry).map(row => row.registry.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    healthRowCount: index.rows.filter(row => row.health).length,
    unruledRegistrySources,
    failuresRequiringRuling,
    missingRulingsForFailures,
    retireStillRegistered,
    retireStillInHealth,
    repairOrMigrateUnregistered,
    unresolvedSources
  };
}

module.exports = {
  RULINGS_FILE,
  SCHEMA_VERSION,
  DECISIONS,
  DECISION_MEANING,
  DECISION_LABEL,
  MAINTENANCE_COSTS,
  MAINTENANCE_COST_LABEL,
  DOC_KEY_ORDER,
  RULING_KEY_ORDER,
  EVIDENCE_KEY_ORDER,
  OVERLAP_KEY_ORDER,
  REQUIRED_BY_DECISION,
  HEALTH_FAILURES_REQUIRING_RULING,
  DATE_RE,
  ABSOLUTE_URL_RE,
  LIMITS,
  withoutMeta,
  keyOrderOf,
  isNonEmptyString,
  isPlainObject,
  isNonNegativeInteger,
  keyOrderProblem,
  orderKeyOfRuling,
  sortRulings,
  readJson,
  load,
  rulingsList,
  validateRulings,
  identityIndex,
  reconcileRulings
};
