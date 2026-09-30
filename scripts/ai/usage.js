/**
 * 成本与用量记账。
 *
 * 每次 `generateStructured()` 都会追加一行到 `.ai-cache/usage.jsonl`，
 * 字段固定：provider / model / inputTokens / outputTokens / estimatedCostUsd / costKnown /
 *          task / promptVersion / inputHash / cacheKey / cached / ok / invalidReason / generatedAt。
 *
 * **失败的调用也记账**：一次超时或一次非法 JSON 也是真实发生的请求，不记下来就
 * 会得到「只看成功调用的成本报表」，那是最容易骗自己的那种报表。
 *
 * token 数来自 API 的 usage 字段（真实数字）；金额来自价目表（可能是未知）。
 * 两者分开报，金额未知时显示「未知」而不是 0，因为 0 看起来像"免费"。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const cache = require('./cache');

function usageFile() {
  return path.join(cache.cacheDir(), 'usage.jsonl');
}

function record(entry) {
  const file = usageFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, 'utf8');
  return file;
}

function readAll(file = usageFile()) {
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line));
    } catch (error) {
      out.push({ _broken: line.slice(0, 120) });
    }
  }
  return out;
}

function emptyBucket() {
  return {
    calls: 0, ok: 0, invalid: 0, cached: 0,
    inputTokens: 0, outputTokens: 0,
    estimatedCostUsd: 0, costKnownCalls: 0, costUnknownCalls: 0, unverifiedCostCalls: 0
  };
}

function add(bucket, entry) {
  bucket.calls++;
  if (entry.cached) bucket.cached++;
  if (entry.ok) bucket.ok++;
  else bucket.invalid++;
  bucket.inputTokens += Number(entry.inputTokens) || 0;
  bucket.outputTokens += Number(entry.outputTokens) || 0;
  if (entry.costKnown) {
    bucket.costKnownCalls++;
    bucket.estimatedCostUsd += Number(entry.estimatedCostUsd) || 0;
  } else {
    bucket.costUnknownCalls++;
  }
  if (entry.unverifiedCost) bucket.unverifiedCostCalls++;
}

function summarize(entries) {
  const total = emptyBucket();
  const byTask = {};
  const byModel = {};
  for (const entry of entries) {
    if (entry._broken) continue;
    add(total, entry);
    const task = entry.task || '(未知任务)';
    const model = `${entry.provider || '?'}/${entry.model || '?'}`;
    byTask[task] = byTask[task] || emptyBucket();
    byModel[model] = byModel[model] || emptyBucket();
    add(byTask[task], entry);
    add(byModel[model], entry);
  }
  total.estimatedCostUsd = round(total.estimatedCostUsd);
  for (const key of Object.keys(byTask)) byTask[key].estimatedCostUsd = round(byTask[key].estimatedCostUsd);
  for (const key of Object.keys(byModel)) byModel[key].estimatedCostUsd = round(byModel[key].estimatedCostUsd);
  return { total, byTask, byModel, broken: entries.filter(e => e._broken).length };
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

function money(bucket) {
  if (bucket.calls === 0) return '-';
  if (bucket.costKnownCalls === 0) return '未知';
  const value = `$${bucket.estimatedCostUsd.toFixed(4)}`;
  return bucket.costUnknownCalls ? `${value}（另有 ${bucket.costUnknownCalls} 次未知）` : value;
}

function format(summary) {
  const lines = [];
  lines.push('AI 用量与成本（token 数来自 API usage，金额来自价目表）');
  const head = ['任务', '调用', '命中缓存', '失败', '输入 tokens', '输出 tokens', '估算成本'];
  const rows = [head];
  const tasks = Object.keys(summary.byTask);
  if (!tasks.length) rows.push(['(无记录)', '0', '0', '0', '0', '0', '-']);
  for (const task of tasks) {
    const b = summary.byTask[task];
    rows.push([task, b.calls, b.cached, b.invalid, b.inputTokens, b.outputTokens, money(b)]);
  }
  const t = summary.total;
  rows.push(['合计', t.calls, t.cached, t.invalid, t.inputTokens, t.outputTokens, money(t)]);
  const widths = head.map((_, i) => Math.max(...rows.map(r => String(r[i]).length)));
  for (const row of rows) {
    lines.push(row.map((cell, i) => String(cell).padEnd(widths[i])).join('  '));
  }
  if (t.costUnknownCalls) {
    lines.push(`· ${t.costUnknownCalls} 次调用的成本未知（价目表里没有该模型，或条目未复核）`);
  }
  if (t.unverifiedCostCalls) {
    lines.push(`· ${t.unverifiedCostCalls} 次用了**未复核**的价目（AI_ALLOW_UNVERIFIED_PRICING=1）`);
  }
  if (summary.broken) lines.push(`· 账本里有 ${summary.broken} 行解析失败（已跳过）`);
  return lines.join('\n');
}

module.exports = { usageFile, record, readAll, summarize, format, emptyBucket, round };
