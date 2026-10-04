#!/usr/bin/env node
/**
 * t35 / M24 **注入反证**：给一条**真实记录**的 `evidence[].quote` 塞进元自称「（逐字）」，
 * `validate --strict` 必须红、且必须点名那个字段；对照组（不注入）必须绿。
 *
 * 全程在 `git ls-files` 复制出来的 TEMP 沙箱里做（见 sandbox.cjs），跑完删副本；
 * 共享 worktree 的 deals.json / validate.js 用 sha256 前后比对，证明**一个字节都没动**。
 *
 * 为什么必须做这一条：判据写进了 validate.js 不等于牙有牙 —— 接线漏了、守卫没被调到、
 * 或者命中之后只 warn 不 error，都会让这条判据变成"看起来有牙"。所以这里跑的是
 * **完整的生产门禁**（真脚本、真 exit code、真 stderr），不是单元级调用。
 *
 * 用法：node research/_raw/t35/inject-selfclaim-counter.cjs
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { ROOT, makeSandbox, runIn, sha256File, remove } = require('./sandbox.cjs');

const RECORD_ID = '4987c183fc1a';   // t17 独立实验用的同一条真实记录（360智脑，1 条引文）
const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || !detail ? '' : ` —— ${detail}`}`);
  if (!ok) failures.push(name);
}

const sharedDeals = path.join(ROOT, 'deals.json');
const sharedValidate = path.join(ROOT, 'scripts', 'validate.js');
const before = { deals: sha256File(sharedDeals), validate: sha256File(sharedValidate) };

const sandbox = makeSandbox('m24');
console.log(`沙箱：${sandbox.dir}（复制跟踪文件 ${sandbox.files} 个）`);

let exitCode = 1;
try {
  /* ---- 对照：未注入 ---- */
  const control = runIn(sandbox.dir, 'scripts/validate.js', ['--strict']);
  const controlScan = (control.stdout.match(/引文自称扫描\s*:\s*(\d+) 条 quote \/ (\d+) 篇文件 · (\d+) 命中/) || []);
  console.log(`\n① 对照（未注入）：exit ${control.status} · ${controlScan[0] || '（没抓到扫描读数行）'}`);
  check('对照组 validate --strict 退出码 0', control.status === 0, control.stderr.trim().split('\n').slice(-3).join(' '));
  check('对照组日志里有扫描读数行（0 命中也要看得见）', controlScan.length === 4 && controlScan[3] === '0', controlScan[0] || '缺读数行');
  check('对照组不报「元自称」', !/元自称/.test(control.stderr));

  /* ---- 注入 ---- */
  const dealsPath = path.join(sandbox.dir, 'deals.json');
  const doc = JSON.parse(fs.readFileSync(dealsPath, 'utf8'));
  const index = doc.deals.findIndex(record => record && record.id === RECORD_ID);
  check(`沙箱里能找到真实记录 ${RECORD_ID}`, index >= 0);
  const record = doc.deals[index];
  check(`该记录有 evidence[0].quote 可供注入`, Boolean(record && record.evidence && record.evidence[0] && typeof record.evidence[0].quote === 'string'));
  const originalQuote = record.evidence[0].quote;
  const MAX = 200; // provenance.MAX_EVIDENCE_QUOTE_LENGTH：注入后不许因超长而红（那会变成另一条判据的红）
  const injected = originalQuote.length + 4 <= MAX ? `${originalQuote}（逐字）` : `${originalQuote.slice(0, MAX - 4)}（逐字）`;
  record.evidence[0].quote = injected;
  fs.writeFileSync(dealsPath, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`\n② 注入：deals[${index}].evidence[0].quote 末尾追加「（逐字）」（${originalQuote.length} → ${injected.length} 字，仍 ≤ ${MAX}）`);

  const mutated = runIn(sandbox.dir, 'scripts/validate.js', ['--strict']);
  const problems = mutated.stderr.split('\n').filter(line => line.trim().startsWith('- ')).map(line => line.trim().slice(2));
  console.log(`   注入后：exit ${mutated.status} · 自检问题 ${problems.length} 处`);
  problems.slice(0, 3).forEach(text => console.log(`     · ${text}`));

  check('注入后 validate --strict 退出码非 0', mutated.status !== 0, `exit ${mutated.status}`);
  check('注入后报「元自称」这条判据（不是别的判据顺手变红）',
    problems.some(text => /元自称/.test(text)), problems.slice(0, 2).join(' | ') || '没有这条问题');
  check('注入后**点名了那条记录的字段路径**（deals.json deals[130].evidence[0].quote）',
    problems.some(text => text.includes(`deals.json deals[${index}].evidence[0].quote`)), problems.slice(0, 2).join(' | '));
  check('注入后点名了「逐字」这个形态', problems.some(text => /逐字/.test(text)));
  check('注入后不再打印成功行（失败就是失败）', !/校验通过/.test(mutated.stdout));

  /* ---- 复原：证明红色确实来自这次注入 ---- */
  record.evidence[0].quote = originalQuote;
  fs.writeFileSync(dealsPath, `${JSON.stringify(doc, null, 2)}\n`);
  const restored = runIn(sandbox.dir, 'scripts/validate.js', ['--strict']);
  check('复原后沙箱回到绿（红色确实来自注入，不是环境本来就红）', restored.status === 0,
    restored.stderr.trim().split('\n').slice(-2).join(' '));
  check('沙箱复原后 deals.json 与共享树逐字节相同', sha256File(dealsPath) === before.deals);
} finally {
  remove(sandbox.dir);
}

/* ---- 共享树未被触碰 ---- */
const after = { deals: sha256File(sharedDeals), validate: sha256File(sharedValidate) };
check('共享 worktree 的 deals.json 逐字节未动', after.deals === before.deals, `${before.deals} → ${after.deals}`);
check('共享 worktree 的 scripts/validate.js 逐字节未动', after.validate === before.validate);

console.log(`\n=== t35 / M24 注入反证：${failures.length ? `${failures.length} 项不成立` : '全部成立（塞进「逐字」⇒ validate --strict 必红并点名该字段）'} ===`);
if (failures.length) {
  failures.forEach(name => console.log(`  ✗ ${name}`));
  exitCode = 1;
} else {
  exitCode = 0;
}
process.exit(exitCode);
