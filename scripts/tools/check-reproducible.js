#!/usr/bin/env node
/**
 * `deals.json` 可重建性门禁：**文件里不许有「没有任何源」的值**。
 *
 * 用法：
 *   node scripts/tools/check-reproducible.js            # 报告差异，有问题则退出 1
 *   node scripts/tools/check-reproducible.js --json     # 机器可读
 *
 * ## 为什么现有守卫抓不到这件事
 *
 * `scripts/tools/audience-rebuild.js` 也重放一轮 merge，但它**把六个字段原样当输入传进去**
 * （只剥 `provenance`）。于是「非策展条目的六字段值」是从输入直接搬到输出的 ——
 * 它证明的是「曲线条目不丢值」，不是「值有出处」。策展条目那条路径它是真的在验
 * （从人工文件重新投影），所以它报 0/0 是**真话，但只覆盖了一半**。
 *
 * 这就像校验「账本每页都有页码」而不校验「每笔钱都有来源」。
 *
 * ## 四节各自在问什么（刻意分开，因为它们的失败含义不同）
 *
 *   ① 策展**值**保真 —— 策展条目的五个值字段必须等于人工文件的投影。
 *      人工文件是它们的唯一权威；这里对不上说明有人改过 deals.json 而没改文件。
 *
 *   ② 非策展**值**可推导 —— 把采集侧条目的五个值字段连同 provenance 一起剥掉
 *      （模拟「采集器从来没有提供过这些值」）再从零重放，必须仍然得出相同的值。
 *      得不出 = 这个值只存在于 deals.json 里，是某次手工编辑的残影。**这是本门禁的核心。**
 *
 *   ③ 出处一致 —— 重放后每条记录的 provenance 必须与文件里的一致。
 *
 *   ④ 声明式补充自身完整 —— 没有非法条目、没有指向已消失条目的孤儿条目、不与策展撞 id。
 *
 *   ⑤ 人工文件里手写的 `provenance.credibility` 必须等于**同一条规则**算出来的档位。
 *      它是派生字段，不是可以自由填写的输入；两者分家时 `validateDeal` 两种取值都放行，
 *      所以此前没有任何门禁会拦（2026-09-29 收口时修掉 32 条并补上这一节）。
 *
 * ## 为什么 ① 只比「值」而把 provenance 交给 ③
 *
 * 第一版把 `provenance` 也放进 ①（`AUDIENCE_FIELD_ORDER` 含它），于是在一次**真实采集**
 * 之后立刻报了 32 处不一致 —— 而那不是缺陷，是**我的断言写错了**：
 *
 *   `provenance` 是**合并算出来的**，不是人工文件里的输入。那 32 条策展记录在文件里手写的
 *   是 `credibility:'curated'`、不带 `contrib`；而 `credibilityOf()` 的定义是
 *   「人工策展来源 **且** 核验过且有日期 → `editorial`」，它们全都 `verified:true` +
 *   `verifiedAt` —— 于是 merge 按定义算出 `editorial` 并补上 `contrib`（§5.2.2 要求记账落盘）。
 *
 * 拿「算出来的值」去比「手写的输入」必然不等。真正的可重建性问题是另一个：
 * **把管线再跑一遍，还产不产得出同一份文件** —— 那是 ③，而 ③ 覆盖了 provenance 的全部。
 *
 * （那次误报的副产品是一条真实发现：那 32 条手写的 `credibility:'curated'` 与代码对
 *   `editorial` 的定义互相矛盾。当时只写了说明、没动数据；现在按「文件服从规则」修掉了，
 *   并由上面的 ⑤ 保证不再分家 —— 两条规则（`credibilityOf` 与 `migrationCredibility`）
 *   对这 32 条的输入本来就一致地给出 `editorial`，所以不存在「两种读法」。）
 *
 * ## ⚠️ 那 32 条手写值的「之前」是什么状态：无法从 git 复核
 *
 * 上面几段一直在说「文件里手写的是 `credibility:'curated'`」。这句话**当时为真**
 * （写这一段时的工作区就是这样：同一轮里读文件、逐条比对、只改了 `credibility` 的值），
 * 但它**在版本历史里查不到**，因为那次中间状态**从未提交**：
 *
 *   · 提交 `08d81cc`（v1.1 之前）里，两个策展文件**一个 `provenance` 都没有**，
 *     自然也没有 `credibility`；
 *   · `git log -S'"credibility"' --all -- <两个文件>` 为空，悬空对象里也没有；
 *   · 整个 v1.1（含 `provenance` 块本身）是随收口一起进 `f4c17d5` 的 ——
 *     于是相对历史看，那些值**一出现就是 `editorial`**。
 *
 * 这是独立验证代理查出来的（它把这半条判成 REFUTED，判得对）。留这段的目的不是辩解，
 * 而是记下一条纪律：**未提交的中间状态不是证据**。以后这类「我改之前它是什么样」的
 * 断言，要么在动手前先 `git stash`/临时提交留痕，要么就把话说清楚 ——
 * 说成「工作区当时是 X（不可从历史复核）」而不是「文件里写的是 X」。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DEALS = path.join(ROOT, 'deals.json');
const JSON_OUT = process.argv.includes('--json');

const { loadStore, mergeAll, assertAllValid } = require('../lib/store');
const { loadCurated, CURATED_FILES } = require('../lib/curated');
const { loadOverrides } = require('../lib/audience-overrides');
const { AUDIENCE_FIELD_ORDER } = require('../lib/schema');
const { credibilityOf } = require('../lib/dedup');
const { hasKnown } = require('../lib/audience');

/** 采集器真正会产出的字段之外，那五个「值」字段（`provenance` 单独处理） */
const VALUE_FIELDS = AUDIENCE_FIELD_ORDER.filter(field => field !== 'provenance');

const CURATED_SOURCES = new Set(['Curated', 'Curated-CN']);

/** 深度相等（只比较这些字段，值都是 JSON 可表达的） */
function same(a, b) {
  const na = a === undefined ? null : a;
  const nb = b === undefined ? null : b;
  return JSON.stringify(na) === JSON.stringify(nb);
}

const known = value => value !== undefined && value !== null;

function main() {
  const store = loadStore(DEALS);
  const curated = loadCurated().deals;
  const curatedIds = new Set(curated.map(d => d.id));
  const isCuratedRecord = deal => curatedIds.has(deal.id) || CURATED_SOURCES.has(deal.source);
  const today = (store.updatedAt || '').slice(0, 10) || undefined;

  // ---- ① 策展值保真：策展条目的五个值字段 = 人工文件的投影 ----
  const curatedById = new Map(curated.map(d => [d.id, d]));
  const projectionDrift = [];
  for (const deal of store.deals) {
    if (!isCuratedRecord(deal)) continue;
    const source = curatedById.get(deal.id);
    if (!source) {
      projectionDrift.push({ title: deal.title, field: '(整条)', detail: '策展来源但不在任何人工文件里' });
      continue;
    }
    for (const field of VALUE_FIELDS) {
      if (!same(deal[field], source[field])) {
        projectionDrift.push({
          title: deal.title,
          field,
          detail: `${JSON.stringify(source[field] ?? null)} → ${JSON.stringify(deal[field] ?? null)}`
        });
      }
    }
  }

  // ---- ② 采集侧五个值字段可推导：剥干净再重放 ----
  //
  // 剥掉 provenance 的理由与 audience-rebuild 相同（`hadProvenance` 短路会让手工 provenance
  // 永远活着）；多剥掉五个值字段，才是本门禁与它的区别所在。
  const strip = deal => {
    const next = { ...deal };
    delete next.provenance;
    for (const field of VALUE_FIELDS) delete next[field];
    return next;
  };
  const nonCurated = store.deals.filter(d => !isCuratedRecord(d));

  // overrides 由 `mergeAll` 自己按 id 注入（默认加载），这里**只读来对账**，
  // 不再当作第三条 curated 流喂进去 —— 早先那样写会让 `curated.concat(undefined)`
  // 凭空造出一条空记录，报成「#134 id 非法」，症状完全指向错误的方向。
  const overrides = loadOverrides();

  const { deals: replayed } = mergeAll({
    fresh: nonCurated.map(strip),
    existing: [],
    curated,
    today
  });
  assertAllValid(replayed);
  const replayedById = new Map(replayed.map(d => [d.id, d]));

  const orphans = [];
  const invented = [];
  for (const before of nonCurated) {
    const after = replayedById.get(before.id);
    if (!after) {
      orphans.push({ title: before.title, field: '(整条)', detail: '重放后整条消失' });
      continue;
    }
    for (const field of VALUE_FIELDS) {
      if (same(before[field], after[field])) continue;
      if (hasKnown(before[field]) && !hasKnown(after[field])) {
        orphans.push({ title: before.title, field, detail: `已知值无源：${JSON.stringify(before[field])}` });
      } else if (!hasKnown(before[field]) && hasKnown(after[field])) {
        invented.push({ title: before.title, field, detail: JSON.stringify(after[field]) });
      } else {
        orphans.push({
          title: before.title,
          field,
          detail: `${JSON.stringify(before[field] ?? null)} → ${JSON.stringify(after[field] ?? null)}`
        });
      }
    }
  }

  // ---- ③ 出处一致 + 管线不动点 ----
  //
  // 把**采集侧条目按采集器的真实形态**（不含五个值字段与 provenance）当作本次新采，
  // 连同既有 deals.json 与人工文件一起重跑一遍完整 merge。
  // 这就是「采集器再跑一次」：如果 deals.json 是这套源的不动点，结果必须与它逐字段相同。
  //
  // 它覆盖的是**算出来的东西**（provenance / credibility / contrib）——
  // 那些东西的出处是管线本身，不是某一份人工文件，所以只能这样验。
  const collectorSide = nonCurated.map(strip);
  const { deals: fixedPoint } = mergeAll({
    fresh: collectorSide,
    existing: store.deals,
    curated,
    today
  });
  assertAllValid(fixedPoint);
  const fixedById = new Map(fixedPoint.map(d => [d.id, d]));

  const provenanceDrift = [];
  const fixedPointDrift = [];
  const evidenceDrift = [];
  for (const before of store.deals) {
    const after = fixedById.get(before.id);
    if (!after) {
      fixedPointDrift.push({ title: before.title, field: '(整条)', detail: '不动点重跑后整条消失' });
      continue;
    }
    if (!same(before.provenance, after.provenance)) {
      provenanceDrift.push({
        title: before.title,
        detail: `${JSON.stringify(before.provenance ?? null)} → ${JSON.stringify(after.provenance ?? null)}`
      });
    }
    // v1.3：官方引文也是**人工文件里的输入**，必须原样穿过 merge。
    // 为什么单独一条：`evidence` 不在 §5.1 的六字段仲裁里，它的合并规则是「并集 + 排序 + 上限」，
    // 谁写错（比如按 winner 取）都不会让别的断言红 —— 只会让证据静默消失或换序。
    if (!same(before.evidence ?? null, after.evidence ?? null)) {
      evidenceDrift.push({
        title: before.title,
        detail: `${JSON.stringify(before.evidence ?? null)} → ${JSON.stringify(after.evidence ?? null)}`
      });
    }
    for (const field of VALUE_FIELDS) {
      if (!same(before[field], after[field])) {
        fixedPointDrift.push({
          title: before.title,
          field,
          detail: `${JSON.stringify(before[field] ?? null)} → ${JSON.stringify(after[field] ?? null)}`
        });
      }
    }
  }
  if (dealsLengthMismatch(store.deals, fixedPoint)) {
    fixedPointDrift.push({ title: '(集合)', field: '(条数)', detail: `${store.deals.length} → ${fixedPoint.length}` });
  }

  // ---- ④ 声明式补充自身的完整性 ----
  //
  // 一个**过期**的 override（id 已不在 deals.json 里）比没有更糟：它看起来还在管着一条记录，
  // 实际上一条都不管，而下次有人按它去查「这个值谁说的」会查到一个不存在的条目。
  const dealIds = new Set(store.deals.map(d => d.id));
  const missingTargets = overrides.entries.filter(e => !dealIds.has(e.id)).map(e => `${e.title || e.id}(${e.id})`);
  const clashesCurated = overrides.entries.filter(e => curatedIds.has(e.id)).map(e => `${e.title || e.id}(${e.id})`);

  const perField = {};
  for (const item of orphans) perField[item.field] = (perField[item.field] || 0) + 1;

  // ---- ⑤ 人工文件里手写的 credibility 必须等于规则算出来的那一档 ----
  //
  // 这一条修的是一个**看起来像 bug 的合法状态**：32 条策展记录曾手写
  // `credibility:'curated'`（⚠️ 那是**当时未提交的工作区状态**，无法从 git 复核 ——
  // 详见文件头「那 32 条手写值的『之前』是什么状态」那段），而代码对同样的输入
  // （`source ∈ {Curated, Curated-CN}` + `verified:true` + `verifiedAt`）
  // 一律算出 `editorial` —— merge 落盘的就是 `editorial`。`validateDeal` 两种取值都放行，
  // 所以两者可以长期矛盾而**没有任何东西会红**。
  //
  // 它本身无害（声明值既不参与 `pickScalar` 仲裁、也不渲染），真正的风险是**下一个人
  // 看到这处矛盾会去「修」它**，而最顺手的修法是让 `credibilityOf` 读声明值 ——
  // 那会让这 32 条从 `editorial` 掉到 `curated`，在多来源仲裁里输给本来赢不了的对手
  // （单来源的数据上完全看不出来）。所以处置方式是**让文件服从规则 + 加这条门禁**，
  // 而不是写一段「别动它」的说明。
  //
  // 判据直接调用 `credibilityOf` 本体，不在这里重写规则：这条门禁存在的理由就是
  // 「只有一处口径」，重写一遍等于把刚修掉的问题换个地方种回去。
  const humanCredibilityDrift = [];
  for (const spec of CURATED_FILES) {
    const file = path.join(ROOT, 'scripts', 'data', spec.file);
    if (!fs.existsSync(file)) continue;
    let records;
    try {
      records = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      humanCredibilityDrift.push({ file: spec.file, title: '(整份文件)', detail: `解析失败: ${error.message}` });
      continue;
    }
    for (const record of records) {
      const declared = record.provenance && record.provenance.credibility;
      if (declared === undefined) continue;
      const stripped = { ...record };
      delete stripped.provenance;
      const computed = credibilityOf(stripped);
      if (declared !== computed) {
        humanCredibilityDrift.push({
          file: spec.file,
          title: record.title || record.id || '(无标题)',
          detail: `文件写的是 ${declared}，规则算出来是 ${computed}`
        });
      }
    }
  }

  const result = {
    total: store.deals.length,
    curated: store.deals.filter(isCuratedRecord).length,
    nonCurated: nonCurated.length,
    overrides: overrides.report.ok,
    overridesInvalid: overrides.report.invalid.length,
    overridesMissing: overrides.report.missing,
    overrideMissingTargets: missingTargets.length,
    overrideCuratedClash: clashesCurated.length,
    curatedProjectionDrift: projectionDrift.length,
    orphans: orphans.length,
    orphansPerField: perField,
    invented: invented.length,
    provenanceDrift: provenanceDrift.length,
    fixedPointDrift: fixedPointDrift.length,
    evidenceDrift: evidenceDrift.length,
    humanCredibilityDrift: humanCredibilityDrift.length,
    humanCredibilityExamples: humanCredibilityDrift.slice(0, 8),
    orphanExamples: orphans.slice(0, 12),
    provenanceExamples: provenanceDrift.slice(0, 5),
    evidenceExamples: evidenceDrift.slice(0, 5),
    fixedPointExamples: fixedPointDrift.slice(0, 12)
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('=== deals.json 可重建性 ===');
    console.log(`条目          : ${result.total}（策展 ${result.curated} / 非策展 ${result.nonCurated}）`);
    console.log(`声明式补充    : ${result.overrides} 条已加载${result.overridesMissing ? '（⚠ 文件不存在 —— 手工值无源）' : ''}`);
    console.log(`补充自身问题  : 非法 ${result.overridesInvalid} · 指向已不存在的条目 ${result.overrideMissingTargets} · 与策展条目撞 id ${result.overrideCuratedClash}（都应为 0）`);
    overrides.report.invalid.slice(0, 8).forEach(item => console.log(`   ⚠ [${item.index}] ${item.reason}`));
    missingTargets.slice(0, 8).forEach(t => console.log(`   ⚠ 过期的补充条目：${t}`));
    clashesCurated.slice(0, 8).forEach(t => console.log(`   ⚠ 撞上策展条目（人工文件才是它的权威）：${t}`));
    console.log('');
    console.log('=== ① 策展值保真（策展条目的值 = 人工文件的投影）===');
    console.log(`不一致        : ${result.curatedProjectionDrift} 处（必须为 0）`);
    projectionDrift.slice(0, 8).forEach(item => console.log(`   · ${item.title} · ${item.field}: ${item.detail}`));
    console.log('');
    console.log('=== ② 采集侧值可推导（剥干净后从零重放）===');
    console.log(`孤儿值        : ${result.orphans} 处（必须为 0 —— 有值没有源）`);
    if (Object.keys(perField).length) console.log(`   分布        : ${JSON.stringify(perField)}`);
    orphans.slice(0, 12).forEach(item => console.log(`   · ${item.title} · ${item.field}: ${item.detail}`));
    console.log(`凭空出现      : ${result.invented} 处（重放造出了文件里没有的值）`);
    invented.slice(0, 5).forEach(item => console.log(`   · ${item.title} · ${item.field}: ${item.detail}`));
    console.log('');
    console.log('=== ③ 出处一致 / 管线不动点（把采集器再跑一遍）===');
    console.log(`provenance 漂移: ${result.provenanceDrift} 处（必须为 0）`);
    provenanceDrift.slice(0, 5).forEach(item => console.log(`   · ${item.title}: ${item.detail}`));
    console.log(`值字段漂移     : ${result.fixedPointDrift} 处（必须为 0）`);
    fixedPointDrift.slice(0, 12).forEach(item => console.log(`   · ${item.title} · ${item.field}: ${item.detail}`));
    console.log(`引文漂移       : ${result.evidenceDrift} 处（必须为 0 —— 官方引文是人工输入，必须原样穿过 merge）`);
    evidenceDrift.slice(0, 5).forEach(item => console.log(`   · ${item.title}: ${item.detail}`));
    console.log('');
    console.log('=== ⑤ 人工文件的 credibility = 规则算出来的那一档 ===');
    console.log(`手写值矛盾     : ${result.humanCredibilityDrift} 处（必须为 0）`);
    humanCredibilityDrift.slice(0, 8).forEach(item =>
      console.log(`   · [${item.file}] ${item.title}: ${item.detail}`));
    console.log('');
  }

  const failed = result.curatedProjectionDrift || result.orphans || result.invented ||
    result.provenanceDrift || result.fixedPointDrift || result.evidenceDrift || result.overridesInvalid ||
    result.overrideMissingTargets || result.overrideCuratedClash || result.humanCredibilityDrift ||
    (result.overridesMissing && result.nonCurated > 0);

  if (failed) {
    if (!JSON_OUT) {
      console.error('❌ deals.json 不是它的源的纯投影 —— 上面的差异说明文件里有东西无法由 源 + 管线 重建。');
      console.error('   孤儿值：把手工值写进 scripts/data/audience-overrides.json，或让采集器产出它。');
      console.error('   不动点漂移：说明管线对同一份输入不再幂等，先查 merge 侧而不是数据本身。');
      console.error('   手写 credibility 矛盾：**改人工文件去服从规则**，不要把 credibilityOf 改成读声明值 ——');
      console.error('   那会让这些条目掉档，在多来源仲裁里输给本来赢不了的对手（单来源数据上看不出来）。');
    }
    process.exit(1);
  }
  if (!JSON_OUT) console.log('✅ deals.json 可重建：值全部有源，且管线对它是幂等的（再跑一遍采集不会改动它）。');
}

/** 条数/集合一致性（重跑不应该让条目消失或凭空多出来） */
function dealsLengthMismatch(before, after) {
  if (before.length !== after.length) return true;
  const ids = new Set(after.map(d => d.id));
  return before.some(d => !ids.has(d.id));
}

main();
