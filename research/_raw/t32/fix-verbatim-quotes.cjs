#!/usr/bin/env node
/**
 * t32：关闭 t15 独立审查的 F1/F2 —— 把「自称逐字却是改写」的 evidence.quote 换成**真正逐字**的官方片段。
 *
 * ## 判据（t15 的现场快照 + 官方页原文）
 *
 * F1（cerebras 61aa6c3ed3ff）：快照 `research/_raw/t15-url-verify/cerebras-pricing.txt` 里官方表格行
 *   逐字为 `["[OPENAI]GPT OSS 120B","~3000 tokens/s","$$0.35/M tokens","$$0.75/M tokens"]`
 *   （`$$` 是 Sanity 富文本里 `$` 的转义；渲染后即 `$0.35/M tokens`）。原 quote 是**改写件**却在
 *   末句自称「逐字」⇒ 换成该单元格原文，并去掉「逐字」这个自称（是真是假由字符串本身证明，
 *   不靠在引文里自称）。
 *
 * F2（aws Free Tier / Pro、replit Core / Pro）：官方页里价格与权益**不在同一段连续文本里**
 *   （中间隔着标签与版面），所以「价格 + 一长串权益」这种拼接句一定不是逐字。
 *   ⇒ quote 换成官方页上**确实连续**的原文（逐条列出），权益清单移出引文。
 *
 * 数值一律不动（t15 已独立证实金额/单位/币种无误）。
 *
 * 用法：node research/_raw/t32/fix-verbatim-quotes.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const API_FILE = path.join(ROOT, 'scripts', 'data', 'curated_api_plans.json');
const PLAN_FILE = path.join(ROOT, 'scripts', 'data', 'curated_plans.json');

/** 要替换的 (记录定位, 旧引文, 新引文, 理由) */
const API_FIXES = [
  {
    provider: 'cerebras', planName: '推理按量计费 Developer 档',
    oldQuote: '$X.XX/M tokens（每百万 token）—— GPT OSS 120B $0.35 / $0.75；Qwen 3.8 27B $0.99 / $1.49（Developer 档逐字）',
    newQuote: '[OPENAI]GPT OSS 120B | ~3000 tokens/s | $0.35/M tokens | $0.75/M tokens',
    why: '改为官方定价页表格行**逐字**的四个单元格（原始 JSON 写作 $$0.35/M tokens，$$ 是 Sanity 富文本对 $ 的转义，渲染即 $0.35/M tokens）；并删掉「Developer 档逐字」这种自称 —— 逐字性应由字符串本身成立，不靠引文自称。'
  },
  {
    provider: 'groq', planName: '模型推理按量计费',
    oldQuote: 'PRICE PER 1M TOKENS — GPT OSS 120B $0.15 / $0.60；GPT OSS 20B $0.075 / $0.30（官方 Supported Models 页逐字）',
    newQuote: 'PRICE PER 1M TOKENS',
    why: '只保留官方表头本身（逐字）。原来的「型号 + 价格」拼装在官方页上是**表格单元格**、不是连续文本 ⇒ 不是逐字句；价格事实留在 rates 字段与 note 里。'
  },
  {
    provider: 'together', planName: 'Serverless 按量计费',
    oldQuote: 'Input pricing (per 1M tokens) / Cached input pricing (per 1M tokens) / Output pricing (per 1M tokens) —— Inkling 1 / 0.17 / 4.05；Kimi K3 3 / 0.3 / 15（官方 serverless models 页逐字列头与两行）',
    newQuote: 'Input pricing (per 1M tokens)',
    why: '同上：只留官方列头逐字片段。'
  },
  {
    provider: 'fireworks', planName: 'Serverless 按量计费',
    oldQuote: '(USD per 1M tokens) —— Model | Standard | Priority；Ember-1 3 / 15；Kimi K3 3 / 15；GLM 5.3 1.4 / 4.4（官方 serverless pricing 页逐字）',
    newQuote: '(USD per 1M tokens)',
    why: '同上：只留官方单位说明逐字片段。'
  }
];

const PLAN_FIXES = [
  {
    planName: 'Amazon Q Developer Free Tier',
    oldQuote: 'Amazon Q Developer offers a perpetual Free Tier with monthly limits … Free — 50 agentic requests per month ; 1,000 lines of code per month',
    newQuote: 'Amazon Q Developer offers a perpetual Free Tier with monthly limits available to users logged in as an AWS Identity and Access Management (IAM) user or AWS Builder ID user.',
    why: '官方页上这句话**本身就是连续的逐字句**（快照 aws-q-pricing.txt 命中）；原引文后半段的「Free — 50 agentic requests per month ; 1,000 lines…」是把页面上两个段落拼起来的改写件 ⇒ 从引文里移除（额度事实留在 quota 字段）。'
  },
  {
    planName: 'Amazon Q Developer Pro',
    oldQuote: 'Pro Tier: Expanded limits $19/mo. per user ; Pro — 4,000 lines of code per month per user pooled at account level. Extra lines of code available at $.003 per line of code submitted.',
    newQuote: 'Pro Tier: Expanded limits $19/mo. per user',
    why: '这一句在官方页上逐字存在（快照命中 `<span …>Pro Tier: Expanded limits $19/mo. per user</span>`）。原引文用「 ; 」把另一段（4,000 LOC 段）拼在一起 ⇒ 拼接件不是逐字，故只留第一句；LOC 与超额单价留在 quota.description 与 restrictions.note（那两处的引文已单独列出且逐字）。'
  },
  {
    provider: 'Replit', planName: 'Core',
    oldQuote: 'Core $20 / $18 / month, billed annually — ✔ AI integrations ✔ Up to 30 hours of chat on Free Mode ✔ Up to 60 projects on Free Mode ✔ $20 towards most powerful models ✔ Plan mode ✔ Unlimited workspaces',
    newQuote: 'Core\n$20\n$18\n/ month, billed annually',
    why: '官方卡片上「Core」与价格是**分开的文本节点**，权益是同一卡片里的另一组节点 ⇒ 原来那句「价格 + 一长串权益」不是逐字句。新引文按卡片的**文本节点顺序**逐字列出（含官方页里的换行）；权益事实留在 quota.description。'
  },
  {
    provider: 'Replit', planName: 'Pro',
    oldQuote: 'Pro $100 / $90 / month, billed annually — ✔ 10 parallel agents ✔ Premium Support ✔ Even more Free Mode usage ✔ $100 towards most powerful models ✔ Up to 15 collaborators',
    newQuote: 'Pro\n$100\n$90\n/ month, billed annually',
    why: '理由同上（Replit 定价页 Pro 卡片）。'
  }
];

function patch(list, fixes, label) {
  const problems = [];
  let changed = 0;
  for (const fix of fixes) {
    const record = list.find(item => item.planName === fix.planName && (!fix.provider || item.provider === fix.provider));
    if (!record) { problems.push(`${label} ${fix.provider || ''}/${fix.planName}: 找不到记录`); continue; }
    const evidence = record.evidence || [];
    const hit = evidence.find(item => item.quote === fix.oldQuote);
    if (!hit) {
      if (evidence.some(item => item.quote === fix.newQuote)) continue;   // 幂等：已改成目标值
      problems.push(`${label} ${fix.planName}: 找不到待替换的引文（可能已被 t16 或前次运行改过）`);
      continue;
    }
    hit.quote = fix.newQuote;
    changed += 1;
    console.log(`  ✓ ${fix.provider || ''}/${fix.planName}：引文已换成逐字片段（${fix.newQuote.slice(0, 48)}…）`);
  }
  return { problems, changed };
}

function main() {
  const apiList = JSON.parse(fs.readFileSync(API_FILE, 'utf8'));
  const planList = JSON.parse(fs.readFileSync(PLAN_FILE, 'utf8'));
  const a = patch(apiList, API_FIXES, 'api');
  const p = patch(planList, PLAN_FIXES, 'plans');
  const problems = [...a.problems, ...p.problems];
  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }
  if (!a.changed && !p.changed) { console.log('✓ 已是目标状态（引文都已是逐字片段），无需写盘'); return 0; }
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }
  fs.writeFileSync(API_FILE, JSON.stringify(apiList, null, 2) + '\n', 'utf8');
  fs.writeFileSync(PLAN_FILE, JSON.stringify(planList, null, 2) + '\n', 'utf8');
  console.log(`✅ 已写出 curated_api_plans.json（改 ${a.changed} 条引文）与 curated_plans.json（改 ${p.changed} 条引文）`);
  console.log('下一步：rebuild-api-plans / rebuild-plans，再跑 7 条门禁');
  return 0;
}

process.exit(main());
