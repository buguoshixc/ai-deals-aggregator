#!/usr/bin/env node
/**
 * Codex 额度重置档案采集器（B 包 · 数据侧）。
 *
 * 唯一产出：仓库根 `codex-resets.json`（与 deals.json / api-plans.json 同级）。
 * 页面侧（build-local.js 的 renderCodexResetsPage）只读这份文件、不碰网络；
 * 数据完整判据在 `scripts/validate.js`（零依赖裸跑）。所以本文件是这个数据集的**唯一网络出口**。
 *
 * ## 为什么用第三方 API，而不是直接抓 X
 *
 * 一手事实是 @thsottiaux 的推文（每条例子的 tweetUrl 就是它）。但 X 在 CI 里抓不稳：
 *   · 未登录访问 x.com/…/status/… 会撞上登录墙 / JS 渲染墙，无头浏览器还常被风控挡；
 *   · X API 需要付费凭据，本仓库不引入付费依赖；用无头浏览器抓时间线又慢又不可复现。
 * 所以采集走 codex-resets.com 的公开 JSON（裸 GET、HTTP 200、约 48 KB、当前 72 条）。
 *
 * **第三方只是收录方，不是权威**：落盘的每条事件都带原推链接（tweetUrl），页面把「原推 →」
 * 作为一手证据；第三方漏收的那条事件在本站也查不到 —— 页面口径块必须写明这一边界
 * （数据来源 = 该聚合站，原推链接逐条可点）。这段注释也是给后来者的约束：别在这里改成
 * 「抓第三方页面正文当证据」，那会把收录方的措辞冒充成官方原话。
 *
 * ## 为什么不合并不去重
 *
 * 同一个事件可能被收录多次（webhook 实时收录 + 事后观测 / 历史回填各留一条，这是收录方的
 * 口径）。MVP **显式不做**合并：合并规则一旦猜错（把两次真重置当成重复，或把一条重复记录
 * 当成两次重置），改的是事实本身；而「同一条推文被收录两次」是收录方的行为，不是我们有权
 * 替它裁掉的东西。后果如实写在页面口径块里：「累计记录条数」是**记录数**，不是「重置次数」。
 * 因此 events 里允许重复 tweetId / 重复 announcedAt，validate.js 也不按唯一性判红。
 *
 * ## 为什么不做预测
 *
 * stats.avgIntervalDays 是**已发生事件**的描述统计（当前 5.9 天），不是下一次重置的期望值。
 * 对外只展示「数据截至」「距上次重置 X 天」「历史平均间隔 Y 天」，不写「预计下次」「概率」。
 * 页面措辞受 verify 的「预测 / 概率 / %」扫描面约束；本采集器也不产出任何派生预测字段。
 *
 * ## 严格校验（fail-closed）
 *
 * API 改版 / 半截响应 / 字段漂移都必须**失败**，而不是写出一份缺字段的文件把页面弄坏：
 *   · 任何一条事件字段不符 → 整次采集失败（不静默跳过行、不猜默认值、不做宽松类型转换）；
 *   · stats 自洽性（total == events.length、last_reset_at == max(announced_at)、
 *     avg_interval_days 是有限正数）不成立 → 失败；
 *   · 网络 / HTTP / JSON 失败 → 失败；
 *   · 旧文件可读且新条数 < 旧条数 × 0.5（掉一半以上）→ 视作上游异常，**不覆盖**旧文件。
 * 失败 = 不碰 codex-resets.json（临时文件 + rename 的原子替换只在全部校验通过后发生）
 * + stderr 一行 `[CodexResets] …` + exit 1。CI 里采集步骤是 continue-on-error（check:ci 的
 * (13) 管辖的采集步骤允许失败），落盘失败不阻断其他数据；但 Summary 会留 outcome 与日志末尾
 * （见 .github/workflows/collect.yml 的留痕步骤）——「失败」与「没跑」必须长得不一样。
 *
 * ## 健康读数
 *
 * 每次运行（成功或失败）都推进 `scripts/data/source-health.json` 里 source==='codex-resets'
 * 的那一行：用 lib/health.js 的 evaluate() 单行推进，**不用 build()** —— 后者会把本轮没跑的
 * 其他来源标成「本轮没跑」（lastRunMissing），而本脚本只负责自己这一个来源，不能替别的来源
 * 表态。条数骤降保护触发时按失败记账（valid/produced 记 0），与「上游真的只剩一半」区分开。
 *
 * ## 用法
 *
 *   node scripts/collectors/codex-resets.js            # 等价 npm run collect:codex
 *   CODEX_RESETS_API_URL=… node scripts/collectors/codex-resets.js
 *     └ 仅用于失败路径自测（默认必须是生产地址）；成功写盘时 source.api 仍写生产地址，
 *       因为落盘的 source 块描述的是这份数据的**事实来源**，不是本次 fetch 的技术出口。
 *
 * 顶层数据（scheduled / watch）**不落盘**：它们是收录方的运行态，不是档案事实。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getText } = require('../lib/http');
const health = require('../lib/health');

const ROOT = path.join(__dirname, '..', '..');
const OUTPUT_FILE = path.join(ROOT, 'codex-resets.json');

/** 数据契约里的「事实来源」三件套（页面按这三个链接署名；不要跟着 fetch 地址漂移） */
const SOURCE = Object.freeze({
  api: 'https://codex-resets.com/api/resets',
  aggregator: 'https://codex-resets.com',
  account: 'https://x.com/thsottiaux'
});

/**
 * 实际抓取地址：默认生产地址，只允许环境变量覆盖（失败路径自测用）。
 * 覆盖时会在日志里显式 warn —— 避免有人拿它长期采别的源却以为落盘的是生产数据。
 */
const API_URL = process.env.CODEX_RESETS_API_URL || SOURCE.api;

const SOURCE_ID = 'codex-resets';
const SOURCE_NAME = 'Codex 额度重置档案';
const SCHEMA_VERSION = 1;

/** 允许的推文 host（x.com / twitter.com 家族；mobile.twitter.com 是老移动端域名） */
const ALLOWED_TWEET_HOSTS = Object.freeze([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com'
]);

const RESET_TYPES = Object.freeze(['regular', 'banked']);
const EVENT_SOURCES = Object.freeze(['webhook', 'observed', 'backfill']);

/** 条数骤降保护：新条数 < 旧条数 × 0.5 即拒绝覆盖（旧文件缺失/损坏时跳过，首次写入不阻断） */
const DROP_GUARD_RATIO = 0.5;

/**
 * 抓取参数：第三方 API 偶发慢（2026-11-14 本地实测单次 9–19 秒，偶发 TLS 卡住）。
 * 20 秒超时 × 最多 4 次尝试 ≈ 86 秒上限，仍远小于 CI 采集步骤的 3 分钟预算。
 */
const HTTP_TIMEOUT_MS = 20000;
const HTTP_RETRIES = 3;

/* ------------------------------------------------------------------ */
/* 纯函数：解析 + 严格校验（fixture 只喂 JSON 文本，不碰网络/文件）        */
/* ------------------------------------------------------------------ */

/** Date.parse 的显式封装：只接受字符串，且必须可解析（返回毫秒时间戳） */
function parseTimestamp(value, what) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${what} 缺失或不是非空字符串（实际 ${JSON.stringify(value)}）`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new Error(`${what} 不是可解析时间（实际 ${JSON.stringify(value)}）`);
  }
  return ms;
}

function isAllowedTweetUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch (error) {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  return ALLOWED_TWEET_HOSTS.includes(parsed.hostname.toLowerCase());
}

/**
 * 事件正文：display_text 优先、缺失回落 text。
 *
 * 「缺失」的判据：undefined / null / 空字符串。**非字符串的 display_text 是结构错误**（抛错），
 * 不静默回落 —— 那会把「字段类型漂移」伪装成「这条没有 display_text」。
 * 正文保留英文原文（不翻译、不改写、不 trim 后落盘）：页面按原样摘录，截断只在渲染侧做且留痕。
 */
function textOf(event, where) {
  const display = event.display_text;
  if (display !== undefined && display !== null && typeof display !== 'string') {
    throw new Error(`${where}.display_text 不是字符串（实际 ${typeof display}）`);
  }
  const raw = event.text;
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`${where}.text 缺失或为空（正文是一手信息，不允许空）`);
  }
  if (typeof display === 'string' && display.trim() !== '') return display;
  return raw;
}

/** 校验一条原始事件并归一为 camelCase；任何不符直接抛错（带 events[i] 位置） */
function normalizeEvent(raw, index) {
  const where = `events[${index}]`;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${where} 不是对象（实际 ${Array.isArray(raw) ? 'array' : typeof raw}）`);
  }

  const tweetId = typeof raw.tweet_id === 'string' ? raw.tweet_id.trim() : '';
  if (!tweetId) throw new Error(`${where}.tweet_id 缺失或为空`);

  if (!isAllowedTweetUrl(raw.tweet_url)) {
    throw new Error(`${where}.tweet_url 不是 https 且 host 属于 x.com/twitter.com 家族（实际 ${JSON.stringify(raw.tweet_url)}）`);
  }

  const announcedAtMs = parseTimestamp(raw.announced_at, `${where}.announced_at`);

  if (!RESET_TYPES.includes(raw.reset_type)) {
    throw new Error(`${where}.reset_type 不在 ${JSON.stringify(RESET_TYPES)}（实际 ${JSON.stringify(raw.reset_type)}）`);
  }
  if (!EVENT_SOURCES.includes(raw.source)) {
    throw new Error(`${where}.source 不在 ${JSON.stringify(EVENT_SOURCES)}（实际 ${JSON.stringify(raw.source)}）`);
  }

  return {
    tweetId,
    tweetUrl: raw.tweet_url.trim(),
    announcedAt: new Date(announcedAtMs).toISOString(),
    resetType: raw.reset_type,
    source: raw.source,
    text: textOf(raw, where),
    /** 仅用于排序/自洽校验的中间量，落盘前剔除（不属于数据契约） */
    _announcedAtMs: announcedAtMs
  };
}

/**
 * JSON 文本 → 归一后的落盘结构（**纯校验 + 归一，不读盘、不联网**）。
 *
 * 入参：
 *   text                  API 响应原文（必须是合法 JSON）
 *   options.fetchedAt     本次成功抓取的 ISO 时间；不传取当前时间（fixture 测试请注入，保证可复现）
 *
 * 出参（**字段名即页面侧契约，不许改名**）：
 *   { schemaVersion, source, fetchedAt, stats: { total, avgIntervalDays, lastResetAt }, events }
 *   events 按 announcedAt 降序（时间相同保持原顺序，sort 稳定）。
 *
 * 为什么自洽性校验写在这里而不是交给 validate.js：validate.js 是**提交后**的独立判据，
 * 它拦不住「采集器把坏数据写进工作区」这件事；fail-closed 要在写盘之前发生。
 * 两边各有一份判据是刻意的：一份守采集，一份守仓库里的最终文件（防手改/防旧版本）。
 */
function parseResets(text, options = {}) {
  let doc;
  try {
    doc = JSON.parse(String(text || ''));
  } catch (error) {
    throw new Error(`响应不是合法 JSON：${error.message}`);
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`响应顶层不是对象（实际 ${Array.isArray(doc) ? 'array' : typeof doc}）`);
  }
  if (!Array.isArray(doc.events) || doc.events.length === 0) {
    throw new Error('响应结构变化：events 必须是非空数组');
  }
  const stats = doc.stats;
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) {
    throw new Error('响应结构变化：stats 缺失或不是对象');
  }

  // 逐条严格校验（不跳过、不合并、不去重 —— 见文件头「为什么不合并不去重」）
  const events = doc.events.map((raw, index) => normalizeEvent(raw, index));

  // stats 自洽：total == 条数
  if (stats.total !== events.length) {
    throw new Error(`stats.total(${JSON.stringify(stats.total)}) 与 events 条数(${events.length}) 不一致`);
  }

  // stats 自洽：avg_interval_days 是有限正数（0 或负数/字符串都不接受）
  if (typeof stats.avg_interval_days !== 'number'
    || !Number.isFinite(stats.avg_interval_days)
    || stats.avg_interval_days <= 0) {
    throw new Error(`stats.avg_interval_days 不是有限正数（实际 ${JSON.stringify(stats.avg_interval_days)}）`);
  }

  // stats 自洽：last_reset_at 必须等于 events 里最大的 announced_at（同一事件的最新时间）
  const lastResetAtMs = parseTimestamp(stats.last_reset_at, 'stats.last_reset_at');
  const maxAnnouncedAtMs = Math.max(...events.map(event => event._announcedAtMs));
  if (lastResetAtMs !== maxAnnouncedAtMs) {
    throw new Error(
      `stats.last_reset_at(${new Date(lastResetAtMs).toISOString()}) `
      + `不等于 events 最新的 announced_at(${new Date(maxAnnouncedAtMs).toISOString()})`
    );
  }

  const fetchedAtMs = options.fetchedAt === undefined
    ? Date.now()
    : parseTimestamp(options.fetchedAt, 'options.fetchedAt');

  // 归一 + 排序：降序；时间相同按原始下标稳定排序（不引入额外语义）
  events.sort((a, b) => (b._announcedAtMs - a._announcedAtMs) || 0);

  return {
    schemaVersion: SCHEMA_VERSION,
    source: { ...SOURCE },
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    stats: {
      total: events.length,
      avgIntervalDays: stats.avg_interval_days,
      lastResetAt: new Date(lastResetAtMs).toISOString()
    },
    events: events.map(({ _announcedAtMs, ...event }) => event)
  };
}

/* ------------------------------------------------------------------ */
/* 写盘（临时文件 + rename 原子替换）与旧文件读数                        */
/* ------------------------------------------------------------------ */

/**
 * 原子写 JSON：先写同目录临时文件，再 rename 覆盖目标。
 * 同目录保证 rename 在同一文件系统内（跨目录 rename 不保证原子）；失败时尽力清理临时文件，
 * 且**不碰**目标文件（fail-closed：半截文件绝不能出现在仓库根）。
 */
function writeJsonAtomic(file, data) {
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, file);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch (cleanupError) {
      // 清理失败不掩蔽原始错误（原始错误才是「为什么没写成功」的答案）
    }
    throw error;
  }
}

/**
 * 读旧文件的 events 条数（条数骤降保护用）。
 * 缺失 ⇒ null（首次写入，不阻断）；损坏 ⇒ warn + null（旧文件坏了不该把新数据也卡死，
 * 但也绝不静默 —— 日志里要看得出「保护本轮没生效」）。
 */
function readPreviousEventCount(file = OUTPUT_FILE) {
  if (!fs.existsSync(file)) return null;
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!doc || !Array.isArray(doc.events)) {
      console.warn(`[CodexResets] 旧 ${path.basename(file)} 结构不符（events 不是数组），跳过条数骤降保护`);
      return null;
    }
    return doc.events.length;
  } catch (error) {
    console.warn(`[CodexResets] 旧 ${path.basename(file)} 无法解析（${error.message}），跳过条数骤降保护`);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* 健康读数：只推进自己这一行（不用 health.build）                       */
/* ------------------------------------------------------------------ */

/**
 * 更新 source-health.json 里 source==='codex-resets' 的那一行。
 *
 * @param {object} params
 * @param {boolean} params.ok      本次采集是否成功（成功 = 校验通过且文件已落盘）
 * @param {string|null} params.error 失败原因（成功传 null）
 * @param {number} params.count    事件条数（失败传 0，与 eventual 契约一致）
 * @param {number|null} params.ms  本次耗时
 * @param {Date} params.now        注入时钟（测试可复现）
 * @returns {object} 推进后的健康行
 */
function updateHealth({ ok, error = null, count = 0, ms = null, now = new Date() } = {}) {
  const loaded = health.load();
  if (loaded.broken) {
    console.warn(`[CodexResets] ${path.basename(health.HEALTH_FILE)} 解析失败（${loaded.broken}），本轮按空历史重算`);
  }
  const doc = loaded.doc;
  const rows = (Array.isArray(doc.sources) ? doc.sources : []).filter(row => row && typeof row === 'object');
  const previous = rows.find(row => row.source === SOURCE_ID) || null;

  const next = health.evaluate({
    previous,
    attempt: {
      source: SOURCE_ID,
      name: SOURCE_NAME,
      region: 'global',
      kind: 'static',
      ok: ok === true,
      error: error || null,
      // 「失败填 0」是契约：解析出的条数在失败时不算产出（文件没写，页面读不到）
      valid: ok === true ? count : 0,
      produced: ok === true ? count : 0,
      deals: 0,
      ms,
      headlessReady: null
    },
    now
  });

  const index = rows.findIndex(row => row.source === SOURCE_ID);
  if (index >= 0) rows[index] = next;
  else rows.push(next);
  // 与 health.build() 相同的排序口径：按 source 稳定排序（其他来源的行原样保留，不标 stale）
  rows.sort((a, b) => String(a.source).localeCompare(String(b.source)));

  doc.sources = rows;
  doc.generatedAt = new Date(now).toISOString();
  if (!doc.schemaVersion) doc.schemaVersion = health.SCHEMA_VERSION;
  health.write(doc);
  return next;
}

/* ------------------------------------------------------------------ */
/* 采集主流程                                                          */
/* ------------------------------------------------------------------ */

/**
 * 抓取 → 校验 → 骤降保护 → 原子写盘。失败抛错（不写目标文件）。
 * 健康读数不在这里做 —— 那属于「一次运行」的记账，由 main() 在成功/失败两侧各做一次，
 * 保证 collect() 作为模块 API 被调用时不产生副作用之外的网络/磁盘之外行为。
 */
async function collect() {
  if (API_URL !== SOURCE.api) {
    console.warn(`[CodexResets] 抓取地址被 CODEX_RESETS_API_URL 覆盖（仅限失败路径自测）：${API_URL}`);
  }
  const text = await getText(API_URL, {
    timeout: HTTP_TIMEOUT_MS,
    retries: HTTP_RETRIES,
    headers: { Accept: 'application/json' }
  });
  const payload = parseResets(text, { fetchedAt: new Date().toISOString() });

  // 条数骤降保护：上游改版/分页截断/半截响应时，最危险的形态是「合法但只剩一小撮」。
  const previousCount = readPreviousEventCount(OUTPUT_FILE);
  if (previousCount !== null && payload.events.length < previousCount * DROP_GUARD_RATIO) {
    throw new Error(
      `条数骤降保护：旧 ${previousCount} 条 → 新 ${payload.events.length} 条`
      + `（低于旧条数的 ${DROP_GUARD_RATIO * 100}%），拒绝覆盖 ${path.basename(OUTPUT_FILE)}`
    );
  }

  writeJsonAtomic(OUTPUT_FILE, payload);
  return payload;
}

/** CLI 入口：成功/失败都推进健康读数；失败 → stderr + exitCode 1（不写数据文件） */
async function main() {
  const startedAt = Date.now();
  let payload = null;
  let failure = null;
  try {
    payload = await collect();
  } catch (error) {
    failure = error;
  }
  const ms = Date.now() - startedAt;
  const ok = failure === null;
  const count = ok ? payload.events.length : 0;

  let healthRow = null;
  let healthError = null;
  try {
    healthRow = updateHealth({
      ok,
      error: ok ? null : String((failure && failure.message) || failure),
      count,
      ms,
      now: new Date()
    });
  } catch (error) {
    healthError = error;
  }

  if (!ok) {
    console.error(`[CodexResets] ${String((failure && failure.message) || failure)}`);
    if (healthError) {
      console.error(`[CodexResets] source-health.json 更新失败：${healthError.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const { events, stats, fetchedAt } = payload;
  console.log(
    `[CodexResets] 已写入 ${path.basename(OUTPUT_FILE)}：${events.length} 条记录`
    + ` · 最新重置 ${stats.lastResetAt} · 平均间隔 ${stats.avgIntervalDays} 天`
    + ` · 抓取于 ${fetchedAt} · 耗时 ${ms}ms`
  );
  if (healthRow) {
    console.log(
      `[CodexResets] source-health：${healthRow.status}`
      + `${healthRow.reason ? `（${healthRow.reason}）` : ''}`
      + ` · 本次 ${healthRow.lastItemCount} 条 / 上次 ${healthRow.previousItemCount === null ? '无' : `${healthRow.previousItemCount} 条`}`
    );
  }
  if (healthError) {
    console.error(`[CodexResets] source-health.json 更新失败：${healthError.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch(error => {
    // main 已自行处理预期失败；走到这里说明是未预期异常（编码错误 / 文件系统不可写等）
    console.error(`[CodexResets] 未处理异常：${error && error.stack ? error.stack : error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  collect,
  parseResets,
  __test: {
    parseResets,
    normalizeEvent,
    textOf,
    isAllowedTweetUrl,
    parseTimestamp,
    readPreviousEventCount,
    writeJsonAtomic,
    ALLOWED_TWEET_HOSTS,
    RESET_TYPES,
    EVENT_SOURCES,
    DROP_GUARD_RATIO,
    SOURCE,
    API_URL
  }
};
