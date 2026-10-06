# secondary-page-layout-unification · 发布清单（captain 执行）

> 本文件由 t10（发布工程师）**只准备物料**：所有命令都写成可复制的，**没有一条已经在发布链上跑过**
> （唯一跑过的是 §1 的本地 dry-run，见 §1 S0 与 `online-smoke-dryrun*.json`）。
>
> 每步都有 **成功判据** 与 **失败时的处置**。§2 是 `verify.yml` / `deploy.yml` 的**逐条对照**——
> 里面的每条事实都标了出处（文件:行），因为这份清单最容易犯的错就是"凭印象写 CI 行为"。

## §0. 口径与前置事实（**逐条取自仓库当前文件，不是印象**）

| 事实 | 出处 |
| --- | --- |
| 基线 `origin/master = 1f225d2`；特性分支 `secondary-page-layout-unification`（尚未提交任何东西） | `git rev-parse origin/master`；`git status --porcelain` |
| 必需检查名 = **`gate`**（job 的 `name` 与 `id` **都**是 `gate`，且**永远不许有 job 级 `if`**） | `.github/workflows/verify.yml:56-58`、注释 `:15-19` |
| `verify.yml` 触发面 = `pull_request→master` / `push→master` / `workflow_dispatch`（手动带 `allow_degraded_run` 输入，默认 `false`） | `verify.yml:29-43` |
| `verify.yml` 权限只有 `contents: read`；并发组 `verify-${{ github.ref }}`，`cancel-in-progress: true` | `verify.yml:46-53` |
| `verify.yml` 的 gate job：`runs-on: ubuntu-24.04`、`timeout-minutes: 20`、`TZ: Asia/Shanghai`；两步 = 一致性门禁（`--expect-checks=38`）→ 调用复合 action | `verify.yml:55-62`、`:124-132` |
| `deploy.yml` 触发面 = `push→master` / `workflow_run(Collect AI Deals, completed, master)` / `workflow_dispatch` | `deploy.yml:20-27` |
| `deploy.yml` job 顺序 = **`prepublish`（跑与 PR 完全同一个门禁 action，`allow_degraded_run: 'false'`）→ `build`（`needs: prepublish`）→ `deploy`（`needs: build`）** | `deploy.yml:42-89`、`:91-95`、`:125-130` |
| `build` 的 `if` 是逐字冻结的：`github.event_name != 'workflow_run' \|\| github.event.workflow_run.conclusion == 'success'` | `deploy.yml:94`（`check-ci-consistency.js` 断言 (7b) 守着） |
| 发布产物 = `node scripts/tools/build-local.js` → `dist/` → `actions/upload-pages-artifact@v5`（`path: 'dist'`） | `deploy.yml:114-123` |
| Pages 部署 = `actions/deploy-pages@v5`（`id: deployment`），environment `github-pages` | `deploy.yml:125-135` |
| 门禁本体只有一处实现：`.github/actions/gate/action.yml`（当前 **49 步**，本机 Full Gate 跳过 4 步 CI 专用） | `gate/steps/summary.json` 的 `identity.stepsInAction` |
| 真浏览器不可用时**默认直接失败**（`exit 1`），只有 `workflow_dispatch` + `allow_degraded_run=true` 才降级并写 Summary；PR/push 路径这个输入解析为 `'false'` | `gate/action.yml:462-512`；`verify.yml:132`；`check-ci-consistency.js` 断言 (11) |
| 发布链**依赖 npm registry**（门禁里的 `npm ci` 要装 `playwright-core`） | `gate/action.yml:38-40`；README §自动化与部署 |
| `*.log` 被顶层 `.gitignore` 忽略（`*.log` 在第 4 行） | `.gitignore:4` |

**这次的改动面**（`git status --porcelain` 实测）：7 个源文件 ` M` +
未跟踪目录 `?? research/_raw/secondary-page-layout-unification/`。

## §1. 发布顺序（S1 → S11）

> 工作目录全程是 `D:\OneDrive\Desktop\Code\AI Page\.worktrees\secondary-page-layout-unification`。
> 所有命令都在这个 worktree 里跑（不要在主工作树跑 —— 那里的 `master` 与这里不是同一个检出）。

### S0（已完成，t10 做的）· 本地 dry-run 先证明冒烟脚本本身可用

```bash
node research/_raw/secondary-page-layout-unification/release/online-smoke.cjs --dir=dist --only=student/ \
     --out=research/_raw/secondary-page-layout-unification/release/online-smoke-dryrun.json
node research/_raw/secondary-page-layout-unification/release/online-smoke.cjs --dir=dist --only=deal:*,model:* \
     --out=research/_raw/secondary-page-layout-unification/release/online-smoke-dryrun-detail.json
node research/_raw/secondary-page-layout-unification/release/online-smoke.cjs --dir=dist.baseline --only=student/ \
     --out=research/_raw/secondary-page-layout-unification/release/online-smoke-negcontrol-baseline.json   # 负对照：必须 EXIT=1
```

- **成功判据**：前两条退出码 0；第三条**必须是 1**（改动前产物上 `note-narrow` + `frozenCount=0` 真红）。
- **失败处置**：脚本或判据本身有问题，**先修脚本再谈发布**（线上冒烟是发布链的最后一道验收）。

### S1 · `git fetch`

```bash
git fetch origin --prune
git rev-parse origin/master          # 记录这个 SHA
git log --oneline -3 origin/master
```

- **成功判据**：`origin/master` 存在；若它仍是 `1f225d2` ⇒ 与冻结基线一致；若已经前进（每日采集机器人
  的 `chore(data): … [skip ci]` 提交），**记下新 SHA**，后面 S2 的数据对账依然以 `1f225d2..HEAD` 比较
  （我们的改动不含任何数据文件，基线前进不影响"数据 0 变化"的结论）。
- **失败处置**：网络/凭据问题 ⇒ 重试；`origin` URL 应为 `https://github.com/buguoshixc/ai-deals-aggregator.git`
  （不是就停下来问）。

### S2 · 冻结前复核（**这一步不过，不许往下走**）

```bash
git status --porcelain                                     # 期望：7 个 " M" + 1 个 "?? research/_raw/secondary-page-layout-unification/"
git rev-parse HEAD                                         # 期望：1f225d2…（还没提交）
git diff --name-only 1f225d2..HEAD -- deals.json plans.json api-plans.json models.json model-registry-links.json scripts/data   # 期望：空
node research/_raw/secondary-page-layout-unification/release/check-evidence-index.cjs --git   # 期望：EXIT=0
node research/_raw/secondary-page-layout-unification/release/check-release-consistency.cjs   # 期望：EXIT=0（FATAL 0 / DRIFT 0；见 T23-FINAL-GATE.md）
node research/_raw/secondary-page-layout-unification/gate/run-full-gate.cjs                  # 期望：EXIT=0
node research/_raw/secondary-page-layout-unification/release/rehearse-online-path.cjs        # 期望：EXIT=0（线上代码路径演练，8 条用例）
```

- **成功判据**：
  1. 源码改动**只有** PR 正文 §2 列的 7 个文件（多一个都要停下来问清）；
  2. 数据文件在提交区间内 0 改动；
  3. PR 证据索引的每条路径真实存在**且会被提交**（`--git` 会把"被 `*.log` 忽略"这类问题变成硬红，见 §3）；
  4. `gate/steps/summary.json` 的 `failed: 0`，且它的 `identity.verifySiteSha256` **等于当前**
     `scripts/tools/verify-site.js` 的 sha256（否则说明修复轮之后没重跑真浏览器两步 ⇒ 先跑
     `--only=47,48` 再继续）；
  5. 线上代码路径演练 8 条用例全绿（正/反/健壮性），且末行打印的出口纪律是
     "非回环 base 0 条 · 演练产物里真实域名 0 次" —— **`online-smoke.cjs` 只要被改过就必须重跑它**
     （判据见 `rehearsal-summary.json` 的 `ok: true` 与 `release/README.md` §5）。
- **失败处置**：3 不通过 → 见 §3（`.gitignore` 已由 captain 落盘，现在只需确认 `--git` 为 0）；
  4 不通过 → 重跑 Full Gate（`node …/run-full-gate.cjs --only=47,48`，它就是为此设计的增量补跑）；
  5 不通过 → 先修 `online-smoke.cjs` 再谈发布（线上冒烟是发布链最后一道验收，它自己有 bug = 最后一道验收是坏的）；
  1/2 不通过 → 停，找对应任务的作者核对。
- **顺带核对一句口径**：`commit-message.txt` 与 `pr-body.md` 里写的是同一份 §22c 口径
  （**10 个违规码** —— 窄柱取并集：`note-narrow` ∪ `note-ink-narrow` ∪ `note-hidden-text`、M0 反证、
  M1–M12 变异牙、1440/1600/390/760/360 五档）。若修复轮之后这些集合有变，
  **两处一起改** —— 现场核对用 `git diff 1f225d2 -- scripts/tools/verify-site.js`，
  看两个集合：`WIDE_CODE_VOCABULARY`（违规码）与 `id: 'M…'`（变异清单）。

### S3 · `git add`（**照着 `add-manifest.txt` 的精确清单**，不要用 `git add -A`）

```bash
# 清单、预演读数（文件数 / 体积）、以及 dist.* 排除的三层证明：release/add-manifest.txt
git add index.html scripts/lib/page-kinds.js scripts/lib/archive.js scripts/tools/build-local.js \
        scripts/tools/verify-site.js scripts/tools/archive-selftest.js scripts/tools/seo-selftest.js
git add research/_raw/secondary-page-layout-unification
git diff --cached --name-only | Measure-Object -Line     # 与 add-manifest.txt §1/§2 的读数对比
```

- **成功判据**：第一次 `git add` 后 `git diff --cached --name-only` **恰好是那 7 个路径**；
  第二次 `git add` 后新增的都是证据/物料（**没有** `dist*/`、没有 `node_modules`、没有 0 字节垃圾）。
  条目数/体积与 `add-manifest.txt` §2 **同量级**（证据目录在其它成员写入后会比那份快照更多，只增不减）。
- **失败处置**：多加了文件 ⇒ `git restore --staged <path>`；**不要**用 `git add -A` 一把梭
  （`dist.baseline/` / `dist.synth-fixed/` 靠的是 `.git/info/exclude`，那是**本 worktree 本地**的规则，
  换个 clone 就不挡了 —— 主保证永远是 `add-manifest.txt` 的指名清单）。

### S4 · `git commit`

```bash
git commit -F research/_raw/secondary-page-layout-unification/release/commit-message.txt
git log -1 --format=%B | Measure-Object -Line
git show --stat --oneline HEAD | Select-Object -First 12
```

- **成功判据**：提交信息的首行是 `fix(secondary-page-layout-unification): …`；
  `git show --stat` 的文件清单与 PR 正文 §2 的 7 个文件逐条对得上；
  **提交里没有任何数据文件**（`git show --name-only --format= HEAD | Select-String 'deals.json|plans.json|models.json|scripts/data'` 为空）。
- **失败处置**：提交信息要改 ⇒ `git commit --amend -F …`（**还没 push**，可以 amend）；
  文件清单对不上 ⇒ `git reset --soft HEAD~1` 回到 S3 重新核对。

### S5 · `git push`

```bash
git push -u origin secondary-page-layout-unification
git ls-remote --heads origin secondary-page-layout-unification      # 应等于 git rev-parse HEAD
```

- **成功判据**：远端分支 SHA == 本地 `HEAD`。
- **失败处置**：被拒（非快进）⇒ 说明远端已有这个分支的旧提交 ⇒ `git fetch` 后**先看清楚**再决定
  （`--force-with-lease` 只在确认那确实是上一次失败推送的残留时使用，并留痕）。
  ⚠️ 注意：**push 到特性分支不会触发 `verify.yml`**（它只监听 `pull_request` 与 `push→master`）；
  PR 上的 `pull_request` 事件才是触发器（见 §2.3 第 3 条）。

### S6 · 建 PR

```bash
gh pr create --base master --head secondary-page-layout-unification \
  --title "fix(secondary-page-layout-unification): 二级数据页说明与主数据区同轴 + 布局族声明 + §22c 全站几何门禁" \
  --body-file research/_raw/secondary-page-layout-unification/release/pr-body.md
gh pr view --json number,url,headRefOid,baseRefName,state
```

- **成功判据**：PR 指向 `base=master`、`headRefOid` == S5 的 SHA；标题与 `commit-message.txt` 首行一致。
- **失败处置**：PR 已存在 ⇒ `gh pr view` 确认是不是本人上一次尝试；不要为了"重新触发"反复开关 PR。

### S7 · 等必需检查 **`gate`** 变绿

```bash
gh pr checks --watch                                  # 或 gh pr checks <N>
gh run list --workflow=verify.yml --branch secondary-page-layout-unification --limit 5
gh run view <run-id> --log-failed                     # 失败时看这一步
```

- **成功判据**（三条都要）：
  1. 检查名**恰好**是 `gate`（这是分支保护要填的那个名字 —— job 的 `name` 与 `id` 都钉成它，见 §0）；
  2. 结论 **success**，且挂在 **PR 当前头 SHA** 上（`gh pr view --json headRefOid`；必需检查按最新 SHA 匹配）；
  3. Summary 里 `mode=full` 那一支：**真浏览器验收 + 回归比对都跑了**（不是降级运行）。
- **失败处置**（按失败步骤分派）：
  | 现象 | 处置 |
  | --- | --- |
  | 一致性门禁红（`check-ci-consistency.js`） | 说明有人动了 workflow / gate action / package.json 的冻结口径 ⇒ **停下来查**，不要改断言去迁就 |
  | 「真浏览器验收没有执行」明确失败 | 多为 npx 拉内核的网络抖动 ⇒ **Re-run failed jobs**；连红两次再查 runner 镜像 |
  | 回归比对拦（覆盖条数/卡片数下降） | 合法数据缩减才允许人工重刷基线（`npm run verify:baseline`），**另开一条提交并留痕**；数据异常先修数据 |
  | 某条 selftest 红 | 大概率是修复轮漏了同步 ⇒ 回给该任务作者，不要在 PR 里临时改判据 |
  | 结论是 `cancelled` | 不是失败：`concurrency.cancel-in-progress: true` 让同一 ref 的新运行取代旧的 ⇒ 等**最新**那次 |
  | 一直 Pending | 若最新提交带了 `[skip ci]`（机器人数据提交），它的检查会永远 Pending —— 我们的 PR 提交不带这个标记，遇到就查提交信息 |
- ⚠️ **merge 前若 `origin/master` 又前进了**：`git fetch` → `git merge origin/master`（数据文件与我们无交集，
  不会冲突）→ `git push` ⇒ PR 的 `pull_request synchronize` 会**重新触发** `verify.yml`，等新一轮 `gate` 绿再合并。
  不许用"管理员合并/绕过必需检查"这类手段跳过这一轮。

### S8 · merge

```bash
gh pr merge <N> --merge          # 与本仓库历史一致：master 上留下 "Merge pull request #N from …"
gh pr view <N> --json state,mergedAt,mergeCommit
git fetch && git log --oneline -3 origin/master
```

- **成功判据**：PR `state=MERGED`；`origin/master` 顶部出现 `Merge pull request #N from buguoshixc/secondary-page-layout-unification`
  （本仓库既有风格，见 `git log --oneline -20`）；分支**不删除**（历史分支都还在）。
- **失败处置**：提示"base 分支需要更新" ⇒ 回到 S7 的 ⚠️ 那一段；提示必需检查未满足 ⇒ 回到 S7，
  **不要**用 `--admin`。

### S9 · 观察 **Deploy to GitHub Pages**

```bash
gh run list --workflow=deploy.yml --branch master --limit 5
gh run watch <run-id>
gh run view <run-id> --json jobs --jq '.jobs[] | "\(.name) \(.conclusion)"'
```

- **成功判据**：这次 push 触发的运行里三个 job 依次 **`prepublish` ✅ → `build` ✅ → `deploy` ✅**；
  Pages environment 显示新的部署 URL。
- **失败处置**：
  | 现象 | 处置 |
  | --- | --- |
  | `prepublish` 红 | 与 S7 同一套门禁 ⇒ 按上表分派；**`build`/`deploy` 根本没有机会执行**，线上保留上一份好版本（这是设计） |
  | `prepublish` 的「Refuse to publish when the upstream run failed」红 | 只可能发生在 `workflow_run` 事件上（采集结论非 success）；人工 push 这条链**不受影响**（该步骤对非 `workflow_run` 事件直接 `exit 0`） |
  | `build` 红 | 看 `Validate data and assemble site` 的日志（`build-local.js` 是零依赖的，红了就是产物真的有问题）⇒ 修完走一次新的修复 PR |
  | `deploy` 红 | 多为 Pages 服务侧瞬时问题 ⇒ Re-run；连续失败查 environment 保护规则 / `pages: write` 权限 |
  | 同一 SHA 上出现两条 Deploy 运行 | 正常：`push` 链与 `workflow_run` 链各一条时会排队（并发组 `pages`，`cancel-in-progress: false` ⇒ **排队不取消**） |
- ⚠️ 排队现象的另一面：**`prepublish` 每次发布都会重跑一遍完整门禁**，所以部署耗时不短；不要因为"卡在
  queued"就手动取消。

### S10 · 线上几何冒烟

> 这条命令走的代码路径已在本地**演练过一遍**（t12：`--base=` + HTTP 取 sitemap + 现场派生路由，
> 8 条用例全绿，读数见 `release/README.md` §5 与 `online-path-rehearsal.json`）。所以这里出问题时，
> 大概率是**线上产物**而不是脚本本身 —— 但仍先用 `rehearse-online-path.cjs` 复核脚本那一侧。

```bash
node research/_raw/secondary-page-layout-unification/release/online-smoke.cjs \
     --out=research/_raw/secondary-page-layout-unification/release/online-smoke-result.json \
     2>&1 | Tee-Object -FilePath research/_raw/secondary-page-layout-unification/release/online-smoke-result.txt
```

- **成功判据**：**退出码 0**；`online-smoke-result.json` 里 `ok: true`、`failed: 0`；
  8 页（`/student/ /need/edu-identity/ /status/ /changes/ /feeds/ /plans/coding/ /deal/<id>/ /models/<slug>/`）
  在 1440 档 `ratio ≥ 0.85`、说明与主数据区同轴、`frozenCount = 1`；390 档 `scrollWidth ≤ clientWidth + 1`。
- **注意**（判据之外的事实，写清楚免得误判）：
  - 访问的是**真实线上域名**，会产生 8 页 × 2 档的真实页面访问（本仓库有私有 Analytics）；
  - deal id / model slug **现场从线上 `sitemap.xml` 推导**（脚本里不写死），所以数据更新也不会让脚本失效；
  - 若 Pages CDN 还在发旧的产物，`frozenCount=0` 会立刻指出"发的是上一版" ⇒ 等 1–2 分钟重跑即可；
  - 取 sitemap 有**显式超时**（`--sitemap-timeout=`，缺省 15000ms）：线上"连得上但不响应"时它会
    明确失败（退出码 2 + `超过 Nms 未响应`），**不会静默挂死**（这是 t12 演练逼出来的一条改进）。
- **失败处置**：真红（`note-narrow` / 轴不一致）⇒ 说明线上产物与本地判据不符**或**部署发了旧版本：
  1. 先确认 Deploy 运行对应的是 S8 的 merge SHA；
  2. 等 CDN 后重跑一次；
  3. 仍然红 ⇒ **回滚**（§4）。

### S11 · 回填最终报告

- 回填内容：**线上 smoke 读数**（`online-smoke-result.json` 的关键几个数）、CI 上 `gate` 的结论与项数、
  Deploy 三个 job 的结论、以及本轮"数据 0 变化"的最终读数。
- 落点：最终报告的**线上 smoke 小节（§I）**。本版报告由文档轮（t6/T5）产出，落点以它的交付为准；
  上一版同一小节的体例见 `research/leaf-detail-layout-v1-report.md` §11 Online Smoke。
- **成功判据**：报告里的每个数字都能在 `release/online-smoke-result.json` 或 `gh run view` 的输出里找到出处。
- **失败处置**：报告里若引用了尚不存在的路径 ⇒ 用 `release/check-evidence-index.cjs` 的同一套办法核对
  （存在性 + 会不会被提交）。

## §2. 与两个 workflow 文件的逐条对照

### §2.1 `verify.yml`（`name: Verify site (gate)`）

| # | 文件里的真实内容 | 行 | 对本清单的含义 |
| --- | --- | --- | --- |
| 1 | `on: pull_request: branches: [master]` | 30-31 | PR 一开就有一轮；**推送特性分支本身不触发** |
| 2 | `on: push: branches: [master]` | 32-33 | 合并后 master 上再验一遍（与 `deploy.yml` 的 push 同时发生） |
| 3 | `on: workflow_dispatch` + 输入 `allow_degraded_run`（boolean，默认 false） | 34-43 | 只有手动跑才可能出现降级；S7 判据因此要求 `mode=full` |
| 4 | `permissions: contents: read` | 46-47 | 这条 workflow **不写仓库**；别指望它去修什么 |
| 5 | `concurrency: group: verify-${{ github.ref }}` + `cancel-in-progress: true` | 51-53 | 同一 ref 连推会被 `cancelled` 取代 ⇒ 只看最新 SHA 那一轮 |
| 6 | `jobs.gate` / `name: gate` | 56-58 | **必需检查名就是 `gate`**；改名 = 分支保护失配 |
| 7 | 无 job 级 `if`（注释明确：跳过会报 Success） | 15-19 | 不许为了"省一次跑"加 `if`/`paths`；`check-ci-consistency` (7)(8) 守着 |
| 8 | `runs-on: ubuntu-24.04`、`timeout-minutes: 20`、`TZ: Asia/Shanghai` | 61-64 | 超时 20 分钟：真浏览器那一步慢，卡住就是真卡住 |
| 9 | 第 1 步 `node scripts/tools/check-ci-consistency.js --expect-checks=38` | 124-125 | 改了 workflow / gate action / package.json 冻结口径会**先在这里红** |
| 10 | 第 2 步 `uses: ./.github/actions/gate`，`allow_degraded_run: ${{ inputs.allow_degraded_run && 'true' \|\| 'false' }}` | 128-133 | PR/push 上它求值为 `'false'` ⇒ **不许降级**（断言 (11) 真的按事件求值） |

### §2.2 `deploy.yml`（`name: Deploy to GitHub Pages`）

| # | 文件里的真实内容 | 行 | 对本清单的含义 |
| --- | --- | --- | --- |
| 1 | `on: push: branches: [master]` | 21-22 | **合并即触发发布**（S9 观察的就是它） |
| 2 | `on: workflow_run: workflows: ["Collect AI Deals"], types: [completed], branches: [master]` | 23-26 | 定时采集链路的发布走这条；与人工 push 链并行存在（排队） |
| 3 | `on: workflow_dispatch` | 27 | 手动补发/重发用；**同样先过完整门禁** |
| 4 | `permissions: contents: read / pages: write / id-token: write` | 29-32 | Pages 部署所需的三个权限，缺一个 `deploy` 就红 |
| 5 | `concurrency: group: pages`、`cancel-in-progress: false` | 34-36 | 并发发布**排队不取消** ⇒ 看到 queued 属正常 |
| 6 | job `prepublish`（`ubuntu-24.04`、`timeout-minutes: 20`、`TZ`） | 42-47 | 发布前**完整门禁**，与 PR 路径同一个 action |
| 7 | `Refuse to publish when the upstream run failed`（步骤内判定，非 job 级 `if`） | 61-83 | 仅对 `workflow_run` 事件生效：上游采集非 success ⇒ `::error` + `exit 1` |
| 8 | `Gate (same implementation as verify.yml)`，`allow_degraded_run: 'false'` | 86-89 | 发布路径**永远严格**，没有降级开关 |
| 9 | job `build` 的 `if`（逐字冻结）+ `needs: prepublish` | 91-95 | 门禁红 ⇒ `build`/`deploy` **根本不执行**（线上保留上一份好版本） |
| 10 | `Validate data and assemble site` = `node scripts/tools/build-local.js` | 114-115 | 与本地 `npm run build` 完全同一条路径 |
| 11 | `actions/configure-pages@v6` + `actions/upload-pages-artifact@v5`（`path: 'dist'`） | 117-123 | 上传的就是 `dist/`；本地冒烟量的也是同一套产物形状 |
| 12 | job `deploy`：environment `github-pages`，`needs: build`，`actions/deploy-pages@v5` | 125-135 | 部署成功后才有"线上产物"可冒烟 |

### §2.3 最容易凭印象写错的 8 条（我逐条查过原文才写）

1. **必需检查的名字是 `gate`，不是 `verify` / `Verify site (gate)`** —— workflow 的 `name` 是
   `Verify site (gate)`，但分支保护要填的是 **job 名 `gate`**。
2. **`deploy.yml` 不是"合并后无条件发布"** —— 它先跑 `prepublish` 完整门禁（历史事故 `e01dcfc`：
   `gate=failure` 而 `deploy=success` 照发，从此改成 `prepublish → build → deploy`）。
3. **push 到特性分支不触发 `verify.yml`** —— 它监听 `pull_request` 与 `push→master`；
   PR 的 `synchronize` 事件才是重跑触发器。
4. **`cancelled` ≠ 失败** —— `verify.yml` 的并发组 `cancel-in-progress: true` 会取代旧运行。
5. **机器人数据提交的 `gate` 会永远 Pending** —— `[skip ci]` 只压 `push`/`pull_request`，被跳过的
   workflow 其检查停在 Pending；这属预期，别去"修"它。
6. **发布链需要 npm registry** —— `npm ci` 装 `playwright-core`（真浏览器验收要用），
   "发布前不需要 npm install"这句只对 `build-local.js` 那一步成立。
7. **`build` 的 `if` 是冻结串** —— 它由 `check-ci-consistency.js` 断言 (7b) 逐字比对；
   改它的后果是**一致性门禁先红**，不是"发布更快"。
8. **门禁步骤数与清单都不是本文件说了算** —— 唯一出处是 `.github/actions/gate/action.yml`
   （步骤序列由断言 (10) 冻结；项数唯一出处是 `verify.yml` 那一行 `--expect-checks=38`）。
   本清单因此写的是"怎么读它们"，不是"它们有多少步"。

## §3. 物料卫生（t10 提出 → **captain 已落盘** → t12 复核）

实测（2026-10-06，本 worktree）：

```bash
git ls-files --others --exclude-standard -- research/_raw/secondary-page-layout-unification | wc -l   # t10 时 789；现在见 §3.3 的读数
git ls-files --others --ignored  --exclude-standard -- research/_raw/secondary-page-layout-unification | wc -l  # t10 时 103 个被忽略（51 .log + 52 .png）
```

> ✅ **t12 复核（2026-10-06 16:5x）**：captain 已落盘
> `research/_raw/secondary-page-layout-unification/.gitignore`（`!**/*.log` 按名字放回证据日志、
> 排除 `review/scratch/`、`adversary/scratch/`、`recovered/pre-t7/`、`**/*.png`）。
> 下面 §3.1 / §3.2 保留为**决策记录**（当时怎么判、为什么），**不需要再执行**；
> 现在的判据是机器可跑的：`node …/release/check-evidence-index.cjs --git` 必须 EXIT=0。

### §3.1 **（已解决）被 `*.log` 吃掉的 51 份证据日志**（顶层 `.gitignore:4`）

后果：**PR 正文的证据索引里有 3 条 `.log` 路径在提交后会是死链**：
`diff/04-before-after-compare.log`、`diff/03-nonhtml-sha256.log`、`mutations-real/M-disk.log`
（另有 `geometry/*.log`、`mutations-real/M-disk.step*.log`、`review/runs/*.log`、`verify/*.log` 等一批同类证据）。

**二选一（建议 a）**：

**(a) 在版本目录里按名字放回来**（与上一版 `research/_raw/leaf-detail-layout-v1/.gitignore` 同一条先例：
顶层 `*.log` 防的是散落的运行日志，而这些 `.log` 是**指名道姓的交付证据**）。新建
`research/_raw/secondary-page-layout-unification/.gitignore`，内容建议：

```gitignore
# 顶层 .gitignore 的 `*.log` 防的是散落的运行日志；这一份里的 .log 是**交付证据**（逐条原始读数），
# 按名字放回来 —— 不用通配，免得把将来散落的日志一起收进来（与 leaf-detail-layout-v1 同一条纪律）。
!diff/03-nonhtml-sha256.log
!diff/04-before-after-compare.log
!mutations-real/M-disk.log
!mutations-real/M-disk.step*.log
!geometry/*.log
!geometry/checker-selftest/*.log
!build/03-build1-manifest.log
!gate/02-dist-manifest.log
!review/runs/*.log
!review/runs/*/*.log
!verify/*.log
```

**(b) 或者**把上面 3 条从 PR 正文的索引块里删掉（其余 `.log` 不作为索引项）。

判据（改完必须跑）：

```bash
node research/_raw/secondary-page-layout-unification/release/check-evidence-index.cjs --git   # 期望 EXIT=0
```

### §3.2 **（已解决）`review/scratch/**` 等可再生文件**（t10 时占证据目录 51.5 MB 中的绝大部分）

| 目录 | 未跟踪文件数 | 性质 |
| --- | --- | --- |
| `review/scratch/` | 559 | 渲染出来的"负例站点副本"（可再生） |
| `teeth/_scratch/` | 21 | 变异脚手架临时目录 |
| `adversary/_scratch/` | 2 | 同上 |
| 其余（`gate/steps` 46、`review/runs` 29、`t1`/`t3`/`verify`/`geometry`/`teeth`/`diff`/`build`/`baseline`/`mutations-real`/`release` …） | 207 | **交付证据，应当入库** |

建议在同一个 `.gitignore` 里再加：

```gitignore
# 可再生的字节不进索引（与顶层对 shots/、第三方快照、*.building/ 同一条纪律）：
# review/scratch 是"改动前/负例"的整站渲染副本，一条命令可重建（见 review/make-scratch.cjs）。
review/scratch/
teeth/_scratch/
adversary/_scratch/
```

判据：`git status --porcelain -uall -- research/_raw/secondary-page-layout-unification | Measure-Object -Line`
应降到 ~200 量级，且**逐个目录看过去每一条都是"结论 / 判据 / 原始读数"**，不是可再生的字节。

> 这两件都由 captain 落盘（t10 只能写 `release/**`）。落盘后 `git add` 再走 S3。

### §3.3 t12 复核读数 + 发布时的 `git add` 清单（**替代上面两节的手工判断**）

- `research/_raw/secondary-page-layout-unification/release/add-manifest.txt`：发布时应当 `git add` 的
  **精确 8 条路径**（7 个源文件 + 证据目录），以及 `git add --dry-run` 的**文件数与体积**实测、
  和 `dist.baseline/` `dist.synth-fixed/` 绝不会被带进去的三层证明（`add-manifest-dryrun.txt` 是逐条原始输出）。
  **S3 请照着这份清单 add，不要用 `git add -A`。**
- `research/_raw/secondary-page-layout-unification/release/evidence-index-snapshot.txt`：PR 证据索引在
  **某一时刻**的核对快照（存在性 + `--git`）。⚠️ 其它成员仍在写入 ⇒ **发布前必须在众人停写后重跑**：

```bash
node research/_raw/secondary-page-layout-unification/release/check-evidence-index.cjs --git   # 期望 EXIT=0
git add --dry-run --all -- index.html scripts/lib/page-kinds.js scripts/lib/archive.js \
     scripts/tools/build-local.js scripts/tools/verify-site.js \
     scripts/tools/archive-selftest.js scripts/tools/seo-selftest.js \
     research/_raw/secondary-page-layout-unification | Measure-Object -Line
```

## §4. 回滚

```bash
git revert -m 1 <merge-sha>          # 生成一条 revert 提交（保留历史，不改写 master）
git push origin master               # 触发 deploy.yml：先过完整 prepublish 门禁，再把上一份产物发回去
gh run list --workflow=deploy.yml --branch master --limit 3
```

- **成功判据**：revert 提交在 master 上；Deploy 三个 job 全绿；再跑一次线上冒烟时，
  被判为"窄说明"的读数与改动前一致（`geometry/before.json` 里 48 页的读数就是那个形状）。
- **失败处置**：revert 也会被门禁拦（例如数据在那之后又变了）⇒ 先 `git fetch` 对齐 master 再 revert，
  **不要**用 `git push --force` 改写 master 历史。
- **不需要**动 `research/_raw/**` 的证据：证据记录的是"这一版做了什么、读数是多少"，回滚不改写历史。
