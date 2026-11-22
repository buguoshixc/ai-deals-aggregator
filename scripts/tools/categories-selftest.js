#!/usr/bin/env node
'use strict';
/**
 * 分类映射纯函数自测（L1：零外部依赖、不需要 dist/ 或仓库数据）。
 *
 * 重点守住「英文短词必须带词边界」这条防线：
 *   · invoices 不能误命 voice → 音频语音
 *   · no-code / low-code 不能误命 code → 编程开发
 *   · article / start / smart 不能误命 art → 图像绘画
 *   · provide / guide / side 不能误命 ide → 编程开发
 *   · build / suite / quick 不能误命 ui → 设计创意
 */

const { CATEGORIES, DEFAULT_CATEGORY, mapCategory } = require('../lib/categories');

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

console.log('=== 分类映射自测（categories-selftest）===');

// 1) 正向分类样本
const positiveCases = [
  ['LLM 对话模型', { title: 'DeepSeek LLM Chat', description: 'Open language model' }, '对话模型'],
  ['图像绘画', { title: 'Midjourney', description: 'AI image generation' }, '图像绘画'],
  ['视频', { title: 'Runway Video', description: 'AI video editing' }, '视频'],
  ['音频语音', { title: 'ElevenLabs', description: 'AI voice synthesis and TTS' }, '音频语音'],
  ['编程开发', { title: 'Cursor', description: 'AI coding IDE for developers' }, '编程开发'],
  ['API服务', { title: 'OpenRouter', description: 'Unified LLM API endpoint' }, 'API服务'],
  ['智能体', { title: 'AutoAgent', description: 'Autonomous agentic framework' }, '智能体'],
  ['搜索研究', { title: 'Perplexity', description: 'Academic search and citation tool' }, '搜索研究'],
  ['设计创意', { title: 'Figma', description: 'Collaborative UI and UX design tool' }, '设计创意'],
  ['教育学习', { title: 'Campus Tutor', description: 'Education discount for students' }, '教育学习'],
  ['已规范中文枚举直通', { category: '办公效率', title: 'Foo' }, '办公效率']
];

for (const [label, input, expected] of positiveCases) {
  const actual = mapCategory(input);
  check(`正向：${label} → ${expected}`, actual === expected, `实得 ${actual}`);
}

// 2) 词边界陷阱（真实线上踩过的误归类案例）
const boundaryCases = [
  [
    'Plutio（含 invoices，不得误判音频语音）',
    { title: 'Plutio', description: 'Manage projects, proposals, contracts, invoices, and a client portal in one CRM' },
    '办公效率'
  ],
  [
    'ZeroWork（含 no-code，不得误判编程开发）',
    { title: 'ZeroWork', description: 'Scrape data, generate leads, and run social media tasks with no-code automation' },
    '办公效率'
  ],
  [
    '含 article / smart / start（不得误判图像绘画）',
    { title: 'SmartWriter', description: 'Start writing smart articles faster for your team' },
    DEFAULT_CATEGORY
  ],
  [
    '含 provide / guide / wide（不得误判编程开发）',
    { title: 'WideGuide', description: 'Provide a wide guide for customer onboarding' },
    DEFAULT_CATEGORY
  ],
  [
    '含 build / suite / quick（不得误判设计创意）',
    { title: 'QuickSuite', description: 'Build a quick suite for sales outreach' },
    DEFAULT_CATEGORY
  ],
  [
    '含 rapid / capital（不得误判 API服务）',
    { title: 'RapidCap', description: 'Rapid capital planning for small teams' },
    DEFAULT_CATEGORY
  ]
];

for (const [label, input, expected] of boundaryCases) {
  const actual = mapCategory(input);
  check(`边界：${label} → ${expected}`, actual === expected, `实得 ${actual}`);
}

// 3) 输出恒属于固定枚举
check('返回值始终落在 CATEGORIES 内', CATEGORIES.includes(mapCategory({ title: 'Unknown XYZ 123' })));

console.log(`\n合计通过 ${passed} 项，失败 ${failures.length} 项`);
if (failures.length) process.exit(1);
