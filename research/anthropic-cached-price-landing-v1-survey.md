# Anthropic Sonnet 5.5 缓存读价落地（t28 / attempt 2）：写面普查 + 判据级阻断 + 两种可落地设计

- 任务：**t28 / anthropic-cached-price-landing-v1**（implementation，inScope `scripts/data`）；复核/观测日 **2026-10-08**
- 工作树：`.worktrees/anthropic-cached-price-landing-v1`（分支同名，基线 `70d7463`；`origin/master` 已到 `9b72b9d`）
- 依据：已合并的 t26 报告 `research/anthropic-cached-price-v1-report.md`（判定②：官方 2026-10-07 把 Sonnet 5.5 缓存读取价由 $0.20 减半到 $0.10）
- 原始读数：`.arch-v1/t28/readings.md`（本机，不入库）；探针 `probe-binding2.js` / `probe-designs.js` 的输出见其中
- **状态：未落地。** 落地需要 ① 写 inScope 之外的根 `api-plans.json`（生成物）② 对 `scripts/lib` 判据的一处决定。两项都先报 captain（任务书要求），因此本文件是「普查 + 阻断 + 方案」，**数据 0 字节改动**（工作树 `git status` 干净）。

---

## 1. 官方原文（本人 2026-10-08 亲自读到的，不是转抄）

来源 <https://www.anthropic.com/claude-haiku-5-5>（HTTP 200，页面自印日期 **October 7, 2026**）：

- 「Further updates」段逐字（去掉页面的粗体标记后；页面用的是弯引号 `’`）：

  > First, starting today, we’re lowering the price of cache reads on Claude Sonnet 5.5. Cache reads now cost 50% less: $0.10 per million tokens rather than $0.20.

- 同页 Pricing 表表头 + 缓存读取行逐字：

  > Price per 1 million tokens | Haiku 5.5 prompts up to / over 100k | Haiku 4.5 | Sonnet 5.5
  > Cache reads | $0.01 / $0.05 | $0.10 | $0.10

- 写入档（5m $2.50 / 1h $4）在该页与官方其它材料里**都没有提到变化** ⇒ 不顺手改（t26 §5 第 4 条同结论）。

## 2. 写面普查：这个价格在哪个文件是权威值 / 派生 / 历史

| 文件 | 角色 | 谁写它 | inScope |
|---|---|---|---|
| `scripts/data/curated_api_plans.json` | **权威值**（人工来源层）：`rates.cachedInput` + `evidence[]` + `lastSeen`/`verifiedAt` | 人工 | ✅ |
| `api-plans.json`（根，tracked） | **派生**（`= 归一(curated_api_plans.json)`） | `npm run api-plans:rebuild`；`check:api-plans:reproducible` 与 `build` 都要求它逐字节等于重放结果 | ❌ |
| `scripts/data/api-plan-history.json` | **变化日志**（`/changes/` 与订阅源的事件来源） | 同一个 rebuild 命令追加；事件 `at` = `payload.updatedAt` = 全部 `lastSeen` 的最大值 | ✅ |
| `scripts/data/model-registry-links.json` | **关系层**（人工）：link 的 evidence 必须逐字等于被引用记录的官方引文 | 人工；`check:model-registry-links` 拿根 `api-plans.json` 对账 | ✅ |
| `scripts/data/models.json` | 注册表来源层，只载 `releaseEvidence`（发布日期），**不载价格** | 人工 | ✅（本次不动） |
| 根 `models.json` / 根 `model-registry-links.json` / `dist/**` | 发布产物 | `models:rebuild` / `build` | ❌ |

⇒ **落地的最小写面 = ① `scripts/data/curated_api_plans.json` ② 根 `api-plans.json`（重放生成）③ `scripts/data/api-plan-history.json`（同批追加事件）④ `scripts/data/model-registry-links.json`（引文副本跟随）**。

## 3. 两个判据级阻断（都有实测读数）

### 阻断 A：验收要求的整句变更引文，被 B2「输入价先于输出价」判红

`scripts/lib/api-plan-schema.js`：`quoteIndexOfNumber` 允许**无边界回退匹配**，整句里的 `$0.10` 被算成「输出价 10」（位置 119）、`$0.20` 被算成「输入价 2」（位置 156）：

```
V3 整句引文 + field=models.claude-sonnet-5.5.rates.cachedInput ⇒ ok=false
  - evidence「…rates.cachedInput」里 10 出现在 2 之前，而 claude-sonnet-5.5 的数据说输入价 2、输出价 10 …
```

该段前后文字里没有「2」，页面自印日期 `October 7, 2026` 不在同段 ⇒ **整句只要绑定到任何指向 sonnet 的字段，B2 必红**；绑定到别的模型 = 语义造假。要按验收原文落地，必须动 `scripts/lib`（不在本任务 inScope）。

### 阻断 B：每记录引文上限 3 条，anthropic 记录已经满

`provenance.MAX_EVIDENCE_ITEMS = 3`，现有 3 条（fable / sonnet / haiku）。追加第 4 条 ⇒ 归一后仍 3 条、**新引文被静默挤掉**（且 `evidenceDropped` 会翻成硬错误「evidence 写了却没生效」）。⇒ 新引文只能**替换**现有 sonnet 那条（验收允许「替换，理由写清」），或改上限（lib）。

### 阻断 C（配牙边界，如实记）

整句引文**同时点名新值 $0.10 与旧值 $0.20** ⇒「把值改回 0.20」在 B1 下**不会**变红（0.2 也在引文里）。可用的牙齿是：值改成引文里没有的数（0.15）⇒ B1 红；值改回 0.20 而不同批更新日志 ⇒ `check:api-plan-history` 红；删掉引文而关系层仍引用 ⇒ `check:model-registry-links` 红。

## 4. 两种可落地设计（都实测过）

### 设计 A（按验收原文落地，需要 `scripts/lib` 一处新增 —— t27/t10 或授权我改）

- lib：新增维度绑定的**变更记录形态** `models.<key>[.<variant>].rates.<dim>.change`（`apiEvidenceFieldsOf` 展开 + `parseEvidenceBinding` 识别为 `kind:'change'`）：沿用 B1 的「引文里必须找得到该值」非空转检查，**新增一条牙齿**「引文必须同时给出至少一个不同的值（否则不构成变更记录）」，并豁免 B2（B2 的前提是价格表的固定列序，散文式变更记录没有列序）。可选：把每记录引文上限 3 → 4，让「价目表行见证」与「变更记录」并存。
- data：`cachedInput` 0.1；sonnet 引文保留一条价目表行见证（表头行 + `Cache reads` 行，实测 `ok=true`、改回 0.20 会红）+ 新增整句变更记录（绑 `.change`）；`lastSeen`/`verifiedAt` = 2026-10-08；模型 `note` 登记官方日与我们复核日。

### 设计 C′（不碰 lib，现在就能落地；与验收 c.2 有一处偏差，需 captain 认可）

- data：`cachedInput` 0.1；sonnet 引文**替换**为官方变更记录的**前半句**（逐字，141 字，`…Cache reads now cost 50% less: $0.10 per million tokens.`），绑 `models.claude-sonnet-5.5.rates.cachedInput`，`sourceUrl` = 官方 Haiku 5.5 发布稿，`capturedAt` = 2026-10-08 —— 实测 **ok=true**，且把值改回 0.20 ⇒ **红**（B1，配牙成立）。
- 模型 `note`（≤200 字）承载**整句**（含 `rather than $0.20`）+ 两个日期 + 写入档免责句。
- 偏差：验收要求的那半句（含 `rather than $0.20.`）落在 `note` 而不是 `evidence[].quote`；引文与 note 同源同 URL，**不隐藏任何原文**。
- 原 $0.20 引文的处置：**替换**（上限 3 条放不下第二条；旧值与旧 URL 保留在 git 历史、变化事件的 `from/to`、本报告与 t26 报告里）。

## 5. 日期登记（不伪造）

| 日期 | 性质 | 落在哪 |
|---|---|---|
| 2026-09-28 | 官方旧价（$0.20）出处日期 | t26 报告、变化事件 `from` |
| 2026-10-01 | 我们采集/记录的日期（旧值当时正确） | 旧引文 `capturedAt`（已替换，留在 git 历史） |
| **2026-10-07** | **官方生效日**（页面自印日期 + “starting today”） | 模型 `note` + 本报告 |
| **2026-10-08** | **我们的观察/记录日** | `capturedAt` / `lastSeen` / `verifiedAt` / 事件 `at` |

## 6. 需要 captain 裁定的三件事

1. **写面授权**：许可我在本 worktree 跑 `npm run api-plans:rebuild`（写根 `api-plans.json` + `scripts/data/api-plan-history.json`），以及按需跑 `npm run models:rebuild`（若产物联动）；
2. **设计选择**：A（动 `scripts/lib`，全条款满足）还是 C′（不动 lib，c.2 的引文位置有一处偏差、需你认可）；
3. 若选 A：lib 由 t27/t10 落，还是把该文件临时划入我的 inScope。

## 7. 本任务至今改了什么

- 新增本文件；
- 本机读数 `.arch-v1/t28/{readings.md, attempt1-wip.diff, probe-*.js, probe-designs.out.txt}`（gitignore）；
- **生产数据/代码 0 字节改动**（attempt 1 留在工作树的未提交改动已存档并还原：它不合法 —— note 209 字超 200 上限被拒、引文 242 字超 200 上限被丢弃）。
