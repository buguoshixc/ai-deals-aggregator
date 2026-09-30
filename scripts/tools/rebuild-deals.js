#!/usr/bin/env node
/**
 * 离线重建 `deals.json`（v2.0）—— **不联网、不采集**。
 *
 * 用法：
 *   node scripts/tools/rebuild-deals.js --dry-run   # 只报告会改什么
 *   node scripts/tools/rebuild-deals.js             # 写盘
 *
 * ## 为什么需要它
 *
 * `deals.json` 是**派生产物**：它 = merge(采集侧记录, curated_*.json, audience-overrides.json)。
 * 平时由 `npm run collect` 重新推导，而 collect 要联网抓 9 个来源 ——
 * 于是出现了一个尴尬的中间态：人工刚改完 `audience-overrides.json`（或 AI 候选刚被接受落地），
 * `deals.json` 还没跟上，此时 `check-reproducible` **必红**。
 *
 * 红了本身是对的（"值必须有源"），但它把一个"数据已经不一致"的状态留在工作树里：
 * 维护者如果这时候提交，CI 会拦；如果忘了重跑采集，本地门禁就一直红着，
 * 久了就变成"反正它红"——那才是最坏的结局。
 *
 * 所以这里补一条**离线**路径：拿现有的采集侧记录当"本次新采"（剥掉算出来的那些字段），
 * 与人工文件重跑一遍同一个 merge。它做的事与 `check-reproducible` 的第③节**完全同一套**
 * （同一个 `mergeAll`、同样的 today、同样的剥法），所以两者要么一起绿，要么一起红。
 *
 * ## 它不做什么
 *
 * 不去采集、不新增条目、不改采集侧的值：`fresh` 用的是**既有记录剥掉算出字段**的形态，
 * 与"采集器再跑一次"等价。真正的数据更新仍然只能来自 `npm run collect`。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { loadStore, writeDeals, mergeAll, assertAllValid } = require('../lib/store');
const { loadCurated } = require('../lib/curated');
const { attach: attachZh, load: loadZh } = require('../lib/zh');
const { AUDIENCE_FIELD_ORDER, todayCN } = require('../lib/schema');
const { CURATED_SOURCES } = require('../lib/dedup');

const ROOT = path.join(__dirname, '..', '..');
const DEALS = path.join(ROOT, 'deals.json');

/** 六字段里的**值**字段（provenance 不是值，是声明） */
const VALUE_FIELDS = AUDIENCE_FIELD_ORDER.filter(field => field !== 'provenance');

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/** 与 check-reproducible 第②节同一个剥法：provenance 与五个值字段都拿掉 */
function strip(deal) {
  const next = { ...deal };
  delete next.provenance;
  for (const field of VALUE_FIELDS) delete next[field];
  return next;
}

/**
 * 保持盘上已有的**键序**。
 *
 * 为什么需要：`mergeAll` 有它自己的规范键序（六字段 + provenance 在 zh 之后），
 * 而仓库里这份 `deals.json` 是旧管线写的（`zh` 在末尾）。两者**值完全相同**，
 * 只差键序 —— 若不处理，本工具会对 45 条记录产生 54 行纯搬运的 diff，
 * 把「改一个字段」变成「看不懂的一片红」。
 *
 * 保守做法：以**盘上那条记录**的键序为模板，重建结果里已有的键按模板排，
 * 新出现的键追加在末尾（与 JSON 的键序语义一致）。
 * 注意这只影响本工具：`npm run collect` 仍按管线自己的规范键序写盘，
 * 所以键序最终以采集侧为准，本工具不去替它做决定。
 */
function reorderLike(rebuilt, template) {
  if (!template) return rebuilt;
  const keys = Object.keys(template).filter(key => key in rebuilt);
  const rest = Object.keys(rebuilt).filter(key => !keys.includes(key));
  const out = {};
  for (const key of keys) out[key] = rebuilt[key];
  for (const key of rest) out[key] = rebuilt[key];
  return out;
}

function main() {
  const dryRun = flag('dry-run');
  const store = loadStore(DEALS);
  const curated = loadCurated().deals;
  const curatedIds = new Set(curated.map(deal => deal.id));
  const nonCurated = store.deals.filter(deal => !curatedIds.has(deal.id) && !CURATED_SOURCES.has(deal.source));
  const today = (store.updatedAt || '').slice(0, 10) || todayCN();

  console.log(`离线重建 deals.json（不联网）`);
  console.log(`  既有 ${store.deals.length} 条 = 策展 ${curated.length} 条 + 采集侧 ${nonCurated.length} 条`);
  console.log(`  重放日期 today=${today}（取自 deals.json 的 updatedAt，不用墙上时钟）`);

  const { deals } = mergeAll({
    fresh: nonCurated.map(strip),
    existing: store.deals,
    curated,
    today
  });
  assertAllValid(deals);

  // 先按盘上键序对齐，再比内容：**比较必须在任何改动之前**，
  // 用磁盘上的原始字节数（`mergeAll` 会就地改动传入的 existing 对象，
  // 拿内存里的数组当"旧值"会得到一个永远相同的假结论）。
  const diskText = fs.readFileSync(DEALS, 'utf8');
  const templateById = new Map(store.deals.map(deal => [deal.id, deal]));
  const ordered = deals.map(deal => reorderLike(deal, templateById.get(deal.id)));
  const localized = attachZh(ordered, loadZh()).deals;

  const payload = {
    schemaVersion: store.schemaVersion,
    updatedAt: store.updatedAt,
    count: localized.length,
    deals: localized
  };
  const nextText = `${JSON.stringify(payload, null, 2)}\n`;
  const changed = diskText !== nextText;

  if (!changed) {
    console.log(`  ✓ 重放结果与盘上的 deals.json 逐字节一致 —— 不需要写盘`);
    return 0;
  }

  // 差异明细：按 id 找出改动的条目与字段，别只说"有变化"
  const byId = new Map(store.deals.map(deal => [deal.id, deal]));
  const diffs = [];
  for (const deal of localized) {
    const old = byId.get(deal.id);
    if (!old) {
      diffs.push({ id: deal.id, title: deal.title, field: '(新增条目)', from: null, to: deal.title });
      continue;
    }
    const keys = new Set([...Object.keys(old), ...Object.keys(deal)]);
    for (const key of keys) {
      const a = JSON.stringify(old[key] === undefined ? null : old[key]);
      const b = JSON.stringify(deal[key] === undefined ? null : deal[key]);
      if (a !== b) diffs.push({ id: deal.id, title: deal.title, field: key, from: a, to: b });
    }
    const oldKeys = Object.keys(old).join(',');
    const newKeys = Object.keys(deal).join(',');
    if (oldKeys !== newKeys) diffs.push({ id: deal.id, title: deal.title, field: '(键序)', from: oldKeys, to: newKeys });
  }
  for (const old of store.deals) {
    if (!localized.some(deal => deal.id === old.id)) diffs.push({ id: old.id, title: old.title, field: '(删除)', from: old.title, to: null });
  }

  console.log(`  重放后有 ${diffs.length} 处差异：`);
  for (const diff of diffs.slice(0, 20)) {
    console.log(`    · ${diff.title} / ${diff.field}`);
    console.log(`        旧：${String(diff.from).slice(0, 100)}`);
    console.log(`        新：${String(diff.to).slice(0, 100)}`);
  }
  if (diffs.length > 20) console.log(`    … 另有 ${diffs.length - 20} 处`);

  if (dryRun) {
    console.log('\n--dry-run：没有写盘。');
    return 0;
  }
  const written = writeDeals(localized, DEALS, new Date(), { preserveUpdatedAt: store.updatedAt });
  console.log(`\n✅ 已重建 deals.json：${written.count} 条，updatedAt=${written.updatedAt}（保持不变）`);
  console.log('下一步：node scripts/validate.js --strict && node scripts/tools/check-reproducible.js');
  return 0;
}

process.exit(main());
