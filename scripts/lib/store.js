/**
 * deals.json 读写、合并、修剪，以及"这次采集是不是真的没东西可发"的信号。
 *
 * mergeAll() 只负责把 degraded 标志与比率算出来（stats.degraded），本身不动盘。
 * 注意 degraded 的语义是**只告警**：调用方（scripts/collect.js）读到它只会多打一行，
 * 写盘照常——一次 playwright 装不上就能让 deals.json 不落库、deploy 判 skipped、
 * 线上停更，那比"数据看起来旧一天"更糟。
 * 真正拦写盘的只有「本次采集零产出且未加 --force」（没有新东西可写时，
 * 照写只会把 updatedAt 与策展 lastSeen 刷成今天，把失败伪装成一次成功）与
 * 「译文不合规」（与构建期同一把尺子），两处都在 collect.js 里。
 */

const fs = require('fs');
const path = require('path');
const { SCHEMA_VERSION, nowCN, todayCN, validateDeal, isGarbage, hasDiscountSignal } = require('./schema');
const { dedup, score } = require('./dedup');
const { applyDeadline } = require('./expiry');
const { loadOverrides, applyOverrides } = require('./audience-overrides');

const DEALS_FILE = path.join(__dirname, '..', '..', 'deals.json');
const MAX_DEALS = 300;
const EXPIRED_GRACE_DAYS = 14;
/** 采集量骤降的判定阈值：本次新采 < 既有条数 × 30% 即视为疑似异常（**只告警**，不拦写盘） */
const CIRCUIT_BREAKER_RATIO = 0.3;

/** 人工策展来源：其分类结果受信任，不随启发式规则变动 */
const TRUSTED_SOURCES = new Set(['Curated', 'Curated-CN']);

/** 读取 deals.json；兼容旧的裸数组格式 */
function loadStore(file = DEALS_FILE) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) {
      return { schemaVersion: 1, updatedAt: null, count: parsed.length, deals: parsed, legacy: true };
    }
    if (parsed && Array.isArray(parsed.deals)) return { ...parsed, legacy: false };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`deals.json 解析失败: ${error.message}`);
    }
  }
  return { schemaVersion: SCHEMA_VERSION, updatedAt: null, count: 0, deals: [], legacy: false };
}

/** 只取记录数组 */
function loadDeals(file = DEALS_FILE) {
  return loadStore(file).deals;
}

/**
 * 写盘。
 *
 * `preserveUpdatedAt` 给一次性迁移（scripts/migrate.js --audience）用：那边只补 provenance、
 * **没有采到任何新数据**，把 updatedAt 刷成当下就是把数据新鲜度变成一句假话
 * （updatedAt 的语义是「这份数据是什么时候采到的」，不是「这个文件什么时候被写过」）。
 * 默认仍按当下写，采集路径的行为一个字节都没变。
 */
function writeDeals(deals, file = DEALS_FILE, now = new Date(), { preserveUpdatedAt = null } = {}) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: preserveUpdatedAt || nowCN(now),
    count: deals.length,
    deals
  };
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

function daysBetween(a, b) {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
}

/** 移除过期太久、以及超出上限的低分条目 */
function prune(deals, { today = todayCN(), max = MAX_DEALS } = {}) {
  const removed = { expired: [], overflow: [] };

  let kept = deals.filter(deal => {
    if (deal.type === 'deal' && deal.expiresAt) {
      if (daysBetween(today, deal.expiresAt) > EXPIRED_GRACE_DAYS) {
        removed.expired.push(deal);
        return false;
      }
    }
    return true;
  });

  if (kept.length > max) {
    const sorted = [...kept].sort((a, b) => {
      const diff = score(b) - score(a);
      if (diff !== 0) return diff;
      return String(b.lastSeen).localeCompare(String(a.lastSeen));
    });
    const winners = new Set(sorted.slice(0, max).map(d => d.id));
    removed.overflow = kept.filter(d => !winners.has(d.id));
    kept = kept.filter(d => winners.has(d.id));
  }

  return { deals: kept, removed };
}

/**
 * 把新采集与既有数据、人工策展数据合并。
 *
 * @param {object} params
 * @param {object[]} params.fresh   本次新采（已 makeDeal）
 * @param {object[]} params.existing 既有 deals.json
 * @param {object[]} params.curated  人工策展
 * @param {string}   params.today
 * @returns {{deals:object[], stats:object}}
 */
function mergeAll({ fresh = [], existing = [], curated = [], overrides = undefined, today = todayCN() } = {}) {
  // 策展数据是可信来源：刷新 lastSeen（"今天还见到它"是合并期真的知道的事）。
  //
  // 这里**不再**顺手写 verified: true。核验标注是人的声明，出处只有一处：
  // scripts/data/curated_*.json 里逐条写明的 verified/verifiedAt（loadCurated → makeDeal 原样带过）。
  // 合并期凭空盖章会产出一条 validateDeal 抓不到、页面却照发「✓ 已人工对照官方页」的假声明
  // （verified=true 且 verifiedAt=null）；schema.js 现在补了反向断言，构造期也必须保持诚实。
  const curatedRefreshed = curated.map(deal => ({ ...deal, lastSeen: today }));

  // 既有数据每次合并都重新体检：垃圾条目退役，分类按当前规则重算
  const retired = [];
  const reclassified = [];
  const cleanExisting = existing
    .filter(deal => {
      if (!deal || typeof deal !== 'object') return false;
      if (isGarbage(deal.title)) {
        retired.push(deal);
        return false;
      }
      return true;
    })
    .map(deal => {
      if (TRUSTED_SOURCES.has(deal.source) || deal.verified) return deal;
      if (deal.type !== 'deal') return deal;
      if (hasDiscountSignal(deal.discountInfo || '')) return deal;
      reclassified.push(deal.title);
      return { ...deal, type: 'tool' };
    });

  // 文案里写死了绝对截止日的，统一在这里补 expiresAt（抽不到就留空 = 长期活动/未标注）。
  // 抽取规则见 lib/expiry.js：只认带年份且附近有结束语义的日期，绝不猜。
  let extractedDeadlines = 0;
  const withDeadline = list => list.map(deal => {
    const next = applyDeadline(deal);
    if (next !== deal) extractedDeadlines++;
    return next;
  });

  // v1.1 修：「首次收录日期」不得被 merge 推晚（2026-09-29 实测事故）。
  //
  // 现象：32 条策展记录的 `firstSeen` 在一次真实 merge 里从 2026-09-21 被刷成当天，
  // 而且**每一轮都会再刷一次**，「首次收录」这个字段从此不表示任何历史。
  //
  // 根因在数据流而不是某一行的写法：`scripts/data/curated_*.json` **不带 `firstSeen`**，
  // `makeDeal` 于是按 `todayCN()` 盖当天（构造期「缺省 = 今天」本身是对的，对**新**条目尤其对）；
  // 而策展侧在 merge 里赢了记录，那个「今天」就顶掉了既有记录里真实的历史日期。
  // 所以补救必须在**进 dedup 之前**：把既有记录的 `firstSeen` 直接注入策展副本，
  // 让两侧带着同一个历史日期去比较 —— 等 dedup 跑完再改就来不及了（旧值已经不在候选里）。
  //
  // 不变量（由 merge 里的取更早逻辑 + 这里共同保证）：**一条记录的 firstSeen 只会变早或不变**。
  // 这与 `lastSeen` 恰好相反，两者不能写成同一套。
  const firstSeenById = new Map();
  for (const deal of [...existing, ...fresh, ...curated]) {
    if (!deal || !deal.firstSeen) continue;
    const known = firstSeenById.get(deal.id);
    if (!known || deal.firstSeen < known) firstSeenById.set(deal.id, deal.firstSeen);
  }
  const injectFirstSeen = deal => {
    const earliest = firstSeenById.get(deal.id);
    if (!earliest || earliest >= deal.firstSeen) return deal;
    return { ...deal, firstSeen: earliest };
  };

  const audienceStats = { conflicts: [] };

  // v1.1 收口：六字段的**第二个人工来源**（scripts/data/audience-overrides.json）。
  //
  // 为什么默认加载而不是让调用方显式传：`mergeAll` 有 5 个调用点（collect / migrate /
  // 两个重放工具 / 自测），漏掉任何一个都会让那条路径上的六字段静默丢失 ——
  // 而「漏了一处」正是这一整类 bug 的成因（见 check-reproducible.js 的文件头）。
  // 显式关闭请传 `overrides: new Map()`（空表），不要靠删文件。
  //
  // 注入发生在**进 dedup 之前**：这样两侧带着同一份人工值去比较，与 firstSeen 的
  // 处理同理 —— 等 dedup 跑完再补就来不及了。
  const overrideMap = overrides === undefined ? loadOverrides().byId : overrides;
  const overrideStats = { applied: 0, conflicts: [] };
  const withOverrides = list => applyOverrides(list, overrideMap, overrideStats);

  const input = [
    ...withOverrides(fresh).map(injectFirstSeen),
    ...withOverrides(cleanExisting).map(injectFirstSeen),
    ...curatedRefreshed.map(injectFirstSeen)
  ];
  const { deals: merged, mergedCount } = dedup(withDeadline(input), { stats: audienceStats });
  const { deals: kept, removed } = prune(merged, { today });

  // 采集量骤降：只作为"这次结果可能不完整"的信号返回，不拦写盘（见文件头）。
  // 单独一个采集器抛错属于调用方的范畴（report.summary().failedSources），
  // 不参与这里的计算——两个概念别混成一个"降级"。
  const degraded = cleanExisting.length > 0 && fresh.length < cleanExisting.length * CIRCUIT_BREAKER_RATIO;

  return {
    deals: kept,
    stats: {
      fresh: fresh.length,
      existing: existing.length,
      curated: curatedRefreshed.length,
      mergedDuplicates: mergedCount,
      extractedDeadlines,
      beforePrune: merged.length,
      afterPrune: kept.length,
      removedExpired: removed.expired.length,
      removedOverflow: removed.overflow.length,
      removedGarbage: retired.length,
      retiredTitles: retired.map(d => d.title).slice(0, 10),
      reclassified: reclassified.length,
      reclassifiedTitles: reclassified.slice(0, 10),
      // v1.1：六个新字段的逐字段可信度仲裁留痕（dedup.mergeAudienceFields 收集）。
      // 为什么必须留痕：这条路径修掉的是一个**静默**错误 —— 实测过采集侧 123 分 >
      // 策展侧 120 分（策展条目一旦被判成 tool 就先输 50 分），于是人工核过的
      // `availability.chinaUsable=false` 被机器推的 true 覆盖，validate 看不出、
      // 日志里也一个字都没有。现在冲突数进 stats、明细进列表，采集期显式打印（0 也打印）。
      audienceConflicts: audienceStats.conflicts.length,
      audienceConflictTitles: [...new Set(audienceStats.conflicts.map(c => c.title))].slice(0, 10),
      // 明细出口（契约 §5.3.1 明确要求「不能只给计数」）：谁覆盖了谁、双方可信度是多少，
      // 必须能逐条看到 —— 只给一个数字，人工复核时无从下手，等于没留痕。
      audienceConflictList: audienceStats.conflicts.slice(0, 20),
      // v1.1 收口：声明式补充（audience-overrides.json）的命中与冲突留痕。
      // 冲突 = 文件里那个值与记录上原本的值不一致 —— 按可信度 curated 胜过 collected，
      // 人工值赢，但**必须留痕**：静默覆盖人工值/被人工值静默覆盖，两个方向都是这一阶段的教训。
      overridesApplied: overrideStats.applied,
      overrideConflicts: overrideStats.conflicts.length,
      overrideConflictList: overrideStats.conflicts.slice(0, 20),
      degraded,
      circuitBreakerRatio: CIRCUIT_BREAKER_RATIO
    }
  };
}

/** 最终门禁：任何一条不合格都不允许写盘 */
function assertAllValid(deals) {
  const errors = [];
  deals.forEach((deal, index) => {
    const result = validateDeal(deal, index);
    if (!result.ok) errors.push(...result.errors);
  });
  const ids = new Set();
  for (const deal of deals) {
    if (ids.has(deal.id)) errors.push(`重复 id: ${deal.id}`);
    ids.add(deal.id);
  }
  if (errors.length) {
    const err = new Error(`数据校验失败（${errors.length} 项）:\n  - ${errors.slice(0, 20).join('\n  - ')}`);
    err.validationErrors = errors;
    throw err;
  }
  return true;
}

module.exports = {
  DEALS_FILE,
  MAX_DEALS,
  EXPIRED_GRACE_DAYS,
  CIRCUIT_BREAKER_RATIO,
  loadStore,
  loadDeals,
  writeDeals,
  prune,
  mergeAll,
  assertAllValid
};
