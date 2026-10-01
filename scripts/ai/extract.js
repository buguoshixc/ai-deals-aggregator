/**
 * 能力 1：优惠字段提取候选。
 *
 * 输入 = 官方页面正文（净化后）+ 页面 metadata + 我们当前已有的提取结果；
 * 输出 = 六字段候选 + 逐字段引文 + 置信度，**永不直接改数据**。
 *
 * ## 提示词里最重要的一句是「不要用你的先验知识补」
 *
 * 模型知道 Cursor 有学生优惠、知道 Azure for Students 不用信用卡 —— 这些**记忆**在
 * 这里全是噪声：我们要的是「这一页今天写了什么」。一条凭记忆写下的断言无法被复核，
 * 而本站全部的可信度都建立在"每条断言都能指回一句原话"上。
 *
 * 所以 `unknown` 在这里**不是失败**，是正确答案。评测里的头条指标
 * `falseCertainty`（本该 unknown 却给了确定值）就是在量这件事。
 *
 * ## 两种输入来源
 *
 * - `--source=fetch`（默认）：真去抓官方页。这是真实维护时的用法。
 * - `--source=record`：只用记录里已有的文本字段。离线、可复现，评测与回放用这条。
 * 两者共用同一个提示词与同一个校验链 —— 评测里测的就是线上那条路径。
 */

'use strict';

const redact = require('./redact');
const schemas = require('./schemas');
const http = require('../lib/http');
const { todayCN } = require('../lib/schema');

const TASK = 'extract_offer';
const PROMPT_VERSION = schemas.PROMPT_VERSIONS[TASK];

const SYSTEM = [
  '你是一个 AI 优惠数据核对员。你的唯一职责是：从给定的官方页面正文里，判断这条优惠的几个结构化字段。',
  '',
  '铁律（违反任何一条，你的输出会被判定为无效）：',
  '1. 只依据给定的正文。不要使用你自己的先验知识、记忆或猜测。',
  '2. 正文没有明确写到的，必须写成 "unknown"。写 "unknown" 永远比写错好。',
  '3. 每一个非 "unknown" 的字段，都必须在 evidence 里给出一条**逐字摘录**的原文引文，' +
    '引文的 field 必须与字段名完全相同。',
  '4. 三态字段只能是 true、false 或 "unknown" 三者之一，不能用 null、0、1、字符串 "true"。',
  '5. 引文必须是原文的连续片段，不得改写、拼接、翻译。',
  '6. 只输出一个 JSON 对象。'
].join('\n');

/** 记录自身的文本（`--source=record` 用，也用于评测回放） */
function recordText(deal) {
  const lines = [
    ['标题', deal.title],
    ['厂商', deal.vendor],
    ['优惠文案', deal.discountInfo],
    ['简介', deal.description],
    ['资格说明', deal.eligibility],
    ['有效期说明', deal.validity],
    ['标签', Array.isArray(deal.features) ? deal.features.join(' / ') : null]
  ].filter(([, value]) => value);
  const evidence = Array.isArray(deal.evidence) ? deal.evidence : [];
  for (const item of evidence) {
    if (item && item.quote) lines.push([`官方原文（${item.field}）`, item.quote]);
  }
  return lines.map(([label, value]) => `${label}：${value}`).join('\n');
}

function buildContent(deal, pageText, pageMeta) {
  const parts = [
    '【任务】判断下面这条优惠的结构化字段。',
    '',
    '【我们已有的信息】（只用于定位这条优惠，**不是**证据；不要把这些话抄进 evidence）',
    `标题：${deal.title}`,
    `厂商：${deal.vendor}`,
    `官方页：${deal.url}`,
    deal.discountInfo ? `我们目前写的优惠文案：${deal.discountInfo}` : null,
    deal.eligibility ? `我们目前写的资格：${deal.eligibility}` : null,
    deal.validity ? `我们目前写的有效期：${deal.validity}` : null,
    '',
    pageMeta && pageMeta.title ? `【页面标题】${pageMeta.title}` : null,
    pageMeta && pageMeta.description ? `【页面描述】${pageMeta.description}` : null,
    '',
    '【官方页面正文】（已做 DOM 清洗，可能被截断）',
    '```',
    pageText,
    '```',
    '',
    '【要判断的字段】',
    `audience：适用人群，取值来自 ${schemas.SCHEMAS.extract_offer.properties.audience.items.enum.join(' / ')}，可多选`,
    `benefitType：福利类型，取值来自 ${schemas.SCHEMAS.extract_offer.properties.benefitType.items.enum.join(' / ')}，可多选`,
    `eligibilityDetail：${require('../lib/audience').ELIGIBILITY_KEYS.join(' / ')}，每个都是三态`,
    `claimRequirements：${require('../lib/audience').CLAIM_KEYS.join(' / ')}，每个都是三态`,
    'availability.chinaUsable：中国大陆用户是否可用（三态）；availability.regionRestriction：地区限制的原文摘录（≤120 字）',
    'discountInfo / eligibility / validity：需要更正时才给，否则省略',
    '',
    '【输出格式】',
    '{"audience":[…],"benefitType":[…],"eligibilityDetail":{…},"claimRequirements":{…},' +
      '"availability":{…},"evidence":[{"field":"…","quote":"…"}],"confidence":{"字段名":0.0-1.0}}',
    '省略你无法从正文判断的字段（不要写 "unknown" 之外的猜测值）。'
  ];
  return parts.filter(line => line !== null && line !== undefined).join('\n');
}

/**
 * 产出待处理的单元。
 * @param {{deals:object[], options:object}} ctx
 */
async function units({ deals, options = {} }) {
  const source = options.source || 'fetch';
  const only = options.only ? new Set([].concat(options.only)) : null;
  const maxChars = options.maxInputChars || schemas.TASK_LIMITS[TASK];
  const out = [];

  for (const deal of deals) {
    if (only && !only.has(deal.source)) continue;
    let pageText = null;
    let pageMeta = null;
    let skip = null;

    if (source === 'record') {
      const prepared = redact.prepareInput({ text: recordText(deal), maxChars });
      pageText = prepared.text;
      pageMeta = { title: deal.title };
    } else {
      try {
        const html = await http.getText(deal.url, { timeout: options.timeoutMs || 20000 });
        const prepared = redact.prepareInput({ html, maxChars });
        pageText = prepared.text;
        pageMeta = prepared.meta;
        if (prepared.redacted) skip = null; // 脱敏过不等于跳过，只是记账
      } catch (error) {
        out.push({
          key: `${deal.id}`, dealId: deal.id, field: null, sourceUrl: deal.url, deal,
          skipped: `抓取失败: ${String(error.message || error).slice(0, 120)}`
        });
        continue;
      }
    }

    if (!pageText || pageText.length < 40) {
      out.push({
        key: `${deal.id}`, dealId: deal.id, field: null, sourceUrl: deal.url, deal,
        skipped: `正文过短（${pageText ? pageText.length : 0} 字），不足以判断`
      });
      continue;
    }

    out.push({
      key: `${deal.id}`,
      dealId: deal.id,
      field: null,
      sourceUrl: deal.url,
      deal,
      content: buildContent(deal, pageText, pageMeta),
      meta: { source, capturedAt: todayCN() }
    });
  }

  return out;
}

function interpret(result) {
  const candidate = { ...result };
  delete candidate.evidence;
  delete candidate.confidence;
  const notes = candidate.notes;
  delete candidate.notes;
  return { candidate, evidence: result.evidence || [], confidence: result.confidence || {}, notes: notes || null };
}

module.exports = { TASK, PROMPT_VERSION, SYSTEM, units, interpret, buildContent, recordText };
