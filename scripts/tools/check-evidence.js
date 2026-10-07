#!/usr/bin/env node
'use strict';
/**
 * 证据政策门禁（Tier-3 拦截）—— 见 `docs/EVIDENCE-POLICY.md`。
 *
 * ## 它解决什么
 *
 * `.gitignore` 只能拦**还没被跟踪**的文件；一个已经 `git add` 的文件不会因为它被忽略而消失。
 * 而 `.gitignore` 里原先靠**逐目录白名单**（v3.0-sources/html、coverage-depth-v1/release-evidence/raw、
 * 各 shots 目录…）兜底 —— 每开一个新任务都要人工补一条，漏补的症状是「几十 MB 的第三方正文
 * 静默进了仓库」，且**没有任何门禁会红**。
 *
 * ## 判据（两份输入，一份清单）
 *
 *   输入 A：`git ls-files` —— 当前**已跟踪**的全部文件；
 *   输入 B：`scripts/data/evidence-tier3-grandfather.txt` —— 基线时已跟踪的 Tier-3 文件**清单**。
 *
 *   判定：`已跟踪 ∩ Tier-3 类别` − 清单 = ∅。非空 ⇒ **硬失败**并打印每个文件的正确去向。
 *
 * ## 为什么清单要**提交进仓库**，而不是每次去问 git 历史
 *
 * 第一版直接跑 `git ls-tree -r <baseline>` 取基线集合 —— 本地全绿，**CI 立刻红**：
 * `actions/checkout@v5` 默认 `fetch-depth: 1`（浅克隆），基线提交根本不在那个克隆里。
 * 工具当时**按设计拒绝静默放行**（这一点是对的），但结果是门禁在 CI 里跑不起来。
 *
 * 改成「提交一份基线清单」之后：
 *   · CI 不需要历史 ⇒ 判据在**没有历史**的地方也**全强度**生效（新文件照样被拦）；
 *   · 清单像 lockfile 一样是**可评审的基线产物**，改它是一次显式、可见的动作；
 *   · 本地（有完整历史时）**额外自证**清单没被悄悄改过：把清单与
 *     `git ls-tree -r <baseline>` 的交集逐项比对，不一致即红。
 *     这一步在浅克隆里会**明确打印「跳过 + 原因」**，而不是假装跑过。
 *
 * 用法：
 *   node scripts/tools/check-evidence.js                  # 门禁用
 *   node scripts/tools/check-evidence.js --report         # 只报告分布（恒 0 退出）
 *   node scripts/tools/check-evidence.js --write          # 重新生成清单（需要完整历史；仅在有意改基线时用）
 *   node scripts/tools/check-evidence.js --baseline=<sha> # 换一个自证边界
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LIST_FILE = path.join(ROOT, 'scripts', 'data', 'evidence-tier3-grandfather.txt');

/**
 * 清单的自证边界：本轮架构现代化的起点（`origin/master` 在开局时的那一个提交）。
 *
 * 为什么写成常量而不是「policy 文档被加入的那个提交」：后者是自指的 ——
 * 只要有人移动/重命名那份文档，边界就悄悄变了，而**边界变了没有任何东西会红**。
 * 常量 + `--baseline=` 覆盖是显式且可审计的。
 */
const DEFAULT_BASELINE = 'e0ca04a';

/**
 * Tier-3 类别（与 `docs/EVIDENCE-POLICY.md` §3 的 `.gitignore` 类别规则一一对应）。
 * 每一条都要能回答「它是什么、为什么只该留本机」。
 */
const TIER3 = [
  { re: /^research\/_raw\/.*\.txt$/, what: '抓下来的正文/中间 dump', to: 'CI Artifact（Tier 2）或本机 scratch' },
  { re: /^research\/_raw\/.*\.log$/, what: '完整日志', to: 'CI Artifact（Tier 2）' },
  { re: /^research\/_raw\/.*\.cjs$/, what: '一次性探针脚本', to: '结论进 Tier 1 后即可弃；仍需者请在 README.md 点名' },
  { re: /(^|\/)scratch\//, what: '临时 scratch 目录', to: '本机（已在 .gitignore）' }
];

const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const BASELINE = arg('baseline') || DEFAULT_BASELINE;
const reportOnly = process.argv.includes('--report');
const writeMode = process.argv.includes('--write');

const git = args => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf8');
const tierOf = f => TIER3.find(t => t.re.test(f));

const tracked = git(['ls-files']).split('\n').filter(Boolean);
const trackedTier3 = tracked.filter(tierOf);

/** 读清单（容忍注释行与空行） */
function readList() {
  if (!fs.existsSync(LIST_FILE)) return null;
  const raw = fs.readFileSync(LIST_FILE, 'utf8').split('\n');
  const header = {};
  const entries = [];
  for (const line of raw) {
    const h = line.match(/^#\s*([a-zA-Z-]+):\s*(.*)$/);
    if (h) { header[h[1]] = h[2].trim(); continue; }
    if (line.trimStart().startsWith('#')) continue;   // 散文注释行（不带 `key:`）不是条目
    const t = line.trim();
    if (t) entries.push(t);
  }
  return { header, entries, set: new Set(entries) };
}

// ---------------------------------------------------------------- --write

if (writeMode) {
  let baselineSet;
  try {
    baselineSet = new Set(git(['ls-tree', '-r', '--name-only', BASELINE]).split('\n').filter(Boolean));
  } catch (e) {
    console.error(`❌ --write 需要完整历史（取不到 ${BASELINE}）：${e.message.split('\n')[0]}`);
    console.error('   请在有历史的检出里跑（CI 的浅克隆不能重新生成清单）。');
    process.exit(1);
  }
  const entries = trackedTier3.filter(f => baselineSet.has(f)).sort();
  const out = [
    '# 证据政策 · Tier-3 grandfather 清单（见 docs/EVIDENCE-POLICY.md §5）',
    '#',
    '# 这是**基线产物**（像 lockfile）：基线时已跟踪、按政策属于 Tier-3 的文件全在这里。',
    '# 判定 = `git ls-files ∩ Tier-3 类别` − 本清单 = ∅；非空即门禁失败。',
    '#',
    '# 为什么清单进仓库而不是每次问 git 历史：CI 用 actions/checkout 的浅克隆（fetch-depth: 1），',
    '# 基线提交不在那个克隆里 —— 第一版直接跑 git ls-tree，本地全绿、CI 立刻红。',
    '# 有了这份清单，判据在**没有历史**的地方也**全强度**生效；本地有历史时会额外自证清单没被改过。',
    '#',
    '# 只在**有意改基线**时用 `node scripts/tools/check-evidence.js --write` 重新生成（需要完整历史）。',
    `# baseline: ${BASELINE}`,
    `# count: ${entries.length}`,
    '',
    ...entries
  ].join('\n') + '\n';
  fs.writeFileSync(LIST_FILE, out, 'utf8');
  console.log(`✅ 已写入 ${path.relative(ROOT, LIST_FILE).replace(/\\/g, '/')}（${entries.length} 条，基线 ${BASELINE}）`);
  process.exit(0);
}

// ---------------------------------------------------------------- 主判据

const list = readList();
console.log(`证据政策门禁（Tier-3 拦截）· 基线 ${BASELINE} · 已跟踪 ${tracked.length} 个文件 · ` +
  `其中 Tier-3 类别 ${trackedTier3.length} 个\n`);

if (!list) {
  console.error(`❌ 找不到清单 ${path.relative(ROOT, LIST_FILE).replace(/\\/g, '/')}`);
  console.error('   —— 这条门禁判不了「新进 vs 既有」，所以按失败处理（宁可拦住提交，也不要静默放行）');
  process.exit(1);
}

const declared = Number(list.header.count);
if (Number.isFinite(declared) && declared !== list.entries.length) {
  console.error(`❌ 清单自相矛盾：头部声明 count=${declared}，实际 ${list.entries.length} 条`);
  process.exit(1);
}

// 分布报告（grandfather 各类别）
console.log('grandfather（基线时就已跟踪，按政策保留、不报错）：');
for (const t of TIER3) {
  const n = list.entries.filter(f => t.re.test(f)).length;
  console.log(`  · ${String(n).padStart(4)}  ${t.what}`);
}
console.log(`  合计 ${list.entries.length} 个（见 docs/EVIDENCE-POLICY.md §5）\n`);

// 新进的 Tier-3 文件
const fresh = trackedTier3.filter(f => !list.set.has(f));
if (fresh.length) {
  console.log(`${reportOnly ? '⚠️' : '❌'} 基线之后**新进**的 Tier-3 文件 ${fresh.length} 个` +
    `${reportOnly ? '（--report 模式，不判失败）' : ''}：`);
  for (const f of fresh.slice(0, 40)) console.log(`  · ${f}\n      ${tierOf(f).what} ⇒ 应放：${tierOf(f).to}`);
  if (fresh.length > 40) console.log(`  …（还有 ${fresh.length - 40} 个）`);
  if (!reportOnly) {
    console.log('\n处置建议：把结论写进 research/<task>-report.md（Tier 1），过程产物留在本机，');
    console.log('大体积产物的去向见 docs/EVIDENCE-POLICY.md §2（CI Artifact）。');
    process.exit(1);
  }
} else {
  console.log(`✅ 没有新增的 Tier-3 文件（${trackedTier3.length} 个已跟踪的全部在清单内）`);
}

// ---------------------------------------------------------------- 清单自证（只在有历史时）

let baselineSet = null;
try {
  baselineSet = new Set(git(['ls-tree', '-r', '--name-only', BASELINE]).split('\n').filter(Boolean));
} catch (e) {
  console.log('\nℹ️ 清单自证**已跳过**：本地没有基线提交 ' + BASELINE + ' 的对象');
  console.log('   原因：浅克隆（CI 的 actions/checkout 默认 fetch-depth: 1）拿不到基线提交。');
  console.log('   影响：**主判据不受影响**（它只依赖清单 + git ls-files）；');
  console.log('   被跳过的是「清单有没有被悄悄改过」这一步 —— 请在完整检出里跑一次。');
  process.exit(0);
}

const expected = new Set(trackedTier3.filter(f => baselineSet.has(f)));
const missing = [...expected].filter(f => !list.set.has(f));      // 基线里有、清单漏了
const extra = list.entries.filter(f => !expected.has(f));          // 清单里有、基线里没有
if (missing.length || extra.length) {
  console.error(`\n❌ 清单与基线 ${BASELINE} 不一致（清单被改过？）：`);
  if (missing.length) console.error(`   基线里有但清单漏了 ${missing.length} 个，如 ${missing.slice(0, 5).join(', ')}`);
  if (extra.length) console.error(`   清单里有但基线里没有 ${extra.length} 个，如 ${extra.slice(0, 5).join(', ')}`);
  console.error('   若确实要有意改基线，请用 --write 重新生成（需要完整历史）并单独提交说明原因。');
  process.exit(1);
}
console.log(`✅ 清单自证通过：与基线 ${BASELINE} 的 Tier-3 交集逐项一致（${expected.size} 条）`);
