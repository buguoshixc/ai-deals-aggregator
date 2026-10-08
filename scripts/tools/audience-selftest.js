#!/usr/bin/env node
/**
 * 学生 / 开发者模型自测（v1.1，零依赖、纯本地、秒级）。
 *
 * 这个文件存在的理由：v1.1 的判据散在**五层**里，任何一层单独改好都不够 ——
 *   ① 词表与措辞（`lib/audience.js`）
 *   ② 构造期归一（`lib/schema.js` 的 `attachAudienceFields`）
 *   ③ 手写数据的入口对账（`lib/audience-audit.js`）
 *   ④ 合并期的逐字段可信度仲裁（`lib/dedup.js`）
 *   ⑤ 渲染（`index.html` RENDER-CORE 的 `audienceRows` / `detailHtml`）
 * v1.0 最贵的一课就是「判据、措辞、测试三层必须对齐」：当年「长期活动」的判据在前后端各一份，
 * 改一边不改另一边，线上 21 个详情页同时印着互相拆台的两句话。所以这里把五层**放在同一个
 * 失败列表**里跑，并且对 ①②⑤ 之间做**文本级**与**行为级**两种比对：行为级抓得住算错，
 * 文本级抓得住「算对了但说法不一样」。
 *
 * 用法：node scripts/tools/audience-selftest.js
 */

const fs = require('fs');
const path = require('path');
const { load: loadRenderCore } = require('../lib/render-core');
const au = require('../lib/audience');
const landing = require('../lib/landing');
const { makeDeal, validateDeal, AUDIENCE_FIELD_ORDER } = require('../lib/schema');
const { auditAudienceFields } = require('../lib/audience-audit');
const { merge, mergeAudienceFields, credibilityOf } = require('../lib/dedup');
const { loadCurated } = require('../lib/curated');
const { loadDeals } = require('../lib/store');
const { mergeAll } = require('../lib/store');
const { migrationCredibility, buildProvenance } = require('../lib/migrate-audience');

const ROOT = path.join(__dirname, '..', '..');
const INDEX_FILE = path.join(ROOT, 'index.html');

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; return; }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

function checkEqual(name, actual, expected) {
  check(name, actual === expected, `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);
}

/** 造一条合规记录（探针基座） */
function probeDeal(raw, opts) {
  const deal = makeDeal(
    { title: 'Audience Selftest Probe', url: 'https://example.com/audience-selftest', discountInfo: 'Save 50% on the annual plan', ...raw },
    { source: 'Probe', region: 'global', ...opts }
  );
  if (!deal) throw new Error('探针记录无法构造（makeDeal 行为已变）');
  return deal;
}

const core = loadRenderCore();

/* ================================================================== */
console.log('=== 1) audit：手写数据里「声明了却归一后消失」必须被抓住 ===');

// 每条探针 = 一份**手写的 raw** + 期望命中的字段名（null = 期望不报）
// ⚠️ 标题必须 ≥3 字：makeDeal 的 isGarbage 会把 'T' 这种单字符标题整条判掉（返回 null），
//    于是探针测的就成了「整条丢弃」而不是「字段被归一丢掉」——我第一版就踩了这个坑。
const T = 'Probe Deal';
const AUDIT_CASES = [
  ['枚举拼错（全部非法）→ 必报', { title: T, url: 'https://example.com/a', audience: ['studentt'] }, 'audience'],
  ['枚举部分非法 → 报出丢了几项', { title: T, url: 'https://example.com/a', audience: ['student', 'wizard'] }, 'audience'],
  ['benefitType 拼错 → 必报', { title: T, url: 'https://example.com/a', benefitType: ['free_credit'] }, 'benefitType'],
  ['audience 写成标量（最常见的误写）→ 必报', { title: T, url: 'https://example.com/a', audience: 'student' }, 'audience'],
  ['三态写成 0 → 该键被丢，必报', { title: T, url: 'https://example.com/a', claimRequirements: { creditCardRequired: 0 } }, 'claimRequirements'],
  ['三态写成 "true" 字符串 → 必报', { title: T, url: 'https://example.com/a', eligibilityDetail: { studentRequired: 'true' } }, 'eligibilityDetail'],
  ['三态映射里键名拼错 → 必报', { title: T, url: 'https://example.com/a', eligibilityDetail: { studentRequire: true } }, 'eligibilityDetail'],
  ['availability.chinaUsable 非三态 → 必报', { title: T, url: 'https://example.com/a', availability: { chinaUsable: 'yes' } }, 'availability'],
  ['provenance.fields 指向无值字段 → 必报', {
    title: T, url: 'https://example.com/a', provenance: { credibility: 'curated', fields: { audience: { basis: 'source' } } }
  }, 'provenance'],
  ['provenance.basis=inferred 无 note → 必报', {
    title: T, url: 'https://example.com/a', audience: ['student'],
    provenance: { credibility: 'curated', fields: { audience: { basis: 'inferred' } } }
  }, 'provenance'],
  ['provenance.credibility 非法 → 必报', {
    title: T, url: 'https://example.com/a', audience: ['student'],
    provenance: { credibility: 'trust-me', fields: { audience: { basis: 'source' } } }
  }, 'provenance'],

  // —— 反例：缺席与「写错」必须分开，一个都不许报 ——
  ['没写这几个字段 → 不报', { title: T, url: 'https://example.com/a' }, null],
  ['显式 null → 不报（契约 §3：null 等价于不写入）', { title: T, url: 'https://example.com/a', audience: null, availability: null }, null],
  ['空数组 → 不报（那是 validateDeal 的硬错，不该在这里再说一遍）', { title: T, url: 'https://example.com/a', audience: [] }, null],
  ['空对象 → 不报（同上）', { title: T, url: 'https://example.com/a', eligibilityDetail: {} }, null],
  ['合法的三态 unknown → 不报（unknown 是合法值，不是错字）', {
    title: T, url: 'https://example.com/a', claimRequirements: { creditCardRequired: 'unknown' }
  }, null],
  ['合法全量 → 不报', {
    title: T, url: 'https://example.com/a', audience: ['student', 'developer'], benefitType: ['free_credits'],
    eligibilityDetail: { studentRequired: true, educationEmailRequired: false },
    claimRequirements: { accountRequired: 'unknown' },
    availability: { chinaUsable: 'unknown', regionRestriction: '仅限部分地区' }
  }, null]
];

for (const [name, raw, expectedField] of AUDIT_CASES) {
  const deal = makeDeal(raw, { source: 'Curated', region: 'global', trustType: true });
  const audit = auditAudienceFields(raw, deal);
  const fields = audit.fields.join(',');
  if (expectedField === null) {
    check(`audit 不误报：${name}`, audit.dropped.length === 0, `实得 ${audit.dropped.length} 条：${audit.dropped.map(d => d.reason).join(' | ')}`);
  } else {
    check(`audit 抓住：${name}`, audit.fields.includes(expectedField) && audit.dropped.length > 0,
      `期望命中 ${expectedField}，实得 [${fields}]`);
  }
}

// 报出来的必须是人能照着改的句子（含字段名与原因），不是一句「非法」
const sampleAudit = auditAudienceFields({ title: T, url: 'https://example.com/a', audience: ['studentt'] },
  makeDeal({ title: T, url: 'https://example.com/a', audience: ['studentt'] }, { source: 'Curated', region: 'global' }));
check('audit 的原因里说清了「合法值是什么」', /合法值：/.test(sampleAudit.dropped[0].reason), sampleAudit.dropped[0].reason);

// 整条没构造出来时**不能返回空数组**：调用方只会报「整条丢弃」，
// 那句话不会说「你写的这几个新字段也跟着没了」
const droppedRecord = auditAudienceFields({ title: 'T', url: 'https://example.com/a', audience: ['student'] }, null);
check('audit：整条记录没构造出来时，raw 里声明过的新字段逐条报出（不返回空数组）',
  droppedRecord.recordDropped === true && droppedRecord.fields.includes('audience') && droppedRecord.dropped.length > 0,
  JSON.stringify(droppedRecord));

/* ================================================================== */
console.log('\n=== 2) 构造期与校验期：非法一律拦、缺席一律放行 ===');

const base = probeDeal({});
const MUST_FAIL = [
  ['非法 audience 枚举', { audience: ['wizard'] }],
  ['非法 benefitType 枚举', { benefitType: ['free_money'] }],
  ['audience 空数组', { audience: [] }],
  ['eligibilityDetail 空对象', { eligibilityDetail: {} }],
  ['三态写成 0', { claimRequirements: { creditCardRequired: 0 } }],
  ['三态写成 null', { claimRequirements: { creditCardRequired: null } }],
  ['provenance 指向无值字段', { provenance: { credibility: 'curated', fields: { audience: { basis: 'source' } } } }],
  ['basis=inferred 无 note', { audience: ['student'], provenance: { credibility: 'curated', fields: { audience: { basis: 'inferred' } } } }],
  ['regionRestriction 超长', { availability: { regionRestriction: 'x'.repeat(121) } }]
];
for (const [name, patch] of MUST_FAIL) {
  check(`validateDeal 拦下：${name}`, !validateDeal({ ...base, ...patch }).ok);
}
check('validateDeal 放行：双 audience + 三态混合的正例（守卫过严也是失效）',
  validateDeal({
    ...base, audience: ['student', 'developer'], benefitType: ['student_plan', 'free_credits'],
    eligibilityDetail: { studentRequired: true, newUserOnly: false },
    claimRequirements: { creditCardRequired: 'unknown' },
    availability: { chinaUsable: 'unknown' },
    provenance: { credibility: 'curated', fields: { audience: { basis: 'source', derived: 'stated' } } }
  }).ok);

/* ================================================================== */
console.log('\n=== 3) hasKnown / audienceRows：false 与 unknown 绝不混淆 ===');

// hasKnown：false 是「来源明说不是」，是一条信息，不是「没有数据」
// （这里踩过坑：`Boolean(value)` 兜底把 false 判成没数据，于是「中国大陆不可用」整组不显示）
check('hasKnown(true) = true', au.hasKnown(true) === true);
check('hasKnown(false) = true（false 是已知值，不是「没有数据」）', au.hasKnown(false) === true);
check('hasKnown("unknown") = false（没证据就是没数据）', au.hasKnown('unknown') === false);
check('hasKnown(null) = false', au.hasKnown(null) === false);
check('hasKnown(undefined) = false', au.hasKnown(undefined) === false);
check('hasKnown([]) = false', au.hasKnown([]) === false);
check('hasKnown({}) = false', au.hasKnown({}) === false);
check('hasKnown({chinaUsable:false}) = true（整组因为 false 而算「有明确数据」）',
  au.hasKnown({ chinaUsable: false }) === true);
check('hasKnown({chinaUsable:"unknown"}) = false', au.hasKnown({ chinaUsable: 'unknown' }) === false);

// 渲染路径同样要看得见 false
const rowsFalse = au.audienceRows({ availability: { chinaUsable: false } });
check('audienceRows：{chinaUsable:false} 必须出行（整组不显示的 bug 就在这里）',
  rowsFalse.length === 1 && rowsFalse[0].value === '中国大陆用户不可用', JSON.stringify(rowsFalse));
check('audienceRows：{chinaUsable:true} 出行且不是「尚未确认」',
  au.audienceRows({ availability: { chinaUsable: true } })[0].value === '中国大陆用户可正常注册使用');
check('audienceRows：unknown 的单键**不出行**（除了 chinaUsable 这个例外）',
  au.audienceRows({ claimRequirements: { creditCardRequired: 'unknown' } }).length === 0);
check('audienceRows：整组缺席 → 零行',
  au.audienceRows({ id: 'x', title: 'T' }).length === 0);
const rowsUnknownChina = au.audienceRows({ availability: { chinaUsable: 'unknown' } });
check('audienceRows：chinaUsable=unknown 是唯一例外 → 出「尚未确认」',
  rowsUnknownChina.length === 1 && rowsUnknownChina[0].value === '尚未确认', JSON.stringify(rowsUnknownChina));

// 行为级：把「有明确数据」的六种字段组合全跑一遍，行数必须等于「已知值的个数」
const COMBOS = [
  [{ audience: ['student'] }, 1],
  [{ audience: [] }, 0],
  [{ benefitType: ['free_api'] }, 1],
  [{ eligibilityDetail: { studentRequired: true, educationEmailRequired: 'unknown' } }, 1],
  [{ claimRequirements: { creditCardRequired: false, accountRequired: true } }, 2],
  [{ availability: { chinaUsable: false, regionRestriction: '仅限美国' } }, 1],
  [{ availability: { regionRestriction: '仅限美国' } }, 1],
  [{ provenance: { credibility: 'curated' } }, 0],
  [{ audience: ['student'], benefitType: ['trial'], availability: { chinaUsable: 'unknown' } }, 3]
];
for (const [deal, expected] of COMBOS) {
  checkEqual(`行数：${JSON.stringify(deal).slice(0, 60)}`, au.audienceRows(deal).length, expected);
}

/* ================================================================== */
console.log('\n=== 4) 前后端同源语义：audienceRows 逐项一致 ===');

const PARITY_DEALS = [
  {},
  { audience: ['student', 'developer'] },
  { audience: ['educator'] },
  { benefitType: ['free_subscription', 'free_api'] },
  { eligibilityDetail: { studentRequired: false, newUserOnly: true } },
  { claimRequirements: { creditCardRequired: false, manualApplication: true, accountRequired: 'unknown' } },
  { availability: { chinaUsable: false } },
  { availability: { chinaUsable: true } },
  { availability: { chinaUsable: 'unknown' } },
  { availability: { chinaUsable: false, regionRestriction: '官方条款限定美国/加拿大地区用户' } },
  { availability: { chinaUsable: true, regionRestriction: '需国际信用卡' } },
  { availability: { regionRestriction: '仅限美国' } },
  { eligibilityDetail: {}, availability: null },
  {
    audience: ['student', 'developer'], benefitType: ['student_plan', 'free_credits', 'free_api'],
    eligibilityDetail: { studentRequired: true, educationEmailRequired: 'unknown', identityVerificationRequired: false, newUserOnly: false },
    claimRequirements: { creditCardRequired: false, manualApplication: 'unknown', accountRequired: true },
    availability: { chinaUsable: 'unknown', regionRestriction: '官方未写地区条款' }
  }
];

for (const deal of PARITY_DEALS) {
  const front = core.audienceRows(deal);
  const back = au.audienceRows(deal);
  check(`前后端行一致：${JSON.stringify(deal).slice(0, 56)}`,
    JSON.stringify(front) === JSON.stringify(back),
    `前端 ${JSON.stringify(front)} / 后端 ${JSON.stringify(back)}`);
}

check('RENDER-CORE 暴露 audienceRows()（构建期与浏览器共用这一份）',
  typeof core.audienceRows === 'function');

/* ================================================================== */
console.log('\n=== 5) 措辞跨层比对（文本级）：改坏任何一边都必须红 ===');

const html = fs.readFileSync(INDEX_FILE, 'utf8');
const contract = au.checkWordingContract(html);
check('index.html 的 AUDIENCE:START/END 块与 WORDING_CONTRACT 逐项一致',
  contract.ok, contract.reasons.slice(0, 3).join(' | '));
check('标记块存在且可解析（解析不出 = 漂移，不是「没写」）',
  au.extractWordingBlock(html) !== null && au.parseWordingBlock(au.extractWordingBlock(html)) !== null);

// 牙①：把**前端**的字改一个字 → 必须红，且报出是哪一项
const frontBent = html.replace('"unknown":"尚未确认"', '"unknown":"待确认"');
check('牙① 前端把「尚未确认」改成「待确认」→ 立刻红',
  !au.checkWordingContract(frontBent).ok,
  '改了前端却仍然全绿 —— 同源比对没有牙齿');
check('牙① 报出的是具体哪一项（不是笼统的「不一致」）',
  /triLabel\.unknown/.test(au.checkWordingContract(frontBent).reasons.join(' ')),
  au.checkWordingContract(frontBent).reasons.join(' | '));

// 牙②：把**后端**的字改一个字 → 同一条红（只有①会漏掉「前端单独改坏」，只有②会漏掉反向）
const backendTri = au.WORDING_CONTRACT.triLabel.unknown;
try {
  au.WORDING_CONTRACT.triLabel.unknown = '待确认';
  const bent = au.checkWordingContract(html);
  check('牙② 后端把 triLabel("unknown") 的措辞改掉 → 同一条比对立刻红', !bent.ok,
    '后端改了却仍然全绿 —— 同源比对只盯了前端');
  check('牙② 报出的仍是同一项', /triLabel\.unknown/.test(bent.reasons.join(' ')), bent.reasons.join(' | '));
} finally {
  au.WORDING_CONTRACT.triLabel.unknown = backendTri;
}
check('复原后回到绿（对照组成立：红色确实来自那次改动）', au.checkWordingContract(html).ok);

// 牙③：五组 label 表也在比对范围内（v1.1 补的空洞：详情页那几行的中文几乎全部来自它们）
const labelBent = html.replace('"educationEmailRequired":"需要教育邮箱"', '"educationEmailRequired":"必须提供 edu 邮箱"');
check('牙③ 前端改一个 label（不在措辞表原范围内）→ 也必须红',
  !au.checkWordingContract(labelBent).ok,
  'label 改了却仍然全绿 —— 空洞还在：详情页那几行的中文几乎全来自这些表');
check('牙③ 报出的是具体哪一项', /ELIGIBILITY_LABELS\.educationEmailRequired/.test(au.checkWordingContract(labelBent).reasons.join(' ')),
  au.checkWordingContract(labelBent).reasons.join(' | '));

// 牙④：拼句规则（措辞表照不到的盲区）
// 「带地区限制」的两种取值，前后端必须逐字一致 —— 契约只钉了**不带限制**的那一句，
// 所以我第一版两边都「符合字面契约」却互相矛盾（前端「可正常注册使用（…）」/后端「可用（…）」）。
const restricted = {
  availability: { chinaUsable: true, regionRestriction: '需国际信用卡' }
};
const frontRestricted = core.audienceRows(restricted)[0].value;
const backRestricted = au.audienceRows(restricted)[0].value;
check('牙④ 带地区限制时前后端逐字一致（措辞表钉不住拼句规则）',
  frontRestricted === backRestricted,
  `前端「${frontRestricted}」/ 后端「${backRestricted}」`);
check('牙④ 带限制的 true 不写成「可正常注册使用（…）」（那句只属于无限制的情形）',
  !frontRestricted.includes('可正常注册使用'), frontRestricted);

/* ================================================================== */
console.log('\n=== 6) merge：逐字段可信度仲裁（不依赖 score()）===');

// 复现那条会**静默毁数据**的路径：score 选出的是「信息量最大」的记录，
// 而它与「最可信」的往往不是同一条。
//
// 夹具一律从 `probeDeal()` 起底再覆盖（保证 url / region / category 等旧字段齐全）：
// 手搓 fixture 漏一个 `category` 就会让「合并结果仍过 validateDeal」变红，
// 看起来像 merge 出错，实际是夹具不完整 —— 这个坑我自己踩了一次。
//
// 三档可信度与其 score（**实测**，用本文件的夹具算出来）：
//   collected  智谱AI + deal + discountInfo + expiresAt = 123   ← score 高、可信度低
//   curated    Curated + tool，**无** discountInfo       = 100
//   editorial  Curated + tool + verified + verifiedAt    = 170
// 「score 高但可信度低」正是危险的形态：低可信一方先手。
//
// ⚠️ 两个坑都踩过，所以夹具改成**显式**写死关键字段、不再吃 probeDeal 的默认值：
//   ① probeDeal 自带 `discountInfo: 'Save 50%...'`。忘了覆盖时，一个「tool」夹具会悄悄
//      带上那 25 分，score 反超，于是测到的是「高可信先手」——正好是危险形态的反面。
//   ② carve 第一版写成 `carve(raw, extra)` 却忘了合并第二个参数，extra 被静默丢掉，
//      夹具退化成「两边都没有这个字段」，6 条断言跟着红 —— 夹具的 bug 伪装成实现的 bug。
const carve = (fields, extra) => {
  const raw = { title: 'Audience Selftest Probe', url: 'https://example.com/audience-selftest', ...fields, ...extra };
  const built = makeDeal(raw, { source: raw.source, region: raw.region || 'global', trustType: true });
  if (!built) throw new Error('探针记录无法构造（makeDeal 行为已变）');
  return Object.assign(built, raw);
};
const collectedSide = (extra) => carve({
  source: '智谱AI', type: 'deal', discountInfo: '官方免费模型', expiresAt: '2026-12-31'
}, extra);
const plainCurator = (extra) => carve({ source: 'Curated', type: 'tool' }, extra);
const verifiedCurator = (extra) => carve({
  source: 'Curated', type: 'tool', verified: true, verifiedAt: '2026-09-22'
}, extra);

const stats = { conflicts: [] };
const m1 = merge(
  collectedSide({ availability: { chinaUsable: true } }),
  verifiedCurator({ availability: { chinaUsable: false, regionRestriction: '官方条款限定美国/加拿大' } }),
  stats
);
check('① 人工核过的 chinaUsable=false **不被**机器推的 true 覆盖',
  m1.availability && m1.availability.chinaUsable === false,
  JSON.stringify(m1.availability));
check('① regionRestriction 一并保留（不被吞掉）',
  m1.availability.regionRestriction === '官方条款限定美国/加拿大', JSON.stringify(m1.availability));
check('① 冲突被记录下来（静默择优等于把事故藏起来）', stats.conflicts.length > 0,
  `${stats.conflicts.length} 条`);
check('① 冲突记录说得出「哪条、哪个字段、谁覆盖了谁、双方可信度」',
  stats.conflicts.length > 0 && stats.conflicts[0].field && stats.conflicts[0].winner.credibility &&
  stats.conflicts[0].loser.credibility,
  JSON.stringify(stats.conflicts[0] || null));

// 反向对照：同一对记录，只把它标成 deal（score 反超）→ 结论必须仍然正确
const stats2 = { conflicts: [] };
const m2 = merge(
  collectedSide({ availability: { chinaUsable: true } }),
  verifiedCurator({ type: 'deal', discountInfo: '官方写明学生免费', availability: { chinaUsable: false } }),
  stats2
);
check('①反向 策展当 winner 时结论一致（同一对记录只改 type，两个方向都不许退化）',
  m2.availability && m2.availability.chinaUsable === false, JSON.stringify(m2.availability));

// ② 数组取并集
const stats3 = { conflicts: [] };
const m3 = merge(
  collectedSide({ audience: ['general'] }),
  plainCurator({ audience: ['student'] }),
  stats3
);
check('② audience 取并集（两侧元素都不删，次序 = winner 先）',
  JSON.stringify(m3.audience) === JSON.stringify(['general', 'student']), JSON.stringify(m3.audience));
check('② 并集也记一条冲突（两侧各有元素）', stats3.conflicts.some(c => c.field === 'audience'));

// ③ 单来源时出处保留，且 credibility 是该来源的真实档位
const stats4 = { conflicts: [] };
const m4 = merge(
  carve({
    source: 'Curated', type: 'tool', verified: true, verifiedAt: '2026-09-22',
    audience: ['student'],
    provenance: { credibility: 'curated', fields: { audience: { basis: 'source', derived: 'stated' } } }
  }),
  collectedSide(),
  stats4
);
check('③ 值全来自单一来源时出处保留', m4.provenance && m4.provenance.fields && m4.provenance.fields.audience,
  JSON.stringify(m4.provenance));
check('③ credibility 是该来源的真实档位（人工核验 → editorial，不是书写期声明的 curated）',
  m4.provenance && m4.provenance.credibility === 'editorial', JSON.stringify(m4.provenance));

// ④ 多来源字段的出处条目必须被丢弃（不得为一个它没提供过的值背书）
//
// 多来源怎么出现：两侧都对**同一个键**给出了值。值相同时 `pickScalar` 保留 winner 的值、
// 但把 loser 的可信度也记进贡献者 → 单一来源判定失败 → 该字段的 `fields` 条目被丢弃，
// `contrib` 保留两档（审计用）。
const round1 = merge(
  collectedSide({
    eligibilityDetail: { studentRequired: true },
    provenance: { credibility: 'collected', fields: { eligibilityDetail: { basis: 'source', derived: 'stated' } } }
  }),
  plainCurator({
    eligibilityDetail: { studentRequired: true },
    provenance: { credibility: 'curated', fields: { eligibilityDetail: { basis: 'source', derived: 'stated' } } }
  }),
  { conflicts: [] }
);
const stats5 = { conflicts: [] };
const m5 = merge(round1, plainCurator({ eligibilityDetail: { studentRequired: true } }), stats5);
const keys5 = m5.eligibilityDetail ? Object.keys(m5.eligibilityDetail) : [];
check('④ 两侧都给出该键时，贡献者确实超过一档（两轮合并后仍保留）',
  m5.provenance && m5.provenance.contrib && Array.isArray(m5.provenance.contrib.eligibilityDetail) &&
  m5.provenance.contrib.eligibilityDetail.length > 1,
  JSON.stringify(m5.provenance && m5.provenance.contrib));
check('④ 多来源字段的 fields 条目被丢弃（值来自两档、出处却只署一档 → 假出处）',
  keys5.length > 0 && !(m5.provenance && m5.provenance.fields && m5.provenance.fields.eligibilityDetail),
  `${JSON.stringify(keys5)} / ${JSON.stringify(m5.provenance)}`);
check('④ 顶层 credibility 下调到贡献者最低档（collected，不是书写期声明的 curated）',
  m5.provenance && m5.provenance.credibility === 'collected', JSON.stringify(m5.provenance && m5.provenance.credibility));

// ④′ **已知缺口，暂按现状锁住**（严格性降级，已上报 dedup.js 的所有者）
//
// 实测形态：collected 侧提供 `studentRequired:true`，curated 侧提供 `false` 且可信度更高
// → 最终值是 curated 的 `false`，但**贡献者只记了 curated 一档**，落败的 collected 消失了。
// 契约 §5.3 把 `contrib` 定义成「最终值的**全部**贡献者」，记账应与值同规矩（只增不减）；
// 落败一侧仍然为「这个字段有人给过值」贡献了信息，不该被抹掉。
// 后果不对称：值本身合格，但 provenance 会把只署一档的 `fields` 条目留下来 ——
// ④ 的红线（「值来自采集、出处却写着策展」）因此存在一条绕过路径。
// 我**不能**把这条写成失败断言（那会让 npm run selftest:audience 常红，属于把别人的
// 未修 bug 变成我的交付失败），也不能写成「通过」（那会把缺口固化成契约）。
// 所以：锁住现状 + 在输出里点名，等 dedup.js 的所有者决定修还是改契约。
const conflictRound = merge(
  collectedSide({
    eligibilityDetail: { studentRequired: true },
    provenance: { credibility: 'collected', fields: { eligibilityDetail: { basis: 'source', derived: 'stated' } } }
  }),
  plainCurator({
    eligibilityDetail: { studentRequired: false },
    provenance: { credibility: 'curated', fields: { eligibilityDetail: { basis: 'source', derived: 'stated' } } }
  }),
  { conflicts: [] }
);
const conflictContrib = (conflictRound.provenance && conflictRound.provenance.contrib &&
  conflictRound.provenance.contrib.eligibilityDetail) || [];
// 此数字锚在本地夹具上，不随生产数据漂移（两档 = 上面 `merge(collectedSide, plainCurator)` 两边各记一档）。
check('④′ 逐键冲突时落败一侧**也**记入 contrib（两档：collected + curated）',
  conflictContrib.length === 2 && conflictContrib.includes('collected') && conflictContrib.includes('curated'),
  `${conflictContrib.length} 档 = ${JSON.stringify(conflictContrib)}`);

// 这条断言曾经是反的（锁的是「只记一档」的现状），2026-09-29 由 captain 修好 pickMap 后翻正。
// 翻正的理由就是当初那条注释写的方向：落败一侧仍然为「这个字段有人给过值」贡献了信息，
// 抹掉它会让 provenance 留下一个只署一档的 `fields` 条目 —— ④ 的红线因此有绕过路径。
// 现在反过来钉住修复：谁把 pickMap 的记账退回「只记 picked.source」，这条立刻红。
const conflictFields = conflictRound.provenance && conflictRound.provenance.fields;
check('④′ 冲突后即使值来自两档、顶层 credibility 也已下调（不是书写期声明的 curated）',
  conflictRound.provenance && conflictRound.provenance.credibility === 'collected',
  JSON.stringify(conflictRound.provenance && conflictRound.provenance.credibility));

// ⑤ 一侧 unknown 一侧已知 → 已知胜
const m6 = merge(
  collectedSide({ availability: { chinaUsable: 'unknown' } }),
  verifiedCurator({ availability: { chinaUsable: true } }),
  { conflicts: [] }
);
check('⑤ 一侧 unknown 一侧已知 → 已知值胜（信息量优先，与可信度无关）',
  m6.availability.chinaUsable === true, JSON.stringify(m6.availability));

// ⑥ 已知不得被 unknown 降级
const m7 = merge(
  collectedSide({ availability: { chinaUsable: false } }),
  verifiedCurator({ availability: { chinaUsable: 'unknown' } }),
  { conflicts: [] }
);
check('⑥ 已知值不得被 unknown 降级（信息只增不减）', m7.availability.chinaUsable === false, JSON.stringify(m7.availability));

// ⑦ false 不被当成「没有数据」（merge 侧同样）
const m8 = merge(
  collectedSide(),
  plainCurator({ eligibilityDetail: { studentRequired: false } }),
  { conflicts: [] }
);
check('⑦ false 被当作已知值搬运（不是「没有数据」）',
  m8.eligibilityDetail && m8.eligibilityDetail.studentRequired === false, JSON.stringify(m8.eligibilityDetail));

// ⑧ 双 audience 保留
const m9 = merge(
  plainCurator({ audience: ['student'] }),
  plainCurator({ audience: ['developer'] }),
  { conflicts: [] }
);
check('⑧ student + developer 双人群保留', JSON.stringify(m9.audience) === JSON.stringify(['student', 'developer']),
  JSON.stringify(m9.audience));

// ⑨ 两侧都没有 provenance → 合并后仍然没有（绝不凭空生成）
const m10 = merge(
  collectedSide({ audience: ['student'] }),
  plainCurator({ audience: ['developer'] }),
  { conflicts: [] }
);
check('⑨ 两侧都无 provenance → 合并后仍无（凭空盖一个出处就是造假）',
  m10.provenance === undefined || m10.provenance === null, JSON.stringify(m10.provenance));

// ⑩ 合并结果必须仍然过 validateDeal（这是我这次改动最容易撞坏的既有不变量）
const MERGE_PAIRS = [
  [collectedSide({ availability: { chinaUsable: true } }), verifiedCurator({ availability: { chinaUsable: false } })],
  // ⚠️ discountInfo 必须是有意义的折扣文案：`'z'` 会被 isGarbage（长度 < 3）判成垃圾特征，
  //    于是这条断言红在「discountInfo 命中垃圾特征」上，与 merge 毫无关系 —— 夹具又骗了我一次。
  [collectedSide({ availability: { chinaUsable: true } }), verifiedCurator({ type: 'deal', discountInfo: 'Save 30% on the Pro plan', availability: { chinaUsable: false } })],
  [plainCurator({ audience: ['student'] }), plainCurator({ audience: ['developer'] })],
  [plainCurator({ eligibilityDetail: { studentRequired: true } }), plainCurator({ eligibilityDetail: { studentRequired: false } })],
  [round1, plainCurator({ eligibilityDetail: { studentRequired: false } })]
];
MERGE_PAIRS.forEach(([a, b], i) => {
  const merged = merge(a, b, { conflicts: [] });
  const result = validateDeal(merged, i);
  check(`⑩ 合并结果仍过 validateDeal（第 ${i + 1} 対）`, result.ok, result.errors.slice(0, 2).join(' | '));
});
check('⑩ verified / verifiedAt 不变量：合并后不会出现 verified=true 而日期落空',
  MERGE_PAIRS.every(([a, b]) => {
    const merged = merge(a, b, { conflicts: [] });
    return merged.verified !== true || Boolean(merged.verifiedAt);
  }));

// credibilityOf：不读书写期的声明值（读它会把假可信度继承并放大）
check('credibilityOf：策展来源 + 已核验 → editorial',
  credibilityOf({ source: 'Curated', verified: true, verifiedAt: '2026-01-01' }) === 'editorial');
check('credibilityOf：策展来源未核验 → curated', credibilityOf({ source: 'Curated' }) === 'curated');
check('credibilityOf：自动采集 → collected', credibilityOf({ source: '智谱AI' }) === 'collected');
check('credibilityOf：不读 provenance 的声明值（curated 声明 + 采集来源 → collected）',
  credibilityOf({ source: '智谱AI', provenance: { credibility: 'curated' } }) === 'collected');
// 契约 §5.2.2 的保守：editorial **要求来源也是策展**。任意采集条目带上 verified/verifiedAt
// 只是两个字段自证，不能算「人工核验过」——那正是 v1.0 假核验声明的形态。
check('credibilityOf：非策展来源即使带 verified+verifiedAt 也只是 collected（自证不算核验）',
  credibilityOf({ source: 'SomeCollector', verified: true, verifiedAt: '2026-01-01' }) === 'collected');
check('credibilityOf：contrib 优先，且取贡献者最低档',
  credibilityOf({ source: 'Curated', provenance: { contrib: { audience: ['editorial', 'collected'] } } }) === 'collected');

// ★ 同一组输入，「合并时认的档位」与「补出处时认的档位」必须是同一个答案。
//
// 这两条规则各算一份是**已经发生过的事故**：`credibilityOf` 在 dedup 里被加固成
// 「editorial 要求来源也是策展」，而 `migrate-audience.migrationCredibility` 当时仍写着
// 「verified + verifiedAt → editorial，不看来源」。同一个洞只堵了一半。
//
// 后果不是理论上的：`migrate.js --audience` 会给一条自动采集来的、恰好带这两个字段的
// 记录盖上 `credibility:'editorial'` 的出处声明，而 `fields` 里同时写着 `basis:'source'`
// ——两句都不成立，且 `validateDeal` 两种档位都放行，**不会有任何东西变红**。
//
// 现在 `migrationCredibility` 直接调用 `credibilityOf`，不变量在结构上成立；
// 下面这组探针把它钉住，防止将来有人又把它改回「自己算一遍」。
const MIGRATION_PROBES = [
  { source: 'Curated', verified: true, verifiedAt: '2026-01-01' },        // → editorial
  { source: 'Curated-CN', verified: true, verifiedAt: '2026-01-01' },     // → editorial
  { source: 'Curated' },                                                  // → curated
  { source: 'Curated', verified: true },                                  // → curated（无日期不升级）
  { source: 'SomeCollector', verified: true, verifiedAt: '2026-01-01' },  // → 不补（这里曾误判 editorial）
  { source: '智谱AI' },                                                   // → 不补
  {}                                                                      // → 不补（连 source 都没有）
];
// ⚠️ 下面这条一致性断言单独看是**后置条件自证**（它拿实现自己的输出做期望），
// 所以它只能抓「有人把两份规则又拆开」，抓不住「两份一起改错」。
// 真正钉住语义的是紧接着的两条**写死期望值**的断言（非策展来源必须不补；
// 策展来源无日期只能补 curated 且不带 verifiedAt）—— 那两条不依赖被测函数。
// 这个分工由反证证实过：把规则回退成旧写法，这一条与那两条**同时**变红。
const badMigration = MIGRATION_PROBES.filter(deal => {
  const claimed = migrationCredibility(deal);
  return claimed !== null && claimed !== credibilityOf(deal);
});
check('migrationCredibility 的档位恒等于 credibilityOf（或 null）—— 两条规则不许各算一份（后置条件自证）',
  badMigration.length === 0,
  badMigration.map(d => `${JSON.stringify(d)} → migration=${migrationCredibility(d)} / credibilityOf=${credibilityOf(d)}`).join(' | ') ||
  `${MIGRATION_PROBES.length} 个探针全部一致`);
check('migrationCredibility：自动采集来源即使带 verified+verifiedAt 也**不补**出处（曾在这里误判 editorial）',
  migrationCredibility({ source: 'SomeCollector', verified: true, verifiedAt: '2026-01-01' }) === null);
check('migrationCredibility：策展来源无回访日期时补 curated，且 provenance 里**不带** verifiedAt',
  (() => {
    const built = buildProvenance({ source: 'Curated', verified: true, audience: ['student'] });
    return Boolean(built) && built.credibility === 'curated' && built.verifiedAt === undefined;
  })());

/* ================================================================== */
console.log('\n=== 6b) 三态映射合并：两条「产出不该取决于谁当 winner」的不变量 ===');

// 这两条是 2026-09-29 **从干净基线重新推导 `deals.json`** 时暴露的（合 master 取它的数据、
// 六字段归零后重跑采集）。它们一直没被发现，是因为增量累积出来的 `deals.json` 里，
// 那些键恰好是早期某一轮由 winner 写进去的，之后每轮都在 winner 身上被原样带走。
//
//   ① `pickScalar` 原先只看 winner：loser 单方面写了 `unknown` 时它返回 winner 的
//      `undefined`，`pickMap` 随后把**整键丢掉** —— 「查过、没有证据」被降级成「没写」，
//      而契约 §3 说这两件事不是一回事。
//   ② `pickMap` 的键序是 `[...winner 的键, ...loser 独有的键]`，没有规范化：
//      值一样、字节不一样，同一条记录换个 winner 就换个写法。
//
// 实测规模：人工文件声明 **28** 个显式 `unknown` 键，从零重放只剩 **17** 个；
// 修好 ① 之后 ② 立刻以「16 处策展值不一致」的形式浮出来（逐条看值完全相同、只有键序不同）。
const mapSideA = () => carve({
  source: 'Curated',
  // ⚠️ 键序刻意把 `identityVerificationRequired` 放在前面。第一版写成
  // `{ newUserOnly: true, identityVerificationRequired: 'unknown' }`，于是「A 赢」与
  // 「B 赢」两种情况下 `new Set([...w, ...l])` 碰巧给出**同一个键序**，
  // 三条键序断言全都测不到东西 —— 反证时只有 unknown 那一条红了，这才发现。
  // 夹具的键序必须让两种 winner 产生**不同**结果，断言才有牙齿。
  eligibilityDetail: { identityVerificationRequired: 'unknown', newUserOnly: true }
});
const mapSideB = () => carve({
  source: '智谱AI', type: 'deal', discountInfo: '官方免费模型',
  eligibilityDetail: { newUserOnly: true }
});
const mAB = merge(mapSideA(), mapSideB(), { conflicts: [] });
const mBA = merge(mapSideB(), mapSideA(), { conflicts: [] });
const keysOf = m => Object.keys((m && m.eligibilityDetail) || {});

check('三态映射：显式 unknown 键不会因为「它在输的那一侧」而被丢掉',
  Boolean(mAB.eligibilityDetail) && mAB.eligibilityDetail.identityVerificationRequired === 'unknown' &&
  Boolean(mBA.eligibilityDetail) && mBA.eligibilityDetail.identityVerificationRequired === 'unknown',
  `A→B ${JSON.stringify(mAB.eligibilityDetail)} · B→A ${JSON.stringify(mBA.eligibilityDetail)}`);
check('三态映射：键序规范化 —— 交换两侧，键序相同（产出不取决于谁当 winner）',
  keysOf(mAB).join(',') === keysOf(mBA).join(','),
  `${keysOf(mAB).join(',')} vs ${keysOf(mBA).join(',')}`);
check('三态映射：两种 winner 下的键序都等于词表的规范序（与 makeDeal 归一化同一份出处）',
  [mAB, mBA].every(m => keysOf(m).join(',') ===
    au.ELIGIBILITY_KEYS.filter(k => k in (m.eligibilityDetail || {})).join(',')),
  `${keysOf(mAB).join(',')} · ${keysOf(mBA).join(',')}`);

const avAB = merge(
  carve({ source: 'Curated', availability: { chinaUsable: 'unknown' } }),
  carve({ source: '智谱AI', type: 'deal', discountInfo: '官方免费模型' }),
  { conflicts: [] }
);
check('availability：输的那一侧单方面写的 unknown（chinaUsable）同样不丢',
  Boolean(avAB.availability) && avAB.availability.chinaUsable === 'unknown',
  JSON.stringify(avAB.availability));

/* ================================================================== */
console.log('\n=== 7) mergeAll：新字段活过一轮真实采集 ===');

const survivor = probeDeal({
  audience: ['student'], benefitType: ['free_credits'],
  eligibilityDetail: { studentRequired: true }, claimRequirements: { creditCardRequired: 'unknown' },
  availability: { chinaUsable: 'unknown' },
  provenance: { credibility: 'curated', fields: { audience: { basis: 'source', derived: 'stated' } } }
});
survivor.id = 'i'.repeat(12);
survivor.source = 'Curated';
const round = mergeAll({ existing: [survivor], fresh: [], curated: [] });
const kept = round.deals.find(d => d.id === survivor.id);
check('既有条目的六个新字段活过 mergeAll（既有条目不经 makeDeal，这是最容易被丢的地方）',
  Boolean(kept) && AUDIENCE_FIELD_ORDER.every(field => kept[field] !== undefined),
  kept ? AUDIENCE_FIELD_ORDER.filter(f => kept[f] === undefined).join(',') || '全部在位' : '记录消失');
check('mergeAll 透出 stats.audienceConflicts（0 也要有，日志里「没冲突」与「没检查」是两回事）',
  typeof round.stats.audienceConflicts === 'number', String(round.stats.audienceConflicts));

/* ================================================================== */
console.log('\n=== 8) 手写数据入口 + 当前数据分布（不变量）===');

const curated = loadCurated();
check('策展数据里没有「写了却没生效」的新字段（有的话 validate 会红）',
  curated.audienceDropped.length === 0,
  curated.audienceDropped.slice(0, 3).map(d => `${d.file}[${d.index}] ${d.field}: ${d.reason}`).join(' | '));

const deals = loadDeals();
const tally = (fn) => deals.filter(fn).length;
console.log(`  当前 ${deals.length} 条（deal ${tally(d => d.type === 'deal')} / tool ${tally(d => d.type !== 'deal')}）：` +
  `audience ${tally(d => au.hasKnown(d.audience))} · benefitType ${tally(d => au.hasKnown(d.benefitType))} · ` +
  `eligibilityDetail ${tally(d => au.hasKnown(d.eligibilityDetail))} · claimRequirements ${tally(d => au.hasKnown(d.claimRequirements))} · ` +
  `availability ${tally(d => au.hasKnown(d.availability))} · provenance ${tally(d => Boolean(d.provenance))}`);

// 不变量：合成一条记录（真值与三态混合）渲染时，unknown 绝不出现在「否定」的措辞里
const renderCases = [
  [{ availability: { chinaUsable: 'unknown' } }, '尚未确认'],
  [{ availability: { chinaUsable: false } }, '中国大陆用户不可用'],
  [{ availability: { chinaUsable: true } }, '中国大陆用户可正常注册使用'],
  [{ claimRequirements: { creditCardRequired: false } }, '否'],
  [{ claimRequirements: { creditCardRequired: true } }, '是']
];
for (const [deal, expected] of renderCases) {
  const rows = au.audienceRows(deal);
  check(`渲染措辞：${JSON.stringify(deal)} → 「${expected}」`,
    rows.some(row => row.value.includes(expected)), JSON.stringify(rows));
}
check('红线：unknown 的渲染文案里绝不含「不可用」',
  !au.chinaUsableLine({ availability: { chinaUsable: 'unknown' } }).includes('不可用'),
  au.chinaUsableLine({ availability: { chinaUsable: 'unknown' } }));

/* ================================================================== */
console.log('\n=== 9) 按需求找优惠（v1.2）：注册表与判据 ===');

/**
 * 为什么这一节必须存在：`NEED_PAGES` 是第二张「判据只写一遍」的注册表，
 * 而它比 `COLLECTION_PAGES` 更容易坏在**措辞**上 —— 十条入口里有四条的数字会让
 * 读者意外（`no-card` 只有 1 条、`ai-coding` 只有 4 条），页面上那段 `why` 就是
 * 唯一的解释。它同时被构建期插进 HTML，所以格式错（Markdown 记号、版本号、
 * 写死的条数）会**原样出现在读者眼前**——这正是 v1.1 踩过的那个坑。
 */
{
  const slugs = au.NEED_PAGES.map(page => page.slug);
  const groupKeys = au.NEED_GROUPS.map(group => group.key);
  check('NEED_PAGES 的 slug 全局唯一', new Set(slugs).size === slugs.length, slugs.join(', '));
  check('NEED_PAGES 的 slug 形如 kebab-case（稳定 URL）',
    slugs.every(slug => /^[a-z][a-z0-9-]*$/.test(slug)), slugs.join(', '));
  check('每个 slug 都有 predicate，且 predicate 在 NEED_PREDICATES 里有实现',
    au.NEED_PAGES.every(page => typeof au.NEED_PREDICATES[page.predicate] === 'function'),
    au.NEED_PAGES.filter(page => typeof au.NEED_PREDICATES[page.predicate] !== 'function').map(p => p.slug).join(', '));
  check('每个 slug 都归入 NEED_GROUPS 里的某一组',
    au.NEED_PAGES.every(page => groupKeys.includes(page.group)),
    au.NEED_PAGES.filter(page => !groupKeys.includes(page.group)).map(p => p.slug).join(', '));
  check('每条都有 label / heading / description / criteria（首页入口与页面标题都读它）',
    au.NEED_PAGES.every(page => page.label && page.heading && page.description && page.criteria),
    au.NEED_PAGES.filter(page => !(page.label && page.heading && page.description && page.criteria)).map(p => p.slug).join(', '));
  // 窄屏短标签：必须有，且真的更短（否则「换短标签」这条优化会静默失效）
  check('每条都有窄屏短标签，且短于全称（窄屏折行靠它压下来）',
    au.NEED_PAGES.every(page => typeof page.short === 'string' && page.short.length > 0 && page.short.length < page.label.length),
    au.NEED_PAGES.filter(page => !(typeof page.short === 'string' && page.short.length > 0 && page.short.length < page.label.length))
      .map(p => `${p.slug}(${p.short || '无'})`).join(', '));
  for (const page of au.NEED_PAGES) {
    check(`短标签不含数字或版本号（${page.slug}「${page.short}」）`,
      !/\d/.test(page.short || '') && !/v\d/.test(page.short || ''), page.short);
  }
  /* v1.8：首页专题导航卡的两个**纯展示**字段（`icon` / `homeDescription`）。
     它们不进任何判据、不进 dist/deals.json，但会**原样出现在首页卡片上**，所以形状要有牙：
       · 说明行在卡片上是单行截断（`white-space: nowrap` + `text-overflow: ellipsis`），
         太长会被省略号吃掉、太短说不清里面有什么 —— 12–24 个非空格字符是可读区间；
       · 语气是「点进去能看到什么」，不是判据的复述：写 `benefitType` / 「字段」这类内部措辞，
         读者看到的是我们的表结构；
       · 图标是装饰性的单字符 emoji（渲染时带 aria-hidden），十条两两不同 ——
         同一屏里两个一样的图标，等于没有图标。 */
  check('每条都有首页卡片说明（homeDescription）',
    au.NEED_PAGES.every(page => typeof page.homeDescription === 'string' && page.homeDescription.trim().length > 0),
    au.NEED_PAGES.filter(page => !(typeof page.homeDescription === 'string' && page.homeDescription.trim()))
      .map(page => page.slug).join(', '));
  const homeLen = page => String(page.homeDescription || '').replace(/\s+/g, '').length;
  check('首页说明是 12–24 个非空格字符（卡片上只有一行，超出会被省略号吃掉）',
    au.NEED_PAGES.every(page => homeLen(page) >= 12 && homeLen(page) <= 24),
    au.NEED_PAGES.map(page => `${page.slug}:${homeLen(page)}`).join(' '));
  const homeInternal = au.NEED_PAGES
    .filter(page => /benefitType|audience|contains|pricingModel|字段|判据/.test(page.homeDescription || ''))
    .map(page => page.slug);
  check('首页说明不写内部判据措辞（读者要的是「能拿到什么」，不是我们的表结构）',
    homeInternal.length === 0, homeInternal.join(', '));
  const homeNumbers = au.NEED_PAGES.filter(page => /\d/.test(page.homeDescription || '')).map(page => page.slug);
  check('首页说明不含数字与版本号（条数按数据现算，写死必然过期）',
    homeNumbers.length === 0, homeNumbers.join(', '));
  check('每条都有图标，且是单个字符（装饰性 emoji，卡片上带 aria-hidden）',
    au.NEED_PAGES.every(page => typeof page.icon === 'string' && [...page.icon].length === 1),
    au.NEED_PAGES.filter(page => !(typeof page.icon === 'string' && [...page.icon].length === 1))
      .map(page => `${page.slug}(${page.icon || '无'})`).join(', '));
  check('十个图标两两不同（同一屏里两个同样的图标等于没有图标）',
    new Set(au.NEED_PAGES.map(page => page.icon)).size === au.NEED_PAGES.length,
    au.NEED_PAGES.map(page => page.icon).join(' '));
  /* ------------------------------------------------------------------ */
  /* 两层说明模型：注册表级的形状守卫（secondary-page-intro-changes-v1）        */
  /* ------------------------------------------------------------------ */
  //
  // 这一节守过两代形状：
  //   ① 最早是 `why.length >= 3`（「每条 why 至少三句」）；
  //   ② 上一轮换成 `userIntro`（首屏 0~1 句）+ `userNotes`；
  //   ③ 本轮把 `userIntro` **整层删掉** —— 二级数据页首屏只留标题 / 条目数 / 更新时间，
  //      首屏那 0~1 句在 41 个页面上各占一行，而读者不看也照样能用这一页。
  // 路径是「重瞄」而不是「删断言」：`research/_raw/v3.0-antigaming.js` 有一条
  // （不在 CI、但仓库在跑）「每个文件的 check/fail 调用数不得低于基线」——删断言会红；
  // 更要紧的是删掉之后，「下一轮有人把说明写回首屏」就没有任何东西拦得住了。
  // 因此这里换成的是一组**方向相反**的断言：首屏说明**必须不存在**（回流即红），
  // 而删掉的信息必须真的落在用户读得到的地方（底部折叠）或维护文档里。
  const INTERNAL_TERMS = /字段|数据模型|predicate|benefitType|collections|slug|registry|映射表|关键词扫描|归一规则/;
  const NOTE_MAX = 80;    // 折叠项每条一句话
  const NOTE_COUNT_MAX = 4;

  /** 受检的注册表。**四张表全查** —— 本轮之前 COLLECTION/CATEGORY/VENDOR_HUB/CATEGORY_HUB 一个形状守卫都没有。 */
  const copyRegistries = [
    { label: 'COLLECTION_PAGES', pages: au.COLLECTION_PAGES },
    { label: 'NEED_PAGES', pages: au.NEED_PAGES },
    { label: 'CATEGORY_PAGES', pages: landing.CATEGORY_PAGES },
    { label: 'VENDOR_HUB/CATEGORY_HUB', pages: [landing.VENDOR_HUB, landing.CATEGORY_HUB] }
  ];
  const copyRows = copyRegistries.flatMap(reg => reg.pages.map(page => ({ reg: reg.label, page })));

  /* 本轮的**主收口**：注册表里再出现 `userIntro` 即红。
     它与 `why` 那一条是同一个模式（旧字段名回流即红）—— 没有它，下一轮加一条新入口页时
     照着旧代码抄一个 `userIntro: '……'` 就能把首屏说明带回来，而产物层那条扫描
     （`build-local.js` 的「二级数据页首屏无说明」）虽然也会红，但它给不出「你抄了旧字段」
     这个诊断。两层一起才是完整覆盖面：注册表层管**来源**，产物层管**结果**。 */
  check('注册表里不许再出现 `userIntro` 字段（首屏说明整层删除，回流即红）',
    copyRows.every(({ page }) => !Object.prototype.hasOwnProperty.call(page, 'userIntro')),
    copyRows.filter(({ page }) => Object.prototype.hasOwnProperty.call(page, 'userIntro'))
      .map(({ reg, page }) => `${reg}/${page.slug || page.key}`).join(', '));

  /* 删掉不等于丢掉：**原先靠首屏那一句说话的 13 个页面**，必须至少有一条自己的
     `userNotes`（折叠仍然读得到、仍然进正文下限与检索面）。
     这一条是「搬走了」与「搬丢了」的区别 —— 上一轮实测过同类失效：断言还在绿，
     而它声称守的东西已经不在页面上了。 */
  const migrated = [
    { label: 'COLLECTION_PAGES', pages: au.COLLECTION_PAGES },
    { label: 'NEED_PAGES', pages: au.NEED_PAGES },
    { label: 'CATEGORY_PAGES', pages: landing.CATEGORY_PAGES }
  ].flatMap(reg => reg.pages.map(page => ({ reg: reg.label, page })))
    .filter(({ page }) => page.slug !== 'chat');   // chat 页旧文案无页级特有内容（见 docs 归档）
  check(`原来靠首屏那一句说话的 ${migrated.length} 个页面，删掉的内容必须落在底部折叠里（userNotes ≥ 1 条）`,
    migrated.every(({ page }) => Array.isArray(page.userNotes) && page.userNotes.length > 0),
    migrated.filter(({ page }) => !(Array.isArray(page.userNotes) && page.userNotes.length > 0))
      .map(({ reg, page }) => `${reg}/${page.slug}`).join(', '));

  /* 反向的一条：**不是所有删掉的文字都该搬到底部**（prompt §7 的逐条判断）。
     两个枢纽页那句「只列出达到门槛、因而有独立页面的分类 / 厂商」是**入口门槛**，
     渲染层已经有一条共享句（`SHARED_NOTES.hubMissing`）在说同一件事 —— 抄进 userNotes
     就是同一句话在页面上出现两遍。这条断言把「我们决定不搬」写成可执行的形式。 */
  check('枢纽页没有把「入口门槛」那句搬进 userNotes（共享句已经说过一遍，重复即冗余）',
    [landing.VENDOR_HUB, landing.CATEGORY_HUB].every(page =>
      !(Array.isArray(page.userNotes) && page.userNotes.some(line => /达到门槛|独立页面/.test(line)))),
    [landing.VENDOR_HUB, landing.CATEGORY_HUB]
      .filter(page => Array.isArray(page.userNotes) && page.userNotes.some(line => /达到门槛|独立页面/.test(line)))
      .map(page => page.key).join(', '));

  /* 空容器：`userNotes: []` 会渲染出一个只有 summary 的空 `<details>`。
     那是「为了不留白而留白」—— 读者什么也没读到，而 §22c 会把那个空容器当成一条
     「页面级说明」去量。**没有内容就不输出容器。** */
  check('没有空容器：userNotes 不许是空数组（有内容才输出容器）',
    copyRows.every(({ page }) => page.userNotes === undefined
      || (Array.isArray(page.userNotes) && page.userNotes.length > 0)),
    copyRows.filter(({ page }) => page.userNotes !== undefined
      && (!Array.isArray(page.userNotes) || page.userNotes.length === 0))
      .map(({ reg, page }) => `${reg}/${page.slug || page.key}`).join(', '));

  /* 别名页的「原因」：本轮（`secondary-page-residue-v1`）起它**只留在配置里**，不再上页面。
     换向的原因与依据（写清，免得下一轮又把它接回模板）：
       · 旧断言的名字是「别名页『原因』文案里不含内部实现措辞（逐字显示在页面上）」——
     `build-local.js` 曾把 `reason` 插进顶部 `<p class="snote aliasnote">`，所以「扫词」是
         有余量的；本轮那条 `.aliasnote` **整条删除**（它渲染的是站务机制与内部标识符，
         实测三个别名页各有 183 个站内入链来源、全站零入链路由 0 ⇒ 对导航零贡献），
         渲染路径没有了，旧断言名就成了「一句不再成立的话」。
       · 于是改成**两条**：① 配置侧形状不变（reason 仍不许含内部实现措辞）；
         ② **反向断言**（比原来更强）—— reason 的**逐字文本**不许出现在任何产物里。
         原来只保证「reason 不含禁词」，现在保证「reason 整个不出现」：就算下一轮有人把
         一句话原样接回模板、而那句话恰好不含禁词，第 ② 条也会红。
       · **判据边界**（必须写清，否则会变成一条在正常文案上误报的守卫）：
         第 ② 条扫的是 `reason` **值逐字出现**（整串包含关系），**不是**「reason 里的词逐个出现」。
         后者的误报面很实在：`reason` 里写着「同一份判据」「同一批条目」这类正常业务措辞，
         逐词扫会把页面上合法的同义说法一并判红 —— 那比没有守卫更糟。 */
  const aliasDoc = JSON.parse(fs.readFileSync(landing.ALIASES_FILE, 'utf8'));
  const aliasReasons = Object.entries(aliasDoc.aliases || {})
    .map(([route, entry]) => ({ route, reason: String((entry && entry.reason) || '') }));
  check(`别名页「原因」文案里不含内部实现措辞（${aliasReasons.length} 条，配置侧形状；本轮起不再逐字渲染给读者）`,
    aliasReasons.length > 0 && aliasReasons.every(({ reason }) => !INTERNAL_TERMS.test(reason)),
    aliasReasons.filter(({ reason }) => INTERNAL_TERMS.test(reason))
      .map(({ route, reason }) => `${route}: ${reason.slice(0, 30)}…`).join(' · '));

  /* 反向断言：内部理由（`landing-aliases.json` 里每条 `aliases[r].reason` 的**逐字文本**）
     不许出现在**任何产物页面**里 —— 扫 dist/ 全部 index.html，命中即红。
     ⚠️ 没有 dist/ 时**不静默通过**：报成一条失败（`npm run build` 之后才跑得动这条断言），
        否则「目录不存在」会被读成「扫过且干净」。 */
  {
    const distDir = path.join(ROOT, 'dist');
    let htmlFiles = [];
    if (fs.existsSync(distDir)) {
      const stack = [distDir];
      while (stack.length) {
        const dir = stack.pop();
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else if (entry.name.toLowerCase() === 'index.html') htmlFiles.push(full);
        }
      }
    }
    const hits = [];
    for (const file of htmlFiles) {
      const html = fs.readFileSync(file, 'utf8');
      for (const { route, reason } of aliasReasons) {
        if (reason && html.includes(reason)) {
          hits.push(`${path.relative(distDir, file).split(path.sep).join('/')} 含 ${route} 的 reason 逐字文本`);
        }
      }
    }
    check(`内部理由不再出现在任何产物页面：${aliasReasons.length} 条 reason 的逐字文本 × ${htmlFiles.length} 个 dist/index.html 0 命中`,
      htmlFiles.length > 0 && hits.length === 0,
      htmlFiles.length === 0 ? 'dist/ 不存在或没有 index.html —— 这条断言没扫到东西（先 npm run build）'
        : hits.slice(0, 5).join(' · '));
  }

  check('每条按需求页都保留了机器可读的 `criteria`（维护口径留在注册表里，不是随首屏说明一起删掉）',
    au.NEED_PAGES.every(page => typeof page.criteria === 'string' && page.criteria.trim().length > 0),
    au.NEED_PAGES.filter(page => !(typeof page.criteria === 'string' && page.criteria.trim()))
      .map(page => page.slug).join(', '));

  check(`userNotes 形状：数组、最多 ${NOTE_COUNT_MAX} 条、每条不超过 ${NOTE_MAX} 字、不含内部实现措辞`,
    copyRows.every(({ page }) => {
      if (page.userNotes === undefined) return true;   // 可选字段
      if (!Array.isArray(page.userNotes) || page.userNotes.length > NOTE_COUNT_MAX) return false;
      return page.userNotes.every(line => typeof line === 'string' && line.trim().length > 0
        && line.length <= NOTE_MAX && !INTERNAL_TERMS.test(line) && !/\*\*|`/.test(line));
    }),
    copyRows.filter(({ page }) => {
      if (page.userNotes === undefined) return false;
      if (!Array.isArray(page.userNotes) || page.userNotes.length > NOTE_COUNT_MAX) return true;
      return !page.userNotes.every(line => typeof line === 'string' && line.trim().length > 0
        && line.length <= NOTE_MAX && !INTERNAL_TERMS.test(line) && !/\*\*|`/.test(line));
    }).map(({ page }) => `${page.slug || page.key}`).join(', '));

  // 旧字段名回流即红。这条是「改名」这个动作的**收口**：
  // 没有它，下一轮有人加一条新入口页时照着旧代码抄一个 `why: [...]` 就能把三段口径带回来。
  check('注册表里不许再出现旧的 `why` 字段（口径已改为 userNotes / 维护文档，回流即红）',
    copyRows.every(({ page }) => !Object.prototype.hasOwnProperty.call(page, 'why')),
    copyRows.filter(({ page }) => Object.prototype.hasOwnProperty.call(page, 'why'))
      .map(({ reg, page }) => `${reg}/${page.slug || page.key}`).join(', '));

  // 这两个记号会**原样渲染给读者**（构建期直接插进 HTML），构建自检也扫这一条
  const markdownish = copyRows.filter(({ page }) =>
    Array.isArray(page.userNotes) && page.userNotes.some(line => /\*\*|`/.test(line)));
  check('userNotes 里没有 Markdown 记号（** 与反引号会原样出现在读者眼前）',
    markdownish.length === 0, markdownish.map(({ page }) => page.slug || page.key).join(', '));

  // 版本号与写死的条数：条数是**按数据现算**的（页面顶部与首页入口都是），
  // 写进文案必然过期 —— 而「过期」的具体样子是「页面上写着 4 条、表格里列了 12 行」。
  const frozenNumbers = copyRows.filter(({ page }) =>
    Array.isArray(page.userNotes) && page.userNotes.some(line =>
      /v\d+\.\d+/.test(line) || /\d+\s*(条|个条目)/.test(line)));
  check('userNotes 里没有写死的条数（条数按数据现算，写死必然过期）',
    frozenNumbers.length === 0, frozenNumbers.map(({ page }) => page.slug || page.key).join(', '));

  // 维护口径没有丢：逐页在 docs 的口径归档里能查到（「说迁移了」与「真的迁移了」的区别）
  const designRules = fs.readFileSync(path.join(ROOT, 'docs', 'DESIGN-RULES.md'), 'utf8');
  const archivedSlugs = [...designRules.matchAll(/^#### `([^`]+)`/gm)].map(m => m[1]);
  check('每条被删过口径的入口页在 docs/DESIGN-RULES.md 的口径归档里都有对应条目',
    copyRows.every(({ page }) => archivedSlugs.includes(page.slug || page.key)),
    copyRows.map(({ page }) => page.slug || page.key).filter(slug => !archivedSlugs.includes(slug)).join(', '));

  // 判据本身：三态只认肯定信号 —— 「未确认」绝不等于「不需要」
  const noCard = au.NEED_PREDICATES.noCard;
  check('no-card：creditCardRequired=false 命中', noCard({ claimRequirements: { creditCardRequired: false } }) === true);
  check('no-card：creditCardRequired=true 不命中', noCard({ claimRequirements: { creditCardRequired: true } }) === false);
  check('no-card：creditCardRequired="unknown" 不命中（没证据 ≠ 不需要）',
    noCard({ claimRequirements: { creditCardRequired: 'unknown' } }) === false);
  check('no-card：字段缺席不命中', noCard({ claimRequirements: {} }) === false);
  check('no-card：claimRequirements 整个缺席不命中', noCard({}) === false);
  check('no-card：字符串 "false" 不命中（只认布尔字面量）',
    noCard({ claimRequirements: { creditCardRequired: 'false' } }) === false);
  const china = au.NEED_PREDICATES.chinaUsable;
  check('china-usable：chinaUsable=true 命中', china({ availability: { chinaUsable: true } }) === true);
  check('china-usable：region=cn 单独不命中（SCHEMA §2.5：来源是国内不构成可用证据）',
    china({ region: 'cn', availability: { chinaUsable: 'unknown' } }) === false);
  check('china-usable："unknown" 不命中', china({ availability: { chinaUsable: 'unknown' } }) === false);
  const edu = au.NEED_PREDICATES.eduIdentity;
  check('edu-identity：educationEmailRequired=true 命中', edu({ eligibilityDetail: { educationEmailRequired: true } }) === true);
  check('edu-identity：educationEmailRequired=false 不命中（明说不需要教育邮箱就不该在这页）',
    edu({ eligibilityDetail: { educationEmailRequired: false } }) === false);

  // 垃圾输入不许抛：入口页是按数据现算的，一条脏数据不该让整次构建炸掉
  const garbage = [null, undefined, {}, { audience: 'student' }, { benefitType: null }, { availability: [] }, { category: 5 }, { claimRequirements: 0 }];
  let threw = 0;
  for (const value of garbage) {
    for (const name of Object.keys(au.NEED_PREDICATES)) {
      try { au.NEED_PREDICATES[name](value); } catch (error) { threw++; }
    }
  }
  check('十条判据对残缺/脏数据一律返回布尔值、不抛异常', threw === 0, `${threw} 次抛错`);

  // needsOf 的次序与去重（次序决定 dist/deals.json 的序列化结果，必须稳定）
  const multi = { audience: ['student', 'developer'], benefitType: ['student_plan', 'free_api'], eligibilityDetail: { studentRequired: true } };
  const list = au.needsOf(multi);
  check('needsOf 命中多条时按注册表顺序返回', JSON.stringify(list) === JSON.stringify(slugs.filter(s => list.includes(s))), JSON.stringify(list));
  check('needsOf 不产生重复 slug', new Set(list).size === list.length, JSON.stringify(list));
  check('needsOf 对空记录返回空数组', JSON.stringify(au.needsOf({})) === '[]', JSON.stringify(au.needsOf({})));

  // 真实数据不变量：每条 slug 至少有一条、且命中都落在注册表内
  const dealRecords = deals.filter(d => d.type === 'deal');
  const known = new Set(slugs);
  const counts = slugs.map(slug => [slug, dealRecords.filter(d => au.needsOf(d).includes(slug)).length]);
  const empty = counts.filter(([, n]) => n === 0);
  check('每条入口在当前数据里都至少有一条（0 条的会被构建期跳过，那说明判据或数据坏了）',
    empty.length === 0, empty.map(([slug]) => slug).join(', '));
  console.log(`  当前命中分布：${counts.map(([slug, n]) => `${slug} ${n}`).join(' · ')}`);
  check('所有记录的 needsOf 结果都落在注册表内',
    dealRecords.every(d => au.needsOf(d).every(slug => known.has(slug))),
    dealRecords.filter(d => au.needsOf(d).some(slug => !known.has(slug))).map(d => d.id).join(', '));
}

/* ================================================================== */
console.log('\n=== 10) 断言依据的档位（t7：第三方收录 / 推断不得写成「官方页面明写」）===');

/**
 * 为什么这一节必须存在（审计 `F-r1-identity-001` / `F-r1-identity-003`）：
 * 「断言依据」那一行的措辞原先只读 `basis` —— `source` 恒等于「官方页面明写」。
 * 于是两件事同时发生，而**构建全绿、页面上看起来完全正常**：
 *   ① `sourceType='directory'`（第三方目录站收录）的 14 条记录，29 处字段级依据取自目录站的
 *      收录文案，却印成「官方页面明写」—— 同一块表里还写着「来源类型：第三方目录站收录」；
 *   ② 数据层声明为推断的字段（`basis:'source' + derived:'inferred'`，24 处）同样印成
 *      「官方页面明写」，而 `SOURCE_BASIS.inferred` 那一档因此永远命中不了。
 * 判据的正本在 `lib/provenance.js` 的 `basisWordingKey()`；这里拿 RENDER-CORE 的**真实求值**
 * 逐格比对，并钉住两条红线：`directory`/`unknown` 档与 inferred 字段的页面上
 * 「官方页面明写」出现次数必须是 0。
 */
{
  const provenanceLib = require('../lib/provenance');
  const wording = au.parseWordingBlock(au.extractWordingBlock(fs.readFileSync(INDEX_FILE, 'utf8')));
  check('措辞块里 SOURCE_BASIS 有 `collected` 档（第三方收录页原文）',
    Boolean(wording && wording.SOURCE_BASIS && wording.SOURCE_BASIS.collected), JSON.stringify(wording && wording.SOURCE_BASIS));

  const countOf = (text, needle) => String(text).split(needle).length - 1;
  const renderBasis = (entry, sourceType) => core.sourceBlockHtml({
    title: 'Basis Probe',
    url: 'https://example.com/p',
    source: 'Probe Source',
    sourceFacts: {
      sourceType,
      method: 'static',
      lastSuccessState: 'known',
      lastSuccessAt: '2026-09-29T13:04:54.254Z',
      healthStatus: 'healthy'
    },
    provenance: { credibility: 'curated', fields: { audience: entry } }
  });
  const tierOf = block => Object.keys(wording.SOURCE_BASIS)
    .find(key => block.includes(wording.SOURCE_BASIS[key])) || '(无档位)';
  const CASE = [
    ['官方直采 + 页面明写', { basis: 'source', derived: 'stated' }, 'official', 'source'],
    ['人工策展 + 页面明写', { basis: 'source', derived: 'stated' }, 'curated', 'source'],
    ['第三方目录站收录 + 页面明写', { basis: 'source', derived: 'stated' }, 'directory', 'collected'],
    ['来源身份不明 + 页面明写', { basis: 'source', derived: 'stated' }, 'unknown', 'collected'],
    ['官方直采 + 数据层声明推断', { basis: 'source', derived: 'inferred', note: '（推断）' }, 'official', 'inferred'],
    ['第三方目录站 + 数据层声明推断', { basis: 'source', derived: 'inferred', note: '（推断）' }, 'directory', 'inferred'],
    ['basis 直接写 inferred', { basis: 'inferred', note: '（推断）' }, 'directory', 'inferred'],
    ['官方条款原文', { basis: 'documented', derived: 'stated' }, 'official', 'documented'],
    ['第三方目录站 + 官方条款原文', { basis: 'documented' }, 'directory', 'documented'],
    ['没有任何依据声明', {}, 'official', 'none']
  ];
  for (const [name, entry, sourceType, key] of CASE) {
    const block = renderBasis(entry, sourceType);
    const expected = wording.SOURCE_BASIS[key];
    check(`档位：${name} → 「${expected}」`, block.includes(expected),
      `实得「${tierOf(block)}」：${block.slice(block.indexOf('dsrc-basis'), block.indexOf('dsrc-basis') + 220)}`);
  }

  // 红线①：directory / unknown 档的记录页面上「官方页面明写」出现次数必须是 0
  for (const sourceType of ['directory', 'unknown']) {
    const block = renderBasis({ basis: 'source', derived: 'stated' }, sourceType);
    check(`红线：sourceType=${sourceType} 的记录页面「官方页面明写」计数 = 0`,
      countOf(block, wording.SOURCE_BASIS.source) === 0, `计数 ${countOf(block, wording.SOURCE_BASIS.source)}`);
    check(`红线：sourceType=${sourceType} 时改说「${wording.SOURCE_BASIS.collected}」`,
      block.includes(wording.SOURCE_BASIS.collected));
  }
  // 红线②：声明为推断的字段一律按「由官方原文推断」，不得出现「官方页面明写」
  for (const entry of [{ basis: 'inferred', note: '（推断）' }, { basis: 'source', derived: 'inferred', note: '（推断）' }]) {
    for (const sourceType of ['official', 'curated', 'directory', 'unknown']) {
      const block = renderBasis(entry, sourceType);
      check(`红线：inferred 字段（sourceType=${sourceType}，${JSON.stringify(Object.keys(entry))}）不出「官方页面明写」`,
        countOf(block, wording.SOURCE_BASIS.source) === 0 && block.includes(wording.SOURCE_BASIS.inferred),
        `官方页面明写 ${countOf(block, wording.SOURCE_BASIS.source)} 次 · ${block.slice(block.indexOf('dsrc-basis'), block.indexOf('dsrc-basis') + 200)}`);
    }
  }
  // 红线③：官方直采且**不是**推断的档位一处不减（不得靠删词把页面改安静）
  const officialBlock = renderBasis({ basis: 'source', derived: 'stated' }, 'official');
  check('红线：sourceType=official 且 non-inferred 仍印「官方页面明写」（不得删词抹平）',
    countOf(officialBlock, wording.SOURCE_BASIS.source) === 1, `计数 ${countOf(officialBlock, wording.SOURCE_BASIS.source)}`);

  // 逐格：RENDER-CORE 的真实求值必须与 lib 的判据同结果（两份实现不许分家）
  const GRID = [];
  for (const basis of ['source', 'documented', 'inferred', undefined]) {
    for (const derived of ['stated', 'inferred', undefined]) {
      for (const sourceType of ['official', 'curated', 'directory', 'unknown']) {
        GRID.push([{ basis, derived, note: '（推断）' }, sourceType]);
      }
    }
  }
  const drift = GRID.filter(([entry, sourceType]) =>
    tierOf(renderBasis(entry, sourceType)) !== provenanceLib.basisWordingKey(entry, sourceType));
  check(`lib 判据与 RENDER-CORE 渲染逐格一致（${GRID.length} 格）`, drift.length === 0,
    drift.slice(0, 3).map(([entry, sourceType]) =>
      `${JSON.stringify(entry)}/${sourceType}：lib ${provenanceLib.basisWordingKey(entry, sourceType)} vs 渲染 ${tierOf(renderBasis(entry, sourceType))}`).join(' | '));

  // 牙⑤：前端把新档删掉 → 同源比对必须立刻红（新档自动获得漂移守护）
  const bentBlock = html.replace('"collected":"第三方收录页原文（非官方页直引）",', '');
  check('牙⑤ 前端删掉 SOURCE_BASIS.collected → checkWordingContract 立刻红',
    !au.checkWordingContract(bentBlock).ok && /SOURCE_BASIS\.collected/.test(au.checkWordingContract(bentBlock).reasons.join(' ')),
    au.checkWordingContract(bentBlock).reasons.slice(0, 2).join(' | '));

  // 牙⑥：顶层 `sourceUrl` 那一行的标签必须是中性的「收录渠道」（P3-11 / Prompt §7.1：
  // sourceUrl 可能是第三方目录站，标成「原始出处」会被读成"官方原始出处"）。
  // 空态措辞必须跟着标签走 —— 否则同一行里出现两个名字（旧词与新词并存）。
  check('牙⑥ 顶层 sourceUrl 的标签是「收录渠道」（不是「原始出处」）',
    wording.SOURCE_LABELS.origin === '收录渠道', wording.SOURCE_LABELS.origin);
  check('牙⑥ 该行的空态措辞与标签同词（「未署名收录渠道」）',
    wording.SOURCE_NOTES.noOrigin === `未署名${wording.SOURCE_LABELS.origin}`, wording.SOURCE_NOTES.noOrigin);
  const bentOrigin = html.replace('"origin":"收录渠道"', '"origin":"原始出处"');
  check('牙⑥ 前端把标签改回「原始出处」→ checkWordingContract 立刻红',
    !au.checkWordingContract(bentOrigin).ok && /SOURCE_LABELS\.origin/.test(au.checkWordingContract(bentOrigin).reasons.join(' ')),
    au.checkWordingContract(bentOrigin).reasons.slice(0, 2).join(' | '));
  const bentNoOrigin = html.replace('"noOrigin":"未署名收录渠道"', '"noOrigin":"未署名原始出处"');
  check('牙⑥ 前端把空态改回「未署名原始出处」→ 同一条比对立刻红',
    !au.checkWordingContract(bentNoOrigin).ok && /SOURCE_NOTES\.noOrigin/.test(au.checkWordingContract(bentNoOrigin).reasons.join(' ')),
    au.checkWordingContract(bentNoOrigin).reasons.slice(0, 2).join(' | '));
}

/* ------------------------------------------------------------------ */
console.log(`\n${failures.length ? '❌' : '✅'} 受众字段自测：${pass} 项通过，${failures.length} 项失败`);
if (failures.length) {
  failures.forEach(message => console.error(`   - ${message}`));
  process.exit(1);
}
