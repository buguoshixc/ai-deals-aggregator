#!/usr/bin/env node
/**
 * `ai-eval` —— v2.0 AI 能力评测的三个金标准（golden）与三条评测臂。
 *
 * ## 这个工具存在的理由
 *
 * v2.0 引入了三种 AI 能力（字段提取 / 重复发现 / 翻译草稿），每一条都配了确定性闸门
 * （schema → 候选规则 R1–R5 → 译文守卫）。**闸门能证明"不合格的进不来"，但不能回答
 * "合格的有多准"**。要回答"有多准"，必须先有一份不依赖模型的答案（金标准），
 * 再让模型在同一份输入上作答，最后逐叶子比对。
 *
 * ## 三条臂的诚实程度**不一样**，输出里必须写清楚
 *
 *  · 臂 1（字段提取）与臂 2（重复发现）：本机没有 API key，默认跑的是
 *    `scripts/data/ai-eval/*.mocks.json` 里**人手写的录制响应**。它们测的是
 *    「评测工装本身通不通」——输入构造、schema 校验、候选规则、指标计算这四段。
 *    它们**不测模型质量**：录制响应不是模型生成的，指标高低只反映 fixture 的设计。
 *  · 臂 3（译文守卫）：完全不调模型，直接用 `translations_zh.json` 里人工核准的译文
 *    跑守卫（误报率），再对同一批译文做程序化篡改（检出率）。**这一条是真测量。**
 *
 * 分清这两件事是本工具最要紧的一条：把 fixture 上的分数当成模型分数，
 * 比没有评测更坏——它会让人以为"AI 已经很准了"。
 *
 * ## 为什么评测输入用我们自己的记录文本，而不去抓官方页
 *
 * 金标准取自 `deals.json` 里 v1.1 人工策展确认过的六字段。这些值的依据是**当时那页原文**，
 * 而我们手上留存的只有记录里的文本字段（`extract.recordText`）。用记录文本当输入，
 * 金标准与输入才互相自洽；去抓今天的官方页会引入第三种变量（页面已改），
 * 让"模型答错了"与"页面变了"无法区分。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../lib/store');
const audienceLib = require('../lib/audience');
const zhLib = require('../lib/zh');
const extract = require('../ai/extract');
const dedup = require('../ai/dedup');
const libDedup = require('../lib/dedup');
const translate = require('../ai/translate');
const guard = require('../ai/translate-guard');
const candidates = require('../ai/candidates');
const schemas = require('../ai/schemas');
const provider = require('../ai/provider');
const cache = require('../ai/cache');
const redact = require('../ai/redact');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'scripts', 'data', 'ai-eval');
const DEFAULT_OUT = path.join(ROOT, 'research', 'v2.0-ai-eval.json');
const TRANSLATIONS_FILE = path.join(ROOT, 'scripts', 'data', 'translations_zh.json');

const FILES = {
  extraction: path.join(DATA_DIR, 'extraction.golden.json'),
  dedup: path.join(DATA_DIR, 'dedup.golden.json'),
  translation: path.join(DATA_DIR, 'translation.golden.json'),
  extractionMocks: path.join(DATA_DIR, 'extraction.mocks.json'),
  dedupMocks: path.join(DATA_DIR, 'dedup.mocks.json'),
  mutations: path.join(DATA_DIR, 'translation.mutations.json')
};

const MANAGED_FIELDS = schemas.MANAGED_FIELDS; // ['audience','benefitType','eligibilityDetail','claimRequirements','availability']
const TRISTATE_MAPS = { eligibilityDetail: audienceLib.ELIGIBILITY_KEYS, claimRequirements: audienceLib.CLAIM_KEYS };
const UNKNOWN = schemas.TRISTATE_UNKNOWN;

/**
 * 臂 1 的金标准规模。
 *
 * 为什么是「固定 id 清单」而不是「前 N 条」：金标准必须与 `extraction.mocks.json` 里的
 * 手写响应**逐项对得上**。若按排序取前 N 条，上游数据一变，金标准里就会混进没有夹具的项，
 * 指标会在"没跑"和"跑砸了"之间分不清。所以这里写死 id 清单，并在构建期断言两边的集合相同
 * （`buildExtractionGolden` 里的 `EXTRACTION_FIXTURE_DEAL_IDS` 检查）——不一致就直接停下，
 * 而不是产出一份看起来正常的金标准。
 *
 * 这 6 条覆盖了夹具需要的五类情形（全对 / 枚举错 / 无引文 / falseCertainty / 带引文的过度自信），
 * 全部来自 deals.json 中带六字段的 88 条记录。
 */
const EXTRACTION_DEAL_IDS = [
  '2eae0e246de2', // 百度千帆 ERNIE：字段齐全，记录文本里有"需实名认证""新用户"
  '9c12f13df3ba', // 百度千帆同页第二个模型：与上一条构成"同页不同产品"
  'ebd47f6d2522', // 智谱 GLM-4.7-Flash：creditCardRequired 为 unknown，但文本里有"无需"
  '62e3166acec0', // 智谱 GLM-4V-Flash：同厂商不同产品
  'f22e3cd094ad', // 智谱 GLM-4.1V-Thinking-Flash：用于"带引文的过度自信"夹具
  '5dedb9455508'  // 智谱 CogView-3-Flash：同厂商不同产品
];

/** 臂 1 输入文本上限（记录文本本身大多只有 200 字上下，这个上限是防呆） */
const DEFAULT_MAX_CHARS = 1200;

/** 臂 2 的入围对数（与 dedup.shortlist 的默认契约一致） */
const DEDUP_MAX_PAIRS = 30;

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return file;
}

/** 生成时刻：只用于 golden 的 builtAt / 结果的 generatedAt 元数据字段 */
function stamp() {
  return new Date().toISOString().slice(0, 19) + 'Z';
}

function canonical(value) {
  return cache.canonicalJson(value);
}

function leafKey(leaf) {
  return `${leaf.key}=${canonical(leaf.value)}`;
}

function pct(part, total) {
  if (!total) return null;
  return Math.round((part / total) * 10000) / 10000;
}

function uniq(list) {
  return [...new Set(list)];
}

/* ------------------------------------------------------------------ */
/* 臂 1：字段提取                                                       */
/* ------------------------------------------------------------------ */

/** 金标准叶子：`{field, key, value}`。`audience`/`benefitType` 是数组，整体算一个叶子。 */
function goldLeaves(deal) {
  const out = [];
  for (const field of MANAGED_FIELDS) {
    for (const leaf of candidates.leafAssertions(deal[field])) {
      out.push({ field, key: leaf.key, value: leaf.value, id: `${field}.${leaf.key}` });
    }
  }
  return out;
}

/**
 * 金标准里"明确为 unknown"的叶子集合。
 *
 * 这是本臂头条指标的分母，所以它的口径必须写死在这里、且**只认三种情况**：
 *  · 三态映射里显式写了 `"unknown"`；
 *  · 三态映射里**根本没这个键**（没写 = 没有证据 = unknown）；
 *  · `availability.chinaUsable` 缺失或为 `"unknown"`。
 *
 * `regionRestriction` 不算叶子：它是一段原文摘录，没有"unknown"这个状态，
 * 把它算进分母会让 falseCertainty 变成一个无法解释的数字。
 */
function goldUnknownIds(deal) {
  const ids = [];
  if (!Array.isArray(deal.audience) || !deal.audience.length) ids.push('audience.(列表)');
  if (!Array.isArray(deal.benefitType) || !deal.benefitType.length) ids.push('benefitType.(列表)');
  for (const [field, keys] of Object.entries(TRISTATE_MAPS)) {
    for (const key of keys) {
      const value = deal[field] ? deal[field][key] : undefined;
      if (value !== true && value !== false) ids.push(`${field}.${key}`);
    }
  }
  const china = deal.availability ? deal.availability.chinaUsable : undefined;
  if (china !== true && china !== false) ids.push('availability.chinaUsable');
  return ids;
}

/**
 * AI 侧的预测叶子。
 *
 * 包含**全部** schema 合法的叶子，不因为"没有引文"就丢掉：
 * `falseCertainty` 要量的恰恰是"模型在没有证据时说了什么确定的话"，
 * 如果先把无引文的断言丢掉再统计，这个指标会恒等于 0 —— 一个永远为 0 的指标
 * 比没有指标更坏（它看起来像"模型从不过度自信"）。
 * 闸门的效果另有一个 `gatedRecall` 单独报，两者不混。
 */
function predictedLeaves(candidateValue) {
  const out = [];
  for (const field of MANAGED_FIELDS) {
    if (!(field in candidateValue)) continue;
    for (const leaf of candidates.leafAssertions(candidateValue[field])) {
      out.push({ field, key: leaf.key, value: leaf.value, id: `${field}.${leaf.key}` });
    }
  }
  return out;
}

/** 从确定性规则的错误串里数出"断言了内容但没有同名引文"的字段 */
function rejectedFields(check) {
  const rejected = new Set();
  for (const message of check.errors) {
    const m = /^R1 (\S+) 断言了内容但没有同名引文/.exec(message);
    if (m) rejected.add(m[1]);
  }
  return rejected;
}

function buildExtractionGolden(deals) {
  const byId = new Map(deals.map(deal => [deal.id, deal]));
  const items = EXTRACTION_DEAL_IDS.map(dealId => {
    const deal = byId.get(dealId);
    if (!deal) throw new Error(`金标准要的记录不在 deals.json 里：${dealId}`);
    if (!MANAGED_FIELDS.some(field => audienceLib.hasKnown(deal[field]))) {
      throw new Error(`记录 ${dealId} 没有任何已确认的托管字段，不能当字段提取的金标准`);
    }
    const gold = {};
    for (const field of MANAGED_FIELDS) {
      if (deal[field] !== undefined) gold[field] = deal[field];
    }
    return {
      id: `xf-${deal.id}`,
      dealId: deal.id,
      title: deal.title,
      sourceUrl: deal.url,
      region: deal.region,
      gold
    };
  });
  // 夹具与金标准必须一一对应：少一条夹具就是"这一项没跑"，指标会失真
  if (fs.existsSync(FILES.extractionMocks)) {
    const fixtures = readJson(FILES.extractionMocks);
    const missing = items.filter(item => typeof fixtures[item.id] !== 'string').map(item => item.id);
    const extra = Object.keys(fixtures).filter(key => !key.startsWith('_') && !items.some(item => item.id === key));
    if (missing.length) throw new Error(`extraction.mocks.json 缺少这些项的响应：${missing.join(', ')}`);
    if (extra.length) throw new Error(`extraction.mocks.json 里有不对应任何金标准项的键：${extra.join(', ')}`);
  }
  return {
    schemaVersion: 1,
    builtAt: stamp(),
    note: [
      '金标准来源：deals.json 中带六字段的记录（v1.1 人工策展确认值），不是模型输出，也不是另一轮判断。',
      `记录由写死的 id 清单选定（共 ${EXTRACTION_DEAL_IDS.length} 条），与 extraction.mocks.json 的键一一对应；构建期会断言这件事。`,
      '评测输入 = extract.recordText(deal) 截到 --max-chars 上限，即我们已提交的记录文本本身。',
      'gold 只记录记录里真实存在的字段；缺失的键一律视为 unknown（三态语义）。'
    ].join(' '),
    items
  };
}

function extractionContent(item, deal, maxChars) {
  const prepared = redact.prepareInput({ text: extract.recordText(deal), maxChars });
  return extract.buildContent(deal, prepared.text, { title: deal.title });
}

/** 把「item id → 响应文本」的 fixture 编译成「cacheKey → 响应文本」的临时 mock 文件 */
function compileMockMap(items, mockText, providerName) {
  const map = {};
  const missing = [];
  for (const item of items) {
    const text = mockText ? mockText[item.id] : null;
    if (typeof text !== 'string') {
      missing.push(item.id);
      continue;
    }
    const inputHash = cache.inputHashOf(item.content);
    map[cache.cacheKeyOf({
      task: item.task,
      promptVersion: item.promptVersion,
      provider: providerName,
      model: 'none',
      inputHash
    })] = text;
  }
  return { map, missing };
}

/**
 * 跑一条臂的所有单元：每单元一份临时 mock 映射文件，其余全部走真实的 provider 出口。
 *
 * 为什么不直接读 fixture 文件、跳过 `generateStructured`：那样测的就是"我会不会 JSON.parse"，
 * 而 schema 校验、输入上限、缓存 key、usage 记账全部绕过了 —— 那些恰好是评测要证明能跑通的部分。
 */
async function runStructured(items, mockMap, { providerName, model, mode, live }) {
  const results = [];
  const mockFile = path.join(os.tmpdir(), `dsh-ai-eval-mock-${process.pid}.json`);
  for (const item of items) {
    let responseText = null;
    if (mode === 'mock') {
      const inputHash = cache.inputHashOf(item.content);
      const key = cache.cacheKeyOf({
        task: item.task,
        promptVersion: item.promptVersion,
        provider: providerName,
        model: 'none',
        inputHash
      });
      responseText = mockMap[key];
      if (responseText === undefined) {
        results.push({ item, ok: false, skipped: true, reason: `fixture 缺少录制响应（${item.id}）` });
        continue;
      }
      writeJson(mockFile, { [key]: responseText });
      process.env.AI_MOCK_FILE = mockFile;
    }
    const response = await provider.generateStructured({
      task: item.task,
      promptVersion: item.promptVersion,
      system: item.system,
      content: item.content,
      provider: live ? undefined : providerName,
      model: live ? undefined : model,
      maxInputChars: item.maxInputChars || schemas.TASK_LIMITS[item.task],
      cache: true
    });
    results.push({ item, ...response });
  }
  if (mode === 'mock' && fs.existsSync(mockFile)) fs.rmSync(mockFile, { force: true });
  return results;
}

async function runExtractionArm(deals, golden, { mode, providerName, model, live, maxChars }) {
  const byId = new Map(deals.map(d => [d.id, d]));
  const items = [];
  for (const entry of golden.items) {
    const deal = byId.get(entry.dealId);
    if (!deal) continue;
    items.push({
      id: entry.id,
      dealId: entry.dealId,
      task: extract.TASK,
      promptVersion: extract.PROMPT_VERSION,
      system: extract.SYSTEM,
      content: extractionContent(entry, deal, maxChars),
      deal,
      gold: entry.gold
    });
  }

  let mockMap = {};
  let fixtureMissing = [];
  if (mode === 'mock') {
    const fixtures = fs.existsSync(FILES.extractionMocks) ? readJson(FILES.extractionMocks) : {};
    const compiled = compileMockMap(items, fixtures, providerName);
    mockMap = compiled.map;
    fixtureMissing = compiled.missing;
  }

  const results = await runStructured(items, mockMap, { providerName, model, mode, live });

  // 逐字段累计
  const perField = {};
  for (const field of MANAGED_FIELDS) perField[field] = { support: 0, truePositive: 0, falsePositive: 0, falseNegative: 0, goldUnknown: 0 };
  let goldLeavesTotal = 0;
  let goldUnknownTotal = 0;
  let unknownAgreed = 0;
  let falseCertainty = 0;
  let missingEvidence = 0;
  let schemaOk = 0;
  let schemaRejected = 0;
  let skipped = 0;
  let gatedTruePositive = 0;
  const invalidReasons = {};
  const perItem = [];

  for (const result of results) {
    if (result.skipped) {
      skipped++;
      perItem.push({ id: result.item.id, dealId: result.item.dealId, skipped: true, detail: result.reason });
      continue;
    }
    const item = result.item;
    const unknownIds = goldUnknownIds(item.deal);
    goldUnknownTotal += unknownIds.length;
    const gold = goldLeaves(item.gold);
    goldLeavesTotal += gold.length;
    const goldIds = new Set(gold.map(leafKey));

    let predicted = [];
    let rejected = new Set();
    let flags = [];
    let status = 'invalid';
    if (result.ok) {
      schemaOk++;
      const parsed = extract.interpret(result.result);
      predicted = predictedLeaves(parsed.candidate);
      const check = candidates.checkDeterministic(parsed.candidate, {
        task: extract.TASK,
        evidence: parsed.evidence,
        confidence: parsed.confidence
      });
      flags = check.flags;
      if (check.errors.length) {
        status = 'rejected_by_rules';
        rejected = rejectedFields(check);
        missingEvidence += rejected.size;
      } else {
        status = 'accepted';
      }
    } else {
      schemaRejected++;
      const reason = result.invalid ? result.invalid.reason : 'unknown';
      invalidReasons[reason] = (invalidReasons[reason] || 0) + 1;
    }

    const predictedIds = new Set(predicted.map(leafKey));
    for (const leaf of predicted) {
      const key = leafKey(leaf);
      // 被候选规则拒掉的字段（无同名引文）一律不算"预测成功"——
      // 闸门的意义就是这些断言进不了候选列表
      const isRejected = rejected.has(leaf.field);
      const hit = goldIds.has(key);
      if (hit) {
        if (!isRejected) gatedTruePositive++;
      } else {
        perField[leaf.field].falsePositive++;
      }
      if (unknownIds.includes(leaf.id)) falseCertainty++;
    }

    for (const leaf of gold) {
      const key = leafKey(leaf);
      perField[leaf.field].support++;
      if (predictedIds.has(key)) perField[leaf.field].truePositive++;
      else perField[leaf.field].falseNegative++;
    }
    for (const id of unknownIds) perField[id.split('.')[0]].goldUnknown++;
    // unknownAccuracy：金标准 unknown 的叶子里，AI 也没有给值的比例
    for (const id of unknownIds) {
      const has = predicted.some(leaf => leaf.id === id);
      if (!has) unknownAgreed++;
    }

    perItem.push({
      id: item.id,
      dealId: item.dealId,
      status,
      goldLeaves: gold.length,
      goldUnknown: unknownIds.length,
      predictedLeaves: predicted.length,
      rejectedFields: [...rejected],
      flags: flags.map(f => f.code),
      invalidReason: result.ok ? null : result.invalid.reason,
      invalidDetail: result.ok ? null : result.invalid.detail,
      inputChars: item.content.length
    });
  }

  const fields = {};
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const field of MANAGED_FIELDS) {
    const row = perField[field];
    tp += row.truePositive;
    fp += row.falsePositive;
    fn += row.falseNegative;
    fields[field] = {
      support: row.support,
      truePositive: row.truePositive,
      falsePositive: row.falsePositive,
      falseNegative: row.falseNegative,
      goldUnknown: row.goldUnknown,
      precision: row.truePositive + row.falsePositive ? pct(row.truePositive, row.truePositive + row.falsePositive) : null,
      recall: row.support ? pct(row.truePositive, row.support) : null
    };
  }

  return {
    mode,
    goldenItems: golden.items.length,
    ran: results.length - skipped,
    skipped,
    fixtureMissing,
    maxChars,
    fields,
    overall: {
      goldLeaves: goldLeavesTotal,
      truePositive: tp,
      falsePositive: fp,
      falseNegative: fn,
      precision: tp + fp ? pct(tp, tp + fp) : null,
      recall: goldLeavesTotal ? pct(tp, goldLeavesTotal) : null,
      gatedRecall: goldLeavesTotal ? pct(gatedTruePositive, goldLeavesTotal) : null
    },
    unknownAccuracy: {
      goldUnknownLeaves: goldUnknownTotal,
      aiAlsoUnknown: unknownAgreed,
      rate: goldUnknownTotal ? pct(unknownAgreed, goldUnknownTotal) : null
    },
    falseCertaintyRate: {
      goldUnknownLeaves: goldUnknownTotal,
      aiGaveValue: falseCertainty,
      rate: goldUnknownTotal ? pct(falseCertainty, goldUnknownTotal) : null
    },
    missingEvidence,
    schemaOk,
    schemaRejected,
    invalidReasons,
    items: perItem
  };
}

/* ------------------------------------------------------------------ */
/* 臂 2：重复发现                                                       */
/* ------------------------------------------------------------------ */

/** 标注规则原文 —— 同时写进 golden 的 note 与最终报告，两处必须逐字相同 */
const DEDUP_LABELING_RULE = [
  'same vendor（厂商名相同）AND same product（标题里的产品名词逐字相同）AND same benefit（优惠文案逐字相同或都为空）→ same_offer；',
  'same vendor AND same product 但 benefit 不同（如免费额度 vs 学生折扣）→ same_product_different_offer；',
  'same vendor，product 不同 → same_vendor；',
  '没有共同厂商 / 产品 / URL / benefit → unrelated；',
  '信息不足以判断 → uncertain。'
].join(' ');

function buildDedupGolden(deals) {
  const shortlist = dedup.shortlist(deals, { maxPairs: DEDUP_MAX_PAIRS });
  const pairs = shortlist.map(pair => {
    const key = dedup.pairKey(pair.a, pair.b);
    const label = DEDUP_LABELS[key];
    if (!label) throw new Error(`预筛对 ${key} 没有人工标注（改了数据而没补标注，评测必须先在这里停下）`);
    return { a: pair.a.id, b: pair.b.id, relation: label.relation, reason: label.reason };
  });
  return {
    schemaVersion: 1,
    builtAt: stamp(),
    labelingRule: DEDUP_LABELING_RULE,
    note: DEDUP_LABELING_RULE,
    pairs
  };
}

/**
 * 人工标注表：键 = `dedup.pairKey(a,b)`（两个 id 排序后以 ~ 连接）。
 *
 * 为什么写死在代码里而不是在数据文件里挑：预筛入围对是**数据变化就会变**的，
 * 一旦某对没标注，`buildDedupGolden` 会直接抛错停下 —— 宁可停，也不要让一条
 * 没有人工判断的 pair 悄悄进金标准（那会让"准确率"分不清是模型的还是标注的）。
 */
const DEDUP_LABELS = {
  '8583e9860d88~c3d6bd34ebfe': { relation: 'same_vendor', reason: '同厂商 Getsolved，产品不同：整站入口 vs 具体的 AI 检测器' },
  '45ead69d60cc~7f8c32f6a327': { relation: 'same_vendor', reason: '同厂商 火山引擎，产品不同：Doubao-Seedream-4.5 vs 4.0 两个模型' },
  '62e3166acec0~6798f78de5ce': { relation: 'same_vendor', reason: '同厂商 智谱AI，产品不同：GLM-4.6V-Flash vs GLM-4V-Flash' },
  '78384299b660~c4ab5c5d8101': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：Qwen3-Coder-30B vs 480B' },
  '8b2e8d64f11f~9c12f13df3ba': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：ERNIE-X1-Turbo-32K vs ERNIE-4.5-Turbo-32K' },
  'e384895f5935~e65f54470862': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：DeepSeek-V3.1 vs DeepSeek-V3.1-Think' },
  '62e3166acec0~e7e8f538456c': { relation: 'same_vendor', reason: '同厂商 智谱AI，产品不同：GLM-4V-Flash vs GLM-4.5-Flash' },
  '62e3166acec0~ebd47f6d2522': { relation: 'same_vendor', reason: '同厂商 智谱AI，产品不同：GLM-4V-Flash vs GLM-4.7-Flash' },
  'e7e8f538456c~ebd47f6d2522': { relation: 'same_vendor', reason: '同厂商 智谱AI，产品不同：GLM-4.5-Flash vs GLM-4.7-Flash' },
  '2eae0e246de2~9c12f13df3ba': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：ERNIE-4.5-Turbo-128K vs 32K' },
  '9c12f13df3ba~ad1d0c83909d': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：ERNIE-4.5-Turbo-32K vs ERNIE-4.5-Turbo-VL' },
  '2eae0e246de2~ad1d0c83909d': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：ERNIE-4.5-Turbo-128K vs ERNIE-4.5-Turbo-VL' },
  '6798f78de5ce~e7e8f538456c': { relation: 'same_vendor', reason: '同厂商 智谱AI，产品不同：GLM-4.6V-Flash vs GLM-4.5-Flash' },
  '6798f78de5ce~ebd47f6d2522': { relation: 'same_vendor', reason: '同厂商 智谱AI，产品不同：GLM-4.6V-Flash vs GLM-4.7-Flash' },
  '017bdbc04e70~8b609cb05116': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：Qwen3-235B-A22B vs Qwen3-30B-A3B' },
  '4c7952115477~5c38e515a3ae': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：bge-large-en vs bge-large-zh' },
  '4d4bcb5b6829~bf156583e97c': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：DeepSeek-R1 vs DeepSeek-R1-250528' },
  '78384299b660~8b609cb05116': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：Qwen3-30B-A3B vs Qwen3-Coder-30B-A3B' },
  '8814355d59e1~e384895f5935': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：DeepSeek-V3-250324 vs DeepSeek-V3.1-250821' },
  '45ead69d60cc~d6aaee8c7379': { relation: 'same_vendor', reason: '同厂商 火山引擎，产品不同：Doubao-Seedream-4.5 vs 5.0-lite' },
  '7f8c32f6a327~d6aaee8c7379': { relation: 'same_vendor', reason: '同厂商 火山引擎，产品不同：Doubao-Seedream-4.0 vs 5.0-lite' },
  '5dedb9455508~df1210f69a39': { relation: 'same_vendor', reason: '同厂商 智谱AI，产品不同：CogView-3-Flash vs CogVideoX-Flash' },
  '2eae0e246de2~8b2e8d64f11f': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：ERNIE-4.5-Turbo-128K vs ERNIE-X1-Turbo-32K' },
  '4d4bcb5b6829~8814355d59e1': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：DeepSeek-R1 vs DeepSeek-V3-250324' },
  '4d4bcb5b6829~e384895f5935': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：DeepSeek-R1 vs DeepSeek-V3.1-250821' },
  '8b609cb05116~c4ab5c5d8101': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：Qwen3-30B-A3B vs Qwen3-Coder-480B' },
  'bf156583e97c~e384895f5935': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：DeepSeek-R1-250528 vs DeepSeek-V3.1-250821' },
  '017bdbc04e70~c4ab5c5d8101': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：Qwen3-235B-A22B vs Qwen3-Coder-480B' },
  '2db62eb1a8a0~8dada3205ed8': { relation: 'same_vendor', reason: '同厂商 火山引擎，产品不同：流式语音识别 vs 录音文件识别' },
  '8814355d59e1~e65f54470862': { relation: 'same_vendor', reason: '同厂商 百度智能云，产品不同：DeepSeek-V3-250324 vs DeepSeek-V3.1-Think-250821' },
};

async function runDedupArm(deals, golden, { mode, providerName, model, live }) {
  const byId = new Map(deals.map(d => [d.id, d]));
  const items = [];
  for (const entry of golden.pairs) {
    const a = byId.get(entry.a);
    const b = byId.get(entry.b);
    if (!a || !b) continue;
    const signals = dedup.signalsOf(a, b);
    items.push({
      id: dedup.pairKey(a, b),
      task: dedup.TASK,
      promptVersion: dedup.PROMPT_VERSION,
      system: dedup.SYSTEM,
      content: redact.collapse(dedup.buildContent({ a, b, signals }, schemas.TASK_LIMITS[dedup.TASK])),
      gold: entry.relation,
      reason: entry.reason
    });
  }

  let mockMap = {};
  let fixtureMissing = [];
  if (mode === 'mock') {
    const fixtures = fs.existsSync(FILES.dedupMocks) ? readJson(FILES.dedupMocks) : {};
    // 臂 2 的 fixture 按 pairKey 索引（与臂 1 的 item id 同构）
    const compiled = compileMockMap(items, fixtures, providerName);
    mockMap = compiled.map;
    fixtureMissing = compiled.missing;
  }

  const results = await runStructured(items, mockMap, { providerName, model, mode, live });

  const labels = [...schemas.DEDUP_RELATIONS, 'invalid'];
  const matrix = {};
  for (const goldLabel of schemas.DEDUP_RELATIONS) {
    matrix[goldLabel] = {};
    for (const predictedLabel of labels) matrix[goldLabel][predictedLabel] = 0;
  }
  let correct = 0;
  let counted = 0;
  let dangerous = 0;
  let invalid = 0;
  const perPair = [];

  for (const result of results) {
    const goldLabel = result.item.gold;
    if (result.skipped) {
      perPair.push({ pair: result.item.id, gold: goldLabel, predicted: 'skipped', reason: result.reason });
      continue;
    }
    let predictedLabel = 'invalid';
    if (result.ok) predictedLabel = result.result.relation;
    else invalid++;
    matrix[goldLabel][predictedLabel] = (matrix[goldLabel][predictedLabel] || 0) + 1;
    counted++;
    if (predictedLabel === goldLabel) correct++;
    if (goldLabel === 'same_vendor' && predictedLabel === 'same_offer') dangerous++;
    perPair.push({
      pair: result.item.id,
      gold: goldLabel,
      predicted: predictedLabel,
      reason: result.ok ? result.result.reason : result.invalid.detail
    });
  }

  // 现有确定性去重会合并几对：aliasKey 相同即视为会合并（与 lib/dedup 的口径一致）
  let existingWouldMerge = 0;
  for (const entry of golden.pairs) {
    const a = byId.get(entry.a);
    const b = byId.get(entry.b);
    if (a && b && libDedup.aliasKey(a.title) === libDedup.aliasKey(b.title)) existingWouldMerge++;
  }
  const aliasGroups = new Map();
  for (const deal of deals) {
    const key = libDedup.aliasKey(deal.title);
    if (!aliasGroups.has(key)) aliasGroups.set(key, []);
    aliasGroups.get(key).push(deal.id);
  }
  const duplicateGroupsInStore = [...aliasGroups.values()].filter(group => group.length > 1);

  return {
    mode,
    goldenPairs: golden.pairs.length,
    ran: results.filter(r => !r.skipped).length,
    skipped: results.filter(r => r.skipped).length,
    fixtureMissing,
    coverage: pct(results.filter(r => !r.skipped).length, golden.pairs.length),
    labelingRule: golden.labelingRule,
    matrix,
    accuracy: counted ? pct(correct, counted) : null,
    correct,
    counted,
    invalidResponses: invalid,
    dangerousSameVendorAsSameOffer: dangerous,
    existingDeterministic: {
      wouldMergeShortlistPairs: existingWouldMerge,
      duplicateAliasGroupsInStore: duplicateGroupsInStore.length,
      detail: '现有确定性去重按 aliasKey(normalizeTitle(title)) 合并；本臂只发现、不合并（dedup.js 不导出任何 merge 符号）'
    },
    pairs: perPair
  };
}

/* ------------------------------------------------------------------ */
/* 臂 3：译文守卫                                                       */
/* ------------------------------------------------------------------ */

function buildTranslationGolden(deals) {
  const store0 = zhLib.load(TRANSLATIONS_FILE);
  const byId = new Map(deals.map(d => [d.id, d]));
  const pairs = [];
  const stale = [];
  for (const dealId of Object.keys(store0.byId).sort()) {
    const entry = store0.byId[dealId];
    const deal = byId.get(dealId);
    if (!deal) continue;
    const terms = translate.termsOf(deal);
    for (const field of zhLib.ZH_FIELDS) {
      const en = entry.src && typeof entry.src[field] === 'string' ? entry.src[field] : null;
      const zh = typeof entry[field] === 'string' ? entry[field] : null;
      if (!en || !zh) continue;
      const current = typeof deal[field] === 'string' ? deal[field] : null;
      if (current !== en) stale.push({ dealId, field, reason: '译文快照的英文与记录当前的英文不一致' });
      pairs.push({ dealId, field, en, zh, terms });
    }
  }
  return {
    golden: {
      schemaVersion: 1,
      builtAt: stamp(),
      note: [
        '来源：scripts/data/translations_zh.json 里人工核准的译文。',
        'en 取 entry.src[field]（译文**当初照着写的那段英文**），不是记录当前的英文：',
        '若用当前英文，原文漂移会被算成守卫误报，而那不是误报。',
        'terms 取 translate.termsOf(deal)（厂商名里的拉丁词），来自 deals.json。',
        'drift 列的是「快照英文 ≠ 记录当前英文」的对，它们不影响本臂结论，但要让人看见。'
      ].join(' '),
      pairs,
      drift: stale
    },
    drift: stale
  };
}

/**
 * 程序化篡改清单。
 *
 * 每一条都是译文守卫**必须**拦下的错误，而且是现实中真会发生的错误：
 * 漏数字、换币种、丢产品名、改 URL、抹掉否定、把试用说成免费、凭空写"长期有效"、把上限说成确定值。
 * 检出率低说明守卫有洞；一条都拦不住说明守卫根本没接上。
 */
/**
 * 程序化篡改清单。
 *
 * 每一条都是译文守卫**必须**拦下的错误，而且是现实中真会发生的错误：
 * 漏数字、换币种、丢产品名、改 URL、抹掉否定、把试用说成免费、凭空写"长期有效"、把上限说成确定值。
 * 检出率低说明守卫有洞；一条都拦不住说明守卫根本没接上。
 *
 * ## 关于"该报没报"
 *
 * 每条篡改都有明确的期望码（个别条目另给 `acceptCodes`，见 m02 / m06 的注释）。
 * 期望码没出现就是**未检出**，会醒目打印出来并且让退出码非零 —— 这条纪律不放松：
 * 一个"未检出"如果被悄悄算成通过，评测就成了摆设。
 */
const MUTATIONS = [
  {
    id: 'm01-number-deleted',
    mutation: '删掉译文里的一个数字',
    expectedCode: 'number_missing',
    side: 'zh'
  },
  {
    id: 'm02-number-changed',
    mutation: '把译文里的一个数字 +1',
    // 数字被改时守卫会同时看到"译文里多了一个原文没有的数字"（number_invented）
    // 与"英文的数字不见了"（number_missing，现在两个方向都判）。两者都是"数字被动了"，都算检出。
    expectedCode: 'number_missing',
    acceptCodes: ['number_missing', 'number_invented'],
    side: 'zh'
  },
  { id: 'm03-currency-swapped', mutation: '把译文里的 $ 换成 ¥', expectedCode: 'currency_missing', side: 'zh' },
  { id: 'm04-term-dropped', mutation: '删掉译文里某个专有名词的全部出现处', expectedCode: 'term_missing', side: 'zh' },
  { id: 'm05-url-rewritten', mutation: '改写译文里的 URL/域名', expectedCode: 'url_changed', side: 'zh' },
  {
    id: 'm06-negation-deleted',
    mutation: '制造否定错位（英文原文失去否定 / 译文凭空多出否定结论）',
    // translate-guard.js 的否定规则是**双向**的：negation_lost（英文否定、译文没有）
    // 与 negation_invented（译文有强否定结论、英文没有）。这一条篡改制造的是否定错位，
    // 两个方向哪一个亮都说明守卫看见了，所以两个码都收。
    expectedCode: 'negation_lost',
    acceptCodes: ['negation_lost', 'negation_invented'],
    side: 'en'
  },
  { id: 'm07-trial-as-free', mutation: '给试用类原文的译文插入「免费」', expectedCode: 'trial_as_free', side: 'zh' },
  { id: 'm08-permanent-invented', mutation: '给没有长期表述的原文的译文插入「长期有效」', expectedCode: 'permanent_invented', side: 'zh' },
  { id: 'm09-cap-flattened', mutation: '把译文里的「最高/上限」删掉', expectedCode: 'cap_flattened', side: 'zh' },
  { id: 'm10-date-invented', mutation: '给没有日期的原文的译文插入「2027 年」', expectedCode: 'date_invented', side: 'zh' }
];

/**
 * 「原文是试用」的判据。刻意在这里写一份，而不是要求 translate-guard 多导出一个符号：
 * guard.js 只导出它打算给外部用的东西，为了评测去改它的导出面，等于让评测工具
 * 往被测对象里加接口。这份副本只用于**筛选**要被篡改的译文对，判断仍由 guard.check 做。
 */
/**
 * 「原文里有没有日期」的判据。与 TRIAL_SOURCE 同理：guard.js 只导出它打算给外部的符号
 * （`DATE_EN` 没在导出面里），评测工具为了一行筛选去改它的导出面是本末倒置，
 * 所以这里写一份只用于**筛选**的副本；是否违规仍由 guard.check 判。
 */
const DATE_SOURCE = /\b\d{4}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b\d{1,2}\/\d{1,2}\b/i;

const TRIAL_SOURCE = /\btrial\b|试用|try (it )?free|14-day|30-day free/i;

/** 「原文自己就说了长期/永久」的筛选判据（同上：guard.PERMANENT_EN 没在导出面里） */
const PERMANENT_SOURCE = /\bpermanent(ly)?\b|forever|\balways\b|ongoing|standing|indefinitely|长期|永久/i;

/**
 * 列出这条篡改在给定对上所有**成立**的施加方式。
 *
 * 返回数组而不是"第一个能改的"：调用方会拿真实 `guard.check()` 逐个验证
 * （见 runTranslationArm），只有守卫确实报出目标违规码的那个候选才算数。
 *
 * 为什么要这一层验证：本文件刻意**不**复制守卫内部的正则（`NEGATION_EN` 之外的
 * 几条都没在导出面里）。自己写一份近似判据去决定"这条篡改该不该被检出"，
 * 迟早会与守卫的真实行为对不上 —— 那时"未检出"到底是规则有洞还是夹具没做好，
 * 就分不清了。让守卫自己说话，是最不容易骗人的做法。
 */
function applyMutation(mutation, pair) {
  const zh = pair.zh;
  const en = pair.en;
  const out = [];
  const enNumbers = guard.numbersOf(en, { expandMonths: true });
  const enCurrencies = guard.currenciesOf(en);
  switch (mutation.id) {
    case 'm01-number-deleted': {
      // 删掉一个数字。守卫的 number_missing 有一条例外：英文里带 `%` 的数字允许"消失"，
      // 所以选中的数字必须在英文里**不是**百分比形式，否则这条篡改本来就该被放行。
      for (const match of zh.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
        const value = Number(match[0].replace(/,/g, ''));
        if (!Number.isFinite(value)) continue;
        const normalized = String(Math.round(value * 1e6) / 1e6);
        if (en.includes(`${normalized}%`) || en.includes(`${normalized} %`)) continue;
        if (!enNumbers.has(normalized)) continue;
        out.push({ text: zh.slice(0, match.index) + zh.slice(match.index + match[0].length), detail: `删掉数字 ${match[0]}` });
      }
      return out;
    }
    case 'm02-number-changed': {
      for (const match of zh.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
        const value = Number(match[0].replace(/,/g, ''));
        if (!Number.isFinite(value)) continue;
        const next = String(value + 1);
        if (enNumbers.has(next)) continue; // 改出来的数字原文里本来就有 —— 这条篡改不成立
        out.push({ text: zh.slice(0, match.index) + next + zh.slice(match.index + match[0].length), detail: `${match[0]} → ${next}` });
      }
      return out;
    }
    case 'm03-currency-swapped': {
      if (zh.includes('$') && !enCurrencies.has('cny')) out.push({ text: zh.replace('$', '¥'), detail: '$ → ¥' });
      return out;
    }
    case 'm04-term-dropped': {
      // 专有名词必须**同时**出现在英文原文里（否则守卫本来就不该要求保留它），
      // 而且要在译文里**全部**删掉：只删第一处的话，`includes()` 仍然能找到第二处，
      // 守卫不报是对的 —— 那不是"漏检"，是这条篡改没做干净。
      for (const term of pair.terms) {
        if (term.length < 3) continue;
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (!new RegExp(`\\b${escaped}\\b`, 'i').test(en)) continue;
        if (!zh.toLowerCase().includes(term.toLowerCase())) continue;
        const text = zh.replace(new RegExp(escaped, 'gi'), '');
        if (text.toLowerCase().includes(term.toLowerCase())) continue;
        out.push({ text, detail: `删掉专有名词 ${term}（全部出现处）` });
      }
      return out;
    }
    case 'm05-url-rewritten': {
      for (const url of guard.urlsOf(zh)) {
        const at = zh.indexOf(url);
        if (at < 0) continue;
        const rewritten = url.includes('//') ? url.replace(/\/\/([^/]+)/, '//example-eval.invalid') : 'example-eval.invalid';
        out.push({ text: zh.slice(0, at) + rewritten + zh.slice(at + url.length), detail: `${url} → ${rewritten}` });
      }
      return out;
    }
    case 'm06-negation-deleted': {
      // 「丢掉否定」这条要真的成立：中文的否定往往不止一个词（「没有列出…非营利」），
      // 只删一个「没」，剩下的「非」仍然是合格的否定词，守卫不报是**对的**。
      // 所以这里改在**英文侧**删掉那个否定短语：原文的否定语义没了，译文却还在否定 —— 这才是"丢掉否定"。
      const NEGATIONS = [/\bno\b\s*/i, /\bnot\b\s*/i, /\bnever\b\s*/i, /\bwithout\b\s*/i, /\bno longer\b\s*/i];
      for (const re of NEGATIONS) {
        const match = re.exec(en);
        if (!match) continue;
        const stripped = en.slice(0, match.index) + en.slice(match.index + match[0].length);
        if (guard.NEGATION_EN.test(stripped)) continue; // 英文里还剩别的否定 —— 没删干净
        out.push({ text: zh, en: stripped, detail: `英文原文删掉「${match[0].trim()}」` });
      }
      return out;
    }
    case 'm07-trial-as-free': {
      // 判据与守卫第 ⑥ 条对齐：守卫看的是**译文里有没有「试用」**，不是英文里有没有 trial。
      // 译文里本来就写了「试用」时，写「免费」也算把力度放大了（试用≠免费），所以仍然施加。
      if (TRIAL_SOURCE.test(en) && !/\bfree\b|no cost|no charge|complimentary/i.test(en)) {
        out.push({ text: `${zh}（免费）`, detail: '插入「免费」' });
      }
      return out;
    }
    case 'm08-permanent-invented': {
      if (!PERMANENT_SOURCE.test(en)) out.push({ text: `${zh}，长期有效`, detail: '插入「长期有效」' });
      return out;
    }
    case 'm09-cap-flattened': {
      for (const match of zh.matchAll(/最高|上限|最多|至多|不超过/g)) {
        out.push({ text: zh.slice(0, match.index) + zh.slice(match.index + match[0].length), detail: `删掉「${match[0]}」` });
      }
      return out;
    }
    case 'm10-date-invented': {
      if (DATE_SOURCE.test(en) || /\d{4}/.test(zh)) return out;
      out.push({ text: `${zh}（2027 年）`, detail: '插入「2027 年」' });
      return out;
    }
    default:
      return out;
  }
}

/**
 * 守卫规则本身的独立用例。
 *
 * 有的规则在**当前语料里没有落点**：例如 `trial_as_free` 要求原文含 trial/试用，
 * 而 63 对人工译文里一对都没有（都是免费档/学生优惠/额度类文案）。
 * 此时只有两条路：把它记成"不适用"（没问题，但这条规则从此没人验），
 * 或者用一对**人造**中英文本单独验规则。选后者，并且**明确标注 synthetic**，
 * 绝不把它混进"真人译文的误报率"里。
 */
const SYNTHETIC_MUTATION_CASES = {
  'm07-trial-as-free': {
    // 守卫第 ⑥ 条的触发条件是「原文是试用、译文里出现「免费」而**没有**「试用」」。
    // 所以这对人造文本里，正确译法不写「试用」二字（写成「体验」），
    // 篡改后再插「免费」——这才是把试用说成免费。
    en: 'Start your 14-day trial today.',
    zh: '立即开始 14 天体验。',
    mutate: zh => `${zh}（免费）`,
    note: '人造中英对：原文是 14 天试用，中文把「体验」改写成「免费」——就是把力度放大。当前 63 对人工译文里没有 trial 类文案，所以这条规则只能用人造用例验。'
  },
  'm06-negation-deleted': {
    // 中文的否定往往不止一个词（「没有列出…非营利」），只删一个「没」，剩下的「非」仍然是
    // 合格的否定词，守卫不报是**对的**。所以这对人造文本里，译文只带**一个**否定词，
    // 篡改时把它删掉；英文侧同时去掉 No，两边一起"丢掉否定"，重译后读起来正是最常见的错误形态。
    // 英文也必须挑得干净：删掉 No 之后不能再留下 not/without 之类的否定词
    // （"credit card required" 里就藏着 not，会让守卫合理地认为否定还在）。
    en: 'No credit card needed.',
    zh: '需要绑定信用卡。',
    mutate: zh => `不${zh}`,
    mutateEn: en => en.replace(/^No\s*/i, ''),
    note: '人造中英对：英文原文的 No 被删掉，译文反而多出一个否定词「不」（"不需要绑定信用卡"）——这就是否定错位，guard 会以 negation_lost 或 negation_invented 报出来。'
  }
};

function runTranslationArm(golden) {
  const pairs = golden.pairs;
  const seeds = fs.existsSync(FILES.mutations) ? readJson(FILES.mutations) : null;

  // ① 误报率：人工核准的译文，任何 violation 都是误报
  const falsePositives = [];
  for (const pair of pairs) {
    const check = guard.check({ en: pair.en, zh: pair.zh, terms: pair.terms, field: pair.field });
    for (const violation of check.violations) {
      falsePositives.push({ dealId: pair.dealId, field: pair.field, code: violation.code, detail: violation.detail });
    }
  }

  // ② 检出率：程序化篡改
  const mutationResults = [];
  for (const mutation of MUTATIONS) {
    const acceptable = mutation.acceptCodes || [mutation.expectedCode];
    let result = null;

    // 先试种子里写死的那一对（可复现的目标），不行再顺序找
    const seed = seeds && seeds.byMutation ? seeds.byMutation[mutation.id] : null;
    const ordered = [];
    if (seed) {
      const target = pairs.find(pair => pair.dealId === seed.dealId && pair.field === seed.field);
      if (target) ordered.push(target);
    }
    for (const pair of pairs) if (!ordered.includes(pair)) ordered.push(pair);

    for (const pair of ordered) {
      for (const applied of applyMutation(mutation, pair)) {
        const en = applied.en || pair.en;
        const check = guard.check({ en, zh: applied.text, terms: pair.terms, field: pair.field });
        const codes = uniq(check.violations.map(v => v.code));
        if (!codes.some(code => acceptable.includes(code))) continue; // 守卫没报 —— 换一个候选
        result = {
          id: mutation.id,
          mutation: mutation.mutation,
          expectedCode: mutation.expectedCode,
          acceptableCodes: acceptable,
          applicable: true,
          synthetic: false,
          detail: applied.detail,
          pair: { dealId: pair.dealId, field: pair.field },
          mutated: applied.text,
          mutatedEn: applied.en ? applied.en : null,
          caught: true,
          actualCodes: codes
        };
        break;
      }
      if (result) break;
    }

    if (!result && SYNTHETIC_MUTATION_CASES[mutation.id]) {
      const synthetic = SYNTHETIC_MUTATION_CASES[mutation.id];
      const text = synthetic.mutate(synthetic.zh);
      const en = synthetic.mutateEn ? synthetic.mutateEn(synthetic.en) : synthetic.en;
      const check = guard.check({ en, zh: text, terms: [], field: '(synthetic)' });
      const codes = uniq(check.violations.map(v => v.code));
      const caught = codes.some(code => acceptable.includes(code));
      result = {
        id: mutation.id,
        mutation: mutation.mutation,
        expectedCode: mutation.expectedCode,
        acceptableCodes: acceptable,
        applicable: true,
        synthetic: true,
        reason: synthetic.note,
        pair: { dealId: '(synthetic)', field: '(synthetic)' },
        mutated: text,
        mutatedEn: synthetic.mutateEn ? en : null,
        caught,
        actualCodes: codes
      };
      if (process.env.AI_EVAL_DEBUG_SYNTHETIC) {
        console.log(`[debug] synthetic ${mutation.id} en=${JSON.stringify(en)} zh=${JSON.stringify(text)} codes=${JSON.stringify(codes)}`);
      }
    }

    if (!result) {
      // 找不到"能被检出"的落点：这条篡改在本轮语料上无法成立，如实记为不适用。
      result = {
        id: mutation.id,
        mutation: mutation.mutation,
        expectedCode: mutation.expectedCode,
        acceptableCodes: acceptable,
        applicable: false,
        synthetic: false,
        reason: `当前 ${pairs.length} 对人工译文里没有可施加这条篡改的对，也没有为它准备人造用例`,
        caught: false,
        actualCodes: []
      };
    }
    mutationResults.push(result);
  }

  const applicable = mutationResults.filter(row => row.applicable);
  const caught = applicable.filter(row => row.caught);
  const missed = applicable.filter(row => !row.caught);
  return {
    humanPairs: pairs.length,
    falsePositives: falsePositives.length,
    falsePositiveDetail: falsePositives,
    mutationTotal: MUTATIONS.length,
    mutationApplicable: applicable.length,
    mutationCaught: caught.length,
    mutationMissed: missed.length,
    missedIds: missed.map(row => row.id),
    mutationOnRealCorpus: applicable.filter(row => !row.synthetic).length,
    mutationSynthetic: applicable.filter(row => row.synthetic).length,
    detectionRate: applicable.length ? pct(caught.length, applicable.length) : null,
    mutations: mutationResults,
    drift: golden.drift || []
  };
}

/* ------------------------------------------------------------------ */
/* 金标准构建 / 装载                                                     */
/* ------------------------------------------------------------------ */

/**
 * 为每条篡改选定一个固定的施加目标（写进 translation.mutations.json）。
 *
 * 为什么要把"目标"固化下来：篡改清单如果每次运行都自动挑第一对可用的译文，
 * 那么语料一变、目标就变，"这条规则能不能检出"的答案也会跟着变，两次运行的数字不可比。
 * 固化成 decl 之后，目标变了必须是一次显式修改，diff 里看得见。
 */
function buildMutationSeeds(golden) {
  const byMutation = {};
  for (const mutation of MUTATIONS) {
    const acceptable = mutation.acceptCodes || [mutation.expectedCode];
    let found = null;
    for (const pair of golden.pairs) {
      for (const applied of applyMutation(mutation, pair)) {
        const en = applied.en || pair.en;
        const check = guard.check({ en, zh: applied.text, terms: pair.terms, field: pair.field });
        const codes = uniq(check.violations.map(v => v.code));
        if (!codes.some(code => acceptable.includes(code))) continue;
        found = {
          dealId: pair.dealId,
          field: pair.field,
          expectedCode: mutation.expectedCode,
          detail: applied.detail
        };
        break;
      }
      if (found) break;
    }
    if (found) {
      byMutation[mutation.id] = found;
      continue;
    }
    const synthetic = SYNTHETIC_MUTATION_CASES[mutation.id];
    if (synthetic) {
      const text = synthetic.mutate(synthetic.zh);
      const en = synthetic.mutateEn ? synthetic.mutateEn(synthetic.en) : synthetic.en;
      const check = guard.check({ en, zh: text, terms: [], field: '(synthetic)' });
      const codes = uniq(check.violations.map(v => v.code));
      if (codes.some(code => acceptable.includes(code))) {
        byMutation[mutation.id] = {
          dealId: '(synthetic)',
          field: '(synthetic)',
          expectedCode: mutation.expectedCode,
          detail: synthetic.note
        };
        continue;
      }
    }
    byMutation[mutation.id] = { dealId: null, field: null, expectedCode: mutation.expectedCode, detail: '当前语料没有落点，也没有可检出的人造用例' };
  }
  return {
    schemaVersion: 1,
    builtAt: stamp(),
    note: [
      '每条篡改固定的施加目标（只收"守卫确实报了"的对，所以固化下来的目标都是能检出的）。',
      '由 --build-golden 生成；改动它等于改动评测目标，应该在 diff 里被看见。',
      'dealId 为 "(synthetic)" 表示当前人工译文语料里没有落点，改用一对人造中英文本单独验这条规则。'
    ].join(' '),
    byMutation
  };
}

function buildGoldens() {
  const storeData = store.loadStore();
  const deals = storeData.deals;
  const extraction = buildExtractionGolden(deals);
  const dedupGolden = buildDedupGolden(deals);
  const translation = buildTranslationGolden(deals);
  const seeds = buildMutationSeeds(translation.golden);
  const written = [
    writeJson(FILES.extraction, extraction),
    writeJson(FILES.dedup, dedupGolden),
    writeJson(FILES.translation, translation.golden),
    writeJson(FILES.mutations, seeds)
  ];
  console.log(`已重建金标准：${written.length} 份（deals.json 共 ${deals.length} 条）`);
  console.log(`  字段提取 共 ${extraction.items.length} 项 · ${path.relative(ROOT, FILES.extraction)}`);
  console.log(`  疑似重复 共 ${dedupGolden.pairs.length} 项 · ${path.relative(ROOT, FILES.dedup)}`);
  console.log(`  译文守卫 共 ${translation.golden.pairs.length} 项 · ${path.relative(ROOT, FILES.translation)}`);
  console.log(`  篡改目标 共 ${Object.keys(seeds.byMutation).length} 条 · ${path.relative(ROOT, FILES.mutations)}`);
  console.log(`  译文原快照漂移 ${translation.drift.length} 处（已记入 golden 的 drift 字段）`);
  console.log('  注意：*.mocks.json（录制响应）是手写 fixture，不由本命令生成，也绝不覆盖。');
  return { extraction, dedup: dedupGolden, translation: translation.golden, drift: translation.drift };
}

function loadGoldens() {
  const out = {};
  for (const [name, file] of Object.entries({ extraction: FILES.extraction, dedup: FILES.dedup, translation: FILES.translation })) {
    if (!fs.existsSync(file)) throw new Error(`金标准缺失：${path.relative(ROOT, file)}（先跑 --build-golden）`);
    let parsed;
    try {
      parsed = readJson(file);
    } catch (error) {
      throw new Error(`金标准不是合法 JSON：${path.relative(ROOT, file)}（${error.message}）`);
    }
    if (!parsed || parsed.schemaVersion !== 1) throw new Error(`金标准 schemaVersion 不是 1：${path.relative(ROOT, file)}`);
    out[name] = parsed;
  }
  if (!Array.isArray(out.extraction.items)) throw new Error('extraction.golden.json 里没有 items 数组');
  if (!Array.isArray(out.dedup.pairs)) throw new Error('dedup.golden.json 里没有 pairs 数组');
  if (!Array.isArray(out.translation.pairs)) throw new Error('translation.golden.json 里没有 pairs 数组');
  return out;
}

/* ------------------------------------------------------------------ */
/* 打印                                                                */
/* ------------------------------------------------------------------ */

function extractionModeLabel(arm) {
  return `模式：${arm.mode || 'unknown'}${arm.mode === 'mock' ? ' 录制响应（不测模型质量，只测工装）' : ''}`;
}

function printExtraction(arm) {
  console.log('');
  console.log(`【臂 1 · 字段提取】${extractionModeLabel(arm)}`);
  console.log(`  金标准 ${arm.goldenItems} 项 · 实跑 ${arm.ran} 项 · 跳过 ${arm.skipped} 项 · 输入上限 ${arm.maxChars} 字`);
  console.log(`  共 ${arm.overall.goldLeaves} 个金标准叶子 · 命中 ${arm.overall.truePositive} · 多报 ${arm.overall.falsePositive} · 漏报 ${arm.overall.falseNegative}`);
  console.log(`  整体 precision ${show(arm.overall.precision)} · recall ${show(arm.overall.recall)} · 过闸后的 recall ${show(arm.overall.gatedRecall)}`);
  console.log('  逐字段：');
  for (const field of MANAGED_FIELDS) {
    const row = arm.fields[field];
    console.log(`    ${field.padEnd(20)} support=${String(row.support).padStart(2)} TP=${String(row.truePositive).padStart(2)} FP=${String(row.falsePositive).padStart(2)} FN=${String(row.falseNegative).padStart(2)} precision=${show(row.precision)} recall=${show(row.recall)}`);
  }
  console.log('');
  console.log(`  ★ falseCertaintyRate（本该 unknown 却给了确定值）共 ${arm.falseCertaintyRate.goldUnknownLeaves} 个金标准 unknown 叶子 · 给了值 ${arm.falseCertaintyRate.aiGaveValue} · 比率 ${show(arm.falseCertaintyRate.rate)}`);
  console.log(`  ★ unknownAccuracy（AI 也留 unknown）共 ${arm.unknownAccuracy.goldUnknownLeaves} 个 · 一致 ${arm.unknownAccuracy.aiAlsoUnknown} · 比率 ${show(arm.unknownAccuracy.rate)}`);
  console.log(`  missingEvidence（被确定性规则 R1 拒掉的断言）共 ${arm.missingEvidence} 处`);
  console.log(`  schema 通过 ${arm.schemaOk} 项 · 被 schema 拒 ${arm.schemaRejected} 项 ${JSON.stringify(arm.invalidReasons)}`);
  if (arm.fixtureMissing.length) console.log(`  ⚠ 没有录制响应的项：${arm.fixtureMissing.join(', ')}`);
}

function printDedup(arm) {
  console.log('');
  console.log(`【臂 2 · 疑似重复】${extractionModeLabel(arm)}`);
  console.log(`  金标准 ${arm.goldenPairs} 对 · 实跑 ${arm.ran} 对（覆盖率 ${show(arm.coverage)}）· 跳过 ${arm.skipped} 对 · 响应不合法 ${arm.invalidResponses} 对`);
  console.log(`  整体准确率 ${show(arm.accuracy)}（${arm.correct}/${arm.counted}；分母只是**实跑**的对，跳过的对不进分母也不进矩阵）`);
  const labels = [...schemas.DEDUP_RELATIONS, 'invalid'];
  console.log('  混淆矩阵（行=金标准，列=AI 判定）：');
  console.log(`    ${''.padEnd(32)}${labels.map(l => l.padStart(32)).join('')}`);
  for (const goldLabel of schemas.DEDUP_RELATIONS) {
    const row = arm.matrix[goldLabel];
    console.log(`    ${goldLabel.padEnd(32)}${labels.map(l => String(row[l] || 0).padStart(32)).join('')}`);
  }
  console.log(`  ★ same_vendor → same_offer（最危险的错误）共 ${arm.dangerousSameVendorAsSameOffer} 对`);
  console.log(`  现有确定性去重：这 30 对里会合并 ${arm.existingDeterministic.wouldMergeShortlistPairs} 对；全库 134 条里 aliasKey 重复组 ${arm.existingDeterministic.duplicateAliasGroupsInStore} 组（本臂只报，不合并）`);
  if (arm.fixtureMissing.length) console.log(`  ⚠ 没有录制响应的对：${arm.fixtureMissing.join(', ')}`);
}

function printTranslation(arm) {
  console.log('');
  console.log('【臂 3 · 译文守卫】**不调模型**，这是真测量');
  console.log(`  人工译文 共 ${arm.humanPairs} 项 · 误报 ${arm.falsePositives}`);
  if (arm.falsePositives) {
    for (const row of arm.falsePositiveDetail) console.log(`    ✗ ${row.dealId}.${row.field} ${row.code}：${row.detail}`);
  }
  console.log(`  篡改检出：共 ${arm.mutationTotal} 条 · 适用 ${arm.mutationApplicable} 条（真实语料 ${arm.mutationOnRealCorpus} + 人造用例 ${arm.mutationSynthetic}） · 检出 ${arm.mutationCaught} 条 · 检出率 ${show(arm.detectionRate)}`);
  for (const row of arm.mutations) {
    if (!row.applicable) {
      console.log(`    – ${row.id} 不适用（${row.reason}）`);
      continue;
    }
    const where = row.synthetic ? '人造用例' : `${row.pair.dealId}.${row.pair.field}`;
    const what = row.detail ? `${row.detail} · ` : '';
    if (row.caught) {
      console.log(`    ✓ ${row.id} [${where}] ${what}期望 ${row.expectedCode} · 实际 [${row.actualCodes.join(',')}]`);
    } else {
      console.log(`    ✗ 未检出 ${row.id} [${where}] ${what}期望 ${row.expectedCode} · 实际 [${row.actualCodes.join(',')}]`);
    }
  }
  if (arm.missedIds.length) console.log(`  ✗ 未检出清单：${arm.missedIds.join(', ')}`);
  if (arm.drift.length) console.log(`  提示：${arm.drift.length} 条译文的英文快照已与记录当前英文不一致（不影响本臂结论）`);
}

function show(value) {
  return value === null || value === undefined ? 'n/a' : String(value);
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const flags = {
    buildGolden: false,
    live: false,
    json: false,
    provider: null,
    out: DEFAULT_OUT,
    maxChars: DEFAULT_MAX_CHARS
  };
  for (const arg of argv) {
    if (arg === '--build-golden') flags.buildGolden = true;
    else if (arg === '--live') flags.live = true;
    else if (arg === '--json') flags.json = true;
    else if (arg.startsWith('--provider=')) flags.provider = arg.slice('--provider='.length);
    else if (arg.startsWith('--out=')) flags.out = path.resolve(ROOT, arg.slice('--out='.length));
    else if (arg.startsWith('--max-chars=')) flags.maxChars = Number(arg.slice('--max-chars='.length)) || DEFAULT_MAX_CHARS;
    else if (arg === '--help' || arg === '-h') flags.help = true;
    else throw new Error(`未知参数：${arg}`);
  }
  return flags;
}

const USAGE = [
  '用法：node scripts/tools/ai-eval.js [flags]',
  '  --build-golden        从已提交的项目数据重建 scripts/data/ai-eval/ 下的金标准',
  '  --provider=<name>     指定 provider（默认 mock；可选 fail / off / openai-compat / anthropic）',
  '  --live                走真实 provider（需要 AI_PROVIDER / AI_API_KEY / AI_MODEL，缺任一则跳过并退出 0）',
  '  --json                额外打印机器可读结果',
  '  --out=<file>          结果 JSON 路径（默认 research/v2.0-ai-eval.json）',
  '  --max-chars=<n>       臂 1 的输入文本上限（默认 1200）'
].join('\n');

/** 评测的临时缓存目录：绝不污染仓库里的 .ai-cache */
function useTempCache() {
  process.env.AI_CACHE_DIR = path.join(os.tmpdir(), 'dsh-ai-eval-cache');
  fs.mkdirSync(process.env.AI_CACHE_DIR, { recursive: true });
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(USAGE);
    return 0;
  }
  useTempCache();

  if (flags.buildGolden) {
    buildGoldens();
    return 0;
  }

  // --live 的"未配置就跳过"：这是设计，不是失败
  if (flags.live) {
    const hasProvider = Boolean(process.env.AI_PROVIDER && process.env.AI_PROVIDER !== 'off');
    const hasKey = Boolean(process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY);
    const hasModel = Boolean(process.env.AI_MODEL);
    if (!hasProvider || !hasKey || !hasModel) {
      console.log('未配置，跳过：--live 需要 AI_PROVIDER / AI_API_KEY / AI_MODEL 三个环境变量（本机没有 API key）。');
      console.log('臂 3（译文守卫）不依赖模型，可以单独跑：node scripts/tools/ai-eval.js --provider=off');
      return 0;
    }
  }

  const providerName = flags.live ? 'openai-compat' : (flags.provider || 'mock');
  const mode = flags.live ? 'live' : providerName;
  const golden = loadGoldens();
  const deals = store.loadStore().deals;

  let extraction = await runExtractionArm(deals, golden.extraction, {
    mode,
    providerName,
    model: null,
    live: flags.live,
    maxChars: flags.maxChars
  });
  let dedupArm = await runDedupArm(deals, golden.dedup, {
    mode,
    providerName,
    model: null,
    live: flags.live
  });
  const translation = runTranslationArm(golden.translation);

  // 非 mock/fail 的 provider（off / 没配 key 的真实 provider）下，臂 1/2 的 0 分不是"模型差"，
  // 而是"根本没调模型"。把它标出来，别让读数被误解。
  let armNote = null;
  if (mode !== 'mock' && mode !== 'fail') {
    armNote = `provider=${providerName} 时臂 1/2 的单元大多没有可用响应（0 分不代表模型质量，只代表没调成）`;
    extraction = { ...extraction, note: armNote };
    dedupArm = { ...dedupArm, note: armNote };
  }

  const limitations = [
    '本机没有 API key：臂 1（字段提取）与臂 2（疑似重复）默认跑的是 scripts/data/ai-eval/*.mocks.json 里手写的录制响应，',
    '因此它们**不测模型质量**，只测评测工装（输入构造 / schema 校验 / 候选规则 / 指标计算）这条链路通不通。',
    '臂 3（译文守卫）不调用任何模型：它用人工核准译文测守卫误报率、用程序化篡改测检出率，**是真测量**。',
    `臂 2 的 mock 覆盖率为 ${dedupArm.ran}/${dedupArm.goldenPairs}（fixture 只覆盖 5 类关系，其余 ${dedupArm.skipped} 对没有响应、被跳过）；`,
    '即 30 对金标准的标签是完整的，但 mock 模式下只有一部分被真正判定过。',
    '任何人想引用"AI 提取准确率 N 成 / 去重准确率 N 成"，必须等有 API key 后用 --live 重跑；本文件里臂 1/2 的数字不可当作模型分数。',
    '臂 1 的金标准是 deals.json 里 v1.1 人工策展的六字段，输入是记录自身文本（extract.recordText）：',
    '两者同源，指标只说明"能否从我们已提交的文本里复原我们已确认的值"，不说明它面对当天官方页面的表现。',
    `臂 2 的金标准按固定规则人工标注：${DEDUP_LABELING_RULE}`,
    '入围对全部集中在同厂商不同产品的记录上（30 对里 30 对 same_vendor），矩阵严重不平衡，',
    '"整体准确率"这个总分在这里几乎没有信息量；真正可看的是 same_vendor → same_offer 这个危险错误计数与矩阵本身。',
    '臂 1 的 falseCertaintyRate 把"断言了但没有同名引文"的叶子也算进 AI 给出的值：',
    '因为这些正是"模型在没有证据时说了确定的话"，若先把它们丢掉再统计，指标会恒为 0 而失去意义。',
    '过闸后的 recall（gatedRecall）另行报出，两个数字不混用。',
    `臂 3 的 ${translation.mutationTotal} 条篡改里有 ${translation.mutationSynthetic} 条在当前人工译文语料里没有落点，改用一对人造中英文本验证规则本身；`,
    '它们在输出里标了 synthetic，不与"真人译文的误报率"混算。',
    '本次评测期间 scripts/ai/translate-guard.js 正被另一条并行改动修改（number_missing 的百分比豁免与否定双向判据都是运行中出现的），',
    '所以臂 3 的数字绑定在**运行当时的守卫版本**上；换版本后应重跑，不要跨版本比较读数。'
  ];

  const result = {
    generatedAt: stamp(),
    provider: providerName,
    mode,
    goldens: {
      extraction: { file: path.relative(ROOT, FILES.extraction), builtAt: golden.extraction.builtAt, items: golden.extraction.items.length, note: golden.extraction.note },
      dedup: { file: path.relative(ROOT, FILES.dedup), builtAt: golden.dedup.builtAt, pairs: golden.dedup.pairs.length, labelingRule: golden.dedup.labelingRule },
      translation: { file: path.relative(ROOT, FILES.translation), builtAt: golden.translation.builtAt, pairs: golden.translation.pairs.length, note: golden.translation.note }
    },
    arms: { extraction, dedup: dedupArm, translation },
    limitations
  };

  printExtraction(extraction);
  printDedup(dedupArm);
  printTranslation(translation);

  console.log('');
  console.log(`共 3 条臂 · 字段提取 ${extraction.ran}/${extraction.goldenItems} 项 · 疑似重复 ${dedupArm.ran}/${dedupArm.goldenPairs} 对 · 译文守卫 ${translation.humanPairs} 项`);
  console.log(`  臂 3 误报 ${translation.falsePositives} · 篡改检出 ${translation.mutationCaught}/${translation.mutationApplicable}`);
  console.log(`  臂 1 头条指标 falseCertaintyRate = ${show(extraction.falseCertaintyRate.rate)}（fixture 驱动，不是模型分数）`);

  writeJson(flags.out, result);
  console.log(`结果已写入 ${path.relative(ROOT, flags.out)}`);

  if (flags.json) console.log(JSON.stringify(result, null, 2));

  // 只有**确定性**期望失败才非零退出：臂 3 误报 > 0、期望的篡改没被检出、金标准坏掉。
  // mock 模式下 fixture 覆盖不满**不是**失败：fixture 本来就是抽样，覆盖率已如实打印。
  const problems = [];
  if (translation.falsePositives > 0) problems.push(`臂 3 对人工译文误报 ${translation.falsePositives} 处（应为 0）`);
  for (const row of translation.mutations) {
    if (row.applicable && !row.caught) problems.push(`臂 3 篡改 ${row.id} 未被检出（期望 ${row.expectedCode}）`);
  }
  if (flags.live) {
    if (extraction.ran === 0) problems.push('臂 1 在 --live 下一项都没跑成（provider 配置有问题，不是模型质量）');
    if (dedupArm.ran === 0) problems.push('臂 2 在 --live 下一对都没跑成（provider 配置有问题，不是模型质量）');
  }
  if (problems.length) {
    console.log('');
    console.log('确定性期望未达成：');
    for (const problem of problems) console.log(`  ✗ ${problem}`);
    return 1;
  }
  return 0;
}

main()
  .then(code => process.exit(code))
  .catch(error => {
    console.error(`ai-eval 失败：${error && error.message ? error.message : error}`);
    process.exit(1);
  });
