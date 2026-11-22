# 收口记录：把本站收口成「正常网站」——撤掉一切面向读者的数据文件 / JSON 暴露

> **目标（原话）**：把本站收口成一个「正常网站」—— 撤掉一切面向读者的数据文件 / JSON 暴露。
> **判据不是「没人点进去」**，而是：任何页面都不再出现数据文件名 / JSON / RSS / Feed 措辞 / 数据出口入口，**且没有任何数据文件可以按 URL 下载到**。
>
> 本文只写「改了什么、为什么、怎么自证、哪些话不能说」。§9 是逐条实跑读数；§11 是**判据层面的修正与裁定**（本轮最值得留下的部分）；§13 是**局限**（必须原样保留，不许被写成「线上也验过了」）。

---

## 0. 终态读数

| 量 | 改前 | 改后 |
|---|---|---|
| 页面（路由） | 186 | **184** |
| `dist/` 文件总数 | 304 | **240** |
| `dist/` 非 HTML 文件 | 118 | **56** |
| `sitemap.xml` 的 `<url>` | 183 | **181** |
| `dist/` 里可下载的**数据 / 订阅产物** | **63 份**（见下） | **1 份**（`assets/data/offers.json`） |
| 说明清单 `_notes.ndjson` | 在 `dist/` 里（可下载） | **仓库根** `dist.notes.ndjson`（116071 B） |

**改前那 63 份**（逐桶点名）：根级数据 JSON **10** —— `deals` · `plans` · `api-plans` · `models` · `model-registry-links` · `deal-history` · `plan-history` · `api-plan-history` · `deal-plan-links` · `source-health`；首页 Feed 两格式 —— `feed.json` + `feed.xml`；`feed/**` **48**（24 个源 × 2 格式）；`data/index.json`（数据文档页索引）；`_notes.ndjson`；`icon.png`（Feed 的 `<image>`）。

**改后 `dist/` 非 HTML 完整清单**（240 = 184 页面 + 56 非页面，逐项可核）：`.nojekyll` · `favicon.svg` · `logos.css` · `og-image.png` · `robots.txt` · `sitemap.xml` · `logos/**`（49） · `assets/data/offers.json`。
**禁名扫描 0 命中**：`deals.json` / `plans.json` / `api-plans.json` / `models.json` / `*-history.json` / `source-health.json` / `feed*` / `icon.png` / `*_notes.ndjson` / `data/` / `docs/data/` / `feeds/`。

---

## 1. 删掉的页面族与文件

**整族下架**：`/feeds/` 订阅中心页（`renderFeedsPage`）+ **25 家 × 2 格式 = 50 个** `feed.xml` / `feed.json`；`/docs/data/` 数据文档页族及其名下登记的数据副本；`icon.png`（唯一用途是 Feed 的 `<image>`）。

**入口（读者面）逐处**：`<head>` 的 `rel="alternate"` Feed 声明（`page-shell.js` 的 `feedTagsHtml` 参数与输出整体删除，`docStart()` 签名同步收窄）· 页脚「订阅 / 开放数据」入口（`index.html` 的 `<!--SHARED:footer:…-->` 共享片段 —— **改一处即全站生效**）· `/status/` 指向 `source-health.json` 的链接 · `/archive/` 与 `/models/` 的「数据文档」链接 · 厂商页「订阅这一家」整节 · 枢纽页表头「RSS · JSON」列 · 以及**一处不在任何原契约里的残余**：`plans/api/` 页里指向 `feeds/` 的半句链接。

**真删的文件**：`scripts/lib/feeds.js` · `scripts/lib/data-docs.js` · `scripts/tools/feeds-selftest.js` · `feeds-report.js` · `check-feeds-reproducible.js` · `data-docs-selftest.js`；`package.json` 去掉 `selftest:feeds` / `check:feeds:reproducible` / `report:feeds` / `selftest:data-docs` 四条 script。

**新增**：`scripts/lib/site.js`（站点常量唯一出处，值从 `feeds.js:64-66/94/96/162-169/636-645` 逐行搬运、语义零变化 —— **先搬常量再删文件**，顺序反了会连坐十几个消费者）；`scripts/lib/published-assets.js`（产物资产**白名单** + 失败即红扫描，见 §2）。

---

## 2. 门禁步骤同步；`--expect-checks` **未变**

| 步骤 | 出处 | 处置 |
|---|---|---|
| `Feeds self-test` | `.github/actions/gate/action.yml:171-180` | 删 |
| `Data-docs self-test` | `:394-396` | 删 |
| `Feeds reproducibility` | `:412-419` | 删 |

按本仓「三处登记」纪律同步三处：`scripts/test/layers.js`（L2/L3 各一条）· `.github/actions/gate/action.yml` · `scripts/tools/check-ci-consistency.js`（`GATE_STEP_NAMES` / `GATE_STEP_RUN` / `GATE_ARTIFACT_STEPS`）。
**`--expect-checks=39` 没有变化** —— 实跑 `node scripts/tools/check-ci-consistency.js` 确认（这三个步骤不在该计数集合里），`FROZEN_ASSERTION_NAMES` 一字未动。

**同族的一处漏网（本轮必须一起修）**：`scripts/tools/seo-verify.js:134/:146-149` 原本从**产物**读五份真值，产物收口后这五份不存在 ⇒ `readFileSync` 直接 ENOENT ⇒ 步骤 `SEO verification (independent, from dist/)`（`action.yml:420`）与 L3 `verify:seo` 必红。按 D1 修：**`deals` 改读 `OUT/assets/data/offers.json`**（产物里唯一的真值副本，保住这一支「从产物出发」的性质），其余四份从 **ROOT** 读；并改掉那条已不成立的注释（原文称「与构建期的来源不同源」—— 本来就是虚的：`dist/` 里那几份正是**同一次构建**拷出来的。这一支真正的独立性在**重算计划**）。修后实跑：**`✅ SEO 验收 18 项，失败 0 项`**。

**闭环替代**：被删的 data-docs 闭环由 `published-assets.js` 接替 —— 逐路径白名单（仅 `logos/` 前缀 + 唯一数据豁免 `assets/data/offers.json`），三条纪律：**空输入不算通过** · **豁免必须逐路径带理由（不接受通配）** · **失败必须点名路径**。

---

## 3. 六条锁定决定（D1–D6）

| # | 决定 | 理由 | 失效方式 |
|---|---|---|---|
| **D1** | `verify-site.js` 真值改为**从仓库根读**（复用已有 `ROOT`，**不用** `path.dirname(DIR)`） | 数据真值本就在仓库根；`--dir=` 指向的是**被验的产物**而不是真值所在，两者必须解耦 | 用 `DIR` 推导会在 `--dir=dist.x` 时读错目录。**只有 `deals.json` 有产物等价物**（`assets/data/offers.json`），其余四份**绝不能**改读产物 |
| **D2** | 删 `seo.js` 的 `'feed-declared'` 判定码**及其 fixture** | 本仓纪律：每个注册的码都必须能被证明会红。留码却不喂数据 = 死码，且 `seo-selftest.js:389-390` 要求每码有 fixture ⇒ 只能造一个永真的 fixture，那是自欺 | 留死码 ⇒ 下一个维护者以为 Feed 还在被守 |
| **D3** | 删 `icon.png` 及生成链（`ICON_SIZE` / `renderIcon` / `selfCheckIcon`） | 唯一消费者是 RSS/JSON Feed 的 `<image>`/`icon` | 留一个没人引用的生成物 ⇒ 白名单要被迫为它开后门 |
| **D4** | 说明清单写到 `<out 目录>.notes.ndjson`（默认 `ROOT/dist.notes.ndjson`），**且只在构建成功之后**写 | 清单留在 `dist/` 就是**可按 URL 下载**的，正是本任务要消灭的东西。`verify-site.js` 从 `DIR` 推导清单路径 ⇒ `--dir=dist.x` 仍指向那次构建自己的意图侧 | 写进 `dist/` 即违反目标；构建失败也写 ⇒ 意图侧与产物不匹配却看不出来 |
| **D5** | 删 `changes.js` 里 5 个面向 Manifest 的函数，**保留 `logAvailabilityOf`**，并把 `machineDependenceProblems` 改挂到**产出的 HTML** 上 | data-docs 死后那套「日志数据集诚实性」零消费者；但 `/changes/` 自己的「没有拿到日志」措辞必须留（**那是读数，不是数据出口**）；机器无关性这条不能一起死 | 整套删掉 ⇒ 少一条真断言；整条保留 ⇒ 死码空转 |
| **D6** | 新建 `scripts/lib/site.js`，之后删 `scripts/lib/feeds.js` | 先搬常量再删文件（见 §1） | 顺序颠倒 ⇒ 十几个消费者同时断供 |

**硬规则二（本轮最容易漏的一条）**：厂商页删掉「订阅」一节后，`scripts/lib/vendor-page.js:606` 的 `const VENDOR_NOTE_COUNT = 6;` → **5**。它是 `build-local.js:2818` 的 `'main-vsnote': { min: kind === 'vendor' ? vendorPage.VENDOR_NOTE_COUNT : 0 }` 的**唯一输入**（16 个 `kind=half` 厂商页 ⇒ `main-vsnote` 元素数 6→5）。不改 ⇒「声明 6 / DOM 5」构建期与真浏览器**双向红**。

---

## 4. §6 五个待决项的选择与理由

1. **`'feed-declared'` 码** → **(a) 删码**（连同 `FEED_SPECS` 与 fixture）。理由同 D2；同时把该 selftest 里的 Manifest 诚实性牙**换成** `machineDependenceProblems` 牙 —— **删掉一个牙就要补一个新牙**。
2. **`icon.png`** → **删**（D3）。
3. **`_notes.ndjson` 的性质** → **接受这次性质下降并明写**：代价是「清单与产物不再同目录、不能一起拷走」，收益是产物里再无可下载数据文件。**没有**选「留在 `dist/`、只在部署时排除」—— 那样任何以 `dist/` 为根的预览服务仍能下载它。
4. **`verify-site.js` 真值来源** → **策略 A**（D1）。
5. **`changes.logAvailability*`** → D5。

---

## 5. 余量棘轮（`thin-content-margin`）重登记

删页脚那 7 条链接会让 6 个页面余量下降，必须按仓库**规定的动作**重登记（`node scripts/tools/seo-verify.js --print-floor-margins`）。**`floor` / `kind` / `count` 三字段一字未动**（`floor` 是公式推导值，`seo-selftest` 会重算 `textFloor(kind,count) === floor`；改它才是「自己把地板降了」）：

| 页面 | 改前 | 删订阅层后 | 删页脚 7 链接后 | 余量 | floor |
|---|---|---|---|---|---|
| `need/no-card` | 710 | 690 | **683** | 50→30→23 | 660 |
| `category` | 923 | 845 | **838** | 123→45→38 | 800 |
| `category/audio` | 1083 | 1063 | **1056** | 123→103→96 | 960 |
| `need/ai-coding` | 976 | 956 | **949** | 136→116→109 | 840 |
| `category/image` | 1039 | 1019 | **1012** | 139→119→112 | 900 |
| `category/agent` | 982 | 962 | **955** | 142→122→115 | 840 |

它是**棘轮**（`seo.js:437-448`：`margin < residual.margin` 即红），余量只能往上走 —— 这次是**如实下调并留痕**，不是放宽判据。

---

## 6. §22c 变异（换靶）读数

被删页面曾是变异靶点：`WIDE_MUTATION_TARGETS` = `['plans/','status/','changes/','models/']`（原含 `feeds/`）；`M9a` → `plans/coding/`；`M13` → `archive/`；**`M15` 也换靶** `feeds/` → `status/`（变异定义**与**它的阳性对照一起换 —— 只换一半会让阳性对照打在已删页面上，变成永远绿）。靶点实测 `main-snote` 数：`changes/` 14 · `plans/` 12 · `archive/` 5 · `plans/coding/` 5 · `models/` 3 · `status/` 2。
⚠️ **`M15` 的靶页在本轮之后又换了一次**：`status/` → `plans/coding/`（2026-10-10，CI 修复轮 —— 那条靶页说明由 9 个文本节点组成，行归并结果是**字体度量的函数**，CI 上红、本机绿；详见 §17）。换靶同样定义与阳性对照一起换（`verify-site.js:8442` / `:8749`）。**本节的靶点读数按当时那一轮保留，不回改。**

---

## 7. 基线：`verify.json` **重建**，`verify-pre-fold.json` **冻结不动**

* **`verify.json` 重建**（`npm run verify:baseline` → **842 项 / 失败 0**，686742 B）。`verify:regress` = **848 项 / 失败 0**（6 条比对全绿：覆盖 80→80 · 卡片 50→50 · 首屏 6→6 · 页高 4764→4764 · 外链 0→0 · JS 错误 0）。
* **`verify-pre-fold.json` 一个字节没动**（679 B，mtime 仍 2026-10-08，sha256 `8C831684…E4815`，`git diff --numstat` **0 hunk**）。它不是基线生成器的产物：`verify:baseline` 是 `--json=`（写）、`verify:prefold` 是 `--compare=`（读着比），**两者不是同族命令**。这份文件是 2.30 那轮「回归基线被就地改写、等于自己把『卡片数不减少』的地板降了」（PROJECT_STATUS.md:1797 第 9 条）之后补的**证据锚**，存在意义就是对着它跑**如实红一条 62 → 50**（:1803-1804）。用当前实测整体覆盖 ⇒ 自比自恒绿、**牙被拔掉**。历史上它只被**外科手术式**改过**一个字段**（`research/home-topic-entry-cards-v1/REPORT.md:31,104`，附逐 hunk 归属与 blob 哈希）。
  * **只读诊断读数**：`verify:prefold` = **848 项 / 失败 1** —— 唯一红项就是设计性「卡片数不减少 62 → 50」（hreflang 假红在修法落地后消失）。
* **两句必须写明的话**：
  1. 重建**之后**跑 `verify:regress` 是**自比自**，它绿**不构成证据**。本轮的牙在：改前/改后对照、`gate:build`/`gate:browser`、以及 t7/t18 的独立验收。
  2. **重建带来的两处口径变化照实记账**：① **页高上限 5277 → 5478 px（+4.4%）** —— 机制是 `verify-site.js:9460` 的 `metrics.pageHeight <= ref.pageHeight × 1.15`，上限由**生成时实测**推导（老基线 `4589×1.15`，新基线 `4764×1.15`）；4764 是**上一轮（专题卡）**的既定读数，老基线停在它之前，本轮只是按规定生成器对齐。② **约 652 条检查项归不到本轮** —— 重建前基线只记 **181 项**而当前脚本有 **841 项**，根因是该基线**自 2026-09-29 起未重建**；删掉的 10 条里 8 条属本轮、2 条属历史，新增 670 条里**只有 18 条属本轮**。既有仓库卫生问题，**如实上报、不沉默吸收**，本轮不顺手治理。

---

## 8. 过程如实记录（六件）

1. **一个真实缺陷，且没有任何门禁拦住它**：中间某次改动在 `index.html` 注释里写入字面量 `<!--PRERENDER:vendorline-->`，**提前闭合外层注释**，使注释尾部作为**可见垃圾文本渲染在 186 个页面上**。构建自检、L1–L3、SEO 全绿，真浏览器门禁也没红（它只报了 18 条 `rel="alternate"` 族失败）。**这是覆盖缺口**：本仓没有「页面正文不许出现裸标记文本」的断言。已修复并全仓重扫；**没有为它新增断言**（避免与本目标无关的改动面），但记在这里。
2. **一次自伤与它的证据**：批量正则曾吃掉 `build-local.js` 的 `assemble` 尾部、`listArtifactFiles`、7 个 sitemap URL 常量、`renderDirectoryPage` 的 `extraBundle/extraHtml/extraCss`。已从备份逐段回填，并给两条**无遗漏证明**：顶层函数数 备份 51 = 现在 51，「只在备份里存在」的集合为**空**。
3. **一次断网停机与恢复**：停机时只有一名成员在跑（t7），采用**软停**（AgentTeams 的硬中断只有 `remove_member`，那会吊销 attempt 并把任务打回待领池，破坏原地恢复）。恢复方案写成磁盘文件 `.scratch/RESUME-PLAN.md`（自足：冻结锚、恢复命令、契约、七条不许翻案的口径）。恢复时核对：冻结锚未变、产物 240/184 仍在。
4. **一次成员级不可恢复故障**：`builder`（本轮完成 6 个任务）在承接 t17 时上下文超出模型单次上限（**648,663 token > 512,000**，`CONTEXT_WINDOW_EXCEEDED`）。处置：t17 转给上下文健康的成员。**容量问题，不是能力或纪律问题** —— 它此前每一笔都带自证读数与逐处 before/after。
5. **F1 的闭环，以及一条被我画错的边界**：t7 判 §8-1 **FAIL** —— `build-local.js` 的**运行时日志标签**「双 feed」与产物事实相反（产物带 `type` 的订阅声明 = 0）。修复前我立过一条边界：「残留全在注释/内部消息里、**不进产物、不进读者面**」据此停手。**这条边界错了一格**：§8-1 的口径明确包含**构建日志**，而那一处是**运行时字符串**（不是注释），**直接落在验收口径内**。⇒ t17 修复（10 处：1 处运行时字符串 + 9 处注释）→ t18 第二轮验收通过。**教训：「不进产物」与「不进验收口径」是两件事。**
6. **我自己犯的六处错（全部留痕，也全部由成员顶回或纠正）**：① 作业单 §5I 写成「pre-fold 也要重建」→ builder2 顶回；② §8.3 我给了**不可达的**「0 命中」→ 我实测后改判据；③ 我批准 `verify-site.js:1529` 改**双侧**判据并扩到 6 个位点；④ 对 `订阅` 的成因我解释错了（verifier 证伪，**结论不变**）；⑤ 841→842 我先给 `6/7`（把**代码位点数**当成**check 行数**）→ verifier 纠正为 `18/19`；⑥ 上面第 5 条那条画错的边界。

---

## 9. §8 十条验收（第一手实跑；§8-1 判 FAIL → t17 修复 → t18 第二轮复核通过）

| # | 验收项 | 命令 / 取证 | 结果 |
|---|---|---|---|
| 1 | 构建成功、**日志**无 Feed / 数据出口行 | `build-local --out=<tmp>` exit 0 + 日志禁词扫描 | **第一轮 FAIL（低危、源码层）→ 修复后 PASS** —— 首轮日志有 `… · 双 feed · …` 这条与事实相反的**运行时标签**；t17 修后词表命中 **Feed/feed/数据出口/RSS/JSON Feed = 0**，只剩 2 行**反向断言/策略**措辞（「元信息（不上块 / **不进**订阅）0」与「…无未登记文件 · 无 `*.ndjson` · **无订阅产物**」—— 后者正是替代 Feed 系统的那道产物资产门禁的自述） |
| 2 | 产物无数据文件 | §8.2 原命令 | **PASS** —— 恰 2 条：`sitemap.xml` + `assets/data/offers.json` |
| 3 | 读者面零暴露 | 两档判据（见 §11） | **PASS** —— (a) 13 词 raw = visible = comment **0 / 0 / 0**；(b) 入口词可见 **0**、注释 **368**（= 2×184，允许且应当存在） |
| 4 | `npm test` | | **PASS** —— 0 失败 |
| 5 | `npm run build`（含新门禁） | 构建 exit 0 + 产物资产门禁 | **PASS** |
| 6 | `node scripts/test/fitness.js` | | **PASS** —— 4 / 0 |
| 7 | `node scripts/tools/check-ci-consistency.js` | | **PASS** —— `39 项 0 失败`，且**实跑项数 == `--expect-checks=39`** |
| 8 | `npm run gate:build` / `gate:browser` | | **PASS** —— gate:build **36 脚本 / 35–41 s / 0 失败**；gate:browser **38 脚本 / 247–293 s / 0 失败**（修复后在新树上**重跑**，未复用） |
| 9 | 真浏览器打开 `dist/index.html` | `verify-site --dir=dist` | **PASS** —— **842 项 / 失败 0**（无 JS 错误 · 筛选 50→30 · 排序分带 4 · 卡片 50） |
| 10 | `git status` 无意外文件；`dist/` 不入库 | `git ls-files dist` / `check-ignore` | **PASS** —— `git ls-files dist` = **0**；`*.notes.ndjson` = 0；命中 `.gitignore:2 / :62 / :116` |

**「产物未变」的证明（复用的唯一依据，不是假设）**：① 修复后构建 vs `dist/` → **240/240 · changed=0**；② **t7 期录制的 manifest vs 当前 `dist/`** → 同样 **240/240 · changed=0**（0 缺 0 多）。⇒ t7 已通过的读数**据这两条**才被允许复用。
**重建确定性**：同一棵树两次构建**逐字节相同**（240 文件 sha256 `changed=0`），在其上 `--compare` = **848 项 / 失败 0** ⇒ 基线**不绑定单次构建**。

---

## 10. 对抗性证伪（四条独立证据，均未找到反例）

1. **旧/新判别器**：判据锚在 `type="application/(rss|atom)+xml|feed+json"`（**不**锚 `rel="alternate"`，否则会被 hreflang 假红）。旧产物：feed 声明 **426** / 186 页 · `feed/` 48 · 根 json 11 · `_notes.ndjson` · `icon.png` · `feeds/` · `docs/data/`；新产物：以上**全 0**。
2. **可下载面**：对 **56 个非 HTML + 184 个 HTML 按 URL 真请求全部 200**，**186 个站内链接目标 0 死链**，**可下载数据文件 0**（除被豁免的 `assets/data/offers.json`）。旧产物对照：**931 条**指向数据文件的链接。
3. **有界入口词扫描**（判据**写死在脚本里**；拉丁词加词界 —— 第一版就踩到数据英文原文 `feedback` 里的 `feed` 子串假命中并修掉）：

| | 命中总数 | 其中**指向文件或入口** |
|---|---|---|
| 改前（源码重建的等价旧产物） | 604 | **38** —— `.json` 29（`/docs/data/` 21 · `/plans/` 4 · `/feeds/` 2 · `/plans/coding/` 1 · `/status/` 1）· `Manifest` 5 · `endpoint` 2 · `Feed` 1 · `RSS` 1 |
| 改后 | 259 | **0** |

4. **名称多重集对账**（对账工具本身有牙，并已用**正例 + 两个反例**自测：丢一条稳定行 ⇒ `unpairedRemoved=1`；净增 +2 ⇒ 被 `net` 咬住）：`removed=18 / added=19 / net +1 / paired 18 / unpairedRemoved=0`；净增 1 = 首页第二条 hreflang 断言；**823 条同名项 `ok-flip=0`**（另一路比较因 `--dir` 改名少 1 条同名 = 822，两者都对）。与 2026-09-29 旧基线的跨版对账：`removed=10 / added=670`，那 10 条被**两个成员从两个方向**核到同一处（**8 条属本轮 + 2 条属上一轮专题卡**，后者在 HEAD 里就已是替换后的形态：`首屏完整可见卡片 ≥ 9 → ≥ 6`、`列表视图 ≥ 12 行 → ≥ 10 行`，注释自带 2026-10-05 授权）。

**并且：本轮没有下调任何首屏棘轮** —— `metrics.firstScreenFull` 在 HEAD 基线与新基线里**都是 6**。

**三条路由的字数差（悬案闭环）**：`/student/` `/developer/` `/free-api/` 改前 1650/6476/4645 → 改后 **1624/6450/4619**，三页**统一 −26 字** = 整段 `优惠变化： 变化雷达 · 订阅这些优惠`（19 字）**加**「开放数据」入口一起消失；**行数（12/67/45）、行文本、行结构直方图改前改后完全一致** ⇒ **预期后果，不是缺陷**。中途态的 −18/−73/−51 恰 = **−(行数 + 6)**，属**已被覆盖的中途态**（该产物已不存在，无法做文本级对照），**最终产物不含它**。

---

## 11. 判据层面的修正与裁定（本轮最值得留下的部分）

### 11.1 三处「判据本身有缺陷」——**改判据，且必须比原来更严**

| # | 判据原文 | 为什么错 | 修法（净增的约束） |
|---|---|---|---|
| 1 | 作业单 §5I：「`verify:baseline` 与 `verify-pre-fold.json` **对应重建**」 | 把两条不同族命令当成一回事（见 §7） | **不改**：冻结，只跑**只读**诊断并如实报读数；`--numstat` 对它 **0 hunk** |
| 2 | 作业单 §8.3：「读者面零暴露 = 0 命中」（原始 grep，含注释与 `<script>`） | 把三样**不是读者面**的东西算了进去：① 本仓纪律**要求**留的「为什么删」注释（`index.html:1285` 那条随共享页脚进 184 页 ×2 = **368** 行）；② 裸词 `订阅`（可见文本 81 处 / 36 页）；③ 见 11.2 的进一步判类 | **拆两档**：**(a)** 暴露词表**原始 grep 必须 0、连注释也不豁免**（实测 13 词三处全 0；`订阅这一家`/`订阅这些优惠` 同为 0）；**(b)** 入口词只要求**可见文本** 0（实测 0），注释里那 368 行**允许且应当存在**。净增约束：(a) 比原判据更严 |
| 3 | `verify-site.js:1529`：「首页 0 条 `rel="alternate"`」 | 把**订阅声明**与 **hreflang 语言声明**数在一起，而 `index.html:26-27` 自 v1.x 起就有两枚不带 `type` 的 hreflang ⇒ **对首页永远不可能为真**；更要命的是同仓 `build-local.js:6268` 的首页自检**反过来要求** `hreflang="x-default"` 必须存在 —— 同一页两条契约**直接矛盾**。另有 **80 个 deal 页**各带 2 枚 ⇒ 错的是**规则本身** | **6 个位点改用一份共享判据**（`subscriptionDeclarationProblem()`，唯一实现，内联副本 0 份）：① 带 `type` 的 alternate 必须 0；② 剩下的**必须全部带 `hreflang`**（首页另断言「恰好 2 条」）。净增约束：只做 ① 的话**抹掉 `type` 就能骗过它**，② 堵死这条路 —— 并已用**三种破坏实跑**证明它会红（注入 Feed 声明 / 抹掉 `hreflang` / 删掉一枚；含阳性对照，且**无副作用红**） |

**四次都是在门禁红了之后才发现，而且其中两次的「省事修法」都会变成放宽。判据错的时候，最省事的动作恰好就是最有毒的动作** —— 所以每条修法都必须回答：**改完之后，什么情况下它还会红？**

### 11.2 五处「不修 / 豁免」——不改产物，只把依据写下来

| 对象 | 裁定 | 依据 |
|---|---|---|
| `订阅` 系（`免费订阅` 34 处 · `订阅型` · `长期订阅套餐`） | **保留** | **产品词汇**（描述优惠的付费形态），不指向任何文件或下载；改它等于改读者看到的**业务语义**（`free_subscription` 的中文标签就是它）。⚠️ **我最初的解释是错的**：我说「全在数据真值里」，verifier 逐条判类（68 处 / 36 页，unknown = 0）证明 `免费订阅` 的标签来自站点源码 `audience.js:90-95 BENEFIT_LABELS`。**结论不变**，因为判据是「**是否指向数据文件或入口**」，不是「住在哪个文件里」 |
| `数据集`（可见 68 处）· `数据源`（187，页脚「数据源状态」，指向**页面**）· `清单`（4） | **保留** | 都是**不指向文件、不给下载的泛义名词**；且 `数据集` 已有**上一轮的书面裁定**（`research/_raw/secondary-page-residue-v1-census.md:548` 起 22 处，「C 数据语义 \| 留」），本轮顺手改掉 = **静默推翻留档决定**；其中 `本条记录首次进入数据集` 还被 `api-plans-selftest.js:1125` 断言钉着 |
| 降级路径里的历史日志文件名（`changes.js:99`、`plan-history.js:186`、`plan-changes.js:107`、`api-plan-history.js:148`，例如「本次构建没有拿到历史日志（`deal-history.json` 缺失或损坏）」） | **豁免**（登记为残留） | 它们是**构建输入（仓库侧真值）**的文件名，**不是已发布产物、也不是入口** —— 读者按这个名字下载不到任何东西（产物里早已没有它们）。§8.3 (a) 档词表列的**全是已发布产物名**，本就不该收它们；D5 也明确要求保留这套「没有拿到日志」措辞（**那是读数与诚实性，不是数据出口**）。改它还要连带改 `plans-selftest.js:1626` 的**整串替换 fixture**，而收益为零 |
| `feedMatch: page.feedMatch`（`build-local.js:6530`）**死字段** | **故意保留** | 全仓 `feedMatch\|feedIds` 18 处命中里**消费者 0**（生产点只剩这一处调用、3 处注释、2 处测试 fixture）⇒ 可证明惰性。但它属于**描述符字段**：清它**有可能改变产物**，而产物一变，本轮的 `dist/`、基线 842/0 与**全部产物级证据一起作废**，收益为零。**留给下一轮**，并要求那时用 t17 的手法证明「产物逐文件 sha256 不变」 |

### 11.3 注释事实性收口：三笔已开 + **明确划界**

t13 改 9 处 · t15 改 2 处 · t16 改 5 处（核实后不改 1 处）· t17 改 9 处注释（另 1 处运行时字符串）· **t19 改 8 hunk / +25 −7（非注释行 = 0）** —— 每笔都**只动注释/注释性字段**，且用「构建 exit 0 + fitness + 读源码文本的 selftest」自证；t19 还给出**「只动注释」的机器证明**：把新增文本在临时副本里逐处反向还原后 `git diff --no-index -U0`，**非注释行 = 0**，并附产物对账 240/240 `changed=0`。t19 关闭了终局复核的三条注释级 findings（含 `:4487` 那条与 D1 正好相反的「必须读 `dist/*.json` 而不是内存对象」），并**主动一并修掉同族第 4 处**（`:96` 仍写「发布 `dist/deal-plan-links.json`」—— 与前者是同一条假话，不一起改就留半截）。

> **一条防误读（写给逐 hunk 归属的复核）**：粗筛「含标记的 hunk」会在 `@@ -7174,3 +6494,5 @@` 里看到一条 `−` 代码行 `feedMatch: feeds.feedsForPage(…, built.feedBundle.feeds)` —— 那是 **t4** 早前删除的（它引用已消失的 `built.feedBundle`），**不是** t19 的修复。逐 hunk 归属必须以**隔离 diff** 为准。
**仍留在注释里的残留（逐处列出，不沉默地留着）**：`scripts/tools/build-local.js` 若干处、`scripts/tools/verify-site.js` 里的同类提及（**该文件已冻结**，为它动一行就要让四轮牙齿测试整轮重跑 ≈40 分钟）。
**一条「不做」的正确判断**：`seo-selftest` 的 `wordingSources` **没有**补 `site.js` —— 补了就是一次**恒真的空登记**（`site.js` 是常量源，不是措辞源）。

---

## 12. 有意为之的例外与明确不做的事

* **例外（有界、可复现、逐笔披露）**：① `research/_raw/p2-residuals-v1/text-floor-margins.json` 由本仓**规定的动作**（`--print-floor-margins`）重登记；② `scripts/data/vendor-slugs.json` 的 `_note` 改一句（原写「订阅 `/feed/vendor/<slug>.*` 与落地页共用同一个」→ 改成事实并注明那套订阅已下架）—— 属**注释性字段**，非数据非 schema，且改后三支读它的 selftest 全绿（audience 206/0 · plans 262/0 · vendor-page 57/0），**25 个 slug 条目一字未动**；③ `research/_raw/ours-baseline/verify.json` 重建（§7）。任何门禁若因此变红，**立即回退**。
* **不做**：不动任何数据真值文件的内容与 schema（`deals.json` / `plans.json` / `api-plans.json` / `models.json` / `scripts/data/**`）；不引入服务器、不改部署方式；不删 `/status/`、`/changes/`、`/archive/`、`/models/`、`/plans/` 这些页面；**不因为「让门禁变绿」而放宽任何断言**或删掉与本目标无关的测试；不重构与本次目标无关的代码。

---

## 13. 线上状态与局限（**2026-10-09 22:30 实测**；不许被写成「线上也验过了」）

> ⚠️ **本节是 2026-10-09 22:30 的快照**（那一刻线上**仍是改前形态**、本分支也**还没合并**）。
> **2026-10-10 01:0x 已经合并并上线**，上线后的实测读数在 **§18**；本节按当时读数保留，不回改。

### 一、本机出站网络（原「无网络」的判断已过时）

`buguoshixc.github.io`（Pages CDN）· `github.com` · `raw.githubusercontent.com` · `codeload.github.com` 均**可达**（HEAD 200）；`api.github.com` 403（可达但拒绝无认证请求）；对照 `example.com` / `baidu.com` 均 200。
**但到 `github.com` 的连接不稳** —— 同一分钟内 `git ls-remote` 曾 **21 s 超时失败**，随后 `https://github.com/` 的 HEAD 又返回 200。

### 二、线上**仍是改前形态**（本节最关键）

本轮**只改代码、不部署**（不提交、不推送、不动 `deploy.yml`），所以线上没有变化，实测：

* **14 份数据 / 订阅产物仍可按 URL 下载**（全部 HTTP 200）：`deals.json` 320,558 B · `plans.json` 91,744 · `api-plans.json` 106,716 · `models.json` 48,014 · `model-registry-links.json` 55,878 · `deal-history.json` 96,546 · `plan-history.json` 39,608 · `api-plan-history.json` 81,533 · `deal-plan-links.json` 3,779 · `source-health.json` 4,564 · `feed.xml` 84,796 · `feed.json` 82,334 · `icon.png` 808 · `data/index.json` 4,125。另有 `/feeds/`（200，100,522 B）与 `/docs/data/`（200，103,215 B）两族页面。
* 线上首页（406,299 B）仍含 `deals.json` ×**12** · `开放数据` ×2 · `feed.xml` ×1 · `feed.json` ×1 · `rel="alternate"` ×**10**。
* 线上 `/feeds/`（100,522 B）仍含 **`JSON Feed` ×28 · `RSS` ×28** · `plans.json` ×2 · `api-plans.json` ×1 等。
* `assets/data/offers.json` 线上 **404**（尚未部署）。

⇒ **「零暴露」目前只在本地成立。线上要等「提交 + 推送」触发部署之后才成立；部署不在本轮范围，且需要用户明确确认。**

### 三、上线还差什么（同一时刻实测）

`HEAD` = `0b84091`（**本轮改动之前的提交**）；工作树 **71 条变更 / 未跟踪**；本地 `master` **落后 `origin/master` 4 个提交**。那 4 个提交里**有另一个会话的两笔 PR 与一笔数据更新**：

* `8b08596 docs(residue): 报告同步队长终验读数 —— 全量 gate 53 步/0 失败 + 合并与部署链 (#109)`
* `2b1f0aa feat(residue): 收口两件遗留 —— 扫描面外 8 类容器 + 47 行待确认，并把「删掉不许回流」扩到新扫描面 (#108)`
* `89b8d03 chore(data): 更新优惠数据、来源健康与变更记录 2026-10-09 12:47 CST [skip ci]`
* `f091ac4 Merge pull request #107 from buguoshixc/docs/closures-v6`

**与本轮的交集 = 14 个文件**（双方都改过）：`.github/actions/gate/action.yml` · `PROJECT_STATUS.md` · `README.md` · `docs/BUILD.md` · `docs/DESIGN-RULES.md` · `index.html` · `package.json` · `scripts/lib/api-plans-page.js` · `scripts/lib/models-page.js` · `scripts/lib/plans-hub-page.js` · `scripts/lib/plans-page.js` · `scripts/tools/build-local.js` · `scripts/tools/check-ci-consistency.js` · `research/secondary-page-residue-v2-census.md`。

**冲突代价分档**：`index.html` 对方只动 **1 行**（几乎无冲突）；**`scripts/tools/build-local.js` 对方动了 655 + / 8 −，本轮动了约 1127 + / 423 −** ⇒ 合并的主要工作量在这里。另有 **delete/modify**：对方的树里 `scripts/lib/feeds.js`、`scripts/lib/data-docs.js`、`scripts/tools/feeds-selftest.js` / `feeds-report.js` / `check-feeds-reproducible.js` / `data-docs-selftest.js` **都还在**（`#108` 还改过 `feeds.js`），而本轮把这些**删了** ⇒ 合并时必须逐个定夺（本轮立场是删；若对方新增的 `scripts/tools/check-residue.js` 引用了它们，需一并收口）。

**`git` 侧的网络**：系统代理**已开**（用户级 `ProxyEnable=1`、`ProxyServer=127.0.0.1:7890`），但 **`git` 的 `http.proxy` / `https.proxy` 未设** ⇒ `git fetch`/`push` **直连失败**（实测两次 21 s 超时；`Test-NetConnection` 显示 TCP 能连上，但 TLS/HTTP 走不通）。修法一行：`git config http.proxy http://127.0.0.1:7890`。

**已执行 —— 见 §16**：合并完成、冲突已解决，并在**合并后的树**上重跑了全套门禁（L1–L4 + 验收 + 对方守卫 + 冻结锚复核），**全绿**。**仍未推送、未部署。**

### 四、其余局限

没有第二份部署可对比；`.git` 历史与部署缓存不可控；本轮**不启动任何常驻服务器**（浏览器面交由 `gate:browser` / CI）。本地结论的证据面是**本地产物 + 本地真浏览器**。

### 五、改前一侧的证据力

唯一真实的旧 `dist/` 在 19:28:15 被其它会话重建覆盖、**已不可恢复**（44 份工作树产物无一份逐字节相同）；「改前」一侧用的是 **`git archive HEAD` 源码重建的等价旧产物**（根文件 18/21 尺寸相同，仅 `index.html` / `_notes.ndjson` / `source-health.json` 因构建时间戳略差），标签 `before-source-rebuilt-head-0b84091`。

---

## 14. 复跑入口（证据脚本，只读）

`.scratch/` 下这些是**证据**，复跑即可重现读数：`adversarial-probe.js` · `old-new-discriminator.js` · `scan-entry-words.js` · `classify-subscription-hits.js` · `check-row-attribution.js` + `selftest-attribution.js`（对账工具自身的正/反例自测）· `captain-subscribe-scan.js` · `before-baseline.json` / `entry-word-scan[-before].json` · `old-src/`（改前源码重建的等价旧产物）· `t7-verification-report.md` · `t18-verification-report.md` · `t7-falsification-plan.md` · `RESUME-PLAN.md`。

**环境事实**：浏览器门禁用 `NODE_PATH=.worktrees\nm-baseline\node_modules`（`playwright-core` **1.63.0**）+ 系统 Edge；**不要跑 `npm ci` / `npm install`**（根 `node_modules/` 是空目录，且该工作区与其它会话共享）。门禁全本地，**只需本地即可复跑**。

---

## 15. 留给下一轮（本轮**明确不做**，附各自的验收前提）

| 项 | 为什么本轮不做 | 下一轮做时的**验收前提** |
|---|---|---|
| `feedMatch: page.feedMatch` 死字段（`build-local.js:6530`） | 属**描述符字段**；清它可能改变产物 ⇒ 会作废本轮的 `dist/`、基线 842/0 与**全部产物级证据**；收益为零（消费者 0，可证明惰性） | **先证明「产物逐文件 sha256 不变」（240/240）**；否则必须整轮重跑验收 |
| `index.html` / `changes.js:99` / `plan-history.js:186` / `plan-changes.js:107` / `api-plan-history.js:148` 降级路径里的历史日志文件名 | 是**构建输入（仓库侧真值）**的文件名，**不是已发布产物也不是入口**；D5 要求保留这套「没有拿到日志」措辞（那是读数与诚实性）；改它要连带改 `plans-selftest.js:1626` 的**整串替换 fixture** | 同步改 fixture 并证明**判据没被放宽**；同样以「产物 sha256 变化可解释」为前提 |
| `scripts/tools/verify-site.js` 里的同类注释残留 | 该文件**已冻结**（sha256 `6B9EFF64…D9865`）；动一行就要让牙齿测试的四轮实跑整轮重跑（≈40 分钟） | 与**下一次**改该文件的改动合并成一笔，并重跑 M0–M3 牙齿测试（含阳性对照） |
| 「页面正文不许出现裸标记文本」这条**覆盖缺口**（§8 第 1 条那个缺陷没有任何门禁拦住） | 本轮已修复缺陷，但**没有为它新增断言**（避免与本目标无关的改动面） | 新增断言时须给出「把改动破坏掉会红」的**实跑**证据（本仓惯例），并说明它挂在哪一层 |
| **基线新鲜度**（历史问题：`verify.json` 自 2026-09-29 起未重建，导致 ~652 条检查项从未被 `verify:regress` 守住） | 属既有仓库卫生问题，超出本目标范围 | 每轮改动落地后即重建基线；否则 `verify:regress` 只守住它收录的那一小部分 —— 这条是本轮**最值得带走**的流程教训 |

---

## 16. 合并 `origin/master`（4 个提交）与冲突处置

**背景**：本分支基于 `0b84091`，而 `origin/master` 领先 4 个提交 —— 另一个会话的 `#108 feat(residue)`、`#109 docs(residue)`，以及一笔数据更新 `89b8d03 chore(data) … [skip ci]`。本轮改动与它们**交集 14 个文件**。

**结果：只冲突 3 个文件**，其余（含 `index.html`、`package.json`、`build-local.js`、四份页面 lib、`PROJECT_STATUS.md`、docs）**自动合并成功**：

| 冲突 | 类型 | 处置 |
|---|---|---|
| `scripts/lib/feeds.js` | modify/delete | **判删**（本轮立场）。核实过：对方那笔对它的改动是 **+28 / −0 且 28 行全部是注释**（一条「保留 `/feeds/` 某条 `.snote`」的裁定）—— 而该裁定的**前提是 `/feeds/` 页族存在**，本轮已把整族下架 ⇒ 裁定随之失效、注释随文件消失，**无功能损失** |
| `.github/actions/gate/action.yml` | content | **取并集**：保留对方新增的 `Residue guard` 步骤，丢弃本轮已删的 `Feeds reproducibility`（原地写明合并说明） |
| `scripts/tools/check-ci-consistency.js` | content（3 处） | 同上；改完**实跑**它自证 **`39 项 0 失败`** 且 `(E) 实跑项数 == --expect-checks=39` —— 三处登记在合并后仍自洽 |

### 一处必须「动对方机制」的实质性调和（记在最显眼处）

对方 `#108` 新增的**构建期自检**里有一张「容器存在性下限表」，其中 `.fdesc` 的地板是 **18**，`why` 写着「订阅中心每份 Feed 一行说明（25 份 Feed…）」—— **这个容器只存在于 `/feeds/`，而那一族已被本轮整体下架** ⇒ 合并后 `.fdesc` 实测 **0** ⇒ **构建被永久卡死**。

他们的实现是**刻意防篡改**的（三条规则：① 表的类集合必须与代码声明**逐类一致**；② 每行 `measured`/`floor` 必须是**正数**；③ `floorRatio` 有硬下限 `RESIDUE_MIN_FLOOR_RATIO_HARD`），所以**不能**「把地板改成 0」—— 那正是他们 `_floorSelfGuard` 要挡的动作。处置 = **有记录地退役这一类**：

* `scripts/data/residue-guard.json`：`containerFloors` 去掉 `fdesc` 行，新增 **`_retiredFloors`** 记录（含原 `measured: 25` / `floor: 18`、退役时间、退役者，以及「为什么必须退役而不是改成 0」）；
* `scripts/tools/build-local.js`：`RESIDUE_CONTAINER_CLASSES` 同步去掉 `fdesc`（**两处必须同步**，否则 `tabulated !== declared` 一致性检查会红），并在类声明上方写清退役缘由；
* 顺带修掉 **7 处**已过时的「8 类容器」措辞 —— 其中 `check-residue.js` 的两处是**运行时消息**（与本轮 §8-1 的 F1 同类），改为**从数组现算**（`readings.floors.length`），不会再漂移。

### 合并后的重新验收（全部实跑）

| 项 | 读数 |
|---|---|
| 构建 | `build-local.js` **exit 0** · **240 文件 = 184 页面 + 56 非页面** · 数据资源 1 份 · 无未登记文件 / 无 `*.ndjson` / 无订阅产物 |
| 对方守卫 | `check-residue --dir=dist` **exit 0**：44 条被删文案三遍 0 命中 · **7 类**容器均不低于下限且关系式成立 |
| 我方判据 | 暴露词原始扫描（含注释与 `<script>`）**0 个文件命中** · 可下载数据文件**恰 2 个**（`assets/data/offers.json` + `sitemap.xml`） |
| 便宜门禁 | `npm test` ✅ · fitness **4/0** · `check-ci-consistency` **39/0** |
| L1–L3 | `npm run gate:build` **36 脚本 / 0 失败 / exit 0**（40.8 s） |
| L4 | `npm run gate:browser` **38 脚本 / 0 失败 / exit 0**（267.2 s） |
| 验收 | `verify:baseline` **842 项 / 0 失败** → `verify:regress` **848 项 / 0 失败** |
| 冻结锚 | `verify:prefold`（**只读**）**848 项 / 失败 1** = 唯一设计性「卡片数 62 → 50」；`verify-pre-fold.json` 的 **`--numstat` 0 行 = 一字未动** |

### 一条会误导人的环境事实（复跑必须照用）

根 `node_modules/` 是**空目录**（本工作区与其它会话共享；**不要跑 `npm ci`**），所以需要浏览器的步骤**必须带 `NODE_PATH`**：`NODE_PATH=.worktrees\nm-baseline\node_modules`（`playwright-core` **1.63.0**）+ 系统 Edge。

**不带它时的失败具有误导性**：`selftest:health` 会以 **69 通过 / 3 失败**收场（H1「端到端采集 exit=1」），`gate:build` 随之在 L2 fail-fast；**带上它就是 72 / 0**、`gate:build` 全绿。这一条实测过两次，写在这里免得下一个人把它当成回归。

---

## 17. CI 修复轮（PR #110 第一次 CI 红 → 修因 → 本机复验）

### 一、症状：38 项里**只有一条**红

PR #110 的 CI（run `37951801398`，`gate` **3m28s · fail**）其余全绿，唯一红的是：

```
✗ §22c M15 承重证明 … 按行归并 ≤ 1 行
  读数：note-ink-narrow 1 条 [status/#0] · 列 3 / 列栈 54.78px / 行 3 / 内容框 1380px / 阈值 1173px / note-narrow 0 条
```

**先排除一条错线索**：一开始怀疑 `ch`（本机 `70ch` = 452.81px，`ch` 依赖字体）。**不成立** —— M15 的注入规则里根本没有 `ch`（`70ch` 在 M8，且 M8 判据用比例阈值 `0.85×列宽`，与 `ch` 取值无关）。

### 二、根因：那条「前提」本身是**字体度量的函数**

红的是承重证明里的 `lineEvidenceMissing = rowsOfInk.every(note => note.lineCount <= 1)`（`verify-site.js:8614`）。机制：

* `lineCount` 来自 `mergeLines()`（按**垂直重叠 > 较矮者 50%** 归并字形盒）；
* 而 `glyphRectsOf()` 是**逐文本节点**建 `Range` 的 ⇒ **列片段的边界 = 文本节点边界**；
* 旧靶页 `status/` 那条说明由 **9 个文本节点**组成（4 个 `<b>` 片段各 4 字：最近一次 / ❌ 失败 / ⚠️ 异常 / ✅ 正常）；字体步进一变，短片段就落进**列的中段**，行归并的单元数随之变化。

| 读数（同一提交） | 列 | 列栈 | 行 | 字形盒 | 文本节点 |
|---|---|---|---|---|---|
| CI（ubuntu + playwright chromium） | 3 | 54.78px | **3** | 9 | 9 |
| 本机（Windows + Edge） | 17 | 342.25px | **1** | 24 | 9 |

⇒ 同一份代码在不同字体下给不同结论：**本机绿、CI 红**。坏的不是牙，是「前提」被写成了一条与字体有关的读数。

### 三、修法（**只加严**；原判据一个字符都没删）

1. **量测侧新增结构量**：`textRunCountOf()`（非空白**文本节点**个数，与 `glyphRectsOf` 同一套遍历口径：排除 `<noscript>`）→ `wideMeasure` 的 `note.textRuns`。
2. **承重证明补结构性前提**：在原有 `lineEvidenceMissing` **之外**再要求
   `singleRunEvidence = rowsOfInk.length > 0 && rowsOfInk.every(note => note.textRuns === 1)`（`verify-site.js:8616`，与前者串在同一个 AND 里）。
   **单文本节点时「行归并恰 1 个单元」是可证的**：`glyphRectsOf` 逐文本节点建 Range ⇒ 首个片段从列顶开始、后续都是折列的续段 ⇒ 全部片段**顶边相同** ⇒ 逐个并入时垂直重叠恒等于较矮者全高（> 50%）⇒ 必然并成 1 个单元。**这个推理里没有任何字体量。**
   量不到该字段（老几何 / 合成几何）⇒ `undefined === 1` 为假 ⇒ **判红**（fail-closed，与 `ch70` 那条前置同一纪律）。偏严方向也安全：零高片段会各自成单元 ⇒ 只会变红，不会假绿。
3. **换靶** `status/` → `plans/coding/`（注入形态 `rule` **逐字未动**，仍是 T31 的 P1；变异定义**与**它的阳性对照**一起换** —— 只换一半会让正对照打在旧靶页上变成永远绿）。
   取靶依据（产物普查）：`<main>` 内 `.snote` 具备「**所有可能被咬的条都是单文本节点**」的页面只有 `plans/coding/` 与 `changes/`；取前者是因为被咬的条要**够长**才有承重面（② 要求 `字数 × 字符步进 > 5.6rem = 89.6px`）—— `changes/` 最长只有 62 字，在 CI 那种步进下约 87px < 89.6px，**可能一条都咬不到**。
4. **靶页结构**（真 DOM 复核，口径同 `textRunCountOf`）：`plans/coding/` 的 5 条 `.snote` 里，有内容的 **3 条逐条都是单文本节点**（`#0` 84 字 / `#2` 41 字 / `#4` 67 字，全部被咬）；另 2 条**进不了被咬集合** —— `#1` 的文字**全在 `<noscript>` 里**（脚本开启时可见文本 0，就是 `wideProblems` 里「真·合法未渲染」那条）、`#3` 是构建期的空占位 `<p class="snote"></p>`。
   ⚠️ **一处自我订正**：本轮初稿的注释与 `DESIGN-RULES.md` N6 曾写成「该页 5 条说明逐条都是单文本节点」—— 那是**正则**普查（`.scratch/census-notes.js`）的口径，它把 `<noscript>` 里的文字也算进去了。已按真 DOM 读数收准成上面这句，并写明判据要的是「**全部被咬的条**单文本节点」而不是「页面内全部单文本节点」。

### 四、复验读数（最终树 · 本机实跑）

| 项 | 读数 |
|---|---|
| `npm run gate:browser`（L1–L4） | **38 脚本 / 0 失败 / 273.7 s / exit 0**（`✗` 行 0 条） |
| `npm run gate:build`（L1–L3） | **36 脚本 / 0 失败 / exit 0** |
| `node scripts/tools/verify-site.js --dir=dist` | **验收 842 项，失败 0 项**（项数**没变**：只把既有那条改严，没有增删断言） |
| `npm run check:ci` | **39 项 / 0 失败 / exit 0** |
| M15 承重证明（新靶页逐条） | `#0` 列 12 / 列栈 240.3px / 行 1 / 内容盒 1380px / 文本节点 1 · `#2` 列 5 / 97.56px / 行 1 / 节点 1 · `#4` 列 8 / 158.73px / 行 1 / 节点 1 · 列宽 1380px · 阈值 1173px · `note-narrow 0 条` · **结构前提（逐条单文本节点）true** |
| M15 正对照（同页不注入） | `plans/coding/@1440` 说明 5 条（竖排 0）违规码 **[无]** ⇒ 严格形式成立 |
| M15 隔离性 | 允许 `[note-ink-narrow, note-intro-long]` · 实测恰为这两个 · **无伴随码** |

**字体扰动实测**（用**交付的那份脚本**、只给 M15 靶页再叠一条 `letter-spacing`，临时副本跑完即删 —— 等价于「同一份产物换一种字符步进」）：

| 字距 | 验收 | 承重证明 | 隔离性 |
|---|---|---|---|
| 0 / −8.5 / **−9.5**（正是把老靶页读出 `列3/行3` 的那一档）/ −9.9 px | 842 / 0 ✅ | ✓ | ✓ |
| −10px | 842 / 1 ❌ | ✓ | ✗ `note-hidden-text`×2 |

`−10px` 那条红**不是形态问题**：负步进把两条说明的 `getClientRects()` 压空（字形盒 0）⇒ `note-hidden-text` 响；真实字体没有负步进，且真出现「有正文却零字形盒」时那个码正是该响的。

### 五、如实写清：残留的环境依赖与失效方式

M15 需要**至少一条**被 ② 咬中的条 ⇒ 要求 `字数 × 字符步进 > 5.6rem(89.6px)`。新靶页最长说明 84 字 ⇒ 需步进 `> ~1.07px/字`；CI 现场反推约 **1.4–2.1px/字**（由「128 字只铺开 3 列」反推）⇒ 约 **1.3–2× 余量**。若将来某环境的步进更小（整条说明塌成一个墨点），M15 会以「**期望码没出现**」判红 —— 那种字体下这个形态本身已不再是「窄条」缺陷（没有可判的铺开面），**处置是换一条更长的单文本节点靶页，不是放宽判据**（这一句已写进 `verify-site.js:8436-8441` 的注释）。

### 六、文档订正

`docs/DESIGN-RULES.md` 的 **N6** 原写「竖排下按行归并**恒为** 1 行」——**这句是错的**。已订正为「只在**单文本节点**时可证；多文本节点时是字体度量的函数（附 CI 实测读数）」，并把 `textRuns === 1` 加进断言清单；历史段按当时读数保留、**不回改**（只加 2026-10-10 订正指针）。

### 七、这一步的最终裁判是 CI 本身

本机（Windows + Edge）无法造出 CI 那台的字形步进环境，所以**本轮的结论只到「本机 + 结构证明 + 字体扰动」为止**。上线前必须由 CI（ubuntu + playwright chromium）给出：`✅ 验收 842 项，失败 0 项`，重点看 `§22c M15 承重证明` / `M15 隔离性` / `M15 正对照` 三条。若 CI 上 `plans/coding/#0` 也咬出 `note-ink-narrow`（期望 `列 ≈ 2–12 / 行 1 / 文本节点 1`），则「按行归并 = 字体度量的函数」这条根因同时被**证实**。

---

## 18. 合并 → 部署 → 线上实测（2026-10-10 01:1x）

### 一、CI 复验：修法在 **CI 的字体环境**下成立（这是本轮唯一的真裁判）

* run **`37962743203`**（head `4bf4b3d`，`gate`，**success / 5m1s**）：`✅ 验收 842 项，失败 0 项` + `✅ 验收 848 项，失败 0 项`（`verify` / `verify:regress`）· `✅ CI 口径检查 39 项，失败 0 项`。
* M15 三条断言在 CI 上全 ✓（原话读数）：
  * 承重证明：`note-ink-narrow 3 条 [plans/coding/#0, plans/coding/#2, plans/coding/#4]` · `#0 列 3 / 列栈 54.78px / 行 1 / 内容盒 1380px / 字形盒 3 / 文本节点 1` · `#2 列 2 / 34.39px / 行 1 / 节点 1` · `#4 列 2 / 34.39px / 行 1 / 节点 1` · **结构前提（逐条单文本节点）true**
  * 正对照：`plans/coding/@1440 说明 5 条（竖排 0）违规码 [无] ⇒ 严格形式成立`
  * 隔离性：`允许 [note-ink-narrow, note-intro-long] · 实测恰为这两个 · 无伴随码`
* **§17 二那条字体推断被 CI 证实**：同一条 84 字说明在 CI 上只铺开 **3 列 / 54.78px**（本机 **12 列 / 240.3px**）⇒「按行归并 = 字体度量的函数」成立；而它**仍然咬得到**（54.78px ≪ 1173px 阈值、列数 ≥ 2）。
* **如实追加的一条新读数**：CI 上 `#2` / `#4` 的列数正好是 **2** = `columnCount >= 2` 的下限 ⇒ 这两条的余量是 **0**。若将来某个 runner 的步进更小，它们可能塌成 1 列，届时这条断言会**判红**（可见失败，不是假绿）—— 与 §17 五同属「靶页在某环境下失去承重面 ⇒ 换一条更长的单文本节点靶页」，**不是**放宽判据。

### 二、合并与部署

* PR #110 的合并提交 = **`c015314`**（merge commit，与仓库既有风格一致）。
* 同一次推送上的两个 master 运行都成功：`Verify site (gate)` **`37963513349` ✓** · `Deploy to GitHub Pages` **`37963513363` ✓**（prepublish 5m34s · build 13s · deploy 11s）。

### 三、线上实测（脚本 `.scratch/live-verify.js`，只读；读数由我本机发请求量得）

* **部署与产物同源（逐字节）**：线上 `/` = **406520 B**、sha256 `0271311be6a7fc91…`，与本机 `dist/index.html` **完全相同**（`.scratch/live-context.js`）。⇒ 线上跑的就是通过门禁的那份产物，不是「另一次构建的近似物」。
* **① 必须 404：21/21 全对** —— `deals.json` · `plans.json` · `api-plans.json` · `models.json` · `model-registry-links.json` · `deal-history.json` · `plan-history.json` · `api-plan-history.json` · `deal-plan-links.json` · `source-health.json` · `feed.xml` · `feed.json` · `icon.png` · `data/index.json` · `feeds/` · `docs/data/` · `docs/data/index.json` · `feeds/deals.xml` · `feeds/deals.json` · `feeds/all.xml` · `feeds/all.json` ⇒ **线上已经没有任何一份数据文件 / 订阅产物可以按 URL 下载**（`feeds/` 族另抽查了 4 个代表 URL，全 404）。
* **② 必须 200：12/12 全对** —— `/` · `/status/` · `/changes/` · `/archive/` · `/models/` · `/plans/` · `/plans/coding/` · `/plans/api/` · `sitemap.xml` · `robots.txt` · `favicon.svg` · **`assets/data/offers.json`（286581 B —— 首页自己那份数据的新路径，可读）**。
* **③ 暴露词：9/9 页面全 0 命中**（首页 + 七个保留页 + `sitemap.xml`）。订阅声明按**两端**判定：**无 `hreflang` 的 `rel="alternate"` 共 0 条**；首页那 2 条 `rel="alternate"` **都带 `hreflang`**（`zh-CN` / `x-default`，`type` 为空）⇒ 是**语言备用页**声明，不是订阅源；`application/rss+xml` / `application/feed+json` / `application/atom+xml` 全站 **0 次**。
* **④ `sitemap.xml`：0 命中** —— 不再登记 `feeds/` 与 `docs/data/` 两族。
* **读者可见层单独量了一次**（`.scratch/live-visible-check.js`，真浏览器读 `document.body.innerText`）：12 个词（**含下面那两处豁免的文件名**）在**可见文字里命中 [无]**；线上字节剥掉 `<script>` / `<style>` / 注释后的文本层命中也 **[无]**；`head` 里订阅类 `type` 声明 **0 条**。（线上首页与产物逐字节相同，故在产物上量等价。）

### 四、如实写清：线上首页仍有的两处文件名 —— **上一轮已裁定豁免**，不是新暴露

两处**都只在内嵌 `<script>` 里**、各出现 **1 次**，**不在读者可见文字里、也不是链接**（对应文件本身 404）：

| 出现处 | 线上原话（节选） | 为什么不算暴露 |
|---|---|---|
| `deal-history.json` | `"unavailable":"本次构建没有拿到历史日志（deal-history.json 缺失或损坏），因此无法显示变化记录 —— 这不表示「没有变化」。"` | 退化路径文案里指名的**构建期输入**；不提供下载、也不构成入口 |
| `deal-plan-links.json` | `…构建期由 scripts/lib/deal-plan-links.js 从人工关系表 scripts/data/deal-plan-links.json 算出来并注入…` | 指名的是**仓库侧路径**（`scripts/data/…`），站点上不存在这个文件 |

验收脚本对这两条**不是「不查」而是划了边界**：一旦它们出现在 `<script>` 之外（= 读者可见文字或可点链接）就判红（`.scratch/live-verify.js` 的 `EXEMPT_IN_SCRIPT_ONLY`）。**若读者要求连退化路径文案也不许提文件名，那是另一条口径变更**（要改的是 `unavailable` 那条文案本身，不在本轮锁定的 D1–D6 之内）。

### 五、收口

* 线上验收 **43 项全绿**（`node .scratch/live-verify.js` ⇒ `✅ 上线验收全部通过`，exit 0）。
* 主目标达成：**读者面零数据文件名、零订阅声明、零数据出口；线上没有任何数据文件可按 URL 下载**（首页自己那份数据 `assets/data/offers.json` 例外，且不在任何读者入口里）。
