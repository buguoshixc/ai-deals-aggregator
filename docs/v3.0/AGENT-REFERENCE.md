# v3.0 团队共享参考（唯一权威的实施约束）

> 本文件由队长维护。**任何成员在动手前必须先读完本文件**。
> 题面原文：`docs/v3.0/TASK-SPEC-v3.0.md`（2065 行，按需查，不要通读）。
> 阶段计划与硬规则见 `docs/v3.0/STAGE-PLAN.md`。

---

## 0. 工作区（重要）

| 项 | 值 |
|---|---|
| **唯一工作目录** | `D:\OneDrive\Desktop\Code\AI Page\.worktrees\v3.0-ai-deals-knowledge-base` |
| 分支 | `v3.0-ai-deals-knowledge-base` |
| 分支基点 | `49122ad`（= `origin/master` 上已发布的那一个提交；`v2.5-api-token-plans` 的 HEAD） |
| 主检出 | `D:\OneDrive\Desktop\Code\AI Page`（停在 `v2.5-api-token-plans`，**只用于对照，不要在它里面改任何文件**） |
| 依赖 | 已在 worktree 里跑过 `npm ci`（51 包） |
| 真浏览器 | `DSH_EDGE=C:\Users\星澈\AppData\Local\ms-playwright\chromium-1243\chrome-win64\chrome.exe` |

**所有路径都写成 worktree 相对路径**（例如 `scripts/lib/feeds.js`），因为大家是同一个工作目录。
用绝对路径时请写成 worktree 下的绝对路径，不要写到主检出里。

---

## 1. 零偷工减料（第一原则，违反即该阶段作废）

**一个阶段只有在 6 项全为真时才算完成**：交付物齐全且真实实现 · 验证命令全绿且原始输出入台账 ·
牙实跑变红过 · 无新增豁免（不删断言/不放宽容差/不降门槛/不加 `--skip`）· 真实数据原则成立 ·
独立验收员能独立复现。

**明文禁止（出现即作废重做）**：只做部分子项就宣告完成 · "数据为空"就跳过页面或断言 ·
硬编码样例代替真实数据驱动 · 删/注释/弱化断言或提高容差 · `try/catch` 静默吞错 ·
伪造数据（编 eventId / 编历史事件 / `unknown`→`false` / `null`→`0`）· 相似度或 LLM 猜测写生产关系 ·
只跑自测不做端到端 · 报告数字靠估或抄题面 · "先跳过最后补" · 丢掉"检查过但没收录"的过程 ·
用第三方聚合站当生产事实来源。

---

## 2. 架构决策（已定死，不要重新论证）

### 2.1 层边界

| 层 | 载体 | 处置 |
|---|---|---|
| 真值层 | `deals.json` / `plans.json` / `api-plans.json` + 三份 `scripts/data/*-history.json` | **契约与字节不动**；不做超级 Entity 表 |
| 人工来源层 | `scripts/data/curated_*.json`、`providers.json`、`vendor-slugs.json`、`deal-plan-links.json` | 追加式扩展 |
| 索引层 | **新** `scripts/data/models.json` → 派生产物 `models.json`（发布） | 只回答"模型身份"，**不是价格真值** |
| 关系层 | **新** `scripts/data/model-registry-links.json` → 派生产物（发布） | 显式映射，禁止相似度/LLM 猜 |
| 归档层 | 由 baseline + events + absence + tombstone 派生 | **不落新真值文件** |
| 出口层 | `/data/index.json` Manifest（只描述数据集） | 文档与 Manifest 同源对账 |

### 2.2 三套身份空间与真实裂缝（实测）

| 空间 | 出处 | 规模 |
|---|---|---|
| A. deal 侧厂商键 | `index.html` 的 RENDER-CORE 里 `VENDOR_RULES` | 44 键 |
| B. provider 键 | `scripts/data/providers.json` | 12 家 |
| C. 显示名 → slug | `scripts/data/vendor-slugs.json`(9) + `providers.json[].slug`(12) | 两表 |

> **勘误（2026-10-01，由 `registry-curator` 实测推翻，队长已复核并更正）**：
> 本节初稿声称「`VENDOR_RULES` 的月之暗面 A 键是 `moonshotai`」是**错误的**。真实情况是
> `[/月之暗面|moonshot|kimi/i, 'moonshot', '月之暗面', 'moonshotai']` —— **A 键本来就是 `moonshot`**，
> `moonshotai` 是第 4 个槽位（**logo 键**，登记在 `assets/logos/manifest.json` 的 `logos.moonshotai`）。
> 错误来源：初版审计用 `/\[\/[^\]]*,\s*'([a-z0-9]+)'/` 提取"厂商键"，它命中的是 **logo 键**那个槽位。
> > **因此不要重命名 `moonshotai` 这个 logo 键** —— 它既在 manifest 的硬断言里，也是已发布 URL `dist/logos/moonshotai.svg`。
>
> **同一处的第二次更正（`registry-curator` 再次指出，队长已实测确认）**：
> A 空间规则数是 **45 条（键无重复）**，不是 44 —— 上一条"44 条"仍然数错了，原因同上但更隐蔽：
> 第一个槽位是正则字面量，而 `gpt[\s-]?image` 含 `]`、`kimi/i` 含 `/`，所以**任何**基于
> `[^\]]*` 或 `[^\]]+` 的提取都会提前收尾（两版审计都数成 44）。被漏掉的是 `aliyun`、`moonshot`
> 与含 `]` 的 **`openai`**（真实存在于 `index.html:1461`：`[/openai|chatgpt|gpt[\s-]?image|^gpt\b/i, 'openai', 'OpenAI', 'openai']`）。
> **正确做法**：定位 `const VENDOR_RULES = [` 到配对的 `];`，再**逐行**取"末尾三个引号串"当
> `[A键, 显示名, logo键]`（`minimax` 那条第 4 槽位是 `null`，只有 2 个引号串）。
> 权威实现与冻结表（`FROZEN_VENDOR_KEYS`，45 条）在 `t1` 交付里，**以它为准**。
> 因此 **`openai.vendorKey = 'openai'`（不是 null）**。

**必须在 v3.0 修掉的裂缝**：

1. ~~A 键 `moonshotai` 与 B 键 `moonshot` 不一致~~（**不存在，见勘误**）。
   **取而代之的正确要求**：把「**B 空间 provider 的 `vendorKey` → A 空间键**」与
   「**A 空间键 → 显示名**」这两者的**恒等式钉死**：对每个非 null `vendorKey`，
   从 RENDER-CORE 取回的显示名必须逐字等于 `providers.json[].name`。
   用 `vendorKey='moonshotai'` 的**污染表实跑变红**（该键不存在于 `VENDOR_RULES`）来证明这条断言真的有牙。
2. 87 个 deal 原始 vendor 串里**只有 6 个**能通过 `providers.json` 精确别名解析：
   `智谱AI`→zhipu、`Cursor`→cursor、`Google AI`/`Google`→google、`Anthropic`→anthropic、`GitHub`→github。
3. 下面这 6 家在 `vendor-slugs.json` 里**有 slug、有 `/vendor/` 页**，却在 `providers.json` 里**根本不存在**：

   | deal vendor 串 | 已有 vendor slug | 建议 provider key |
   |---|---|---|
   | `百度智能云` | `baidu-ai-cloud` | `baidu` |
   | `火山引擎` / `火山引擎（字节跳动）` | `volcengine` | `volcengine` |
   | `扣子 Coze（字节跳动）` | `coze` | `coze` |
   | `科大讯飞 讯飞开放平台` | `iflytek` | `iflytek` |
   | `Microsoft` | `microsoft` | `microsoft` |
   | `Notion` | `notion` | `notion` |

   不补这些 provider 条目，最重的厂商页就拿不到套餐/API/模型三个新区块。
4. `MiniMax（稀宇科技）` 的全角括号使精确匹配失败，`deal-plan-links.json` 已为此写了一条 `providerOverride`
   → 把该形态补进别名，消灭这条 override（改完跑 `selftest:deal-plan-links` 确认无回归）。

**约束**：匹配只用 `normalizeProviderName` 后的**精确相等**（NFKC + 折叠空白 + trim + 小写），
**禁止子串/正则**（仓库实测教训：`/krea/i` 会命中 `Kreado AI`）。

**处置**：只升级 B 空间 —— `providers.json` 每条新增 `vendorKey`（A 空间键；provider-only 公司为 `null`），
并新增两条硬断言：
- ① `providers.json[].name` 与 `vendor-slugs.json` 同名条目 slug 逐字相同（扩展 `validateSlugAgreement`）；
- ② 对每个非 null `vendorKey`，从 `VENDOR_RULES` 取回的显示名必须等于 `providers.json[].name`
  （这条直接把 `moonshotai/moonshot` 裂缝变红）。

### 2.3 `/vendor/` vs `/provider/` → **选方案 A（升级现有 `/vendor/<slug>/`）**

理由：① 现有 9 个厂商页已达标、slug 来自显示名；方案 B 会把 9 条 URL 变 noindex，用一次整体迁移换 0 条新信息；
② B 空间 12 家里 5 家（trae/qoder/codebuddy/openai/moonshot）没有任何 deals，但在 A 方案下照样生成（它们有 plans/API 证据）；
③ 题面明写"只有在语义上确实需要时才能选 B"。
**新增一条牙：`/provider/` 路由若出现即红。**

### 2.4 生成门槛

| 页面 | 门槛 |
|---|---|
| `/models/<slug>/` | 存在真实 registry entry **且** 至少被一个当前或历史实体引用；未映射的**不生成**，进覆盖报告 |
| `/vendor/<slug>/` | `dealCount ≥ 2` **或** `eventCount ≥ 3` **或** 至少一种非优惠资料（Coding Plan / API 记录 / Registry 模型归属）。**额外硬约束（v3.0 定案，经两次纠正）**：只有**在 A 空间有厂商名**的 provider 才有 `/vendor/` 页。权威数字（以 `providers.json` 的 `vendorKey !== null` 为准）：**19 家有**（zhipu/moonshot/minimax/github/cursor/openai/anthropic/google/deepseek/baidu/volcengine/coze/iflytek/microsoft/notion/aliyun/siliconflow/tencent/windsurf），**4 家没有**（`trae`/`qoder`/`codebuddy`/`qoder-intl`，`vendorKey: null`）⇒ 这 4 家**不建** `/vendor/` 路由，资料走 `/plans/coding/` 与 `/plans/` 枢纽，并在 `PLAN.skipped` 里以 `reason=no-vendor-identity` 留痕。<br>⚠️ **数字自己数不出对**（队长先后写错 18 与 176）：一律用实测 —— `Object.values(providers).filter(p => p.vendorKey !== null).length` 与构建期 `expectedLocs` 断言，**不要手算**。接线后预期：厂商页 **9 → 19**、厂商枢纽子页 9 → 19、sitemap **158 → 168**、零优惠而改标题「X 的 AI 资料」的只有 **DeepSeek** 一家 |
| `/archive/<kind>/<id>/` | 必须存在可重建事件链（≥1 条 `ended`/`restored`）**且** 快照可重建 |
| `/archive/` `/models/` `/plans/` `/docs/data/` 索引 | **无条件生成**（路由消失比一页说明更糟） |

### 2.5 红线（不做）

`api-plans.json` 的 `modelKey` 不重写 · `plans.json`/`deals.json` 字段集不动 · 不做成本计算器 ·
不做跨币种/跨单位换算 · 不把 credits 折成 tokens · 不做推荐/排行榜/星级 · 不加账号/评论/广告/App ·
不做 `provider × model × variant` 组合页 · 不为每条历史 event 建 SEO 页 · AI 只能出候选不能写生产事实。

---

## 3. 必须同步的 11 张手维护清单（实测定位，行号基于基点 `49122ad`）

| # | 清单 | 位置 |
|---|---|---|
| 1 | `PUBLIC_FILES` / `GENERATED_FILES` | `scripts/tools/build-local.js:90` / `:92` |
| 2 | `ROUTE_HREFS`（含子串互斥断言） | `build-local.js:107-131`，断言 `:139-149` |
| 3 | `PRERENDER_MARKERS` | `build-local.js:295-300` |
| 4 | sitemap 组装（含每类 priority） | `build-local.js:2815-2886` |
| 5 | `pageRoutes` | `build-local.js:2987-2996` |
| 6 | sitemap 条数断言 `expectedLocs` | `build-local.js:4131-4132` |
| 7 | 页脚深度扫描表 `routeOutputs` | `build-local.js:3944-3968` |
| 8 | Feed 声明扫描表 | `build-local.js:4509-4523` |
| 9 | SEO `fixed` 描述符 | `build-local.js:4649-4682` |
| 10 | `verify-site.js` §18 硬编码样例路由 | `scripts/tools/verify-site.js:3613-3619` |
| 11 | `seo-verify.js` 的 `FIXED_KINDS` | `scripts/tools/seo-verify.js:176` |

**收敛措施**：新增 `scripts/lib/page-kinds.js` 作为"路由 → kind / textFloor / ItemList 要求 / sitemap priority"
的**唯一声明**，`scripts/lib/seo.js` 与 `scripts/tools/seo-verify.js` 都读它。
⚠️ 但 `seo.js` 是"规则层"、`seo-verify.js` 是"输入完全不同源的独立门禁"——**两者仍然各自从 dist 解析**，
只是共享同一份 kind 声明表；不要把它们合并成一条执行路径。

---

## 4. SEO 门禁的硬约束（33 个检查码，全部硬失败）

`warnings` 恒空 ⇒ 没有"警告级"。逐条要点：

- `title-length` ≤80 且**可索引页之间唯一**；`desc-nonempty` 且**可索引页之间唯一**（逐字相同即红）。
- `canonical-self` 必须逐字等于 `${SITE_URL}${route}`；`canonical-unique` **可索引页之间不许共用**。
- `h1-count`：可索引页必须**恰好 1 个** `<h1>`。
- `robots-policy` / `sitemap-policy`：`noindex` 与 `indexable` 必须一致，且与 sitemap 成员一致。
- `thin-content`：可见正文 ≥ `textFloor(kind,count)`（**剥掉 `<script>` 与 `<style>` 之后再数**）。
- `itemlist-arity`：**`numberOfItems` 必须等于 `itemListElement.length`**，且元素数必须等于页面上
  `data-item`（hub 页是 `data-child`）的行数。**每页一个 JSON 对象，禁止把数组塞进一个 `<script>`**
  （`JSON.parse(block)['@type']` 对数组得 undefined）。
- `itemlist-members`：成员必须属于本页可见行集合。**非优惠实体页（模型页/厂商页/计划页）必须显式
  `checkItemListMembers: false`**，因为成员校验按站内 `deal/<id>/` 判成员。
- `breadcrumb-target-exists`：面包屑每一级**有 `item` 就必须指向真实存在的路由或静态文件**。
- `summary-source`：摘要行的 label 必须在 `seo.recomputeSummary` 里可重算，且值必须相等，
  且 HTML 里必须有 `data-summary-label=... data-summary-value=...`。
  **新页面类型若要用摘要行，必须同步扩展 `recomputeSummary` 的上下文**。
- `internal-link-exists`：任何内链都必须能解析到真实路由或静态文件。
- `orphan`：**每个可索引页都至少要有 1 条站内入链**。新页面必须从枢纽页/父级页/共享页脚获得入链。
- `duplicate-item-set`：两个可索引集合页不许有逐条相同的条目集合。
- `gate-threshold` / `gate-pinned-missing` / `gate-pinned-empty`：门槛层，只有构建期能查。
- `feed-declared`：声明的 Feed 必须真实存在；`feedMatch` 声明的必须真的声明在页面上。

**另有逐页硬断言**（不在 seo.js 里，但同样是硬失败，加新页必须给这些数）：
`/changes/` 正文下限 `700+40*(高价值+其他)`、目录页 `500/600+60*count`、`/status/` `900/350`、
`/feeds/` `600`；以及各页 JSON-LD 的**精确集合相等**断言（status/changes/feeds/directory 各一处）。
`/plans/api/` 有一条"除主题脚本与 JSON-LD 外不得有任何内联 `<script>`"的断言。

---

## 5. Feed 层现状（Stage H 要改的地方）

- `scripts/lib/feeds.js` 当前是**单条变化 spec**：`PLAN_CHANGE_FEED`（`feed/plans/coding/changes.*`）
  + 静态 `PAGE_FEED_ROUTES`（`plans/coding/` → 它）。要抽象成多 spec，**不要复制一份 `feeds-api.js`**。
- `/feeds/` 的分组表是**硬编码**的（`build-local.js:1645-1668`），加 API 变化源必须同步改分组表。
- GUID 规则：优惠条目用 `deal.id` 逐字；优惠变化用 `chg:<sha1(history.eventKey(event))[:16]>`；
  套餐变化用 `plan-history` 的 `eventId`（12 hex）。API 变化**必须**用 `api-plan-history` 的派生事件 ID。
- ⚠️ **实测缺口**：`scripts/lib/plan-history.js` 有 `eventIdOf()` 且 `verifyStore` 会重算比对（手写必红），
  但 `scripts/lib/api-plan-history.js` **完全没有 `eventId` 派生**（`grep eventId` = 0 命中，因为 0 事件从未被需要）。
  **Stage H 必须先补**：`apiPlanEventIdOf()` + 写入点打 `eventId` + `verifyStore` 加"重算并比对，手写 ⇒ 红"。
- `feeds.validate()` 是硬门禁：标题/路径唯一 · `page-exists` · 非空除非 `mayBeEmpty` · XML 良构 ·
  内存↔RSS↔JSON **三方对账**（id 序列与时间字段）· guid 唯一 · https + 同站链接 ·
  `link-exists`（对 `pages` Set）· `dates-from-data`（时间只能来自数据，不许来自时钟）·
  集合谓词成立且不含过期/已结束 · 变化条目必须真实存在且高价值。

---

## 6. 历史层现状（Stage F/H/模型 History 的输入）

- 三份日志**都是纯基线 0 事件**：`deal-history`（baseline 134 条）、`plan-history`（9）、`api-plan-history`（7）；
  `absence` 空、`anomalies` 空。`baseline.at` = 2026-09-30 / 10-01。
- 形状：`{schemaVersion, startedAt, baseline:{at,note,fields}, absence, [anomalies], events}`。
- 复用 `scripts/lib/history-core.js`（**唯一真值内核**）：`replay()`、`lastLifecycleOf()`、`eventsOf()`、
  `historyFor()`、`keyOf()`、`pruneAbsence()`、`verifyStore()`、`eventKey()`。
- 生命周期事件 `created|ended|restored` 不带 `field/from/to`；`ended` 可带墓碑 `label = {title, vendor?}`。
- `pruneAbsence()` **只清 absence 观测态**（`ABSENCE_RETENTION_DAYS = 365`），`events` 永不删。
  代价如实登记：超 365 天后墓碑 `label` 不再保留，Archive 的"最后已知内容"改由 baseline 重放重建。
- **交付日 `/archive/` 必然 0 记录**；ended/restored 分支只能用 `history-selftest` /
  `plan-history-selftest` 的**合成夹具**驱动。**这一点必须写进报告 §18，不得含糊，也不得补造事件。**

---

## 7. 数据现状要点（写代码时要用的真值）

- `api-plans.json`：7 条记录 / **37** 个模型计价条目 / **22** 个不同 `modelKey` / 5 provider。
  记录字段序：`id, kind, provider, planName, channel, officialUrl, source, sourceUrl, region,
  pricing, models, freeTier, limits, credits, restrictions, firstSeen, lastSeen, verified, verifiedAt,
  evidence, derivedMetrics`。`pricing.unit` 全为 `per_1M_tokens`；`credits` 全为 `null`；
  `rates.reasoning/batchInput/batchOutput` 100% 为 `null`；batch 与 off-peak 是**独立记录**（靠 `channel`），
  不是独立字段；`freeTier` 只在 google 与 zhipu 上有（`type: 'models'`）。
- `plans.json`：9 条 / 8 provider；`supportedModels` 是**自由文本 `{name, role, note}`，没有模型键**，
  且 9 条里只有 3 条有值（minimax Token Plan Plus、trae 会员 Pro、zhipu Lite）。
  与 API 侧真名级重合**只有 2 处**：`GLM-5.3` ↔ `glm-5.3`、`GLM-5.3-Flash` ↔ `glm-5.3-flash`。
  ⇒ `model-registry-links.json` 的 plans 侧映射**必须逐条人工写**。
- `deals.json`：134 条（`type=deal` 80 / 工具 54）；`verified:true` 32；只有 3 条有 `evidence`；
  **没有 `lastChecked`/`status` 字段**；过期只看 `expiresAt`。
- `deal-plan-links.json`：5 条关系 / 0 retired；3 条指向 API 记录。
- `deals.json.updatedAt` 带**真实时刻**，而 plans/api/links/history 的 `updatedAt` 都是**日期规范化**的
  ⇒ Manifest 必须显式区分两种时间形状，不能假装统一。
- 公开 JSON 已在线上可访问：`/deals.json` `/plans.json` `/api-plans.json` `/deal-plan-links.json`
  `/deal-history.json`（全部 200）；`dist/plans.json` 与 `dist/api-plans.json` 与源**逐字节相同**；
  `dist/deals.json` 因构建期注入 `collections/needs/sourceFacts/relatedPlans` 而更大。
- 仓库**没有 LICENSE / COPYING 文件** ⇒ 数据许可证在报告里列为"需项目所有者决定"，**不要擅自决定**。

---

## 8. 验证命令（**以真实 `package.json` 为准**）

题面 §16 列的脚本名有 7 个与实际不符（`check:reproducible` / `check:plans:reproducible` /
`check:api-plans:reproducible` / `check:history` / `check:plan-history` / `check:api-plan-history` / `check:zh`
的真实脚本名与题面不同；`npm test` 存在 = `validate.js`）。**报告里必须写明这一差异。**

```powershell
npm run validate; npm run test:strict
npm run check:reproducible
npm run check:plans:reproducible
npm run check:api-plans:reproducible
npm run check:models:reproducible          # 新
npm run check:model-registry-links         # 新
npm run check:history                      # = history-verify.js
npm run check:plan-history
npm run check:api-plan-history
npm run check:zh
npm run check:ci
npm run selftest:zh; npm run selftest:expiry; npm run selftest:text; npm run selftest:health
npm run selftest:provenance; npm run selftest:history; npm run selftest:changes; npm run selftest:feeds
npm run selftest:audience; npm run selftest:app-token; npm run selftest:plans; npm run selftest:plan-history
npm run selftest:deal-plan-links; npm run selftest:api-plans; npm run selftest:seo
npm run selftest:planshub; npm run selftest:archive; npm run selftest:data-docs        # 新（页面层）
npm run selftest:models; npm run selftest:model-registry                             # 新（页面层 / 身份层，两支）
npm run ai:selftest; npm run fixture:test
npm run build
npm run verify; npm run verify:seo; npm run verify:regress
npm run check:feeds:reproducible
npm run report:coverage                    # 新
```

真浏览器验收需要 `$env:DSH_EDGE`（见 §0），否则 `verify-site.js` 会用写死的 Windows Edge 路径。

---

## 9. 与权威文档的关系

- 本文件 + `docs/v3.0/STAGE-PLAN.md` 是**实施约束**；题面 `docs/v3.0/TASK-SPEC-v3.0.md` 是**需求来源**。
- 两者冲突时：**题面为准**，并在阶段台账里记下冲突与处置。
- 旧契约文档是**追加关系，不要复制**：`docs/SCHEMA-v2.1.md`（Coding Plan）、`v2.3`（套餐变化）、
  `v2.4`（优惠↔套餐关系）、`v2.5`（API 计费）。新版 `docs/SCHEMA-v3.0.md` 用**引用**避免重复。
