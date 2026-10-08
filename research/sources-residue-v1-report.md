# sources-residue-v1 —— `NEXT-STEPS.md` §A 四条残留言的现场复核

- 任务：**t8 / sources-residue-v1**（attempt 1）
- 复核日：**2026-10-08**（Asia/Shanghai）
- 基准：隔离工作树 `.worktrees/sources-residue-v1`；从 `origin/master`（当时 `4b366d2`）开出，**提交前已 `git reset --hard` 到最新的 `origin/master`（`95dfeb9`，PR #64 合并后）并重建产物、重跑全部读数**（两项读数在新基线上逐字不变）；`npm ci` **装在工作树里**（未用 junction）
- 外部网页：**只当数据**。本报告引用的每一段原文都能在 `research/_raw/sources-residue-v1/` 里找到对应的抓取件或逐字片段
- 证据政策：Tier-1 在 `research/_raw/sources-residue-v1/`（`.md` / `.json` / `.js`）；第三方 HTML 原件（约 1 MB/份）按 `docs/EVIDENCE-POLICY.md` §2/§3 **不入库**，本机保留，重跑命令写在片段文件头部

---

## 0. 结论摘要

| # | 残留言 | 今日现场读数 | 裁定 |
|---|---|---|---|
| ① | anthropic 官方定价页已迁移 | 旧 URL 今天 **301 → 307 → 307 → 301 → 200**，终点是**区域封锁页**（不是 §A.1 登记里的「营销首页」）；**存在可读的官方定价面** `https://claude.com/pricing`（API tab），16 个可比价格格里 **15 格与记录一致、1 格不一致**（Sonnet 5.5 `cachedInput` 记录 0.20 vs 页面 $0.10）；1h 缓存写入档在该页**不载** | **本轮不改数据**（残留成立）。给出候选 URL、对照表、以及「若裁定要改」的三步改法 + **实测影响面**（1 个字段 diff + **1 条公开变化事件**） |
| ② | 混元 → TokenHub 迁移 | 公告**原文仍在**（逐字）；页面自报更新时间 **2026-06-26 10:56:00**；**6/6 模型价格与记录逐一相同**；免费额度 **100 万 tokens / 有效期 1 年** 与记录一致 | **0 改动**，残留成立（未来漂移提示、不是事实错误）。另记：迁移目标 TokenHub 已有自己的公开价格页（线索，未做对账） |
| ③ | 术语残留（DEFERRED） | 「原始出处」在**仓库已跟踪文件 + 本机构建产物**里 **57 次 / 44 行 / 27 文件**（文档 40 · 源码 16 · 产物 1）；**今天真的渲染出来：0 处**（71 条历史事件全是 `created` / `field=null`，档案详情页 0 个）；一旦有数据就渲染的**活路径 3 处** | **维持 DEFERRED**（与 captain 既有裁定一致）。另报 1 处**陈旧描述**发现：`scripts/data/official_urls.json:3` 的括注（先报 captain，未动） |
| ④ | 引文预算的结构上限 | 实测 **24 条记录 / 59 条引文 / 每条最多 3 条（上限就是 3）**；**模型级绑定 40 条**；引文里 input 与 output 同时出现的 **39 组，39/39 顺序正确**；**维度级绑定（`…rates.<dim>`）0 条**；分母 `(模型 × 维度)` 非空格子 **308** 个 | 残留成立；越界表述 **0 处**（`input/output 已逐条证据绑定` 只出现在**禁止句**里，7 行已列）。§A.4 的 `26/24/66` 是**当时快照**，今天三个数都已漂移 ⇒ 建议行见 §7 |

**改动声明**：本轮**没有改任何数据**——`officialUrl`、价格、既有引文及其 `capturedAt` / `sourceUrl` **全部 0 字节改动**（PR 只含本报告、自审与 `research/_raw/sources-residue-v1/` 里的证据文件）。唯一一次改数据是 §2.5 的**影响面实测**，读完后 `git checkout --` 还原，`git diff` 为空。

---

## 1. 方法与边界

- **网络**：`web_fetch`（工具的跨域跳转策略会拒绝自动跟跳，因此它给出的「cross-origin redirect to X」本身就是一跳的证据）+ `curl -D -` 取**逐跳原始响应头**（本机出口在 HKG，见响应头里的 `CF-RAY: …-HKG`）。
- **只对照不写入**：价格对照是从抓下来的页面**可见文本**里逐行读的（`build-evidence-extracts.js`，锚点定位、不做转述）。
- **数据侧读数**：`scan-term-residue.js`（`git ls-files` + 本机构建的 `dist/`）、`measure-citation-budget.js`（发布数据 `api-plans.json` + `scripts/lib/api-plan-schema.js` 的**同源**判据助手 `quoteIndexOfNumber` / `parseEvidenceBinding`）。
- **没做的**（有意）：不改 `docs/DESIGN-RULES.md`、不改 `NEXT-STEPS.md`（captain 收口，建议行见 §7）；不做跨平台（混元 ↔ TokenHub）逐项对账；不碰 `research/audit/**`（不在仓库里，见 §4.1）。

---

## 2. ① anthropic 官方定价页迁移（来源新鲜度）

### 2.1 逐跳链路（今天，逐字响应头见 `anthropic-pricing-visible-lines.md` §1）

| 跳 | URL | 状态 | 关键头 |
|---|---|---|---|
| 1 | `https://docs.anthropic.com/en/docs/about-claude/pricing` | **301** | `Location: https://platform.claude.com/docs/en/docs/about-claude/pricing`（跨域；路径里 `docs` 出现两次） |
| 2 | `…platform.claude.com/docs/en/docs/about-claude/pricing` | **307** | `location: /docs/en/about-claude/pricing`（同域路径归一） |
| 3 | `https://platform.claude.com/docs/en/about-claude/pricing` | **307** | `location: https://www.anthropic.com/app-unavailable-in-region?utm_source=country` ← **区域门** |
| 4 | `…/app-unavailable-in-region?utm_source=country` | **301** | `Location: https://claude.com/app-unavailable-in-region` |
| 5 | `https://claude.com/app-unavailable-in-region` | **200** | 终页 = 「该应用在当前地区不可用」说明页 |

**与 §A.1 登记读数的差别（如实记）**：§A.1 写「→ platform.claude.com → www.anthropic.com（营销首页，没有 API 价格表）」。
今天从本网络看，第 3 跳之后**不是营销首页，而是区域封锁页**。两者结论方向一致（用户点到的不是定价页），但「终点是什么页面」这一条今日读数不同 —— 可能的原因有二，我**没有**能力区分：
① 登记时用的是别的出口 IP（区域不同，门不生效；此时 `platform.claude.com/docs/…` 就是那份详细定价页）；
② 登记时 platform 的文档还没有加这道门。
两者都不改变「旧 `officialUrl` 今天不是定价页」这个结论。

### 2.2 今天是否存在可读的官方 API 定价页？——**存在**（但只是摘要版）

| 候选 | 结果 | 性质 |
|---|---|---|
| `https://claude.com/pricing` | **200**（1,191,415 bytes） | Claude 官方 Plans & pricing 页；**API tab** 里逐模型的 Input / Output / 缓存 Read·Write 价目 |
| `https://claude.com/platform/api` | **200**（1,035,017 bytes） | Claude Platform 落地页，含同源同款价格模块 |
| `https://www.anthropic.com/pricing` | **301** → `https://claude.com/pricing` | 官网 pricing 入口已改指 claude.com |
| `https://platform.claude.com/docs/en/about-claude/pricing` | **307** → 区域封锁 | 官方**详细**定价页；本网络读不到正文 |
| `https://platform.claude.com/docs/en/about-claude/pricing.md` | 同上 | `.md` 变体被同一道门拦 |
| `https://docs.claude.com/en/docs/about-claude/pricing` | **302** → 上述 → 区域封锁 | 旧文档域现在的跳板 |
| `https://platform.claude.com/docs/en/home` | 区域封锁 | 连 Console 文档首页也拦 |
| `https://claude.com/pricing.md` | **404** | 无 `.md` 变体 |
| `https://platform.claude.com/` | **403**（Cloudflare 人机校验） | 控制台首页 |

**关键**：`claude.com/pricing` 页面自己给「详细定价」的出口是 `href="https://platform.claude.com/docs/en/about-claude/pricing"`（另有 `#fast-mode-pricing` / `#specific-tool-pricing` 两个锚）—— 官方认定的**详细**定价页仍是那份被区域封锁的页；可达的这一页是它的**摘要版**。

### 2.3 逐项对照（**只对照，绝不改价格**）

记录值取自 `scripts/data/curated_api_plans.json`（anthropic / Claude API 按量计费，`verifiedAt 2026-10-01`）；页面值取自 `claude.com/pricing#api` 今日快照的可见文本（逐字片段见 `anthropic-pricing-visible-lines.md` §3）。

| 维度 | Claude Fable 5.1 | Claude Opus 5.5 | Claude Sonnet 5.5 | Claude Haiku 4.5 |
|---|---|---|---|---|
| 记录 `input` → 页面 | 10 → `Input $10 / MTok` ✅ | 4 → `$4` ✅ | 2 → `$2` ✅ | 1 → `$1` ✅ |
| 记录 `output` → 页面 | 50 → `Output $50 / MTok` ✅ | 20 → `$20` ✅ | 10 → `$10` ✅ | 5 → `$5` ✅ |
| 记录 `cacheWrite`（5m 写入）→ 页面 | 12.5 → `Write $12.50 / MTok` ✅ | 5 → `$5` ✅ | 2.5 → `$2.50` ✅ | 1.25 → `$1.25` ✅ |
| 记录 `cachedInput`（命中）→ 页面 | 0.25 → `Read $0.25 / MTok` ✅ | 0.2 → `$0.20` ✅ | **0.2 → `$0.10` ❌** | 0.1 → `$0.10` ✅ |
| 记录 `cacheWriteLong`（1h 写入） | 20 | 8 | 4 | 2 |
| ↑ 该页是否载明 | **不载**（页面只写：「Prompt caching pricing reflects 5-minute TTL. Learn about extended prompt caching.」） | 不载 | 不载 | 不载 |

- **合计**：可比格 16 个（4 模型 × 4 维），**15 格一致 / 1 格不一致**；另有 4 格（1h 写入档）在该页**根本不存在**，无法用这一页证实或证伪。
- 那 1 格不一致位于 **Sonnet 5.5 的缓存命中价**（记录 `0.20`，页面 `$0.10`）。同页的 legacy `Sonnet 5` 恰好写 `Read $0.20`，记录里 Sonnet 5.5 的 `0.20` 与它同值 —— 这**提示**记录可能取错了行，也**可能**是页面后来改过价。**我没有证据区分这两种可能**（官方详细定价页在本网络被区域封锁，读不到原文），所以：
  - **不写「价格已变化」**（无证据）；
  - **不改任何价格**；
  - 把它作为**待核事项**交给 captain（跨网络回读 `platform.claude.com/docs/en/about-claude/pricing` 的 Cache operation 表即可定案）。
- **附加读数**：记录里的 Haiku 4.5 在今天的页面上被放在 **`Legacy models`** 区块（该区块还有 Sonnet 5 / Opus 5 / Fable 5 / Opus 4.8 / Sonnet 4.6 / Opus 4.7），而 `scripts/data/models.json` 里 `claude-haiku-4.5` 的 `status` 是 **`active`**。页面只给了小标题「Legacy models」，**没有**任何生命周期陈述 —— 因此这只是一个**词面张力**，不是事实错误，登记为线索（本轮不动 `status`）。

### 2.4 如果裁定要改 `officialUrl`：三步改法 + **实测影响面**

边界内允许的改动只有 `officialUrl` 与 `officialDomains` 登记两处。实测（`probe-url-change-impact.js` + `npm run api-plans:rebuild -- --dry-run`）：

1. **不能写带锚点的 URL**。写 `https://claude.com/pricing#api` 时重建**拒绝**：
   > `❌ 人工来源层有 1 处问题，拒绝写盘：`
   > `- #5 Claude API 按量计费 officialUrl 不是规范形态（去掉追踪参数后是「https://claude.com/pricing」）—— 请直接写规范 URL`
2. **写规范 URL `https://claude.com/pricing`** 时：数据集级校验通过，`重放后有 1 处差异`（`anthropic / Claude API 按量计费 / officialUrl`），并且——
   > `· 变化日志（scripts\data\api-plan-history.json）：本次追加 1 条事件（updated 1）`
   > `    2026-10-05 4f8bae91f9f8 updated officialUrl 记录信息更新`

   ⇒ 换这一处 URL 会**在 `/changes/` 与订阅源里多出一条公开的「官方定价页 updated」事件**（`officialUrl` 是 `api-plan-history` 的跟踪字段：`scripts/lib/api-plan-history.js:95` 的类型表、`:100` 的字段表、`:184` 的标签「官方定价页」）。那不是价格变化，却会以「变化」的形式出现在读者面前。
3. **域登记不需要动**：`scripts/data/providers.json` 里 anthropic 的 `officialDomains` 已经含 `claude.com`（`:306-309`），`claude.com` 也在官方域白名单判据的覆盖里。

**裁定：本轮不改。** 三条理由：
① 可达页是摘要版，**与记录有 1 格冲突、另有 4 格不载** —— 把 `officialUrl` 指过去，等于让「官方依据」指向一个部分矛盾且不完整的页面；
② 改动会在变化流里**生成一条不是价格变化的公开事件**（实测，见上），而本轮同一批次里另有成员在做「**最近变化**」的生产读数，两条线会互相污染；
③ 残留言本身（旧 URL 今天不是定价页）**仍然成立**，且已在本报告里带了完整的重定向证据与候选方案 —— captain 若要落地，第 2.4 条的三步可以直接执行（含预期副作用）。

### 2.5 声明

> **本轮对 anthropic 记录：价格 0 字节改动、既有引文及其 `capturedAt` / `sourceUrl` 0 字节改动、`officialUrl` 也 0 字节改动。** 上面所有「页面值」都只用于对照。

---

## 3. ② 腾讯混元 → TokenHub 迁移（来源迁移风险）

回访 <https://cloud.tencent.com/document/product/1729/97731>（HTTP 200，快照 49,938 bytes，sha256 `6ff32dd2…`）。逐字片段见 `hunyuan-pricing-visible-lines.md`。

### 3.1 公告：**仍在**（逐字）

> 为进一步提升大模型服务体验，腾讯混元大模型相关功能将逐步迁移至 TokenHub。迁移后，原平台将不再新增模型能力，并停止支持新购模型服务。用户已购买的模型服务可继续使用，暂不受影响。如需开通新的模型服务或使用更多模型能力，请前往 TokenHub。

`NEXT-STEPS` §A.2 的转述（「混元相关功能将逐步迁移至 TokenHub…原平台不再新增模型能力、停止支持新购模型服务」）与原文一致。
页面自报更新时间：**2026-06-26 10:56:00**（早于记录的 `capturedAt 2026-10-01`）。

### 3.2 价格：**6/6 与记录一致**

| 模型（记录 `modelKey`） | 记录 input / output | 页面「刊例价（每 百万 tokens）」 | 判定 |
|---|---|---|---|
| `hunyuan-a13b` | 0.5 / 2 | 输入：0.5元 / 输出：2元 | ✅ |
| `hunyuan-role-latest` | 2.4 / 9.6 | 输入：2.4元 / 输出：9.6元 | ✅ |
| `hunyuan-translation` | 1.2 / 3.6 | 输入：1.2元 / 输出：3.6元 | ✅ |
| `hunyuan-translation-lite` | 1 / 3 | 输入：1元 / 输出：3元 | ✅ |
| `tencent-hy-vision-1.5-instruct` | 3 / 9 | 输入：3元 / 输出：9元 | ✅ |
| `hunyuan-embedding` | 0.7 / 0.7 | 输入：0.7元 / 输出：0.7元 | ✅ |

免费额度：页面「首次开通腾讯混元大模型服务后…共100万 tokens，共享消耗。**资源包有效期为1年**，自开通服务之日起1年内若免费资源包未使用完，则过期作废。」—— 与记录的 `freeTier`（`amount 1000000`、`one_time`、描述引文）**逐字一致**。计费示例（Hunyuan-role-latest，2.4/9.6 → 3.84 元）也逐字不变。

**没有发现任何不一致 ⇒ 不改数据。**

### 3.3 页面今天比记录**多**的 4 行 —— 不是漂移，是覆盖边界

同表还有 4 行不在记录里：`Hunyuan-turbos-vision`（3/9）、`Hunyuan-t1-vision`（3/9）、`Hunyuan-turbos-vision-video`（3/9）、`腾讯元器`（100/100）。
判据：`scripts/data/models.json` 里「腾讯云」名下**恰好 6 个模型身份**，与记录里的 6 条**完全对应** ⇒ 多出来的 4 行**没有注册表身份**，按「API 计划的 `modelKey` 必须能对上模型身份」的口径，它们本来就不在这条记录的范围内。
又：页面自报更新时间（2026-06-26）**早于**记录的 `capturedAt`（2026-10-01），所以这也不是「今天新增的行」。⇒ 记为**覆盖范围说明**，不是来源漂移。

### 3.4 迁移目标平台已经有自己的公开价格页（**线索**，未做对账）

- TokenHub 计费方式：<https://cloud.tencent.com/document/product/1823/130054>（自报更新时间 2026-09-18）
- TokenHub 模型价格：<https://cloud.tencent.com/document/product/1823/130055>（自报更新时间 2026-09-24）
- TokenHub 迁移指南：<https://cloud.tencent.com.cn/document/product/1823/131382>；公告：<https://cloud.tencent.com/announce/detail/2287>

在 130055 的可见文本里，`Hy-Role-Latest` 一行为 **2.4 / 9.6**（与记录里 `hunyuan-role-latest` 同价），但模型命名已经换了前缀（`Hy3` / `Hy4 preview` / `Hy-MT2-*`）。
**我明确没有做**：混元 6 个模型在 TokenHub 上的逐项价格对账（那需要一张新证据表，且会引出「记录该跟哪个平台」的裁定）。这一条只作为下一轮的回访入口。

---

## 4. ③ 术语残留：逐处计数与三类裁定

### 4.1 计数（口径写死，便于复算）

扫描器：`scan-term-residue.js`（词 = `原始出处`；范围 = `git ls-files` 的**已跟踪文件** + 本机 `build-local.js` 构建出的 `dist/`；只读文本类扩展名）。
**排除**：本轮自己的产物（`research/_raw/sources-residue-v1/`、`research/sources-residue-v1-report.md`、`research/sources-residue-v1-self-audit.md`）—— 它们大量引用这个词，混进来会让「历史有多少处」变成自证（`--exclude=` 可在命令行覆盖）。

**总数：57 次 / 44 行 / 27 文件。** 分桶（按路径）：

| 桶 | 次数 | 文件 |
|---|---|---|
| 文档 `docs/**`、`research/**`、根级 `.md`、`mockups/**` | **40** | 18 |
| 源码（`scripts/**`、`index.html`） | **16** | 8 |
| 产物（本机构建的 `dist/**`，303 → 278 个文本文件） | **1** | 1 |

另有一处**不在仓库里**的读数（如实分开列，不混进上面的数）：**工作区未跟踪**的 `research/audit/**`（`git ls-files` 里没有、克隆里没有、不进 PR）里有 **7 次 / 6 行 / 3 文件**：
`research/audit/DEFECTS_AND_GAPS.md:676`、`research/audit/MASTER_ACCEPTANCE_MATRIX.md:301`、`research/audit/_fragments/r1-identity.md:53 / :188 / :245 / :248`（其中一行 2 次）。

**另有一类不是残留、因此不计入**：判据的**负例**——`scripts/tools/audience-selftest.js:1020 / 1022 / 1026 / 1027 / 1030 / 1031`（7 次）与 `scripts/tools/provenance-selftest.js:264`。它们**故意**把这个旧称写成变异输入，用来证明「改回旧称就红」（牙⑥）。删掉它们等于拆掉防回归的牙。

### 4.2 三类裁定（逐处 file:line）

**A 类 · 历史文档（按设计保留）—— 40 次 / 18 文件（+ 未跟踪的 7 次 / 3 文件）**

| file:line | 出现次数 | 为什么保留 |
|---|---|---|
| `docs/SCHEMA-v1.3.md:30`、`:88` | 2 | v1.3 时期的契约快照（当时 `sourceUrl` 的正式称呼就是「原始出处/聚合站署名」） |
| `README.md:818` | 1 | 描述 v1.3 详情页「信息来源」块的历史行名 |
| `research/v1.3-evidence-provenance-report.md:23`、`:50` | 2 | 该轮报告的原文 |
| `research/quality-closure/QUALITY_CLOSURE_REPORT.md:267`、`:273`、`:702`、`CAPTAIN-LEDGER.md:165`、`:166` | 7 | **改名过程本身的记录**（217 → 0 的回放读数、captain 裁定 DEFERRED 的原文） |
| `research/coverage-expansion-v1-self-audit.md:350` | 1 | 残留言登记表原文 |
| `research/quality-closure/source-revalidation.md:85` | 1 | 「原始出处」在这里是**语义用词**（讨论记录缺 `sourceUrl`），不是字段标签 |
| `research/_raw/v3.0-gate/t12-verify{,2,3,4,5}.json` | 20 | 当时的产物快照（现存记录的字段值快照，属历史证据） |
| `research/_raw/mock-B-detail/{tokens,metrics}.json` | 2 | 设计稿快照 |
| `research/_raw/coverage-depth-v1/gap-closure/domains.txt` | 1 | 一次性抓取 dump（grandfather） |
| `mockups/v3/_tools/build.js:407`、`mockups/v3/B-balanced/detail.html:68` | 2 | 历史设计稿（不在产物里，`dist/` 里 0 处来自 mockups） |

**B 类 · 活用户可见文案（该统一）—— 分两种口径，都要写**

- **严格口径「今天真的渲染出这四个字」：0 处。** 证据：
  - 三份历史日志的全部事件 **71 条**（deal 19 + plan 35 + api 17）都是 `type=created`、`field=null` ⇒ `HISTORY_FIELD_LABELS.sourceUrl` 这一格**从来没有被用到**（`scripts/lib/history.js:192`、`index.html:1348` 的浏览器侧副本）；
  - 产物里唯一的 1 次出现在 `dist/index.html:1441` 的 `HISTORY_WORDING` **常量**里（整页共享的措辞表，未渲染成行）；
  - `dist/archive/` 今天 **0 个详情页**（构建日志：「+ 0 个档案详情页」），所以 `scripts/lib/archive.js:685` 的链接文案「原始出处 ↗」也没有渲染面。
  ⇒ 这正是 captain 当年判 DEFERRED 的理由，**今天仍然成立**（这是一份新的现场证据，不是复述）。
- **活路径口径「一旦有数据就渲染」：3 处 / 4 次**
  | file:line | 内容 | 触发条件 |
  |---|---|---|
  | `scripts/lib/history.js:192` | `sourceUrl: '原始出处'`（历史层字段标签） | 出现一条 `field=sourceUrl` 的字段事件 |
  | `index.html:1348` | `HISTORY_WORDING.HISTORY_FIELD_LABELS.sourceUrl = "原始出处"`（前端副本，构建期逐字进产物 → `dist/index.html:1441`） | 同上 |
  | `scripts/lib/archive.js:685` | `<a …>原始出处 ↗</a>` | `/archive/` 出现条目 |

  **裁定：维持 DEFERRED**（与 `research/quality-closure/CAPTAIN-LEDGER.md:166` 的既有裁定一致、理由今天复核仍然成立）。若将来要统一，最小改法是这 3 处逐字改成「收录渠道」（与 deals 侧 `scripts/lib/audience.js:749` 同词）并重建产物；注意 `audience-selftest.js` 的牙⑥ 只锁 deals 侧的 `origin` 标签，**不锁** history 表，所以这次统一需要**新加**一条断言（否则改回去没人发现）。

**C 类 · 歧义 —— 2 处**

| file:line | 内容 | 为什么歧义 | 建议 |
|---|---|---|---|
| `scripts/data/official_urls.json:3` | `_roles` 注里写：「② `deal.sourceUrl` / `plan.sourceUrl` = **收录渠道**（渲染成「原始出处」行）」 | **陈旧描述**：deals 侧的渲染标签已经改成「收录渠道」（`scripts/lib/audience.js:749` + `index.html` 的 `SOURCE_WORDING` 两副本同值），所以括注与今天不符；plans 侧则**根本不渲染这个字段的标签**（`scripts/lib/plans-page.js:546-549` 只是把值原样贴进变化事件句子里） | 把括注改成「（页面行标签：deal 侧 =「收录渠道」；plans 侧不渲染该字段）」—— **先报 captain**（这是数据契约文件的一行注释，可能与别人的写作用域冲突），本轮未动 |
| `scripts/lib/history.js:87` | `sourceUrl: 'updated', // 原始出处换了` | 是**注释**，不渲染；但它把「字段变化」说成「出处换了」，与统一后的「收录渠道」措辞不同调 | 可随手改成「收录渠道换了」；无功能影响（本轮未动） |

### 4.3 结论

- 「第二类非空吗」——**严格口径 0 处、活路径口径 3 处**。按 DEFERRED 的原始理由（不可达），今天依然不需要动；若 captain 想一次收干净，改法与「必须补的断言」已在 §4.2 B 类给出。
- 真正的新发现只有 **C 类第 1 条**（`official_urls.json:3` 的陈旧括注）—— 已按纪律**先报 captain，未动**。

---

## 5. ④ 引文预算的结构上限（口径红线）

### 5.1 实测（按**发布数据** `api-plans.json`，脚本 `measure-citation-budget.js`）

| 读数 | 今天 | 说明 |
|---|---|---|
| 记录数 | **24** | `api-plans.json` 的 `plans` |
| 引文总数 | **59** | |
| 每条记录最多几条引文 | **3**（16 条记录正好 3 条） | 上限常量 `MAX_EVIDENCE_ITEMS = 3`（`scripts/lib/provenance.js:37`），引文长度上限 200 字（`:35`） |
| **模型级绑定**（`field = models.<modelKey>`） | **40** | 口径：`parseEvidenceBinding` 判 `kind==='model' && !variant` |
| 其中 input 与 output **都**出现在引文里的 | **39** | B2 顺序判据的作用域 |
| 其中「input 出现在 output 之前」的 | **39 / 39** | 顺序判据全部通过 |
| **维度级绑定**（`…rates.<dim>`） | **0 条** | 全库 `evidence[].field` 只有**两种粒度**：记录级（`pricing.unit` ×11、`pricing.currency` ×4、`freeTier` ×3、`limits` ×1）与模型级（`models.<key>` ×40）；`…rates.<dim>` / `mediaRates.<unit>` 一条都没有 |
| 分母：`(模型 × 维度)` 非空格子 | **308**（模型行 108） | 被维度绑定**认领**的：**0** |

⇒ **结构上限的结论今天更强地成立**：即便把每一条绑定都用满，59 条引文 ≤ 3 × 24 = 72 条，也覆盖不了 308 个格子的每一个维度。写报告时**不得**写成「input/output 已逐条证据绑定」；今天的准确写法是：
**「模型级绑定 40 条 + 引文内的 input/output 顺序对 39 组（由 B2 判据约束） + 结构判据（B1/B3、单位见证、维度域扩展）兜住其余」**。

### 5.2 越界表述扫描：**0 处**

扫描范围：仓库里所有出现 `input/output 已逐条证据绑定`（含「已逐条绑定」变体）的行 = **7 行，全部是否定句/禁止句**：

| file:line | 性质 |
|---|---|
| `NEXT-STEPS.md:111` | 禁止句（captain 收口；行号按 `origin/master` `95dfeb9`） |
| `research/quality-closure/QUALITY_CLOSURE_REPORT.md:338` | 禁止句（「因此**不得**把这层写成…」） |
| `research/quality-closure/QUALITY_CLOSURE_REPORT.md:654` | 交付清单里的登记 |
| `research/quality-closure/QUALITY_CLOSURE_REPORT.md:693` | 禁止句 |
| `research/quality-closure/CAPTAIN-LEDGER.md:219` | 禁止句 |
| `research/quality-closure/CAPTAIN-LEDGER.md:348` | 登记 |
| `research/quality-closure/CAPTAIN-LEDGER.md:372` | 登记 |

**没有任何一处把它当成事实陈述** ⇒ 红线今天没有被踩。

### 5.3 §A.4 里的具体数字**已经过期**（建议 captain 更新，见 §7）

| §A.4 写的 | 今天实测 | 差异原因 |
|---|---|---|
| 「当前实际是 **26 条模型级绑定 + 24 组 input/output 顺序对**」 | **40 条 / 39 组** | quality-closure 之后又合并了若干轮 API 计费记录（24 条记录 / 59 条引文），绑定数跟着长大 |
| 「**66 个计价条目**」 | `(模型 × 维度)` 非空格子 **308**、模型行 **108** | 同上；且 66 的分母口径当时没有写下来，今天两种口径都不是 66 |
| 「正确的写法是「模型级 + **部分格式级绑定**…」」 | 维度级绑定 **0 条** | 今天「格式级绑定」只体现在**引文内的顺序对**上，字段路径层面的维度绑定一条都没有 |

---

## 6. 我没能证明的东西（完备性台账）

1. **区域封锁那一段读不到**：`platform.claude.com` 的文档（含官方详细定价页与 `.md` 变体）从本网络出口一律 307 到 `app-unavailable-in-region`；`platform.claude.com/` 首页还带 Cloudflare 403。⇒ 我**没能**读官方详细定价页的正文，因此：
   - 不能确认 Sonnet 5.5 `cachedInput` 那 1 格不一致是「记录笔误」还是「页面改价」；
   - 不能核实 4 个模型的 1h 缓存写入档（`cacheWriteLong`）；
   - 不能确认 §A.1 当年看到的「营销首页」终点（今天看到的是区域页）——**换了出口 IP 才能分辨**。
2. **没有跨国出口、没有浏览器**：以上全部是 HTTP 层读数；没有用真浏览器验证 `#api` 锚点滚动行为（`claude.com/pricing#api` 只是站内导航给的深链形态；数据层则要求写**规范 URL**、不接受带锚点的写法）。
3. **混元 ↔ TokenHub 的逐项对账没做**（有意留作下一轮），所以「迁移后的价格是否等价」这句话我不能说。
4. **`research/audit/**` 不在仓库里**：我能给出它在本机的 6 行读数，但它未经 `git ls-files`（未跟踪），因此它不进 PR、也不能当作「仓库里的残留」来评审。
5. **产物读数是我自己构建的**（`node scripts/tools/build-local.js`，303 个文件，产物自检全过），不是线上 `dist`：线上产物可能与工作树有版本差；不过 §A.3 的产品面结论只依赖「`dist/index.html` 里有措辞常量」与「档案详情页 0 个」，两者都由构建日志与字节计数直接给出。
6. **没有跑真浏览器门禁**（L4）：本任务不改渲染逻辑，`npm run check:evidence` 是硬要求，已跑（见 §8）；`verify-site` 的浏览器层未在本轮重跑，因此我对「页面上不渲染」的陈述来自**数据 + 构建日志 + 字节统计**，不是截图。

---

## 7. 给 captain 的建议行（**原文**，供 `NEXT-STEPS.md` / `docs/DESIGN-RULES.md` 收口时取用）

> 以下三行只是**建议文本**，本轮**没有**改 `NEXT-STEPS.md` 或 `docs/DESIGN-RULES.md`。

**建议 1 —— 替换 §A.4 的第 3、4 行（数字已过期，口径要跟着数据走）：**

```
4. **引文预算的结构上限（重要口径）**：单条记录**最多 3 条引文**（`MAX_EVIDENCE_ITEMS = 3`，实测 16 条记录用满），
   2026-10-08 实测：发布数据 24 条 API 计费记录 / 59 条引文 —— **40 条模型级绑定**（`models.<modelKey>`），
   其中引文里 input 与 output 同时出现的 **39 组顺序对（39/39 顺序正确）**；**维度级绑定（`…rates.<dim>`）0 条**，
   分母 `(模型 × 维度)` 非空格子 **308** 个一个都没被维度绑定单独认领。
   ⇒ **任何报告都不得写成「input/output 已逐条证据绑定」**；正确写法是「模型级绑定 40 条 + 引文内 input/output 顺序对 39 组（B2 判据）+ 结构判据（B1/B3 · 单位见证 · 维度域扩展）兜住其余」。
```

**建议 2 —— 替换 §A.1 的重定向描述（今天的逐跳读数与登记不同，且已找到候选页）：**

```
1. **anthropic 官方定价页已迁移（来源新鲜度）**：`docs.anthropic.com/en/docs/about-claude/pricing` 现在
   301 → `platform.claude.com/docs/en/docs/about-claude/pricing` → 307 路径归一 → 307
   `www.anthropic.com/app-unavailable-in-region?utm_source=country` → 301 → `claude.com/app-unavailable-in-region`（200，**区域封锁页**；
   2026-10-08 从 HKG 出口实测，与旧登记的「营销首页」终点不同 —— 换了出口 IP 才能分辨谁对）。
   记录里的 `officialUrl` 仍是旧地址 ⇒ 用户点到的「官方定价页」当前不是定价页。
   **候选**：`https://claude.com/pricing`（API tab 有逐模型 Input/Output/缓存价；数据层要求写规范 URL，带 `#api` 会被重建拒绝）。
   但它是官方详细定价页（`platform.claude.com/docs/en/about-claude/pricing`，本网络区域封锁）的**摘要版**：
   4 个模型的 1h 缓存写入档不载，且 Sonnet 5.5 缓存命中价与记录不一致（记录 0.20 vs 页面 $0.10，**原因未证实，不得写成「价格已变化」**）。
   **实测影响面**：改 officialUrl 会产生 1 处字段 diff + **1 条公开变化事件**（`updated officialUrl`，进 `/changes/` 与订阅源）⇒ 需 captain 裁定后再落地。
   处置边界不变：只允许改 URL 与 `officialDomains` 登记（域登记无需改，providers.json 已含 `claude.com`）。
```

**建议 3 —— §A.3 尾部追加一行（把复核结论钉在“今天仍然成立”上）：**

```
   2026-10-08 复核：全库 `原始出处` 57 次 / 44 行 / 27 文件（文档 40 · 源码 16 · 产物 1）；
   **今天真的渲染出来：0 处**（71 条历史事件全为 `created`/`field=null`，档案详情页 0 个）；
   活路径 3 处（`scripts/lib/history.js:192` · `index.html:1348` · `scripts/lib/archive.js:685`）—— 维持 DEFERRED。
   另：`scripts/data/official_urls.json:3` 的括注「（渲染成「原始出处」行）」已陈旧（deals 侧标签早已是「收录渠道」）⇒ 待裁定。
```

---

## 8. 本轮改动与验证

**改了什么**（全部落在 `research/`）：

- `research/sources-residue-v1-report.md`（本文件）
- `research/sources-residue-v1-self-audit.md`
- `research/_raw/sources-residue-v1/README.md`（索引 / 清单 / 复跑命令）
- `research/_raw/sources-residue-v1/anthropic-pricing-visible-lines.md`、`hunyuan-pricing-visible-lines.md`（逐字片段）
- `research/_raw/sources-residue-v1/term-residue-scan.json`、`citation-budget-measurement.json`（机器可读读数）
- `research/_raw/sources-residue-v1/scan-term-residue.js`、`measure-citation-budget.js`、`build-evidence-extracts.js`、`probe-url-change-impact.js`（可复跑探针）

**没改什么**：`scripts/**`、`docs/**`、`NEXT-STEPS.md`、`*.json` 数据、`index.html`、`dist/**` —— **一个字节都没动**（`git status` 只显示上面这些新增文件；影响面实测用到的临时改动已 `git checkout --` 还原，见 §2.4）。

**验证命令与证据**：见 `research/sources-residue-v1-self-audit.md` §「验收对照」（含 `npm run check:evidence` 的实跑读数）。
