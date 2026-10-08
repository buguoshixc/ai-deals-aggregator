/**
 * `/plans/coding/` 的**正文渲染**（v2.1 的第二段：把套餐数据变成读者能看的页面）。
 *
 * ## 为什么渲染放在 lib 而不是 build-local 里
 *
 * 因为要能被**离线自测直接调用**：`build-local.js` 一 require 就会跑整条构建链，
 * 自测不可能把它当库用（与 `lib/changes.js` 被 `changes-selftest` 直接调是同一个理由）。
 * 这一支因此是**纯函数**：不读盘、不联网、不看时钟、不写盘 —— 输入是 plans 记录，
 * 输出是 HTML 字符串与 JSON-LD 对象。
 *
 * ## 这一页的三条硬承诺（都有断言，见 `assertPageHonesty()`）
 *
 * 1. **只列事实，不做结论**。没有评分、没有排名、没有"性价比"、没有"最值得买"。
 *    页面上不许出现这些词 —— 这一条在 v2.1 的第一段还只是产品规则，
 *    现在有了 `FORBIDDEN_CLAIM_WORDS` 这个唯一出处，构建期与真浏览器各查一遍。
 * 2. **缺值不占位**。未知一律显式写成「未标注」（文本）/「—」（数值）/「未确认」（三态），
 *    绝不写 0、也绝不合成一句"暂无"。原价未知的套餐显示「未标注」，而不是把它算成 0 元。
 * 3. **不可比较的绝不硬塞进可比列**。「名义 Token 单价」算不出来就显示「—」，
 *    并且**不参与"谁更便宜"的观感**（表格不排序、不加颜色分级）——
 *    把 requests / 限速 / 用量池当成 0 元每亿 Token，是这一页最容易犯、也最坏的错。
 */

const planSchema = require('./plan-schema');
const providersLib = require('./providers');
/**
 * 筛选 / 搜索 / 排序 / 行内展开的**纯逻辑**。它同时被内联进页面（读者手里的那一份）
 * 和 `require` 进自测（离线牙的那一份）—— 一份实现两个宿主，见该文件头部注释。
 */
const plansCompare = require('./plans-compare');
/**
 * v2.3：套餐变化。**判据在 `lib/plan-changes.js`（纯函数）**，这里只排版与写句子 ——
 * 同一句话在 `/plans/coding/` 的「最近变化」、行内时间线、`/changes/` 的分栏与订阅源上
 * 必须是同一句，所以句子只能有一处实现（`planChangeText()`）。
 */
const planHistory = require('./plan-history');

/**
 * 说明登记（notes-manifest-residual-v1）：`.snote` 构造点不再直接写进页面 —— 每个构造点在
 * 产出那一段 HTML 的**同一次调用**里登记（`ctx.note` 由 `build-local.js` 按 route 注入）。
 * 与 `lib/vendor-page.js` 同形：参数可以是 ctx 对象（含 `.note`），也可以是 note 函数本身；
 * 都没有时是恒等函数（断言 / selftest 路径不产出页面）。
 */
const NOTES_DECLARED_BY = 'lib/plans-page.js';
const noteIn = source => {
  if (typeof source === 'function') return source;
  if (source && typeof source.note === 'function') return source.note;
  return (decl, html) => html;
};

const planChanges = require('./plan-changes');

const PLANS_ROUTE = 'plans/coding/';
/**
 * 回到站根的相对前缀。
 *
 * **由路由深度推导，不写死**：这一页是两层路由，`../` 只会回到 `/plans/`（一个不存在的地址），
 * 必须 `../../`。构建期的 SEO 内链存在性检查当场抓到过这一点 ——
 * 而页面上看起来完全正常，只有点下去才发现问题。
 */
const PLANS_HOME_HREF = '../'.repeat(PLANS_ROUTE.split('/').filter(Boolean).length);
const PLANS_HEADING = 'AI Coding 套餐对比';
const PLANS_DESCRIPTION = '把各平台长期在售的 AI Coding 套餐放在一张表里比：正常价格、当前活动价、'
  + '计费周期、可用模型、原始额度与额度类型。只列事实，不排名、不评分、不替读者判断值不值。';

/** 未知的三种表现形态。语义不同所以写上不同的词（H4b：缺失要说清是哪一种） */
const UNKNOWN_TEXT = '未标注';
const UNKNOWN_NUM = '—';
const UNKNOWN_TRI = '未确认';

/**
 * 列模型（顺序即列序）。**`<thead>` 与载荷里的 `columns` 共用这一份**：
 * 「详情行 colspan == 表头列数」这条断言因此不可能因为"加了列却忘了改另一处"而失真。
 * v2.2 一行都没加 —— 筛选项与「详情」按钮都在**已有的单元格里**，不新增第 12 列。
 */
const PLANS_COLUMNS = ['平台', '套餐', '正常价格', '当前活动价', '计费周期', '可用模型',
  '额度类型', '原始额度', '名义 Token 单价', '最近更新', '备注'];

const SORT_LABEL = {
  default: '默认顺序', regular: '正常月费', promo: '活动价',
  unit: '名义 Token 单价', updated: '最近更新'
};

/** 控件行末尾那句事实（本期没有任何一条能折算成名义 Token 单价时显示） */
const NO_UNIT_SORT_NOTE = '本期没有一条套餐的额度是固定 Token，名义 Token 单价与它的排序不适用。';

/** 模型维度里「未标注」那一档的保留键（不是模型名，不会与真实模型名撞车） */
const MODEL_NONE_KEY = plansCompare.MODEL_NONE_KEY;

/**
 * 页面上**不许出现**的结论性词汇。唯一出处。
 *
 * 为什么单列一张表而不是散在断言里：题面明确禁用「性价比 / 最划算 / TOP 1」这类标签，
 * 而 v2.1 第一段时它们**没有任何守卫**（只在文档里写着）。现在构建期与真浏览器
 * 都拿这一份清单去查同一页。
 *
 * 刻意**不**收录的：`推荐` / `排序` —— 页脚既有句子「本站不收录付费推广位，
 * 排序与推荐理由不出售」里就有这两个词，把裸词写进清单会让每一条断言永远为真。
 */
const FORBIDDEN_CLAIM_WORDS = [
  '性价比', '最划算', '最超值', '最值得买', '值得买', '排行榜', '排行',
  '综合评分', '星级', '推荐指数', 'TOP 1', 'TOP1', '第一名', '最优选'
];

/** 口径与说明（题面 §十 的五条，一条都不能少） */
const PLANS_NOTES = [
  '不同平台的计量方式不同：Token、积分、请求次数、按窗口限速、用量池 —— 本页**照原样列出**，不互相换算。',
  'Token 额度不一定完全可比：额度随模型倍率变化时，我们把它记成「积分」而不是固定 Token（否则就是把不可比的东西写成可比）。',
  '「名义 Token 单价」只在能算的时候才算 —— 需要额度确实是 Token、额度周期与计费周期一致、币种可处理、当前价明确、且折算不随模型变化。算不出的一律显示「—」，不填 0，也不参与任何排序。',
  '价格与额度以官方页面为准：表中每条都链到该平台的官方定价页，本站只做收录与整理。',
  '「最近更新」是我们最后一次人工对照官方页的日期，不是官方承诺不变的日期。',
  // v2.2：筛选 / 搜索 / 排序 / 展开 —— 四条口径。为什么必须写在页面上：这些控件会改变
  // 读者看到的子集，而"筛掉的为什么被筛掉"如果不说，筛选就变成了替读者做判断。
  '筛选、搜索与排序都**只在你自己的浏览器里生效**：它们不改变这一页的地址，也不生成新的页面 —— 地址栏里永远是这一页，看到的永远是下面这张表的子集。',
  '价格区间只按**正常月费**筛，而且**不跨币种**：每一档都写着币种（如「¥50–99（CNY）」），我们没有汇率，也不打算用一个假汇率把美元和人民币放进同一个区间。原价未标注、以及非月付的套餐，在价格区间生效时不出现。',
  '排序里「不可比较」的一律排在**可比较项之后**，正序倒序都不越过它 —— 没有活动价、算不出名义 Token 单价的套餐，绝不会因为"看起来是 0"而排到最前面。价格排序还**按币种分组**（组内排序），不跨币种互相比较。',
  '搜索覆盖平台名与常见别名、套餐名、模型名，以及页面上显示的额度类型与地区；中文显示值也能搜到（例如「智谱」「灵码」）。',
  // v2.4：优惠 ↔ 套餐。为什么必须写在页面上：这一块会把读者引到优惠页，而「为什么这条套餐有优惠、
  // 那条没有」的判据如果不说，读者只能猜 —— 猜出来的结论往往是「我们漏了」。
  '「当前优惠」只来自**显式确认**的关联（`deal-plan-links.json`，每条都带官方出处），并且只在优惠尚未结束、套餐仍在售时显示；相似度匹配只产出候选报告，不会自动写进这一页。',
  '优惠结束后套餐**不会消失**：那一行会变成「暂无当前优惠」，而这段关系仍记在「历史优惠」里（已下架的优惠保留标题与厂商快照，因此不会有指向不存在页面的链接）。'
];

const CURRENCY_SYMBOL = { CNY: '¥', USD: '$', HKD: 'HK$', EUR: '€', JPY: '¥', GBP: '£', SGD: 'S$' };

const BILLING_PERIOD_LABEL = {
  monthly: '每月', yearly: '每年', one_time: '一次性', usage_based: '按量计费', other: '其他'
};
const QUOTA_PERIOD_LABEL = {
  monthly: '每月', yearly: '每年', weekly: '每周', daily: '每日',
  hourly: '每小时', rolling: '滚动窗口', one_time: '一次性', other: '其他'
};
const QUOTA_TYPE_LABEL = {
  tokens: 'Token', credits: '积分', requests: '请求次数', messages: '消息数',
  rate_limited: '按窗口限速', unlimited_fair_use: '公平使用', compute_units: '算力单位', other: '其他'
};
const QUOTA_UNIT_LABEL = {
  tokens: 'Token', credits: '积分', requests: '次', messages: '条', compute_units: '单位'
};
const MODEL_ROLE_LABEL = { included: '可用', limited: '受限', pool: '动态池', family: '模型族' };
const RESTRICTION_LABEL = {
  concurrency: '并发', rate_limit: '限速', per_day_cap: '每日上限', rolling_window: '刷新窗口',
  output_limit: '输出上限', fair_use: '公平使用', region_restriction: '地区限制',
  account_required: '需要账号', invite_only: '仅限受邀', new_user_only: '仅限新用户'
};

/**
 * v2.4：套餐页那一块「各套餐当前优惠」的**唯一用词出处**。
 *
 * 为什么用词要单列：这一块的每一句话都会被构建期断言与真浏览器断言逐字比对，
 * 句子写两遍就会在某一处悄悄分家（v2.3 的 `planChangeText()` 就是这么来的）。
 * `none`（暂无当前优惠）与 `historical`（历史优惠）必须分开：把「现在没有」与
 * 「曾经有过、已经结束」写成同一句，就是把一件已经过去的事说成现在的事。
 */
const PLAN_DEALS_WORDING = {
  sectionId: 'plan-deals',
  heading: '各套餐当前优惠',
  note: '关联是显式确认的：只有人工在 deal-plan-links.json 写明、且能在官方页找到出处的关联才会计入；相似度匹配只产出候选报告，不会自动写进这一页。',
  none: '暂无当前优惠',
  current: '当前优惠：',
  historical: '历史优惠：',
  eligible: '（限符合条件者）',
  ended: '已结束',
  fallback: '详情见优惠页',
  viewDeal: '查看优惠 →'
};

/* ------------------------------------------------------------------ */
/* 小工具（都是纯函数）                                                 */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 千分位。**不用 toLocaleString** —— 它的输出依赖运行环境的 locale，产物会因此不可复现 */
function formatNumber(value) {
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  const [int, frac] = text.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const digits = sign ? int.slice(1) : int;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${frac ? `.${frac}` : ''}`;
}

function providerNameOf(key, table) {
  const source = table || providersLib.load().table;
  const entry = source[key];
  return entry && entry.name ? entry.name : String(key || '');
}

/** 价格渲染：未知 → null（调用方负责写「未标注」），已知 → {text, code} */
function priceOf(value, currency) {
  if (value === null || value === undefined) return null;
  const symbol = CURRENCY_SYMBOL[currency] || '';
  return { text: `${symbol}${formatNumber(value)}`, code: currency || '' };
}

function triText(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  return UNKNOWN_TRI;
}

function quotaAmountText(plan) {
  const quota = plan.quota || {};
  if (quota.amount === null || quota.amount === undefined) return null;
  const unit = QUOTA_UNIT_LABEL[quota.type] || '';
  const period = quota.period ? ` / ${QUOTA_PERIOD_LABEL[quota.period] || quota.period}` : '';
  return `${formatNumber(quota.amount)}${unit ? ` ${unit}` : ''}${period}`;
}

function restrictionText(item) {
  const label = RESTRICTION_LABEL[item.kind] || item.kind;
  const value = typeof item.value === 'number' || typeof item.value === 'string'
    ? (item.value === 'unknown' ? UNKNOWN_TRI : String(item.value))
    : triText(item.value);
  return `${label}：${value}`;
}

/**
 * 一行 = 一个套餐的全部展示文本。**先算数据、再拼 HTML** ——
 * 这样自测可以直接断言"这一行给读者看的到底是什么"，不必去解析 HTML。
 */
function planRowOf(plan, { providerTable = null } = {}) {
  const billing = plan.billing || {};
  const quota = plan.quota || {};
  /**
   * 渲染层的 fail-closed 守卫：**只有当额度类型确实是 tokens 时才显示单价**。
   *
   * 数据层已经保证过这件事（`validatePlan` 会把 `derivedMetrics` 与重新推导的结果逐字节比对），
   * 所以正常数据上这一行没有任何作用。它挡的是「数据被绕过了」那一种：
   * 把 requests / 限速 / 用量池显示成一个 Token 单价，是这一页**最坏**的错
   * （读者会拿它去比"谁更便宜"），而多加这一个条件的代价只有一行。
   */
  const rawMetric = plan.derivedMetrics ? plan.derivedMetrics.nominalUnitPrice : null;
  const metric = quota.type === 'tokens' ? rawMetric : null;

  const regular = priceOf(billing.regularPrice, billing.currency);
  const promo = priceOf(billing.promoPrice, billing.currency);

  // 「确实免费」与「原价未知」必须能被读成两句不同的话：前者是 ¥0，后者是未标注。
  const regularText = regular ? regular.text : (billing.regularPrice === 0 ? '¥0' : UNKNOWN_TEXT);
  const regularCode = regular && regular.code ? regular.code : (billing.currency || '');

  const models = Array.isArray(plan.supportedModels)
    ? plan.supportedModels.map(item => (item.role && item.role !== 'included'
      ? `${item.name}（${MODEL_ROLE_LABEL[item.role] || item.role}）`
      : item.name)).join('、')
    : '';

  const restrictions = Array.isArray(plan.restrictions) ? plan.restrictions.map(restrictionText) : [];
  const noteParts = [];
  if (billing.promoNote) noteParts.push(`活动价说明：${billing.promoNote}`);
  if (billing.note) noteParts.push(billing.note);

  return {
    id: plan.id,
    providerKey: plan.provider,
    provider: providerNameOf(plan.provider, providerTable),
    planName: plan.planName,
    officialUrl: plan.officialUrl,
    sourceLabel: planSchema.PLAN_SOURCE_TYPES[plan.source] === 'official' ? '官方页' : '',
    regularText,
    regularCode,
    regularValue: billing.regularPrice === undefined ? null : billing.regularPrice,
    promoText: promo ? promo.text : UNKNOWN_NUM,
    promoCode: promo ? promo.code : '',
    promoValue: billing.promoPrice === undefined ? null : billing.promoPrice,
    periodText: BILLING_PERIOD_LABEL[billing.period] || billing.period || UNKNOWN_TEXT,
    modelsText: models || UNKNOWN_TEXT,
    quotaTypeText: QUOTA_TYPE_LABEL[quota.type] || quota.type || UNKNOWN_TEXT,
    quotaAmountText: quotaAmountText(plan) || UNKNOWN_TEXT,
    quotaDescription: quota.description || '',
    restrictions,
    unitPriceText: metric
      ? `${formatNumber(metric.price)} ${metric.currency}/亿 Token（${metric.basis === 'monthly' ? '按月' : '按年'}）`
      : UNKNOWN_NUM,
    unitPriceComputable: Boolean(metric),
    updatedText: plan.lastSeen || UNKNOWN_TEXT,
    verifiedText: plan.verifiedAt || UNKNOWN_TEXT,
    noteText: noteParts.length ? noteParts.join('；') : UNKNOWN_NUM,
    regionText: plan.region === 'cn' ? '国内' : plan.region === 'global' ? '国外' : UNKNOWN_TEXT
  };
}

function plansRows(plans, opts = {}) {
  return (plans || []).map(plan => planRowOf(plan, opts));
}

/* ------------------------------------------------------------------ */
/* 交互载荷（v2.2）：构建期算好的机器键，浏览器只负责比对与搬运          */
/* ------------------------------------------------------------------ */

/**
 * 搜索 haystack：**只由页面上真实显示的值 + 平台别名**组成。
 *
 * 为什么别名也进：读者知道的是「智谱」「灵码」「copilot」，而页面上显示的是
 * 「智谱AI」「Qoder CN」「GitHub」—— 只搜显示值会让这类查询全部落空。
 * 别名表来自 `providers.json`（同一份归一表），所以这里不会出现第二个身份空间。
 *
 * 两边的规范化都由 `plansCompare.normalize` 做（NFKC + 折叠空白 + 小写）：
 * 全角空格、大小写、中日韩兼容字符都能搜到，且匹配方式是**子串**，不做模糊。
 */
function searchHaystackOf(plan, opts = {}) {
  const table = opts.providerTable || providersLib.load().table;
  const entry = table[plan.provider] || {};
  const quota = plan.quota || {};
  const parts = [
    plan.provider,
    entry.name || '',
    ...(Array.isArray(entry.aliases) ? entry.aliases : []),
    plan.planName,
    ...(Array.isArray(plan.supportedModels) ? plan.supportedModels.map(model => model.name) : []),
    QUOTA_TYPE_LABEL[quota.type] || '',
    plan.region === 'cn' ? '国内' : plan.region === 'global' ? '国外' : ''
  ];
  return plansCompare.normalize(distinctInOrder(parts.map(part => String(part).trim())).join(' '));
}

/**
 * 载荷的一行。**只放机器键**：显示文本留在表格单元格里，不进载荷（不制造第二份可见事实）。
 *
 * `unit` 的 fail-closed 与 `planRowOf` 逐字同源：只有 `quota.type === 'tokens'`
 * **且** `derivedMetrics.nominalUnitPrice` 非空时才给出数字。数据层已经保证过这件事，
 * 这一行挡的是"数据被绕过"的那一种 —— 把 requests / 限速 / 积分显示成 Token 单价，
 * 是这一页最坏的错，而它现在就差一个 `data-*` 或一个 JSON 字段的距离。
 */
function planCompareRowOf(plan, index, opts = {}) {
  const billing = plan.billing || {};
  const quota = plan.quota || {};
  const rawMetric = plan.derivedMetrics ? plan.derivedMetrics.nominalUnitPrice : null;
  const metric = quota.type === 'tokens' ? rawMetric : null;
  const models = Array.isArray(plan.supportedModels) ? plan.supportedModels.map(model => model.name) : [];
  return {
    id: plan.id,
    index,
    provider: plan.provider,
    region: plan.region || null,
    quotaType: quota.type || null,
    period: billing.period || null,
    currency: billing.currency || null,
    regular: typeof billing.regularPrice === 'number' ? billing.regularPrice : null,
    promo: typeof billing.promoPrice === 'number' ? billing.promoPrice : null,
    unit: metric ? metric.price : null,
    unitCurrency: metric ? metric.currency : null,
    models,
    modelsMissing: !Array.isArray(plan.supportedModels),
    updated: plan.lastSeen || null,
    search: searchHaystackOf(plan, opts)
  };
}

/** 选项清单的去重（保持传入顺序 = 规范序） */
function distinctInOrder(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * 整份交互载荷。
 *
 * 三项刻意的设计：
 *   ① **选项清单只含真的命中 ≥1 行的值**（零计数的入口不渲染，与首页 `facetBarHtml` 同源）；
 *   ② 排序档位里 `unit` 只在真的存在可比行时出现 —— 本期 0 条可计算，所以它不在列表里，
 *      页面因此不会出现一个"点了什么都不会变"的排序按钮；
 *   ③ 币种顺序、模型顺序、平台顺序**全部来自规范序**（`plans.json` 的数组顺序），
 *      不用对象键序、不用 Set 迭代序 —— 产物必须逐字节可复现。
 */
function planComparePayloadOf(plans, opts = {}) {
  const table = opts.providerTable || providersLib.load().table;
  const rows = (plans || []).map((plan, index) => planCompareRowOf(plan, index, { providerTable: table }));

  const providerKeys = distinctInOrder(rows.map(row => row.provider));
  const modelKeys = distinctInOrder(rows.reduce((all, row) => all.concat(row.models), []));
  const quotaKeys = planSchema.QUOTA_TYPES.filter(type => rows.some(row => row.quotaType === type));
  const regionKeys = ['cn', 'global'].filter(region => rows.some(row => row.region === region));
  const hasMissingModels = rows.some(row => row.modelsMissing);
  const hasPromo = rows.some(row => typeof row.promo === 'number');
  const hasNoPromo = rows.some(row => typeof row.promo !== 'number');

  const priceBuckets = plansCompare.priceBucketsOf(rows, { symbols: CURRENCY_SYMBOL })
    .map(bucket => ({
      key: bucket.key, label: bucket.label, currency: bucket.currency,
      period: bucket.period, min: bucket.min, max: bucket.max
    }));

  return {
    schema: 1,
    core: plansCompare.CORE_VERSION,
    count: rows.length,
    columns: PLANS_COLUMNS.length,
    dimensions: {
      provider: providerKeys.map(key => ({ key, label: providerNameOf(key, table) })),
      model: modelKeys.map(key => ({ key, label: key }))
        .concat(hasMissingModels ? [{ key: MODEL_NONE_KEY, label: '模型未标注' }] : []),
      price: priceBuckets,
      quotaType: quotaKeys.map(key => ({ key, label: QUOTA_TYPE_LABEL[key] || key })),
      region: regionKeys.map(key => ({ key, label: key === 'cn' ? '国内' : '国外' })),
      promo: (hasPromo ? [{ key: 'yes', label: '有活动价' }] : [])
        .concat(hasNoPromo ? [{ key: 'no', label: '无活动价' }] : []),
      sort: plansCompare.sortsOf(rows).map(key => ({ key, label: SORT_LABEL[key] || key }))
    },
    rows
  };
}

/** JSON 进 `<script>` 的唯一安全写法：`<` 一律转义，杜绝 `</script` 提前收尾 */
function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function comparePayloadScriptHtml(payload) {
  return `<script type="application/json" id="plans-compare-data">${jsonForScript(payload)}</script>`;
}

/**
 * 逐行的详情模板（`<template>` 内容是**惰性**的：无 JS 时一个字节都不渲染，
 * 所以不存在"点了没反应的详情按钮"，也不需要 `hidden` 那类假隐藏）。
 *
 * 为什么详情放在这里而不是做成 `/plans/<id>/`：表里已经有 11 列事实，
 * 剩下能说的只有"这条事实是什么时候、从哪个官方页核对的"—— 全部证据都在 `plans.json` 里，
 * 撑不起 9 张独立页面（6 条连模型清单都没有）。详情只做**溯源**，不复述表格。
 */
function planDetailTemplatesHtml(plans, opts = {}) {
  const historyStore = opts.planHistoryStore || null;
  const plansById = new Map((plans || []).map(plan => [plan.id, plan]));
  const changeOpts = { providerTable: opts.providerTable || null, plansById };
  return (plans || []).map(plan => {
    const official = plan.officialUrl
      ? `<a href="${escapeHtml(plan.officialUrl)}" rel="noopener">官方定价页 ↗</a>` : '';
    const sourceLabel = planSchema.PLAN_SOURCE_TYPES[plan.source] || plan.source || UNKNOWN_TEXT;
    const quotaDescription = plan.quota && plan.quota.description
      ? `<p>${escapeHtml(plan.quota.description)}</p>` : '';
    const evidence = (plan.evidence || []).map(item => `
          <li>
            <span class="pevfield">${escapeHtml(evidenceFieldLabel(item.field))}</span>
            <q>${escapeHtml(item.quote)}</q>
            <small><a href="${escapeHtml(item.sourceUrl)}" rel="noopener">出处 ↗</a> · 抓取于 ${escapeHtml(item.capturedAt)}
              · ${escapeHtml(item.lang === 'zh' ? '中文原文' : String(item.lang || ''))}</small>
          </li>`).join('');
    // v2.3：时间线。日志缺失时如实说「没有拿到日志」，而不是「没有变化」。
    let timeline = '';
    if (historyStore) {
      timeline = planTimelineHtml(
        planHistory.timelineOf(historyStore, plan.id),
        planHistory.historyFor(historyStore, plan.id),
        { ...changeOpts, timelineLimit: opts.timelineLimit }
      );
    } else {
      timeline = `<h3>${escapeHtml(planHistory.PLAN_HISTORY_WORDING.PLAN_HISTORY_LABELS.sectionTitle)}</h3>
          <p class="pchnone">${escapeHtml(planHistory.PLAN_HISTORY_WORDING.PLAN_HISTORY_LABELS.unavailable)}</p>`;
    }
    return `<template data-detail-for="${escapeHtml(plan.id)}">
        <div class="pdetailbody">
          <dl>
            <dt>首次收录</dt><dd>${escapeHtml(plan.firstSeen || UNKNOWN_TEXT)}</dd>
            <dt>最近核对</dt><dd>${escapeHtml(plan.verifiedAt || UNKNOWN_TEXT)}</dd>
            <dt>来源类型</dt><dd>${escapeHtml(sourceLabel)}</dd>
            <dt>官方来源</dt><dd>${official}</dd>
          </dl>
          ${quotaDescription}
          ${timeline}
          <h3>官方原文引文（${(plan.evidence || []).length} 条）</h3>
          <ul class="pev">${evidence}</ul>
        </div>
      </template>`;
  }).join('\n');
}

/** 证据字段的可读名（详情里"这条引文是在证明哪个字段"） */
const EVIDENCE_FIELD_LABEL = {
  planName: '套餐名', 'billing.regularPrice': '正常价格', 'billing.promoPrice': '活动价',
  'billing.period': '计费周期', 'billing.currency': '币种', 'billing.note': '备注',
  'billing.promoNote': '活动价说明', 'quota.type': '额度类型', 'quota.amount': '额度数值',
  'quota.period': '额度周期', 'quota.description': '额度说明', supportedModels: '可用模型',
  restrictions: '限制条件', region: '地区', officialUrl: '官方地址'
};

function evidenceFieldLabel(field) {
  return EVIDENCE_FIELD_LABEL[field] || String(field || '');
}

/* ------------------------------------------------------------------ */
/* v2.3 变化展示：句子（唯一出处）+ 块 / 时间线 / /changes/ 分栏         */
/* ------------------------------------------------------------------ */

const REGION_LABEL = { cn: '国内', global: '国外' };

/** 价格文本（与表格同一条口径：未知一律 `—`，不写 0） */
function priceTextOf(value, currency) {
  if (value === null || value === undefined) return UNKNOWN_NUM;
  const symbol = CURRENCY_SYMBOL[currency] || '';
  return `${symbol}${formatNumber(value)}`;
}

/** 数值额度文本（「30 亿 Token」这种；单位取自额度类型，与表格同一份标签表） */
function quotaValueTextOf(value, type) {
  if (value === null || value === undefined) return UNKNOWN_NUM;
  const unit = QUOTA_UNIT_LABEL[type] || '';
  return `${formatNumber(value)}${unit ? ` ${unit}` : ''}`;
}

/** 模型对象 → 「名字（受限）」（role 为 included 时不加后缀，与表格同一套写法） */
function modelTextOf(model) {
  if (!model || typeof model !== 'object') return UNKNOWN_NUM;
  const role = model.role && model.role !== 'included' ? `（${MODEL_ROLE_LABEL[model.role] || model.role}）` : '';
  return `${model.name}${role}`;
}

/** 限制条件数组的差量（按 kind 三分量），供句子与自测共用 */
function restrictionDiffOf(from, to) {
  const before = new Map((Array.isArray(from) ? from : []).map(item => [item.kind, item]));
  const after = new Map((Array.isArray(to) ? to : []).map(item => [item.kind, item]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const [kind, item] of after) {
    const old = before.get(kind);
    if (!old) added++;
    else if (!planHistory.restrictionArrayEqual([old], [item])) changed++;
  }
  for (const kind of before.keys()) if (!after.has(kind)) removed++;
  return { added, removed, changed };
}

/** 事件里的一个值（`from` / `to`）→ 可读文本。plan 用来取币种 / 额度类型这些**上下文单位** */
function planValueTextOf(field, value, plan) {
  const billing = (plan && plan.billing) || {};
  const quota = (plan && plan.quota) || {};
  switch (field) {
    case 'billing.regularPrice':
    case 'billing.promoPrice':
      return priceTextOf(value, billing.currency);
    case 'billing.currency':
      return value ? String(value) : UNKNOWN_TEXT;
    case 'quota.type':
      return value ? (QUOTA_TYPE_LABEL[value] || String(value)) : UNKNOWN_TEXT;
    case 'quota.amount':
      return quotaValueTextOf(value, quota.type);
    case 'quota.period':
      return value ? (QUOTA_PERIOD_LABEL[value] || String(value)) : UNKNOWN_TEXT;
    case 'quota.description':
      return value ? String(value) : UNKNOWN_TEXT;
    case 'supportedModels':
      return modelTextOf(value);
    case 'restrictions':
      return Array.isArray(value) ? `${value.length} 项` : UNKNOWN_NUM;
    case 'region':
      return value ? (REGION_LABEL[value] || String(value)) : UNKNOWN_TEXT;
    case 'officialUrl':
    case 'sourceUrl':
    case 'source':
      return value ? String(value) : UNKNOWN_TEXT;
    default:
      if (value === null || value === undefined) return UNKNOWN_NUM;
      return typeof value === 'string' ? value : JSON.stringify(value);
  }
}

/**
 * 一条变化事件 → 「变了什么」的句子。**唯一出处**：页面、时间线、`/changes/` 与订阅源共用。
 *
 * 措辞纪律：只描述观测到的一对值（`原 → 新`），不写"涨价了"/"变划算了"这类判断，
 * 也不写任何结论性词汇（`FORBIDDEN_CLAIM_WORDS` 对事件文本同样生效）。
 */
function planChangeTextOf(item, opts = {}) {
  const plan = (opts.plansById && opts.plansById.get(item.planId)) || null;
  const field = item.field || '';
  const T = planHistory.PLAN_HISTORY_WORDING;
  const fieldLabel = T.PLAN_HISTORY_FIELD_LABELS[field] || field || '';
  const reason = T.PLAN_HISTORY_END_REASONS[item.reason] || item.reason || '';
  switch (item.type) {
    case 'created':
      return '首次收录';
    case 'price_changed':
      return `正常价格 ${planValueTextOf('billing.regularPrice', item.from, plan)} → ${planValueTextOf('billing.regularPrice', item.to, plan)}`;
    case 'promo_started':
      return `活动价开始：${planValueTextOf('billing.promoPrice', item.to, plan)}`;
    case 'promo_ended':
      return `活动价结束（此前 ${planValueTextOf('billing.promoPrice', item.from, plan)}）`;
    case 'promo_changed':
      return `活动价 ${planValueTextOf('billing.promoPrice', item.from, plan)} → ${planValueTextOf('billing.promoPrice', item.to, plan)}`;
    case 'billing_changed':
      return `币种 ${planValueTextOf('billing.currency', item.from, plan)} → ${planValueTextOf('billing.currency', item.to, plan)}`;
    case 'quota_increased':
    case 'quota_decreased':
      return `原始额度 ${planValueTextOf('quota.amount', item.from, plan)} → ${planValueTextOf('quota.amount', item.to, plan)}`;
    case 'quota_changed':
      if (field === 'quota.type') return `额度类型 ${planValueTextOf('quota.type', item.from, plan)} → ${planValueTextOf('quota.type', item.to, plan)}`;
      if (field === 'quota.period') return `额度刷新周期 ${planValueTextOf('quota.period', item.from, plan)} → ${planValueTextOf('quota.period', item.to, plan)}`;
      if (field === 'quota.description') return '额度说明变更';
      return `原始额度 ${planValueTextOf('quota.amount', item.from, plan)} → ${planValueTextOf('quota.amount', item.to, plan)}`;
    case 'model_added':
      return `新增模型 ${modelTextOf(item.to)}`;
    case 'model_removed':
      return `移除模型 ${modelTextOf(item.from)}`;
    case 'model_changed':
      return `模型权限 ${modelTextOf(item.from)} → ${modelTextOf(item.to)}`;
    case 'restriction_changed': {
      const diff = restrictionDiffOf(item.from, item.to);
      const parts = [];
      if (diff.added) parts.push(`新增 ${diff.added} 项`);
      if (diff.removed) parts.push(`移除 ${diff.removed} 项`);
      if (diff.changed) parts.push(`变更 ${diff.changed} 项`);
      return `限制条件更新（${parts.length ? parts.join(' · ') : '说明变更'}）`;
    }
    case 'availability_changed':
      return `销售地区 ${planValueTextOf('region', item.from, plan)} → ${planValueTextOf('region', item.to, plan)}`;
    case 'updated':
      return `记录信息更新（${fieldLabel}）`;
    case 'ended':
      return `不再收录（${reason}）`;
    case 'restored':
      return '重新出现';
    default:
      return `${T.PLAN_HISTORY_TYPES[item.type] || item.type}${fieldLabel ? `（${fieldLabel}）` : ''}`;
  }
}

/** 一条变化事件 → 「谁 + 变了什么」的一句纯文本（订阅源与 `title` 属性共用） */
function planChangeSentenceOf(item, opts = {}) {
  const provider = providerNameOf(item.vendor, opts.providerTable);
  const who = item.titled ? `${provider ? `${provider} ` : ''}${item.title}` : '（已移除的套餐，无标题快照）';
  return `${who} · ${planChangeTextOf(item, opts)}`;
}

/**
 * 一条套餐变化 → 一行 HTML。
 *
 * `opts.planHref(item)` 决定"谁变了"那段文字链到哪里：
 *   · 缺省是**页内锚点** `#plan-<id>`（`/plans/coding/` 的表格行就带这个 id，落点在同一个页面里）；
 *   · 在**别的页面**上复用这一块时必须传它 —— `/changes/` 与 `/plans/` 的资料入口上并没有
 *     那些表格行，页内锚点会变成 19 条点不动的死链（真浏览器验收实测：`/changes/` 14 条 +
 *     资料入口 5 条），而这在页面上看不出来，只有"锚点是否有落点"这条断言能抓到。
 */
function planChangeItemHtml(item, opts = {}) {
  const T = planHistory.PLAN_HISTORY_WORDING;
  const provider = providerNameOf(item.vendor, opts.providerTable);
  const who = item.titled ? `${provider ? `${provider} ` : ''}${item.title}` : '（已移除的套餐，无标题快照）';
  const typeLabel = T.PLAN_HISTORY_TYPES[item.type] || item.type;
  const origin = item.origin === 'derived' ? `<span class="pchgorigin">（由本站规则推导）</span>` : '';
  const planHref = typeof opts.planHref === 'function'
    ? opts.planHref(item)
    : (item.planId ? `#plan-${item.planId}` : null);
  const link = planHref
    ? `<a class="pchgwho" href="${escapeHtml(planHref)}">${escapeHtml(who)}</a>`
    : `<span class="pchgwho">${escapeHtml(who)}</span>`;
  return `<span class="pchgwhen"><time datetime="${escapeHtml(item.at)}">${escapeHtml(item.at)}</time></span>`
    + `${link}<span class="pchgtype">${escapeHtml(typeLabel)}</span>`
    + `<span class="pchgwhat">${escapeHtml(planChangeTextOf(item, opts))}</span>${origin}`;
}

/**
 * `/plans/coding/` 顶部的「最近变化」块。
 *
 * **必须放在 `#plans-compare` 之外**：那个容器的 innerHTML 会被 `plans-compare.js` 整块替换，
 * 静态内容放进去等于被抹掉（无 JS 的读者会看到空块）。
 */
function planChangesBlockHtml(radar, opts = {}) {
  const W = planChanges.PLAN_CHANGES_WORDING.PLAN_CHANGES_LABELS;
  const prefix = opts.prefix || '';
  const items = radar && radar.availability === 'ok' ? radar.home.items : [];
  const since = radar && radar.startedAt
    ? W.since.replace('{date}', radar.startedAt)
    : '';

  const footer = `        <p class="pchnote">${since ? `${escapeHtml(since)} · ` : ''}<a href="${escapeHtml(`${prefix}changes/#plans`)}">${escapeHtml(W.allChanges)} →</a></p>\n`;
  let body;
  if (!radar || radar.availability !== 'ok') {
    body = `        <p class="pchnone">${escapeHtml(W.unavailable)}</p>\n${footer}`;
  } else if (!items.length) {
    body = `        <p class="pchnone">${escapeHtml(W.empty)}</p>\n${footer}`;
  } else {
    body = `        <ul class="pchglist">\n`
      + items.map(item => `          <li>${planChangeItemHtml(item, opts)}</li>`).join('\n')
      + `\n        </ul>\n`
      + (radar.home.truncated > 0
        ? `        <p class="pchnote">${escapeHtml(W.homeMore.replace('{n}', String(radar.home.truncated)))}</p>\n` : '')
      + footer;
  }

  return `      <section class="pchanges" id="plan-changes" aria-labelledby="plan-changes-h">
        <h2 class="ph2" id="plan-changes-h">${escapeHtml(W.recentTitle)}</h2>
${body}      </section>
`;
}

/** `/changes/` 里的「套餐变化」分栏（四栏 + 其他变化说明） */
function planChangesPageBlockHtml(radar, opts = {}) {
  const W = planChanges.PLAN_CHANGES_WORDING.PLAN_CHANGES_LABELS;
  const S = planChanges.PLAN_CHANGES_WORDING.PLAN_CHANGES_SECTION;
  const prefix = opts.prefix || '';
  const since = radar && radar.startedAt ? W.since.replace('{date}', radar.startedAt) : '';

  if (!radar || radar.availability !== 'ok') {
    return `<section class="chgsec pchanges" id="plans">
        <h2>${escapeHtml(W.sectionTitle)}</h2>
        ${noteIn(opts)({ kind: 'page-note-warn', slot: 'main-snote', classes: 'snote chgwarn', declaredBy: NOTES_DECLARED_BY }, `<p class="snote chgwarn">${escapeHtml(W.unavailable)}</p>`)}
      </section>
`;
  }

  const sections = planChanges.PLAN_CHANGES_SECTION_ORDER.map(key => {
    const section = radar.sections[key];
    const items = section.items;
    // 这一块渲染在 **/changes/** 上，页面上没有套餐表格行 —— 链接必须跨页落到
    // `/plans/coding/#plan-<id>`（这是本函数与 `/plans/coding/` 顶部那一块的唯一差别）。
    const itemOpts = {
      ...opts,
      planHref: item => (item.planId ? `${prefix}plans/coding/#plan-${item.planId}` : null)
    };
    const list = items.length
      ? `<ul class="chglist">
${items.map(item => `          <li>${planChangeItemHtml(item, itemOpts)}</li>`).join('\n')}
        </ul>`
      : `${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(W.emptySection[key])}</p>`)}`;
    const truncated = section.truncated > 0
      ? `\n        ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(W.more.replace('{n}', String(section.truncated)))}</p>`)}` : '';
    return `      <div class="chgsub">
        <h3>${escapeHtml(S[key])}（${radar.totals[key]}）</h3>
${list}${truncated}
      </div>`;
  }).join('\n');

  const metaNote = radar.totals.meta > 0
    ? `      ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">另有 ${radar.totals.meta} 条只影响记录元信息的变化（官方定价页 / 来源类型 / 来源地址），`
      + `不计入上面的分栏；它们仍出现在各条套餐的变更记录里。</p>`)}\n`
    : '';

  return `<section class="chgsec pchanges" id="plans">
      <h2>${escapeHtml(W.sectionTitle)}</h2>
      ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(W.plansSource.replace('{date}', radar.startedAt || '未知'))}</p>`)}
${sections}
${metaNote}      ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(W.disclaimer)}</p>`)}
    </section>
`;
}

/**
 * 行内详情里的时间线（`<template>` 内，惰性：无 JS 时不渲染一个字节）。
 *
 * `view` 是 `planHistory.historyFor()` 的有界视图；`events` 是 `timelineOf()` 的完整列表
 * （用于算「另有 N 条更早」）。两者都不为 null 时才会被调用。
 */
function planTimelineHtml(events, view, opts = {}) {
  const L = planHistory.PLAN_HISTORY_WORDING.PLAN_HISTORY_LABELS;
  if (!view || !view.total) {
    return `<h3>${escapeHtml(L.sectionTitle)}</h3>
          <p class="pchnone">${escapeHtml(L.empty)}${view && view.startedAt ? `（${escapeHtml(L.since.replace('{date}', view.startedAt))}）` : ''}</p>`;
  }
  const shownLimit = opts.timelineLimit || 10;
  const list = (events || []).slice(0, shownLimit);
  const rest = Math.max(0, (events || []).length - list.length);
  const rows = list.map(event => `            <li><span class="pchgwhen"><time datetime="${escapeHtml(event.at)}">${escapeHtml(event.at)}</time></span>
              <span class="pchgwhat">${escapeHtml(planChangeTextOf({
    planId: event.planId, type: event.type, field: event.field,
    from: 'from' in event ? event.from : null, to: 'to' in event ? event.to : null,
    reason: event.reason, origin: event.origin
  }, opts))}</span></li>`).join('\n');
  return `<h3>${escapeHtml(L.sectionTitle)}（${view.total} 条）</h3>
          <ul class="pchglist pchgtl">
${rows}
          </ul>${rest > 0 ? `
          <p class="pchnote">${escapeHtml(L.more.replace('{n}', String(rest)))}</p>` : ''}`;
}

/* ------------------------------------------------------------------ */
/* 正文 HTML                                                            */
/* ------------------------------------------------------------------ */

function renderRow(row) {
  const restrictions = row.restrictions.length
    ? `<small>${escapeHtml(row.restrictions.join(' · '))}</small>`
    : '';
  const quotaDescription = row.quotaDescription
    ? `<small>${escapeHtml(row.quotaDescription)}</small>`
    : '';
  const official = row.officialUrl
    ? `<small><a href="${escapeHtml(row.officialUrl)}" rel="noopener">官方定价页 ↗</a>`
      + `<span class="ptag">${escapeHtml(row.sourceLabel)}</span></small>`
    : '';
  const unitPrice = row.unitPriceComputable
    ? `<b>${escapeHtml(row.unitPriceText)}</b>`
    : `<span class="pnone" title="不可比较：额度类型或口径不满足计算条件">${escapeHtml(row.unitPriceText)}</span>`;

  return `
        <tr id="plan-${escapeHtml(row.id)}" data-item="${escapeHtml(row.id)}">
          <th scope="row">${escapeHtml(row.provider)}<small>${escapeHtml(row.regionText)}</small></th>
          <td>${escapeHtml(row.planName)}${official}</td>
          <td class="num">${escapeHtml(row.regularText)}${
  row.regularCode ? `<small>${escapeHtml(row.regularCode)}</small>` : ''}</td>
          <td class="num">${escapeHtml(row.promoText)}${
  row.promoCode ? `<small>${escapeHtml(row.promoCode)}</small>` : ''}</td>
          <td>${escapeHtml(row.periodText)}</td>
          <td>${escapeHtml(row.modelsText)}</td>
          <td>${escapeHtml(row.quotaTypeText)}</td>
          <td>${escapeHtml(row.quotaAmountText)}${quotaDescription}${restrictions}</td>
          <td class="num">${unitPrice}</td>
          <td><time datetime="${escapeHtml(row.updatedText)}">${escapeHtml(row.updatedText)}</time>
            ${row.verifiedText && row.verifiedText !== row.updatedText
    ? `<small>核对 ${escapeHtml(row.verifiedText)}</small>` : ''}</td>
          <td>${escapeHtml(row.noteText)}</td>
        </tr>`;
}

/* ------------------------------------------------------------------ */
/* v2.4 优惠 ↔ 套餐：套餐页那一块（纯静态，无 JS 也读得到）              */
/* ------------------------------------------------------------------ */

/** 一条「当前优惠」：`当前优惠：<文案>[（限符合条件者）][ · 截止 <日期>]` */
function planDealCurrentTextOf(item) {
  const line = item.promoLine ? item.promoLine : PLAN_DEALS_WORDING.fallback;
  const head = `${PLAN_DEALS_WORDING.current}${line}${item.eligible ? PLAN_DEALS_WORDING.eligible : ''}`;
  return item.deadlineText ? `${head} · ${item.deadlineText}` : head;
}

/** 一条「历史优惠」：`历史优惠：<标题>（已结束 <日期>）`（日期没有就不写日期，不编一个） */
function planDealHistoryTextOf(item) {
  const title = item.dealTitle || item.title || item.dealId;
  const at = item.endedAt ? ` ${item.endedAt}` : '';
  return `${PLAN_DEALS_WORDING.historical}${title}（${PLAN_DEALS_WORDING.ended}${at}）`;
}

function planDealHrefOf(dealId, prefix) {
  return `${prefix}deal/${encodeURIComponent(dealId)}/`;
}

/**
 * 一行 = 一条套餐。**当前优惠与历史优惠用两个不同的 class**：
 * `class="pdgo"`（当前）与 `class="pdgo pdgo-hist"`（历史）在断言里是两件事 ——
 * 「已结束的优惠被当成当前优惠」这条 Tooth Test 靠的就是这个结构差别，而不是靠读文案。
 */
function planDealsRowHtml(row, opts = {}) {
  const prefix = opts.prefix || '';
  const who = `<a class="pdwho" href="#plan-${escapeHtml(row.planId)}">${escapeHtml(row.title || row.planId)}</a>`;
  const parts = [];
  for (const item of row.current) {
    const savings = item.savingsText ? `<span class="pdsave">${escapeHtml(item.savingsText)}</span>` : '';
    parts.push(`<span class="pdcur">${escapeHtml(planDealCurrentTextOf(item))}</span>${savings}` +
      `<a class="pdgo" href="${escapeHtml(planDealHrefOf(item.dealId, prefix))}">${escapeHtml(PLAN_DEALS_WORDING.viewDeal)}</a>`);
  }
  if (!row.current.length) {
    parts.push(`<span class="pdnone">${escapeHtml(PLAN_DEALS_WORDING.none)}</span>`);
  }
  for (const item of row.history) {
    // 退役记录（优惠记录已被采集层下架）不给链接：那是一个不存在的页面，给了就是死链。
    const link = item.retired
      ? ''
      : `<a class="pdgo pdgo-hist" href="${escapeHtml(planDealHrefOf(item.dealId, prefix))}">${escapeHtml(PLAN_DEALS_WORDING.viewDeal)}</a>`;
    parts.push(`<span class="pdhist">${escapeHtml(planDealHistoryTextOf(item))}</span>${link}`);
  }
  const empty = !row.current.length && !row.history.length ? ' pdempty' : '';
  return `          <li id="plan-deals-${escapeHtml(row.planId)}" class="pdrow${empty}">${who}${parts.join('')}</li>`;
}

/**
 * 整块。放在表格之后、`#plans-compare` 之外 —— 因此 JS 替换筛选容器时不会把它一起抹掉。
 *
 * v2.5：视图里的行现在同时含 Coding 套餐与 API 计费记录（`planDealsView()` 合并了两个 store），
 * 所以这里按 `opts.kind`（缺省 `coding`）**只渲染属于本页的那一半** ——
 * 不筛的话，套餐页会多出 7 行 API 记录，而 `assertPlanDealsBlock` 会当场报行数不符。
 *
 * @param {object} view `lib/deal-plan-links.js` 的 `planDealsView()` 产物
 */
function planDealsBlockHtml(view, opts = {}) {
  if (!view || !Array.isArray(view.rows)) return '';
  const prefix = opts.prefix || '';
  const kind = opts.kind || 'coding';
  const home = opts.home || PLANS_HOME_HREF;
  const note = escapeHtml(PLAN_DEALS_WORDING.note).replace(
    'deal-plan-links.json',
    `<a href="${escapeHtml(`${home}deal-plan-links.json`)}">deal-plan-links.json</a>`
  );
  const rows = view.rows.filter(row => (row.planKind || 'coding') === kind);
  const body = rows.map(row => planDealsRowHtml(row, { prefix })).join('\n');
  const unit = opts.unit || '条套餐';
  const withCurrent = rows.filter(row => row.current.length).length;
  const history = rows.reduce((sum, row) => sum + row.history.length, 0);
  const sum = `共 ${rows.length} ${unit} · 当前有优惠 ${withCurrent} 条` +
    ` · 历史关联 ${history} 条 · 数据基准日 ${view.asOf || UNKNOWN_TEXT}`;
  return `      <section class="pplandeals" id="plan-deals">
        <h2 class="ph2">${escapeHtml(opts.heading || PLAN_DEALS_WORDING.heading)}</h2>
        ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${note}</p>`)}
        <ul class="pdlist">
${body}
        </ul>
        <p class="pdsum">${escapeHtml(sum)}</p>
      </section>`;
}

/** 取出 `#plan-deals` 那一段（断言用；取不到返回空串） */
function planDealsBlockOf(text) {
  const match = String(text || '').match(/<section class="pplandeals" id="plan-deals"[\s\S]*?<\/section>/);
  return match ? match[0] : '';
}

/** 取出某条套餐的那一行 */
function planDealsRowOf(block, planId) {
  const text = String(block || '');
  const start = text.indexOf(`<li id="plan-deals-${planId}"`);
  if (start < 0) return '';
  const next = text.indexOf('<li id="plan-deals-', start + 1);
  return next < 0 ? text.slice(start) : text.slice(start, next);
}

/**
 * v2.4 诚实性断言：块里的每一句话都必须与视图逐条对得上，且
 * **已结束的关联一个都不许出现在「当前优惠」里**（Tooth Test #4 的牙）。
 *
 * @param {string} html 整页或正文
 * @param {object|null} view `planDealsView()` 产物；为 null 时不检查（该页面没有传视图）
 */
function assertPlanDealsBlock(html, view, opts = {}) {
  const problems = [];
  if (!view || !Array.isArray(view.rows)) return problems;
  const text = markupOnly(String(html));
  const block = planDealsBlockOf(text);
  if (!block) {
    problems.push('缺少「各套餐当前优惠」块（#plan-deals）');
    return problems;
  }
  const prefix = opts.prefix || PLANS_HOME_HREF;
  const kind = opts.kind || 'coding';
  // v2.5：视图含两类记录，这一页只认自己那一半（与 `planDealsBlockHtml` 的筛选同源）。
  const rows = view.rows.filter(row => (row.planKind || 'coding') === kind);
  const unit = opts.unit || '条套餐';
  const ids = [...block.matchAll(/<li id="plan-deals-([0-9a-f]{12})"/g)].map(match => match[1]);
  if (ids.length !== rows.length) {
    problems.push(`#plan-deals 的行数 ${ids.length} ≠ ${unit.replace('条', '')}数 ${rows.length}`);
  } else if (JSON.stringify(ids) !== JSON.stringify(rows.map(row => row.planId))) {
    problems.push('#plan-deals 的记录顺序与表内规范序不一致');
  }

  const currentDealIds = new Set();
  for (const row of rows) {
    const chunk = planDealsRowOf(block, row.planId);
    if (!chunk) { problems.push(`#plan-deals 缺少记录 ${row.planId} 的一行`); continue; }
    if (!chunk.includes(`href="#plan-${row.planId}"`)) {
      problems.push(`${row.planId}: 优惠行没有链回记录行的锚点 #plan-${row.planId}`);
    }
    const hasNone = chunk.includes('<span class="pdnone">');
    if (!row.current.length && !hasNone) {
      problems.push(`${row.planId}: 没有当前优惠时必须写「${PLAN_DEALS_WORDING.none}」`);
    }
    if (row.current.length && hasNone) {
      problems.push(`${row.planId}: 有当前优惠却同时写着「${PLAN_DEALS_WORDING.none}」`);
    }
    for (const item of row.current) {
      currentDealIds.add(item.dealId);
      const line = planDealCurrentTextOf(item);
      if (!chunk.includes(escapeHtml(line))) problems.push(`${row.planId}: 当前优惠缺一句「${line}」`);
      if (item.savingsText && !chunk.includes(escapeHtml(item.savingsText))) {
        problems.push(`${row.planId}: 缺少节省金额「${item.savingsText}」`);
      }
      if (!chunk.includes(`class="pdgo" href="${planDealHrefOf(item.dealId, prefix)}"`)) {
        problems.push(`${row.planId}: 当前优惠缺少「${PLAN_DEALS_WORDING.viewDeal}」链接（前缀应为 ${prefix}）`);
      }
    }
    for (const item of row.history) {
      const line = planDealHistoryTextOf(item);
      if (!chunk.includes(escapeHtml(line))) problems.push(`${row.planId}: 历史优惠缺一句「${line}」`);
    }
  }

  // Tooth Test #4：`class="pdgo"`（当前优惠专用）只能挂在「当前」的关联上
  const linkedIds = [...block.matchAll(/<a class="pdgo" href="[^"]*?deal\/([0-9a-f]{12})\//g)].map(match => match[1]);
  const wrong = [...new Set(linkedIds.filter(id => !currentDealIds.has(id)))];
  if (wrong.length) {
    problems.push(`#plan-deals 把已结束的关联 ${wrong.join('、')} 当成当前优惠（给了「${PLAN_DEALS_WORDING.viewDeal}」链接）`);
  }

  const withCurrent = rows.filter(row => row.current.length).length;
  const history = rows.reduce((sum, row) => sum + row.history.length, 0);
  const sum = `共 ${rows.length} ${unit} · 当前有优惠 ${withCurrent} 条 · 历史关联 ${history} 条`;
  if (!block.includes(escapeHtml(sum))) {
    problems.push(`#plan-deals 的计数行与实际不一致（应为「${sum}」）`);
  }
  return problems;
}

/**
 * `<main>` 里的全部内容（含 `<h1>`）。面包屑、页头、页脚、`<head>` 由构建期套壳。
 *
 * @param {object[]} plans plans.json 的记录
 * @param {{providerTable?:object, dealLinks?:object}} [opts]
 */
function plansPageBody(plans, opts = {}) {
  const providerTable = opts.providerTable || providersLib.load().table;
  const rows = plansRows(plans, opts);
  const home = opts.homeHref || PLANS_HOME_HREF;
  const computable = rows.filter(row => row.unitPriceComputable).length;
  const withPromo = rows.filter(row => row.promoText !== UNKNOWN_NUM).length;
  const providerCount = new Set(rows.map(row => row.providerKey)).size;
  const payload = planComparePayloadOf(plans, { providerTable });
  /** 排序档位里没有 `unit` = 本期一条都不可比较 —— 那句话必须出现在页面上，而不是靠读者猜 */
  const unitSortable = payload.dimensions.sort.some(item => item.key === 'unit');
  // v2.3：最近变化块。**放在 #plans-compare 之外**（那个容器的 innerHTML 会被 JS 整块替换）。
  const planChangesBlock = opts.planChanges
    ? planChangesBlockHtml(opts.planChanges, { prefix: opts.prefix || '', providerTable, plansById: new Map(plans.map(p => [p.id, p])), note: opts.note })
    : '';
  // v2.4：优惠 ↔ 套餐。同样在 #plans-compare 之外、纯静态（无 JS 时也读得到）。
  // 视图由 `lib/deal-plan-links.js` 算好传进来（判据只有一处），这里只排版。
  const dealLinks = opts.dealLinks || null;
  const dealLinksBlock = dealLinks ? `\n${planDealsBlockHtml(dealLinks, { prefix: opts.prefix || '', home, note: opts.note })}` : '';
  const dealLinksMeta = dealLinks ? ` · 当前有优惠 ${dealLinks.counts.withCurrent} 条` : '';

  return `      <nav class="crumb" aria-label="面包屑"><a href="${home}">首页</a> › <span>${escapeHtml(PLANS_HEADING)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(PLANS_HEADING)}</h1>
        <span class="meta">共 ${rows.length} 条套餐 · ${providerCount} 个平台 · 国内 ${rows.filter(r => r.regionText === '国内').length} 条${dealLinksMeta}</span>
      </div>

      ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(PLANS_DESCRIPTION)}</p>`)}

${planChangesBlock}
      ${noteIn(opts)({ kind: 'noscript-hint', slot: 'main-snote', classes: 'snote pnoscript', declaredBy: NOTES_DECLARED_BY }, `<p class="snote pnoscript"><noscript>筛选、搜索与排序需要 JavaScript；未启用时，下面这张表就是全部 ${rows.length} 条套餐。</noscript></p>`)}

      <!--
        控件容器：**静态 HTML 里是空的**。整块由 scripts/lib/plans-compare.js 建出来，
        因此无 JS 时页面上一个"点了没反应"的筛选控件都不存在（与首页 G11 同一条纪律）。
        数据载荷与逐行详情模板都在表格下面，同样只在有 JS 时才被读走。
      -->
      <div class="pctl" id="plans-compare" role="group" aria-label="筛选与排序"></div>
${unitSortable ? '' : `      ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(NO_UNIT_SORT_NOTE)}</p>`)}\n`}
      <div class="ptable-wrap">
      <table class="ptable">
        <caption>共 ${rows.length} 条套餐 · 有活动价 ${withPromo} 条 · 名义 Token 单价可计算 ${computable} 条
          （算不出的显示「${UNKNOWN_NUM}」，不填 0、不参与排序）</caption>
        <thead>
          <tr>
            ${PLANS_COLUMNS.map((label, index) => index === 2 || index === 3 || index === 8
    ? `<th scope="col" class="num">${escapeHtml(label)}</th>`
    : `<th scope="col">${escapeHtml(label)}</th>`).join('\n            ')}
          </tr>
        </thead>
        <tbody>${rows.map(renderRow).join('')}
        </tbody>
      </table>
      </div>
${dealLinksBlock}
      ${comparePayloadScriptHtml(payload)}
      <div class="ptpl" aria-hidden="true">
${planDetailTemplatesHtml(plans, { providerTable, planHistoryStore: opts.planHistoryStore, timelineLimit: opts.timelineLimit })}
      </div>

      <h2 class="ph2">口径与说明</h2>
      <ul class="plist">
        ${PLANS_NOTES.map(note => `<li>${renderNote(note)}</li>`).join('\n        ')}
      </ul>

      ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote" style="margin-top: var(--s3)">
        名义 Token 单价的口径：${escapeHtml(planSchema.PLAN_WORDING.nominalUnitPriceNote)}
        数据集与判据：<a href="${home}plans.json">plans.json</a>（每条套餐的原始字段，含官方原文引文）。
        这一页只做收录与整理，价格、额度与条款以各平台官方页面为准。
      </p>`)}`;
}

/**
 * 口径文案里允许两处极小的强调标记（`**…**` → `<b>`）。
 * 只支持这一种，且**只在我们自己的文案上**使用 —— 数据里的文本一律走 escapeHtml。
 */
function renderNote(text) {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

/** JSON-LD：#1 CollectionPage、#2 BreadcrumbList、#3 ItemList（一段一个对象） */
function plansJsonLd(plans, { siteUrl, providerTable = null } = {}) {
  const pageUrl = `${siteUrl}${PLANS_ROUTE}`;
  const rows = plansRows(plans, { providerTable });
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${PLANS_HEADING} · AI 优惠聚合器`,
      description: PLANS_DESCRIPTION,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: 'AI 优惠聚合器', url: siteUrl }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: PLANS_HEADING, item: pageUrl }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: PLANS_HEADING,
      // ItemList 指向**各自的官方定价页**（与首页同一条口径：主链接给到厂商官方页）。
      // 因此 seo.js 的 itemlist-members 对不上（它按站内 deal 路由判成员），
      // 描述符里显式关掉那一条 —— 不去伪造一个本站不存在的详情页。
      numberOfItems: rows.length,
      itemListElement: rows.map((row, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: row.officialUrl,
        name: `${row.provider} ${row.planName}`
      }))
    }
  ];
}

/* ------------------------------------------------------------------ */
/* 诚实性断言（构建期与自测**共用同一个函数**）                          */
/* ------------------------------------------------------------------ */

/** 取每一行的 HTML（`data-item` 所在行到下一行之间），用于逐行断言 */
function rowHtmlById(html) {
  const map = new Map();
  const text = String(html);
  const rowRe = /<tr[^>]*\bdata-item="([^"]+)"[^>]*>/g;
  const marks = [];
  let match;
  while ((match = rowRe.exec(text)) !== null) marks.push({ id: match[1], start: match.index });
  marks.forEach((mark, index) => {
    const end = index + 1 < marks.length ? marks[index + 1].start : text.length;
    map.set(mark.id, text.slice(mark.start, end));
  });
  return map;
}

/** 只取单元格里 `<small>` 之前的那段文本（价格单元格把币种放在 `<small>` 里） */
function cellText(markup) {
  return String(markup).split('<small>')[0].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * 只保留**标记**：摘掉 `<script>` / `<style>` / 注释。
 *
 * 为什么断言必须走这一条：`assertPageHonesty` 现在既被 `plansPageBody()` 的输出调用，
 * 也被构建期**从磁盘回读整页**调用 —— 而整页里内联了 `plans-compare.js` 的源码，
 * 源码本身含有 `'<button'`、`data-facet` 这些字面量。不摘脚本就会报出
 * 「预渲染 HTML 里有死控件」这类**假红**（这个项目在 seo.js 里已经吃过一次同款教训）。
 */
function markupOnly(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

/** 从页面里取交互载荷（`<script type="application/json" id="plans-compare-data">`） */
function comparePayloadOf(html) {
  const match = String(html || '').match(
    /<script type="application\/json" id="plans-compare-data">([\s\S]*?)<\/script>/
  );
  if (!match) return { payload: null, error: '找不到数据载荷 #plans-compare-data' };
  try {
    return { payload: JSON.parse(match[1].replace(/\\u003c/g, '<')), error: null };
  } catch (error) {
    return { payload: null, error: `数据载荷不是合法 JSON：${error.message}` };
  }
}

/**
 * 交互载荷的诚实性：**载荷里的每一个键都必须能在 `plans.json` 里找到出处**。
 *
 * 为什么值得单独一套断言：这一层是"页面的第二个事实来源"。表格单元格已经逐格对过账，
 * 而筛选 / 排序读的是载荷 —— 载荷错了，读者看到的子集就是错的，而**表格看上去完全正常**。
 * 所以这里对的是同一份真值（`plans.json`），并且 `unit` 走**和渲染层同一条 fail-closed**。
 */
function assertCompareHonesty(html, plans, opts = {}) {
  const problems = [];
  const raw = String(html || '');
  const markup = markupOnly(raw);
  const { payload, error } = comparePayloadOf(raw);
  if (!payload) { problems.push(error); return problems; }

  const rows = plansRows(plans, opts);
  const planById = new Map((plans || []).map(plan => [plan.id, plan]));
  const payloadById = new Map();

  // ① 行数三处对账：载荷 / 表格 / plans.json
  if (!Array.isArray(payload.rows)) { problems.push('载荷缺少 rows 数组'); return problems; }
  for (const row of payload.rows) {
    if (payloadById.has(row.id)) problems.push(`载荷里 ${row.id} 出现两次`);
    payloadById.set(row.id, row);
  }
  const domRows = rowHtmlById(markup);
  if (payload.rows.length !== rows.length) problems.push(`载荷 ${payload.rows.length} 行 ≠ plans.json ${rows.length} 条`);
  if (domRows.size !== rows.length) problems.push(`表格 ${domRows.size} 行 ≠ plans.json ${rows.length} 条`);
  if (payload.count !== rows.length) problems.push(`载荷 count=${payload.count} ≠ plans.json ${rows.length} 条`);
  if (payload.columns !== PLANS_COLUMNS.length) problems.push(`载荷 columns=${payload.columns} ≠ 列模型 ${PLANS_COLUMNS.length}`);
  const thCount = (markup.match(/<th scope="col"/g) || []).length;
  if (thCount !== PLANS_COLUMNS.length) {
    problems.push(`表头 ${thCount} 列 ≠ 列模型 ${PLANS_COLUMNS.length}（详情行的 colspan 取自载荷 columns，两处会静默错位）`);
  }

  // ② 逐行逐字段对账
  for (const row of rows) {
    const plan = planById.get(row.id);
    const item = payloadById.get(row.id);
    if (!item) { problems.push(`载荷缺少 ${row.id}（${row.provider} ${row.planName}）`); continue; }
    const billing = plan.billing || {};
    const quota = plan.quota || {};
    const expect = {
      provider: plan.provider,
      region: plan.region || null,
      quotaType: quota.type || null,
      period: billing.period || null,
      currency: billing.currency || null,
      regular: typeof billing.regularPrice === 'number' ? billing.regularPrice : null,
      promo: typeof billing.promoPrice === 'number' ? billing.promoPrice : null,
      updated: plan.lastSeen || null
    };
    for (const [field, value] of Object.entries(expect)) {
      if (item[field] !== value) {
        problems.push(`${row.planName}: 载荷 ${field}=${JSON.stringify(item[field])} ≠ plans.json ${JSON.stringify(value)}`);
      }
    }
    const modelNames = Array.isArray(plan.supportedModels) ? plan.supportedModels.map(model => model.name) : [];
    if (JSON.stringify(item.models) !== JSON.stringify(modelNames)) {
      problems.push(`${row.planName}: 载荷模型清单与 plans.json 不一致`);
    }
    if (item.modelsMissing !== !Array.isArray(plan.supportedModels)) {
      problems.push(`${row.planName}: 载荷 modelsMissing 与 plans.json 不一致`);
    }

    // ③ 单价的 fail-closed：非 tokens 额度**不许**出现数字，tokens 的必须等于派生值
    const metric = quota.type === 'tokens' && plan.derivedMetrics ? plan.derivedMetrics.nominalUnitPrice : null;
    if (metric) {
      if (item.unit !== metric.price || item.unitCurrency !== metric.currency) {
        problems.push(`${row.planName}: 载荷单价 ${item.unit}/${item.unitCurrency} ≠ 派生值 ${metric.price}/${metric.currency}`);
      }
    } else if (item.unit !== null) {
      problems.push(`${row.planName}: 额度类型 ${quota.type} 不可比较，载荷却带了单价 ${item.unit}`);
    }
    if (item.index !== rows.indexOf(row)) problems.push(`${row.planName}: 载荷 index=${item.index} ≠ 规范序 ${rows.indexOf(row)}`);

    // ④ 搜索 haystack 必须覆盖「平台上显示的那个名字」「套餐名」「每一个模型名」
    const providerLabel = providerNameOf(plan.provider, opts.providerTable || providersLib.load().table);
    for (const need of [providerLabel, plan.planName].concat(modelNames)) {
      const needle = plansCompare.normalize(need);
      if (needle && !String(item.search || '').includes(needle)) {
        problems.push(`${row.planName}: 搜索串里搜不到「${need}」`);
      }
    }
  }

  // ⑤ 选项清单与行键必须互相成立（"筛完之后出现不匹配套餐"的静态对应物）
  const dimensions = payload.dimensions || {};
  const keysOf = dimension => (dimensions[dimension] || []).map(item => item.key);
  for (const [dimension, field] of [['provider', 'provider'], ['region', 'region'], ['quotaType', 'quotaType']]) {
    const allowed = new Set(keysOf(dimension));
    for (const row of payload.rows) {
      if (row[field] && !allowed.has(row[field])) {
        problems.push(`载荷行 ${row.id} 的 ${field}=${row[field]} 不在 ${dimension} 选项清单里（筛选会漏掉它）`);
      }
    }
    for (const key of allowed) {
      if (!payload.rows.some(row => row[field] === key)) {
        problems.push(`${dimension} 选项「${key}」没有任何一行匹配（零计数入口不该渲染）`);
      }
    }
  }
  const modelKeys = new Set(keysOf('model'));
  for (const row of payload.rows) {
    for (const name of row.models || []) {
      if (!modelKeys.has(name)) problems.push(`载荷行 ${row.id} 的模型「${name}」不在模型选项清单里`);
    }
    if (row.modelsMissing && !modelKeys.has(MODEL_NONE_KEY)) {
      problems.push(`载荷行 ${row.id} 没有模型清单，却不存在「${MODEL_NONE_KEY}」这一档`);
    }
  }
  for (const bucket of dimensions.price || []) {
    if (!payload.rows.some(row => plansCompare.matches(row, Object.assign(plansCompare.emptyState(), { price: bucket.key }), dimensions.price))) {
      problems.push(`价格档「${bucket.label}」没有任何一行匹配（零计数入口不该渲染）`);
    }
  }
  const sortKeys = keysOf('sort');
  const expectedSorts = plansCompare.sortsOf(payload.rows);
  if (JSON.stringify(sortKeys) !== JSON.stringify(expectedSorts)) {
    problems.push(`排序档位 [${sortKeys.join(', ')}] ≠ 应当可用的 [${expectedSorts.join(', ')}]`);
  }
  for (const item of dimensions.sort || []) {
    if (!SORT_LABEL[item.key]) problems.push(`排序档位「${item.key}」没有标签`);
  }
  if (sortKeys.indexOf('unit') < 0 && !markup.includes(escapeHtml(NO_UNIT_SORT_NOTE))) {
    problems.push('本期没有可比较的名义 Token 单价，却没有在页面上说明为什么没有这个排序');
  }

  // ⑥ 每一条套餐恰好一个详情模板，且模板里的引文逐条等于 plans.json
  const templates = [...markup.matchAll(/<template data-detail-for="([^"]+)">([\s\S]*?)<\/template>/g)];
  if (templates.length !== rows.length) {
    problems.push(`详情模板 ${templates.length} 个 ≠ 套餐数 ${rows.length}`);
  }
  const templateById = new Map(templates.map(m => [m[1], m[2]]));
  for (const plan of plans || []) {
    const body = templateById.get(plan.id);
    if (!body) { problems.push(`${plan.planName}: 缺少详情模板`); continue; }
    if (!body.includes(plan.officialUrl)) problems.push(`${plan.planName}: 详情模板里没有官方定价页链接`);
    for (const item of plan.evidence || []) {
      if (!body.includes(escapeHtml(item.quote))) problems.push(`${plan.planName}: 详情模板缺少引文「${item.quote.slice(0, 20)}…」`);
      if (!body.includes(`href="${escapeHtml(item.sourceUrl)}"`)) problems.push(`${plan.planName}: 引文缺少可点的出处链接 ${item.sourceUrl}`);
    }
  }

  // ⑦ 预渲染的标记里**一个控件都不能有**（无 JS 时的死控件）。与首页 G11 同一条纪律：
  //    载荷与模板是惰性的，控件整块由 JS 建 —— 所以这里连 `<button` 都不该出现。
  const deadControls = ['<button', '<select', '<input', 'data-facet=', 'data-sort=', 'data-reset'];
  for (const token of deadControls) {
    if (markup.includes(token)) problems.push(`预渲染 HTML 里出现了交互控件「${token}」（无 JS 时是死控件）`);
  }
  return problems;
}

/**
 * 页面级诚实性断言。返回问题列表（空 = 通过）。
 *
 * 这就是题面第三条要求的那件事：把「不许出现结论性词汇」「未知必须显式写出」
 * 「算不出的单价不得显示成 0」从产品规则变成**可失败的断言**。
 */
function assertPageHonesty(html, plans, opts = {}) {
  const problems = [];
  const text = markupOnly(String(html));
  const rows = plansRows(plans, opts);
  const byId = rowHtmlById(text);

  if (!/<h1>/.test(text)) problems.push('缺少 <h1>');
  if (!text.includes(PLANS_HEADING)) problems.push(`缺少标题「${PLANS_HEADING}」`);

  // ① 口径文案必须在页面上（题面 §四 点名要求）
  if (!text.includes(escapeHtml(planSchema.PLAN_WORDING.nominalUnitPriceNote))) {
    problems.push('缺少「名义 Token 单价只用于粗略比较」的口径说明');
  }

  // ② 结论性词汇一律不许出现
  for (const word of FORBIDDEN_CLAIM_WORDS) {
    if (text.includes(word)) problems.push(`页面出现结论性词汇「${word}」（本页只列事实，不做价值判断）`);
  }

  // ③ 每一行都在，且行数 == 套餐数
  if (byId.size !== rows.length) {
    problems.push(`页面行数 ${byId.size} ≠ 套餐数 ${rows.length}`);
  }
  for (const row of rows) {
    const chunk = byId.get(row.id);
    if (!chunk) { problems.push(`缺少套餐行 ${row.id}（${row.provider} ${row.planName}）`); continue; }

    // ④ 官方链接必须在行内（来源可追溯）
    if (!chunk.includes(row.officialUrl)) problems.push(`${row.planName}: 行内没有官方链接`);

    // ⑤ 三个数值列**逐个单元格**比对到行模型。
    //
    // 为什么不能拿整行做正则：第一版写的是 `/0\b/` 之类的"整行里有没有 0"，
    // 于是 `2,000` 的末位 0 被判成「原价未知却像 0」—— 断言在**正常数据**上失败。
    // 单元格级的比对既没有这个歧义，也比正则强：它同时钉住了「未知那一格显示的到底是什么」。
    const numericCells = [...chunk.matchAll(/<td class="num">([\s\S]*?)<\/td>/g)].map(m => cellText(m[1]));
    if (numericCells.length !== 3) {
      problems.push(`${row.planName}: 数值列应有 3 个（正常价格 / 活动价 / 名义 Token 单价），实得 ${numericCells.length} 个`);
    } else {
      const [regular, promo, unitPrice] = numericCells;
      if (regular !== row.regularText) {
        problems.push(`${row.planName}: 正常价格渲染成「${regular}」，应为「${row.regularText}」`);
      }
      if (promo !== row.promoText) {
        problems.push(`${row.planName}: 活动价渲染成「${promo}」，应为「${row.promoText}」`);
      }
      if (unitPrice !== row.unitPriceText) {
        problems.push(`${row.planName}: 名义 Token 单价渲染成「${unitPrice}」，应为「${row.unitPriceText}」`);
      }
      // ⑧ 「原价未知」与「确实免费」必须**长得不一样**（H4 的核心）。
      //    这一条是**成对**的：只看一半（比如"未知不许是 0"）会在另一个方向上漏掉 ——
      //    把 `regularPrice: 0` 也渲染成「未标注」，读者就再也看不到免费档了。
      if (row.regularValue === null && regular !== UNKNOWN_TEXT) {
        problems.push(`${row.planName}: 原价未知必须写「${UNKNOWN_TEXT}」，实得「${regular}」`);
      }
      if (row.regularValue === 0 && !/0/.test(regular)) {
        problems.push(`${row.planName}: 确实是免费档（regularPrice=0），价格必须显示成含 0 的数字，实得「${regular}」`);
      }
      if (row.promoValue === null && promo !== UNKNOWN_NUM) {
        problems.push(`${row.planName}: 没有活动价时必须写「${UNKNOWN_NUM}」，实得「${promo}」`);
      }
    }

    // ⑥ 算不出的单价必须显式标记，不能看起来像一个数字
    if (!row.unitPriceComputable && !chunk.includes(`class="pnone"`)) {
      problems.push(`${row.planName}: 名义 Token 单价不可比较，却没有标记为「${UNKNOWN_NUM}」`);
    }
  }

  // ⑦ 可计算单价的行数必须与数据一致（不多报也不少报）
  const computable = rows.filter(row => row.unitPriceComputable).length;
  if (!text.includes(`名义 Token 单价可计算 ${computable} 条`)) {
    problems.push(`页面声明"可计算 N 条"与实际不一致（应为 ${computable} 条）`);
  }

  // ⑩ v2.3：变化展示。块里的每一条都必须来自雷达，且「没有拿到日志」与「没有变化」不许混为一谈。
  const block = (text.match(/<section class="pchanges" id="plan-changes"[\s\S]*?<\/section>/) || [])[0] || '';
  /**
   * 句子要用**与渲染层同一份上下文**（币种 / 额度单位 / 平台显示名都从套餐记录里取）。
   * 少传 `plansById` 会写出「正常价格 20 → 10」（少了 `$`）—— 断言与页面就会分家。
   */
  const sentenceOpts = { ...opts, plansById: new Map((plans || []).map(plan => [plan.id, plan])) };
  if (opts.planChanges) {
    const radar = opts.planChanges;
    const W = planChanges.PLAN_CHANGES_WORDING.PLAN_CHANGES_LABELS;
    if (!block) {
      problems.push('缺少「最近变化」块（#plan-changes）');
    } else {
      const items = radar.availability === 'ok' ? radar.home.items : [];
      const li = (block.match(/<li>/g) || []).length;
      if (li !== items.length) problems.push(`最近变化块 ${li} 条 ≠ 雷达 ${items.length} 条`);
      for (const item of items) {
        const sentence = planChangeTextOf(item, sentenceOpts);
        if (!block.includes(escapeHtml(sentence))) {
          problems.push(`最近变化块缺少一条变化：「${sentence}」`);
        }
      }
      if (radar.availability !== 'ok') {
        if (!block.includes(escapeHtml(W.unavailable))) problems.push('日志不可用时没有说清「没有拿到日志」');
      } else if (!items.length) {
        if (!block.includes(escapeHtml(W.empty))) problems.push('没有变化时没有明确空态');
      } else if (block.includes(escapeHtml(W.unavailable))) {
        problems.push('日志可用却写着「没有拿到日志」');
      }
    }
  }

  // ⑪ v2.3：每条有历史的套餐，其详情模板的时间线必须与日志逐条一致
  if (opts.planHistoryStore) {
    const templates = new Map([...text.matchAll(/<template data-detail-for="([^"]+)">([\s\S]*?)<\/template>/g)]
      .map(match => [match[1], match[2]]));
    const L = planHistory.PLAN_HISTORY_WORDING.PLAN_HISTORY_LABELS;
    for (const plan of plans || []) {
      const view = planHistory.historyFor(opts.planHistoryStore, plan.id);
      const body = templates.get(plan.id);
      if (!body) { problems.push(`${plan.planName}: 缺少详情模板（时间线无处安放）`); continue; }
      if (!view) {
        if (!body.includes(escapeHtml(L.empty))) problems.push(`${plan.planName}: 没有变更记录时未写「${L.empty}」`);
        continue;
      }
      if (!body.includes(escapeHtml(`${L.sectionTitle}（${view.total} 条）`))) {
        problems.push(`${plan.planName}: 时间线没有报出总条数（应为 ${view.total} 条）`);
      }
      for (const event of planHistory.timelineOf(opts.planHistoryStore, plan.id).slice(0, 10)) {
        const sentence = planChangeTextOf({
          planId: event.planId, type: event.type, field: event.field,
          from: 'from' in event ? event.from : null, to: 'to' in event ? event.to : null,
          reason: event.reason, origin: event.origin
        }, sentenceOpts);
        if (!body.includes(escapeHtml(sentence))) problems.push(`${plan.planName}: 时间线缺少「${sentence}」`);
      }
    }
  }

  // ⑨ v2.2：交互载荷（筛选项 / 排序档位 / 搜索串）与 `plans.json` 逐字段对账，
  //    外加「预渲染标记里零控件」。载荷错的时候**表格看上去完全正常**，
  //    所以这一条必须挂在同一个函数里 —— 构建期从磁盘回读时它会再跑一遍。
  problems.push(...assertCompareHonesty(html, plans, opts));

  // ⑫ v2.4：优惠 ↔ 套餐块。视图由调用方传入（`deal-plan-links.js` 的 `planDealsView()`）；
  //    没传视图 = 这一页没有渲染这一块，也就没有可对账的对象（既有调用方不受影响）。
  problems.push(...assertPlanDealsBlock(text, opts.dealLinks || null, { prefix: opts.prefix }));
  return problems;
}

/**
 * v2.3 数据层：结论性词汇也不许出现在**事件的值**里。
 *
 * 事件文本会原样出现在页面上（`planChangeTextOf` 把它们拼进句子），所以它们和我们写的
 * 数据是同一类东西：套餐名改了、模型备注里塞了「最划算」，页面就会替我们做出结论。
 */
function assertHistoryHonesty(plans, store, opts = {}) {
  const problems = [];
  const scan = (planId, field, value) => {
    if (typeof value !== 'string') return;
    for (const word of FORBIDDEN_CLAIM_WORDS) {
      if (value.includes(word)) problems.push(`${planId} 的变化事件 ${field} 含结论性词汇「${word}」`);
    }
  };
  const walk = (planId, path, value) => {
    if (typeof value === 'string') { scan(planId, path, value); return; }
    if (Array.isArray(value)) { value.forEach((item, index) => walk(planId, `${path}[${index}]`, item)); return; }
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) walk(planId, `${path}.${key}`, value[key]);
    }
  };
  void plans; void opts;
  for (const event of planHistory.eventsOf(store)) {
    walk(event.planId, `${event.type}/${event.field || '-'}`, event.from);
    walk(event.planId, `${event.type}/${event.field || '-'}`, event.to);
    walk(event.planId, `${event.type}/${event.field || '-'}`, event.label);
  }
  return problems;
}

/** 数据层：结论性词汇也不许出现在**我们写的数据**里（套餐名 / 备注 / 额度口径 / 搜索串） */
function assertDataHonesty(plans, opts = {}) {
  const problems = [];
  const scan = (plan, field, value) => {
    if (typeof value !== 'string') return;
    for (const word of FORBIDDEN_CLAIM_WORDS) {
      if (value.includes(word)) problems.push(`${plan.planName} 的 ${field} 含结论性词汇「${word}」`);
    }
  };
  for (const plan of plans || []) {
    scan(plan, 'planName', plan.planName);
    scan(plan, 'billing.note', plan.billing && plan.billing.note);
    scan(plan, 'billing.promoNote', plan.billing && plan.billing.promoNote);
    scan(plan, 'quota.description', plan.quota && plan.quota.description);
    // 搜索串里含平台别名，而别名也是"我们写下的字"—— 进得了搜索框就进得了页面语料
    scan(plan, '搜索串', searchHaystackOf(plan, opts));
  }
  return problems;
}

module.exports = {
  PLANS_ROUTE,
  PLANS_HOME_HREF,
  PLANS_HEADING,
  PLANS_DESCRIPTION,
  PLANS_NOTES,
  FORBIDDEN_CLAIM_WORDS,
  UNKNOWN_TEXT,
  UNKNOWN_NUM,
  UNKNOWN_TRI,
  CURRENCY_SYMBOL,
  BILLING_PERIOD_LABEL,
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
  MODEL_ROLE_LABEL,
  RESTRICTION_LABEL,
  PLANS_COLUMNS,
  SORT_LABEL,
  MODEL_NONE_KEY,
  NO_UNIT_SORT_NOTE,
  PLAN_DEALS_WORDING,
  escapeHtml,
  formatNumber,
  providerNameOf,
  planRowOf,
  plansRows,
  searchHaystackOf,
  planCompareRowOf,
  planComparePayloadOf,
  planDetailTemplatesHtml,
  comparePayloadScriptHtml,
  comparePayloadOf,
  jsonForScript,
  markupOnly,
  plansPageBody,
  plansJsonLd,
  // v2.4 优惠 ↔ 套餐（套餐页那一块）
  planDealsBlockHtml,
  planDealsRowHtml,
  planDealsBlockOf,
  planDealsRowOf,
  planDealCurrentTextOf,
  planDealHistoryTextOf,
  assertPlanDealsBlock,
  rowHtmlById,
  cellText,
  // v2.3 变化展示：句子只有一处实现，页面 / 时间线 / /changes/ / 订阅源共用
  priceTextOf,
  quotaValueTextOf,
  modelTextOf,
  restrictionDiffOf,
  planValueTextOf,
  planChangeTextOf,
  planChangeSentenceOf,
  planChangeItemHtml,
  planChangesBlockHtml,
  planChangesPageBlockHtml,
  planTimelineHtml,
  assertPageHonesty,
  assertCompareHonesty,
  assertDataHonesty,
  assertHistoryHonesty
};
