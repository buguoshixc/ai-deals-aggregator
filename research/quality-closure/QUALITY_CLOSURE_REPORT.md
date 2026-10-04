# Quality Closure 完成报告

- 轮次：`quality-closure-post-audit`
- 日期：2026-10-04（Asia/Shanghai）
- 分支 / worktree：`quality-closure-post-audit` @ `D:\OneDrive\Desktop\Code\AI Page\.worktrees\quality-closure-post-audit`
- 本轮起点：`origin/master` = `21cf66d530de1124478824386ff95582c73afece`
- 本轮代码终点（10 个根因 commit 的 HEAD）：`3edb9cfd7d9653bed37ef70169bdd0b61046b4f0`
- 本轮最后一提交：收口交付物 commit（`docs(quality-closure): 本轮收口交付物入库…`），紧随其上；本轮共 11 个 commit，全部只在本地 —— 未 push / 未开 PR / 未部署
- 结论：**适合继续开发新功能**（唯一保留条件见 §26 末尾）

本报告所有数字都在提交态上重新计算过；凡引用他人交付物的数字都注明出处文件。未运行的事情一律写「未运行」。

---

## 1. Baseline

### audit commit

`1c024db6029feb6ecaf9ddfb32d88e51bf08fee2`（原联合审计的基准；`research/audit/**` 是历史证据，本轮一字节未改）

### latest origin/master

`21cf66d530de1124478824386ff95582c73afece`（PR #31 merge）。**不是**审计 commit，**不是**当时的分支头；worktree 就建在它上面，与审计 commit 之间已有 6 个文件的既存漂移（`deals.json`、`index.html`、`verify-site.js`、`source-health.json`、`source-snapshots.json`、`zh-pending.json`）——本轮所有 before 值都以 `21cf66d` 为准，不把既存漂移算作本轮缺陷或本轮修复。

### worktree

`.worktrees/quality-closure-post-audit`，分支 `quality-closure-post-audit`，基点 `21cf66d`。开发全程在隔离 worktree；主工作区未被触碰。每条写操作者另有自己的隔离产物目录 `dist.qc-<owner>/`，变异一律在仓库外沙箱或 `.qc-*/sandbox` 内进行。

### baseline hashes

交付物 `research/quality-closure/BASELINE.md`：69771 B · sha256 `948489d87b7bee135e4c59c03a3964549e8fb57c5a3cf59eece15a9980be12ba`。

提交态（HEAD `3edb9cf`）的真值与来源层文件（sha256 前 12 位 / 字节数）：

| 文件 | sha256(12) | bytes |
|---|---|---|
| `deals.json` | `3ba148dbc640` | 241698 |
| `plans.json` | `a72c91efea82` | 45904 |
| `api-plans.json` | `19cd8af73a74` | 66504 |
| `models.json` | `8fa85b1d0547` | 18693 |
| `model-registry-links.json` | `fd2336c86d07` | 39441 |
| `scripts/data/deal-history.json` | `6c9909d99197` | 88821 |
| `scripts/data/plan-history.json` | `67dbc7f141a4` | 18839 |
| `scripts/data/api-plan-history.json` | `56685dd589dc` | 50954 |
| `scripts/data/deal-plan-links.json` | `c1f391080eff` | 5023 |
| `scripts/data/source-health.json` | `dea22263ad42` | 4563 |
| `scripts/data/source-snapshots.json` | `68b534598e95` | 65025 |
| `scripts/data/zh-pending.json` | `32d6a50e9eca` | 83 |

### 本轮的 10 个根因提交

| commit | 根因 | 覆盖 |
|---|---|---|
| `5ec2532` | registry-integrity | P0 身份唯一性 + 多变体行完整 + 逐格数值守卫 |
| `c21a6ce` | history-archive-nonempty | /changes/ 非空路径 + 档案详情页相对前缀 + 合成非空夹具 |
| `70d015e` | provenance-semantics | 来源档位 + freeTier 语义 + 官方域守卫 |
| `25fa540` | api-pricing-guardrails | input/output/单位/证据绑定 + unknown ≠ false |
| `55e611a` | ai-candidate-isolation | 候选 → 生产真值的隔离边界 |
| `e8b68c9` | source-health-wiring | headless_unavailable 真实接线 |
| `1f09c6b` | gate-fail-closed | 步骤语义冻结 + 产物缺失 fail-closed + 不静默降级 |
| `1614639` | dataset-integrity | Dataset Manifest 双向完整性 |
| `db24737` | feeds-single-source | /feeds/ 以 Registry 为唯一来源 |
| `3edb9cf` | docs-sync | §22 文档数字重算同步 |

Prompt §25 建议 8 个根因；实交 10 个 —— 多出的两个（source-health 接线、feeds 单一来源）与另外 8 个不是同一根因，硬并会把「来源健康判据顺序」和「订阅页数据来源」两个独立问题混进不相干的提交里。每个 commit 显式列路径，65 个 tracked 改动 + 2 个新增工具文件互不重叠（无 `git add -A`）。

---

## 2. Finding Existence Check

交付物：`FINDING_STATUS_BEFORE.md`（40723 B · sha256 `5ac7e1de478071908bcc44a3ed3a9daad8e6585d723434c169ff81cbfb50a931`）。

### STILL_PRESENT

**46/46 目标 finding ID 全部 STILL_PRESENT**：P0 × 1、P1 12 条待修条目（覆盖 13 个 ID）、P2/P3 与矩阵行 ID 32 条。没有出现「审计说要红、最新 master 上已经绿了」的项。

### ALREADY_FIXED

0 条。

### CHANGED

0 条 finding 状态变化。只有两处**计数口径**差异（审计按条目数、本轮按 ID 数），已在 `FINDING_STATUS_BEFORE.md` §4 写明，不构成 finding 状态改变。

### NO_LONGER_APPLICABLE

0 条。99 条条目在本轮全部落到最终分类里（§3、§24）。

---

## 3. 审计 Finding 重新分诊

审计共 **99 条条目 / 104 个 finding ID**（P0 × 1、P1 × 12 条覆盖 13 个 ID、P2 × 32、P3 × 54），规范清单在 `research/audit/DEFECTS_AND_GAPS.md`。

### 六类（分诊口径，Prompt §2）

| 类别 | 条数 |
|---|---|
| REPAIR NOW | **10** |
| GUARDRAIL | **18** |
| VERIFY | **16** |
| DESIGN | **10** |
| DOC | **17** |
| NOT REQUIRED | **28** |
| 合计 | **99** |

`P2-20` / `F-r2-api-006`（「全仓没有单位换算代码」这条静态扫描只覆盖一个文件）从初版 draft 的「§10 未选中 → DEFERRED」改判为 **GUARDRAIL**：审计 R-P1-7 本就把它与 P1-7…P1-10 归为同一条修复项，而「全仓没有换算路径」是 §10.2 单位红线成立的结构前提。因此 GUARDRAIL 17 → 18、DEFERRED 13 → 12，合计不变。

### 九类（Prompt §24 终版分类）

| 类别 | 条数 |
|---|---|
| FIXED | **10** |
| GUARDRAIL_ADDED | **19** |
| VERIFIED_NO_CHANGE | **8** |
| DESIGN_ACCEPTED | **10** |
| NOT_REQUIRED | **12** |
| DOC_FIXED | **18** |
| DEFERRED | **22** |
| ALREADY_FIXED | 0 |
| NO_LONGER_APPLICABLE | 0 |
| 合计 | **99** |

逐条 7 字段（old finding ID / old severity / audit commit / latest master status / new category / action / evidence）见 `RECLASSIFIED_FINDINGS.md` 终版（60247 B · sha256 `3744ff395217e34f0b61c77236fd1d3279cdb7008160dcc1cd0cbfb593af881e`），其 §4 是 37 条 ⚑ 条目的逐条收敛表（已无未决项）。

### 覆盖 Prompt §13「明确不修」的裁定

| 项 | 裁定 | 依据 |
|---|---|---|
| `V2.0-METRIC-004` / `011` / `012`（长期确认率、变更准确率、运营 Dashboard） | NOT_REQUIRED | Prompt §13.4 |
| `V1.6-FEED-006` / `007`（新增 `/feed/api.xml`、`/feed/coding.xml` 家族） | NOT_REQUIRED | Prompt §13.1 |
| 统一 Coding/API 单位、v1 API 表加 RPM/TPM 列、把 Plans/API 塞进每日采集、统一 Feed GUID、统一 History 事件基准、整文件级 CI 工作流 SHA 锁 | NOT_REQUIRED | Prompt §13 逐条 |

**没有**为了把审计数字清零而机械修复：10 条 REPAIR NOW 是本轮真正修的产品缺陷，其余按 GUARDRAIL / VERIFY / DESIGN / DOC / DEFERRED / NOT_REQUIRED 各归其位。

---

## 4. Registry Integrity

### 原问题

`F-v3-registry-002`（原审计唯一 **P0**）：同一个「来源层计价身份」可以同时归属两个 registry 模型；审计给了可复现的来源层改法（按规范序合法追加一条映射），当时 11 道生产门禁全部放行。

### 根因

唯一性判据的实现把冲突键写成**三元组字面量**并对通配情形做了特判：

```
planId \0 modelKey \0 (variant === null ? '(all)' : variant)
```

于是「通配 `null`」与「显式 `standard`」落在两个不同的键空间里，同一条计价记录可以被认领两次；而模型详情页侧用的是 `.find(...)`（取第一条匹配），把「多归属」静默成了「归属第一个」。

### 修复

判据换成**link 展开后的真实 identity 集合**：`(apiPlanId, modelKey, 记录内真实 variant)`，从 api schema 推导，无 `null` / `standard` 特判；`sourcePricingIdentityKey()` / `sourcePricingIdentitiesOf()` 是唯一实现，`apiTargetOf` 复用同一套展开。旧口径的键字符串在 :523-526 处的特判被删除。

同时补上完整性守卫：`validate.js` 的 `duplicateKeys` 透传（重复顶层 slug 现在四个入口都红）——这是评审发现的独立 LOW 项 `F-T19-1`。

### Tooth Test

- 原 P0 的**原始形态**（来源层合法追加通配/显式映射，把同一计价记录指向第二个 registry 模型）：17 道门禁里 **8 道判红**，`rebuild-models` **exit 1 拒绝写盘**。不存在「生产门禁全放行」的路径。
- 变异矩阵 9 case × 5 门禁：P0 原始形态 / 显式 standard / 相邻 long_context / 删映射 / 重复顶层 slug / 空展开通配 / 空 registry / 删关系层文件 —— 全部多道非 0。
- `F-T19-1` 修复确认：`links-check` / `registry-selftest` / `validate --strict` / `models-reproducible` **四入口全 exit≠0**。
- 「把判定写死」的回头验证（T23 独立做）：`sourcePricingIdentitiesOf` 写死 → models-selftest / links-check / validate **三红**。

### 全量 Join 结果

新增 `scripts/tools/registry-join-audit.js`：**独立 join，不 require 任何被测判定模块**，从数据原文重算。

| 指标 | 结果 |
|---|---|
| registry 模型 / 模型页 | 44 / 44 |
| 期望计价行（按展开口径） | 67 |
| 产物真实计价条目 | 67 |
| missing / extra / duplicate / multi-owner | **0 / 0 / 0 / 0** |

T18 与 T23 各自**自写**了一份独立 join 重算（不读 `registry-join-audit.js`），三次结果一致（44 页 / 67 行 / 四项计数全 0），且各加了六组逐项对账（价格、单位、通道、变体标签、来源链接∈officialUrl∪evidence URL、canonical）。

---

## 5. Model Multi-Variant

`F-v3-registry-001` / `V3-MODEL-024`：多 variant 记录在模型详情页被**吞行**（一个模型只渲染一行）。

修复后行身份 = `planId|modelKey|variant`（产物上 `data-item` 与 `data-variant`），页面自证的对账改成按 identity 逐条核对（`assertPageHonesty`）。

生产现场逐页行数（T18 / T23 两次独立重算一致）：

| registry slug | 行数 |
|---|---|
| glm-4.5v | 2 |
| glm-4.6v | 2 |
| glm-4.6v-flashx | 2 |
| glm-5v-turbo | 2 |
| qwen3-max | 2 |
| gpt-6-astra | 4 |
| gpt-6-luna | 4 |
| gpt-6.1-sol | 4 |
| minimax-m3 | 3 |
| **多变体合计（9 个 slug / 12 个多变体组）** | **25** |

全站模型页计价行 = **67**（= 期望值 = 产物真实值）。逐格数值对账覆盖 44 页 / 67 条 / **536 个格**，0 豁免。

---

## 6. Changes 非空路径

`P1-4`：`/changes/` 在**非空历史**下不成立 —— itemlist 声明数与页面元素数不一致（声明 6 / 元素 5、元素 5 / 页面 `data-item` 0），itemlist 成员 5 项不符，套餐变化块缺一句。

修法与判据：

- 变化雷达的成员判据与页面渲染口径统一（`lib/changes.js` 的 `itemListRecords` / `renderOrderOf` / `ITEM_STRENGTH`），页面种类声明里 `changes.checkMembers:false` 这种「跳过节」的口子被收回。
- 新增 `scripts/tools/history-nonempty-e2e.js`（`--state=synthetic|pristine`，约 830 行夹具）：把「非空历史」变成**可复跑**的端到端场景，一条命令就能 build / verify / feed / 浏览器渲染走完。

before → after（同一份合成非空历史、同一构建路径）：

| 断言 | before | after |
|---|---|---|
| itemlist-arity | 2 红 | 0 |
| itemlist-members | 5 红 | 0 |
| internal-link-exists | 96 红 | 0 |
| 套餐变化块 | 缺句 | 成立 |
| changes-selftest | 红 | **101/0** |

---

## 7. Archive 非空路径

`P1-5`（`F-r1-history-ai-002`）：档案详情页在深度派生的路由前缀上算错相对路径 —— 每页 27 条相对引用里 **24 条死链**（favicon / feed / 面包屑 / 全站导航全中）。

修法（只收口，不改语义）：`lib/archive.js` 统一 `routePrefixOf()` / `archiveEntryPrefix()`，`ctx.prefix` 改为**必填**并删掉 `'../../'` 默认值 —— 默认值正是这个缺陷的藏身处：调用方少传一个参数时它不会报错，只会静默生成错误的链接。

before → after：

| 指标 | before | after |
|---|---|---|
| 合成态 4 个详情页相对引用可解析 | 3/27 条 | **108/108** |
| 逐页扫描（含 `url()` 与索引页，共 143 条） | 有缺失 | 0 缺失 |
| 生产态索引页 31 条引用 | — | 0 缺失 |
| canonical 自指 | — | 4/4 |
| 索引与 sitemap 入链 | — | 4/4 |
| archive-selftest | 红 | **69/0** |
| 真浏览器 verify-site | 红 | **703/0** |

**边界**：生产当前 history 事件为 deal 0 / plan 14 / api-plan 6、档案详情页 0 个 —— 即「档案详情页」这条路径在生产上**零样本**。这不等于功能失败，也不等于功能已被生产验证；它的可用性由合成夹具证明（§6 的同一条纪律）。

---

## 8. Provenance / Official Semantics

### 原问题

`P1-6` / `P2-16` / `P3-11`：第三方收录页与「由官方原文推断」的内容被写成官方事实。

### 修复

档位判据从「只读 `basis`」改成**同时读 `basis` + `derived` + `sourceFacts.sourceType`**（`basisWordingKey()` 三轴）：

| 情形 | 措辞 |
|---|---|
| 任一轴 = inferred | 「由官方原文推断」 |
| documented | 「依据官方条款原文」 |
| basis=source 且 official/curated | 「官方页面明写」 |
| basis=source 且 directory/unknown | **collected（新增档）**：「第三方收录页原文（非官方页直引）」 |

标签同步：`SOURCE_LABELS.origin`「原始出处」→「**收录渠道**」（`scripts/lib/audience.js` 与 `index.html` 的 `SOURCE_WORDING` 两副本逐字同值；空态 `noOrigin` 同词改成「未署名收录渠道」）。回放同一批 134 条记录：详情页「原始出处」出现 **217 → 0** 次、「收录渠道」**0 → 217** 次，83 条空态计数不变。

### 官方域守卫

`validate.js` 新增 `checkOfficialDomainGuard`：`providers.json` 登记 **23 个公司键**的 `officialDomains`（本轮补入），`official_urls.json` 14 个条目。实测：`sourceType=directory` 的记录里，`url` 落在第三方目录站/聚合站 host 上的 **0 条**（全库 134 条也是 0 条）；带字段级依据的 14 条 directory 记录 **14/14** 的 `url` 都落在已登记官方域上。

**残留（DEFERRED）**：历史层与档案页仍把同一字段显示为「原始出处」（`lib/history.js`、`HISTORY_WORDING.HISTORY_FIELD_LABELS.sourceUrl`、`lib/archive.js` 的一处字面量）。**当前不可达**（deal-history 事件 0、档案详情页 0），所以不为了「统一」去改一条跑不到的路径；已记入 `RECLASSIFIED_FINDINGS` 与 `NEXT-STEPS`。

---

## 9. Free Tier / Deal Semantics

### 原问题

`P1-11`（`F-r2-api-005`）：长期免费额度与新用户赠送 / 限时活动在数据与页面里**同一个形态**，读者会把「新用户 100 万 Token（90 天）」读成「长期能力」。

### 修复

`freeTier` 新增**必填**枚列 `stability ∈ {standing, new_user, promotional}`（「长期提供 / 新用户赠送 / 限时赠送」）。**缺省即错误**——旧缺省会被读成长期能力，这正是这条 P1 的形态。生产 4 条：

| 记录 | type / period / amount | stability | 依据 |
|---|---|---|---|
| zhipu | models / standing | `standing` | 官方页：模型长期免费 |
| google | models / standing | `standing` | 官方页：长期免费档 |
| aliyun | tokens / one_time / 1000000 | `new_user` | 官方专页逐字：「首次开通…新人专属免费额度」「有效期 90 天」「同一实名主体重新注册无法再次领取」 |
| tencent | tokens / one_time / 1000000 | `new_user` | 记录内官方引文：「首次开通…资源包有效期为 1 年」 |

**没有搬动任何 Deal**：Deal 与免费额度是两类语义，本轮不合并、不互推。

### Deal 侧复核（§18 详述）

4 条候选**均未达到改生产数据的门槛**（0 条 `CONFIRMED_ENDED`、0 处生命周期改动）；证据不足时不得改 active/ended、不得触发生命周期事件 —— 这条纪律在 §18 有逐条记录。

---

## 10. Source Health

`P2-15`（`F-r1-identity-002` ≡ `V1.0-HEALTH-003/009`）：**headless 浏览器不可用时，Source Health 仍然显示 healthy**。

根因是判定**顺序**：`lib/health.js` 的「采集器抛异常」分支排在「无头来源 + 浏览器没起来」之前；内核不可用时 `lib/browser.js` 的 `launch()` 必然抛 `code=NO_BROWSER`，症状被写成「来源故障」，`headless_unavailable` 在**真实接线路径**上不可达 —— 而自测里的合成夹具全绿，所以门禁看不见。

修复：`headlessReady()` / `attemptsFromReport()` 成为唯一实现，Collect Summary、`scripts/data/source-health.json`、`/status/` 三处结论一致；`DSH_BROWSER_EXECUTABLE` 用于在无头环境复现「内核装不上」。

Tooth Test：M16（headless 不可用却 healthy）→ `health-selftest` **exit≠0**，7 项失败点名「H2 Collect Summary…headless_unavailable」；`headlessReady` 写死后同样红（T23 独立复验）。`health-selftest` 72/0。

**DOCUMENTED 残留**：直接手改**已落盘**的 `scripts/data/source-health.json`（含 dist 副本）标成 healthy 时，28 道门禁 0 红。裁定为已接受残留：它是 `/status/` 的**运维观测产物**、不是真值层，判定链（evaluate + 合成夹具）本身有守卫；按 Prompt §26 不为它新增交叉断言。

---

## 11. API Pricing Guardrails

### Input / Output

`P1-7`：来源层把 input 与 output 的证据字段**错绑**（output 的价格引用 input 的来源）。修法：证据字段域**追加式**扩展 `models.<key>[.<variant>]`（旧形态 `models.<key>` 的位置与语义逐字保持，否则存量引文会整体漂移），并进 B2 判据 —— 错绑在 `validate` 与 `rebuild-api-plans` **写盘前**就被拒。

### Unit

`P1-8`（`F-r2-api-004`）：per 1M 的证据被写进 per 1K 的单位口径。B3 判据把「证据里的数量级」与「声明的单位」对账；`P2-20` 把「全仓没有单位换算路径」的结构性断言**扩大检测面**（原先只扫一个文件），并对「在非显眼文件里引入换算路径」做了变异证明。

### Other Billing Dimensions

`P1-10`：「其他计价维度」（cache / 批量 / OFF-PEAK 等）只在自由文本里，无法对账。现在这些维度有结构化位置与逐格渲染，且 OFF-PEAK 的单位出处补进数据（deepseek 记录，走来源层 → rebuild）。

### Credits

`P1-9`：`credits`（钱）与 token 数量在结构上可能混用。现在结构上写不进 token 数量、页面上也不折算；生产 13 条记录的 `credits` 全部为 `null`（13/13），「有值必是钱」这条不变式没有被本轮改动削弱。

### Evidence Binding

`P1-7`…`P1-10` 的守卫全部落在**证据绑定**这一层：每条计价声明必须能指回一张可核对的引文，且引文的字段位置要与被绑定的维度一致（B1 存在性 / B2 字段对齐 / B3 数量级）。

**必须如实保留的边界**：受「每条记录最多 3 条引文」的**预算上限**约束，逐维度的证据绑定**无法覆盖全部 66 / 67 个计价条目的每一个维度** —— 实际达到的是 **26 个模型级绑定 + 24 组 input/output 顺序对**。因此**不得**把这层写成「input/output 已逐条证据绑定」；已写进 `NEXT-STEPS` 的剩余风险条目。

---

## 12. unknown 三态

`P2-12`（`F-mutation-006`）+ Prompt §10.4：`unknown` 与 `false` 都是合法字面量 ⇒ **只看类型看不出降级**。审计的变异（来源层 `true → "unknown"` 并重建）当时全绿。

判据改为**取值与自己的记述同向**（`plan-schema.restrictionWitnessProblems`，唯一实现）：

| 取值 | 要求 |
|---|---|
| `false` | 必须给**官方否定表述**（翻成 false 却没换记述 ⇒ 当场红） |
| `"unknown"` | 必须写「查过但来源没说明」 |
| `true` / 数值 / 文本 | 不要求见证（不改变「不需要三态」的语义） |

配套：缺 `value` 的报错文案明写「缺字段不得被当成 false」；渲染（unknown → 未确认、false → 否、缺席不印）与派生指标（四种未知额度严格 `null`）各有常驻牙；API 侧 `freeTier.conversionDependsOnModel` 的 `true/false/null` 契约（**缺失与显式 null 都落 null**，绝不落 false）。

变异（沙箱，无 `git checkout`）：m1 `unknown → false`（note 不动）⇒ validate / rebuild / reproducibility / selftest **全 exit≠0**；m2 删 `value` ⇒ 红；m3 伪造派生（schema 会放行）⇒ 新增的**独立**来源层 ↔ 派生对账红；m4 削弱 `stability` 必填 ⇒ `api-plans-selftest` 红。牙：`unknown` 走完整 rebuild 后仍是 `unknown`，产物页印「公平使用：未确认」。

数据零改动：生产 `false` / `unknown` 实例均为 0 ⇒ 新规则**零触发面**，没有为凑绿改数据。

---

## 13. AI Candidate → Production Isolation

### generation

`P2-14`：AI 生成物的输出路径不受约束。现在 `assertAiOutputPath()` 把**输出路径白名单**做进写盘路径本身（`scripts/ai/cache.js`），`--out=deals.json` 这类调用直接 exit≠0，而不是事后检查。

### candidate

候选信封只能落在候选区；「生成侧隐式 accept」被禁止（`writeCandidates(cause=generation)` 拒绝隐式接受）。

### accept/apply

`P1-1`：accept 判定原先只有一行行内 filter，把它改成恒真后 `ai-selftest` 37/37 与 `validate --strict` **全绿** —— 这正是审计 20 条变异里**唯一没被任何门禁抓住**的 M17。现在 `acceptedOf()` 是唯一红线判据，`productionTruthEnvelopes()` 供下游复用（不再各写一份），`ai-accept.js` 的显式 accept 仍然要过 validator。

### validator

显式 accept / apply 之后仍必须通过 `validate --strict`，候选直接把信封放进生产真值会被 strict 拦下。

### path allowlist

输出路径白名单 + 候选区隔离 + 真值层写盘断言三层叠加。`ai-selftest` 37 → **63 项**（含 8e/8i/8k 三支牙）。变异复跑：AI 直写生产真值 / 候选信封进真值 / 生成侧隐式 accept / M17 恒真判定 **全部 exit≠0**，其余 27 道门禁保持绿。

---

## 14. Production Gate Fail-Closed

### allow_degraded_run

修复前：`allow_degraded_run` **没有任何断言**（把值改成 `'true'` 仍然 36/36 全绿）。修复后：按**事件**真求值 + **真实执行**判定 shell。

| workflow / 事件 | 解析值 |
|---|---|
| verify.yml @ PR / push / dispatch（默认） | `false` |
| verify.yml @ dispatch（显式勾选） | `true` |
| collect.yml @ schedule / 默认 | `false` |
| deploy.yml @ push / workflow_run / dispatch（默认与显式） | **全 false** |

判定 shell 行为矩阵（真实执行）：浏览器不可用 + `{false, 空, TRUE, yes}` → **exit 1 / mode=none / ::error**；浏览器不可用 + **逐字 `'true'`** → exit 0 / mode=degraded / `::warning` + Summary 明写「没有做真浏览器验收」；浏览器可用 → exit 0 / mode=full。

### browser unavailable

「浏览器不可用」的判死写在**步骤内**而不是 job 级 `if` —— job 级一旦跳过，该检查会报 Success（没跑却算过），对门禁而言这是最坏形态。

### artifact missing

**这是本轮最重的一条**：六个产物依赖步骤原先排在 `Assemble site` **之前**，而 CI 的干净检出里 `dist/` 不存在（gitignore）⇒ 这五节的断言在 CI 里**一次都没跑过**，全部走「缺产物 ⇒ 跳过并计 ✓」出口；同一份代码在本地与 CI 项数不同。

修复后：移到构建之后（第 31–35 步）、全部显式 `--dir=dist`，缺产物一律**非 0**，只有本地诊断才加 `--allow-missing-dist`（打印 OPTIONAL DIAGNOSTIC）。实测：

| 场景 | 结果 |
|---|---|
| 空产物目录 | **6/6 exit≠0**（archive / data-docs / models-page / planshub / vendor selftest + check-feeds-reproducible） |
| 加 `--allow-missing-dist` | 6/6 exit 0，且都带 `⚠️ OPTIONAL DIAGNOSTIC` 标注（68/53/53/29/57 项） |
| 真实产物 | 6/6 exit 0 |

### required verify

`F-gate-001`：原先只冻结步骤**名**（把 `run` 换成 `echo skipped` 仍然全绿）。现在冻结**逐步骤规范化 run 体指纹**（先剥注释）+ 步骤级 `if` 冻结 + action 内禁止 `continue-on-error` 键。9 个变异（verify-degraded / collect-degraded / deploy-degraded / empty-step-seo / empty-step-browser / continue-on-error / if:false / drop-dir / 拿掉 Assemble site）**全部 exit=1**，且**逐字节还原**（sha256 相同）。注释与空行不误报；改名、`--dir` 语义变化、`continue-on-error` 必红（T23 独立复验）。

顺带修掉 `check-ci-consistency` 读取器一个真缺陷：`workflow_dispatch:   # 注释` 这种父键原先不被压栈（collect.yml 中招，`inputs` 被错挂到 `on:` 下）。`--expect-checks=36` 口径下 **36/0**，断言名与总数一条未动，44 步名字集合不变。

---

## 15. Registry Coverage

| 指标 | 值 |
|---|---|
| registry 模型 / 模型页 | 44 / 44 |
| 显式映射 | 64（API 55 + Coding 9） |
| 缺口声明（`scripts/data/model-registry-gaps.json` 的 `declarations`） | 10 |
| coverage-report 自检 | 0 处问题 |
| vendor 统一资料页 | 19 |

---

## 16. Dataset Manifest

`P2-25`（Prompt §10.7）：原先 Manifest、构建拷贝清单、Data Docs、自测**各持一份硬编码清单**，「新增公开数据集但漏登记 Manifest」没有任何交叉判据。

修复：`PUBLIC_DATASETS`（**9 份**）成为唯一注册表，Manifest（`buildManifestFromRegistry`）、构建拷贝（`PUBLIC_FILES` / `GENERATED_FILES` ← `datasetCopyUrls` / `datasetGeneratedUrls`）、Data Docs、Dataset verify **全部从这一份派生**；方向 2 在**构建期与自测两面**扫描产物全树 JSON，逐个要求被认领，未认领即红。排除规则显式四态：

1. Manifest 自身；
2. Feed 家族（`feed.xml|feed.json|feed/**`，与真实产出清单**双向对账**，归属 `lib/feeds.js`）；
3. `INTERNAL_ARTIFACTS`（`source-health.json` 逐条带 reason + owner + documentedAt，写明是 `/status/` 的运维观测产物）；
4. 其余按公开数据集候选 —— 未认领即红。过期豁免与「扫描输入为空」同样红。

现场口径（**队长与 verifier 各自独立数过，逐项一致**）：Manifest 登记 **9** 份数据集；dist 全树 JSON **36** = 根级 **11** + `data/index.json`（Manifest 自身）**1** + `feed/` **24**。

变异：构建期多写一份公开 JSON → **build exit 1** 并点名文件与两条出路，撤销后 sha256 `0E9159AF…B5B6` 与打补丁前**逐字节相同**；验证面沙箱 dist 加一份未登记 JSON → `data-docs-selftest --dir` **56/1 exit≠0**，删除后 57/0。

---

## 17. Feeds

`P3-4`（`F-r1-ui-001`）：`/feeds/` 汇总页按页内硬编码分组渲染，**漏列 5 个分类 Feed（10 个文件）**。

修复：页面分组由 Feed Registry 现算派生（`pageGroups()`），并把两条方向的断言做成常驻：文件 → 页面必须全覆盖、页面 → 文件必须存在。

| 指标 | before | after |
|---|---|---|
| `/feeds/` 列出的订阅地址 | 40 | **48**（唯一） |
| 其中分类 Feed 地址 | 0 | 10 |
| 文件 → 页面未覆盖 | 10 | **0** |
| 页面 → 文件缺文件 | 0 | **0** |
| Feed 文件总数 | 50（含其它口径） | **48** = 24 份 × 2 种格式 |

口径说明（可复现；队长与 verifier 各自重算一致）：`dist/feed/` 递归 **48** 个文件（24 JSON + 24 XML）；`/feeds/` 页内 `/feed/` 子订阅唯一地址 **48**，另有站点根的两个 Feed（`feed.xml` / `feed.json`，相对与绝对两种写法）以及 2 条 `rel="alternate"`。此前流传的「40 → 50」是把这 2 条 alternate 一并计入所致，本报告统一采用可复现的 **24 份 / 48 文件 / 48 地址**。

**§13 红线未触碰**：`/feed/api.xml`、`/feed/coding.xml` **始终不存在**，未新增任何 Feed 家族。`check-feeds-reproducible --dir=dist` 0（两次构建逐字节一致）、`feeds-selftest` **131/0**。

---

## 18. Deal Source Revalidation

交付物：`source-revalidation.md`（27699 B · sha256 `882fe7b4c6564da2e2f2682751598b77bbc4886c91bec30520d4ee75a035a16d`）。

Prompt §12 的 4 条 Deal 来源复核 + §16 的 API 计价抽样结果：**0 条 `CONFIRMED_ENDED`、0 处生命周期改动**。

| # | 对象 | 结论 | 处置 |
|---|---|---|---|
| 1 | 智谱「邀请好友」活动口径 | 证据不足以证明已结束 | 不动 active/ended、不产生事件 |
| 2 | 智谱第二条 Deal 的活动口径 | 同上 | 同上 |
| 3 | 火山 Seedream「50 张」缺引文 | 缺可引用的官方引文 | 不改数据；记为证据不足 |
| 4 | 海螺会员无法复核 | 复核不了 | 不改数据；如实记录 |

另两条与 API 侧相关的复核：

- **anthropic 官方价页面迁移**：`docs.anthropic.com` 与 `platform.claude.com`（→ `claude.com`）**都在** `providers.json` 的 anthropic 登记域内，域白名单会放行 —— 这是**内容/来源新鲜度**问题，不是域守卫能覆盖的。裁定：**不改生产数据**（新 URL 无法确认为官方**定价**页），只记剩余风险；若将来改，只许改 URL 与域登记，不许改任何价格、不许改既有 evidence 引文及其 `capturedAt`/`sourceUrl`。
- **tencent 混元「逐步迁移至 TokenHub」公告**：是**来源迁移风险**，不是事实错误（本轮价格逐项一致）——**不得**写成「已失效」，记入 `NEXT-STEPS` 的长期方向/剩余风险。

**证据边界（必须原样保留，不得改写）**：`F-r1-history-ai-001` 只有源码级证据；`F-online-008` 仍然 `UNVERIFIED`；§16 里如实记录的「读不到」（google 网络层 fetch failed ×2、openai Cloudflare 403、volcengine/zhipu/aliyun 中文定价页是 JS 壳、aliyun off_peak 无可读官方页）**保持原样**，不得改写成「已核对一致」或「未发现问题」。

---

## 19. Mutation Battery

交付物：`MUTATION_RESULTS.md`（21564 B · sha256 `c28eaecdbf0c7060be461c3c507bcd24aef588be9569db38b921d2d6efbfb474`）。共 **21 例** = 1 例绿对照 + Prompt §21 的 18 条 + 审计 M17 + 1 条自设计。**21/21 恢复 BYTE-EXACT**；固定门禁集合（28 道）逐例一致，另有 4 例附带自写浏览器门禁。

| # | mutation | expected → actual | exit |
|---|---|---|---|
| M00 | 对照（未变异） | GREEN as expected | 0 |
| 1 | source identity → 两个模型 | 9 道红（validate-strict / check-models-reproducible / rebuild-models 拒绝写盘…） | ≠0 |
| 2 | 多变体页少一行 | models-page-selftest「§17 独立 join missing:1」+ 自写 join | ≠0 |
| 3 | Changes 非空历史 | 要求面 PASS：build / seo-verify / join / 浏览器 / 三支历史门禁全 0 | 0 |
| 4 | Archive 非空历史 | 要求面 PASS：内链 / 资产 / 详情页断言全绿 | 0 |
| 5 | 第三方 evidence 标 official | verify-strict + rebuild 拒绝写盘（两道防线分别记录） | ≠0 |
| 6 | new-user credit 标 stable | validate-strict + rebuild-api-plans | ≠0 |
| 7 | input/output 字段错绑 | B2 生效 | ≠0 |
| 8 | per1M evidence vs per1K | B3 生效 | ≠0 |
| 9 | unknown → false | validate-strict「无法对账三态」+ plans-selftest + rebuild-plans | ≠0 |
| 10 | AI `--out=deals.json` | CLI exit 1，deals.json sha 未变 | ≠0 |
| 11 | 候选信封进真值 | 11 道红 | ≠0 |
| 12 | 生成侧隐式 accept | writeCandidates(cause=generation) exit 1 | ≠0 |
| 13 | 少一条 mapping/gap | 9 道红 | ≠0 |
| 14 | duplicate registry slug | 6 道红（含 validate「顶层键重复出现」） | ≠0 |
| 15 | 新增 dataset 漏登记 Manifest | data-docs-selftest | ≠0 |
| 16 | headless 不可用却 healthy | health-selftest 7 项失败 | ≠0 |
| 17 | gate `allow_degraded_run=true` | check-ci-consistency（verify.yml @ pull_request 解析成 true） | ≠0 |
| 18 | required dist 缺失 | 6/6 产物工具 exit 1；`--allow-missing-dist` 对照 exit 0 | ≠0 |
| + | 审计 M17（accept 判定恒真） | ai-selftest 牙 8e/8i/8k 三红（其余 27 道全绿） | ≠0 |
| + | 自设计 M19（渲染层数值错位，行身份/行数不变） | **原先 28 道全绿** → 补 T25 后 models-page-selftest 判红并点名到格 | ≠0 |

**NOT_CAUGHT 清单（如实）**：

- **N1**：直接篡改已落盘的 `scripts/data/source-health.json`（含 dist 副本）标成 healthy → 28 道 0 红。裁定 **DOCUMENTED**（见 §10）。
- **N2**：模型详情页逐格数值无覆盖（M19 原先只有 verifier 自写的独立 join 抓到）→ **已修复**：新增常驻逐格数值对账（§4 / §5），61 → **75** 项、536 格 0 豁免，三条变异（数值对调 / 置空 / M19 原形）全部判红并**点名到 `(planId, modelKey, variant)` 与具体格**。关键对照：同一 M19 形状下 `validate --strict`、`check-models-reproducible`、`models-selftest`、`links-check`、`coverage-report` **仍全绿** —— 证明补的正是缺失的那一层。
- **F-T20-1（P3）**：`archive-selftest` 5 项 / `feeds-selftest` 1 项**空态牙**在非空历史现场失真（产品链 build / seo-verify / verify-site 全绿）。裁定 **DOCUMENTED**（已知限制，不改判据也不为它新增断言）。

T23 另对七类抽样（P0 / input-output / unit / AI `--out` / Manifest / artifact missing / degraded）独立复跑：**七类全 CAUGHT**。

---

## 20. Full Gate

按 `.github/actions/gate/action.yml`（44 步口径）忠实执行：`npm ci` + 从 action.yml 抽出的 **40 个 node 步骤**，浏览器判定为 **mode=full**（Edge 真实执行，**未使用 degraded**）。

```
total = 41   nonzero = 0
```

关键读数：

| 步骤 | 结果 |
|---|---|
| `validate --strict` | 0 |
| `check-reproducible` / `history-verify` / `migrate-audience-verify` | 0 / 0 / 15-15 |
| `zh-todo --check` / `zh-selftest` | 0 / 15-0 |
| `expiry` / `text` / `health` / `provenance` / `history` / `changes` / `feeds` / `seo` / `audience` / `app-token` / `ai` / `fixture` | 94 / 46 / 72 / 114 / 61 / 101 / 131 / 63 / 191 / 67 / 63 / 4 项，全 0 失败 |
| `plans-selftest` | **264/0** |
| `plan-history` / `deal-plan-links` / `api-plans-selftest` | 132/0 · 80/0 · **175/0** |
| `check-api-plans-reproducible` / `check-api-plan-history` | 0 / 0 |
| `models-selftest` / `check-models-reproducible` / `links-check` / `coverage-report` | 90/0 · 0 · 0 · 0 处问题 |
| `build-local`（与 deploy.yml 同一条路径） | 0，`dist/` 就位 |
| 六个产物依赖步骤（`--dir=dist`） | models-page **75/0** · planshub 32/0 · vendor 52/0 · archive 69/0 · data-docs 57/0 · feeds-reproducible 0 |
| `check-plans-reproducible` / `check-plan-history` | 0 / 0 |
| `seo-verify`（独立，从 dist 反推） | 11/0 |
| **`verify-site`（真浏览器）** | **703 项 0 失败** |
| **回归比对（冻结基线）** | **709 项 0 失败** |
| `check-ci-consistency --expect-checks=36`（verify.yml 侧） | **36/0** |

T23 在提交态独立重跑 **39/40 node 步骤 + 回归比对，全部 exit 0**（唯一未跑 `npm ci`），与队长自述**逐条吻合、0 处不一致**。

产物规模：`dist/` **290** 个文件（HTML **173** / XML 26 / JSON 36），`sitemap.xml` **170** 条。

---

## 21. Online Smoke

**已运行（2026-10-04，用户明确授权「推送上线」之后）。**

收口轮内未运行；推送上线后按下述路径执行，并全部通过：

| 步骤 | 结果 |
|---|---|
| PR #32（`quality-closure-post-audit` → `master`） | 分支 `gate` 检查：run 37171970378 · **success**（2m42s） |
| 合并 | merge commit `ba0e0f23710b4a191230da0313ae166cb139f6cb` |
| master `Verify site (gate)`（push 触发） | run 37172126751 · **success**（2m44s） |
| master `Deploy to GitHub Pages`（push 触发，先跑 prepublish 全套门禁） | run 37172126798 · **success**（4m44s，`prepublish` → `build` → `deploy` 三段全绿） |
| Pages 站点 | `https://buguoshixc.github.io/ai-deals-aggregator/`（`status=built` · `build_type=workflow`） |
| **线上冒烟** `node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/` | **703 项 0 失败**（真浏览器，逐条 HTTP 200 快照） |

线上内容抽查（部署后对线上站点直接取回）：

| 检查 | 结果 |
|---|---|
| 首页 / `/feeds/` / `/models/glm-4.5v/` / `/plans/api/` / `/docs/data/` / `sitemap.xml` / `data/index.json` | 全部 **200** |
| `/feeds/` 列出的订阅地址 | **48**（= 本地口径 24 份 × 2） |
| `/models/glm-4.5v/` 计价行 | **2 行**（`data-variant` = `standard` / `long_context`）—— 多变体修复线上生效 |
| `/plans/api/` | 明确标注 per 1M，未出现单位混用 |
| `sitemap.xml` | **170** 条 |
| `data/index.json`（Manifest） | **9** 份数据集 |
| `/feed/api.xml` | **404**（§13 红线：该 Feed 不得存在） |

### 顺带发现（**合并前就存在**，不属于本轮改动）

`master` 上的计划采集自 **2026-10-03 15:47Z** 起连续失败：`Collect AI Deals` run 37134505706 在 gate 步骤 exit 1，直接原因是构建自检
`✗ SEO[itemlist-arity] changes/：ItemList 声明 1 项，但 itemListElement 只有 0 项` —— **正是本轮修复的 P1-4（`/changes/` 非空路径）**，采集侧一产生历史事件就把构建打红，进而 `dist/deals.json` 不存在、job 失败，并由 `workflow_run` 连累那次 deploy 也失败（run 37134604743，11s，按设计「上游采集未通过 → 拒绝发布」）。

本轮的 P1-4 修复（合成非空历史端到端夹具 + itemlist 判据收口）针对的就是这条路径；**但真实采集链路上的确认需要再跑一次 `Collect AI Deals`**（该 workflow 会写入并推送数据，属独立授权范围，本轮未触发）。

---

## 22. Data Integrity

### before / after

| 层 | before（`21cf66d`） | after（`3edb9cf`） | 变化 |
|---|---|---|---|
| Deals | 134 条 · `3ba148dbc640` | 134 条 · `3ba148dbc640` | **逐字节未变** |
| Plans | 23 条 · `a72c91efea82` | 23 条 · `a72c91efea82` | **逐字节未变** |
| API 记录 / 计价条目 / 平台 | 13 / 67 / 10 | 13 / 67 / 10 | 记录与条目数不变 |
| API 字段 | — | — | 4 条 `freeTier.stability` + 1 条 `pricing.unitNote`（deepseek，OFF-PEAK 出处） |
| Models | 44 · `8fa85b1d0547` | 44 · `8fa85b1d0547` | **逐字节未变** |
| Registry links | 64（55+9）· `fd2336c86d07` | 64（55+9）· `fd2336c86d07` | **逐字节未变** |
| History（deal / plan / api-plan） | 0/14/6 事件 | 0/14/6 事件 | 三份 history **逐字节未变** |
| Source health / snapshots / zh-pending | — | — | **逐字节未变** |

`api-plans.json` 的改动量：`git diff --numstat 21cf66d..HEAD -- api-plans.json` = **6+/2−**，来源层 `scripts/data/curated_api_plans.json` 同步改动 —— 全部走**来源层 → rebuild**，`check-api-plans-reproducible` 逐字节通过。

### 相对审计基准（`1c024db`）

`deals.json` 相对审计基准有差异，但那是**本轮之前** master 上已经发生的漂移；本轮独立复算：**id 134 → 134 · added 0 · removed 0**。

### 结论（判据 R）

- 不删历史（三份 history 逐字节未变、事件数不变）；
- 不改无关生产数据（9 份真值文件里 **8 份逐字节未变**）；
- 不动稳定 ID（deals id 增删 0/0）；
- 不大规模改旧记录（唯一改动的 api-plans 是 5 处字段级语义修正）；
- 不改真值契约（三份 reproducible 门禁 + 三份 history 门禁全 0）。

---

## 23. Docs Drift

§22 要求「代码与数据完全稳定后」再重算文档数字；本轮据此把文档同步排在最后一个 commit（`3edb9cf`）。改的 9 份文档全部在 in-scope 内，`research/audit/**` 一字节未改，历史快照类文档保留当时数字 + 时间/commit（明确标注【已过期】的段落不改写）。

| 文档 | 旧 → 新 |
|---|---|
| `README.md` | Feed 25 份 / 50 地址 → **24 份 / 48 地址**；P3-28 端点命名澄清（`/data/index.json` 是真实地址、`model-registry-gaps.json` 有意不发布，**未新增页面**） |
| `PROJECT_STATUS.md` | 映射 63 → **64**（API 55 + Coding 9；审计 P3-23「63/64 并存」按重算收口）；Feed 25 → **24** 份；模型 42 → **44**；freeTier 2 → **4** 条 |
| `NEXT-STEPS.md` | 新增四条剩余风险：anthropic URL 迁移只许改 URL+域登记 / tencent→TokenHub 不写「已失效」/ 历史层术语残留 DEFERRED / **引文预算上限（不得写成 input/output 已逐条证据绑定）** |
| `docs/SCHEMA-v3.0.md` | §2 层间口径改为「表反转」（改文档，不削弱代码）；basis 真实枚举；coverage 按展开条目计 |
| `docs/SCHEMA-v2.5.md` | §8 三档必填（`stability`） |
| `docs/AI-MAINTENANCE-v2.0.md` | 输出路径白名单 + accept 三条件 |
| `docs/v3.0/AGENT-REFERENCE.md` | 时效声明 + `/feeds/` 派生说明 + freeTier 4 条 + 数据现状 13/67/45/10 |
| `docs/v3.0/A4-HANDOFF-feed-pipeline.md` | 历史快照声明 + 两处【已过期】 |
| `research/v3.0-ai-deals-knowledge-base-report.md` | freeTier 4 条 |

文档侧验证：`build-local --out=dist.qc-docs` 0 · `check-ci --expect-checks=36` 36/0 · `validate --strict` 0 · `models-page-selftest` 75/0；**每个被改的数字都在重算输出里命中**，交付物无占位符。

---

## 24. Reclassified Audit Findings

原 99 条（104 个 finding ID）的最终各类别数量：

| 类别 | 条数 |
|---|---|
| FIXED | **10** |
| GUARDRAIL_ADDED | **19** |
| VERIFIED_NO_CHANGE | **8** |
| DESIGN_ACCEPTED | **10** |
| NOT_REQUIRED | **12** |
| DOC_FIXED | **18** |
| DEFERRED | **22** |
| ALREADY_FIXED | **0** |
| NO_LONGER_APPLICABLE | **0** |
| 合计 | **99** |

P0 × 1 全部落在 FIXED；P1 12 条 = FIXED 5 + GUARDRAIL_ADDED 7。逐条证据见 `RECLASSIFIED_FINDINGS.md` §4（37 条 ⚑ 收敛表）与 T23 的 `FINAL_REAUDIT.md`（FIXED 10 与 GUARDRAIL_ADDED 19 逐条有独立证据）。

**最终状态的用词纪律**：本轮的收口状态只用 `CLOSED / NOT_A_BUG / DEFERRED / ALREADY_FIXED / NO_LONGER_APPLICABLE`（见 `FINAL_REAUDIT.md`）；本报告不使用「大致修好」「应该没问题」「基本完成」。

---

## 25. Remaining Risks

1. **anthropic 官方价页面迁移**（来源新鲜度）：新 URL 无法确认为官方定价页，本轮不改数据。若改，只许改 URL 与域登记，不许改价格，不许改既有引文及其 `capturedAt`/`sourceUrl`。
2. **tencent 混元 → TokenHub 迁移公告**：来源迁移风险，不是事实错误，**不得**写成「已失效」。
3. **引文预算上限**：每条记录最多 3 条引文 ⇒ 逐维度证据绑定覆盖不到全部 67 个计价条目的每个维度（实际 26 个模型级绑定 + 24 组 input/output 顺序对）。**不得**声称「input/output 已逐条证据绑定」。
4. **§16 的「读不到」**：google（网络层 fetch failed ×2）、openai（Cloudflare 403）、volcengine/zhipu/aliyun 中文定价页（JS 壳）、aliyun off_peak（无可读官方页）—— 保持原样，不得改写成「已核对一致」。
5. **证据边界**：`F-r1-history-ai-001` 只有源码级证据；`F-online-008` 仍 `UNVERIFIED`。
6. **落盘观测产物可被篡改**（N1，DOCUMENTED）：手改 `scripts/data/source-health.json` 无门禁会红。它是 `/status/` 的运维观测产物、非真值层；判定链本身有守卫。
7. **空态牙在非空历史现场失真**（F-T20-1，P3，DOCUMENTED）：`archive-selftest` 5 项 / `feeds-selftest` 1 项；产品链全绿，故只记录不改判据。
8. **降级运行的覆盖面**：`/plans/api/` 的三列价格逐格对账**只在真浏览器门禁里**（`verify-site` 会点名行与三格）。这意味着 degraded 运行时该面无人守 —— 这是 `allow_degraded_run` 的**已知代价**，而判定步骤本身是 fail-closed 的（默认直接失败，只有人工逐字 `'true'` 才放行并明确标注「没有做真浏览器验收」）。
9. **生产零样本 ≠ 功能已验证**：Changes/Archive 的**非空历史**路径在生产上零样本（history 事件 deal 0、档案详情页 0），可用性由合成夹具证明。
10. **线上冒烟未运行**（§21）：本地全绿不能替代线上验证。
11. **CI runner ≠ 本地**：本轮的真浏览器验收用 Edge headless 执行；判定 shell 用 Git for Windows bash 真实执行；没有真实 GitHub Actions runner。合并/发布前应由 CI 在提交态把完整 40 步再跑一遍。
12. **术语残留（DEFERRED）**：历史层 / 档案页仍显示「原始出处」，当前不可达。

---

## 26. 是否适合继续开发新功能

1. **原审计唯一 P0 是否已经关闭？** 是。`F-v3-registry-002` **CLOSED**：判据换成 link 展开后的真实 identity 集合，原始形态被 8 道门禁判红且 `rebuild-models` 拒绝写盘；生产 0 duplicate / 0 multi-owner；三个独立 join（工具 + T18 自写 + T23 自写）一致。
2. **所有真实 P1 产品缺陷是否已经关闭？** 是。12 条 P1 **12/12 CLOSED**（FIXED 5：P1-4 / P1-5 / P1-6 / P1-11 / P1-12；GUARDRAIL_ADDED 7：P1-1 / P1-2 / P1-3 / P1-7 / P1-8 / P1-9 / P1-10）。
3. **哪些原 P1 被重新分类为 Guardrail / Design？** 7 条 P1 走 GUARDRAIL（上一条列出的七条；其中 P1-7…P1-10 是「证据绑定 + 单位 + 第 7/8 列」这一组，含 `P2-20` 的结构性断言扩容）；无 P1 被降级为 DESIGN。DESIGN_ACCEPTED 的 10 条全部来自原 P2/P3（数据语义差异类，理由逐条写在 `RECLASSIFIED_FINDINGS.md`）。
4. **Changes / Archive 是否已经证明非空路径真实可用？** 是（在合成非空历史上）：`/changes/` itemlist 与页面元素一致、套餐变化块成立；档案详情页 108/108 相对引用可解析；build / seo-verify / 真浏览器 / 三支历史门禁与订阅全绿。**但生产零样本**（第 9 条风险），不得据此声称生产已验证。
5. **Model Registry 是否还有身份完整性缺口？** 无已知缺口：44 页 / 67 行，missing / extra / duplicate / multi-owner 全 0；四个入口对重复顶层 slug 全红；「把判据写死」的回头变异三红。
6. **API Pricing 是否仍可能在来源层出现单位 / input-output 语义漂移而不被发现？** 不能（在本轮覆盖到的维度上）：input/output 错绑、per 1M ↔ per 1K、第三方页冒充官方、credits 与 token 混用、unknown ↔ false，全部在写盘前被拒（B1/B2/B3 + 三态见证 + 单位换算结构性断言）。**边界**：受 3 条引文预算限制，逐维度证据绑定覆盖不到全部 67 个条目的每一个维度（第 3 条风险），这一层不得被表述为「已逐条绑定」。
7. **AI generation 是否还有直接覆盖 production truth 的路径？** 无已知路径：输出路径白名单在写盘路径上生效，`--out=deals.json` 直接 exit≠0；候选信封进真值被 strict 拦下。
8. **candidate 是否可能绕过 explicit accept？** 不能：`acceptedOf()` 是唯一红线判据，生成侧不允许隐式 accept；M17（把 accept 判定改成恒真）现在会被 `ai-selftest` 抓住。
9. **Source Health 的 headless failure 是否真实接入？** 是。判定顺序修正后 `headless_unavailable` 在真实接线路径可达，Collect Summary / `source-health.json` / `/status/` 三处一致；M16 与「写死 `headlessReady`」两种变异都红。
10. **production Gate 是否还可能静默 degraded？** 不能。默认 fail-closed；只有人工 `workflow_dispatch` 且 `allow_degraded_run` 逐字 `'true'` 才放行，且必定在 Summary 与注解里写明「本次没有做真浏览器验收」；deploy 路径恒 false。
11. **required artifact 缺失是否仍可能假绿？** 不能。六步 6/6 exit≠0；唯一出口是显式 `--allow-missing-dist`，会打印 OPTIONAL DIAGNOSTIC。附带修掉了「五节在 CI 里从未跑过」这个更严重的问题。
12. **4 条 Deal source revalidation 最终结果分别是什么？** 全部**不改数据**：智谱两条证据不足、火山 Seedream 缺引文、海螺会员无法复核 → 0 条 `CONFIRMED_ENDED`、0 处生命周期改动（§18）。另：anthropic 官方价页迁移记为来源新鲜度风险（不改数据），tencent → TokenHub 不写「已失效」。
13. **文档是否已经与当前代码 / 数据重新同步？** 是。9 份文档按当前 HEAD 重算同步（§23），历史快照保留原值；`research/audit/**` 未改。剩余未同步项只有第 12 条风险里的历史层术语（DEFERRED，当前不可达）。
14. **当前最新 master 是否适合进入下一轮功能开发？** 见下。

### 判断依据

| 条件 | 结果 |
|---|---|
| 真正 Blocker 全部关闭 | ✅ 原 P0 CLOSED，12/12 P1 CLOSED |
| 指定高价值 Guardrail 完成 | ✅ 19/19（含 T25 新增的逐格数值对账） |
| 完整 Gate 全绿 | ✅ 41/41（npm ci + 40 步，mode=full）；T23 独立重跑 39/40 + 回归比对全 0 |
| 精简 Re-audit 无新增 P0/P1 | ✅ 新增 P0/P1 = **0**（`FINAL_REAUDIT.md`） |

```text
适合继续开发新功能
```

**原保留条件（两条）均已在 2026-10-04 满足**：

1. CI 在提交态重跑完整门禁 —— 已满足：PR #32 的分支 `gate`（run 37171970378）、`master` 的 `Verify site (gate)`（run 37172126751）、以及发布链自己的 `prepublish`（同一 gate action，`allow_degraded_run='false'`，run 37172126798）**三段全绿**；
2. 线上冒烟 —— 已满足：部署后 `verify-site.js --url=` 对线上站点 **703 项 0 失败**（§21）。

**仍未覆盖的一件事**：真实采集链路的确认（`Collect AI Deals` 自 2026-10-03 起因本轮修复的 P1-4 失败，需要再跑一次该 workflow 才能确认修复在采集现场生效）。它写入并推送生产数据，属独立授权范围，本轮未触发。

---

## 附：本轮交付物清单（`research/quality-closure/`）

| 文件 | 大小 | sha256 |
|---|---|---|
| `BASELINE.md` | 69771 B | `948489d87b7bee135e4c59c03a3964549e8fb57c5a3cf59eece15a9980be12ba` |
| `FINDING_STATUS_BEFORE.md` | 40723 B | `5ac7e1de478071908bcc44a3ed3a9daad8e6585d723434c169ff81cbfb50a931` |
| `RECLASSIFIED_FINDINGS.md` | 60247 B | `3744ff395217e34f0b61c77236fd1d3279cdb7008160dcc1cd0cbfb593af881e` |
| `source-revalidation.md` | 27699 B | `882fe7b4c6564da2e2f2682751598b77bbc4886c91bec30520d4ee75a035a16d` |
| `FIXED_FINDINGS.md` | 22378 B | `903eba86106d287fa09a16dec49572864931ba178d02aedaf71a5c66929af955` |
| `MUTATION_RESULTS.md` | 21564 B | `c28eaecdbf0c7060be461c3c507bcd24aef588be9569db38b921d2d6efbfb474` |
| `FINAL_REAUDIT.md` | 25964 B | `764cdc02942dbd3038e64e271d3f1fea19b8ed2003a2cfc9c34c23c19285e3a7` |
| `QUALITY_CLOSURE_REPORT.md` | 本文件 | — |
| `CAPTAIN-LEDGER.md` | 队长账本（T01–T25 + 基础设施事件 + 预检 + 裁定） | — |
| `verify-work/` `mutation-work/` `reauth-work/` | 独立判据脚本与 JSON 日志（T18/T20/T23） | — |
| `review-registry/` `T19-evidence-summary.md` | P0 评审证据 | — |

原审计证据 `research/audit/**` **一字节未改**，也**未入库**（按 Prompt §23 保持历史证据原样）。

本轮 `research/quality-closure/**` 交付物以单独提交入库；隔离产物目录（`dist.qc-*/`、`.qc-*/`）已在 `.gitignore` 中排除。
