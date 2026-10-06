# T11 · 第二对抗者：锚点式 harness + 新绕过形态 + 修复前后基线

- **作者**：adversary（t11，独立于 t2/t5/t7/t4）
- **对象**：`scripts/tools/verify-site.js` §22c「Wide Data Page 页面级说明的同轴门禁」
- **修复前**：sha256 `4cae2fb2ab2599997668feca8c26c3161fe882a518e61d01552b7adc95f95756`（判据区锚点抽取 213 行 / `91d295365b40e60c…`）
- **修复后**：sha256 `4f4cb2e3b3f8e47d921137a5801d8692811a77d868a13c0a3516db8405d72ffb`（判据区 299 行 / `47cfc56165be000d…`；`wideMutate` 逐字未变 `b3d6ba24f3b65d41…`）
- **与 t5 的区别**：t5 的 `review/adversarial.cjs` **按行号**抽取判据（6144–6356），t7 修复后行号必漂；本 harness 按**锚点 + 花括号配对**抽取，两版都能抽，且抽到的就是源文件里的逐字文本。

---

## 1. 用法

```bash
# 模式 A（快）：浏览器内存注入 ⇒ 用抽取出的 wideMeasure/wideProblems 逐条判定
node research/_raw/secondary-page-layout-unification/adversary/harness.cjs \
  --mode=A --verify-site=scripts/tools/verify-site.js --dir=dist \
  [--forms=id1,id2] [--route=category/agent/] [--no-inject] [--json=out.json] [--tag=名字]

# 模式 B（硬）：形态写进 scratch 副本的共享 <style>（冻结串仍恰好 1 次）后跑**完整套件**
node …/adversary/harness.cjs --mode=B --verify-site=scripts/tools/verify-site.js --dir=dist \
  --scratch-name=dist-probe-after --forms=id1,id2 [--require-sha256=<64 hex>]

# 修复前判据：自建沙箱（复原件逐字节副本 + lib/node_modules/dist 三个 junction）
node …/adversary/harness.cjs --mode=A|B \
  --verify-site=research/_raw/secondary-page-layout-unification/adversary/sandbox-pre-t7/scripts/tools/verify-site.js \
  --dir=dist --tag=modeA-before
```

| 参数 | 含义 |
| --- | --- |
| `--verify-site=` | 被测验收脚本（默认 `scripts/tools/verify-site.js`；可指向复原件/沙箱） |
| `--dir=` | 被测量的产物目录（默认 `dist`；`--dir` 是**相对套件自己 ROOT** 解析的，harness 会自动换算） |
| `--mode=A\|B` | 见上 |
| `--forms=` | 只跑指定形态（`ctl-maxwidth-70ch` 正对照始终保留） |
| `--no-inject` | 只量「文件里已带形态」的产物（模式 B 的 scratch 就是这样） |
| `--scratch-name=` | 模式 B 的 scratch 目录名（默认 `<dist 名>-probe`），支持 before/after 各留一份 |
| `--require-sha256=` | 跑前钉住 verify-site 的 sha256，不符即 `exit 3` |
| `--only-green-from=` | 只跑上一轮里「放行」的形态 |

**退出码**：`0` 判定与期望一致；`1` 有形态与期望不符（模式 B 里「期望咬中却没咬到」= 假绿）；`2` 用法错误；`3` 判据锚点抽取失败（判红，不跑形态）。

### 锚点（不按行号）

| 抽取物 | 起点 | 终点 |
| --- | --- | --- |
| 判据区 | `const WIDE_TOL = 1;` | `function wideProblems(geometry, meta) {` 的函数体闭合（花括号配对，跳过注释/字符串/模板插值） |
| 变异牙 | `async function wideMutate(target, anchor, replacement) {` | 同函数体闭合 |

抽到后再校验 `wideMeasure/wideProblems/wideRoutesFromDisk/wideKindByRoute/wideSampleSet/WIDE_SNOTE_FROZEN/WIDE_DATA_SELECTORS/WIDE_TOL` 都在，缺一个也判红。
**锚点缺失 = 判红**（对照件 `fixtures/verify-site.no-WIDE_TOL.js` / `no-wideProblems.js`，读数 `runs/anchor-red-1.json` / `-2.json`，均 `EXIT=3` 并写明原因）。
**交叉校验**：对复原件抽取得到的判据区 213 行 / `91d295365b40e60c…`、`wideMutate` 14 行 / `b3d6ba24f3b65d41…` 与 t5 报告里记的读数**逐项相同** ⇒ 本 harness 的锚点抽取与 t5 的行号抽取等价。

### 模式 B 的注入约束（每次跑都记账）

`frozenCountBefore = 1 · frozenCountAfter = 1 · revertible = true`（去掉注入串可逐字节回退到原文件），scratch 只在 `adversary/scratch/**`，**绝不写 `dist` / `dist.baseline`**。

### 独立量测（不复用被测判据的任何数字）

1. **Range 字迹**：文本节点 `getClientRects()` → 并集宽 / 最长行 / 中位行 / 裁进盒内的最长行。
2. **像素字迹**（`inkFromPng()`，自带 PNG 解码）：说明元素截图 → 众数色为底、取显著不同的像素列 → `paintInkWidth / paintLongestRun / paintGaps`。
   它看得见判据结构上看不见的东西：伪元素 `content` 画的正文、被不透明层盖住的正文、被 `clip-path` 裁掉的正文、竖排形成的窄条。

---

## 2. 逐条判定（16 条，含 2 条对照）

| id | 方向 | 修复前 | 修复后 | 翻转 | 模式 B（修复后） |
| --- | --- | --- | --- | --- | --- |
| `ctl-no-inject` | 对照（不注入） | 放行 | 放行 | — | EXIT=0（预期，装置正常） |
| `ctl-maxwidth-70ch` | 对照（原缺陷 `max-width:70ch`） | 咬中 | 咬中 | — | EXIT=1（预期） |
| `transform-scaleX` | `transform: scaleX()` | 咬中 | 咬中 | — | — |
| `pseudo-content-narrow` | 伪元素承载正文 | 放行 | **放行** | — | **EXIT=0 ★假绿** |
| `text-indent-clip` | `text-indent` 负值 + `overflow:hidden` | 咬中 | 咬中 | — | — |
| `text-indent-shift` | 同上（多行变体） | 咬中 | 咬中 | — | — |
| `writing-mode-vertical` | `writing-mode`（盒被内容反推） | 咬中 | 咬中 | — | — |
| `writing-mode-vertical-fullwidth` | `writing-mode` + 盒宽锁满宽 | 放行 | **放行** | — | EXIT=1（只在 @360 靠 `note-clipped` 咬到，见 §4） |
| `font-size-tiny` | 极小 `font-size` | 放行 | **放行** | — | —（越界观察） |
| `letter-spacing-huge` | 极大 `letter-spacing` | 放行 | **放行** | — | —（越界观察） |
| `multicol-narrow-columns` | CSS 多列 | 放行 | **放行** | — | **EXIT=0 ★假绿 ×2** |
| `overlay-opaque` | 不透明覆盖层遮住右侧 | 放行 | **放行** | — | **EXIT=0 ★假绿 ×2** |
| `float-narrow-column` | 浮动占位把正文挤成窄列 | 放行 | **放行** | — | **EXIT=0 ★假绿 ×2** |
| `flex-decorator-item` | flex 容器 + 装饰项吃掉 70% | 放行 | 咬中 | **✅** | EXIT=1 |
| `grid-narrow-track` | grid 单轨变窄 | 放行 | 咬中 | **✅** | — |
| `clip-path-inset` | `clip-path` 裁掉右侧 | 放行 | **放行** | — | **EXIT=0 ★假绿** |

逐条读数（注入内容 / 有字区域实测宽 / 判定 / 违规码）见 `forms-table.md`；机器可读见 `baseline-current.json`、`after-repair.json`。

**仍放行的 6 条** = 2 blocker（multicol / float，修复后整轮 EXIT=0 且能由一次正常 CSS 改动引入）+ 3 high（overlay / pseudo / clip-path，整轮 EXIT=0 但需要注入级构造）+ 1 medium（writing-mode-fullwidth，桌面档绿、样本集@360 才咬到）。

---

## 3. 标定实验（决定要不要再开一轮修复）

`adversary/calibration-report.md` · 探针 `line-ink-calibration.cjs`（**独立探针，不接入套件**）· 原始读数 `runs/calibration-all.json`

候选判据 = 「行数 ≥ 2 且 **最宽一行** < 0.85 × min(主数据区宽, 页面列宽)」：

| 集合 | 逐条 | 候选命中 | 结论 |
| --- | --- | --- | --- |
| A `dist` | 105 页 / 401 条 | **0 条** | 零误报（阈值 0.5× 同样 0 条 ⇒ 不在阈值边缘） |
| B `dist.baseline` | 401 条 | 108 条 / 48 页 | 单独跑漏 48 条**单行**说明；漏的 48 条**全部**已被现行 `textWidth` 判据覆盖 |
| C `dist.synth-fixed` | 401 条 | **0 条** | 零误报 |
| D scratch 三形态 | 3 条 | multicol 咬中（最宽行 912.63 / 列 1380）· float 咬中（411.3）· overlay 放行 | 与预期逐条一致 |

⇒ **结论：加一条牙，不换牙** ——「现行 `textWidth` ∪ 新逐行牙」= 156/156 全覆盖、A/C 误报 0。前置条件「≥2 行」不能松（multicol 只有 2 行，≥3 行变体命中掉到 0；去掉则 89 条单行短说明误报）。

---

## 4. 两个必须写进报告的边界

**① 覆盖不对称（`writing-mode-vertical-fullwidth`）** —— 明细 `runs/coverage-asymmetry-writing-mode.json`
`@1440/@1600` 全站 186 页逐条判 401 条 **全绿**、`@390` 全站溢出 **全绿**、`@760` 样本集 **全绿**；只有 `@360` 样本集靠 `note-clipped`（`category/agent/#0`：`scrollWidth 347 > clientWidth 328`，溢出 19px）咬到 ⇒ 整轮 EXIT=1，**不是假绿**。但判据对「竖排让可见文字只剩一根 ~16px 宽竖条」这件事完全无感（1440 档实测像素字迹 338px、最长行 16px，判据 `textWidth` 却是 1380）；能看见它的路径只有 29 页样本集 —— 同一形态若落在不在样本集里的 wide 页上就是假绿。**范围不对称**：桌面两档覆盖全站却看不见它，样本集看得见但只有 29 页。

**② 绘制期隐藏 = P1 / DEFERRED** —— 普查 `runs/clip-census.json`
252 个源文件 + 186 个产物 HTML：`clip-path` 0、`mask-image`/`mask:`/`-webkit-mask` 0、`mix-blend-mode` 0、`filter:` 0 ⇒ 只能靠手改共享样式或注入造出（`clip-path: path()`、位图 `mask-image` 也无法用有限规则穷尽）。**残余风险**：本仓库自己的「限字」写法是 `overflow:hidden`（产物 4942 次）× `-webkit-line-clamp`（559 次，`.g h3`/`.of .tx`/`.tierhead .hint`）——它们单独不会把说明压窄（截断在右侧、行宽仍满宽），但「说明被视觉截断」的把手是现成的。

---

## 5. 交付物与证据索引

```
adversary/
├── harness.cjs                   锚点式对抗 harness（模式 A/B、参数化）
├── line-ink-calibration.cjs      逐行字迹标定探针（独立探针，A/B/C/D 四集合）
├── clip-census.cjs               绘制期隐藏词汇量普查
├── build-reports.cjs             runs/*.json → 交付物
├── README.md · calibration-report.md · forms-table.md
├── baseline-current.json         修复前判据下的绕过基线（sha256 + 逐条 + 模式 B 假绿清单）
├── after-repair.json             翻转表 + findings + 标定 + 普查 + 覆盖不对称 + 可复现命令
├── fixtures/                     两个「锚点缺失」对照件（证明锚点找不到 = 判红）
├── sandbox-pre-t7/               自建修复前沙箱（复原件副本 + lib/node_modules/dist junction）
├── runs/                         全部原始读数（modeA-*、modeB-*、suite-*.json、calibration-all.json、
│                                 clip-census.json、coverage-asymmetry-writing-mode.json、anchor-red-*.json、shots/*.png）
└── scratch/{dist-probe-after,dist-probe-before}/   模式 B 的产物副本（绝不回写 dist）
```

**纪律**：只写 `adversary/**`；不碰 `dist` / `dist.baseline` / `dist.synth-fixed`（只读服务）；不改任何生产源码；不 `git commit`；浏览器套件串行。
`scripts/tools/verify-site.js` 在本任务中**从未被写入**（全部读数都带 sha256 记账，模式 B 每轮都核对跑前/跑后 sha 相同）。
