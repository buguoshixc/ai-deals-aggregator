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
const { validateDeal, cleanText, isGarbage, SCHEMA_VERSION } = require('./lib/schema');
const { isOngoing } = require('./lib/expiry');
const { CATEGORIES } = require('./lib/categories');
const { auditAudienceFields } = require('./lib/audience-audit');

const ROOT = path.join(__dirname, '..');
const DEALS_FILE = path.join(ROOT, 'deals.json');
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
  // 覆盖率统计要用到原始条目数组（audienceCoverage 自己按 type 分档）
  return { stats, deals: store.deals };
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
      total++;
    });
  }
  return { curated: total, audienceDropped };
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
  for (const marker of [
    '<!--PRERENDER:deals-->', '<!--PRERENDER:facets-->', '<!--PRERENDER:topstat-->',
    '<!--PRERENDER:stats-->', '<!--PRERENDER:categories-->', '<!--PRERENDER:jsonld-->'
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
  checkIndex();
  if (strict) checkVerifiedGuard();
  if (strict) checkOngoingGuard();
  if (strict) checkAudienceGuard();

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
  // 有值时它已经在上面作为**错误**报过并 exit 1 了，所以这行只在 0 的时候看得见 ——
  // 「0 也打印」的意思正是让「没检查」与「检查了、干净」在日志里长得不一样。
  console.log(`受众字段落空  : ${curatedStats.audienceDropped} 处（策展文件里写了却没进记录的新字段）`);

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
