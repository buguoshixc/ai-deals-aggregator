/**
 * 能力 3（Phase C）：采集器 DOM drift 诊断。
 *
 * ## 它替代的是哪一段人工
 *
 * 今天「某来源今天 0 条」之后的动作是：重新抓页 → 肉眼读 HTML → 猜哪一层变了 →
 * 改选择器 → 再跑一轮。系统只提供一行错误和两个条数。
 *
 * 这个模块把那段人工压缩成：**看一份两代结构摘要的对比 + 一串按可能性排序的原因**。
 * 它不给出结论，只把"看哪里"缩小到几个位置 —— 这正是维护者最花时间的一步。
 *
 * ## 输入里为什么有采集器源码
 *
 * 那是**我们自己的代码**，不含第三方内容，送出去没有版权问题；
 * 而"选择器写的是什么"是判断"页面变了还是代码写错了"的必要信息。
 * 页面正文**不进**这里：摘要是数字，故意不带正文（见 lib/dom-digest.js 的说明）。
 *
 * ## 输出为什么只能是候选
 *
 * 改采集器 = 改生产数据的来源。所以本模块**只写 `.ai-cache/candidates/`**，
 * 采集器文件一个字节都不动；要动手就得人来看、人来改、走门禁（Phase D 再给 diff 候选）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const schemas = require('./schemas');
const cache = require('./cache');
const domDigest = require('../lib/dom-digest');
const health = require('../lib/health');
const registry = require('../collectors');

const TASK = 'diagnose_source';
const PROMPT_VERSION = schemas.PROMPT_VERSIONS[TASK];
const COLLECTORS_DIR = path.join(__dirname, '..', 'collectors');
const MAX_SOURCE_CHARS = 6000;

const SYSTEM = [
  '你在诊断一个网页采集器为什么产出骤降或归零。你会拿到：',
  '  · 上一轮与本轮的**页面结构摘要**（计数、标记、探针命中次数，没有页面正文）；',
  '  · 采集器依赖的选择器/正则声明；',
  '  · 采集器源码；',
  '  · 本轮的健康状态与错误信息。',
  '',
  `可能的原因只有这些：${schemas.DIAGNOSE_CAUSES.join(' / ')}`,
  '',
  '铁律：',
  '1. evidence 必须引用摘要里的**具体数字或标记**（例如 "td: 42 → 0"、"markers.login=true"），' +
    '不许写"可能是页面改版了"这种没有依据的话。',
  '2. 拿不准就选 unknown —— 一个错误的诊断会让人去改本来没坏的地方。',
  '3. 你**不能**修改采集器，也不需要给出完整代码。suggestedProbes 只给探针层面的建议。',
  '4. 只输出一个 JSON 对象。'
].join('\n');

/** 找到某个来源的采集器源码（我们自己的代码） */
function collectorSourceFor(sourceId) {
  let files = [];
  try {
    files = fs.readdirSync(COLLECTORS_DIR).filter(name => name.endsWith('.js') && name !== 'index.js');
  } catch (error) {
    return { file: null, source: null };
  }
  for (const name of files) {
    const file = path.join(COLLECTORS_DIR, name);
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      continue;
    }
    if (new RegExp(`id:\\s*'${sourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(text)) {
      return { file: path.relative(path.join(__dirname, '..', '..'), file), source: text.slice(0, MAX_SOURCE_CHARS) };
    }
  }
  return { file: null, source: null };
}

/** 哪些来源值得诊断（纯确定性判定，不用问模型） */
function needsDiagnosis(row) {
  if (!row) return null;
  if (row.status === 'failed') return `状态 failed（${row.reason || '未知原因'}）`;
  if (row.status === 'degraded') return `状态 degraded（${row.reason || '未知原因'}）`;
  if (row.lastRunMissing) return '本轮运行里没有这个来源的结果（可能被跳过或整体失败）';
  if (Number.isFinite(row.delta) && row.delta < 0) return `条数下降 ${row.delta}`;
  return null;
}

function summarizeDigest(d) {
  if (!d) return '（无摘要）';
  const lines = [
    `  url=${d.url || '?'} httpStatus=${d.httpStatus === null || d.httpStatus === undefined ? '?' : d.httpStatus} bytes=${d.bytes}`,
    `  标记：${Object.entries(d.markers || {}).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `  计数：${Object.entries(d.counts || {}).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `  形态：${Object.entries(d.shape || {}).map(([k, v]) => `${k}=${v}`).join(' ')}`,
    `  正文长度：${d.textLength}`,
    `  探针命中（selector）：${Object.entries(d.selectorHits || {}).map(([k, v]) => `${k}=${v}`).join(' ') || '（无）'}`,
    `  探针命中（regex）：${Object.entries(d.regexHits || {}).map(([k, v]) => `${k}=${v}`).join(' ') || '（无）'}`,
    `  关键词命中：${Object.entries(d.keywordHits || {}).map(([k, v]) => `${k}=${v}`).join(' ') || '（无）'}`
  ];
  return lines.join('\n');
}

function buildContent({ row, probes, collector, snapshotRow, diff, trigger }) {
  const current = snapshotRow && snapshotRow.current ? snapshotRow.current.items : [];
  const previous = snapshotRow && snapshotRow.previous ? snapshotRow.previous.items : [];
  const parts = [
    `【来源】${row.source}（${row.name || row.source}，${row.region || '?'}，类型 ${row.kind || '?'}）`,
    `【触发诊断的原因】${trigger}`,
    '',
    '【健康状态（跨运行）】',
    `  status=${row.status} reason=${row.reason || 'null'}`,
    `  lastItemCount=${row.lastItemCount} previousItemCount=${row.previousItemCount} delta=${row.delta}`,
    `  consecutiveFailures=${row.consecutiveFailures} consecutiveZero=${row.consecutiveZero}`,
    `  lastError=${row.lastError ? String(row.lastError).slice(0, 200) : '（无）'}`,
    '',
    '【上一轮页面结构摘要】',
    previous.length ? previous.map(summarizeDigest).join('\n') : '（没有上一轮摘要）',
    '',
    '【本轮页面结构摘要】',
    current.length ? current.map(summarizeDigest).join('\n') : '（本轮没有抓到页面——可能是采集器在抓取前就失败了）',
    '',
    '【两代结构差异（确定性计算）】',
    diff ? JSON.stringify(diff).slice(0, 2000) : '（无法比较）',
    '',
    '【采集器声明的探针】',
    `  关键词：${(probes.keywords || []).join(' / ') || '（无）'}`,
    `  选择器：${(probes.selectors || []).join(' / ') || '（无）'}`,
    `  正则：${(probes.regexes || []).map(r => r.name).join(' / ') || '（无）'}`,
    '',
    '【采集器源码】（我们自己的代码）',
    '```js',
    collector.source || '（未找到该来源的采集器源码）',
    '```',
    '',
    '【输出格式】',
    '{"causes":["…"],"confidence":0.0-1.0,"evidence":["…"],' +
      '"suggestedProbes":[{"kind":"selector|regex|keyword","op":"add|replace|remove","value":"…","why":"…"}],"patchHint":"可选"}'
  ];
  return parts.join('\n');
}

function collectorIds() {
  try {
    return registry.all().map(c => c.id);
  } catch (error) {
    return [];
  }
}

async function units({ options = {} } = {}) {
  const healthDoc = health.load();
  const snapshot = domDigest.loadSnapshots();
  const only = options.only ? new Set([].concat(options.only)) : null;
  const ids = collectorIds();
  const maxChars = options.maxInputChars || schemas.TASK_LIMITS[TASK];
  const out = [];

  const rows = (healthDoc.doc && healthDoc.doc.sources) || [];
  const candidates = [];

  for (const row of rows) {
    if (only && !only.has(row.source)) continue;
    const trigger = needsDiagnosis(row);
    if (!trigger) continue;
    candidates.push({ row, trigger });
  }

  // 没进过健康表但已被登记、且被 --only 点名的来源，也允许诊断（首次接入时有用）
  if (only) {
    for (const id of ids) {
      if (!only.has(id)) continue;
      if (candidates.some(c => c.row.source === id)) continue;
      candidates.push({ row: { source: id, name: id, status: 'unknown', reason: null, lastItemCount: 0, delta: 0 }, trigger: '被显式点名诊断' });
    }
  }

  for (const { row, trigger } of candidates) {
    const probes = domDigest.probesFor(row.source);
    const collector = collectorSourceFor(row.source);
    const snapshotRow = snapshot.byId[row.source] || null;
    const current = snapshotRow && snapshotRow.current ? snapshotRow.current.items[0] || null : null;
    const previous = snapshotRow && snapshotRow.previous ? snapshotRow.previous.items[0] || null : null;
    const diff = previous && current ? domDigest.diffDigests(previous, current) : null;
    out.push({
      key: row.source,
      dealId: null,
      field: null,
      sourceId: row.source,
      sourceUrl: (snapshotRow && snapshotRow.current && snapshotRow.current.items[0] && snapshotRow.current.items[0].url) || probes.url || null,
      meta: { trigger, status: row.status, reason: row.reason, delta: row.delta },
      content: buildContent({ row, probes, collector, snapshotRow, diff, trigger }).slice(0, maxChars)
    });
  }

  return out;
}

function interpret(result) {
  return {
    candidate: {
      causes: result.causes,
      confidence: result.confidence,
      evidence: result.evidence,
      suggestedProbes: result.suggestedProbes || [],
      patchHint: result.patchHint || null
    },
    evidence: result.evidence || [],
    confidence: { causes: result.confidence }
  };
}

module.exports = {
  TASK,
  PROMPT_VERSION,
  SYSTEM,
  units,
  interpret,
  needsDiagnosis,
  collectorSourceFor,
  buildContent,
  summarizeDigest,
  MAX_SOURCE_CHARS
};
