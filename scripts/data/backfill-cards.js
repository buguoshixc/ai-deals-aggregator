#!/usr/bin/env node
/**
 * 一次性补齐策展数据的卡片字段（features / priceLine / verifiedAt）。
 *
 * 规则（与 PROJECT_STATUS 的「不猜测、不拼接」一致）：
 *   - features：只取该条 discountInfo / validity 里已写明的事实，最多 3 个、每个 ≤20 字
 *   - priceLine：只有官方页明确给出「免费档 → 付费档」时才填，否则留 null（不编造升级路径）
 *   - verifiedAt：本次逐条回访官方页的日期
 *
 * 用法：node scripts/data/backfill-cards.js [--check]
 */
const fs = require('fs');
const path = require('path');
const { todayCN } = require('../lib/schema');

const CHECK = process.argv.includes('--check');
const VERIFIED_AT = todayCN();

/** title → { features, priceLine } */
const PATCH = {
  '火山方舟 豆包全系模型 个人开发者 50 万 tokens 免费额度': { f: ['50 万 tokens', '豆包全系模型', '个人开发者'], p: null },
  '腾讯混元 新用户 100 万 tokens 免费资源包': { f: ['100 万 tokens', '有效期 1 年', '需实名认证'], p: null },
  '讯飞星火 Spark Lite 轻量级大模型免费使用': { f: ['Spark Lite 免费', '创建应用即可调用'], p: null },
  '讯飞开放平台 新手免费福利礼包': { f: ['百万级交互量', '八大 AI 服务', '乐享会员 2888 元'], p: null },
  'Kimi 开放平台 新用户 15 元代金券': { f: ['15 元代金券', '需实名认证'], p: null },
  '商汤日日新 Token Plan 首月限时免费': { f: ['首月免费', '每 5 小时 1500 次', '无门槛配额'], p: null },
  '硅基流动 免费模型专区': { f: ['多款模型标价 0', '文本 / 向量 / 图像 / 语音'], p: null },
  '阶跃星辰 StepAudio 3 语音大模型限时免费': { f: ['两个语音模型限时免费', '按 Token 计费其他'], p: null },
  '百川智能 海纳百川计划 免费使用 M3Plus API': { f: ['免费 M3Plus API', '需申请审核'], p: null },

  'Anthropic Claude 非营利组织折扣': { f: ['非营利折扣价', '最少 2 席'], p: null },
  'GitHub Copilot 学生免费（Copilot Student）': { f: ['全部付费功能免费', '需学籍验证'], p: null },
  'GitHub Copilot 教师与开源维护者免费 Pro': { f: ['免费 Copilot Pro', '教师 / 开源维护者', '每月重评估'], p: null },
  'GitHub Student Developer Pack 学生开发者工具包': { f: ['Copilot 免费', 'Azure / DataCamp 等'], p: null },
  'Google AI Pro 学生免费 12 个月（含 Gemini 高级版）': { f: ['免费 12 个月', '价值 $19.99/月', '高校学生'], p: null },
  'Microsoft Azure for Students 学生免费 100 美元额度': { f: ['$100 额度', '无需信用卡', '可每年续期'], p: null },
  '微软 Microsoft 365 教育版 学生 5 折（含 Copilot）': { f: ['5 折购买', '含 Copilot'], p: null },
  'AWS Activate 初创公司最高 20 万美元云 credits': { f: ['最高 $200,000', '可用于 Bedrock'], p: null },
  'Figma for Education 学生与教师免费': { f: ['Figma + FigJam 免费', '学生 / 教师'], p: null },
  'Notion 教育版 学生与教师免费 Plus': { f: ['免费 Plus 计划', '学校须在 WHED'], p: null },
  'Notion for Nonprofits 非营利组织 Business 折扣': { f: ['Business 折扣价', '需非营利核验'], p: null },
  'ElevenLabs 免费计划 每月 10000 credits': { f: ['每月 10,000 credits', 'TTS / 克隆 / Dubbing'], p: '免费档 $0 → 付费档' },
  'Runway 免费计划 一次性 125 credits': { f: ['一次性 125 credits', '含 5GB 素材存储'], p: '免费档 $0 → 付费档' },
  'Windsurf 学生折扣订阅 Pro（最长 12 个月）': { f: ['折扣月费订 Pro', '最长 12 个月'], p: '学生折扣月费 → Pro' }
};

const FILES = [
  path.join(__dirname, 'curated_cn.json'),
  path.join(__dirname, 'curated_global.json')
];

let patched = 0;
let missing = [];
let drift = [];

for (const file of FILES) {
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const entry of list) {
    const patch = PATCH[entry.title];
    if (!patch) {
      missing.push(path.basename(file) + ': ' + entry.title);
      continue;
    }

    if (CHECK) {
      // 只核对：策展文件里的卡片字段是否与映射一致（防止有人手改后漂移）
      const actualFeatures = JSON.stringify(entry.features || null);
      const actualPriceLine = JSON.stringify(entry.priceLine || null);
      const hasVerifiedAt = typeof entry.verifiedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.verifiedAt);
      if (actualFeatures !== JSON.stringify(patch.f) || actualPriceLine !== JSON.stringify(patch.p) || !hasVerifiedAt) {
        drift.push(`${path.basename(file)}: ${entry.title}
      features=${actualFeatures} (期望 ${JSON.stringify(patch.f)})
      priceLine=${actualPriceLine} (期望 ${JSON.stringify(patch.p)})
      verifiedAt=${entry.verifiedAt || '(缺失)'}`);
      }
    } else {
      entry.features = patch.f;
      entry.priceLine = patch.p;
      entry.verifiedAt = VERIFIED_AT;
    }
    patched++;
  }
  if (!CHECK) {
    fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8');
    console.log('已写入 ' + path.basename(file) + ' → ' + list.length + ' 条');
  }
}

if (CHECK) {
  console.log(`[check] 核对 ${patched} 条策展条目`);
  if (drift.length) {
    console.error(`\n以下条目与映射不一致（${drift.length} 条）：`);
    drift.forEach(d => console.error('  - ' + d));
    process.exit(1);
  }
  if (missing.length) {
    console.error(`\n以下条目未在映射中登记（${missing.length} 条）：`);
    missing.forEach(m => console.error('  - ' + m));
    process.exit(1);
  }
  console.log('✓ 全部与映射一致');
  process.exit(0);
}

console.log('\n补齐 ' + patched + ' 条，verifiedAt=' + VERIFIED_AT);
if (missing.length) {
  console.error('\n以下条目标题未在 PATCH 中登记，请补上：');
  missing.forEach(m => console.error('  - ' + m));
  process.exit(1);
}
console.log('所有策展条目均已登记 ✓');
