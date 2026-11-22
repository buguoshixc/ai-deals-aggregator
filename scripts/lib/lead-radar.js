/**
 * B 类资讯线索雷达（beta）：判据、解析与 TTL 的唯一出处。
 *
 * ## 这一层要解决什么
 *
 * 有些 AI 限时免费 / 降价事件**不发布在任何结构化页面上**（没有 deal 页、没有活动页），
 * 但科技媒体会写稿。例子：腾讯 WorkBuddy 里 DeepSeek 限时免费（2026-09，见
 * `https://www.c114.net.cn/ainews/122276.html`）——它从来不会出现在厂商的定价表里。
 *
 * 所以 B 类只做一件事：**在可信媒体的 RSS 里发现「像线索」的文章，按线索登记，7 天自动下线**。
 * 它不核验、不下结论：标题 / 原文链接 / 原文日期 / 收录来源 / 原文摘要引文（RSS `<description>`
 * 的逐字清洗文本）之外一律不填（见 `collectors/leads.js`），页面上按来源类型显示「线索 · 未核验」。
 *
 * ## 判据（三道门必须**同时**命中，宁可 0 条也不要 5 条假的）
 *
 *   ① **平台或产品名**：`AI_PLATFORM_NAMES` 白名单（显式、可逐条复核）。
 *      刻意**不收**泛品牌词（腾讯 / 百度 / 阿里 / 字节 / 小米 / 华为）：它们出现在
 *      绝大多数科技新闻里，收进来等于没有判据。只有具体的 AI 平台/产品名才算数
 *      （腾讯元宝 / 腾讯混元 / 阿里云百炼 / 百度智能云 这类「品牌 + AI 产品」的写法照收）。
 *   ② **免费 / 限免 / 降价**：`FREE_WORDS`（免费、限免、免费开放、免费额度、降价、折扣、
 *      优惠、0 元、赠送……）。只有「免费」这一个词的世界太宽（分析文里到处是「免费额度」），
 *      所以这一道门只是三闸之一，另外两道负责把它压住。
 *   ③ **时间词**：`TIME_WORDS`（今天、今日、本周、即日起、限时、截至、X 月 X 日……）。
 *      媒体写活动/限时优惠时几乎一定会带时间词；不带的多数是评测、评论、融资新闻。
 *
 * 判据作用在 **标题 + 摘要前 120 字** 上（`SUMMARY_WINDOW_CHARS`）。为什么不用全文：
 * 2026-11-09 实测，把整篇正文拼进来后，10 个 RSS 里立刻出现十几条「平台名 + 免费 + 今天」
 * 的假线索 —— 它们全是**正文里顺带提到**这些词的分析稿/融资稿。摘要窗口把这类噪音挡在外面，
 * 同时保留「标题里点题、摘要里给条件」的正常新闻写法（如「X 限时免费」）。
 *
 * 还有两道不是关键词的硬门，在 `collectors/leads.js` 里执行：
 *   · **原文可点开**：候选逐条 GET 一次原文（走 `lib/http.js`，遵守 robots），
 *     抓不到就丢弃 —— 一条点不开的线索等于没有；
 *   · **7 天窗口**：原文日期（`pubDate`）超过 7 天的不要 —— 新闻线索的价值随日期衰减，
 *     不做「今天发三条上个月的旧闻」。
 *
 * ## 7 天 TTL：与采集窗口同一个常数
 *
 * `LEAD_TTL_DAYS = 7` 同时被两处使用：
 *   · 采集器：只收原文日期在 7 天内的线索；
 *   · `lib/store.js` 的 prune：`source` 登记为 `lead` 类型的记录，`firstSeen` 早于
 *     today-7 天即下架（走既有的「过期下架」通道，历史层照常记 `ended` + `pruned_expired`）。
 *
 * 为什么 TTL 从**原文日期**算而不是从「我们抓到它」算：线索是新闻，不是商品。
 * 一条 6 天前的旧闻今天被我们抓到，只该在站上待 1 天（甚至不该进），而不是因为它
 * 「刚被我们收录」再挂 7 天。语义上代价是：`firstSeen` 字段对线索承载的是**原文日期**
 * （契约里没有独立的「原文日期」字段，而 firstSeen 是详情页唯一展示的日期行），
 * 这一点写在 `collectors/leads.js` 的注释与报告里，不藏着。
 */

const cheerio = require('cheerio');
const { cleanText, normalizeDate } = require('./schema');

/** 线索 TTL：采集窗口与自动下线共用这一个常数（见文件头最后一段） */
const LEAD_TTL_DAYS = 7;

/** 判据的摘要窗口：只看标题 + 摘要前这么多字（见文件头 ③ 后面的理由） */
const SUMMARY_WINDOW_CHARS = 120;

/**
 * AI 平台 / 产品白名单。**只收具体的 AI 产品名**；泛品牌（腾讯/百度/阿里/字节/华为/小米）
 * 一个都不收 —— 它们不是 AI 信号。中英文都收：中文媒体常混写。
 * 维护提示：加名字就是在收紧/放宽判据，改完要跑 `selftest:ai`（它有几条正反例）。
 */
const AI_PLATFORM_NAMES = [
  // 国外 AI 平台 / 产品
  'OpenAI', 'ChatGPT', 'GPT-4', 'GPT-5', 'GPT-6', 'GPT', 'Sora', 'Anthropic', 'Claude',
  'Gemini', 'DeepMind', 'Llama', 'Mistral', 'Grok', 'xAI', 'Perplexity', 'Copilot',
  'Cursor', 'Windsurf', 'Midjourney', 'Runway', 'Stability AI', 'Stable Diffusion',
  'Hugging Face', 'ElevenLabs', 'Suno', 'Udio', 'Pika', 'Luma', 'HeyGen', 'Synthesia',
  'Character.AI', 'Poe', 'Monica', 'Manus', 'Notion AI', 'Adobe Firefly', 'Firefly',
  'TRAE', 'Qoder', 'CodeBuddy', 'Claude Code', 'Codex', 'Veo', 'Nano Banana', 'NotebookLM',
  'Genspark', 'Devin', 'Replit', 'Lovable', 'Bolt.new', 'v0',
  // 国内 AI 平台 / 产品（品牌 + AI 产品的组合写法才收）
  'DeepSeek', '深度求索', 'Kimi', 'Moonshot', '月之暗面', '通义', '千问', 'Qwen',
  '阿里云百炼', '百炼', '文心一言', '文心', 'ERNIE', '百度智能云', '豆包', '即梦',
  'Seedance', 'Seedream', '可灵', '可图', '智谱', 'ChatGLM', 'GLM', 'MiniMax', '海螺 AI',
  '海螺', '阶跃星辰', 'Step-', '商汤', 'SenseNova', '日日新', '讯飞星火', '星火',
  '腾讯元宝', '腾讯混元', '混元', 'WorkBuddy', '华为盘古', '盘古大模型', '昆仑万维',
  '天工', 'Skywork', '面壁智能', 'MiniCPM', '零一万物', '百川智能', 'Baichuan',
  'WPS AI', '夸克 AI', '秘塔', '通义灵码', '文心快码', 'Kimi K2', 'Qwen3',
  'DeepSeek-V', 'DeepSeek-R', 'GLM-4', 'GLM-5', 'Hailuo', 'Vidu', 'PixVerse', 'Lovart',
  'Gamma', 'Imagen', 'Kling', '可图大模型'
];

/** 免费 / 限免 / 降价信号（与「AI 平台名」「时间词」同时命中才算线索） */
const FREE_WORDS = /免费|限免|限时免费|免费开放|免费体验|免费使用|免费额度|免费试用|免费领取|降价|折扣|优惠|白嫖|0\s*元|零元|赠送|免单|限时优惠|限时特惠|半价|打折/;

/**
 * 时间词。刻意收「今天/本周/即日起/限时/截至/X 月 X 日」这类新闻与活动文案的典型写法，
 * 不收「日前 / 最近 / 今年」——它们在任何一篇稿子里都能出现，起不到时间定位作用。
 */
const TIME_WORDS = /今天|今日|今晚|本周|本月|即日|日起|限时|活动期间|截至|截止|刚刚|昨天|昨日|至\s*\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}\s*月\s*\d{1,2}\s*日/;

/** 正文里出现的 HTML 摘要 → 纯文本（解析器与 fixture 共用同一把尺子） */
function summaryOf(rawDescription) {
  const html = String(rawDescription || '');
  if (!html) return '';
  // RSS 摘要里常带 <p>/<img>/<a>。cheerio 的 htmlMode 默认就是我们要的行为。
  const text = cheerio.load(html).text();
  return cleanText(text, 240);
}

/**
 * RSS 2.0 XML → 归一后的条目列表。**纯函数、不筛选**（筛选见 selectLeads，要注入 now）。
 *
 * 只支持 RSS 2.0 的 `<item>`（本阶段四个源都是 RSS 2.0；Atom 的 `<entry>` 遇到再扩，
 * 不为了「以后可能」先写一条没人测的分支）。
 *
 * @param {string} xml
 * @param {string} sourceName 媒体名（写进 item.source；由各采集器闭包传入）
 * @returns {Array<{title:string,url:string,date:string,description:string,source:string}>}
 */
function parseFeed(xml, sourceName) {
  const $ = cheerio.load(String(xml || ''), { xmlMode: true });
  const items = [];
  const seen = new Set();

  $('item').each((_, node) => {
    const title = cleanText($(node).find('title').first().text(), 150);
    const link = String($(node).find('link').first().text() || '').trim();
    const pubDate = String($(node).find('pubDate').first().text() || '').trim();
    const date = normalizeDate(pubDate);
    if (!title || !link || !/^https?:\/\//i.test(link) || !date) return;
    if (seen.has(link)) return;
    seen.add(link);
    items.push({
      title,
      url: link,
      date,
      description: summaryOf($(node).find('description').first().text()),
      source: sourceName
    });
  });

  return items;
}

/**
 * 三道门判据。返回命中的三个信号（用于日志/测试）与 `ok`。
 *
 * @param {{title?:string, description?:string}|string} input 条目对象或已拼好的文本
 */
function leadSignal(input) {
  const text = typeof input === 'string'
    ? String(input)
    : `${input && input.title ? input.title : ''} ${String((input && input.description) || '').slice(0, SUMMARY_WINDOW_CHARS)}`;
  const platform = AI_PLATFORM_NAMES.find(name => text.includes(name)) || null;
  const free = FREE_WORDS.test(text);
  const time = TIME_WORDS.test(text);
  return { text, platform, free, time, ok: Boolean(platform && free && time) };
}

/**
 * 从单源 RSS 条目里选出**本轮线索**：7 天窗口 + 三道门。
 *
 * @param {object[]} items parseFeed 的输出
 * @param {{now?:number, maxAgeDays?:number}} [options] now 毫秒注入（测试可复现）
 * @returns {{items:object[], dropped:Array<{title:string,reason:string}>, nearMisses:object[], stats:object}}
 */
function selectLeads(items, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const maxAgeDays = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays : LEAD_TTL_DAYS;
  const stats = { feedItems: items.length, inWindow: 0, matched: 0 };
  const kept = [];
  const dropped = [];
  const nearMisses = [];

  for (const item of items) {
    const publishedAt = Date.parse(`${item.date}T00:00:00+08:00`);
    const ageDays = (now - publishedAt) / 86400000;
    if (!Number.isFinite(ageDays)) {
      dropped.push({ title: item.title, reason: '原文日期无法解析' });
      continue;
    }
    if (ageDays < 0) {
      dropped.push({ title: item.title, reason: '原文日期在未来（数据异常）' });
      continue;
    }
    if (ageDays > maxAgeDays) {
      dropped.push({ title: item.title, reason: `原文日期超过 ${maxAgeDays} 天窗口` });
      continue;
    }
    stats.inWindow++;
    const signal = leadSignal(item);
    if (!signal.ok) {
      // 近失配样本只记「平台名 + 免费/降价」两条都命中的（差时间词），
      // 用来抽查判据有没有漏掉正常写法；不打印全文，只留标题。
      if (signal.platform && signal.free) nearMisses.push({ title: item.title, platform: signal.platform, missing: '时间词' });
      continue;
    }
    stats.matched++;
    kept.push(item);
  }

  return { items: kept, dropped, nearMisses, stats };
}

module.exports = {
  LEAD_TTL_DAYS,
  SUMMARY_WINDOW_CHARS,
  AI_PLATFORM_NAMES,
  FREE_WORDS,
  TIME_WORDS,
  summaryOf,
  parseFeed,
  leadSignal,
  selectLeads
};
