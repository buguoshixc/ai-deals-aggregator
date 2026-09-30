/**
 * 能力 2：疑似重复检测候选（**只发现，不合并**）。
 *
 * ## 为什么 AI 只做「发现」
 *
 * 现有限定去重（`scripts/lib/dedup.js`）是精确匹配：`aliasKey(normalizeTitle(title))`
 * 加上一张手维护的别名表。它**没有假阳性**，这是它最大的价值 —— 合并是破坏性操作，
 * 一次错误合并会静默删掉一条真实优惠，而且 `provenance` 按设计单调退化、永不回春。
 *
 * 所以本模块的产出永远只是「一对记录 + 一个关系判断」，供人看。
 * **结构上不存在合并路径**：这里不导出任何 merge / apply / write 符号，
 * 自检会断言这件事（`ai-selftest` 的牙测试第 4 条）。
 *
 * ## 为什么先做确定性预筛
 *
 * 134 条记录两两组合是 8911 对，300 条上限时是 44850 对 —— 全部送模型既贵又没必要，
 * 而且绝大多数对连"像"都谈不上。先用零成本的信号（同 host / 同 vendor / 标题包含 /
 * 字符二元组相似度）留一小撮，再让模型判**关系**。模型判的是最难的那部分：
 * 「同一个优惠」与「同厂商不同优惠」的区别。
 *
 * ## 五分类里最容易错的是 same_vendor
 *
 * `Microsoft` 名下有 Microsoft 365 教育版、Azure for Students、GitHub Education…
 * 它们同厂商、**不是**同一个优惠。把 same_vendor 误判成 same_offer 是这里最危险的错误，
 * 评测里单独统计这一类。
 */

'use strict';

const dedup = require('../lib/dedup');
const schemas = require('./schemas');
const redact = require('./redact');

const TASK = 'dedup_pair';
const PROMPT_VERSION = schemas.PROMPT_VERSIONS[TASK];

const SYSTEM = [
  '你在判断两条 AI 产品优惠记录之间的关系。',
  '',
  '可能的关系只有五种，必须严格选一个：',
  '  same_offer                    同一厂商、同一个产品、同一个优惠（只是标题/语言/来源不同）',
  '  same_product_different_offer  同一厂商、同一个产品，但是**不同的**优惠（如免费额度 vs 学生折扣）',
  '  same_vendor                   同一厂商，但产品不同',
  '  unrelated                     没有任何关系',
  '  uncertain                     信息不足以判断',
  '',
  '铁律：',
  '1. **同一厂商不等于同一优惠。** 拿不准是 same_offer 时，选 same_vendor 或 uncertain，不要猜。',
  '2. evidence 里给具体依据（如 "same official URL"、"same benefit: 12 months free"），最多 3 条。',
  '3. 只输出一个 JSON 对象。'
].join('\n');

const OFFICIAL_HOSTS = /^(www\.)?/;

function hostOf(url) {
  try {
    return new URL(url).host.replace(OFFICIAL_HOSTS, '').toLowerCase();
  } catch (error) {
    return '';
  }
}

/** 字符二元组集合：中英文都能用，不依赖分词器 */
function bigrams(text) {
  const clean = String(text || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  const set = new Set();
  for (let i = 0; i + 1 < clean.length; i++) set.add(clean.slice(i, i + 2));
  if (!set.size && clean) set.add(clean);
  return set;
}

function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const g of a) if (b.has(g)) shared++;
  return (2 * shared) / (a.size + b.size);
}

/** 确定性信号 → 分数。阈值与权重都写在这里，评测可以据此解释"为什么入围" */
function signalsOf(a, b) {
  const hostA = hostOf(a.url);
  const hostB = hostOf(b.url);
  const keyA = dedup.aliasKey(a.title);
  const keyB = dedup.aliasKey(b.title);
  const normA = dedup.normalizeTitle(a.title);
  const normB = dedup.normalizeTitle(b.title);
  const d = dice(bigrams(a.title), bigrams(b.title));
  const signals = {
    sameHost: Boolean(hostA) && hostA === hostB,
    sameAliasKey: Boolean(keyA) && keyA === keyB,
    containment: Boolean(normA && normB) && normA !== normB
      && Math.min(normA.length, normB.length) >= 4
      && (normA.includes(normB) || normB.includes(normA)),
    sameVendor: Boolean(a.vendor) && String(a.vendor).toLowerCase() === String(b.vendor).toLowerCase(),
    titleDice: Math.round(d * 100) / 100
  };
  let score = 0;
  if (signals.sameHost) score += 1;
  if (signals.sameAliasKey) score += 1;
  if (signals.containment) score += 0.6;
  if (signals.titleDice >= 0.5) score += 0.5 * signals.titleDice;
  if (signals.sameVendor) score += 0.25;
  signals.score = Math.round(score * 100) / 100;
  return signals;
}

const MIN_SCORE = 0.25;

/**
 * 确定性预筛：产出入围对（不调用模型）。
 * @returns {{a:object,b:object,signals:object}[]}
 */
function shortlist(deals, { maxPairs = 60 } = {}) {
  const pairs = [];
  for (let i = 0; i < deals.length; i++) {
    for (let j = i + 1; j < deals.length; j++) {
      const a = deals[i];
      const b = deals[j];
      if (!a || !b || !a.id || !b.id) continue;
      if (a.region !== b.region) continue;
      const signals = signalsOf(a, b);
      if (signals.score < MIN_SCORE) continue;
      pairs.push({ a, b, signals });
    }
  }
  pairs.sort((x, y) => y.signals.score - x.signals.score || String(x.a.id).localeCompare(String(y.a.id)) || String(x.b.id).localeCompare(String(y.b.id)));
  return pairs.slice(0, maxPairs);
}

function pairKey(a, b) {
  return [a.id, b.id].sort().join('~');
}

function brief(deal) {
  return [
    `id：${deal.id}`,
    `标题：${deal.title}`,
    `厂商：${deal.vendor}`,
    `官方页：${deal.url}`,
    deal.discountInfo ? `优惠文案：${deal.discountInfo}` : null,
    deal.eligibility ? `资格：${deal.eligibility}` : null,
    Array.isArray(deal.benefitType) && deal.benefitType.length ? `福利类型：${deal.benefitType.join(' / ')}` : null,
    Array.isArray(deal.audience) && deal.audience.length ? `适用人群：${deal.audience.join(' / ')}` : null,
    deal.source ? `来源：${deal.source}` : null
  ].filter(Boolean).join('\n');
}

function buildContent(pair, maxChars) {
  const { a, b, signals } = pair;
  const text = [
    '【记录 A】', brief(a), '',
    '【记录 B】', brief(b), '',
    '【确定性预筛信号】（供参考，不是结论）',
    `  同 host：${signals.sameHost ? '是' : '否'}`,
    `  归一标题完全相同：${signals.sameAliasKey ? '是' : '否'}`,
    `  一条标题包含另一条：${signals.containment ? '是' : '否'}`,
    `  厂商相同：${signals.sameVendor ? '是' : '否'}`,
    `  标题字符二元组相似度：${signals.titleDice}`,
    '',
    '【输出格式】',
    '{"relation":"…","confidence":0.0-1.0,"reason":"…","evidence":["…","…"]}'
  ].join('\n');
  return maxChars ? text.slice(0, maxChars) : text;
}

async function units({ deals, options = {} }) {
  const maxPairs = options.maxPairs || options.limit * 3 || 60;
  const pairs = options.pairs || shortlist(deals, { maxPairs });
  const maxChars = options.maxInputChars || schemas.TASK_LIMITS[TASK];
  return pairs.map(pair => ({
    key: pairKey(pair.a, pair.b),
    dealId: pair.a.id,
    field: pair.b.id,
    sourceUrl: pair.a.url,
    deal: pair.a,
    pair,
    content: redact.collapse(buildContent(pair, maxChars))
  }));
}

function interpret(result) {
  return {
    candidate: {
      relation: result.relation,
      confidence: result.confidence,
      reason: result.reason,
      evidence: result.evidence
    },
    evidence: result.evidence || [],
    confidence: { relation: result.confidence }
  };
}

module.exports = {
  TASK,
  PROMPT_VERSION,
  SYSTEM,
  MIN_SCORE,
  hostOf,
  bigrams,
  dice,
  signalsOf,
  shortlist,
  pairKey,
  buildContent,
  units,
  interpret
};
