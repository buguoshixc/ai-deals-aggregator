# recovered/ · 修复前 §22c 判据的复原件（captain）

## 这是什么

`verify-site.pre-t7.js` 是 **t7 修复之前**那一版 `scripts/tools/verify-site.js` 的逐字节复原件。

```text
sha256  4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756
行数    6702
对应    t2 交付、t5（review round 1）对抗复审的那一版（含 §22a 之前的全部内容 + 旧 §22c）
```

## 为什么需要复原（过程缺陷，如实记录）

t7 用 `teeth/_scratch/splice-22c.cjs` **原地整块替换**了 §22c（从头部注释到 §23 之前），
**没有留备份**，也没有把替换前后的 diff 落盘。于是 `4cae2fb2…` 这一版在磁盘上不复存在：

- `git show HEAD:` 给的是**未含 §22c** 的基线（`d5125c58…`），不是这一版；
- git 索引 / 悬空对象 / 其它 worktree / `%TEMP%` 均无副本（t11 已逐一排查并留证）。

**这是一次真实的证据完整性事故**：它让「门禁修复前 vs 修复后」这一类对照在本轮一度做不出来。
记录在此，供报告 §J（Self Audit）与后续版本的流程改进引用：
**任何原地重写产物源码的动作，都必须先落 `<file>.pre-<task>.bak` 并把替换 diff 写进自己的证据目录。**

## 复原方法（可复算，不依赖任何人的口头说明）

复原输入是 T3 在**改动前**抓取的源码 diff：`../diff/02-source-diff.patch`
（`git diff` 工作区 vs `1f225d2`，捕获时 verify-site.js 尚为修复前版本，形状 `+820 / −0`）。

步骤：取该 patch 里 `scripts/tools/verify-site.js` 那一段 hunk，应用到 `git show HEAD:scripts/tools/verify-site.js`
之上，写出结果文件。复原脚本：`recover-pre-t7.cjs`（与本次实际执行的一致）。

```bash
node research/_raw/secondary-page-layout-unification/recovered/recover-pre-t7.cjs \
     research/_raw/secondary-page-layout-unification/diff/02-source-diff.patch \
     scripts/tools/verify-site.js \
     research/_raw/secondary-page-layout-unification/recovered/verify-site.pre-t7.js
# 输出 sha256 必须等于 4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756
```

**判定标准是 sha256 相等，不是"看起来像"**：复原件与 t5 记录的判据区 sha256 也对得上
（旧判据区 `WIDE_TOL → wideProblems` 结束：213 行 / `91d295365b40e60c…`）。

## 怎么用它（`pre-t7/` 沙箱，**不碰生产文件**）

`pre-t7/` 是一份可执行的沙箱，**不修改 `scripts/tools/verify-site.js` 一个字节**：

```text
recovered/pre-t7/scripts/tools/verify-site.js   ← 复原件（sha 4cae2fb2…）
recovered/pre-t7/scripts/lib                    ← junction → 真实 scripts/lib
recovered/pre-t7/node_modules                   ← junction → 真实 node_modules
```

`verify-site.js` 的 `ROOT = path.join(__dirname,'..','..')` ⇒ `recovered/pre-t7`，
所以用**相对路径**把 `--dir` 指回真实产物目录（向上 5 层）：

```bash
# 用【修复前】的判据跑改动前产物：这是真正的 M0 基线
node research/_raw/secondary-page-layout-unification/recovered/pre-t7/scripts/tools/verify-site.js \
     --dir=../../../../../dist.baseline \
     --json=research/_raw/secondary-page-layout-unification/recovered/pre-t7-M0-baseline.json

# 用【修复前】的判据跑改动后产物：应当全绿（证明当时确实看不见缺陷）
node research/_raw/secondary-page-layout-unification/recovered/pre-t7/scripts/tools/verify-site.js \
     --dir=../../../../../dist \
     --json=research/_raw/secondary-page-layout-unification/recovered/pre-t7-green.json
```

已自检：`playwright-core` / `../lib/feeds` / `../lib/landing` / `../lib/analytics` 都能正确解析，
`--dir=../../../../../dist` 解析到真实的 `<worktree>/dist`。

## 使用纪律

- 它**只是"修复前"的对照物**，不是当前门禁。任何结论都必须同时给出**当前** `verify-site.js` 的 sha256。
- 用它跑浏览器套件时遵守本队的资源纪律：**同一时刻最多 2 个浏览器重活**，开工前先看 `agent_teams_status`。
- 它**只读**：沙箱里的文件不要改（改了 sha256 就失去对照意义）。
- 报告里引用它时必须写明「复原件 + 复原方法 + sha256」，不得写成"当时留下的原件"。
