#!/usr/bin/env node
/**
 * v1.1 数据收口：把 `deals.json` 的 `provenance` 从「手工写的」换成「merge 产出的」。
 *
 * 用法：
 *   node scripts/tools/audience-rebuild.js --dry-run   # 只报告差异，不写盘
 *   node scripts/tools/audience-rebuild.js             # 写盘
 *
 * ## 为什么需要它（问题不是「值不对」，是「出处不该存在」）
 *
 * 实测：`deals.json` 里 56 条带 `provenance`，credibility 全部是 `collected`；而按契约 §6.1
 * 的可补依据（`source ∈ {Curated, Curated-CN}` 或 `verified+verifiedAt`），这 56 条**一条
 * 都不符合**（`migration.js --audience` 在同样的数据上补 0 条）。也就是说这份 provenance
 * 是**手工写进去的**，不是迁移或 merge 产出的 —— 而 `collected` 档的 provenance 本来就应该
 * 只由 merge 在「单一来源」时留下。
 *
 * 后果不只是「档位不漂亮」：`provenance` 按设计**单调退化、永不回写**，所以下一轮采集的
 * merge 会把这份手工 provenance 原样继承下去（§5.3.2 的 `hadProvenance` 短路），
 * 一错就是永久的。
 *
 * ## 修法：把「手工编辑的产物」换成「工具产出的产物」
 *
 * 不做字符串级别的修补（那正是问题来源），而是**重跑一次干净的 merge**：
 *
 * ```
 * existing' = deals.json 里 **去掉策展条目**（32 条）的那 102 条   ← 只当"上一轮采集的产物"
 * curated   = scripts/data/curated_*.json（人工文件，权威）
 * fresh     = existing'                                          ← 重放一轮，让 merge 重新造 provenance
 * mergeAll({ fresh, existing: [], curated })
 * ```
 *
 * 关键点：
 *  · **策展条目必须从 existing 里摘掉**：否则它们是「手改后的记录」而不是「人工文件的投影」，
 *    会带着旧 provenance 参与仲裁。摘掉之后它们只从 curated 文件进来 —— 人工文件是唯一权威。
 *  · `fresh` 用既有的 102 条（而不是真的去采集）：这台机器上重放一轮即可，且**确定性**。
 *  · 重放之后：策展条目拿到 `credibility: editorial/curated`，非策展条目拿到 merge 依规则
 *    算出的 `contrib` / `fields`（多数会是「无 provenance」或单来源 collected）。
 *
 * 这不改变任何**值**（`audience` 等六个字段的取值由逐字段仲裁决定，与 provenance 无关），
 * 只重建出处声明 —— 脚本会逐条断言这一点。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEALS = path.join(ROOT, 'deals.json');

const { loadStore, writeDeals, mergeAll, assertAllValid } = require('../lib/store');
const { loadCurated } = require('../lib/curated');
const { validateDeal } = require('../lib/schema');

const DRY_RUN = process.argv.includes('--dry-run');
const FIELD_ORDER = ['audience', 'benefitType', 'eligibilityDetail', 'claimRequirements', 'availability'];

const CURATED_SOURCES = new Set(['Curated', 'Curated-CN']);

function main() {
  const store = loadStore(DEALS);
  const curated = loadCurated().deals;
  const curatedIds = new Set(curated.map(d => d.id));

  // existing' = 摘掉策展条目后的既有数据（策展只从人工文件进来），并**剥掉 provenance**。
  //
  // ⚠️ 剥掉 provenance 是这次收口的**关键一步**，不是顺手清理：
  // `dedup.mergeAudienceFields` 里有一条 `hadProvenance` 短路（契约 §5.3.2：两侧都没
  // provenance 时才不生成），它的本意是「不要凭空造出处」。但它同时让**任何**已有的
  // provenance 变成永久的 —— 包括手工写坏的那种。实测过：不剥的话，重放之后那 56 条
  // 手工 provenance 一字不动地活下来（档位仍是 `collected`），收口等于没做。
  //
  // 剥掉之后，出处只能由两处产生：人工文件（curated）与 merge 的逐字段仲裁结果。
  // 这正是我们要的「唯一权威」。
  const stripProvenance = deal => {
    const { provenance, ...rest } = deal;
    return rest;
  };
  const nonCurated = store.deals
    .filter(d => !curatedIds.has(d.id) && !CURATED_SOURCES.has(d.source))
    .map(stripProvenance);
  const removedCurated = store.deals.length - nonCurated.length;

  // 重放一轮：existing 传空 —— 让 merge 把我们当成"第一次见到这些条目"
  const { deals, stats } = mergeAll({
    fresh: nonCurated,
    existing: [],
    curated,
    today: (store.updatedAt || '').slice(0, 10) || undefined
  });

  assertAllValid(deals);

  // ---- 不变量：只判「丢值 / 改值」，不判「补值」 ----
  //
  // 为什么允许「补值」：重放的输入里有 32 条策展条目是**从人工文件进来的**，它们本来就
  // 该带上人工写好的六字段；而 deals.json 里那些同样的条目此前是手工镜像的产物。
  // 收口让它们回到「人工文件是唯一权威」，字段从无到有是**修好**，不是数据变化。
  // 反过来，「已知值消失」或「已知值被改写」才是必须拦住的事故。
  const byId = new Map(store.deals.map(d => [d.id, d]));
  const valueChanges = [];
  const additions = [];
  const orderOnly = [];
  const lost = [];
  const gained = [];
  const known = v => v !== undefined && v !== null;
  // 递归按键排序后再比 —— 用来把「键序不同」与「值不同」分开。
  //
  // 为什么要分开：`eligibilityDetail` 这类三态映射的键序由 `ELIGIBILITY_KEYS` 决定
  // （单一出处）。历史上有 19 条记录的键序是手工写进去的，与规范序不同 ——
  // 重放会把它们排成规范序，`JSON.stringify` 一比就是「已知值被改写」，
  // 于是一个纯序列化差异会把整次收口拦下来，而它其实一个值都没动。
  //
  // 反过来也不能直接按无序比较：字节级可复现正是这一轮的目标，键序不稳定
  // 会让「同一份数据两次构建产出相同字节」这条规矩失效。所以**分开报告**：
  // 真改值 → 拦；只是键序 → 计入 orderOnly，写盘后由 check-reproducible.js 确认收敛。
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
      return out;
    }
    return value;
  };
  const canonStr = value => JSON.stringify(canonical(value));
  for (const after of deals) {
    const before = byId.get(after.id);
    if (!before) { gained.push(after.title); continue; }
    for (const field of FIELD_ORDER) {
      const a = before[field] === undefined ? null : before[field];
      const b = after[field] === undefined ? null : after[field];
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      if (canonStr(a) === canonStr(b)) { orderOnly.push(`${after.title} · ${field}`); continue; }
      if (!known(a) && known(b)) { additions.push(`${after.title} · ${field}`); continue; }
      valueChanges.push(`${after.title} · ${field}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    }
  }
  for (const before of store.deals) {
    if (!deals.some(d => d.id === before.id)) lost.push(before.title);
  }

  const cred = {};
  for (const d of deals) {
    if (!d.provenance) continue;
    cred[d.provenance.credibility] = (cred[d.provenance.credibility] || 0) + 1;
  }

  console.log('=== audience 数据收口（重建 provenance）===');
  console.log(`源文件        : ${path.relative(ROOT, DEALS)}（${store.deals.length} 条）`);
  console.log(`摘掉策展条目  : ${removedCurated} 条（它们只从 curated 文件进来）`);
  console.log(`重放输入      : ${nonCurated.length} 条既有 + ${curated.length} 条策展`);
  console.log(`重建结果      : ${deals.length} 条（去重合并 ${stats.mergedDuplicates}）`);
  console.log(`冲突仲裁      : ${stats.audienceConflicts} 处`);
  console.log(`provenance 档位: ${JSON.stringify(cred)}`);
  console.log(`带 contrib 的 : ${deals.filter(d => d.provenance && d.provenance.contrib).length} 条` +
    `（audit 账本，跨轮只增不减）`);
  console.log(`带 fields 的  : ${deals.filter(d => d.provenance && d.provenance.fields).length} 条`);

  console.log('\n=== 不变量 ===');
  console.log(`条目数        : ${store.deals.length} → ${deals.length}`);
  console.log(`已知值被改写  : ${valueChanges.length} 处（必须为 0）`);
  valueChanges.slice(0, 8).forEach(v => console.log(`   · ${v}`));
  console.log(`字段被补上    : ${additions.length} 处（策展条目回到人工文件的投影，属修好）`);
  additions.slice(0, 4).forEach(v => console.log(`   · ${v}`));
  console.log(`仅键序归一    : ${orderOnly.length} 处（值一字未改，只是排成规范序）`);
  orderOnly.slice(0, 4).forEach(v => console.log(`   · ${v}`));
  console.log(`条目丢失      : ${lost.length}${lost.length ? ' —— ' + lost.slice(0, 5).join('、') : ''}`);
  console.log(`条目新增      : ${gained.length}${gained.length ? ' —— ' + gained.slice(0, 5).join('、') : ''}`);

  const bad = deals.filter(d => !validateDeal(d).ok);
  console.log(`校验不通过    : ${bad.length}`);

  if (valueChanges.length || lost.length || gained.length || bad.length) {
    console.error('\n❌ 收口会改写已知值 / 丢条目 / 产出不合规数据 —— 拒绝写盘。');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n(dry-run，未写盘)');
    return;
  }

  // `preserveUpdatedAt`：这次收口没有采集到任何新数据，把 updatedAt 刷成现在就是说谎
  // —— 同一个时间戳必须对应同一份内容（renderer 那份实测报告说的正是这件事的反面）。
  // 但内容确实变了，所以如实标注：保留采集时间，另记一次"数据形态收口"的说明由提交信息承担。
  const payload = writeDeals(deals, DEALS, new Date(), { preserveUpdatedAt: store.updatedAt });
  console.log(`\n✅ 已写入 ${path.relative(ROOT, DEALS)}：${payload.count} 条，updatedAt=${payload.updatedAt}（未变）`);
}

main();
