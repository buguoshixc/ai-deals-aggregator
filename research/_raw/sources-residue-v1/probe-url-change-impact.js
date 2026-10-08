#!/usr/bin/env node
/**
 * 量「只改 anthropic 的 officialUrl」这一处的**影响面**（t8 / sources-residue-v1）。
 *
 * ⚠️ 这个探针会**临时修改** `scripts/data/curated_api_plans.json`（生产数据）。
 *    它只做一件事：把 anthropic 记录的 `officialUrl` 换成给定 URL，然后交给
 *    `npm run api-plans:rebuild -- --dry-run` 去报「会改什么、会不会追加变化事件」。
 *    正确用法是**三步**，第 3 步不做就会留下脏工作区：
 *
 *      node research/_raw/sources-residue-v1/probe-url-change-impact.js        # 1. patch
 *      node scripts/tools/rebuild-api-plans.js --dry-run                       # 2. 读影响面（不写盘）
 *      git checkout -- scripts/data/curated_api_plans.json                     # 3. 还原
 *
 *    实测读数（2026-10-08，本仓库）：
 *      · URL 写 `https://claude.com/pricing#api` → **重建拒绝**：
 *        「officialUrl 不是规范形态（去掉追踪参数后是「https://claude.com/pricing」）—— 请直接写规范 URL」；
 *      · URL 写 `https://claude.com/pricing` → 数据集级校验通过，**1 处差异（officialUrl）**
 *        + **变化日志追加 1 条事件**（`updated officialUrl`）。
 *    结论：换这一处 URL 会让 /changes/ 与订阅源多出一条「官方定价页 updated」——
 *    那是一条**不是价格变化**的公开事件，所以本轮不落地，只把读数交 captain 裁定。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const TARGET = path.join(ROOT, 'scripts', 'data', 'curated_api_plans.json');
const FROM = '"officialUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing"';
const TO = `"officialUrl": "${process.argv[2] || 'https://claude.com/pricing'}"`;

const before = fs.readFileSync(TARGET, 'utf8');
const after = before.replace(FROM, TO);
if (after === before) {
  console.error('替换失败：目标串没出现（数据已经被改过，或 URL 已经不是旧值）。先 `git checkout -- scripts/data/curated_api_plans.json`。');
  process.exit(2);
}
fs.writeFileSync(TARGET, after);
console.log(`已 patch：${FROM.slice(13)} → ${TO.slice(13)}（1 处）`);
console.log('下一步：node scripts/tools/rebuild-api-plans.js --dry-run；读完记得 git checkout -- scripts/data/curated_api_plans.json');
