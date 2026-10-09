# `secondary-page-residue-v2` —— 扫描面外 8 类小字容器 + 上一轮 47 行「待确认」的逐条收口

> 分支 `secondary-page-residue-v2` · 基线 `f091ac4` · 报告日期 2026-10-09
> 口径与证据政策见 [`docs/EVIDENCE-POLICY.md`](../docs/EVIDENCE-POLICY.md)
> 普查（86 组 / 352 次出现 / 186 页的逐条表与裁定书）：[`secondary-page-residue-v2-census.md`](secondary-page-residue-v2-census.md)
>
> **一句话**：上一轮报告 §8 那 7 组「待用户确认」**全部处置完毕（1 组删、6 组给出机制性保留理由，挂起 0）**，
> 扫描面之外的 8 类小字容器 **86 组逐条裁定（4 组实删 / 82 组保留）**；
> 实删 **11 个源码编辑点 + 17 条数据面 `description` 行**（共 28 处文本改动、1164 字可见正文、
> 覆盖 80 个 `/deal/*` 页 + 4 个页族页面），
> 并把「**删掉不许回流**」「**扫描面不许收缩**」做成会响的构建期机器牙（`scanResidue()`），
> 用 **4 次真构建 + 3 次产物副本演练 + 对抗方的独立注入（18 次门禁对照）**证明它会红
> （对抗方另外跑了 26 次真构建调用，其中 9 次走到产物自检）。
> **没有调低任何正文下限、没有删任何断言、Feed 产物 50 个文件逐字节 0 变化**；
> 数据面**唯一**被授权的改动是 `deals.json` 的 17 条 `description`（删「（无头浏览器渲染后提取）」整括号）。

---

## 0. 交付摘要

| 项 | 读数 |
|---|---|
| 扫描面外的 8 类容器 | **86 组 / 352 次出现 / 186 个产物页面**（含 `/deal/*` **80** 页）逐条裁定 |
| 上一轮 §8 的「待确认」 | **7 组全部处置完毕**：**1 组删**（`/models/` 题注末句）· 6 组给出机制性保留理由 |
| **挂起的项** | **0**（去重后 92 个独立裁定对象：**实删 5 · 保留 87**） |
| 实际落地删除 | **11 个源码编辑点 + 17 条数据面 `description` 行 = 28 处文本改动**，覆盖 **80 个 `/deal/*` 页 + 4 个页族页面**（`/plans/` · `/plans/coding/` · `/plans/api/` · `/models/`） |
| 可见正文净减 | **1164 字**（80 × 12 + 17 × 12）+ `/plans/` −34 + `/models/` −30 |
| 代码 / 数据改动 | **15 个已跟踪文件**（代码 10（含 `index.html`）· 数据 1（`deals.json`）· CI 2 · 文档 1（`docs/BUILD.md`）· 工程 1（`package.json`））**+ 4 个新文件**（登记表 / 复核工具 / 本报告 / 普查复制件） |
| `npm run build` | ✅ · 两行新牙在场（`✓ 删掉不许回流 … 0 次` · `✓ 扫描面不许收缩 8 类容器 …`） |
| `npm run check:residue` | ✅ **exit 0** · **44 条断言字面三遍 0 命中**（原样 · 归一化 · JSON 转义）· 8 类下限全过 · 关系式成立 |
| `verify:seo` | ✅ **19 项 / 0 失败**（`indexable 183` · `orphan 0` · `noindex 3` · `sitemap 183`） |
| `verify-site.js --dir=dist`（真浏览器） | ✅ **892 项 / 失败 0**（156s）· JS 错误 0 · 外部请求 0 · 404 0 |
| 全站 186 页回流检测（浏览器层四面） | **0 命中**（阳性对照：删前每页 7 条 → 删后 0） |
| 8 类容器 DOM 元素数 | `165 / 80 / 25 / 19 / 4 / 4 / 1 / 54` —— **三份独立实现同一个数**，全部过下限 |
| 正文下限 | **低于下限 0 页** · deal 最小余量 **639** · 6 个登记残留页逐字复现 · **没有一次重新登记、一处未调** |
| 几何 | 3 个 `/deal/*`：桌面 **Δ0** · 移动 **−22px**（`.ddesc` 少一行）· 无顶高 / 无裁切 / 横向溢出全 0 |
| 数据面 | **`deals.json` 的 17 条 `description` 是唯一授权改动**；**Feed 50 个文件逐字节 0 变化** |
| 变异证明 | 真构建 **4/4 红**（注回被删文案 / 容器整族改名 / 缩登记表 / 删登记表）+ 产物副本 **3/3 红**（含 **F1 修前绿、修后红** 的一对）+ 对抗方独立注入 18 次门禁对照 |
| 对抗复核 | t6 **发现 9 条（最高 high）+ 射程边界 15 条**；t10 修 5 条（F1/F3/F5/F6/F7），**4 条如实登记为射程**（F2/F4/F8/F9） |
| **没跑**（如实） | `npm run gate`（全量 52 步）· `verify-site --compare=ours-baseline` · publish/deploy 与线上冒烟 |
| 产物锚定 | 交付读数全部锚定 `dist` = **`59db0aa5aaef0ac01589c4203dc9dfeda2c7ddbe3883c2a0774f24451607d04a`**（304 文件 / 20,337,838 B）；普查与「删前」读数锚定 `141af613…` |

---

## 1. 本轮的两件遗留、范围与口径

### 1.1 遗留 ①：上一轮 §8 的 47 行 / 7 组「待用户确认」

上一轮（`secondary-page-residue-v1`）把 7 组「不删的理由不像机制理由、更像判断」的条目挂成
「待用户确认」。本轮的要求是**全部处置完毕**：要么删，要么给出**机制性**保留理由
（谁在承重、删了哪条断言会红、哪个下限会被击穿），**不许再以「待确认」挂回去**。
逐组的最终处置与机制见 §3.1。

### 1.2 遗留 ②：扫描面之外的 8 类小字容器

`.dsrc-note` `.ddesc` `.fdesc` `.chgnote` `.pchnote` `.pftdesc` `.chgmeta` `.hint` —— 上一轮 §4.4
只盘点未判。本轮由 `census-lead` 做成 **86 组 / 352 次出现 / 186 个产物页面**的逐条表，
逐条给出可执行动作；本轮把其中 **A/B 类实际删掉**，并把「删掉不许回流」的断言**扩到新扫描面**。
逐类统计见 §3.2，删除的落地见 §2。

### 1.3 口径与锚定（两份产物，别混用）

| 产物 | treeDigest | 用途 |
|---|---|---|
| **普查锚定**：主检出 `dist/`（10-08 数据态，304 文件） | `141af6139516922f925cc9605ee45efd6c4b65c499b2ad2cda689984612d2f34` | 86 组的逐条表、§8 七组的读数、以及「删前」对照 |
| **交付锚定**：本工作树 `dist/`（10-09 数据态，304 文件） | `59db0aa5aaef0ac01589c4203dc9dfeda2c7ddbe3883c2a0774f24451607d04a` | 删除后的全部门禁读数、浏览器读数、几何 |
| 两棵树的字节关系 | 186 个文件有差异 | 差异 = **两段被删文案 + 时间口径**（`数据更新 10-08→10-09`、`最近成功采集 …12:40→02:31`）；**80/80 个 `/deal/*` 页在归一后逐字节相同**（§6、§7） |

**两条产物不是同一个数据态**，所以：① 非 `/deal/*` 页只出「删后」绝对读数，不与主检出比高度；
② `/feeds/` 的可见字数在两棵树之间 +94 字，**全部由数据态解释**（普查树 `feed/new.json` 15 条 ⇒
条件型第 5 条 `.snote` 不渲染；本树 0 条 ⇒ 多渲染 1 条，`3971 → 4065`，Δ 恰 +94），不是文案。
③ 任何一次 `npm run build` 都会让锚定作废，复核方式见 §10。

---

## 2. 逐条改动（本轮到底删了什么）

### 2.1 删除面 1：`.dsrc-note` 尾半句 —— 80 页 × 12 字

**删的是尾半句，不是元素**：`以上是本站采集与整理过程的事实，不构成对优惠是否有效、是否适用于你的判断**；最终以厂商官方页面为准。**`
→ `…是否适用于你的判断。`（49 → 37 字/页）。

| # | 文件:行 | 改动 | Δ | 覆盖 |
|---|---|---|---|---|
| 1 | `scripts/lib/audience.js:826`（`WORDING_CONTRACT.SOURCE_NOTES.disclaimer`，**权威常量**） | 删「；最终以厂商官方页面为准。」 | −12 | 80 个 `/deal/*` 页 |
| 2 | `index.html:1347`（`SOURCE_WORDING.SOURCE_NOTES.disclaimer`，RENDER-CORE **受控副本**） | 同上，**同批** | −12 | 同上（前端渲染源） |

**为什么两处必须同批**：`checkWordingContract()`（`scripts/lib/audience.js:1043`）逐字比对
「权威常量 ↔ `index.html` 的 `AUDIENCE:START/END` 受控副本」，只改一边 `validate --strict` 当场红。
**为什么只删半句**：`verify-site.js:1922`（`hasNote`）与 `:1926`（`/不构成对优惠是否有效/`）两条既有断言
钉在整块 `.dsrc` 文本上 —— 删整个元素会让它们变红，而契约禁止删断言。实测删后：
`不构成对优惠是否有效` **80/80 页仍在**，被删尾半句 **0/80**。

### 2.2 删除面 2：`.ddesc` 采集方式（A 类 17 条）—— **改真源**，不做渲染层遮盖

**删的是整括号，不是整条来源句**：`来源：<来源页/表名>（无头浏览器渲染后提取）。` → `来源：<来源页/表名>。`

| # | 文件:行 | 改动 | Δ | 覆盖 |
|---|---|---|---|---|
| 3 | `scripts/collectors/headless.js:132` | 智谱模板去括号（**根因**：新数据不再写进去） | −12 | 未来数据 |
| 4 | `scripts/collectors/headless.js:298` | 火山「免费额度」表模板去括号 | −12 | 未来数据 |
| 5 | `scripts/collectors/headless.js:313` | 火山「最新活动」区模板去括号 | −12 | 未来数据 |
| 6–22 | `deals.json` **17 条** `description`（行 3851 / 3933 / 4015 / 4075 / 4135 / 4188 / 4241 / 4294 / 4347 / 4400 / 4453 / 4506 / 4559 / 4612 / 4665 / 4726 / 5361） | 存量订正（5 × 智谱 / 10 × 火山「免费额度」/ 2 × 火山「最新活动」） | −12 × 17 | 17 个 `/deal/*` 页 + `dist/deals.json` |

**为什么不这么改不行**（普查当时判「无唯一编辑点、本体在数据面 ⇒ 只能渲染层归一」，
t2 据此把 A 类挂起 ⇒ **队长否决，改判真源**，见 §3.3 裁定 1）：

- 渲染层遮盖后，字符串**仍留在 `deals.json` 与 `dist/deals.json` 里** ⇒ 审计时等于没落地；
- 只改 `deals.json` ⇒ 采集器每轮整体重写它（`git log -- deals.json` 全是 `chore(data): …`），**下一轮冲掉**；
- 只改 `headless.js` ⇒ **本轮 17 个页面一个字都不变**。两处同批是唯一能让「现在干净」与「将来不回流」同时成立的做法。
- 收口判据（不是自述）：`（无头浏览器渲染后提取）` 在 `dist/**` 出现次数 —— **改前 18 个文件（17 页 + `dist/deals.json`），改后 0**。
- 逐条核对（`research/_raw/secondary-page-residue-v2-t9/verify-source.cjs`，exit 0）：两文件**每行都是纯删括号**
  （含非纯删括号的改动行 = 0）；把 HEAD 全文里的整括号全部删掉后 **=== 现文件全文**（两文件都 true）。
- 全仓（排除 `research/` 历史证据、`node_modules`、`.git`、`dist/`）该括号命中 = `deals.json` 17 + `headless.js` 3，**没有第 18 条**。

### 2.3 页族导语 / 口径里的「重复免责」（B 类，4 处）

| # | 文件:行 | 删的片段 | Δ | 页 | 保留了什么 |
|---|---|---|---|---|---|
| 23 | `scripts/lib/plans-hub-page.js:68`（`PLANS_HUB_DESCRIPTION`） | 尾句「价格与条款最终以厂商官方页面为准。」 | −17 | `/plans/` | 「本站只做收录与整理，不排名、不评分、不替读者判断值不值。」（不在共享页脚里） |
| 24 | `scripts/lib/plans-hub-page.js:104`（`PLANS_HUB_NOTES[3]`） | **句首分句**「价格、额度与条款最终以厂商官方页面为准；」 | −17 | `/plans/` | 「「最近更新」是…不是官方承诺不变的日期。」（C 类，`lastSeen` 的语义全靠它界定） |
| 25 | `scripts/lib/plans-page.js:109`（`PLANS_NOTES`） | **句首**「价格与额度以官方页面为准：」 | −12 | `/plans/coding/` | 「表中每条都链到该平台的官方定价页，本站只做收录与整理。」+「官方已公告的调价写在…备注里」 |
| 26 | `scripts/lib/api-plans-page.js:88`（`API_PLANS_NOTES`） | **句首**「价格与额度以官方页面为准：」（与 #25 同形） | −12 | `/plans/api/` | 同 #25 的两件（可核对路径 + C 类列义） |

> **`#24` 是「越界登记 → 队长裁定删除」的一处**：t3 按「不确定就 keep 并登记」只登记未动
> （它在 t3 的枚举列表之外），本轮由**队长裁定删该分句**（见 §3.3 裁定 2）。
> 一处**归因订正**随之进源码注释：t3 注释称「census 说的 `/plans/` 合法存在那一处 = `PLANS_HUB_NOTES` 第 4 条」——
> **不对**，census 指的是 `plan-history.js` 的「不表示厂商已经下架或套餐已经停售。」；
> **正是这个错指导致了「本轮不动」的结论**，所以它不是笔误级问题，是一个会改变行为的错误前提。

### 2.4 补删上一轮漏掉的一处（B 类，1 处）

| # | 文件:行 | 删的片段 | Δ | 说明 |
|---|---|---|---|---|
| 27 | `scripts/lib/plan-history.js:231`（`PLAN_HISTORY_WORDING.disclaimer`） | 尾句「价格、额度与条款最终以厂商官方页面为准。」 | −17 | 上一轮在**同形的三个兄弟常量**上都删了这一句（`plan-changes.js` / `api-plan-history.js` / `history.js` 的注释都写着「已删」），**唯独这一处漏了** —— 注释声称删了、字面仍在。留着未删的字面就是「回流」活口（`feeds.js:950 → 1010` 会把该常量推回 **Feed 正文**，只对 `ended` 事件）⇒ 本轮补删。<br>**实测**：当前数据 `ended = 0` ⇒ 该字面在 Feed 产物里 **0 命中**，删它**不改变任何 Feed 字节**。 |

### 2.5 `/models/` 题注末句（§8 七组里**唯一批准删除**的一组）

| # | 文件:行 | 改动 | Δ | 页 |
|---|---|---|---|---|
| 28 | `scripts/lib/models-page.js:872` | `…的本站数据；「目录状态」是派生分类，「模型角色」来自 registry。` → `…的本站数据。` | **−30**（census 预测 29 字，未计 `registry` 前那个空格；`seo.visibleText` 实测 Δ−30） | `/models/` |

**为什么这一组能删而题注那 45 条不能**：题注牙的射程是 `built.directoryPages`
（`build-local.js:6208-6209`，只含 collection / need / alias / vendor / category / hub），
**`/models/` 是 `models-index`、不在射程内**（`build-local.js:6280-6283` 写明非目录页题注只报告不判）；
删后题注仍非空（前两句 = 表图例）⇒ 不会触发「有主表却没有 `<caption>`」，a11y 名照旧存在（只是短了 30 字）。
正文下限：`5740 − 3660 = 2080` → **2050**（跨树复算见 §6.3）。

### 2.6 只登记、没有删的两处（**不是「待确认」**，是 keep 决定）

| 位置 | 处置 | 机制理由（不是口味） |
|---|---|---|
| `scripts/lib/feeds.js:151`（`/feeds/` 的 `officialNote`） | **keep**，理由与两个读数写进源码注释 | 页面族结构下限 `main-snote ≥ 4`（`build-local.js:2359`）。**两个真实数据态都跑了构建**（用 `build-local.js` 副本 + `--out`，仓库原件未动）：现构态（`feed/new.json` items=0）删它 ⇒ `4 == 下限`（**绿、零余量**）；普查态（`141af613`，new Feed 15 条）删它 ⇒ `/feeds/` 只剩 4 条 ⇒ **3 < 4、构建当场红**（原话：「feeds/ 槽位 main-snote：页面族的结构下限是 4 条，产物里只有 3 条…」+「❌ 产物自检失败（1 项）」）。第二个状态**每次采集到新条目后都会重现** ⇒ 这是结构性红，不是「某次读数不好看」。契约禁止调低下限 ⇒ keep |
| `plans-hub-page.js:104`（`PLANS_HUB_NOTES[3]`） | 已在 §2.3 #24 **删除**；此处仅说明它曾是「scope 外同形项」 | 队长的裁定理由：它与**同一页**刚被删掉的导语尾句是同一个判断（同一句同义重复、同一条 B 类判据）⇒ 只做一半会留下不一致 |

> **一处与「待确认」无关的保留（如实登记）**：`/plans/` 的「口径与说明」里另有
> 「不表示厂商已经下架或套餐已经停售。」这类 C 类口径（`plan-history.js`），
> 它与被删的半句**不是同一个字符串**（前者不带「最终以…为准」的后缀），本轮不动。
> 牙必须按**整句**锚定，写成裸短语「最终以厂商官方页面为准。」会把这条合法 keep 判红（§2.6 末注 + §5.5 的「不按原话改」登记）。

### 2.7 逐条改动总表（口径）

| 项 | 读数 |
|---|---|
| 源码编辑点（删除类） | **11**（`audience.js` 1 + `index.html` 1 + `headless.js` 3 + `plans-hub-page.js` 2 + `plans-page.js` 1 + `api-plans-page.js` 1 + `plan-history.js` 1 + `models-page.js` 1） |
| 数据面行（删除类） | **17**（`deals.json` 的 `description`） |
| 合计文本改动 | **28 处** |
| 纯登记注释（无行为） | **1** 处（`feeds.js` keep 登记，+28 行注释） |
| 覆盖产物 | 80 个 `/deal/*`（#1/#2）+ 17 个 `/deal/*`（#6–22）+ `/plans/`（#23/#24）+ `/plans/coding/`（#25）+ `/plans/api/`（#26）+ `/models/`（#28）+ `index.html`（#2 的受控副本宿主）+ `deals.json`/`dist/deals.json`（#6–22） |
| 可见正文净减 | **1164 字**（80 × 12 + 17 × 12），全在 86 个页面上；`plans` / `models` 的 −37 / −30 另计（§6） |

---

## 3. 裁定与理由

### 3.1 上一轮报告 §8 的 7 组「待确认」——**逐组最终处置**

| # | 组 | 最终动作 | 机制理由（删了谁会红） | 实测读数 |
|---|---|---|---|---|
| 1 | 42–45 条目录页题注 `共 N 条。` / `共 N 个入口。` | **保留** | ① 题注牙的**承重面**（`build-local.js:6196-6267`，`captionScanned === captionExpected` 按产物现算，删整条或只删文字都当场红）；② `<caption>` 是 `.ctable` 的 **a11y 可访问名**。契约禁止「删/改断言」⇒ 要删必须同批换等强度替代物（另一轮的事） | 实测 **45 条**（`captionScanned = captionExpected = 45`；上一轮写的「42」是题注牙修好**之前**的读数）。最薄页 `/need/no-card/` 余量 `50 → 44`（正文下限 `660`，**不碰**） |
| 2 | `/status/`「机器可读的同一份数据：source-health.json。」（32 字） | **保留** | 页面族结构下限 `main-snote ≥ 2`（`build-local.js:1379`）：`/status/` 恰好 2 条 `.snote`，删它剩 1 < 2 ⇒ 构建期 `floors` 与 `verify-site.js` §22c ⑨ 同时红。要删必须调低下限 ⇒ 契约禁止 | 正文下限：`1228 − 600 = 628 → 596`（**不碰**正文下限；被钉住的是结构下限） |
| 3 | `/feeds/`「信息来自厂商官方页面，最终以官方页面为准。」（21 字） | **保留** | 页面族结构下限 `main-snote ≥ 4`（`build-local.js:2359`）⇒ 见 §2.6 的**两个数据态实测**：现构态删它 = `4 == 下限`（绿、零余量）；普查态删它 = `3 < 4` **当场红**，而该状态每次「当天首次收录」后都会重现 | 正文下限：`3971 − 600 = 3371 → 3350`（**不碰**） |
| 4 | `/feeds/`「套餐变化来自人工逐条核对官方页后重建的套餐数据（plans.json）…」（133 字） | **保留** | 同 #3（结构下限钉住）。**但形状上确实是 A 类**（点名 `plans.json` / `api-plans.json` 与生成方式）⇒ 报告如实写明：正确做法不是删，而是**改写成面向读者的落点说明**（改写不改条数 ⇒ 不碰下限），本轮**没有做**（§8） | 删 133 字后余量 `3371 − 133 = 3238`（**不碰**下限） |
| 5 | `/models/` 题注末句「；「目录状态」是派生分类，「模型角色」来自 registry。」 | **删除（唯一）** | 不碰题注牙（`/models/` 不在 `directoryPages` 射程内）· 不碰正文下限（余量 `2080 → 2050`）· 全仓没有任何断言引用这句话（`grep 「目录状态」是派生分类` 只命中它自己）。判据：末句 = **A 类内部标识符**（`registry` 是内部数据文件名）+ **B 类重复**（「目录状态是派生的中性分类、不是质量评分」在同一页下方「口径与说明」里已完整讲过一遍，且写得更细） | 落地见 §2.5（**−30 字**，一次唯一命中） |
| 6 | `/status/`「这一页列出每个采集来源最近一次的结果与跨运行的连续性…」（128 字状态判据） | **保留** | C 类：三态定义（正常 / 异常 / 失败）与阈值（连续 3 次零产出、掉到上次一半以下）的唯一说明 —— 删了读者无法判断 ❌ 是什么意思；**同时**被结构下限 `main-snote ≥ 2` 钉住（删它 = 删掉一半） | 删 128 字后余量仍 `628 − 128 = 500 ≥ 0`（不碰正文下限），但结构下限当场红 |
| 7 | 扫描面之外的 8 类小字容器（`.dsrc-note`/`.ddesc`/`.chgnote`/`.pchnote`/`.pftdesc`/`.chgmeta`/`.hint`/`.fdesc`） | **逐条处置**：**4 组实删 / 82 组保留** | 逐条见 §3.2；普查的 86 组**没有一组**停在「待确认」 | 86 组 / 352 次 / 186 页；被正文下限钉住 **0 条** |

**「挂起」计数**：§8 七组 + 8 类容器的 86 组 = **93 条登记记录**；其中 §8-7 就是「86 组逐条处置」这一项本身，
去重后 **92 个独立裁定对象**：**实删 5**（4 组容器 + §8-5 的 `/models/` 题注末句）、**保留 87**、**挂起 0**。

### 3.2 8 类容器 86 组：4 组删、82 组保留（保留的理由按**承重机制**分类，不按口味）

| 容器 | 组 | 次 | 页 | 删（组/次） | 保留（组/次） |
|---|---|---|---|---|---|
| `.dsrc-note` | 3 | 165 | 80 | 1 / 80 | 2 / 85 |
| `.ddesc` | 44 | 80 | 80 | 3 / 17 | 41 / 63 |
| `.fdesc` | 25 | 25 | 1 | 0 / 0 | 25 / 25 |
| `.chgnote` | 1 | 19 | 1 | 0 / 0 | 1 / 19 |
| `.pchnote` | 3 | 4 | 2 | 0 / 0 | 3 / 4 |
| `.pftdesc` | 4 | 4 | 1 | 0 / 0 | 4 / 4 |
| `.chgmeta` | 1 | 1 | 1 | 0 / 0 | 1 / 1 |
| `.hint` | 5 | 54 | 1 | 0 / 0 | 5 / 54 |
| **合计** | **86** | **352** | 86（并集） | **4 / 97** | **82 / 255** |

保留的 82 组，按**谁在承重**分四类（每一类的逐条原文、页数、`sourceFile:line` 在
`research/_raw/secondary-page-residue-v2/census2.json` 的 `rulings[]` 里，可逐条推翻）：

| 承重机制 | 组 / 次 | 代表条目 |
|---|---|---|
| **既有断言钉住**（删了有门禁当场红） | **2 组 / 82 次** | `.dsrc-note@.dhist`（`build-local.js:5523` 要求无变更记录的条目必须含 `HISTORY_NOTES.emptyNote`；80/80）· `.pchnote@base`（`build-local.js:5859-5861` 要求 `CHANGES_LABELS` 保留 `{date}`/`{n}` 槽位） |
| **数据面依赖**（改它等于改数据 / Feed 字节） | **29 组 / 29 次** | `.fdesc` 25 条（Feed 的 description 槽位：25/25 逐字出现在 Feed 产物、25/25 频道 description 以它为前缀）· `.pftdesc` 4 条（官方原文引证，正文来自 `api-plans.json`） |
| **C 类数据语义**（删了改变读者判断） | **45 组 / 71 次** | `.ddesc` 的 41 条领取说明（怎么领、有什么限制）· `DSRC-NOTE-DPLANS` 的「当前活动价 ≠ 这条优惠的价格」（5 次）· `.pchnote-more` 的截断口径（「另有 30 条更早的变化」删了会被读成「一共只有 30 条」）· `.chgmeta` 的基准日/起算日 |
| **D 类交互 / 结构槽位**（删了留空槽或丢可点性提示） | **6 组 / 73 次** | `.chgnote` 19 条生命周期事件行（`/changes/` 上 `<div class="chgv">` 的**唯一正文**）· `.hint` 5 组 54 次（50 条可点性提示 + 4 条档位口径与条数） |
| **合计** | **82 组 / 255 次** | 与 §3.2 上表的「保留」列逐项吻合 |

> **`.fdesc` 的 keep 是硬约束推论、不是内容判断**：25 条里有 2 条形状上是 A 类
> （第二句「数据来自本站重建套餐数据时的观测记录」= 生成方式自证），但它们是 Feed 产物的
> description 槽位 ⇒ 改它 = 改 Feed 字节（本轮硬约束）⇒ keep。要删必须另开一轮并接受订阅者看到的
> description 变化。这条**如实登记**在 §9。

### 3.3 队长在本轮下的三条裁定（以及被否决的路径）

| 裁定 | 内容 | 被否决的路径 |
|---|---|---|
| **1** | `.ddesc` 的「（无头浏览器渲染后提取）」**改真源**：`headless.js` 3 处（根因）+ `deals.json` 17 条（让本轮产物真的清掉）。**不授权渲染层归一** | 否决「渲染层正则剥离」（遮盖不是清理）· 否决「把 A 类排到下一轮」· 否决「把 `dist/deals.json` 记为已知承载」 |
| **2** | `PLANS_HUB_NOTES[3]` 的**句首分句删掉**（保留 C 类那半句） | 否决 t3 备的切点（删到「…不是官方承诺不变的日期。」= 把 C 类半句一起删）· 否决「留到下一轮」 |
| **3** | `/feeds/` 的 `officialNote` **keep**，理由与两个数据态读数写进源码注释 | 否决「下调 `main-snote ≥ 4`」（用户明令禁止放宽阈值）——「不能删」的结论必须由**机制**给出，不能由「余量够不够」给出 |

**冻结范围随之收窄（必须写进报告）**：本轮原本承诺「数据面逐字节不变」，现收窄为 ——
**`deals.json` 的 17 条 `description` 是唯一被授权的数据面改动**，其余数据面文件
（含 `dist/feed/**` 全部 48 个、`scripts/data/**` 全部）**仍必须逐字节不变**（§7 逐条给出）。

### 3.4 四处勘误（照实测写，不照简报 / 上一轮的说法抄）

| # | 说法出处 | 说法 | 实测 |
|---|---|---|---|
| 1 | 本轮任务简报 | 「含 `/deal/*` **95 页**」 | **`/deal/` = 80 页**。全站 186 页 = 80 deal + 52 models + 26 vendor + 6 category + 10 need + 3 plans + 9 单页；`deals.json` 里 153 条记录，只有 **80** 条产出详情页（由 landing 清单决定）。95 与任何一份现成读数都对不上 |
| 2 | 上一轮 census §4.4 | 「`.chgnote` = 折叠控件标签」 | **产物里不是**：`/changes/` 全页只有 **1** 个折叠控件（`<details class="chgother">`），19 个 `.chgnote` 是生命周期事件行 `<div class="chgv">` 里的**唯一正文** |
| 3 | 上一轮报告 §8 第 1 组 | 「**42** 条目录页题注」 | **45 条**（`captionScanned = captionExpected = 45`）；42 是题注牙修好**之前**的读数 |
| 4 | 队长预读（`captain-preflight-notes.md` §3.1） | 「`.dsrc-note` 真实元素数 **162**（80 + 80 + 2）」 | **165**（80 `.dhist` + 80 `.dsrc` + 5 `.dplans`）。三份独立实现同数：构建期 `scanResidue()`、`product-token-totals.cjs`（独立重写）、真浏览器 `querySelectorAll`。**docs-lead 另用一段独立的 PowerShell 计数复算**（186 个 HTML、剥 script/style、class token 级、最近祖先分桶）：`total = 165`、`dhist = 80`、`dsrc(+dplans) = 85` ⇒ **165 才是元素数**，162 那一条不成立 |

---

## 4. 门禁读数

### 4.1 新牙的落地形态（判据只此一份）

| 面 | 位置 | 说明 |
|---|---|---|
| 判据本体 | `scripts/tools/build-local.js` 的 `scanResidue()`，接进 `selfCheck()` | **每次 `npm run build` 都跑**，构建期打印两行读数 |
| 登记表 | `scripts/data/residue-guard.json` | `deletedCopy` 32 条（= **44 条断言字面**，组成 = census2 的 4 条 + 上一轮 census 的 23 条 + 本轮新删 5 条）/ 8 类 `containerFloors` / 2 条关系式 / 反空洞阈值 / `_measuredOn`（锚定 `59db0aa5…`） |
| 复核入口 | `scripts/tools/check-residue.js` + npm `check:residue` | `require` **同一个** `scanResidue()`（不复制逻辑），可对**任意产物副本**跑 —— 变异演练与对抗复核都靠它 |
| CI 门禁 | `.github/actions/gate/action.yml` 步骤 `Residue guard (deleted copy must not return; container floors)` | 必须带 `--dir=dist`；登记面 = `check-ci-consistency.js` 的 `GATE_STEP_NAMES` / `GATE_STEP_RUN` / `GATE_ARTIFACT_STEPS` 三处 + `docs/BUILD.md` |

**判据内容**（细节见 `docs/DESIGN-RULES.md` §8.2 与 N19）：
① 删掉不许回流 —— 整篇产物 304 文件里 **44 条断言字面三遍 0 命中**（原样 · 归一化 · `.json`/`.ndjson` 的 `\uXXXX`）；
② 扫描面不许收缩 —— 8 类容器下限 + 关系式 `.ddesc ≥ 1×详情页数` / `.dsrc-note ≥ 2×详情页数`；
③ 登记面与服务页脚反空洞 —— 条目 ≥ 30 · **活字面 ≥ 40** · `floor ≥ measured × floorRatio(0.5)` · 登记表缺失**抛错**；
④ **豁免机制已移除**，换成正面断言：页脚保留句「最终以官方页面为准。」**186/186 页**都在、`index.html` 的 SHARED 页脚元素**不含**任何登记字面。

### 4.2 现场读数（**本报告作者自己跑的**，不是转述）

```
$ node scripts/tools/tree-digest.cjs dist
dist: 304 文件 / 20337838 B · 全树摘要 59db0aa5aaef0ac01589c4203dc9dfeda2c7ddbe3883c2a0774f24451607d04a
清单摘要 c27410e61933ae3d0a8ceb5eb276376cbfc0ab6700be0ad532e2029337ed4fda

$ node scripts/tools/check-residue.js --dir=dist      # exit 0（下面为摘录）
  登记表 scripts/data/residue-guard.json · 被删文案 32 条（下限 30）· 断言字面 44 条（活字面下限 40）· 归一化针 24 条
  扫描 304 个产物文件（其中 HTML 186 个）· 三遍命中 0 次（原样 0 · 归一化 0 · JSON 转义 0）
  豁免面: **本机制已移除**（t10/F1：取值面与作用域同源 ⇒ 白名单自证；基线受益者 0 条）
  共享页脚正面断言: 锚点 186/186 页 · 保留句「最终以官方页面为准。」在 186/186 页的页脚里
  只在 script / style / 注释里的命中（只报不判）: 0 次
  8 类容器（实测/下限）: .dsrc-note 165/123 · .ddesc 80/60 · .fdesc 25/18 · .chgnote 19/14 · .pchnote 4/2 · .pftdesc 4/2 · .chgmeta 1/1 · .hint 54/40
  关系式（详情页数 80，从产物现算）: .ddesc 80 >= 1×详情页数(80)=80 · .dsrc-note 165 >= 2×详情页数(80)=160
✅ 产物复核通过：44 条被删文案三遍 0 命中（无豁免名单） · 8 类容器均不低于下限且关系式成立
```

构建期的两行（`research/_raw/secondary-page-residue-v2/browser/build-after.log` 里逐字）：

```
✓ 删掉不许回流: 44 条被删文案（登记 32 条 × 两个面） × 304 个产物文件（HTML 剥离 script/style/注释后）· 剥离后命中 0 次
✓ 扫描面不许收缩: 8 类容器存在性下限 .dsrc-note 165/123 · .ddesc 80/60 · .fdesc 25/18 · .chgnote 19/14 · .pchnote 4/1 · .pftdesc 4/1 · .chgmeta 1/1 · .hint 54/40
```

> **两行读数的小差异如实说明**：构建日志是 **t4 那一版**（`.pchnote/.pftdesc 4/1`，豁免机制仍在）；
> **终态**是 `.pchnote/.pftdesc 4/2` + 无豁免 + 三遍比对（t10 收紧后）。
> 终态的两行在 `gate-teeth` 的 t10 构建日志里；`dist` 摘要在两次构建之间**逐字节相同**（`59db0aa5…`）
> ⇒ 判据收紧**没有改动产物**（这正是我们要的）。

### 4.3 全链读数

| 命令 | 读数 | 谁跑的 |
|---|---|---|
| `npm run build` | ✅ `产物自检通过` · 186 页 · 详情页 80 · sitemap 183 · 订阅 25 Feed × 2 = 50 文件 472 条 · 说明清单 523 条 · 两行新牙在场 · **exit 0** | t5（t4 版判据）· gate-teeth（t10 版，dist 摘要不变） |
| `npm run check:residue` | **exit 0** · 三遍 0 命中 · 8 类下限全过 · 关系式成立 | 本报告作者（现场） |
| `npm run test:strict`（`validate --strict`） | ✅ 校验通过（strict 模式） | t2 · t9 |
| `npm run verify:seo` | ✅ **19 项 / 失败 0**（`indexable 183` · `noindex 3` · `orphan 0` · `sitemap 183`） | t3 · t5 · t9 |
| `node scripts/tools/verify-site.js --dir=dist` | ✅ **892 项 / 失败 0**（156s）· JS 错误 0 · 外部请求 0 · 404 0 | t5（156s）· t9（复核）· t6（对照两轮 150.8s / 145.9s） |
| `selftest:feeds` / `planshub` / `models` / `plans` / `api-plans` / `plan-history` | 145/0 · 32/0 · 120/0 · 264/0 · 176/0 · 132/0 | t3 |
| `selftest:audience` / `selftest:provenance` | 206/0 · 132/0 | t2 · t9 |
| `npm run check:ci` | ✅ **39 项 / 失败 0**（含新步骤的三处登记；`(E)` 打印「实跑项数 == `--expect-checks=39`」） | t4 · **本报告作者（现场复跑）** |
| `npm run check:feeds:reproducible` | ✅（2 次构建逐字节一致） | t3 · t9 |
| `npm run check:evidence` | ✅ 0 个新进 Tier-3 文件 | t4 |
| `npm run selftest:seo` | 103 项 / 0 失败 | t4 |
| `npm run gate`（全量 52 步） | **没跑**（见 §8） | — |

### 4.4 产物同一性（读数不交错）

`dist` 的全树摘要在四个时刻取的都一样：t5 构建前 / t5 构建后 / t6 复核前后 / t10 重新构建后
—— 全部 `59db0aa5aaef0ac01589c4203dc9dfeda2c7ddbe3883c2a0774f24451607d04a`（304 文件 / 20,337,838 B）。
**t10 的判据收紧没有改动任何产物字节**；本报告的 §5/§6/§7 读数因此可以互相比对。

**判据侧的修订锚（本报告读数锚定的那一版，逐文件 sha256 前 20 位）**：
`scripts/tools/build-local.js` = `f5c2914b0ee7ada63578…`（507 KB 级，含 `scanResidue()` / 归一化 / 关系式 / 下限自守）·
`scripts/data/residue-guard.json` = `e5108bd77ec06a5b82f8…` ·
`scripts/tools/check-residue.js` = `cfc012ad76427aab1e7a…`。
**判据本体若在报告落盘后被改动，这些读数需要重跑**（`npm run check:residue` 一条命令即可复核）。

---

## 5. 变异证明（会红 / 会绿，全部 as-expected）

### 5.1 构建路径面：源码副本树里的**真构建**（`node scripts/tools/build-local.js --out=dist`）

原始读数：`research/_raw/secondary-page-residue-v2/mutation/mut-build.json`（t10 重跑，2026-10-09T08:30Z）。

| id | 变异 | 期望 | 实测 | 判据原话 |
|---|---|---|---|---|
| **M2a** | 把 `.plans/coding/` 的清单条目恢复句首「价格与额度以官方页面为准：」⇒ 重新渲染出来 | 红 | **exit 1** ✅ | `✗ 删掉的字面又回到了产物里（1 个文件 · 原样 1 处 · 登记 v2-plans-api-note-head/literal）：「价格与额度以官方页面为准：」 ⇒ plans/coding/index.html` **＋** `✗ 删掉的字面以**等价写法**回到了产物里（归一化后 1 处 · 登记 v2-plans-api-note-head/literal）：归一化针「价格与额度以官方页面为准:」` |
| **M2b** | 把 `.fdesc` 的**唯一构造点**改名（`class="fdesc"` → 别的）⇒ 整族在产物里消失 | 红 | **exit 1** ✅ | `✗ .fdesc 在产物里只有 0 次 < 下限 18 ——这一族容器可能被整族删掉 / 改名了（容器没了，逐条扫描自然也不再命中它）` |
| **M3** | 登记表 `deletedCopy` 从 32 条砍到 29 条（≤ 反空洞下限 30） | 红 | **exit 1** ✅ | `✗ 被删文案登记表只有 29 条 < 下限 30 …删条目必须同时显式改 build-local.js 的 RESIDUE_MIN_ENTRIES，不许静默缩表` |
| **M4** | 把登记表**整份删掉**（连表都不在） | 红 | **exit 1** ✅ | 读不到登记表 ⇒ **抛错**（判据不许退化成「没有可判的字面」） |

> **M2b 的附带读数（这条守卫的存在理由）**：`.fdesc` 整族改名**只触发 1 项**产物自检失败，
> 而那唯一一项**就是**齿②的下限 —— 也就是说「把这一族容器整族改名」在**没有齿②时构建全绿**，
> 而且齿①也不会命中（容器没了，字面自然也不再出现）。这正是任务里点名的失效方式。

### 5.2 产物副本面：`check-residue.js --dir=<沙箱>`（与构建期同一份实现）

原始读数：`mut-product.json`（t10 重跑）。真产物**未被改动**：`distDigestBefore == distDigestAfter == 59db0aa5…`。

| id | 变异 | t4 时 | **t10 后** | 读数 |
|---|---|---|---|---|
| **M1** | 被删文案注回**页脚之外**（`/feeds/` 的 `<main>` 后 + 一张详情页 `</main>` 前） | 红 | **红（exit 1）** ✅ | 4 条：`c2-01/literal` 与 `c2-01/visible`+`c1-05/literal` 各 1 处（`feeds/index.html`）· `v2-plans-api-note-head/literal` 1 处（`deal/017bdbc04e70/`）· 归一化针 1 处 |
| **M2c-共享页脚注入** | 同一段被删文案写进**共享页脚**（186 页 `</footer>` 前 + `index.html` 的 SHARED 页脚元素里）—— **t6 的 F1 旁路现场** | **绿（豁免放行）** | **红（exit 1）** ✅ | `186 个文件 · 原样 187 处 · 登记 c2-01/literal` + 归一化 187 处 + **`✗ 共享页脚正面断言：SHARED 页脚元素里出现登记字面 …—— 页脚不是被删文案的合法落点`** |
| **M2c-页脚之外再加一份** | 在上一份沙箱上再放一份到首页 `<main>` | 红 | **红（exit 1）** ✅ | 同上 + 原样 188 处 |

> **这一对（M2c）是本轮最该记住的变异**：t4 时它是**绿**的（豁免机制放行 372 次命中），
> t6 用独立沙盒证明那条路能让**整篇产物 186 页回流而整条门禁链全绿**（F1 · high），
> t10 把豁免机制删掉之后**同一份注入变红**。修前/修后都留下了原始 JSON —— 这就是「机制被证伪过」的证据。

### 5.3 对抗方的**独立注入**（t6 段 4，我未复跑，读数引自 `adversary/report.md`）

三段登记字面分别注入产物副本（deal 正文 / `.ddesc` + `feed/new.json` / `/plans/` 正文），
control 与 inject 各跑 **9 条产物门禁**：

| 结论 | 门禁 |
|---|---|
| **RED（会回答「已删文案是否回流」）** | `check:residue`（3 项，点名登记 id 与落点）· `check-feeds-reproducible`（注入 `feed/new.json` 后与重建不一致） |
| **GREEN（命题里不含「某段已删文案不得出现」）** | `seo-verify` · `planshub` · `models-page` · `archive` · `data-docs` · `analytics` · `verify-site`（145.9s） |

**这条读数的意义**：产物门禁一共 9 条，**只有 2 条**回答「已删文案有没有回流」这个命题。
别把「全链绿」当成「没有回流」—— 那是 7 条**别的**命题在绿。

### 5.4 浏览器层的独立复算（t5，阳性对照）

| 面 | 读数 |
|---|---|
| `document.body.innerText`（全站 186 页 × 48 条字面） | **0 命中** |
| `document.body.textContent` | **0 命中** |
| 序列化 HTML（剥 script/style/注释） | **0 命中** |
| 序列化 HTML（**不剥** —— 内联 RENDER-CORE 也算） | **0 命中** |
| **阳性对照：删前产物**同一条检测 | 每页命中 **7** 条 → 删后 **0**（检出器有效，不是「永远为 0 的假检测」） |

删前那 7 条逐条可解释：`c2-01/literal`「；最终以厂商官方页面为准。」· `c2-01/visible` ·
`c2-02/visible` · `c2-03/visible` · `c2-04/visible` · `v2-headless-capture-paren/literal` ·
`c1-05/literal`（与 `c2-01/visible` 同形）。

### 5.5 t10 对「已修发现」的**反向复现**（修前绿 / 修后红，原始读数 `mutation/mut-t10.json`）

| id | 对应发现 | 变异 | **修前（t6 实测）** | **修后实测** |
|---|---|---|---|---|
| **T1a** | **F1**（high）豁免自证 | **真构建**：把「价格与条款最终以厂商官方页面为准。」写回 `index.html` 的 **SHARED 页脚元素** | exit **0** · 产物 **186 次 / 186 页** | **exit 1** ✅（点名 `v2-plans-hub-description-tail/literal`，186 个文件 / 原样 186 处） |
| **P1** | F1 对照 | 产物副本：同一句塞进**每一页 `<footer>`、不动 SHARED 区间** | exit 1（红） | exit **1** ✅ |
| **T5a** | **F5** 反空洞只数条目 | **真构建**：清空 26/32 条的 `literal`（条目数仍 32） | exit **0** · 活字面 44 → 6 | **exit 1** ✅（点名 26 条死字面 + `活字面只有 19 条 < 下限 40`） |
| **T6a** | **F6** 下限无自守 | **真构建**：`.dsrc-note` 的 `floor` 123 → 1 | exit **0** | **exit 1** ✅（`下限 1 < 实测 165 × 0.5 = 82.5`） |
| **T3a** | **F3** 等价变体 | **真构建**：同一句以**数字实体**写进 renderer | exit **0** | **exit 1** ✅（归一化针命中） |
| **P2–P8** | F3 | 产物副本：零宽 / `<span>` 拆字 / 标签间折行 / `&nbsp;` / 全角句号 / JSON 单转义 / JSON 双转义 | 全 exit 0 | 全 **exit 1** ✅ |
| **P0** | 基线 | 未改动的一份 `dist` 副本 | 绿 | exit **0** ✅（无假阳性） |

> **两处「不按原话改」的登记**（t10 写在 `mutation/README.md` 里，本报告照抄）：
> ① 归一化**不做「去掉全部标点」** —— 被删的「…为准**。**」与保留下来的「…为准**；**排序与推荐理由不出售。」
> 只差一个标点，去掉标点会让 **80 张详情页**被判成回流；改成**同类标点归一、不跨类**。
> ② 归一化那一遍只覆盖**有可见核的 24 条**，4 条「源码写法且没有可见核」的登记**只判原样那一遍**，逐条点名。

### 5.6 变异的边界（如实记，不夸大）

1. **M2a 现在红两项**（原样 + 归一化各一项），**M2b / M3 / M4 各红一项** —— 「一条牙变红就算证明」这种说法不要用。
2. **登记表「两处协同改」仍不红**（F6 残留）：代码里的扫描面声明与下限表同批去掉一类，不会被发现。
3. **变异只在副本树 / 产物副本里做**，真产物 `dist` 的摘要在所有演练前后逐字节相同。

---

## 6. 几何与正文下限（真浏览器 · Edge 154.0.4258.62 headless）

口径：可见字数 = `seo.visibleText()`（与 `textFloor` 同一把尺）；页高 = `documentElement.scrollHeight`；
横向溢出 = `scrollWidth − clientWidth`（必须 0）。抽样 **40 路由 × 2 视口（1440×900 / 390×844）**，
全站 **186 页 @1440×900** 扫面；`verify-site.js` 另跑 1440 / 1600 / 950 / 760 / 390 / 360 的几何面。

### 6.1 删前 / 删后对照（3 个 `/deal/*`，两视口）

| 页 | 视口 | 页高 删前→删后 | Δ | 归因 | `.dsrc` 块高 | 免责行（字） | 回流命中 |
|---|---|---:|---:|---|---:|---:|---:|
| `/deal/adcb6471a512/` | 1440×900 | 1511 → 1511 | **0** | `.ddesc` 与 `.dsrc-note` 都是单行，删字不改行数 | 320 → 320 | 49 → **37** | 7 → **0** |
| `/deal/adcb6471a512/` | 390×844 | 1963 → 1941 | **−22** | `.ddesc` **44 → 22px**（少一行，行高 ≈22px）；`.dsrc-note` 35 → 35px（行数不变） | 357 → 357 | 49 → **37** | 7 → 0 |
| `/deal/2db62eb1a8a0/` | 1440×900 | 1493 → 1493 | **0** | 同上 | 365 → 365 | 49 → **37** | 7 → 0 |
| `/deal/2db62eb1a8a0/` | 390×844 | 1961 → 1939 | **−22** | `.ddesc` 44 → 22px | 505 → 505 | 49 → **37** | 7 → 0 |
| `/deal/57847fbcc1ed/` | 1440×900 | 1493 → 1493 | **0** | 同上 | 365 → 365 | 49 → **37** | 7 → 0 |
| `/deal/57847fbcc1ed/` | 390×844 | 2018 → 1996 | **−22** | `.ddesc` 44 → 22px | 539 → 539 | 49 → **37** | 7 → 0 |

**两条可证伪的读数**：① 删字只让几何**变小**（桌面完全不变、移动端只少一行），
**没有任何一处被顶高、没有被裁切、没有换行异常**；② `.dsrc-note` 第 1 条（`.dhist` 空态 27 字）
**没有被连坐**（`desktop dsrc-note 2→2 / ddesc 1→1`）。

### 6.2 全站读数（186 页）

| 项 | 读数 |
|---|---|
| 低于正文下限的页 | **0**（`seo.visibleText` × `pageKinds.textFloor` 逐页重算） |
| deal 最小余量 | **639**（`/deal/adcb6471a512/` = 1139 − 500）。t1 普查的 663 → 651 是「删 B 类后」的预测；t9 又删了该页 `.ddesc` 的 12 字括号 ⇒ `651 − 12 = 639`，差额可解释 |
| 6 个登记残留页 | **逐字复现登记值**：`/need/no-card/` 50 · `/category/` 123 · `/category/audio/` 123 · `/need/ai-coding/` 136 · `/category/image/` 139 · `/category/agent/` 142（**没有重新登记、没有调低下限**） |
| 横向溢出 | 抽样两视口 + 全站 1440 **全 0**；2581 处「被 `overflow-x:auto` 祖先兜住的越界元素」登记为读数、不判红（`verify-site` @390「最宽的一页 390px」互证） |
| console 错误 / 外部请求 / 404 | **0 / 0 / 0** |
| 8 类容器 DOM 元素总数 | `165 / 80 / 25 / 19 / 4 / 4 / 1 / 54` —— **逐类 == 构建期牙实测 == 独立重写的产物层 token 计数**，删前 == 删后，全部过下限 |

### 6.3 口径锚：同一把尺跨两棵树复算（**这是「Δ 可归因」的证据**）

| 锚 | 本树（删后） | 删前树 | 登记/预测值 | 判读 |
|---|---:|---:|---|---|
| `/status/` 余量 | **628** | **628** | 628（t1 census） | 两棵树逐字相同 ⇒ 计数器无偏，且本轮没碰这一页 |
| `/models/` 余量 | **2050** | 2080 | 2050（§8-5 预测：2080 − 30） | 删前树复现 2080、本树复现 2050 ⇒ §2.5 的「删 30 字」在产物上**逐字成立** |
| `/feeds/` 余量 | 3465 | **3371** | 3371（t1 census，10-08 数据态） | 删前树逐字复现 3371 ⇒ 计数器无偏；本树 +94 **全部由数据态解释**（条件型第 5 条 `.snote` 因 `feed/new.json` 15 → 0 条而渲染） |

### 6.4 抽样页的可见字数 Δ（**混合口径，逐页说明**）

| 页 | Δ | 归因 |
|---|---:|---|
| 20 个 `/deal/*` | **−12**（17 页）或 **−24**（3 页） | 恰好等于本轮的删除量（尾半句 12 字 / 尾半句+括号 24 字），**没有多余变化** |
| `/plans/` | −37 | 本轮两处删除 −34（§2.3 #23/#24）+ 数据态 −3 |
| `/plans/api/` · `/plans/coding/` | −13 · −13 | 本轮删除 −12 + 数据态 −1 |
| `/models/` | −30 | 本轮删除 −30（§2.5），**逐字吻合** |
| `/status/` | 0 | 本轮没碰它 |
| `/feeds/` | **+94** | 数据态（见 6.3），不是文案 |
| `/changes/` | +20 | 数据态（本轮没碰 `/changes/`，改动只在它消费的措辞常量上，且那些常量在本页不渲染） |
| `/` 与其余目录页 | 0 ~ −4 | 数据态（档位条数等）。`seo.visibleText()` **会剥 `<script>`/`<style>`**（`seo.js:113-121`）⇒ `index.html` 内联措辞 JSON 的改动**不计入**可见字数 |

> **不许把这张表当「全站净减」用**：本轮**可归因的可见正文净减**是 1164 字（80×12 + 17×12），
> 其余页面的 Δ 里混着数据态（10-08 → 10-09）。要「净减」读数就看 §6.1 与 §6.3 那种**同口径锚**。

---

## 7. 数据面逐字节（含 Feed）

**授权范围（§3.3 收窄后的口径）**：`deals.json` 的 17 条 `description` 是**唯一**被授权的数据面改动；
其余数据面文件必须逐字节不变。

### 7.1 一次「只有 6 行差异」的对照构建（最干净的归因）

方法（t9）：把 `deals.json` + `headless.js` 回退到 HEAD ⇒ 构建得 baseline 清单；还原改动 ⇒ 再次构建得终态清单。
**两次构建之间只有那 6 行动**，因此差异可 100% 归因于本轮改动。

| 文件 | 改前 sha256（前 16） | 改后 | 判定 |
|---|---|---|---|
| `deals.json` | `290cc082428ac82b` | 变化 | **✗ 授权改动** |
| `dist/deals.json` | `af6944addb170f5d` | 变化 | **✗ 授权改动的下游** |
| 17 个 `/deal/*/index.html` | — | 变化 | **✗ 同一处授权的下游** |
| `plans.json` · `api-plans.json` · `models.json` · `model-registry-links.json` | `1668d19c…` · `30fdf7b8…` · `c6ea1547…` · `0eb038d9…` | 同 | ✅ |
| `dist/sitemap.xml` · `dist/robots.txt` · `dist/data/index.json` | `57beecad…` · `1bbde8cd…` · `82e495f6…` | 同 | ✅ |
| `dist/deal-history.json` · `plan-history.json` · `api-plan-history.json` · `deal-plan-links.json` · `source-health.json` | `563bcfd0…` · `8c0003aa…` · `f4dc9710…` · `a22ea742…` · `b32bdb4099` | 同 | ✅ |
| `dist/_notes.ndjson`（说明清单） | `8964efe4…` | **同** | ✅ |
| `dist/feed.json` · `dist/feed.xml` · `dist/feed/**`（48 = 24 `.json` + 24 `.xml`） | — | **50/50 同** | ✅ |
| **总差异** | **19 个文件**：`deals.json` + `dist/deals.json` + **17 个 `/deal/*/index.html`**；**非 `/deal/` 的 HTML 差异 0** | | |

### 7.2 另一条独立路径（t2 的 363 条 sha256 清单）

`manifest-A/B/C.txt`（各 363 条：`dist/**` + 根 `*.json/txt/xml` + `scripts/data/**`）：
**A（改后）vs B（pristine HEAD 构建）差异 81 个文件、全部是 HTML**（80 个 `/deal/*` + `dist/index.html`），
**非 HTML 差异 0**；`dist/feed.json` `0cb7725d…` 与 `dist/feed/**` 48 个文件全同。
C（把改动还原后再构建）与 A 的清单 sha256 **完全相同**（`01a21419…`）⇒ 构建确定性成立。

### 7.3 两棵树的差集（删前 vs 删后，**不是**「数据面 0 变化」的意思）

`baseline-diff.cjs`：两棵树 **186 个文件有差异**（HTML 134 · JSON 25 · XML 26 · NDJSON 1）——
差异**不只有文案**（`asOf` 10-08 vs 10-09）。因此本轮**只对 `/deal/*` 做删前删后对照**，并逐字节证明：
把删前页里的两段被删文案抹掉、再把时间口径归一后，**80/80 页与删后页逐字节相同**。
被删片段在删前 `/deal/*` 的出现次数：尾半句 **×1 / 80 页**；括号 **×1 / 17 页**（另 63 页没有它）。

> **措辞纪律**（t5 的补充限定词）：「删前删后逐字节相同」这个说法**只对 `/deal/*` 成立，且必须带「+ 时间口径归一」**；
> 裸逐字节比对在 80/80 页都会红在时间戳行上（首个差异点就是「数据更新 2026-10-08 → 2026-10-09」）。

---

## 8. 明确**没有**做的事（如实清单）

| 项 | 状态 |
|---|---|
| `npm run gate`（全量本地门禁，52 步） | **没跑**。本轮只跑了它的**单项**与 `check:ci`（39 项 0 失败）。全链读数见 §4.3 |
| `verify-site --compare=ours-baseline`（回归比对） | **没跑** |
| publish / deploy 链、线上冒烟 | **没跑**（不在本轮范围；`npm run build` 与 deploy 同一条路径，但没走部署） |
| 数据面任何**未被授权**的改动 | **没做**（§7 逐条证明） |
| Feed 产物任何字节改动 | **没做**（50/50 逐字节相同） |
| 调低任何正文下限 / 页面族下限 | **没做**（6 个登记残留页逐字复现登记值；`main-snote ≥ 2/4` 一处未动） |
| 删除或放宽任何既有断言 | **没做**（`verify-site.js:1922/1926`、`build-local.js:5523`、题注牙等全部照旧） |
| §8-4（`/feeds/` 133 字那条 A 形状）的**改写** | **没做**。它被结构下限钉住不能删；改写成面向读者的落点说明是**更好的处置**，但本轮没做（如实登记为未办事项） |
| `.fdesc` 里 2 条 A 类形状的删除 | **没做**（Feed 字节硬约束；要删必须另开一轮并接受订阅者看到的 description 变化） |
| 对抗复核发现的修复 | 见 §9.1（t10 修复项与**仍未修**项逐条列出） |
| 历史报告 / 上一轮 census 的改写 | **没做**（`research/secondary-page-residue-v1-*`、上一轮 `_raw` 一个字未动） |

---

## 9. 已知边界（**不许把读数当射程用**）

### 9.1 对抗复核（t6）9 条发现的终态：**谁已修、谁仍是边界**

t6 的定位是「找出这套判据证不了什么」，它跑了 26 次真构建、32 例射程矩阵、10 例登记表篡改、
18 次门禁注入对照。**它的全部正向变异都被如期判红**（32/32 符合预期），9 条发现是**射程**不是崩溃。
逐条的终态（t10 修复项的依据是我直接读的实现与 `check:residue` 的现场读数）：

| # | 严重度 | 发现 | 终态 |
|---|---|---|---|
| F1 | **high** | **共享页脚豁免是自证的**：把被删文案写回共享页脚 ⇒ 真构建 exit 0、该句在 186 页出现 186 次、`check:residue` exit 0（取值面与作用域同源：名单取自产物自己的 SHARED 页脚元素） | **已修（t10）**：豁免机制**整段移除**，换成**正面断言** —— 页脚保留句「最终以官方页面为准。」必须 **186/186 页**都在、且 `index.html` 的 SHARED 页脚元素**不含任何登记字面**。**实测当时该豁免的受益者是 0 条**（页脚那句与登记字面不是同一串），所以「0 受益者 ⇒ 删掉机制」是安全处置。**修前（t6）**的反向对照：同一句只进每页 `<footer>` 不碰 SHARED 锚点 ⇒ 红（370 处违规）；进 SHARED 区间但在 `</footer>` 之后 ⇒ 红；页脚外 ⇒ 红；**修后**同一句写进 SHARED 页脚也红（§5.5 的 T1a / M2c） |
| F2 | medium | `<script>`/`<style>` 整段剥离 ⇒ **运行期渲染出来的文案不在射程内**（Edge 实测：脚本 `textContent` 注入与 CSS `content:` 都真的渲染出该句，扫描 0 命中；本仓产物里已有内联脚本写中文文案的先例） | **未修（射程）**：这一面**物理上要真浏览器**。当前由 t5 的**四面读数**覆盖抽样 40 路由 × 2 视口与全站 186 页（`innerText` / `textContent` / 剥脚本 HTML / **不剥**脚本整份 DOM）。写进 `residue-guard.json` 的 `_why` 与 `check:residue` 的读数行（`runtimeBoundary`） |
| F3 | medium | **等价变体旁路**：实体 / 零宽 / `<span>` 拆字 / 折行 / 全半角 / 大小写 / 繁简 / JSON `\uXXXX` 全部 GREEN，而 Edge 渲染出同一句 | **已修（t10）**：判据改成**三遍**（原样 · 归一化（剥标签 → 实体解到不动点 → 去零宽/BOM → 全角→半角 → 大小写 → **同类**标点归一 → 去空白）· 只对 `.json`/`.ndjson` 的 `\uXXXX` 解码）。**刻意不做「去掉全部标点」**：被删的「最终以厂商官方页面为准**。**」与保留的「…最终以厂商官方页面为准**；**排序与推荐理由不出售。」只差一个标点，跨类合并会把 80 张详情页判成回流。实测归一化针 **24 条**（4 条源码写法不适用归一化，单独列出） |
| F4 | low | **非 UTF-8 产物页**（UTF-16LE + BOM）扫描 0 命中而 Edge 正常渲染 | **未修（边界）**：产物写入侧全是 UTF-8；已写进判据的「已知边界」读数行 |
| F5 | medium | **反空洞只数数组长度**：清空 26/32 条的 `literal`+`visible`（条目数仍 32）⇒ exit 0、活字面 44 → 6；登记字面里有 21 对包含关系、16 条 `visible` 为空 | **已修（t10）**：加**活字面数下限 40**（建表实测 44）+ 死条目检查（`deadLiteralEntries`，基线 0）。21 对包含关系与 16 条空 `visible` 经测后**登记为「不需要修」**（前者是同一句在两种上下文里的合法重叠、后者 = 可见面与 `literal` 相同），逐条写进登记表 `_why` ⑤ |
| F6 | low | **下限数值本身没有自守**：8 类 `floor` 全改成 1 ⇒ exit 0；`RESIDUE_MIN_ENTRIES` 30→3 且只留 3 条 ⇒ exit 0 | **已修（t10）**：下限**自守** —— 每条 `floor ≥ measured × floorRatio`（`floorRatio` 基线 **0.5**，硬下限 `RESIDUE_MIN_FLOOR_RATIO_HARD` 写在判据里、不写在数据里）；`.pchnote` / `.pftdesc` 的下限由 1 提到 **2**。仍如实保留一条：**两处协同**改扫描面（代码声明 + 下限表同批去掉一类）不红（F6 原读数） |
| F7 | medium | **齿②的静默损失空间**：25% 余量允许「一整族的一大部分安静消失」（`.dsrc-note` 消失 42 处仍 123/123 绿、`.ddesc` 20 处仍 60/60 绿、`.hint` 14 处仍 40/40 绿、`class="ddes&#99;"` 20 处仍绿） | **部分修（t10）**：加两条**关系式**（基准量从产物现算）—— `.ddesc ≥ 1×详情页数(80)`、`.dsrc-note ≥ 2×详情页数(80)`，把这两族的余量收成 **0**。**其余 6 类仍是阈值型下限**（与某个可现算的量不成简单比例），25% 余量**如实保留**并写进登记表 |
| F8 | low | 阈值是**数据量的静态快照**；数据面收缩时先红的是数据面（3 次收缩尝试全被 `runValidate` 的先验挡住，**没观测到误报**：连跑 10 次 0 红） | **未修（边界）**：关系式已缓解 `.ddesc`/`.dsrc-note` 两侧；其余按下限红是**一次显式、可评审的动作**（而不是静默失效），这正是本判据想要的语义 |
| F9 | low | **keep 面没有牙**：没被登记的正文被改写/删除，判据不知道（把 25 条 `.fdesc` 里 10 条改短 ⇒ build 0 / `check:residue` 0 / `selftest:feeds` 145-0） | **未修（射程）**：「删掉不许回流」是一份**清单**，不是一条规则。F9 自己给的修复方向是**形状断言**（像题注牙那样按容器形状判），**不是**往 `deletedCopy` 里塞 keep 文案（那会把「保留」与「禁止出现」两个语义混进一张表）。本轮没做 |

### 9.2 三条我从产物上实测出来的边界（t6 没提，属本报告的独立发现）

1. **`verify-site.js:215/238` 的 `.meta .hint` 断言是 `every()` 形状**：`[...querySelectorAll(".meta .hint")].every(...)`
   **空集合恒真** ⇒ 把 50 个 `.hint` 全删掉它仍然绿。**本轮没有改它**（不在本轮 scope；
   新牙的 8 类下限是**点数**，不照抄这个形状），但它是「扫描面不许收缩」这条规则**为什么必须存在**的现场例证。
2. **`.chgmeta` 的既有断言不是它的安全网**：`verify-site.js:4379/4388` 只要求 `/changes/` 的正文里有
   「变更记录自 YYYY-MM-DD 起」，而页面上另有 2 处 `.snote` 也满足它 ⇒ 删 `.chgmeta` **不会红**。
   它留下来的唯一依据是 C 类判据（时间口径）—— 这条读数如实记下来，免得下一个人以为它有牙。
3. **两处计数口径差（已订正）**：`.dsrc-note` 的**元素数**是 **165**（三份独立实现同数），
   队长预读里的 162 不成立（§3.4 #4）；`/models/` 题注末句的字数是 **30** 而不是普查预测的 29
   （后者没算 `registry` 前那个空格）。

### 9.3 文档漂移（本轮**没有**动）

1. **`docs/BUILD.md` 正文的 `--expect-checks=38` 是旧值**：`.github/workflows/verify.yml:143` 的 gate 调用行
   已是 `--expect-checks=39`（我实跑 `npm run check:ci`：**39 项 / 失败 0**，其中 `(E)` 明确打印
   「实跑项数 == `--expect-checks=39`」）。本轮**不改它**（改文档口径要连同 `verify.yml` 那行注释一起留痕，
   不属本轮 scope），只在 `docs/BUILD.md` 就地登记。
2. **`docs/SCHEMA-v1.7.md` 本轮无需改动**：它的契约面是落地页（URL / 门槛 / 索引 / 门禁），
   本轮改的措辞槽位（`.dsrc` 免责句、`.ddesc` 的来源句）**不在它的射程内**。
   措辞槽位的真实住址是 **`docs/SCHEMA-v1.3.md` §一**（本轮已同批更新，带日期与判据 id）。

### 9.4 交付面与证据政策（Tier-3）

| 项 | 读数 |
|---|---|
| 本轮**可入库**的证据文件 | `research/_raw/secondary-page-residue-v2*/` 下 **29 个**非忽略文件（19 `.json` + 8 `.md` + 2 in-tree `.gitignore`）；其中 `browser/` 的读数 JSON 合计约 **1.5 MB**（`verify-site.json` 一个就 713 KB） |
| 是否随 PR 提交 | **由队长裁定**（t5 在补充读数里点名过这件事）；本报告只给清单与体量，不给结论 |
| Tier-3（不入库） | `research/_raw/**/*.cjs`（复现脚本）· `*.log` / `*.stdout.txt`（原始输出）· 变异与对抗的 `sandbox/`、`tree/`（跑完即弃，含 `.gitignore`） |
| 已清掉的一处风险 | t2 登记过「worktree 里 13 个探针脚本写在 `.scratch/`、未被 `.gitignore` 覆盖」—— 交付前实测 **`.scratch/` 已不在树里** |
| 本轮**未提交 / 未推送** | `dist/` 在 `.gitignore` 内，不提交；分支 `secondary-page-residue-v2` 停在 `f091ac4` 之上，改动全在工作区 |

### 9.5 建议留给下一轮的事（不是本轮的未完成项，是本轮**明确不做**的）

1. `/feeds/` 133 字那条 A 形状的**改写**（不能删，改写不改条数 ⇒ 不碰下限）—— 见 §8。
2. `.fdesc` 里 2 条 A 类形状的删除（需另开一轮并接受 Feed 字节变化）。
3. keep 面的**形状断言**（F9 的方向），把「保留的文案被静默改写」也变成会红的事。
4. `npm run gate` 全量本地门禁 + `verify-site --compare=ours-baseline` 回归比对（本轮没跑）。
5. `.fdesc` / `.chgnote` / `.hint` 等 6 类下限**余量 25% 的收敛**（要么给它们也找一条可现算的关系式，要么显式接受这条余量）。

---

## 10. 复现命令

```powershell
cd .worktrees/secondary-page-residue-v2

# 0) 产物锚定（本报告全部读数的前提）
node scripts/tools/tree-digest.cjs dist            # 期望 59db0aa5aaef0ac0…（304 文件）

# 1) 主门禁链
npm run build                                      # 含两行新牙读数；exit 0
npm run check:residue                              # 独立复核入口（require 同一个 scanResidue()）
npm run test:strict                                # validate --strict（含 checkWordingContract 逐字比对）
npm run verify:seo                                 # 19 项 / 0 失败
node scripts/tools/verify-site.js --dir=dist       # 真浏览器：892 项 / 0 失败（约 156s）
npm run check:ci                                   # 39 项 / 0 失败（含新门禁步骤的三处登记）
npm run check:feeds:reproducible                   # Feed 50 文件可复现

# 2) 各页族自测
npm run selftest:audience & npm run selftest:provenance
npm run selftest:feeds & npm run selftest:planshub & npm run selftest:models
npm run selftest:plans & npm run selftest:api-plans & npm run selftest:plan-history

# 3) 变异演练（另建沙箱与源码副本树，不碰真产物）
node research/_raw/secondary-page-residue-v2/mutation/mut-product.cjs   # 产物副本面（页脚内 / 页脚外）
node research/_raw/secondary-page-residue-v2/mutation/mut-build.cjs     # 真构建面（注回被删文案 / 容器改名 / 缩登记表 / 删登记表）

# 4) 普查与逐条表（只读 dist；锚定的是**另一棵树**）
node research/_raw/secondary-page-residue-v2/scan2.cjs
node research/_raw/secondary-page-residue-v2/classify2.cjs     # 86 组全部必须被裁定，否则 exit 1
node research/_raw/secondary-page-residue-v2/verify2.cjs       # 交付自检 18 项

# 5) t9 的纯删核对与下限复核
node research/_raw/secondary-page-residue-v2-t9/verify-source.cjs   # 每行都是纯删括号
node research/_raw/secondary-page-residue-v2-t9/floor-check.cjs     # 17 页余量，最小 639

# 6) 对抗复核（沙盒根在 adversary/sandbox/，命令逐条见）
node research/_raw/secondary-page-residue-v2/adversary/…              # 见 adversary/report.md §四
```

> **口径提醒**：§4–§7 的读数锚定本工作树的 `dist`（`59db0aa5…`）；§3 里的普查与「删前」读数锚定
> 主检出的 `dist`（`141af613…`）。两次 `npm run build` 之间不要交叉引用两边的读数。

---

## 11. 证据文件与交付面

| 文件 | 内容 | 可入库 |
|---|---|---|
| `research/secondary-page-residue-v2-report.md` | **本报告** | ✅ |
| `research/secondary-page-residue-v2-census.md` | 普查（86 组逐条表 + 裁定书 + §8 七组 + 断言面 + 局限），**由 `census-lead` 交付**；原文件在主检出，本报告交付时**逐字节复制**进工作树（sha256 `e8da9b944b31b23cc33f28b58b37fbd5af5eedfbaedbce15a1cd76e5249b1c7a`，主检出那份未动） | ✅ |
| `research/_raw/secondary-page-residue-v2/census2.json` | 机器可读全量（`rulings` 86 组 + `items` 352 条 + `section8` 7 组 + `uniqueness`） | ✅ |
| `research/_raw/secondary-page-residue-v2/mutation/{README.md,mut-build.json,mut-product.json,browser-*.json}` | 变异读数（**构建路径面** + **产物副本面** + 免责句真浏览器复核） | ✅（`.md`/`.json`） |
| `research/_raw/secondary-page-residue-v2/browser/{README.md,summary.md,*.json}` | t5 真浏览器读数（40 路由 × 2 视口 + 全站 186 页 + 3 页几何对照 + `verify-site` 892 项报告） | ✅（约 1.5 MB，提交面由队长裁定） |
| `research/_raw/secondary-page-residue-v2/adversary/{report.md,report.json}` + `sandbox/*.json` | t6 对抗复核（9 条发现 + 15 条射程边界 + 我试过的清单 + 复现命令 + 原始读数） | ✅（`sandbox/` 内除 `summary.json` 外为过程产物） |
| `research/_raw/secondary-page-residue-v2-t2/README.md` · `t9/README.md` · `-captain-recon/*.md` | 文案实现 A 的产物级读数与数据面清单 · A 类改真源的逐行表与五项验收 · 队长裁定与预读 | ✅（`.cjs`/`.txt` 被 Tier-3 挡住） |
| `scripts/data/residue-guard.json` | 登记表（32 条 / 44 字面 / 8 类下限 / 2 条关系式 / 反空洞阈值 / `_measuredOn`） | ✅ 源码 |
| `scripts/tools/check-residue.js` · `scripts/tools/build-local.js`（`scanResidue()`） | 判据本体与复核入口 | ✅ 源码 |
| `.github/actions/gate/action.yml` · `scripts/tools/check-ci-consistency.js` · `package.json` | CI 接线（步骤 + 三处登记 + `check:residue` 脚本） | ✅ 源码 |
| `docs/DESIGN-RULES.md` §8.2 + N19 · `docs/SCHEMA-v1.3.md` §一 · `docs/BUILD.md` · `README.md` · `PROJECT_STATUS.md` · `NEXT-STEPS.md` §0 | 规则、措辞槽位、门禁说明与三份状态文档的同步 | ✅ 文档 |
