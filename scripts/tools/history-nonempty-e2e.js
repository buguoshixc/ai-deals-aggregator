#!/usr/bin/env node
/**
 * §15 合成非空历史端到端夹具（T07）。
 *
 * ## 它解决什么
 *
 * 生产的三份变化日志里，**实质变化**（价格 / 额度 / 优惠 / 新增模型）几乎没有：留下的几乎只有
 * `created` 这一类锚点事件。「变化雷达 / 变化订阅 / 套餐变化 / API 价格变化 / 历史档案」这一整套
 * **非空渲染分支**因此在生产上恒不被走到 —— 上一轮审计里 `/changes/` 的 P1
 * （`F-r1-history-ai-001`：只要有 1 条变化，产物自检必失败）与 Archive 详情页的 P1
 * （`F-r1-history-ai-002`：每页 24/27 相对引用死链）都是这么藏住的。
 *
 * ## 判据的形态：**不从「生产日志当前有几条事件」这个快照出发**（t44）
 *
 * 这份夹具早期把「基线是空的」当成了默认事实（`out.events = []`、`live.length < 3` 就抛错）。
 * 数据一长（`deal-history.json` 出现第 1 条 `created`、`deals[]` 的构成变化），这两处都会
 * 变成**假红**：页面与数据都对，夹具却报「记录没有历史锚点」「记录只有 N 条」。
 * 现在的形态是关系式的：
 *   · 既有事件一律**保留**（它们是记录的锚点，抹掉等于伪造「这条记录没有历史」）；
 *   · 需要造事件的那几条记录，从「**还没有被既有事件锚定**的 `type=deal` 记录」里按 id 取；
 *   · 取不够 3 条（生命周期 / 今日首次收录 / 最近 6 天内首次收录 各一条）时
 *     **不是抛错**，而是打印「本轮样本不足，跳过并说明原因」并把这批断言记成**显式跳过**（见 `skip()`）。
 *
 * 这个脚本在一份**完全临时的工作区**（默认 `../qc-e2e`，即以冻结提交 detach 的第二个
 * worktree）里造一份**能过 `check:history` / `check:plan-history` / `check:api-plan-history`
 * 的非空合成历史**，然后在那一份工作区里跑完整的产品链路：
 *
 *   1. `node scripts/validate.js [--strict]`     —— 数据与三份日志自洽
 *   2. `node scripts/tools/history-verify.js` 等  —— 三份日志各自的门禁
 *   3. `node scripts/tools/build-local.js`        —— 产物自检（含 SEO 安全门禁）
 *   4. `node scripts/tools/seo-verify.js`         —— 独立验收（另一套解析）
 *   5. `node scripts/tools/verify-site.js`        —— 真浏览器冒烟（本地 Edge）
 *   6. 自写的产物断言                             —— Changes 行/ItemList、Archive 相对引用、
 *                                                    RSS + JSON Feed（**不复用上面的判据实现**）
 *
 * ## 三条纪律
 *
 * 1. **合成数据只落临时工作区**。脚本拒绝把任何文件写进它自己所在的工作区（`ROOT_SRC`），
 *    并在结束时逐字复核**生产三份 history 的 sha256 没有被改动**。
 * 2. **夹具不许改数据绕开失败**。合成历史只使用「事件」这一条真实通道：被跟踪字段的
 *    「旧值」写在事件的 `from` / `created.fields` 里，当前数据一个字都不改 ——
 *    因此它检验的正是「真的发生了这些变化时，产物对不对」。
 * 3. **判据不与被测实现共享**。产物断言自己解析 HTML / XML / JSON（正则 + JSON.parse），
 *    只做「集合相等 / 引用存在 / 计数一致」这类可独立复算的判断。
 *
 * ## 用法
 *
 *   node scripts/tools/history-nonempty-e2e.js                  # 默认：同步代码层 → 造合成非空夹具 → 全链路验收
 *   node scripts/tools/history-nonempty-e2e.js --state=pristine # 生产态（冻结提交的历史：deal 0 / plan 14 / api 6）
 *   node scripts/tools/history-nonempty-e2e.js --prepare-only   # 只造夹具（给人手工跑）
 *   node scripts/tools/history-nonempty-e2e.js --no-sync        # 不覆盖工作区代码（复现修复前的红）
 *   node scripts/tools/history-nonempty-e2e.js --no-browser     # 跳过真浏览器（无 Edge 的环境）
 *   node scripts/tools/history-nonempty-e2e.js --root=<dir>     # 指定夹具工作区
 *
 * **两种状态都要绿**：同一份代码在「生产态（变化流基本为空）」与「合成非空态」下的产物
 * 断言不同（空态不变量 vs 非空不变量），但两条命令链（build / seo-verify / verify-site）
 * 在两种状态下都必须 exit 0 —— 只让其中一种绿是没有意义的。
 *
 * 退出码非 0 = 有一步没通过（每一步的退出码都逐条打印）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT_SRC = path.join(__dirname, '..', '..');
const HISTORY_FILES = ['deal-history.json', 'plan-history.json', 'api-plan-history.json'];

/**
 * 同步到夹具工作区的文件：**冻结提交 + 这张表**。
 *
 * 为什么不整树同步：多任务并行时别人在飞的**代码**常常领先于数据（例如 API schema 新加一个
 * 必填字段、而生产数据还没补上），整树同步会把夹具染红成「别人的问题」—— 红/绿就再也
 * 归因不清了。所以只带本任务 inScope 的文件，外加**计价表展开口径所依赖的两个文件**
 * （`models-page.js` / `model-registry.js`：verify-site 的「行数 == 展开后的真实计价条目数」
 * 只有在展开语义下才成立，见 T06/T10）。
 *
 * 数据层（`deals.json` / `plans.json` / `api-plans.json` / `scripts/data/**`）**一律不同步**：
 * 那是夹具的输入，由脚本自己造（或按 `--state=pristine` 还原成冻结提交那一份）。
 */
const SYNC_FILES = [
  // 本任务 inScope（T07 + captain 授权的三个门禁文件）
  'scripts/lib/changes.js',
  'scripts/lib/page-kinds.js',
  'scripts/lib/plan-changes.js',
  'scripts/tools/build-local.js',
  'scripts/tools/changes-selftest.js',
  'scripts/tools/history-nonempty-e2e.js',
  'scripts/tools/seo-verify.js',
  'scripts/tools/verify-site.js',
  // T08：档案详情页的相对前缀现在由 `lib/archive.js` 的 `archiveEntryPrefix()` **唯一**给出，
  // build-local 会调它 —— 夹具工作区必须拿到同一份 archive.js，否则就是「新构建 + 旧库」，
  // 直接调用一个不存在的函数崩掉，而那不是夹具该验的东西。
  'scripts/lib/archive.js',
  'scripts/tools/archive-selftest.js',
  // 计价表「一条真实计价条目 = 一行」的展开语义（T05/T06 的改动）
  'scripts/lib/models-page.js',
  'scripts/lib/model-registry.js'
];

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

const DAY = 86400000;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function argValue(name, fallback = null) {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/**
 * 从工作区的 HEAD 取一份文件 —— 夹具的**真值基座**。
 *
 * 为什么不直接读工作区里的文件：夹具必须**可重跑**。上一次跑留下的合成事件如果在文件里，
 * 第二次跑就会在它们之上再叠一份（同一件事两份历史）。冻结提交里那份（生产的 0 事件 /
 * 14 条 created）才是「真实历史」的起点，而且它与工作区里别人的在飞改动无关。
 */
function gitShow(repo, rel) {
  const result = spawnSync('git', ['-C', repo, 'show', `HEAD:${rel}`], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`git show HEAD:${rel} 失败：${result.stderr || result.stdout}`);
  return result.stdout;
}

const hasFlag = name => process.argv.includes(`--${name}`);

/** 相对基准日往前 n 天（纯日期；不读墙上时钟） */
function dayBefore(asOf, n) {
  return new Date(Date.parse(`${asOf}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);
}

/** 确定性排序：按 id 升序 */
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

let checks = 0;
const failures = [];
function check(name, ok, detail = '') {
  checks++;
  if (ok) console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * **显式跳过**：既不是通过，也不是静默略过（「0 与没跑过必须看起来不一样」）。
 *
 * 只有一种情况会走到这里：合成夹具的**样本不足**（当前数据里凑不出它需要的那几条可比记录）。
 * 那种情况下「断言通过」是假话（根本没有样本）、「抛错」是假红（数据没错，是夹具没料）——
 * 所以第三条路是：把原因打印出来、把它记进 `skips`、并在汇总里报出条数。跳过会被计入
 * `checks`（判定点总数不因跳过而缩水），失败退出码不受它影响。
 */
const skips = [];
function skip(name, reason) {
  checks++;
  skips.push({ name, reason });
  console.log(`  ⏭ 跳过：${name} —— ${reason}`);
}

function section(title) {
  console.log(`\n${title}`);
}

/**
 * 在工作区里跑一条命令。stdout/stderr 直通（保留逐字证据），返回退出码。
 * 失败不抛：调用方要的就是「这几步的退出码」。
 */
function run(dir, command, args, { allowFail = false } = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}   （cwd=${path.relative(ROOT_SRC, dir) || '.'}）`);
  const result = spawnSync(command, args, { cwd: dir, stdio: 'inherit', shell: false });
  const code = result.status === null ? -1 : result.status;
  if (code !== 0 && !allowFail) {
    console.log(`  ⚠️  退出码 ${code}`);
  }
  return code;
}

/**
 * 事件的**文件顺序**：按 `at` 升序（同一时间保持写入顺序，`Array#sort` 稳定）。
 *
 * 为什么不是按类型排序：门禁的链校验与重放都按**文件顺序**逐条走（生产写入路径是追加式的，
 * 每条记录的事件因此天然按时间排列）。按类型排序会把 `restored` 排到 `ended` 前面，
 * 直接造出一份「恢复出现在结束之前」的假日志。
 */
function chronological(events) {
  return events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => (a.event.at === b.event.at ? a.index - b.index : (a.event.at < b.event.at ? -1 : 1)))
    .map(row => row.event);
}

/* ------------------------------------------------------------------ */
/* /changes/ 分栏读数（纯函数：判据的唯一出处，也供反证夹具直接驱动）         */
/* ------------------------------------------------------------------ */

/**
 * 从 `/changes/` 的 HTML 里读分栏：`<h2>标题（计数）</h2>` 是分栏头，**下一个 h2 之前**是这一栏的正文。
 *
 * 为什么要有这支出：生产态那三条断言原先写死了「优惠变化一定是空的」，数据一长就假红。
 * 改成关系式之后，「某个分栏为 0 ⇔ 正文写出它自己那句「没有观测到…」」这条关系必须能被
 * **构造出来的输入**顶红一次（反证），而唯一的做法是让判据本身是纯函数 ——
 * 否则只能靠改产品代码去撞它，而那种改法会先撞上 build-local 自己的产物自检，
 * 反证就变成了「证明了别的东西会红」。
 *
 * @param {string} html `/changes/index.html` 的文本（或任何同形的片段）
 * @returns {{headings:object[], countOf:function, bodyOf:function, wordingDrift:function}}
 */
function changesSectionsOf(html) {
  const text = String(html || '');
  const headings = [...text.matchAll(/<h2>([^<]*)（(\d+)）<\/h2>/g)]
    .map(m => ({ title: m[1], count: Number(m[2]), index: m.index, text: m[0] }));
  const hitOf = title => headings.find(row => row.title === title);
  const countOf = title => {
    const hit = hitOf(title);
    return hit ? hit.count : -1;
  };
  const bodyOf = title => {
    const hit = hitOf(title);
    if (!hit) return '';
    const next = headings.find(row => row.index > hit.index);
    return text.slice(hit.index + hit.text.length, next ? next.index : text.length);
  };
  /** 无差异 ⇒ `null`；有差异 ⇒ 一句点名分栏与两侧读数的话 */
  const wordingDrift = title => {
    const count = countOf(title);
    const said = bodyOf(title).includes('没有观测到');
    return (count === 0) === said ? null
      : `${title}：分栏计数=${count}（${count === 0 ? '空' : '非空'}）而正文${said ? '写了' : '没写'}「没有观测到…」`;
  };
  return { headings, countOf, bodyOf, wordingDrift };
}

/* ------------------------------------------------------------------ */
/* 合成历史：三份日志，各覆盖 schema 允许的事件类型                        */
/* ------------------------------------------------------------------ */
/**
 * 造一份**非空**的 `deal-history.json`。
 *
 * 便民约定（三份日志共用）：一个记录的事件按**时间顺序**写入（`created` 在最前），
 * 因此链校验与重放的顺序就是文件的顺序 —— 生产写入路径也是追加式的。
 *
 * 两条关系式纪律（t44；此前是两处写死的快照假设，数据一长就假红）：
 *   ① 既有事件**保留**（`kept`）。它们是记录的锚点：抹掉它们等于伪造「这条记录没有历史」，
 *      `history.verifyStore()` 会（正确地）判「记录没有历史锚点」。所以合成事件是**追加**，
 *      不是「清空重造」—— 夹具不该对「冻结日志里现在有几条事件」有意见。
 *   ② 需要造事件的记录，从「**还没有被既有事件锚定**的 `type=deal` 记录」里按 id 取（见
 *      `dealSeedCandidates`）：对一条已经有 `created` 的记录再补一个 `created`，造出来的是
 *      一份自相矛盾的日志 —— 那是夹具的错，不是数据的错。
 */

/** 非空 deal 夹具需要的可比记录数：生命周期最全的一条 / 今日首次收录 / 最近 6 天内首次收录 */
const DEAL_FIXTURE_SEEDS = 3;

/**
 * 可以拿来造事件的 `deal` 记录（**纯函数**，只吃数组）：`type === 'deal'` ∧ 有标题 ∧ 还没有被
 * 既有事件锚定，按 id 升序。判据里的每一项都点名了对象，不在函数里读文件、不读时钟。
 */
function dealSeedCandidates(deals, anchoredIds = []) {
  const anchored = new Set(anchoredIds || []);
  return (deals || [])
    .filter(deal => deal && deal.type === 'deal' && deal.title)
    .filter(deal => !anchored.has(deal.id))
    .sort(byId);
}

/**
 * 样本够不够造非空 deal 夹具：够 ⇒ `null`；不够 ⇒ **原因对象**（不抛错）。
 *
 * 这是 `history-nonempty-e2e` 里唯一一处「样本不足」的判据，它由数据现算：
 * 需要多少条（`DEAL_FIXTURE_SEEDS`）、实际能拿到几条、为什么（点名数据对象与判据），
 * 全部写进返回值，调用方据此打印「本轮样本不足，跳过并说明原因」并**显式跳过**，
 * 而不是抛一个看起来像内容缺陷的错、也不是把没跑过的断言当成通过。
 */
function dealSeedShortage(deals, anchoredIds = []) {
  const candidates = dealSeedCandidates(deals, anchoredIds);
  if (candidates.length >= DEAL_FIXTURE_SEEDS) return null;
  return {
    object: 'deals.json 的 deals[]（判据：记录存在 ∧ type === "deal" ∧ title 非空 ∧ 未被冻结日志里的既有事件锚定）',
    actual: candidates.length,
    required: DEAL_FIXTURE_SEEDS,
    reason: `本轮样本不足，跳过并说明原因：deals.json 里可用来造事件的 type=deal 记录只有 ${candidates.length} 条`
      + `（${candidates.map(deal => deal.id).join(', ') || '一条也没有'}），`
      + `而合成非空夹具需要 ≥${DEAL_FIXTURE_SEEDS} 条（生命周期最全 / 今日首次收录 / 最近 6 天内首次收录 各一条）；`
      + '依赖这几条记录的断言本轮不参与判定（它们没有变成「通过」）'
  };
}

function buildDealFixture({ history, store, deals, asOf }) {
  const out = JSON.parse(JSON.stringify(store));
  // 既有事件**保留**（见上面 ①）：`deal-history.json` 现在有 1 条 `created`，它是那条记录的锚点。
  const kept = Array.isArray(out.events) ? out.events.slice() : [];
  out.absence = {};
  const tracked = deal => history.trackedValuesOf(deal);

  const shortage = dealSeedShortage(deals, kept.map(event => event.id));
  if (shortage) return { skipped: true, shortage, store: null, expect: { keptEvents: kept.length, shortage } };

  const live = dealSeedCandidates(deals, kept.map(event => event.id));
  const lifecycle = live[0];        // 生命周期最全的一条：created / benefit_changed / ended / restored
  const createdToday = live[1];     // 今日首次收录
  const createdRecent = live[2];    // 过去 6 天内首次收录（进「最近 7 天变化」）

  const events = [];
  const push = event => events.push(event);

  // ① 生命周期齐全的一条
  const field = 'discountInfo';
  const snapshot = tracked(lifecycle);
  const currentValue = Object.prototype.hasOwnProperty.call(snapshot, field) ? snapshot[field] : null;
  const olderValue = currentValue === null
    ? '合成夹具：这条优惠更早的说明（当时还没有免费额度）'
    : `【合成夹具·旧值】${currentValue}`;
  push({
    id: lifecycle.id, at: dayBefore(asOf, 8), type: 'created', field: null, from: null, to: null,
    fields: Object.assign({}, snapshot, { [field]: olderValue }),
    runAt: `${dayBefore(asOf, 8)}T00:00:00.000Z`
  });
  push({
    id: lifecycle.id, at: dayBefore(asOf, 4), type: 'benefit_changed', field,
    from: olderValue, to: currentValue, origin: 'observed',
    runAt: `${dayBefore(asOf, 4)}T00:00:00.000Z`
  });
  push({
    id: lifecycle.id, at: dayBefore(asOf, 3), type: 'ended', field: null, from: null, to: null,
    reason: 'source_no_longer_lists',
    label: { title: lifecycle.title, vendor: lifecycle.vendor || null },
    runAt: `${dayBefore(asOf, 3)}T00:00:00.000Z`
  });
  push({
    id: lifecycle.id, at: dayBefore(asOf, 1), type: 'restored', field: null, from: null, to: null,
    runAt: `${dayBefore(asOf, 1)}T00:00:00.000Z`
  });

  // ② 今日首次收录 + ③ 过去 6 天内首次收录（这两条让「今日新增」与「created 落进最近 7 天变化」
  //    两条渲染分支都真的被走到）
  push({
    id: createdToday.id, at: asOf, type: 'created', field: null, from: null, to: null,
    fields: tracked(createdToday), runAt: `${asOf}T00:00:00.000Z`
  });
  push({
    id: createdRecent.id, at: dayBefore(asOf, 4), type: 'created', field: null, from: null, to: null,
    fields: tracked(createdRecent), runAt: `${dayBefore(asOf, 4)}T00:00:00.000Z`
  });

  // ④ 已经离开数据集的一条：只在基线里 + 一条 ended（带墓碑标题）——
  //    它是「页面上有行、但没有详情页可链」的那一类，正是 ItemList 必须排除的对象
  const goneId = 'deadbeef0001';
  if (deals.some(deal => deal.id === goneId)) throw new Error(`合成墓碑 id ${goneId} 与真实数据撞车`);
  out.baseline.fields[goneId] = {
    pricingModel: 'freemium',
    type: 'deal',
    category: 'API服务',
    region: 'global',
    source: '合成夹具'
  };
  push({
    id: goneId, at: dayBefore(asOf, 4), type: 'ended', field: null, from: null, to: null,
    reason: 'pruned_expired',
    label: { title: '【合成夹具】已离开数据集的优惠', vendor: '合成厂商' },
    runAt: `${dayBefore(asOf, 4)}T00:00:00.000Z`
  });

  // 既有事件 + 合成事件（见上面 ①）：顺序按 `at` 升序，同一时刻保持原顺序（既有的在前）
  out.events = chronological(kept.concat(events));
  const problems = history.verifyStore(out, deals, { bytes: null });
  if (problems.length) throw new Error(`合成 deal-history 自身没过 verifyStore：\n  - ${problems.slice(0, 6).join('\n  - ')}`);
  // 基线仍是「按 id 升序」的规范形状（加进去的那条墓碑也要在正确的位置上）
  const sortedFields = {};
  for (const id of Object.keys(out.baseline.fields).sort()) sortedFields[id] = out.baseline.fields[id];
  out.baseline.fields = sortedFields;
  return {
    store: out,
    expect: {
      lifecycleId: lifecycle.id,
      createdTodayId: createdToday.id,
      createdRecentId: createdRecent.id,
      goneId,
      // 既有事件数由**冻结日志**现算（不是「生产上一定是 0 条」这个快照）
      keptEvents: kept.length
    }
  };
}

/** 造一份非空的 `plan-history.json`（Coding 套餐：created / price_changed / ended / restored） */
function buildPlanFixture({ planHistory, planHistoryCore, store, plans, asOf }) {
  const out = JSON.parse(JSON.stringify(store));
  // **保留**日志里已有的事件（那 14 条 created 是这些套餐的历史锚点，抹掉它们等于伪造
  // 「这些套餐没有历史」——门禁会（正确地）判「记录没有历史锚点」）。
  const kept = Array.isArray(out.events) ? out.events.slice() : [];
  out.absence = out.absence || {};
  const tracked = plan => planHistoryCore.trackedValuesOf(plan, planHistory.PLAN_TRACKED_FIELDS, planHistory.PROFILE);
  const anchored = new Set(kept.map(event => event.planId));

  const candidates = plans.filter(plan => plan && plan.id && !anchored.has(plan.id)).sort(byId);
  const withPrice = candidates.filter(plan => plan.billing && typeof plan.billing.regularPrice === 'number');
  if (!withPrice.length) throw new Error('plans.json 里没有「还没有历史事件」且带数值原价的套餐，价格变化的夹具造不出来');
  const priced = withPrice[0];
  const fresh = candidates.filter(plan => plan !== priced && plan.planName)[0];
  if (!fresh) throw new Error('plans.json 里没有第二条「还没有历史事件」的套餐，夹具需要两条');

  const events = [];
  const snapshot = tracked(priced);
  const field = 'billing.regularPrice';
  const current = priced.billing.regularPrice;
  const older = current + 20;
  // 日期全部落在套餐自己的基准日（`plans.json.updatedAt`）之内 —— 事件日期越过它是门禁红
  events.push({
    planId: priced.id, at: dayBefore(asOf, 6), type: 'created', field: null, from: null, to: null,
    fields: Object.assign({}, snapshot, { [field]: older }),
    runAt: `${dayBefore(asOf, 6)}T00:00:00.000Z`
  });
  events.push({
    planId: priced.id, at: dayBefore(asOf, 2), type: 'price_changed', field,
    from: older, to: current, origin: 'observed', runAt: `${dayBefore(asOf, 2)}T00:00:00.000Z`
  });
  events.push({
    planId: priced.id, at: dayBefore(asOf, 1), type: 'ended', field: null, from: null, to: null,
    reason: 'source_no_longer_lists', label: { title: priced.planName, vendor: priced.provider || null },
    firstMissedAt: dayBefore(asOf, 1), runAt: `${dayBefore(asOf, 1)}T00:00:00.000Z`
  });
  events.push({
    planId: priced.id, at: asOf, type: 'restored', field: null, from: null, to: null,
    runAt: `${asOf}T00:00:00.000Z`
  });
  events.push({
    planId: fresh.id, at: asOf, type: 'created', field: null, from: null, to: null,
    fields: tracked(fresh), runAt: `${asOf}T00:00:00.000Z`
  });

  // 派生身份（写入路径会打，门禁会重算）—— 我们不手写第三个值，用生产推导算
  out.events = chronological(kept.concat(events))
    .map(event => (event.eventId === undefined
      ? Object.assign({}, event, { eventId: planHistory.eventIdOf(event) })
      : event));
  const problems = planHistory.verifyStore(out, plans);
  if (problems.length) throw new Error(`合成 plan-history 自身没过 verifyStore：\n  - ${problems.slice(0, 6).join('\n  - ')}`);
  return { store: out, expect: { lifecycleId: priced.id, createdTodayId: fresh.id, keptEvents: kept.length } };
}

/** 造一份非空的 `api-plan-history.json`（created / model_added / price_increased / ended / restored） */
function buildApiFixture({ apiHistory, apiHistoryCore, store, apiPlans, asOf }) {
  const out = JSON.parse(JSON.stringify(store));
  const kept = Array.isArray(out.events) ? out.events.slice() : [];
  out.absence = out.absence || {};
  const tracked = plan => apiHistoryCore.trackedValuesOf(plan, apiHistory.API_PLAN_TRACKED_FIELDS, apiHistory.API_PROFILE);
  const anchored = new Set(kept.map(event => event.planId));

  const candidates = apiPlans.filter(plan => plan && plan.id && !anchored.has(plan.id)).sort(byId);
  const priced = candidates.filter(plan => Array.isArray(plan.models) && plan.models.length >= 2)[0];
  if (!priced) throw new Error('api-plans.json 里没有「还没有历史事件」且 ≥2 个模型计价条目的记录，夹具造不出来');
  const fresh = candidates.filter(plan => plan !== priced)[0];
  if (!fresh) throw new Error('api-plans.json 里没有第二条「还没有历史事件」的记录，夹具需要两条');

  const events = [];
  const keyOf = model => apiHistory.modelEntryKeyOf(model);
  const targetModel = priced.models[0];      // 涨价那一条
  const laterAdded = priced.models[priced.models.length - 1];   // created 时还不存在、后来新增的那一条
  if (keyOf(targetModel) === keyOf(laterAdded)) {
    throw new Error('夹具选中的记录里「涨价条目」与「新增条目」是同一个，换一条记录再试');
  }
  // 「旧值」= 同一个模型条目但单价更高（差一个数字就是一次真变化，不是口径微调）
  const olderModel = JSON.parse(JSON.stringify(targetModel));
  olderModel.rates = Object.assign({}, olderModel.rates, {
    input: (targetModel.rates.input || 1) + 5,
    output: (targetModel.rates.output || 1) + 10
  });
  const snapshot = tracked(priced);
  // created 时的模型清单：目标条目是旧价、且「稍后新增」的那一条还不存在
  const modelsAtCreated = priced.models
    .map(model => (keyOf(model) === keyOf(targetModel) ? olderModel : model))
    .filter(model => keyOf(model) !== keyOf(laterAdded));

  events.push({
    planId: priced.id, at: dayBefore(asOf, 6), type: 'created', field: null, from: null, to: null,
    fields: Object.assign({}, snapshot, { models: modelsAtCreated }),
    runAt: `${dayBefore(asOf, 6)}T00:00:00.000Z`
  });
  events.push({
    planId: priced.id, at: dayBefore(asOf, 3), type: 'model_added', field: 'models',
    from: null, to: laterAdded, origin: 'observed', runAt: `${dayBefore(asOf, 3)}T00:00:00.000Z`
  });
  events.push({
    planId: priced.id, at: dayBefore(asOf, 2), type: 'price_increased', field: 'models',
    from: olderModel, to: targetModel, origin: 'observed', runAt: `${dayBefore(asOf, 2)}T00:00:00.000Z`
  });
  events.push({
    planId: priced.id, at: dayBefore(asOf, 1), type: 'ended', field: null, from: null, to: null,
    reason: 'withdrawn', label: { title: priced.planName, vendor: priced.provider || null },
    firstMissedAt: dayBefore(asOf, 1), runAt: `${dayBefore(asOf, 1)}T00:00:00.000Z`
  });
  events.push({
    planId: priced.id, at: asOf, type: 'restored', field: null, from: null, to: null,
    runAt: `${asOf}T00:00:00.000Z`
  });
  events.push({
    planId: fresh.id, at: asOf, type: 'created', field: null, from: null, to: null,
    fields: tracked(fresh), runAt: `${asOf}T00:00:00.000Z`
  });

  out.events = chronological(kept.concat(events))
    .map(event => (event.eventId === undefined
      ? Object.assign({}, event, { eventId: apiHistory.apiPlanEventIdOf(event) })
      : event));
  const problems = apiHistory.verifyStore(out, apiPlans);
  if (problems.length) throw new Error(`合成 api-plan-history 自身没过 verifyStore：\n  - ${problems.slice(0, 6).join('\n  - ')}`);
  return {
    store: out,
    expect: {
      lifecycleId: priced.id,
      createdTodayId: fresh.id,
      addedModelKey: keyOf(laterAdded),
      priceChangedModelKey: keyOf(targetModel),
      keptEvents: kept.length
    }
  };
}

/* ------------------------------------------------------------------ */
/* 产物断言（自写解析，不复用被测判据）                                   */
/* ------------------------------------------------------------------ */

/** 站内路由 → 磁盘文件（静态托管语义：目录 → index.html） */
function routeFile(dist, route) {
  if (!route) return path.join(dist, 'index.html');
  const rel = route.endsWith('/') ? `${route}index.html` : route;
  return path.join(dist, decodeURIComponent(rel));
}

/** `href`/`src` 是相对路径时，按「页面深度 − 向上层数」解析成站根相对路由 */
function resolveRelative(route, href) {
  const base = route.split('/').filter(Boolean).length;
  const up = (href.match(/^(?:\.\.\/)+/) || [''])[0];
  const upCount = up ? up.length / 3 : 0;
  const rest = href.slice(up.length).replace(/^\.\//, '');
  const anchor = route.split('/').filter(Boolean).slice(0, Math.max(0, base - upCount));
  return [...anchor, ...rest.split('/').filter(Boolean)].join('/') + (rest.endsWith('/') ? '/' : '');
}

/** 页面里每条相对引用（含 CSS/JS/svg/feed）都必须在产物里存在 */
function relativeReferenceProblems(dist, route) {
  const file = routeFile(dist, route);
  const html = fs.readFileSync(file, 'utf8');
  const source = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const problems = [];
  const refs = [];
  for (const match of source.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = match[1].replace(/&amp;/g, '&').trim();
    if (!href || href.startsWith('#') || /^(https?:|mailto:|data:)/i.test(href)) continue;
    const clean = href.split('#')[0].split('?')[0];
    if (!clean) continue;
    refs.push(clean);
    const target = resolveRelative(route, clean);
    if (!fs.existsSync(routeFile(dist, target))) problems.push(`${clean} → ${target}`);
  }
  // CSS 里的 url(...)（favicon / 字体）：归档详情页踩过的正是这一类
  for (const match of source.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
    const href = match[2].trim();
    if (!href || href.startsWith('#') || /^(https?:|data:)/i.test(href)) continue;
    refs.push(href);
    const target = resolveRelative(route, href.split('#')[0].split('?')[0]);
    if (!fs.existsSync(routeFile(dist, target))) problems.push(`url(${href}) → ${target}`);
  }
  return { refs: refs.length, problems };
}

/** 从页面里取第一个 ItemList JSON-LD（自己的解析器，不看构建期记了什么） */
function itemListOfPage(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const block of blocks) {
    let data = null;
    try { data = JSON.parse(block[1]); } catch (error) { continue; }
    if (data && data['@type'] === 'ItemList') return data;
  }
  return null;
}

/** RSS / JSON Feed 的条目（自己的解析器：不看构建期记了什么，也不复用 feeds.js） */
function parseFeedPair(dist, routeBase) {
  const xmlPath = path.join(dist, `${routeBase}.xml`);
  const jsonPath = path.join(dist, `${routeBase}.json`);
  const result = { xml: null, json: null, xmlIds: [], jsonIds: [], links: [] };
  if (fs.existsSync(xmlPath)) {
    const xml = fs.readFileSync(xmlPath, 'utf8');
    result.xml = xml;
    result.xmlIds = [...xml.matchAll(/<item>[\s\S]*?<guid[^>]*>([^<]*)<\/guid>/g)].map(m => m[1]);
    result.links = [...xml.matchAll(/<item>[\s\S]*?<link>([^<]*)<\/link>/g)].map(m => m[1]);
  }
  if (fs.existsSync(jsonPath)) {
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    result.json = json;
    result.jsonIds = (json.items || []).map(item => item.id);
    if (!result.links.length) result.links = (json.items || []).map(item => item.url);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function main() {
  const target = path.resolve(argValue('root', path.join(ROOT_SRC, '..', 'qc-e2e')));
  const state = argValue('state', 'synthetic');
  const prepareOnly = hasFlag('prepare-only');
  const noSync = hasFlag('no-sync');
  const noBrowser = hasFlag('no-browser');
  if (!['synthetic', 'pristine'].includes(state)) {
    console.error(`❌ --state 只能是 synthetic（合成非空历史）或 pristine（冻结提交的生产态历史），实得 ${state}`);
    process.exit(2);
  }

  console.log('=== §15 合成非空历史端到端夹具 ===');
  console.log(`  源工作区: ${ROOT_SRC}`);
  console.log(`  夹具工作区: ${target}`);
  console.log(`  历史状态: ${state === 'synthetic' ? '合成非空（deal 事件 / plan 价格 / API 价格）' : 'pristine（冻结提交的生产态：deal 0 事件，plan/api 只有 created）'}`);

  /* ---- ⓪ 安全闸：绝不写进源工作区 ---------------------------------- */
  if (target === path.resolve(ROOT_SRC)) {
    console.error('❌ --root 不能是脚本自己所在的工作区（合成历史只允许落在临时工作区）');
    process.exit(2);
  }
  for (const marker of ['scripts/lib/history.js', 'scripts/data/deal-history.json', 'package.json']) {
    if (!fs.existsSync(path.join(target, marker))) {
      console.error(`❌ ${target} 不像一份工作区：缺少 ${marker}`);
      process.exit(2);
    }
  }
  const srcHistoryBefore = new Map(HISTORY_FILES.map(file => [file, sha256(path.join(ROOT_SRC, 'scripts', 'data', file))]));

  /* ---- ① 同步代码层（可选） ---------------------------------------- */
  if (!noSync) {
    section('① 同步本任务文件到夹具工作区（冻结提交 + 本任务 inScope）');
    const copied = [];
    for (const rel of SYNC_FILES) {
      const from = path.join(ROOT_SRC, rel);
      const to = path.join(target, rel);
      if (!fs.existsSync(from)) continue;
      const before = fs.existsSync(to) ? sha256(to) : '(不存在)';
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      copied.push(`${rel}${before === sha256(to) ? '（未变）' : ''}`);
    }
    console.log(`  同步 ${copied.length} 个文件: ${copied.join(' · ')}`);
    // 其余已跟踪文件一律还原成冻结提交那一份（**用 `git show HEAD:<path>` 写回，不用 git checkout**）：
    // 上一次运行可能同步过别人的代码、或夹具工作区本身被人改过 —— 那样红/绿就归因不清了。
    const restored = [];
    const status = spawnSync('git', ['-C', target, 'status', '--porcelain'], { encoding: 'utf8' });
    for (const line of String(status.stdout || '').split('\n')) {
      if (!line.trim()) continue;
      const state = line.slice(0, 2);
      const rel = line.slice(3).trim();
      if (state.includes('?') || state.includes('R') || SYNC_FILES.includes(rel)) continue;
      const blob = spawnSync('git', ['-C', target, 'show', `HEAD:${rel}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (blob.status !== 0) continue;
      fs.writeFileSync(path.join(target, rel), blob.stdout, 'utf8');
      restored.push(rel);
    }
    console.log(`  其余已跟踪文件还原成 HEAD: ${restored.length} 个` +
      `${restored.length ? `（${restored.slice(0, 6).join(' · ')}${restored.length > 6 ? ' …' : ''}）` : ''}`);
  } else {
    section('① 不同步代码（--no-sync）：用夹具工作区里**现有**的代码 —— 这是「修复前」的复现口径');
  }

  /* ---- ② 造合成非空历史 -------------------------------------------- */
  section('② 造合成非空历史（三份日志；不改任何当前数据）');
  const libDir = path.join(target, 'scripts', 'lib');
  const history = require(path.join(libDir, 'history.js'));
  const historyCore = require(path.join(libDir, 'history-core.js'));
  const planHistory = require(path.join(libDir, 'plan-history.js'));
  const apiHistory = require(path.join(libDir, 'api-plan-history.js'));

  const dealsDoc = readJson(path.join(target, 'deals.json'));
  const plansDoc = readJson(path.join(target, 'plans.json'));
  const apiPlansDoc = readJson(path.join(target, 'api-plans.json'));
  // 三份数据各有自己的基准日（`deals.json` 是真实时刻，plans / api-plans 是日期规范化），
  // 而变化日志的「未来日期」判据用的是**各自数据文件的 updatedAt**（不是墙上时钟）：
  // 事件日期越过它就会被门禁判红。所以三份夹具各按自己的基准日排日期。
  const asOf = String(dealsDoc.updatedAt || '').slice(0, 10);
  const asOfPlans = String(plansDoc.updatedAt || '').slice(0, 10);
  const asOfApi = String(apiPlansDoc.updatedAt || '').slice(0, 10);
  for (const [label, value] of [['deals.json', asOf], ['plans.json', asOfPlans], ['api-plans.json', asOfApi]]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} 的 updatedAt 取不到日期：${value}`);
  }
  // 「夹具不许改数据绕开失败」：当前数据的三份文件在这条链路上必须逐字节不变
  const dataBefore = new Map(['deals.json', 'plans.json', 'api-plans.json']
    .map(file => [file, sha256(path.join(target, file))]));

  // 夹具的基座取**冻结提交里**那一份（见 `gitShow`：可重跑、与在飞改动无关）
  const pristineHistory = file => JSON.parse(gitShow(target, `scripts/data/${file}`));

  let dealFixture = null;
  let planFixture = null;
  let apiFixture = null;
  if (state === 'pristine') {
    // 生产态：把三份日志**还原成冻结提交里的那一份**，然后跑同一套命令与「空态不变量」。
    // 两种状态同一份代码都要绿。
    //
    // 判据是**同源对账**（还原后的文件 == 冻结提交里那一份，逐字节），不是「deal 0 / plan 14 / api 6」
    // 这组数字：那组数字是某一天的日志规模，采集一跑就会变（本轮 deal 就从 0 条长到 1 条），
    // 写死它等于让「生产态」这一半在数据长大时假红。条数仍然打印出来当**读数**。
    for (const file of HISTORY_FILES) {
      fs.writeFileSync(path.join(target, 'scripts', 'data', file), gitShow(target, `scripts/data/${file}`), 'utf8');
    }
    const counts = {
      deal: pristineHistory('deal-history.json').events.length,
      plan: pristineHistory('plan-history.json').events.length,
      api: pristineHistory('api-plan-history.json').events.length
    };
    const restoreDrift = HISTORY_FILES.filter(file => fs.readFileSync(path.join(target, 'scripts', 'data', file), 'utf8')
      !== gitShow(target, `scripts/data/${file}`));
    check('生产态：夹具里的三份历史与冻结提交那一份**逐字节相同**（还原是同源对账，不是「条数 == 某天的快照」）',
      restoreDrift.length === 0,
      `实际有差异的文件 deals/plans/api = [${restoreDrift.join(', ')}] / 期望（冻结提交 HEAD:scripts/data/…）逐字节相同；`
      + `读数：deal ${counts.deal} 条 / plan ${counts.plan} 条 / api ${counts.api} 条`);
    console.log(`  deal-history: ${counts.deal} 条事件 · plan-history: ${counts.plan} 条 · api-plan-history: ${counts.api} 条`);
  } else {
    dealFixture = buildDealFixture({
      history, store: pristineHistory('deal-history.json'),
      deals: dealsDoc.deals, asOf
    });
    planFixture = buildPlanFixture({
      planHistory, planHistoryCore: historyCore, store: pristineHistory('plan-history.json'),
      plans: plansDoc.plans, asOf: asOfPlans
    });
    apiFixture = buildApiFixture({
      apiHistory, apiHistoryCore: historyCore,
      store: pristineHistory('api-plan-history.json'),
      apiPlans: apiPlansDoc.plans, asOf: asOfApi
    });

    if (dealFixture.skipped) {
      // **显式跳过**（不是静默、不是恒真、也不是崩栈）：样本不足时把夹具工作区里的 deal 历史
      // 还原成冻结提交那一份（有定义的输入），打印原因，并把依赖它的那批断言记成 skip。
      fs.writeFileSync(path.join(target, 'scripts', 'data', 'deal-history.json'),
        gitShow(target, 'scripts/data/deal-history.json'), 'utf8');
      console.log(`  ⏭ ${dealFixture.shortage.reason}`);
      console.log(`  ⏭ 跳过对象：${dealFixture.shortage.object}（实际 ${dealFixture.shortage.actual} / 需要 ${dealFixture.shortage.required}）`);
    } else {
      writeJson(path.join(target, 'scripts', 'data', 'deal-history.json'), dealFixture.store);
    }
    writeJson(path.join(target, 'scripts', 'data', 'plan-history.json'), planFixture.store);
    writeJson(path.join(target, 'scripts', 'data', 'api-plan-history.json'), apiFixture.store);
    for (const [file, before] of dataBefore) {
      const after = sha256(path.join(target, file));
      check(`夹具没有改写当前数据 ${file}（合成历史只走「事件」这一条通道）`, before === after);
    }
    console.log(`  基准日 ${asOf}`);
    if (dealFixture.skipped) {
      console.log(`  deal-history: 未合成（${dealFixture.shortage.reason.slice(0, 60)}…）`);
    } else {
      console.log(`  deal-history: ${dealFixture.store.events.length} 条事件（其中既有事件 ${dealFixture.expect.keptEvents} 条 · ` +
        `生命周期记录 ${dealFixture.expect.lifecycleId} · 今日新增 ${dealFixture.expect.createdTodayId} · 墓碑 ${dealFixture.expect.goneId}）`);
    }
    console.log(`  plan-history: ${planFixture.store.events.length} 条事件（${planFixture.expect.lifecycleId}）`);
    console.log(`  api-plan-history: ${apiFixture.store.events.length} 条事件（${apiFixture.expect.lifecycleId}` +
      ` · 新增模型 ${apiFixture.expect.addedModelKey}）`);
  }

  if (prepareOnly) {
    console.log('\n✅ 夹具已就位（--prepare-only）：可以手工跑 build-local / seo-verify / verify-site');
    return 0;
  }

  /* ---- ③ 全链路命令 ------------------------------------------------ */
  section('③ 产品链路（每条命令的退出码逐个记录）');
  const codes = [];
  const runStep = (label, command, args) => {
    const code = run(target, command, args);
    codes.push({ label, command: `${command} ${args.join(' ')}`, code });
    return code;
  };

  runStep('validate', process.execPath, ['scripts/validate.js']);
  runStep('validate --strict', process.execPath, ['scripts/validate.js', '--strict']);
  runStep('check:history', process.execPath, ['scripts/tools/history-verify.js']);
  runStep('check:plan-history', process.execPath, ['scripts/tools/check-plan-history.js']);
  runStep('check:api-plan-history', process.execPath, ['scripts/tools/check-api-plan-history.js']);
  const buildCode = runStep('build-local', process.execPath, ['scripts/tools/build-local.js']);
  const seoCode = buildCode === 0
    ? runStep('seo-verify', process.execPath, ['scripts/tools/seo-verify.js'])
    : (codes.push({ label: 'seo-verify', command: '（跳过：构建没通过）', code: -1 }), -1);
  const browserCode = (!noBrowser && buildCode === 0)
    ? runStep('verify-site（真浏览器）', process.execPath, ['scripts/tools/verify-site.js'])
    : -1;
  if (noBrowser) codes.push({ label: 'verify-site', command: '--no-browser', code: -1 });

  /* ---- ④ 产物断言（自写解析） -------------------------------------- */
  const dist = path.join(target, 'dist');
  const base = (() => {
    try {
      const xml = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
      return (xml.match(/<loc>([^<]*)<\/loc>/) || [])[1] || '';
    } catch (error) { return ''; }
  })();

  if (buildCode === 0) {
    const isEmptyState = state === 'pristine';
    // 合成态但 deal 夹具被**显式跳过**（样本不足）时，优惠这一侧的产物就是「没有事件」的形态：
    // 依赖那几条合成记录的断言不参与判定（记成 skip，不是 pass），而「优惠变化为空」这件事
    // 仍然要如实断言成空态（见 ④″）。
    const dealSyntheticSkipped = !isEmptyState && Boolean(dealFixture && dealFixture.skipped);
    const dealSkipReason = dealSyntheticSkipped ? dealFixture.shortage.reason : '';
    section(`④ Changes：ItemList ↔ 页面行 ↔ 链接 三份集合对账（${isEmptyState ? '生产态 · 空变化'
      : (dealSyntheticSkipped ? '合成态 · 样本不足（deal 侧显式跳过）' : '合成态 · 非空变化')}）`);
    const changesRoute = 'changes/';
    const changesHtml = fs.readFileSync(routeFile(dist, changesRoute), 'utf8');
    const list = itemListOfPage(changesHtml);
    const dataItems = [...changesHtml.matchAll(/data-item="([^"]*)"/g)].map(m => m[1]);
    const dealLinks = new Set([...changesHtml.matchAll(/href="\.\.\/deal\/([^/"]+)\/"/g)]
      .map(m => decodeURIComponent(m[1])));
    const elementIds = list
      ? (list.itemListElement || []).map(element => {
        const rel = String(element.url || '').replace(base, '');
        const match = rel.match(/^deal\/([^/]+)\/$/);
        return match ? decodeURIComponent(match[1]) : `（非法 url：${element.url}）`;
      })
      : [];
    check('/changes/ 有 ItemList 结构化数据', Boolean(list));
    if (list) {
      check('ItemList 声明数 == 元素数', Number(list.numberOfItems) === elementIds.length,
        `声明 ${list.numberOfItems} / 元素 ${elementIds.length}`);
      check('页面 data-item 行数 == ItemList 项数', dataItems.length === elementIds.length,
        `${dataItems.length} / ${elementIds.length}`);
      check('data-item 行集合 == ItemList 成员集合',
        dataItems.length === elementIds.length && dataItems.every(id => elementIds.includes(id)),
        dataItems.filter(id => !elementIds.includes(id)).slice(0, 3).join(','));
      check('ItemList 成员按 id 去重（一个记录只出现一次）',
        new Set(elementIds).size === elementIds.length,
        `重复 ${elementIds.length - new Set(elementIds).size} 个`);
      check('ItemList 成员都是本站详情页 URL（没有死链）',
        elementIds.every(id => dealLinks.has(id)), elementIds.filter(id => !dealLinks.has(id)).slice(0, 3).join(','));
    }
    // `index` / `text` 留着：下面要用「标题在 HTML 里的位置」切出**该分栏自己的正文**，
    // 免得拿整页去判「有没有写空态话」（整页判会把别处的空态话算到这一栏头上）。
    // `/changes/` 的分栏读数与「措辞 ⇔ 计数」关系都走同一支纯函数（详见 `changesSectionsOf()`）：
    // 判据的实现只有一处，反证夹具可以直接拿构造出来的 HTML 驱动它，而不用去改产品代码。
    const changesSections = changesSectionsOf(changesHtml);
    const headings = changesSections.headings;
    const sectionCount = changesSections.countOf;
    if (isEmptyState) {
      // 生产态的判据同样必须是**关系式**的。t44 之前这三条写死了「优惠变化一定是空的」
      //（当时的 `deal-history.json` 是 0 条事件），数据一长出第 1 条 `created` 就假红：
      // 页面、产物全都对，报出来的却像内容缺陷。现在改成三条不变量，在「真的空」与
      // 「只有零星事件」两种情形下都成立，而且都点名了数据对象：
      //   ① 三份集合要么同时为空、要么同时非空（不允许「有行没列表」这类单侧形态）；
      //   ② 五个分栏都在场（不是整块消失）；
      //   ③ **措辞 ⇔ 计数**：某个分栏为 0 ⇔ 页面写出它自己那句「没有观测到…」。
      check('生产态/稀疏态：ItemList 成员集合、页面 data-item 行集合、deal 详情链接三者要么同时为空、要么同时非空（没有单侧形态）',
        (elementIds.length === 0) === (dataItems.length === 0) && (elementIds.length > 0) === (dealLinks.size > 0),
        `ItemList ${elementIds.length} / 行 ${dataItems.length} / 链接 ${dealLinks.size}`);
      const sectionTitles = ['今日新增', '最近 7 天变化', '即将结束', '已结束', '重新出现'];
      check('生产态/稀疏态：五个分栏都在场（不是整块消失）',
        sectionTitles.every(title => sectionCount(title) >= 0),
        sectionTitles.map(title => `${title}=${sectionCount(title)}`).join(' · '));
      // 措辞 ⇔ 计数：判据是页面自己的两处读数之间的关系（分栏计数 与 该分栏正文里的空态话），
      // 不写死「一定是 0 条」，也不依赖「冻结日志里有没有事件」这个快照。
      // 关系的实现抽在 `changesSectionsOf()` 里（纯函数、可被反证夹具直接驱动）。
      const wordingDrift = ['今日新增', '最近 7 天变化', '已结束', '重新出现']
        .map(title => changesSections.wordingDrift(title)).filter(Boolean);
      check('生产态/稀疏态：每个分栏的「计数 == 0 ⇔ 正文写出该分栏的空态话」互相自洽（措辞与计数同源）',
        wordingDrift.length === 0,
        `分栏读数 ${headings.map(row => `${row.title}=${row.count}`).join(' · ')}；差异 [${wordingDrift.join(' | ') || '无'}]`);
    } else if (dealSyntheticSkipped) {
      // 样本不足 ⇒ **显式跳过**这几条（它们依赖 dealFixture.expect 里那几条合成记录）：
      // 打印原因 + 记进 skips + 在汇总里报条数。它们既不算通过、也不算失败。
      skip('ItemList 非空（合成历史真的走到了非空渲染分支）', dealSkipReason);
      skip('已离开数据集的记录：页面上有行但没有链接，也不进 ItemList', dealSkipReason);
      skip('同一个记录的多个分栏出现只占 ItemList 一个位置', dealSkipReason);
      skip('五个优惠分栏都被走到（今日新增 / 最近 7 天变化 / 已结束 / 重新出现 计数 > 0）', dealSkipReason);
      check('样本不足时，deal 侧的四条断言以**显式跳过**记账（既不静默略过、也不伪装成通过）',
        skips.length >= 4 && skips.every(row => row.reason.includes('本轮样本不足，跳过并说明原因')),
        `skips=${JSON.stringify(skips.map(row => row.name))}`);
    } else {
      check('ItemList 非空（合成历史真的走到了非空渲染分支）', elementIds.length > 0, `${elementIds.length} 项`);
      const gone = dealFixture.expect.goneId;
      check('已离开数据集的记录：页面上有行但没有链接，也不进 ItemList',
        changesHtml.includes(gone) && !dealLinks.has(gone) && !elementIds.includes(gone) && !dataItems.includes(gone));
      check('同一个记录的多个分栏出现只占 ItemList 一个位置',
        elementIds.filter(id => id === dealFixture.expect.lifecycleId).length === 1);
      check('五个优惠分栏都被走到（今日新增 / 最近 7 天变化 / 已结束 / 重新出现 计数 > 0）',
        ['今日新增', '最近 7 天变化', '已结束', '重新出现'].every(title => sectionCount(title) > 0),
        headings.map(row => `${row.title}=${row.count}`).join(' · '));
    }

    // ---- 套餐 / API 两条变化流（同一页的另外两个事实面）----------------------
    // 两种状态下都有：生产的 plan 14 / api 6 条 created 事件本身就落在这一页上。
    const planBlock = (changesHtml.match(/<section class="chgsec pchanges" id="plans">[\s\S]*?<\/section>/) || [''])[0];
    const apiBlock = (changesHtml.match(/<section class="chgsec apichanges" id="api-plans">[\s\S]*?<\/section>/) || [''])[0];
    const blockCounts = (block, titles) => titles.map(title => {
      const hit = block.match(new RegExp(`<h3>${title}（(\\d+)）</h3>`));
      return hit ? Number(hit[1]) : -1;
    });
    for (const [label, block, titles] of [
      ['套餐变化', planBlock, ['今日新增', '最近 7 天变化', '不再收录', '重新出现']],
      ['API 价格变化', apiBlock, ['今日新增', '最近 7 天变化', '不再收录', '重新出现']]
    ]) {
      const counts = blockCounts(block, titles);
      const detail = counts.map((count, index) => `${titles[index]}=${count}`).join(' · ');
      check(`${label}块四个分栏都在（不是一整块消失）与首栏非空`, counts.every(count => count >= 0) && counts[0] > 0, detail);
      if (!isEmptyState) check(`${label}块四个分栏都被走到`, counts.every(count => count > 0), detail);
    }
    if (!isEmptyState) {
      // 币种 / 单位上下文：`planChangeTextOf` 的 `plansById` 丢了就会写成「正常价格 79 → 59」
      // （同一件事在 `/plans/coding/` 上写的是「¥79 → ¥59」）—— 而产物自检会因此判红。
      const planSentences = [...planBlock.matchAll(/<span class="pchgwhat">([^<]*)<\/span>/g)].map(m => m[1]);
      const priceSentences = planSentences.filter(text => text.includes('正常价格'));
      check('套餐变化的「正常价格」句带币种（渲染上下文与 /plans/coding/ 同一份）',
        priceSentences.length > 0 && priceSentences.every(text => /[¥$€]/.test(text)),
        priceSentences.slice(0, 2).join(' / ') || '(没有价格句)');
      const apiSentences = [...apiBlock.matchAll(/<span class="pchgwhat">([^<]*)<\/span>/g)].map(m => m[1]);
      check('API 价格变化句里能看到新增模型（model_added 走到了渲染）',
        apiSentences.some(text => text.includes(apiFixture.expect.addedModelKey.split('|')[0])),
        apiSentences.slice(0, 3).join(' / '));
      const noise = apiSentences.filter(text => text === '新增：—').length;
      if (noise) {
        // 发现（不计入失败，也不在本任务 inScope）：created 事件在 API 块里渲染成「新增：—」。
        // 判据在 api-plans-page.js 的 apiPlanChangeTextOf（lifecycle 事件没有 from/to）。
        console.log(`  ※ 观测：API 价格变化块有 ${noise} 条 created 事件渲染成「新增：—」（生产态同样存在，属 api-plans-page.js 的措辞判据）`);
      }
    }

    section(`④′ Archive（${isEmptyState ? '生产态：0 条是事实'
      : (dealSyntheticSkipped ? '合成态：plan/api 索引非空 + 详情页引用可解析（deal 侧样本不足）'
        : '合成态：索引非空 + 详情页引用可解析')}）`);
    const archiveIndex = 'archive/';
    const archiveHtml = fs.readFileSync(routeFile(dist, archiveIndex), 'utf8');
    const detailRoutes = [...new Set([...archiveHtml.matchAll(/href="[^"]*?archive\/([a-z]+)\/([^/"]+)\/"/g)]
      .map(match => `archive/${match[1]}/${match[2]}/`))];
    if (isEmptyState) {
      check('生产态：档案索引 0 个详情页（三份日志都没有 ended/restored）', detailRoutes.length === 0,
        detailRoutes.slice(0, 3).join(' '));
      check('生产态：索引页明说「0 条是事实，不是故障」', archiveHtml.includes('0 条是事实，不是故障'));
    } else {
      check('/archive/ 索引页列出至少 1 个详情页（三组里至少一组非空）', detailRoutes.length > 0, detailRoutes.slice(0, 3).join(' '));
      if (dealSyntheticSkipped) {
        // deal 侧没有 ended/restored（样本不足），所以「三组都出现过」这一条本轮不成立 —— 显式跳过，
        // 并要求剩下两组确实在场（否则「跳过」会变成掩盖 plan/api 侧真缺陷的借口）。
        skip('/archive/ 三组（优惠 / Coding 套餐 / API 计费）都出现过（deal 组依赖样本不足的优惠侧事件）', dealSkipReason);
        check('样本不足只跳过 deal 那一组：plan / api 两组仍然必须在场',
          ['plan', 'api'].every(kind => detailRoutes.some(route => route.startsWith(`archive/${kind}/`))),
          `实际档案详情页 ${JSON.stringify(detailRoutes.slice(0, 6))}`);
      } else {
        check('/archive/ 三组（优惠 / Coding 套餐 / API 计费）都出现过',
          ['deal', 'plan', 'api'].every(kind => detailRoutes.some(route => route.startsWith(`archive/${kind}/`))),
          detailRoutes.join(' '));
      }
      let missingRefs = 0;
      let totalRefs = 0;
      const refExamples = [];
      for (const route of detailRoutes) {
        const file = routeFile(dist, route);
        if (!fs.existsSync(file)) { missingRefs++; refExamples.push(`${route} 页面不存在`); continue; }
        const scanned = relativeReferenceProblems(dist, route);
        totalRefs += scanned.refs;
        missingRefs += scanned.problems.length;
        for (const problem of scanned.problems.slice(0, 2)) refExamples.push(`${route} ${problem}`);
      }
      check('每个档案详情页的每条相对引用都解析到存在的目标（修复前 24/27 缺失）',
        missingRefs === 0, `${missingRefs} 条缺失 / 共 ${totalRefs} 条 · ${refExamples.slice(0, 3).join(' / ')}`);
    }

    section(`④″ Feed：RSS + JSON Feed（${isEmptyState ? '优惠变化为空是事实；套餐/API 变化非空'
      : (dealSyntheticSkipped ? '优惠变化为空是样本不足的事实；套餐/API 变化非空' : '三条变化流都非空')}）`);
    for (const [label, routeBase] of [
      ['优惠变化', 'feed/changes'],
      ['套餐变化', 'feed/plans/coding/changes'],
      ['API 价格变化', 'feed/plans/api/changes']
    ]) {
      const pair = parseFeedPair(dist, routeBase);
      if (label === '优惠变化') {
        // 优惠变化流的判据改成**两个产物之间的同源关系**：流里有没有条目 ⇔ /changes/ 页面上四个
        // 事件分栏（今日新增 / 最近 7 天变化 / 已结束 / 重新出现 —— 正是这条流取条目的那四栏）合计是否为 0。
        // t44 之前这里写死「生产态 ⇒ 0 条」——那是「冻结日志里恰好 0 条事件」的快照，
        // 数据长出第 1 条事件之后就成了假红（流里 1 条、页面上也有 1 条，两边都对）。
        // 判据不写死数字，也不重算窗口：窗口口径、分栏上限都由页面/流自己体现 ——
        // 只要求两处**同时为空或同时非空**，并且流里的条目数不得超过页面合计（不许凭空多）。
        const eventSectionTotal = ['今日新增', '最近 7 天变化', '已结束', '重新出现']
          .reduce((sum, title) => sum + Math.max(0, sectionCount(title)), 0);
        check(`${label}：RSS 与 JSON 都在，且「流里有没有条目」与 /changes/ 四个事件分栏的合计是否为空互相一致（两个产物同源）`,
          Boolean(pair.xml) && Boolean(pair.json)
          && (pair.xmlIds.length === 0) === (eventSectionTotal === 0)
          && pair.xmlIds.length <= eventSectionTotal
          && pair.xmlIds.length === pair.jsonIds.length,
          `RSS ${pair.xmlIds.length} 条 / JSON ${pair.jsonIds.length} 条`
          + ` / /changes/ 四个事件分栏合计 ${eventSectionTotal}（${['今日新增', '最近 7 天变化', '已结束', '重新出现'].map(title => `${title}=${sectionCount(title)}`).join(' · ')}）`);
      } else {
        check(`${label}：RSS 与 JSON 都在且有条目`,
          Boolean(pair.xml) && Boolean(pair.json) && pair.xmlIds.length > 0,
          `RSS ${pair.xmlIds.length} 条 / JSON ${pair.jsonIds.length} 条`);
      }
      check(`${label}：RSS 与 JSON 条目数一致（两侧同源）`,
        pair.xmlIds.length === pair.jsonIds.length,
        `${pair.xmlIds.length} / ${pair.jsonIds.length}`);
      check(`${label}：JSON Feed 版本与必备字段`,
        Boolean(pair.json) && pair.json.version === 'https://jsonfeed.org/version/1.1'
        && Boolean(pair.json.title) && Boolean(pair.json.feed_url),
        pair.json ? pair.json.version : '(缺)');
      const dangling = [...new Set(pair.links)]
        .map(link => String(link).replace(base, '').split('#')[0])
        .filter(route => route && !fs.existsSync(routeFile(dist, route)));
      check(`${label}：每一条站内链接都指向存在的页面`, dangling.length === 0, dangling.slice(0, 3).join(' '));
    }
  } else {
    section('④ 产物断言：跳过（构建没有通过）');
  }

  /* ---- ⑤ 生产 history 未被改动 ------------------------------------- */
  section('⑤ 生产 history 未被改动（合成数据只落在夹具工作区）');
  for (const file of HISTORY_FILES) {
    const before = srcHistoryBefore.get(file);
    const after = sha256(path.join(ROOT_SRC, 'scripts', 'data', file));
    check(`${file} 的 sha256 与运行前一致`, before === after, `${before.slice(0, 12)}… → ${after.slice(0, 12)}…`);
  }

  /* ---- 汇总 -------------------------------------------------------- */
  section('=== 退出码汇总 ===');
  for (const row of codes) console.log(`  ${row.code === 0 ? '✓' : '✗'} ${row.label}: exit ${row.code}  (${row.command})`);
  console.log(`\n=== 端到端夹具（${state === 'pristine' ? '生产态 · 空变化' : '合成态 · 非空变化'}）：` +
    `${checks} 项判定点，${failures.length} 项失败，${skips.length} 项**显式跳过**（样本不足，上面逐条打印了原因）；` +
    `validate/build/seo/browser 退出码 ${codes.filter(row => row.code === 0).length}/${codes.length} 为 0 ===`);
  for (const failure of failures) console.log(`  ✗ ${failure.name}${failure.detail ? ` —— ${failure.detail}` : ''}`);
  // 「跑过并且通过」与「跳过」必须看起来不一样：跳过逐条打印，且刻意用与 ✓ 不同的记号。
  for (const row of skips) console.log(`  ⏭ 未判定（显式跳过）${row.name} —— ${row.reason}`);
  const badCodes = codes.filter(row => row.code !== 0);
  if (failures.length || badCodes.length) process.exit(1);
  return checks;
}

/**
 * 入口守卫：作为 CLI 跑时行为与以前**完全一样**（`node scripts/tools/history-nonempty-e2e.js`）；
 * 被 `require()` 时**不执行**夹具，只暴露纯函数与常量给反证夹具
 * （`research/_raw/t44/`：`dealSeedShortage` 的「样本不足 ⇒ 跳过」必须能被单独驱动，
 * 否则那条判据只能靠真去删生产数据来验 —— 那既不可重复，也不该做）。
 */
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`\n❌ 夹具执行失败：${error && error.stack ? error.stack : error}`);
    process.exit(1);
  }
}

module.exports = { dealSeedShortage, dealSeedCandidates, DEAL_FIXTURE_SEEDS, buildDealFixture, changesSectionsOf };
