# deals.json v1.3 数据契约（信息来源 / 证据与新鲜度）

> 目标：让读者能**自己判断**一条优惠「从哪来、多久没被重新看到、最近一次成功采集在何时、
> 依据是什么」。
>
> 硬约束（与项目红线一致）：**不给自己盖章**。页面上不出现「已核验」「100% 有效」这类
> 本站自发的有效性结论 —— 只展示客观事实，以及事实**缺失时属于哪一种缺失**。
>
> 前置：`docs/SCHEMA-v1.1.md`（六字段与 provenance）仍然有效，本文件只**扩展**它。

---

## 一、六问（本轮的全部设计结论）

### 1. provenance 数据模型：三层，寿命不同、存放位置不同

| 层 | 内容 | 寿命 | 落在哪 | 谁写 |
|---|---|---|---|---|
| **A 记录事实** | `url` / `source` / `sourceUrl` / `firstSeen` / `lastSeen` / `provenance.*` / `verifiedAt` | 跟着记录走 | 源 `deals.json` | 采集器 + 管线 + 人工 |
| **B 官方引文 `evidence`** | 逐条 ≤200 字的官方原文片段（≤3 条/条记录） | 人工写、可长期保存 | 源 `deals.json` | **只有人** |
| **C 采集事实 `sourceFacts`** | 来源类型 / 采集方式 / 最近成功采集时间 / 最近一次采集状态 | **每次采集都会变** | **只进 `dist/deals.json`** | 构建期派生 |

C 之所以必须留在构建期：`lastSuccessAt` 是**来源**的属性，不是某条优惠的属性。写进源数据
会让 134 条记录每轮采集全部变一行 —— diff 失去意义，「重放产出同一份文件」的可重建性门禁
也会退化成「前提是采集恰好没发生」。心跳的唯一权威是 `scripts/data/source-health.json`
（已发布到线上），构建期只做一次 join。

### 2. 哪些字段已经有了

- `url`（官方落地页）、`sourceUrl`（原始出处/聚合站署名）、`source`（采集来源名）
- `firstSeen` / `lastSeen`（首次收录 / 最近发现）
- `provenance.credibility`（`editorial|curated|collected`）、`provenance.sourceUrl`、
  `provenance.verifiedAt`、`provenance.fields{field:{basis,derived,note}}`、`provenance.contrib`
- `verified` / `verifiedAt`（**只留在数据里，页面不渲染**，见 §四）
- `scripts/data/source-health.json`：每个来源的 `kind`（`static|headless`）、`lastSuccessAt`、
  `status`、`consecutiveFailures` 等

### 3. 哪些可以自动生成

| 事实 | 生成方式 |
|---|---|
| `firstSeen` / `lastSeen` | 管线（`makeDeal` + `dedup.merge`，firstSeen 单调变早、lastSeen 取更晚） |
| `provenance.credibility / contrib / fields.basis` | merge 期逐字段仲裁（v1.1 既有） |
| `sourceFacts.sourceId / method` | 构建期按 `deal.source` ↔ 心跳 `name` join |
| `sourceFacts.lastSuccessAt / healthStatus` | 同上（直接取心跳，不重算） |
| `sourceFacts.sourceType` | `provenance.SOURCE_TYPES` **声明表**（不是 host 启发式，理由见下） |
| `sourceFacts.lastSuccessState` | 由「是否人工策展 / 有没有匹配到心跳 / 心跳整份是否可用」推出 |

**永不自动生成**：`evidence` 的原文片段、`provenance.fields[].note` 的推理链、`verifiedAt`。
自动抓取官方全文再切成片段，就是这一层存在的理由的反面。

> `sourceType` 为什么是声明表而不是按 host 判：`aitools.fyi` 这一路采集器自己就是目录站，
> 但它解析到官方页后**不写 `sourceUrl`**（实测 15 条里 0 条有 `sourceUrl`），按 host 判会把
> 它们误判成「官方直采」。这件事只有「这个采集器本来在读谁」说得清，所以在
> `scripts/lib/provenance.js` 里声明一次；没登记的来源会被 `validate --strict` 拦下。

### 4. 哪些**不应该**长期保存

| 不保存 | 理由 |
|---|---|
| 官方页全文 / HTML / Markdown 快照 | 大规模复制第三方内容；且它会过期，成为第二份「真相」 |
| 原始 HTTP 响应、截图、PDF | 同上；体积与版权双重问题 |
| 每条优惠**每次运行**的尝试时间与瞬时错误 | 只有「来源级最新一次」有意义；全量留痕是日志，不是数据 |
| 采集会话凭据 / 请求头 / cookies | 与展示无关，泄露风险 |
| 超过上限的引文 | 见 §二；超长是**拒收**而不是截断 |
| `provenance.contrib` 的渲染 | 它是 merge 正确性的记账，页面不展示（保留在数据里） |

### 5. 如何避免大规模复制第三方内容

五条一起成立才有效（每条都有断言）：

1. **数量**：单条记录 ≤3 条引文（`MAX_EVIDENCE_ITEMS`）；
2. **长度**：单条 ≤200 字（`MAX_EVIDENCE_QUOTE_LENGTH`），**超长直接拒收**——
   截断过的「官方原话」就不是原话了（这是 H8「截断必须留痕」的对偶）；
3. **全库预算**：全部引文 ≤12000 字，且 ≤ `deals.json` 字节数的 5%（`checkEvidenceBudget`）；
4. **出处限制**：`evidence.sourceUrl` 必须是 http(s) 且**不得是聚合站**（自有
   `AGGREGATOR_HOSTS`）；引文只能出自厂商一方页面；
5. **必须绑定断言**：每条引文必须写 `field`（它支撑哪个字段），不允许「一堆原文堆在这里」。

页面侧同样不复制：只展示片段本身 + 出处链接 + 采集日期，不展示上下文、不做整页镜像。

### 6. 详情页如何展示

首页详情弹层与 80 个静态详情页**共用同一个函数** `sourceBlockHtml(deal)`（RENDER-CORE），
固定 10 行、缺值也出行：

```
官方页面 · 原始出处 · 收录来源 · 来源类型 · 采集方式 · 首次收录 · 最近发现 ·
最近成功采集 · 断言依据 · 官方原文片段
```

「最近成功采集」有且只有四种说法，**含义不同就必须分开说**：

| 状态 | 页面措辞 | 含义 |
|---|---|---|
| `known` | `2026-09-29 21:04（北京时间）` + 最近一次采集状态 | 有心跳记录且成功过 |
| `na` | **不适用** —— 本条来自人工策展，不经过采集器 | 按设计没有采集器 |
| `unknown` | **未知** —— 来源心跳里没有这一条 | 本该有、没匹配到 |
| `unavailable` | **不可用** —— 本次构建没有可用的来源心跳数据 | 构建期没有心跳文件 |

块尾固定免责句：「以上是本站采集与整理过程的事实，不构成对优惠是否有效、是否适用于你的
判断；最终以厂商官方页面为准。」

---

## 二、字段定义

### 2.1 `evidence`（可选，源 `deals.json`）

```jsonc
"evidence": [
  {
    "field": "discountInfo",              // 必填：这条原文支撑哪个断言
    "quote": "赠送 100万 Tokens，有效期 3个月",  // 必填：官方原文片段，≤200 字
    "sourceUrl": "https://cloud.baidu.com/doc/qianfan/s/Imi2rpirg", // 必填：官方页
    "capturedAt": "2026-09-22",           // 必填：看到这段原文的日期
    "lang": "zh"                          // 可选：zh | en | other
  }
]
```

- `field` ∈ `provenance.EVIDENCE_FIELDS`（`discountInfo / eligibility / validity / priceLine /
  expiresAt / audience / benefitType / eligibilityDetail / claimRequirements / availability`）
- `quote`：去 HTML、去零宽、压缩空白后非空，≤200 字；超长**拒收**
- `sourceUrl`：http(s)，非聚合站
- `capturedAt`：`YYYY-MM-DD`，不得是未来
- 整组：去重（`field` + `quote`）、按字段固定次序排序、≤3 条
- **缺席 = 未收录**，不需要迁移；空数组是**非法**（沿用「空容器非法」约定）
- 写入处：`scripts/data/curated_cn.json` / `curated_global.json`；
  `scripts/data/audience-overrides.json` 用**独立键 `evidenceQuotes`**（该文件里既有的
  `evidence` 字符串是六字段的推理链，语义不同，不混用）
- 排序与上限只在 `provenance.mergeEvidence()` 一处实现：产出必须与输入顺序无关，
  否则同一条记录换个 merge winner 就会得到不同字节

> `capturedAt` 的填写口径：人工回访官方页那一天（策展条目即该条 `verifiedAt`），
> 不得晚于它。本轮把 3 条策展记录里**早就写在 `discountInfo` 中的官方原话**升级成结构化
> 引文 —— 没有引入任何新的第三方文本，只是给已有的原话补上出处与日期。

### 2.2 `sourceFacts`（构建期派生，**只进 dist**）

```jsonc
"sourceFacts": {
  "sourceId": "cn_qianfan",
  "method": "static",            // static | headless | curated | unknown
  "sourceType": "official",      // official | directory | curated | unknown
  "lastSuccessAt": "2026-09-29T13:04:54.254Z",
  "healthStatus": "healthy",     // healthy | degraded | failed | null
  "lastSuccessState": "known"    // known | na | unknown | unavailable
}
```

- 构建期由 `build-local.js` 注入；`BUILD_ADDED = {collections, sourceFacts}` 是
  「源 vs 产物」一致性门禁唯一认可的派生字段集合
- 心跳缺失/损坏时一律 `unavailable`（**优先于**行查找：缺文件时任何「行」都不可能是本轮的）
- 渲染层对不认识的取值一律降级成 `unknown`，绝不把脏数据渲染成一句断言

### 2.3 措辞同源（`SOURCE_WORDING`）

信息来源块的**全部**用户可见措辞住在 `index.html` 的 `AUDIENCE:START/END` 标记块里
（`SOURCE_WORDING` 常量），并与 `scripts/lib/audience.js` 的 `WORDING_CONTRACT`
（`SOURCE_*` 组）**逐字节比对**（`validate --strict` + `checkWordingContract`）。
理由与 v1.1 的三态措辞一样：这块内容能不能被读成「本站给了保证」，取决于这几个词怎么写。

---

## 三、校验与门禁

| 位置 | 判据 |
|---|---|
| `schema.validateDeal` | 引文形状/上限/出处/日期/去重/规范形态（把归一器再跑一遍，字节不同即报错） |
| `validate.js checkEvidenceBudget`（每次写盘、每次 CI） | 全库字符预算 + 占 `deals.json` 比例上限 |
| `validate.js checkCurated` | 策展文件里「写了引文却没生效」→ **错误**（逐条给出原因） |
| `validate.js checkProvenanceGuard`（`--strict`） | ① 探针：非法引文必被拦、合法必放行；② 来源全部登记；③ 措辞里不许有自封结论、三个缺失状态词必须互不相同 |
| `provenance-selftest`（CI 门禁步骤） | 91 项：归一/上限/预算/合并确定性/四种状态/渲染措辞 |
| `build-local.selfCheck` | 每条 dist 记录与心跳逐项对账；块必须带免责句与状态词；`known` 必须渲染出 `<time>`；静态详情页里必须有块 |
| `check-reproducible` | 引文必须原样穿过 merge（新增「引文漂移」一项） |
| `verify-site.js` | 真浏览器：弹层与静态详情页都有块；人工策展显示「不适用」；采集侧显示真实 `<time>`；引文带出处与日期；整块无「已核验」 |

---

## 四、刻意不做的（非目标）

| 不做 | 理由 |
|---|---|
| 渲染 `verified` / `verifiedAt`，或任何「已核验」标签 | 2026-09-27 已整条撤掉：与「数据更新」并列时会被读成「核验过的更旧」。这两个字段只留在数据里 |
| 给优惠「是否仍然有效」下结论 | 我们没有实时核验能力，盖章就是编造（红线 H1） |
| 自动抓取并保存官方全文/片段 | 大规模复制；且过期后成为第二份「真相」 |
| 卡片上加新鲜度角标 | 密度优先；这些事实属于「想核对才看」的详情层 |
| 回填存量 46 条无 provenance 记录 | 那是编造出处；由人工来源逐步补 |
| 新增外部请求 | 零依赖、零外部域红线（N1） |

---

## 五、失败模式与处置

| 现象 | 处置 |
|---|---|
| 心跳文件缺失/损坏 | 整维度 `unavailable`，构建**不失败**（与 `/status/` 同样容错） |
| 来源改名导致 join 不上 | 显示「未知」+ 原因；build 自检告警、`validate --strict` 对未登记来源报错 |
| `--only` 子集采集 | 该来源本轮 `lastRunMissing`，按「未知/本轮没跑」表述，不冒充「今天健康」 |
| 引文超长/出处违规 | 构造期拒收 → 入口对账逐条报错（策展/overrides 路径是**错误**级）→ CI 红 |
| 新增采集器忘了登记 `SOURCE_TYPES` | `validate --strict` 报错并逐条点名，不到页面上静默显示「未知」 |
