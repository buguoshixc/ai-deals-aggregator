# notes-manifest-residual-v1（t14）：七个模块的 `.snote` 构造点接入登记，台账清零

闭合 t3（`notes-manifest-v1` / PR #63）如实登记的残余：`/models/*`、`/plans/*`、`/docs/data/`、`/archive/`、`/changes/`
这 58 页的 `.snote` 构造点原先落在 7 个模块里，只能靠「台账 + 整族下限 + 棘轮」守 —— 现在**逐条对账**。

## 改了什么

- 七个构造点全部接管（与 `lib/vendor-page.js` 同形：「产出那一段 HTML 的同一次调用里登记」）：
  `lib/models-page.js`（12 处）· `lib/plans-page.js`（11 处）· `lib/api-plans-page.js`（12 处）·
  `lib/plans-hub-page.js`（11 处）· `lib/data-docs.js`（8 处）· `lib/archive.js`（6 处：索引 4 + 详情 2）·
  `index.html` 的 RENDER-CORE（`changesPageHtml(radar, prefix, note)`，7 处）。
- `scripts/tools/build-local.js`：按 route 注入登记入口（`noteDeclarerFor(route)`）；**台账 8 族 / 58 页全部删除**
  （一条都没保留成豁免）；`noteUntracked()` 机制保留但**当前 0 调用点**（注释写明理由）；
  覆盖边界注释改写为「三类槽位全部逐条登记」。
- 每个构造点都在**它自己的分支里**登记（`cond ? note(...) : ''` / 模板里的 `${note(...)}`）——
  分支不触发就不登记，两侧同时少，不产生假警报。

## 读数

| | 改前 | 改后 |
| --- | --- | --- |
| `.snote` 清单声明 / 产物 | 14 / 271（其中 258 条靠台账） | **271 / 271** |
| `.pnote` / `.vsnote` | 159 / 159 · 150 / 150 | 159 / 159 · 150 / 150 |
| 逐条登记 / 组装点 pin | 323 条 / 1 条 | **580 条 / 0 条** |
| 台账页 / complete 页 | 58 / 128 | **0 / 186** |
| `dist/_notes.ndjson` | 104,591 B | 131,051 B |

- `npm run build` = exit 0（`✓ 页面级说明清单: 186 页 × 3 个槽位逐页对账一致 … 台账 0 页`）
- `node scripts/tools/verify-site.js --dir=dist` = **881 项 / 0 失败**（真浏览器 DOM，含 §22c ⑨ 六条）
- `node scripts/tools/check-ci-consistency.js --expect-checks=39` = 39 / 0 · `npm run check:evidence` ✅
- **产物变化面**（304 文件逐文件 sha256）：只有 2 个变化 —— `_notes.ndjson`（预期）与 `index.html`
  （首页把 RENDER-CORE 整段内联出货，模板源码 +831 B；**DOM 去 script/style 后逐字节相同**，`/changes/` 页面一个字节未变）

## 牙（实跑红 → 逐字节还原 → 复跑绿）

| # | 改动（登记不动，只改那一段 HTML 的类名） | 读数 |
| --- | --- | --- |
| M1 | `lib/archive.js`：`<p class="snote">` → `snote-drift` | 构建 **exit 1**：`✗ archive/#0 … 声明 5 / 产物 4` + `✗ archive/ 整页 .snote 5/4` |
| M2 | `lib/models-page.js`：`class="snote mcount"` → `snote mcount-drift` | 构建 **exit 1**：`✗ models/#1 声明 1 / 产物 0` + `✗ models/#0 声明 0 / 产物 1`（两方向） |
| M3 | **产物副本**改名 ⇒ `verify-site --dir=副本` | **exit 1**：`✗ §22c ⑨ … archive/#0 签名 <snote>：清单声明 5 条 / DOM 实测 4 条`（881/2） |

## 未验证（详见报告 §7）

`archive-detail` 一族生产 0 实例 ⇒ 登记路径从未实跑 · RENDER-CORE 的浏览器路径不带 `note`（直通）·
t3 台账的 257 与我实测的 258 差 1 条未归因 · 未跑 CI · 继承提交带来的 7 个 `research/_raw/*.js` 转换器
（Tier-3 同类，扩展名是 `.js` ⇒ `check:evidence` 不拦）保留并点名，处置建议见报告 §8。
