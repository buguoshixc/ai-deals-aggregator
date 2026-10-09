# 架构（Architecture）

> **这份文档是架构的权威出处。** 它取代 `docs/v3.0/AGENT-REFERENCE.md §2.1` 的架构层表
> （那份是 v3.0 当时的历史快照，已标注过期）。
> 它回答七个问题：真值在哪、派生值在哪、页面怎么生成、Feed 怎么生成、History 怎么生成、
> Coverage 怎么生成、模块允许怎样依赖。

---

## 0. 一句话总览

```
源数据 → 领域层 → 派生/视图 → 页面正文 → 页面壳 → 构建编排 → 写入
                                  ↑
                          唯一 document 出口
```

站点是**静态生成 + GitHub Pages**（`index.html` 是源模板，构建期预渲染成 `dist/**`）。
没有客户端框架、没有运行时数据请求、没有服务端。

---

## 1. 真值在哪（Source of truth）

| 真值 | 住在哪 | 谁在读 |
|---|---|---|
| 优惠条目 | `deals.json`（采集 + 策展合并的产物） | 校验、构建、Feed、历史 |
| 人工策展输入 | `scripts/data/curated_{cn,global}.json` | `collect.js` → 合并进 `deals.json` |
| 套餐（Coding Plan） | `scripts/data/curated_plans.json` → `plans.json` | 套餐页、套餐历史 |
| API / Token 计费 | `scripts/data/curated_api_plans.json` → `api-plans.json` | API 计费页、API 历史 |
| 模型身份 | `scripts/data/models.json` → `models.json` | 模型页、覆盖报告 |
| 模型 ↔ 厂商映射 | `scripts/data/model-registry-links.json` → `model-registry-links.json` | 模型页（**只认显式映射**） |
| 优惠 ↔ 套餐关系 | `scripts/data/deal-plan-links.json` → `deal-plan-links.json` | 套餐页、优惠页 |
| 历史（三支） | `scripts/data/{deal,plan,api-plan}-history.json` | 变化雷达、归档、`*verify` 门禁 |
| 来源健康 | `scripts/data/source-health.json` → `source-health.json` | `/status/` |
| 页面类型声明 | `scripts/lib/page-kinds.js`（**代码即声明**） | 构建期、SEO 门禁、页壳 |
| 站点常量 | `scripts/lib/feeds.js` 的 `SITE_URL` / `SITE_NAME` / `SITE_DESCRIPTION` | 全站（**唯一出处**） |
| 共享样式 | `index.html` 的**单个** `<style>`（57,692 B） | 每个页面的基础样式 |
| 路由占位符表 | `scripts/tools/build-local.js` 的 `ROUTE_HREFS` | 页壳的 `resolveRouteHrefs()` |
| 统计范围 | `scripts/lib/analytics-routes.js` 的 `ROUTE_RULES` | 页壳的 `finalizePage()` |

**铁律**：`scripts/lib/**` 里没有第二份 `SITE_URL`，没有第二份「路由 → kind」表，
没有第二份「这一页要不要统计」的判据。

---

## 2. 派生值在哪（Derived）

**派生值不落新真值文件**，只在构建期算出来注入产物：

| 派生值 | 判据住在哪 | 说明 |
|---|---|---|
| `catalogStatus` / `catalogReason` | `scripts/lib/model-freshness.js` | 构建期 / `rebuild-models.js` / `check-models-reproducible.js` **三处必须同支**（少传一次 `catalog` 就落成 `unknown`，逐字节对账会当场红） |
| `coverageStatus` | `scripts/lib/coverage-targets.js` | 意图层 + 七种派生状态 |
| 变化雷达视图 | `scripts/lib/changes.js` | `itemListRecords()` 是成员集合的权威判据 |
| 套餐变化视图 | `scripts/lib/plan-changes.js` | |
| 归档（结束/恢复） | `scripts/lib/archive.js` | baseline + events + absence + 墓碑 label |
| 站点常量 | `scripts/lib/site.js` | `SITE_URL` / `SITE_NAME` / `SITE_DESCRIPTION` / `xmlEscape` / `VENDOR_*` 的**唯一出处**（原先住在订阅层的 `feeds.js`，随订阅层下架搬到这一支） |
| 落地页计划 | `scripts/lib/landing.js` | `planLandingPages()` 一张表 + 一个循环 |
| 产物资产门禁 | `scripts/lib/published-assets.js` | 允许出现在产物里的非 HTML 文件的**唯一注册表**（扫 `dist/**`，未登记即构建失败） |

**硬守的四条真值边界**（重构不得退化）：

1. `firstSeen ≠ releasedAt`（首次见到 ≠ 官方发布）
2. 采集器失败 ≠ 优惠结束（`health.js` 与措辞红线把守）
3. `catalogStatus` / `coverageStatus` 是**派生**，不是真值
4. 归档层是**派生视图**，不落新真值文件

---

## 3. 页面怎么生成

```
page-kinds.js（路由 → kind → 布局族 wide/detail/prose）
        ↓
scripts/lib/*-page.js  （这一族的**正文**：纯函数，可被离线自测直接调用）
        ↓
scripts/lib/page-shell.js  （**唯一** document 出口：DOCTYPE / head / 共享页头 / 共享页脚）
        ↓
scripts/build 编排（现在是 scripts/tools/build-local.js 的 assemble()）
        ↓
dist/**（暂存目录全部自检通过后，原子替换到位）
```

### 3.1 页面壳的唯一出口

`scripts/lib/page-shell.js` 是**全仓唯一**产出 `<!DOCTYPE html>` 的生产模块
（由 `npm run fitness` 断言守住）。9 个页面族全部走它：

| 页面族 | 正文模块 | kind | 布局族 |
|---|---|---|---|
| 首页 | `index.html`（自身就是源模板，做 marker 替换） | `home` | wide |
| `/status/` | build-local（页面级正文仍在原地） | `status` | wide |
| `/changes/` | build-local | `changes` | wide |
| `/feeds/` | build-local | `feeds` | wide |
| 落地页（分类 / 按需求 / 厂商 / 枢纽 / 别名） | build-local | `collection`/`need`/`category`/`vendor`/`hub`/`alias` | wide |
| `/plans/coding/` | `lib/plans-page.js` | `plans` | wide |
| `/plans/api/` | `lib/api-plans-page.js` | `plans` | wide |
| `/plans/` | `lib/plans-hub-page.js` | `plans-hub` | wide |
| `/models/` `/models/<slug>/` `/archive/…` `/docs/data/` | `lib/models-page.js` · `lib/archive.js` · `lib/data-docs.js`（经 `renderStaticPage` 参数映射） | `models-index`/`model`/`archive-index`/`archive-detail`/`data-docs` | wide / **detail** |
| `/deal/<id>/` | `lib/render-core.js` | `deal` | **detail** |

两条入口**共用同一份脚手架实现**：
- `docStart()` / `docEnd()`：正文标记留在原地，首尾各插一次（重构 diff 最小）；
- `renderPageShell({ bodyHtml })`：正文已经是一个现成的值。

### 3.2 页壳拥有什么 / 不拥有什么

**拥有**（文档脚手架）：DOCTYPE、`<head>` 基础 meta、title/description/robots/canonical/hreflang、
OG+Twitter、主题色、favicon、共享 `<style>`、页面级 `<style>` 槽位、JSON-LD 槽位、
订阅发现槽位、共享页头标记、`<div class="wrap">`、`<main>`、共享页脚 + `finalizePage()`、
页面脚本槽位、收尾标签。

**不拥有**（刻意留给调用方）：标题/描述/canonical 的**计算与转义**；
`feedTagsHtml` / `jsonLdHtml` / `headerExtra` / `extraCss` / `extraScript` / `extraTailHtml`
一律是**预渲染好的字符串** —— 订阅标签有 6 种取法、JSON-LD 每页段数不同，这些语义留在各自页面模块里。

### 3.3 CSS 的分层（同一条规则只有一个正式来源）

| 层 | 住在哪 | 放什么 |
|---|---|---|
| 共享 | `index.html` 的单个 `<style>` | **全站同一条规则**：`.detail-main` 内容列、`.snote` 说明宽度、主题变量 |
| 页面族 | 各页面模块的 `extraCss` | **只有这一族需要**的原语：如 `renderStaticPage` 五族共用的 `.ptable` / `.minfo` |
| 页面 | 单页的 `extraCss` | 这一页独有的规则 |

文档序是「共享 `<style>` → 页面级 `<style>`」，所以页面级天然覆盖共享层。
**什么时候把某条上提到共享层**：当**第二个布局族**也需要它时（判据，不是感觉）。

⚠️ 已知的重复面（本轮审计记录在案，未合并）：`STATIC_PAGE_CSS`（五族，`.ptable td` min-width 72px）
与 `PLANS_TABLE_CSS`（套餐页，92px + `.ptag` + `.ptable .num small`）是**变体关系**。
合并前必须先证明两条规则真的同值 —— 否则外观会静默改变，而外观回归只有真浏览器几何断言抓得到。

---

## 4. 订阅层与数据出口：**已整体下架**（2026-10）

早先这一节写的是「Feed 怎么生成」：注册表在 `scripts/lib/feeds.js`、构建期产出 25 个 Feed ×
2 种格式 = 50 个文件、`/feeds/` 订阅中心页、每页 `<head>` 的 `rel="alternate"` 订阅发现。

本轮把面向读者的数据暴露整体收口 —— **这些都不再存在**：

- **订阅层整族删除**：`scripts/lib/feeds.js`（86 KB）已删除；`/feeds/` 页面、`feed.xml` /
  `feed.json` / `feed/**`（各 25 份 × 2 格式）、每页的订阅声明与页脚订阅入口全部下架。
  判据侧：`verify-site.js` 的每个页面族都断言 **0 条 `rel="alternate"`**（比旧断言更严：
  对「哪天溜回来一条」敏感）。
- **站点常量没有跟着陪葬**：`SITE_URL` / `SITE_NAME` / `SITE_DESCRIPTION` / `xmlEscape` /
  `VENDOR_SLUGS` / `VENDOR_THRESHOLDS` 搬到 `scripts/lib/site.js`（它们从来不是订阅专属）。
- **数据文件不再进产物**：除首页自己那份 `assets/data/offers.json`（不被任何页面文本/链接提及）
  之外，`*.json` / `*.ndjson` / `feed*` 一律不许出现 —— 由构建期 `lib/published-assets.js`
  fail-closed 扫描守着。仓库根的那些源文件仍是数据真值（`check:*:reproducible` 一族对账它们）。
- **数据出口整族删除**：`scripts/lib/data-docs.js`、`/docs/data/` 文档页、`data/index.json`
  Manifest 与 9 份数据集 endpoint 全部下架。
- **真值来源**：产物级验收（`verify-site.js`）改从**仓库根**读源文件（`readRoot()`）——
  「产物里的副本 == 源文件」这件事由构建期门禁负责，不需要真浏览器再证一遍。

---

## 5. History 怎么生成

三支共用 `scripts/lib/history-core.js` 内核，各自只声明差异：

| 支 | 日志 | 一致性门禁 |
|---|---|---|
| 优惠 | `scripts/data/deal-history.json` | `npm run check:history` |
| 套餐 | `scripts/data/plan-history.json` | `npm run check:plan-history` |
| API 计费 | `scripts/data/api-plan-history.json` | `npm run check:api-plan-history` |

- **一次性基线 + 追加事件**；门禁做的是「重放后必须逐字段等于当前数据」。
- **不是墙钟**：`firstSeen` / `endedAt` 都来自数据，不读 `Date.now()`（renderer 纯度断言守这一条）。
- **归档层是视图**：`lib/archive.js` 从三份日志派生「结束/恢复」条目，不落新真值文件。
- **一次没见到不算下线**（批量熔断）；日期倒填被拒。

---

## 6. Coverage 怎么生成

- **意图层**：`scripts/lib/coverage-targets.js` —— 「我们打算覆盖什么」。
- **七种派生状态**：由意图 + 实际数据共同派生（`coverageStatus` 是**派生值**）。
- **报告器**：`npm run report:coverage`（`coverage-report.js`）产出缺口清单；
  **门禁**是 `npm run selftest:coverage-targets`（意图层 + 七种状态逐分支）。
- **模型当前性**：`scripts/lib/model-freshness.js` 派生 `catalogStatus`（见 §2）。

---

## 7. 模块允许怎样依赖（依赖方向）

```
scripts/data/**（JSON 真值）
      ↓
scripts/lib/domain      schema · plan-schema · api-plan-schema · model-registry · providers
                        coverage-targets · model-freshness · history-core · plan-history …
      ↓
scripts/lib/derived     feeds · seo · changes · plan-changes · archive · data-docs · landing · health
      ↓
scripts/lib/*-page.js   页面正文（纯函数）
      ↓
scripts/lib/page-shell.js   唯一 document 出口
      ↓
scripts/tools/build-local.js（构建编排；未来收敛为 scripts/build/）
      ↓
dist/**
```

**允许**：
- 下游依赖上游（全部单向，无环）；
- `tools/**` 依赖 `lib/**`；
- 测试依赖任何一层。

**禁止**（`npm run fitness` 断言）：
- `scripts/lib/**` 依赖 `scripts/{build,tools,ai}/**` —— 方向反了；
- 页面正文/页壳模块读盘 / 写盘 / 联网 / 看当前时间（时间必须 context 注入）；
- 生产模块（除 `lib/page-shell.js`）产出 `<!DOCTYPE`；
- 页面模板里重做业务判断（应由 `lib` 的判据决定）。

---

## 8. 构建的纯度与确定性

- **构建期 offline deterministic**：不联网、不看当前时刻。只有 collector / research 访问外网。
- **渲染器纯净**：`input → HTML`。
- **写入面集中**：产物先写 `<输出目录>.building`，全部自检通过后原子替换；
  失败则清掉暂存目录、`dist/` 原封不动。
- **确定性判据**：`npm run check:reproducible` + 全树 hash 对比（同输入 ⇒ 逐字节相同输出）。

---

## 9. 改动的落点速查（改什么 → 改哪里）

| 想做的事 | 改哪里 |
|---|---|
| 新增一页 | `page-kinds.js` 声明 kind + 布局族；写 `lib/<族>-page.js` 正文；在 `assemble()` 里调 `shell.docStart/docEnd`；登记 sitemap / 路由 / 统计范围 |
| 改共享页头 / meta / 页脚 | `lib/page-shell.js`（**一处**） |
| 改全站样式 | `index.html` 的共享 `<style>`（**一处**） |
| 改某族页面样式 | 该族的 `extraCss` |
| 新增一个采集源 | `scripts/collectors/*` + `collectors/index.js` 注册表 + fixture 回放 |
| 新增一个 Feed | `lib/feeds.js` 的注册表 |
| 改 SEO 判据 | `lib/seo.js`（构建期）+ `page-kinds.js`（声明）；独立门禁 `seo-verify.js` 各自从 dist 解析 |
| 改某页的正文 | 该族的 `lib/*-page.js`（离线自测可直接调用） |
| 改二级数据页**用户可见的说明** | 注册表的 `userIntro`（顶部、0~1 句）/ `userNotes`（底部折叠）—— **不要**改回 `why`，`selftest:audience` 有一条「旧字段回流即红」 |
| 改某页**分类判据的解释口径** | `docs/DESIGN-RULES.md` §8 的「二级数据页口径归档」（**维护文档，不是页面正文**）。判据实现仍在 `lib/audience.js` / `lib/landing.js`，且只写一遍 |
| 加一条页面族级文案守卫 | 注册表级 → `selftest:audience` §9；产物级（含动态生成的 `/vendor/<slug>/`）→ `build-local.js` 的产物自检（Markdown 记号 / 首屏内部措辞两张扫描面） |
