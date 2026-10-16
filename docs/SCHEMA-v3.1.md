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

补一条实测：`rates.output === null` 的**也是** `openai/gpt-live-1` —— 与 `rates.input === null` 是**同一条**（不是两条），
所以「有 input 价」与「有 output 价」各是 **107/108**，不是 108/108。

复现（仓库根，逐项读数 `模型数 / 有 input 价 / 有 output 价 / mediaRates 非空 / input===null 的 key / output===null 的 key`）：

```bash
node -e "const m=require('./api-plans.json').plans.flatMap(p=>p.models);console.log(m.length, m.filter(x=>x.rates.input!==null).length, m.filter(x=>x.rates.output!==null).length, m.filter(x=>x.mediaRates&&x.mediaRates.length).length, m.filter(x=>x.rates.input===null).map(x=>x.modelKey).join(','), m.filter(x=>x.rates.output===null).map(x=>x.modelKey).join(','))"
# ⇒ 108 107 107 8 gpt-live-1 gpt-live-1
```

---

## 4. 模块结构

| 文件 | 职责 |
|---|---|
| `scripts/lib/api-cost.js` | 算法模块（纯函数 + `init(document)` + `module.exports`）。**结果表的渲染也在这里**：`breakdownTable()` / `rateText()` / `resultCaption()` 是**一份实现、两个宿主** —— 构建期渲染静态示例、浏览器里渲染实时结果，两处只差一个类名（改前两处各写一份，示例 4 列、实时结果 2 列，同一页两张表两种形状） |
| `scripts/lib/api-cost-page.js` | 页面渲染（正文 HTML + 预渲染示例 + 诚实性断言） |
| `scripts/tools/api-cost-selftest.js` | 离线自测（**108 条模型逐条对账** + 2 条牙 + 结果表渲染 9 条；实跑 **1757 项通过 / 0 失败**。108 是模型条数，不是断言项数） |
| `scripts/tools/build-local.js` | 构建期页面组装（内联脚本 + 路由注册 + sitemap + **页面级 CSS**，见 §7） |

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
| `verify-site.js` §20b 浏览器断言 | h1/canonical/控件/示例/内联脚本/四档宽度/交互后溢出/结果随输入变化/sitemap **+ 8 条排版与空态事实**（标题同一行 · 前两行控件各三格且顶边齐平·格宽相同·左边缘递增 · 页面级 CSS 生效 · 示例表满宽且题注 1 行 · 空态不写「免费」 · 两张表同一份列模型 · 结果表逐维度成行 · 数字列右对齐）（实跑 **31 项**，复现命令见本节末） |
| `verify-site.js` §22c ③c | **工具页首屏页面级说明 = 0 条**（与 ③b 同一个量 `introIndexes`；射程按 kind 现算，一页工具页都没有 ⇒ 判红） |
| `gate/action.yml` | `API-cost self-test` 步骤 |
| `check-ci-consistency.js` | GATE_STEP_NAMES + GATE_STEP_RUN |
| `layers.js` L2.scripts | `selftest:api-cost` |
| `package.json` scripts | `"selftest:api-cost"` |
| `smoke.js` ROUTES | `['tools/api-cost/', 'API 成本计算器']` |

实跑读数的复现命令（仓库根）：

- §4 的自测项数：`npm run selftest:api-cost` ⇒ 末行 `=== API 成本计算器演练：1757 项通过，0 项失败 ===`。
- 本节 §20b 的断言项数（**别用 `npm run verify:baseline`**，那会覆盖回归基线）：
  `node scripts/tools/verify-site.js --json=research/_raw/verify-report.json`，再
  `node -e "const r=require('./research/_raw/verify-report.json');console.log(r.checks.filter(c=>c.name.startsWith('/tools/api-cost/')).length)"` ⇒ `31`。
  （v3.1 上线时是 23 / 1748；补页面级 CSS 那一轮加了 8 条排版与空态事实 + §22c ③c，自测加了 9 条。**引用请带轮次**，
  两个数会随判据增删而变 —— 见 `DESIGN-RULES.md` 的「API 成本计算器的排版补课」一节。）

---

## 6. 诚实性断言

- **禁词清单**：与套餐页**同一份** `FORBIDDEN_CLAIM_WORDS`（唯一出处 `plans-page.js`）
- **credits 正则**：`/credits[^<]{0,40}(可购|可购买|约\s*[\d.]+\s*(万|亿)?\s*(token|Token|tokens))/`
- **预渲染示例**：标明「示例（固定计算，非官方报价）」，并逐项写出**固定用量**
  （输入 1,000,000.00 · 输出 500,000.00 · 缓存命中 200,000.00 tokens · 请求数 1，数字由 `workload` 对象现算）——
  示例与实时结果的数**本来就不一样**，读者要能一眼看出差在哪个量，否则只会以为算错了
- **同一页两张表共用同一份列模型**（维度 / 单价 / tokens / 成本），由 `breakdownTable()` 一处渲染
- **空态不冒充「免费」**：一个 token 都没填时显示「在上面填入 token 用量…」，**算出 0 才说免费**
  （0 在这套口径里读作「官方免费」，把没输入说成免费与红线 2 是同一类错）
- **免责说明**：官方价格可能已变 / 我们可能收录错了

---

## 7. 页面排版契约（v3.1 追记：这一页上线时漏了页面级 CSS）

`renderApiCostPage()` 曾经**没给 `renderWidePageShell()` 传 `extraCss`**（可选参数，漏了不报错）⇒
这一页只有共享 `<style>` 一份，15 个 `.cost-*` 类名零声明。现在这一页有自己的 `<style>`，
且**排版本身是断言**（`verify-site.js` §20b 7 条 + §22c ③c）。四条约定：

1. **首屏是工具**：`h1` + 版本号同一行（`.stop`）→ 计算器面板（控件 + 结果）→ 静态示例 → noscript 提示
   → 「口径与说明」六条 → 页脚链。工具页的首屏不排页面级说明（§22c ③c）。
2. **控件排成栅格**：`select` / `input` 三格一行（`repeat(3, minmax(0, 1fr))`，≤760px 塌成一列），
   标签在上、控件在下；同行**顶边齐平 + 格宽相同 + 左边缘递增**。
3. **六条口径说明**必须继续是 `#api-cost` 的**直接子节点、满宽**（§22c 的 note-narrow /
   note-ink-narrow / note-axis 判的就是这件事），且示例表 `.ptable` 要留在它们**之前**
   （它是 §22c 认的「主数据区」锚点，它的宽度决定那六条的判定基线）。
4. **两张表一套列模型**：静态示例与实时结果都走 `breakdownTable()`；数字列右对齐 + `tabular-nums`；
   缺价的维度照样占一行、单价写「—」（**不写 `null`，也不写 0**）。

---

## 8. 口径变更记录

v3.1 解除了以下禁令（用户批准）：

| 位置 | 原文 | 改为 |
|---|---|---|
| `README.md:39` | 不做成本计算器 | 允许计算，但计算是工具不是判断 |
| `TASK-SPEC-v3.0.md:1684` | API Cost Calculator（禁止） | ~~删除线~~ + 指向本文件 |
| `AGENT-REFERENCE.md:141` | 不做成本计算器 | 允许成本计算但禁止判断 |
| `MASTER_ACCEPTANCE_MATRIX.md:655-657` | PAGE-003/004/005 ✅（no） | 改判据 yes + 指向本实现 |
