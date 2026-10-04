# ▶ 从这里继续：coverage-expansion-v1 交班手册 v2（自包含）

> **入口文件**。只读它就能接手，不需要上一轮对话。
> 状态时刻 **2026-10-05 01:05 +08**（分支 `coverage-expansion-v1`，HEAD `2ebcf62`，**远端仍无该分支、无 PR**）。
> 配套（细节更全，按需查）：`coverage-expansion-v1-RESUME-STATE.md` · `coverage-expansion-v1-AGENT-STATUS.md`。

---

## ✅ 0. 状态更新（2026-10-05 02:15 +08）：**本链路已全部完成，不必再续跑**

> 本节的读数**推翻**下面若干「现场判据」；下面原文全部保留（append-only），读的时候以本节为准。

| 项 | 01:05 手册写的 | **实际结果** |
|---|---|---|
| 远端分支 | 远端无该分支 | **已有**：`2ebcf62` 早已在远端（00:52Z 推送成功），本轮又推了 `503edde` → … → `a400936` |
| PR | 无 | **PR #38** 已建、已按 gate 转绿后合并 |
| 合并 | 未做 | **已合并**：merge SHA **`d444dcd732edcd7a4255fd48b707dbece7938970`**（2026-10-04T18:00:12Z，`--merge --delete-branch=false`） |
| 门禁 | 需重跑 | **已重跑**：冻结 tip 49 步 · **48 过 / 0 红 / 1 跳过** · `headChanged=false`；本地 `verify-site` **735/0** |
| CI | 未跑 | **`gate` = pass**（run `37222401719`）；此前**连续两次真红**，根因已定位并修复（见下） |
| 部署 | 未做 | **success**（run `37222667957`，head `d444dcd7`） |
| 线上冒烟 | 无读数 | **`compare-live.cjs --require-deployed` exit 0**（`data-model` 0→44 · `models-show-legacy` 0→1 · `data-release-date` 0→1 · 7 路由 200）· **`verify-site --url=` 735 项 / 失败 0** |
| 本机到 github.io | 不通 | **本轮实测通**（`fetch` 200 / 923 ms）⇒ 冒烟是直连取的，没用 `web_fetch` |
| t20 报告 §9/§16 | 待补 14 格 | **已补**：`coverage-expansion-v1-report.md` §**16.1**（append-only，保留原「未运行」行） |
| t22 | 未做 | **已交付** `coverage-expansion-v1-acceptance.md`：§87 **47/47 pass** · 0 FAIL · P0=0 · P1=0 · REPAIR_NOW=0 · §88 十五行逐条不成立 |

### CI 那次红的根因（**不是数据缺陷**，值得记下来）

`scripts/tools/coverage-targets-selftest.js` 的 `runReport()` 用 `spawnSync` 直接读子进程 stdout（**管道**）。
`report:coverage --json` 的 stdout 约 **218 KB**，超过管道缓冲；父进程未及排空时管里那截会**静默丢失**：
CI(Linux/Node 24.21) 实测只取回 **152,627 字符 / 185,186 字节**（本机 **180,774 / 218,443**），
且正好切在**多字节字符中间** ⇒ JSON 未终止 ⇒ `JSON.parse` 抛 `Unterminated string`
⇒「（隔离上游）JSON 可解析」红，并连带跳过 33 条下游断言（**110 项 → 75 项**）。
本机 Windows 约 180 KB 能完整读回，所以**长期只在本机绿**。

**修法**（`2d81e33`）：把子进程 stdout 重定向进**文件**再整份读回（不经管道）。
**反证**：同一份输入下管道捕获与文件捕获**逐字节相同**（sha256 `0b801f419f30c45b`，180,774 字符）。
收口：`29282ae` 移除临时诊断；CI 在 `2d81e33` 与 `29282ae` 上**都 pass**。

### 仍需人工知道的三件事

1. **验收产物已在版本库、但尚未进 `master`**：`a400936`（36 个文件）在分支 `coverage-expansion-v1` 上；
   `master` 停在 `d444dcd7`。若要让验收文档进 master，走一条 `docs(research)` 的小 PR 即可（同一条门禁链）。
2. **团队尚未 delete/archive**：`coverage-expansion-v1` 的 8 成员全 `idle`；t19/t22 仍是 `in_progress`。
   按纪律应在确认无未完工作后归档（本会话的 AgentTeams 工具不接管该团队，需由原队长会话处理）。
3. **两条变异盲区必须与「CAUGHT 24/27」一起引**（见 `coverage-expansion-v1-acceptance.md` §6）：
   ①「测试改自己」构造上接不住；②真实引文忠于官方页**没有离线门禁**。禁止写「真实引文已逐条验真」。

---

## 0. 三条环境事实（本轮实测，不知道就会走错路）

### 0.1 git 走的本地代理是**死的** —— 不是 github.com 不通
```
git config --get http.proxy   →  http://127.0.0.1:7890     # 该监听已死
```
经代理的一切 git 网络操作报 `SSL_ERROR_SYSCALL` / `schannel: failed to receive handshake`。
**直连是好的**（已实测）：
```powershell
git -c http.proxy= -c https.proxy= ls-remote --heads origin
# exit 0，列出：master d57aa3ef · fix/analytics-smoke-assertions 77131a6c · private-analytics-v1 13071909
```
⇒ **所有 git 网络命令都加 `-c http.proxy= -c https.proxy=`**（或先 `git config --unset http.proxy; git config --unset https.proxy`）。
⇒ **直连可用但不稳定**（两边都是实测）：00:57 `ls-remote` **exit 0** 并列出远端 refs；01:07 同一命令 `Failed to connect to github.com port 443 … Couldn't connect to server`（21 s 超时），随后连试 3 次全败。
⇒ 失败时**重试 3–5 次、间隔 30–60 s**，不要立刻断定「被墙」；`api.github.com` 一直可用（`gh api rate_limit` 实测 4996/5000）。
⇒ **不要**采纳「git-over-HTTPS 被阻断、只能走 Git Data API」这种单一结论（那是经死代理测出来的），也**不要**用 `research/_raw/t19/push-via-api.cjs` 原样跑：它按「git push 不可用 + 必须排除 1 个文件」设计，两条前提都不成立（文件已被 §0.2 的 bypass 解锁；排除文件会让推送树 ≠ 已审计的树）。

### 0.4 万不得已才走的 API 推送路径（**先读，别踩已知的坑**）
仅当 github.com 反复不通、而 `api.github.com` 可用时使用。已知坑与硬要求：
1. 内容必须取**索引里的 blob**（`git cat-file blob <sha>`，或 `git ls-files -s` 给出的 SHA）——**不要**上传工作区字节：本仓库 `core.autocrlf=true` 且 `.gitattributes` 有 `* text=auto`，工作区 CRLF 与索引 LF 不同 ⇒ 这正是旧脚本日志里「SHA 不一致 2…7」的来源。
2. 自底向上建 blob → tree → commit（复用远端已存在的 blob），**先建完所有 commit，再比对最后一个 commit 的 SHA 是否等于本地 `git rev-parse HEAD`**；相等才 `POST /git/refs`。commit SHA 是内容寻址的，**相等即逐字节保真**；不相等就**不要**建 ref（此时零不可逆动作，回头查树/父提交）。
3. 建 ref 前先 `GET /repos/buguoshixc/ai-deals-aggregator/git/ref/heads/coverage-expansion-v1` 确认分支不存在（存在就会 422）。
4. `git push` 与 API 建 ref 二者**只能用一个**，且推完必须回读远端 tip 与本地 HEAD 比对。

### 0.2 push protection 已按用户授权解开（**有期限：本地 03:53 前**）
仓库 public 且 `secret_scanning_push_protection=enabled`。`research/_raw/t15-url-verify/aws-q-overview.txt`（488,408 B，`5657fd8` 加入，origin/master 上没有）里两处被判为 `GITHUB_APP_TOKEN` 形状 —— 实测是 **AWS 图片文件名哈希**（`…reinvent-register.3822079bac49f139ae46016a9a99c3eed71fad4a.png`），文件内 `ghs_/ghu_/gho_/ghp_/ghr_/github_pat_/JWT/x-access-token` **全部 0 命中** ⇒ 假阳性。
用户已授权（2026-10-05 00:53）建两条 bypass：placeholder_id `3KEbokYAoknRipwKKssxVooiMxa` · `3KEbooqbesrsJtT11D5vms4YZ5S`，`reason=false_positive`。
**验证**：同内容 `POST /git/blobs` 现返回 `78984fbdc9ccf69362fd05bba93156698b707bee`，与本地 index blob **逐字节相同** ⇒ 该文件可原样进分支：**不改历史、不排除文件、SHA 不变**。
到期后若又被拦：从 422 响应的 `metadata.secret_scanning.bypass_placeholders[].placeholder_id` 取值，再执行
`gh api --method POST repos/buguoshixc/ai-deals-aggregator/secret-scanning/push-protection-bypasses -f placeholder_id=<id> -f reason=false_positive`（**建之前先问用户**）。

### 0.3 名称与端点
owner 是 **`buguoshixc`**（题面 `buguoshixix` 是笔误 → 404）· 线上 `https://buguoshixc.github.io/ai-deals-aggregator/` · 必需检查名 **`gate`** · master **无分支保护** · Pages `build_type=workflow` · `gh` 已登录（keyring，作用域含 repo+workflow）。
本机直连 github.io 目前**不通** ⇒ 线上冒烟读数可用 `web_fetch`（走外部网络）取回，并在回执里注明取回方式。

---

## 1. 现场检查（先跑这六条，别凭记忆）

```powershell
cd ".worktrees/coverage-expansion-v1"
git log --oneline -3
git status --short
git -c http.proxy= -c https.proxy= ls-remote --heads origin
gh pr list --head coverage-expansion-v1 --state all
gh run list --workflow "Deploy to GitHub Pages" --limit 5
```

| 现场 | 含义 | 从哪续 |
|---|---|---|
| 远端无分支 | 还没推（**01:05 的实际状态**） | §3 第 0 步 → 第 1 步 |
| 有分支、无 PR | 推了没建 PR | §3 第 2 步 |
| 有 PR、checks 未定 | 等 CI | §3 第 3 步（人工确认名为 `gate` 的检查 success） |
| 有 PR、已 merge | 已合 | §3 第 5 步（等 Deploy）→ 第 6 步（冒烟） |
| 线上 `data-model=44` | 已部署生效 | §4 的 t22 与 §9 补格 |

---

## 2. 任务板现状（01:05，team `coverage-expansion-v1` —— **继续用它，别新建**）

46 任务；只看这四条：
- **t19 [in_progress · attempt 4] → research-firstparty**：已把 `origin/master` 合进分支（**`2ebcf62`**，取 master 最新采集的 `deals.json` / `source-health.json` / `source-snapshots.json` / `zh-pending.json`）。推送到现在**未完成**。
- **t20 [completed]** → `research/coverage-expansion-v1-report.md`（31,356 B；sha256 `8f37f409aa5f40542b8017bc15b4dd2922e5427522eed5520a246acffd9417ec`）＋ 两份调查文档的**纯追加**对账节（model-currentness 96/0、provider-review 58/0）。
- **t21 [completed]** → `research/coverage-expansion-v1-self-audit.md`（≈40 KB · 12 节 · 15 行矩阵）：**P0=0 · P1（未关闭）=0**；变异 24/27 CAUGHT + **2 条留档盲区**；「降低断言的文件 0 个」；`sameIdentityDifferentId` 为空、`removedIds=0`、slug 44→44 顺序未变；`source-health` 漂移与 t15-F6 审查侧误判均如实写入。
- **t22 → §87 逐条核对（题面 **47 条**，不是 44）**：依赖 t20+t21 **已满足**。
  ⚠️ 但 `research/_raw/t22/`（`extract-checklist.cjs` + `checklist.json`）已于 **01:01** 出现 —— 疑似某个成员已经开始动手（可能是调度器把 t22 唤给 `coverage-engineer`）⇒ **先看任务板确认 t22 的真实归属与状态，别重复派同一任务**。
- 其余：t1–t18、t23–t46 除 `t8 / t9 / t11 / t14 / t15 / t43`（终端 failed 但**产物都在盘上**、内容已被后续任务覆盖）外均 completed —— **不要重做这些**。

---

## 3. 剩余链路（命令级；不可逆动作一律卡在绿的前置之后）

### 第 0 步 · 冻结 tip 上的门禁（**必须重跑**：2ebcf62 合了 master 的数据）
```powershell
node research/_raw/coverage-expansion-v1/t18-gate-runner.cjs   # 期望 49 步 → 48 过 / 0 红 / 1 跳过（跳过=npm ci）
node scripts/tools/build-local.js                              # exit 0
node scripts/tools/verify-site.js                              # 期望 0 失败（历史读数 735/0，合并后需重取）
git rev-parse HEAD ; git status --short                        # 记下 HEAD；树里只应有 research/_raw/** 未跟踪
```
速查批次：`node scripts/validate.js --strict` · `node scripts/tools/check-ci-consistency.js`（**38 项 0 失败**；`--expect-checks=37` **必须** exit 1）· `node scripts/tools/coverage-report.js`。
> 队长 00:56 曾在 `2ebcf62` 上跑过一次全量门禁，一路 PASS 到 `SEO verification`，但为避开与 t19 成员并发构建而中止 ⇒ **那只是部分读数，不是结论**。

### 第 1 步 · 推送（**不可逆**，public 仓库；bypass 有效期 ~03:53）
```powershell
git -c http.proxy= -c https.proxy= push -u origin coverage-expansion-v1
```
被 push protection 拦（GH013 / "Push cannot contain secrets"）⇒ 见 §0.2（不要重写历史、不要排除文件、不要 `--no-verify`、不要 force push）。

### 第 2 步 · 建 PR（正文文件已写好）
```powershell
gh pr create --base master --head coverage-expansion-v1 `
  --title "feat(coverage): coverage-expansion-v1 —— 结构化覆盖体系 + 4 家推理平台定价 + 8 条国际 Coding 套餐" `
  --body-file research/_raw/t19-pr-body.md
```
正文里补三条事实：① 本分支**已合并 master 最新自动采集**（`2ebcf62`）；② `source-health` 是**活读数**（见 §4.1）；③「未验证与已知边界」里写明 §87 是 **47 条**、线上冒烟在部署后才有读数。

### 第 3 步 · 等 CI（人工确认，平台不会拦）
```powershell
gh pr checks --watch        # 必须看到名为 gate 的检查 success
```

### 第 4 步 · 合并（**不可逆**）
```powershell
gh pr merge --merge --delete-branch=false      # 记下 merge SHA
```

### 第 5 步 · 等部署
```powershell
gh run list --workflow "Deploy to GitHub Pages" --limit 5      # 等到 success
```

### 第 6 步 · 线上冒烟
```powershell
node research/_raw/t40/compare-live.cjs --before=research/_raw/t40/live-baseline.json `
  --poll-after=research/_raw/t40/after-deploy.json --timeout-min=12 --interval-sec=45 --require-deployed
node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/
```
期望：`data-model=44` · `models-show-legacy≥1` · legacy 详情页 `data-release-date≥1` · 7 条路由 200。
⚠️ 基线快照拍的是**合并 master 之前**的线上旧版，且本机到 github.io 直连目前不通 ⇒ 若直连失败，用 `web_fetch` 抓 `…/models.json` 与首页核对（44 条模型 / catalogStatus 分布 / `data-model=44`），并注明取回方式。

### 第 7 步 · 补格与收尾
- 把 14 个部署读数补进 t20 报告的 §9（Online Smoke）—— t20 已 completed，**只许 append**（注明「按 t19 回执填入」）或另立一个小任务，**不许改写已发布结论**。
- t22：按 `research/_raw/t38/section87-precheck.md` 对 **47 条**逐条判定 pass/fail（每条给文件路径 + 可执行命令 + 状态），交付 `research/coverage-expansion-v1-acceptance.md`。
- 全部 terminal 后再 delete/archive 团队；**不要**丢下未完成的工作。

---

## 4. 已过期 / 易写错的读数（不修正就会写错）

1. **`source-health` 是活的**：基线 `a4dd40f` = **healthy 8 / failed 1**（futurepedia `cf=9`、HTTP 403）→ 中途 `9/9 healthy` → **现在又是 failed 且 `consecutiveFailures=10`**（`generatedAt 2026-10-04T16:31:52Z`）。
   ⇒ 任何「futurepedia 已恢复 / 9/9 healthy」的表述**现在都过期**；t20 报告 §12、残余登记表 §4.1、`coverage-expansion-v1-source-health-rulings.md` 需按「**带 generatedAt + cf 的读数**」append-only 更正。t13 原句「已更新 source-health.json」为真（T15-F6 的「逐字节相同」已被证伪，见登记表 §4.1）。
2. **`2ebcf62` 合入 master 后**：`deals.json`（412 行）、`source-snapshots.json`（约 -607 行量级）等都变了 ⇒ 任何 deals 计数、sitemap `<loc>` 数、dist 页数、`coverage-report --json` 的 stdout sha256（上一读数 `ff039fa4a804a2d5e5a9004509670e3eb9babfd6db33723f2b6e3b5beab9dcf`，载荷段 `5288c615…`）**必须重跑重取**。
3. **baseline corrections 只许以「草稿→实测」引用，且必须带当前值**：`41→45（现 49）` · `36→37（现 38；旧值 36 长期住在 verify.yml 第 95 行注释里，调用行是第 125 行）` · `5023 字节 vs 5 条关系` · `8→9（现 10）`；C5 = 一手构建 **HTML 173 / 文件 290 / sitemap 170**。
4. **残余 = 34 条** + 清单 sha256 `b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696`（登记表**整文件** sha256 是另一个值 `b8b05522…`，别混）。
5. **§87 = 47 条**（题面 2568–2614 行程序化计数）；第 29/30 条的载体是**人读报告** `research/coverage-expansion-v1-source-health-rulings.md`（18,418 B），**不许**再写成「缺证据」。
6. **两条 M24 盲区**必须与「变异 24/27」一起引：①「测试改自己」构造上接不住（`NOT_CAUGHT(KNOWN)`）；②真实引文忠于官方页**没有离线门禁**（三层覆盖：抄件逐字耦合 + 独立审查 + 引文自称牙）。禁止写「真实引文已逐条验真」「0 命中 ⇒ 引文都是真的」。引 T26-F1 要用 t30 的 `acme_glm-5.3` 证据，**不要**用 zai 三例。

---

## 5. 未提交的产物（提交时**显式列路径**，别 `git add -A`）

新增：`research/coverage-expansion-v1-report.md` · `research/coverage-expansion-v1-self-audit.md` · `research/_raw/t19-pr-body.md` · `research/_raw/{t19,t20,t21}/**`
修改：`research/coverage-expansion-v1-model-currentness.md`（+96）· `research/coverage-expansion-v1-provider-review.md`（+58）

⚠️ **t19 正在跑门禁时不要提交**（HEAD 变化会让它的门禁读数失效）。先确认 t19 是否已收口，或等它跑完再提交。
⚠️ 提交消息一律写文件 + `git commit -F msg.txt`；**禁止** inline `-m` 带引号（PowerShell 会拆参数）。

---

## 6. 纪律（本轮教训换来的）

1. 瓶颈是**成员会话上下文**（>512k ⇒ 400 死：page-engineer 615k、data-integrator 671k）与**网关 503 维护**、**TPM 限流** ⇒ 契约短（报告限行数）、并发 ≤2–3、优先小会话成员（`research-firstparty` / `research-inference`）。
2. 每条改动配**反证**（构造违规输入 ⇒ 必红 + 对照绿）；报错要**点名数据对象并给实际/期望两侧**；断言**只增不减**。
3. 更正一律 **append-only**（T15-F6、T38-R1 两条审查侧误判就是这样留档的）。
4. 不可逆动作（push / merge / deploy）**卡在绿的前置之后**，失败就停在那一步并如实报告。
5. 禁止：force push · 改仓库设置或分支保护 · 绕过 CI 合并 · `git checkout --` 重置数据文件（曾吃掉未提交改动）· `git add -A`（曾把在途产物带走）· 把「未验证」写成「已满足」。
6. `master` 是移动靶（自动采集每轮都在推，如 `d57aa3e`）⇒ 推送前先合一次 master。
7. 成员内部 `subagent` 委派上限为 **0**（被拒：`AgentTeams member delegation limit (0) reached`）⇒ 成员必须自己写交付物。
8. 上一轮的**会话级定时提醒已删除**（提醒只属于创建它的会话）；若新会话需要，用 `schedule_create` 自建（建议 300s + 先探网络再决定）。

---

## 7. 证据索引

- 门禁与全量 Gate：`research/_raw/coverage-expansion-v1/t18-full-gate-report.md` · `t18-gate-results.json` · `t18-gate-runner.cjs` · `t41-derived-r5-readings.{json,md}`
- 审查与自审：`research/_raw/t26/report.md`（对抗性 pass）· `research/coverage-expansion-v1-data-quality-review.md`（t15）· `research/_raw/t28/`（t14 闭环 + 仲裁 34）· `research/coverage-expansion-v1-self-audit.md`（t21）· `research/_raw/t21/**`
- 变异电池：`research/_raw/t17/MUTATION-RESULTS.md` · `logs/battery.json` · `mutation-battery.cjs`
- 覆盖报告：`scripts/tools/coverage-report.js` · `research/_raw/t45/section41-audit.md` · `research/_raw/t46/README.md`（五态普查）
- 部署与冒烟：`research/_raw/t37/{t19-runbook.md,evidence.md}` · `research/_raw/t40/{live-baseline.json,compare-live.cjs,README.md}`
- 报告与素材：`research/coverage-expansion-v1-report.md`（t20）· `research/_raw/t39/report-inputs.md`
- 残余与裁决：`research/coverage-expansion-v1-residual-register.md` · `research/coverage-expansion-v1-source-health-rulings.md` · `research/coverage-expansion-v1-model-currentness.md` · `research/coverage-expansion-v1-provider-review.md` 与 `research/_raw/coverage-expansion-v1/provider-review.md`
- §87 预映射：`research/_raw/t38/section87-precheck.md`
