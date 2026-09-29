# 04 · 运维与文档一致性审计：仓库/CI/文档说的和做的是否一样

**审计员**：ops-auditor（task t4）· **审计时点**：2026-09-28 · **审计对象**：工作区 HEAD = `a0c4ab2`
**纪律**：全程只读。没有改任何文档/代码/workflow，没有 commit / push / fetch 写操作，没有动分支、tag、worktree、stash。
**基线**：`research/_raw/AUDIT-CONTEXT.md`（captain 实测）直接引用处已标注；本文件新增的是**尚未证实**部分的证据。

**证据分档**（沿用 §7 审计纪律）：**【实测】**= 我亲手跑的命令 / 亲手取的 API · **【引用】**= 读文件或 API 返回的字段（含仓库自己的记录）· **【推断】**= 我的判断。

---

## 0. 结论先行：这个项目的文档有多少可信？

**一句话**：**流程类、机制类文档高度可信（可逐条复现）；数字类、状态类文档系统性滞后一个到两个迭代。**

- **可信的部分（我逐条复现成功）**：四个 workflow 的真实行为、门禁结构、「job 被 if 跳过会报 Success」这套 CI 语义、
  门禁脚本的行为与项数、构建确定性、`折叠无损 50 张卡覆盖 80 条`、`133` 条数据的存在性。
  这些不是「文档抄代码」，是**文档写了、我照着跑、结果一致**。
- **不可信的部分**：凡是写成「现在 / 当前 / 本轮」的**快照数字**，一律要按「当时值」读，
  而文档里**没有任何一处告诉读者「这个数现在已经过期」**——除了 `PROJECT_STATUS.md` 第四节有一句
  「本节是**当时值**，不是常量」（`PROJECT_STATUS.md:1780`），算半个免责声明。
- **最严重的一处结构性缺陷**：**没有任何一份文档说清「现在这一版是多少」**。
  根目录 4 份文档各自凝固在 `fa2403d`(2.28) / `777e3b7`(2.29) / `52f6164`(2.31) / `a0c4ab2`(2.32) 四个不同时点，
  读者无法从任何单份文档得知当前 HEAD、当前数据量、当前断言数。
- **可证伪的量化**：我在 7 份文档里核对了 **28 条**可验证声明，**16 条与实测不符**（见 §5.0 表），
  **12 条仍与实测一致**。不符的 16 条里，**5 条属于「会让读者做出错误决定」**（标 🔴：D1/D2/D4/D13/D26）。
  逐条对照：`D12/D18` 两条 ✅；🔴 五条；其余 9 条 🟡。

---

## 1. git 实况

### 1.1 总量与跨度 【实测】

| 指标 | 实测值 | 命令 |
|---|---|---|
| 提交总数 | **118** | `git rev-list --count HEAD` |
| 首个提交 | `1974e06` · 2026-09-20 23:09:30 +0800 · `feat: initial AI deals aggregator …` | `git log --reverse --format=…` |
| 当前 HEAD | `a0c4ab2` · 2026-09-28 12:10:53 +0800 · `docs: 2.32 上线记录 …` | `git log -1` |
| 与远端一致性 | 本地 `a0c4ab2` = `origin/master` = **GitHub API `/branches/master` 返回的 `a0c4ab2`** | `git rev-parse` + API |
| 时间跨度 | **8 天 13 小时** | 推算 |
| 工作区 | 干净，唯一未跟踪文件是 captain 建的 `research/_raw/AUDIT-CONTEXT.md` | `git status --short` |

### 1.2 最近 20 次提交的构成分类 【实测】

| 类别 | 次数 | 说明 |
|---|---|---|
| `docs` | **6** | 2.30/2.31/2.32 上线记录、第四节快照刷新、分支地图更新 |
| `chore(data)` | **4** | 定时采集机器人提交（09-26 23:55 / 09-27 11:51 / 09-28 00:31 / 09-28 11:50） |
| `fix` | **4** | fold 口径两修 + UI 撤「已核验」 + fix(fold) 加粗切点 |
| `merge` | **2** | 并回 origin/master 的 8 次数据更新、预演分支合并 |
| `data(zh)` | **2** | 补定时采集新进条目的中文译文（DeepBrain AI/AutoDraw、Wavel.ai） |
| 其他 | 2 | 两条 `docs(status)`（**注**：这两条 subject 以 U+FEFF BOM 开头，机械分类会漏，见 §9 附录） |

**全历史 118 次**：`feat` 27 · `docs` 26 · `chore(data)` 17 · `fix` 13 · `merge` 5 · `data(zh)` 1 · 其他 29（29 里有相当一部分同样是 BOM 前缀导致漏判）。

**按天分布**（这条最能说明节奏）：

| 日期 | 提交数 |
|---|---|
| 09-20 | 6 |
| 09-21 | 9 |
| 09-22 | 13 |
| **09-23** | **63**（53%） |
| 09-24 | 3 |
| 09-25 | 2 |
| 09-26 | 3 |
| 09-27 | 14 |
| 09-28 | 5 |

**判断【推断】**：这个仓库的节奏**既不是「数据在跑」也不是「人在改」，而是「一次性大施工 + 事后收尾」**。
09-20~09-23 四天吃掉 91/118 = 77% 的提交（09-23 单日 63 次），之后进入低频维护：
每天 2~14 次提交中，**机器人定时数据提交稳定占 2~4 次/天**（每天 2 次 schedule，多数因 `updatedAt`
刷新而确实产生提交），其余是人写文档与修 bug。
最近 20 次里 **机器人数据提交占 4/20 = 20%，文档占 6/20 = 30%**——**「人在改」仍多于「数据在跑」**。

---

## 2. 分支、worktree 与 tag

### 2.1 本地分支全表（15 个，含 master）【实测】

`git for-each-ref refs/heads` + `git branch --merged master` + `git rev-list --count`

| # | 分支 | 最后提交 | 日期 | 是否已并入 master | ahead / behind | 判断 |
|---|---|---|---|---|---|---|
| 1 | `master` | `a0c4ab2` | 09-28 12:10 | — | 0 / 0 | 当前 |
| 2 | `fix/fold-same-vendor` | `52f6164` | 09-27 23:56 | ✅ 已并入 | **0 / 5** | **残留**（见 2.2） |
| 3 | `trial/fav-cmp-merge` | `0c7e5aa` | 09-27 21:52 | ✅ 已并入 | 0 / 24 | 残留（台账未列） |
| 4 | `fix/favorites-entry-and-compare-open` | `875b723` | 09-23 23:21 | ✅ 已并入 | 0 / 28 | 残留（台账未列） |
| 5 | `fix/detail-close` | `c70706b` | 09-23 12:50 | ✅ 已并入 | 0 / 58 | 残留 + **upstream 错配**（见 2.3） |
| 6 | `feat/expiry-window` | `c02e017` | 09-23 11:39 | ✅ 已并入 | 0 / 59 | 残留（台账已列） |
| 7 | `feat/favorites-compare` | `e0cd50d` | 09-23 11:37 | ✅ 已并入 | 0 / 53 | 残留（台账已列） |
| 8 | `trial/merge-rehearsal-2` | `044dd51` | 09-23 09:27 | ✅ 已并入 | 0 / 59 | 残留（台账已列） |
| 9 | `trial/merge-rehearsal` | `4066a17` | 09-23 02:05 | ❌ **未并入** | **6 / 71** | **有意保留**（台账已判定） |
| 10 | `feat/polish` | `f55e8a9` | 09-23 02:01 | ✅ 已并入 | 0 / 75 | 残留（台账已列） |
| 11 | `feat/row-view` | `7bfc607` | 09-23 01:50 | ✅ 已并入 | 0 / 76 | 残留（台账已列） |
| 12 | `feat/detail-pages` | `f1213d5` | 09-23 01:42 | ✅ 已并入 | 0 / 77 | 残留（台账已列） |
| 13 | `feat/b-extras` | `ec05252` | 09-23 01:35 | ✅ 已并入 | 0 / 78 | 残留（台账已列） |
| 14 | `feat/visual-token-layer` | `874cd6b` | 09-23 01:28 | ✅ 已并入 | 0 / 79 | 残留（台账已列） |
| 15 | `backup-pre-rewrite` | `cb0850c` | 09-21 21:22 | ❌ **未并入** | **11 / 118** | **有意保留**（台账已判定「只余作者溯源价值」） |

**两个未并入分支为什么留得住**【实测 + 引用】：

- `backup-pre-rewrite`：11 个提交都是「重写前」的历史（`a1b5ae2`/`84d49a4` 两条同名 initial + 早期 deploy/README 提交）。
  `PROJECT_STATUS.md:2025` 的台账已判定「`git cherry` 的 11/11 全是 `-`（patch 等价），内容无独创，只剩作者溯源价值」。
- `trial/merge-rehearsal`：`master..trial/merge-rehearsal` 实测 6 条（5 个 `rehearsal: merge …` + 1 个文档提交），
  台账 `:2023` 已判定「删掉会丢掉被改写前的那版 2.21 措辞」。两者都是**有意保留**，不是遗漏。

### 2.2 `.worktrees/fold-same-vendor` 是残留还是有意保留？→ **残留**【实测】

- `git worktree list`：`D:/OneDrive/Desktop/Code/AI Page/.worktrees/fold-same-vendor  52f6164 [fix/fold-same-vendor]`
- 该分支 **ahead = 0**（没有任何 master 没有的内容），**behind = 5**，落后 5 个提交：
  `d77b9cc`(data) → `98d9550`(data) → `e01dcfc`(fix ui) → `ca183b9`(data zh) → `a0c4ab2`(docs)
- 目录最后写入时间 2026-09-27 23:56:51（= `52f6164` 的提交时刻），此后**再没动过**（≈12.5 小时）
- `.gitignore` 已覆盖 `.worktrees/`，不会污染索引

**结论**：它在 2.31 时的用途（隔离工作树，见 `NEXT-STEPS.md:151`）**已经结束**；master 收编了它的内容之后它就是纯残留。
它同时也是 `fix/fold-same-vendor` 这个分支无法删除的唯一原因（`git branch -d` 会拒绝：分支被 worktree 占用）。

**文档里的对应话术已过期**：`NEXT-STEPS.md:192-193` 写着
「要复核：`git -C .worktrees/fold-same-vendor log --oneline -6`，或 `cd .worktrees/fold-same-vendor && npm run build && npm run verify`（**还在，随时能复跑**）」。
命令能跑（worktree 还在），但**跑出来的是 09-27 23:56 的旧代码**，与线上和 master 都不一致——这句话会让人**复跑错版本而不知道**。

### 2.3 upstream 错配：只有 `fix/detail-close` 一条，但它记的数字已过期 【实测】

`git branch -vv` 实测：

```
  fix/detail-close                     c70706b [origin/master: behind 58]  …   ← 台账已登记
  fix/favorites-entry-and-compare-open 875b723                                  ← 无 upstream（不是错配）
  * master                             a0c4ab2 [origin/master]
```

- `fix/detail-close` 的 upstream 指向 `origin/master`，`PROJECT_STATUS.md:2021,2027-2029` 已把它列为
  「目前唯一的『危险默认值』」（一次手滑 `git push` 会去动 master）。
- **但台账写的是 `behind 29`，实测已是 `behind 58`**——只差数字，机制判断仍成立。
- **我另外确认 `fix/favorites-entry-and-compare-open` 不在 `git branch -vv` 的 upstream 列表里，无错配**。
  ⇒ 台账那句「唯一的危险默认值」**在当前状态下仍然成立**（我没能证伪它，只证实了它没被更新）。

### 2.4 两个 tag 的用途与远端状态 【实测 + 引用】

| tag | 指向 | 日期 | 用途 | 是否 master 祖先 |
|---|---|---|---|---|
| `backup/pre-ab-merge` | `fb08832` | 09-23 09:28 (commit date) | A/B 全合进 master **之前**的 master 快照，纯本地回退点 | ✅ 是 |
| `backup/pre-origin-merge-b261add` | `b261add` | 09-23 12:36 (commit date) | 并回 `origin/master`（`71d020a` 的**远端侧**父提交）**之前**的快照 | ✅ 是 |

- 远端实测：**API `/repos/…/tags` → `[]`（空）**，`/git/refs/heads` → **只有 `master` 一个分支**。
  ⇒ 本仓库远端**没有 tag、没有除 master 外的分支**（分支只存在于本地）。
- `PROJECT_STATUS.md:2022` 说「`git ls-remote --tags origin` 输出为空」——我用 API 证实了这个论断（`git ls-remote` 我这边跑不动，见 §9）。

### 2.5 「已合并但没删」的堆积：**存在，规模 11 个分支**【实测】

15 个本地分支里，**11 个 ahead=0 且已并入 master**（#2–8 + #10–14），另有 5 条历史分支（`fix/detail-close`、
`feat/*`、`trial/*`）早在 09-23 就被写入「可安全删除的对象」台账却**至今未执行**。

- 台账本身是**审慎且诚实**的：`PROJECT_STATUS.md:2011-2015` 明确写「本节不执行任何删除……留给人事后决定」，
  每条都给了证据与确切命令。这不是隐瞒，是**登记在案的有意不作为**。
- 但从运维卫生看：**11/15 的分支名是死的**，`git branch` 的输出已经不能当「在做什么」读；
  台账之外还有 2 条（`trial/fav-cmp-merge`、`fix/favorites-entry-and-compare-open`）**连台账都没进**。

---

## 3. CI 实况（GitHub API 复现，不复述文档）

### 3.1 最近 20 次 workflow run 【实测：`/repos/…/actions/runs?per_page=30`】

| # | name | event | status | conclusion | sha | run# | created (UTC) | 时长 |
|---|---|---|---|---|---|---|---|---|
| 1 | Verify site (gate) | push | completed | **success** | `a0c4ab2` | 12 | 09-28T04:11:03 | 82s |
| 2 | Deploy to GitHub Pages | push | completed | success | `a0c4ab2` | 54 | 09-28T04:11:03 | 24s |
| 3 | Deploy to GitHub Pages | push | completed | success | `ca183b9` | 53 | 09-28T04:02:00 | 24s |
| 4 | Verify site (gate) | push | completed | success | `ca183b9` | 11 | 09-28T04:02:00 | 80s |
| 5 | Verify site (gate) | push | completed | **failure** | `e01dcfc` | 10 | 09-28T03:57:42 | 62s |
| 6 | Deploy to GitHub Pages | push | completed | **success** | `e01dcfc` | 52 | 09-28T03:57:42 | 27s |
| 7 | Deploy to GitHub Pages | workflow_run | completed | success | `98d9550` | 51 | 09-28T03:50:58 | 28s |
| 8 | Collect AI Deals | schedule | completed | success | `d77b9cc` | 17 | 09-28T03:49:00 | 116s |
| 9 | Deploy to GitHub Pages | workflow_run | completed | success | `d77b9cc` | 50 | 09-27T16:31:29 | 27s |
| 10 | Collect AI Deals | schedule | completed | success | `52f6164` | 16 | 09-27T16:29:44 | 103s |
| 11 | Verify site (gate) | push | completed | success | `52f6164` | 9 | 09-27T15:57:05 | 77s |
| 12 | Deploy to GitHub Pages | push | completed | success | `52f6164` | 49 | 09-27T15:57:05 | 25s |
| 13 | Verify site (gate) | push | completed | success | `43eba28` | 8 | 09-27T15:53:18 | 73s |
| 14 | Deploy to GitHub Pages | push | completed | success | `43eba28` | 48 | 09-27T15:53:18 | 24s |
| 15 | Deploy to GitHub Pages | push | completed | success | `f9826fd` | 47 | 09-27T15:45:23 | 36s |
| 16 | Verify site (gate) | push | completed | success | `f9826fd` | 7 | 09-27T15:45:23 | 76s |
| 17 | Verify site (gate) | push | completed | success | `6554e26` | 6 | 09-27T15:14:55 | 79s |
| 18 | Deploy to GitHub Pages | push | completed | success | `6554e26` | 46 | 09-27T15:14:55 | 26s |
| 19 | Deploy to GitHub Pages | push | completed | success | `250ba12` | 45 | 09-27T15:10:59 | 27s |
| 20 | Verify site (gate) | push | completed | success | `250ba12` | 5 | 09-27T15:10:59 | 75s |

**成功率统计**（最近 20 次）：success **18** · failure **1** · cancelled **0** ⇒ **90%**
（第 21 次是 `777e3b7` 的 `Verify site (gate)` #2，**cancelled**——被同 ref 的后续 run 取代，属预期行为。）

**分 workflow 累计**（`/actions/workflows/<file>/runs` 的 `total_count`）：

| workflow | 累计 run | 最新 |
|---|---|---|
| `collect.yml`（Collect AI Deals） | **17** | #17 schedule success 09-28T03:49 |
| `deploy.yml`（Deploy to GitHub Pages） | **54** | #54 push success 09-28T04:11 |
| `verify.yml`（Verify site (gate)） | **12** | #12 push success 09-28T04:11 |
| `probe-sources.yml`（Probe Headless Sources） | **2** | #2 workflow_dispatch success 09-21T14:29 |

> 四项相加 = 85，而全仓 `runs.total_count` = **90**：差额 5 应为已删除/重跑 attempt 的历史计数，`/actions/runs` 默认只返回未删记录，两者口径不同。**不影响上面 20 次的清单**（那 20 条逐条可点开）。

**「门禁红了但部署照样成功」的两条独立证据**【实测】：

1. **run 级别**：`e01dcfc` 的 `Verify site (gate)` #10 = failure，**同一 sha 的** `Deploy to GitHub Pages` #52 = success。
2. **check-run 级别**（`/commits/e01dcfc/check-runs`，同一 sha 上并列三条）：

```
CHECK: deploy | completed/success | run 36375740102/job/108781117507
CHECK: build  | completed/success | run 36375740102/job/108781082917
CHECK: gate   | completed/failure | run 36375740112/job/108781082879
```

### 3.2 `e01dcfc` 那次 `Verify site (gate)` failure 的具体原因

**我拿到的（实测）**：`/repos/…/actions/runs/36375740112/jobs` 的步骤级结论：

| step | name | 结论 |
|---|---|---|
| 1–8 | Set up job / Checkout / Setup Node / CI consistency / Install deps / Prepare browser / Validate data (strict) / Assemble site | 全部 **success** |
| **9** | **Translation self-test** | **completed / failure** ← 唯一红的步骤 |
| 10 | Expiry self-test | skipped |
| 11 | Translation drift check (advisory) | skipped |
| 12 | Browser availability decision (never silent) | skipped |
| 13 | Real-browser acceptance (verify-site.js) | skipped |
| 14 | Gate conclusion（`if: always()`） | success（只记录不判死） |
| 27–29 | Post Setup Node / Post Checkout / Complete job | 正常 |

**我没拿到的（必须明说）**：**失败步骤的日志正文取不到。** 我试了三条路径，全部被拒：

```
GET /repos/…/actions/runs/36375740112/logs                  → 403 {"message":"Must have admin rights to Repository."}
GET /repos/…/actions/runs/36375740112/attempts/1/logs       → 403 同上
GET /repos/…/actions/jobs/108781082879/logs                 → 403 同上
GET /repos/…/actions/jobs/108781082879/annotations          → 404 Not Found
```

⇒ **结论只能到「第 9 步 `Translation self-test` 失败、其后步骤连锁 skipped」，再往下的报错原文我无法独立取证。**
（`gh` CLI 按任务说明不可用；`api.github.com` 的 job logs 端点对非管理员一律 403，这与仓库是否 public 无关。）

**【引用，不作为我的结论】** 仓库自己在 `a0c4ab2` 的提交信息里写明了原因：

> 「第一推暴露的既有红：`verify.yml` 的『Translation self-test』在第 9 步失败 —— 定时采集的两次数据提交
> （`d77b9cc` / `98d9550`）新进了 1 条没有译文的条目，`check:zh` 报『待译 1 条 / 1 个字段』；
> 而机器人用 `GITHUB_TOKEN` 推的数据提交不触发本 workflow，所以这条红一直躺在 master 上，
> 直到下一次人类推送才现形（`deploy.yml` 不受影响，站点照常发布）」

这段话**与我的机械证据完全兼容**（第 9 步失败 + 后续 skipped + Deploy 同 sha success），
并且它给出的修复提交 `ca183b9`（`data(zh): 补 1 条定时采集新进条目的中文译文（Wavel.ai）`）**确实在
`e01dcfc..a0c4ab2` 区间内**【实测：`git log --oneline 250ba12..e01dcfc` / `52f6164..master`】。
但我**没有独立验证「待译的是 Wavel.ai 这一条」**——那需要那条日志。

---

## 4. 四个 workflow 的真实行为

### 4.1 触发器与频率（逐文件读源码）【实测】

| workflow | 触发 | 定时频率 | 权限 | 关键 job |
|---|---|---|---|---|
| `collect.yml` | `schedule`（`0 0 * * *` / `0 12 * * *`）+ `workflow_dispatch` | **每天 2 次**（UTC 00:00 / 12:00 = 北京 08:00 / 20:00） | `contents: write` | `collect`（单 job） |
| `deploy.yml` | `push`(master) + `workflow_run`(`Collect AI Deals` completed, branches master) + `workflow_dispatch` | 无定时 | `contents: read` / `pages: write` / `id-token: write` | `build` → `deploy` |
| `verify.yml` | `pull_request`(master) + `push`(master) + `workflow_dispatch`（带 `allow_degraded_run` 输入） | 无定时 | `contents: read` | `gate`（单 job，**无 job 级 `if`**） |
| `probe-sources.yml` | **仅 `workflow_dispatch`** | 无定时 | `contents: read` | `probe`（单 job） |

- **`Deploy` 与 `Verify` 之间没有任何 `needs:` / `workflow_run` 关系**（实测：`deploy.yml` 只 `deploy: needs: build`）。
- `probe-sources.yml` 干什么【实测，读全文 97 行】：**只读探针，回答「GitHub Actions 的机房 IP 能不能访问并渲染智谱活动页与火山方舟」**——
  ① 打 `api.ipify.org` 拿出口 IP，curl `bigmodel.cn/pricing` 与 `volcengine.com/product/ark` 记录 HTTP/大小/风控特征；
  ② `npm ci` + 装 chromium（失败不阻断）；③ `render-source.js` 对智谱价格页做渲染诊断（`--grep=免费 --diag --wait=…`）；
  ④ `collect.js --headless --only=cn_zhipu_pricing,cn_volc_ark --dry-run` **实跑但不写盘**，并把「本地基线：火山方舟 12 条、智谱AI活动页 5 条」写在 Summary 里对比。
  它**不提交、不发布、不写仓库**。**累计只跑过 2 次**（最近 09-21T14:29，即 7 天前）——它是**一次性可行性验证工具**，
  之后没有定期复检（厂商改版/风控变化时得有人想起来手动点）。

### 4.2 「门禁红了但部署照样成功」的机制【实测 + 推断】

**机制（三条，缺一不可）**：

1. **`deploy.yml` 的 `on:` 里没有 verify**——它只监听 `push`(master) 与 `workflow_run: Collect AI Deals completed`。
   `push` 到 master 会**同时**唤醒 `deploy.yml` 和 `verify.yml`，两者**并行**、互不阻塞。
2. **`deploy.yml` 的 `build` 只对自己那一条链路负责**：
   `if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'`（`deploy.yml:30`）。
   这条 `if` **只关心「是不是采集失败」**，不关心 `gate`。
3. **GitHub 不会因为你把两条 workflow 都挂在 `push` 上就排序它们**，也没有任何 `needs` 跨 workflow。
   ⇒ `verify.yml` 的 `gate` 红，对 `deploy.yml` **完全不可见**。

**结果**：git push → `Deploy` 成功上线 + `Verify` 失败（`e01dcfc` 就是这个形态，`Deploy` 还比 `Verify` 早 35 秒结束）。

**这是缺陷还是设计？【推断】——两者都是，而且缺口很具体：**

- **设计上是对的**：门禁存在的意义是「拦人」，而**已经推到 master 的提交没法被回溯性拦下**——
  真要让门禁有牙，只能把它设成 **PR 必需检查**（`PROJECT_STATUS.md:7.5` 那一整节论证过，我复核了它的结论：
  `gate` 确实是四个 workflow 里**唯一**会在 `PR` 上产生检查的 job，因为其余三个都没有 `pull_request` 触发）。
- **缺口在于「没有 PR 流程」**：这个仓库的日常是**直接 push master**（最近 20 次提交全是直接推 master，
  `pull_request` 触发的 run 累计 **0 次**）。⇒ **`gate` 从来不会在合并前拦下任何东西**，
  它只在**事后**告诉你「刚才那推是红的」。
- **一个没有被任何文档写出来的后果**：因为机器人数据提交用 `GITHUB_TOKEN`，`push` 事件唤不醒 `verify.yml`
  （`verify.yml:22-23` 自己写了这一点），所以**数据线上的每次变化都绕过门禁**——
  这正是 `e01dcfc` 那次红的来源（红躺在 master 上，直到下一次人类 push 才现形）。
- **但线上数据有另一道闸**：`collect.yml` 内嵌 `node scripts/validate.js --strict`（step 8），
  采集失败则该 run 结论为 failure → `deploy.yml` 的 `if` 判 false → **不发布，线上保留上一份好数据**。
  即：**数据线有闸，界面/译文线只有事后门禁**。

**文档有没有撒谎？【实测】没有。**
`README.md:439` 写 `deploy.yml`「`push` 到 master 时**纯发布**」，`README.md:446` 写「采集任务失败时……跳过发布」——
两句都与我实测的 workflow 一致。**文档缺的是**「`gate` 红了照样发布」这句明说。
唯一接近的表述在 `PROJECT_STATUS.md:1704`（2.32 节）：「`deploy.yml` 不受影响，站点照常发布」——
但它埋在一个案例叙述里，不是被写成机制声明。

---

## 5. 文档与现实偏差清单（本任务核心）

> **读法**：每条 = 「文档在哪说什么（文件:行）」／「实测是什么」／「差在哪」／「会不会误导人」。
> 严重度：🔴 会让读者做错决定 · 🟡 会让读者得出错误认知 · 🟢 无害但该修。

### 5.0 先给总表（28 条声明，16 条不符）

| # | 声明位置 | 文档说 | 实测 | 严重度 |
|---|---|---|---|---|
| D1 | `SUMMARY.md:9,70,85` | `master` = `origin/master` = **`fa2403d`** | **`a0c4ab2`** | 🔴 |
| D2 | `NEXT-STEPS.md:160,195` | 「**现在**本地与上游完全一致」+ 分支地图顶 `777e3b7` | `a0c4ab2`（`777e3b7` 是 5 个提交前） | 🔴 |
| D3 | `PROJECT_STATUS.md:3` | 最后更新 2026-09-23 | 正文已到 2.32（09-28 12:10） | 🟡 |
| D4 | `PROJECT_STATUS.md:18` | 「真实优惠 **71 条**（占 59%）」= 现在 | 80 条（59% 也对不上：80/133 = 60%） | 🔴 |
| D5 | `PROJECT_STATUS.md:22` | 「现在」71 条 → 53 张卡 | 80 条 → 50 张卡 | 🟡 |
| D6 | `PROJECT_STATUS.md:1785-1794` | 总 132 / tool 52 / 时间信息 61? / zh 43 条 61 字段 | **133 / 53 / 61 / 43 条 61 字段** | 🟡 |
| D7 | `PROJECT_STATUS.md:1811-1813` | Futuretools 31 · 跨源去重后 132 条 | **Futuretools 32 · 133 条** | 🟡 |
| D8 | `PROJECT_STATUS.md:1820-1821` | 分类分布 视频 9（各项合计 132） | **视频 10（合计 133）** | 🟢 |
| D9 | `PROJECT_STATUS.md:1808-1809` | 「32 家官方图形（另 3 家兜底）……厂商标识共 79 家」 | 卡片口径一致；但**厂商归一实测 80 家**，同文件 `:1884` 又说 77 家 | 🟡 |
| D10 | `README.md:343-344` | 「当前 **77 家**……38 家官方图形 / 39 家兜底」 | **80 家 / 38 / 42** | 🟡 |
| D11 | `README.md:79` | 契约示例 `"count": 128` | 133 | 🟢 |
| D12 | `README.md:407-409` | verify **136** 项；verify:regress **142**；`check()` 调用点 **143** | **136 / 142 / 143 全部正确** | ✅ |
| D13 | `PROJECT_STATUS.md:1735,1738,1921-1923` | verify **124** 项；regress **129**；调用点 130 | 136 / 142 / **143** | 🔴 |
| D14 | `NEXT-STEPS.md:79,80` | verify 124；regress 129 | 136 / 142 | 🟡 |
| D15 | `SUMMARY.md:61,64` | verify「**113 项** 0 失败」 | 136（113 是 2.27 的当时值） | 🟡 |
| D16 | `SUMMARY.md:64-65` | 「全绿」+ 全树摘要 `8be46e1581651038a7662e41…`（`0d6b869` 之上那棵树） | 我重建三次**摘要恒定**、确定性成立；但这个**值**属于 `0d6b869` 时期的树，当前树已不同 | 🟡 |
| D17 | `PROJECT_STATUS.md:1695` | 2.32 复核：两次构建 `dist/index.html` SHA256 `62692BB8…`（且注入/还原后回到同一值） | 当前实测 SHA256 = **`A188233AD55A04B049F6EA9A3D31A421EAB32928EFC0F679EF9B577D66F714E3`**（我连跑 3 次恒定）——**确定性成立，值已过时** | 🟢 |
| D18 | `NEXT-STEPS.md:29` | 产物 **139 文件** | ✅ 139（完全正确） | ✅ |
| D19 | `PROJECT_STATUS.md:29-30,79-82` | `selftest:zh` **7 项** | 实测 **9 项 0 失败** | 🟡 |
| D20 | `PROJECT_STATUS.md:28` | 卡片数「折叠为一张卡片：**71 条优惠 → 53 张卡片**」= 现在 | 80 → 50 | 🟡 |
| D21 | `PROJECT_STATUS.md:1867` | 「目前 **48 条**自动条目没有特性标签」 | 133 − 32 = **101 条** | 🟡 |
| D22 | `docs/DESIGN-RULES.md:146` | facet **11/11** 带 `aria-pressed` | 筛选条 **10** 个 facet（2.32 撤了「只看已核验」） | 🟡 |
| D23 | `docs/DESIGN-RULES.md:147` | 卡片与列表行 **62/62** 可聚焦 | 默认视图 **50** 张卡 | 🟡 |
| D24 | `docs/DESIGN-RULES.md:150` | 断掉 deals.json 后首页仍有 **62 卡** | 50 张 | 🟡 |
| D25 | `docs/DESIGN-RULES.md:104` | 「我们的 **62 张卡**的 facet 已够用」 | 50 | 🟢 |
| D26 | `research/GAP-MATRIX.md:92` | G11 收藏/对比「⬜ **未做**（属 C）」 | **2.22 已做、2.29 已补完、已上线** | 🔴 |
| D27 | `research/GAP-MATRIX.md:82,102` | 「首页 **62** 个标题链接」、「断言 55 → **95**」= 落地总账 | 50 个标题链接；断言现 **136/142** | 🟡 |
| D28 | `research/README.md:65,93` | 「★ 我们自己……内链仅 1 条、对比度 100/400」 | 作为**研究时点快照**合理，但同表未标注「该行已过期」 | 🟢 |

### 5.1 逐条详解（只详展开需要解释的）

#### D1 🔴 `SUMMARY.md` 头部：`master = origin/master = fa2403d`

- **文档说**：`SUMMARY.md:9`「`master` = `origin/master` = **`fa2403d`**（代码那次推送是 `ecbc815`）」；
  `:70`「master = origin/master fa2403d ← 已上线」；`:85`「**`master` = `origin/master` = `fa2403d`**（本地与上游一致，无 ahead/behind）」。
- **实测**：`git rev-parse HEAD` = `git rev-parse origin/master` = **`a0c4ab2`**；GitHub API `/branches/master` 也是 `a0c4ab2`。
- **差在哪**：`fa2403d` 是 **09-23 的 2.28 上线点**；它之后已经走过 **2.29 → 2.30 → 2.31 → 2.32** 四轮迭代 + 8 次定时数据提交。
  也就是说这份「本轮工作总结」**描述的是五天前的那一版**，而它同时还写着「状态：**已上线**（2026-09-23）」，语气是现在时。
- **同一份文件还声称了别的数字（逐条核对）**：
  - `:10,:72,:89,:234`「线上 `verify --url=` **108 项 0 失败**」——08/09-23 的当时值；文档**自己加了缺口标注**
    「线上复测值：**权威值待复测（见 P0-2）**」。⇒ **这是诚实的**，但引用的 `见 P0-2` **在任何文件里都搜不到**（见 D-补 A）。
  - `:21`「本地门禁 `verify:regress` **129 项 0 失败**」——现为 **142 项**。
  - `:61,:64`「verify 断言 **113 项 0 失败**」「`verify:regress` **113 项**」——同一文件里 108/113/129 三种断言数并存，
    各自属于不同时点，**文件内没有任何一处说明这三个数的时间关系**。
  - `:51`「可索引 URL **81**」——✅ 正确（`dist/sitemap.xml` 实测 81 个 `<loc>`）。
  - `:52`「同源内链 **308 条**」——**我没有复算**（`PROJECT_STATUS.md:1807` 自己注明「本轮不去复算它」）。
  - `:53`「首屏完整可见 **13 行**」——✅ 与当前构建一致（列表视图）。
- **会不会误导人**：**会，而且是最容易被误导的一份**。`SUMMARY.md` 的自我定位是
  「把这一轮工作的**全貌**收在一页里」（`:3`），配套文件指向 `NEXT-STEPS.md` 与 `PROJECT_STATUS.md`。
  一个读者（或下一个 agent）打开它、看到「master = fa2403d、已上线、108 项 0 失败」，
  **会以为线上跑的是 09-23 那一版**，从而对 2.30 的卡片折叠、2.32 的角标撤除**完全无感**。

#### D2 🔴 `NEXT-STEPS.md` 分支地图自称「现在」

- **文档说**：`NEXT-STEPS.md:160`「master = origin/master **777e3b7** ← 已上线（2026-09-27）」；
  `:195`「**现在本地与上游完全一致**（`git status -sb` 无 ahead/behind）」；`:8`「逐步记录见 `PROJECT_STATUS.md` 的 2.17–**2.30**」。
- **实测**：`777e3b7` 落后 HEAD **5 个提交**（`a0c4ab2`）；本地确实 = 上游（这句的**结论对**，只是指针过期了）。
- **差在哪**：文件头 `:3` 写「更新于 **2026-09-27**」，最后一次更新停在 2.30 刚上线；此后 2.31、2.32、以及 09-28 的两批数据提交
  **都没有回填**。文件里 `:93-153` 详细记了 2.30，**2.31/2.32 一个字都没有**。
- **会不会误导人**：**会**。它是被 `SUMMARY.md:6,22,116` 反复指定为「**先看这个**」的入口文件；
  它的第二节标题写着「已上线；**剩下可选的只有观感项**」——会让读者以为后面没有实质改动了。

#### D3 🟡 `PROJECT_STATUS.md` 头部日期与正文严重脱节（版本 2.17–2.32 的自洽性）

- **文档说**：`:3`「**最后更新**：2026-09-23」。
- **实测**：文件正文有 `2.24`…`2.32` 共 9 个小节带 **09-27 / 09-28** 的日期；最后一个提交 `a0c4ab2` 做的就是「把 2.32 移到 2.31 之后」。
- **差在哪**：头部日期比正文最后一节晚不了、反而早了 **5 天**。
- **内部版本自洽性（逐节核对，结论：自洽）**：
  `2.17`…`2.32` **连续无缺号、无重号**（实测列标题 2.17→2.32 连续）；
  `2.32` 的位置在 `2.31` 之后（`a0c4ab2` 提交信息确认这次是**修正上次插入顺序错**）；
  `2.30/2.31/2.32` 三个小节里的上线记录（`674c63f..250ba12`、`6554e26..43eba28`、`98d9550..e01dcfc`、`e01dcfc..ca183b9`）
  **逐条能在 git 历史里对上**【实测：`git log --oneline 250ba12..e01dcfc` 完全吻合】。
- **会不会误导人**：🟡 读者按头部日期以为这份 173KB 文档「五天没人管」，从而不去读它最后三节——
  **而最后三节恰恰是唯一记录了 2.30–2.32 的地方**。

#### D4 🔴 `PROJECT_STATUS.md` 开头「改造前 → 现在」表：`现在 = 71 条优惠`

- **文档说**：`:14-28` 是「维度 | 改造前 | **现在**」的总表，`:18`「真实优惠 11 条（13.6%）→ **71 条**（占全部条目 59%）」，
  `:19`「国内 0 条 → **51 条**」，`:22`「**折叠为一张卡片**：71 条优惠 → **53 张卡片**」。
- **实测**：真实优惠 **80** 条；国内 **60** 条；默认视图 **50** 张卡片（= 47 单条卡 + 3 张折叠卡）。
- **差在哪**：这张表的「现在」列冻结在 **2.10~2.11 时代**（71 条 / 51 条 / 53 张卡）。
  它同时也是**整份文档最靠前、最像「现状摘要」的一张表**。
- **会不会误导人**：**会**。文档自己在 `:260` 注明了「本节的卡片数是 2.9 上线时的状态（71 张）……2.10 折叠上线后为 53 张」，
  又在 `:1799` 注明「2.30 之前是 62 张」——**唯独没有说「现在是 50 张」**。
  一个只看开头的读者会以 71/51/53 作为「当前规模」去理解后面所有内容。

#### D5–D8 🟡 `PROJECT_STATUS.md` 第四节「当前数据分布」与实测逐项对照

> 该节 `:1779` **有明确免责声明**：「**快照**：2026-09-27 11:51 CST……本节是**当时值**，不是常量」。
> 这是一处**诚实标注**，记一功。但「快照」这句话本身也已经过期（实际 HEAD 是 09-28 12:10），且下列逐项差异**没有任何一处被标注**。

| 项 | 文档（`:行`） | 实测 | 差 |
|---|---|---|---|
| 总条目 | 132（`:1785`） | **133** | −1 |
| 真实优惠 | 80（`:1786`） | 80 | ✅ |
| 其中：国内 / 国外 | 60 / 20（`:1787-1788`） | 60 / **73** | **国外 −53** |
| 工具信息 | 52（`:1789`） | **53** | −1 |
| 带时间信息 | 61（`:1790`） | 61（`validity` 非空） | ✅ |
| 人工核验 / features | 32 / 32（`:1791-1792`） | 32 / 32 | ✅ |
| 价格阶梯 | 3（`:1793`） | 3 | ✅ |
| 中文译文 | 43 条 / 61 字段（`:1794`） | 43 条 / 61 字段 | ✅ |
| 来源 Futuretools | 31（`:1811`） | **32** | −1 |
| 分类「视频」 | 9（`:1820`） | **10** | −1 |

- **「其中：国外 20」这一条要单独说**：`:1787-1788` 是**按 `type=deal` 过滤后**的国内/国外拆分（60 + 20 = 80，与「真实优惠 80」自洽），
  而 `:1785` 的 132 是全部条目。**读者极易把「国外 20」当成「国外条目总数」**，实测国外条目总数是 **73**（含 53 条工具）。
  同一份文档 `:1813` 又写「跨源去重后 132 条」——**132/20/73 三个数在同一节里没有任何一句话解释口径**。
- **会不会误导人**：🟡 会因为「国外 20」低估国外内容规模 3.6 倍。
- **本节正确的地方（我逐条复现）**：`:1797`「**50 张卡片** = 47 张单条卡 + 3 张折叠卡（智谱AI 1 张覆盖 7 个模型、百度千帆 1 张覆盖 17 个、火山方舟 1 张覆盖 9 个）」
  —— 构建自检实测 `折叠无损: 50 张卡片覆盖 80 条优惠（3 张折叠卡 / 33 个模型）` ✅；
  `:1802-1803` 力度分档（卡片口径 6/20/19/5/0）—— `npm run report:tier` 实测**逐档一致** ✅；
  `:1806` 「可索引 URL 81 个」—— sitemap 实测 81 ✅；`:1807`「50 个卡片标题链接全部指向站内详情页」—— 构建自检 ✅。

#### D-补 A 🟡 `见 P0-2` 是断链（三处引用，零处定义）

- **文档说**：`SUMMARY.md:11`、`SUMMARY.md:89`、`NEXT-STEPS.md:26` 都写「线上复测值待复测（**见 P0-2**）」。
- **实测**：在整个仓库的 `.md` 文件里搜 `P0-2`，**只命中这三处引用，没有任何一处定义它是什么**。
- **会不会误导人**：🟡 三处都在说「这里有个已知未解决的洞」，但读者**无从知道 P0-2 指什么、在哪儿跟踪**。
  看起来是从某份未入库的待办清单里抄来的编号。

#### D12 ✅ 一处「文档比我想的更准」：`README.md` 的断言数分解完全正确

任务提示怀疑 README 里的 136/142 与实际不符。**我实测：完全正确。**

- `README.md:407-409`：「`npm run verify`：跑 **136 项断言**（无 `--compare`；带基线回归比对的 `npm run verify:regress` 共 **142 项**。
  静态 `check()` 调用点 143 = 136 常跑 + 6 回归 + 1 条仅在基线文件缺失时执行的失败分支）」
- **实测**（机械计数 `scripts/tools/verify-site.js` 第 1 列 `check(` 开头、排除注释块）：**总 143 = 非回归 136 + 回归 7**；
  回归的 7 条里 `回归基线文件存在`（`:2083`）只在基线缺失时执行 ⇒ 常跑路径 **142 项**。
- **实跑验证**：`node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json` → **`✅ 验收 142 项，失败 0 项`，exit 0**。
- ⇒ **README 这一处是当前唯一一份「断言数 = 现实」的文档**；反过来说，`PROJECT_STATUS.md`(124/129)、`NEXT-STEPS.md`(124/129)、
  `SUMMARY.md`(108/113) 三处的断言数**全部过期**（D13/D14/D15）。

#### D13 🔴 `PROJECT_STATUS.md` 命令速查与「技术栈」：verify 124 / regress 129

- **文档说**：`:1735`「`npm run verify` 真浏览器验收（**当前 124 项**断言；加 `--compare` 为 129 项……）」；
  `:1738`「`verify:regress`（**124 + 5 项**断言）」；`:1921-1923`「**124 项**断言……文件里 **130 个** `check()` 调用点 = 124 常跑 + 5 回归 + 1 条仅基线缺失时执行的失败分支」。
- **实测**：136 常跑 / 142 regress / **143 个 `check()` 调用点**。
- **差在哪**：124 是 **2.29** 的当时值。2.30 加了 §4b 三条、2.31 又加了断言、2.32「换了 1 条、补了 4 条」——
  **2.32 那节自己写了 136/142**（`:1696`），却**没有回头改命令速查与技术栈**。
- ⇒ **同一份文件内 124（`:1735`）与 136（`:1696`）并存，且都在宣称是「当前」**。
- **会不会误导人**：**会**。命令速查是「怎么用这个项目」的入口；一个人按「124 项」预期去看一次红/绿，会对不上。
  更糟的是这个数字**被 CI 之外的读者当作门禁强度指标**——实际门禁比文档强 12 项。

#### D19 🟡 `selftest:zh` 项数：文档 7，实测 9

- **文档说**：`PROJECT_STATUS.md:29-30`「`selftest:zh` **7 项 0 失败**」。
- **实测**：`npm run selftest:zh` → **`✅ 演练 9 项，失败 0 项`，exit 0**。
- **差在哪**：`:1735` 附近的命令速查没写项数；但 `NEXT-STEPS.md:81,:125` 两处写 `selftest:zh`**(9)**——
  **同一项目的两份文档给出 7 和 9 两个数**，7 是 2.27 的当时值、9 是 2.29 之后的当前值。
- **会不会误导人**：🟡 无法据此判断「译文门禁有没有退步」（7 → 9 是**增强**，但文档没说是增强）。

#### D21 🟡 「48 条自动条目没有特性标签」：分母对不上

- **文档说**：`PROJECT_STATUS.md:1867`「给自动采集条目补 `features`：目前 **48 条**自动条目没有特性标签，卡片回退展示 `discountInfo`」。
- **实测**：`features` 非空 32 条，总条目 **133** ⇒ 无 `features` 的是 **101 条**。
- **差在哪**：48 这个数只在「`type=deal` 且无 features」的口径下有希望成立——
  实测 `deal` 里无 features 的是 **48 条**（80 − 32 = 48）✅。
- ⇒ **口径是对的，措辞是错的**：它说的是「自动采集**条目**」，实际口径是「**优惠**条目（`type=deal`）里的自动采集部分」。
- **会不会误导人**：🟢/🟡 一个想按这个数字排期的人会低估工作量（48 → 实际 101）。

#### D22–D25 🟡 `docs/DESIGN-RULES.md` 的「落地情况（F 阶段回填）」三条数字过期

- **文档说**：`:146`「筛选按钮 **11/11** 带 `aria-pressed`」；`:147`「卡片与列表行……（**62/62** 可聚焦）」；
  `:150`「首页断掉 `deals.json` 仍有 **62 卡**」；`:104`「我们的 **62 张卡**的 facet 已够用」。
- **实测**：构建自检 `✓ 筛选条: **10** 个 facet 按钮`；`✓ 预渲染卡片: **50** 条`；`✓ 卡片 logo: 官方图形 32 个 / 名称缩写兜底 3 个`。
- **差在哪**：这些是 **2.22~2.29 的当时值**。2.30 把卡片从 62 折到 50、2.32 撤掉「只看已核验」那枚 facet（11 → 10）。
- **会不会误导人**：🟡 `DESIGN-RULES.md` 的定位是「可执行的设计规范 + 逐条落地证据」，
  它的**规范部分（§1–§9）我用得上的地方都对**（C1 对比度、T2 字重、M2 禁 `transition: all`、N1 外部请求 0 等），
  过期只在「落地情况」这一节的计数上。**结论：规范可信，回填数字不可信。**

#### D26 🔴 `research/GAP-MATRIX.md` 第 4 节仍写着 G11「⬜ 未做」

- **文档说**：`:92`「| G11 收藏 / 对比 | ⬜ **未做**（属 C） | — |」；`:96-98` G15/G16/G17 也都是 ⬜。
- **实测**：G11 **2.22 已落地**（`feat/favorites-compare` → `30d547f` 合并）、**2.29 已补完**
  （收藏列表入口 + 修「打开对比」）、**已上线**（`da3b6e1`，`NEXT-STEPS.md:64` 整节记录）。
  分支 `feat/favorites-compare`(`e0cd50d`) 已在 master 祖先里【实测 ✅】。
- **差在哪**：第 4 节 `:76` 自称「记录**到目前为止**实际落了什么」——**「到目前为止」这四个字让它变成了会过期的承诺**。
  同节 `:102` 的「总账」还写「断言 55 → **95**」，与 D13 同类的过期。
- **会不会误导人**：**会，而且是本清单里最容易造成实际返工的一条**：任何按 `GAP-MATRIX.md` 排期的人
  **会去做一件已经做完并已上线的事**。（`GAP-MATRIX.md:76` 前面有一句「上表是**研究时点的差距快照，不改写**」——
  但那只声明了第 1、2 节，**第 4 节恰恰是「回填」性质的，它自己承诺了要跟现状**。）

#### D27 🟡 `GAP-MATRIX.md` 落地总账里的两个数

- `:82`「首页 **62** 个标题链接改为站内」——实测 **50** 个（构建自检 `首页内链: 50 个标题链接全部指向站内详情页`）。
- `:102`「断言 55 → **95**」——实测现为 136（常跑）/ 142（含回归）。95 应是 2.19 阶段的当时值。
- `:83`「首屏完整可见 9 → **13 行**」——✅ 与当前一致（列表视图口径）。
- `:86`「亮色 400 抽样 100 → 0 条不达标（最低 2.84 → 4.51）」——✅ 与 `verify` 断言文案一致。

#### D28 🟢 `research/README.md` 的「我们自己」那一行

- `:65` 表格最后一行「**★ 我们自己**……5.9 屏 / 正文 11459 字 | 首屏完整可见 **9** | **0（内链仅 1 条）** | **100 / 400**」
  + `:67` 注「我们自己的数字同样由 `study-site.js` 量（`research/_raw/ours-baseline/`）」。
- **实测**：`research/_raw/ours-baseline/metrics.json` 的 `fetchedAt = 2026-09-22T16:45:09Z`，
  `desktop.pageHeight = 5334`、`scrollScreens = 5.9`、正文 11459 —— **文件与表格完全一致**。
  但这份快照是 **09-22（方案 A 落地前）** 的：现在页高 4566px、卡片 50 张、内链 50 条、对比度已 0 条不达标。
- **会不会误导人**：🟢 该文 `:134` 已声明「所有数字是某一时刻的渲染结果，站点改版即失效；重跑同一条命令即可刷新」，
  且 `:65` 那行本身标注为「研究基线」。**这是有免责声明的过期，可以接受**——
  唯一缺的是「该行数值 = 方案 A 落地前」这一句。

### 5.2 五条「未过期」的验证（避免只报坏消息）

我复核了 5 条在当前 HEAD 上**仍然成立**的强声明：

| 声明 | 位置 | 实测 |
|---|---|---|
| 发布产物含完整静态正文，不依赖 JS | `README.md:19-20` | ✅ 构建自检 `预渲染卡片: 50 条`、`详情页数量: 80 个` |
| 无外部请求（不热链 CDN） | `README.md:336`、`DESIGN-RULES.md:85` | ✅ `verify` 断言「没有外部请求（无 CDN 热链）— 全部同源」 |
| 构建确定性（两次 build 一致） | `DESIGN-RULES.md:86`、`NEXT-STEPS.md:29` | ✅ 我连跑 3 次 `npm run build`，`dist/index.html` SHA256 **恒为** `A188233A…` |
| 折叠无损（50 卡覆盖 80 条） | `NEXT-STEPS.md:110,124`、`PROJECT_STATUS.md:1599` | ✅ 构建自检 `折叠无损: 50 张卡片覆盖 80 条优惠（3 张折叠卡 / 33 个模型）` |
| 策展数据 32 条 = curated_cn 18 + curated_global 14 | `README.md:120` | ✅ 实测两文件分别 18 / 14 条，`verified=true` 恰好 32 条且**全部来自 Curated-CN/Curated** |

---

## 6. README「快速开始」命令跑通抽查

**抽查结果：4/4 全部跑通，零报错。**【实测】

| # | 命令 | 退出码 | 实测输出（摘） | 判定 |
|---|---|---|---|---|
| 1 | `npm test` | **0** | 「✅ 校验通过」；总 133 / 真实优惠 80 / 国内国外 60/73 / 含截止时间 0 / 有效期说明 61 / 活动期限 有 0·未标注 112·长期 21 / 人工核验 32 / 特性标签 32 / 价格阶梯 3 / 策展 32；**警告 2 条**（见下） | ✅ 通过 |
| 2 | `npm run check:zh` | **0** | 「已贴 44 条 / 62 个字段（数据共 133 条）· ✓ 漂移 0 处 · ✓ 待译 0 条 · ✅ 译文与数据一致」 | ✅ 通过 |
| 3 | `npm run report:tier` | **0** | 首行「=== 分档分布（默认视图，**50 张卡片**）==="；①完全免费 6 · ②免费额度 20 · ③身份优惠 19 · ④折扣促销 5 · ⑤付费为主 0；末行「共 50 条。」 | ✅ 通过 |
| 4 | `node scripts/serve.js --dir=dist` | （后台 job） | `GET http://127.0.0.1:8080/` → **HTTP 200，294055 字节**，`<title>AI 优惠聚合器 — 国内外大模型免费额度与折扣（每日更新）</title>`；`GET /deals.json` → **HTTP 200，132665 字节** | ✅ 通过 |

**额外抽查（README 其它章节点名的命令）**：

| 命令 | 退出码 | 实测 |
|---|---|---|
| `npm run build`（README:32） | 0 | 自检 20 项全过；产物 139 文件；`产物总大小: 537.5 KB`；连跑 3 次 index.html SHA256 一致 |
| `npm run selftest:zh`（README:371） | 0 | `✅ 演练 9 项，失败 0 项` |
| `npm run selftest:expiry`（README:325） | 0 | `✅ 活动期限自测：55 项通过，0 项失败` |
| `npm run report:vendor`（README:48,344） | 0 | 末行 `官方品牌图形: 38 家 / 名称缩写兜底: 42 家 / 共 80 家`（**与 README:344 写的「39 家 / 共 77 家」不符** → D10） |
| `node scripts/tools/check-ci-consistency.js` | 0 | `✅ CI 口径检查 24 项，失败 0 项`（裸跑与 `--expect-checks=24` 两种调用都过） |
| `npm ci` | 0 | `--dry-run` 通过（**未真正重装**，避免动 node_modules） |

**`npm test` 的 2 条警告（既有、非本轮引入，与 captain §6.6 一致）**：

```
⚠️  警告 2 条：
  - 疑似同一优惠未合并：Getsolved ↔ Getsolved AI Detector（可在 scripts/data/aliases.json 登记别名）
  - 疑似同一优惠未合并：KREA ↔ Kreado AI（可在 scripts/data/aliases.json 登记别名）
```

两条都以**退出码 0** 通过（warning 不阻断）。**我未判断它们是真实数据缺陷还是别名表漏登记**——那属于数据线审计的范围（`aliases.json` 本身 3641 字节、可读）。

**README 里的命令全部存在**【实测】：`package.json` 的 14 个被 README 点名的 script 全部存在且映射正确，
`scripts/serve.js` 存在，`node scripts/serve.js --dir=dist` 的 `--dir` 参数被正确解析（日志显示「服务目录：…\dist」）。
**README 的快速开始这一节是本项目最可信的文档段落。**

**一处措辞小瑕**：README:37 写 `node scripts/serve.js --dir=dist`，README:40 也再强调一次——两处一致，✅。

---

## 7. `research/` 的价值判断

### 7.1 目录实况 【实测】

| 目录/文件 | 规模 | 内容 | 是否入库 |
|---|---|---|---|
| `research/vertical/` | **12 个 .md**，81 KB | 同类垂直站逐站报告（ai-bot.cn / aitools.fyi / appsumo / artificialanalysis / devtk / free-for-dev / futurepedia / futuretools / llm-prices / openrouter / TAAFT / toolify） | ✅ 入库 |
| `research/benchmark/` | **8 个 .md**，72 KB | 设计标杆逐站报告（framer / linear / notion / raycast / stripe / superhuman / thebrowser.company / vercel） | ✅ 入库 |
| `research/EVIDENCE.md` | 56 KB | 21 站的**机械汇总原始数字总表**，头部注明「生成时间：2026-09-22T17:04:20.414Z · 站点数：21」「由 `research/_raw/*/metrics.json` + `tokens.json` 机械汇总而成（只搬运、不解释、不打分）」 | ✅ 入库 |
| `research/GAP-MATRIX.md` | 15 KB | 18 条「该做」+ 9 条「明确不学」+ 方案 A/B/C 分界 + 第 4 节回填 | ✅ 入库 |
| `research/DESIGN-TOKENS.md` | 14.7 KB | 现有 token ↔ 标杆数值 ↔ 建议值 | ✅ 入库 |
| `research/VISION-REVIEW.md` | 30.3 KB | 23 条独立视觉评述 + 方法 / 硬约束 / 已知限制 | ✅ 入库 |
| `research/_raw/` | **37 个子目录**，219 文件，**61 MB** | 每站 4 件套：`metrics.json` / `tokens.json` / `dom-outline.txt` / `shots/*.png`；含 12 个 `mock-*` 与 4 个 `ours-*` | **部分入库**（110 个文件在索引里；截图按 `.gitignore` 排除） |

**`_raw` 的 37 个子目录分类**（实测）：20 个参考站 + 12 个 mock 快照（`mock-A/B/C-*`）+ `mock-index(-dark)`
+ 4 个自有快照（`ours-baseline` / `ours-A-light` / `ours-A-dark` / `ours-rows`）+ `AUDIT-CONTEXT.md`（本轮）。

**截图确实没入库，且理由写在 `.gitignore` 里**【实测】：
`research/_raw/**/shots/` + `research/_raw/**/*.png` 被排除，注释写「可重新生成且体积大（20 站 60 张约 49 MB），只入库结构与报告」。
⇒ `EVIDENCE.md:6` 那句「截图不入库（体积原因，可重跑 `study-site.js` 重新生成）」**属实**。

### 7.2 是否有过期结论仍在被引用？→ **有，两处，都在 GAP-MATRIX**

1. **`GAP-MATRIX.md:92`「G11 ⬜ 未做」**（D26）——已上线两周的工作被标成未做。**这是最该修的一处**。
2. **`GAP-MATRIX.md:102`「断言 55 → 95」**（D27）——落后 3 代（95 → 113 → 124 → 136）。

**被引用关系**【实测：grep 引用链】：
`SUMMARY.md:121` → `research/GAP-MATRIX.md`「差距矩阵：该做 18 条 + 不学 9 条 + **落地状态**」
（**明确说了会带落地状态**，读者会当真）；`SUMMARY.md:119-124` 列了 research 全套文件作为索引。
⇒ **过期结论是「被主动引用为现状」的**，不是躺在角落里没人看。

**相对而言，`research/` 整体是这个仓库质量最高的部分**【推断】：
- 方法（`:11-37`）写清了工具、口径、跑了几轮、修了哪些工具缺陷；
- `:72-82` 有「**剔除与受限清单（不藏坏消息）**」——主动列出抓取失败/受限的站；
- `EVIDENCE.md` 明确「**只搬运、不解释、不打分**」，把判断留在别处；
- `:119-136`「已知限制」4 条，其中两条（8192px 截图上限、整页截图可能是拼接产物 ⇒ 页高 ≠ 内容长度）
  **是视觉复核自己带回来的反向限制**，会削弱自己前面的结论，却照样写进去。
- 唯一系统性风险：**它是一份「一次性研究」的快照，却有一个声称跟现状的第 4 节**（`GAP-MATRIX` 第 4 节）。

---

## 8. NEXT-STEPS.md 的未尽事项：哪些还挂着、哪些其实已经做完

### 8.1 真正还挂着的（文档承认的可选项）【引用 + 实测】

| 事项 | 文档位置 | 状态 | 我的实测判断 |
|---|---|---|---|
| 三个观感项：控制带偏厚 / 强调色重复节奏 / 暗色卡片与底色明度差 | `NEXT-STEPS.md:53-56`、`SUMMARY.md:109-110` | **未做**（文档明说是取舍不是缺陷） | 与 `docs/DESIGN-RULES.md` 一致；无冲突 |
| G15 标题/描述量化词 | `GAP-MATRIX.md:96` | **未做** | ✅ 未做（`index.html` title 无数字） |
| G16 首页按意图重排 | `GAP-MATRIX.md:97` | **已按用户决定撤下**（不算待办） | ✅ 一致（`PROJECT_STATUS.md:1107-1130` 有 2.24 决议） |
| G17 英文覆盖 | `GAP-MATRIX.md:98` | **未做**（带持续人工成本） | ✅ 一致（`hreflang` 实测 2 条自指） |
| `priceLine` 覆盖率（现 3 条） | `PROJECT_STATUS.md:1870` | 挂着，不强制 | ✅ 实测 3 条 |
| 给自动采集条目补 `features` | `PROJECT_STATUS.md:1867` | 挂着 | ✅ 实测 101 条待补（文档写 48，见 D21） |
| 来源健康度监控 / 到期归档页 / 自定义域名 | `PROJECT_STATUS.md:1852-1856` | 挂着 | ✅ 未做 |
| 无头来源健康度监控（连续 N 次零产出就报警） | `PROJECT_STATUS.md:1852` | 挂着 | ✅ 未做（`probe-sources.yml` 只跑过 2 次，7 天无复检） |
| 名称缩写兜底还剩 N 家 | `PROJECT_STATUS.md:1884` | 挂着 | ⚠️ 数字过期（77 → 80 家，兜底 39 → 42 家） |
| 产物体积优化（详情页内联样式抽 `app.css`） | `PROJECT_STATUS.md:1889-1891` | 挂着 | ✅ 未做（`dist` 实测 139 文件；index.html 294055 字节 ≈ 287 KB，**已比文档写的 197.7 KB 涨了 45%**） |

### 8.2 文档滞后：已经做完却还被写成「挂着 / 未做」的【实测】

| 事项 | 文档说 | 实测 |
|---|---|---|
| **G11 收藏 / 对比** | `GAP-MATRIX.md:92`「⬜ 未做（属 C）」 | **2.22 已落地 + 2.29 已补完 + 已上线**（`feat/favorites-compare`/`e0cd50d` 是 master 祖先；`da3b6e1` 推送；`NEXT-STEPS.md:64-89` 整节记录） |
| **「已核验」角标相关的一切** | `PROJECT_STATUS.md:27`「卡片信息层级……数据更新日期」未提；旧断言数仍在 | 2.32 已撤（实测 `dist/index.html` 里「已核验」仅剩 1 处**注释**，无渲染文本） |
| **2.30 卡片折叠** | `SUMMARY.md`（全篇）、`NEXT-STEPS.md:110` 都停在 62 张 | 现场 50 张 |
| **2.31 对抗性复核的 9 个修复** | `SUMMARY.md` 完全没有；`NEXT-STEPS.md:130-135` 有记录 | ✅ 已入库（`f9826fd` + `43eba28` 在 master 祖先里） |
| **2.32 撤「已核验」** | `SUMMARY.md` / `NEXT-STEPS.md` 都没有 | ✅ 已入库（`e01dcfc` + `ca183b9` + `a0c4ab2`） |
| **09-28 的两批定时数据** | 无处记录 | ✅ 已入库（`d77b9cc` / `98d9550`） |
| **`PROJECT_STATUS.md:1735` 命令速查的项数** | 124 / 129 | 136 / 142 |

### 8.3 「未尽事项」的结构性问题【推断】

`NEXT-STEPS.md` 的**设计意图**是「待你点头的事」——它本质上是一份**对话记录**（「你说 push」「已按你的推送」），
不是状态文档。它因此**天然不会自我更新**：事情办完了，条目就沉在「一、已经办掉的」里，而头部的「现在」指针没人动。
⇒ **修法不是「让它保持最新」，而是让它明确不承担「现状」职责**（现状应由一份独立、可机器生成的
`STATUS.md` 承担——见 §10 建议）。

---

## 9. 我做不到的事（明确声明，避免被当作已验证）

| 我想做的 | 结果 | 原因 |
|---|---|---|
| 取 `e01dcfc` 失败 job 的**日志正文** | ❌ **403** | `/actions/runs/{id}/logs`、`/actions/runs/{id}/attempts/1/logs`、`/actions/jobs/{id}/logs` 三个端点全部返回 `{"message":"Must have admin rights to Repository."}`；`gh` CLI 不可用 |
| 取 job 的 **annotations** | ❌ **404** | `/actions/jobs/{id}/annotations` → `Not Found`（该端点需认证） |
| 读 **branch protection / required status checks** | ❌ **401** | `/branches/master/protection` 三个端点全 401；但 **`/rulesets` → `[]`（空）** —— 即**没有仓库级 ruleset**，`PROJECT_STATUS.md:7.5` 讨论的「必需检查该填什么」**至今没有落到任何可公开观察的配置上** |
| `git ls-remote` / 任何 git 网络操作 | ❌ 连接失败 | 本机 `http.proxy=127.0.0.1:7890`（FlClash）无进程 → `Failed to connect to 127.0.0.1 port 7890`；去掉代理直连 → `Recv failure: Connection was reset` / `port 443 Couldn't connect`。（**远端 tag 状态改用 HTTPS API 核实**：`/tags` → `[]`，结论未受影响） |
| 判断「fetched git history 是否被 rewrite 过」 | 未做 | 超出本任务范围 |
| 复算 `SUMMARY.md:52` 的「同源内链 308 条」 | ⚠️ 未复算 | `PROJECT_STATUS.md:1807` 自己声明「本轮不去复算它」；我沿用这条声明，**不为其背书** |
| 判断 2 条「疑似同一优惠未合并」是数据缺陷还是别名表漏登记 | 未做 | 属数据线审计范围，避免与 teammate 重复 |

**两个已知的「可能被误读为 0」的测量口径**：
1. `pull_request` 触发的 run 累计 **0 次**（`/actions/runs` 最近 30 条里无 PR run；`verify.yml` 的 PR 触发**从未真的用过**）。
   ⇒ 「`gate` 是 PR 门禁」在实践中**等于零覆盖**。
2. `probe-sources.yml` 只有 **2 次** run，最后一次 **2026-09-21**（7 天前）。⇒ 它的「出口 IP 可达性」结论**是 7 天前的**，
   `README.md:230`「出口 IP 已实测可达（`bigmodel.cn` 与 `volcengine.com` 均返回 HTTP 200，无风控特征）」
   **在时间上已经陈旧**（虽然措辞是「已实测」，不是「现在可达」）。

---

## 10. 给下一轮的具体建议（按性价比排序）

1. **建立一份机器生成的 `STATUS.md`（1 页）**，内容全部来自命令输出而非人手抄：
   `git rev-parse HEAD`/`origin/master` + `validate.js` 的分布块 + `verify`/`verify:regress` 的项数
   + `check-ci-consistency` 的项数 + `selftest:*` 的项数 + 最近 5 次 workflow run 的 conclusion。
   然后在 `SUMMARY.md`/`NEXT-STEPS.md` 头部把「当前值」全部替换成一句「**当前值见 `STATUS.md`（自动生成）**」。
   ⇒ 这一条能一次性消灭本清单里 **D1/D2/D4/D5/D6/D7/D13/D14/D15/D19/D20/D27 共 12 条**偏差。
2. **给 `GAP-MATRIX.md` 第 4 节加一行醒目的「本节最后校准于 `<sha>`」**，并把 G11 改成 ✅。
   ⇒ 消灭最危险的一条（D26）。
3. **`PROJECT_STATUS.md` 头部日期改成与正文同步**（或用「最后更新 = 最后一节的日期」这一规则自动校验）。
4. **在 `README.md` 的「自动化与部署」一节补一句机制声明**：
   「`verify.yml` 的 `gate` 与 `deploy.yml` **互不阻塞**：master 上一次红门禁**不会**阻止当次发布；
   `gate` 只有被设为 PR 必需检查才有拦截力，而本仓库当前没有 PR 流程。」
   （`PROJECT_STATUS.md:7.5` 已经把素材写全了，只差这句放在 README 里。）
5. **执行 `PROJECT_STATUS.md:2017-2025` 那份台账**（11 个已并入分支 + 1 个残留 worktree + 2 个本地 tag），
   或至少在台账里补上它漏掉的 `trial/fav-cmp-merge` 与 `fix/favorites-entry-and-compare-open`。
6. **给 `probe-sources.yml` 加个提醒**（每季度一次手动复检，或写进 `NEXT-STEPS.md` 的待办），
   否则「出口 IP 可达」这条结论会越来越旧而没人发现。

---

## 附录 A · 命令清单（本任务实际执行的命令，供复跑）

> 全部只读。**没有** `commit` / `push` / `fetch` / `branch -d` / `tag -d` / `stash drop` / `worktree remove`。
> 唯一的写操作是 `npm run build`（重建 `dist/`，脚本自带暂存目录 + 自检，`.gitignore` 覆盖 `dist/`），
> 以及新建本文件与（captain 的）`research/_raw/AUDIT-CONTEXT.md`。

### A.1 git 实况

```bash
git rev-list --count HEAD
git log --reverse --format="%H|%ai|%s" | head -1
git log -1 --format="%H|%ai|%s"
git log -20 --format="%h|%ai|%s"
git log --format="%ad" --date=short | sort | uniq -c          # 按天分布
git for-each-ref --sort=-committerdate refs/heads --format="%(refname:short)|%(objectname:short)|%(committerdate:iso8601)|%(subject)"
git branch --merged master --format="%(refname:short)"
git rev-list --count master..<branch>   # 与 <branch>..master，逐个分支
git rev-parse HEAD ; git rev-parse origin/master
git status --short
git worktree list
git rev-list --merges --count HEAD
git merge-base --is-ancestor 0d6b869 master ; git merge-base --is-ancestor 882da8d master ; git merge-base --is-ancestor cfd443b master
git log --oneline master..trial/merge-rehearsal
git log --oneline master..backup-pre-rewrite
git log --oneline 250ba12..e01dcfc
git log --oneline 52f6164..master
git branch -vv
git stash list
git for-each-ref --format="%(refname) %(objectname:short)"
git ls-files research/_raw | wc -l
git check-ignore -v research/_raw/mock-A-dark/metrics.json
```

### A.2 GitHub API（Node https，未用 gh CLI）

```bash
# 全部走 https://api.github.com，User-Agent: audit-script
GET /repos/buguoshixc/ai-deals-aggregator                       # default_branch / pushed_at / has_pages
GET /repos/{repo}/branches/master                               # 远端 master sha
GET /repos/{repo}/git/refs/heads                                # 远端只有 master
GET /repos/{repo}/tags                                          # []（远端无 tag）
GET /repos/{repo}/rulesets                                      # []（无 ruleset）
GET /repos/{repo}/branches/master/protection                    # 401
GET /repos/{repo}/branches/master/protection/required_status_checks   # 401
GET /repos/{repo}/branches/master/protection/required_pull_request_reviews  # 401
GET /repos/{repo}/actions/runs?per_page=30                      # total_count=90 + 最近 30 条
GET /repos/{repo}/actions/workflows/{collect|deploy|verify|probe-sources}.yml/runs?per_page=1
GET /repos/{repo}/actions/runs/{id}/jobs                        # 步骤级结论（142 那次 + e01dcfc + 777e3b7 + collect#17）
GET /repos/{repo}/actions/runs/{id}/logs                        # 403 Must have admin rights
GET /repos/{repo}/actions/runs/{id}/attempts/1/logs             # 403
GET /repos/{repo}/actions/jobs/{job_id}/logs                    # 403
GET /repos/{repo}/actions/jobs/{job_id}/annotations             # 404
GET /repos/{repo}/commits/{sha}/check-runs                      # e01dcfc / ca183b9 / a0c4ab2 / 98d9550
```

### A.3 文档与产物核对

```bash
node -e "…"            # 从 deals.json 统计 type/region/zh/feature/priceLine/verified/来源/分类分布
node -e "…"            # deals.json vs dist/deals.json 的 zh 覆盖差异；translations_zh.json 孤儿 id
node -e "…"            # dist/sitemap.xml <loc> 计数；dist/index.html 关键文案 grep；已核验计数
node -e "…"            # curated_cn/global 条目数；verified=true 的来源分布
Select-String -Path README.md,PROJECT_STATUS.md,NEXT-STEPS.md,SUMMARY.md -SimpleMatch -Pattern '108 项','129 项',…   # 数字定位（含行号）
Select-String -Path PROJECT_STATUS.md -Pattern '^#{1,4} '      # 小节号连续性（2.17→2.32）
[System.IO.File]::ReadAllLines(<md>, UTF8) + 行号打印        # 替代 Get-Content（避免中文乱码）
```

### A.4 门禁与命令跑通抽查

```bash
npm test
npm run check:zh
npm run report:tier
npm run report:vendor
npm run selftest:zh
npm run selftest:expiry
npm run build                                  # ×3（查构建确定性）
node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json
node scripts/tools/check-ci-consistency.js
node scripts/tools/check-ci-consistency.js --expect-checks=24
node scripts/serve.js --dir=dist               # 后台 job + Invoke-WebRequest 探测 / 与 /deals.json，随后 Stop-Job
npm ci --dry-run
(Get-FileHash dist/index.html -Algorithm SHA256).Hash
# 断言调用点计数：逐行扫 verify-site.js，排除 /* */ 与 // 注释块，统计 ^check( 的行数并按 '回归' 前缀分类
```

### A.5 环境备注（会影响复跑）

- **不要用 `Get-Content` 读中文 .md**（控制台编码乱码，实测验证过）——一律用 `read` 工具或 `[System.IO.File]::ReadAllLines(..., UTF8)`。
- Node 实测 `v24.13.1`；`engines` 要求 `>=20.18.1`。
- 本机 git 配了 `http.proxy=127.0.0.1:7890`（FlClash），**当前无进程在跑**，所以所有 git 远端操作都会失败；
  加 `-c http.proxy=` 直连也可能被 reset（实测 443 连不上）。**用 HTTPS API 代替**。
- `git log --format=%s` 里有若干提交的 subject **以 U+FEFF(BOM) 开头**（`674c63f`、`777e3b7`、`da3b6e1`、`0c7e5aa`、`92ff988` 等），
  这会让 `^docs:`/`^data` 这类正则静默漏匹配——**做提交分类时必须先剥 BOM**，否则会把 `docs` 归进「其他」。
