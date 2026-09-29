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
 */
const COLLECTION_PAGES = [
  {
    slug: 'student',
    title: '学生优惠',
    heading: '面向学生的 AI 优惠',
    predicate: 'student',
    description: '面向学生的 AI 优惠与免费额度：需要学生身份或教育邮箱的订阅、学生套餐与教育折扣，逐条标注门槛与是否中国大陆可用。',
    why: [
      '这一页收的是**来源明确说面向学生**的优惠：`audience` 写了 `student`，或 `eligibilityDetail.studentRequired` 为「是」，或福利类型是学生套餐。',
      '**「没写」不等于「不适用」**：来源页面上没有提学生身份的条目不会被收进来，它只说明我们没查到，不说明学生不能用。',
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
      '这一页收的是 `audience` 写了 `developer`，或福利类型是开发者赠金的条目。',
      '国内大模型平台的「新用户免费额度」多属此类：需要注册与实名认证，额度按 Token 计量并有过期时间。',
      '同样地，**没有写开发者字样的条目不会被收进来**，那不代表它不能用于开发。'
    ]
  },
  {
    slug: 'free-api',
    title: '免费 API',
    heading: '可以免费调用的 API',
    predicate: 'freeApi',
    description: '可以免费调用的 AI API：福利类型标注为「免费 API」的条目，含国内大模型平台的新用户免费额度与国外平台的试用额度。',
    why: [
      '这一页按**福利类型**收：`benefitType` 含 `free_api`。与上面两页按人群切不同，它切的是「拿到手是什么」。',
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
  CLAIM_LABELS
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
  const m = new RegExp(`${WORDING_BLOCK.constName}\\s*=\\s*(\\{[\\s\\S]*?\\});`).exec(block);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (error) {
    return null;
  }
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
    reasons.push(`标记块里的 ${WORDING_BLOCK.constName} 不是可解析的 JSON 对象（改坏了，或被写成了非字面量）`);
    return { ok: false, reasons, frontend: null };
  }
  for (const group of Object.keys(WORDING_CONTRACT)) {
    const expected = WORDING_CONTRACT[group];
    const actual = parsed[group];
    if (!actual || typeof actual !== 'object') {
      reasons.push(`标记块里缺 ${WORDING_BLOCK.constName}.${group}`);
      continue;
    }
    for (const key of Object.keys(expected)) {
      if (actual[key] !== expected[key]) {
        reasons.push(`${WORDING_BLOCK.constName}.${group}.${key}：前端「${actual[key]}」≠ 后端「${expected[key]}」`);
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
  chinaUsableLine,
  audienceRows,
  audienceSearchText,
  WORDING_CONTRACT,
  WORDING_BLOCK,
  extractWordingBlock,
  parseWordingBlock,
  checkWordingContract
};
