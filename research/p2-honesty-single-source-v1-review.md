# `p2-honesty-single-source-v1` 独立 review（t19）

> 被审对象：**PR #72**（`p2-honesty-single-source-v1`，t7 实现 / t20 修复）· 合并提交
> **`4ecfb9db2b018bf59a4102987fa5ad277762ac03`**（2026-10-08T11:55:03Z）—— 即当前 `origin/master` 头。
> 审查者：release-engineer（t19）· 工作树 `.worktrees/p2-review-v1`（从合并提交切出）·
> 对照工作树 `.worktrees/p2-prepr`（合并提交的父提交 `5570958`）· 证据：[`_raw/p2-honesty-single-source-v1-review/`](_raw/p2-honesty-single-source-v1-review/)
> **只读**：按任务声明面，本轮**不改** `scripts/`；唯一的两处写入都是一次性变形并**逐字节还原**
> （`deal-history.json` 挪走又还原、`plans-hub-page.js` 改回硬编码又 `git checkout`），两处都给了 sha256 前后比对的读数。

---

## 0. Verdict

**`pass`。**

四条验收（两条路径复现 / 不伪造日期红线 / 缺口 B 的牙 / 有没改松判据）全部**由我自己跑出来的读数**支持，
未发现需要返工的问题。报告 §6 记了三条**不构成 blocker 的观察**（其中一条会影响别人复核时的口径）。

---

## 1. 缺口 A：两条路径都自己复现（不抄报告）

装置：`.arch-v1/gapA-reproduce.cjs`（把 `scripts/data/deal-history.json` 临时挪到 `.arch-v1/`，
跑构建、抓产物、**再逐字节还原**）。读数入库 `_raw/…-review/gap-a-two-paths.json`。

### 1.1 口径先说清（否则 6/0 与 7/1 两种说法都能「自证」）

* **渲染侧**：把内联的 `const CHANGES_WORDING = {…}` 那一行排除之后的命中（那行是**静态措辞表**，两条路径都在）；
* **朴素 grep**：对全部产物文件的子串计数（含那一行）。

### 1.2 路径① 日志缺失 ⇒ 构建**成功**且措辞**真的上了线**

| 读数 | 值 |
| --- | --- |
| 构建 | **exit 0**（`✅ 产物自检通过` / `✅ 构建完成 → dist/`）—— 不再是 t4 登记的「死在 Dataset Manifest 那一步」 |
| Manifest `deal-history` | `updatedAt: null` · `updatedAtShape: null` · `availability: "unavailable"` · `count: 0` |
| `updatedAtNote` | 「本次构建没有拿到 …deal-history.json（文件缺失）——这份数据集的更新时间不可公布，这不表示「没有变化」。」（含**没有拿到**，正是判据要求的四个字） |
| 命中（渲染侧） | **6 处**：`changes/index.html:1227` · `index.html:1225` · `feed/changes.json:6` · `feed/changes.xml:6` · `feed/new.json:6` · `feed/new.xml:6` |
| 命中（朴素 grep） | **7 处** = 上面 6 处 + `index.html:1446`（内联的静态措辞表） |

**与 t7 报告的对照**：t7 报的 6 处与我的**渲染侧**逐行一致（是他们口径下的正确读数）；
他们的「正常 ⇒ 0 处」也是**渲染侧**口径（朴素 grep 会是 1）。两种口径我都记下来，见 §6-O3。

### 1.3 路径② 日志正常（正对照）⇒ 措辞**不出现**（渲染侧）

| 读数 | 值 |
| --- | --- |
| 构建 | exit 0 |
| Manifest `deal-history` | `updatedAt: **2026-09-30**` · `updatedAtShape: date` · `count: 19` —— **等于日志自己的 `startedAt`**，且 **≠ 今天（2026-10-08）** |
| 命中（渲染侧） | **0 处** |
| 命中（朴素 grep） | 1 处（`index.html:1446` 的静态措辞表） |
| 还原 | `deal-history.json` sha256 前后**相同**（`563bcfd0…`）· `git status --porcelain -- scripts/` 为空 |

⇒ 缺口 A 的两条路径**都复现了**：既不是「构建还是死」，也不是「措辞只在缺失时才被写进静态表」。

---

## 2. 「不伪造日期」红线：读代码 + **正向喂值**两条路各查一遍

### 2.1 代码位置与理由（我实际读过的行）

| 位置 | 作用 | 为什么它挡住伪造 |
| --- | --- | --- |
| `scripts/lib/changes.js:592-603` `markUnavailableLogDatasets()` | 源不可用时**把值清成 null**：`entry.updatedAt = null; entry.updatedAtShape = null; entry.availability='unavailable'` | 它是**唯一**写 unavailable 的地方；不论调用前值是什么，登记后一定是 null |
| `scripts/lib/changes.js:611-637` `logDatasetHonestyProblems()` | 源侧判据：不可用 ⇒ `updatedAt !== null` 报「**不许用别的日期顶上**」（626-628）；`updatedAtShape !== null` 报红（629-631）；必须带含「没有拿到」的说明（632-634）；**反向**也守：源可用 ⇒ `updatedAt === null` 报「不许留空」（620-623） | 两个方向都堵：既不许拿日期顶，也不许该有值时留空 |
| `scripts/lib/changes.js:666-694` `logDatasetDiskHonestyProblems()` | 盘侧判据：登记不可用、盘上文件却带时间 ⇒ 报「登记与产物不一致」（682-684）；盘上取不到时间、Manifest 却填了值 ⇒ 报「必须登记为 availability: unavailable（如实登记，不许用别的日期顶上）」（688-691） | 把「源 ⇒ Manifest ⇒ 盘」三段钉成一条不变量；**不依赖任何 id 清单**，所以扩数据集不会绕过 |
| `scripts/lib/data-docs.js:…` `timeShapeOf()` | `null/undefined/空串` ⇒ 返回 **null**（不是 `'date'`、更不是今天） | 「没有值就没有形状」在形状侧也成立 |
| `scripts/tools/build-local.js:4233-4241` | **写盘之前**先 `markUnavailableLogDatasets()`，然后 `assertManifestShape()` 的抱怨**只放过** `toleratedLogComplaints()` 从登记本身逐字生成的两条，再叠 `logDatasetHonestyProblems()` | 「忘了登记 ⇒ 抱怨照旧 ⇒ 红」：失败方向是红，不是绿 |
| `scripts/tools/build-local.js:4282-4286` | 数据文档页的 `assertPageHonesty()` 同样只用那两个逐字生成的抱怨过滤 | 页面侧也只在「已如实登记」时放过 |

**没有找到任何把「现在」写进 manifest 的路径**：grep `updatedAt` 附近的 `new Date()` / `Date.now()`
只命中 `scripts/lib/dom-digest.js`（取证工具）、`scripts/lib/store.js`（采集写盘时 updatedAt = 采集时刻，
是**数据自己的时间**，且带 `preserveUpdatedAt`）、`scripts/lib/zh.js` 与其自测 —— **都不在 Manifest 这条链上**。

### 2.2 正向验证：把「伪造的形状」真的喂给判据（7 个用例全过）

装置 `.arch-v1/probe-date-redline.cjs`（读代码说「它应该会红」不算，这里是真的喂值）：

| 用例 | 期望 | 实测 |
| --- | --- | --- |
| 登记函数拿到 `updatedAt: 今天` + `shape: date` | 清成 null/null/unavailable | ✓ 清成 `null / null / unavailable` |
| 不可用 + `updatedAt = 2026-10-08` | 报「不许用别的日期顶上」 | ✓ `deal-history: 源日志不可用时 updatedAt 必须是 null（不许用别的日期顶上，实得 2026-10-08）` |
| 不可用 + `updatedAtShape = date` | 报红 | ✓ `…updatedAtShape 必须是 null（实得 date）` |
| 不可用 + `null/null` + 说明（正对照） | 不报 | ✓ `[]` |
| 登记不可用、盘上文件带 `2026-09-30` | 报「登记与产物不一致」 | ✓ |
| 盘上取不到时间、Manifest 却填 `2026-09-30` | 报「必须登记为 unavailable」 | ✓ |
| 源可用 + `updatedAt` 留空 | 反方向报红 | ✓ 两条（不许登记 unavailable / updatedAt 不许留空） |

⇒ 红线**不只是写在注释里**：值真的被喂进去时，判据会响；且响的方向与「不许编造」一致。

---

## 3. 缺口 B 的牙：改回硬编码 ⇒ 红；逐字节还原 ⇒ 绿

| 步骤 | 读数 |
| --- | --- |
| 现场 | `scripts/lib/plans-hub-page.js:257` 用 `${escapeHtml(changes.CHANGES_WORDING.CHANGES_LABELS.all)} →`（唯一出现 1 次） |
| 变形（读措辞表 → 硬编码 `全部变化 →`） | sha256 `390bc44d…` → `9fc2ed57…` |
| 跑 `npm run selftest:seo` | **86 项通过 / 2 项失败**（exit 1）：① `scripts/lib/ 里没有把入口文案手写成字面量（52 个文件扫描）—— **plans-hub-page.js** —— 请改成从 changes.CHANGES_WORDING 取词`；② `【牙】/plans/ 入口锚随 changes.js 的措辞表变…原词「全部变化 →」· 换表后「全部变化 →」· 复位后「全部变化 →」`（换表不改渲染 ⇒ 这条牙点破了「写死」） |
| 逐字节还原 | `git checkout --` → sha256 回到 `390bc44d…`（**True**）· `git status --porcelain -- scripts/` 为空 |
| 复跑 `npm run selftest:seo` | **88 项通过 / 0 项失败**（exit 0） |

⇒ 与 t7 报的「86/2 红、点名 plans-hub-page.js → 还原 → 88/0」**逐项一致**，且我额外确认了还原是**逐字节**的。

---

## 4. 有没有「顺手改松判据」：没有，而且是**变严**

### 4.1 断言数（同一命令在父提交与合并提交各跑一遍）

| 命令 | 合并前 `5570958` | 合并后 `4ecfb9db` | Δ | 失败 |
| --- | --- | --- | --- | --- |
| `npm run selftest:seo` | **87** | **88** | **+1** | 0 / 0 |
| `npm run verify:seo` | **17** | **18** | **+1** | 0 / 0 |
| `npm run selftest:plans` | **264** | **264** | 0 | 0 / 0 |
| `node scripts/tools/check-ci-consistency.js --expect-checks=39` | **39** | **39** | 0 | 0 / 0 |
| `node scripts/tools/verify-site.js --dir=dist` | 见证据（pre 侧同法复跑） | **880** | ≥0 | 0 |

（pre 侧的 `selftest:plans` 实测 **264**，与 t7 报告写的「263→264」不同：父提交已经是 264。
 这不是判据变松，而是那句「+1」的来源需要更正 —— 记在 §6-O2。）

### 4.2 diff 级检查：那些「被删掉的行」去哪了

`git diff 4ecfb9db~1 4ecfb9db -- scripts/` 的表面读数：5 个文件 +351/−36，其中 `build-local.js` 删了 25 行，
**含 5 条 `changes/` 断言**（分栏标题 / 其他变化块 / soonBasis / 免责句 / endingSoon 空态）。
逐条追下去，它们**没有被删**：

* 这 5 条现在在 `build-local.js:5639-5653`，被放进 **`else`（日志可用）分支**；
  新增的是 `if`（日志不可用）分支里的**更严**断言（5620-5637）：
  「不可用时没有明说『没有拿到历史日志』」与「**不可用时仍渲染了优惠雷达分栏 ⇒ 会把「没有拿到日志」
  伪装成「没有变化」**」——这两条在 T4 那版**根本不存在**（那时这个分支够不着）。
* `assertPageHonesty` 的抛错块（删除 3 行）在 `4282-4286` 变成「先 `.filter()` 掉两条**从登记逐字生成**的
  形状抱怨再抛」——放过面被 `toleratedLogComplaints()` 钉死在两条字符串上，不是通配。
* 三条 `console.warn`（日志不可用的提示）被 `build-local.js:3190` 的新提示替代（含「**如实空账本**」）。
* `seo-selftest.js` 的「入口文案登记制」断言被**升级**：原来是「手写位置 == 登记的那一处
  （`plans-hub-page.js`）」，现在是 **零容忍**的代码形状判据（`scripts/lib/` 里任何
  「指向 /changes/ 的锚 + 手写文字 + 箭头」都算第二处定义）+ **一条新的牙**（把措辞表里的词换掉 ⇒
  渲染必须跟着变）。净效果 **+1 条断言、且更严**。

⇒ **没有发现任何被放松的阈值或删除的断言**；方向上只有「新增 / 收紧 / 换更好形态」。

---

## 5. 我没能验证的东西

1. **CI 侧的真实运行**：我只在本地跑（`selftest:seo` / `verify-site` / `check:ci` / `verify:seo` / `selftest:plans`）。
   PR #72 的 CI 绿是 t7/t20 报的读数，**我没有独立复跑 GitHub Actions**（无权限触发那种级别的复核）。
2. **`npm run gate`（47 脚本全链）**：本轮没有跑全链（耗时 ~5 分钟且不在本任务 Verify 列表里），
   所以「除上面五条命令以外的脚本有没有被影响」我**没有**实测。
3. **`_notes.ndjson` 与缺口 A 的交叉**：缺失日志时清单是否按纪律变化，本轮没查（不在本任务射程）。
4. **「不可用」形态下的产物逐字节可复现性**：我没有在同一台机器上跑两次缺失日志构建做逐字节比较
   （见 §6-O1：那个形态的 note 里带本机绝对路径，跨机器必然不同）。
5. **其它日志（`plan-history` / `api-plan-history`）的两条路径**：只对 `deal-history` 做了端到端复现；
   另两份走的是同一段代码与同一条判据（`logAvailabilityOf` 三份一起喂），但我没有逐份跑缺失路径。
6. **`seo-verify.js` §③⁗ 覆盖面 3 → 9 的「9 份」**：我确认了断言数 17 → 18 与代码遍历 Manifest 全部数据集，
   **没有**逐份篡改 9 份数据集去验证每份都能被咬中。

---

## 6. 不构成 blocker 的三条观察（供收口/下一轮）

### O1（建议下一轮修，非 blocker）：不可用说明里嵌入了**本机绝对路径**
路径① 的 `updatedAtNote` 实测是
「本次构建没有拿到 `D:\OneDrive\Desktop\Code\AI Page\.worktrees\p2-review-v1\scripts\data\deal-history.json`（文件缺失）……」
—— 那段路径来自加载器的 `broken` 文案。后果：**该形态的产物带机器相关字符串**
（跨机器不可逐字节复现、发布出去会暴露本机目录结构）。
不是红线问题（方向是「更诚实」而不是「编造」），也不影响正常路径；建议 note 只用 `basename` 或把 reason 归一化。
报告 §2.1 的判据只要求 note 含「没有拿到」，所以改这里不会碰判据。

### O2（报告口径更正）：`selftest:plans` 的「263→264」
父提交 `5570958` 实测已经是 **264/0**，合并后仍是 264/0 ⇒ 这句「+1」在本 PR 上**不成立**
（真正的 +1 在 `selftest:seo` 87→88 与 `verify:seo` 17→18）。不改变结论，只是别把增量记错账。

### O3（复核口径）：那句措辞的命中数是 **6（渲染）/ 7（朴素 grep）**，正常路径是 **0 / 1**
`index.html:1446` 是内联的静态措辞表（`const CHANGES_WORDING = {…}`），两条路径都在。
t7 报的 6/0 是**渲染侧**口径（正确）；下一轮若有人用朴素 grep 复核会拿到 7/1，
建议在报告里直接写明口径，免得再对一次账。

---

## 7. 复跑命令（全部只读 / 变形可逐字节还原）

```powershell
git worktree add .worktrees/p2-review-v1 4ecfb9db          # 被审的合并提交
npm ci
node .arch-v1/gapA-reproduce.cjs                            # 缺口 A 两条路径（含日志挪走/还原的 sha256 比对）
node .arch-v1/probe-date-redline.cjs                        # 不伪造日期红线：7 个正向用例
npm run selftest:seo                                        # 88/0
node scripts/tools/verify-site.js --dir=dist                # 880/0（先 npm run build）
node scripts/tools/check-ci-consistency.js --expect-checks=39   # 39/0
# 缺口 B 的牙：把 plans-hub-page.js:257 的 ${escapeHtml(changes.CHANGES_WORDING.CHANGES_LABELS.all)} 换成字面量
#   ⇒ selftest:seo 86/2（点名 plans-hub-page.js）· git checkout -- 还原 ⇒ 88/0
```
