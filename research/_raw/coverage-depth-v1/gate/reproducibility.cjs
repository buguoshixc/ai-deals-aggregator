#!/usr/bin/env node
/**
 * coverage-depth-v1：**可重建性对拍（build A / build B 全树逐字节）**。
 *
 * 题面 §73：build A → build B，全树逐字节对比，至少覆盖 models / plans / api-plans /
 * feeds / coverage JSON / freshness output。仓库里已有的 `check:*-reproducible` 各自只盯
 * 一条派生链（注册表→产物），本脚本补的是**整棵 dist 树**这一层：
 * 任何「构建期读了墙钟 / 读了 Map 迭代顺序 / 读了文件系统顺序」的漂移都会在这里现形。
 *
 * 隔离：用 `--out=dist.qc-repro-a` / `-b`（`.gitignore` 里 `dist.qc-` 前缀加斜杠的规则已覆盖），
 * 因此**不会碰到别人正在用的 dist/**；两次构建彼此也不共享临时目录。
 *
 * 用法：
 *   node research/_raw/coverage-depth-v1/gate/reproducibility.cjs [--label=final]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const args = process.argv.slice(2);
const flag = name => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const LABEL = flag('label') || 'run';
const OUT_DIR = path.join(ROOT, 'research', '_raw', 'coverage-depth-v1', 'gate', `repro-${LABEL}`);
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function build(outName) {
  const log = path.join(OUT_DIR, `build-${outName}.log`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const fd = fs.openSync(log, 'w');
  const started = Date.now();
  const result = spawnSync(process.execPath, ['scripts/tools/build-local.js', `--out=${outName}`], {
    cwd: ROOT, stdio: ['ignore', fd, fd], maxBuffer: 512 * 1024 * 1024
  });
  fs.closeSync(fd);
  return { exitCode: result.status, durationMs: Date.now() - started, log: path.relative(ROOT, log) };
}

function treeOf(dir) {
  const map = new Map();
  const walk = rel => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(next);
      else map.set(next, sha256(fs.readFileSync(path.join(dir, next))));
    }
  };
  walk('');
  return map;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();

  const buildA = build('dist.qc-repro-a');
  const buildB = build('dist.qc-repro-b');
  const dirA = path.join(ROOT, 'dist.qc-repro-a');
  const dirB = path.join(ROOT, 'dist.qc-repro-b');

  const summary = { label: LABEL, generatedAt: new Date().toISOString(), head, buildA, buildB };
  if (buildA.exitCode !== 0 || buildB.exitCode !== 0) {
    summary.verdict = 'BUILD_FAILED';
    fs.writeFileSync(path.join(OUT_DIR, 'reproducibility.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.error(`❌ 构建失败：A exit=${buildA.exitCode} / B exit=${buildB.exitCode}`);
    return 1;
  }

  const a = treeOf(dirA);
  const b = treeOf(dirB);
  const onlyA = [...a.keys()].filter(k => !b.has(k)).sort();
  const onlyB = [...b.keys()].filter(k => !a.has(k)).sort();
  const differing = [...a.keys()].filter(k => b.has(k) && a.get(k) !== b.get(k)).sort();

  summary.filesA = a.size;
  summary.filesB = b.size;
  summary.onlyInA = onlyA;
  summary.onlyInB = onlyB;
  summary.differing = differing.map(rel => ({ rel, shaA: a.get(rel), shaB: b.get(rel) }));
  summary.byteIdentical = onlyA.length === 0 && onlyB.length === 0 && differing.length === 0;
  summary.treeDigestA = sha256(Buffer.from([...a.entries()].sort().map(([k, v]) => `${k} ${v}`).join('\n'), 'utf8'));
  summary.treeDigestB = sha256(Buffer.from([...b.entries()].sort().map(([k, v]) => `${k} ${v}`).join('\n'), 'utf8'));
  summary.verdict = summary.byteIdentical ? 'BYTE_IDENTICAL' : 'DIVERGED';

  /* 题面 §73 点名的几类产物单独留读数，便于人工扫一眼 */
  const picks = ['models.json', 'plans.json', 'api-plans.json', 'feed.json', 'feed.xml', 'sitemap.xml', 'data/index.json',
    'model-registry-links.json', 'deal-history.json', 'plan-history.json', 'api-plan-history.json'];
  summary.namedArtifacts = Object.fromEntries(picks.map(rel => [rel, {
    inA: a.has(rel), inB: b.has(rel), shaA: a.get(rel) || null, shaB: b.get(rel) || null,
    equal: a.has(rel) && b.has(rel) && a.get(rel) === b.get(rel)
  }]));

  fs.writeFileSync(path.join(OUT_DIR, 'reproducibility.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`${summary.byteIdentical ? '✅' : '❌'} 可重建性：A ${a.size} 文件 / B ${b.size} 文件 · 仅 A ${onlyA.length} · 仅 B ${onlyB.length} · 内容不同 ${differing.length}`);
  console.log(`   tree digest A = ${summary.treeDigestA}`);
  console.log(`   tree digest B = ${summary.treeDigestB}`);
  if (differing.length) console.log(`   前 10 处差异：${differing.slice(0, 10).join(', ')}`);
  console.log(`   结果：${path.relative(ROOT, path.join(OUT_DIR, 'reproducibility.json'))}`);
  return summary.byteIdentical ? 0 : 1;
}

process.exit(main());
