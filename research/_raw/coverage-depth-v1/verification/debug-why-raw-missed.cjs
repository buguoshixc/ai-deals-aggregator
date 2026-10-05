#!/usr/bin/env node
/**
 * t9 一次性诊断：为什么 `findQuoteInCorpus` 对这三条判了"raw 未命中"？
 * 复刻 release-audit.cjs 的两个函数，逐步打印中间量。只读。
 */

'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const RAW_DIR = path.join(ROOT, 'research', '_raw', 'coverage-depth-v1', 'release-evidence', 'raw');

function textForms(html) {
  const unescaped = String(html)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\');
  const withoutTags = unescaped
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  const collapsed = withoutTags.replace(/\s+/g, ' ').trim().toLowerCase();
  return { collapsed, squashed: collapsed.replace(/\s+/g, '') };
}
const squash = text => String(text).replace(/\s+/g, '').toLowerCase();
function normalizeQuote(quote) {
  return String(quote)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/');
}
function tokensOf(quote) {
  const text = normalizeQuote(quote);
  const tokens = new Set();
  for (const run of text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]{3,}/g) || []) tokens.add(run);
  for (const word of text.match(/[A-Za-z][A-Za-z0-9._\-/]{4,}/g) || []) tokens.add(word.toLowerCase());
  for (const num of text.match(/\d{4,}/g) || []) tokens.add(num);
  return [...tokens];
}

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/models.json'), 'utf8'));
const slug = process.argv[2];
const quoteFull = registry[slug].releaseEvidence[0].quote;
const trunc = quoteFull.slice(0, 120);
console.log('slug=', slug);
console.log('完整引文长度=', quoteFull.length, '；截断后长度=', trunc.length);
console.log('截断引文=', JSON.stringify(trunc));
console.log('token=', JSON.stringify(tokensOf(trunc)));

for (const name of ['oai-gpt6-astra.html', 'oai-gpt61-sol2.html', 'kimi-res-k27code.html']) {
  const full = path.join(RAW_DIR, name);
  if (!fs.existsSync(full)) { console.log(`${name}: 不存在`); continue; }
  const forms = textForms(fs.readFileSync(full, 'utf8'));
  const tokens = tokensOf(trunc);
  const missing = tokens.filter(t => !forms.squashed.includes(squash(t)));
  console.log(`${name}: ratio=${((tokens.length - missing.length) / tokens.length * 100).toFixed(0)}% missing=${JSON.stringify(missing)}`);
  // 整段匹配
  console.log(`   整段命中=${forms.squashed.includes(squash(normalizeQuote(trunc)))}`);
}
