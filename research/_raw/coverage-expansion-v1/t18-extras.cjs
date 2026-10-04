#!/usr/bin/env node
'use strict';
/**
 * t18 · 收尾验收（只读，产出全在 research/_raw/coverage-expansion-v1/**）：
 *   A 与 a4dd40f 的**逐文件哈希对账 + 每个变化的归因**
 *   B 静止树自证（跑这一轮前/后，全部已跟踪文件的 sha256 必须不变）
 *   C check-ci-consistency：裸跑必须 38/0；`--expect-checks=37` 必须红
 *   D 产物清点（页面/feed/manifest/目录分布）→ Baseline Integrity Diff 的六项
 * 注意：A/B 的"树静止"是相对于**本轮验收窗口**；队友的提交与我的产出会如实列出。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const WT = path.join(__dirname, '..', '..', '..');
const BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const OUT = path.join(WT, 'research/_raw/coverage-expansion-v1/t18-extras.json');
const git = args => spawnSync('git', ['-C', WT, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stdout.trim();
const read = rel => JSON.parse(fs.readFileSync(path.join(WT, rel), 'utf8'));
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

const out = { generatedAt: new Date().toISOString(), head: git(['rev-parse', 'HEAD']) };

/* ── B 静止树自证（先快照） ───────────────────────────────── */
// git 默认对非 ASCII 路径做 C 风格转义（"mockups\346..."），必须用 -z 拿原始字节，否则读文件 ENOENT
const tracked = spawnSync('git', ['-C', WT, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  .stdout.split('\0').filter(Boolean);
const hashAll = () => {
  const map = {};
  for (const f of tracked) {
    try { map[f] = sha(path.join(WT, f)); } catch (e) { map[f] = 'MISSING:' + e.code; }
  }
  return map;
};
const snapBefore = hashAll();
out.trackedCount = tracked.length;

/* ── A 与 a4dd40f 的逐文件对账 + 归因 ─────────────────────── */
{
  const rows = git(['diff', '--name-status', 'a4dd40f']).split('\n').filter(Boolean).map(l => {
    const parts = l.split(/\t/);
    return { status: parts[0], file: parts[parts.length - 1] };
  });
  const untracked = git(['status', '--porcelain']).split('\n').filter(l => l.startsWith('??')).map(l => l.slice(3));
  out.reconciliation = {
    baseline: 'a4dd40f',
    trackedChanged: rows.length,
    untrackedNew: untracked.length,
    files: rows.map(r => {
      const commits = git(['log', '--format=%h %s', 'a4dd40f..HEAD', '--', r.file]).split('\n').filter(Boolean);
      const dirty = git(['status', '--porcelain', '--', r.file]).trim();
      let bytes = null;
      try { bytes = fs.statSync(path.join(WT, r.file)).size; } catch { /* 见 status=D */ }
      return { status: r.status.trim(), file: r.file, bytes, lastCommit: commits[0] || null, commitCount: commits.length, uncommitted: dirty ? dirty.slice(0, 3) : null };
    }),
    untrackedList: untracked,
  };
  console.log('A 对账：已跟踪变化 ' + rows.length + ' 个文件 + 新增 ' + untracked.length + ' 个未跟踪路径');
}

/* ── C check-ci-consistency 两种口径 ─────────────────────── */
{
  const run = extra => spawnSync(process.execPath, [path.join(WT, 'scripts/tools/check-ci-consistency.js'), ...extra],
    { cwd: WT, encoding: 'utf8', env: { ...process.env, DSH_BASH: BASH }, maxBuffer: 32 * 1024 * 1024 });
  const bare = run([]);
  const pin37 = run(['--expect-checks=37']);
  const pin38 = run(['--expect-checks=38']);
  const pick = r => (((r.stdout || '') + (r.stderr || '')).split('\n').filter(l => /CI 口径检查|\(E\)/.test(l)).slice(0, 2).join(' ⏎ ').slice(0, 300));
  out.checkCi = {
    bare: { exit: bare.status, summary: pick(bare) },
    pin38: { exit: pin38.status, summary: pick(pin38) },
    pin37: { exit: pin37.status, summary: pick(pin37) },
    verifyYmlPin: (fs.readFileSync(path.join(WT, '.github/workflows/verify.yml'), 'utf8').match(/--expect-checks=(\d+)/) || [])[1],
    actionSteps: (fs.readFileSync(path.join(WT, '.github/actions/gate/action.yml'), 'utf8').match(/^\s+- name: /gm) || []).length,
  };
  console.log('C check-ci：裸跑 exit=' + bare.status + ' · --expect-checks=38 exit=' + pin38.status + ' · --expect-checks=37 exit=' + pin37.status);
}

/* ── D 产物清点 ───────────────────────────────────────────── */
{
  const baseline = read('research/_raw/coverage-expansion-v1/baseline.json');
  const dist = path.join(WT, 'dist');
  const files = [];
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(path.relative(dist, p).split(path.sep).join('/')); } };
  walk(dist);
  const html = files.filter(f => f.endsWith('.html'));
  const byDir = {};
  for (const f of html) { const seg = f.includes('/') ? f.split('/')[0] : '(root)'; byDir[seg] = (byDir[seg] || 0) + 1; }
  const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const deals = read('deals.json');
  const dealIds = deals.deals.filter(d => d.type === 'deal').map(d => d.id);
  const missingDealPages = dealIds.filter(id => !locs.some(u => u.includes('/deal/' + id + '/')));
  const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'data/index.json'), 'utf8'));

  out.inventory = {
    html: html.length, files: files.length, byDir,
    baseline: { html: baseline.site.distHtmlPages, files: baseline.site.distTotalFiles, sitemap: baseline.site.sitemapEntries, feeds: baseline.site.feedFiles },
    sitemap: locs.length, feeds: files.filter(f => f.startsWith('feed') || f.startsWith('feed/')).length,
    dealDetailPages: byDir.deal || 0, vendorPages: byDir.vendor || 0, modelPages: byDir.models || 0,
    dealPagesInSitemap: dealIds.length - missingDealPages.length,
    missingDealPages: missingDealPages.slice(0, 5),
    manifestKeys: Object.keys(manifest),
    manifestFileBytes: fs.statSync(path.join(dist, 'data/index.json')).size,
    deltaHtml: html.length - baseline.site.distHtmlPages,
    deltaSitemap: locs.length - baseline.site.sitemapEntries,
  };
  console.log('D 清点：HTML ' + html.length + '（基线 ' + baseline.site.distHtmlPages + '）· sitemap ' + locs.length
    + '（基线 ' + baseline.site.sitemapEntries + '）· vendor ' + byDir.vendor + ' · deal ' + byDir.deal);
}

/* ── B 收尾快照 ───────────────────────────────────────────── */
const snapAfter = hashAll();
const changedDuring = tracked.filter(f => snapBefore[f] !== snapAfter[f]);
out.staticTree = {
  trackedFiles: tracked.length,
  changedDuringRun: changedDuring,
  static: changedDuring.length === 0,
  headStable: git(['rev-parse', 'HEAD']) === out.head,
  note: '窗口 = 本脚本执行期间；队友提交或我自己的产出会出现在 changedDuringRun 里（如实列出）',
};
out.headAfter = git(['rev-parse', 'HEAD']);
out.statusAfter = git(['status', '--porcelain']).split('\n').filter(Boolean);

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('B 静止树：已跟踪 ' + tracked.length + ' 个文件，窗口内变化 ' + changedDuring.length + ' 个 · HEAD 稳定=' + out.staticTree.headStable);
console.log('结果已写：research/_raw/coverage-expansion-v1/t18-extras.json');
