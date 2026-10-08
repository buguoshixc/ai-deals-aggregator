# `judge-calibration-v1` · 判据校准与作用域普查（**只读探针**，不改判据源）

> 基点：`e455b3a`（本轮建立工作树时的 `origin/master`；工作期间 master 被队友推进到 `95dfeb99`，
> 本轮所量的四段代码在两版之间**逐字节相同** —— 见 [`_raw/judge-calibration-v1/source-unchanged.json`](_raw/judge-calibration-v1/source-unchanged.json)）
> 工作树：`.worktrees/judge-calibration-v1`（分支 `docs/judge-calibration-v1-readings`）
> 装置与原始读数：`.arch-v1/`（Tier-3，gitignore）· 入库证据：[`_raw/judge-calibration-v1/`](_raw/judge-calibration-v1/)
> **纪律**：`verify-site.js` / `build-local.js` / `scripts/data/*.json` **一字未改**；
> 所有变形只作用于 `dist` 的**副本**（`dist.calib*`）。

---

## 0. 四条裁定（先说结论）

| # | 量 | 现场读数 | 裁定 |
| --- | --- | --- | --- |
| T1 | px/rem 窄阅读列 | **0 条**（全站 186 页；26 条 px/rem 宽度声明里，只有 `.detail-main` 的 3 个实例「比容器窄且承载文本」，而它是**页面内容列**、已由 §22b 承担） | **不加**：登记制保持 ch-only；把「扫描面之外还有哪些样式入口」写清楚（本报告 §1.5） |
| T2 | §19 居中容差 `centeringTolerancePx = 2` | 位移 **1px 仍绿**（\|左−右\| = 2.0 ≤ 2）、位移 **2px 变红**（\|左−右\| = 4.0 > 2） | **维持 2px**：它等价于「居中偏差 ≤ 1px」。过松/过紧的风险见 §2.4 |
| T3 | §22c 竖排轴阈值 `WIDE_NOTE_RATIO = 0.85` | 0.5 的命中集合 ⊆ 0.85；**判别区 = [0.5, 0.85)**：`synth/h-mc3-auto/`（66.1%，正是判据注释自己点名的目标形态）与 `synth/v-h12/`（64.7%）在 0.85 下咬中、在 0.5 下放行 | **0.85 站得住**；不要降到 0.5。注释里「0.85 与 0.5 命中集合完全相同」只在当年那三个集合上成立（见 §3.4） |
| T4 | 横排 `column-gap` 细分 | 现场 **0 个** multicol/column-* 样本；最小复现：gap 0 / 1 / 8px 的单元数都是 **4**、最宽单元 **1374 / 1374.5 / 1378px**（≈ 满宽）⇒ 两档阈值都不咬 | **不影响** ② 的前置条件（`inkCount ≥ 2`）：极小 gap 不会把「一个视觉列」切成两个**窄**单元 |

---

## 1. T1 · px/rem 窄列全站普查

### 1.1 口径（与 §22c 同款，只换单位过滤）

判据侧的扫描器是 `verify-site.js` 的 `narrowChDeclarations()`：

```
先剥 CSS 注释 → 扁平规则正则 /([^{}]{1,200})\{([^{}]*)\}/g
→ 属性 ∈ {max-width, inline-size, width} → 值里含 \d+(\.\d+)?ch ⇒ 「ch 窄列」
→ 命中登记清单（selector + 归一声明文本）才算已登记
```

本轮把最后的单位过滤换成 `px|rem`，**判据语义与扫描面一字不动**（`_raw/judge-calibration-v1/px-rem-census.json` 的
`ruleSemantics` 里逐字记着这两条）。

### 1.2 扫了什么

| 维度 | 读数 |
| --- | --- |
| 页面 | **186**（产物目录里全部 `index.html`；含 3 个 noindex 别名） |
| 内联 `<style>` 块 | **291** |
| 扫描的样式字符数 | **11,187,224** |
| 得到的 px/rem 去重声明 | **26**（全部来自扁平扫描；@media-only 的 px/rem 声明 **0**） |
| 匹配到的元素实例 | **104** |
| 其中承载可见文本的 | **30** |
| 其中「比父容器内容盒窄 ≥ 40px」的候选 | **3** |

### 1.3 26 条声明的归类（实测盒宽 / 容器宽）

| 类别 | 代表声明 | 实例数 | 盒宽 → 容器宽 | 是不是阅读列 |
| --- | --- | --- | --- | --- |
| 布局容器 | `.wrap/.topin/.needs/.facetsin/.cmpin { max-width: 1420px }` | 12+1+1+1+1 | 1380 → 1380（满宽） | 否 |
| 控件 | `.search { max-width: 440px }` · `.cmpchip { max-width: 210px }` | 1 / 0 | 440 / — | 否 |
| 图标与装饰 | `.lg/.dh .lg/.g .fav/.g .tiernum/.r .rnum/.mark/.of .bar/.page-notes-chevron/.fsep` | 12+3+11+8+8+12+3+12 | 16–48px | 否（零文本） |
| 表格列宽 | `.cmptable tbody th { width: 88px / 68px }` | 0（本档未命中） | — | 否 |
| 弹层 | `.dlg/.cmpdlg { width: min(680/920px, calc(100vw - 40px)) }` | 2 / 0 | — | 否 |
| **页面内容列** | **`.detail-main { width: min(1120px, 100%) }`** | **3** | **1120 → 1380** | **否**（见下） |

三个候选的实测（`deal/017bdbc04e70/`、`deal/0273d8b23412/`、`deal/0c30d79a5016/`）：

```
tag=main  class=detail-main  inMain=true  boxWidth=1120  parentContentBox=1380
computedWidth=1120px  computedMaxWidth=none  textLength=809–893
```

**裁定**：它是**叶子详情页的页面内容列**，不是 S4 意义上的「阅读列」（它没有把长文压进一个阅读度量，
也没有 `ch` 这类阅读单位）；`§22b` 早就有针对它的断言（居中偏差 ≤ 8px、列宽 ∈ [1080,1120]），
登记清单的 `scanScope` 也明确把它排除在射程外。**因此不登记、不扩口径。**

### 1.4 ch 侧交叉核对

全站 ch 窄列声明**恰好 1 条**：`plans/coding/` 的 `.pdetailbody { max-width: 72ch }` —— 与登记清单
`entries` 完全一致。这证明扫描面确实覆盖了判据自己看得见的那些规则（不是「扫了个空集还说 0 条」）。

### 1.5 为什么这个口径不会漏（三个额外入口逐个量过）

| 入口 | 读数 | 结论 |
| --- | --- | --- |
| 外部样式表 `<link rel=stylesheet>` | 产物里**只有 1 个** `.css`：`logos.css`（9,811 B），px 宽度声明 **2 条**（`.lg[data-logo="siliconflow"] { width: 48px }` 与 `:hover { width: 54px }`） | 都是 logo 尺寸，不是阅读列 |
| 行内 `style=""` 属性 | 共 61 个，其中带 width 的 **52** 个：49×`width:24px`、1×48px、1×105px（外加 1 个是脚本字符串里的假阳性） | 全是 logo 标记 `<span>`，零承载文本 |
| `@media` 内的规则 | 扁平正则读不了 @media 内部（prelude 会被当成选择器）——**§22c 自己也是这个盲区**；本轮用 brace-aware 解析补扫，**@media-only 的 px/rem 声明 = 0** | 盲区在本轮没有藏东西 |

> 结论句：**px/rem 口径下的窄阅读列 = 0 条**。按「0 条也是有效读数」的要求，上面写清了
> 用什么口径扫的（§1.1）、扫了哪些（§1.2 + §1.5）、为什么不会漏（§1.4 的 ch 交叉核对 + §1.5 的三个入口）。

---

## 2. T2 · §19 居中容差（2px）敏感性标定

### 2.1 判据原文（`verify-site.js` §19）

```
centeredOk = measured.bodyWidth < measured.cellWidth - 40
          && |measured.leftInset - measured.rightInset| <= tol      // tol = centeringTolerancePx = 2
          && measured.scrollWidth <= measured.clientWidth + WIDE_TOL
```

`leftInset / rightInset` 是 `.pdetailbody` 的 border-box 相对**单元格内容盒**左右边界的距离。
**关键换算**：盒相对中心位移 d px ⇒ 左 +d、右 −d ⇒ `|左−右| = 2d`。所以「容差 2px（作用在差值上）」
等价于「允许居中偏差 **1px**」。

### 2.2 变形方法（第一版踩的坑也记下来）

| 轮次 | 变形 | 结果 |
| --- | --- | --- |
| 第一次 | 把 `position: relative; left: Npx;` 追加进**已登记那条规则内部**（`dist.calib.offN`） | 容差读数有效，但它顺手毁掉了 §19 **隔离牙**的锚点（DOM 里再也找不到 `.pdetailbody { max-width: 72ch; margin-inline: auto; }`）⇒ 牙从 N≥1 起一直报「变异未执行 ⇒ 按红处理」，整轮变噪声 |
| 第二次（本报告采用） | 追加一条**独立**规则 `.pdetailbody { position: relative; left: Npx; }`（`dist.calib.shiftN`） | 已登记规则逐字不动、隔离牙仍然有牙，§19 两条断言都有意义 |

> 两次都只动 `dist` 的**副本**；仓库里的 `dist` 与 `dist.calib` 一个字节没改。

### 2.3 逐档读数（真判据各跑一整轮 874 项）

| 位移 | 左内边距 | 右内边距 | \|左−右\| | §19 居中判据 | 规则内变形（第一版）整轮失败数 | **独立规则变形（第二版）整轮失败数** |
| --- | --- | --- | --- | --- | --- | --- |
| 0px（基线） | 445.63 | 445.63 | 0.00 | ✓ | 0 / 874 | —（与基线同一份） |
| **1px** | **446.63** | **444.63** | **2.00** | **✓ 仍绿** | 1（多出来的那条 = 被毁掉的隔离牙） | **0 / 874（全绿）** |
| **2px** | **447.63** | **443.63** | **4.00** | **✗ 变红** | 2 | **2 / 874** |
| 3px | 448.63 | 442.63 | 6.00 | ✗ | 2 | — |
| 4px | 449.63 | 441.63 | 8.00 | ✗ | 2 | — |
| 5px | 450.63 | 440.63 | 10.00 | ✗ | 2 | — |

**独立规则法（第二版）是干净读数**：位移 1px 时整轮 **874/874 全绿**；位移 2px 时恰好两条红 ——
§19 居中判据 **与它的隔离牙**（牙的判据式里含「删掉 auto 前后，基线必须本来是绿的」，所以基线一红它跟着红，
这是设计如此，不是第二个缺陷）。

（两轮变形法的完整读数：`_raw/judge-calibration-v1/tolerance-sweep.json` 的
`sweepInsideRule`（第一版，位移 0–5px）与 `sweepSeparateRule`（第二版，位移 1–2px）。）

### 2.4 结论

* **容差 2px 咬得住的最小居中偏移 = 2px**（1px 放行）。这与代码里的常量一致：
  `centeringTolerancePx = 2` 作用在 `|左−右|` 上 ⇒ 允许 ±1px 的居中误差，第 2px 就红。
* **过松的风险**（把 2 调大，例如 8，像 §22b 的 `LEAF_CENTER_TOL`）：位移 4px 以内的「贴边式偏移」
  会被放行；而 S4 要求的「必须居中」在 1380px 的单元格里是**肉眼可辨**的事实（465.75px 的盒子偏移
  4px 就是 0.9% 的偏心）。不过实际风险不高：`.pdetailbody` 是**行内展开**的正文块，位移只会来自
  偏心写法，而不是亚像素抖动。
* **过紧的风险**（把 2 调到 1）：位移 1px（\|左−右\| = 2.0）就会红。而判据自己已经承认亚像素存在
  （`WIDE_TOL = 1` 是「亚像素取整容差」），且左右两侧的取整方向不一定对称 —— 调到 1 会把
  「1px 位移」这种**无感**偏差变成红，属于把牙磨到会因字体度量抖动而 flaky 的程度。
* **本轮的取舍建议**：**维持 2px**。它是「1px 无感 / 2px 可辨」这条线的整数化表达，且与 §22b
  `LEAF_CENTER_TOL = 8` 的宽严分工合理（§22b 量的是整列居中、§19 量的是块在单元格里的居中）。

---

## 3. T3 · §22c 竖排轴阈值 0.85 vs 0.5 的 A/B

### 3.1 判据原文

```
ink   = 竖排 ? {count: columnCount, span: columnSpan} : {count: lineCount, span: widestLine}
scope = column > ch70 + WIDE_TOL                    // 物理前置条件（现场 70ch = 452.81px）
hit   = (rendered || glyphRects > 0) && scope && ink.count >= 2 && ink.span < ratio × column − 0.01
```

### 3.2 A/B 怎么跑的（源文件 0 改动）

* 0.85 档：直接跑仓库里的 `scripts/tools/verify-site.js`（**源文件**，未改）。
* 0.5 档：把源文件复制成 `.arch-v1/verify-site.ratio05.cjs`，只改 **2 行常量 + 5 处相对 require 的路径**
  （副本不在 `scripts/tools/` 下，`require('../lib/...')` 会断；这一条也写进了证据）。判据式、量测、
  归并容差一字未动。副本在 `.arch-v1/`（gitignore），**源文件 sha256 与基点相同**。
* 两份副本的 sha256 与「改了哪几行」记在 `_raw/judge-calibration-v1/vertical-ratio-ab.json` 的 `ratioCopies`。

### 3.3 对照表（真判据各跑一整轮；合成形态写在产物副本里）

| 形态（合成） | 轴 | `inkCount` | `inkSpan` | /列宽 | @0.85 | @0.5 | 判定 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `h-mc3-auto`（3 列只填 2 列，gap 24） | 横排 | 15 | 912.00 | **0.6609** | **咬中** | 放行 | **判别区** |
| `v-h12`（竖排 height 12rem） | 竖排 | 44 | 892.80 | **0.6470** | **咬中** | 放行 | **判别区** |
| `v-h9`（竖排 height 9rem） | 竖排 | 59 | 1198.66 | 0.8686 | 放行 | 放行 | 边界外（>0.85） |
| `v-h16` | 竖排 | 34 | 688.89 | 0.4992 | 咬中 | 咬中 | 恰在 0.5 内侧 |
| `v-h20` | 竖排 | 27 | 546.16 | 0.3958 | 咬中 | 咬中 | |
| `v-t31-exact`（T31 形态复刻） | 竖排 | 19 | 383.03 | 0.2776 | 咬中 | 咬中 | 与 T31 的 24.8% 同量级 ✅ 复刻校验 |
| `v-single`（8 字、被高度逼成 2 列） | 竖排 | 2 | 36.39 | 0.0264 | 咬中 | 咬中 | 前置条件成立即咬 |
| `v-short-tall`（8 字、高盒 ⇒ 1 列） | 竖排 | **1** | 16.00 | 0.0116 | 放行 | 放行 | **前置条件不成立**（单列无排版证据） |
| `v-t31`（同一形态 + 700 字） | 竖排 | 102 | 2075.45 | 1.5039 | 放行 | 放行 | 铺满（>1 列宽）⇒ 放行 |
| `h-gap0 / h-gap1 / h-gap8` | 横排 | 4 | 1374–1378 | ≈0.996 | 放行 | 放行 | 见 §4 |
| `h-plain`（对照） | 横排 | 3 | 1380.00 | 1.0000 | 放行 | 放行 | |

**整轮读数**：0.85 档 `note-ink-narrow` 共 **7** 条（**真实页 0** 条，7 条全在合成页）；
0.5 档共 **5** 条（**真实页 0** 条）。两档在**真实产物上完全一致（都是 0）**。

### 3.4 裁定：0.85 站得住，不要降到 0.5

1. **方向**：阈值越小 = 门槛越低 = 越晚咬。**0.5 的命中集合 ⊆ 0.85**；0.5 不会「新咬中」任何形态，
   只会**少咬**。判别区是 **[0.5, 0.85) × 列宽**。
2. **判别区里正好躺着判据自己的目标形态**：`h-mc3-auto` 的 **912px / 66.1%** 与代码注释里点名的
   「multicol 形态命中读数 912.63px（66%）… 3 列只用了 2 列、右侧 1/3 空白（缺陷原型）」**是同一个量级**。
   降到 0.5 ⇒ 这个缺陷原型会被放行（912 > 690）。这是「0.85 不能降」的**直接证据**。
3. **0.85 也不会把正常形态误伤**：真实产物上两档都是 0 条；`v-t31`（102 列、2075px > 1.5×列宽）
   与 `h-plain`（满宽）都放行；单列竖排（`v-short-tall`）放行。
4. **对注释里那句话的订正（重要）**：`verify-site.js` 的 `② 的三条不许动的细节` 里写着
   「阈值 0.85：t11 已验证 0.85× 与 0.5× 在 A/B/C 三个集合上给出**完全相同**的命中集合 ⇒ 这个口径不卡在阈值边缘」。
   本轮的实测说明：**这句话只在当年那三个集合上成立**（那三个集合里没有任何形态落在 [0.5, 0.85)），
   不能当作一般结论 —— 恰恰是注释自己在同一段里引用的 66% multicol 形态，就落在判别区里。
   建议把注释改成「0.85 与 0.5 在当年 A/B/C 三个集合上一致；但 [0.5, 0.85) 的形态两档结论不同，
   而 0.85 正是为了咬住 66% multicol」（**本轮不改代码**，只给建议）。
5. **竖排的额外观察（登记在案，不改判据）**：竖排侧的前置条件「列数 ≥ 2」比横排的「行数 ≥ 2」更容易成立 ——
   只要盒高被限制，**8 个字也会排成 2 列**（`v-single`：2 列 / 36.39px ⇒ 咬中）。横排里对应的「单行说明」
   有明确豁免（count = 1），竖排没有等价豁免。这与 T31 的设计意图一致（竖排下「单列 = 无排版证据」，
   而 >1 列就说明字迹被排到了横向的某一段），但它意味着：**竖排说明的判定比横排更早触发**。
   现场竖排说明 0 条 ⇒ 没有误报面；记录在此供下一轮决定要不要补一条「极短竖排」的豁免。

---

## 4. T4 · 横排 `column-gap` 细分（对 ② 前置条件 `inkCount ≥ 2` 的影响）

### 4.1 现场有没有样本：**没有**

全站 186 个页面的 CSS 里 `column-count|column-fill|column-gap|column-width|column-span` 声明总数为 **0**；
`.snote` 规则里更是一条都没有（见 `_raw/judge-calibration-v1/column-gap.json` 的 `fieldSamples`）。
⇒ 这个形态**只能靠人为构造**来标定。

### 4.2 最小可复现读数（产物副本里的合成页）

| 形态 | `column-*` | 单元数（行） | 最宽单元 | /列宽 | 两档阈值 |
| --- | --- | --- | --- | --- | --- |
| `h-plain`（对照，单列） | — | 3 | 1380.00 | 1.0000 | 放行 |
| `h-gap0` | `column-count:2; gap:0px` | 4 | 1374.00 | 0.9957 | 放行 |
| `h-gap1` | `column-count:2; gap:1px` | 4 | 1374.50 | 0.9960 | 放行 |
| `h-gap8` | `column-count:2; gap:8px` | 4 | 1378.00 | 0.9986 | 放行 |
| `h-gap0-auto` | `column-count:2; fill:auto; gap:0px; height:12rem` | 9 | **684.00** | 0.4957 | **两档都咬中** |
| `h-mc3-auto` | `column-count:3; fill:auto; gap:24px; height:20rem` | 15 | **912.00** | 0.6609 | 只有 0.85 咬 |

### 4.3 结论：极小 gap **不会**把一个视觉列切成多列（对前置条件无影响）

1. **同顶行会被并回满宽单元**：归并规则是「垂直重叠 > 两者较矮高度的 50%」。multicol 的两个列
   **同顶**（都从容器顶开始），所以列的每一行片段都会被并进**同一个单元**，该单元的跨度是
   **两列的并集**（≈ 满宽）—— gap 从 0 到 8px 都改变不了这一点（单元数恒为 4，最宽单元 1374–1378）。
   于是「一个视觉列被 gap 切出两个**窄**单元」这条假阳性路径**不存在**。
2. **真正决定命中与否的是「用了几列」**：`column-fill: auto` 下文本只填满第一列 ⇒ 最宽单元只有
   684px（49.6%）⇒ 两档都咬；3 列只填 2 列 ⇒ 912px（66.1%）⇒ 只有 0.85 咬。**与 gap 大小无关。**
3. **对 ② 前置条件的影响 = 无**：`inkCount ≥ 2` 在 multicol 形态下天然成立，且 gap 0/1/8px 三档的单元数
   完全相同（4/4/4）；单行说明仍然只有 1 个单元（豁免照旧生效）。既没有新放行面，也没有新误报面。
4. **本轮没测的边界（如实登记）**：① 竖排下的 multicol（换轴后按**水平**重叠归并，band 间距 = gap
   可能真的把列栈切成多段）；② gap 大到超过列宽的极端形态；③ `@media` 内的 `column-*`。
   三者在现场都是 0 样本，下一轮若要收紧应优先补 ①。

---

## 5. 复跑命令

```powershell
# 产物副本（不动仓库里的 dist）
node scripts/tools/build-local.js --out=dist.calib
node .arch-v1/calib-px-rem-census.cjs --dir=dist.calib --out=.arch-v1/px-rem-census.json   # T1
node .arch-v1/calib-css-surface.cjs  --dir=dist.calib --out=.arch-v1/css-surface.json        # T1 三个入口
& .\.arch-v1\run-tolerance-sweep.ps1 ; & .\.arch-v1\run-tolerance-shift.ps1                  # T2（两轮变形法）
node .arch-v1/calib-synth-build.cjs --base=dist.calib --out=dist.calib.synth                 # T3/T4 合成形态
node .arch-v1/make-ratio-copies.cjs                                                          # T3 的 0.5 副本
node scripts/tools/verify-site.js --dir=dist.calib.synth --json=.arch-v1/verify-ab-085.json  # T3 0.85
node .arch-v1/verify-site.ratio05.cjs --dir=dist.calib.synth --json=.arch-v1/verify-ab-050.json
node .arch-v1/ab-compare.cjs ; node .arch-v1/source-unchanged.cjs ; node .arch-v1/criteria-region-hash.cjs
node .arch-v1/compose-calib-evidence.cjs                                                     # 合成入库证据
```

> ⚠️ 复跑 `verify-site.js --dir=<副本>` 前，工作树里必须有 `dist/index.html`：
> 脚本的 `sharedFooterExternalHrefs` **硬编码**读 `ROOT/dist/index.html`（不是 `--dir`），
> 缺了它会让 5 个枢纽页各多报一条「按设计没有站外链接」的假失败（本轮踩过：10 条假失败）。

---

## 6. 本轮**没有**证明的东西（如实登记）

1. **px/rem 侧的未来形态没有登记制**：本轮证明的是「当前产物 0 条」，不是「以后也不许出现」。
   若要加，需要的是一张与 ch 侧同构的清单 + 一条「比容器窄 ≥ 40px 且承载文本」的判定，
   而不是把登记制无差别扩到 px/rem（`.search`/`.cmpchip` 这类控件会被卷进来）。
2. **容差 2px 只标定了 `.pdetailbody` 这一条登记项**：登记清单目前只有 1 条；第 2 条登记项进来时，
   这条标定要重做（不同容器宽度下的取整抖动不同）。
3. **0.85 的标定用的是合成几何 + 真实产物 0 命中**：现场**没有**任何竖排说明，
   所以「0.85 在真实缺陷上够不够」的证据来自 T31 的历史形态复刻（`v-t31-exact`，27.8%）与注释里
   点名的 66% multicol 形态（`h-mc3-auto`），不是来自线上样本。
4. **阈值两侧的形态没有穷尽**：`v-h9`（0.8686）只差 2.3% 就在边界外，说明「刚好在 0.85 以上」
   的形态是存在的；本轮没有做「0.86/0.87/0.88 逐档」的细扫。
5. **`@media` 盲区只在本轮产物上确认为 0**：brace-aware 补扫得到的 @media-only px/rem 声明为 0，
   不等于「以后不会有」；§22c 的扁平扫描器仍然看不见 @media 内部（这是判据的既有边界，不是本轮引入的）。
