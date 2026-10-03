# T19 · P0 实现独立评审 —— T05「registry 身份唯一性 + §10.6 完整性守卫」

- 评审对象：任务 t5（registry-engineer）· 交付描述「同一 source pricing identity 可归属两个 registry 模型」已关闭
- 评审人：verifier（t19，attempt 1 / attempt_id `ffe0b9e6-c246-4ba8-91a8-d71ac6cb4d85`）
- 评审时点：2026-10-03
- 评审方式：**不看作者结论**。自己在隔离副本里重建夹具、重建期望、重跑变异、重跑全部门禁
- 工作副本（与共享 worktree 完全隔离，来源层/产物改动只落在这里）：
  - 金样本：`D:\qc-t19\wt`（共享 worktree 的整树副本 + 在副本内 `rebuild-*` 复算派生物）
  - 变异副本：`D:\qc-t19\run\<case>`（每个 case 一份独立副本，改完即用即弃；共享 worktree 只读不写）
- 被评审代码锚点：`scripts/lib/model-registry.js` · `scripts/tools/check-model-registry-links.js` · `scripts/tools/models-selftest.js` · `scripts/validate.js`（调用点）

### 评审期间观测到的并发漂移（已复检，不影响结论）

评审进行中，另一个任务改动了 `api-plans.json` 与它的来源层 `scripts/data/curated_api_plans.json`
（`git diff`：4 条记录的 `freeTier` 各加一个 `stability` 字段 + 一条 `description` 扩写，共 6 行）。
我已复检：**计价身份集合一字未动** —— 13 条记录 / **67 条计价条目** / 新增 0 / 消失 0 / 55 个互异 `(planId, modelKey)` 组；
网关涉及的两份文件 `scripts/data/model-registry-links.json`（`3594e4da…`）与 `scripts/data/models.json`（`05b72c2d…`）
以及两份仓根产物在这段时间里**没有被改动**（哈希与我的推演一致）。
并在**含该并发改动的 live 状态**上重跑四道路径级门禁：`check-model-registry-links`=0 · `validate.js --strict`=0 ·
`models-selftest`=0（88 项）· `check-models-reproducible`=0（44 模型 / 64 映射 / 计价条目 67 = 认领 67 + 未认领 0）。
⇒ 本报告的结论对 live 状态同样成立；引用本报告的行号时请以 §1 的锚点为准（工作副本 = 共享树 + 我的沙箱复算）。

## 0. 结论（submitted verdict = pass；给下游的注记见本节的「诚实注记」）

**P0 真关闭，不是打补丁。**

1. 实现把唯一性判据从「三元组字面量键」换成「**link 展开后的真实 identity 集合**」
   （`apiPlanId, modelKey, 记录内真实 variant`），并且这个判据只有一处实现（`sourcePricingIdentitiesOf`）。
   我用**自己造的夹具**（不看作者那条牙的任何期望字符串）重建了 §8 牙，全部按语义成立（§3.2）。
2. 审计 P0 的原始形态——**在 `scripts/data/model-registry-links.json` 里按生产规范序合法追加一条
   通配 / 显式映射，把同一条计价记录指向第二个 registry 模型**——在 17 道门禁里被 8 道判红
   （含 `validate.js --strict` exit 1、`check-models-reproducible` exit 1、`check-model-registry-links` exit 1、
   `models-selftest` exit 1），且 `rebuild-models.js` **exit 1 拒绝写盘**（§3.1）。
   **不存在「11 道生产门禁全放行」的复现路径。**
3. 生产数据逐字节未动：5 份文件哈希与 T05 交付所报前缀逐一吻合，其中 3 份同时命中 T01 BASELINE 冻结值（§2）。
4. coverage 记账没有被展开语义带偏：我用**自己的遍历**从 `api-plans.json` 推出 67 条计价条目、
   67 条被认领、0 条未认领、55 条通配映射（12 组多变体 / 43 组单变体 / 0 组空展开），
   与实现读数逐项相等（§3.3）。
5. §10.6 两侧同级：API 侧完整性挂在 `validateLinks()` 内（删一条映射 `check-model-registry-links` 自己 exit≠0，
   不再靠自测替它红），与 Coding 侧 `validatePlanModelCoverage()` 同一原则；两侧都由我自己造的夹具证明会红（§3.2 ③、§3.4）。
6. 没有字符串相似度自动 merge：`scripts/lib/model-registry.js` 全文无 `levenshtein|similarit|dice|jaro`、
   无 `writeFileSync|createWriteStream`；唯一的 `dice()` 在 `scripts/ai/dedup.js`（AI 候选层，与身份层不在一条链上）。

**唯一实质性缺口（不改变 P0 结论，建议顺手补一行）**：`scripts/validate.js:966` 调
`modelRegistry.validateRegistry(...)` 时**没有把 `load()` 扫出来的 `duplicateKeys` 传进去** ——
于是「手写 `scripts/data/models.json` 重复顶层 slug 键」这一形态在 **`validate.js --strict`（主数据门禁）上是假绿**，
只有 `check-model-registry-links` 与 `models-selftest` 红（另加 `rebuild-models` 拒绝写盘）。
详情与最小修法见 §4 F-T19-1。

> **诚实注记（给下游/队长）**：本条 primary finding（F-T19-1，LOW）按 review 合同「needs_revision/reject 才会
> fail 任务」的语义**不构成阻塞**，因此我提交的 verdict 是 `pass`；但按本仓库自己的纪律
> 「一道门禁红的时候应该没有别的步骤替它红」，F-T19-1 是一处**真实的守卫不一致**（同一个形态：
> `validate.js --strict` 说绿、`check-model-registry-links` 说红）。若队长认为「守卫一致性」也属于
> 本次 P0 修复的验收面，请把 t19 视为 `needs_revision` 并把 F-T19-1 转成 registry-engineer 或
> gate-engineer 的一行修复（`duplicateKeys: modelsLoad.duplicateKeys`）。两种读法我都给出了证据，没有隐藏分歧。

## 1. 评审范围、方法与隔离纪律

| 项 | 做法 |
| --- | --- |
| 隔离 | 全部改动只发生在 `D:\qc-t19\`；共享 worktree 全程只读（未执行任何写命令）。**未使用** `git checkout/restore/stash`：变异与恢复一律文件级复制 |
| 基线可信 | 金样本自带 `dist/` 之外无派生物，先跑 `rebuild-api-plans / rebuild-plans / rebuild-models / rebuild-deals`，四条都报「与盘上逐字节一致 ⇒ 无需写盘」，证明副本的派生状态与共享 worktree 同构 |
| 不复用作者判据 | 期望集合由 `D:\qc-t19\wt\.qc-t19\identities.cjs` 自己遍历 `api-plans.json` + `scripts/data/model-registry-links.json` 原文推导；牙由 `.qc-t19/unit-teeth.cjs` 用自造小夹具重建；产物对账用 §17 独立工具（该工具本身不 require 任何被测模块） |
| 变异入口 | 一律改**来源层** `scripts/data/*.json`（门禁读的是它），并按生产规范序写回；`root-links-only` 专测「只改仓根产物」的假阴性形态 |
| 证据留存 | 每个 case 一份独立副本 + `.qc-t19/out/<case>.json`（含 stdout/stderr、exit code、耗时）+ `.qc-t19/fingerprints.json`（变异前后 7 份受控文件 sha256） |

## 2. 生产数据逐字节一致性（未改写）

评审时点实测 sha256（工作副本与共享 worktree 相同）：

| 文件 | sha256（评审实测） | 与 T05 所报前缀 | 与 T01 BASELINE | 判定 |
| --- | --- | --- | --- | --- |
| `scripts/data/model-registry-links.json` | `3594e4da5df5a3db4b864e19b95dc963a7003b234849ec92b940cf08d84a7b40` | `3594e4da…7b40` ✔ | 该文件不在 BASELINE 的 9 份清单内 | **未改写** |
| `scripts/data/models.json` | `05b72c2dcc8f642e61182d4439649ce68a50e5ac73c5b419a966b7784e9bff0e` | `05b72c2d…` ✔ | 同上 | **未改写** |
| `scripts/data/model-registry-gaps.json` | `1e89ba04c43a0daf950cb747a0413336bc89db3a32a9f2de2c95bf5a017a6e5c` | `1e89ba04…` ✔ | `1e89ba04…` ✔ 命中 | **未改写** |
| `models.json`（仓根派生物） | `8fa85b1d0547b7ed54b671711f6a10585c1753b440713a16d210dad6746ae95b` | `8fa85b1d…` ✔ | `8fa85b1d…` ✔ 命中 | **未改写** |
| `model-registry-links.json`（仓根派生物） | `fd2336c86d07645779efc55a9b3bf05bf1aa99c4193854e5afa9d6503d9d1a2e` | `fd2336c8…` ✔ | `fd2336c8…` ✔ 命中 | **未改写** |
| `api-plans.json` | `962fc9c4ef8bddd99d92819141f563bbb1f8febbe3779ff6cf87f8b36a81ee46` | — | ✔ 命中 | 未改写 |
| `plans.json` | `a72c91efea82b843141dfa9994f11a81ed38e2d2ca31c3c218fa31b15cb70938` | — | ✔ 命中 | 未改写 |

另有三项独立佐证：

- **55 条通配映射保持原样**：`scripts/data/model-registry-links.json` 的 API 映射 55/55 都是
  `variant: null`，显式 0 条；三元组字面量互异数 = 55（与 API 映射条数相等）。
- **链路同构**：仓根 `model-registry-links.json` 的 64 条 links 去掉注入的 `registryModelId` 后，
  与来源层逐字节同构（键序与值都相同），`count=64` 对角。
- **派生物是来源层的产物**：副本内 `rebuild-models` 复算 = 盘上两份产物逐字节一致。

## 3. 逐条核对（acceptance criterion → 证据）

### 3.1 P0 原始形态与四类变异的**独立复现**

全部在 `D:\qc-t19\run\<case>` 独立副本里改来源层。门禁集合 = 我按 `.github/actions/gate/action.yml`
整理的 17 条（11 条与注册表/数据直接相关 + join/构建等旁证）。

| case | 变异（改的是来源层） | 变异后受控文件 sha256 | 门禁结果（exit code） | 判定 |
| --- | --- | --- | --- | --- |
| `append-legal-wildcard` | 规范序追加 `{registrySlug:'glm-5.3', apiPlanId:'ebc4af9a71b6', modelKey:'qwen3-max', variant:null, basis:'explicit-mapping'}` —— **P0 原始形态**：同一条计价记录第二次归属另一个模型 | 来源层 `8831708c…3ed38f`（changed）；其余 6 份 SAME | **RED 8/17**：`validate:strict`(1) · `check:models:reproducible`(1) · `check:model-registry-links`(1) · `selftest:model-registry`(1，4 项失败) · `selftest:models`(1) · `registry-join-audit`(1，multi-owner>0) · `build-local`(1) · `check:feeds:reproducible`(1，构建链被阻断的连带) | **关闭** |
| `append-legal-wildcard`（第二步） | 承上再跑 `node scripts/tools/rebuild-models.js` | — | **exit=1，拒绝写盘**；仓根 links 仍 64 条、与来源层不一致（没有把坏输入写进产物） | **关闭** |
| `append-legal-explicit` | 同上但 `variant:'standard'`（只撞 67 条中的 1 条 identity） | 来源层同批变化 | **RED 3/3**：`validate:strict`(1) · `check:model-registry-links`(1) · `selftest:model-registry`(1) | **关闭** |
| `adjacent-explicit` | 追加 `variant:'long_context'`（既有通配已认领该变体，只撞 1 条） | — | `check-model-registry-links` **exit=1**：「`(ebc4af9a71b6, qwen3-max, long_context)` 已经映射到 glm-5.3」 | **关闭** |
| `remove-mapping` | 删掉 `claude-fable-5.1` 的 API 映射（审计 M09，不补声明） | — | **RED 3/3**：`check:model-registry-links` 自己 exit=1 并点名 `(4f8bae91f9f8, claude-fable-5.1, standard)`；`validate:strict`(1)；`selftest:model-registry`(1，9 项失败) | **§10.6 关闭** |
| `duplicate-slug-valid` | 在 `scripts/data/models.json` 重复写顶层键 `"glm-5.3"`，**第二条逐字段合法**（不引入「开发者不在名单」这类干扰判据） | 来源层 `e12d5f40…` 之外 CHANGED（本条 `models.json` 指纹见副本 `.qc-t19/fingerprints.json`），其余 SAME | `check:model-registry-links`(1，报「顶层键 "glm-5.3" 重复出现」) · `selftest:model-registry`(1) · **`validate:strict`(0，打印「✅ 校验通过（strict 模式）」，见 §4 F-T19-1）** | **部分（LOW，见 F-T19-1）** |
| `empty-registry` | 把 `scripts/data/models.json` 删成只剩 5 个 `_` 元信息键（0 个 slug） | 来源层 `e12d5f40e235ce486ca327c40936e29efdb8cbbc357231aaa17232327980e933` | **RED 5/5**：`validate:strict`(1，共 66 项，首条「Model Registry: models.json 里没有任何模型」) · `check:model-registry-links`(1) · `selftest:model-registry`(1) · `selftest:models`(1，页面自测 TypeError 崩) · `check:models:reproducible`(1) | **空输入不假绿 ✔** |
| `unresolved-wildcard` | 追加通配映射指向该记录里不存在的 `modelKey` | — | `check:model-registry-links`(1)：「通配映射…一条真实 variant 都没匹配到 —— 它什么都没认领，不许静默通过」+ `modelKey 不存在` | **关闭** |
| `root-links-only` | **只改仓根** `model-registry-links.json`（来源层一字不动）—— T02 提到的假阴性形态 | 仓根 links CHANGED；来源层 SAME | `validate:strict`(0) · `check:model-registry-links`(0) · `selftest:model-registry`(0) · **`check:models:reproducible`(1)**（"手改过产物，或改了来源层没重建"） | 与 T02 描述一致：手改产物由可重建性门禁接住 |
| 绿对照（未变异） | — | — | **17/17 GREEN**（含 `check:model-registry-links`、`selftest:model-registry`、`validate:strict`、`build-local`、`registry-join-audit`） | 对照成立 |

关键报文（原文摘录，均来自副本日志）：

```
# append-legal-wildcard · validate.js --strict
❌ 校验失败，共 2 项：
  - Model Registry 关系层: links[51] qwen3-max: source pricing identity (ebc4af9a71b6, qwen3-max, long_context)
    （记录 ebc4af9a71b6 · modelKey qwen3-max · variant long_context）已经映射到 glm-5.3
    —— 同一条价格记录不许映射到两个 registry 模型
  - Model Registry 关系层: links[51] qwen3-max: source pricing identity (ebc4af9a71b6, qwen3-max, standard)
    （…）已经映射到 glm-5.3 —— 同一条价格记录不许映射到两个 registry 模型

# append-legal-wildcard · models-selftest.js
❌ === v3.0 Model Registry 演练：84 项通过，4 项失败 ===
   - 真实的 model-registry-links.json 通过关系校验（65 条） —— …
   - 【Tooth 5】production：duplicate source pricing identity owner = 0 且 multi-owner = 0 —— duplicate=2 multi=2

# remove-mapping · check-model-registry-links.js
❌ Model Registry 关系层有 1 处硬问题：
  ✗ 未认领的计价条目（删掉一条映射就补回来；每一条都必须有结局）：
    · (4f8bae91f9f8, claude-fable-5.1, standard)
```

> 口径说明（与任务书措辞的差异，以实测为准）：`check-model-registry-links` 的**API 侧完整性**
> 判据在 `validateLinks()` 末尾（`scripts/lib/model-registry.js:761-777`），所以删映射时它自己就 exit≠0，
> 不再只靠 `models-selftest` 替它红 —— M09 的处置与 T05 自述一致。

### 3.2 身份定义是否真从当前 API schema 推导（而不是只对 null/standard 打补丁）

**用自造夹具重建**（`D:\qc-t19\wt\.qc-t19\unit-teeth.cjs`；夹具：`P1{ m×2: standard, long_context }`、
`P2{ n×1: standard }`、4 个孤 slug）。结果：

```
✓ variant:null 展开成记录内该 modelKey 的全部真实变体
✓ 显式 variant 只认领那一条
✓ 身份键里的 variant 是记录原文（键 = 'P1\0m\0long_context'，不含 (all)/standard 折叠）
✓ 通配指向记录里不存在的 modelKey ⇒ unresolved
✓ 通配（alpha）与显式 standard（beta）指向同一条计价记录 → 红
✓ 同一条显式 identity 分属两个 slug → 红
✓ 后写的通配只要碰到别人已认领的任一 variant → 红
✓ 认领集合不相交（standard ↔ long_context）分属两个 slug → 绿
✓ 同一 slug 的「通配 + 显式」冗余重复认领 → 红
✓ P2/n/standard 没有任何映射认领 → 红（API 侧完整性）
✓ 全部条目都有映射 → 绿
✓ 只认领一个变体（漏了 long_context）→ 红，且点名那条（不按整组算过）
✓ Coding 侧：一串既没映射也没声明 → 红（与 API 侧同一原则）
✓ 拿不到 duplicateKeys 时不平白报红 / 拿到时必红 / 原文扫描看得见 JSON.parse 看不见的第二条键
✓ 有 registry 表但关系层一条都没有 → 红（"没写"不是"干净"）
```

**这套判据不是针对 null/standard 的补丁**，三条独立证据：

1. 夹具里的变体名是 `standard` / `long_context`，判据没有任何一处出现这两个字面量的分支；
   `realVariantsOf()` 只读 `plan.models[].variant`（`scripts/lib/model-registry.js:157-171`）。
2. 我新增的 `long_context` 邻接变异（不是作者四条里的任何一条）同样被判红（§3.1 `adjacent-explicit`）。
3. 静态扫描：`scripts/lib/model-registry.js` 无相似度算法、无写盘路径；
   `models-selftest.js:163-168`、`models-page-selftest.js:549` 的静态牙在绿对照里都通过。

### 3.3 coverage 记账是否被展开语义带偏（自己的遍历）

`D:\qc-t19\wt\.qc-t19\identities.cjs`（**不 require 被测实现**，先自己推导再与实现读数对照）：

| 独立推导 | 实测 | 实现读数（对照项） |
| --- | --- | --- |
| 13 条记录 · **67 条计价条目** · 67 个互异条目键 | 67 | `coverage.apiPricingItems = 67` ✔ |
| 被认领 identity **67** 条 · 多 owner **0** | 67 / 0 | `coverage.mappedApiEntries = 67` ✔ |
| 未认领 **0** 条 | 0 | `coverage.unmappedModelKeys.length = 0` ✔ |
| API 映射 55 条（通配 55 / 显式 0）· Coding 9 条 · 合计 64 | 55 / 9 / 64 | `apiLinks=55` · `codingLinks=9` ✔ |
| 通配展开分布：多条 **12** 组 · 单条 **43** 组 · **空展开 0** 组 | 12 / 43 / 0 | 与 T01 §6 的「12 组多变体」一致 ✔ |
| 三元组字面量（null 原样）互异数 55 = API 映射条数 | 55 | 说明显式/通配在该键下不重复 |

结论：**通配只为它真实展开到的条目负责**（55 条映射 → 67 条被认领条目），没有「按 (planId, modelKey)
整组算过」的虚高；`apiPricingItems(67) ≠ apiLinks(55)` 这个差正好等于 12 组多变体的第二行。

### 3.4 §10.6 完整性守卫两侧同级

- API 侧：`validateLinks()` 末尾遍历 `apiPlans[].models[]`，任一条 identity 未被 `seenApi` 认领即报
  「既没有 registry 映射、也没有任何处置」（`scripts/lib/model-registry.js:761-777`）。
- Coding 侧：`validatePlanModelCoverage()` 对 `plans[].supportedModels[].name` 同一原则（未映射且未声明即红）。
- 我用自造夹具分别证明两侧都会红（§3.2 ③）；`remove-mapping` 变异证明 API 侧由
  **`check-model-registry-links` 自己** exit≠0（不是把红推给自测）。
- 没有引入字符串相似度自动 merge：见 §3.2 第 3 点。`candidatesOf()` / `planCandidatesOf()` 仍是
  「归一后精确相等」的候选出口（`normalizedIndexOf()` 单一索引）。

### 3.5 合同 Verify 五条的执行结果（沙箱副本内）

| # | 命令 | exit | 证据 |
| --- | --- | --- | --- |
| 1 | `node scripts/tools/check-model-registry-links.js` | **0** | 「每条映射都指向真实存在的记录与模型，一条 source pricing identity 至多归属一个 registry 模型」· 计价条目（展开后）67 = 认领 67 + 未认领 0 |
| 2 | `node scripts/tools/models-selftest.js` | **0** | 「88 项通过，0 项失败」（含 §8 五条牙 + Tooth 1–5 + M09 + duplicate-slug） |
| 3 | `node scripts/validate.js --strict` | **0** | 全量数据校验通过；模型 44 条 · API 映射 55 / Coding 9 · 未判 0 |
| 4 | 自写合法追加变异（规范序 link + rebuild） | **非 0 ✔** | `check-model-registry-links` exit=1、`validate.js --strict` exit=1、`rebuild-models` exit=1（拒绝写盘）；见 §3.1 前三行 |
| 5 | `node scripts/tools/build-local.js --out=dist.qc-review` | **0** | 「构建完成 → dist.qc-review/（自检全过）」· 产物 1216.3 KB · 修复后的 §17 独立 join 对账对着我自己这份产物：missing 0 · extra 0 · duplicate 0 · multi-owner 0（44 模型 / 44 页 / 67 行 / 12 组变体 9 个 slug） |

绿对照合计：**17/17 GREEN**（含 `check:ci`、可重建性四条、历史三条、各 selftest、`build-local`）。

## 4. Findings（可执行）

### F-T19-1 · LOW · `validate.js --strict` 漏传 `duplicateKeys`（重复顶层 slug 在**主数据门禁**上假绿）

- **problem**：`scripts/validate.js:966` 调 `modelRegistry.validateRegistry(modelsLoad.table, { developers, extraDevelopers })`，
  **没有传** `duplicateKeys: modelsLoad.duplicateKeys`。于是「手写 `scripts/data/models.json` 里重复写同一个顶层 slug 键」
  （`JSON.parse` 只留最后一条 ⇒ 前一条静默消失）在 `validate.js --strict` 上**exit 0**。
  实测：`duplicate-slug-valid` 变异（第二条逐字段合法、故意不带任何干扰错误）→
  `validate:strict` = **0**（原文打印「✅ 校验通过（strict 模式）」，而它上面一行还写着
  「模型（models）: 44 条 · 被显式映射引用 44 条」——那条被吃掉的前一条记录谁也看不见），
  而 `check-model-registry-links` = 1（「models.json 的顶层键 "glm-5.3" 重复出现…」）、
  `selftest:model-registry` = 1、`rebuild-models` 拒绝写盘。
  同一形态还被 `check-models-reproducible.js:51` 漏传（它也调 `validateRegistry`，只是它在变异时因产物不一致先红了）。
  影响面：这一条形态仍有**两道生产门禁 + 一处写盘闸**接住，所以**不推翻 P0 结论**；但与仓库自己那条纪律
  （「一道门禁红的时候，应该没有别的步骤替它红」）相悖，而且 `check-model-registry-links.js:63-66` 的注释
  已经宣称该形态由 `load().duplicateKeys` 覆盖。同一份数据在两个入口得到相反结论，属于会误导人的状态。
- **requiredFix**：`scripts/validate.js:966` 补一个字段：`{ developers, extraDevelopers, duplicateKeys: modelsLoad.duplicateKeys }`；
  并在 `scripts/tools/models-selftest.js` 加一条常驻牙：断言 `validate.js` 仍然把 `duplicateKeys` 传进
  `validateRegistry`（防止以后又被漏掉），以及 `check-models-reproducible.js:51` 同批补齐。
- **file**：`scripts/validate.js` · **line**：966（同批：`scripts/tools/check-models-reproducible.js` · 51）
- **是否阻塞 P0 关闭**：否（P0 的原始形态是「合法追加一条注册表映射」，与重复 slug 键是两种形态；前者有 8 道门禁接住）。

### F-T19-2 · LOW（观察项，可在 T10/T18 收口时一并处理）· 两处读同一份数据的工具对"variant 缺省"口径不一致

- **problem**：`scripts/lib/model-registry.js` 把「`variant` 缺省/null」当**通配**（展开成记录内全部真实变体，
  键用 `(all)` 表示「未展开」），而 `scripts/tools/registry-join-audit.js:75-80` 把「entry.variant 缺省」
  折叠成 `'standard'`。当前生产数据 67/67 条 `variant` 都是字符串，**两侧结果一致**（我实测 join 全 0），
  但一旦 API schema 出现 `variant: null` 的条目（注释里声称 schema 保证不会），两个工具会给出不同身份键：
  一个报「未认领」、一个报「多 owner」。
- **requiredFix**：`registry-join-audit.js` 的 variant 归一改走与门禁同一条语义（缺省/null 视为通配展开、
  不折叠成 `standard`），或在文件头显式声明「本工具假设 schema 保证 variant 恒为字符串」并加一条前置断言。
- **file**：`scripts/tools/registry-join-audit.js` · **line**：75-80

### 已撤回的疑似缺陷（记录在案，避免下游重复怀疑）

- 初审时我怀疑「只有 `_` 元信息键、0 个 slug 的 registry」会在多处假绿。**实跑后撤回**：
  把 `scripts/data/models.json` 改成只剩 5 个元信息键（0 个 slug，sha256 `e12d5f40…e933`）后，
  **5/5 门禁全红**：`validate:strict`(1，报「❌ 校验失败，共 66 项 → - Model Registry: models.json 里没有任何模型」) ·
  `check:model-registry-links`(1) · `selftest:model-registry`(1) · `selftest:models`(1，页面自测直接 TypeError 崩) ·
  `check:models:reproducible`(1)。原先那条"0 条问题"的观测来自探针脚本尚未拷进副本的失误夹具，
  不是实现缺陷 —— 见 §5 第 6 条。

## 5. 我没有复现成功的东西 / 边界

1. **未能在关闭后的实现上找到 P0 的可用绕过**。我尝试了 9 类变异（含 4 类作者没有的：邻接显式变体、
   未解析通配、只改仓根产物、空 registry），凡触及身份唯一性的都在多道门禁红。
2. **A 类（人工改 `curated_api_plans.json` + 重建 `api-plans.json`）的新增计价条目**未测试：
   按 §4 的机制推理它不会造成 P0（新条目必须同时补一条映射，否则 API 侧完整性红），但我没有实跑。
3. **真浏览器验收（`verify-site.js` + 回归比对）**未跑：与本 P0 无关（它看的是渲染后的页面），
   且属于 T18/T20 的验证面；本次只跑到 `build-local --out=dist.qc-review` 为止。
4. `check-model-registry-links` 的**双重归属判定是"先到先得"**：先出现的映射持有 identity，
   后出现的报「已经映射到 <先到的 slug>」。这不影响判红（两种顺序都红），但错误信息里的 owner
   取决于规范序，读日志时要知道这一点。
5. 作者自述的「5 条 tooth 两方向」我没有逐条照抄其期望字符串，而是**重建了等价语义**（§3.2）；
   数值层面（67 / 55 / 12 / 9 / 0）与作者、与 T01 基线三方一致。
6. **我自己的一个探针失误（已改正，写在这里以免下游被误导）**：第一版「空 registry」探针在副本里
   根本不存在的路径上执行（脚本还没拷进去），于是断言跑在**未变异**的夹具上，得到一条假的
   「0 条问题」观测。发现后重做成 `empty-registry` case（改来源层 + 5 道门禁全跑）→ 5/5 全红，
   已撤回该疑似缺陷（§4）。这条记录同时说明：**没有多门禁对照的单点断言很容易骗过自己**。

## 6. 复现指引（任何人可在 10 分钟内重跑）

```powershell
# 0) 准备隔离副本（本报告用的金样本：共享 worktree 整树复制 + 副本内复算派生物）
#    D:\qc-t19\wt   ← 见 §1；共享 worktree 全程只读
cd D:\qc-t19\wt
node .qc-t19/identities.cjs .          # 独立遍历 + 对照实现读数（exit 0）
node .qc-t19/unit-teeth.cjs            # 自造夹具重建 §8 牙（exit 0）
node .qc-t19/gates.cjs green-all ...   # 17 道门禁绿对照
node scripts/tools/build-local.js --out=dist.qc-review
node scripts/tools/registry-join-audit.js --dist=dist.qc-review

# 1) 变异复现：每个 case 自动建独立副本、改来源层、跑门禁、留指纹
node .qc-t19/run-case.cjs append-legal-wildcard model-registry-links selftest:model-registry validate:strict
node .qc-t19/run-case.cjs remove-mapping        model-registry-links selftest:model-registry validate:strict
node .qc-t19/run-case.cjs duplicate-slug-valid  model-registry-links selftest:model-registry validate:strict
node .qc-t19/run-case.cjs unresolved-wildcard   model-registry-links validate:strict
node .qc-t19/run-case.cjs root-links-only       model-registry-links models:reproducible validate:strict
# 2) 追加写盘闸复现（在 append-legal-wildcard 副本里）
cd D:\qc-t19\run\append-legal-wildcard ; node scripts/tools/rebuild-models.js   # exit 1，拒绝写盘
```

## 7. 判定

- P0（同一 source pricing identity 可归属两个 registry 模型）：**关闭**（机制级 + 8 道路径级证据，含规范序合法追加的原始形态）。
- §10.6 两侧完整性：**达成**（API 侧由 `check-model-registry-links` 自己红；Coding 侧原本就有）。
- 生产数据零改写：**达成**（5 份文件哈希与交付所报及 T01 基线逐一吻合）。
- coverage 展开口径：**达成**（独立遍历与实现读数逐项相等，无虚高）。
- 无相似度自动 merge：**达成**（静态扫描 + 候选出口唯一）。
- 空输入不假绿：**达成**（`empty-registry` 变异 5/5 门禁红；一条疑似缺陷已撤回）。
- 遗留：F-T19-1（`validate.js` 漏传 `duplicateKeys`，LOW，一行可修）、F-T19-2（两工具 variant 缺省口径不一致，LOW 观察项）。
  两条都不改变 P0 结论，但 F-T19-1 是**同一形态两个入口结论相反**，建议在 T05 收尾或 T18 复核时关掉。

**verdict = pass**（findings 均为 LOW、非阻塞；F-T19-1 建议顺手补一行）。
若队长认为「守卫一致性」属于本次验收面，请按 §0 的诚实注记把本条读作 `needs_revision` 并把 F-T19-1 派回修复 —— 证据两种读法都完整。
