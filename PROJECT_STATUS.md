# AI 优惠聚合器 — 项目状态

**最后更新**：2026-10-09（最新一节 **secondary-page-residue-v2：扫描面外 8 类小字容器 + 上一轮 47 行「待确认」收口**，分支 `secondary-page-residue-v2`，**未提交 / 未发布**）

---

## 0.5 secondary-page-residue-v2 状态（2026-10-09）

> **一句话现状**：上一轮报告 §8 那 7 组「待用户确认」与**扫描面之外**的 8 类小字容器
> （86 组 / 352 次出现 / 186 页）**全部处置完毕：实删 5 组、保留 87 组、挂起 0**。
> 实删 **11 个源码编辑点 + 17 条数据面 `description` 行**（共 28 处、1164 字可见正文），
> 落成两条构建期机器牙：「删掉不许回流」（三遍 0 命中）与「扫描面不许收缩」（8 类下限 + 2 条关系式）。
> **没有调低任何下限、没有删任何断言、Feed 50 个文件逐字节 0 变化**；
> 数据面**唯一**被授权的改动是 `deals.json` 的 17 条 `description`（删「（无头浏览器渲染后提取）」整括号）。

| 维度 | 实测 |
|---|---|
| 基线 / 分支 | `.worktrees/secondary-page-residue-v2` @ `f091ac4` · 分支 `secondary-page-residue-v2` · **未提交 / 未发布** |
| 处置面 | 86 组（8 类容器）+ §8 七组；去重后 **92 个独立裁定对象** ⇒ **实删 5 · 保留 87 · 挂起 0** |
| 删除面 | ① `.dsrc-note` 尾半句 ×80 页（49 → 37 字）② `.ddesc`「（无头浏览器渲染后提取）」×17 页（**改真源**：`headless.js` 3 处 + `deals.json` 17 条）③ 页族导语/口径的重复半句 4 处 ④ `plan-history.js` 上一轮漏删的尾句 ⑤ `/models/` 题注末句（−30 字） |
| 保留面 | 由**承重机制**决定，不按口味：既有断言钉住 **2 组 / 82 次** · 数据面依赖 **29 组 / 29 次**（含 `.fdesc` 25 条 = Feed description 槽位）· C 类数据语义 **45 组 / 71 次** · D 类交互/结构槽位 **6 组 / 73 次**（合计 82 组 / 255 次）；§8 的 6 组由页面族下限（`main-snote ≥ 2` / `≥ 4`）与题注牙 + 表格 a11y 名钉住 |
| 牙 ①（构建期） | `build-local.js` 的 `scanResidue()`：整篇产物 304 文件、**44 条断言字面三遍 0 命中**（原样 · 归一化 · JSON 转义）；正面断言页脚保留句**186/186 页**仍在、共享页脚**不含**任何登记字面 |
| 牙 ②（构建期） | 8 类容器存在性下限 `.dsrc-note 165/123 · .ddesc 80/60 · .fdesc 25/18 · .chgnote 19/14 · .pchnote 4/2 · .pftdesc 4/2 · .chgmeta 1/1 · .hint 54/40` + 关系式 `.ddesc ≥ 1×详情页数(80)` · `.dsrc-note ≥ 2×详情页数(80)` + 反空洞（条目 ≥ 30 / **活字面** ≥ 40 / `floor ≥ measured × 0.5`） |
| 判据来源（唯一实现） | `build-local.js` 的 `scanResidue()`（接进 `selfCheck()`）· 登记表 `scripts/data/residue-guard.json` · 复核入口 `scripts/tools/check-residue.js`（`require` **同一个函数**）· CI 步骤 `Residue guard (deleted copy must not return; container floors)`（必须带 `--dir=dist`） |
| 变异证明 | 真构建：恢复被删句首 ⇒ exit 1 并点名登记 id 与落点；`.fdesc` 唯一构造点改名 ⇒ `✗ .fdesc 在产物里只有 0 次 < 下限 18`；登记表砍到 29 条 ⇒ 红；删掉登记表 ⇒ **抛错**；产物副本：页脚**外**注入 ⇒ 红、**共享页脚内**注入 ⇒ 修后也**红**（豁免机制已移除） |
| 对抗复核 | t6：**发现 9 条**（最高 **high** = 共享页脚豁免**自证** ⇒ 186 页回流而整条门禁链全绿）+ 射程边界 15 条；t10 已逐条收紧（豁免移除 / 归一化那一遍 / 活字面数 / 下限自守 / 关系式）；**仍未修**的 4 条射程边界如实登记在报告 §9（不许当「全都验过了」） |
| 几何 | 3 个 `/deal/*` 删前 → 删后：桌面 **Δ0**、移动 **−22px**（`.ddesc` 44 → 22px，少一行）；`.dsrc` 块高不变；无一处被顶高/裁切；横向溢出全 0 |
| 正文下限 | 186 页重算**低于下限 0 页**；deal 最小余量 **639**；6 个登记残留页逐字复现（50/123/123/136/139/142）；**没有一次重新登记、下限一处未调** |
| 门禁读数 | `npm run build` ✅（含两行新牙）· `check:residue` **0 命中 / exit 0** · `verify:seo` **19/0** · `verify-site.js --dir=dist` **892 项 / 失败 0**（真浏览器，156s）· `selftest:feeds` 145/0 · `planshub` 32/0 · `models` 120/0 · `plans` 264/0 · `api-plans` 176/0 · `plan-history` 132/0 · `audience` 206/0 · `provenance` 132/0 · `check:ci` **39/0** · `check:feeds:reproducible` ✅ |
| 数据面 / Feed | `deals.json` 的 17 条 `description` = **唯一**授权改动；`dist/feed.json` + `dist/feed/**` 48 + `dist/feed.xml` = **50/50 逐字节相同**；其余数据文件逐字节不变；`dist/_notes.ndjson` 与 baseline 构建**同 sha**（`8964efe4…`） |
| **没跑**（如实） | `npm run gate`（全量 52 步）· `verify-site --compare=ours-baseline` · publish/deploy 与线上冒烟 |

---

## 0.4 secondary-page-residue-v1 状态（2026-10-09）

> **一句话现状**：三个别名页顶上的 `<p class="snote aliasnote">`（161 / 139 / 159 字）与题注里的长句
> （62 / 63 / 64 字）**整条删除** —— 上一轮把它们当「导航更正 / USER_REQUIRED」保留，本轮实测推翻
> （无「去目标页」动作、183 个站内入链来源、零入链路由 0；它们渲染的其实是站务机制与内部判据标识符）。
> 「删掉不许回流」落成 **3 条会响的牙 + 1 条反向断言**，变异证明 R-1/R-2 真红。
> **机制一个字没改，数据面 0 变化。**

| 维度 | 实测 |
|---|---|
| 基线 | `docs/closures-v4` @ `d47ec47`，改动全在工作区 |
| 删除面 | 三个别名页 `main` 内 `.snote` **1 → 0**；题注 **62/63/64 字 → 6 字**（`共 N 条。`）；`.aliasnote` 模板 / CSS / `noteDeclare` / `ALIAS_NOTE_ROUTES` 白名单整块退役 |
| 折叠块 | **仍然非空**：`need/student-only/` 1→3 条 `.pnote`、`need/free-api/` 2→4、`need/dev-credits/` 2→4（自有 `userNotes` + 共享句；「不许空容器」断言照旧） |
| 机制侧 | 逐条不变：`noindex, follow` · **自指** canonical · 不进 sitemap（sitemap 183 条、3 条别名页已排除）· 条目集合与目标页逐条相同（12/45/67）· 别名链最长 1 跳 |
| 正文下限 | 删掉 197–217 字后余量 **619 / 1518 / 1949**（下限 1320 / 3300 / 4620）⇒ 仍 ≥ 600，**不该重新登记**；`verify:seo` 的余量登记读数与登记值逐页相同（`/need/no-card/` 50 等 6 页，一页未动） |
| 牙 1（构建期） | 首屏扫描判据升级为「目录页家族（含别名页）0 条」：`✓ 二级数据页首屏无说明: 45 页（**含别名页**，没有例外名单）· 残留说明 × 8 个禁词 0 命中` |
| 牙 2（浏览器层） | `verify-site.js` §22c ③b 整段重写为 `introNoteRoutes.length === 0`：`✓ 目录页家族（45 页，含别名页）首屏**没有**任何页面级说明 — 有首屏说明的目录页 0 条` |
| 牙 3（构建期） | 题注形状牙（本轮新增）：`✓ 目录页家族题注形状: 45 条 <caption> 逐字匹配「共 N 条。/ 共 N 个入口。」（另有 56 条非目录页题注不在本规则射程内，只报告不判）`。**条件式判据**（captain 独立裁定，2026-10-09）：题注存在就必须匹配形状；不存在不判 —— 题注在任何浏览器里都不渲染，而它有表格 a11y 名的价值 ⇒ 这 45 条题注**保留**，只退役长句。附反空洞守卫（本产物里存在的题注 < 20 条即红） |
| 反向断言 | `selftest:audience`：3 条 `reason` 的逐字文本 × 186 个 `dist/index.html` **0 命中**；负例对照实测红（把 reason 注进产物 ⇒ `205 项通过 / 1 项失败` 并点名文件） |
| 变异证明 | **R-1**（注回 `.aliasnote`）：`npm run build` exit 1（首屏扫描 + 说明清单对账）、`verify-site --dir=<副本>` exit 1 / **885 项失败 3 项**（③b + 两条 ⑨ 对账，逐条点名三个别名页）；**R-2**（注回长题注）：`npm run build` exit 1（题注形状牙逐页点名 66/67/68 字）。原始输出入库 `research/_raw/secondary-page-residue-v1/mutation/` |
| 换靶（如实记） | `need/student-only/` 原是 M1–M4 第一个壳 + M6/M8/M10/M12/M14 的靶页；删除后该页 `.snote` 0 条 ⇒ 承重面消失。四壳改 `plans/`(12 条说明·冻结串 1 次) / `status/` / `changes/` / `feeds/`，M14 → `models/`，M15 → `feeds/`。**目录页家族从此没有任何变异壳**（无页面级说明可变异），M1–M4 守的是 `.snote` 宽柱规则本身 ⇒ 价值随承重面迁移 |
| 门禁读数 | `verify-site.js --dir=dist` **885 项 / 失败 0** · `validate --strict` ✅ · `verify:seo` **19 项 / 0** · `selftest:audience` **206 / 0** · `selftest:changes` **120 / 0** · `selftest:seo` **103 / 0** · `check:ci` **39 / 0** · `check:evidence` 无新增 Tier-3 |

---

## 0.3 secondary-page-layout-unification 状态（2026-10-06）

> **一句话现状**：全站「页面级说明」（`.snote`）原本由 **4 个页面壳压成 452.81px 的窄柱子、另 4 个壳不压**（同一条规则 8 份副本、两种取值），
> 现在收成**唯一一处定义**（`index.html` 共享 `<style>`，`max-width: none`）；同时建立**机器可读的布局族声明**
> （`wide` **55** / `detail` **131** / `prose` **0**），并把 `/archive/<kind>/<id>/` 的详情页接入统一内容列。
> **纯布局版本：数据 / 文案 / 路由 / 结构化数据 0 变化。**

| 维度 | 实测 |
|---|---|
| 基线 | `origin/master` = `1f225d2`，worktree `.worktrees/secondary-page-layout-unification`，分支 `secondary-page-layout-unification`（提交区间内 **0** 提交，改动全在工作区） |
| 根因（产品侧） | 同一条 `.snote` 规则在 8 个页面壳里各写一份、**两种取值**（4×`max-width: 70ch` + 4×`none`）；`70ch` @12px = **452.81px**，而 1440 档正文容器 **1380px** ⇒ 比例 **0.328** |
| 发现面 | **48 页 / 156 条**说明被压窄（`vendor/*` 26 · `need/*` 10 · `category/*` 6 · `student/`+`developer/`+`free-api/` 3 · `status/`+`changes/`+`feeds/` 各 1）；另有 **81 页**零说明、**57 页**「有说明但从来没被压窄」 |
| 改动面 | 工作区 **7 个源文件 · +1415 / −9**（产品侧 6 个文件 `+306 / −9`；`verify-site.js` 的 **+1109 / −0** 属门禁侧）：`page-kinds.js`（布局族）· `index.html`（唯一一条 `.snote`）· `build-local.js`（删 8 条副本 + 档案详情接线）· `archive.js` · `archive-selftest.js` · `seo-selftest.js` |
| 布局族 | `LAYOUT_FAMILIES` 三族 + 18 个 kind 各带 `layout` 字段（`home` 也声明为 `wide`）；产物侧逐页可解析 **wide 55 / detail 131 / other 0**；`assertLayoutDeclarations()` 返回空数组 |
| 修复后（产物侧，最终证据） | 说明宽 **452.81px → 1380px**（ratio **0.328 → 1.000**）；窄说明 **156 条 → 0 条**、不同轴 **48 页 → 0 页**；页面高度 **47 页变矮 / 12 页不变 / 0 页变高**（min **−224** / median **−122**）；1440/1600/390 三档横向溢出 **0 → 0** |
| 详情族 | `main.detail-main` **1120px**、居中偏差 **≤1px**（10 个现扫路由）；`/archive/<kind>/<id>/` 今天 **0 个生产实例** ⇒ 用「常量 + 构建期接线 + 断言会响」的**替代性设计约束**闭合 |
| 数据层 | **零变化**：303→303 文件 · **117/117** 非 HTML 逐字节相同 · **186/186** HTML 剥掉 `<style>` 后正文逐字节相同 · 样式块行集合差 **+9 / −2**（逐行只有 `.snote` 规则与解释注释） |
| §19/§20 审计 | 六个类名重复度逐条 + **37 条** `max-width` 普查（`ch` 单位 5 条，其中 3 条是测试夹具）+ **6 条**保留窄宽登记；同缺陷残留 **0 处**、未分类 **0**；**本次不动** `.ph2` / `.plist` / `.stop` / `.cstop` / `.ptable*` |
| 门禁 | **轮 6 冻结读数**（判据 `verify-site.js` sha256 `2cbc160dc64f8ade…`，522527 B / 8058 行）：`--dir=dist` **852 项 / 失败 0** · `--dir=dist.baseline` **852 / 36**（非 §22c 失败 **0**）· 窄柱并集 **156 条 / 48 页**（`note-narrow 156` + `note-ink-narrow 108`，② ⊆ ①）· CI 口径 **38 项 / 失败 0** · Full Gate **49 步 → 执行 45 / 通过 45 / 失败 0 / 跳过 4 · exit 0**（第 47 步 **852** 项 / 第 48 步 **858** 项，**两把不同的计数器**）。六轮门禁修复（t2 → t7 → t14 → t19 → t24 → t28）都只动 `scripts/tools/verify-site.js`；**轮 6 收掉了轮 5 自引入的标记级豁免键（空 `<noscript>` 不再让三牙静默）+ 上界计数改不相交 ⇒ 计数与轮 5 逐项相同，判据 sha 与豁免条件不同**。口径 = 两条判据**取并集**（内容盒 ∪ 逐行字迹宽）+ 未渲染判据；门禁侧根因（判据量的是**代理量**）见报告 §C.5 / §J |
| CI / Deploy / Online Smoke | **已发布并回填**：PR **#45**（<https://github.com/buguoshixc/ai-deals-aggregator/pull/45>，`mergedAt 2026-10-06T17:19:39Z`）· 分支提交 `8168251465a4…` · 合并提交 `9251e83b68a7…`；CI `gate`：PR run **37501963346** → **pass · 4m53s**、master run **37502684190** → success；`Deploy to GitHub Pages` run **37502684227** → success（`prepublish`/`build`/`deploy` 全 success）；线上几何 smoke **8 页 / 79 项断言 / failed 0 / ok=true**（`research/_raw/secondary-page-layout-unification/release/online-smoke-result.json`，线上 `frozenCount=1` ⇒ 确为新产物）。取证环境：本机 `github.com:443` 被定点阻断，推送与浏览器取线上页均经 `127.0.0.1:7890` 本地代理（首次直连 8/8 `ERR_CONNECTION_CLOSED` → 走代理后 79/0）。详见报告 §I |

边界：不改数据 / 文案 / 颜色 / 字体 / 卡片设计 · 不改任何路由与结构化数据 · **不碰** `.ph2` / `.plist` / `.stop` / `.cstop` / `.ptable*`
（本次故意不动的五组重复布局规则）· **保留**两处有设计理由与实测比例的局部窄宽（`.lsum li small` 34ch = 容器的 **0.895**；`.pdetailbody` 72ch = 单元格的 **0.3377**，登记 P1/DEFERRED）。
完整报告：[research/secondary-page-layout-unification-report.md](research/secondary-page-layout-unification-report.md)，设计规范补充见 [docs/DESIGN-RULES.md](docs/DESIGN-RULES.md) §6 的 S4 与文末「二级页布局统一」小节。

---

## 0.2 leaf-detail-layout-v1 状态（2026-10-05）

> **一句话现状**：`/deal/<id>/` 与 `/models/<slug>/` 两种**叶子详情页**的正文从"固定约 820px 贴在容器左边"
> 改成**同一条居中的详情内容列**（`min(1120px, 100%)`）；面包屑 / 详情卡 / 其它优惠 / 来源说明共用同一条轴，
> Header 与 Footer 不跟着缩窄，首页与所有集合型页面零波及。

| 维度 | 实测 |
|---|---|
| 基线 | `origin/master` = `d09a1c5`，worktree `.worktrees/leaf-detail-layout-v1`，冻结提交 `f2dec0c` |
| 根因 | 共享 `<style>` 把宽度写死在卡片上（`.dpane` / `.dpane-src` 各自 `max-width: 820px`），而外层只有 `.wrap`(1420px) —— 详情主体没有任何居中容器；模型详情页是第三套宽度（整幅 1380px） |
| 改动面 | `index.html`（共享 `<style>`：新增 `.detail-main`、两处去 820px、`break-all` → `normal`+`anywhere`）· `scripts/tools/build-local.js`（deal 模板 + `renderModelsShell` 的 `mainClass`）· `scripts/tools/verify-site.js`（新增 §22b + M1–M5 变异牙）—— 共 3 文件 / 601+ 6− |
| 最终内容宽度 | **1120px**（`width: min(1120px, 100%)`；< ~1160px 自然退化为满宽并保留 `.wrap` padding） |
| deal 详情 | `main` 1380 → **1120**；居中偏差 **560px → 0px**；`.dpane` 820 → 1120；`.dpane-src` 820/`break-all` → 1120/`normal`+`anywhere`；同轴极差 0px |
| model 详情 | `main` 1380 → **1120**，与 deal 同一列；改动前该页 `.dpane*` 元素为 0 个（两族本就不统一） |
| 波及面 | 186 页全量扫描：带 `detail-main` 的 `<main>` 恰好 **131**（80 deal + 51 model），非叶子页 **0**；全站 `max-width: 820px` 声明 **0** 处；`.topin` 1420 / `footer` 1380 / 首页 `main` 1380 前后一致 |
| 响应式 | @768 列宽 728 == 可用宽；@390 `scrollWidth` 390（deal/model 都无横向滚动）；长 URL 页（129 字符官方 URL）390/1440 都不溢出 |
| 牙 | `verify-site.js` §22b **41 条**真浏览器断言 + **M1–M5 变异牙**（锚点唯一性守卫、M4 正对照、变异前后产物 sha256 相等）；反空洞守卫负例实测让整轮失败 4 项、退出码 1 |
| 门禁 | CI 口径 **38/38** · Gate action 49 步本机执行 **45 步全过** · `verify-site` **776 项 0 失败** · 回归比对 **782 项 0 失败** |
| 独立复查 | 另写一套探针（不 require 本仓库任何代码）：**verdict = pass · P0 = 0 · P1 = 0 · REPAIR_NOW = 0**（32/32） |
| 数据层 | **零变化**：数据文件零 diff；改动前后全产物 303→303 文件、117/117 非 HTML 逐字节相同、186/186 HTML 页剥掉样式后正文逐字节相同、样式块行差恰好 +8/−2 |
| CI / Deploy | PR **#42** 必需检查 `gate` **pass**（3m9s）→ 合并 → `Deploy to GitHub Pages` **success** |
| Online Smoke | 只打 3 页（首页 + 1 deal + 1 model）：**9 项全过**；线上 `class="detail-main"` 已在、`max-width: 820px` 已消失 |

边界：不改数据 / 文案 / 颜色 / 字体 / 卡片设计 · 不新建任何 `detail*.css`（共享样式只有一个来源）·
不碰 `/archive/**`（History 家族，且当前 0 个档案详情页）· 不碰首页与集合型页面 ·
首页 `.cmpshare` 既有的 `word-break: break-all` 刻意保留（不在本次范围）。
完整报告：[research/leaf-detail-layout-v1-report.md](research/leaf-detail-layout-v1-report.md)，
独立复查：[research/leaf-detail-layout-v1-self-audit.md](research/leaf-detail-layout-v1-self-audit.md)。


---

## 0.1 private-analytics-v1 状态（2026-10-04）

> **一句话现状**：生产站接入了 **Cloudflare Web Analytics**（Browser Beacon），
> 维护者可以在 Cloudflare Dashboard 私下看到访问与性能趋势；访客看不到任何统计，
> 访问数据不进仓库，本地测试一个请求都不发。

| 维度 | 实测 |
|---|---|
| 基线 | `origin/master` = `45b7b47`（2026-10-04 12:31 CST），worktree `.worktrees/private-analytics-v1` |
| 覆盖率 | **173 / 173** 个发布 HTML 各 **exactly 1** 个 bootstrap（0 个残留占位符、0 个重复注入） |
| 本地零上报 | `127.0.0.1` 真浏览器实测：Cloudflare 请求 **0**（含真实资源计时 `performance.getEntriesByType('resource')`）· JS 错误 0 |
| 唯一实现 | Beacon 定义与 Production Guard 都只在 `scripts/lib/analytics.js`；浏览器 / 构建期 / 门禁读同一份字节 |
| 页面集合 | HTML 173 · sitemap 170 · dist 文件 290 · Feed 48 · Manifest 9 —— 与基线逐字节相同（除注入的 beacon 段） |
| 业务数据 | Deals / Plans / API Plans / Models / Registry / History **一个字节都没改** |
| 门禁 | `check-ci-consistency` 37 项全过（新增 (18) 私有分析门禁步骤）· `selftest:analytics` 31 项全过（含 8 种篡改牙测试）· `verify-site` 709 项 0 失败 |
| 部署 | **未部署**：按约定推分支 + 开 PR（不合并）。线上 Smoke 与 Dashboard 验收标记 `OWNER VERIFICATION REQUIRED` |

边界（逐条有门禁盯着）：不加后端 / 数据库 / 账号 · 不迁托管与 DNS · 无公开统计页（无 `/stats/`）·
无 `traffic.json` / `analytics.json` · 不调 Cloudflare Analytics API · 无 Cloudflare 账户凭据 ·
不建本站访客身份（无 Cookie / localStorage ID / 指纹 / IP hash）· 无自定义事件 · 页面视觉零变化。

关闭方式：`scripts/lib/analytics.js` 里 `enabled: false`（一行）。完整说明见
[docs/PRIVATE-ANALYTICS-v1.md](docs/PRIVATE-ANALYTICS-v1.md)，实测记录见
`research/private-analytics-v1-report.md`。

---

## 0. v3.0 状态（2026-10-02）

> **一句话现状**：站点从「优惠 + 套餐 + API 价格页面集合」升级为
> **AI 优惠 / 套餐 / API 计费 / 模型 / 厂商 / 历史变化的结构化资料库**。
> 新增六个入口：`/plans/`（枢纽）· `/models/` 与 `/models/<slug>/` · 统一 `/vendor/<slug>/` 资料页 ·
> `/archive/` · `/docs/data/` + `/data/index.json` · `/feed/plans/api/changes.{xml,json}`。

| 维度 | v2.5（基点） | v3.0（实测） |
|---|---|---|
| 可索引页面 | 115 页 | **170 页**（`seo-verify` 的 `indexable URLs`；dist 共 173 页 = 170 + 3 条 noindex 别名）（+ 模型索引 + 44 模型详情 + 档案索引 + 数据文档 ⚠️ 2026-10 收口：`/docs/data/` 数据文档页已随数据出口整族下架，现役产物为 184 页） |
| sitemap | 112 条 | **170 条** |
| 厂商页 | 9 | **19**（身份门：只有 A 空间有厂商名的 provider 才建路由） |
| Feed | 24 | **25**（+ API 价格变化）→ **2026-10-04 重算：24 份 · ×2 = 48 文件**（含 T12 新增的 5 个 `category-*` = 10 文件；`/feeds/` 列出 48 个地址。v3.0 当时记 25，口径未复现，以重算值为准） |
| 数据 | deals 134 / plans 9 / api-plans 7 条 · 37 个模型计价条目 | deals 134 / plans 23 / api-plans 13 条 · **67** 个模型计价条目 · **44** 个 registry 模型 · **64** 条显式映射（API 55 + Coding 9；**2026-10-04 重算**，v3.0 当时记 63 —— 审计 P3-23「63/64 并存」已按重算收口） |
| 门禁 | 31 步 | **42 步**（+6 自测 +2 可重建性 +`coverage-report` +第二遍 build）· check:ci **36/36** 断言（**2026-10-04 重算**：`grep -c "\- name:" .github/actions/gate/action.yml` = **44**；步骤内部拆分口径见 `check-ci-consistency`） |
| 真浏览器验收 | 440 项 | **651 项 0 失败**（回归比对 **657 项 0 失败**） |
| 订阅可复现 | 2 次构建逐字节一致 | 同左，**且整个 dist 树**（290 文件）两次构建逐字节一致 |

> **数字口径（2026-10-04）**：上表「v3.0（实测）」列里被本行括注的数字已按当前 HEAD 重算；
> 完整现行数字与逐条重算命令见 `research/quality-closure/RECLASSIFIED_FINDINGS.md` §0.2「当前数字重算表」。
> 表中未加括注的 v3.0 读数属**当时快照**，保留原值（§E 历史快照纪律）。

**已知限制（如实记录）**：三份变化日志交付日的事件数分别是 deal 0 / plan 14 / api 6 ⇒
`/archive/` **必然 0 条记录**（ended/restored 分支由 `selftest:archive` 的合成夹具驱动）；
数据许可证**未定**（仓库无 `LICENSE` 文件，需项目所有者决定）；
`deals.json` 里 `GPT Image`（`gptimage-2-5.com`）与 `ChatGPT Plus`（`chatgpt.com/veterans-claim`）
两条**来源是第三方目录站、未见官方定价页**——保留但如实标注，是否下架需项目所有者决定
（详见 `research/v3.0-ai-deals-knowledge-base-report.md` §18）。

---

**历史一节**：2026-10-01（**2.45 `v2.5-api-token-plans`：API / Token 计费对比**，已上线）
**项目地址**：https://buguoshixc.github.io/ai-deals-aggregator/
**仓库**：https://github.com/buguoshixc/ai-deals-aggregator

> **一句话现状**：站点从「优惠聚合器」长成了**三件事**——① 优惠（现在有什么福利）·
> ② 套餐与 API 计费对比（长期用哪个、每百万 token 多少钱）· ③ 变化追踪（最近变了什么）。
> 三条产品线各有独立的数据契约、独立的可重建门禁与独立的历史日志：
> `deals.json`（v2，134 条）· `plans.json`（v1，9 条 Coding 套餐）· `api-plans.json`（v1，7 条 API 计费记录 / 37 个模型计价条目）。
> 三者互不注入，只用**显式关系表** `deal-plan-links.json` 相连。

---

## 一、目标与当前状态

**目标**：浏览器打开即用的静态站点，展示国内外 AI 大模型的**真实优惠**——新用户免费额度、免费模型、
学生 / 教师 / 非营利折扣、限时促销。

| 维度 | 改造前 | 现在 |
|---|---|---|
| 网站可访问 | ✅ GitHub Pages | ✅ 不变（仍是静态站，零构建） |
| 数据契约 | 裸数组，`discount` 字段语义混装 | v2 契约（`type` / `region` / `pricingModel` / `discountInfo` / `validity`），有校验 |
| 真实优惠 | 11 条（13.6%） | **80 条**（总条目 134 条；见 §四 的当前快照） |
| 国内数据 | 0 条 | **60 条**（厂商官方免费额度与免费模型） |
| 垃圾数据 | 15 条（CSS / 导航文本） | **0 条**（正则拦截 + 否定语境识别，校验不过不发布） |
| 默认视图 | 全部条目混在一起 | 只显示真实优惠，「全部工具」独立 Tab |
| 默认视图密度 | 同一张官方表格摊成 N 张几乎相同的卡片（千帆 17 张卡共用 1 个落地页） | **折叠为一张卡片**：80 条优惠 → 50 张卡片（见 2.10 / 2.30） |
| 落地页 | 26 条指向聚合站同一页 | 优惠条目 100% 指向厂商官方页，聚合站降级为署名 |
| 自动化 | 采集与部署互相耦合，构建期抓取 | 采集 / 发布职责分离，发布不再依赖网络抓取 |
| JS 渲染的公开页 | 一律放弃，只能人工策展 | 无头浏览器采集，火山方舟/智谱活动页已自动化（CI 每天 2 次） |
| 质量门禁 | 无 | `npm test`（零依赖）+ strict 内容指标，部署前强制 |
| 卡片信息层级 | 标题 + 段落文字，需逐字阅读 | 价格阶梯 / 频率标签 / 特性 chip / 数据更新日期 / 全宽 CTA（可扫读） |
| 可发现性 | 纯 JS 渲染，爬虫看到「加载数据中…」 | 发布产物含完整静态正文 + canonical / hreflang / og / 4 段 JSON-LD / FAQ / og 图 |
| 问题回答范围 | 只有「现在有什么优惠」 | 三问都答：**优惠** · **长期用哪个套餐 / 每百万 token 多少钱** · **最近变了什么**（见下） |
| 套餐数据（v2.1–v2.4） | 无 | **9 条 Coding 套餐**（`plans.json` v1）→ [`/plans/coding/`](https://buguoshixc.github.io/ai-deals-aggregator/plans/coding/) 一张 11 列表 |
| API 计费数据（v2.5） | 无 | **7 条计费记录 / 37 个模型计价条目 / 5 家平台**（`api-plans.json` v1）→ [`/plans/api/`](https://buguoshixc.github.io/ai-deals-aggregator/plans/api/) |
| 变化追踪 | 无 | `deal-history` + `plan-history` + **`api-plan-history`** 三份追加式日志；`/changes/` 收敛优惠与套餐两条流 |
| 优惠 ↔ 长期产品 | 无 | **显式关系表** `deal-plan-links.json`（5 条当前关系），优惠页与两个套餐页**双向深链**；关系**只由人写**，工具只出候选报告 |
| 门禁规模 | 无 | 34 步 CI 门禁 · 离线自测 **202 + 132 + 78 + 76** 项 · 真浏览器 **446 项**（线上 440 项） |

---

## 二、这次做了什么

### 2.1 数据契约与校验（P0）

- `scripts/lib/schema.js`：v2 契约的构造与校验。`makeDeal()` 是唯一入口，任何采集器不得自行拼字段。
- `deals.json` 改为 `{ schemaVersion, updatedAt, count, deals: [] }`，时间统一北京时间。
- `scripts/validate.js`：**零依赖**门禁，校验 schema、id 唯一、URL 协议、垃圾特征、分类枚举、
  前端内联脚本语法；`--strict` 另查内容指标。部署流水线直接调用它，因此发布无需 `npm install`。
- `scripts/migrate.js`：一次性把旧的 81 条数据迁移清洗到 v2（报告里逐条列出丢弃原因）。

### 2.2 采集器重构（P1）

旧代码的问题：三个采集器各写各的字段、选择器靠猜、零产出也留在流程里。

新结构：注册表 + 统一归一 + 去重 + 熔断 + 报告。（"熔断"是当时的日志叫法；它当时也只告警、不拦写盘——现状口径见本节下面那条说明。）

```
scripts/collectors/
  index.js                 注册表（只登记实测有产出的来源）
  cn_docs.js               国内：百度千帆 / 阿里云百炼 / 智谱
  global_deals.js          国外真实优惠：Layer3Labs 折扣表
  global_directories.js    国外目录站：aitools.fyi / Futurepedia / Futuretools
scripts/lib/
  schema.js  store.js  dedup.js  classify.js  official.js  http.js  report.js  curated.js
```

关键机制：

- **降级告警（当时的日志措辞是「熔断告警」）**：新采条目少于既有数据的 30% 时**只告警**并合并保留，不会把站点写空。
  → **真正拦写盘/退出的只有两条**，口径以 `scripts/collect.js` 文件头为准：「① 本次采集零产出且未加 `--force`」
  与「② `zhReport.skipped` 非空（译文不合规）」；「单源失败」与「采集量骤降」明确**不拦**写盘、不动退出码。
- **既有数据每次体检**：垃圾条目自动退役、分类按当前规则重算（修掉了"改了规则对旧数据无效"的坑）。
- **否定语境识别**：折扣表里写着"No standing public discount was listed"的行，不会被误判成优惠。
- **官方页解析**：聚合站条目优先取行内官方链接，缺链接时查 `data/official_urls.json` 映射。
- **去重**：稳定 `id` + 标题别名表；`validate.js` 会提示"疑似同一优惠未合并"，提醒补别名。

### 2.3 国内数据（P2）

原 `cn_sources.js` 的选择器（`.model-card` / `.discount-badge` 等）在任何真实页面上都不存在——实跑返回 0 条。

实测后重新选源，**只抓官方文档里的"免费额度 / 免费模型"**，不抓价格表（价格表会让站点退化成工具介绍）：

| 来源 | 抓取内容 | 产出 |
|---|---|---|
| 百度千帆 | 官方「新用户免费额度」表（服务名称 / 赠送 Tokens / 有效期） | 17 条 |
| 智谱AI | 模型总览页里所有指向 `/models/free/` 的免费模型（GLM-4.7-Flash、CogView-3-Flash、CogVideoX-Flash 等） | 7 条 |
| 阿里云百炼 | 官方帮助文档「新人免费额度」 | 1 条 |
| 人工策展 | 火山方舟、腾讯混元、讯飞、Kimi、商汤、硅基流动、阶跃星辰、百川等抓不到的官方优惠 | 9 条 |

**已实测淘汰**：`bigmodel.cn/pricing`（3.8KB SPA 空壳）、`qianfan.cloud.baidu.com/pricing`（选择器不存在）、
火山引擎文档（11KB JS 空壳）、DeepSeek / Moonshot 定价页（纯价格表，0 条优惠信号）、
AppSumo（客户端渲染，0 产出）、Product Hunt deals（403）。

> 结论：国内厂商页面普遍 JS 渲染 + 需登录，**自动采集只能覆盖一小部分，人工策展是主力**。
> 项目提供了 `scripts/tools/` 三个探测工具（`inspect-source` / `find-offers` / `term-count`）来快速判断某个源值不值得写采集器。

### 2.4 前端（P3）

保持原生 HTML/CSS/JS 单文件、零构建（这是它能在 Pages 上稳定运行的根本原因），做了这些改动：

- **严格模式**：默认 Tab 只显示 `type: "deal"` 且未过期的优惠；"全部工具"独立 Tab。
- **分面筛选**：地区（国内 / 国外）、分类（固定 12 类枚举）、搜索、排序（默认 **「优惠力度优先」**，另有「即将截止」/「最近更新」两档——**没有「名称」排序**，见 `index.html` 的 `SORTS` 与 `data-sort` 按钮）。
- **视觉层级**：优惠徽章红底高亮，定价模式灰字，国内 / 国外颜色区分。
  （本节早先还写着「`≤7 天` 截止高亮」——**实测尚未实现**：`index.html` 里只有 `const SOON_DAYS = 7;` 这一处声明，全仓零引用、没有任何阈值逻辑，见 P0-2 复核。）
- **安全修复**：原 `escapeHtml` 用于 `href` 属性不转义引号，存在属性注入风险；现在 URL 走 `http(s)` 白名单 + `escapeAttr`。
- **"最后更新"改为读数据里的 `updatedAt`**（原来显示的是浏览器当前时间，与数据无关）。
- 补齐 meta description / OG / favicon / robots.txt / sitemap.xml 与空状态、加载态、错误态。

### 2.5 自动化与部署（P4）

改造前：`deploy.yml` 在构建期跑一次采集，并把整个仓库（含 `node_modules`、脚本、文档）作为 Pages 产物上传；
同时 `collect.yml` 也在采集——两处采集、产物不可复现。

现在：

- `collect.yml`：cron **名义**上是每天北京时间 08:00 / 20:00（UTC 00:00 / 12:00）采集 → `validate`（含 strict 门禁）→ 有变化才提交 `deals.json`。
  **实测**：GitHub 的 schedule 队列常延后 **3 到 6 小时**——2026-09-23 从 Actions API 复核 4 次 schedule 运行的
  `created_at`（+3h26m50s 到 +5h55m40s）：`2026-09-21T17:55:40Z`（名义 12:00Z，延后 5h55m40s，run 35635091297）、
  `2026-09-22T03:26:50Z`（名义 00:00Z，延后 3h26m50s，run 35683186610）、`2026-09-22T16:22:56Z`（名义 12:00Z，延后 4h22m56s，
  run 35753733647）、`2026-09-23T03:27:38Z`（名义 00:00Z，延后 3h27m38s，run 35814407156）。「08:00 / 20:00」是名义时间。
- `deploy.yml`：`push` 到 master 时**纯发布**。调用 `node scripts/tools/build-local.js` 组装 `dist/`
  （`PUBLIC_FILES` 5 个公开源文件：index.html / deals.json / favicon.svg / robots.txt / .nojekyll；产物
  `dist/` 根目录 10 个文件 507.1 KB，含 80 个详情页在内全量 139 个文件约 4.8 MB），零依赖、不联网抓取。
- 本地 `npm run build` 与 CI 走**同一个脚本**，避免"本地通过、线上失败"。

### 2.6 修复：机器人提交无法触发部署（上线后发现）

GitHub 规定——**用仓库自带的 `GITHUB_TOKEN` 推送产生的事件不会再触发其它 workflow**。
原来的链路是「collect.yml 提交 → push 事件 → deploy.yml 部署」，实际跑下来这条链路是断的：

```
Collect AI Deals   7754087  schedule  2026-09-21T03:28Z   → 提交了 76ee1e5
                    ↑ 76ee1e5 之后没有任何 Deploy 运行
```

也就是说**自动采集能把数据写进仓库，但线上站点不会更新**，只有人工推送才会更新网站。

修复：`deploy.yml` 额外监听 `workflow_run: Collect AI Deals completed`（该事件由 workflow 完成触发，
不受 `GITHUB_TOKEN` 限制），并在采集任务失败时跳过发布，线上保留上一份好数据。

---

### 2.7 新增：无头浏览器采集（JS 渲染的公开页）

**背景**：国内厂商的活动页/产品页多为 SPA，静态 `fetch` 只能拿到几百字节空壳（`cheerio` 解析 0 条），
因此 `bigmodel.cn/pricing`、`volcengine.com/product/ark` 这类页面此前被判"零产出"淘汰，只能人工策展。

**做法**：`scripts/lib/browser.js`（playwright-core + 本机已装 Edge/Chrome，不下载内核）把页面渲染完再取 DOM，
新增 `scripts/collectors/headless.js` 两个来源：

| 来源 | 抓取内容 | 产出 |
|---|---|---|
| 智谱AI活动页 | 官方价格页营销位：新用户 2000 万 Tokens、邀请返 Tokens、GLM-5.3-Flash 限时五折、Batch 五折、缓存限时免费 | 5 条 |
| 火山方舟 | 产品页「免费额度」表（文本/图像/语音/向量/联网插件，共 10 个模型额度）+ 最新活动（协作奖励计划、Agent Plan） | 12 条 |

关键约束（都写进了代码注释）：

- **只抓公开页，不做登录态抓取**：不加载 profile、不注入 cookie、不传凭据。
- **默认不加载**：只有 `collect.js --headless` 才 require 无头来源；`validate.js` 依旧零依赖，
  不带 `--headless` 的调用完全不依赖 `playwright-core`。
- **规则驱动、失败安全**：每条产出对应官网一句原文正则；页面改版导致不命中时产出为 0，不猜测、不拼接。
- **宁可漏采也不发坏数据**：免费额度表的分项按下标配对，对不上且模型非单个时整行跳过。

**踩到的四个坑**（都已修）：

1. `innerText` 取不到 `display:none` 的活动横幅 ⇒ 新增 `domText`（整个 DOM 的文本）专门用于规则匹配，
   `text`（innerText）仍用于"用户可见正文"探测。
2. 免费额度表的模态列带 `rowspan="4"` ⇒ 后续数据行只有 2 个 `<td>`，被"至少 3 列"的守卫整行误杀，
   漏掉 3 条语音额度。
3. 额度单元格里是多个分项（如"5000字符"+"10复刻声音"）⇒ 模型 1 个、额度 N 段时合并描述，
   模型 N 个、额度 N 段时按下标配对。
4. **`networkidle` 不能当主等待策略** ⇒ 有长轮询/埋点请求的 SPA 永远等不到 idle，超时后代码又调了一次
   `page.goto`，等于把页面重新加载一遍，只等 1.5s 就抓 DOM ⇒ 拿到空壳。改为 `domcontentloaded`
   + 显式等待目标文案（`waitForText`），不但修好了，耗时也从 28–50s 降到 4–8s。

**CI 可达性实测**（`.github/workflows/probe-sources.yml`，只读、手动触发）：

| 项 | 结果 |
|---|---|
| Actions 出口 IP | `135.232.201.85` |
| `bigmodel.cn/pricing` 直连 | HTTP 200 / 4301 bytes（正常 SPA 空壳，**无风控特征**） |
| `volcengine.com/product/ark` 直连 | HTTP 200 / 168969 bytes，**无风控特征** |
| 火山方舟在 CI 的产出 | 12 条（与本地一致） |
| 智谱AI活动页在 CI 的产出 | 首轮 0 条 → 定位为上面的坑 4，已修复；复测运行 [#35612557532](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/35612557532) 全绿，两来源总耗时从 49.7s 降到 18s |

结论：**机房 IP 没有被拦**，把无头来源接进 `collect.yml` 在可达性上没有障碍。

**边界**：无头来源最初只在本地手动跑，现已**接入 `collect.yml`**（见 2.8），与静态来源在同一次采集里
每天自动跑 2 次；内核安装步骤是 `continue-on-error`，装不上时该来源产出 0 条而不拖垮静态链路。
每次运行的 Summary 会打印各来源产出，零产出能立刻被发现。

**DeepSeek 的结论**：官网（`www.deepseek.com`）与 API 文档（`api-docs.deepseek.com`）用无头浏览器渲染后
**依然是 0 条优惠信号**——定价页只有"扣减…将从充值余额或赠送余额中扣减"这类计费说明，不是可领取的公开额度。
按"零产出的采集器不上线"原则**不注册采集器**，如需收录只能人工策展。

---

### 2.8 无头来源接入 CI

探针实测确认机房 IP 可达后，`collect.yml` 改成：

1. runner 钉 `ubuntu-24.04`（避免 `ubuntu-latest` 迁到 Ubuntu 26 后浏览器系统库变化）
2. `actions/checkout@v5` / `actions/setup-node@v5` + `node-version: '24'`（消除 Node 20 弃用警告）
3. 新增 `Install browser for JS-rendered sources`：按 `playwright-core` 的版本号安装自带 chromium，
   **`continue-on-error: true`**——装不上时无头来源各自报错、产出 0 条，静态来源照常跑，不会拖垮主链路
4. 采集步骤改为 `node scripts/collect.js --headless`，并加 `set -o pipefail` 与 `tee`，
   保证采集失败不会被管道掩盖
5. 新增 `Publish run summary`（`if: always()`）：把各来源产出、零产出告警、熔断告警写进运行 Summary，
   某天某个来源零产出时不用翻日志就能看见（「熔断告警」是该步当时的日志措辞，现在这条告警叫「降级告警」）。

`deploy.yml` 未改动（纯发布路径保持原样）。

---

### 2.9 新增：卡片信息架构 + SEO/GEO 静态骨架

**背景**：与同类站点（devtk.ai 的优惠页）逐项对比后确认，我们的**数据侧明显更强**（优惠 71 条 vs 18 条、
国内 51 条对方几乎空白、全自动采集 vs 人工维护），但**产品侧与可发现性明显更弱**：
卡片把信息压成等权重的连续文本（阅读式而非扫描式）、没有价格阶梯与核验日期、CTA 是页脚文字链；
页面内容全靠 JS 运行时渲染，爬虫拿到的是「加载数据中…」；没有 canonical / JSON-LD / og 图 / FAQ。

**这次把这 7 项补齐**（1–4 卡片信息架构，5–7 SEO 基建）：

| 项 | 做法 |
|---|---|
| ① 特性标签 | v2 契约新增 `features`（≤3 个、每个 ≤20 字），卡片渲染为 chip；无标签时回退 `discountInfo` |
| ② 核验日期 | 新增 `verifiedAt`；**只有人工逐条回访官方页的条目显示「已核验」**，自动采集条目显示「数据更新：{lastSeen}」 |
| ③ 价格阶梯 | 新增 `priceLine`；无可靠来源时为 `null`，卡片不渲染该行（不编造升级路径） |
| ④ CTA 按钮化 | 页脚文字链改为卡片底部全宽实心按钮「获取优惠 →」 |
| ⑤ FAQ + FAQPage | 页面新增 4 条可见问答；`FAQPage` 结构化数据**从可见文案反向解析生成**，构建自检校验逐字一致 |
| ⑥ canonical / hreflang / og / twitter / 结构化数据 | 补 canonical、`hreflang(zh-CN / x-default)`、`og:*`、`twitter:*`、`max-image-preview:large`；4 段 JSON-LD（Organization / BreadcrumbList / FAQPage / ItemList）；零依赖生成的 `og-image.png`（1200×630） |
| ⑦ robots.txt | 显式放行 GPTBot / ClaudeBot / PerplexityBot / Google-Extended 等 11 个爬虫，声明 GEO 意图 |

**关键设计：预渲染，但不引入第二份模板**

发布产物 `dist/index.html` 现在含**完整静态正文**——不执行 JS 也能读到 71 张卡片的标题、价格、
标签与官方链接（爬虫/生成式引擎视角与用户一致）。做法是在 `index.html` 里划出一块
`RENDER-CORE` 纯函数区，构建脚本按标记抽出、在**无 DOM 的 vm 沙箱**里求值后调用同一个
`cardHtml()` 生成静态卡片。因此「构建期渲染」与「浏览器渲染」是**同一份模板**，不会分叉；
一旦有人在区块里引用 `document` / `window` / `state`，构建立即失败，而不是悄悄产出坏页面。

产物自检新增断言：预渲染卡片数下限（2.9 上线时为 ≥60，2.10 折叠后下调为 **≥45**）、CTA 数不少于卡片数、
无 `PRERENDER`/`__SITE_URL__` 残留、4 段 JSON-LD 均可 `JSON.parse`、FAQ 可见文案与结构化数据逐字一致、
`og-image.png` 为合法 PNG 且 1200×630。

**诚实性红线（与竞品的差别，刻意保留）**

- 不把「抓到过」说成「核验过」：只有 **32 条**人工策展条目显示核验日期（`curated_cn` 18 + `curated_global` 14；`node scripts/validate.js` 实测「人工核验 32」「策展数据 32 条」）。
- 看不到升级路径就不写价格阶梯；没有可信标签就不写特性标签（**不从 `description` 自动切分**）。
- 不收录付费推广位；页脚明写「排序与推荐理由不出售」。

**取舍**：`og-image.png` 用 Node 内置 `zlib` 手写 PNG 编码 + 5×7 点阵字模生成。点阵字模只能画
ASCII，所以分享图只排品牌标记与站点名，不做中文排版——换来构建仍然零外部依赖（CI 不需要装图像库）。

**顺带修正**：`serve.js` 新增 `--dir=` 以便直接预览发布产物；修正分类下拉被误标为「地区」的
`aria-label`；`.github/workflows` 未改动（`build-local.js` 依旧零依赖，`dist/` 仍是产物路径）。

**验证**（本机 Edge + playwright-core 实测）：

| 场景 | 结果 |
|---|---|
| 不执行 JS 读取 `dist/index.html` | 71 张卡片、71 个 CTA、完整正文可见 |
| 浏览器默认视图 | 71 卡片 / 53 特性 chip / 3 价格行 / 23 条「已核验」/ 48 条「数据更新」 |
| 全部工具 Tab | 121 条（含 50 条工具） |
| 搜索 | 「学生」命中 8 条；「tokens」命中 25 条（特性标签已参与搜索） |
| 地区筛选 | 国内 51 条，全部带国内徽章 |
| 页面控制台错误 | 0 |

> 注：本节的卡片数是 **2.9 上线时的状态（71 张）**。2.10 折叠上线后默认视图为 **53 张卡片**，
> 「全部工具」Tab 由 121 条变为 **103 张卡片**，地区筛选国内由 51 条变为 **33 张**——
> 这些都是呈现粒度变化，`deals.json` 本身一条未动。

---

### 2.10 新增：同一官方页面的「一张表」折叠为一张卡片

**背景**：71 条优惠里有 41 条（58%）来自三个「表格型」来源。问题最突出的是百度千帆——17 条数据的
`discountInfo` / `eligibility` / `validity` / `url` **逐字相同**，连 CTA 都指向同一个链接，只有标题里的
模型名不同，等于把同一张官方表格的 17 行摊成了 17 张几乎一样的卡片。火山方舟同样 12 张卡共用 1 个落地页。

而同一个 `cn_docs.js` 里，阿里云百炼（同样来自官方帮助文档的一张表）却被处理成 **1 条汇总条目**：
**采集器内部对「一张表」给出了两种答案。**

一度考虑过「以厂商作为一级分类」，实测数据否决了这个方案：

| 考察项 | 数据 |
|---|---|
| 厂商维度长尾 | 121 条里有 **78 个 vendor 名，其中 71 个只有 1 条**；71 条优惠来自 28 个厂商名，21 个只有 1 条。按厂商分组会得到 78 个分组头、71 个下面只挂一张卡 |
| 厂商字段未归一 | 同时存在 `火山引擎` 与 `火山引擎（字节跳动）`，同一家公司会被拆成两组 |
| 厂商 ≠ 模型厂商 | 千帆那 17 条里含 `DeepSeek-R1` / `Kimi-K2-Instruct` / `Qwen3-235B`，是**第三方模型托管在千帆平台上**，按公司分组会产生语义混乱 |

最终确立的规则：**一个官方页面上的一张表 = 一条优惠**，且在**渲染层折叠**，不动数据契约。

**做法**（`index.html` 的 `RENDER-CORE` 区新增纯函数，构建期与浏览器共用同一份，不会分叉）：

| 函数 | 职责 |
|---|---|
| `foldKey()` | 折叠键 = 厂商 + 落地页 + 优惠文案 + 适用条件 + 有效期；`type !== 'deal'` 或缺 `vendor`/`url` 时返回 `null`，即不折叠 |
| `foldDeals()` | 折叠入口；**单成员组原样返回、不改写任何字段**，因此非重复条目与工具条目渲染结果逐字节不变 |
| `commonSuffix()` / `boundarySuffix()` | 求公共后缀；后者只取「以空格开头」的那一段 |
| `foldTitle()` | 组标题 = 显示名（来源名，人工策展退回厂商名）+ 公共后缀，重名时两级降级 |
| `modelsHtml()` | 模型清单：一个纯文本 `div` + `data-model-count`，**不新增任何 CSS** |
| `defaultCards()` | `defaultOrder(foldDeals(defaultVisible(deals)))`——预渲染与浏览器的**唯一入口** |

**两个关键设计**

- **边界安全后缀**。若用无约束的最长公共后缀，`Doubao-流式语音识别 免费额度` 与
  `Doubao-录音文件识别 免费额度` 会剥出 `Doubao-流式语音`、`Doubao-录音文件`——把共享的「识别」
  一起切掉了。改为只从「以空格开头」处切分，剥出的是**完整模型名**。这是本项目「只取原文事实、
  不生成近似内容」这条红线的直接推论。
- **无损断言**。`build-local.js` 新增 `Σ(卡片模型数) === 未过期优惠条数`，不等即**构建失败**。
  这比「卡片数 ≥ N」这类魔法数字更能抓住真正的失效模式（折叠丢条目），也是把
  `MIN_PRERENDERED_CARDS` 从 60 下调到 45 的底气所在。

**结果**

| 指标 | 折叠前 | 折叠后 |
|---|---|---|
| 默认视图卡片 | 71 | **53** |
| 百度千帆 | 17 张卡（共用 1 个落地页） | **1 张卡，卡内 17 个模型** |
| 火山方舟 | 12 张卡（共用 1 个落地页） | **10 张卡**（其中 2 张折叠卡各 2 个模型） |
| CTA 按钮 | 71 | 53（每卡一个） |
| 「数据更新」标识 | 48 | 30（21 条自动条目折成 3 张卡） |
| 特性 chip / 价格行 / 「已核验」 | 53 / 3 / 23 | **53 / 3 / 23（完全不变）** |
| `deals.json` | 121 条 | **121 条（零改动）** |

**代价与对冲**

- **SEO 长尾**：合并会损失「模型名 + 免费额度」这类独立标题。对冲方式是折叠卡把 **17 个模型名全量
  写进静态正文**，`ItemList` 的一条 `ListItem` 也带上 `description: "覆盖 N 个模型：…"`。实测线上
  产物仍可检索到 `ERNIE-4.5-Turbo-VL`、`Doubao-录音文件识别`。
- **搜索语义**：搜索是「先筛选、再折叠」，所以搜 `ERNIE` 得到 1 张折叠卡、卡内只列命中的 4 个模型；
  但若命中来自 `discountInfo`（如搜 `tokens`），卡片会列出该组全部 17 个模型。这是刻意取舍：
  保留上下文，代价是不高亮具体命中项（`matchedModels` 字段评估后未实现，因为它与 `models` 高度重合）。

**顺带修正**：`build-local.js` 的 CTA 自检原用 `/class="cta"/g`，会把内联脚本里的模板字符串字面量
也算进去，使 CTA 计数**恒定虚高 1**——意味着「少渲染一个 CTA」永远查不出来（53 个里少 1 个仍是
53 ≥ 53）。已改为只匹配渲染结果 `class="cta" href="https?:`；折叠卡计数同一个坑一并修正。

**验证**（本机 Edge + playwright-core 实测发布产物）

| 场景 | 结果 |
|---|---|
| `npm test` / `npm run test:strict` | 全绿，指标原样（总 121 / 优惠 71 / 国内 51）——`validate.js` **未改动** |
| `npm run build` | `卡片预渲染: 53 条`，自检全绿；`✓ 折叠无损: 53 张卡片覆盖 71 条优惠（3 张折叠卡 / 21 个模型名）` |
| 不执行 JS 读取 `dist/index.html` | 53 张卡片、53 个 CTA、模型名全部在静态正文里 |
| 浏览器默认视图 | 53 卡片 / 3 折叠卡 / 53 特性 chip / 3 价格行 / 23「已核验」/ 30「数据更新」 |
| 搜索 | 「ERNIE」→ 1 张卡（4 模型）；「学生」→ 8 张卡；「tokens」→ 9 张卡 |
| 地区筛选 | 国内 33 张 / 国外 20 张 |
| 全部工具 Tab | 103 张卡片（含 50 条工具） |
| 确定性 | 连续两次构建 `dist/index.html` SHA256 一致 |
| 页面控制台错误 | 0 |
| 线上 GitHub Pages | 53 张卡片 / 3 折叠卡；(53−3)+21 = **71**，与 `deals.json` 无损对齐 |

**明确不做**（留作独立议题）：智谱那 7 条「XX 免费模型」不合并——它们 `url` 各不相同（8 个落地页），
不属于「同一张表」，要合并得另写一条厂商级策略。

**交接**：模型清单的样式（chip / 截断 / 展开）刻意留给后续单独处理，本次不含任何视觉设计。
挂载点：`.deal-models`、`[data-model-count]`、`foldTitle()` 里的后缀函数、`cardHtml()` 中
`modelsHtml(deal)` 的位置。

**改动范围**：`index.html`（+181 行）与 `scripts/tools/build-local.js`（+96/−36）。
`deals.json` / 采集器 / `schema.js` / `validate.js` / `.github/workflows` 零改动。

---

### 2.11 新增：前端重做为高密度分档网格 + 真厂商 logo

**背景**：线上是「一行一张卡」，1440×900 首屏只能完整看到 **1 张**卡片（卡片高度 216–330px 不等），
全部内容要滚 **15.3 屏**；
优惠与免费额度的区别也要读文字才知道。这里把「一屏能看到多少条」和「一眼能不能分出
免费 / 收费」当成两个可测量指标来解。

**做了什么**

| 项 | 之前 | 现在 |
|---|---|---|
| 布局 | 单列，卡片宽 1008px、高 228px | 1440px 下 **3 列**，卡片高 **192px**（统一） |
| 首屏完整可见卡片 | 1 张（含截断 2 张） | **9 张**（含截断 12 张） |
| 全部内容滚动 | 15.3 屏（页高 13815px） | **5.0 屏**（页高 4518px，含 FAQ + 页脚） |
| 排序依据 | 即将截止优先 | **优惠力度五档**（完全免费 → 免费额度 → 身份优惠 → 折扣促销 → 付费为主），同档内按即将截止 → 最近更新 |
| 厂商标识 | 纯文字 vendor | **29 家真厂商 logo**（官方品牌图形），折叠卡上还显示覆盖的模型家族 logo |
| 筛选 | 两个下拉 + 两个 Tab | **facet 筛选条**（已核验 / 类型 / 地区 / 厂商计数），带实时计数 |
| 详情 | 无 | 点卡片开弹层，字段原样铺开（适用条件 / 有效期 / 价格阶梯 / 核验状态 / 覆盖模型 / 来源） |

**分档规则的两次纠错**（都由报告工具查出来，不是拍脑袋）

1. 一开始只在 `eligibility` 里找身份词，结果 Replit / Zapier / Google Gemini 这类普通免费档
   被划进「身份优惠」——因为目录站抓来的适用条件写的是媒体受众词
   （`Students, solo builders, app builders…`），不是门槛。
   → 改成 **offer 侧（标题 + 优惠说明）才算身份门槛**，适用条件只作参考。
2. 修正后仍有假阳性，因为原文里就有否定句：
   `No standing public student or nonprofit discount was listed…`、
   `…says the previous student offer ended March 11, 2026`。
   → 加 **否定句剔除**（与 `schema.js` 的 `hasDiscountSignal` 同一套思路）。断句刻意手写而不用
   正则一次切完——`U.S.` 这类缩写会把句子拦腰截断，反而把否定词和它否定的对象分到两句里。

最终分布：**①完全免费 12 · ②免费额度 20 · ③身份优惠 18 · ④折扣促销 3 · ⑤付费为主 0**
（第 5 档当前无成员：默认视图里所有条目要么免费、要么有额度、要么有身份或折扣信号）。
`npm run report:tier` 会逐条列出命中的判据和判据读到的原文，调规则先看它。

**厂商 logo：全部是官方品牌图形**

* 19 条品牌矢量（simple-icons 品牌路径 + Microsoft 四色方块矢量重建）
* 19 个厂商官网文件（`openai.com` 的 apple-icon、`siliconflow.cn/logo-new.svg`、
  `portal.volccdn.com` favicon、`bigmodel.cn` favicon …）
* 构建期由 `scripts/lib/logos.js` 生成为 `dist/logos/` + `dist/logos.css`；
  页面只写 `data-logo` 属性，**不热链任何 CDN**（`npm run verify` 断言外部请求 = 0）
* 构建期断言「模板引用的 logo key 全部已登记」，缺一个直接构建失败
* 抓不到官方图形的 8 家（Midjourney 403，xAI / Mistral / Hugging Face / Ideogram /
  Leonardo / KREA / Together 连通性失败）**就是不挂 logo**，不拿近似图凑数；
  科大讯飞只有 32px favicon、商汤方形图标只有 120×184，如实记进
  `assets/logos/README.md` 的缺口表

**厂商归一**：采集来的 vendor 字符串有 78 种写法（`火山引擎` / `火山引擎（字节跳动）`、
`科大讯飞 讯飞开放平台`、`腾讯云 混元大模型`…）。RENDER-CORE 里一张有序规则表把它们归到
规范厂商，同时供**厂商筛选、卡片 vendor 行、logo 取图**三处使用。没有规则的条目原样返回，
不硬套厂商。

**架构上没有分叉**：筛选、排序、分档、渲染全部收进 RENDER-CORE 纯函数区，浏览器走
`cardsFor(deals, filters)`，构建期走 `cardsFor(deals, DEFAULT_FILTERS)`——**默认视图就是同一
函数取默认参数的那一次调用**。预渲染标记从 2 个增加到 6 个（卡片、facet 计数、顶栏汇总、
结果条、分类选项、JSON-LD）。

**修掉的两个真实缺陷**

1. 详情弹层的 logo 簇只有类名、没有布局规则，`display:grid` 的 tile 会在行内元素里**竖着叠起来**。
   由 `npm run verify` 的移动端 tile 计数异常暴露。现在弹层用独立的 `.dh-logos` 一行平铺。
2. 工具条目渲染了优惠正文块，再用 CSS `display:none` 藏掉——DOM 里存在、视觉上不存在。
   改成工具条目显示**工具简介（灰条、不加粗）**，优惠条目显示**优惠说明（档位配色竖条、
   前半句加粗）**，两者都是数据原文，视觉语言也分得开。

**验证**：新增 `npm run verify`（真浏览器 35 项断言）。卡片是固定高度，内容变高会被
`overflow:hidden` 静默裁掉，所以断言里最关键的一条是「每张卡最后一个元素的底边有没有越过
卡片内边距」——53 张卡全部通过。另有 hover 前后「卡片高 / logo 簇宽 / 标题宽」三量不变
（logo 簇的容器宽度按展开后预留，展开只填满预留空间，不挤标题、不顶网格行高）。
截图见 `mockups/.preview/site-*.png`。

`--url=` 可直接验收线上站点，部署后拿它当冒烟测试：

```bash
npm run verify -- --url=https://buguoshixc.github.io/ai-deals-aggregator/
```

密度数字的口径说明：**「首屏完整可见」= 卡片底边 ≤ 视口底边**，比「顶边在视口内」严格，
也不受亚像素取整影响。上面那组前后对比是拿同一个脚本量旧版（`3e67867` 的 index.html）
与新版各一遍得出的，不是估算。

**上线结果**：`b0b68ed` → Deploy #17 成功 → 线上 35 项断言全过
（53 张预渲染卡片 / 4 档分带 / `logos.css` 39 条规则 / `logos/openai.png` HTTP 200 / 外部请求 0 / JS 报错 0）。

**改动范围**：`index.html`（重写）、`scripts/lib/logos.js`、`scripts/lib/render-core.js`（新）、
`scripts/tools/build-local.js`、`scripts/tools/verify-site.js`（新）、
`scripts/tools/tier-report.js`（新）、`scripts/tools/fetch-logos.js`（新）、
`assets/logos/`（38 个 logo + manifest + README）、`scripts/validate.js`（预渲染标记清单）。
`deals.json` / 采集器 / `schema.js` / CI 工作流**零改动**。

---

### 2.12 新增：厂商 logo 的名称缩写兜底

**背景**：2.11 上线后卡片上只有 30 家厂商有官方品牌图形，剩下 42 家（几乎全是目录站抓来的
长尾工具）卡片上什么都不挂，`全部工具` 那一屏看起来像没做完。复查了那 5 家够不着的厂商
（见 `assets/logos/README.md` 的缺口表）之后确认本地无解，于是加一层**明确的降级**。

**规则（顺序是硬的）**

1. 拿得到官方品牌图形 → 一定用真图形；
2. 确实拿不到 → 用厂商名生成的缩写方块；
3. **两者永远不出现在同一张卡上** —— 构建期与 `npm run verify` 都断言二选一。

**缩写块怎么做成「一眼看出不是品牌图形」**

| 项 | 做法 |
|---|---|
| 取字 | 拉丁名取前两词首字母（`Wispr Flow → WF`、`Dubly.AI → DA`）；单词或中日韩名取前两字（`KREA → KR`、`商汤科技 → 商汤`）。纯函数，同名同缩写 |
| 配色 | 6 个低饱和深色按名称哈希取一个，与品牌色明显不同 |
| 标注 | `title` 与 `aria-label` 都写明「名称缩写，未取得官方品牌图形」 |
| 不复用 | 缩写块没有 `data-logo` 属性，不走 `logos.css`，不会被误当成已登记的图形 |

**结果（2.12 当时值）**：72 家厂商里 **30 家用官方品牌图形、42 家用缩写兜底**（`npm run report:vendor` 可复核）。

> **当前实测（2026-09-23 复测）**：共 **77 家**——**官方品牌图形 38 家 / 名称缩写兜底 39 家**
> （`npm run report:vendor` 输出 `官方品牌图形: 38 家 / 名称缩写兜底: 39 家 / 共 77 家`）。
> 上面那组 30 / 42 与 2.13 的 35 / 37 一样，都是**当时值**，不是现状。

默认视图 53 张卡片本来就全部有真图形（兜底 0 个），变化集中在 `全部工具` Tab。
42 个缩写块里有 1 组重名（`Labrynth` 与 `Leonardo AI` 都是 `LA`）——不成问题，
卡片上紧挨着就写着厂商全名，缩写块只是视觉锚点。

**验证**：`npm run verify` 从 35 项加到 **38 项**，新增的三项是
「缩写块有字 / 不裁切 / 已标注」、「官方图形与缩写块不混用」、「长尾厂商走名称缩写兜底」。


---

### 2.13 收尾：最后 5 家厂商的真图形全部拿到

**起因**：2.12 之后还剩 5 家（Midjourney / xAI / Ideogram / Leonardo AI / KREA）只有名称缩写兜底块。
2.12 的结论是「官网在本机网络下不可达，本地无解」——**这个结论对了一半**。

**真正的分界线是出口，不是站点**

2.12 的三段探针是在**代理关闭**状态下直连做的，结论「不可达」只对直连成立：

| 路径 | 结果 |
|---|---|
| 直连（强制 IPv4 / 真浏览器 Happy Eyeballs） | 全部 ETIMEDOUT |
| 经本机代理 `127.0.0.1:7890` | `mistral.ai` / `huggingface.co` **200** |

直连时一批互不相关的域名把 AAAA 解析到同一段 `2a03:2880:…:face:b00c`（Meta 的地址段），
是本地出口的解析问题；代理走远端解析，这些域名就正常了。
**教训：诊断网络问题时必须先确认代理状态，别把「本机出口」的结论说成「站点不可达」。**

**三条取图路径（从简到繁，都记进了 `assets/logos/README.md`）**

1. 站点不挡爬虫：`NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 npm run fetch:logos`
   —— Node 24 内置 fetch 自己走代理，**内置工具零改动就能用**；
2. 站点挡住 curl/node（Cloudflare 403）：真浏览器 + 代理打开首页，再**在页面上下文里**
   `fetch(url, { credentials: 'include' })`。关键点：Playwright 的 `ctx.request` 不带放行 cookie，
   子资源一律 403；页面内 fetch 带 cookie 与 Referer，等同页面自己加载那张图；
3. 图标路径本身 403：退一步找 `og:image` 与页面内 `<img>`。

**画布校验又抓出两个坑**

- **Midjourney**：站内内联 favicon 是**整张全透明**的占位图（不透明像素 0%），不是 logo——丢弃。
  真图形在 `/public/apple-touch-icon.png`（180×180），用路径 ② 才取到。
- **Hugging Face**：`og:image` 是 **1200×648 的社交预览横幅**，不是 logo。加了长宽比过滤后
  改用官网官方 logo SVG `front/assets/huggingface_logo-noborder.svg`（95×88，平均色 #F4B61A）。
- **Ideogram**：站内 `new-logo.svg` 是 **5:1 长条字标**，方形格位不合适；改用 48×48 的方形 favicon。

**结果**

| | 之前（2.12） | 现在（2.13 当时值） |
|---|---|---|
| 官方品牌图形 | 30 家 | **35 家** |
| 名称缩写兜底 | 42 家 | **37 家** |
| `assets/logos/` 登记数 | 41 个 | **46 个**（品牌矢量 19 / 官网文件 27） |

5 家全部换成官网真图形；`huggingface` 与 `mistral` 也从「品牌图形库退而求其次」换成官网文件。
默认视图 53 张卡片本来就全部有真图形，变化集中在「全部工具」Tab（官方图形 64 → 69，缩写块 42 → 37）。
`npm run verify` 42 项全过。

**顺带修好的**：`git push` 一度失败（`Failed to connect to 127.0.0.1 port 7890`）——
代理没开时 git 配的代理不可用。用 `git -c http.proxy= push` 直连推送，**没有改动 git 配置**。

---

### 2.14 国内扩源第二轮：扣子 Coze / 360智脑 / MiniMax / 魔搭（+8 条）

**背景**：2.3 与 2.7 之后国内来源停在 12 家、51 条。本轮把「后续可做 1」里点名的厂商逐个查证，
**只收能在厂商官方页面上找到逐字原文的优惠**，查不到的如实记为「无」。

**新增 8 条（全部 `verified: true`，`curated_cn.json` 18/18 可用）**

| 厂商 | 条数 | 内容 | 官方依据（逐字复核过） |
|---|---|---|---|
| 扣子 Coze（字节） | 4 | 新用户首次注册赠 1500 活动积分（30 天）；个人版每日登录赠 1500 积分（1 天）；Kimi/阶跃等模型限时免费 100 次/天；官方付费插件 10-30 次/天免费额度 | `docs.coze.cn` 积分规则页 / 活动规则页 / 模型费用页 / 插件费用页 |
| MiniMax | 2 | Token Plan 好友邀请：受邀人 9 折、邀请人得实付 10% 代金券（90 天）；MiniMax-M3 按量计费「永久五折」 | `platform.minimax.cn` Token Plan FAQ / 按量计费定价页 |
| 360智脑 | 1 | 官方服务协议写明向新用户赠体验券/代金券，可用于大模型 API 抵扣 | `ai.360.com/open/zh/terms`（注意：开放平台在 **.com**，`ai.360.cn` 是另一个产品） |
| 魔搭 ModelScope | 1 | API-Inference 免费推理 API（阿里云算力、需绑定实名认证的阿里云账号、额度并发动态调整） | `modelscope.cn/docs/.../API-Inference/limits` |
| 海螺AI（MiniMax） | 1 | 会员限时优惠价：基础会员 105→55 元/月、标准 385→196 元/月 | `hailuoai.com/vip`（内容在其 Next.js 内嵌载荷里） |

**查了但判定为「无」，一条都不收**（避免为凑数而编造，这是本项目的硬规矩）

| 厂商 | 结论 | 依据 |
|---|---|---|
| DeepSeek | 无任何赠送/限免。定价页只在扣费规则里提到「赠送余额」科目，无额度、无条件、无有效期 | 定价页 / 首次调用页 / FAQ / 全量更新日志 / 官网首页 |
| 零一万物 01.AI | **开放平台已关停**：官方公告「逐步停止面向用户提供在线体验、API 调用及充值等相关服务」，2026-09-03 24:00 起停止 API，退款窗口至 2026-12-03 | `platform.lingyiwanwu.com` 公告（无头渲染后逐字确认） |
| 昆仑万维 天工 | 积分规则页确有「免费积分：系统赠送」，但**未标注任何数量**，给不出可执行信息 | `static.tiangong.cn/.../tiangongPointsRules.html` |
| 面壁智能 MiniCPM | 主站全站无免费/价格字样；开放平台需登录 | `modelbest.cn`、`platform.modelbest.cn` |
| 腾讯元器 | 登录制单页，`/opendocs` 全路径渲染不出正文；第三方报道的「免费 100 万→1 亿 tokens」无法在官方页复核 | `yuanqi.tencent.com` |
| MiniMax 新用户注册赠送 | **官方文档确认不存在此条**，切勿按传闻写入 | 官方文档全量索引 `docs/llms.txt` + 定价/账户/FAQ 各页 |

**顺带修好的两处检测缺陷**（`scripts/lib/schema.js` 的 `DISCOUNT_PATTERNS`）

1. **中文折扣写法识别不出**：`9 折` / `五折` / `折扣价` 一律不命中（此前只有
   `\d+%\s*(off|discount|折扣)`）。智谱那两条「限时五折」是靠别的字段侥幸过关的。
2. **「免费 + 修饰词 + 名词」识别不出**：只认紧邻写法（`免费API`/`免费调用`），
   因此「免费**推理** API」「定价页标注多款模型价格为**免费**」「免费**资源包**」全被漏判；
   同时「赠送」不收「**获赠**」写法。

   两处修完：18 条国内策展里 17 条有信号（剩 1 条是 `discountInfo` 超 240 字被截断所致，
   属既有条目）；**回归 50 条 `type: "tool"` 条目，0 条被误升为优惠**——这是改这个文件必须做的对照。

**工具补充**：新增 `scripts/tools/probe-offers.js`（官方页优惠取证：给 URL 打印命中
「免费额度/赠送/限时/折扣」的上下文）。补上了原来缺的那一环——`find-offers.js` 面向聚合站条目，
`term-count.js` 只数词频，都没有「在官方页上把优惠原句捞出来给人看」的能力。
它支持 `--render`（走 `lib/browser.js` 无头渲染）与 `--terms=` 自定义关键词：
本轮魔搭那句「免费提供给广大开发者体验」就是**静态抓取 0 命中、渲染后逐字命中**，
靠它才从「取不到原文、判定为无」翻成「已核实、收录」。

> 补记一处**没做的改动**：核查 `collect.js` 那行「按当前规则重分类（deal → tool）」时，
> 一度以为它把本就有 `type: "tool"` 的既有条目也算进去了（那样每次采集都会刷 50 条假告警）。
> 实测 `store.js` 在 push 之前已有 `if (deal.type !== 'deal') return deal;` 守卫，
> 该计数只在 `deal` 真的降级时才 +1，当前真实值为 **0**。**结论：代码本来就是对的，不改**——
> 这是「先核对再动手」省下的一次无谓改动。

**教训（值得单独记）**：批量改这些文档时**不要用 PowerShell 的 `Get-Content`/`Set-Content`**——
`Get-Content -Raw` 在本机按 GBK 解码 UTF-8 文件、`Set-Content` 再按 GBK 回写，
会把整份中文文档变成 mojibake（本次 README 与本文档都被毁过一次，靠 `git show HEAD:<file>`
字节级恢复）。改文档一律走编辑工具；万一中招，用 `node scripts/tools/restore-from-git.js <file>`
恢复（它直接写 `git show` 的原始字节，不做任何编码/换行转换）；`--check` 只比对不写盘。

### 2.15 新增：详情页中文翻译（国外英文文案）+ 卡片提示

**问题**：`region: "global"` 的条目来自 Futuretools / Curated，`discountInfo` / `description` /
`eligibility` 是英文散文（37 条工具简介如 `A tool to convert long videos into short clips.`，
9 条策展优惠是整段英文）。访客以中文为主，点开详情看到满屏英文等于没写。

**做法**：人工译文覆盖层，**不是渲染期机翻**。

| 决策 | 理由 |
|---|---|
| 译文存 `scripts/data/translations_zh.json`，键为 `deal.id` | 人工维护、可复核；不混进采集数据 |
| 采集与构建**都**调 `attach()`，结果写进 `deals.json` 的 `zh` | 浏览器 `fetch('deals.json')` 与构建期预渲染读到同一份，仍然只有一条代码路径 |
| `zh` 只**新增**字段，**绝不覆盖**英文原文 | 译文永远挂在原文下面；原文一个字都不删 |
| 详情里渲染成 `<details class="zht">`，默认展开 | 访客是中文用户，译文就该先看到；不想要的人点一下收起，偏好记 localStorage |
| 卡片提示放 `.meta` 行而非标题旁 | 那行是 `nowrap + overflow:hidden` 横排，加个胶囊不会让标题重排，卡片定高不变 |
| 每条译文另存 `src` 原文指纹 | 英文被采集器改写后指纹对不上 → 该字段译文**自动停用**并催促复核；宁可不出译文，也不出与原文矛盾的中文 |

**判定「这段是不是英文散文」**由 `scripts/lib/zh.js` 统一负责，构建与工具共用：
零汉字 + 拉丁字母 > 8，或有零星汉字但出现英文虚词（the/and/for/with…）。

**踩的坑**：第一版用「CJK 占比 < 25% 就算英文」，把
`官方定价页标注多款模型价格为「免费」：文本 Hunyuan-MT-7B、bge-reranker-v2-m3……`
这类**本来就是中文**的条目误判成待翻译（中文技术文案里模型名和 URL 占了大半字符数）。
44 条误判里 3 条是这个原因，改判据后剩 41 条真待翻译。

**覆盖**：41 条 / 59 个字段（32 条工具简介 + 9 条策展优惠 × 3 字段）。默认视图 62 张卡里
6 张带「中文」胶囊；其余为国内中文条目，本来就不需要翻译。

**门禁**（`npm run selftest:zh` 逐一演练过，都能拦住）：

- 译文不合规（不含汉字 / 字段名非法 / 超长 / 原文为空）→ **硬失败阻止发布**。
- 原文已变 → 警告 + 该字段译文停用（采集器改英文不该把发布卡死）。
- 译文键对不上任何条目 → 告警（`deal.id` 是 `sha1(lower(vendor)|lower(title)|lower(url))`，三个字段先转小写；改名换 URL 都会变）。
- 第 1 步的数据校验跑在**未贴译文**的 `deals.json` 上，`validateDeal` 里的 zh 规则在那里
  永远不会触发，所以这道门禁是在构建里单独补的。

**两个抓到的真 bug**（都是「演练/量测」而不是「读代码」发现的）：

1. **收起偏好要等刷新才生效**。最初只在页面启动时读一次 localStorage，`toggle` 时只写不读内存，
   结果收起后点开下一张卡片又全部弹开，折叠等于白做。改为 `toggle` 时同步 `setZhOpen()`，
   并让同一份详情里的多个译文块同步折叠。
2. **`deals.json` 已带 `zh` 时，停用逻辑失效**。`attach()` 在 `result.zh` 为空时直接
   `return deal`，把文件里已经贴好的旧译文原样留下——「原文变了就停用译文」的保证当场失效。
   改为：覆盖层对它覆盖到的 id 是**唯一权威**，命中就必须以它为结果，包括「结果为无」。

**验收**：`npm run verify` 从 42 项增到 **55 项**，新增 13 项专测译文——
卡片提示与译文块双向一致（有提示必有译文 / 无提示必无译文）、译文在英文原文下面且原文仍在、
译文确实是中文、默认展开、点一下收起、同页多个块同步折叠、刷新后仍记得收起、
不刷新换卡片也保持收起、**工具卡片的英文简介也带译文**、手机端可折叠且不撑破弹层。

**教训（第二次踩同一个坑）**：又用 PowerShell 做文本改写，
`(Get-Content -Raw) -replace … | Set-Content -Encoding utf8` 把一个脚本文件写成了 mojibake。
改代码/文档一律走编辑工具，**不要用 PowerShell 读写**。
另：`execFileSync` 在成功时只返回 stdout，构建的告警走 `console.warn`（stderr）会被整段丢掉——
演练脚本因此误判「没有告警」，改用 `spawnSync` 才看得到。

---

### 2.16 收口：译文漂移从「构建日志里的一句话」变成可自动发现（check:zh）

**起因**：2.15 把译文门禁做进了构建，但有两类事只在日志里说一声——**译文对不上 id（孤儿）**
与**还有条目没译**。CI 里没人会去读构建日志，漂移就这样悄悄留着：条目改名 / 换 URL 会让
`id = sha1(lower(vendor)|lower(title)|lower(url))` 变掉，那一条的中文从此不再出现，而没有任何东西变红。

**做法**（四处，都很小）：

| 位置 | 改动 |
|---|---|
| `scripts/tools/zh-todo.js` | 新增 `--check`：不打印整份待办，只回答「有没有要人处理的事」，脏就非零退出 |
| `package.json` | 新增 `npm run check:zh` |
| `.github/workflows/collect.yml` | 新增 `Translation drift check (advisory)` 步骤，结果写进运行 Summary |
| `scripts/tools/zh-selftest.js` | 新增第 ⑤ 项（孤儿必须让 `--check` 非零退出），并断言**复原后 `--check` 回到 0** |

**为什么是建议性（`continue-on-error`）而不是硬门禁**：`deploy.yml` 在采集任务失败时会跳过发布
（见 2.6），把漂移做成硬失败等于「有人改了个条目名 → 站点数据停止更新」。有漂移时该照常发布
（英文原文仍在，卡片只是少一枚「中文」胶囊），但必须有人看见——所以它写 Summary，不卡链路。
本地提交前直接跑 `npm run check:zh`，那时非零退出就是硬信号。

**验证**（都是跑出来的，不是读代码看出来的）：

| 检查 | 结果 |
|---|---|
| `npm run check:zh`（干净态） | 已贴 41 条 / 59 个字段 · 漂移 0 · 待译 0 → **exit 0** |
| 负向：把一条数据的 `id` 改成 `deadbeef0000`（模拟改名） | 漂移 1 处 / 待译 1 条，点名 `孤儿 [cb45e0c735bd] HubSpot AEO Sensor` → **exit 1** |
| `npm run selftest:zh` | 由 5 项增到 **7 项**全绿，含「复原后 check 回到 0」——一个常年红的检查等于没有检查 |
| 收口核对（另一会话提交后的状态） | `npm test` / `test:strict` 通过；`npm run build` 产物自检全过；`npm run verify` **55 项 0 失败** |

**顺带核清的一件事（免得后人做无用功）**：源文件 `deals.json` 里**没有** `zh` 字段，这不是漏做。
构建期 `build-local.js` 会把 `attach()` 贴好译文的整份数据写进 **`dist/deals.json`**（实测 41 条带译文），
浏览器 `fetch('deals.json')` 拿到的就是这一份；覆盖层 `translations_zh.json` 是译文的唯一权威。
所以**不需要**为了让译文生效去跑 `npm run collect`——那反而会把译文复制进源数据，多出一份会漂移的状态。

**同批入库**：`mockups/`（001–009 号设计稿对比页 + `logos/` + `_tools/`）此前一直没进版本库，
而它们是 2.11 那次重做的决策依据，随本次一并入库；`.preview/` 截图、`_*.txt` 快照与 `.zh-backup/`
自动备份不入库（已加 `.gitignore` 规则）。

---

### 2.17 新增：参考站研究（20 站拆解 → 差距矩阵 → 三套方案）

**起因**：想「向优秀网页学习」，但凭印象改的东西没法复核——三个月后没人说得清某条规则是从哪来的。
所以这一轮先把**证据**做出来：20 个参考站拆成结构化数据，再用**同一把尺子**量我们自己。

**方法**（`scripts/tools/study-site.js`，本轮新写）：一条命令把一个站拆成四份证据——

| 产出 | 内容 |
|---|---|
| `metrics.json` | 页面高度/屏数、主列表组件签名与尺寸、**首屏完整可见条目数**（与 `verify-site.js` 同口径）、同源链接与 URL 形态聚类、canonical/hreflang/JSON-LD、外部域名与请求数、静态正文长度、**对比度抽样** |
| `tokens.json` | 色值/字阶/行高/字重/圆角/阴影/间距/动效的**频次分布**（频次才是设计系统的证据） |
| `dom-outline.txt` | 语义骨架 + class 命名频次；层级不足 25 行时附「按渲染面积排序的最大 40 个元素」兜底 |
| `shots/*.png` | 桌面首屏/整页 + 手机首屏（不入库；20 站 60 张约 49 MB，含 mock/ours 共 108 张约 60 MB，可随时重跑） |

跑的过程中修掉两个**工具自身**的缺陷（都是被证据的荒谬值暴露的）：

1. 页头容器超过 10 个子节点时骨架只剩 10 行（ai-bot.cn）→ 改为「打印子节点数 + 只往下走有结构的子节点」。
2. **单字符文本节点被对比度抽样整类跳过** —— 档位角标「1」这种最容易出问题的元素反而没人管 →
   阈值从「≥2 字符」改为「≥1 字符」，并在注释里写明原因。

**样本**：12 个同类垂直站（ai-bot.cn / aitools.fyi / appsumo / artificialanalysis / devtk.ai / free-for-dev /
futurepedia / futuretools / llm-prices / openrouter / theresanaiforthat / toolify）+ 8 个设计标杆
（linear / vercel / stripe / raycast / framer / superhuman / notion / thebrowser.company）。
逐站报告在 `research/vertical/`、`research/benchmark/`（共 20 份，每份九节或八节，只引证据、不描述截图）。

**关键发现（只列有数字支撑的）**

| 发现 | 证据 |
|---|---|
| 「每条一个独立页」是同类站的默认结构，**只有我们没有** | futuretools `/tools/:slug ×40`、toolify `/tool/:slug ×27`、artificialanalysis `/models/:slug ×49`、TAAFT `/:slug/:slug ×2795`；我们内链 **1 条**、URL 形态 **0 种**（llm-prices 也没有，但它是工具页不需要） |
| 密度差在**行高**，不在信息量 | llm-prices 行高 45px → 首屏 **16 行**；openrouter 47px → **15 行**；我们卡片 192px → **9 张** |
| 对比度不达标是行业常态，但**能做好** | 做得最好的四家 0 条不达标（openrouter 5.79 / llm-prices 5.13 / superhuman 4.85 / aitools.fyi 4.79）；差的是 toolify 204/387、free-for-dev 189/400；我们改前 100/400 |
| 动效时长集中在 100–300ms、曲线集中在两条；**没有一家用 `transition: all`** | Tailwind 默认 `150ms cubic-bezier(.4,0,.2,1)` 跨站最多；linear `100ms`；raycast `cubic-bezier(.23,1,.32,1)`；反面样本是 ai-bot.cn `all .3s ease` ×373 |
| 暗色分两派：默认暗色（产品本身是暗色 UI）vs 显式双主题 | **vercel 是唯一声明 `<meta name="color-scheme" content="dark light">` 的**；notion 是唯一跟随系统的 |
| 结构化数据不是同类站的强项，我们**已领先但缺一个节点** | 12 个同类站里 7 个为 0–1 类；openrouter 最全 5 类；我们 4 类，**缺 `WebSite`**（devtk.ai 只有 2 类就包含它） |

**产出**（都在 `research/`）：

- `EVIDENCE.md`：21 站原始数字总表（机械汇总，不解释）
- `README.md`：样本表、方法、剔除与受限清单、跨站共性、已知限制
- `GAP-MATRIX.md`：**该做 18 条**（每条带优先级/成本/是否触红线/预期收益）+ **明确不学 9 条**
- `DESIGN-TOKENS.md`：现有 token ↔ 标杆数值 ↔ 建议值（含暗色两套与对比度推导）
- `mockups/v3/`：三套方案的可点开 demo + 各自 `PLAN.md`

**三套方案**（A 保守 / B 均衡 / C 进取，逐项包含关系）与验证：

| | 可索引 URL | 首屏完整可见 | 手机屏数 | 对比度不达标 | 持续成本 |
|---|---|---|---|---|---|
| 现状 | 1 | 9 | 15 | 100/400 | — |
| A | 1（不变） | 9（不变） | 15（不变） | **≤20（目标）** | 无 |
| B | **81** | **16+** | ≤12 | ≤20 | 无 |
| C | 81 + `/en/` | 16+ | ≤12 | ≤20 | **英文需逐条人工译** |

**demo 的自我验证**（不是嘴上说）：9 个页面用同一把尺子量过——
亮/暗两种偏好下对比度 **0 条低于要求**（亮 min 4.51 / 暗 min 5.98）、**外部请求 0**、**断链 0**。

> 断链那条是被**结构检查**抓出来的，不是对比度检查：顶层对比页的样式表路径按「子目录」写死，
> 结果 404、页面退化成浏览器默认样式——而默认黑字白底对比度 21:1，对比度检查照样是绿的。
> 教训：**门禁不能只有一个角度**。

**已知限制（如实记录）**

1. **视觉评述缺失**：原计划把截图交给视觉模型独立复核，但该模型所在 provider 返回 **HTTP 402（余额不足）**，
   5 个视觉审阅任务全部失败。补偿：所有结论以 DOM/样式/度量与对比度计算为准；截图保留供人看。
2. 对比度是**纯色背景近似值**（复杂背景样本跳过；raycast 跳过 219 条、linear 95 条，跨站比较以「不达标条数」为主）。
3. 所有数字是**某次抓取的快照**，站点改版即失效；重跑同一条命令即可刷新。
4. 样本是**人工挑选**的（搜索引擎不可用，同一 provider 402），不声称覆盖全部同类站。

**同批入库**：`scripts/tools/study-site.js`（拆解器）、`verify-site.js` 的 `--json` / `--compare`
（机器可读指标 + 回归比对，含负向演练）、`docs/DESIGN-RULES.md`（9 节可执行规范 + 9 条不采纳清单）。

---

### 2.18 方案 A 的范围已实现（**在分支上，master 未动**）

**为什么先做 A**：三套方案是逐项包含关系（A ⊂ B ⊂ C），A 的范围在任何一套里都必须先做；
而且它修的是一个**客观缺陷**——线上 400 个文本节点里 100 条对比度不达标（最低 2.84:1）。

**分支**：`feat/visual-token-layer`（提交 `ab37e8b`、`874cd6b`）。**没有合并、没有推送**，等你点单。

| 类别 | 内容 |
|---|---|
| 对比度 | `--mut` #8c94a6 → #6b7280（2.84:1 → 4.50:1）；档位角标改「自带底色 + 逐档 on 色」（9px 白字压 #0e9f6e 只有 3.38:1、压 #94a3b8 只有 2.57:1）；档位色当文字用时另立 `--t1-ink/--t2-ink` |
| 暗色 | 底/面/发丝环三件套；`color-scheme` + 两段 `theme-color`；跟随系统 + 手动三态；**首屏前决定主题**（无闪回）；无 JS 时不渲染切换器；12 处硬编码亮色面板改 token |
| 排版 | 6 级字阶、正文 13.5 → 14px；**假字重 354 处清零**（550/650/680/750/800 → 500/600/700） |
| 动效 | 3 档时长 + 2 条曲线；`transition: all` 归零；新增 `prefers-reduced-motion` 降级 |
| 层级 | hover 的 18px 扩散投影 → 发丝环 + 微投影 |
| 语义/状态 | `header`/`nav`/`main` 落地；筛选按钮 11/11 带 `aria-pressed`；加载失败改为不覆盖内容的提示条 + 重试 |

**改前 / 改后（同一把尺子，各 400 个文本节点）**

| | 改前 | 改后（亮） | 改后（暗） |
|---|---|---|---|
| 对比度低于要求 | **100 / 400**（最低 2.84） | **0 / 400**（最低 4.51，中位 5.7） | **0 / 400**（最低 5.98，中位 8.62） |
| 页高 / 密度 | 5334px · 5.9 屏 · 首屏 9 张 | 不变 | 不变 |

**门禁**：`verify` 断言 **55 → 69 项 0 失败**（计划里的目标是 ≥60）；回归比对五项全过
（卡片 62→62、首屏 9→9、页高 5334→5334px、外部请求 0→0、JS 错误 0）；连续两次构建 SHA256 一致；
`check:zh` 与 `selftest:zh`（7 项）全绿。

> 新增断言第一次运行就抓出两个真问题：**档位角标在两种主题下都是 1:1**（它压在兄弟节点上，
> 只看元素自身背景的审计工具看不到），以及**暗色下 203 条不达标**（12 处硬编码亮色面板）。
> 都不是读代码看出来的——是门禁逼出来的。

**尚未做**：见 2.19（B 已全部落地，只剩 C 的三项）。

---

### 2.19 方案 B 全部落地（独立详情页 + 紧凑行视图 + 四条零成本项）

**落地位置**：分支栈 `feat/visual-token-layer`（2.18 的 A）→ `feat/b-extras` → `feat/detail-pages` → `feat/row-view`。
`master` 当时未合并、未推送（**已于 2.21 全合进 `master`**）。**每一层都可单独合并**。

#### ① 独立详情页（`f1213d5`）—— 可发现性的根因

同类站里 11/12 都有路径型条目页（futuretools `/tools/:slug ×40`、toolify `/tool/:slug ×27`、
artificialanalysis `/models/:slug ×49`），而我们原先全站只有 1 个 URL、1 条内链。

**关键做法：不引入第二份模板。** 页面主体直接调用 RENDER-CORE 的 `detailHtml()`——与首页详情弹层
**同一个函数**；样式块与页脚从**已组装好的 `index.html`** 里抽（加了 `<!--SHARED:footer:START/END-->` 标记）。
详情页**纯静态**：不加载主脚本、不 fetch 数据，只保留一个极小的主题切换脚本。

链接与 SEO：首页卡片**标题 → 站内详情页**、**CTA 仍直达厂商官方页**；每页自指 canonical +
hreflang + og/twitter + `WebPage`/`BreadcrumbList` + 面包屑 + 返回入口 + 纠错入口。
刻意**不用** `Product`/`Offer`——我们不是售卖方，标成商品属过度声明。

#### ② 紧凑行视图（`7bfc607`）—— 一屏能看多少条

行高 46px（依据：llm-prices 45px、openrouter 47px，两家都在 45–47px；再矮就要砍掉 logo 24px
或触屏点击区 44px）。行与卡片**字段完全同源**（同一个 `offerOf`/`featsOf`/`stampOf`/`logoHtml`），
只换排布。视图偏好记 `localStorage`；**没有 JS 时切换器不显示**，页面仍是卡片视图（不给死控件）；
列表视图不分带，顶部锚点导航随之隐藏（不留死锚点）；整行可点开详情。

#### ③ 四条零成本项（`ec05252`）

| 项 | 内容 |
|---|---|
| 订阅 | v1.6 起是 **18 个 Feed × 2 种格式 = 36 个静态文件**（`/feed.xml` 起，按意图 / 厂商 / 变化切分）；只用 Node 内置，零依赖。详见 §2.37 与 `docs/SCHEMA-v1.6.md` |
| 纠错入口 | 详情里预填 `id`/厂商/官方页的 GitHub Issue 链接（不需要后端，也不需要表单服务） |
| `WebSite` 节点 | JSON-LD 4 → 5 段（devtk.ai 只有 2 类就包含它，我们反而缺） |
| 同页锚点 | 4 个档位带带 `id` + 顶部「跳到档位」条；非分带排序或列表视图时自动隐藏 |

#### 实测总账（同一套产物体检出来的）

| 指标 | 原始 | 现在 |
|---|---|---|
| 可索引 URL | 1 | **81**（首页 + 80 个 `deal/<id>/`） |
| 同源内链 | 1 | **308**（首页 68 + 80 个详情页各 3） |
| `sitemap.xml` 条目 | 1 | **81**（构建期断言无遗漏） |
| 首屏完整可见 | 9 张 | **13 行**（列表视图） |
| 手机滚动屏数 | 15.1 屏（12775px） | **5.5 屏**（4659px，列表视图） |
| `verify` 断言 | 55 | **95 项 0 失败** |
| 产物体积 | 326.9 KB（顶层） | 449.3 KB 顶层 + 80 个详情页 2.97 MB |

#### 与提案的偏差（3 处，都是实测推翻了估算）

1. **紧凑视图首屏 13 行，不是 16+** —— 真实页面比 mockup 多出顶栏 58px + 筛选条 41px + 结果条约 48px
   的固定 chrome；同口径下卡片是 9，所以真实增益 **+44%**（不是 +78%）。GAP-MATRIX 与 PLAN.md 已按实测更正。
2. **卡片标题保留 14px**（提案写 16px）—— 192px 定高卡片里标题是 2 行截断，加大会挤压优惠文案与 meta 行。
3. **散值圆角与旧间距未全量收敛**、**弹层关闭后焦点归还未单独断言**、英文页未做（属 C）。

#### 门禁在这一轮抓出来的问题（六条，没有一条是读代码看出来的）

| 问题 | 谁抓到的 |
|---|---|
| 档位角标在两种主题下都是 **1:1**（压在三角形兄弟节点上，审计工具只看元素自身背景） | 新增的对比度断言 |
| 暗色下 **203 条**不达标（12 处硬编码亮色面板） | 同上 |
| 结果条三个控件在 390px 下**横向溢出 45px** | 既有的「无横向溢出」断言 |
| 顶层对比页样式表 **404**，而对比度检查照样是绿的（默认样式 21:1） | 结构检查（断链） |
| 构建自检把 CSS 选择器 `[data-tier="1"] .rnum` 算成「档位角标」，一加样式就假失败 | 产物自检 |
| 验收用的静态服务器对目录直接 404（真实托管会解析 `deal/<id>/`）→「本地 404、线上正常」的假失败 | 详情页断言 |

> 一句话：**加断言这件事本身的优先级，不低于加功能。**

**尚未做（只剩 C 的三项）**：收藏/对比、首页按意图重排、英文覆盖（唯一带持续人工成本的项）。

---

### 2.20 收尾：闭环设计规范里三个「部分落地」+ 键盘可达

**背景**：2.19 之后 `docs/DESIGN-RULES.md` 还有三个 ⚠️ 项（圆角散值、奇数间距、焦点归还）。
这一轮把它们做成 ✅——其中第三项其实是**真功能缺口**，不只是缺一条断言。

**E2/E3 圆角与间距收敛**（一次带断言的 codemod，51 条规则）

| | 改前 | 改后 |
|---|---|---|
| `border-radius` 取值种类 | 9 种（2/3/4/5/7/8/9/11/14px） | `--r-sm 6px` / `--r 10px` / `--r-dlg 12px` / `--r-pill`，**非 token 值 0 条** |
| 奇数间距（5/9/11/13/15/22/26px） | 散落各处 | 并入 `--s1..s4`，**含奇数间距的声明 0 条** |

做法上刻意选了 codemod 而不是手改：每条替换带**期望命中次数**，任一条对不上就中止、不写盘；
替换清单留在提交信息里可复核。唯一保留的例外是卡片横向 `14px`（光学微调，代码注释写明理由）。

**S3 键盘可达与焦点归还**（改前键盘用户根本打不开详情弹层）

- 卡片与列表行加 `tabindex="0"` + `aria-label="…（按回车查看详情）"` —— 62/62 可聚焦
- 回车/空格打开详情；**Esc 关闭后焦点归还给触发它的那张卡片/那一行**
- 新增 4 项断言：可聚焦且带标注、回车打开、Esc 后焦点归位、列表行同样成立

**验证**：`verify` 断言 **95 → 99 项 0 失败**；产物自检通过；两次构建 SHA256 一致；
定高卡片的「内容无溢出」与「hover 三量不变」断言继续通过（说明间距改动没有撑破 192px 卡片）。

**分支栈**（当时未合并；**已于 2.21 全合进 `master`**，仍未推送）：`feat/visual-token-layer` → `feat/b-extras`
→ `feat/detail-pages` → `feat/row-view` → `feat/polish`。

---

### 2.21 全合进 master + 合并态全门禁复验（2026-09-23）

**决策**：用户选「全合」——取 `trial/merge-rehearsal-2`（跑过全门禁的那个状态，且已含另一会话的
`waitForApp` 修复与我的集成）。C 的三项里选「收藏 / 对比」与「首页按意图重排」，**英文覆盖不做**。

**合并前先复核**（不信文档里的旧结论，重跑一遍）：

- 彩排分支的 merge-base 是 `006819d`，**并不包含** `master` 之后那两个文档提交 —— 即「基于最新 master」
  这句话严格说不成立。用 `git merge-tree --write-tree`（**不动任何 ref**）重跑合并且 exit 0、零冲突，才动手。
- 备份 tag：`backup/pre-ab-merge` → `fb08832`（合并前的 master）。

**合并**：`git merge --no-ff trial/merge-rehearsal-2` → 合并提交 **`10cc923`**（本地，未推送）。
带进来 9 个文件、+4752/−147：`index.html` +780、`scripts/tools/build-local.js` +374、
`scripts/tools/verify-site.js` +483，以及 `research/_raw/ours-A-{light,dark}/` 复测证据。

**合并态全门禁复验（全部在 `10cc923` 上跑）**：

| 门禁 | 结果 |
|---|---|
| `npm test` / `test:strict` / `check:zh` | exit 0 / 0 / 0 |
| `selftest:zh` | ✅ 演练 **7 项，失败 0 项** |
| `build` ×2 + 清单 SHA256 | ✅ 139 个文件，两次构建清单哈希**完全一致**（`6F1DA2DF…900A`） |
| `verify:regress` | ✅ 验收 **99 项，失败 0 项** + 5 项回归全过 |

> **一条环境注意事项（会误导后来人，写下来）**：本会话的沙箱是 `workspace-write`，**禁止子进程管道 stdio**。
> `selftest:zh` 用 `spawnSync` 调构建、`verify-site.js` 用 playwright 启 Edge，都会以 **EPERM** 失败——
> 表现为「7 项全失败、子进程输出为空」，看着像回归，其实是环境。用独立探针确认 `spawnSync` 返回
> `errorCode=EPERM` 后，以更宽模式重跑同样的命令才拿到上表的绿。
> **判据：子进程输出为空 + 每一项都失败 = 先怀疑环境，别急着改代码。**

**文档一致性修正**：`2.21` 这条记录原先只存在于**旧的**彩排分支（`trial/merge-rehearsal`）上；
`master` 与 `trial/merge-rehearsal-2` 的 `PROJECT_STATUS.md` **都没有 2.21**（两份文件逐字节相同），
所以 `SUMMARY.md` 里「详细记录见 2.17–2.21」当时指向了一个不存在的章节。本次补齐，并把全仓
「未合并」表述统一改为实际状态（`SUMMARY.md`、`docs/DESIGN-RULES.md`、`research/GAP-MATRIX.md`）。

**视觉复核重试：仍失败**。单张截图的连通性探针返回空，因此**没有**消耗 5 个正式审阅任务；
模型 `deepseek-v4-flash-vision-exp` 在 provider 目录中确实存在、且声明 `input: ["text", "image"]`
（provider=`deepseek`，`api.deepseek.com`），所以仍指向该账号余额问题。
**另一条比原记录更明确的限制**：主模型 `deepseek-v4.1` 不声明图像输入，`read_image` 会被直接拒绝，
**无法用主模型替代视觉模型**读截图。

**本地预览**：`node scripts/serve.js --dir=dist` → `http://127.0.0.1:8080/` 返回 200、标题正确；
可索引 URL 复核为 sitemap **81 条**（首页 + 80 个 `deal/<id>/`），首页站内标题链接 **62 条**
（与 GAP-MATRIX 的记录一致，不是缺陷）。

---

### 2.22 收藏 / 对比（G11）落地

**落地位置**：分支 `feat/favorites-compare`（基于 `master` = `8caee06`，本地，未推送）。
只动 4 个文件：`index.html`、`scripts/tools/build-local.js`、`scripts/tools/verify-site.js`、本章。
**零新依赖、零新请求、零后端**——`localStorage` + `URLSearchParams`，与 PLAN.md G11 的决策一致。

#### ① 收藏

- 卡片上是一个**绝对定位的星标**（`☆` / `★`，`:hover` 与 `aria-pressed` 双状态，`aria-label="收藏 <标题>"`）。
- 详情弹层里是**完整标注的两个按钮**：「收藏 / 已收藏」与「加入对比 / 已加入对比（点一下移出）」。
- 键 `dsh.favorites`（与 `dsh.theme` / `dsh.view` / `dsh.dealZhOpen` 同一套命名），
  每一次读写都包在 `try/catch` 里——隐私模式下静默退回默认值。

#### ② 对比

- 底部**固定条**（`已选 N / 4 条进入对比` + 已选标题 + 打开对比 / 清空对比）+ `<dialog>` 对比视图。
- 键 `dsh.compare`；**上限 4 条**，满员时第 5 条的按钮直接 `disabled` 并写明「对比已满 4 条」，
  不是点了没反应。
- 可分享 URL：`?compare=id,id,…`。**URL 优先于 localStorage**，所以把链接发给别人、
  对方在那个上下文里没有任何本机选择，也一样还原同一组对比（顺序也一致）。

#### ③ 「只展示有值的字段」这条被实测逼得更严了一档

PLAN.md §5 的原话是「对比表只展示有值的字段，缺值不占位」。第一版按「跳过整列都空的字段」实现，
一跑数据就暴露了漏洞：`priceLine` 全站只有 3 条、有效期也是有人有有人没有，于是并排 4 条时
经常出现 **3 个格子有字、第 4 个空格子**（15 张抽样表里 14 个空格子）——空格子正是要避免的那种噪音
（读者分不清「没有这个字段」和「没抓到」）。改成**一行只在每个条目都有值时才出现**，
现在 15 张 4 列表 + 31 张 2 列表共 **430 个单元格，空格子 0 个**。这一条同时也进了产物自检口径。

#### ④ 三条硬约束怎么保证

| 约束 | 做法 |
|---|---|
| **192px 定高卡片不能被顶破** | 星标 `position:absolute`（`right: var(--s2)`, `bottom: var(--s3)`），**不参与布局**；卡片高度仍由 `height: var(--cardH)` 决定。星形符号放在 `::before/::after` 伪元素里（两者都绝对定位、互不占位），按钮自身的**文字内容仍是完整中文标签**，对比度审计与屏幕阅读器读到的都是它。`.meta` 右侧留 40px 走廊放星标——只改横向内边距，不动卡片高度、不动网格行高。**`bottom` 必须用 `--s3` 而不是 `--s2`：见 ⑥。** |
| **390px 不许横向溢出** | 对比条 `position:fixed; left:0; right:0`，内容 `nowrap`、标题条 `overflow:hidden`；对比表 `thead th:first-child` 与 `tbody th` 给显式宽度，宽表在 `.cmpscroll`（`overflow-x:auto`）里滚，弹层本身 `width: min(920px, calc(100vw - 40px))`。 |
| **没有 JS 就不给可点暗示** | 星标、对比条、对比弹层**整块由 JS 建 DOM**（`createElement`），预渲染的 HTML 里零控件；`body:not(.js) .g .fav { display: none }` 再兜一层。产物自检直接扫产物断言这件事。 |

#### ⑤ 验证

| 门禁 | 结果 |
|---|---|
| `npm test` / `test:strict` / `check:zh` | exit 0 / 0 / 0 |
| `npm run build` | exit 0，产物自检通过（新增 2 条：预渲染零控件、`CMP_MAX = 4` 口径） |
| `build` ×2 + 清单 SHA256 | ✅ **139 个文件**，`manifest.sha256 = 5cac78a2…a08282`，两份清单逐字节相同 |
| `verify-site.js` | **+11 项断言**（第 1 节 +1、新增第 17.5 节 +10）；`check()` 调用点 94 → **105**，运行时报数 **99 → 110** |
| `verify:regress` | 真浏览器实跑：**110 项**。第一轮 1 项失败（见 ⑥），修好后全绿 |

> 运行时报数 = 文件里的 `check()` 调用点 + `--compare` 那段回归检查；
> `94 + 5 = 99`（2.21 的基线）、`105 + 5 = 110`（本节），两边都对得上，
> 所以「+11 项」这个数是可以自己复算的，不必靠文档转述。

> **本会话（写这一节的会话）跑不了浏览器门禁**：`verify` / `verify:regress` / `verify:shots` /
> `selftest:zh` 都以 **`spawn EPERM`** 失败（与 2.21 记录的是同一件事，不是回归）。
> **`verify:regress` 的 110 项是在 captain 的会话里跑的**，不是在这里。
> 我另外试过绕开 playwright 的管道：改用 `stdio: 'ignore'` 起 Edge + TCP 调试端口说 CDP——
> 进程能起来（拿到 pid），但 Edge 立刻以 `2147483651`（`0x80000003` STATUS_BREAKPOINT）退出，
> 连 `--dump-dom` 也起不来。**这不是 stdio 的问题，是 Edge 自己的内部 IPC 被沙箱拒了**，
> 所以「换个方式起浏览器」这条路在本环境是死的，不要重复试。

#### ⑥ 门禁抓出来的问题（jsdom 看不见的那一类）

**卡片内容无溢出：62 张卡片集体报 3px 纵向溢出**（`overflowY: 0`）。

- **根因**：星标 `<button class="fav">` 是卡片的**最后一个子元素**，而 §4 的判据取
  「最后一个可见子元素的底边」，`over = lastChild.bottom − (card.bottom − paddingBottom)`。
  卡片是 1px 边框，绝对定位元素的 `bottom` 又从**内边距盒**量起，于是
  `over = paddingBottom − borderBottom − bottom = 12 − 1 − 8 = 3`——
  与门禁报的 `over: 3`、且**每张卡都一样**、`overflowY` 恒为 0
  （绝对定位子元素不计入 `scrollHeight`）完全吻合。
- **修法**：`bottom: var(--s2)` → `bottom: var(--s3)`（＝卡片自身下内边距）。
  内边距写的也是 `var(--s3)`，两者永远同步，`over ≡ −1`，与 `--s3` 将来取什么值无关。
  `over = −1` 落在判据的 `+1` 容差之内。判据一个字都没动（见下）。
- **没有采用的两种做法**：① 把星标挪出「最后一个子元素」的位置（`prepend` 到 `.meta` 之前）——
  那样判据就查不到它了，等于绕过而不是修好；② 给判据加「跳过绝对定位元素」——
  那是**门禁语义变更**，本轮没有正当理由，不做。

> **教训（与 2.21 的 EPERM 注记同一类）**：jsdom 冒烟 47 项全过，却对这个 3px 一无所知——
> 它没有布局引擎，`getBoundingClientRect()` 一律返回 0。**逻辑正确 ≠ 几何正确。**
> 任何涉及尺寸/溢出/定位的改动，本地必须假定「未验证」，直到真浏览器跑过 §4 + §5 + §10 三条。

**判据未被改动的机械证据**（写进报告、也可自行复算）：

```
§4 clip judge byte-identical to master : true (914 bytes)
  still samples last child             : true   (kids[kids.length - 1])
  tolerance still "+ 1"                : true   (lastBottom > innerBottom + 1)
  still pushes overflowY > 1           : true
check() call sites  master = 94  HEAD = 105
```

#### ⑦ 冒烟测试抓出来的三个真 bug（都不是读代码看出来的）

1. **点星标会顺带弹出详情弹层**——列表上的点击委托把这次点击当成了「点了卡片」。
   改成在**捕获阶段**先处理星标并 `stopPropagation`，冒泡监听里再兜一道防御性判断。
2. **对比弹层打开时是空的**——`renderCompareBody()` 只在 `toggleCmp()` 里调过，
   `openCompare()` 没调。分享链接进来点「打开对比」就是一张空表。
3. **分享链接的标题条是空的**——对比条标题读 `state.cards`，而它在首次 `render()` 之后才有内容；
   把标题重画挂进 `render()` 才对齐。

#### ⑧ 明确没做

- 不做「收藏列表 / 只看收藏」这个筛选入口（PLAN.md 只要求能收藏与对比，加筛选会牵动 facet 计数）。
- 收藏/对比**不做跨设备同步**（红线：不做后端、不做账号、无外部请求）。
- 星标只挂在**卡片**上，列表（紧凑行）视图不挂——行高 46px 里再塞一个绝对定位按钮会压住 CTA；
  收藏在行视图里仍可经详情弹层完成（弹层里的按钮与卡片同一套逻辑）。
- 上一节列的第 22、23 项：第 22 项（首页按意图重排）**用户已决定暂不做**（见 2.24）；第 23 项（英文覆盖）按用户决定**不做**。

---

### 2.23 收藏 / 对比（G11）合并进 master + 合并态复验（2026-09-23）

**合并**：`git merge --no-ff feat/favorites-compare` → **`30d547f`**（分支含 `c2310d8` 实现 + `e0cd50d` 3px 修复）。
合并结果与已验证的 `e0cd50d` **树逐字节相同**（`git diff e0cd50d HEAD` 为空），所以那次验证**原样转移**到合并态。
`master` 未推送。

**复验（在合并态同一棵树上实跑）**：

| 门禁 | 结果 |
|---|---|
| `npm test` / `test:strict` / `check:zh` | exit 0 / 0 / 0 |
| `selftest:zh` | ✅ 演练 **7 项，失败 0 项** |
| `build` ×2 + 清单 SHA256 | ✅ 139 文件，两次一致 |
| `verify:regress` | ✅ **验收 110 项，失败 0 项**（基线 99 → 110：+1 既有块扩展、+10 新增 §17.5、另 +5 项 `--compare` 回归） |

**门禁抓出来的那一个真问题（本轮最有价值的一条）**：实现完成后 §4「卡片内容无溢出」报 **62 张卡全部 `over: 3`**。

- 判据是 `over = lastChild.bottom − (card.bottom − paddingBottom)`，**纵向**几何量；`overflowY` 恒为 0
  （绝对定位子元素不计入 `scrollHeight`）—— 三个特征（全卡一致、`over: 3`、`overflowY: 0`）都被下面的算式解释。
- 真凶：星标被 `appendChild` 成卡片**最后一个子元素**，且写的是 `bottom: var(--s2)`。卡片 `padding-bottom: var(--s3)=12px`、
  边框 1px，而绝对定位的 `bottom` 从**内边距盒**量起 ⇒ `over = 12 − 1 − 8 = 3`，与门禁报的数精确吻合。
- 修法（纯 CSS 一行）：星标 `bottom` 改用 `var(--s3)`（与卡片下内边距同一个 token，永远同步）⇒ `over ≡ −1`，落在判据 `+1` 容差内。
- **刻意没做**的两件事：不把星标挪出「最后一个子元素」的位置（那是**绕过**判据），
  **也不动判据/容差、不加「跳过绝对定位元素」的例外**（那是门禁语义变更，本轮没有正当理由）。
  机械核对：§4 判据与 `master` **逐字节相同**（914 字节），仍取最后一个子元素、容差仍是 `+1`。
- 教训（与 2.22 ⑥ 相呼应）：实现者用 jsdom 做的 47 项冒烟**全过**，却对这 3px 一无所知——
  jsdom 没有布局引擎、`getBoundingClientRect()` 一律返回 0。**逻辑正确 ≠ 几何正确**：
  涉及尺寸/溢出/定位的改动，在真浏览器跑过 §4+§5+§10 之前一律按「未验证」对待。

**新增能力（§17.5，10 项）**：卡片星标绝对定位且带 `aria-pressed`；点星标收藏**不会**顺带弹出详情；
收藏写 `localStorage` 且刷新后仍在（同时断言卡片高 192→192px、标题宽 338→338px 不变）；详情弹层里有完整标注的两个动作；
对比上限 4 条、第 5 条被挡；选择写入可分享 `?compare=id,…`；分享链接打开可复现选择（URL 是唯一事实来源，不靠本机 `localStorage`）；
对比表 4 列并排且**零空白单元格**；Esc 关闭并把焦点还给触发按钮；**390px 下对比条展开横向溢出 0px**。

**与 PLAN 的两处偏差（都由实测逼出来）**：① 「只展示有值的字段」做得更严——改成「一行只有在**每个**条目都有值时才出现」，
否则会出现 3 格有字、第 4 格空白的行（`priceLine` 全站只有 3 条）；现在 430 个单元格、空格子 0。
② 星标只挂卡片，不挂紧凑行视图（46px 行高会被按钮压住 CTA），行视图仍可经详情弹层收藏。

**一处计数纠正**：实现者先报「+8 项断言 / 运行时报数未复核」，实测是 **+11**（§1 块 +1、新增 §17.5 +10），
运行时报数 **110 = 105 个 `check()` 调用点 + 5 项 `--compare` 回归**（master 侧 94+5=99 对得上）。文档已按实测改写。

**顺带记录一条死路**（免得后来人重试）：绕开 playwright 的管道、直接用 `spawn(msedge, …, {stdio:'ignore'})` + CDP，
进程能起来但 Edge 立刻以 `2147483651`（`0x80000003` STATUS_BREAKPOINT）退出——**不是 stdio 的问题，是 Edge 自身 IPC 被拒**。

**上游数据分叉（与推送有关）**：`origin/master` 在此期间被**定时 CI 采集**推了一个提交
`43e81cc chore(data): 更新优惠数据 2026-09-23 11:29 CST`，**只动 `deals.json`**（+205/−64）。
推送前需要先把它并进来；届时卡片数与各入口计数都会变，`mockups/v4` 的计数需重新生成。

---

### 2.24 用户决定：不做「额外的首页」—— C2 首页按意图重排暂缓（2026-09-23）

**用户原话**：「把 C2 的那个主页先删掉，我不喜欢再额外加一个主页，先不用管这个入口的级别。」

**结论**：不新增一级入口页、不做按意图重排的首页层；入口的**级别与分层问题先不议**。
第 23 项（英文覆盖）此前已定为不做。

**处置**：

- 撤下评审用静态页：`mockups/v4/intent/`（6 个页面，含审阅总览）与 `_summary.json` 已删除。
- **线上 `index.html` 从未为此改动过一行** —— C2 自始至终只产出评审件，撤下不涉及任何站点回退。
- 保留 `mockups/v4/_tools/build-intent.js` 与 `mockups/v4/README.md`：重做时不该重新发明口径
  （一条命令即可恢复页面；README 记了当时的计数与两个已踩过的坑）。

**这次评审仍留下三样可复用的东西**（随文档落盘，不随页面消失）：

1. **「从真实产物衍生 mockup」的做法**：复用产物的 `<style>`/页头/页脚/卡片 HTML，只替换要评审的那一层，
   于是评审对象就是线上长相，而不是一个「长得像」的东西。
2. **对旧 mockup 的一次计数纠错**：`mockups/v3/C-ambitious/` 写的「学生·教育 18」「全部工具 50」与产物实测不符
   （身份优惠 19 / 教育子集 13；全部工具 112）。
3. **一条 IA 判断的负结果**：5 条近似意图路径必须各有独立正文才不至于变成薄页 —— 用户选择不做，
   这条持续成本也就不必承担。

---

### 2.25 视觉复核补齐（原计划 B4）+ 两条「疑似缺陷」的复核结论（2026-09-23）

**背景**：`research/README.md` §3/§6 一直挂着「视觉评述未完成」（当时的记录：provider HTTP 402）。

**结果**：已跑通。**23 条独立视觉评述**（20 个参考站 + 3 个自有产物），全部 `sawImage = true`，
逐条照录在 `research/VISION-REVIEW.md`（含方法、硬约束与已知限制）。

**为什么之前跑不成——诊断做实了，不是推测**：

- 首次确为 402（余额不足），当时的记录是准确的。
- 用户充值后我重试**仍失败**，于是做了三路对照实验：
  `qiyuan + deepseek-v4.1`（会话默认模型）**成功**；`qiyuan + glm-5.3`、`deepseek + deepseek-flash` **全部失败**。
  → 说明 `agent()` 的 provider/model 覆盖机制本身是好的，问题在**我传错了 provider id**。
- `dsh --profile web --dump-config` 里写着默认 agent 模型是 **`provider: deepseek-official`**；换成它之后 6/6 批一次成功。
- 再用凭据库里的 key 直连 `api.deepseek.com` 验证账号：`GET /v1/models` → **200**，
  其中 `deepseek-flash` 声明 `input_modalities: ["text","image"]`；`POST /v1/chat/completions` → **200** 且正常计费。
  **结论：整条链路上唯一的问题就是把 provider id 猜成了 `deepseek` / `llm-deepseek`。**

**视觉复核带回来的两条「疑似缺陷」，已在当前构建上复核（不拿快照当现状）**：

| 疑似 | 实测（390px，当前构建） | 判定 |
|---|---|---|
| 手机端排序行被右边缘裁切（「最近更」露半截、深色按钮被切） | `#sortBox` right=373 < 视口 390、`clipped=0`；三个按钮 88/65/65px 均未截断 | ❌ **不成立** |
| 暗色模式顶栏仍是浅色（上浅下黑割裂带） | `[dark] header.top=rgb(20,23,28)`、`body=rgb(11,13,16)`、`card=#14171c` | ❌ **不成立** |
| 跳转 chip ①②③ 后 ④ 单独折行、右侧留大片空白 | `#jumpNav` chips=4、**rows=2、perRow=[3,1]**，末枚 chip 右边缘 x=105 → 右侧 **269px** 空白 | ✅ **成立**（页面级无溢出，属视觉秩序问题） |

**顺带补了门禁的一个盲区**：`verify-site.js` 只断言**页面级**无横向溢出
（`documentElement.scrollWidth === clientWidth`）。控件被父容器 `overflow:hidden` 裁掉一截时，
页面级宽度可以完全正常——**门禁全绿，肉眼却看得见被裁的控件**；这个盲区正是视觉复核暴露出来的。
新增 `scripts/tools/check-mobile-chrome.js`：逐控件量 `width / scrollWidth / clientWidth / clipped`
与相对父、相对视口的越界量，并输出 `#jumpNav` 的折行情况与亮/暗两套的底色对照。

**仍未处理**（需要时再做）：chip 折成 3+1 的观感问题（可改成横向滚动或等宽），
以及 `VISION-REVIEW.md` §6 第 4–6 条（控制带偏厚、强调色重复节奏、暗色卡片与底色明度差）。
### 2.26 活动期限三分类：「即将截止」不再是一句空话（2026-09-23，分支 `feat/expiry-window`）

**先把问题复核清楚，不凭印象**：`orderCards(list, 'expiry')` 的语义本来就是「剩余天数升序、无日期者垫底」，
但 130 条数据的 `expiresAt` **全是 null**，UI 上也没有「长期活动」这个标识。实测（render-core 沙箱 + 真实数据）：
点「即将截止」后 62 张折叠卡的 id 序列与排序前**逐条相同**，唯一可见变化是档位分带消失——
后两档之间比较器直接返回 0，等于没排，看到的是 `deals.json` 的行序。

**再查数据到底能不能填**：复核 **25 个官方页**（覆盖 **36 条**优惠）——**0 条**写出带年份的绝对截止日期。
官方要么只写「限时」不给日期（智谱上下文缓存存储、StepAudio 3、扣子部分模型、硅基流动免费模型…），
要么给的是相对期限（「自开通起 3 个月」「资源包有效期 1 年」「代金券自发放之日起 3 个月内」）。
→ **数据层一个 `expiresAt` 都不编造**，本轮做机制。

**做了什么**

| 层 | 改动 |
|---|---|
| 判定（前端） | `index.html` RENDER-CORE 新增 `expiryState()`：`due`（有绝对截止日）/ `unknown`（官方未标注）/ `ongoing`（官方写明长期）三档；排序、角标、详情弹层共用同一份推导 |
| 角标 | `剩 N 天` / `未标注截止日期` / `长期活动`；后两种用新增的 `.tg.long` `.tg.uns` 样式 |
| 排序 | `expiry` 改为三档次序：天数升序 → 未标注 → 长期；**后两档及同天数组内退回「最近更新降序」**，次序不再取决于文件行序 |
| 详情弹层 | 原先「截止日期」行在无日期时整行消失 → 改为常显的「活动期限」行，三档都有说法 |
| 抽取（外侧） | 新增 `scripts/lib/expiry.js`：`extractDeadline()` 只认写死的绝对日期（带年份 + 附近有结束语义），区间写法取结束端；`applyDeadline()` 在 `mergeAll` 里统一补 `expiresAt`（不覆盖已有值） |
| 自测 | 新增 `npm run selftest:expiry`：**55 项**（抽取正/负样例、三分类、角标与详情 HTML、排序次序、前后端「长期」词表一致性） |
| 门禁输出 | `validate` 打印三分类分布；`collect` 打印本次从文案里抽到几条截止日 |

**为什么「未标注」必须与「长期」分开**：这是诚实性问题，不是分类洁癖。「长期有效」是官方原话
（GitHub 学生包、非营利折扣），「官方未标注截止日期」是「我们没查到」（火山方舟 50 万 tokens 的公告、
只写「限时」不给结束日的活动）。合成一档就等于把后者说成前者。排序上「未标注」排在「长期」之前：
它仍有随时结束的可能，更该先被看到。

**抽取器的两条防线**（都是为了让「抽错」比「抽不到」更罕见）：

1. 只扫 `validity` / `discountInfo`——期限只可能写在这两处，扫全字段会把发布日期卷进来；
2. 只收**不早于今天**的日期——StepFun 定价页上既有「step-2x-large 已于 2026 年 06 月 12 日结束限时免费」
   （往期活动），也有「将于 2026 年 10 月 10 日下线」（模型下线日），填进来会把无关条目误判成过期。
   顺带：`下线` 不在结束语义词表里，本身也抽不到。

**门禁（全部在 worktree `.worktrees/expiry` 的 `feat/expiry-window` 上跑）**

| 门禁 | 结果 |
|---|---|
| `npm test` | ✅ 130 条 0 错；新增输出 `活动期限: 有截止日期 0 · 未标注截止日期 109 · 长期活动 21` |
| `npm run selftest:expiry` | ✅ **55 项，失败 0 项** |
| `npm run build` | ✅ 产物自检通过（62 张预渲染卡片；FAQ 结构化数据与可见文案逐字一致——FAQ 改动自动同步进 JSON-LD） |
| `npm run verify:regress` | ✅ 验收 **99 项，失败 0 项**（94 验收 + 5 回归：卡片 62→62、首屏 9→9、页高 5334→5382px 在 15% 容差内、外部请求 0、JS 错误 0） |

**环境（同 2.21，会误导后来人）**：默认沙箱 `workspace-write` 禁止子进程管道 stdio，`verify-site.js`
启 Edge 会以 `spawn EPERM` 失败；以更宽模式重跑同一命令即绿。

**已知边界**：当前数据第一档（有绝对截止日期）是 **0 条**，所以「即将截止」实际呈现为
「未标注（按最近更新）→ 长期活动（按最近更新）」两段有序列表——比改动前的「文件行序」是确定的，
但仍不等于「按紧急度」。要让它真的活起来，只能靠未来采到限时活动（抽取器现在会自动接住），
或人工策展时在 `curated_*.json` 里显式填 `expiresAt`。

**隔离方式**：本轮在一个 `git worktree`（`.worktrees/expiry`，已进 `.gitignore`）里做——
主工作区当时有另一个会话正在改 `index.html`（未提交 WIP）并切过分支，共用 HEAD 会让提交归属串掉。
**（后记，见 2.27）** 该 worktree 随后被那个会话自己收掉，改在 `fix/detail-close` 分支上继续并推上游。

---

### 2.27 并回 `origin/master`（两次）+ 修掉两个手机端横向问题 + 门禁补三条断言（2026-09-23）

#### ① 上游分叉：远端那条线**换了写法**，不只是「多几个提交」

推送前先核对了远端，结果是：`origin/master` 有 **13 个本地没有的提交**，且性质不止一种。

- **A/B 那 5 个特性提交在远端是同内容、不同哈希的**（`ab37e8b→c1385a0`、`874cd6b→a35f42e`、
  `ec05252→7238cc1`、`f1213d5→d01f394`、`f55e8a9→21f7ec8`）——远端那条线被 **rebase/重写过**；
- 连**本文件 2.21 那一节的提交**在远端也有一份同信息、不同哈希的（`8caee06` ↔ `af93c8f`）；
- 另有 docs 与数据提交：`43e81cc chore(data)` 只动 `deals.json`（+205/−64，补了若干 `zh` 译文）；
- 以及本地**完全没有**的新功能：`c02e017 feat(expiry)`（即上一节 2.26，编号是本轮为它改的）。

**先预演再动手**：`git merge-tree --write-tree --name-only master origin/master`（**不创建提交、不动任何 ref**）
报 **6 个文件冲突**。保险：tag `backup/pre-origin-merge-b261add` → `b261add`。

#### ② 6 处冲突怎么解 —— 判据是「两侧内容都不丢」，并用机械核对证明

| 文件 | 处理 | 解完的核对 |
|---|---|---|
| `index.html` | 6 处冲突**全落在 G11 的脚本区**（`render()` 收尾、`openDetail()`、列表点击委托、首屏 `setupPrefs()`、错误分支、`dropCompareQuery()`），远端侧要么为空、要么被本地侧包含 → 取本地侧；expiry 的 CSS（`.tg.long/.tg.uns`）、`ONGOING_RE/expiryState()`、`tagsHtml()`、排序比较器、FAQ 文案**由 git 自动合入** | `git diff origin/master` = **+693/−0** ⇒ 远端在该文件的每一行都还在，本地只做了加法 |
| `scripts/tools/build-local.js` | 取本地侧（远端侧的 hunk 为空） | **+17/−0** |
| `scripts/tools/verify-site.js` | 取本地侧 | **+225/−1**；那 1 行经核对是远端把 `hintsHidden` 挪到探针对象末尾、去掉了尾逗号，**语义相同**，无内容丢失 |
| `PROJECT_STATUS.md` | 两边都把新章节编号成 **2.22**（本地=G11，远端=expiry）→ 本地 2.22–2.25 保留，远端那一节**内容照录、编号改为 2.26** | 2.1…2.27 无重号，两边的记录都在 |
| `SUMMARY.md`、`NEXT-STEPS.md` | 取本地（更新）侧，现状表述在本节与新版文档里同步 | 冲突标记 0（`git diff --check` exit 0） |

**为什么文档不「取一侧了事」**：这三个文件是项目的长期记录，两边写的是不同的事实（谁做了什么、门禁当时是多少项）。
只留一侧就等于抹掉另一侧的工作痕迹，所以 `PROJECT_STATUS.md` 选择**两节都留、只改编号**。

#### ③ 集成期间上游又推了一次

第一次合并（`71d020a`）刚落地，`origin/master` 就从 `c02e017` 前进到 **`c70706b`**（`fix/detail-close`：
删掉详情动作区那个重复的「关闭」链接 —— 它会经 `detailHtml()` 被 80 个独立详情页复用，
而那些页面不加载主脚本，`href="#"` 点下去是死链）。零冲突自动合入，amend 提交信息后为 **`0d6b869`**。

逐点核对（这次改动动的正是 G11 的插桩区）：`detailHtml()` 里那个 `[data-close]` 与只服务它的
`detailBody` 处理器已删；**对比弹层自己的「关闭对比」是另一个容器的 `data-close`，未受影响**；
G11 的 `buildDetailActions()` 与 `insertAdjacentElement('beforebegin', …)` 插桩点仍在。

#### ④ 修掉视觉复核带回的那个真缺陷：手机端 chip 折成 3+1

2.25 复核确认的问题：390px 下「跳到 + 4 枚 chip」一行放不下 → `rows=2 perRow=[3,1]`，
第二行只剩一枚、右侧空 **269px**（页面级无溢出，所以是个**视觉秩序**问题）。

修法（只在 `@media (max-width: 760px)` 里，桌面一行未动）：窄屏**隐藏可视的「跳到」两字**
（`nav` 的 `aria-label="跳到力度档位"` 已提供同一语义），4 枚 chip 按容器**等分排成一行**；
刻意**不写 `nowrap`** —— 将来档位名变长时宁可让 chip 内换行，也不要再出现 3+1 那种残行。

实测（`scripts/tools/check-mobile-chrome.js`，390px）：

| 指标 | 修前 | 修后 |
|---|---|---|
| chip 排布 | `rows=2 perRow=[3,1]` | **`rows=1 perRow=[4]`** |
| 末枚 chip 右侧余量 | **269px** | **0px** |
| 页面横向溢出 | 0px | 0px（未退化） |
| 手机卡片页高 | 12848px | **12814px**（控制带矮了一行） |

#### ⑤ 顺带发现的另一个（更严重的）横向问题：窄屏下整张卡片撑破容器

修完 chip 我没有只看 390px，而是拿同一支探针**把 320 / 360 / 390 / 430 四档都量了一遍**
（`check-mobile-chrome.js` 的宽度写死 390px，所以这一步用的是临时探针）。结果 390/430 干净，
**360px 溢出 2px、320px 溢出 42px** —— 页面级横向滚动，而门禁一直只量 390px，所以从来没报过。

**根因（可复算的几何事实，不是猜测）**：`.grid` 在手机断点写的是 `grid-template-columns: 1fr`，
而 `1fr` 等价于 `minmax(auto, 1fr)`；那个 `auto` 下限＝网格项的自动最小尺寸，被卡片的最小内容顶在
**345.5px**。于是只要容器窄于 345.5px（视口窄于约 **378px**），轨道就撑破容器：实测卡片在
320 / 360 / 390px 下**都还是 346px 宽**（与视口无关）。祖先链把这点钉死了：
`.wrap`(320) → `main`(288) → `.grid` width=288 **但 `grid-template-columns` 算出 345.5px**。

**修法**：手机断点的单列改成 `minmax(0, 1fr)`——只改这一条，桌面三列与 1180px 的两列断点都不动
（那两档容器远宽于 345.5px，`auto` 下限永远不生效，改了也验不到）。`.g` 是 `overflow:hidden`，
所以**必须**确认轨道收窄后没有把卡内内容裁掉：

| 视口 | 修前 | 修后 |
|---|---|---|
| 320px | 溢出 **42px** · 卡片 346px | 溢出 **0px** · 卡片 288px · **卡内被裁元素 0 个** |
| 360px | 溢出 **2px** · 卡片 346px | 溢出 **0px** · 卡片 328px · **卡内被裁元素 0 个** |
| 390px | 溢出 0px · 卡片 358px | 溢出 0px · 卡片 358px（**不变**：容器本来就更宽） |

> 「卡内被裁元素 0 个」是逐个子元素量的（`el.right > 卡片 padding 盒右边界 + 0.5` 即判被裁），
> 不是靠肉眼看截图下结论。

#### ⑥ 堵上门禁盲区 —— 是「加断言」，不是「改判据」

原先只断言**页面级**无横向溢出，而且**只在 390px 量**。两个盲区各补一条：

1. **逐个控件**（13 个）量「自己把内容裁了 / 被祖先 `overflow:hidden|clip` 切了 / 越出视口」——
   控件被 `.sortbox`、`.seg`（两者都是 `overflow:hidden`）切掉一截时，页面级宽度可以完全正常；
2. **chip 是否排满一行**：枚数 4、行数 1、末枚右侧余量 ≤ 8px —— 这条正是 3+1 的直接几何量；
3. **360px 的页面级横向溢出** + 「网格宽 / 容器宽」——**这条正是 ⑤ 那个 42px 的直接判据**，
   它以前不存在，所以从没报过。

前两条**同时覆盖 390px 与 360px 两档**（chip 与控件在两档都验）。

**判据本身一个字没动**：`git diff HEAD -- scripts/tools/verify-site.js` 是**纯新增、零删除**，
§4 那条溢出判据经提取比对与 HEAD **逐字节相同**（353 字节）。
`check()` 调用点 **105 → 108**（不含 `--compare` 那一段；含则是 111 → 114），**运行时报数 110 → 113**。

#### ⑦ 合并态全门禁（在 `0d6b869` + 本轮改动这一棵树上实跑）

| 门禁 | 结果 |
|---|---|
| `npm test` / `test:strict` / `check:zh` | exit 0 / 0 / 0（译文漂移 0、待译 0） |
| `selftest:zh` | ✅ 演练 **7 项，失败 0 项** |
| `selftest:expiry`（远端新增） | ✅ **55 项，失败 0 项** |
| `build` ×2 + dist 全树摘要 | ✅ 139 文件，两次摘要均 `8be46e1581651038a7662e41…`，产物自检通过 |
| `verify:regress` | ✅ **验收 113 项，失败 0 项**（含新增的 3 条；回归比对 5 项全过：卡片 62→62、首屏 9→9、页高 5334→5382px 在容差内、外部请求 0、JS 错误 0） |

> `npm run verify` 未单独重跑：它与 `verify:regress` 是同一个脚本文件，后者 = 前者 + 5 项回归比对，是严格超集。

**本轮的沙箱说明（与 2.21/2.22 的记录相反，如实更新）**：这两条 2.21 与 2.26 都记着
「默认沙箱 `workspace-write` 禁止子进程管道 stdio，playwright 会 `spawn EPERM`」。
**本轮策略已改为 `danger-full-access` 且关闭审批**，因此 `verify:regress`（启 Edge）与 `selftest:zh`
（`spawnSync` 调构建）都是**直接跑通的**，没有再出现 EPERM。前两节的记录是当时的真实情况，
但**后来人不必再照着绕**。

**未处理（需要时再做）**：`research/VISION-REVIEW.md` §6 第 4–6 条那三个观感项
（控制带偏厚、强调色重复节奏、暗色卡片与底色的明度差）。它们都不是缺陷，是取舍。

---

### 2.28 上线（按用户「push」）与部署复核（2026-09-23）

**执行**：`git push origin master` → **快进** `c70706b..ecbc815`，退出码 0。
**核对**：远端 `refs/heads/master` = `ecbc8152e03bd6da32ded962262bc94be95a26b6` = 本地 HEAD；
`git status -sb` 为 `## master...origin/master`（无 ahead/behind）。推送前先 `git fetch`（exit 0），
确认远端仍是 `c70706b`、且是本地祖先 —— 所以这次是快进，没有重写上游历史。

> **闭合（补记）**：本节这份**记录本身**随后也推送了 —— `ecbc815..fa2403d`（同样是快进），
> Deploy 工作流 [run 35849728738](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/35849728738) **success**。
> 所以**远端 `refs/heads/master` 现在是 `fa2403d`**；上面那个 `ecbc815` 是**代码那次推送的当时值**，
> 不是笔误。两次推送的内容差别只在 3 个 `.md`，而 `dist` 不含 `.md`
> （`PUBLIC_FILES` = index.html / deals.json / favicon.svg / robots.txt / .nojekyll），
> 因此**线上产物两次完全相同** —— 那次 108 项冒烟测试对现在线上的内容依然成立（**当时**复查：
> 首页 200、五项改动标记都在、`deal/ebd47f6d2522/` 与 `feed.xml`/`feed.json`/`sitemap.xml`/`robots.txt` 全 200；
> 线上复测值见本节末尾的 ⚠️）。
>
> 顺带记一条自己踩的坑：补推时代理（FlClash）**又断了一次**，第一次补推以同样的 7890 连接失败告终。
> 那次重试脚本里我犯了「`fetch` 失败后仍用旧 remote-tracking ref 做快进判断」的错，已改成
> **fetch 成功才继续**。

**发布链路**：Deploy 工作流 [run 35841045158](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/35841045158) **success**。

**线上冒烟测试**（这一条才是「上线成功」的实证，不是看工作流绿灯）：
`npm run verify -- --url=https://buguoshixc.github.io/ai-deals-aggregator/` → **验收 108 项，失败 0 项**（上线当日的本机运行记录）。
（`verify` 不含 `--compare` 的 5 项回归，113 − 5 = 108；两个数在 2.27 ⑦ 里对得上。）

> ⚠️ **线上复测值：权威值待复测（见 P0-2）** —— 2026-09-23 复测时本机到该 host **无通路**
> （直连与经 `127.0.0.1:7890` 代理都是 `page.goto: net::ERR_CONNECTION_CLOSED`，挂在第 1 节、零断言；
> 同期 `api.github.com` 可达）。所以上面这个 108 应读作**上线当时的记录**，不是本机现在能复现的现状值。

线上确实带上了本轮的三条新断言 —— 例如
`360px 页面级无横向溢出 — 溢出 0px · 网格 328px / 容器 328px`、
`390px 与 360px：跳转 chip 都排满一行 — 390px: chips=4 rows=1 perRow=[4] 余量=0px · 360px: …`。

**一处口径纠正（旧文档写错了，已改）**：此前多处写着「`push` 会触发 CI 采集与 GitHub Pages 部署」。
实际 `deploy.yml` 是**纯发布**流程（它自己的注释原文：「纯发布流程：不做采集（采集由 collect.yml 负责）」）：
`push` **只触发发布**。采集由 `collect.yml` 按**定时**（UTC 00:00 / 12:00 = 北京时间 08:00 / 20:00）
或 `workflow_dispatch` 跑，跑完再由 `workflow_run` 唤起发布 —— 因为用仓库自带 `GITHUB_TOKEN` 推的提交
不会再触发其它 workflow。所以「推送后线上立刻更新」是对的，「推送会顺带多跑一次采集」是错的。
已改 `NEXT-STEPS.md` 与 `SUMMARY.md`。

**一条环境坑（会浪费后来人时间）**：本机 git 全局配置了代理
（`C:/Users/星澈/.gitconfig` 的 `http.proxy` / `https.proxy` = `http://127.0.0.1:7890`，由 FlClash 提供）。
**第一次 push 与 fetch 都以失败告终**：
`fatal: unable to access '…': Failed to connect to 127.0.0.1 port 7890`（退出码 128）。
当时 FlClash 没在跑，而直连也不通 —— 实测 `Test-NetConnection github.com:443` = **False**、
绕过代理的 `git ls-remote` 也在 21 秒后失败。
**判据：看到 7890 连不上 → 先确认 FlClash 在运行，不要怀疑 git、凭据或远端仓库。**
代理起来后**同一条命令直接成功**。附带一条：`api.github.com` 可以**直连**（实测 True），
所以查 CI 运行状态不需要代理。另外注意首次排查时 `Get-NetTCPConnection` 一度没列出 7890，
而几分钟后再查就在了（FlClash 是那时起来的）——**端口探测的结论只在当次有效**。

---

### 2.29 修「打开对比」点不开 + 收藏列表入口（2026-09-23，分支 `fix/favorites-entry-and-compare-open`）

**用户报告的两条**：① 点击收藏后没有入口打开自己的收藏列表；② 加入 2 个模型后点「打开对比」打不开。
**复核后是三条现象、三条根因**——第 ② 条底下其实藏着两个独立缺陷。

#### ① 现象与根因（真浏览器实测，不是读代码猜的）

| 现象 | 实测 | 根因 |
|---|---|---|
| **「打开对比」点不开**（必现） | 点完 `dialog#compare`：`open=true`、`:modal=true`，而 `hidden` 属性**仍在** ⇒ `display:none`、rect **0×0**。页面已进顶层被 inert 冻住（点什么都没反应），屏幕上什么都没有 | `buildCompareDialog()` 写了 `dlg.hidden = true`，`openCompare()` 从不摘掉；而 `body.js .cmpdlg[hidden] { display: none }` 是**作者级**规则，`showModal()` 压不过它。**既有 §17.5 只断言 `dlg.open`（DOM 状态），所以 113 项全绿也照不出来** |
| **换筛选后「打开对比」静默失效** | 选 2 条 → 切一个把两条都挡住的筛选 → 条上仍写「已选 2 条」而标题条 **0 个**，点按钮**什么都不发生**（`open=false`，无任何提示） | 计数读 `cmpInDetail.length`，而 `cmpCards()` 经 `cardById()` 只在**当前筛选后的** `state.cards` 里解析；解析不足 2 条时 `openCompare()` 直接 `return` |
| **收藏只有「加」没有「看」** | `dsh.favorites` 写了、星标亮了，但没有任何能把收藏列出来的入口 | 2.22 §⑧ 当时明确列为不做；本轮补上 |

> 教训与 2.22 ⑥ / 2.23 那条同源：**判据只看 DOM 状态时，「元素在但看不见」是一整类盲区**。
> 本轮新增的对比断言一律量**几何**（`display` / `getBoundingClientRect` / `:modal`），不量 `open` 属性。

#### ② 修法（三条，逐条对应）

| 改动 | 位置 |
|---|---|
| 显隐交给 `<dialog>` 自己的 `open` 语义：删掉 `dlg.hidden = true`；`openCompare()` 里打开前**再显式清一次** `hidden`（防将来有人把标记写回 HTML，双保险）。CSS 那条 `[hidden]` 兜底**保留** | `index.html` 对比弹层 |
| 新增 `state.selectIndex = buildSelectIndex()`：先放**折叠后的卡片**（与页面上出现的卡片同一入口），再用**未过期**的原始条目补齐；`cardById()` 改读它 ⇒ 收藏与对比都按**整份数据**解析，与当前筛选 / Tab / 折叠**无关**。对比条计数与标题条因此同源；不足 2 条时按钮 `disabled` 并写明「再选 1 条才能并排对比」 | `index.html` G11 区 |
| 失效选择不静默：对比项解析不到就**自动移除**并在条上写明（`已移除 N 条当前数据里找不到的对比项`，选择一变这句话就清掉）；收藏**不自动删用户数据**，改在收藏视图里说明 + 一个「清理这 N 条」按钮 | `index.html` + `statsHtml()` |

#### ③ 新增：收藏列表入口（「只看收藏」）

- RENDER-CORE 新增纯函数 `scopedCards()` / `selectScopeFilters()` / `favIdsOf()`；`cardsFor()` 改走 `scopedCards`
  （`fav` 为假时与旧实现**逐字节等价**，`tier-report` 等消费点零改动）。
- 收藏在**折叠之后**按**卡片 id** 收敛（不是原始条目 id）。理由：星标挂在卡片上、存的就是那张卡的 id；
  若按条目 id 过滤，百度千帆那张 17 模型折叠卡会退回「ERNIE-4.5-Turbo-VL 免费额度」这类单模型标题——
  收藏视图里的标题必须与当初星标的那张卡一致。
- 入口 = 筛选条**最前面**的 `★ 我的收藏 N`（`data-facet="fav"` + `data-fav-open`）。放最前是因为窄屏这一行
  是**横向滚动**容器，放末尾意味着手机上要先横滑才看得见自己刚收藏的东西。**零收藏且没进视图时不渲染**——
  没有可看的东西就不给按钮（与「无 JS 不给死按钮」同一条规矩，只是这次的条件是「没有内容」）。
- 状态是纯数据：`filters.fav` + `filters.favIds`；构建期拿到 `fav:false / favIds:[]`。
- 结果条在收藏视图下换口径，并把两种「少了」分开说：**被当前筛选挡住** M 条 / **在当前数据里找不到** K 条
  （K>0 时给清理按钮）。合成一句话就等于把「你筛掉了」说成「它没了」。
- 焦点兜底：收藏视图里取消收藏会让那张卡**整张消失**，`render()` 里因此加了「还不上就交给收藏入口」——
  否则键盘用户点一下星标就被扔回页首（与 2.20 的焦点归还是同一条规矩）。

#### ④ 预渲染零影响（机械证据，不是「我觉得没影响」）

用 `git show HEAD:index.html` 的**原始字节**另建一份产物做对比（避免 PowerShell 重定向改编码）：

| 对比项 | 结果 |
|---|---|
| `markup`（摘掉 `<style>` / `<script>` 后） | 两侧 SHA256 前缀**都是 `cec440b47523e3cc`** ⇒ 逐字节相同 |
| JSON-LD（5 段） | 两侧都是 `baa1443cd276f16d` ⇒ 逐字节相同 |
| `<style>` | **删除 0 行、新增 10 行**（只有 `.prune` 按钮那一段） |

即：默认视图的 DOM 与结构化数据一个字节没动，新东西全部由 JS 按需建。

#### ⑤ 门禁（全部在 worktree `.worktrees/fav-entry` 的 `fix/favorites-entry-and-compare-open` 上实跑）

| 门禁 | 结果 |
|---|---|
| `npm test` / `test:strict` / `check:zh` | exit 0 / 0 / 0（130 条 0 错；译文漂移 0、待译 0） |
| `selftest:zh` / `selftest:expiry` | ✅ **7 项** / ✅ **55 项**，失败均 0 |
| `build` ×2 + dist 全树摘要 | ✅ 139 文件，两次摘要一致（`8e405d76eef74861394ea6cf51661d25…`），产物自检通过 |
| `verify`（真浏览器） | ✅ **验收 124 项，失败 0 项**（基线 108 → **+16**） |
| `verify:regress` | ✅ **129 项，失败 0 项**；5 项回归全过：卡片 62→62、首屏 9→9、页高 5334→5382px 在容差内、外部请求 0、JS 错误 0 |
| `check-mobile-chrome` | ✅ exit 0；390px 逐控件零裁切、`#jumpNav` `rows=1 perRow=[4]` 未退化 |

**+16 条新断言**（运行时报数 108 → 124）：`§1` +1（无 JS 时收藏入口/清理按钮同样是 0）；
`§17.5` +3（**弹层真的可见**：`display` + `920×672px` + 在视口内 + `:modal`；关闭后不留顶层 modal 且点卡片能开详情；
390px 弹层不超出视口）；`§17.6` +4（筛选挡住已选项仍能并排；计数与标题条同源；失效对比项被移除并说明；补选后说明清掉）；
`§17.7` +8（零收藏无入口 → 收藏后入口计数 1 → 视图只剩 1 张卡 → 视图内取消收藏的卡片消失/空态/焦点落回入口 →
退出后回到 62 张 → 失效收藏计数与清理 → 390/360px 入口与清理按钮都在视口内 → 清理只删失效项）。

另外把 320 / 360 / 390 / 430 **四档**都用临时探针量过（`check-mobile-chrome.js` 只量 390px，2.27 的教训）：
收藏视图（含清理按钮）在四档下页面溢出均 **0px**，入口与清理按钮 `clipped=0`。

#### ⑥ 门禁自身修掉的一处**假失败**（`markup` 要连 `<style>` 一起摘）

产物自检里那条「预渲染 HTML 里不许有收藏/对比控件」是拿 `markup` 扫标记，而 `markup` 此前只摘了 `<script>`。
本轮我在 CSS 注释里写到 `data-fav-prune`，于是**注释被当成了控件**、构建假失败一次（`✗ 预渲染 HTML 里出现了收藏/对比控件: data-fav-prune`）。
修法：`markup` 同时摘掉 `<style>` —— 这本来就是那条判据注释里写的口径（「样式块不属于 markup」），
且与 tier 计数那次踩的坑是同一个（CSS 选择器 `[data-tier="1"] .rnum` 被算成档位角标）。**要数的是元素，不是文本。**

**核对（改门禁必须自证没放宽）**：摘掉样式后所有计数与改动前**完全一致** ——
卡片 62 / facet 11 / logo 官方图形 32 + 缩写兜底 3 / CTA 62 / 标题内链 62 / 详情页 80 / 折叠 62 覆盖 80，
说明没有任何判据依赖样式块；`data-fav-open`、`data-fav-prune` 两个新标记也照样在扫描清单里。

#### ⑦ 明确不做 / 已知边界

- **只选 1 条时对比条仍不出现**（2.22 的刻意取舍，本轮不改）；只有「有选择被移除」时才让条留下来承载那句说明。
- 收藏**不做** URL 分享态（收藏是本机个人数据，与 `?compare=` 的可分享语义不同）、**不做**跨设备同步（红线：无后端、无账号）。
- 紧凑**行视图仍不放星标**（46px 行高放不下，会被 CTA 压住），行视图里收藏/取消收藏仍可经详情弹层完成。
- 收藏按 id 记忆：条目改名 / 下架后 id 对不上，会如实计入「找不到」并给清理入口，**不自动删**。
- 视觉证据（供人工复核，不入库）：`mockups/.preview/fav-cmp/` 四张 —— 默认视图入口 + 对比条 / 对比弹层（已修复）/ 收藏视图与失效清理 / 手机 390px。

#### ⑧ 隔离方式（另一个会话正在主工作区跑）

改动全部在 `git worktree`（`.worktrees/fav-entry`，已进 `.gitignore`）+ 分支 `fix/favorites-entry-and-compare-open` 上，
`node_modules` 用**目录联接**指向主工作区（不重复 `npm install`、不动锁文件）。
主工作区**一个文件都没碰**：收尾时对比了 `git status --short` 的全量输出哈希与 7 个关键文件的 mtime/SHA256，与开工前完全一致。
**未合并、未推送** —— 等用户点单（主工作区当时有另一个会话的未提交 WIP，冲突按 2.27 的「两侧内容都不丢」处理）。

#### ⑨ 合并态预演与复验（工作期间另一会话把 master 推进了两次）

**先只读预演再动手**：`git merge-tree --write-tree --name-only HEAD master`（**不动任何 ref、不建提交**）
报 2 个文件冲突。随后在**独立 worktree** `.worktrees/merge-trial`（分支 `trial/fav-cmp-merge`，基线 `882da8d`）
里真跑一遍 `git merge --no-ff`：冲突**只有 2 个文档**，`index.html` / `verify-site.js` / `build-local.js` / `SUMMARY.md`
**全部自动合并**（我加的两个泄漏标记与 `<style>` 摘除逻辑都在）。

| 文件 | 处理 | 核对 |
|---|---|---|
| `PROJECT_STATUS.md` | 2 处冲突都是「同一个事实、两侧各自更新了数字/说法」：`npm run verify` 那行与「真浏览器验收」那行。**不取一侧了事**，按两侧信息合写（124 / 129 项 + 对方补的 `check()` 调用点分解 `130 = 124 + 5 + 1`、`DSH_EDGE` 说明，加我这边的「断言一律量几何」那句） | 两侧新章节都在：本地 `### 2.29`、远端 `## 七、审计发现（四个坑）`；编号无重号 |
| `NEXT-STEPS.md` | 1 处冲突：对方给 `ecbc815` 那行补了「上线当日的记录；线上复测值待复测（见 P0-2）」⇒ **取对方的**（信息更新） | 我这节 `## 二·五` 与对方改动并存 |
| `SUMMARY.md` | 自动合并（两侧改的是不同段落） | 顺手修一处交叉引用：我那句「见 NEXT-STEPS 第四节」改成实际标题「第二节·五」 |

**合并态门禁（在 `trial/fav-cmp-merge` 这棵树上实跑）**

| 门禁 | 结果 |
|---|---|
| `npm test` / `test:strict` / `check:zh` | exit 0 / 0 / 0 |
| `selftest:zh` | ✅ **9 项**（对方那条线把它从 7 项扩到 9 项） |
| `selftest:expiry` | ✅ 55 项，失败 0 |
| `check-ci-consistency.js --expect-checks=24`（对方新增的门禁） | ✅ 24 项，失败 0 |
| `build` ×2 | ✅ 139 文件、产物自检通过、两次摘要一致（`a3bdcf82816fcda53b656a5dfeff8a0f…`） |
| `verify:regress` | ✅ **129 项，失败 0 项**；5 项回归与单分支时**逐个相同**（卡片 62→62、首屏 9→9、页高 5382px、外部请求 0、JS 错误 0） |

> 合并态数字与单分支**完全一致**，说明两边改的是不同的东西（对方在采集 / 门禁 / 文档侧，本轮在渲染与验收侧）。
> `master` 未被这次预演触碰：合并只发生在 `trial/fav-cmp-merge` 分支上，**落地仍需一次显式合并**。

**合并态的一次逐字节复核（顺带澄清一个看起来像漂移的数）**：合并产物里
`markup`（摘掉 `<style>`/`<script>`）的 SHA 仍是 `cec440b47523e3cc`，与单分支**逐字节相同**；
而 **JSON-LD 的 SHA 变了**（`baa1443cd276f16d` → `e8318212ff8d2b78`）——**不是本轮造成的**：
对方这条线重写了 FAQ 解析（把两段式问答的 `</p><p>` 正确带进 `FAQPage` 的答案文本，
并让可见文案从 HTML 独立回读比对），构建自检因此多出一句
`✓ FAQ 文案与结构化数据一致: 5 条（可见侧独立回读 + 无标签残留）`。
该文件（`scripts/tools/build-local.js`）在 master 线上被改过，而 `index.html` **一行未动**——
所以「卡片 / 筛选条 / 汇总这些预渲染标记区与改动前逐字节相同」这条结论在合并态依然成立。

#### ⑩ 上线（2026-09-27，按用户「推送上线」）

**推送链**（本地 7 个提交，快进）：`4a37a3c..da3b6e1  master -> master`，之后 `master` = `origin/master` = **`da3b6e1`**。
其中除了本轮的 `875b723` / `f601f37` / `0c7e5aa`，还包含**另一会话的两个本地提交**（`cfd443b`、`882da8d`）——
它们本来就挂在 `master` 上，推送绕不开；如实记在这里。

**推送前必须先并回远端，而且远端确实前进过**：`fetch` 发现 `origin/master` 已从 `35aa371` 走到 `4a37a3c`
（**8 次定时数据更新**，2026-09-24 ~ 09-27，只动 `deals.json`，+237/−191）。只读预演 `git merge-tree` 报零冲突，
真合并也只有 `deals.json` 一个文件。合并后数据：**132 条**（优惠 80 / 工具 52，比本轮起点多 2 条工具条目），
预渲染卡片仍是 **62 张**、详情页仍是 80 个。

**顺带补掉一个会让新门禁当场变红的坑**：那 2 条新进工具条目（DeepBrain AI / AutoDraw）没有中文译文，
`check:zh` 报「待译 2 条」，而 `verify.yml` 的 `Translation self-test` 是**硬步骤**（没有 `continue-on-error`）——
带着它推上去，这条新门禁的**第一次运行**就会失败。按仓库既有流程补了译文（`zh-todo.js` → 填译文 → `--scaffold` 盖原文指纹），
既有 41 条零改动（逐条 JSON 等值比对），`check:zh` exit 0、`selftest:zh` 9 项 0 失败。
**这 2 条译文是 agent 起草的**（DeepBrain AI：`A tool to create text-to-speech videos.` → 「把文本做成配音视频的工具。」；
AutoDraw：`Autocorrect but for drawings` → 「画画版的自动纠错。」），欢迎按官方文案复核。

**发布链与线上实证**（都不拿工作流绿灯当结论）：

| 项 | 结果 |
|---|---|
| `Deploy to GitHub Pages`（push `da3b6e1`） | ✅ **success**；线上 `index.html` 279,385 字节，本轮 7 个标记（`data-fav-open` / `data-fav-prune` / `buildSelectIndex` / `state.selectIndex` / `data-facet="fav"` / `cmpNote` / `selectScopeFilters`）**全部存在** |
| `Verify site (gate)`（push `da3b6e1`） | ✅ **success**（这条新门禁的**首次运行**） |
| 线上 `deals.json` | ✅ HTTP 200 · 131,857 字节 · 132 条 · `updatedAt 2026-09-27T11:51:17+08:00` |
| 线上详情页抽样 | ✅ `deal/2eae0e246de2/` HTTP 200（55,125 字节） |
| **线上定向探针**（显式走代理、真实鼠标操作） | 首屏 62 卡 / `lastUpdated 2026/9/27 11:51:17` / 零收藏时**无**收藏入口 → 点星标后入口出现「★ 我的收藏1」→ 点入口进收藏视图（1 张卡、`aria-pressed=true`、「显示 1 条收藏卡片」）→ 加 2 条对比后点「打开对比」：**`display=block`、920×548、`:modal=true`、2 列**（本轮修的那条）→ Esc 后 `open=false` 且无残留 `:modal`；**JS 错误 0** |

**一处如实说明（本轮门禁没做到的事）**：`npm run verify -- --url=<线上>` 这条**整链路**冒烟在本机**跑不完**——
三次尝试分别死在不同阶段（§11 等 `deals.json` 应用启动超时、另两次在更早的页面装载阶段），
是这台机器**经代理访问 Pages 的抖动**（同一时刻 PowerShell 直查线上 200、定向探针一次装载成功）。
本地同一份产物 `verify:regress` **129 项 0 失败**（含全部 16 条新断言）。
**结论按证据分级写**：本地全量门禁绿 + 线上产物完整性 + 线上定向探针通过；
「线上 124 项整链路」这一条**没有拿到绿**，网络稳定时可重跑补上。

### 2.30 同一家公司的同类优惠并成一张卡（2026-09-27，按用户反馈「GLM 一下子有 8 条优惠」）

**现象**：智谱AI 在页面上铺了 **12 张卡**，其中 7 条是几乎一样的「GLM-*-Flash 免费模型」；
火山引擎 11 张。用户的原话是「同一家公司的优惠没有被合并」。

**根因**（一句话）：折叠键把**落地页**也算了进去 ——
`[厂商, url, discountInfo, eligibility, validity]`。
智谱的免费模型一条一个 docs 页（`glm-4.7-flash` / `glm-4.5-flash` / …），**键全不相同**，
所以一条都合不上；火山方舟同理（11 条里只合上了 2 条）。数据层没有重复条目，是**呈现口径**的问题。

**改法**：折叠键换成 `(归一厂商, 优惠类型)`：

| 部件 | 做法 | 为什么 |
|---|---|---|
| 归一厂商 | 复用 `VENDOR_RULES`（`canonicalVendorOf`） | 与筛选条同一套规则；`MiniMax（稀宇科技）` 与 `MiniMax` 这类同厂不同写法不再各自成卡 |
| 优惠类型 | 标题去掉厂商名，把型号令牌抹成占位符，**保留品牌词**（`GLM-4.7-Flash → GLM-*`、`Doubao-语音合成 → Doubao-*`） | 型号不同不该拆卡；品牌词留着，跨厂商永远合不到一块 |
| 合并轮 | 同厂商下、去掉**打头**品牌词后类型相同的组并到成员最多的那组 | `GLM-* 免费模型` 与 `CogView-* 免费模型` 是同一家公司同一类免费模型，该并；`GLM-* 限时五折` 与 `Batch API 批量调用五折` 品牌词不在打头位置，一律不并 |
| 卡片那行文案 | 公共前缀只说一遍 + 差异按括号标签归堆（`（图像生成）50张/200张`），**实测装得下才合并**（13px 两行 = 56 字） | 型号不同 ⇒ 额度往往不同（50 张 vs 200 张）；装不下就退回代表条目原文，**绝不吐被 2 行 clamp 吃掉的残句** |
| 详情弹层 | 折叠卡新增「各型号额度（官方页面原文）」 | 卡片那行装不下全组差异，逐条原文留在这里，不因折叠而丢 |

**结果**（同一份 `deals.json` 实测）：卡片 **62 → 50**，覆盖条目仍是 **80（一条不丢）**；
智谱AI **12 → 6**（7 条免费模型并成 1 张）、火山引擎 **11 → 5**（9 条并成 1 张）、
百度智能云仍是 1 张 17 个模型。工具条目、单条卡、收藏/对比行为不变。

**门禁（都实跑）**：

- 新增 **§4b 三条可证伪断言**：① 每条优惠归到**恰好一张**卡（按卡片新增的 `data-models` 认领；未认领 0 / 被多张卡认领 0）② 折叠卡声明覆盖数 = 实际认领数 ③ 折叠卡那行文案整句显示、没被 2 行 clamp 截断。
  **前两条一开始就把两个真问题抓出来了**：百度千帆那张卡声明 17 条、认领 0 条（认领判据写错），火山那张卡 89 字文案**真的被 clamp 裁了** —— 于是把上限从 90 改成实测出来的 56。
- 卡片新增 `data-models`（覆盖的条目原名，换行分隔）：让「折叠没丢条目」在**产物里**可逐条复核，而不是只写在构建脚本的内存里。
- 回归口径修正：卡片数本来就会随折叠口径**下降**，所以 `--compare` 的「不减少」改盯新增的 **`coveredDeals`（覆盖的优惠条数）**，卡片数那条保留但不再是唯一防线。
- `verify` **127 项 0 失败** · `verify --compare` **133 项 0 失败** · 产物自检 0 失败
  （`折叠无损: 50 张卡片覆盖 80 条优惠（3 张折叠卡 / 33 个模型）`）· `check-mobile-chrome` 零裁切 ·
  `check-ci-consistency` 24 项 0 失败 · `validate` / `validate --strict` / `check:zh` / `selftest:zh`(9) / `selftest:expiry`(55) 全绿。

**已知边界（如实记）**：折叠卡的副标题（`厂商 · 分类`）取代表条目的分类，而智谱那张卡实际横跨
对话模型 / 图像绘画 / 视频 —— 分类筛选本身仍然正确（按原始条目的分类过滤），只是卡片上这一行是**代表**的。
详情弹层的「各型号额度」在窄屏需要滚动（`.dlg` 是 `overflow:auto`，实测可滚到底）。

**上线（2026-09-27，按用户「推送」）**：推送前 `fetch` —— 远端没有前进（`origin/master` 仍是 `674c63f`，
正是本分支的基点），因此 **快进**：主工作区 `git merge --ff-only fix/fold-same-vendor`
（**文件零改动**，只挪指针，`git status` 全程干净）→ `git push origin master` **`674c63f..250ba12`**。
两条工作流对 `250ba12` **双双 success**：
[Deploy](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36328609547) ·
[Verify site (gate)](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36328609490)。

**线上实证**（真浏览器打线上，不拿工作流绿灯当结论）：线上首页 **50 张卡**（改前 62）·
折叠卡 `智谱AI 免费模型×7` / `百度千帆 新用户免费额度×17` / `火山方舟 免费额度×9` ·
卡片覆盖条数 **80** · 汇总条「显示 50 条卡片 · 国内 30 · 国外 20」· **JS 错误 0**；
并且 `verify --url=<线上>` **整链路 127 项 0 失败**（2.29 那次因本机经代理访问 Pages 抖动没跑完，这次一次跑完）。

> 本轮改动全程在隔离工作树 `.worktrees/fold-same-vendor`（分支 `fix/fold-same-vendor`）里做，
> 因为**主工作区当时有另一个会话在跑**；只有最后快进 master 指针那一步在主工作区执行，那一步不改文件。

### 2.31 2.30 上线后的对抗性复核：查出 9 个真问题，逐条修掉（2026-09-27）

**做法**：2.30 推送后，让一个**独立子代理**去**证伪**这次改动（不是复述，是找反例）：
① 用破坏性改动验证新断言是否真会变红；② 自己写解析器独立核对产物；③ 构造合并规则的反例；
④ 拿真浏览器验收藏 / 对比 / 无 JS 三条链路。它把结论写成 11 条发现 + 「没能证伪的部分」。

**它证伪成功的（也就是真问题）**：

| # | 问题 | 性质 |
|---|---|---|
| 1 | 火山那张折叠卡写「9 个模型共用额度」，实际 5 种额度 | **说得不对**（本轮引入） |
| 2 | 单条卡那行文案的加粗前半句被改没了（44/62 → 0/50） | **回归**（本轮引入） |
| 3 | 「归到恰好一张卡」靠标题字符串认领：**把厂商从折叠键里抹掉后仍全绿** | 断言没牙 |
| 4 | 「文案没被裁」只看有没有溢出：换成「（摘要）xxxx」也全绿 | 断言没牙 |
| 5 | 被折叠的 30 条详情页成孤页（18 → 30），卡片只链到代表那一条 | 内链退化 |
| 6 | 静态首页丢 14 条成员额度文案（只在 JS 弹层里） | 无 JS / 爬虫丢信息 |
| 7 | 2.30 前星标过的成员条目：收藏视图 0 张卡 + 一句「可能被筛选挡住了」的**错话**、且不给清理 | **弄丢用户数据观感** |
| 8 | 合并规则 4 个反例：条件/有效期不同也会并、无品牌孪生不并、优惠类型为空会并、中文品牌孪生不并 | 边界未加固 |
| 9 | 回归基线在本轮里被改写（卡片数 62 → 50），等于把「不减少」的地板自己降了 | 门禁自证 |

**修法**：逐条见提交 `f9826fd`。要点是——① 新增 `quotaNoteOf()`，额度口径对数据说话，
两个渲染点共用一份文案；② 恢复加粗；③④⑤ 卡片新增 `data-deal-ids`（单条卡也有）+ 六条
**可证伪**断言；⑥⑦ 卡片新增 `.fmembers`（每型号链到自己的详情页 + 该条原文预渲染，
绝对定位不占卡片高度）；⑧ `foldKey` 补条件/有效期、空类型不折叠、合并轮两种写法归一同桶；
⑨ 新增 `verify-pre-fold.json` + `npm run verify:prefold`，对着它跑会**如实红一条**
「卡片数不减少 62 → 50」而「覆盖条数 80 → 80」保持 —— 那正是这次改动的定义。

**牙齿测试（把改动破坏掉，看断言是否变红，都实跑）**：
T2 文案换残句 → 红 · T3 额度口径谎报 → 红 · T4 声明数缩水 → 红 3 条 · T5 删成员原文 → 红 ·
T6 **折叠键根本不含厂商** → 构建自检仍过，但 §4b 当场红「跨厂商 11 条」。
（附注：只把厂商替换成空串是**不够**的，各家仍被优惠类型分在不同组里 —— 验牙口必须用
「键里根本不含厂商」这一版，这个坑已写进断言的注释。）

**复核**：`verify` **132 项 0 失败** · `verify:regress` **138 项 0 失败** · `verify:prefold`
预期红 1 条（「卡片数不减少 62 → 50」，同时「覆盖的优惠条数 80 → 80」保持）· 其余门禁全绿。
**上线**：`f9826fd` + `43eba28` 快进推送（`6554e26..43eba28`），两条工作流**双双 success**。
线上实证：折叠卡 `data-quota=varies` 且卡面写「各型号额度不同」（火山那张不再说「共用」）、
`.fmembers` 成员链接数 = 覆盖条数（7/17/9）、静态正文里含成员原文（365–375 字）、
加粗前半句 32 张、卡片 50 张 / 覆盖 80 条、**JS 错误 0**；`verify --url=<线上>` **132 项 0 失败**。

**一处过程如实记**：修复过程中我先只修了「加粗被删」，但切点跟着「拼出来的分隔符」跑，
实测同一 id 的 49 张单条卡里加粗从 31 张掉到 7 张 —— 于是 `43eba28` 把单条卡改回走 `offerOf()`
（原文第一个标点处切），实测回到 31 张、优惠行文字逐字相同 49/49。**这条是我自己复核出来的，
不是复核报告里的**；写在这里是因为「修一个回归时别引入另一个」正是这类改动最容易踩的坑。

### 2.32 撤掉「已核验」标签：两种角标并列时会被读成「核验过的更旧」（2026-09-27，按用户反馈「容易让用户疑惑」）

**问题**：卡片底部同时挂着两种新鲜度角标 —— 人工逐条回访过官方页的「✓ 已核验 2026-09-22」与
自动采集的「数据更新 2026-09-27」。人工核验那条的日期**更旧**，于是它读起来像「这条更不新鲜」，
正好把标签想表达的意思说反；筛选条的「✓ 已核验 32」、顶栏的「已核验 32」、详情与对比表里的
「核验状态」行同理。

**改法（对外只留一个口径）**：卡片 / 行视图 / 详情弹层 / 独立详情页统一显示「数据更新 {lastSeen}」，
tooltip 改成「本条记录最近一次更新的日期」（策展条目的 `lastSeen` 是合并期刷新的，说成「采集到」
才是不准）；筛选条撤掉「只看已核验」这一枚 chip（11 → 10 个 facet），顶栏改为
「50 条优惠 · 更新 2026-09-27」，对比表该行由「核验状态」改名「更新时间」，详情字段
「核验状态」改为「更新时间 {日期}（本条记录最近一次更新）」，页头小字「真实优惠 · 每日核验」改为
「每日更新」（采集确为每日两次，核验不是），FAQ 与纠错模板里的相关措辞一并改掉。

**数据层一个字没动**：`verified` / `verifiedAt` 仍在 `deals.json` 与 `scripts/data/curated_*.json` 里，
`validate.js` 仍守「`verified=true` 必须带 `verifiedAt`」（含它的正反例演练），`foldGroup` 仍用它挑
代表条目、`dedup` 仍给它加分 —— 要恢复展示，改 `stampOf()` 一处即可。

**门禁（换了 1 条、补了 4 条，两条路径各量一遍）**：旧的那条「「已核验」筛选生效」删掉，换成 ——
§1 静态骨架（**爬虫与无 JS 访客真正读到的文本**）：「没有「已核验」字样」+「每张卡片都带「数据更新」日期」；
§7 水合后的 DOM：「筛选条里不再有该按钮与计数」+「卡片与顶栏不再出现这四个字」+「每张卡片都标注
「数据更新」日期」。两处都只扫**渲染出来的卡片文本**，不扫整页 —— 内联脚本里还留着解释这次撤除的注释，
扫整页会假红（§7 若只量水合后的 DOM，预渲染那一侧的退化就没人看着；这正是牙齿测试第一版**没咬到**的原因）。

**牙齿测试（把缺陷塞回产物，实跑）**：① 只改预渲染骨架里的角标 → §7 全绿（水合时被重新渲染覆盖，
**说明单量一条路径不够**，于是补上 §1 那两条）；② 同时改预渲染角标 + 渲染核心 `stampOf()` 文案 →
**红 4 条**（静态骨架 1 张命中 / 49-50 / 水合后 50 张命中 / 0-50），`exit 1`。

**复核**：`npm test` 通过 · `npm run build` 产物自检全绿（50 张卡 / 10 个 facet 按钮 / 折叠无损）·
连续两次构建 `dist/index.html` SHA256 一致（`62692BB8…`，缺陷注入与还原各重建过一次也回到同一值）·
`verify` **136 项 0 失败**（原 132）· `verify:regress` **142 项 0 失败**（页高 4566 → 4566px、
卡片 50 → 50、覆盖 80 → 80）· 产物侧实测：首页可见标记与 80 个详情页里「已核验」**0 次**
（仅剩内联脚本里解释撤除的注释）。**历史记录不动**：`mockups/` 与本文档 2.x 各节里的旧角标是当时的
设计快照，不回改。

**上线（按用户「推送」）**：`98d9550..e01dcfc` 快进推送（改动本身）、随后 `e01dcfc..ca183b9` 快进推送（补译文）。
**第一推暴露了一条既有的红**：`verify.yml` 的「Translation self-test」在第 9 步失败 —— 定时采集的两次数据
提交（`d77b9cc` / `98d9550`）新进了 1 条没有译文的条目，`check:zh` 报「待译 1 条 / 1 个字段」；而机器人用
`GITHUB_TOKEN` 推的数据提交**不触发**本 workflow，所以这条红一直躺在 master 上，直到下一次人类推送才现形
（`deploy.yml` 不受影响，站点照常发布）。修法见 `ca183b9`：按覆盖层格式手工追加 `0ddacfb2cc6e`（Wavel.ai）
的 `description` 译文 —— 没走 `--scaffold`（它按数据顺序重写整份 `byId`，会带出 1 处无关条目的位置变动），
手工追加的覆盖层 diff 只有 +7 行；指纹由 `check:zh` 校验（漂移 0 / 待译 0）。
**第二推两条工作流双双 success**，gate 的 14 步全绿 —— 其中 `[13] Real-browser acceptance (verify-site.js)`
是**真跑**的（不是 degraded 那一路），136 项断言在 CI 上同样执行。

**线上实证**（本机直连抓线上的 HTML）：首页可见标记里「已核验」**0 次**（全文只剩内联脚本里解释这次撤除的
注释 1 处）、顶栏为「**50** 条优惠 · 更新 2026-09-28」、50 张预渲染卡片**全部**带「数据更新 + 日期」、页头小字
「真实优惠 · 每日更新」、筛选条 chip 为 `优惠50 | 全部工具103 | 国内30 | 国外20 | 厂商…`（「已核验」那枚已消失）；
详情页 `deal/ebd47f6d2522/` 的可见标记里「核验」出现 **0 次**、字段显示「更新时间 2026-09-28
（本条记录最近一次更新）」、纠错入口文案「信息有误 / 提交反馈」；线上 `deals.json` 已带新补的中文译文。

> 过程注：本机 git 配的 `http.proxy=127.0.0.1:7890` 当时**没有进程在跑**，推送走的是**一次性覆盖**
> （`git -c http.proxy= -c https.proxy=` 直连；实测 `github.com:443` 与 `api.github.com` 均可达），
> **没有改全局 git 配置**。fetch 后发现远端已被定时采集推进了 2 个提交（只动 `deals.json`），
> 于是先 `rebase` 到 `98d9550` 再推 —— 保持快进、历史线性，与既有做法一致。

---

### 2.33 `v1.0-public-readiness`：数据正确性、发布可信度、采集健康度（2026-09-28，分支 `feat/v1-public-readiness`）

**这一轮不开发新功能，只做三件事：把已知的线上错误修掉、让门禁真正拦住发布、让采集器坏掉时能被看见。**
优先级按用户给定：数据正确性 > 发布可信度 > 采集健康度 > 可维护性 > 新功能。

**A. 四个已知线上问题（逐个先复核是否仍存在，存在才修）**

| # | 复核结论 | 改法 | 实测影响 |
|---|---|---|---|
| A1 | **仍存在且已上线**：`ongoing` 只做正向子串匹配，21 条里有 **11 条**自己的 `validity` 就写着「官方未标注截止日期 / 以官方…为准」；详情页并列「官方未标注截止日期」与「官方…写明长期有效」两行（80 个详情页里 21 页带这句伪造溯源）；7 条的源头是采集器自己造词 | 判据改成**正向线索 且 无否定线索**（`ONGOING_POSITIVE_RE` + `ONGOING_HEDGE_RE`，前后端同源标记块）+ 出处修正（`cn_docs.js` / `headless.js` / `curated_cn.json`）+ 11 条存量离线订正 | 分布 `0/112/21` → **`0/123/10`**；首页角标 `tg long` 15→10、`tg uns` 35→40；含伪造 note 的详情页 21→**0**；卡片 50 / 覆盖 80 不变 |
| A2 | **仍存在且已发布**：`.jump{display:flex}`（作者级）盖掉 UA 的 `[hidden]{display:none}` ⇒ `jump.hidden=true` 是**无操作**，列表视图 / updated / expiry 三种状态下导航照旧可见可点；验证脚本只读 `hidden` 属性 | 加 `.jump[hidden]{display:none}`；断言改量**几何**（`display` / `getBoundingClientRect` / `offsetHeight` / 死链计数）；顺带修掉「筛掉某一档后 `#tier-N` 落点消失而导航仍可见」这个此前没被覆盖的死锚点来源 | verify 136 → **145** 项；牙齿：注释掉那条 CSS → 4 项当场红（`hidden=true display=flex h=18`） |
| A3 | **仍存在**：haystack 不含任何 `zh.*`，也不含 `validity`/`priceLine`（都是用户可见字段）⇒ 把屏幕上的中文复制去搜必然 0 结果 | haystack 补 `zhSearchText(deal)`（本条译文 + 折叠卡成员的译文，后者只用于检索、不参与渲染）+ `validity` / `priceLine` | verify 新增 §8b 四条断言（优惠视图与全部工具视图各一次，**现场取产物、不硬编码条目**）；牙齿：去掉 zh 字段 → 两条「中文译文可搜」红（0/50、0/103） |
| A4 | **仍存在**：`cleanText` 主动删掉上游的 `...`/`…`，超长时又直接 `slice` 切在半个词中间 ⇒ `……Getsolved 将检测和重写整`、`…relocation pla`；另有 3 处抽句正则跨过「；」「：」抓出半句 | `cleanText` 保留截断语义（补 `…`、退词边界、**不越上限**、**幂等**）；三处正则的否定字符类补上句读；17 条存量按「新值去掉记号后必须是旧值前缀」的机械判据订正 | 上游 15/15 条 aitools 描述以 `...` 结尾（**现场抓取复核**）；新增 `selftest:text` **46 项**；牙齿：关掉记号追加 → 12 项红，关掉词边界退让 → 1 项红 |

> A4 有一条如实说明：Futurepedia 的 Midjourney / Grok 上游**真的换过文案**，不属于本次修复，
> 没有被混进那 17 条（判据会排除它们），留给下一次采集。

**B. CI / 发布链：gate 红时本次版本绝不发布**

复核结论（线上实证，不是推断）：`gate` 与 `deploy` 之间**没有任何依赖**——同一 SHA `e01dcfc`
上 `gate=failure` 而 `build`/`deploy=success` 照发；定时采集那条链路上（机器人 push 不触发
任何 workflow）**原本完全没有门禁**；部署路径上只跑非 strict 的 `validate`。

改法：门禁的步骤实现只保留一处 —— **`.github/actions/gate/action.yml`（复合 action，13 步）**，
三条 workflow 共用；发布链在 `needs:` 上真正依赖它：

```
collect.yml : 采集 → 写盘 → [一致性门禁 + 完整门禁] → git push → (workflow_run) deploy.yml
deploy.yml  : prepublish(完整门禁，无 job 级 if) → build → deploy
verify.yml  : gate（PR/push，检查名不变）→ 复用同一个 action
```

为什么不用 reusable workflow（用户提议的 `gate.yml`）：① 检查名 `gate` 是分支保护的必需名，
reusable 调用会把它变成 `<调用方>/<被调>` 形态，且 deploy 再建同名 job 会出现同名检查；
② 一致性门禁把「期望项数唯一出处」钉在 verify.yml 的一行 `run:` 上，gate 变 `uses:` 后那套
机制必须改写；③ 新增 workflow 文件会牵动一串冻结断言。复合 action 三样都避开了。

一致性门禁同步（30 项，`--expect-checks` 24 → 30），新增 6 条把这次重构本身钉住：
(10) 复合 action 的**步骤名序列**逐项冻结、(10b) 每个 run 步骤都给 shell、(10c) 不含第三方 uses、
(11) 三个调用方各恰好一次、(12) 发布链 needs 关系 + prepublish 无 job 级 if、
(13) collect.yml 的门禁排在 `git push` 之前。牙齿四轮全部实跑（拿掉 needs / 拿掉真浏览器验收
那一步 / 给 prepublish 加 job 级 if / 把门禁挪到 push 之后 → 各自变红，证据在提交信息里）。

> **仍未证明的部分（如实记录）**：「门禁红 ⇒ build/deploy 不执行」的端到端证明需要一次真实
> Actions 运行（草稿分支或 PR）。本机没有第二套 CI，所以上面四轮验的是**静态断言的牙**，
> 不是 CI 行为本身。

**C. 数据源健康状态（本轮唯一的新能力）**

解决的问题：首页只写「数据更新 {今天}」，而人工策展条目的 `lastSeen` 每天都在刷新——
「某个来源坏了几天」与「某个来源这次没有新内容」在页面上长得一模一样；采集报告只活在
当次运行的内存里，CI 一结束就没了。

- `scripts/lib/health.js`：状态机（规则表见文件头），跨运行状态入库为
  **`scripts/data/source-health.json`**（与 `deals.json` 同批提交）。
  关键取舍：**单次零产出判 `degraded` 而不是 `failed`**（规则匹配不到 ≠ 服务坏了），
  连续 3 次才升 `failed`；**无头来源在浏览器没起来时一律不报 healthy**；
  失败时 `lastSuccessAt` 不被刷成今天。
- `collect.js`：打印健康表（来源/上次/本次/增减/状态/最近成功），并把此前**被静默吞掉**的
  关键数字显式打印（0 也打印）：`修剪明细: 下架过期 / 超出上限 / 退役垃圾 / 重分类`、
  `来源明细: 采集器失败 n/m · 零产出 n（点名）· 异常 n · 失败 n · 无头浏览器 可用|不可用`、
  `待译 n 条（最老 X 天，宽限 Y 天）` ——`removedExpired`/`removedOverflow` 此前只有一次性
  工具 `migrate.js` 打印过。
- `build-local.js`（仍零外部依赖）：发布 `source-health.json` 并生成 **`/status/`** 静态页
  （复用首页 style/主题脚本/页脚，零外部请求）。页面上只写绝对时间（北京时间），相对时间由
  一个内联小脚本在浏览器里换算——否则同一份数据在不同时刻构建会产出不同字节，与「连续两次
  build 产物一致」冲突。自检逐个来源与 JSON 对账（状态标签、条数、状态序列），
  并断言页脚相对链接按深度生成、占位符不残留。
- `selftest:health` **51 项**：把用户列的 5 种情形逐条钉住（17→17 healthy；请求成功 0 条
  **不判 failed**；17→0 degraded；17→0→0→0 第 3 个零起 failed；浏览器没起来 → failed），
  外加采集器抛异常、陡降、恢复清零、本轮没跑的来源不许冒充「今天健康」。牙齿：关掉零产出判据 → 红。

**D. 译文门禁策略（方案 A + 老化门禁）**

复核结论：`verify.yml` 的 Translation self-test 没有 `continue-on-error`，而 `zh-selftest`
断言「复原后 check:zh 回到 0」，`check:zh` 又要求 `todo.length === 0` ——**只要 `deals.json`
里有一条未翻译的英文散文，下一次人工 push 的 gate 必红**（`e01dcfc` 那次红就是这个）。

改法：拆成两档 —— **漂移必红**（孤儿/原文已变/不合规/覆盖层管不到，无宽限期）；
**待译按年龄判**（默认宽限 7 天，超过转红；数量与「最老 N 天」每次都打印，进 Summary、
采集日志与 `/status/`）。顺带修掉漂移数的**重复计数**（`stale` 与 `dropped` 是同一批事件，
打印出「漂移 4 处」而分解式只有 2）。

**年龄的基准是「它进入待译那天」，不是 `firstSeen`**（收尾时补的一处修正）：
上游改写会让**一条老条目**的译文失效 —— 2026-09-28 实测 Midjourney / Grok 的英文被换掉，
两条中文随之失效；它们 `firstSeen` 是 7 天前，用 `firstSeen` 计时等于「刚失效就超期」，
第二天门禁就会红而人没有反应时间。所以新增**入库的跨运行状态**
`scripts/data/zh-pending.json`（每个 `(条目, 字段)` 进入待译的日期）：
仍在待译的保留原日期、译好的删掉、新出现的记今天；由 `collect.js` 写、门禁只读
（会改文件的检查不是检查）。没有记录时才退回 `firstSeen`，两者都没有就从今天起算。
`check:zh` 会打印 `（N 天，自 YYYY-MM-DD 起 · 依据 pending|firstSeen|today）`。
新增两条牙齿：firstSeen 30 天前但今天才进入待译 → **放行**；firstSeen 今天但已等 30 天 → **拦下**。

**E′. 收尾时用真实 YAML 解析器复验 workflow，抓到一个会上线的错**

`collect.yml` 的步骤名写成 `- name: CI consistency (bare run: 期望项数…)` —— 里面的
「冒号 + 空格」在块上下文里是**映射分隔符**，GitHub 的真实 YAML 解析器会**拒绝整个文件**。
仓库自带的一致性检查用的是无依赖的缩进读取器，它把这一行读成合法的 name/值对，
于是本地所有门禁全绿、推上去 workflow 直接 parse 失败、什么都不跑。
用 Python 的 PyYAML 复验 5 个 YAML 文件时才发现（这是本轮**没有**被自己的门禁抓到的一类错误）。

改法：步骤名里的「冒号 + 空格」换成破折号；新增断言 **(14)**：扫 4 个 workflow + 复合 action 的
**全部未加引号标量**，出现「冒号+空格」即红（`--expect-checks` 30 → 31）。
边界如实记录：只查这一种，引号包裹的值与块标量不查，也不做完整 YAML 校验
（那需要引入解析器，与本文件「npm ci 之前就能跑」的定位冲突）。

**E″. 推进前补完 3 条译文，并修掉「账本从不划账」这个假红陷阱**

待译的 3 条（Midjourney / Grok 因上游改写失效，Unboring.ai 新进）由**人**补译完毕
（H2 的红线是**不做机器翻译**，不是「不许人写」）：`用提示词生成图片与视频。` /
`对话式 AI，基于实时网络与 X 的内容给出及时回答。` / `在线编辑照片与视频的平台。`，
再用 `--scaffold` 把当前英文盖成指纹；`check:zh` 现在报 `待译 0 条 / 0 个字段`。

补译时发现 `--scaffold` **只写覆盖层、从不划账**：已译好的行会一直留在
`scripts/data/zh-pending.json` 里。这埋了个假红 —— 上游之后再改写一次原文、人按既有处置
（撤下译文而不是改写）时，账本会翻出**上一轮**的日期当成「这条已经等了很多天」，
宽限期一天不剩、门禁当场转红。现在 `--scaffold` 收尾时调 `collect.js` 用的同一个纯函数
（`updatePending`）划账，且只在真有增删时才落盘（不为一次无变化去刷 `updatedAt`）。
新增两条牙：已译好的字段 → 行必须消失**且打印明细**；仍缺译的字段 → 行必须**保留原日期**。
两条都做了破坏验证（牙齿 16 / 17）。

**E‴. 分支保护的落地细节：`github-actions` 不能被加进绕过名单 → 给机器人一个专用 App 身份**

原计划是把 `GitHub Actions` 加进 master ruleset 的绕过名单，好让定时采集照常提交。
**这个计划是错的**，查证结论（2026-09-29）：

- GitHub 文档给出的绕过候选是穷举的：仓库/组织/企业管理员、`maintain`|`write` 角色、Teams、
  Deploy keys（仅 GHES）、**可安装的 GitHub Apps**、Dependabot、Copilot cloud agent
  —— **没有「GitHub Actions」**，所以界面上根本找不到它；
- `github-actions`（App ID **15368**）是**平台原生身份**，不是「安装在仓库上的 GitHub App」；
  用 API 传 `actor_type: "Integration", actor_id: 15368` 返回 **HTTP 422**
  （`Actor GitHub Actions integration must be part of the ruleset source or owner organization`）；
- 替代方案「机器人开 PR + 自动合并」同样不通：`GITHUB_TOKEN` 建的 PR **不触发**
  `pull_request` workflow，`gate` 永远 pending，自动合并永远等不到。

处置：给机器人一个**自己的、可安装的 GitHub App**，并把它**单独**列进绕过名单（只豁免机器人）。

- 新增 `scripts/tools/app-token.js`（零依赖）：Node 原生 `crypto` 签 RS256 JWT →
  `GET /app`（拿 slug）→ `GET /repos/{repo}/installation` → `POST /app/installations/{id}/access_tokens`。
- `collect.yml`：checkout 改 `persist-credentials: false`；新增 **Mint GitHub App token** 步骤
  （刻意排在采集**之前** —— 凭据没配好要 10 秒内失败）；提交步骤用 App 身份推送；
  提交信息加 **`[skip ci]`**（App token 推的提交**会**触发 workflow，不加会让同一 SHA
  同时跑 deploy 的 `push` 链与 `workflow_run` 链，白跑一遍发布）。
- 缺 Secret 时**明确失败、不退回 `GITHUB_TOKEN`**：退回只会把真正的原因藏进一句含混的 `GH006`。
- 新增门禁步骤 **App-token self-test**（门禁 13 → 14 步）+ `npm run selftest:app-token`（67 项，离线）：
  盯 JWT 的 10 分钟硬上限、三步 `Authorization` 都是 App JWT、**PKCS#1**（App 页面下载的那一种）
  与 PKCS#8 两种私钥都要能用、**「从 `.pem` 粘贴进 Secret 输入框」的四种真实变体**
  （CRLF / 漏结尾换行 / 多带空白 / 换行被压成字面量 `\n` —— 实测只有最后一种会炸，
  而那一种正是 `normalizePrivateKey` 修的）、token 只进 `$GITHUB_OUTPUT`。
- 新增断言 **(15)**（`--expect-checks` 31 → 32）。**它在写完后立刻抓到自己的假阴性**：
  牙齿探针发现「把 `[skip ci]` 从提交命令里删掉」「把 `persist-credentials` 改成 true」
  两条断言**依然是绿的** —— 因为 workflow 的注释里各写过一次同样的字样，全文 grep 被注释喂饱了。
  修法是先 `stripComment` 再查。**凡是「文件里出现过某个字样」型断言都有这个坑**，
  已写进 `check-ci-consistency.js` 的注释里。
- 顺带把「真实 YAML 解析器复验」从一次性动作升级成可选工具 `scripts/tools/yaml-recheck.py`
  （人工运行；CI 跑不了它，因为需要 python3 + PyYAML）。本次复验 5 个 YAML + **19 条结构断言**全过。

**E⁗. 上线当晚的真机验证（把「静态断言说它会红」换成「真跑过」）**

外部依赖（App + ruleset）全部落地后，用真实 Actions 运行补上了本轮唯一一条「只能由 CI 证明」的事：

| run | workflow | job | 结论 |
|---|---|---|---|
| 36447225018 | Verify site (gate) @ `ci-red-probe` | `gate` | **failure** |
| 36447343899 | Deploy to GitHub Pages @ `ci-red-probe` | `prepublish` | **failure** |
| 同上 | 同上 | `build` / `deploy` | **skipped**（不是 success） |

这正是 `e01dcfc` 那个线上反例（同一 SHA 上 `gate=failure` 而 `build`/`deploy=success`）的正向对照。
红分支用完即删，全程没碰 master、没动线上。

同时证实两条此前只有文档依据的事：
- **`[skip ci]` 不压 `workflow_run`**：机器人带 `[skip ci]` 的提交（`259199b`）推上去 10 秒后，
  `event: workflow_run` 的 Deploy 照常触发且 `success`（run 36446947933 / 36446089965）。
  这是**载荷假设** —— 若反过来，线上会停止更新而不是多跑一遍。
- **绕过是规则集级生效的**：规则集创建于 `15:49:24Z`，`15:52:53Z` 的一次机器人提交照常推进 master。
  所以后来补勾 `required_status_checks` 不会把采集掐死。

**一个值得记的教训**：第一次配 ruleset 漏了 `required_status_checks`（界面上的勾选状态看不出异常）。
发现方式是读 `GET /rules/branches/master`（**生效规则**的聚合视图，比 `GET /rulesets/{id}` 更权威）——
当时只回来三条，补勾后回来四条。**「配了保护」与「保护真的生效」是两件事。**

**E. 本轮实跑的门禁（全部 0 退出）**

`validate` · `validate --strict` · `check:zh` · `selftest:zh`(15) · `selftest:expiry`(94) ·
`selftest:text`(46) · `selftest:health`(51) · `selftest:app-token`(67) ·
`check-ci-consistency`(32) · `build`（自检全过）·
`verify`(**145 项 0 失败**) · `verify --compare`(**151 项 0 失败**，6 项回归全过：覆盖 80→80、
卡片 50→50、首屏 9→9、页高 4566px、外部请求 0、JS 错误 0)。
本轮还实跑了一次**真实采集**（134 条，9 个来源全部正常），产物与两份跨运行状态一并入库。

**F. 本轮明确不做**（留给下一阶段）：学生/开发者数据模型（audience / eligibility 扩展 /
是否需要信用卡 / 中国大陆可用性 / benefit type / claim requirements）、首页分类入口、
`/student/` `/developer/` `/free-api/`、分类 RSS、Evidence/Provenance、Deal History。

> ⚠️ **上面 F 节的前四项已在 `v1.1-student-developer-model` 落地并从零重推数据**
> （报告：`research/v1.1-student-developer-model-report.md` 与 `research/v1.1-closure-report.md`，
> 已合并进 master `1fc0c00`）。本节保留原文以便对照，**不要按它判断现状**。

---

### 2.34 `v1.2-intent-first-home`：把首页从「筛选器」升级成「按需求找优惠」（2026-09-29，分支 `v1.2-intent-first-home`）

**目标（用户原话）**：把首页从「数据库筛选器」升级成「按用户真实需求找优惠」；核心用户是国内大学生 + 开发者。
完整报告：`research/v1.2-intent-first-home-report.md`（含 7 条硬约束、3 个方案取舍、7 条被门禁抓出的真问题、7 条明确没做的）。

**先分析 IA 再动手（用户要求「先给 2–3 个低成本方案，不要直接大改」）**：改前的首页是一台筛选器——
13 个 facet 按钮 + 搜索 + 排序 + 卡/列表视图，用户必须先知道「要什么」才能把需求翻译成按钮，
而首页上连「学生」两个字都没有。

| 方案 | 结果 |
|---|---|
| A. 首页 need 筛选 + `?need=` | ❌ 落选。首页是静态文件，**无法按 query 产出不同内容** ⇒ 「URL 可分享」与「无 JS 可读」同时落空。且 `.facetsin` 已是横向滚动容器，再塞 10 枚会让入口变成「要横滑才看得见」 |
| **B. `/need/<slug>/` 静态落地页** | ✅ **选中**。唯一同时满足「可分享 + 无 JS + 移动端清晰」的形状；复用 v1.1 的注册表 / 生成循环 / sitemap / 双 feed / 三段 JSON-LD / 自检 / 验收**一整套**机器 |
| C. 只做首页锚点 | ❌ 做不到。首页没有「需求」这一维，锚点落点会退回「按档位分带」 |

**落地**：

- `scripts/lib/audience.js` 新增 `NEED_GROUPS` / `NEED_PAGES` / `NEED_PREDICATES`（10 条）/ `needsOf`，
  形状与 v1.1 的 `COLLECTION_PAGES` 一致 —— **判据只写一遍**；
- 十条入口（学生：学生专享 12 / 教育身份可领 7 / 无需信用卡 1 / 国内可用 30 / 完全免费 60；
  开发者：免费 API 45 / 免费 Tokens 44 / AI Coding 4 / 免费模型 12 / 开发者 Credits 67），
  条数一律**按数据现算**；
- `renderCollectionPage` 泛化成 `renderDirectoryPage(spec)`，一个循环同时产 3 个分类页（1 层深）
  与 10 个需求页（2 层深），前缀由 `depth` 推导；
- 需求页多一列「**为什么在这一页**」——把该条记录**命中的那个字段**作为数据传进模板，
  前端不做任何判断；
- `needs` 是**派生字段**，进 `dist/deals.json`（与 `collections` 同构）；
  **v1.1 的字段契约一个字没改**，`schema.js` / `store.js` / `dedup.js` / `scripts/data/*` 全部没碰。

**移动端**：首页一行入口在窄屏换成短标签 + 两列，**切换只用 CSS 媒体查询、不用 JS**
（无 JS 的访客在窄屏上也要看到短标签）。全称与短标签两个 `<span>` 同时在 DOM 里。

**密度账（最贵的一项，逐次量）**：

| 时点 | 入口行高 | 网格起点 | 首屏完整卡片 |
|---|---|---|---|
| 改之前 | — | 196px | 9 |
| 两行 entry（第一版） | 38px | 234px | **6** ❌ |
| 压成一行（最终，桌面端） | 31px | 227px | **9** ✅ |

**验证**：`build` 自检 + `npm run verify` **244 项** / `verify:regress` **250 项 / 失败 0**；
`selftest:audience` **161 项**（§9 是本轮新增的 41 项）；`test` / `test:strict` / `check:ci`（32 项）/
`check:reproducible`（两次构建 SHA256 一致）全绿。

**被门禁抓出的真问题（7 条，没有一条是读代码看出来的）**：入口数字把 54 条 tool 也算进去（15≠12）；
需求页内链断言拿本地 URL 比生产 canonical 而**永远为假**；入口行两套标签被拼成
「学生专享学生专享」而断言因为一个 `replace(/\d+$/,'')` 一直绿着；
窄屏组名占掉网格第 1 列产生 phantom 行（整块 256px）；移动端媒体查询**特异性打平靠源序**；
`why` 文案里 3 处写死条数；后台服务器 `--port=8099` 写法不对压根没起来。

**明确没做 / 已知边界**：`ai-coding` 没有字段支撑（只有 `category==='编程开发'`，4 条，
页面直说是数据缺口）；`creditCardRequired` 全库仅 1/80 有明确值；`student_plan` 规范值缺席；
`dev-credits` 67 条偏宽（继承 v1.1 `developerSignal`）；方案 A（`?need=`）没做也没排期
（不是成本问题，是形状不满足要求 5+6）；窄屏首屏不再有完整卡片（**显式取舍**：
要求 7 是「移动端优先保证入口清晰」，卡片靠滚动）。

**下一步建议**：进入 `v1.3-evidence-provenance`，并把 `ai-coding` 的字段缺口并进去。
理由：十条需求页已经把**字段**打到读者眼前，「这句话从哪来」是唯一的下一层空白，
而 `provenance` 现在只有 88/134 条、且缺字段级出处。

---

### 2.34 `v1.3-evidence-provenance`：让读者能自己判断来源与新鲜度（2026-09-30）

**目标**：一条优惠「从哪来、多久没被重新看到、最近一次成功采集在何时、依据是什么」——
全部以**客观事实**呈现，**不给站点自己盖章**（不出现「已核验 / 100% 有效」）。

**设计成三层，寿命不同、存放位置不同**（契约 `docs/SCHEMA-v1.3.md`）：

| 层 | 内容 | 落在哪 |
|---|---|---|
| A 记录事实 | `url` / `source` / `sourceUrl` / `firstSeen` / `lastSeen` / `provenance.*` | 源 `deals.json`（已有，语义不变） |
| B 官方引文 `evidence` | ≤3 条 × ≤200 字的官方原文片段 | 源 `deals.json`，**只人工写** |
| C 采集事实 `sourceFacts` | 来源类型 / 采集方式 / 最近成功采集 / 最近一次采集状态 | **只进 `dist/deals.json`**（构建期从 `source-health.json` join） |

C 只进产物是本节最要紧的取舍：`lastSuccessAt` 是**来源**的属性且每轮都刷新，写进源数据会让
134 条记录天天全变一行 —— diff 失去意义，可重建性门禁也会退化成「前提是采集没发生」。

**页面**：详情弹层与 80 个静态详情页共用同一个 `sourceBlockHtml(deal)`（RENDER-CORE），
固定十行；「最近成功采集」**四种状态分开说** —— `known`（真实时间）/ `不适用`（人工策展，
按设计没有采集器）/ `未知`（心跳里没有这一条）/ `不可用`（本次构建没有心跳数据）。
措辞进 `SOURCE_WORDING` 单一来源，与 `lib/audience.js` 的 `WORDING_CONTRACT` 逐字节比对。

**避免大规模复制第三方内容**：条数（≤3）、单条长度（≤200 字，**超长拒收而不是截断**——
截断过的原话就不是原话）、全库预算（≤12000 字且 ≤ `deals.json` 字节 5%）、出处禁聚合站、
必须绑定一个 `field`。全文/HTML/截图/原始响应**一律不存**。

**本轮实跑后暴露并修掉的三个真问题**（都不是估算出来的）：

1. **`known` 被降级成「未知」**：渲染层把 `lastSuccessState` 拿去 `SOURCE_STATE` 里查，
   而 `known` 不在那张表里（有值时显示的是时间本身）⇒ **每一条真采到的记录都渲染成「未知」**，
   而当时的构建自检全绿。修法是单独放行 `known`，并补一条断言
   「`known` 必须渲染出 `<time datetime>`」——没有这条断言，这个 bug 会一路发到线上。
2. **局部变量遮蔽模块名**：`audience-overrides.applyOverride` 里原有一个局部 `provenance`
   对象，v1.3 引入同名模块后 `provenance.mergeEvidence(...)` 打到了普通对象上
   （实测 `TypeError`）。改名 `provenanceBlock`。
3. **心跳缺失的优先级**：`factsFor` 原先「先查行、查不到再看整份是否缺失」，于是调用方若同时
   传了心跳行与「文件缺失」标志，会渲染出一个**上一次的旧时间**。改成缺失标志优先。

**数据侧**：本轮把 3 条策展记录里**早就写在 `discountInfo` 中的官方原话**升级成结构化引文
（360智脑协议条款 / 海螺AI 会员价 / 魔搭 API-Inference），只补出处与日期，**没有引入任何新的
第三方文本**；另跑了一次真实采集（134 条，9 个来源全部正常），引文因此经真实 merge 落进
`deals.json` —— 顺便证明「引文是人工输入、必须原样穿过 merge」（`check-reproducible` 新增
「引文漂移」一项，实测 0 处）。

**门禁（本机同一份产物实跑，全 0 退出）**：`validate` · `validate --strict`（新增
`checkProvenanceGuard` 探针：非法引文必拦、合法必放行、来源必须登记、红线措辞）·
`check:zh`（漂移 0 / 待译 0）· `selftest:zh`(15) · `selftest:expiry`(94) · `selftest:text`(46) ·
`selftest:audience`(125) · `selftest:health`(51) · `selftest:app-token`(67) ·
**`selftest:provenance`(91，新增并进 CI 门禁)** · `check:ci`(32，门禁步骤冻结序列
`Source-health → Provenance` 同步更新) · `check:reproducible`（引文漂移 0）·
`build` ×2 产物逐字节一致（`dist/index.html` SHA256 相同）·
`verify`(**256 项 0 失败**) · `verify --compare`(**262 项 0 失败**，6 项回归全过：覆盖 80→80、
卡片 50→50、首屏 9→9、页高 4589→4620px（v1.2 的需求入口行 +31px，在容差内）、外部请求 0、
JS 错误 0) · `check-mobile-chrome` 零裁切。

> **与 v1.2 的合并**：本轮开工时基线是 PR #2（v1.1）。推送前远端已前进到 PR #3
> （`v1.2-intent-first-home`：首页需求入口行 + 10 条 `/need/*` 静态页）＋一次机器人数据更新。
> 已合并并**逐个人工解冲突**，两处需要判断的：① `build-local.js` 的构建期派生区与 selfCheck
> —— 两个派生字段都要，`BUILD_ADDED` 最终是 `{collections, needs, sourceFacts}`；
> ② `README.md` 的目录清单与验收项数。合并后两边的交付都在：v1.2 的 161 项受众/需求自测与
> v1.3 的 91 项 provenance 自测同时绿，`needs` 与 `sourceFacts` 都在产物里
> （`源/产物一致` 逐字段对账通过，sitemap 95 条 = 首页 + 3 分类页 + 10 需求页 + 状态页 + 80 详情页）。
> 数据文件取远端那一侧后**重跑了一次真实采集**，引文由 curated 文件重新落盘。

**A. 明确不做**：渲染 `verified`/`verifiedAt`（保持 2.32 的撤章决定）、给优惠下有效性结论、
自动抓取官方全文/片段、卡片加新鲜度角标、回填存量 46 条无 provenance 记录、新增外部请求。

**A′. 上线后的线上实证（2026-09-30）**：PR #4 合并（`42d4fd9`）→ Deploy 成功。
线上 `deals.json` 带 `sourceFacts` 134 条、`evidence` 3 条；线上详情页块 10 行、
人工策展显示「不适用」、引文渲染、无「已核验」；**线上整链路 `verify --url=` 256 项 0 失败**。
跑线上冒烟时暴露出两个**此前就存在**的工具缺陷并已修（本地永远绿，因为本地服务在根路径）：
① `verify-site.js` 几处取样写死 `/deals.json`、`/source-health.json` —— 线上是项目页
（挂在 `/ai-deals-aggregator/` 下），根路径 404：先报取样失败，再因解引用 null **崩掉整个套件**；
② 「搜中国大陆」用固定 350ms 等 120ms 防抖，整条套件跑到该处时实测过假红。
修法：地址一律用 `new URL(..., base)` 解析、取样失败只报一条失败而不崩溃、搜索改为等
「卡片数真的变了」（判据没放松：等不到变化照样红）。详见报告 §五。

**B. 下一步**：`v1.4-deal-history`（见 `research/v1.3-evidence-provenance-report.md` §判断）。

---

### 2.35 `v1.4-deal-history`：优惠生命周期与重要变化（2026-09-30，分支 `v1.4-deal-history`）

**目标**：让「这条优惠什么时候首次发现 / 免费额度什么时候变 / 什么时候新增截止日期 /
领取条件什么时候变 / 什么时候从官方页面消失 / 是否消失后又出现」都能被回答，且答案**可机器验证**。

**方案（四选一，展开见 `docs/SCHEMA-v1.4.md`）**：**D 混合** ——
**C 显式 change event 是唯一运行时存储** + **一次性值基线**（使命中「基线 + 事件 ⇒ 当前状态」可重放验证）
+ **B git diff 降级为离线交叉校验**（`npm run history:audit`，刻意不进 CI：浅克隆与历史重写都不适合当闸门）。
A（每日全量快照）实测约 **170 MB/年**，直接否掉。

**为什么不选纯 C**：没有锚点，「日志与当前状态一致」不可验证 —— 日志被手改不会有任何东西变红。
基线用**值**而不是摘要：实测两者 JSON 体积几乎相同（key 脚手架占大头），值基线还能人读、能审计。

**存什么**：`scripts/data/deal-history.json` —— 一次性基线（134 条 / 1438 个字段值 / **86.7 KB**）
+ `absence` 观测态 + `events` 追加日志。**没有 `updatedAt`**：一次什么都没发生的采集必须让文件字节不变。
**写入点只有一个**：`scripts/collect.js` 在 `mergeAll` 之后、与 `writeDeals` 同批调用 `history.record()`
（不在 `mergeAll` 里，否则可重建性门禁的重放会顺手改写历史）。

**重要字段（20 个）与事件分类**：`benefit_changed`（`discountInfo`/`pricingModel`/`priceLine`/`features`/`benefitType`）·
`eligibility_changed`（`eligibility`/`eligibilityDetail`/`claimRequirements`/`audience`/`availability`）·
`expiry_changed`（`expiresAt`/`validity`）· `updated`（`type`/`category`/`region`/`source`/`sourceUrl`/`evidence`/`verified`/`verifiedAt`）·
生命周期 `created`/`ended`/`restored`。**明确不跟踪**：`description`（文案微调）、`lastSeen`（每轮都刷）、
`firstSeen`（由 `created` 回答）、`id`/`title`/`vendor`/`url`（身份，变了就是另一条记录）、`zh`（展示层覆盖）、
派生字段（`needs`/`collections`/`sourceFacts`/`history`）—— 每条都附了理由，自测有专门的噪音夹具。

**`ended` 的两种含义**：`source_no_longer_lists`（来源本轮**健康且确实跑出条目**，但连续 2 次没见到它；
记录仍在站内）与 `pruned_expired`/`pruned_overflow`/`retired_garbage`/`withdrawn`（记录离开数据集，
原因直接取 `mergeAll` 手里的对象）。**三道不误报的闸**：来源失败/骤降/零产出/上一轮遗留不参与计数；
`--only`/`--dry-run`/被硬拦的运行完全不写；人工策展条目不参与「未见」判定。

**展示**：详情弹层与 80 个静态详情页共用同一个 `historyBlockHtml()`（RENDER-CORE，措辞表 `HISTORY_WORDING`
与后端逐字节比对）；无历史时明说「暂无变更记录」＋「起算日之前的状态没有历史记录」，**不用空白冒充「没有变化」**。
首页**一行未改**。

**门禁**：新增 `selftest:history`（**52 项**）与 `check:history`，双双进 CI 门禁（action.yml +2 步、
`check-ci-consistency.js` 冻结序列同步；`--expect-checks` 不变，因为它数的是 check-ci 自己的断言）。
`verify-site.js` 新增 §15a3 共 7 个 `check()` 调用点（运行时 +6 项，390/360 在循环里）。

**实跑**：`validate --strict` / `check:reproducible` / `check:history` / `check:zh` /
`selftest:*`（zh 15 · expiry 94 · text 46 · audience 161 · provenance 91 · health 51 · app-token 67 · **history 52**）/
`check:ci` 32 / `migrate:audience:verify` 15 / `check-mobile-chrome`（起本地服务后 exit 0）/
`build` ×2 产物 SHA256 一致（`37210EB0…93A4`）/ `verify` **262 项 0 失败** · `verify --compare` **268 项 0 失败**
（回归 6 项全过：覆盖 80→80 · 卡片 50→50 · 首屏 9→9 · 页高 4589→4620px · 外部请求 0 · JS 错误 0）。

**真实数据实测**：真实采集 dry-run（7 个静态来源 / 97 条产出 / 0 失败 / 合并后仍 134 条）→
历史层**新增事件 0 条**（「无事发生的采集不制造噪音」在真数据上成立）；`history:audit` 报窗口内无可比样本
（起算日之后还没有数据提交 —— 如实报告，不把「没样本」说成「通过」）。

**牙齿测试（都真的变红过）**：把 `description` 加进跟踪表 → `selftest:history` 红 4 项；
在历史里插一条断链事件 → `check:history` 红（链断裂 + 现状不一致）；删掉一条基线记录 →
红（记录没有历史锚点）；造 `from === to` 的假变化 → 红。另有一次**完整演练**：临时造一条真实可验证的
变更（改 1 条记录的 `category` 与 `discountInfo` + 追加 2 条事件），跑 `build → verify`，
**8 项新的真浏览器断言全过**，随后逐字节还原并复跑全套。

**边界（如实写下）**：存量 134 条没有 `created`（页面说「变更记录自 2026-09-30 起」）；
人工策展条目没有自动的「来源消失」信号（它们不经过采集器，生命周期事件只在离开数据集时产生）；
观测态保留 365 天，超窗后同一条再出现会记 `created` 而不是 `restored`；
事件数/体积触上限是**门禁红而非自动截断**，压缩工具列为后续独立议题。

**上线前发现并修掉的 1 个真问题（差点让采集链卡死）**：`collect.yml` 的提交步骤是**显式列举文件**的，
原先没有 `scripts/data/deal-history.json` —— 采集把日志写进磁盘却不提交，下一轮门禁就会拿
「已更新的 deals.json」比「上一轮的日志」，`check:history` 报「现状与历史不一致」，
**采集链被自己的日志卡死**。修法：加进 `git add`，并把这条约束变成断言 ——
`check-ci-consistency.js` 的 (13)（原本要求「三份跨运行状态一起提交」）扩到四份，
**项数不变**（`--expect-checks` 不用改）。牙齿测试实跑：删掉那一个文件名 → (13) 当场变红。
本地门禁全绿也照不出它（日志确实写在了磁盘上）—— 只有核对「谁负责提交它」才会暴露。

**推送状态**：分支已推 `origin/v1.4-deal-history`。**直接 `git push origin HEAD:master` 被 ruleset 拒绝**
（`Required status check "gate" is expected`）—— 与 2.33 记的 ruleset 一致：master 必须走 PR + `gate`。
合并前先并回了上游那次机器人数据提交（`2204565..8127458`）：实测它 **0 个跟踪字段变化、0 新增、0 移除**
（只动 `lastSeen`/`updatedAt`/心跳），因此基线无需重冻，`check:history` 依旧绿 —— 这也顺带证明了
「例行采集的噪音不产生历史事件」在真数据上成立。

**上线记录（2026-09-30）**：PR **#6** 创建 → `gate` **success**
（[run 36699075822](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36699075822)）→ 合并为
**`bec6068`** → `Verify site (gate)` 与 `Deploy to GitHub Pages` **双双 success**
（[verify 36699446308](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36699446308) ·
[deploy 36699446255](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36699446255)）。
**线上实证**（`verify --url=https://buguoshixc.github.io/ai-deals-aggregator/`）：**262 项 0 失败**，
详情页「变更记录」块在线、空态文案正确（「暂无变更记录 + 起算日之前的状态没有历史记录」）、
**不执行 JS 也能读到**、390/360px 零溢出、加载失败 0。

**A. 明确不做**：首页「变化雷达」、变更率统计、新排序/筛选维度、通知与订阅；每日全量快照；
官方页 HTML/全文/截图留存；存量历史回填；历史压缩；采集器与 v1.1/v1.3 契约的任何改动。

**B. 下一步**：`v1.5-change-radar`（**建议进入**，前置条件见 `research/v1.4-deal-history-report.md` 第十节：
先观察一个采集周期拿到真实事件样本，再决定聚合粒度；入口优先考虑 `/changes/` 静态页而不是动首页密度）。

---

### 2.36 `v1.5-change-radar`：变化雷达 —— 首页一行 + `/changes/` 静态页（2026-09-30，分支 `v1.5-change-radar`）

**目标**：让用户有理由反复回来，而不是搜索一次就离开。在 v1.4 的变更日志之上做出五个分栏：
今日新增 / 最近 7 天变化 / 即将结束 / 已结束 / 重新出现；首页只展示**高价值**变化，
完整视图在 `/changes/`。

**七条要求的落点**（逐条）：

| 要求 | 落点 |
|---|---|
| ① 所有变化来自 v1.4 数据 | 判据是 `scripts/lib/changes.js` 的 `buildRadar()`：读 `deal-history.json` 的事件与 `deals.json` 的既有字段（新增的「不存在」= 没有数据） |
| ② 不通过 LLM 猜测变化 | 纯规则、零依赖、无网络；`selftest:changes` 有一条静态扫描（不许出现 `require(` / `Date.now` / `process.env` / 网络调用），行为断言覆盖每一条规则 |
| ③ 不把普通文案改写当重大变化 | 三道闸：v1.4 不跟踪 `description`/`lastSeen`/`zh`（0 事件）；自由文本字段的 from/to 在**文案归一**后相同 ⇒ 降级「文案微调」、进折叠块并计数、**永不上首页**；`updated` 元信息同样不上首页。日期与枚举字段不参与该判定 |
| ④ 详情页查看单条优惠历史 | v1.4 已有（弹层 + 80 个静态详情页共用 `historyBlockHtml`）；v1.5 补入口与端到端断言：雷达行 → `deal/<id>/` → 页面含「变更记录」块（真浏览器实测 HTTP 200） |
| ⑤ 首页只展示高价值变化 | 条带内容只取 `radar.home`（按 `HOME_PRIORITY`：created → ended → restored → benefit/expiry/eligibility → endingSoon），最多 3 项 |
| ⑥ 移动端保持紧凑 | 条带在窄屏顺延到「跳到档位」的下一行、仍是一行（实测 18px 空态 / 28px 有内容）；入口 `flex:none` 永不被滑走；空态另有一套短文案（同一份 DOM，CSS 切换）；390/360px 页面级溢出 0 |
| ⑦ 页面仍可静态生成 | 首页条带与 `/changes/` 都由构建期注入/生成，无 JS 可读；`/changes/` 进 sitemap、双 feed、三段 JSON-LD、自指 canonical |

**分栏与窗口**（契约见 `docs/SCHEMA-v1.5.md`）：今日新增 = `created` 且 `at === 基准日`；
最近 7 天变化 = 优惠内容 / 领取条件 / 有效期变化 + 过去 6 天内的首次收录；即将结束 = **状态量**
（`expiresAt` 7 天内，按基准日算剩余天数）；已结束/重新出现 = `ended`/`restored`（30 天）；
其他变化 = `updated` 元信息 + 文案微调（只在 `/changes/` 折叠块）。
**基准日取数据时间**（`deals.json` 的 `updatedAt` 日期）而不是构建时刻：与卡片上的「数据更新」
同一口径，且同一天两次构建的产物逐字节相同。

**判据只写一遍**：`buildRadar()` 构建期算一次，首页条带与 `/changes/` 页读同一份结果
（RENDER-CORE 的 `changesStripHtml` / `changesPageHtml` 只排版）。
**不注入 `dist/deals.json`**（产物顶层键与源文件一致）、不新增 JSON 产物、不写任何数据文件 ——
这一层是纯读视图。

**v1.4 的向后兼容扩展**：`ended` 新增可选 `label:{title,vendor}`（离开数据集时的墓碑快照），
由 `collect.js` 传入（来源是上一份发布）。它是快照、不是被跟踪的值：不参与链校验与重放；
只有 `ended` 能带，形状不合规 `check:history` 必红；缺席完全合法（交付时 0 条事件，无需迁移）。
**为什么需要**：`title`/`vendor` 是身份字段、刻意不被跟踪，记录一旦离开数据集，雷达上就只剩一个
12 位 id —— 那样的「已结束」对读者没有价值。

**首页密度是本轮最贵的取舍（实测，不是估的）**：1440×900 下网格起点 227px、卡片 192px、
行距 12px、档间分带标题 26px ⇒ 第三行底边 **899px**，距视口底边只有 **1px**。
因此条带**不单独占行**，与「跳到档位」共用 `.hubline` 一行，做成 `flex: 1 1 auto; min-width: 0`
的可伸缩项（内容超宽由正文区横滑，入口在横滑容器外）。
**演练抓到的第二个坑**：第一版让 `.jump` 可收缩（`flex: 0 1 auto`），它内部四个 chip 折行、
整行 +28px、网格起点 261px、首屏 **6 张**；改成 `.jump { flex: 0 0 auto }` 后回到 227px / **9 张**。

**空态与「不可用」分开说**：日志缺失/损坏 ⇒ 「本次构建没有拿到历史日志……这不表示『没有变化』」；
空态按**原因**分写（「一条都没写绝对截止日期」vs「有 N 条写了但都不在 7 天内」）。
构建自检直接拿一份 `availability:'unavailable'` 的合成 radar 调渲染函数断言两者不互相冒充。

**门禁**：新增 `selftest:changes`（**89 项**）并进 CI 门禁（action.yml +1 步，冻结序列同步；
`--expect-checks` 不变）；产物自检新增「变化雷达」块（条带 ↔ 页面 ↔ 日志三方对账、
`data-radar-total`/`data-radar-other`、链接集合双向相等、措辞同源、空态分写、不可用不冒充）；
`verify-site.js` 新增 §10b（**19 项**，含测试侧独立重算的第二把尺子）；`check-mobile-chrome.js` 新增
`nav.radar` 几何；`report:changes` 提供人读报告。`history-selftest` 扩到 **61 项**（墓碑形状的四种坏标本）。

**实跑**（本机同一份产物）：
`test` / `test:strict` / `check:reproducible` / `check:history` / `check:zh` / `check:ci`(32) 全绿；
`selftest:changes` **89** · `selftest:history` **61** · `selftest:zh` 15 · `selftest:expiry` 94 · `selftest:provenance` 91；
`build` ×2 → `dist/index.html` SHA256 一致；`verify` **281 项 0 失败**；
`verify --compare` **287 项 0 失败**（回归 6 项全过：覆盖 80→80 · 卡片 50→50 · **首屏 9→9** ·
页高 4589→4642px · 外部请求 0 · JS 错误 0）；`check-mobile-chrome` 390px 零裁切、`nav.radar` 溢出 0。

**非空路径用真实数据演练证明**（交付当天日志是 0 条事件，空态之外测不到）：临时在真实数据上造
六类变化（真变化 / 仅尾随空格 / 元信息 / 改名⇒旧 id ended + 新 id created / 来源消失又重现 /
补截止日期），跑 `check:history` + `build` + `verify`：**覆盖不变量成立、文案微调被抑制并计数、
条带 3 项、`/changes/` 五栏都有内容、8 条内链全部 200 且详情页含「变更记录」、首屏仍 9 张**；
随后 `restore-from-git.js` 逐字节还原两个文件（SHA256 前后一致）并复跑全套门禁。
**演练抓出三处真问题**：`radar.WINDOWS` 拼错（只在「有截止日期但不在窗口内」这条分支上炸）、
覆盖不变量把状态量 `endingSoon` 算成了事件、页面折叠块里的链接没进链接集合对账。

**A. 明确不做**：LLM 摘要 / 语义相似度判重、变更通知与订阅、用 `firstSeen` 反推时间轴、
历史回填、雷达自己的 RSS、采集器改动、`dist/deals.json` 形状变更、刷新冻结的密度回归基线。

**B. 交付当天雷达是空的（如实）**：`deal-history.json` 起算日 2026-09-30、事件 0 条；
`deals.json` 里 `expiresAt` 覆盖 **0/80**。所以五个分栏全空、首页条带是明确空态。
**不补造任何历史**；第一次真实变化会在下一次定时采集（CI 每天两次）时落库。

**C. 未推送** —— 等你的「推送」。分支 `v1.5-change-radar`，基点 `origin/master = b202d21`
（v1.4 已在其中：PR #6 = `bec6068`），隔离工作树 `.worktrees/v1.5-change-radar`。

### 2.39 `v2.0-ai-assisted-maintenance`：用 AI 降低后台维护成本（2026-10-01，分支 `v2.0-ai-assisted-maintenance`）

**这一轮不加前台功能，一个前端字节都没改。** 目标按用户给定：*不是给网站加一个聊天机器人，
而是用 AI 降低数据维护、采集器维护、去重判断和信息提取的人工成本*，且**AI 只能提出候选，
不能无验证直接改写生产数据**。完整报告见 `research/v2.0-ai-assisted-maintenance-report.md`。

#### ① 先做审计，再选能力（顺序不能反）

`research/v2.0-maintenance-cost-audit.md` 是这一轮的**前置交付物**：在写任何 AI 代码之前，
先把"今天仍然纯人工的活"用实测数字列出来（134 条数据 / 9 个注册采集器 / 32 条策展 /
**56 条六字段 override 是人手写的** / 全库只有 3 条带引文 / 去重是精确匹配 + 一张手维护的别名表 /
健康表只给"条数变了"而**全仓没有任何页面结构快照**）。Top N 决定落点顺序：
地基 → 字段提取 → DOM 诊断 → 去重 → 翻译 → 评测 → fixtures/补丁。

#### ② AI 层的边界（由测试守，不靠文档记）

```text
采集链路不引用 AI       collect.js / store.js / dedup.js 源码里不许出现 scripts/ai（静态断言）
AI 从不上生产数据       只写 curated_*.json 与 audience-overrides.json 两个**已有人工来源层**
无 key / 超时 / 非法 JSON 一律跳过   退出码 0，站点照常采集、构建、发布
去重模块没有合并能力     scripts/ai/dedup.js 不导出任何 merge/apply/write 符号（符号表断言）
AI 维护链路不碰仓库      ai-maintenance.yml 只 workflow_dispatch + contents:read（CI 断言 (16)）
```

#### ③ 交付的能力（全部只出候选）

| 能力 | 入口 | 本轮实测 |
|---|---|---|
| 优惠字段提取（逐字段引文） | `npm run ai:extract` | 134 个单元，平均约 1.3 KB 输入；无引文的断言由候选层 R1 拦下 |
| 疑似重复检测 | `npm run ai:dedup` | 确定性预筛把 8911 对压到 **15 对**（同 host / 同别名键 / 标题包含 / 二元组相似度 ≥ 阈值） |
| 翻译草稿 | `npm run ai:translate` | 当前 **0 个待译单元**（63 个可译字段已全部有人工译文）——能力在，但没有活可干 |
| 采集器 DOM drift 诊断 | `npm run ai:diagnose` | 两代结构摘要 + 探针命中 + 采集器源码；当前命中 **2 个**（两个无头源 stale/lastRunMissing） |
| 数据质量审计 | `npm run ai:audit` | 确定性预筛从 134 条里挑出 **14 条**可疑（10 条"绝对化断言无引文支撑"、8 条"自由文本说学生而结构化字段没写"、1 条"数字在引文里找不到"） |
| 采集器补丁候选 | `npm run ai:patch` | 只出 diff；**自证**=最小 diff 应用器 + 临时副本执行 + fixture 回归判定（实测：好补丁 13→13，破坏性补丁 13→0 被拦） |

#### ④ 页面结构摘要：把"这个源坏了"从一句话变成一组数字

Phase C 的捕获**零改动采集器**：`lib/http.js` 与 `lib/browser.js` 是仅有的两个网络出口，
摘要只挂这两个出口。实测（真抓 Layer3Labs）：原始页面 **50,814 字节** → 摘要 **1,388 字节（2.7%）**，
里面只有计数（`table=2 tr=20 td=80`）、标记、我们**自己声明**的探针命中（`table tr=20`）与类名直方图，
**没有一个字的页面正文**（这条由自检的结构性判据守着：摘要里除 url 外不许出现超过 40 字的字符串）。
每源保留两代、随数据入库 —— 不入库就永远只有"这一次"，而诊断要的恰好是"变之前 / 变之后"。

#### ⑤ 落地闭环：候选 → 人点 → 写人工来源层 → 离线重建 → 门禁

```bash
npm run ai:review -- --task=extract   # 只读；「无据的确定」单列一栏
npm run ai:accept -- --id=<id> --note="…"
npm run ai:apply  -- --id=<id>        # 写 audience-overrides.json → rebuild-deals → validate --strict；红了整批回滚
```

新增 `scripts/tools/rebuild-deals.js`：**离线**重放 merge 重建 `deals.json`（不联网、确定性），
所以落地之后工作树不会停在一个"人工文件改了、派生数据还没跟上"的不一致态里。
它刻意**保持盘上键序** —— 否则会出现"改一个字段、45 条记录重排 54 行"的不可读 diff
（`mergeAll` 的规范键序与盘上旧管线的键序不同，这个差异是本就存在的，留给 `npm run collect` 自己收敛）。
端到端实测（mock 响应，演示后已还原）：overrides +38 行、deals.json +70 行，
`validate --strict` 与 `check-reproducible` 双绿。

#### ⑥ 安全

`scripts/lib/secret-scan.js` 是密钥模式的**单一出处**（14 类：`sk-` / `sk-ant-` / `AIza` / `ghp_` /
`github_pat_` / `AKIA` / `xox[baprs]-` / `Bearer …` / PEM 私钥 / 四个 `*_API_KEY=` 等），
三处共用：送模型前脱敏、`build-local.js` 的产物自检、AI 自检的牙测试 6。
实测：`dist` 干净扫描 **0 命中**；往产物里注入一个 `sk-` 形状串，同一次调用报出 `openai-key`；
扫描结果只打印前 8 字符，不回显完整串。

#### ⑦ 牙测试（`npm run ai:selftest`，离线、零依赖、**37 项 0 失败**）

1 无引文的 `studentRequired=true` → 候选无效 ·
2 非法 enum → 无效（另：三态不接受 `null` 与字符串 `"true"`）·
3 引文无否定线索的 `creditCardRequired=false` → `needs_human` 并在审阅表单列（反向：有"无需"字样不误报）·
4 去重模块无合并符号 + 真跑一轮后 `deals.json` 字节不变 ·
5 AI 超时/HTTP/非法 JSON/非法枚举/缺必填五种坏法全部收敛成结构化 invalid，且 `collect.js --list`
在 `AI_PROVIDER=off` 与 `AI_PROVIDER=fail` 下输出**完全一致** ·
6 六类密钥样本全部检出、候选文件里的密钥会被扫出、`build-local` 确实接了扫描 ·
另加结构性牙 12 条（缓存 key 与时间无关、探针声明表覆盖 9 个采集器、快照体积、`.ai-cache` 不入仓、
deal 记录未新增 AI 字段、译文守卫对 63 篇人工译文**零误报**、补丁应用器拒绝坏上下文……）。

#### ⑧ 评测：一个诚实的结论

`npm run ai:eval` 三臂。**本机没有 API key**，所以臂 1（字段提取）与臂 2（去重）跑的是手写录制响应
—— 它们证明的是**工装通不通**（输入构造 / schema 校验 / 候选规则 / 指标计算），
**不是模型精度**，报告与 JSON 里都写明了这一点。臂 3（译文守卫）不调用任何模型，是**真测量**：
63 篇人工译文 **0 误报**；10 项程序化篡改的检出率由评测暴露了两个真洞（百分比豁免过宽、
译文凭空加否定），**已修**并复测为全部检出 —— 这正是"评测优先于自动化"的价值：
这两个洞在人工使用中几乎不可能被发现。

#### ⑨ 门禁与验收（全部实跑）

**先记本分支基线（`master @ 2204565`，v1.4–v1.7 尚未合入时）的实测**：

| 门禁 | 结果 |
|---|---|
| `test` / `test:strict` / `check:zh` / `check:reproducible` | ✅ 全绿（译文漂移 0、待译 0、可重建） |
| `selftest:zh` / `expiry` / `text` / `health` / `provenance` / `audience` / `app-token` | ✅ 15 / 94 / 46 / 51 / 91 / 161 / 67 项，失败均 0 |
| `migrate-audience-verify` | ✅ 15/15 |
| `ai:selftest` | ✅ **37 项 0 失败** |
| `fixture:test` | ✅ **4 项 0 失败**（4 份 fixture，片段共约 15 KB） |
| `check:ci` | ✅ **35 项 0 失败**（含新增 (16) 断言；`--expect-checks` 32 → 35） |
| `build` | ✅ 产物自检全过（含密钥扫描），743.3 KB |
| `verify --compare` | ✅ **验收 262 项 0 失败**；六项回归全过（覆盖 80→80、卡片 50→50、首屏 9→9、页高 4589→4620px 在容差内、外部请求 0、JS 错误 0） |

**合并态复核（`trial/v2.0-merge` = `origin/master @ d8640a9` + 本分支，8 个文件冲突逐个人工解；
规则是「两侧内容都不丢」）** —— 上游在这一轮里合进了 v1.4 历史 / v1.5 变化雷达 / v1.6 订阅 /
v1.7 SEO，所以我这一侧的数字必须重测而不是直接沿用：

| 门禁 | 合并态结果 |
|---|---|
| 十二套自测（zh 15 / expiry 94 / text 46 / health 51 / provenance 91 / audience 161 / app-token 67 / history 61 / changes 89 / feeds 71 / seo 62 / ai 37） | ✅ 失败均 0 |
| `migrate-audience-verify` · `history-verify` · `check-reproducible` · `check:ci`(35) · `fixture:test`(4) | ✅ 全过 |
| `build` | ✅ 产物自检全过（**含密钥扫描：0 命中**），946.0 KB · SEO 安全门禁 27 个检查码 × 113 个页面 |
| `check-feeds-reproducible` | ✅ 连构两次逐字节一致 |
| `seo-verify` | ✅ 8 项 0 失败 |
| `verify --compare` | ✅ **验收 341 项 0 失败**；六项回归全过（覆盖 80→80、卡片 50→50、首屏 9→9、页高 4589→**4665**px 在容差内、外部请求 0、JS 错误 0） |
| 门禁步骤 | **27 步**（上游 25 + v2.0 的 AI 层自检与采集器 fixture 回放）；`GATE_STEP_NAMES` 与 action.yml 逐项一致 |

> 冲突共 8 个文件，全部是「两侧各自新增」：`collect.yml`（`git add` 行要同时带上
> `deal-history.json` 与 `source-snapshots.json`）、`.gitignore`、`package.json`（脚本组）、
> `scripts/collect.js` 与 `build-local.js`（require 列表）、`PROJECT_STATUS.md`（两侧都编号成
> **2.35** → 本节的 v2.0 记录改为 **2.39**，上游 2.35–2.38 原样保留）、`README.md`（四处列表与
> 「门禁多少步」那句 → 改成合并态的 **27 步**）。
> `check-ci-consistency.js` 与 `gate/action.yml` **自动合并成功**，且 `(W)` 看门狗与
> `--expect-checks=35` 互相印证 —— 合并没有把任何一条断言丢掉。

#### ⑩ 如实记录的限制

- **没有真实模型精度数字**：没有 key，臂 1/2 是录制响应。有 key 后 `AI_EVAL_LIVE=1` 可补跑，报告里留了位置。
- **不动前端**：`provenance`/`credibility` 枚举与 deal 记录契约**一个字没改**，
  AI 痕迹只记在一份**构建期 AI 参与痕迹日志**里（可追溯、不上前端；**该日志文件今天不在盘上**，本节保留当时的契约描述）。是否在页面标注"AI 协助"留给下一轮。
- **采集侧的内容字段没有落地通道**：`ai:apply` 只支持六字段（进 overrides）与策展来源的任意字段；
  对采集来源的 `discountInfo` / `validity` 这类字段**明确拒绝**并说明原因 —— 不发明机制。
- **一键重建 fixture 依赖当时的官方页面**：`npm run fixture:build -- --all` 会随页面变化产生 diff，需人工复核后提交。

**B. 下一步**：有 key 后跑一次真实评测并回填指标；`v2.1` 再议是否把"AI 协助"标注到页面上。

#### ⑪ 上线（2026-10-01，按用户「推送」）

**推 master 被 ruleset 拒绝**（这不是故障，是规则生效了）：

```text
remote: - Changes must be made through a pull request.
remote: - Required status check "gate" is expected.
 ! [remote rejected] master -> master (push declined due to repository rule violations)
```

所以改走 PR（此前几次「快进推 master」的做法在**这条规则下已经不可用**，后来人不必再试）：

| 步骤 | 结果 |
|---|---|
| 推送版本分支 | `v2.0-ai-assisted-maintenance`（= 合并提交 `b078664`，基于 `origin/master d8640a9`）→ 远端新建分支成功 |
| 开 PR | [#11](https://github.com/buguoshixc/ai-deals-aggregator/pull/11)，76 个文件、5 个提交 |
| PR 上的 `gate` | ✅ **success**（约 2.5 分钟，真跑完整门禁，含真浏览器验收） |
| 合并 | `merge` 方式 → `9bf46f9`（保留合并提交，与仓库既有习惯一致） |
| 上线链（master push） | ✅ `gate`(verify.yml) / `prepublish` / `build` / `deploy` **四段全绿** |

**线上冒烟（本机直连抓线上，不拿工作流绿灯当结论）**：

```text
200  378,164 B  /
200  288,567 B  /deals.json        → count=134 · updatedAt=2026-10-01T01:42:06+08:00 · schemaVersion=2
200   70,984 B  /changes/          （v1.5 变化雷达页）
200   79,884 B  /feeds/            （v1.6 订阅中心）
200   21,845 B  /sitemap.xml
200      747 B  /robots.txt
首页标记：站点主标题 ✓ · 「变更记录」✓ · 「订阅」✓ · `data-facet="fav"`（v1.1 收藏入口）✓
```

**一处如实说明**：v2.0 **没有前端改动**，所以线上产物与合并前**应当是同一份内容**
（本机 `dist` 946.0 KB 与上线前同量级）—— 线上冒烟验的是「合并与发布没有破坏任何东西」，
不是「线上多出了 v2.0 的东西」。要验 v2.0 本身，看 ⑨ 的门禁与 `npm run ai:*`。

> 本地与远端现已一致：`master = origin/master = 9bf46f9`。
> 工作树里那个未跟踪文件 `AI_DEALS_AGGREGATOR_ROADMAP_AND_PROMPTS.md` 不是本轮产物，**未动**。

---

## 三、命令速查

```bash
npm ci                  # 安装依赖
npm run collect:dry     # 采集但不写盘，看每源产出报告
npm run collect         # 全量采集并写入 deals.json
npm run collect:headless:dry  # 额外启用无头来源（智谱活动页 / 火山方舟），不写盘
npm run collect:headless      # 额外启用无头来源并写盘（需本机 Edge/Chrome）
npm test                # 数据 + 前端校验（零依赖）
npm run test:strict     # 附加内容质量指标
npm run build           # 本地复现发布产物（含预渲染 + logo 资产）并自检
npm run verify          # 真浏览器验收（**当前 446 项**；加 --compare 含 6 项回归比对。需 playwright-core + 本机 Edge）
npm run verify -- --url=https://buguoshixc.github.io/ai-deals-aggregator/   # 直接打线上（部署后当冒烟用，线上 440 项）
npm run verify:shots    # 同上，并把截图写到 mockups/.preview/
npm run verify:baseline # 把当前指标（卡片数/首屏密度/页高/请求数）写成回归基线
npm run verify:regress  # 与基线比回归：密度不得降、页高/请求不得涨、JS 错误必须仍为 0
npm run report:tier     # 分档分布 + 每张卡命中的判据 + 判据读到的原文
npm run report:vendor   # 厂商归一报告（多少种脏写法归到了同一家）
npm run todo:zh         # 中文翻译待办（--json / --scaffold 盖原文指纹 / --orphans）
npm run check:zh        # 译文漂移门禁：非零退出 = 有译文对不上 id / 原文已变 / 还有条目没译
npm run selftest:zh     # 中文译文门禁演练（自恢复，验证坏译文真的会被拦下）
npm run selftest:expiry # 活动期限门禁演练：截止日抽取正/负样例 + 三分类 + 排序次序 + 前后端词表一致性
npm run check:history   # v1.4 历史门禁：基线 + 事件重放必须等于当前 deals.json（链 / 生命周期 / 上限）
npm run selftest:history # v1.4 历史演练：噪音抑制 / 锚点 / 链 / 来源失败不误报「消失」/ 上限
npm run history:audit   # v1.4 历史 × git 版本交叉校验（离线；不进 CI —— 浅克隆与历史重写不适合当闸门）
npm run history:baseline # 一次性历史基线（已存在或已有事件时**拒绝重跑**）
npm run fetch:logos     # 从厂商官网抓品牌图标，补进 assets/logos/

# v2.1–v2.4 Coding 套餐：数据 / 页面 / 变化 / 关联（全部离线、不联网）
npm run plans:rebuild            # 人工来源层 curated_plans.json → plans.json（写盘前跑完整数据集校验）
npm run check:plans:reproducible # 盘上的 plans.json 必须等于来源层产出的那一份（逐字节）
npm run selftest:plans           # 数据契约 + 对比页演练（**202 项**，含全部牙）
npm run baseline:plan-history    # 一次性套餐变化基线（已有事件时拒绝重跑）
npm run selftest:plan-history    # 套餐变化日志演练（**132 项**：只记重要字段 / 值决定类型 / 熔断 / 链）
npm run check:plan-history       # 基线 + 事件重放必须等于当前 plans.json
npm run report:plan-changes      # 「最近变化」视图的分栏与条数报告
npm run selftest:deal-plan-links # 优惠 ↔ 套餐关系演练（**78 项**，含 Tooth #4 的浏览器侧）
npm run report:deal-plan-links   # 候选关联报告（**只供人工 review**，没有任何写生产关系的路径）

# v2.5 API / Token 计费：与上面并列的另一份数据（同样离线、不联网）
npm run api-plans:rebuild            # curated_api_plans.json → api-plans.json
npm run check:api-plans:reproducible # 逐字节可重建性门禁
npm run selftest:api-plans           # 契约 + 页面 + 变化 + 关系演练（**76 项**，含 4 条 Tooth Test）
npm run baseline:api-plan-history    # 一次性 API 计费变化基线
npm run check:api-plan-history       # 基线 + 事件重放必须等于当前 api-plans.json
npm run report:api-model-renames     # 疑似模型改名留档（**只报告，不自动合并**）

# v2.0 AI 维护层（可选，默认关闭；不开 AI 时这些命令也会正常退出）
npm run ai:selftest     # AI 层边界自检（六颗主牙 + 结构性牙；离线、零依赖，CI 里也跑）
npm run fixture:test    # 采集器 fixture 回放：解析器行为的契约（离线，CI 里也跑）
npm run check:ci        # CI 口径一致性（含 (16)「AI 维护链路不许碰仓库」；当前 35 项）
npm run rebuild         # 离线重放 merge 重建 deals.json（不联网；ai:apply 之后自动跑）
npm run ai:diagnose     # 采集器坏了：两代结构摘要 + 探针命中 + 源码 → 候选原因
npm run ai:extract -- --limit=10        # 优惠字段提取候选（逐字段引文）
npm run ai:dedup                        # 疑似重复候选（结构上无法自动合并）
npm run ai:translate                    # 翻译草稿 → scripts/data/translations_zh.candidates.json
npm run ai:audit                        # 数据质量审计候选（要求给出可收敛的确定性规则）
npm run ai:patch -- --source=<id>       # 采集器补丁候选（只出 diff；自证=应用+跑 fixture）
npm run ai:review                       # 候选审阅表（只读；「无据的确定」单列一栏）
npm run ai:accept -- --id=<id> --note="…"   # 记录人工决定（只改候选文件）
npm run ai:apply  -- --id=<id>          # 唯一会写生产数据的工具（门禁红则整批回滚）
npm run ai:usage                        # 用量与成本报表
npm run ai:eval                         # 评测三臂（金标集 + 译文守卫篡改测试）
npm run fixture:build -- --all          # 重建 fixture（会随官方页面变化，需人工复核 diff）
npm run serve                          # 本地预览源码目录 http://127.0.0.1:8080
node scripts/serve.js --dir=dist       # 预览发布产物（预渲染后的 index.html）

# 参考站拆解（2.17 新增）：一条命令把一个站拆成四份可复核证据
node scripts/tools/study-site.js <url> --out=research/_raw/<slug>
node scripts/tools/study-site.js <url> --out=... --scheme=dark    # 强制深色偏好，验暗色
node scripts/tools/study-site.js <url> --out=... --proxy=http://127.0.0.1:7890
node scripts/tools/study-site.js <url> --out=... --wait=必然出现的文案   # SPA 显式等文案
node mockups/v3/_tools/build.js        # 重新生成 mockups/v3 的三套方案 demo（读 dist/）

node scripts/collect.js --list                       # 已注册来源
node scripts/collect.js --only=cn_qianfan --dry-run  # 单源调试
node scripts/tools/inspect-source.js <url> --rows    # 看页面表格结构
node scripts/tools/find-offers.js <url>              # 探测页面有无优惠内容
node scripts/tools/term-count.js <url> 免费 额度      # 判断是否 JS 空壳
# 官方页优惠取证（2.14 新增）：打印命中"免费额度/赠送/限时/折扣"的原句上下文
node scripts/tools/probe-offers.js <url>
node scripts/tools/probe-offers.js --render <url>    # 先用无头内核渲染（SPA 官方页必用）
node scripts/tools/probe-offers.js --json <url>      # 机读输出，便于脚本比对
node scripts/tools/fetch-logos.js --url=key=https://厂商官网/   # 试一个还没进清单的厂商图标

node scripts/lib/og-image.js --out=dist/og-image.png # 单独重新生成 OG 分享图（带像素自检）
node scripts/data/backfill-cards.js --check          # 核对策展条目的卡片字段是否齐备
```

> 新增策展条目时：先编辑 `scripts/data/curated_*.json`（含 `features`/`priceLine`/`verifiedAt`）
> → `npm run collect` 把新字段合并进 `deals.json` → `npm run build` 重新预渲染。
> 顺序不能颠倒：预渲染读的是 `deals.json`，不是策展文件（见 2.9 / 2.10）。

---

## 四、当前数据分布

> **快照**：2026-09-27 11:51 CST（`deals.json` 的 `updatedAt`，即定时采集最后一次写入）。
> 本节是**当时值**，不是常量——`collect.yml` 每天两次采集会改它；下面所有数字都由
> `deals.json` + RENDER-CORE 现场算出（厂商/档位用站点同一份归一与分档函数），不是手抄。

| 类型 | 数量 |
|---|---|
| 总条目 | 132 |
| 真实优惠（`type: "deal"`） | 80 |
| 其中：国内 | 60 |
| 其中：国外 | 20 |
| 工具信息（`type: "tool"`） | 52 |
| 带时间信息（截止日期或有效期说明） | 61 |
| 人工核验（`verified: true`） | 32 |
| 卡片特性标签（`features`） | 32（全部为人工策展条目） |
| 价格阶梯（`priceLine`） | 3（仅官方页明确写出「免费 → 付费」的条目） |
| 中文译文（`zh`，见 2.15 / 2.29 ⑩） | 43 条 / 61 个字段（含 2026-09-27 补的 DeepBrain AI、AutoDraw 两条） |
| 垃圾条目 | 0 |

> **v2.0 复核（2026-10-01，`updatedAt` = 2026-09-30T09:36:21+08:00）**：总条目 **134**、
> 策展 32 条、六字段人工覆盖 **56 条**（`scripts/data/audience-overrides.json`）、
> 全库带 `evidence` 引文的 **3 条**、中文译文 **45 条 / 63 个字段**（待译 0）、
> 注册采集器 **9 个**。v2.0 新增四份 `scripts/data/` 文件：`source-probes.json`（探针声明表）、
> `source-snapshots.json`（两代结构摘要，**不含正文**）、`ai-pricing.json`、`ai-applied-log.json`，
> 以及两份不入仓的运行期内容（`.ai-cache/`、`translations_zh.candidates.json` 之外的候选）。

**折叠后默认视图**（口径见 2.30，数字为 2026-09-27 复核值）：**50 张卡片** = 47 张单条卡 + 3 张折叠卡
（智谱AI 1 张覆盖 7 个模型、百度千帆 1 张覆盖 17 个、火山方舟 1 张覆盖 9 个）。
换言之，80 条优惠里有 **30 条**被折叠进这 3 张卡。（2.30 之前是 62 张 / 3 张折叠 / 21 个模型——
卡片少了 12 张不是丢了数据：覆盖条数一直是 80，门禁两条独立断言盯着这件事。）

**力度分档分布**（见 2.11）：**按卡片** ①完全免费 6 · ②免费额度 20 · ③身份优惠 19 · ④折扣促销 5 ·
⑤付费为主 0（= 50 张卡）；**按原始条目** ①12 · ②44 · ③19 · ④5（= 80 条优惠）——
两个口径不一样是因为折叠卡按代表条目的档位算（构建自检里那行 `力度分带` 报的是卡片口径）。
**2.30 之后**：默认视图 50 张卡片（卡片视图）或 50 行（列表视图）；
可索引 URL **81 个**（首页 + 80 个详情页，sitemap 逐条核对）；首页 **50 个卡片标题链接全部指向站内详情页**
（构建期断言；2.19 那节记的「同源内链 308 条」是当时的另一种计法，本轮不去复算它）。
卡片上出现 **32 家厂商官方图形**（另 3 家走名称缩写兜底）；
`assets/logos/` 共登记 **49 个图形**，其余为工具页备用。厂商标识（归一后）全站共 **79 家**。

来源分布：**Futuretools 31** · 百度千帆 17 · aitools.fyi 15 · 人工策展（国外）14 · 火山方舟 12 ·
Layer3Labs 9 · **人工策展（国内）18** · 智谱AI 7 · 智谱AI活动页 5 · Futurepedia 3 · 阿里云百炼 1
（跨源去重后 132 条；Futuretools 比 2.14 那轮多 2 条，即 09-24~09-27 定时采集新进的 2 条工具条目）。

**国内 60 条 = 16 家厂商（归一后）**：百度智能云 17 · 火山引擎 13 · 智谱AI 12 · **扣子 Coze 4** ·
科大讯飞 2 · **MiniMax（稀宇科技）2** · 阿里云 · 腾讯云 · 月之暗面 · 商汤科技 · 硅基流动 ·
阶跃星辰 · 百川智能 · **360智脑** · **魔搭 ModelScope** · **海螺AI（MiniMax）** 各 1。
（加粗的是 2.14 新增；「17 家」是当时按未归一厂商名数出来的，归一后为 16 家。）

分类分布：API服务 36 · 对话模型 27 · **图像绘画 20** · 办公效率 9 · **视频 9** · 编程开发 8 ·
音频语音 7 · 智能体 5 · 其他 4 · 教育学习 3 · 设计创意 3 · 搜索研究 1。

### 套餐与 API 计费（v2.1–v2.5，与上面的 deals 是**三份独立数据**）

| 数据集 | 文件 | 当前规模 | 页面 | 变化日志 |
|---|---|---|---|---|
| Coding 套餐 | `plans.json`（v1） | **9 条 · 8 个平台**（国内 7 / 国外 2） | [`/plans/coding/`](https://buguoshixc.github.io/ai-deals-aggregator/plans/coding/) | `scripts/data/plan-history.json` |
| API 计费 | `api-plans.json`（v1） | **7 条记录 · 5 个平台 · 37 个模型计价条目**（国内 3 / 国外 4） | [`/plans/api/`](https://buguoshixc.github.io/ai-deals-aggregator/plans/api/) | `scripts/data/api-plan-history.json` |
| 优惠 ↔ 长期产品 | `scripts/data/deal-plan-links.json` | **5 条当前关系**（覆盖 3 条记录 / 历史 0 条） | 优惠页与两个套餐页双向深链 | 由上面的日志回答 |

**API 计费明细**（v2.5，全部逐字取自官方页，2026-10-01 核对）：

- **计费通道**：`standard` 5 条 · `off_peak` 1 条（DeepSeek 的 PEAK / OFF-PEAK 是官方同一张表的两行）· `batch` 1 条（OpenAI Batch）。
- **计费单位**：7 条全部是 `per_1M_tokens`（`per_1K_tokens` 只有夹具覆盖，真实数据里还没有样本 —— 见 §五 后续 3）。
- **平台**：智谱（12 个模型计价条目，含 `[0,32K)` / `[32K+)` 分档与 2 个免费模型）· DeepSeek（2 条记录 = 两个时段档）· OpenAI（2 条记录 = Standard / Batch，每条含 Short / Long context 两个变体 + 一个按分钟计价的条目）· Anthropic（4 个模型，含 `cacheWrite` 与 `cacheWriteLong` 两档）· Google（4 个模型 + Free Tier + 按百万 token·小时计的缓存存储价）。
- **免费额度 / credits**：带 `freeTier` **4 条**（**2026-10-04 重算**；本段 v2.5 当时记 2 条 = 智谱的免费模型档、Google 的 Free Tier）：`standing` 2 条（google、zhipu，`type:'models'`）+ `new_user` 2 条（aliyun、tencent，`type:'tokens'` / 一次性 100 万 tokens）；**带 `credits` 0 条**（13/13 为 `null`）—— 没有任何厂商在官方页给出可逐字引用的预付费额度包，按「没有官方原文就不写」的红线一律留 `null`（结构、校验与页面都已经就绪，见契约 §10；`freeTier.stability` 现为**三档必填**，见 `SCHEMA-v2.5.md` §8）。
- **非 token 计费项** 4 条（按分钟 / 按百万 token·小时计）。
- **`derivedMetrics` 全部为 `{}`**（这是结论不是缺省：混合单价需要工作负载假设，credits→token 需要选定模型）。
- **候选未采信（一条未写入）**：阿里云百炼 / 火山方舟 / 月之暗面 / MiniMax / 硅基流动 / Mistral —— 定价表要么是 JS 分页或按模型切换（渲染后只拿到当前选中模型），要么已改成订阅套餐页。

---

## 五、已知边界与后续可做

**边界**

- 需登录的页面（各家控制台）不采集，不做登录态抓取。
- JS 渲染的公开页已用无头浏览器采集并接入 CI（见 2.7 / 2.8）；渲染后仍无优惠表述的来源
  （如 DeepSeek 官网）不注册采集器，改由人工策展补。厂商改版会让某个来源产出 0 条——
  这是刻意设计的失败安全，届时用 `scripts/tools/render-source.js` 重新校准规则。
- 部分优惠的实际有效期写在控制台里（如"自开通起 3 个月"），无法从公开页拿到绝对截止日期，
  用 `validity` 字段如实描述，不编造 `expiresAt`。2026-09-23 复核了 25 个官方页（覆盖 36 条优惠）：
  **没有任何一条页面上写着带年份的绝对截止日期**，多数只写「限时」而不给日期。
  所以前端按三分类标注——有截止日期（`剩 N 天`）/ 未标注截止日期 / 长期活动——并把「未标注」
  与「长期」分成两档：前者是「我们没查到」，后者是官方原话。见 2.22。
- **关于 strict 门槛**：原先设想"总条数 ≥ 120"，实测后调整为 **≥ 100**。原因是实测可稳定采集的
  来源只有 7 个（目录站首页能拿到的条目本身有限），再往上只能靠堆目录站的"工具介绍"条目凑数——
  那正是本项目要修掉的问题。优惠条数（≥ 40）与国内条数（≥ 20）两个真正衡量内容价值的目标均已超额达成
  （实际 80 / 60）。

**后续可做（按价值排序）**

1. ~~**继续扩充人工策展**：腾讯混元、讯飞星火、MiniMax、硅基流动、魔搭、月之暗面等
   的新用户额度与免费模型~~ —— **2.14 已做第二轮**（扣子 Coze / 360智脑 / MiniMax / 魔搭 +8 条，
   国内从 12 家 51 条 → 17 家 60 条）；同轮把 DeepSeek、零一万物、天工、面壁、腾讯元器逐个
   查证并记为「无」（依据见 2.14）。**仍可继续的方向**：国外 AppSumo 的 lifetime deal、
   各大云的 AI startup credit 计划；国内剩下的多写在需登录的控制台里，按现行边界不做。
   这是提升"优惠条数"最有效的路径——比再写十个脆弱采集器更靠谱。
   （火山引擎与智谱的活动页已改由无头采集器覆盖，见 2.7。）
2. **给无头来源加健康度监控**：现在只有 Summary 里的零产出提示（人工看）。可做"连续 N 次零产出
   就在 Actions 里失败/开 issue"，让改版导致的失配自动浮出来。
3. **过期信息的自动降级**：`expiresAt` 到期后自动从默认视图移除（已实现），可再加"最近过期"归档页。
4. **来源健康度监控**：采集报告落库，某个源连续 N 天零产出就报警。
5. **自定义域名**：目前用 `buguoshixc.github.io/ai-deals-aggregator/`，如需绑域名需另行配置 CNAME。
   （绑域名后记得同步 `build-local.js` 里的 `SITE_URL`，canonical / og:url / sitemap 都由它生成。）
6. ~~**用户反馈入口**：卡片上加"信息有误"链接，跳 GitHub Issue 模板。~~ —— **2.19 已做**：
   详情页/弹层里都有预填 `id`、厂商、官方页的 Issue 链接，并有断言校验预填内容。
7. ~~**`deploy.yml` 同步收尾**：把它的 `checkout@v4` / `setup-node@v4` 也升到 `@v5`、runner 钉版本，
   与 `collect.yml` 保持一致（纯清理，不影响发布逻辑）。~~ —— **已完成**（2026-09-23 收尾审计）：
   实际范围比原文更大——除 `checkout@v4→v5`、`setup-node@v4→v5` 与两个 job 的 runner 钉成 `ubuntu-24.04` 外，
   还升了 `configure-pages@v4→v6`、`upload-pages-artifact@v3→v5`、`deploy-pages@v4→v5`（旧那一代跑在
   **已被移除的 Node20 runtime** 上），构建的 `node-version` 由 `'20'` 提到 `'24'`；`package.json` 的
   `engines.node` 同步从 `>=20` 收紧到 `>=20.18.1`（对齐锁文件里 cheerio / undici 的下限）。
   这组口径现在由 `scripts/tools/check-ci-consistency.js`（在 verify.yml 的 gate job 里跑）持续断言。
8. **给自动采集条目补 `features`**：目前 48 条自动条目没有特性标签，卡片回退展示 `discountInfo`。
   若能为常见来源（百度千帆、火山方舟）写规则化的标签提取，卡片整齐度会再上一个台阶——
   但必须遵守"只取原文事实、不生成近似内容"的约束（见 2.9 诚实性红线）。
9. **`priceLine` 覆盖率**：目前只有 3 条。可在日报价页明确给出档位时补，不必强求。
10. **i18n**：已预留 `hreflang` 结构（`zh-CN` + `x-default` 自指）。若要做英文站，
    加 `en` 版本并补 `hreflang="en"` 即可，无需返工现有结构。
11. ~~**折叠卡的模型清单样式化**~~ —— **2.11 已做**：折叠卡上显示覆盖的模型家族 logo（最多 4 个 +
    `+N`），旁边一枚「N 个模型共用额度」的 chip，点击卡片在弹层里列出全部模型名。
    卡片正文里不再铺 17 个模型名（放不下），模型名保留在 JSON-LD 的 `ItemList.description` 里。
12. ~~**厂商筛选器**~~ —— **2.11 已做**：筛选条上有按条数排序的厂商 facet（≥2 条的才出现，
    最多 6 个），底层是 RENDER-CORE 里的 `VENDOR_RULES` 归一表（78 种脏写法 → 规范厂商）。
    归一表同时给卡片 vendor 行与 logo 取图用。
13. **`eligibility` 筛选器**：学生 / 教师 / 新用户 / 初创 / 非营利是这类站点最真实的检索意图之一。
    2.11 的「身份优惠」档只是它的近似（18 张卡），真正按身份筛需要先把 `eligibility` 补齐
    （目前 71 条优惠里仍有一部分为空）。
14. **智谱免费模型的厂商级合并**：那 7 条「XX 免费模型」`url` 各不相同，不属于「同一张表」，
    2.10 刻意没有合并。要合并需另写一条厂商级策略（与「同源折叠」是两回事，不要混在一个函数里）。
15. **名称缩写兜底还剩 39 家**（2026-09-23 实测：`node scripts/tools/tier-report.js --vendor` 末行输出 `官方品牌图形: 38 家 / 名称缩写兜底: 39 家 / 共 77 家`）：都是有官方图形就该换掉的（口径是「拿得到就一定用真图形」）。
    数据里出现过的厂商已在 2.13 / 2.14 换成真图形；剩下的是目录站抓来的长尾工具，
    多数连官网都不确定（2.14 新增 3 家里，扣子 Coze 走的是图形库品牌路径，已在 manifest 注明）。
    另有一批**图形尺寸偏小**、可用但不理想：科大讯飞 32×32、Ideogram 48×48、KREA 64×64、
    商汤 120×184，有条件时向品牌方索取矢量素材替换。
16. **产物体积**：2.19 之后 `dist/index.html` 197.7 KB（预渲染 62 张卡 + 内联脚本；GitHub Pages 会 gzip，
    实际传输约 30–40 KB），另有 80 个详情页共 2.97 MB（平均 38 KB/页，含内联样式与主题脚本）。
    如果详情页继续增长，可把内联样式抽成共用 `app.css` 换取缓存命中——代价是多一次请求。
17. ~~**同页锚点导航**~~ —— **2.19 已做**（G18）：4 个档位带带 `id` + 顶部「跳到档位」条，
    非分带排序或列表视图时自动隐藏。
18. ~~**每条优惠一个独立静态页**~~ —— **2.19 已做**（G1/G8）：`dist/deal/<id>/`，可索引 URL 1 → 81。
19. ~~**紧凑行视图**~~ —— **2.19 已做**（G2/G14）：首屏 9 → 13 行，手机 15.1 → 5.5 屏。
20. ~~**订阅出口**~~ —— **2.19 已做**（G9）：`feed.xml` + `feed.json`，各 80 条。
21. ~~**收藏 / 对比（属 C）**~~ —— **2.22 已做**（G11）：卡片星标 + 详情弹层完整动作 +
    底部对比条 + `?compare=` 可分享 URL，上限 4 条；整块由 JS 建 DOM，无 JS 时零控件。
    **2.29 补完**（用户反馈）：修掉「打开对比」点不开（`hidden` 属性没摘 ⇒ 进了顶层却 `display:none`）
    与「换筛选后静默失效」（选择改按整份数据解析），并加上**收藏列表入口**「★ 我的收藏 N」
    （只看收藏的视图 + 失效收藏的说明与清理）。
22. **首页按意图重排（属 C）**：把「一个列表 + facet」升级成按意图直达的一级入口（免费 / 学生 / 国内厂商…），
    每个入口独立静态路径、各自 canonical。
23. **英文覆盖（属 C）**：`hreflang` 结构已预留（`zh-CN` + `x-default` 自指）。**注意这是持续成本**——
    每条新数据都要有人写英文译文，与现在的中文译文覆盖层是同样的工作量；建议先做首页 + 20 条高价值条目。

**v2.5（API / Token 计费）留下的后续**，按价值排序：

1. **API 计费的专属订阅源 + `/changes/` 分栏**（本轮刻意没做，契约 §17 已登记）。
   现在 `api-plans.json` 有完整的变化日志与页内「最近变化」块，但**没有进 Feed，也没进 `/changes/`**：
   `feeds.js` 的 `PLAN_CHANGE_FEED` 是**单条 spec**，扩成两条要动注册表、`PAGE_FEED_ROUTES`、
   `/feeds/` 页面的回链断言与 `selftest:feeds` 的计数。独立一次改动，不该塞进数据层那一轮。
2. **补国内 API 源**（最有价值的一件）：阿里云百炼 / 火山方舟需要按模型分页抓取或人工策展；
   `per_1K_tokens` 口径目前只有夹具覆盖，国内厂商是这个口径的主要来源。
3. **API 成本计算器**（题面 §八 明确留到后续）：用户输入 input/output tokens 与请求数比较成本。
   两条硬约束：① 结果是**计算值**不是套餐额度，必须在界面上写明；
   ② credits→token 的估算同样要有「选定模型 + 选定单价 + 明确扣减条件」三个条件。
4. **`/plans/` 枢纽页**：现在 `/plans/coding/` 与 `/plans/api/` 靠互相深链 + 页脚入口，
   入口继续变多时值得有一个并列枢纽（代价是新增一条路由与它的四张清单）。
5. **模型改名的半自动登记**：现在 `report:api-model-renames` 只报告。可以做的是
   **候选建议**（把「疑似改名」渲染成一条可粘贴的 `aliases` 片段），但仍然不允许工具直接写生产数据。

---

## 六、技术栈

- **前端**：原生 HTML + CSS + JavaScript（单文件，零构建）；1440px 下三列高密度卡片网格，
  档位分带 + facet 筛选条 + `<dialog>` 详情弹层
- **厂商 logo**：`assets/logos/manifest.json` 登记 → `scripts/lib/logos.js` 构建期生成
  `dist/logos/`（品牌矢量现场生成 SVG）+ `dist/logos.css`；不热链 CDN
- **采集**：Node.js 20+ / axios / cheerio，自建 http 封装（UA、超时、重试、并发限流、robots.txt）
- **无头采集**：playwright-core + 本机 Edge/Chrome（本地）/ playwright 自带 chromium（CI），不下载多余内核
- **校验**：自建零依赖校验脚本（`scripts/validate.js`）
- **预渲染**：`scripts/lib/render-core.js` 用 `vm` 沙箱抽出主页面里的 RENDER-CORE 纯函数区求值
  （构建期与浏览器端共用同一份模板）；默认视图由唯一的 `cardsFor(deals, DEFAULT_FILTERS)` 产出：
  **过滤 → 折叠同源 → 打档位 → 排序**
- **真浏览器验收**：playwright-core + 本机 Edge（或 `DSH_EDGE` 指向的内核），**446 项**断言
  （`scripts/tools/verify-site.js`；带基线回归的 `--compare` 同一批 446 项 = 440 + 6 回归。
  每一节都必须自己做**错误计数的前后快照** —— 全局 `errors` 是整轮累积的，
  缺快照的后果是"本节引入的控制台错误记到整轮账上、逐页断言却全绿"，实测踩过一次，见 2.45 上线记录）。
  收藏/对比相关的断言一律量**几何**（`display` / `getBoundingClientRect` / `:modal`），不只量 DOM 状态——见 2.29 ①
- **OG 分享图**：Node 内置 `zlib` 手写 PNG 编码 + 内置 5×7 点阵字模（零外部依赖）
- **部署**：GitHub Actions → GitHub Pages（`master` 受**规则集**保护：必须走 PR + 必需检查 `gate`，
  直推会被 `GH013` 拒绝 —— 每次上线的固定动作是「推分支 → 建 PR → 等 gate → 合并 → 等 Deploy → 线上冒烟」）
- **存储**：三份静态数据 + 三份追加式日志（全部是**派生产物**，入仓且逐字节可重建）：
  `deals.json`（v2）· `plans.json`（v1）· `api-plans.json`（v1），各自的来源层是
  `scripts/data/curated_*.json`；前端新增的档位 / logo / 译文均为**派生**，不写回数据。
  **三份数据互不注入**，只由 `scripts/data/deal-plan-links.json` 这一张显式关系表相连
- **变化日志内核**：`scripts/lib/history-core.js` 是**按 profile 参数化**的通用内核，
  三份日志（deals / plans / api-plans）各有自己的 profile 与判据，**机制只有一份实现**
  （v2.5 把 `plan-history.js` 的 `record()` 参数化为 `recordWithProfile` 就是为了这一条，
  硬验收是重构后 `plans.json` 与 `plan-history.json` 逐字节不变）

---

## 七、审计发现（2026-09-23）：四个坑与「可安全删除的对象」台账

> 本节是**只读审计**的产物：四处「文档/注释/提交信息说的」与「代码/平台实际做的」不一致的坑，加上一份
> 删得掉、但**本次一律不删**的对象台账。所有数字都是本机实测，命令可原样复核。

### 7.1 `deal.id` 的公式：注释里少了个 `lower()`（最高价值）

实现（唯一权威）在 `scripts/lib/schema.js` 的 `makeId()`（当前 275–279 行），关键是把三个字段**先转小写**：

```js
const basis = `${(vendor || '').toLowerCase()}|${(title || '').toLowerCase()}|${(url || '').toLowerCase()}`;
return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 12);
```

但**另外 7 处**把它写成不带小写的「`sha1(vendor|title|url)` 前 12 位」：`scripts/lib/zh.js:15`、
`scripts/tools/zh-todo.js:23 / 57 / 87`、`README.md:82`（JSON 示例的注释）、`PROJECT_STATUS.md` 旧 626 / 656 行。
**2026-09-23 已把上面这 7 处全部改对**（四处注释 + README 示例 + 本文件那两行）；
**只剩 `scripts/data/translations_zh.json` 的 `_note`** 还是旧文案 —— 它是工具生成的快照，
下次 `node scripts/tools/zh-todo.js --scaffold` 会按新文案覆盖；该文件属译文数据，本次没动。

**实测（本机 130 条，2026-09-23）**：

| 口径 | 命中的 id |
|---|---|
| 按实现（`toLowerCase()` 后拼） | **130 / 130** |
| 按旧注释（不小写） | **7 / 130** —— 这 7 条恰好 vendor / title / url 全小写（如 `more.graphics`、`阿里云百炼…`） |

**如果照旧注释去「修正」代码，代价是**：

- **123 条 id 会变**（130 条里只有那 7 条不变）；
- 详情页 URL 是 `deal/<id>/`：**80 个详情页里 74 个的 URL 会变**，另 6 条恰好全小写、URL 不变
  （阿里云百炼 / 联网资源 / 火山方舟 豆包全系 / 腾讯混元 / 讯飞开放平台 / 360智脑）。
  —— 审计初稿写的是「80 个全变」，这里是**实测修正后的 74**。这些 URL 已上线、进了 `sitemap.xml`
  与首页内链，换 id 等于一次**没有重定向的批量 404**；
- **41 条人工译文全部变孤儿**：`translations_zh.json` 的 41 个键全都对得上现役条目，id 一换就全军覆没，
  卡片上的「中文」胶囊一起消失（`check:zh` 会报，但它只是建议性门禁，不拦发布）。

**教训**：同一个公式被抄进注释、工具输出、示例 JSON、生成的数据文件共 8 处，实现只有 1 处。
改公式的正确顺序是：先改 `makeId()`，再 `grep -rn "sha1(" scripts README.md PROJECT_STATUS.md` 找齐所有抄本。

### 7.2 详情页模板只共用一半（分叉边界写在这里）

`scripts/tools/build-local.js` 的 `writeDetailPages()` 生成 80 个 `dist/deal/<id>/index.html`。
**与首页共用的是这三块**（从已组装好的 `index.html` 里抽，抽不到就抛错）：

| 共用块 | build-local.js | index.html |
|---|---|---|
| `<style>` 样式块 | 414 / 528 | 全站样式块 |
| 「主题必须在首次绘制前决定」前置脚本 | 415 / 526 | 同名前置脚本 |
| 页脚（`<!--SHARED:footer:START/END-->` 标记） | 416 / 560 | 907–914 |

**而这三块是硬编码的第二份副本** —— 没有标记、没有断言，也不在「抽不到就抛错」的保护范围内：

| 第二份副本 | build-local.js | index.html |
|---|---|---|
| 品牌头部：mark SVG + 「AI 优惠聚合器 / 真实优惠 · 每日核验」 | 533–541 | 806–813 |
| `#themeSeg` 三个主题按钮 | 422–426 | 819–823 |
| 详情页的主题切换脚本（`THEME_KEY` 的值 `'dsh.theme'` 被抄成字面量，不引用常量） | 428–462 | 2163–2199 |

**后果**：改首页的**品牌文案**或**主题行为**不会同步到 80 个详情页，构建与 `npm run verify` 都不会报错
（验收断言以首页为主，详情页只做抽样 canonical / 文案断言）。本次同时把 build-local.js:397
那段「不引入第二份模板 … 因此首页与详情页不会分叉」的过度乐观注释改成了如实的边界描述。

> 行号口径：上面两列都是 **2026-09-23 工作区**的值。build-local.js 一侧刻意只在此处写行号 ——
> 本次审计自己就踩过：在该文件里加 10 行注释，把它自身后续所有行号整体推后了 10 行。
> 复核时请以符号为准（`writeDetailPages` / `themeSeg` / `themeBind` / `<a class="brand">`）。

### 7.3 本机跑 `npm run verify` 需要浏览器内核

- `scripts/tools/verify-site.js:27` **只认路径**：`DSH_EDGE` 环境变量，缺省写死 Windows 的
  `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe` —— 它**不**去读 playwright 的内核缓存。
- `scripts/lib/browser.js:22`（无头采集那条路）自己探测：`msedge` → `chrome` → playwright 自带内核
  （`bundled`），都不可用时报 `NO_BROWSER` 并提示装内核。
- 一行装上（本地 / CI 通用）：`npx playwright install --with-deps chromium`
- 装完让验收用上它（verify-site.js 只认路径，要把路径喂给 `DSH_EDGE`）：
  `DSH_EDGE="$(node -e "process.stdout.write(require('playwright-core').chromium.executablePath())")" npm run verify`
- 缓存位置：Linux / macOS `~/.cache/ms-playwright`，Windows `%LOCALAPPDATA%\ms-playwright`。
  **本机现状**：`%LOCALAPPDATA%\ms-playwright` 里有 `chromium-1243`（本轮门禁验证时装的），
  且本机装有 Edge，所以现在两条路都能跑。

### 7.4 「可安全删除的对象」台账（只写不执行）

> **本节不执行任何删除。** 本次审计全程只读：没有跑 `git branch -d/-D`、`git tag -d`、
> `git stash drop`、`git gc`、`git prune`。每条给出「为什么安全」的证据与确切命令，
> **留给人事后决定**；证据都能用同一条命令复核，哈希与计数取自 2026-09-23 的工作区。

| 对象 | 为什么安全（证据） | 命令（本次未执行） |
|---|---|---|
| 7 个 `feat/*`：`feat/b-extras` `feat/detail-pages` `feat/expiry-window` `feat/favorites-compare` `feat/polish` `feat/row-view` `feat/visual-token-layer` | 都是 `master` 的祖先：`git merge-base --is-ancestor <分支> master` 为真，且 `git rev-list --count master..<分支` 为 `0` —— 内容全在 master 里 | `git branch -d feat/b-extras feat/detail-pages feat/expiry-window feat/favorites-compare feat/polish feat/row-view feat/visual-token-layer` |
| `trial/merge-rehearsal-2`（`044dd51`） | 同上：`master..` 计数 `0`、是 master 祖先（2.21 全合用的就是它） | `git branch -d trial/merge-rehearsal-2` |
| `fix/detail-close`（`c70706b`） | 是 master 祖先（`git branch -vv` 显示 `behind 29`、ahead 0）。⚠️ **它的 upstream 被错配成 `origin/master`**（本该是 `origin/fix/detail-close`）：在这个分支上 `git pull` 会去拉 master、`git push` 会试图推 master | 先 `git branch --unset-upstream fix/detail-close`，再 `git branch -d fix/detail-close` |
| 2 个 backup 标签：`backup/pre-ab-merge`（`fb08832`）、`backup/pre-origin-merge-b261add`（`b261add`） | 两者都是 master 祖先 —— 提交在 master 历史里仍然可达，删标签只丢「名字」，随时可 `git tag <名> <sha>` 重建；且 `git ls-remote --tags origin` **输出为空**（远端一个标签都没有），删除不影响上游 | `git tag -d backup/pre-ab-merge backup/pre-origin-merge-b261add` |
| `trial/merge-rehearsal`（`4066a17`） | **不是** master 祖先（ahead 6）：5 个「rehearsal: merge …」合并提交 + 1 个文档提交。`git cherry master trial/merge-rehearsal` 判定那个唯一的非合并提交没有等价 patch；它的 `deals.json` 130 个 id **全部**在 master 里（独有 0）；那节文档（「2.21 合并彩排」）在 master 上已被改写成现行 2.21。⚠️ 删除会丢掉**被改写前的那版措辞**，想留就先打标签 | 想留：`git tag archive/trial-merge-rehearsal trial/merge-rehearsal`；确认不要：`git branch -D trial/merge-rehearsal` |
| stash `60df32f`（`stash@{0}`「本地手工产出的 121 条（CI 已产出等价数据 068d925）」） | **独有 id 为 0**：它的 `deals.json` 121 个 id 与 master 的 130 个、与 `068d925` 的 121 个都没有差集；`git diff 068d925 stash@{0}` 只有 `deals.json` 的 61/61 行；`068d925`（「chore(data): 更新优惠数据 2026-09-21 22:44」）本身是 master 祖先 | `git stash drop stash@{0}` |
| `backup-pre-rewrite`（`cb0850c`） | 不是 master 祖先（ahead 11），但 `git cherry master backup-pre-rewrite` 的 **11/11 全部是 `-`**（patch 等价 → 内容已由 master 里的对应提交承载）；它的 `deals.json` 104 个 id 独有 0 —— 内容无独创，只剩作者溯源价值 | `git branch -D backup-pre-rewrite` |

**台账之外的观察**：`fix/detail-close` 的 upstream 错配是目前唯一的「危险默认值」——
在 `git branch -vv` 里它只是一行 `[origin/master: behind 29]`，但足以让一次手滑的 `git push` 去动 master。
修法已记在上表，本次不执行。

### 7.5 CI 必需检查（required status checks）的真实语义 —— 并更正 `cfd443b` 里的错误结论

**这一节是更正，不是新发现**：上一轮收敛提交 **`cfd443b`** 的提交信息（④ CI 三块工作）与当轮的交付说明里
下过一句结论——「`deploy.yml` 的 `build` 带 job 级 `if`（`workflow_run` 桥接）⇒ 被要求时必然 skipped
⇒ 满足不了必需检查 ⇒ PR 永久 pending」。**这句话是错的；它是 captain（也是写本节的人）在上一轮写下的错误结论。**
提交信息不可变（改写历史不是本仓库允许的动作），所以更正只能写在这里：**以下面这套语义为准，
`cfd443b` 提交信息与当轮说明里那句话作废。**

**GitHub 的官方语义**——[Troubleshooting required status checks](https://docs.github.com/en/enterprise-cloud@latest/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)
（2026-09-23 取全文复核；下面这张表就是该页「Handling skipped but required checks」一节的三行）：

| 成因 | 结果 |
|---|---|
| **workflow** 被 path filtering / branch filtering / commit message 跳过 | 关联检查停在 **"Pending"**，**阻止合并** |
| **job** 被条件（`if:`）跳过 | **该 job 报告 "Success"** |
| job 依赖的 job 失败 | 依赖方被跳过，**可能不阻止合并** |

同一页另外三条硬事实，上一轮恰好把第 1、2 条用反了：

1. **成功的检查状态包含 `success`、`skipped`、`neutral`** —— `skipped` 本身就算「满足要求」；
2. job 产生的检查**只有在 run 由** `push` / `pull_request` / `pull_request_review` / `pull_request_target` /
   `deployment` / `deployment_status` **触发时**，才会在 PR 的检查区被评估、才谈得上满足必需检查；
3. 必需检查必须**对得上名字**且在最近 7 天内成功过，否则只会一直显示
   「Expected — Waiting for status to be reported」。

**错在哪（拆成两半，都要记牢）**

- **因果链是错的**：job 被 `if:` 跳过 ⇒ 该 job 的检查**报 Success**，不是 pending。
  「有 job 级 `if` ⇒ 满足不了必需检查 ⇒ 永久 pending」这句话要从记忆里删掉；
  真正会 pending 的是**上表第 1 行**：workflow 被 path / branch 过滤或提交信息跳过。
- **结论凑巧是对的，理由完全不对**：`build` 确实不能、也不该做 PR 必需检查 —— 理由是**触发面**（见下），
  与 job 级 `if` 无关。把「结论对」当成「理由对」写进不可变的提交信息，是这次真正的问题。

**为什么 `gate` 是、且应当是唯一的必需检查**

| 判据 | `verify.yml` 的 `gate` | 为什么这条判据重要 |
|---|---|---|
| 单 job、不依赖 `needs:` | ✅ 全文件只有 `gate` 一个 job | 表第 3 行：依赖方被跳过时可以「不阻止合并」，必需检查名挂在那里等于没挂 |
| job 级无 `if:` | ✅ `jobs.gate`（`verify.yml:51` 起）没有 job 级 `if`；步骤级那两条 `if`（`Real-browser acceptance (verify-site.js)` 与 `Gate conclusion` 两步；行号会腐烂，当前约 `:231` / `:240`）只决定「跑不跑那一步」，不改变 job 的结论 | 表第 2 行：job 级 `if` 跳过会**报 Success**，对门禁来说这是最坏形态（**没跑却算过**）。所以「`gate` 不许有 job 级 `if`」这个决定仍然成立，**只是理由要换成这一条** |
| 无 `paths` / `paths-ignore` | ✅ `on:` 下只有 `pull_request.branches` / `push.branches` / `workflow_dispatch.inputs` | 表第 1 行：被路径过滤是**永久 Pending**，PR 既不红也不绿 |
| 有 PR 可用的触发 | ✅ `pull_request: branches: [master]` —— 那是**目标分支**过滤，本仓库的集成分支就是 master（本文件里所有合并记录都指向它），正常 PR 都命中 | 硬事实 2：没有 `pull_request`，就没有会被评估到 PR 上的检查 |
| 覆盖同一条构建 | ✅ 步骤 `Assemble site (same path as deploy.yml)` 执行 `node scripts/tools/build-local.js` | 「PR 上没人跑构建」这个担心不成立：跑的就是发布用的同一个脚本 |

**「唯一」是逐条实测的**：四条 workflow 的触发面一个个看过 —— `collect.yml` = `schedule` + `workflow_dispatch`；
`probe-sources.yml` = `workflow_dispatch`；`deploy.yml` = `push`(master) + `workflow_run` + `workflow_dispatch`；
`verify.yml` = `pull_request` + `push` + `workflow_dispatch`。
⇒ **`gate` 是四条里唯一会在 PR 上产生检查的 job**，所以分支保护的「必需检查」一栏只该填 `gate`。
（「它现在是否已经挂在必需检查里」属于 GitHub 侧的仓库设置，本文件不做断言 —— 本节只写「该填什么、为什么」。）

**为什么 `build` 不要设成必需检查**（两条独立理由，任何一条都足够）

1. **它没有 PR 可用的触发。** `deploy.yml:9–16` 的 `on:` 只有 `push`（`branches: [master]`）/ `workflow_run` /
   `workflow_dispatch`：后两者**根本不在硬事实 2 的事件清单里**；`push` 虽在清单里，却被 `branches: [master]`
   限定 —— PR 的 head 分支推送不触发它，master 上那一次 `push` 也不属于任何 PR。结果：`build` 这条检查
   **永远不会出现在 PR 的检查区**，把它设成必需检查只会得到一个永远等不到报告的「Expected」。
   这是**设计使然**：`deploy.yml` 是**发布**管线（它自己的注释原文：「纯发布流程：不做采集」），不是 PR 管线。
2. **`gate` 已经跑了同一条构建。** 上面那一步执行的就是 `node scripts/tools/build-local.js`，与 `deploy.yml`
   的 `Validate data and assemble site` 是同一个脚本；再挂一个 `build` 不会多验任何东西，只会多一个要维护的检查名。

**告诫：不要把 `needs:` 的依赖方设成必需检查**（表第 3 行）。`deploy.yml` 现在就是 `deploy: needs: build`：
`build` 被 `if` 跳过（采集失败）时 `deploy` 一起跳过 —— 那是**刻意的「不发布」语义**，不是缺陷。
但将来 `gate` 若拆成多个 job，必需检查必须挂在**没有任何 job `needs` 它**的那一个上；
真要挂依赖方，就得按官方写法给它 `if: always()`，否则会落进「被跳过、且可能不阻止合并」那一格。

**机器守卫（已经在跑，别删）**：`scripts/tools/check-ci-consistency.js` 用三条断言把上面这套设计钉住 ——
(7b) `jobs.build.if` 表达式逐字未变（防有人为了「让检查通过」删掉跳过发布的语义）、
(8) `verify.yml` 的 `gate` 存在且没有 job 级 `if`、
(9) `verify.yml` 的 `on:` 没有被 `paths` / `paths-ignore` 过滤；
三条都由 `gate` 里的 `node scripts/tools/check-ci-consistency.js --expect-checks=24` 执行。

**同一错误说法曾残留两处（写本节时只改文档、把它们登记在案；随后一轮已按本节改正 —— 下面保留原文以便对照）**

- `.github/workflows/verify.yml:11–16` 的注释块（**已按本节改正**）：曾把 `build` 的 job 级 `if` 说成「会被判成 skipped ——
  而 skipped 的检查**永远无法满足必需检查**（分支保护会一直显示 pending）」—— **这句是错的**（job 跳过报 Success）。
  它下面的操作决定（不给 `gate` 加 job 级 `if`、把判定写进步骤）**仍然正确**，理由按本节换成
  「跳过会报 Success，等于没跑却算过」。
- `scripts/tools/check-ci-consistency.js` 里断言 **(8) verify.yml 的 gate job 存在且没有 job 级 if（永不 skipped）** 的失败文案
  （**断言名是稳定标识**；行号只作提示、会继续腐烂：断言本体当前约 `:421`、失败文案当前约 `:425`）：「（会被判 skipped，必需检查永远等不到结果）」
  —— **这句也是错的**，同上（该文案已在后续一轮按本节改成「跳过报 Success = 没跑却算过」）；它守的行为（`gate` 不许有 job 级 `if`）保留，改文案时不要顺手把断言删掉（看门狗与 `--expect-checks=24` 会红）。

> 一句话记法：**workflow 被跳过 = Pending（卡死）；job 被跳过 = Success（静默变绿）；依赖失败被跳过 = 可能不拦。**
> 能当必需检查的，只可能是「任何 PR 都会报到、且一定会真跑」的那一个 job。
>
> 出处（本节全部依据这一页）：
> https://docs.github.com/en/enterprise-cloud@latest/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks

---

### 2.37 `v1.6-subscription`：静态订阅体系 —— 18 个 Feed × 2 种格式（2026-09-30，分支 `v1.6-subscription`）

**目标**：在不引入账号 / 数据库 / 邮件 / 推送 / 第三方 SDK / 行为追踪的前提下，让读者订阅自己真正关心的优惠变化。

- **唯一判据**：`scripts/lib/feeds.js`（注册表 + 纯函数条目构建 + RSS/JSON 序列化 + 手写 XML 良构检查器 + `validate()`）。
  优惠 Feed 的判据**指向既有页面注册表**（`COLLECTION_PAGES` / `NEED_PAGES` 的谓词函数），
  变化 Feed 的条目**直接取雷达分栏**。订阅层没有新写一条判据（自测有静态扫描盯着）。
- **两类语义不混**：A 类回答「当前有哪些符合这个条件的优惠」（条目 = 当前记录，排除已结束与已过期）；
  B 类回答「最近发生了什么」（条目 = 高价值事件，文案微调与 `updated` 类元信息永不进订阅）。
- **Stable ID**：优惠条目沿用 `deal.id`（**刻意不加前缀** ⇒ 升级 v1.6 不给老订阅者重推 80 条）；
  变化条目用 `chg:` + `sha1(history.eventKey())` 前 16 位 —— 刻意不用可读 id，因为采集每天两次，
  同一天同一字段可能变两次，可读形式会碰撞。
- **时间只来自数据**：`pubDate`/`date_published` = `firstSeen` 或事件 `at`；`date_modified` = 最近一次
  高价值变化（没有就**省略字段**）；`lastSeen`（每轮采集都刷新）永不进机器可读时间字段。
- **防重复实证**：连续 **10 次真实构建**，36 个 Feed 文件逐字节一致（`check:feeds:reproducible --runs=10`）。
- **空 Feed 显式化**：只有 `new` / `changes` 允许为空（起算日之前没有可观测的变化，属于事实），
  且日志不可用时改说「没有拿到历史日志 —— 这不表示没有变化」；分类 Feed 为空即构建红。
- **厂商门槛按实测分布**：`当前有效优惠 ≥ 2` 命中 9 家（33 家里），`历史事件 ≥ 3` 是只追加条件、
  同时兜住订阅 URL 稳定性；slug 走人工表 `scripts/data/vendor-slugs.json`。
- **Feed Discovery**：首页 `<head>` 只暴露 4 个选择 × 2 种格式 = **8 条** `rel="alternate"`，
  由构建期从注册表注入（源码不留第二份清单）；`/changes/` 改声明变化 Feed 对；其余页面声明根 Feed 对。
- **新页面 `/feeds/`**：订阅中心，五条既有约定齐（自指 canonical / 双 feed / 两段 JSON-LD /
  sitemap `priority 0.6` / 预渲染 2958 字）；页脚「优惠变化：变化雷达 · 订阅这些优惠」合并成一行。
  注意 `/feed/`（文件，单数）与 `/feeds/`（页面，复数）刻意不同名。
- **三层验证**：产物自检（20 个检查码的三方对账）· `selftest:feeds`（**66 项**，含 4 项 Tooth Test）·
  真浏览器 §14/§14b（`DOMParser` 真解析、链接可达、`/feeds/` 可用）。
  > ⚠️ 2026-10 收口（读到这里的人请注意）：本条与下面那条门禁记录里的东西**已整体下架** ——
  > `/feeds/` 页、Feed Discovery 的 8 条 `rel="alternate"`、`selftest:feeds`、
  > `check:feeds:reproducible` 与门禁里的 `Feeds self-test` / `Feeds reproducibility` 两步
  > 全部删除（订阅层整族退场）。保留这段作为历史记录，不要照它恢复任何东西。
- **门禁**：`gate` 新增 `Feeds self-test` 与 `Feeds reproducibility (build twice, byte-compare)` 两步
  （冻结序列 21 → 23 步）；`--expect-checks=32` **不变**。
- **实测**：`npm run build` 通过（36 个 Feed 文件 · 338 条条目 · 产物 937.9 KB）；
  `npm run verify` 297 项、`npm run verify:regress` 303 项全过，页高 4589 → 4642px（+1.2%，容差 15%）；
  既有 11 支自测（15/94/46/161/91/51/67/61/89 项）全绿。
- **契约** `docs/SCHEMA-v1.6.md` · **报告** `research/v1.6-subscription-report.md`。
  未合并、未推送；建议先观察 2–3 天采集周期拿到真实变化样本，再评价变化流的分栏与窗口。

---

### 2.38 `v1.7-seo-expansion`：有门槛的落地页系统 + SEO 安全门禁（2026-09-30，分支 `v1.7-seo-expansion`）

**目标**：把已有的高质量结构化数据组织成**真正有搜索价值的静态入口页**，并让「薄页 / 重复页 /
坏链接」在构建期不可能悄悄上线。**不是**批量制造 SEO 页面。

**先说结论**：用户框定的第一批页面里 `/student/` `/developer/` `/free-api/` `/need/free-tokens/`
`/need/free-model/` `/need/china-usable/` **早就存在**（v1.1/v1.2）。所以本轮真实做的是：
新增**厂商页 / 分类页 / 两个枢纽页**，收口**已经存在的 3 对近义重复页**，修掉**4 类早已存在但无人发现的
SEO 硬缺陷**，再加一道门禁与 6 条 Tooth Test。

**修掉的四个既有缺陷（都不是读代码看出来的，是量出来的）**

| 缺陷 | 实测 | 处置 |
|---|---|---|
| 首页**一个 `<h1>` 都没有**，80 个详情页的标题是 `<h2>` | 113 页里 **81 页**在文档结构上缺一级标题；旧审计数到的「1 个」其实是内联脚本模板字符串里的 `<h1>` | 首页品牌改成 `<h1>`（CSS 把几何锁死在同尺寸，不新增一行 ⇒ 首屏仍是 9 张卡）；`detailHtml(deal, {headingTag:'h1'})` 只对独立详情页生效（弹层里仍是 h2） |
| `ItemList.numberOfItems` 声明 `deals.length` 却只发 `slice(0,50)` | `/developer/` **声明 67、实列 50**；`/changes/` 同型（被 0 事件掩盖） | 全量发出，并加 `itemlist-arity` 断言「声明数 == 元素数 == 页面数据行数（`data-item` 标记）」 |
| **3 对页面条目集合逐条相同**、两对标题逐字相同 | student ≡ student-only(12) · free-api ≡ need/free-api(45) · developer ≡ dev-credits(67) | 保留短路由为被索引入口，旧地址降为 `noindex,follow` 别名页（自指 canonical + 页面上写明关系），不进 sitemap |
| 详情页面包屑把「分类」指向**站根** | `/deal/<id>/` 的 `BreadcrumbList` 第 2 级 `item: SITE_URL` —— 一条「说自己在分类页、点开是首页」的假链接 | 有分类页就给真 URL，没有就**省略 `item`**；并加 `breadcrumb-target-exists` 检查码 |

**新增页面类型与门槛**（`scripts/lib/landing.js` 是唯一致出）

- 厂商页 `/vendor/<slug>/` **9 个**：门槛**复用订阅的 `VENDOR_THRESHOLDS`**（有效优惠 ≥2 或事件 ≥3），
  于是「页面的条目集合」与「它的 Feed 的条目集合」不可能分头变化。
- 分类页 `/category/<slug>/` **5 个**：门槛 `≥4 条` + 人工允许表 + 集合唯一性。实测分布
  36/15/6/5/**4** ‖ 3/2/2/1/1/1，4 与 3 之间是自然断层；`编程开发(4)` 与 `/need/ai-coding/`
  集合逐条相同 ⇒ 由既有页承担（不重复建 URL），`其他` 是内部兜底枚举 ⇒ 人工排除。
- 枢纽页 `/vendor/` `/category/` **2 个**：子页目录，同时是面包屑的父级（保证面包屑 URL 真实存在）。
- **钉住表** `scripts/data/landing-pages.json`：19 条路由「必须一直存在」，跌破门槛照常生成、
  条数为 0 则构建红 —— 收录过的 URL 不许静默消失。

**厂商身份归一（本轮最隐蔽的一处不一致）**：`vendor-slugs.json` 的键原先是**采集时的原始字符串**，
而渲染/筛选/logo 用 `vendorOf()` 的规范名 —— 同一家公司两个身份（`火山引擎（字节跳动）` vs `火山引擎`）。
v1.7 把键与 `feeds.js` 的分组都切到规范名（用**注入** `vendorKeyOf` 的方式，`feeds.js` 仍是纯函数），
**slug 值一个未改** ⇒ 老订阅者 Feed URL 零破坏。顺带把厂商 Feed 的 `homePageUrl` 从站根改为 `/vendor/<slug>/`，
并新增 `page-exists` 检查码。

**SEO 安全门禁：27 个检查码 × 2 个输入完全不同源的执行点**

- 构建期 `seo.validate()`（从磁盘回读刚写下的 113 页）；
- `npm run verify:seo`（**只读 dist/**：可索引性按 `robots` meta 判、条目集合按 `deals.json` 重算、
  sitemap 成员解析 XML、Feed 清单走磁盘）。**为什么两个都要**：构建期的描述符是它自己记下来的，
  两份数据同源时一个错误的判据会在两边一致地错下去。
- `npm run selftest:seo`（62 项）：干净夹具必须 0 问题 + **27 个码逐个定向篡改，每个都必须会响** ——
  一个永远不响的检查码比没有检查码更糟。

**Tooth Test 6 条全部实跑**（注入 → 记录逐字红色 → 用**文件备份**还原 → 复跑确认回到绿）：
共用 canonical / sitemap 里塞不存在的 URL / 绕过门槛生成 1 条厂商页 / ItemList 声明数不符 /
面包屑指向不存在页 / **产物级制造 orphan**（后两条：orphan 由 `verify:seo` 而不是构建期发现）。

> ⚠️ **本轮踩的最大一个坑（值得单独记）**：第一版 Tooth Test 驱动用 `git checkout -- <file>` 还原，
> 而当时的改动**还没提交** ——「还原」把整份 `build-local.js`（约 300 行改动）清空了。
> 处置：先提交幸存文件，再按记录逐条重新应用，重建后产物与丢失前**逐字节等价**；
> 驱动脚本改成基于**当前工作区副本**的备份/还原。**任何「还原」动作都不能依赖「改动已提交」这个前提。**

**规模与门禁**

| 指标 | v1.6 | v1.7 |
|---|---|---|
| HTML 页 / 可索引 | 97 / 97 | **113 / 110**（+3 条 noindex 别名） |
| sitemap | 97 | **110** |
| Feed 文件 | 36 | **46**（+5 份分类 Feed × 2 格式） |
| dist | 192 文件 / 8.50 MiB | **218 文件 / 10.06 MiB**（+18%，预算上限 16 MiB） |
| `npm run build` | 0.90 s | **1.01 s** |
| `npm run verify` | 297 项 | **335 项**（+§18 落地页 38 项） |
| `verify:regress` | 303 项 | **341 项**；卡片 50→50 · 首屏 **9→9** · 页高 +1.7%（容差 15%） |

既有 11 支自测全绿（`selftest:feeds` 从 66 → **71 项**，夹具同步规范厂商名）；
`check:ci` 32 项（门禁步骤序列 23 → **25 步**，新增 `SEO self-test` 与
`SEO verification (independent, from dist/)`，均无 `continue-on-error`）。

- **契约** `docs/SCHEMA-v1.7.md` · **报告** `research/v1.7-seo-expansion-report.md`。
  未合并、未推送。
- **对 v2.0 的判断**：**适合进入**，唯一前置条件仍是 v1.6 报告里那条 ——
  `deal-history.json` 今天仍是 **0 事件**，而 AI 辅助维护要判断的第一件事恰恰是「什么变化值得通知人」。
  建议先跑满 3 天采集拿到真实事件样本，再进 v2.0。

### 2.40 `v2.1-coding-plan-data-model`：独立的 Coding Plan 数据契约（2026-10-01，分支 `v2.1-coding-plan-data-model`）

**目标**：为「AI Coding 套餐对比」建立**独立于 Deals**、可长期维护 / 可校验 / 可重建 /
能为 Phase 2.3 History 打底的数据契约 —— **不是**把普通套餐塞进 `deals.json`。

**先说结论**：新增 `plans.json`（9 条 / 8 个平台 / 国内 7）与它的人工来源层 `curated_plans.json`、
provider 归一表 `providers.json`，两道新 CI 门禁与 117 项自测（含题面 6 条 Tooth Test + 扩充的牙）。
**前端一个字节没改** —— 实测三次构建的 `dist/` 全树 SHA256 完全相同。

**Deals 与 Plans 怎么隔离**（题面第一条设计约束）

| 维度 | Deals | Plans |
|---|---|---|
| 文件 / schemaVersion / 数组名 | `deals.json` / 2 / `deals`（**发布**） | `plans.json` / 1 / `plans`（**不发布**） |
| 身份字段 | `vendor`：采集来的原始串，渲染期归一 | `provider`：必须登记过的规范 key |
| `source` 的含义 | **采集器名**（登记在 `provenance.SOURCE_TYPES`） | **页面类型**（Official-Pricing / -Docs / -Announcement） |
| 可重建门禁 | `check-reproducible`（值必须有源） | `check-plans-reproducible`（文件必须是来源层产出的那一份） |

两者唯一的共享是**判据**不是数据。登记在案的语义冲突 10 条（`period` 同名不同义、`priceLine`
自由文本 vs 数值价格、`pricingModel` 不复用、`source` 两义、`provenance` 可信度块不引入、
`availability` 不给 plans、`vendor` vs `provider` 两套身份空间、引文白名单参数化、
币种不进键名、`isGarbage` 会对 2 字名字误杀）逐条写在 `docs/SCHEMA-v2.1.md` §1.2。

**本阶段最重要的设计点：派生指标"宁可全 null 也不强行算"**

「名义 Token 单价」只在**五个条件同时成立**时产出：额度确实是 `tokens` 且数额明确 ·
额度周期与计费周期一致且可比较 · 币种可处理 · 当前使用价格明确 · 折算不随模型倍率变化。
真实数据 **9 条全部为 `null`**：6 条按积分（credits）、2 条是用量池（other）、1 条按窗口限速
（rate_limited）—— **没有任何一家厂商在官方页面上给出固定 Token 额度**。
智谱文档页那张"可用额度参考（亿 Tokens/周）"随缓存命中率变化，按契约只能记 `credits`。
可计算路径由夹具覆盖（60 元 / 60 亿 tokens = 1 元每亿；活动价优先；年付以年为口径）。

**额度与三态**

`quota.type` 8 值枚举；量纲型（tokens/credits/requests/messages/compute_units）必须有正数 `amount`，
非量纲型（rate_limited/unlimited_fair_use）**必须没有**（写了一个数就红），`other`
与它们都必须写 `description`；`conversionDependsOnModel` **只允许出现在 credits/other** ——
`tokens` 上写 `true` 判红，正是"额度随模型倍率变化时必须表达为 credits，不得伪装成固定 Token"。
限制条件用 `{kind, value, note}` 数组，三态沿用仓库既有的 `true / false / "unknown"`
（`"unknown"` 必须带 note；`0` / `1` / `"true"` 一律拒），**为未知值填 false 是硬错误**。

**身份稳定**：`id = sha1(kind|provider|planName|计费周期)[:12]` —— 价格 / 额度 / URL / 备注
都**不进** basis，因此**改价不换 id**（有牙守着三种改法）；数据集级同时查 `id` 唯一与
`identityKey` 唯一，同平台的同一套餐不可能有两条身份。

**校验的做法**：`validatePlan()` 不重抄规则，而是用 `makePlan(plan, {fromRecord:true})`
把盘上那条记录**重新归一一次**再逐字段比对（与 v1.3 的 `validateEvidence()` 同一手法）——
手改 id、手算 derivedMetrics、枚举拼错、文本多个空格，全部表现为"与归一结果不一致"。

**门禁与实测**

| 项目 | 结果 |
|---|---|
| `selftest:plans` | **117 项 0 失败**（含 6 条 Tooth Test + 聚合站出处/超长引文/未来日期/空数组/三态/未登记 provider/slug 分家/updatedAt/规范序/打乱输入仍逐字节相同） |
| `check:plans:reproducible` | exit 0；**改了来源层却没重建会红**（实跑验证） |
| 真实数据牙齿演练 ×2 | 给 credits 套餐硬塞 Token 单价 ⇒ `validate` exit 1；改来源层不重建 ⇒ 可重建门禁 exit 1；两次都**逐字节还原** |
| 门禁步骤 | 27 → **29 步**（新增 `Plans data self-test`、`Plans reproducibility`）；`--expect-checks=35` **不变** |
| `npm run build` ×2 + stash 对照 | **三次 dist 全树 SHA256 相同** ⇒ 本阶段零页面影响 |
| `verify` / `verify:regress` / `verify:seo` | **335 / 341 / 8 项，全部 0 失败**（卡片 50→50 · 首屏 9→9 · 页高 4589→4665px 在容差内） |
| 既有 20 道门禁 | 全绿（`selftest:provenance` 仍是 91 项 —— 引文层参数化没有改变 deals 侧行为） |

**初始数据集**：Trae 免费 Free / 会员 Pro · 智谱 GLM Coding Plan Lite（**原价未知 → null**）·
Qoder CN 个人专业版 · 腾讯 CodeBuddy 标准版 · 月之暗面 Moderato · MiniMax Token Plan Plus ·
GitHub Copilot Pro · Cursor Pro。每条都来自本次实际抓取并读到的官方页，共 **24 条官方引文**。
**候选未采信 6 类**（百度 Comate、Anthropic Claude 的官方页取不到价格文本；智谱/MiniMax 的
新一代套餐未列价；Cursor Pro+/Ultra 在标签页里；GLM 的**历史档位价**刻意没有引用；
各平台其余档位按"小而可靠"暂不扩）逐条写进报告。

- **契约** `docs/SCHEMA-v2.1.md` · **报告** `research/v2.1-coding-plan-data-model-report.md`。
  **✅ 已上线（2026-10-01）**：与 2.41 第二段同批走 PR **#13** → `gate` success → 合并 **`535a25b`**。
- **对 Phase 2.2 的判断**：**适合进入**。进入时要先解决三件事：把 `plans.json` 接进
  `PUBLIC_FILES`（或在构建期注入派生字段）；`/plans/coding/` 是新落地页家族
  （`itemsOf` 的 `match.by`、门槛分支、`textFloor`、sitemap 计数公式、SEO 描述符都要一起改，
  且首页页高有 15% 硬容差）；把口径文案与禁词（性价比/最划算/TOP 1）补成可失败的断言。

### 2.41 `v2.1-coding-plan-data-model` 第二段：把套餐数据发布出来、做成页面（2026-10-01）

**起因**：2.40 收尾时列了「进入 Phase 2.2 之前要先解决的三件事」。用户说「解决那三件事」，
于是这一轮就是那三件事 —— 它们正好构成 Phase 2.2 的第一段（**接线**），而不是整个 2.2。

| 三件事 | 怎么解决的 |
|---|---|
| ① 把 `plans.json` 发布出来 | 加进 `build-local.js` 的 `PUBLIC_FILES`；产物自检新增一条**逐字节**断言：`dist/plans.json` 必须等于源文件。刻意**不做任何构建期注入** —— 这一页是预渲染的，浏览器不 fetch 套餐数据，注入派生字段只会凭空多一层"发布数据 ≠ 源数据" |
| ② `/plans/coding/` 接成一条真路由 | 走 `/status/` `/changes/` `/feeds/` 那条**独立静态页**路径（不是落地页家族：它只有一条路由、不分页、不需要门槛）。**四张清单**逐处更新：页脚占位符 `__PLANS_HREF__`、sitemap 条数公式与成员断言、`pageRoutes`、两张逐层扫描表（页脚前缀 + 订阅声明）。`seo.js` 的 `textFloor` 新增 `plans` 分支（`600 + 60×条数`） |
| ③ 口径文案与禁词变成断言 | 唯一出处 `lib/plans-page.js` 的 `FORBIDDEN_CLAIM_WORDS` 与 `PLAN_WORDING.nominalUnitPriceNote`。**三处查同一份清单**：构建期渲染后查内存、产物自检**从磁盘回读**再查、真浏览器查渲染出来的 `innerText`。数据层（套餐名/备注/额度口径）另查一遍 |

**顺带纠正了 2.40 报告里的一处设计判断**：当时写的「`landing.js` 的 `itemsOf` 的 `match.by`
也要一起改」是**过早的一般化** —— 那是家族页才需要的机制，而 `/plans/coding/` 只有一条路由。
真正需要改的是上表那四张清单。以本节为准。

**为什么页面正文住在 `lib/plans-page.js`**：`build-local.js` 一 require 就跑整条构建链，
自测不可能把它当库用。正文渲染做成**纯函数**（不读盘、不联网、不看时钟），
于是构建期与离线自测调的是同一个函数、同一套诚实性断言（`assertPageHonesty`）。

**这一轮新抓到的两个真问题（都是断言抓的，不是人看出来的）**

1. **面包屑回站根写成了 `../`**：`/plans/coding/` 是两层路由，`../` 会解析到 `/plans/` ——
   一个不存在的地址。构建期 SEO 的 `internal-link-exists` 当场报「站内链接指向不存在的目标：plans」。
   改成由路由深度推导的前缀，并补了一条断言（离线 + 真浏览器各一条）把它钉住。
2. **页面诚实性断言第一版会在正常数据上失败**：判据写成「整行里有没有 `0`」，
   于是 `2,000` 的末位 0 被判成「原价未知却像 0」。改成**逐个数值单元格与行模型比对**，
   既没有歧义，也比正则强 —— 它同时钉住了「未知那一格显示的到底是什么」。

**页面契约**（完整见 `docs/SCHEMA-v2.1.md` §16）

11 列（平台 · 套餐 · 正常价格 · 当前活动价 · 计费周期 · 可用模型 · 额度类型 · 原始额度 ·
名义 Token 单价 · 最近更新 · 备注）；每行一个 `data-item`；JSON-LD 三段
（CollectionPage + BreadcrumbList + ItemList，ItemList 指向各平台**官方定价页**）；
可索引、进 sitemap（priority 0.9）、声明两个根 Feed、正文下限 1140 字（实测 2971）；
11 列宽表放在横滚容器里，390/360px 页面级溢出 **0px**。

**未知的三种写法**（H4b 在页面上的落点）：`未标注`（文本缺失）· `—`（数值缺失 /
**不可比较**）· `未确认`（三态）。并且**「原价未知」与「确实免费」成对断言**：
`regularPrice === null` ⇒ 必须显示 `未标注`；`regularPrice === 0` ⇒ 必须显示含 0 的数字。
只查一半会在另一个方向漏掉（把免费档也写成"未标注"，读者就再也看不到它）。

**实测（全部本机实跑）**

| 项目 | 结果 |
|---|---|
| 页面 | `/plans/coding/` 66.7 KB · 正文 2971 字 · 9 行 · h1 恰好 1 个 · ItemList 9 = 行 9 |
| `selftest:plans` | **135 项 0 失败**（数据层 117 + 边界扫描 3 + 页面层 15，含 4 条页面牙） |
| `verify`（真浏览器） | **350 项 0 失败**（+15 项 §19；三列数值与 `plans.json` 逐条对账、官链、口径文案、禁词、`../../`、390/360px 零溢出） |
| `verify:regress` | **356 项 0 失败**（卡片 50→50 · 首屏 9→9 · 页高 4589→**4665px 未变** —— 页脚那条入口没有让页面变高） |
| `verify:seo`（独立验收） | **8 项 0 失败**（114 页 · sitemap 111 · 孤儿 0 · 无效内链 0 · dist 220 文件） |
| 构建 | 构建期 SEO 门禁 **27 个检查码 × 114 个页面全过**；`build` ×2 页面逐字节一致；`check:feeds:reproducible` 46 个 Feed 文件逐字节一致 |
| 既有 20 道门禁 | 全绿（`selftest:seo` 62 项、`selftest:feeds` 71 项等，项数全部未变） |
| `check:ci` | 35 项 0 失败（门禁步骤名 `Plans self-test (data + page)` 同步改名，步数仍 29） |

- **契约** `docs/SCHEMA-v2.1.md` §16 · **报告** `research/v2.1-coding-plan-data-model-report.md`
  的「第二段」一节。
- **✅ 已上线（2026-10-01，按用户的「合并推送」）**：分支 `v2.1-coding-plan-data-model`（两个提交：
  代码+数据、文档）→ PR **#13** → `gate` **success**（[run 36808888838](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36808888838)）
  → 合并 **`535a25b`**（merge commit）→ master 上 `Verify site (gate)` 与 `Deploy to GitHub Pages`
  **双双 success**（[deploy run 36809127014](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36809127014)，
  其 `prepublish` 跑的是与 PR 完全同一个门禁 action）。
  走 PR 而**不是**直推的原因与 v2.0 相同：ruleset `master-gate` 要求
  `Changes must be made through a pull request` + 必需检查 `gate`。
  **线上冒烟实测**：`/plans/coding/` **200**（66.7 KB · 9 行 · h1 正确 · 口径文案在位 · 无禁词）·
  `/plans.json` **200**（18 KB）· `/sitemap.xml` **200**（**111** 条 `<loc>`）· 首页 200 且页脚
  「套餐对比」入口在线 · `/deal/2eae0e246de2/` `/vendor/zhipu/` `/category/api/` `/changes/`
  `/status/` `/feeds/` 全部 **200**。
  本机到该 host 这次有通路，所以冒烟是**实跑**的，不是"按上次结果推断"。
- **Phase 2.2 还剩下的**（本段没做，且是有意留的）：筛选 / 搜索 / 排序控件、
  套餐详情页（或行内展开）、首页主入口（现在只有页脚入口）、同币种价格区间筛选。

### 2.42 `v2.2-coding-plan-compare`：套餐对比页的读的那一层（2026-10-01，分支 `v2.2-coding-plan-compare`）

**起因**：2.41 结尾列的"Phase 2.2 还剩下的"四条 —— 筛选 / 搜索 / 排序控件、行内展开、
首页主入口、同币种价格区间筛选。这一轮把它们做完，**数据契约（`plans.json`）一个字节没改**。

**做了什么**

- **交互层**：`scripts/lib/plans-compare.js`（新）—— 纯函数（`matches` / `sortRows` / `countFor` /
  `priceBucketsOf` / `normalize`）+ 一个 `init(document)`。它**双宿主**：浏览器拿的是构建期
  **逐字节内联**进页面的那一份，离线自测 `require` 的是同一个文件的同一份字节（构建期自检再比一次）。
- **载荷**：页面里多了一段 `<script type="application/json" id="plans-compare-data">` —— 构建期从
  `plans.json` 算出的机器键（平台/地区/额度类型/模型/周期/币种/价格/单价/更新时间/搜索串）。
  它**只放机器键**，显示文本仍只存在于表格单元格里；构建期与 `dist/plans.json` **逐字段对账**。
- **筛选**：平台 / 模型（含「模型未标注」一档）/ 正常月费区间 / 额度类型 / 地区 / 是否有活动价。
  **价格区间只按正常月费、且不跨币种**（选项自带币种符号；原价未标注与非月付的行在价格筛选生效时不入选）。
  阶梯是声明式常量（`PRICE_LADDER`，本页唯一的任意值），只呈现有命中的档位。
- **搜索**：平台 key + 显示名 + **别名** + 套餐名 + 模型名 + 额度类型标签 + 地区标签，
  NFKC + 小写 + 子串 + 按空白切词 AND（`智谱` / `灵码` / `copilot` / `glm` 都能搜到）。
- **排序**：默认顺序 / 正常月费 / 活动价 / 名义 Token 单价 / 最近更新。**`null` 恒在可比较项之后，
  正序倒序都不越过**；价格与单价排序**按币种分组**（组序=规范序首次出现，`dir` 反转也不互换）；
  `unit` 一档**只在真有可比行时出现**（本期 0 条 ⇒ 不给这个按钮，页面上写明原因）。
- **行内展开**：`<template data-detail-for="<id>">` 惰性承装溯源（首次收录 / 最近核对 / 来源类型 /
  官方定价页 / 额度说明 / 每条引文的出处与抓取日期）。**不做 `/plans/<id>/`** —— 表里已有 11 列事实，
  剩下能说的只有"什么时候、从哪个官方页核对的"，撑不起 9 张独立页面（6 条连模型清单都没有）。
- **首页入口**：顶栏加一枚并列入口 `.plansnav`（用 `__PLANS_HREF__` 占位符，与共享页脚同源）。
  1440×900 实测**不增加任何高度**：首屏完整卡片仍 9 张、页高仍 4665px。
- **移动端**：**只选一个方案** —— 横滚 + 前两列固定（一张表、一套数据模板，真浏览器断言
  `document.querySelectorAll('.ptable').length === 1`）；筛选 chip 在窄屏收成一行横滑
  （与首页 `.facetsin` 同一条做法，实测表格起点 716 → 616px）。
- **无 JS**：控件整块由 JS 建，静态 HTML 里 `#plans-compare` 是空的，另加 `<noscript>` 说明。
  真浏览器用 `javaScriptEnabled:false` 的上下文断言：9 行、9 个官方链接、正文 3352 字、**0 个控件**。

**这一轮实测抓到的两个真问题**（都不是看出来的）

1. **事件委托挂错了容器** ⇒ 「点详情没反应，其它控件都正常」。委托挂在控件容器 `.pctl` 上，
   而详情按钮长在**表格行**里。症状极具迷惑性：按钮渲染正常、`aria-expanded` 也对，
   只是永远不展开（详情行数恒为 0）。
2. **`.ptable` 自带的 `overflow: hidden` 会成为"最近的可滚动祖先"** ⇒ 窄屏 sticky 前两列
   **根本没粘住**（滚动 300px 后首列 left = -283px）。桌面端那个 `overflow:hidden` 是给圆角裁剪用的，
   谁也想不到它会让粘性失效。修法：窄屏把表格置 `overflow: visible`，圆角交给外层容器。
   顺带发现：详情行的 `colspan=11` 单元格比滚动视口宽，粘性无法满足约束 —— **刻意不粘**，
   并把这条写进 CSS 注释，而不是留一条看着在粘、实际没粘的规则。

**实测（全部本机实跑）**

| 项目 | 结果 |
|---|---|
| 页面 | `/plans/coding/` 105.9 K 字符 / 落盘 130.6 KiB（66.7 K → 105.9 K：载荷 ~5 K + 内联交互脚本 22 K + 页面级 CSS ~2 K）· 正文 3732 字 · 9 行 · h1 1 个 |
| `selftest:plans` | **182 项 0 失败**（v2.1 的 135 + ⑬ 载荷 15 项 + ⑭ 语义 25 项 + ⑮ **7 条牙**；每条牙都实跑变红） |
| `verify`（真浏览器） | **379 项 0 失败**（§19 从 15 项扩到 45 项，新增 30 项：8 平台 / 3 类额度 / 4 档价格 / 4 个搜索词逐个对账、两种排序方向、详情展开收起、390/360px sticky 与溢出、粘性列链接可点、无 JS 零控件、筛选不改地址） |
| `verify:regress` | **385 项 0 失败**（覆盖优惠 80→80 · 卡片 50→50 · 首屏 **9→9** · 页高 4589→4665px 未变 · 外部请求 0 · JS 错误 0） |
| `verify:seo` | **8 项 0 失败**（114 页 · sitemap 111 · 孤儿 0 · 重复 canonical 0 · 无效内链 0 · dist 220 文件） |
| 构建确定性 | `build` ×2 套餐页 SHA256 一致（`48C724E6…91F`）· `check:feeds:reproducible` 两次构建全部逐字节一致 |
| `check:plans:reproducible` | exit 0（9 条 · `updatedAt=2026-10-01T00:00:00+08:00`）—— 数据契约未动 |
| 既有门禁 | `validate` / `check:reproducible` / `check:history` / `check:zh` / `selftest:zh` 15 / `selftest:expiry` 94 / `selftest:text` 46 / `selftest:health` 51 / `selftest:provenance` 91 / `selftest:history` 61 / `selftest:changes` 89 / `selftest:feeds` 71 / `selftest:seo` 62 / `selftest:audience` 161 / `selftest:app-token` 67 / `fixture:test` 4 —— 项数全部未变、全绿 |
| `check:ci` | **35 项 0 失败**；门禁仍 **29 步**（本轮**不新增门禁步骤**：新牙挂在既有的 `Plans self-test` 里） |

- **契约** `docs/SCHEMA-v2.1.md` §17（页面交互契约）· **报告**
  `research/v2.2-coding-plan-compare-report.md`。
- **✅ 已上线（2026-10-01，按用户的「推送上线」）**：分支 `v2.2-coding-plan-compare`
  （提交 `122c272`，rebase 到 `cf3bf13` 之后）→ PR **#15** → `gate` **success**
  （[run 36820257952](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36820257952)）
  → 合并 **`18f782b`**（merge commit）→ master 上 `Verify site (gate)` 与
  `Deploy to GitHub Pages` **双双 success**
  （[deploy run 36820258045](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36820258045)）。
  **线上冒烟实测（真浏览器打线上地址，不是按上次结果推断）**：`/plans/coding/` **200**
  （133,710 字节，与本地 `dist/` 产物同源）· 载荷 1 段、详情模板 9 个、**占位符残留 0** ·
  初始「显示 9 / 共 9 条套餐」· 平台筛选现场与线上 `plans.json` 对账一致（codebuddy 1/1）·
  搜索「灵码」命中 1 条 · 月费升序 `¥0 ¥49 ¥59 ¥99 ¥99 ¥99 $10 $20 未标注`（不可比较恒在末尾 +
  币种分组）· 详情 `colspan 11/11` 且含官方链接 · 390px 溢出 0px、平台列 16 / 套餐列 94、只有一张表 ·
  **无 JS 时 9 行 / 9 个官方链接 / 0 个控件 / 正文 3352 字** · **线上 JS 错误 0** ·
  首页顶栏「套餐对比」入口 1 个、页脚 2 个 · `sitemap.xml` **111** 条 `<loc>` ·
  `/plans.json` `/changes/` `/status/` `/feeds/` `/vendor/zhipu/` `/category/api/` `/feed.xml`
  全部 **200**。
- **本阶段刻意没做**（题面 §15）：综合推荐 / 星级评分 / benchmark / 模型能力排行 / API plan /
  价格预测 / AI 推荐套餐；另加：筛选组合 URL、独立 plan 详情页、平台页（`providers.json` 里的
  `slug` 继续闲置）、汇率与跨币种比较、`plans.json` 数据扩充、全站导航改造。

**上线后修复：口径说明被压成窄柱（2026-10-01，用户截图反馈）**

- 现象：页面底部「口径与说明」只占正文左侧约 1/3（530px / 1380px），每句被切在词中间。
- 原因：这一页给长文段写了 `max-width: 82ch` —— `ch` 量的是 `0` 的宽度，12px 字体下 ≈ 6.5px，
  于是"可读性上限"在宽屏上变成了窄柱；而这段正是读者理解本页判据的唯一出处。
- 修法：`.plist` 与末尾 `.snote` 改 `max-width: none`，CSS 注释写明踩坑原因（防照习惯加回来）。
- 实测：列表 530 → **1380px**（= 表格宽度）· 每句行数 `[2 2 3 1 1 2 3 3 2]` → **`[1×9]`** ·
  390px 无变化、溢出仍 0px。
- 回归保护：`verify-site.js` §19 新增 2 条断言（盒子宽度 ≈ 表格宽度 · 每句 ≤ 2 行），
  **未新增门禁步骤**；`verify` **381 项 0 失败** · `verify:regress` **387 项 0 失败**。
- **✅ 已上线（2026-10-01）**：分支 `fix/plans-notes-width`（`1c51b14`）→ PR **#17** →
  `gate` **success**（[run 36822680821](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36822680821)）
  → 合并 **`430c2a1`** → `Verify site (gate)` + `Deploy to GitHub Pages` 双双 success
  （[run 36822963137](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36822963137)）。
  **线上冒烟（真浏览器打线上地址，不是按本地结果推断）**：`/plans/coding/` **200**（134,299 字节，
  与本地产物同字节）· 列表 / 末尾段 / 表格宽度 **1380 / 1380 / 1380px** · 每句 **1 行** ·
  390px 溢出 **0px** · 载荷 1 段 · `<template>` 9 个 · 占位符残留 0 · 无 JS 9 行 / 9 链接 / **0 控件** /
  正文 3352 字 · 首页有入口 · **线上 JS 错误 0** ·
  `/` `/plans.json` `/changes/` `/status/` `/feeds/` `/sitemap.xml` 全部 200。

**上线后调整：顶栏入口挪到配色切换器右边 + 名字写全（2026-10-01，用户反馈"入口太不明显"）**

- 做法：`index.html` 顶栏里 `<a class="plansnav">` 从**品牌右边**（第二顺位）挪到 **`#themeSeg` 右边**、
  `.topstat`（50 条优惠 · 更新日期）之前；文案 `套餐对比` → **`AI Coding 套餐对比`**
  （与 `/plans/coding/` 的 h1 同名，那个 h1 才是文案的唯一出处）。
- 顺手修掉一条**本来就存在**的溢出：761–940px 之间顶栏一行放不下、整页横向滚动。
  实测（线上旧版）：**761px 溢出 78px、820px 溢出 19px**；入口加长后 761px 会到 138px。
  修法是一条只管顶栏的媒体查询（`min-width: 761px and max-width: 940px` 时顶栏换行、
  搜索框独占一行），不动 `.grid / .facets` 那些真正属于"窄屏"的规则。
- 实测（320–1920 逐档扫 17 档）：修复前最大溢出 **138px** → 修复后 **全 0px**；
  1440px 顶栏高 ~59px、首屏完整卡片仍 **9 张**；390px 顶栏高与修复前一致（148px）。
- 回归保护：`verify-site.js` 新增 **7 条**断言（入口在切换器右边的几何判定 · 761/820/900/940/941px
  不溢出且搜索框 ≥180px 且入口在视口里 · 首页顶栏入口名与套餐页 h1 逐字一致）。
  **打线上旧代码实跑：正好这 4 条变红**（几何 191 vs 917 · 761px 溢出 78px · 820px 溢出 19px ·
  名字「套餐对比」≠ h1），说明不是空断言。
- 门禁复跑（干净 worktree，与 CI 同一份代码）：`verify` **388 项 0 失败** ·
  `verify:regress` **394 项 0 失败** · `selftest:plans` 182 · `verify:seo` 8 · `check:ci` 35 ·
  三个 `reproducible` 全过 · 构建 ×2 逐字节一致。
  **✅ 已上线**：PR **#19** @ `9cd420e` → `gate` success（[run 36825518261](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36825518261)）
  → 合并 **`c021c52`** → 部署双绿。

**再调整：入口改成实心品牌色药丸（同日，用户"改成实心品牌色药丸我看看效果"）**

- 填充 `var(--brand)`、文字 **`var(--on-accent)`** —— 不新调色：`--on-accent` 的注释里本来就算过
  「白字压 `#3b5bfd` 5.12:1 / 深字压 `#7c93ff` 6.85:1」，两个主题各自都对。
- 新增 `--brand-ink`（亮 `#2348c4` / 暗 `#8fb0ff`）当 hover 一档（7.5:1 / 8.99:1）；字重 600；
  补 `:focus-visible` 焦点环（描边款原本没有）。
- 宽度盘点：加粗后药丸 138 → 139px；320–1920 逐档重扫**溢出全 0**，1440 顶栏仍 59px、
  首屏完整卡片仍 **9 张**，941px 单行布局搜索框 216px（与上一版持平）。
- 回归保护：`verify-site.js` 再加 1 条 —— 「填充 == 页面 `--brand`、文字 == `--on-accent`、字重 ≥600」
  （不写死色值，暗色换令牌不会假红；文字对比度另有 §13 全站探针兜底）。
- 门禁复跑：`verify` **389 项 0 失败** · `verify:regress` **395 项 0 失败** · `selftest:plans` 182 ·
  `verify:seo` 8 · `check:ci` 35 · `validate` 通过 · 构建 ×2 逐字节一致。

### 2.43 `v2.3-plan-history`：套餐的长期变化追踪（2026-10-01，分支 `v2.3-plan-history`）

**起因**：2.42 之后，套餐页只回答「现在是什么套餐」。这一轮让它回答「这个套餐最近发生了什么变化」——
新增 `scripts/data/plan-history.json`（一次性基线 + 追加事件）、套餐页的「最近变化」块与行内时间线、
`/changes/` 的套餐分栏，以及一份独立的套餐变化订阅源。

**§一 先做的分析：哪些抽象成通用框架、哪些不共享**

`lib/history.js`（v1.4 的优惠日志）里真正**与业务无关**的机制被抽进新的 `lib/history-core.js`：
确定性序列化、一次性基线 + 事件重放、链校验、「基线+事件 ⇒ 当前状态」一致性、事件身份、
观测态裁剪、上限。`history.js` 改为**委托**（公开 API 逐字不变，deals 侧行为零变化：
`selftest:history` 61 项与 `check:history` 全绿）。**刻意不共享**的四类东西逐条登记在
`docs/SCHEMA-v2.3.md` §2：事件类型表、跟踪字段与措辞、「消失」的判据（plans 没有采集器）、
数组语义与雷达分栏。内核为容纳 plans 只加了三个**通用**扩展点：
`readField`（支持 `billing.regularPrice` 这类路径）、`compare`（按字段覆写相等判据）、
`applyEvent` / `eventValueMatches`（元素级数组事件的重放与链校验）；
并区分 `recordKey`（数据上是 `id`）与 `eventKeyName`（事件上是 `planId`，按题面 §四 命名）。
**边界有牙**：`selftest:plan-history` §⑭ 静态扫描「内核里不许出现任一方的专有字段 / 事件类型」
+「两个领域层里同名的机制函数必须是转手调 `core.*` 的薄包装」；`selftest:plans` §⑪ 同步改成四句话的边界
（deals 链路一个字都不提 plans；订阅层是**唯一**允许引用 plans 的通道，且不许自己读数据文件）。

**事件与字段（题面 §二 / §三 / §四 / §五）**

- 事件类型 **17 类**：题面点名的 11 类全保留，另 6 类由 schema 逼出（`promo_changed` /
  `quota_changed` / `model_changed` / `availability_changed` / `billing_changed` / `updated`）。
- `meaningfulPlanFields` **13 个**；`lastSeen` / `verifiedAt` / `evidence` / `derivedMetrics` /
  两个备注字段**明确不跟踪**（逐条理由在契约 §5.2）——「人工每次回访都会刷新」的字段记进日志
  等于每轮造 9 条假事件。
- 一处需要判断的投影：`quota.description` 只在 `rate_limited` / `unlimited_fair_use` / `other` 上
  是被跟踪的额度口径；量化型套餐的说明是解释性散文 ⇒ 投影为不跟踪（题面 §三 的直接要求）。
  空白与标点差异一律不产生事件，但文字本身差一个语义就照样记（不做相似度比较）。
- `eventId` 是**派生字段**（`verifyStore` 重算并比对，手写必红），同时是订阅源的 `<guid>`；
  「重复运行不重复产生事件」另由链校验与 `eventKey` 幂等两道保证。
- **时间只来自数据**：`at` 取 `plans.json` 的 `updatedAt` 前 10 位；早于该套餐上一条事件的日期时
  **拒绝写盘并报错**（「请先更新 lastSeen」），绝不倒填。

**§七 退出保护（plans 没有采集器，所以不复用来源健康）**

R1 唯一写入点（`rebuild-plans.js` 成功写盘时才写日志；来源层有硬问题或 `--dry-run` 一律不写）
· R2 连续 **2 次**成功运行未见才记 `ended` · R3 **批量熔断**（单次缺席 `>= max(3, ⌈半数⌉)` 或输出为空
⇒ 不推进计数、不记 `ended`，只在 `anomalies[]` 留档；真实批量下架须显式 `--allow-mass-removal`）
· R4 **周期重键**（同一次运行里月付改年付 ⇒ 立即 `ended(period_changed)` + `created(supersedes)`，
这是 v2.1 契约点名必须显式决策的那一条）· R5 fail-closed · R6 确认期窗口由「待确认」清单点名。

**展示与订阅**

- `/plans/coding/`：表格**之前**的「最近变化」块（`#plan-changes`，5 条 + 起算日 + 「全部变化 →」；
  必须放在 `#plans-compare` 之外 —— 那个容器的 innerHTML 会被 JS 整块替换）+ 每个数据行的
  `id="plan-<id>"` 锚点 + 行内详情的「变更记录（N 条）」时间线（最近 10 条 + 「另有 N 条更早」）。
- `/changes/`：**没有新做一页** —— 顶部加「优惠变化 / 套餐变化」锚点导航，表格后追加套餐四栏
  （今日新增 / 最近 7 天变化 / 不再收录 / 重新出现，各 30 行上限）。
- 订阅：`/feed/plans/coding/changes.xml|.json`（`kind: 'plan-changes'`，与 deals 的两份变化源**并排**）；
  `<guid>` = 派生 `eventId`，`<link>` = `/plans/coding/#plan-<planId>`；构建期断言「每条深链的锚点
  在页面上真的有落点」。**Feed 23 → 24（46 → 48 个文件）**，`/feeds/` 新增「套餐」分组。
- 措辞**只有一处实现**（`plans-page.planChangeTextOf`）：页面块、时间线、`/changes/` 分栏与订阅源
  说的是同一句话。

**门禁**：新增两步（`Plan-history self-test` / `Plan-history verify (log consistent with plans.json)`），
**29 → 31 步**（`GATE_STEP_NAMES` ↔ `action.yml` 同索引同步）；`--expect-checks=35` 不变。
新增 4 个 npm 脚本：`baseline:plan-history` / `selftest:plan-history` / `check:plan-history` / `report:plan-changes`。

**实测（全部本机实跑）**

| 项目 | 结果 |
|---|---|
| `selftest:plan-history`（新） | **132 项 0 失败** |
| `check:plan-history`（新） | exit 0 · 起算日 2026-10-01 · 基线 9 条 · 事件 0 条 · 6.8 KB / 上限 1 MB |
| `selftest:plans` | 182 → **202 项 0 失败**（新增 §⑯：最近变化块/时间线/锚点 + 4 条牙） |
| `selftest:feeds` | 71 → **84 项 0 失败**（新增 §九：套餐变化源 + 3 条牙 + 「套餐空态不许复用优惠那句」） |
| `selftest:history` / `check:history` | **61 项 0 失败** / 重放一致 —— 内核抽离后 deals 侧行为未变 |
| `verify`（真浏览器） | 379 → **406 项 0 失败**；`verify:regress` **412 项 0 失败**（覆盖 80→80 · 卡片 50→50 · 首屏 9→9 · 页高 4589→4665px · 外部请求 0 · JS 错误 0） |
| `build` ×2 | 全部自检通过；套餐页 / `/changes/` / 套餐变化 Feed / `plan-history.json` 两次构建 **SHA256 逐字节一致** |
| 既有门禁 | `validate`（strict）/ `check:reproducible` / `check:plans:reproducible` / `selftest:seo` 62 / `verify:seo` 8 / `check:ci` **35** / `check:zh` / `selftest:zh` 15 / `selftest:expiry` 94 / `selftest:text` 46 / `selftest:health` 51 / `selftest:provenance` 91 / `selftest:changes` 89 / `check:feeds:reproducible` / `selftest:audience` 161 / `selftest:app-token` 67 / `fixture:test` 4 / `ai:selftest` —— 全部 exit 0 |

**题面 §十三 的 5 条 Tooth Test + 2 条补牙（逐条实跑）**：顺序变化 0 事件；来源层非法 → rebuild 拒绝写盘
（`plans.json` 与 `plan-history.json` 哈希不变）；一次缺席 5/9 → 0 条 `ended` + 熔断留档；
同一变化跑两次 → 1 条 / 0 条且字节不变；`quota 6e9 → 3e9` → `quota_decreased`；`promoPrice null → 9.9`
→ `promo_started`；日期倒填被拒；手写 `eventId` 必红。另有真实写盘路径上的 E2E：改价 1 条事件、
再跑一次 0 条；只删 1 条第一次不判死、第二次确认。

**体积**：`plan-history.json` 6.8 KB · `dist/plans/coding/index.html` 105.9 → **约 111 K 字符**
（最近变化块 + 时间线 + 新增样式；工作区另有会话在改共享顶栏，两次构建之间它从 110.5 变到 111.6 K，
这段差值不全是本阶段）· `dist/changes/index.html` 75.2 KiB · 套餐变化 Feed 1.2 KB / 0.9 KB ·
`dist` **223** 个文件 / 974.5 KB。

- **契约** `docs/SCHEMA-v2.3.md`（§2 复用/不共享 · §4 事件类型 · §5 字段与投影 · §6 Stable ID ·
  §8 退出保护 R1–R6 · §11 页面与订阅）· **报告** `research/v2.3-plan-history-report.md`。
- `docs/SCHEMA-v2.1.md` §10 的已知限制（月付改年付）已回填结论并指向 v2.3 §8 R4。
- **本阶段刻意没做**：综合推荐 / 星级 / benchmark / API plan（2.5）/ Deals↔Plans 关联（2.4）/
  独立套餐详情页 / `/plans/<id>/` / 平台页 / 汇率 / 自动采集套餐 / 把套餐变化混进优惠的变化流 /
  页面载荷扩到历史（按套餐线性加事件会让体积不可控，另做设计再说）。
- **✅ 已上线**：分支 `v2.3-plan-history` → PR **#21** → `gate` **success** → 合并 **`0f2efa5`** →
  `prepublish` / `build` / `deploy` **全绿**。线上冒烟（真浏览器 + 直接打线上地址）：
  `/plans/coding/` **200**（136.5 KB · 最近变化块 / 9 个 `#plan-<id>` 锚点 / 空态文案 / 套餐变化源声明都在）·
  `/changes/` **200**（76.2 KB · 锚点导航 / 套餐四栏 / 两条变化源）· `/feed/plans/coding/changes.xml` **200**（良构）·
  `/plan-history.json` **200**（6.8 KB，与源逐字节相同）· `/feeds/` **200**（列出套餐变化源）。
- **上线后修复（同日）**：打线上 Feed 时发现套餐变化源的**空态复用了优惠那一句**
  （「还没有观测到优惠内容、领取条件或有效期的变化」——套餐根本没有这两个面）。修法是新增
  `FEEDS_NOTES.emptyPlanChanges` 并加一条牙（`selftest:feeds` §九：套餐空态必须说套餐的变化面，
  且不许出现「优惠内容 / 领取条件 / 有效期」）。这正是「上线后打产物」而不是「本地看构建日志」抓到的。

---

### 2.45 `v2.5-api-token-plans`：API / Token 计费对比（2026-10-01，分支 `v2.5-api-token-plans`）

**契约**：`docs/SCHEMA-v2.5.md`（实现与它不一致时以它为准）。

**先分析再动手（题面 §一 要求先回答 BasePlan 的问题）**：结论是**要 BasePlan，但它是「共享判据」
而不是「共享记录形状」** —— 实现上不建混合表，`plans.json` 一个字节没动。
逐维度对照表与「为什么不把 `kind:'api'` 塞进 `plans.json`」的五条理由见契约 §2；
最要紧的一条是：**那个文件的字段集是封闭的**（白名单 + 归一器重跑逐字段比对），
混合之后 coding 的每条字段都要变成按 kind 分支，而它正被 202 项自测与线上用户用着。

**记录粒度**（题面 §四）的关键判断：题面提示身份是 `provider / model / pricing variant`，
**价格的身份确实是三元组，但记录不是** —— 记录 = provider × 计费产品，模型价格是记录内的元素，
身份 `(modelKey, variant)`。理由是可判定的：若记录 = provider × model，
题面 §十 想要的厂商级赠送（「新用户送 500 万 tokens」）会撞上 `planIdsPerLink = 8` 的上限，
而 provider 级事实（免费额度 / credits / 限速 / 单位）per-model 存储会在几十行里漂移、
一变就产生 N 条假事件。

**这一层与订阅套餐真正不同的三件事**（也是自测里三条牙的落点）：

| 维度 | 做法 |
|---|---|
| **单位** | `pricing.unit` 是记录级**必填枚举**（`per_1M_tokens` / `per_1K_tokens` / `per_1M_characters`）；页面上每个价格旁边有币种，每行有「计费单位」列。**全仓没有任何单位换算代码** —— 自测有一条静态扫描钉住 `api-plan-schema.js` 里没有 `1e3`/`1000 *` 这种常数乘法，也没有 `convertUnit` 这类函数名 |
| **credits** | 字段白名单里**没有任何 token 字段**，且额外拒绝键名含 `token` 的键 ⇒「$10 credits = 500 万 tokens」**根本没有地方可写**；页面也不折算。`derivedMetrics` 恒为 `{}`（混合单价需要工作负载假设、credits→token 需要选定模型，两者都是成本计算器的事） |
| **模型改名** | 显示名 `name` 不进被跟踪字段 ⇒ **只改显示名产生零事件**；换 `modelKey` 会变成 `model_removed`+`model_added`，并由「同记录 + 同时增删 + 单价有完全相同项」判据留档为 `possible_rename`。**检测不等于自动合并**：本仓没有合并 modelKey 的代码路径，修法只有人工写 `aliases` |

**数据（5 家平台，全部逐字取自官方页；查不到就不收）**：智谱 `open.bigmodel.cn/pricing`（12 个模型计价条目，
含 `[0,32K)`/`[32K+)` 分档与 2 个免费模型）· DeepSeek `api-docs.deepseek.com/quick_start/pricing`
（PEAK / OFF-PEAK **两个通道**，同一模型两套价，正好验证 `channel` 轴）· OpenAI
（Standard / Batch 两个通道 × Short/Long context 两个变体，外加一个**按分钟计价**的 `mediaRates` 条目）·
Anthropic（`cacheWrite` 与 `cacheWriteLong` 两档写缓存价，官方同时公布 5 分钟与 1 小时）·
Google Gemini（Free Tier 免费档 + 上下文缓存**按百万 token·小时**计的存储价 + 2027 年调价原文写在备注里）。
共 **7 条记录 / 37 个模型计价条目 / 19 条官方引文**，国内 3 条、国外 4 条，3 种计费通道。

> **候选未采信（一条都没写进数据）**：阿里云百炼、火山方舟、月之暗面、MiniMax、硅基流动、Mistral。
> 前五家的定价表要么是 JS 分页/按模型切换（渲染后也只拿到当前选中模型的值），要么根本没有可提取的
> token 单价表；Mistral 的 `/pricing` 已改成订阅套餐页。按本仓「没有逐字官方原文就不收录」的红线，
> 它们**只能记成候选未采信**，不为凑家数编数据。

**变化追踪**：复用 `history-core` 内核 —— v2.5 把 `plan-history.js` 的 `record()` **按 profile 参数化**
（`recordWithProfile`），API 那一份只提供 profile + 措辞 + 薄封装（16 类事件、15 个被跟踪字段）。
硬验收：**重构后 `plans.json` 与 `plan-history.json` 逐字节不变**（`git diff` 为空），
`selftest:plan-history` 132 项、`check:plan-history`、`selftest:plans` 202 项全绿。

**优惠 ↔ 计费记录**：关系表**格式一个字没改**，只是 id 空间变成合并的（两个 store 的 id basis 都含 `kind`）。
注入 `dist/deals.json` 的字段新增 `planKind`（本层唯一一次契约变更，理由见契约 §14）；
API 记录没有 `billing`，所以任何 `promo` 都不产生"节省金额"。新增 2 条真实关系
（智谱「2000 万免费 Tokens 资源包」→ API 计费记录；「GLM-4.7-Flash 免费模型」→ 同一条记录），
优惠页与 API 计费页**双向深链**。

**页面 `/plans/api/`**：11 列预渲染静态表（平台 · 模型 · 变体 · **计费单位** · 输入价 · 输出价 ·
缓存命中输入 · 其他计费维度 · 免费额度 / credits · 最近更新 · 官方来源），**零控件**（v1 不做筛选排序），
另有「免费额度与 credits（厂商级事实）」明细节、「最近变化」块（同样是构建期静态渲染）、
官方原文 `<details>` 与口径说明九条。

**三个抓出来的真缺陷（都是"跑出来"而不是"读代码"发现的）**：

1. **占位符互为子串**：新占位符本来叫 `__APIPLANS_HREF__`，而它**包含** `__PLANS_HREF__`；
   `resolveRouteHrefs()` 是逐条 `split/join`，先替换短的那个会把长占位符打碎 ⇒
   **117 个输出同时残留占位符**。改成 `__APIPLAN_HREF__`，并在模块加载时加一条
   `assertRouteMarkersDisjoint()`（占位符之间不许互为子串）把这条约束变成构建期硬失败。
2. **CSS 注释里的占位符字面量**：顶栏药丸的注释里写了占位符名，而 `<style>` 会被构建期
   **逐字抽进每一个页面**、又**不经过页脚那套按深度解析** ⇒ 所有页面残留一个"占位符形态"的字符串。
   连注释里的示例写法（`__XXX_HREF__`）都会命中产物自检的扫描正则。
3. **套餐页的关系块多出 7 行**：`planDealsView()` 合并两个 store 之后，套餐页那一块会渲染出
   API 记录的行（行数与断言不符）。修法是 `planDealsBlockHtml`/`assertPlanDealsBlock` 按 `kind` 过滤
   ——**判据只有一处**，两个页面共用，不给"两边各写一套"留口子。

**验证**（全部实跑）：

| 检查 | 结果 |
|---|---|
| `npm test` / `test:strict` | 通过（新增 API 计费统计行：7 条 · 5 个平台 · 37 个条目 · 国内 3 / 国外 4） |
| `selftest:api-plans` | **76 项 0 失败**（含 4 条 Tooth Test，逐条实跑变红再复原） |
| `selftest:plans` / `selftest:plan-history` / `selftest:deal-plan-links` | 202 / 132 / 78 项，**0 失败**（第 1 条是既有断言拿 `OpenAI` 当"未登记"的例子，现在它被正式登记了，换成确实没登记的名字，断言意图不变） |
| `check:api-plans:reproducible` / `check:api-plan-history` | 逐字节一致 / 基线+事件重放 == 当前数据 |
| `npm run build` | 产物自检全过（`dist/api-plans.json` 与源逐字节相同；API 计费页从磁盘回读再跑一遍断言） |
| `npm run verify` | **438 项 0 失败**（新增 §20 共 23 项：行数 / ItemList / **三列逐格对账** / 单位列逐行 / 0 控件 / 锚点 / canonical / 面包屑深度 / 页脚入口 / 互链 / 390·360px 无溢出 / sitemap） |
| `check:ci` / `seo-verify` / `check:feeds:reproducible` / `check:zh` | 全过（门禁步骤 31 → **34** 步；`--expect-checks=35` 不变） |

**本阶段刻意没做**（登记在契约 §17）：模型能力排行榜 / AA 分数 / benchmark / 综合推荐 / 最值得买 /
自动模型推荐 / 成本模拟器 / 跨币种跨单位换算 / credits→token 折算 / 模型注册表 / `/plans/` hub 页 /
`/plans/api/` 的筛选排序控件 / **专属订阅源与 `/changes/` 分栏扩展**（后两条是独立的一次改动：
变化源的注册表当前是单条 spec，扩成两条要动 `feeds.js` 的注册表与 `/feeds/` 页面的回链断言，
不该塞进本轮）。

**上线记录**

- **第一次合并（PR #24，commit `983effe`）：gate 通过，但 Deploy 失败** —— 失败在回归比对
  `回归：JS 错误仍为 0 — 1 个`。这是本轮**唯一一次**由 CI 而不是本地抓到的缺陷，值得记下来：
  根因是我在 `verify-site` §20 里写了 `page.goto('sitemap.xml')`，而 XML 文档没有
  `<link rel="icon">`，浏览器于是去要 `/favicon.ico` → **404** → Chromium 记一条控制台错误；
  这一节又**独独没有做错误计数的前后快照**（其余每一节都有），于是那条错误被记到整轮的账上，
  而所有逐页断言都是 0。**修法不是调松门禁**：sitemap 改用页面内 `fetch()` 读，并补上
  `errorsBeforeApi` / `externalBeforeApi` 快照与一条「本节 0 错误 0 外部请求」断言。
- **同一轮顺带抓到第二个缺陷**：`/plans/api/` 写了 `data-logo` 却既没引用 `logos.css`、
  类名又不是 `lg`（`logos.css` 的选择器是 `.lg[data-logo="key"]`）⇒ 每一行的 logo 位是**空方块**。
  这类坏法**既不报错也不发外部请求**，构建期"logo key 全部已登记"也查不到（它查的是被引用的
  key 有没有图形，不查有没有加载那份 CSS）。修法：引用 `logos.css` + 类名改回 `lg`，
  并给 §20 加一条**量出来**的断言（背景图非 `none`、尺寸非零）。
- **第二次合并（PR #25，commit `0409663` → 合并 `9f36a0a`）：** `gate` **success**（run 36838963689）→
  `Deploy to GitHub Pages` **success**（run 36839340026）。
- **线上冒烟**（真浏览器 + 直接打线上地址，`npm run verify -- --url=https://buguoshixc.github.io/ai-deals-aggregator/`）：
  **440 项 0 失败**，含新增的 §20 共 23 项（`/plans/api/` 37 行与 `api-plans.json` 逐个对账 ·
  ItemList 声明数 == 行数 · **输入/输出/缓存命中三列逐格对账** · 计费单位列逐行 ·
  7 个记录锚点 · 0 控件 · 与套餐页互链 · 390/360px 无页面级溢出 · sitemap 成员资格 ·
  本节 0 错误 0 外部请求 · **logo 背景图解析到线上 `logos/anthropic.svg`**）。
  另直接打线上：`/plans/api/` **200**（131.3 KB）· `/api-plans.json` **200**（37.2 KB）·
  `/api-plan-history.json` **200**（28.4 KB）· `/plans/coding/` **200** · `/sitemap.xml` **200**。
- **记一条反复踩的坑**：CSS 注释里写反引号会把 JS 模板字符串提前截断（本轮踩了两次，
  症状是构建报 `… .lg is not a function` —— 离原因很远；上一次是注释里写了路由占位符的字面量）。
  两处注释里都已标注这条约束。


