# v6 首页改版 · 最终报告

分支：`fix/v6-homepage`（base `master`）。PR：https://github.com/buguoshixc/ai-deals-aggregator/pull/149

## 1. 做了什么（A → B → C → D，按依赖顺序）

- **A1** `index.html` `.fmembers`：`overflow-x:hidden;overflow-y:hidden;text-overflow:ellipsis`，保留 `white-space:nowrap`；没有改成换行 chips（192px 定高会裁），链接和文本仍全在 DOM。
- **A2** 角标 unknown 三态：`label` 从「未标注截止日期」缩成「未标注」，`note` 全句不动；`title`/`aria-label` 仍是「官方未标注截止日期，以官方页面为准」；详情页「活动期限」仍用全句。
- **A3** `.facetsin` 两端渐隐（10px/26px mask），不加箭头、不改构建期注入的 DOM；`scrollbar-width:none` 现行 dist 已有。
- **B** 176KB 内联主脚本搬到 `assets/app.js`；构建期按 sha256 前 16 位写成 `app.<hash>.js`，`<script defer src>` 引入。同步改 `render-core` 的抽取（支持外链/JS）、`build-local` 暂存与 10 处 `loadShellParts`、`page-shell` 的 dealcopy 来源、`published-assets` 逐路径登记、`validate` 扫描面、4 个 selftest；`verify-site` 新增 §0（恰好 1 个 `app.<16hex>.js`、defer、无内联 RENDER-CORE、无 `assets/app.js` 源文件）。
- **C1** 390/≤560 的 10 张入口卡整块移到 `#dealsList` 之后：源序移进 `main`，≤560 用 `order:4`；≥561 用绝对定位 + `#main` 预留高度（153/313/378px）回到 `.rbar` 之上，避免流式解析造成的 CLS。`margin -20/-16` 抵消 `.wrap` 内边距，块宽恢复 390/1420。
- **C2** `#themeSeg` 三段不动；`.plansnav-api`/`.plansnav-cost` 降为普通文字链（透明、0 边框、11.5px/400），恢复全称「API / Token 计费对比」「API 成本计算器」；1240 断点保留，首枚实心药丸不变。
- **D1** 折叠键：`sourceUrl` 非空 → `src|sourceUrl|category|discountInfo`；为空保留厂商键。OpenRouter 8 条逐字相同并成 1 张「OpenRouter · 免费模型（8 个）」；Crouton（`ef3cba339a72`，限流口径不同）按规则单独成卡。现有智谱/百度千帆/火山方舟 3 张折叠卡不散。`data-model-count=8`、`data-quota=shared`、`#stats` 89/30/59、t1=8；排序取组内最早非空 `expiresAt`，全空退 lastSeen。
- **D2** `schema.js` 新增 `MAX_DESCRIPTION_LENGTH=600`（`excerpt` 仍 240）；`openrouter`/`appsumo`/`global_directories` 的 description cleanText 改 600；只重采 OpenRouter（`npm run collect -- --only=openrouter`），deals 恢复原序，保留 43 行有效 diff。上游描述本身以 `...` 结尾（ERNIE 原文 203 字符），**没有完整全文可恢复**，未补写、未前端加「已截断」。
- **同源折叠的额度摘要**：OpenRouter 合并卡用同义压缩（70 字，含「8 个模型共用同一份额度」），原文保留在 8 个成员详情页；这解决了「同源卡 shared 但卡上无额度说明」和 138 字被 clamp 的两条 verify 失败。

## 2. 六个数字（改前 → 改后）

| # | 指标 | 改前 | 改后 | 备注 |
|---|---|---|---|---|
| 1 | `dist/index.html` | 554,172 B | **318,916 B** | −42.4% |
| 2 | 首屏资源 br(q11) | 231,814 B / 36 个 | **237,356 B / 37 个** | +5,542 B / +2.39%，外链拆文件的压缩开销 |
| 3 | Lighthouse mobile TBT | 137.87 ms | **53.5 ms** | score 0.82 → 0.94 |
| 4 | Lighthouse mobile LCP | 3487.20 ms | **2630.8 ms** | 同一次 run 的 FCP 2294.9 / CLS 0.00089 |
| 5 | 390×900 首屏完整优惠卡 | 0 | **2** | grid 391.75、首卡 423.75–617.44 |
| 6 | 1240 顶栏 slack | 0 px（实测） | **0 px（实测）** | 任务书说 1px 未复现；search 221.39 → 228.55（+7.16），gh 右缘=内容右缘 1220，overflow 0 |

外链 JS：`dist/app.96016fea9674b1e2.js`，233,714 B。

## 3. 门禁

- `npm test` ✅（6 条已知 alias 告警，不红）
- `npm run build` ✅（89 卡、4 张折叠卡、自检全过）
- `npm run verify` ✅ **验收 1000 项，失败 0 项**（最终 build，PID 60260）
- `npm run check:reproducible` ✅
- `npm run verify:shots` ✅（1000/0 + 截图写入 `mockups/.preview/`）
- `text-selftest` 46/0、`ai:selftest` 135/0，其余 audience/provenance/roles-note/seo 均绿

## 4. 与第 0 步示意图的差异（详见 `real/COMPARE.md`）

- 示意图按字面 **9→1（88 卡）**；实现按 D1「discountInfo 逐字相同」做 **8+1（89 卡）**，Crouton 单卡。这是第 0 步已标出的规则冲突，不是实现退让。
- 示意图 `OR` 是占位；实现用 manifest 里 OpenRouter 官方矢量，`logoHtml` 对同源卡不再叠加成员厂 logo。
- 1240 搜索：示意图 203.61，最终 dist 228.55（C1/A1 后布局变化）。
- 390 合并卡标题都折两行；示意图是 138 字原文被 clamp，真图是 70 字同义摘要、无 clamp。
- 1440 网格 391 vs 390、390 网格 391.75 vs 390.75：Linux 字体度量差 1px。

## 5. 复现

```bash
export DSH_EDGE="$HOME/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome"
export LD_LIBRARY_PATH="$HOME/.local/lib/chromium-deps/usr/lib/x86_64-linux-gnu"
npm test && npm run build && npm run verify && npm run check:reproducible && npm run verify:shots
```

真图：`real/after-1440-light.png`、`real/after-1440-dark.png`、`real/after-390-light.png`（2×）。
