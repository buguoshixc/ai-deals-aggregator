# notes-manifest-residual-v1 自审（t14）

对象：7 个模块的 `.snote` 构造点接入登记 + `build-local.js` 的台账清零 + 报告/证据。
判定口径：**只写我自己实跑过的读数**；继承来的东西一律标注来源，能重跑的一律重跑。

## 1. 继承 vs 自证（我复跑了什么）

| 来源 | 我做了什么 |
| --- | --- |
| `68ff01c`（前一位 owner 的本地存档，6/7 模块） | 读全量 diff → `cherry-pick` 到 `70d7463`（无冲突）→ **自己构建**：`✓ 页面级说明清单 … .snote 声明 262 / 产物 271 · 台账 1 页` ⇒ 与它的交接说明一致；产物对比基线只有 `_notes.ndjson` 变化 ⇒ 那 6 个模块的改动**没有动渲染字节**（这条是它最需要被验证的，我验证了） |
| `index.html` RENDER-CORE（它未做） | 我自己接管：`changesPageHtml(radar, prefix, note)` + 7 处 `snote()`；`build-local.js` 的调用点注入 `noteDeclarerFor('changes/')`；台账删掉 |
| `/changes/` 的 api-plans 块（它漏了登记入口） | 构建自检点名 `changes/#0 声明 9 / 产物 13` ⇒ 我补齐 `apiPlanChangesPageBlockHtml(..., { note })` 后 271/271 |
| 它的报告/牙/证据 | 全部缺 ⇒ 本文件 + 报告 + `research/_raw/notes-manifest-residual-v1/` |

我丢弃了自己先前按同一约定改的 `archive.js` / `build-local.js` 版本（避免两套实现并存）；
这不算「重做」，因为两者的语义完全一致，只是它的覆盖更全。

## 2. 我自己做的改动（与继承分开记账）

| 改动 | 文件 | 为什么 |
| --- | --- | --- |
| `changesPageHtml` 第三个参数 + 7 处 `snote()` | `index.html` | 唯一剩下的 9 条未登记说明（RENDER-CORE 的 `changesPageHtml`） |
| `/changes/` 的 api-plans 块补 `note` | `scripts/tools/build-local.js` | 漏注入 ⇒ 4 条说明无登记（构建自检当场点名） |
| `changes/` 台账删除 + 登记意图注释改写 | `scripts/tools/build-local.js` | 台账清零（8 族全删）；注释不能继续写「台账 58 页」 |
| 覆盖边界 / `noteUntracked()` 文档更新 | `scripts/tools/build-local.js` | 说明「当前 0 调用点 + 机制保留的理由」 |
| 三颗牙 + 证据转写脚本 | `.arch-v1/`（Tier-3） | 牙的实跑与 Tier-1 证据生成 |

## 3. 我没验证的（不要当成已验证）

1. **`archive-detail` 的登记路径**：生产 0 个实例 ⇒ 从未实跑（报告 §7.1）。
2. **浏览器里调用 `changesPageHtml` 的路径**：不传 `note` ⇒ 直通分支；没有现场证据证明「浏览器确实调用它」（它由构建期调用是确定的）。
3. **t3 的 257 vs 我实测的 258**：差异 1 条未归因（报告 §7.3）；我全部结论只用我自己的两侧读数。
4. **CI**：没跑（本机四件套 + 三颗牙是完成证据）。
5. **继承提交的 7 个 `research/_raw/*.js` 转换器**：我**没有逐行读完全部**（`transform.js` 212 行只读了接口部分），
   所以我不为它们的正确性背书 —— 它们不是判据也不是产物，本轮结论不依赖它们。

## 4. 装置与流程问题（如实登记）

1. **PowerShell 写日志的编码**：`Tee-Object` 落的日志不是 UTF-8，`node` 读回来是乱码 ⇒
   第一次生成的 `readings.json` / `teeth.json` 里中文字段为空。修法：关键行改用 **PowerShell `Select-String` 提取后再落 UTF-8 JSON**
   （`research/_raw/.../readings.json` 的 `what` 字段已注明这一点）。
2. **`index.html` 是 HTML 不是 JS**：`node --check` 用不上；RENDER-CORE 的语法错误只能靠构建（vm 求值）暴露 ——
   这也是我第一次改完就 build 的原因。
3. **一次编辑事故**：对 `models-page.js` 的牙 M2，第一次改的时候连带把 `mcount` 后面的中文文本写错了一个词；
   我 `git checkout --` 还原后**重做了精确的等价改动**（只改 class token），再跑的读数才是报告里那一条。
4. **`.arch-v1/dist-baseline/`**：本分支起点的构建快照（304 文件），是「产物变化面」那一节的对照面；不进库。

## 5. 验收标准自检（逐条对应任务书 Acceptance）

| # | 验收项 | 自检结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 7 个模块的页面级说明构造点全部走 `ctx.note` / `noteDeclare()`，逐条登记 | 满足 | 构建自检 `271/271 · 580 条 · 台账 0 页`；`ledger-closure.json` 的按构造点分组 |
| 2 | 台账里那 58 页 / 8 族**被删掉**；保留的必须写理由 | 满足（**一条未保留**；机制保留但 0 调用点，理由写在代码注释与报告 §3） | `.arch-v1/dist-baseline/_notes.ndjson` 的 8 族 ↔ 现清单 0 族 |
| 3 | 至少两个不同模块的单条改名 ⇒ 构建 exit 1 点名 `route#index`；产物副本改名 ⇒ §22c ⑨ 点名；两处逐字节还原后复跑全绿 | 满足 | M1 `archive/#0` · M2 `models/#1`+`models/#0` · M3 `archive/#0`（DOM）；还原后 build 绿 + verify-site 881/0 |
| 4 | 断言只增不减（880/0），`check:ci` 39/0，`check:evidence` 绿 | 满足（**881**/0 —— 现行 master 基线就是 881，来自 t9；本任务未改 `verify-site.js`） | 报告 §6 |
| 5 | 产物变化面逐文件 sha256（只有 `_notes.ndjson` 变化；别的必须解释） | 满足（2 个变化：`_notes.ndjson` 预期 + `index.html` 已逐条解释） | `product-change-surface.json`；DOM 去 script 后逐字节相同 |

## 6. 范围与交付纪律

- 写入面：`scripts/lib/{models-page,plans-page,api-plans-page,plans-hub-page,data-docs,archive}.js`、
  `scripts/tools/build-local.js`、`index.html`（全部在 inScope）+ `research/notes-manifest-residual-v1-*.md`、`research/_raw/notes-manifest-residual-v1/`。
- 未写入：`docs/DESIGN-RULES.md`、`NEXT-STEPS.md`、`scripts/lib/seo.js`、`scripts/tools/{seo-verify,seo-selftest,verify-site}.js`、`scripts/data/`。
- `dist/` 只由 `npm run build` 重建（从未手工编辑）；判据文件一个字节未改。
- 一次性装置 / 副本 / 完整日志全在 `.arch-v1/`（gitignore，Tier-3）：**不进仓库**。
