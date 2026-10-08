# `criteria-adversary-v1-reattack`（t11）自审

配套：`research/criteria-adversary-v1-reattack-report.md` ·
`research/_raw/registry-adversary-v1/{reattack-copies.json, reattack-extra.json, reattack-README.md}`

## 1. 我声称的 vs 我实际量到的

| 声称 | 原始读数 | 强度 |
| --- | --- | --- |
| 9 条破防全闭合 | `att`/`forge`/`forge-ctl`/`forge3`/`forge3-ctl`/`sb-two`/`sb-ghost`/`sb-second`/`sb-list*` 的 JSON（`reattack-copies.json`） | 直接读数；R2/R3/R4/R5 用「判据副本输出**完整**点名清单」确认（不是靠前 4 条抽样） |
| 守住面 15 条无回归 | 同上（`grtl`/`gxf`/`g19` 0 失败或唯一红属另一形态） | 直接读数 |
| 前 3 名绕过路径闭合 | `g300` 比值 0.644 · 全清单含三页 · `need/ai-coding/` | 直接读数 |
| 产品零改动 | `dist` 全树摘要前后同一串（`df43587c…`）× 304 文件 · `git status` 空 · 注入器逐副本 `意外变更 0` | 直接读数 |
| 新破防 N14 | `newd2` **881/0** + 探针（说明自身 `scroll==client`、父盒 8px） | 直接读数 |
| 新破防 N8/N9（判据级） | `newb` 失败 9 条**不含**冻结串判据 + 探针（`.snote` `12px/20.4px/40.78` → `14px/21px/42`） | 直接读数 |
| 新发现 N15 | `verify-site` 的 sitemap 成员资格 ✓（说「有」）而 `verify:seo` 19/2 漏一堆页 | 直接读数（两侧 JSON/日志都在） |
| 新未覆盖 N19 | `newg` 的未登记清单只有 `feeds/`+`status/` | 直接读数 |

**没有夸大的地方**：本轮全部结论都来自「门禁自己的 JSON」或「我自己的探针」，没有一条是「按代码推断」当成实测写的。

## 2. 过程事故（都进了报告 §7）

1. **两条无效形态**：N5（`max-/*x*/width` —— CSS 里不是合法属性名）与 N14 第一版（父盒 24px > 说明 20.39px）都**没落到布局上**，第一次跑都是「判据沉默」。我没有把它们写成破防，而是补了探针证明无效、把 N14 改成 8px 后重跑得到真破防。**这条纪律建议写进下一轮手册：说「判据沉默」之前先证「形态生效」。**
2. **判据点名列表被截到前 4 条**：第一轮归因时 `att` 只能看到 4 页，我一度按「@360 提到的 5 页」推测——不严谨。处置：把判据复制进沙箱、`slice(0, 4)` → `200` 再跑，拿到 9 页/6 页**完整**清单后才下判定。
3. **探针在 `.pdetailbody` 上量不到**（元素在未展开的 `<template>` 里）⇒ N10/N11 的几何数字引用门禁自报值，探针这一路没复现（已登记为「没证明的东西」#5）。
4. **N14 的第一版 fix 脚本被 PowerShell 引号吃掉**（`node -e` 里的 `\"` 与 `\$&`），注入实际用了旧 wrapper ⇒ 那一跑是无效读数。改成 `.cjs` 文件后重跑才对上（本会话第二次踩同一个坑：上一轮 t27 也栽在 `node -e` 的引号上）。
5. **一次并发自伤（沿用 t27 的教训，本轮没有再犯）**：所有门禁都是串行/分 2 条流跑的，数据面文件（`scripts/data/*`）本轮**一次都没有被移动过**（沙箱是副本）。

## 3. 没证明的东西（与报告 §10 同源，这里只记「我为什么没做」）

1. CI runner（POSIX）没跑：本机只有 Edge；判据是浏览器侧几何，跨平台字体差异会让像素类断言本身不稳。
2. N19 的「无 JS 读者会看到窄列」需要禁用 JS 的上下文；本轮只证明了「有 JS 时判据看不见」这一半。
3. N14 只有一个高度、一个页面；我没有穷举「裁切祖先」的所有形态（`contain: paint` / `clip-path` / `mask` / 负 margin 裁切都没打）。
4. 静态判定类条目（A1 的其余项）没有逐条造副本：与 t5 的边界一致（时间是有限的，且它们与已实测的三条同源）。
5. 我没有把「15 条守住面」全部重放成**单独副本**：R6/R7/R8/R4/R5 等的归因用的是「完整点名清单 + 形态→路由映射」，比 t5 的抽样强，但仍不是「一条形态一份副本」的逐条隔离。

## 4. 工作纪律

- 产品写入面：**0 个产品文件**（`git status --porcelain` 为空；`scripts/**`、`dist/**`、`docs/**` 未动）。
- 沙箱与副本：全部在 `.arch-v1/` 下（Tier-3，本机）；入库证据只新增 `research/_raw/registry-adversary-v1/` 的三个文件（`reattack-copies.json` / `reattack-extra.json` / `reattack-README.md`），**没有覆盖 t5 的 7 份证据**（t5 的文件名与本轮不重叠；我也没有跑 t5 的 `make-evidence.cjs`）。
- `docs/DESIGN-RULES.md` 与 `NEXT-STEPS.md` **零改动**（建议行在报告 §11）。
- 本任务不自行合并：PR 由 captain 验收。
