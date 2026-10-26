/**
 * 答案页的「门槛速查」判据层（v1.8-seo-answer-pages）。
 *
 * ## 它解决什么
 *
 * `/free-api/`（数据面 = `deals.json`）与 `/plans/api/`（数据面 = `api-plans.json`）
 * 都要回答同一类问题：**能不能真的用上，卡在哪几道门槛**。两个数据源用的字段名不同、
 * 但四个维度的语义是同一套：
 *
 *   · 实名认证   —— deals: `eligibilityDetail.identityVerificationRequired`；
 *   · 限流       —— api-plans: `limits[]`（rpm / tpm / rpd / tpd / concurrency）
 *                   与 `restrictions[]` 的 `rate_limit`；
 *   · 商用限制   —— 本站数据**没有**结构化的「可否商用」字段（见下）；
 *   · 地区       —— deals: `availability.chinaUsable` / `regionRestriction`；
 *                   api-plans: `region` 与 `restrictions[]` 的 `region_restriction`。
 *
 * 三个页面的渲染点（目录页 / API 计费页）如果各写一份「怎么把三态数成一句话」，
 * 就会出现「同一批数据显示两套口径」—— 所以本模块是**唯一实现**：标签表、三态聚合、
 * 限流摘要、商用/公平使用摘要、免费额度摘要、地区摘要全在这里；页面只负责把它拼进表格。
 *
 * ## 诚实性红线（比格式重要）
 *
 * 数据里**没有**「可否商用」这个字段。本模块的做法是：
 *   · 有官方写到的 `fair_use` / `region_restriction` 就如实渲染；
 *   · 没有就渲染「数据未收录」——**绝不**把「没查到」写成「可商用」。
 *     页面上另有一句图例解释这件事（见调用方 `answernote`），报告里也把它列为数据缺口。
 *
 * ## 纯函数
 *
 * 不读盘、不联网、不看时钟；输入是 deals / api plans 数组，输出是字符串。
 */

'use strict';

/** 限流种类 → 中文标签（顺序即书写顺序，与 schema 的 LIMIT_KINDS 对齐） */
const LIMIT_LABEL = {
  rpm: 'RPM（每分钟请求）',
  tpm: 'TPM（每分钟 Token）',
  rpd: '每日请求上限',
  tpd: '每日 Token 上限',
  concurrency: '并发上限'
};

/** restrictions.kind → 中文标签（顺序与 plan-schema 的 RESTRICTION_KINDS 对齐） */
const RESTRICTION_LABEL = {
  concurrency: '并发限制',
  rate_limit: '限流',
  per_day_cap: '每日上限',
  rolling_window: '滚动窗口',
  output_limit: '输出上限',
  fair_use: '公平使用',
  region_restriction: '地区限制',
  account_required: '需要账号',
  invite_only: '邀请制',
  new_user_only: '仅限新用户'
};

/** freeTier.stability → 中文标签 */
const FREE_TIER_STABILITY_LABEL = {
  standing: '长期提供',
  new_user: '新用户赠送',
  promotional: '限时赠送'
};

/** 三态值 → 短语（与 `audience.triLabel` 同一套语义：unknown ≠ false） */
function triPhrase(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  return '尚未确认';
}

/**
 * 三态字段的逐条聚合：**只数已知值，unknown 单独计数**。
 *
 * 为什么不是「任意一条 true 就说需要」：同一平台可能有的条目要求实名、有的没写；
 * 把「没写」并进「不需要」就是在替来源下结论。所以输出是「需要 n 条 · 不需要 m 条 ·
 * 尚未确认 k 条」，读者自己看比例。
 *
 * @param {object[]} items 数据条目
 * @param {(item:object)=>any} get 取三态值的函数
 * @returns {string}
 */
function triSummary(items, get) {
  const list = Array.isArray(items) ? items : [];
  let yes = 0;
  let no = 0;
  for (const item of list) {
    let value;
    try { value = get(item); } catch (error) { value = undefined; }
    if (value === true) yes += 1;
    else if (value === false) no += 1;
  }
  const unknown = list.length - yes - no;
  const parts = [];
  if (yes) parts.push(`需要 ${yes} 条`);
  if (no) parts.push(`不需要 ${no} 条`);
  if (unknown) parts.push(`尚未确认 ${unknown} 条`);
  return parts.length ? parts.join(' · ') : '数据未收录';
}

/** 一条 limit → 「并发上限 2500（deepseek-flash）」 */
function limitText(limit) {
  const label = LIMIT_LABEL[limit.kind] || String(limit.kind || '限制');
  const applies = Array.isArray(limit.appliesTo) && limit.appliesTo.length
    ? `（${limit.appliesTo.join(' / ')}）` : '';
  return `${label} ${limit.value}${applies}`;
}

/** 限流摘要：limits 的数值 + restrictions 里的 rate_limit 文字；都没有 = 数据未收录 */
function limitsSummary(plans) {
  const parts = [];
  for (const plan of Array.isArray(plans) ? plans : []) {
    for (const limit of plan.limits || []) parts.push(limitText(limit));
    for (const restriction of plan.restrictions || []) {
      if (restriction.kind !== 'rate_limit') continue;
      const text = restriction.value === true ? '有' : restriction.value === false ? '无' : String(restriction.value || '');
      if (text) parts.push(`限流：${text}`);
    }
  }
  return parts.length ? [...new Set(parts)].join('；') : '数据未收录';
}

/**
 * 商用 / 公平使用 / 地区限制摘要。
 *
 * ⚠️ 「不可商用」在本站数据里**没有结构化字段**（这是本轮复核确认的数据缺口，
 * 不是本函数的疏忽）。所以这里只渲染官方写到的 `fair_use` / `region_restriction`，
 * 并在没有任何依据时明写「不可商用：数据未收录」——**不把缺依据写成允许商用**。
 */
function useRestrictionsSummary(plans) {
  const parts = [];
  for (const plan of Array.isArray(plans) ? plans : []) {
    for (const restriction of plan.restrictions || []) {
      if (restriction.kind === 'fair_use') {
        const value = restriction.value === true ? '是（免费档数据会被用于改进产品）'
          : restriction.value === false ? '否' : '未说明';
        parts.push(`公平使用：${value}`);
      } else if (restriction.kind === 'region_restriction') {
        parts.push(`地区限制：${String(restriction.value || '')}`);
      }
    }
  }
  const head = '不可商用：数据未收录';
  return [...new Set(parts)].length ? `${head}；${[...new Set(parts)].join('；')}` : head;
}

/** 免费额度摘要（api-plans 的 freeTier；多个计费记录去重合并） */
function freeTierSummary(plans) {
  const parts = [];
  for (const plan of Array.isArray(plans) ? plans : []) {
    const freeTier = plan.freeTier;
    if (!freeTier) continue;
    if (freeTier.type === 'none') { parts.push('官方明说没有免费额度'); continue; }
    const bits = [];
    if (freeTier.stability) bits.push(FREE_TIER_STABILITY_LABEL[freeTier.stability] || String(freeTier.stability));
    if (typeof freeTier.amount === 'number' && freeTier.amount > 0) bits.push(`${freeTier.amount.toLocaleString('en-US')} ${freeTier.type}`);
    if (Array.isArray(freeTier.models) && freeTier.models.length) bits.push(`${freeTier.models.length} 个模型免费`);
    if (freeTier.type && freeTier.type !== 'tokens' && freeTier.type !== 'models' && freeTier.type !== 'none') bits.push(String(freeTier.type));
    parts.push(bits.filter(Boolean).join(' · ') || '有免费额度（口径见记录）');
  }
  return [...new Set(parts)].length ? [...new Set(parts)].join('；') : '数据未收录';
}

/** 地区摘要：deals 侧（chinaUsable / regionRestriction） */
function dealRegionSummary(deals) {
  const list = Array.isArray(deals) ? deals : [];
  const usable = list.filter(deal => deal.availability && deal.availability.chinaUsable === true).length;
  const restrictions = [...new Set(list
    .map(deal => deal.availability && deal.availability.regionRestriction)
    .filter(Boolean))];
  const head = usable ? `确认中国大陆可用 ${usable}/${list.length} 条` : '中国大陆可用性：尚未确认';
  return restrictions.length ? `${head}；限制原文：${restrictions.join('；')}` : head;
}

/** 地区摘要：api-plans 侧（region + region_restriction） */
function planRegionSummary(plans) {
  const list = Array.isArray(plans) ? plans : [];
  const regions = [...new Set(list.map(plan => (plan.region === 'cn' ? '国内' : plan.region === 'global' ? '国外' : '')).filter(Boolean))];
  const restrictions = [];
  for (const plan of list) {
    for (const restriction of plan.restrictions || []) {
      if (restriction.kind === 'region_restriction') restrictions.push(String(restriction.value || ''));
    }
  }
  const uniq = [...new Set(restrictions.filter(Boolean))];
  const head = regions.length ? `平台地区：${regions.join(' / ')}` : '平台地区：未标注';
  return uniq.length ? `${head}；地区限制：${uniq.join('；')}` : head;
}

module.exports = {
  LIMIT_LABEL,
  RESTRICTION_LABEL,
  FREE_TIER_STABILITY_LABEL,
  triPhrase,
  triSummary,
  limitsSummary,
  useRestrictionsSummary,
  freeTierSummary,
  dealRegionSummary,
  planRegionSummary
};
