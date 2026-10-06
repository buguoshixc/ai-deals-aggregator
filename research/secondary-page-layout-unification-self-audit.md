# 二级页布局统一 · **产物侧** Self-Audit（T4 独立复核）

- **任务**：`t4` · T4 独立复核（attempt 2，attempt 1 因平台 429 中断，产物已在盘上）
- **基线**：`origin/master = 1f225d2`；产物侧改动来自 t1（`index.html` / `build-local.js` / `page-kinds.js` / `archive.js`）
- **复核范围**：**产物侧**（几何 / 字节 / 局部窄宽 / 别名页兼容性）。
  **门禁侧（§22c 的对抗式复测与最终汇总）不在本任务**，由 captain 另派的后续任务补写 —— 本文出现「门禁侧待补」的地方，
  给出的是我**实测到的读数**，不是对 §22c 是否达标的最终裁定。
- **一句话结论**：产物侧 **7 条验收全部通过，没有 P0、没有 REPAIR_NOW**。宽页上的页面级说明 0 条窄柱、
  0 条裁切、0 页横向溢出；数据/文案/路由/结构化数据在字节层面 0 变化（186 页正文逐字节相同、117 个非 HTML sha256 全等）；
  两处保留的局部窄宽有明确设计理由（有实测支撑）；`.aliasnote` 不会被修复后的判据误报。
  剩余的 3 条是 **P1/DEFERRED** 级的加固建议，不是本次版本的阻塞项。

---

## 一、方法与独立性（先说清楚「凭什么信这份复核」）

复核的原则是 **不复用被测判据**：本次改动要证明的是「页面级说明与主数据区同轴」，因此复核不能再调用
`scripts/tools/verify-site.js` §22c 的判据函数，也不能拿 §22c 自己的报告当真值。

| 复核件 | 依赖什么 | 明确**不**依赖什么 |
| --- | --- | --- |
| `verify/layout-probe.cjs` | `playwright-core`（浏览器内核）+ `fs/http/path` | **不 require `verify-site.js`**；**完全不 require `page-kinds.js`**（连族表都不读）；目录枚举 / 静态服务器 / 量测脚本 / 判据 / 报告结构全部自成一套 |
| `verify/byte-compare.cjs` | `crypto/fs/path` | 不复用 T3 的 `diff/nonhtml-sha256.cjs`、`diff/before-after-compare.cjs`；剥样式用自写状态机、正文按**字节**比 |
| `verify/retained-narrow-probe.cjs` / `pdetail-followup.cjs` / `height-overflow-probe.cjs` | 真浏览器 + 磁盘产物 | 不读 §22c 的任何选择器清单/阈值常量（阈值 0.85、0.05 只出现在「算会不会被它误报」的换算里） |
| `verify/truth-reconcile.cjs` / `probe-vs-22c.cjs` / `number-spotcheck.cjs` | 对账方：T3 的真值 JSON、§22c 自己跑出来的 JSON | 只做集合/数值比较，不重算判据 |

判据是**自己写的一遍**（阈值与 §22c 相同是契约，不是实现）：

- **主数据区**：`<main>` 里**最宽的数据型块级容器**（自身是 `table/ul/ol/dl`，或内部含它们）；
  一个都没有时退到最宽的块级子元素。**不读** §22c 的 `WIDE_DATA_SELECTORS`。
- **页面列** = `min(主数据区宽, <main> 宽)`。
- **窄** = 该条说明的**有字区域宽** < `0.85 × 页面列`。有字区域宽 =「直接含文本、且是块级
  （`display ∉ inline/inline-block/none/contents`）的元素」的 content box 里最窄的那个；
  没有则回落说明自己的 content box。**另算一个宽松变体**（只排除 `inline/none/contents`，
  即 §22c 的口径），**三个分母**（自研区域 / 只用 `<main>` / 取小）各算一遍 —— 用来证明结论不依赖这些选择。

**判据无关性的实证**：dist.baseline 上，我的探针在 **3 个分母 × 2 个变体 × 2 个视口（1440/1600）** 共 12 组里，
给出的窄集合**大小全部相同（156 条 / 48 页）**，逐条键集合也相同 —— 说明「156/48」不是某一套分母的巧合。
（见 `probe-before.json` 的 `narrowSets` 与 `verify/probe-before.log`。）

---

## 二、prompt §23 的十个问题（逐条）

> ⚠️ **口径说明（重要，避免误读）**：本 worktree 里**没有 prompt 原文**，t4 契约把产物侧要回答的条目
> 逐条列在了括号里。下表按契约列出的条目编号回答（Q1–Q7 = 产物侧，Q8–Q10 = 门禁侧/发布侧，**标注「门禁侧待补」**）。
> 若 captain 手上有 §23 的逐字十问，请让后续任务把本文的编号映射一次 —— 我没有凭空补出原文里没有的问题。

| # | 问题 | 结论 | 实测证据 |
| --- | --- | --- | --- |
| **Q1** | **数据 / 文案 / 路由 / 结构化数据是否变化？** | **0 变化** | 303 个文件：**117/117 非 HTML 逐个 sha256 相等**；**186/186 HTML 剥掉全部 `<style>` 后正文逐字节相同**（`Buffer.compare`，不是先解码再比）；文件集合相等（added 0 / removed 0）。样式块去重行集合差 **+9 / −2**，逐行看只有「`.snote` 规则 + 解释注释」：新增 1 条 `.snote{…max-width:none;overflow-wrap:anywhere}` + 8 行注释，删除 2 条重复的 `.snote` 副本（`max-width:none` / `70ch` 各一条）。结构化数据（JSON-LD 等）在正文里 ⇒ 逐字节相同。 |
| **Q2** | **页面高度是否异常？** | **不异常**（只减不增） | 59 个路由（48 个原窄页 + 10 个详情页 + 8 个宽页对照）在 1440 档：**47 页变矮、12 页不变、0 页变高**；差值 min **−224px** / median **−122px** / max **0**。变矮是「说明不再在 452px 列里折行」的直接后果（例：`feeds/` 3576 → 3352，`need/free-api/` 4462 → 4299）。**没有任何一页高度暴涨或塌陷**。 |
| **Q3** | **是否新产生横向滚动？** | **没有** | 同一批路由在 **1440 / 1600 / 390** 三档：溢出页数 **before 0 → after 0**（两边都是 0）。另有全站读数：我的探针在 dist 与 dist.baseline 上 **186/186 页 390 档 `scrollWidth ≤ clientWidth+1`**；§22c 的整轮实跑同样报 `overflowPages=0`。 |
| **Q4** | **是否把该窄的局部组件放宽？** | **没有（一个都没动）** | 样式行集合差里**不包含** `.pdetailbody` 与 `.lsum li small` 的任何一行 ⇒ 两条规则在两个产物里逐字相同（也逐条 grep 确认：`dist`/`dist.baseline` 的 `/plans/coding/` 与 `/category/agent/` 里 `max-width: 72ch` ×1、`max-width: 34ch` ×1）。本次唯一被改的宽度来源是页面级说明 `.snote`。 |
| **Q5** | **宽页是否仍有窄柱？** | **0 条** | 我的独立探针（逐条、不是只看第一条）：dist 上 1440 与 1600 两个档位 **窄 0 条 / 0 页**；**401 条说明 × 2 档位 × 2 个产物**逐条判过，dist.baseline 对照为 **156 条 / 48 页**。两处**保留**的局部窄宽见 §三（它们是次级说明行/阅读列，不是页面级说明）。 |
| **Q6** | **详情页是否被错误扩宽？** | **没有** | 10 个真实详情族路由（磁盘上带 `main.detail-main` 的页面，现扫现取、不写死 slug）：内容列实测宽**全部 = 1120px**，居中偏差（左留白 − 右留白）**全部 ≤ 1px**。没有出现「详情页被拉成整屏宽」或「没居中」。 |
| **Q7** | **未来详情页/新页面是否仍有同类隐患？** | **同类形态被两道牙挡住；但有一个新类名盲区（P1）** | ① 新页面壳若**复制**一份 `.snote` 规则：dist 上 186/186 页「冻结串恰好 1 次」，多一份就是 2 次 ⇒ 门禁红（我复算过：`dist` 每页恰好 1 次 = 186/186，见 `number-spotcheck.json N14`）。② 新页面若**不登记**布局族：`unclassified-layout` ⇒ 红。③ **盲区**：§22c 只量 `main .snote`；将来的「页面级说明」若换了类名（`.pnote` 之类）或改成别的容器，**判据不会看它一眼**（详见 §五 P1-2）。 |
| **Q8** | 门禁是否真的会在缺陷形态下判红 / 变异牙是否真的咬得住？ | **门禁侧待补** | 我做过一次**有界**对抗快照（10 种构造 × 3 路由，跑的是**从 `verify-site.js` 逐字切出来的 §22c 判据代码**，`@4f4cb2e3`）：24 条按预期判红，4 条按预期判绿，**1 种构造（`clip-path`）骗过了判据**（P1-1）。完整的「修复前/修复后对抗基线 + 新绕过形态」由 t11 与后续任务裁定，本文只登记读数。 |
| **Q9** | Full Gate / CI 步骤是否变化、是否可复现？ | **门禁侧待补**（数字已独立复算） | `action.yml` 里 step 数 **49**；T3 的 `gate/steps/summary.json`：`stepsInAction 49 · 执行 45 · 通过 45 · 失败 0 · 跳过 4`，跳过序号 **[1,45,46,49]** —— 我按 action.yml 与 summary 逐条复算，**一致**。本轮是否**新增**门禁步骤属于门禁侧结论，留给下游任务。 |
| **Q10** | 发布/线上冒烟是否覆盖了这次的形状？ | **门禁侧待补** | 不在本任务范围（线上几何 smoke 脚本属 t10 / 发布侧）。本文只提供可复用的读数：`detail-main = 1120px 且居中 ≤1px`、`宽页 0 窄柱`、`390/1440/1600 全站 0 溢出`。 |

---

## 三、两处保留的局部窄宽：实测比例与裁定

> 这两处是 captain 点名要「实测比例 + 明确判定」的对象。以下全部是真浏览器（Edge headless，1440×900）读数。

### 3.1 `.lsum li small { max-width: 34ch }` —— **判定：有明确设计理由，保留**

覆盖 **43 个页面 / 141 个元素**（页面清单现扫现取：文件里真的有 `class="lsum"` + `<small>`）。

| 读数 | 值 |
| --- | --- |
| 盒宽 | **144.83 – 201.61px**（`max-width` 计算值恒为 **201.609px** = 34ch @11px 字体） |
| 相对**所在 `<li>` 宽**的比例 | min **0.868** · median **0.895** · max **0.902** |
| 相对 `.lsum` 容器宽的比例 | min **0.105** · median **0.136** · max **0.146** |
| 相对页面列（1380px）的比例 | 同上（这部分页面 `.lsum` 就是主数据区） |
| 行数（当前） | 单行 74 · 两行 59 · 三行以上 8 |
| 行数（把 `max-width` 临时置 `none` 的对照量测） | 单行 **141** · 两行 0 · 三行以上 0（**67 个元素会从多行收成一行**） |
| 字迹填满盒子（字迹/盒宽 ≥ 0.95） | 133 / 141 |

**为什么判「保留」**：34ch 的 201.6px 与它自己的容器（`li` ≈ 166.8–223.6px，列表项是**瓦片**，`.lsum` 一行排多个）
**几乎同宽**（占 li 的 86.8%–90.2%）。它约束的是「瓦片里标题下面那行判据说明」，不是页面导语；
真正的半截列形态是「盒宽只占所在行 1/3」，这里差了 3 倍。文本内容也印证语义：抽样全是
`判据：type=deal 且未过期，且命中本页判据`、`判据：benefitType 含 free_api` 这类**条目级注释**。
如果把 `max-width` 去掉，多个瓦片会被最长的说明撑宽（对照量测里 13 个样本中有 2 个的盒宽会超过原 `li` 宽），
属于**会反过来动栅格**的改动 —— 因此不是「顺手放宽」的候选。

- 遗留观察（**DEFERRED-1**，不阻塞）：34ch 让 47%（67/141）的条目多折一行。如果将来瓦片设计本身变宽，
  这个 cap 值得跟着复查；它现在**不是**同类缺陷。

### 3.2 `.pdetailbody { max-width: 72ch }` —— **判定：有明确设计理由，保留（但要登记为「阅读列」）**

`/plans/coding/` 上**真的点开**「详情」按钮后量到（`expandMethod = clicked:button:详情`，不是靠去掉 `hidden` 糊出来的）。

| 读数 | 值 |
| --- | --- |
| 盒宽 | **465.75px**（= 72ch @13px 字体，`max-width` 计算值 465.75px） |
| 所在单元格宽 | **1379px**（`<td>`，详情行 `colspan` 撑满表格） |
| **相对所在单元格的比例** | **0.3377** |
| 内容 | 511 字：`dl` 4 组 `dt/dd` + 2 个 `h3` + 1 个 `p` + 引文列表 `ul.pev`（357 字） |
| 把 `max-width` 临时置 `none` | 盒宽 1356px；`p` 从 **2 行 → 1 行**，`ul.pev` 从 **10 行 → 8 行**，最长字迹 445px → **869.83px** |

**为什么判「保留」**（同时如实说出它和缺陷形态的相似点）：

- 相似点（必须承认）：**0.3377 与本次被修的 70ch 缺陷同量级**（缺陷里是 452.81px / 1380px = 0.328）。单看比例，
  两者长得一样。所以不能靠「比例小就没问题」蒙过去。
- 不同点（决定裁定的三条，逐条有读数）：
  ① **内容形态不同**：这里装的是 `dt/dd` 定义表 + 官方原文引文（357 字的 `ul.pev`）——**是正文体**，
     放到 1356px 会得到 870px 级的行宽（≈ 130+ 字符/行），比 465px 的 72ch 更难读；
     而 `.snote` 是**这一页的导语**，它的对照物是同一页的表格列。
  ② **所在面不同**：它是**展开出来的详情面板**（`tr.pdetail` 里、`colspan` 整行），不是与表格列并排的页面级元素；
  ③ **设计词汇里有它的位置**：`page-kinds.js` 的 `LAYOUT_FAMILIES` 明确保留了 `prose` 族
     （「真正的长文阅读列（居中且收窄）」）——「收窄的阅读列」在这个站点是**被登记过的合法形态**，
     而 `.snote` 被修正是因为它是**数据型页面的导语**、必须与数据区同轴。
- 结论：**保留**，但建议把它从「隐式局部规则」升格为**登记过的阅读列宽度**（P1-3 / DEFERRED-2），
  这样将来不会有人再拿它和 70ch 缺陷混为一谈，也不会有人随手把它改成 `none`。

---

## 四、`.snote.aliasnote` 兼容性（3 个别名页）—— **不会被修复后的判据误报**

`/need/dev-credits/` `/need/free-api/` `/need/student-only/`（现扫：文件里真的有 `snote aliasnote`），
各 3 条说明，别名条是 **#0**；`.aliasnote { border-left: 3px + padding-left: 8px }`。

| 页面 | 别名条 border-box | 相对 `<main>`（30..1410） | 轴容差 | 有字区域 | 占列宽比 | 会被判 `note-narrow`？ |
| --- | --- | --- | --- | --- | --- | --- |
| `need/dev-credits/` | 30..1410（宽 1380） | dLeft **0** · dRight **0** | max(1px, 5%×1380) = **69px** | **1369** | **0.9920** | **否** |
| `need/free-api/` | 30..1410（宽 1380） | 0 / 0 | 69px | 1369 | 0.9920 | **否** |
| `need/student-only/` | 30..1410（宽 1380） | 0 / 0 | 69px | 1369 | 0.9920 | **否** |

**机理**：3px 竖线 + 8px 缩进只缩**内容盒**（1380 → 1369）；轴判据量的是 **border-box**，
而 border-box 的左右边与 `<main>` **完全重合**（偏差 0 ≤ 69px 容差）。
所以修复后的 §22c 用「轴=border-box + 宽=有字区域」这套口径时，这 3 页既有 0.992 的宽，又 0 偏差的轴，
**两个方向都不会误报**。9 条说明逐条算过，`wouldBeNarrow` 全为 `false`。

> 反向提醒（给门禁侧）：**别把轴判据改成「文字区」** —— 那会正好把这 3 页的 11px 有意缩进报成不同轴，
> 从「修一个假绿」变成「造三个假红」。

---

## 五、分级：P0 / P1 / REPAIR_NOW / DEFERRED

| 级别 | 条目 | 说明 |
| --- | --- | --- |
| **P0** | **无** | 没有发现阻塞级问题。 |
| **REPAIR_NOW** | **无** | 产物侧没有任何一条需要在本次版本里立刻改的。 |
| **P1-1** | **只改绘制、不改排版盒的窄化能骗过「有字区域宽」判据（`clip-path` 实证）** | **门禁侧**。我在**有界**对抗快照里注入 `.snote { clip-path: inset(0 65% 0 0) }`：盒宽 1380、clientWidth 1380、有字区域 1380 —— 肉眼只剩三分之一，§22c 判**绿**（`bad = narrow 0 + axis 0 + clipped 0`），3 个路由全部复现。**修法建议**：宽判据再加一路**可见性/绘制**读数——对每条说明取「`getBoundingClientRect` ∩ `clip-path` 内缩后可见矩形」的宽度（或用 `elementFromPoint` 在盒中点/3/4 点采样命中的元素），`visibleWidth < 0.85 × 列宽` 也判 `note-narrow`（统一走 `wideProblems()` 一处出口，加一个违规码 `note-clipped-paint` 更清楚）。**注意**：这条是判据的**不完备**，不是当前产品缺陷（产物里没有任何构建路径会产出 `clip-path`）；是否本轮修由门禁侧裁定。 |
| **P1-2** | **判据只认 `.snote` 这个类名**，将来的「页面级说明」换名/换容器即隐形 | **门禁侧**（产物侧的对应建议：若将来引入新形态，请同时在 LAYOUT_FAMILIES/说明处登记，别只换类名）。**修法建议**：给页面级说明加一个**角色标记**（如 `data-page-note`）并由判据按「`.snote` ∪ `[data-page-note]`」取集合；或建一份「说明容器类清单」的唯一出处，纳入冻结串同级的自检。 |
| **P1-3** | `.pdetailbody` 的 72ch 是**未登记的阅读列宽度**（比例 0.3377，与缺陷同量级） | **产物侧建议**（不阻塞）：把 72ch 写进设计规范/布局族词汇（`prose` 已有族但无实例），并在规则旁注「这是阅读列，不是页面导语」；顺带把 `.lsum li small` 的 34ch 一并登记。这样「哪些收窄是设计、哪些是缺陷」有唯一出处，而不是靠 reviewer 逐次裁定。 |
| **DEFERRED-1** | `.lsum li small` 34ch 让 47%（67/141）条目多折一行 | 若将来瓦片变宽再复查；现在它的容器本身就只有 167–224px，不构成半截列。 |
| **DEFERRED-2** | 两处局部窄宽没有「机器可读的保留清单」 | 见 P1-3；本轮不修。 |
| **DEFERRED-3** | §23 的 Q8–Q10（门禁侧）与最终 self-audit 汇总 | captain 明确另派任务；本文只登记读数。 |

---

## 六、诚实清单：本次**没有**覆盖的东西

1. **没有**跑 `build-local.js`、**没有**改任何生产源码（`scripts/**`、`index.html` 一行未动）、**没有** `git commit`。
   我只写 `research/_raw/secondary-page-layout-unification/verify/**` 与本文件。
2. **没有**做线上（`--url=`）几何冒烟：线上产物是否已更新属于发布侧。
3. **760 / 360 两档样本集**我没重跑（§22c 自己会跑 29 页样本集）；我只覆盖 1440 / 1600 / 390。
   影响有限：本次改动是宽度类的，390 档的全站溢出我逐页量过（0 页）。
4. **没有**逐页截图比对（视觉回归）；本文的「宽 / 轴 / 溢出 / 高度」都是数值读数，
   像素级观感差异（例如说明变宽后与表格的视觉关系）请以 §22c 的几何门禁与人工目视为准。
5. **对 `clip-path` 那条 P1-1**：我只在 3 个路由上复现，没有做全站扫描；它是**判据不完备**的证明，
   不是「产物里已经存在这个缺陷」的证明。
6. **反假绿快照的判据来源是 `verify-site.js @4f4cb2e3…`**（t7 的修复版）。t7 若再改这个文件，
   快照要重跑（脚本会把文件 sha256 一起落盘，文件一动就能看出来）。
7. 「产物自 t1 后未改动」这条我**侧证**过、**没有**独立时间机器：四个产物文件的 mtime 是
   `index.html 14:37:12` / `build-local.js 15:28:19` / `page-kinds.js 14:36:42` / `archive.js 14:39:04`
   （`verify-site.js` 16:11:12 = t7 的修复），都早于我这一轮（16:10 起）；
   真正硬的那条证据是**字节层**的：`dist` 的内容与这些源码一致地复现了 186 页正文零变化。

---

## 七、补充证据（**契约外**，仅供 captain / 门禁侧任务取用）

这两项不在 amend 后的产物侧契约里，是 attempt 1 按旧契约已经跑出来的读数。**它们不构成本任务的验收结论**。

1. **有界反假绿快照**（`verify/anti-false-green.cjs` / `.json` / `.log`）：10 种构造 × 3 路由 = 30 条，
   判据代码**逐字从 `verify-site.js` 切出**（`WIDE_TOL` 常量块 → §22c 主流程之前，切片 sha256 `8165450aa579…`，
   源文件 sha256 `4f4cb2e3…`），判红的谓词与主流程同源（`bad = narrow+axis+clipped` / `frozenCount === 1`）。
   结果：**对照绿**（dist 上不改任何东西 → 绿）✓；
   `max-width: 70ch` 注入 → 红 ✓；**F1 原型 `padding-right: calc(100% - 70ch)`（盒宽 1380 不变、有字区域 452.81）→ 红** ✓；
   内层 `max-width: 70ch` 容器 → 红 ✓；`transform: scaleX(0.35)` → 红（走 `note-axis`：box 483 vs 1380）✓；
   只压非首条 `.snote ~ .snote` → 红 ✓；`writing-mode: vertical-rl` → 红（有字区域 61/20px）✓；
   **冻结串复制成 2 次 → 红**（`frozenCount=2`，且 `wideMutate` 返回 `ok:false`，变异不会被静默跳过）✓；
   **冻结串被改一个字 → 红**（`frozenCount=0`，`wideMutate` `ok:false`）✓；
   把 `<style>` 拆成两块但规则仍恰好 1 次 → **绿（这是正确行为，不是绕过）**；
   **`clip-path: inset(0 65% 0 0)` → 绿（绕过，见 P1-1）**。
2. **报告数字抽查**（`verify/number-spotcheck.cjs` / `.json`）：从 T3 证据文件里抽 **14 个**具体数字
   （文件数/HTML 数/非 HTML 数、117/117、186/186、样式行差 +9/−2、dist 字节 20012665、
   added/removed/unchanged/changed、`archive/index.html` 88769→89677、真值 sha256 `46c28fa1…`、
   真值总量 401/105/156/0、分类 48/108/245/48、缺陷读数 452.81→1380 与比例 0.328→1、
   Full Gate 49/45/45/0/4 与跳过序号、§22c 在 baseline 上的整轮读数、`.snote` 每页恰好 1 次）
   —— **14 条全部一致，0 条不一致**。

---

## 八、证据索引与复现命令

**独立跑出来的复核件**（全部在 `research/_raw/secondary-page-layout-unification/verify/`）：

| 文件 | 内容 |
| --- | --- |
| `layout-probe.cjs` + `probe-before.json` + `probe-after.json` + `probe-before.log` + `probe-after.log` | 独立探针：186 路由 × {1440,1600,390}，逐条量 **401 条**说明（1440 / 1600 各一轮、两个产物各一遍） |
| `truth-reconcile.cjs` + `truth-reconcile.json` + `.log` | 与 `geometry/truth-401.json`（sha256 `46c28fa1…`）的**集合级**对账，8 项检查 |
| `probe-vs-22c.cjs` + `probe-vs-22c.json` + `.log` | 我的探针 vs §22c **自己跑出来**的机器可读报告（页集合 / 条集合 / 401 条有字区域逐条同值） |
| `22c-baseline-run.log` + `22c-baseline.json` + `22c-baseline-run.meta.txt` | 我自己整轮实跑 §22c（`--dir=dist.baseline`）：842 项断言 / 27 失败 / EXIT=1；`verify-site.js` 运行前后 sha256 均 `4f4cb2e3…`（未被我改动） |
| `byte-compare.cjs` + `byte-compare.json` + `.log` | 独立字节对账 303 文件 |
| `retained-narrow-probe.cjs` + `retained-narrow.json` + `.log` | 两处保留窄宽 + `.aliasnote`（43 + 1 + 3 页） |
| `pdetail-followup.cjs` + `pdetail-followup.json` + `.log` | `.pdetailbody` 的 `max-width:none` 对照量测（行数/字迹） |
| `height-overflow-probe.cjs` + `height-overflow.json` + `.log` | 59 路由 × 2 产物 × 3 档：高度差、横向溢出、`detail-main` 宽与居中 |
| `number-spotcheck.cjs` + `number-spotcheck.json` + `.log` | 契约外：14 个数字抽查 |
| `anti-false-green.cjs` + `anti-false-green.json` + `.log` | 契约外：有界反假绿快照（30 条构造） |

```powershell
# 契约里的三条 verify（在 worktree 根执行）
node research/_raw/secondary-page-layout-unification/verify/layout-probe.cjs --dir=dist.baseline --out=research/_raw/secondary-page-layout-unification/verify/probe-before.json
node research/_raw/secondary-page-layout-unification/verify/layout-probe.cjs --dir=dist           --out=research/_raw/secondary-page-layout-unification/verify/probe-after.json
node research/_raw/secondary-page-layout-unification/verify/byte-compare.cjs --a=dist.baseline --b=dist --out=research/_raw/secondary-page-layout-unification/verify/byte-compare.json

# 其余复核件（按顺序跑，浏览器一次一个）
node research/_raw/secondary-page-layout-unification/verify/truth-reconcile.cjs
node research/_raw/secondary-page-layout-unification/verify/probe-vs-22c.cjs
node research/_raw/secondary-page-layout-unification/verify/retained-narrow-probe.cjs --dir=dist
node research/_raw/secondary-page-layout-unification/verify/pdetail-followup.cjs
node research/_raw/secondary-page-layout-unification/verify/height-overflow-probe.cjs
node research/_raw/secondary-page-layout-unification/verify/number-spotcheck.cjs
node research/_raw/secondary-page-layout-unification/verify/anti-false-green.cjs --dir=dist
```

**产物侧关键读数一览（供下游任务直接引用）**

| 读数 | dist.baseline | dist |
| --- | --- | --- |
| 路由 / 文件 | 186 / 303（186 HTML + 117 非 HTML） | 同 |
| 逐条说明（1440 / 1600） | 401 / 401 条（105 页有说明，81 页零说明） | 同 |
| 窄说明（1440 / 1600） | **156 条 / 48 页** | **0 条 / 0 页** |
| 说明被裁切 | 0 | 0 |
| 横向溢出（390 / 1440 / 1600） | 0 / 0 / 0 页 | 0 / 0 / 0 页 |
| 页面高度（59 路由 @1440） | — | 47 页变矮（min −224 / median −122）、12 页不变、**0 页变高** |
| `main.detail-main` | — | **1120px**，居中偏差 ≤1px（10/10 路由） |
| 非 HTML sha256 相等 | **117/117** | — |
| HTML 去 `<style>` 正文相等 | **186/186** | — |
| 样式行集合差 | **+9 / −2**（只涉及 `.snote` 规则与注释） | — |
