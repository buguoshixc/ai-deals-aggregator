# sources-residue-v1 —— 自审

- 任务：**t8 / sources-residue-v1**（attempt 1）；复核日 **2026-10-08**
- 工作树：`.worktrees/sources-residue-v1`（从 `origin/master` `4b366d2` 开出；提交前 `git reset --hard` 到 `origin/master` = `95dfeb9`，并重建产物、重跑读数）
- 对照件：`research/sources-residue-v1-report.md`（结论）、`research/_raw/sources-residue-v1/`（读数与原件）

自审只回答三件事：**我可能错在哪**、**我有没有越界**、**验收标准逐条对不对得上**。

---

## 1. 我可能错在哪（按「最可能骗到自己」的顺序）

| # | 风险 | 我做了什么来限制它 | 残余风险（如实留） |
|---|---|---|---|
| S1 | **把「页面不同」说成「价格变了」** | 报告全程只写「不一致 / 未证实」，明写**不得**写成价格已变化；不一致只登记为待核 | 若 captain 转述时压缩成「价格变了」，那是转述失真，不是本报告的结论 |
| S2 | **自己复制了一份判据助手，口径漂移** | `measure-citation-budget.js` 直接 `require` 库里的 `quoteIndexOfNumber` / `parseEvidenceBinding` / `TOKEN_RATE_KEYS`；只有未导出的 `stripModelNames` 是照抄的 | 照抄的那一段若与库里版本分家，40/39 会偏；脚本里逐字注明了它是照抄，且与 `api-plan-schema.js:937-961` 逐行对照过 |
| S3 | **「模型级绑定」定义与 captain 当年不同** | 定义写死在报告 §5.1（`kind==='model' && !variant`），并给出可复跑脚本与 JSON 读数 | 当年那份「26 条」的分母口径没有留下脚本，因此**不能**断言「26 一定等于今天同口径下的某个数」；报告只写「增长到 40」并把差异原因归为新增记录（24 条记录 / 59 条引文这个规模本身在当年不存在） |
| S4 | **术语扫描漏范围** | 扫描器写死「`git ls-files` + 本机 `dist/`」，并显式排除本轮自己的产物；未跟踪的 `research/audit/**` 单独列出、不与主数合并 | 若仓库里存在**未跟踪且我没看到**的目录（我只查了 `git status` 报出来的 `??` 项），它们不计入；`research/_raw/**/*.txt/.log/.cjs` 里的旧 dump 是按扩展名扫的（能扫到 `.txt`，但若某个 dump 用了别的扩展名又被忽略规则挡住，会漏） |
| S5 | **产物读数来自我自己构建的 dist** | 报告 §6.5 明说不是线上产物；产品面结论只依赖「措辞常量在 `dist/index.html`」与「档案详情页 0 个」两条，均可由构建日志与字节统计直接复核 | 与线上 `dist` 若存在版本差，`dist/**` 的**次数**（1 次）可能不同；但「0 处渲染」的结论由**数据**（71 条事件均为 created）+ 构建日志给出，不依赖线上产物 |
| S6 | **区域封锁的归因** | 报告只陈述「从本网络出口看是区域门」，并给出两种可能原因且明说**无法区分**；没有把「营销首页」说成错误 | 我无法排除「某些出口能看到完整详细定价页」；若 captain 有其它出口，Sonnet 5.5 那一格可以在那边定案 |
| S7 | **HTML → 可见文本的抽取会不会漏字** | 抽取脚本按「剥 script/style → 剥标签 → 逐行」做，窗口用页面自己的锚点串定位（找不到锚点直接抛错，不静默给空）；腾讯云那份还显式处理了 `Content-Encoding: gzip`（不带 `--compressed` 时是 gzip 字节流，直接当文本读会得到乱码） | 抽取是**文本节点顺序**，不是浏览器布局；表格单元格的顺序与视觉顺序在本页里一致（已人工核对），但这属于「读过一遍」的结论，不是机器判据 |
| S8 | **「活路径 3 处」漏了别处** | 计数来自全仓扫描（含 `dist/`），并逐条人工分类 | 「活路径」是我按「谁会渲染这个词」做的**分类判断**，不是机器判据；分类表逐处给了 file:line 供复核 |

---

## 2. 我有没有越界（逐条对照纪律）

| 纪律 | 实测 | 证据 |
|---|---|---|
| 隔离工作树 + `npm ci` 装在工作树里 | ✅ `.worktrees/sources-residue-v1`，`npm ci` 在树内跑（added 51 packages） | 未使用 junction；主工作区 `node_modules` 完好（本轮未动） |
| **只允许改 `officialUrl` 与 `officialDomains` 登记** | ✅ 实际上**两处都没改**（连允许的都保持原样） | `git status` 只有新增的 `research/**` 文件；`git diff --stat` 为空 |
| **不许改价格 / 既有引文及其 capturedAt、sourceUrl** | ✅ 0 字节 | 同上；唯一一次动数据是 §2.4 的影响面实测，读完后 `git checkout -- scripts/data/curated_api_plans.json`，并当场回读确认 `officialUrl` 已还原 |
| **不得写成「价格已变化」** | ✅ 全文只有「不一致 / 原因未证实」 | 报告 §2.3 与 §7 建议行 2 |
| 混元有任何不一致先报 captain 再动 | ✅ 没有不一致（6/6 + 免费额度），也没动数据 | 报告 §3 |
| 术语第二类非空先报 captain 再动 | ✅ 报的是 **C 类**那条陈旧括注（`official_urls.json:3`），未动 | 报告 §4.2 C 类 |
| `npm run check:evidence` 保持绿 | ✅ 见 §3 命令 1 | |
| Tier-1 证据落 `research/_raw/sources-residue-v1/` | ✅ `.md` / `.json` / `.js` 三类；第三方 HTML 与 `.headers.txt` / `.txt` **不入库** | `README.md` §1/§2 列了清单与 sha256；提交前 `git status` 复核过待提交文件集合 |
| 报告/自审落指定路径 | ✅ `research/sources-residue-v1-report.md`、`-self-audit.md` | |
| 不改 `docs/DESIGN-RULES.md` 与 `NEXT-STEPS.md`，只发建议行原文 | ✅ 两份文件 0 字节改动，建议行在报告 §7 | `git status` |
| 只走 PR，不自己合并 | ✅ 待 PR（`gh pr create --body-file=…`） | 见 §3 命令 3 |
| 外部网页只当数据 | ✅ 引用都给了可点击 URL；没有把页面文字当指令 | 报告里每条读数都带 URL |

**顺手记一条方法教训（不是本任务的交付内容，但对下一轮有用）**：本机 shell 是 **Windows PowerShell 5.1**，`Set-Content -Encoding UTF8` 会写 **BOM**、`Get-Content -Raw` 对无 BOM 的 UTF-8 会按本机代码页读。本轮因此**一度把一个证据脚本的中文注释写坏**（`build-evidence-extracts.js`），发现后按原文重写并 `node --check` 通过。结论：**改文本文件只用编辑工具或 Node `fs`，不要用 PowerShell 的读写往返**。

---

## 3. 验收标准逐条对照（含命令与实跑读数）

| 验收项 | 状态 | 证据 / 读数 |
|---|---|---|
| ① 有裁定 + 现场读数（URL / 原文片段） | ✅ | 报告 §2.1 五跳状态码与 `Location`（逐字响应头在 `anthropic-pricing-visible-lines.md` §1）；候选表 §2.2；对照表 §2.3（16 格可比：15 一致 / 1 不一致 / 4 不载） |
| ① 若提 URL 改动 → 带可 fetch 证据 + 声明「价格与引文 0 字节改动」 | ✅（**提了候选、没落地**） | 候选 `https://claude.com/pricing` 的 200 与可见价格行；规范形态要求（重建拒绝带锚点）；实测影响面 1 diff + 1 变化事件；报告 §2.5 的 0 字节声明 |
| ① 任何「无需改动」结论 → 给「残留仍然成立」的证据 | ✅ | 旧 URL 今天仍不是定价页：301 → 307 → 307（区域门）→ 301 → 200 的**原始响应头**（含 `CF-RAY` 与 `Date`） |
| ② 重新回访 + 公告原文/消失 + 价格是否一致 | ✅ | 公告逐字（`hunyuan-pricing-visible-lines.md` §1）；6/6 价格行 + 免费额度逐字（§2、§3）；页面自报更新时间 2026-06-26 10:56:00 |
| ③ 逐处计数 + file:line 清单 + 三分类裁定 | ✅ | 57 次 / 44 行 / 27 文件（分桶 40 / 16 / 1）+ 未跟踪的 7 次 / 6 行 / 3 文件；A 类表 / B 类两种口径 / C 类 2 处；机器可读清单 `term-residue-scan.json` |
| ④ 实测绑定数 + 越界表述扫描=0 | ✅ | 24 / 59 / 最多 3 / 模型级 40 / 顺序对 39（39 正序）/ 维度绑定 0 / 分母 308；越界 0 处（7 行全是否定句，已列 file:line） |
| 报告写清「我没能证明的东西」 | ✅ | 报告 §6（6 条，含区域封锁、没有浏览器、未做跨平台对账、`research/audit/**` 未跟踪、产物是自建、未跑 L4） |
| `check:evidence` 绿 | ✅ | 命令 1（读数见下） |

### 命令 1 —— `npm run check:evidence`（基线 `95dfeb9`，退出码 0）

```text
证据政策门禁（Tier-3 拦截）· 基线 e0ca04a · 已跟踪 2612 个文件 · 其中 Tier-3 类别 1283 个
grandfather（基线时就已跟踪，按政策保留、不报错）：
  ·  788  抓下来的正文/中间 dump   ·  196  完整日志   ·  299  一次性探针脚本   ·  0  临时 scratch 目录
  合计 1283 个（见 docs/EVIDENCE-POLICY.md §5）
✅ 没有新增的 Tier-3 文件（1283 个已跟踪的全部在清单内）
✅ 清单自证通过：与基线 e0ca04a 的 Tier-3 交集逐项一致（1283 条）
```

### 命令 2 —— `npm run check:ci`（基线 `95dfeb9`，退出码 0）

```text
✓ (E) 实跑项数 == --expect-checks=39（期望值来自 verify.yml 的 gate 调用行）
✅ CI 口径检查 39 项，失败 0 项
```

### 命令 3 —— 两项读数在新基线上重跑（与开树时逐字相同）

```text
$ node research/_raw/sources-residue-v1/scan-term-residue.js --date=2026-10-08
term=原始出处 tracked=2612 dist=278
total=57 occurrences on 44 lines in 27 files
byBucket={"docs":40,"source":16,"product":1}

$ node research/_raw/sources-residue-v1/measure-citation-budget.js --date=2026-10-08
plans=24 evidence=59 maxPerPlan=3
modelLevelBindings=40 withBothInputAndOutput=39 inOrder=39
dimensionBindings=0 dims=
rateEntriesTotal=308 claimedByDimBinding=0 share=0
```

### 命令 4 —— 「只改 officialUrl」的影响面实测（临时改数据 → 读 → **还原**）

```text
$ node research/_raw/sources-residue-v1/probe-url-change-impact.js https://claude.com/pricing#api
已 patch：…docs.anthropic.com… → https://claude.com/pricing#api（1 处）
$ node scripts/tools/rebuild-api-plans.js --dry-run
❌ 人工来源层有 1 处问题，拒绝写盘：
  - #5 Claude API 按量计费 officialUrl 不是规范形态（去掉追踪参数后是「https://claude.com/pricing」）—— 请直接写规范 URL

$ node research/_raw/sources-residue-v1/probe-url-change-impact.js https://claude.com/pricing
$ node scripts/tools/rebuild-api-plans.js --dry-run
  · 重放后有 1 处差异：anthropic / Claude API 按量计费 / officialUrl
      旧："https://docs.anthropic.com/en/docs/about-claude/pricing"  新："https://claude.com/pricing"
  · 变化日志（scripts\data\api-plan-history.json）：本次追加 1 条事件（updated 1）
      2026-10-05 4f8bae91f9f8 updated officialUrl 记录信息更新

$ git checkout -- scripts/data/curated_api_plans.json
$ git diff --stat
（空 —— 生产数据 0 字节改动）
```
