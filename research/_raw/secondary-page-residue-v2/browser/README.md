# t5 真浏览器验证（browser-verify）· 读数与复现

> 执行者 `browser-verify` · 任务 `t5`（attempt 1 · `077aa666-7ce3-4ad0-b7f3-3c3c9afeb89c`）
> 工作树 `.worktrees/secondary-page-residue-v2`（基线 `f091ac4`）· 只读源码，只写本目录
> 依赖：t1（普查/裁定）、t3（family-copy）、t4（门禁牙）、t9（A 类改真源）已落地

## 0. 一句话结论

**删减后的产物在真浏览器里是干净的**：全站 **186 页**（本目录 1440×900 + 390×844；`verify-site` 另跑
1440 / 1600 / 950 / 760 / 390 / 360 的几何面），
8 类小字容器的**真 DOM 元素总数**逐类等于构建期牙的实测值（`165/80/25/19/4/4/1/54`，删前==删后），
48 条被删文案在 `innerText` / `textContent` / 剥脚本的序列化 HTML / **不剥**脚本的整份 DOM 四个面 **0 命中**
（阳性对照：删前产物命中 7 条 → 删后 0），说明清单「槽位 × 签名 × 条数」逐页一致，
186 页无一处横向溢出，`verify-site.js` **892 项 / 失败 0**。
删字只让几何**变小**（移动端 −22px，归因见 §4），没有任何一页被推到正文下限以下（deal 最小余量 **639** 字）。

## 1. 命令 × 退出码 × 关键读数（全部在本工作树内执行）

| # | 命令 | 退出码 | 关键读数 |
|---|---|---|---|
| 1 | `node scripts/tools/tree-digest.cjs dist --json --out=…/dist-pre-build.digest.json` | 0 | 304 文件 / 20337838 B · **59db0aa5aaef0ac0…** |
| 2 | `npm run build` | **0** | `✅ 产物自检通过`；其中两行新牙：`✓ 删掉不许回流: 44 条被删文案 × 304 个产物文件 · 剥离后命中 0 次`、`✓ 扫描面不许收缩: 8 类容器存在性下限 .dsrc-note 165/123 · .ddesc 80/60 · .fdesc 25/18 · .chgnote 19/14 · .pchnote 4/1 · .pftdesc 4/1 · .chgmeta 1/1 · .hint 54/40`（原样见 `build-after.log`） |
| 3 | `node scripts/tools/tree-digest.cjs dist … dist-post-build.digest.json` | 0 | 与 #1 **逐文件相同**（treeDigest 不变 ⇒ 构建可复现，且本轮没有再改产物） |
| 4 | `node scripts/tools/tree-digest.cjs "<主检出>/dist" … before-dist.digest.json` | 0 | 304 文件 / 20361169 B · **141af6139516922f…**（= t1 普查锚定产物 ⇒ 就是「删前」） |
| 5 | `node recount.cjs --json=text-floor-recount.json --before="<主检出>/dist"` | 0 | 186 页逐页 `seo.visibleText` × `pageKinds.textFloor`；**低于下限 0 页**；deal 最小余量 **639**（`/deal/adcb6471a512/` 1139 字 − 500）；6 个登记残留页**逐字复现**（50/123/123/136/139/142）；三条口径锚**跨树复算**见 §3.4 |
| 6 | `node product-token-totals.cjs --json=product-token-totals.json` | 0 | 8 类容器 token 全量：**删前 == 删后 == 牙实测**（165/80/25/19/4/4/1/54）· 全部过下限 |
| 7 | `node baseline-diff.cjs --json=baseline-diff.json` | 0 | 两棵树 186 个文件有差异；**80/80 个 `/deal/*` 页在「去掉两段被删文案 + 时间口径归一」后逐字节相同** |
| 8 | `node browser-suite.cjs --json=browser-readings.json` | **0** | 40 路由 × 2 视口 + 3 页删前删后几何；**检查项 9/9 通过** |
| 9 | `node full-site-sweep.cjs --json=full-site-sweep.json` | **0** | **186 页**全扫；**检查项 8/8 通过** |
| 10 | `node scripts/tools/verify-site.js --dir=dist --json=verify-site.json` | **0** | **892 项 / 失败 0 项**（156s）· JS 错误 0 · 外部请求 0 · 404 0 |
| 11 | `node summarize.cjs` | **0** | 汇总 → `summary.md` / `summary.json`（抽样 9/9 · 全站 8/8 · verify-site 892/892） |

运行环境：`playwright-core@1.63.0` + 已安装的 Edge `154.0.4258.62`
（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，headless）。
**并发纪律**：每次启动浏览器前 `Get-CimInstance Win32_Process` 查 `--remote-debugging*|--headless|playwright`，
发现别人在跑就等（本轮实测等过一次：15:47:44 起的另一套套件，13 秒后它结束后我才跑 #9）；全程没有 kill 任何进程。

> 读 `build-after.log` 的一个坑：全文没有 `❌`，但 `grep 失败` 会命中 3 行 —— 其中 2 行是
> `数据源状态: 9 个来源与 source-health.json 逐个对账一致（正常 8 · 异常 0 · **失败 1**）`，
> 那是**数据源自身的健康计数**（某一家来源本轮采集失败），不是门禁失败；另 1 行是构建脚本的说明文字
> （`失败则清掉暂存目录，dist/ 保持原样`）。构建结论行是 `✅ 产物自检通过` / `✅ 构建完成 → dist/`，exit 0。

## 2. 抽样与覆盖

| 套件 | 覆盖 | 视口 | 每个页面读什么 |
|---|---|---|---|
| `browser-suite.cjs` | **20 个 `/deal/*`**（80 页按 id 升序等距抽样）+ 20 个页族路由：`/` `/feeds/` `/plans/` `/plans/api/` `/plans/coding/` `/status/` `/models/` `/changes/` `/category/` `/category/chat/` `/need/no-card/` `/need/ai-coding/` `/vendor/` `/vendor/openai/` `/student/` `/developer/` `/free-api/` `/docs/data/` `/archive/` `/models/qwen-max/` | 1440×900 + **390×844** | 8 类容器条数 + 纯文本（`.dsrc-note` 逐条、`.ddesc` 逐条…）· `seo.visibleText` 口径可见字数 + DOM 侧对等量 · 页高 · 横向溢出（页面级 + 越界元素，区分「被可滚动祖先裁掉」）· 48 条被删文案回流检测 · 说明清单对账 |
| 同上（②段） | **3 个 `/deal/*`** 删前/删后几何对照：`adcb6471a512`（删后最薄）· `2db62eb1a8a0`（A+B 两类删除都落到）· `57847fbcc1ed` | 1440×900 + 390×844 | 页高、`.dsrc` 块盒、`.dsrc-note` 逐条盒、`.ddesc` 盒、可见字数、回流命中 —— 删前 = 主检出 `dist/`，删后 = 本工作树 `dist/` |
| `full-site-sweep.cjs` | **全部 186 个产物页** | 1440×900 | 8 类容器 DOM 总数 · 四面的回流检测 · 说明清单逐页对账 · 页高/溢出 · console 错误 |

## 3. 核心读数

### 3.1 被删文案回流检测（浏览器层，独立于构建期扫描器）

| 面 | 读数 |
|---|---|
| `document.body.innerText`（186 页 × 48 条字面） | **0 命中** |
| `document.body.textContent` | **0 命中** |
| `document.documentElement.outerHTML` 剥 script/style/注释 | **0 命中** |
| 同上**不剥**（内联 RENDER-CORE 也算，对应构建期「只报不判」那条） | **0 命中** |
| **阳性对照**：删前产物同一条检测 | 每页命中 **7** 条 → 删后 **0** 条（检出器有效，不是「永远为 0 的假检测」） |

删前页命中的 7 条逐条可解释：`c2-01/literal`「；最终以厂商官方页面为准。」· `c2-01/visible`「最终以厂商官方页面为准。」
· `c2-02/visible` `c2-03/visible` `c2-04/visible` `v2-headless-capture-paren/literal`「（无头浏览器渲染后提取）」
· `c1-05/literal`「最终以厂商官方页面为准。」（`census-v1` 的旧断言字面与 `c2-01/visible` 同形）。

### 3.2 扫描面不许收缩（8 类容器，三个来源同一个数）

| 容器 | 删前产物（token） | 删后产物（token） | 构建期牙实测 | 真浏览器 DOM 总数 | 下限 |
|---|---:|---:|---:|---:|---:|
| `.dsrc-note` | 165 | 165 | 165 | **165** | 123 |
| `.ddesc` | 80 | 80 | 80 | **80** | 60 |
| `.fdesc` | 25 | 25 | 25 | **25** | 18 |
| `.chgnote` | 19 | 19 | 19 | **19** | 14 |
| `.pchnote` | 4 | 4 | 4 | **4** | 1 |
| `.pftdesc` | 4 | 4 | 4 | **4** | 1 |
| `.chgmeta` | 1 | 1 | 1 | **1** | 1 |
| `.hint` | 54 | 54 | 54 | **54** | 40 |

三个数出自**三份独立实现**：构建期 `scanResidue()`（HTML 剥 script/style/注释后数 class token）、
本目录 `product-token-totals.cjs`（独立重写，精确分词）、真浏览器 `querySelectorAll` —— 逐类相等。

### 3.3 说明清单对账（`dist/_notes.ndjson` ↔ 真 DOM）

- 抽样套件：40 路由 × 2 视口，按「槽位 token × 排序后的 token 集合」分组计数，声明 == DOM **全部一致**。
- 全站扫面：186 页同样口径 **逐页一致**（`523` 条登记说明 × 3 个槽位）。
- `verify-site.js` §22c ⑨（同一件事的第三方实现）：`逐页逐槽位对账：清单声明的「签名 × 条数」== 真浏览器 DOM 数出来的（523 条登记说明 × 3 个槽位）` 通过；
  `页面族结构下限：目录页家族 0 条页面级说明、状态页 2 条、订阅中心 3+1 条、厂商页六节说明` 通过。

### 3.4 正文下限（`seo.visibleText` × `pageKinds.textFloor`，186 页重算）

- **低于下限 0 页**；deal 最小余量 **639** 字（`adcb6471a512`，1139 − 500）。
  （t1 普查的 663 → 651 是删 B 类后的预测；t9 又删了该页 `.ddesc` 的 12 字括号 ⇒ 651 − 12 = **639**，差额可解释。）
- 6 个登记残留页实时重算**逐字复现登记值**：`/need/no-card/` 50 · `/category/` 123 · `/category/audio/` 123 · `/need/ai-coding/` 136 · `/category/image/` 139 · `/category/agent/` 142。
- 口径锚对账：`/status/` 余量 **628**（= t1 普查值，逐字相同）；`/models/` 余量 **2050**（= t3 §⑤ 的预测值）。
- 口径锚**跨树复算**（同一份计数器施加在删前树与删后树上，期望值全部取自 t1/t3 的登记值）：

  | 锚 | 本树余量 | 删前树余量 | 期望（登记值） | 判读 |
  |---|---:|---:|---:|---|
  | `/status/` | 628 ✅ | 628 ✅ | 628（t1 census） | 两棵树逐字相同 ⇒ 计数器无偏 |
  | `/models/` | 2050 ✅ | 2080 | 2050（t3 §⑤ 预测：2080 − 30 字） | 删前树复现 2080、本树复现 2050 ⇒ **t3 的「删 30 字」在产物上逐字成立** |
  | `/feeds/` | 3465 | **3371 ✅** | 3371（t1 census，10-08 数据态） | 删前树逐字复现 3371 ⇒ 计数器无偏；本树 +94 全部由数据态解释（§3.4 下一条） |

- `/feeds/` 本树余量 **3465**（而 t1 普查是 3371）：差额 **+94 字**来自**数据态**，不是文案 ——
  普查锚定的 141af613 树里 `feed/new.json` 有 15 条，条件型第 5 条 `.snote` 不渲染（4 条）；
  本工作树 `feed/new.json` 为 0 条 ⇒ 多渲染 1 条 `.snote`（实测 `.snote` 4→5、可见字 3971→4065，Δ 恰 +94）。

## 4. 删前/删后几何对照（3 个 `/deal/*`）

| 页 | 视口 | 页高 删前→删后 | Δ | 归因 | `.dsrc` 块高 | `.dsrc-note` 逐条（字） | 回流 |
|---|---|---|---:|---|---:|---|---:|
| `deal/adcb6471a512/` | 1440×900 | 1511→1511 | 0 | `.ddesc` 与 `.dsrc-note` 都是单行 | 320→320 | 27 / **49→37** | 7→0 |
| `deal/adcb6471a512/` | 390×844 | 1963→1941 | **−22** | `.ddesc` **44→22px**（少一行，行高≈22px）·`.dsrc-note` 35→35（行数不变） | 357→357 | 27 / **49→37** | 7→0 |
| `deal/2db62eb1a8a0/` | 1440×900 | 1493→1493 | 0 | 同上 | 365→365 | 27 / **49→37** | 7→0 |
| `deal/2db62eb1a8a0/` | 390×844 | 1961→1939 | **−22** | `.ddesc` 44→22px | 505→505 | 27 / **49→37** | 7→0 |
| `deal/57847fbcc1ed/` | 1440×900 | 1493→1493 | 0 | 同上 | 365→365 | 27 / **49→37** | 7→0 |
| `deal/57847fbcc1ed/` | 390×844 | 2018→1996 | **−22** | `.ddesc` 44→22px | 539→539 | 27 / **49→37** | 7→0 |

- 免责行（`.dsrc-note` 的第 2 条）**49 → 37 字**，与 t2 自述的「原句 49 → 37 字」逐字吻合；
  第 1 条（`.dhist` 空态 27 字）**没被连坐**。
- `.ddesc`：`来源：…（无头浏览器渲染后提取）。` → `来源：…。`（t9 的真源删除在渲染面上生效）。
- **删字只会让几何变小**：桌面端完全不变，移动端只少一行。没有任何一处被顶高、没有被裁切、没有换行异常。
- 越界元素 0（把「被 `overflow-x:auto` 祖先裁掉的表格」单独计数为读数：2581 处，全部 ← `div.ctable-wrap / div.ptable-wrap / div.fmarket` 等滚动容器，
  这是宽表格在窄屏的正常形态；`verify-site.js` @390 的全站断言 `最宽的一页 390px` 与之互证）。

## 5. 「删前」副本的合法性（`baseline-diff.cjs`）

用主检出 `dist/`（141af613…）当删前，只有在下述条件下才成立，这件事被钉成了读数：

- 两棵树共 186 个文件有差异（HTML 134 · JSON 25 · XML 26 · NDJSON 1）—— 差异**不只有文案**（`asOf` 10-08 vs 10-09）。
- 因此只对 `/deal/*` 做删前删后对照，并且：
  **把删前页里的两段被删文案抹掉、再把时间口径归一（`2026-10-08T…Z` / `2026-10-08` / `10-08` / `12:40` → `<T>`），
  80/80 页与删后页逐字节相同**。未归一时的首个差异点就是「数据更新 2026-10-08 → 2026-10-09」「最近成功采集 …12:40 → …02:31」。
- 被删片段在删前 `/deal/*` 的出现次数：`.dsrc-note` 尾半句 **×1 / 80 页**；`.ddesc` 括号 **×1 / 17 页**（另 63 页没有它）—— 与 t1/t9 的登记完全一致。
- 非 `/deal/*` 的差异（HTML 54 · 数据/Feed 52）来自数据态与其它页族文案，那些页**只出「删后」绝对读数**，不比高度。

## 6. 文件清单

| 文件 | 是什么 | 可入库？ |
|---|---|---|
| `summary.md` / `summary.json` | **结论入口**：一张表（页 / 删前可见字数 / 删后可见字数 / Δ / textFloor / 余量 / 回流命中）+ 检查项 + 旁证 + 局限 | ✅（.md/.json 未被忽略） |
| `browser-readings.json` | 抽样套件的原始读数（40 路由 × 2 视口 + 3 页几何，含逐条容器纯文本与盒模型） | ✅（361 KB） |
| `full-site-sweep.json` | 186 页全扫原始读数（每页 8 类容器计数、四面回流命中、清单对账结论） | ✅（158 KB） |
| `text-floor-recount.json` | 186 页 `seo.visibleText` × `textFloor` 逐页重算 | ✅ |
| `product-token-totals.json` | 8 类容器 token 全量重数（删前 vs 删后，逐文件维度） | ✅ |
| `baseline-diff.json` | 两棵树差集 + 80 页逐字节重建结果 | ✅（87 KB） |
| `verify-site.json` | `verify-site.js --json=` 的机器可读报告（892 项） | ✅（713 KB） |
| `verify-site.dist-digest.json` | 边车：`verify-site.json` 是对哪棵树跑的（它自己的报告不带树摘要） | ✅ |
| `dist-pre-build.digest.json` / `dist-post-build.digest.json` / `before-dist.digest.json` | 三棵树（删前/删后/主检出）的逐文件 sha256 清单 | ✅ |
| `*.cjs` | 复现工具（`tree-digest-lib`（摘要口径库，自测与 `scripts/tools/tree-digest.cjs` 逐字段相同）· `recount` · `product-token-totals` · `baseline-diff` · `browser-suite` · `full-site-sweep` · `summarize` · `diagnose` · `list-registry` · `probe-anchors`（早期锚探针，已被 `product-token-totals` 取代）） | ❌ `.gitignore:95 research/_raw/**/*.cjs`（Tier-3，与本轮其它成员一致） |
| `*.log` / `*.stdout.txt` | 各命令的**原始输出**（含 `npm run build` 全量日志与失败原文） | ❌ `.gitignore:93-94` |
| `mutations.json` | **不是本目录写的** —— `verify-site.js` 把它落在 `--json=` 的同目录（`verify-site.js:9286`） | ✅ |

**每份读数 JSON 自带「读的是哪棵树」**：`tree-digest-lib.cjs` 在脚本里**现场现算**摘要（口径与
`scripts/tools/tree-digest.cjs` 逐字段相同，实测 `59db0aa5…` 逐字符一致），并写入 `at`（ISO 时间戳）。
所以 `browser-readings.json` / `full-site-sweep.json` / `text-floor-recount.json` /
`product-token-totals.json` / `baseline-diff.json` / `summary.json` 里都能读到
**删后 59db0aa5aaef0ac0…（304 文件）** 与 **删前 141af6139516922f…（304 文件）**，不需要靠「我记得跑过」。
`browser-suite.cjs` 还会把现算摘要与 `dist-post-build.digest.json` / `before-dist.digest.json` **逐字段核对**，对不上直接 exit 2。

本目录没有额外的 `.gitignore`：`.cjs/.log/.txt` 由根规则挡住，`.json/.md` 按现状**可入库**（合计约 1.6 MB，
是否随 PR 提交由队长决定）。

复现顺序：`tree-digest(dist)` → `npm run build` → `tree-digest(dist)` → `tree-digest(<主检出>/dist)` →
`recount --before=…` → `product-token-totals` → `baseline-diff` → `full-site-sweep` → `browser-suite` → `verify-site --dir=dist` → `summarize`。

三个非浏览器读数（#5/#6/#7）**依次**跑完约 30 秒；两个浏览器套件（#8/#9）合计约 3 分钟；`verify-site` 约 156 秒。

## 7. 局限（不许当成「全都验过了」）

1. **删前副本不是重建产物**：主检出 `dist/` 是 10-08 数据态的既有产物（141af613…），不是「工作树父提交重建」。
   两棵树之间除文案外还有数据态差异，所以**只有 `/deal/*` 做了删前删后对照**（并已逐字节证明差异 = 两段文案 + 时间戳）。
2. **浏览器层回流检测的射程**：全站 186 个 HTML 页；**非 HTML 产物**（Feed/公开 JSON/`_notes.ndjson`/sitemap 等 118 个文件）
   没有浏览器面，那部分由构建期牙的整篇产物扫描负责（本轮已随 `npm run build` 跑过：0 次）。
3. **`.hint` 只有首页**：54 条 = 5 个档位头 + 49 张卡片提示，全在 `/`。抽样页里 `/` 的 DOM 计数等于文件层计数，
   但「卡片由 JS 建」的面（收藏/对比等）不在本轮读数的射程。
4. **只跑了 1440/390（抽样）与 1440（全扫）**：`verify-site.js` 另跑了 950/1600/390/360/760 的几何面，
   两边合起来覆盖 5 个视口；本轮没有在 390 宽下重跑「全站 186 页」的容器计数（依赖 `verify-site.js` 的 @390 溢出断言）。
5. **`clippedOverflow` 是读数不是判据**：把「被 `overflow-x:auto` 祖先兜住的越界元素」判成不撑宽页面，
   依据是页面级 `scrollWidth − clientWidth == 0`（两个套件、5 个视口都成立）；分类器本身没有独立变异证明。
6. **本目录不产生任何断言**：全部是读数与复核；「删掉不许回流」的机器牙在 `scripts/tools/build-local.js`
   的 `scanResidue()` 里（t4 交付），本目录只是**在浏览器层把它独立复算了一遍**。
