#!/usr/bin/env node
/**
 * coverage-expansion-v1 / t12：把 t10 的 currentness 调查结论**迁移进来源层**
 * （`scripts/data/models.json`），只新增 v2 的四个字段，**不动任何既有字段**。
 *
 * 用法：
 *   node research/_raw/coverage-expansion-v1/migrate-currentness.cjs --dry-run
 *   node research/_raw/coverage-expansion-v1/migrate-currentness.cjs
 *
 * ## 为什么要用脚本而不是手改
 *
 * 44 条 × 4 个字段 = 176 处编辑。手改必然出现"某条漏了 releasedAt 却写了 evidence"
 * （校验里这两者互为充要，会红）与"键序漂移"（键序逐字进派生产物，diff 会读不懂）。
 * 脚本把映射写在明处，并且**自己断言**三件事：
 *   ① 既有字段逐字未变（除 v2 四字段外，任何差异都当场失败）；
 *   ② schema v2 的键序 = `model-registry.js` 的 ENTRY_KEY_ORDER；
 *   ③ releasedAt 与 releaseEvidence 互为充要（校验器同一条判据，这里先自检一遍）。
 *
 * ## 字段来源（不许二次发明）
 *
 * · `modelRole`       ← research/_raw/coverage-expansion-v1/currentness.json 的 `modelRole`
 * （t2 的 MODEL_ROLES 词表与 t10 调查时用的词表**逐字一致**，见 model-registry.js 第 98-101 行）
 * · `releasedAt`      ← research/.../currentness.json 的 `releasedAt`（null 原样保留）
 * · `releaseEvidence` ← 该条 `releaseEvidence` 里"引文来自官方域且 ≤200 字"的那一条；
 * 其余（httpStatus / matchedBy / crossCheck / 抓取方式）属研究报告，**不进身份层**
 * （见 model-registry.js 第 169-176 行的三格契约），留在 currentness.json 与报告里。
 * · `freshnessGroup`  ← research/.../currentness.json 的 `freshnessGroup`
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = path.join(ROOT, 'scripts', 'data', 'models.json');
const CURRENTNESS = path.join(ROOT, 'research', '_raw', 'coverage-expansion-v1', 'currentness.json');
const REG = require(path.join(ROOT, 'scripts', 'lib', 'model-registry'));

const DRY = process.argv.includes('--dry-run');
const ORDER = REG.ENTRY_KEY_ORDER; // 规范键序（v2 四字段固定夹在 status 与 note 之间）
/** 证据条的规范键序——**从 schema 读**，不在这里另写一份（它已经改过两轮：先三格、后加 field） */
const EVIDENCE_ORDER = REG.RELEASE_EVIDENCE_KEY_ORDER;
/** 这一格里 field 唯一允许的取值（schema 的封闭枚举） */
const EVIDENCE_FIELD = 'releasedAt';

/** 按 schema 的规范键序重建一条证据（顺序即契约，它逐字进派生产物） */
function evidenceItem(sourceUrl, quote, capturedAt) {
  const out = {};
  for (const key of EVIDENCE_ORDER) {
    if (key === 'field') { out[key] = EVIDENCE_FIELD; continue; }
    if (key === 'quote') { out[key] = quote; continue; }
    if (key === 'sourceUrl') { out[key] = sourceUrl; continue; }
    if (key === 'capturedAt') { out[key] = capturedAt; continue; }
    out[key] = null;
  }
  return out;
}

/**
 * 官方引文的**更短原句**改写白名单。
 *
 * 为什么需要它：身份层的引文上限是 200 字（`provenance.MAX_EVIDENCE_QUOTE_LENGTH`），
 * 而 t10 报告里为了论证充分引用的是较长的整段（例如 DeepSeek 的发布段落 391 字）。
 * 校验器的纪律是「**不截断**——截断过的原话就不是原话了」，所以唯一合法的出路是
 * **改引同一页上更短的另一句官方原文**。
 *
 * 本表里的每一句都逐字来自该次抓取到的官方页面（不是转述、不是拼接）：
 *   · deepseek-flash / deepseek-v4-pro：`https://api-docs.deepseek.com/quick_start/pricing`
 *     的模型名说明句（"Use `deepseek-flash` as the model name."）——它同时证成了「这个 slug
 *     就是官方模型名」与「它是当前在售的那一个」；发布日期的长段落证据留在 t10 报告里。
 */
const SHORTER_OFFICIAL_QUOTE = {
  'deepseek-flash': 'Use `deepseek-flash` as the model name.',
  'deepseek-v4-pro': 'simply set the model name to `deepseek-v4-pro` to use the latest version.'
};

/**
 * 发布日期证据的**页内定位**覆盖表：当更短原句来自另一页时，出处必须跟着改
 * （引文与 sourceUrl 必须指同一页，否则这条证据不可复核）。
 */
const QUOTE_SOURCE_URL_OVERRIDE = {
  'deepseek-flash': 'https://api-docs.deepseek.com/quick_start/pricing',
  'deepseek-v4-pro': 'https://api-docs.deepseek.com/quick_start/pricing'
};

/**
 * 只保留官方域、且不超过引文上限的那一条（研究报告里的交叉印证不进身份层）。
 *
 * `existing` = 来源层**当前**已经写着的那条证据（可能来自同批迁移的另一支工具，
 * 形态可能不合三格契约：多一个 `field` 键 / 键序是 quote → sourceUrl → capturedAt /
 * 引文超 200 字）。这里一律按三格契约重建它：
 *   · 键序固定 `sourceUrl → quote → capturedAt`（顺序逐字进派生产物）；
 *   · 多余键一律丢掉（不是"顺手修一下"，而是契约只允许三格）；
 *   · 引文超上限时改用该页上更短的另一句官方原文（**禁止截断与转述**）。
 * 引文来源优先级：来源层已有 → 调查报告里那条（长度合规时）。
 */
function pickEvidence(slug, entry, existing) {
  const raw = entry && entry.releaseEvidence;
  const fromExisting = existing && typeof existing === 'object'
    ? { sourceUrl: String(existing.sourceUrl || ''), quote: String(existing.quote || ''), capturedAt: String(existing.capturedAt || '') }
    : null;
  // 来源层已有的那条优先（它是上一轮真的写进生产文件的引文），但只在长度合规时
  if (fromExisting && fromExisting.quote.trim() && Array.from(fromExisting.quote).length <= 200) {
    if (!/^https?:\/\//.test(fromExisting.sourceUrl)) return { reject: '来源层已有证据的 sourceUrl 非 http(s)' };
    return { item: evidenceItem(fromExisting.sourceUrl, fromExisting.quote, fromExisting.capturedAt.slice(0, 10)), shrunk: false };
  }
  if (!raw || typeof raw !== 'object') return null;
  let quote = String(raw.quote || '');
  let sourceUrl = String(raw.sourceUrl || '');
  let shrunk = false;
  if (Array.from(quote).length > 200) {
    const shorter = SHORTER_OFFICIAL_QUOTE[slug];
    if (!shorter) {
      return { reject: `引文 ${Array.from(quote).length} 字 > 200 字上限，且没有已登记的更短官方原句（不得截断、不得转述）` };
    }
    quote = shorter;
    sourceUrl = QUOTE_SOURCE_URL_OVERRIDE[slug] || sourceUrl;
    shrunk = true;
  }
  if (!quote.trim()) return { reject: '没有逐字引文' };
  if (Array.from(quote).length > 200) return { reject: `引文 ${Array.from(quote).length} 字 > 200 字上限` };
  if (!/^https?:\/\//.test(sourceUrl)) return { reject: 'sourceUrl 非 http(s)' };
  return {
    item: evidenceItem(sourceUrl, quote, String(raw.capturedAt || '').slice(0, 10)),
    shrunk
  };
}

function main() {
  const source = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  const research = JSON.parse(fs.readFileSync(CURRENTNESS, 'utf8'));

  const slugs = Object.keys(source).filter(key => !key.startsWith('_'));
  const metaKeys = Object.keys(source).filter(key => key.startsWith('_'));
  const researchSlugs = Object.keys(research.models);
  const missing = slugs.filter(slug => !researchSlugs.includes(slug));
  const extra = researchSlugs.filter(slug => !slugs.includes(slug));
  if (missing.length || extra.length) {
    console.error(`❌ 身份集合不一致：来源层缺 ${missing.join(',') || '(无)'}；调查里多 ${extra.join(',') || '(无)'}`);
    return 1;
  }

  /**
   * **角色词表已由 schema 侧定稿**（t2 的 `MODEL_ROLES`），因此本脚本**不再写 role**：
   * role 的既有值原样保留。理由：`modelRole` 的权威在身份层（`model-registry.js`），
   * 迁移脚本若自己写一份词表，就会在 schema 每次演进时把它改回去 —— 那不是"迁移"，
   * 那是"两个真相"。
   *
   * 本脚本只负责**其余三格**：`releasedAt` / `releaseEvidence`（含形态与引文上限）/ `freshnessGroup`。
   */
  const report = { migrated: 0, dated: 0, freshness: 0, rejected: [], roles: {}, shrunkQuotes: [], reordered: [] };
  const out = {};

  for (const slug of slugs) {
    const before = source[slug];
    const r = research.models[slug];

    const modelRole = Object.prototype.hasOwnProperty.call(before, 'modelRole') ? before.modelRole : null;
    const releasedAt = r.releasedAt === undefined ? null : r.releasedAt;
    const freshnessGroup = r.freshnessGroup === undefined ? null : r.freshnessGroup;
    if (before.releaseEvidence !== undefined && !Array.isArray(before.releaseEvidence)) {
      report.rejected.push(`${slug}: 现有 releaseEvidence 不是数组 —— 拒绝迁移`);
      continue;
    }
    // 已有证据时，规范化它的形态（键序 + 去掉不属于三格契约的键）；日期仍是权威输入
    if (Array.isArray(before.releaseEvidence) && before.releaseEvidence.length) report.reordered.push(slug);

    let releaseEvidence = [];
    if (releasedAt !== null) {
      const existing = Array.isArray(before.releaseEvidence) ? before.releaseEvidence[0] : null;
      const picked = pickEvidence(slug, r, existing);
      if (!picked || !picked.item) {
        report.rejected.push(`${slug}: ${picked ? picked.reject : '没有证据对象'} —— 有日期却没有可迁移的官方证据 ⇒ 拒绝迁移（宁可失败也不写假证据）`);
        continue;
      }
      releaseEvidence = [picked.item];
      report.dated += 1;
      if (picked.shrunk) report.shrunkQuotes.push(slug);
    } else if (Array.isArray(before.releaseEvidence) && before.releaseEvidence.length) {
      report.rejected.push(`${slug}: releasedAt=null 却带着非空证据 —— 互为充要，拒绝`);
      continue;
    }
    if (freshnessGroup) report.freshness += 1;
    report.roles[modelRole === null ? '(null)' : modelRole] = (report.roles[modelRole === null ? '(null)' : modelRole] || 0) + 1;

    // 规范键序重建条目：既有字段值逐字不动，只补 v2 四字段
    const next = {};
    for (const k of ORDER) {
      if (k === 'modelRole') { next[k] = modelRole; continue; }
      if (k === 'releasedAt') { next[k] = releasedAt; continue; }
      if (k === 'releaseEvidence') { next[k] = releaseEvidence; continue; }
      if (k === 'freshnessGroup') { next[k] = freshnessGroup; continue; }
      next[k] = Object.prototype.hasOwnProperty.call(before, k) ? before[k] : null;
    }
    // ① 既有字段逐字未变 —— **例外仅两个**：本脚本负责的三格 `releasedAt` / `releaseEvidence`
    // / `freshnessGroup`（它们的值可能来自上一轮形态不合契约的迁移，正是本次要规范化的对象）。
    // 身份类字段（canonicalName / developer / aliases / officialUrl / status / modelRole / note）一律不许变。
    const OWNED = ['releasedAt', 'releaseEvidence', 'freshnessGroup'];
    for (const k of Object.keys(before)) {
      if (!ORDER.includes(k)) {
        report.rejected.push(`${slug}: 来源层出现不在 v2 键序里的键「${k}」—— 拒绝迁移`);
      } else if (!OWNED.includes(k) && JSON.stringify(before[k]) !== JSON.stringify(next[k])) {
        report.rejected.push(`${slug}: 既有字段「${k}」值发生变化 —— 拒绝迁移（本轮只允许动 releasedAt / releaseEvidence / freshnessGroup 三格）`);
      }
    }
    out[slug] = next;
    report.migrated += 1;
  }

  if (report.rejected.length) {
    console.error(`❌ ${report.rejected.length} 处问题，拒绝写盘：`);
    report.rejected.slice(0, 20).forEach(item => console.error(`  - ${item}`));
    return 1;
  }

  // 顶层键序与盘上一致（`_` 说明键仍在原位；上面只做了"逐条新增 v2 四字段"这一件事）
  for (const key of Object.keys(source)) {
    if (key.startsWith('_')) out[key] = source[key];
  }

  // ③ 互为充要自检（与校验器同一条判据）
  for (const slug of slugs) {
    const hasDate = out[slug].releasedAt !== null;
    const hasEvidence = Array.isArray(out[slug].releaseEvidence) && out[slug].releaseEvidence.length > 0;
    if (hasDate !== hasEvidence) { console.error(`❌ ${slug}: releasedAt 与 releaseEvidence 不互为充要`); return 1; }
  }

  const text = JSON.stringify(out, null, 2) + '\n';
  console.log(`迁移 ${report.migrated}/44 条：有官方发布日期 ${report.dated} 条（各带 1 条官方域证据）；freshnessGroup 非空 ${report.freshness} 条`);
  console.log('modelRole 分布：' + Object.entries(report.roles).sort().map(([k, v]) => `${k}=${v}`).join(' '));
  if (report.shrunkQuotes.length) {
    console.log('改用同页更短官方原句（原引文超 200 字上限，禁止截断）：' + report.shrunkQuotes.join(', '));
  }

  if (DRY) { console.log('--dry-run：没有写盘。'); return 0; }
  const previous = fs.readFileSync(SRC, 'utf8');
  if (previous === text) { console.log('✓ 与盘上逐字节一致（无需写盘）'); return 0; }
  fs.writeFileSync(SRC, text);
  console.log(`✅ 已写出来源层：${Object.keys(out).length - metaKeys.length} 条模型 + ${metaKeys.length} 个 _ 说明键`);
  return 0;
}

process.exit(main());
