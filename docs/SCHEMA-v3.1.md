# SCHEMA v3.1 —— API 成本计算器（/tools/api-cost/）

> 前置：[`SCHEMA-v2.5.md`](SCHEMA-v2.5.md)（API 计费数据契约）。这一层**不改**它的任何字段。
>
> v3.1 只写新增/改动，既有契约引用旧文档。

---

## 1. 这一层干什么、不干什么

**干**：让用户输入 token 用量，按 `api-plans.json` 里已收录的官方单价算出成本。

**不干**（一条都没做，且由自测钉住）：

- 不排序、不推荐、不说「便宜」「更省」「性价比」「最值得」；
- 不做跨币种求和或折算（盘上没有汇率系统，这是刻意的）；
- 不做 credits → tokens 折算（`assertPageHonesty()` 有正则盯着）；
- 不把结果写回任何数据文件（`derivedMetrics` 继续恒为 `{}`）；
- 不自动替用户选档位（channel / variant 必须用户显式选）。

---

## 2. 算法规则

### 2.1 计算公式

```
cost = rate × tokens / divisor × requests
```

- `rate`：`rates[dim]`（官方单价）
- `tokens`：用户输入的该维度 token 数
- `divisor`：`per_1M_tokens` → 1,000,000；`per_1K_tokens` → 1,000
- `requests`：请求数（token 总量 = 请求数 × 单请求 tokens）

### 2.2 维度判断（顺序不能改）

1. 先判「这个模型能不能进 token 计算器」：`mediaRates` 非空 → 不能；`rates.input === null` → 不能。
2. 再判「用户填的每个维度，这个模型有没有价」：
   - 有价 → 算
   - 无价但用户填了 → 标「该维度无已收录单价」（**不回退 input 价**）
   - 无价且用户没填 → 跳过
3. `rate = 0` → `cost = 0`（官方明说免费）
4. `rate = null` → 该维度算不出

### 2.3 舍入

- 内部计算：固定 6 位小数（`ROUND_DIGITS = 6`）
- 显示格式：自己实现千分位，不用 `toLocaleString()`（跨 locale 不漂）

---

## 3. 排除的条目

| 排除原因 | 数量 | 判据 |
|---|---|---|
| `mediaRates` 非空（非 token 口径） | 8 | `isComputable()` → `reason: 'non-token-pricing'` |
| `rates.input === null`（如 gpt-live-1） | 1 | `isComputable()` → `reason: 'no-input-price'` |

---

## 4. 模块结构

| 文件 | 职责 |
|---|---|
| `scripts/lib/api-cost.js` | 算法模块（纯函数 + `init(document)` + `module.exports`） |
| `scripts/lib/api-cost-page.js` | 页面渲染（正文 HTML + 预渲染示例 + 诚实性断言） |
| `scripts/tools/api-cost-selftest.js` | 离线自测（108 条逐条对账 + 2 条牙） |
| `scripts/tools/build-local.js` | 构建期页面组装（内联脚本 + 路由注册 + sitemap） |

### 双宿主模式

`api-cost.js` 是 IIFE + `module.exports`（照 `plans-compare.js` 套路）：
- 浏览器：`init(document)` 自动执行
- Node：`module.exports` 给自测 `require`
- `build-local.js` 把源码逐字节内联进页面

---

## 5. 路由与门禁

| 注册点 | 位置 |
|---|---|
| `page-kinds.js` FIXED_ROUTE_KINDS | `'tools/api-cost/': 'tool'` |
| `page-kinds.js` KIND_TABLE | `tool`（layout: wide, textFloor: 400, ItemList: false, sitemap: 0.7/monthly） |
| `analytics-routes.js` ROUTE_RULES | `re: /^tools\/api-cost\/$/` trackable: true |
| `build-local.js` ROUTE_HREFS | `['__APICOST_HREF__', 'tools/api-cost/']` |
| `build-local.js` sitemap | `<url>` priority 0.7 monthly |
| `build-local.js` pageRoutes | `apiCostPage.API_COST_ROUTE` |
| `build-local.js` routeOutputs | `[tools/api-cost/index.html, ../../]` |
| `build-local.js` expectedLocs | +1（API 成本计算器） |
| `verify-site.js` §20b 浏览器断言 | h1/canonical/控件/示例/内联脚本/四档宽度/交互后溢出/结果随输入变化/sitemap |
| `gate/action.yml` | `API-cost self-test` 步骤 |
| `check-ci-consistency.js` | GATE_STEP_NAMES + GATE_STEP_RUN |
| `layers.js` L2.scripts | `selftest:api-cost` |
| `package.json` scripts | `"selftest:api-cost"` |
| `smoke.js` ROUTES | `['tools/api-cost/', 'API 成本计算器']` |

---

## 6. 诚实性断言

- **禁词清单**：与套餐页**同一份** `FORBIDDEN_CLAIM_WORDS`（唯一出处 `plans-page.js`）
- **credits 正则**：`/credits[^<]{0,40}(可购|可购买|约\s*[\d.]+\s*(万|亿)?\s*(token|Token|tokens))/`
- **预渲染示例**：标明「示例（固定计算，非官方报价）」
- **免责说明**：官方价格可能已变 / 我们可能收录错了

---

## 7. 口径变更记录

v3.1 解除了以下禁令（用户批准）：

| 位置 | 原文 | 改为 |
|---|---|---|
| `README.md:39` | 不做成本计算器 | 允许计算，但计算是工具不是判断 |
| `TASK-SPEC-v3.0.md:1684` | API Cost Calculator（禁止） | ~~删除线~~ + 指向本文件 |
| `AGENT-REFERENCE.md:141` | 不做成本计算器 | 允许成本计算但禁止判断 |
| `MASTER_ACCEPTANCE_MATRIX.md:655-657` | PAGE-003/004/005 ✅（no） | 改判据 yes + 指向本实现 |
