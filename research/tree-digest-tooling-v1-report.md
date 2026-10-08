# tree-digest-tooling-v1 报告（t25）

> **任务**：把历轮只存在于 `.arch-v1/`（gitignore，Tier-3 scratch）的「产物全树摘要器」正式收进仓库，
> 修掉 t23 契约里那条**在本仓不存在**的 verify 命令；证明「产物逐字节未变」这类结论**从此可由仓库内工具独立复现**。

| 项 | 值 |
|---|---|
| 基线 | `origin/master` = `e1caef98450da8a4b1145408bb85d752f3052e56`（含 #84 / #85 / #86） |
| 工作树 | `.worktrees/tree-digest-v1`（分支 `feat/tree-digest-tooling-v1`；`git reset --hard origin/master`；`node_modules` 装在本工作树内、非 junction） |
| 新增 | `scripts/tools/tree-digest.cjs`（5635 B · 工作树 sha256 `64e0ffcc2f7bc1678dc9928abde78479192ca6d29d71eedef3881f05ecbb382c` · git blob `0a5697799648ab5f82e1e37af68fbd593106912a`） |
| 修改 | `package.json`：+1 行 `"report:digest": "node scripts/tools/tree-digest.cjs dist"` |
| 已有断言/门禁步骤语义 | **0 处改动**（`--expect-checks=39`、冻结清单 38 条、分层表都没动） |

## 0. 一屏结论

| # | 结论 | 一句话证据 |
|---|---|---|
| C1 | 工具进仓，口径与 scratch 版**逐字段一致** | 同一棵 dist 上两份 `--out` JSON **逐字节相同**（sha256 都是 `d250a63c…`，304 条 `perFile` 逐条相同，stdout 逐字符相同） |
| C2 | 复现 t23 那份读数 | `npm run report:digest` → **304 文件 / 20386654 B / 全树摘要 `67d1d0bd…` / 清单摘要 `2b8fe49f…`**，与 `research/_raw/post-merge-deploy-v1/build-digest.json` 逐字符相同 |
| C3 | `check:ci` 仍 **39/0** | 新脚本既不是 `selftest:*`（断言 (17) 的范围）也不匹配 `scripts/tools/*selftest*.js`（断言 (19) 的范围）⇒ **不需要登记、也不该登记**（理由见 §6.2） |
| C4 | 配了牙 | 三处变异（漏一层目录 / 排序颠倒 / 拼接少一个 LF）各自把断言咬红；逐字节还原后回绿（还原前后工具 sha256 都是 `64e0ffcc…`） |
| C5 | 不许静默成功 | 目录不存在 → exit **2**；契约里写错的字面路径 `node scripts/tree-digest.cjs dist` → exit **1**（响亮失败） |
| C6 | 未动任何既有断言/门禁语义 | `check:ci` 39/0（(W) 仍「实跑 38 条 = 冻结清单 38 条 + 本看门狗」）· `fitness` 4/0（42 script / 26 个 `selftest:*` 分层数不变）· `check:evidence` 绿（1283 grandfather、无新增 Tier-3） |

## 1. 工具：落位、接口、口径

```
node scripts/tools/tree-digest.cjs [dir=dist] [--json] [--out=<file.json>]
npm run report:digest        # = node scripts/tools/tree-digest.cjs dist
```

* **纯新增只读工具**：除 `--out=` 指定的文件外不写盘、不联网、不 require 仓内任何模块。
* `--json`（本轮按 captain 交接 ② 加）：stdout **只有一段 JSON**（与 `report:coverage` / `changes-report` 等仓内 `report:*` 工具的约定一致）；`--out=` 仍照写。
* 位置参数与 `--` 开关顺序无关；缺省目录 `dist`。

### 1.1 字段与口径（与 scratch 版逐字段一致）

| 字段 | 类型 | 口径 |
|---|---|---|
| `dir` | string | `path.basename(dir)`（跑 `dist` 得 `"dist"`） |
| `files` | number | 遍历到的文件数（不含目录） |
| `bytes` | number | 所有文件 `statSync().size` 之和（磁盘字节数，不是字符数） |
| `treeDigest` | hex64 | `sha256( 依次 update(`${rel}\u0000${sha256}\n`) )` |
| `manifestSha256` | hex64 | `sha256( `perFile` 的 `rel\0sha` 用 LF join，**不带尾 LF** )` |
| `perFile` | string[] | `<rel>\t<sha256>`，顺序 = 遍历顺序 |

> **契约描述的一处小差（如实登记）**：任务书 acceptance 点了 5 个字段（`files`/`bytes`/`treeDigest`/`manifestSha256`/`perFile`），
> 而 scratch 版实际输出 **6 个键**（多一个 `dir`）。本轮取「与 scratch 版一致」为准 ⇒ 保留 `dir`，键序也保持一致
> （`dir, files, bytes, treeDigest, manifestSha256, perFile`）；实测两份 JSON 文件逐字节相同，键序相同。

### 1.2 摘要的稳定性来自三件（缺一就会随机）

1. **每层显式排序**：`readdirSync` 的顺序由文件系统给（NTFS 与 ext4 就不一样），不依赖它。
2. **比较符固定为 UTF-16 码元序**的 `<` / `>`，**不用** `localeCompare`（它随 ICU / locale 变）。
3. **分隔符与换行写死**：相对路径统一 `/`、字段间 `\t` / NUL、行尾 LF，不跟平台走。

> 拼接用 NUL 而不是空格/制表符：路径里可以合法出现空格与制表符，NUL 不行 ⇒ 无歧义。
> 每条都带 LF：少了它，`a`+`bc` 与 `ab`+`c` 会撞成同一串（这正是牙 M3 咬的那一处）。

### 1.3 与 scratch 版**仅有的**两处行为差（都在错误路径上）

| 场景 | scratch 版 | 本工具 |
|---|---|---|
| 输入目录不存在 | 未捕获的 `ENOENT` 堆栈（exit 1） | 一行原因 + **exit 2** |
| `--out=` 目标目录不存在 | `ENOENT` 堆栈（exit 1） | 一行原因 + **exit 2**（**不替你创建目录**，免得写错路径变成静默落盘） |

成功路径（读数、字段、stdout、`--out` 文件字节）**完全一致** —— 见 §2。

## 2. 等价性：仓库工具 vs 历轮 scratch 版（逐字节）

scratch 源件：`.worktrees/post-merge-deploy-v1/.arch-v1/tree-digest.cjs`
（sha256 `1d89e46a977fb6156cd2b634b8847e37554ff2d24803ba2fcf36731377b43fa7`，1743 B）。

**为什么挑这一份**（captain 交接 ② 点名的路径**不存在**，见 §5 第 6 行）：本轮对主仓 + 全部工作树做了一次全扫，
`.arch-v1/tree-digest.cjs` 在盘上共 **8 份、三个不同版本**：

| sha256 | 字节 | 份数 | 版本特征 |
|---|---|---|---|
| `1d89e46a977f…` | 1743 | **6** | 含 `manifestSha256`（最全的一版）——本报告用它做参照物 |
| `18af77257d73…` | 1785 | 1 | 早期版：**没有** `manifestSha256`（notes-manifest-v1 时期） |
| `ac10ca6020dd…` | 1519 | 1 | 更早的一版 |

选中 `1d89e46a…` 的依据是**读数自洽**：用它跑出的 `treeDigest` 与 t23 报告里那份 `67d1d0bd…` 一致。
（这本身就是「该进仓」的一条硬证据：同一颗工具在盘上有三个版本，谁能复现谁的口径，取决于他掀开的是哪个工作树。）

| 维度 | 读数 | 判词 |
|---|---|---|
| `--out` JSON 文件 sha256 | scratch `d250a63c…` = 仓库工具 `d250a63c…` | **逐字节相同** |
| 键顺序与键值 | 6 键同序同值 | 相同 |
| `perFile` 304 条 | 逐条 diff = **0** | 相同 |
| stdout 两行 | 逐字符相同 | 相同 |
| 仓库工具连跑两次 | `d250a63c…` = `d250a63c…` | 确定（同树同串） |

⇒ 两件不同实现、不同注释、不同错误处理的脚本，在同一棵 dist 上产出**同一份字节**：口径确实一致，不是「看起来像」。

证据：`research/_raw/tree-digest-tooling-v1/scratch-vs-repo-equivalence.json`（verdict = PASS，含 5 个等价维度的布尔判词）。

## 3. 读数：当前 `dist` 与 t23 那份逐字符比对

命令：`npm run build`（exit 0）→ `node scripts/tools/tree-digest.cjs dist`

| 量 | t23 报告里那份（scratch） | 本轮（仓库工具，master 头 `e1caef9`） | 判词 |
|---|---|---|---|
| 文件数 | 304 | **304** | 相同 |
| 字节数 | 20,386,654 | **20,386,654** | 相同 |
| 全树摘要 `treeDigest` | `67d1d0bdcdffe29f1b2bd0185c35408da897d53d20e44c495fec385f7ec1337d` | **同左** | **逐字符相同** |
| 清单摘要 `manifestSha256` | `2b8fe49fa776a8789e592d79fb507c2c1e9cac233801a9425b4e9e8f55f638de` | **同左** | 逐字符相同 |

t23 那份的出处：`research/_raw/post-merge-deploy-v1/build-digest.json`（`build1` 与 `build2` 两棵都是这一串）。

### 3.1 三角交叉：我直接量了 t23 那两棵树

不止是「信 t23 的存档读数」—— 他工作树里 `dist` 与 `dist.b2` 还在盘上，我用**本仓库工具**直接对**那两棵树的字节**重跑：

| 被测量的树 | 来源 | files / bytes | treeDigest |
|---|---|---|---|
| `.worktrees/post-merge-deploy-v1/dist` | t23（`d19017af` 上构建 #1） | 304 / 20,386,654 | `67d1d0bd…` |
| `.worktrees/post-merge-deploy-v1/dist.b2` | t23（同一源的构建 #2） | 304 / 20,386,654 | `67d1d0bd…` |
| `.worktrees/tree-digest-v1/dist` | 本轮（`e1caef9`） | 304 / 20,386,654 | `67d1d0bd…` |

### 3.2 副产品观察（不是本轮要证的，但值得记）

`d19017af → e1caef9` 之间落了 **20 个提交**，其中 `scripts/**` 有净变化
（`lib/changes.js`、`lib/plans-hub-page.js`、`tools/build-local.js`、`tools/seo-selftest.js`、`tools/seo-verify.js`，合计 **+357 / −38**），
但两端的产物**逐字节相同**（上表）。这条只说明一件事：**「源改了」不等于「产物变了」** —— 而区分这两件事正是本工具的全部用途。
（边界：`d19017af` 那两棵树我量的是字节，但「它们来自 `d19017af`」这个陈述沿用 t23 的记录；本轮没有重新在 `d19017af` 上构建。）

## 4. 为什么该进仓

**问题**：历轮「本轮只动判据/文档，产物逐字节不变」的证明，都靠 `.arch-v1/tree-digest.cjs` 这份一次性脚本。
而 `.arch-v1/` 在 `.gitignore:81`，按 `docs/EVIDENCE-POLICY.md` 属 Tier-3（一次性探针 ⇒ 结论进 Tier 1 后即可弃）。

三条具体后果：

1. **复核者拿不到工具** ⇒ 要么信我们的读数，要么自己重写一个（口径未必一致 ⇒ 制造**第二套口径**，正是本仓反复要消灭的形态）。
2. **契约作者也拿不到它** —— t23 契约里那条 `node scripts/tree-digest.cjs dist` 就是症状：连写契约的人都不确定工具在哪，
   写了一条**在本仓不存在**的路径（见 §5 第 1 行）。
3. **scratch 的存活与版本都靠运气**：本轮全扫发现它在盘上有 **8 份、三个不同版本**（§2），
   而 captain 交接 ② 点名的那一份（`.worktrees/captain-baseline-1c02d84/.arch-v1/tree-digest.cjs`）**已经不在盘上** ——
   若当初只照那条路径去找，这次连参照物都拿不到，历史读数就直接变成不可复现的传说。

**进仓后**：任何一轮、任何人，一条命令即可复核 ——

```
npm run build && npm run report:digest
# dist: 304 文件 / 20386654 B · 全树摘要 67d1d0bd…
# 清单摘要 2b8fe49f…
```

`research/_raw/tree-digest-tooling-v1/digest-dist.json` 还钉住了这一版的 **304 条 `perFile` 清单**，供后续轮次逐条 diff。

## 5. 同类契约错小表（captain 要的流程教训）

「我给的 verify 命令（以及交接消息）里哪些路径当时不存在、我怎么处置的」——含本轮新发现的两处（第 2、6 行）：

| # | 轮次 / 任务 | 契约里写的（原文） | 盘上事实 | 处置 | 归宿 |
|---|---|---|---|---|---|
| 1 | t23 `post-merge-deploy-v1` | Verify：`node scripts/tree-digest.cjs dist` | **路径不存在**：`git cat-file -e origin/master:scripts/tree-digest.cjs` → `fatal: path … does not exist`；全仓无同名文件；真身是 `.arch-v1/tree-digest.cjs`（gitignore） | 先用 scratch 版跑出读数；再把**同一份**脚本临时放到字面路径让 verify 按字面过；跑完**立即删除**（`git status --porcelain -- scripts/` 为空） | `research/post-merge-deploy-v1-report.md:42-44`、`-self-audit.md:32-35`；**本轮根部修掉**（落 `scripts/tools/`） |
| 2 | t25（本轮） | captain 交接 ③：「修掉 captain 写错的 verify 命令 `node scripts/tree-digest.cjs dist` —— 工具进仓后，**这条命令必须真的能跑出摘要**」 vs 契约正文 Verify：`node scripts/tools/tree-digest.cjs dist` | 两处路径不同（`scripts/` vs `scripts/tools/`）；契约正文/inScope/acceptance 三处都写 `scripts/tools/` | 按契约正文落位 `scripts/tools/`；并**实测**字面旧路径 → exit 1（响亮失败、非静默成功）；把这条内部不一致写进报告而不是自己加一个影子入口 | 本报告 §5 本行；`research/_raw/tree-digest-tooling-v1/teeth.json` 的 `legacy-path` 行 |
| 3 | t21 `roles-note-tooth-v1` | inScope 只含自测与 `action.yml`，但 acceptance 要求 `check:ci` **39/0** | 冻结表 `scripts/tools/check-ci-consistency.js:205`/`:350` 与分层表 `scripts/test/layers.js:69` 不在 inScope，**不登记必红**（反证实测：`✗ (10) … #19 期望「App-token self-test」实得「Roles-note self-test …」；❌ 39 项失败 1 项`，exit 1） | **报 captain → 裁定 (A) 纳入声明面**；两处纯追加（+7/−0、+1/−0），报告 §8.1 记明 | `research/sources-residue-v1b-report.md:372-389` |
| 4 | t6 `judge-calibration-v1` | verify 清单里的 `npm run verify` 没写前置条件 | `verify-site.js` 的 `sharedFooterExternalHrefs` **硬编码**读 `ROOT/dist/index.html`（不走 `--dir=`）；工作树里没有 `dist/` 时 5 个枢纽页各多报一条**假失败**（共 10 条） | 先 `npm run build` 再跑；把装置坑记进报告供后续复用 | `research/judge-calibration-v1-report.md:259-260` |
| 5 | （同类，他轮记录）`coverage-expansion-v1` | 契约点名 `docs/MODEL-FRESHNESS-POLICY.md` | 该文件在盘上**不存在**（`fs.existsSync` 为 false） | 改引代码常量 `scripts/lib/model-freshness.js` 的 `MODEL_FRESHNESS_POLICY` 作为唯一判据入口 | `research/coverage-expansion-v1-report.md:128` |
| 6 | t25（本轮） | captain 交接 ②：「源件 = captain 的 scratch 摘要器 `.worktrees/captain-baseline-1c02d84/.arch-v1/tree-digest.cjs`（只读它，别改它）」 | **该路径不存在**：`captain-baseline-1c02d84/.arch-v1/` 目录在，里面只有 `bom-guard.cjs` / `forge-sitemap.cjs` / 几份 commit-msg 与 PR 正文，**没有 `tree-digest.cjs`** | 全扫主仓 + 全部工作树（8 份 / 三版），按「哪一份能复现 t23 的读数」选参照物（`1d89e46a…`，盘上 6 份全等），并在报告 §2 把「三版并存 + 点名那份缺失」一并登记 | 本报告 §2 表 + 本节本行 |

**可写进收口文件的四条教训**：

1. verify 命令**与交接消息**里点到的每个路径，在下发前用 `git cat-file -e <ref>:<path>`（或 `Test-Path`）验一遍 —— 成本 1 秒，
   收益是不用成员临场救场、也不用下一轮再来补一个 t25（第 1、6 行都是这类）。
2. 「工具进仓」与「契约里的路径」必须**同时**改：只修其中一半，下一轮会换个成员再踩一次同样的坑。
3. verify 清单要带**前置条件**（这条需要先 `npm run build`、那条需要网络、那条需要浏览器）——
   第 4 行那 10 条假失败，根因不是代码而是「前置条件没写」。
4. **契约内部的路径必须自洽**：同一份契约出现两条不同路径时，成员只能按 inScope/acceptance 猜（第 2 行）。
   下发前做一次「路径集合唯一性」检查即可拦住。

## 6. 牙

### 6.1 三处变异 → 红；逐字节还原 → 绿（`research/_raw/tree-digest-tooling-v1/teeth.json`）

| 变异 | 改了什么 | 读数 | 判词 |
|---|---|---|---|
| **M1 漏一层目录** | `walk(full); continue;` → `continue;`（不再递归子目录） | files **304 → 21**、bytes **20386654 → 1580817**、treeDigest `e93cad67…` | **RED** |
| **M2 排序颠倒** | 每层比较符反号 | files/bytes 不变；treeDigest `6efd1ccc…`、manifestSha256 `af9826c9…` | **RED** |
| **M3 拼接少一个 LF** | `` `${rel}\0${sha}\n` `` → `` `${rel}\0${sha}` `` | 只有 treeDigest 变 `b64e03e6…`（manifestSha256 **不变**） | **RED** |
| **还原 ×3** | 逐字节拷回原文件 | 三次都回到 `files=304 / bytes=20386654 / 67d1d0bd… / 2b8fe49f…`；还原前后工具 sha256 均为 `64e0ffcc…` | **GREEN** |
| 负例 A | 输入目录不存在（`dist.nope`） | exit **2** + 一行原因 | 响亮失败（不许静默成功） |
| 负例 B | 契约里写错的字面路径 `scripts/tree-digest.cjs` | exit **1**（`Cannot find module`） | 响亮失败 |

> M3 只咬 `treeDigest` 而 `manifestSha256` 不动，是**设计如此**：后者是对清单文本（`rel\0sha` + LF join）的摘要，
> 不经过 `tree` 那条拼接。这条差异本身就是对「两个量各有 owner」的一次确认。

### 6.2 为什么**不**把这颗牙装进门禁

`selftest:*` 一旦落盘，断言 (17)/(19) 会要求它出现在 `.github/actions/gate/action.yml` 里；
而本工具需要一棵**现成的 dist**，且它的输出是**相对量**（「两次构建是否同字节」），不是「产物是否正确」。
把 `67d1d0bd…` 钉成 CI 断言，会让**下一次合法的产物变化**变成红 —— 那是把记录当契约。
取舍：**工具进仓（可复现）+ 读数写进报告与证据（可对账）**，不进 CI 步骤。这一取舍也让本轮 `check:ci` 保持 39/0 而不需要登记。

## 7. 门禁与验证读数

| 命令 | 读数 | exit |
|---|---|---|
| `npm run build` | 产物自检全过，`dist/` 304 文件 | 0 |
| `node scripts/tools/tree-digest.cjs dist` | `304 文件 / 20386654 B · 67d1d0bd…` | 0 |
| `npm run report:digest` | 同上（同一串） | 0 |
| `npm run check:ci` | **39 项，失败 0 项**；(W) 实跑 38 条 = 冻结清单 38 条 + 本看门狗；(19) 扫 27 个 `*selftest*.js` | 0 |
| `npm run fitness` | **4 条，失败 0**；④ 42 个 script 分 5 层、26 个 `selftest:*` 全部已分层 | 0 |
| `npm run check:evidence` | 绿：1283 个已跟踪 Tier-3 全部在清单内、无新增 | 0 |
| `npm run gate` | **52 门禁步骤 / 48 个脚本 / 276.6s / 失败 0**（本地跳过 4 个非 node 步骤：装依赖、备浏览器、浏览器可用性判词、门禁结论）；日志含 `[19] Roles-note self-test`、`[37] Assemble site`、`[50] Real-browser acceptance (117.0s)`、`[51] Regression verify (114.4s)` | 0 |
| 门禁**重建产物之后**再摘要 | 仍是 **304 文件 / 20386654 B / `67d1d0bd…`** ⇒ 全量门禁不改产物（第 37 步重建过一次） | 0 |

> `check:ci` 与新脚本的关系：断言 (17) 只核 `package.json` 里的 `selftest:*`，断言 (19) 只扫 `scripts/tools/*selftest*.js`；
> `report:digest` 与 `tree-digest.cjs` 两个条件都不满足 ⇒ **检查器没有提出登记要求**（不是我漏登记）。
> 本轮实测：加脚本**前**的基线 `check:ci` 也是 39/0、(19) 也是「27 个」⇒ 前后同值。

## 8. 没证明的东西

1. **跨平台同串未实测**：只在本机 Windows / NTFS 上跑过。设计上已消除 `readdir` 顺序与分隔符依赖，
   但「Linux 上同一棵树得同一串」没有实测（要实测需要一棵两平台共有的树；本轮不需要，也没有）。
2. **没有复现历轮每一份 scratch 读数**：只逐字符比对了 t23 那一份（304 文件 / `67d1d0bd…`）。
   p2-residuals 的 `13b17d0a…`、t4 时代的 303 文件读数等**没有**逐条重跑 —— 那需要重建当时那棵 dist。
3. **摘要不是质量判据**：它只回答「两棵树的字节是否相同」，**不回答产物内容是否正确**。
4. **`.gitattributes` 没有 `*.cjs text eol=lf` 行**（不在本任务 inScope，本轮没改）：
   在别的 Windows 检出（`core.autocrlf=true`）上，这份文件的工作树字节可能是 CRLF ——
   功能不变、git blob 不变，但**工作树文件 sha256 会变**。所以报告里两个 hash 都记（blob `0a569779…` 是权威身份）。
5. `--json` 与 `--out=` 同时给出时：文件照写、stdout 只有 JSON；没有测「两者指向同一文件」这类自相矛盾用法。
6. **没有为工具写仓库级断言**（见 §6.2）：本轮的牙是**记账式**（读数与记录不符时立刻可见），不是门禁式。

## 9. 范围、取舍与回滚

* **inScope 四件**：`scripts/tools/tree-digest.cjs`（新增）· `package.json`（+1 行）· 本报告 · `-self-audit.md`。
* **inScope 之外但按交付条款必须有的证据**（`research/**`）：
  `research/_raw/tree-digest-tooling-v1/{scratch-vs-repo-equivalence.json, teeth.json, digest-dist.json, README.md}`。
  其中三份原始 `--out` 读数里只把**一份**（`digest-dist.json`，30 KB，304 条 `perFile`）留在仓里，
  scratch 侧与第二次重跑的大份 dump 留在 `.arch-v1/`（gitignore），只把它们的 sha256 写进证据。
* **回滚**：删 `scripts/tools/tree-digest.cjs` + 删 `package.json` 里那一行。无其它耦合（不 require 仓内模块、无 CI 步骤引用）。
