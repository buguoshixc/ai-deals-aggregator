#!/usr/bin/env node
/**
 * t32 主修复脚本：关闭 t15 的 F3 / F4 / F5 / F7 / F8（F1/F2 见 fix-verbatim-quotes.cjs）。
 *
 * 原则（本任务硬约束）：**只动证据表达与文档口径，不动任何金额 / 日期 / 单位**。
 *
 * · F3（jetbrains 两条 USD 不可服务端复核）⇒ 在 `billing.note` 里如实标注本地化限制，
 *   并把现场读到的 **CNY** 交叉读数写进 evidence（新增一条 quote，值来自该页自己的
 *   `productsData.currency` 节点：`{"symbol": "CNY", "iso": "CNY"}` + `countryName: China Mainland`），
 *   同时记下比页面更稳的**逐项报价端点**：`https://www.jetbrains.com/shop/quote?item=P:N:AIP:M` 这类
 *   （页面 `productsData.<code>.links.personal.monthly.quote` 逐字给出）。
 * · F4（currentness 键名口径不一致）⇒ `_roleVocabularyMapping` 的键统一改成与 `modelRoleVocabulary`
 *   相同**下划线**命名（值不变），并在 `_roleVocabularyProvenance` 里写明「键名只是映射表的键，
 *   44 条实际归一结果不受影响」。
 * · F5（vision 属 policy choice）⇒ 写进 `docs/SCHEMA-v3.0.md`，并注明逐条判据。
 * · F7（stepaudio 按资源类型处置）⇒ 写进 `docs/SCHEMA-v3.0.md` 的 §2.1。
 * · F8（coverage-targets 的 note 过长）⇒ 收敛为一句口径，长解释移到本目录 research 产物。
 *
 * 用法：node research/_raw/t32/apply-t32-doc-fixes.cjs [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry-run');
const CURATED_PLANS = path.join(ROOT, 'scripts', 'data', 'curated_plans.json');
const CURRENTNESS = path.join(ROOT, 'research', '_raw', 'coverage-expansion-v1', 'currentness.json');
const TARGETS = path.join(ROOT, 'scripts', 'data', 'coverage-targets.json');
const SCHEMA = path.join(ROOT, 'docs', 'SCHEMA-v3.0.md');

const JB_URL = 'https://www.jetbrains.com/ai-ides/buy/';

/* ------------------------------------------------------------------ */
/* F3：jetbrains 两条记录的本地化标注（金额一字不动）                     */
/* ------------------------------------------------------------------ */
const JB_NOTE_SUFFIX = '复核限制：本环境只能取到 CNY 版（页面自报 iso=CNY），USD 金额取自页内 code=AIP/AIPU 商品目录 JSON、不可服务端复核。';

const JB_EVIDENCE_APPEND = {
  field: 'billing.regularPrice',
  quote: '"currency": {"symbol": "CNY", "isPrefix": false, "iso": "CNY"}, "countryCode": "CN", "countryName": "China Mainland"',
  sourceUrl: JB_URL,
  capturedAt: '2026-10-04',
  lang: 'en'
};

/* ------------------------------------------------------------------ */
function main() {
  const problems = [];
  const notes = [];

  /* ---- F3 ---- */
  const plans = JSON.parse(fs.readFileSync(CURATED_PLANS, 'utf8'));
  for (const name of ['JetBrains AI Pro', 'JetBrains AI Ultimate']) {
    const record = plans.find(item => item.planName === name && item.provider === 'JetBrains');
    if (!record) { problems.push(`F3: 找不到 ${name}`); continue; }
    if (!record.billing.note.includes('复核限制')) {
      // billing.note 上限 200 字：先原文（两组价 + 收哪档），再追加**复核限制**一句；
      // 稳定性/端点等长解释放在 research/_raw/t32/t32-evidence-caveats.md，不进这一格。
      record.billing.note = `${record.billing.note.split('。复核限制')[0]}。${JB_NOTE_SUFFIX}`;
      if (record.billing.note.length > 200) {
        // 仍超：把 note 里的解释性从句收短（只留官方给了什么 + 本条收哪档）
        record.billing.note = `${record.billing.note.split('。')[0]}。${JB_NOTE_SUFFIX}`;
      }
    }
    if (!(record.evidence || []).some(item => String(item.quote).includes('countryName'))) {
      record.evidence = [...(record.evidence || []), JB_EVIDENCE_APPEND];
    }
    if (record.billing.note.length > 200) problems.push(`F3: ${name} 的 billing.note 仍超 200 字（${record.billing.note.length}）`);
    notes.push(`F3: ${name} 已加本地化标注（note ${record.billing.note.length} 字）+ CNY 交叉读数 evidence`);
  }

  /* ---- F4：词表键名统一为下划线 ---- */
  const currentness = JSON.parse(fs.readFileSync(CURRENTNESS, 'utf8'));
  const mapping = currentness._roleVocabularyMapping || {};
  const unified = {};
  let renamed = 0;
  for (const [key, value] of Object.entries(mapping)) {
    const next = key.replace(/-/g, '_');
    if (next !== key) renamed += 1;
    unified[next] = value;
  }
  if (renamed) {
    currentness._roleVocabularyMapping = unified;
    currentness._roleVocabularyProvenance = `${currentness._roleVocabularyProvenance} 键名口径（t32 修订）：\`modelRoleVocabulary\` 与 \`_roleVocabularyMapping\` 都统一用**下划线**命名（此前 mapping 用连字符、vocabulary 用下划线，属同一产物的两种写法）。键名只是映射表的键、不参与任何判据 ⇒ **44 条的实际归一结果不受影响**：44 条身份仍全部落在身份层 MODEL_ROLES 的合法取值上（逐条由 scripts/tools/model-role-vocabulary-selftest.js 与 verify-currentness-migration.cjs 核对）。`;
    notes.push(`F4: 词表键名统一（改 ${renamed} 个键为下划线），并写明 44 条归一结果不受影响`);
  } else {
    notes.push('F4: 词表键名已是下划线口径');
  }

  /* ---- F8：coverage-targets 的 note 收敛为一句 ---- */
  const targets = JSON.parse(fs.readFileSync(TARGETS, 'utf8'));
  const awsRow = targets.targets.find(row => row.provider === 'aws');
  if (awsRow && awsRow.note && awsRow.note.length > 80) {
    awsRow.note = '时效事实：官方公告 2027-04-30 停止支持 Amazon Q Developer IDE 插件并建议改用 Kiro（详见 research/coverage-expansion-v1-t32-evidence-caveats.md）。';
    notes.push(`F8: aws 行 note 收敛（${awsRow.note.length} 字）`);
  }

  if (problems.length) {
    console.error(`❌ ${problems.length} 处问题，拒绝写盘：`);
    problems.forEach(item => console.error('  - ' + item));
    return 1;
  }
  notes.forEach(item => console.log('  ✓ ' + item));
  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }
  fs.writeFileSync(CURATED_PLANS, JSON.stringify(plans, null, 2) + '\n', 'utf8');
  fs.writeFileSync(CURRENTNESS, JSON.stringify(currentness, null, 2) + '\n', 'utf8');
  fs.writeFileSync(TARGETS, JSON.stringify(targets, null, 2) + '\n', 'utf8');

  /* ---- F5 / F7：文档口径 ---- */
  let schema = fs.readFileSync(SCHEMA, 'utf8');
  if (!schema.includes('t32 · F5')) {
    const F5 = `\n### 1.4 \`modelRole\` 里两处**政策选择**（t32 · F5：如实承认，不写成官方事实）\n\n模型角色枚举（\`MODEL_ROLES\`）的取值判据是「官方页面 / 官方模型名上的能力标记」。但下面两条**不是官方明示**，而是本仓库的政策选择，登记在此以免被读成官方事实：\n\n| registrySlug | 落盘 role | 官方能证到什么 | 政策判断（本仓库选择） |\n| --- | --- | --- | --- |\n| \`deepseek-flash\` | \`vision\` | 官方定价页 \`Vision\` 行为 ✓、Change Log 逐字 "native multimodal visual understanding" | 官方明示支持图像理解，**按 \`vision\` 收**（若严格只认「官方自称 VLM」则应写 \`general\`） |\n| \`minimax-m3\` | \`vision\` | 官方发布页逐字「面向 Agent 推理、工具调用、代码、**多模态 Chat 输入**和长上下文任务」 | 「多模态输入」不等于「图像理解」，本轮**按含视觉输入收 \`vision\`**（保守写法是 \`general\`） |\n\n两条都与其余 42 条采用**同一套判据**（逐条一致，没有对某一家的特例）；若日后要改成严格口径，必须**同时**改这两条与本文档，并重跑 \`selftest:model-freshness\` 的档位断言。\n`;
    schema = schema.replace('\n### 1.2 发布产物', `${F5}\n### 1.2 发布产物`);
    notes.push('F5: docs/SCHEMA-v3.0.md 新增 §1.4（vision 属 policy choice，逐条一致）');
  } else {
    notes.push('F5: 文档已含该口径');
  }

  if (!schema.includes('t32 · F7')) {
    const F7 = `\n- **\`audio\` 角色保留但没有身份（t32 · F7）**：身份层的 \`MODEL_ROLES\` 里有 \`audio\`，但**当前 registry 里没有任何音频模型身份**。因此 \`plans.json\` 里出现的音频字符串（例如 StepFun Step Plan 的 \`stepaudio-2.5-asr\` / \`-chat\` / \`-realtime\` / \`-tts\`）一律按 **\`non-text-resource\`** 处置 —— 理由：该表的判据是「这一串还能不能落到**一个文本模型身份**上」，与「它是不是某种模型角色」是两件事；音频资源在 registry 里没有身份可落，所以出口是资源类型而不是角色。将来若要收录音频身份，必须做一次有意识的口径变更（新增身份 + 把这些声明改成映射），并同步改本节。\n`;
    schema = schema.replace('\n## 3. Provider Page', `${F7}\n## 3. Provider Page`);
    notes.push('F7: docs/SCHEMA-v3.0.md §2.1 追加 audio 角色 / non-text-resource 口径');
  } else {
    notes.push('F7: 文档已含该口径');
  }
  fs.writeFileSync(SCHEMA, schema, 'utf8');

  console.log('✅ 已写出 curated_plans.json / currentness.json / coverage-targets.json / docs/SCHEMA-v3.0.md');
  console.log('下一步：rebuild-plans，再跑 7 条门禁');
  return 0;
}

process.exit(main());
