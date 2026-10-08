# mid-viewport-tooth-v1 报告：新增 950 档的**变异实验**（判据有没有牙）

> **一句话**：950 档**有牙**。一条 `@media (min-width: 761px) and (max-width: 1439px) { .snote { max-width: 452px; } }`
> 让 `§22c @950 逐条页面级说明…` 从绿变红（**883 项 / 1 失败**），而 1440 / 1600 / 390 / 760 / 360 五条旧读数
> 的断言文本**逐字未变**、全部仍绿 ⇒ 对**这一形态**，950 档是**唯一防线**。
>
> **但任务里写的「761–940px」这个区间不成立**（这是本轮最重要的更正）：同一形态把窗口收窄成
> `(min-width:761px) and (max-width:940px)` 之后 **四档全绿、883 项 / 0 失败**。原因有两层：
> ① 档位量的是 **950 这一个点**，`950 ∉ [761,940]`；② 产物里那条 `@media (min-width:761px) and (max-width:940px)`
> 管的是 `.topin / .search / .topstat`（顶栏），**在 950 下根本不生效**（950 档真正新激活的只有
> `@media (max-width:1180px)`，它把首页 `.grid` 从 3 列变成 2 列 449px×2）。
> 所以 950 档的价值是**点采样 / 分辨率覆盖**，不是「761–1439 全区间覆盖」。

基线：`origin/master = 9b72b9d`（PR #93 已并入）· 分支 `mid-viewport-tooth-v1` · 工作树
`.worktrees/mid-viewport-tooth-v1`（`npm ci` 装在工作树内）· 机器：Windows + msedge + playwright-core 1.63。
**产品零改动**：`git diff origin/master -- scripts dist docs NEXT-STEPS.md package.json` 为空。

原始读数（四次 `--json` 报告、三份探针日志、五份全树 sha256）已压成索引：
[`research/_raw/mid-viewport-tooth-v1/readings.json`](research/_raw/mid-viewport-tooth-v1/readings.json)（18.7 KB）。

---

## 1. 变异形态：为什么选它（不是照抄任务建议的那一条）

| | 任务建议 | 本轮实际采用 |
|---|---|---|
| 窗口 | `(min-width:761px) and (max-width:940px)` | **`(min-width:761px) and (max-width:1439px)`** |
| 声明 | 把说明列压窄到比容器窄 ≥40px | `.snote { max-width: 452px }`（比 950 档列宽 858–910px 窄 ~50%） |
| 位置 | — | 每页**共享内联 `<style>` 块**末尾（186 页全注入） |

三条选择理由，都不是口味问题：

1. **窗口必须包含 950。** 档位在 `wideGoto(route, 950)` 下量测 —— 一条 `max-width:940px` 的规则在
   950 下**不生效**（`probe-grid`：940 时 `.search maxWidth=none`，950 时 `=440px`，`(min-width:761px) and (max-width:940px)`
   块在 950 下已退出）。照抄建议的窗口，测出来的一定是「四档全绿」，那不是「950 有牙」的证据。
2. **用 px 而不是 ch，是为了把 `narrow-unregistered` 隔离掉。** 那条码是**视口无关**的静态扫描
   （`verify-site.js:6912` `narrowChDeclarations`，只认 `max-width|inline-size|width` 里的 `ch` 值）。
   若写成 `max-width: 70ch`，1440/1600 也会因「未登记的窄阅读列」变红，「只有 950 看得见」立刻失去判别力。
   `452px` 与现场 70ch 实测值（452.81px）同量级，形态本身仍是「把阅读列压窄」。
3. **注入 186 页的共享样式块**，是因为产物里真实的这类缺陷就是「共享块里多加一条 `@media`」
   （产物现存的 9 条 `@media` 全部在共享块里，186 页逐字相同）。注入**不新增元素**（追加在既有
   `<style>…</style>` 内部），所以冻结串出现次数、页面结构、外链数一个都不动。

---

## 2. 950 档变红：V1（761–1439px）的读数

```
命令：node scripts/tools/verify-site.js --dir=.arch-v1/mid-viewport-tooth-v1/dist.mut --json=…
结果：883 项，失败 1 项        EXIT=1        wall 183.6s
```

**唯一变红的断言（断言名逐字）**：

> `§22c @950 逐条页面级说明：旧口径（内容盒 ≥ 0.85×列宽）+ 新口径（横排按行 / 竖排按列：字迹铺开 ≥ 0.85×列宽，单元数 ≥ 2）
> + 无藏字 + border-box 同轴 + 自身不裁切 + 首屏说明 ≤ 2 行 + 窄阅读列全部已登记`

**命中读数（同一断言的 detail，绿→红的差值）**：

| 量 | 基线（R0） | V1 变异（R1） |
|---|---|---|
| 逐条判 | 271 条 / 63 页有说明 | 271 条 / 63 页（**未变**） |
| `note-narrow` | 0 条 / 0 页 | **270 条 / 63 页** |
| `note-ink-narrow` | 0 条 / 0 页 | **185 条 / 63 页** |
| 并集（①②） | 0 条 / 0 页 | **270 条 / 63 页** |
| `note-axis`（border-box 不同轴） | 0 | **270** |
| `note-clipped` / 藏字 / `note-intro-long` / `note-unrendered` / 未登记窄列 | 0 | **0**（一个都没动 ⇒ 咬中的就是「窄」这一条） |

**命中路由 + 具体数值（detail 里的前 4 条，route#index 可定位）**：

| 命中条 | 内容盒 | 盒宽 | 列宽 | 行数 | 判据用行 | 码 |
|---|---|---|---|---|---|---|
| `archive/#0` | 452px | 452px | 910px | 3 | 3 / 450.81px | `[note-narrow, note-ink-narrow, note-axis]` |
| `archive/#1` | 452px | 452px | 910px | 1 | 1 / 256.36px | `[note-narrow, note-axis]` |
| `archive/#2` | 452px | 452px | 910px | 1 | 1 / 256.36px | `[note-narrow, note-axis]` |
| `archive/#3` | 452px | 452px | 910px | 1 | 1 / 256.36px | `[note-narrow, note-axis]` |

**判据为什么应当红（阈值算一遍）**：950 档现场列宽 `minColumn=858 / maxColumn=910`（`metrics.layoutSweep.inkScopeDesktopViewports`），
`WIDE_NOTE_RATIO = 0.85` ⇒ 门槛 `0.85 × 910 = 773.5px`。注入后内容盒 **452px**（= 0.497 × 列宽）
⇒ 旧口径 ① 与逐行字迹 ② 都过不去。**阈值一个都没改**：452px 远在门槛之下，不是踩线。

---

## 3. 对照读数：旧三档（1440 / 1600 / 390）与样本两档（760 / 360）

**断言文本逐字比对**（R0 基线 vs R1 变异，`name::detail` 全串相等）：

| 旧档断言 | R0 == R1 | R0 == R2 | R0 == R3 |
|---|---|---|---|
| `§22c @1440 逐条页面级说明…` | **true** | true | true |
| `§22c @1600 逐条页面级说明…` | **true** | true | true |
| `§22c @390 全站 186 页 documentElement.scrollWidth ≤ 视口+1` | **true** | true | true |
| `§22c @760 样本集 79 页…` | **true** | true | true |
| `§22c @360 样本集…` | **true** | true | true |

即：V1 变异下旧档的读数**不是「也绿」而是「逐字没变」** —— 缺陷对它们完全不可见。独立探针
（`.arch-v1/mid-viewport-tooth-v1/probe.cjs`，**不经过 verify-site 的任何判据代码**）在
`archive/ status/ changes/ feeds/` 四页 × `760/900/940/950/1180/1200/1440/1600` 八档上量同一个量：

| 视口 | 760 | 900 | 940 | **950** | 1180 | 1200 | 1440 | 1600 |
|---|---|---|---|---|---|---|---|---|
| `.snote` 的 `max-width`（V1） | `none` | 452px | 452px | **452px** | 452px | 452px | `none` | `none` |
| `.snote` 的内容盒（V1） | 728px | 452px | 452px | **452px** | 452px | 452px | 1380px | 1380px |
| 档位采样 | 样本集 | — | — | **全站逐条** | — | — | 全站逐条 | 全站逐条 |

**结论（如实写）**：对**这一条形态**，「没有 950 档就看不到它」**成立** ——
1440/1600 被 `max-width:1439px` 排除，760/360 被 `min-width:761px` 排除，390 档只量 `scrollWidth`
（横向溢出，与阅读列宽无关）。950 档**不是**「分辨率覆盖」意义上的冗余档，它是**唯一防线**。

---

## 4. 边界更正：`761–940` 这个区间**四档都看不见**（V2 实验）

把同一形态的窗口换成任务里写的 `(min-width: 761px) and (max-width: 940px)`，其余一字不动：

```
命令：node scripts/tools/verify-site.js --dir=.arch-v1/mid-viewport-tooth-v1/dist.mut --json=…
结果：883 项，失败 0 项        EXIT=0        wall 151.5s
```

探针读数（V2 变异）：`max-width` 在 900/940 是 `452px`，在 **950 是 `none`**（内容盒 910px，与基线一致）
—— 缺陷**真实存在**于 761–940，但**没有任何档位在那个区间采样**：1440/1600 太高、950 是单点、
760/360 太低、390 只看溢出。

**顺带更正 t22 报告 §2 表格里那行「为什么是 950」**。原文写：

> 产物里 4 条共享 `@media` 条件活在 **761–1439**（`(min-width:761px) and (max-width:940px)` 完全落在里面）
> ⇒ 1440/1600 两档都看不见

本轮把产物里 9 条 `@media` 条件逐条列出来对了一遍（见下），结论是：**那 4 条是顶栏规则，且它在 950 下不生效**。

| 共享 `<style>` 里的 `@media` 条件 | 950 下生效？ | 1440/1600 下生效？ |
|---|---|---|
| `(max-width: 560px)` ×2 · `(max-width: 760px)` · `(min-width: 761px) and (max-width: 940px)` · `(max-width: 900px)` | 否 | 否 |
| `(max-width: 1180px)`（`.grid` → 2 列） | **是（唯一）** | 否 |
| `(min-width: 1100px)`（`.plansnav-api` → inline-block） | 否 | **是（唯一）** |

`(min-width:761px) and (max-width:940px)` 块的全部内容（186 页逐字相同，226 字节）：

```css
@media (min-width: 761px) and (max-width: 940px) {
  .topin { gap: 12px; height: auto; padding: 10px 20px; flex-wrap: wrap; }
  .search { max-width: none; order: 3; min-width: 100%; }
  .topstat { order: 2; }
}
```

**950 档真正买到的东西**（`probe-grid.cjs` 只读读数，首页）：

| 视口 | 940 | **950** | 1180 | 1440 | 1600 |
|---|---|---|---|---|---|
| `.grid` 列 | 444px 444px | **449px 449px** | 564px 564px | 452px×3 | 452px×3 |
| `.topin` `flex-wrap` | `wrap` | `nowrap` | `nowrap` | `nowrap` | `nowrap` |
| `.search` `max-width` | `none` | `440px` | `440px` | `440px` | `440px` |

⇒ 950 是**唯一**同时满足「`@media (max-width:1180px)` 生效」与「阅读列 ≥ 858px（进得了桌面档判据）」的采样点。

---

## 5. 逐字节还原 ⇒ 全档回绿

还原用的是 **`restore.cjs`：注入的逐字节逆运算**（在同一批文件上删掉注入的那一行），
不是「从备份整目录拷回来」—— 后者只证明「备份是好的」，不证明注入可逆。

| 阶段 | 全树 sha256（`tree-digest.cjs`，304 文件 / 20,386,654 B） | 残留注入串 |
|---|---|---|
| 原始 `dist/`（`npm run build` 产物） | `67d1d0bdcdffe29f1b2bd0185c35408da897d53d20e44c495fec385f7ec1337d` | — |
| 副本 `dist.pristine` / `dist.mut`（注入前） | `67d1d0bdcdffe29f1b2bd0185c35408da897d53d20e44c495fec385f7ec1337d` | 0 |
| V1 变异后 | `aa41a94a0fa4d217b807300921860842355adf3718a7951e1d5492e1628d97a6` | 186 页 |
| V2 变异后 | `6c2259810aad0f4c7aae5bd9e1b11daa64d1cb8984a3d81a78add9d7687f5bcd` | 186 页 |
| **V2 逐字节还原后** | **`67d1d0bdcdffe29f1b2bd0185c35408da897d53d20e44c495fec385f7ec1337d`** | **0** |

（V1 → V2 之间也做过一次同样的还原 + 重新注入，读数同上，见 `readings.json`。）
清单摘要（`_notes.ndjson` 那一半）同步回到 `2b8fe49fa776a8789e592d79fb507c2c1e9cac233801a9425b4e9e8f55f638de`。

**还原后的门禁读数**：

```
node scripts/tools/verify-site.js --dir=dist                              → 883 项 / 0 失败  EXIT=0  wall 205.4s
node scripts/tools/verify-site.js --dir=…/dist.mut（V1 变异）             → 883 项 / 1 失败  EXIT=1  wall 183.6s
node scripts/tools/verify-site.js --dir=…/dist.mut（V2 变异）             → 883 项 / 0 失败  EXIT=0  wall 151.5s
node scripts/tools/verify-site.js --dir=…/dist.mut（逐字节还原后）        → 883 项 / 0 失败  EXIT=0  wall 146.7s
```

---

## 6. 断言数 / 阈值 / 产物 digest

| 量 | 读数 |
|---|---|
| `verify-site` 断言总数 | **883 → 883**（四次运行全部 883；本轮**没有新增也没有删除**任何断言 —— 这是纯验证任务，判据一行未改） |
| 阈值 | **一处未改**：`WIDE_NOTE_RATIO 0.85` · `WIDE_TOL 1` · `WIDE_INTRO_MAX_LINES 2` · `WIDE_INTRO_MIN_COLUMN 1100` · `WIDE_AXIS_RATIO 0.05` 全部原样；`git diff origin/master -- scripts/` 为空 |
| `npm run report:digest` 改前 / 改后 | **同串**：`dist: 304 文件 / 20386654 B · 全树摘要 67d1d0bd…337d`（本轮全程未改 `dist/`，注入只在 `.arch-v1/` 的副本里做；`npm run gate` 自己那一步重跑构建之后仍是同一串） |
| `npm run check:evidence` | 绿（exit 0） |
| `npm run gate` | **绿**：52 个步骤 / 48 个脚本全过、**失败 0**、合计 **343.9s**；其中 `[50] Real-browser acceptance (verify-site.js)` 150.9s、`[51] Regression verify (baseline compare)` 130.1s 都过；4 个非 node 步骤（`npm ci` / 装浏览器 / 浏览器可用性判定 / 结论）按设计跳过 |
| t22 报告里的 882 | 本轮基线量到 **883**（+1 来自 #93 之后并入的其它断言，与本轮无关；本轮自己的因果面是「同一基线 883 ↔ 变异 883/1」） |

---

## 7. 950 档的耗时增量（如实：本机噪声很大，不要按绝对值引用）

| 运行 | wall | desktop1440 | desktop1600 | **desktop950** | narrow390 | 样本 760/360 | 导航次数 |
|---|---|---|---|---|---|---|---|
| R0 基线（`--dir=dist`） | 205.4s | 16.3s | 18.6s | **21.4s** | 16.9s | 20.5s | 920 |
| R1 V1 变异 | 183.6s | 14.0s | 15.8s | **17.8s** | 18.0s | 18.5s | 920 |
| R2 V2 变异 | 151.5s | 11.8s | 11.9s | **11.9s** | 12.9s | 12.6s | 920 |
| R3 还原后 | 146.7s | 11.3s | 11.0s | **11.8s** | 12.1s | 12.2s | 920 |

**能说的**：同一轮里 950 相位与 1440/1600 **同量级**（差 0.5–3s，落在噪声内）；它占**全站导航的 186/920 = 20.2%**。
**不能说的**：不能把「21.4s → 11.8s」当成性能改善 —— 四轮里同一相位的读数相差近 2 倍（本机同时跑着多个
并行会话）。t22 报的 `+9.1s 相位 / +27.5s wall` 是另一台负载状态下的读数，**两者不可混用**。

---

## 8. 给 captain 的收口文字（供 `NEXT-STEPS.md` §0 第 9 条 / t17 建议 ⑤ 第 3 条）

> **950 档有牙，已用变异实验证明**（`mid-viewport-tooth-v1`）：
> 一条只在 `761–1439px` 生效的 `@media` 窄列规则 ⇒ `§22c @950 逐条页面级说明` 变红
> （883 项 / 1 失败；`note-narrow 270 条 / 63 页`、`note-ink-narrow 185 条`，`archive/#0` 内容盒 452px vs 列 910px 对门槛 773.5px），
> 而 1440/1600/390/760/360 五条断言的文本**逐字未变**、全绿 ⇒ **950 档是这一形态的唯一防线**，
> 不是分辨率冗余。**同时更正两条**：
> ① 950 档覆盖的是「**生效于 950px 的缺陷**」，不是「761–1439 全区间」——
> 只落在 `761–940` 的同一形态**四档全绿**（883/0，`mid-viewport-tooth-v1` 的 V2 实验）；
> ② 产物里那条 `@media (min-width:761px) and (max-width:940px)` 管的是顶栏（`.topin/.search/.topstat`，4 条声明），
> **在 950 下不生效**；950 档真正新激活的只有 `@media (max-width:1180px)`（首页 `.grid` 3 列 → 2 列 449px×2）。
> 因此「补一档 950」的正确表述是**点采样把盲区从 [761,1439] 缩小到「[761,949] ∪ [951,1439] 无采样」**，
> 而不是「盲区已闭合」。

---

## 9. 没证明的东西（如实登记）

1. **950 档对「其它形态」没测**：只测了「窄阅读列」这一类（`note-narrow` / `note-ink-narrow`）。
   竖排（`note-axis` 的竖排分支）、`note-clipped` 的竖直裁切、`note-unrendered`、`narrow-unregistered`
   在 950 档**没有**各自的变异读数（那些形态的靶位都还在 1440/1600）。
2. **「区间被覆盖」没证明，而且已被证伪**：950 是**单点采样**。任何只在 `[761,949] ∪ [951,1439]`
   生效的缺陷，四档全绿（V2 已把 `[761,940]` 这一半量成了具体读数；`[941,949]` 与 `[951,1439]` 同理，
   未逐段实测 —— 只做了窗口端点推理）。
3. **960/1024/1200 等其它候选档没测**：本轮没有回答「补哪一档最划算」。
4. **CI（Ubuntu + chromium）未验**：本机是 Windows + msedge，耗时读数不可外推；变异实验的**几何结论**
   应当与浏览器无关，但**没有第二个引擎的复现**。
5. **本机 Full Gate 的读数只有一份**（§7 的 wall 波动 146.7–205.4s 已经说明本机负载不干净）。
6. **注入是「全站共享块」形态**，不是「某一条说明的 `style` 属性」或「构建期模板」形态；
   后两种注入路径本轮没走。
7. **`.arch-v1/` 下的注入产物与探针脚本不入库**（按纪律），所以报告里的数字**只能靠重跑复现**，
   不能在仓库里逐字节复核 —— 可复核的部分是 `readings.json`（四次 `--json` 的断言明细 + 探针文本 + sha256）。

---

## 10. 复现命令（全部在本工作树内，产品零改动）

```console
cd "D:\OneDrive\Desktop\Code\AI Page\.worktrees\mid-viewport-tooth-v1"
npm ci && npm run build
node scripts/tools/tree-digest.cjs dist                       # 67d1d0bd…337d（304 文件）
mkdir .arch-v1\mid-viewport-tooth-v1
copy /e dist .arch-v1\mid-viewport-tooth-v1\dist.pristine     # 只读副本
copy /e dist .arch-v1\mid-viewport-tooth-v1\dist.mut

node .arch-v1\mid-viewport-tooth-v1\inject.cjs  .arch-v1/mid-viewport-tooth-v1/dist.mut wide
node scripts/tools/verify-site.js --dir=.arch-v1/mid-viewport-tooth-v1/dist.mut   # 883 / 1（唯一 ✗ = §22c @950 逐条页面级说明）
node .arch-v1\mid-viewport-tooth-v1\restore.cjs .arch-v1/mid-viewport-tooth-v1/dist.mut wide

node .arch-v1\mid-viewport-tooth-v1\inject.cjs  .arch-v1/mid-viewport-tooth-v1/dist.mut mid940
node scripts/tools/verify-site.js --dir=.arch-v1/mid-viewport-tooth-v1/dist.mut   # 883 / 0（四档全绿 = 边界更正）
node .arch-v1\mid-viewport-tooth-v1\restore.cjs .arch-v1/mid-viewport-tooth-v1/dist.mut mid940
node scripts/tools/tree-digest.cjs .arch-v1/mid-viewport-tooth-v1/dist.mut        # 回到 67d1d0bd…337d
node scripts/tools/verify-site.js --dir=.arch-v1/mid-viewport-tooth-v1/dist.mut   # 883 / 0（回绿）

node .arch-v1\mid-viewport-tooth-v1\probe.cjs      <dir> "archive/,status/,changes/,feeds/" "760,900,940,950,1180,1200,1440,1600"
node .arch-v1\mid-viewport-tooth-v1\probe-grid.cjs <dir> "760,940,950,1180,1440,1600"
npm run check:evidence && npm run gate
```

**改动面**：`research/mid-viewport-tooth-v1-report.md` · `research/mid-viewport-tooth-v1-self-audit.md` ·
`research/_raw/mid-viewport-tooth-v1/readings.json`。
**没有碰**：`scripts/**` · `dist/**` · `docs/**` · `NEXT-STEPS.md` · `package.json` · 任何阈值与登记表。
