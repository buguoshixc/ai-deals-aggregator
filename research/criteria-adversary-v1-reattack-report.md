# `criteria-adversary-v1-reattack`（t11）：对 t9/t10 修复后的判据再攻击

> 被攻击对象：**t9（PR #89，已并入 master `70d7463`）+ t10（`origin/judge-hardening-v1b`，head `ff52d2b`）的整合树**
> （本轮在自己的工作树里 `git merge` 成 `d12005e`，**只读产品**；两个修复分支都未合并到 master）
> 装置：t5 的 `.arch-v1/`（11 份副本 + 注入器 + 探针）**原样复用**，另加 15 条新形态与 6 个登记表沙箱 → 共 **24 次门禁实跑**
> 交付：本报告 + `-self-audit.md` + `research/_raw/registry-adversary-v1/{reattack-copies,reattack-extra}.json` + `reattack-README.md`

---

## 0. TL;DR

| # | 结论 | 读数 |
| --- | --- | --- |
| 1 | **基线**：整合树干净跑 | `verify-site` **881/0**（t5 的基点 874；t9 +1）· `verify:seo` **19/0**（t5 11）· dist 全树 `df43587c…` / 304 文件 |
| 2 | **9 条破防：9/9 全部闭合** | 每条都有「现在红」的独立读数（§2），且 **修完的判定与「真删对照」同解**（forge 与 forge-ctl 的失败项逐个同名） |
| 3 | **守住面 15 条：15/15 仍绿**（无回归） | §3 逐条；两条设计内「本来就是红」（G2/G3）也仍然红 |
| 4 | **未覆盖 6 条 + 假红 1 条** | 1 闭合（R5b）· 1 修好（R9 假红）· 1 部分闭合（A1）· 3 仍未覆盖（R10 / V6 / V8）· 1 设计内（V10）——见 §4 |
| 5 | **§7 最省绕过前 3 名：3/3 已闭合** | `70CH`/`MAX-WIDTH:`（三页全红）· 逗号借登记（红）· `width:300px` 覆盖生效宽（新断言：**比值 0.644** 红） |
| 6 | **新增 15 条形态 + 6 个沙箱：2 条新破防 · 1 条新未覆盖 · 12 条守住** | 破防：**N14 裁切祖先（零码）** · **N8/N9 冻结串判据级仍可伪造**；未覆盖：N19 `<noscript><style>` 盲区；另 **N15 暴露两判据不一致**（§6） |
| 7 | **产品零改动** | 注入前后 `dist/` 全树摘要**同一串** `df43587c…`（304 文件）· `git status --porcelain` 空 · 每个副本「意外变更 0 / 丢失 0」 |
| 8 | **没有「为了闭合而改松判据」的迹象** | 反而是 t9 的**两次收紧**把 t5 的两条「守住面」里的灰区补上了（生效宽比值 / 幽灵条目）；我复核了它们**没有把真形态误判成红**（§4.2、§7） |

---

## 1. 判定总表（24 次门禁实跑）

| 副本 | 形态 | 失败项 | 判定 |
| --- | --- | ---: | --- |
| `base` | 干净基线 | **0** / 881 | 控件 |
| `att` | t5 原 24 条 | 15 | 见 §2/§3 逐条 |
| `att2` | VA8b + VA5b | 4 | V8 仍未覆盖；VA5b 仍由样本档接住 |
| `g19` | G19 容差内 + RA1b 逗号字面例 | 4 | §19 几何绿（唯一红是 RA1b 的未登记） |
| `g21` | G21 容差外 | 2 | 仍红（设计如此） |
| `g300` | `width: 300px` | 1 | **R5b 闭合**：「生效宽 300px ÷ 465.75px = 0.644（容差 0.8–1.2）」 |
| `g1400` | `min-width: 1400px` | 3 | 仍红（设计如此） |
| `grtl` / `gxf` | 祖先 rtl / 祖先 transform | 0 / 0 | 仍不误报 |
| `forge` | F1 冻结串进注释 + F2 sitemap 进注释 | 5 | **F1/F2 闭合** |
| `forge-ctl` | 同上但真删（对照） | 5 | **失败项与 forge 逐个同名** ⇒ 同解 |
| `forge3` | F3 canonical 进注释 | 2 | **F3 闭合**（+ `verify:seo` 19/1） |
| `newa` | N1–N7 登记表等价变形 | 4 | 6 页未登记（含反序逗号 / `:is()` / 大小写取值）；**N5 形态无效**（§7.1） |
| `newb` | N8/N9 冻结串包进永不生效的 at-rule | 9 | **判据级仍可伪造**（红是变异电池连带，§6.2） |
| `newc` | N10 已登记规则包进 `@media not all` | 3 | 守住（几何 + 比值 2.91 + 隔离牙） |
| `newd` | N12 `max-height`+`clip` / N13 只看 `overflow-x` | 4 | 守住（10 条 `note-clipped`，含竖直溢出 px 数） |
| `newd2` | **N14 裁切祖先**（8px 高 + `overflow:hidden` 的父盒） | **0** / 881 | **新破防**（§6.1） |
| `newe` | N15 sitemap 未闭合注释 + N16 canonical 进 `<template>` | 2 | N16 红；N15 **两判据不一致**（§6.3） |
| `newf` | N11 行内 `style` 顶掉已登记声明 | 1 | 守住（比值 0.644） |
| `newg` | N17 合法注释位 / N18 三层嵌套 / N19 `<noscript>` | 4 | N17/N18 红；**N19 零码**（§6.4） |
| `sb-empty` / `sb-two` / `sb-ghost` / `sb-second` / `sb-routes` | 登记表沙箱（5 种） | 5 / 3 / 2 / 1 / 6 | R11 两半闭合 + 幽灵 + routes 写错均红 |

---

## 2. 9 条破防逐条判定：**9/9 闭合**

每条都给出「最小形态 ▸ 现在的读数 ▸ 是哪一次修复钉住的」。

| # | t5 破防 | 最小形态（逐字） | 现在红吗（读数出处） | 由哪次修复钉住 |
| --- | --- | --- | --- | --- |
| 1 | **R2-comma-borrow** | `.pnote, .pdetailbody { max-width: 72ch; }` @ `need/ai-coding/` | **红**：`att` 的「未登记窄列页」**全清单**（把判据的 `slice(0,4)` 临时改 200 的沙箱副本 `sb-list-att`）含 `need/ai-coding/`，4 个视口档逐条 `narrow-unregistered` | t9 ②「逗号多选择器**逐段**都要有登记」 |
| 2 | **R3-comment-eats-rule** | `.arch-decoy::before { content: "/*"; } .pnote { max-width: 70ch; } /* arch-end */` @ `student/` | **红**：全清单含 `student/`（t5 时该页 0 码） | t9 ③ 字符串感知 `stripCssComments()` |
| 3 | **R4-case-CH** | `.pnote { max-width: 70CH; }` @ `need/free-tier/` ＋ 可见版 `.page-notes-summary { max-width: 70CH; }` @ `vendor/openai/` | **红**：全清单同时含这两页 | t9 ② 单位正则加 `i` |
| 4 | **R5-case-property** | `.pnote { MAX-WIDTH: 70ch; }` @ `need/free-tokens/` | **红**：全清单含 `need/free-tokens/` | t9 ② `property.toLowerCase()` |
| 5 | **R11-second-entry** | 沙箱 `entries = [.pdetailbody(72ch), .page-notes-summary(70ch)@need/ai-coding/, .ghost-nowhere(65ch)]` + 产物真写入未居中的 `.page-notes-summary` | **红 3 条**：`§19 第 2/3 条 …左 0px / 右 913.66px`（未居中）· `第 3/3 条 .ghost-nowhere：页面上找不到 ⇒ 幽灵登记条目` · `第 3/3 条 生效宽：量不到现场换算值` | t9 ④ §19 **逐条**遍历 + 幽灵条目 + 生效宽比值 |
| 6 | **V3-single-column-clip** | `.snote { writing-mode: vertical-rl; width:100%; height:5.6rem; overflow:hidden; white-space:nowrap }` @ `need/dev-credits/` | **红**：`need/dev-credits/#0 [note-clipped]`（沙箱全量条级码；t5 时该页**整页零码**） | t9 ⑤ `note-clipped` 增**竖直**分支 |
| 7 | **F1-frozen-comment** | 真规则换成**同一串**的 CSS 注释 @ `need/free-api/` | **红**：`forge` 副本里 `§22c 冻结串「一处定义、全站生效」` **✗**（t5 时该判据 ✓ 被骗过） | t9 ① 冻结串计数前剥 CSS 注释 |
| 8 | **F2-sitemap-comment** | `sitemap.xml` 里 `vendor/zhipu/` 的整个 `<url>` 块包进 `<!-- -->` | **红**：`厂商落地页 /vendor/zhipu/ 的 sitemap 成员资格` ✗ · `/vendor/ 枢纽列出 24 个厂商入口` ✗ · `verify:seo` **19/2**；**与真删对照 `forge-ctl` 的 5 个失败项逐个同名** | t9 ① XML 注释剥除 ×2 + t10 `seo.stripComments()` |
| 9 | **F3-canonical-comment** | `<link rel="canonical" …>` 用 HTML 注释包起来 @ `need/student-only/` | **红**：`verify-site` `别名页 /need/student-only/ canonical 自指` ✗ + 组合检查 ✗；`verify:seo` **19/1**；真删对照 `forge3-ctl` 同解 | t10 `stripComments` + verify-site 的 DOM 判据 |

**「同解」这一条是硬证据**：`forge` 与 `forge-ctl`（真删）的 5 个失败项**名字全同**；`forge3` 与 `forge3-ctl` 的 2 个失败项也全同 ⇒ 伪造与真删现在**走同一条红路**（t5 时伪造侧是假绿）。

---

## 3. 守住面 15 条：**15/15 无回归**

| t5 守住面 | 现在 | 读数 |
| --- | --- | --- |
| R1 `entries: []` | **仍红** | `sb-empty` 5 条：4 个视口档 `narrow-unregistered`（`plans/coding/`）+ `M16 承重证明` |
| R6 `@media` 内 ch 窄列 | 仍红 | `need/china-usable/`（全清单） |
| R7 注释 + `@supports` 混排 | 仍红 | `need/edu-identity/` |
| R8 未登记声明 + `!important` | 仍红 | `free-api/` |
| V1 `sideways-rl` / V2 `vertical-lr` | 仍红 | `att` 汇总：`note-ink-narrow 36 条 / 6 页`、`竖排 47 条`（其中按列判 41） |
| V4 列栈铺满列宽 | 仍红 | `docs/data/#0–#2 [note-clipped, note-intro-long]` + `#3–#8 [note-ink-narrow]` |
| V5 只在 760 生效 | 仍红 | `@760/@360 样本集` 命中 `status/` |
| V7 祖先 `writing-mode` | 仍红 | `plans/api/#0–#4 [note-narrow, note-ink-narrow, note-axis, …]` |
| V9 `scaleX` 家族 | 仍红 | `changes/` 横向溢出 + `[note-ink-narrow, note-axis, …]` |
| G1 容差内 0.95px | 仍绿（不误报） | `g19`：§19 几何无失败（唯一红是 RA1b 逗号字面例，属另一条形态） |
| G2 容差外 1.05px | 仍红（设计如此） | `g21`：`左 446.67 / 右 444.58`（差 2.09 > 2）+ 隔离牙 |
| G3 `min-width: 1400px` | 仍红（设计如此） | `g1400`：`1400px / 容器 1401px` + 比值 3.006 + 隔离牙 |
| G4 祖先 `direction: rtl` | 仍绿（不误报） | `grtl` **0 失败** |
| G5 祖先 `transform: scaleX(0.9)` | 仍绿（不误报） | `gxf` **0 失败** |
| RA10 `!important` 加在**已登记**声明上（t5 的假红） | 已修 | `att` 副本 `plans/coding/` 不在未登记清单、§19 无失败 |

---

## 4. 未覆盖 6 条 + 假红 1 条的更新判定

| t5 条目 | 本轮判定 | 读数 |
| --- | --- | --- |
| `R5b-px-effective-width`（未覆盖） | **已闭合** | `g300`：`§19 … 生效宽 300px ÷ 现场 465.75px = 比值 0.644（容差 0.8–1.2）` ✗（这是 t9 新增的第 4 条 §19 断言） |
| `R9-important-registered`（假红） | **已修** | 同上：`plans/coding/` 无失败 ⇒ 剥 `!important` 后按已登记算命中 |
| `R10-inline-style-px`（未覆盖） | **仍未覆盖**（保持声明） | `att` 全清单**不含** `category/chat/` ⇒ 行内 `style=` 仍不在扫描面（清单 `scanScope` 已声明只覆盖内联 `<style>` 规则块）；但**已登记元素被行内 style 顶掉**这一半由 N11 闭合（§6.5） |
| `V6-viewport-gap`（未覆盖） | **仍未覆盖** | 档位仍是「1440/1600 全站 + 760/360 样本集 29 页」；`att2` 的 VA5b 仍靠样本档接住（扩档是 t22 的任务） |
| `V8-axis-desync`（未覆盖） | **仍未覆盖** | `att2`（VA8b）4 条红全部来自 ① 的 `note-narrow`；② 的轴仍可被后代 `writing-mode` desync |
| `V10-vertical-false-red-band`（未覆盖） | **设计内，未变** | 竖排 < 366 字一律红 —— 与 t5 判定一致（不该加豁免） |
| `A1-raw-text-decision-sites`（未覆盖） | **部分闭合** | 三条实测伪造面（冻结串 / sitemap / canonical）已闭合（§2 #7–#9）；t9 ⑥ 把 `sharedFooterExternalHrefs` 改成读 `--dir`；**其余静态判定项本轮仍未逐条造副本实跑**（如实） |

---

## 5. §7「最省绕过路径」前 3 名复跑

| 排名 | 路径 | t5 成本 | 本轮判定 | 读数 |
| --- | --- | --- | --- | --- |
| 1 | `max-width: 70CH`（或 `MAX-WIDTH:`） | **2 个字符** | **已闭合** | 三页同时红：`need/free-tier/` · `need/free-tokens/` · `vendor/openai/`（全清单） |
| 2 | `.pnote, .pdetailbody { max-width: 72ch }` | **一个逗号** | **已闭合** | `need/ai-coding/` 红；反序（N1）与 `:is()`（N2）两种变体也红 |
| 3 | `width: 300px` 覆盖生效宽（声明文本不动） | 一个单位 | **已闭合** | `g300` 比值 0.644 ✗；行内 `style=` 版本（N11）同样红 |
| 4 | 竖排 + `nowrap` + `overflow:hidden` | 3 个声明 | 已闭合 | `need/dev-credits/#0 [note-clipped]` |
| 5 | `@media (901–1439px)` 等未量测档 | 一个 `@media` | **仍未覆盖** | 同 V6 |
| 6 | 把 `<loc>`/`canonical`/冻结串写进注释 | 4 个字符 | 已闭合 | §2 #7–#9 |
| 7 | 新增登记条目 `entries[1]`（不居中）/ 幽灵条目 | 一次 JSON 编辑 | 已闭合 | `sb-second` 1 条红 · `sb-ghost` 2 条红 |

---

## 6. 新破防（对修复引入的新代码路径）

**新增 15 条形态 + 6 个沙箱运行**（形态定义在 `.arch-v1/forms5–10.json`，可复跑）。

### 6.1 **N14 裁切祖先 —— 零码（新破防，高）**
形态：`<div class="arch-clip" style="display:block; height:8px; overflow:hidden;">` 包住 `plans/api/` 的 5 条 `.snote`。
读数：**`newd2` = 881 项 / 失败 0**；探针：说明自身 `box 1380×20.39 · client 1380×20 · scroll 1380×20`（**自身没有任何裁切**），父盒子 `div.arch-clip` 只有 8px 高 ⇒ 视觉上被裁掉约 60%，判据**一条都不响**。
性质：与 t5 的 V8 同类（「裁切/轴可以从祖先来」），t9 只补了**自身**的竖直分支。修法方向（不在本任务写作用域）：`note-clipped` 的竖直/横向测量应加上「最近的裁切祖先」（`overflow != visible` 且 `clientHeight < scrollHeight`）。

### 6.2 **N8/N9 冻结串：判据级仍可伪造（新破防，中）**
形态：把真规则（同一串文本）包进 `@media not all { … }`（N8 @ `need/free-api/`）或 `@supports (display: bogus-xyz-arch) { … }`（N9 @ `need/student-only/`）。
读数：`newb` **失败 9 条，但 `§22c 冻结串「一处定义、全站生效」` 不在其中**（文本计数仍是 1 ⇒ 判据自己沉默）；红全部来自**变异电池的连带**：`M6 正对照`（拿掉 `overflow-wrap` 后 200 字符不可断串在 @390 溢出 1312px）+ `M1/M8/M10/M12/M15` 的「变异后复测」与「承重证明」。
探针证明形态**真的落地**：`.snote` 计算样式 `12px / 20.4px / 盒高 40.78px`（基线）→ **`14px / 21px / 42px`**。
结论：这条承诺仍是「按文本计数」，不是「按生效」；本轮之所以红，是**别的判据的副作用**（t5 对 F1 的闭合判据写的就是「不许靠 M15 副作用」，这条新变体正好落在同一类灰区）。

### 6.3 **N15 sitemap 未闭合注释：两个判据不一致（新发现，中）**
形态：`sitemap.xml` 里把 `vendor/zhipu/` 的 `<url>` 块换成 `<!-- <url> … </url>`（**不闭合**，整份 XML 从此不合法）。
读数：`verify:seo` **红**（`sitemap 成员 == 非 noindex 页面的集合`：漏 `archive/,changes/,deal/…`）；但 `verify-site` 的 `§18 厂商落地页 /vendor/zhipu/ 的 sitemap 成员资格` **说「sitemap 有」**（假绿）。
机制：verify-site 侧读的是「有没有 `<loc>` 这段文本」，未闭合注释不满足 `<!--…-->` 的剥除正则 ⇒ 文本还在 ⇒ 判「有」；真正解析 XML 的那一侧（seo）看到 0 个 URL ⇒ 红。
结论：**出货链整体仍是红**（两条判据里有一条接住），但 verify-site 侧的成员资格判据单独看**仍可被畸形注释骗过** ⇒ 记为新破防（低-中），修法 = 与 t10 同源，把 `<loc>` 提取走 `seo.stripComments()` 之外还应做一次「注释配对检查」（`<!--` 与 `-->` 数量不等 ⇒ 直接红）。

### 6.4 **N19 `<noscript><style>` 里的 ch 窄列：零码（新未覆盖，低）**
形态：`<noscript><style>.pnote { max-width: 70ch; }</style></noscript>`（`developer/`）。
读数：`newg` 的未登记清单只有 `feeds/`（N18）与 `status/`（N17），**`developer/` 不在**。
性质：有 JS 的浏览器里 `<noscript>` 内容是**文本**（DOM 里没有那个 `<style>`），无 JS 的读者却真的会看到窄列 ⇒ 扫描面（内联 `<style>` 规则块）在这一点上是盲区。低危（只影响无 JS 渲染），但要登记进清单的 `scanScope`。

### 6.5 其余新形态：守住（12 条）
- **N1** 反序逗号 `.pdetailbody, .pnote`（`need/free-model/`）✗红 · **N2** `:is(.pdetailbody, .pnote)` ✗红 · **N3** `max-width : 70ch`（冒号前空格）✗红 · **N4** 声明被换行拆开 ✗红 · **N6** 注释夹在选择器与 `{` 之间 ✗红 · **N7** 已登记选择器 + 大小写变形的**不同取值**（`MAX-WIDTH: 70CH`）✗红
- **N10** 已登记规则包进 `@media not all` ✗红 3 条（几何 `1356px` + 比值 **2.91** + 隔离牙） · **N11** 行内 `style="max-width:300px"` 顶掉已登记声明 ✗红（比值 **0.644**）
- **N12** 竖排 `max-height`+`overflow:clip` ✗红（`status/#0–#1`，竖直溢出上千 px） · **N13** 竖排 `overflow-x:hidden`（y 仍 visible）✗红（`feeds/#0–#7`，如 `scrollHeight 1041 > clientHeight 90`）
- **N16** canonical 挪进 `<template>` ✗红（DOM 判据 + 组合检查） · **N17** 注释放在**值**前（合法位置）✗红（`status/`） · **N18** `@layer → @supports → @media` 三层嵌套 ✗红（`feeds/`）
- 沙箱：**幽灵条目** `sb-ghost` 2 条红 · **routes 写错**（元素在别的路由）`sb-routes` 6 条红（「页面上找不到 ⇒ 幽灵登记条目」+「量不到现场换算值」）

---

## 7. 方法读数（我自己踩到的坑，值得进下一轮的手册）

### 7.1 **N5（注释夹在属性名里）是无效形态，不是破防**
形态 `.pnote { max-/*x*/width: 70ch; }` —— 看起来像 CSS 合法写法，**实际不是**：注释把标识符切成 `max-` 与 `width` 两个 token ⇒ 声明被浏览器丢弃。
证据：探针 `maxWidth = none · 盒 1380px`（与基线逐字相同）⇒ 形态**没有落地**，所以「判据没报」既不是破防也不是盲区。
**教训（与 t5 的「判据读的字段必须真的在几何里」并列）**：**注入必须真的落在布局上**——凡是要说「判据沉默」的形态，必须先有探针证明「形态生效」。

### 7.2 **N14 的第一版也是无效形态**
第一版父盒子 `height: 24px` > 说明高 `20.39px` ⇒ 根本没裁到，`newd` 第一跑是 881/0。把高度改成 8px 之后才得到真正的零码读数。**同一条教训**：先证形态落地，再谈判据。

### 7.3 **判据的点名列表被截到前 4 条**
`verify-site.js` 的 `narrowUnregisteredPages.slice(0, 4)` 与 `bad.slice(0, 4)` 让 JSON 里只能看到 4 页/4 条 ⇒ 逐形态归因做不全。处置：**把判据复制到沙箱**（`sb-list-att` / `sb-list-newa` / `sb-list2`）把 `4` 改成 `200` 再跑一次 —— 产品零改动，`att` 的 9 页与 `newa` 的 6 页清单因此才拿得到（`reattack-copies.json` 的 `unregisteredPagesFull`）。

### 7.4 探针在 `.pdetailbody` 上量不到
`plans/coding/` 的 `.pdetailbody` 在未展开的 `<details>`/`<template>` 里 ⇒ 探针拿到 `found=true` 但没有任何几何字段。N10/N11 的生效宽读数因此**引用门禁自己给出的数字**（`1356px` / `300px` ÷ `465.75px`），探针未复现这一处。

---

## 8. 产品零改动证明

| 项 | 读数 |
| --- | --- |
| 整合树 `dist/` 全树摘要（注入前 / 全部注入完成后） | `df43587cfe90a60453e29df96599b138a8dd02242130968340cba589e6979675` / **同一串** · 304 文件 |
| 基线副本 `dist-base` | 由 `dist/` 整树复制（注入器自检 `copyByteIdentical: true`） |
| 每个副本的注入面 | 注入器逐副本断言「每条形态只改 1 个文件」：`意外变更 0 / 丢失 0`（`reattack-extra.json` 的 `productDigests.perCopy`） |
| `git status --porcelain`（工作树） | **空**（`scripts/**`、`dist/**`、`docs/**` 零改动；本轮只新增 `research/**`） |
| 沙箱 | `sb-*` 全是**副本**（scripts/ + dist/），登记表改动只发生在副本里 |
| 临时判据副本 | `sb-list*` 只改**副本**里 verify-site.js 的两个 `slice(0, 4)`；产品文件字节未动 |

---

## 9. 从零复跑

```bash
cd .worktrees/criteria-adversary-v1-reattack     # 基于 origin/master 70d7463（含 t9/PR #89）
git merge origin/judge-hardening-v1b             # t10（head ff52d2b）→ d12005e
npm ci && node scripts/tools/build-local.js      # dist/ 304 文件
node .arch-v1/tree-sha.cjs dist .arch-v1/sha/dist.json          # df43587c…

# ① 基线 + 原 36 条形态（12 次门禁）
node scripts/tools/verify-site.js --dir=.arch-v1/dist-base --json=.arch-v1/json/base.json      # 881/0
node .arch-v1/inject.cjs --src=.arch-v1/dist-base --dst=.arch-v1/dist-att  --forms=.arch-v1/forms.json  --manifest=.arch-v1/att-manifest.json
node scripts/tools/verify-site.js --dir=.arch-v1/dist-att  --json=.arch-v1/json/att.json        # 15 失败
#   … att2 / g19 / g21 / g300 / g1400 / grtl / gxf / forge / forge-ctl / forge3 同 §1.3 的命令块
node .arch-v1/mk-forge3.cjs
node scripts/tools/seo-verify.js --dir=.arch-v1/dist-forge      # 19/2（t5 时 11/0）
node scripts/tools/seo-verify.js --dir=.arch-v1/dist-forge3     # 19/1（t5 时 11/0）

# ② 完整点名列表（判据副本，产品零改动）
node .arch-v1/mk-sb-list.cjs --root=.arch-v1/sb-list-att --dist=.arch-v1/dist-att
cd .arch-v1/sb-list-att && node scripts/tools/verify-site.js --dir=dist --json=../json/list-att.json

# ③ 登记表沙箱（5 种）
node .arch-v1/make-sandbox.cjs --root=.arch-v1/sb-empty  --mode=empty
node .arch-v1/make-sandbox.cjs --root=.arch-v1/sb-two    --mode=two --injectRoute=need/ai-coding/ --injectCss=".page-notes-summary { max-width: 70ch; }"
node .arch-v1/make-sandbox.cjs --root=.arch-v1/sb-ghost  --mode=ghost
node .arch-v1/make-sandbox.cjs --root=.arch-v1/sb-second --mode=second --injectRoute=need/ai-coding/ --injectCss=".page-notes-summary { max-width: 70ch; }"
node .arch-v1/make-sandbox.cjs --root=.arch-v1/sb-routes --mode=two --injectRoute=need/ai-coding/ --injectCss=".page-notes-summary { max-width: 70ch; }"   # 再把 routes 改成 plans/coding/
#   （sb-* 里跑：cd .arch-v1/sb-X && node scripts/tools/verify-site.js --dir=dist --json=../json/sb-X.json）

# ④ 新一轮 15 条形态（6 份副本）
node .arch-v1/mk-new-forms.cjs && node .arch-v1/mk-new-forms2.cjs
node .arch-v1/inject.cjs --src=.arch-v1/dist-base --dst=.arch-v1/dist-newa --forms=.arch-v1/forms5.json --manifest=.arch-v1/manifest-newa.json
#   … newb/newc/newd/newd2/newf/newg（--only= 见 manifest）
node .arch-v1/probe.cjs --dist=.arch-v1/dist-newa --plan=.arch-v1/probe-plan-t11-newa.json --out=.arch-v1/probe/t11-newa.json
#   … probe-plan-t11-{frozen,registered,inline,clip}.json

# ⑤ 证据再生
node .arch-v1/mk-reattack-evidence.cjs && npm run check:evidence
```

---

## 10. 我**没有**证明的东西

1. **没在 CI runner 上跑**：全部读数来自本机（Windows + Edge，与门禁同一个 `playwright-core`）；跨平台字体渲染差异不在本轮射程。
2. **N19 的「无 JS 读者真的看到窄列」没有实测**：只证明了判据沉默（有 JS 的上下文里 `<noscript>` 内容不是 DOM）。要坐实需要禁用 JS 的浏览器上下文。
3. **N14 只在一页一个高度上实测**（`plans/api/` + 8px 祖先）；没有穷举全站是否存在别的「裁切祖先」路径（产品里 0 处，是本轮注入造出来的）。
4. **A1 的静态判定项**与本轮未覆盖的 `R10`/`V6`/`V8` 一样，只有代码路径判定或往轮读数，没有各造副本实跑。
5. **`.pdetailbody` 的探针重建失败**（§7.4）⇒ N10/N11 的几何数字引用门禁自报值，未做第二来源复现。
6. **没有验 CI 门禁本身**（本轮跑的是判据本体；CI 侧 `check:ci` 39 项与 Full Gate 由其它任务负责）。
7. **`verify:seo` 的失败项文本只取了摘要**：`forge`/`forge-ctl` 的「失败项逐个同名」是在 verify-site 侧取的；seo 侧只核了项数与首行（对照 t10 报告的三段读数）。

---

## 11. 给 captain 的收口建议（不是承诺）

- **N14（裁切祖先）建议开一个小任务**：`note-clipped` 增「最近的裁切祖先」测量（横向与竖直各一条），闭合判据 = `newd2` 那条形态必须红、且 `grtl/gxf/g19` 三条不误报。
- **N15（未闭合注释）建议并进 t10 的后续**：`<!--` 与 `-->` 计数不等 ⇒ 直接红（成本一行）。
- **N8/N9（冻结串按文本计数）**：要么登记成已知边界（「冻结串判据只管文本存在性，生效性由变异电池兜」），要么给冻结串加一条「生效断言」（比对 `.snote` 的计算字号/行高）。
- **N19 + `scanScope`**：把「`<noscript>` 内的 `<style>`」「行内 `style=`」「未量测档位」一起写进清单的已知边界（前两条已在清单里，第三条随 V6）。
- **t5 的 V10 不要动**（与 t5 的判断一致：加豁免会开出新的免判面）。
