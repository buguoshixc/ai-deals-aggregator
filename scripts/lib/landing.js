/**
 * 落地页的**唯一注册表与门槛层**（v1.7）。
 *
 * 这一层只做三件事，别的什么都不做：
 *   ① 把「哪一页该生成」写死在一张表里（人工允许表 + 门槛函数）；
 *   ② 把「这一页收哪些条目」写成纯函数（判据只有一份，页面/断言/报告共用）；
 *   ③ 把「被跳过的页与原因」原样交出来（构建日志与报告都要能逐条读到）。
 *
 * ## 为什么单独一层，而不是往 build-local.js 里再加几个 if
 *
 * v1.2 的教训（见 build-local.js 里那段注释）是：三条路由各写一遍，等于把
 * 「哪一条忘了进 sitemap」变成一个靠记性维持的不变量。v1.7 一次加四类页面
 * （分类页 / 厂商页 / 枢纽页 / 别名页），再复制四遍就是四倍的风险。
 *
 * ## 三条纪律（与本项目其它部分同源）
 *
 *   ① **只用已有字段**，不新造词表、不扫标题正文做类目推断；
 *   ② **只认肯定信号**，`unknown` 与缺席一律不算；
 *   ③ 条数、摘要数字、覆盖分类数**全部现算**，任何地方都不写死。
 */

const fs = require('fs');
const path = require('path');

const audience = require('./audience');
const categories = require('./categories');

const DATA_DIR = path.join(__dirname, '..', 'data');
const VENDOR_SLUGS_FILE = path.join(DATA_DIR, 'vendor-slugs.json');
const CATEGORY_SLUGS_FILE = path.join(DATA_DIR, 'category-slugs.json');
const PINNED_FILE = path.join(DATA_DIR, 'landing-pages.json');
const ALIASES_FILE = path.join(DATA_DIR, 'landing-aliases.json');
// 厂商 slug 的**机器账本**：collect 侧写盘工具产出、同批入库、确定性排序、禁止人手改。
// 与 vendor-slugs.json（人工覆盖表）分工：覆盖表是人给"可读短名"的地方；账本是机器
// 第一次给一家厂商分配 URL 后**记住它**的地方 —— 没有它，每家新厂商都要人补一行，
// 发布链就会在"数据已经入库、构建却要求人工"的形态上反复停摆。
const VENDOR_SLUG_LEDGER_FILE = path.join(DATA_DIR, 'vendor-slug-ledger.json');

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * 厂商 → 历史事件数（`VENDOR_THRESHOLDS.minEvents` 那条门槛的唯一输入）。
 *
 * 为什么要有这一处：厂商页资格是三条 OR —— 有效优惠条数 / **历史事件数** / 非优惠资料。
 * 前两条的读数以前由各调用点自己算（构建期一份、独立验收一份、三个 selftest 各传 `() => 0`），
 * 2026-11-12 第一次出现**只靠事件数达标**的厂商（NinjaPipe：1 条优惠 / 3 条事件），
 * 于是独立门禁重算的计划比产物少一页（`vendor/ninjapipe/`），判 `rowMismatches` 与
 * ItemList 成员双红 —— 判据分家的代价。现在只有这一份实现：
 *   · 身份归一仍然只从调用方注入的 `vendorKeyOf`（RENDER-CORE 的 `vendorOf()`，唯一入口）；
 *   · 事件按记录 id 归到厂商；记录不在 `deals` 里的事件不计（与构建期口径相同）。
 *
 * @param {{deals?: object[], events?: object[], vendorKeyOf: Function}} params
 * @returns {Map<string, number>} 厂商显示名 → 事件数；零事件的厂商不出现（调用方按 0 兜底）
 */
function vendorEventCountsOf({ deals = [], events = [], vendorKeyOf } = {}) {
  if (typeof vendorKeyOf !== 'function') {
    throw new Error('vendorEventCountsOf 需要 vendorKeyOf（厂商归一的唯一入口是 RENDER-CORE 的 vendorOf）');
  }
  const vendorOfId = new Map();
  for (const deal of deals || []) {
    if (deal && deal.id) vendorOfId.set(deal.id, vendorKeyOf(deal) || '');
  }
  const counts = new Map();
  for (const event of events || []) {
    const key = event && (event.id !== undefined ? event.id : event.planId);
    const name = vendorOfId.get(key);
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}

/**
 * 生成门槛。厂商那一档**刻意复用站点常量的门槛**（调用方从 `lib/site.js` 的 `VENDOR_THRESHOLDS`
 * 传进来，本层不写第二份数值），这样「页面生成」与「构建期回读断言」读的是同一个门槛 ——
 * 两处各改一半的话，门禁会看着绿，而页面已经少了一族。
 * （原先这句说的是「与它的 Feed 的条目集合不可能分头变化」：订阅层整体下架后那一侧没有了，
 * 但「门槛只有一个出处」这条纪律的承重面还在，所以复用本身保留。）
 *
 * 分类门槛 4 的依据是实测分布（`type:'deal'`）：
 *   API服务 36 · 对话模型 15 · 音频语音 6 · 图像绘画 5 · 智能体 4 ‖ 编程开发 4 · 办公效率 3 · 视频 2 · 教育学习 2 · 其他 1 · 搜索研究 1 · 设计创意 1
 * 4 与 3 之间是自然断层；3 条以下给不出可比较的信息，而每页约 84 KB。
 */
const CATEGORY_MIN_DEALS = 4;

/* ------------------------------------------------------------------ */
/* 手工文案（类别页与枢纽页）                                           */
/* ------------------------------------------------------------------ */

/**
 * 分类页的**人工允许表**。只有登记在这里的分类才会生成 /category/<slug>/。
 *
 * ⚠️ `userNotes` 是**直接写进 HTML 的**（模板插进 `<details class="page-notes">`），
 * 所以这里写的是 HTML，不是 Markdown：
 * 要强调用 `<b>`，要写字面量就直接写。违反这条会被 build-local.js 的既有守卫当场
 * 拦下（`.snote` / `.vsnote` / `<caption>` / `<details>` 里出现 `**` 或反引号即构建失败）。
 *
 * ## 分类页为什么首屏一个字都没有（secondary-page-intro-changes-v1）
 *
 * 「这一页按 category 字段收、不是按标题关键词猜的」属于**维护口径**，不是用户任务：
 * 读者点进 /category/audio/ 时想问的是「这里有什么音频类优惠」，不是「你们怎么分类的」。
 * 二级数据页首屏只留标题 / 条目数 / 更新时间（DESIGN-RULES H13），所以这一族**一律没有**
 * 首屏说明；只有**会改变领取判断**的差异（例如额度按张数/时长计，与按 Token 计不可比）
 * 保留在底部折叠的 `userNotes` 里。
 */
const CATEGORY_PAGES = [
  {
    slug: 'api',
    category: 'API服务',
    title: 'AI API 服务优惠',
    heading: 'AI API 服务与算力平台的优惠',
    description: '大模型 API 服务与算力平台的优惠与免费额度：新用户赠送、限时免费模型与按量抵扣，逐条标注领取门槛与是否中国大陆可用。',
    // 单位会影响读者怎么比较额度 ⇒ 保留在底部折叠（首屏不再有说明，DESIGN-RULES H13）。
    userNotes: ['这一页的优惠按量计费，额度单位多为 Token 或积分。']
  },
  {
    slug: 'chat',
    category: '对话模型',
    title: 'AI 对话模型优惠',
    heading: '对话类大模型的优惠与免费额度',
    description: '对话类大模型的优惠与免费额度：免费模型、新用户赠送 Token 与限时折扣，逐条标注领取门槛与是否中国大陆可用。'
  },
  {
    slug: 'audio',
    category: '音频语音',
    title: 'AI 音频语音优惠',
    heading: '语音识别、合成与音频类 AI 优惠',
    description: '语音识别、语音合成与音频生成的 AI 优惠与免费额度：按小时或字符计的免费额度与限时折扣，逐条标注门槛与可用性。',
    // 单位不可比会直接误导读者比较额度大小 → 折叠说明里保留这一句。
    userNotes: ['这一类的免费额度常按时长或字符数计量，与按 Token 计的大模型额度不是同一种单位，页面上保留官方原文的说法。']
  },
  {
    slug: 'image',
    category: '图像绘画',
    title: 'AI 图像绘画优惠',
    heading: '图像生成与绘画类 AI 优惠',
    description: '图像生成与绘画类 AI 的优惠与免费额度：免费出图额度、限时折扣与面向学生、教师的设计工具优惠，逐条标注门槛。',
    userNotes: ['这一类的额度常按张数计（例如「200 张」），页面保留官方原话，不做换算。']
  },
  {
    slug: 'agent',
    category: '智能体',
    title: 'AI 智能体优惠',
    heading: '智能体与 Agent 平台的优惠',
    description: '智能体与 Agent 平台的优惠与免费额度：积分赠送、每日免费调用次数与限时折扣，逐条标注领取门槛与是否中国大陆可用。',
    userNotes: ['这一类的优惠常以积分或每日次数发放，有效期往往很短，页面保留官方原文的期限说法。']
  }
];

const CATEGORY_PREDICATES = {};
for (const page of CATEGORY_PAGES) {
  CATEGORY_PREDICATES[page.slug] = deal => Boolean(deal) && deal.category === page.category;
}

/**
 * 登记了 slug、但**刻意不成页**的分类，以及理由。
 *
 * 这张表是「某一条路由为什么不在」的唯一出处：没有理由的缺席会在 selftest:seo 里变红，
 * 因为「悄悄少了一页」和「决定不做这一页」对后来人来说是两件完全不同的事。
 */
const CATEGORY_EXCLUSIONS = [
  {
    category: '编程开发',
    slug: 'coding',
    reason: '与既有页面 /need/ai-coding/ 的条目集合逐条相同（同一份 category === 编程开发 判据）。同一主题不重复建 URL —— 由既有页面承担这一搜索意图。'
  },
  {
    category: '其他',
    slug: null,
    reason: '内部兜底枚举，不是用户会搜索的主题；条目本身也多是无法归类的长尾。'
  }
];

const VENDOR_HUB = {
  kind: 'hub',
  key: 'vendor',
  slug: 'vendor',
  route: 'vendor/',
  depth: 1,
  title: '按厂商找优惠',
  heading: '按厂商浏览 AI 优惠',
  description: '按厂商浏览本站收录的 AI 优惠与免费额度：每家厂商一页，列出当前有效优惠、学生与开发者相关条目以及最近变化。',
  // 「门槛 ≥2 条 / ≥3 事件」「厂商归一规则 / 同名归并」是维护口径 → docs 口径归档。
  // 「门槛够的厂商才有独立页」已由渲染层的共享句 SHARED_NOTES.hubMissing 承担
  // ⇒ 首屏不再重复一遍（重复的代价是首屏多一行，收益是零）。
  userNotes: ['同一个公司的不同写法会合并到同一页。']
};

const CATEGORY_HUB = {
  kind: 'hub',
  key: 'category',
  slug: 'category',
  route: 'category/',
  depth: 1,
  title: '按分类找优惠',
  heading: '按分类浏览 AI 优惠',
  description: '按分类浏览本站收录的 AI 优惠：API 服务、对话模型、图像绘画、音频语音与智能体，每一类一页。'
  // 「只列出达门槛的分类」由渲染层共享句 SHARED_NOTES.hubMissing 承担 ⇒ 首屏不再重复。
};

/* ------------------------------------------------------------------ */
/* 数据表读取                                                           */
/* ------------------------------------------------------------------ */

function readJson(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`读取${what}失败（${path.relative(path.join(__dirname, '..', '..'), file)}）：${error.message}`);
  }
}

/** 去掉 `_` 前缀的元信息键 */
function withoutMeta(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

function loadVendorSlugs(file = VENDOR_SLUGS_FILE) {
  return withoutMeta(readJson(file, '厂商 slug 表'));
}

function loadCategorySlugs(file = CATEGORY_SLUGS_FILE) {
  return withoutMeta(readJson(file, '分类 slug 表'));
}

function loadPinned(file = PINNED_FILE) {
  const doc = readJson(file, '钉住的落地页表');
  return Array.isArray(doc.pages) ? doc.pages : [];
}

function loadAliases(file = ALIASES_FILE) {
  const doc = readJson(file, '别名表');
  return withoutMeta(doc.aliases || {});
}

/**
 * 读取厂商 slug 机器账本。
 *
 * 账本**不存在**时返回空账本（不是错误）：仓库第一次引入它、或旧分支上还没有这个文件时，
 * 构建应当照常工作（新厂商按 `suggestSlug()` 现场分配），而不是因为"状态文件缺失"停机。
 * 账本的形状校验（SLUG_RE / 重复）与覆盖表共用 `validateSlugTable` 的同一套口径。
 *
 * @param {string} [file]
 * @returns {{schemaVersion: number, vendors: Array<{vendorName: string, slug: string, firstRoutedAt: string, status: string}>}}
 */
function loadVendorSlugLedger(file = VENDOR_SLUG_LEDGER_FILE) {
  if (!fs.existsSync(file)) return { schemaVersion: 1, vendors: [] };
  const doc = readJson(file, '厂商 slug 机器账本');
  const vendors = Array.isArray(doc.vendors) ? doc.vendors : [];
  return {
    schemaVersion: Number(doc.schemaVersion) || 1,
    vendors: vendors
      .filter(row => row && row.vendorName && row.slug)
      .map(row => ({
        vendorName: String(row.vendorName),
        slug: String(row.slug),
        firstRoutedAt: String(row.firstRoutedAt || ''),
        status: row.status === 'degraded' ? 'degraded' : 'active'
      }))
      .sort((a, b) => a.vendorName.localeCompare(b.vendorName, 'zh'))
  };
}

/** 账本按厂商显示名索引（重复名取第一条；形状问题由 `validateSlugTable` 另行报）。 */
function ledgerByName(ledger) {
  const map = new Map();
  for (const row of (ledger && ledger.vendors) || []) {
    if (!row || !row.vendorName) continue;
    if (!map.has(row.vendorName)) map.set(row.vendorName, row);
  }
  return map;
}

function validateSlugTable(table, what) {
  const problems = [];
  const seen = new Map();
  for (const [key, slug] of Object.entries(table)) {
    if (!SLUG_RE.test(String(slug))) problems.push(`${what}「${key}」的 slug "${slug}" 不符合 ^[a-z0-9][a-z0-9-]*$`);
    if (seen.has(slug)) problems.push(`${what} slug "${slug}" 重复：${seen.get(slug)} 与 ${key}`);
    else seen.set(slug, key);
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* 门槛                                                                 */
/* ------------------------------------------------------------------ */

/**
 * 页面生成门槛的**唯一实现**。
 *
 * @param {string} kind  'vendor' | 'category' | 'hub' | 'alias'
 * @param {object} candidate `{ key, count, eventCount, children, targetExists, pinned }`
 * @param {object} ctx `{ vendorThresholds: {minDeals, minEvents}, categoryMinDeals }`
 * @returns {{ok: boolean, reason: string}}
 *
 * 返回的 `reason` 是机器可读的短码（`eligible` / `below-threshold` / `pinned-below-threshold`
 * / `pinned-empty` / `already-covered` / `no-children` / `alias-target-missing`），
 * 构建日志与报告直接打印它，不做二次翻译。
 */
function shouldGenerateLandingPage(kind, candidate = {}, ctx = {}) {
  const vendorThresholds = ctx.vendorThresholds || { minDeals: 2, minEvents: 3 };
  const categoryMinDeals = Number.isFinite(ctx.categoryMinDeals) ? ctx.categoryMinDeals : CATEGORY_MIN_DEALS;
  const count = Number(candidate.count) || 0;
  const eventCount = Number(candidate.eventCount) || 0;
  const pinned = Boolean(candidate.pinned);
  /**
   * v3.0 Stage E：**至少一种非优惠资料**也是厂商页的达标条件。
   *
   * 为什么必须加这一条：`/vendor/<slug>/` 在 v3.0 升级成「厂商统一资料页」，
   * 它同时承载优惠、Coding 套餐、API 计费与模型归属。一家**没有任何优惠**、
   * 但有官方套餐与 API 计价的厂商（例如只有 API 计费的平台），现在是这一页的
   * 正当内容 —— 用「优惠条数」当唯一门槛会把它整页丢在门外。
   *
   * 判据本身仍然只有一处：这里。`planLandingPages()` 与 `seo.js` 的 `gate-threshold`
   * 都读同一个 `candidate.nonDealMaterial`，不各写一份"什么算非优惠资料"。
   */
  const nonDealMaterial = Boolean(candidate.nonDealMaterial);

  switch (kind) {
    case 'vendor': {
      const eligible = count >= vendorThresholds.minDeals || eventCount >= vendorThresholds.minEvents || nonDealMaterial;
      if (eligible) return { ok: true, reason: nonDealMaterial && count < vendorThresholds.minDeals && eventCount < vendorThresholds.minEvents ? 'eligible-nondeal' : 'eligible' };
      if (pinned && count > 0) return { ok: true, reason: 'pinned-below-threshold' };
      if (pinned) return { ok: false, reason: 'pinned-empty' };
      return { ok: false, reason: 'below-threshold' };
    }
    case 'category': {
      if (candidate.alreadyCovered) return { ok: false, reason: 'already-covered' };
      const eligible = count >= categoryMinDeals;
      if (eligible) return { ok: true, reason: 'eligible' };
      if (pinned && count > 0) return { ok: true, reason: 'pinned-below-threshold' };
      if (pinned) return { ok: false, reason: 'pinned-empty' };
      return { ok: false, reason: 'below-threshold' };
    }
    case 'hub':
      return (Number(candidate.children) || 0) > 0
        ? { ok: true, reason: 'eligible' }
        : { ok: false, reason: 'no-children' };
    case 'alias':
      return candidate.targetExists
        ? { ok: true, reason: 'eligible' }
        : { ok: false, reason: 'alias-target-missing' };
    default:
      throw new Error(`未知的落地页类型：${kind}`);
  }
}

/* ------------------------------------------------------------------ */
/* 条目归属（判据只有这一份）                                            */
/* ------------------------------------------------------------------ */

/** 站内所有落地页共用的条目匹配：按已算好的派生字段或固定字段取，绝不做文本推断 */
function itemsOf(spec, deals, options = {}) {
  const vendorKeyOf = options.vendorKeyOf || (deal => String((deal && deal.vendor) || ''));
  const pool = (deals || []).filter(deal => deal && deal.type === 'deal');
  const match = spec && spec.match;
  if (!match) return [];
  switch (match.by) {
    case 'collections':
      return pool.filter(deal => (deal.collections || []).includes(match.slug));
    case 'needs':
      return pool.filter(deal => (deal.needs || []).includes(match.slug));
    case 'category':
      return pool.filter(deal => deal.category === match.value);
    case 'vendor':
      return pool.filter(deal => vendorKeyOf(deal) === match.value);
    default:
      throw new Error(`未知的条目归属方式：${match.by}`);
  }
}

/** 页面集合的稳定指纹（seo.js 用它判断「两个页面是不是同一批条目」） */
function itemKeyOf(ids) {
  return (ids || []).slice().sort().join(',');
}

/* ------------------------------------------------------------------ */
/* v3.0 Stage E：厂商的非优惠资料（join，不 duplicate）                  */
/* ------------------------------------------------------------------ */

/**
 * 一家厂商的**非优惠资料**：Coding 套餐 / API 计费记录 / Model Registry 归属。
 *
 * 全部按**显式关系 join**：
 *   · 套餐与 API 记录按 `record.provider === providerKey`（provider key 由显示名精确查到）；
 *   · 模型归属按 registry 的 `developer` / `owner` **逐字相等**，或该模型经关系层
 *     映射到这家厂商的某条 API 记录（`modelLinks.registrySlug → apiPlanId`，两跳全显式）。
 * 不做任何文本推断、不猜别名（别名解析的入口只有 `providers.json`）。
 *
 * @returns {{providerKey:string|null, planIds:string[], apiPlanIds:string[], modelSlugs:string[], codingPlans:number, apiRecords:number, models:number, nonDeal:boolean}}
 */
function vendorMaterialOf({ vendorName, providerTable = {}, plans = [], apiPlans = [], models = [], modelLinks = [] } = {}) {
  const name = String(vendorName || '');
  const empty = {
    providerKey: null, planIds: [], apiPlanIds: [], modelSlugs: [],
    codingPlans: 0, apiRecords: 0, models: 0, nonDeal: false,
    // v3.0 Stage E / R5：`/vendor/<slug>/` 的**身份键是 A 空间厂商名**。
    // provider 的 `vendorKey === null` 表示它在 A 空间没有厂商名（实测：trae / qoder /
    // codebuddy / qoder-intl）—— 为它们建路由就必须新编一个 A 空间身份、或者改身份键，
    // 两者都不接受。它们的资料走 `/plans/coding/` 与 `/plans/` 枢纽。
    hasVendorIdentity: false
  };
  if (!name) return empty;
  // 显示名 → provider key：**精确相等**（providers.json 的 name 唯一，由 validate 保证）
  let providerKey = null;
  let providerEntry = null;
  for (const [key, entry] of Object.entries(providerTable || {})) {
    if (entry && String(entry.name || '') === name) { providerKey = key; providerEntry = entry; break; }
  }
  if (!providerKey) return empty;
  const hasVendorIdentity = Boolean(providerEntry && providerEntry.vendorKey);

  const ownPlans = (plans || []).filter(plan => plan && plan.provider === providerKey);
  const ownApiPlans = (apiPlans || []).filter(plan => plan && plan.provider === providerKey);
  const apiPlanIds = ownApiPlans.map(plan => plan.id);
  const apiPlanIdSet = new Set(apiPlanIds);

  const modelSlugs = new Set();
  for (const model of models || []) {
    if (!model) continue;
    if (String(model.developer || '') === name || String(model.owner || '') === name) {
      if (model.slug) modelSlugs.add(String(model.slug));
    }
  }
  for (const link of modelLinks || []) {
    if (!link) continue;
    const slug = String(link.registrySlug || '');
    if (!slug) continue;
    if (link.apiPlanId && apiPlanIdSet.has(link.apiPlanId)) modelSlugs.add(slug);
  }

  const material = {
    providerKey,
    hasVendorIdentity,
    planIds: ownPlans.map(plan => plan.id),
    apiPlanIds,
    modelSlugs: [...modelSlugs].sort(),
    codingPlans: ownPlans.length,
    apiRecords: ownApiPlans.length,
    models: modelSlugs.size
  };
  material.nonDeal = material.codingPlans > 0 || material.apiRecords > 0 || material.models > 0;
  return material;
}

/**
 * 厂商 slug 的**唯一解析实现**（四层，顺序固定）。
 *
 *   ① `vendor-slugs.json`   —— 人工覆盖表：人给可读短名的地方，优先级最高；
 *   ② `providers.json` 同名 provider 的 `slug` —— 已有的数据层登记；
 *   ③ 机器账本 `vendor-slug-ledger.json` —— 机器第一次分配后记住的已发布 URL；
 *   ④ `suggestSlug(name)`   —— 现场分配（拉丁名 → 短横线串；非拉丁名 → `vendor-<hash36>`）。
 *
 * 为什么是这四层而不是"谁有就用谁"：`/vendor/<slug>/` 是**已发布 URL**。
 * 同一条解析链同时服务构建（读）与 collect 侧写盘工具（写），所以两边对"这家该用哪个
 * slug"永远只有一份答案 —— 这正是本仓「机制只有一份实现」的纪律。
 *
 * 唯一硬拦（P1 保留的最后一条人工卡点，且是数据事故不是流程缺环）：
 * **账本已有 slug，但本次现算（覆盖表 / provider / suggest）得到另一个值** ⇒ 厂商改名后
 * 旧 URL 会 404。报错里同时给出旧值与新值；改路由必须走 `landing-aliases.json`（旧→新）。
 *
 * @param {string} vendorName A 空间厂商显示名
 * @param {{vendorSlugs?: object, providerTable?: object, ledger?: object}} [ctx]
 * @returns {{slug: string, source: 'override'|'provider'|'ledger'|'suggested',
 *   ledgerEntry: object|null, renameProblem: string|null, unreadable: boolean}}
 */
function resolveVendorSlug(vendorName, { vendorSlugs = {}, providerTable = {}, ledger = null } = {}) {
  const name = String(vendorName || '');
  const entry = ledgerByName(ledger).get(name) || null;
  const override = Object.prototype.hasOwnProperty.call(vendorSlugs, name) ? String(vendorSlugs[name] || '') : '';
  const providerEntry = Object.values(providerTable || {}).find(row => row && String(row.name || '') === name) || null;
  const fromProvider = providerEntry ? String(providerEntry.slug || '') : '';
  const computed = override ? { slug: override, source: 'override' }
    : (fromProvider ? { slug: fromProvider, source: 'provider' } : null);
  const suggested = suggestSlug(name);
  const readable = /[a-z0-9]/i.test(name);

  // 账本存在时：它记的是**已经发布过的 URL**。现算值（覆盖表 / provider / 兜底分配）
  // 只要与它不一致，就是"改名"或"换短名"——都会让旧 URL 404，必须让人显式决定。
  if (entry) {
    const current = computed ? computed.slug : suggested;
    const currentSource = computed ? computed.source : 'suggested';
    if (current !== entry.slug) {
      return {
        slug: entry.slug, source: 'ledger', ledgerEntry: entry, unreadable: false,
        renameProblem: `厂商「${name}」的 slug 变了：机器账本记录的是「${entry.slug}」（已发布 URL /vendor/${entry.slug}/），`
          + `现在按${currentSource === 'suggested' ? '名称现算' : currentSource === 'override' ? '人工覆盖表' : 'provider 登记'}解析到「${current}」。`
          + `继续构建会让旧地址 404 —— 若改名是有意的，请先在 scripts/data/landing-aliases.json 登记旧路由 → 新路由，`
          + `再由 collect 侧的写盘工具迁移账本（账本不许手改）；否则把覆盖值/provider slug 改回「${entry.slug}」。`
      };
    }
    return { slug: entry.slug, source: 'ledger', ledgerEntry: entry, renameProblem: null, unreadable: false };
  }
  if (computed) return { slug: computed.slug, source: computed.source, ledgerEntry: null, renameProblem: null, unreadable: false };
  // 首次遇到：现场分配并交给调用方打印，落盘由 collect 侧的写盘工具完成（构建不写源数据）。
  return { slug: suggested, source: 'suggested', ledgerEntry: null, renameProblem: null, unreadable: !readable };
}

/* ------------------------------------------------------------------ */
/* 规划：一次性产出全部落地页 + 被跳过项                                 */
/* ------------------------------------------------------------------ */

/**
 * 规划全部落地页。
 *
 * 顺序是稳定的（集合页 → 需求页/别名页 → 分类枢纽 → 分类页 → 厂商枢纽 → 厂商页），
 * 因此产物顺序、sitemap 顺序与报告顺序都确定，不受输入键序影响。
 */
// [T5-landing-592-explicit-match]
// T5 删除（census A · 半句）：删「全部来自既有数据关系的显式匹配。」与它前面的逗号—— **归一规则自证**（「显式匹配」说的是我们内部怎么归一的）。保留三组计数（Coding 套餐 N 条 / API 计费记录 N 条 / 归属模型 N 个）。⚠️ 22 个厂商页共用这一处 ⇒ 改一处全站生效；这是 `userNotes` 的一条（底部折叠），删完仍非空（该页族还有别的 userNotes 与共享句 ⇒ 不许空容器的断言仍绿）。
function planLandingPages(options = {}) {
  const deals = options.deals || [];
  const vendorKeyOf = options.vendorKeyOf || (deal => String((deal && deal.vendor) || ''));
  const vendorSlugs = options.vendorSlugs || loadVendorSlugs();
  const categorySlugs = options.categorySlugs || loadCategorySlugs();
  const pinnedList = options.pinned || loadPinned();
  const pinnedRoutes = new Set(pinnedList.map(row => row.route));
  const aliases = options.aliases || loadAliases();
  const eventCountOf = options.eventCountOf || (() => 0);
  const vendorThresholds = options.vendorThresholds || { minDeals: 2, minEvents: 3 };
  const categoryMinDeals = Number.isFinite(options.categoryMinDeals) ? options.categoryMinDeals : CATEGORY_MIN_DEALS;
  // v3.0 Stage E：厂商资料页的四份 join 输入。**全部可选** —— 不传时行为与 v2.x 逐字节相同
  // （这一段是纯追加：老调用方什么都不会变）。
  const plans = options.plans || [];
  const apiPlans = options.apiPlans || [];
  const providerTable = options.providerTable || {};
  const models = Array.isArray(options.models) ? options.models
    : ((options.models && Array.isArray(options.models.models)) ? options.models.models : []);
  const modelLinks = options.modelLinks || [];
  // P1：厂商 slug 机器账本（**只读**）。写入在 collect 侧的 `scripts/tools/sync-vendor-slug-ledger.js`，
  // 构建过程绝不写源数据；两边调用同一个 `resolveVendorSlug()`。
  const vendorSlugLedger = options.vendorSlugLedger || loadVendorSlugLedger();
  const ctx = { vendorThresholds, categoryMinDeals };

  const pages = [];
  const skipped = [];
  const problems = [];
  // P1：本次首次分配、等待 collect 侧落盘的新厂商；P2：本次自动降级的钉住路由；
  // warnings 是「不必停机但要让人看见」的机器可读行（构建日志逐行打印）。
  const autoSlugVendors = [];
  const warnings = [];
  const degradedPages = [];

  const dealPool = deals.filter(deal => deal && deal.type === 'deal');
  const countBy = (field, value) => dealPool.filter(deal => deal[field] === value).length;
  const countByCollection = slug => dealPool.filter(deal => (deal.collections || []).includes(slug)).length;
  const countByNeed = slug => dealPool.filter(deal => (deal.needs || []).includes(slug)).length;

  // ① 分类页（v1.1 的三个）与需求页（v1.2 的十个）：注册表仍来自 audience.js，
  //    这里只负责补 route/depth 与「别名替换」，与 v1.6 逐字一致。
  for (const spec of audience.COLLECTION_PAGES) {
    pages.push(Object.assign({}, spec, {
      kind: 'collection',
      route: `${spec.slug}/`,
      depth: 1,
      key: spec.slug,
      indexable: true,
      match: { by: 'collections', slug: spec.slug },
      count: countByCollection(spec.slug)
    }));
  }

  const needSpecs = audience.NEED_PAGES.map(spec => Object.assign({}, spec, {
    kind: 'need', route: `need/${spec.slug}/`, depth: spec.depth || 2, key: spec.slug, indexable: true,
    match: { by: 'needs', slug: spec.slug }, count: countByNeed(spec.slug)
  }));
  const needBySlug = new Map(needSpecs.map(spec => [spec.slug, spec]));

  for (const spec of needSpecs) {
    const alias = aliases[spec.route];
    if (!alias) {
      if (spec.count === 0) {
        // 空的需求页不生成（与 v1.2 一致）：一个空页面对读者没有价值，
        // 而「入口点了进空页」比没有入口更糟。首页入口行与 sitemap 读同一份计划，因此三处一致。
        skipped.push({ kind: 'need', key: spec.slug, route: spec.route, count: 0, reason: 'empty' });
        continue;
      }
      pages.push(spec);
      continue;
    }
    // 别名：条目集合必须与目标页逐条相同，否则这不是「同一主题的旧地址」
    const target = pages.find(page => page.route === alias.target);
    if (!target) {
      problems.push(`别名 ${spec.route} 的目标 ${alias.target} 不在本次生成的页面里`);
      continue;
    }
    /**
     * v1.8-seo-answer-pages：别名页**不再 noindex**。
     *
     * GitHub Pages 没有服务器 rewrite，canonical 是唯一能做的权重归并信号；
     * `noindex + 自指 canonical` 是两句话打架（noindex 赢，canonical 白写）。
     * 新契约：别名页可抓取、不进 noindex、**canonical 指向正本**、不进 sitemap。
     * 描述符里的 `canonicalRoute` 是 canonical 目标的**唯一声明**，页面渲染端与门禁都读它。
     * `indexable: true` 表示「不是 noindex」（robots 面）；「是不是独立可索引 URL」
     * 由 `canonicalRoute` 是否存在决定（见 `lib/seo.js` 的 `independent`）。
     */
    pages.push(Object.assign({}, spec, {
      kind: 'alias', key: spec.slug, indexable: true, canonicalRoute: alias.target,
      aliasOf: alias.target, aliasReason: alias.reason,
      match: target.match, count: target.count
    }));
  }

  // ② 分类页：人工允许表 ∩ 门槛 ∩ 「集合不与任何独立可索引页完全相同」
  // 别名页的条目集合故意与正本逐条相同，不参与「是否已有页面覆盖同一集合」的判据。
  const categoryPages = [];
  const indexableItemKeys = new Map(pages.filter(page => page.indexable && !page.canonicalRoute)
    .map(page => [itemKeyOf(itemsOf(page, deals, { vendorKeyOf }).map(deal => deal.id)), page.route]));

  for (const spec of CATEGORY_PAGES) {
    const route = `category/${spec.slug}/`;
    const pinned = pinnedRoutes.has(route);
    const count = countBy('category', spec.category);
    const ids = dealPool.filter(deal => deal.category === spec.category).map(deal => deal.id);
    const key = itemKeyOf(ids);
    const alreadyCovered = indexableItemKeys.has(key) && indexableItemKeys.get(key) !== route;
    const gate = shouldGenerateLandingPage('category', { key: spec.category, count, pinned, alreadyCovered }, ctx);
    if (!gate.ok) {
      skipped.push({
        kind: 'category', key: spec.category, route, count, reason: gate.reason,
        detail: alreadyCovered ? `条目集合与 ${indexableItemKeys.get(key)} 逐条相同（同一主题不重复建 URL）` : ''
      });
      continue;
    }
    indexableItemKeys.set(key, route);
    const page = Object.assign({}, spec, {
      kind: 'category', route, depth: depthOf(route), key: spec.category, indexable: true, pinned,
      match: { by: 'category', value: spec.category }, count
    });
    categoryPages.push(page);
  }

  // ③ 厂商页：规范厂商名分组，门槛复用订阅那一套；v3.0 起再加「至少一种非优惠资料」
  //
  // 候选厂商 = ① 有优惠的（A 空间显示名）∪ ② providers.json 里**有非优惠资料**的（B 空间）。
  // 第 ② 类以前根本进不了这张表（它们没有优惠），因此 `/vendor/<slug>/` 那时只能是优惠页；
  // 现在它们是「厂商统一资料页」的正当内容（判据在 `vendorMaterialOf()`，全部显式 join）。
  //
  // ⚠️ R5（队长 2026-10-01 修正）：第 ② 类**只收「在 A 空间有厂商名」的** provider
  // （`vendorKey !== null`）。`/vendor/<slug>/` 的身份键是 A 空间厂商名；给一个没有 A 空间
  // 厂商名的 provider 建路由，就必须新编一个厂商身份或改身份键 —— 两者都不接受。
  // 实测 trae / qoder / codebuddy / qoder-intl 属于这一类，它们的资料走 /plans/coding/ 与 /plans/。
  const vendorCounts = new Map();
  for (const deal of dealPool) {
    const name = vendorKeyOf(deal);
    if (!name) continue;
    vendorCounts.set(name, (vendorCounts.get(name) || 0) + 1);
  }
  const materialByVendor = new Map();
  const noIdentity = [];
  for (const [key, entry] of Object.entries(providerTable)) {
    const name = String((entry && entry.name) || '');
    if (!name) continue;
    const material = vendorMaterialOf({ vendorName: name, providerTable, plans, apiPlans, models, modelLinks });
    materialByVendor.set(name, material);
    if (!material.nonDeal) continue;
    if (!material.hasVendorIdentity) {
      // 有资料、但**没有 A 空间厂商名**：不生成路由、也不当成门槛不达标 —— 单独记一条
      // `no-vendor-identity`，报告里读得懂"为什么这一家没有 /vendor/ 页面"。
      noIdentity.push({
        kind: 'vendor', key: name, providerKey: key, route: null,
        count: vendorCounts.get(name) || 0, eventCount: eventCountOf(name) || 0,
        reason: 'no-vendor-identity',
        detail: `provider「${key}」在 A 空间没有厂商名（vendorKey=null）：/vendor/<slug>/ 的身份键是 A 空间厂商名，`
          + `为它建路由必须新编身份或改身份键。它的资料走 /plans/coding/ 与 /plans/ 枢纽。`
          + `（Coding 套餐 ${material.codingPlans} 条 / API 记录 ${material.apiRecords} 条 / 模型 ${material.models} 个）`
      });
      continue;
    }
    if (!vendorCounts.has(name)) vendorCounts.set(name, 0);
  }
  const vendorPages = [];
  const vendorNames = [...vendorCounts.keys()].sort((a, b) => (vendorCounts.get(b) - vendorCounts.get(a)) || a.localeCompare(b, 'zh'));
  for (const name of vendorNames) {
    const count = vendorCounts.get(name);
    const material = materialByVendor.get(name) || vendorMaterialOf({ vendorName: name });
    // P1：slug 解析改成四层（人工覆盖 → provider 登记 → 机器账本 → suggestSlug），
    // 唯一实现在 `resolveVendorSlug()`；构建与 collect 侧写盘工具共用它。
    // 这条链不再是"没有登记就停机"：首次遇到的新厂商现场分配（打印 `auto-slug:`），
    // 落盘由 collect 侧写盘工具完成。唯一硬拦见 `renameProblem` 分支。
    const eventCount = eventCountOf(name) || 0;
    const eligible = count >= vendorThresholds.minDeals || eventCount >= vendorThresholds.minEvents || material.nonDeal;
    const resolution = resolveVendorSlug(name, { vendorSlugs, providerTable, ledger: vendorSlugLedger });
    const slug = resolution.slug;
    const route = `vendor/${slug}/`;
    if (!eligible) {
      skipped.push({ kind: 'vendor', key: name, route, count, eventCount, reason: 'below-threshold' });
      continue;
    }
    if (resolution.renameProblem) {
      // 唯一保留的硬拦：账本已发布过的 slug 与现算不一致（改名 ⇒ 旧 URL 404）。
      problems.push(resolution.renameProblem);
      continue;
    }
    if (resolution.source === 'suggested') {
      // 首次遇到：现场分配 + 打印，落盘交给 collect 侧写盘工具（它调用同一个解析函数）。
      autoSlugVendors.push({ vendorName: name, slug, firstRoutedAt: '', status: 'active' });
      if (resolution.unreadable) {
        // 非拉丁厂商名：suggestSlug 会给出 `vendor-<hash36>`。长尾不该停机 —— 先给稳定 URL，
        // 只在 Summary/日志里留一行，人可事后到覆盖表写可读短名。
        warnings.push(`warn: unreadable-slug 「${name}」→ vendor/${slug}/（非拉丁厂商名：先按稳定哈希分配，长尾不停机；可事后在 scripts/data/vendor-slugs.json 覆盖成可读值）`);
      }
    }
    const pinned = pinnedRoutes.has(route);
    const gate = shouldGenerateLandingPage('vendor', {
      key: name, count, eventCount, pinned, nonDealMaterial: material.nonDeal
    }, ctx);
    if (!gate.ok) {
      skipped.push({ kind: 'vendor', key: name, route, count, eventCount, reason: gate.reason });
      continue;
    }
    // 只有**没有优惠**、靠非优惠资料达标的厂商才换标题与首段说明 ——
    // 已有 9 家厂商页的 title / heading 逐字节不变（纯追加的边界就在这里）。
    const nonDealOnly = count === 0;
    const title = nonDealOnly ? `${name} 的 AI 资料` : `${name} 的 AI 优惠`;
    const heading = nonDealOnly ? `${name}：套餐、API 计费与模型资料` : `${name} 的 AI 优惠与免费额度`;
    const description = nonDealOnly
      ? `${name} 在本站收录的 Coding 套餐、API 计费记录、模型归属与最近变化。所有内容来自已有数据关系（join），不复制生产事实。`
      : `${name} 当前收录的 AI 优惠与免费额度：逐条标注福利类型、领取门槛与是否中国大陆可用，并给出该厂商最近的变化。`;
    // 厂商页首屏**不再有任何说明**（DESIGN-RULES H13：标题 / 条目数 / 更新时间）。原先那段
    // 「厂商名按站内归一规则合并 / 条数只统计当前有效优惠 / 每个数字都来自当前数据」
    // 属于**维护口径**（prompt §6D 点名不要在厂商页顶部展开归一规则与 slug），
    // 已整段移入 docs/DESIGN-RULES.md 的二级数据页口径归档。
    // `.cstop` 已经写着「共 N 条 · 数据更新 …」，所以这里连条数也不必再写一遍。
    // 「只列当前有效的优惠」与「这家只有资料」属于分类边界 → 底部折叠。
    const scopeNote = nonDealOnly
      ? '本站目前没有收录这家厂商当前有效的优惠；下面是它的套餐、API 计费与模型资料。'
      : '只列当前有效的优惠；已结束的条目在历史档案里。';
    /**
     * 本页的**自有说明**（进底部折叠 `.page-notes`）——「先登记、后输出」的那一侧：
     * 每一条都带**类型标签**（`kind`），因为说明意图清单要按它分类；
     * ⚠️ 那份清单**不在产物目录里**（t3 起）：它是 `<产物目录>.notes.ndjson`（默认 `ROOT/dist.notes.ndjson`）。
     * 搬出去的理由是「产物里不许有可下载的数据文件」—— 清单是构建过程的意图侧快照，
     * 不是上线内容，留在产物里等于给任何以产物目录为根的预览服务多送一份可下载文件。
     * 文字仍然是纯字符串数组 `userNotes`（`audience-selftest` 校验的就是那个形状，
     * 也是渲染层唯一的输入）。
     */
    const noteRows = [{ kind: 'scope-note', text: scopeNote }];
    if (material.nonDeal) {
      // ⚠️ t13 跨范围修复（阻断级）：这里原本写的是 `**join**` —— Markdown 记号会被**逐字**
      // 渲染给读者（当时 `.snote` 是纯 HTML 容器），并被构建期的「作者正文无 Markdown 记号」
      // 门禁当场判红。强调一律用 `<b>`，去掉记号后可见文本一个字都没变。
      noteRows.push({
        kind: 'vendor-material-note',
        text: `这一页还<b>关联</b>了该厂商的非优惠资料：Coding 套餐 ${material.codingPlans} 条、`
          + `API 计费记录 ${material.apiRecords} 条、Model Registry 归属模型 ${material.models} 个。`
      });
    }
    const userNotes = noteRows.map(row => row.text);
    vendorPages.push({
      kind: 'vendor', key: name, slug, route, depth: depthOf(route), indexable: true, pinned,
      title, heading, description, userNotes, noteRows,
      match: { by: 'vendor', value: name }, count, eventCount,
      // v3.0 Stage E：资料页 join 的输入（渲染层只读这些键，不重新判据）。
      material,
      nonDealMaterial: material.nonDeal,
      providerKey: material.providerKey
    });
  }

  // ④ 分类页里未成页的，逐个给出理由（报告与日志要能读到「为什么没有这一页」）
  const listedCategories = new Set();
  for (const [category, slug] of Object.entries(categorySlugs)) {
    if (CATEGORY_PAGES.some(page => page.category === category)) continue;
    listedCategories.add(category);
    const exclusion = CATEGORY_EXCLUSIONS.find(row => row.category === category);
    skipped.push({
      kind: 'category', key: category, route: `category/${slug}/`, count: countBy('category', category),
      reason: exclusion ? 'excluded-by-policy' : 'below-threshold',
      detail: exclusion ? exclusion.reason : ''
    });
  }
  for (const exclusion of CATEGORY_EXCLUSIONS) {
    if (CATEGORY_PAGES.some(page => page.category === exclusion.category)) continue;
    if (listedCategories.has(exclusion.category)) continue;
    skipped.push({
      kind: 'category', key: exclusion.category, route: exclusion.slug ? `category/${exclusion.slug}/` : null,
      count: countBy('category', exclusion.category), reason: 'excluded-by-policy', detail: exclusion.reason
    });
  }
  for (const page of CATEGORY_PAGES) {
    if (!categorySlugs[page.category]) {
      problems.push(`分类页表里的「${page.category}」在 scripts/data/category-slugs.json 里没有 slug`);
    }
    if (!categories.CATEGORIES.includes(page.category)) {
      problems.push(`分类页表里的「${page.category}」不是 categories.js 的合法枚举值`);
    }
  }

  // ⑤ 钉住的路由：数据跌出门槛时**自动降级为 noindex 页**，而不是停机等人写别名
  //    ------------------------------------------------------------------
  // 策略写死（与 docs/BUILD.md 同一条）：**保住 URL 优先于保持可索引**。
  // 已发布过的 /vendor/<slug>/ 一旦 404，收录与外部链接就断了；让它变成
  // `noindex,follow` 的维护页（自指 canonical、不进 sitemap）代价只是"暂时不索引"，
  // 数据回到门槛后自动恢复。人的配置错误仍然保留硬拦（别名页没钉住，见 ⑦）。
  const degradedNoteOf = reason => `本页当前没有可展示的条目（机器判据：${reason}）。URL 保持不变，以避免已收录的地址失效；`
    + '内容会在数据回到自动生成门槛后自动恢复。页面暂时以 noindex,follow 输出、不进 sitemap —— '
    + '「保住 URL」优先于「保持可索引」。';
  const makeDegradedPage = (route, declaration, reason) => {
    const kind = declaration.kind === 'hub' ? 'hub'
      : (declaration.kind || (route.startsWith('vendor/') ? 'vendor'
        : route.startsWith('category/') ? 'category'
          : route.startsWith('need/') ? 'need' : 'collection'));
    const noteRows = [
      { kind: 'scope-note', text: degradedNoteOf(reason) },
      { kind: 'degraded-note', text: '如果你认为这一页不该降级：先确认数据（deals / deal-history / 资料 join）是否真的低于门槛；'
        + '如果页面确实应该保留，请让人工覆盖表或机器账本给出决定，而不是改渲染层。' }
    ];
    const userNotes = noteRows.map(row => row.text);
    const segments = route.split('/').filter(Boolean);
    const base = {
      kind, route, depth: depthOf(route), indexable: false, pinned: true, degraded: true,
      degradedReason: reason, count: 0, userNotes, noteRows, canonicalRoute: null, aliasOf: null
    };
    if (kind === 'vendor') {
      const name = String(declaration.key || '');
      const material = vendorMaterialOf({ vendorName: name, providerTable, plans, apiPlans, models, modelLinks });
      return Object.assign(base, {
        key: name, slug: segments[1] || suggestSlug(name),
        title: `${name}（资料更新中）`,
        heading: `${name} 的 AI 优惠与免费额度`,
        description: `${name} 目前低于自动生成门槛，本页保留原 URL，内容在数据恢复后自动更新。`,
        match: { by: 'vendor', value: name },
        eventCount: eventCountOf(name) || 0,
        material, nonDealMaterial: material.nonDeal, providerKey: material.providerKey
      });
    }
    if (kind === 'category') {
      const key = String(declaration.key || '');
      return Object.assign(base, {
        key, slug: categorySlugs[key] || segments[1] || key,
        title: `${key}（页面维护中）`,
        heading: `「${key}」分类`,
        description: `「${key}」分类当前低于自动生成门槛，本页保留原 URL，内容在数据恢复后自动更新。`,
        match: { by: 'category', value: key }
      });
    }
    if (kind === 'hub') {
      const hubBase = [CATEGORY_HUB, VENDOR_HUB].find(hub => hub.route === route) || VENDOR_HUB;
      return Object.assign({}, hubBase, base, {
        key: hubBase.key, slug: hubBase.slug, title: hubBase.title, heading: hubBase.heading,
        description: hubBase.description, match: null, children: []
      });
    }
    if (kind === 'need') {
      const key = String(declaration.key || segments[1] || '');
      return Object.assign(base, {
        key, slug: key, title: `${key}（页面维护中）`, heading: `${key} 相关优惠`,
        description: '这一页当前低于自动生成门槛，本页保留原 URL，内容在数据恢复后自动更新。',
        match: { by: 'needs', slug: key }
      });
    }
    const key = String(declaration.key || segments[0] || '');
    return Object.assign(base, {
      key, slug: key, title: `${key}（页面维护中）`, heading: key,
      description: '这一页当前低于自动生成门槛，本页保留原 URL，内容在数据恢复后自动更新。',
      match: { by: 'collections', slug: key }
    });
  };
  const pinnedByRoute = new Map(pinnedList.map(row => [row.route, row]));
  const generatedBeforeHubs = new Set([
    ...pages.map(page => page.route),
    ...categoryPages.map(page => page.route),
    ...vendorPages.map(page => page.route)
  ]);
  for (const route of pinnedRoutes) {
    if (generatedBeforeHubs.has(route)) continue;
    const declaration = pinnedByRoute.get(route) || {};
    const guessedKind = declaration.kind || (route === 'vendor/' || route === 'category/' ? 'hub'
      : route.startsWith('vendor/') ? 'vendor'
        : route.startsWith('category/') ? 'category'
          : route.startsWith('need/') ? 'need' : 'collection');
    // 枢纽页要等 ⑤ 之后才知道子页数；别名页缺失是人的配置错误（保留 ⑦ 的硬拦）。
    if (guessedKind === 'hub' || guessedKind === 'alias') continue;
    const hit = skipped.find(row => row.route === route);
    const page = makeDegradedPage(route, declaration, hit ? hit.reason : 'not-in-plan');
    if (page.kind === 'vendor') vendorPages.push(page);
    else if (page.kind === 'category') categoryPages.push(page);
    else pages.push(page);
    degradedPages.push(page);
    // `seo.validate()` 的 gate-pinned-missing 会把「钉住路由出现在 skipped」判红；
    // 这一条已被降级页取代，从 skipped 移走（日志改由 warnings 的 auto-degraded 行承担）。
    const at = skipped.findIndex(row => row.route === route);
    if (at >= 0) skipped.splice(at, 1);
    warnings.push(`auto-degraded: ${route}（${page.degradedReason}；保留 URL · noindex,follow · 不进 sitemap）`);
  }

  // ⑥ 枢纽页：有子页才生成（永不出空目录页）；钉住的枢纽页空掉时同样降级。
  const hubPages = [];
  for (const hub of [CATEGORY_HUB, VENDOR_HUB]) {
    const children = hub.key === 'vendor' ? vendorPages : categoryPages;
    const gate = shouldGenerateLandingPage('hub', { children: children.length }, ctx);
    if (!gate.ok) {
      skipped.push({ kind: 'hub', key: hub.key, route: hub.route, count: 0, reason: gate.reason });
      continue;
    }
    hubPages.push(Object.assign({}, hub, {
      indexable: true, pinned: pinnedRoutes.has(hub.route), match: null, count: children.length, children
    }));
  }
  for (const route of pinnedRoutes) {
    if (route !== CATEGORY_HUB.route && route !== VENDOR_HUB.route) continue;
    if (hubPages.some(hub => hub.route === route)) continue;
    const page = makeDegradedPage(route, pinnedByRoute.get(route) || { kind: 'hub' }, 'no-children');
    hubPages.push(page);
    degradedPages.push(page);
    const at = skipped.findIndex(row => row.route === route);
    if (at >= 0) skipped.splice(at, 1);
    warnings.push(`auto-degraded: ${route}（no-children；保留 URL · noindex,follow · 不进 sitemap）`);
  }

  const ordered = [
    ...pages.filter(page => page.kind === 'collection'),
    ...pages.filter(page => page.kind === 'need' || page.kind === 'alias'),
    ...hubPages.filter(page => page.key === 'category'),
    ...categoryPages,
    ...hubPages.filter(page => page.key === 'vendor'),
    ...vendorPages
  ];

  // R5：没有 A 空间厂商名的 provider 逐条记进 `skipped`（reason=no-vendor-identity），
  // 报告与构建日志因此能回答「为什么这一家没有 /vendor/ 页面」——
  // 这比让它悄悄消失、或者硬造一个身份要好。
  skipped.push(...noIdentity);

  // ⑦ 兜底：仍然没有生成的钉住路由 = 人的配置错误（或别名目标缺失），保留硬拦。
  const generatedRoutes = new Set(ordered.map(page => page.route));
  for (const route of pinnedRoutes) {
    if (generatedRoutes.has(route)) continue;
    const hit = skipped.find(row => row.route === route);
    problems.push(`钉住的路由 ${route} 本次没有生成，且无法自动降级（原因：${hit ? hit.reason : '不在计划里'}）—— 请检查 scripts/data/landing-pages.json / landing-aliases.json 的登记`);
  }
  for (const page of ordered) {
    if (page.pinned && !page.degraded && page.kind !== 'hub' && page.count === 0) {
      problems.push(`钉住的页面 ${page.route} 条数为 0 —— 空页面对读者没有价值，请补数据或登记别名`);
    }
    if (page.kind === 'alias' && !pinnedRoutes.has(page.route)) {
      problems.push(`别名页 ${page.route} 没有出现在 landing-pages.json 的钉住列表里`);
    }
  }

  return {
    pages: ordered, skipped, problems, vendorPages, categoryPages, hubPages,
    // P1/P2：构建侧只读输出。`autoSlugVendors` 是 collect 侧写盘工具要落盘的新厂商；
    // `degradedPages` 是本次自动降级的路由；`warnings` 是 `warn:` / `auto-degraded:` 机器行。
    autoSlugVendors, degradedPages, warnings, vendorSlugLedger
  };
}

/**
 * 输出层数 = 路由里有多少个路径段（`category/api/` ⇒ 2 ⇒ `'../../'`）。
 * 写死的症状极隐蔽：页面能正常打开、内容都对，**只有所有内链 404**。
 */
function depthOf(route) {
  return String(route || '').split('/').filter(Boolean).length;
}

/** 未登记 slug 时的建议值：拉丁名取小写连字符，中文名取拼音不可得时退回稳定哈希后缀 */
function suggestSlug(name) {
  const latin = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (latin) return latin;
  let hash = 0;
  const text = String(name);
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) % 1000000;
  return `vendor-${hash.toString(36)}`;
}

/* ------------------------------------------------------------------ */
/* 摘要与变化                                                           */
/* ------------------------------------------------------------------ */

const RECENT_DAYS = 7;

function daysBetween(fromIso, toIso) {
  const from = new Date(`${String(fromIso).slice(0, 10)}T00:00:00+08:00`);
  const to = new Date(`${String(toIso).slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to - from) / 86400000);
}

/**
 * 数据摘要：**每一个数字都现算**，并带上它是怎么算出来的（`source`）。
 *
 * `source` 不是给人看的装饰：seo.js 会拿着同一条判据在另一处独立重算，对不上就红 ——
 * 「页面上写 12、实际列 7」这类错误因此在构建期就不可能出现。
 *
 * 值为 0 的项**不渲染**（H4 缺值不占位）：一屏「0 条无需信用卡」既占地方又没有信息量。
 */
function summaryOf(spec, items, ctx = {}) {
  const list = items || [];
  const asOf = String(ctx.asOf || '').slice(0, 10);
  const vendorKeyOf = ctx.vendorKeyOf || (deal => String((deal && deal.vendor) || ''));
  const rows = [];

  rows.push({
    label: '当前条目', value: list.length, unit: '条',
    source: 'type=deal 且未过期，且命中本页判据'
  });

  const noCard = list.filter(deal => deal.claimRequirements && deal.claimRequirements.creditCardRequired === false);
  if (noCard.length) {
    rows.push({
      label: '无需信用卡', value: noCard.length, unit: '条',
      source: 'claimRequirements.creditCardRequired === false（来源明说不需要）'
    });
  }

  // v1.8-seo-answer-pages：答案页（/free-api/）的门槛速查表把「实名认证」当第一道门槛。
  // 这里只数**明确为 true** 的条目 —— 与 `seo.recomputeSummary()` 的独立重算逐字同源，
  // 「没写」不并进「不需要」（三态纪律）。
  const needIdentity = list.filter(deal => deal.eligibilityDetail
    && deal.eligibilityDetail.identityVerificationRequired === true);
  if (needIdentity.length) {
    rows.push({
      label: '需实名认证', value: needIdentity.length, unit: '条',
      source: 'eligibilityDetail.identityVerificationRequired === true（来源明说需要实名）'
    });
  }

  const chinaUsable = list.filter(deal => deal.availability && deal.availability.chinaUsable === true);
  if (chinaUsable.length) {
    rows.push({
      label: '确认中国大陆可申请', value: chinaUsable.length, unit: '条',
      source: 'availability.chinaUsable === true（来源写明可用）'
    });
  }

  const freeApi = list.filter(deal => Array.isArray(deal.benefitType) && deal.benefitType.includes('free_api'));
  if (freeApi.length) {
    rows.push({ label: '含免费 API', value: freeApi.length, unit: '条', source: 'benefitType 含 free_api' });
  }

  const freeModel = list.filter(deal => Array.isArray(deal.benefitType) && deal.benefitType.includes('free_model'));
  if (freeModel.length) {
    rows.push({ label: '含免费模型', value: freeModel.length, unit: '条', source: 'benefitType 含 free_model' });
  }

  if (asOf) {
    const recent = list.filter(deal => {
      const days = daysBetween(deal.firstSeen, asOf);
      return days !== null && days >= 0 && days < RECENT_DAYS;
    });
    if (recent.length) {
      rows.push({
        label: `最近 ${RECENT_DAYS} 天新增`, value: recent.length, unit: '条',
        source: `firstSeen 距数据更新日（${asOf}）不足 ${RECENT_DAYS} 天`
      });
    }
  }

  const vendorCount = new Set(list.map(deal => vendorKeyOf(deal)).filter(Boolean)).size;
  if (vendorCount > 1) {
    rows.push({ label: '覆盖来源', value: vendorCount, unit: '家', source: '本页条目的规范厂商名去重计数' });
  }
  const categoryCount = new Set(list.map(deal => deal.category).filter(Boolean)).size;
  if (categoryCount > 1) {
    rows.push({ label: '覆盖分类', value: categoryCount, unit: '类', source: '本页条目的 category 去重计数' });
  }

  void spec;
  return rows;
}

/** 摘要行的机器可读校验值：{label: value}，供 seo.js 独立重算对账 */
function summaryValues(rows) {
  const out = {};
  for (const row of rows || []) out[`${row.label}`] = row.value;
  return out;
}

/**
 * 该主题的「最近变化」：按**条目 id 归属**过滤雷达分栏。
 *
 * 为什么不按厂商名过滤：雷达条目上的 `vendor` 是采集时的原始字符串，
 * 而 v1.7 起页面用的是规范厂商名（见 docs/SCHEMA-v1.7.md §3）。按 id join 回去
 * 既与厂商改名无关，也让「人群页 / 分类页 / 厂商页」共用同一个纯函数。
 *
 * 不碰 changes.js 的判据（v1.6 报告明确的前置条件）：这里只做视图过滤。
 */
function topicChangesOf(radar, dealIds, options = {}) {
  const sectionOrder = options.sectionOrder || ['created', 'changed', 'endingSoon', 'ended', 'restored'];
  // `dealIds === null` ⇒ **不按 id 过滤**（取该分栏的全部条目）。
  // 为什么必须显式分流：`new Set(dealIds || [])` 会把 null 退化成「空集 ⇒ 一条都不出」，
  // 而首页折叠线以下那一块要的正是「不限定某批条目」这一档（契约第 9.1 条，v3.2 新增语义）。
  // 其余入参（数组 / Set）行为与今天**逐字节一致** —— 五个既有调用点一行都不用改。
  const ids = dealIds === null ? null : (dealIds instanceof Set ? dealIds : new Set(dealIds || []));
  // `options.excludeIds`：在 id 过滤**之后**再减掉一批 id。首页用它排除**首屏条带里已经出现过**
  // 的条目，于是新块与条带在结构上不可能重复展示同一件事。不传 ⇒ 空集 ⇒ 行为与今天逐字节一致。
  const excludeIds = options.excludeIds instanceof Set ? options.excludeIds : new Set(options.excludeIds || []);
  if (!radar) return { availability: 'unavailable', asOf: null, startedAt: null, sections: [], totals: 0 };
  const sections = [];
  let totals = 0;
  for (const key of sectionOrder) {
    const bucket = (radar.sections && radar.sections[key]) || { items: [] };
    const items = (bucket.items || [])
      .filter(item => item && (ids === null || ids.has(item.id)) && !excludeIds.has(item.id));
    if (!items.length) continue;
    totals += items.length;
    sections.push({ key, items });
  }
  return {
    availability: radar.availability || 'unavailable',
    asOf: radar.asOf || null,
    startedAt: radar.startedAt || null,
    sections,
    totals
  };
}

/* ------------------------------------------------------------------ */
/* 统计（报告与门禁用同一份口径）                                        */
/* ------------------------------------------------------------------ */

function statsOf(pages) {
  const list = pages || [];
  const byKind = {};
  for (const page of list) byKind[page.kind] = (byKind[page.kind] || 0) + 1;
  return {
    total: list.length,
    indexable: list.filter(page => page.indexable).length,
    noindex: list.filter(page => !page.indexable).length,
    // v1.8：canonical 收口到正本的别名页（可抓取、不进 sitemap）。与 noindex 分开计数。
    canonicalAliases: list.filter(page => Boolean(page.canonicalRoute)).length,
    byKind
  };
}

module.exports = {
  VENDOR_SLUGS_FILE,
  CATEGORY_SLUGS_FILE,
  PINNED_FILE,
  ALIASES_FILE,
  VENDOR_SLUG_LEDGER_FILE,
  SLUG_RE,
  CATEGORY_MIN_DEALS,
  RECENT_DAYS,
  CATEGORY_PAGES,
  CATEGORY_PREDICATES,
  CATEGORY_EXCLUSIONS,
  VENDOR_HUB,
  CATEGORY_HUB,
  loadVendorSlugs,
  loadVendorSlugLedger,
  ledgerByName,
  resolveVendorSlug,
  loadCategorySlugs,
  loadPinned,
  loadAliases,
  validateSlugTable,
  shouldGenerateLandingPage,
  vendorMaterialOf,
  itemsOf,
  itemKeyOf,
  planLandingPages,
  vendorEventCountsOf,
  summaryOf,
  summaryValues,
  topicChangesOf,
  statsOf,
  suggestSlug,
  depthOf,
  CATEGORIES: categories.CATEGORIES
};
