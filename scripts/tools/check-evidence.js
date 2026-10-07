#!/usr/bin/env node
'use strict';
/**
 * 证据政策门禁（Tier-3 拦截）—— 见 `docs/EVIDENCE-POLICY.md`。
 *
 * ## 它解决什么
 *
 * `.gitignore` 只能拦**还没被跟踪**的文件；一个已经 `git add` 的文件不会因为它被忽略而消失。
 * 而 `.gitignore` 里原先靠**逐目录白名单**（v3.0-sources/html、coverage-depth-v1/release-evidence/raw、
 * 各目录下的 shots 目录…）兜底 —— 每开一个新任务都要人工补一条，漏补的症状是「几十 MB 的第三方正文
 * 静默进了仓库」，且**没有任何门禁会红**。实测：`research/` 已跟踪 1,161 个文件 / 32.9 MB，
 * 其中 `.txt` 510 个、`.cjs`（一次性探针）217 个。
 *
 * 本脚本把那条「靠记性」的纪律变成一条**机器判据**：
 *
 *   ① 当前**已跟踪**的文件里，匹配 Tier-3 类别的那些；
 *   ② 与**基线**（本轮重构起点 `e0ca04a`）已跟踪的集合比对：
 *      · 基线里就有的 ⇒ **grandfather**，登记后放行（本政策**只管未来**，不重写历史、不删证据）；
 *      · 基线之后新进的 ⇒ **硬失败**，打印文件与它的正确去向。
 *
 * 用法：
 *   node scripts/tools/check-evidence.js                 # 门禁用（有新增 Tier-3 即非 0 退出）
 *   node scripts/tools/check-evidence.js --report        # 只报告 grandfather 分布（恒 0 退出）
 *   node scripts/tools/check-evidence.js --baseline=<sha># 换一个 grandfather 边界
 */
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/**
 * grandfather 边界：本轮架构现代化的起点（`origin/master` 在开局时的那一个提交）。
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

const git = args => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf8');

const tracked = git(['ls-files']).split('\n').filter(Boolean);
let baseline;
try {
  baseline = new Set(git(['ls-tree', '-r', '--name-only', BASELINE]).split('\n').filter(Boolean));
} catch (e) {
  console.error(`❌ 取不到基线 ${BASELINE} 的文件清单（${e.message.split('\n')[0]}）`);
  console.error('   —— 这条门禁判不了「新进 vs 既有」，所以按失败处理（宁可拦住提交，也不要静默放行）');
  process.exit(1);
}

const tiers = TIER3.map(t => ({ ...t, grandfathered: [], fresh: [] }));
for (const f of tracked) {
  for (const t of tiers) {
    if (!t.re.test(f)) continue;
    (baseline.has(f) ? t.grandfathered : t.fresh).push(f);
  }
}

console.log(`证据政策门禁（Tier-3 拦截）· 基线 ${BASELINE} · 已跟踪 ${tracked.length} 个文件\n`);
console.log('grandfather（基线时就已跟踪，按政策保留、不报错）：');
let gfTotal = 0;
for (const t of tiers) {
  gfTotal += t.grandfathered.length;
  console.log(`  · ${String(t.grandfathered.length).padStart(4)}  ${t.what}`);
}
console.log(`  合计 ${gfTotal} 个（见 docs/EVIDENCE-POLICY.md §5）`);

const fresh = tiers.flatMap(t => t.fresh.map(f => ({ f, t })));
if (!fresh.length) {
  console.log('\n✅ 没有新增的 Tier-3 文件 —— 本政策只管未来，当前合规');
  process.exit(0);
}

console.log(`\n${reportOnly ? '⚠️' : '❌'} 基线之后**新进**的 Tier-3 文件 ${fresh.length} 个` +
  `${reportOnly ? '（--report 模式，不判失败）' : ''}：`);
for (const { f, t } of fresh.slice(0, 40)) console.log(`  · ${f}\n      ${t.what} ⇒ 应放：${t.to}`);
if (fresh.length > 40) console.log(`  …（还有 ${fresh.length - 40} 个）`);
if (!reportOnly) {
  console.log('\n处置建议：把结论写进 research/<task>-report.md（Tier 1），过程产物留在本机，');
  console.log('大体积产物的去向见 docs/EVIDENCE-POLICY.md §2（CI Artifact）。');
  process.exit(1);
}
