# Anthropic Sonnet 5.5 缓存读价落地（t28 / attempt 2）：$0.20 → $0.10

- 任务：**t28 / anthropic-cached-price-landing-v1**（implementation）；观测/复核日 **2026-10-08**
- 工作树：`.worktrees/anthropic-cached-price-landing-v1`（分支同名，基线 = `origin/master` `9b72b9d`）
- 授权：用户裁定「落地改价」；captain 四次 amend（inScope 含 `scripts/data`、根 `api-plans.json`、`scripts/lib/api-plan-schema.js`、`scripts/lib/provenance.js`、根 `models.json` + 根 `model-registry-links.json`）
- 原始读数（本机、不入库）：`.arch-v1/t28/`（探针、日志、digest、牙齿读数、变更面读数）
- **进仓证据（Tier-1）**：`research/_raw/anthropic-cached-price-landing-v1/`（`README.md` / `old-docs-quote.md` / `callers-opts-max.md` / `readings.md` / `teeth.md` / `manifest.json`）；**自审**：`research/anthropic-cached-price-landing-v1-self-audit.md`
- 上游：t26 报告 `research/anthropic-cached-price-v1-report.md`（判定②：官方 2026-10-07 减半）

---

## 1. 官方依据（本人 2026-10-08 亲自读到的逐字原文）

来源 <https://www.anthropic.com/claude-haiku-5-5>（HTTP 200；页面自印日期 **October 7, 2026**；页面用弯引号 `’`）：

> First, starting today, we’re lowering the price of cache reads on Claude Sonnet 5.5. Cache reads now cost 50% less: $0.10 per million tokens rather than $0.20.

同页 Pricing 表（本次未采用为引文，仅登记）：`Cache reads | $0.01 / $0.05 | $0.10 | $0.10`，其中第三列 = Sonnet 5.5。

**日期分开登记（不伪造）**：

| 日期 | 性质 | 落在哪 |
|---|---|---|
| 2026-10-07 | **官方生效日**（页面自印日期 + 句内 “starting today”） | 模型 `note`、本报告 |
| 2026-10-08 | **我们的观察/记录日** | 新引文 `capturedAt`、`lastSeen`、`verifiedAt`、变化事件 `at` |
| 2026-10-01 | 旧记录的采集日（当时 $0.20 正确） | 旧引文 `capturedAt`（原样保留） |

**缓存写入（5m `$2.50` / 1h `$4`）官方一个字都没提变化 ⇒ 未改，note 里写明「保持原值」，文案不含任何联动暗示。**

## 2. 落地了什么（8 个文件）

| 文件 | 改动 |
|---|---|
| `scripts/data/curated_api_plans.json` | sonnet `rates.cachedInput` 0.2→**0.1**；新增第 4 条引文（`.change`，绑 `models.claude-sonnet-5.5.rates.cachedInput.change`，URL = 官方 Haiku 5.5 发布稿，`capturedAt` 2026-10-08）；`lastSeen`/`verifiedAt` → 2026-10-08；模型 `note`（72 字）：官方 10-07 生效 / 本站 10-08 复核 / 写入档未动 |
| `scripts/data/model-registry-links.json` | sonnet 映射的 `evidence` 补一条**逐字副本**（规则⑥：链接只许复制记录的引文） |
| `scripts/data/api-plan-history.json` | 追加 **1 条** `price_decreased`（`at` = 2026-10-08；`from`/`to` = 0.2/0.1）→ 累计 18 条 |
| `scripts/lib/api-plan-schema.js` | 新增 `.change` 绑定形态（`apiEvidenceFieldsOf` / `parseEvidenceBinding` / `evidenceBindingProblems`）+ 具名常量 `API_EVIDENCE_MAX_ITEMS = 4` + 纯助手 `numericTokensOf` |
| `scripts/lib/provenance.js` | `sortAndCap` 的上限改成 `evidenceCapOf(opts)`：**可选** `opts.max`，缺省仍 `MAX_EVIDENCE_ITEMS = 3` |
| `api-plans.json`（根） | 由 `npm run api-plans:rebuild` 重生成（**未手改**） |
| `models.json` + `model-registry-links.json`（根） | 由 `npm run models:rebuild` 重生成（**未手改**） |

**旧 $0.20 引文的处置 = 保留为历史**（不是替换）：那条 docs 引文（2026-10-01 抓取）**逐字节未动**，仍是 sonnet 的价目表行见证 ——
它同时是 B2「输入价先于输出价」在这条记录上的落点；删掉它会让 sonnet 少一条列序牙。逐字存档：

```json
{"field":"models.claude-sonnet-5.5",
 "quote":"Claude Sonnet 5.5 | Base tokens: Input $2 / MTok, Output $10 / MTok | Prompt caching: 5m writes $2.50 / MTok, 1h writes $4 / MTok, Hits and refreshes $0.20 / MTok",
 "sourceUrl":"https://docs.anthropic.com/en/docs/about-claude/pricing","capturedAt":"2026-10-01","lang":"en"}
```

新增的变更记录引文（逐字）：

```json
{"field":"models.claude-sonnet-5.5.rates.cachedInput.change",
 "quote":"First, starting today, we’re lowering the price of cache reads on Claude Sonnet 5.5. Cache reads now cost 50% less: $0.10 per million tokens rather than $0.20.",
 "sourceUrl":"https://www.anthropic.com/claude-haiku-5-5","capturedAt":"2026-10-08","lang":"en"}
```

落盘长度读数（硬约束）：新引文 **159 字 ≤ 200** ✅、模型 note **72 字 ≤ 200** ✅（`validate --strict` 绿即证明两条都过了归一器；不再是 attempt 1 的 209 / 242 字）。旧引文 162 字。

## 3. 判据侧：`.change` 是**新增形态**，不是放松

- `parseEvidenceBinding`：只有**显式**带 `.change` 后缀才返回 `kind:'change'`；普通维度绑定（含存量 35 条）仍旧 `kind:'rate'`，**照走 B2**。
- `.change` 自己的三条判据：①该维度必须有值；②引文里必须找得到**当前值**（空转的变更绑定 = 没证）；③引文里必须还有一个与当前值**不同**的数值（只有一个数的原文不算变更记录，想借 `.change` 绕开列序会在这一条被挡回）。**不做** B2，理由写进代码注释：散文式变更记录把新值与旧值写在同一句里，没有价格表的列序前提。
- 引文预算：`API_EVIDENCE_MAX_ITEMS = 4`（具名常量 + 注释说明「第 4 条是官方变更记录，前三条是价目表行见证」）。`opts.max` 缺省仍是 3，**只有 `api-plan-schema.js` 传它** —— 调用点清单（grep，`.arch-v1/t28/grep-callers.txt`）：
  `normalizeEvidence` → `api-plan-schema.js:1268`(**传 max:4**) / `deal-plan-links.js:568` / `plan-schema.js:736` / `schema.js:535,672` / `audience-overrides.js:114` / 两个 selftest（均不传）；`mergeEvidence` → `dedup.js:521` / `audience-overrides.js:222`（不传）；`sortAndCap` / `evidenceCapOf` 仅库内自用。
- 既有自测**未改一行**：`selftest:provenance` 132 项 / `selftest:api-plans` 176 项 / `selftest:models` 120 项全部通过，0 失败（上限缺省仍是 3，所以「四条约到三条」那条断言原样成立）。断言总数只增不减：测试文件 diff 为空，lib 侧新增 1 个绑定形态 + 3 条判据分支。

## 4. 配牙（红/绿各一次，逐字节还原）

读数脚本 `.arch-v1/t28/teeth.js`（自动改坏 → 跑判据 → 还原 → 再跑），明细 `.arch-v1/t28/teeth-{1..5}.log`：

| # | 改坏 | 判据 | 读数 |
|---|---|---|---|
| T1 | C1：值改成引文里没有的 **0.15** | `validate --strict` | 红(exit 1)「…声明为变更记录，但引文里找不到该维度的当前值（0.15）—— 空转的变更绑定等于没证」→ 还原 绿 |
| T2 | C2：引文只留 `…$0.10 per million tokens.` | `validate --strict` | 红「…引文里只有当前值（0.1）—— 变更记录必须同时写出一个不同的数值…」→ 还原 绿 |
| T3 | 对照：同一整句**摘掉 `.change`**（普通维度绑定） | `validate --strict` | 红「…里 10 出现在 2 之前…（B2）」（**普通绑定一个字没放宽**）→ 还原 绿 |
| T4 | 值改回 **0.20**① | `check:api-plan-history` | 红「API 计费变化日志与当前状态不一致：1 处」→ 还原 绿 |
| T5 | 删掉变更引文并重建（关系层仍引用） | `check:model-registry-links` | 红「links[7] claude-sonnet-5.5 evidence[1]: 这条引文不是被引用记录自己的官方引文…」→ 还原 绿 |

① T4 在**派生层**演示（把 `api-plans.json` 的值改回 0.2 而日志不动）：curated 里的同一场景会先被 T1 拦下；而 `.change` 引文本身同时含 0.10 与被点名的旧值 0.20，所以「把值改回 0.20」不会在引文层变红 —— 这是如实登记的**配牙边界**（要真配牙只能靠 T1/C1 的「引文里没有的数」与 T4 的日志对账）。
- 四份文件（curated / api-plans / history / links）在五次改坏后**逐字节还原**：`还原逐字节一致：✅ 四个文件全部与读数前一致`。

## 5. 读数（改前 / 改后）

- **全树摘要**（`npm run report:digest`）：改前 `67d1d0bd…`（304 文件 / 20,386,654 B）→ 改后 `9b6f2dc8…`（304 文件 / 20,381,609 B）；清单摘要 `2b8fe49f…` → `ea8a9fb4…`。
- **渲染面**（`.arch-v1/t28/render-{before,after}.txt`）：`dist/plans/api/index.html` 的 Sonnet 5.5 行缓存读价 **`$0.2`×1 → `$0.1`×1**；旧行引文在 3 个文件里保留（api-plans.json / model-registry-links.json / plans/api/index.html），变更记录引文出现在同样 3 个文件。
- **其它模型一个字节未动**：全量 308 行费率逐条 diff（`.arch-v1/t28/rates-{before,after}.txt`）**只有一行不同** —— `4f8bae91f9f8 anthropic claude-sonnet-5.5 cachedInput 0.2 → 0.1`；fable 0.25 / opus 0.2 / haiku 0.1 逐条相同。
- **其它记录引文集合不变**（`.arch-v1/t28/compare-records.out.txt`）：24 条记录 id 集合相同；**有变化的记录只有 1 条**（anthropic：evidence / 费率 / lastSeen / verifiedAt / note）；抽样 deepseek、zhipu、openai 三家引文列表「改前 = 改后」逐字节相同。
- **重生成产物改动面收敛**（`.arch-v1/t28/models-scope.txt`、`published-diff.diff`）：根 `models.json` 51 条中只有 4 条（全部 Anthropic）变化，且**只变派生 `lastSeen` 2026-10-01→2026-10-08**（记录级 lastSeen 的派生，无内容改动）；根 `model-registry-links.json` 92 条中**只有 1 条**（sonnet）变化 = 新增那条引文副本；抽样 opus / deepseek-v4-pro / glm-5.3 / gpt-6.1-sol 与 3 条 link 全部逐字节相同。
- **公开变化事件**：`dist/changes/index.html`、**订阅源** `dist/feed/plans/api/changes.json` 与 `.xml`、`dist/plans/api/index.html`、`dist/vendor/anthropic/index.html`、`dist/api-plan-history.json` 都含该事件（计划 id `4f8bae91f9f8` + 0.2→0.1 记法）。

## 6. 收口命令（全部本工作树内跑）

| 命令 | 读数 |
|---|---|
| `npm run api-plans:rebuild` | 追加 1 条事件；写出 api-plans.json（24 条）与 history（18 条） |
| `npm run models:rebuild` | 写出 models.json（51 模型）+ model-registry-links.json（92 映射） |
| `node scripts/validate.js --strict` | ✅ 通过（exit 0） |
| `npm run check:api-plans:reproducible` | ✅ 逐字节一致（24 条 / 108 模型条目） |
| `npm run check:models:reproducible` | ✅ 两份生成物与来源层逐字节一致 |
| `npm run check:api-plan-history` | ✅ 基线 + 事件重放 == 当前 api-plans.json（18/18 带 eventId，0 处不一致） |
| `npm run check:model-registry-links` | ✅ exit 0 |
| `npm run check:evidence` | ✅ 无新增 Tier-3（1283 条自证通过） |
| `npm run build` | ✅ exit 0（产物自检通过） |
| `npm run report:digest` | 见 §5 |
| `npm run gate` | 对齐 master `898f86f` 后：**48 个脚本，失败 0**（`✅ 本地门禁链全过`，exit 0）—— 见 §6.3；对齐前为 49/52 步绿、步骤 50 红 1 项（§6.1 的既有判据缺陷） |

### 6.1 `gate` 步骤 50 的判据缺陷：`feed 条数 == 日志全部事件数` 这个不变量是假的

- 失败读数：`✗ API 价格变化订阅的 guid 逐条等于日志里的派生事件身份（不是每次 build 重新生成） — JSON 12 条 / RSS 12 条 / 日志 18 条`（verify-site 883 项 / 1 失败）。
- 改前读数（主工作树那份 master 构建的 `dist/`）：**feed 17 条 / 日志 17 条 ✓** —— 巧合成立。
- 机制：`scripts/lib/plan-changes.js:52` `recentDays: 7`、`:306 recentFrom = addDays(asOf, -(recentDays-1))`、`:322 if (event.at < recentFrom) continue`；`/feed/plans/api/changes.*` 渲染的正是雷达的「最近 7 天」分栏，而 `asOf` = `api-plans.json.updatedAt` = `max(lastSeen)`。本任务把 anthropic 记录的 `lastSeen` 如实推进到 2026-10-08（我们真的在 10-08 复核）⇒ 窗口变 10-02..10-08 ⇒ 日志里 6 条 `2026-10-01` 的 `created` 掉出窗口。
- 断言的错处：`verify-site.js:4218` 要求 `jsonGuids.length === eventIds.size`（**全部**日志事件），而它的姊妹断言（Coding 套餐变化 feed，`verify-site.js:5119`）只要 `guids.every(guid => eventIds.includes(guid))`（**子集**）。**任何一次把 asOf 推到 ≥ 2026-10-08 的数据更新都会假红**；本任务只是第一个撞上的。
- 建议修法（`scripts/tools/verify-site.js` 归 t22，本任务未动）：期望集按 feed 的设计口径 = 日志中 `at >= asOf-6 天` 的事件，保留「每条 guid ∈ 日志 eventId」「条数相等」「RSS 与 JSON 逐条相同」，并**加一颗新牙**「窗口内每个日志事件都必须出现在 feed 里」。
- **captain 裁定（2026-10-08）**：走「改判据」，另开 **t32 `feed-guid-window-judge-fix-v1`**（viewport-verifier）落这条修复；**t28 不得改 `verify-site.js`、也不得改 `plan-changes.js` 的窗口口径**；`lastSeen` 保持 2026-10-08（不许为让门禁变绿伪造成旧日期）；**串行：t32 先合，本 PR rebase 到新 master 后再合** —— 在那之前本 PR 的 `gate` 这一行红是**预期**状态，原因已定位、修复已排期。


### 6.2 PR 与推送方式（本机网络限制，如实登记）

- **PR #97**：<https://github.com/buguoshixc/ai-deals-aggregator/pull/97>（base `master`、**当前 head `5c202fa3`，父 = `898f86f`**、17 个文件、MERGEABLE、**未合并**）。
- 本机 **`github.com:443` 不可达**（`git push` / `git fetch` 都不通；`api.github.com` / `codeload.github.com` / `ssh.github.com:443` 可达，但**没有 SSH 私钥**）⇒ 全程改用 **Git Data API** 推送：blob/tree/commit/ref 逐个建。首版 head `bd444f0e`（父 = 当时 master `682adde`），补齐两件交付后 head `fd24a677`/`32674610`，对齐 t32 后 head `5c202fa3`（父 = `898f86f`，`force: true`，因这是一次 rebase-on-master）。每次推送前都逐条核对「我改的文件在上游有没有别的版本」，从未覆盖别人的改动。
- 本地 commit `504eced`/`ef70816`/`1ffbb7f`（父链基于 `9b72b9d`）与远端分支**这些文件的内容逐字节相同**，只是父提交不同（本机无法 `git fetch` 对齐）；后续再推送请注意这一点。
- PR 的 CI `gate` 现随对齐后的 head 重跑；本地对齐树上的读数是 **48 个脚本失败 0 · verify 885/0**（§6.3）。

### 6.3 对齐 master `898f86f`（t32 已合）之后的复跑

t32 合进 master 后，本任务把 #97 对齐到 `898f86f`（新 head `5c202fa3`，**父 = `898f86f`**；经 Git Data API 推送，`force: true` 因为这是一次 rebase-on-master，推送前逐条核对：上游没有改过我这 17 个文件里的任何一个），并在**本地对齐后的树**上复跑 —— 本机 `github.com:443` 不通，所以用 Git Data API 把 master 的 50 个变更文件取回工作树拼出对齐树（`.arch-v1/t28/align-local.js`；含 t32 的 `verify-site.js`，也含**我自己的 lib 改动** —— 只把数据文件搬到 master 上是复现不出来的，这正是 t32 作者点名的那件事）：

- `npm run gate` → **合计 324.7s / 48 个脚本，失败 0** · `✅ 本地门禁链全过`（exit 0）
- `npm run verify` → **✅ 验收 885 项，失败 0 项**，t32 控制组逐项与期望一致：
  `✓ API 价格变化订阅的 guid 逐条等于日志里落在当前窗口内的派生事件身份 — JSON 12 条 / RSS 12 条 / 窗口内日志 12 条（日志全量事件 18 条 · asOf 2026-10-08 · 窗口 2026-10-02..2026-10-08，ended/restored 用 2026-09-09..）`
  （修复前同一条：`12 / 12 / 18` ⇒ 红。）
- `npm run check:evidence` 绿 · `validate --strict` 绿。
- 详细读数：`research/_raw/anthropic-cached-price-landing-v1/verify-aligned.md`。

## 7. 自审：我没证明 / 没做的事

1. **没读官方 docs 定价页**（`platform.claude.com/docs/.../pricing` 从本网络仍被区域门拦，t26 已登记）⇒ 新引文取自**官方变更公告页**（可达、逐字）；docs 表里那一行现在写什么，我没有读数。
2. **旧 docs 引文保留为历史**这件事**没有数据内的「历史」标记**：它靠 `capturedAt`（2026-10-01）与紧邻的变更记录（写「rather than $0.20」）共同说明。若后续要给「历史引文」加显式标记，那是 lib/数据形态的一次设计（本任务未做）。
3. **变更记录引文的牙齿边界**：该引文同时点名 0.10 与 0.20，所以「把值改回 0.20」不会在引文层变红（见 §4 注①）；配牙靠 C1（引文里没有的数）与日志对账（T4）。
4. **写入档（5m/1h）是否联动**：官方未说明 ⇒ 未改、未推断（t26 §5 第 4 条同结论）。
5. **没有跑线上冒烟/发布链**：本任务只到产物 + 门禁（PR 不合并）。
6. 事件 `at` = 2026-10-08 是**我们的记录日**，不是官方生效日 2026-10-07（captain 已确认这个口径）。
