# t7 对抗式审查报告：t1（report:coverage v3 四节 + source-rulings 判据层 + 冻结契约与牙）

- **verdict：pass**（无阻塞项；3 条非阻塞 finding，见 §6，其中 2 条归因于 t1 之外的 workstream）
- 审查者：verifier-auditor（独立复算，未复用 t1 的自证材料；每条读数都是我自己跑出来的）
- 工作区：`D:\OneDrive\Desktop\Code\AI Page\.worktrees\coverage-depth-v1`（分支 coverage-depth-v1）
- 本目录（in-scope）：`research/_raw/coverage-depth-v1/verification/review-t1/`

## 0. 被审对象被钉在哪一个 revision 上（重要）

工作区在审查期间被**其他 workstream 持续改写**（数据层每 10–20 分钟一变），所以先把 revision 钉死：

| 文件 | t1 revision（11:59 快照 sha256） | 现在的 sha256 | 结论 |
|---|---|---|---|
| `scripts/tools/coverage-report.js` | `76cb8717…2419cba7` | 同 | **未变**（t1 交付物，正是被审对象） |
| `scripts/lib/source-rulings.js` | `b1921a19…eadec6d5` | 同 | **未变**（t1 交付物） |
| `scripts/tools/coverage-targets-selftest.js` | `8c3f37a0…6b0962efa74` | `a5223069…2706fc657` | **已被 t12 改写**（12:23:16，+828/-6；见 §6/F3） |

- 我审的是上表左列的 t1 revision；t1 revision 我**完整保留了两份冻结副本**（TEMP 沙箱）：
  - `cvdv1-t7-head` = t1 代码 + **HEAD 数据**（= t1 当时面对的仓库状态，`git archive HEAD` 展开后覆盖 t1 的三个文件）
  - `cvdv1-t7-frozen2` = t1 代码 + 12:12 的 live 数据快照
- 沙箱都在 `%TEMP%`，共享工作区**零写入**（证据：`shared-worktree-sha-before.json` 与文末 §7 的复核；复制进沙箱的 `coverage-report.js` / `source-rulings.js` 直到收尾仍与 "before" 逐字节相同）。

## 1. 独立复现 t1 报告的全部读数（t1 代码 + HEAD 数据）

我**没有 require** 被测的 `coverage-targets.js` / `model-freshness.js` / `coverage-report.js` 来算这些数，
而是直接读 `scripts/data/models.json`、`models.json`、`scripts/data/coverage-targets.json`、
`scripts/data/source-health.json`、`scripts/data/providers.json`、`deals.json`/`plans.json`/`api-plans.json`，
用**我自己写的**派生代码重算（`indep-recompute.cjs`，11 条对账全过）。

| 读数 | t1 自述 | 我独立算出 | 一致 |
|---|---|---|---|
| registry 模型数 | 44 | 44 | ✓ |
| 已知 releasedAt | 4（9.1%） | 4（4/44=9.1%） | ✓ |
| 未知 releasedAt | 40 | 40 | ✓ |
| 不可判日（写了但解析不出） | — | 0 | ✓ |
| catalogStatus 五档 | current3·aging0·legacy1·historical0·unknown40 | 同（逐档） | ✓ |
| developer 拆分 | 11 档 | 11 档（智谱AI8/腾讯云6/Anthropic4/Google4/MiniMax4/OpenAI4/火山引擎4/阿里云4/DeepSeek3/月之暗面2/阶跃星辰1） | ✓ |
| modelRole 拆分 | 7 档 | 7 档 | ✓ |
| release queue | 44 条、印前 15 | total 44 / unknown 40 / limit 15 / queue 15 | ✓ |
| gap queue | 18 = 17 MISSING + 1 PARTIAL，A0·B4·C10·D4 | 18 = 17 + 1，A0·B4·C10·D4，**逐格集合也相等** | ✓ |
| 七态合计 | — | COVERED64·PARTIAL1·MISSING17·DEFERRED2·UNVERIFIABLE2·NOT_APPLICABLE50·BLOCKED0（与报告 `states` 逐档相等） | ✓ |
| 心跳 generatedAt | 2026-10-04T16:31:52.051Z | 与 `source-health.json` 逐字相等 | ✓ |
| 采集器注册表 / 心跳行数 | — | 7 / 9 | ✓ |
| registry 映射闭合 | — | 44/44 slug 有映射，85 条 links，108 条计价条目 identity 全可回指 | ✓ |
| 未裁决的注册表行 | — | 7 个（aitools/cn_aliyun/cn_qianfan/cn_zhipu/futurepedia/futuretools/layer3labs），cf≥3 只有 futurepedia(10) | ✓ |

**t1 报的字节级证据我按真字节复核了**：在 "t1 代码 + HEAD 数据" 沙箱里 `--json` 两次运行
= **268285 字节 ×2，sha256 `2b08c3775965c729b99032710c29ea0218e2d6645ca03974fa74b26718e8366f` ×2**
（与 t1 自述**逐字节相同**，byte-identical=true）。这说明 t1 的读数来自"HEAD 数据 + 新代码"，
不是拿移动后的数据凑出来的。

审查期间 live 数据又被推进了三轮（我只读，不改）：
| 时点 | registry | 已知/未知 | catalogStatus | gap queue |
|---|---|---|---|---|
| t1 era（HEAD 数据） | 44 | 4 / 40 | 3·0·1·0·40 | 17 MISSING + 1 PARTIAL |
| 11:58 快照 | 44 | 4 / 40 | 3·0·1·0·40 | 8 MISSING + 3 PARTIAL |
| 12:12 快照 | 44 | 30 / 14 | 27·2·1·0·14 | 4 MISSING + 0 PARTIAL |
| 12:26 live（workstream A/B/C 落盘后） | 51 | 32 / 19 | 29·2·1·0·19 | 0 + 0 |

**在四个时点上，我的独立派生与报告的 `states` / `missingTargets` / `partialTargets` / census 逐档相等**
（`indep-recompute.snap1.json`、`indep-recompute.frozen2.json`、`indep-recompute.s2-headdata.json`）。

## 2. 逐条验收核对

### 2.1 四节内容在文本与 JSON 双侧真的存在且同源（不是只有标题）
自写核对器 `text-json-samesource.cjs`：不信实现者自测，直接从 `--json` 真字节捕获里切出文本段与 JSON 段，
按**文本里实际印出的行**反查 JSON（含每档 total/known/unknown/百分比、队列每条 rank/slug/未知或日期/组/ tier/下游引用、缺口每条 priority/provider/N/M/K/盘上记录/出口状态、规则原文逐字包含、四节标题存在）。
- t1-era 捕获：**48 条通过 / 0 失败**
- 12:12 快照：**50 / 0**；落盘 rulings 后的 live 捕获：**50 / 0**
- 规则原文（release queue ①–⑤、gap queue A–D 判据）在文本里**逐字出现**，且顺序与 JSON 数组序一致。

### 2.2 JSON 契约：旧键逐字逐序不动位、新键只追加
- v2（HEAD 代码 + HEAD 数据）`--json` 顶层键序 = `generatedAt,deals,coding,api,registry,gaps,candidates,coverageTargets`；
  v3 顶层键序**逐字同序**（8 键）。`coverageTargets`：v2 的 **21 键是 v3 25 键的前缀**，新增恰为
  `releaseEvidence, releaseEvidenceQueue, gapClosureQueue, sourceReliability` 四键，位置在末尾。
- `LEGACY_CONTRACT` 字面量：`git show HEAD:…selftest.js` 与工作区**逐字节相同**（1206 字符，identical=true）。
- `LEGACY_TOP_LEVEL` 数组字面量逐字相同；`APPENDED_KEY_WHITELIST.coverageTargets` 由 `['catalogStatusCensus']`
  变为 `['catalogStatusCensus','releaseEvidence','releaseEvidenceQueue','gapClosureQueue','sourceReliability']`（只追加）。
- t1 的 diff 删除行一共 5 行：报告 2 行（1 行文档注释 + 1 个 `}`）、自测 3 行（1 行文档注释 + 白名单 2 行）。
  **没有任何旧断言被删、被改名或被放宽**（HEAD 的 110 项在 t1 revision 下仍是 110 项的一部分，见 2.6）。

### 2.3 两次 `--json` byte-identical
- 冻结沙箱背靠背两次：sha256 `6905d418…3c40b` ×2（264419 字节）
- live 工作区背靠背两次：sha256 `9698645a…e1798` ×2（262956 字节）
- t1-era 沙箱两次：sha256 `2b08c377…8366f` ×2（268285 字节）

### 2.4 确定性反证：墙钟 / 网络 / 随机（我独立构造，不是读代码猜）
- **无网络 + 无随机（动态）**：`--require no-network-hook.cjs` 把 `http/https/net/tls/dns` 的
  request/get/connect/lookup/resolve*、`globalThis.fetch`、`Math.random`、`crypto.randomBytes/randomUUID`
  全部换成"一调用就抛"，报告**仍 exit 0，且输出与基线逐字节相同**（sha `2b08c377…`）⇒ 这一次运行没有出网、没有用随机。
- **墙钟反证（假墙钟）**：`--require fake-clock-hook.cjs` 固定 `new Date()`/`Date.now()`：
  - 同一天（2026-10-05）⇒ 输出与基线**逐字节相同**；
  - +1 天（2026-10-06）⇒ 全文件 6866 行里**只有 2 行变化**：文本 `生成日期` 与 JSON `generatedAt`；
  - +3 个月（2026-12-31）、+9 个月（2027-06-30）⇒ 同样只有这 2 行变化，exit 仍为 0。
  - ⇒ **v3 四节新增内容完全不吃墙钟**；报告唯一吃墙钟的地方是 v2 冻结键 `generatedAt`（HEAD 第 1037 行已有，
    工作区第 1652 行；取值 `todayCN()` 在 HEAD 第 144 行已有），属**先前行为**，且不影响 exit code。
  - ⚠️ 因此 t1 的"两次 `--json` byte-identical"应理解为**同一天内**成立（这对"确定性排序/无随机"的结论足够，
    但**不能**推出"报告不读墙钟"）；见 §6/F2。
- 静态侧：新增代码只 `require('../lib/source-rulings')` 与 `require(COLLECTORS_INDEX)`，无网络/随机 API；
  新增文案里出现的 "主观分/权重/百分比" 全是**否定式声明**（"没有任何主观分"），没有分值/加权/伪精确分数。

### 2.5 口径单一出处（报告没有自己重算一套）
- `releaseEvidence` 的 known/unknown：调 lib 的 `releaseDateOf().provided`；报告**另外**用 v2 口径
  （`releasedAt === null || undefined`）做交叉断言，两处分家即红 —— 我实测这条牙真的有牙（见 §3/M2）。
- `catalogStatus`：逐条值来自发布产物 `models.json`（我用 raw 文件独立统计，逐档相等）；词表来自
  lib 源码里的 `CATALOG_STATUSES`（我**文本抽取**该字面量 = `['current','aging','legacy','historical','unknown']`，
  与报告 `statusOrder` 相同；无词表外取值）。
- `gapClosureQueue` 的七态：来自 `coverage-targets.deriveTargets()`；我用自己写的七态 if 链独立派生，
  在四个时点上逐档相等（含 MISSING/PARTIAL 的**集合**相等）⇒ 报告没有手写状态、也不是"抄自己的读数"。
- `sourceReliability.registryRowCount/registryRows/registryOnlySources`：与既有 `sourceHealth` 同名键
  **逐字相等**（我在 live 捕获上独立比较，JSON.stringify 相同）——沿用同一批变量，没有第二套口径。
- 新常量只有两个且都**声明式打印在报告里**：`RELEASE_QUEUE_LIMIT = 15`（JSON 里也写 limit）、
  `HIGH_VALUE_DIMENSIONS = ['api','models']`（JSON 里也写 highValueDimensions + 规则原文）。这不是"第二套真相"，
  而是新机制自己的人工判据，且被判据层原文覆盖；没有任何既有的写死常量被顶翻（§47 检查项）。
- 队列次序可解释且确定性：五条规则全部是盘上事实（未知位 / 组规模 / tier / 下游引用 / slug code-unit）。
  我用自己的比较器把打印的 15 条**重排一遍对账**（`check-queue-order.cjs`，三份捕获 verdict=ok），
  gap 分层的 A→B→C→D + tier/provider/维度序同法复核（ok）。

### 2.6 自测不变量（独立跑，不用 t1 的自证材料）
| 场景 | 沙箱 | 结果 |
|---|---|---|
| HEAD 基线（HEAD 代码 + HEAD 数据，无 source-rulings.js） | `cvdv1-t7-head-clean` | **110 项通过 / 0 失败，exit 0**（与 t1 自述基线一致） |
| t1 revision（t1 代码 + HEAD 数据） | `cvdv1-t7-head` | **178 项通过 / 0 失败，exit 0**（与 t1 自述完全一致；+68，无删除） |
| 12:12 快照（t1 代码 + 12:12 数据） | `cvdv1-t7-frozen2` | 178 项通过 / 0 失败，exit 0 |
| live 工作区（t12 改写后的 selftest） | 工作区 | **198 项通过 / 0 失败，exit 0** |
| live 工作区（12:08 时点，workstream B 数据半落盘） | 工作区 | 177 / **1 失败**（t25 方程）→ 见 §6/F3 归因，**非 t1 缺陷**：同一份 t1 code + HEAD 数据跑出 178/0 |

### 2.7 source-rulings 缺失与非法两条路径（逐条必须红）
全部在沙箱里用 `--source-rulings=<夹具>` 构造（**没有改任何共享文件**），15 条结果见 §3 表；
缺失路径在"落盘之前"的沙箱（`cvdv1-t7-head`，无该文件）上构造：**exit 0 但必须显式说未落盘**，
且打印 `报告自检待落盘层：1 项（**计入自检口径**：未落盘 ≠ 通过，也不判红）` ⇒ 不是静默当通过。

## 3. 变异（Mutation）：预期红 / 实际红 / 命中信息

**必须说清楚的三件事**（题面 §48）：
1. 变异**只**在 `%TEMP%` 沙箱副本上做；共享工作区被复制的文件在前后都贴了 sha256（§7），**0 变化**。
2. 我**没有**做"全覆盖"这种事，也不能这么写：下面 15 条只覆盖 t1 新增反证面的一部分（v3 四条牙 × 变体 + 我加的 3 条 schema 路径），
   已抓到的和故意构造的都在表里，**未抓到的情形在 §5 列出**。
3. 每条牙的"红"= 报告 `exit ≠ 0` **且** stderr 出现指定命中串（不是只看退出码）。

| # | 变异 | 预期 | 实际 exit | 命中信息（截断） |
|---|---|---|---|---|
| C0 | 合法 rulings 夹具（正控制） | 绿 | 0 | 对账 0 处问题（否则后面的红不算牙） |
| M1 | `releasedAt='2026-10'` | 红 | 1 | 「有 1 条模型的 releasedAt **写了但解析不出可判日**」 |
| M2 | `releasedAt=''`（空串） | 红 | 1 | 「两处读数不一致（新读数 14 / 既有 13）」 |
| M3 | current target 指向不存在的 `registrySlug` | 红 | 1 | 「registrySlug「t7-no-such-slug-xyz」不在 scripts/data/models.json 里」 |
| M4 | `keep-degraded` 缺 `whyKept` | 红 | 1 | 「decision=keep-degraded 必须写 whyKept」 |
| M5 | `retire` 却仍在采集器注册表 | 红 | 1 | 「仍然挂在采集器注册表里（registry id futurepedia）」 |
| M6 | cf≥3 却一条裁决都没有 | 红 | 1 | 「却没有在 scripts/data/source-rulings.json 里留下裁决」 |
| M7 | 裁决数组乱序 | 红 | 1 | 「rulings 数组不是规范序（应 aitools → layer3labs）」 |
| M8 | 坏 JSON | 红 | 1 | 「scripts/data/source-rulings.json 解析失败：…」 |
| M9 | `decision='pending'`（非法枚举） | 红 | 1 | 「decision 非法（pending），允许 repair / headless-migrate / keep-degraded / retire」 |
| M10 | `headless-migrate` 缺 `headlessStability` | 红 | 1 | 「必须写 headlessStability」 |
| M11 | evidence.url 是相对地址 | 红 | 1 | 「不是绝对地址（要写 scheme://…）」 |
| M12 | 文件缺失（落盘前的沙箱） | 绿+显式 | 0 | 「**尚未落盘**（未落盘 ≠ 通过…）」+「报告自检待落盘层：1 项」 |
| M1b | **真改沙箱 `scripts/data/models.json`**（不传 `--models=`） | 红 | 1 | 同 M1 命中串 |
| M1b-restore | 还原证明 | — | — | sha before=`2f69aa51…`，mutated=`420d99e8…`，after=`2f69aa51…` ⇒ **逐字节还原** |

t1 自述的 8 条牙里我**独立抽验并全部命中**（①–⑧，其中①= M1、②= M2、③= M3、④= M4、⑤= M5、⑥= M6、⑦= M7、⑧= M8），
另外自己加了 M9/M10/M11 三条 t1 版自测里没有单独列出的 schema 路径，也都红。

## 4. 空断言排查（"加了断言但从不可能失败"）

逐一过 t1 新增的 47 条 `check()`（`t1-selftest.diff.txt` 的 added 行）：
- 绝大多数是三段式（结构 + 关系 + 自洽），且被"报告必须 exit 0 才进入这一段"包住（否则整段走 else 分支显式红），
  不会因为"报告红了"而静默跳过。
- **发现 1 条会退化为恒绿**：`v3③：MISSING 行的盘上记录必须是 0`（工作区自测第 1435/1436 行）
  = `gapQueue.filter(row => row.state === 'MISSING').every(row => row.present === 0)` ——
  `every()` 对空数组恒真。live 当前 `gapClosureQueue.total = 0`（MISSING 与 PARTIAL 都被 workstream B 清空），
  这条断言**此刻就是恒绿**。判据本身没错，缺的是"至少有一条 MISSING"的非空前提。
- 其余 `.every()/.some()` 使用都有前置量或由别的断言兜住（例：`limit>0 && queue.length === min(limit,total)`、
  `groupJudgeAvailable === true`、`rel.present === true && rel.notLanded === false`、`counts 之和 == 队列长度`）。
- 另发现（**不属 t1**，是 12:23 被 t12 追加的）第 836 行有一条**数学恒等式**：
  `reg.declaredApiEntries === reg.declaredApiEntryRows.length + (reg.declaredApiEntries - reg.declaredApiEntryRows.length)`
  —— `x === y + (x - y)` 恒真，这个合取项永远不会失败。归 t12 修，见 §6/F3。

## 5. 未抓到 / 覆盖不到的地方（不许写"全覆盖"）

- **判据正确性 > 结构完整性**：我能证明"报告与 lib 的七态逐档一致"，不能证明"lib 的七态判据本身在语义上永远对"
  （那要有人对每个格子的资格逐条人工复核；t1 不是判据层的作者）。
- **归一化依赖**：我的独立重算里，deal → provider 的归一用了 `lib/render-core.js` 的 `vendorOf`（叶子工具，
  非被测三件之一）。如果这一层有系统性错误，我和报告会一起错。
- **变异只覆盖"能被夹具喂到的路径"**：`--models= / --targets= / --source-rulings=` 之外的路径
  （例如注册表读不出来那一条）我**没有**构造成功案例；我只验证了它在沙箱里真的会红（cheerio 缺失时报告确实红），
  没验证它的命中信息在真实 CI 环境下是否也会出现。
- **未做**：并发/文件竞争、超长输入、非 UTF-8 文件、symbolic link 输入等场景。
- **未做**：t1 之外的四节之外内容（例如 `--json` 之外的其它 CLI 开关）与 lib 级 22 条 schema 变异牙的逐条复核
  （那些属 t1b / lib 作者的自证面，我只抽验了 11 条 schema/对账路径，全部红）。

## 6. Findings（结构化）

**F1 · GUARDRAIL · low · 不阻塞 verdict**
- problem：t1 新增断言 `v3③：MISSING 行的盘上记录必须是 0` 用 `gapQueue.filter(state==='MISSING').every(...)`，
  空集恒真；当前 live `gapClosureQueue.total == 0`，该断言已经是恒绿。
- file/line：`scripts/tools/coverage-targets-selftest.js:1435-1436`
- requiredFix：加非空前提（例如 `const missingRows = gapQueue.filter(...); missingRows.length === cov3.states.MISSING && missingRows.every(...)`，
  或要求 `cov3.states.MISSING > 0` 时才算这条有效并额外断言 `states.MISSING` 与集合大小一致）。

**F2 · DOC · low · 不阻塞 verdict（先前行为，不建议 t1 改冻结键）**
- problem："报告不读墙钟"作为**字面命题**不成立：报告用 `todayCN()`（HEAD 第 144 行已有）产出 `generatedAt`
  （工作区第 1652 行，v2 冻结键）并用于 deals 过期判定；所以"两次 `--json` byte-identical"只在同一天内成立。
  我实测四节新增内容**完全不随墙钟变化**（只 `生成日期`/`generatedAt` 两行变化），所以不影响 v3 的确定性结论。
- file/line：`scripts/tools/coverage-report.js:195`、`:1652`（HEAD 基线同位置）
- requiredFix：无需改代码（改会破坏"旧键逐字不动位"）；建议在报告的确定性声明里写明"same-day byte-identical"，
  或把 `generatedAt` 的来源在文档里点明为墙钟。

**F3 · VERIFY · low · 不属 t1（归因：workstream B 的在途数据 + t12 的 12:23 改写）**
- problem：12:08 我在共享工作区跑自测得 177 通过 / 1 失败（`t25` 方程），
  同一份 t1 代码 + HEAD 数据是 178/0 —— 说明那次红是 **workstream B 的 api-plans.json 半落盘**导致，
  不是 t1 缺陷；随后 t12（12:23）把该断言改写成 `apiDispositionIssueList.length === 0`，并在第 836 行留下
  一个恒真的合取项（`x === y + (x - y)`）。
- file/line：`scripts/tools/coverage-targets-selftest.js:836`（t12 追加）；数据侧 `api-plans.json`
- requiredFix：t12 的 owner 把第 836 行的恒真合取项换成真不变量（例如分别断言 B 与 rows 对 api-plans 的独立对账结果）；
  workstream B 收口时以"自测 198/0 + report 0 处问题"作为收口条件（现已满足）。

## 7. 只读纪律证据（共享工作区 0 变化）

- 审查前对共享工作区被复制/被读的关键文件打 sha256（`shared-worktree-sha-before.json`）；
  收尾时复核：`scripts/tools/coverage-report.js`、`scripts/lib/source-rulings.js` **逐字节未变**；
  数据文件（`scripts/data/models.json`、`models.json`、`scripts/data/coverage-targets.json`）确实变了，
  但那是 workstream A/B 自己的落盘（它们各自的证据目录在 12:15–12:16 有写入，且 git status 里对应路径由它们拥有）。
- 所有变异/夹具只写在两份 `%TEMP%` 沙箱与 `research/_raw/coverage-depth-v1/verification/review-t1/mutations/`；
  M1b 的"真改"只改沙箱 `scripts/data/models.json`，并已逐字节还原（sha 三次留档）。

## 8. 本目录证据清单（全部可复跑）

| 文件 | 说明 |
|---|---|
| `indep-recompute.cjs` + `indep-recompute.{s2-headdata,snap1,frozen2}.json` | 独立重算（不 require 被测 lib）与 11 条对账 |
| `text-json-samesource.cjs` | 文本↔JSON 同源逐条核对（48–50 条 × 3 份捕获） |
| `check-queue-order.cjs` | 队列次序独立重排复核 |
| `no-network-hook.cjs` / `fake-clock-hook.cjs` | 无网络·无随机 / 假墙钟反证 |
| `make-mutation-fixtures.cjs` + `mutations/**` | 变异夹具与每条日志（`mutations/logs/*.out|err.txt`） |
| `run-mutations.cjs` + `mutations/mutation-results.json` + `mutations/suite-run.txt` | 15 条变异的 预期/实际/命中 与 M1b 还原证明 |
| `run-node.cjs` / `hash.cjs` / `extract-json.cjs` | 真字节捕获与 sha/逐行差异工具 |
| `s2-report-json.out.txt`（268285B，sha `2b08c377…`）`/ s2-report-json-b.out.txt` | t1-era 两次运行，byte-identical |
| `det-A1/A2`（冻结沙箱）、`det-B1/B2`（live） | 两组背靠背 byte-identical |
| `clock-{1005,1006,1231,2027}.out.txt` | 假墙钟四档，逐行 diff 见正文 |
| `nonet-s2-json.out.txt` | 无网络钩子下的运行（与基线逐字节相同） |
| `live-with-rulings-json.out.txt` / `final-verify-{text,json,selftest}.*` | source-rulings 落盘后的 live 读数（t1 落盘分支也跑通了同源核对） |
| `t1-report.diff.txt` / `t1-selftest.diff.txt` / `now-selftest.diff.txt` / `t1-all.diff.txt` | 原始 diff（UTF-8 真字节） |
