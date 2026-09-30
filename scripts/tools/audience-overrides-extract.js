#!/usr/bin/env node
/**
 * 把「只存在于 research/v1.1/DATA-BACKFILL.md 里的人工判断」落成**声明式数据源**。
 *
 * 用法：
 *   node scripts/tools/audience-overrides-extract.js --check    # 只对账，不写盘
 *   node scripts/tools/audience-overrides-extract.js            # 写出 scripts/data/audience-overrides.json
 *
 * ## 为什么需要它
 *
 * 实测（`check-reproducible.js`）：`deals.json` 里 56 条**采集侧**条目的 203 个六字段值
 * 没有任何源 —— 把六字段剥掉重放，一个都产不出来。它们的依据写在
 * `research/v1.1/DATA-BACKFILL.md` 第四节那张逐条表里（每条都带引文），
 * 但那是**一份报告**，不是数据源：采集管线读不到它，`deals.json` 于是成了这些值的
 * 唯一保存处，任何一次手工编辑都不可追溯、不可重建。
 *
 * 本工具把那份报告里的人工判断**搬进数据层**（`scripts/data/audience-overrides.json`），
 * 让 `deals.json` 回到「采集 + 两个人工文件」的纯投影。搬的时候**逐条对账**：
 *
 *   · 值        —— 取自 `deals.json`（已归一、已过校验）
 *   · 依据      —— 取自报告那一列引文
 *   · **两者必须互相印证**：报告里写的六字段与 `deals.json` 的实际值不一致 → 报出来，
 *     绝不挑一个信。这是本工具与「直接抄一份」的区别：抄不会发现任何矛盾。
 *
 * ## 为什么不手工写这个文件
 *
 * 56 条 × 6 字段 × 引文，手工誊一遍必然引入与 `deals.json` 的静默分歧；而且**下一次**
 * 补值还要再誊一遍。生成器 + 对账才是可重跑的。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEALS = path.join(ROOT, 'deals.json');
const DOC = path.join(ROOT, 'research', 'v1.1', 'DATA-BACKFILL.md');
const OUT = path.join(ROOT, 'scripts', 'data', 'audience-overrides.json');

const CHECK_ONLY = process.argv.includes('--check');

const { loadStore } = require('../lib/store');
const { loadCurated } = require('../lib/curated');
const { hasKnown } = require('../lib/audience');
const { AUDIENCE_FIELD_ORDER } = require('../lib/schema');

const CURATED_SOURCES = new Set(['Curated', 'Curated-CN']);
/** 报告表格里表示「空」的记号 */
const EMPTY = '—';
/** 报告表格里的分隔符 */
const SEP = '·';

/**
 * 「字段写了」的判据 —— 用**存在**，不用 `hasKnown`。
 *
 * ⚠️ 这两者不是一回事，第一版用 `hasKnown` 就漏了 4 条：`{chinaUsable:'unknown'}`
 * 有键、有值、是**明确查过之后写下的「没有证据」**，但 `hasKnown` 判它「没有数据」，
 * 于是它进不了 overrides，重放时照样产不出来 —— 4 个值继续无源。
 *
 * 这正是本项目那条双口径纪律：`unknown` 是**一个known答案**（查过、没查到），
 * 不是「字段不存在」。absent ≠ unknown，两者在页面上后果相反，
 * 在可重建性上同样相反：漏掉它 = 把一个明确的核查结论丢掉。
 */
const present = value => value !== undefined && value !== null;

/* ------------------------------------------------------------------ */
/* 解析报告第四节表格                                                   */
/* ------------------------------------------------------------------ */

function parseDocTable(md) {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s*四/.test(l));
  if (start < 0) throw new Error('DATA-BACKFILL.md 里找不到「## 四」小节');
  const end = lines.findIndex((l, i) => i > start && /^##\s*五/.test(l));
  const body = lines.slice(start, end < 0 ? lines.length : end);

  const rows = [];
  for (const line of body) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const m = trimmed.match(/^\|\s*`([0-9a-f]{12})`/);
    if (!m) continue;
    // 单元格里可能有转义的 \| —— 先保护再切
    const cells = trimmed
      .replace(/\\\|/g, '\u0000')
      .split('|')
      .map(c => c.replace(/\u0000/g, '|').trim());
    // 形如 ['', `id`, title, audience, benefitType, eligibility, claim, availability, provenance, evidence, '']
    //
    // ⚠️ id 取 `m[1]`（正则里已剥掉反引号），**不要**取 `cells[1]` —— 那是带反引号的
    // `` `2eae0e246de2` ``。第一版就栽在这里：56 行全部解析成功、56 条目标全部找到，
    // 然后 `byId.get()` 一个都命不中，报成「报告里找不到这 56 条」。
    // 症状像是「文档过期了」，实际是解析器自己带了个字符。
    const id = m[1];
    const [, , title, audience, benefitType, eligibilityDetail, claimRequirements, availability, provenance, evidence] = cells;
    rows.push({ id, title, audience, benefitType, eligibilityDetail, claimRequirements, availability, provenance, evidence, cells: cells.length });
  }
  return rows;
}

/** `a · b` → ['a','b']；`—` → [] */
function parseList(cell) {
  if (!cell || cell === EMPTY) return [];
  return cell.split(SEP).map(s => s.trim()).filter(s => s && s !== EMPTY);
}

/** `k=v · k2=v2` → {k:v,...}，v 走 JSON 解析（true/false/unknown） */
function parseMap(cell) {
  if (!cell || cell === EMPTY) return {};
  const out = {};
  for (const part of cell.split(SEP)) {
    const [key, ...rest] = part.split('=');
    if (!key || !rest.length) continue;
    const k = key.trim();
    const raw = rest.join('=').trim();
    let value;
    if (raw === 'true') value = true;
    else if (raw === 'false') value = false;
    else value = raw;
    if (k) out[k] = value;
  }
  return out;
}

/** 报告里 `chinaUsable=true · regionRestriction=xxx` → 归一后的 availability 形状 */
function parseAvailability(cell) {
  const map = parseMap(cell);
  const out = {};
  if (map.chinaUsable !== undefined) out.chinaUsable = map.chinaUsable;
  if (map.regionRestriction !== undefined) out.regionRestriction = map.regionRestriction;
  return out;
}

const sorted = list => [...list].sort();
const sameList = (a, b) => JSON.stringify(sorted(a || [])) === JSON.stringify(sorted(b || []));
const sameMap = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function main() {
  if (!fs.existsSync(DOC)) throw new Error(`找不到 ${path.relative(ROOT, DOC)}`);
  const rows = parseDocTable(fs.readFileSync(DOC, 'utf8'));
  const byId = new Map(rows.map(r => [r.id, r]));

  const store = loadStore(DEALS);
  const curatedIds = new Set(loadCurated().deals.map(d => d.id));
  const isCurated = d => curatedIds.has(d.id) || CURATED_SOURCES.has(d.source);

  const targets = store.deals.filter(d => !isCurated(d) && AUDIENCE_FIELD_ORDER.some(f => present(d[f])));

  const entries = [];
  const problems = [];
  const missingInDoc = [];
  const overriddenCurated = [];

  for (const deal of targets) {
    const row = byId.get(deal.id);
    if (!row) {
      missingInDoc.push({ id: deal.id, title: deal.title });
      continue;
    }
    if (row.cells !== 11) {
      problems.push(`${deal.title}: 报告表格列数异常（${row.cells}）`);
    }

    // ---- 对账：报告里写的六字段 vs deals.json 的实际值 ----
    const docAudience = parseList(row.audience);
    const docBenefit = parseList(row.benefitType);
    const docEligibility = parseMap(row.eligibilityDetail);
    const docClaim = parseMap(row.claimRequirements);
    const docAvailability = parseAvailability(row.availability);

    if (!sameList(docAudience, deal.audience)) {
      problems.push(`${deal.title} · audience：报告 ${JSON.stringify(docAudience)} vs 数据 ${JSON.stringify(deal.audience || null)}`);
    }
    if (!sameList(docBenefit, deal.benefitType)) {
      problems.push(`${deal.title} · benefitType：报告 ${JSON.stringify(docBenefit)} vs 数据 ${JSON.stringify(deal.benefitType || null)}`);
    }
    if (!sameMap(docEligibility, deal.eligibilityDetail)) {
      problems.push(`${deal.title} · eligibilityDetail：报告 ${JSON.stringify(docEligibility)} vs 数据 ${JSON.stringify(deal.eligibilityDetail || null)}`);
    }
    if (!sameMap(docClaim, deal.claimRequirements)) {
      problems.push(`${deal.title} · claimRequirements：报告 ${JSON.stringify(docClaim)} vs 数据 ${JSON.stringify(deal.claimRequirements || null)}`);
    }
    // availability 只比对 chinaUsable：regionRestriction 在报告里可能被截断
    const docChina = docAvailability.chinaUsable;
    const dataChina = deal.availability && deal.availability.chinaUsable;
    if (docChina !== undefined && dataChina !== undefined && String(docChina) !== String(dataChina)) {
      problems.push(`${deal.title} · availability.chinaUsable：报告 ${docChina} vs 数据 ${dataChina}`);
    }
    // 反向也要拦：报告那一格是空的，数据里却有值 —— 那个值没有任何依据可引。
    // （2026-09-29 实测：`hasKnown` 口径下这条检查看不见 `{chinaUsable:'unknown'}`，
    //   而报告那 4 格其实写的是 `chinaUsable=unknown` —— 是解析器漏了，不是数据缺依据。）
    if (row.availability === EMPTY && present(deal.availability)) {
      problems.push(`${deal.title} · availability：报告该格为「${EMPTY}」，数据里却有 ${JSON.stringify(deal.availability)} —— 无依据可引`);
    }

    // ---- 依据：报告那一列引文（`（merge 后无）` 是出处列，不是依据列）----
    const evidence = row.evidence && row.evidence !== EMPTY ? row.evidence : '';
    if (!evidence) problems.push(`${deal.title}: 报告里没有依据引文 —— 这个值没有可核的推理链`);

    // ---- 推断标记：引文里点名「（推断）」的字段 ----
    const inferred = [];
    for (const field of AUDIENCE_FIELD_ORDER) {
      if (!present(deal[field])) continue;
      if (evidence.includes('推断')) inferred.push(field);
    }

    const entry = { id: deal.id, title: deal.title };
    for (const field of AUDIENCE_FIELD_ORDER) {
      if (present(deal[field])) entry[field] = deal[field];
    }
    if (deal.sourceUrl) entry.sourceUrl = deal.sourceUrl;
    entry.evidence = evidence;
    if (inferred.length) entry.inferredFields = inferred;
    entries.push(entry);
  }

  for (const deal of store.deals) {
    if (isCurated(deal) && byId.has(deal.id)) overriddenCurated.push(deal.title);
  }

  const fieldCount = {};
  for (const e of entries) {
    for (const f of AUDIENCE_FIELD_ORDER) if (e[f] !== undefined) fieldCount[f] = (fieldCount[f] || 0) + 1;
  }
  const inferredCount = entries.filter(e => e.inferredFields).length;

  console.log('=== 人工判断落盘（报告 → 声明式数据源）===');
  console.log(`报告表格行数    : ${rows.length}`);
  console.log(`需要落盘的条目  : ${targets.length}`);
  console.log(`已匹配到依据    : ${entries.length}`);
  console.log(`报告里找不到    : ${missingInDoc.length}${missingInDoc.length ? ' —— ' + missingInDoc.slice(0, 5).map(x => x.title).join('、') : ''}`);
  console.log(`字段落盘数      : ${JSON.stringify(fieldCount)}`);
  console.log(`带推断标记      : ${inferredCount} 条`);
  console.log(`对账不一致      : ${problems.length} 处`);
  problems.slice(0, 20).forEach(p => console.log(`   ⚠ ${p}`));
  if (overriddenCurated.length) {
    console.log(`⚠ 报告里也有策展条目 ${overriddenCurated.length} 条（它们以人工文件为准，不落进 overrides）`);
  }

  if (missingInDoc.length || problems.length) {
    console.error('\n❌ 报告与数据没有互相印证 —— 先解决上面的矛盾，不落盘。');
    process.exit(1);
  }

  // v1.3：人工写下的**官方原文引文**（`evidenceQuotes`）不在报告表里，报告表只管六字段。
  // 所以重新生成时必须把它按 id 原样带过来 —— 否则一次「按报告重建」会静默删掉人工补的
  // 证据，而肉眼只会看到「引文没了」，页面上退化成「未收录官方原文片段」。
  // 这不是可选的美化：这个文件是那些值的**唯一权威落点**。
  const preservedQuotes = new Map();
  try {
    const previous = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    for (const entry of previous.entries || []) {
      if (entry && entry.id && entry.evidenceQuotes) preservedQuotes.set(entry.id, entry.evidenceQuotes);
    }
  } catch (error) {
    // 首次生成 / 旧文件损坏：没有可保留的东西，继续（损坏会在下一步被 JSON.parse 之外的地方发现）
  }
  if (preservedQuotes.size) {
    for (const entry of entries) {
      if (preservedQuotes.has(entry.id)) entry.evidenceQuotes = preservedQuotes.get(entry.id);
    }
    console.log(`保留人工引文    : ${preservedQuotes.size} 条（evidenceQuotes 不在报告表里，必须原样带过来）`);
  }

  const payload = {
    schemaVersion: 1,
    purpose: 'deals.json 六字段的第二个人工来源（第一个是 curated_*.json）。让 deals.json 成为可重建的纯投影。',
    note: [
      '本文件由 scripts/tools/audience-overrides-extract.js 从 research/v1.1/DATA-BACKFILL.md 第四节逐条表生成，',
      '值取自 deals.json（已归一、已过校验），依据取自报告的引文列，两者在生成时逐条对账（不印证就拒绝落盘）。',
      '它**不是**「值的一份拷贝」这么简单：它是这些值的**唯一权威落点**。',
      '在此之前这些值只存在于 deals.json 里，没有任何文件能重建它们 —— 采集器不产出六字段，',
      '重放一轮 merge 会全部丢失。',
      'credibility 记 curated 而不是 editorial：这些是人读官方页得出的判断（带引文），但**没有**人工回访核验，',
      'verifiedAt 因此为空、verified 为 false。这与 CREDIBILITY_RANK 的定义一致（curated = 人工策展来源、未核验）。',
      '新增条目请直接编辑本文件，然后跑 node scripts/tools/check-reproducible.js 验证可重建性。'
    ].join(''),
    entries
  };

  if (CHECK_ONLY) {
    console.log('\n(--check，未写盘)');
    return;
  }
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`\n✅ 已写入 ${path.relative(ROOT, OUT)}（${entries.length} 条）`);
}

main();
