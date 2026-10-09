# 下一步：现在的状态，以及还需要你点头的事

> **2026-10-04 质量收口（quality-closure-post-audit）· 当前状态**
>
> 本轮只做四件事：修真实缺陷、补高价值 Guardrail、对证据不足项重新验证、统一修正文档漂移。
> 结果见 `research/quality-closure/` 的 `RECLASSIFIED_FINDINGS.md`（99 条旧 finding 逐条落到九类）·
> `FIXED_FINDINGS.md`（独立复核）· `MUTATION_RESULTS.md`（21 例变异）· `source-revalidation.md`（来源回访）。
>
> **现行数字（2026-10-04 重算，命令见 `RECLASSIFIED_FINDINGS.md` §0.2）**：
> deals **134**（deal 80 / tool 54）· plans **23** · api-plans **13** 条 / **67** 个计价条目 / **10** provider ·
> models **44** · registry 映射 **64**（API 55 + Coding 9）· gaps 声明 **10** ·
> Feed **24 份（×2 = 48 文件）** · HTML 页 **173** / sitemap **170** / dist **290** 文件 ·
> 门禁断言 **36** · 三份变化日志事件 deal 0 / plan 14 / api 6。

## 0. 本轮：`secondary-page-residue-v2` —— 扫描面外 8 类小字容器 + 上一轮 47 行「待确认」收口（2026-10-09 · **未提交 / 未发布**）

> **一句话**：上一轮报告 §8 那 **7 组「待用户确认」**与**扫描面之外**的 8 类小字容器
> （`.dsrc-note` / `.ddesc` / `.fdesc` / `.chgnote` / `.pchnote` / `.pftdesc` / `.chgmeta` / `.hint`，
> 86 组 / 352 次出现 / 186 页）**全部处置完毕**：**实删 5 组、保留 87 组、挂起 0**（**没有一条挂回「待确认」**）。
> 实删 11 个源码编辑点 + 17 条数据面 `description` 行（28 处、1164 字可见正文），
> 并把「删掉不许回流」「扫描面不许收缩」落成**构建期机器牙**（判据本体 `build-local.js` 的 `scanResidue()`）。
> **没有调低任何下限、没有删任何断言、Feed 50 个文件逐字节 0 变化**。

### 已完成（可复核）

1. **删除面**（外科式，不是整段砍）：① `.dsrc-note` 尾半句「；最终以厂商官方页面为准。」×80 页（49 → 37 字，
   权威常量 `audience.js:826` 与前端受控副本 `index.html:1347` **同批**改，`checkWordingContract` 逐字比对）；
   ② `.ddesc` 的「（无头浏览器渲染后提取）」整括号 ×17 页 —— **改真源**（`headless.js` 3 处模板 + `deals.json` 17 条），
   队长裁定「不做渲染层遮盖、不授权把 `dist/deals.json` 记为已知承载」；③ `/plans/`·`/plans/coding/`·`/plans/api/`
   导语/口径里与共享页脚重复的 4 处半句；④ `plan-history.js:231` 上一轮**漏删**的尾句（注释声称删了、字面仍在）；
   ⑤ `/models/` 题注末句（−30 字，§8 七组里**唯一**批准删除的一组）。
2. **保留面**（机制性理由，不按口味）：82 组 = 既有断言钉住 2 组 + 数据面依赖 29 组（含 `.fdesc` 25 条 = Feed
   description 槽位）+ C 类数据语义 45 组 + D 类交互/结构槽位 5 组；§8 另外 6 组由**页面族结构下限**
   （`main-snote ≥ 2` / `≥ 4`）与**题注牙 + 表格 a11y 名**钉住。`/feeds/` 那条 21 字的两态实测（现构态删它零余量、
   普查态删它 3 < 4 当场红）写进了源码注释。
3. **两条新牙**（唯一实现，CI 里一步、构建期每次都跑）：① **删掉不许回流** —— 整篇产物 304 文件里
   44 条断言字面**三遍 0 命中**（原样 / 归一化 / JSON 转义）+ 页脚保留句 186/186 页仍在 + 共享页脚不含登记字面；
   ② **扫描面不许收缩** —— 8 类容器下限 + 关系式 `.ddesc ≥ 1×详情页数` / `.dsrc-note ≥ 2×详情页数`
   + 反空洞（条目 ≥ 30 / 活字面 ≥ 40 / `floor ≥ measured × 0.5`），登记表缺失**抛错停构建**。
4. **变异证明**：真构建恢复被删句首 ⇒ exit 1 并点名登记 id 与落点；`.fdesc` 唯一构造点改名 ⇒ 下限红；
   登记表砍到 29 条 ⇒ 红；删掉登记表 ⇒ 抛错；产物副本注入页脚**外** ⇒ 红。
5. **真浏览器**：全站 186 页四面（`innerText` / `textContent` / 剥脚本 HTML / **不剥**脚本整份 DOM）0 命中
   （阳性对照：删前每页 7 条 → 删后 0）；8 类容器 DOM 总数逐类 == 构建期牙实测 == 独立重写计数；
   `verify-site.js --dir=dist` **892 项 / 失败 0**；正文下限一页未破（deal 最小余量 639）。

### 剩余事项（**都不是「已解决」**）

1. **对抗复核仍未修的 4 条射程边界**（t6 发现 9 条，t10 已收紧其中 F1/F3/F5/F6/F7）：
   ① `<script>`/`<style>` 整段被剥离 ⇒ **运行期 JS 渲染的文案不在射程内**（本仓产物里已有内联脚本写中文文案的先例）；
   ② **同义改写**照不到（语义等价不可判定）；③ **非 UTF-8 产物**（UTF-16LE+BOM）扫不到；
   ④ **keep 面没有牙** —— 没被登记的正文被改写/删除，判据不知道。「删掉不许回流」是一份**清单**，不是规则。
   逐条写在 `docs/DESIGN-RULES.md` §8.2 与报告 §9。
2. **6 类下限仍留 25% 余量**：只有 `.ddesc` / `.dsrc-note` 有可现算的关系式（余量收成 0）；
   `.fdesc` / `.chgnote` / `.hint` 等与某个可现算的量不成简单比例 ⇒ 阈值型下限的余量如实保留
   （t6 实测：`.hint` 14 处、`.ddesc` 20 处「静默消失」仍绿）。
3. **两条「更好的处置」没做**：`/feeds/` 133 字那条 A 形状（被结构下限钉住**不能删**，正确做法是**改写成
   面向读者的落点说明**，改写不改条数 ⇒ 不碰下限）· `.fdesc` 里 2 条 A 类形状（要删必须另开一轮并接受
   订阅者看到的 description 变化）。
4. **全量门禁没跑**：`npm run gate`（52 步）与 `verify-site --compare=ours-baseline` **本轮没跑**，
   只跑了单项与 `check:ci`（39/0）。发布链 / 线上冒烟同样没跑。
5. **一处文档漂移（本轮没动）**：`docs/BUILD.md` 正文里的 `--expect-checks=38` 是旧值
   （`verify.yml` 的 gate 调用行已是 **39**）；本轮只在 `docs/BUILD.md` 就地登记、未改口径
   （改它要连同 `verify.yml` 那行注释一起留痕）。

## 0.1 上一轮：`secondary-page-residue-v1` —— 二级页残留小字清除（2026-10-09 · **未提交 / 未发布**）

> **一句话**：三个别名页（`/need/student-only/`、`/need/free-api/`、`/need/dev-credits/`）顶上的
> `<p class="snote aliasnote">`（161 / 139 / 159 字）与题注里的长句（62 / 63 / 64 字）**整条删除**；
> 上一轮把那条说明当「导航更正 / USER_REQUIRED」保留，本轮实测推翻它（见下）。**机制一个字没改，
> 数据面 0 变化**，别名页与其它目录页从此同形。

### 上一轮为什么错（三条实测）

1. **不是导航更正**：那句话里没有「去目标页」这个动作的可见路径（链接的是页面标题）；
   读者真正用来导航的是面包屑与站内链接。三个别名页各有 **183 个站内入链来源**
   （排除三个别名页自身后仍是 183），全站**零入链路由 0**。
2. **是 B 类重复 + 站务机制**：题注里「共 N 条」与标题下的 `meta` 行重复；正文讲的是
   「保留旧地址可用」「不参与搜索收录」这类站务口径，并带着 `studentSignal` /
   `benefitType 含 free_api` 这类内部判据标识符。
3. **它从来没被门禁看过**：构建期那条扫描当时用 `class="snote"` **精确串**匹配，
   对 `<p class="snote aliasnote">` **一条都照不到** —— 「没被咬到」被误读成了「判过没问题」。

### 已完成（可复核）

1. **删除**：别名页 `main` 内 `.snote` **1 → 0**；题注 62/63/64 字 → **6 字**（`共 N 条。`）；
   `.aliasnote` 的模板 / CSS / `noteDeclare` / 白名单 `ALIAS_NOTE_ROUTES` 整块退役。
2. **折叠块仍然非空**（旧的「不许空容器」断言照旧盯着）：三个别名页的 `.pnote` 数
   **1→3 / 2→4 / 2→4**（自有 `userNotes` + 共享句 —— 「别名页不吃共享句」那个分叉一起退役）。
3. **三条会响的牙 + 一条反向断言**：构建期首屏扫描（判据升级为「目录页家族含别名页 0 条」）·
   `verify-site.js` §22c ③b（`introNoteRoutes.length === 0`，不再读别名表）· 构建期**题注形状牙**
   （条件式：题注存在就必须逐字匹配 `共 N 条。`/`共 N 个入口。`；< 20 条即红的反空洞守卫）·
   `selftest:audience` 反向断言（每条 `reason` 的逐字文本 × 186 个产物页 0 命中）。
4. **变异证明**（原始输出入库 `research/_raw/secondary-page-residue-v1/mutation/`）：
   R-1 注回 `.aliasnote` ⇒ 构建 exit 1（首屏扫描 + 说明清单对账）+ 浏览器层 **885 项失败 3 项**
   （③b 逐条点名三个别名页 + 两条 ⑨ 对账）；R-2 注回长题注 ⇒ 构建 exit 1（题注形状牙点名 66/67/68 字）。
5. **门禁读数**：`verify-site.js --dir=dist` **885 项 / 失败 0** · `validate --strict` ✅ ·
   `verify:seo` **19 / 0** · `selftest:audience` **206 / 0** · `selftest:changes` **120 / 0** ·
   `selftest:seo` **103 / 0** · `check:ci` **39 / 0** · `check:evidence` 无新增 Tier-3。
6. **正文下限**：删掉 197–217 字后余量仍 **619 / 1518 / 1949**（下限 1320 / 3300 / 4620）⇒
   不该重新登记；`verify:seo` 的余量登记 6 页读数与登记值**逐页相同**（一页未动）。

### 剩余事项（**都不是「已解决」**）

1. **换靶的覆盖面变化如实记**：`need/student-only/` 原本还兼 M1–M4 第一个壳与
   M6/M8/M10/M12/M14 的靶页；删除后该页 `.snote` 0 条 ⇒ 承重面消失。四壳改
   `plans/`（12 条说明，原靶页 1 条）/ `status/` / `changes/` / `feeds/`，M14 → `models/`，
   M15 → `feeds/`。**目录页家族从此没有任何变异壳** —— 该家族已无页面级说明可变异，
   而 M1–M4 守的是 `.snote` 的宽柱规则本身（价值随承重面迁移，没有静默）。
2. **T5（B 类残留）会动 `plans/`**：`plans-hub-page.js` 的半句删除属**元素保留、只删文本**，
   所以壳守卫（`noteCount > 0`）不受影响 —— 但换壳后的 12 条读数要在 T5 之后**复跑一次**确认。
3. **`/status/` 与 `/feeds/` 的 keep/undecided 项**（133 字那条、32 字那条、21 字那条、
   42 条 `共 N 条。` 题注等）由 B 的 census 判**保留**，本轮一个都没动。

## 0.2 上一轮：`secondary-page-layout-unification` —— 二级页布局统一（2026-10-06 · **未提交 / 未发布**）

> **一句话**：全站「页面级说明」（`.snote`）原本**同一条规则 8 份副本、两种取值**（4 个页面壳压成 `70ch` ≈ **452.81px**，另 4 个壳不压），
> 现在收成**唯一一处定义**（`index.html` 共享 `<style>`）；同时建立**机器可读的布局族声明**
> （`wide` **55** / `detail` **131** / `prose` **0**），并把 `/archive/<kind>/<id>/` 详情页接入统一内容列。
> **纯布局版本：数据 / 文案 / 路由 / 结构化数据 0 变化。**
> 完整报告：[research/secondary-page-layout-unification-report.md](research/secondary-page-layout-unification-report.md)。

### 已完成（可复核）

1. **产品侧 6 个文件 `+306 / −9`**：`page-kinds.js`（`LAYOUT_FAMILIES` + 18 个 kind 的 `layout`）· `index.html`（唯一一条 `.snote`，逐字冻结串）·
   `build-local.js`（删 8 条页面级副本 + 档案详情 `mainClass` 接线）· `archive.js`（`ARCHIVE_ENTRY_MAIN_CLASS` + 整页布局约束）·
   `archive-selftest.js` / `seo-selftest.js`（各加一组会响的断言）。
2. **产物侧修复量到底**：窄说明 **156 条 / 48 页 → 0 / 0**；说明宽 **452.81px → 1380px**（ratio **0.328 → 1.000**）；
   页面高度 **47 页变矮 / 12 页不变 / 0 页变高**（min **−224** / median **−122**）；1440/1600/390 三档横向溢出 **0 → 0**。
3. **数据 0 变化的机器证明**：**117/117** 非 HTML 逐字节相同 · **186/186** HTML 剥掉 `<style>` 后正文逐字节相同 · 样式块行集合差 **+9 / −2**。
4. **§19/§20 只读审计**：六类名重复度 + **37 条** `max-width` 普查 + **6 条**保留窄宽登记；同缺陷残留 **0 处**、未分类 **0**。
5. **规范补了一条长期规则**（[docs/DESIGN-RULES.md](docs/DESIGN-RULES.md) §6 的 **S4**）：数据型页面中的页面级说明不默认使用 65ch/70ch/80ch 阅读列；
   窄阅读列只用于真正的长文页面，并且必须居中。

### 剩余事项（**都不是「已解决」**）

1. **门禁读数 = 轮 6 冻结**：六轮门禁修复（t2 → t7 → t14 → t19 → t24 → t28）都只动 `scripts/tools/verify-site.js`；
   轮 6 冻结值（判据 sha `2cbc160dc64f8ade…`）= `--dir=dist` **852 项 / 0 失败** · `--dir=dist.baseline` **852 / 36** · 窄柱并集 **156 条 / 48 页** · CI **38/0** ·
   Full Gate **49 步 → 执行 45 / 通过 45 / 失败 0 / 跳过 4 · exit 0**（第 47 步 852 / 第 48 步 858）。
   注意**轮 5 与轮 6 的四个计数逐项相同**，区别只在判据 sha（`610b25a8…` → `2cbc160d…`）与豁免条件 —— 引用时带轮次 + sha。
2. **发布链已走完**：PR **#45** 已合并（`mergedAt 2026-10-06T17:19:39Z`，合并提交 `9251e83b68a7…`；分支提交 `8168251465a4…`）；
   CI `gate`：PR run **37501963346** → pass · 4m53s、master run **37502684190** → success；
   `Deploy to GitHub Pages` run **37502684227** → success（`prepublish`/`build`/`deploy` 全 success）；
   线上几何 smoke **8 页 / 79 项断言 / failed 0 / ok=true**（线上 `frozenCount=1` ⇒ 确为新产物）。
   取证环境提醒：本机 `github.com:443` 被定点阻断 ⇒ 推送与浏览器取线上页均经本地代理 `127.0.0.1:7890`；
   **首次直连 smoke 8/8 `ERR_CONNECTION_CLOSED` 是网络问题、不是站点问题**（走代理后 79/0 通过）。
3. **DEFERRED（不在本版承诺内，逐条有证据）**：绘制类遮盖 / 不可见性（`clip-path` / `mask-*` / 不透明覆盖层 / `color: transparent`）——
   本仓库没有构建路径产出它们（**252 个源文件 + 186 个产物全 0 处**）、完整修复不可行、像素断言会让 CI 因跨平台字体渲染变 flaky 红（那比漏判更糟）。
   （同条里原本还挂着 `writing-mode` 的覆盖不对称 —— 那一条已在 2026-10-08 由 `vertical-note-coverage-v1` 闭合，见第 3b 条。）
3b. **`writing-mode` 覆盖不对称 —— ✅ 已闭合（`vertical-note-coverage-v1`，2026-10-08）**：
   t31 的 `requiredFix` 走的是「**按 `writing-mode` 参数化归并轴**」那条路（不是形态禁令）：
   横排按**行**、竖排按**列**，判据量统一成「字迹在**水平轴**上铺到哪里 < 0.85 × min(主数据区宽, 页面列宽)」，
   前置条件统一成「排版单元数 ≥ 2」。**关键发现**：旧口径静默的机制不是那句「竖排显式不判」的豁免，
   而是**按行归并时竖排恒为 1 行**（18 个竖列共享同一垂直带）⇒ 前置条件永远不成立 ⇒ **删豁免也修不好**。
   **配对读数（同一批字节 · `.arch-v1/scratch-vertical`）**：改动前 **862 项 / 失败 1**（唯一那条是 @360 的 `note-clipped`）、
   改动后 **868 项 / 失败 4**（@1440 / @1600 / @760 新出 `note-ink-narrow` + @360 的 `note-clipped`）；
   另附轮 6 冻结版（sha `2cbc160d…`）同批字节 **852 / 失败 10**（其中逐条判据相关只有 @360 那一条，其余是旧版自己的靶页失效）。
   交付物原样 **`--dir=dist` 868 项 / 0 失败**，且产物**逐字节未变**（303 文件逐个 sha256 全等、全树摘要相同）。
   常驻牙 `§22c M15`（形态逐字注入 + 承重证明 + 不注入正对照 + 竖排适用范围三条反例：铺满 / 单列 / 横排不变）。
   规范新增 **N6**；报告 `research/vertical-note-coverage-v1-report.md`；自审 `research/vertical-note-coverage-v1-self-audit.md`；
   原始读数 `research/_raw/vertical-note-coverage-v1/`。**两处如实偏差**：① T31 的原靶页 `category/agent/`
   已**没有承重面**（上一轮把目录页首屏说明整层删除 ⇒ 形态注入后 `.snote` 0 条、门禁一条码都不出），
   靶页因此换成结构性成立的别名页 `need/free-api/`（那 1 条由 §22c ③b 断言「恰好 1 条」）；
   ② 本载体 @390 就已自裁切（20px），原载体要到 @360（19px）——载体文本长度的差别，不是口径差别。
   **原 DEFERRED 记录的关键读数（保留，别丢）**：轮 6 口径下 `writing-mode-vertical-fullwidth` 形态在 5 档
   （1440/1600/760/390/360）上 `note-narrow` 与 `note-ink-narrow` **全是 0**；唯一咬到它的是 `note-clipped`，
   且**只在 @360**（自身溢出 19px，`scrollWidth 347 > clientWidth 328`）；同页 **@390 盒 358 ≥ 347 就已 0 码**
   ⇒ 假绿路径 = 「落在 29 页样本集之外」或「竖条更短」。原始证据（含逐档读数表）
   `research/_raw/secondary-page-layout-unification/verify/T31-WRITING-MODE.md`；当时的裁定是「如实披露、直接发布，
   不开修复轮 7」，本条即为那个 `requiredFix` 的落地。
   **仍然开着的**：`sideways-rl`/`vertical-lr` 无真实样本（只有合成几何自检）；横排 `column-gap` 极小的细分未参数化；竖排轴上没做 0.85 vs 0.5 的 A/B 标定（只证了命中处远离阈值 + 铺满即放行）。
4. **P1（不阻塞）—— 两半的现状（`narrow-reading-columns-v1`，2026-10-08 更新）**：
   * ✅ **`.pdetailbody { max-width: 72ch }` 已按 S4 居中**（`margin-inline: auto`）：真浏览器 1440 实测
     盒 **465.75px** / 单元格内容盒 **1357px**、左 **445.63px** / 右 **445.63px**（差 0）、自身 466/466 不裁切；
     隔离牙（就地删掉居中规则）⇒ 左 0.5 / 右 890.75 而**盒宽一字不变**（465.75 → 465.75）⇒ 判据量的是「居中」本身。
     选「居中」而不是「放宽」的理由：S4 写着窄阅读列**必须**居中；放宽会让引文行宽升到 1300px 级。
   * ✅ **保留窄宽已有机器可读清单**：`scripts/data/narrow-reading-columns.json`（1 条登记）+
     判据 `narrow-unregistered`（产物里**任何 ch 窄列**未登记即红；普查实测全站只有这 1 处）+
     §19「登记条目必须居中、且真的比容器窄」的几何断言。作用域显式排除 `min-width` 与 px/rem
     （`.detail-main` 的 `min(1120px,100%)` 由 §22b 原有断言承担）。产物变化面：**1 个文件**（`plans/coding/index.html`）。
   * ✅ **「判据只认 `.snote` 类名（换名 / 换容器即隐形）」已闭合可闭合的那一半**（`notes-manifest-v1`，2026-10-08）：
     构建期**意图清单**（`dist/_notes.ndjson`，186 页 × 3 槽位；**323 条**登记说明）+ 构建期自检 +
     `verify-site.js` §22c ⑨ 在**真浏览器 DOM** 回读**同一把尺子**，两侧按 `route × 槽位 × 签名` 逐条相等，
     不等即红并点名 `route#index`（两侧读数都给）。**登记与输出是同一次调用**（`noteDeclare()` 返回它收到的 HTML）
     ⇒ 登记不出来的说明也输出不出去。读数：**880 项 / 0 失败**（master `4b366d2` 为 874 ⇒ **+6**）；
     产物变化面**只多出 `_notes.ndjson`**（其余 303 个文件逐文件 sha256 不变）；牙三颗实跑（只改模板类名 ⇒
     构建 exit 1 点名 `need/dev-credits/#2`；改错清单条数 ⇒ 点名 `status/#0`；只改产物副本类名 ⇒ §22c exit 1 点名 `status/#0`）。
     合并 `8c9fb29d93c3100e43795d139173c53cd354a767`（PR #63，PR 门禁 run 37761567634 success）。
     **残余（已排进 `notes-manifest-residual-v1`）**：`/models/*`（52 页）· `/plans/*`（3 页）· `/docs/data/` · `/archive/` ·
     `/changes/` 这 **58 页 / 257 条** `.snote` 的构造点仍在 7 个模块里（`lib/models-page.js` / `plans-page.js` /
     `api-plans-page.js` / `plans-hub-page.js` / `data-docs.js` / `archive.js` / `index.html` 的 RENDER-CORE 区块），
     本轮对它们只有**台账 + 下限 + 棘轮**（整族被删/改名 ⇒ 红），**单条改名还咬不住**；下一轮是机械改动
     （注入 `ctx.note`，与 `lib/vendor-page.js` 同形），报告 §5 有逐文件清单。
     **清单文件名口径（captain 决定）**：落成 `dist/_notes.ndjson` 而**不是** `_notes.json` —— 产物里每个 `*.json` 都必须被某个
     注册表认领，塞进 `PUBLIC_DATASETS` 会让它变成公开数据集（进 `/docs/data/` 索引）= 产品面变化；将来若真要 `.json`，
     只需删一行常量 + 在 `INTERNAL_ARTIFACTS` 加一条（报告 §7 有原文）。证据：`research/notes-manifest-v1-report.md` ·
     `…-self-audit.md` · `research/_raw/notes-manifest-v1/`（4 份小 JSON）。
   报告 `research/narrow-reading-columns-v1-report.md`；自审 `…-self-audit.md`；原始读数 `research/_raw/narrow-reading-columns-v1/`。
4b. **环境教训（本轮实测，写给下一轮）**：隔离工作树里用 **junction** 指 `node_modules` 时，
   跑 Full Gate 的第 1 步 `npm ci` 会把 junction 换成**实体目录**、并把 junction 的**原目标（主工作区的 `node_modules`）
   清空成 0 个目录**（表现：主工作区 `Cannot find module 'playwright-core'`）。处置：在主工作区重跑 `npm ci` 复原
   （本轮已做）。要么别用 junction，要么跑 Full Gate 时用 `--from=` 跳过第 1 步。
   **2026-10-08 复核（captain 扫了全部 14 个工作树）**：本会话团队的 4 个工作树（`notes-manifest-v1` /
   `p2-residuals-v1` / `criteria-adversary-v1` / `sources-residue-v1`）的 `node_modules` **都不是重解析点**
   （各自真跑 `npm ci`）✅；**仍挂着 junction 的是上一轮遗留的两处** ——
   `secondary-page-content-simplification` 与 `secondary-page-layout-unification`。
   谁在那两个工作树里跑 Full Gate 的第 1 步，都会再次清空**主工作区**的依赖。
4c. **「最近变化」非空分支的生产样本 —— 已证「当前数据面下结构上不可达」（2026-10-08 复核）**：
   线上 **186 页**（sitemap 183 + 3 条 noindex 别名）逐页抓取：条件模块 `class="chgsec chgtopic"` **0 页**、
   `data-topic-total` **0 页**、条件模块的 `<h2>最近变化</h2>` **0 页**（对照组：任意 `chgsec` 只有 `/changes/` 1 页；
   `#plan-changes` / `#api-changes` 是**无条件**块，不算）。原因不是「数据恰好为空」，而是**交集结构上必为空**：
   `landing.js:283` 的页面条目池**只收 `type === 'deal'`**，而 `deal-history.json` 的 **19 条事件全部挂在
   `fields.type = "tool"` 的记录上**（该文件 80 deal / 73 tool；19 条事件全是 `created`）；且 `build-local.js:3186`
   对 hub / alias 页直接给 `topic = null`。另：「即将结束」也必然为 0 —— **129 条 deal 记录里 0 条写了 `expiresAt`**。
   **captain 独立复核**：① 自写脚本**剥掉 `<script>` 后**扫 186 个产物：真渲染实例 **0**、`data-topic-total` **0**
   （其余 `.chgtopic` 命中全是共享 CSS 类与 `dist/index.html:4085` 的**模板源码字符串** —— 这正是装置要防的坑）；
   ② 手工核对事件 `4a4f4777ffbc` / `69a0d047e3f9` / `8f479fcbe8f9` 的 `fields.type` 均为 `tool`，且**我自己 grep 出的事件
   日期分布（10-04×1 / 10-06×2 / 10-07×1 / 10-08×15）与审计 JSON 的 `byAt` 逐项相同**。
   **这不是缺陷**（H14 的条件模块本就该在有事件时才有内容），但必须留一条**可证伪的翻转信号**：复跑
   `pagesWithConditionalModule` **从 0 变 ≥ 1**（触发面：deal 型 `created` / 高价值字段变化 / `ended` / `restored`，
   或首次出现带 `expiresAt` 且 ≤7 天的 deal）。证据：`research/_raw/narrow-reading-columns-v1/change-module-production-audit.json`
   （PR **#61**，合并 `e455b3a69428f11d67189e304d4cc676610838b5`）。
5. **故意不做**：`.ph2` / `.plist` / `.stop` / `.cstop` / `.ptable*` 仍是多个页面壳各自复制一份 —— 理由是不扩大回归面（详见报告 §19.5）。
6. **P2 残留（三条）—— ✅ 已收口（`p2-residuals-v1`，2026-10-08）**：
   ① **文本下限余量**：`/need/no-card/` 实测 **710 字 / 下限 660 / 余量 50**（全站最薄，次薄 123）。
   **下限公式一个字未改**；处置是新增**余量登记**（6 页，`scripts/lib/seo.js` 的 `TEXT_FLOOR_RESIDUALS`
   + JSON 转写 `research/_raw/p2-residuals-v1/text-floor-margins.json`）与检查码 **`thin-content-margin`**
   （27 → 28，跌破登记值即红，比 `thin-content` 至多早 50 个字；沙箱砍 8 个字实跑点名变红）。
   ② **不可用日志的处置**：**渲染口径**与 **H14** 一致（真函数三层实跑：不可用 ⇒ 0 字节、零变化 ⇒ 0 字节、
   正对照 478 字节；判据出处 `selftest:changes` 的 R2 / R2b / R2c / R2d，另补产物级独立复查 `verify:seo` §③″）；
   **但构建链上仍有一处残留**：日志缺失或损坏时构建在 **Dataset Manifest** 步就失败（`dataset deal-history: 缺少 updatedAt`），
   「产物自检」与 SEO 门禁都没跑到 ⇒ 已写好的诚实性措辞**到不了读者眼前**（报告 §2.2′ 与 §7-1；
   独立复核 PR #69 §4 观察 1 —— 本行原文曾写成「无需修复」，那是把「未决」写成「已决」，已按复核意见改正）。
   待裁定二选一：(a) 让它上线（`updatedAt` 回落到数据基准日 / 显式 unavailable 状态）；(b) 把 fail-closed 写成策略并说明该分支何时才会到读者眼前。
   ③ **入口文案**：全站 186 页里入口锚 **4 个 / 3 页**（`/` `/plans/`×2 `/plans/coding/`）逐字
   「全部变化 →」，「查看全部」**0 处**（产物与 7 个渲染源文件都扫过）；**如实偏差**：
   `plans-hub-page.js:251` 是硬编码字面量（已登记，补丁待下一轮）。
   交付读数：`verify:seo` **11 → 17 项 / 0 失败**、`selftest:seo` **69 → 87 项 / 0 失败**、
   `verify` **874 / 0**、`check:ci` **39 / 0**、产物 **303/303 逐字节未变**。合并 `33d2472258702d1628bf6c4e46c18465e183dc65`（PR #62）。
   **补丁去向（captain 注）**：②的那一半与 ③ 已排进 `p2-honesty-single-source-v1`（日志不可用时构建在
   Dataset Manifest 步就失败 ⇒ 诚实性措辞永远上不了线；入口文案收回措辞键）；`check-ci-consistency.js:191`
   注释里的「27 个检查码」已在本轮收口为 28（纯注释，不影响 `check:ci`）。
7. **流程教训（2026-10-08 实测，写给下一轮）**：**「本地跑过的判据清单」≠「门禁全链」**。
   `p2-honesty-single-source-v1`（t7）报「完成」时，其 PR #72 的 CI 门禁其实是**红**的：失败在第 5 步全链，
   唯一一条是 **v2.1 演练的架构边界** —— `✗ deals 链路（采集 / 合并 / 历史 / 优惠雷达 / 落地页 / SEO）完全不引用 plans ——
   scripts/lib/changes.js 提到了 plan-history`（为「日志不可用时如实登记」往 `changes.js` 加了约 158 行，把 plan-history 引了进来）。
   处置：修复走 **t20**（在 PR #72 上追加提交），并把判据说清楚 —— **verdict=completed 意味着「可合并」**，
   红门禁的交付**不算完成**；交付时必须逐条说明**本地跑不到的步骤**，不许拿「我本地绿」当依据。
   同源教训：CI 的并发组若不按 SHA 隔离，**合并提交本身可能永远没有结论**（完整口径见 `docs/DESIGN-RULES.md` 的 **N9**）。
8. **判据分两轮加固（`judge-hardening-v1a` / `v1b`）—— 进行中，尚未闭合**：t5 的对抗验证（PR #64）在**出货判据**上打出 **9 条破防**（注释伪造 / 扫描面缺口 / §19 只量 `entries[0]` 且幽灵条目不报 / 竖排单列 + 裁切整页零码 …）。修复按文件面拆开：**v1a** = `scripts/tools/verify-site.js`（另折进「生效宽 ≈ 声明 ch ±20%」与「§22c 竖直裁切量」），**v1b** = `scripts/lib/seo.js` + `seo-verify.js`。**再攻击 t11** 用同一套 37 形态判定「闭合 / 回归 / 新破防」——**在 t11 给出结论前，不要把这两轮判据写成「已加固」。**
   **2026-10-08 更新**：t11 终审已出（第 15 条）—— 原 **9 条 9/9 闭合**、守住面 15/15 无回归，但打出 **2 条新破防 + 2 条新发现**，
   其收口是 `judge-hardening-v1c`（t33，进行中）。**所以本条仍算「未闭合」**，只是口径精确到「原 9 条已闭合、新增四条待收口」。
9. **未覆盖边界已量化，两条已折进加固（`judge-coverage-gaps-v1`，PR #80，已合并）**：760/360 档名义覆盖 29 页，而其中**只有 13 页真有说明** ⇒ **50 个有说明的页从没在 760/360 量过**；补一档 950 的成本不在常量上 —— 要连带改 `verify-site.js:7549–7557` 的汇总表与 M10 靶位。**新增一条真实零码缺陷**（后代撑满宽 + 多行 + 外层定高裁切 ⇒ 列 1、`textWidth 1380 ≥ 阈值 1173`、**竖直被裁 53px ≈ 37% 行高**）—— 比 t5 登记的更狠。已折进 v1a 的两条：**「生效宽 ≈ 声明 ch ±20%」**（假阳性实测 **0**：全站唯一 ch 声明 465.75px = **恰好 72ch**）与**「§22c 补竖直裁切量」**（必须带 `overflow ∈ {hidden,clip,auto,scroll}` 或 `height ≠ auto` 前置，且**先量全站误报面**）。档位扩容与 950 档排在 `judge-coverage-closure-v1`（t22）。
   **2026-10-08 订正（`mid-viewport-tooth-v1`，t30，PR #95 已合并）**：950 档**确实有牙** —— 注入只在该区间生效的形态
   ⇒ `verify-site --dir=dist` **883 项 / 1 失败**，唯一红的就是 `§22c @950` 那条（`archive/#0` 内容盒 **452px** vs 门槛 `0.85×910 = 773.5px`），
   而 `@1440/@1600/@390/@760/@360` 五条断言的 `name::detail` 与基线**逐字相等**（`==` 比较）⇒ 对这条形态它是**唯一防线**，不是分辨率冗余。
   **但不许写成「盲区已闭合」**：正确表述是「**点采样**：盲区从『761–1439 无采样』缩小为『**950px 这一个点**被采样』」——
   因为 (a) 原先我给的 `(min-width:761px) and (max-width:940px)` 形态**四档全绿**（`950 ∉ [761,940]`），
   (b) 产物里那条 761–940 媒体块管的是**顶栏**（`.topin/.search/.topstat` 4 条声明），950 下并不生效；
   950 真正新激活的只有 `@media (max-width:1180px)`（首页 `.grid` 3 列 → 2 列）。`[941,949]` / `[951,1439]` 目前只是**端点推理**，
   960 / 1024 / 1200 未测（报告 §9 共 7 条未证明）。
10. **流程教训（同日新增，两条）**：① **captain 给的 verify 命令必须可执行** —— 成员按字面执行 `node scripts/tree-digest.cjs dist`，而该脚本**从来不在仓库里**（历轮都是 `.arch-v1` 的 gitignore scratch）；它的处置（临时放进该路径跑通 → 立刻删除 → 确认 `scripts/` 无残留）是对的，**根上修**走 `tree-digest-tooling-v1`（t25：正式放进 `scripts/tools/`，让「产物逐字节未变」这类证明**可由仓库内工具独立复现**）。② **`…/runs/<id>/jobs` 只给 workflow 级步骤** —— 复合 action 的内部步骤**只在日志里**（`gh run view <id> --log` + grep）；要证「某个门禁步骤在远端真跑过」必须用日志。
11. **发布链收尾复核（`post-merge-deploy-v1`，PR #83，已合并）**：今天 20+ 个合并之后，线上与本地 **14/14 逐字节相同**（含新产物 `/_notes.ndjson` 104,591 B / 187 行全合法 JSON），干净构建 **304 文件**（旧 303 + `_notes.ndjson`）、两次构建逐字节一致；`x-cache` 全部 **MISS + `age=0`** ⇒ 读到的是**源站现取**。**口径**：本轮证明的是「**被复核提交的那次部署 == 它的本地构建**」，**不是**「当前头的部署已就位」；七条「没证明的东西」在报告 §5（14 条 ≠ 全站 · 单边缘单时刻 · 单出口 · 时序 · 内容正确性不在射程 · `_notes.ndjson` 的**语义**对账不在射程 · 两次构建一致 ≠ 跨环境一致）。

12. **出货判据加固 v1a 已落地（`judge-hardening-v1a`，PR #89，已合并）**：`scripts/tools/verify-site.js` 侧的破防收口 ——
   注释伪造面（sitemap XML 注释剥除 ×2：§18 成员资格 + vendorIndex；冻结串计数前剥 CSS 注释）、登记表扫描面（逗号多选择器**逐段**都要有登记 /
   `70CH` / `MAX-WIDTH:` 大小写 / `!important` 归一 + `routes`）、§19 **逐条**几何（本条 + 自裁切 + 生效宽 ±20%）+ 幽灵条目报红 + `entries: []` 显式声明、
   §22c `note-clipped` **竖直分支**（带 `overflow-y ∈ {hidden,clip,auto,scroll}` 或定高的**前置条件**）、`sharedFooterExternalHrefs` 改读 `--dir=`。
   读数：`verify-site --dir=dist` **880 → 881 项 / 0 失败**（+1；阈值一处未改、`git diff` 无 `WIDE_NOTE_RATIO`/`WIDE_TOL` 改动行、产物逐字节未动，全树 `67d1d0bd…`）；
   `check:ci` 39/0；四条设计规则已收进 `docs/DESIGN-RULES.md` 的 **N10–N13**。残留**已查实**：R9 的旧「假红 4」是**注入污染**
   （改写已登记规则内部 ⇒ 把 §19 隔离牙的锚点改掉，报「锚点 0 次」），V3 的旧「残留红」红在 **M15 变异靶页**上 —— 两条都给干净形态读数并写进 `attack-matrix.json` 的 `injectionNote`。
   **未闭合的另一半**：`lib/seo.js` + `seo-verify.js` 侧（t10）。**在 t11 再攻击给出结论前，不要把这两轮判据整体写成「已加固」。**
13. **流程教训（同日第三批，`tree-digest-tooling-v1` 报告 §5「同类契约错」= 6 行 + 4 条）**：
   ① **captain 契约里点名的源件路径也可能是错的** —— 交接写的 `.arch-v1/tree-digest.cjs` **已不在盘上**，该工具在盘上有 **8 份 / 3 个不同版本**；
   正确做法是**按「哪一份能复现已登记的读数」选参照物**，并把「多版本漂移」本身记成风险（根上修 = 收进 `scripts/tools/tree-digest.cjs` + `npm run report:digest`，
   与 scratch 版在同一棵 dist 上 `--out` JSON **逐字节相同**、304 条 perFile 逐条 diff=0）。
   ② **契约正文与交接消息路径不一致时按正文落位**，并让写错的字面路径**响亮失败**（`scripts/tree-digest.cjs` ⇒ exit 1；`dist.nope` ⇒ exit 2，绝不静默成功）。
   ③ **证据文件与声明面的关系要写明**：`changedPaths` 只列声明面 4 条，提交实含 8 文件，另 4 条是 `research/**` 的 Tier-1 证据（报告 §9 已声明）——
   「交付 = 报告 + 自审 + Tier-1 证据」这条约定值得在收口时补成通用条款。
   ④ **成员会话的单次输入上限（512k）是真会到顶的**：三个长会话先后以 `CONTEXT_WINDOW_EXCEEDED` 中断（需重算 620k–700k），
   处置 = **换新成员 + 转交**（工作树 / 分支 / 还差哪几步）并**先抢救产物再看任务状态**（t24 的 PR 崩前已开且门禁 pass）；手册见 `.arch-v1/RESUME-AFTER-OUTAGE.md` §7。
14. **新发现的真缺陷已排期（`unavailable-dataset-build-crash-v1`，t29）**：`plan-history.json` / `api-plan-history.json` **不可用**（缺失或非法 JSON）时，
   构建死在 `scripts/tools/build-local.js:4216 / :4220` 的 **null 解引用** ⇒ 这两份数据集的「如实说没有拿到…日志」**上不了产物**，
   t4/t7 与 v1a（PR #89）关于「日志不可用而页面照常出页」的结论**只对 deal-history 成立**。
   deal-history 侧已由 `unavailable-note-machine-independence-v1`（t27，PR #91）修好，并**顺带闭合 t19 的观察 O1**：那份不可用说明原先把**宿主绝对路径**
   （`D:\…\scripts\data\deal-history.json`）印进了公开数据出口 `dist/data/index.json:45` ⇒ 现在只写 basename，并新增机器无关性判据（盘符 / UNC / 反斜杠目录段 /
   POSIX 绝对路径 / `~`）挂在**构建期**与 `verify:seo` 两侧；读数：机器相关串 **1/4/1 → 全 0**、「没有拿到」**11 → 11**（渲染侧 6 处同址）、
   正常路径 **304 文件 0 变化**、`updatedAt` 仍等于日志 `startedAt`（不是「今天」）。同时查实、不入修：`archive.js:524` 的同类文案**不嵌路径**（label 来自常量表）。
   排期纪律：t14（说明登记残留）与 t29 共用 `build-local.js` ⇒ 用**依赖串行**，不并行改同一个文件。
15. **再攻击终审（`criteria-adversary-v1-reattack`，t11，PR #98，已合并）**：对 t9 + t10 的整合树（本地 merge `d12005e`）做
   **24 次门禁实跑 + 15 条新形态 + 6 个登记表沙箱** ⇒ 原 **9 条破防 9/9 闭合**（F1/F2/F3 与「真删对照」的失败项**逐个同名** ⇒ 同解）、
   守住面 **15/15 无回归**、§7 最省绕过前 3 名**全闭合**（`70CH`/`MAX-WIDTH:` · 逗号多选择器 · `width:300px` 被「生效宽 ÷ 现场换算值 = 0.644」钉住）、
   假红 R9 已修且没放宽。**同时打出 2 条新破防 + 2 条新发现**（都在 `verify-site.js` 一面）：
   **N14 裁切祖先**（8px 父盒 + `overflow:hidden` 包住说明 ⇒ **零码**，探针证说明自身不裁）·
   **N8/N9 假 `@media not all` / 假 `@supports`**（冻结串判据**自己沉默**，文本计数仍为 1，红全靠变异电池连带）·
   **N15 sitemap 未闭合注释**（`verify-site` 说「有」而 `verify:seo` 才红 ⇒ **两条判据不一致**，一行修法可闭合）·
   **N19 `<noscript><style>`** 里的 ch 窄列零码（低危盲区）。四条收口排进 `judge-hardening-v1c`（t33，**以 t32 为前置依赖**，同一个文件串行）。
   **口径提醒**：这四条闭合前，v1a / v1b 只能写成「**原 9 条已闭合**」，不许写成「判据已全面加固」。
   方法读数（采纳）：「判据沉默」必须先证「**形态生效**」（t11 有两条形态第一版根本无效）；判据点名列表被 `slice(0,4)` 截断 ⇒ 要完整清单得用判据副本放大上限。
16. **说明登记台账清零（`notes-manifest-residual-v1`，t14，PR #94，已合并）**：186 页全部 `complete` —— `.snote` **声明 271 == 产物 271**
   （改前只有 14/271 由断言保证，其余 258 条靠台账）、`.pnote` 159/159、`.vsnote` 150/150、逐条 **580**、**台账 58 页 / 8 族 → 0 页 / 0 族**（pin 1 → 0）。
   三颗牙：两个**不同模块**的单条类名改名 ⇒ 构建 exit 1 点名（`archive/#0`、`models/#1`+`models/#0`）；产物副本改名 ⇒ `§22c ⑨`（真 DOM）exit 1 点名；
   逐字节还原后 `881/0`。产物变化面只有 `_notes.ndjson`（104,591 → **131,051 B**）与 `index.html`（**+831 B** = 首页内联的 RENDER-CORE 模板源码；
   **去掉 `<script>` 后 DOM 逐字节相同**，`/changes/` 零字节变化）。**未验证**：`archive-detail` 生产 **0 实例** ⇒ 该登记路径从未实跑；
   t3 记的 257 与本轮实测 258 **差 1 未归因**；继承来的 7 个 `research/_raw/*.js` 转换器按第 18 条处理。
17. **950 档的牙（`mid-viewport-tooth-v1`，t30，PR #95，已合并）**：见第 9 条的订正段 —— 结论「**有牙**且是**唯一防线**」，
   表述必须是「**点采样**」而不是「盲区闭合」。读数：变异 `883 项 / 1 失败`，还原后全树 sha256 `67d1d0bd…337d → aa41a94a… → 67d1d0bd…337d`（`restore.cjs` 是注入的**逐字节逆运算**，不是拷贝备份），
   断言 **883 → 883**（未增未减）、阈值未改、`git diff origin/master -- scripts dist docs NEXT-STEPS.md package.json` 为空。
18. **证据政策补一条（captain 裁定，2026-10-08）**：`research/_raw/**/*.js` 与 `*.cjs` **允许保留**（归「小而可复跑的探针 / 转换器」类），
   条件是：每个文件在 README 或报告里有**一行用途说明**、且**被报告引用**（不许孤儿）；**大块原始转储仍必须放 `.arch-v1/`**（gitignore，Tier-3）。
   本轮 t14 保留了继承来的 7 个转换器（报告 §7.4 点名），按此条处理，不要求删除。
19. **改价已落地并线上复核（`anthropic-cached-price-landing-v1`，t28，PR #97，已合并 `2253be8`）**：Sonnet 5.5 `rates.cachedInput`
   0.2 → **0.1**；新增 `.change` 形态的官方变更记录引文（逐字整句，`capturedAt` 2026-10-08）；旧 $0.20 docs 引文**逐字留档为历史**
   （`research/_raw/anthropic-cached-price-landing-v1/old-docs-quote.md`）；日志追加 1 条 `price_decreased`（`at` = 2026-10-08，官方生效日 2026-10-07 写在 note）。
   **五颗牙**（T1 值 0.15 ⇒ validate 红 · T2 引文只剩一个数 ⇒ 红 · T3 摘掉 `.change` ⇒ B2 红 · T4 值改回 0.20 而日志不动 ⇒ `check:api-plan-history` 红 ·
   T5 删引文而关系层仍引用 ⇒ `check:model-registry-links` 红）都是**红 → 逐字节还原 → 绿**。上限改的是**可选** `opts.max`（缺省 3，只有 `api-plan-schema` 传 4）。
   改动面收敛：308 行费率**只有 sonnet 一行**变、24 条记录只有 anthropic 变、抽样 deepseek/zhipu/openai 逐字节相同。
   **captain 线上独立复核（不经成员脚本，2026-10-08 深夜）**：`/feed/plans/api/changes.json` 首条 =
   「**Anthropic · Claude API 按量计费 — 降价**」（含 2026-10-08）；`/plans/api/` 线上正文里 Sonnet 5.5 行读数为
   `USD / 每 100 万 tokens $2 $10 $0.1 缓存写入（短）$2.5 缓存写入（长）$4 缓存读取价按官方变更记录修正：官方 2026-10…`，
   页面同时含 `rather than` / `50% less` / `2026-10-07` ⇒ **新价 + 官方引文 + 官方生效日都在线上**，写入档未被顺手改动。
20. **两份日志「缺失」不再崩（`unavailable-dataset-build-crash-v1`，t29，PR #100，已合并）**：根因 = manifest 的两条数据集读了
   「不可用 ⇒ null」的便利变量（总是可用的如实空账本在 `…Load.store`）⇒ 修在根因处（不是下游 try/catch），并新增产物自检
   `checkPublishedLog()`（不可用 ⇒ 产物**必须就是如实空账本**：`startedAt: null` / 0 事件）。读数：**缺失三形态 exit 0**（修前全是 TypeError），
   逐字措辞命中 **6 / 6 / 9** 文件、Manifest `unavailable + updatedAt: null`；**损坏三形态只量不修** —— deal `0` / plan `0` / **api `1`**
   （阻断点 `validate.js:688–690`，**不对称**，两个选项在报告 §7）；三颗牙红 → 逐字节还原 → 绿；断言账 73/264/145/119/19/**883** 不降；
   正常形态 **304 文件 changed 0**（全树 `f964d6ba19…` 修复前后同串）。**已裁（2026-10-09，用户裁定）：保持现状 fail-closed** ——
   `api-plan-history.json` **损坏**时仍然由 `validate.js:688–690` 响亮报错、构建停住；**不**把它降级成「与缺失同处置」。
   理由：**缺失**是「上游这次没产出」（如实说没有拿到是对的），**损坏**是「我们自己的数据坏了」（把它说成「没拿到日志」等于用诚实措辞掩盖数据损坏）——
   两种不可用形态必须分开，`docs/DESIGN-RULES.md` **N18** 已把这条钉住。**残留（如实登记，未做）**：目前没有一条断言把「损坏 ⇒ 红」钉住
   （若日后有人把 `validate.js` 改成 warn，不会有判据变红）⇒ 下一轮可补一条带损坏夹具的自测；本条不改代码。
21. **feed 窗口判据修好（`feed-guid-window-judge-fix-v1`，t32，PR #101，已合并）**：`verify-site.js` 那条「feed 条数 == 日志**全部**事件数」
   把巧合当不变量（master 的 `17/17` 只是全部事件恰在窗口内）；订阅源真实口径是**窗口**（created/changed 7 天 · ended/restored **30 天** ·
   `asOf = api-plans.json.updatedAt` 前 10 位 · `type==='updated'` 元信息不进 feed）。改法：期望集 = 日志中落在窗口内的事件，
   **验证侧独立重算**（不 require `plan-changes.js`，否则等于用产品证明产品），既有三颗牙全保留 + **新增两颗**（窗口内每条都必须进 feed ·
   镜像常量 ↔ 产品声明漂移即红）。读数：A0 原始+master `883/0` → A1 **885/0**；B0 原始+t28 真产物 `883/1`（t28 撞到的红原样复现）→ B1 **885/0**；
   **C2「删窗口内 + 换进窗口外、条数仍 12」⇒ 唯一红是新牙**（老断言做不到）；断言 **883 → 885（只增）**。边界：改**窗口定义本身**哨兵抓不到（已登记）。
22. **契约摩擦四条（本轮累计，写给下一轮）**：① 交付带 `research/` 三件套但 inScope 只列脚本路径 ⇒ 完成时被判「未声明」；
   ② 上游补记随下游 PR 进（cherry-pick）时，被带入的研究文件也要在 inScope 里；③ captain 交接里点名的**源头路径可能是错的**（工具在盘上有 8 份 / 3 版）；
   ④ **scope 匹配器只认「精确相等」或「前缀 + 尾斜杠」** —— 裸目录（如 `scripts/data`）**不生效**，且**只有该目录下的文件被卡**（同级文件与别的路径都过），
   症状像「随机点名一个文件」。处置：新任务的 inScope 一律把研究三件套写全、目录一律写成**带尾斜杠**形式；发现同类卡点时先按这四条自查，不要先怀疑自己的交付。
23. **t33 / t34 收口 —— 判据加固链条闭合（PR #103 / #104，均已合并）**：t11 的 **2 条新破防 + 2 条新发现**全部收口
   （裁切祖先 · 声明≠生效 · 两判据同解 · `<noscript><style>` 扫描面），并在 t31 的对照上追加收口「**正对照不得静默降级**」
   （默认判红 + 显式 `--allow-control-exemption` + 登记制对账 + M15 靶页前提显式化）。读数：干净产物 **885 → 887 → 890 / 0 失败**
   （+5 条新命名检查，**旧断言一条未删、未改松**）；t33 的 **24 副本回归：不变 11 · 预期内 13 · 回归 0**（**没有任何原本会红的判据变绿**）；
   t34 的 7 用例总账（`890/0` · `890/6` · `890/5` · `890/3` · `890/0`）在报告 §5。四条新规则写进 `docs/DESIGN-RULES.md` 的 **N14–N17**。
   **口径**：v1a / v1b / v1c 至此可合写成「**t5 的 9 条破防 + t11 的 4 条新发现全部闭合**」；
   但两侧各有 7–9 条**如实登记的未覆盖面**（`clip-path`/`mask` 与负 margin 裁切 · 祖先 `overflow:auto` · 冻结串只对账 4 个属性 ·
   M10 的 1500px 边界未扫 · 只测 Windows + msedge · 四条收口未内置成 M 系列变异牙 · 豁免计数没被门禁层断言守着 ·
   N15 的 seo 侧不在本轮）⇒ **不许写成「判据已完备」**。
   ⚠️ **历史复跑配方**：今后把 `--dir=` 指向「形态注入副本」的复跑命令要补 `--allow-control-exemption`，否则那一轮会多一条红；
   历史报告**未回改**（不在各自 inScope），此处登记。
24. **本轮全部任务闭合（2026-10-09，t1–t34）**：t1–t34 全部 terminal；开放 PR = 0；master 头 = `6100bee1`（gate + Deploy 均 success）。
   本轮收口的三件用户可见事：**改价上线**（Sonnet 5.5 缓存读 $0.10，含官方引文与官方生效日）· **两份日志「缺失」不再崩** ·
   **判据链条闭合**（t5 的 9 条 + t11 的 4 条）。**唯一政策项已裁**：损坏 ⇒ **fail-closed**（见第 20 条与 `DESIGN-RULES` **N18**）；
   **残留**：「损坏 ⇒ 红」目前**没有**断言钉住（若日后有人把 `validate.js` 改成 warn，不会有判据变红）——见 N18 与第 20 条，留待下一轮。

---

## A. 本轮之后仍然存在的风险与长期方向（**不是「已失效」，也不是「已完成」**）

> 以下四条都是**如实登记的残留**：它们各自有明确理由，**当前不修**；写进这里是为了不让人误以为已经解决。

1. **anthropic 官方定价页已迁移（来源新鲜度）**：`docs.anthropic.com/en/docs/about-claude/pricing` 现在
   301 → `platform.claude.com/docs/en/docs/about-claude/pricing` → 307 路径归一 → 307
   `www.anthropic.com/app-unavailable-in-region?utm_source=country` → 301 → `claude.com/app-unavailable-in-region`（200，**区域封锁页**；
   2026-10-08 从 HKG 出口实测，与旧登记的「营销首页」终点**不同** —— 换了出口 IP 才能分辨谁对）。
   记录里的 `officialUrl` 仍是旧地址 ⇒ 用户点到的「官方定价页」当前不是定价页。
   **候选**：`https://claude.com/pricing`（API tab 有逐模型 Input/Output/缓存价；数据层要求写规范 URL，带 `#api` 会被重建拒绝）。
   但它是官方详细定价页（`platform.claude.com/docs/en/about-claude/pricing`，本网络区域封锁）的**摘要版**：
   4 个模型的 1h 缓存写入档不载，且 Sonnet 5.5 缓存命中价与记录不一致（记录 0.20 vs 页面 $0.10，**原因未证实，不得写成「价格已变化」**；
   同页 legacy `Sonnet 5` 恰是 0.20 ⇒ 也可能是记录取错行）。**16 个可比价格格：15 一致 / 1 不一致。**
   **【2026-10-08 已定案，推翻上面的「原因未证实」—— 见本条第 3）段】**
   **处置裁定（2026-10-08，captain）：本轮不改** —— 可达页是摘要版且有一格无法定案；且**实测影响面**：改 `officialUrl` 会产生
   1 处字段 diff + **1 条公开变化事件**（`updated officialUrl`，进 `/changes/` 与订阅源）⇒ 不能当成纯后台修正来做。
   处置边界不变：只允许改 URL 与 `officialDomains` 登记（域登记无需改，`providers.json` 已含 `claude.com`），
   **不许改任何价格、不许改既有引文及其 capturedAt/sourceUrl**；**不得写成「价格已变化」**（无证据）。
   **3）【2026-10-08 定案并落地（`anthropic-cached-price-v1`，PR #87 已合并）】** 那一格定案为 **②「页面确实改价」**（不是取错行），
   依据是**官方变更记录**：官方 Haiku 5.5 发布稿（页面自印日期 **2026-10-07**）逐字写
   “First, **starting today**, we're lowering the price of cache reads on Claude Sonnet 5.5. **Cache reads now cost 50% less:
   $0.10 per million tokens rather than $0.20.**”（<https://www.anthropic.com/claude-haiku-5-5>）；反证「取错行」的是
   官方 Sonnet 5.5 发布稿（**2026-09-28**）当时写 cache reads **$0.20**（<https://www.anthropic.com/claude-sonnet-5-5>），
   而记录 `capturedAt` = **2026-10-01 落在两次生效之间** ⇒ **记录当时正确、自 10-07 起过期**（同页 legacy `Sonnet 5` 的 $0.20 是
   **另一个模型**至今未变的价格，数值相同是巧合）。取证边界如实保留：官方 docs 定价表（`platform.claude.com/docs/**` 与 `llms-full.txt`）
   **今天仍被区域门 307 拦**（`llms.txt` 索引 200 ⇒ **「索引可达 ≠ 内容可达」**，「换文档路径 / 加 `.md`」**不算独立取证路径**）；
   出口/镜像（archive.org、web.archive.org、r.jina.ai、codetabs、allorigins、Mintlify×2、raw.githubusercontent）**全部失败**，
   逐条记为**取证缺口**；生效时刻只有官方原话 “starting today”。
   **用户裁定（2026-10-08）：落地改价** ⇒ 走 `anthropic-cached-price-landing-v1`（t28）：`rates.cachedInput` **0.2 → 0.1**、
   新增一条指向官方变更记录的引文（逐字 + 官方日期）、**如实推进一条公开变化事件**（进 `/changes/` 与订阅源；官方生效日 2026-10-07
   与我们的记录/观察日**分开登记，不许伪造日期**）；**写入档（5m/1h）是否联动官方无说明 ⇒ 不许顺手改**。
   `officialUrl` **仍按上面的裁定保持不改**（那是另一件事：换 URL 会额外推进一条 `updated officialUrl` 事件）。
   **4）【已落地并线上复核，2026-10-08 深夜】** 落地细节与五颗牙见 §0 第 19 条；captain 不经成员脚本独立复核线上：
   `/feed/plans/api/changes.json` 首条 = 「Anthropic · Claude API 按量计费 — 降价」；`/plans/api/` 正文 Sonnet 5.5 行为
   `$2 $10 $0.1`（写入档仍 `$2.5 / $4` 未动），页面含 `rather than` / `50% less` / `2026-10-07` ⇒ 新价与官方引文、官方生效日都在线上。
2. **腾讯混元 → TokenHub（来源迁移风险 · 已升级，不再是「未来」提示）**：旧平台计费页（1729/97731）
   今天仍 200 且 6 个模型价格与记录**逐一一致**，但官方公告（/announce/detail/2287）给出的
   **旧平台全面停服日 2026-09-30 已过**（2026-10-08 复核），公告另写明 2026-06-30 起停止售卖。
   迁移目标 TokenHub 的公开计费面（1823/130054 · 130055 · 130051）逐项对账结果为
   **一致 1 / 不一致 0 / 该页不载 5**：只有 `hunyuan-role-latest`（展示名 Hy-Role-Latest，
   模型 id 同名，广州 tab 2.4 / 9.6）在 TokenHub 上对得上；`hunyuan-a13b`、`hunyuan-translation`、
   `hunyuan-translation-lite` 被迁移指南**点名「TokenHub 将不再支持」**；
   `tencent-hy-vision-1.5-instruct`、`hunyuan-embedding` 不在 TokenHub（页面只有后缀/id 不同的近亲）。
   免费额度（100 万 tokens / 1 年）在 TokenHub 的**计费面**上不载（130054 只有指向 130053 新人免费体验包的
   指针；该体验包是活动包、截至 2026-12-31，与记录所述不是同一条）。
   **不得写成「价格已变化」**（不一致 = 0）；也**不得**把公告写的要求当成「服务确已停止」——那是公告口径，不是实测服务状态。
   触发条件（满足任一条**先报 captain**）：**T1** 旧计费页非 200 / 跳转 / 内容变更；**T2** TokenHub 出现另外 5 个模型的
   同名 id 或官方给出旧名→新名映射；**T3** TokenHub 对 `hunyuan-role-latest` 改价；**T4** 旧计费页被重定向到 TokenHub。
   复核脚本：`research/_raw/sources-residue-v1b/build-v1b-evidence.js`（锚点找不到即**报错退出**，不静默出空证据）。
   **记录层本轮不动**（加注记会被 officialUrl / sourceUrl / 价格 / 引文四条边界挡住，且会推进一条公开变化事件）。
3. **术语残留（DEFERRED）**：历史层 / 信息流仍把 `sourceUrl` 叫「原始出处」，而该 URL 在生产数据里**今日不可达/语义已分角色**
   （`officialUrl` / `url` / `sourceUrl` / `evidence[].sourceUrl` 四者角色见 `docs/SCHEMA-v3.0.md` §10 ⑤）。
   本轮只统一了契约与页面措辞，**历史文档里的旧称保留**，标记为 DEFERRED。
   2026-10-08 复核：全库 `原始出处` **57 次 / 44 行 / 27 文件**（文档 40 · 源码 16 · 产物 1）；
   **今天真的渲染出来：0 处**（71 条历史事件全为 `created`/`field=null`，档案详情页 0 个）；
   活路径 3 处（`scripts/lib/history.js:192` · `index.html:1348` · `scripts/lib/archive.js:685`）—— **维持 DEFERRED**。
   另：`scripts/data/official_urls.json:3` 的括注「（渲染成「原始出处」行）」**已陈旧**（deal 侧行标签早已是「收录渠道」，
   `audience.js:749`；plans 侧根本不渲染该字段）⇒ 校正排进 `sources-residue-v1b`。
   ⇒ 2026-10-08 追加（`sources-residue-v1b` 已完成）：该括注**已校正**（产物 **0 变化** —— 对照组同源码连构两次
   changed=0，实验组改后 changed=0；变化日志 **0 条**），并新增一条**可复核判据**（注里的行标签必须逐字等于
   `SOURCE_LABELS.origin`；**改回旧写法 ⇒ 2/8 红**、**内存里改名 `SOURCE_LABELS.origin` ⇒ 红且磁盘 sha256 不变**）。
   该判据的**固化**（迁到 `scripts/tools/` 的自测住址 + 登记进 `.github/actions/gate/action.yml`）见 `roles-note-tooth-v1`（t18）——
   **一条不进 CI 的牙不是牙**，所以这里不写成「已解决」。
4. **引文预算的结构上限（重要口径）**：单条记录**最多 3 条引文**（`MAX_EVIDENCE_ITEMS = 3`，实测 16 条记录用满），
   2026-10-08 实测：发布数据 **24 条 API 计费记录 / 59 条引文** —— **40 条模型级绑定**（`models.<modelKey>`），
   其中引文里 input 与 output 同时出现的 **39 组顺序对（39/39 顺序正确）**；**维度级绑定（`…rates.<dim>`）0 条**，
   分母 `(模型 × 维度)` 非空格子 **308** 个一个都没被维度绑定单独认领（报告 §5.1 另给另一种算法口径 **108**）。
   ⇒ **任何报告都不得写成「input/output 已逐条证据绑定」**；正确写法是「模型级绑定 40 条 + 引文内 input/output 顺序对 39 组（B2 判据）
   + 结构判据（B1/B3 · 单位见证 · 维度域扩展）兜住其余」。
   （旧文写的「66 个计价条目 / 26 条模型级绑定 / 24 组顺序对」是 2026-10 早期口径，**已随数据增长过期**；
   越界表述扫描 **0 处** —— 该短语只出现在 7 行**否定句**里。）

> **v3.0 之后最值得投入的方向（历史段落，保留原样）**：把「未映射」的套餐模型串收干净、
> 给 `/archive/` 攒出真实样本、以及把 API 计费的单位换算**明确地不做**这件事写得更显眼。
> —— 现状校正（2026-10-04 重算）：套餐侧**未判 0 条**（19 条 = 已映射 9 + 已声明「不对应单一模型身份」10），
> 旧文写的「未映射 11 条」**已不存在**（审计 P3-27）；API 侧未映射 **0 条**。

---

> **2026-10-02 最新一轮：`v3.0-ai-deals-knowledge-base` —— 结构化资料库（已交付，待独立验收）**
> 交付：`/plans/` 枢纽 · `/models/` + 44 个模型详情页 · 厂商页 9→**19**（统一资料页，六个资料区块）·
> `/archive/`（0 条，如实空态）· `/docs/data/` + `/data/index.json` Manifest（9 份数据集）·
> `/feed/plans/api/changes.{xml,json}` + `/changes/` 三条变化流（优惠 / 套餐 / API 价格）·
> `docs/SCHEMA-v3.0.md` · `research/v3.0-ai-deals-knowledge-base-report.md`。
> 门禁 31 → **39** 步；check:ci 35 → **36** 条断言（新增「新脚本必须登记进门禁」）；
> 真浏览器 440 → **657 项 0 失败**（含 `--compare` 回归）；20 条 Tooth Test 逐条实跑变红并逐字节还原。
>
> **还需要你点头的三件事（都不是技术问题）**：
> ① **数据许可证**：仓库没有任何 `LICENSE` / `COPYING` 文件。`/docs/data/` 页与报告都写成
>    「未定 —— 需项目所有者决定」，**本仓不擅自选一个**。你要不要给这份数据加一个许可证（如 CC BY 4.0）？
> ② **`/archive/` 交付日为空**：三份日志里 deal 事件 0 条、plan 14 条（全是 created）、api 6 条（全是 created），
>    因此 `ended` / `restored` 两条分支上线时**没有真实样本**，只由合成夹具驱动。
>    这会在第一次真正有资料下线时自动生效 —— 不需要现在造数据（造数据是禁止项）。
> ③ **`/provider/` 与 `/vendor/` 的二选一已经做过**：继续用 `/vendor/<slug>/`（不迁移、不新增并行路由）。
>    如果有朝一日要改，`assertNoParallelProviderRoutes()` 会先红 —— 那时再谈迁移。
>
> **v3.0 之后最值得投入的方向**（详见报告 §20）：把「未映射」的 11 条套餐模型串收干净、
> 给 `/archive/` 攒出真实样本、以及把 API 计费的单位换算**明确地不做**这件事写得更显眼。

> **2026-10-01 最新一轮：`v2.5-api-token-plans` —— API / Token 计费对比（已上线）**
> 题面要求先回答「是否应该设计 `BasePlan + CodingPlan + ApiPlan`」。结论：**要 BasePlan，
> 但它是「共享判据」而不是「共享记录形状」** —— 不建混合表，`plans.json` 与 `plan-history.json`
> 在整轮改动中**逐字节不变**。理由是那个文件的字段集是封闭的（白名单 + 归一器重跑逐字段比对），
> 混合之后 coding 的每条字段都要按 kind 分支，而它正被 202 项自测与线上用户用着。
> —— 记录粒度：**记录 = provider × 计费产品，模型价格是记录内的元素**（身份 `(modelKey, variant)`）。
> 题面提示身份是 `provider / model / pricing variant`，价格的身份确实是三元组，但记录不是：
> 若记录 = provider × model，题面 §十 的厂商级赠送会撞上关系表的 8 条上限，
> 且 provider 级事实（免费额度 / credits / 限速 / 单位）per-model 存储会在几十行里漂移。
> —— **三条与「钱」有关的结构红线**（各有牙）：① `pricing.unit` 必填且**全仓没有单位换算路径**；
> ② credits 是钱不是 token（白名单无 token 字段 + 拒绝键名含 `token` 的键，根本写不进去）；
> ③ 模型改名保持 `modelKey` 时**零事件**，换 `modelKey` 才检测并留档（**检测不等于自动合并**）。
> —— 数据：**5 家平台 / 7 条记录 / 37 个模型计价条目 / 19 条官方引文**，全部逐字取自官方页
> （智谱 / DeepSeek / OpenAI / Anthropic / Google）；候选未采信的 6 家如实记录、一条未写入。
> —— 页面 `/plans/api/`：11 列预渲染静态表（**零控件**）+ 免费额度与 credits 明细节 + 最近变化块 +
> 官方原文 + 九条口径说明，与 `/plans/coding/` 互相深链。
> —— 实测：`selftest:api-plans` **76 项 0 失败**（含 4 条 Tooth Test 实跑）· `verify --compare`
> **446 项 0 失败**（§20 新增 23 项）· 既有 202 + 132 + 78 项保持全绿 · 两次构建逐字节一致 ·
> 门禁 31 → **34** 步。
> —— **✅ 已上线**：PR **#24** 合并（`983effe`）后 **Deploy 失败**在 `回归：JS 错误仍为 0 — 1 个`
> —— 根因是我在 §20 里 `page.goto('sitemap.xml')`，XML 文档没有 favicon 声明 ⇒ 浏览器去要
> `/favicon.ico` ⇒ 404 ⇒ 一条控制台错误；而这一节独独没做错误计数快照，于是它记到整轮账上。
> **修法不是调松门禁**：sitemap 改用页面内 `fetch()` 读 + 补上本节的错误快照断言。
> 同轮顺带抓到第二个缺陷：API 页写了 `data-logo` 却既没引用 `logos.css`、类名又不是 `lg`
> ⇒ 每行 logo 是**空方块**（既不报错也不发外部请求）。
> 修完 PR **#25** → 合并 **`9f36a0a`** → `gate` success → `Deploy` success →
> **线上冒烟 440 项 0 失败**（`/plans/api/` 200 · `/api-plans.json` 200 · `/api-plan-history.json` 200）。
>
> **`Phase 2.5` 还剩下的（按价值排序，都还没做）**：
> ① **API 计费的专属订阅源 + `/changes/` 分栏** —— 变化日志与页内「最近变化」块都有了，
> 但没进 Feed / 没进 `/changes/`：`feeds.js` 的注册表当前是**单条 spec**，扩成两条要动
> 注册表、`PAGE_FEED_ROUTES`、`/feeds/` 的回链断言与 `selftest:feeds` 的计数，属独立一次改动；
> ② **补国内 API 源**（阿里云百炼 / 火山方舟需要按模型分页或人工策展；
> `per_1K_tokens` 口径目前只有夹具覆盖）；③ **API 成本计算器**（题面 §八 明确留到后续，
> 结果必须标成**计算值**）；④ `/plans/` 枢纽页；⑤ 疑似改名的**候选建议**（仍不允许工具直接写生产数据）。
>
> **2026-10-01 前两轮（也一并记在这里，之前没写进本文件）**
> —— `v2.3-plan-history`：套餐变化追踪（追加式日志 + 防误报 + `/plans/coding/` 的最近变化块 +
> 套餐变化订阅源），PR #21 上线。
> —— `v2.4-deals-plans-linking`：优惠 ↔ 套餐的**显式关系表**（人写事实 + 官方引文，
> 工具只出候选报告、没有任何写生产关系的路径），优惠页与套餐页双向深链，PR #23 上线。

> **2026-10-01 上一轮：`v2.2-coding-plan-compare` —— `/plans/coding/` 变成可比较的页面**
> （v2.1 已经建好数据模型与静态表，这一轮只做**读**的那一层）
> —— 交付：**筛选**（平台 / 模型 / 价格区间 / 额度类型 / 地区 / 是否有活动价）、**搜索**
> （平台名与别名 / 套餐名 / 模型名，中文显示值可搜）、**排序**（默认顺序 / 正常月费 / 活动价 /
> 最近更新，名义 Token 单价一档在"有可比行"时才出现）、**逐行展开溯源**（首次收录 / 核对日期 /
> 来源类型 / 官方定价页 / 每条引文）。
> —— 三条硬承诺：**无 JS 时仍然是完整的 11 列静态表且页面上零个控件**；**一套数据模板**
> （桌面与手机同一张表，窄屏横滚 + 前两列固定）；**不为任何筛选组合生成 URL**。
> —— 交互逻辑住在 `scripts/lib/plans-compare.js`，构建期**逐字节内联**进页面、离线自测 `require`
> 同一份字节；页面另有"第二事实来源"（内嵌 JSON 载荷），构建期与 `dist/plans.json` **逐字段对账**。
> —— 排序口径：`null`（无活动价 / 算不出单价 / 原价未标注）**恒在可比较项之后**，`asc`/`desc`
> 都不越过；价格排序与单价排序**按币种分组**（没有汇率就绝不跨币种比大小）。
> —— 实测：`selftest:plans` **182 项 0 失败**（含 7 条新牙，逐条实跑变红）· `verify` **379 项 0 失败**
> （§19 新增 30 项：8 个平台 / 3 类额度 / 4 档价格 / 4 个搜索词逐个对账 + 无 JS 零控件）·
> `verify:regress` **385 项 0 失败**（首屏仍 9 张、页高 4589→4665px 未变）· `verify:seo` 8 项 0 失败 ·
> 构建 ×2 套餐页逐字节一致 · 既有 20 道门禁全绿 · `check:ci` 35 项 0 失败（门禁仍 29 步）。
> —— 两个真问题是**实测抓的**：① 事件委托挂错容器 ⇒ 「点详情没反应」（挂在控件容器上，
> 而详情按钮长在表格行里）；② `.ptable` 自带的 `overflow:hidden`（桌面圆角裁剪）会成为
> 最近的可滚动祖先 ⇒ sticky 前两列**根本没粘住**（滚动 300px 后 left = -283px）。
> —— **✅ 已上线（2026-10-01，按你的「推送上线」）**：PR **#15** → `gate` success → 合并 `18f782b`
> → `Verify site (gate)` 与 `Deploy to GitHub Pages` 双双 success；线上冒烟实跑：
> `/plans/coding/` **200**（133,710 字节）· 筛选 / 搜索 / 排序 / 详情在线上实点全部正确 ·
> 390px 溢出 0px · 无 JS 时 9 行 / 9 个官方链接 / **0 个控件** · 线上 JS 错误 0 ·
> `sitemap.xml` **111** 条 · `/plans.json` 与另外 6 条路由全部 **200**。
>
> **`Phase 2.2` 还剩下的（属于下一轮，或按你的优先级）**：没有可比较的单价的套餐目前是 0 条，
> 所以"名义 Token 单价"这一档排序暂时不出现（逻辑已实现并被夹具测试钉住）；独立 plan 详情页
> 刻意不做（信息量不足，改为行内展开）；跨币种比较需要汇率，本阶段明确不做。

> **2026-10-01 上一轮：`v2.1` 第二段 —— 把套餐数据发布出来、做成 `/plans/coding/` 页面**
> （同一分支 `v2.1-coding-plan-data-model`）
> —— 上一轮收尾时列了「进 2.2 前要先解决的三件事」，这一轮就是那三件事（它们正好是 2.2 的**接线**部分）：
> ① `plans.json` 进 `PUBLIC_FILES`，产物自检断言 `dist/plans.json` 与源**逐字节相同**；
> ② `/plans/coding/` 接成一条真路由（走 `/status/` 那条**独立静态页**路径，不是落地页家族 ——
> 它只有一条路由、不分页、不需要门槛），四张清单逐处更新（页脚占位符 / sitemap 条数公式 /
> `pageRoutes` / 两张逐层扫描表），`seo.js` 的 `textFloor` 新增 `plans` 分支；
> ③ 口径文案与禁词（性价比 / 最划算 / 排行榜 / TOP 1 …）从产品规则变成**可失败的断言** ——
> 唯一出处 `lib/plans-page.js` 的 `FORBIDDEN_CLAIM_WORDS`，**三处查同一份清单**：
> 构建期查内存、产物自检**从磁盘回读**再查、真浏览器查渲染出来的 `innerText`（数据层另查一遍）。
> 页面：11 列（平台 / 套餐 / 正常价格 / 活动价 / 计费周期 / 可用模型 / 额度类型 / 原始额度 /
> 名义 Token 单价 / 最近更新 / 备注），每行一个 `data-item`，JSON-LD 三段（ItemList 指向**官方定价页**），
> 可索引 + 进 sitemap（0.9）+ 两个根 Feed，正文 2971 字，**11 列宽表在 390/360px 页面级溢出 0px**。
> 「未知」三种写法：`未标注`（文本缺失）/ `—`（数值缺失或**不可比较**）/ `未确认`（三态）——
> 并且**「原价未知」与「确实免费」成对断言**（只查一半会在另一个方向漏掉，把免费档也写成"未标注"）。
> 实测：`selftest:plans` **135 项 0 失败**（+页面层 15 项含 4 条牙）· `verify` **350 项 0 失败**（+§19 15 项）·
> `verify:regress` **356 项 0 失败**（卡片 50→50 · 首屏 9→9 · 页高 4589→**4665px 未变**）·
> `verify:seo` **8 项 0 失败**（114 页 · sitemap 111 · 孤儿 0）· 构建期 SEO **27 码 × 114 页全过** ·
> `build` ×2 页面逐字节一致 · `check:feeds:reproducible` 46 个 Feed 文件一致 · 既有 20 道门禁全绿。
> **两个真问题是断言抓的、不是人看出来的**：面包屑回站根写成 `../`（两层路由会解析到不存在的
> `/plans/`，被 SEO 内链存在性当场抓住）；页面诚实性断言第一版拿整行做正则，把 `2,000` 的末位 0
> 判成「原价未知却像 0」（改成逐单元格比对）。**两处都已纠正并补了断言。**
> **✅ 已上线（2026-10-01，按你的「合并推送」）**：PR **#13** → `gate` **success** → 合并 **`535a25b`**
> → master 的 `Verify site (gate)` 与 `Deploy to GitHub Pages` **双双 success**。
> 走 PR 而不是直推，原因与 v2.0 相同：ruleset 要求 `pull_request` + 必需检查 `gate`。
> **线上冒烟（本机这次有通路，实跑的）**：`/plans/coding/` **200**（9 行 · 口径文案在位 · 无禁词）·
> `/plans.json` **200** · `/sitemap.xml` **200**（**111** 条 `<loc>`）· 首页页脚「套餐对比」入口在线 ·
> 详情页与 `/vendor/zhipu/` `/category/api/` `/changes/` `/status/` `/feeds/` 全部 **200**。
>
> Phase 2.2 还剩下的（本段有意没做）：筛选 / 搜索 / 排序控件、套餐详情页（或行内展开）、
> 首页主入口（现在只有页脚入口）、同币种价格区间筛选。
>
> **2026-10-01 上一轮：`v2.1-coding-plan-data-model` 第一段（数据契约）**
> —— 目标：为「AI Coding 套餐对比」建立**独立于 Deals**、可长期维护 / 可校验 / 可重建 /
> 能为 Phase 2.3 History 打底的数据契约。**这一段前端一个字节没改**
> （第二段改了页脚一行：多了一个「套餐对比」入口，见上）。
> 新增 `plans.json`（**9 条套餐 / 8 个平台 / 国内 7**）与它的人工来源层
> `scripts/data/curated_plans.json`、provider 归一表 `scripts/data/providers.json`；
> 派生管线是 `curated_plans.json → npm run plans:rebuild → plans.json`（不联网、不读墙上时钟，
> `updatedAt` = 全部 `lastSeen` 的最大值）。
> 判据只有两处实现（`lib/plan-schema.js` 与 `lib/providers.js`），**校验的做法是把归一器再跑一遍**
> 再逐字段比对 —— 手改 `id`、手算 `derivedMetrics`、枚举拼错、文本多个空格都会被指名道姓地判红。
> 三道硬承诺：**不该算的绝不算**（「名义 Token 单价」只在 5 个条件同时成立时产出，
> 真实数据 **9 条全部为 null** —— 没有任何一家厂商在官方页给出固定 Token 额度）·
> **改价不换 id**（`id = sha1(kind|provider|planName|计费周期)`）·
> **只认官方页**（聚合站出处拒收；第三方只能用来发现候选，最终没有一条事实来自第三方）。
> 新增 `selftest:plans`（**117 项**，含题面 6 条 Tooth Test + 扩充的牙）、
> `check:plans:reproducible`；门禁新增两步（27 → **29 步**，`--expect-checks=35` 不变）。
> 门禁实跑：`verify` **335 项 0 失败** · `verify:regress` **341 项 0 失败**（卡片 50→50 · 首屏 9→9 ·
> 页高 4589→4665px 在 15% 容差内）· `verify:seo` **8 项 0 失败** · 既有 20 道门禁全绿
> （`selftest:provenance` 仍是 91 项，证明引文层参数化没改变 deals 侧行为）·
> **构建 ×2 + 一次 stash 对照，三次 `dist/` 全树 SHA256 完全相同** ⇒ 零页面影响有实证。
> 真实数据牙齿演练两条（硬塞 Token 单价 / 改来源层不重建）都已实跑变红并**逐字节还原**。
> 契约 `docs/SCHEMA-v2.1.md` · 报告 `research/v2.1-coding-plan-data-model-report.md`。
> **✅ 已上线（2026-10-01）**：与第二段同批走 PR **#13** → `gate` success → 合并 **`535a25b`**（见上）。
>
> 对下一阶段的判断：**适合进入 `Phase 2.2 — Coding Plan Compare`**。进入时要先解决三件事：
> ① 把 `plans.json` 接进 `build-local.js` 的 `PUBLIC_FILES`（或在构建期注入派生字段）——
> 本阶段刻意没做；② `/plans/coding/` 是一个**新的落地页家族**，`landing.js` 的 `itemsOf` 的
> `match.by`、门槛分支、`seo.js` 的 `textFloor`、构建期 sitemap 计数公式与 SEO 描述符列表
> 都要一起改（且首页页高有 15% 硬容差，导航项慎加）；③ 把口径文案
> （"名义 Token 单价只用于粗略比较"）与禁词（性价比 / 最划算 / TOP 1）补成**可失败的断言** ——
> 目前它们只是产品规则，仓库里没有脚本检查。
> 可选前置：智谱当前档位价格、百度 Comate 与 Anthropic Claude 的官方定价页需要**真浏览器**
> 才能取到（本环境的文本提取器读不动 JS 页与标签页），要覆盖这三家就先补一次浏览器取证。
>
> **2026-09-30 上一轮：`v1.7-seo-expansion`（分支 `v1.7-seo-expansion`，隔离工作树
> `.worktrees/v1.7-seo-expansion`，基点 `v1.6-subscription = 71a4057`）**
> —— 目标：**把已有的结构化数据组织成真正有搜索价值的静态入口页**（不是批量造 SEO 页）。
> 新增 **16 个页面**：厂商页 9（`/vendor/<slug>/`，门槛复用订阅的 `VENDOR_THRESHOLDS`）·
> 分类页 5（`/category/<slug>/`，门槛 ≥4 条 + 人工允许表 + 集合唯一性）· 枢纽页 2
> （`/vendor/` `/category/`，同时是面包屑父级）。另收口 **3 对早就是重复内容的近义 URL**
> （旧地址降为 `noindex,follow` 别名页，短路由保留为被索引入口）。
> 顺手修掉四个**早就在、但没有任何断言会红**的缺陷：首页与 80 个详情页缺 `<h1>`（113 页里 81 页）·
> `ItemList` 声明数与页面行数不符（`/developer/` 声明 67 实列 50）· 详情页面包屑把分类指向站根。
> 新增 **27 个检查码**的 SEO 门禁，两个**输入完全不同源**的执行点（构建期 + `npm run verify:seo`
> 只读 dist 独立重推），外加 6 条 Tooth Test 实证「该红时真的会红」。
> 实测：113 页 / 可索引 110 / sitemap 110 / Feed 46 个文件；`verify` 335 项、`verify:regress` 341 项全过，
> **首屏仍是 9 张卡**（首页只把品牌 `<b>` 换成 `<h1>` 并在页脚那一行加了入口，没有新增整行）。
> 契约 `docs/SCHEMA-v1.7.md` · 报告 `research/v1.7-seo-expansion-report.md`。
> **未合并、未推送 —— 等你的「推送」。**
>
> 对下一阶段的判断：**适合进入 `v2.0-ai-assisted-maintenance`**，唯一前置条件与 v1.6 相同 ——
> `deal-history.json` 仍是 **0 事件**，先跑满 3 天采集拿到真实变化样本再进。
>
> **2026-09-30 上一轮：`v1.6-subscription`（分支 `v1.6-subscription`，隔离工作树
> `.worktrees/v1.6-subscription`，基点 `v1.5-change-radar = 12d4d08`）**
> —— 目标：**在不引入账号 / 数据库 / 邮件 / 推送 / 第三方 SDK / 行为追踪的前提下，
> 让读者订阅自己真正关心的优惠变化**，继续跑 GitHub Pages 静态构建。
> 产出 **18 个 Feed × 2 种格式（RSS 2.0 + JSON Feed 1.1）= 36 个静态文件**：
> A 类优惠 Feed（全部 / 学生 / 开发者 / 免费 API / 免费 Tokens / AI Coding / 国内可用 / 9 家厂商）
> 回答「当前有哪些符合这个条件的优惠」；B 类变化 Feed（`/feed/new.*`、`/feed/changes.*`）
> 回答「最近发生了什么」。判据只有一处：`scripts/lib/feeds.js` 的注册表 + `validate()`，
> 优惠 Feed 的谓词**直接引用页面注册表**、变化 Feed 的条目**直接取雷达分栏**。
> 三处硬承诺：**主链接回归站内**（此前 80 条条目全部把权重导出站外）· **Stable ID
> 不动 `deal.id`**（升级不会给老订阅者重推）· **连续 10 次真实构建逐字节一致**。
> 新增 `selftest:feeds`（66 项，含 4 项 Tooth Test）、`check:feeds:reproducible`、`report:feeds`；
> 门禁新增两步（冻结序列 21 → 23 步，`--expect-checks=32` 不变）。
> 门禁实跑：`verify` **297 项 0 失败** · `verify --compare` **303 项 0 失败**（页高 +1.2%，
> 容差 15%）· 既有 11 支自测全绿 · 投毒演练确认「重复 guid / 死链 ⇒ 构建红」。
> **未合并、未推送** —— 等你的「推送」。完整报告：`research/v1.6-subscription-report.md`；
> 契约：`docs/SCHEMA-v1.6.md`。
> ⚠️ 交付当天**变化订阅是空的**（变更日志起算日 2026-09-30、0 条事件）—— 这是如实结果，
> 页面与 Feed 的说明都写明「空是事实，不是故障」，**没有补造任何历史事件**。
> 下一阶段建议：**可进入 `v1.7-seo-expansion`**（订阅把主链接、`/feeds/` 入口、
> `atom:link rel=self`、`icon`/`favicon` 这几块 SEO 地基补齐了）；但先让采集链跑满
> 2–3 天拿到真实变化样本，**在此之前不要改 `changes.js` 的窗口与高价值判据**。
>
> **2026-09-30 上一轮：`v1.5-change-radar`（分支 `v1.5-change-radar`，隔离工作树
> `.worktrees/v1.5-change-radar`，基点 `origin/master = b202d21`，其中已含 v1.4 的 PR #6）**
> —— 目标：**让用户有理由反复回来**，而不是搜索一次就离开。在 v1.4 的变更日志之上做出
> 五个分栏：今日新增 / 最近 7 天变化 / 即将结束 / 已结束 / 重新出现；
> **首页一行条带只展示高价值变化**，完整视图在 `/changes/` 静态页。
> 判据只有一处（`scripts/lib/changes.js` 的 `buildRadar()`，纯函数、零依赖、无网络、不用 LLM），
> 构建期算一次，条带与页面读同一份结果；**不注入 `dist/deals.json`、不写任何数据文件**。
> 首页条带**不单独占行**：实测第三行底边距视口底边只剩 1px，所以它与「跳到档位」共用一行
> （演练实测：独立成行 ⇒ 首屏 9→6 张；共用一行 ⇒ 9 张不变）。
> 新增 `selftest:changes`（89 项，进 CI 门禁）、`report:changes`；`history-selftest` 扩到 61 项
> （`ended` 新增可选墓碑 `label`，向后兼容）。
> 门禁实跑：`verify` **281 项 0 失败** · `verify --compare` **287 项 0 失败**（首屏 9→9）·
> `build` ×2 产物 SHA256 一致 · 非空路径用**真实数据演练**证明后逐字节还原。
> **未合并、未推送** —— 等你的「推送」。完整报告：`research/v1.5-change-radar-report.md`；
> 契约：`docs/SCHEMA-v1.5.md`。
> ⚠️ 交付当天雷达是**空的**（变更日志起算日 2026-09-30、0 条事件；`deals.json` 里 0 条 `expiresAt`）——
> 这是如实结果，**没有补造历史**；第一次真实变化会在下一次定时采集时落库。
>
> **2026-09-30 上一轮：`v1.4-deal-history`（分支 `v1.4-deal-history`，隔离工作树
> `.worktrees/v1.4-deal-history`，基于 `master = 2204565`）**
> —— 目标：**记录优惠生命周期与重要变化**，让「首次发现 / 免费额度变化 / 新增截止日期 /
> 领取条件变化 / 从官方页消失 / 消失后重现」六个问题可被机器验证地回答。
> 方案是 **D 混合**：显式 change event 作唯一运行时存储 + 一次性值基线（可重放验证）+
> git diff 降级为离线交叉校验（`npm run history:audit`，不进 CI）。**首页一行未改**（不做变化雷达）。
> 新增 `scripts/data/deal-history.json`（一次性基线 86.7 KB + 追加事件，交付时 0 条 ——
> 历史自 2026-09-30 起算，不补造）；新增两个 CI 门禁 `check:history` 与 `selftest:history`(52)。
> 门禁实跑：`verify` 262 项 0 失败 · `verify --compare` 268 项 0 失败；`build` ×2 产物 SHA256 一致。
> **已上线（2026-09-30）**：PR **#6** → `gate` success → 合并 **`bec6068`** → Deploy success；
> 线上 `verify --url=` **262 项 0 失败**（详情页「变更记录」块在线、空态与无 JS 可读都验过）。
> 完整报告：`research/v1.4-deal-history-report.md`；契约：`docs/SCHEMA-v1.4.md`。
> 下一阶段建议：**可进入 `v1.5-change-radar`**，但先观察一个采集周期拿到真实事件样本，
> 再决定聚合粒度；入口优先考虑 `/changes/` 静态页，而不是动首页密度（见报告第十节）。
>
> ⚠️ **本文件里的分支/版本坐标已作废**（当时的 `master = 777e3b7`）：之后又有多次定时数据更新、
> 推送、以及 `v1.0` / `v1.1` 两轮（均已合并进 master）。要复核现状请以 `git log` 与
> `PROJECT_STATUS.md` 为准。
>
> **2026-10-01 新增一轮：`v2.0-ai-assisted-maintenance`（分支 `v2.0-ai-assisted-maintenance`，隔离工作树）**
> —— 目标：**用 AI 降低后台维护成本，而不是给网站加聊天入口**（采集器维护、字段标注、
> 去重判断、翻译草稿、异常诊断）。**前端一个字节没改。**
> AI 只能提出候选：候选由 `scripts/ai/` 产出、进 `.ai-cache/`（不入仓），
> 人工 `ai:accept` 之后由 `ai:apply` 写进两个**已有人工来源层**（`curated_*.json` /
> `audience-overrides.json`），再离线重建 `deals.json` 并跑门禁；红了整批回滚。
> **采集链路完全不引用 AI 层**（静态断言），AI 挂掉/无 key 时退出码 0、站点照常。
> 门禁新增两步（AI 层自检 37 项 + 采集器 fixture 回放 4 项，均离线）；
> `check-ci-consistency` 新增 (16) 断言「AI 维护链路只手动触发、只读仓库、只出 artifact」，
> `--expect-checks` 32 → 35。分支基线验收 **262 项 0 失败**（六项回归全过）；
> **并回 master 后重测为 341 项 0 失败**（上游 v1.4–v1.7 的断言都在，页高 4589→4665px 在容差内），
> 门禁步骤 27 步，`build` 946.0 KB。
> 新门禁与新能力对本机没有 key 的限制也如实记在报告里：**前两臂评测不是模型分数**。
> 完整报告：`research/v2.0-ai-assisted-maintenance-report.md`；
> 前置的成本审计：`research/v2.0-maintenance-cost-audit.md`；契约：`docs/AI-MAINTENANCE-v2.0.md`。
> 合并态记录见 `PROJECT_STATUS.md` 2.39 的 ⑨ 节。
> **✅ 已上线（2026-10-01）**：直接推 master 被 ruleset 拒绝（`Changes must be made through a
> pull request` + `Required status check "gate"`），改走 PR：#11 gate 绿 → 合并 `9bf46f9` →
> deploy 链（prepublish/build/deploy）全绿 → 线上冒烟 6 条全 200。记录见 2.39 的 ⑪ 节。
>
> **2026-09-29 新增一轮：`v1.2-intent-first-home`（分支 `v1.2-intent-first-home`，隔离工作树）**
> —— 目标：**把首页从「数据库筛选器」升级成「按用户真实需求找优惠」**。
> 首页多了一行「按需求找优惠」入口（10 枚静态 `<a>`，无 JS 也在、也能点），
> 每条对应一个 `/need/<slug>/` 静态落地页（预渲染表格 + 「为什么在这一页」证据列 +
> 双 feed + 三段 JSON-LD + 自指 canonical + 进 sitemap）。
> 判据只写一遍（`scripts/lib/audience.js` 的 `NEED_PREDICATES`），结果作为**派生字段** `needs`
> 进 `dist/deals.json`，**v1.1 契约一个字没改**。
> 桌面端密度未倒退（首屏完整卡片 9 → 9，网格起点 196 → 227px，页高 +0.7%）；
> 窄屏入口给全、卡片靠滚动（这是显式取舍，见报告第七节）。
> 验收 **250 项 / 失败 0**。完整报告：`research/v1.2-intent-first-home-report.md`。
> **未合并、未推送** —— 等你的「推送」。
>
> 下一阶段的建议（含是否进入 `v1.3-evidence-provenance`）也写在那份报告第八节：
> 建议进入，并把 `ai-coding` 的字段缺口并进去。
>
> **2026-09-28 新增一轮：`v1.0-public-readiness`（16 个提交，已合并进 master）**
> —— 目标是把项目从「功能比较完整的个人项目」变成「可以公开、长期、低维护成本运行的数据产品」。
> 四项已知线上问题已修（有效期语义 / 锚点假隐藏 / 中文译文可搜 / 原文截断留痕）；
> 发布链改成 `prepublish(完整门禁) → build → deploy`，**门禁红时本次版本绝不发布**；
> 新增数据源健康状态与 `/status/` 页（跨运行的 `scripts/data/source-health.json`）。
> 另外：译文门禁从建议性改成硬门禁（漂移必红、待译按 7 天宽限期）。
> 收尾时 3 条待译（Midjourney / Grok / Unboring.ai，上游改写 + 新进条目）**已由人补译完毕**，
> 现在 `npm run check:zh` 报 `待译 0 条`；同时修掉一个假红陷阱 —— 已译好的行原先会一直留在
> `scripts/data/zh-pending.json` 里，等上游再改写一次、译文撤下时会翻出旧日期当成「等了很久」，
> 现在作者循环 `--scaffold` 会顺带划账（两条牙守着：已译好的必须消失、仍缺译的必须保留原日期）。
> 下一阶段（学生 + 开发者数据模型）的前置条件见 `PROJECT_STATUS.md` 2.33 的 F 节。
>
> **✅ 那三件只能由人在 GitHub 网页上做的事：已全部完成**（2026-09-28 当晚）
> 1. **专用 GitHub App** 已建、已安装，`COLLECT_APP_ID` / `COLLECT_APP_PRIVATE_KEY` 已存。
>    为什么必须：`github-actions`（App ID 15368）是平台原生身份，**不能**被加进 ruleset
>    绕过名单（API 422）—— 细节见 `research/v1.0-public-readiness-report.md` 第七节。
> 2. **PR #1 已合并**（`b95f15c`）；合并后 master 上 `gate` + `prepublish` + `build` + `deploy` 四段全绿。
> 3. **ruleset `master-gate` 已 Active**，生效规则四条：`pull_request`(0 审批) ·
>    `required_status_checks: gate`（**钉在 GitHub Actions 签发方上**）· `non_fast_forward` · `deletion`；
>    绕过名单只有那个 App。机器人已在其下两次成功提交数据（`a7d7a22` / `259199b`）。
>
> 真机证据（两条红探针 run 的逐 job 结论）、以及「第一次配置漏了 `required_status_checks`、
> 后来怎么用 `GET /rules/branches/master` 发现」都记在报告第七节。
> 只剩一件顺带做的事：**下次开 PR 时留意 `gate` 红时 Merge 是否真的被禁用** ——
> 现有证据证明的是「门禁红 ⇒ 不发布」，不是「红着合不了」。

---

## 一、已经办掉的（都可复核）

| 事项 | 结果 |
|---|---|
| **合并 A+B+收尾** | ✅ 按你的点单「全合」：`git merge --no-ff trial/merge-rehearsal-2` → **`10cc923`**，零冲突 |
| **收藏 / 对比（G11）** | ✅ **`30d547f`**。门禁抓出「62 张卡集体 3px 纵向溢出」并修掉（纯 CSS 一行，判据一字未动） |
| ~~首页按意图重排（C2）~~ | ⛔ **已按你的决定撤下** —— 不额外加一个主页、入口级别先不议。评审页已删，**线上首页一行未改** |
| **视觉复核** | ✅ 已补齐（原计划 B4）：**23 条**独立视觉评述，逐条在 [`research/VISION-REVIEW.md`](research/VISION-REVIEW.md) |
| **并回上游（第一次）** | ✅ **`71d020a`** —— 并回 `origin/master` 的 13 个提交（**被重写过的 A/B 线** + 数据更新 + 活动期限三分类）；6 个文件冲突逐个人工解，两侧内容零丢失（见 2.27） |
| **并回上游（第二次）** | ✅ **`0d6b869`** —— 集成期间上游又推了 `fix/detail-close`（删掉详情里重复的「关闭」死链），零冲突 |
| **修掉 chip 折行** | ✅ 390px 下 `rows=2 perRow=[3,1]`、右侧空 **269px** → **`rows=1 perRow=[4]`、余量 0px** |
| **窄屏横向溢出（新发现）** | ✅ 门禁只量 390px，所以从没报过：**320px 溢出 42px、360px 溢出 2px**（根因 `.grid` 的 `1fr` = `minmax(auto,1fr)`，下限被卡片顶在 345.5px）。改成 `minmax(0, 1fr)` 后**均归 0**，且卡内被裁元素 0 个 |
| **门禁补盲区** | ✅ `verify-site.js` §10 新增 3 条断言（逐个控件是否被裁 / chip 是否排满一行 / **360px 页面级溢出**），前两条同时验 390 与 360 两档；**§4 既有判据一字未改**（该文件 +78/−0 纯新增） |
| **本地预览** | ✅ `node scripts/serve.js --dir=dist` → `http://127.0.0.1:8080/`（200，标题正确） |
| **上线** | ✅ 按你的「push」：`git push origin master` **快进** `c70706b..ecbc815`；Deploy 工作流 **success**；线上 `verify --url=` **108 项 0 失败**（上线当日的记录；**线上复测值待复测，见 P0-2**——本机到该 host 无通路）；记录本身随后也推了（`ecbc815..fa2403d`，两次 Deploy 都 success）。现本地 = 上游 = **`fa2403d`**（见 2.28） |

**合并态门禁（在 `0d6b869` + 本轮改动这一棵树上实跑）**：`test` / `test:strict` / `check:zh` exit 0（漂移 0、待译 0）；
`selftest:zh` **7 项 0 失败**；`selftest:expiry` **55 项 0 失败**；`build` ×2 → **产物 139 文件**、全树摘要两次一致
（`8be46e1581651038a7662e41…`）、产物自检通过；`verify:regress` **验收 113 项 0 失败**（113 已含那 5 项回归比对）。

> **环境坑已过时（如实更新）**：2.21 / 2.26 都记着「沙箱 `workspace-write` 禁止子进程管道 stdio，
> playwright 与 `spawnSync` 会以 `spawn EPERM` 失败」。**本会话策略已改为 `danger-full-access` 且关闭审批**，
> 所以上面这些门禁全是**直接跑通**的，没有再绕。前两节的记录是当时的真实情况，后来人不必再照着绕。

---

## 二、已上线；剩下可选的只有观感项

### 是否上线

**已上线（2026-09-23）**：你说「push」后执行了 `git push origin master` ——
`c70706b..ecbc815` **快进**推送成功，Deploy 工作流 [run 35841045158](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/35841045158) **success**。
随后这份**上线记录本身**也推了（`ecbc815..fa2403d`，同样快进，
Deploy [run 35849728738](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/35849728738) success）——
两次差别只在 3 个 `.md`，`dist` 不含 `.md`，所以**线上产物两次完全相同**。

> **一处口径纠正（原先写错了，已改）**：旧文档说「`push` 会触发 CI 采集与 Pages 部署」。
> 实际 `deploy.yml` 是**纯发布**流程（它自己的注释就写着「不做采集（采集由 collect.yml 负责）」）：
> **push 只触发发布**；采集由 `collect.yml` 按**定时**（北京时间 08:00 / 20:00）或手动 dispatch 跑，
> 跑完再由 `workflow_run` 唤起发布。所以推送后线上会立刻更新，但数据采集不会因此多跑一次。

### 不用点头、但你可以点单的：三个观感项

`research/VISION-REVIEW.md` §6 第 4–6 条：控制带偏厚、强调色重复节奏、暗色卡片与底色的明度差。
**它们都不是缺陷，是取舍**；要做的话我按同一套流程来（改 → 门禁 → 视觉复核）。

> 已撤下的两项不算「待办」：**C2 首页按意图重排**（你的决定：不额外加主页）与**英文覆盖**
> （唯一带持续人工成本的项）。素材：`mockups/v3/C-ambitious/PLAN.md`、
> `mockups/v4/README.md`（含一条命令恢复评审页）。

---

## 二·五、已办：收藏入口 + 「打开对比」修复（**2026-09-27 已上线**）

**起因是你的两条反馈**：点击收藏后没有入口打开收藏列表；加入 2 个模型后点「打开对比」打不开。
复核后是**三条现象、三条根因**（真浏览器实测，详见 `PROJECT_STATUS.md` 2.29）：

| 现象 | 根因（一句话） |
|---|---|
| 「打开对比」点不开（必现） | 弹层的 `hidden` 属性从没被摘掉，而 `body.js .cmpdlg[hidden]{display:none}` 是作者级规则 ⇒ 进了顶层却 `display:none`、0×0，**页面还被 inert 冻住** |
| 换筛选后「打开对比」静默失效 | 对比项只在**当前筛选后的卡片**里解析；不足 2 条时直接 `return`，条上却仍写「已选 2 条」而标题条 0 个 |
| 收藏只有「加」没有「看」 | 2.22 当时明确列为不做；本轮补上入口 |

**做了什么**：弹层显隐交回 `<dialog>` 的 `open`；新增 `state.selectIndex`（按**整份数据**解析收藏/对比，
与筛选/Tab/折叠无关）；新增**收藏入口**「★ 我的收藏 N」（只看收藏的视图 + 空态说明 +
失效收藏的「清理这 N 条」，入口放筛选条最前面以免手机上要横滑才看见）。

**门禁（本地同一份产物实跑）**：`verify` **124 项 0 失败**（基线 108，+16 条新断言，全部量几何而不是 DOM 状态）；
`verify:regress` **129 项 0 失败**（5 项回归全过：卡片 62→62、首屏 9→9、页高 5382px 在容差内、外部请求 0、JS 错误 0）；
`build` 自检通过；`test` / `test:strict` / `check:zh` / `selftest:zh`(9) / `selftest:expiry`(55) 全绿；
`check-mobile-chrome` 零裁切。默认视图**预渲染产物与改动前逐字节相同**。

**上线（2026-09-27）**：推送前先 `fetch`，远端已前进到 `4a37a3c`（8 次定时数据更新）→ 零冲突并回 →
重跑门禁 → 补 2 条新进条目的中文译文（否则新门禁 `Translation self-test` 会当场变红）→
`git push origin master` 快进到 **`da3b6e1`**。
`Deploy to GitHub Pages` 与 `Verify site (gate)` **双双 success**；线上定向探针实测：
收藏入口出现、收藏视图正常、**「打开对比」弹层可见（920×548、`:modal=true`、2 列）**、Esc 后无残留弹层、JS 错误 0。
唯一没拿到绿的是 `verify --url=` **整链路**冒烟——本机经代理访问 Pages 抖动，三次死在不同加载阶段（如实记在 2.29 ⑩）。

---

## 二·六、已修并上线：同一家公司的同类优惠并成一张卡（2026-09-27）

**起因是你的反馈**：「同一家公司的优惠没有被合并，就比如 GLM 一下子有 8 条优惠信息」。
复核后确认**不是数据重复，是呈现口径的问题**（逐步记录见 `PROJECT_STATUS.md` 2.30）：

| 现象 | 根因（一句话） |
|---|---|
| 智谱AI 铺了 **12 张卡**，其中 7 条是几乎一样的「GLM-*-Flash 免费模型」 | 折叠键把**落地页**算进去了：`[厂商, url, 优惠文案, 条件, 有效期]`；而智谱的免费模型**一条一个 docs 页**，键全不相同 ⇒ 一条都合不上 |
| 火山引擎 11 张（只合上了 2 条） | 同上：同一份免费额度表被拆成多条，落地页各不相同 |

**改法**：折叠键换成「**同一家公司的同一类优惠 = 一张卡**」——
`(归一厂商, 优惠类型)`，优惠类型是标题去掉厂商名、把型号令牌抹成占位符但**保留品牌词**
（`GLM-4.7-Flash → GLM-*`、`Doubao-语音合成 → Doubao-*`，所以跨厂商永远合不到一块）；
外加一条合并轮，把「同一家公司、同一类免费模型但换了型号品牌」的组并起来
（`GLM-* 免费模型` 与 `CogView-* 免费模型` ⇒ 并；`GLM-* 限时五折` 与 `Batch API 批量调用五折`
品牌词不在打头位置 ⇒ 一律不并）。

**结果**（同一份 `deals.json` 实测，不是估的）：**卡片 62 → 50，覆盖条目仍是 80（一条不丢）**

| 厂商 | 改前 | 改后 |
|---|---|---|
| 智谱AI | 12 张 | **6 张**（7 条免费模型并成 1 张，卡内列 7 个模型名） |
| 火山引擎 | 11 张 | **5 张**（9 条并成 1 张） |
| 百度智能云 | 1 张（17 个模型） | 1 张（不变） |

型号不同 ⇒ 额度往往不同（图像生成 50 张 vs 200 张）。卡片那行文案现在用
「公共前缀只说一遍 + 差异归堆（`（图像生成）50张/200张`）」的写法覆盖全组，
**实测两行装得下才合并**（13px 下实测 56 字），装不下就退回代表条目原文，
**绝不吐一句被裁掉半截的话**；每个型号自己的官方原文留在详情弹层「各型号额度」里。

**门禁（本地同一份产物实跑）**：`verify` **127 项 0 失败** · `verify --compare` **133 项 0 失败** ·
产物自检 0 失败（`折叠无损: 50 张卡片覆盖 80 条优惠`）· `validate` / `validate --strict` / `check:zh` /
`selftest:zh`(9) / `selftest:expiry`(55) 全绿 · `check-mobile-chrome` 零裁切 ·
`check-ci-consistency` 24 项 0 失败。
新增的 §4b 三条断言**当场抓出两个真问题**（认领判据写错、89 字文案确实被 clamp 裁了），
所以它们不是「写完就绿」的装饰。

**上线后又做了一轮独立对抗性复核（2.31）**：一个独立子代理专门去**证伪**这次改动 ——
用破坏性改动验断言是否真会变红、自己写解析器核对产物、构造合并规则反例、真浏览器验收藏/对比/无 JS。
它查出 **9 个真问题**（其中两个是本轮自己引入的：火山那张卡谎称「9 个模型共用额度」、
单条卡的加粗前半句被改没了），逐条修完并再次上线（`f9826fd` + `43eba28`）。详见
`PROJECT_STATUS.md` 2.31；牙齿测试也实跑了（把改动破坏掉，看断言是否变红：4 条断言有牙，
另一条要用「折叠键根本不含厂商」那种版本才验得出）。

**上线（2026-09-27，按你的「推送」）**：推送前先 `fetch` —— 远端没有前进（`origin/master` 仍是
`674c63f`），本分支的基点正是它，于是 **快进**：`git merge --ff-only fix/fold-same-vendor`
（**文件零改动**，只挪 master 指针；主工作区 `git status` 全程干净）→ `git push origin master`
**`674c63f..250ba12`**。两条工作流对 `250ba12` **双双 success**：
[Deploy](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36328609547) ·
[Verify site (gate)](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36328609490)。

**线上实证**（不拿工作流绿灯当结论）：线上首页 **50 张卡**（改前 62）· 折叠卡
`智谱AI 免费模型×7` / `百度千帆 新用户免费额度×17` / `火山方舟 免费额度×9` ·
卡片覆盖条数 **80**（一条不丢）· 智谱AI 只剩 **6 张**（其中「GLM-5.3-Flash 限时五折」标题不以「智谱」开头，
探测按标题前缀只数到 5 张，属探测口径）· 汇总条「显示 50 条卡片 · 国内 30 · 国外 20」· **JS 错误 0**。
并且**线上整链路冒烟跑通了**：`verify --url=<线上>` **127 项 0 失败**（2.29 那次因本机经代理抖动没跑完，
这次一次跑完）。

> 本轮全程在隔离工作树 `.worktrees/fold-same-vendor`（分支 `fix/fold-same-vendor`）里做，
> **没碰主工作区**（当时有另一个会话在跑）——只有最后快进 master 指针那一步是在主工作区执行的，
> 那一步不改任何文件。

---

## 三、分支地图

```
master = origin/master            777e3b7  ← 已上线（2026-09-27）：A/B/收尾 + G11 + 活动期限 + 手机端修复
                                            + 另一会话的采集/门禁收敛 + 2.29（收藏入口 + 「打开对比」修复）
 ├─ 777e3b7   docs: 上线记录 —— 收藏入口 + 「打开对比」修复已推送并复核线上
 ├─ da3b6e1   data(zh): 补 2 条定时采集新进条目的中文译文（DeepBrain AI / AutoDraw）
 ├─ 11d1551   merge: 并回 origin/master 的 8 次定时数据更新（2026-09-24 ~ 09-27，零冲突）
 ├─ 0c7e5aa   docs: 预演分支复跑门禁 + 澄清合并态 JSON-LD 的哈希变化来源
 ├─ f601f37   merge: 把 fix/favorites-entry-and-compare-open 并进 master 线（冲突仅 2 个文档）
 ├─ 882da8d / cfd443b   另一会话：CI 一致性门禁 / 数据契约 / 生成器与文档口径收敛
 ├─ fa2403d   docs: 上线记录（2.28）+ 口径纠正：push 只触发发布，不触发采集
 ├─ ecbc815   fix(mobile): 修掉两个手机端横向问题 + 门禁补 3 条断言   ← 108 项线上冒烟测试打的就是这份（上线当日的记录；线上复测值待复测，见 P0-2）
 ├─ 0d6b869   merge: 并回 origin/master 的 fix/detail-close
 ├─ 71d020a   merge: 并回 origin/master（重写过的 A/B 线 + 数据 + 活动期限三分类）
 ├─ feat/visual-token-layer      874cd6b  A：token 层 / 暗色 / 对比度 / 语义与无障碍
 │   └─ feat/b-extras            ec05252  + 订阅 feed / 纠错入口 / WebSite / 同页锚点
 │       └─ feat/detail-pages    f1213d5  + 每条优惠一个独立静态页（URL 1 → 81）
 │           └─ feat/row-view    7bfc607  + 紧凑行视图（首屏 13 行 / 手机 5.5 屏）
 │               └─ feat/polish  f55e8a9  + 圆角间距收敛与键盘可达
 ├─ feat/favorites-compare       e0cd50d  ← 收藏/对比（c2310d8 实现 + e0cd50d 修 3px）
 ├─ feat/expiry-window           c02e017  ← 活动期限三分类
 ├─ fix/favorites-entry-and-compare-open  875b723  ← 2.29：修「打开对比」+ 收藏列表入口（**已并入 master**）
 ├─ fix/fold-same-vendor         da35d0d  ← 2.30：同一家公司的同类优惠并成一张卡（智谱 12→6 张，**已并入 master**）
 │                                f9826fd  ← 2.31：修掉对抗性复核查出的 9 个问题（**已并入 master**）
 │                                43eba28  ← 2.31：加粗切点回到原文第一个标点（**已并入 master**）
 └─ trial/fav-cmp-merge         0c7e5aa  ← 2.29 的合并预演分支（**已随快进并入 master**）
backup/pre-ab-merge              fb08832  ← A/B 合并前的 master（保险）
backup/pre-origin-merge-b261add  b261add ← 并上游前的 master（保险）
```

> **2.30 / 2.31 是在隔离工作树里做的**：`.worktrees/fold-same-vendor`（`.gitignore` 已覆盖
> `.worktrees/`，不会进主仓库索引）。当时主工作区有另一个会话在跑采集，所以没有在主工作区里改任何文件。
> 已按你的「推送」**快进并入 `master` 并推上去了**：2.30 = `674c63f..250ba12`，
> 2.31（复核修复）= `6554e26..43eba28`，四次工作流全 success。
> 要复核：`git -C ".worktrees/fold-same-vendor" log --oneline -6`，或
> `cd .worktrees/fold-same-vendor && npm run build && npm run verify`（还在，随时能复跑）。

> **现在本地与上游完全一致**（`git status -sb` 无 ahead/behind）。要回退**已上线的**东西，
> 不要 `reset`（历史已经推出去了），用 `git revert -m 1 <merge>` 或直接 revert 单个提交。
> 两个 backup tag 只对「本地还想回到某个旧状态」有用，且它们都没推送过。
