/**
 * 译文的确定性校验（**先过关，才允许被人接受**）。
 *
 * ## 为什么翻译也要"确定性校验"
 *
 * 翻译是 AI 最容易"顺手把话说大"的地方：
 *
 *   trial        →  「免费」            （试用变成免费）
 *   credits      →  「现金 / 可提现」    （额度变成钱）
 *   未标注截止日  →  「长期有效」         （没写的日期变成承诺）
 *   up to $200   →  「$200」            （上限变成确定值）
 *
 * 这些错误有个共同点：**它们在中文里读起来更顺、更吸引人**，所以人眼复核时最不容易发现。
 * 而它们全都违反 `docs/DESIGN-RULES.md` 第 8 节与 `provenance.STAMP_PATTERNS` 的诚实性红线。
 *
 * ## 为什么判据是"集合"而不是"逐字"
 *
 * 真人译过的句子会合法地改变数字的**形式**：
 *   `March 11, 2026` → `2026 年 3 月 11 日`（月份变成数字 3）
 *   `70% off`        → `7 折`（百分比换成折扣写法）
 * 逐字比对会把这两类**正确**译文判红，然后这条规则就会被关掉 —— 一条会误报的规则等于没有。
 * 所以：数字按月名展开后按**集合**比；折扣百分比到"折"的换算列入**显式允许的变换**。
 *
 * 误报与漏报之间，这里一律偏保守：**只拦确定说不通的**，模棱两可的交给人。
 */

'use strict';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

const CURRENCY_TOKENS = [
  { id: 'usd', re: /\$|US\$|USD|US dollars?/gi },
  { id: 'cny', re: /¥|￥|CNY|RMB|元|人民币/gi },
  { id: 'eur', re: /€|EUR/gi },
  { id: 'gbp', re: /£|GBP/gi }
];

const NEGATION_EN = /\b(no|not|never|without|excluded|excluding|unless|cannot|can't|doesn't|don't|isn't|aren't)\b/i;
const NEGATION_ZH = /不|无|没|未|非|除非|禁止|无法|免于/;
/** 强否定词组：译文中出现它等于给出了一个"不需要 X"的**结论**，必须有英文依据 */
const STRONG_NEGATION_ZH = /无需|不需|不必|毋须|毋需|未要求|不要求|不用/;

const FREE_EN = /\bfree\b|no cost|no charge|complimentary|\bzero\b|at no cost/i;
const TRIAL_EN = /\btrial\b|试用|try (it )?free|14-day|30-day free/i;
const CASH_WORDS_EN = /\bcash\b|withdraw|payout|money back|refund/i;
const CASH_WORDS_ZH = /现金|提现|折现|取现/;
const PERMANENT_EN = /\bpermanent(ly)?\b|forever|\balways\b|ongoing|standing|indefinitely|长期|永久/i;
const PERMANENT_ZH = /永久有效|永久免费|长期有效|长期免费|永久|永久性/;
const CAP_EN = /\bup to\b|\bmaximum\b|\bmax\b|\bat most\b|\bno more than\b/i;
const CAP_ZH = /最高|最多|至多|上限|不超过/;
const DATE_EN = /\b\d{4}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b\d{1,2}\/\d{1,2}\b/i;

function numbersOf(text, { expandMonths = false } = {}) {
  const out = new Set();
  const source = String(text || '');
  const re = /\d[\d,]*(?:\.\d+)?/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const raw = m[0].replace(/,/g, '');
    const value = Number(raw);
    if (Number.isFinite(value)) out.add(normalizeNumber(value));
  }
  if (expandMonths) {
    for (const [name, value] of Object.entries(MONTHS)) {
      const re2 = new RegExp(`\\b${name}\\b`, 'gi');
      if (re2.test(source)) out.add(String(value));
    }
  }
  return out;
}

function normalizeNumber(value) {
  return String(Math.round(value * 1e6) / 1e6);
}

/** `70% off` 允许译成 `3 折`：把这类"合法换算"从比较里摘出去 */
function discountConversions(text) {
  const allowed = new Set();
  const re = /(\d+(?:\.\d+)?)\s*%\s*(?:off|discount|less|saving)/gi;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    const pct = Number(m[1]);
    if (pct > 0 && pct < 100) {
      const zhe = (100 - pct) / 10;
      allowed.add(normalizeNumber(zhe));
      allowed.add(normalizeNumber(pct));
    }
  }
  return allowed;
}

function currenciesOf(text) {
  const out = new Set();
  for (const token of CURRENCY_TOKENS) {
    if (new RegExp(token.re.source, token.re.flags).test(String(text || ''))) out.add(token.id);
  }
  return out;
}

function urlsOf(text) {
  const source = String(text || '');
  const out = new Set();
  const withScheme = source.match(/https?:\/\/[^\s"'）)]+/gi) || [];
  for (const url of withScheme) out.add(url.replace(/[.,;]$/, ''));
  const bare = source.match(/\b[a-z0-9-]+\.(?:com|io|ai|cn|org|dev|app|co|net)\b/gi) || [];
  for (const domain of bare) out.add(domain.toLowerCase());
  return out;
}

/**
 * @param {{en:string, zh:string, terms?:string[], field?:string}} params
 * @returns {{ok:boolean, violations:{code:string, detail:string}[], notes:string[]}}
 */
function check({ en, zh, terms = [], field = '' } = {}) {
  const violations = [];
  const notes = [];
  const source = String(en == null ? '' : en);
  const target = String(zh == null ? '' : zh);

  if (!target.trim()) {
    return { ok: false, violations: [{ code: 'empty', detail: '译文为空' }], notes };
  }
  if (target.length > 300) {
    violations.push({ code: 'too_long', detail: `译文 ${target.length} 字 > 300` });
  }
  if (/\bunknown\b/i.test(target)) {
    violations.push({ code: 'unknown_translated', detail: '译文里出现了 unknown 字面量（三态值不该被翻译）' });
  }

  // ① 数字：集合比较，允许月名展开与折扣换算
  const enNumbers = numbersOf(source, { expandMonths: true });
  const zhNumbers = numbersOf(target, { expandMonths: true });
  const allowed = discountConversions(source);
  const missing = [...enNumbers].filter(n => !zhNumbers.has(n));
  const extra = [...zhNumbers].filter(n => !enNumbers.has(n) && !allowed.has(n));
  // `70% off` → `7 折` 是唯一允许"英文数字消失"的情形，而且**必须真的换出了折数**。
  // 早期写法是"英文里有 N% 就豁免 N"，太宽：译文把 70% 整个删掉也照样放行。
  // 评测的篡改测试（m01）正是抓到了这个洞 —— 一条会误判"没丢数字"的守卫，
  // 在真正的数字丢失面前什么都不说。
  const missingFiltered = missing.filter(n => {
    if (!new RegExp(`(^|\\D)${escapeRe(n)}\\s*%`).test(source)) return true; // 不是百分比写法 → 必须保留
    const converted = (100 - Number(n)) / 10;
    return !zhNumbers.has(normalizeNumber(converted)); // 没换出折数 → 仍然要拦
  });
  if (missingFiltered.length) {
    violations.push({ code: 'number_missing', detail: `英文里的数字 ${missingFiltered.join('/')} 在译文里找不到` });
  }
  if (extra.length) {
    violations.push({ code: 'number_invented', detail: `译文里多出了英文没有的数字 ${extra.join('/')}` });
  }

  // ② 币种
  const enCurrency = currenciesOf(source);
  const zhCurrency = currenciesOf(target);
  for (const id of enCurrency) {
    if (!zhCurrency.has(id)) violations.push({ code: 'currency_missing', detail: `英文里的币种 ${id} 在译文里消失了` });
  }
  for (const id of zhCurrency) {
    if (!enCurrency.has(id)) violations.push({ code: 'currency_invented', detail: `译文里多出了英文没有的币种 ${id}` });
  }

  // ③ URL / 域名：必须逐字保留
  for (const url of urlsOf(source)) {
    const needle = url.toLowerCase();
    if (!target.toLowerCase().includes(needle)) {
      violations.push({ code: 'url_changed', detail: `URL/域名「${url}」必须原样保留` });
    }
  }

  // ④ 专有名词（厂商名 / 产品名里的拉丁词）
  for (const term of terms) {
    if (!term || term.length < 3) continue;
    const inEn = new RegExp(`\\b${escapeRe(term)}\\b`, 'i').test(source);
    if (!inEn) continue;
    if (!target.toLowerCase().includes(term.toLowerCase())) {
      violations.push({ code: 'term_missing', detail: `专有名词「${term}」必须原样保留` });
    }
  }

  // ⑤ 否定语气（两个方向都要看，但第二方向刻意只认**强否定词组**）
  if (NEGATION_EN.test(source) && !NEGATION_ZH.test(target)) {
    violations.push({ code: 'negation_lost', detail: '英文里是否定句，译文里没有任何否定词' });
  }
  // 反方向：译文凭空多出一个否定结论。这里**不能**用裸的「不」——中文里「不」太常见
  // （不止、不同、不仅），拿它当判据会把正确译文大批判红，然后这条规则就会被人关掉。
  // 所以只认"无需/不必/未要求"这类**明确的否定性结论**；它们是真结论，不是语气词。
  if (STRONG_NEGATION_ZH.test(target) && !NEGATION_EN.test(source)) {
    violations.push({ code: 'negation_invented', detail: '译文里有「无需 / 不必 / 未要求」这类否定结论，但英文原文里没有任何否定表述' });
  }

  // ⑥ 力度放大：trial → 免费
  if (TRIAL_EN.test(source) && !FREE_EN.test(source) && /免费/.test(target) && !/试用/.test(target)) {
    violations.push({ code: 'trial_as_free', detail: '原文是试用/限时，译文写成了免费' });
  }

  // ⑦ credits → 现金
  if (/\bcredits?\b|额度|积分/i.test(source) && !CASH_WORDS_EN.test(source) && CASH_WORDS_ZH.test(target)) {
    violations.push({ code: 'credits_as_cash', detail: '原文是额度/积分，译文写成了现金或可提现' });
  }

  // ⑧ 未标注截止日 → 长期/永久
  if (!PERMANENT_EN.test(source) && PERMANENT_ZH.test(target)) {
    violations.push({ code: 'permanent_invented', detail: '原文没有长期/永久表述，译文出现了「长期有效/永久」' });
  }

  // ⑨ 上限被抹平
  if (CAP_EN.test(source) && !CAP_ZH.test(target)) {
    violations.push({ code: 'cap_flattened', detail: '原文是上限（up to / maximum），译文里没有「最高/最多/上限」' });
  }

  if (!DATE_EN.test(source) && /\d{4}\s*年/.test(target)) {
    violations.push({ code: 'date_invented', detail: '原文没有日期，译文里出现了年份' });
  }

  return { ok: violations.length === 0, violations, notes };
}

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  check,
  numbersOf,
  currenciesOf,
  urlsOf,
  discountConversions,
  MONTHS,
  NEGATION_EN,
  NEGATION_ZH,
  PERMANENT_ZH
};
