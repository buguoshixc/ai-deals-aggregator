/**
 * t3 意图层（coverage-targets.json）批量修订工具。
 * 只写「意图 / 裁决 / 声明」——状态仍由 lib 从盘上事实派生（本脚本不写任何 state 字段）。
 * 序列化与校验全部复用 scripts/lib/coverage-targets.js（规范序 / 上限 / 双向对账都过同一支判据）。
 *
 * 用法：node research/_raw/coverage-depth-v1/gap-closure/_targets-edit.js [--dry-run]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const ct = require(path.join(ROOT, 'scripts', 'lib', 'coverage-targets.js'));
const providers = require(path.join(ROOT, 'scripts', 'lib', 'providers.js'));

const TARGETS_FILE = path.join(ROOT, 'scripts', 'data', 'coverage-targets.json');
const loaded = ct.load(TARGETS_FILE);
if (loaded.broken || !loaded.doc) throw new Error(`读不到 coverage-targets.json：${loaded.broken || '(空)'}`);
const doc = loaded.doc;

const byProvider = {};
for (const target of doc.targets) byProvider[target.provider] = target;
function T(name) {
  const target = byProvider[name];
  if (!target) throw new Error(`coverage-targets.json 里没有 provider ${name}`);
  return target;
}
/** 按维度序 + 目标名升序写 currentTargets（规范序由 lib 复核） */
const DIMS = ['deals', 'coding', 'api', 'models'];
const PAYLOAD = { deals: 'source', coding: 'planName', api: 'modelKey', models: 'registrySlug' };
function setTargets(name, items) {
  const sorted = [...items].sort((a, b) => {
    const ka = `${DIMS.indexOf(a.dimension)}\u0000${a[PAYLOAD[a.dimension]]}`;
    const kb = `${DIMS.indexOf(b.dimension)}\u0000${b[PAYLOAD[b.dimension]]}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  T(name).currentTargets = sorted;
}
function setRuling(name, ruling, dropDimension = null) {
  const target = T(name);
  if (dropDimension) {
    target.rulings = (target.rulings || []).filter(r => r.dimension !== dropDimension);
    return;
  }
  target.rulings = (target.rulings || []).filter(r => r.dimension !== ruling.dimension);
  target.rulings.push(ruling);
}

/* ------------------------------------------------------------------ */
/* 本轮修订                                                            */

doc.reviewedAt = '2026-10-05';

// —— ai360：coding 意图编码修正（原字符串本身就写着"没有自营 Coding 套餐"）+ api 目标已在盘上兑现
T('ai360').dimensionIntent.coding = null;
T('ai360').applicabilityNote = 'coding 不适用：官方只有「第三方工具接入」文档（CC Switch + Claude Code / Codex），没有自营编码订阅套餐（2026-10-05 复核：模型广场 94 个模型与平台页均无自营编程订阅档位）。';
setTargets('ai360', [{ dimension: 'api', modelKey: '360zhinao-turbo-llm-geo' }]);

// —— baichuan：coding 意图编码修正 + api 目标改成规范 modelKey
T('baichuan').dimensionIntent.coding = null;
T('baichuan').applicabilityNote = 'coding 不适用：官方公开价目面只有按量计费、搜索增强、知识库与 Embeddings，没有任何编程 / 订阅套餐（2026-10-05 复核确认）。';
setTargets('baichuan', [
  { dimension: 'api', modelKey: 'baichuan-m3' },
  { dimension: 'api', modelKey: 'baichuan-m3-plus' }
]);

// —— baidu：新增 api 目标（千帆按量后付费已落盘）
setTargets('baidu', [
  { dimension: 'deals', source: '百度千帆' },
  { dimension: 'api', modelKey: 'ernie-4.5-turbo-128k' },
  { dimension: 'api', modelKey: 'ernie-5.1' }
]);

// —— deepseek：deals 无对象可收（查过官方来源）
setRuling('deepseek', {
  dimension: 'deals',
  decision: 'unverifiable',
  reason: '查过 DeepSeek 官方来源（api-docs.deepseek.com 定价页与文档、platform.deepseek.com、deepseek.com 首页与公告），官方当前没有任何公开优惠 / 新用户额度 / 限时活动的口径可引用 ⇒ 这一格没有可诚实收录的对象，是"查过、没有"，不是漏采',
  revisitBy: null
});

// —— iflytek：删掉过期裁决（盘上已有两条已验证的 Astron Coding Plan）；补 coding / api 目标
setRuling('iflytek', null, 'coding');
setTargets('iflytek', [
  { dimension: 'coding', planName: '讯飞星辰 MaaS · Astron Coding Plan 速通版' },
  { dimension: 'coding', planName: '讯飞星辰 MaaS · Astron Coding Plan 高效版' },
  { dimension: 'api', modelKey: 'spark-x2.5' }
]);

// —— microsoft：coding 的收录范围需要先裁决（官方价可核，但它是生产力套件订阅）
setRuling('microsoft', {
  dimension: 'coding',
  decision: 'deferred',
  reason: '官方公开价可核（如 Microsoft 365 Business Premium with Copilot $32/user/月按年付），但 Microsoft 自营没有编程订阅套餐 —— 编程订阅是 GitHub Copilot，已单列 provider github。把生产力套件订阅记进 coding 会污染编程套餐横向对比，需要先裁决 coding 维度的收录范围',
  revisitBy: '当 coding 维度明确裁决是否收录「生产力套件订阅」（或官方推出 Microsoft 自营编程订阅、或 GitHub Copilot 与 Microsoft 合并为一个 identity）时复查'
});

// —— moonshot：新增 api 目标（Kimi 开放平台按量计费已落盘）
setTargets('moonshot', [
  { dimension: 'api', modelKey: 'kimi-k2.7-code' },
  { dimension: 'api', modelKey: 'kimi-k3' },
  { dimension: 'models', registrySlug: 'kimi-k2.7-code' },
  { dimension: 'models', registrySlug: 'kimi-k3' }
]);

// —— openai：新增 coding 目标（ChatGPT 档位已落盘）
setTargets('openai', [
  { dimension: 'coding', planName: 'ChatGPT Business · Premium 座位' },
  { dimension: 'coding', planName: 'ChatGPT Business · Standard 座位' },
  { dimension: 'coding', planName: 'ChatGPT Plus' },
  { dimension: 'coding', planName: 'ChatGPT Pro 100' },
  { dimension: 'coding', planName: 'ChatGPT Pro 200' },
  { dimension: 'coding', planName: 'ChatGPT Pro 500' },
  { dimension: 'models', registrySlug: 'gpt-6-luna' },
  { dimension: 'models', registrySlug: 'gpt-6.1-sol' }
]);

// —— replit：声明的 planName 与盘上身份不一致（盘上是 Core / Pro）⇒ 修正为真实 plan identity
setTargets('replit', [
  { dimension: 'coding', planName: 'Core' },
  { dimension: 'coding', planName: 'Pro' }
]);

// —— sensetime：api 目标改成规范 modelKey；新增 coding 目标（Token Plan 公测档已落盘）
setTargets('sensetime', [
  { dimension: 'coding', planName: 'SenseNova Token Plan · Free(公测)' },
  { dimension: 'api', modelKey: 'sensenova-v6.5-pro' }
]);

// —— stepfun：api 目标已落盘，保持声明（此处仅重排到规范序）
setTargets('stepfun', [
  { dimension: 'api', modelKey: 'step-3.7-flash' },
  { dimension: 'api', modelKey: 'step-5-preview' }
]);

/* ------------------------------------------------------------------ */

// rulings 按维度序排列（与 dimensionIntent / currentTargets 同一套规范序精神）
for (const target of doc.targets) {
  if (Array.isArray(target.rulings)) target.rulings.sort((a, b) => DIMS.indexOf(a.dimension) - DIMS.indexOf(b.dimension));
}

const health = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'source-health.json'), 'utf8'));
const knownSources = new Set((health.sources || []).map(s => s.name));
const dealsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
for (const deal of (dealsDoc.deals || [])) if (deal.source) knownSources.add(deal.source);

const modelsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'models.json'), 'utf8'));
const modelsTable = {};
for (const [key, value] of Object.entries(modelsRaw)) if (!key.startsWith('_')) modelsTable[key] = value;

const problems = ct.validateTargets(doc, {
  providerTable: providers.load().table,
  modelsTable,
  knownSources: [...knownSources],
  duplicateKeys: loaded.duplicateKeys
});
if (problems.length) {
  console.error(`❌ 意图层校验未通过（${problems.length} 处）：`);
  problems.slice(0, 20).forEach(p => console.error('  - ' + p));
  process.exit(1);
}
for (const target of [...doc.targets].sort((a, b) => (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0))) {
  byProvider[target.provider] = target;
}
doc.targets = [...doc.targets].sort((a, b) => (a.provider < b.provider ? -1 : a.provider > b.provider ? 1 : 0));

if (process.argv.includes('--dry-run')) {
  console.log('--dry-run：没有写盘；意图层校验通过');
  for (const name of ['ai360', 'baichuan', 'baidu', 'deepseek', 'iflytek', 'microsoft', 'moonshot', 'openai', 'replit', 'sensetime', 'stepfun']) {
    const t = T(name);
    console.log(`  ${name}: codingIntent=${t.dimensionIntent.coding === null ? 'null' : '字符串'} targets=${t.currentTargets.length} rulings=${(t.rulings || []).map(r => r.dimension + ':' + r.decision).join(',') || '-'}`);
  }
  process.exit(0);
}

fs.writeFileSync(TARGETS_FILE, ct.serialize(doc), 'utf8');
console.log('✅ 已写出 coverage-targets.json（reviewedAt=%s，%d 行意图）', doc.reviewedAt, doc.targets.length);
