/**
 * 能力 6：既有记录的**数据质量审计**候选（只报警，不改数据）。
 *
 * ## 与其它任务的根本区别：输入是「我们自己的记录」，不是网页
 *
 * extract / dedup 把外部页面送进去判断「世界是什么样」；这里送进去的全部是**我们自己的
 * 字段与引文**，让模型回答一个更窄的问题：**这条记录自己前后对不上吗**。矛盾的两边都在
 * 我们手里，可以被逐字引用、被复核 —— 这是本任务假阳性天然低的原因。
 *
 * ## 确定性预筛不是模型的替代品，而是本层的目标形态
 *
 * 134 条全送模型既贵又没意义（绝大多数记录没有内部矛盾，模型只能逐条说「没问题」）。
 * 所以先用零成本信号挑出「看起来可疑」的一小撮，并把**是哪条信号**写进 `meta.suspicion`
 * —— 「为什么这条被审计」于是也是可复现、可统计的确定性事实。而 `suggestedValidatorRule`
 * 要求模型给出「能取代这次 AI 判断的确定性规则」，收敛的终点就是把这些信号变成
 * `validate.js` 里的断言，让 AI 只处理真正新的形态。
 *
 * ## 官方判据一律复用，不在这里重写第二份
 *
 * 「长期有效」的措辞判据在 `lib/classify.js`（前后端逐字节共享）、自封结论黑名单在
 * `lib/provenance.js` 的 `STAMP_PATTERNS`、枚举与标签在 `lib/audience.js`。两处各判一次、
 * 改一处不改另一处，是 v1.0 已经付过学费的那类错误。
 *
 * ## 红线：本模块结构上不存在写路径
 *
 * 不 require `./cache` / `./candidates` / `./redact` / `../lib/store` —— 它们直接或间接带
 * 文件写能力（`redact` 依赖 `./cache` 落盘）。这里只读调用方传入的 `deals`，不碰 deals.json。
 */

'use strict';

const schemas = require('./schemas');
const audience = require('../lib/audience');
const provenance = require('../lib/provenance');
const expiry = require('../lib/expiry');

const TASK = 'audit_record';
const PROMPT_VERSION = schemas.PROMPT_VERSIONS[TASK];

/** 默认最多审 20 条：审计是人工复核队列，一次冒出上百条没人看 */
const DEFAULT_LIMIT = 20;

/** 引文短于这个长度撑不起任何断言（「免费」两个字什么都不能证明） */
const MIN_QUOTE_CHARS = 12;

/**
 * 「长期 / 永久有效」的判据只有一份实现（classify.js 的正则源文本 + flags），
 * 这里重新编译成 RegExp 而不是抄一遍词表。`ONGOING_PATTERNS.flags` 是生产侧的 flags。
 */
const ONGOING_RE = new RegExp(expiry.ONGOING_PATTERNS.positive, expiry.ONGOING_PATTERNS.flags);

/** 'inferred' 同时是 BASIS_VALUES 与 DERIVED_VALUES 的成员；取交集而不是再写一遍字面量 */
const INFERRED = audience.BASIS_VALUES.find(value => audience.DERIVED_VALUES.includes(value));

/** 自由文本线索也从单一词表派生：标签改了，这里的探针跟着改，不会各写各的 */
const STUDENT_CUE = audience.AUDIENCE_LABELS.student;
const EDU_MAIL_CUE = audience.ELIGIBILITY_LABELS.educationEmailRequired.replace(/^需要/, '');
const NO_CARD_RE = new RegExp(`无需信用卡|免信用卡|${audience.claimLabel('creditCardRequired', false)}`);

/** 大陆线索：命中即说明「global 却写 chinaUsable=true」至少有正文依据，不算可疑 */
const MAINLAND_RE = /中国大陆|大陆|国内|中国|\bchina\b|\bmainland\b/i;

/** 数字（含千分位与小数）的抽取 */
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

const F = audience.FIELD_LABELS; // 字段中文名不在这里另写一份

const SYSTEM = [
  '你是一个 AI 优惠数据的**内部一致性**审计员。',
  '',
  '你的唯一职责：在**同一条记录内部**找矛盾 —— 字段之间对不上、断言的强度超过它自己收录的原文片段、',
  '结构化取值与自由文本互相拆台、写出来的数字在该记录的引文里找不到。',
  '',
  '铁律（违反任何一条，你的输出会被判定为无效）：',
  '1. **不许引入外部世界的事实，也不许使用你的先验知识。** 你不知道这条优惠今天是否有效、',
  '   是不是真的长期，也不要去猜；你只能说「这条记录自己前后对不上」。矛盾的两边都必须来自下面的内容。',
  '2. contradiction 必须**逐字引用**互相冲突的两段文字（用「」括起），不得改写、拼接、翻译。',
  '3. code 是稳定的短机器码（小写下划线，例如 validity_expires_mismatch）。同一个毛病每次都必须用同一个 code ——',
  '   这个 code 将来要收敛成确定性测试，随手换措辞会让它无法被统计。',
  '4. field 写这条发现落在哪个字段（如 validity、eligibility、eligibilityDetail.studentRequired）。',
  '5. severity：info=提醒，warn=可能要修，error=读者会被这句话误导。',
  '6. suggestedValidatorRule 必须描述一条**确定性规则**（判据 + 期望结果），要能被写成不调用模型的断言。',
  '   说不出确定性规则就不要提这条发现 —— 这一层存在的目的就是让 AI 判断最终变成零成本测试。',
  '7. 没有真矛盾就不要硬凑，findings 允许是空数组。宁缺毋滥。',
  '8. 只输出一个 JSON 对象。'
].join('\n');

/* ------------------------------------------------------------------ */
/* 确定性信号                                                          */
/* ------------------------------------------------------------------ */

function evidenceItems(deal) {
  return (Array.isArray(deal.evidence) ? deal.evidence : []).filter(item => item && item.quote);
}

function evidenceQuotes(deal) {
  return evidenceItems(deal).map(item => String(item.quote));
}

/** 记录自身的全部文本（含引文）。这类「找线索」的判断只看我们自己已有的字 */
function allText(deal) {
  return [
    deal.title, deal.vendor, deal.discountInfo, deal.description,
    deal.eligibility, deal.validity,
    Array.isArray(deal.features) ? deal.features.join(' ') : null,
    deal.availability && deal.availability.regionRestriction,
    ...evidenceQuotes(deal)
  ].filter(Boolean).join(' ');
}

/** 文本是否带绝对化断言：生产侧「长期有效」判据 + provenance 的自封结论黑名单 */
function matchesAbsoluteClaim(text) {
  if (!text) return false;
  if (ONGOING_RE.test(text)) return true;
  return provenance.STAMP_PATTERNS.some(pattern => pattern.re.test(text));
}

/** 引文里是否自己就说了长期 / 保证 —— 说了，这个断言就**有据**，不算可疑 */
function claimSupportedByEvidence(deal) {
  return matchesAbsoluteClaim(evidenceQuotes(deal).join(' '));
}

/** discountInfo 里的数字有没有一个在该记录的引文里完全找不到 */
function numberMissingFromQuotes(deal) {
  const quotes = evidenceQuotes(deal).join(' ');
  const numbers = String(deal.discountInfo || '').match(NUMBER_RE) || [];
  return numbers.some(raw => !quotes.includes(raw) && !quotes.includes(raw.replace(/,/g, '')));
}

/** provenance 声明为「推断」却没有推理说明（契约要求 basis/derived=inferred 必须带 note） */
function inferredWithoutNote(deal) {
  const fields = deal.provenance && deal.provenance.fields;
  if (!fields || typeof fields !== 'object') return false;
  return Object.keys(fields).some(key => {
    const entry = fields[key];
    if (!entry || typeof entry !== 'object') return false;
    if (entry.basis !== INFERRED && entry.derived !== INFERRED) return false;
    return !(typeof entry.note === 'string' && entry.note.trim());
  });
}

/**
 * 一条记录命中的全部可疑信号（稳定短码）。顺序固定 = 输出可复现。
 */
function suspicionsOf(deal) {
  if (!deal || typeof deal !== 'object') return [];
  const out = [];
  const text = [deal.discountInfo, deal.validity].filter(Boolean).join(' ');
  const deadlineInText = expiry.extractDeadline([deal.validity, deal.discountInfo].filter(Boolean).join('。'));

  // ① 期限自相矛盾。expiresAt 与「文案里有没有截止日」必须同向。
  if (deal.expiresAt) {
    if (expiry.isOngoing(deal.validity)) out.push('validity_ongoing_but_expires');
    if (!deadlineInText) out.push('expires_without_deadline_text');
  } else if (expiry.extractDeadline(String(deal.validity || ''))) {
    // 反向：文案里写死了绝对截止日，记录上却没有 expiresAt（applyDeadline 应当已补上）
    out.push('validity_deadline_without_expires');
  }

  // ② 绝对化断言（永久 / 长期有效 / 100% / 保证）而本方引文支持不了它
  if (matchesAbsoluteClaim(text) && !claimSupportedByEvidence(deal)) out.push('absolute_claim_unsupported');

  // ③ 福利类型是「试用」，文案却说长期 / 永久 —— 两个字段描述的不是同一种东西
  if (Array.isArray(deal.benefitType) && deal.benefitType.includes('trial') && expiry.isOngoing(text)) {
    out.push('trial_claims_permanent');
  }

  // ④ discountInfo 里的数字在引文里找不到（只在有引文时才判：没有引文是另一条信号的事）
  if (evidenceQuotes(deal).length && numberMissingFromQuotes(deal)) out.push('number_not_in_evidence');

  // ⑤ 资格自由文本 vs 结构化三态
  const eligibilityText = String(deal.eligibility || '');
  const detail = deal.eligibilityDetail || {};
  const claim = deal.claimRequirements || {};
  if (eligibilityText.includes(STUDENT_CUE) && detail.studentRequired !== true) {
    out.push('eligibility_text_student_unsupported');
  }
  if (NO_CARD_RE.test(eligibilityText) && claim.creditCardRequired === true) {
    out.push('eligibility_text_nocard_conflict');
  }
  if (eligibilityText.includes(EDU_MAIL_CUE) && detail.educationEmailRequired !== true) {
    out.push('eligibility_text_edumail_unsupported');
  }

  // ⑥ global 却写「中国大陆可用」，且正文里找不到任何大陆线索（这条以前咬过本项目）
  if (deal.region === 'global' && deal.availability && deal.availability.chinaUsable === true
    && !MAINLAND_RE.test(allText(deal))) {
    out.push('global_china_usable_no_hint');
  }

  // ⑦ 声明为推断却写不下推理链 —— 推理链就是断言的一部分
  if (inferredWithoutNote(deal)) out.push('inferred_without_note');

  // ⑧ 过短的引文撑不起任何断言
  if (evidenceItems(deal).some(item => Array.from(String(item.quote)).length < MIN_QUOTE_CHARS)) {
    out.push('evidence_quote_too_short');
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* 提示词载荷                                                          */
/* ------------------------------------------------------------------ */

function row(label, value) {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text ? `${label}：${text}` : `${label}：（无）`;
}

/** 三态映射行：键次序取生产词表，没写的键一律不出现 */
function mapRow(label, value, keys) {
  if (!value || typeof value !== 'object') return `${label}：（无）`;
  const parts = keys.filter(key => value[key] !== undefined).map(key => `${key}=${JSON.stringify(value[key])}`);
  return `${label}：${parts.length ? parts.join(' / ') : '（无）'}`;
}

function availabilityRow(deal) {
  const value = deal.availability;
  if (!value || typeof value !== 'object') return `${F.availability}：（无）`;
  const parts = [];
  if (value.chinaUsable !== undefined) parts.push(`chinaUsable=${JSON.stringify(value.chinaUsable)}`);
  if (value.regionRestriction) parts.push(`regionRestriction=「${value.regionRestriction}」`);
  return `${F.availability}：${parts.length ? parts.join(' / ') : '（无）'}`;
}

/** provenance.fields 摘要：模型要看的是「我们自己声明这条断言是怎么来的」 */
function provenanceLines(deal) {
  const value = deal.provenance;
  if (!value || typeof value !== 'object') return ['provenance：（无）'];
  const lines = [`provenance.credibility：${value.credibility || '（无）'}`];
  const fields = value.fields && typeof value.fields === 'object' ? value.fields : {};
  const keys = Object.keys(fields);
  if (!keys.length) return [...lines, 'provenance.fields：（无）'];
  for (const key of keys) {
    const entry = fields[key] || {};
    const derived = entry.derived ? ` derived=${entry.derived}` : '';
    lines.push(`provenance.fields.${key}：basis=${entry.basis || '（无）'}${derived} note=${entry.note ? `「${entry.note}」` : '（无）'}`);
  }
  return lines;
}

function evidenceLines(deal) {
  const items = evidenceItems(deal);
  if (!items.length) return ['【我们收录的官方原文片段】（无）'];
  return [
    '【我们收录的官方原文片段】（我们自己的字符串；矛盾要指到具体哪一句）',
    ...items.map(item => `- [${item.field || '?'}] ${item.quote}`)
  ];
}

/**
 * 只装这条记录自己的东西：字段、provenance 摘要、evidence 引文。
 * **绝不带其它记录**：这是记录内部的审计，看过邻居会把「内部矛盾」变成「跟别人比」。
 */
function buildContent(deal, suspicions = []) {
  const lines = [
    '【任务】只审计下面**这一条**记录，找出它自己跟自己矛盾的地方。',
    '',
    '【记录】',
    `id：${deal.id}`,
    row('标题', deal.title),
    row('厂商', deal.vendor),
    row('官方页', deal.url),
    row('region', deal.region),
    '',
    '【我们自己写的字段】',
    row('discountInfo 优惠文案', deal.discountInfo),
    row('description 简介', deal.description),
    row('eligibility 资格说明', deal.eligibility),
    row('validity 有效期说明', deal.validity),
    row('expiresAt 截止日期', deal.expiresAt),
    row('pricingModel 定价模式', deal.pricingModel),
    row('audience ' + F.audience, Array.isArray(deal.audience) ? deal.audience.join(' / ') : null),
    row('benefitType ' + F.benefitType, Array.isArray(deal.benefitType) ? deal.benefitType.join(' / ') : null),
    mapRow('eligibilityDetail ' + F.eligibilityDetail, deal.eligibilityDetail, audience.ELIGIBILITY_KEYS),
    mapRow('claimRequirements ' + F.claimRequirements, deal.claimRequirements, audience.CLAIM_KEYS),
    availabilityRow(deal),
    '',
    '【断言依据 provenance】（我们自己声明的，用于判断「推断却写不下理由」这类问题）',
    ...provenanceLines(deal),
    '',
    ...evidenceLines(deal),
    '',
    '【确定性预筛信号】（我们零成本挑出这条的理由，供参考，**不是结论**）',
    `  ${suspicions.join(' / ') || '（无）'}`,
    '',
    '【输出格式】',
    '{"findings":[{"code":"小写下划线短码","severity":"info|warn|error","field":"字段名",' +
      '"claim":"这条记录断言了什么","contradiction":"逐字引用冲突的两段","suggestedValidatorRule":"可写成断言的确定性规则"}],' +
      '"confidence":0.0-1.0}',
    '没有真矛盾就给空数组。'
  ];

  const text = lines.filter(line => line !== null && line !== undefined).join('\n');
  const max = schemas.TASK_LIMITS[TASK];
  if (text.length <= max) return text;
  // 截断必须写在正文里：模型看不到截断标记时，会把「后面没有了」当成「原文没写」
  return `${text.slice(0, Math.max(0, max - 32))}\n[内容已截断，只送出前 ${max} 字]`;
}

/* ------------------------------------------------------------------ */
/* 单元与解释                                                          */
/* ------------------------------------------------------------------ */

/** 确定性预筛 → 待审计单元。只有命中至少一条信号的记录才会产出单元 */
function units({ deals, options = {} }) {
  const list = Array.isArray(deals) ? deals : [];
  const requested = Number(options.limit);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : DEFAULT_LIMIT;
  const out = [];

  for (const deal of list) {
    // 单条脏记录不能让整批审计中断：形状不对就跳过（审计器不该死在被审计的数据上）
    if (!deal || typeof deal !== 'object' || Array.isArray(deal)) continue;
    if (typeof deal.id !== 'string' || !deal.id) continue;
    let suspicion;
    try {
      suspicion = suspicionsOf(deal);
    } catch (error) {
      continue;
    }
    if (!suspicion.length) continue;
    out.push({
      key: deal.id,
      dealId: deal.id,
      field: null,
      sourceUrl: deal.url || null,
      deal,
      content: buildContent(deal, suspicion),
      meta: { suspicion }
    });
  }

  // 可疑点多的先审；同分按 id 排序，保证同一份数据每次产出同一批、同一顺序
  out.sort((a, b) => b.meta.suspicion.length - a.meta.suspicion.length
    || String(a.dealId).localeCompare(String(b.dealId)));
  return out.slice(0, limit);
}

/**
 * 结果 → 候选信封。这个任务的 `evidence` **刻意留空**：证据在每条 finding 的
 * `claim` / `contradiction` 里（它们本身就是逐字引用）。硬塞进信封只会制造一个
 * 「有引文就放行」的假象 —— `checkDeterministic` 也因此不对 `audit_record` 跑 R1。
 */
function interpret(result) {
  const findings = result && Array.isArray(result.findings) ? result.findings : [];
  const confidence = result && typeof result.confidence === 'number' ? result.confidence : 0;
  return {
    candidate: { findings, confidence },
    evidence: [],
    confidence: { findings: confidence },
    notes: null
  };
}

module.exports = {
  TASK,
  PROMPT_VERSION,
  SYSTEM,
  MIN_QUOTE_CHARS,
  DEFAULT_LIMIT,
  suspicionsOf,
  buildContent,
  units,
  interpret
};
