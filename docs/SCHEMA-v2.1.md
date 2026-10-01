# SCHEMA v2.1 —— Coding Plan 数据契约（`plans.json` v1 + `/plans/coding/`）

> 本文件是 `v2.1-coding-plan-data-model` 的**契约**：实现与本文不一致时以本文为准；改实现必须同时改本文与
> `scripts/tools/plans-selftest.js` 的夹具。
> 本阶段分两段落地：**第一段**建数据契约（`plans.json`），**第二段**把它发布并做成页面
> （`/plans/coding/`）—— 第二段的内容见 §16。
> 前序契约：[`SCHEMA-v1.1.md`](SCHEMA-v1.1.md)（学生/开发者模型）· [`SCHEMA-v1.3.md`](SCHEMA-v1.3.md)（出处）·
> [`SCHEMA-v1.4.md`](SCHEMA-v1.4.md)（优惠历史）· [`SCHEMA-v1.5.md`](SCHEMA-v1.5.md)（变化雷达）·
> [`SCHEMA-v1.6.md`](SCHEMA-v1.6.md)（订阅）· [`SCHEMA-v1.7.md`](SCHEMA-v1.7.md)（落地页）。

---

## 1. 这一层干什么、不干什么

**干**：给「长期使用时各平台提供什么套餐」建立一套**独立于 Deals**、可校验、可重建、能为后续
变化追踪打底的数据契约，并用 9 条官方页可取证的真实套餐把它落地，最后渲染成一个**只列事实**的
静态对比页 `/plans/coding/`。

**不干**（一条都没做，且由 `plans-selftest.js` 的断言钉住）：

- 不做综合排行榜、不做星级评分、不做 benchmark、不做"性价比"结论；
- 不做 API plan（Phase 2.5）、不做 Plan History / Change Tracking（Phase 2.3）、
  不做 Deals ↔ Plans 关联（Phase 2.4）；
- 不做汇率换算（没有汇率系统就不换，只比同币种）；
- 不建模型注册表（题面 §六："先保持简单，不要过度设计"）；
- 不做筛选 / 搜索 / 排序控件：对比页第一版是**预渲染的静态表**（无 JS 可读），
  把"哪一列该排在哪"这种事交给读者；
- 不做套餐详情页（`ItemList` 指向各平台官方定价页，不伪造本站的 `/plans/<id>/`）。

### 1.1 与 Deals 的隔离（这是本阶段的第一条设计约束）

| 维度 | Deals | Plans |
|---|---|---|
| 文件 | `deals.json`（仓库根，发布进 dist） | `plans.json`（仓库根，**同样发布**进 dist，v2.1 第二段起） |
| schemaVersion | 2 | 1 |
| 数组名 | `deals` | `plans` |
| 回答的问题 | 现在有哪些优惠 / 福利 / 活动 | 长期在售的套餐是什么 |
| 身份字段 | `vendor`（采集来的原始串，渲染期归一） | `provider`（必须是登记过的规范 key） |
| 来源字段 | `source` = **采集器名**（登记在 `provenance.SOURCE_TYPES`） | `source` = **页面类型**（`Official-Pricing` / `Official-Docs` / `Official-Announcement`） |
| 可重建门禁 | `check-reproducible.js`（值必须有源） | `check-plans-reproducible.js`（文件必须是来源层产出的那一份） |
| 页面 | 首页 + 落地页 + 详情页 | `/plans/coding/`（一张表） |
| 是否互相注入 | 否 | 否 |

两者唯一的共享是**判据**，不是数据：`schema.js` 的清洗/日期/URL 工具、
`provenance.js` 的引文层、`audience.js` 的三态字面量、`vendor-slugs.json` 的 slug 规则。
**采集链路一个字都不提 plans**（`plans-selftest` 的 §⑪ 静态扫描钉住这条边界）。

### 1.2 与 deals 的语义冲突及处置（逐条）

| # | 冲突 | 处置 |
|---|---|---|
| C1 | `period` 在 `billing` 与 `quota` 下都出现 | 都保留（义不同）：`billing.period` = 多久被收一次钱；`quota.period` = 额度多久刷新一次。派生指标要求两者**相等**才计算 |
| C2 | deals 的 `priceLine`（自由文本"免费 → $20/月"） | Plans **不设** `priceLine`：价格只进 `billing` 的数值字段，不产出任何"性价比"文本 |
| C3 | deals 的 `pricingModel`（free/paid/…） | Plans **不复用**该字段名：同名不同义会诱导把枚举当价格读。免费档用 `billing.regularPrice = 0` 表达 |
| C4 | deals 的 `source` 是采集器名 | Plans 用独立登记表；**不**登记进 `provenance.SOURCE_TYPES` |
| C5 | deals 的 `provenance`（可信度块） | Plans 只复用 `evidence`（引文），**不引入** `credibility / contrib / fields` —— 那套是 merge 仲裁的产物，Plans 没有 merge |
| C6 | deals 的 `availability.chinaUsable`（三态） | Plans 只存 `region`；"中国大陆可用/地区限制"由 `restrictions` 的 `region_restriction` 承担，避免两处表达同一件事 |
| C7 | `vendor` vs `provider` | 两套身份空间，不合并；交叉一致性用 slug 断言（§9）。同一公司允许有两个 provider（字节的"火山引擎"与 Trae），但必须逐条登记 |
| C8 | `evidence.field` 的白名单是 deals 的 10 个字段 | `provenance.normalizeEvidence/normalizeEvidenceItem/auditEvidence` 增加了 `opts.fields`，**默认值不变**；Plans 传 `PLANS_EVIDENCE_FIELDS` |
| C9 | 题面示例键名 `nominalCNYPer100MTokens` 把币种写进了键 | 改为币种中立的 `derivedMetrics.nominalUnitPrice`（内含 `currency`）。理由：题面 §九 明确"真值层不得改写成人民币、没有汇率系统就先只比同币种"。**这是对题面示例的有意偏差，在此登记** |
| C10 | `isGarbage()` 对 <3 字符一律判垃圾 | Plans 的 `planName` / 模型名 / 文本字段**不使用** `isGarbage`（会误杀 `o3`、`Go`），改用"非空 + 长度上限 + 规范形态" |

---

## 2. 顶层形状与字节确定性

```json
{ "schemaVersion": 1, "updatedAt": "2026-10-01T00:00:00+08:00", "count": 9, "plans": [] }
```

1. 键序固定如上；2 空格缩进；末尾一个换行（与 `deals.json` 同一套写法）。
2. `count === plans.length`。
3. **`updatedAt` = 全部 `lastSeen` 的最大值 + `T00:00:00+08:00`**；没有记录时为 `null`。
   **它不读墙上时钟** —— 没有采集器，就没有理由说"这份数据是今天采到的"。
   这条同时让重建成为确定性的（同一份输入两次重建逐字节相同）。
4. `plans` 按 `${kind}|${provider}|${planNameKey}|${billing.period}` **升序**排列：
   打乱人工来源层的数组顺序，产出必须逐字节相同（`plans-selftest` 有断言）。
5. 所有数组（`supportedModels` / `restrictions` / `evidence`）在重建期按固定规则排序，
   不保留输入顺序 —— 顺序漂移不是变化，不该产生 diff。

---

## 3. 字段表与枚举

记录的字段与顺序（**顺序即序列化序**，改动会让全库 diff 漂移）：

```
id · kind · provider · planName · officialUrl · source · sourceUrl · region
billing · quota · supportedModels · restrictions
firstSeen · lastSeen · verified · verifiedAt · evidence · derivedMetrics
```

| 字段 | 类型 | 规则 |
|---|---|---|
| `id` | 12 位小写 hex | **派生**（§10）。不得手写；校验器重新推导后逐字段比对 |
| `kind` | `"coding"` | `PLAN_KINDS = ['coding']`；为 Phase 2.5 的 `BasePlan / CodingPlan / ApiPlan` 留判别位 |
| `provider` | string | 必须是 `scripts/data/providers.json` 里的规范 **key**（未登记硬红，§9） |
| `planName` | string | 非空；NFKC + 折叠空白 + 去首尾空白后的规范形态；≤ 80 字（**超长报错，不截断**） |
| `officialUrl` | string | http(s)、无追踪参数、host 不在 `AGGREGATOR_HOSTS`；**厂商官方定价/套餐页** |
| `source` | enum | `Official-Pricing` / `Official-Docs` / `Official-Announcement`（登记制） |
| `sourceUrl` | string | 读到该事实的具体页面（缺省 = `officialUrl`）；同一套 URL 判据 |
| `region` | `cn \| global` | 复用 `schema.REGIONS`（主要销售市场） |
| `billing` | object | §4 |
| `quota` | object | §5，必填 |
| `supportedModels` | array \| null | §6；`[]` 非法（缺席 = `null`） |
| `restrictions` | array \| null | §7；`[]` 非法 |
| `firstSeen` / `lastSeen` | `YYYY-MM-DD` | 人工写；非未来；`firstSeen ≤ lastSeen` |
| `verified` | `true` | v2.1 **必须为 true**：每一条都是人工对照官方页核过的，没核过就不该收进来 |
| `verifiedAt` | `YYYY-MM-DD` | 非未来；且 `verifiedAt ≤ lastSeen`（"只确认套餐还在、没重新核对事实"是合法状态） |
| `evidence` | array | **至少 1 条**（与 deals 的"可选"不同：每条价格/额度都必须能引官方原文）；复用引文层（≤3 条 × ≤200 字、官方 host、不截断） |
| `derivedMetrics` | object | §8，**永远存在**；不可比较时值为 `null`（不是省略键） |

**上限常量**（超限一律硬红，绝不自动截断）：
`MAX_PLANS=200` · `MAX_PLAN_NAME=80` · `MAX_NOTE=200` · `MAX_QUOTA_DESCRIPTION=200` ·
`MAX_MODELS=24` · `MAX_MODEL_NAME=60` · `MAX_MODEL_NOTE=120` · `MAX_RESTRICTIONS=12` ·
`MAX_RESTRICTION_NOTE=120` · `MAX_RESTRICTION_TEXT=60` · `MAX_PRICE=1_000_000` · `MAX_QUOTA_AMOUNT=1e15`。

### 3.1 严格归一：不静默清洗

与 deals 的 `makeDeal`（容忍多种写法、能洗就洗）不同，`makePlan` 对**规范形态**是严格的：
文本超长、前后多余空白、URL 带追踪参数、枚举拼错、`planName` 非规范形态 —— 一律**报错**而不是
悄悄改正。唯一的例外是日期（复用 `normalizeDate` 接受 `2026/10/01` 这类写法，存成规范形态）。

理由：被静默改写的输入与"本来就没写"在产物里长得一模一样（v1.1 的 `audienceDropped` /
v1.3 的 `evidenceDropped` 就是为这类事补的）。构造期就报错比事后再对账更便宜。

---

## 4. 价格模型

```json
"billing": { "period": "monthly", "currency": "CNY",
             "regularPrice": 99, "promoPrice": 69, "promoNote": "首月优惠低至 ¥69/月", "note": null }
```

| 字段 | 规则 |
|---|---|
| `period` | `monthly` / `yearly` / `one_time` / `usage_based` / `other`，必填 |
| `currency` | `CNY` / `USD` / `HKD` / `EUR` / `JPY` / `GBP` / `SGD`；**当且仅当两个价格都是 null 时允许 null**（没有金额就没有币种） |
| `regularPrice` | `null` 或 `[0, MAX_PRICE]` 的有限数。**`null` = 原价未知；`0` = 确实免费**。绝不用 0 占位 |
| `promoPrice` | `null` 或 `(0, MAX_PRICE]`。活动价**不替代**原价 |
| `promoNote` / `note` | 可选清洗文本 ≤200 |

**唯一的价格关系判据**：`regularPrice` 与 `promoPrice` **都非 null** 时必须 `regularPrice > promoPrice`。

这一条同时挡住两种错误：

- **原价未知却填 0**：`regularPrice=0` + `promoPrice=49` ⇒ `0 ≤ 49` ⇒ 红。
  "原价未知"只有 `null` 一种诚实写法。
- **活动价高于原价**：`regularPrice=49` + `promoPrice=68` ⇒ 红。

而"只有活动价、原价确实不知道"是**合法**的（`regularPrice: null` + `promoPrice: 49`），
这正是题面 §三 点名要求支持的场景。真实数据里 `智谱AI GLM Coding Plan Lite` 就用了
`regularPrice: null`（官方文档页确实没公布当前档位价格）。

---

## 5. 额度模型：为什么不能统一成 Token

```json
"quota": { "type": "credits", "amount": 2000, "period": "rolling",
           "description": "每 5 小时 2,000 积分 + 每周 10,000 积分双窗口上限…",
           "conversionDependsOnModel": true }
```

| `type` | `amount` | `description` | 说明 |
|---|---|---|---|
| `tokens` | **必填** > 0 | 可选 | 厂商**明确给出** Token 额度时才能用它 |
| `credits` | **必填** > 0 | 可选 | `conversionDependsOnModel` **必填**（boolean） |
| `requests` / `messages` / `compute_units` | **必填** > 0 | 可选 | 按次/条/算力计 |
| `rate_limited` | **必须为 null** | **必填** | 限速（如"每 5 小时刷新"）。写 `amount` 一律红 |
| `unlimited_fair_use` | **必须为 null** | **必填** | 公平使用。写 `amount` 一律红 |
| `other` | 可选 null 或 > 0 | **必填** | 语义全在文字里（如"共用积分池、未公布数值"） |

其它规则：

- `period` ∈ `monthly / yearly / weekly / daily / hourly / rolling / one_time / other`，或 `null`（未标注）。
- `conversionDependsOnModel`：**只允许出现在 `credits` / `other` 上**。
  → `quota.type='tokens'` 且该字段为 `true` 判红：这正是题面 §五 说的"额度随模型倍率变化时
  必须表达为 credits，不得伪装成固定 Token"。
- **没有**任何能把 `requests` / `credits` / fair use 折算成 Token 的真值字段。
  为了做统一排行榜而折算，是本阶段明确拒绝的做法。

---

## 6. 模型支持

```json
"supportedModels": [ { "name": "GLM-5.3", "role": "included", "note": null } ]
```

- `name` 非空 ≤60（**不用 `isGarbage`**，避免误杀 `o3` / `Go`）；归一化名去重（NFKC + 折叠空白 + 小写）。
- `role` ∈ `included`（可直接使用，缺省值） / `limited`（可用但受限） / `pool`（动态模型池） /
  `family`（模型族）。
- 数组按 `(role 顺序, name)` 排序 → 与输入顺序无关。
- 没有模型信息时写 `null`；**空数组非法**（"写了空"与"没有"在渲染层走的分支完全不同）。
- **不建模型注册表**：仓库里没有可复用的 model registry（只有 `MODEL_LOGO_RULES` 这个 logo 匹配器），
  本阶段也不新建 —— 模型名以厂商原文为准。

---

## 7. 限制条件与三态

```json
"restrictions": [
  { "kind": "rolling_window", "value": "5 小时动态刷新 + 7 天周周期", "note": "额度耗尽后需等待下一个 5 小时周期恢复" },
  { "kind": "new_user_only", "value": "unknown", "note": "官方页面未说明领取资格" }
]
```

`kind` 与 `value` 的类型（**同一 kind 在同一套餐内不得重复**；数组按 kind 声明序排序）：

| kind | 值类型 |
|---|---|
| `concurrency` / `per_day_cap` | 正数 |
| `rate_limit` / `rolling_window` / `output_limit` / `region_restriction` | 非空文本 ≤60 |
| `fair_use` / `account_required` / `invite_only` / `new_user_only` | `true` / `false` / `"unknown"` |

**三态语义与 deals 完全一致**（`scripts/lib/audience.js` 的既有约定，本文件不另立一套）：

- **缺席**（没有这条 kind）= 没写；
- `false` = 来源**明说**"不是"；
- `"unknown"` = **查过、来源没说明**。它必须带非空 `note` 说明依据
  （沿用仓库"推断必须带备注"的既有纪律）。

`0` / `1` / `"true"` / `"false"` 这些字面量一律拒绝 —— **为未知值填 `false` 是硬错误**。

---

## 8. 派生指标：什么时候算、什么时候必须为 null

```json
"derivedMetrics": { "nominalUnitPrice": {
  "price": 1, "currency": "CNY", "per": 100000000, "basis": "monthly", "priceField": "regularPrice" } }
```

**五个条件同时成立才产出**（否则一律 `null`）：

1. `quota.type === 'tokens'` 且 `quota.amount` 有限且 > 0；
2. `quota.period` 非 null、**等于** `billing.period`，且该周期 ∈ `{monthly, yearly}`；
3. `currency` ∈ 币种白名单；
4. 当前使用价格（`promoPrice ?? regularPrice`）有限且 > 0；
5. `quota.conversionDependsOnModel !== true`。

计算：`price = round6(当前价 / amount × 1e8)`；`per = 1e8`（每 1 亿 tokens）；
`basis` = 计费周期；`priceField` = 用的是原价还是活动价。**不做任何币种换算，也不做 12 个月的隐含换算**
（年付就以年为口径，`basis` 里写明）。

**口径声明**（"名义 Token 单价只用于粗略比较，不代表不同模型 Token 实际价值相同"）是常量
`PLAN_WORDING.nominalUnitPriceNote`，**不写进数据**（每条记录重复同一句话只会让文件变噪）。Phase 2.2
的页面必须显示它。

**校验做法**：把 `deriveMetrics()` 再跑一遍，与盘上的 `derivedMetrics` 逐字节比对。
这一条同时覆盖"requests 套餐被硬塞 Token 单价"、"手算错值"、"不可比较却生成了单价"。

### 8.1 真实数据的结果：9 条全部为 null（这是结论，不是缺省）

初始数据集里**没有一条**能算出名义 Token 单价：6 条按积分（credits）、2 条是用量池（other）、
1 条按窗口限速（rate_limited）。**没有任何一家厂商在官方页面上给出固定的 Token 额度**：

- 智谱的积分按 `(输入 Token × 系数 + 缓存命中 × 系数 + 输出 × 系数) / 10000` 折算，系数随模型变；
- Trae / Qoder / CodeBuddy / GitHub Copilot 卖的都是积分或 AI Credits；
- Kimi 是共用积分池且未公布数值；MiniMax 是 5 小时 + 周窗口；Cursor 是用量池。

智谱文档页另有一张"可用额度参考（亿 Tokens/周）"的表，但**随缓存命中率变化**，不是一个固定数值 ——
按契约它属于"额度折算随模型倍率变化"，只能记成 `credits`，不能记成固定 tokens。
这正是本阶段要证明的事：**宁可 9 条全 null，也不把不可比较的东西强行换算**。

"可计算"这条路径由 `plans-selftest.js` 的夹具覆盖（60 元 / 60 亿 tokens = 1 元每亿，年付 = 10 元每亿；
活动价优先并记录 `priceField`），并有牙守着手算错值与不该算却算了的情形。

---

## 9. Provider 归一与 slug 一致性

`scripts/data/providers.json`（键 = provider key）：

```json
"zhipu": { "name": "智谱AI", "slug": "zhipu", "aliases": ["智谱ai","智谱","zhipu","bigmodel","glm"], "logo": "zhipu" }
```

1. **`provider` 存 key，不存显示名**：显示名可改（"智谱AI" → "智谱"）而 **id 不变**。
2. `key` / `slug` 必须匹配 `^[a-z0-9][a-z0-9-]*$` 且各自全局唯一；`name` 唯一。
3. `aliases` 必须**已经是归一形态**（NFKC + 去首尾空白 + 折叠空白 + 转小写），
   匹配方式是**精确相等**：刻意不做子串/正则匹配（子串匹配在本仓库有实测教训：
   `/krea/i` 会命中 "Kreado AI"）。
4. **未登记一律硬红**并给出建议 key —— 逼人做一次显式登记，而不是静默产生新身份。
5. **与 deals 侧交叉一致性**：若某个 provider 的 `name` 恰好也是 `vendor-slugs.json` 的键，
   两边的 `slug` 必须逐字相同（`/vendor/<slug>/` 与将来 `/plans/coding/<slug>/` 会挂在同一个站上）。
   真实数据里这条断言在 `智谱AI` / `MiniMax（稀宇科技）` / `GitHub` 三家上生效。
6. **同一公司允许有两个 provider**：字节跳动的"火山引擎"（deals 的厂商）与 `trae`
   （Trae 是独立产品线）就是这种情况；`腾讯云`（deals）与 `腾讯 CodeBuddy`、`月之暗面`（deals）
   与 plans 的 `月之暗面` 亦同。这类决定逐条登记在 `providers.json` 的表头与阶段报告里。
7. `SLUG_RE` 在 `providers.js` 里写了一份，`plans-selftest` 有一条断言逐字比对它与
   `landing.js` 的 `SLUG_RE` —— 两份判据不许分家。

---

## 10. ID 策略

```
planNameKey = NFKC(planName) → 折叠空白 → trim → toLowerCase
id = sha1(`${kind}|${provider}|${planNameKey}|${billing.period}`).slice(0, 12)   // 12 位小写 hex
```

- **不进 basis**：价格、额度、日期、URL、官方案例文案、证据 —— 因此
  **改价 / 改额度 / 换官方页 / 改备注都不换 id**（题面 §十，有牙守着）。
- **进 basis**：`kind` · `provider`（规范 key）· `planNameKey` · `billing.period`。
  - `kind` 是为 Phase 2.5 预留的（避免 coding/api 同名套餐撞 id）；这属对题面建议的**有意增强**。
  - `billing.period` 进 basis 是**刻意的取舍**：月付与年付是两个可售 SKU、价格不可直接比较，
    本就该是两条记录。
- **同一平台的同一套餐只能有一条记录**：数据集级同时检查 `id` 唯一与
  `identityKey = ${kind}|${provider}|${planNameKey}|${period}` 唯一（双重保险，手写 id 也拦得住）。

**已知限制**：`billing.period` 进 basis ⇒ 同一套餐从月付改年付会被视作两个身份。
Phase 2.3 做变化追踪时若遇到这种情况，必须**显式决策**（按 `ended + created` 记，或另立关系），
不能让它变成两件没人注意到的孤立记录。

---

## 11. 来源策略

1. 每条 plan 必须能追溯：`officialUrl` + `source` + `sourceUrl` + `lastSeen` + `verifiedAt` + ≥1 条 `evidence`。
2. **优先官方页面**。`officialUrl` 的 host 不得是聚合站（`layer3labs.io` / `futuretools.io` /
   `futurepedia.io` / `aitools.fyi`），引文的 `sourceUrl` 同样不得是聚合站。
3. **第三方套餐对比站只能用于发现候选**：候选若最终只有第三方证据，**不得进入 `plans.json`**，
   只能在阶段报告里单列"候选未采信"。`source` 的登记表里也没有第三方值。
4. 引文层复用 `provenance.js`：≤3 条 / 每条 ≤200 字（**超长拒收，不截断**）、
   `capturedAt` 不得是未来、按字段序 + 引文 + 日期确定性排序。
5. **引文是有界抽样而不是全文覆盖**：每条最多 3 条，最先保证的是价格与额度口径的那几句原话。

---

## 12. 校验器判据清单

`scripts/lib/plan-schema.js` 的 `validatePlan()`（单条）与 `validatePlansStore()`（数据集）：

**单条**（判据 = 把归一器再跑一遍 + 少数归一器表达不了的东西）

1. `id` 形状 `/^[0-9a-f]{12}$/`，且**等于重新推导的 id**（手改 id ⇒ 红）；
2. 未知字段白名单（拼错的字段名不会静默消失）；
3. `kind` / `provider`（已登记）/ `planName`（规范形态 + 长度）；
4. `officialUrl` / `sourceUrl` 合法、无追踪参数、非聚合站；
5. `source` 在登记表内；
6. `region` 在枚举内；
7. `billing`：周期/币种枚举、价格范围、币种与价格的一致性、`promoPrice` 与 `regularPrice` 的关系（§4）；
8. `quota`：类型枚举、量纲型必须有正数 `amount`、非量纲型必须没有、`description` 必填规则、
   `conversionDependsOnModel` 的适用范围（§5）；
9. `derivedMetrics` 逐字节等于重新推导的结果（§8）；
10. `firstSeen` / `lastSeen` / `verifiedAt` 格式、非未来、`firstSeen ≤ lastSeen`、`verifiedAt ≤ lastSeen`、
    `verified === true` 且 `verifiedAt` 非空（双向断言）；
11. `supportedModels`：null 或非空数组、name/role/note 合法、归一化名唯一；
12. `restrictions`：null 或非空数组、kind 枚举且不重复、value 按 kind 判型、三态字面量、
    `"unknown"` 必须带 note；
13. `evidence`：≥1 条且归一后形态逐字节一致；
14. 键序与嵌套键序（差异比对是 JSON 级别、对键序敏感 —— 键序也是契约）。

**数据集级**

15. `schemaVersion === 1`；`count === plans.length`；条数 ≤ `MAX_PLANS`；
16. `updatedAt === max(lastSeen)` 派生的规范值（§2）；
17. `id` 唯一 **且** `identityKey` 唯一；
18. 记录顺序等于规范序；
19. `providers.json` 自身合法（key/slug 形状与唯一、alias 唯一且已归一）+ 与 `vendor-slugs.json`
    的 slug 一致性（§9）。

**人工来源层对账**（`loadCuratedPlans()`，由 `validate.js` 翻成硬错误）

20. `id` / `derivedMetrics` 出现在人工文件里 ⇒ 红（派生字段不是输入）；
21. 引文"写了却没生效"逐条报出（枚举拼错、超长、聚合站出处、未来日期、超上限）。

**strict 模式**（`validate.js`）：`plans` 条数 < 5 ⇒ 红（"少而可靠"的下限）。
上限不设门禁：`MAX_PLANS` 是结构上限，而"别一次采几十个平台"是人的判断。

---

## 13. 可重建管线

```
scripts/data/curated_plans.json  ──(makePlan 归一 / 算 id 与 derivedMetrics)──▶  plans.json
        （人写事实，不写 id / derivedMetrics）
```

- `npm run plans:rebuild`：写盘；`--dry-run` 只报差异（按 id 逐字段 diff）。
  **写盘前跑完整的数据集级校验**，任何一条不合格就拒绝写（`assertValidStore`）。
- `npm run check:plans-reproducible`：同一套 `buildStore()` 重算后与盘上**逐字节**比对，不一致退出 1。
- 只要有人改了 `curated_plans.json` 忘了重建、或手改了 `plans.json`，CI 立刻红 ——
  这正是我们想要的行为（与 deals 的 `check:reproducible` 同构，但红的含义不同：
  那边是"值没有源"，这边是"文件不是源产出的"）。
- `updatedAt` 与 `lastSeen` **一律不动**：没有采集器，就没有理由盖今天的章。

**给 Phase 2.3 的前置收益**：`plans.json` 是确定性产物且入仓，所以"上一状态"天然可恢复
（可照 v1.4 做一次性 baseline + 追加事件），而 `firstSeen` / `lastSeen` 已经在记录里。

---

## 14. 门禁接入

- `selftest:plans` → **`Plans self-test (data + page)`**（门禁步骤，离线，135 项含全部牙：
  数据层 117 项 + 边界扫描 3 项 + 页面层 15 项）；
- `check:plans:reproducible` → **`Plans reproducibility (curated → plans.json, byte-compare)`**（门禁步骤）；
- `plans.json` 的**数据**合法性由既有的 `Validate data (strict)` 步骤覆盖（`validate.js` 的
  `checkPlansFile()`），因此没有为它新增第三个步骤；
- 门禁步骤 27 → **29 步**（`GATE_STEP_NAMES` 与 `action.yml` 同索引同步）；
- `FROZEN_ASSERTION_NAMES` 不变 ⇒ `--expect-checks=35` **不变**。

## 15. 本阶段**不做**的（与 §1 呼应，逐条可核对）

综合排行榜 / 星级评分 / 模型 benchmark / API plan / 全量采集 / 用户推荐算法 /
AI 自动判定套餐价值 / 汇率换算 / 模型注册表 / Plan History / Deals↔Plans 关联 /
筛选与排序控件 / 套餐详情页。

AI（`scripts/ai/**`）**完全没有参与**本阶段的数据判定：`curated_plans.json` 的每一行都是人工
从官方页读出来并附上原文的。

---

## 16. 页面与接线（v2.1 第二段）

### 16.1 路由与它为什么不是"落地页家族"

`/plans/coding/` 是**独立静态页**，走 `/status/` `/changes/` `/feeds/` 那条既有路径，
**不是** `landing.js` 的落地页家族的一员：家族页都是"按数据分组、一个组一页、有门槛"，
而套餐对比页只有一条路由、不分页、不需要门槛。硬塞进那张家族表，只会为"统一"引入一条
永远只有一个成员的注册表。

代价是下面**四张清单必须显式加上它**（`.github` 那一步不算，它与页面无关）：

| 清单 | 位置 | 漏了会怎样 |
|---|---|---|
| 页脚路由占位符 | `build-local.js` 的 `ROUTE_HREFS` + `index.html` 的共享页脚 | 页脚入口指向不存在的地址 |
| sitemap 条数公式与成员断言 | `build-local.js` 的 `expectedLocs` / `sitemapEntries` | 构建红（硬门禁，不是"为了让测试通过"） |
| `pageRoutes`（Feed 内链可解析性） | `build-local.js` | Feed 里的站内链接被判成死链 |
| 逐层页脚前缀扫描 + 订阅声明扫描 | `build-local.js` 的两张 `routeOutputs` 表 | 深度前缀写错（`../` vs `../../`）无人发现 |

另外 `seo-verify.js`（独立验收）从 dist 现场重新推导页面类型，所以它**也**显式登记了
`plans/coding/ → kind=plans`（单层路由能从字符串推出来，两级推不出来）。

### 16.2 页面契约

| 项 | 值 |
|---|---|
| 路由 | `/plans/coding/`（两层，回站根是 `../../`） |
| 标题 / `<h1>` | `AI Coding 套餐对比` |
| 列 | 平台 · 套餐 · 正常价格 · 当前活动价 · 计费周期 · 可用模型 · 额度类型 · 原始额度 · 名义 Token 单价 · 最近更新 · 备注 |
| 行的数据标记 | 每行一个 `data-item="<plan id>"`（`ItemList` 的行数断言靠它） |
| JSON-LD | `CollectionPage` + `BreadcrumbList` + `ItemList`（三段，一段一个对象） |
| `ItemList` | 每条指向**该套餐的官方定价页**（与首页同一条口径）。因此 `itemlist-members` 在构建期与独立验收里都显式关掉 —— **声明数 == 元素数 == 页面行数**三条照常查 |
| feed | 声明两个根 Feed（这一页自己不产出条目：套餐表不是"内容更新"） |
| 索引 | 可索引、进 sitemap、priority `0.9`（与分类页同级：**它是入口**），`changefreq: weekly` |
| 正文下限 | `600 + 60×条数`（= 1140）· 实测 2971 字 |
| 移动端 | 11 列宽表放在 `.ptable-wrap { overflow-x: auto }` 里，390/360px 页面级溢出 0px |

### 16.3 未知的三种写法（H4b 在页面上的落点）

| 形态 | 用在哪 | 例子 |
|---|---|---|
| `未标注` | 文本类字段缺失 | 原价未知（智谱 GLM Coding Plan Lite）、没有模型清单 |
| `—` | 数值类字段缺失 / **不可比较** | 没有活动价、名义 Token 单价算不出 |
| `未确认` | 三态字段 | 限制条件的 `"unknown"`，以及 `是` / `否` 之外的第三种 |

**「原价未知」与「确实免费」必须长得不一样**，而且在断言里是**成对**的：
`regularPrice === null` ⇒ 必须显示 `未标注`；`regularPrice === 0` ⇒ 必须显示含 `0` 的数字。
只查一半（比如"未知不许是 0"）会在另一个方向漏掉 —— 把免费档也写成"未标注"，读者就再也看不到它。

### 16.4 结论性词汇：从产品规则变成可失败的断言

唯一出处是 `scripts/lib/plans-page.js` 的 `FORBIDDEN_CLAIM_WORDS`
（性价比 / 最划算 / 最超值 / 最值得买 / 值得买 / 排行榜 / 排行 / 综合评分 / 星级 /
推荐指数 / TOP 1 / TOP1 / 第一名 / 最优选）。**三处查同一份清单**：

1. 构建期 `assemble()`：渲染后立刻查内存里的字符串，有问题直接终止构建；
2. 构建期产物自检：**从磁盘回读**页面再查一遍（"内存里对、盘上不对"是另一种坏法）；
3. 真浏览器 `verify-site.js` §19：查渲染出来的 `innerText`（浏览器镜像的那一份清单）。

刻意**不**收录的：`推荐` / `排序` —— 页脚既有句子「本站不收录付费推广位，排序与推荐理由不出售」
里就有这两个词，把裸词写进清单会让每条断言永远为真。

数据层同样查一遍（`assertDataHonesty`）：套餐名、`billing.note`、`billing.promoNote`、
`quota.description` 里出现这些词一律构建失败。

### 16.5 页面的 fail-closed 守卫

`planRowOf()` 只在 `quota.type === 'tokens'` 时才显示名义 Token 单价。
数据层已经保证过这件事（`validatePlan` 把 `derivedMetrics` 与重新推导的结果逐字节比对），
所以正常数据上这一行没有作用 —— 它挡的是"数据被绕过"的那一种：
把 requests / 限速 / 用量池显示成一个 Token 单价，是这一页**最坏**的错（读者会拿它去比"谁更便宜"），
而多加一个条件的代价只有一行。`plans-selftest` 有一条牙专门验它。
