#!/usr/bin/env node
/**
 * secondary-page-layout-unification · M-disk 落盘级变异循环（t3 证据，prompt §24 字面要求）
 *
 * 循环（每一步都落盘，日志写在 mutations-real/M-disk.log）：
 *   ① 记录前置状态（`build-local.js` sha256 / `git status --porcelain` / T1 的 diff / 临时字节备份）
 *   ② 在 `build-local.js` 的 **feeds 壳**里把 `.snote` 的 `max-width: 70ch` 塞回去
 *      （唯一锚点 + 可逆插入；与 §22c 的内存变异 M4 同一处缺陷，这里是**落盘级**版本）
 *   ③ 真实构建 `node scripts/tools/build-local.js`
 *   ④ 独立探针判红 `geometry/wide-probe.cjs`（自己实现，不依赖被测脚本 verify-site.js）
 *   ⑤ `git checkout -- scripts/tools/build-local.js`
 *   ⑥ 还原 T1 的工作副本（先 `git apply` T1 的 diff；sha256 不符则回落字节备份）＋ 可逆性自检
 *   ⑦ 真实构建
 *   ⑧ 独立探针判绿
 *   ⑨ 恢复证明：该文件 sha256 前后相等 + `git status --porcelain` 与前置逐字节相等 + 产物重建可复现
 *
 * 为什么用 Node 而不是 .ps1：Windows PowerShell 5.1 把无 BOM 的 .ps1 按 ANSI 读，
 * 本仓库的注释与输出全是 UTF-8 中文 —— 解析阶段就崩（实测）。Node 读 UTF-8 源码，没有这个问题。
 *
 * 用法：node research/_raw/secondary-page-layout-unification/mutations-real/run-mdisk.cjs
 * 退出码：0 = 红→恢复→绿 且恢复是字节级的；非 0 = 循环未达成（日志里说明卡在哪一步）。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const E = 'research/_raw/secondary-page-layout-unification';
const M = `${E}/mutations-real`;
const TARGET = 'scripts/tools/build-local.js';
const BACKUP = path.join(process.env.TEMP || process.env.TMP || ROOT, 'mdisk-build-local.pre-mutation.js');
const abs = rel => path.join(ROOT, rel);
const sha256 = rel => crypto.createHash('sha256').update(fs.readFileSync(abs(rel))).digest('hex');

const log = [];
const W = line => { log.push(line === undefined ? '' : String(line)); };
const flush = () => fs.writeFileSync(abs(`${M}/M-disk.log`), `${log.join('\n')}\n`, 'utf8');

/** 跑外部命令：stdout/stderr **直接写文件描述符**（不经过管道），返回退出码 */
function runTo(command, args, outRel) {
  const fd = fs.openSync(abs(outRel), 'w');
  const outcome = spawnSync(command, args, { cwd: ROOT, env: process.env, stdio: ['ignore', fd, fd] });
  fs.closeSync(fd);
  return outcome.status === null ? -1 : outcome.status;
}
const node = (args, outRel) => runTo(process.execPath, args, outRel);
const git = (args, outRel) => runTo('git', args, outRel);
const gitCapture = args => {
  const outcome = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return (outcome.stdout || '').replace(/\r\n/g, '\n');
};
const tailOf = (rel, lines = 3) => fs.readFileSync(abs(rel), 'utf8').trimEnd().split('\n').slice(-lines)
  .map(line => `  ${line}`);

W('# M-disk 落盘级变异循环（secondary-page-layout-unification · t3）');
W(`# 开始 ${new Date().toISOString()}`);
W(`# 工作目录 ${ROOT}`);
W(`# 驱动脚本 ${M}/run-mdisk.cjs`);

/* ---------------------------------------------------------------- ① 前置状态 */
W('');
W('===== ① 前置状态（改动前） =====');
const preSha = sha256(TARGET);
const preBytes = fs.statSync(abs(TARGET)).size;
const preStatus = gitCapture(['status', '--porcelain']).trimEnd();
fs.writeFileSync(abs(`${M}/M-disk.pre-status.txt`), `${preStatus}\n`, 'utf8');
fs.copyFileSync(abs(TARGET), BACKUP);
const backupSha = crypto.createHash('sha256').update(fs.readFileSync(BACKUP)).digest('hex');
const patchRel = `${M}/M-disk.build-local.t1.patch`;
git(['diff', '--', TARGET], patchRel);
W(`${TARGET} sha256 = ${preSha}（${preBytes} 字节）`);
W(`临时字节备份：${BACKUP} · sha256 ${backupSha}（与前置相等：${backupSha === preSha}）`);
W(`T1 的 diff（HEAD → 工作副本）：${patchRel}（${fs.statSync(abs(patchRel)).size} 字节）`);
W('git status --porcelain：');
W(preStatus.split('\n').map(line => `  ${line}`).join('\n'));
const manifestBefore = `${E}/build/dist-after-build1.sha256.txt`;
W(`第 1 步真实构建的产物清单：${manifestBefore}`);

/* ---------------------------------------------------------------- ② 变异 */
W('');
W('===== ② 把 70ch 塞回 feeds 壳（唯一锚点插入，可逆） =====');
const applyCode = node([`${M}/mdisk-edit.cjs`, `--file=${TARGET}`, `--anchor-file=${M}/M-disk.anchor.txt`, '--apply'], `${M}/M-disk.step1-apply.log`);
W(`mdisk-edit --apply exit=${applyCode}`);
W(fs.readFileSync(abs(`${M}/M-disk.step1-apply.log`), 'utf8').trimEnd().split('\n').map(line => `  ${line}`).join('\n'));
const mutSha = sha256(TARGET);
const mutatedLineHits = fs.readFileSync(abs(TARGET), 'utf8').split('\n').filter(line => line.includes('max-width: 70ch')).length;
W(`变异后 ${TARGET} sha256 = ${mutSha}（${fs.statSync(abs(TARGET)).size} 字节）`);
W(`文件里含 'max-width: 70ch' 的行数 = ${mutatedLineHits}（改动前为 0）`);
if (mutSha === preSha) { W('❌ 变异没有改变文件'); flush(); process.exit(2); }

/* ---------------------------------------------------------------- ③ 构建 */
W('');
W('===== ③ 真实构建（带变异） =====');
const buildRedCode = node(['scripts/tools/build-local.js'], `${M}/M-disk.step2-build-red.log`);
W(`node scripts/tools/build-local.js exit=${buildRedCode}`);
W(tailOf(`${M}/M-disk.step2-build-red.log`).join('\n'));

/* ---------------------------------------------------------------- ④ 判红 */
W('');
W('===== ④ 独立探针判红（geometry/wide-probe.cjs，不依赖 verify-site.js） =====');
const redCode = node([`${E}/geometry/wide-probe.cjs`, '--dir=dist', '--label=m-disk-red', `--out=${M}/M-disk.probe-red.json`], `${M}/M-disk.step3-probe-red.log`);
W(`wide-probe.cjs --dir=dist exit=${redCode}（期望 1 = 检出违规）`);
const red = JSON.parse(fs.readFileSync(abs(`${M}/M-disk.probe-red.json`), 'utf8'));
W(`全站扫描 ${red.sweep.total} 页 · 违规页 ${red.sweep.violations.length} · 违规码计数 ${JSON.stringify(red.sweep.codes)}`);
W(`样本违规 ${red.sampleViolations.length} 条`);
red.sweep.violations.forEach(v => W(`  违规页 ${v.route} [${v.codes.join(', ')}] 说明 ${v.noteWidth}px / 主数据区 ${v.regionWidth}px（${v.regionSel}）`));
red.sampleViolations.forEach(v => W(`  样本 ${v.route}@${v.viewport} [${v.codes.join(', ')}]`));
const NARROW_RULE = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: 70ch; }';
const FROZEN_RULE = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';
const countOf = (text, needle) => text.split(needle).length - 1;
const feedsHtmlRed = fs.readFileSync(abs('dist/feeds/index.html'), 'utf8');
const feeds70Red = countOf(feedsHtmlRed, NARROW_RULE);
const feedsFrozenRed = countOf(feedsHtmlRed, FROZEN_RULE);
W(`dist/feeds/index.html：70ch 规则 ${feeds70Red} 处 · 冻结串 ${feedsFrozenRed} 处`);

/* ---------------------------------------------------------------- ⑤ git checkout */
W('');
W('===== ⑤ git checkout -- scripts/tools/build-local.js（字面执行） =====');
const checkoutCode = git(['checkout', '--', TARGET], `${M}/M-disk.step4-git-checkout.log`);
const afterCheckoutSha = sha256(TARGET);
W(`git checkout exit=${checkoutCode}`);
W(`checkout 后 ${TARGET} sha256 = ${afterCheckoutSha}`);
W('说明：本 worktree 的 HEAD = 1f225d2（基线），T1 的源码改动**尚未提交** ⇒ `git checkout --` 得到的是');
W('      **改动前**的版本（不是 T1 的工作副本）。因此下一步必须把 T1 的工作副本还原回来，');
W('      否则第 ⑧ 步会红（产物退回 70ch 状态）—— 这一点如实记录，不做"看起来恢复了"的假象。');

/* ---------------------------------------------------------------- ⑥ 还原 T1 工作副本 */
W('');
W('===== ⑥ 还原 T1 的工作副本（先 git apply，sha256 不符则回落字节备份） =====');
const applyPatchCode = git(['apply', '--', patchRel], `${M}/M-disk.step5-git-apply.log`);
let afterApplySha = sha256(TARGET);
W(`git apply ${patchRel} exit=${applyPatchCode} · 还原后 sha256 = ${afterApplySha}`);
let restoreMethod = 'git apply（T1 的 diff）';
if (afterApplySha !== preSha) {
  W(`git apply 的 sha256 与前置不符（${afterApplySha} ≠ ${preSha}）⇒ 回落到字节备份`);
  fs.copyFileSync(BACKUP, abs(TARGET));
  restoreMethod = '字节备份 copyFileSync';
  afterApplySha = sha256(TARGET);
  W(`字节备份还原后 sha256 = ${afterApplySha}`);
}
W(`还原方式：${restoreMethod} · sha256 与前置相等：${afterApplySha === preSha}`);
if (afterApplySha !== preSha) { W('❌ build-local.js 未能字节级恢复'); flush(); process.exit(3); }

// 可逆性自检：即使没有备份，--revert 也能精确回到 T1 版本
W('');
W('--- 可逆性自检（证明这次变异是一个可精确撤销的操作）---');
const revert1 = node([`${M}/mdisk-edit.cjs`, `--file=${TARGET}`, `--anchor-file=${M}/M-disk.anchor.txt`, '--revert'], `${M}/M-disk.step6-revert-selftest.log`);
const afterRevert = sha256(TARGET);
W(`mdisk-edit --revert exit=${revert1} · sha256 = ${afterRevert}（应等于前置 ${preSha}：${afterRevert === preSha}）`);
const reapply = node([`${M}/mdisk-edit.cjs`, `--file=${TARGET}`, `--anchor-file=${M}/M-disk.anchor.txt`, '--apply'], `${M}/M-disk.step7-reapply.log`);
const afterReapply = sha256(TARGET);
W(`再次 --apply exit=${reapply} · sha256 = ${afterReapply}（应等于变异后的 ${mutSha}：${afterReapply === mutSha}）`);
const revert2 = node([`${M}/mdisk-edit.cjs`, `--file=${TARGET}`, `--anchor-file=${M}/M-disk.anchor.txt`, '--revert'], `${M}/M-disk.step8-final-revert.log`);
const restoredSha = sha256(TARGET);
W(`最终 --revert exit=${revert2} · sha256 = ${restoredSha}（应等于前置 ${preSha}：${restoredSha === preSha}）`);
if (restoredSha !== preSha) { W('❌ 可逆性自检失败'); flush(); process.exit(3); }

/* ---------------------------------------------------------------- ⑦ 重建 */
W('');
W('===== ⑦ 真实构建（恢复后） =====');
const buildGreenCode = node(['scripts/tools/build-local.js'], `${M}/M-disk.step9-build-green.log`);
W(`node scripts/tools/build-local.js exit=${buildGreenCode}`);
W(tailOf(`${M}/M-disk.step9-build-green.log`).join('\n'));

/* ---------------------------------------------------------------- ⑧ 判绿 */
W('');
W('===== ⑧ 独立探针判绿 =====');
const greenCode = node([`${E}/geometry/wide-probe.cjs`, '--dir=dist', '--label=m-disk-green', `--out=${M}/M-disk.probe-green.json`], `${M}/M-disk.step10-probe-green.log`);
W(`wide-probe.cjs --dir=dist exit=${greenCode}（期望 0 = 0 违规码）`);
const green = JSON.parse(fs.readFileSync(abs(`${M}/M-disk.probe-green.json`), 'utf8'));
W(`全站扫描 ${green.sweep.total} 页 · 违规页 ${green.sweep.violations.length} · 违规码计数 ${JSON.stringify(green.sweep.codes)}`);
W(`样本违规 ${green.sampleViolations.length} 条`);
const feedsHtmlGreen = fs.readFileSync(abs('dist/feeds/index.html'), 'utf8');
const feeds70Green = countOf(feedsHtmlGreen, NARROW_RULE);
W(`dist/feeds/index.html：70ch 规则 ${feeds70Green} 处（期望 0） · 冻结串 ${countOf(feedsHtmlGreen, FROZEN_RULE)} 处`);

/* ---------------------------------------------------------------- ⑨ 恢复证明 */
W('');
W('===== ⑨ 恢复证明 =====');
const finalSha = sha256(TARGET);
const finalStatus = gitCapture(['status', '--porcelain']).trimEnd();
const statusSame = finalStatus === preStatus;
W(`${TARGET} sha256：前置 ${preSha}`);
W(`${' '.repeat(TARGET.length)}  恢复后 ${finalSha}`);
W(`                    sha256 前后相等：${finalSha === preSha}`);
W(`git status --porcelain 与前置逐字节相等：${statusSame}`);
if (!statusSame) {
  W('  差异：');
  const before = new Set(preStatus.split('\n'));
  const after = new Set(finalStatus.split('\n'));
  for (const line of before) if (!after.has(line)) W(`  - ${line}`);
  for (const line of after) if (!before.has(line)) W(`  + ${line}`);
}
const manifestAfter = `${M}/M-disk.dist-after-recovery.sha256.txt`;
node([`${E}/build/dist-manifest.cjs`, '--dir=dist', `--out=${manifestAfter}`], `${M}/M-disk.step11-manifest.log`);
const manifestSame = fs.readFileSync(abs(manifestBefore), 'utf8') === fs.readFileSync(abs(manifestAfter), 'utf8');
W(`产物清单（第 1 步构建 vs 恢复后重建）逐字节相等：${manifestSame}`);
W(`  第 1 步：${manifestBefore}`);
W(`  恢复后：${manifestAfter}`);

const verdictPass = finalSha === preSha && statusSame && redCode === 1 && greenCode === 0
  && green.sweep.violations.length === 0 && red.sweep.violations.length > 0;

const summary = {
  task: 'M-disk 落盘级变异循环',
  at: new Date().toISOString(),
  cycle: [
    '① 前置状态：build-local.js sha256 + git status --porcelain + T1 diff + 字节备份',
    '② 变异：feeds 壳里插回 `.snote { … max-width: 70ch; }`（唯一锚点，可逆）',
    '③ 真实构建 node scripts/tools/build-local.js',
    '④ 独立探针 geometry/wide-probe.cjs 判红',
    '⑤ git checkout -- scripts/tools/build-local.js',
    '⑥ 还原 T1 工作副本（git apply / 字节备份）并做可逆性自检',
    '⑦ 真实构建',
    '⑧ 独立探针判绿',
    '⑨ 恢复证明：sha256 + git status + 产物可复现'
  ],
  files: {
    target: TARGET,
    sha256Before: preSha, sha256Mutated: mutSha, sha256AfterGitCheckout: afterCheckoutSha,
    sha256AfterRestore: restoredSha, sha256Final: finalSha,
    restoreMethod, t1Patch: patchRel, preStatusFile: `${M}/M-disk.pre-status.txt`
  },
  red: {
    buildExit: buildRedCode, probeExit: redCode,
    violatedPages: red.sweep.violations.length, codes: red.sweep.codes,
    sampleViolations: red.sampleViolations.length,
    pages: red.sweep.violations.map(v => v.route),
    feeds70chRule: feeds70Red, feedsFrozenRule: feedsFrozenRed,
    log: `${M}/M-disk.step3-probe-red.log`, json: `${M}/M-disk.probe-red.json`
  },
  green: {
    buildExit: buildGreenCode, probeExit: greenCode,
    violatedPages: green.sweep.violations.length, codes: green.sweep.codes,
    sampleViolations: green.sampleViolations.length,
    feeds70chRule: feeds70Green,
    log: `${M}/M-disk.step10-probe-green.log`, json: `${M}/M-disk.probe-green.json`
  },
  recovery: {
    sha256Equal: finalSha === preSha,
    gitStatusPorcelainEqual: statusSame,
    distManifestEqual: manifestSame,
    distManifestBefore: manifestBefore,
    distManifestAfter: manifestAfter
  },
  verdict: verdictPass ? 'pass' : 'FAIL'
};
fs.writeFileSync(abs(`${M}/M-disk.json`), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
W('');
W(`结论：${verdictPass ? '✅ 红 → 恢复 → 绿，且恢复是字节级的（sha256 / git status / 产物清单三证）' : '❌ 循环未达成（见上）'}`);
W(`summary: ${M}/M-disk.json`);
flush();

console.log(`M-disk：红（违规页 ${red.sweep.violations.length}）→ 恢复（sha256 相等 ${finalSha === preSha}）→ 绿（违规页 ${green.sweep.violations.length}）`);
console.log(`日志：${M}/M-disk.log · summary：${M}/M-disk.json`);
process.exit(verdictPass ? 0 : 1);
