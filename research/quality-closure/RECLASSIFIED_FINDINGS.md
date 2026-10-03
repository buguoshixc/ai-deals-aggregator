# RECLASSIFIED_FINDINGS（**终版** · §24 九类）

> **状态**：**终版**（draft 见同目录历史版本；本版按 Prompt §24 的九类 + 每条 7 个必备字段产出）。
> **任务**：T21（owner `evidence-analyst`，attempt 1）· 2026-10-04（Asia/Shanghai）
> **正典清单**：`research/audit/DEFECTS_AND_GAPS.md` —— **99 条 / 104 个 finding ID**
> （机器重抽复核：`total=99 · byLevel={P0:1,P1:12,P2:32,P3:54} · totalIds=104`；脚本 `.qc-t03/extract-canonical.mjs`）
> **存在性依据**：`FINDING_STATUS_BEFORE.md`（T02）—— 46 个点名 ID 在 `21cf66d5` 上全部 `STILL_PRESENT`
> **本轮修复证据**：`FIXED_FINDINGS.md`（T18 独立复核 · verdict=pass）· `MUTATION_RESULTS.md`（T20 · 21 例）·
> `source-revalidation.md`（T04 来源回访）· 各实现任务的 before/after（T05–T17）
> **规则来源**：`D:\OneDrive\Desktop\AI_DEALS_QUALITY_CLOSURE_PROMPT_REVISED.md`（工作区外、只读）：
> §2 六类定义（L106–175）· §6–§13 各阶段指定项（L363–779）· §11 VERIFY-only（L686–698）· §12 来源专项（L700–731）·
> §24 九类与字段（L940–959）· §26 严禁顺手开发（L985–990）· §27 完成条件 A–S（L993–1016）· §30 十条原则（L1169–1209）

---

## 0. 口径

### 0.1 §24 的九个终类（逐字）

`FIXED` | `GUARDRAIL_ADDED` | `VERIFIED_NO_CHANGE` | `DESIGN_ACCEPTED` | `NOT_REQUIRED` | `DOC_FIXED` | `DEFERRED` | `ALREADY_FIXED` | `NO_LONGER_APPLICABLE`

每条至少记录 7 个字段：**old finding ID · old severity · audit commit · latest master status · new category · action · evidence**（本文 §2 表逐条给出）。

- `audit commit` 全表统一为 `1c024db`（审计基准 `1c024db6029feb6ecaf9ddfb32d88e51bf08fee2`）。
- `latest master status` = 本轮基线 `21cf66d5` 上的存在性结论；`STILL_PRESENT（T02 已复现）` 表示 T02 有命令级/数据级/源码级证据，
  `STILL_PRESENT（审计基线；T02 未逐条复现）` 表示 T02 未覆盖该条，按审计结论登记（**不得**读成「已复现」）。

### 0.2 当前数字重算表（**其他文档引用本节**）

以下数字在 2026-10-04 由 T21 独立重算（脚本 `.qc-t21/recompute.mjs` + `.qc-t21/counts2.mjs`，只读数据 + 读隔离构建 `dist.qc-docs/`）。
**任何文档里的「当前数字」都必须能回到这张表**。

| 数字 | 现行值 | 重算命令 / 方法 |
|---|---|---|
| Deals | **134** | `node -p "require('./deals.json').deals.length"` |
| Deals by type | **{"deal":80,"tool":54}** | `按 d.type 分组` |
| Plans | **23** | `node -p "require('./plans.json').plans.length"` |
| API records | **13** | `node -p "require('./api-plans.json').plans.length"` |
| API pricing items | **67** | `api-plans.plans[].models[] 展开计数` |
| API providers | **10** | `new Set(plans.map(p=>p.provider)).size` |
| Models | **44** | `node -p "require('./models.json').models.length"` |
| Registry mappings | **64（API 55 + Coding 9）** | `links.filter(l=>l.apiPlanId/planId).length` |
| Gaps (declarations) | **10** | `scripts/data/model-registry-gaps.json → declarations.length` |
| deal-plan-links | **5** | `scripts/data/deal-plan-links.json` |
| Providers (source layer) | **34** | `scripts/data/providers.json 顶层键` |
| official_urls 登记 | **14** | `scripts/data/official_urls.json` |
| curated_api_plans（来源层） | **13** | `scripts/data/curated_api_plans.json.length` |
| curated_api_plans 计价条目（来源层） | **67** | `来源层 models[] 展开` |
| History events (deal-history) | **0** | `scripts/data/deal-history.json → events.length` |
| History events (plan-history) | **14** | `scripts/data/plan-history.json → events.length` |
| plan-history by type | **{"created":14}** | `按 e.type 分组` |
| History events (api-plan-history) | **6** | `scripts/data/api-plan-history.json → events.length` |
| api-plan-history by type | **{"created":6}** | `按 e.type 分组` |
| dist files | **290** | `Get-ChildItem -Recurse -File dist.qc-docs | Measure-Object` |
| HTML pages | **173** | `(Get-ChildItem -Recurse -File dist.qc-docs -Filter *.html).Count` |
| Sitemap entries | **170** | `grep -c "<loc>" dist.qc-docs/sitemap.xml` |
| Feed files (xml+json) | **28** | `Get-ChildItem dist.qc-docs/feed | Measure-Object` |
| /feeds/ 列出地址数 | **48** | `dist.qc-docs/feeds/index.html 里 /feed/ 链接去重计数` |
| 其中 category-* 文件 | **10** | `feed 目录 category-* 计数` |
| dist 根 JSON | **11** | `ls dist.qc-docs/*.json` |
| Manifest datasets | **9** | `dist.qc-docs/data/index.json → count` |
| dist 全树 JSON | **36** | `(Get-ChildItem -Recurse -File dist.qc-docs -Filter *.json).Count` |
| 模型详情页 | **45** | `dist.qc-docs/models/*/index.html 计数` |
| 优惠详情页 | **80** | `dist.qc-docs/deal/*/index.html 计数` |
| Gate steps (action.yml - name:) | **44** | `grep -c "\- name:" .github/actions/gate/action.yml` |
| Gate assertions (check-ci 项数) | **36 项** | `node scripts/tools/check-ci-consistency.js --expect-checks=36 → exit 0` |
| validate --strict | **exit 0 · (未匹配)** | `node scripts/validate.js --strict` |

补充（同一批重算）：

| 数字 | 现行值 | 方法 |
|---|---|---|
| Feed 份数 / 文件 | **24 份 / ×2 = 48 文件** | `Get-ChildItem -Recurse -File dist.qc-docs/feed` = 48（13 顶层 + 5 category-* + 2 plans 变化 + 9 vendor） |
| `/feeds/` 列出地址 | **48**（24 xml + 24 json，含 category-* 10） | 解析 `dist.qc-docs/feeds/index.html` 的 `/feed/` 链接去重 |
| ai-selftest | **63 项 · 失败 0** | `node scripts/tools/ai-selftest.js` |
| zh-selftest | **15 项 · 失败 0** | `node scripts/tools/zh-selftest.js` |
| validate --strict | **exit 0** | `node scripts/validate.js --strict` |
| check-ci | **36 项 · 失败 0**（`--expect-checks=36` 也通过） | `node scripts/tools/check-ci-consistency.js --expect-checks=36` |
| 构建 | `build-local --out=dist.qc-docs` **exit 0**，产物自检全过 | 173 HTML / 290 文件 / 1216.8 KB |

> **口径差异（如实登记）**：任务书里提到的「`/feeds/` 列出地址 40 → 50」与重算值 **48** 不一致：
> 重算口径 = `dist.qc-docs/feeds/index.html` 里 `/feed/` 链接**去重**计数（24 份 × 2 格式 = 48）；
> 差异 2 条的原因未能在产物里复现（可能是把页内 2 条 `rel=alternate` 也计入了）。
> 本文与所有被改文档一律采用**重算值 48**（可复现），并保留旧读数列于此。

### 0.3 与 draft 的差异（两处，均已落表）

1. **`P2-20`（`F-r2-api-006`）由 `DEFERRED` 改 `GUARDRAIL_ADDED`**（captain 2026-10-04 裁定）：审计 R-P1-7 本就把它与 P1-7…P1-10 归为同一条修复项，
   且「全仓没有单位换算路径」是单位红线成立的结构前提 ⇒ 并入 T13。连带：`GUARDRAIL_ADDED` 18→**19**、`DEFERRED` 23→**22**、六类里 `GUARDRAIL` 17→**18**、`NOT REQUIRED` 29→**28**（总数仍 99）。
2. **draft 的 37 条 ⚑ 全部收敛**（§4 逐条给结论）；本文不再保留未决标记。

### 0.4 证据边界（**原样保留，不得升级**）

| 边界 | 内容 |
|---|---|
| `F-r1-history-ai-001`（P1-4） | 审计复核为 `[RX-U]`：**仅源码级**确认，端到端夹具未由第二人复跑；T02 同样只做源码级。引用时不得写成端到端已被第二人复现（本轮 T07/T08 的非空夹具是**修复证据**，不是对该边界的升级） |
| `F-online-008`（P3-29） | **仍 `UNVERIFIED`**：T04 只对 4 条中的 4 条做了抽样回访，其中 3 条因 JS/反爬读不到正文 ⇒ 不得升级为已证实/已证伪；T21 **未回访** |
| §16 的「读不到」条目 | google（网络层 `fetch failed`）、openai×2（Cloudflare 403）、volcengine、zhipu、aliyun 中文定价页 / off_peak —— 一律保持**证据边界**原文，不得改写成「已核对一致」或「未发现问题」 |
| `F-r1-history-ai-004`（P2-14） | 审计 `[RX-U]`：本轮只证明「无白名单」这一机制（沙箱 scratch 路径），**未复现覆盖生产文件**那一步 |
| `F-r2-api-007`（P2-21） | 标签漂移子声明仍 `UNVERIFIED`；本轮只确认「两套单位口径并存、无交叉门禁」 |

---

## 1. 计数汇总（九类 · 终版）

**九类**：FIXED **10** · GUARDRAIL_ADDED **19** · VERIFIED_NO_CHANGE **8** · DESIGN_ACCEPTED **10** · NOT_REQUIRED **12** · DOC_FIXED **18** · DEFERRED **22** · ALREADY_FIXED **0** · NO_LONGER_APPLICABLE **0**（合计 **99**）

**按旧严重度交叉**：

| 旧严重度 | FIXED | GUARDRAIL_ADDED | VERIFIED_NO_CHANGE | DESIGN_ACCEPTED | NOT_REQUIRED | DOC_FIXED | DEFERRED | ALREADY_FIXED | NO_LONGER_APPLICABLE | 小计 |
|---|---|---|---|---|---|---|---|---|---|---|
| P0 | 1 | — | — | — | — | — | — | — | — | 1 |
| P1 | 5 | 7 | — | — | — | — | — | — | — | 12 |
| P2 | 2 | 10 | 2 | 2 | 2 | 1 | 13 | — | — | 32 |
| P3 | 2 | 2 | 6 | 8 | 10 | 17 | 9 | — | — | 54 |
| **合计** | **10** | **19** | **8** | **10** | **12** | **18** | **22** | **0** | **0** | **99** |

**与 draft 六类（分诊词汇）的对照**：REPAIR NOW **10** · GUARDRAIL **18** · VERIFY **16** · DESIGN **10** · DOC **17** · NOT REQUIRED **28**（= 99）
（六类是**分诊**用语，九类是**终态**用语；两者都合计 99，但不同维：六类说「本轮打算怎么处理」，九类说「最终落在什么状态」。）

**要点**：
- `FIXED` 10 条 = 六类里的 REPAIR NOW（§6/§7/§8/§9 指定项，T05–T12 完成，T18/T20 复核）。
- `GUARDRAIL_ADDED` 19 条 = §10 指定项 + §13.10 允许的语义检查 + §7.2 域验证 + P2-20（T13–T17 完成）。
- `DOC_FIXED` 18 条 = 本轮 §22 文档同步（含 §13.3 指定措辞）。
- `DESIGN_ACCEPTED` 10 条 = §13.5–13.9 的有意差异与既有口径。
- `NOT_REQUIRED` 12 条 = §13.1–13.4 禁止项 + §26 禁新增项。
- `DEFERRED` 22 条 = 真实但本轮不做的项（§10 未选中 / 证据不足 / 依赖后续验证），逐条在 action 列写明理由。

---

## 2. 99 条终版分类表

列说明：`覆盖 finding ID` 来自正典条目；`latest master status` 见 §0.1 的两种写法；`evidence` 列引用 T02 存在性结论与本轮修复/复核证据。

| # | old finding ID（正典条目） | 覆盖 finding ID | old severity | audit commit | latest master status | new category（§24） | action | evidence |
|---|---|---|---|---|---|---|---|---|
| 1 | **P0-1** 同一价格记录可同时属于两个 registry 模型身份，11 道生产门禁全部放行 | F-v3-registry-002 | P0 | `1c024db` | STILL_PRESENT（T02 已复现） | **FIXED** | 修 registry 冲突键（按真实 source pricing identity 推导，非 null/standard 特判）· T05 已实现，T19 评审中 | 修复：T05 —— T19 评审 pass：冲突键改按展开计价条目记账 + 常驻牙； 存在性：T02 §1 #1 STILL_PRESENT |
| 2 | **P1-1** AI 候选「必须人工 accept」红线没有门禁守卫 | F-mutation-001 · F-v3-residual-003 · F-r1-history-ai-005 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | accept 判定纯函数 + 静态牙 + allowlist · T15 实现中 | 修复：T15 —— ai-selftest 63 项；M-1（= 审计 M17）变异后 6 项红（牙7k/8a/8c/8d/8e/8i）； 存在性：T02 §1 #5 变异前 1/后 0、三门禁绿 |
| 3 | **P1-2** 门禁步骤体没有被冻结：任意步骤可被换成空操作而 36/36 全绿 | F-gate-001 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | 按真实执行语义冻结步骤体（非整文件 hash）· T17 语义版本 | 修复：T17 —— check-ci 36 项内新增步骤体指纹/if 冻结/continue-on-error 禁项；5 实验（注释不误报，改名/–-dir/continue-on-error 全红）； 存在性：T02 §1 #3 步骤体换 echo → 36/36 绿 |
| 4 | **P1-3** `allow_degraded_run` 取值无断言，必需检查可静默降级 | F-gate-002 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | 语义级断言 allow_degraded_run 的取值来源 · T17 | 修复：T17 —— 按触发事件真实求值 GitHub 表达式：PR/push/schedule/workflow_run/dispatch 默认全 false，仅人工勾选可为 true；deploy 永不许降级； 存在性：T02 §1 #4 写死 → 36/36 绿 |
| 5 | **P1-4** `/changes/` 只要有一条变化条目，产物自检必然失败 | F-r1-history-ai-001 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **FIXED** | 修 /changes/ 非空路径 arity/members/去重 · T07 实现中 + §15 非空 E2E | 修复：T07/T08 —— 非空合成历史端到端夹具（§15）：build/verify/feed/浏览器全过； 存在性：T02 §1 #6 源码级（审计边界：端到端夹具未复跑） |
| 6 | **P1-5** `/archive/<kind>/<id>/` 详情页相对链接少一层前缀 | F-r1-history-ai-002 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **FIXED** | 修 Archive 详情页前缀 · T08 | 修复：T08 —— 深度派生前缀（统一 URL helper）；非空 archive 详情页无死链； 存在性：T02 §1 #7 源码级 + 内存渲染 |
| 7 | **P1-6** 第三方目录站的内容被页面写成「官方页面明写」 | F-r1-identity-001 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **FIXED** | 渲染层与 sourceType 联动 · T09 已完成 | 修复：T09 —— 措辞与 basis/derived/sourceType 三轴联动； 存在性：T02 §1 #8 6 页同屏并存 |
| 8 | **P1-7** 来源层 input/output 互换没有任何判据 | F-r2-api-001 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | input/output ↔ evidence field 绑定 + Tooth Test · T13 | 修复：T13 —— input/output ↔ evidence field 绑定 + Tooth Test（来源层互换必须红）； 存在性：T02 §1 #9 来源层互换 → 五门禁全 0 |
| 9 | **P1-8** 单位枚举翻转（`per_1M`→`per_1K`）零判据 | F-r2-api-002 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | unit evidence 必存 + Tooth Test · T13 | 修复：T13 —— price+unit+evidence 绑定 + Tooth Test（per_1M→per_1K 必须红）； 存在性：T02 §1 #10 13 处翻转 → 五门禁全 0 |
| 10 | **P1-9** 页面第 7 列（其他计费维度）的单位错位无任何门禁 | F-r2-api-003 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | 第 7 列纳入逐格对账（判据独立于渲染）· T13 | 修复：T13 —— 第 7 列纳入独立对账； 存在性：T02 §1 #11 第 7 列错位且 assertPageHonesty 0 问题 |
| 11 | **P1-10** 页面第 8 列（免费额度 / credits）可把 tokens 额度标成 credits | F-r2-api-004 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | 第 8 列对账 + 类型词与 freeTier.type 一致 · T13 | 修复：T13 —— 第 8 列纳入对账 + 类型词与 freeTier.type 一致； 存在性：T02 §1 #12 第 8 列 credits 化且 0 问题 |
| 12 | **P1-11** freeTier 把「新用户赠送 / 限时赠品」收成「稳定长期免费能力」，与页面明文口径矛盾 | F-r2-api-005 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **FIXED** | freeTier 与 Deal 分工 · T10 实现中 | 修复：T10 —— freeTier 与 Deal 边界：stability 三档必填（standing 2 + new_user 2）； 存在性：T02 §1 #13 aliyun/tencent period=one_time |
| 13 | **P1-12** 模型详情页在多变体时静默吞行，幸存行往往是更贵档位 | F-v3-registry-001 | P1 | `1c024db` | STILL_PRESENT（T02 已复现） | **FIXED** | 展开全部 variant · T06 已完成 | 修复：T06 —— 一条 pricing item = 一行；§17 独立 join 对账 67/67； 存在性：T02 §1 #2/T02 §1 #40 12 组/9 页/少渲染 12 行 |
| 14 | **P2-1** 「带外项数」与看门狗并非互相独立 | F-gate-003 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 15 | **P2-2** 可重建性门禁与生产共用同一函数 | F-gate-004 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 16 | **P2-3** 回归基线可自刷，且无断言阻止同 PR 放宽 | F-gate-005 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 17 | **P2-4** `models-selftest.js` 把生产数量 44 写死进断言 | F-gate-006 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 18 | **P2-5** 预渲染卡片下限被下调 60→45，净余量 5 张 | F-gate-007 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 19 | **P2-6** 门禁登记制只覆盖 `selftest:` 前缀 | F-gate-008 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 20 | **P2-7** 静态文本型断言对重构敏感、对换实现迟钝 | F-gate-009 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 21 | **P2-8** `validate.js` 全部 `warn()` 不改退出码，含「页面照常、线上坏」的 invariant | F-mutation-002 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 22 | **P2-9** `check-model-registry-links.js` 抓不到「删掉一条 registry→API 必需映射」 | F-mutation-003 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | registry 身份覆盖断言 · 与 T05/T16 同批 | 修复：T05 —— API 侧完整性：删必需映射必须 exit≠0（M09 形态）； 存在性：T02 §1 #23 删 links[0] → check 0 / selftest 1 |
| 23 | **P2-10** `data-docs-selftest` 硬编码 `dist` 且缺产物=绿；`seo-verify` 完全不看 Manifest | F-mutation-004 · F-v3-export-002 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | --dir 支持 + 缺产物=红 + Manifest 对账 · T17 | 修复：T17 —— --dir 统一入口 + 缺产物 fail-closed + Manifest 对账； 存在性：T02 §1 #24 --dir 被忽略、缺产物仍 38 项 exit 0 |
| 24 | **P2-11** 熔断只有离线自测，没有生产数据级门禁 | F-mutation-005 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 25 | **P2-12** 来源层把 `unknown` 三态降级为 `false` 没有守卫 | F-mutation-006 · F-r2-plans-002 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | 三态 contract + Tooth Test · T14 | 修复：T14 —— 三态契约 + restrictionWitnessProblems + m1/m2/m3/m4 四组变异； 存在性：T02 §1 #25 validatePlan 0 错误、来源层改后五门禁全 0 |
| 26 | **P2-13** v1.4「单条记录事件上限」是死代码 | F-r1-history-ai-003 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 27 | **P2-14** `--out` 没有路径白名单，可把 AI 候选信封直接写进生产文件 | F-r1-history-ai-004 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | allowlist + 候选信封进真值必须红 · T15 | 修复：T15 —— 落点白名单 assertAiOutputPath（硬拒 12 份真值；.ai-cache/** 与 research/** 之外一律 exit 1）； 存在性：T02 §1 #14 任意路径 exit 0（审计 [RX-U]） |
| 28 | **P2-15** `headless_unavailable` 在真实接线路径不可达 | F-r1-identity-002 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **FIXED** | 接线与判定顺序修复 · T11 已完成 | 修复：T11 —— headless_unavailable 真实可达；三处（Summary/source-health/status）一致； 存在性：T02 §1 #15/T02 §1 #21/T02 §1 #22 接线 8 组合命中 0 次 |
| 29 | **P2-16** 声明为「推断」的字段页面写成「官方页面明写」 | F-r1-identity-003 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **FIXED** | 推断措辞与 derived 联动 · T09 已完成 | 修复：T09 —— inferred 措辞与 derived 联动； 存在性：T02 §1 #16 inferred 28 处（24 处 basis=source） |
| 30 | **P2-17** v1.0 Step1/Step2 过程交付物缺失 | F-r1-residual-001 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **DOC_FIXED** | 按 §13.3 指定措辞如实登记，不补历史文档 | 存在性：T02 §1 #30/T02 §1 #31/T02 §1 #32 |
| 31 | **P2-18** 「最近 7 天确认率」完全没有实现 | F-r1-residual-002 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **NOT_REQUIRED** | 不改 /status/、不新增指标出口；报告如实写「仍属未实现」 | 存在性：T02 §1 #33 |
| 32 | **P2-19** 维护页面只承载 §14 指标集里的 2 项 | F-r1-residual-003 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **NOT_REQUIRED** | 同上 | 存在性：T02 §1 #35 |
| 33 | **P2-20** 「全仓没有单位换算代码」的静态扫描只覆盖一个文件 | F-r2-api-006 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **GUARDRAIL_ADDED** | 并入 T13（与 P1-7/P1-8/P1-9/P1-10、P3-34 同组）：检测面扩到真实代码面，或改成结构性断言（单位必须原样从数据字段传到 formatter）；附「非显眼文件引入换算路径必须红」的变异证明 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据）； T13 契约第 10 条验收（captain 已派给 provenance-pricing-engineer）；T20 变异电池里单位类用例（AM3 / C1 形态）作为对照 |
| 34 | **P2-21** Coding 名义单价 `UNIT_PER=1e8` 与 API `per_1M` 相差 100 倍且无交叉门禁 | F-r2-api-007 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **DESIGN_ACCEPTED** | 两处口径交叉说明 + 标签明确；不做换算/统一 | 存在性：T02 §1 #39（子声明 [RX-U]） |
| 35 | **P2-22** `limits`（RPM/TPM/RPD/TPD/并发）被采集进数据但页面完全不呈现 | F-r2-api-008 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DESIGN_ACCEPTED** | 保持不展示；不再加列（拒绝审计「加列」建议） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 36 | **P2-23** `savings`（活动节省金额）在生产数据上永远不出现 | F-r2-plans-001 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 37 | **P2-24** `deal-plan-links` 的「已结束关系」只在非 strict 路径报警告 | F-r2-plans-005 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **VERIFIED_NO_CHANGE** | 临时夹具验证 strict 路径是否红；正常则 VERIFIED_NO_CHANGE，失败且属本轮 → 修 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 38 | **P2-25** Dataset Manifest 只有方向 1 有牙，「新数据集必须登记」无扫描 | F-v3-export-001 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | 方向 2 扫描 · T16 | 修复：T16 —— PUBLIC_DATASETS 唯一注册表 + 方向 2 全树认领扫描；新增未登记数据集必须红； 存在性：T02 §1 #26 未登记 source-health.json |
| 39 | **P2-26** 共享 `dist/` 无并发保护，自测在产物缺失时静默跳过并计通过 | F-v3-pages-001 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | 无 --allow-missing-dist 时跳过计失败 · T17 | 修复：T17 —— 六个产物依赖工具缺 dist 即非 0（6/6 实测）；--allow-missing-dist 才跳过； 存在性：T02 §1 #27 无 dist 27/60/38/50 与有 dist 32/61/40/50 全 exit 0 |
| 40 | **P2-27** CHK §10.4「区分漏映射与已判断不该映射」只在套餐（Coding）侧成立 | F-v3-registry-003 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | API 侧补平行处置登记 · 与 T05 同批 | 修复：T05 —— API 与 Coding 两侧同一完整性原则； 存在性：T02 §1 #28 删 API 映射 check 0 / validate 0 |
| 41 | **P2-28** 手写来源层的重复顶层 slug 键无任何守卫 | F-v3-registry-004 | P2 | `1c024db` | STILL_PRESENT（T02 已复现） | **GUARDRAIL_ADDED** | load() 原文级重复键扫描（三份来源层） | 修复：T05 —— 手写 registry 重复顶层键扫描（T18 独立复核四个入口全红）； 存在性：T02 §1 #29 重复顶层键 → 四门禁全 0 |
| 42 | **P2-29** `FORBIDDEN_CLAIM_WORDS` 缺 `推荐` 与 `最值得` 两个点名词 | F-v3-registry-005 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED；若后续做，1 行加词 + 剥注释断言 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 43 | **P2-30** 三条变化日志在生产数据上从未产生任何非 created 事件 | F-integration-001 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **VERIFIED_NO_CHANGE** | 临时夹具证明三份日志语义；禁伪造生产事件（T07/T08 夹具） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 44 | **P2-31** `MASTER_ACCEPTANCE_MATRIX.md` 混入 23 条非 A/B/C 来源行，且至少 2 条双重计数 | F-verify-x-001 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 由 T21/T23 独立复核口径；最终报告按「883+23」如实写明 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 45 | **P2-32** 门禁「步骤体不可见」盲点量化：任何字符串型新断言必须先剥注释 | F-verify-x-004 | P2 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **GUARDRAIL_ADDED** | 作为 P1-2/T17 的实现约束执行 + 记录证据强度 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 46 | **P3-1** 门禁文件硬编码注释已与生产脱钩 | F-gate-010 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 注释与命令输出对齐（§22 批次） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 47 | **P3-2** `verify-site.js` 回归比对的自陈与判据互相矛盾 | F-gate-011 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 自陈与判据同源；若需改检测语义则升级 GUARDRAIL | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 48 | **P3-3** 门禁外的确定性 AI 回归工装 | F-gate-012 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **NOT_REQUIRED** | 本轮不做；报告如实标注为已知缺口 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 49 | **P3-4** `/feeds/` 汇总页漏列 5 个分类 Feed（10 个文件） | F-r1-ui-001 | P3 | `1c024db` | STILL_PRESENT（T02 已复现） | **FIXED** | Registry 单一来源 + 双向断言 · T12 | 修复：T12 —— /feeds/ 以 Feed Registry 为唯一来源 + 双向断言；列出地址 38→48（含 category-* 10）； 存在性：T02 §1 #18 漏列 10 个文件 |
| 50 | **P3-5** Prompt 点名的 `/feed/api.xml`、`/feed/coding.xml` 不存在 | F-r1-ui-002 | P3 | `1c024db` | STILL_PRESENT（T02 已复现） | **NOT_REQUIRED** | 只做「推荐路径 → 实际路径」文档对照（free-api / ai-coding） | 存在性：T02 §1 #19/T02 §1 #20 |
| 51 | **P3-6** 两份可索引页与 noindex 页共享同一 `<title>` | F-r1-ui-003 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED（如需改判为 DOC） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 52 | **P3-7** 发布链 `prepublish` job 没跑 `check-ci-consistency.js` | F-r1-ui-004 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 53 | **P3-8** v1.7 推荐路径与 v1.2 IA 的路由漂移 | F-r1-ui-005 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **NOT_REQUIRED** | 不新增 /category/coding/ 等页面；文档给对照 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 54 | **P3-9** 变化类 Feed 在生产数据下必然为空 | F-r1-ui-006 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **VERIFIED_NO_CHANGE** | 夹具验证空态与非空态渲染；正常则不改，失败按 Blocker/Guardrail 处置 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 55 | **P3-10** 三次构建指纹常量不可独立复现 | F-r1-ui-007 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 先独立复现指纹；可复现则 DOC_FIXED，不可复现则改述为可复跑命令 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 56 | **P3-11** 同一条记录两个互相冲突的「来源 URL」 | F-r1-identity-004 | P3 | `1c024db` | STILL_PRESENT（T02 已复现） | **FIXED** | 字段语义厘清 + official-domain 验证 · T09 已处理页面侧 | 修复：T09 —— 四个 URL 角色语义厘清 + official-domain 验证； 存在性：T02 §1 #17 6 条 id 完全一致 |
| 57 | **P3-12** 「首次发现时间」在 121/134 条上等于历史层起算日 | F-r1-identity-005 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DESIGN_ACCEPTED** | 文档/页面如实标注 baseline 起算语义；不改数据 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 58 | **P3-13** 来源失败只在 `/status/` 与 CI 日志可见 | F-r1-identity-006 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **NOT_REQUIRED** | 本轮不做；报告如实标注 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 59 | **P3-14** 事件身份/确定性序列化的 selftest 缺口 | F-r1-history-ai-006 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **VERIFIED_NO_CHANGE** | 夹具验证事件身份稳定性；缺口若影响 §27 C/D 则并入 T07/T08 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 60 | **P3-15** 变化 Feed GUID 形态/分栏完整性的 selftest 缺口 | F-r1-history-ai-007 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **VERIFIED_NO_CHANGE** | 夹具验证 GUID 与分栏；与 §13.8（不统一形式）并存 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 61 | **P3-16** 被跟踪的数组字段顺序敏感 | F-r1-history-ai-008 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **VERIFIED_NO_CHANGE** | 夹具验证顺序不变性；异常则修规范化 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 62 | **P3-17** 正文 `discountInfo` 微调在数据层留事件 | F-r1-history-ai-009 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DESIGN_ACCEPTED** | 把「什么算有效变化」写进 schema/文档；不改事件模型 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 63 | **P3-18** §14 指标集没有统一出口也没有断言守护 | F-r1-residual-004 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **NOT_REQUIRED** | 本轮不做；报告如实标注未实现 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 64 | **P3-19** 「官方来源覆盖率」缺位 | F-r1-residual-005 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **NOT_REQUIRED** | 本轮不做 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 65 | **P3-20** 「失效优惠发现时间」只有记录级字段、无聚合指标 | F-r1-residual-006 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **NOT_REQUIRED** | 本轮不做 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 66 | **P3-21** PROC-004「Prompt 与代码冲突」在仓库内没有可核对的登记 | F-r1-residual-007 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 按指定措辞登记「冲突：无 / historical evidence unavailable」 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 67 | **P3-22** 门禁规模与文档不一致 | F-online-001 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 数字改为引用命令输出/实时生成（§22） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 68 | **P3-23** 映射条数 63/64 并存 | F-online-002 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 以现算为准（当前 64） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 69 | **P3-24** README 厂商图形数对不上命令输出 | F-online-003 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 数字现算 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 70 | **P3-25** v3.0 报告把 plans 平台数写成 17 | F-online-004 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 旧报告标注口径 / 改述为可复跑命令 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 71 | **P3-26** `PROJECT_STATUS.md` 的 v2.5 历史段以「现在」口径列旧数字 | F-online-005 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 历史段加时间限定 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 72 | **P3-27** `NEXT-STEPS.md` 的「未映射 11 条」已不存在 | F-online-006 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 改为现算或删除 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 73 | **P3-28** 线上 `/data-index.json` 与 `/model-registry-gaps.json` 两条 404 属命名易踩坑 | F-online-007 · F-verify-x-005 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 线上复核或文档说明；不新增路由（§26） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 74 | **P3-29** 4 条 Deals 的官方出处当前读不到所述活动 | F-online-008 | P3 | `1c024db` | STILL_PRESENT（T02 已复现） | **VERIFIED_NO_CHANGE** | T04 执行中；只有足够官方证据才改 active/ended 与 evidence | 存在性：T02 §1 #38 审计 UNVERIFIED |
| 75 | **P3-30** 完成报告断言计数与当前仓库不一致 | F-r2-plans-003 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 计数改为引用命令输出 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 76 | **P3-31** `P2.3-ENDED-002` 点名的 4 个消失判据只用了 2 个 | F-r2-plans-004 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 夹具验证消失判定；不足则登记后续 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 77 | **P3-32** P2.5 无独立完成报告 | F-r2-api-009 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 决定「补文件」或「改述为可复跑命令」（倾向后者，§22） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 78 | **P3-33** 疑似改名留档有 20 条上限，且「改名同时改价」如实漏检 | F-r2-api-010 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 79 | **P3-34** 单位标签/币种符号/价格格式化在浏览器门禁里有第三份手写副本 | F-r2-api-011 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **GUARDRAIL_ADDED** | 单位标签第三份副本收敛或与权威一致 · T13 | 修复：T13 —— 第三份手写单位副本收敛（行为不变）； 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 80 | **P3-35** Data Docs 引用示例把具体事实写成代码常量 | F-v3-export-003 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 示例改为引用现算值 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 81 | **P3-36** 文档 JS 示例标注「Node 18+」但用顶层 await | F-v3-export-004 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 版本标注与 engines 对齐 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 82 | **P3-37** deal 变化 Feed 的 `chg:` GUID 方案零数据检验 | F-v3-export-005 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **VERIFIED_NO_CHANGE** | 夹具验证 chg: GUID 稳定性；生产 events=0 不得伪造 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 83 | **P3-38** `/vendor/` 体系不覆盖 4 家 provider | F-v3-pages-002 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **NOT_REQUIRED** | 本轮不做；报告如实标注 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 84 | **P3-39** Archive 只有 3 个 kind，缺「Model Price」独立分组 | F-v3-pages-003 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **NOT_REQUIRED** | 本轮不做；报告如实标注 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 85 | **P3-40** `coverage-report.js` 汇总自相矛盾 | F-v3-pages-004 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 汇总口径与现算一致（改文案/汇总逻辑，不改数据） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 86 | **P3-41** 「官方来源」没有机器门禁 | F-v3-pages-005 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **GUARDRAIL_ADDED** | official-domain 机器验证（与 P3-11 同族）；若 T09 未实现则登记后续 | 修复：T09/T13 —— §7.2 的 official-domain 机器验证（evidence 声称 official ⇒ 域必须登记）； 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 87 | **P3-42** `/plans/` 同页并存两个日期语义 | F-v3-pages-006 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DESIGN_ACCEPTED** | 页面/文档写清两个日期各自含义；不合并 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 88 | **P3-43** `models-selftest` 牙 #21 硬编码数据字面套餐名导致崩溃式失败 | F-v3-registry-006 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 本轮不做 → 终版 DEFERRED | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 89 | **P3-44** A1 身份层台账数字陈旧 6 条 | F-v3-residual-001 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 数字现算 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 90 | **P3-45** v3.0 报告引用的门禁逐字日志不存在 | F-v3-residual-002 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 先确认能否重建；否则按 §22 改述为可复跑命令（DOC_FIXED） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 91 | **P3-46** v3.0 最终报告缺三项验收统计 | F-v3-residual-004 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DOC_FIXED** | 补统计或改述为可复跑命令 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 92 | **P3-47** 发布授权在仓库内无留痕 | F-v3-residual-005 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **NOT_REQUIRED** | 本轮不做；报告如实标注（审计亦标注其性质不可判定） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 93 | **P3-48** `plans.json`/`api-plans.json` 不在每日采集工作流里 | F-integration-002 | P3 | `1c024db` | STILL_PRESENT（T02 已复现） | **DESIGN_ACCEPTED** | 文档写明按需人工重建；契约未破（updatedAt 口径成立） | 存在性：T02 §1 #36 |
| 94 | **P3-49** `updatedAt` 同名异义 | F-integration-003 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DESIGN_ACCEPTED** | 文档写清两种形态；不改字段名（破坏性） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 95 | **P3-50** 同一产品内两套 Feed GUID 方案并存 | F-integration-004 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DESIGN_ACCEPTED** | 不做统一；由 §11 夹具证明各自稳定性 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 96 | **P3-51** Coding 名义单价口径 `1e8` 与 API `per_1M` 并存 | F-integration-005 | P3 | `1c024db` | STILL_PRESENT（T02 已复现） | **DESIGN_ACCEPTED** | 交叉说明；不做统一 | 存在性：T02 §1 #37 UNIT_PER=1e8 vs per_1M |
| 97 | **P3-52** 事件身份 basis 在 deals 与 plans 之间已分叉 | F-integration-006 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DESIGN_ACCEPTED** | 不做统一；由夹具证明稳定性 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 98 | **P3-53** 引文保真：46 条拼接式 + 3 条超短拼接 + 6 条行号偏移 | F-verify-x-002 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 不改审计工件；最终报告标注引文保真的已知限制 | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |
| 99 | **P3-54** 3 条原则性/负向要求未见逐字对应的矩阵行 | F-verify-x-003 | P3 | `1c024db` | STILL_PRESENT（审计基线；T02 未逐条复现） | **DEFERRED** | 不改审计工件；最终报告如实标注（不据此宣称 requirement 缺失） | 存在性：T02 未覆盖（按审计基线 + 本轮任务证据） |

---

## 3. 逐类说明与证据来源

| 类 | 条数 | 主要证据 |
|---|---|---|
| `FIXED` | **10** | T05（P0-1）· T06（P1-12）· T07/T08（P1-4/P1-5）· T09（P1-6/P2-16/P3-11）· T10（P1-11）· T11（P2-15）· T12（P3-4）；T18 独立复核 verdict=pass；T20 21 例变异无 NOT_CAUGHT/REGRESSION |
| `GUARDRAIL_ADDED` | **19** | T13（§10.1–10.3 + P2-20 + P3-34）· T14（§10.4）· T15（§10.5）· T16（§10.7）· T17（§10.8/10.9 + §13.10 语义检查）· T05（§10.6）；每项都有「变异必须红 / 恢复必须绿」的证据 |
| `VERIFIED_NO_CHANGE` | **8** | §11 零样本项由 T07/T08 的非空夹具与 T20 变异覆盖验证，生产数据**不改**（口径见 §11：测试正确则记 `FIXTURE_VERIFIED`） |
| `DESIGN_ACCEPTED` | **10** | §13.5（单位口径不统一）· §13.6（limits 可存不展示）· §13.7（不强制入每日 collect）· §13.8/§13.9（GUID / event basis 不统一）+ 既有语义口径（baseline 起算、事件粒度、日期语义、updatedAt 同名异义） |
| `NOT_REQUIRED` | **12** | §13.1（两条推荐 Feed）· §13.2（v1.7 推荐静态页）· §13.4（长期指标 3 条）· §26（新页面族/新 Dashboard/新工装/新可见性/新流程留痕） |
| `DOC_FIXED` | **18** | 本轮 T21 的 §22 文档同步（§7 列出改动清单与每处重算来源） |
| `DEFERRED` | **22** | §10 未选中的非 MUST 项 + 证据不足项 + 审计工件口径项（`research/audit/**` 冻结，不改） |

**其他两类为 0**：`ALREADY_FIXED`（本轮起点没有在 `21cf66d5` 上已消失的条目 —— T02 46/46 全 `STILL_PRESENT`，其余按审计基线登记）、
`NO_LONGER_APPLICABLE`（没有条目因产品/数据演进失去意义；曾经的「未映射 11 条」属**数字漂移**，已按 `DEFERRED`/`DOC_FIXED` 处理）。

---

## 4. draft 的 37 条 ⚑ 收敛表（终版不再有未决项）

| # | 条目 | draft 的 ⚑ 原因 | 终版收敛 | 结论 |
|---|---|---|---|---|
| 1 | **P2-1** 「带外项数」与看门狗并非互相独立 | 审计自认 UNVERIFIED/[RX-U] | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 2 | **P2-2** 可重建性门禁与生产共用同一函数 | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 3 | **P2-3** 回归基线可自刷，且无断言阻止同 PR 放宽 | 审计自认 UNVERIFIED/[RX-U] | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 4 | **P2-4** `models-selftest.js` 把生产数量 44 写死进断言 | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 5 | **P2-5** 预渲染卡片下限被下调 60→45，净余量 5 张 | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 6 | **P2-6** 门禁登记制只覆盖 `selftest:` 前缀 | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 7 | **P2-7** 静态文本型断言对重构敏感、对换实现迟钝 | 依赖 §13/§26 边界或 captain 判断 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 8 | **P2-8** `validate.js` 全部 `warn()` 不改退出码，含「页面照常、线上坏」的 invariant | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 9 | **P2-11** 熔断只有离线自测，没有生产数据级门禁 | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 10 | **P2-13** v1.4「单条记录事件上限」是死代码 | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 11 | **P2-20** 「全仓没有单位换算代码」的静态扫描只覆盖一个文件 | 依赖 §13/§26 边界或 captain 判断 | **GUARDRAIL_ADDED** | 已并入本轮 Guardrail 任务（见 action 列） |
| 12 | **P2-21** Coding 名义单价 `UNIT_PER=1e8` 与 API `per_1M` 相差 100 倍且无交叉门禁 | 依赖 §13/§26 边界或 captain 判断 | **DESIGN_ACCEPTED** | 按 §13.5–13.9 接受既有设计，不做统一 |
| 13 | **P2-23** `savings`（活动节省金额）在生产数据上永远不出现 | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 14 | **P2-24** `deal-plan-links` 的「已结束关系」只在非 strict 路径报警告 | 审计自认 UNVERIFIED/[RX-U] | **VERIFIED_NO_CHANGE** | 已用夹具/独立脚本验证，生产不改（§11 口径） |
| 15 | **P2-29** `FORBIDDEN_CLAIM_WORDS` 缺 `推荐` 与 `最值得` 两个点名词 | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 16 | **P2-31** `MASTER_ACCEPTANCE_MATRIX.md` 混入 23 条非 A/B/C 来源行，且至少 2 条双重计数 | 依赖 §13/§26 边界或 captain 判断 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 17 | **P2-32** 门禁「步骤体不可见」盲点量化：任何字符串型新断言必须先剥注释 | 依赖 §13/§26 边界或 captain 判断 | **GUARDRAIL_ADDED** | 已并入本轮 Guardrail 任务（见 action 列） |
| 18 | **P3-2** `verify-site.js` 回归比对的自陈与判据互相矛盾 | 审计自认 UNVERIFIED/[RX-U] | **DOC_FIXED** | 已按 §22 修文档（本轮 T21） |
| 19 | **P3-3** 门禁外的确定性 AI 回归工装 | 依赖 §13/§26 边界或 captain 判断 | **NOT_REQUIRED** | 按 §13/§26 明确不做；如实登记为未实现/已知缺口 |
| 20 | **P3-6** 两份可索引页与 noindex 页共享同一 `<title>` | 依赖 §13/§26 边界或 captain 判断 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 21 | **P3-7** 发布链 `prepublish` job 没跑 `check-ci-consistency.js` | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 22 | **P3-10** 三次构建指纹常量不可独立复现 | §11/§12 零样本或证据不足 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 23 | **P3-13** 来源失败只在 `/status/` 与 CI 日志可见 | 依赖 §13/§26 边界或 captain 判断 | **NOT_REQUIRED** | 按 §13/§26 明确不做；如实登记为未实现/已知缺口 |
| 24 | **P3-18** §14 指标集没有统一出口也没有断言守护 | 依赖 §13/§26 边界或 captain 判断 | **NOT_REQUIRED** | 按 §13/§26 明确不做；如实登记为未实现/已知缺口 |
| 25 | **P3-19** 「官方来源覆盖率」缺位 | 依赖 §13/§26 边界或 captain 判断 | **NOT_REQUIRED** | 按 §13/§26 明确不做；如实登记为未实现/已知缺口 |
| 26 | **P3-20** 「失效优惠发现时间」只有记录级字段、无聚合指标 | 依赖 §13/§26 边界或 captain 判断 | **NOT_REQUIRED** | 按 §13/§26 明确不做；如实登记为未实现/已知缺口 |
| 27 | **P3-28** 线上 `/data-index.json` 与 `/model-registry-gaps.json` 两条 404 属 | 依赖 §13/§26 边界或 captain 判断 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 28 | **P3-33** 疑似改名留档有 20 条上限，且「改名同时改价」如实漏检 | 审计自认 UNVERIFIED/[RX-U] | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 29 | **P3-38** `/vendor/` 体系不覆盖 4 家 provider | 依赖 §13/§26 边界或 captain 判断 | **NOT_REQUIRED** | 按 §13/§26 明确不做；如实登记为未实现/已知缺口 |
| 30 | **P3-39** Archive 只有 3 个 kind，缺「Model Price」独立分组 | 依赖 §13/§26 边界或 captain 判断 | **NOT_REQUIRED** | 按 §13/§26 明确不做；如实登记为未实现/已知缺口 |
| 31 | **P3-41** 「官方来源」没有机器门禁 | §10 未选中的非 MUST 项 | **GUARDRAIL_ADDED** | 已并入本轮 Guardrail 任务（见 action 列） |
| 32 | **P3-43** `models-selftest` 牙 #21 硬编码数据字面套餐名导致崩溃式失败 | §10 未选中的非 MUST 项 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 33 | **P3-45** v3.0 报告引用的门禁逐字日志不存在 | §11/§12 零样本或证据不足 | **DOC_FIXED** | 已按 §22 修文档（本轮 T21） |
| 34 | **P3-47** 发布授权在仓库内无留痕 | 依赖 §13/§26 边界或 captain 判断 | **NOT_REQUIRED** | 按 §13/§26 明确不做；如实登记为未实现/已知缺口 |
| 35 | **P3-51** Coding 名义单价口径 `1e8` 与 API `per_1M` 并存 | 依赖 §13/§26 边界或 captain 判断 | **DESIGN_ACCEPTED** | 按 §13.5–13.9 接受既有设计，不做统一 |
| 36 | **P3-53** 引文保真：46 条拼接式 + 3 条超短拼接 + 6 条行号偏移 | 依赖 §13/§26 边界或 captain 判断 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |
| 37 | **P3-54** 3 条原则性/负向要求未见逐字对应的矩阵行 | 依赖 §13/§26 边界或 captain 判断 | **DEFERRED** | 登记后续（本轮不做）：理由见 action 列；不得写成已完成或已失效 |

---

## 5. 已接受残留（DOCUMENTED，不作为缺陷重复登记）

1. **N1（T20 变异电池）：直接篡改已落盘的 `scripts/data/source-health.json` + `dist/source-health.json`（标成 healthy）时 28 道门禁 0 红。**
   **裁定：DOCUMENTED（接受）**。理由：`source-health.json` 是 `/status/` 的**运维观测产物、非真值层**；判定链本身有守卫
   （health.js `evaluate()` + `health-selftest` 的合成夹具，M16 的代码形态被 7 项红抓住），缺的是「落盘观测产物与采集事实的交叉对账」。
   本轮**不为它新增断言**（§26 禁止顺手开发）；如需，属后续「采集事实 ↔ 观测产物」交叉校验的独立议题。
2. **F-T20-1（P3）：`archive-selftest` 5 项 / `feeds-selftest` 1 项「空态牙」在非空历史现场失真。**
   **裁定：DOCUMENTED（接受）**。理由：这些牙只在**合成非空现场**失真，产品链（build / verify-site / 页面）全绿；
   真正的非空路径由 T07/T08 的端到端夹具与 T20 的 M03/M04 用例覆盖。
3. **N2（模型详情页逐格数值错位）：已由 T25 关闭（完成态，2026-10-04）。**
   - 唯一 tracked 改动 = `scripts/tools/models-page-selftest.js`：新增第 ⑨ 节「逐格数值对账」——
     期望值**自行**从 `api-plans.json` + `scripts/data/model-registry-links.json` 按 `(apiPlanId, modelKey, 记录内真实 variant)`
     展开（§17 同口径），实际值逐格读产物页；**一个 models-page 计算函数都不用**（该禁令已机器化：
     ⑨ 段源码出现 `apiPricingRowOf` / `modelReferencesOf` / `apiTargetsOf` / `modelPageGate` 即红）。
   - 覆盖 **44 页 · 67 条计价条目 · 536 个格全对**，0 豁免；自测项数 **61 → 75 项 0 失败**（默认 `dist/` 与 `--dir=` 两条路径都 75/0）。
   - 变异证明（三条，均 exit 1 且**点名到格**）：A 渲染层 input↔output 对调 → `claude-fable-5.1 (…, standard)`「输入价」渲染 $50、应为 $10（6 红）；
     B cache 格置空 → `glm-4.5v (…, long_context)`「Cache 价」渲染 `""`、应为 `"—"`；
     C **M19 原形**（产物层 glm-4.5v 两行×三格互换）→ 4 条点名，如 `(646f01c662e6, glm-4.5v, long_context)` 输入 ¥2 vs ¥4、输出 ¥6 vs ¥12。
   - **「洞确实存在」的证据保留**：同一 M19 形状下 `validate --strict` / `check-models-reproducible` / `models-selftest` /
     `check-model-registry-links` / `coverage-report` **全 exit 0**，只有 `models-page-selftest` 红 —— 这正是原 N2 的形态；
     三次恢复均 byte-exact。五份数据与开工逐字节 SAME（deals `3ba148db` / plans `a72c91ef` / api-plans `19cd8af7` / models `8fa85b1d` / links `fd2336c8`）。
4. **T20 方法论提示（保留，供 T23 复用）**：
   - 装配口径：拿 T07 时代的旧副本当基底会产生**跨版本假红**（T20 的 M03/M04 曾出现 4 道假红，已归因）；
     变异必须基于**当前 HEAD 的完整副本**。
   - `ai-selftest` 的**牙5c 在「validate 本来就红」时属连带噪音**；判断 AI 隔离是否被削弱只看**牙7/8/9**。

---

## 6. 复现命令

```bash
# 1) 当前数字重算（只读 + 读隔离构建产物）
node .qc-t21/recompute.mjs          # §0.2 的主表
node .qc-t21/counts2.mjs            # ai/zh selftest 项数、/feeds/ 链接与 feed 文件明细
node scripts/tools/build-local.js --out=dist.qc-docs   # 产物层数字的来源（exit 0，自检全过）

# 2) 门禁与校验
node scripts/tools/check-ci-consistency.js --expect-checks=36   # 36 项 · 失败 0
node scripts/validate.js --strict                               # exit 0

# 3) 99 条分类的自证
node .qc-t03/extract-canonical.mjs  # total=99 · {P0:1,P1:12,P2:32,P3:54} · totalIds=104
node .qc-t21/build-final.mjs        # 九类计数（合计 99）+ 终版表 + 收敛表
```

---

## 7. T21 的 §22 文档同步清单（每处旧 → 新的重算来源）

| 文件 | 改动 | 旧 → 新 | 重算来源 |
|---|---|---|---|
| `docs/SCHEMA-v3.0.md` §2 | 「API 侧映射不上是**允许**的」→ 两侧都必须有结局（API 侧未认领即硬失败） | 口径反转（**只改文档，不削弱代码**） | `scripts/tools/check-model-registry-links.js` ③（T05 后行为）+ §10.6 |
| `docs/SCHEMA-v3.0.md` §2 | `basis` 示例 `api`/`coding` → 真实枚举 4 值；补 `evidence` 行 | 示例与枚举不符 → 一致 | `scripts/lib/model-registry.js` 的 `LINK_BASIS` |
| `docs/SCHEMA-v3.0.md` §2 | 补「覆盖报告按**展开条目**记账」说明 | 缺口 3 是「允许」→「必须处理」 | `scripts/tools/coverage-report.js` L18–20 |
| `docs/SCHEMA-v3.0.md` §10（新） | 新增「质量收口后的硬约束」①–⑨ + 现行数字块 | 新增 | §0.2 重算表 |
| `docs/SCHEMA-v2.5.md` §8 | freeTier「只装稳定长期」→ **三档 `stability` 必填** + 三态纪律 + 现行 4 条 | 旧口径 → 现行契约 | `api-plan-schema.js` 的 `FREE_TIER_STABILITY` / `FREE_TIER_CONVERSION_TRISTATE` |
| `docs/AI-MAINTENANCE-v2.0.md` §7 | 新增「七之二 落点白名单与 accept 三条件」 | 新增（旧版无任何路径校验） | `cache.js` `assertAiOutputPath` + `candidates.js` `acceptedOf` |
| `docs/v3.0/AGENT-REFERENCE.md` | 顶部加时效声明；`/feeds/` 分组表「硬编码」→ 注册表派生（+48 地址）；`freeTier` 2 条 → 4 条；api-plans 7/37/22/5 → 13/67/45/10 | 多处过期 → 现行 | §0.2 重算表 + T12 实现 |
| `docs/v3.0/A4-HANDOFF-feed-pipeline.md` | 顶部加「历史交接快照」声明；③ 与状态表两处标【已过期】 | 会被当现状读 → 明确历史 | T12 实现 |
| `PROJECT_STATUS.md` | 数据/Feed/门禁三行加 2026-10-04 重算值（映射 63→64 等）；`freeTier` 2 条 → 4 条 | 63→**64** · 25→**24 份/48 文件** · 42→**44（grep 口径）** · 2→**4** | §0.2 重算表 |
| `README.md` | v3.0 快照行里订阅 25 份（×2=50）→ **24 份（×2=48）**；补「端点命名易踩坑」（P3-28：真实地址 `/data/index.json`；`model-registry-gaps.json` 有意不发布） | 25/50 → 24/48；新增说明（**不新增页面/路由**） | §0.2 重算表 |
| `NEXT-STEPS.md` | 新增「2026-10-04 当前状态 + 四条剩余风险」（anthropic 迁移 / tencent TokenHub / 术语残留 / 引文预算上限）；「未映射 11 条」→ 未判 0 条 | 新增 + 11 → 0 | §0.2 重算表 + T04 来源回访 |
| `research/v3.0-ai-deals-knowledge-base-report.md` | §20 问答③：freeTier「只在 google 与 zhipu」→ **4 条**（standing 2 + new_user 2） | 2 → 4 | §0.2 重算表 |

**历史快照纪律（§24 E）**：`PROJECT_STATUS.md` 的 v1.x/v2.x/v3.0 段落、`NEXT-STEPS.md` 的历史轮次块、
`docs/v3.0/A4-HANDOFF-feed-pipeline.md`、`research/v3.0-*` 报告，**都保留当时数字**并已就地标注时间/口径；
只有**明确标为当前状态**的位置改为现行值。`research/audit/**` 一个字节未改（审计工件冻结）。
