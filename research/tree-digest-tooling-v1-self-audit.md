# tree-digest-tooling-v1 自审（t25）

> 自查对象：`research/tree-digest-tooling-v1-report.md`。
> 这份自审回答两件事：**acceptance 逐条我怎么算过的**，以及**我可能错在哪**。

## 1. acceptance 逐条自查

| # | acceptance | 判词 | 我的证据 | 我自己的怀疑 |
|---|---|---|---|---|
| 1 | `scripts/tools/tree-digest.cjs` 进仓，用法与输出与 scratch 版**逐字段一致**（`files`/`bytes`/`treeDigest`/`manifestSha256`/`perFile`），支持 `--out=<file.json>` | PASS | 同一棵 dist 上两份 `--out` JSON **逐字节相同**（sha256 `d250a63c…`）；304 条 `perFile` 逐条 diff = 0；6 键同序同值；stdout 逐字符相同；连跑两次同串 | ① 契约点了 5 个字段，scratch 实际 6 个（多 `dir`）——我按「与 scratch 一致」保留 6 键并在报告 §1.1 登记；② 比较符我写成 `a<b?-1:a>b?1:0`（scratch 是 `a<b?-1:1`）。同层名字唯一 ⇒ 两者是同一个全序，实测两份 JSON 字节相同即为证；但这是**实现差异**，不是口径差异 |
| 2 | `package.json` 加一条 `report:digest`（或同等命名），`check:ci` 仍 **39/0**（若触发「新脚本必须登记」则同步登记并说明） | PASS | `npm run --silent report:digest` → 同一串、exit 0；`check:ci` = **39 项失败 0**，加脚本**前**的基线也是 39/0；(W) 仍「实跑 38 条 = 冻结清单 38 条 + 本看门狗」 | **没有触发登记要求**，所以「说明改了什么」这一支不适用 —— 我给的理由是检查器范围（(17) 只核 `selftest:*`，(19) 只扫 `scripts/tools/*selftest*.js`）而**不是**「我没看见」。我不认为该把它登记成 `selftest:*`：那会要求它进 `action.yml`，而它需要现成 dist、输出是相对量（报告 §6.2） |
| 3 | 对当前 `dist` 跑一次：给出 **304 文件**与全树摘要，并与 t23 报告里那份（`67d1d0bd…`）**逐字符比对相同** | PASS | `npm run build`（exit 0）后 `npm run report:digest` → `304 文件 / 20386654 B / 67d1d0bdcdffe29f1b2bd0185c35408da897d53d20e44c495fec385f7ec1337d` / `2b8fe49f…`；两侧字符串逐字符比对（报告 §3 表） | 「相同」只说明两棵树的字节相同。**不同源的红旗我没法排除**：如果 t23 的读数是错的、而我的构建又恰好复现了同一个错，这里看不出来。反制：我直接对 t23 工作树里仍在盘上的 `dist` / `dist.b2` **重跑了摘要器**（不是引用它的记录），三棵树同串（报告 §3.1） |
| 4 | 报告写明这条工具为什么该进仓（依赖 gitignore 的 scratch ⇒ 别人复核不了；进仓后一条命令） | PASS | 报告 §4：三条具体后果（复核者拿不到工具 / 契约作者也拿不到它 —— t23 那条不存在的路径就是症状 / scratch 靠运气存活）+ 一条可跑命令 + 钉住 304 条 `perFile` 清单 | 「别人复核不了」这条**曾经是事实、现在不再是**：进仓后复核成本从「重写一个」降到「一条命令」。我没有把 scratch 的存活写成必然（本轮实测 7 份拷贝 sha 全等，但那只是这一天的快照） |
| 5 | 不得改动任何既有断言或门禁步骤语义（纯新增工具 + 一条 npm script） | PASS | 提交后 `git status --porcelain` 为空；本次提交 `9b9ce31` = **8 files / +940 / −0**（其中唯一被修改的既有文件是 `package.json`，+1 行、无删除、无改名、无重排）；`check:ci` 39/0；`fitness` 4/0（42 script / 26 selftest 分层数不变）；(19) 加脚本前后都是「27 个 `*selftest*.js`」；`check:evidence` 1283 grandfather 不变 | 严格说 `package.json` 是**既有文件**被改：+1 行。这是 acceptance 允许的（「一条 npm script」）。除此之外 `scripts/**`（除新增那一支）、`.github/**`、`scripts/test/**`、`dist/**` 一字未动 |

## 2. 我可能错在哪（假设清单）

| # | 我依赖的假设 | 如果它错了会怎样 | 我做了什么来降低风险 |
|---|---|---|---|
| A1 | t23 工作树里 `dist`/`dist.b2` 的**字节**就是当年的产物 | 「复现历史读数」变成「复现我自己的构建」 | 我没有引用它的 JSON 结论，而是对**盘上的字节**重跑；两份独立构建（`dist` / `dist.b2`）都同串 |
| A2 | 我挑的 scratch 参照物（`.worktrees/post-merge-deploy-v1/.arch-v1/tree-digest.cjs`）就是产出 t23 那份读数的那一版 | 等价性比对可能拿错参照物 | 全扫后发现盘上**三版并存**（`1d89e46a…`×6 / `18af7725…`×1 / `ac10ca60…`×1），而 captain 交接点名的那份**缺失**；我用「读数自洽」选参照物：`1d89e46a…` 含 `manifestSha256`，且它跑出的 `treeDigest` = t23 报告的 `67d1d0bd…`。**但这仍是间接推定** —— 若当年还有第 4 版没留在盘上，本报告的「逐字段一致」只对得上 `1d89e46a…` 那一版 |
| A3 | `dist` 的构建是确定性的 | 摘要变化可能来自构建噪声而不是源 | 两次构建同串（t23 的 `dist`/`dist.b2`）+ 我自己的构建同串 + 门禁第 37 步重建后再摘要仍同串 |
| A4 | 「同串」的解释边界：同字节 ≠ 内容正确 | 报告可能被读成「产物质量证明」 | 报告 §8 第 3 条明写：摘要是相对量，不是质量判据 |
| A5 | `.arch-v1/` 里我写的 scratch 探针（`tooth-run.cjs`、`make-evidence.cjs`）不会被当成交付物 | 复核者找不到证据生成过程 | 两者的**输出**（`teeth.json` / `scratch-vs-repo-equivalence.json`）进了 `research/_raw/`，且每个读数都在报告表里；探针本身按 Tier-3 政策留在本机 |

## 3. 失效条件（什么会让本报告的结论作废）

1. **产物面变化**：未来某轮合法地改了 dist（新页面、新字段）⇒ `67d1d0bd…` 不再是「当前产物的期望值」。
   那时该更新的是**记录**，不是把摘要钉成断言（报告 §6.2）。
2. **`package.json` 的 `report:digest` 被改名/删除** ⇒ 报告里那条「一条命令」失效（工具路径 `scripts/tools/tree-digest.cjs` 仍在，`node` 直跑仍可用）。
3. **别处重跑得到不同串** ⇒ 三种可能：(a) 那棵树确实不同（逐条 diff `perFile` 即可定位）；(b) 平台稳定性假设被打破（报告 §8 第 1 条，跨平台未实测）；(c) 工具被改动（比对 git blob `0a569779…`）。
4. **`.arch-v1/tree-digest.cjs` 被清理** ⇒ **scratch ↔ 仓库的等价性不能再复现**（本报告的一次性证据用掉了）。
   这不影响工具本身，但意味着「逐字段一致」这句话从此只能引用本报告 —— 这正是报告 §4 里「该进仓」的同一个理由。
   **这件事已经部分发生**：captain 交接 ② 点名的那一份（`captain-baseline-1c02d84`）今天就不在盘上；
   盘上现存 8 份但分属三个版本（报告 §2）。
5. **`.gitattributes` 增加 `*.cjs` 的 EOL 规则**（本轮没做）⇒ 工作树文件 sha256 会变；权威身份仍是 git blob。

## 4. 我**没有**做的事（列出以免被当成已覆盖）

* 没有改任何既有断言、门禁步骤、分层表、冻结清单。
* 没有把摘要值钉进任何门禁（刻意，理由见报告 §6.2）。
* 没有改 `.gitattributes`（`.cjs` 的 `text eol=lf` 登记）—— 不在 inScope。
* 没有在 `d19017af` 上重新构建（`dist`/`dist.b2` 用的是 t23 留在盘上的字节）。
* 没有跑跨平台（Linux/macOS）实测。
* 没有逐条复现历轮其它轮次的 scratch 读数（只复现了 t23 那一份）。
* 没有为 `.cjs` 工具补 `scripts/test/layers.js` 的分层登记（它不是测试，也不该被 (17)/(19) 要求）。
