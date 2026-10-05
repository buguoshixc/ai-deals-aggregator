# leaf-detail-layout-v1 · 最终报告

> 范围：**Leaf / Detail Page 布局修复**。不改数据、不改文案、不重构其它系统。
> 分支 `leaf-detail-layout-v1` · worktree `.worktrees/leaf-detail-layout-v1` · 基线 `d09a1c5`
> 冻结提交：`f2dec0c`（实现 + 验收脚本）· 文档提交见文末

---

## 1. Root Cause

共享 `<style>`（`index.html` 里那一份，deal 详情页与模型页都从它抽取）把**宽度写在了卡片自己身上**：

```css
.dpane     { … max-width: 820px; }                  /* 详情卡 */
.dpane-src { … max-width: 820px; word-break: break-all; }  /* 底部来源小字 */
```

而外层只有一个 `.wrap { max-width: 1420px; margin: 0 auto; padding: 0 20px 60px; }`——
**详情主体自己没有任何居中容器**。于是三层错位：

| 元素 | 改动前宽度 | 与容器关系 |
|---|---|---|
| `.crumb` / `.dpane-more` | 1380px（@1440） | 铺满 `.wrap` 内容盒 |
| `.dpane` | **820px** | 贴 `.wrap` 左边界 |
| `.dpane-src` | **820px** | 贴左，且 `word-break: break-all` 让英文/URL 逐字符断行 |
| 模型详情 `main` | **1380px** | 第三套宽度（整幅） |

实测（Edge 1440×900，`/deal/2eae0e246de2/`）：

```text
main   30 … 1410   (1380)
.dpane 30 …  850   ( 820)   ← 贴左
.dpane-src 30 … 850 ( 820)  ← 贴左 + break-all
居中偏差 = 30 − (1440−850) = 560px
```

即：**内容确实偏左 560px，右侧 560px 无意义空白；且 `.dpane-more` 是 1380px 的第三套右边界**；
模型详情页更极端——它压根没有 820px 这一层，是整幅 1380px，所以两族叶子页从来就不一致。

顺带修掉一处同块内的 0px 间距：`.dpane-more` 在任何地方都没有 CSS 规则（全局 `* { margin: 0 }`），
实测它与卡片底边距 = 0px（链接行直接贴在卡片边框上）。

---

## 2. 修改了哪些文件

`git diff --stat master..HEAD`（提交 `f2dec0c`）：

```text
 index.html                   |  10 +-
 scripts/tools/build-local.js |  14 +-
 scripts/tools/verify-site.js | 583 +++++++++++++++++++++++++++++++++++++++++++
 3 files changed, 601 insertions(+), 6 deletions(-)
```

1. **`index.html`（共享 `<style>`，全站唯一视觉规则来源）**
   - 新增 `.detail-main { width: min(1120px, 100%); margin-inline: auto; }`；
   - `.dpane`：`max-width: 820px` → `width: 100%; max-width: none`；
   - `.dpane-src`：`max-width: 820px; word-break: break-all` → `width: 100%; max-width: none; word-break: normal; overflow-wrap: anywhere`；
   - 新增 `.dpane-more { margin-top: var(--s3); }`（12px，与 `.dpane-src` 同一档间距）；
   - `.jumpback` / `.crumb` 规则逐字未改。
   - **没有新建** `detail.css` / `deal-detail.css` / `detail-fix.css`：规则只有这一处。

2. **`scripts/tools/build-local.js`**
   - `writeDetailPages()`：deal 详情页模板 `<main id="main">` → `<main id="main" class="detail-main">`；
   - `renderModelsShell()`：新增 `mainClass` 选项（**缺省为空 ⇒ `<main id="main">` 一字不改**），
     只有**模型详情页**调用点传 `'detail-main'`；models 索引 / archive 索引与详情 / docs/data 四个调用点未动。

3. **`scripts/tools/verify-site.js`（本次的"牙"）**
   - 新增 §22b「叶子详情页统一内容列」41 条真浏览器断言 + M1–M5 变异牙；
   - 只在 §22 与 §23 之间插入（`+583 / −0`，两个 hunk：顶部一行 `require('crypto')` + 5321–5902 连续块），
     **既有断言一行未改**，`--compare` 语义未动，未新增 gate 步骤，未触碰
     `.github/`、`check-ci-consistency.js` 的冻结表与 `--expect-checks`。

**明确未改**：首页、`/plans/`、`/plans/api/`、`/plans/coding/`、`/models/` 索引、`/vendor/`、`/category/`、
`/need/`、`/changes/`、`/feeds/`、`/status/`、`/docs/data/`、`/archive/**`（属 §十一 的 History 家族，
且当前 `ended/restored` 事件为 0、盘上 0 个档案详情页）；`.cmpshare` 的既有 `word-break: break-all`
（首页对比分享条）也刻意保留 —— 它不在本次范围。

---

## 3. 最终 Detail Content Width

```css
.detail-main { width: min(1120px, 100%); margin-inline: auto; }
```

- **1120px**（题面推荐区间 1080–1120 的上界，第一候选）；
- 视口 < ~1160px 时 `min()` 自然退化为满宽，并保留 `.wrap` 的 20px（窄屏 16px）padding；
- `.wrap`（1420px）、`.topin`（Header）、`<footer>` **不跟着缩窄**；
- 不变量：**`detail-main` 宽度 ≈ `.dpane` 宽度**（不允许再出现 1120 + 820 那种两层框）。

---

## 4. Deal Detail 桌面测量结果

（Edge，真浏览器 `getBoundingClientRect()`；判据 = 居中偏差 ≤ 8px、列宽 ∈ [1080,1120]、轴极差 ≤ 1px）

| 视口 | `.detail-main` | 居中偏差 | `.dpane` | `.dpane-src` | `.topin` | `footer` |
|---|---|---|---|---|---|---|
| 1600×900 | 240 … 1360（1120） | **0px** | 1120 | 1120 | 1420 | 1380 |
| 1440×900 | 160 … 1280（1120） | **0px** | 1120 | 1120 | 1420 | 1380 |
| 1280×800 | 80 … 1200（1120） | **0px** | 1120 | 1120 | 1280 | 1240 |
| 768 | 20 … 748（728 = 可用宽） | — | 728 | 728 | 768 | 728 |

- 同轴：`crumb / .dpane / .dpane-more / .dpane-src` 左右极差 **0px**；
- `.dpane-src` 计算样式：`word-break: normal`、`overflow-wrap: anywhere`，宽度 1120 == 列宽，自身溢出 0px；
- 改动前 → 后：`main` **1380 → 1120**、`.dpane` **820 → 1120**、居中偏差 **560px → 0px**；
- 首页 `main` 仍是 1380px、`.wrap` 1420 / `.topin` 1420 / `footer` 1380，**前后一致**。

---

## 5. Model Detail 桌面测量结果

- `main` **1380 → 1120**，三档（1600/1440/1280）居中偏差 **0px**；
- 与 deal 详情**同一列宽**（跨页一致性断言：两页列宽差 ≤ 1px）；
- 改动前模型页 `.dpane*` 元素 count = **0**（它根本没有 820px 那一层）⇒ 改动前两族叶子页本就不统一，
  本次统一到同一条 `.detail-main` 规则；
- 波及面（186 页全量扫描）：带 `class="detail-main"` 的 `<main>` 恰好 **131** 个 = 80 deal + 51 model；
  索引页 / 档案页 / 数据文档页 / 首页 **0** 个；每页恰好 1 处 `.detail-main` / `.dpane` / `.dpane-src` 规则，
  全站 `max-width: 820px` 声明 **0** 处；
- 收窄到 1120px 的预检：44→51 个模型页与 80 个 deal 页在 1440 下**页面级横向溢出 0**，`.ptable-wrap` 内部溢出 0。

---

## 6. 390px 手机端 overflow 结果

| 页面 | 视口 | `documentElement.scrollWidth` | 结论 |
|---|---|---|---|
| deal 详情（`/deal/2eae0e246de2/`） | 390×844 | **390** | 无横向滚动 |
| deal 详情（最长官方 URL `8e7b0fd03e73`，129 字符） | 390×844 | **390** | 无横向滚动，URL 正常换行 |
| model 详情（`/models/360zhinao-pro/`） | 390×844 | **390** | 无横向滚动 |
| 768px | 768 | **768** | 详情列自然退化为可用宽 |

- `.dpane-src` 在 390px 下自身溢出 0px（`overflow-wrap: anywhere` 生效）；
- 普通文本不再被逐字符断行（`word-break: normal`，判据限定在 `.dpane-src`，不去误伤首页 `.cmpshare`）。

---

## 7. Mutation 结果（M1–M5 真红）

变异发生在**浏览器页面内联 `<style>` 的真实字节**上（不写盘 ⇒ 天然 byte-exact），每条变异都先断言
**锚点出现次数恰好 1**（否则判红 = 反空洞守卫）。

| ID | 变异 | 期望违规码 | 实测 |
|---|---|---|---|
| M1 | `.detail-main` 去掉 `margin-inline: auto` | `center` | 居中偏差 0 → **260px** ✅ |
| M2 | `.dpane` 恢复 `max-width: 820px` | `width` | 列宽 1120 → **820** ✅ |
| M3 | `.dpane-src` 恢复 `max-width: 820px` | `src-width` | 来源块 1120 → **820** ✅ |
| M4 | 去掉 `overflow-wrap: anywhere` + 注入超长 URL | `page-overflow` | @390 scrollWidth 390 → **1213** ✅ |
| M5 | 只把 model 页列宽改成 1100px | `leaf-consistency` | 两页列宽差 0 → **260** ✅ |

- **M4 正对照**：同样的超长 URL、CSS 不动 ⇒ @390 scrollWidth 仍 390、违规码为空（证明牙咬的是 CSS，不是注入本身）；
- **锚点唯一性负例**：独立审计自造「M4 锚点出现 0 次」的 dist 副本 ⇒ `verify-site.js` 打印
  `✗ §22b M4 变异锚点唯一 … 0 次 ⇒ 变异未生效，判红`，**776 项失败 4 项、退出码 1**
  （日志 `research/_raw/leaf-detail-layout-v1/audit/anchor-missing-guard.log`）；
- **零污染**：变异前后 `dist/deal/8e7b0fd03e73/index.html` 与 `dist/models/360zhinao-pro/index.html`
  的 sha256 相等（`1ad7d3f5…` / `562f37bf…`）—— 磁盘产物一个字节都没动。

---

## 12. 是否有任何数据层变化

**没有。** 三条互相独立的证据：

1. **提交面**：`git diff --name-only master..HEAD -- deals.json plans.json api-plans.json models.json
   model-registry-links.json scripts/data` = **空**；
2. **产物面**：忠实改动前构建（`d09a1c5` 干净 worktree 重新构建）vs 改动后产物 ——
   **303 → 303 文件**、**117/117 非 HTML 文件逐字节相同**（json / xml / css / png / txt / svg）、
   **186/186 HTML 页剥掉 `<style>` 与 `detail-main` 类之后正文逐字节相同**；
   样式块行集合差恰好 **+8 / −2**，全部是本次那几条规则（多一行都算夹带）；
3. **门禁面**：strict 校验 / 可重建性 / 历史一致性 / models·plans·api-plans 可重建性 / 种子数据自测
   在 Full Gate 里逐条跑过（读数见 §8）。

即：Deals / Plans / API Pricing / Models / Registry links / History / Feeds / Sitemap 成员 / Coverage
**全部语义与字节不变**。

---

## 8. Full Gate（本地，提交 `f2dec0c`）

跑法：**现场解析** `.github/actions/gate/action.yml`（49 步 · sha256 `d1c4b0df6900edf8…`）后逐条串行执行
（`research/_raw/leaf-detail-layout-v1/gate/run-full-gate.cjs`），每一步的原始 stdout/stderr 落
`gate/steps/NN-<slug>.txt`。**没有写死历史步数**。

```text
0) CI 口径检查（verify.yml 在调用 gate action 之前的那一步）
   ✅ CI 口径检查 38 项，失败 0 项          （--expect-checks=38，数字取自 verify.yml 调用行）

1) Gate action：49 步 → 本机执行 45 步，通过 45，失败 0，跳过 4
   ⊘ Install dependencies                     npm ci 已按 lockfile 装好
   ⊘ Prepare browser for the real-browser gate CI 专用 shell
   ⊘ Browser availability decision (never silent) CI 专用 shell（该 shell 由 check-ci-consistency (10) 真实执行）
   ⊘ Gate conclusion                          CI 专用：只写 Step Summary
   ✅ Real-browser acceptance (verify-site.js)  67.5s  → 验收 776 项，失败 0 项（含 §22b 41 项）
   ✅ Regression verify (baseline compare)      68.5s  → 验收 782 项，失败 0 项
```

回归比对读数（与 2026-09-29 冻结基线比）：

| 指标 | 基线 → 本次 | 判定 |
|---|---|---|
| 覆盖优惠条数 | 80 → 80 | ✅ 不减 |
| 卡片数 | 50 → 50 | ✅ 不减 |
| 首屏完整可见 | 9 → 9 | ✅ 不减 |
| 首页页高 | 4589px → 4665px | ✅ 容差 15% 内（+1.7%） |
| 外部请求 | 0 → 0 | ✅ 不增 |
| JS 错误 | 0 | ✅ |

> **首页页高那 +76px 的归因（不是本次改动）**：把**忠实的改动前构建**（`d09a1c5` 干净 worktree）
> 与改动后产物在同一视口下各量一次首页 —— **4665px vs 4665px，逐像素相同**；卡片数 50、卡高 192px、
> 首屏 9、三列栅格全部相同。基线是 6 天前冻结的，中间数据在动。证据：`gate/visual-and-home-height.json`。

本地 Analytics：`本地：真实资源计时里 0 次 Cloudflare 请求` + `网络层同样 0 次分析请求` ✅。

**环境注记（如实记录）**：本机 DNS 解析到的 `github.com`（`20.205.243.166`）在该时段不可达（21s 超时），
而 `api.github.com` 与 GitHub 的其它 frontend IP（`140.82.112.0/20`）可达。因此 git 的取/推使用了
`git -c http.curloptResolve=github.com:443:140.82.112.3 -c http.sslBackend=schannel`（**只作用于进程，
未改系统 hosts、未改全局 git 配置**）。这是网络环境问题，与本次改动无关。

---

## 9. CI

| 项 | 实测 |
|---|---|
| PR | [#42](https://github.com/buguoshixc/ai-deals-aggregator/pull/42)（`leaf-detail-layout-v1` → `master`） |
| 必需检查 `gate` | **pass**，3m9s（run [37312570913](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/37312570913)） |
| 日志 | `research/_raw/leaf-detail-layout-v1/gate/ci-checks.txt` |

CI 上跑的是同一个复合 action（49 步），包括真浏览器验收与回归比对 —— 也就是 §22b 的新牙与 M1–M5
变异牙在 CI 里同样真跑（`DSH_EDGE` 指向 runner 上真实存在的浏览器）。

---

## 10. Deploy

| 项 | 实测 |
|---|---|
| 合并 | `gh pr merge 42 --merge` ⇒ master 上的 merge commit（标题 `Merge pull request #42 from buguoshixc/leaf-detail-layout-v1`） |
| 触发 | push → `Verify site (gate)` run [37313015467](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/37313015467) + `Deploy to GitHub Pages` run [37313015545](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/37313015545) |
| 结果 | **两个 workflow 都 success**（deploy：build job 全绿 → `Deploy to GitHub Pages` 步骤 ✓） |
| 线上字节确认 | `/deal/2eae0e246de2/`：`class="detail-main"` **存在**、`max-width: 820px` **已消失** |

---

## 11. Online Smoke

只打 **3 个页面**（首页 / 一个 deal 详情 / 一个 model 详情）+ 2 份 JSON 取样（JSON 不是页面访问，
不产生页面级 Analytics 事件）—— 站点有真实 Analytics，刻意不做全站遍历。
脚本：`research/_raw/leaf-detail-layout-v1/smoke/online-smoke.cjs`；读数：`.../smoke/online-smoke.json`。

```text
✅ Online Smoke 9 项，失败 0 项
  ✓ 首页 HTTP 200
  ✓ 首页没有被详情列波及（<main> 无 detail-main，且无横向溢出）   main 1380px / wrap 1420px
  ✓ /deal/2eae0e246de2/ 桌面详情内容列（HTTP 200）                main=1120px @160~1280 · 居中偏差 0px
  ✓ /deal/2eae0e246de2/ 来源块与正文同宽                          src=1120px / main=1120px
  ✓ /deal/2eae0e246de2/ 普通文本不被逐字符断行                     word-break=normal · overflow-wrap=anywhere
  ✓ /deal/2eae0e246de2/ 390px 无横向溢出                          docScroll=390 · 来源块自身溢出=0
  ✓ /models/360zhinao-pro/ 桌面详情内容列（HTTP 200）              main=1120px @160~1280
  ✓ /deal 与 /models 叶子页共用同一条内容列宽度（一致性）           deal=1120px / model=1120px
```

---

## 8–11 小节之外的补充：视觉检查（§十五）

真浏览器截图（`shots/`，已 gitignore）并**实际打开看图**：

| 截图 | 读数 | 结论 |
|---|---|---|
| `deal-1600.png` | main 240..1360（1120） | 居中、左右各 240px 空白对称，正文不过宽 |
| `deal-1440.png` | main 160..1280（1120） | 居中、卡片与字段表比例合适 |
| `model-1440.png` | main 160..1280（1120） | 与 deal 同一列；`.minfo` 与 9 列计价表都放得下、无横向滚动 |
| `deal-768.png` | main 20..748（728） | 自然退化为可用宽，保留 20px padding |
| `deal-390.png` | main 16..374（358） | 单列字段表、标题自然折行、无横向滚动 |

即：不是"数学上居中但视觉上太宽 / 太窄"。


---

## 附录 A · 证据索引

| 证据 | 位置 |
|---|---|
| 改动前基线（忠实重建） | `research/_raw/leaf-detail-layout-v1/baseline/baseline-head/`（+ `sha256.txt`） |
| 两份基线的用途边界 | `research/_raw/leaf-detail-layout-v1/baseline/README.md` |
| 全产物逐字节对账 | `.../gate/before-after-compare.cjs` + `.json` |
| 独立审计探针（不依赖仓库代码） | `.../audit/leaf-probe.cjs` + `before.json` / `after-*.json` |
| 独立变异复算 | `.../audit/mutations-real/M1–M5.json` |
| 反空洞守卫负例 | `.../audit/anchor-missing-guard.log` |
| 独立复查结论 | `research/leaf-detail-layout-v1-self-audit.md` |
| Full Gate 逐步日志 | `.../gate/steps/NN-*.txt` + `summary.json` |
| 线上冒烟 | `.../smoke/online-smoke.cjs` + `online-smoke.json` |
| 视觉检查截图（不入库） | `.../shots/`（1600 / 1440 / 768 / 390） |
