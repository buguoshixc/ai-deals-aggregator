/**
 * 能力 3：翻译草稿。
 *
 * ## 为什么只出草稿
 *
 * 译文有一条**已经跑通的人工循环**（`scripts/tools/zh-todo.js` 的清单 → 填 → `--scaffold` 盖指纹），
 * 而且译文门禁是硬的（漂移必红、待译按 7 天宽限）。AI 插进来的价值只有一个：
 * **把"从零写一句中文"变成"审一句中文"**。落地仍然要人点一下。
 *
 * 所以本模块：
 *  · 只写 `scripts/data/translations_zh.candidates.json`（我们自己的英文，可提交）；
 *  · **绝不写** `translations_zh.json`（那是人工覆盖层，由 `zh:apply-candidates` 单独落地）；
 *  · 每条候选先过 `translate-guard.js` 的确定性校验，过关才标 `candidate`，不过关直接 `invalid`。
 *
 * ## 提示词里为什么把"不许放大力度"逐条写出来
 *
 * 因为模型在翻译**营销文案**时会不自觉地把它翻译得更吸引人 —— 这不是模型"坏"，
 * 是训练数据里营销文案就该那么写。所以我们既在提示词里禁止（请求），
 * 又在 guard 里判（保证）。
 */

'use strict';

const redact = require('./redact');
const schemas = require('./schemas');
const guard = require('./translate-guard');
const zh = require('../lib/zh');
const audience = require('../lib/audience');

const TASK = 'translate_field';
const PROMPT_VERSION = schemas.PROMPT_VERSIONS[TASK];

const FIELD_LABELS = {
  discountInfo: '优惠文案',
  description: '简介',
  eligibility: '资格说明',
  validity: '有效期说明',
  priceLine: '价格阶梯行'
};

/** 术语表：厂商名里的拉丁词必须原样保留（只取 vendor —— 标题里的普通英文词会被正当翻译） */
const TERM_STOPWORDS = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'from', 'are', 'is', 'ai', 'inc', 'ltd', 'llc', 'labs', 'com']);

function termsOf(deal) {
  const words = String(deal.vendor || '').match(/[A-Za-z][A-Za-z0-9.+-]{2,}/g) || [];
  return [...new Set(words.filter(word => !TERM_STOPWORDS.has(word.toLowerCase())))];
}

const SYSTEM = [
  '你把英文的 AI 产品优惠文案翻译成简体中文。',
  '',
  '铁律（违反任何一条，你的输出会被自动判定为无效）：',
  '1. 数字、百分比、币种、URL、邮箱、产品名与厂商名**一律原样保留**，不得换算、不得改写。',
  '2. 不得放大优惠力度：trial/试用 不能翻成「免费」；credits/额度 不能翻成「现金/可提现」；',
  '   原文没有截止日时，不得出现「长期有效」「永久」。',
  '3. 不得抹平上限：up to / maximum 必须译出「最高/最多/上限」。',
  '4. 保留否定语气：no / not / without 必须在中文里体现出来。',
  '5. 原文是「官方未标注截止日期」这类**没有结论**的说法时，中文也要保持"没有结论"，不许补一个结论。',
  '6. 风格：简洁、直白、面向普通读者。不要用营销腔，不要加感叹号。',
  '7. 只输出一个 JSON 对象。'
].join('\n');

function isEnglishProse(text) {
  return zh.isEnglishProse ? zh.isEnglishProse(text) : /[A-Za-z]{3,}/.test(String(text || ''));
}

/**
 * 产出待翻译的单元。
 *
 * 「这个字段还需不需要译」**不在这里另写一套判据**：直接调 `zh.normalizeZh()`，
 * 它已经处理了原文指纹（`src`）与失效停用（stale）。自己再判一次，迟早会与门禁口径不一致。
 */
async function units({ deals, options = {} }) {
  const overlay = options.overlay || zh.load();
  const only = options.only ? new Set([].concat(options.only)) : null;
  const fields = options.fields || zh.ZH_FIELDS;
  const maxChars = options.maxInputChars || schemas.TASK_LIMITS[TASK];
  const out = [];

  for (const deal of deals) {
    if (only && !only.has(deal.source)) continue;
    const raw = overlay.byId ? overlay.byId[deal.id] : null;
    const normalized = raw ? zh.normalizeZh(raw, deal) : { zh: null, stale: [], errors: [] };
    const translated = normalized.zh || {};
    for (const field of fields) {
      if (!zh.ZH_FIELDS.includes(field)) continue;
      const en = deal[field];
      if (typeof en !== 'string' || !en.trim() || !isEnglishProse(en)) continue;
      if (translated[field]) continue; // 已有对得上的译文（指纹也是对的）
      const content = redact.collapse([
        `【字段】${FIELD_LABELS[field] || field}`,
        `【厂商】${deal.vendor}`,
        `【产品/标题】${deal.title}`,
        `【区域】${deal.region === 'cn' ? '中国大陆' : '海外'}`,
        `【长度上限】${zh.ZH_MAX[field] || 240} 字`,
        '',
        '【英文原文】',
        en,
        '',
        '【输出格式】',
        '{"zh":"…","confidence":0.0-1.0,"notes":"可选，一句话说明你为何这样译"}'
      ].join('\n')).slice(0, maxChars);
      out.push({
        key: `${deal.id}:${field}`,
        dealId: deal.id,
        field,
        sourceUrl: deal.url,
        deal,
        terms: termsOf(deal),
        content
      });
    }
  }
  return out;
}

function interpret(result) {
  return {
    candidate: { zh: result.zh },
    evidence: [],
    confidence: { zh: typeof result.confidence === 'number' ? result.confidence : undefined },
    notes: result.notes || null
  };
}

/**
 * 任务特有的确定性规则：译文守卫。
 * 不过关 ⇒ 直接 invalid（不是 needs_human）—— 这几条都是**确定说不通**的，
 * 交给人的只会是噪音。
 */
function extraRules(unit, result) {
  const check = guard.check({
    en: unit.deal[unit.field],
    zh: result.zh,
    terms: unit.terms,
    field: unit.field
  });
  return {
    errors: check.violations.map(v => `译文守卫 ${v.code}：${v.detail}`),
    flags: [],
    deterministic: { translateGuard: check.ok ? 'pass' : 'fail' }
  };
}

module.exports = { TASK, PROMPT_VERSION, SYSTEM, units, interpret, extraRules, termsOf, FIELD_LABELS, isEnglishProse };
