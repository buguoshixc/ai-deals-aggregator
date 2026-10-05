#!/usr/bin/env node
/**
 * coverage-depth-v1 Workstream A：把**已人工复核**的官方发布日期写进 `scripts/data/models.json`。
 *
 * 纪律（与任务书逐条对应）：
 *  · 只写 `releasedAt` / `releaseEvidence` / `note` 三个字段，其它字段一个字节都不碰；
 *  · **写盘前先做逐条忠实度机械复核**：把 quote 按 " / " 拆段，逐段在**现场抓取的官方页原文**
 *    （raw/<rawFile>，去标签后把空白全部去掉）里做子串匹配；任何一段匹配不上就整体中止，不写盘；
 *  · releaseEvidence 的键序恒为 field / quote / sourceUrl / capturedAt（判据层要求）；
 *  · sourceUrl 必须落在该 developer 在 providers.json 的 officialDomains 上（由 models-selftest 复检）。
 *
 * 用法：node apply-evidence.cjs [--check-only]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..'); // worktree 根
const RAW = path.join(__dirname, 'raw');
const REGISTRY = path.join(ROOT, 'scripts', 'data', 'models.json');

const CAPTURED_AT = '2026-10-05'; // 本轮取证实际抓取日

/** 采信表：slug → { releasedAt, sourceUrl, quote, rawFile, note? } */
const EVIDENCE = [
  /* ---------------- Google / ai.google.dev changelog（L2） ---------------- */
  {
    slug: 'gemini-3.5-flash',
    releasedAt: '2026-05-19',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/changelog',
    rawFile: 'google-gemini-changelog.html',
    quote: 'May 19, 2026 / Released gemini-3.5-flash, the generally available (GA) version of Gemini 3.5 Flash, our most intelligent model for sustained frontier performance on agentic and coding tasks. This is now the model behind gemini-flash-latest.',
    note: 'releasedAt 取官方 changelog 的 GA（正式公开可用）日；官方原文明写「the generally available (GA) version」，若 3.5 Flash 另有更早 preview 期，preview 日不作为发布日期。'
  },
  {
    slug: 'gemini-3.6-flash',
    releasedAt: '2026-07-21',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/changelog',
    rawFile: 'google-gemini-changelog.html',
    quote: 'July 21, 2026 / Gemini 3.6 Flash and Gemini 3.5 Flash-Lite generally available (GA): Released stable, production-ready versions of our latest 3.x Flash models: Gemini 3.6 Flash (gemini-3.6-flash): Features improved token efficiency and code/agentic planning capabilities at a lower price point than 3.5 Flash, resolving developer feedback around output verbosity.',
    note: 'releasedAt 取官方 changelog 的 GA（正式公开可用）日；preview 期（若存在）不作为发布日期。'
  },
  {
    slug: 'gemini-3.7-flash',
    releasedAt: '2026-08-13',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/changelog',
    rawFile: 'google-gemini-changelog.html',
    quote: 'August 13, 2026 / Gemini 3.7 Flash generally available (GA): Released our most intelligent workhorse model yet for coding and agents: Gemini 3.7 Flash (gemini-3.7-flash): Substantial improvements across software engineering, web development, and agentic workflows, available at an introductory price through December 31, 2026.',
    note: 'releasedAt 取官方 changelog 的 GA（正式公开可用）日；preview 期（若存在）不作为发布日期。'
  },
  {
    slug: 'gemini-3.8-flash',
    releasedAt: '2026-09-02',
    sourceUrl: 'https://ai.google.dev/gemini-api/docs/changelog',
    rawFile: 'google-gemini-changelog.html',
    quote: 'September 2, 2026 / Gemini 3.8 Flash generally available (GA): Released gemini-3.8-flash, our most intelligent Flash model, engineered for long-horizon software engineering, autonomous agents, and complex enterprise workflows.',
    note: 'releasedAt 取官方 changelog 的 GA（正式公开可用）日；preview 期（若存在）不作为发布日期。'
  },

  /* ---------------- 智谱AI / docs.bigmodel.cn 更新日志（L2） ---------------- */
  {
    slug: 'glm-5.3',
    releasedAt: '2026-08-19',
    sourceUrl: 'https://docs.bigmodel.cn/cn/update/new-releases',
    rawFile: 'bigmodel-new-releases.html',
    quote: '2026-8-19 / GLM-5.3 新一代旗舰模型上线 / 更强的编程能力：GLM-5.3 的编程能力大幅提升，在智谱内部 Z.ai Code Bench 上较 GLM-5.2 提升了 50%，在包括 Terminal Bench 3.0 等公开基准测试中达到开源模型 SOTA 水平',
    note: '官方发布记录原文写作 `2026-8-19`（月/日未补零）；releasedAt 按同一日期规范化为 2026-08-19，逐字引文保留官方原写法。'
  },
  {
    slug: 'glm-5.3-flash',
    releasedAt: '2026-08-26',
    sourceUrl: 'https://docs.bigmodel.cn/cn/update/new-releases',
    rawFile: 'bigmodel-new-releases.html',
    quote: '2026-08-26 / GLM-5.3-Flash 原生多模态模型上线 / 原生融入视觉能力，使模型能够主动观察界面、渲染与交互反馈并持续迭代改进，实现代码、浏览器与图形界面的协同闭环。'
  },
  {
    slug: 'glm-4.7-flash',
    releasedAt: '2026-01-19',
    sourceUrl: 'https://docs.bigmodel.cn/cn/update/new-releases',
    rawFile: 'bigmodel-new-releases.html',
    quote: '2026-01-19 / GLM-4.7-Flash 免费模型上线 / 轻量参数规模下实现了高效的 Coding 能力，任务理解与代码生成能力处于同类模型的较高水平'
  },
  {
    slug: 'glm-5v-turbo',
    releasedAt: '2026-04-02',
    sourceUrl: 'https://docs.bigmodel.cn/cn/update/new-releases',
    rawFile: 'bigmodel-new-releases.html',
    quote: '2026-04-02 / GLM-5V-Turbo 多模态 Coding 基座模型上线 / 兼顾视觉理解与 Coding 能力，在更小参数量下实现更优的性能表现，多模态任务处理更高效'
  },
  {
    slug: 'glm-4.6v',
    releasedAt: '2025-12-08',
    sourceUrl: 'https://docs.bigmodel.cn/cn/update/new-releases',
    rawFile: 'bigmodel-new-releases.html',
    quote: '2025-12-08 / GLM-4.6V 视觉推理模型上线 / 20+ 主流多模态评测基准全面验证，均取得 SOTA 成绩'
  },
  {
    slug: 'glm-4.5v',
    releasedAt: '2025-08-11',
    sourceUrl: 'https://docs.bigmodel.cn/cn/update/new-releases',
    rawFile: 'bigmodel-new-releases.html',
    quote: '2025-08-11 / GLM-4.5V 视觉推理模型上线 / 100B 级别开源视觉推理模型 SOTA，比 GLM-4.1V-Thinking “更大更强”'
  },

  /* ---------------- 腾讯云 / 混元生文模型表（L3，字段名=版本更新时间） ---------------- */
  {
    slug: 'hunyuan-a13b',
    releasedAt: '2025-06-25',
    sourceUrl: 'https://cloud.tencent.com/document/product/1729/104753',
    rawFile: 'tencent-hunyuan-pricing.html',
    quote: '模型类型 / 模型名称（API 调用名） / 版本更新时间 / 能力和特征 / 输入输出 / 相关文档 / 通用文生文 / hunyuan-a13b / 2025-06-25 / 1. 适用场景：绝大部分场景，同时兼顾效果及推理性能。',
    note: '官方模型表该列字段名是「版本更新时间」；releasedAt 取该模型版本的官方更新时间（该 identity 在官方表里只有这一个版本行）。'
  },
  {
    slug: 'hunyuan-role-latest',
    releasedAt: '2025-09-24',
    sourceUrl: 'https://cloud.tencent.com/document/product/1729/104753',
    rawFile: 'tencent-hunyuan-pricing.html',
    quote: '角色扮演 / hunyuan-role-latest / 2025-09-24 / 1. 适用场景：AI 数字分身、AI 角色扮演、AI 情感陪聊等'
  },
  {
    slug: 'hunyuan-translation',
    releasedAt: '2025-10-14',
    sourceUrl: 'https://cloud.tencent.com/document/product/1729/104753',
    rawFile: 'tencent-hunyuan-pricing.html',
    quote: '翻译 / hunyuan-translation / 2025-10-14 / 支持语种齐全，33种语言互译和5种民族语言互译；'
  },
  {
    slug: 'hunyuan-translation-lite',
    releasedAt: '2025-06-06',
    sourceUrl: 'https://cloud.tencent.com/document/product/1729/104753',
    rawFile: 'tencent-hunyuan-pricing.html',
    quote: 'hunyuan-translation-lite / 2025-06-06 / 混元翻译专项模型，基于混元2B-Dense 模型进行翻译能力专项优化，通过迭代高质量多语言 SFT 数据，强化多语种翻译能力。'
  },
  {
    slug: 'tencent-hy-vision-1.5-instruct',
    releasedAt: '2025-12-17',
    sourceUrl: 'https://cloud.tencent.com/document/product/1729/104753',
    rawFile: 'tencent-hunyuan-pricing.html',
    quote: '混元图生文 / Tencent HY Vision 1.5 Instruct（hunyuan-vision-1.5-instruct） / 2025-12-17 / 基于文本 TurboS',
    note: '官方表里 identity 的 API 调用名为 hunyuan-vision-1.5-instruct、显示名为 Tencent HY Vision 1.5 Instruct，与本条 canonicalName 逐字一致。'
  },

  /* ---------------- MiniMax / 模型发布（L1） ---------------- */
  {
    slug: 'minimax-m2.7',
    releasedAt: '2026-03-18',
    sourceUrl: 'https://platform.minimax.cn/docs/release-notes/models',
    rawFile: 'minimax-release-notes.html',
    quote: '2026 年 3 月 18 日 / MiniMax M2.7 / 全新语言模型 MiniMax-M2.7 系列模型 MiniMax-M2.7 / M2.7-highspeed 正式发布，开启模型的自我迭代'
  },
  {
    slug: 'minimax-m2.7-highspeed',
    releasedAt: '2026-03-18',
    sourceUrl: 'https://platform.minimax.cn/docs/release-notes/models',
    rawFile: 'minimax-release-notes.html',
    quote: '2026 年 3 月 18 日 / MiniMax M2.7 / 全新语言模型 MiniMax-M2.7 系列模型 MiniMax-M2.7 / M2.7-highspeed 正式发布，开启模型的自我迭代',
    note: '与 minimax-m2.7 同一条官方发布记录（原文把 M2.7 与 M2.7-highspeed 并列在同一行里正式发布）。'
  },

  /* ---------------- Anthropic / Newsroom（L1） ---------------- */
  {
    slug: 'claude-fable-5.1',
    releasedAt: '2026-09-01',
    sourceUrl: 'https://www.anthropic.com/news',
    rawFile: 'anthropic-news-index.html',
    quote: 'Introducing Claude Fable 5.1 and Claude Mythos 5.1 / Announcements Sep 1, 2026 / Our most advanced models for coding and knowledge work. Their research capabilities also offer an early glimpse of how AI models will contribute to scientific progress.',
    note: 'releasedAt 取 Newsroom 上该公告的官方日期（公告详情页 /claude-fable-and-mythos-5-1 正文不印日期，日期只印在 Newsroom 条目上）。'
  },
  {
    slug: 'claude-opus-5.5',
    releasedAt: '2026-09-22',
    sourceUrl: 'https://www.anthropic.com/news',
    rawFile: 'anthropic-news-index.html',
    quote: 'Introducing Claude Opus 5.5 / Announcements Sep 22, 2026 / Opus 5.5 performs at the level of Claude Fable 5.1 on most work and costs 40% less to run than Opus 5.',
    note: 'releasedAt 取 Newsroom 上该公告的官方日期（公告详情页正文不印日期）。'
  },
  {
    slug: 'claude-sonnet-5.5',
    releasedAt: '2026-09-28',
    sourceUrl: 'https://www.anthropic.com/news',
    rawFile: 'anthropic-news-index.html',
    quote: 'Introducing Claude Sonnet 5.5 / Announcements Sep 28, 2026 / A clear upgrade over Sonnet 5 that runs 30% faster and costs up to 30% less for most work.',
    note: 'releasedAt 取 Newsroom 上该公告的官方日期（公告详情页正文不印日期）。'
  },
  {
    slug: 'claude-haiku-4.5',
    releasedAt: '2025-10-15',
    sourceUrl: 'https://www.anthropic.com/news/claude-haiku-4-5',
    rawFile: 'anthropic-haiku45.html',
    quote: 'Introducing Claude Haiku 4.5 / Oct 15, 2025 / Claude Haiku 4.5, our latest small model, is available today to all users.'
  },

  /* ---------------- OpenAI / 官方文章页（L1，日期取页面自带的发布元数据） ---------------- */
  {
    slug: 'gpt-6-astra',
    releasedAt: '2026-09-03',
    sourceUrl: 'https://openai.com/index/gpt-6-astra/',
    rawFile: 'oai-gpt6-astra.html',
    quote: '"slug":"index/gpt-6-astra","publicationDateText":"September 3, 2026","pageType":"Article","pageTitle":"GPT-6 Astra: A new generation of intelligence"',
    note: 'OpenAI 文章页正文不印日期；releasedAt 取该官方页自带的发布元数据 publicationDateText（同一片段里带 pageType=Article 与页面标题，身份可核）。'
  },
  {
    slug: 'gpt-6.1-sol',
    releasedAt: '2026-09-29',
    sourceUrl: 'https://openai.com/index/introducing-gpt-6-1-sol/',
    rawFile: 'oai-gpt61-sol2.html',
    quote: '"slug":"index/introducing-gpt-6-1-sol","publicationDateText":"September 29, 2026","pageType":"Article","pageTitle":"Introducing GPT-6.1 Sol"',
    note: 'releasedAt 取该官方页自带的发布元数据 publicationDateText（正文不印日期）。'
  },
  {
    slug: 'gpt-6-luna',
    releasedAt: '2026-09-22',
    sourceUrl: 'https://openai.com/index/gpt-6-astra/',
    rawFile: 'oai-gpt6-astra.html',
    quote: 'Update on September 22, 2026: We are expanding our GPT‑6 family with GPT‑6 Sol and GPT‑6 Luna.',
    note: 'releasedAt 取 OpenAI 官方 Astra 页上的带日期更新行（明写 2026-09-22 扩充 GPT‑6 家族、点出 GPT‑6 Luna）；该模型自己的公告页在本次抓取时被 Cloudflare 403 拦住，故以官方 Astra 页的这条日期行为证。'
  },

  /* ---------------- 月之暗面 / kimi.com（L1/L5） ---------------- */
  {
    slug: 'kimi-k3',
    releasedAt: '2026-07-17',
    sourceUrl: 'https://www.kimi.com/news/kimi-k3',
    rawFile: 'kimi-news-k3.html',
    quote: 'Kimi K3：智能的新前沿 / 更新于：2026-07-17 / 今天，我们正式推出 Kimi K3，我们迄今能力最强的模型。',
    note: '官方新闻页的「更新于」与正文「今天，我们正式推出 Kimi K3」同为 2026-07-17（页面同屏并列）。'
  },
  {
    slug: 'kimi-k2.7-code',
    releasedAt: '2026-06-13',
    sourceUrl: 'https://www.kimi.com/resources/kimi-k2-7-code',
    rawFile: 'kimi-res-k27code.html',
    quote: '"description":"Kimi K2.7 Code 是一款聚焦编程、具备 agent 能力的模型，长程编程能力更强，agent 能力进一步提升，思考 token 用量较 K2.6 降低 30%。","datePublished":"2026-06-13T09:47:36.717Z"',
    note: 'releasedAt 取该官方页自带的 datePublished（页面可见文案只写「更新于：2026-09-14」，那是内容修订日，不作发布日期）。'
  }
];

/** 与 find.cjs / probe.cjs 同一套去标签实现（空白另在比较时全去掉）。 */
function toText(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|td|th|section|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '—')
    .replace(/[ \t\u00a0]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}
// 页面里的 JSON 负载会把引号写成 \"（JSON-in-JSON），比较时把反斜杠一起吃掉；
// 空白同样全去掉 —— 判据是「词句逐字相同」，不是「空白逐字相同」。
/** 复核专用提取器：**保留 <script> 内容**（官方发布日有时只写在页面的 JSON-LD / 内嵌负载里），
 *  只去掉标签本身与 style 标签。正文引文两种提取器都能命中。 */
function toTextKeepPayloads(html) {
  return String(html)
    .replace(/<script\b[^>]*>/gi, '\n').replace(/<\/script>/gi, '\n')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|td|th|section|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&mdash;/g, '—')
    .replace(/[ \t\u00a0]+/g, ' ');
}

const squash = value => String(value).replace(/[\s\u200b]+/g, '').replace(/\u00a0/g, '').replace(/\\+/g, '');

const problems = [];
const rawCache = new Map();
function rawSquashOf(file) {
  if (!rawCache.has(file)) {
    const full = path.join(RAW, file);
    rawCache.set(file, fs.existsSync(full) ? squash(fs.readFileSync(full, 'utf8')) : null);
  }
  return rawCache.get(file);
}
const textCache = new Map();
function rawTextOf(file) {
  if (!textCache.has(file)) {
    const full = path.join(RAW, file);
    textCache.set(file, fs.existsSync(full) ? squash(toTextKeepPayloads(fs.readFileSync(full, 'utf8'))) : null);
  }
  return textCache.get(file);
}

const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
const seen = new Set();
for (const item of EVIDENCE) {
  if (seen.has(item.slug)) problems.push(`${item.slug}: 采信表里重复出现`);
  seen.add(item.slug);
  if (!registry[item.slug]) { problems.push(`${item.slug}: registry 里没有这个 slug（不许新增身份）`); continue; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.releasedAt)) problems.push(`${item.slug}: releasedAt 不是 YYYY-MM-DD`);
  if (item.sourceUrl !== item.sourceUrl.trim()) problems.push(`${item.slug}: sourceUrl 有多余空白与不可见字符`);
  if (Array.from(item.quote).length > 400) problems.push(`${item.slug}: quote ${Array.from(item.quote).length} 字 > 400`);
  const text = rawTextOf(item.rawFile);
  const rawText = rawSquashOf(item.rawFile);
  if (text === null) { problems.push(`${item.slug}: 原始页面 raw/${item.rawFile} 不存在`); continue; }
  for (const segment of item.quote.split(' / ')) {
    const needle = squash(segment);
    if (!needle) continue;
    if (!text.includes(needle) && !(rawText !== null && rawText.includes(needle))) problems.push(`${item.slug}: 忠实度复核失败 —— 片段未在 raw/${item.rawFile} 里逐字命中：${segment.slice(0, 80)}`);
  }
  // 日期必须真的出现在引文里（不许「引文与日期两张皮」）
  if (!item.quote.includes(item.releasedAt)) {
    const loose = [item.releasedAt.replace(/-0?/g, '-'), item.releasedAt];
    const monthDay = item.releasedAt.slice(5).replace(/^0/, '');
    const yearZh = `${item.releasedAt.slice(0, 4)} 年 ${Number(item.releasedAt.slice(5, 7))} 月 ${Number(item.releasedAt.slice(8, 10))} 日`;
    const monthEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(item.releasedAt.slice(5, 7)) - 1];
    const monthAbbr = monthEn.slice(0, 3);
    const day = Number(item.releasedAt.slice(8, 10));
    const forms = [
      `${monthEn} ${day}, ${item.releasedAt.slice(0, 4)}`,
      `${monthAbbr} ${day}, ${item.releasedAt.slice(0, 4)}`
    ];
    if (!loose.some(f => item.quote.includes(f)) && !item.quote.includes(monthDay) && !item.quote.includes(yearZh) && !forms.some(f => item.quote.includes(f))) {
      problems.push(`${item.slug}: 引文里找不到 releasedAt（${item.releasedAt}）的日期写法 —— 日期语义不可核`);
    }
  }
}

if (problems.length) {
  console.error(`✗ 采信表有 ${problems.length} 处问题，未写盘：`);
  problems.forEach(p => console.error('  - ' + p));
  process.exit(1);
}
console.log(`✓ 采信表 ${EVIDENCE.length} 条全部通过忠实度机械复核（逐段在 raw/ 官方页原文里逐字命中）`);

if (process.argv.includes('--check-only')) process.exit(0);

for (const item of EVIDENCE) {
  const entry = registry[item.slug];
  entry.releasedAt = item.releasedAt;
  entry.releaseEvidence = [{
    field: 'releasedAt',
    quote: item.quote,
    sourceUrl: item.sourceUrl,
    capturedAt: CAPTURED_AT
  }];
  if (item.note) entry.note = item.note;
}

fs.writeFileSync(REGISTRY, JSON.stringify(registry, null, 2) + '\n');
console.log(`✓ 已写入 scripts/data/models.json：${EVIDENCE.length} 条 releasedAt + releaseEvidence`);
