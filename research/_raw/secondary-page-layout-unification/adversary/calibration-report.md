# T11 · 逐行字迹判据的标定实验（只读独立探针）

- **探针**：`adversary/line-ink-calibration.cjs`（**独立探针，不接入套件**；`scripts/tools/verify-site.js` 一个字节未动）
- **口径**：对每条 `.snote` 把全部非空白文本节点的 `getClientRects()` **按垂直覆盖归并成行**，取「最宽一行」`widestLine`；
  **候选判据 = 行数 ≥ 2 且 `widestLine < 0.85 × min(主数据区宽, 页面列宽)`**（另跑阈值 0.5 与「≥3 行」两个敏感度变体）
- **视图**：1440 档；产物只读服务，绝不写入（`dist` / `dist.baseline` / `dist.synth-fixed` 均未被触碰）
- **判据版本**：`scripts/tools/verify-site.js` sha256 `4f4cb2e3b3f8e47d…`（修复轮 2 后），判据区锚点抽取 sha256 `47cfc56165be000d…`
- **原始读数**：`adversary/runs/calibration-all.json`

## 1. 四个集合的读数

| 集合 | 产物 | 逐条 | 候选命中（0.85×/≥2 行） | 阈值 0.5× | ≥3 行 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| **A** 正确产物 | `dist` | 105 页 / **401 条** | **0 条 / 0 页** | **0** | **0** | ✅ 无误报 |
| **B** 缺陷产物 | `dist.baseline` | 105 页 / 401 条 | **108 条 / 48 页** | 108 | 100 | ⚠️ 见 §2 |
| **C** 合成修复产物 | `dist.synth-fixed` | 105 页 / 401 条 | **0 条 / 0 页** | 0 | 0 | ✅ 无误报 |
| **D** scratch 三形态 | `dist-probe-after`（只量 `category/agent/`） | 3 条 | multicol **咬中** · float **咬中** · overlay 放行 | multicol 1 条 · float 2 条 | multicol 0 条 · float 2 条 | 与 captain 预期一致 |

**A 集合零误报**这一点在阈值上很稳：0.85× 与 0.5× 在 A/B/C 三个集合上给出**完全相同**的命中集合 ⇒ 不是卡在阈值边缘的巧合。

## 2. B 集合为什么不许「只看 108」：候选判据单独跑会漏，但与**现行判据取并集后 156/156 全覆盖**

与 `geometry/truth-401.json` 逐条对账（`route#index` 集合差）：

```
期望窄 156 条 = caughtByOldCriteria 48 条 + onlyNewTruth 108 条
候选命中 108 条
漏 48 条 —— 其中属于 caughtByOldCriteria 的 0 条、属于 onlyNewTruth 的 48 条
额外命中（误报）0 条
```

**漏掉的 48 条是什么**：全部是**行数 = 1 的单行说明**，落在被压窄的盒子里（例：`category/agent/#1` 文本「全部变化 →」行数 1 / 最宽行 61.64px / 盒宽 452.81px；`changes/#5` 单行 403.92px / 盒宽 452.81px）。
它们的 `现行 textWidth = 453 < 1173` ⇒ **现行判据已经全部咬到**（实测字段 `currentNarrow: true`）。

⇒ **结论：这是「加一条牙」，不是「换一条牙」。** `textWidth`（内容盒宽）那条继续留着管「盒内可用区域被压窄、文本只有一行」的情形；
新牙管「盒子满宽、但文本字迹在横向上没铺满」的情形。**并集 = 156/156 全覆盖 · 误报 0**。

## 3. D 集合逐条

| 形态 | 注入到 scratch 共享 `<style>` | 行数 | 最宽行 / 列宽 | 盒宽 | 候选判据 |
| --- | --- | --- | --- | --- | --- |
| `multicol-narrow-columns` | `.snote { column-count: 3; column-width: 340px; column-gap: 16px; }` | 2 | **912.63 / 1380**（= 66%，右侧 1/3 空白） | 1380 | **咬中** |
| `float-narrow-column` | `.snote::before { content:""; float:right; width:70%; height:6em }` | 4 | **411.3 / 1380**（= 30%） | 1380 | **咬中** |
| `overlay-opaque` | `.snote{position:relative} .snote::after{inset:0 0 0 30%;background:#f6f7f9}` | 1 | 1351.69 / 1380 | 1380 | 放行（预期：绘制遮盖 ⇒ DEFERRED） |

## 4. 为什么这条候选判据的语义是「字迹有没有横向铺满」——以及它的边界（务必写进报告）

`multicol` 那条命中的是 **912.63px（66%）**，而不是单列宽度 447px：因为竖排/多列里，不同列的文字片段共享同一垂直带，探针按「垂直覆盖」归并时把它们并成了「一行」。
这不是 bug，而是这条判据的**语义**：它量的是「字迹在横向上铺到哪里」——
· 3 列里只用了 2 列（右侧 1/3 空白，正是缺陷原型「左边一根窄柱、右边半截空白」）⇒ 912.63 < 1173 ⇒ **咬中** ✓；
· 若字迹铺满了整盒（很多细列排满全宽，没有大片空白）⇒ 归并后 ≥ 0.85×列宽 ⇒ 放行 —— 这种形态**没有**「右边半截空白」的观感，放行是符合承诺的。
**边界（必须标定后才能定稿）**：
1. 「≥2 行」这个前置条件不能松（D 集合里 multicol 在「≥3 行」变体下变成 **0 条命中**：它只有 2 行）；也不能去掉（A 集合里 89 条单行短说明会被误报）。
2. 归并容差没有参数化（当前按垂直覆盖 > 50% 片段高）。若将来出现 `column-gap` 极小或 `writing-mode` 的形态，需要按列/按连续字迹段再细分。
3. 只在 1440 档标定过；要做到与 §22c 同覆盖，需要在 1440/1600 两档都算（成本与现有 `wideMeasure` 相同量级，不增加导航）。

## 5. 复现

```bash
# A/B/C/D 全跑（只读；约 6 分钟）
node research/_raw/secondary-page-layout-unification/adversary/line-ink-calibration.cjs \
  --set=all --json=research/_raw/secondary-page-layout-unification/adversary/runs/calibration-all.json
# 单跑某一集合
node …/line-ink-calibration.cjs --set=dist|baseline|synth|forms
```
