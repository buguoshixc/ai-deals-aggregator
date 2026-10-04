# t19 运行单（可直接执行）—— CI → merge → Deploy → 线上冒烟

> 预检结论出处：`research/_raw/t37/evidence.md`（含逐条原文与只读日志 01–06）。
> 约定：**幂等** = 重复执行结果不变；**不可逆** = 一旦执行就会在远端留下无法悄悄撤销的痕迹。
> 所有命令里的 `<PR>` 用 `gh pr list --head coverage-expansion-v1 --json number --jq '.[0].number'` 取。
> 线上基址固定为 **`https://buguoshixc.github.io/ai-deals-aggregator/`**（仓库内四处可见来源 + Pages API `html_url`；
> 题面里的 `buguoshixix` 实测 404，是笔误）。

## §0 前置（只读，幂等）

| # | 命令 | 幂等 | 通过判据 |
| --- | --- | --- | --- |
| 0.1 | `git status --short` | 幂等 | 生产文件**没有**未提交改动（`research/_raw/**` 这类运行材料除外）。**当前是 25 条**（队友收尾中）⇒ 未清空前不要开始 T1 |
| 0.2 | `git log --oneline -1` / `git rev-parse HEAD` | 幂等 | 记下将要推送的 SHA（推送后不再变） |
| 0.3 | `node scripts/validate.js --strict` | 幂等 | exit 0 |
| 0.4 | `node scripts/tools/check-ci-consistency.js --expect-checks=38` | 幂等 | exit 0（口径漂移门禁） |
| 0.5 | `node scripts/tools/build-local.js` | 幂等 | exit 0（自检全过） |
| 0.6 | `node scripts/tools/verify-site.js` | 幂等 | **735 项 0 失败**（本地真浏览器验收） |
| 0.7 | `git rev-list --count origin/master..HEAD` | 幂等 | 与预期提交数一致（预检时 = 15） |

失败处置：任何一条不过 ⇒ **停止**，回到对应 owner 修复；**不要**带着红门禁推送。

## §1 推送分支（**不可逆**）

```bash
git push -u origin coverage-expansion-v1
```

- 幂等性：**不可逆**。远端是 **public** 仓库 —— 一旦推送，这 15 个提交对所有人可见；
  即使 `--force` 覆盖也会在 GitHub 的事件流/悬空对象里留痕。**只推真正要发布的那个 SHA**。
- 失败处置：
  - `! [rejected] non-fast-forward`：远端同名分支已存在（预检时**不存在**）⇒ 先 `git fetch origin coverage-expansion-v1`
    看是不是别人的分支，**不要**直接 `--force`；确认归自己再用 `--force-with-lease`。
  - 认证失败（`could not read Username` / 403）：`gh auth setup-git` 后重试（凭据走 GCM / keyring，
    **不需要**环境变量 token；预检已确认 `credential.helper = manager`、`gh` 已登录 `buguoshixc`）。
  - 推送被仓库规则拒绝（若之后开了保护）：用 `gh api repos/buguoshixc/ai-deals-aggregator/rulesets` 只读确认。

## §2 建 PR（近似幂等：先查重）

```bash
gh pr list --head coverage-expansion-v1 --json number,url --jq '.[]'   # 先查重（幂等）
gh pr create --base master --head coverage-expansion-v1 \
  --title "feat: coverage-expansion-v1（Coverage Target 层 + Model Currentness + 页面 Current 化）" \
  --body "见 research/coverage-expansion-v1-report.md（最终报告）与 research/coverage-expansion-v1-self-audit.md（独立自审）。"
```

- 幂等性：**近似幂等** —— `gh pr create` 重复执行会开第二个 PR；所以**先跑第一行查重**，已存在就用 `gh pr view <PR>`。
- 失败处置：base 不是 master / 分支未推 ⇒ 回到 §1；标题重复无影响（GitHub 允许）。

## §3 等 CI（只读，幂等）——**必修：gate 必须绿**

```bash
gh pr checks <PR> --watch          # 等它跑完（会自动刷新）
gh pr checks <PR>                  # 复核：必须出现一行 `gate  pass`
gh run list --workflow "Verify site (gate)" --branch coverage-expansion-v1 --limit 5
```

- 通过判据：**PR 最新 SHA 上 `gate` = success**（实测检查名就是 `gate`：`{"name":"gate","conclusion":"success","app":"github-actions"}`）。
- ⚠️ **`master` 当前没有分支保护**（`gh api …/branches/master/protection` → `Branch not protected`，HTTP 404）
  ⇒ GitHub **不会**替你拦住"gate 没过也能合并"。这一步的"等"是**纪律**，不是平台强制的。
- 失败处置：
  - `gate` 红：`gh run view <run-id> --log-failed` 定位；修好后 `git push`（**幂等**：新提交会让旧运行被
    `cancel-in-progress` 取代，这是设计好的行为）。
  - 想用 `workflow_dispatch` 的 `allow_degraded_run=true` 糊过去：**禁止** —— 那条输入只对手动触发有效，
    PR/push 永远走严格路径；用它对 PR 结论没有影响，只会骗自己。
  - 长时间 pending：本仓库的 `verify.yml` 没有 `paths`/`paths-ignore`（文件里逐字写明原因），
    所以 pending 通常意味着 runner 排队，而不是"被路径过滤"。

## §4 合并（**不可逆**）

```bash
gh pr merge <PR> --merge --delete-branch=false    # 与仓库历史一致：master 上是 "Merge pull request #NN from …"
```

- 幂等性：**不可逆** —— master 收到新提交，随即触发 `Deploy to GitHub Pages`。
- 失败处置：
  - **被分支保护拒绝**（当前不会发生，因为 master 无保护）：按提示补齐 —— 必需检查 `gate` 在**最新 SHA** 上
    success、或 PR 需要 review；用 `gh pr checks <PR>` 看清楚是哪一条。
  - 冲突（`mergeStateStatus: DIRTY`）：`git fetch origin && git rebase origin/master` 后重推（重推**不可逆但安全**，
    分支是自己的一次性分支，用 `--force-with-lease`）。
  - 合错了/想撤回：见 §6.4 回滚（用 revert 走同一条门禁链，**不要**直接改线上）。

## §5 等部署（只读，幂等）

```bash
gh run list --workflow "Deploy to GitHub Pages" --limit 5
gh run watch <run-id>
gh run view <run-id> --json jobs --jq '.jobs[] | {name,conclusion,url:.url}'
```

- 部署链（`deploy.yml` 原文）：`prepublish`（跑 `.github/actions/gate`，与 PR 同一个文件）→ `build`
  （`build-local.js` → `configure-pages` → `upload-pages-artifact` path=`dist`）→ `deploy`（`actions/deploy-pages@v5`，
  environment `github-pages`）。
- 通过判据：三个 job 全 success，且 `deploy` 的 environment url 有值。
- 失败处置：
  - `prepublish` 红 ⇒ 与 §3 同处置（它跑的是同一套 49 步门禁）。
  - `build` 跳过 ⇒ 多半是 `workflow_run` 触发且上游 `Collect AI Deals` 结论不是 success（`deploy.yml` 第一步会显式判它）。
    等上游绿，或 `gh workflow run "Deploy to GitHub Pages"` 手动补发（**幂等**：会重新跑一遍 gate + 构建 + 发布）。
  - Pages 未更新 ⇒ 先看 deploy job 的 URL；再 `curl.exe -I https://buguoshixc.github.io/ai-deals-aggregator/` 看
    **`Last-Modified` 是否变了**（预检时是 `Sun, 04 Oct 2026 07:16:27 GMT`）。
  - **CDN 缓存未刷新** ⇒ 响应头是 `Cache-Control: max-age=600`（最长 10 分钟）。
    正确做法：**等到 `Last-Modified`/`ETag` 变化**再判定；**不要**用 `?v=...` 查询串去绕过缓存来"验证"，
    因为读者看到的是缓存里那一份，绕过去验证的是另一份。

## §6 线上冒烟（只读，幂等）——**必须在部署成功之后**

### 6.1 主入口（仓库里唯一的线上浏览器冒烟）

```bash
node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/ \
  --json=research/_raw/t19/smoke.json
```

- 幂等性：**只读**（仅 GET；线上模式**不会**启动本地服务器、不写生产文件）。
  唯一"副作用"是它会像真实访客一样加载 Cloudflare beacon 并可能产生 RUM 上报 —— 这是**线上预期行为**
  （`--url=` 时断言会翻转成"应当看到 beacon + RUM，且只落在官方两个 origin"），**不是**污染。
- 注意：该脚本**没有按路由限流的开关**（参数只有 `--dir/--url/--json/--compare/--keep/--shots`），跑一次会访问
  首页 + 它自己抽样的页面（含 `/plans/api/`、`/plans/coding/`、`/models/`、一个模型详情、一个厂商页、`/changes/`
  以及 §21–§26 的全部资料库页面）。若要"只访问少量页面"的轻量版，用 6.2。

### 6.2 轻量探针（t19 点名的 5 条路由 + 本版三件新事实）

```powershell
# ① 5 条必要路由 + sitemap 全部 200（只读）
foreach ($p in @('models/','models/deepseek-v3.2/','plans/api/','plans/coding/','sitemap.xml')) {
  $u = "https://buguoshixc.github.io/ai-deals-aggregator/$p"
  "$(curl.exe -sS -o NUL -w '%{http_code}' --max-time 30 -I $u)  $u"
}
# ② 本版必须上线的三件事实（旧版本会分别得到 0 / 0 / 缺）
$html = curl.exe -sS --max-time 30 "https://buguoshixc.github.io/ai-deals-aggregator/models/"
"data-model 行数 = " + ([regex]::Matches($html,'data-model=')).Count   # 期望 44
"显示旧型号入口 = " + ([regex]::Matches($html,'models-show-legacy')).Count  # 期望 ≥1
$d = curl.exe -sS --max-time 30 "https://buguoshixc.github.io/ai-deals-aggregator/models/deepseek-v3.2/"
"legacy 详情页 data-release-date = " + ([regex]::Matches($d,'data-release-date=')).Count  # 期望 ≥1
```

- 通过判据：5 条路由 200；`data-model` = 44（默认隐藏只发生在运行时，静态表一行不少）；`models-show-legacy` ≥ 1；
  legacy 详情页带 `data-release-date`（发布时间 + 官方证据链接）。
- **预检已证明：合并前线上是旧版本**（`data-model`=0、`models-show-legacy`=0、`Last-Modified`=07:16:27Z）⇒
  如果把 6.1/6.2 跑在部署之前，会得到"正确的红"。先确认 §5 成功。

### 6.3 冒烟红了的处置

1. 先看 `curl -I` 的 `Last-Modified`/`ETag`：**没变** ⇒ 线上还没更新（等 CDN ≤10 分钟 或 查 §5）；**变了** ⇒ 真问题。
2. 真问题：把 `--json=research/_raw/t19/smoke.json` 与本地 735/0 的 `--json` 对比，定位是哪一条断言（含路由）。
3. **禁止**为了让冒烟绿去改断言或降级 —— 回到 `master` 上用 revert 走同一条门禁链修。

### 6.4 回滚（**不可逆但可控**）

```bash
git revert -m 1 <merge-commit-sha>     # 生成一个反向提交
git push origin master                 # 再走一遍 gate → deploy（与正常发布同一条链）
```

不要直接改线上产物，也不要手动重发旧 artifact —— 回滚也必须过门禁。

## §7 需要用户手动完成的事

**必需项：无。** 依据（全部来自只读原文，见 `evidence.md`）：

| 可能的手动项 | 现场结论 | 依据 |
| --- | --- | --- |
| GitHub 登录 / token | **不需要** | `gh auth status` 已登录 `buguoshixc`（keyring），作用域含 `repo` + `workflow`；`GH_TOKEN`/`GITHUB_TOKEN` 都不存在也不需要 |
| `git push` 凭据 | **不需要** | `credential.helper = manager`（Git Credential Manager，同账号） |
| Pages 开关 | **不需要** | `gh api …/pages`：`has_pages: true`、`build_type: workflow`、`https_enforced: true`、`status: built` |
| 自定义域 / DNS / CNAME | **不需要** | `cname: null`，仓库里**没有** `CNAME` 文件 ⇒ 走默认项目页域 |
| 仓库默认分支 | **不需要** | `default_branch: master` |

**推荐项（可选，不阻塞 t19）：开启 `master` 分支保护，并把 `gate` 设为必需检查。**
依据：`gh api repos/buguoshixc/ai-deals-aggregator/branches/master/protection` 返回
`{"message":"Branch not protected","status":"404"}` —— 当前**没有任何分支保护**，所以"gate 没过就不能合并"这条纪律
在平台层面**没有**强制。开启后，§3 就从"人工确认"变成"GitHub 拦住"，t19 的 §4 才可能出现"被保护拒绝"这一分支。
（这是仓库设置变更，属于**用户/管理员的动作**，本预检按只读纪律没有做、也不建议由 agent 做。）
