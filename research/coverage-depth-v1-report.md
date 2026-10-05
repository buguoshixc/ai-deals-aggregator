# coverage-depth-v1 · 最终报告（初稿）

- 基线：`ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8`（分支 `coverage-depth-v1`，本轮改动全部在工作区、未提交）
- 报告口径：**只写实测读数**。每条读数都能在 `research/_raw/coverage-depth-v1/verification/` 找到现场文件；本轮未执行的（CI/Deploy/在线冒烟）一律留占位。
- 复核方式：独立验证者（verifier-auditor）自跑；对他人交付物只引用并标注出处；两种独立路径互不相容时如实记录差异（见 Self-Audit §4.3）。
- **same-day 口径（T7-F2）**：`coverage-report.js --json` 的两次运行输出**同一天内**逐字节相同（`generatedAt = todayCN()` 是 HEAD 既有行为，属墙钟依赖）；v3 四节新增内容经假墙钟四档验证**不随墙钟变化**。因此本文不写"无条件 byte-identical"。

---

## 1. Baseline

| 项 | 基线 ff86368 | 现在（工作区） |
|---|---|---|
| registry 身份数 | 44 | **51**（+7，slug 消失 0） |
| releasedAt 已知 / 未知 | 4 / 40 | **32 / 19**（不可判日 0） |
| catalogStatus 普查 | current 3 · aging 0 · legacy 1 · historical 0 · unknown 40 | **current 29 · aging 2 · legacy 1 · historical 0 · unknown 19**（和 = 51） |
| 七态（136 格） | COVERED 64 · PARTIAL 1 · MISSING 17 · DEFERRED 2 · UNVERIFIABLE 2 · NOT_APPLICABLE 50 · BLOCKED 0 | **COVERED 79 · PARTIAL 0 · MISSING 0 · DEFERRED 3 · UNVERIFIABLE 2 · NOT_APPLICABLE 52 · BLOCKED 0** |
| API 计价记录 / 计价条目 | 17 / 93 | **24 / 108** |
| Coding 套餐 | 37 | **44** |
| 映射 link / 处置声明 | 75 / — | **92 / 58（API 侧 16，0 重复）** |
| Deals 条数 | 135 | **135**（未变） |
| sitemap URL 数 | 173 | **183**（丢失 0 · 新增 10） |
| 工作区改动 | — | 17 个跟踪文件 **+5642 / −255**；未跟踪新文件 60 个（脚本/文档/证据） |

三条契约 Verify（原样读数）：
```
git diff --stat ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8...HEAD   退出码 0 · 输出为空
  （解释：HEAD == ff86368，本轮零提交；工作区 vs 基线的 diff 见上表，17 文件 +5642/−255）
node scripts/validate.js --strict                                 退出码 0 · ✅ 校验通过（strict 模式）
node scripts/tools/coverage-report.js                             退出码 0 · 报告自检问题 0 处
```

---

## 2. Release Evidence

- 32/51 条身份写下了 `releasedAt`，全部带 `releaseEvidence`；`unparsable = 0`（没有"写了但解析不出可判日"的）。
- 逐 developer（共/已知）：智谱AI 8/6 · 腾讯云 6/5 · Anthropic 4/4 · Google 4/4 · MiniMax 4/3 · OpenAI 4/3 · 火山引擎 4/0 · 阿里云 4/0 · DeepSeek 3/3 · 360智脑 2/2 · 月之暗面 2/2 · 百川智能 2/0 · 百度智能云 2/0 · 科大讯飞 1/0 · 阶跃星辰 1/0
- 逐 modelRole：general 29/16 · vision 8/6 · fast 6/4 · (字段缺失) 2/2 · other 2/1 · translation 2/2 · coding 1/1 · embedding 1/0
- 本轮新增批次（`capturedAt=2026-10-05`）：**28 条**；evidence 全部落在该 developer 的 `officialDomains` 内、引文非空、日期为真实日历日（32 条逐条核对 **0 问题**）。
- 诚实留空：**19 条仍未写日期**（火山豆包 4 条月分区无日、minimax-m2.5 只有月、glm-4.6v-flash/flashx 系列≠变体、hunyuan-embedding 只有额度行、qwen 4 条只有快照 id、step-3.5-flash 官方无发布日、gpt-live-1 无官方带日期页，以及 t8 新增但官方页未给日期的身份）。
- 独立稽核（我的机械核对）：28/28 的引文特征词能在同一份现场抓取页里找到；26/28 能在该页定位到 `releasedAt` 的日历写法；22/28 的引文**自身**含日期（其余依赖页面/表格上下文 —— 与 t2 对腾讯 L3"引文带表头自证语义"的处理一致）。
- 保留项（VERIFY）：`minimax-m2.7`、`minimax-m2.7-highspeed`（2026-03-18）在我覆盖的 9 种日期写法下未能在现场页定位日期 → 留待人工再核，**不判错**（Self-Audit T10-F4）。

---

## 3. Catalog Currentness

- 词表唯一出处：`scripts/lib/model-freshness.js` 的 `CATALOG_STATUSES = ['current','aging','legacy','historical','unknown']`；逐条值唯一出处：发布产物 `models.json` 的 `catalogStatus`（来源层禁写派生字段）。
- 终态分布：**current 29 · aging 2 · legacy 1 · historical 0 · unknown 19**，和 = 51 = registry 身份数 = 发布条目数（`catalogStatusCensus.sum = 51`）。
- 未知的 19 条与"没有 releasedAt 的 19 条"是同一批（`Release Evidence unknown = 19` 与 `catalogStatus unknown = 19` 同时成立）；没有出现"unknown 里混进非日期原因"或"日期原因被算进 unknown"。
- 默认展示档：`current / aging / unknown`；默认隐藏：`legacy / historical`（读自 lib 的 `DEFAULT_VISIBLE/HIDDEN_CATALOG_STATUSES`）。
- 独立复核：我用自己写的统计脚本按 raw `models.json` 逐档复算，与报告逐档相等；无词表外取值；`model-freshness-selftest` 100/0。

---

## 4. Coverage Gap Closure

- 终态 **MISSING = 0 · PARTIAL = 0**（基线 17 + 1）；`gapClosureQueue.total = 0`，A/B/C/D 全 0。
- 逐条出口（团队记录）：13 MISSING + 1 PARTIAL 由 B-1 关闭（12 COVERED + 1 DEFERRED(microsoft/coding，带 revisitBy) + 1 UNVERIFIABLE(deepseek/deals，附 4 个查过的官方来源) + 2 条 NOT_APPLICABLE 编码修正）；余 4 条 models 维度由 B-2 关闭（新增 7 条 registry 身份 + 映射/处置）。
- 意图层仍"只写意图"：`coverage-targets.json` 不出现手写状态（`validate --strict` 过；`coverage-targets-selftest` 201/0）。
- 独立复核：我用自己写的七态 if 链（不 require lib）在 4 个时点重算，与报告 `states` **逐档且集合相等**；`COVERED 79` 的每一格都满足"有记录"（报告侧同名断言）。

---

## 5. Source Reliability

- 采集器注册表：**9 行**（BASE 7 + 无头 2）↔ `source-probes.json` 9 键 ↔ `source-health.json` 9 行 —— 三个集合逐字相等（我独立复核）。
- 心跳：`generatedAt = 2026-10-04T16:31:52.051Z`（报告里打印的就是它，不是跑报告的墙钟时间）。
- 唯一非 healthy：`futurepedia`（status=failed / reason=collector_error / cf=10 / lastError HTTP 403）。cf≥3 的也只有它。
- 裁决：`scripts/data/source-rulings.json` = **1 条 keep-degraded**（futurepedia），`revisitBy` 含 **2026-10-19**，`overlap = {historical 3, unique 3, overlap 4, maintenanceCost medium}`，evidence **7 条**（1×2026-10-04 + 6×2026-10-05），`whyKept` 481 字符（四条理由：跨环境观测不一致 / 不污染数据 / 独占记录通道 / 成本极低）。三方对账 `problemCount = 0`。
- **observed unstable，不写"已恢复"**：CI 侧连续 10 次失败（2026-09-30→2026-10-04）vs 本机侧 2026-10-05 三轮全成功（各 7 条）⇒ 跨环境观测不一致。
- 历史未被改写：`SOURCE_TYPES.Futurepedia = 'directory'` 仍在；3 条历史 Futurepedia 记录的 `sourceTypeOf()` 全部 = directory；`source-health.json` 与基线**逐字节相同**（4515 字节）⇒ 没有为全绿删行。
- 待复查：2026-10-19 前用同一条命令重读两套读数（CI 侧 `generatedAt` + cf，本机 dry-run 轮次）；四条升级触发条件已写进裁决文件。

---

## 6. Data Added

| 类别 | 数量 | 证据形态 |
|---|---|---|
| registry 新身份 | **7** | 360zhinao-pro · 360zhinao-turbo-llm-geo · baichuan-m3 · baichuan-m3-plus · ernie-4.5-turbo-128k · ernie-5.1 · spark-x2.5（逐条"为什么是独立身份"见 gap-closure 报告 B2-1） |
| 新增 releasedAt 证据 | **28** | 官方页逐字引文 + `sourceUrl` 在 officialDomains 内 + `capturedAt=2026-10-05` |
| API 计价记录 | **+7**（17→24，条目 93→108） | ai360 / baichuan / baidu / iflytek / moonshot / sensetime / stepfun，逐字官方价 + 11 项核对 |
| Coding 套餐 | **+7**（37→44） | OpenAI ChatGPT Plus/Pro100/Pro200/Pro500/Business Standard+Premium；商汤 Token Plan Free 公测 |
| 映射 link | **+10**（75→85 条 identity；文件行 85→92） | 只增不改，既有 82 条零改动 |
| 处置声明 | **58 行**（API 侧 16，plan 侧 42；0 重复） | 每条带 reason/sourceUrl/modelKey/variant，可逐字回查 |
| providers 官方域 | **+2 域 1 行** | sensetime 追加 sensenova.cn / sensecore.cn（带指向证据） |
| 来源裁决 | **1 条** | keep-degraded（futurepedia） |

---

## 7. Data Not Added

- **19 条 releasedAt 仍为 null**（无合法官方日期来源；宁可留空，不猜、不外推）。含 4 条月分区无日、1 条只有月、2 条"系列≠变体"、4 条只有快照 id、2 条官方无发布日等。
- **复杂计费 bundle 零条硬写成 `per_1M_tokens`**（配额包 / 万字符 / 小时 / 区间价），另留 schema 扩项建议（B-1 报告）。
- 没有任何第三方来源进入 releaseEvidence（0 条）。
- 没有为"凑 COVERED"新增空壳记录：每一格 COVERED 都能回指盘上记录（报告断言 + 我的独立七态复算）。

---

## 8. Integrity（逐项实测）

| 项 | 判据 | 实测（我独立算） | 结论 |
|---|---|---|---|
| Stable IDs | 逐类 id 集合对比基线，零非预期 churn | apiPlanIds 17→24 (+7/−0) · codingPlanIds 37→44 (+7/−0) · dealIds 135→135 · providerKeys 34→34 · modelSlugs 44→51 (+7/−0) · linkIdentities 75→85 (+10/−0) | **消失 0** |
| History | 三份 history 无新增伪造事件 | deal-history 1→1 · plan-history 28→35 (+7/−0) · api-plan-history 10→17 (+7/−0)；**新增 ended/removed 0 条**，无 futurepedia 相关事件 | **PASS** |
| Pricing | legacy 模型的 API 计价行仍在 | legacy 仅 `deepseek-v3.2`，其计价行仍在（plan `6844d46deb05`） | **PASS** |
| Registry | 映射闭合 | 51/51 slug 有映射；108 条计价 identity 全部有结局（映射 or 声明）；API 侧声明 16 条逐条可回查 | **PASS** |
| Sitemap | 无非预期丢页 | 基线 173 → 183；**丢失 0**；新增 10 = 3 个新厂商页 + 7 个新模型页 | **PASS** |
| Feed | 两类格式齐全、可重建 | dist/feed 48 个（24 xml + 24 json）；`feeds-selftest` 145/0；`check-feeds-reproducible` exit 0 | **PASS** |
| Manifest | 数据集清单一致 | `dist/data/index.json` 9 个数据集（api-plan-history·api-plans·deal-history·deal-plan-links·deals·model-registry-links·models·plan-history·plans） | **PASS** |
| Analytics | 本地零请求 | `analytics-selftest` 31/0：无 Cloudflare Analytics API 域名、不公开统计、未登记进 PUBLIC_DATASETS、sitemap 无 /stats/；186 个 HTML 全部 trackable、bootstrap 186 | **PASS** |
| Analytics（补充） | dist 内无分析产物泄出 | dist 303 文件中无 analytics/track 命名产物 | **PASS** |

> 未测项：我不在 CI/部署环境里跑，所以"线上"的 Integrity（CDN 缓存、GitHub Pages 行为）不在本报告口径内 —— 见 §11/§12。

---

## 9. Reproducibility

- 派生链（来源层 → 发布产物）全部由工具重建且字节一致：
  - `check-models-reproducible` → 「models.json 与 model-registry-links.json 都与来源层逐字节一致；51 个模型 · 92 条映射」
  - `check-api-plans-reproducible` / `check-plans-reproducible` / `check-feeds-reproducible` / `check-reproducible` → 各 exit 0
- 报告确定性：
  - **same-day** 的两次 `--json` 逐字节相同（我实测三组：t1-era 268285 字节 sha `2b08c377…` ×2；冻结快照 264419 字节 sha `6905d418…` ×2；当时 live 262956 字节 sha `9698645a…` ×2）。
  - 假墙钟四档（同日 / +1 天 / +3 月 / +9 月）：全文件 6866 行里**只有 `生成日期` 与 `generatedAt` 两行变化** ⇒ v3 四节不吃墙钟、报告 exit code 不随日期翻转。
  - 无网络 + 无随机钩子（`http/https/net/tls/dns/fetch/Math.random/crypto.random*` 全部一调用就抛）下：报告 exit 0，输出与基线**逐字节相同**。
- 采集器：`--dry-run` 路径可用（`health-selftest` 72/0 含一次 dry-run 端到端）；本轮未跑真实采集。

---

## 10. Gate（本仓库 Full Gate 的实测状态）

- captain 的预集成 gate 产物：`research/_raw/coverage-depth-v1/gate/pre-integration/gate-results.json` —— **50 步**；当时唯一红灯是 `Models-page self-test (index + detail pages)`（exit 1）。
- 该红灯由 t13 于 **13:03:51** 收口；**post-t13 gate 复跑产物**：`gate/post-t13/gate-results.json` —— **50 步 · 非 0 步 0 · failed = 0**（`label = post-t13`）。该轮的 `assemble site` 步在 **13:06:53–54** 重建了 `dist/`，本文 §8 的 sitemap/feed/manifest 读数就是这份重建产物的读数。
- 我在 13:5x 独立复跑：
  - `models-page-selftest --allow-missing-dist` → **120 项通过 / 0 失败，exit 0**
  - `models-page-selftest --dir=dist` → **120 / 0，exit 0**
- 我另跑 18 条自测/门禁命令（`t10-suite-results.json`）：**18/18 exit 0**，含 `validate --strict`、`coverage-report`、`coverage-targets-selftest 201/0`、`models-selftest 148/0`、`model-freshness-selftest 100/0`、`check-model-registry-links`、`check-models-reproducible`、`history-selftest 61/0`、`provenance-selftest 132/0`、`analytics-selftest 31/0`、`seo-selftest 63/0`、`feeds-selftest 145/0`、`plan-history-selftest 132/0`、`api-plans-selftest 176/0`、`health-selftest 72/0`、`archive-selftest 69/0`。
- 三条契约 Verify 的退出码：`git diff --stat …...HEAD` = **0**（输出空，见 §1 解释）；`validate --strict` = **0**；`coverage-report` = **0**（自检 0 处）。
- 时效说明：数据层最后一次改写是 12:16，post-t13 gate 在 13:06 重建了 `dist/` ⇒ 现有 `dist/` 与当前数据一致；**部署仍须走部署路径重新构建**（不要直接把工作区 `dist/` 当成交付产物），CI/Deploy 的真实读数见 §11。

---

## 11. CI · Deploy

### CI（已实测，captain 回填）

| 项 | 读数 |
| --- | --- |
| PR | #40 `coverage-depth-v1` → `master` |
| 触发 commit | `351da20` |
| run id | `37268247562`（workflow `Verify site (gate)`，事件 `pull_request`） |
| required check | **`gate` —— pass，3m 33s** |
| job 步骤 | Set up job ✓ · Checkout ✓ · Setup Node.js ✓ · **CI consistency（action / runner / node-version / engines drift）✓** · **Gate（validate → translation → selftests → build → real browser）✓** · Post Setup Node.js ✓ · Post Checkout ✓ · Complete job ✓ |

**两侧都绿的独立意义**：本地 Gate 在 **Windows + 本机 Edge（`msedge` 通道）** 上跑 49 步全绿，
CI 在 **ubuntu-24.04 + runner 自带浏览器 + Node 24** 上跑同一份 `.github/actions/gate/action.yml` 全绿。
这说明题面 §72 记录过的那个坑（大 JSON 的 stdout 管道在 CI 被截断 ⇒ local green / CI red）
**本轮没有复现** —— 报告侧的大输出已全部改成文件捕获，已在两侧同时验证。

### Deploy（已实测，captain 回填）

| 项 | 读数 |
| --- | --- |
| 合并 commit | `677c5fcacb50b93f7f273d62d89ca3dafa273233`（`Merge pull request #40 from buguoshixc/coverage-depth-v1`） |
| 合并后 master 上的 gate | run `37269085985`（`push`）—— **success 3m 4s** |
| 部署 | run `37269086046`（`Deploy to GitHub Pages`，`push`）—— **success 4m 11s** |
| 部署地址 | `https://buguoshixc.github.io/ai-deals-aggregator/` |
| 与本地构建的关系 | 部署走 `deploy.yml` **自己的**构建路径（与本地 `build-local.js` 同一条链），**没有**复用本地 `dist/` —— 本地 `dist/` 不是交付产物 |

> 本轮在合并前后共跑出 4 次全绿的远端 gate：PR head `351da20`（3m37s）、PR head `8fda2cd`（3m27s）、
> 合并后 master `677c5fc`（3m4s），加上 2 次本地 Full Gate（49/49）。

---

## 12. Online Smoke（已实测，captain 回填）

脚本：`research/_raw/coverage-depth-v1/gate/online-smoke.cjs` · `generatedAt = 2026-10-05T05:49:41.534Z`

| 页面 | HTTP | 字节 |
| --- | --- | --- |
| `/` | 200 | 399,786 |
| `/models/` | 200 | 151,307 |
| `/models/claude-opus-5.5/`（本轮新增 releaseEvidence） | 200 | 86,188 |
| `/models/glm-5.3/`（本轮新增日期） | 200 | 89,766 |
| `/models/deepseek-v3.2/`（**legacy**） | 200 | 86,155 |
| `/plans/api/`（本轮 17 → 24 条） | 200 | 233,803 |
| `/plans/coding/`（本轮 37 → 44 条） | 200 | 278,770 |
| `/sitemap.xml` | 200 | 36,504 |
| `/feed.json` | 200 | 82,334 |
| `/data/index.json` | 200 | 4,124 |

**结果：访问 10 个页面，失败 0；页面内容抽核 11/11 通过**，其中：

- `/models/` 含本轮新增身份 `360zhinao-pro`，且**仍含 legacy 身份的静态行**（`data-model="deepseek-v3.2"` —— 默认隐藏不等于删行，§53）
- `/models/claude-opus-5.5/` 展示本轮取证到的 `2026-09-22`；`/models/glm-5.3/` 展示 `2026-08-19`
- `/models/deepseek-v3.2/` 作为 legacy 详情页仍可打开且有正文
- `/plans/api/` 出现本轮新增的 provider
- sitemap 含 legacy 模型 URL，URL 数 ≥ 基线 173；`feed.json` 可解析且条目数 ≥ 基线 48
- Dataset Manifest 仍是 **9** 个公开数据集，且**内部维护层 `source-rulings` 没有被发布**（题面 §41）

**访问面刻意只有 10 个**（题面 §75）：生产已经在收真实 Analytics，全站 170+ 页爬一遍会污染观测数据。
10 个页面里 **7 个**带 analytics bootstrap（其余 3 个是 sitemap / feed / manifest，非 HTML），
说明生产侧的计数是**真的在跑**的 —— 这正是不能全站爬的理由。

---

## 13. Remaining Risks

1. **同类"空集恒真"断言仍有 3 处**（P3，Self-Audit T10-F1/F2/F3）：`coverage-targets-selftest.js:137-139`（MISSING 集合，**当前已恒绿**）与 `:136`（COVERED 集合），`verify-site.js:1548/1553`（JSON feed 无"至少一个"前提）。修法都是"加非空前提或改成计数对账"；本轮按 captain 指示未改动已冻结文件。
2. **T10-F4 已被 captain 独立复核推翻（是审计器缺陷，不是 provenance 缺陷）**：`minimax-m2.7` /
   `minimax-m2.7-highspeed` 的引文**确实含日期** —— 写法是官方页的**中文长写**「2026 年 3 月 18 日」
   （`minimax-m3` 同理为「2026 年 6 月 1 日」）。t10 的核对器只认 ISO 写法，属假阳性。
   captain 另写 `research/_raw/coverage-depth-v1/gate/date-in-quote-audit.cjs` 独立复算
   （覆盖 ISO / 中文长写 / 中文短写 / 斜杠 / 点式 / 英文月名缩写与全称，大小写不敏感、兼容不补零写法），
   结论：**32 条有日期的条目里 30 条引文含该日期的某种写法**；本轮**新增的 26 条 26/26 全部命中**。
   > 该审计器自身也修了两处缺陷后才得出此结论（大小写敏感、`MONTH_ABBR` 误放 `sep`+`sept` 两个元素
   > 导致 9 月之后的月份索引错位）—— 记在这里是因为「核对器本身也要被核对」正是本轮反复在讲的事。
3. **余下 2 条是「引文取景范围」的 P3 小瑕疵，且**不是本轮新增**：`deepseek-flash` / `deepseek-v4-pro`
   的引文支持「正式发布」这一**事件**，而具体日期逐字出现在**同一官方页的章节标题行**
   （`api-docs.deepseek.com/updates` 的 `date-2026-09-10` / `date-2026-08-13` 锚点，t9 已独立核实逐字相同）。
   即：**不是无证据的日期**，是 quote 少取了一行。修法：下次动 `scripts/data/models.json` 时把
   该标题行并入这两条 quote。本轮**不改**，理由是它在本轮 §50 的义务范围（100% 新增日期逐条复核）之外，
   而此刻改动会作废刚拿到的 Full Gate 与 CI 证据。
4. **引文自含日期的比例**（DOC，T10-F5，口径已按 captain 复算修正）：不是 22/28 ——
   captain 的独立复算给出的是 **32 条有日期的条目里 30 条引文自带日期写法**，本轮**新增的 26 条 26/26**。
   文档口径仍应写成「引文**或其所处页/表上下文**含日期」，不要写成「每条引文都自带日期」——
   因为确实存在引文靠页面上下文承载日期语义的情形（腾讯云 L3 的「版本更新时间」列就是这一类）。
5. **健康心跳有时效**：`source-health.json` 的 `generatedAt = 2026-10-04T16:31:52.051Z`，报告里的 live 读数都以它为准；它越旧，`status` 越不可信。下次采集后需重跑报告与裁决复查（2026-10-19 前）。
6. **部署产物时效**：见 §10 —— 现有 `dist/` 由 post-t13 gate 于 13:06:53–54 重建、与当前数据一致（数据最后改写 12:16）；但部署仍必须走部署路径重新构建，`dist/` 不是交付产物。
7. **编排层事实**（DOC，T10-F7a）：成员收到的任务书是截断版（如 t12 只看到 6/8 条 acceptance），本轮成员以 `team.json` 的权威契约为准完成；未发现因此漏执行的 acceptance 条目，但这是流程风险，建议下发改成"契约落盘 + 摘要渲染"。
8. **断言可证伪性是持续工作**：本轮修了 T7-F1/T7-F3 并留下可证伪性牙，但"新断言是否可被证伪"需要在每次数据形态变化后复查（例如 MISSING 从 0 变回非 0 时，T10-F1 会重新变成有效检查，却仍是空集恒真的形态）。
9. **核对器自身也需要被核对**（本轮亲历）：t10 的日期核对器只认 ISO 写法、captain 的独立核对器又先后犯了"大小写敏感"与"`MONTH_ABBR` 索引错位"两个错 —— 两次都**先得出过错误结论**（前者把 2 条中文长写日期判成"未定位"，后者把 16 条英文/不补零写法判成"引文无日期"）。结论：**机械核对器只能当侧证，权威判据仍是逐条人工式复核**（题面 §49 说的正是这件事），且核对器本身的输出必须带反证样例。
