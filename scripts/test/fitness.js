#!/usr/bin/env node
'use strict';
/**
 * Architecture Fitness Tests —— 少而高价值的**结构不变量**门禁（本轮新增）。
 *
 * ## 为什么只有 5 条
 *
 * 架构门禁的价值密度差别极大：一条能抓住「今天还成立、明天会被顺手破坏」的边界，胜过
 * 二十条恒真的形式检查。所以本文件的收录标准是**三条同时成立**：
 *   ① 它守的是一个**真实结构边界**（不是风格偏好）；
 *   ② 破坏它**没有别人会红**（否则就是重复证明，见下）；
 *   ③ 它**今天真的成立**（不是许愿）。
 *
 * 于是本轮**刻意不收**这几条（都曾被列进计划，复核后删掉）：
 *   · 「无循环依赖」——实测恒为 0，且没有任何真实退化路径靠它拦（价值低）；
 *   · 「布局族声明完整」——已由 `lib/page-kinds.js` 的 `assertLayoutDeclarations()`
 *     双向反查，并由 `seo-selftest`（含负例探针）与 `verify-site` §22c 把守，再加一处就是
 *     同一个不变量第三处证明；
 *   · 「产物注册表闭包」——构建期 `selfCheck()` 已对账（每个写出的文件都在
 *     `PUBLIC_FILES` / `GENERATED_FILES` / `dataDocs` 注册表内），owner 已是构建自检；
 *   · 「每个测试都被门禁跑到」——owner 是 `check-ci-consistency.js` 的断言 (17)/(19)。
 *
 * ## 5 条各守什么
 *
 *   ① **依赖方向**：`scripts/lib/**` 不得 require `scripts/{build,tools,ai}/**`。
 *      今天 0 违规；一旦破坏，domain 层就会被构建脚本反向绑死（那是本轮之前最怕的形态）。
 *   ② **renderer 纯度**：页面正文模块不得读盘 / 写盘 / 联网 / 看当前时间。
 *      判据是源码级（不 require `fs`/`http`，不出现 `Date.now()`/`new Date()`）——
 *      时间是 context 注入的，build 才能保持 offline deterministic。
 *   ③ **唯一 document 出口**：全仓 `scripts/**` 里只有 `lib/page-shell.js` 可以出现 `<!DOCTYPE`。
 *      本轮之前是 9 处（9 个页面族各拼一份完整文档）；这条门禁保证它不会回到 9 处。
 *   ④ **分层表完整性**：`scripts/test/layers.js` 不得有幽灵条目、每个 `selftest:*` 恰好属于一层、
 *      同一 script 不出现在两层。
 *   ⑤ **时间口径**：不许把**未位移的 UTC 当前时间**当「今天」（全站只有 `todayCN()` 一个口径）。
 *      加它的依据是 2026-10-13 的实测事故：`history-selftest.js` 里那一句让**北京时间
 *      00:00–08:00** 的定时采集整条红在门禁前（数据不入库），而同一条链上的 `history-verify.js`
 *      用的是 `todayCN()` —— 两个读者对「今天」的口径不一致，且只在跨日窗口里露出来。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const rel = p => path.relative(ROOT, p).replace(/\\/g, '/');

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const SCRIPTS = walk(path.join(ROOT, 'scripts'));
const read = f => fs.readFileSync(f, 'utf8');

// ---------------------------------------------------------------- ① 依赖方向

{
  const libs = SCRIPTS.filter(f => rel(f).startsWith('scripts/lib/'));
  const bad = [];
  for (const f of libs) {
    for (const m of read(f).matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1];
      if (!spec.startsWith('.')) continue;
      const target = rel(path.resolve(path.dirname(f), spec.endsWith('.js') ? spec : spec + '.js'));
      if (/^scripts\/(build|tools|ai)\//.test(target)) bad.push(`${rel(f)} → ${target}`);
    }
  }
  check('① 依赖方向：scripts/lib/** 不依赖 scripts/{build,tools,ai}/**',
    bad.length === 0,
    bad.length ? `${bad.length} 处违规：${bad.slice(0, 5).join('；')}` : `扫了 ${libs.length} 个 lib 模块，0 违规`);
}

// ---------------------------------------------------------------- ② renderer 纯度

{
  // 「页面正文 / 页壳」这一层：lib 下所有 *-page.js 与 page-shell.js
  const pages = SCRIPTS.filter(f => /scripts\/lib\/(page-shell|.*-page)\.js$/.test(rel(f)));
  const problems = [];
  for (const f of pages) {
    const src = read(f);
    const name = rel(f);
    if (/require\(\s*['"](fs|node:fs|http|https|node:http|node:https|playwright-core|child_process)['"]\s*\)/.test(src)) {
      problems.push(`${name}: require 了 IO/网络模块（renderer 必须只做 input → HTML）`);
    }
    if (/\bDate\.now\s*\(/.test(src)) problems.push(`${name}: 出现 Date.now()（时间必须 context 注入）`);
    if (/\bnew Date\s*\(\s*\)/.test(src)) problems.push(`${name}: 出现 new Date()（时间必须 context 注入）`);
  }
  check('② renderer 纯度：页面正文/页壳模块不读盘、不联网、不看当前时间',
    problems.length === 0,
    problems.length ? problems.slice(0, 4).join('；') : `扫了 ${pages.length} 个页面模块（${pages.map(f => path.basename(f)).join(', ')}）`);
}

// ---------------------------------------------------------------- ③ 唯一 document 出口

{
  // 判据要区分三种出现，否则会把「检测器」和「测试夹具」误判成「生产者」：
  //   · 生产模块**产出**一份文档      ← 本条要拦的就是它（本轮之前有 9 处）
  //   · 检测器（正则 / .test()）读一份文档  ← 合法（如 lib/archive.js 判「是不是整页」）
  //   · 测试夹具**合成**一份最小文档   ← 合法（离线自测离线跑，不必有 dist）
  const TEST_FILES = /scripts\/tools\/(.*-selftest|.*-verify|build-fixtures|fixture-test)\.js$/;
  const SELF = 'scripts/test/fitness.js';
  const ALLOWED = ['scripts/lib/page-shell.js'];
  const offenders = [];
  for (const f of SCRIPTS) {
    const name = rel(f);
    if (ALLOWED.includes(name) || name === SELF || TEST_FILES.test(name)) continue;
    const lines = read(f).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!/<!DOCTYPE/i.test(l)) continue;
      const trimmed = l.trim();
      if (/^(\/\/|\*|\/\*)/.test(trimmed)) continue;          // 注释里的说明
      if (/\.test\(|new RegExp|RegExp\(/.test(l)) continue;    // 检测器，不是生产者
      offenders.push(`${name}:${i + 1}`);
    }
  }
  check('③ 唯一 document 出口：生产模块里只有 lib/page-shell.js 产出 <!DOCTYPE',
    offenders.length === 0,
    offenders.length
      ? `${offenders.length} 处越权：${offenders.slice(0, 6).join('；')}`
      : `扫了 ${SCRIPTS.length} 个脚本（排除测试夹具与检测器），唯一出口 = ${ALLOWED.join(', ')}`);
}

// ---------------------------------------------------------------- ④ 分层表完整性

{
  const layers = require('./layers');
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const declared = layers.allDeclaredScripts();          // 重复即抛错（见 allDeclaredScripts）
  const phantom = declared.filter(s => !(s in pkg.scripts));
  const selftests = Object.keys(pkg.scripts).filter(k => k.startsWith('selftest:'));
  const unclassified = selftests.filter(s => !declared.includes(s));
  check('④ 分层表完整性：无幽灵条目、每个 selftest:* 恰好属于一层',
    phantom.length === 0 && unclassified.length === 0,
    (phantom.length || unclassified.length)
      ? `幽灵条目 ${phantom.length}：${phantom.slice(0, 4).join(', ') || '无'}；未分层 ${unclassified.length}：${unclassified.slice(0, 4).join(', ') || '无'}`
      : `${declared.length} 个 script 分在 ${Object.keys(layers.LAYERS).length} 层，${selftests.length} 个 selftest:* 全部已分层`);
}

// ---------------------------------------------------------------- ⑤ 时间口径（今天 = 北京时间）

{
  // 判据（源码级，刻意窄）：**未位移的当前时间**不许直接当「今天」用。
  //   全站的日期口径只有一处：`lib/schema.js` 的 `todayCN()`（+8 小时、无夏令时）。
  //   要拦的形态就是 `new Date()` 紧跟 `.toISOString().slice(0, 10)` —— 那是 **UTC 日期**。
  //   刻意**不拦**的两类（判不准就不写成牙，否则这条会变成噪声）：
  //     · 固定锚点的日期算术（`new Date(t + n * 86400000)…`）—— 它算的是某个已知时刻的前后
  //       n 天，与「今天是几号」无关；
  //     · 已经做过 +8 小时位移的写法（`new Date(Date.now() + 8 * 3600 * 1000)…`）。
  //
  // 为什么它值得占一条结构不变量（2026-10-13 实测，不是推断）：`history-selftest.js` 里就是
  // 这一句，于是**北京时间 00:00–08:00** 这段窗口里（UTC 还停在昨天）采集刚写下的
  // 「数据日期 = 今天（北京）」被判成**未来日期** ⇒ 定时采集链整条停在门禁前、数据不入库
  // （run 38307590467，04:57 CST）。同一条链上的 `history-verify.js` 用的是 `todayCN()` ——
  // 两个读者对「今天」的口径必须一致。
  const UTC_TODAY = /new Date\(\s*\)\s*\.toISOString\(\s*\)\s*\.slice\(\s*0\s*,\s*10\s*\)/;
  // 适用范围自检（正反例成对）：扫描器先过一遍样本，避免它退化成「永远不命中」。
  // ⚠️ 样本用**拼接**写：本文件自己也在扫描射程内，字面量会把这条不变量变成自伤。
  const TAIL = '.toISOString().slice(0, 10)';   // 只出现片段，不出现完整形态
  const SAMPLES = [
    [`const today = new Date()${TAIL};`, true],
    ['const today = todayCN();', false],
    [`const today = new Date(Date.now() + 8 * 3600 * 1000)${TAIL};`, false],
    [`const day = new Date(base - n * 86400000)${TAIL};`, false]
  ];
  const sampleMissed = SAMPLES.filter(([text, hit]) => UTC_TODAY.test(text) !== hit).map(([text]) => text);

  const offenders = [];
  for (const f of SCRIPTS) {
    const name = rel(f);
    read(f).split(/\r?\n/).forEach((line, i) => {
      if (/^(\/\/|\*|\/\*)/.test(line.trim())) return;   // 注释里的说明（含本文件举的反例）
      if (UTC_TODAY.test(line)) offenders.push(`${name}:${i + 1}`);
    });
  }
  check('⑤ 时间口径：不许把未位移的 UTC 当前时间当「今天」（全站只有 todayCN() 一个口径）',
    sampleMissed.length === 0 && offenders.length === 0,
    sampleMissed.length
      ? `扫描器自检不通过（正反例没分开）：${sampleMissed.join('；')}`
      : (offenders.length
        ? `${offenders.length} 处：${offenders.slice(0, 4).join('；')}`
        : `扫了 ${SCRIPTS.length} 个脚本 · 0 处 · 正反例自检 4/4（北京 00:00–08:00 那一段正是它拦下的）`));
}

const failed = results.filter(r => !r.ok);
console.log(`\n${failed.length ? '❌' : '✅'} 架构 fitness ${results.length} 条，失败 ${failed.length} 条`);
process.exit(failed.length ? 1 : 0);
