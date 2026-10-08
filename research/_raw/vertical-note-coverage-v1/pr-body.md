## 这一轮修什么

上一轮（`secondary-page-layout-unification`）**如实登记、明确留给下一轮**的 P1：**竖排（`writing-mode`）的覆盖不对称**。
`NEXT-STEPS.md` §0 剩余事项 3 写了 `requiredFix`：把逐行归并按 `writing-mode` 参数化（竖排按列归并），
或对 vertical 条改判「单字形盒宽 < 0.85 × 列宽」。**本 PR 走前者**（量出来的判据，不是形态禁令）。

形态（逐字取 T31 现场那一份）：

```css
.snote { writing-mode: vertical-rl; width: 100%; height: 5.6rem; overflow: hidden; }
```

## 关键发现：**删掉豁免也修不好**

竖排下 `Range.getClientRects()` 取到的是**列片段**，18 个竖列**共享同一条垂直带** ⇒ 按**行**归并恒为 **1 行**
⇒ ② 的前置条件「行数 ≥ 2」**永远不成立**。所以旧口径静默的原因**不是**那句「竖排显式不判」的注释 ——
把 `!note.vertical` 删掉，② 照样一条码都不出。**修法只能是换轴。**

## 改法（只动判据 + 文档）

* `mergeLines` → `mergeAxis(rects, vertical)`：两轴逐字同构（排序键 / 重叠量 / 基准 / 扩张方式一一对应），
  横排那一路的读数与参数化前**逐位相同**；竖排按水平重叠归并成竖列。
* 新增 `mergeColumns` 与每条说明的 `columns / columnCount / columnSpan` 读数。
* 新增 `wideInkOf(note)` —— **轴的唯一取用点**：横排 `lineCount/widestLine`、竖排 `columnCount/columnSpan`；
  ② `note-ink-narrow` 与 ⑤ `note-intro-long` **共用同一对量**（竖排下「行」= 竖列，否则 ⑤ 也会静默）。
* 判据量统一为「字迹在**水平轴**上铺到哪里 < 0.85 × min(主数据区宽, 页面列宽)」，前置条件统一为「排版单元数 ≥ 2」。
* 新增常驻牙 **§22c M15** + 承重证明 + 不注入正对照 + 竖排适用范围三条反例。
* `docs/DESIGN-RULES.md` 新增 **N6** 与「落地情况」小节；`NEXT-STEPS.md` 的 P1 标记为已闭合（原读数保留）。

**本版不动产品**：产物逐字节未变（见下）。

## 证据：同一批字节上的配对读数

装置：形态注入 dist 副本的共享 `<style>`（冻结串规则之后，原串逐字保留）。对账：**303 文件中 1 个不同**
（只 `need/free-api/index.html`）· 冻结串 **1 → 1** · **+85 B** · `dist` 被写 **0** 个。

| 档 | 改动前（master） | 轮 6 冻结版 `2cbc160d…` | 本 PR |
| --- | --- | --- | --- |
| @1440 逐条（186 页 / 271 条说明） | ✓ 0 码 | ✓ 0 码（detail 明写「竖排 1 条」：看见了但不判） | **✗ `note-ink-narrow` 1 条 / 1 页** |
| @1600 逐条 | ✓ 0 码 | ✓ 0 码 | **✗ `note-ink-narrow` 1 条 / 1 页** |
| @760 样本集 29 页 | ✓ 0 码 | ✓ 0 码 | **✗ `note-ink-narrow`** |
| @360 样本集 | ✗ `note-clipped` 50px | ✗ `note-clipped` 50px | ✗ `note-clipped` 50px |
| 整轮 | **862 项 / 失败 1** | **852 项 / 失败 10** | **868 项 / 失败 4** |

* **交付物原样**：`--dir=dist` **868 项 / 0 失败**（改判据前同一份 dist 是 **862 / 0**）；`--compare` **874 / 0**。
* **独立探针**（T31 的脚本**一字未改**）：竖排 5 档 `行 1 / 列 18 / 列栈 362.64px / 内容盒 1369px（满宽）`，
  阈值 1173 / 1173 / 618.8 / 304.3 / 278.8 ⇒ **1440/1600/760 咬中**，390/360 由物理前置条件自动不判。
* **产物零变化**：判据改动后重建 ⇒ **303 文件逐个 sha256 全等**、全树摘要 `13b17d0a…` 相同。
* **Full Gate** 从 `action.yml` 现读 51 步 ⇒ **执行 48 / 通过 48 / 失败 0 / 跳过 3 · exit 0 · 249s**；`check:ci` **39 / 0**。

## M15 承重证明（每次门禁都跑）

`note-ink-narrow 1 条 [need/free-api/#0]` · `#0 vertical-rl 列 18 / 列栈 362.64px / 行 1 / 内容盒 1369px / 字形盒 22`
· `列宽 1380px · 阈值 1173px` · `note-narrow 0 条`（① 也看不见）· **盒宽与注入前一致 true**；
反例三条：铺满（80 列 / 1300px ≥ 1173px）⇒ 不报 · 只有 1 列 ⇒ 不报 · 横排不变。
**这不是「凡竖排必红」**：判据仍然是量出来的。

## 如实记录的两处偏差

1. **T31 的原靶页已经没有承重面**：`category/agent/` 自 `secondary-page-intro-changes-v1` 起
   `<main>` 里一条 `.snote` 都没有（目录页首屏说明整层删除）⇒ 形态注入后实测「说明 0 条」、门禁 0 码。
   变异靶页换成结构性成立的别名页 `need/free-api/`（那 1 条由 §22c ③b 断言「恰好 1 条」）。
2. 本载体 @390 就已自裁切（20px），原载体要到 @360（19px）——载体文本长度的差别，不是口径差别。

## 还没做（不冒充已解决）

生产环境「最近变化」非空分支的真实样本（三份日志 19 条事件全是 `fields.type = tool`，deal 型 0 条，**不造数据**）·
`.pdetailbody { max-width: 72ch }` 的窄列取舍 · 类名无关的散文普查 / 保留窄宽的机器可读清单 ·
`sideways-*` 无真实样本 · 竖排轴上没做 0.85 vs 0.5 的 A/B 标定。详见报告 §8 与自审 §2。

## 文件

报告 [`research/vertical-note-coverage-v1-report.md`](../blob/vertical-note-coverage-v1/research/vertical-note-coverage-v1-report.md) ·
自审 [`…-self-audit.md`](../blob/vertical-note-coverage-v1/research/vertical-note-coverage-v1-self-audit.md) ·
原始读数 [`research/_raw/vertical-note-coverage-v1/`](../tree/vertical-note-coverage-v1/research/_raw/vertical-note-coverage-v1)
（配对读数 · 探针逐档 · 产物零变化 · 复跑命令）
