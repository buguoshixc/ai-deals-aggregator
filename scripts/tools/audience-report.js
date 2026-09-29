#!/usr/bin/env node
/**
 * 学生 / 开发者数据模型覆盖率报告（v1.1，只读）。
 *
 * 契约：docs/SCHEMA-v1.1.md §7.3（覆盖率清单）+ §5.3.3（provenance 必须分两个口径报）。
 *
 * 用法：
 *   node scripts/tools/audience-report.js                  # 人类可读
 *   node scripts/tools/audience-report.js --json           # 机器可读（stdout 只有 JSON）
 *   node scripts/tools/audience-report.js --file=x.json    # 换数据文件（默认 deals.json）
 *   node scripts/tools/audience-report.js --curated-dir=scripts/data
 *
 * 读报告前先读这三条口径纪律，否则数字会被误读：
 *
 *  ① **分母只算 `type === "deal"` 的条目。** 工具类条目没有「领取条件」，
 *     把它们算进分母，覆盖率永远上不去且没有意义（契约 §7.3）。工具条目单独报一行。
 *
 *  ② **`"unknown"` 不是覆盖。** 三态写 `"unknown"` 表示「我们查过、没有证据」——
 *     它是诚实的信息，但不是「已知值」。只有 `true` / `false` 计入覆盖，
 *     `unknown` 与「字段缺席」各自单独计数：三者混在一起，覆盖率就回答不了
 *     「我们到底核过多少条」。
 *
 *  ③ **provenance 分两个口径报**（契约 §5.3.3，硬要求）：
 *     · 书写期 —— `scripts/data/curated_*.json`（人工文件、合并前）：我们人工核过多少条；
 *     · 发布期 —— `deals.json`（合并后）：线上此刻有多少条带得出处。
 *     发布期**低于**书写期是预期，差值恰恰是「被采集侧赢走取值的字段数」
 *     （provenance 按设计只减不增）。不把这句话写进报告，
 *     读者会把设计性退化读成数据丢失。
 *
 * 这个工具**只读**：不写文件、不改数据、退出码只表达「报告有没有跑出来」
 * （覆盖率低不是错误 —— 没有依据就留空是正确结果，编数据才是失败）。
 */

const fs = require('fs');
const path = require('path');
const audience = require('../lib/audience');
const { loadCurated, CURATED_FILES } = require('../lib/curated');

const ROOT = path.join(__dirname, '..', '..');

/** 新字段里「有值 / 没值」这件事有意义的五个（provenance 自己不算「值」） */
const VALUE_FIELDS = ['audience', 'benefitType', 'eligibilityDetail', 'claimRequirements', 'availability'];

const args = process.argv.slice(2);
const has = name => args.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const hit = args.find(item => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

if (has('help') || args.includes('-h')) {
  console.log([
    '学生 / 开发者数据模型覆盖率报告（只读）',
    '',
    '  node scripts/tools/audience-report.js            人类可读报告',
    '  node scripts/tools/audience-report.js --json     机器可读（stdout 只有 JSON）',
    '  node scripts/tools/audience-report.js --file=<path>          数据文件（默认 deals.json）',
    '  node scripts/tools/audience-report.js --curated-dir=<dir>    书写期人工文件目录（默认 scripts/data）',
    ''
  ].join('\n'));
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* 读数据                                                              */
/* ------------------------------------------------------------------ */

const dealsFile = path.resolve(ROOT, opt('file', 'deals.json'));
const curatedDir = path.resolve(ROOT, opt('curated-dir', path.join('scripts', 'data')));

if (!fs.existsSync(dealsFile)) {
  console.error(`❌ 找不到数据文件 ${dealsFile}`);
  process.exit(1);
}
let store;
try {
  store = JSON.parse(fs.readFileSync(dealsFile, 'utf8'));
} catch (error) {
  console.error(`❌ ${path.relative(ROOT, dealsFile)} 解析失败：${error.message}`);
  process.exit(1);
}
const published = Array.isArray(store) ? store : store.deals || [];

// 书写期数据源：走与采集链同一个 loadCurated()（同一套 makeDeal 归一与来源默认值），
// 否则「人工核过多少条」这个数字会因为两处规则不同而对不上。
const curated = loadCurated({ dir: curatedDir });

/* ------------------------------------------------------------------ */
/* 逐条画像                                                            */
/* ------------------------------------------------------------------ */

/**
 * 一条记录的新字段画像。
 *
 * 取值一律走 lib/audience 的归一函数（与 schema / makeDeal 同一套）：
 * 报告与校验各写一套枚举判断，迟早出现「报告说有值、validate 说不合法」。
 * 归一之后：
 *   · `list` / `tri` / `availability` —— 只有**有效**值（非法项已被丢掉）；
 *   · `knownFields` —— 有明确值的字段（三态非 unknown、数组非空）；
 *   · `uncoveredFields` —— 有明确值、但 `provenance.fields` 里没有它（契约 §2.6 的缺口）。
 */
function profileOf(deal) {
  const source = deal && deal.source;
  const audienceList = audience.normalizeEnumList(deal.audience, audience.AUDIENCES) || [];
  const benefitList = audience.normalizeEnumList(deal.benefitType, audience.BENEFIT_TYPES) || [];
  const eligibility = audience.normalizeTristateMap(deal.eligibilityDetail, audience.ELIGIBILITY_KEYS) || {};
  const claim = audience.normalizeTristateMap(deal.claimRequirements, audience.CLAIM_KEYS) || {};
  const availability = audience.normalizeAvailability(deal.availability) || {};
  const provenance = deal.provenance && typeof deal.provenance === 'object' && !Array.isArray(deal.provenance)
    ? deal.provenance
    : null;
  const values = {
    audience: audienceList,
    benefitType: benefitList,
    eligibilityDetail: eligibility,
    claimRequirements: claim,
    availability
  };
  const knownFields = VALUE_FIELDS.filter(key => audience.hasKnown(values[key]));
  const provenanceFieldKeys = provenance && provenance.fields && typeof provenance.fields === 'object'
    ? Object.keys(provenance.fields)
    : [];
  return {
    id: String(deal.id || ''),
    title: String(deal.title || '(无标题)'),
    source: typeof source === 'string' && source.trim() ? source : '(无来源)',
    type: deal.type === 'tool' ? 'tool' : 'deal',
    region: deal.region || null,
    audience: audienceList,
    benefitType: benefitList,
    eligibility,
    claim,
    availability,
    provenance,
    credibility: provenance ? provenance.credibility : null,
    provenanceFieldKeys,
    knownFields,
    uncoveredFields: knownFields.filter(key => !provenanceFieldKeys.includes(key))
  };
}

const publishedProfiles = published.map(profileOf);
const curatedProfiles = curated.deals.map(profileOf);

/* ------------------------------------------------------------------ */
/* 统计                                                                */
/* ------------------------------------------------------------------ */

const triZero = keys => Object.fromEntries(keys.map(key => [key, { yes: 0, no: 0, unknown: 0, absent: 0, known: 0 }]));
const triKnown = value => value === true || value === false;

function tallyTristate(bucket, map) {
  for (const key of Object.keys(bucket)) {
    const value = map[key];
    if (value === true) { bucket[key].yes++; bucket[key].known++; } else if (value === false) { bucket[key].no++; bucket[key].known++; } else if (value === audience.TRISTATE_UNKNOWN) bucket[key].unknown++; else bucket[key].absent++;
  }
}

function statsOf(profiles) {
  const s = {
    total: profiles.length,
    deals: 0,
    tools: 0,
    audience: 0,
    benefitType: 0,
    // 学生 / 开发者：分子 = 「明确说了与它有关」的三个证据源之一（逐个单列，便于审计）
    student: 0, studentAudience: 0, studentEligibility: 0, studentBenefit: 0, studentOnlyIndirect: 0,
    developer: 0, developerAudience: 0, developerBenefit: 0, developerOnlyIndirect: 0,
    education: 0,
    eligibility: triZero(audience.ELIGIBILITY_KEYS),
    claim: triZero(audience.CLAIM_KEYS),
    chinaKnown: 0, chinaYes: 0, chinaNo: 0, chinaUnknown: 0, chinaAbsent: 0, chinaRegionOnly: 0,
    provenance: 0, provenanceFieldClaims: 0,
    knownValueFields: 0, coveredKnownFields: 0,
    withKnownFields: 0,
    withoutProvenance: [],
    credibility: { editorial: 0, curated: 0, collected: 0, none: 0 }
  };

  for (const p of profiles) {
    if (p.type === 'deal') s.deals++; else s.tools++;
    if (p.audience.length) s.audience++;
    if (p.benefitType.length) s.benefitType++;

    const elig = p.eligibility;
    const studentByAudience = p.audience.includes('student');
    const studentByEligibility = triKnown(elig.studentRequired);
    const studentByBenefit = p.benefitType.includes('student_plan');
    if (studentByAudience) { s.studentAudience++; }
    if (studentByEligibility) { s.studentEligibility++; }
    if (studentByBenefit) { s.studentBenefit++; }
    if (studentByAudience || studentByEligibility || studentByBenefit) {
      s.student++;
      if (!studentByAudience) s.studentOnlyIndirect++;
    }

    const developerByAudience = p.audience.includes('developer');
    const developerByBenefit = p.benefitType.includes('developer_credit');
    if (developerByAudience) s.developerAudience++;
    if (developerByBenefit) s.developerBenefit++;
    if (developerByAudience || developerByBenefit) {
      s.developer++;
      if (!developerByAudience) s.developerOnlyIndirect++;
    }
    // educator / education 单独一档：教师与教育机构**不是**学生（契约 §2.1），
    // 合进学生那一行会让「教师免费」与「在校学生免费」看起来是同一件事。
    if (p.audience.includes('educator') || p.audience.includes('education')) s.education++;

    tallyTristate(s.eligibility, elig);
    tallyTristate(s.claim, p.claim);

    const china = p.availability.chinaUsable;
    const restriction = typeof p.availability.regionRestriction === 'string' && p.availability.regionRestriction.trim();
    if (china === true) { s.chinaYes++; s.chinaKnown++; } else if (china === false) { s.chinaNo++; s.chinaKnown++; } else if (china === audience.TRISTATE_UNKNOWN) s.chinaUnknown++;
    else {
      s.chinaAbsent++;
      if (restriction) s.chinaRegionOnly++;
    }

    if (p.provenance) {
      s.provenance++;
      s.provenanceFieldClaims += p.provenanceFieldKeys.length;
      if (Object.prototype.hasOwnProperty.call(s.credibility, p.credibility)) s.credibility[p.credibility]++;
    } else {
      s.credibility.none++;
    }
    if (p.knownFields.length) s.withKnownFields++;
    s.knownValueFields += p.knownFields.length;
    s.coveredKnownFields += p.knownFields.length - p.uncoveredFields.length;
    if (p.uncoveredFields.length) s.withoutProvenance.push(p);
  }
  return s;
}

const denominator = publishedProfiles.filter(p => p.type === 'deal');
const toolsOnly = publishedProfiles.filter(p => p.type === 'tool');
const pub = statsOf(publishedProfiles);
const pubDeals = statsOf(denominator);
const pubTools = statsOf(toolsOnly);
const write = statsOf(curatedProfiles);

/* 按来源分组（分母口径一致：只统计优惠条目；工具条目只给个数） */
const bySource = new Map();
for (const p of publishedProfiles) {
  if (!bySource.has(p.source)) bySource.set(p.source, []);
  bySource.get(p.source).push(p);
}
const sourceRows = [...bySource.entries()]
  .map(([source, list]) => {
    const dealsList = list.filter(p => p.type === 'deal');
    return { source, tools: list.length - dealsList.length, stats: statsOf(dealsList) };
  })
  .sort((a, b) => (b.stats.total - a.stats.total) || a.source.localeCompare(b.source, 'zh-Hans-CN'));

/* ------------------------------------------------------------------ */
/* provenance 双口径：同一批人工条目的两个时点对照                        */
/* ------------------------------------------------------------------ */

const publishedById = new Map(publishedProfiles.map(p => [p.id, p]));
// 没有 id 的条目无法配对（deals.json 经 makeId 后必有 id；手写 / 外部数据文件可能没有）。
// 不提示的话，「找到 0 条」会被读成「人工条目全丢了」——实际是配对前提不成立。
const idlessPublished = publishedProfiles.filter(p => !p.id).length;
const pair = {
  curatedTotal: curatedProfiles.length,
  matched: 0,
  missing: [],
  idlessPublished,
  writtenWithProvenance: 0,
  publishedWithProvenance: 0,
  writtenFieldClaims: 0,
  publishedFieldClaims: 0,
  lostProvenance: [],
  lostFieldClaims: []
};

for (const p of curatedProfiles) {
  const q = publishedById.get(p.id);
  if (!q) { pair.missing.push(p); continue; }
  pair.matched++;
  if (p.provenance) pair.writtenWithProvenance++;
  if (q.provenance) pair.publishedWithProvenance++;
  pair.writtenFieldClaims += p.provenanceFieldKeys.length;
  pair.publishedFieldClaims += q.provenanceFieldKeys.length;
  if (p.provenance && !q.provenance) pair.lostProvenance.push({ id: p.id, title: p.title });
  const lost = p.provenanceFieldKeys.filter(key => !q.provenanceFieldKeys.includes(key));
  if (lost.length) pair.lostFieldClaims.push({ id: p.id, title: p.title, fields: lost });
}

/* ------------------------------------------------------------------ */
/* 输出                                                                */
/* ------------------------------------------------------------------ */

const pctNum = (n, d) => Number(d ? (n / d * 100).toFixed(1) : 0);
const pct = (n, d) => pctNum(n, d).toFixed(1) + '%';
const rel = file => path.relative(ROOT, file).split(path.sep).join('/');

/** 中文双宽字符的列宽（padEnd 按码元算，中文表格会歪） */
function widthOf(text) {
  return Array.from(String(text)).reduce((n, ch) => (/[\u1100-\u115f\u2e80-\ua4cf\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(ch) ? 2 : 1) + n, 0);
}
const padTo = (text, width) => {
  const value = String(text);
  return value + ' '.repeat(Math.max(0, width - widthOf(value)));
};

/** 「已知 是/否 a/b · unknown c · 缺席 d」这一串三态明细 */
const triLine = bucket => `已知 是/否 ${bucket.yes}/${bucket.no} · unknown ${bucket.unknown} · 缺席 ${bucket.absent}`;

const FIXED_NOTE = 'ℹ️  发布期低于书写期是预期：差值 = 被采集侧赢走取值的字段数（provenance 按设计只减不增，契约 §5.3.3）';

const json = {
  generatedFrom: {
    published: rel(dealsFile),
    curated: CURATED_FILES.map(spec => rel(path.join(curatedDir, spec.file))),
    contract: 'docs/SCHEMA-v1.1.md'
  },
  denominator: {
    definition: "type === 'deal'",
    deals: pub.deals,
    tools: pub.tools,
    total: pub.total
  },
  coverage: {
    audience: { known: pubDeals.audience, of: pubDeals.total, pct: pctNum(pubDeals.audience, pubDeals.total) },
    student: {
      known: pubDeals.student, of: pubDeals.total, pct: pctNum(pubDeals.student, pubDeals.total),
      byAudience: pubDeals.studentAudience, byEligibility: pubDeals.studentEligibility, byBenefitType: pubDeals.studentBenefit,
      indirectOnly: pubDeals.studentOnlyIndirect
    },
    developer: {
      known: pubDeals.developer, of: pubDeals.total, pct: pctNum(pubDeals.developer, pubDeals.total),
      byAudience: pubDeals.developerAudience, byBenefitType: pubDeals.developerBenefit,
      indirectOnly: pubDeals.developerOnlyIndirect
    },
    education: { known: pubDeals.education, of: pubDeals.total, note: 'educator / education —— 刻意不计入 student' },
    creditCardRequired: {
      known: pubDeals.claim.creditCardRequired.known, of: pubDeals.total,
      pct: pctNum(pubDeals.claim.creditCardRequired.known, pubDeals.total),
      yes: pubDeals.claim.creditCardRequired.yes, no: pubDeals.claim.creditCardRequired.no,
      unknown: pubDeals.claim.creditCardRequired.unknown, absent: pubDeals.claim.creditCardRequired.absent
    },
    chinaUsable: {
      known: pubDeals.chinaKnown, of: pubDeals.total, pct: pctNum(pubDeals.chinaKnown, pubDeals.total),
      yes: pubDeals.chinaYes, no: pubDeals.chinaNo, unknown: pubDeals.chinaUnknown,
      regionRestrictionOnly: pubDeals.chinaRegionOnly, absent: pubDeals.chinaAbsent
    },
    benefitType: { known: pubDeals.benefitType, of: pubDeals.total, pct: pctNum(pubDeals.benefitType, pubDeals.total) },
    eligibilityDetail: Object.fromEntries(Object.entries(pubDeals.eligibility).map(([key, b]) => [key, b])),
    claimRequirements: Object.fromEntries(Object.entries(pubDeals.claim).map(([key, b]) => [key, b]))
  },
  tools: {
    total: pubTools.total,
    knownAudience: pubTools.audience,
    knownAnyField: pubTools.withKnownFields,
    note: '工具条目不计入分母（没有「领取条件」），它们是 v1.2 分类页的原料'
  },
  provenance: {
    denominator: "type === 'deal'（两个口径同宽，工具条目都不计入）",
    writingPeriod: {
      source: CURATED_FILES.map(spec => rel(path.join(curatedDir, spec.file))),
      deals: write.deals,
      pct: pctNum(write.provenance, write.deals),
      withProvenance: write.provenance,
      fieldClaims: write.provenanceFieldClaims,
      credibility: write.credibility
    },
    publishedPeriod: {
      source: rel(dealsFile),
      deals: pubDeals.deals,
      pct: pctNum(pubDeals.provenance, pubDeals.deals),
      withProvenance: pubDeals.provenance,
      fieldClaims: pubDeals.provenanceFieldClaims,
      credibility: pubDeals.credibility,
      knownValueFields: pubDeals.knownValueFields,
      coveredKnownFields: pubDeals.coveredKnownFields
    },
    paired: pair,
    note: FIXED_NOTE
  },
  bySource: sourceRows.map(row => ({
    source: row.source,
    deals: row.stats.total,
    tools: row.tools,
    audience: row.stats.audience,
    student: row.stats.student,
    developer: row.stats.developer,
    benefitType: row.stats.benefitType,
    creditCardRequired: row.stats.claim.creditCardRequired.known,
    chinaUsable: row.stats.chinaKnown,
    provenance: row.stats.provenance
  })),
  knownWithoutProvenance: publishedProfiles
    .filter(p => p.uncoveredFields.length)
    .map(p => ({
      id: p.id,
      title: p.title,
      source: p.source,
      type: p.type,
      knownFields: p.knownFields,
      uncoveredFields: p.uncoveredFields,
      hasProvenance: Boolean(p.provenance),
      credibility: p.credibility
    })),
  curatedDropped: curated.report.filter(row => row.dropped.length || row.missing).map(row => ({
    file: row.file,
    total: row.total,
    ok: row.ok,
    missing: row.missing,
    dropped: row.dropped
  })),
  // v1.1 修（t5 的 F-2）：`audienceDropped` 是「声明了却被归一静默清洗掉」的位置。
  // 早先只导出 `dropped`（构造失败），于是机器可读口径也看不见它。
  curatedAudienceDropped: curated.report.flatMap(row => (row.audienceDropped || []).map(item => ({ file: row.file, ...item })))
};

if (has('json')) {
  console.log(JSON.stringify(json, null, 2));
  // 机器可读口径同样要判死：否则 CI 里用 --json 取数的人拿到的是 0 退出 + 一份干净的 JSON，
  // 而人工文件里那个拼错的枚举值已经在归一里被丢掉了（t5 的 F-2 就是这个形态）。
  const cleaned = json.curatedAudienceDropped.length;
  const dropped = json.curatedDropped.reduce((n, row) => n + row.dropped.length, 0);
  process.exit(cleaned || dropped ? 1 : 0);
}

/* ---------------- 人类可读 ---------------- */

console.log('学生 / 开发者数据模型覆盖率报告（v1.1 · 只读）');
console.log('契约：docs/SCHEMA-v1.1.md §7.3（覆盖率清单）· §5.3.3（provenance 双口径）');
console.log(`数据源：${rel(dealsFile)} · ${pub.total} 条（优惠 ${pub.deals} / 工具 ${pub.tools}）`);
console.log(`分母口径：type === 'deal' 的 ${pubDeals.total} 条优惠 —— 工具条目没有「领取条件」，不计入分母`);
console.log(`书写期数据源：${CURATED_FILES.map(spec => rel(path.join(curatedDir, spec.file))).join(' + ')}（${write.total} 条，人工文件、合并前）`);
if (curated.report.some(row => row.dropped.length)) {
  console.log(`⚠️  书写期有 ${curated.report.reduce((n, row) => n + row.dropped.length, 0)} 条无法构造为合规记录（见文末）`);
}

console.log(`\n==== 一、覆盖率（分母 ${pubDeals.total} 条优惠）====`);
const coverageLine = (label, known, detail) => `${padTo(label, 24)}${padTo(`${known}/${pubDeals.total}（${pct(known, pubDeals.total)}）`, 18)}${detail || ''}`;
console.log(coverageLine('学生适用信息覆盖率', pubDeals.student,
  `其中 audience 明确 student ${pubDeals.studentAudience} 条 · 仅靠 studentRequired / student_plan ${pubDeals.studentOnlyIndirect} 条`));
console.log(coverageLine('开发者适用信息覆盖率', pubDeals.developer,
  `其中 audience 明确 developer ${pubDeals.developerAudience} 条 · 仅靠 developer_credit ${pubDeals.developerOnlyIndirect} 条`));
console.log(coverageLine('信用卡要求覆盖率', pubDeals.claim.creditCardRequired.known,
  triLine(pubDeals.claim.creditCardRequired)));
console.log(coverageLine('中国可用性覆盖率', pubDeals.chinaKnown,
  `已知 是/否 ${pubDeals.chinaYes}/${pubDeals.chinaNo} · unknown ${pubDeals.chinaUnknown} · 仅写了地区限制 ${pubDeals.chinaRegionOnly} · 缺席 ${pubDeals.chinaAbsent}`));
console.log(coverageLine('benefitType 覆盖率', pubDeals.benefitType, ''));
console.log(coverageLine('audience 覆盖率', pubDeals.audience, ''));
console.log(padTo('（参考）教育向覆盖率', 24) + padTo(`${pubDeals.education}/${pubDeals.total}（${pct(pubDeals.education, pubDeals.total)}）`, 18) +
  'educator / education —— 刻意不计入「学生」（教师 ≠ 学生，契约 §2.1）');
console.log(padTo('（参考）学生身份门槛覆盖率', 24) + padTo(`${pubDeals.eligibility.studentRequired.known}/${pubDeals.total}（${pct(pubDeals.eligibility.studentRequired.known, pubDeals.total)}）`, 18) +
  triLine(pubDeals.eligibility.studentRequired));
console.log(padTo('（参考）教育邮箱要求覆盖率', 24) + padTo(`${pubDeals.eligibility.educationEmailRequired.known}/${pubDeals.total}（${pct(pubDeals.eligibility.educationEmailRequired.known, pubDeals.total)}）`, 18) +
  triLine(pubDeals.eligibility.educationEmailRequired));
console.log('口径提醒：三态里的 "unknown" 是「我们查过、没有证据」——它是诚实的信息，但**不计入**覆盖率；');
console.log('          缺席与 unknown 的条数都单独列在上面，二者不能混为一谈。');

console.log(`\n==== 二、按来源分组（分母同上：只统计优惠条目）====`);
const head = [padTo('来源', 20), padTo('优惠', 6), padTo('工具', 6), padTo('audience', 10), padTo('学生', 6), padTo('开发者', 8), padTo('benefit', 8), padTo('信用卡', 8), padTo('中国可用', 10), 'provenance'].join('');
console.log(head);
console.log('-'.repeat(widthOf(head)));
for (const row of sourceRows) {
  const s = row.stats;
  console.log([
    padTo(row.source, 20),
    padTo(s.total, 6),
    padTo(row.tools, 6),
    padTo(`${s.audience}/${s.total}`, 10),
    padTo(`${s.student}`, 6),
    padTo(`${s.developer}`, 8),
    padTo(`${s.benefitType}/${s.total}`, 8),
    padTo(`${s.claim.creditCardRequired.known}/${s.total}`, 8),
    padTo(`${s.chinaKnown}/${s.total}`, 10),
    `${s.provenance}/${s.total}`
  ].join(''));
}
const sourceTotal = [padTo('合计', 20), padTo(pubDeals.total, 6), padTo(pub.tools, 6), padTo(`${pubDeals.audience}/${pubDeals.total}`, 10),
  padTo(`${pubDeals.student}`, 6), padTo(`${pubDeals.developer}`, 8), padTo(`${pubDeals.benefitType}/${pubDeals.total}`, 8),
  padTo(`${pubDeals.claim.creditCardRequired.known}/${pubDeals.total}`, 8), padTo(`${pubDeals.chinaKnown}/${pubDeals.total}`, 10),
  `${pubDeals.provenance}/${pubDeals.total}`].join('');
console.log('-'.repeat(widthOf(head)));
console.log(sourceTotal);

console.log(`\n==== 三、provenance 双口径（契约 §5.3.3）====`);
console.log(padTo('书写期（人工文件、合并前）', 28) +
  `${write.deals} 条优惠：条上有 provenance ${write.provenance} 条（${pct(write.provenance, write.deals)}）· provenance.fields 声明 ${write.provenanceFieldClaims} 个`);
console.log(padTo('发布期（deals.json、合并后）', 28) +
  `${pubDeals.deals} 条优惠：条上有 provenance ${pubDeals.provenance} 条（${pct(pubDeals.provenance, pubDeals.deals)}）· provenance.fields 声明 ${pubDeals.provenanceFieldClaims} 个`);
console.log(FIXED_NOTE);
console.log(`两个口径的分母不同（${write.deals} 条人工条目 vs ${pubDeals.deals} 条线上优惠），百分比不能直接相减 ——`);
console.log('差值只能看下面这张「同一批人工条目在两个时点」的对照表：');
console.log(`  同一批人工条目 ${pair.curatedTotal} 条，按 id 在 deals.json 里找到 ${pair.matched} 条${pair.missing.length ? `（另有 ${pair.missing.length} 条没进线上数据）` : ''}`);
if (pair.idlessPublished) {
  console.log(`  ⚠️ deals.json 里有 ${pair.idlessPublished} 条没有 id —— 配对无从谈起（上面那个「找到 N 条」会因此偏低）`);
}
for (const row of pair.missing.slice(0, 5)) {
  console.log(`      没进线上：${row.title}（${row.id || '无 id'}）`);
}
if (pair.missing.length > 5) console.log(`      …… 另有 ${pair.missing.length - 5} 条`);
console.log(`    条上有 provenance：书写期 ${pair.writtenWithProvenance} → 发布期 ${pair.publishedWithProvenance}` +
  `（少 ${pair.writtenWithProvenance - pair.publishedWithProvenance} 条）`);
console.log(`    provenance.fields：书写期 ${pair.writtenFieldClaims} → 发布期 ${pair.publishedFieldClaims}` +
  `（少 ${pair.writtenFieldClaims - pair.publishedFieldClaims} 个）← 这就是被采集侧赢走取值的字段数`);
const cred = pubDeals.credibility;
console.log(`  发布期可信度分布：editorial ${cred.editorial} · curated ${cred.curated} · collected ${cred.collected} · 无 provenance ${cred.none}`);

console.log(`\n==== 四、已知值但无 provenance（${json.knownWithoutProvenance.length} 条）====`);
console.log('（清单**不限于分母**：工具条目上的已知值同样需要出处 —— 一个没有出处的断言，');
console.log('  不会因为它在工具条目上就变得有出处。契约 §2.6。）');
if (!json.knownWithoutProvenance.length) {
  console.log('（无：每个已知的新字段都有出处，或本来就没有已知值）');
} else {
  console.log('契约 §2.6：provenance.fields 必须覆盖这条记录上每一个**已知值**的字段。缺口的两种情况分列如下。');
  for (const row of json.knownWithoutProvenance) {
    console.log(`  [${row.id}] ${row.title}（${row.source} · ${row.type}）`);
    console.log(`      已知字段：${row.knownFields.join(' / ')}`);
    console.log(`      缺出处  ：${row.uncoveredFields.join(' / ')}${row.hasProvenance ? `（有 provenance，credibility=${row.credibility}，但 fields 里没有这些键）` : '（整条没有 provenance）'}`);
  }
}

console.log(`\n==== 五、分母之外的工具条目（${pubTools.total} 条）====`);
console.log(`已标注 audience ${pubTools.audience} 条 · 已知任一新字段 ${pubTools.withKnownFields} 条 —— 不计入上面的分母，`);
console.log('它们是 v1.2 分类页的原料（契约 §7.3）。');

console.log(`\n==== 六、书写期数据源体检 ====`);
for (const row of curated.report) {
  if (row.missing) console.log(`  ⚠️  ${row.file} 不存在（书写期口径缺这一半）`);
  else console.log(`  ${row.file}：${row.ok}/${row.total} 条可构造为合规记录`);
  for (const item of row.dropped) console.log(`      #${item.index} ${item.title}：${item.reason}`);
  // v1.1 修（t5 验证的 F-2）：这里原先把 `audienceDropped` 漏掉了，于是往人工文件里
  // 塞一个拼错的枚举值（`audience:["wizard"]`，会被归一静默丢掉）时，
  // validate / strict / selftest 都正确地变红，**而这份报告照样打印「18/18 条可构造为合规记录」
  // 并以 0 退出** —— 一份用来回答「数据够不够」的报告，给出了一个相反的全绿结论。
  //
  // 为什么这时必须非 0 退出：`audienceDropped` 不是「构造失败」，而是**构造成功但内容被
  // 静默清洗掉**。那条记录看起来像「本来就没写这一项」，页面上少一行而没有任何人知道。
  // 一个只打印、不判死的体检报告，在别人把它接进 CI 的那一刻就会变成假绿灯。
  for (const item of row.audienceDropped || []) {
    console.log(`      ⚠️ #${item.index} ${item.title} · ${item.field}${item.key ? '.' + item.key : ''}：${item.reason}`);
  }
}

const writeSideDropped = curated.report.reduce((n, row) => n + row.dropped.length, 0);
const writeSideCleaned = curated.report.reduce((n, row) => n + (row.audienceDropped || []).length, 0);

console.log('\n覆盖率低不是错误：没有依据就留空是正确结果，编数据才是失败。');

if (writeSideDropped || writeSideCleaned) {
  console.error(`\n❌ 书写期数据源不干净：无法构造 ${writeSideDropped} 条 · 声明了却被归一清洗掉 ${writeSideCleaned} 处。`);
  console.error('   后者最危险：它在报告里看起来像「本来就没写」，页面上少一行而没人知道。');
  process.exit(1);
}
