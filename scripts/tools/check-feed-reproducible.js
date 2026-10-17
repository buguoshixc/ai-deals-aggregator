#!/usr/bin/env node
/**
 * v3.2 订阅产物的**可复现门禁**（L3：需要 `dist/`；零外部依赖、不读时钟）。
 *
 * ## 它回答什么
 *
 *   > 同一份仓库数据，构建两次之后产出的订阅文件还是同一串字节吗？
 *
 * `feed-selftest.js` 已经在**纯函数**层证明过「同输入必同输出」，但那证明不了
 * 「构建脚本没有把时钟、绝对路径、运行次数之类的东西写进产物」。这一支用**真实构建**来证：
 * 每次跑一个完整的 `build-local.js`（与发布链同一条路径），把订阅文件（唯一出处 =
 * `lib/feed.js` 的 `FEED_FILES` —— 本文件**不写第二份文件名 / MIME 字面量**）的 SHA-256
 * 逐文件记下来：第 2..N 次必须与第 1 次逐字节相同，第 1 次还必须与 `--dir` 指的那份
 * **参考产物**逐字节相同。
 *
 * ## 三条纪律（历史事故换来的，不许放宽）
 *
 *   ① **参考产物缺订阅文件 ⇒ 非 0**（fail-closed）。曾经的写法是「缺了就静默退化成只做
 *      自比对」—— 那会让 CI 里这一步**少掉一半判据而全绿**，正是本仓最忌讳的那种假绿。
 *      只有显式 `--allow-missing-dist`（本地诊断）才允许退化，且必须打印 `OPTIONAL DIAGNOSTIC`。
 *   ② **隔离构建必须带 `--out=`**：本工具自己以
 *      `execFileSync(process.execPath, [build-local.js, '--out=<TMP>'])` 起构建，
 *      `<TMP>` 默认 `dist.qc-feed-repro`（仓库硬规则：隔离产物一律 `dist.qc-*` 形状，
 *      `.gitignore` 也只覆盖这一族）。`--out` 与参考产物目录 / 仓库根重合、
 *      不落在仓库内、或不是 `dist.qc-*` 形状 ⇒ **拒绝运行**（绝不允许裸跑覆盖共享 `dist/`；
 *      仓库外的路径也拒绝 —— 见下面 `fatal` 处的理由）。
 *      `<TMP>` / `<TMP>.building` / `<TMP>.notes.ndjson` 一律在 `finally` 里删掉。
 *   ③ **空 feed 判红**：任何一次构建没有产出这两个文件（缺一个、或有一个是 0 字节）⇒ 非 0。
 *
 * ## 墙钟探针（两条，都在**真实产物**上做，不看内存对象）
 *
 *   ① **形态**：产物里出现的每一个时间字段都必须是 `${YYYY-MM-DD}T00:00:00+08:00`。
 *      出现别的时分秒、或缺少 `+08:00` 偏移的写法 ⇒ 红（有东西把「现在几点」写进了产物）。
 *   ② **取值**：产物的**最大日期**必须等于**现算**出来的「数据支持的最新一天」，并且
 *      **不得晚于** `deals.json` 的 `updatedAt` 所代表的**数据日期**。
 *
 *   ⚠️ 为什么 ② 的后半句是「不晚于」而不是「等于」（**本轮真实读数，不是放宽**）：
 *   `deals.json.updatedAt = 2026-10-14`，而 `deal-history.json` 的 20 条事件**全部指向
 *   工具类记录**（`type !== 'deal'`，产物里没有 `deal/<id>/` 那一页）⇒ 按订阅出口既有的
 *   「不发死链」规则它们逐条不进 feed，真正进 feed 的最新一条来自 `plan-history`
 *   （`2026-10-08`）。也就是说「最大日期 == 数据日期」在今天的真实数据上**本来就是假的**，
 *   把它写成等式等于造一颗永远红、且与「有没有看时钟」无关的假牙。
 *   等式那半边由「== 现算的最新一天」承担：它同样**不硬编码任何日期**，而且对
 *   「写死日期 / 产物过期 / 时钟泄进日期部分」三种失效都会红；`deals.json` 的数据日期
 *   用作**上界**（写进产物的日期比数据还新 = 时钟泄进去了）。
 *
 *   现算用的三个单源与构建侧完全同源（**不是第二份判据**）：`history-core.eventsOf` /
 *   `history-core.keyOf` / `changes.linkableDealIdsOf`。
 *
 *   ✅ **口径已裁定（可复核的一句话）**：本条采用「最大日期 == 由仓库数据现算的最新**可入 feed**
 *   的一天（不硬编码任何日期）且 ≤ `deals.json` 的**数据日期**」，**不采用**字面的
 *   「== 数据日期」—— 2026-10-16 由 captain 在 t14 修订裁定里采纳，复核只需三步：
 *   ① `node -e "console.log(require('./deals.json').updatedAt)"` ⇒ `2026-10-14`；
 *   ② `changes.linkableDealIdsOf(deals.json)` 下 `deal-history.json` 的 20 条事件**逐条不可链接**
 *   （它们指向 `type !== 'deal'` 的记录）⇒ 按「不发死链」规则全被丢弃；
 *   ③ 于是真正进 feed 的最新一条来自 `plan-history`，即 `2026-10-08`。
 *   也就是说字面等式在今天的真实数据上恒假 —— 那会是一颗与「不看时钟」无关的**假牙**。
 *
 * ## 用法
 *
 *   node scripts/tools/check-feed-reproducible.js                    # 与已构建的 dist/ 对账 + 自跑 2 次
 *   node scripts/tools/check-feed-reproducible.js --runs=10          # 交付报告用的 10 次
 *   node scripts/tools/check-feed-reproducible.js --dir=dist.qc-x    # 换一份参考产物
 *   node scripts/tools/check-feed-reproducible.js --out=dist.qc-feed-repro
 *   node scripts/tools/check-feed-reproducible.js --allow-missing-dist   # 本地诊断：只做自比对
 *
 * 退出码：0 = 全部通过；1 = 有任何一项判红（构建失败 / 缺产物 / 字节不一致 / 探针命中）。
 *
 * ## 来历（tombstone 改真话）
 *
 * 本文件是 v1.6 那份 `check-feeds-reproducible.js` 的**本轮恢复版**（`git show 0f07b7a^:`
 * 可看原实现）：订阅层随「去数据暴露」整体下架时它被删除；本轮经用户**显式授权部分反转**，
 * 恢复的正是订阅出口这一支（数据出口 `/docs/data/` 依旧下架）。恢复时按契约第 11B 条改了
 * 两处**判据面**：比对面从旧的 `lib/feeds.js` 改成 `lib/feed.js` 的 `FEED_FILES`（唯一表）；
 * 旧的 RSS `lastBuildDate` 探针换成上面那两条（本轮产物是 Atom + JSON Feed，没有 RSS）。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BUILD_TOOL = path.join(ROOT, 'scripts', 'tools', 'build-local.js');

const feed = require('../lib/feed');                       // FEED_FILES = 唯一表
const changes = require('../lib/changes');
const historyCore = require('../lib/history-core');
const history = require('../lib/history');
const planHistory = require('../lib/plan-history');
const apiPlanHistory = require('../lib/api-plan-history');

/** 时间形态（冻结）：北京时间零点。判据侧**独立写出**这个形态（不引用被测模块的常量） */
const FROZEN_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/;
/** 宽口径的「像时间戳」扫描：形状不对（别的时分秒 / 缺偏移量）也要能抓到 */
const INSTANT_RE = /\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?/g;

const rel = absolute => path.relative(ROOT, absolute).replace(/\\/g, '/') || '.';
const argValue = prefix => {
  const hit = process.argv.find(item => item.startsWith(prefix));
  return hit === undefined ? null : hit.slice(prefix.length);
};

const DIR_ARG = argValue('--dir=');
const OUT_ARG = argValue('--out=');
const RUNS_ARG = argValue('--runs=');
const ALLOW_MISSING_DIST = process.argv.includes('--allow-missing-dist');
/** 连续构建次数：至少 2 次（只跑 1 次就没有比对面） */
const RUNS = Math.max(2, Number.parseInt(RUNS_ARG === null || RUNS_ARG === '' ? '2' : RUNS_ARG, 10) || 2);
/** 参考产物（默认 `dist/`） */
const BUILT = path.resolve(ROOT, DIR_ARG === null || DIR_ARG === '' ? 'dist' : DIR_ARG);
/** 隔离输出目录（**绝不覆盖共享 dist/**；默认名来自契约第 11B 条） */
const TMP = path.resolve(ROOT, OUT_ARG === null || OUT_ARG === '' ? 'dist.qc-feed-repro' : OUT_ARG);
const TMP_BUILDING = `${TMP}.building`;
const TMP_NOTES = `${TMP}.notes.ndjson`;

let failed = 0;
const failures = [];
function fail(message) { failures.push(message); failed += 1; console.log(`  ✗ ${message}`); }
function ok(message) { console.log(`  ✓ ${message}`); }
function fatal(message) {
  console.error(`\n❌ 订阅产物可复现门禁：拒绝运行 —— ${message}`);
  console.error('   用法：node scripts/tools/check-feed-reproducible.js [--dir=dist] [--runs=2] '
    + '[--out=dist.qc-feed-repro] [--allow-missing-dist]');
  process.exit(1);
}

/* ─────────────────────────── 隔离目录的守卫（先于任何写操作） ─────────────────────────── */

if (TMP === BUILT) {
  fatal(`--out（${rel(TMP)}/）与参考产物目录（--dir=${rel(BUILT)}/）是同一个目录：`
    + '隔离构建会覆盖正在被比对的共享产物（历史上就是这么踩到「找错了产物仍然绿」的）。');
}
if (TMP === ROOT) fatal('--out 指到了仓库根目录：清理临时目录会把整棵工作树删掉。');
if (BUILT.startsWith(TMP + path.sep)) {
  fatal(`参考产物目录（${rel(BUILT)}/）位于隔离输出目录（${rel(TMP)}/）之内：`
    + '清理临时目录会把参考产物一起删掉。');
}
if (!TMP.startsWith(ROOT + path.sep) || !/(^|[\\/])dist\.qc-[^\\/]+$/.test(TMP)) {
  fatal(`隔离输出目录必须是**仓库内**的 dist.qc-* 形状（仓库硬规则：隔离构建一律带 --out=dist.qc-*，`
    + `.gitignore 也只覆盖这一族）；实得 ${TMP}。`
    + '刻意不接受仓库外的路径：本工具把 `--out=` 原样交给 build-local.js，而它是按仓库根解析的'
    + '（绝对路径会被拼成 `…/AI Page/C:\\…` 这种畸形路径，报出来的错离原因很远）。');
}

/* ─────────────────────────────────── 小工具 ─────────────────────────────────── */

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const shortHash = hash => `${String(hash).slice(0, 12)}…`;

/** 逐文件读数：**比对面 = FEED_FILES**（本文件里一个订阅文件名 / MIME 字面量都没有） */
function feedFilesOf(dir) {
  return feed.FEED_FILES.map(([file]) => {
    const absolute = path.join(dir, file);
    let buffer = null;
    try {
      if (fs.statSync(absolute).isFile()) buffer = fs.readFileSync(absolute);
    } catch { buffer = null; }
    return {
      rel: file,
      exists: buffer !== null,
      bytes: buffer ? buffer.length : 0,
      hash: buffer ? sha256(buffer) : null,
      text: buffer ? buffer.toString('utf8') : ''
    };
  });
}

/** 聚合指纹：文件相对路径 + 各自的 sha256（顺序 = FEED_FILES 的顺序） */
function fingerprintOf(files) {
  return sha256(Buffer.from(files.map(file => `${file.rel}\u0000${file.hash}`).join('\u0001'), 'utf8'));
}

/** 缺文件或 0 字节都算「产不出订阅文件」（空 feed 一律判红） */
const incompleteOf = files => files.filter(file => !file.exists || file.bytes === 0);
const namesOf = files => files.map(file => file.rel).join('、');

/** 两份产物读数之间的差异（逐文件 SHA-256；不一致时点名文件 + 字节数变化） */
function diffOf(left, right) {
  const problems = [];
  for (const file of left) {
    const peer = right.find(item => item.rel === file.rel);
    if (!peer || !peer.exists || peer.bytes === 0) { problems.push(`${file.rel}（对方缺这个文件或它是空的）`); continue; }
    if (peer.hash !== file.hash) problems.push(`${file.rel}（${file.bytes} → ${peer.bytes} 字节，sha256 不同）`);
  }
  return problems;
}

/* ─────────────────────── 墙钟探针 ①：时间字段的**形态**（纯产物） ─────────────────────── */

function instantsOf(files) {
  const instants = [];
  for (const file of files) {
    for (const match of file.text.matchAll(INSTANT_RE)) instants.push({ file: file.rel, instant: match[0] });
  }
  return instants;
}

/* ──────────────── 墙钟探针 ②：**取值** —— 与仓库数据现算对账（不硬编码日期） ──────────────── */

/**
 * 现算「数据日期」与「数据支持的最新一天」。
 *
 *   · 数据日期 = 仓库根 `deals.json` 的 `updatedAt` 的日期部分（今天就是采集链最后写下的那一天）；
 *   · 最新一天 = 三个变更日志里**真的会进 feed** 的事件里最大的 `at` —— 与构建侧用同一批单源：
 *     `history-core.eventsOf` / `history-core.keyOf` / `changes.linkableDealIdsOf`（不发死链那条
 *     规则也一致：算不出记录键的、以及 deal 里不可链接的，逐条不算）。
 *
 * 取不到就返回 problems（fail-closed：判不了就宁可拦住，不静默跳过）。
 */
function dataDatesOf() {
  const problems = [];
  const dealsFile = path.join(ROOT, 'deals.json');
  let payload = null;
  try {
    payload = JSON.parse(fs.readFileSync(dealsFile, 'utf8'));
  } catch (error) {
    problems.push(`读不到仓库根的 ${rel(dealsFile)}（现算数据日期必须有它）：${error && error.message}`);
  }
  const updatedAt = payload && typeof payload.updatedAt === 'string' ? payload.updatedAt : '';
  const dataDate = historyCore.DATE_RE.test(updatedAt.slice(0, 10)) ? updatedAt.slice(0, 10) : '';
  if (!dataDate) {
    problems.push(`${rel(dealsFile)} 的 updatedAt 不是以 YYYY-MM-DD 开头（实得 ${JSON.stringify(updatedAt)}）`
      + '—— 数据日期算不出来时判红，不静默跳过');
  }

  let linkable = null;
  if (payload && Array.isArray(payload.deals)) {
    try {
      linkable = changes.linkableDealIdsOf(payload.deals);
    } catch (error) {
      problems.push(`changes.linkableDealIdsOf(deals) 抛错：${error && error.message}`);
    }
  } else {
    problems.push(`${rel(dealsFile)} 里没有 deals 数组（deal 的可链接性判据取不到）`);
  }

  const sources = [
    ['deal', path.join(ROOT, 'scripts', 'data', 'deal-history.json'), history.PROFILE],
    ['plan', path.join(ROOT, 'scripts', 'data', 'plan-history.json'), planHistory.PROFILE],
    ['apiPlan', path.join(ROOT, 'scripts', 'data', 'api-plan-history.json'), apiPlanHistory.API_PROFILE]
  ];
  let newest = '';
  const counts = [];
  for (const [kind, file, profile] of sources) {
    if (!fs.existsSync(file)) { problems.push(`缺 ${rel(file)}（三个变更日志是 feed 的唯一数据源）`); continue; }
    let store = null;
    try {
      store = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      problems.push(`${rel(file)} 无法解析：${error && error.message}`);
      continue;
    }
    let counted = 0;
    for (const event of historyCore.eventsOf(store)) {
      const key = String(historyCore.keyOf(profile, event) || '');
      if (!historyCore.DEFAULT_ID_RE.test(key)) continue;              // 算不出记录键 ⇒ 不进 feed
      if (kind === 'deal' && !(linkable && linkable.has(key))) continue; // 不可链接 ⇒ 不进 feed
      const at = String((event && event.at) || '');
      if (!historyCore.DATE_RE.test(at)) continue;                      // at 非法 ⇒ 不进 feed
      counted += 1;
      if (at > newest) newest = at;
    }
    counts.push(`${kind} ${counted} 条`);
  }
  if (!newest) problems.push('现算不出「数据支持的最新一天」：三个日志里一条会进 feed 的事件都没有');
  return { dataDate, newest, counts, problems };
}

/* ─────────────────────────────────── 主流程 ─────────────────────────────────── */

console.log(`\n=== 订阅产物可复现门禁：连续构建 ${RUNS} 次，逐字节比对 ===`);
console.log(`  参考产物：${rel(BUILT)}/ · 隔离输出目录：${rel(TMP)}/（用完即删；绝不覆盖共享产物）`);
console.log(`  比对面：${feed.FEED_FILES.map(([file]) => file).join(' · ')}（唯一出处 = lib/feed.js 的 FEED_FILES）`);

/* 参考产物：两个文件必须存在且非空；缺 ⇒ 非 0（只有显式 --allow-missing-dist 才退化） */
const referenceFiles = feedFilesOf(BUILT);
const referenceMissing = incompleteOf(referenceFiles);
let reference = null;
if (!referenceMissing.length) {
  reference = { label: `${rel(BUILT)}/`, files: referenceFiles, hash: fingerprintOf(referenceFiles) };
  ok(`参考产物：${reference.label} 的订阅文件齐备且非空（${namesOf(referenceFiles)}；指纹 ${shortHash(reference.hash)}）`);
} else if (ALLOW_MISSING_DIST) {
  console.log(`  ⚠️ OPTIONAL DIAGNOSTIC（--allow-missing-dist）：${rel(BUILT)}/ 里缺 ${namesOf(referenceMissing)}`
    + '（或它们是空的），本轮**只做「连续构建逐字节一致」自比对**，不做「与参考产物一致」比对。');
  console.log('     这条退路只给本地诊断用；CI 里这一步排在 Assemble site 之后，参考产物必然存在。');
} else {
  fail(`缺少必需产物：参考产物 ${rel(BUILT)}/ 里缺 ${namesOf(referenceMissing)}（或它们是空的）`
    + ' —— 先跑 npm run build，或用 --dir=<构建输出> 指到那份产物；'
    + '只有显式 --allow-missing-dist 才允许退化成「只做自比对」');
}

/** 清掉本轮的全部临时产物（成功、失败、异常都走这里） */
function cleanupTemp() {
  for (const target of [TMP, TMP_BUILDING, TMP_NOTES]) {
    try { fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch { /* 尽力而为 */ }
  }
}

/** 构建失败时给一行能定位的读数（stdout / stderr 里最后一条像错误的行） */
function buildErrorDetail(error) {
  const text = `${String((error && error.stdout) || '')}\n${String((error && error.stderr) || '')}`;
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const hit = [...lines].reverse().find(line => /❌|✗|错误|失败|Error/.test(line));
  return (hit || String((error && error.message) || error)).slice(0, 240);
}

let first = null;
try {
  for (let run = 1; run <= RUNS; run += 1) {
    cleanupTemp();
    let buildError = null;
    try {
      execFileSync(process.execPath, [BUILD_TOOL, `--out=${rel(TMP)}`], {
        cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024
      });
    } catch (error) {
      buildError = error;
    }
    if (buildError) {
      fail(`第 ${run} 次隔离构建失败（build-local.js --out=${rel(TMP)}）：${buildErrorDetail(buildError)}`
        + ' —— 构建这一层就不成立时，产物级的「逐字节一致」无从谈起（fail-closed）');
      break;
    }

    const files = feedFilesOf(TMP);
    const missing = incompleteOf(files);
    if (missing.length) {
      fail(`第 ${run} 次构建没有产出全部订阅文件：${namesOf(missing)} 缺文件或是 0 字节`
        + '（空 feed 一律判红 —— 静默跳过会让这一步少掉一半判据而全绿）');
      break;
    }
    const hash = fingerprintOf(files);

    if (run === 1) {
      first = { files, hash };
      ok(`第 1 次构建：${namesOf(files)} 全部产出且非空（指纹 ${shortHash(hash)}）`);
      for (const file of files) console.log(`      ${file.rel}：${file.bytes} 字节 · sha256 ${shortHash(file.hash)}`);

      /* 探针 ①：时间字段的形态 */
      const instants = instantsOf(files);
      const wrongShape = [...new Set(instants.filter(item => !FROZEN_INSTANT_RE.test(item.instant))
        .map(item => `${item.file}: ${item.instant}`))];
      if (!instants.length) {
        fail('两条产物里一个时间字段都没有：订阅流的时间必须由数据的日期派生，空产物本身就说明这一路没跑通');
      } else if (wrongShape.length) {
        fail(`时间字段不是「数据日期的北京时间零点」（${wrongShape.length} 种）：${wrongShape.slice(0, 3).join('；')}`
          + ' —— 出现别的时分秒 / 缺 +08:00 偏移就说明有东西把「现在几点」写进了产物');
      } else {
        ok(`墙钟探针 ①（形态）：${instants.length} 个时间字段全为「数据日期 + T00:00:00+08:00」`);
      }

      /* 探针 ②：取值 —— 与仓库数据现算对账 */
      const dates = instants.map(item => item.instant.slice(0, 10)).filter(date => historyCore.DATE_RE.test(date));
      const maxDate = dates.length ? dates.slice().sort().pop() : '';
      const data = dataDatesOf();
      for (const problem of data.problems) fail(`现算数据日期失败：${problem}`);
      if (!maxDate) {
        fail('产物里取不到最大日期（时间字段都存在，但没有一个是 YYYY-MM-DD 开头）');
      } else if (data.newest && maxDate !== data.newest) {
        fail(`产物里的最大日期 ${maxDate} ≠ 由仓库数据现算的「最新一天」${data.newest}`
          + '（现算口径：三个变更日志里真的会进 feed 的事件中最大的 at）—— 产物过期、写死了日期、'
          + '或日期不再来自数据，三种失效都会走到这里');
      } else if (data.dataDate && maxDate > data.dataDate) {
        fail(`产物里的最大日期 ${maxDate} **晚于**数据日期 ${data.dataDate}`
          + '（= 仓库根 deals.json 的 updatedAt）—— 时间轴跑到数据前面去了，这是「时钟泄进日期部分」的形态');
      } else if (data.newest && data.dataDate) {
        ok(`墙钟探针 ②（取值）：最大日期 ${maxDate} = 现算的最新一天 ${data.newest}`
          + `（数据日期 ${data.dataDate} ≥ 它；现算口径：${data.counts.join(' · ')}）`);
      }

      /* 与参考产物逐字节对账（判据：逐文件 sha256 + 聚合指纹） */
      if (reference) {
        const problems = diffOf(reference.files, files);
        if (reference.hash !== hash && !problems.length) problems.push('聚合指纹不同（逐文件 sha256 却相同 —— 文件集合或顺序变了）');
        if (problems.length) {
          fail(`${rel(BUILT)}/ 与第 1 次隔离构建不一致：${problems.slice(0, 3).join('；')}`);
        } else {
          ok(`${rel(BUILT)}/ 与第 1 次隔离构建逐字节一致（指纹 ${shortHash(hash)}）`);
        }
      }
      continue;
    }

    /* 第 2..N 次：与第 1 次逐字节比对 */
    if (hash === first.hash) {
      ok(`第 ${run} 次构建与第 1 次逐字节一致（指纹 ${shortHash(hash)}）`);
    } else {
      const problems = diffOf(first.files, files);
      fail(`第 ${run} 次构建与第 1 次不一致：${problems.slice(0, 3).join('；') || '聚合指纹不同'}`
        + `（指纹 ${shortHash(first.hash)} → ${shortHash(hash)}）`);
    }
  }
} finally {
  cleanupTemp();
}

const leftover = [TMP, TMP_BUILDING, TMP_NOTES].filter(target => fs.existsSync(target));
if (leftover.length) fail(`临时产物没有被删干净：${leftover.map(rel).join('、')}`);
else ok(`临时产物已清理（${rel(TMP)}/ · ${rel(TMP_BUILDING)}/ · ${rel(TMP_NOTES)} 都不存在）`);

console.log(`\n${failed ? '❌' : '✅'} 订阅产物可复现门禁：${RUNS} 次隔离构建${failed ? `，${failed} 项判红` : '，全部逐字节一致'}`);
if (failed) {
  failures.forEach(item => console.log(`   ✗ ${item}`));
  process.exit(1);
}
