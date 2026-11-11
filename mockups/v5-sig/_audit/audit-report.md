# mockups/v5-sig「识别层 v5」独立复核报告

- 复核者：audit-verifier（独立重建测量，不采信 `_data/*.json` 结论）
- 时间：2026-11-11 21:28（Asia/Shanghai）。复核期间 21:22–21:23 页面被重建过一次（复刻 `#lastUpdated`），本报告全部数字来自**最终快照**的重新测量；21:23:15 之后文件未再变化。
- 对象：`home-light.html` / `home-dark.html` / `home-390.html` / `family.html` / `compare.html` + `shots/*` + `_tools/build-sig.js`
- 方法：Playwright（playwright-core bundled Chromium，headless，`LD_LIBRARY_PATH=~/.local/lib/chromium-deps/usr/lib/x86_64-linux-gnu`）；本地 `http://127.0.0.1:8081/`；1440×900 浅/深、390×844、dpr=1；所有数字为本轮 DOM `getComputedStyle`/`getBoundingClientRect` 实测；缩略图用浏览器 canvas 取像素；脚本与原始数据在 `_audit/`（`audit.js`、`supplement.js`、`diag2/3/4.js`、`linkcheck.js`、`pixdiff.js` → `measured.json`、`supplement.json`、`linkcheck.json`、`audit.json`）。

## 总体判定：**FAIL**（8 项硬清单 7 PASS / 1 FAIL）

唯一 FAIL 在工程纪律：**`family.html` 的 32 个内部链接中 30 个被写成 `../../dist/dist/…`，实际 404**（head 里的 logos.css / favicon 正常）。其余 7 项（含全部视觉规格、对比度、首屏、390、25% 缩略图、family 数字与同站判断、compare 页）实测 PASS。修复方式见 §7；修完重生成 `family.html` 后复跑 `_audit/linkcheck.js` 即可。

---

## 1 样式改动与规格对应 — PASS

逐条对照 `build-sig.js` 的 `CSS_PATCHES`（15 条替换 + append 规则 + 2 条窄屏补充规则），全部在渲染后的 computed style 上复验：

| 规格 | 实测（改后） | 改前基线 |
|---|---|---|
| 字号 token 22/30/42 | `--fs-stat-sm:22px`、`--fs-stat:30px`、`--fs-stat-lg:42px`（浅/深一致）；`.stat-22/30/42` 规则存在 | 无这些 token |
| `.stat` 四属性 | 14 个 .stat 全部 `font-variant-numeric:tabular-nums`、`letter-spacing:-0.44px/-0.6px`（=-0.02em）、`line-height:22px/30px`（=font-size，即 1）、`font-weight:700` | — |
| need 卡计数 30px / 卡高 68px | b 全为 `30px`；10 张卡高全 `68px` | 计数 `11px`；卡高 `68px` |
| 分带条数 22px | 4 个 `.tierhead .stat` 全 `22px`，数字 11/20/20/25，直接文本为纯数字 | 数字随 `.hint` 在 11.5px 灰字里 |
| 分带方块 22px / 数字 11px | 4 个 `.n` 全 `22×22`、font-size `11px` | `16×16` / `9.5px` |
| 引文竖条 6px | 76/76 根 `.of .bar` 宽 `6px`，四档底色 = 档位色（t4 已不是 `--warn`） | `3px` |
| 分带 1px 线 = 档位色 40% | 4 条 `.line`：height `1px`、background = 对应 `--t1..--t4`、opacity `0.4` | 灰线 `#e6e9ef`，opacity 1 |
| 引文文字（含 `<b>`）回 `--ink` | `.of .tx` 与 `.of .tx b` computed color 全为 `rgb(15,23,42)`（浅）/ `rgb(232,236,242)`（深），四档一致 | t1 b=`#0b7a44`、t2 b=`#6d28d9`、t3/t4 b=`#d92d4b` |
| 无 `--t1-ink/--t2-ink` 彩色文字 | 样式里 `var(--t1-ink)/var(--t2-ink)` 使用次数 **0**；正文文字颜色分布中无 `#0b7a44/#1d4ed8/#4ade80/#60a5fa` | 有 803/804 行两处使用 |
| 无新增圆角/阴影/边框色 | 整份 `<style>` 声明值集合对比（border-radius 7、box-shadow 8、border-color 10、border 6、border-top 4、border-bottom 3、border-left 8、outline 3 个既有值）：**新增值均为 []**；新 `.jump .jn` 只复用既有 `--r-sm`（6px，与 `.tierhead .n` 同值） | 同集合 |
| 档位色序列 绿→蓝→青→琥珀→灰 | 浅：t1 `#0b7a44`(H151/S84) 绿、t2 `#1d4ed8`(H224) 蓝、t3 `#155e75`(H194) 青、t4 `#92400e`(H23) 琥珀、t5 `#475569`(S19%) 灰；深：`#4ade80/#60a5fa/#22d3ee/#fbbf24/#94a3b8` 同序列（H142/213/188/43，t5 S20%） | 紫/蓝/蓝/橙/灰 |

补充：`--fs-stat-lg:42px` 与 `.stat-42` 已定义但本轮三个 mockup 页面没有 42px 实例（未滥用，符合“只有事实数字能用”的克制）。

## 2 对比度（渲染后 token 自算 WCAG）— PASS

从改后页面 computed style 取 token 值自己算（未抄 `contrast.json`）。5×2×2（行=档位，列=底色）：

| 档位 | 浅 vs `--bg` #f6f7f9 | 浅 vs `--card` #fff | 深 vs `--bg` #0b0d10 | 深 vs `--card` #14171c |
|---|---|---|---|---|
| t1 | 5.05:1 | 5.41:1 | 11.17:1 | 10.31:1 |
| t2 | 6.25:1 | 6.70:1 | 7.65:1 | 7.07:1 |
| t3 | 6.78:1 | 7.27:1 | 10.77:1 | 9.94:1 |
| t4 | 6.61:1 | 7.09:1 | 11.66:1 | 10.76:1 |
| t5 | 7.07:1 | 7.58:1 | 7.59:1 | 7.01:1 |

- 作文字 ≥4.5:1：浅色最低 **5.05**（t1 vs bg），深色最低 **7.01**（t5 vs card）→ PASS
- 作色块 vs 底色 ≥3:1：浅色最低 **5.05**、深色最低 **7.59** → PASS
- 色块上的 on 色：浅色白字 t1..t5 = 5.41/6.70/7.27/7.09/7.58；深色 `#0b0d10` = 11.17/7.65/10.77/11.66/7.59；最低 **5.41**（浅 t1，11px 数字也过 AA）→ PASS
- 真实 DOM 核对：`.tierhead .n` 与 `.jump .jn` 的 bg/color 与上面的 token 计算逐一吻合（浅色 t1..t4 白字、深色 `rgb(11,13,16)` 深字）。

## 3 1440×900 首屏 — PASS

| 指标 | 改前 light | 改后 light | 改前 dark | 改后 dark |
|---|---|---|---|---|
| 完整可见 `article.g` | **6** | **6** | **6** | **6** |
| 页面卡片总数 | 76 | 76 | 76 | 76 |
| 网格起点（`#dealsList.top`） | 352px | 352px | 352px | 352px |
| `.tierhead` 高度 | 26px | 26px（4/4） | 26px | 26px（4/4） |
| need 卡高 | 68px | 68px（10/10） | 68px | 68px |
| 分带方块 | 16×16 | **22×22** | 16×16 | **22×22** |
| 横向溢出 | 0 | **0** | — | **0** |

`font-size ≥20px` 且自身直接文本非空的元素：**浅 14 个、深 14 个，全部是 `.stat`，直接文本全部为纯数字**（10×30px：13/7/1/30/66/45/44/7/12/67；4×22px：11/20/20/25）。无任何非数字 ≥20px 元素；页内最大非 stat 直文为 19px 级标题（h1 16px）。

## 4 390×844（home-390）— PASS

- 横向溢出：**0**（documentElement.scrollWidth 390 = innerWidth 390）。
- need 卡：10/10 高 **68px**；计数全 **30px**；矩形全部在卡内（如首卡 200–268，数字 210.25–240.25）、`scrollWidth=clientWidth`、无 ellipsis/裁切，`.need-copy` 横向溢出 0。
- 分带：4/4 `.hint` computed `display:none`；`.n` **22×22**、数字 11px；`.stat` **22px** 可见；带高仍 26px；`.line` 1px/档位色/opacity .4。
- 控点（自选）：`.jump a` 档位图例 chip 在 390 下每枚 **78.02×28**、padding 2px、gap 2px、`scrollWidth=clientWidth=76`、label 文本矩形单行（高 14），22×22 方块完整在 chip 内 —— 不折行、不被裁。
- 高度：改前 16849 → 改后 16813（**−36px，不是加高**）；footer 已与改前等高（271.77px），全部 −36px 来自 t2/t3 分带的 `<b>` 标题：改前被长 `.hint` 挤成 2 行（带高 44px），改后 26px。
- 说明：`.facetsin` 是 `overflow-x:auto` 的既有横向筛选滚区（scrollW 1418 / client 390，改前改后同值），不是页面级横向溢出。

## 5 25% 缩略图 `shots/home-25pct.png`（360×225）— PASS

浏览器 canvas 逐像素统计（±20/通道；另列 ±8/±3）：

| 档位色 | 命中像素 | 连通块（欠采样后） |
|---|---|---|
| #0b7a44 t1（绿） | **164** | 多个 5×5/5×4 块（分带方块、图例方块、引文条等） |
| #1d4ed8 t2（蓝） | **11** | 1 个 4×5 块 @ (46,80)（图例方块） |
| #155e75 t3（青） | **12** | 1 个 4×5 块 @ (73,80)（图例方块） |
| #92400e t4（琥珀） | **13** | 1 个 4×5 块 @ (100,80)（图例方块） |

- **至少 3 块不同档位色仍可测到：成立（实测 4 色，4 个独立连通块）**。但余量不大：t2/t3/t4 各只有 11–13 px，完全依赖“跳到档位”的 4 枚 22px 图例方块；分带色块在 25% 下已被抗锯齿吃掉（t1 的 164 里包含分带方块/引文条，t2–t4 没有别的块）。建议 NOTES 里标注这一证据强度。
- 对照：把 `after-1440.png` 用 canvas 缩到 360×225 得到命中数 166/14/14/15，与交付缩略图（164/11/12/13）一致，说明缩略图确实来自改后首屏；把 `before-1440.png` 同样缩到 25% 则 t2/t3/t4 命中 **0**、t1 仅 20 —— 与 compare 页“改前看不到 3 块档位色”的自述一致。
- `read_image` 目检：360×225 下 need 卡的 30px 计数（13/7/1/30/66/45/44/7/12/67）仍能一眼认出是加粗大数字，是画面上唯一高音；4× 放大（`_audit/thumb-zoom-need.png`）可逐字确认；图例行 4× 放大（`_audit/thumb-zoom-legend.png`）可见绿/蓝/青/琥珀 4 枚方块各自可辨。t5 灰不是首屏档位色块（±3 容差命中 0），符合预期。

## 6 family.html — PASS

- h1 `API / Token 计费对比`（19px）旁 3 个 `.stat`：**22px**、直接文本 **24 / 21 / 108**；与改前 `/dist/plans/api/index.html` 的 `.stop .meta`（`24 条计费记录 · 21 个平台 · 108 个模型计价条目 · 最后核对 2026-10-08`）逐数一致。h1 与 `.stopstats` 同一行（top 106.5/109.5）。
- 页面级 `<style>` 文本未泄漏到 body：2 个 `<style>` 全在 head，body 内 `<style>` 0 个，body innerText 无 CSS 声明模式。
- 横向溢出：**0**。
- 与 home-light 是否同一站：**是**。依据：两份页面**共享 `<style>` 逐字节一致**（77117 chars）；`--bg/--card/--ink/--line/--t1..--t5` token 完全一致；body 字体栈一致；`../../dist/logos.css`、`theme-color` meta 一致；footer 5 段文案一致（home 的「最后更新」已按上线数据复刻为 `2026/11/10 00:38:06`，family 子页保持静态占位「见首页」，其改前 JS 运行态同样是「见首页」）。header 是 `/plans/api/` 的**同站子页变体**：同一 `.top/.topin/.brand/.mark/.btxt` 品牌块与同一品牌字/SVG，只是把首页的搜索/主题/套餐导航换成「← 返回全部优惠」+ GitHub 链接——属同站子页差异，不是换站。
- 注意：family 的 header/footer **链接路径坏了**，见 §7（不影响以上视觉/同站判断）。

## 7 工程纪律 — **FAIL**（仅 family 链接路径）

- PASS：4 个站点 mockup 的 head 里只有 **1 个脚本**，且与 `dist/index.html` 的主题预涂脚本**逐字节相同**（360 chars，含“主题必须在首次绘制前决定”）；无主应用脚本（无 `<script src>`）、无 JSON-LD（0）、无分析脚本（0）、body 内脚本 0。`compare.html` 是评审页：0 脚本（无需主题预涂）。
- PASS：页脚 `#lastUpdated` 由构建器按同样的 `updatedAt` 格式化复刻：改前/改后 1440 与 390 均为 `2026/11/10 00:38:06`，390 footer 高 271.77 = 改前 271.77。
- PASS：`git status --porcelain` 只有 `?? mockups/v5-sig/`；`git diff --name-only` 为空；`index.html` 工作区 SHA-256 = `HEAD:index.html` blob（`bb7049…`，未改）。`dist/` 被 `.gitignore: dist/` 忽略，git 无法直接证明其未改；旁证：`dist/index.html` mtime 2026-11-11T01:33:25Z（远早于本轮）、`build-sig.js` 只写 `mockups/v5-sig/` 内路径，未发现写 dist 的代码路径。
- PASS（资源）：home-light/home-dark/home-390 各 **152/152** 个相对链接全部形如 `../../dist/…` 且逐一解析到存在的文件/目录；`../../dist/logos.css`、`favicon.svg` 正常。
- **FAIL（family 内部链接）**：`family.html` 32 个相对链接中 **30 个** 为 `../../dist/dist/…`，解析到不存在的 `dist/dist/…`（HTTP 404，实测 `…/dist/dist/`、`…/dist/dist/student/` 均 404；正确目标 `…/dist/student/` 200）。坏的正是 header 品牌/返回链接与 footer 全部导航；head 的 logos.css/favicon 两个资源不受影响。
  - 根因：`build-sig.js` 的 `buildFamily()` 里 `rewriteUrls(h, 'dist/plans/api/')`（第 509 行）。`/plans/api/` 页面里的链接本身是 `../../…`（以站点根为基准），函数先按含 `dist/` 的前缀解析、再加一次 `../../dist/` 前缀，于是变成 `../../dist/dist/…`。把第二参数改成 `'plans/api/'`，重生成 family.html（应得到 `../../dist/…`）后复跑 `_audit/linkcheck.js` 即可。
- PASS（其他）：`rewriteUrls` 对 home 页（前缀 `''`）结果正确；compare.html 用 `shots/` 相对路径属评审页自有截图资产，非站点 mockup，不在此项范围。

## 8 compare.html — PASS

- 1440×900 下 `document.scrollHeight` = **900**（body 850，footer bottom 840.41 < 900）→ 一屏看完；交付截图 `shots/home-before-after.png` 为 **1440×900**（内容与当前页面一致，仅字体光栅化差异）。
- 同一张 PNG 双尺度：`figure.before` 的 crop img 与 thumb img 同为 `shots/before-1440.png`；`figure.after` 同为 `shots/after-1440.png`；crop img transform `none`（1440×900 由 680×342 的 `.crop` 裁切），thumb img transform `matrix(0.25,0,0,0.25,0,0)`（360×225 窗口），natural 1440×900 全部加载完成。
- 页面数字与复测一致：6→6、352→352、26/16→26/22、68→68、need 计数 11→30、分带条数 11.5→22（改前 `.hint` computed 11.5px、文本含“· 11 条”）、引文条 3px→6px、改前 t1 加粗色 `rgb(11,122,68)`→改后 `--ink`、新增非数字大字号 0（14 处大字全 .stat）、390 溢出 0、对比度下限 5.05/7.59、文字用途 5.41/7.01 —— 与我的复测逐一相符；色卡 5 行数值也全部一致。
- 一处文案与自己的几何不符（不影响判定）：「100%：…窗口 **680×400** 只做裁切」×2，实际 `.crop` 为 **680×342**（其 ruler 标注 y=96–438 本身也是 342 高）。

## 额外发现（不改变 §1–6、§8 判定）

1. **[高] family.html 30/32 内部链接 404** —— 主 FAIL，见 §7；一行根因 + 重新生成即可修。
2. **[低] compare.html 文案 680×400 vs 实际 680×342** —— 页面自相矛盾（ruler 已写 y=96–438）。
3. **[信息] 390 全页高度 16849→16813（−36px，不是加高）**：footer 已等高；−36px 全部来自 t2/t3 分带 `<b>` 标题折行的修复（44px→26px）。理由见 §4。
4. **[信息] 25% 档位色可测但余量小**：t2/t3/t4 各仅 11–13 px，全靠 4 枚图例方块；建议 NOTES 注明证据强度。
5. **[信息] 42px 档位 token 已定义、本轮无实例**：符合“只给事实数字”的克制，但 NOTES 若把 42px 写成“已上线使用”会与页面不符。

## 复核期间稳定性

- 复核期间 21:22–21:23 页面被重建一次（`build-sig.js` 增加页脚 `#lastUpdated` 复刻），随后 21:23:15 起稳定；本报告为最终快照重新测量（`_audit/measured.json` 的 `changedDuringAudit: []`）。
- 最终快照（SHA-256 前 8 位）：`home-light` `d727c806`、`home-dark` `e3316cdf`、`home-390` `19dd5b2a`、`family` `9ae8d4e6`、`compare` `92d3ea15`、`build-sig.js` `241a9cbd`、`home-25pct.png` `2cfbd06a`、`home-before-after.png` `4d1db429`、`after-1440.png` `533141ca`、`before-1440.png` `4f8f86bb`、`index.html` `bb704909`。
- `_data/compare-data.json`、`_data/compare-page-1440.json` 等在 21:21 重建（元数据/时间戳；`compare.html` 内容哈希未变），不影响本报告结论。

## 复现

```
export LD_LIBRARY_PATH=$HOME/.local/lib/chromium-deps/usr/lib/x86_64-linux-gnu
node mockups/v5-sig/_audit/audit.js        # 主测量 → measured.json + verify-*.png
node mockups/v5-sig/_audit/supplement.js   # family 同站依据 / 390 诊断 / 25% 连通域 → supplement.json
node mockups/v5-sig/_audit/linkcheck.js    # 全部相对链接存在性 → linkcheck.json
node mockups/v5-sig/_audit/make-audit-json.js  # 汇总 → audit.json
```
