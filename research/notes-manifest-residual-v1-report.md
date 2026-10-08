# notes-manifest-residual-v1（t14）：七个模块的 `.snote` 构造点接入登记，台账清零

> 分支 `notes-manifest-residual-v1b`（基于 `origin/master` `70d7463`）· 交付：本文件 + `-self-audit.md` + `research/_raw/notes-manifest-residual-v1/`
> 前置：t3 `notes-manifest-v1`（PR #63 → `8c9fb29`）建了「先登记、后输出」的意图清单，并如实登记了残余 58 页 / 8 族；
> 本任务把残余闭合 —— 七个构造点全部接管（`ctx.note`），**台账从 58 页清到 0 页**。

## 0. 一句话结论

原先只能靠「台账 + 整族下限 + 棘轮」守着的 58 页现在**逐条对账**：186 页全部 `complete`，
清单声明 `.snote` **271 / 产物 271**、`.pnote` 159/159、`.vsnote` 150/150，逐条登记 **580** 条、组装点 pin **0** 条、台账 **0 页**。
三颗牙实跑：两个不同模块的单条类名改名 ⇒ **构建 exit 1 并点名 `route#index`**；产物副本的单条改名 ⇒ **verify-site §22c ⑨ exit 1 并点名 `archive/#0`**；全部逐字节还原后 `npm run build` 与 `verify-site` 复跑全绿（881/0）。
产物变化面 304 文件里只有 2 个变化：`_notes.ndjson`（预期）与 `index.html`（**必须解释**，见 §5）。

## 1. 起点与继承（我选了哪条路）

- t14 的前一位负责人留下**本地存档提交** `68ff01c`（分支 `notes-residual-v1`，未推送）：6/7 模块已接管、
  `index.html` 的 RENDER-CORE 未接管、台账剩 1 页（`changes/`）、牙与证据未跑、报告未写。
- **我选「在它之上继续」**：把我这边（按同一约定先做的）`archive.js` / `build-local.js` 改动丢弃，
  在 `70d7463` 上 `git cherry-pick 68ff01c`（**无冲突**，因为 master 那 3 个合并提交没有碰这 7 个文件），
  然后自己收尾。理由：① 它用的约定与 t3 报告 §5 指定的完全同形（`ctx.note` / `noteIn()`，与 `lib/vendor-page.js` 一致）；
  ② 「机械改动」的价值在于**只有一份实现**，两套并存反而是风险；③ 它的读数我一条都不采信，全部重跑（§2/§4/§6 都是我自己跑出来的）。
- **它不够用的地方**（我补齐的）：`index.html` RENDER-CORE 的 9 条未接管；`/changes/` 的 `api-plans-page.js`
  那一块**没拿到登记入口**（`apiPlanChangesPageBlockHtml` 调用点漏传 `note`，构建自检当场点名
  `changes/#0 声明 9 / 产物 13`）；`build-local.js` 里关于覆盖边界的注释仍写着「台账 58 页」；
  报告/自审/证据/PR 全缺。

## 2. 交付面（一次读数）

| 读数 | 值 |
| --- | --- |
| 页面 | 186（`complete` **186** / 台账 **0**） |
| `.snote` | 清单声明 **271** == 产物 **271**（改前：声明 14 / 产物 271，其中 257+1 条靠台账） |
| `.pnote` / `.vsnote` | 159 / 159 · 150 / 150 |
| 逐条登记 | **580** 条（组装点 pin **0** 条） |
| 清单文件 | `dist/_notes.ndjson` 104,591 → **131,051 B**（逐字节口径见 §5） |

按**构造点**分组（`declaredBy` 归并，来自 `dist/_notes.ndjson`）：

| 构造点 | main-snote | main-pnote | main-vsnote | 合计 |
| --- | ---: | ---: | ---: | ---: |
| `lib/models-page.js` | 209 | — | — | 209 |
| `build-local.js`（含目录页 / 状态页 / 订阅页） | 13 | 159 | — | 172 |
| `lib/vendor-page.js` | — | — | 150 | 150 |
| `lib/plans-hub-page.js` | 11 | — | — | 11 |
| `lib/plans-page.js` | 10 | — | — | 10 |
| `lib/api-plans-page.js` | 9 | — | — | 9 |
| `lib/data-docs.js` | 9 | — | — | 9 |
| `lib/archive.js` | 5 | — | — | 5 |
| `index.html` 的 RENDER-CORE（`changesPageHtml`） | 5 | — | — | 5 |

七个接管模块的构造点：`archive.js` 6 处（索引 4 + 详情 2）· `data-docs.js` 8 处 · `plans-hub-page.js` 11 处 ·
`api-plans-page.js` 12 处（含 `/changes/` 共用块）· `plans-page.js` 11 处（含 `/changes/` 共用块与 `pnoscript`）·
`models-page.js` 12 处 · `index.html` RENDER-CORE 7 处。**每个构造点都在它自己的分支里**
（`cond ? note(...) : ''` 或模板里的 `${note(...)}`）——分支不触发就不登记，两侧同时少 ⇒ 不产生假警报。

## 3. 台账清零（逐族对照）

改前 `dist/_notes.ndjson` 的 8 个族（58 页）逐条删除，**一条都没有保留成豁免**：

| 族 | 页数 | minNotes（改前） | 归属模块 | 接管方式 |
| --- | ---: | ---: | --- | --- |
| `models-detail` | 51 | 2 | `lib/models-page.js` | 12 处构造点走 `noteIn(ctx)` |
| `models-index` | 1 | 1 | `lib/models-page.js` | 同上 |
| `plans-coding` | 1 | 1 | `lib/plans-page.js` | 含原「组装点 pin」的 `pnoscript`（现在是真的构造点登记） |
| `api-plans-index` | 1 | 1 | `lib/api-plans-page.js` | 同上 |
| `plans-hub` | 1 | 1 | `lib/plans-hub-page.js` | 同上 |
| `data-docs` | 1 | 1 | `lib/data-docs.js` | 同上 |
| `archive-index` | 1 | 2 | `lib/archive.js` | 同上 |
| `changes` | 1 | 2 | `index.html` RENDER-CORE + `plans-page.js` + `api-plans-page.js` | 三处都接管（RENDER-CORE 新增第三个参数） |

- 删除的调用点：`noteUntracked(...)` **8 个块**（7 个在继承提交里 + `changes/` 那 1 个在本轮），
  加上 `archive-detail` 那块（生产 0 个实例的防御性分支）。
- **台账机制保留、调用点 0 个**：`noteUntracked()` 仍在（构建期与 §22c 的「台账下限」判据也仍在），
  但当前**没有任何页面族需要它**；`build-local.js` 的覆盖边界注释、`noteUntracked()` 的文档都改成
  「当前 0 调用点 + 下一个构造点确实不在本文件路径上的族仍可用它如实登记」。
- `/plans/coding/` 原来的 **pin** 也没了（`pinnedNotes: 0`）——`pnoscript` 提示现在是 `lib/plans-page.js` 的构造点登记。

## 4. 牙（三颗，全部实跑变红 → 逐字节还原 → 复跑绿）

| # | 模块 | 改动（**登记不动**，只改那一段 HTML 的类名） | 读数 | 还原 |
| --- | --- | --- | --- | --- |
| M1 | `lib/archive.js` | `<p class="snote">${ARCHIVE_DESCRIPTION}</p>` → `class="snote-drift"` | **构建 exit 1**：`✗ archive/#0 槽位 main-snote 签名 <snote>：清单声明 5 条、产物里数出 4 条` + `✗ archive/ 整页 .snote：声明 5 / 产物 4` | `git checkout --` → 构建 271/271 绿 |
| M2 | `lib/models-page.js` | `class="snote mcount"` → `class="snote mcount-drift"` | **构建 exit 1**：`✗ models/#1 签名 <mcount snote>：声明 1 / 产物 0` + `✗ models/#0 签名 <mcount-drift snote>：声明 0 / 产物 1`（两个方向都点名） | 同上 |
| M3 | **产物副本**（`dist/archive/index.html` 的 `<p class="snote" id="archive-links">` → `snote-drift`） | `node scripts/tools/verify-site.js --dir=<副本>` | **exit 1**：`✗ §22c ⑨ 逐页逐槽位对账 … 1 处不一致：archive/#0 槽位 main-snote 签名 <snote>：清单声明 5 条 / DOM 实测 4 条`（**真浏览器 DOM**）+ `✗ §22c ⑨ 完整对账：archive/ 声明 5 / DOM 4`；`❌ 验收 881 项，失败 2 项` | 改的是**副本**（`.arch-v1/teeth/prod-rename/`，Tier-3）；原 `dist/` 一个字节未动 ⇒ 原样复跑 **881 / 0** |

M1/M2 用的是**两个不同模块**，且都点名到 `route#index`（不是「有说明面变了」这种笼统判据）；
M3 走的是 `verify-site` 的真 DOM 那一侧 —— 与构建期的回读互不依赖（两条独立的尺子）。

## 5. 产物变化面（逐文件 sha256）

基线与本分支各构建一次（同机、同数据），**304 文件**逐文件 sha256：

| 文件 | 状态 | 前 | 后 |
| --- | --- | --- | --- |
| `_notes.ndjson` | changed | `58a7373b502dbbde…` / 104,591 B | `8a04cebabe91df91…` / 131,051 B |
| `index.html` | changed | `a4a12094a85214af…` / 405,756 B | `a8282f788f3b1505…` / 406,587 B |
| 其余 **302** 个 | 逐字节相同 | — | — |

**`index.html` 那处变化的逐条解释**（这是本任务唯一需要解释的产物变化）：
首页把 RENDER-CORE 整段**内联**在 `<script>` 里出货（浏览器复用同一份模板），所以
`changesPageHtml` 的源码本身是产物的一部分 —— 新增第三个参数与 `snote()` 包装让这份内联副本多了 **831 字节**。
同一次构建里：① 去掉 `<script>`/`<style>` 段后的 DOM 部分**逐字节相同**（84,320 == 84,320）；
② `/changes/` 页面的 HTML **一个字节未变**（它是构建期调用同一函数渲染出来的）。
即：**渲染结果零变化，变的是随页面出货的模板源码**。

## 6. 门禁读数

| 命令 | 读数 |
| --- | --- |
| `npm run build` | exit 0 · 304 文件 · `✓ 页面级说明清单: 186 页 × 3 个槽位逐页对账一致（.snote 271/271 · .pnote 159/159 · .vsnote 150/150）· 逐条登记 580 · 台账 0 页` |
| `node scripts/tools/verify-site.js --dir=dist` | **881 项 / 0 失败**（真浏览器；含 §22c ⑨ 六条） |
| `node scripts/tools/check-ci-consistency.js --expect-checks=39` | 39 项 / 0 失败 |
| `npm run check:evidence` | ✅ 无新增 Tier-3 · 清单自证通过 |

**断言数只增不减**：`verify-site` 881（本任务**没有改** `verify-site.js` 一个字节 ——
任务书写「master 现值 880」是 t9/PR #89 合并**之前**的数字，现行 master 本身就是 881）；
本任务增加的是**登记面**（声明 14 → 271、台账 58 → 0），不是判据条数。

## 7. 未验证 / 边界（诚实清单）

1. **`archive-detail` 一族（`lib/archive.js` 详情页 2 处构造点）**：生产 0 个 ended/restored 实例 ⇒
   那个循环**从不执行**，登记路径**从未实跑**（按 `assertPageHonesty` 与台账时代的同样理由保留）。这是「已接管但未被现场证据覆盖」的一处。
2. **RENDER-CORE 的浏览器路径不带 `note`**：`dist/index.html` 里那份内联副本若在浏览器里被调用，
   第三个参数是 `undefined` ⇒ 直通（页面照常渲染）；登记只在构建期发生。判据由构建期那一遍负责，这一点写在函数注释里。
3. **t3 台账写的 257 条与我实测的 258 条**：我按同一口径（`noteSignaturesInMain` 同构）在**改前产物**的这 58 页上数出 **258** 条 `.snote`。
   差异 1 条没有归因到具体提交（t3 交付后 master 上还有 `/status/`、`/plans/` 等页面的内容合并）。本报告的
   「前后对照」用的都是我自己的两个读数（14→271 声明、258 产物），不与 t3 的 257 混用。
4. **`research/_raw/notes-manifest-residual-v1/*.js`（7 个文件）**：继承提交带进来的**一次性转换器**
   （`transform.js` + `fixup*.js` + `recon*.js`）。按 `docs/EVIDENCE-POLICY.md` §3，这类探针属于 Tier-3
   （类别写的是 `*.cjs`），只是扩展名是 `.js` ⇒ `check:evidence` 不会拦。我**保留**它们（它们就是这轮机械改动的可复现证据）
   并在此点名；处置建议见 §8。
5. **没跑 CI**：本机 `npm run build` / `verify-site` / `check:ci` / `check:evidence` 是完成证据，PR 门禁读数以 PR 页面为准。

## 8. 给 captain 的收口建议（≤5 行，未改 `docs/DESIGN-RULES.md` / `NEXT-STEPS.md`）

`docs/DESIGN-RULES.md`：

> **说明面没有例外**：全站 `<main>` 里的 `.snote` / `.pnote` / `.vsnote` 一律「先登记、后输出」（构造点调用 `ctx.note`）；台账（`noteUntracked`）只用于构造点确实不在清单文件代码路径上的页面族，且必须写明归属模块 —— 当前 0 页。

`NEXT-STEPS.md`：

> **证据政策补一条**：`research/_raw/**/*.js` 与 `*.cjs` 同类（一次性探针/转换器 → 结论进 Tier-1 后即可弃），本任务保留了 7 个转换器（点名见报告 §7.4）——请决定是补进 Tier-3 类别还是要求删除。

## 9. 复现命令

```powershell
cd .worktrees/notes-manifest-residual-v1b
npm ci; npm run build                      # ✓ 页面级说明清单 271/271 · 台账 0 页
node scripts/tools/verify-site.js --dir=dist      # 881 / 0
node scripts/tools/check-ci-consistency.js --expect-checks=39
npm run check:evidence

# 牙（改一处 → 构建红 → 还原 → 复跑绿）；装置与原始日志在 .arch-v1/（Tier-3，不进库）
node .arch-v1/teeth/prod-rename.cjs        # M3：副本改名 ⇒ §22c ⑨ 点名 archive/#0（881/2）
node .arch-v1/scan-notes.cjs --only-ledger .arch-v1/ledger-scan-before.json
node .arch-v1/make-evidence-t14.cjs        # 重建 research/_raw/notes-manifest-residual-v1/ 的四个 JSON
```
