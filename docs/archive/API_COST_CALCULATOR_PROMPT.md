# 任务：实现 API 成本计算器（`/tools/api-cost/`）

> **这份文件就是你要执行的完整任务书。** 把它整份当作需求、约束与验收标准。
> 工作目录：`D:\OneDrive\Desktop\Code\AI Page`（Windows / PowerShell 7）。
>
> **写作时间：2026-10-13。** 下面所有**行号**与**实测数字**都是那一天量的基线。
> 动手前先重新核一遍（第 0 节的命令），有出入以**你现场量到的**为准，并在交付报告里写明差异。
> 不要盲信本文档里的行号。

---

## 0. 先做的事（不要跳过）

### 0.1 读这几份，建立口径

按顺序读，它们决定了这个项目"什么算对"：

1. `README.md` —— **设计原则**与「四条 v3.0 纪律」；`快速开始`一节里的门禁串。
2. `docs/SCHEMA-v2.5.md` —— API 计费数据契约，尤其 §11 引文白名单、§12「派生指标恒为 `{}`」。
3. `docs/v3.0/TASK-SPEC-v3.0.md` —— §13「明确禁止」、§14「文档同步」。
4. `AGENT-REFERENCE.md` —— §3 的禁止清单与既有契约边界。
5. `NEXT-STEPS.md` —— 搜「Phase 2.5 还剩下的」，看第 ③ 项就是本任务。
6. `scripts/lib/api-plans-page.js` 顶部注释 —— `/plans/api/` 的**四条硬承诺**（本次要复用它的诚实性断言）。

### 0.2 立刻重测基线（把结果贴进你的交付报告）

```powershell
# 数据规模与维度覆盖
node -e "const d=require('./api-plans.json'); const ms=d.plans.flatMap(p=>p.models.map(m=>({p,m}))); const f=['input','output','cachedInput','cacheWrite','cacheWriteLong','reasoning','batchInput','batchOutput']; console.log('plans',d.plans.length,'models',ms.length); for(const k of f){const n=ms.filter(x=>x.m.rates[k]!==null&&x.m.rates[k]!==undefined).length; console.log(k,n,'/'+ms.length);} const g={}; for(const x of ms){g[x.p.pricing.currency]=(g[x.p.pricing.currency]||0)+1} console.log('currency',JSON.stringify(g)); const u={}; for(const x of ms){u[x.p.pricing.unit]=(u[x.p.pricing.unit]||0)+1} console.log('unit',JSON.stringify(u));"

# /plans/api/ 当前是不是真的零控件（唯一那个 <input> 是正文代码块里的示例，不是控件）
node -e "const t=require('fs').readFileSync('dist/plans/api/index.html','utf8'); for(const s of ['<input','<select','<textarea','<button']) console.log(s,(t.match(new RegExp(s,'g'))||[]).length);"
```

**2026-10-13 实测基线**（你的数字应该一致或更新）：

| 项 | 值 |
|---|---|
| 计划 / 厂商 / 模型计价条目 | **24 / 21 / 108** |
| `input` · `output` | **107 / 108（99%）** |
| `cachedInput` | **67（62%）** |
| `cacheWrite` | **22（20%）** |
| `cacheWriteLong` | **5（5%）** |
| `reasoning` · `batchInput` · `batchOutput` | **0 · 0 · 0** |
| 币种 | CNY **57** / USD **51** |
| 计价单位 | `per_1M_tokens` **101** + `per_1K_tokens` **7** |
| `variant` | `standard` + `long_context` **13** |
| `channel` | `standard` + `off_peak` **3** + `batch` **6** |
| 有 `mediaRates` 的条目 | **8** |
| `input === null` 的条目 | **1**（`openai/gpt-live-1`，按分钟计价） |
| `input === 0 && output === 0` | **2**（`zhipu` 的 `glm-4.6v-flash` / `glm-4.7-flash`，官方明写免费） |
| `dist/plans/api/index.html` 控件 | `select`/`textarea`/`button` = **0**；`<input>` = 1（正文代码块） |

### 0.3 ⚠️ 动手前必须先拿到用户确认的一件事

**当前仓库里有三处点名叫停这个功能。** 你不能在没拿到用户明确批准的情况下自行绕过：

| 位置 | 现文 | 需要变成 |
|---|---|---|
| `README.md:39`（设计原则第 4 条） | 「不排序、不推荐、不折价、**不做成本计算器**」 | 「允许**计算**，仍然禁止**判断**（不排序、不推荐、不折价、不出"谁更便宜"）」 |
| `docs/v3.0/TASK-SPEC-v3.0.md:1684`（§13 明确禁止） | 清单里有 `API Cost Calculator` | 从禁止清单移出，改为「本阶段允许：见 `docs/SCHEMA-v3.1.md`」 |
| `AGENT-REFERENCE.md:141` | 「不做成本计算器」 | 同上口径 |
| `research/audit/MASTER_ACCEPTANCE_MATRIX.md:655-656` | `P2.5-API-PAGE-003`「无 calculator 代码」✅ / `P2.5-API-PAGE-004`「未来项只写在文档」✅ | 改判据指向本实现（**不要删条目**） |

**原始题面 `AI_DEALS_CODING_PLAN_PHASES_PROMPTS.md:1757-1774`（§八）说的是"如果基础数据稳定，未来可以单独规划…但本阶段不要做"** ——
所以这不是违背原始意图，是开启它预留的窗口。**但三处禁令是显式写在仓库里的**，必须显式改写。

> **如果用户没有在这个会话里明确说"改口径，做计算器"，你的第一个动作是：把这一节读给用户听，请求批准，然后停下。**
> 不要先写代码再补口径。

---

## 1. 任务目标

在 `/tools/api-cost/` 上线一个 **API 成本计算器**：用户输入 token 用量，页面按 `api-plans.json` 里**已收录的官方单价**算出成本。

**产出一台"出数机器"，不是一个顾问。**

### 它做什么

- 用户指定：模型（及其 `channel` / `variant`）、输入 tokens、输出 tokens、（可选）缓存相关维度、请求数。
- 页面按该模型该档位的官方单价算出成本，并**逐项标出每个数字的来源**（`planId` 锚点 + 官方定价页 + `unitNote` + `lastSeen`）。
- 结果明确标注为**计算值**。

### 它绝对不做什么（这是本任务的核心约束，不是"锦上添花"）

- **不排序**、**不推荐**、不说「便宜」「更省」「性价比」「最值得」。
- **不做跨币种求和或折算**（盘上没有汇率系统，这是刻意的）。
- **不做 credits → tokens 折算**（见 §5 第 26 条，有一条现成正则盯着）。
- **不把结果写回任何数据文件**（`derivedMetrics` 继续恒为 `{}`）。
- **不自动替用户选档位**（`channel` / `variant` 必须用户显式选）。

---

## 2. 数据层的硬约束（决定什么算得出来、什么必须说"算不出"）

数据源：仓库根的 **`api-plans.json`**（只读，本任务**不修改它**）。
契约与归一器：`scripts/lib/api-plan-schema.js`（78KB，字段白名单与归一都在这里）。
页面渲染范式：`scripts/lib/api-plans-page.js`（54KB，`/plans/api/` 的正文渲染，**本次要读透它**）。

### 关键字段形状（照抄，不要臆造）

```jsonc
// api-plans.json → plans[] → models[]
{
  "name": "GLM-5.3",
  "modelKey": "glm-5.3",
  "variant": "standard" | "long_context",
  "aliases": null,
  "rates": {
    "input": 8, "output": 28, "cachedInput": 2,
    "cacheWrite": null, "cacheWriteLong": null,
    "reasoning": null, "batchInput": null, "batchOutput": null
  },
  "mediaRates": null,   // 或 [{ kind, price, unit, note }]
  "note": null
}
// 计划级：pricing.unit ∈ per_1M_tokens | per_1K_tokens；pricing.currency ∈ CNY | USD；
//         pricing.unitNote（逐字抄官方的单位口径，展示时要读它）
//         channel ∈ standard | off_peak | batch
//         lastSeen（我们最后一次人工核对官方页的日期）；evidence[]（官方引文）
```

### 规则（每条都对应一个真实数据事实）

6. **缺维度绝不回退标准价。** `cachedInput` 只有 62% 有、`cacheWrite` 只有 20% 有。用户填了缓存维度而该模型没有这个价 ⇒ **明说"该维度无已收录单价"**，不许拿 `input` 价顶上。
7. **`reasoning` / `batchInput` / `batchOutput` 三列在盘上全是 `null`。** 所以「按 batch 算」这种能力**现在根本给不出来**。严禁用「batch 通常是标准价一半」这类先验补数 —— 那是编造。要么显式不支持，要么只对官方真的单列了 batch 价的条目开放（`channel: "batch"` 的 6 条是**独立记录**，不是从 standard 推出来的）。
8. **`0` 与 `null` 是两句不同的话。** 官方的 `0`（GLM-4.6V-Flash / GLM-4.7-Flash 的 input/output/cachedInput 全 0）⇒ 能算出 **0**，是对的。`null`（`gpt-live-1`，按分钟计费 $0.05/min，走 `mediaRates`）⇒ **它根本进不了 token 计算器**，必须显式排除，不许算成 0。
9. **分档与通道必须用户自己选。**
   - `variant`：13 条 `long_context`。智谱按**输入长度分档**（`[0,32K)` / `[32K,64K)` / `[32K,128K)` / `[32K+)`），选错档单价就错。
   - `channel`：9 条非 standard（`off_peak` 3 + `batch` 6）。
   - 自动挑档 = 替用户做判断。
10. **没有汇率系统，且刻意如此。** CNY 57 / USD 51。只能出**两张并排结果**，**永不求和、永不折算**。与 `plans-compare.js` 的排序口径同源：「没有汇率就绝不跨币种比大小」（见 `NEXT-STEPS.md` 里 `v2.2-coding-plan-compare` 那一节）。
11. **单位制不统一：`per_1M_tokens` 101 条 + `per_1K_tokens` 7 条**（百川 ×2 / 百度 ×3 / 商汤 ×2，全 CNY）。算法按 `pricing.unit` 归一，但**展示时单位必须显式写出来** —— `/plans/api/` 有一条断言专门盯这个（`scripts/tools/verify-site.js` 的 §20：「每一行都写出「计费单位」，且与数据一致（$ / 1M 与 $ / 1K 不会被混为一谈）」）。顺手乘 1000 让两列"看起来可比"正是那条断言要防的。
12. **缓存写入按 TTL 分档，缓存读取不分档。** Kimi K3：`cacheWrite` 20（TTL 5min）/ `cacheWriteLong` 40（TTL 1h）/ `cachedInput` 2。一个笼统的"缓存写入"输入框表达不了这个形状。
13. **`unitNote` 里有人话口径，是准确性的来源。** 它逐字抄了官方的单位声明（如火山「1.2元/百万命中tokens 0.017元/百万tokens缓存/小时」）。展示官方口径时读这个字段，别自己写一句近似的话。
14. **`mediaRates` 有 8 条**（按分钟 / 每秒 / 每 1M token·小时 等非 token 口径）。它们**不进 token 计算器**，但要在页面上说明"这些条目为什么算不了"。

---

## 3. 输入设计

15. **输入集合要最小且自洽。** 题面 §八（`AI_DEALS_CODING_PLAN_PHASES_PROMPTS.md:1766-1770`）给的是 `input tokens` / `output tokens` / `requests`。每加一个维度（缓存命中率、缓存写入量、分档选择）都要按第 6 条处理"该模型没有这个价"。
16. **默认值一旦预填，它就成了一个工作负载假设。** 预填等于替用户假设；留空等于强制用户表达。**建议留空**；预渲染的示例只存在于静态正文里。
17. **数值解析要有边界。** 千分位、小数、科学计数、粘贴进来的全角数字、负数、`e` 记法、超长数字串、空值。非法输入要给明确提示，不要静默当成 0。
18. **结果必须与官方单价物理分区。** `PROJECT_STATUS.md:2854-2855` 那两条硬约束：① 结果是**计算值**不是套餐额度，界面必须写明；② 计算值不得进数据集。
19. **窄屏上的长数字会撑破表格。** `/status/`、`/plans/coding/`、`/plans/api/` 都踩过（`verify-site.js` 里那条注释写着「窄屏把整页撑开（/status/、/plans/coding/、/plans/api/ 都踩过）」）。格式化输出要防这一条。

---

## 4. 算法规则（顺序不能改）

20. **先判"这个模型这一档有没有价"，再算。** 顺序反了就会出现"用 input 价补 cachedInput"这种静默错误。
21. **缺一个必需维度 ⇒ 整条结果标"算不出"**，而不是算出一个偏小的数。宁可空着，也不给一个看起来完整的错数。
22. **`requests` 的语义要写清。** 它只是 tokens 的乘数（总量 = 请求数 × 单请求 tokens），**不是**每次请求的固定费用 —— 盘上**没有任何 per-request 计价字段**。措辞写错就会被读成"调用费"。
23. **显示精度与舍入方向要固定并断言。** 单价最小到 0.005（`openai` batch 档 `gpt-6-luna` 的 `cachedInput`），大额结果会到很多位小数。舍入规则写死，否则两次构建的数字会漂。
24. **零与空在结果侧同样要分开。** 官方免费 ⇒ `0`；没有那一档的价 ⇒ 空。与第 8 条同一判据，换到输出侧。
25. **溢出与精度要显式写上界。** 盘上最大的单价是 `output: 100`（CNY/百万 tokens），乘以一个很大的 token 数仍在 double 安全区内 —— 但别指望它不会溢出，写上限。

---

## 5. 输出与措辞（最容易翻车的地方）

26. **有一条现成正则专门盯 credits → token，别撞上它。**
    `scripts/lib/api-plans-page.js` 的 `assertPageHonesty()` 里有：

    ```js
    if (/credits[^<]{0,40}(可购|可购买|约\s*[\d.]+\s*(万|亿)?\s*(token|Token|tokens))/.test(text)) {
      problems.push('页面把 credits 折算成了 token 数量 —— credits 是钱，不是额度');
    }
    ```

    ⚠️ 计算器"顺手"算这个非常诱人（单价就在手边，看起来白送）。**明确写进设计：credits 不进计算器。**
    （`docs/SCHEMA-v2.5.md:262-268` 的三条结构红线也保持原样：credits 字段白名单无 token 字段、拒绝键名含 `token`、`unit` 不含 tokens。）

27. **禁止结论性词汇。** `scripts/lib/plans-page.js` 的 `FORBIDDEN_CLAIM_WORDS` 是**唯一出处**（`api-plans-page.js:65` 直接引用它，不另立一套）。`assertPageHonesty()` 会逐词扫整页文本。计算器页面必须挂同一份清单 —— 这也是它最可能红的一条。
28. **绝不出"谁最便宜"的排序。** 你可以同时算多个模型，但**不能按结果排序**。一旦排序，就是推荐。
29. **每条结果都要能追回官方单价。** 结果旁边给该模型的 `planId` → `/plans/api/#plan-<id>` 锚点 + 官方定价页链接 + `unitNote` + `lastSeen`。
30. **明写"这是我们按你输入算的，不是官方报价"**，并给两条免责说明：官方价格可能已变（`lastSeen` 是我们的核对日期，**不是**官方承诺不变的日期）；我们自己可能收录错了（链到官方页让读者能核对）。这一页最容易被读成"官方给了这个数"。
31. **页面静态正文里预渲染一个固定示例**（对齐 README 第 7 条「发布产物必须有静态正文」的原则）。也让爬虫和禁用 JS 的读者看到这一页在干什么。
32. **预渲染的示例必须标明是示例**，否则它会变成一个"看起来像官方数字"的裸数 —— 比没有更糟。
33. **`/plans/api/` 的页面口径文案里点名了这个计算器，上线后要同步。**
    `scripts/lib/api-plans-page.js:83-85`（`API_PLANS_NOTES` 第 6 条）现在写着「需要这类估算请**等待后续的 API 成本计算器**」；`docs/SCHEMA-v2.5.md:270` 同一句话。功能上线后两处都得改，否则页面在叫用户等一个已经存在的东西。
    ⚠️ 注意 `verify-site.js` §20 有一条断言要求该页写着「单位不换算」与「credits 不是 token」两类口径 —— 改文案**不能把这两句弄丢**。

---

## 6. 实现形态

34. **算法逻辑单独成模块放 `scripts/lib/`，构建期逐字节内联。** 照 `scripts/lib/plans-compare.js` 的既有套路（其顶部注释就是这份约定的说明）：模块导出 `init(document)` 给浏览器用，`build-local.js` 把**同一份源码字节**内联进页面，离线自测 `require` **同一份字节**。这样计算规则能在**没有浏览器**的情况下被断言。
    - `/plans/coding/` 的先例：`build-local.js` 里有 `/* scripts/lib/plans-compare.js —— 逐字节内联（离线自测 require 的也是同一份） */`。
35. **`scripts/lib/**` 不得依赖 `scripts/{build,tools,ai}/**`。** 这是 `.github/actions/gate/action.yml` 里的架构不变式第 1 条，由 `scripts/test/fitness.js` 守着。
36. **页面正文模块不读盘、不联网、不看当前时间。** 同一条不变式：**时间必须由 `context` 注入**。计算器若显示"算于某时"，只能用注入的时间。
37. **只有 `scripts/lib/page-shell.js` 能产出 `<!DOCTYPE`。** 计算器页必须走 `shell.loadShellParts(indexHtml, ROUTE_HREFS)`，不能自己拼整页。
38. **零控件豁免有严格形状，且不是通用的。** `scripts/tools/verify-site.js` 顶部有一大段注释解释 `NOJS_CONTROL_EXEMPTIONS`：
    - 登记项必须同时带 `code` / `why` / `withdrawWhen`，**缺一个就视同没登记**（fail-closed）；
    - 目前**只有** `route: 'plans/coding/'` 这一条，命中时打印可 grep 的码 `NOJS-CONTROL-EXEMPTION`；
    - `--strict-nojs-controls` 是**收回开关**（登记表整体失效）；
    - ⚠️ **不要**把豁免挂在 `--allow-control-exemption` 上 —— CI 跑的是裸 `node scripts/tools/verify-site.js`，那样会永久长红。
    - 计算器是**有控件的新页面族**，需要自己的口径：要么走同形状的登记（带撤回条件），要么该页不适用该断言。**先想清楚，再写。**
39. **不要用"惰性骨架"绕过零控件断言。** 那条路已被**实测否掉**：把 `<button>` 换成 `<span>` 后单元素高 +3px、117 个后代元素几何全部漂移、控件块高度在四档宽度上多出 **123–142px**，比现状更差。原文就在 `verify-site.js` 的那段注释里。

---

## 7. 构建与路由注册点（漏一条就是一个静默失效）

40. **`scripts/lib/page-kinds.js` 登记。** `FIXED_ROUTE_KINDS`（约 `:237-243`，`'plans/api/': 'plans'` 就在这里）每条固定路由都要声明族；`ROUTE_PATTERNS` 是通配族。`/tools/api-cost/` 要归到某一族。
41. **`scripts/lib/analytics-routes.js` 登记 —— 会 fail-closed。** 顶部注释写明：`dist/**` 里**每一个真页面**（目录式 `index.html`）都必须能被 `ROUTE_RULES` 判出来，**判不出来就报红**。规则表**先具体后一般**（第一个命中的说了算），每条要带 `kind` 和 `why`（**理由不能空** —— "一份说不出理由的统计范围，等于一个没人敢改的开关"）。
    - 现有相关条目：`re: /^plans\/(?:coding|api)\/$/`, `trackable: true`。
    - `trackable` 是**显式选择**；调用方必须把 `unknown` 当成**问题**，不是"默认不统计"（注释原话：「静默不统计正是这一层最危险的失效方式」）。
    - `lib/page-shell.js:151` 会在缺登记时硬失败并指出登记位置。
42. **sitemap 是硬编码条目 + 双向对账。**
    - `scripts/tools/build-local.js:4102-4117` 每条固定路由**手写一段 `<url>`**，带自己的 `priority` / `changefreq` / `lastmod`（`/plans/coding/` 与 `/plans/api/` 都是 `0.9` / `weekly`）。
    - `scripts/tools/seo-verify.js:572-574` 双向比对「可索引页面集合」与「sitemap 成员」，**少一个或多一个都红**。
    - ⇒ **"进不进 sitemap"必须先定，定完两边一起改。** 建议进（一条真实有用的工具页）。
43. **路由占位符表 `ROUTE_HREFS` / `ROUTE_MARKERS`。** `build-local.js:665-736`：每条路由的深度前缀（`../../` vs `../`）对**全部输出**逐项对账，另有"残留占位符"扫描。
    - ⚠️ **命名坑**：占位符刻意叫 `__APIPLAN_HREF__` 而不是 `__APIPLANS_HREF__` —— 因为先替换 `__PLANS_HREF__` 会把长名字打碎成 `plans/coding/` + 尾巴。新占位符取名要避开这个陷阱。
44. **页脚入口。** `/plans/api/` 有一条断言「页脚有指向本页的入口」。新页要进页脚导航，否则成为孤岛。
45. **与 `/plans/api/` 双向可达。** 现有断言要求 API 页与 Coding 页互相可达（「并列的产品能力，不是孤岛」）。计算器是 API 数据的下游，必须能回 `/plans/api/`，也应当能从那里进得来。
46. **面包屑深度。** 两层路由必须用 `../../` 不是 `../`（有一条专门的断言）。`/tools/api-cost/` 也是两层。
47. **`scripts/test/smoke.js` 的关键页清单**（`ROUTES`，约 `:36-46`，每族一条代表）要加一条 —— 否则"整族缺席"这种发布事故不会被发现。
48. **canonical 自指**（有断言），要指向生产域名。
49. **结果参数与索引策略要一起定。** 带参数的 URL 不生成静态文件；`seo-verify` 的"可索引集合"判据要么与它无关，要么需要显式声明。`/plans/coding/` 的先例是**不为筛选组合生成 URL**（`NEXT-STEPS.md` 里有这条承诺）。

---

## 8. 门禁与验证（缺一不可）

50. **每个新自测脚本必须登记恰好一层。** `scripts/test/layers.js` 的 `LAYERS` 表（`selftest:plans` / `selftest:api-plans` 在 **L2**）。`fitness.js` 三条断言：① 表里不能有幽灵条目（写了 `package.json` 里不存在的 script）；② 每个 `selftest:*` **恰好**属一层；③ 同一 script 不能跨两层。
    - 层级判据是"**它需要什么才能跑**"：L1 纯函数不需数据；L2 需仓库数据但**不需 `dist/`**；L3 需 `dist/`；L4 需真浏览器。
    - 算法自测只需仓库数据 ⇒ **应该是 L2**。
51. **反向登记断言。** 磁盘上每个 `*-selftest.js` 都必须能被某条 npm script 跑到（`scripts/tools/check-ci-consistency.js`）。**删脚本与删文件必须同批。**
52. **新门禁步骤要同步 `check-ci-consistency.js` 的期望项数。** 它把"期望项数的唯一出处"钉在 `verify.yml` 那一行 `--expect-checks=N` 上 —— 加步骤、加断言都要动这个数。
53. **计算规则要在浏览器之外可断言，而且要有牙。** 拿固定 workload 跑**全部 108 条**逐条对账；并且故意做错时**必须变红**。参考 `scripts/tools/api-plans-selftest.js:534` 的「互换输入输出必红」写法。至少两条牙：
    - 把 `input` / `output` 互换 ⇒ 红；
    - 让某个缺 `cachedInput` 的模型回退到 `input` 价 ⇒ 红。
54. **两次构建逐字节一致。**（`NEXT-STEPS.md` 的既有要求：「两次构建逐字节一致」。）计算器页面**不能**引入时间戳、`Date.now()`、随机数，或 locale 相关的数字格式 —— `toLocaleString()` 在不同 locale 下输出不同，**禁用**，自己实现千分位。
55. **浏览器侧断言清单**（照 `/plans/api/` §20 那一节的形状）：能打开且**恰好一个 `h1`**、canonical 自指、`ItemList` 声明数 == 行数（若适用）、**无 JS 错误**、**无外部请求**、四档宽度（**390 / 761 / 940 / 1280**）无页面级横向溢出、移动端**只有一个表格**（不维护第二套数据模板）。
56. **交互后仍要满足布局断言。** `/plans/coding/` 有「筛选 + 展开详情后仍无溢出」「横滚后粘性列仍钉在视口里」。计算器要算**"填满输入并出结果后"**的那一档。
57. **结果随输入变化的可断言性。** 要能断言"改一个 token 数，结果按单价成比例变"，而不只是"页面没崩"。
58. **改完跑完整门禁串**（`README.md` 里那一条，刻意写成一行，bash 与 PowerShell 7 都能跑）：

    ```
    npm run test:strict && npm run check:reproducible && npm run plans:rebuild --dry-run && npm run check:plans:reproducible && npm run check:history && npm run migrate:audience:verify && npm run check:zh && npm run selftest:zh && npm run selftest:expiry && npm run selftest:text && npm run selftest:health && npm run selftest:provenance && npm run selftest:history && npm run selftest:changes && npm run selftest:audience && npm run selftest:app-token && npm run selftest:plans && npm run build && npm run check:ci
    ```

    另加：`npm run verify`（真浏览器，需 playwright-core）、`npm run verify:regress`（与基线比对）、`npm run verify:seo`、`npm run selftest:api-plans`、你新写的自测。

---

## 9. 性能与布局红线

59. **首屏位移（CLS）。** `/plans/coding/` 的控件块从"JS 迟填"改成"**构建期预渲染**"，就是为了把 CLS 从 `0.10–0.19` 压到 `0.0007–0.015`。计算器有输入控件 ⇒ **走构建期预渲染 + 一次性 CLS**，别再走 JS 迟填。
60. **黏性列与横滚容器。** 宽表在窄屏必须**容器内横滚**。已踩过的真坑：`.ptable` 自带的 `overflow:hidden`（桌面圆角裁剪）会成为**最近的可滚动祖先**，导致 sticky 前两列**根本没粘住**（滚动 300px 后 `left = -283px`）。
61. **多模型同屏就要面对宽表。** 与 `/plans/coding/` 同一条口径：桌面与手机**同一张表**，窄屏横滚 + 前两列固定，**不维护第二套数据模板**（有断言）。
62. **不用 CDN、不发任何外部请求**（有断言）。
63. **无 JS 时给明确提示，而不是死控件。** `/plans/coding/` 用 `.snote.pnoscript` + `<noscript>`（`scripts/lib/plans-page.js:1053`）。计算器无 JS 时算不出来，就要**说清楚**，并保证静态正文仍然可读。
64. **注意 `.snote.pnoscript` 的几何特殊性**：脚本开启时 `<noscript>` 内容在 DOM 里但**一个字形盒都没有** —— 这是正常的，别把它当成"空元素缺陷"去修。

---

## 10. 隐私与埋点

65. **输入值绝不能进埋点。** 用户输入的 token 数是他们的业务量。`scripts/lib/analytics.js` 只记路由与页面族 —— **不要破这个边界**。
66. **埋点登记会影响统计口径**，见第 41 条。`trackable` 是显式选择，`unknown` 被当成**问题**。

---

## 11. 文档同步（交付的一部分，不是可选项）

67. 按 `docs/v3.0/TASK-SPEC-v3.0.md` §14「完成后必须更新」执行：
    - `README.md` —— 原则口径（§0.3）+ 快速开始 + 契约链接
    - **新建** `docs/SCHEMA-v3.1.md` 写本功能的新增契约（沿用 v3.0 文档"只写新增/改动，既有契约引用旧文档"的风格）
    - `docs/SCHEMA-v2.5.md` —— `:270` / `:370` / `:405` 的"本阶段不做"改成"已实现，见 `docs/SCHEMA-v3.1.md`"
    - `docs/v3.0/AGENT-REFERENCE.md:141`
    - `NEXT-STEPS.md:491-492`（Phase 2.5 清单第 ③ 项）
    - `PROJECT_STATUS.md:2854`
    - `research/audit/MASTER_ACCEPTANCE_MATRIX.md:655-656`（**改判据，别删条目**）
    - `scripts/lib/api-plans-page.js:83-85`（页面口径文案，见第 33 条）

---

## 12. 建议的交付顺序

| # | 步骤 | 完成标志 |
|---|---|---|
| 1 | **拿批准**（§0.3） | 用户明确同意改口径 |
| 2 | 口径改写 + 文档同步骨架 | 四条禁令改写完成，门禁仍全绿（还没加代码） |
| 3 | `scripts/lib/api-cost.js` 算法模块 | 纯函数，无 DOM、不读盘 |
| 4 | `scripts/tools/api-cost-selftest.js` | 108 条逐条对账 + 两条牙，**在写页面之前** |
| 5 | 页面渲染 + 构建期内联 + 路由注册（第 40–49 条） | `npm run build` 通过，两次构建逐字节一致 |
| 6 | 门禁登记（第 50–52 条） | `npm run check:ci` 绿 |
| 7 | 浏览器验收（第 55–57 条） | `npm run verify` 全绿 |
| 8 | 文档收尾 + 交付报告 | 门禁串全绿 |

---

## 13. 红线复述（如果只记三条）

| | 红线 | 失效形态 |
|---|---|---|
| ① | **缺维度绝不回退**（第 6、7、21 条） | 算出一个看起来完整的错数 —— 静默，最难发现 |
| ② | **credits→token 现成正则 + 结论性词汇**（第 26、27 条） | 门禁当场红，或功能悄悄变成"推荐" |
| ③ | **注册点一个不能漏**（第 40–49、50–52 条） | 构建全绿、SEO 全绿、sitemap 全绿，而那一族**零统计**或整族缺席 |

**第 ③ 类是本项目最独特的风险：门禁密度很高，所以"漏登记"的失败模式不是报错，而是静默通过。**

---

## 14. 交付报告要写什么

1. **基线与差异**：§0.2 的重测结果，与本文档基线不一致的地方。
2. **口径改写清单**：改了哪几处禁令、改成什么。
3. **实测数字**：自测项数（几项 0 失败）、`verify` 项数、`verify:regress` 项数、门禁步骤数（改动前 → 改动后）。
4. **两条牙的实跑证据**：故意做错时确实变红了（贴出红的信息）。
5. **两次构建逐字节一致**的证据。
6. **诚实性边界**：明确写出"哪些情况算不出来、页面上怎么说"。
7. **未做的事**：如果有为了收敛范围而没做的（例如 batch 档、缓存写入 TTL 分档），逐条写明并说明理由。

**不要为了凑"完成度"而把不可比的东西写成可比。宁可什么都不算，也不编。**
