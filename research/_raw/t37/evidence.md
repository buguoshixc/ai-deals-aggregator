# t37 部署预检（只读）—— 证据与结论

> 任务：t19（CI → merge → Deploy → 线上冒烟）的**预检**。本文件只记录**贴出的原文**与由原文得到的结论。
> **本任务没有做任何不可逆动作**：没有 push / merge / 部署 / 改仓库设置 / 改生产文件；所有远端交互都是只读
> （`git ls-remote`、`gh api` 读接口、`curl -I`/GET）。
> 原始输出逐份留存：`01-git-remote-branch.log` / `02-credentials-toolchain.log` / `03-workflows.log` /
> `04-pages-branchprotection-runs.log` / `05-live-probe.log` / `06-verify-exit-codes.log`。

## ① 远端与分支（原文）

```
=== git remote -v ===
origin	https://github.com/buguoshixc/ai-deals-aggregator.git (fetch)
origin	https://github.com/buguoshixc/ai-deals-aggregator.git (push)

=== branch / HEAD ===
coverage-expansion-v1
9f27836a75d4131ca6a0d2b5e35f242b8b520aae
9f27836 test(research): 引文自称扫描脚本（t35 的前提证据：真实数据 0 命中）
```

- `git status --short`：**25 条**（队友仍在收尾；逐条原文见 `01-git-remote-branch.log`）。
- `git rev-list --count a4dd40f..HEAD` = **15**（整版提交都还没推）；`git rev-parse origin/master` = `a4dd40f…`。
- `git ls-remote --heads origin`：

```
77131a6ca7bb6a48ebe0995e0ab24a8e2197406f	refs/heads/fix/analytics-smoke-assertions
a4dd40fc66ea612f327036f5ba3d98cbff46c288	refs/heads/master
13071909b699bc82eb956d462154cfa1e3c71fea	refs/heads/private-analytics-v1
```

- `git ls-remote --heads origin coverage-expansion-v1` → **空**：远端**还没有**这个分支；本地也没有配置 upstream
  （`fatal: no upstream configured for branch 'coverage-expansion-v1'`）。
- 原子事实（`gh api`）：`{"default_branch":"master","full_name":"buguoshixc/ai-deals-aggregator","has_pages":true,"private":false,"visibility":"public"}`。

> ⚠️ **与题面的一处差异**：题面 acceptance ① 写「应指向 `buguoshixix/ai-deals-aggregator`」，但仓库里**所有可见事实**
> 都是 **`buguoshixc`**（`git remote -v`、`gh api full_name`、Pages 的 `html_url`）。
> 按"判断一律基于贴出的原文"，本预检以 **buguoshixc** 为准；`buguoshixix.github.io` 实测 **404**（见 ⑤）。

## ② 凭据与工具链（原文，Token 已脱敏）

```
=== gh --version ===
gh version 2.102.0 (2026-09-30)

=== gh auth status（Token 行已脱敏；不含任何明文/前缀）===
github.com
  ✓ Logged in to github.com account buguoshixc (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: <REDACTED>
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'

=== token 环境变量：只报有无 ===
GH_TOKEN present = False
GITHUB_TOKEN present = False
GH_ENTERPRISE_TOKEN present = False

=== git 凭据来源（非密）===
credential.helper = manager
user.name = buguoshixc
user.email = 3127765991@qq.com
```

结论：**gh 存在且已登录**（keyring，作用域含 `repo` + `workflow` ⇒ 推送分支、建 PR、读 check-runs、合并都够用）；
`git push` 的凭据由 Git Credential Manager 提供（同一账号），**不需要**环境变量 token。
**本预检没有打印任何 token / secret 的明文或前缀**（`gh auth status` 的 Token 行在落盘前已替换为 `<REDACTED>`；
全程没有调用 `gh auth token`）。

## ③ 工作流触发面与必需检查名（原文）

`.github/workflows/`：`ai-maintenance.yml`、`collect.yml`、`deploy.yml`、`probe-sources.yml`、`verify.yml`。
`.github/actions/gate/action.yml` 的步骤数 = **49**（`^\s+- name:` 计数）。

`verify.yml`（原文行）：

```
1: name: Verify site (gate)
29: on:
30:   pull_request:
31:     branches: [ master ]
32:   push:
33:     branches: [ master ]
34:   workflow_dispatch:
56:   gate:
58:     name: gate
61:     runs-on: ubuntu-24.04
62:     timeout-minutes: 20
125:        run: node scripts/tools/check-ci-consistency.js --expect-checks=38
129:        uses: ./.github/actions/gate
```

- **必需检查名 = `gate`**：job id 与 job name 都是 `gate`（文件里第 15–19 行的注释逐字写明「这个 job 的名字与 id
  都必须是 gate（分支保护的必需检查名就是它）」）。
- **实测证据**（比注释更硬）：对已合并 PR 的提交 `77131a6` 查 check-runs →
  `{"app":"github-actions","conclusion":"success","name":"gate","status":"completed"}` ⇒ GitHub 报的检查名**就是 `gate`**。
- 触发面：`pull_request → master`、`push → master`、`workflow_dispatch`（带 `allow_degraded_run` 输入；
  注释逐字写明 PR / push **永远走严格路径**）。**没有** `paths` / `paths-ignore`（第 84 行注释说明：必需检查被路径过滤
  会变成永久 pending）—— 这一点对"等 CI"很关键：PR 上一定会报 `gate`。

其它 workflow 的触发面（`03-workflows.log` 原文）：

```
collect.yml:        on: schedule / workflow_dispatch（采集，不校验 PR）
deploy.yml:         on: push→master / workflow_run(Collect AI Deals, completed, master) / workflow_dispatch
ai-maintenance.yml: 仅 workflow_dispatch
probe-sources.yml:  schedule / workflow_dispatch（只读探针）
```

## ④ 部署路径（原文）

`deploy.yml`：

```
1: name: Deploy to GitHub Pages
20: on:
21:   push:
22:     branches: [ master ]
23:   workflow_run:
24:     workflows: ["Collect AI Deals"]
25:     types: [ completed ]
26:     branches: [ master ]
27:   workflow_dispatch:
29: permissions:
30:   contents: read
31:   pages: write
32:   id-token: write
34: concurrency:
35:   group: pages
36:   cancel-in-progress: false
42:   prepublish:            # ← 先跑完整门禁（与 verify.yml 同一个 ./.github/actions/gate）
91:   build:
94:     if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
95:     needs: prepublish
114:       - name: Validate data and assemble site
115:         run: node scripts/tools/build-local.js
117:       - name: Setup Pages
118:         uses: actions/configure-pages@v6
120:       - name: Upload artifact
121:         uses: actions/upload-pages-artifact@v5
122:         with:
123:           path: 'dist'
125:   deploy:
126:     environment:
127:       name: github-pages
128:       url: ${{ steps.deployment.outputs.page_url }}
130:     needs: build
133:       - name: Deploy to GitHub Pages
135:         uses: actions/deploy-pages@v5
```

- Pages 形态：**artifact 部署**（`configure-pages` + `upload-pages-artifact`(path=`dist`) + `deploy-pages@v5`），
  environment `github-pages`；**不是** `gh-pages` 分支那种形态。
- `gh api …/pages` 原文：`{"status":"built","cname":null,"custom_404":false,"html_url":"https://buguoshixc.github.io/ai-deals-aggregator/","build_type":"workflow","source":{"branch":"master","path":"/"},"public":true,"https_enforced":true}`
  ⇒ `build_type: workflow`（与上面一致）、`cname: null`（无自定义域）、HTTPS 强制。
- **线上 URL 的仓库内可见来源**（四处互相印证，不含臆测）：
  1. `README.md:6`：`- 线上地址：https://buguoshixc.github.io/ai-deals-aggregator/`
  2. `robots.txt:40`：`Sitemap: https://buguoshixc.github.io/ai-deals-aggregator/sitemap.xml`
  3. `dist/index.html`：`<link rel="canonical" href="https://buguoshixc.github.io/ai-deals-aggregator/">`
  4. `scripts/lib/feeds.js:64`：`const SITE_URL = 'https://buguoshixc.github.io/ai-deals-aggregator/';`
  5. 另有 `.nojekyll` 存在、**没有** `CNAME` ⇒ 项目页默认域（`<user>.github.io/<repo>/`）。

## ⑤ 冒烟入口与只读可达性证明

**现成的线上冒烟入口**（全仓只有这一个真的浏览器线上模式）：

```
scripts/tools/verify-site.js 的用法（文件头注释原文）：
  node scripts/tools/verify-site.js --url=https://…/         # 直接验收线上站点（部署后冒烟）
  node scripts/tools/verify-site.js --json=out.json          # 顺带写出机器可读指标
  node scripts/tools/verify-site.js --compare=base.json      # 与基线比回归
```

（`--dir=` / `--url=` / `--json=` / `--compare=` / `--keep` / `--shots` 是它的全部参数 —— **没有**按路由限流的开关；
线上模式**不启动本地服务器**，`deals.json` 等数据地址按 base 解析，项目页子路径因此可用。）

只读可达性（`curl -I`，全部 **200**）：

```
200  https://buguoshixc.github.io/ai-deals-aggregator/                      Content-Length: 399740   Last-Modified: Sun, 04 Oct 2026 07:16:27 GMT
200  https://buguoshixc.github.io/ai-deals-aggregator/models/               Content-Length: 122543
200  https://buguoshixc.github.io/ai-deals-aggregator/models/deepseek-v3.2/ Content-Length: 85140
200  https://buguoshixc.github.io/ai-deals-aggregator/plans/api/            Content-Length: 178965
200  https://buguoshixc.github.io/ai-deals-aggregator/plans/coding/         Content-Length: 200329
200  https://buguoshixc.github.io/ai-deals-aggregator/sitemap.xml           Content-Length: 33907
200  https://buguoshixc.github.io/ai-deals-aggregator/feeds/                Content-Length: 97268
响应头关键行：Server: GitHub.com · Cache-Control: max-age=600 · x-proxy-cache: MISS · Age: 22 · https_enforced
```

题面里写的那个 URL（`buguoshixix`）实测 **404 Not Found**（`Server: GitHub.com`）：

```
404  https://buguoshixix.github.io/ai-deals-aggregator/
```

> ⇒ 运行单里一律用 **`buguoshixc`**；题面那处是笔误。

**两个对 t19 很关键的现场事实**：

1. **线上当前还是旧版本**（部署于 `Last-Modified: 2026-10-04 07:16:27 GMT` = 北京时间 15:16，即 master 上 a4dd40f 那次 push）。
   实测线上 `/models/`：`data-model=` **0** 处、`data-item=` 44 处、`models-show-legacy` **0** 处
   ⇒ 本版的「静态表全部模型 + 默认隐藏旧型号」还没上线。**所以线上冒烟必须在部署之后跑**；在合并前跑 `--url=`
   会（正确地）在新增断言上判红。
2. **CDN 缓存窗口 600 秒**：`Cache-Control: max-age=600`、响应带 `Age`、`x-proxy-cache: MISS`。
   部署后判"是否真的更新"要看 **`Last-Modified`/`ETag` 变了**（那是新版本已上线的证据），不要靠加查询串去绕缓存，
   因为那验证的不是读者看到的内容。线上 sitemap 当前 170 条 `<loc>`（与本地构建一致）。

**线上模式的 Analytics 行为**（读源码得到，避免把预期当污染）：`--url=` 时断言会**翻转**——
`live` 分支要求「至少一次 Cloudflare beacon 脚本请求 + RUM 上报只落在官方两个 origin」，并允许 `analyticsRequests > 0`；
本地模式才要求 0 次。`--json` 指标里 `analyticsRequests` 不进回归比对（本地恒 0、线上本来就不可比）。

## ⑥ 需要用户手动做的事

见运行单 §7：**必需项 = 无**（依据：gh 已登录且作用域够、Pages 已开且 `build_type=workflow`、无自定义域/CNAME、
无环境变量 token 依赖，全部由上面的原文证明）；**推荐项 1 条**：`master` 当前**没有分支保护**
（`gh api …/branches/master/protection` → `Branch not protected` HTTP 404），所以 GitHub 不会替我们拦"gate 没过就合并"。
若希望"PR 必须等 gate 绿才能合并"，需要仓库管理员在 GitHub 上开启 master 分支保护并把 `gate` 设为必需检查 ——
**这不是 t19 的前置条件**（t19 可以在人工确认 gate=succeess 后合并），但它把那条纪律从"靠人"变成"靠平台"。
