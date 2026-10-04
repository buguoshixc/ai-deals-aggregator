# t42 · 写死计数期望的全仓清扫（只读）：契约冻结 vs 数据依赖

- 任务：t42 —— 把「门禁把期望钉在历史快照上、数据一长就把门禁顶红」这一类风险做一次全仓清扫，产出可执行清单。
- 边界：**只读**。本任务没有改任何生产文件；产物只有 `research/_raw/t42/scan.cjs`（可复跑扫描）与本文。
- 扫描：`node research/_raw/t42/scan.cjs`（人类可读）· `node research/_raw/t42/scan.cjs --json`（机器可读，稳定排序）。
- 扫描面：`scripts/tools/*.js` · `scripts/lib/*.js` · `scripts/collectors/*.js` · `.github/workflows/verify.yml` ·
  `.github/actions/gate/action.yml` · `package.json`（142 个文件）。
- 结果（同一棵树跑两次逐字节一致，见本文 §7）：**命中 133 条** —— `数据依赖 65` · `无风险 58` · `契约冻结 2` · `未判定 8`。
  （`数据依赖` 按规则细分：`dataset-count` 38 · `array-length` 18 · `text-count` 9。）

扫描的**形态**（正则写在 `scan.cjs` 里，可复核）：① `.length` 与数字比较；② `=== N` / `!== N` 数字等值比较；
③ `startsWith('4')` 这类**拿数字前缀当结构**；④ 正则里的计数文本 `\d+ 条/项/行/个/家`；⑤ 外部传入的
`--expect-checks=N`。已排除的噪声（同样写在 scan.cjs 里）：解析守卫（`cells.length < 3`）、空集合哨兵
（`length === 0`、`length > 0`）、`console.log` 打印行、注释行。

---

## 1. 已知的两条实证（不是巧合，是同一失败形态）

| # | 位置 | 写法 | 触发条件 | 现状 | 为什么它必然复发 |
| --- | --- | --- | --- | --- | --- |
| 实证① | `scripts/tools/verify-site.js`（t31 之前） | 用 `/0 条/` **子串**匹配判断「这一行是不是 0 条」 | **条目数变成 10 的倍数**（`10 条` / `80 条` / `100 条` 都命中 `0 条`） | **已由 t31 修复**：判据抽到 `lib/feeds.js` 的 `isZeroCountRow()`（唯一出处），窗口右界改成「下一条标题的下标」，只在**数字边界**为 0 时进空态分支。现盘上 `verify-site.js:1653-1656` 留有这段说明 | 子串匹配把「任意位数里的 0」当成「值为 0」；数据每长一个数量级就多一次命中机会 |
| 实证② | `scripts/tools/vendor-page-selftest.js:259` | `skippedNoIdentity.length === 4 && ['Trae','Qoder CN','Qoder International','腾讯 CodeBuddy'].every(...)` | **新增一家 `vendorKey: null` 的 provider**（现在 9 家） | **正由 t41 修**（改派生式：对每个 null 身份逐条断言「有 skip 记录 + 无路由」） | 把「当前有几家 provider-only」写成了字面量；这是**数据规模**，不是契约 |

两条互相印证的地方：**都不是产品缺陷，都是判据写死**。实证① 的假红发生在「数据长到 10 的倍数」，
实证② 发生在「身份多一家」——**两种不同的数据增长方式，同一种失败形态**：判据里的数字来自某一天的快照，
而判据本该描述**关系**。

---

## 2. 数据依赖（65 条）：会随数据增长漂移，**属风险**

风险条目的判据：比较对象是 `providers / plans / api-plans / models / links / declarations / targets /
deals / sources / feeds / vendor 身份 / 页面条目` 这类**随采集与扩表增长**的集合或计数。
完整 66 条由 `scan.cjs --json` 逐条给出（稳定排序）；下表按**漂移触发条件**归并，列出可直接派活的代表条目。
每行的「建议写法」都是**断言关系而不是数字**。

### 2.1 与生产数据集直接相关（优先派活）

| 文件:行 | 当前值 | 随什么漂移 | 触发条件 | 建议的派生式写法 |
| --- | --- | --- | --- | --- |
| `scripts/tools/vendor-page-selftest.js:259` | `skippedNoIdentity.length === 4` + 4 个名字硬编码 | `vendorKey: null` 的 provider 数 | 新增/删除一家 provider-only | 遍历「实际 null 身份集合」，对每一条断言「有 skip 记录 ∧ 无路由」；再断言 `skip 集合 == null 身份集合`（集合相等，不写数字）。**t41 正在做** |
| `scripts/tools/feeds-selftest.js:839` | `feeds.PLAN_CHANGE_FEEDS.length === 2` | 变化流 spec 数（报表/feed 种类） | 新增一条变化流（如 API 侧已加） | `length === Object.keys(feeds.PLAN_CHANGE_FEEDS).length` 无意义；应断言「每个 spec 都有非空 changeTypes」+「注册表与页面列出条数一致（两处同源对账）」，数字由两处相除得出 |
| `scripts/tools/feeds-selftest.js:875` | `(tags.match(/rel="alternate"/g) \|\| []).length === 8` | 页面上声明的订阅源数 | 新增任何一个 feed | 断言「页面声明的 feed 集合 == 注册表里的 public feed 集合」（集合相等）；数字随注册表自动变化 |
| `scripts/tools/data-docs-selftest.js:186` | `docs.DATASET_CATEGORIES.length === 6` | dataset 类别数（数据集增加就变） | 新增一个公开数据集/类别 | 断言「每个 DATASET_CATEGORIES 成员都能在 manifest 里找到对应 dataset」+「manifest 的 category 集合 ⊆ DATASET_CATEGORIES」（包含关系） |
| `scripts/tools/history-nonempty-e2e.js:201` | `if (live.length < 3) throw ...` | `deals.json` 里 `type=deal` 的条数 | 真跑采集后条目数跌破 3（或首次基线为空） | 这不该是硬阈值：改为「若为空则**明确跳过并打印理由**」，或断言「≥ 已知的最小可比集（从数据算，如 `curated` 条数）」——**空态不要伪装成失败** |
| `scripts/tools/api-plans-selftest.js:1038` | `radar.totals.meta === 1 && radar.other.metadata.length === 1` | API 变化流里 meta 类事件数 | 记录里多一次元信息变化 | 断言「meta 类事件的 field ∈ 允许集合」且「计数 == 事件里 field 属于该集合的条数」（自洽关系） |

### 2.2 夹具内部计数（**看似数据依赖、实际不随生产数据漂移**）

扫描把它们归入 `数据依赖`（因为出现 `entries/rows/events` 等词），但复核后它们只依赖**自带的夹具**：

- `scripts/tools/archive-selftest.js:194 / 292`（`synthetic.entries.length === 2`、`withoutRecords.entries.length === 2`）
- `scripts/tools/history-selftest.js:282 / 285`（`30 次变化 → 30 条事件`、`view.events.length === 5`）
- `scripts/tools/changes-selftest.js:150 / 158`、`scripts/tools/api-plans-selftest.js:861`、
  `scripts/tools/app-token-selftest.js:94`、`scripts/tools/audience-selftest.js:433`

**处理建议**：不派修复，但值得在夹具构造处加一行注释「这里的数字是夹具规模，不是生产规模」——
避免下一轮清扫时被误判成风险（也避免有人为了「让它更健壮」去改夹具断言）。

### 2.3 与数据规模无关但被关键词误纳的（**建议降级为无风险**）

- `scripts/tools/ai-selftest.js:567`（`value.length > 40`）—— 单条**文本长度**上限，不是集合规模。
- `scripts/tools/analytics-selftest.js:226`（`cfg.allowedOrigins.length === 2`）—— 白名单**配置**条数。
- `scripts/tools/deal-plan-links-selftest.js:354 / 622`（`amount === 30.1`）—— **金额**精度比较。
- `scripts/tools/api-plans-selftest.js:1035`（`windows.recentDays === 7`）—— 时间窗口**策略常量**。
- `scripts/tools/audience-selftest.js:705 / 706`（`page.why.length === 3`）—— `NEED_PAGES` **定义**里的条数。

**这说明一件事**：靠关键词分类必然有边界噪声。**分类不是判据，扫描只是候选**——派活前必须逐条看那一行
比的是「数据」还是「代码里写死的定义」。扫描器把候选从「全仓 164 个 JS」收敛到「66 条待看」，这是它该做的。

---

## 3. 契约冻结（2 条在扫描面内命中）：**不是风险，不要建议改**

| 位置 | 值 | 为什么是契约冻结 |
| --- | --- | --- |
| `.github/workflows/verify.yml`（gate 调用行） | `--expect-checks=38` | 门禁**实跑项数**的唯一出处；加断言＝改口径，**必须留痕**（`check-ci-consistency.js` 就是它的守护者） |
| `scripts/tools/check-ci-consistency.js` | `expect-checks` / `GATE_STEP_RUN` / `FROZEN_*` | 门禁登记制本体：步骤体指纹与项数断言，**它把期望钉死正是它的职责** |

**其余属契约冻结但不在本次扫描面内的**（扫描面只覆盖 `.js` 与三个配置文件，登记面在别处，登记在此以免被
当成遗漏）：`action.yml` 的门禁步骤数与 `GATE_STEP_NAMES`/`GATE_STEP_RUN` 冻结体表、`package.json` 的
`scripts` / `selftest:*` 条数（当前 `scripts 94` / `selftest:* 25`）、自测文件登记面（`(19) 反向登记制`）。
这类数字**故意**是字面量：它们的作用就是「有人动过就当场红」。

---

## 4. 无风险（58 条）：对象不是数据规模

按 `scan.cjs` 的分类规则归并（每条都能在 `--json` 里查到 `rule`）：

| rule | 形态 | 为什么无风险 |
| --- | --- | --- |
| `empty-check` | `length === 0` / `length > 0` | 判「有没有」，与集合规模无关（数据结构变了才该红） |
| `fixture-scope` | 夹具内计数 | 夹具自带，不随生产数据增长 |
| `enum-constant` | `MODEL_ROLES` / `API_UNITS` / `CATALOG_STATUS`… 的 `.length` | 常量枚举，由代码定义 |
| `key-order` | `KEY_ORDER` / `Object.keys(...).join` | 契约形状（键序），不是计数 |
| `status-code` | `status === 200` 等 | 协议常量 |
| `index-bound` | `slice(0, 4)` / `.length - 1` | 算法边界 |
| `text-length` | `title.length > 80` | 单条字段长度上限 |
| `date-time` / `precision` | 时间量与数值精度 | 与数据规模无关 |

---

## 5. `未判定` 8 条：扫描器判不出对象，人工判完分类如下（不留白）

扫描器把「命中了数字比较、但上下文里认不出比较对象」的 8 条放进 `未判定`。逐条看过之后：

| 位置 | 值 | 人工判定 | 依据 |
| --- | --- | --- | --- |
| `scripts/tools/archive-selftest.js:319 / 352` | `mass.counts.suspect === 4` | **无风险** | 夹具（`mass.` / `forced.`）里的嫌疑条目数，夹具自带 |
| `scripts/tools/build-local.js:6546` | `pngW !== 1200 \|\| pngH !== 630` | **无风险** | 图片**尺寸**规格（1200×630），协议常量 |
| `scripts/tools/changes-selftest.js:286` | `r.totals.changed === 31` | **数据依赖（低危）** | 这条断言的是「加上限不改变总数」——它把**当天的事件总数**写成了 31；夹具或事件数一变就红。建议改成「限额前后 `totals.changed` 相等」（关系断言，不写数字） |
| `scripts/tools/plan-history-selftest.js:136 / 454 / 455` | `regularPrice 68 / 99` | **无风险** | 夹具里的**金额**，与数据规模无关 |
| `scripts/tools/verify-site.js:260` | `rendered.cols === 3` | **无风险** | 桌面版式**列数**，设计契约 |

⇒ 8 条里只有 1 条（`changes-selftest.js:286`）应并入风险清单，且是低危（仅在该自测文件内）。
**这一节本身也是结论的一部分**：`未判定` 不是第四种分类，而是「扫描器把候选交给人」的出口 —— 派活前
必须把这类看完，否则清单会带着「不知道算什么」的条目发出去。

---

## 6. 结论：这类漂移**会**在 CI 上表现成「数据长得对、门禁却红」，并且**极易被误判成产品缺陷**

**会。** 而且本轮已经发生过一次真实误判 —— 这正是实证① 的现场：

### 具体场景（实证①，可复现）
`/0 条/` 是**子串**匹配。API 价格变化流的条数从个位数长到 **10 条** 之后，页面上那一行是
`… 共 10 条 …`；`verify-site.js` 的检查窗口从标题起截 260 字符，**把这个 `10 条` 框了进来**，
于是两条变化流都被判成「空态」，门禁要求它们写「起算日」——而它们根本不是空态。
表现就是：**页面内容完全正确、数据也完全正确，门禁却红**，报的还是一句「空态缺起算日」这种
听起来像内容缺陷的话。修复方式（t31）不是改页面，而是**改判据**（抽成 `isZeroCountRow()` + 数字边界）。

### 一眼区分的办法（按可靠性排序）
1. **看错误信息有没有点名数据对象**。好的判据会说「`vendor-page-selftest`：`vendorKey=null` 的身份集合与
   skip 集合不相等（实际 9 家：… / 期望 4 家：…）」；坏判据只说「期望 4、实际 9」——**没有名字的数字**。
   本轮两条实证的错误信息都属于**坏**的那类（前者完全没提数据、后者只给数字与四个硬编码名字）。
2. **看错误信息两侧的数字来自哪里**。「实际」若来自**页面/数据**、「期望」若来自**代码里的字面量**，
   而这条数据本轮没人改过 ⇒ **优先怀疑判据**而不是数据。
3. **最快的判别动作**：把那条数据**回退到上一个数量级**（例如把条目从 10 条减到 9 条）再跑一次 ——
   门禁若变绿，则失败与数量级相关 ⇒ 判据写死的概率远大于内容缺陷。
4. **看这条判据有没有第二处同源实现**。像 `isZeroCountRow()` 那样「判据只有一个出处、且由自测用夹具钉住」
   的，出问题的概率低；同一件事在门禁里各写一份的，必然漂移不同步（本仓库反复吃这个亏）。

**给派活的一条纪律**：修这类失败时**先回答「这个数字是契约还是快照」**——是契约（门禁项数、枚举长度）
就更新并留痕；是快照（数据集规模）就**改成关系断言**，并尽量把判据抽到唯一出处。

---

## 7. 可复跑性（验收 ⑥ 的对拍）

```
node research/_raw/t42/scan.cjs        # 人类可读
node research/_raw/t42/scan.cjs --json # 机器可读（稳定排序）
```

扫描是**纯读文件 + 纯函数分类**：不联网、不读时钟、不用随机数；结果按 `(文件路径, 行号, 代码行)` 排序后输出，
`totals` 也取自排序后的计数 ⇒ 同一棵树两次运行的 stdout 逐字节相同。分类规则（`FROZEN_RULES` /
`NORISK_RULES` / `DATA_RULES`）与排除规则（解析守卫、空集合哨兵、打印行、注释行）都写死在 `scan.cjs` 里，
每条命中的 `kind` / `rule` / `why` 都在 `--json` 里可见，便于复核与反驳。
