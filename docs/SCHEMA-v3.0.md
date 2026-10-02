# SCHEMA v3.0 —— AI 优惠 / 套餐 / API 计费 / 模型 / 厂商 / 历史变化的结构化资料库

> 本文件**只写 v3.0 新增或改动的契约**。既有契约**一律引用、不复制**：
> `SCHEMA-v2.5.md`（API 计费 / Token 单价）、`SCHEMA-v2.4.md`（优惠 ↔ 套餐关系）、
> `SCHEMA-v2.3.md`（套餐变化日志）、`SCHEMA-v2.1.md`（Coding Plan 数据模型）、
> `SCHEMA-v1.4.md`（优惠变化日志）、`SCHEMA-v1.6.md`（订阅层）、`SCHEMA-v1.7.md`（落地页与分类）、
> `DESIGN-RULES.md`（全站设计纪律）。
>
> 一句话总纲（题面 §21）：
> **不替用户做判断，把事实整理到足以让用户自己判断。**
> **资料消失不等于资料删除。**

---

## 0. 分层（v3.0 的总体架构）

| 层 | 载体 | 处置 |
|---|---|---|
| 真值层 | `deals.json` / `plans.json` / `api-plans.json` + 三份 `scripts/data/*-history.json` | **契约与字节不动**（v3.0 全程未改字段集），不做超级 Entity 表 |
| 人工来源层 | `scripts/data/curated_*.json`、`providers.json`、`vendor-slugs.json`、`deal-plan-links.json`、**新增** `models.json`、`model-registry-links.json` | 追加式扩展；一律「人工写、机器校验」 |
| 索引层 | **新** `scripts/data/models.json` → 派生产物 `models.json` | 只回答「模型身份」，**不是价格真值** |
| 关系层 | **新** `scripts/data/model-registry-links.json` → 派生产物（注入 `registryModelId`）；**新** `scripts/data/model-registry-gaps.json`（套餐侧处置登记，**不发布**） | 显式映射；**禁止相似度 / LLM 猜**；映射不上必须逐条写明理由 |
| 归档层 | 由 `baseline + events + absence + tombstone` 派生 | **不落新真值文件** |
| 出口层 | `/data/index.json`（Dataset Manifest，只描述数据集） | 文档与 Manifest **同源对账** |

三条硬纪律（贯穿全部新增契约）：

1. **判据只有一处**：同一件事的判据写在 `scripts/lib/*.js` 一个模块里，页面 / Feed / 自测 / 门禁都调用它。
2. **数字必须可重算**：页面上每个计数都带 `data-*` 标记，构建期从盘上现读再对账。
3. **「没查到」与「没有」是两句不同的话**：`null` / `unknown` / `unavailable` 各说各的，不许互相顶替。

---

## 1. Model Registry（`scripts/data/models.json` → `models.json`）

### 1.1 来源层形状（`scripts/data/models.json`）

以 **slug 为键**的对象（另有两个 `_` 前缀的元信息键：`_rules` / `_developers_extra`）：

```jsonc
{
  "glm-5.3": {
    "canonicalName": "GLM-5.3",      // 规范显示名（唯一性由校验器保证：同名必须同 developer）
    "developer": "智谱AI",            // 开发者显示名（必须在 providers.json 的显示名里，或 _developers_extra）
    "owner": "智谱AI",                // 可空：归属方（与 developer 不同时才写）
    "family": "GLM",                  // 模型族（用于 /models/ 分组）
    "aliases": ["GLM-5.3", "glm-5.3"], // 别名原文（**不归一**：精确匹配才算命中）
    "officialUrl": "https://…",       // 官方模型页（可空；空就是空，不猜）
    "status": "ga",                   // ga / preview / deprecated / retired（枚举）
    "note": "≤240 字的判断性说明（可空）"
  }
}
```

**派生字段表（`DERIVED_KEYS`）——手写即红**：`id`（= `sha1('model|' + slug)` 前 12 位）、
`firstSeen` / `lastSeen`（由引用方派生）、`registryModelId`（发布时注入）、`updatedAt` / `count`。
理由：派生值一旦能手写，就一定会出现「页面上是一个数、重算出来是另一个数」。

### 1.2 发布产物（`dist/models.json` 与仓根 `models.json`，逐字节相同）

`{ schemaVersion, updatedAt, count, models: [ { id, slug, canonicalName, developer, owner, family, aliases, officialUrl, status, note, firstSeen, lastSeen, apiReferences, planReferences } ] }`

- `firstSeen` / `lastSeen` **由引用方现算**（API 计费记录的 `firstSeen/lastSeen`、套餐的 `lastSeen`），取最早 / 最晚。
- 与 `SCHEMA-v2.5.md` 的 `modelKey` **不是同一个东西**：这里是「模型身份」，那里的 `modelKey` 是「某条计费记录里的计价条目键」。两者通过关系层连接（§2）。

### 1.3 ID 与别名（题面 D3 / D4）

- **ID**：`sha1('model|' + slug)[:12]`；**slug 是人的决定**，改名 slug 就是换身份（会让 `/models/<slug>/` 变成新 URL）。
- **别名**：`aliases` 里的字符串按**原文精确匹配**参与解析；不做归一化、不做大小写折叠 ——
  归一化会把 `KREA` 与 `Kreado AI` 这种「看起来像」的东西连起来（本仓在优惠侧已有实测教训）。
- **改名**：模型改名**不自动合并**。未登记的改名在数据上表现为「同一记录的 `modelKey` 移除 + 新增」，
  由 `api-plan-history` 的 `possible_rename` 异常留档 + `scripts/tools/api-model-rename-report.js` 展开成人工清单；
  **修法只有一个**：人工把旧名写进 `aliases`，保持 `modelKey` 与 slug 不变。

---

## 2. Model Mapping（`scripts/data/model-registry-links.json`）

```jsonc
{
  "links": [
    { "registrySlug": "glm-5.3", "basis": "api",     "apiPlanId": "646f01c662e6", "modelKey": "glm-5.3", "variant": "standard", "evidence": "官方定价页逐字" },
    { "registrySlug": "glm-5.3", "basis": "coding",  "planId": "154d2607b8ff", "modelName": "GLM-5.3", "evidence": "套餐 supportedModels 原文" }
  ],
  "_rules": { … }   // 人工维护说明（不参与判据）
}
```

| 字段 | 含义 |
|---|---|
| `basis` | `api`（指向 `api-plans.json` 的计价条目）或 `coding`（指向 `plans.json` 的 `supportedModels`） |
| `apiPlanId` + `modelKey` (+ `variant`) | 必须**真实存在**于 `api-plans.json`（红：牙 #3） |
| `planId` + `modelName` | 必须真实存在于 `plans.json` 的该套餐 `supportedModels` 里 |
| `registrySlug` | 必须存在于 `models.json` |

**判据**：`scripts/lib/model-registry.js` 的 `validateLinks()`。禁止任何相似度匹配。

「映射不上」在 **API 侧**是**允许**的结果：进覆盖报告（`npm run report:coverage`）的缺口 3，不写生产映射。
**套餐侧（Coding）不是**：`plans.json` 的 `supportedModels[].name` 是自由文本，它只有两种结局 ——
映射进关系层，或进 `model-registry-gaps.json` 声明「不对应单一模型身份」。

### 2.1 套餐侧处置登记（`scripts/data/model-registry-gaps.json`）

```jsonc
{
  "schemaVersion": 1,
  "declarations": [
    {
      "planId": "f04787381e3b",           // 必须真实存在
      "modelName": "Seed-Code",           // 必须**逐字**等于该套餐 supportedModels 里的名字
      "role": "included",                 // 必须逐字等于那一条的 role（从数据抄来的对照值）
      "reason": "off-registry-model",      // 见下表
      "sourceUrl": "https://www.trae.cn/pricing",  // 必须是该套餐自己的 officialUrl / sourceUrl
      "note": "官方折扣表逐字写「Seed-Code」；registry 里没有这个身份 …"
    }
  ],
  "_note": "…", "_rules": "…"            // 人工维护说明（不参与判据）
}
```

| `reason` | 含义 |
|---|---|
| `pool` | 官方只给模型池 / 自动调度，未逐一点名（**要求该条 `role === "pool"`**） |
| `series` | 官方只给产品线系列名，未落到版本 |
| `multi-model` | 一个字符串里写了不止一个模型 |
| `off-registry-model` | 官方点名了单一模型，但该写法在 registry 里没有精确身份 |
| `non-text-resource` | 图像 / 语音等非文本资源，不是文本模型身份 |

- **这张表永远不写 `registrySlug`**（写了就是未知字段 → 红）。它的存在只为回答「为什么**没有**映射」。
- **判据**：`validateGaps()`。`modelName` / `role` 逐字对账；`reason` 与 `role` 互为充要；
  `sourceUrl` 必须是该套餐自己的官方页；`note` 必填 ≤ 240 字（note 里引用官方原文时必须**逐字来自该记录自己的文字**，
  不许新造引文）；与关系层冲突即红；规范序；不许重复。
- **声明必须真的是「映射不上」**：`validateGaps()` 拿 `normalizedIndexOf(table)` 反查 ——
  `modelName` 归一后若精确落到某个 registry 身份（slug / 别名），这条就该去写映射，
  拿声明绕过映射即红（与候选规则 `planCandidatesOf()` 同一支归一索引）。
  因此调用方**必须把 registry 表传进来**；不传（table 为空）却有声明 ⇒ 红 —— 判不了就不是通过。
- **完整性是硬门禁**：`validatePlanModelCoverage()` 规定，`plans.json` 里任何一条模型串若
  **既没有映射、又没有声明** ⇒ 红。六处都会停：`scripts/validate.js --strict`（门禁第 01 步）、
  `build-local.js`（构建期）、`npm run models:rebuild`、`npm run check:models:reproducible`、
  `npm run check:model-registry-links`、`npm run report:coverage`。
  「没判过」不许被当成「不需要判」——那种漏判不会有任何报错，只会在覆盖报告里安静地少一行。
- **本表不发布**：根目录没有它的派生产物（它是一张过程留痕，不是站点数据）。
- **反证**：变异电池 `#22`（摘掉 `validateGaps`）与 `#24`（把一条声明改成 registry 里真实存在的别名
  `zai-org/GLM-5.3`，走 `check-model-registry-links.js` 端到端）都必须当场变红。

---

## 3. Provider Page（`/vendor/<slug>/` 升级为厂商统一资料页）

### 3.1 URL 策略（题面 §8 的裁决：方案 A）

- **继续用 `/vendor/<slug>/`**；**不新增 `/provider/`**：`assertNoParallelProviderRoutes()` 在构建期与自测里同时判红（牙 #7）。
- slug 必须来自**权威表** `scripts/data/vendor-slugs.json`（`assertVendorSlugDeclared()`）；
  `providers.json` 的隐式兜底不再算数（牙 #6）。
- **身份门（R5）**：只有「在 A 空间（`index.html` 的 `VENDOR_RULES`）有厂商名」的 provider 才建路由；
  `vendorKey === null` 的 provider（trae / qoder / codebuddy / qoder-intl）**不建**，在计划里以 `reason=no-vendor-identity` 逐条留痕。

### 3.2 页面结构（`scripts/lib/vendor-page.js`）

六个资料区块，容器 `#vendor-knowledge`，各节 id：
`vendor-official`（官方入口 + 最后更新时间）/ `vendor-plans`（Coding 套餐）/ `vendor-api`（API 计费：记录数 / 模型计价条目 / 计费通道）/
`vendor-models`（Registry 归属模型）/ `vendor-changes`（最近的套餐与 API 变化）/ `vendor-feeds`（这一家的订阅）。

- **数字可重算**：每个计数带 `data-vendor-count="<name>" data-vendor-value="<n>"`；
  `assertVendorApiCounts()` 从 `api-plans.json` 现算再与页面逐个对账（牙 #8）。
- 页面**不产数据**：六个区块全部是既有数据的显式 join（provider 精确匹配 / developer-owner 逐字相等 / 关系层两跳），
  **不落任何「厂商数据」真值文件**。
- 资料区块**不含 `data-item` / `data-child`**（它不是条目列表页，不许进 ItemList 的成员对账）。

---

## 4. Archive（`/archive/` + `/archive/<kind>/<id>/`）

- **不落新真值文件**：档案 = `baseline` + `events` + `absence` + `ended` 事件的墓碑 `label` 重放的结果（纯函数 `buildArchive()`，不读盘、不看时钟）。
- 条目身份 = `(kind, id)`；`kind ∈ {deal, plan, api}`。
- 状态：`ended` / `restored`（由**最后一条**生命周期事件决定，牙 #11）。
- **大批 `ended` 熔断**：同一天结束数 > `max(3, 基线记录数 / 2)` ⇒ 全部标 `suspect` + `mass_ended_suspect` 异常留档；
  条目**仍然展示**，但页面必须写明「疑似来源故障」，不许伪装成正常归档（牙 #10）。
- **资料消失不等于资料删除**：档案只依赖事件，当前数据里没有这条记录**不影响**它出现在档案里（牙 #9）。
- 详情页门槛：必须有可重建的事件链（≥1 条 `ended` / `restored`）且快照可重建（`archiveDetailGate()`）。

---

## 5. Dataset Manifest（`/data/index.json` + `/docs/data/`）

### 5.1 Manifest（只描述数据集，**不复制任何数据**）

```jsonc
{
  "schemaVersion": 1,
  "updatedAt": "…",
  "count": 9,
  "datasets": [
    { "id": "deals", "label": "…", "category": "deals", "url": "deals.json",
      "schemaVersion": 1, "updatedAt": "2026-10-01T12:00:00+08:00", "updatedAtShape": "instant",
      "count": 134, "countNote": "含工具条目", "purpose": "…", "format": "json" }
  ]
}
```

六类齐全：`deals` / `coding-plans` / `api-pricing` / `models` / `relationships`（两份关系文件）/ `history`（三份日志）。

### 5.2 时间形状显式区分（`timeShapeOf()` 唯一判据）

`instant`（真实时刻，如 `deals.updatedAt`）/ `normalized-date`（`…T00:00:00+08:00`）/ `date-only`（`YYYY-MM-DD`）。
交付日实测 **1 / 5 / 3**。每条必须带 `updatedAtShape`，页面每行带 `data-time-shape` 标记 ——
**不标的话读者会以为它们是同一时刻产出的**（这是本仓最容易犯的一类「没说谎但也没说清」）。

### 5.3 三条对账（`assertEndpointsExist` / `assertSchemaVersions` / `assertManifestCounts` / `assertUpdatedAt`）

构建期一律**从盘上现读重算**再对账（不信内存里的对象）；文档里的每个 endpoint / schemaVersion / 计数 / 更新时间都必须与磁盘逐字段一致（牙 #12 / #13 / #14）。

### 5.4 License 状态

仓库**没有** `LICENSE` / `COPYING` 文件 ⇒ 页面如实写「未定，需项目所有者决定」。
**不擅自选一个许可证**（那是项目的决定，不是构建脚本的决定）。

---

## 6. API Change Feed（`/feed/plans/api/changes.xml|json`）与 `/changes/` 的三条变化流

- 路由：`feed/plans/api/changes.xml` / `.json`，与页面 `/plans/api/` 对齐（对应 `feed/plans/coding/changes.*` ↔ `/plans/coding/`）。
- **Stable ID**：条目的 `guid` **直接取** `api-plan-history.json` 里那条事件的派生 `eventId`
  （`apiPlanEventIdOf()` = `plan-history.eventIdOf`，12 位 hex）。**绝不在每次 build 重新生成**（牙 #15）。
- 条目只来自 `api-plan-history` 的事件（`price_increased` / `price_decreased` / `model_added` / `model_removed` /
  `model_changed` / `unit_changed` / `currency_changed` / `free_tier_changed` / `credits_changed` / `limits_changed` /
  `restriction_changed` / `availability_changed` / `created` / `ended` / `restored`），
  **记录级元信息（`updated`）不进订阅**，**不混入 Coding 套餐事件**（牙 #17）。
- 深链落到 `/plans/api/#plan-<planId>`，锚点存在性由构建期**逐条 feed** 回读（牙 #16；`feeds.validate()` 只判路由、不判片段）。
- `/changes/` 与 `/feeds/` 的声明数**从注册表 `feeds.PLAN_CHANGE_FEEDS` 派生**，不写死。

---

## 7. 生成门槛（v3.0 的完整表格）

| 页面 | 门槛 |
|---|---|
| `/models/<slug>/` | 有真实 registry entry **且** 至少被一个当前或历史实体引用；未过门槛的**不生成**，进覆盖报告 |
| `/models/` `/plans/` `/archive/` `/docs/data/` 索引 | **无条件生成**（路由消失比一页说明更糟） |
| `/vendor/<slug>/` | `dealCount ≥ 2` **或** `eventCount ≥ 3` **或** 至少一种非优惠资料（Coding / API / Registry 模型） |
| `/archive/<kind>/<id>/` | 有可重建事件链（≥1 条 `ended`/`restored`）且快照可重建 |
| 厂商路由的身份门 | `providers.json[].vendorKey !== null`（A 空间有厂商名） |
| Feed：厂商 | `当前有效优惠 ≥ 2` 或 `历史事件 ≥ 3`（`VENDOR_THRESHOLDS`，v3.0 **未放宽**） |

---

## 8. SEO 策略（v3.0 新增部分）

- **唯一声明表** `scripts/lib/page-kinds.js`：路由 → `kind` / `textFloor` / ItemList 要求 / sitemap priority。
  `lib/seo.js`（规则层）与 `scripts/tools/seo-verify.js`（独立门禁）**共读**这张表，但**各自从 dist 解析**，
  不合并成一条执行路径（合并会让「独立」这件事消失）。
- 非优惠实体页（模型页 / 厂商页 / 计划页）显式 `checkItemListMembers: false`：
  成员校验按站内 `deal/<id>/` 判成员，对这些页不适用；它们的成员一致性由页面自己的 `assertPageHonesty` 查。
- **新增页面的硬要求**：自指 canonical、恰好 1 个 `<h1>`、正文 ≥ 该 kind 的下限、
  至少 1 条站内入链（否则 `orphan` 判红，牙 #20）、JSON-LD 的类型集合精确相等。
- `gate-threshold` 与 landing 的门槛判据**同一条 OR**（`eventCount` / `nonDealMaterial`）：
  否则「靠非优惠资料达标」的厂商页会被判红 —— 它们正是我们决定要生成的页面。

---

## 9. 兼容性与稳定性承诺

| 对象 | v3.0 的处置 |
|---|---|
| `deals.json` / `plans.json` / `api-plans.json` | **字段集一个都没改**；`plans.json` / `api-plans.json` 与源文件逐字节相同 |
| 三份 `*-history.json` | 契约未变（`schemaVersion` / `startedAt` / `baseline` / `absence` / `anomalies` / `events`）；`eventId` 仍是派生字段 |
| 既有页面 URL | **一条都没有改**（含 `/vendor/<slug>/`）；v3.0 只**新增**页面 |
| 既有订阅源 | 路径与 guid 规则未变（老订阅者不会被重推） |
| `/provider/` | **不存在**，且新增路由会被 `assertNoParallelProviderRoutes()` 判红 |
| 新增数据集 | `models.json` / `model-registry-links.json` / `data/index.json` 都是**新增**端点，不改既有端点语义 |
| Schema 稳定性口径 | 见 `/docs/data/` 页：Additive 变更 → minor；字段语义/类型变更 → 需要提升 `schemaVersion` 并写明迁移方式；**不承诺永久兼容** |
| 数据许可证 | **未定**（仓库无 LICENSE 文件）—— 需项目所有者决定，本仓不擅自决定 |
