# T4 对抗复核 · 二级页残留门禁强度与判据射程（人读版）

> 与 [`report.json`](report.json) 内容一致。复核对象：T1 Stage A（`secondary-page-residue-v1`）的门禁重瞄与新牙。
> 复核分支 `docs/closures-v4`；起始 HEAD `d47ec47`；**复核期间 HEAD 移到 `390e7cc`**（01:46:21 的 docs 提交，未包含本轮代码改动）。
> 唯一可写目录：`research/_raw/secondary-page-residue-v1/adversary/`；全程未改 `scripts/**`、`docs/**`、`dist/**`。

## 0. 我是怎么做到"跑得动"的（方法与可复现性）

| 手段 | 位置 | 关键读数 |
|---|---|---|
| 源码注入沙箱 | `adversary/sandbox/`（`scripts/` 的**副本**，其余 junction/拷贝） | 沙箱 `node scripts/tools/build-local.js` 产出的 304 个文件与仓库 `dist/` **逐个 sha256 相同** ⇒ 注入读数可转移到被复核代码上 |
| 构建期注入探针 | `probe-inject.cjs` / `probe-inject2.cjs` / `probe-inject3.cjs` → `injection-logs/*.log` | P0–P11 共 14 次构建 |
| 静态独立重算 | `probe-static.cjs` / `probe-targets.cjs` → `static-recon-*.json`、`targets-static-*.json` | 45 页目录页家族、逐页题注/首屏说明/冻结串 |
| 浏览器层独立复核 | 把 dist 复制成 `dist-mut-aliasnote/`（只给 3 个别名页插回 `.aliasnote`）后跑**真实** `verify-site.js` | `885 项 / 失败 3 项`（正是 ③b + 两条 ⑨ 对账） |
| 绿色对照 | 对 T5-era dist 的不可变副本跑全量 | `✅ 885 项 / 0 失败` |

复核版本锚点（git blob）：`verify-site.js = 588bfee8`（= T1 的 post-image，与工作区一致）；`audience-selftest = bafc35c4`、`changes-selftest = a49ec23c`、`landing-aliases.json = 31ec3a66`、`audience.js = eaa08da1`；`build-local.js = 23efc6b9` = 我的探针快照 `bbac1af` + captain 的注释一致性修复 + T5 的 feeds 改动。

---

## 1. 构建期牙真的会响吗？有没有可注入点？

**结论：会响；且在本工作区不可被外部注入触发 —— 只能改源码/注册表。**

* **只看自己写的暂存产物**：`build-local.js:6217` 读 `path.join(OUT, …)`；`OUT` 全程**只有一次赋值**（`:125 let OUT = STAGE_OUT;`）；`selfCheck(built)`（`:7369`）在 `promoteStaging()`（`:7370`）之前跑。
* **两种外部预置实验都无效**：
  * P10：把「首屏带 `.snote`」的 HTML 预置进 FINAL_OUT → `exit 0`，预置文件被整套替换（`preNoteStillThere=false`）。
  * P10b：预置进 STAGE_OUT → 构建开头 `rmSync` 清掉，产物里不存在（`stageNoteExistsAfterBuild=false`）。
* **源码注入（沙箱副本，只对别名页）** P1 → `exit 1`，红行逐页点名三条别名路由：

```
✗ 二级数据页首屏出现了说明（…H13）：need/student-only/ 首屏仍有 1 条说明…；need/free-api/ …；need/dev-credits/ …
```

* **T1 的注入读数是否对应这条牙？答：是。** R-1 的红行文字与我 P1 复现的红行**逐字相同**；同一次构建里另有独立的第二类红（`#0 槽位 main-snote 签名 <aliasnote snote>：清单声明 0 条…`），T1 没有把清单对账当前屏扫描。
  * 补一句对 T1 更严的：R-1 的注入是**全局**的（所有目录页都会长出那条说明），输出被 `slice(0,4)` 截断后只列出 `category/`、`vendor/`。我改成**只对别名页**注入后，红行才直接点名三条别名路由。所以「牙咬得到别名页」这件事由我的 P1 补证，而不是由 R-1 的原文证明。

## 2. ③b 的射程对不对？

**45 页；与 dist 逐页对账一致；别名页确实在集合里（但靠的是 `need` 模式，不是 `alias` kind）。**

* 独立静态重算（复刻 `verify-site.js:7728-7731` / `6934-6941`）：`45 = collection 3 + need 10 + category 5 + vendor 25 + hub 2`，`unclassified 0`，16 种 kind。
* 与 dist 独立对账：`category/*=6`（hub+5）· `vendor/*=26`（hub+25）· `need/*=10` · collection slugs 3 → **45 ✓**。
* 浏览器层实证：在「dist 副本 + 只给 3 个别名页插回 `.aliasnote`」上跑真实门禁 → `✗ 目录页家族（45 页，含别名页）…有首屏说明的目录页 3 条：need/dev-credits/ need/free-api/ need/student-only/`。
* **F2（low）**：`DIRECTORY_KINDS` 里的 `'alias'` 是**死元素** —— `kindOfRoute()` 不会返回 `'alias'`（无别名模式），`wideKindByRoute()` 也不补它；别名页进入集合靠 `/^need\/[^/]+\/$/ → 'need'`。当前不可达（别名 spec 由 `NEED_PAGES` 派生，`landing.js:430-457`），但若别名迁出 `need/`，新判据会静默不覆盖，而旧判据（直接遍历别名表）会覆盖。

## 3. 题注形状牙守得住什么、守不住什么（四个反例逐个给结论）

| 反例 | 结论 | 证据 |
|---|---|---|
| (a) 别名页题注写成**别的文本** | **咬得到** | P5：`共 N 条（旧地址）。` → `exit 1`，逐页点名三条别名路由 |
| (b) 别名页把题注**整条删掉** | **咬不到**（已裁定的条件式边界，无兜底） | P3b（不再渲染 `<caption>` 元素）→ `exit 0`、`✅ 构建完成`、读数 45→**42**。对照：**文本清空**（`<caption></caption>` 仍在）会红（P3a：`题注形状不对（0 字）`）⇒ 边界精确落在「元素在/不在」 |
| (c) 题注写对但旁边多一条 `.snote` | **由首屏扫描 + ⑨ 对账兜住**（非题注牙） | P4 → `exit 1`，点名三条别名路由；浏览器层三条 ⑨ 对账 |
| (d) 枢纽页「共 N 个入口。」被误判？ | **不误判**，且枢纽分支在射程内 | P0 全绿（45 条含 2 枢纽）；P8 把枢纽题注改坏 → `exit 1`（`category/ 题注形状不对（10 字）`） |

**F1（medium，本轮最重的一条）**：题注牙对**带属性的 `<caption …>` 完全失明**，反空洞守卫又是绝对值 20：

```
P6b：别名页题注 → <caption class="legacy"> + 57 字长题注（就是本轮删掉的那类站务口径）
     exit=0 红=0
     ✓ 目录页家族题注形状: 42 条 <caption> 逐字匹配「共 N 条。/ 共 N 个入口。」
P6c：同样标记改造、题注内容仍合规 → 同样 exit 0 / 42 条（覆盖静默掉 3 页，零信号）
P6d：45 页全改带属性 → 才红：✗ 题注形状牙扫到的题注太少…只找到 0 条 <caption> < 20
```

算术：`45 − 25 = 20`，`20 < 20` 为假 ⇒ **25 页以内**改造不断绿。源码：`build-local.js:6226` 的 `/<caption>([\s\S]*?)<\/caption>/`、`:6189` 的 `INTRO_CAPTION_MIN_SCANNED = 20`。
这与 captain 刚修掉的「21–29 静默窗口」是同一类失效，只是入口换成「标记形状」而不是「总量」。

## 4. 有没有为了变绿而放宽？

**没有找到放宽。** 逐条点名：

* `check(` 计数：删 4 行 / 增 6 行 ⇒ **净 +2**。
  * `audience-selftest`：同名 check 换向 + **新增**反向断言（`reason` 逐字文本 × dist 全部 `index.html` 0 命中；`dist/` 缺失时**判红**，不静默通过）。
  * `changes-selftest ⑪`：正例换到产物里**真实存在**的 `class="snote mcount"`，并**新增**「历史形状 `class="snote aliasnote"` 同样必命中」。
  * `verify-site ③b`：三段合取 → 单条 `introNoteRoutes.length === 0`（方向上更强，且不再读另一个文件；覆盖从别名子集扩到 45 页全家族）。
* 阈值：`git diff -U0` 逐行扫描 **无** `>`→`>=`、**无** `=== 0`→`<= 1`、**无** 精确名→`includes`、**无** `fail`→`warn`。
* 扫描面：`.snote` / `.vsnote` matcher **逐字未动**（token 级）；intro 区锚点未动；题注扫描是**新增**；非目录页题注只累加读数、不参与任何 `fail`。
* `INTRO_INTERNAL_TERMS` 与 HEAD **逐字相同**（8 条）；`INTRO_TERM_ALLOW` 仍是 `new Set([])`；被删的是**豁免名单** `ALIAS_NOTE_ROUTES`（豁免面缩小）。
* `textFloor` 未被触碰（`page-kinds.js` / `seo.js` 不在改动集；旁证：`node scripts/tools/seo-verify.js` 在 T5-era dist 上 `✅ 19 项 0 失败 · indexable 183 / sitemap 183 / noindex 3`）。
* `landing-aliases.json` 的 `_note`/`_rule`：删掉「页面上给出到目标页的可见链接」这条**散文**契约（它在 HEAD 里也没有任何机器断言），新增 ⑤/⑥ 并各自对应现有断言 ⇒ **如实登记的契约变化**，不是宽松化。

**F3（low）**：`build-local.js:2716` 仍写「判据在构建期（…白名单只有别名页）」，与本文件 `6151-6155` 的「**没有例外**」直接矛盾（同一段说明的其它几处 T1 都改了，漏了这一处）。

## 5. 靶页迁移有没有留下「变异没有承重面」的假绿？

**没有假绿；但读数已被并发改动改写（F5）。**

T1-era dist（`targets-static-t1era.json`，静态独立读数，与门禁同口径）：

```
plans/ 12（首条 121 字、在数据区之前）· status/ 2 · changes/ 14 · feeds/ 8 · models/ 3（首条 103 字）
三别名页 0 · 四壳页每页冻结串恰好 1 次
```

浏览器层（真实 `verify-site.js` 跑在 dist 副本上）：

* 壳守卫：`plans/ 12 · status/ 2 · changes/ 14 · feeds/ 8`；M1–M4 各自咬到 `note-narrow`。
* **M14**：`实测 [note-intro-long] · 说明 3 条 · 首条 盒 1380 / 有字区域 1380 · 窄条 []` ⇒ 注入确实**只推行数**（实测，不是推测）。
* **M15**：`[note-ink-narrow, note-intro-long]`；承重证明逐条：8 条全 `vertical-rl`、列 3–17、列栈 56.78–342.25px < 1173px、按行归并 1 行、内容盒 1380（满宽）、盒宽与注入前逐条相同、`note-narrow` 0 条；正对照 `feeds/@1440 … 竖排 0 · 违规码 []`。
* M6 正对照 `plans/@390 scrollWidth 390 · 溢出类 []`。

承重证明**弱在哪**（F4，low）：

1. 壳守卫（`verify-site.js:8315`）只判 `family === 'wide' && noteCount > 0` —— 纯存在性，没有条数下限、没有「说明参与布局/在阅读列里」的前置。
2. **M14 的隔离性没有被断言**：`:8480-8484` 只查 `codes.includes(expect)`；对比 M15（逐条竖排/列证据）与 M16（`otherCodes.length === 0`）。今天 M14 恰好只出 1 个码，是**读数**不是**判据**。

**F5（low，但收口必须处理）**：T5 已把 `feeds/` 的 `.snote` **8 → 4**、`docs/data/` **9 → 6**。我在 T5-era dist 的不可变副本上独立复跑全量：

```
✅ 验收 885 项，失败 0 项
壳守卫: plans/ 12 · status/ 2 · changes/ 14 · feeds/ 4
M15 承重证明: note-ink-narrow 4 条 [feeds/#0..#3]（T1-era 是 8 条）· M14 仍 [note-intro-long]
```

⇒ **不是假绿，是读数过期**：T1 报告/stage-a-gates 里的 `feeds/ 8 条`、`M15 咬中 8 条`、`M13 9 条`在收口时都必须换成 T5-era 实测值。另记：01:41 附近的 T5 中途状态 `npm run build` `exit 1`（`HISTORY_NOTES.disclaimer` 前后端文案不一致）—— 只作记录，不当缺陷。

## 6. 数值断言有没有被悄悄放松？

**没有。** 见 §4 的阈值扫描与常量对账；另单独核对了「有没有被移出扫描面的容器」：`.snote`/`.vsnote` matcher、intro 锚点、`PROSE_PATTERNS` 均为原样；唯一新增的是题注扫描（加面不是减面）。

**F6（low，附加发现）**：「首屏说明 0 条」的两条判据**扫描面不同**：

* 构建期：`:6203-6206` 取 `(.lsum / .ctable-wrap / <table>)` 里**文档位置最早**的 ⇒ 止于 `.lsum`。
* ③b：`verify-site.js:7219-7224` 取 `DATA_SELECTORS` 里**选择器顺序**第一个命中的（目录页是 `.ctable`，参数顺序排在 `.lsum` 前）⇒ 止于表格顶边。
* P11（只对别名页在 `.lsum` 之后、表格之前插一条 `.snote`）：构建期首屏扫描 **✓ 全绿**，红的换成「说明清单对账」（未登记容器）。若该条说明走 `noteDeclare` 正常登记，构建期两层都不响、③b 会红。
  ⇒ 交付门禁（③b）没被绕过；但**别把构建期那条读数当成 ③b 的射程来陈述**。

---

## 7. 结论与建议（verdict: needs_revision）

* **必须处理**：F1（题注牙的属性盲区 + 绝对值门槛；3 行改动可封：正则容错属性 + 门槛按产物现算 + 读数打印「被判/应有」两个数）。
* **建议处理**：F3（同文件自相矛盾的注释）、F2（`'alias'` 死元素）、F6（两条判据扫描面差的说明）、F4（壳守卫下限 + M14 隔离断言）。
* **收口动作**：F5 —— T5 落盘后同轮重跑 `verify-site --dir=dist` 与两处静态读数，替换报告里所有靶页数字；最终验收必须在**一次干净构建**之后进行（当前 dist 是 T5-era 产物、工作区仍在改）。
* **没跑/证不了的**（见 `report.json.notRun`）：未复核 T1 的 validate/selftest 读数；未独立重算「183 入链 / 0 零入链」；未复核 T5 改动本身；未验证除 `--out=` 之外是否还有其它注入点（按源码逐处核对了 `OUT` 赋值与 `selfCheck` 调用顺序，并实测两种外部预置路径）。
