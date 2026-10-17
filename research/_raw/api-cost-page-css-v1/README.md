# `api-cost-page-css-v1` 原始读数（2026-10-16）

`/tools/api-cost/` 补页面级 CSS 那一轮的**原始证据**，全部取自**要推上线的那棵树**
（分支 `fix/api-cost-page-css`，基线 `origin/master` = `602a0b1`）。
规范行与判据口径见 [`docs/DESIGN-RULES.md`](../../docs/DESIGN-RULES.md) 的
「API 成本计算器的排版补课」一节；交付报告见
[`research/v3.1-api-cost-calculator-report.md`](../v3.1-api-cost-calculator-report.md) 的
「追记（2026-10-16）」；排版契约见 [`docs/SCHEMA-v3.1.md`](../../docs/SCHEMA-v3.1.md) §7。

**缺陷一句话**：`renderApiCostPage()` 没给 `renderWidePageShell()` 传 `extraCss` ⇒ 这一页只有共享
`<style>` 一份，15 个 `.cost-*` 类名零声明；而构建期自检 + §20b（当时 23 条）+ SEO 门禁全绿。

## 进版本库的（本目录）

| 文件 | 是什么 | 怎么复跑 |
|---|---|---|
| `geometry-before.json` / `geometry-after.json` | 逐档（390/761/940/1280/1440）现场几何：控件盒与计算样式、两张表的列右缘、页高、横向溢出 | `node .scratch/apicost/shots.mjs <tag>`（在对应的工作树里跑，见下） |
| `verify-report-dist-929-0.json` | 要推的那棵树：`verify-site.js --compare=… --json=…` **929 项 / 0 失败**（`/tools/api-cost/` 前缀 31 条；`--compare` 6 条） | `node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json --json=<文件>` |
| `verify-report-mutant-929-5.json` | **变异牙**：产物里第二个 `<style>`（含 `.cost-panel`，4775 字节）整块删掉、其余字节原样 ⇒ **929 项 / 失败 5 项**：红的正好是 5 条依赖页面 CSS 的判据，**旧那 23 条一条都不红** | `node .scratch/apicost/make-mutant.mjs <产物目录> <副本目录>`（把 `<产物>.notes.ndjson` 复制成 `<副本>.notes.ndjson`）→ `node scripts/tools/verify-site.js --dir=<副本> …` |
| `live-gate-1440.json` | **上线之后**把这一轮的判据指到**线上 URL**上原样重跑：**9 项 / 0 失败**（§20b 8 条 + §22c ③c 1 条；判据代码与 `verify-site.js` 逐字同构），含控件行左边缘 `47 / 499.66 / 952.33`、示例表 1380 = 列宽、caption 1 行、空态不含「免费」、两表同列模型、数字列右对齐等逐条读数 | `node .scratch/apicost/live-gate.mjs`（默认打 `https://buguoshixc.github.io/ai-deals-aggregator/tools/api-cost/`，`LIVE_URL=` 可换） |
| `README.md` | 本文件 | — |

> **订正（2026-10-16，推送后自查）**：`docs/DESIGN-RULES.md` 那一节的「症状」表，第一版把**改后**控件行的
> 左边缘写成 `47 / 534.8 / 1022.5`。其中后两个数抄自本目录**之外**的中间态文件
> `.scratch/apicost/after/geometry.json`（那是当时还没定稿的**两列结果表**的
> `breakdownRows[].tdBox.x`），不是控件行读数；而且它与同一格里的「宽各 440.66px」**算术不相容**
> （3×440.66 + 2×47 ≈ 1416 ≠ 面板内容宽 1346）。已订正为 **`47 / 499.66 / 952.33`**，
> 依据是本目录的 `geometry-after.json`（`selectBox.x = 47`、宽 `440.7`）、@1440 本地构建、
> 以及 `live-gate-1440.json`（线上页）。**原值不会有任何门禁拦下** —— 这正是它值得记一笔的原因：
> 两个文件同名同形（都 1844 行）、只差数字，抄错时静默通过。

想看逐条判据（含 detail 读数）：

```powershell
node -e "const r=require('./research/_raw/api-cost-page-css-v1/verify-report-dist-929-0.json');for(const c of r.checks.filter(x=>x.name.startsWith('/tools/api-cost/')))console.log(c.ok?'OK ':'FAIL',c.name,'—',c.detail)"
```

## 留本地的（`.gitignore` 明确覆盖，不进版本库 —— 与全仓一致：`research/_raw/**/*.png` 0 个已跟踪、`*.log` 自 105 行起不再收）

| 文件 | 是什么 | 怎么复跑 |
|---|---|---|
| `before-1440.png` / `before-390.png` | 改前（= `origin/master` 原样，也就是线上当时的样子）的长截图 | `git worktree add --detach <目录> origin/master` → 在该目录 `node scripts/tools/build-local.js` → `node <仓库>/.scratch/apicost/shots.mjs before-master` |
| `after-1440.png` / `after-390.png` | 改后（= 要推的那棵树）同口径长截图 | 在该目录 `node <仓库>/.scratch/apicost/shots.mjs after-master` |
| `after-dark-1440.png` | 改后暗色（`data-theme="dark"`）长截图 | `node <仓库>/.scratch/apicost/dark.mjs <tag>`（同时打印 15 个文本级选择器的对比度：亮/暗两侧最低 6.08:1） |
| `after-advanced-open-1440.png` | 展开「缓存相关（可选）」后的样子（栅格第三行同样三格对齐） | `node <仓库>/.scratch/apicost/states.mjs` |
| `verify-dist.log` / `verify-mutant.log` | 上面两次跑法的完整控制台输出 | 同前两行的命令，`… \| Out-File <文件> -Encoding utf8` |

> 量测脚本按本仓惯例放 `.scratch/apicost/`（`.gitignore:116` 覆盖 `.scratch/`，不进版本库）：
> `shots.mjs`（截图 + 几何）· `dark.mjs`（暗色对比度）· `states.mjs`（焦点/悬停/展开态）·
> `make-mutant.mjs`（造变异副本）· `split-mine.mjs`（把这一轮的 hunk 从共享文件里摘出来 ——
> 当时工作树里还有另一个会话未提交的 v3.2 改动，推送时只带这一轮）。
