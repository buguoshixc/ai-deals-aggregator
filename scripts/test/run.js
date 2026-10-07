#!/usr/bin/env node
'use strict';
/**
 * 分层跑测试 / 跑完整门禁（**本地与 CI 同一条链**）。
 *
 * 用法：
 *   node scripts/test/run.js --list                 列出各层与成员
 *   node scripts/test/run.js --layer=L1             跑单层（L1 / L2 / L3 / L4 / L5）
 *   node scripts/test/run.js --layers=L1,L2         跑多层
 *   node scripts/test/run.js --gate                 跑**门禁本体**（见下）
 *   node scripts/test/run.js --mutations            打印变异牙清单（从源码派生）
 *
 * ## `--gate` 为什么要读 action.yml，而不是另写一份步骤清单
 *
 * 这一轮之前，仓库里**没有**「本地跑一遍 CI 门禁」的入口：48 个步骤只存在于
 * `.github/actions/gate/action.yml`（bash 复合 action）。于是「本地全绿、推上去才红」
 * （或反过来）是结构性风险，而且没人能回答「CI 到底跑了什么」。
 *
 * 修法不是把步骤抄一份到 package.json —— 那会立刻产生两份会漂移的清单。
 * 这里**解析 action.yml 本身**（唯一出处），按顺序执行其中的 `node <script>` 步骤：
 *   · 非 node 步骤（`npm ci`、浏览器探测、Summary 输出）跳过并**明确列出**跳过原因；
 *   · 用 `--dir=` 的步骤原样传参；
 *   · 任何一步非 0 立即停（与 CI 的 fail-fast 一致），并打印该步的最后几行输出。
 *
 * 于是「本地 gate == CI gate」不是因为大家记得同步，而是因为**只有一份步骤定义**。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const layers = require('./layers');

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);

function label(text) { return `\n=== ${text} ===`; }

/** 用 npm 跑一个 script（走 package.json，不复制命令） */
function runScript(name, extraArgs = []) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const cmd = pkg.scripts[name];
  if (!cmd) return { ok: false, missing: true, ms: 0 };
  const t0 = Date.now();
  const r = spawnSync(cmd + (extraArgs.length ? ' ' + extraArgs.join(' ') : ''), {
    cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  return { ok: r.status === 0, ms: Date.now() - t0, out: (r.stdout || '') + (r.stderr || '') };
}

function runLayers(names) {
  const results = [];
  for (const name of names) {
    const def = layers.LAYERS[name];
    if (!def) { console.error(`未知的层「${name}」`); process.exit(2); }
    console.log(label(`${name} · ${def.label}`));
    if (def.needs.length) console.log(`  前提：${def.needs.join(' · ')}`);
    for (const script of def.scripts) {
      const r = runScript(script);
      if (r.missing) { console.log(`  ✗ ${script.padEnd(32)} —— package.json 里没有这个 script`); results.push({ name, script, ok: false }); continue; }
      console.log(`  ${r.ok ? '✓' : '✗'} ${String((r.ms / 1000).toFixed(1)).padStart(6)}s  ${script}`);
      results.push({ name, script, ok: r.ok, ms: r.ms });
      if (!r.ok) {
        console.log(`      ── 最后 12 行输出 ──`);
        for (const line of r.out.trim().split('\n').slice(-12)) console.log('      ' + line);
        summary(results);
        console.log(`\n❌ ${name} 在「${script}」处失败（与 CI 一样 fail-fast，不继续跑后面的层）`);
        process.exit(1);
      }
    }
  }
  summary(results);
}

function summary(results) {
  const total = results.reduce((a, r) => a + (r.ms || 0), 0);
  const failed = results.filter(r => !r.ok);
  console.log(`\n合计 ${(total / 1000).toFixed(1)}s / ${results.length} 个脚本，失败 ${failed.length}`);
}

// ---------------------------------------------------------------- gate

/** 解析 action.yml：步骤名 + run 体（唯一出处） */
function parseGateSteps() {
  const text = fs.readFileSync(path.join(ROOT, '.github', 'actions', 'gate', 'action.yml'), 'utf8');
  const lines = text.split(/\r?\n/);
  const steps = [];
  let cur = null;
  let blockIndent = null;
  for (const l of lines) {
    const nm = l.match(/^\s*-\s*name:\s*(.+?)\s*$/);
    if (nm) { if (cur) steps.push(cur); cur = { name: nm[1].replace(/^['"]|['"]$/g, ''), run: null }; blockIndent = null; continue; }
    if (!cur) continue;
    const inline = l.match(/^\s*run:\s*(.+?)\s*$/);
    if (inline && !/^[|>]/.test(inline[1])) { cur.run = inline[1]; blockIndent = null; continue; }
    const block = l.match(/^(\s*)run:\s*[|>]\s*$/);
    if (block) { blockIndent = block[1].length + 2; cur.run = ''; continue; }
    if (blockIndent !== null) {
      const indent = l.length - l.trimStart().length;
      if (l.trim() === '' || indent >= blockIndent) { cur.run += (cur.run ? '\n' : '') + l.slice(blockIndent); continue; }
      blockIndent = null;
    }
  }
  if (cur) steps.push(cur);
  return steps;
}

function runGate() {
  const steps = parseGateSteps();
  console.log(`门禁步骤（读自 .github/actions/gate/action.yml）：${steps.length} 个`);
  const results = [];
  const skipped = [];
  let n = 0;
  for (const s of steps) {
    n++;
    const cmds = [];
    for (const raw of (s.run || '').split('\n')) {
      const m = raw.trim().match(/^node\s+(scripts\/[A-Za-z0-9_\-./]+\.js)(.*)$/);
      if (m) cmds.push({ script: m[1], args: m[2].trim() });
    }
    if (!cmds.length) { skipped.push(s.name); continue; }
    const t0 = Date.now();
    let ok = true, tail = '';
    for (const c of cmds) {
      const args = c.args ? c.args.split(/\s+/).filter(Boolean) : [];
      const r = spawnSync(process.execPath, [c.script, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
      if (r.status !== 0) { ok = false; tail = ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-12).join('\n      '); break; }
    }
    const ms = Date.now() - t0;
    console.log(`  ${ok ? '✓' : '✗'} ${String((ms / 1000).toFixed(1)).padStart(7)}s  [${String(n).padStart(2)}] ${s.name}`);
    results.push({ name: s.name, ms, ok });
    if (!ok) {
      console.log(`      ${tail}`);
      summary(results);
      console.log(`\n❌ 门禁在「${s.name}」处失败`);
      process.exit(1);
    }
  }
  summary(results);
  if (skipped.length) {
    console.log(`\n跳过的 ${skipped.length} 个非 node 步骤（本地无意义或需要 bash/网络）：`);
    for (const s of skipped) console.log(`  · ${s}`);
  }
  console.log('\n✅ 本地门禁链全过（与 CI 读同一份 action.yml）');
}

// ---------------------------------------------------------------- main

const listOnly = process.argv.includes('--list');
if (listOnly) {
  for (const [name, def] of Object.entries(layers.LAYERS)) {
    console.log(`${name} · ${def.label}  （${def.scripts.length} 个）`);
    if (def.needs.length) console.log(`   前提：${def.needs.join(' · ')}`);
    for (const s of def.scripts) console.log(`     - ${s}`);
  }
  const inv = layers.mutationInventory(ROOT);
  console.log(`\nL6 · 变异牙清单（共 ${inv.length} 个文件带牙，从源码派生）`);
  for (const m of inv) console.log(`     - ${m.file}  （命中 ${m.anchors}）`);
  process.exit(0);
}
if (process.argv.includes('--mutations')) {
  const inv = layers.mutationInventory(ROOT);
  console.log(`变异牙清单（从源码派生，分类登记见 docs/TESTING.md）：${inv.length} 个文件`);
  for (const m of inv) console.log(`  · ${m.file}（命中 ${m.anchors}）`);
  process.exit(0);
}
if (process.argv.includes('--gate')) { runGate(); process.exit(0); }

const single = arg('layer');
const multi = arg('layers');
const names = single ? [single] : (multi ? multi.split(',').map(s => s.trim()) : ['L1', 'L2']);
runLayers(names);
console.log('\n✅ 全部通过');
