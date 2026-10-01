#!/usr/bin/env node
/**
 * 数据门禁：校验 deals.json 与策展数据。
 * 零外部依赖（不 require axios/cheerio），因此 CI 中无需 npm install 即可运行。
 *
 * 用法：
 *   node scripts/validate.js             # 完整性校验（部署门禁）
 *   node scripts/validate.js --strict    # 额外校验数量指标（内容质量门禁）
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { validateDeal, cleanText, isGarbage, SCHEMA_VERSION, todayCN } = require('./lib/schema');
const { isOngoing } = require('./lib/expiry');
const { CATEGORIES } = require('./lib/categories');
const { auditAudienceFields } = require('./lib/audience-audit');
const provenance = require('./lib/provenance');
// v2.1：Coding Plan 数据模型。**判据只在 lib/plan-schema.js 与 lib/providers.js 里各写一份**，
// 这里只负责把它跑起来、把结论并进同一份 error/warn 账，不重抄任何一条规则。
const planSchema = require('./lib/plan-schema');
const providers = require('./lib/providers');
// v2.4：优惠 ↔ 套餐关系层。判据（引用完整性 / provider 归一 / 状态 / promo 形状）全在
// lib/deal-plan-links.js 一处，这里只把两个数据集与两份历史传进去、把结论并进同一份 error/warn 账。
const dealPlanLinks = require('./lib/deal-plan-links');
const history = require('./lib/history');
const planHistory = require('./lib/plan-history');

const ROOT = path.join(__dirname, '..');
const DEALS_FILE = path.join(ROOT, 'deals.json');
const PLANS_FILE = path.join(ROOT, 'plans.json');
const INDEX_FILE = path.join(ROOT, 'index.html');
const CURATED_FILES = [
  path.join(__dirname, 'data', 'curated_cn.json'),
  path.join(__dirname, 'data', 'curated_global.json')
];

const AGGREGATOR_HOSTS = ['layer3labs.io', 'futuretools.io', 'futurepedia.io', 'aitools.fyi'];

const errors = [];
const warnings = [];

function error(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(file, label) {
  if (!fs.existsSync(file)) {
    error(`${label} 不存在: ${path.relative(ROOT, file)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    error(`${label} JSON 解析失败: ${e.message}`);
    return null;
  }
}

/* ---------------- deals.json ---------------- */

function checkDealsFile() {
  const store = readJson(DEALS_FILE, 'deals.json');
  if (!store) return { deals: [] };

  if (Array.isArray(store)) {
    error('deals.json 仍是 v1 裸数组格式，请运行 `npm run migrate`');
    return { deals: [] };
  }

  if (store.schemaVersion !== SCHEMA_VERSION) {
    error(`deals.json schemaVersion 应为 ${SCHEMA_VERSION}，实际 ${store.schemaVersion}`);
  }
  if (!store.updatedAt || Number.isNaN(Date.parse(store.updatedAt))) {
    error('deals.json updatedAt 缺失或非法');
  }
  if (typeof store.count !== 'number') error('deals.json count 缺失');
  if (!Array.isArray(store.deals)) {
    error('deals.json deals 必须是数组');
    return { deals: [] };
  }
  if (store.count !== store.deals.length) {
    error(`deals.json count(${store.count}) 与 deals 长度(${store.deals.length}) 不一致`);
  }

  const ids = new Set();
  const titleKeys = new Set();
  let dealCount = 0;
  let cnCount = 0;
  let withExpiry = 0;
  let withValidity = 0;
  let verified = 0;

  store.deals.forEach((deal, index) => {
    const result = validateDeal(deal, index);
    if (!result.ok) result.errors.forEach(error);

    if (ids.has(deal.id)) error(`deals.json 重复 id: ${deal.id}（${deal.title}）`);
    ids.add(deal.id);

    const titleKey = cleanText(deal.title, 150).toLowerCase();
    if (titleKeys.has(titleKey)) warn(`可能存在重复标题: ${deal.title}`);
    titleKeys.add(titleKey);

    if (deal.type === 'deal') dealCount++;
    if (deal.region === 'cn') cnCount++;
    if (deal.expiresAt) withExpiry++;
    if (deal.validity) withValidity++;
    if (deal.verified) verified++;

    const host = hostOf(deal.url);
    if (host && AGGREGATOR_HOSTS.some(h => host.endsWith(h))) {
      warn(`落地页仍指向聚合站（建议换官方页 + sourceUrl 署名）: ${deal.title} → ${deal.url}`);
    }
  });

  const stats = {
    total: store.deals.length,
    deals: dealCount,
    cn: cnCount,
    global: store.deals.length - cnCount,
    withExpiry,
    withValidity,
    withTimeInfo: withExpiry + withValidity,
    // 活动期限三分类：与卡片角标、排序档位同一套判据（lib/expiry.js ↔ index.html 的 expiryState）
    ongoing: store.deals.filter(d => !d.expiresAt && isOngoing(d.validity || '')).length,
    noDeadline: store.deals.filter(d => !d.expiresAt && !isOngoing(d.validity || '')).length,
    verified,
    withFeatures: store.deals.filter(d => Array.isArray(d.features) && d.features.length).length,
    withPriceLine: store.deals.filter(d => d.priceLine).length,
    trustedMissingFeatures: store.deals.filter(d => d.verified && !(Array.isArray(d.features) && d.features.length)).length
  };

  checkCoverage(store.deals);
  checkSuspectedDuplicates(store.deals);
  // v1.3：引文的全库预算。逐条上限在 validateDeal 里，这一条看的是**整份数据**：
  // 单条都不超，合起来仍可能悄悄长成一份第三方内容的副本 —— 这正是要防的事。
  const evidenceBudget = checkEvidenceBudget(store.deals);
  // 覆盖率统计要用到原始条目数组（audienceCoverage 自己按 type 分档）
  return { stats: { ...stats, evidenceBudget }, deals: store.deals };
}

/**
 * v1.3 引文预算（每次写盘、每次 CI 都跑）。
 *
 * 两个口径一起用，因为各自都能被绕过：
 *  · 绝对字符上限 —— 谁把上限提高就必须改这一行代码（而不是调一个阈值）；
 *  · 占 deals.json 的比例上限 —— 条数增长时，引文占比不会因为「总量也变大了」而被稀释。
 * 超限是**错误**：这条红线管的是版权风险，不是「好不好看」。
 */
function checkEvidenceBudget(deals) {
  const budget = provenance.budgetOf(deals);
  if (budget.maxLength > provenance.MAX_EVIDENCE_QUOTE_LENGTH) {
    error(`引文超长：最长 ${budget.maxLength} 字 > ${provenance.MAX_EVIDENCE_QUOTE_LENGTH} 字`);
  }
  if (budget.maxPerDeal > provenance.MAX_EVIDENCE_ITEMS) {
    error(`引文条数超限：单条记录最多 ${budget.maxPerDeal} 条 > ${provenance.MAX_EVIDENCE_ITEMS} 条`);
  }
  if (budget.chars > provenance.EVIDENCE_TOTAL_BUDGET_CHARS) {
    error(`引文全库预算超限：${budget.chars} 字 > ${provenance.EVIDENCE_TOTAL_BUDGET_CHARS} 字`);
  }
  let bytes = 0;
  try {
    bytes = fs.statSync(DEALS_FILE).size;
  } catch (err) {
    bytes = 0;
  }
  if (bytes && budget.chars > bytes * provenance.EVIDENCE_BUDGET_RATIO) {
    error(`引文占 deals.json 的比例超限：${budget.chars}/${bytes} 字 > ${provenance.EVIDENCE_BUDGET_RATIO * 100}%`);
  }
  return budget;
}

/** 疑似重复：同一地区下，一条的归一化标题是另一条的前缀（说明别名表漏登记） */
function checkSuspectedDuplicates(deals) {
  const norm = title => String(title || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
  const items = deals.map(deal => ({ key: norm(deal.title), deal })).filter(x => x.key.length >= 4);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.deal.region !== b.deal.region) continue;
      if (a.key === b.key) continue;
      const [short, long] = a.key.length <= b.key.length ? [a, b] : [b, a];
      if (long.key.startsWith(short.key)) {
        warn(`疑似同一优惠未合并：${short.deal.title} ↔ ${long.deal.title}（可在 scripts/data/aliases.json 登记别名）`);
      }
    }
  }
}

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch (e) {
    return null;
  }
}

/** 分类覆盖度：枚举必须都能被命中，否则说明映射表失效 */
function checkCoverage(deals) {
  const used = new Set(deals.map(d => d.category));
  const unused = CATEGORIES.filter(c => !used.has(c));
  if (deals.length > 20 && unused.length > 6) {
    warn(`分类枚举覆盖偏低，未使用: ${unused.join('、')}`);
  }
}

/* ---------------- v1.1 学生 / 开发者模型 ---------------- */

/**
 * 受众字段守卫（只在 --strict 下跑）。
 *
 * 三件事，对应契约 §7.2：
 *  ① **非法枚举 / 类型 / 空容器**必须被 validateDeal 拦下（探针式，不读 deals.json 的运气）；
 *  ② 红线：`unknown` **不得**被渲染成确定答案 —— 断言 `chinaUsableLine()` 对 `chinaUsable:'unknown'`
 *     的输出不含「不可用 / 否」，且含「尚未确认」；
 *  ③ 措辞跨层一致：`index.html` 的 `AUDIENCE:START/END` 块与 `lib/audience.js` 的
 *     `WORDING_CONTRACT` 逐项比对（前端把「尚未确认」改成「待确认」、或后端改掉映射，
 *     两边各自的单元测试都会全绿，只有文本比对能在改动那一刻红）。
 *
 * ⚠️ 这条守卫最初（契约原文）引用的是 `audienceSummary`，而它只拼 `deal.audience`，
 * 对 `{availability:{chinaUsable:'unknown'}}` 返回**空串** —— 照原文写探针**必红**，
 * 且红得莫名其妙（断言说的是措辞，失败原因却是取错了字段）。已改为 `chinaUsableLine`，
 * 并把「取到的是哪个函数」也一并钉住：文档会引错函数名而它自己写不出错。
 * 只读：不动 deals.json，也不做任何写盘。
 */
function checkAudienceGuard() {
  const { makeDeal } = require('./lib/schema');
  const au = require('./lib/audience');

  // ① 探针：编造记录，确认非法形态真的被拦、合法形态真的放行
  const base = makeDeal(
    { title: 'Audience Guard Probe', url: 'https://example.com/audience-guard', discountInfo: 'Save 50% on the annual plan' },
    { source: 'Guard', region: 'global' }
  );
  if (!base) {
    error('受众字段守卫无法构造探针记录（makeDeal 行为已变，请检查 schema.js）');
    return;
  }
  const probe = (patch) => validateDeal({ ...base, ...patch });
  const mustFail = [
    ['非法 audience 枚举', { audience: ['wizard'] }],
    ['非法 benefitType 枚举', { benefitType: ['free_money'] }],
    ['audience 写成标量', { audience: 'student' }],
    ['audience 空数组', { audience: [] }],
    ['audience 重复项', { audience: ['student', 'student'] }],
    ['三态写成 0', { claimRequirements: { creditCardRequired: 0 } }],
    ['三态写成 "true" 字符串', { claimRequirements: { creditCardRequired: 'true' } }],
    ['三态写成 null', { eligibilityDetail: { studentRequired: null } }],
    ['三态映射空对象', { eligibilityDetail: {} }],
    ['三态映射未知键', { claimRequirements: { hasFreeTrial: true } }],
    ['availability.chinaUsable 非法值', { availability: { chinaUsable: 'yes' } }],
    ['availability 未知键', { availability: { chineseUsable: true } }],
    ['provenance 非法 credibility', { audience: ['student'], provenance: { credibility: 'guessed', fields: { audience: { basis: 'source' } } } }],
    ['provenance 指向无值字段', { audience: ['student'], provenance: { credibility: 'curated', fields: { availability: { basis: 'source' } } } }],
    ['provenance 指向只有 unknown 的字段', { claimRequirements: { creditCardRequired: 'unknown' }, provenance: { credibility: 'curated', fields: { claimRequirements: { basis: 'source' } } } }],
    ['provenance inferred 缺 note', { availability: { chinaUsable: false }, provenance: { credibility: 'curated', fields: { availability: { basis: 'inferred' } } } }],
    ['provenance 里的未知键', { audience: ['student'], provenance: { credibility: 'curated', sneaky: 1, fields: { audience: { basis: 'source' } } } }]
  ];
  const leaked = mustFail.filter(([, patch]) => probe(patch).ok).map(([name]) => name);
  if (leaked.length) {
    error(
      `受众字段守卫失效：下列非法形态竟然通过 validateDeal —— ${leaked.join('；')}。` +
      '三态只接受 true / false / "unknown" 三个字面量，空容器与非法枚举一律硬拦（契约 §7.1）。'
    );
  }
  const mustPass = [
    ['旧条目（六字段全缺席）', {}],
    ['student + developer 双 audience', { audience: ['student', 'developer'], benefitType: ['student_plan', 'free_subscription'] }],
    ['三态混合', { eligibilityDetail: { studentRequired: true, educationEmailRequired: 'unknown' }, claimRequirements: { creditCardRequired: false } }],
    ['unknown 明确写出', { availability: { chinaUsable: 'unknown' } }],
    ['合法 provenance', { audience: ['student'], provenance: { credibility: 'curated', sourceUrl: 'https://example.com/a', verifiedAt: '2026-01-01', fields: { audience: { basis: 'source', derived: 'stated' } } } }]
  ];
  const rejected = mustPass.filter(([, patch]) => !probe(patch).ok).map(([name]) => name);
  if (rejected.length) {
    error(`受众字段守卫过严：下列合法形态被误判为非法 —— ${rejected.join('；')}（守卫过严与失效一样是缺陷）`);
  }

  // ② 红线：unknown 不得渲染成确定答案
  const unknownDeal = { availability: { chinaUsable: au.TRISTATE_UNKNOWN } };
  const line = au.chinaUsableLine(unknownDeal);
  if (typeof line !== 'string' || !line.includes('尚未确认')) {
    error(`受众字段红线失守：chinaUsableLine() 对 unknown 返回「${line}」，不含「尚未确认」`);
  }
  if (/不可用|不能用|否/.test(line)) {
    error(`受众字段红线失守：chinaUsableLine() 对 unknown 返回「${line}」，把「没查到」说成了确定答案`);
  }
  if (au.triLabel(au.TRISTATE_UNKNOWN) !== '尚未确认') {
    error(`受众字段红线失守：triLabel(unknown) = 「${au.triLabel(au.TRISTATE_UNKNOWN)}」，应为「尚未确认」`);
  }
  // 反例也要在：确定值必须照直说
  if (au.chinaUsableLine({ availability: { chinaUsable: false } }) !== '中国大陆用户不可用') {
    error('受众字段红线失守：chinaUsableLine() 对 false 不再是「中国大陆用户不可用」（确定值必须照直说）');
  }

  // ③ 措辞跨层一致
  if (fs.existsSync(INDEX_FILE)) {
    const wording = au.checkWordingContract(fs.readFileSync(INDEX_FILE, 'utf8'));
    if (!wording.ok) {
      error(
        `受众字段措辞跨层漂移：${wording.reasons.join('；')}。` +
        'index.html 的 /* AUDIENCE:START */ 块与 lib/audience.js 的 WORDING_CONTRACT 必须逐项一致 —— ' +
        '两侧各有一份实现在所难免（RENDER-CORE 在 vm 沙箱里跑、不能 require），文本比对是唯一的牙。'
      );
    }
  }
}

/**
 * 受众字段覆盖率（信息性，**不是**错误）。
 *
 * 分母口径 = `type==='deal'` 的条目：工具类条目没有「领取条件」，
 * 把它们算进分母会让数字永远上不去且没有意义（契约 §7.3）。
 */
function audienceCoverage(deals) {
  const au = require('./lib/audience');
  const scope = deals.filter(deal => deal.type === 'deal');
  const total = scope.length;
  const rate = count => (total ? `${count}/${total}（${(count / total * 100).toFixed(1)}%）` : `0/${total}`);
  const hasList = (deal, field) => Array.isArray(deal[field]) && deal[field].length > 0;
  const hasKnownTri = (deal, field, keys) => keys.some(key => {
    const value = deal[field] && deal[field][key];
    return value === true || value === false;
  });
  const knownScope = deals.filter(deal => au.hasKnown(deal.audience) || au.hasKnown(deal.benefitType)
    || au.hasKnown(deal.eligibilityDetail) || au.hasKnown(deal.claimRequirements) || au.hasKnown(deal.availability));
  return {
    scope: total,
    student: scope.filter(deal => hasList(deal, 'audience') && deal.audience.includes('student')).length,
    developer: scope.filter(deal => hasList(deal, 'audience') && deal.audience.includes('developer')).length,
    audienceAny: scope.filter(deal => hasList(deal, 'audience')).length,
    benefitType: scope.filter(deal => hasList(deal, 'benefitType')).length,
    creditCard: scope.filter(deal => hasKnownTri(deal, 'claimRequirements', ['creditCardRequired'])).length,
    studentRequired: scope.filter(deal => hasKnownTri(deal, 'eligibilityDetail', ['studentRequired'])).length,
    educationEmail: scope.filter(deal => hasKnownTri(deal, 'eligibilityDetail', ['educationEmailRequired'])).length,
    chinaUsable: scope.filter(deal => deal.availability
      && (deal.availability.chinaUsable === true || deal.availability.chinaUsable === false)).length,
    provenance: scope.filter(deal => deal.provenance && deal.provenance.credibility).length,
    // 「已知值但无 provenance」：这是覆盖率报告里最该被优先补的那一类
    knownWithoutProvenance: knownScope.filter(deal => !(deal.provenance && deal.provenance.credibility)).length,
    known: knownScope.length
  };
}

/* ---------------- 策展数据 ---------------- */

function checkCurated() {
  let total = 0;
  let audienceDropped = 0;
  let evidenceDropped = 0;
  for (const file of CURATED_FILES) {
    if (!fs.existsSync(file)) {
      warn(`策展文件缺失（可选）: ${path.relative(ROOT, file)}`);
      continue;
    }
    const list = readJson(file, path.basename(file));
    if (!Array.isArray(list)) {
      error(`${path.basename(file)} 必须是数组`);
      continue;
    }
    list.forEach((raw, index) => {
      // 策展文件允许"人写的原始字段"，但必须能通过 makeDeal 生成合规记录
      const { makeDeal } = require('./lib/schema');
      const isCN = file.includes('curated_cn');
      const deal = makeDeal(raw, {
        source: raw.source || (isCN ? 'Curated-CN' : 'Curated'),
        region: raw.region || (isCN ? 'cn' : 'global'),
        sourceUrl: raw.sourceUrl
      });
      if (!deal) {
        error(`${path.basename(file)}[${index}] 无法构造合规记录: ${raw.title || '(无标题)'}`);
        return;
      }
      const result = validateDeal(deal, index);
      if (!result.ok) {
        result.errors.forEach(e => error(`${path.basename(file)}: ${e}`));
      }
      if (isCN && deal.region !== 'cn') error(`${path.basename(file)}[${index}] 国内策展数据 region 必须是 cn`);

      // v1.1：手写数据里「声明了却归一后消失」的新字段。**必须是错误而不是警告** ——
      // 这是本阶段最阴的一类错：枚举拼错时那条记录看起来与「本来就没写」一模一样，
      // 页面上少一行而 validateDeal 只看到「字段缺席」，而缺席是合法的（契约 §3）。
      // 校验器看的是归一**之后**的世界，字是在归一**之前**写错的，所以只能在入口对账。
      // 判据与 loadCurated 共用同一个函数（不准各写一份，v1.0 的 ONGOING 教训）。
      const audit = auditAudienceFields(raw, deal);
      audit.dropped.forEach(item => {
        audienceDropped++;
        error(`${path.basename(file)}[${index}] ${deal.title || raw.title || '(无标题)'}: ` +
          `${item.field}${item.key ? '.' + item.key : ''} 写了却没生效 —— ${item.reason}`);
      });
      // v1.3：官方引文「写了却没生效」。与六字段同一条理由，而且这里更该硬拦 ——
      // 引文是**证据**：一条超长/缺出处的引文被静默丢掉，页面上只会显示「未收录片段」，
      // 读者与作者都看不出「我们以为核过的原文其实没进产物」。
      provenance.auditEvidence(raw.evidence, deal.evidence, { today: todayCN() }).forEach(item => {
        evidenceDropped++;
        error(`${path.basename(file)}[${index}] ${deal.title || raw.title || '(无标题)'}: ` +
          `evidence[${item.index}] 写了却没生效 —— ${item.reason}`);
      });
      total++;
    });
  }
  return { curated: total, audienceDropped, evidenceDropped };
}

/* ---------------- v2.1 plans.json（Coding Plan 数据模型） ---------------- */

/**
 * `plans.json` 的数据门禁。
 *
 * 与 deals 的分工刻意保持对称：这里只把 `lib/plan-schema.js` 的判据跑起来，
 * 并把**入口对账**（人工来源层里"写了却没生效"的东西）翻成硬错误 ——
 * 与 `checkCurated()` 同一条理由：校验器看得到的是归一**之后**的世界，
 * 枚举拼错的字只在这里能对上账，而"没写"与"写坏了"在产物里长得一模一样。
 *
 * 只读：不动 plans.json，也不做任何写盘。
 */
function checkPlansFile() {
  const store = readJson(PLANS_FILE, 'plans.json');

  const providerLoad = providers.load();
  if (providerLoad.missing) error('scripts/data/providers.json 不存在（plans 的 provider 必须登记，否则身份会分裂）');
  if (providerLoad.broken) error(`providers.json 无法解析：${providerLoad.broken}`);

  let stats = null;
  if (store) {
    const result = planSchema.validatePlansStore(store, { providerTable: providerLoad.table });
    result.errors.forEach(message => error(message));
    stats = planSchema.summarize(store);
  }

  try {
    const curated = planSchema.loadCuratedPlans({ providerTable: providerLoad.table });
    curated.problems.forEach(item => {
      error(`curated_plans.json[${item.index === null ? '-' : item.index}] ${item.planName || '(无套餐名)'}: ${item.reason}`);
    });
    curated.evidenceDropped.forEach(item => {
      error(`curated_plans.json[${item.index}] ${item.planName}: evidence 写了却没生效 —— ${item.reason}`);
    });
  } catch (e) {
    error(`curated_plans.json 读取失败：${e.message}`);
  }

  return { stats };
}

/**
 * v2.4 优惠 ↔ 套餐关系守卫。
 *
 * 只读：不动任何文件。它问的是三件事：
 *   ① **引用完整性**：每条关系的 dealId / planId 都必须真实存在（指向不存在的 id = 一条死关系）；
 *   ② **provider 一致或明确 override**：套餐侧必须一致；deals 侧的原始厂商串被 providers.json
 *      认不出来时必须写明 `providerOverride`（不做子串匹配，宁要一次显式登记）；
 *   ③ **状态**：`links` 里的优惠已经结束（过期 / 历史层记过 ended / 记录被下架）时，
 *      `--strict` 下报错 —— 要求人把它移进 `retired[]`，而不是让一条「当前优惠」永远挂着。
 */
function checkDealPlanLinks({ strict = false } = {}) {
  const linksLoad = dealPlanLinks.load();
  const relative = path.relative(ROOT, dealPlanLinks.LINKS_FILE);
  if (linksLoad.missing) {
    error(`缺少 ${relative}：优惠与套餐的关系层不存在（它是仓库里的源文件）`);
    return { stats: null };
  }
  if (linksLoad.broken) {
    error(`${relative} 解析失败：${linksLoad.broken}`);
    return { stats: null };
  }

  const dealsDoc = readJson(DEALS_FILE, 'deals.json');
  const plansDoc = readJson(PLANS_FILE, 'plans.json');
  const deals = dealsDoc && Array.isArray(dealsDoc.deals) ? dealsDoc.deals : [];
  const plans = plansDoc && Array.isArray(plansDoc.plans) ? plansDoc.plans : [];
  const providerLoad = providers.load();
  const dealHistoryLoad = history.load();
  const planHistoryLoad = planHistory.load();

  const result = dealPlanLinks.validate(linksLoad.doc, {
    deals,
    plans,
    asOf: dealPlanLinks.asOfOf({
      dealsUpdatedAt: dealsDoc && dealsDoc.updatedAt,
      plansUpdatedAt: plansDoc && plansDoc.updatedAt
    }),
    providerTable: providerLoad.table,
    dealHistoryStore: dealHistoryLoad.missing || dealHistoryLoad.broken ? null : dealHistoryLoad.store,
    planHistoryStore: planHistoryLoad.missing || planHistoryLoad.broken ? null : planHistoryLoad.store,
    strict
  });
  result.errors.forEach(message => error(message));
  result.warnings.forEach(message => warn(message));
  return { stats: result.stats };
}

/**
 * v1.3 信息来源守卫（只在 --strict 下跑）。
 *
 * 三件事：
 *  ① **探针**：非法引文（超长 / 聚合站出处 / 未来日期 / 未知字段 / 空数组）必须被
 *     `validateDeal` 拦下，合法引文必须放行 —— 不读 deals.json 的运气；
 *  ② **来源登记表完整**：每条记录的 `source` 都能在 `provenance.SOURCE_TYPES` 里找到。
 *     没登记的表现不是报错而是页面上显示「来源类型：未知」，静默且成片 —— 所以在这里硬拦；
 *  ③ **红线**：我们的措辞里不许出现本站自发的有效性结论（`STAMP_PATTERNS`），
 *     且三个缺失状态必须各有自己的词（不适用 / 未知 / 不可用），不许合成一句「暂无」。
 *
 * 只读：不动 deals.json，也不做任何写盘。
 */
function checkProvenanceGuard() {
  const { makeDeal } = require('./lib/schema');
  const au = require('./lib/audience');
  const base = makeDeal(
    { title: 'Provenance Guard Probe', url: 'https://example.com/provenance-guard', discountInfo: 'Save 50% on the annual plan' },
    { source: 'aitools.fyi', region: 'global' }
  );
  if (!base) {
    error('信息来源守卫无法构造探针记录（makeDeal 行为已变，请检查 schema.js）');
    return;
  }
  const quote = { field: 'discountInfo', quote: '官方原话：年付五折', sourceUrl: 'https://example.com/provenance-guard', capturedAt: '2026-01-01' };
  const probe = evidence => validateDeal({ ...base, evidence }, 0).ok;

  if (!probe([quote])) error('信息来源守卫：一条合法引文被 validateDeal 拦下了（合法形态必须放行）');
  if (!probe(undefined)) error('信息来源守卫：没有 evidence 的记录被拦下了（缺席必须放行）');

  const mustFail = [
    ['引文超过 200 字', [{ ...quote, quote: 'x'.repeat(provenance.MAX_EVIDENCE_QUOTE_LENGTH + 1) }]],
    ['引文绑定了未知字段', [{ ...quote, field: 'notAField' }]],
    ['引文出处是聚合站', [{ ...quote, sourceUrl: 'https://futuretools.io/tools/x' }]],
    ['引文出处不是 http(s)', [{ ...quote, sourceUrl: 'ftp://example.com/x' }]],
    ['引文采集日期在未来', [{ ...quote, capturedAt: '2099-01-01' }]],
    ['引文采集日期格式非法', [{ ...quote, capturedAt: '2026/01/01' }]],
    ['引文缺 quote', [{ ...quote, quote: '   ' }]],
    ['evidence 是空数组', []],
    ['evidence 不是数组', { ...quote }],
    ['单条记录引文超过 3 条', [quote, { ...quote, field: 'validity' }, { ...quote, field: 'priceLine' }, { ...quote, field: 'eligibility' }]]
  ];
  mustFail.forEach(([name, evidence]) => {
    if (probe(evidence)) error(`信息来源守卫：${name} 竟然通过了 validateDeal`);
  });

  // ② 来源登记表：每条记录的来源都必须能分类（否则整批显示「来源类型：未知」）
  const deals = readJson(DEALS_FILE, 'deals.json');
  if (Array.isArray(deals)) {
    const unregistered = [...new Set(deals.map(deal => deal && deal.source).filter(Boolean))]
      .filter(source => !provenance.SOURCE_TYPES[source]);
    if (unregistered.length) {
      error(`信息来源守卫：这些来源没在 provenance.SOURCE_TYPES 里登记 —— ${unregistered.join('、')}` +
        '（没登记时页面上成片显示「来源类型：未知」，而且是静默的）');
    }
    // 引文里出现聚合站出处是硬错误，一条也不许有（validateDeal 已逐条拦，这里对存量再对一次账）
    deals.forEach(deal => {
      (Array.isArray(deal.evidence) ? deal.evidence : []).forEach((item, i) => {
        if (item && provenance.isAggregatorUrl(item.sourceUrl)) {
          error(`信息来源守卫：${deal.title} 的 evidence[${i}] 出处指向聚合站（${provenance.hostOf(item.sourceUrl)}）`);
        }
      });
    });
  }

  // ③ 红线：措辞里不许有本站自发的有效性结论；三个缺失状态必须各有词
  const wording = au.WORDING_CONTRACT;
  const own = Object.keys(wording)
    .filter(group => group.startsWith('SOURCE_'))
    .flatMap(group => Object.values(wording[group] || {}))
    .map(String);
  if (!own.length) error('信息来源守卫：措辞契约里没有任何 SOURCE_ 组（信息来源块的措辞没有约束）');
  provenance.STAMP_PATTERNS.forEach(stamp => {
    const hit = own.filter(text => stamp.re.test(text));
    if (hit.length) error(`信息来源守卫：措辞里出现本站自发的有效性结论（${stamp.why}）—— ${hit.slice(0, 2).join(' / ')}`);
  });
  for (const key of ['na', 'unknown', 'unavailable']) {
    const text = wording.SOURCE_STATE && wording.SOURCE_STATE[key];
    if (!text) error(`信息来源守卫：缺失状态 ${key} 没有措辞（三种事实必须各有各的说法）`);
  }
  const texts = ['na', 'unknown', 'unavailable'].map(key => (wording.SOURCE_STATE || {})[key]);
  if (new Set(texts).size !== texts.length) {
    error(`信息来源守卫：三个缺失状态的措辞有重复（${JSON.stringify(texts)}）——「不适用 / 未知 / 不可用」是三种不同的事实`);
  }
}

/* ---------------- 门禁自身的守卫 ---------------- */

/**
 * 活动期限守卫（只在 --strict 下跑）。
 *
 * 「长期活动」的判据是**正向线索 且 没有否定线索**两层。2026-09-28 实测：旧实现只有正向
 * 子串匹配，于是 11 条自己写着「官方未标注截止日期」的条目被判成「官方写明长期有效」，
 * 线上 80 个详情页里有 21 页带着那句伪造的溯源（「长期活动（官方有效期说明里写明长期有效）」）。
 * 光加样例不够——样例表只覆盖你想到的写法；这里再钉一颗钉子：**用探针直接验证两层判据都在**。
 * 谁哪天为了「让检查通过」把否定层删掉/注释掉，CI 的 strict 步骤立刻变红，而不是等页面开始撒谎。
 * 只读：不动 deals.json，也不做任何写盘。
 */
function checkOngoingGuard() {
  const cases = [
    { text: '长期有效', want: true, why: '官方明确长期' },
    { text: '常年有效', want: true, why: '官方明确常年' },
    { text: 'No expiration', want: true, why: '英文「无到期」' },
    { text: '官方未标注截止日期', want: false, why: '官方没写截止日' },
    { text: '未标截止日期，以官方为准', want: false, why: '官方没写 + 以官方为准' },
    { text: '以官方页面为准', want: false, why: '让我们以官方页为准' },
    { text: '长期有效（官方模型列表未标注截止日期）', want: false, why: '自相矛盾：正向前缀 + 否定后缀' },
    { text: '额度不过期', want: false, why: '某个权益永久 ≠ 活动长期' },
    { text: '永久五折', want: false, why: '折扣永久 ≠ 活动长期' }
  ];
  const broken = cases.filter(c => isOngoing(c.text) !== c.want)
    .map(c => `${c.why}：「${c.text}」期望 ${c.want ? '长期' : '未标注'}，实得 ${isOngoing(c.text) ? '长期' : '未标注'}`);
  if (broken.length) {
    error(
      `活动期限判据守卫失效：下列样例判错 —— ${broken.join('；')}。` +
      '「官方写明长期」必须是「正向线索 且 没有否定线索（未标注截止日期 / 以官方…为准）」，' +
      '且「某个权益永久」（额度不过期 / 永久五折）不等于「整个活动长期」——' +
      '判据在 scripts/lib/classify.js 的 ONGOING_POSITIVE_RE / ONGOING_HEDGE_RE（与 index.html 的 ONGOING:START 块同源）。'
    );
  }
}

/**
 * 数据诚信守卫（只在 --strict 下跑，不影响普通校验的输出）。
 *
 * 「verified=true 但没有 verifiedAt」是一条**看得见却抓不到**的假声明：
 * validateDeal 原本只拦反向（未核验却带日期），而 store.mergeAll 曾给策展条目凭空写
 * verified: true —— 于是「✓ 数据更新 <机器日期>（已人工对照官方页）」会照发，
 * 校验器却一路绿灯。现在 schema.js 补了反向断言，这里再钉一颗钉子：
 * 用一条**内存里编造**的记录反复确认那条断言真的在拦人 —— 谁哪天把它删了，
 * CI 的 strict 步骤立刻变红，而不是等到页面开始撒谎。
 * 只读：不动 deals.json，也不做任何写盘。
 */
function checkVerifiedGuard() {
  const { makeDeal, validateDeal } = require('./lib/schema');
  const sample = makeDeal(
    {
      title: 'Verified Guard Probe',
      url: 'https://example.com/verified-guard-probe',
      discountInfo: 'Save 50% on the annual plan',
      type: 'deal'
    },
    { source: 'Guard', region: 'global', trustType: true }
  );
  if (!sample) {
    error('数据诚信守卫无法构造探针记录（makeDeal 行为已变，请检查 schema.js）');
    return;
  }

  const cases = [
    { name: 'verified=true 且 verifiedAt=null', deal: { ...sample, verified: true, verifiedAt: null } },
    { name: 'verified=true 且无 verifiedAt 字段', deal: { ...sample, verified: true } },
    { name: 'verified 非 true 却带 verifiedAt', deal: { ...sample, verified: false, verifiedAt: '2026-01-01' } }
  ];
  const leaked = cases.filter(c => validateDeal(c.deal).ok).map(c => c.name);
  if (leaked.length) {
    error(
      `数据诚信守卫失效：下列假声明竟然通过 validateDeal —— ${leaked.join('；')}。` +
      '「已核验」必须始终带人工回访官方页的日期（schema.js 的 verified/verifiedAt 断言）。'
    );
  }

  // 正例也要在：别把守卫写成"一律拒绝 verified"，否则真正的核验标注会被误伤
  if (!validateDeal({ ...sample, verified: true, verifiedAt: '2026-01-01' }).ok) {
    error('数据诚信守卫过严：带 verifiedAt 的核验条目被误判为非法');
  }
}

/* ---------------- 前端 ---------------- */

function checkIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    error('index.html 不存在');
    return;
  }
  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  if (!/deals\.json/.test(html)) error('index.html 未引用 deals.json');
  if (!/payload\.deals/.test(html) && !/schemaVersion/.test(html)) {
    warn('index.html 似乎没有按 v2 结构（payload.deals）读取数据');
  }

  // 预渲染标记：删掉它们会让 SEO 静态骨架静默失效（构建期才会报错），这里提前告警
  // （v1.2 的 needs 与 v1.5 的 changes 一并列进来：漏一个的表现是「那一块整块消失」）
  for (const marker of [
    '<!--PRERENDER:deals-->', '<!--PRERENDER:facets-->', '<!--PRERENDER:topstat-->',
    '<!--PRERENDER:stats-->', '<!--PRERENDER:categories-->', '<!--PRERENDER:needs-->',
    '<!--PRERENDER:changes-->', '<!--PRERENDER:jsonld-->'
  ]) {
    if (!html.includes(marker)) {
      warn(`index.html 缺少预渲染标记 ${marker}（会让构建期静态骨架失效）`);
    }
  }
  if (!/RENDER-CORE:START/.test(html) || !/RENDER-CORE:END/.test(html)) {
    warn('index.html 缺少 RENDER-CORE 标记区块（构建期无法抽取渲染核心）');
  }
  if (!/logos\.css/.test(html)) {
    warn('index.html 未引用 logos.css（厂商 logo 不会显示）');
  }
  if (!/__SITE_URL__/.test(html) && !/rel="canonical"/.test(html)) {
    warn('index.html 缺少 canonical 或 __SITE_URL__ 占位');
  }

  // 内联脚本语法校验（能抓出拼写/括号类低级错误）
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  if (!scripts.length) {
    warn('index.html 未找到内联脚本');
    return;
  }
  for (const [index, source] of scripts.entries()) {
    try {
      new vm.Script(source, { filename: `index.html#script[${index}]` });
    } catch (e) {
      error(`index.html 内联脚本第 ${index + 1} 段语法错误: ${e.message}`);
    }
  }

  if (!/rel="canonical"|og:title/.test(html)) warn('index.html 缺少 SEO meta（og:title 等）');
}

/* ---------------- 主流程 ---------------- */

function main() {
  const strict = process.argv.includes('--strict');
  const { stats, deals } = checkDealsFile();
  const curatedStats = checkCurated();
  const { stats: planStats } = checkPlansFile();
  const { stats: dealLinkStats } = checkDealPlanLinks({ strict });
  checkIndex();
  if (strict) checkVerifiedGuard();
  if (strict) checkOngoingGuard();
  if (strict) checkAudienceGuard();
  if (strict) checkProvenanceGuard();

  console.log('=== 数据校验 ===');
  if (stats) {
    console.log(`总条数        : ${stats.total}`);
    console.log(`真实优惠      : ${stats.deals}`);
    console.log(`国内 / 国外   : ${stats.cn} / ${stats.global}`);
    console.log(`含截止时间    : ${stats.withExpiry}`);
    console.log(`含有效期说明  : ${stats.withValidity}（合计时间信息 ${stats.withTimeInfo}）`);
    console.log(`活动期限      : 有截止日期 ${stats.withExpiry} · 未标注截止日期 ${stats.noDeadline} · 长期活动 ${stats.ongoing}`);
    console.log(`人工核验      : ${stats.verified}`);
    console.log(`卡片特性标签  : ${stats.withFeatures} 条`);
    console.log(`价格阶梯      : ${stats.withPriceLine} 条`);
  }
  console.log(`策展数据      : ${curatedStats.curated} 条`);
  // v2.1：套餐（plans）与优惠（deals）是两套数据，统计也分开打印，避免把两者读成一份。
  if (planStats) {
    const quotaMix = Object.entries(planStats.byQuotaType).map(([type, n]) => `${type} ${n}`).join(' · ');
    const reasons = Object.entries(planStats.notComputableByQuotaType).map(([type, n]) => `${type} ${n}`).join(' · ');
    console.log(`套餐（plans） : ${planStats.total} 条 · ${planStats.providers} 个平台 · 国内 ${planStats.cn} / 国外 ${planStats.global}`);
    console.log(`  价格        : 有活动价 ${planStats.withPromo} 条 · 原价留空(null) ${planStats.priceUnknown} 条`);
    console.log(`  额度类型    : ${quotaMix}`);
    console.log(`  已知模型/限制: 带 supportedModels ${planStats.withModels} 条 · 带 restrictions ${planStats.withRestrictions} 条`);
    // 「可计算 0 条」也要打印，而且要说清为什么 —— 0 是结论，不是缺省。
    console.log(`  名义 Token 单价: 可计算 ${planStats.computable} 条 · 不可计算 ${planStats.total - planStats.computable} 条` +
      (reasons ? `（按额度类型：${reasons}）` : ''));
    console.log(`  官方引文    : ${planStats.evidenceItems} 条 · updatedAt ${planStats.updatedAt}`);
  }
  // v2.4：关系层。**0 条也打印** —— 「一条都没确认」与「这一层没跑」在日志里必须长得不一样。
  if (dealLinkStats) {
    console.log(`优惠 ↔ 套餐  : ${dealLinkStats.links} 条当前关系 · 历史（retired）${dealLinkStats.retired} 条` +
      ` · 覆盖 ${dealLinkStats.plansWithCurrent}/${dealLinkStats.plans} 条套餐` +
      `（当前 ${dealLinkStats.currentRows} 行 / 历史 ${dealLinkStats.historyRows} 行）` +
      ` · 人工判断 ${dealLinkStats.editorial} 条 · 基准日 ${dealLinkStats.asOf || '未知'}`);
  }
  // 有值时它已经在上面作为**错误**报过并 exit 1 了，所以这行只在 0 的时候看得见 ——
  // 「0 也打印」的意思正是让「没检查」与「检查了、干净」在日志里长得不一样。
  console.log(`受众字段落空  : ${curatedStats.audienceDropped} 处（策展文件里写了却没进记录的新字段）`);
  console.log(`官方引文落空  : ${curatedStats.evidenceDropped} 处（策展文件里写了却没进记录的官方原文片段）`);
  if (stats && stats.evidenceBudget) {
    const b = stats.evidenceBudget;
    // 0 也打印：离上限多远、有没有引文，是两件都要知道的事（0 条时这条线是「制度在位」的证据）
    console.log(`官方引文预算  : ${b.items} 条 / ${b.withEvidence} 条记录 · ${b.chars} 字 ` +
      `（单条上限 ${provenance.MAX_EVIDENCE_QUOTE_LENGTH} 字 · 每条上限 ${provenance.MAX_EVIDENCE_ITEMS} 条 · ` +
      `全库上限 ${provenance.EVIDENCE_TOTAL_BUDGET_CHARS} 字）`);
  }

  // v1.1 受众字段覆盖率：分母 = type==='deal'（工具条目没有「领取条件」）。
  // 覆盖率低是**正确结果** —— 没有证据就留空，编数据才是失败（契约 §7.3）。
  if (stats && Array.isArray(deals)) {
    const cov = audienceCoverage(deals);
    const r = count => `${count}/${cov.scope}（${cov.scope ? (count / cov.scope * 100).toFixed(1) : '0.0'}%）`;
    console.log('受众字段      : 分母 = type=deal 的条目');
    console.log(`  适用人群    : 学生 ${r(cov.student)} · 开发者 ${r(cov.developer)} · 任一 ${r(cov.audienceAny)}`);
    console.log(`  福利类型    : ${r(cov.benefitType)}`);
    console.log(`  需要信用卡  : 已知 ${r(cov.creditCard)}`);
    console.log(`  需要学生认证: 已知 ${r(cov.studentRequired)} · 需要教育邮箱 已知 ${r(cov.educationEmail)}`);
    console.log(`  中国可用性  : 已知 ${r(cov.chinaUsable)}`);
    console.log(`  出处声明    : ${r(cov.provenance)} · 有已知值但无出处 ${cov.knownWithoutProvenance} 条 / 有已知值 ${cov.known} 条`);
  }

  // 覆盖率提示：人工核验过却还没有特性标签的条目，是最值得优先补齐的（卡片会退化成纯文字块）
  if (stats && stats.trustedMissingFeatures > 0) {
    warn(`有 ${stats.trustedMissingFeatures} 条已核验条目缺少 features 标签，卡片将退化为纯 discountInfo 展示`);
  }

  if (strict && stats) {
    if (stats.deals < 40) error(`[strict] 真实优惠 ${stats.deals} 条 < 40`);
    if (stats.cn < 20) error(`[strict] 国内条目 ${stats.cn} 条 < 20`);
    // 总条数门槛刻意设为 100 而非更高的数字：注册表里只有 7 个实测有产出的来源，
    // 再往上只能靠堆目录站的"工具介绍"条目凑数，那正是本项目要修掉的问题。
    if (stats.total < 100) error(`[strict] 总条数 ${stats.total} < 100`);
    if (stats.withTimeInfo < stats.deals * 0.6) {
      error(`[strict] 带时间信息（截止日期或有效期说明）的优惠 ${stats.withTimeInfo} 条 < 60% 的 ${stats.deals} 条`);
    }
    // v2.1：plans 的下限。刻意只卡"小而可靠"的 5 条 —— 这一层宁可少收也不靠凑数，
    // 但少于 5 条就没有比较价值（题面 §十三）。上限不在这里卡：MAX_PLANS 是结构上限，
    // 而"别一次采几十个平台"是人的判断，不该写成一条会误伤的门禁。
    if (planStats && planStats.total < 5) error(`[strict] plans 条数 ${planStats.total} < 5`);
  }

  if (warnings.length) {
    console.log(`\n⚠️  警告 ${warnings.length} 条：`);
    warnings.slice(0, 30).forEach(w => console.log(`  - ${w}`));
    if (warnings.length > 30) console.log(`  ...（其余 ${warnings.length - 30} 条省略）`);
  }

  if (errors.length) {
    console.error(`\n❌ 校验失败，共 ${errors.length} 项：`);
    errors.slice(0, 40).forEach(e => console.error(`  - ${e}`));
    if (errors.length > 40) console.error(`  ...（其余 ${errors.length - 40} 项省略）`);
    process.exit(1);
  }

  console.log(`\n✅ 校验通过${strict ? '（strict 模式）' : ''}`);
}

main();
