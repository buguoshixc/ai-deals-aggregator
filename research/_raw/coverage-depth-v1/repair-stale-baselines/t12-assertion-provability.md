# t12 · 断言可证伪性对照表（队长硬要求）

> 任务：t12（repair）——把 `coverage-targets-selftest.js` 里「只在没有通配声明时才成立」的跨语义等值断言
> 换成一般成立且严格更强的关系式；并在同一次 attempt 内修掉 t7 审查抓到的 **F3（代数恒真式）** 与
> **F1（空集恒真）**。
> 本文档回答一个问题：**本次新增/改写的每一条 `every` / `filter` / `some` 形态断言，凭什么不是假牙？**
> 原始读数：本目录 `t12-selftest-stdout.txt`（自测全量 stdout，201 项通过 / 0 项失败）、
> `t12-mutation-evidence.txt`（上面那份里所有 t12 / v3③ 相关行）。

## 0. 三条"假牙"的形态与本表的判据

一条断言是假牙，当且仅当**存在不了任何输入能让它红**。本次实际抓到三种形态：

| 形态 | 长什么样 | 为什么恒绿 | 本表的处理 |
| --- | --- | --- | --- |
| **代数恒真** | `X === Y + (X - Y)` | 右边恒等于 X，与数据无关 | 换成两个**各有独立来源**的数（④ 现读文件、⑤ 逐格复算） |
| **空集恒真** | `list.filter(cond).every(pred)`，而 `list` 当前为空 | `every` 在 `[]` 上返回 `true` | 先钉住"集合大小 == 另一个计数"，再用扰动输入证明可红 |
| **同源自证** | 拿载荷里的数当"期望值"，再去比载荷里的数 | 两边同源 ⇒ 永远相等 | 期望值一律来自**另一个来源**（文件 / api-plans 逐格复算） |

## 1. 逐条对照表

| # | 断言（检查名，原文） | 形态 | 空集 / 恒真风险 | 扰动输入（构造非法 ⇒ 必红） | 现场输出（命中信息，摘自 `t12-mutation-evidence.txt`） |
| --- | --- | --- | --- | --- | --- |
| 1 | `t12：每条 API 侧声明行都能按 (apiPlanId, modelKey, variant) 逐字对回 api-plans 记录（通配行必须展开到 ≥1 条真实变体）` | `rows.forEach` + 内层 `models.filter` / `models.some`；判据 = `problems.length === 0` | rows 为空集时该条为真 —— 但**行数本身被 #3 的 ④ 钉在"现读文件数出来的行数"上**，所以"空集"不是一个可自由选择的输入 | 两条 ghost 夹具：<br>a) 通配声明指向**不存在的 modelKey**<br>b) 指向**存在但记录自己没有任何真实变体**的 modelKey | a) `declaredApiEntryRows[0] fixture-plan-1/ghost-model-000/null: modelKey「ghost-model-000」不在记录 fixture-plan-1 里 —— 这条声明对不上任何计价条目`<br>b) `…: 通配声明在记录 fixture-plan-2 里一条真实变体都没匹配到 —— 它什么都没声明（不许用通配兜底一条对不上的声明）` |
| 2 | `t12：【定向夹具·通配】variant:null 通配声明 1 行展开成 2 条计价条目 ⇒ 展开数**严格大于**声明行数（不是等于）` | `identities.every(...)` | 非空由**同一条检查里的** `identities.length === 2` 先钉住（`every` 只在长度已证为 2 时被求值） | 把夹具 api-plans 的 `alpha-1` 少写一个变体 ⇒ `identities.length` 先红；把声明的 `variant` 写死 ⇒ `expanded === false` 红；把 modelKey 写错 ⇒ `unresolved === true` 红 | ✓（现场读数）`rows=1 / 展开数=2 / expanded=true`；同一判据在 ghost 夹具上 ⇒ `unresolved=true`、`identities=0`、**② 必红** |
| 3 | `t12：【不许同源自证】声明行数必须与**现读文件**数出来的 API 侧声明行数相等，且展开增量必须等于逐格复算出的通配多余覆盖`（**F3 替换**，原为 `X === Y + (X - Y)`） | `===`（无 every）；两个期望值分别来自 ④ 现读 `scripts/data/model-registry-gaps.json`、⑤ `wildcardSurplusOf()` 对 api-plans 的逐格复算 | **原式的风险是代数恒真**：右边恒等于左边，任何数据都红不了 | 变异⑤：只把"现读文件行数"扰动 +1（载荷不动）<br>变异⑥：只把"逐格复算的通配多余覆盖"扰动 +1（载荷不动） | ⑤ `④ 载荷里的声明行数 16 ≠ 现读文件里的 API 侧声明行数 17 —— 载荷与盘上文件必须逐字对上（两边各数一遍，不是同一个数抄两处）`<br>⑥ `⑤ 展开数超出行数的部分 0 ≠ 逐格复算出来的通配多余覆盖 1 —— 展开的增量只能来自 variant:null 行…别处冒出来的增量必红` |
| 4 | `t12：【方向牙·通配】通配声明（指向不存在的 modelKey / 存在但无真实变体）⇒ … 同一支判据**必红**` ×2 | `problems.some(text => text.includes(needle))` | `.some` 在空集上返回 **false** ⇒ 检查**失败**，不是恒绿（方向天然正确） | 夹具本身即扰动；另可用"去掉 ② 判据"的代码变异让它红 | 命中 `展开后的计价条目数`（② 那一句） |
| 5 | `t12：【方向牙·通配】同一份声明也被**逐行回查**抓住：…` ×2 | `rowProblems.some(...)` | 同上 | 同上 | 命中 `不在记录` / `一条真实变体都没匹配到` |
| 6 | `【反证牙·t12】变异①-a ～ ⑥ ⇒ 新判据必红` ×6 | `problems.length > 0 && Boolean(problems.find(text => text.includes(needle)))` | `.find` 在空集上返回 `undefined` ⇒ `Boolean` false ⇒ **检查失败**（不可能恒绿） | 六种变异：① count ± 1、② 留档换成非数组、③ B = 行数 − 1、④ 方程 C + 1、⑤ 文件行数 + 1、⑥ 复算增量 + 1 | 见 §2 逐条现场读数 |
| 7 | `【反证牙·t12】旧判据漏抓 / 假红 / B 与行数脱钩` ×3 | `length > 0` 与 `length === 0` 的组合判据 | 无（两条判据都必须各自给出期望的极性） | 合成载荷：两种视图脱钩（B == count 仍成立）；合法通配态（B=2 > 行数=1）；B < 行数且方程闭合 | `旧判据绿 / 新判据红：① 声明行的两种视图不等：…length=15 ≠ …count=16`<br>`旧判据红 / 新判据绿：旧：旧断言：展开后的计价条目数 ≠ 声明行数 ⇒ 新：绿` |
| 8 | `v3③：MISSING 行的盘上记录必须是 0（…）`（**F1 重写**，检查名保持原样） | `filter` + 共用纯函数 `missingRowsProblems()`（内部 `filter`） | **原来是空集恒真**：本轮 MISSING 已收口到 0，`filter` 出空集、`every` 返回 true ⇒ 永远绿。现在额外钉住"集合大小 == `states.MISSING` 计数" | 三种扰动：合成单格 `present=1`；空集 vs `states.MISSING=1`；真实载荷（或合成行）把一格 MISSING 的 `present` 改成 1 | `有 1 格 MISSING 却在盘上有记录（present ≠ 0）：(合成)/deals=1`<br>`MISSING 行集合大小 0 ≠ states.MISSING 计数 1 —— 两处读数必须一致（空集也要对上 0，不许靠"没有行"蒙过去）` |
| 9 | `v3③【可证伪性·t7-F1】同一支判据在三种扰动输入下**必红**` | `teeth.every(t => t.problems.length > 0)` | 非空由**硬编码的 3 元素数组**保证（不是从载荷 filter 出来的） | 同上三种扰动 | 同上（与 #8 的现场输出同源：同一支 `missingRowsProblems()`） |

**未被本表覆盖的**：本次没有改动其它带 `every` / `filter` / `some` 的既有断言（`t46` 五态普查三条、
`candidates.rows` 三条、`v3①~v3④` 各条）—— 它们的输入本轮非空且已有各自的反证牙（`--published-models` /
`--source-rulings` 夹具），保持原样。

## 2. t12 反证牙现场输出（逐条变异 ⇒ 新判据必红 / 旧判据当时的表现）

```
· 变异①-a：声明行数与展开数不一致（count = 行数 − 1） ⇒ 新判据红 / 旧判据红：① 声明行的两种视图不等：registry.declaredApiEntryRows.length=16 ≠ gaps.declaredApiEntryCount=15
· 变异①-b：声明行数与展开数不一致（count = 行数 + 1） ⇒ 新判据红 / 旧判据红：① 声明行的两种视图不等：registry.declaredApiEntryRows.length=16 ≠ gaps.declaredApiEntryCount=17
· 变异②：声明计数与数组长度脱钩（逐条留档被换成非数组） ⇒ 新判据红 / 旧判据红：逐条留档 declaredApiEntryRows 必须是数组（声明行没有出口 ⇒ 下面的两条关系无从核对）
· 变异③：B 与行数脱钩（B = 行数 − 1，方程仍闭合） ⇒ 新判据红 / 旧判据红：② 展开后的计价条目数 15 < 声明行数 16 —— 展开只会让条目数不少于行数（variant:null 一行展开多条）；小于说明有声明行一条 identity 都没覆盖到位（或两个视图本来就是不同的量）
· 变异④：方程不闭合（C 多算一条） ⇒ 新判据红 / 旧判据红：③ API 侧记账不闭合：A 92 + B 16 + C 1 = 109 ≠ 计价条目 108
· 变异⑤：现读文件与载荷的行数对不上（文件多一行） ⇒ 新判据红 / 旧判据绿：④ 载荷里的声明行数 16 ≠ 现读文件里的 API 侧声明行数 17 —— 载荷与盘上文件必须逐字对上（两边各数一遍，不是同一个数抄两处）
· 变异⑥：展开增量对不上逐格复算的通配多余覆盖（增量多 1） ⇒ 新判据红 / 旧判据绿：⑤ 展开数超出行数的部分 0 ≠ 逐格复算出来的通配多余覆盖 1 —— 展开的增量只能来自 variant:null 行（每行贡献"该 modelKey 真实变体数 − 1"），别处冒出来的增量必红
· 旧判据漏抓的一例：两种视图脱钩（B == count 仍成立） ⇒ 新判据红 / 旧判据绿：① 声明行的两种视图不等：registry.declaredApiEntryRows.length=15 ≠ gaps.declaredApiEntryCount=16
· 旧判据假红的一例（T6-F1 本体）：合法通配态 B(2) > 行数(1) 且方程闭合 ⇒ 新判据绿 / 旧判据红：旧：旧断言：展开后的计价条目数 ≠ 声明行数 ⇒ 新：绿
```

**读法**：⑤⑥ 两行是本次修复**新增保护力**的直接证据 —— 旧断言在这两种变异下**全绿**（它根本没有
"另一个来源"的数可比），新判据必红。

## 3. 覆盖强度小结（回答验收第 6 条）

| 关系 | 旧断言（`B === count` + 方程 + 数组） | 新判据（① ② ③ ④ ⑤ + 逐行回查） |
| --- | --- | --- |
| 声明行两种视图脱钩（B == count 仍成立） | ❌ 漏抓（绿） | ✅ ① 红 |
| 合法通配态 B > 行数（T6-F1 本体） | ❌ **假红** | ✅ 绿（正确） |
| B 与行数脱钩（B < 行数） | ✅ 红 | ✅ ② 红（未放松） |
| 方程不闭合 | ✅ 红 | ✅ ③ 红（原样保留） |
| 载荷与盘上文件行数不一致 | ❌ 漏抓 | ✅ ④ 红 |
| 展开增量对不上逐格复算 | ❌ 漏抓 | ✅ ⑤ 红 |
| 声明指向不存在的 apiPlanId / modelKey / variant | 部分（只在计数变化时） | ✅ 逐行回查逐条点名 |
| 声明数组乱序 | ✅（`validateGaps`，报告层现场反证保留） | ✅ 同左 + 报告层现场反证 |

**结论**：新判据**严格覆盖**旧判据（旧断言能红的 4 类，新判据全红且逐类点了名），并且多抓 3 类
（① 视图脱钩、④ 文件↔载荷、⑤ 增量复算），同时修掉旧断言对合法通配态的假红。

## 4. 复跑

```powershell
node scripts/tools/coverage-targets-selftest.js                                   # 201 项通过 / 0 项失败
node research/_raw/coverage-depth-v1/repair-t25-clause2/probe-t12-repair.cjs      # 重新生成本目录的两份读数
```

检查名增删对照（改前 = t6 收口时的 178/0 读数）：**178 → 201（净增 23），被删除或改名的既有检查名 0 个**。

---

## 5. `models-selftest.js`（契约第 4/5 条：三处写死计数 → 结构不变量）

改前读数：**141 项通过 / 3 项失败**（`models-selftest-before.txt`）；改后：**148 项通过 / 0 项失败**。
被修掉的三条正是"断言编码了数据快照"（`total === 44`、两处 `=== 12`）—— 本轮 registry 从 44 长到 51、
API 声明从 12 长到 16，它们就永远假红。

| # | 断言（新） | 形态 | 空集 / 恒真 / 同源自证风险 | 扰动输入 | 现场输出（命中信息） |
| --- | --- | --- | --- | --- | --- |
| 10 | `汇总：每个身份都有结局（total == 现读 models.json 身份数 == 发布条目数；active + retired + unknown == total），且 retired 仍为 0` | 纯谓词 `summaryProblems()`，判据 = `problems.length === 0` | 同源自证风险由**两个独立分母**消掉：① 现读文件（再 `reg.load()` 一次）、② 发布条目数；③ 是闭合式（三态之和 == total），④ 是硬条件 | 四组合成输入（见 #11 的对照表） | 见下（#11 行的四条现场读数） |
| 11 | `【保护强度对照·t12】汇总判据：旧会红/新仍红（翻成 retired、被漏掉）与 旧假红/新正确（合法增长）各就各位，且新多抓一类` | `teeth.every(...)` over **硬编码 4 元素数组** | 非空由构造保证 | ① 合法增长（文件 51 / total 51 / 三态闭合）② 有身份被翻成 retired ③ 有身份被发布管线漏掉 ④ 发布管线漏掉一条（文件 44、汇总 44、发布 43） | `合法增长 ⇒ 旧断言红 / 新判据绿`（§47 假红已修）<br>`翻成 retired ⇒ 旧断言红 / 新判据红`（保护保留）<br>`被漏掉 ⇒ 旧断言红 / 新判据红`（保护保留）<br>`旧抓不住、新抓住：发布管线漏掉一条 ⇒ 旧断言绿 / 新判据红`（新增强） |
| 12 | `真实数据：API 侧声明 N 条 == 现读 gaps 文件的 N 条，且每条都逐字对得回真实 api-plans 记录（reason / sourceUrl / modelKey / variant）` | 纯谓词 `apiDeclarationProblems()`（内部 `forEach` + `filter` + `some`），判据 = 计数相等 **且** `problems.length === 0` | 分母 = **现读** `scripts/data/model-registry-gaps.json`（不是启动时的内存副本，也不是字面量） | 四种扰动（见 #14） | 见下（#14 行的四条现场读数） |
| 13 | `【唯一性牙·t12】同一个 (apiPlanId, modelKey, variant) 不许在处置登记表里重复出现` | 纯谓词 `duplicateApiDeclarationKeys()`，判据 = 重复键列表为空 | 重复声明**不会让任何计数变小**（两条行、两条 identity），旧的 `=== 12` 也照样绿 —— 这一格空白只能靠唯一性钉住 | 同一三元组重复两次 | 见下（#15 行） |
| 14 | `【可证伪性·t12】API 侧声明判据在四种扰动输入下**必红**` | `teeth.every(t => t.problems.length > 0)` over 硬编码 4 元素数组 | 非空由构造保证 | reason 改错 / sourceUrl 换家 / variant 编造 / apiPlanId 不存在 | `→ apiDeclarations[0] …/standard: reason 必须是 off-registry-model（实得 "pool"）`<br>`→ …: sourceUrl 不是该记录自己的官方页（实得 https://example.invalid/other）`<br>`→ …/no-such-variant: variant 不是该 modelKey 的真实变体（实得 ["standard"]）`<br>`→ apiDeclarations[0] ffffffffffff/x/null: apiPlanId 不在 api-plans.json 里` |
| 15 | `【可证伪性·t12】唯一性牙在同一 (apiPlanId, modelKey, variant) 出现两次时**必红**` | 双向断言：重复输入必须非空 **且** 不同 variant 的输入必须为空 | 两条方向都钉住（只测"必红"会把"永远红"也放过去） | 同一三元组 ×2 / 同 modelKey 不同 variant ×2 | `["p/m/standard"]`（重复那组）；不同 variant 那组返回 `[]` |
| 16 | `【API 处置】coverageOf：declaredApiEntries 逐条留档（N 条 · 带 provider）+ 行数 == 现读文件行数 + 展开数 == 逐条展开去重 + unmappedModelKeys 归零 + 三者和 == 总条目` | 计数对账（行数 vs 现读文件、展开数 vs `sourcePricingIdentitiesOf` 逐条去重复算）+ `declaredApiEntries.every(...)` | `every` 在空表上会恒真 —— 所以同一格里先用**两个独立计数**（现读文件行数、逐条展开去重数）把它钉住；空表只有在文件本身为空时才可能成立，那时 `validateLinks` 的"每条计价条目都要有结局"接管 | 计数扰动（本 attempt 的 t25 侧变异①-a/①-b/③ 走的是同一类对账） | 真实读数：`{"declared":16,"freshFileRows":16,"identities":16,"expandedRecomputed":16,"unmapped":0,"mapped":92,"items":108}` |

### 5.1 检查名变更（4 条，全部是"名字里带数据快照"的那几条）

契约第 6 条要求"既有检查名一个不改"，而契约第 4 条同时要求"**不许**再出现 44 这类字面量"——
四条被改的检查名里正好都写着 `44 个模型` / `12 条`。两条要求在这四条上直接冲突，取舍如下：
**删掉字面量、保留检查本身**（一条都没删，全部变强），并在这里把 old → new 逐条列清，不藏改名：

| old（含快照字面量） | new |
| --- | --- |
| `汇总：44 个模型全部 active、0 retired（退役只由人工依据驱动）` | `汇总：每个身份都有结局（total == 现读 models.json 身份数 == 发布条目数；active + retired + unknown == total），且 retired 仍为 0（退役只由人工依据驱动）` |
| `真实数据：API 侧声明 16 条，reason 全部是 off-registry-model、sourceUrl 全部取自该记录自己的官方页` | `真实数据：API 侧声明 16 条 == 现读 gaps 文件的 16 条，且每条都逐字对得回真实 api-plans 记录（reason / sourceUrl / modelKey / variant）`（条数是插值的） |
| `【API 处置】coverageOf：declaredApiEntries 逐条留档（12 条 · 带 provider）+ …` | `【API 处置】coverageOf：declaredApiEntries 逐条留档（16 条 · 带 provider）+ 行数 == 现读文件行数 + 展开数 == 逐条展开去重 + …`（条数是插值的） |
| `【API 处置·对照】真实数据里 12 条声明在折叠索引下 0 命中（7 条能对上的已经去写了映射）` | `【API 处置·对照】真实数据里 16 条声明在折叠索引下 0 命中（能对上的已经去写了映射）`（条数是插值的；顺带去掉同样会过期的 `7 条`） |

对照读数：`models-selftest.js` **144 → 148（净增 4）**，被删除或改名的既有检查名 4 个（上表），
**没有任何检查被删除**；`coverage-targets-selftest.js` **178 → 201（净增 23）**，改名 0 个。

## 6. 契约 7 条 Verify 的终态读数（原始字节）

| # | 命令 | exit | sha256（stdout 全文） |
| --- | --- | --- | --- |
| 1 | `coverage-targets-selftest.js` | 0 | `a41dde8d41e65cff25f55a3e9f6cf3acf7a4ae89ea37acdfafc78397451123ce`（201/0） |
| 2 | `models-selftest.js` | 0 | `d459d975715cfff5005af099e5b6e3ca67fae499fa5fc24c3f893274ad9f04a0`（148/0） |
| 3 | `coverage-report.js` | 0 | `64e04acfdcd508143572fcf752cc61c7e33927265f8c611df31115b92bf2c9ad`（自检 0 处） |
| 4 | `coverage-report.js --json` ×2 | 0 / 0 | `cc0f2d45385b1d4af2c4ae1cda6cd037866c479f45694c666af5bcf60e186f9b`（byte-identical） |
| 5 | `validate.js --strict` | 0 | `3f0ff15eb11291554ece820e81d2026d01bc8f47aad3ae02c1be0b74906a13fd` |
| 6 | `check-models-reproducible.js` | 0 | `0291bbeb14363583044fdbde2d47bb230b49abc4ca0f852d098cbe797e9144c5` |
| 7 | `check-model-registry-links.js` | 0 | `69d2520676efa8703ea75dd1d60e85a35f76ae29ad17179b5cfc17cb76923503` |

原始文件在 `research/_raw/coverage-depth-v1/repair-t25-clause2/verify-*.txt`（每个都有同名 `.stderr.txt`）。
