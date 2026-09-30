/**
 * 学生 / 开发者数据模型的**唯一词表**（v1.1）。
 *
 * 这个文件存在的理由只有一个：**同一套枚举与措辞绝不允许有两份实现**。
 * v1.0 最贵的一课是「判据、数据、测试三层里任何一层单独修好都不够」——
 * 「长期活动」的判据当年在 scripts/lib/classify.js 与 index.html 里各有一份，
 * 改一边不改另一边，于是线上 21 个详情页同时印着「官方未标注截止日期」与
 * 「官方写明长期有效」两句互相拆台的话。新字段的枚举面更大（6 个字段、20 个枚举值、
 * 三态映射），再分叉一次就没人能说清页面上那句话是谁说的。
 *
 * 所以：
 *   · `schema.js`（写入 / 校验）从这里取枚举与 normalize；
 *   · `validate.js --strict` 的探针从这里取「措辞生成器」本身，不抄一份副本；
 *   · `index.html` 的 RENDER-CORE 在 vm 沙箱里跑、**不能 require**，所以它的那份是
 *     标记块 `AUDIENCE:START/END` 里的副本，由 `selftest:audience` 做**文本级**逐字节
 *     比对（照 ONGOING 的先例）。副本是没办法的办法，比对是它的牙。
 *
 * 三态语义（本阶段的立身之本）：
 *   true        —— 来源**明说**「是」
 *   false       —— 来源**明说**「不是」
 *   "unknown"   —— 我们**没有证据**（默认值；绝大多数条目的诚实取值）
 *
 * 「页面没写不需要信用卡」不等于「不需要信用卡」。没有证据就是 unknown。
 */

/* ------------------------------------------------------------------ */
/* 枚举                                                                */
/* ------------------------------------------------------------------ */

/** 适用人群。允许一条同时属于多个人群（student + developer 是常见组合） */
const AUDIENCES = ['student', 'developer', 'educator', 'education', 'general', 'other'];

/** 福利类型。同样是数组：一条优惠常常同时是「免费额度」与「免费 API」 */
const BENEFIT_TYPES = [
  'free_subscription', 'free_credits', 'free_api', 'free_model',
  'discount', 'trial', 'student_plan', 'developer_credit', 'other'
];

/** 资格门槛：键 → 中文标签 */
const ELIGIBILITY_KEYS = [
  'studentRequired',
  'educationEmailRequired',
  'identityVerificationRequired',
  'newUserOnly'
];

/** 领取要求：键 → 中文标签 */
const CLAIM_KEYS = [
  'creditCardRequired',
  'manualApplication',
  'accountRequired'
];

/** 三态的字面量。刻意是**字符串**而不是 null：null 与「字段没写」在 JSON 里长得一样，
 *  三态会在一次序列化往返后消失，而这两件事在页面上后果相反。 */
const TRISTATE_UNKNOWN = 'unknown';
const TRISTATE_VALUES = [true, false, TRISTATE_UNKNOWN];

/** 地区限制摘录的长度上限（与 regionRestriction 校验上限同一处出处） */
const MAX_REGION_RESTRICTION_LENGTH = 120;

/** provenance 的可信度次序（高 → 低）。merge 仲裁与覆盖率报告都读这一张表 */
const CREDIBILITIES = ['editorial', 'curated', 'collected'];

/** 断言依据 */
const BASIS_VALUES = ['source', 'documented', 'inferred'];

/** 派生方式 */
const DERIVED_VALUES = ['stated', 'inferred'];

/** 逐字段标签：详情页的字段名与取值说明都从这里出，渲染层不再各写一份中文 */
const FIELD_LABELS = {
  audience: '适用人群',
  benefitType: '福利类型',
  eligibilityDetail: '资格门槛',
  claimRequirements: '领取条件',
  availability: '中国大陆可用情况',
  chinaUsable: '中国大陆可用性'
};

const AUDIENCE_LABELS = {
  student: '学生',
  developer: '开发者',
  educator: '教师 / 教研人员',
  education: '教育机构',
  general: '所有用户',
  other: '其他人群'
};

const BENEFIT_LABELS = {
  free_subscription: '免费订阅',
  free_credits: '免费额度',
  free_api: '免费 API',
  free_model: '免费模型',
  discount: '折扣优惠',
  trial: '免费试用',
  student_plan: '学生专属计划',
  developer_credit: '开发者赠送额度',
  other: '其他'
};

const ELIGIBILITY_LABELS = {
  studentRequired: '需要学生身份',
  educationEmailRequired: '需要教育邮箱',
  identityVerificationRequired: '需要实名 / 身份认证',
  newUserOnly: '仅限新用户'
};

const CLAIM_LABELS = {
  creditCardRequired: '需要信用卡',
  manualApplication: '需要人工申请 / 审核',
  accountRequired: '需要注册账号'
};

/**
 * 三态 → 中文措辞。**只有这一处实现**，页面与探针都读它。
 *
 * `unknown` 的措辞是「尚未确认」而不是「否」/「不可用」：
 * 前者是「我们没查到」，后者是对读者的断言。把前者写成后者，读者会据此放弃一条
 * 其实可以领的优惠 —— 这正是本阶段要根除的那类错误。
 */
function triLabel(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  return '尚未确认';
}

/** 逐字段自然措辞（「需要信用卡：是」读起来别扭，读作「需要信用卡」/「不需要信用卡」） */
const NEGATED_CLAIM_KEYS = ['creditCardRequired', 'studentRequired', 'educationEmailRequired', 'identityVerificationRequired', 'newUserOnly', 'manualApplication', 'accountRequired'];

function claimLabel(key, value) {
  const base = CLAIM_LABELS[key] || ELIGIBILITY_LABELS[key] || key;
  if (value === true) return base;
  if (value === false) {
    // 「需要信用卡」→「不需要信用卡」；「仅限新用户」→「不限新用户」
    return base.replace(/^需要/, '不需要').replace(/^仅限/, '不限');
  }
  return base + '：尚未确认';
}

/* ------------------------------------------------------------------ */
/* 归一：只清洗，不外推                                                */
/* ------------------------------------------------------------------ */

/** 三态归一：只认 true / false / 'unknown'；其余（含 null/undefined/0/1/'true'）一律 null = 没写 */
function normalizeTristate(value) {
  if (value === true || value === false) return value;
  if (value === TRISTATE_UNKNOWN) return TRISTATE_UNKNOWN;
  return null;
}

/** 枚举数组归一：去非法、去重、保序；空结果返回 null（空数组非法） */
function normalizeEnumList(value, allowed) {
  if (!Array.isArray(value)) return null;
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const text = item.trim();
    if (!allowed.includes(text)) continue;
    if (!out.includes(text)) out.push(text);
  }
  return out.length ? out : null;
}

/** 三态映射归一：逐键取三态；整组无有效键则返回 null（空对象非法） */
function normalizeTristateMap(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  for (const key of keys) {
    const tri = normalizeTristate(value[key]);
    if (tri !== null) out[key] = tri;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * availability 归一。这是唯一一个**混合形状**的字段：一个三态 + 一段地区限制原文摘要。
 * 两者都缺 ⇒ 整体不写（渲染层因此只需判断「有没有这一组」）。
 *
 * `regionRestriction` 在这里就**按上限截断**（不是留给 validate 报错）：采集期拾到一句
 * 超长条款时，若构造期不截断、validate 又硬拦，当天的整批数据会因为一个次要字段写不下盘
 * —— 「一条摘录太长」不该阻断发布。截断规则与 cleanText 一致（补 `…`，返回值不越上限）。
 * 手写数据里超长仍然会被 validate 拦下（那里应该由人写短句，不是机器替他截）。
 */
function normalizeAvailability(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out = {};
  const china = normalizeTristate(value.chinaUsable);
  if (china !== null) out.chinaUsable = china;
  const raw = typeof value.regionRestriction === 'string' ? value.regionRestriction.trim() : '';
  if (raw) out.regionRestriction = truncate(raw, MAX_REGION_RESTRICTION_LENGTH);
  return Object.keys(out).length ? out : null;
}

/** 上限内的摘录；超长时切在词/字边界并补 `…`，返回值**绝不越上限** */
function truncate(text, max) {
  const chars = Array.from(text);
  if (!Number.isFinite(max) || chars.length <= max) return text;
  const room = Math.max(1, max - 1);
  let body = chars.slice(0, room).join('').trim();
  if (/[A-Za-z]$/.test(body) && /^[A-Za-z]/.test(chars[room] || '')) {
    const space = body.lastIndexOf(' ');
    if (space >= Math.floor(room * 0.6)) body = body.slice(0, space);
  }
  return body ? body + '…' : body;
}

/* ------------------------------------------------------------------ */
/* 已知值 / 摘要                                                       */
/* ------------------------------------------------------------------ */

/** 该字段组里有没有**明确数据**（不是 unknown、不是空容器）—— 渲染层据此决定整组显不显示 */
function hasKnown(value) {
  if (value === null || value === undefined) return false;
  // 三态的两个**已知**取值先判掉。踩过的坑：最后那行 `Boolean(value)` 会把
  // `false`（= 来源明说「不是」）判成「没有数据」，于是
  // `{ chinaUsable: false }` 整组被当成空 —— 一条明确写着「中国大陆不可用」的记录
  // 会在详情页上什么都不显示，而「不可用」恰恰是最需要说出来的那一种取值。
  if (value === true) return true;
  if (value === false) return true;
  if (value === TRISTATE_UNKNOWN) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    return Object.keys(value).some(key => hasKnown(value[key]));
  }
  return Boolean(value);
}

/** 三态映射里已知（非 unknown）的键 */
function knownKeys(map) {
  if (!map || typeof map !== 'object') return [];
  return Object.keys(map).filter(key => map[key] === true || map[key] === false);
}

/**
 * 适用人群摘要（卡片 / 详情页 / 报告共用）。
 * 没有任何明确人群时返回 `''` —— **不返回「所有用户」**：那是 `general` 的含义，
 * 而 `general` 必须是来源自己说的。
 */
function audienceSummary(deal) {
  const list = deal && Array.isArray(deal.audience) ? deal.audience : [];
  return list.map(key => AUDIENCE_LABELS[key] || key).join(' / ');
}

/** 福利类型摘要 */
function benefitSummary(deal) {
  const list = deal && Array.isArray(deal.benefitType) ? deal.benefitType : [];
  return list.map(key => BENEFIT_LABELS[key] || key).join(' / ');
}

/* ------------------------------------------------------------------ */
/* 分类归属：这条优惠「是不是给学生的 / 给开发者的」                     */
/* ------------------------------------------------------------------ */

/**
 * ⚠️ 这里有一个**刻意与覆盖率口径不同**的地方，而且今天看不出来 —— 正因为看不出来才写下来。
 *
 * 两个问题长得像，问的不是一件事：
 *   · 覆盖率（`audience-report.js`）问「我们**有没有**关于学生适用性的信息」。
 *     所以 `studentRequired:false`（= 来源明说「不要求学生身份」）**算有信息**，
 *     它确实回答了我们关心的那个问题，只是答案是「否」。
 *   · 分类页 / 筛选器问「这条优惠**是不是**给学生的」。
 *     此时 `false` 是一个**否定**信号，把条目收进 /student/ 就是错的。
 *
 * 实测（2026-09-29）：两种口径今天都得到 12 —— 因为数据里 `studentRequired` 只有
 * `true`（3 条）与缺席（77 条），**一条 `false` 都没有**，差异不可见。
 * 等第一条 `false` 出现时，覆盖率会 +1 而分类页不该 +1。两个数字分头变化的那天，
 * 没有人会想起来这里本来有个分歧 —— 除非这条注释当时就写下了。
 */
function studentSignal(deal) {
  const audienceList = deal && Array.isArray(deal.audience) ? deal.audience : [];
  const benefitList = deal && Array.isArray(deal.benefitType) ? deal.benefitType : [];
  const studentRequired = deal && deal.eligibilityDetail ? deal.eligibilityDetail.studentRequired : undefined;
  const byAudience = audienceList.includes('student');
  const byEligibility = studentRequired === true;      // 只认 true（见上）
  const byBenefit = benefitList.includes('student_plan');
  return {
    byAudience,
    byEligibility,
    byBenefit,
    // 覆盖率口径：`false` 也算「有信息」
    hasInformation: byAudience || studentRequired === true || studentRequired === false || byBenefit,
    // 分类页口径：只认肯定信号
    applies: byAudience || byEligibility || byBenefit
  };
}

/** 开发者同理（`developer_credit` 是福利类型侧的信号，没有对应的三态门槛字段） */
function developerSignal(deal) {
  const audienceList = deal && Array.isArray(deal.audience) ? deal.audience : [];
  const benefitList = deal && Array.isArray(deal.benefitType) ? deal.benefitType : [];
  const byAudience = audienceList.includes('developer');
  const byBenefit = benefitList.includes('developer_credit');
  return { byAudience, byBenefit, hasInformation: byAudience || byBenefit, applies: byAudience || byBenefit };
}

/** 免费 API / 免费额度里可调用的那一类（福利类型侧） */
function freeApiSignal(deal) {
  const benefitList = deal && Array.isArray(deal.benefitType) ? deal.benefitType : [];
  const byBenefit = benefitList.includes('free_api');
  return { byBenefit, hasInformation: byBenefit, applies: byBenefit };
}

const isStudentDeal = deal => studentSignal(deal).applies;
const isDeveloperDeal = deal => developerSignal(deal).applies;
const isFreeApiDeal = deal => freeApiSignal(deal).applies;

/**
 * 三个分类页的**唯一注册表**（路由、标题、判据、以及「为什么有这一页」）。
 *
 * 为什么做成一张表而不是三份 if：站点有一条现成的 `/status/` 先例，但它只满足
 * 「预渲染 + 无 JS 可读」两条约定，sitemap / feed / JSON-LD 三条**当时根本没做**
 * （子代理核查结论）。三条路由各写一遍，就等于把「哪一条忘了进 sitemap」变成一个
 * 靠记性维持的不变量。一张表 + 一个生成循环，漏一条是结构上不可能的。
 *
 * ⚠️ `why` 是**直接写进 HTML 的**（`build-local.js` 用 `${why}` 插进 `<p class="snote">`），
 * 所以这里写的是 HTML，不是 Markdown。第一版把强调写成了 `**这样**`、把字段名写成了
 * `` `这样` `` —— 它们**原样出现在读者眼前**（独立验证代理在 4 类页面上数出 16 个 `**`
 * 与 14 个反引号）。要强调就用 `<b>`，要写字面量就直接写。
 * 这条现在有守卫：`build-local.js` 会扫描全部产物的 `.snote` / `<caption>` 正文，
 * 出现字面 `**` 或反引号即构建失败。
 */
const COLLECTION_PAGES = [
  {
    slug: 'student',
    title: '学生优惠',
    heading: '面向学生的 AI 优惠',
    predicate: 'student',
    description: '面向学生的 AI 优惠与免费额度：需要学生身份或教育邮箱的订阅、学生套餐与教育折扣，逐条标注门槛与是否中国大陆可用。',
    why: [
      '这一页收的是<b>来源明确说面向学生</b>的优惠：audience 写了 student，或 eligibilityDetail.studentRequired 为「是」，或福利类型是学生套餐。',
      '<b>「没写」不等于「不适用」</b>：来源页面上没有提学生身份的条目不会被收进来，它只说明我们没查到，不说明学生不能用。',
      '门槛（学生身份 / 教育邮箱 / 实名认证）与「中国大陆可用性」逐条列出；没有依据的一律显示「尚未确认」，不写成「不可用」。'
    ]
  },
  {
    slug: 'developer',
    title: '开发者优惠',
    heading: '面向开发者的 AI 优惠',
    predicate: 'developer',
    description: '面向开发者与程序员的 AI 优惠：免费 API 额度、开发者赠金、模型调用免费额度，逐条标注领取要求与是否中国大陆可用。',
    why: [
      '这一页收的是 audience 写了 developer，或福利类型是开发者赠金的条目。',
      '国内大模型平台的「新用户免费额度」多属此类：需要注册与实名认证，额度按 Token 计量并有过期时间。',
      '同样地，<b>没有写开发者字样的条目不会被收进来</b>，那不代表它不能用于开发。'
    ]
  },
  {
    slug: 'free-api',
    title: '免费 API',
    heading: '可以免费调用的 API',
    predicate: 'freeApi',
    description: '可以免费调用的 AI API：福利类型标注为「免费 API」的条目，含国内大模型平台的新用户免费额度与国外平台的试用额度。',
    why: [
      '这一页按<b>福利类型</b>收：benefitType 含 free_api。与上面两页按人群切不同，它切的是「拿到手是什么」。',
      '同一条优惠可以同时出现在这一页和 /developer/：分类之间不是互斥的，一条优惠本来就常常既是给开发者的、也确实是免费 API。',
      '「免费」的具体形态差异很大（一次性赠送 Token、每月重置、限时试用），以每条卡片上的说明与官方页面为准。'
    ]
  }
];

/** slug → 判据 的唯一映射（页面生成、首页筛选、断言三处共用这一份） */
const COLLECTION_PREDICATES = {
  student: isStudentDeal,
  developer: isDeveloperDeal,
  freeApi: isFreeApiDeal
};

/** 一条记录属于哪几个分类页（顺序与 COLLECTION_PAGES 一致，便于断言） */
function collectionsOf(deal) {
  return COLLECTION_PAGES.filter(page => COLLECTION_PREDICATES[page.predicate](deal)).map(page => page.slug);
}

/* ------------------------------------------------------------------ */
/* 按需求找优惠（v1.2）：意图 → 判据 的唯一注册表                       */
/* ------------------------------------------------------------------ */

/**
 * 「学生 / 开发者」回答的是「我是谁」；这一层回答的是「我要什么」。
 *
 * ## 为什么是独立一层，而不是往首页筛选条里再加几个 chip
 *
 * 首页的筛选条已经是横向滚动的一行（收藏 + Tab + 地区 + 分类 + 厂商），窄屏上再加十枚
 * chip，等于把「入口清晰」这件事交给用户横滑去发现。更要紧的是**无 JS**：首页是一个
 * 构建期写死的静态文件，`?need=xxx` 这种 query **改不了服务端返回的 HTML** ——
 * 无 JS 的访客点进去，看到的仍然是全量卡片，也就是「点了没反应」。入口页各生成一个
 * 静态 URL（`/need/<slug>/`）是纯静态站上唯一能同时满足「可分享」与「无 JS 可读」的形状。
 *
 * ## 判据的纪律（与本文件其它部分同一条）
 *
 *  ① **只用 v1.1 已有的字段**，不新造词表、不做文本推断。唯一的例外是 `ai-coding`，
 *     下面单独写了它为什么只能按 `category` 收、以及这个口径的缺口。
 *  ② **只认肯定信号**：`false` 是已知值（例如「不需要信用卡」），`unknown` 与缺席一律
 *     不算 —— 缺证据不等于证据。（`no-card` 只收 `creditCardRequired === false`，
 *     这正是本阶段那条红线在入口层的落点：绝不把「尚未确认」渲染成「不需要」。）
 *  ③ 判据**只在这里写一遍**，算出来的结果作为数据（`needs`）进 `dist/deals.json`；
 *     页面生成、首页入口与断言全部读那一份，前端一个判据都不复刻。
 *
 * ## 为什么每条都要写 criteria 与 why
 *
 * 这十条里有四条**名不副实**，而它们恰恰是最容易被误读的：
 *   · `no-card` 全库只有 1 条 —— 「无需信用卡」这个词会让读者以为其余 79 条都要卡；
 *   · `china-usable` 只有 30 条，而 `region: 'cn'` 有 60 条 —— 差额不是「不可用」，
 *     是「来源没写」；
 *   · `ai-coding` 没有可用字段，只能按类目收 4 条；
 *   · `free-tier` 收 60 条，分不清「活动免费」与「免费档」。
 * 这些缺口写在页面上（`why`）、写在数据里（`criteria`）、也写进报告，
 * 而不是靠读者自己从数字里猜。**一个入口页如果只能靠猜才知道它收的是什么，它就不该上线。**
 */
const NEED_GROUPS = [
  { key: 'student', label: '学生' },
  { key: 'developer', label: '开发者' }
];

/**
 * 十条判据函数。全部是纯函数、只读字段，`deal` 为 `null` / 残缺对象时也必须返回布尔值
 * （入口页是按数据现算的，一条脏数据不该让整次构建抛错）。
 */
const isStudentOnlyNeed = deal => isStudentDeal(deal);
const isEduIdentityNeed = deal => {
  const list = deal && Array.isArray(deal.audience) ? deal.audience : [];
  const email = deal && deal.eligibilityDetail ? deal.eligibilityDetail.educationEmailRequired : undefined;
  return list.includes('education') || list.includes('educator') || email === true;
};
/** 「不需要信用卡」= 来源**明说**不需要。`unknown` 与缺席都不算（见文件头的三态语义） */
const isNoCardNeed = deal => Boolean(deal && deal.claimRequirements) &&
  deal.claimRequirements.creditCardRequired === false;
/** ⚠️ 刻意**不用** `region === 'cn'`。SCHEMA-v1.1 §2.5 明写：来源是国内不构成「国内可用」的证据 */
const isChinaUsableNeed = deal => Boolean(deal && deal.availability) &&
  deal.availability.chinaUsable === true;
/** 与首页「① 完全免费」档同一字段口径（`pricingModel`），不做任何文本推断 */
const isFreeTierNeed = deal => deal && (deal.pricingModel === 'free' || deal.pricingModel === 'freemium');
const isFreeApiNeed = deal => freeApiSignal(deal).applies;
const isFreeTokensNeed = deal => Boolean(deal) && Array.isArray(deal.benefitType) &&
  deal.benefitType.includes('free_credits');
/** ⚠️ 唯一没有字段支撑的一项：只能按类目收，且**不**扫标题正文（扫出来的 10 条里 6 条是误报） */
const isAiCodingNeed = deal => Boolean(deal) && deal.category === '编程开发';
const isFreeModelNeed = deal => Boolean(deal) && Array.isArray(deal.benefitType) &&
  deal.benefitType.includes('free_model');
const isDevCreditsNeed = deal => developerSignal(deal).applies;

const NEED_PREDICATES = {
  studentOnly: isStudentOnlyNeed,
  eduIdentity: isEduIdentityNeed,
  noCard: isNoCardNeed,
  chinaUsable: isChinaUsableNeed,
  freeTier: isFreeTierNeed,
  freeApi: isFreeApiNeed,
  freeTokens: isFreeTokensNeed,
  aiCoding: isAiCodingNeed,
  freeModel: isFreeModelNeed,
  devCredits: isDevCreditsNeed
};

/**
 * 十条入口的注册表。形状与 `COLLECTION_PAGES` 一致（同一套生成循环读它），
 * 额外四个字段：
 *   · `group` —— 首页入口行里的分组（学生 / 开发者），来自 `NEED_GROUPS`；
 *   · `criteria` —— 判据的**机器可读**一句话，进 `dist/deals.json`，也是报告里的那一列；
 *   · `short` —— **窄屏**首页入口上的短标签（见下）；
 *   · `count` 不走这里 —— 条数按数据现算，写死就会出现「页面写 12、实际列 7」。
 *
 * ## 为什么需要 `short`
 *
 * 窄屏（390/360px）实测：十枚完整标签折成 5 行 chip、整块 204px 高，把首屏的卡片
 * 挤到一张都不剩（改之前是 1 张）。这不是「标签写长了」的美学问题，而是**首屏没有任何
 * 内容**。短标签（学生组「专享 / 教育 / 免卡 / 国内 / 免费」，开发者组「API / Tokens /
 * Coding / 模型 / Credits」）把 5 行压到 2 行，整块降到 128px。
 *
 * 短标签**只出现在窄屏的首页入口行上**：落地页的标题、面包屑、`<title>`、JSON-LD
 * 与桌面端入口仍然用完整 `label`（`renderNeedRow` 按一个 `?short=1` 的标记选择用哪一个），
 * 所以「点进去看到的是完整标题、桌面端读到的是完整标签」，没有一个读者只能看到缩写。
 */
const NEED_PAGES = [
  {
    slug: 'student-only',
    group: 'student',
    label: '学生专享',
    short: '专享',
    heading: '面向学生的 AI 优惠',
    depth: 2,
    predicate: 'studentOnly',
    criteria: "audience 含 student，或 eligibilityDetail.studentRequired 为 true，或福利类型是 student_plan",
    description: '来源明确说面向学生的 AI 优惠：学生套餐、需学生身份或教育邮箱的订阅与教育折扣，逐条标注门槛与是否中国大陆可用。',
    why: [
      '这一页收的是<b>来源明确说面向学生</b>的优惠：适用人群写了「学生」、资格门槛里「需要学生身份」为「是」、或福利类型是学生专属计划。这三条是<b>或</b>的关系，命中任意一条就进这一页。',
      '与 /student/ 分类页<b>同一份判据</b>（都来自 audience.js 的 studentSignal），所以两页的条数不可能分头变化。',
      '「来源没提学生身份」的条目不会被收进来，那只说明我们没查到，不说明学生不能用。门槛逐条列出，没有依据的一律写「尚未确认」。'
    ]
  },
  {
    slug: 'edu-identity',
    group: 'student',
    label: '教育身份可领',
    short: '教育',
    heading: '凭教育身份可以领取的 AI 优惠',
    depth: 2,
    predicate: 'eduIdentity',
    criteria: 'audience 含 education 或 educator，或 eligibilityDetail.educationEmailRequired 为 true',
    description: '凭教育身份可领取的 AI 优惠：面向学生与教师的教育版、教育邮箱验证后可领的订阅与额度。',
    why: [
      '这一页收的是<b>教育身份</b>相关的优惠：适用人群写了「学生 / 教师 / 教育机构」，或资格门槛里「需要教育邮箱」为「是」。',
      '教育邮箱这一项在全库里只有几条有明确值 —— 大多数来源只写「在校学生」而不说要不要用学校邮箱，所以<b>这一页比「学生专享」更窄</b>，不代表其余条目领不到。',
      '儿童与中小学（K-12）、部分平台的地区限制会另写在条目自己的说明里，以官方页面为准。'
    ]
  },
  {
    slug: 'no-card',
    group: 'student',
    label: '无需信用卡',
    short: '免卡',
    heading: '不需要信用卡的 AI 优惠',
    depth: 2,
    predicate: 'noCard',
    criteria: 'claimRequirements.creditCardRequired 明确为 false（来源明说不需要）',
    description: '来源明确写着不需要绑定信用卡的 AI 优惠：注册即可领取的免费额度与教育版。',
    why: [
      '这一页只收<b>来源明确写着「不需要信用卡」</b>的条目 —— 数据里这一项是三态的，只有写成「否」才算数。',
      '<b>没有写这一项的条目一个都不收</b>：绝大多数来源根本没提支付方式，那些条目是「尚未确认」，而「尚未确认」不等于「需要信用卡」，也不等于「不需要」。',
      '这是本站数字最小的一页，也是最能说明口径的一页：宁可只列上面那几条，也不把没查到的写成「不需要卡」。想知道某一条要不要卡，只能点进官方页面确认。'
    ]
  },
  {
    slug: 'china-usable',
    group: 'student',
    label: '国内可用',
    short: '国内',
    heading: '中国大陆用户可以正常领取使用的优惠',
    depth: 2,
    predicate: 'chinaUsable',
    criteria: 'availability.chinaUsable 明确为 true',
    description: '中国大陆用户可正常注册使用的 AI 优惠：来源写明可用或可完成国内实名认证的条目。',
    why: [
      '这一页只收<b>中国大陆可用性明确为「是」</b>的条目 —— 依据是来源自己写明可以正常注册使用，或在规则上只能由持大陆身份证的用户完成实名认证。',
      '⚠️ 它与首页的「国内」筛选<b>不是同一件事</b>：首页那个按钮按 region 收「来自国内来源」的条目，本页按 availability.chinaUsable 收「已确认大陆可用」的条目。两者的差额是<b>尚未确认</b>，不是「不可用」—— 本页顶部的条数因此明显少于首页点「国内」看到的数量。',
      'Schema 契约里写明：「来自国内来源」<b>不构成</b>「大陆可用」的证据。所以这里不拿 region 顶替，宁可少收一批。',
      '地区限制的原文摘要（如果有）逐条列在「中国大陆可用性」一列里。'
    ]
  },
  {
    slug: 'free-tier',
    group: 'student',
    label: '完全免费',
    short: '免费',
    heading: '免费档可用：不用付费就能用上的优惠',
    depth: 2,
    predicate: 'freeTier',
    criteria: "pricingModel 为 free 或 freemium（与首页「① 完全免费」档同一字段口径）",
    description: '不用付费就能用上的 AI 优惠：定价模式为免费或免费增值的条目，含免费额度、免费模型与免费版订阅。',
    why: [
      '这一页收的是<b>定价模式本身是免费档</b>的条目（数据里的 free 与 freemium 两种写法），与首页分档里「① 完全免费」用的是同一个字段，不做任何文本推断。',
      '「免费档」说的是<b>存在一个不用付钱就能用的档位</b>，不等于所有功能免费：额度上限、并发限制、是否要实名，逐条写在各自的条目里。',
      '这一页条目最多，也最杂：里面既有永久免费的开源模型调用，也有每月重置的免费额度，还有折扣促销。要看「拿到手到底是什么」，请对照每条的福利类型与官方页面。'
    ]
  },
  {
    slug: 'free-api',
    group: 'developer',
    label: '免费 API',
    short: 'API',
    heading: '可以免费调用的 API',
    depth: 2,
    predicate: 'freeApi',
    criteria: 'benefitType 含 free_api',
    description: '可以免费调用的 AI API：福利类型标注为「免费 API」的条目，含国内平台的新用户免费额度与国外平台的试用额度。',
    why: [
      '这一页按<b>福利类型</b>收：福利类型里写了「免费 API」的条目。与 /free-api/ 分类页、/developer/ 分类页<b>不互斥</b>，同一条优惠常常同时在这几页里。',
      '「免费」的具体形态差异很大：一次性赠送 Token、每日重置额度、限时免费、开源模型免费推理，都算在内。以每条卡片上的说明与官方页面为准。',
      '调用前一般要注册账号，部分平台还要求实名认证或绑定支付方式（后两项只有在来源写明时才会标注，没写就是「尚未确认」）。'
    ]
  },
  {
    slug: 'free-tokens',
    group: 'developer',
    label: '免费 Tokens',
    short: 'Tokens',
    heading: '赠送 Token / 免费额度类优惠',
    depth: 2,
    predicate: 'freeTokens',
    criteria: 'benefitType 含 free_credits',
    description: '赠送 Token 与免费额度的 AI 优惠：新用户礼包、活动积分、按量抵扣的体验金，逐条标注领取门槛与可用性。',
    why: [
      '这一页按<b>福利类型</b>收：福利类型里写了「免费额度」的条目 —— 拿到手是可以按量消耗的 Token、积分或体验金，而不是一个免费档位。',
      '它与「免费 API」高度重叠但不相等：赠送的额度通常也能用来调 API。差别在<b>拿到手是什么</b>，不在能不能调用。',
      '额度的计量单位、重置周期与过期时间差异极大（一次性 / 每日重置 / 90 天有效），逐条写在说明里；官方没写的，这一页也不会替它补。'
    ]
  },
  {
    slug: 'ai-coding',
    group: 'developer',
    label: 'AI Coding',
    short: 'Coding',
    heading: '编程开发类 AI 优惠',
    depth: 2,
    predicate: 'aiCoding',
    criteria: "category 为「编程开发」（唯一没有专门字段支撑的一项，见本页说明）",
    description: '编程开发类的 AI 优惠：代码补全、编程助手与开发者工具包，含学生与教师可领的免费额度。',
    why: [
      '这一页只收<b>分类被归为「编程开发」</b>的条目。它是这批入口里<b>唯一没有专门字段支撑</b>的一项 —— 数据模型里没有「是否用于写代码」这个字段。',
      '刻意<b>不去扫标题与正文</b>凑数：按关键词扫能扫出的条目里一多半是误报（正文里出现了 Copilot、代码块之类的词，但那条优惠本身不是编程工具）。用类目收，条数少，但每一条都站得住 —— 具体条数就是本页顶部的那个数字。',
      '所以这一页<b>明显偏少</b>，这是数据缺口而不是没有这类优惠。补法是给采集侧加一个字段，不是在这一页放宽判据。'
    ]
  },
  {
    slug: 'free-model',
    group: 'developer',
    label: '免费模型',
    short: '模型',
    heading: '可以免费使用的模型',
    depth: 2,
    predicate: 'freeModel',
    criteria: 'benefitType 含 free_model',
    description: '可以免费使用的 AI 模型：福利类型标注为「免费模型」的条目，含开源模型免费推理与限时免费模型。',
    why: [
      '这一页按<b>福利类型</b>收：福利类型里写了「免费模型」的条目 —— 免费的是<b>模型本身</b>（某些模型可以零成本调用），而不是账户里的额度。',
      '国内平台的「限时免费模型」多属此类：按天限次、不扣积分，超出后按量计费。限次与重置周期写在各自条目里。',
      '模型清单会变：官方随时可能调整哪些模型在免费范围内，最终以官方页面为准。'
    ]
  },
  {
    slug: 'dev-credits',
    group: 'developer',
    label: '开发者 Credits',
    short: 'Credits',
    heading: '面向开发者的赠送额度',
    depth: 2,
    predicate: 'devCredits',
    criteria: 'audience 含 developer，或 benefitType 含 developer_credit',
    description: '面向开发者的赠送额度与赠金：云平台 credits、创业扶持额度、开发者计划的资源包。',
    why: [
      '这一页收的是<b>给开发者的赠金与资源包</b>：适用人群写了「开发者」，或福利类型是「开发者赠送额度」。',
      '与「免费 Tokens」的区别在<b>给谁</b>与<b>给什么</b>：这里多是云平台与开发者计划的 credits（可用于算力、存储与模型调用），额度常常要申请或满足资格（初创、开源维护者等）。',
      '申请类条目的人工审核时间、额度有效期与是否需要信用卡，逐条列在「门槛 / 领取要求」一列；来源没写的显示「尚未确认」。'
    ]
  }
];

/** 一条记录属于哪几条需求入口（顺序与 NEED_PAGES 一致 —— 序列化结果因此稳定可复现） */
function needsOf(deal) {
  return NEED_PAGES.filter(page => NEED_PREDICATES[page.predicate](deal)).map(page => page.slug);
}

/**
 * 措辞契约的**唯一出处**：同一句话在两处实现里必须逐字相同。
 *
 * `chinaUsableLineWithRestriction` 是**模板**（含 `{restriction}` 槽位）：
 * 带地区限制时的拼句规则也必须只有一份，否则两端会各自「符合字面契约」却拼出
 * 不同的话（前端「可正常注册使用（需国际信用卡）」vs 后端「可用（需国际信用卡）」）。
 *
 * 五个 label 表也进来（2026-09-28 补的空洞）：详情页那 5–9 行的中文**几乎全部**来自
 * `FIELD_LABELS` / `AUDIENCE_LABELS` / `BENEFIT_LABELS` / `ELIGIBILITY_LABELS` / `CLAIM_LABELS`，
 * 而它们原先一个字都不在比对范围内 —— 前端把「仅限新用户」改成「新用户专享」、
 * 或把「需要教育邮箱」改成「必须提供 edu 邮箱」，两边的测试都会各自全绿，
 * 页面上那句话却已经变了。这是实测过的空洞（不是推测）：
 * `checkWordingContract` 对只改 label 的块返回 ok=true、reasons 为空。
 */
const WORDING_CONTRACT = {
  triLabel: { true: '是', false: '否', unknown: '尚未确认' },
  chinaUsableLine: {
    true: '中国大陆用户可正常注册使用',
    false: '中国大陆用户不可用',
    unknown: '尚未确认'
  },
  chinaUsableLineWithRestriction: {
    true: '中国大陆用户可用（{restriction}）',
    false: '中国大陆用户不可用（{restriction}）'
  },
  FIELD_LABELS,
  AUDIENCE_LABELS,
  BENEFIT_LABELS,
  ELIGIBILITY_LABELS,
  CLAIM_LABELS,

  /* ---- v1.3：信息来源（evidence / provenance）块的措辞 ----
   *
   * 同样进跨层文本比对。理由与三态措辞一样：这块内容能不能被读成「本站给了保证」，
   * 取决于这几个词怎么写；而「约束、缺失状态、免责句」恰好是最容易被顺手改松的地方。
   *
   * 三个缺失状态**必须分开写**（契约 §2.6 的 unknown 语义在 v1.3 的落地）：
   *   na          人工策展按设计不经过采集器 —— 不是「我们没查到」
   *   unknown     本该有、但心跳里匹配不到
   *   unavailable 本次构建根本没有心跳数据
   * 合成一句「暂无」，正是本阶段要修的那种「把两种不同的事实说成同一句话」。
   */
  SOURCE_LABELS: {
    sectionTitle: '信息来源',
    official: '官方页面',
    origin: '原始出处',
    source: '收录来源',
    sourceType: '来源类型',
    method: '采集方式',
    firstSeen: '首次收录',
    lastSeen: '最近发现',
    lastSuccess: '最近成功采集',
    basis: '断言依据',
    evidence: '官方原文片段'
  },
  SOURCE_METHOD: {
    static: '静态抓取（HTTP 解析）',
    headless: '无头浏览器渲染',
    curated: '人工策展（人工逐条整理）',
    unknown: '未知'
  },
  SOURCE_TYPE: {
    official: '厂商官方页直采',
    directory: '第三方目录站收录（已解析到官方页）',
    curated: '人工策展',
    unknown: '未知'
  },
  SOURCE_STATE: {
    na: '不适用',
    unknown: '未知',
    unavailable: '不可用'
  },
  SOURCE_REASON: {
    curated: '本条来自人工策展，不经过采集器',
    no_health_row: '来源心跳里没有这一条（来源改名 / 本轮只跑了部分来源）',
    no_health_doc: '本次构建没有可用的来源心跳数据'
  },
  SOURCE_BASIS: {
    source: '官方页面明写',
    documented: '依据官方条款原文',
    inferred: '由官方原文推断',
    none: '未声明依据'
  },
  SOURCE_HEALTH: {
    healthy: '最近一次采集正常',
    degraded: '最近一次采集异常',
    failed: '最近一次采集失败'
  },
  SOURCE_FIELD_LABELS: {
    discountInfo: '优惠说明',
    eligibility: '适用条件',
    validity: '有效期说明',
    priceLine: '价格阶梯',
    expiresAt: '截止日期'
  },
  SOURCE_NOTES: {
    noOrigin: '未署名原始出处',
    noEvidence: '未收录官方原文片段',
    evidenceNote: '以下片段摘自厂商官方页面，仅用于核对本页信息；完整内容与最终条款以官方页面为准。',
    disclaimer: '以上是本站采集与整理过程的事实，不构成对优惠是否有效、是否适用于你的判断；最终以厂商官方页面为准。'
  }
};

/**
 * 中国大陆可用情况的一句话。**这是本阶段最重要的一个输出**：
 *   true      → 「中国大陆用户可正常注册使用」
 *   false     → 「中国大陆用户不可用（+ 来源写明的地区限制）」
 *   unknown   → 「尚未确认」——绝不能说成「不可用」
 *   没写字段  → `''`（整行不渲染）
 *
 * ⚠️ 「带地区限制」时的**拼句规则**也必须在契约里，否则两边都会「符合字面契约」却
 * 互相矛盾：无限制时基础句是「可正常注册使用」、带限制时是「可用（…）」，前端若在两种
 * 情况下都拼基础句，就会出现前端「可正常注册使用（需国际信用卡）」vs 后端
 * 「可用（需国际信用卡）」—— 而 `checkWordingContract` 只比常量表、照不到拼句。
 * 所以限制版本也做成模板（`chinaUsableLineWithRestriction`），由两端各自替换
 * `{restriction}`，**拼句规则因此只剩一份**。
 */
const CHINA_RESTRICTION_SLOT = '{restriction}';

function fillRestriction(template, restriction) {
  return String(template).split(CHINA_RESTRICTION_SLOT).join(restriction);
}

function chinaUsableLine(deal) {
  const availability = deal && deal.availability;
  if (!availability || typeof availability !== 'object') return '';
  const value = availability.chinaUsable;
  const restriction = typeof availability.regionRestriction === 'string' ? availability.regionRestriction.trim() : '';
  if (value === true) {
    return restriction
      ? fillRestriction(WORDING_CONTRACT.chinaUsableLineWithRestriction.true, restriction)
      : WORDING_CONTRACT.chinaUsableLine.true;
  }
  if (value === false) {
    return restriction
      ? fillRestriction(WORDING_CONTRACT.chinaUsableLineWithRestriction.false, restriction)
      : WORDING_CONTRACT.chinaUsableLine.false;
  }
  if (value === TRISTATE_UNKNOWN) return WORDING_CONTRACT.chinaUsableLine.unknown;
  // 只写了地区限制、没写三态：如实只说地区限制，不替它推可用性
  return restriction || '';
}

/* ------------------------------------------------------------------ */
/* 详情页行（与 RENDER-CORE 的 audienceRows 同源语义）                  */
/* ------------------------------------------------------------------ */

/**
 * 详情页要渲染的行。**只输出有明确数据的行**：
 *   · 整个字段组缺席 → 不出行（一行「未收录」是噪音；读者分不清「没查」与「没有」）；
 *   · 三态为 unknown 的**单个键** → 该键不出行（它是「我们没查到」，不是信息）；
 *   · `chinaUsable: 'unknown'` 是唯一例外 → 出「尚未确认」。
 *     为什么它例外：这一行是用户做「要不要为它折腾」这个决定的关键输入，
 *     「尚未确认」本身就有决策价值（明确告诉他别把这条当已确认可用）。
 *
 * @returns {Array<{key:string, label:string, value:string}>}
 */
function audienceRows(deal) {
  const rows = [];
  if (!deal || typeof deal !== 'object') return rows;

  const audience = audienceSummary(deal);
  if (audience) rows.push({ key: 'audience', label: FIELD_LABELS.audience, value: audience });

  const benefit = benefitSummary(deal);
  if (benefit) rows.push({ key: 'benefitType', label: FIELD_LABELS.benefitType, value: benefit });

  for (const key of ELIGIBILITY_KEYS) {
    const value = deal.eligibilityDetail && deal.eligibilityDetail[key];
    if (value === true || value === false) {
      rows.push({ key: 'eligibilityDetail.' + key, label: ELIGIBILITY_LABELS[key], value: triLabel(value) });
    }
  }

  for (const key of CLAIM_KEYS) {
    const value = deal.claimRequirements && deal.claimRequirements[key];
    if (value === true || value === false) {
      rows.push({ key: 'claimRequirements.' + key, label: CLAIM_LABELS[key], value: triLabel(value) });
    }
  }

  const region = deal.availability && typeof deal.availability.regionRestriction === 'string'
    ? deal.availability.regionRestriction.trim() : '';
  const china = deal.availability && deal.availability.chinaUsable;
  if (china === true || china === false || china === TRISTATE_UNKNOWN || region) {
    rows.push({
      key: 'availability.chinaUsable',
      label: FIELD_LABELS.chinaUsable,
      value: chinaUsableLine(deal)
    });
  }

  return rows;
}

/* ------------------------------------------------------------------ */
/* 搜索：让「学生优惠」这种中文意图能命中新字段                          */
/* ------------------------------------------------------------------ */

/**
 * 新字段进搜索 haystack 的检索串。
 *
 * 刻意**只拼有明确数据的部分**：把 unknown 的标签也拼进去，会让「信用卡」搜出
 * 一堆「尚未确认要不要信用卡」的条目 —— 搜索结果虚高，与没做这件事一样糟。
 * 枚举值本身（英文 key）也拼进去，方便按 `student` / `free_api` 直接搜。
 */
function audienceSearchText(deal) {
  const parts = [];
  if (!deal || typeof deal !== 'object') return '';
  if (Array.isArray(deal.audience)) {
    deal.audience.forEach(key => parts.push(key, AUDIENCE_LABELS[key] || ''));
  }
  if (Array.isArray(deal.benefitType)) {
    deal.benefitType.forEach(key => parts.push(key, BENEFIT_LABELS[key] || ''));
  }
  const eligibility = deal.eligibilityDetail || {};
  ELIGIBILITY_KEYS.forEach(key => {
    if (eligibility[key] === true) parts.push(ELIGIBILITY_LABELS[key]);
    if (eligibility[key] === false) parts.push(claimLabel(key, false));
  });
  const claim = deal.claimRequirements || {};
  CLAIM_KEYS.forEach(key => {
    if (claim[key] === true) parts.push(CLAIM_LABELS[key]);
    if (claim[key] === false) parts.push(claimLabel(key, false));
  });
  const availability = deal.availability || {};
  if (availability.chinaUsable === true) parts.push('中国大陆可用', '国内可用');
  if (availability.chinaUsable === false) parts.push('中国大陆不可用');
  if (typeof availability.regionRestriction === 'string' && availability.regionRestriction.trim()) {
    parts.push(availability.regionRestriction.trim());
  }
  return parts.filter(Boolean).join(' ');
}

/* ------------------------------------------------------------------ */
/* 与 RENDER-CORE 的文本级比对材料                                      */
/* ------------------------------------------------------------------ */

/**
 * 给 selftest 用的「必须逐字节一致」清单。
 *
 * 为什么是文本而不是行为：行为级比对只能覆盖你想到的输入。三态映射的分叉形态很隐蔽
 * —— 前端把 unknown 写成「待确认」、后端写「尚未确认」，两边的测试各测各的都会绿，
 * 而同一页面上两句话对不上。文本比对是唯一能在**改动那一刻**就红的手段。
 */
const WORDING_BLOCK = { start: 'AUDIENCE:START', end: 'AUDIENCE:END', constName: 'AUDIENCE_WORDING' };

/**
 * 同源常量可以有多个（v1.3 加了 `SOURCE_WORDING`：信息来源块的措辞）。
 * 它们必须都在同一个标记块里、都是纯 JSON 字面量 —— 比对时合并成一个对象，
 * 组名不重名即可。**任何一个解析不出都算漂移**，不跳过。
 */
const WORDING_CONSTS = ['AUDIENCE_WORDING', 'SOURCE_WORDING', 'HISTORY_WORDING'];

/**
 * 抽取 RENDER-CORE 里 `AUDIENCE:START/END` 标记块的内容。抽不到返回 null。
 *
 * 这个函数住在 lib 里而不是 selftest 里，是为了让**只有一个**解析实现：
 * selftest 与 `validate --strict` 的探针都要读同一块文本，两处各写一份解析，
 * 就会出现「一处解析失败被当成通过」的经典假绿。
 *
 * 起始标记在块内可能独占一行（`/* AUDIENCE:START` 后面跟若干 `* …` 注释行），
 * 所以匹配到**行尾**为止，不能要求它后面紧跟 `*​/`——早先版本要求了，于是块明明
 * 写对了却报「找不到标记块」，而报错信息还理直气壮地说「副本没了」。
 */
function extractWordingBlock(html) {
  const esc = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`/\\*[ \\t]*${esc(WORDING_BLOCK.start)}[^\\n]*\\n?([\\s\\S]*?)/\\*[ \\t]*${esc(WORDING_BLOCK.end)}[ \\t]*\\*/`);
  const match = re.exec(String(html || ''));
  return match ? match[1] : null;
}

/**
 * 从标记块里取同源常量的字面量。
 *
 * 刻意**不用** expiry-selftest 那套 `= /…/ ;` 的正则解析 —— 那是给正则字面量写的，
 * 对字符串常量会解析失败，而失败若被写成「跳过」就正好是最危险的那种假绿。
 * `AUDIENCE_WORDING` 是纯字符串 JSON，直接按 JSON 解析：解析不出就是**漂移**，不是「没写」。
 */
function parseWordingBlock(block) {
  if (block === null) return null;
  const merged = {};
  for (const name of WORDING_CONSTS) {
    const m = new RegExp(`${name}\\s*=\\s*(\\{[\\s\\S]*?\\});`).exec(block);
    if (!m) return null;
    let parsed;
    try {
      parsed = JSON.parse(m[1]);
    } catch (error) {
      return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    Object.assign(merged, parsed);
  }
  return merged;
}

/**
 * 前后端措辞漂移检测（`selftest:audience` 与 `validate --strict` 共用）。
 *
 * 这是本阶段那条红线（「`unknown` 不得渲染成 `false`」）唯一的**跨层**牙齿。
 * 为什么必须是跨层：`scripts/lib/audience.js` 与 `index.html` 的 RENDER-CORE 是两份
 * 实现（后者在 vm 沙箱里跑，不能 require），前端哪天把「尚未确认」改成「否」、
 * 或后端改了忘了同步，两边的单元测试都会各自全绿 —— 而页面上那句话已经变成
 * 对读者的断言了。只有把两边的**文本**拿出来比，改动那一刻才会红。
 *
 * @param {string} html index.html 的内容
 * @returns {{ok:boolean, reasons:string[], frontend:object|null}}
 */
function checkWordingContract(html) {
  const reasons = [];
  const block = extractWordingBlock(html);
  if (block === null) {
    reasons.push(`index.html 里找不到 /* ${WORDING_BLOCK.start} */ … /* ${WORDING_BLOCK.end} */ 标记块（措辞的同源副本没了，就没法证明前后端一致）`);
    return { ok: false, reasons, frontend: null };
  }
  const parsed = parseWordingBlock(block);
  if (!parsed) {
    reasons.push(`标记块里的 ${WORDING_CONSTS.join(' / ')} 不是可解析的 JSON 对象（改坏了，或被写成了非字面量）`);
    return { ok: false, reasons, frontend: null };
  }
  for (const group of Object.keys(WORDING_CONTRACT)) {
    const expected = WORDING_CONTRACT[group];
    const actual = parsed[group];
    if (!actual || typeof actual !== 'object') {
      reasons.push(`标记块里缺 ${group}`);
      continue;
    }
    for (const key of Object.keys(expected)) {
      if (actual[key] !== expected[key]) {
        reasons.push(`${group}.${key}：前端「${actual[key]}」≠ 后端「${expected[key]}」`);
      }
    }
  }
  // 模板必须**真的带槽位**：有人把 `{restriction}` 删掉、改成写死的一句话时，
  // 两端字符串仍然「相等」，但拼句能力已经没了 —— 这条专门盯住它。
  const template = parsed.chinaUsableLineWithRestriction;
  if (template && !Object.values(template).some(text => String(text).includes(CHINA_RESTRICTION_SLOT))) {
    reasons.push(`标记块里的 ${WORDING_BLOCK.constName}.chinaUsableLineWithRestriction 不含 ${CHINA_RESTRICTION_SLOT} 槽位（模板退化成了写死的一句话）`);
  }
  return { ok: reasons.length === 0, reasons, frontend: parsed };
}

module.exports = {
  AUDIENCES,
  BENEFIT_TYPES,
  ELIGIBILITY_KEYS,
  CLAIM_KEYS,
  TRISTATE_UNKNOWN,
  TRISTATE_VALUES,
  MAX_REGION_RESTRICTION_LENGTH,
  CREDIBILITIES,
  BASIS_VALUES,
  DERIVED_VALUES,
  FIELD_LABELS,
  AUDIENCE_LABELS,
  BENEFIT_LABELS,
  ELIGIBILITY_LABELS,
  CLAIM_LABELS,
  triLabel,
  claimLabel,
  CHINA_RESTRICTION_SLOT,
  fillRestriction,
  normalizeTristate,
  normalizeEnumList,
  normalizeTristateMap,
  normalizeAvailability,
  truncate,
  hasKnown,
  knownKeys,
  audienceSummary,
  benefitSummary,
  // 分类归属：判据的**唯一出处**（分类页、首页筛选器、产物自检三处共用）
  studentSignal,
  developerSignal,
  freeApiSignal,
  isStudentDeal,
  isDeveloperDeal,
  isFreeApiDeal,
  COLLECTION_PAGES,
  COLLECTION_PREDICATES,
  collectionsOf,
  // 按需求找优惠（v1.2）：意图 → 判据 的唯一注册表（页面生成 / 首页入口 / 断言共用）
  NEED_GROUPS,
  NEED_PAGES,
  NEED_PREDICATES,
  needsOf,
  chinaUsableLine,
  audienceRows,
  audienceSearchText,
  WORDING_CONTRACT,
  WORDING_BLOCK,
  WORDING_CONSTS,
  extractWordingBlock,
  parseWordingBlock,
  checkWordingContract
};
