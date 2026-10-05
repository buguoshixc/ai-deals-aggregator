# t13 · models-page-selftest 四条失败的收口与可证伪性对照表

> 任务：t13（repair）—— 预集成 Full Gate 第 35 步的唯一红灯（`models-page-selftest` 4 条失败）。
> 根因由 captain 查明：**1 条是断言口径与自己的注释不一致，3 条是写死的基线快照**；本轮不重复调查根因。
> 原始读数：本目录 `before-4-failures.txt`（改前 111 通过 / 4 失败）、`verify-*.txt`（改后六次跑的原始字节）、
> `t13-summary.txt`（一次跑全的汇总）。

## 0. 改前 4 条失败原文 → 改后全绿

```
改前 ✗ 索引页的行**集合与次序**逐字等于发布数据集的 slug 序列（改名 / 换位 / 多行少行都变红） —— 缺 无 · 多 无
改前 ✗ 独立重算：10 个 registry 模型存在"一条映射覆盖多个真实 variant"（应为 9 个） —— ernie-5.1 | glm-4.5v | glm-4.6v | glm-4.6v-flashx | glm-5v-turbo | gpt-6-astra | gpt-6-luna | gpt-6.1-sol | minimax-m3 | qwen3-max
改前 ✗ §17 独立 join：44 个模型 missing / extra / duplicate source identity / multi-owner 四项计数全为 0 —— {"missing":0,"extra":0,"duplicate":0,"multiOwner":0}
改前 ✗ §17 独立 join：受影响口径独立重算为 13 组 / 10 个 slug —— ernie-5.1 | glm-4.5v | glm-4.6v | glm-4.6v-flashx | glm-5v-turbo | gpt-6-astra | gpt-6-luna | gpt-6.1-sol | minimax-m3 | qwen3-max
改前 === v3.0 Model Registry 页面演练：111 项通过，4 项失败 ===
改后 === v3.0 Model Registry 页面演练：120 项通过，0 项失败 ===   （--allow-missing-dist / --dir=dist / --dir=dist.qc-mpsel 三种跑法同值）
```

**新牙的现场输出（通过时也打印，见 `verify-1-allow-missing-dist.txt`）：**

```
ℹ t13 换位牙现场输出：把两行对调 ⇒ 次序不是逐字相等（首个不同在第 1 位：页面 "360zhinao-turbo-llm-geo" vs 期望 "360zhinao-pro"）（同一份输入在"集合口径"下是绿的：true）
ℹ t13 集合比对可证伪性：[a,b,c] vs [a,b,d] ⇒ false（应 false）；[a,b,c] vs [a,b,c] ⇒ true（应 true）；真实数据把一格换成 "-perturbed"（个数仍 10）⇒ false（应 false）
ℹ t13 四项计数逐项点名现场输出：missing=1 ⇒ 「missing=1」 · extra=1 ⇒ 「extra=1」 · duplicate=1 ⇒ 「duplicate=1」 · multiOwner=1 ⇒ 「multiOwner=1」；全 0 ⇒ 「」（空串 = 通过）
```

注意第 1 条的细节串是 `缺 无 · 多 无` —— **集合是对的，错的是次序**：这正是"集合比较冒充次序判据"
会漏掉的东西（旧代码用的其实是 `JSON.stringify` 整数组比较，但**比较对象用错了口径**：源层键序）。

## 1. 四条各自怎么修的（逐条对应验收 2–6）

| # | 旧判据 | 新判据 | 口径来源（现读） |
| --- | --- | --- | --- |
| 1 | `expectedSlugs = models.map(m => m.slug)`（源层 `modelsOf(modelsTable)` 的**人工维护键序**） | `expectedSlugs = publishedModels.models.map(m => m.slug)`（**发布数据集**次序，与上一行注释"索引页渲染走发布数据集"一致） | 发布数据集（`modelRegistry.publishedModels(...)`，与渲染同源） |
| 2 | `affected.length === 9` | `affected`（手工展开）**集合逐条等于** `multiVariantFromLinks().slugs`（lib 展开 + **重读关系层文件**） | `scripts/data/model-registry-links.json` 现读 |
| 3 | `audit.models === 44 && 四项 === 0` | `audit.models === readJson('models.json').models.length`（现读发布产物）**且四项各自 === 0**（`joinCountProblems()` 逐项点名） | 根 `models.json` 现读 |
| 4 | `audit.multiVariantGroups === 12 && audit.affectedSlugs.length === 9` | `audit.multiVariantGroups === 关系层现算组数` **且** `audit.affectedSlugs` **集合逐条等于** 关系层现算 slug 集 | `scripts/data/model-registry-links.json` 现读 + api-plans |

第 1 条**没有**降级成集合比较：仍是 `JSON.stringify(rendered) === JSON.stringify(expected)` 整数组比较（在第 3 节的换位牙里现场证明换位必红），也没有先 `sort`。
第 4 条从"计数相等"**升级**为"集合逐条相等"（`slugSetsEqual()`）—— 计数相同而内容不同也会红。

## 2. 检查名 old → new（三条改名，逐条说明理由）

契约第 7 条允许替换"含字面量的名字"。实际有 **3 条**名字里带数据快照，不止 2 条 —— 第 2 条的
`（应为 9 个）` 同样是写死的 9（契约第 4 条正是要求把这个 9 换成现算），所以一并列出：

| old | new | 理由 |
| --- | --- | --- |
| `独立重算：10 个 registry 模型存在"一条映射覆盖多个真实 variant"（应为 9 个）` | `独立重算：10 个 registry 模型存在"一条映射覆盖多个真实 variant"（必须 == 关系层现读现算的 10 个，且逐条集合相等）` | 名字里写着 `应为 9 个`（数据快照）；条数改成插值、期望改成两侧集合相等 |
| `§17 独立 join：44 个模型 missing / extra / duplicate source identity / multi-owner 四项计数全为 0` | `§17 独立 join：模型数 == 现读发布数据集的 51 个，且 missing / extra / duplicate source identity / multi-owner 四项计数各自为 0` | 名字里写着 `44 个模型`（数据快照）；改成插值 + "各自为 0" |
| `§17 独立 join：受影响口径独立重算为 13 组 / 10 个 slug` | `§17 独立 join：受影响口径与关系层现读现算逐条相等（13 组 / 10 个 slug）` | 名字里写着 `13 组 / 10 个 slug`（数据快照）；改成插值 + "逐条相等" |

第 1 条（索引次序）的**检查名一个字没动** —— 它本来就把口径写成"发布数据集的 slug 序列"，是代码没照做。

条数对照（只把改前的 **✓ 行**当作"既有检查名"；改前那 4 条是 ✗、行尾带 ` —— detail`，直接比会造出 4 条假改名）：

```
改前 ✓ 行数（既有检查名）= 111；改后 ✓ 行数 = 120
被删除或改名的既有检查名（在 111 条里）：0
新增 ✓ 行 = 9 条 = 4 条被重写（改前是 ✗）+ 5 条真正新增（两条换位牙 + 两条可证伪性 + 一条真实数据变异牙）
```

**一条检查都没删。**

## 3. 可证伪性对照表（本次新增或改写的每一条）

| # | 断言（新） | 形态 | 空集 / 恒真 / 同源风险 | 扰动输入 | 现场输出（命中信息） |
| --- | --- | --- | --- | --- | --- |
| 1 | `索引页的行**集合与次序**逐字等于发布数据集的 slug 序列` | 纯谓词 `indexOrderProblems()`（数组整串比较 + 缺/多集合差）；判据 = `problems.length === 0` | 没有空集风险：`expectedSlugs` 非空（发布数据集 51 个）；也没有"同源自证"——期望来自**发布数据集**、实际来自**产物 HTML**，两侧来源不同 | ① 两行对调 ② 改名 ③ 少一行（旧代码原有的"缺/多"分支仍在） | ① 见下一行；③ `缺 <slug>`；② `次序不是逐字相等（首个不同在第 N 位…）` |
| 2 | `【换位牙·t13】把索引页两行对调 ⇒ 同一支判据必红` | 直接调 `indexOrderProblems()`（与真实断言**同一支实现**） | — | 把渲染出的两行对调（只改内存 HTML 片段） | `次序不是逐字相等（首个不同在第 N 位：页面 "X" vs 期望 "Y"）` |
| 3 | `【换位牙·t13·对照】同一份对调后的行序在"集合口径"下是绿的` | 集合比较 vs 次序比较的对照 | — | 同一份对调后的 slug 数组 | 集合相等（51 行）但次序问题 1 条 ⇒ 证明"次序维度"不是集合比较冒充的 |
| 4 | `独立重算：N 个 registry 模型…（必须 == 关系层现读现算的 M 个，且逐条集合相等）` | 两侧独立展开（手工展开 vs lib `sourcePricingIdentitiesOf`）+ `slugSetsEqual()` | 非空前提写进判据（`affectedSlugList.length > 0`），否则空集时"集合相等"恒真 | 两侧各扰动一个 slug（个数相同、内容不同） | 见下一行 |
| 5 | `【可证伪性·t13】"集合相等"不是"计数相等"的伪装` | `slugSetsEqual()` 的正反例同时给 | — | `[a,b,c]` vs `[a,b,d]`（反例）/ `[a,b,c]` vs `[a,b,c]`（正例）/ `[]` vs `[]`（空集正例） | 反例 ⇒ `false`；正例 ⇒ `true`（证明它不是恒红/恒假） |
| 6 | `§17 独立 join：模型数 == 现读发布数据集的 51 个，且四项计数各自为 0` | 计数对账（产物侧 `audit.models` vs **现读** `models.json`）+ `joinCountProblems()` 逐项 | 四项计数是 `=== 0` 判据，不存在空集问题；`audit.models` 与"现读文件"是两个来源 | 任意一项计数非 0；另有一支**真实数据牙**（见下） | 见下一行 + 现存的 `§17 牙：人为删掉一行（<slug>）⇒ 独立 join 报 missing>0`（实跑，链在真实产物上） |
| 7 | `【可证伪性·t13】四项计数是**逐项**断言的` | `joinCountProblems()` 的正反例 | — | 依次把 `missing / extra / duplicate / multiOwner` 之一置 1 | 每次都只点名那一项：`missing=1` / `extra=1` / `duplicate=1` / `multiOwner=1`；全 0 时列表为空 |
| 8 | `§17 独立 join：受影响口径与关系层现读现算逐条相等（13 组 / 10 个 slug）` | 页面口径（`registry-join-audit` 从**产物 HTML** 重算）vs 数据口径（**现读关系层** + api-plans 重算）+ `slugSetsEqual()` | 两侧都非空（13 组 / 10 slug）；两条实现路径完全不同，不存在同源抵消 | 把关系层里某条 link 的多变体组改掉（或页面少一行）⇒ 组数/slug 集分家 | 差异集合会被点名：`… · 差异 ["<slug>"]` |

**至少 4 条「变异 ⇒ 必红」现场输出**（见上表 #2、#5、#7 与现存的 `§17 牙：人为删掉一行`）：
① 索引页两行对调 ⇒ 次序判据红（#2）；② 集合口径对同一输入是绿的（#3，对照）；
③ 计数相同、内容不同 ⇒ 集合比较红（#5）；④ 四项计数任一项非 0 ⇒ 被单独点名（#7）；
⑤ 真实产物删掉一行 ⇒ 独立 join `missing>0`（现存的实跑牙，`verify-2-dir-dist.txt` 里可见 ✓）。

## 4. 「改成结构不变量 ≠ 放宽」：新断言 ≥ 旧断言的逐条对照

| 场景 | 旧判据 | 新判据 |
| --- | --- | --- |
| 页面**真的**换位 / 改名 / 少行 / 多行 | ✅ 红（整数组比较） | ✅ 红（**同一支**整数组比较；换位牙现场证明） |
| 源层键序 ≠ 发布次序（本轮的真实情形，**页面是对的**） | ❌ **假红** | ✅ 绿（期望取发布数据集） |
| 多变体模型数变多（9 → 10） | ❌ **假红** | ✅ 绿 |
| 手工展开与关系层现算**分家**（个数相同、内容不同） | ❌ 漏抓（只比个数） | ✅ 红（集合逐条相等） |
| registry 身份总数变多（44 → 51） | ❌ **假红** | ✅ 绿 |
| 页面漏一行 / 多一行 / 重复归属 | ✅ 红（`missing/extra/duplicate/multiOwner`） | ✅ 红（四项**各自**断言；另有实跑牙） |
| 发布产物与产物页面**不同步**（audit.models ≠ 现读 models.json） | ❌ 漏抓（44 与 51 都在变） | ✅ 红（两侧都是现读） |
| 受影响口径 13 组 / 10 slug 变多 | ❌ **假红** | ✅ 绿 |
| 关系层与页面口径**分家** | ❌ 只比个数 | ✅ 红（集合逐条相等 + 差异点名） |

**每一行的"旧会红"场景在新判据下仍红，"旧假红/漏抓"的场景被修掉或被加强。**

## 5. 六次跑的原始读数（真字节）

| # | 命令 | exit | sha256（stdout 全文） |
| --- | --- | --- | --- |
| 1 | `models-page-selftest.js --allow-missing-dist` | 0 | `395d2166296e16c88b023b71e6a6161efbcf5a3e2e987dd6fb53839de9a45be4`（120/0） |
| 2 | `models-page-selftest.js --dir=dist` | 0 | `395d2166296e16c88b023b71e6a6161efbcf5a3e2e987dd6fb53839de9a45be4`（120/0，与 1 **逐字节相同**：产物齐全时两种跑法本就同一条路径） |
| 3 | `coverage-report.js` | 0 | `64e04acfdcd508143572fcf752cc61c7e33927265f8c611df31115b92bf2c9ad`（自检 0 处） |
| 4 | `validate.js --strict` | 0 | `3f0ff15eb11291554ece820e81d2026d01bc8f47aad3ae02c1be0b74906a13fd` |
| 5 | `build-local.js --out=dist.qc-mpsel` | 0 | `7fadb3ca28a11777a1917f34b71907b42dbeabd3f4ccd4d85e01e844606f18a6`（构建自检全过） |
| 6 | `models-page-selftest.js --dir=dist.qc-mpsel` | 0 | `db722e4911b90951a3affc99f5aab510d13e63ac478ed0d4ec12a6a7b72a6a50`（120/0；`独立 join（dist.qc-mpsel）：模型 51 · 页 51 · 期望行 92 · missing 0 · extra 0 · duplicate 0 · multi-owner 0`） |

`dist.qc-mpsel/` 是 `.gitignore:66` 的 `dist.qc-*/` 覆盖目录，不进版本库、不干扰 `dist/`。

## 6. 边界与归属

- 本次只改 `scripts/tools/models-page-selftest.js`；`scripts/data/**`、`scripts/lib/**`、
  `scripts/tools/build-local.js` **一字节未改**（第 1 条的根因是断言口径，不是页面构建：索引页渲染的
  正是发布数据集、次序正确 —— 新判据在 `--dir=dist` 与 `--dir=dist.qc-mpsel` 上都是绿的即为证）。
- **没有发现真实缺陷**：四条全部是"测试编码了快照 / 代码与注释不一致"，无需上报数据或构建缺陷。
