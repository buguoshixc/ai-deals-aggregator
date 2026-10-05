#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */
/**
 * t3-make-synthetic-after.cjs —— 造一份「合成改动后」产物，用来给变异牙做自检（T3 脚手架，非交付结论）
 *
 * 为什么要有它：变异牙（M1–M5）的锚点必须落在**改动后**的页面文本上。真实改动后的 dist 由 T1 的
 * build 生成，但探针自检不该依赖别人的构建时序——这里把 Captain 的改动前快照按 T1 已落地的补丁
 * （逐字取自 worktree index.html 的 git diff）改一份到临时目录，作为**合成**参照物。
 * 合成物只用于验证「锚点唯一 + 牙咬得到」，T4 的正式复算必须跑真实的 dist。
 *
 * 用法：
 *   node research/_raw/leaf-detail-layout-v1/audit/t3-make-synthetic-after.cjs \
 *     --from=research/_raw/leaf-detail-layout-v1/baseline/baseline-dist
 *
 * 每一处替换都要求**恰好命中 1 次**：命中 0 次或 ≥2 次都判红退出（2），绝不「大概改了一下」。
 */

const fs = require('fs');
const path = require('path');

const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=(.*)$/.exec(a);
  if (m) args[m[1]] = m[2];
}
const FROM = path.resolve(process.cwd(), args.from || 'research/_raw/leaf-detail-layout-v1/baseline/baseline-dist');
// 默认落在探针旁边的 .tmp/（只在 research/_raw 下）：本机 %TEMP% 对 node 的 cpSync 报 EIO（Access denied）。
const TO = path.resolve(process.cwd(), args.to || path.join(__dirname, '.tmp', 'synthetic-after'));

/** T1 落地补丁的逐字文本（见 worktree `git diff -- index.html`）。 */
const EDITS = [
  {
    id: 'detail-main-rule',
    find: '    .dpane {\n      background: var(--card); border: 1px solid var(--line); border-radius: var(--r-dlg);\n',
    replace: '    .detail-main { width: min(1120px, 100%); margin-inline: auto; }\n    .dpane {\n      background: var(--card); border: 1px solid var(--line); border-radius: var(--r-dlg);\n'
  },
  {
    id: 'dpane-full-width',
    find: '      padding: var(--s4) var(--s4) var(--s2); max-width: 820px;\n',
    replace: '      padding: var(--s4) var(--s4) var(--s2); width: 100%; max-width: none;\n'
  },
  {
    id: 'dpane-more-margin',
    find: '    .dpane-src {\n',
    replace: '    .dpane-more { margin-top: var(--s3); }\n    .dpane-src {\n'
  },
  {
    id: 'dpane-src-full-width',
    find: '      margin-top: var(--s3); max-width: 820px; word-break: break-all;\n',
    replace: '      margin-top: var(--s3); width: 100%; max-width: none; word-break: normal; overflow-wrap: anywhere;\n'
  },
  {
    id: 'main-class',
    find: '    <main id="main">\n',
    replace: '    <main id="main" class="detail-main">\n'
  }
];

function listDirs(p) { try { return fs.readdirSync(p, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort(); } catch { return []; } }

function detailPages(root) {
  const pages = [];
  for (const id of listDirs(path.join(root, 'deal'))) pages.push({ kind: 'deal', file: path.join(root, 'deal', id, 'index.html') });
  for (const slug of listDirs(path.join(root, 'models'))) pages.push({ kind: 'models', file: path.join(root, 'models', slug, 'index.html') });
  return pages;
}

(function main() {
  if (!fs.existsSync(path.join(FROM, 'index.html'))) {
    console.error(`✗ --from=${FROM} 下没有 index.html`);
    process.exit(2);
  }
  fs.rmSync(TO, { recursive: true, force: true });
  try {
    fs.cpSync(FROM, TO, { recursive: true });
  } catch (err) {
    console.error(`✗ 复制失败（${TO}）：${(err && err.message) || err}\n  可用 --to=<可写目录> 换一个位置`);
    process.exit(2);
  }

  const pages = detailPages(TO);
  if (!pages.length) { console.error('✗ 副本里没有任何 deal/models 叶子页'); process.exit(2); }

  const report = [];
  let bad = 0;
  for (const p of pages) {
    let html = fs.readFileSync(p.file, 'utf8');
    const steps = [];
    for (const e of EDITS) {
      // 只对叶子详情页应用（首页 index.html 不在 pages 里）
      const re = new RegExp(e.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      const hits = (html.match(re) || []).length;
      if (hits !== 1) { bad++; steps.push({ id: e.id, hits, ok: false }); console.error(`✗ ${path.relative(TO, p.file)} ${e.id}: 命中 ${hits} 次（要求 1）`); continue; }
      html = html.replace(re, e.replace);
      steps.push({ id: e.id, hits, ok: true });
    }
    fs.writeFileSync(p.file, html, 'utf8');
    report.push({ page: path.relative(TO, p.file).split(path.sep).join('/'), kind: p.kind, steps });
  }
  console.log(`合成改动后产物：${TO}`);
  for (const r of report) console.log(`  ${r.kind.padEnd(6)} ${r.page}  ${r.steps.map(s => s.id + '×' + s.hits).join(', ')}`);
  console.log(bad ? `✗ 有 ${bad} 处锚点未唯一命中` : `✓ 全部锚点各命中 1 次（${pages.length} 个叶子页 × ${EDITS.length} 处改动）`);
  process.exit(bad ? 2 : 0);
})();
