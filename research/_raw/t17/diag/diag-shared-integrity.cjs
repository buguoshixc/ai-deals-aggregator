// t17 诊断：谁改了共享树？把 GUARDED 清单与 git HEAD 逐条对账
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..');
const battery = JSON.parse(fs.readFileSync(path.join(__dirname, 'logs', 'battery.json'), 'utf8'));
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const shaFile = file => sha(fs.readFileSync(file));

console.log('battery.sharedTreeUnchanged =', battery.sharedTreeUnchanged);
console.log('\n=== 每个 GUARDED 文件：盘上 sha256 vs git HEAD sha256 ===');
for (const relative of battery.sharedGuarded) {
  const file = path.join(REPO, ...relative.split('/'));
  if (!fs.existsSync(file)) { console.log(`  [MISSING] ${relative}`); continue; }
  const onDisk = shaFile(file);
  let inGit = null;
  try {
    const buffer = execFileSync('git', ['show', `HEAD:${relative}`], { cwd: REPO, maxBuffer: 1 << 28 });
    inGit = sha(buffer);
  } catch (error) { inGit = `(not in HEAD: ${String(error.message).slice(0, 60)})`; }
  const same = onDisk === inGit;
  console.log(`  ${same ? '✓' : '✗'} ${relative.padEnd(42)} disk=${onDisk.slice(0, 12)} head=${String(inGit).slice(0, 12)}`);
  if (!same && typeof inGit === 'string' && inGit.length === 64) {
    // 差异有多大？给出行数级 diff 统计
    try {
      const stat = execFileSync('git', ['diff', '--numstat', 'HEAD', '--', relative], { cwd: REPO, encoding: 'utf8' }).trim();
      console.log(`       git diff --numstat: ${stat || '(no diff?!)'}`);
    } catch (error) { console.log('       diff 失败', error.message.slice(0, 80)); }
  }
}

console.log('\n=== 用例逐条 verdict / 恢复状态 ===');
for (const item of battery.results) {
  const bad = !item.allRestored;
  console.log(`  ${item.id.padEnd(5)} ${String(item.verdict).padEnd(20)} targets=${(item.targets || []).join(',')} ${bad ? '**恢复失败**' : ''}`);
  if (item.error) console.log(`         error: ${item.error}`);
  if (item.applied) console.log(`         applied: ${JSON.stringify(item.applied).slice(0, 220)}`);
  if (item.failingGates && item.failingGates.length) console.log(`         failing: ${item.failingGates.join(' ')}`);
}

console.log('\n=== NOT_CAUGHT / ERROR 用例的门禁输出 ===');
for (const item of battery.results) {
  if (!['NOT_CAUGHT', 'ERROR'].includes(item.verdict) && item.verdict !== 'GREEN(PASS)') continue;
  if (item.verdict === 'GREEN(PASS)') continue;
  console.log(`\n--- ${item.id} ${item.title}`);
  for (const gate of item.gates || []) {
    console.log(`   [${gate.id}] exit=${gate.exitCode} ${gate.durationMs}ms`);
    if (gate.assertions && gate.assertions.length) for (const line of gate.assertions.slice(0, 4)) console.log(`        · ${line}`);
  }
}
