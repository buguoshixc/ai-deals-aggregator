#!/usr/bin/env node
/**
 * t35 / M26 复跑（含 M25 真牙）：证明「删掉死常量 PRECEDENCE」之后，**行为判据仍在**。
 *
 * 两件事：
 *   ① 静态：沙箱里的 `scripts/lib/coverage-targets.js` 已没有 `PRECEDENCE` 常量、也不再导出它
 *      （t35/M26 的处置），且注释把 `deriveDimension()` 的 if 链标成唯一判据出处；
 *   ② 动态（M25 那条真牙，t17 的实证）：给沙箱里的 **DEFERRED 分支加一条 `row.count === 0 → MISSING`
 *      短路** ⇒ `coverage-targets-selftest` 必须立刻红（"延期永不算漏了"那条断言）。
 *      再加对照（未注入 ⇒ 绿）与复原（⇒ 又绿），证明红色确实来自这次注入。
 *
 * 全程在 TEMP 沙箱里改（见 sandbox.cjs）；共享 worktree 的 lib 用 sha256 前后比对证明未动。
 *
 * 用法：node research/_raw/t35/m26-m25-replay.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { ROOT, makeSandbox, runIn, sha256File, remove } = require('./sandbox.cjs');

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ` —— ${detail}`}`);
  if (!ok) failures.push(name);
}

const LIB_REL = path.join('scripts', 'lib', 'coverage-targets.js');
const sharedLib = path.join(ROOT, LIB_REL);
const sharedBefore = sha256File(sharedLib);

const sandbox = makeSandbox('m26');
console.log(`沙箱：${sandbox.dir}（复制跟踪文件 ${sandbox.files} 个）`);

let exitCode = 1;
try {
  const libPath = path.join(sandbox.dir, LIB_REL);

  /* ---- ① 静态：M26 的处置确实落在这里 ---- */
  const source = fs.readFileSync(libPath, 'utf8');
  check('M26：沙箱 lib 里已无 `const PRECEDENCE` 常量', !/const\s+PRECEDENCE\s*=/.test(source));
  check('M26：导出表里也没有 PRECEDENCE', !/^\s{2}PRECEDENCE,\s*$/m.test(source));
  check('M26：注释把 deriveDimension() 的 if 链标成唯一判据出处',
    /七态优先级的唯一判据出处/.test(source) && /七态判据（唯一出处/.test(source));
  check('M26：PRECEDENCE 只作为"已删除"的说明出现在注释里（提到它的地方都在注释行）',
    source.split('\n').filter(line => /PRECEDENCE/.test(line)).every(line => line.trim().startsWith('//') || line.trim().startsWith('*')));

  /* ---- 对照：未注入 ---- */
  const control = runIn(sandbox.dir, path.join('scripts', 'tools', 'coverage-targets-selftest.js'));
  const controlSummary = (control.stdout.match(/(\d+) 项通过，(\d+) 项失败/) || []);
  console.log(`\n① 对照（未注入）：exit ${control.status} · ${controlSummary[0] || '（没抓到汇总行）'}`);
  check('对照组 coverage-targets-selftest 退出码 0', control.status === 0, control.stdout.trim().split('\n').slice(-3).join(' | '));

  /* ---- 注入 M25 短路 ---- */
  const ANCHOR = '    return cell(STATES.DEFERRED, ruling.decision === \'deferred\'';
  const INJECT = '    if (row.count === 0) return cell(STATES.MISSING, \'（M25 注入：无记录 ⇒ MISSING）\');\n' + ANCHOR;
  const occurrences = source.split(ANCHOR).length - 1;
  check('变异可应用（DEFERRED 分支锚点恰好 1 处）', occurrences === 1, `锚点命中 ${occurrences} 处`);
  const mutatedSource = source.replace(ANCHOR, INJECT);
  check('变异已落地（注入片段的字节确实写进去了）', mutatedSource !== source && /row\.count === 0\) return cell\(STATES\.MISSING/.test(mutatedSource));
  fs.writeFileSync(libPath, mutatedSource);
  console.log('\n② 注入：deriveDimension() 的 DEFERRED 分支前加一条 `row.count === 0 → MISSING` 短路（M25）');

  const mutated = runIn(sandbox.dir, path.join('scripts', 'tools', 'coverage-targets-selftest.js'));
  const failing = mutated.stdout.split('\n').filter(line => line.trim().startsWith('✗')).map(line => line.trim());
  console.log(`   注入后：exit ${mutated.status} · 失败项 ${failing.length} 条`);
  failing.slice(0, 3).forEach(text => console.log(`     ${text}`));

  check('注入后 coverage-targets-selftest 退出码非 0', mutated.status !== 0, `exit ${mutated.status}`);
  check('注入后失败项里点名「DEFERRED 永不算 MISSING」那条断言',
    failing.some(text => /DEFERRED 永不算 MISSING/.test(text)), failing.slice(0, 2).join(' | '));

  /* ---- 复原 ---- */
  fs.writeFileSync(libPath, source);
  const restored = runIn(sandbox.dir, path.join('scripts', 'tools', 'coverage-targets-selftest.js'));
  check('复原后沙箱回到绿（红色确实来自注入）', restored.status === 0,
    restored.stdout.trim().split('\n').slice(-2).join(' | '));
  check('沙箱复原后 lib 与共享树逐字节相同', sha256File(libPath) === sharedBefore);
} finally {
  remove(sandbox.dir);
}

check('共享 worktree 的 scripts/lib/coverage-targets.js 逐字节未动', sha256File(sharedLib) === sharedBefore);

console.log(`\n=== t35 / M26 复跑：${failures.length ? `${failures.length} 项不成立` : '全部成立（死常量已删；真牙仍在：DEFERRED 短路 ⇒ selftest 必红）'} ===`);
if (failures.length) {
  failures.forEach(name => console.log(`  ✗ ${name}`));
  exitCode = 1;
} else {
  exitCode = 0;
}
process.exit(exitCode);
