/**
 * deals.json 读写、合并、修剪、写盘熔断。
 */

const fs = require('fs');
const path = require('path');
const { SCHEMA_VERSION, nowCN, todayCN, validateDeal, isGarbage, hasDiscountSignal } = require('./schema');
const { dedup, score } = require('./dedup');
const { applyDeadline } = require('./expiry');

const DEALS_FILE = path.join(__dirname, '..', '..', 'deals.json');
const MAX_DEALS = 300;
const EXPIRED_GRACE_DAYS = 14;
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

function writeDeals(deals, file = DEALS_FILE, now = new Date()) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: nowCN(now),
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
function mergeAll({ fresh = [], existing = [], curated = [], today = todayCN() } = {}) {
  // 策展数据是可信来源：刷新 lastSeen，标记 verified
  const curatedRefreshed = curated.map(deal => ({ ...deal, lastSeen: today, verified: true }));

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

  const { deals: merged, mergedCount } = dedup(withDeadline([...fresh, ...cleanExisting, ...curatedRefreshed]));
  const { deals: kept, removed } = prune(merged, { today });

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
