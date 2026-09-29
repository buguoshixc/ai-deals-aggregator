#!/usr/bin/env node
/**
 * `migrate.js --audience` 的验收比对（只读，产出可贴进报告的**数字**而不是表态）。
 *
 * 契约 §6.1 的验收标准有两条，这里逐条变成断言：
 *   ① 「除 provenance 外，任何既有字段逐字节不变」——逐条逐字段 `JSON.stringify` 比对，
 *      并额外比对**键顺序**（`Object.keys`）：键顺序变了，134 条的 diff 就不再是
 *      「每条约 6 行新增」，而迁移脚本最容易被顺手写坏的就是这件事（重建对象时漏一个键、
 *      或把新字段插到中间）。
 *   ② 「跑完 `validate --strict` 全绿」——两速都过 `validateDeal`；before 若本来就有问题
 *      会照实报出来（迁移脚本不该在一个已经不合规的输入上工作）。
 *
 * 另外三条这个脚本自己的检查，都是迁移特有的假绿形态：
 *   ③ 六字段的**值**一个都不许被写：迁移只补出处，不猜值（契约 §6.1）。
 *   ④ provenance 只出现在「有依据」的条目上；`fields` 只指向真的有值的字段。
 *   ⑤ **确定性**：拿 before 快照重跑一次纯函数，输出必须与 after 逐字节相同 ——
 *      证明这个迁移不依赖运行时状态，重跑安全。
 *
 * 用法：
 *   node scripts/tools/migrate-audience-verify.js                      # 跑**入库的合成夹具**（CI 用的就是这条）
 *   node scripts/tools/migrate-audience-verify.js --before=<旧 deal.json> --after=<新 deal.json>
 *   退出码 0 = 全部通过；1 = 有断言失败（逐条列出）；2 = 参数/文件问题。
 *
 * ## 为什么不拿真实的 134 条快照当夹具（2026-09-29 接进 CI 时的决定）
 *
 * 这条命令此前**接不进 CI**，卡点就是「缺一个 before 基线文件」。当时看起来只有一条路：
 * 把某次真实迁移前后的整份 deals.json 冻进仓库。那样做有两个问题 ——
 *   ① 覆盖不足：真实数据里 `verified:false` 的策展记录**一条都没有**，`curated` 那一档
 *      根本没人走；它只能覆盖「这批数据恰好走过的分支」。
 *   ② 维护负担：几万行的数据快照会随 schema 演进而失效，每次都要重新生成，
 *      而重新生成时**没人会逐条核对**它是否仍然是对的。
 * 所以改用**合成夹具**：9 条记录，每条对应一个分支，`scripts/data/fixtures/` 下入库。
 *
 * ## 夹具的 9 条各在测什么（入库时逐条核对过，不是函数吐出来就存下来）
 *
 * | # | 输入 | 期望 |
 * |---|---|---|
 * | 1 | Curated + verified + verifiedAt + 两个值字段 | `editorial` + 带 verifiedAt + 2 个字段 |
 * | 2 | Curated-CN + verified + verifiedAt | `editorial`（两个策展来源名都必须认） |
 * | 3 | Curated，**没有**回访日期 | `curated`，且 provenance 里**不带** verifiedAt |
 * | 4 | ★ 自动采集来源 + verified + verifiedAt | **不补**（这里曾经误判成 `editorial`） |
 * | 5 | 自动采集来源、无核验 | 不补 |
 * | 6 | 已有 provenance | 一律不碰（单调退化：没有路径能把它加回来） |
 * | 7 | 有依据但这条记录上没有任何新字段 | 不补（补了就是一句空声明） |
 * | 8 | ★ 只有 `chinaUsable:"unknown"` | 仍然不补（unknown 是「查过、没证据」，不是值） |
 * | 9 | ★ `claimRequirements.creditCardRequired: false` | 照样补（三态里的 `false` **算**值） |
 *
 * 第 4 条是 2026-09-29 修掉的**潜伏缺陷**：`dedup.credibilityOf` 早已加固成
 * 「editorial 要求来源也是策展」，而 `migrationCredibility` 当时还在用「verified + verifiedAt
 * 就升级」。同一个洞只堵了一半，而 `validateDeal` 两种档位都放行 —— 不会有任何东西变红。
 * 修法是让 `migrationCredibility` 直接调用 `credibilityOf`，不变量由 `audience-selftest.js` 钉住。
 */

const fs = require('fs');
const path = require('path');
const { validateDeal, AUDIENCE_FIELD_ORDER } = require('../lib/schema');
const { attachAudienceProvenance, migrationCredibility, provableFields } = require('../lib/migrate-audience');
const audience = require('../lib/audience');

const beforeArg = process.argv.find(a => a.startsWith('--before='));
const afterArg = process.argv.find(a => a.startsWith('--after='));

/** 不传参数时跑入库的合成夹具（CI 走这条）。传一半 = 参数错误，不许把夹具和真实文件混着比。 */
const FIXTURE_DIR = path.join(__dirname, '..', 'data', 'fixtures');
const DEFAULT_BEFORE = path.join(FIXTURE_DIR, 'migrate-audience-before.json');
const DEFAULT_AFTER = path.join(FIXTURE_DIR, 'migrate-audience-after.json');
if (Boolean(beforeArg) !== Boolean(afterArg)) {
  console.error('--before= 与 --after= 必须成对给出（只给一个 = 想拿夹具和真实文件比，那不是同一件事）');
  process.exit(2);
}
const usingFixture = !beforeArg;
const beforeFile = beforeArg ? beforeArg.slice('--before='.length) : DEFAULT_BEFORE;
const afterFile = afterArg ? afterArg.slice('--after='.length) : DEFAULT_AFTER;

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

function readStore(file, label) {
  if (!file) {
    console.error(`缺少 --${label}=<path>`);
    process.exit(2);
  }
  if (!fs.existsSync(file)) {
    console.error(`文件不存在: ${file}`);
    process.exit(2);
  }
  const raw = fs.readFileSync(file, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { payload: { deals: parsed }, deals: parsed, bytes: raw, legacy: true };
    return { payload: parsed, deals: parsed.deals || [], bytes: raw, legacy: false };
  } catch (error) {
    console.error(`${file} 解析失败: ${error.message}`);
    process.exit(2);
  }
}

/** 三条记录的全字段比对（含键顺序） */
function diffRecords(before, after) {
  const changes = { valueChanged: [], keyOrder: [], keysAdded: [], keysRemoved: [] };
  const beforeKeys = Object.keys(before).filter(key => key !== 'provenance');
  const afterKeys = Object.keys(after).filter(key => key !== 'provenance');

  const sameSet = beforeKeys.length === afterKeys.length && beforeKeys.every(key => afterKeys.includes(key));
  if (!sameSet) {
    changes.keysAdded.push(...afterKeys.filter(key => !beforeKeys.includes(key)));
    changes.keysRemoved.push(...beforeKeys.filter(key => !afterKeys.includes(key)));
    return changes;
  }
  if (beforeKeys.join('\u0000') !== afterKeys.join('\u0000')) changes.keyOrder.push(beforeKeys.join(','));

  for (const key of beforeKeys) {
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) changes.valueChanged.push(`${key}: ${a} → ${b}`);
  }
  return changes;
}

const beforeStore = readStore(beforeFile, 'before');
const afterStore = readStore(afterFile, 'after');
const BEFORE = beforeStore.deals;
const AFTER = afterStore.deals;

console.log('=== migrate --audience 验收比对 ===');
if (usingFixture) console.log('模式：入库合成夹具（scripts/data/fixtures/，逐分支覆盖；CI 用的就是这条）');
console.log(`before: ${path.resolve(beforeFile)}（${BEFORE.length} 条）`);
console.log(`after : ${path.resolve(afterFile)}（${AFTER.length} 条）\n`);

/* ---- ①② 逐字段比对 + 合规 ---- */
console.log('--- 1) 除 provenance 外任何既有字段逐字节不变 ---');
const beforeBad = [];
BEFORE.forEach((deal, i) => {
  const result = validateDeal(deal, i);
  if (!result.ok) beforeBad.push(...result.errors.slice(0, 2));
});
check('before 快照本身就是合规数据（迁移不该在坏输入上工作）', beforeBad.length === 0,
  beforeBad.slice(0, 3).join(' | ') || '0 项');

const afterBad = [];
AFTER.forEach((deal, i) => {
  const result = validateDeal(deal, i);
  if (!result.ok) afterBad.push(...result.errors.slice(0, 2));
});
check('after 逐条通过 validateDeal（含 provenance 的全部硬约束）', afterBad.length === 0,
  afterBad.slice(0, 3).join(' | ') || '0 项');

const valueChanged = [];
const keyAdded = [];
const keyRemoved = [];
const orderChanged = [];
const afterById = new Map(AFTER.map(deal => [deal.id, deal]));
const beforeIds = new Set(BEFORE.map(deal => deal.id));

for (const before of BEFORE) {
  const after = afterById.get(before.id);
  if (!after) { keyRemoved.push(`整条记录消失 ${before.id} ${before.title}`); continue; }
  const diff = diffRecords(before, after);
  diff.valueChanged.forEach(item => valueChanged.push(`${before.title} :: ${item}`));
  diff.keyOrder.forEach(item => orderChanged.push(`${before.title} :: ${item}`));
  diff.keysAdded.forEach(item => keyAdded.push(`${before.title} :: ${item}`));
  diff.keysRemoved.forEach(item => keyRemoved.push(`${before.title} :: ${item}`));
}
for (const after of AFTER) {
  if (!beforeIds.has(after.id)) valueChanged.push(`凭空多出的记录 ${after.id} ${after.title}`);
}

check('既有字段取值无一变化', valueChanged.length === 0, valueChanged.slice(0, 3).join(' | ') || '0 处');
check('既有字段键顺序无一变化（diff 才会保持「每条约 6 行新增」）', orderChanged.length === 0,
  orderChanged.slice(0, 2).join(' | ') || '0 处');
check('除 provenance 外无新增键', keyAdded.length === 0, keyAdded.slice(0, 3).join(' | ') || '0 个');
check('无删除键 / 无消失记录', keyRemoved.length === 0, keyRemoved.slice(0, 3).join(' | ') || '0 个');

/* ---- ③ 六个字段的值一个都不许被写 ---- */
console.log('\n--- 2) 迁移不猜值：六字段的值必须逐字节不变 ---');
const valueDrift = [];
for (const before of BEFORE) {
  const after = afterById.get(before.id);
  if (!after) continue;
  for (const field of AUDIENCE_FIELD_ORDER) {
    if (field === 'provenance') continue;
    const a = JSON.stringify(before[field]);
    const b = JSON.stringify(after[field]);
    if (a !== b) valueDrift.push(`${before.title} :: ${field} ${a} → ${b}`);
  }
}
check('audience / benefitType / eligibilityDetail / claimRequirements / availability 一字未改',
  valueDrift.length === 0, valueDrift.slice(0, 3).join(' | ') || '0 处');

const unknownPlaceholders = AFTER.filter(deal => {
  if (!deal.availability) return false;
  return deal.availability.chinaUsable === 'unknown' && !BEFORE.find(b => b.id === deal.id)?.availability;
});
check('没有给任何条目填 "unknown" 占位（缺席就是 unknown，写出来只会让覆盖率虚高）',
  unknownPlaceholders.length === 0, `${unknownPlaceholders.length} 条`);

/* ---- ④ provenance 只出现在有依据的条目上 ---- */
console.log('\n--- 3) provenance 只在有据可查的条目上 ---');
const provenanceBefore = BEFORE.filter(deal => deal.provenance).length;
const provenanceAfter = AFTER.filter(deal => deal.provenance).length;
const addedProvenance = AFTER.filter(deal => deal.provenance && !BEFORE.find(b => b.id === deal.id)?.provenance);

const wrongCredibility = addedProvenance.filter(deal => {
  const expected = migrationCredibility(BEFORE.find(b => b.id === deal.id) || {});
  return deal.provenance.credibility !== expected;
});
check('每条新 provenance 的 credibility 都等于规则推出的那一档（editorial > curated > 不补）',
  wrongCredibility.length === 0,
  wrongCredibility.slice(0, 3).map(d => `${d.title} 实得 ${d.provenance.credibility}`).join(' | ') || '0 处');

const bogusFields = [];
for (const deal of addedProvenance) {
  const keys = Object.keys(deal.provenance.fields || {});
  if (!keys.length) bogusFields.push(`${deal.title} :: fields 为空`);
  for (const key of keys) {
    if (!AUDIENCE_FIELD_ORDER.includes(key)) bogusFields.push(`${deal.title} :: ${key} 不是 v1.1 字段`);
    if (!audience.hasKnown(deal[key])) bogusFields.push(`${deal.title} :: ${key} 指向无值字段`);
  }
}
check('新 provenance 的 fields 只列真的有值的新字段（不为空、不指向空字段）',
  bogusFields.length === 0, bogusFields.slice(0, 3).join(' | ') || '0 处');

const editorialWithoutDate = addedProvenance.filter(d => d.provenance.credibility === 'editorial' && !d.provenance.verifiedAt);
check('editorial 一律带 verifiedAt（人工回访日期是声明的组成部分）',
  editorialWithoutDate.length === 0, editorialWithoutDate.slice(0, 2).map(d => d.title).join(' | ') || '0 处');

// 「该补的都补了」不能用 before 快照里的 provenance 去判 —— 那是**永远不成立**的错判据
// （before 的定义就是「还没有 provenance」），我第一版就写成了这样，夹具一跑立刻露馅。
// 正确做法：用 before 快照按**规则**算出应有条数，再与 after 里实际补上的条数对账。
const expectedAddable = BEFORE.filter(deal =>
  !deal.provenance &&
  migrationCredibility(deal) &&
  provableFields(deal).length > 0
).length;
const actualAddedCount = addedProvenance.length;
check('该补的都补了：before 按规则算出的应有条数 === after 实际补上的条数',
  expectedAddable === actualAddedCount,
  `应补 ${expectedAddable} 条，实补 ${actualAddedCount} 条`);
console.log(`  （provenance 条数：${provenanceBefore} → ${provenanceAfter}，新补 ${addedProvenance.length} 条）`);

/* ---- ⑤ 确定性 / 幂等 ---- */
console.log('\n--- 4) 确定性与幂等 ---');
const replay = attachAudienceProvenance(BEFORE).deals;
const replayDiff = JSON.stringify(replay) === JSON.stringify(AFTER);
check('以 before 重跑一次纯函数，输出与 after 逐字节相同（不依赖运行状态，重跑安全）',
  replayDiff, replayDiff ? '' : '重跑结果与 after 不一致');

const second = attachAudienceProvenance(AFTER).deals;
check('对 after 再跑一次是幂等的（已有 provenance 不再叠加，updatedAt 之外零变化）',
  JSON.stringify(second) === JSON.stringify(AFTER), JSON.stringify(second) === JSON.stringify(AFTER) ? '' : '二次运行改变了数据');

/* ---- 报告 ---- */
const failed = checks.filter(c => !c.ok);
console.log(`\n统计：before ${BEFORE.length} 条 → after ${AFTER.length} 条 · ` +
  `新补 provenance ${addedProvenance.length} 条 · 既有字段改动 ${valueChanged.length} 处 · 键顺序变化 ${orderChanged.length} 处`);
// updatedAt 也要逐字节不变：这次运行没采到任何新数据，刷成今天就等于伪报数据新鲜度。
check('updatedAt 逐字节不变（迁移没有采到新数据，不该伪报新鲜度）',
  beforeStore.payload.updatedAt === afterStore.payload.updatedAt,
  `${beforeStore.payload.updatedAt || '(空)'} → ${afterStore.payload.updatedAt || '(空)'}`);
const finalFailed = checks.filter(c => !c.ok);
console.log(`\n${finalFailed.length ? '❌' : '✅'} migrate --audience 验收：${checks.length - finalFailed.length}/${checks.length} 项通过`);
if (finalFailed.length) {
  finalFailed.forEach(item => console.error(`   ✗ ${item.name}${item.detail ? ' — ' + item.detail : ''}`));
  process.exit(1);
}
void failed;
