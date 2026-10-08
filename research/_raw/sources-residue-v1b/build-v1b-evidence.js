#!/usr/bin/env node
/**
 * t16 / sources-residue-v1b：把本机抓下来的腾讯云官方快照抽成 Tier-1 逐字片段，
 * 并做「记录里的混元 6 模型 + 免费额度 ↔ TokenHub 公开计费面」的**逐项对账**。
 *
 * 三条纪律（写在代码里，免得下次有人图省事走捷径）：
 *   1. **分类由字节推出，不是先写结论再找证据**：每个模型都要么在同名 id 上找到行
 *      （再比价格数字），要么被断言「两张页面里都不存在这个 id」。断言失败就报错退出
 *      —— 页面改版时这脚本会红，而不是悄悄沿用旧结论。
 *   2. **把「读不到」写成读不到**：任何一步抓取失败/找不到锚点，直接抛错，不产出空证据。
 *   3. **不写数据**：只读仓库数据（record）与快照，只写 research/ 下的证据文件。
 *
 * 用法：node research/_raw/sources-residue-v1b/build-v1b-evidence.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const DIR = __dirname;
const ROOT = path.resolve(DIR, '..', '..', '..');
const DATE = '2026-10-08';

/* ------------------------------- 基础设施 ------------------------------- */

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readSnapshot(file) {
  const raw = fs.readFileSync(file);
  return (raw[0] === 0x1f && raw[1] === 0x8b) ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
}

function visibleLines(file) {
  const html = readSnapshot(file)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const text = html
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&mdash;/g, '-');
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

/** 从第 from 行起找 anchor，返回后面 n 行（找不到抛错 —— 宁可红，不要静默空证据） */
function windowFrom(lines, anchor, n, from = 0) {
  const at = lines.findIndex((line, index) => index >= from && line.includes(anchor));
  if (at < 0) throw new Error(`锚点找不到：${anchor}`);
  return { at, lines: lines.slice(at, at + n) };
}

function headerBlock(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '(缺 headers 快照)';
}

function writeMd(file, chunks) {
  fs.writeFileSync(path.join(DIR, file), chunks.join('\n') + '\n', 'utf8');
}

/** 快照清单（Tier-3、不入库）：文件名 → {url, 说明} */
const SNAPSHOTS = {
  'hunyuan-1729-97731-legacy.html': { url: 'https://cloud.tencent.com/document/product/1729/97731', note: '旧平台：混元生文计费概述' },
  'tokenhub-1823-130054-billing.html': { url: 'https://cloud.tencent.com/document/product/1823/130054', note: 'TokenHub：计费方式' },
  'tokenhub-1823-130055-model-price.html': { url: 'https://cloud.tencent.com/document/product/1823/130055', note: 'TokenHub：模型价格' },
  'tokenhub-1823-130051-model-list.html': { url: 'https://cloud.tencent.com/document/product/1823/130051', note: 'TokenHub：模型列表（含 model 调用参数 = 模型 id）' },
  'tokenhub-1823-130053-free-trial.html': { url: 'https://cloud.tencent.com/document/product/1823/130053', note: 'TokenHub：新人免费体验包' },
  'tokenhub-1823-131382-migration-guide.html': { url: 'https://cloud.tencent.com/document/product/1823/131382', note: 'TokenHub 迁移指南' },
  'tencent-announce-2287-migration.html': { url: 'https://cloud.tencent.com/announce/detail/2287', note: '公告：旧平台下线及 TokenHub 迁移' },
};

/* --------------------------------- ① 抽取 --------------------------------- */

const lines = {};
for (const file of Object.keys(SNAPSHOTS)) lines[file] = visibleLines(path.join(DIR, file));

const header = ['抓取日：' + DATE + '（Asia/Shanghai）', '', '本文件是**逐字片段**；完整 HTML 原件按 `docs/EVIDENCE-POLICY.md` 不入库，本机保留。', ''];

function snapshotTable() {
  const out = ['## 本机快照（不入库）', '', '| 文件 | 字节 | sha256（前 16） | URL |', '|---|---|---|---|'];
  for (const [file, meta] of Object.entries(SNAPSHOTS)) {
    const full = path.join(DIR, file);
    out.push(`| \`${file}\` | ${fs.statSync(full).size} | \`${sha256(full).slice(0, 16)}\` | <${meta.url}> |`);
  }
  return out;
}

/* 旧平台（混元生文计费概述） */
{
  const l = lines['hunyuan-1729-97731-legacy.html'];
  const out = ['# 旧平台：腾讯混元生文计费页（逐字片段）', '', ...header,
    `URL：<${SNAPSHOTS['hunyuan-1729-97731-legacy.html'].url}>`, '', ...snapshotTable(), '',
    '## 页面自报更新时间', '', '```', windowFrom(l, '最近更新时间', 3).lines.join('\n'), '```', '',
    '## 顶部迁移公告（逐字）', '', '```', windowFrom(l, '为进一步提升大模型服务体验', 7).lines.join('\n'), '```', '',
    '## 免费额度表（逐字）', '', '```', windowFrom(l, '免费调用额度将以一次性的免费资源包的形式发放', 24).lines.join('\n'), '```', '',
    '## token 后付费价格表（逐字）', '', '```', windowFrom(l, '刊例价（每 百万 tokens）', 40).lines.join('\n'), '```', ''];
  writeMd('hunyuan-legacy-extract.md', out);
}

/* TokenHub：模型价格 */
{
  const l = lines['tokenhub-1823-130055-model-price.html'];
  const gzFirst = windowFrom(l, '按 Token 计费（后付费）', 110);
  const sg = windowFrom(l, '模型名称', 40, 340);
  const multimodal = windowFrom(l, '多模态理解模型', 20, 1600);
  const vector = windowFrom(l, 'Kinfra-Text-Embedding-0.6b', 24);
  const out = ['# TokenHub：模型价格（逐字片段）', '', ...header,
    `URL：<${SNAPSHOTS['tokenhub-1823-130055-model-price.html'].url}>`, '', ...snapshotTable(), '',
    '## 页面自报更新时间', '', '```', windowFrom(l, '最近更新时间', 3).lines.join('\n'), '```', '',
    '## 语言模型 · 广州 tab（HTML 里 `tse-tabs__item is-active` 是「广州」）', '', '```', gzFirst.lines.join('\n'), '```', '',
    '## 语言模型 · 新加坡 tab（文档顺序里的第二张语言模型表；**没有 Hy-Role-Latest / Hy-Role 行**）', '', '```', sg.lines.join('\n'), '```', '',
    '## 多模态理解模型（逐字）', '', '```', multimodal.lines.join('\n'), '```', '',
    '## 向量模型（逐字）', '', '```', vector.lines.join('\n'), '```', ''];
  writeMd('tokenhub-price-extract.md', out);
}

/* TokenHub：模型列表 */
{
  const l = lines['tokenhub-1823-130051-model-list.html'];
  const lang = windowFrom(l, 'Hy-MT2-Pro', 30, 60);
  const vec = windowFrom(l, 'Kinfra-Text-Embedding-0.6b', 22);
  const out = ['# TokenHub：模型列表（逐字片段；`模型名称` = 展示名，`model（调用参数）` = 模型 id）', '', ...header,
    `URL：<${SNAPSHOTS['tokenhub-1823-130051-model-list.html'].url}>`, '', ...snapshotTable(), '',
    '## 页面自报更新时间', '', '```', windowFrom(l, '最近更新时间', 3).lines.join('\n'), '```', '',
    '## 语言模型（逐字；含 `Hy-Role-Latest` → `hunyuan-role-latest` 这一对）', '', '```', lang.lines.join('\n'), '```', '',
    '## 向量模型（逐字）', '', '```', vec.lines.join('\n'), '```', ''];
  writeMd('tokenhub-model-list-extract.md', out);
}

/* TokenHub：新人免费体验包 */
{
  const l = lines['tokenhub-1823-130053-free-trial.html'];
  const out = ['# TokenHub：新人免费体验包（逐字片段）', '', ...header,
    `URL：<${SNAPSHOTS['tokenhub-1823-130053-free-trial.html'].url}>`, '', ...snapshotTable(), '',
    '## 页面自报更新时间', '', '```', windowFrom(l, '最近更新时间', 3).lines.join('\n'), '```', '',
    '## 活动说明（逐字）', '', '```', windowFrom(l, 'TokenHub 当前为每个主账号提供一次免费体验额度', 4).lines.join('\n'), '```', '',
    '## 免费额度（语言模型 / 视觉 / 3D）（逐字）', '', '```', windowFrom(l, '所有语言模型均提供 100 万 Tokens 的免费体验额度', 22).lines.join('\n'), '```', ''];
  writeMd('tokenhub-free-trial-extract.md', out);
}

/* 公告 */
{
  const l = lines['tencent-announce-2287-migration.html'];
  const out = ['# 公告：腾讯云大模型旧平台下线及 TokenHub 迁移（逐字片段）', '', ...header,
    `URL：<${SNAPSHOTS['tencent-announce-2287-migration.html'].url}>`, '', ...snapshotTable(), '',
    '## 公告正文（逐字，窗口从首句起 22 行）', '', '```', windowFrom(l, '为持续优化产品能力', 22).lines.join('\n'), '```', ''];
  writeMd('tencent-migration-announcement-extract.md', out);
}

/* 迁移指南 */
{
  const l = lines['tokenhub-1823-131382-migration-guide.html'];
  const out = ['# TokenHub 迁移指南（逐字片段）', '', ...header,
    `URL：<${SNAPSHOTS['tokenhub-1823-131382-migration-guide.html'].url}>`, '', ...snapshotTable(), '',
    '## 页面自报更新时间', '', '```', windowFrom(l, '最近更新时间', 3).lines.join('\n'), '```', '',
    '## 开头（逐字）', '', '```', windowFrom(l, '为提升用户使用大模型的体验', 6).lines.join('\n'), '```', '',
    '## 「TokenHub 不再支持」的模型名单（逐字）', '', '```', windowFrom(l, 'hunyuan-t1-latest', 5).lines.join('\n'), '```', ''];
  writeMd('tokenhub-migration-guide-extract.md', out);
}

/* ------------------------------- ② 逐项对账 ------------------------------- */

const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'curated_api_plans.json'), 'utf8'))
  .find(plan => plan.provider === '腾讯云' && plan.planName === '混元生文按量计费');

const priceText = lines['tokenhub-1823-130055-model-price.html'].join('\n');
const listText = lines['tokenhub-1823-130051-model-list.html'].join('\n');
const billingText = lines['tokenhub-1823-130054-billing.html'].join('\n');
const guideText = lines['tokenhub-1823-131382-migration-guide.html'].join('\n');
const announceText = lines['tencent-announce-2287-migration.html'].join('\n');
const freeText = lines['tokenhub-1823-130053-free-trial.html'].join('\n');

/**
 * 每个记录模型的对照规则。`present` 由**字节**判定（不是先写结论）：
 *   · 在 TokenHub 模型列表里找 `hunyuan-role-latest` 这样的**模型 id**；
 *   · 找到 ⇒ 再去模型价格页找同名行并比 输入/输出 两个数字；
 *   · 找不到 ⇒ 断言「两张页面里都不存在这个 id」，分类 = 该页不载。
 */
const RULES = [
  { modelKey: 'hunyuan-role-latest', tokenhubDisplay: 'Hy-Role-Latest', tokenhubId: 'hunyuan-role-latest', tab: '广州' },
  { modelKey: 'hunyuan-a13b' },
  { modelKey: 'hunyuan-translation' },
  { modelKey: 'hunyuan-translation-lite' },
  { modelKey: 'tencent-hy-vision-1.5-instruct' },
  { modelKey: 'hunyuan-embedding' },
];

const problems = [];
const rows = [];

for (const rule of RULES) {
  const entry = record.models.find(model => model.modelKey === rule.modelKey);
  if (!entry) { problems.push(`记录里找不到模型 ${rule.modelKey}`); continue; }
  const recordRates = { input: entry.rates.input, output: entry.rates.output };
  const row = {
    modelKey: rule.modelKey,
    name: entry.name,
    recordRates,
    recordVariant: entry.variant,
    tokenhub: null,
    verdict: null,
    reasoning: []
  };

  const idPresent = listText.toLowerCase().includes(rule.modelKey.toLowerCase());
  if (!idPresent) {
    // 断言「不存在」也必须被检查（页面改版新增同名模型时，这里会变成 false 而让人重新对账）
    if (priceText.toLowerCase().includes(rule.modelKey.toLowerCase())) {
      problems.push(`${rule.modelKey}: 模型列表里没有，但价格页里出现了 —— 规则需要重写`);
    }
    row.verdict = '该页不载';
    row.reasoning.push(`TokenHub 模型列表（130051）与模型价格（130055）都没有模型 id \`${rule.modelKey}\``);
    if (guideText.includes(rule.modelKey)) row.reasoning.push('迁移指南把它列进「TokenHub 将不再支持」的名单');
    rows.push(row);
    continue;
  }

  const display = rule.tokenhubDisplay;
  if (!listText.includes(display)) problems.push(`${rule.modelKey}: 模型列表里有 id 但找不到展示名 ${display}`);
  const at = priceText.indexOf(display);
  if (at < 0) problems.push(`${rule.modelKey}: 价格页里找不到展示名 ${display}`);
  const windowLines = priceText.slice(at, at + 200).split('\n').map(s => s.trim()).filter(Boolean);
  // 行结构：展示名, 条件, 峰谷, 输入, 输出, 缓存命中
  const numbers = windowLines.slice(1, 6);
  const tokenhubRates = { input: Number(numbers[2]), output: Number(numbers[3]) };
  if (!Number.isFinite(tokenhubRates.input) || !Number.isFinite(tokenhubRates.output)) {
    problems.push(`${rule.modelKey}: 从价格行里读不出输入/输出数字（${JSON.stringify(numbers)}）`);
  }
  row.tokenhub = { display, id: rule.tokenhubId, tab: rule.tab, rates: tokenhubRates };
  const same = tokenhubRates.input === recordRates.input && tokenhubRates.output === recordRates.output;
  row.verdict = same ? '一致' : '不一致';
  row.reasoning.push(`TokenHub 模型列表用同一个模型 id（\`${rule.tokenhubId}\`）列出它，展示名 ${display}`);
  row.reasoning.push(`价格页「${rule.tab}」tab 的 ${display} 行：推理输入 ${tokenhubRates.input} / 推理输出 ${tokenhubRates.output}（元/百万 tokens）`);
  row.reasoning.push(`记录：${recordRates.input} / ${recordRates.output} ⇒ **${row.verdict}**`);
  rows.push(row);
}

/* 免费额度 */
const imageFreebieLines = lines['tokenhub-1823-130055-model-price.html'].filter(line => line.includes('免费') && line.includes('图片'));
const freeRow = {
  field: 'freeTier',
  record: {
    amount: record.freeTier.amount,
    period: record.freeTier.period,
    stability: record.freeTier.stability,
    description: record.freeTier.description
  },
  tokenhubPricePage: {
    hasPlatformFreeTier: /免费体验(额度|包)|免费额度/.test(priceText),
    perCallImageFreebies: imageFreebieLines.length,
    perCallImageFreebieSample: imageFreebieLines[0] || null
  },
  tokenhubBillingPage: {
    hasAmounts: /免费体验额度.{0,20}(万|Tokens)/.test(billingText),
    pointsToFreeTrialDoc: billingText.includes('新人免费额度详情请参见') && billingText.includes('新人免费体验包')
  },
  tokenhubFreeTrial: {
    url: SNAPSHOTS['tokenhub-1823-130053-free-trial.html'].url,
    quote: '所有语言模型均提供 100 万 Tokens 的免费体验额度，有效期 1 年。',
    activityDeadline: '本期活动时间截至 2026 年 12 月 31 日',
    otherPackages: '视觉生成按积分（如生视频 50 积分 / 1 年；3D 生成另计）'
  },
  announcement: {
    url: SNAPSHOTS['tencent-announce-2287-migration.html'].url,
    quote: '完成 TokenHub 迁移的用户，可申领免费体验额度，有效期 3 个月。'
  },
  verdict: null,
  reasoning: []
};

if (freeRow.tokenhubPricePage.hasPlatformFreeTier) {
  problems.push('TokenHub 模型价格页出现了平台级免费额度字样 —— 免费额度这一行的分类需要重写');
}
if (freeRow.tokenhubBillingPage.hasAmounts) {
  problems.push('TokenHub 计费方式页直接写了免费额度金额 —— 分类需要重写');
}
freeRow.verdict = '该页不载';
freeRow.reasoning.push('TokenHub 的**计费面**：130055 模型价格**不含**平台级免费额度（它里面的「免费」全是单次调用内的图片张数细则，例如 `' + (freeRow.tokenhubPricePage.perCallImageFreebieSample || '') + '`，共 ' + imageFreebieLines.length + ' 行）；130054 计费方式**不写金额与期限**，只有一句指针「新人免费额度详情请参见新人免费体验包」');
freeRow.reasoning.push('金额与期限写在**另一个产品页**上：新人免费体验包（130053）「所有语言模型均提供 100 万 Tokens 的免费体验额度，有效期 1 年」，活动截至 2026-12-31');
freeRow.reasoning.push('另有迁移公告的另一种额度：「完成 TokenHub 迁移的用户，可申领免费体验额度，有效期 3 个月」');
freeRow.reasoning.push('新人体验包与记录**同量同期**（100 万 / 1 年），但它是 TokenHub 的活动包（按模型领取、有活动截止日），不是记录所述旧平台「首次开通混元服务」发的资源包 ⇒ **不计入「一致」**（同一句话在两处成立不能当作同一条事实）');

/* 断言：公告的关键日期与指南的名单必须真的在页面里 */
for (const needle of ['2026 年 6 月 30 日 00:00 停止售卖', '2026 年 9 月 30 日 00:00 全面停服下线']) {
  if (!announceText.includes(needle)) problems.push(`公告里找不到「${needle}」`);
}
for (const needle of ['hunyuan-a13b', 'hunyuan-translation', 'hunyuan-translation-lite']) {
  if (!guideText.includes(needle)) problems.push(`迁移指南的「不再支持」名单里找不到 ${needle}`);
}
for (const needle of ['100 万 Tokens 的免费体验额度，有效期 1 年', '本期活动时间截至 2026 年 12 月 31 日']) {
  if (!freeText.includes(needle)) problems.push(`新人免费体验包页里找不到「${needle}」`);
}

const summary = {
  task: 'sources-residue-v1b',
  date: DATE,
  recordSource: 'scripts/data/curated_api_plans.json → provider 腾讯云 / 混元生文按量计费（verifiedAt ' + record.verifiedAt + '）',
  tokenhubSurfaces: Object.entries(SNAPSHOTS).filter(([f]) => f.startsWith('tokenhub')).map(([f, m]) => m.url),
  classification: {
    verdicts: rows.reduce((acc, row) => { acc[row.verdict] = (acc[row.verdict] || 0) + 1; return acc; }, {}),
    rows,
    freeTier: freeRow
  },
  environment: {
    exitRegionHint: 'HTTP 响应头里是香港出口（CF-RAY …-HKG）；腾讯云五张页面全部 200，没有区域门',
    tabPanels: '抓取工具是 curl（不是无头浏览器），页面里的 tab 面板按 HTML 原文一并取下：广州/新加坡两张表都在同一份 HTML 里；「广州」是 `tse-tabs__item is-active`，紧随其后的 `tse-tabs__cont is-active` 是第一张表（含 Hy-Role-Latest）'
  },
  problems
};

fs.writeFileSync(path.join(DIR, 'tokenhub-vs-record.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

console.log(`记录模型 ${rows.length} 条：` + rows.map(row => `${row.modelKey}=${row.verdict}`).join(' · '));
console.log(`免费额度：${freeRow.verdict}`);
if (problems.length) {
  console.error('❌ 断言失败：');
  for (const problem of problems) console.error('   - ' + problem);
  process.exit(1);
}
console.log('✅ 全部断言通过（每一行的分类都由快照字节推出）');
