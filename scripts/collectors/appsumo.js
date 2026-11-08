/**
 * AppSumo lifetime deal 采集器（2026-11 供给端 P0）。
 *
 * ## 推翻一条历史结论（原文见本文件 git 历史 / `global_deals.js` 文件头）
 *
 * 旧结论：「AppSumo 首页纯客户端渲染（`__NEXT_DATA__` 中无 deal 数据，页面 0 个 /deal 链接），
 * 实测产出为 0，按『零产出的采集器不上线』原则不注册」。
 *
 * **那条结论是抓错 URL 导致的**：旧观察抓的是首页 `https://appsumo.com/`，而数据在
 * **集合页** `/collections/new/`、`/collections/ending-soon/`、`/browse/` 上，且是
 * 服务端渲染的 —— 页面里 `<script id="__NEXT_DATA__" type="application/json">` 直接带着
 * 每页的 deal 数组（`props.pageProps.deals.deals`），价格、原价、起止日期、AppSumo 自己的
 * 分类/标签全都在里面。2026-11-08 本地实测：`/browse/` 658 KB / 403 products，
 * `/collections/new/` 54 条（SSR 第 1 页 20 条）、`/collections/ending-soon/` 15 条，
 * 三个 URL 全部 HTTP 200。所以「纯客户端渲染 ⇒ 0 产出」不成立，这里按新证据重新上线。
 *
 * ## 为什么只取两个集合页、且只取 SSR 的第 1 页
 *
 * ① 需求边界：只做 **new / ending-soon** 两个维度（周级高频、自带「新上架」「即将结束」），
 *    绝不把 `/browse/` 的 403 条全量灌进去 —— 那会把首页冲成「AppSumo 目录」，
 *    重演 179 条里 98 条 tool 稀释优惠流的老问题。
 * ② 分页是**客户端行为**：实测 `/collections/new/?page=2` 的 `__NEXT_DATA__` 里
 *    `meta.page` 仍是 1、仍是同一批 20 条。静态抓取拿不到第 2/3 页，也不为了凑数去
 *    逆向它们的 XHR 接口（那等于把采集建立在未公开契约上）。54 条里只看得到第 1 页 20 条，
 *    这一点如实写在报告里，不假装全量。
 *
 * ## AI 筛选：先找分类页，找不到才用显式关键词表
 *
 * 实测：`/categories/` → 404；`/browse/` 站内链接里只有 `/collections/{new,ending-soon,
 * alternative-to,best-for,appsumo-originals}/`，没有分类入口；`/collections/ai/` → HTTP 200
 * 但 `__NEXT_DATA__` 里 0 条 deal（一个空的 smart collection）。**没有可用的 AI 分类页**。
 * 因此按需求用**显式关键词表**筛，并且同时利用 AppSumo 自己打的分类/子分类/标签
 * （`attributes.category` / `attributes.subcategory` / `product_tags`，这是来源方的结构化声明，
 * 比我们从文案猜更可靠）。两张表都写在本文件里、可逐条复核。
 *
 * 无人值守纪律：**被筛掉的前 20 个产品名 + 原因必须打印到日志**（见 `logDropped()`）——
 * 「筛掉了但没人知道筛错了」是这一层最危险的失败形态。
 *
 * ## 字段与数据契约
 *
 * 一条记录至少要有：标题、产品链接、**折扣价 vs 原价两个数**、截止时间。现有 v2 契约里
 * 没有独立的 price/originalPrice 字段（`validateDeal` 的 allowed 白名单是封闭的），
 * 所以两个数落在既有字段里：
 *   · `discountInfo` —— 「AppSumo 终身授权限时折扣：现价 $59，原价 $299（省 80%）」；
 *   · `priceLine`    —— 「$59 终身（原价 $299）」。
 * 截止时间取 `dates.end_date`（ending-soon 页自带；new 页大部分为 null），由 `makeDeal()`
 * 归一成 `expiresAt`（YYYY-MM-DD，北京时间）。**不补造日期**：页面没写的就没有。
 *
 * 只读公开页面、只按 robots.txt 允许的路径抓取（`lib/http.js` 已统一检查 robots）：
 * AppSumo 的 `robots.txt` 对 `User-agent: *` 只禁 `/~*`、`/profile/id/`、`/account/`，
 * 两个集合页均在允许范围内。
 */

const { getText } = require('../lib/http');
const { cleanText } = require('../lib/schema');

const ORIGIN = 'https://appsumo.com';

/**
 * 只取这两个集合页。顺序即优先级（后面的同 URL 条目只用于补截止日期）。
 * 注意：URL 里刻意不带任何 query，`?page=N` 已被实测证明不影响 SSR 内容。
 */
const COLLECTIONS = [
  { id: 'new', url: `${ORIGIN}/collections/new/` },
  { id: 'ending-soon', url: `${ORIGIN}/collections/ending-soon/` }
];

/** 日志里最多打印多少个被筛掉的产品名（需求：前 20 个） */
const MAX_DROPPED_LOGGED = 20;

/** AppSumo 的终身授权计划名（`unique_plan_types` 里的第一元） */
const LIFETIME_PLAN = 'Lifetime Deal';

/**
 * AI 筛选表 ①：**来源方自己的**分类 / 子分类 / 标签。
 * 这些值来自 `attributes.category` / `attributes.subcategory` / `attributes.group` /
 * `product_tags`，是 AppSumo 编辑打的标签，不是我们从标题猜的。
 */
const AI_TAXONOMY_RE = /\bai\b|artificial intelligence|chatbots-ai-agents|ai-agents|ai-video|ai-notetakers|ai-writing|ai-photos|ai-audio|machine-learning|generative/i;

/**
 * AI 筛选表 ②：**显式关键词表**（标题 + 卡片描述）。
 *
 * 刻意用「词边界」而不是裸子串：`email` 里含 `ai`、`said` 里也含 `ai`，裸子串会把
 * 大量非 AI 产品放进来。`\b` 在 `AI-powered` / `AI-ready` / `ai-agent` 这类连字符写法上
 * 仍然成立（连字符不是单词字符），所以不会漏掉正常写法。
 *
 * 表里只放**指向 AI 能力本身**的词；「automation / workflow / platform / cloud」这类
 * 泛技术词一个都不收 —— 它们是目录站里最大的噪音源。
 */
const AI_TEXT_RE = new RegExp(
  [
    '\\bai\\b',
    '\\ba\\.i\\.\\b',
    '\\bllm\\b',
    '\\bgpt(?:-\\d+(?:\\.\\d+)?)?\\b',
    '\\bchatgpt\\b',
    '\\bclaude\\b',
    '\\bcodex\\b',
    '\\bgemini\\b',
    '\\bcopilot\\b',
    '\\bagentic\\b',
    '\\bchatbots?\\b',
    '\\bmachine learning\\b',
    '\\bdeep learning\\b',
    '\\bgenerative\\b',
    '\\bdiffusion model\\b',
    '\\bmidjourney\\b',
    '\\bstable diffusion\\b',
    '\\bopenai\\b',
    '\\banthropic\\b',
    '\\btext-to-(?:image|video|speech|audio)\\b',
    '\\bspeech-to-text\\b',
    '\\bembeddings?\\b',
    '\\bneural network\\b',
    // 中文写法（AppSumo 是英文站，但产品名偶尔带中文，收着不吃亏）
    '人工智能',
    '大模型',
    '智能体'
  ].join('|'),
  'i'
);

/* ------------------------------------------------------------------ */
/* 解析（纯函数，fixture 只喂 DOM，不碰网络）                            */
/* ------------------------------------------------------------------ */

/**
 * 从 HTML 里取出 `__NEXT_DATA__` 的 deal 数组。
 * 取不到返回 null —— 与「页面在但这次没有 deal」区分开（后者返回 []）。
 */
function readNextDataDeals(html) {
  const match = String(html || '').match(
    /<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
  const list = parsed && parsed.props && parsed.props.pageProps &&
    parsed.props.pageProps.deals && parsed.props.pageProps.deals.deals;
  return Array.isArray(list) ? list : null;
}

function brand(publicName) {
  return cleanText(publicName, 150);
}

function productUrl(raw) {
  const href = raw && raw.get_absolute_url;
  if (!href || typeof href !== 'string') return null;
  try {
    return new URL(href, ORIGIN).toString();
  } catch (error) {
    return null;
  }
}

function taxonomyText(raw) {
  const attrs = (raw && raw.attributes) || {};
  const parts = [];
  for (const key of ['category', 'subcategory', 'group']) {
    if (Array.isArray(attrs[key])) parts.push(...attrs[key].filter(value => typeof value === 'string'));
  }
  if (Array.isArray(raw && raw.product_tags)) {
    parts.push(...raw.product_tags.filter(value => typeof value === 'string'));
  }
  return parts.join(' | ');
}

function isAi(raw) {
  const text = `${brand(raw && raw.public_name)} ${cleanText(raw && raw.card_description, 240)}`;
  return AI_TAXONOMY_RE.test(taxonomyText(raw)) || AI_TEXT_RE.test(text);
}

function hasLifetimePlan(raw) {
  const plans = raw && raw.unique_plan_types;
  return Array.isArray(plans) && plans.some(plan => Array.isArray(plan) && plan[0] === LIFETIME_PLAN);
}

function money(value) {
  return `$${Number(value)}`;
}

/** 折扣百分比（四舍五入到整数）；只在 price/original 都为正数、且折扣价更便宜时调用 */
function discountPercent(price, original) {
  return Math.round((1 - price / original) * 100);
}

/**
 * 单条原始 deal → 记录草稿；不合格时返回 `{ dropped: '<原因>' }`。
 *
 * 判据顺序即日志里报的原因顺序，任何一条不满足都**只筛掉这一条**，不抛错：
 * 单条坏数据不该让整个来源挂掉（与「单源失败不阻塞整体」同一条纪律）。
 */
function classifyDeal(raw) {
  if (!raw || typeof raw !== 'object') return { dropped: '条目结构异常' };
  const title = brand(raw.public_name);
  if (!title) return { dropped: '标题缺失' };
  if (!productUrl(raw)) return { dropped: '产品链接缺失' };
  if (raw.has_ended === true) return { dropped: '已结束' };
  if (raw.has_started === false) return { dropped: '未上架' };
  if (!hasLifetimePlan(raw)) return { dropped: '非 lifetime 授权' };

  const price = Number(raw.price);
  const original = Number(raw.original_price);
  if (!Number.isFinite(price) || price <= 0) return { dropped: '折扣价缺失' };
  if (!Number.isFinite(original) || original <= 0) return { dropped: '原价缺失' };
  if (original <= price) return { dropped: '原价不高于折扣价（不构成折扣）' };

  if (!isAi(raw)) return { dropped: '非 AI' };
  return { ok: true };
}

/**
 * 解析一页 HTML，返回 `{ items, dropped }`。
 *
 * `items` 是**已经通过筛选**的、可以直接交给 `makeDeal()` 的草稿；
 * `dropped` 是被筛掉的 `{ title, reason }` 列表（由 collect() 打印前 20 个）。
 *
 * 为什么筛选放在 parse 里而不是 collect 里：fixture 回放测试比对的就是 parse 的输出，
 * 把判据放进 parse，判据一改 fixture 立刻红 —— 否则「筛掉谁」这件事永远没有测试。
 */
function parseWithReport(html) {
  const rawDeals = readNextDataDeals(html);
  if (rawDeals === null) {
    // 页面在但 __NEXT_DATA__ 没了 = 结构改版。抛错，让编排器把本来源记为 failure
    // （而不是静默 0 条 —— 那会伪装成「今天确实没有新 deal」）。
    throw new Error('AppSumo 页面结构变化：找不到 __NEXT_DATA__ / props.pageProps.deals.deals');
  }

  const items = [];
  const dropped = [];
  const seen = new Set();

  for (const raw of rawDeals) {
    const title = brand(raw && raw.public_name);
    const url = productUrl(raw);
    const key = url || title;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);

    const verdict = classifyDeal(raw);
    if (!verdict.ok) {
      dropped.push({ title: title || '(无标题)', reason: verdict.dropped });
      continue;
    }

    const price = Number(raw.price);
    const original = Number(raw.original_price);
    const percent = discountPercent(price, original);
    const endDate = raw.dates && typeof raw.dates.end_date === 'string' ? raw.dates.end_date : null;
    const categoryParts = [];
    const attrs = raw.attributes || {};
    if (Array.isArray(attrs.category) && attrs.category[0]) categoryParts.push(attrs.category[0]);
    if (Array.isArray(attrs.subcategory) && attrs.subcategory[0]) categoryParts.push(attrs.subcategory[0]);

    items.push({
      title,
      url,
      source: 'AppSumo',
      region: 'global',
      category: categoryParts.join(' · '),
      description: cleanText(raw.card_description, 200),
      discountInfo: `AppSumo 终身授权限时折扣：现价 ${money(price)}，原价 ${money(original)}（省 ${percent}%）`,
      priceLine: `${money(price)} 终身（原价 ${money(original)}）`,
      pricingModel: 'paid',
      // 截止时间 ONLY 来自页面：ending-soon 页自带；new 页大量为 null。
      // 不写「长期有效」之类的推断 —— 那是我们替来源下的结论。
      expiresAt: endDate,
      type: 'deal'
    });
  }

  return { items, dropped };
}

/** fixture 回放用的纯解析入口：只返回条目 */
function parse(html) {
  return parseWithReport(html).items;
}

/* ------------------------------------------------------------------ */
/* 采集（唯一碰网络的地方）                                             */
/* ------------------------------------------------------------------ */

/**
 * 打印被筛掉的样本。无人值守时最怕「筛掉了但没人知道筛错了」——
 * 所以固定打印前 20 个名字 + 原因（0 个也要打一行「没有筛掉任何条目」）。
 */
function logDropped(dropped) {
  const total = dropped.length;
  const sample = dropped.slice(0, MAX_DROPPED_LOGGED);
  if (!total) {
    console.log('[AppSumo] 筛选：没有筛掉任何条目');
    return;
  }
  console.log(`[AppSumo] 筛掉 ${total} 条；前 ${Math.min(total, MAX_DROPPED_LOGGED)} 个产品名与原因：`);
  sample.forEach((row, index) => {
    console.log(`  ${String(index + 1).padStart(2, ' ')}. ${row.title}（${row.reason}）`);
  });
  if (total > sample.length) console.log(`  …另有 ${total - sample.length} 条未列出`);
}

async function collect() {
  const merged = new Map();
  const dropped = [];

  for (const collection of COLLECTIONS) {
    const html = await getText(collection.url, { timeout: 30000 });
    const { items, dropped: pageDropped } = parseWithReport(html);
    dropped.push(...pageDropped);
    console.log(`[AppSumo] ${collection.url} → 合格 ${items.length} 条（本页筛掉 ${pageDropped.length} 条）`);
    for (const item of items) {
      const existing = merged.get(item.url);
      if (!existing) {
        merged.set(item.url, { ...item, sourceUrl: collection.url });
        continue;
      }
      // 同一产品出现在两个集合页：保留先到的那条，但截止日期谁有就用谁的。
      if (!existing.expiresAt && item.expiresAt) {
        merged.set(item.url, { ...existing, expiresAt: item.expiresAt, sourceUrl: collection.url });
      }
    }
  }

  // dropped 里同一产品可能在两个集合页各出现一次：按「标题+原因」去重后再打印。
  const uniqueDropped = [];
  const seenDropped = new Set();
  for (const row of dropped) {
    const key = `${row.title}\u0000${row.reason}`;
    if (seenDropped.has(key)) continue;
    seenDropped.add(key);
    uniqueDropped.push(row);
  }
  logDropped(uniqueDropped);

  const items = [...merged.values()];
  console.log(`[AppSumo] 合计：合格 ${items.length} 条（AI lifetime deal，含折扣价与原价），` +
    `其中 ${items.filter(item => item.expiresAt).length} 条带截止日期`);
  return items;
}

const collectors = [
  {
    id: 'appsumo',
    name: 'AppSumo',
    region: 'global',
    collect,
    parse,
    fixture: 'appsumo.deals'
  }
];

/* 自测用出口（不进注册表）：判据与筛选表要能被单测逐条钉住，而不是只靠「跑一遍真页面」。 */
module.exports = collectors;
module.exports.__test = {
  COLLECTIONS,
  LIFETIME_PLAN,
  MAX_DROPPED_LOGGED,
  AI_TAXONOMY_RE,
  AI_TEXT_RE,
  readNextDataDeals,
  classifyDeal,
  isAi,
  parseWithReport
};
