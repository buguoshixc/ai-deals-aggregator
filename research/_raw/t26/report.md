# t26 独立对抗性审查报告 —— t23 的「API 侧计价条目处置」门禁能不能被绕过

> 审查者：page-engineer（**不是** t23 的作者）。只读生产文件；所有变异都在 `%TEMP%/t26/repo` 副本上做，
> 共享 worktree 一个字节没改（哈希自证见 §7）。
> 交付：verdict = **pass**（+ 1 条 medium / 1 条 low 的加固建议，均**不**要求重开 t23）；复现材料全部在 `research/_raw/t26/`。

## 0. 审查对象与状态锚点

| 项 | 值 |
| --- | --- |
| 被审内容（工作区内容 = 提交后内容） | `scripts/lib/model-registry.js` sha256 `7158433F…99D04D`、`scripts/data/model-registry-gaps.json` sha256 `8BAC901B…BB69`、`scripts/data/model-registry-links.json` sha256 `116BAD28…2460`、`models.json` sha256 `09D6872C…C495` |
| 基线（t23 落地**前**） | `6849e52`（审查期间 t23 被收录进 `aea3e70`；我的 HEAD 相对比较全部对着 `6849e52` 做的） |
| 审查期间 HEAD 变化 | `6849e52` → `aea3e70` → `413a9f8`（外部提交；被审文件内容哈希**前后未变**，见 `final-hashes.json`） |
| 副本 | `%TEMP%/t26/repo`（整树复制，排除 `.git` / `node_modules` / `dist*`；每次运行重新复制，避免"半新半旧"） |

## 1. verdict

**pass** —— 六条 acceptance 全部满足；这道门禁**没有被打开成一个"什么都能声明进去"的抽屉**：
12 条处置声明的探测键（`modelKey` + 官方显示名，去重后 **17 个**）在**逐字 / 归一 / 折叠 / 命名空间后缀**四类精确相等探测下
对 registry 的 **44 个折叠身份**命中 **0** 次；
14 条新映射每一条都独立确认能对回 registry 身份且 basis 选择正确；删掉任一条声明，六个门禁**全部**变红。
另有 2 条加固建议（不阻塞）：折叠/后缀规则的**分隔符字符集**比 schema 允许的分隔符窄（下划线/连字符连接的命名空间前缀探不到），
以及"声明合法性只由 `validateGaps` 兜"这一耦合缺一条机器牙。

## 2. 独立复算（第二条路径，不 require `scripts/lib/**`）

脚本：`research/_raw/t26/recompute.cjs`（自己读四份原文、自己实现展开口径与三类精确相等探测）。

| 口径 | 我的独立复算 | t23 报告 / 门禁输出 | 一致 |
| --- | --- | --- | --- |
| API 计价条目总数 | **93** | 93（`validate --strict` 摘要） | ✓ |
| 被映射认领的 identity | **81** | 81 | ✓ |
| 被处置声明认领的 identity | **12** | 12（`declaredApiEntries`） | ✓ |
| 未判（既无映射又无声明） | **0** | 0（"未映射 API modelKey 0 条"） | ✓ |
| 记账闭环 | 81 + 12 + 0 = 93 | 同 | ✓ |
| 声明/映射双向重复 | **0** | 0（exactly-one 双向检查） | ✓ |
| 同 identity 双归属 / 未展开成功的 link 或声明 | **0 / 0** | — | ✓ |
| links | 82 = API **69** + Coding **13** | 82 = 69 + 13 | ✓ |
| declarations | 54 = Coding **42** + API **12** | 54 = 42 + 12 | ✓ |
| registry 身份 | 44（源层） = 44（派生产物），漂移 **0** | 44 | ✓ |
| 派生 id | 44/44 等于 `sha1('model|'+slug)[:12]`，与 HEAD 漂移 **0** | — | ✓ |
| API 侧候选（归一后精确相等的漏网之鱼） | 0 | `check:model-registry-links`：API 0 条 | ✓ |

> `coverageOf` 的 93 = 81 + 12 + 0 与 `coverage-report.js` 的独立记账（`apiPricingItems = mappedApiEntries + declaredApiIdentities + unmappedModelKeys`）**逐项相等**。

## 3. 数据再裁决（acceptance ③）

### 3.1 12 条处置声明：真的对不上（0 命中）

探测键构造：对每条声明探测 **`modelKey` + 该记录里这条条目的官方显示名**，每个串走
（a）逐字精确、（b）NFKC + 折叠空白 + 小写、（c）折叠（去末尾括注 + 去 `\s - . _ / ／` + 小写）、
（d）命名空间后缀（按 `/`、`.`、`．` 切分的每个尾段，同样折叠）。**没有编辑距离 / 相似度 / LLM**（§40）。

- 12 条声明 × 探测键（去重后 18 个键）与 registry 的 44 个折叠身份**交集为空**；
- 家族诊断（子串检索只作诊断）：`oss` 命中 0 个身份 / 声明里 6 条；`guard` 0 / 3；`nemotron` 0 / 2；`ember` 0 / 1；`inkling` 0 / 1
  —— registry 里**根本没有**这五个家族的任何一个身份（`research/_raw/t26/recompute.cjs` 输出里附了 44 个折叠身份与 18 个探测键的全文，供人工核对"有没有漏掉一种拼法"）；
- 逐条明细（键 / 显示名 / 命中）：见 `recompute.cjs` 的「12 条处置声明」表，全部 `hits=[]`。

**结论**：`gpt-oss(-120b/-20b/safeguard-20b)`、`llama prompt guard 2 22m/86m`、`nemotron-3-ultra-nvfp4`、`nemotron-lightning-3p5-30b-a3b`、
`ember-1`、`inkling` 在 registry 里没有别的拼法 ⇒ 判成处置是**诚实**的（不硬塞、不留空）。

### 3.2 14 条新映射（HEAD → 现在：links 68 → 82，新增 14、删除 0、字段变化 0）

`research/_raw/t26/diff-vs-head.cjs` 与 `basis-audit.cjs` 的结论：

| 对回依据 | 条数 | 例 |
| --- | --- | --- |
| 命名空间前缀（`. ` 连接）去掉后逐字相等 | 7 | `zai-org.glm-5.3` → `glm-5.3`；`qwen.qwen3.8-27b` → `qwen3.8-27b`；`moonshotai.kimi-k3` → `kimi-k3`；`minimaxai.m3` → `minimax-m3`；`zai-org.glm-5.3-flash` → `glm-5.3-flash` |
| 官方显示名折叠命中（别名 / canonicalName / slug） | 4 | `glm-5p3`（显示名 `GLM 5.3（官方 modelId: fireworks/glm-5p3）` → 折叠去括注 = `glm53`）；`qwen3p8-max`；`deepseek-v4p1-flash`；`deepseek-ai.v4.1-flash` |
| 逐字相等 / registry 别名 | 3 | `minimax-m3`、`kimi-k3`、`zai-org/GLM-5.3` 类 |
| basis 选择 | 10 条 `explicit-mapping`（引文**未**点名该模型，note 写明依据） + 4 条引文类（引文**逐字点名**该模型） | 4 条引文类的 evidence 与记录自己的 `evidence[]` **逐字段相同**（0 条"新造引文"） |

我的独立探测里 **映射-身份不一致嫌疑 = 0**（21 条命中的映射条目，命中 slug 与 `registrySlug` 全部一致）。

## 4. 对抗 fixture 电池（acceptance ①）与接线完整性（acceptance ④）

脚本：`research/_raw/t26/adversarial-fixtures.cjs`（整树副本 + 每轮从内存快照还原）；结果：`fixtures-result.json`。
判据：`node scripts/validate.js --strict` 的 exit code + **是否出现反绕过信息**（"折叠后精确落到 registry 身份" / "已经在关系层里有映射"）。

| id | 攻击形状 | 期望 | 实际 | 反绕过信息 | 门禁给的原话（节选） |
| --- | --- | --- | --- | --- | --- |
| C0 | 未变异副本（12 条真处置声明都在） | 绿 | **绿 exit 0** | — | 对照组：真实 off-registry 键不被误伤 |
| F1 | 命名空间前缀 `zai-org.glm-5.3`（删掉既有映射后改成声明） | 红 | 红 exit 1 | ✓ | `modelKey「zai-org.glm-5.3」折叠后精确落到 registry 身份「glm-5.3」` |
| F2 | 命名空间后缀 `qwen.qwen3.8-27b` | 红 | 红 exit 1 | ✓ | `…后缀 → 「qwen3.8-27b」` |
| F3 | 分隔符折叠 `glm-5p3`（真实数据里的写法） | 红 | 红 exit 1 | ✓ | `name「GLM 5.3（官方 modelId: fireworks/glm-5p3）」折叠后…「glm-5.3」` |
| F4 | 大小写 + 全角 + NFKC：显示名 `ＫＩＭＩ　Ｋ３` | 红 | 红 exit 1 | ✓ | `name「ＫＩＭＩ　Ｋ３」…「kimi-k3」` |
| F5 | 显示名末尾括注 `Kimi K3（官方 modelId: …）` | 红 | 红 exit 1 | ✓ | `name「Kimi K3（官方 modelId: fireworks/kimi-k3）」…「kimi-k3」` |
| F6 | registry 别名原文 `zai-org/GLM-5.3` | 红 | 红 exit 1 | ✓ | `modelKey「zai-org/GLM-5.3」…「glm-5.3」` |
| F7 | 通配 variant 掩盖（一个变体仍被映射，声明写 `variant=null`） | 红 | 红 exit 1 | ✓ | `identity (646f01c662e6, glm-4.5v, long_context) 已经在关系层里有映射` |
| F8 | 同一 modelKey 多 variant（`standard` 已被通配认领，再显式声明 `standard`） | 红 | 红 exit 1 | ✓ | `identity (646f01c662e6, glm-4.5v, standard) 已经在关系层里有映射` |
| F9 | 官方显示名直命 slug（`GLM-5.3`） | 红 | 红 exit 1 | ✓ | `name「GLM-5.3」…「glm-5.3」` |
| F10 | **冒号命名空间** `zai-org:GLM-5.3`（新条目 + 声明） | 红 | 红 exit 1 | **✗ 未出现** | 红来自 `api-plan-schema`：`modelKey 非法(zai-org:GLM-5.3)：必须匹配 /^[a-z0-9][a-z0-9._-]{1,59}$/` ⇒ **该拼法不可达** |
| F11 | 空格命名空间 `zai-org GLM-5.3` | 红 | 红 exit 1 | ✓ | `modelKey「zai-org GLM-5.3」…「glm-5.3」` |
| C1 | 对照组：只改写一条真处置声明的 note 措辞 | 绿 | **绿 exit 0** | — | 与身份无关的改动不误红 |

**接线完整性（④）**：在副本里删掉 1 条 API 侧声明（`929a1f3ec46c|ember-1`）后，六个门禁**全部非 0**：

| 门禁（正常态 exit 0 → 删一条声明后） | 结果 |
| --- | --- |
| `scripts/validate.js --strict` | 1（红） |
| `scripts/tools/check-models-reproducible.js` | 1 |
| `scripts/tools/check-model-registry-links.js` | 1 |
| `scripts/tools/coverage-report.js` | 1 |
| `scripts/tools/models-selftest.js` | 1 |
| `scripts/tools/build-local.js` | 1 |

⇒ 没有一个门禁"看不见"被处置声明覆盖的那条条目（6 个生产文件 —— `validate.js` / `check-models-reproducible` / `check-model-registry-links` / `rebuild-models` / `build-local` / `coverage-report` —— 里 `validateLinks(gaps)` 与 `validateGaps(apiPlans)` 都成对出现）。

## 5. acceptance ②：门禁有没有被放宽

逐行看 `git diff 6849e52 -- scripts/lib/model-registry.js scripts/tools/models-selftest.js`（t23 未提交，故对基线比）：

- **删掉的每一行都有等价或更强的替代**：Coding 侧的全部旧断言（planId 存在 / modelName 逐字 / role 逐字 / reason 枚举 / `pool` 充要 / sourceUrl 必须是该套餐自己的官方页 / note 非空非超长 / `(planId, modelName)` 不重复 / 不与映射双重记账 / 归一后能对上即红 / 规范序）在**新代码里逐条都在**（现在按侧别分支），另加 API 侧 12 类新判据（存在性 / variant 真实性 / `API_GAP_REASONS` 闭集 / sourceUrl 必须是该 API 记录自己的官方页 / 通配未匹配即红 / 双向重复记账 / 折叠反绕过 / 侧别键序 / 侧别规范序 / exactly-one 侧别）。
- **常量一个都没放宽**：`MAX_NAME_LENGTH` / `MAX_ALIASES` / `MAX_ALIAS_LENGTH` / `MAX_FAMILY_LENGTH` / `MAX_NOTE_LENGTH` / `MAX_EVIDENCE` / `LIMITS` 全部未动；新增的 `API_GAP_REASONS = ['off-registry-model']` 是**更窄**的 API 侧白名单（Coding 侧 `GAP_REASONS` 5 个值原样保留）。
- **不存在"拿不到表也放行"**（`research/_raw/t26/unit-probes.cjs`，含 3 个对照组）：
  - 声明表非空但没传 `table` ⇒ 红「没有拿到 registry 表（table 为空），无法判定…这不是通过」；
  - 有 API 侧声明但没传 `apiPlans` ⇒ 红「有 N 条 API 侧声明却没有拿到 apiPlans…这不是通过」；
  - registry 非空而关系层为空 ⇒ 红「这不是"干净"，是关系层没写」；
  - `validateLinks` 在 `table` 为空时**跳过** API 完整性（文件里写明的设计）—— 实测该路径**仍然红**（每条 link 的 `registrySlug` 都不存在），不是 fail-open；
  - 声明 identity 合法但 `reason` 非法时，`validateLinks` 仍把它算作"有结局" ⇒ 绿不绿取决于**每个入口都调 `validateGaps`**：这正是 ④ 的接线证据（6/6 都红），见 finding T26-F2。

## 6. acceptance ⑤ / ⑥

### ⑤ 派生与身份（`research/_raw/t26/derivation-audit.cjs`）

- 根 `models.json` 与基线（`6849e52`）**不是**逐字节相同：**44 → 44 条、字段级变化只有 8 个 `lastSeen`（2026-10-01 → 2026-10-04）**，`id`/`slug`/`canonicalName`/`status`/`modelRole`/`releasedAt`/`releaseEvidence`/`freshnessGroup`/`catalogStatus`/`note` **0 处变化**。
- 这 8 个值 = "它映射到的那些记录 `lastSeen` 的最大值"：HEAD 侧最大值为 `2026-10-01`、现在为 `2026-10-04` ⇒ 漂移来自 **t11 新落盘的 api-plans 记录**，与 t23 的映射/声明**无关**（t23 的披露属实）。
- 源层 `scripts/data/models.json`：身份集合 44 → 44（新增 0 / 删除 0），派生 id 44/44 稳定。
- `node scripts/tools/rebuild-models.js --dry-run`：`✓ models.json 与盘上逐字节一致`、`✓ model-registry-links.json 与盘上逐字节一致`、`--dry-run：没有写盘。`

### ⑥ 文档与代码一致

- `docs/SCHEMA-v3.0.md` §2/§2.1：键序 `Coding 侧 planId → modelName → role → reason → sourceUrl → note`、`API 侧 apiPlanId → modelKey → variant → reason → sourceUrl → note` 与 `GAP_KEY_ORDER` / `API_GAP_KEY_ORDER` **逐字相同**；API 侧 reason "**只允许** `off-registry-model`" 与 `API_GAP_REASONS` 相同；"每一条计价条目 / 模型串都必须有结局""两侧都不允许静默留空"与实现一致；§2.1 的示例 JSON 就是 API 侧声明的真实形状。
- `README.md` 28–30：`model-registry-gaps.json` **不发布** + 双侧说明；`/model-registry-gaps.json` 线上 404 是有意的 —— **这句没被改错**。
- 文档写"六处都会停"与实测 6 个门禁一致。

## 7. findings（不阻塞 t23）

### T26-F1（medium，加固）折叠/后缀探测的分隔符字符集比 schema 允许的窄

- **problem**：`namespaceSuffixes()` 只按 `/`、`.`、`．` 切分（`identityFold()` 会抹掉 `\s - . _ / ／` 等，但不产生尾段）。而 API 侧 `modelKey` 的 schema 正则是 `^[a-z0-9][a-z0-9._-]{1,59}$` —— 合法分隔符含 `_` 与 `-`。于是在 registry 只有裸 slug（没有覆盖该写法的别名）时：
  `zai_org_glm-5.3`、`zai-org_glm-5.3`、`zai-org-glm-5.3` **三类拼法全部探不到**（`research/_raw/t26/spelling-matrix-result.json`：`漏掉`；`.` 连接的 `zai-org.glm-5.3` / `vendor.glm-5.3` / `zaiorg.glm-5.3` 全部`命中`）。
  含义：若某条记录的 `modelKey` 用 `_`/`-` 连接命名空间，且官方显示名也认不出它，那么"其实是同一个模型"的条目**可以**被写成处置声明而门禁不红。
- **file**：`scripts/lib/model-registry.js`（`identityFold()` / `namespaceSuffixes()`，约 285–311 行）
- **requiredFix**：把后缀切分字符集扩到 schema 允许的分隔符（`[/．._-]`），每个尾段仍走 `identityFold` 精确相等（**不引入相似度**：尾段必须恰好等于某个 registry 身份/别名才命中）；并加 2 条 fixture 牙（`vendor_model` 与 `vendor-model` 形状必须红、真 off-registry 的 `vendor_ember9` 必须绿）。注意 `-` 入切分集会产生更短尾段（`glm` / `5.3`），只有在 registry 里真的存在同名身份时才会命中 ⇒ 不会误伤。
- **影响面（实测）**：当前 93 条计价条目、12 条声明里 **0 例**（全部拼法都已被现有规则覆盖或被映射）。这是**防御纵深**缺口，不是已发生的错误。
- **附**：冒号 / 井号 / 反斜杠 / 中文方括号等拼法**不可达** —— `api-plan-schema` 的 `MODEL_KEY_RE` 直接拒（F10 的红正是这条正则给的），故不列入风险。

### T26-F2（low，加固）"声明合法性由 `validateGaps` 兜"缺一条机器牙

- **problem**：`validateLinks()` 的完整性记账只把声明当作"这条 identity 有结局"（只读 identity，不查声明是否合法：`reason` 白名单 / 存在性 / 键序 / 重复）。因此门禁的可信度依赖"**每个入口都同时调 `validateGaps`**"。今天 6 个门禁入口都调了（删一条声明 6 个门禁全红），但这是一条**只靠约定**维持的耦合。
- **file**：`scripts/lib/model-registry.js`（`validateLinks()` 1124–1146 行）、`scripts/tools/*.js`（调用点）
- **requiredFix**：加一条机器牙 —— 例如在 `models-selftest` 里扫全部 `validateLinks(` 调用点并要求同文件出现 `validateGaps(`；或让 `validateLinks` 在记账时顺手校验 `reason ∈ API_GAP_REASONS` / 声明的条目存在。

### 观察项（不是 finding，供留档）

1. `models.json` 的 8 处 `lastSeen` 漂移（见 §6⑤）：与 t23 无关、且回退会让 `check:models-reproducible` 变红 ⇒ **保留**是对的；t23 在依赖里主动披露这件事，披露内容与我的独立复核一致。
2. 反绕过探针同时查 `modelKey` 与**官方显示名** ⇒ 比只看键更严；副作用是"显示名折叠碰撞"会误红（例如两个不同模型的名字在丢掉分隔符后相同）。这是 fail-closed 的有意选择（错误信息要求"要么写映射、要么修 registry 别名"），但它会在未来遇到折叠碰撞时挡住一条**诚实**的声明 —— 需要时可加一条"人工 override + 理由"的出口，**本轮不建议改**。
3. `namespaceSuffixes()` 不切 `-` 是**有意**的（`gpt-oss-120b` 里的 `-` 是名字本身），T26-F1 的所需扩张只涉及 `_`（`-` 可一并评估）。
4. 转写型拼法（真实数据里的 `glm-5p3` 把 `.` 写成 `p`）在"精确相等类"里**原理上无法**覆盖；本轮它被**官方显示名**探针接住（F3）。这条边界要在文档里写明，否则以后有人会想用相似度去补。

## 8. 复现材料与命令

| 文件 | 作用 |
| --- | --- |
| `recompute.cjs` | 独立复算（数字表 + 12 条声明逐条探测 + 14 条映射 + 家族诊断 + 44 个折叠身份全文） |
| `diff-vs-head.cjs` | 从基线里分离 t23 的落地改动（links/gaps 的新增/删除/字段变化） |
| `basis-audit.cjs` | 14 条新映射的 basis 选择与引文逐字性 |
| `unit-probes.cjs` | 单元级反绕过 + 对照组 + 输入缺失 fail-closed 路径 |
| `spelling-matrix.cjs` | 折叠规则覆盖面矩阵（隔离 modelKey 侧 / 显示名侧） |
| `adversarial-fixtures.cjs` | 11 组对抗 fixture + 2 组对照 + 6 门禁接线（副本上做，自动还原） |
| `derivation-audit.cjs` | 根/源层产物与基线的逐格比对 + lastSeen 归因 + 身份稳定性 |
| `fixtures-result.json` / `unit-probes-result.json` / `spelling-matrix-result.json` / `final-hashes.json` | 机读结果与哈希自证 |

命令（`<repo>` = worktree 根；副本在 `%TEMP%/t26/repo`）：

```
node research/_raw/t26/recompute.cjs
node research/_raw/t26/diff-vs-head.cjs
node research/_raw/t26/basis-audit.cjs
node research/_raw/t26/unit-probes.cjs
node research/_raw/t26/spelling-matrix.cjs
node research/_raw/t26/adversarial-fixtures.cjs      # 11+2 组 + 6 门禁接线，退出码 0 = 全部达标
node research/_raw/t26/derivation-audit.cjs
node scripts/validate.js --strict                    # 正常态 exit 0
node scripts/tools/check-models-reproducible.js      # 正常态 exit 0
node scripts/tools/check-model-registry-links.js     # 正常态 exit 0（API 候选 0 / 套餐候选 0）
node scripts/tools/coverage-report.js                # 正常态 exit 0
node scripts/tools/models-selftest.js                # 正常态 exit 0（134/134）
node scripts/tools/build-local.js --out=dist.qc-t26  # 正常态 exit 0（自检全过）
node scripts/tools/rebuild-models.js --dry-run       # 无待写差异
```

## 9. 边界与未做

- 契约里写"判据见 acceptance ①–⑦"，但任务对象里只列了 **①–⑥** —— ⑦ 不存在，按 ①–⑥ 判。
- 全部变异在 `%TEMP%` 副本上做；共享 worktree 的四个被审文件哈希**审查前后一致**（`final-hashes.json`）。
- 我没有复核 t23 的**研究结论**（4 家推理平台定价的官方性、8 条国际 Coding 套餐的准入）——那属于 t15/t16 的数据质量审查，不在本任务范围。
- 反绕过牙的"真牙"只在 `scripts/validate.js --strict` + `validateGaps` 这一层实测；页面层（`models-page` / `verify-site`）与本题无关。
