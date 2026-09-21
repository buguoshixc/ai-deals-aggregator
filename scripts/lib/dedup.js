/**
 * 去重：标题归一化 + 别名表 + 信息量择优合并。
 */

const aliases = require('../data/aliases.json');

const ALIASES = Object.fromEntries(
  Object.entries(aliases).filter(([key]) => !key.startsWith('_'))
);

/** 营销后缀：归一化时剥离，避免 "ChatGPT" 与 "ChatGPT / OpenAI" 分裂 */
const NOISE_SUFFIXES = [
  'openai', 'official', 'official site', 'app', 'io', 'inc', 'ltd', 'llc',
  'ai tool', 'ai tools', '官网', '官方', '官方版', '中文版', '网页版'
];

const NOISE_TOKENS = new Set(['ai', 'the', 'a', 'an', 'www', 'com', 'io', 'app']);

/** 归一化标题：小写、仅保留字母数字与汉字 */
function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
    .trim();
}

/** 依次剥离噪声后缀/前缀，得到 key */
function aliasKey(title) {
  let key = normalizeTitle(title);
  if (!key) return '';
  if (ALIASES[key]) return ALIASES[key];

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of NOISE_SUFFIXES) {
      const norm = normalizeTitle(suffix);
      if (norm && key.length > norm.length + 1 && key.endsWith(norm)) {
        key = key.slice(0, -norm.length);
        changed = true;
      }
    }
  }
  // 去掉首尾的 ai 噪声词
  for (const token of NOISE_TOKENS) {
    if (key.length > token.length + 1 && key.startsWith(token) && ALIASES[key.slice(token.length)]) {
      key = key.slice(token.length);
    }
  }
  return ALIASES[key] || key;
}

/** 信息量打分：优惠 > 工具 > 描述 > 截止日期 > 来源优先级 */
const SOURCE_PRIORITY = {
  Curated: 100,
  'Curated-CN': 100,
  Layer3Labs: 50,
  '智谱AI': 40,
  '智谱AI活动页': 40,
  '火山方舟': 40,
  '深度求索': 40,
  '阿里云百炼': 40,
  '月之暗面': 40,
  '百度千帆': 40,
  'aitools.fyi': 30,
  Futurepedia: 20,
  Futuretools: 10
};

function score(deal) {
  let total = 0;
  if (deal.type === 'deal') total += 50;
  if (deal.discountInfo) total += 25;
  if (deal.verified) total += 20;
  if (deal.expiresAt) total += 8;
  if (deal.description) total += 5;
  if (deal.eligibility) total += 3;
  total += SOURCE_PRIORITY[deal.source] || 0;
  return total;
}

/** 合并两条同源记录：保留更全者，补齐缺失字段 */
function merge(a, b) {
  const [winner, loser] = score(a) >= score(b) ? [a, b] : [b, a];
  const merged = { ...winner };
  for (const key of Object.keys(loser)) {
    if (key === 'id') continue;
    if (merged[key] === null || merged[key] === undefined || merged[key] === '') {
      merged[key] = loser[key];
    }
  }
  // 首次出现时间取更早的
  if (loser.firstSeen && winner.firstSeen && loser.firstSeen < winner.firstSeen) {
    merged.firstSeen = loser.firstSeen;
  }
  // 最近出现时间取更晚的
  if (loser.lastSeen && winner.lastSeen && loser.lastSeen > winner.lastSeen) {
    merged.lastSeen = loser.lastSeen;
  }
  merged.verified = Boolean(a.verified || b.verified);
  return merged;
}

/**
 * 按 id 与标题别名双键去重。
 * @param {object[]} deals
 * @returns {{deals:object[], mergedCount:number}}
 */
function dedup(deals) {
  const byId = new Map();
  const titleIndex = new Map();
  let mergedCount = 0;

  for (const deal of deals) {
    if (!deal) continue;
    const titleKey = aliasKey(deal.title);
    const targetId = byId.has(deal.id) ? deal.id : (titleKey ? titleIndex.get(titleKey) : undefined);

    if (targetId && byId.has(targetId)) {
      const winner = merge(byId.get(targetId), deal);
      if (winner.id !== targetId) byId.delete(targetId);
      byId.set(winner.id, winner);
      if (titleKey) titleIndex.set(titleKey, winner.id);
      titleIndex.set(aliasKey(winner.title), winner.id);
      mergedCount++;
      continue;
    }

    byId.set(deal.id, deal);
    if (titleKey) titleIndex.set(titleKey, deal.id);
  }

  return { deals: [...byId.values()], mergedCount };
}

module.exports = { normalizeTitle, aliasKey, score, merge, dedup, SOURCE_PRIORITY };
