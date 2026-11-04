#!/usr/bin/env node
/**
 * API 计费记录（`curated_api_plans.json`）的**每日静态校验**。
 *
 * 用法：
 *   node scripts/tools/verify-api-plans.js --dry-run   # 只抓取 / 解析 / 报告，不写盘（惯例同 collect.js）
 *   node scripts/tools/verify-api-plans.js             # 写盘：lastVerifiedAt / 价格 / 历史 / 健康
 *   node scripts/tools/verify-api-plans.js --strict    # 有校验失败时退出 1（默认 0，不阻断采集链）
 *   node scripts/tools/verify-api-plans.js --json      # 机器可读摘要
 *
 * ## 它只做一件事：把 `checkMethod === "static"` 的条目录一遍
 *
 * 「static」的判据是硬的：**裸 HTTP GET 就能拿到真实价格页正文（含正常跳转后的正文）**。
 * 本脚本用 `fetch`（跟随重定向）+ 每家一个显式解析器，把页面上的价目表读成
 * `{modelKey, variant, rates}` 再与数据逐字段核对。没有解析器 / 页面要求 JS 渲染 / 被区域封锁的
 * 条目由 `headless` 或 `manual` 覆盖，不在本脚本范围内 —— 它不是"全量抓取器"。
 *
 * ## 写盘纪律（与 `collect.js` / `rebuild-api-plans.js` 同一条）
 *
 *   · **校验成功** → 更新该条 `lastVerifiedAt`（每次成功都更新）；
 *   · **价格未变** → **不写任何历史事件**（这是硬要求：核验不是厂商变化）；
 *   · **价格变了** → ① 采纳新价（同时刷新 lastSeen / verifiedAt，让事件日期与数据日期同源）
 *     ② 追加 `api-plan-history.json` 事件（形状由 `lib/api-plan-history.js` 的 `record()` 生成，
 *     不手写字段）③ 写出 `api-plans.json`（派生文件与来源层同批更新，避免两道门禁互斥）；
 *   · **校验失败** → 不改 `lastVerifiedAt`，只把失败记进 `api-plan-health.json`（形态与
 *     `source-health.json` 相同，但**不是同一个文件**：那一份与采集器注册表逐行对账）；
 *     退出码仍为 0（只有 `--strict` 才非 0），免得上游页面一时抖动就阻断整条采集链。
 *
 * ## 确定性
 *
 * 健康表的 `lastAttemptAt` / `lastSuccessAt` 用「当天 00:00:00Z」而不是墙上时钟，
 * 历史事件用当天日期（`YYYY-MM-DD`）。因此同一天连跑两次，产物逐字节一致
 * （价格发生变化时，第二次运行看到的是已采纳的新价 ⇒ 不会重复追加事件）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const apiSchema = require('../lib/api-plan-schema');
const apiHistory = require('../lib/api-plan-history');
const providers = require('../lib/providers');
const health = require('../lib/health');
const { todayCN } = require('../lib/schema');

const ROOT = path.join(__dirname, '..', '..');
const CURATED_FILE = path.join(ROOT, 'scripts', 'data', 'curated_api_plans.json');
const API_PLANS_FILE = path.join(ROOT, 'api-plans.json');
// 健康槽位写**独立文件**（`search-intent-v1` 修）：`source-health.json` 是采集器的
// 15 个登记来源逐条健康表，`check:coverage-targets` 的 t46 会拿它和来源注册表**逐行对账**
// （注册表几行、文件几行必须相等）。本轮新增的 7 条 API 定价源不在那份注册表里，
// 写进去就会把「注册表 15 行 / 文件 16 行」变成一条必红的假警报 —— 形态照抄，落点分开。
const HEALTH_FILE = path.join(ROOT, 'scripts', 'data', 'api-plan-health.json');

const TODAY = todayCN();
const NOW = new Date(`${TODAY}T00:00:00.000Z`);
const FETCH_TIMEOUT_MS = 30000;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const dryRun = process.argv.includes('--dry-run');
const strict = process.argv.includes('--strict');
const jsonOut = process.argv.includes('--json');

/* ------------------------------------------------------------------ */
/* 抓取                                                                */
/* ------------------------------------------------------------------ */

async function fetchText(url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml,text/markdown,text/plain;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7'
      }
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url || url,
      contentType: response.headers.get('content-type') || '',
      bytes: Buffer.byteLength(text),
      text,
      durationMs: Date.now() - startedAt,
      error: response.ok ? null : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      finalUrl: url,
      contentType: '',
      bytes: 0,
      text: '',
      durationMs: Date.now() - startedAt,
      error: error && error.name === 'TimeoutError'
        ? `请求超时（>${FETCH_TIMEOUT_MS}ms）`
        : String((error && error.message) || error)
    };
  }
}

/* ------------------------------------------------------------------ */
/* 解析器公共助手                                                       */
/* ------------------------------------------------------------------ */

function normalizeName(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function numberIn(text) {
  const match = String(text === null || text === undefined ? '' : text).match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : null;
}

function visibleText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();
  return $('body').text().replace(/\s+/g, ' ');
}

function parseError(message) {
  return { ok: false, models: [], problems: [message] };
}

function matchModel(models, label) {
  const key = normalizeName(label);
  if (!key) return null;
  const exact = models.filter(model => normalizeName(model.name) === key || normalizeName(model.modelKey) === key);
  if (exact.length === 1) return exact[0];
  const byAlias = models.filter(model => (model.aliases || []).some(alias => normalizeName(alias) === key));
  if (byAlias.length === 1) return byAlias[0];
  return null;
}

/**
 * 用「已解析模型 → 存数据模型」的 (modelKey, variant) 对账。
 * 解析器只回报它确实在页面上看到了的模型；缺失由调用方判为**解析失败**（不是价格变化）。
 */
function modelKeyOf(models, modelKey, variant) {
  return models.find(model => model.modelKey === modelKey && (model.variant || 'standard') === (variant || 'standard'));
}

/* ------------------------------------------------------------------ */
/* 解析器（每个都是一份「官方页面结构 → 价格」的显式映射）                 */
/* ------------------------------------------------------------------ */

/**
 * DeepSeek：一张表，列是模型（`deepseek-flash(1)` / `deepseek-v4-pro`），
 * 行按 `1M INPUT/OUTPUT TOKENS` × `PEAK / OFF-PEAK` 展开。channel 决定取哪一行。
 */
function parseDeepseek(entry, page) {
  if (!page.ok) return parseError(page.error || '抓取失败');
  const $ = cheerio.load(page.text);
  const models = entry.models;
  const table = $('table').filter((_, node) => {
    const first = $(node).find('tr').first().find('th,td').first().text().trim().toUpperCase();
    return first === 'MODEL';
  }).first();
  if (!table.length) return parseError('页面里找不到表头为 MODEL 的价目表');

  const headerCells = table.find('tr').first().find('th,td').map((_, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get();
  const columnModels = headerCells.slice(1).map(label => {
    const clean = label.replace(/\([0-9]+\)$/, '').trim();
    return matchModel(models, clean) || matchModel(models, label);
  });
  if (columnModels.some(model => !model)) return parseError(`价目表表头有无法映射到数据的模型列：${headerCells.slice(1).join(' / ')}`);

  const wantedTier = entry.channel === 'off_peak' ? 'OFF-PEAK' : 'PEAK';
  const rows = [];
  table.find('tr').slice(1).each((_, row) => {
    rows.push($(row).find('th,td').map((__, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get());
  });

  let section = null;
  const values = new Map(); // modelKey → { input, output, cachedInput }
  for (const cells of rows) {
    let label = null;
    let tier = null;
    let data = null;
    const first = cells[0] || '';
    if (/^PRICING/i.test(first)) {
      section = cells[1] || section;
      tier = cells[2] || null;
      data = cells.slice(3);
    } else if (/^(PEAK|OFF-PEAK)$/.test(first)) {
      tier = first;
      data = cells.slice(1);
    } else if (/^1M\s+(INPUT|OUTPUT)/i.test(first)) {
      section = first;
      if (/^(PEAK|OFF-PEAK)$/.test(cells[1] || '')) {
        tier = cells[1];
        data = cells.slice(2);
      } else {
        data = cells.slice(1);
      }
    }
    if (!section || !tier || tier !== wantedTier || !data || !data.length) continue;
    const dim = /CACHE HIT/i.test(section) ? 'cachedInput' : /CACHE MISS/i.test(section) ? 'input' : /OUTPUT/i.test(section) ? 'output' : null;
    if (!dim) continue;
    columnModels.forEach((model, index) => {
      const raw = data[index];
      if (raw === null || raw === undefined) return;
      const value = numberIn(raw);
      if (value === null) return;
      if (!values.has(model.modelKey)) values.set(model.modelKey, {});
      values.get(model.modelKey)[dim] = value;
    });
  }

  const parsed = [];
  for (const model of models) {
    const rates = values.get(model.modelKey);
    if (!rates) return parseError(`模型 ${model.modelKey} 在 ${wantedTier} 行里没有读到价格`);
    const missing = ['input', 'output', 'cachedInput'].filter(dim => model.rates[dim] !== null && rates[dim] === undefined);
    if (missing.length) return parseError(`模型 ${model.modelKey} 缺少维度 ${missing.join(' / ')}`);
    const quote = `PRICING: 1M INPUT TOKENS(CACHE MISS) ${wantedTier} $${rates.input}；`
      + `1M INPUT TOKENS(CACHE HIT) ${wantedTier} $${rates.cachedInput}；1M OUTPUT TOKENS ${wantedTier} $${rates.output}`;
    parsed.push({ modelKey: model.modelKey, variant: model.variant || 'standard', rates, quote });
  }
  return { ok: true, models: parsed, problems: [] };
}

/**
 * Fireworks：官方 Markdown 价目表。每行 `[显示名](链接) | Standard 三元组 | Priority 三元组`，
 * Standard 单元格是「input / cached input / output」（页面原文如此，见 docs/api-plan-verification.md）。
 */
function parseFireworks(entry, page) {
  if (!page.ok) return parseError(page.error || '抓取失败');
  const lines = page.text.split(/\r?\n/);
  const parsed = [];
  for (const model of entry.models) {
    let found = null;
    for (const line of lines) {
      if (!line.trim().startsWith('|')) continue;
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
      if (cells.length < 3) continue;
      const label = cells[0].replace(/^\[(.*)\]\([^)]*\)$/, '$1').trim();
      if (normalizeName(label) !== normalizeName(model.name)) continue;
      const standard = cells[1];
      const match = standard.match(/\\?\$([0-9.]+)\s*\/\s*\\?\$([0-9.]+)\s*\/\s*\\?\$([0-9.]+)/);
      if (!match) continue;
      found = { input: Number(match[1]), cachedInput: Number(match[2]), output: Number(match[3]), cell: standard };
      break;
    }
    if (!found) return parseError(`模型 ${model.name} 在 Markdown 价目表里找不到 Standard 行`);
    const quote = `${model.name}（Standard，USD per 1M tokens）：输入 $${found.input} / 缓存 $${found.cachedInput} / 输出 $${found.output}`;
    parsed.push({
      modelKey: model.modelKey,
      variant: model.variant || 'standard',
      rates: { input: found.input, cachedInput: found.cachedInput, output: found.output },
      quote
    });
  }
  return { ok: true, models: parsed, problems: [] };
}

/** 腾讯云：`产品名 | 刊例价（每 百万 tokens）`，单元格是「输入：0.5元 输出：2元」。 */
function parseTencent(entry, page) {
  if (!page.ok) return parseError(page.error || '抓取失败');
  const $ = cheerio.load(page.text);
  const models = entry.models;
  const parsed = [];
  const rows = [];
  $('table').each((_, table) => {
    const header = $(table).find('tr').first().find('th,td').map((__, cell) => $(cell).text().replace(/\s+/g, ' ')).get();
    if (!header.some(cell => cell.includes('刊例价'))) return;
    $(table).find('tr').slice(1).each((__, row) => {
      rows.push($(row).find('th,td').map((___, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get());
    });
  });
  if (!rows.length) return parseError('页面里找不到「刊例价（每 百万 tokens）」表');
  for (const model of models) {
    const row = rows.find(cells => normalizeName(cells[0]) === normalizeName(model.name));
    if (!row) return parseError(`模型 ${model.name} 在刊例价表里找不到`);
    const match = (row[1] || '').match(/输入[：:]\s*([0-9.]+)\s*元\s*输出[：:]\s*([0-9.]+)\s*元/);
    if (!match) return parseError(`模型 ${model.name} 的价格单元格不是「输入：X元 输出：Y元」形态`);
    parsed.push({
      modelKey: model.modelKey,
      variant: model.variant || 'standard',
      rates: { input: Number(match[1]), output: Number(match[2]) },
      quote: `${model.name} | 刊例价（每 百万 tokens）：输入：${match[1]}元 输出：${match[2]}元`
    });
  }
  return { ok: true, models: parsed, problems: [] };
}

/** 百川：`模型调用 <name>` 行，价格单元格是「输入：X元/千tokens 输出：Y元/千tokens」。 */
function parseBaichuan(entry, page) {
  if (!page.ok) return parseError(page.error || '抓取失败');
  const $ = cheerio.load(page.text);
  const models = entry.models;
  const rows = [];
  $('table').each((_, table) => {
    $(table).find('tr').slice(1).each((__, row) => {
      rows.push($(row).find('th,td').map((___, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get());
    });
  });
  if (!rows.length) return parseError('页面里找不到价目表');
  const parsed = [];
  for (const model of models) {
    const row = rows.find(cells => normalizeName(cells[0]) === normalizeName(`模型调用 ${model.name}`));
    if (!row) return parseError(`模型 ${model.name} 在价目表里找不到「模型调用 …」行`);
    const priceCell = row.find(cell => /元\s*\/\s*千tokens/.test(cell)) || '';
    const match = priceCell.match(/输入[：:]\s*([0-9.]+)\s*元\s*\/\s*千tokens\s*输出[：:]\s*([0-9.]+)\s*元\s*\/\s*千tokens/);
    if (!match) return parseError(`模型 ${model.name} 的价格单元格不是「输入：X元/千tokens 输出：Y元/千tokens」形态`);
    parsed.push({
      modelKey: model.modelKey,
      variant: model.variant || 'standard',
      rates: { input: Number(match[1]), output: Number(match[2]) },
      quote: `模型调用 ${model.name}：输入：${match[1]}元/千tokens 输出：${match[2]}元/千tokens`
    });
  }
  return { ok: true, models: parsed, problems: [] };
}

/** 商汤：`<name>模型调用 | 输入tokens | X元/千tokens | 输出tokens | Y元/千tokens`。 */
function parseSensetime(entry, page) {
  if (!page.ok) return parseError(page.error || '抓取失败');
  const $ = cheerio.load(page.text);
  const models = entry.models;
  const rows = [];
  $('table').each((_, table) => {
    $(table).find('tr').slice(1).each((__, row) => {
      rows.push($(row).find('th,td').map((___, cell) => $(cell).text().replace(/\s+/g, ' ').trim()).get());
    });
  });
  if (!rows.length) return parseError('页面里找不到价目表');
  const parsed = [];
  for (const model of models) {
    const row = rows.find(cells => normalizeName(cells[0]) === normalizeName(`${model.name}模型调用`));
    if (!row) return parseError(`模型 ${model.name} 在价目表里找不到「${model.name}模型调用」行`);
    const inputAt = row.findIndex(cell => cell === '输入tokens');
    const outputAt = row.findIndex(cell => cell === '输出tokens');
    if (inputAt < 0 || outputAt < 0) return parseError(`模型 ${model.name} 的行里缺少「输入tokens / 输出tokens」列`);
    const input = numberIn(row[inputAt + 1]);
    const output = numberIn(row[outputAt + 1]);
    if (input === null || output === null) return parseError(`模型 ${model.name} 的 token 单价读不出来`);
    parsed.push({
      modelKey: model.modelKey,
      variant: model.variant || 'standard',
      rates: { input, output },
      quote: `${model.name}模型调用：输入tokens ${row[inputAt + 1]} 输出tokens ${row[outputAt + 1]}`
    });
  }
  return { ok: true, models: parsed, problems: [] };
}

/**
 * 硅基流动：页面正文是一张把「厂商 / 模型路径 / 三个价格」粘在一起的文本表，
 * 形如 `GLM-5.3zai-org/GLM-5.3¥ 8.00¥ 28.00¥ 2.00`。
 * 匹配时要求同一行里的模型路径 basename 与显示名一致 —— 否则 `GLM-5.3` 会误命中 `GLM-5.3-Flash`。
 */
function parseSiliconflow(entry, page) {
  if (!page.ok) return parseError(page.error || '抓取失败');
  const text = visibleText(page.text);
  const models = entry.models;
  const parsed = [];
  for (const model of models) {
    const escaped = model.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const finder = new RegExp(`${escaped}([^¥]{0,120}?)(?=¥)`, 'g');
    const hits = [];
    let match;
    while ((match = finder.exec(text))) {
      const idMatch = match[1].match(/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)\s*$/);
      const id = idMatch ? idMatch[1] : match[1];
      if (normalizeName(id.split('/').pop()) === normalizeName(model.name)) hits.push(match.index);
    }
    if (!hits.length) return parseError(`模型 ${model.name} 在价格文本里找不到`);
    // 同一显示名可能在页面上出现多次（不同供应商 / 不同计费卡片）。优先选择**字段齐全**的那一条；
    // 若数据里缓存价有值而某条页面行写「-」，说明那是另一条同名行，不是价格变化。
    const isComplete = candidate => ['input', 'output', 'cachedInput']
      .every(dim => model.rates[dim] === null || model.rates[dim] === undefined || candidate[dim] !== null);
    const candidates = [];
    for (const hit of hits) {
      const segment = text.slice(hit, hit + 240);
      const prices = segment.match(/¥\s*([0-9.]+)¥\s*([0-9.]+)(-|¥\s*([0-9.]+))/);
      if (!prices) continue;
      const input = Number(prices[1]);
      const output = Number(prices[2]);
      const cachedInput = prices[3] === '-' ? null : Number(prices[4]);
      candidates.push({ input, output, cachedInput });
    }
    const chosen = candidates.find(isComplete) || candidates[0];
    if (!chosen) return parseError(`模型 ${model.name} 的价格三元组读不出来`);
    const { input, output, cachedInput } = chosen;
    if (cachedInput === null && model.rates.cachedInput !== null) {
      return parseError(`模型 ${model.name} 的页面缓存价为「-」，但数据里写着缓存价`);
    }
    const quote = `${model.name}（输入价格 M Tokens）：输入 ¥${input} / 输出 ¥${output}`
      + (cachedInput === null ? '' : ` / 缓存 ¥${cachedInput}`);
    parsed.push({
      modelKey: model.modelKey,
      variant: model.variant || 'standard',
      rates: { input, output, cachedInput },
      quote
    });
  }
  return { ok: true, models: parsed, problems: [] };
}

/**
 * provider key → 解析器。**只有这里列出来的 provider 才能标 static**；
 * 新增一家 = 新增一个显式解析器 + 一行 docs 实测记录，不允许"通用启发式解析"。
 */
const PARSERS = {
  deepseek: parseDeepseek,
  fireworks: parseFireworks,
  tencent: parseTencent,
  baichuan: parseBaichuan,
  sensetime: parseSensetime,
  siliconflow: parseSiliconflow
};

/* ------------------------------------------------------------------ */
/* 对账                                                                */
/* ------------------------------------------------------------------ */

const COMPARED_DIMS = ['input', 'output', 'cachedInput'];

function compareEntry(entry, parsed) {
  const problems = [];
  const changes = [];
  const byKey = new Map(parsed.models.map(item => [`${item.modelKey}|${item.variant}`, item]));
  for (const model of entry.models) {
    const key = `${model.modelKey}|${model.variant || 'standard'}`;
    const observed = byKey.get(key);
    if (!observed) {
      problems.push(`模型 ${model.modelKey} 页面未解析出价格`);
      continue;
    }
    for (const dim of COMPARED_DIMS) {
      if (model.rates[dim] === null || model.rates[dim] === undefined) continue;
      if (observed.rates[dim] === null || observed.rates[dim] === undefined) {
        problems.push(`模型 ${model.modelKey} 的 ${dim} 在页面上没有读到（数据里有值，拒绝把"读不到"当成"变了"）`);
        continue;
      }
      if (Number(observed.rates[dim]) !== Number(model.rates[dim])) {
        changes.push({
          modelKey: model.modelKey,
          variant: model.variant || 'standard',
          dim,
          from: model.rates[dim],
          to: observed.rates[dim],
          quote: observed.quote
        });
      }
    }
  }
  return { problems, changes };
}

/* ------------------------------------------------------------------ */
/* 写盘：数据 / 历史 / 健康                                              */
/* ------------------------------------------------------------------ */

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyChanges(entry, changes, today) {
  for (const change of changes) {
    const model = entry.models.find(item => item.modelKey === change.modelKey && (item.variant || 'standard') === change.variant);
    if (!model) continue;
    model.rates[change.dim] = change.to;
  }
  entry.lastSeen = today;
  entry.verifiedAt = today;
}

/** 变化时把该模型的价目表行写回证据：引文与数字必须同源，否则 evidenceBindingProblems 会红。 */
function refreshEvidence(entry, changes, today) {
  const byModel = new Map();
  for (const change of changes) {
    if (!byModel.has(change.modelKey)) byModel.set(change.modelKey, change);
  }
  for (const [modelKey, change] of byModel) {
    const field = `models.${modelKey}`;
    const lang = entry.region === 'cn' ? 'zh' : 'en';
    let item = entry.evidence.find(e => e.field === field);
    if (!item) {
      const rateItem = entry.evidence.find(e => String(e.field).startsWith(`${field}.`));
      if (rateItem) item = rateItem;
    }
    if (item) {
      item.quote = change.quote.slice(0, 200);
      item.sourceUrl = entry.sourceUrl;
      item.capturedAt = today;
      item.lang = lang;
    } else if (entry.evidence.length < apiSchema.API_EVIDENCE_MAX_ITEMS) {
      entry.evidence.push({
        field,
        quote: change.quote.slice(0, 200),
        sourceUrl: entry.sourceUrl,
        capturedAt: today,
        lang
      });
    }
  }
}

function buildNextPayload(curated, providerTable) {
  const built = apiSchema.buildApiStore({ curated, providerTable, today: TODAY });
  if (built.problems.length) {
    return { ok: false, problems: built.problems.map(item => `#${item.index === null ? '-' : item.index} ${item.planName || ''} ${item.reason}`.trim()) };
  }
  return { ok: true, payload: built.payload };
}

function updateHealth(attempts) {
  const loaded = health.load(HEALTH_FILE);
  const rows = (loaded.doc && Array.isArray(loaded.doc.sources) ? loaded.doc.sources : []).map(row => ({ ...row }));
  for (const attempt of attempts) {
    const index = rows.findIndex(row => row && row.source === attempt.source);
    const previous = index >= 0 ? rows[index] : null;
    // 同一天重复运行必须逐字节一致：本轮结论与今天已记录的状态相同 ⇒ 原样保留
    // （否则 lastItemCount / previousItemCount / delta 会每跑一次漂一次）。
    const sameDay = previous && String(previous.lastAttemptAt || '').slice(0, 10) === TODAY;
    const sameOutcome = previous && (attempt.ok ? previous.status === 'healthy' : previous.status === 'failed');
    if (sameDay && sameOutcome) continue;
    const next = health.evaluate({ previous, attempt, now: NOW });
    if (index >= 0) rows[index] = next;
    else rows.push(next);
  }
  // 只保留本次参与推进的行；其余来源原样保留（含 collect 的既有条目），排序稳定。
  const order = new Map();
  rows.forEach((row, index) => { if (row && row.source) order.set(row.source, index); });
  rows.sort((a, b) => {
    const aIsOurs = attempts.some(item => item.source === a.source);
    const bIsOurs = attempts.some(item => item.source === b.source);
    if (aIsOurs !== bIsOurs) return aIsOurs ? 1 : -1;
    return String(a.source).localeCompare(String(b.source));
  });
  return {
    doc: { schemaVersion: loaded.doc.schemaVersion || 1, generatedAt: NOW.toISOString(), sources: rows }
  };
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function flagSummary() {
  return { dryRun, strict, today: TODAY };
}

async function main() {
  if (!fs.existsSync(CURATED_FILE)) {
    console.error(`❌ 缺少 ${path.relative(ROOT, CURATED_FILE)}`);
    return 1;
  }
  let curated;
  try {
    curated = JSON.parse(fs.readFileSync(CURATED_FILE, 'utf8'));
  } catch (error) {
    console.error(`❌ ${path.relative(ROOT, CURATED_FILE)} 解析失败：${error.message}`);
    return 1;
  }
  if (!Array.isArray(curated)) {
    console.error('❌ curated_api_plans.json 必须是数组');
    return 1;
  }

  const providerLoad = providers.load();
  if (providerLoad.missing || providerLoad.broken) {
    console.error('❌ providers.json 缺失或无法解析');
    return 1;
  }
  const providerTable = providerLoad.table;

  const staticEntries = curated.filter(entry => entry && entry.checkMethod === 'static');
  const skipped = curated.length - staticEntries.length;
  const byMethod = { static: staticEntries.length, headless: 0, manual: 0, unknown: 0 };
  for (const entry of curated) {
    if (!entry) continue;
    if (entry.checkMethod === 'headless') byMethod.headless++;
    else if (entry.checkMethod === 'manual') byMethod.manual++;
    else if (entry.checkMethod !== 'static') byMethod.unknown++;
  }

  const results = [];
  for (const entry of staticEntries) {
    const providerKey = (providers.resolveProvider(entry.provider, providerTable) || {}).key || null;
    const parser = providerKey ? PARSERS[providerKey] : null;
    const base = {
      provider: entry.provider,
      providerKey,
      planName: entry.planName,
      channel: entry.channel,
      sourceUrl: entry.sourceUrl
    };
    if (!parser) {
      results.push({ ...base, ok: false, fetched: null, problems: [`没有为 provider「${providerKey || entry.provider}」登记 static 解析器`], changes: [], modelCount: 0 });
      continue;
    }
    const page = await fetchText(entry.sourceUrl);
    const parsed = parser(entry, page);
    const comparison = parsed.ok ? compareEntry(entry, parsed) : { problems: parsed.problems, changes: [] };
    const ok = page.ok && parsed.ok && comparison.problems.length === 0;
    results.push({
      ...base,
      ok,
      fetched: { status: page.status, finalUrl: page.finalUrl, bytes: page.bytes, durationMs: page.durationMs, error: page.error },
      problems: page.ok ? comparison.problems : [page.error || '抓取失败'],
      changes: ok ? comparison.changes : [],
      modelCount: ok ? parsed.models.length : 0
    });
  }

  const failed = results.filter(item => !item.ok);
  const changed = results.filter(item => item.ok && item.changes.length > 0);
  const success = results.filter(item => item.ok);

  // 先在内存里把三份产物算完，任何一步不合法都不写盘（fail-closed）。
  const nextCurated = clone(curated);
  for (const result of results) {
    if (!result.ok) continue;
    const entry = nextCurated.find(item => item.provider === result.provider
      && item.planName === result.planName
      && item.channel === result.channel);
    if (!entry) continue;
    entry.lastVerifiedAt = TODAY;
    if (result.changes.length) {
      applyChanges(entry, result.changes, TODAY);
      refreshEvidence(entry, result.changes, TODAY);
    }
  }

  const built = buildNextPayload(nextCurated, providerTable);
  if (!built.ok) {
    console.error(`❌ 校验后的数据未通过 schema（${built.problems.length} 处），拒绝写盘：`);
    built.problems.slice(0, 20).forEach(problem => console.error(`   - ${problem}`));
    return 1;
  }

  let historyEvents = [];
  let nextHistory = null;
  if (changed.length) {
    const loadedHistory = apiHistory.load();
    if (loadedHistory.missing || loadedHistory.broken) {
      console.error('❌ api-plan-history.json 缺失或无法解析；cp 价格变化必须与历史同批更新');
      return 1;
    }
    const previousDoc = JSON.parse(fs.readFileSync(API_PLANS_FILE, 'utf8'));
    const labels = new Map();
    for (const plan of [...(previousDoc.plans || []), ...built.payload.plans]) {
      if (plan && plan.id && plan.planName) labels.set(plan.id, { title: `${plan.provider} · ${plan.planName}`, vendor: plan.provider });
    }
    const recorded = apiHistory.record(loadedHistory.store, {
      previous: previousDoc.plans || [],
      next: built.payload.plans,
      at: TODAY,
      runAt: NOW.toISOString(),
      labels
    });
    if (recorded.problems.length) {
      console.error(`❌ 历史日志拒绝推进（${recorded.problems.length} 处），拒绝写盘：`);
      recorded.problems.slice(0, 20).forEach(problem => console.error(`   - ${problem}`));
      return 1;
    }
    if (!recorded.appended.length) {
      console.error('❌ 检测到价格变化，但历史日志没有生成事件（拒绝留下自相矛盾的数据）');
      return 1;
    }
    historyEvents = recorded.appended;
    nextHistory = recorded.store;
  }

  const healthAttempts = results.map(result => ({
    source: `api_plan_${result.providerKey || normalizeName(result.provider)}_${result.channel || 'standard'}`,
    name: `${result.provider} · ${result.planName}`,
    region: (curated.find(item => item.provider === result.provider && item.planName === result.planName) || {}).region || 'global',
    kind: 'static',
    ok: result.ok,
    error: result.ok ? null : (result.problems[0] || '校验失败'),
    valid: result.modelCount,
    // 核验耗时是墙上时钟，写进健康表会破坏「同一天两次运行逐字节一致」；这里不记。
    ms: null,
    headlessReady: null
  }));
  const healthDoc = updateHealth(healthAttempts);

  if (!jsonOut) {
    console.log('=== API 套餐静态校验（verify-api-plans）===');
    console.log(`日期          : ${TODAY}${dryRun ? ' · dry-run（不写盘）' : ''}`);
    console.log(`static 条目   : ${staticEntries.length} / ${curated.length}` +
      `（headless ${byMethod.headless} · manual ${byMethod.manual}${byMethod.unknown ? ` · 未标 ${byMethod.unknown}` : ''} 不在本脚本范围）`);
    for (const result of results) {
      const fetched = result.fetched ? `HTTP ${result.fetched.status} · ${result.fetched.bytes}B` : '未抓取';
      if (result.ok) {
        const mark = result.changes.length ? '✎' : '✓';
        const detail = result.changes.length
          ? result.changes.map(change => `${change.modelKey}.${change.dim} ${change.from}→${change.to}`).join(' · ')
          : `${result.modelCount} 个模型，价格未变`;
        console.log(`  ${mark} ${result.provider} · ${result.planName} [${result.channel}] — ${detail}（${fetched}）`);
      } else {
        console.log(`  ✗ ${result.provider} · ${result.planName} [${result.channel}] — ${result.problems.join('；')}（${fetched}）`);
      }
    }
    console.log(`合计          : 成功 ${success.length} · 失败 ${failed.length} · 价格变化 ${changed.length}`);
    console.log(`历史事件      : ${changed.length ? `追加 ${historyEvents.length} 条（${historyEvents.map(event => `${event.type} ${event.field || ''}`).join(' / ')}）` : '0 条（价格未变必须 0 事件）'}`);
    const healthy = healthDoc.doc.sources.filter(row => healthAttempts.some(item => item.source === row.source) && row.status === 'healthy').length;
    console.log(`健康表        : ${healthAttempts.length} 条 static 来源（healthy ${healthy} · failed ${healthAttempts.length - healthy}）`);
    if (!dryRun) console.log('写盘          : curated_api_plans.json · api-plans.json' + (changed.length ? ' · api-plan-history.json' : '') + ' · api-plan-health.json');
    else console.log('(dry-run，未写盘)');
  }

  if (!dryRun) {
    fs.writeFileSync(CURATED_FILE, `${JSON.stringify(nextCurated, null, 2)}\n`);
    apiSchema.writeApiPlans(built.payload, API_PLANS_FILE);
    if (nextHistory) apiHistory.save(nextHistory);
    health.write(healthDoc.doc, HEALTH_FILE);
  }

  const summary = {
    ok: failed.length === 0,
    ...flagSummary(),
    total: curated.length,
    staticEntries: staticEntries.length,
    skipped,
    byMethod,
    success: success.length,
    failed: failed.length,
    priceChanged: changed.length,
    historyEvents: historyEvents.map(event => ({
      planId: event.planId, at: event.at, type: event.type, field: event.field || null
    })),
    results: results.map(result => ({
      provider: result.provider,
      planName: result.planName,
      channel: result.channel,
      ok: result.ok,
      httpStatus: result.fetched ? result.fetched.status : null,
      bytes: result.fetched ? result.fetched.bytes : 0,
      finalUrl: result.fetched ? result.fetched.finalUrl : null,
      models: result.modelCount,
      changes: result.changes.map(change => ({
        modelKey: change.modelKey, variant: change.variant, dim: change.dim, from: change.from, to: change.to
      })),
      problems: result.problems
    }))
  };
  if (jsonOut) console.log(JSON.stringify(summary, null, 2));

  if (failed.length && strict) {
    console.error(`❌ --strict：${failed.length} 条 static 校验失败`);
    return 1;
  }
  return 0;
}

main().then(code => process.exit(code)).catch(error => {
  console.error(`❌ verify-api-plans 运行失败：${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
