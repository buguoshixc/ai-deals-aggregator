## 这次修的是什么

**Leaf / Detail Page 布局修复**：`/deal/<id>/` 与 `/models/<slug>/` 的正文固定在约 820px 并贴在容器左边，
右侧大片空白；模型详情页又是另一套宽度（整幅 1380px）—— 两族叶子页从来就不在同一条内容轴上。

### Root Cause

共享 `<style>`（`index.html`，deal 详情页与模型页都从它抽取）把宽度**写死在卡片自己身上**：

```css
.dpane     { … max-width: 820px; }
.dpane-src { … max-width: 820px; word-break: break-all; }
```

而外层只有 `.wrap { max-width: 1420px; margin: 0 auto; padding: 0 20px 60px; }` ——
详情主体**没有任何居中容器**。实测（Edge 1440×900，`/deal/2eae0e246de2/`）：

```text
main    30 … 1410  (1380)   ← .crumb / .dpane-more 铺满
.dpane  30 …  850  ( 820)   ← 贴左
居中偏差 = 30 − (1440−850) = 560px
```

### 改法

| 文件 | 改动 |
|---|---|
| `index.html`（共享 `<style>`，唯一视觉规则来源） | 新增 `.detail-main { width: min(1120px, 100%); margin-inline: auto; }`；`.dpane` / `.dpane-src` 改为随列全宽；`.dpane-src` 改 `word-break: normal` + `overflow-wrap: anywhere`；`.dpane-more` 补 `margin-top: var(--s3)` |
| `scripts/tools/build-local.js` | deal 详情 `<main class="detail-main">`；`renderModelsShell()` 增 `mainClass`（缺省不动），只有**模型详情**调用点传 `'detail-main'` |
| `scripts/tools/verify-site.js` | 新增 §22b 41 条真浏览器断言 + M1–M5 变异牙（`+583 / −0`，既有断言一行未改） |

**没有**新建 `detail.css` / `deal-detail.css` / `detail-fix.css`；**没有**改数据、文案、颜色、字体、卡片。
`Header(.topin)` 与 `Footer` 刻意不跟着缩窄；首页 `main` 不带 `detail-main`。

### 实测（Edge，真浏览器 `getBoundingClientRect()`）

| | 改动前 | 改动后 |
|---|---|---|
| deal `main` @1440 | 1380px | **1120px** |
| deal 居中偏差 | **560px** | **0px** |
| `.dpane` | 820px | **1120px** |
| `.dpane-src` | 820px / `break-all` | **1120px / `normal` + `overflow-wrap: anywhere`** |
| model `main` @1440 | 1380px | **1120px** |
| 同轴极差（crumb / dpane / dpane-more / dpane-src） | — | **0px** |
| `.topin` / `footer` | 1420 / 1380 | **1420 / 1380（未缩窄）** |
| 首页 `main` | 1380 | **1380（未波及）** |

- 三档桌面（1600/1440/1280）deal 与 model 列宽均为 1120px、居中偏差均 0px；@768 列宽 728 == 可用宽；
  @390 `documentElement.scrollWidth` 390（无横向滚动）；
- 波及面：186 页全量扫描 —— 带 `class="detail-main"` 的 `<main>` 恰好 **131** 个（80 deal + 51 model），
  非叶子页 **0** 个；全站 `max-width: 820px` 声明 **0** 处。

### 牙（Mutation / Tooth Test，全部真红）

| ID | 变异 | 期望违规码 | 实测 |
|---|---|---|---|
| M1 | 去掉 `.detail-main` 的 `margin-inline: auto` | `center` | 列 30..1150 ✅ |
| M2 | 内容列改回 820px | `width` | W=820 ✅ |
| M3 | `.dpane-src` 改回 820px | `src-width` | `[axis, src-width]` ✅ |
| M4 | 去掉 `overflow-wrap: anywhere` + 200 字符不可断超长 URL | `page-overflow@390` | scrollWidth 390 → **1213** ✅ |
| M5 | 只把 model 列改成 1100px | `leaf-consistency` | `[leaf-consistency]` ✅ |

外加：**锚点唯一性守卫**（不存在 / 出现 3 次的锚点都必须 `ok:false`，自检已绿）、**M4 正对照**
（同样注入超长 URL、不动 CSS ⇒ 不溢出）、**产物 sha256 零污染**（变异前后 `1ad7d3f5…` / `562f37bf…` 相等）。

### 数据层零变化（三条独立证据）

1. `git diff --name-only master..HEAD -- deals.json plans.json api-plans.json models.json model-registry-links.json scripts/data` = **空**；
2. 改动前后**全产物**对账：303→303 文件、**117/117 非 HTML 文件逐字节相同**、
   **186/186 HTML 页剥掉样式与 `detail-main` 类后正文逐字节相同**、样式块行集合差恰好 **+8 / −2**；
3. Full Gate 里的 strict 校验 / 可重建性 / 历史一致性 / models·plans·api-plans 可重建性全部通过。

### 本地 Full Gate（提交 `f2dec0c`）

```text
CI 口径检查 38 项，失败 0 项
Gate action 49 步 → 本机执行 45 步，通过 45，失败 0（4 步为 CI 专用 shell / npm ci 已装）
  · Real-browser acceptance (verify-site.js)  → ✅ 验收 776 项，失败 0 项（含 §22b 41 项）
  · Regression verify (baseline compare)      → ✅ 验收 782 项，失败 0 项
```

### 独立复查（另写一套探针，不 require 本仓库任何代码）

`verdict = pass` · **P0 = 0 · P1 = 0 · REPAIR_NOW = 0**（自算判据 32/32）；同一把尺子前后三次测量
数值差异 0；反空洞守卫负例（自造锚点缺失的产物副本）实测让 `verify-site.js` 失败 4 项、退出码 1。
