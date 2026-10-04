// t17 追问：provenance 自测到底有没有"对真实数据"的牙？（M24 结论的支撑实验）
// 实验 T1：把一条真实记录的 evidence 引文改成编造文本 → 自测应红？（若绿 ⇒ 它只测合成夹具）
// 实验 T2：拔掉 check() 的失败入队 → 自测变绿（证明 M24 的变异确实生效，只是没牙抓它）
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SANDBOX = process.env.T17_SANDBOX || 'D:\\t17-mutation';
const GOLD = path.join(SANDBOX, 'gold');
const CASE = path.join(SANDBOX, 'cases', 't17-probe');
const fsx = fs;

function copy(from, to) {
  fsx.mkdirSync(to, { recursive: true });
  const result = spawnSync('robocopy', [from, to, '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:1', '/W:1',
    '/XD', 'node_modules', '.git', '.worktrees', '.agent-teams', 'research\\quality-closure'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (result.status === null || result.status >= 8) throw new Error(`robocopy ${result.status}`);
  const nm = path.join(to, 'node_modules');
  if (!fsx.existsSync(nm)) fsx.symlinkSync(path.resolve(__dirname, '..', '..', '..', 'node_modules'), nm, 'junction');
}

const run = (script, args = []) => spawnSync(process.execPath, [script, ...args], { cwd: CASE, encoding: 'utf8', maxBuffer: 1 << 26 });

const lines = [];
const say = line => lines.push(String(line));

// 建/刷新探测副本（从 gold 复制）
fsx.rmSync(CASE, { recursive: true, force: true });
copy(GOLD, CASE);
say(`探测副本：${CASE}`);

// 找一条带 evidence 的真实 deals 记录
const dealsFile = path.join(CASE, 'deals.json');
const deals = JSON.parse(fsx.readFileSync(dealsFile, 'utf8'));
const list = Array.isArray(deals) ? deals : (deals.deals || []);
const target = list.find(item => Array.isArray(item.evidence) && item.evidence.length && item.evidence[0].quote);
say(`实验目标记录：${target ? target.id : '(找不到带 evidence 的记录)'}`);
say(`原始引文：${target ? JSON.stringify(String(target.evidence[0].quote).slice(0, 120)) : '-'}`);

// 基线：自测应绿
const base = run('scripts/tools/provenance-selftest.js');
say(`\n[T0 基线] provenance-selftest exit=${base.status}`);
say(`  最后一行：${String(base.stdout || '').trim().split('\n').pop()}`);

if (target) {
  // T1：把引文改成编造文本（真正的"假引文"）
  const mutated = JSON.parse(JSON.stringify(deals));
  const mutatedList = Array.isArray(mutated) ? mutated : (mutated.deals || []);
  const mutatedTarget = mutatedList.find(item => item.id === target.id);
  mutatedTarget.evidence[0].quote = '完全编造的引文：官方原话从来没这么说';
  fsx.writeFileSync(dealsFile, `${JSON.stringify(mutated, null, 2)}\n`, 'utf8');
  const t1 = run('scripts/tools/provenance-selftest.js');
  say(`\n[T1 假引文] provenance-selftest exit=${t1.status}  ${t1.status === 0 ? '**仍然绿 ⇒ 没有对真实数据的牙**' : '红 ⇒ 有牙'}`);
  const tail = String(t1.stdout || '').trim().split('\n').slice(-6).join('\n');
  say(tail);
  fsx.copyFileSync(path.join(GOLD, 'deals.json'), dealsFile);
}

// T2：拔掉 check() 的失败入队（M24 的变异），确认变异本身生效
const selftest = path.join(CASE, 'scripts', 'tools', 'provenance-selftest.js');
const text = fsx.readFileSync(selftest, 'utf8');
const anchor = "  if (ok) { pass++; return; }\n  failures.push(`${name}${detail ? ' — ' + detail : ''}`);";
if (text.includes(anchor)) {
  fsx.writeFileSync(selftest, text.replace(anchor, "  if (ok) { pass++; return; }\n  // t17：吞掉失败"), 'utf8');
  const t2 = run('scripts/tools/provenance-selftest.js');
  say(`\n[T2 拔牙后] provenance-selftest exit=${t2.status}（应为 0：变异生效且没有任何门禁能抓它）`);
  say(`  最后一行：${String(t2.stdout || '').trim().split('\n').pop()}`);
  fsx.copyFileSync(path.join(GOLD, 'scripts', 'tools', 'provenance-selftest.js'), selftest);
} else {
  say('\n[T2] 锚点未命中（说明 M24 的变异锚点与真实文件不一致）');
}

// 对账：CASE 树已恢复？
const pairs = ['deals.json', 'scripts/tools/provenance-selftest.js'];
const crypto = require('crypto');
const sha = file => crypto.createHash('sha256').update(fsx.readFileSync(file)).digest('hex');
for (const relative of pairs) {
  const a = sha(path.join(GOLD, relative));
  const b = sha(path.join(CASE, relative));
  say(`\n[恢复核对] ${relative} byteExact=${a === b} ${a.slice(0, 12)} / ${b.slice(0, 12)}`);
}
fsx.writeFileSync(path.join(__dirname, 'probe-provenance-teeth.txt'), lines.join('\n') + '\n', 'utf8');
process.stdout.write(`written probe-provenance-teeth.txt\n`);
