# T1 证据摘要 — 布局族声明 + `.snote` 唯一出处 + Archive Detail 接入统一内容列

- worktree: `D:\OneDrive\Desktop\Code\AI Page\.worktrees\secondary-page-layout-unification`
- 分支: `secondary-page-layout-unification`，基线 `1f225d2`（见 `00-baseline-head.txt`）
- 证据目录: `research/_raw/secondary-page-layout-unification/t1/`
- Node v24.13.1

## 1. 改了哪些文件（`git status` 见 `08-scope-audit.txt`）

| 文件 | 增/删行 | 说明 |
| --- | --- | --- |
| `scripts/lib/page-kinds.js` | +119 / −0 | `LAYOUT_FAMILIES` 三族 + `LAYOUT_FAMILIES_WITHOUT_INSTANCES` + 18 个 kind 的 `layout` 字段 + `layoutOf()` + `assertLayoutDeclarations()` + 导出 |
| `index.html` | +9 / −0 | 共享 `<style>` 里新增解释注释 + **唯一一条** `.snote` 规则（冻结串，4 空格缩进）。正文/脚本 0 改动（0 删除行） |
| `scripts/tools/build-local.js` | +15 / −9 | 删除 **8** 条页面级 `.snote` 规则；档案详情调用点加 `mainClass`；文件头加样式纪律说明 |
| `scripts/lib/archive.js` | +46 / −0 | `ARCHIVE_ENTRY_MAIN_CLASS` 常量 + `assertPageHonesty` 的整页布局约束 + 导出 |
| `scripts/tools/archive-selftest.js` | +58 / −0 | 新增独立小节 ⑦″：常量 + 接线 + 4 条牙（替代性设计约束） |
| `scripts/tools/seo-selftest.js` | +59 / −0 | 新增小节 三′：布局族声明自洽 + 2 条牙 |

`page-kinds.js` / `index.html` / `archive.js` 的 `git diff` **删除行数为 0** ⇒
`FIXED_ROUTE_KINDS` / `ROUTE_PATTERNS` / `DEFAULT_FLOOR` / 各 kind 的 `textFloor` /
`itemList` / `sitemap` 一字未动；index.html 的正文与脚本一字未动。

## 2. 六条 verify 命令（按契约顺序，单次干净运行 `12-final-verify-run.txt`）

| # | 命令 | 退出码 | 关键读数 |
| --- | --- | --- | --- |
| 1 | `node scripts/tools/seo-selftest.js` | 0 | `69 项通过，0 项失败`（新增 6 项含 2 条牙） |
| 2 | `node scripts/tools/build-local.js` | 0 | `✅ 构建完成 → dist/（自检全过，已从暂存目录就位）`，186 个 HTML 页 |
| 3 | `node scripts/tools/archive-selftest.js --dir=dist` | 0 | `76 项通过，0 项失败`（新增 7 项含 3 条牙） |
| 4 | `node scripts/validate.js --strict` | 0 | `✅ 校验通过（strict 模式）`；2 条既有警告（与本次改动无关：疑似重复标题） |
| 5 | `node -e "…assertLayoutDeclarations()…"` | 0 | `kinds 18 layouts ok` |
| 6 | `node -e "…build-local `.snote { ` count === 0…"` | 0 | `build-local .snote 规则已清零` |

## 3. 产物读数

- `07-dist-snote-audit.txt`：**186/186** 页各含 `".snote { color: var(--mut)"` **恰好 1 次**；
  含 `max-width: 70ch` 的页 **0**；含字面量 `max-width: 70ch` 的页 **0**（任何选择器）。
- `10-frozen-string-audit.txt`：冻结串在 index.html 的 `<style>` 里出现 **1 次**，逐字等于契约串
  （行内容 `    ` + 冻结串，4 空格缩进）；`<style>` 里 `.snote` 规则总数 **1**。
- `11-no-other-snote-rules.txt`：`scripts/` 下 `.snote {` 规则残留 **0**；
  `index.html` 仅 1 条；`dist/changes/index.html`（原 70ch 页之一）现在只有共享那条 + `.snote.chgwarn`（仅改颜色）。
- `09-baseline-integrity.txt`：`dist.baseline/` 303 个文件，**最新 mtime 14:27:50（早于本次工作窗口）**，
  工作窗口内改动 **0** ⇒ 只读基线一个字节未动。

- `18-main-class-spotcheck.txt`：`mainClass` 机制在真实产物上的读数 ——
  `dist/models/deepseek-v3.2/index.html` 与 `dist/deal/<id>/index.html`（detail 族）都是
  `<main id="main" class="detail-main">`；`dist/archive/index.html`（wide 族，索引页）是 `<main id="main">`（不带 class）。
  档案详情调用点传的是同一个 `ARCHIVE_ENTRY_MAIN_CLASS` ⇒ 将来一生成就落在同一条 1120px 居中内容列上。

## 4. 「纯布局」机器证据：`13-dist-vs-baseline.txt` / `16-dist-vs-synth.txt`

`compare-dist-baseline.js`（只读）把两份产物都归一化（去 CSS 注释 → 去 `.snote` 规则行 → 去空白行）后逐字节比对：

- `dist/` vs `dist.baseline/`：303 vs 303 个文件，**新增 0 / 删除 0 / 逐字节相同 117 / 变化 186**；
  归一化后 **186/186 逐字节相同，0 个"其它差异"** ⇒ 每一页的差异只可能是
  `.snote` 规则集合 + 解释注释。数据 / 文案 / 路由 / 结构化数据 **0 变化**。
- 页面内 `.snote` 规则条数：基线 `0..2` → 本次 `1..2`（2 = 只有 `changes/` 那种还带 `.snote.chgwarn` 的页）。
- 交叉核对（信息性，只读）：T2 的预测脚手架 `dist.synth-fixed/`（`teeth/make-synth-fixed.cjs` 产出，
  **不是我的产物、我未改动**）与我的真实 `dist/` 归一化后也 **186/186 相同** ——
  即"真实构建产物"与"按 T1 改动预测的产物"逐页一致（`16-dist-vs-synth.txt`）。

## 5. 设计决定与边界（如实登记）

1. **`prose` 是"无实例族"**：契约要求 `assertLayoutDeclarations()` 返回空数组，同时又要求检查"没有孤儿族"，
   而 18 个 kind 里没有用 `prose` 的。取舍：把"当前无实例"作为一个**显式、可反查的登记**
   （`LAYOUT_FAMILIES_WITHOUT_INSTANCES = new Set(['prose'])`），而不是给 `prose` 开一个静默豁免口子：
   没登记的无实例族 ⇒ 红；登记了却有了实例 ⇒ 那条登记过期，同样红（`seo-selftest` 三′ 有对应牙）。
2. **`assertPageHonesty()` 的布局约束分「整页 / 片段」两种对象**：
   构建期传进去的是 `renderModelsShell()` 的产物（整页）⇒ 必须恰好 1 个 `<main>` 且 class 含 `detail-main`，
   缺失即硬失败；而 `renderArchiveEntry()` 返回的是**正文片段**（离线单测⑦直接喂它，片段里本来就没有 `<main>`）
   —— 那不是"缺布局"，而是"断言的对象不是一整页"。判据因此写成：**整页**必须有且只有一个 `<main>` 且带内容列；
   **片段**不要求 `<main>`，但只要出现 `<main>` 就必须同样满足（4 条牙覆盖：缺、无 class、两个、片段不误判）。
   我没有为了让它变绿去改单测⑦的既有断言 —— 现有断言一行未动。
3. **今天 0 个生产实例**：三份日志 ended/restored 各 0 条 ⇒ `/archive/<kind>/<id>/` 产物 0 页
   （构建日志 `0 个档案详情页`）。所以 §三 的判据是**替代性设计约束**：常量值 + 构建期接线 + 断言会响，
   三件事都在 `archive-selftest.js` 的 ⑦″ 里，断言文案明写"今天无生产实例，这是替代性设计约束"。

## 6. 越界 / 异常

- 未跑 `scripts/tools/verify-site.js`；未改 `verify-site.js` / `.github/**` / `package.json` / 任何 `*.json` 数据；
  未跑 `git commit`。
- **异常（非我所为，如实登记）**：验证期间工作树里出现了并发队友（T2）的脚手架目录 `dist.synth-fixed/`
  （14:43 创建，来自 `research/_raw/secondary-page-layout-unification/teeth/make-synth-fixed.cjs`）。
  我未创建、未修改它，只做了一次**只读**比对（见 §4）。我的真实 `dist/` 不受影响（最新写入 14:45:30，即我的构建）。
- 证据目录 `research/_raw/secondary-page-layout-unification/t1/` 内含我为核对而写的三个只读脚本
  （`audit-dist-snote.js` / `audit-frozen-snote.js` / `compare-dist-baseline.js`）与一个运行器
  `run-final-verify.ps1`（该运行器用 scriptblock 捕获退出码不可靠，**已弃用**；
  权威读数一律来自 `12-final-verify-run.txt` 的直接调用）。
