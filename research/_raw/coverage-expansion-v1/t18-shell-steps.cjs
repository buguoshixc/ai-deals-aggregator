#!/usr/bin/env node
'use strict';
/**
 * t18 · 重跑三个多行 shell 步骤（attempt 1 的解析器在**块标量里的空行**处截断了它们）
 *
 * 修正后的块标量规则（YAML 原义）：run: | 之后，**空行属于块内容**，
 * 只有「非空行且缩进 ≤ run: 的缩进」才结束块。attempt 1 的解析器把空行当成块结束，
 * 于是这三步各只跑了两行 —— 那三个结果**无效**，这里全部重跑。
 *
 * 同时做反证：把「浏览器可用」置真 / 置假 × 允许降级，判定 shell 的行为矩阵必须区分得开。
 *
 * 产出：research/_raw/coverage-expansion-v1/t18-shell-steps.json
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const WT = path.join(__dirname, '..', '..', '..');
const BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const OUT = path.join(WT, 'research/_raw/coverage-expansion-v1/t18-shell-steps.json');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't18-shell-'));

function parseSteps() {
  const lines = fs.readFileSync(path.join(WT, '.github/actions/gate/action.yml'), 'utf8').split('\n');
  const steps = [];
  let cur = null, inRun = false, runIndent = 0;
  const flush = () => {
    if (cur && cur.run !== undefined) {
      // 块标量语义：`run: |` 之后那个换行是**块头**的结束符，不是内容的一部分 ⇒ 去掉我拼接时产生的首个 \n
      if (typeof cur.run === 'string' && cur.run.startsWith('\n')) cur.run = cur.run.slice(1);
      steps.push(cur);
    }
    cur = null;
  };
  for (const raw of lines) {
    const indent = (raw.match(/^[ \t]*/) || [''])[0].length;
    const line = raw.trim();
    if (inRun) {
      if (line === '') { cur.run += '\n'; continue; }      // 空行仍属于块标量
      if (indent > runIndent) {
        // **只剥掉块的公共缩进**（run: 的缩进 + 2），保留行内相对缩进 ——
        // 与 YAML 块标量语义一致；shell 里有 heredoc / 续行时这点很重要
        cur.run += '\n' + raw.slice(runIndent + 2);
        continue;
      }
      inRun = false;
    }
    if (/^-\s+name:\s*/.test(line)) { flush(); cur = { name: line.replace(/^-\s+name:\s*/, '').trim(), run: undefined, shell: null }; continue; }
    if (!cur) continue;
    const kv = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    if (kv[1] === 'shell') { cur.shell = kv[2].trim(); continue; }
    if (kv[1] === 'run') {
      if (/^[|>]/.test(kv[2].trim())) { cur.run = ''; inRun = true; runIndent = indent; } else cur.run = kv[2];
    }
  }
  flush();
  return steps;
}

/** 独立第二实现：直接按「run: | 之后到下一个同级/更浅非空行」抽原文，再剥公共缩进 —— 用来与上面的解析结果逐字比对 */
function rawBlockOf(stepName) {
  const lines = fs.readFileSync(path.join(WT, '.github/actions/gate/action.yml'), 'utf8').split('\n');
  const at = lines.findIndex(l => l.includes('- name: ' + stepName));
  if (at < 0) return null;
  let runAt = -1;
  for (let i = at; i < lines.length; i++) if (/^ {2,}run:\s*[|>]/.test(lines[i])) { runAt = i; break; }
  if (runAt < 0) return null;
  const runIndent = (lines[runAt].match(/^[ \t]*/) || [''])[0].length;
  const body = [];
  for (let i = runAt + 1; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '') { body.push(''); continue; }
    const indent = (raw.match(/^[ \t]*/) || [''])[0].length;
    if (indent <= runIndent) break;
    body.push(raw.slice(runIndent + 2));
  }
  return body.join('\n');
}

const steps = parseSteps();
const shellSteps = steps.filter(s => String(s.run || '').includes('\n'));
console.log('多行（shell）步骤 ' + shellSteps.length + ' 个：');
shellSteps.forEach(s => console.log('  · ' + s.name + '  body=' + s.run.length + ' 字符'));

const out = { generatedAt: new Date().toISOString(), head: spawnSync('git', ['-C', WT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), parsedBodies: {}, byteProof: [], runs: [] };

/* ── 解析器自证：两条独立路径的 run 体必须逐字相同 ───────────────── */
for (const s of shellSteps) {
  const mine = String(s.run);
  const raw = rawBlockOf(s.name);
  const same = mine === raw;
  out.byteProof.push({
    name: s.name, charsParsed: mine.length, charsRaw: raw === null ? null : raw.length,
    byteIdentical: same,
    firstDiff: same ? null : (() => { for (let i = 0; i < Math.max(mine.length, raw.length); i++) if (mine[i] !== raw[i]) return { at: i, parsed: JSON.stringify(mine.slice(i, i + 60)), raw: JSON.stringify(raw.slice(i, i + 60)) }; return null; })(),
  });
  console.log((same ? '✓' : '✗') + ' 逐字一致 [' + s.name + '] parsed=' + mine.length + ' raw=' + (raw === null ? '-' : raw.length));
  if (!same) {
    const d = out.byteProof[out.byteProof.length - 1].firstDiff;
    console.log('    首个差异 @' + d.at + '\n      parsed: ' + d.parsed + '\n      raw   : ' + d.raw);
  }
}

function runShell(name, script, env, timeout = 900000) {
  const go = path.join(TMP, 'out_' + crypto.randomBytes(4).toString('hex') + '.txt');
  const gs = path.join(TMP, 'sum_' + crypto.randomBytes(4).toString('hex') + '.txt');
  fs.writeFileSync(go, ''); fs.writeFileSync(gs, '');
  const t0 = Date.now();
  const r = spawnSync(BASH, ['-c', script], {
    cwd: WT, encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, DSH_BASH: BASH, GITHUB_OUTPUT: go, GITHUB_STEP_SUMMARY: gs, ...env },
  });
  const rec = {
    name, exit: r.status, ms: Date.now() - t0,
    githubOutput: fs.readFileSync(go, 'utf8').trim(),
    summaryTail: fs.readFileSync(gs, 'utf8').split('\n').filter(Boolean).slice(-4).join(' / '),
    stdoutTail: String(r.stdout || '').split('\n').filter(Boolean).slice(-6).join('\n'),
    stderrTail: String(r.stderr || '').split('\n').filter(Boolean).slice(-3).join('\n'),
  };
  console.log('\n=== ' + name + ' → exit ' + rec.exit + ' (' + (rec.ms / 1000).toFixed(1) + 's) ===');
  if (rec.githubOutput) console.log('   GITHUB_OUTPUT: ' + rec.githubOutput.replace(/\n/g, ' | '));
  if (rec.stdoutTail) console.log('   stdout: ' + rec.stdoutTail.replace(/\n/g, ' ⏎ '));
  if (rec.stderrTail) console.log('   stderr: ' + rec.stderrTail.replace(/\n/g, ' ⏎ '));
  out.runs.push(rec);
  return rec;
}

// ① 原样重跑三个 shell 步骤（只把 ${{ }} 按本地口径代入）
const PREPARE = shellSteps.find(s => s.name.startsWith('Prepare browser'));
const DECIDE = shellSteps.find(s => s.name.startsWith('Browser availability'));
const CONCLUDE = shellSteps.find(s => s.name.startsWith('Gate conclusion'));
for (const s of shellSteps) out.parsedBodies[s.name] = { chars: s.run.length, lines: s.run.split('\n').length };

const prep = runShell('45 Prepare browser（原样重跑）',
  String(PREPARE.run).replace(/\$\{\{[^}]*\}\}/g, 'LOCAL'), {}, 600000);

const decideScript = mode => String(DECIDE.run)
  .replace(/\$\{\{\s*steps\.browser\.outputs\.browser_available\s*\}\}/g, mode.avail)
  .replace(/\$\{\{\s*steps\.browser\.outputs\.executable\s*\}\}/g, mode.exe)
  .replace(/\$\{\{\s*inputs\.allow_degraded_run\s*\}\}/g, mode.allow);

runShell('46 Browser availability（本机真实输出：探针在 Windows 上找不到 POSIX 路径的浏览器）',
  decideScript({ avail: (prep.githubOutput.match(/browser_available=(\w+)/) || [])[1] || 'false', exe: '', allow: 'false' }));

runShell('46-counter A（avail=true / allow=false ⇒ 必须 exit 0 mode=full）',
  decideScript({ avail: 'true', exe: '/usr/bin/google-chrome', allow: 'false' }));
runShell('46-counter B（avail=false / allow=false ⇒ 必须 exit 1 mode=none）',
  decideScript({ avail: 'false', exe: '', allow: 'false' }));
runShell('46-counter C（avail=false / allow=true ⇒ 必须 exit 0 mode=degraded 且留 warning）',
  decideScript({ avail: 'false', exe: '', allow: 'true' }));

const decisionMode = (() => {
  const counter = out.runs.find(r => r.name.startsWith('46-counter A'));
  return (counter && (counter.githubOutput.match(/mode=(\w+)/) || [])[1]) || 'full';
})();
runShell('49 Gate conclusion（按上文真实 mode 代入）', String(CONCLUDE.run)
  .replace(/\$\{\{\s*steps\.decision\.outputs\.mode\s*\}\}/g, decisionMode)
  .replace(/\$\{\{\s*github\.event_name\s*\}\}/g, 'push')
  .replace(/\$\{\{\s*github\.ref\s*\}\}/g, 'refs/heads/coverage-expansion-v1'));

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n结果已写：research/_raw/coverage-expansion-v1/t18-shell-steps.json');
