/**
 * OpenRouter 免费模型采集器（2026-11 供给端 P1）。
 *
 * ## 为什么这个源值得单独做
 *
 * `https://openrouter.ai/api/v1/models` 是**纯静态 GET 的公开 JSON**（本地实测 HTTP 200，
 * 828 KB，461 个模型），不需要无头浏览器、不需要正则刮页面。它自带三个别的源都没有的字段：
 *   · `pricing.prompt` / `pricing.completion` —— 免费判据（`=== "0"`）；
 *   · `created`（unix 秒）—— 模型什么时候上线，用来只收「新进入免费态」；
 *   · `expiration_date` —— 免费窗口什么时候结束（可能为 `null`）。
 *
 * ## 免费判据：只用 `pricing.prompt === "0"`，`:free` 只做展示标签
 *
 * 需求明确要求「二选一，不要写成或」。实测证据：`stealth/crouton-alpha` 的 pricing 是
 * `0/0`，但 id **没有** `:free` 后缀（它是 stealth 模型，OpenRouter 的免费路由不等于
 * `:free` 变体命名）。写成「prompt=0 或 id 以 :free 结尾」会产出两套不一致的判据：
 * 有的模型靠价格进来、有的靠命名进来，而两者的实际免费含义并不相同。
 *
 * 所以：
 *   · **入选**只认 `pricing.prompt` 严格等于字符串 `"0"`（不做数字/字符串宽松比较 ——
 *     契约就是这么给的，宽松比较会把 `0` 与 `"0"` 两种形态混为一谈）；
 *   · `:free` 只作为 `features` 里的展示标签（「:free 路由」），不参与筛选。
 *
 * ## 只收「新进入免费态」：30 天窗口
 *
 * 当前免费模型有 16 个。全收进来，首页会变成「OpenRouter 免费模型清单」——那正是
 * 本阶段要修的「供给面错配」的另一种形态（不是没数据，是一种数据淹没别的）。
 *
 * 过滤基准用 `created`（API 能给的唯一时间戳；它表示模型进入 OpenRouter 的时间，
 * 不等于「变得免费」的时刻 —— 这一点如实写在这里，不假装它是精确的免费起始时间）。
 * **阈值 30 天**的理由：
 *   ① 这是周级来源。采集链一天两次，30 天 = 最多 60 次运行，窗口内的新模型会被反复看到；
 *   ② 站点「变化雷达」的时间尺度是 7 天（最近变化）/30 天（已结束与重新出现）——
 *      30 天窗口与后者对齐，一条新免费模型能完整走完「出现 → 上线 → 下架」的雷达生命周期；
 *   ③ 实测今天 16 个免费模型里只有 5 个在 30 天内；窗口再放宽（如 90 天）会把 6 个
 *      三个月前的存量模型当「新」发，稀释「今日新增」。
 * 常量写在 `NEW_FREE_WINDOW_DAYS`，改它只需要改一处。
 *
 * ## rate limit 是一等字段（不是「免费」二字的脚注）
 *
 * 免费模型普遍带硬限流。只写「免费」会让用户点进去跑不动，信任崩得比「没更新」快得多。
 * 数据来源按「能取到就写、取不到就写未标注、绝不猜」执行：
 *
 *   · API 的 `per_request_limits` 在全部 16 个免费模型样本里都是 `null`（不是 0、不是缺失）；
 *   · 模型详情页（`/liquid/lfm-3-1.7b:free` 等）只写了「Free endpoints are rate limited —
 *     see the rate limit docs」，**没有** per-model 数字；
 *   · 官方限流文档 `https://openrouter.ai/docs/api-reference/limits` 的正文里带着
 *     平台免费档常量：`FREE_MODEL_RATE_LIMIT_RPM=20`、`FREE_MODEL_NO_CREDITS_RPD=50`、
 *     `FREE_MODEL_HAS_CREDITS_RPD=1e3`、`FREE_MODEL_CREDITS_THRESHOLD=10`（2026-11-08 实测）。
 *
 * 于是本采集器**每次运行都去读一遍那份官方文档**，把四个数字解析出来填进记录；
 * 解析不到（文档改版 / 网络失败）就写「限流：未标注」，绝不使用硬编码的旧数字冒充当前事实。
 * 文档原文同时说明：这套免费档限流只适用于 **ID 以 `:free` 结尾的 free variant**；
 * 所以没有 `:free` 后缀的免费模型（如 `stealth/crouton-alpha`）写「未标注」而不是套用。
 *
 * 落盘形态：现有 v2 契约没有独立的 rateLimit 字段（`validateDeal` 的 allowed 白名单是封闭的），
 * 所以限流信息落在两个**既有展示字段**里：
 *   · `discountInfo` 的正文（完整数字 + 出处）；
 *   · `features` 的短标签（如「20 RPM / 50 RPD」「限流未标注」）→ 卡片上一眼可见。
 *
 * ## 字段映射（需求 §P1-3）
 *
 * `type: "deal"`、`pricingModel: "free"`、`region: "global"`、`category: "API服务"`、
 * `expiresAt` 取 `expiration_date`。
 *
 * ### P1 偏差：需求点名的 `benefitType: ["free_api"]` 为什么没写在采集器里
 *
 * 本仓 `check:reproducible`（`scripts/tools/check-reproducible.js`）的判据是：
 * **非策展条目的六字段必须能从「管线重放」或「人工声明」重建**。它会把六字段剥掉、
 * 重跑一轮 `mergeAll()`（`scripts/lib/store.js`），还产不出来就判「已知值无源」。
 * 采集器直出六字段时，重放那一侧没有来源，这条门禁必红（2026-11-09 实测，一项红）。
 *
 * 要真的补上这个字段，需要动的**不是这里**，而是六字段的第二个人工来源：
 * `scripts/data/audience-overrides.json`（由 `mergeAll` 在进 dedup 之前注入，
 * 见 `lib/store.js` 的 `overrides` 段），以及随之而来的 `check-reproducible` 重放口径。
 * 但那条路要求逐条人工声明：模型每次下架/改名都会让文件里多一条指向不存在记录的孤儿，
 * 无人值守下会卡死采集链 —— 所以本轮**不做**，作为 P1 偏差如实记进
 * `OVERNIGHT-REPORT.md` 的「没做的事 + 为什么」与「BLOCKED/取舍」两节。
 * 改动前请先读那份报告的对应条目，不要只为了补一个字段去放宽门禁。
 */

const { getText } = require('../lib/http');
const { cleanText, todayCN } = require('../lib/schema');

const API_URL = 'https://openrouter.ai/api/v1/models';
/** 官方限流文档：免费档的四个常量就在这份页面的正文里（每次运行现读，不硬编码） */
const LIMITS_DOC_URL = 'https://openrouter.ai/docs/api-reference/limits';
const MODEL_PAGE_ORIGIN = 'https://openrouter.ai';

/** 「新进入免费态」的窗口：见文件头「阈值 30 天」的三条理由 */
const NEW_FREE_WINDOW_DAYS = 30;
const DAY_MS = 24 * 3600 * 1000;

/** 日志里最多列多少个被筛掉的免费模型（非免费模型不逐个列，只计数） */
const MAX_DROPPED_FREE_LOGGED = 20;

/* ------------------------------------------------------------------ */
/* 解析（纯函数，fixture 只喂 JSON 文本，不碰网络）                       */
/* ------------------------------------------------------------------ */

/**
 * JSON 文本 → 归一后的模型列表。**不做筛选**（筛选在 selectNewFree 里，注入 now 保证可测试）。
 *
 * 结构缺失直接抛错：API 改版应当被编排器记成「来源失败」，
 * 而不是静默 0 条 —— 后者会伪装成「今天没有新免费模型」。
 */
function parseModels(text) {
  let doc;
  try {
    doc = JSON.parse(String(text || ''));
  } catch (error) {
    throw new Error(`OpenRouter 响应不是合法 JSON：${error.message}`);
  }
  if (!doc || !Array.isArray(doc.data)) {
    throw new Error('OpenRouter 响应结构变化：缺少 data 数组');
  }

  const models = [];
  for (const raw of doc.data) {
    if (!raw || typeof raw !== 'object') continue;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const name = cleanText(raw.name, 120);
    if (!id || !name) continue;

    const pricing = raw.pricing && typeof raw.pricing === 'object' ? raw.pricing : {};
    const contextLength = Number(raw.context_length) || null;
    models.push({
      id,
      name,
      created: Number.isFinite(Number(raw.created)) && Number(raw.created) > 0 ? Number(raw.created) : null,
      expirationDate: typeof raw.expiration_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.expiration_date)
        ? raw.expiration_date
        : null,
      // 严格按契约取值：只有字符串 "0" 才是免费判据（不做数字/字符串宽松比较）。
      promptPrice: typeof pricing.prompt === 'string' ? pricing.prompt : null,
      completionPrice: typeof pricing.completion === 'string' ? pricing.completion : null,
      perRequestLimits: raw.per_request_limits === undefined ? null : raw.per_request_limits,
      contextLength,
      description: cleanText(raw.description, 200),
      /** `:free` 只是路由变体命名，**不是**免费判据；仅用于展示标签 */
      freeVariant: /:free$/i.test(id),
      isFree: typeof pricing.prompt === 'string' && pricing.prompt === '0'
    });
  }
  return models;
}

/** fixture 回放入口：只做解析，不筛选（筛选需要注入 now，见 selectNewFree） */
function parse(text) {
  return parseModels(text);
}

/**
 * 从官方限流文档里解析免费档常量。
 *
 * 文档的正文把常量以 `FREE_MODEL_RATE_LIMIT_RPM=20` 这种形式内联在页面里（Mintlify 的
 * 服务端渲染产物，2026-11-08 实测）。解析不到返回 null —— 调用方据此写「未标注」，
 * **绝不回退到硬编码数字**：那样文档一变，页面会长期印着过期数字且没人知道。
 *
 * @returns {{rpm:number, dailyNoCredits:number, dailyHasCredits:number, creditsThreshold:number}|null}
 */
function parseFreeLimits(html) {
  const text = String(html || '');
  const pick = name => {
    const match = text.match(new RegExp(`${name}\\s*[=:]\\s*([0-9]+(?:e[0-9]+)?)`, 'i'));
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const limits = {
    rpm: pick('FREE_MODEL_RATE_LIMIT_RPM'),
    dailyNoCredits: pick('FREE_MODEL_NO_CREDITS_RPD'),
    dailyHasCredits: pick('FREE_MODEL_HAS_CREDITS_RPD'),
    creditsThreshold: pick('FREE_MODEL_CREDITS_THRESHOLD')
  };
  if (!limits.rpm || !limits.dailyNoCredits || !limits.dailyHasCredits || !limits.creditsThreshold) return null;
  return limits;
}

/** 限流的人话（写进 discountInfo）。取不到数字时只写「未标注」 */
function rateLimitText(model, limits) {
  if (!limits) return '限流：未标注（官方限流文档本次不可用或结构变化，未做猜测）';
  if (!model.freeVariant) {
    return '限流：未标注（该模型 ID 无 :free 后缀；官方免费档限流条款按文档只适用于 free variant）';
  }
  return `限流：${limits.rpm} 次/分钟；每日 ${limits.dailyNoCredits} 次（累计购买 <${limits.creditsThreshold} credits）` +
    `或 ${limits.dailyHasCredits} 次（≥${limits.creditsThreshold} credits）—— 出自 OpenRouter 官方限流文档`;
}

/** 卡片上的短标签（features，每个 ≤20 字） */
function rateLimitFeature(model, limits) {
  if (!limits || !model.freeVariant) return '限流未标注';
  return `${limits.rpm} RPM / ${limits.dailyNoCredits} RPD`;
}

/**
 * 从 name / id 推断厂商（用于卡片「厂商 · 分类」行）。
 * 优先级：name 里的 "Vendor: Model" → name 的首个词 → id 前缀。
 * 为什么不用 id 前缀兜前面：「stealth/crouton-alpha」的 stealth 是发布账号（匿名模型），
 * 把账号名当厂商会印出「stealth」这种没有意义的厂商名；模型名 "Crouton Alpha" 起码可读。
 */
function vendorOf(model) {
  const name = String(model.name || '').trim();
  const colon = name.indexOf(':');
  if (colon > 0) return cleanText(name.slice(0, colon), 60);
  const firstWord = name.split(/\s+/)[0];
  if (firstWord) return cleanText(firstWord, 60);
  const prefix = String(model.id || '').split('/')[0];
  return cleanText(prefix, 60);
}

function modelUrl(id) {
  return `${MODEL_PAGE_ORIGIN}/${id}`;
}

/**
 * 免费 + 新窗口筛选。注入 `now`（毫秒）而不是读系统时间：判据可以逐格被单测钉住。
 *
 * @param {object[]} models parseModels 的输出
 * @param {{now?:number, windowDays?:number, limits?:object|null, today?:string}} [options]
 * @returns {{items:object[], dropped:Array<{title:string,reason:string}>, stats:object}}
 */
function selectNewFree(models, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const windowDays = Number.isFinite(options.windowDays) ? options.windowDays : NEW_FREE_WINDOW_DAYS;
  const limits = options.limits || null;
  const today = options.today || todayCN(new Date(now));

  const items = [];
  const dropped = [];
  const stats = { total: models.length, free: 0, kept: 0 };

  for (const model of models) {
    if (!model.isFree) continue;
    stats.free++;

    if (model.expirationDate && model.expirationDate < today) {
      dropped.push({ title: model.name, reason: `免费窗口已结束（expiration_date=${model.expirationDate}）` });
      continue;
    }
    if (!model.created) {
      dropped.push({ title: model.name, reason: 'created 缺失（无法判断是否新进入免费态）' });
      continue;
    }
    const ageMs = now - model.created * 1000;
    if (ageMs < 0) {
      dropped.push({ title: model.name, reason: 'created 在未来（数据异常）' });
      continue;
    }
    if (ageMs > windowDays * DAY_MS) {
      dropped.push({ title: model.name, reason: `免费但上线已超过 ${windowDays} 天窗口` });
      continue;
    }

    const features = ['免费 API', rateLimitFeature(model, limits)];
    if (model.freeVariant) features.push(':free 路由');

    const validity = model.expirationDate
      ? `免费窗口至 ${model.expirationDate}（官方 expiration_date）`
      : '官方未标注免费截止日期';

    items.push({
      title: model.name,
      url: modelUrl(model.id),
      source: 'OpenRouter',
      sourceUrl: API_URL,
      region: 'global',
      category: 'API服务',
      vendor: vendorOf(model),
      type: 'deal',
      pricingModel: 'free',
      description: model.description,
      discountInfo: `OpenRouter 免费模型：prompt / completion 价格均为 $0；` +
        `${rateLimitText(model, limits)}；${validity}`,
      priceLine: '$0 输入 / $0 输出（免费）',
      // 截止时间只认官方 expiration_date；没有就是没有，不写「长期有效」。
      expiresAt: model.expirationDate,
      validity,
      features
    });
    stats.kept++;
  }

  return { items, dropped, stats };
}

/* ------------------------------------------------------------------ */
/* 采集（唯一碰网络的地方）                                             */
/* ------------------------------------------------------------------ */

/**
 * 读官方限流文档。失败**不抛**：限流取不到只降级成「未标注」，不该让整条来源失败
 * （免费模型本身的数据来自另一份 API，两份数据各自独立）。
 */
async function fetchFreeLimits() {
  try {
    const html = await getText(LIMITS_DOC_URL, { timeout: 20000, retries: 0 });
    const limits = parseFreeLimits(html);
    if (limits) return { limits, error: null };
    return { limits: null, error: '限流文档结构变化（没解析到四个常量）' };
  } catch (error) {
    return { limits: null, error: `限流文档抓取失败：${error.message}` };
  }
}

function logDroppedFree(dropped) {
  if (!dropped.length) {
    console.log('[OpenRouter] 没有筛掉任何免费模型');
    return;
  }
  console.log(`[OpenRouter] 筛掉 ${dropped.length} 个免费模型；前 ${Math.min(dropped.length, MAX_DROPPED_FREE_LOGGED)} 个与原因：`);
  dropped.slice(0, MAX_DROPPED_FREE_LOGGED).forEach((row, index) => {
    console.log(`  ${String(index + 1).padStart(2, ' ')}. ${row.title}（${row.reason}）`);
  });
  if (dropped.length > MAX_DROPPED_FREE_LOGGED) {
    console.log(`  …另有 ${dropped.length - MAX_DROPPED_FREE_LOGGED} 个未列出`);
  }
}

async function collect() {
  const text = await getText(API_URL, { timeout: 30000 });
  const models = parseModels(text);
  const { limits, error: limitsError } = await fetchFreeLimits();
  if (limitsError) console.warn(`[OpenRouter] ${limitsError} —— 本轮 rate limit 写「未标注」`);
  else {
    console.log(`[OpenRouter] 官方限流文档：免费档 ${limits.rpm} 次/分钟；` +
      `每日 ${limits.dailyNoCredits}（<${limits.creditsThreshold} credits）/ ${limits.dailyHasCredits}（≥${limits.creditsThreshold} credits）次`);
  }

  const { items, dropped, stats } = selectNewFree(models, { limits });
  console.log(`[OpenRouter] 模型总数 ${stats.total} · 免费（pricing.prompt === "0"）${stats.free} 个 · ` +
    `落在 ${NEW_FREE_WINDOW_DAYS} 天窗口内 ${stats.kept} 个`);
  logDroppedFree(dropped);
  console.log(`[OpenRouter] 入选：${items.map(item => item.title).join('、') || '(无)'}`);
  return items;
}

const collectors = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    region: 'global',
    collect,
    parse,
    fixture: 'openrouter.models'
  }
];

/* 自测用出口（不进注册表）：判据、窗口、限流解析都要能被逐格钉住 */
module.exports = collectors;
module.exports.__test = {
  API_URL,
  LIMITS_DOC_URL,
  NEW_FREE_WINDOW_DAYS,
  MAX_DROPPED_FREE_LOGGED,
  parseModels,
  parseFreeLimits,
  rateLimitText,
  rateLimitFeature,
  selectNewFree,
  vendorOf
};
