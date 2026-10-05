#!/usr/bin/env node
/**
 * t7 变异驱动：逐条跑「预期红 / 实际红 / 命中信息」，并把每一次的 stdout/stderr 留档。
 *
 * 用法：node run-mutations.cjs <sandboxRoot> <reviewDir>
 *   sandboxRoot  = TEMP 里的沙箱副本（t1 代码 + 冻结数据），**共享工作区一个字节都不动**
 *   reviewDir    = 本目录（夹具有 mutations/，日志写 mutations/logs/）
 *
 * 每条的判定：exit ≠ 0（或 m12 的"应当 exit 0 但必须显式说未落盘"）+ stderr/stdout 里出现预期命中串。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('crypto');
const { spawnSync } = require('child_process');

const sandbox = path.resolve(process.argv[2]);
const reviewDir = path.resolve(process.argv[3]);
const argv = process.argv.slice(4);
const mutDir = path.join(reviewDir, 'mutations');
const logDir = path.join(mutDir, 'logs');
fs.mkdirSync(logDir, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(mutDir, 'fixtures-manifest.json'), 'utf8'));
const sha = f => cp.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const results = [];
const run = (id, args, expect, opts = {}) => {
  const outFile = path.join(logDir, `${id}.out.txt`);
  const errFile = path.join(logDir, `${id}.err.txt`);
  const fdOut = fs.openSync(outFile, 'w');
  const fdErr = fs.openSync(errFile, 'w');
  const r = spawnSync(process.execPath, [path.join(sandbox, 'scripts/tools/coverage-report.js'), ...args],
    { cwd: sandbox, stdio: ['ignore', fdOut, fdErr] });
  fs.closeSync(fdOut);
  fs.closeSync(fdErr);
  const out = fs.readFileSync(outFile, 'utf8');
  const err = fs.readFileSync(errFile, 'utf8');
  const hit = expect ? (err.includes(expect) || out.includes(expect)) : true;
  const exitOk = opts.expectExitZero ? r.status === 0 : r.status !== 0;
  const hitLine = (err.split('\n').find(l => l.includes(expect)) || out.split('\n').find(l => l.includes(expect)) || '(没命中)').trim().slice(0, 220);
  const ok = exitOk && hit;
  results.push({
    id, args, expect, expectExitZero: Boolean(opts.expectExitZero), exit: r.status,
    hitExpectedString: hit, hitLine, ok, note: opts.note || null,
    outFile: path.relative(reviewDir, outFile), errFile: path.relative(reviewDir, errFile)
  });
  return r.status;
};

/* ---------- 正控制：合法夹具必须 exit 0（否则后面的"红"不能算牙） ---------- */
run('C0-clean-fixture', [`--source-rulings=${path.join(mutDir, 'rulings-clean.json')}`], null, { expectExitZero: true, note: '合法夹具：对账应 0 处问题' });

/* ---------- 8 条新牙（t1 声称的清单）+ 我在验收里点名的 3 条 schema 路径 ---------- */
run('M1-unparsable-releasedAt', [`--models=${path.join(mutDir, 'm1-models-unparsable.json')}`], '解析不出可判日');
run('M2-empty-string-releasedAt', [`--models=${path.join(mutDir, 'm2-models-empty-string.json')}`], '两处读数不一致');
run('M3-bad-registrySlug', [`--targets=${path.join(mutDir, 'm3-targets-bad-slug.json')}`], '不在 scripts/data/models.json');
run('M4-keep-degraded-no-whyKept', [`--source-rulings=${path.join(mutDir, 'rulings-m4-keep-degraded-no-whykept.json')}`], '必须写 whyKept');
run('M5-retire-still-registered', [`--source-rulings=${path.join(mutDir, 'rulings-m5-retire-still-registered.json')}`], '仍然挂在采集器注册表里');
run('M6-cf3-without-ruling', [`--source-rulings=${path.join(mutDir, 'rulings-m6-empty.json')}`], '没有在 scripts/data/source-rulings.json 里留下裁决');
run('M7-rulings-out-of-order', [`--source-rulings=${path.join(mutDir, 'rulings-m7-out-of-order.json')}`], '不是规范序');
run('M8-broken-json', [`--source-rulings=${path.join(mutDir, 'rulings-m8-broken.json')}`], '解析失败');
run('M9-illegal-decision', [`--source-rulings=${path.join(mutDir, 'rulings-m9-illegal-decision.json')}`], 'decision 非法');
run('M10-headless-migrate-no-stability', [`--source-rulings=${path.join(mutDir, 'rulings-m10-headless-no-stability.json')}`], '必须写 headlessStability');
run('M11-relative-evidence-url', [`--source-rulings=${path.join(mutDir, 'rulings-m11-relative-url.json')}`], '不是绝对地址');

/* ---------- 缺失路径（负控制）：必须在**一份没有 source-rulings.json 的沙箱**里跑 ---------- */
// 为什么要另给一个沙箱：workstream C 已在 11:59 落盘 scripts/data/source-rulings.json，
// 所以"缺失"这条路径只能在"落盘之前"的那份快照（S2 = t1 代码 + HEAD 数据，无该文件）上构造。
const noRulings = (argv.find(a => a.startsWith('--no-rulings-sandbox=')) || '').split('=').slice(1).join('=');
if (noRulings) {
  const bare = path.resolve(noRulings);
  const outFile = path.join(logDir, 'M12-missing-file.out.txt');
  const errFile = path.join(logDir, 'M12-missing-file.err.txt');
  const fdOut = fs.openSync(outFile, 'w');
  const fdErr = fs.openSync(errFile, 'w');
  const r = spawnSync(process.execPath, [path.join(bare, 'scripts/tools/coverage-report.js')],
    { cwd: bare, stdio: ['ignore', fdOut, fdErr] });
  fs.closeSync(fdOut); fs.closeSync(fdErr);
  const out = fs.readFileSync(outFile, 'utf8');
  const needles = ['尚未落盘', '未落盘 ≠ 通过', '报告自检待落盘层', 'source-rulings（长期失败来源的人工裁决）'];
  const missing = needles.filter(n => !out.includes(n));
  results.push({
    id: 'M12-missing-file', sandboxWithoutRulings: bare, expect: needles.join(' + '),
    exit: r.status, expectExitZero: true, hitExpectedString: missing.length === 0,
    hitLine: (out.split('\n').find(l => l.includes('尚未落盘')) || '(没命中)').trim().slice(0, 200),
    ok: r.status === 0 && missing.length === 0,
    note: missing.length ? `缺这些命中串：${missing.join(' / ')}` : '未落盘 ≠ 通过：exit 0 但显式计入自检口径'
  });
} else {
  run('M12-missing-file', [], '尚未落盘', { expectExitZero: true, note: '（未给 --no-rulings-sandbox=，在带 rulings 的沙箱里跑会走已落盘分支）' });
}

/* ---------- M1b：真改沙箱文件 → 必须红 → 逐字节还原 → sha 一致 ---------- */
const targetFile = path.join(sandbox, 'scripts/data/models.json');
const backupFile = path.join(mutDir, 'm1b-models-backup.json');
const shaBefore = sha(targetFile);
fs.copyFileSync(targetFile, backupFile);
const evil = JSON.parse(fs.readFileSync(path.join(mutDir, 'm1-models-unparsable.json'), 'utf8'));
fs.writeFileSync(targetFile, `${JSON.stringify(evil, null, 2)}\n`);
const mutatedSha = sha(targetFile);
run('M1b-inplace-mutated-then-restored', [], '解析不出可判日', { note: '直接改沙箱 scripts/data/models.json（不传 --models=）' });
fs.copyFileSync(backupFile, targetFile);
const shaAfter = sha(targetFile);
results.push({
  id: 'M1b-restore-proof',
  shaBefore, mutatedSha, shaAfter,
  restoredByteExact: shaBefore === shaAfter && shaBefore !== mutatedSha,
  ok: shaBefore === shaAfter && shaBefore !== mutatedSha
});

const summary = {
  sandbox,
  reviewDir,
  ranAt: new Date().toISOString(),
  cases: results,
  passed: results.filter(r => r.ok).length,
  failed: results.filter(r => !r.ok).length
};
fs.writeFileSync(path.join(mutDir, 'mutation-results.json'), `${JSON.stringify(summary, null, 2)}\n`);
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.id}  exit=${r.exit === undefined ? '-' : r.exit}  ${r.expect ? `expect「${r.expect}」` : ''}`);
  if (r.hitLine) console.log(`    命中：${r.hitLine}`);
  if (r.id === 'M1b-restore-proof') console.log(`    sha before=${r.shaBefore}\n    sha mutated=${r.mutatedSha}\n    sha after =${r.shaAfter}`);
}
console.log(`\n变异合计：${summary.passed} 通过 / ${summary.failed} 失败`);
process.exit(summary.failed ? 1 : 0);
