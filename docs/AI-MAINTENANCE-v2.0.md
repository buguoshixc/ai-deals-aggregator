# AI 维护层契约（v2.0-ai-assisted-maintenance）

> 本文件是 **AI 层的唯一契约**：边界、数据结构、接口、失败行为。
> 代码注释只解释「为什么」，字段含义以本文件为准。
>
> 一句话目标：**AI 只能提出候选结论，不能无验证直接改写生产数据。**

## 一、AI 使用边界（红线）

AI **不得**：

```text
直接绕过 validate 写 deals.json
直接删除生产优惠
直接把 unknown 填成确定值
直接决定活动已经结束
直接把疑似重复自动合并
直接修改 collector 并自动推 master
直接生成「官方没有写」的优惠事实
```

结构上怎么保证（不是靠纪律，是靠代码与测试）：

| 红线 | 结构性保证 |
|---|---|
| 不写 `deals.json` | `scripts/ai/**` 与 `scripts/tools/ai-*.js` 里没有任何 `deals.json` 写路径；落地只在 `ai-apply.js` |
| 不自动合并重复 | `scripts/ai/dedup.js` **不导出**任何 merge/apply/write 符号（自检断言符号表） |
| 不改 collector | `scripts/ai/patch.js` 只返回 diff 文本；工作树里没有应用工具 |
| 不进采集链路 | `collect.js / store.js / dedup.js` 源码中不得出现 `scripts/ai`（自检静态断言） |
| 不推 master | `.github/workflows/ai-maintenance.yml` 只有 `workflow_dispatch` + `contents: read`，无 `git commit`/`git push`（一致性检查断言） |
| 不把 unknown 变确定 | 候选层规则 R1/R2；无据的确定值单列 `needs_human`，落地需显式 `--allow-unsupported` |
| 不判活动结束 | AI 输出里根本没有「已结束」这个结论位；`expiry.js` 仍是唯一裁判 |

所有 AI 输出必须走：

```text
候选 → 确定性规则 或 人工确认 → 正式数据
```

## 二、AI 层目录

```text
scripts/ai/
  provider.js           generateStructured() —— AI 的唯一出口
  providers/            openai-compat.js / anthropic.js / mock.js
  schemas.js            候选 JSON Schema（enum 从生产单一出处派生）
  json-schema.js        受限 JSON Schema 校验器（零依赖）
  candidates.js         候选信封 + 确定性规则 R1–R5
  cache.js              .ai-cache/ 读写
  usage.js / pricing.js 记账与单价
  redact.js             输入净化与截断
  dom-digest.js         页面结构摘要（Phase C）
  extract.js / dedup.js / diagnose.js / patch.js / translate.js / audit.js
  translate-guard.js    译文确定性校验
  maintenance.js        唯一 CLI：--task=...
```

**采集器永远不直接调用模型**。`scripts/collectors/**` 里不允许出现 `scripts/ai` 或任何 provider SDK。

## 三、`generateStructured()` 接口

```js
const { generateStructured } = require('./scripts/ai/provider');

const r = await generateStructured({
  task: 'extract_offer',        // 任务名（缓存与记账的分组键）
  promptVersion: 'extract-offer-v1',
  system: '…',                  // 系统提示
  content: '…',                 // 已经是净化/截断后的内容
  schema: SCHEMAS.extract_offer, // scripts/ai/schemas.js 里的受限 JSON Schema
  provider: 'openai-compat',    // 省略则读 AI_PROVIDER，再省略则 'off'
  model: 'gpt-4o-mini',
  maxInputChars: 12000,         // 输入上限，超出直接 invalid(too_large)，不裁剪后硬送
  timeoutMs: 60000,
  cache: true,
  budgetUsd: 1.0
});
```

返回：

```js
{
  ok: boolean,
  result: object | null,        // 只有通过 schema + 规则校验才有值
  invalid: {                    // ok=false 时必有
    reason: 'json_parse' | 'schema_invalid' | 'enum_invalid' | 'missing_required'
          | 'too_large' | 'timeout' | 'http' | 'no_provider' | 'budget_exceeded',
    detail: string,
    rawExcerpt: string          // ≤400 字，且已过密钥脱敏
  } | null,
  meta: {
    task, provider, model, promptVersion, inputHash, cacheKey, cached,
    generatedAt, durationMs,
    usage: { inputTokens, outputTokens, estimatedCostUsd, costKnown }
  }
}
```

**本函数永不 throw。** 所有失败收敛为 `{ok:false, invalid}`：

- 无 key / 未配置 / `AI_PROVIDER=off` → `no_provider`；
- 超时、非 2xx、JSON 解析失败、schema/enum/必填不满足 → 对应 reason；
- **不做自动修复重试**：一次调用不合格就是 `invalid`，写进 invalid 归档供人看。

## 四、候选信封

```json
{
  "candidateVersion": 1,
  "id": "9f2c…（12 位十六进制，sha1(task|dealId|field)）",
  "task": "extract_offer",
  "sourceUrl": "https://…",
  "generatedAt": "2026-10-01T02:00:00.000Z",
  "provider": "openai-compat",
  "model": "gpt-4o-mini",
  "promptVersion": "extract-offer-v1",
  "inputHash": "sha256:…",
  "candidate": { "audience": ["student"], "benefitType": ["student_plan"] },
  "evidence": [
    { "field": "audience", "quote": "Available to verified college students",
      "sourceUrl": "https://…", "capturedAt": "2026-10-01" }
  ],
  "confidence": { "audience": 0.88 },
  "status": "candidate",
  "deterministic": { "schema": "pass", "enum": "pass", "evidence": "pass", "audienceAudit": "n/a" },
  "review": { "decision": null, "at": null, "note": null }
}
```

- `status ∈ candidate | invalid | needs_human | accepted | rejected`。**这是候选的状态**，
  deal 记录本身没有 `status` 字段（不要新增）。
- `confidence` 只是 AI 自己的置信度，**不是事实**，不参与任何取值仲裁，只用于审阅排序。
- `invalid` 归档写在 `.ai-cache/invalid/<task>.jsonl`，不进候选列表。

## 五、证据要求（每个非 unknown 字段必须给证据）

1. **规则 R1**：候选里任何非 `unknown`/非空的受管字段，必须有一条 `evidence[].field`
   与之**同名**且 `quote` 非空。否则 `reason='evidence_missing'`，候选无效。
2. **规则 R2**：三态只接受 `true | false | "unknown"`；`null`/`0`/`"true"`/`false`(字符串) 一律无效。
   「原文没写」必须写 `"unknown"` —— **不得猜**。
3. **规则 R3**：所有枚举取值必须来自生产单一出处：
   `AUDIENCES / BENEFIT_TYPES / ELIGIBILITY_KEYS / CLAIM_KEYS / CATEGORIES / EVIDENCE_FIELDS`。
4. **规则 R4**：`confidence ∈ [0,1]`。
5. **规则 R5**：候选的 `evidence` ≤7 条（**每个可断言字段一条**）、`quote` ≤200 字。
   注意与生产侧的 `provenance.MAX_EVIDENCE_ITEMS = 3` 区分：那是**版权预算**
   （存进 `deals.json` 的引文总量受全库上限约束），而候选侧要的是**证据覆盖**。
   两者混用会出现一个荒谬结果 —— 断言了 4 个字段的候选永远带不满证据，只能被判无效。
   落地时按 3 条裁剪（`ai-apply.js`），预算由既有的 `validate` 引文预算守着。
6. `needs_human`：字段有值但只有**间接证据**（原文没写、靠推理）时标这个状态，
   审阅表单列「无据的确定」一栏。

## 六、结构化输出

LLM 必须走严格 JSON Schema（`scripts/ai/schemas.js`），**禁止自由文本作为生产接口**。

```text
JSON parse failure / schema invalid / enum invalid / required field missing
→ AI candidate invalid
```

`scripts/ai/json-schema.js` 是零依赖的受限校验器，支持
`type / properties / required / additionalProperties / items / enum / const / oneOf /
maxLength / minLength / maximum / minimum`。
不做 `$ref`、不做 `format`、不做正则 —— 少即是好，校验器本身要能被单测覆盖。

## 七、缓存

- 目录 `.ai-cache/`（**整个目录 gitignore**）。
- key = `sha256([task, promptVersion, provider, model, inputHash].join('\0'))`。
- **不含时间戳**、不含 `Date.now()`、不含随机数：同一个 key 必须在任何机器上命中同一份响应。
- 文件：`.ai-cache/<task>/<key>.json`，内容含 `request`（只有字符数，不含正文）与 `response`。
- `--no-cache` 绕过；`AI_CACHE_DIR` 可改位置（测试用）。
- 含第三方网页正文的缓存**不提交**。
- **不变量**：`collect.js / store.js / build` 一律不读 `.ai-cache/`，
  AI 产出永远不进入 `deals.json` 的推导链（否则会破坏 `check-reproducible`）。

### 七之二、落点白名单与「人工 accept」三条件（2026-10-04 补，对应审计 P1-1 / P2-14）

> 本节是质量收口新增的硬约束。旧版没有任何路径校验：实测 `node scripts/ai/maintenance.js --task=translate --provider=off --out=deals.json`
> **exit 0 且直接把生产真值覆盖成候选信封**；`ai-apply.js` 的 accept 判定也只有一行行内 `filter`，
> 把那一行改成恒真后 `ai-selftest` 与 `validate --strict` 照绿（审计 M17：20 条变异里唯一没被抓到的一条）。

- **落点白名单**（唯一实现 `assertAiOutputPath`，在 `scripts/lib/cache.js`；`--out` / `--file` / `--dir` 一律先过它）：
  - 只允许 `.ai-cache/**`（含 `AI_CACHE_DIR` 覆盖）与 `research/**`；
  - 硬拒绝 12 份生产真值与源码/证据路径：`deals.json` / `plans.json` / `api-plans.json` / `models.json` /
    `model-registry-links.json` / `index.html`、`scripts/data/**`、`.git/**`、`research/audit/**`；
  - `path.resolve` + 逐级 `realpath` 双重归一 ⇒ `..`、`../deals.json`、符号链接都无效；拒绝即 **exit 1**（在干活之前）。
- **accept 三条件**（唯一实现 `candidates.isAcceptedCandidate` / `acceptedOf` / `acceptedButUnverified`，在 `scripts/lib/candidates.js`）：
  ① 有人工 `review.decision === 'accept'`；② 候选状态与决定一致；③ 生成时那一套机器门（schema / domain / 既有 invariants）重算通过。
  **`ai-apply` 不再自带第二份判定**（行内 filter 已删除）；人点了 accept 但门没过会被**点名拒绝**。
- **生成侧写不出**人工决定：`writeCandidates(file, payload, { cause: 'generation' })` 拒绝任何带 `review.decision` 的候选
  ⇒ 「AI 隐式 accept」在结构上不可能发生。
- **`ai-review.js` 的非严格 `readCandidates` 属设计**（只读展示给人看，不做落地判定）；落地路径一律走
  `readCandidatesStrict`（`--file` 只接受真正的候选文件）。
- 常驻牙：`ai-selftest` 63 项（原 37 项）—— 牙7「生成侧写不了生产」/ 牙8「必须人工 accept + 唯一判据 + 静态扫描」/
  牙9「候选信封进了生产真值必须报警」；端到端走真实 CLI 而不是复制公式。

## 八、Prompt 版本

每个任务必须有 `promptVersion`，否则 AI 输出变化无法追踪：

```text
extract-offer-v1      dedup-pair-v1        collector-diagnose-v1
collector-patch-v1    translate-field-v1   audit-record-v1
```

改提示词 = 升版本号（`v1 → v2`）。版本号进候选信封、进缓存 key、进成本记账。

## 九、成本控制

- 每次任务有输入上限：`extract 12000 / diagnose 8000 / patch 8000 / dedup 4000 / audit 4000 / translate 2000` 字。
- 网页**不整页送**：先经 `redact.js` 做 DOM 清洗 → 正文提取 → 关键片段截断。
- 记账字段：`provider / model / inputTokens / outputTokens / estimatedCostUsd / costKnown / task / promptVersion / inputHash / generatedAt`。
- `pricing.js` 查不到的模型 `costKnown=false` 且 `estimatedCostUsd=0` —— **不猜价格**，报表里如实显示「未知」。
- 运行级预算 `AI_MAX_COST_USD`（默认 1.00）用尽后，剩余条目标 `skipped`（**不是 failed**），退出码仍为 0。

## 十、密钥

- 只来自环境变量 / GitHub Secret：`AI_PROVIDER / AI_MODEL / AI_BASE_URL / AI_API_KEY /
  OPENAI_API_KEY / ANTHROPIC_API_KEY / DEEPSEEK_API_KEY`（按 provider 取）。
- **严禁**写进仓库、前端、GitHub Pages、生成产物。
- `scripts/lib/secret-scan.js` 扫产物（由 `build-local.js` 自检调用）；
  命中时只打印前 8 字符 + `…`，绝不回显完整串。

## 十一、默认 AI 不参与正式定时发布

```text
collect（定时）→ 确定性链路 → 门禁 → 提交 → 发布      ← 全程零 AI 调用
AI 维护（手动 workflow_dispatch）→ 候选 → artifact        ← 不提交、不发布
```

- provider 失败 / 超时 / 无 key ⇒ **不会**让 deterministic 采集停摆：AI 代码根本不在采集链路里。
- `collect.js` 里没有、也不允许有 `require('…/ai/…')`（自检静态断言）。

## 十二、AI 工作流

`.github/workflows/ai-maintenance.yml`：

```yaml
on: workflow_dispatch        # 只手动
permissions:
  contents: read             # 只读
```

输入：`task / limit / provider / model / live`。
步骤：自检 → `node scripts/ai/maintenance.js --task=…` → 上传 artifact
（`.ai-cache/candidates`、`.ai-cache/usage.jsonl`）→ Summary 写条数与成本。
**输出 artifact；不自动 commit。**

## 十三、候选 → 生产的三步落地

```bash
npm run ai:review          # 只读：打印候选表（含「无据的确定」单列）
npm run ai:accept -- --id=<candidateId> [--allow-unsupported] [--note="…"]
npm run ai:apply  -- --id=<candidateId>
```

`ai:apply` 的路由规则（**这是本层唯一会写生产数据的地方**）：

| 目标记录 | 字段 | 落到哪 |
|---|---|---|
| 来源是 `Curated` / `Curated-CN` | 任意 | `scripts/data/curated_cn.json` / `curated_global.json` |
| 采集来源 | 六字段 | `scripts/data/audience-overrides.json`（逐字段注入，保持记录身份不变） |
| 采集来源 | 内容字段（discountInfo/validity/description…） | **拒绝**：今天没有人工落地通道，如实报错，不发明机制 |

落地判据：`loadOverrides().report.invalid` 为空 **且** `npm run test:strict` 绿。
每次落地追加一条 `scripts/data/ai-applied-log.json`：
`{appliedAt, targetFile, dealId, field, candidateId, provider, model, promptVersion, inputHash, candidateHash, acceptedBy:'human'}`。

**本轮不做前端标注**：deal 记录不加字段、不加 enum 值（保持 v1.3 契约不变），
AI 参与痕迹只在这份账里。是否在页面标注「AI 协助」留给 v2.1 再议。

## 十四、AI 故障时的降级行为

| 故障 | 行为 |
|---|---|
| 未配置 provider / 无 key | `maintenance.js` 打印「AI 未配置，跳过」并 `exit 0` |
| 单条超时 / 非 2xx / 非法 JSON | 该条记 `invalid`，继续下一条 |
| 全部失败 | 退出码仍是 0；候选文件为空；采集链路完全不受影响 |
| 预算用尽 | 剩余标 `skipped`，退出码 0 |
| 缓存损坏 | 视为未命中，重新调用；损坏文件记进 run summary |
