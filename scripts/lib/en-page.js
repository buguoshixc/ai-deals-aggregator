'use strict';
/**
 * 英文单页（`/en/`）—— 纯渲染模块：不读盘、不联网、不看时钟。
 *
 * ## 这一页是什么 / 不是什么
 *
 * 它是**既有英文数据的第二个入口**，不是双语站、不是页面镜像：
 *   · 只收 `region === 'global'` 且 title / discountInfo **原文就是英文**的条目；
 *   · 卡片直接外链厂商官方页（`deal.url`），不链中文详情页 ——
 *     「点进去看到中文页」是这一页最破坏体验的失败方式，明确接受「点卡片就离开本站」；
 *   · 不复用中文首页的 chrome / 正文 / `kind`。`kind` 是独立的 `home-en`，
 *     否则所有"首页"断言会同时命中两页，计数翻倍、其中一页恒假绿。
 *
 * ## 为什么英文页可以零翻译
 *
 * 数据层里 `region: 'global'` 的条目字段原文就是英文（中文是 `zh` 覆盖层译过去的），
 * 所以这里不经过也不产生任何译文。页面 chrome（标题、导航、说明、页脚）是英文，
 * 卡片正文逐字使用数据原文；**不渲染** description / eligibility ——
 * 这两类字段在当前数据里绝大多数是中文（即使条目本身是 global），
 * 渲染它们就等于在英文页上漏出中文，而不是"顺便给点更多信息"。
 *
 * ## 收录口径是一张表，不是一串条件分支
 *
 * 当前 83 条 global 条目原文含中文（68 条 discountInfo 中文、15 条 title 中文）。
 * 它们**不改写、不机翻**，逐 id 记进 `EXCLUSION_TABLE` 并注明原因（不静默丢弃）；
 * 表外新出现的含中文条目落进 `han-fallback` 并在构建日志里计数 ——
 * 新增数据不会悄悄从英文页消失，也不会把中文带上英文页。
 */

const pageFit = require('./page-fit');
const shell = require('./page-shell');
const { siteFor, xmlEscape } = require('./site');

const EN_ROUTE = 'en/';
const EN_PREFIX = '../';

/** 汉字区间（与数据/门禁同一口径；不含全角标点）。 */
const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

/**
 * 当前数据里 83 条「global 但原文含中文」的条目。列入此表 = 明确不进英文页，
 * 原因只有两种：
 *   · `title-cn`      —— 标题本身是中文，英文页无法在不改写数据的前提下展示它；
 *   · `discount-cn`   —— 标题是英文，但 discountInfo 是中文（AppSumo / OpenRouter 等）。
 *
 * 键是稳定 id，不是下标：数据重排/新增不会让排除项漂移到别的条目上。
 * 表里找不到、但含中文的条目仍会被 `selectDeals()` 挡下（`han-fallback`），
 * 只是不会被这条注释解释 —— 构建日志会打印那种条目的数量。
 */
const EXCLUSION_TABLE = Object.freeze({
  '7569157d322d': 'discount-cn', // DM Champ
  '27558d3945c7': 'discount-cn', // Plutio
  '41b332c4e705': 'discount-cn', // Dialora
  '2a7204391275': 'discount-cn', // ZeroWork
  'fa69020c164a': 'discount-cn', // RobinReach
  'c2fc2a641d49': 'discount-cn', // Formaloo
  '23d7b85f4992': 'discount-cn', // Rocky AI
  '2b95f56ce3a1': 'discount-cn', // Boost.space AgentOS
  'a157ed655587': 'discount-cn', // Rerun — AI Coworkers
  'c8784a307734': 'discount-cn', // Lety.ai
  'bce5afb96302': 'discount-cn', // Visby
  '5c45f40df3ed': 'discount-cn', // CluGTM (formerly Cleanlist AI)
  '10c4bcfc0c32': 'discount-cn', // Nifty
  'f34797ef8750': 'discount-cn', // ScrollHaus
  '60c544edd8be': 'discount-cn', // PlugThis AI
  'f1323ce17329': 'discount-cn', // NotiQ
  '6e7cfea4dbc1': 'discount-cn', // AI Emaily
  'c24e115fffed': 'discount-cn', // SEO Generator
  '5d66f28a59b5': 'discount-cn', // Inkfluence AI
  'a01ebd902884': 'discount-cn', // SalesBlink
  '42df4fdc8aa9': 'discount-cn', // Triplo AI
  '59c7b0179308': 'discount-cn', // Kavout
  '6efc1d92dbf1': 'discount-cn', // Blip AI
  'e174981f60ea': 'discount-cn', // Amical
  'f9844047fe7c': 'discount-cn', // inclusionAI: Ling 3.2 Flash (free)
  '98cfbb26c5cc': 'discount-cn', // Baidu: ERNIE-5.5-Flash-Preview (free)
  '14f39f10f728': 'discount-cn', // LiquidAI: LFM3-1.7B (free)
  '762a098836d7': 'discount-cn', // Particle AI: Particle-1 (free)
  '7b9e80d90afc': 'discount-cn', // Buildin
  'd0ed1daf6974': 'discount-cn', // upcoach
  '6637868284f5': 'discount-cn', // Recursive: Flint (free)
  'd175c32f71fd': 'discount-cn', // Press Ranger
  '49f87d205620': 'discount-cn', // Keyshift AI
  '0d9b9646f1a5': 'discount-cn', // Vocable AI
  'e5fcacad308b': 'discount-cn', // Creator Lookup
  'c61916544faf': 'discount-cn', // Acti
  '940d872f9eac': 'discount-cn', // Thinking Machines: Inkling 2 Small (free)
  '3f97a29b90e6': 'discount-cn', // Kortex
  'ff8cbecdd5f6': 'discount-cn', // MagicCanvas
  '086534ebceeb': 'discount-cn', // DomScan
  '72100a42eb69': 'discount-cn', // Hedy AI
  '3e0abe88eb9f': 'discount-cn', // BetterClaw
  '29ff7f061d59': 'discount-cn', // VistaCreate
  '8a8c3bdc2b05': 'discount-cn', // Rerun
  '620ef4290482': 'discount-cn', // VidTechy
  '44848acd19f3': 'discount-cn', // Brandolia
  '36fdb826204d': 'discount-cn', // ClearCrowds
  '2f0c03c32d8d': 'discount-cn', // AutomateNexus CRM
  '9e43fb1945c3': 'discount-cn', // Tough Tongue AI
  'ee446d349239': 'discount-cn', // AltText.ai
  '8e4af3df250c': 'discount-cn', // Preuve AI
  '7f06124571e2': 'discount-cn', // NudgeForMe
  '2374288880c3': 'discount-cn', // NVIDIA: Nemotron 3.5 Super VL (free)
  'cfb47a6dd6fa': 'discount-cn', // weDocs
  'e2bea3790e12': 'discount-cn', // AdaptlyPost
  '864a916dc7d3': 'discount-cn', // Snappyit
  '10c203c3a80e': 'discount-cn', // Kaptr.me
  '318a050a84bb': 'discount-cn', // ResumeUp.AI
  '2e5118bcd2c1': 'discount-cn', // Pretty Prompt
  'fef21feaac71': 'discount-cn', // NinjaPipe
  '8b8b44476f52': 'discount-cn', // Webclaw
  '75c584a4d6a2': 'discount-cn', // XingChen: Xing4.0 29B A4B (free)
  '33d4fd34f78f': 'discount-cn', // CaptionBolt
  'e7f286155de9': 'discount-cn', // NoCodeBackend
  '8797caa10aea': 'discount-cn', // Prismical
  'ef3cba339a72': 'discount-cn', // Crouton Alpha
  'dfa07fdc244d': 'discount-cn', // Notte
  'f6e6f3b1c820': 'discount-cn', // Wideo
  '6c02d0ffe148': 'title-cn', // Designkit (formerly 美图设计室-智能生成海报)
  'f578493037d4': 'title-cn', // Anthropic Claude 非营利组织折扣
  'df8ec56faa17': 'title-cn', // GitHub Copilot 学生免费（Copilot Student）
  '8e7b0fd03e73': 'title-cn', // GitHub Copilot 教师与开源维护者免费 Pro
  '219f6fca7f31': 'title-cn', // GitHub Student Developer Pack 学生开发者工具包
  '42c65c0d8d9d': 'title-cn', // Google AI Pro 学生免费 12 个月（含 Gemini 高级版）
  '6644f3b43bdb': 'title-cn', // Microsoft Azure for Students 学生免费 100 美元额度
  '514a84a1064a': 'title-cn', // 微软 Microsoft 365 教育版 学生 5 折（含 Copilot）
  'e4f7271cf7dc': 'title-cn', // AWS Activate 初创公司最高 20 万美元云 credits
  '5253b5ed77b1': 'title-cn', // Figma for Education 学生与教师免费
  'c25b0ed788e3': 'title-cn', // Notion 教育版 学生与教师免费 Plus
  'aacd5856bba2': 'title-cn', // Notion for Nonprofits 非营利组织 Business 折扣
  '4bda0ebbb091': 'title-cn', // ElevenLabs 免费计划 每月 10000 credits
  'b75b42583ad8': 'title-cn', // Runway 免费计划 一次性 125 credits
  'c433fee91818': 'title-cn', // Windsurf 学生折扣订阅 Pro（最长 12 个月）
});

/**
 * 分类名的英文映射。**这是页面 chrome，不是对条目的翻译**：
 * 数据里的 `category` 是中文枚举值，英文页要展示的是同一枚举的英文标签。
 * 未登记的分类落 `Other`（而不是把中文原样漏出来）。
 */
const CATEGORY_EN = Object.freeze({
  对话模型: 'Chat',
  图像绘画: 'Image',
  教育学习: 'Education',
  其他: 'Other',
  API服务: 'API',
  智能体: 'Agents',
  视频: 'Video',
  音频语音: 'Audio',
  设计创意: 'Design',
  编程开发: 'Coding',
  搜索研究: 'Research',
  办公效率: 'Productivity'
});
const CATEGORY_ORDER = Object.keys(CATEGORY_EN);

function categoryLabelOf(category) {
  return CATEGORY_EN[category] || 'Other';
}

/**
 * 收录判据。返回三组：
 *   · `included`      —— 进英文页的条目；
 *   · `excluded`      —— `region === 'global'` 但原文含中文（表内或 fallback），带原因；
 *   · `nonGlobal`     —— 明确不进英文侧的 cn 条目（只计数，不逐条解释）。
 *
 * 逐条判据只在**这里**写一次：构建日志、自检与页面渲染都消费同一个结果。
 */
function selectDeals(deals) {
  const included = [];
  const excluded = [];
  const nonGlobal = [];
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (!deal || deal.region !== 'global') {
      nonGlobal.push(deal);
      continue;
    }
    const title = String(deal.title || '');
    const offer = String(deal.discountInfo || '');
    const reason = EXCLUSION_TABLE[deal.id] || (HAN.test(title) || HAN.test(offer) ? 'han-fallback' : null);
    if (reason) {
      excluded.push({ id: deal.id, title, reason });
      continue;
    }
    included.push(deal);
  }
  included.sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return (ca < 0 ? CATEGORY_ORDER.length : ca) - (cb < 0 ? CATEGORY_ORDER.length : cb);
    const ta = String(a.title || '');
    const tb = String(b.title || '');
    if (ta !== tb) return ta < tb ? -1 : 1;
    const ia = String(a.id || '');
    const ib = String(b.id || '');
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
  return { included, excluded, nonGlobal };
}

/** 英文页头：品牌 + ZH 语言 chip + 弹性空隙 + GitHub 图标（与中文侧同一枚 SHARED 片段）。 */
function headerHtmlOf(parts) {
  const zhLink = shell.langLinkHtml({
    href: EN_PREFIX,
    hreflang: 'zh-CN',
    lang: 'zh-CN',
    label: 'ZH',
    title: 'Switch to Chinese'
  });
  return `  <a class="skip-link" href="#main">Skip to content</a>
  <header class="top">
    <div class="topin">
      <a class="brand" href="./">
${shell.BRAND_MARK_HTML}
        <span class="btxt"><b>AI <em>Deals</em> Aggregator</b><small>English edition</small></span>
      </a>
      ${zhLink}
      <span style="margin-left:auto"></span>
      ${parts.headerGhLink}
    </div>
  </header>`;
}

function cardHtml(deal) {
  const url = String(deal.url || '');
  if (!/^https:\/\//.test(url)) {
    throw new Error(`英文页：条目 ${deal.id} 的 url 不是 https 绝对地址（${url}）—— 卡片只外链官方页`);
  }
  const title = xmlEscape(String(deal.title || '').trim());
  const vendor = xmlEscape(String(deal.vendor || '').trim());
  const offer = xmlEscape(String(deal.discountInfo || '').trim());
  const category = xmlEscape(categoryLabelOf(deal.category));
  return `      <a class="en-card" href="${xmlEscape(url)}" target="_blank" rel="noopener noreferrer" data-en-deal="${xmlEscape(deal.id)}">
        <span class="en-card-meta"><span class="en-cat">${category}</span>${vendor ? `<span class="en-vendor">${vendor}</span>` : ''}</span>
        <span class="en-card-title">${title}</span>
${offer ? `        <span class="en-card-offer">${offer}</span>\n` : ''}        <span class="en-card-go">Vendor site →</span>
      </a>`;
}

function bodyHtmlOf(selection) {
  const offers = selection.included;
  const vendors = new Set(offers.map(deal => String(deal.vendor || '').trim()).filter(Boolean)).size;
  const categories = new Set(offers.map(deal => categoryLabelOf(deal.category))).size;
  const cards = offers.map(cardHtml).join('\n');
  return `    <section class="en-hero">
      <p class="en-kicker">English edition</p>
      <h1>AI deals, in English</h1>
      <p class="en-lede">Official discounts, free tiers and student offers for AI tools. Every card opens the vendor's own page — no sign-up walls, no affiliate detours.</p>
      <ul class="en-stats">
        <li><b>${offers.length}</b><span>offers</span></li>
        <li><b>${vendors}</b><span>vendors</span></li>
        <li><b>${categories}</b><span>categories</span></li>
      </ul>
    </section>
    <section id="deals" class="en-section">
      <h2>All offers</h2>
      <p class="en-note">Sorted by category, then by name. Every card links straight to the vendor.</p>
      <div class="en-grid">
${cards}
      </div>
    </section>
    <section id="how" class="en-section">
      <h2>How this page works</h2>
      <ul class="en-rules">
        <li>Only listings whose English title and offer text are already authoritative are included. Nothing here is machine-translated.</li>
        <li>Cards link to the vendor's own page, never to a Chinese detail page. Leaving this site is the intended behaviour.</li>
        <li>Prices, eligibility and availability can change without notice. The vendor's page is the final word.</li>
        <li>Chinese-only listings and Chinese-only sections stay on the <a href="../">Chinese edition</a>.</li>
      </ul>
    </section>`;
}

const EN_FOOTER = `    <footer class="en-foot">
      <p>Every card links to the vendor's official page. Prices, eligibility and availability can change without notice — the vendor's page is the final word.</p>
      <p>AI Deals Aggregator · English edition · <a href="../">Chinese edition</a></p>
      <!--ANALYTICS:BOOTSTRAP-->
    </footer>`;

const PAGE_CSS = `
.en-hero{padding:44px 0 8px;max-width:840px}
.en-kicker{margin:0;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--brand)}
.en-hero h1{margin:10px 0 14px;font-size:clamp(30px,4.4vw,46px);line-height:1.14}
.en-lede{margin:0 0 20px;font-size:17px;line-height:1.7;color:var(--ink2)}
.en-stats{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;list-style:none}
.en-stats li{display:flex;align-items:baseline;gap:6px;padding:7px 13px;border:1px solid var(--line);border-radius:999px;background:var(--card)}
.en-stats b{font-size:16px}
.en-stats span{font-size:12px;color:var(--mut)}
.en-section{padding:34px 0 4px}
.en-section h2{margin:0 0 6px;font-size:22px}
.en-note{margin:0 0 18px;font-size:13px;color:var(--mut)}
.en-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:12px}
.en-card{display:flex;flex-direction:column;gap:8px;padding:14px 15px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--ink);text-decoration:none}
.en-card:hover{border-color:var(--line2);background:var(--elev-hover)}
.en-card-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:11px;color:var(--mut)}
.en-cat{padding:2px 8px;border-radius:999px;background:var(--brand-soft);color:var(--brand);font-weight:600}
.en-vendor{overflow-wrap:anywhere}
.en-card-title{font-size:15px;font-weight:600;line-height:1.35}
.en-card-offer{font-size:12.5px;line-height:1.55;color:var(--ink2)}
.en-card-go{margin-top:auto;padding-top:2px;font-size:12px;font-weight:600;color:var(--brand)}
.en-rules{margin:0;padding-left:20px;font-size:14px;line-height:1.8;color:var(--ink2)}
.en-foot{margin-top:38px;padding:26px 0 44px;border-top:1px solid var(--line);font-size:12.5px;line-height:1.7;color:var(--mut)}
.en-foot p{margin:0 0 8px}
`;

function hreflangOf(siteUrl) {
  return [
    { hreflang: 'en', href: xmlEscape(`${siteUrl}en/`) },
    { hreflang: 'zh-CN', href: xmlEscape(siteUrl) },
    { hreflang: 'x-default', href: xmlEscape(siteUrl) }
  ];
}

/**
 * 面包屑 JSON-LD（`seo.validate` 对每个可索引页都要求一份）。
 *
 * 两级：站根 → 英文页。第一级的 `item` 就是 `siteUrl`（站根，`normalizeRoute('')` 为 `''`，
 * 判据允许），第二级是自指。名字用英文，避免在英文页的 `<head>` 里留下汉字。
 * `JSON.stringify` 之后把 `<` 转义成 `\u003c`：数据标题里若出现 `</script>`，
 * 不转义就会提前闭合脚本块（虽然当前数据没有，但这是结构安全问题，不是数据问题）。
 */
function jsonLdHtmlOf(siteUrl) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'AI Deals Aggregator', item: siteUrl },
      { '@type': 'ListItem', position: 2, name: 'English edition', item: `${siteUrl}en/` }
    ]
  };
  return `  <script type="application/ld+json">\n${JSON.stringify(data).replace(/</g, '\\u003c')}\n  </script>`;
}

/**
 * 渲染 `/en/` 整页。返回 `{ html, included, excluded, nonGlobal }`：
 * 计数给构建日志与产物自检用，两者消费的是**同一次**筛选结果。
 *
 * @param {object} spec
 * @param {object[]} spec.deals 已贴 zh 覆盖层的条目数组（本函数只用原文英文字段）
 * @param {object} spec.parts `page-shell.loadShellParts()` 的结果（必须在首页 finalize **之前**抽取）
 * @param {string} spec.siteUrl 站点绝对根（末尾带 `/`）
 * @param {string} [spec.where] 出错时的定位名
 */
function renderEnPage(spec) {
  const { deals, parts, siteUrl, where = 'en/index.html' } = spec;
  if (typeof siteUrl !== 'string' || !/^https:\/\/.+\/$/.test(siteUrl)) {
    throw new Error(`英文页：siteUrl 必须是末尾带斜杠的 https 绝对地址（实得 ${JSON.stringify(siteUrl)}）`);
  }
  if (!parts || typeof parts !== 'object' || !parts.headerGhLink) {
    throw new Error('英文页：parts 缺 headerGhLink（必须在 index.html finalize 之前 loadShellParts）');
  }
  const selection = selectDeals(deals);
  if (!selection.included.length) {
    throw new Error('英文页：0 条可收录条目 —— 不生成一个空英文页（宁可不发布，也不发假英文页）');
  }

  const site = siteFor('en');
  const title = pageFit.fitTitle(`AI Deals in English — ${selection.included.length} Official Offers`, '');
  const description = pageFit.fitDescription(site.siteDescription);
  const canonicalUrl = xmlEscape(`${siteUrl}en/`);

  const head = shell.docStart({
    kind: 'home-en',
    route: EN_ROUTE,
    prefix: EN_PREFIX,
    parts,
    title: xmlEscape(title),
    description: xmlEscape(description),
    canonicalUrl,
    hreflang: hreflangOf(siteUrl),
    lang: 'en',
    headerHtml: headerHtmlOf(parts),
    jsonLdHtml: jsonLdHtmlOf(siteUrl),
    faviconHref: `${EN_PREFIX}favicon.svg`,
    logoCssHref: `${EN_PREFIX}logos.css`,
    extraCss: PAGE_CSS,
    mainClass: '',
    where
  });

  const tail = shell.docEnd({
    route: EN_ROUTE,
    prefix: EN_PREFIX,
    parts: Object.assign({}, parts, { footerTemplate: EN_FOOTER }),
    where
  });

  return {
    html: `${head}\n${bodyHtmlOf(selection)}\n${tail}`,
    included: selection.included.length,
    excluded: selection.excluded,
    nonGlobal: selection.nonGlobal.length
  };
}

module.exports = {
  EN_ROUTE,
  EXCLUSION_TABLE,
  CATEGORY_EN,
  HAN,
  selectDeals,
  renderEnPage
};
