# SCHEMA v2.5 —— API / Token 计费数据契约（`api-plans.json` v1 + `/plans/api/`）

> 前置：[`SCHEMA-v2.1.md`](SCHEMA-v2.1.md)（Coding Plan 数据模型）· [`SCHEMA-v2.3.md`](SCHEMA-v2.3.md)（套餐变化）·
> [`SCHEMA-v2.4.md`](SCHEMA-v2.4.md)（优惠 ↔ 套餐关系）。这一层**不改**它们任何一个字段。
>
> 实现与本文不一致时以本文为准；改实现必须同时改本文与 `scripts/tools/api-plans-selftest.js` 的夹具。

---

## 1. 这一层干什么、不干什么

**干**：给「各平台按量计费（API / Token）的官方价格」建立一套可校验、可重建、可追踪变化的契约，
并用人工逐条核对官方页的真实数据把它落地，最后渲染成 `/plans/api/`。

**不干**（一条都没做，且由 `api-plans-selftest.js` 钉住）：

- 不做模型能力排行榜 / AA 分数 / benchmark 聚合 / 综合推荐 / 「最值得买」/ 自动模型推荐；
- 不做 **API 成本模拟器**（工作负载计算器）：本阶段不产出任何派生单价；
- 不做跨币种、跨单位换算（含「每 1000 tokens 折成每 100 万」这类"看起来只是乘 1000"的换算）；
- 不把 `credits` 折算成 token 数量；
- 不给 `/plans/api/` 做筛选 / 搜索 / 排序控件（v1 是预渲染静态表，无 JS）；
- 不做模型注册表（模型身份由 `modelKey` 人工维护，见 §5）。

---

## 2. 与 Coding Plan 的关系：BasePlan + CodingPlan + ApiPlan

题面要求先回答「是否应该设计 `BasePlan + CodingPlan + ApiPlan` 或等价结构」。**结论：是，
但 BasePlan 是「共享判据」而不是「共享记录形状」** —— 实现上不建一张混合表。

| 维度 | CodingPlan（`plans.json`） | ApiPlan（`api-plans.json`） | 处置 |
|---|---|---|---|
| 记录粒度 | 一个可售套餐 | 一个 provider 的**一条计费产品**（模型价格在记录内） | 不复用 |
| 身份 | `sha1(coding\|provider\|planNameKey\|billing.period)` | `sha1(api\|provider\|planNameKey\|channel)` | 复用 `BASE_PLAN.idFromBasis` |
| 价格 | 订阅价 `billing.regularPrice` + 活动价 | 逐模型、逐维度的单价 `models[].rates` | 不复用 |
| 单位 | 币种 + 计费周期 | 币种 + **显式 `pricing.unit`** | 新增 |
| 额度 | `quota`（套餐给多少） | `freeTier`（稳定免费能力）+ `credits`（预付费额度） | 不复用 |
| 模型 | `supportedModels` = 名字 + role | `models[]` = **带价格**的条目，身份 `(modelKey, variant)` | 不复用 |
| 生命周期 / 出处 / provider / 三态 / 引文 | — | **完全相同** | **直接复用 `BASE_PLAN` 与 `provenance`** |
| 变化追踪 | `history-core` 内核 + plans 判据 | 同内核 + **自己的 profile** | 复用机制，不共用判据 |
| 关系层 | `deal-plan-links.json` 的 `planIds` | 同一张表、同一 id 空间 | 复用（关系表格式未变） |

**为什么不把 `kind: "api"` 塞进 `plans.json`**（虽然 v2.1 §3 为它留了判别位）：

1. `makePlan` 的字段集是**封闭的**（白名单 + 「把归一器再跑一遍」逐字段比对）。混合之后每一条
   coding 字段都要变成「按 kind 必填 / 禁用」的分支，`validatePlan`、`identityKeyOf`、
   `PLAN_TRACKED_FIELDS`、`PLANS_EVIDENCE_FIELDS` 全都要长分支；
2. 那段代码刚上线，被 202 项自测 + 真浏览器约 40 条断言冻结，且**线上正在用**；
3. 本仓已确立的原则是「两套身份空间不合并」「关系放独立表」（`deal-plan-links` 的立项理由就是这条）；
4. `lib/feeds.js` 在 v2.3 就写下了「将来 Phase 2.5 加 `/plans/api/` 时就是并列的一份」；
5. `lib/history-core.js` 本来就是**按 profile 参数化**的通用内核（deals 一份、plans 一份），第三份是它的既定用法。

**代价（明写）**：多一份可重建门禁与历史日志；关系层要合并两个 id 空间去解析；没有 `/plans/` hub 页，
两页靠互相深链导航。这些都是显式登记过的取舍，不是没想到。

### 2.1 记录粒度：为什么模型价格是记录内的元素，而不是一条记录

题面 §四 提示身份可能是 `provider / model / pricing variant`。**价格的身份确实是这三元组，但记录的身份不是**：

- 若记录 = provider × model，那么题面 §十 想要的「新用户送 500 万 tokens → 关联某 API Provider」
  会撞上 `deal-plan-links` 的 `LIMITS.planIdsPerLink = 8`：一个 provider 常有十几个模型，
  厂商级赠送无法关联；
- provider 级事实（`freeTier` / `credits` / `limits` / `region` / 币种与单位）per-model 存储
  会在几十行里**漂移**，且"provider 级免费额度一变"会产生 N 条假事件；
- 反过来，记录 = provider × 计费产品时，模型增删改价正好落在 `history-core` **已有的元素级事件机制**上
  （今天服务于 `supportedModels`），与题面 §九 列出的五类一一对应。

---

## 3. 顶层形状与字节确定性

```json
{ "schemaVersion": 1, "updatedAt": "2026-10-01T00:00:00+08:00", "count": 7, "plans": [] }
```

1. 键序固定如上；2 空格缩进；末尾一个换行（与 `deals.json` / `plans.json` 同一套写法）。
2. `count === plans.length`。
3. **`updatedAt` = 全部 `lastSeen` 的最大值 + `T00:00:00+08:00`**；没有记录时为 `null`。
   **它不读墙上时钟** —— 没有采集器，就没有理由说"这份数据是今天采到的"。
4. `plans` 按 `${kind}|${provider}|${planNameKey}|${channel}` **升序**排列；
   打乱人工来源层的数组顺序，产出必须逐字节相同。
5. 所有数组（`models` / `aliases` / `mediaRates` / `limits` / `credits` / `restrictions` / `evidence`）
   在重建期按固定规则排序 —— 顺序漂移不是变化，不该产生 diff。

---

## 4. 字段表与枚举

记录的字段与顺序（**顺序即序列化序**）：

```
id · kind · provider · planName · channel · officialUrl · source · sourceUrl · region
pricing · models · freeTier · limits · credits · restrictions
firstSeen · lastSeen · verified · verifiedAt · evidence · derivedMetrics
```

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | 12 位小写 hex | **派生**（§5）。不得手写；校验器重新推导后逐字段比对 |
| `kind` | `"api"` | 常量（Coding Plan 是 `"coding"`；两者 id basis 都含 kind，因此不会撞） |
| `provider` | string | 必须登记在 `scripts/data/providers.json`（未登记硬红并给建议 key） |
| `planName` | string | 非空 ≤80，规范形态（NFKC + 折叠空白 + trim），**不截断** |
| `channel` | enum | `standard` / `batch` / `flex` / `priority` / `fast` / `ultrafast` / `off_peak` / `fine_tuned` / `other`。**登记制**：每个值都对应某官方定价页上一张真实存在的独立价目表；进 id basis |
| `officialUrl` / `sourceUrl` | string | http(s)、无追踪参数、非聚合站 |
| `source` | enum | 复用 plans 的登记表（`Official-Pricing` / `Official-Docs` / `Official-Announcement`） |
| `region` | `cn \| global` | 复用 `schema.REGIONS` |
| `pricing` | object | §6，必填 |
| `models` | array | §7，**非空**，≤64 条 |
| `freeTier` | object \| null | §8 |
| `limits` | array \| null | §9；`[]` 非法 |
| `credits` | array \| null | §10；**结构上没有任何 token 字段** |
| `restrictions` | array \| null | 复用 `plan-schema` 的三态与 kind 枚举（语义完全一致） |
| `firstSeen` / `lastSeen` | `YYYY-MM-DD` | 人工写；非未来；`firstSeen ≤ lastSeen` |
| `verified` | `true` | 每一条都是人工对照官方页核过的 |
| `verifiedAt` | `YYYY-MM-DD` | 非未来；`verifiedAt ≤ lastSeen` |
| `evidence` | array | **至少 1 条**（≤3 条 × ≤200 字）；字段白名单见 §11 |
| `derivedMetrics` | object | §12，**永远存在且恒为 `{}`** |

**上限常量**（超限一律硬红，绝不自动截断）：`MAX_API_PLANS=200` · `MAX_MODELS=64` ·
`MAX_MEDIA_RATES=6` · `MAX_ALIASES=8` · `MAX_LIMITS=8` · `MAX_CREDITS=6` · `MAX_PRICE=1_000_000` ·
`MAX_MODEL_KEY=60`。

**严格归一**：与 `makePlan` 同一条纪律 —— 文本超长、前后多余空白、URL 带追踪参数、枚举拼错、
`modelKey` 非规范形态一律**报错**，不静默清洗（唯一的例外是日期，接受 `2026/10/01` 这类写法）。

---

## 5. 身份策略与模型改名（题面 §九）

```
记录 id    = sha1(`api|${provider}|${planNameKey}|${channel}`).slice(0, 12)
模型元素键 = `${modelKey}|${variant}`
```

- **不进 basis**：价格、模型清单、免费额度、credits、日期、URL、引文 —— 因此
  **改价 / 增删模型 / 换官方页 / 改备注都不换 id**（有牙守着）。
- **进 basis**：`kind` · `provider` · `planNameKey` · `channel`。
  `channel` 进 basis 是刻意取舍：标准与批处理是两个可售 SKU、价格不可直接比较，
  本就该是两条记录；代价是"同一产品换通道"会被看成两个身份，变化层按
  `ended(channel_changed)` + `created` 处置（与 v2.3 的 `period_changed` 同构）。

**模型改名**是这一层特有的风险（Coding Plan 没有这个问题，因为套餐名由我们写）：

| 情形 | 结果 |
|---|---|
| 只改显示名 `name`，`modelKey` 不变 | **零事件**（`name` 不在被跟踪字段里，见 §13） |
| 把旧名写进 `aliases`，`modelKey` 不变 | **零事件**（同上；`aliases` 变化才产生 `model_changed`） |
| 换 `modelKey`（未登记的改名） | 同一记录里出现 `model_removed` + `model_added` |
| 换 `modelKey` 且单价有**完全相同**的项 | 追加 `possible_rename` 留档，`npm run report:api-model-renames` 列出 |

**检测不等于自动合并**：本仓没有任何"把两个 modelKey 合并"的代码路径。判据刻意是
"单价有完全相同的项"这个**事实**，而不是名字相似度 —— 本仓对相似度匹配有实测教训
（`/krea/i` 命中 `Kreado AI`）。代价是漏检（改名同时改价就查不到），那就如实漏检，不由工具猜。

---

## 6. 单位：显式、枚举、**不换算**（题面 §三）

```json
"pricing": { "currency": "USD", "unit": "per_1M_tokens", "unitNote": null }
```

- `currency` ∈ `plan-schema.CURRENCIES`（复用，含义不变）；
- `unit` ∈ `API_UNITS = ['per_1M_tokens','per_1K_tokens','per_1M_characters']`；
- **一致性规则**：只要 `models[].rates` 里有一个非 null 值，`unit` 就必须给出；一个都没有时
  `unit` 必须是 `null`（"单位只描述 token 维度的数字"）；
- **全仓不存在任何单位换算的代码路径**。`api-plans-selftest.js` 有一条静态扫描钉住
  `api-plan-schema.js` 里没有 `1e3` / `1000 *` 这类常数乘法，也没有 `convertUnit` / `toPerMillion`
  这类函数名。页面上每个价格单元格旁边写着币种，整行还有「计费单位」列（如 `USD / 每 100 万 tokens`）。
- **不换算的理由**：`0.14` 到底是每千还是每百万，是这一层最容易犯、也最难被发现的错 ——
  相乘之后两个口径的数字看起来完全可比，而读者据此得出的结论是错的。

---

## 7. 模型价格条目

```json
"models": [{
  "name": "Claude Sonnet 5.5",
  "modelKey": "claude-sonnet-5.5",
  "variant": "standard",
  "aliases": ["claude-sonnet-5-5"],
  "rates": { "input": 2, "output": 10, "cachedInput": 0.2, "cacheWrite": 2.5,
             "cacheWriteLong": 4, "reasoning": null, "batchInput": null, "batchOutput": null },
  "mediaRates": [{ "kind": "other", "price": 0.5, "unit": "per_1M_token_hours", "note": "缓存存储价" }],
  "note": null
}]
```

- `rates` 键集**固定且顺序即序列化顺序**：`input · output · cachedInput · cacheWrite ·
  cacheWriteLong · reasoning · batchInput · batchOutput`。
  `null` = 官方**没给**这一项；`0` = 官方**明说免费**（与 Coding Plan 的 `regularPrice: 0` 同一条语义纪律）。
- `cacheWrite` / `cacheWriteLong`：写缓存的短时长与长时长定价（Anthropic 同时公布 5 分钟与 1 小时两档）。
  并成一个字段会丢掉一半事实。
- **`mediaRates`**：非 token 维度（`kind` ∈ `image`/`audio`/`video`/`text`/`other`），
  **每条自带 `unit`** ∈ `per_image` / `per_second` / `per_minute` / `per_1M_characters` /
  `per_request` / `per_1M_token_hours`，币种继承 `pricing.currency`。
  这是题面「不要假设只有 input/output 两列」的落点，也保证「每张图 $0.04」不可能被塞进 token 单位字段。
- `modelKey`：**稳定身份键**，`^[a-z0-9][a-z0-9._-]{1,59}$`，人工写；`name` 是官方显示名。
- `variant` ∈ `standard | batch | long_context | fine_tuned | priority | other`；
  `(modelKey, variant)` 在记录内唯一。`long_context` 对应官方按输入长度分档的价目
  （智谱的 `[0,32K)` / `[32K+)`、OpenAI 的 Short / Long context）。
- 一条模型条目至少要有一个 token 单价或一个非 token 计费项 —— 否则它没有价格事实，不该收进来。
- `aliases`：归一化去重、升序；**不得与同记录内任何 `modelKey` / 显示名冲突**。

---

## 8. `freeTier`：三档 `stability` 必填，且只登记**长期**能力（题面 §六 · 2026-10-04 更新）

```json
"freeTier": { "type": "models", "stability": "standing", "amount": null, "period": null,
              "models": ["glm-4.7-flash", "glm-4.6v-flash"],
              "description": "官方长期提供的免费 API 模型…", "conversionDependsOnModel": null }
```

> **本节在质量收口后已更新**：旧版只写「只装**稳定长期**免费能力」，但没有可机器校验的「长期/新用户」字段，
> 于是「新用户赠送 / 限时赠品」曾被收进 `freeTier` 并被页面写成长期能力（审计 P1-11 / `F-r2-api-005`）。
> 现在**每一块 `freeTier` 都必须显式回答** `stability`，判据在 `scripts/lib/api-plan-schema.js` 的
> `FREE_TIER_STABILITY = ['standing','new_user','promotional']`；**缺省或 `null` 一律红**（不许默认成 `standing`）。
> 现行生产 4 条：`standing` 2 条（google / zhipu）+ `new_user` 2 条（aliyun / tencent，均为 100 万 tokens / 一次性资源包）。
> 现行数字与重算命令见 [`research/quality-closure/RECLASSIFIED_FINDINGS.md`](../research/quality-closure/RECLASSIFIED_FINDINGS.md) §0.2。

- `type` ∈ `tokens | credits | requests | models | rate_limited | unlimited_fair_use | none | other`；
  复用 plans 的"量纲型必须有正数 amount / 无数值型必须没有 / 语义在文字里的必须写 description"三张表。
- **三态纪律**（与 deals / plans 完全一致）：
  - 整块**缺席**（`null`）= 我们没查到 / 官方没说明；
  - `{ "type": "none" }` = 官方**明说**没有免费额度，必须带 `description` 与官方引文；
  - `0` 之类的字面量一律不接受。
  - `conversionDependsOnModel` 也是三态（`true / false / null`）：**缺字段与显式 `null` 都落成 `null`（未知），绝不落成 `false`**；
    `type: "credits"` 时必须明确回答（连 `null` 都不接受）。
- `type: "models"` ⇒ `models` 必填，且每个 key 必须是本记录 `models` 里真实存在的 `modelKey`。
- **限时活动与新用户赠送不写在这里**：它们是优惠（Deals），通过 `deal-plan-links.json` 关联。
  页面上有一句话写明这条分工，且 API 计费页的「当前优惠」块把两者连起来。
  「新用户赠送」若确有官方原文且额度是 API 能力（如阿里云百炼新人 100 万 tokens / 90 天），
  可以留在 `freeTier`，但 `stability` 必须写 `new_user`，页面措辞按 `stability` 分档。

---

## 9. `limits`：速率与请求限制

```json
"limits": [ { "kind": "concurrency", "value": 2500, "appliesTo": ["deepseek-flash"], "note": null } ]
```

- `kind` ∈ `rpm` / `tpm` / `rpd` / `tpd` / `concurrency`；`value` 必须是正数。
- `appliesTo` = `modelKey` 数组或 `null`（`null` = 整条记录通用）。
  **逐模型不同是常态**（DeepSeek 的并发上限 flash 2500 / pro 500），所以同一 `kind` 可以按模型出现多次；
  同一 `(kind, appliesTo)` 不得重复。
- 与 Coding Plan 的 `restrictions` 分工不同：`restrictions` 记**资格与地区**（三态），
  `limits` 记**数值型速率限制**。

---

## 10. `credits`：卖的是钱，不是 token（题面 §五）

```json
"credits": [{ "pay": 10, "currency": "USD", "gets": 10, "unit": "credits",
              "usageNote": "credits 按各模型当前单价扣减，消耗速度取决于所用模型",
              "expires": null, "description": "预付费额度：充 $10 得 10 credits（1 credit = $1 用量）" }]
```

**结构红线（三条，序在归一阶段，比在页面上写一句"这是计算值"更硬）**：

1. 字段白名单里**没有任何 token 数量字段**；
2. 额外拒绝**键名含 `token`** 的键 —— 因此「$10 credits = 500 万 tokens」这种写法**根本没有地方可写**；
3. `unit` ∈ `credits | usd | cny`（刻意不含 tokens）；`unit=credits` 时必须写 `usageNote`
   说明扣减口径；`unit=usd/cny` 时 `currency` 必须**就是**那个币种（否则等于默认了一个汇率，
   而本站没有汇率系统）。

**派生估算**是后续 API 成本计算器的事：它需要「选定模型 + 选定单价 + 明确扣减条件」三个条件同时成立，
且结果是**计算值**而不是套餐原始额度 —— 本阶段一条都不产出（§12）。

---

## 11. 引文字段白名单

基础集 = `provider · planName · channel · pricing.currency · pricing.unit · region · freeTier ·
limits · credits · restrictions`，外加**逐模型动态展开**的 `models.<modelKey>`。

做法：先归一 `models`，再构造 `fields` 数组传给 `provenance.normalizeEvidence({ fields })` 与
`auditEvidence` —— 因此「引文写了却没生效」（枚举拼错、超长、聚合站出处、未来日期）仍能在
人工来源层逐条对账，与 Coding Plan 同一条纪律。

---

## 12. 派生指标：**恒为 `{}`**（这是结论，不是缺省）

题面 §八 明确本阶段不做成本模拟器。三个候选全部需要假设：

| 候选 | 拒绝理由（写在 `deriveApiMetricsWithReason()` 的 reason 里） |
|---|---|
| 混合单价（input/output 加权） | 需要**工作负载假设**（输入/输出比例）；假设一变结论就变 |
| `credits → tokens` 估算 | 需要选定模型与单价；且它是**计算值**，不是套餐额度 |
| 缓存命中折算比例 | 需要选定一个模型作分子/分母，属跨模型比较 |

实现：`derivedMetricsOf()` 返回 `{}`，校验器「把归一器再跑一遍」逐字节比对 `derivedMetrics`
—— **任何手写的派生值都进不了盘**（自测里有一条牙：把 `$10 credits` 估成 500 万 token 写进
`derivedMetrics` → 当场红）。这与 Coding Plan 的「9 条全部为 null」是同一种诚实：
**宁可什么都不算，也不把不可比的东西写成可比。**

---

## 13. 变化追踪（`api-plan-history.json`）

复用 `history-core` 的写入内核（`lib/plan-history.js` 的 `record()` 在 v2.5 起按 profile 参数化，
`lib/api-plan-history.js` 只提供 **profile + 措辞 + 薄封装**），**不共用判据**。

**事件类型（16 类，与 Coding Plan 的 17 类互不影响）**：

`created` · `price_increased` · `price_decreased` · `model_added` · `model_removed` · `model_changed` ·
`unit_changed` · `currency_changed` · `free_tier_changed` · `credits_changed` · `limits_changed` ·
`restriction_changed` · `availability_changed` · `updated` · `ended` · `restored`

**被跟踪字段（顺序即基线与事件的序列化顺序）**：

`pricing.currency` · `pricing.unit` · `models`（元素级）· `freeTier.type` · `freeTier.amount` ·
`freeTier.period` · `freeTier.models` · `freeTier.description` · `credits` · `limits` ·
`restrictions` · `region` · `officialUrl` · `source` · `sourceUrl`

**值决定类型的三处**：
- `models` 元素变化：全部变动的 token 维度同向上升 ⇒ `price_increased`；同向下降 ⇒ `price_decreased`；
  出现 `null ↔ 数字`（维度新增/取消）或方向混杂 ⇒ `model_changed`。
  **不在"方向混杂"时挑一个方向**：那会把「输入涨、输出降」写成一次单向变化。
- `freeTier.description` 的**投影**：量化型（tokens / credits / requests）的说明是解释性散文，
  不作为额度语义跟踪；语义全在文字里的类型才跟踪它（与 Coding Plan 的 `quota.description` 同一条规则）。
- `models[].name` 与 `models[].modelKey` **不跟踪**：前者是显示名（改名产生零事件），后者是身份。

**不跟踪的字段与理由**逐条写在 `API_PLAN_UNTRACKED_FIELDS`。

**退出保护（与 v2.3 同构）**：唯一写入点（只有成功写盘才推进日志）· 连续两次未见才记 `ended` ·
批量消失熔断（> `max(3, 半数已知)` 或输出为空）· 通道重键立即 `ended(channel_changed)` ·
日期倒填拒绝写盘 · fail-closed。

---

## 14. 关系层：`deal-plan-links.json` 的 id 空间合并（题面 §十）

- **关系表格式一个字没改**。`planIds` 现在可以在两个 store 里解析（Coding 套餐 ∪ API 计费记录）——
  两个 store 的 id basis 都含 `kind`，所以不会撞。
- `provider` 一致性、状态（`current` / `removed` / `ended`）、节省金额四道门照常适用；
  API 记录**没有 `billing`**，因此任何 `promo` 都不产生节省金额（`savingsOf` 的第一道门就返回 `null`）。
- **注入 `dist/deals.json` 的字段新增一个 `planKind`**（`coding` / `api`）。这是本层唯一一次契约变更：
  同一个字段名在两类记录上含义不同（`regularText` 是「正常价格 ¥99/月」还是「智谱AI · 模型 API 按量计费」；
  `periodText` 是「每月」还是「USD / 每 100 万 tokens」）。缺了它，优惠页会把两类东西按同一套标签渲染
  —— **看起来完全正常，但「计费周期」那一行写着一个计费单位**。
- 候选报告（`report:deal-plan-links`）同时扫两类记录，**仍然只产出报告**：
  它没有任何写生产关系的代码路径（自测里有一条断言钉住这一点）。

---

## 15. 页面 `/plans/api/`

| 项 | 值 |
|---|---|
| 路由 | `/plans/api/`（两层，回站根是 `../../`） |
| 标题 / `<h1>` | `API / Token 计费对比` |
| 列（11） | 平台 · 模型 · 变体 · **计费单位** · 输入价 · 输出价 · 缓存命中输入 · 其他计费维度 · 免费额度 / credits · 最近更新 · 官方来源 |
| 行的数据标记 | 每行 `data-item="<modelKey>\|<variant>" data-plan="<id>"`；每条记录的**第一行**带 `id="plan-<id>"` |
| JSON-LD | `CollectionPage` + `BreadcrumbList` + `ItemList`（ItemList 指向各平台**官方定价页**，与套餐页同一口径） |
| 控件 | **零控件**：v1 是预渲染静态表（无 JS 可折叠、无筛选排序） |
| 未知三态 | `未标注`（文本）/ `—`（数值）/ `未确认`（三态）—— 复用 `plans-page` 的常量 |
| 结构断言 | `assertPageHonesty()`：表头列数 · **输入/输出/缓存命中三列逐格与数据对账** · 计费单位列逐行在位 · 免费额度与 credits 两处口径一致 · 无 JS 控件 · 无结论性词汇（**复用套餐页的同一份清单**） |
| 真浏览器 | `verify-site.js` §20：行数 · ItemList 声明数 · 三列逐格 · 单位列逐行 · 官方链接 · 0 控件 · 锚点 · canonical · 面包屑深度 · 页脚入口 · 与套餐页互链 · 390/360px 无页面级溢出 · sitemap 成员 |

**三条页面承诺**（都有断言）：
1. 只列事实，不做结论（与套餐页共用 `FORBIDDEN_CLAIM_WORDS`）；
2. **单位永远与数字同时出现**，且不做换算；
3. `0` 渲染成「免费」、`null` 渲染成「—」，两者绝不互相顶替。

**本阶段不做**：筛选 / 搜索 / 排序控件、成本计算器、模型能力比较。
没有专属订阅源（`/plans/api/` 只声明与首页同一组根 Feed）—— 变化源与 `/changes/` 分栏的扩展
是独立的一次改动，登记在阶段报告里。

---

## 16. 校验与门禁

**硬错误（拦发布）**：形状 / `schemaVersion` / 未知键 / 非规范序 / 重复 id 或身份 ·
`pricing.unit` 与 token 单价的一致性 · `models` 空或超限 · `(modelKey, variant)` 重复 ·
模型条目没有任何价格 · `mediaRates` 缺单位 · `limits.appliesTo` 指向不存在的模型 ·
`freeTier.models` 不在记录里 · `credits` 的 token 键 / `usageNote` / 币种一致性 ·
`derivedMetrics` 与推导结果不一致 · `provider` 未登记 · 引文缺失或非法 ·
`verified` 非 true / 日期关系非法。

**`--strict`**：`api-plans.json` 条数 < 5 ⇒ 红（与 plans 同一条"小而可靠"的下限）。

**接入点**：

- `npm run validate`（含 `--strict`）→ `checkApiPlansFile()` + `checkApiPlanHistoryFile()`；
- `npm run build` → 校验（不过就中止）→ 页面渲染 → 产物自检（从磁盘回读再跑一遍断言、
  发布数据逐字节比对、`api-plan-history.json` 逐字节发布）；
- `npm run selftest:api-plans` → **76 项离线演练**（含四条 Tooth Test，进 CI 门禁）；
- `npm run check:api-plans:reproducible` / `check:api-plan-history` → 两道门禁步骤；
- `npm run verify` → 真浏览器 §20。

**门禁步骤 31 → 34 步**（`GATE_STEP_NAMES` 与 `action.yml` 同索引同步）；
`FROZEN_ASSERTION_NAMES` 与 `--expect-checks=35` **不变**（它们数的是
`check-ci-consistency.js` 自身的断言，不是门禁步骤）。

---

## 17. 本阶段**不做**的（逐条可核对）

模型能力排行榜 / AA 分数 / benchmark 聚合 / 综合推荐 / 「最值得买」/ 自动模型推荐 /
API 成本模拟器 / 工作负载计算器 / 跨币种与跨单位换算 / credits→token 折算 /
模型注册表 / `/plans/` hub 页 / `/plans/api/` 的筛选排序控件 / 专属订阅源 / `/changes/` 分栏扩展。
