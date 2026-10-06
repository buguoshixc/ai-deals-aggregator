# release/ · 发布物料与线上几何冒烟（t10 物料 · t12 线上路径演练）

> **只准备物料，不执行发布**：本目录里没有任何一步做过 `git add`（真写索引）/ `git commit` / `git push`，
> 也没有对真实线上域名发起过任何请求（证据见 §3 与 §6）。发布由 captain 按
> [`checklist.md`](checklist.md) 执行。

## §0. 这个目录里有什么

| 文件 | 是什么 | 什么时候看它 |
| --- | --- | --- |
| [`commit-message.txt`](commit-message.txt) | 提交信息（中文，`fix(secondary-page-layout-unification): …`；含"改了什么 / 为什么 / 数据与业务为何不受影响 / 文件清单"） | S4 `git commit -F` |
| [`pr-body.md`](pr-body.md) | PR 描述（变更摘要 / 改动文件 / **证据索引** / "数据 0 变化"的证明指引 / 发布顺序 / 风险与回滚） | S6 `gh pr create --body-file` |
| [`checklist.md`](checklist.md) | 发布顺序清单 S1→S11，每步都有成功判据与失败处置；§2 是 `verify.yml` / `deploy.yml` 的**逐条对照**（带文件:行） | 全程 |
| [`online-smoke.cjs`](online-smoke.cjs) | 线上几何冒烟脚本（1440 几何 + 390 溢出；deal id / model slug **现场从 sitemap 推导**） | S10（部署后） |
| `online-smoke-dryrun.json` / [`.txt`](online-smoke-dryrun.txt) | **本地 dry-run 主证据**：对着 `dist/` 跑 `/student/`（1 页） | 想确认脚本本身可用 |
| `online-smoke-dryrun-detail.json` / [`.txt`](online-smoke-dryrun-detail.txt) | dry-run 的 **detail 族分支**：现场推导出的 `/deal/<id>/` 与 `/models/<slug>/` | 同上 |
| `online-smoke-negcontrol-baseline.json` / [`.txt`](online-smoke-negcontrol-baseline.txt) | **负对照**：对改动前产物 `dist.baseline/` 必须红（EXIT=1） | 怀疑脚本"永远绿"时 |
| [`serve-dist-http.cjs`](serve-dist-http.cjs) | 演练用本机静态托管（回环 + 随机端口 + 与 Pages 同口径的目录解析/301 + **子路径挂载** + 访问日志；`--hang` 可造"连得上但永不响应"） | 跑 §5 的演练 |
| [`rehearse-online-path.cjs`](rehearse-online-path.cjs) | **线上代码路径**的本地演练编排器：8 条用例（正/反/健壮性），一条命令重跑 | 改动 `online-smoke.cjs` 之后 **必须重跑** |
| `online-path-rehearsal.json` / [`.txt`](online-path-rehearsal.txt) | 线上路径（`--base=` + **HTTP 取 sitemap**）演练：8 页全绿，含服务端访问日志 | 部署前 |
| `online-path-prefix-rehearsal.json` / [`.txt`](online-path-prefix-rehearsal.txt) | 同上，但挂在**项目站前缀** `/ai-deals-aggregator/` 下（与 GitHub Pages 同形状） | 部署前 |
| `online-path-negcontrol-baseline.json` / [`.txt`](online-path-negcontrol-baseline.txt) | 同一 `--base=` 模式的负对照：改动前产物必须 exit 1 | 部署前 |
| [`robustness-rehearsal.txt`](robustness-rehearsal.txt) | 健壮性三情形（sitemap 缺条目 / 404 与超时 / 前缀写错）的实测 + 代码级论证 | 怀疑"失败了会不会说不清"时 |
| [`rehearsal-summary.json`](rehearsal-summary.json) | 8 条用例的机器可读汇总 + 出口纪律核对（非回环 base 0 条 · 产物里真实域名 0 次） | 机器核对 |
| [`T23-FINAL-GATE.md`](T23-FINAL-GATE.md) | **发布前最终闸门报告**（add 清单终检 · 索引终检 · 物料自洽性 · §30 十五项 · 文档引用对账快照） | S2（发布前必读） |
| [`check-release-consistency.cjs`](check-release-consistency.cjs) | 闸门装置：索引 ⊂ add 清单 / 文档引用分类 / sha 绑定 / 版本 pin | S2 |
| [`proposed-gitignore-addendum.txt`](proposed-gitignore-addendum.txt) | 证据目录 `.gitignore` 的**追加块**（排除可再生 scratch + 按名字放回 4 个被引用文件；附实测复核命令） | S3 之前 |
| [`version-pins.json`](version-pins.json) / [`final-gate.json`](final-gate.json) | 版本绑定表（sha256·大小·行数·mtime）与闸门的机器可读结果 | S2 / 冻结后重跑 |
| [`add-manifest.txt`](add-manifest.txt) / [`add-manifest-dryrun.txt`](add-manifest-dryrun.txt) | 发布 `git add` 的**精确清单**与 `--dry-run` 预演读数（文件数 / 体积 / dist 排除证明） | S3 |
| [`evidence-index-snapshot.txt`](evidence-index-snapshot.txt) | PR 证据索引的**某一时刻**核对快照（发布前须在众人停写后重跑） | S2 / S11 |
| [`check-evidence-index.cjs`](check-evidence-index.cjs) | PR 证据索引的核对器：每条路径**存在** +（`--git`）**提交之后还在** | S2 / S11 |

## §1. 线上模式 vs 本地模式（**差别逐条**）

| | 线上模式（部署后由 captain 跑） | 本地模式（dry-run） |
| --- | --- | --- |
| 基线地址 | 缺省 = 生产 Pages 地址（`online-smoke.cjs` 的 `PROD_BASE` 常量；可用 `--base=` 换） | `--dir=<产物目录>` ⇒ 脚本自己起一个**只绑 `127.0.0.1`**、端口由内核分配的静态服务 |
| 取样来源 | HTTP 取 `${BASE}sitemap.xml`（**现场推导** `<slug>`/`<id>`） | 磁盘读 `<dir>/sitemap.xml`（同一套解析；退路 `deals.json` / `models.json`，会留痕 `fallback: true`） |
| 页面访问 | 8 页 × 2 档（真实线上访问，会产生 Analytics 事件） | 默认 8 页 × 2 档；dry-run 实际只跑 `--only=` 指定的页（本次 1–2 页） |
| 出网 | 必须出网（就是它的用途） | **一次都不出网**：这是**硬判据** —— 脚本记下所有 origin ≠ 基线的请求，本地模式下非空即失败（`externalRequests.enforced`） |
| Analytics | 真实上报（Cloudflare beacon 属第三方请求，脚本**只记录不判红**） | 生产守卫对 `127.0.0.1` 关闭上报；脚本的零外部请求断言同时证明没有别的出口 |
| 用途 | 验收"线上发出去的确实是这一版" | 证明**脚本本身可用**、判据真的会响（负对照） |
| 退出码 | 0 = 全过；1 = 有断言失败；2 = 环境/取数失败 | 同左（负对照那次应当是 1） |

两个模式共用**同一套判据**（镜像 `verify-site.js` §22c 的语义：主数据区选择器表、有字区域宽的算法、
冻结串逐字相同），差别只在"从哪里取页面" —— 所以 dry-run 绿不能替代线上绿，它替代的是
"脚本能不能跑、判据会不会响"。

> ⚠️ **第三种模式（t12 加的）：`--base=http://127.0.0.1:<port>/` 对着本机静态服务** ——
> 它走的是**线上那条代码路径**（HTTP 取 sitemap + 派生路由 + 子路径前缀），只是把托管换成本机回环。
> 这是部署前唯一能验证"线上那条路真的会跑"的办法，读数见 §5。

## §2. dry-run 的真实读数（跑出来的，不是预测）

三次运行都在本 worktree 里、都在 2026-10-06 16:30（CST）完成：

| 运行 | 命令 | 退出码 | 断言 | 关键读数 |
| --- | --- | --- | --- | --- |
| ① 主 dry-run | `--dir=dist --only=student/` | **0** | 9 项 / 失败 0 | `student/`（wide 族）：`main 1380px`、主数据区 `.ctable 1380px`、说明 3 条，第 0 条有字区域 **1380px / ratio 1.000**、盒 `30~1410`（同轴）、`frozenCount=1`；390 档 `scrollWidth 390 / clientWidth 390`；**外部 origin 0 个** |
| ② detail 分支 | `--dir=dist --only=deal:*,model:*` | **0** | 16 项 / 失败 0 | 推导出 `deal/2eae0e246de2/`（detail 族：`main.detail-main` 1120px、居中偏 0、说明 0 条）与 `models/claude-fable-5.1/`（`main.detail-main` 1120px、主数据区 `.ptable 1120px`、说明 **5 条**，各条 **1120px / ratio 1.000**）；两页 390 档均 `390 / 390`；外部 origin 0 个 |
| ③ 负对照 | `--dir=dist.baseline --only=student/` | **1**（预期） | 9 项 / 失败 5 | 改动前产物上：#0/#1/#2 有字区域 **453px < 0.85 × 1380px**（盒 `30~482.81`）、与主数据区/`<main>` **都不同轴**（容差 69px）、`frozenCount=0`（旧产物里没有那条共享规则） |

推导读数（两次运行的 `derivation` 完全相同，说明它**不依赖页面、只依赖产物**）：
`sitemapLocs=183`、`dealRoutes=80`、`modelsRoutes=51`、`rootPrefix=/ai-deals-aggregator/`、
`fallback=false`；取样页 = `deal/2eae0e246de2/` 与 `models/claude-fable-5.1/`。

> ⚠️ 一个真实的踩坑记录（留在这里，免得下一个人重踩）：`<loc>` 是**绝对 URL**，而站部署在子路径
> `/ai-deals-aggregator/` 上 —— 第一版脚本砍掉 origin 后拿到 `ai-deals-aggregator/deal/…`，
> 一条都匹配不上，于是**静默退到 `deals.json`**（读数照样是数字，来源却换了）。
> 现在：① 显式剥掉站点根前缀（前缀从 BASE 与 sitemap 自身两处取）；② 退路会写 `fallback: true`
> 并在 stdout 打 ⚠️；③ 上面的 dry-run 读数里 `fallback=false` 就是"走的真是 sitemap"的证据。

## §3. 纪律（这次**没有**做什么，以及怎么复核）

- **没有对线上域名发起任何请求**（两条机器判据）：
  ```bash
  # ① 本目录的产物里不许出现任何 github.io 地址
  Select-String -Path research/_raw/secondary-page-layout-unification/release/*.json -Pattern 'github\.io'   # 期望 0 行
  # ② 演练编排器自带的出口纪律：非回环 base 0 条 + 演练产物里真实域名 0 次
  node research/_raw/secondary-page-layout-unification/release/rehearse-online-path.cjs   # 末行会打印这两项读数
  ```
  三个 dry-run JSON 与三次 `--base=` 演练的 `base` 全是 `http://127.0.0.1:<随机端口>/…`，
  `externalRequests.origins` 全是 `[]`（本地模式下这是硬断言）。
- **没有 `git add` / `git commit` / `git push`**：本目录的产物全部是未跟踪文件；`git status` 里
  只有 7 个源文件的 ` M`（那是 T1/T2/T7 的实现与修复，不是本任务的写入）。
- **只写了 `research/_raw/secondary-page-layout-unification/release/**`**：其它一切（含 `dist/`、
  `dist.baseline/`）都是**只读**使用 —— 静态服务只读文件、浏览器只导航。

## §4. 复现与 provenance

```bash
# 三次 dry-run（顺序、参数与本文件 §2 完全一致）
node research/_raw/secondary-page-layout-unification/release/online-smoke.cjs --dir=dist --only=student/ \
     --out=research/_raw/secondary-page-layout-unification/release/online-smoke-dryrun.json
node research/_raw/secondary-page-layout-unification/release/online-smoke.cjs --dir=dist --only=deal:*,model:* \
     --out=research/_raw/secondary-page-layout-unification/release/online-smoke-dryrun-detail.json
node research/_raw/secondary-page-layout-unification/release/online-smoke.cjs --dir=dist.baseline --only=student/ \
     --out=research/_raw/secondary-page-layout-unification/release/online-smoke-negcontrol-baseline.json

# 线上代码路径演练（8 条用例，§5）：自己起服务、自己收尾，一条命令重跑
node research/_raw/secondary-page-layout-unification/release/rehearse-online-path.cjs

# 发布清单预演（§3 之前先看这个）
git add --dry-run --all -- index.html scripts/lib/page-kinds.js scripts/lib/archive.js \
     scripts/tools/build-local.js scripts/tools/verify-site.js scripts/tools/archive-selftest.js \
     scripts/tools/seo-selftest.js research/_raw/secondary-page-layout-unification
```

| 身份 | 值 |
| --- | --- |
| `release/online-smoke.cjs` sha256 | `ab1e51278d0fe408454ceaf73e7f379753052c0c62193ec940c1db71c245a6c5`（t12 之后：加了 `--sitemap-timeout=`、去掉误导性退路提示；**改它就必须重跑 §5 演练**） |
| `release/serve-dist-http.cjs` sha256 | `21caa30e8243049e81cb69da0e46542f5fd0d3acdfe37d49ac1b03346b104177` |
| `release/rehearse-online-path.cjs` sha256 | `6aa09a7ca420f60b236d537abaa94d79933c3f07ab1a9ca0ed1040927bf8ce42` |
| `dist/`（dry-run 与演练的目标产物） | mtime `2026-10-06T15:31:01`；`index.html` sha256 `de028a0d9fdd59c630923e97297e67ce1c6481a3a3d216155989e3247e8d974b`；`sitemap.xml` sha256 `1b633ae9c231a31e0a3ab91d5fc83702dc4c656a85ead3f941df9517c074a5bd` |
| `dist.baseline/`（负对照的目标产物） | mtime `2026-10-06T14:27:50`（改动前只读基线，本次工作窗口内 0 次写入） |
| Node / Edge / playwright-core | `v24.13.1` / `154.0.4258.37`（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`）/ `1.63.0` |

> 浏览器版本与产物都可能在下一次构建后变化 —— 上表的用途是"能对得上号"，不是"必须一模一样"。
> 真要复核，先看 JSON 里的 `browser.executablePath` 与 `derivation`，再看 §2 / §5 的读数形状。

## §5. **线上代码路径**演练（t12：`--base=` + HTTP 取 sitemap）

为什么单独一段：dry-run 走的是 `--dir=` **读盘**；线上真正走的是 `--base=` ——
`${base}sitemap.xml` → 现场派生路由 → 逐页导航。这条路径此前**一次都没被执行过**，
它的 bug 只会在部署之后暴露。t12 用 [`serve-dist-http.cjs`](serve-dist-http.cjs)
（回环 + 随机端口 + 与 Pages 同口径的目录解析/301/**子路径挂载**）把它跑了一遍。

编排器：[`rehearse-online-path.cjs`](rehearse-online-path.cjs)（8 条用例，末行打印出口纪律读数）：

| 用例 | 期望退出码 | 实测 | 关键读数 |
| --- | --- | --- | --- |
| ① 线上路径 · `dist` 挂在 `/` · 8 页全跑 | 0 | **0**（4.1s，**79 项断言 0 失败**） | `derivation.source=sitemap:http`、`rootPrefix=/ai-deals-aggregator/`、`locs=183 / deals=80 / models=51`；8 页全部 `ratio 1.000`、`frozenCount=1`、390 档 `390/390` |
| ② 线上路径 · `dist` 挂在 `/ai-deals-aggregator/`（与项目站同形状） | 0 | **0**（4.2s，79 项 0 失败） | 与 ① **逐页读数完全一致**（`main`/主数据区/说明条数/每条说明宽与左右边缘/390 全部相等） |
| ③ 负对照 · `dist.baseline`（改动前产物） | 1 | **1**（5 项失败） | `453px < 0.85×1380`、与主数据区/`<main>` **不在同一轴**、`frozenCount=0` |
| ④ sitemap 缺 `deal/` 条目 | 2 | **2** | `FAILED: 线上 sitemap 里 deal 路由 0 条 / models 路由 2 条 —— 推不出取样页（线上模式没有 JSON 退路…）` |
| ⑤ sitemap 缺 `models/` 条目 | 2 | **2** | `FAILED: … deal 路由 2 条 / models 路由 0 条 …` |
| ⑥ sitemap 不存在（404） | 2 | **2** | `FAILED: 取线上 sitemap 失败：http://127.0.0.1:…/sitemap.xml → HTTP 404 …` |
| ⑦ 连得上但**永不响应**（`--hang`） | 2 | **2** | `FAILED: … → 超过 1200ms 未响应 …`（`--sitemap-timeout=`；没有它这里会**静默挂死**） |
| ⑧ 前缀写错（服务挂子路径、base 给根） | 2 | **2** | 服务端日志：`GET /sitemap.xml 404（不在挂载前缀 /ai-deals-aggregator/ 下）` |

**"确实走了 HTTP"的证据**（原始日志，不是转述）：
`online-path-rehearsal.txt` 里服务端访问日志第 2 行是 `GET /sitemap.xml 200 (sitemap.xml)`，
紧随其后是 `推导来源：sitemap:http · 站点根前缀 /ai-deals-aggregator/`、
`推导：deal 80 条 → 取 deal/2eae0e246de2/`、`推导：models 51 条（已排除 /models/ 索引） → 取 models/claude-fable-5.1/`；
②里那条是 `GET /ai-deals-aggregator/sitemap.xml 200 (sitemap.xml)`。

**这一步对 `online-smoke.cjs` 的三处改进**（都是演练逼出来的，不是预防性设计）：
1. `--sitemap-timeout=`（缺省 15000ms）：`fetch` 默认没有超时，线上"连得上但不响应"会让脚本**静默挂死**；
2. 线上模式不再打印"退到 deals.json / models.json"那句误导性的退路提示（线上根本没有 JSON 退路）；
3. 子路径前缀的解析在**根前缀与项目站前缀两种形状**下都跑通了（`rootPrefix` 从 sitemap 自身也能认出来）。

## §6. 出口纪律（机器核对，不靠嘴说）

- 8 条用例的 `base` **全部**是 `127.0.0.1`（`rehearsal-summary.json` 的 `egress.nonLoopbackBases = []`）；
- 演练产出的 8 个证据文件里出现真实线上域名的次数 **0**（`egress.realDomainHitsInRehearsalArtifacts = []`；
  编排器在写完之后还会**再扫一遍终态**，非 0 即退出码 2）；
- 真实线上域名的字符串只允许出现在 `online-smoke.cjs` 的功能常量（线上模式的缺省基线地址）里 ——
  那是"要打哪里"的声明，而**所有实际请求**都在上面那些服务端访问日志里，逐条都是回环地址上的路径。
