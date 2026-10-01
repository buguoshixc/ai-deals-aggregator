# SCHEMA v2.4 —— 优惠 ↔ 套餐关联（`deal-plan-links.json` · Deal 页「关联的正常套餐」· 套餐页「各套餐当前优惠」）

> 前置：v2.1 的 `plans.json`（套餐数据模型）、v2.3 的 `plan-history.json`（套餐变化）、v1.4 的
> `deal-history.json`（优惠历史）。这一层不修改它们任何一个字段。

## 1. 这一层干什么、不干什么

**干**：把「这条优惠对应哪个正常套餐」「这个套餐现在有没有优惠」变成**可校验的显式关系**，
并在优惠页与套餐页之间建立双向跳转。

**不干**：
- 不把关系写进 `deals.json` / `plans.json` 的记录里（见 §2）；
- 不做模糊自动关联：标题/URL 相似度只用于**候选报告**（§11），生产关系必须人工写、且带官方出处；
- 不跨币种、不跨计费周期折算任何价格（§8）；
- 不因为优惠结束而下架套餐（套餐是长期在售的 SKU，优惠只是它的一段时间状态）。

## 2. 为什么是独立关系表，而不是往记录里加 `relatedPlanIds`

题面允许两种做法（记录内字段 / 单独关系表），**这里选后者**，理由是现有架构的三条硬约束：

1. **两个数据集的字段集是封闭的**。`validateDeal` 有字段白名单，未知字段直接报错；
   `validatePlan` 会把「归一器再跑一遍」的结果与盘上逐字段比对 —— 多一个字段就是不一致。
   往记录里加关系字段要同时改 schema、`mergeAll`、`strip`、键序与可重建性门禁。
2. **两个数据集都是派生产物**。`deals.json` 由 `npm run collect` 重新推导、
   `plans.json` 由 `npm run plans:rebuild` 推导。记录里手写的字段会在下一次重建时**静默消失**
   （不会有任何断言变红 —— 这正是最坏的坏法）。
3. **关系是人的显式断言**，与 `providers.json` / `vendor-slugs.json` / `audience-overrides.json`
   同类：人工维护、单独校验、单独发布。放独立文件之后，`deals.json` / `plans.json`
   **一个字节都不用改**（`check:reproducible` / `check:plans:reproducible` 因此完全不需要认识这一层）。

反过来，关系**视图**（§9）走的是仓库里已有的「派生字段只进 dist」范式
（`collections` / `needs` / `sourceFacts` / `history`）：构建期算一次，注入 `dist/deals.json`，
浏览器与静态详情页读同一份，不新增任何 fetch。

## 3. 顶层形状与字段

真值文件：`scripts/data/deal-plan-links.json`（人工维护；**只写事实与出处**）。

```json
{
  "schemaVersion": 1,
  "links":   [ /* 当前关系 */ ],
  "retired": [ /* 已退役关系（保留历史），可为空数组 */ ]
}
```

`_note` / `_rules` 这类 `_` 开头的键是说明，允许存在。

### 3.1 `links[]` 一条关系（字段顺序即序列化顺序）

| 字段 | 必填 | 含义 |
| --- | --- | --- |
| `dealId` | ✅ | `deals.json` 里的 12 位十六进制 id；**一条优惠只能有一条关系记录** |
| `planIds` | ✅ | 关联的套餐 id 数组（1–8 条，升序去重）；一条优惠可以对应多个套餐 |
| `provider` | ✅ | 这些套餐所属的 provider key（必须在 `providers.json` 里登记） |
| `providerOverride` | ⭕ | 见 §5：只有当 `providers.json` 认不出 `deal.vendor` 这个原始串时才允许出现 |
| `basis` | ✅ | 这条关系怎么确立的（§4） |
| `evidence` | ✅ | 官方原文片段（1–3 条，单条 ≤200 字，非聚合站出处，非未来日期） |
| `confirmedAt` | ✅ | 人工确认日期 `YYYY-MM-DD`（不得晚于数据基准日） |
| `promo` | ⭕ | 官方给出的优惠价格（§6），只在官方页确实给了可比较的价格时才写 |

### 3.2 `retired[]` 一条退役关系

= `links` 的全部字段 **+ 快照与退役信息**：`title` / `vendor`（记录已下架时它就不在数据集里了，
历史必须有快照可读）、`endedAt`、`reason`（枚举见下）。

`reason` ∈ `campaign_ended`（活动结束）· `deal_pruned`（记录被采集层下架）·
`plan_removed`（套餐不再收录）· `relation_withdrawn`（人工撤回这条关系）。

退役记录**不要求** `dealId` / `planIds` 仍存在于当前数据集 —— 这正是它的用途（题面 §七：优惠结束后
关联仍可保留在历史里）。代价是：退役记录与套餐页的对应行只在套餐还在表里时才有落点，
否则它只留在文件里（页面不为它编一个不存在的链接）。

### 3.3 规范序与判定

- `links` / `retired` 均按 `dealId` 升序、再按 `planIds` 升序（输入顺序不影响序列化结果）；
- 记录内的键序按上面的表（重排会被校验器点名）；
- 每条记录 ≤ 8 个 `planIds`、≤ 3 条引文；文件总量 ≤ 200 条。

## 4. `basis` 枚举与引文

| basis | 什么时候用 |
| --- | --- |
| `official-plan-page` | 官方**套餐/文档页**直接说明该优惠适用于这个套餐（本层的主力） |
| `official-campaign-page` | 官方活动页直接指向具体套餐 |
| `official-pricing-page` | 官方定价页本身给出的价格事实 |
| `editorial-confirmed` | 以上都不是，但人工核对确认过（必须带出处；报告里单独统计条数） |

引文复用 `lib/provenance.js` 的归一器（`fields: ['relation']`），所以它和 deals / plans 的引文
是**同一套上限与红线**：单条 ≤200 字、必须 http(s)、非聚合站、非未来日期、去重排序后有界。
校验方式是「把归一器再跑一遍」——盘上的引文必须与归一结果逐字节相同。

## 5. `provider` 一致与 `providerOverride`

两套身份空间必须在这里对上：

- **plans 侧**：`provider` 是规范 key，必须登记在 `providers.json`（未登记硬红）；
- **deals 侧**：`vendor` 是采集来的原始串（`MiniMax（稀宇科技）`、`月之暗面 Moonshot AI（Kimi）`……），
  渲染期才归一。

规则（**两半都要满足**）：

1. `link.provider` 必须等于**每一个**关联套餐的 `provider`（不一致 = 关系连错了）；
2. `providers.resolveProvider(deal.vendor)` 必须能认成同一个 key。
   - 认不出（或认成别的 key）⇒ **必须**写 `providerOverride`（≤200 字，说明为什么原始串与规范 key
     不同源），否则硬红；
   - 认得出却多写了 `providerOverride` ⇒ 也硬红（override 只能是必要的例外，
     否则「为什么特殊」这句话就失去意义）。

匹配是**精确别名**（NFKC + 折叠空白 + 小写），刻意不做子串/正则：`krea` 命中 `Kreado AI`
那类误并在本仓有实测教训。

## 6. `promo` 与资格范围

```json
"promo": { "price": 44.1, "currency": "CNY", "period": "monthly",
           "appliesTo": "eligible", "note": "受邀人通过邀请链接购买可享 9 折（49 × 0.9）" }
```

- 五项全必填：`price`（≥0 的有限数）· `currency`（`CURRENCIES` 枚举）· `period`（`BILLING_PERIODS` 枚举）·
  `appliesTo`（`all` / `eligible`）· `note`（这个价格是什么、对谁）；
- **`appliesTo: 'eligible'`** = 需要身份/资格（教师、学生、受邀人……）。此时页面**只显示优惠本身**，
  不显示「节省多少」——因为对多数读者那个价格根本不成立；
- 没有 `promo` 时，套餐页会退回到优惠自己那句原文（截断 ≤80 字，带省略号留痕）。

## 7. 状态模型

```text
asOf = max(deals.json.updatedAt 的日期, plans.json.updatedAt 的日期)     ← 不读墙上时钟
```

**deal 侧** `ended` 的三种理由：记录不在 `deals.json` 里（`deal_pruned`）· 历史层最近一次生命周期
事件是 `ended`（`deal_ended`）· `expiresAt` 早于 `asOf`（`expired`）。

**plan 侧**：不在 `plans.json` 里 = `removed`；变化层记为 `ended` = `ended`；否则 `current`。

**一条关系算「当前」当且仅当 deal 与 plan 都是 `current`。** 这条判据只有一处实现
（`lib/deal-plan-links.js` 的 `isCurrentRelation`），页面断言、构建期自检与真浏览器断言都从它取期望值。

`asOf` 取两个数据集里较新的一天，而不是各用各的：否则同一条关系会在优惠页与套餐页得到两个不同结论，
而两边看起来都「有依据」。同一天两次构建产物逐字节相同（跨零点也不会因为构建时刻而变）。

## 8. 派生指标：活动节省金额

`savingsOf(plan, promo)` —— **四道门缺一不可**，任一条不满足就返回 `null`（页面不显示该字段，
绝不写 0、绝不跨币种编一个汇率）：

1. `promo.appliesTo === 'all'`（资格限定的不算，见 §6）；
2. `promo.currency === plan.billing.currency`；
3. `promo.period === plan.billing.period`（按月优惠价对按年正价 = 两次不同的承诺，不可相减）；
4. `plan.billing.regularPrice` 与 `promo.price` 都是有限数，且差额 > 0。

结果 `round((regularPrice - price) × 100) / 100`，文本复用套餐表的币种符号与千分位（`节省 ¥30.1/月`）。
「同套餐」由关系本身保证（关系就是显式声明的同套餐）。

## 9. 派生视图（只进 dist）

1. **注入 `dist/deals.json`**：每条有关系记录的 `relatedPlans`（键集固定，见
   `RELATED_PLAN_FIELDS`）—— 只有展示文本与状态，不塞整个套餐记录：
   `planId / title / regularText / regularCode / promoText / promoCode / periodText / quotaText /
   modelsText / promoLine / eligible / savingsText / linkStatus / planStatus`。
   **源 `deals.json` 里出现 `relatedPlans` 会被产物自检当场报红**（与 `history` 同一条纪律）。
2. **发布 `dist/deal-plan-links.json`**：`{ schemaVersion, updatedAt, count, links, retired }`，
   其中 `links` / `retired` 与源表深等，`updatedAt = max(confirmedAt)+T00:00:00+08:00`、
   `count = links.length + retired.length` 由构建期推导（源文件里手写它们 = 校验错误）。
   发布它是为了**让外部也能核对关系**（页面上的每一条关系都能在这份文件里找到）。

## 10. 页面

**Deal 页**（`/deal/<id>/` 与首页详情弹层，同一个 `detailHtml()`）：
有关系时在「变更记录」之前插入 `.dplans` 块 —— 套餐名（链到 `/plans/coding/#plan-<id>`）、
正常价格、当前活动价、计费周期、额度、主要模型、本优惠、节省金额（可缺席）、`查看套餐对比 →`。
字段名与套餐对比表**逐字同名**；未知写「未标注」或表格里的「—」。
相对链接的深度前缀由调用方给（`detailHtml(deal, { prefix })`：详情页 `../../`、首页弹层空串），
写死任何一个都会让另一边出现 404 内链而页面看起来完全正常。

**套餐页**（`/plans/coding/`）：表格之后、`#plans-compare` 之外插入 `#plan-deals` 块 ——
**每一条套餐各一行**（顺序 = 表内规范序）：

- 有当前优惠：`当前优惠：<文案>[（限符合条件者）][ · 截止 <日期>]` + 节省（可缺席）+ `查看优惠 →`（`../../deal/<id>/`）；
- 没有：`暂无当前优惠`（明确空态，不是一片空白）；
- 有已结束/已退役关系：`历史优惠：<标题>（已结束 <日期>）`；记录已下架则**不给链接**（避免死链）。

「当前」用 `class="pdgo"`、历史用 `class="pdgo pdgo-hist"` —— 断言靠这个结构差别判断
「有没有把已结束的当成当前」，而不是读文案。

## 11. 候选关联报告（只供人工 review）

`npm run report:deal-plan-links` → `scripts/tools/deal-plan-link-candidates.js` →
`research/_raw/possible-deal-plan-links.json`（+ 控制台清单）。

三条**确定性**判据（无 AI、无网络）：`vendor-alias`（厂商精确别名命中）· `url-host`（同一主机）·
`title-mention`（标题含套餐名，≥4 字）。输出带 `confidence`（high/medium/low）与 `rules`，
并标出哪些已经是生产关系。

**这个工具没有写生产关系的代码路径**：它不引用关系文件的写入口，只读关系表用于标记 `alreadyLinked`。
自测里有一条断言直接读它的源码钉住这一点 —— 因为「让一个猜出来的东西穿上已确认的外衣」
正是本阶段要避免的失败模式。

## 12. 校验判据与门禁接入

**硬错误（拦发布）**：形状 / `schemaVersion` / 未知键 / 非规范序 / 重复 `dealId` /
`planIds` 为空或重复或非升序 / 超上限 · dealId 或 planId 不存在 · `provider` 未登记 ·
套餐 provider 与声明不一致 · provider 不一致且无 override（或 override 多余）·
`promo` 形状非法 · 出现派生键（`savings` / `updatedAt` / `count` / `relatedPlans`）·
`basis` 非法 · 引文缺失 / 非法 / 非归一形态 · `retired` 快照缺失或与 `links` 重叠。

**只在 `--strict` 下报错（人未跟进）**：`links` 里的优惠已经结束 → 要求把该条移进 `retired[]`
（错误信息直接给出可粘贴的 JSON 片段）；关联的套餐已被变化层记为 ended → 同理。

**警告**：`editorial-confirmed` 的条数（让「靠人判断」的部分一眼可见）。

接入点：
- `npm run validate`（含 `--strict`）→ `checkDealPlanLinks()`（判据全在 lib，不重抄）；
- `npm run build` → 读表 → 校验（不过就中止）→ 派生 → 注入 → 产物自检（注入、发布文件、
  两个页面上的块、锚点落点、反向无块逐条对账）；
- `npm run selftest:deal-plan-links` → 78 项离线演练，**进 CI 门禁**（`.github/actions/gate/action.yml`
  的 `Deal-plan-links self-test`，步骤名序列在 `check-ci-consistency.js` 里冻结）；
- `npm run verify` → 真浏览器对账（读产物重算「哪些算当前」，再与 DOM 逐条比对）。

## 13. 本阶段不做的事

- 不做自动关联（不引入任何写生产关系的代码路径）；
- 不做跨币种/跨周期的价格换算（含「年付相当于月付几折」这类隐含换算）；
- 不把 `promo.price` 塞进 `plans.json` 的 `billing`（套餐自己的活动价是**另一个**事实，
  两个价格在页面上刻意用不同措辞：`当前活动价`（套餐的）与 `本优惠`（这条优惠的））；
- 不改 `deals.json` / `plans.json` / `curated_plans.json` / 两份历史日志的契约；
- 不改首页布局与导航结构（只做 Deal ↔ Plan 的双向深链）。
