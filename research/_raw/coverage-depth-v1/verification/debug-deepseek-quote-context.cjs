#!/usr/bin/env node
/**
 * t9 调试：两条基线条目（deepseek-flash / deepseek-v4-pro）被判「不采信（引文不含日期）」，
 * 到底官方页面上那段文字**附近**有没有日期？—— 直接看现场页面上下文。只读。
 */

'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const axios = require(path.join(ROOT, 'node_modules', 'axios'));

function contexts(text, needle, radius = 220) {
  const out = [];
  let from = 0;
  while (out.length < 4) {
    const at = text.indexOf(needle, from);
    if (at < 0) break;
    out.push(text.slice(Math.max(0, at - radius), at + radius).replace(/\s+/g, ' '));
    from = at + needle.length;
  }
  return out;
}

async function main() {
  const url = 'https://api-docs.deepseek.com/updates';
  const res = await axios.get(url, {
    timeout: 25000,
    responseType: 'text',
    validateStatus: () => true,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' }
  });
  const body = String(res.data);
  console.log(`live ${url} → HTTP ${res.status}，${body.length} 字节，取回于 ${new Date().toISOString()}`);

  const plan = [
    ['deepseek-flash 引文片段', 'DeepSeek-V4.1-Flash Release'],
    ['deepseek-flash 模型名', 'V4.1-Flash'],
    ['deepseek-v4-pro 引文片段', 'DeepSeek-V4-Pro Update'],
    ['deepseek-v4-pro 模型名', 'DeepSeek-V4-Pro'],
    ['deepseek-v3.2（对照：这条引文含日期）', '2025-12-01']
  ];
  for (const [label, needle] of plan) {
    const hits = contexts(body, needle);
    console.log(`\n--- ${label}：页面上出现 ${hits.length} 处（最多显示 4） ---`);
    if (!hits.length) console.log('   （页面上找不到这个串）');
    for (const hit of hits) console.log('   …' + hit + '…');
  }

  const raw = path.join(ROOT, 'research', '_raw', 'coverage-depth-v1', 'release-evidence', 'raw', 'test-deepseek-updates.html');
  if (fs.existsSync(raw)) {
    const text = fs.readFileSync(raw, 'utf8');
    console.log(`\n=== 本地留存件 test-deepseek-updates.html（${text.length} 字节）===`);
    for (const [label, needle] of [['V4.1-Flash Release', 'V4.1-Flash Release'], ['V4-Pro Update', 'V4-Pro Update']]) {
      const hits = contexts(text, needle);
      console.log(`\n--- ${label}：${hits.length} 处 ---`);
      for (const hit of hits.slice(0, 3)) console.log('   …' + hit + '…');
    }
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
