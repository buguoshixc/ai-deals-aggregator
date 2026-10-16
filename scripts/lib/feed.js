/**
 * 订阅出口（Atom 1.0 + JSON Feed 1.1）—— **唯一权威实现**。
 *
 * ## 它是什么
 *
 * 把**已经存在**的三支变更日志（deals / Coding 套餐 / API 计费）合成一份确定性的
 * 订阅流，渲染成两个构建期产物：`feed.xml`（Atom 1.0）与 `feed.json`（JSON Feed 1.1）。
 * 纯函数、离线、零运行时依赖：这个文件不读盘、不写盘、不联网、**不看时钟**。
 *
 * ## 为什么 id 要「在消费侧组合」，而不是给内核加一个 `eventIdOf`
 *
 * 条目身份的唯一推导（全仓就这一条）：
 *
 *   id = planSchema.idFromBasis(historyCore.eventKey(event, profile))
 *
 *   · `history-core.eventKey(event, profile)` —— 内核**已经**声明过的幂等身份
 *     （它的 docstring 原文：「它同时是『重复写入不重复追加』的判据与订阅源的稳定 guid」）；
 *   · `plan-schema.idFromBasis(basis)` —— 全仓**唯一**的摘要实现（前 12 位十六进制）；
 *   · 三支来源（`deal` / `plan` / `apiPlan`）统一走这一条，各自传各自的 `profile`。
 *
 * 「把它缩成 12 位」是**呈现层**的选择，所以组合点写在这里，而不是在内核里新增
 * `history-core.eventIdOf`（那还会多出一条 `history-core → plan-schema` 的依赖边，
 * 收益为零）。也不新增第二处哈希实现、第二处定长截断。
 *
 * ## 已知边界（实测，**不是待修缺陷**）：feed 条目 id ≠ 日志里的 `eventId` 字段
 *
 *   · `plan-history.eventIdOf(event)`（= `profile.eventIdOf`）与日志里已落盘的 `eventId`
 *     **逐条相同**：plan 35/35、api-plan 18/18；
 *   · 但 `planSchema.idFromBasis(historyCore.eventKey(event, profile))` 与日志 `eventId`
 *     **一条都不相同**：plan **0/35**、api-plan **0/18**（deals 的 20 条事件本身没有
 *     `eventId` 字段）。成因逐项：日志侧那支用 `|` 拼接 `planId / type / field / at /
 *     from / to / reason / created.fields`，并**多含** `ended.firstMissedAt` 与
 *     `created.supersedes`；内核这一支用 `\u0000` 拼接「记录键 / type / field / at /
 *     from / to / reason / created.fields」，**不含**那两项。
 *   · feed **刻意选内核那一支** —— 好让三支日志（含根本没有 `eventId` 字段的 deals）
 *     共用同一条身份。**禁止**把这条组合接进日志校验路径（`plan-history.eventIdOf` /
 *     `profile.eventIdOf` / `eventIdProblems` / `history-core.eventIdFor` 一字不动）：
 *     接起来会让 53 条既有事件当场「派生字段不得手写」变红。要统一这两个值，
 *     必须另开一次裁决（那是改日志的身份口径，不是订阅出口的范围）。
 *
 * ## 四条纪律（每条都有 `scripts/tools/feed-selftest.js` 盯着）
 *
 * 1. **不发死链**：算不出 url 的事件**逐条不进 feed**，且不许用别的字段兜底、不许拿
 *    `runAt` 或构建时刻顶上。「算不出」有两条独立来源，判据都在别处、这里只消费：
 *      · 通用：缺记录键 / 键不是 12 位小写 hex（记录身份的唯一出处 = `history-core.keyOf`）；
 *      · **deal 专属（t13 修的死链缺陷）**：`deals.json` 里只有 `type === 'deal'` 的记录
 *        会生成 `deal/<id>/` 详情页（实测 154 条里 74 条是工具类、没有这一页）⇒ deal 来源
 *        必须由调用方传入 `linkableIds`（= `changes.linkableDealIdsOf(deals)`），
 *        **集合缺席直接抛错**（本模块拿不到 records，猜出来的链接就是死链）。
 * 2. **全序确定**：排序一律复用 `changes.compareByRecency`（**不许**第二份比较器、
 *    不许 `Array#sort()` 默认序），排序**之后**才截断到 `FEED_MAX_ITEMS`。
 * 3. **身份两两不同，碰撞即停**：同一个 id 的同一条事件只出现一次；**不同事件**算出
 *    同一个 id ⇒ fail-closed 抛错（不许静默丢其中一条、不许换 id 兜底）。
 *    身份与呈现无关：只改 `title` / `text` **不许**改变任何条目的 `id`。
 * 4. **时间只用数据里的日期**：`<updated>` / `date_published` / `date_modified` 一律
 *    `${at}T00:00:00+08:00`；条目为 0 条时用调用方传入的数据日期（`meta.updatedAt`）。
 *    这个文件里没有、也不许出现**取当前时刻**的调用与 locale 相关的时间格式化
 *    （判据 = `feed-selftest.js` 对**原始源码**做三个子串扫描，与验收命令完全一致）。
 *
 * ## 措辞：只从既有措辞表取，一处都不新造
 *
 *   · feed 级说明文字（Atom `<subtitle>` / JSON Feed `description`）= 
 *     `history.HISTORY_WORDING.HISTORY_NOTES.disclaimer`（与 `/changes/` 同源）；
 *   · 条目正文默认由 `history.HISTORY_WORDING` 的类型词 / 原·新 + `profile.fieldLabels`
 *     的字段名拼出；**表里没有的事件类型刻意留空**（套餐与 API 计费各自的类型词住在
 *     它们自己的措辞表里 —— 在这里再写一套就是第二份措辞表；需要时由调用方注入 `textOf`）；
 *   · 本文件的**代码里没有任何中文事件措辞**（只有注释、诊断消息与全角标点）：
 *     机器判据见 `feed-selftest.js` 的「非注释代码里的中文字面量」扫描。
 *   · feed 里只能写「本站观测到什么」，不许写成「官方宣布」；不许出现元自称
 *     （那三个词逐条列在 `feed-selftest.js` 的源码扫描里，本文件 0 命中）。
 */

'use strict';

const history = require('./history');
const historyCore = require('./history-core');
const planSchema = require('./plan-schema');
const changes = require('./changes');
const site = require('./site');

/* ------------------------------------------------------------------ */
/* 产物表（**唯一出处**：全仓只有这里写订阅文件名与 MIME）                */
/* ------------------------------------------------------------------ */

/**
 * 订阅产物表：`[文件名, MIME]`。落盘位置 = 产物根（与 `sitemap.xml` 同级）。
 *
 * 谁读它：`build-local.js`（按它写文件、按它拼 `<link>`）、`verify-site.js`（允许的
 * `type` 取值集合与登记条数）、`published-assets.js`（逐路径登记）、
 * `check-feed-reproducible.js`（比对面）、以及本模块自己的两个渲染器。
 * **其余任何文件都不许再写这两个文件名字面量**（机器判据 = `feed-selftest.js` 的
 * 「4 文件字面量扫描」）。
 */
const FEED_FILES = [
  ['feed.xml', 'application/atom+xml'],
  ['feed.json', 'application/feed+json']
];

/** 条目上限：排序**之后**截断到它 */
const FEED_MAX_ITEMS = 40;

/* ------------------------------------------------------------------ */
/* 条目规则的常量（与契约第 6 条逐条对应）                                */
/* ------------------------------------------------------------------ */

/**
 * 允许的订阅来源 `kind` —— **它决定 url 模板**。出现别的取值 ⇒ 抛错（fail-closed）：
 * 静默忽略一个来源，等于这份订阅悄悄少了一整支日志。
 */
const SOURCE_KINDS = ['deal', 'plan', 'apiPlan'];

/** 套餐类 url 的两种形态（`deal/<id>/` 那一支不带前缀）。url 一律站根相对、不以 `/` 开头。 */
const PLAN_URL_PREFIX = {
  plan: 'plans/coding/#plan-',
  apiPlan: 'plans/api/#plan-'
};

const DATE_RE = historyCore.DATE_RE;          // /^\d{4}-\d{2}-\d{2}$/
const ID_RE = historyCore.DEFAULT_ID_RE;      // /^[0-9a-f]{12}$/

/** 条目的键集合（**形态冻结**：5 个键，不许增删改名） */
const ENTRY_KEYS = ['at', 'id', 'text', 'title', 'url'];

/** 时间形态（冻结）：北京时间零点。全仓只有这一处拼它。 */
const AT_SUFFIX = 'T00:00:00+08:00';

/** Atom / JSON Feed 的共用常量 */
const CONTENT_TYPE_HTML = 'text/html';
const JSON_FEED_VERSION = 'https://jsonfeed.org/version/1.1';
const LANGUAGE = 'zh-CN';

/* ------------------------------------------------------------------ */
/* 措辞表（一律引用既有出处，不在这里新写中文）                            */
/* ------------------------------------------------------------------ */

const WORDING = history.HISTORY_WORDING;
/** 事件类型词：三支日志共有的那几个（created / updated / ended / restored …） */
const TYPE_LABELS = WORDING.HISTORY_TYPES;
/** 原 / 新 */
const FROM_LABEL = WORDING.HISTORY_LABELS.from;
const TO_LABEL = WORDING.HISTORY_LABELS.to;
/** feed 级说明文字（与 /changes/ 同一句） */
const DISCLAIMER = WORDING.HISTORY_NOTES.disclaimer;

/** 纯标点分隔符（不是措辞）：条目正文的段间 / 值的列表间隔 */
const PART_SEP = ' · ';
const VALUE_SEP = '、';
const VALUE_ARROW = ' → ';

/* ------------------------------------------------------------------ */
/* 小工具                                                               */
/* ------------------------------------------------------------------ */

/** 数据日期 → 时间形态（不解析、不计算：只做拼接，所以永远与数据同源） */
function instantOf(at) {
  return `${at}${AT_SUFFIX}`;
}

/** 一个值 → 一行可读文本：数组用顿号、对象走内核的稳定序列化（不猜、不截语义） */
function valueTextOf(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.length ? value.map(valueTextOf).join(VALUE_SEP) : '';
  if (typeof value === 'object') return historyCore.stableJson(value);
  return String(value);
}

/** 事件 → 记录标题（`titleOf` 是唯一来源，这里只做兜底格式化） */
function titleOfEvent(event, titleOf) {
  const title = titleOf(event);
  return title === null || title === undefined ? '' : String(title);
}

/** 事件 → 正文：调用方注入了 `textOf` 就用它，否则用默认那一句 */
function textOfEvent(event, profile, textOf) {
  if (typeof textOf !== 'function') return defaultTextOf(event, profile);
  const text = textOf(event);
  return text === null || text === undefined ? '' : String(text);
}

/**
 * 事件 → feed 条目 id：**全仓唯一的一条身份推导**（见文件头「为什么」）。
 * 输入必须经既有的 `history-core.eventKey`，哈希必须经既有的 `plan-schema.idFromBasis`。
 */
const idOf = (event, profile) => planSchema.idFromBasis(historyCore.eventKey(event, profile));

/**
 * 记录键 + 来源种类 → 站根相对 url（三种形态的唯一出处）。
 * **调用方必须先判两件事**（它们各自进 stats 的不同桶）：
 *   · 键是不是 12 位小写 hex（`history-core.keyOf` 取，deals 取 `event.id`、套餐 / API 取 `event.planId`）
 *     —— 不是就落 `dropped.noUrl`，不进这里；
 *   · `kind === 'deal'` 时键在不在 `linkableIds` 里（= 那条记录真的有 `deal/<id>/` 详情页）
 *     —— 不在就落 `dropped.notLinkable`。判据本体在 `changes.js` 的 `isLinkableDeal()`（唯一一处），
 *     本文件只消费它物化后的集合，**不许**再写一遍「`type === 'deal'` 才算可链接」。
 *
 * ⚠️ 为什么 deal 这一支必须靠调用方喂集合：订阅出口的入参是「事件日志 + 剖面」，
 * **没有** records，判不了记录类型；而 `deals.json` 实测 154 条里只有 80 条 `type === 'deal'`
 * （其余 74 条是工具类记录，产物里没有 `deal/<id>/` 这一页）。上一轮就是在这里无条件
 * 发 `deal/<id>/`，让当时的 19 条 deal 条目**全是死链** —— 所以现在集合缺席直接抛错。
 */
function urlOf(kind, key) {
  if (kind === 'deal') return `deal/${key}/`;
  const prefix = PLAN_URL_PREFIX[kind];
  return prefix ? `${prefix}${key}` : null;
}

/**
 * 默认正文（一句纯文本）。**只用措辞表里的词**：
 *   · 类型词 → `history.HISTORY_WORDING.HISTORY_TYPES`
 *   · 原 / 新 → `history.HISTORY_WORDING.HISTORY_LABELS`
 *   · 字段名 → `profile.fieldLabels`（领域剖面自带的那一份）
 * 表里查不到的类型词**留空**，不在这里新造一套（那样就是第二份措辞表）。
 */
function defaultTextOf(event, profile) {
  const parts = [];
  const typeLabel = TYPE_LABELS[event.type] || '';
  if (typeLabel) parts.push(typeLabel);
  const labels = profile && profile.fieldLabels ? profile.fieldLabels : {};
  const fieldLabel = event.field ? (labels[event.field] || '') : '';
  if (fieldLabel) parts.push(fieldLabel);
  const hasValues = (event.from !== null && event.from !== undefined)
    || (event.to !== null && event.to !== undefined);
  if (hasValues) {
    parts.push(`${FROM_LABEL} ${valueTextOf(event.from)}${VALUE_ARROW}${TO_LABEL} ${valueTextOf(event.to)}`);
  }
  return parts.join(PART_SEP);
}

/* ------------------------------------------------------------------ */
/* 条目构造                                                             */
/* ------------------------------------------------------------------ */

/**
 * 把三支来源合并成一份确定性的订阅流（排序 → 去重 → 截断）。
 *
 * @param {object}   params
 * @param {object[]} params.sources 三个来源各一项，形状**冻结**（契约第 6.2 条 + t13 追加的
 *        `linkableIds`）：
 *        `{ kind, profile, store, titleOf, textOf?, linkableIds? }`
 *        - `kind`         ∈ `'deal' | 'plan' | 'apiPlan'`（决定 url 模板；别的取值抛错）
 *        - `profile`      `history-core` 的剖面（deals / plans / api-plans 各传自己的那一份）
 *        - `store`        已解析的日志对象（**只读它的 `events`**；谁读盘谁注入 —— 本模块不读盘）
 *        - `titleOf`      `event => string`：记录标题的唯一来源（调用方注入）
 *        - `textOf`       可选：`event => string`；不传时用 `defaultTextOf()`
 *        - `linkableIds`  **`kind === 'deal'` 时必填**：`changes.linkableDealIdsOf(deals)` 的结果
 *          （`Set`，元素 = 真的会生成 `deal/<id>/` 详情页的记录 id）。**缺席即抛错**
 *          （fail-closed）：本模块没有 records，判不了记录类型，靠猜发 `deal/<id>/` 就是死链。
 *          集合成员之外的事件落 `stats.dropped.notLinkable`（不发、不猜、不换形态）。
 *          plan / apiPlan 两支不需要它（它们的锚点由套餐页数据决定，与记录类型无关）。
 * @param {number}   [params.max] 截断上限（默认 `FEED_MAX_ITEMS`）
 * @returns {{entries: object[], stats: object}}
 *   `entries`：条目数组 `{ id, url, at, title, text }`（**恰好 5 个键**；两个渲染器只吃它）；
 *   `stats`  ：本次构造的**账目**（见下方「为什么 stats 必须由函数内部统计」）。
 *
 * 规则（逐条对应契约第 6 条 + t13）：
 *   ① 合并三支 → ② 丢弃算不出 url 的（键非法 ⇒ `noUrl`；deal 不可链接 ⇒ `notLinkable`）
 *   → ③ 丢弃 `at` 不合法的（`invalidAt`）→ ④ 同一条事件去重（`duplicate`）／
 *   不同事件撞同一个 id ⇒ 抛错 → ⑤ `changes.compareByRecency` 全序排序 → ⑥ 截断到 `max`（`truncated`）。
 *
 * `stats` 的形状（t13 冻结；`dropped` 里额外多一个 `duplicate` 桶是为了让恒等式闭合）：
 *
 *   considered  喂入的事件数（三支来源 `store.events` 的总条数，含形状不对的）
 *   kept        最终交出的条目数（= `entries.length`，**截断之后**）
 *   dropped     { notLinkable, noUrl, invalidAt, duplicate } —— 按**首个失败的那一步**分桶
 *   truncated   被上限截掉的条数（排好序之后、截断之前的那部分）
 *
 *   恒等式（**断言级**，不成立就抛错）：`kept + Σdropped + truncated === considered`
 *
 * ### 为什么 stats 必须由函数内部统计（不许调用方现算）
 *
 * 调用方唯一能现算的量是「喂入数 − 返回数」，而**上限截断与丢弃都会让这个差变小**：
 * 真实数据下 73 条事件 ⇒ 40 条条目，那个差值 33 里既有 20 条不可链接、又有 13 条被 40 上限截掉，
 * 调用方没法把两者分开 —— 硬算出来的「丢弃数」是错的（正是这一轮要避免的「看起来像读数」）。
 * 于是：函数内部逐事件分桶（丢弃发生在哪一步就记哪个桶），截断单独记在 `truncated`，
 * 并用上面的恒等式当场自证「没有静默丢弃」。导出表仍是冻结的 5 个名字：
 * `stats` 是**返回值的一部分**，不是第六个导出。
 *
 * ⚠️ 空 feed（`kept === 0`）是**合法返回值**；「空 feed 不算通过」是**构建**那条链的判据
 * （调用方在 0 条时必须让构建失败），本模块不替调用方判红、也不编造占位条目。
 */
function buildFeedEntries({ sources = [], max = FEED_MAX_ITEMS } = {}) {
  if (!Array.isArray(sources)) {
    throw new Error('buildFeedEntries 的 sources 必须是数组（形状：'
      + '[{ kind, profile, store, titleOf, textOf?, linkableIds? }]，见 INTERFACE-CONTRACT 第 6.2 条）');
  }
  if (!Number.isInteger(max) || max < 0) {
    throw new Error(`buildFeedEntries 的 max 必须是 >= 0 的整数（实得 ${JSON.stringify(max)}）`);
  }

  const stats = {
    considered: 0,
    kept: 0,
    dropped: { notLinkable: 0, noUrl: 0, invalidAt: 0, duplicate: 0 },
    truncated: 0
  };
  const candidates = [];
  for (const source of sources) {
    const { kind, profile, store, titleOf, textOf, linkableIds } = source || {};
    if (!SOURCE_KINDS.includes(kind)) {
      throw new Error(`未知的订阅来源 kind：${JSON.stringify(kind)}`
        + `（合法取值：${SOURCE_KINDS.join(' / ')}）—— 不静默忽略一个来源。`
        + '来源的冻结形状是 { kind, profile, store, titleOf, textOf?, linkableIds? }'
        + '（见 INTERFACE-CONTRACT 第 6.2 条与 t13 的追加项）');
    }
    if (!profile || typeof profile !== 'object') {
      throw new Error(`订阅来源 ${kind} 缺少 profile（事件身份与字段措辞都要用它）`);
    }
    if (typeof titleOf !== 'function') {
      throw new Error(`订阅来源 ${kind} 缺少 titleOf（记录标题的唯一来源由调用方注入）`);
    }
    if (kind === 'deal' && !(linkableIds instanceof Set)) {
      throw new Error('deal 来源必须传入 linkableIds（Set，= changes.linkableDealIdsOf(deals) 的结果）：'
        + '订阅出口拿不到 deals.json，判不了哪条记录真的会生成 deal/<id>/ 详情页；'
        + '没有这份集合就只能猜，而猜出来的链接是死链（t13 修的就是这条）。'
        + `实得 ${linkableIds === undefined ? 'undefined' : JSON.stringify(linkableIds)}`);
    }

    for (const event of historyCore.eventsOf(store)) {
      stats.considered += 1;
      // 形状不对的事件连记录键都没有 ⇒ 与「键非法」同一个桶（都算不出 url）
      const key = event && typeof event === 'object'
        ? String(historyCore.keyOf(profile, event) || '')
        : '';
      if (!ID_RE.test(key)) { stats.dropped.noUrl += 1; continue; }
      if (kind === 'deal' && !linkableIds.has(key)) { stats.dropped.notLinkable += 1; continue; }
      const url = urlOf(kind, key);
      if (!url) { stats.dropped.noUrl += 1; continue; }      // 兜底：合法 kind 走不到这里
      const at = String(event.at || '');
      if (!DATE_RE.test(at)) { stats.dropped.invalidAt += 1; continue; }
      candidates.push({
        entry: {
          id: idOf(event, profile),
          url,
          at,
          title: titleOfEvent(event, titleOf),
          text: textOfEvent(event, profile, textOf)
        },
        // 事件级去重签名：同一支来源里字节相同的事件 = 同一条事件。
        // 用内核的稳定序列化（key 排序），所以对象键序不同的同一件事也算同一条。
        signature: `${kind}\u0000${historyCore.stableJson(event)}`
      });
    }
  }

  // 去重（同一条事件只出现一次）＋ 身份碰撞 fail-closed
  const seenSignatures = new Set();
  const signatureById = new Map();
  const unique = [];
  for (const candidate of candidates) {
    if (seenSignatures.has(candidate.signature)) {         // 同一条事件：幂等去重
      stats.dropped.duplicate += 1;
      continue;
    }
    const known = signatureById.get(candidate.entry.id);
    if (known !== undefined && known !== candidate.signature) {
      // 诊断消息里带上两侧的事件签名（截断到 120 字符：够看出是哪两支来源 / 哪条记录，
      // 又不会把一条 created 事件的整份 fields 快照刷满整屏）
      const brief = signature => `${String(signature).slice(0, 120)}${String(signature).length > 120 ? '…' : ''}`;
      throw new Error(`订阅条目身份碰撞：${candidate.entry.id} 由两条**不同**的事件算出`
        + `（${brief(known)} ／ ${brief(candidate.signature)}）—— 条目 id 是「同一件事只有一个身份」的`
        + '机器可读承诺：碰撞必须让构建停下来，不许静默丢一条、也不许换 id 兜底');
    }
    seenSignatures.add(candidate.signature);
    signatureById.set(candidate.entry.id, candidate.signature);
    unique.push(candidate.entry);
  }

  unique.sort(changes.compareByRecency);                    // 全序（同日按 id 收敛）
  const kept = unique.slice(0, max);                         // 截断（被截掉的条数单独记账）
  stats.kept = kept.length;
  stats.truncated = unique.length - kept.length;

  // 恒等式：账目必须闭合（不闭合就是有事件被静默吞掉了 —— 那正是这一轮要钉死的东西）
  const droppedTotal = stats.dropped.notLinkable + stats.dropped.noUrl
    + stats.dropped.invalidAt + stats.dropped.duplicate;
  if (stats.kept + droppedTotal + stats.truncated !== stats.considered) {
    throw new Error(`订阅条目账目未闭合：kept ${stats.kept} + dropped ${droppedTotal}`
      + ` + truncated ${stats.truncated} !== considered ${stats.considered}`
      + `（dropped = ${JSON.stringify(stats.dropped)}）`);
  }

  return {
    // 截断后只交出冻结的 5 个键（两个渲染器只吃这个数组）
    entries: kept.map(entry => ({
      id: entry.id,
      url: entry.url,
      at: entry.at,
      title: entry.title,
      text: entry.text
    })),
    stats
  };
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                 */
/* ------------------------------------------------------------------ */

/**
 * `meta` 的键（**冻结**，调用方照抄）：
 * `{ siteUrl, siteName, siteDescription, updatedAt, selfPath }`
 *
 * - `siteUrl` / `siteName` / `siteDescription` 的唯一出处 = `scripts/lib/site.js`
 *   （调用方传的就是它们；这里以 site.js 作默认值，所以「忘了传」不会渲染出 `undefined`）；
 * - `selfPath` = `FEED_FILES` 里那一条的文件名（渲染 `self` / `feed_url` 用；不是这两条
 *   之一即抛错 —— 免得两份产物互相指错地址）；
 * - `updatedAt` = 全部条目 `at` 的最大值（YYYY-MM-DD）；条数为 0 时它就是 `<updated>`。
 * - ⚠️ `siteDescription` **刻意不落进产物**：feed 级说明文字必须与 `/changes/` 同源
 *   （= `HISTORY_NOTES.disclaimer`），不然同一份产物会自带第二套口径。它留在 meta 里
 *   只为保持上面那张键表冻结。
 */
function siteMetaOf(meta) {
  const given = meta || {};
  const selfPath = String(given.selfPath || '');
  const self = FEED_FILES.find(([file]) => file === selfPath);
  if (!self) {
    throw new Error(`meta.selfPath 必须是 FEED_FILES 里的文件名`
      + `（合法取值：${FEED_FILES.map(([file]) => file).join(' / ')}；实得 ${JSON.stringify(given.selfPath)}）`);
  }
  const siteUrl = String(given.siteUrl || site.SITE_URL);
  return {
    siteUrl,
    siteName: String(given.siteName || site.SITE_NAME),
    selfPath,
    selfType: self[1],
    updatedAt: String(given.updatedAt || ''),
    disclaimer: DISCLAIMER,
    // 条目 id 的 tag: URI 需要 host（同一份 siteUrl 派生，不写死域名）
    host: new URL(siteUrl).host
  };
}

/**
 * 条目形状断言。**这不是第二条排除判据** —— 排除只发生在 `buildFeedEntries` 里
 * （丢弃无 url / `at` 非法的事件）。这里判的是「调用方交来渲染的东西还是不是条目」：
 * 形状不对就抛错，绝不渲染一份「看着像 feed」的坏文档。
 */
function assertEntry(entry) {
  if (!entry || typeof entry !== 'object') throw new Error('feed 条目必须是对象');
  const keys = Object.keys(entry);
  // 键集合必须与冻结的 5 个键**恰好相等**（多一个 / 少一个都算形状变了）。
  // 刻意不用 `Object.keys(entry).sort()`：本模块里唯一的排序调用必须是排序比较器那一处。
  const keysOk = keys.length === ENTRY_KEYS.length
    && ENTRY_KEYS.every(key => Object.prototype.hasOwnProperty.call(entry, key));
  if (!keysOk) {
    throw new Error(`feed 条目的键集合必须是 {${ENTRY_KEYS.join(', ')}}（实得 {${keys.join(', ')}}）`);
  }
  if (!ID_RE.test(String(entry.id))) {
    throw new Error(`feed 条目的 id 必须是 12 位小写十六进制（实得 ${JSON.stringify(entry.id)}）`);
  }
  if (!DATE_RE.test(String(entry.at))) {
    throw new Error(`feed 条目的 at 必须是 YYYY-MM-DD（实得 ${JSON.stringify(entry.at)}）`);
  }
  const url = String(entry.url || '');
  if (!url || url.startsWith('/') || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    throw new Error(`feed 条目的 url 必须是站根相对路径（不以 / 开头、不是绝对 URL；实得 ${JSON.stringify(entry.url)}）`);
  }
  return entry;
}

/** 条目的**文档级**标识（Atom 的 `<id>`、JSON Feed 的 `id`）：由 12 位身份派生，两种格式同一串 */
function tagIdOf(entry, host) {
  return `tag:${host},${entry.at}:change/${entry.id}`;
}

/** feed 级 `<updated>`：条目最大 `at`；0 条时用调用方给的数据日期（**不看时钟**） */
function feedUpdatedAtOf(entries, meta) {
  if (entries.length) {
    return entries.reduce((latest, entry) => (entry.at > latest ? entry.at : latest), entries[0].at);
  }
  if (DATE_RE.test(meta.updatedAt)) return meta.updatedAt;
  throw new Error('空 feed 的 updated 必须由调用方给出数据日期（meta.updatedAt）——'
    + '本模块不看时钟，也不会编一个日期出来');
}

function entryListOf(entries) {
  if (!Array.isArray(entries)) throw new Error('渲染 feed 需要一个条目数组（buildFeedEntries 的返回值）');
  return entries;
}

/**
 * 渲染 `feed.xml`（Atom 1.0）。
 *
 * 骨架冻结：`<?xml version="1.0" encoding="utf-8"?>` 开头、**不许**出现文档类型声明
 * （DOCTYPE；全仓唯一 document 出口是 `lib/page-shell.js`）；根元素
 * `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="zh-CN">` 含
 * `<title>` / `<subtitle>` / `<id>` / `<updated>` / 一条 `rel="self"` /
 * 一条 `rel="alternate"` / `<author><name>`；每条 `<entry>` 含
 * `<title>` / `<id>` / `<link rel="alternate">` / `<updated>` / `<summary>`。
 *
 * 转义一律走 `site.xmlEscape`（全仓唯一的 XML 转义器）。条目顺序 = 传入顺序
 * （**渲染器不重排、不筛选**，否则两个格式的条目顺序就可能分头漂移）。
 */
function renderAtom(entries, meta) {
  const list = entryListOf(entries);
  const info = siteMetaOf(meta);
  for (const entry of list) assertEntry(entry);
  const updatedAt = feedUpdatedAtOf(list, info);
  const selfUrl = `${info.siteUrl}${info.selfPath}`;

  const rows = list.map(entry => `  <entry>
    <title>${site.xmlEscape(entry.title || entry.id)}</title>
    <id>${site.xmlEscape(tagIdOf(entry, info.host))}</id>
    <link rel="alternate" type="${site.xmlEscape(CONTENT_TYPE_HTML)}" href="${site.xmlEscape(info.siteUrl + entry.url)}"/>
    <updated>${site.xmlEscape(instantOf(entry.at))}</updated>
    <summary>${site.xmlEscape(entry.text)}</summary>
  </entry>`).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${site.xmlEscape(LANGUAGE)}">
  <title>${site.xmlEscape(info.siteName)}</title>
  <subtitle>${site.xmlEscape(info.disclaimer)}</subtitle>
  <id>${site.xmlEscape(selfUrl)}</id>
  <updated>${site.xmlEscape(instantOf(updatedAt))}</updated>
  <link rel="self" type="${site.xmlEscape(info.selfType)}" href="${site.xmlEscape(selfUrl)}"/>
  <link rel="alternate" type="${site.xmlEscape(CONTENT_TYPE_HTML)}" href="${site.xmlEscape(info.siteUrl)}"/>
  <author><name>${site.xmlEscape(info.siteName)}</name></author>
${rows ? `${rows}\n` : ''}</feed>
`;
}

/**
 * 渲染 `feed.json`（JSON Feed 1.1）。序列化用 `JSON.stringify` —— 这不是「第二份转义器」：
 * JSON 侧全仓只有它一处（XML 侧全仓只有 `site.xmlEscape` 一处）。
 *
 * 条目的正文与时间各写两个槽位，**同一个表达式**、不可能是两份来源：
 *   · `content_text` + `summary`：JSON Feed 1.1 规定 item **必须**有 `content_html` 或
 *     `content_text` 之一（两者都缺的文档不合规范，严格阅读器可能整篇拒收）⇒ `content_text`
 *     是规范硬要求；`summary` 是契约第 5.4 条冻结的键。两个都写、取条目那**一句**纯文本
 *     （订阅层下架前那份实现用的也是 `content_text`），既合规范又不破坏契约产物级断言。
 *   · `date_published` + `date_modified` —— 两者都取条目自己的数据日期
 *     （`at` 是本站**观测到**这条变化的日子；我们没有、也不编造另一个修订时间）。
 */
function renderJsonFeed(entries, meta) {
  const list = entryListOf(entries);
  const info = siteMetaOf(meta);
  for (const entry of list) assertEntry(entry);

  const box = {
    version: JSON_FEED_VERSION,
    title: info.siteName,
    home_page_url: info.siteUrl,
    feed_url: `${info.siteUrl}${info.selfPath}`,
    description: info.disclaimer,
    language: LANGUAGE,
    items: list.map(entry => ({
      id: tagIdOf(entry, info.host),
      url: info.siteUrl + entry.url,
      title: entry.title || entry.id,
      summary: entry.text,
      content_text: entry.text,
      date_published: instantOf(entry.at),
      date_modified: instantOf(entry.at)
    }))
  };
  return `${JSON.stringify(box, null, 2)}\n`;
}

module.exports = {
  FEED_FILES,
  FEED_MAX_ITEMS,
  buildFeedEntries,
  renderAtom,
  renderJsonFeed
};
