/**
 * 中文翻译覆盖层（zh overlay）。
 *
 * 背景：国外来源（Futuretools / Curated）的优惠文案是英文散文。本站访客以中文为主，
 * 详情弹层里需要在英文原文下方给出中文翻译。
 *
 * 设计约束：
 *  1. 翻译是**数据**，不是渲染期的机器翻译。站点不联网做翻译，翻错了也没人发现。
 *  2. 因此译文集中在本文件读的 `scripts/data/translations_zh.json` 里人工维护，
 *     构建期（build-local）与采集期（collect）都调用 attach()，把结果写进 deals.json
 *     的 `zh` 字段 —— 浏览器 `fetch('deals.json')` 拿到的就是同一份，
 *     于是构建期预渲染与浏览器渲染仍然只有一条代码路径。
 *  3. 绝不覆盖原文：`zh` 是**附加**字段，英文原文字段一个字节都不改。
 *
 * 键：deal.id（vendor|title|url 的 sha1 前 12 位）。id 变了翻译就失效，
 * 所以 attach() 会把「对不上任何条目」的键报为 orphaned，由构建日志喊出来。
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'translations_zh.json');

/** 允许翻译的字段：只包含详情弹层里以「散文」形式出现的那些 */
const ZH_FIELDS = ['discountInfo', 'description', 'eligibility', 'validity', 'priceLine'];

/** 中文比原文短是常态，但仍给上限防止误粘贴整页 */
const ZH_MAX = {
  discountInfo: 300,
  description: 300,
  eligibility: 160,
  validity: 80,
  priceLine: 80
};

const ZH_FIELD_LABELS = {
  discountInfo: '优惠说明',
  description: '简介',
  eligibility: '适用条件',
  validity: '有效期说明',
  priceLine: '价格阶梯'
};

/* ------------------------------------------------------------------ */
/* 判定：这条字段到底是不是英文散文                                     */
/* ------------------------------------------------------------------ */

function cjkCount(text) {
  return (String(text || '').match(/[\u4e00-\u9fa5]/g) || []).length;
}

function latinCount(text) {
  return (String(text || '').match(/[A-Za-z]/g) || []).length;
}

/**
 * 英文散文判定。踩过的坑：
 *
 * 「CJK 占比 < 25% 就算英文」会把 `官方定价页标注多款模型价格为「免费」：文本
 * Hunyuan-MT-7B、bge-m3……` 这种**本来就是中文**的条目误判为英文——中文技术文案里
 * 模型名、URL、参数名占了大半字符数。所以这里改看两件事：
 *   a) 一个汉字都没有 + 有足量拉丁字母 → 英文；
 *   b) 有零星汉字、但出现英文虚词（the/and/for/with…）→ 英文。
 * 反过来，「Anthropic Claude Pro 年付 8 折」只有 3 个汉字却没有虚词 → 判为中文，不翻。
 */
const EN_FUNCTION_WORDS = /\b(the|and|for|with|your|you|from|are|is|was|that|this|its|their|or|of|to|in|on|by|as|at|not|can|will|any|all|more|per|via)\b/i;

function isEnglishProse(text) {
  const value = String(text === null || text === undefined ? '' : text).trim();
  if (!value) return false;
  const cjk = cjkCount(value);
  const latin = latinCount(value);
  if (latin <= 8) return false;
  if (cjk === 0) return true;
  if (cjk >= 8) return false;
  return EN_FUNCTION_WORDS.test(value);
}

/** 该条目哪些字段需要中文翻译（英文散文且尚无译文） */
function needsZh(deal, { hasZh = false } = {}) {
  const out = [];
  if (hasZh) return out;
  for (const field of ZH_FIELDS) {
    if (isEnglishProse(deal[field])) out.push(field);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 形状校验（schema.js 复用）                                          */
/* ------------------------------------------------------------------ */

/**
 * 归一 + 校验一条 `zh`。
 *
 * 覆盖层条目形如：
 *   { "_title": "备注", "src": { "description": "英文原文快照" }, "description": "中文译文" }
 *
 * `src` 是**原文指纹**：译文是照着某一段英文写的，英文一旦被采集器改写，译文就不再
 * 对得上。此时宁可不出译文，也不出一个和原文矛盾的译文——所以指纹不符时直接丢弃该字段
 * 并在报告里记为 stale，由构建日志催人复核。
 *
 * @returns {{zh: object|null, errors: string[], stale: string[], warnings: string[]}}
 */
function normalizeZh(raw, deal = {}) {
  const errors = [];
  const stale = [];
  const warnings = [];
  if (raw === null || raw === undefined) return { zh: null, errors, stale, warnings };

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { zh: null, errors: ['zh 必须是对象'], stale, warnings };
  }

  const src = raw.src && typeof raw.src === 'object' && !Array.isArray(raw.src) ? raw.src : null;
  if (raw.src !== undefined && !src) {
    errors.push('zh.src 必须是对象（形如 {description:"英文原文"}）');
  }

  // 先修剪：空字符串等于「没译」，直接丢掉而不是报错
  const cleaned = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'src' || key === '_title') continue;
    if (!ZH_FIELDS.includes(key)) {
      errors.push(`zh.${key} 不是可翻译字段（只允许 ${ZH_FIELDS.join('/')}）`);
      continue;
    }
    if (typeof value !== 'string') {
      errors.push(`zh.${key} 必须是字符串`);
      continue;
    }
    const text = value.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    cleaned[key] = text;
  }

  if (!Object.keys(cleaned).length) {
    return { zh: null, errors, stale, warnings };
  }

  for (const [key, text] of Object.entries(cleaned)) {
    if (text.length > ZH_MAX[key]) {
      errors.push(`zh.${key} 超过 ${ZH_MAX[key]} 字（${text.length}）`);
    }
    if (cjkCount(text) === 0) {
      errors.push(`zh.${key} 一个汉字都没有——译文不能还是英文`);
    }
    const source = deal[key];
    if (typeof source !== 'string' || !source.trim()) {
      errors.push(`zh.${key} 有译文但原文 ${key} 为空`);
      continue;
    }
    // 原文指纹比对
    const snapshot = src ? src[key] : null;
    if (snapshot === undefined || snapshot === null) {
      warnings.push(`zh.${key} 没有记录原文指纹（src.${key}），原文被改写时发现不了`);
    } else if (String(snapshot) !== source) {
      stale.push(`zh.${key} 原文已变，译文停用待复核`);
      delete cleaned[key];
    }
  }

  return { zh: Object.keys(cleaned).length ? cleaned : null, errors, stale, warnings };
}

/* ------------------------------------------------------------------ */
/* 覆盖层读写                                                          */
/* ------------------------------------------------------------------ */

function load(file = DEFAULT_FILE) {
  if (!fs.existsSync(file)) {
    return { byId: {}, note: '', file, missing: true };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`translations_zh.json 解析失败: ${error.message}`);
  }
  const byId = parsed && typeof parsed.byId === 'object' && parsed.byId ? parsed.byId : {};
  return { byId, note: parsed._note || '', file, missing: false };
}

/**
 * 把覆盖层贴到条目上。
 *
 * 只做两件事：命中的写 `deal.zh`，对不上的报出来。**不修改任何原文字段。**
 *
 * @param {object[]} deals
 * @param {object}   overlay load() 的返回值
 * @returns {{deals:object[], report:object}}
 */
function attach(deals, overlay = load()) {
  const { byId } = overlay;
  const used = new Set();
  const skipped = [];
  const stale = [];
  const warnings = [];
  const unmanaged = [];
  let attached = 0;
  let fields = 0;
  let dropped = 0;

  const out = deals.map(deal => {
    const raw = byId[deal.id];
    if (!raw) {
      // 覆盖层没管这一条。deals.json 里若已带 zh（collect 写盘时贴过一次），原样放过。
      if (deal.zh && Object.keys(deal.zh).length) unmanaged.push({ id: deal.id, title: deal.title });
      return deal;
    }
    used.add(deal.id);
    const result = normalizeZh(raw, deal);
    result.errors.forEach(message => skipped.push({ id: deal.id, title: deal.title, message }));
    result.stale.forEach(message => stale.push({ id: deal.id, title: deal.title, message }));
    result.warnings.forEach(message => warnings.push({ id: deal.id, title: deal.title, message }));
    dropped += result.stale.length;

    // 覆盖层对它覆盖到的 id 是**唯一权威**：命中就必须以它为结果，包括「结果为无」。
    // 早期版本在 result.zh 为空时直接 return deal，结果 deals.json 里已经贴好的旧译文
    // 会被原样留下——「原文变了就停用译文」的保证当场失效（zh-gate 演练抓到的）。
    const next = { ...deal };
    if (!result.zh) {
      delete next.zh;
      return next;
    }
    attached++;
    fields += Object.keys(result.zh).length;
    next.zh = result.zh;
    return next;
  });

  const orphaned = Object.keys(byId)
    .filter(id => !used.has(id))
    .map(id => ({ id, title: (byId[id] && byId[id]._title) || '(无标题备注)' }));

  // 覆盖度：需要翻译但没译文的条目
  const missing = [];
  for (const deal of out) {
    const need = needsZh(deal, { hasZh: Boolean(deal.zh) });
    if (need.length) missing.push({ id: deal.id, title: deal.title, fields: need });
  }

  return {
    deals: out,
    report: {
      attached,
      fields,
      withZh: out.filter(deal => deal.zh && Object.keys(deal.zh).length).length,
      dropped,
      skipped,
      stale,
      warnings,
      orphaned,
      unmanaged,
      missing,
      total: out.length
    }
  };
}

/** 供报告用的一行摘要 */
function summarize(report) {
  const parts = [`${report.attached}/${report.total} 条带中文译文（${report.fields} 个字段）`];
  if (report.missing.length) parts.push(`${report.missing.length} 条待翻译`);
  if (report.dropped) parts.push(`${report.dropped} 处因原文已变停用`);
  if (report.orphaned.length) parts.push(`${report.orphaned.length} 条译文对不上 id`);
  if (report.skipped.length) parts.push(`${report.skipped.length} 处译文不合法`);
  return parts.join(' · ');
}

module.exports = {
  DEFAULT_FILE,
  ZH_FIELDS,
  ZH_MAX,
  ZH_FIELD_LABELS,
  cjkCount,
  latinCount,
  isEnglishProse,
  needsZh,
  normalizeZh,
  load,
  attach,
  summarize
};
