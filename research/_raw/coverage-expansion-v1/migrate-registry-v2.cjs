#!/usr/bin/env node
/**
 * coverage-expansion-v1 · 一次性迁移脚本（captain 持有，可复跑、幂等）。
 *
 * 作用：把 registry **来源层**从 v1 迁到 v2，产出的是「字段契约变化」，不是「新事实」：
 *   1. `scripts/data/models.json` 每条补 `modelRole` / `releasedAt` / `releaseEvidence` / `freshnessGroup`，
 *      值来自 t10 的调查产物 `research/_raw/coverage-expansion-v1/currentness.json`；
 *   2. `scripts/data/model-registry-links.json` 与 `scripts/data/model-registry-gaps.json`
 *      顶层 `schemaVersion` 1 → 2；
 *   3. 之后由 `npm run models:rebuild` 重新派生 root 的 `models.json` / `model-registry-links.json`。
 *
 * 三条纪律：
 *   · **不猜**：currentness.json 里 releasedAt=null 的就写 null（40 条），绝不回退 firstSeen、
 *     绝不用版本号或今天补一个日期；
 *   · **词表投影是显式的**：t10 的调查词表（llm/vlm/… 9 值）通过下面这张**写死的映射表**
 *     投到正式枚举（题面 §16 的 10 值）。映射表里没有的值 ⇒ 报错停下，不静默兜底；
 *   · **幂等**：字段已存在就只做必要的值/顺序修正；重复运行不产生额外变化。
 *
 * 用法：
 *   node scripts/tmp-migrate-registry-v2.cjs --dry-run
 *   node scripts/tmp-migrate-registry-v2.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MODELS_FILE = path.join(ROOT, 'scripts', 'data', 'models.json');
const LINKS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-links.json');
const GAPS_FILE = path.join(ROOT, 'scripts', 'data', 'model-registry-gaps.json');
const CURRENTNESS_FILE = path.join(ROOT, 'research', '_raw', 'coverage-expansion-v1', 'currentness.json');

const reg = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));

const DRY_RUN = process.argv.includes('--dry-run');
const SCHEMA_VERSION = 2;

/**
 * 调查词表 → 正式枚举的**显式映射**（唯一出处，写死在这里）。
 * 组合维度必须拆开：`translation-lite` 不是 role，而是「翻译」+ 低延迟档；
 * 落到这一层时只能取能力位本身（translation），不能把档位信息塞进 role。
 */
const ROLE_PROJECTION = {
  'llm': 'general',
  'small-fast-variant': 'fast',
  'code-specialist': 'coding',
  'vlm': 'vision',
  'multimodal-llm': 'vision',
  'retrieval-embedding': 'embedding',
  'translation': 'translation',
  'translation-lite': 'translation',
  'roleplay': 'other',
  // 已经是正式枚举的值（幂等：重复运行时不报错）
  'general': 'general',
  'fast': 'fast',
  'reasoning': 'reasoning',
  'coding': 'coding',
  'vision': 'vision',
  'embedding': 'embedding',
  'audio': 'audio',
  'realtime': 'realtime',
  'other': 'other'
};

const problems = [];
function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`${label}: 读取/解析失败 ${error.message}`);
    return null;
  }
}

/** 按 ENTRY_KEY_ORDER 重排一条来源层条目（v2 字段值缺失时给合法缺省） */
function orderEntry(entry) {
  const out = {};
  for (const key of reg.ENTRY_KEY_ORDER) {
    if (key === 'modelRole') out[key] = entry.modelRole === undefined ? null : entry.modelRole;
    else if (key === 'releasedAt') out[key] = entry.releasedAt === undefined ? null : entry.releasedAt;
    else if (key === 'releaseEvidence') out[key] = Array.isArray(entry.releaseEvidence) ? entry.releaseEvidence : (entry.releaseEvidence === undefined || entry.releaseEvidence === null ? [] : null);
    else if (key === 'freshnessGroup') out[key] = entry.freshnessGroup === undefined ? null : entry.freshnessGroup;
    else out[key] = entry[key] === undefined ? null : entry[key];
  }
  return out;
}

/**
 * 官方引文的**逐字节选**：`releaseEvidence.quote` 的上限是 200 字（`model-registry.js` 的
 * `MAX_QUOTE` = provenance.MAX_EVIDENCE_QUOTE_LENGTH），超限**不许截断**（截断过的原话就不是原话了）。
 *
 * 处理方式：从 t10 的长引文里取出**决定性那一句**（仍逐字来自同一官方页面），
 * 完整引文留在 `research/_raw/coverage-expansion-v1/currentness.json` 与
 * `research/coverage-expansion-v1-model-currentness.md` 里可查。
 * 这里逐条写死（而不是写"取前 N 字"的算法）—— 哪一句是决定性的，是人的判断。
 */
const QUOTE_EXCERPT = {
  'deepseek-flash': '「### DeepSeek-V4.1-Flash Release / Today, we officially release the DeepSeek-V4.1-Flash model. It is the smallest model in our new architecture family, with native multimodal visual understanding.」',
  'deepseek-v4-pro': '「### DeepSeek-V4-Pro Update / The GA release of DeepSeek-V4-Pro has been rolled out on the APP, Web, and API.」'
};

/**
 * 把 t10 的 releaseEvidence 折成 schema 要求的形状。
 *
 * 契约（`model-registry.js` 的 `RELEASE_EVIDENCE_KEY_ORDER`）**逐字**是
 * `{ field, quote, sourceUrl, capturedAt }` —— 与 `provenance.normalizeEvidenceItem()`
 * 产出的形态同一套（引文只有一个形态，四层不各造一份），且 `field` 在这一格恒为 `releasedAt`。
 * 键序即契约（原样进派生产物），所以这里是**显式构造**而不是对象展开。
 */
function evidenceArrayOf(row, where) {
  if (row.releasedAt === null || row.releasedAt === undefined) return [];
  const raw = row.releaseEvidence;
  if (!raw || typeof raw !== 'object') {
    problems.push(`${where}: 有 releasedAt(${row.releasedAt}) 却没有 releaseEvidence 对象`);
    return [];
  }
  const sourceUrl = raw.sourceUrl;
  const quote = QUOTE_EXCERPT[row.slug] || raw.quote;
  const capturedAt = String(raw.capturedAt || '').slice(0, 10);
  if (!sourceUrl) problems.push(`${where}: releaseEvidence 缺 sourceUrl`);
  if (!quote) problems.push(`${where}: releaseEvidence 缺 quote`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedAt)) problems.push(`${where}: releaseEvidence 的 capturedAt 不是 YYYY-MM-DD（${raw.capturedAt}）`);
  const length = Array.from(String(quote || '')).length;
  if (length > 200) problems.push(`${where}: 引文 ${length} 字，超过 200 字上限（要节选决定性那一句，不许截断）`);
  return [{
    field: 'releasedAt',
    quote: String(quote || ''),
    sourceUrl: String(sourceUrl || ''),
    capturedAt
  }];
}

function main() {
  const currentness = readJson(CURRENTNESS_FILE, 'currentness.json');
  const modelsDoc = readJson(MODELS_FILE, 'scripts/data/models.json');
  const linksDoc = readJson(LINKS_FILE, 'scripts/data/model-registry-links.json');
  const gapsDoc = readJson(GAPS_FILE, 'scripts/data/model-registry-gaps.json');
  if (problems.length) {
    problems.forEach(p => console.error(`  - ${p}`));
    return 1;
  }

  const rows = currentness.models;
  const slugs = Object.keys(modelsDoc).filter(key => !key.startsWith('_'));
  const projected = {};
  const unmappedRoles = new Set();

  for (const slug of slugs) {
    const row = rows[slug];
    if (!row) { problems.push(`currentness.json 缺少 slug「${slug}」的调查结论`); continue; }
    const canonical = ROLE_PROJECTION[row.modelRole];
    if (!canonical) { unmappedRoles.add(row.modelRole); continue; }
    projected[slug] = {
      modelRole: canonical,
      releasedAt: row.releasedAt === undefined ? null : row.releasedAt,
      releaseEvidence: evidenceArrayOf(row, slug),
      freshnessGroup: row.freshnessGroup === undefined ? null : row.freshnessGroup
    };
    if (!reg.MODEL_ROLES.includes(canonical)) problems.push(`${slug}: 投影后的 role「${canonical}」不在正式枚举里`);
  }
  if (unmappedRoles.size) problems.push(`调查词表里有未登记映射的 role：${[...unmappedRoles].join(' / ')}（映射表必须显式覆盖，不许静默兜底）`);
  if (problems.length) {
    console.error(`❌ 迁移前的对账失败（${problems.length} 处），未写盘：`);
    problems.slice(0, 20).forEach(p => console.error(`  - ${p}`));
    return 1;
  }

  // ---- 1) 来源层 models.json ----
  const nextModels = {};
  for (const key of Object.keys(modelsDoc)) {
    if (key.startsWith('_')) { nextModels[key] = modelsDoc[key]; continue; }
    const entry = modelsDoc[key];
    const add = projected[key] || { modelRole: null, releasedAt: null, releaseEvidence: [], freshnessGroup: null };
    nextModels[key] = orderEntry({ ...entry, ...add });
  }

  // ---- 2) 关系层与处置登记：只动顶层 schemaVersion ----
  const nextLinks = { ...linksDoc, schemaVersion: SCHEMA_VERSION };
  const nextGaps = { ...gapsDoc, schemaVersion: SCHEMA_VERSION };

  const modelsText = `${JSON.stringify(nextModels, null, 2)}\n`;
  const linksText = `${JSON.stringify(nextLinks, null, 2)}\n`;
  const gapsText = `${JSON.stringify(nextGaps, null, 2)}\n`;

  const before = {
    models: fs.readFileSync(MODELS_FILE, 'utf8'),
    links: fs.readFileSync(LINKS_FILE, 'utf8'),
    gaps: fs.readFileSync(GAPS_FILE, 'utf8')
  };

  const dated = slugs.filter(slug => projected[slug] && projected[slug].releasedAt).length;
  const roleCensus = {};
  for (const slug of slugs) {
    const role = projected[slug] ? projected[slug].modelRole : '(无)';
    roleCensus[role] = (roleCensus[role] || 0) + 1;
  }

  console.log('=== registry v1 → v2 迁移 ===');
  console.log(`  模型条数            : ${slugs.length}`);
  console.log(`  有官方发布日期      : ${dated} 条（其余 ${slugs.length - dated} 条如实为 null）`);
  console.log(`  role 投影分布       : ${Object.entries(roleCensus).sort().map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  console.log(`  models.json 变化    : ${before.models !== modelsText ? '需要写盘' : '与盘上一致'}`);
  console.log(`  links schemaVersion : ${linksDoc.schemaVersion} → ${SCHEMA_VERSION}`);
  console.log(`  gaps  schemaVersion : ${gapsDoc.schemaVersion} → ${SCHEMA_VERSION}`);

  if (DRY_RUN) {
    console.log('\n--dry-run：没有写盘。');
    return 0;
  }

  fs.writeFileSync(MODELS_FILE, modelsText, 'utf8');
  fs.writeFileSync(LINKS_FILE, linksText, 'utf8');
  fs.writeFileSync(GAPS_FILE, gapsText, 'utf8');
  console.log('\n✅ 已写盘三份来源层文件。下一步：npm run models:rebuild && npm run check:models:reproducible && node scripts/validate.js --strict');
  return 0;
}

process.exit(main());
