#!/usr/bin/env node
/**
 * 一次性迁移脚本。
 *
 * 两种模式，互不干扰：
 *
 *   ① 默认：把 v1（裸数组、discount 语义混装）的 deals.json 迁移为 v2。
 *      node scripts/migrate.js            # 写盘
 *      node scripts/migrate.js --dry-run  # 只打印结果，不写盘
 *
 *   ② `--audience`：给存量补 v1.1 的 `provenance`（契约 §6.1）。
 *      node scripts/migrate.js --audience --dry-run
 *      node scripts/migrate.js --audience
 *      只补出处，不写六个字段的任何值、不填 unknown 占位、不碰既有字段。
 *      判据与统计全在 scripts/lib/migrate-audience.js（纯函数，可单独测）；
 *      「除 provenance 外任何既有字段逐字节不变」这条验收由
 *      scripts/tools/migrate-audience-verify.js 逐条比对（--before= / --after=）。
 *
 *   可选：`--file=<path>` 指定别的 deals.json 路径（默认仓库根的那一份）。
 *   这条存在是为了让验收能在**临时副本**上跑真实数据，而不必先动仓库文件。
 */

const fs = require('fs');
const path = require('path');
const { makeDeal, isGarbage, hasDiscountSignal, cleanText } = require('./lib/schema');
const { inferRegion, extractExpiry } = require('./lib/classify');
const { loadStore, writeDeals, mergeAll, assertAllValid, DEALS_FILE } = require('./lib/store');
const { loadCurated } = require('./lib/curated');
const { attachAudienceProvenance } = require('./lib/migrate-audience');

const DRY_RUN = process.argv.includes('--dry-run');
const AUDIENCE = process.argv.includes('--audience');
const fileArg = process.argv.find(a => a.startsWith('--file='));
const FILE = fileArg ? path.resolve(process.cwd(), fileArg.slice('--file='.length)) : DEALS_FILE;

/**
 * 未知参数必须**当场失败**，不能静默忽略。
 *
 * 为什么要有这一段（t1 核验发现 F4）：`--audience` 是靠 `argv.includes()` 判定的，于是把
 * `--audience` 敲成 `--audiance` 时它不生效 —— 脚本不报错，而是**照旧跑默认那条整库重写
 * 路径**（v1→v2 迁移），在真实 deals.json 上执行一次没人打算做的写盘。
 * 「拼错一个字母 = 换成一个破坏性操作」这种默认值不能留。
 */
const KNOWN_FLAGS = ['--dry-run', '--audience'];
const unknownArgs = process.argv.slice(2).filter(arg => !KNOWN_FLAGS.includes(arg) && !arg.startsWith('--file='));
if (unknownArgs.length) {
  console.error(`❌ 未知参数：${unknownArgs.join('、')}`);
  console.error(`   已知参数：${KNOWN_FLAGS.join('、')}、--file=<path>`);
  console.error('   拒绝继续：拼错的参数会让脚本默默跑成另一条（可能破坏性的）路径。');
  process.exit(2);
}

/** 整源丢弃：这些来源在核查中确认产出全是垃圾/零产出 */
const DROP_SOURCES = new Set(['Zapier', 'BitDegree', 'AitoolsDirectory']);

/* ------------------------------------------------------------------ */
/* ② --audience：只补 provenance                                       */
/* ------------------------------------------------------------------ */

function migrateAudience() {
  const store = loadStore(FILE);
  const { deals, stats } = attachAudienceProvenance(store.deals);

  // 门禁：写盘前必须全绿（与采集路径同一把尺子）。补出来的 provenance 若指向空字段、
  // 或让某条记录变得不合规，这里直接抛错，绝不写出一份坏数据。
  assertAllValid(deals);

  console.log('=== audience 迁移报告（只补 provenance）===');
  console.log(`数据文件      : ${path.relative(process.cwd(), FILE)}`);
  console.log(`原始条数      : ${store.deals.length}`);
  console.log(`补上 provenance: ${stats.provenanceAdded} 条` +
    `（editorial ${stats.editorial} · curated ${stats.curated}）`);
  console.log(`不补          : 无依据 ${stats.total - stats.provenanceAdded - stats.skippedExisting - stats.nothingToCover} 条` +
    ` · 已有 provenance ${stats.skippedExisting} 条` +
    ` · 有依据但无字段可覆盖 ${stats.nothingToCover} 条`);

  const covered = Object.entries(stats.fieldsCovered);
  console.log(covered.length
    ? `覆盖字段      : ${covered.map(([field, n]) => `${field} ${n}`).join(' · ')}`
    : '覆盖字段      : （无 —— 这批条目上还没有任何真的有值的新字段，于是没什么可背书的）');

  const sources = Object.entries(stats.bySource);
  console.log(sources.length
    ? `按来源        : ${sources.map(([source, s]) => `${source} +${s.added}（e${s.editorial}/c${s.curated}）`).join(' · ')}`
    : '按来源        : （无）');

  if (stats.added.length) {
    console.log('补的明细（前 10 条）：');
    stats.added.slice(0, 10).forEach(item => {
      console.log(`   - [${item.credibility}${item.verifiedAt ? ' ' + item.verifiedAt : ''}] ${item.title}` +
        ` → ${item.fields.join('/')}`);
    });
    if (stats.added.length > 10) console.log(`   ...（其余 ${stats.added.length - 10} 条省略）`);
  }

  if (DRY_RUN) {
    console.log('\n(dry-run，未写盘。要留证据请用：--file=<临时副本> 不带 --dry-run，' +
      '再用 scripts/tools/migrate-audience-verify.js --before= --after= 比对)');
    return;
  }

  // updatedAt 保持原值：这次运行没采到任何新数据，刷成今天就是伪报数据新鲜度。
  writeDeals(deals, FILE, new Date(), { preserveUpdatedAt: store.updatedAt });
  console.log(`\n✅ 已写入 ${path.relative(process.cwd(), FILE)}（updatedAt 保持原值 ${store.updatedAt || '(空)'}）`);
}

/* ------------------------------------------------------------------ */
/* ① 默认：v1 → v2                                                      */
/* ------------------------------------------------------------------ */

function migrate() {
  const store = loadStore(FILE);
  const dropped = { garbage: [], unknownSource: [], invalid: [] };
  const fresh = [];

  for (const raw of store.deals) {
    if (DROP_SOURCES.has(raw.source)) {
      dropped.garbage.push({ title: raw.title, reason: `整源丢弃（${raw.source}）` });
      continue;
    }

    const region = inferRegion(raw.source);
    const discountText = cleanText(raw.discount, 240);
    const expiry = extractExpiry(`${discountText} ${raw.description || ''}`);

    const deal = makeDeal(
      {
        ...raw,
        region,
        expiresAt: raw.expiresAt || raw.endDate || raw.expiry || expiry,
        date: raw.date || raw.firstSeen
      },
      { source: raw.source, region }
    );

    if (!deal) {
      const reason = isGarbage(raw.title) || !cleanText(raw.title)
        ? '标题为垃圾/空'
        : '缺少可用 URL';
      dropped.garbage.push({ title: raw.title, reason });
      continue;
    }

    if (deal.type === 'deal' && !hasDiscountSignal(deal.discountInfo || '')) {
      deal.type = 'tool';
    }
    fresh.push(deal);
  }

  const curated = loadCurated().deals;

  const { deals, stats } = mergeAll({ fresh, existing: [], curated });
  assertAllValid(deals);

  console.log('=== 迁移报告 ===');
  console.log(`原始条数      : ${store.deals.length}`);
  console.log(`整源/垃圾丢弃 : ${dropped.garbage.length}`);
  dropped.garbage.forEach(d => console.log(`   - [${d.reason}] ${d.title}`));
  console.log(`策展数据      : ${curated.length}`);
  console.log(`去重合并      : ${stats.mergedDuplicates}`);
  console.log(`过期修剪      : ${stats.removedExpired}`);
  console.log(`最终条数      : ${deals.length}`);
  console.log(`  其中优惠    : ${deals.filter(d => d.type === 'deal').length}`);
  console.log(`  国内        : ${deals.filter(d => d.region === 'cn').length}`);
  console.log(`  含截止时间  : ${deals.filter(d => d.expiresAt).length}`);
  console.log(`  分类分布    : ${Object.entries(
    deals.reduce((acc, d) => ({ ...acc, [d.category]: (acc[d.category] || 0) + 1 }), {})
  ).map(([k, v]) => `${k}:${v}`).join(' ')}`);

  if (DRY_RUN) {
    console.log('\n(dry-run，未写盘)');
    return;
  }

  writeDeals(deals, FILE);
  console.log(`\n✅ 已写入 ${path.relative(process.cwd(), FILE)}`);
}

(AUDIENCE ? migrateAudience : migrate)();

