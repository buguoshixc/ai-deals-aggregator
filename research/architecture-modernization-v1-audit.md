# architecture-modernization-v1 · 架构审计（Phase 1）

> **状态**：审计完成，本轮实施以本文为准。
> **基线**：`e0ca04a0a2d139ae30c5c6977069669252c85d90`（`origin/master`，2026-10-07）
> **工作树**：`.worktrees/architecture-modernization-v1`（分支 `architecture-modernization-v1`）
> **取证方式**：所有数字都是**本轮实测**（测量脚本 + 真实 build/verify/gate 运行），
> Prompt 里提到的任何文件大小、行数只当背景，一律不作真值。
> **纪律**：不按「文件太大」机械拆分；每条状态判定必须能指到证据。

---

## 1. Baseline 实测事实表

| 项目 | 实测值 |
|---|---|
| baseline SHA | `e0ca04a` |
| Node / npm | v24.13.1 / 11.19.0 |
| `package-lock.json` sha256 | `47C3A2F0…125028` |
| 工作树状态 | 干净（无已跟踪改动） |
| `scripts/**/*.js` | **165 个文件 / 89,505 行** |
| require 边 | 489 |
| **循环依赖** | **0** |
| **`lib → {tools,build,ai}` 违规** | **0** |
| 分层文件数 | `lib` 51 · `tools` 84 · `ai` 20 · `collectors` 5 · `data` 1 |
| **build** | **2.9 s**，产物自检全过（暂存目录 → 原子替换） |
| **verify** | **106.7 s**，**852 项断言全过**，退出码 0 |
| 产物 | `dist/` 303 文件 · **186 个 HTML** · tree sha256 `a5c16db8…` |
| 稳定 ID | deal **138** · model **51** · plan **44** · apiPlan **24** |
| sitemap | **183** 条 URL（3 条别名页排除） |
| Feed | 25 个 Feed × 2 格式 = 50 文件；根 `feed.json` 80 条目 |
| 最大两个文件 | `verify-site.js` **522,527 B / 8,057 行**；`build-local.js` **407,799 B / 6,677 行** |
| 次大工具 | `coverage-report.js` 118,469 B · `coverage-targets-selftest.js` 118,146 B · `check-ci-consistency.js` 116,533 B |
| 最大 lib | `model-registry.js` 104,077 B · `feeds.js` 85,903 B · `models-page.js` 82,468 B · `plans-page.js` 80,496 B |
| 最大测试 | `models-page-selftest.js` 100,780 B · `plans-selftest.js` 100,707 B · `models-selftest.js` 92,553 B |
| 门禁 action | 35,555 B / **553 行 / 48 个步骤 / 45 个冻结脚本路径** |
| `check-ci-consistency.js` | 116,533 B / 1,770 行 / **38 条断言 + 1 看门狗** / `--expect-checks=38` |
| `index.html` | 293,624 B / 4,969 行 / 共享 `<style>` **57,692 B** |
| `page-kinds.js` | 20,616 B / 447 行（含 `LAYOUT_FAMILIES` + `assertLayoutDeclarations()`） |
| `research/` 已跟踪 | **1,161 文件 / 32.9 MB**（`_raw` **1,012 文件**；`.cjs` **217 个**） |
| `research/_raw` 磁盘 | 1,405 文件 / 104.4 MB |
| `.git` | 68.9 MB |
| `selftest:*` npm 脚本 | 26 个（扁平命名空间） |

### 1.1 必须先纠正的三条常见误判

本轮审计用证据推翻了三个**看起来很合理但实际不成立**的前提。它们直接改变了实施范围：

| 误判 | 实测证据 | 后果 |
|---|---|---|
| 「仓库层次混杂、循环依赖多」 | 循环依赖 **0**、`lib→tools` 违规 **0**、489 条 require 边全部单向 | **Domain 重构降级**：已有分层是干净的，本轮不是「重建分层」，只是补上两处未完成的迁移 |
| 「每个页面复制完整 HTML shell」 | 成立：**9 份完整 document 组装**（9 处 `<!DOCTYPE>`） | **Workstream B 是本轮最高杠杆项** |
| 「布局族（wide/detail/prose）没有正式声明」 | **已存在**：`page-kinds.js` 的 `LAYOUT_FAMILIES` + `layoutOf()` + `assertLayoutDeclarations()`（正向/反向完整性 + 孤儿族 + 无实例族登记），已由 `seo-selftest.js` 与 verify-site §22c 双重把守 | **不加这条 fitness test**（避免同一 invariant 两处证明，见 §6） |

---

## 2. 硬约束：不得破坏的冻结接口

这些是**外部契约**，不是「实现细节」。破坏它们等于让既有自动化突然失效（§18 禁止）。

### 2.1 CI 侧（由 `check-ci-consistency.js` 以断言冻结）

1. **45 个脚本路径**在门禁 action 的 `run:` 体内逐字出现。断言 (8) 会**先剥注释再比对规范化后的命令体**——`run:` 换成 `echo skipped`、加 `continue-on-error`、加 `if: false` 全都会红。因此这 45 个路径必须始终是**可执行的真实入口**。
2. `verify.yml` 的 **job id 与 name 都必须是 `gate`**，且**永不加 job 级 `if`**（被 if 跳过的 job 报 Success = 没跑却算过）。
3. `on:` 不得加 `paths` / `paths-ignore`（否则必需检查变成**永久 pending**）。
4. `--expect-checks=38` 是项数**唯一出处**；增删断言必须同步该数字并在注释写明理由。
5. `deploy.yml`：`workflow_run` 桥接 + `build.if` + `prepublish`（无 job 级 if）→ `build` → `deploy` 的 needs 关系不得变。
6. 三个调用方（`verify.yml` / `collect.yml` / `deploy.yml`）必须**恰好各调用门禁 action 一次**。

### 2.2 本地侧

- `npm scripts` 名称、CLI 参数（`--out=` / `--dir=` / `--url=` / `--json=` / `--compare=` / `--shots` / `--keep`）、
- `verify-site.js --json` 的报告 shape：`{ target, generatedAt, total, failed, metrics, checks[] }`，
- `--compare` 的 7 条回归判据（覆盖条数不减少 / 卡片数不减少 / 首屏不减少 / 页高 ≤ +15% / 外部请求不增加 / JS 错误 = 0 / 基线文件存在）。

### 2.3 由此导出的 **shim 政策**（防止 §28「假重构」）

> 为保住冻结命令体，**只允许 2 个 thin entry**：`scripts/tools/build-local.js` 与 `scripts/tools/verify-site.js`。
> 各自 ≤ 20 行、只做 `require('../build/orchestrator').run()` / `require('../verify').run()`，文件头注明「此路径是 CI 冻结契约，逻辑在 X」。
> **测试文件一律不迁移、不改名、不建 shim**——分层只做**调度**，不动文件位置（45 个路径里有 40 个是测试/门禁脚本）。
> 任何第 3 个 wrapper / adapter 必须先写成 ADR。

---

## 3. 模块审计（A–P）

每个模块给出：**当前职责 / 不该承担的职责 / 依赖谁 / 被谁依赖 / 状态 / 原因 / 风险 / 目标边界**。

---

### A. Build System

- **当前职责**：`build-local.js`（6,677 行）承担 ① 数据装载与校验调用 ② 派生视图装配 ③ **9 个页面族的完整文档组装** ④ CSS/JSON-LD/feed/sitemap/manifest 生成协调 ⑤ 产物写入与 `.building`/`.stale` 原子替换 ⑥ **2,383 行产物自检**（`selfCheck` L4201–6583） ⑦ CLI 入口。
- **不该承担的职责**：③ 页面文档组装（属 renderer/shell 层）；⑥ 产物自检（属验证层，且与 selftest 有重复证明面，见 §5.4）。
- **依赖谁**：32 个 lib 模块（fan-out 最大）。
- **被谁依赖**：`package.json` 的 `build`、`deploy.yml:115`、gate action `Assemble site` 步骤（后两者是**冻结命令体**）。**没有任何脚本 require 它**（`require` 即跑整条构建链）。
- **状态**：**SPLIT**。
- **原因**：单文件同时是 orchestrator + 9 个 renderer + CSS 作者 + 自检器 + IO 层。**但拆分依据不是行数**，而是三条真实职责边界：① 9 份 document 组装应归 shell/renderer；② `selfCheck` 应归验证层；③ fs 写入应集中为唯一写入面（renderer 纯度）。
- **风险**：模块级可变状态 `DIRECTORY_PAGES` / `PLAN` / `VENDOR_KEY_OF` / `OUT` / `STAGE_OUT` 是隐形时序耦合，拆分时必须改为显式传参或一次性装配上下文；`--out=` 与原子替换语义必须逐字保持。
- **目标边界**：`scripts/build/{orchestrator,load-data,derive-data,write-output,selfcheck}.js` + 9 个 renderer 迁入 `scripts/lib/*-page.js`（**沿用仓库既有模式**，见 D 模块）。**不新建** `build-feeds.js` / `build-sitemap.js` / `build-manifest.js`——生成逻辑已在 `lib/feeds.js` / `lib/data-docs.js`，新建即是同义模块（§19）。

---

### B. Page Rendering / Shared Shell

- **当前职责**：9 个渲染器各自产出**一份完整 HTML 文档**。
- **不该承担的职责**：各自重写 `<!DOCTYPE>` / `<html>` / `<head>` / meta / canonical / 主题前置脚本抽取 / 共享 CSS 抽取 / 共享 header 标记 / 页脚 `finalizePage()` / 收尾标签。
- **依赖谁**：lib 各页面正文模块 + `index.html`（作为共享 CSS / 主题脚本 / 页脚的**模板来源**）。
- **被谁依赖**：`assemble()` 逐族调用（L3362 / 3384 / 3453 / 3478 / 3513 / 3537 / 3615…3847 / 4066 / 4090）。
- **状态**：**SPLIT + SIMPLIFY**。
- **原因（本轮最强证据）**：

  | 渲染器 | 函数行 | `<!DOCTYPE>` | 页面级 `<style>` |
  |---|---|---|---|
  | `writeDetailPages` | 748 | 860 | —（无） |
  | `renderStatusPage` | 961 | 1034 | 1052–1070 |
  | `renderChangesPage` | 1221 | 1333 | 1350–1397 |
  | `renderPlansPage` | 1450 | 1589 | 1607–1637 |
  | `renderApiPlansPage` | 1682 | 1719 | 1740–1800 |
  | `renderPlansHubShell` | 1846 | 1868 | 1883–1923 |
  | `renderModelsShell` | 1966 | 1985 | 2000–2042 |
  | `renderFeedsPage` | 2157 | 2296 | 2312–2323 |
  | `renderDirectoryPage` | 2400 | 2689 | 2707–2729 |

  9 处 `<!DOCTYPE>`、9 处 `indexHtml.match(/<style>/)` 抽取、9 处 `</head>`、9 处 `finalizePage(footerTemplate, route, prefix, ...)`、9 份 `<header class="top">` 标记、9 份 `<div class="wrap"><main id="main">` 脚手架。
- **风险**：9 份文档的**差异是真实的**，不是噪声——shell 必须把这 9 条差异**显式参数化**，否则行为漂移：

  | 差异点 | 现状分布 |
  |---|---|
  | `robots` | 仅详情页与目录页声明（目录页别名 → `noindex, follow`） |
  | `hreflang` ×2 | 仅详情页 |
  | OG / Twitter | 仅详情页（首页另有一套） |
  | `canonical` | 状态页是 `${SITE_URL}status/`，其余是 `pageUrl` 变量 |
  | 订阅标签 | `rootFeedTags` ×6；changes 由 `context.changeFeedTags` 注入；feeds 页只有 own feed；目录页 = own + root 拼接 |
  | 页面脚本 | 仅状态页（`time[data-rel]` 相对时间换算） |
  | `main` class | 取值方法不一（`mainClass` 参数 / 无 class） |

- **目标边界**：新增 `scripts/lib/page-shell.js`，**唯一**产出 document 的模块；导出 `renderPageShell()` 为唯一实现，`renderWidePageShell()` / `renderDetailPageShell()` 只是同一实现上的**预设**（不是三份拷贝）。
  - **关键设计决定**：`feedTagsHtml` / `jsonLdHtml` / `headerHtml` / `crumbHtml` / `extraCss` / `extraScript` 由调用方**预渲染后传入**——shell 只拥有「文档脚手架 + 元素顺序 + 属性落位」，**不重新推导任何业务判断**。这样订阅标签的 6 种取法与 JSON-LD 的每页差异逐字保留，等价性风险最小。
  - 首页**不纳入** shell：`index.html` 本身就是源模板，由 `assemble()` 做 marker 替换（L3338 `finalizePage(html,'','','index.html')`）。这条不对称是**固有的**（首页是模板的家），记为 `DESIGN_ACCEPTED`，不强行统一。

---

### C. CSS / Layout

- **当前职责**：共享 CSS 住在 `index.html` 的**单个 `<style>`（57,692 B）**；每个页面族另有一份页面级 `<style>` 只写自己独有的规则。
- **不该承担的职责**：同一个布局原语在多个页面族里各写一份声明。
- **依赖谁**：无（纯 CSS，只用既有设计变量）。
- **被谁依赖**：9 个渲染器把共享 `<style>` 原样拷进各自文档。
- **状态**：**REFACTOR**。
- **原因（实测）**：8 个页面级 `<style>` 块合计 **18,377 B**；其中 **13 个 class 选择器在 ≥2 个块里被声明**。逐条比对**声明体**后分成三类：

  **① 逐字节相同的规则（可安全上提到共享 `<style>`）——6 个**

  | 选择器 | 声明 | 出现页面 |
  |---|---|---|
  | `.ph2` | `font-size:15px; margin:var(--s4) 0 var(--s2);` | api-plans · plans-hub · models |
  | `.plist` | `margin:0; padding-left:1.15em; color:var(--mut); font-size:var(--fs-sm); line-height:1.8; max-width:none;` | plans · api-plans · plans-hub · models |
  | `.pchglist` | `list-style:none; margin:0; padding:0; display:grid; gap:6px;` | changes · api-plans · plans-hub |
  | `.pchgorigin` | `color:var(--mut);` | changes · api-plans · plans-hub |
  | `.pnone` | `color:var(--mut);` | plans · api-plans |
  | `.punit` | `white-space:nowrap;` | api-plans · models |

  **② 基础 + 页面覆盖（拆成「共享基础」+「页面覆盖」）——2 个**

  | 选择器 | 基础 | 覆盖 |
  |---|---|---|
  | `.ptable` | `width:100%; border-collapse:collapse; …overflow:hidden;`（3 页） | `overflow:visible;`（api-plans · models） |
  | `.ptable-wrap` | `overflow-x:auto;`（3 页） | `border-radius:var(--r);`（api-plans · models） |

  **③ 声明体分歧（禁止无脑合并，必须逐条裁决）——5 个**

  | 选择器 | 分歧 |
  |---|---|
  | `.pchgtype` | changes 用 `--deal-ink/--dealsoft` + 药丸；api-plans/plans-hub 用 `--brand` ⇒ **同名不同组件**，应改名或统一 |
  | `.pchgwhen` | changes 多 `white-space:nowrap` |
  | `.pchgwho` | api-plans 缺 `text-decoration:none` |
  | `.pchgwhat` | `--ink` vs `--ink2` |
  | `.pchnone` | `margin:0` vs `margin:var(--s1) 0 0` |

- **风险**：`.pchgtype` 这类**同名不同语义**是真实设计债；合并会静默改外观，而外观回归**只有真浏览器几何断言能抓**。③ 类必须先裁决语义再动。
- **目标边界**：① 类上提到共享 `<style>`（一处定义、全站生效，与既有 `.detail-main` / `.snote` 同一条纪律）；② 类拆成共享基础 + 页面覆盖；③ 类**逐个裁决**（改名 / 统一 / 明确保留两份并写明理由）。**不做**「把 8 个 style 块合并成 1 个」。

---

### D. Domain Layer

- **当前职责**：真值装载、派生、身份、校验、归一、面向渲染的视图。
- **不该承担的职责**：**已经基本没有**——`lib` 不依赖 `tools` / `build` / `ai`（0 违规），无环。
- **依赖谁**：无上层依赖（被依赖最多的是 `schema.js` 36 · `providers.js` 28 · `audience.js` 25 · `provenance.js` 17 · `render-core.js` 17）。
- **被谁依赖**：`build` / `tools` / selftest。
- **状态**：**KEEP**（默认），**REFACTOR 仅限有证据的两处**。
- **原因**：真值边界纪律已制度化且**已被门禁把守**：`firstSeen ≠ releasedAt`、`collector failure ≠ deal ended`、`catalogStatus` 派生（判据唯一在 `model-freshness.js`）、`coverageStatus` 派生、`page-kinds.js` 是路由→kind/floor/ItemList/sitemap priority 的唯一出处、`RENDER-CORE` 是卡片模板的唯一出处。**没有证据支持大改**。
- **风险**：为「架构图好看」引入 View Model 层会凭空增加 adapter（§19 明令禁止）。
- **目标边界**：只在**证据成立**时抽 `buildDealPageView()` / `buildModelPageView()` / `buildVendorPageView()`，判据两条：**(a)** ≥2 个 renderer 派生同一字段；**(b)** renderer 重算了某个 lib 已派生的字段。本轮审计未发现 (a)(b) 的实例 ⇒ **初始裁决为 DEFER**，在 Phase 4 用「renderer 是否重算派生字段」的定向检查复核；若仍无实例，**不做**，并把这个结论写进报告（这本身是对 §19 的遵守）。

---

### E. Registry / Identity

- **当前职责**：`model-registry.js`（104,077 B）模型身份与显式映射；`providers.js`（85,903 B… 实为 `feeds.js`；providers 25,138 B）厂商归一；`vendor-slugs.json` / `model-registry-links.json` 真值。
- **不该承担的职责**：无。身份判定**只有一处**：页面层不自己算 id、不判「两个名字是不是同一个模型」。
- **状态**：**KEEP**。
- **原因**：真值在 `scripts/data/model-registry-links.json`，派生产物 `model-registry-links.json` 有逐字节可复现门禁（`check-models-reproducible.js`）。`model-registry-links` 只允许显式映射（禁止相似度 / LLM 猜测），且已有独立门禁 `check-model-registry-links.js`。
- **风险**：无新增。**目标边界**：不动。

---

### F. Coverage / Currentness

- **当前职责**：`coverage-targets.js`（46,106 B）+ `coverage-report.js`（118,469 B）；`model-freshness.js`（42,490 B）派生 `catalogStatus` / `catalogReason`。
- **不该承担的职责**：`coverage-report.js` 是**报告器**，不该承担门禁判定（门禁由 `coverage-targets-selftest.js` 承担）。
- **状态**：**KEEP + SIMPLIFY（局部）**。
- **原因**：`catalogStatus` 派生判据唯一，且构建期 / `rebuild-models.js` / `check-models-reproducible.js` 三处必须同支（代码注释记录了真实踩坑：三处调用点必须同步，否则产物落成 `unknown` 且逐字节对账当场红）。这是**已被验证有效的设计**。
- **风险**：报告器 118 KB 与自测 118 KB 体量接近，存在**同一 invariant 两处证明**的嫌疑 ⇒ 列入 §5.4 重复断言清单复核。
- **目标边界**：不重构；只做重复证明面裁剪（若复核成立）。

---

### G. Collectors / Source Health

- **当前职责**：5 个采集器文件 + `health.js`（15,971 B）+ `source-health.json`。
- **不该承担的职责**：无。
- **状态**：**KEEP**。
- **原因**：`collectors/index.js` 是显式注册表（只注册实测有产出的来源），`headless.js` 惰性加载（默认链路不 require playwright-core），fixture 回放（`fixture-test.js`）把解析器行为钉成契约。**离线可复现**已成立。
- **风险**：「采集器失败 ≠ 优惠结束」这条真值纪律已由 `health.js` 与措辞红线把守，重构不得触碰。**目标边界**：不动。

---

### H. History

- **当前职责**：`history-core.js`（32,409 B）内核 + `history.js` / `plan-history.js` / `api-plan-history.js` 三支 + 三份 `*-history.json`。
- **不该承担的职责**：归档层（`archive.js`）是**派生视图**，不落新真值文件——已成立。
- **状态**：**KEEP**。
- **原因**：三支共用 `history-core` 内核，各自只声明差异；有 `history-verify.js` / `check-plan-history.js` / `check-api-plan-history.js` 三条一致性门禁（日志重放 == 当前数据）。
- **风险**：无。**目标边界**：不动。

---

### I. Feeds

- **当前职责**：`feeds.js`（85,903 B）——站点常量（`SITE_URL/SITE_NAME/SITE_DESCRIPTION/xmlEscape`，**唯一出处**）+ Feed 注册表 + 渲染。
- **不该承担的职责**：无。构建期只调用，不重写。
- **状态**：**KEEP**。
- **原因**：25 Feed × 2 格式 = 50 文件；有「构建两次逐字节一致」的独立门禁 `check-feeds-reproducible.js`；订阅发现标签由 `rootFeedTags` / `feedLinkTags` / `feedsForPage` 三个原语统一产出，且 verify-site 按**数据**算每页应声明几条（不写死数字）。
- **风险**：`feeds.js` 同时是「站点常量」的家——任何拆分都必须保住这唯一出处，否则 `SITE_URL` 会出现第二份。**目标边界**：不动。

---

### J. SEO / Sitemap / JSON-LD

- **当前职责**：`seo.js`（27,117 B，构建期规则层）+ `seo-verify.js`（独立门禁，从 dist 解析）+ `page-kinds.js`（声明表）。
- **不该承担的职责**：无。**执行路径刻意不合并**：构建期与独立门禁各自从 dist 解析，共享声明 ≠ 合并执行路径。
- **状态**：**KEEP**。
- **原因**：27 个检查码 × 186 页全过；`page-kinds.js` 已是路由→kind/正文下限/ItemList 要求/sitemap priority 的唯一出处；`LAYOUT_FAMILIES` 的正向/反向完整性已由 `assertLayoutDeclarations()` 把守并被 `seo-selftest.js` 覆盖（含负例）。
- **风险**：无。**目标边界**：不动（本轮**不新增**布局族 fitness test，理由见 §6）。

---

### K. Browser Verification

见 E 模块（同一文件的两半）。

---

### L. Unit / Selftests

- **当前职责**：26 个 `selftest:*` 脚本，各自一个门禁步骤。
- **不该承担的职责**：无层次声明、无统一 runner —— 26 个测试**没有地方说明自己属于哪一层**，也没有「本地一条命令跑完 CI 门禁」的入口。
- **依赖谁**：lib 各领域模块。
- **被谁依赖**：gate action（26 个冻结步骤）+ `package.json`（26 个 npm script）。
- **状态**：**REFACTOR（只做分层登记 + 调度，不迁移文件）**。
- **原因**：本地跑不了门禁是**真实的能力缺口**——`npm run gate` **根本不存在**；门禁只以 GitHub composite action 形式存在，而该 action 是 bash 脚本。于是「本地全绿、推上去才红」（或反过来）是结构性风险。同时无法回答 §29-Q5「一个测试失败属于哪一层」。
- **风险**：新增一份「层→测试」清单会变成**第三份平行登记表**（`package.json` 已有，`check-ci-consistency` 的断言 (17)+(19) 已双向把守）。必须让新表与既有两份**由一条断言绑定**，而不是各写一份。
- **目标边界**：`scripts/test/layers.js`（纯数据：层 → **既有**脚本路径，单一出处）+ `scripts/test/run.js --layer=`；`package.json` **只新增** `gate` / `gate:fast` / `gate:build` / `gate:browser` / `gate:release` / `gate:layers`，**不改**既有 26 个名字。

---

### M. Mutation / Tooth Tests

- **当前职责**：变异牙**分散**在各 selftest 内（定向篡改）+ `verify-site.js` §22b 的 M1–M5（浏览器内变异）。
- **不该承担的职责**：无分类登记。
- **状态**：**KEEP + 分类登记（不扩张）**。
- **原因**：§22b M1–M5 守护的是**真实且已发生过**的回归（`leaf-detail-layout-v1` 的叶子详情页统一内容列，commit `f2dec0c`），且有**反空洞守卫**：变异锚点必须恰好出现 1 次、变异不生效即判红、另有 M4 正对照与零磁盘污染断言。这是高质量变异测试的形态 ⇒ 归 **REGRESSION**，**留在 required CI**。
- **风险**：变异测试数量已在增长（`ai-eval.js` / `coverage-targets-selftest.js` / `data-docs-selftest.js` / `plan-schema.js` / `verify-site.js` 均含变异）。**目标边界**：**不新增**变异；对既有变异做 CORE/REGRESSION/ADVERSARIAL/THEORETICAL 分类登记，并写清「什么时候不该加」（进 `docs/TESTING.md`）。**不做** nightly 拆分——本轮未发现确属 ADVERSARIAL 且昂贵的条目。

---

### N. CI / Gate

- **当前职责**：48 步单 composite action，三个调用方共用；`check-ci-consistency.js`（38 断言）守口径漂移。
- **不该承担的职责**：**职责其实已经清晰**（一处实现、三个调用方，避免两套相似链条）。真正缺的是：① 本地等价入口（不存在）；② 大体积可再生产物的归档去向（Tier-2 无出口）。
- **状态**：**REFACTOR（保守）**。
- **原因**：48 步单 action 的设计是**有意的**（注释写明三条理由：检查名不能变、「期望项数唯一出处」钉在调用方一行、新增 workflow 会牵动一串冻结断言）。拆 job 会破坏必需检查名与「一处实现」不变量 ⇒ **不做**。
- **风险**：新增 gate 步骤 = 改 `GATE_STEP_NAMES` + `GATE_STEP_RUN` + `FROZEN_ASSERTION_NAMES` + 提 `--expect-checks`。必须按仓库既有纪律留痕。
- **目标边界**：① action 末尾新增 `upload-artifact`（Tier-2：浏览器 trace / `--json` 报告 / gate 日志）；② 本地 `npm run gate:*` 与 CI **读同一份 action.yml**（唯一出处，不另立步骤清单）。

---

### O. Research / Evidence

- **当前职责**：本轮与历轮的取证现场。
- **不该承担的职责**：**Tier-3 过程产物不该进 Git**。
- **状态**：**SIMPLIFY（未来规则）+ DELETE（未来拦截）**。
- **原因（实测）**：`research/` 已跟踪 **1,161 文件 / 32.9 MB**，其中 `_raw` **1,012 文件**；按扩展名 `.txt` 510 个 / 19.4 MB、`.json` 270 个 / 9.0 MB、`.md` 128 个 / 2.6 MB、**`.cjs` 217 个**（一次性探针脚本）。磁盘上 `research/_raw` 已达 1,405 文件 / 104.4 MB。现行 `.gitignore` 用**逐目录白名单**（v3.0-sources/html、coverage-depth-v1/release-evidence/raw、`**/shots/`），属打地鼠模式——每轮新任务都要人工补一条。
- **风险**：删改历史是禁区（**不重写 Git 历史**）；对已跟踪的 1,012 个文件**不动**，只登记 grandfather。
- **目标边界**：三层 Evidence Policy（Tier 1 Git / Tier 2 CI Artifact / Tier 3 Local）+ **类别规则** `.gitignore`（替代逐目录白名单）+ `npm run check:evidence` 对**已跟踪文件**做 Tier-3 模式拦截（不依赖开发者「记得别 add」）。

---

### P. Documentation

- **当前职责**：`README.md`（1,171 行）、`PROJECT_STATUS.md`、`NEXT-STEPS.md`、`SUMMARY.md`、`docs/DESIGN-RULES.md`（317 行）、14 份 `docs/SCHEMA-*.md`、`docs/v3.0/*`（7 份，含 `AGENT-REFERENCE.md` 的架构层表 §2.1）。
- **不该承担的职责**：`README.md` 同时承担快速开始、数据契约、目录结构、采集策略、预渲染/SEO 细节、AI 维护层、部署——**没有一个新 Agent 该先读的架构入口**。
- **状态**：**ADD 4 份 + DELETE（同义面）**。
- **原因**：`docs/ARCHITECTURE.md` / `TESTING.md` / `BUILD.md` / `EVIDENCE-POLICY.md` **全部缺失**。同时 `docs/v3.0/AGENT-REFERENCE.md §2.1` 已有一份**部分标注过期**的架构层表 —— 新文档必须**取代**它，不能并列（否则立刻产生两份同义架构文档）。
- **风险**：仓库已有「不要重复造同义文档」的纪律传统；4 份新文档必须各自回答**明确的、互不重叠的问题集**。
- **目标边界**：见 §8。`AGENT-REFERENCE.md` 头部加一行指向新权威文档，标注本文为 v3.0 历史快照。

---

## 4. 依赖方向：现状与目标

### 4.1 现状（实测，已是 DAG）

```
index.html（源模板：共享 CSS + 主题脚本 + 页脚片段 + RENDER-CORE + PRERENDER 标记）
        │  （构建期被读取）
        ▼
scripts/tools/build-local.js ── 9 个内联 renderer（完整 document 组装）
        │  require 32 个 lib 模块
        ▼
scripts/lib/*（domain / derived / render-core / *-page）   ← 0 环，不反向依赖 tools
```

**已经是单向的**。缺的是：renderer 与 shell 没有分离、写入面没有收口、验证面没有分层。

### 4.2 目标

```
source data (deals/plans/api-plans/models/registry/history/curated_*)
   ↓
domain        scripts/lib/{schema,plan-schema,api-plan-schema,model-registry,providers,
                            coverage-targets,model-freshness,history-core,plan-history,api-plan-history}
   ↓
derived/view  scripts/lib/{feeds,seo,changes,archive,data-docs,landing,health,…}
   ↓
page body     scripts/lib/*-page.js   ← 9 个 renderer 从 build-local 迁入（沿用既有模式）
   ↓
page shell    scripts/lib/page-shell.js   ← 唯一 document 出口
   ↓
orchestrator  scripts/build/orchestrator.js
   ↓
writer        scripts/build/write-output.js   ← 构建期唯一 fs 写入面

scripts/tools/build-local.js  →  ≤20 行 shim（CI 冻结路径）
scripts/tools/verify-site.js  →  ≤20 行 shim（CI 冻结路径）
scripts/verify/*              ← 验证器实现
scripts/test/{layers.js,run.js} ← 分层调度（不改测试文件位置）
```

测试方向：`L1 unit → L2 domain integration → L3 build integration → L4 browser → L5 release smoke → L6 mutation/tooth`。

**禁止（目标期以 fitness test 断言）**：domain 依赖 build/tools；renderer 写生产数据 / 读盘 / 联网 / 看当前时间；HTML 模板重做业务判断；selftest 依赖生产 side effect。

---

## 5. 重复面清单（本轮要削掉的重复）

### 5.1 重复 HTML shell —— **9 份**（最高杠杆）

9 处完整 `<!DOCTYPE … </html>`，外加 9 份 `<header class="top">` 标记与 9 份 `finalizePage(footerTemplate, …)`。
→ Workstream B 收敛为**一份** `page-shell.js`。

### 5.2 重复 CSS 原语 —— **13 个选择器 / 8 个 style 块 / 18,377 B**

分类见 C 模块（6 个可上提、2 个拆基础+覆盖、5 个需裁决）。

### 5.3 重复数据转换

`catalogStatus` 派生在构建期 / `rebuild-models.js` / `check-models-reproducible.js` 三处**有意共用同一支**（代码注释记录了「少传一次 `catalog` 就落成 unknown」的真实踩坑）——这是**正确的单一判据**，不是重复实现。审计结论：**保留**。

### 5.4 重复断言（需裁剪）

- `selfCheck()`（2,383 行）与各 selftest 存在**同 invariant 两处证明**的嫌疑面：产物级对账（构建期）vs 规则级自测（离线）。仓库自己的判据是「它红的时候有没有别的步骤会替它红」。
- `coverage-report.js`（118,469 B）与 `coverage-targets-selftest.js`（118,146 B）体量近似，需复核是否重复证明。
- **原则**：靠近真值源的一条 + 必要的一条 e2e，即可（§9）。Phase 5 复核后裁剪，**不新增**重复证明。

### 5.5 重复注册表（新增时的红线）

`package.json` 的 `selftest:*`（26）+ `check-ci-consistency` 的双向登记（断言 (17)(19)）+ 门禁 action 的 26 个步骤 —— **已经是三处**。新增分层表必须是**第四处信息的补充（层归属）**，并由**一条**断言与既有两处绑定，绝不平行重写。

---

## 6. 架构 Fitness Tests：只加 5 条（原计划 7 条，删 2 条）

| # | 断言 | 现状 | 处置 |
|---|---|---|---|
| 1 | `scripts/lib/**` 不得 require `scripts/build/**` 或 `scripts/tools/**` | 已 0 违规 | 转为**强制**（防退化） |
| 2 | renderer 纯度：`lib/*-page.js` + `page-shell.js` 内不得出现 `fs` / `http` / `playwright` / `Date.now` / `new Date()` | 现状未约束 | **新增** |
| 3 | 唯一 document 出口：全仓只有 `page-shell.js` 可产出 `<!DOCTYPE` | 现状 9 处 | **新增**（迁移期白名单收紧到 0） |
| 4 | 产物注册表闭包：构建写出的每个文件都在 `PUBLIC_FILES` / `GENERATED_FILES` / `dataDocs` 注册表内 | 已成立 | 转为**强制** |
| 5 | 测试登记三方一致：`layers.js` == `package.json` 的 `selftest:*` == 门禁实际跑到的集合 | 现为两方 | **新增一条**（单一 owner，不新增平行清单） |
| ~~6~~ | ~~无循环依赖~~ | **已 0** | **删除**：`check-ci-consistency` 之外没有别的步骤会替它红，但当前恒真 ⇒ 价值低；改为在 §1 基线里定期复核，不进门禁 |
| ~~7~~ | ~~layout family declaration 完整~~ | **已存在且已双门禁把守**（`assertLayoutDeclarations()` + `seo-selftest` + verify §22c） | **删除**：加了就是同一 invariant 的第三处证明 |

---

## 7. Dead Code 裁决（删除前必须证明六条）

**六条检查**：无 `require` / 无 package script / 无 workflow / 无 registry discovery / 无 dynamic load / **无 docs promise**。

### 7.1 已实测 0 引用（含 docs）—— 可删

| 文件 | 字节 | 裁决 |
|---|---|---|
| `scripts/tools/history-nonempty-e2e.js` | 62,868 | **DELETE**（Phase 4 前复核：若无 e2e 覆盖缺口） |
| `scripts/tools/audience-backfill.js` | 34,638 | **DELETE** |
| `scripts/tools/audience-restore-history.js` | 4,115 | **DELETE** |
| `scripts/tools/rows-by-link.js` | 1,319 | **DELETE** |

合计约 **103 KB** 代码 + 若干仍被 docs 承诺提及的条目，均为**没有任何东西会跑它**的死代码。

### 7.2 被 docs 承诺但未接线 —— 二选一，不留中间态

| 文件 | docs 引用 | 裁决 |
|---|---|---|
| `scripts/data/backfill-cards.js` | README ×2 + PROJECT_STATUS | 接线或删承诺 |
| `scripts/tools/inspect-source.js` | README + PROJECT_STATUS ×2 | 接线或删承诺 |
| `scripts/tools/probe-offers.js` | PROJECT_STATUS ×4 | 接线或删承诺 |
| `scripts/tools/restore-from-git.js` | PROJECT_STATUS ×2 + SUMMARY | 接线或删承诺 |
| `scripts/lib/curated.js` | README + PROJECT_STATUS | 接线或删承诺 |
| `scripts/tools/study-site.js` | PROJECT_STATUS ×11 | 接线或删承诺 |

### 7.3 明确**不是**死代码（曾被启发式误判）

`scripts/ai/providers/{openai-compat,mock,fail}.js`（被 `provider.js` 以 `require('./providers/x')` 正常引用）、`scripts/collectors/{cn_docs,global_directories}.js`（被 `collectors/index.js` 引用）、`scripts/ai/{cache,diagnose,patch,schemas,translate,provider}.js`（被 `maintenance.js` 等引用）。
> 教训记在案：**「basename 没出现过」不等于死代码**——require 常省略 `.js`。删除前必须按 §17 的六条验证，不能只 grep 一个函数名。

---

## 8. 目标架构与文档集

### 8.1 四份新文档的分工（互不重叠，且各自取代既有同义面）

| 文档 | 只回答 |
|---|---|
| `docs/ARCHITECTURE.md` | 真值在哪 / 派生值在哪 / 页面怎么生成 / Feed / History / Coverage 怎么生成 / 模块允许怎样依赖。**取代** `docs/v3.0/AGENT-REFERENCE.md §2.1` |
| `docs/TESTING.md` | 每层测什么 / 什么时候跑 / 哪些 required / 哪些 adversarial / **什么时候不该加 Mutation** |
| `docs/BUILD.md` | local build / clean build / verify / full gate / release（含 `npm run gate:*` 与 `DSH_EDGE`） |
| `docs/EVIDENCE-POLICY.md` | 什么进 Git / 什么进 CI Artifact / 什么只留 local |

### 8.2 Evidence 三层

- **Tier 1（Git 永久）**：最终报告、结论性摘要、关键失败证据、可复跑脚本。
- **Tier 2（CI Artifact）**：大 JSON、浏览器 trace、截图、完整日志、变异输出 → `upload-artifact`。
- **Tier 3（本地 scratch）**：临时构建、中间探针、变异副本、生成的基线 → **类别规则 gitignore + 已跟踪文件拦截**。

---

## 9. 风险登记

| # | 风险 | 缓解 |
|---|---|---|
| R1 | 45 个冻结脚本路径 + 冻结 `run:` 体：任何改名/改命令即红 | 只允许 2 个 shim；测试文件不迁移 |
| R2 | `build-local.js` 模块级可变状态（`DIRECTORY_PAGES` / `PLAN` / `VENDOR_KEY_OF` / `OUT` / `STAGE_OUT`） | 拆分为显式传参与一次性装配上下文 |
| R3 | 9 份文档的**真实差异**（robots / hreflang / OG / canonical / 6 种 feed 取法 / 页面脚本 / main class） | shell 把差异**显式参数化**，`feedTagsHtml` / `jsonLdHtml` / `headerHtml` 预渲染后传入 |
| R4 | CSS ③ 类同名不同语义（`.pchgtype`） | 逐条裁决，禁止无脑合并；外观回归只有浏览器几何断言能抓 |
| R5 | 新增 gate 步骤牵动 3 张冻结表 + `--expect-checks` | 有意变更 + 注释留痕（沿用仓库既有纪律） |
| R6 | 分层表成为第四份平行注册表 | 一条断言绑定三方；层归属是**新信息**，不是重写 |
| R7 | 主检出在 OneDrive 同步区 + 6 个 worktree | 全程在独立 worktree；构建走既有 `.building`/`.stale` 原子替换 |
| R8 | 本轮范围极大 | 每阶段独立提交 + 阶段门禁；无法收敛项按 §30 判 PASS WITH DEFERRED |

---

## 10. Audit → Plan 差量说明（临时判定表被证据推翻之处）

| 计划中的临时判定 | 审计结论 | 影响 |
|---|---|---|
| Phase 10 fitness #4「layout family declaration 完整」 | **删除** | 已由 `page-kinds.js` + `seo-selftest` + verify §22c 三处把守，再加即重复证明 |
| Phase 10 fitness #6「无意外循环依赖」 | **删除** | 实测恒为 0，价值低 |
| Workstream C「`.snote` ×8 / `.ph2` ×9 / `.plist` ×4 重复」 | **修正** | PR #46 已删除 8 份 `.snote` 宽度副本；真实重复面是 **13 个选择器 / 9 组**，且其中 5 组语义分歧 |
| Workstream D「Domain 边界重构」 | **DEFER → 可能不做** | 实测 0 环、0 违规；无 (a)(b) 证据即不做 |
| Workstream F「CI 拆分为 gate:fast/build/browser/release」 | **收窄** | 不拆 job、不动冻结体；只加 Tier-2 artifact 出口 + 本地 `gate:*` |
| Workstream E「verify-site 拆成 10 个模块」 | **确认可行** | 拆分照抄已有 26 个编号段的既有缝；`--json` shape 与 `--compare` 判据不变 |
| 计划 §1 的 `build-local.js` 405,605 B / `verify-site.js` 390,729 B | **修正** | 真值是 **407,799 B / 6,677 行** 与 **522,527 B / 8,057 行 / 484 `check()` / 852 运行时项**（PR #46 新增 §22c 全站几何门禁） |
| 计划 §1 的 gate action 322 行 | **修正** | 真值 **553 行 / 48 步骤 / 45 个冻结脚本路径** |
| 「`npm run gate` 要保留兼容」 | **修正** | `gate` **不存在**；本轮是**新增**能力，不是保留 |
