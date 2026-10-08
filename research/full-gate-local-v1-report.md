# full-gate-local-v1 报告：本机 Full Gate 全量实跑（master 含 #62）与逐项读数

> **一句话**：在 `.worktrees/full-gate-local-v1`（全新工作树，`origin/master = 95dfeb9`）上跑完
> **51 步**：**执行 48 · 通过 48 · 失败 0 · 跳过 3（全部是 CI 上下文专用）· exit 0 · 用时 327s**；
> 与 CI 那次 `gate`（PR #62）**逐条对齐、0 处结论冲突**，与 CI 在**同一棵树**上的读数**逐字相同**；
> **Gate 不改产物**（304 文件跑前跑后逐文件 sha256 全等）；第 1 步 `npm ci` 在本工作树内跑，
> 该工作树**从未有过** `node_modules`（不可能是 junction），**主工作区依赖未被波及**。
>
> 这一条补的是 t4 自审 §3 如实登记的那句话：「没有另跑 Full Gate」。

---

## 1. 读数表（本机）

| 量 | 值 |
|---|---|
| 总步数 | **51**（`.github/actions/gate/action.yml` 的命名步骤，运行器**现读**该文件、不写死数量） |
| 执行 | **48** |
| 通过 | **48** |
| 失败 | **0** |
| 跳过 | **3**（CI 上下文专用，逐条理由见 §3） |
| **exit code** | **0** |
| 用时 | **327s**（= 各步骤 ms 之和 327.1s；顺序执行 ⇒ 与挂钟时间同量级） |
| 命令 | `node .arch-v1/full-gate.cjs`（在 `.worktrees/full-gate-local-v1` 内） |
| 日志（Tier-3，不入库） | `.arch-v1/full-gate-local.log`（人读）· `.arch-v1/full-gate.json`（机器可读原始） |
| 机器可读转写（入库） | `research/_raw/full-gate-local-v1/local-gate.json`（逐步骤 status / exitCode / ms） |
| 树 | `origin/master = 95dfeb99035c7431597c99c10fb2cae83ddfad8f`（含 PR #62 的合并 `33d2472`，也含其后的 #63 / #64） |
| 环境 | Windows · Node v24.13.1 · 本机 msedge（`verify-site.js` 的浏览器通道）· `TZ=Asia/Shanghai` |

最慢的 6 步（其余 45 步合计 20.2s）：

| 步 | 名称 | 秒 |
|---|---|---|
| 50 | Regression verify (baseline compare) | 142.0 |
| 49 | Real-browser acceptance (verify-site.js) | 117.4 |
| 9 | Translation self-test | 17.6 |
| 42 | Analytics self-test (bootstrap count / production guard / provider) | 15.0 |
| 43 | Feeds reproducibility (build twice, byte-compare) | 8.2 |
| 32 | Coverage-targets self-test (intent layer + seven derived states) | 6.7 |

> **树与任务描述的差**：任务写的是「含 #62 合并 `33d2472`」，但 `origin/master` 在我开工时已经前进到
> `95dfeb9`（#63 `notes-manifest-v1` → `0a1fe92`、#64 `criteria-adversary-v1` → `f4d3e61` 等）。
> 我按任务的原话跑的是「**`origin/master` 当前状态**」，并在此逐条说明与 PR #62 那次 CI 的差异来源。

---

## 2. 第 1 步 `npm ci`：运行方式与「主工作区未被波及」

| 检查 | 读数 |
|---|---|
| 新工作树 `node_modules` 在 `npm ci` **之前** | **不存在**（`git worktree add` 之后从未创建过 ⇒ 结构上不可能是 junction / symlink） |
| `npm ci` 在哪跑 | `D:\OneDrive\Desktop\Code\AI Page\.worktrees\full-gate-local-v1`（**本工作树内**） |
| `npm ci` 结果 | exit 0 · `found 0 vulnerabilities` · 装出 **50 个目录** |
| 装完后的类型 | `Get-Item node_modules -Force` 的 `LinkType` = **空串**（实体目录；Junction/SymbolicLink 会显示出来） |
| Full Gate 自己那次 `npm ci` | 第 1 步 `Install dependencies` **又跑了一次**（同一工作树内）· 通过（见 `local-gate.json` 第 1 步） |
| **主工作区** `node_modules`（跑前） | 存在 · `LinkType` 空串 · **50 个目录 + 1 个文件** |
| **主工作区** `node_modules`（跑后） | 存在 · `LinkType` 空串 · **50 个目录 + 1 个文件** ⇒ **未被波及** |

> 为什么这次要特别写：NEXT-STEPS 里登记过一次事故 —— 隔离工作树用 **junction** 指 `node_modules` 时，
> 跑 Full Gate 的第 1 步 `npm ci` 会把 junction 换成实体目录、并把**原目标（主工作区的 `node_modules`）
> 清空**。本次是全新工作树 + 实体目录安装，且跑前跑后都读了主工作区的目录数与 `LinkType`：
> 三次读数（手工 `npm ci` 前 / 后、Full Gate 后）**逐项相同**。证据：`research/_raw/full-gate-local-v1/npm-ci.json`。

---

## 3. 跳过的 3 步（逐条理由，并列出命中的 token）

运行器的判定口径与上一轮一致（**如实标 skip，不假装跑过、也不算失败**）：步骤的 `run` 体里出现
GitHub Actions 表达式 `${{ }}` / `GITHUB_OUTPUT` / `GITHUB_STEP_SUMMARY` / runner 装浏览器
（`install --with-deps`）⇒ 本机没有这些上下文。

| 步 | 名称 | 命中的 token（在该步 `run` 体里） | 本地不跑的理由 | CI 上 |
|---|---|---|---|---|
| 47 | Prepare browser for the real-browser gate | `install --with-deps`、`GITHUB_OUTPUT` | 这一步在 runner 上装 chromium 并写 `GITHUB_OUTPUT`；本机浏览器由 `verify-site.js` 自己的通道解析（msedge） | 跑了 · pass |
| 48 | Browser availability decision (never silent) | `GITHUB_OUTPUT`、`GITHUB_STEP_SUMMARY` | 读第 47 步的 outputs 决定「有/没有浏览器」并把结论写给后续步骤与 Summary；本机没有这两个上下文 | 跑了 · pass |
| 51 | Gate conclusion | `GITHUB_STEP_SUMMARY` | 把结论写进 Actions Summary；本机没有 Summary | 跑了 · pass |

> **重要边界**：第 48 步正是「**不许静默跳过浏览器门禁**」的那条 fail-closed 判据。它在本机**不会被演练**
> —— 也就是说，本次本机全绿**不证明**「本机没有浏览器时 Gate 会明确失败」。那一条只有 CI 能证（CI 上它是
> pass，而它的失败分支在本轮没有被触发过）。这一点写进「没证明的东西」（§6）与自审。

---

## 4. 与 CI 那次 `gate` 的逐条对齐

### 4.1 两边的形状

| | CI（PR #62） | 本机 |
|---|---|---|
| 运行 | **run 37760907386** / job **113256788677**（`Verify site (gate)`） | `node .arch-v1/full-gate.cjs` |
| 树 | `refs/pull/62/merge` = `0ff05f2`（**合并预览**，不是 PR 头 `f96f4bf`） | `95dfeb9`（当前 master） |
| 结论 | `success` | exit **0** |
| 用时 | **274s**（`started_at 10:03:21Z` → `completed_at 10:07:55Z`） | **327s** |
| 步骤可见性 | job 级 **8** 步（复合 action 塌成 1 步）+ 原始日志里复合 action 内部 **51** 个 `Run` 组 | 运行器直接按 51 步逐条跑 |
| 失败步骤 | **0**（51 个组里 `##[error]` **0** 处） | **0** |
| 跳过步骤 | **0**（CI 有全部上下文，51/51 都跑） | **3**（§3） |

### 4.2 逐条对齐（51 行全表在 `research/_raw/full-gate-local-v1/gate-alignment.json`）

| 结论 | 步数 | 说明 |
|---|---|---|
| CI pass · 本机 pass | **48** | 逐条**同序**配对（CI 侧按原始日志的组顺序配；见下面的弱证据说明） |
| CI pass · 本机 skip | **3** | 就是 §3 那三步（CI 上下文专用） |
| **结论冲突（一边红一边绿）** | **0** | — |
| action.yml 步骤数 ↔ CI 日志组数 | **51 ↔ 51** | 一一对应（CI 日志第 14–64 组；首组 = `Run npm ci`、末组 = Gate conclusion 的 `{`） |

> **这条配对有多强（如实说）**：CI 侧是按**顺序**配的，不是按命令文本配的。旁证有三条：
> 组数两边都是 51、首组是 `Run npm ci`（对应第 1 步 `Install dependencies`）、末组是 Gate conclusion。
> 若 CI 侧将来增删过一个步骤，顺序配就会错位而**仍然显示 0 冲突** —— 这个洞写在自审 §2。

### 4.3 读数对齐：**用同一棵树**再比一次，逐字相同

CI 在 **同一棵树**（master `95dfeb9`）上也跑过一次 gate（**run 37762919782**，success，2026-10-08T10:21:22Z）。
把它与本机对齐，**七个读数逐字相同**：

| 口径 | CI @ `95dfeb9`（run 37762919782） | 本机 @ `95dfeb9` | 一致 |
|---|---|---|---|
| `check:ci` | ✅ CI 口径检查 **39 项，失败 0 项** | ✅ CI 口径检查 **39 项，失败 0 项**（单独复跑同一命令） | ✅ |
| 构建期 SEO 门禁 | ✓ SEO 安全门禁: **28 个检查码 × 186 个页面**全过 | ✓ 同左（逐字相同） | ✅ |
| `seo-verify` | ✅ SEO 验收 **17 项，失败 0 项** | ✅ SEO 验收 **17 项，失败 0 项** | ✅ |
| 真浏览器验收（步 49） | ✅ 验收 **880 项，失败 0 项** | ✅ 验收 **880 项，失败 0 项** | ✅ |
| 回归比对（步 50，`--compare`） | ✅ 验收 **886 项，失败 0 项** | ✅ 验收 **886 项，失败 0 项** | ✅ |
| `selftest:seo` | v1.7 SEO 门禁演练：**87 项通过，0 项失败** | 同左 | ✅ |
| fitness | ✅ 架构 fitness **4 条，失败 0 条** | ✅ 架构 fitness **4 条，失败 0 条**（单独复跑） | ✅ |

### 4.4 与 PR #62 那次的差异：只有一条，且已定位到**树**而不是环境

| 口径 | CI @ PR #62（树 `0ff05f2`） | 本机 @ `95dfeb9` | 差 | 原因 |
|---|---|---|---|---|
| 真浏览器验收（步 49） | **874 项** / 0 | **880 项** / 0 | **+6** | **树不同**：PR #62 之后 `notes-manifest-v1`（PR #63，commit `0a1fe92`）给 `verify-site.js` 加了 6 条断言（`git diff --stat 4b366d2 95dfeb9 -- scripts/tools/verify-site.js` = **+181 行**，且 `git log` 显示只有 `0a1fe92` 动过它）。该轮自己的报告里记的就是「master `4b366d2` = **874** ⇒ 本轮 **880**（+6）」（`research/notes-manifest-v1-report.md` §读数） |
| 回归比对（步 50） | **880 项** / 0 | **886 项** / 0 | **+6** | 同一件事（`--compare` = 主断言 + 6 条比对项） |
| 其余读数 | 39 / 28 码 × 186 页 / 17 / 87 | **完全相同** | 0 | — |
| 用时 | 274s（含 runner 装浏览器的那一步） | 327s | +53s | **不可直接比**：本机不跑第 47 步（装浏览器），但第 49/50 步在本机用的是 **msedge**、CI 用 **chromium**；两边引擎与宿主都不同 |
| 检出内容 | `refs/pull/62/merge`（合并预览 `0ff05f2`） | 工作树 = `95dfeb9` | — | **形状差异，不是结论差异**：PR 事件默认检出合并预览 |

> **另一处值得记的事实**：#62 合并后 master 上那次 gate（run **37761851998**，`33d2472`）是 **cancelled**
> —— 被同分支后续 push 的并发策略取代。所以「#62 合并提交本身」没有一份完成的 CI gate 读数；
> 能对齐的是 **PR #62 的 gate**（合并预览）与 **当前 master 的 gate**（`95dfeb9`）两次，两次都 success。

---

## 5. 产物变化面：Gate **不改产物**（304/304 逐文件相同）

| 量 | 跑前（手工 `node scripts/tools/build-local.js`） | 跑后（Full Gate 第 36 步重建） |
|---|---|---|
| 文件数 | **304** | **304** |
| 字节数 | 20,386,654 | 20,386,654 |
| 全树摘要 | `67d1d0bdcdffe29f1b2bd0185c35408da897d53d20e44c495fec385f7ec1337d` | **同一个值** |
| 清单摘要（逐文件 sha256 的汇总） | `2b8fe49fa776a8789e592d79fb507c2c1e9cac233801a9425b4e9e8f55f638de` | **同一个值** |
| 逐文件差异 | — | **差异 0 · 只在跑前 0 · 只在跑后 0** |

**为什么是 304 而不是 303**（t4 时代是 303）：PR #63（`notes-manifest-v1`）新增了产物
`dist/_notes.ndjson`（页面级说明的构建期意图清单）。逐文件比对旧树（`digest-withchanges2.json`）
只多这一个文件、没有少任何文件；那轮报告也记着「产物变化面只多出 `dist/_notes.ndjson`（其余 303 文件
逐文件 sha256 不变）」。证据：`research/_raw/full-gate-local-v1/product-digest.json`。

> 另一层意思：这条同时是一次**构建可复现性**读数 —— 跑前手工那一次与 Gate 内第 36 步那一次，
> 是**两次独立构建**，产物逐字节相同。

---

## 6. 没证明的东西（边界，别当成已验证）

1. **3 个跳过步骤的行为在本机没有被演练**。尤其第 48 步「Browser availability decision (never silent)」
   的 **fail-closed 分支**（没有浏览器 ⇒ Gate 必须明确失败，不许静默跳过浏览器门禁）——本机不跑它，
   CI 上它 pass 但也没触发失败分支。**本次全绿不构成对那条判据的验证。**
2. **跨平台不成立**：本机 = Windows + msedge；CI = `ubuntu-latest` + chromium。本机全绿**不证明**
   Linux 上同样全绿（仓库自己记过跨平台字体渲染会让像素类断言 flaky 的风险）。
3. **没有跑第二遍完整 Gate**：因此「两次 Full Gate 的逐步读数完全一致」没被证明。只证明了
   「Gate 不改产物」（跑前手工构建 vs Gate 内构建逐字节相同）。
4. **CI-only 判定是正则启发式**（与 CI 无关：只看 `run` 体里有没有 `${{ }}` / `GITHUB_*` / `install --with-deps`）。
   我逐条打印了这 3 步命中的 token（§3），48 条执行的都通过；但启发式本身可能误判（例如某步在**注释**里
   写 `${{ }}` 会被误标为 CI-only 而跳过），而**没有独立于该启发式的第二判据**。
5. **逐步读数不全**：本机运行器每个步骤只保留 stdout 的**最后 3 行**，所以像「CI 口径检查 39 项」
   「SEO 安全门禁: 28 个检查码」这种非末尾行不在 `full-gate-local.log` 里。我用**单独复跑同一条命令**
   补齐（同一棵树），并在 `readings-compare.json` 的 `localSupplement` 里标明这是补充、不是 Gate 内读数。
6. **CI 的逐步骤结论来自原始日志**（`##[group]` 分组），不是 API —— `gh api .../jobs` 只暴露 **8 个**
   job 级步骤（复合 action 塌成 1 步）。这套对齐方法依赖日志格式。
7. **`--compare` 的基线是陈旧的**（`research/_raw/ours-baseline/verify.json`，生成于 2026-09-29）。
   本轮 886/0 通过，但我**没有**逐条审计新增的 6 条断言是否都有基线对应项。
8. **PR #62 的 CI 跑的是合并预览**（`refs/pull/62/merge` = `0ff05f2`），不是 PR 头 `f96f4bf`，
   也不是合并提交 `33d2472`；后者在 master 上那次运行被 **cancelled**。所以「#62 的 CI gate
   跑过哪棵树」这件事本身有一层间接性，本报告按事实写明。

---

## 7. 这份读数补上了什么（与 t4 自审的对接）

t4 的自审 §3 第 2 条写的是：「**没有跑 Full Gate（`npm run gate`）**：跑的是它里面的关键步骤
（build / selftest:seo / verify:seo / verify-site / check:ci / check:evidence）与 `selftest:changes`；
Full Gate 由 PR 的 CI 跑，等 CI 绿才算数。」

本任务把这条补成了三层：
1. **本机全量**：51 步、48 执行、48 通过、0 失败、3 跳过、exit 0、327s（含前几轮**从未在本机跑过**的
   `fitness` / `check-evidence` / `validate --strict` / 15 个 selftest / 9 个产物依赖 selftest /
   两次可复现性比对 / 回归比对）；
2. **与 CI 逐条对齐**：51↔51、0 冲突（含 3 条跳过的 token 级理由）；
3. **同树同读数**：CI 在 `95dfeb9` 上的那次 gate 与本机**七个读数逐字相同**，把「本机读数可信」
   从「看起来像」变成「有对照」。

---

## 8. 复现命令

```console
# 工作树（与主工作区隔离）
git worktree add .worktrees/full-gate-local-v1 -b full-gate-local-v1 origin/master
cd .worktrees/full-gate-local-v1

# 第 1 步（本工作树内；跑前确认 node_modules 不存在 —— 全新工作树天然满足）
npm ci

# 跑前产物基线（与 Gate 第 36 步同一条命令）
node scripts/tools/build-local.js
node .arch-v1/tree-digest.cjs dist --out=.arch-v1/digest-before.json

# 全量 Full Gate（51 步；日志 .arch-v1/full-gate-local.log，机器可读 .arch-v1/full-gate.json）
node .arch-v1/full-gate.cjs

# 跑后产物对账
node .arch-v1/tree-digest.cjs dist --out=.arch-v1/digest-after.json

# 与 CI 对齐（需要 3 份输入：action.yml + CI 原始日志 + 本机结果）
gh run view 37760907386 --log   > .arch-v1/ci-run.log                 # PR #62 的 gate
gh run view 37762919782 --log   > .arch-v1/ci-run-master95dfeb9.log   # master @95dfeb9 的 gate
node .arch-v1/ci-log-parse.cjs .arch-v1/ci-run.log --json=.arch-v1/ci-log-readings.json
node .arch-v1/align.cjs --json=.arch-v1/gate-alignment.json
node .arch-v1/readings-compare.cjs --json=.arch-v1/readings-compare.json
```

**一次性探针**（`.arch-v1/`，Tier-3，不入库）：`full-gate.cjs`（运行器，从上一轮 scratch 复制，未改）·
`tree-digest.cjs` · `ci-steps.cjs` · `ci-log-parse.cjs` · `align.cjs` · `readings-compare.cjs` ·
`collect-gate-evidence.cjs`。
**入库的小 JSON**：`research/_raw/full-gate-local-v1/`（6 份 + README）。

**本任务没有改任何源码**：改动只有 `research/full-gate-local-v1-report.md`、
`research/full-gate-local-v1-self-audit.md`、`research/_raw/full-gate-local-v1/`；
`scripts/` / `docs/` / `NEXT-STEPS.md` / `dist/` 一个字节未动（`git status` 可证）。
