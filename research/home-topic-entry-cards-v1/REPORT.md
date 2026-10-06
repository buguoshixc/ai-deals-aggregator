# 首页「按需求找优惠」入口改造为 Topic Entry Card —— 本轮最终报告（T5 集成）

**状态：实现 + 验证 + 复核已完成并推送；PR 已开；merge / Deploy / 线上 smoke 未执行 —— 等待用户二次确认。**
**报告日期**：2026-10-06 · **分支**：`home-topic-entry-cards-v1` · **base**：`master` @ `4927fe3`
**PR**：https://github.com/buguoshixc/ai-deals-aggregator/pull/44

| 交付项 | 读数值 |
|---|---|
| 集成提交（实现 + 断言 + 基线 + 证据） | `d8612e0`（59 files changed, 94538 insertions(+), 214 deletions(-)） |
| 产物 `dist/index.html` sha256 | `8076370E3C7AF29A3C3B6289A57B3B0C673DA033CD1CC8432CFA7FA7652E5242` |
| `scripts/tools/verify-site.js` sha256 | `D5125C580A951D135C90BFA74C98241C218782FB1C7C31F8D57CC22F9D88EBAE` |
| 被改造的入口块 | `nav.needs`（10 张 `<a class="need-card">`，构建期预渲染） |
| 未执行的动作 | **merge · Deploy · 线上 smoke**（对外动作，等用户二次确认） |

---

## 1. 本轮做了什么（一句话）

首页「按需求找优惠」从**10 枚 26px 小 chip 挤在一行**，改成 **10 张整卡可点的 Topic Entry Card**
（`<nav class="needs"><div class="need-grid"><a class="need-card" href="need/<slug>/">` ×10：图标 + 标题 + 条数 + 一句说明 + 箭头），
**筛选器仍是 Filter Chip（13 个 `[data-facet]` BUTTON、各 26px，本轮零改动）**；
保留构建期预渲染 / `NEED_PAGES` 唯一来源 / 无 JS 可用；`NEED_PREDICATES` 与 `/need/**` 页面未动。

| 层 | 改动（文件） |
|---|---|
| 注册表 | `scripts/lib/audience.js`：`NEED_PAGES` 新增两个**纯展示**字段 `icon`（×10，两两不同）、`homeDescription`（×10，12–24 非空格字符） |
| 构建期渲染 | `scripts/tools/build-local.js`：`renderNeedRow` 改为构建期注入整卡 `nav.needs` + 产物自检 ⑥ 改成逐张按元素判 |
| 样式 | `index.html`：删除整套旧 chip CSS（7 个旧类零残留）→ `5/3/2/1` 列网格 + 单行截断说明行 + hover 只改边框/背景/箭头 2px |
| 断言 | `scripts/tools/verify-site.js`：§15b2 等价重写（删 4 个旧结构调用点 = 运行时 −6；新增 22 条；加强 4 条）+ T6 追加 1 条 × 6 档 |
| 注册表自测 | `scripts/tools/audience-selftest.js`：§9 纯新增 6 条（191 → 197 项） |
| 基线 | `research/_raw/ours-baseline/{verify,verify-pre-fold}.json`：**只改 `metrics.firstScreenFull` 9 → 6** |

**未碰（逐条实测）**：`NEED_PREDICATES`（AST 区块逐字相同 + 14 个冻结指纹 14/14 重算相同）· `/need/**` 页面 ·
`deals.json` / `plans.json` / `api-plans.json` / `models.json`（各 **0 字节 diff**）· `.github/` · `package.json` ·
`FROZEN_ASSERTION_NAMES` · `--expect-checks=38`。

---

## 2. 首屏代价 Before / After / Delta（强制披露 · 1440×900 实测）

### 2.1 主表（1440×900）

| # | 指标 | Before | After | **Delta** |
|---|---|---|---|---|
| ① | **Topic / Need 区高度（`nav.needs`）** | **31px** | **153px** | **+122px** |
| ② | `.grid` 网格起点 | 227px | 349px | +122px |
| ③ | 首屏**完整可见** Deal Card | **9 张** | **6 张** | **−3 张** |
| ④ | 首屏**含截断** Deal Card | **9 张** | **9 张** | **0** |
| ⑤ | slack（900 − 最后一张完整卡 bottom） | 1.00px（bottom 899） | 119.00px（bottom 781） | +118px |
| ⑥ | 页高 | 4665px | 4787px | +122px |
| ⑦ | `article.g`（卡片/列/卡高） | 50 / 3 / 192px | 50 / 3 / 192px | 0 |
| ⑧ | 页面横向溢出 | 0px | 0px | 0 |
| ⑨ | 筛选器 `[data-facet]` | 13 个 BUTTON，各 26px | 13 个 BUTTON，各 26px | 0 |
| ⑩ | 入口形状 | 10 枚 chip，`perRow=[10]` | 10 张卡 `[5,5]`、卡高唯一值 68px、5 轨道 | — |

**两个口径都给了**：③ 是「完整可见」（`bottom <= innerHeight`），④ 是「含截断」。
**完整口径 Delta = −3 张；含截断口径 Delta = 0** —— 即首屏可见的卡片总数没变（9 → 9），
变的是最后一行 3 张从「完整」变成「被视口切掉底部」。

Before 值由三方独立取得、逐项一致：
(a) T1 冻结件 `t1-baseline-measure.json`（1440×900 只读实测）；
(b) T3 运行时归因实验（给 `nav.needs` 加 `height:31px`，**不改任何文件** ⇒ `227 / 9 / 4665` 逐字回到 Before）；
(c) T4 用 `git archive HEAD` 复原 HEAD 全量源码**真构建**一份 Before 产物（`dist/index.html` = `0C90EC48…`）后同口径复测。

### 2.2 逐档视口（`块高 / 完整 / 含截断 / slack / 页高 / 横向溢出`）

| 视口 | Before | After | 入口 perRow（B → A） | 完整卡 Delta |
|---|---|---|---|---|
| 1600×900 | 31 / 9 / 9 / 1 / 4665 / 0 | 153 / 6 / 9 / 119 / 4787 / 0 | `[10]` → `[5,5]` | −3 |
| **1440×900** | 31 / 9 / 9 / 1 / 4665 / 0 | 153 / 6 / 9 / 119 / 4787 / 0 | `[10]` → `[5,5]` | −3 |
| 1280×900 | 31 / 9 / 9 / 1 / 4665 / 0 | 153 / 6 / 9 / 119 / 4787 / 0 | `[10]` → `[5,5]` | −3 |
| 768×900 | 63 / 4 / 6 / 131.25 / 6430 / 0 | 313 / 2 / 4 / 85.25 / 6680 / 0 | `[5,5]` → `[3,3,3,1]` | −2 |
| 430×900 | 240 / 1 / 2 / 56.56 / 11168 / 0 | 758 / 0 / 0 / – / 11686 / 0 | `[2,2,1,2,2,1]` → 10 行 × 1 | −1 |
| 390×900 | 240 / 1 / 2 / 56.56 / 11312 / 0 | 758 / 0 / 0 / – / 11830 / 0 | `[2,2,1,2,2,1]` → 10 行 × 1 | −1 |

**已知退步（如实披露）**：390/430×900 首屏完整卡 **1 → 0**（含截断 2 → 0）。取舍是「单列可读性优先」：
整卡在窄屏落到 1 列 10 行（每张 68px 高、整卡可点、说明行可读）；压回两列会牺牲可点面积与说明行 ——
两条路都写在 `index.html` 的 CSS 注释里，**没有**为了首屏把它压回两列。

---

## 3. 为什么必须打破「首屏完整可见 ≥ 9」

1. **余量是量出来的，而且已经只剩 1px**：上一轮（v1.5 变化雷达）之后，第三行底边 = **899.00px**、
   `innerHeight` = 900px ⇒ slack = **1.00px**。同一组数字早就写在 `index.html:1162-1168` 的注释里（本轮之前就在仓库里）。
2. **精确临界是 δ ≥ 2px，不是 δ ≥ 1px**（运行时注入 δ 实测）：
   δ=0 → 9 张 / slack 1px；δ=+1 → bottom 900.00px（**恰好踩线**）仍是 9 张；δ=+2 → 掉到 6 张。
   契约原文「任何 ≥1px 增高都掉一行」差 1px，已由 `CAPTAIN-CORRECTIONS.md` 更正为 δ ≥ 2px。
3. **本轮 δ = +122px，是临界值的 61 倍**；而 Topic Card 的 δ 结构上落在 **δ ∈ [114, 144]px**
   （2 行 × 64–80px 卡 + 间距），不是调参问题 —— 只要保留「整卡可点 + 说明行 + 桌面 5 列」，
   `≥ 9 张完整可见`在数学上不可达。
4. 所以这一轮**必然**打破 `verify-site.js` 的首屏硬断言与 `verify.json` 的 `firstScreenFull` 基线；
   该冲突在 T1 阶段就被实测发现并升级给队长，T3 按 AC-31（+ 队长对第三处的追加授权）执行同步。

---

## 4. 阈值与基线同步到了什么值（同步到实测值，不是放宽）

| 位置 | 原值 | 新值 | 本轮实测值 | 说明 |
|---|---|---|---|---|
| `verify-site.js:263` 首屏完整可见卡片 | `>= 9` | **`>= 6`** | 6 | 保留「完整 / 含截断」两个读数一起打印；注释写明 δ=+122px、精确临界 δ≥2px、以及「再加任何 ≥47px 的独立顶条带会重新变红」 |
| `verify-site.js:2693` 列表视图首屏完整可见 | `>= 12` | **`>= 10`** | 10 | 与 `:263` 同一笔账（δ=+122px 让列表 13 行 → 10 行）；断言名去掉写死的数字 |
| `research/_raw/ours-baseline/verify.json` | `firstScreenFull: 9` | **`6`** | 6 | **只改这一个字段** |
| `research/_raw/ours-baseline/verify-pre-fold.json` | `firstScreenFull: 9` | **`6`** | 6 | **只改这一个字段** |

**「不是放水」的可判定理由（独立复核过）**：

- 三处阈值**严格等于本次实测值**（6 / 6 / 10），没有取更宽松的整数；
- 两份基线各 **1 行 / 1 hunk** 变化：23 个扁平字段里 **恰好 1 个**变化（`metrics.firstScreenFull`），
  `cards` / `coveredDeals` / `cols` / `gridTop` / `pageHeight` / `cardHeight` / `target` / `generatedAt` 全部原值；
  连 `firstScreenPart`（基线 12，实测 9）都**没动** —— 说明是字面意义上的「只改被授权的那一个字段」；
- `--compare` 实际比对的 6 项代码本轮**零改动**；
- `:2693` 的阈值改动有**队长书面追加授权**（团队邮箱持久记录：授权第三处按与 `:263` 相同原则同步到实测值 10）；
  `CAPTAIN-CORRECTIONS.md` 里「只改文案、不动 ≥12」的旧口径已被后续裁决取代（T7 已核对邮件记录）。

**换来的是什么**：

| 得到 | 实测 |
|---|---|
| 入口从「小 chip 一行」变**整卡可点** | 桌面 `perRow [10] → [5,5]`；卡高唯一值 **68px**；10/10 张在视口内、重叠 0、被裁 0 |
| 每张卡自带**图标 + 标题 + 条数 + 一句说明 + 箭头**（四件套全部有断言） | 说明行 12–24 字符、单行截断；条数 === 落地页行数（逐条对账） |
| **无 JS 可用** | 卡是构建期预渲染的 `<a>`；块内 `button\|input\|select` = 0；无 JS 打开 10 张卡的 `[href,标题,说明]` 与有 JS **JSON 全等** |
| **语义隔离** | 筛选器仍是 `[data-facet]` BUTTON（13 个）；入口块内没有 facet 标记、没有旧 chip 类 |
| **不横滑** | 6 档计算样式断言 `.needs` / `.need-grid` 都不是横向滚动容器（T6 新增的直接断言） |
| **可点真通** | 真实 `page.click` 导航 10/10：HTTP 200 + 落地 slug + `h1` 与注册项逐字相同 |
| 后续布局余量 | slack 1.00px → **119.00px** |

---

## 5. 验证与复核结论（本轮的可信度基础）

| 角色 | 结论 | 报告 |
|---|---|---|
| T3 验证（真浏览器验收 + M1–M7 + 密度复测 + T6 返工追加） | **通过**（0 个 P0/P1 缺口） | `research/_raw/home-topic-entry-cards-v1/VERIFY-REPORT.md` |
| T4 对抗式自审 + Full Gate + 基线对账 | **pass**（P0/P1 = 0；M6 缺口升级返工） | `research/_raw/home-topic-entry-cards-v1/REVIEW-REPORT.md` §1–§9 |
| **T7 绑定复核（最终交付 verdict 的那一次）** | **pass · P0 = 0 · P1 = 0 · REPAIR_NOW = 0** | 同上 §10 |

- **M1–M7 变异牙全部真红**，每条红的都是指定的那条/组断言，逐条 **byte-exact 还原**（每次跑完 `dist/index.html`
  都回到 `8076370E…`）：M1 facet 标记 → 3 项红 · M2 删说明 → 1 · M3 删箭头 → 1 · M4 `a→button` → 17 ·
  M5 `aria-pressed` → 2 · M6 三形态 → 6 / 6 / 10 · M7 错 slug → 3（T7 改第 1 张卡 → 4）。
- **零削弱机器对账**：792 → 798 项 = **+6 新增 / −0 删除 / 共有 792 条**（`ok` 变化 0、`detail` 变化 0，端口号归一化后比）。
- **M6 缺口闭环**：T4 发现「`.need-grid` 变成横向滚动容器时没有断言拦得住（形态 A 失败 0 项）」→ T6 只加一条
  × 6 档的计算样式断言（判据不动）→ 同一变异下 **798 / 失败 6 项**（6 档全是新断言；零溢出的 `scrollWidth/clientWidth
  1380/1380` 也红 ⇒ 抓的是**机制**而不是溢出副作用）→ T7 独立确认关闭。
- **构建确定性**：rebuild 前后 `dist/index.html` sha256 相同。
- **数据层零漂移**：`git diff -- deals.json plans.json api-plans.json models.json` = **0 字节**。

---

## 6. 四条 Verify 命令的实测读数（本轮）

| 命令 | 读数 | exit |
|---|---|---|
| `node scripts/tools/build-local.js` | 构建完成、产物自检通过（3.3s）；rebuild 前后 sha256 相同 | 0 |
| `node scripts/tools/verify-site.js` | **798 项 / 失败 0**（改断言**前**同一命令：**776 项 / 失败 8 项**） | 0 |
| `node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json` | **804 项 / 失败 0**（回归：首屏完整可见 6 → 6） | 0 |
| `node scripts/tools/audience-selftest.js` | **197 项 / 失败 0**（HEAD 同一注册表 191 项 ⇒ 新增 6 条） | 0 |

`node scripts/tools/check-ci-consistency.js --expect-checks=38` → **38 项 / 失败 0**（exit 0）；
本轮**未新增门禁步骤 / 未新增自测文件**，`FROZEN_ASSERTION_NAMES`、`.github/`、`package.json` 零改动。

---

## 7. Full Gate 与 CI 的实测结果

> 下面所有条数、项数、步骤号都是**本轮现读**的读数（`package.json` scripts、`.github/actions/gate/action.yml`
> 的步骤序列、各工具自己打印的项数），**不是历史常量**；`check-ci-consistency` 本就会动态读 `action.yml`
> 的步骤序列并逐条比对，谁改了口径它先红。

### 7.1 本地 Full Gate（T7 动态读清单后逐条执行）

- 清单来源（现读）：`package.json` 94 个 scripts（含 25 个 `selftest:*`）· `.github/actions/gate/action.yml` **49 步** ·
  `.github/workflows/` 5 个。
- 执行结果：**45 passed / 3 bash-block / 1 skipped（of 49，196.3s）**（3 个 bash-block 是多行 bash 块在 cmd 下被
  shell 打断，用 Git Bash 代入表达式重跑 **3/3 exit=0**）⇒ 等价于 **48/49 步 exit=0**。
- 关键步骤原始输出：`02 validate --strict` ✅ · `16 audience-selftest` ✅ `197 项通过，0 项失败` ·
  `34 build-local` ✅ `产物自检通过 / 构建完成 → dist/` · `40 analytics-selftest` ✅ `31 项，失败 0 项` ·
  `41 feeds-reproducible` ✅ 逐字节一致 · `44 seo-verify` ✅ 11 项 0 失败 ·
  **`47 verify-site` ✅ `验收 798 项，失败 0 项`（76.0s）** · **`48 verify-site --compare` ✅ `验收 804 项，失败 0 项`（75.2s）**。
- ⚠️ **第 1 步 `npm ci` 未在本机执行 —— 如实记为「未执行」，不计入绿**（它删库重装、属环境准备；
  替代证据只有依赖可解析 `playwright-core 1.63.0`，不冒充「npm ci 已过」）。CI 上这一步**已经真的跑了**（见 §7.2 的 `added 51 packages…` 原始行）。
- ⚠️ 第 45/46 步是「浏览器可用性判定」：本机情形 A（playwright 内核不在盘上）→ `mode=none`、exit 1（**环境事实**）；
  情形 B（有系统 Edge）→ `mode=full`、exit 0。而第 47/48 步**确实用系统 Edge 跑完了** 798 / 804 项全绿 ——
  所以「真浏览器验收确实执行了」有原始输出支撑，不是推的。

### 7.2 PR 上的 CI（仓库必需门禁）

- workflow：**`Verify site (gate)`** / job **`gate`**（`.github/workflows/verify.yml`，`pull_request → master` 触发）；
  门禁本体是复合 action `.github/actions/gate/action.yml`（**本 PR 未改动**，其步骤序列被 `check-ci-consistency` 第 (10) 条冻结）。
- 原始读数（`gh run view <id> --json …` 落盘为 `research/home-topic-entry-cards-v1/ci-run-<id>.json`）：

| run | head SHA | 触发 | 结论 | 用时 | 关键原始读数（逐字） |
|---|---|---|---|---|---|
| [37407349002](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/37407349002) | `d8612e0`（实现 + 断言 + 基线 + 证据） | PR #44 的 `pull_request → master` | ✅ **success**（job `gate` = success；`gh run view` 的 8 个 step 全 success） | **223s**（3m43s） | `added 51 packages, and audited 52 packages in 1s`（**`npm ci` 真的跑了**）· `✅ CI 口径检查 38 项，失败 0 项` · `✅ 产物自检通过` · `✅ 构建完成 → dist/（自检全过，已从暂存目录就位）` · `✅ 受众字段自测：197 项通过，0 项失败` · `✅ 分析门禁 31 项，失败 0 项` · **`✅ 验收 798 项，失败 0 项`** · **`✅ 验收 804 项，失败 0 项`** · `✅ SEO 验收 11 项，失败 0 项` · **`浏览器可用（/home/runner/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome）→ 真浏览器验收将执行`** |

原始证据落盘：`research/home-topic-entry-cards-v1/ci-run-37407349002.json`（`gh run view <id> --json …`，含每个 step 的结论）
与 `research/home-topic-entry-cards-v1/ci-run-37407349002-readings.txt`（从 run log 逐字过滤出的关键行 + 采集命令）。

- **CI 上真浏览器验收确实执行了**：浏览器准备步骤判定 `allow_degraded_run: false` 的严格路径
  （Chromium 在 runner 缓存里可用），因此 798 / 804 项是在**真浏览器**上下文里跑出来的，
  不是降级运行 —— 这也补上了本地 Full Gate「第 1 步 `npm ci` 未执行」的缺口（CI 上真的跑了 `npm ci`）。
- 本报告所在的**文档提交**（只改 `REPORT.md` / `docs/DESIGN-RULES.md` / 上列两份 CI 证据文件，
  不动 `scripts/` / `index.html` / 基线）会在同一 PR 上再触发**一次** run（同 workflow、同 job）；
  它的结论由 T5 记录在**本 PR 的评论**与交付说明里。**在它落定之前，本报告不声称该 run 通过。**

- ⚠️ **仓库 `master` 当前未开启分支保护**：`gh api repos/buguoshixc/ai-deals-aggregator/branches/master/protection`
  → HTTP 404 `Branch not protected`。所以本轮的「必需检查」是**流程要求**（本 PR 主动执行并记录原始读数），
  **不是 GitHub 强制的合并门禁** —— 这一点必须写清楚，不能把「GitHub 拦住了」当成证据。
- **CI 结论落定之前不写「通过」**；若 CI 红，本报告与 PR 都不会声称交付完成。

---

## 8. 提交范围（`git status --short` 全文 · 提交前）

```
 M index.html
 M research/_raw/ours-baseline/verify-pre-fold.json
 M research/_raw/ours-baseline/verify.json
 M scripts/lib/audience.js
 M scripts/tools/audience-selftest.js
 M scripts/tools/build-local.js
 M scripts/tools/verify-site.js
?? AI_DEALS_AGGREGATOR_ROADMAP_AND_PROMPTS.md
?? AI_DEALS_CODING_PLAN_PHASES_PROMPTS.md
?? final-dist-A.sha256
?? final-dist-B.sha256
?? research/_raw/home-topic-entry-cards-v1/
?? research/audit/
```

**进了本轮提交的**（显式路径 `git add`，未用 `-A` / `.`）：
7 个已修改的 tracked 文件 + `research/_raw/home-topic-entry-cards-v1/`（4 份核心报告 + 各任务脚本 / JSON 证据）
+ `research/home-topic-entry-cards-v1/REPORT.md` + `docs/DESIGN-RULES.md`。

**没进的**：`AI_DEALS_AGGREGATOR_ROADMAP_AND_PROMPTS.md`、`AI_DEALS_CODING_PLAN_PHASES_PROMPTS.md`、
`final-dist-A.sha256`、`final-dist-B.sha256`、`research/audit/`（**既有的、非本轮产出**的未跟踪文件）·
`research/_raw/home-topic-entry-cards-v1/_t4-tmp/`（队长裁定排除的复核中间机器产物，5.83 MB / 230 文件）。

**`.gitignore` 的政策**：`*.log` 被仓库既有规则忽略（本轮约 193 份运行日志按此政策不入库，留在工作盘上）；
入库的 JSON 证据是各工具 `--json=` 直接落盘的原始读数。

---

## 9. 未验证 / 局限（诚实清单）

1. **merge / Deploy / 线上 smoke 均未执行**（属对外动作，等用户二次确认）；因此本报告不含线上读数。
2. **本地第 1 步 `npm ci` 未执行**（见 §7.1）；CI 上会真跑。
3. **手机端首屏完整卡 1 → 0**（390/430×900，含截断 2 → 0）—— 已披露、队长已接受的取舍（§2.2）。
4. **首屏完整卡片阈值 9 → 6 是一次已披露的密度下降**：基线里记录的是实测值，不是放宽；
   但只要有人再加一条 ≥47px 的独立顶条带，`:263` 会立刻重新变红（注释里写明了这个反向边界）。
5. **规格权威是 `REQUIREMENTS.md`（AC-01…AC-32）+ 各任务契约**，不是外部 prompt 原件
   （prompt 原件的可见性/存在性经过一次更正，见 `CAPTAIN-CORRECTIONS.md` 更正一；判据本身不依赖 § 编号）。
6. **变异的作用面是产物 `dist/index.html`**（断言读的就是这一份）；源码级「改生成器再 rebuild」的变异由 T4/T7 抽查覆盖。
7. **`check-mobile-chrome.js` 的 `nav.needs` 统计走 `querySelectorAll('a')`**，不区分 `a.need-card` 与块内新增的其它链接
   —— 本轮更严的判据在 `verify-site.js` 的 `a.need-card`。

---

## 10. 复现命令（逐字）

```powershell
# 0) 构建（确定性：rebuild 前后 dist/index.html sha256 相同）
node scripts/tools/build-local.js

# 1) 断言（798 项；改断言前是 776 项 / 失败 8 项）
node scripts/tools/verify-site.js
node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json

# 2) 注册表自测（197 项；HEAD 版本 191 项）
node scripts/tools/audience-selftest.js

# 3) 门禁口径不变性
node scripts/tools/check-ci-consistency.js --expect-checks=38

# 4) 首屏密度 / 6 档几何 / 无 JS / 10 张卡真实点击（T3 的量测脚本）
node research/_raw/home-topic-entry-cards-v1/t3-geometry.js

# 5) 归因实验（运行时把 nav.needs 压回 31px，不改任何文件）
node research/_raw/home-topic-entry-cards-v1/t3-attribution.js

# 6) 变异牙（M1–M7：打变异 → verify-site 真跑 → rebuild 还原 → sha256 校验）
node research/_raw/home-topic-entry-cards-v1/t3-mutate.js apply M1
node scripts/tools/verify-site.js
node scripts/tools/build-local.js
node research/_raw/home-topic-entry-cards-v1/t3-mutate.js verify
node research/_raw/home-topic-entry-cards-v1/t6-m6-check.js   # M6 形态 A/B 直接探针
```

---

## 11. 证据索引

| 文件 | 内容 |
|---|---|
| `research/_raw/home-topic-entry-cards-v1/REQUIREMENTS.md` | AC-01…AC-32 验收契约（规格权威） |
| `research/_raw/home-topic-entry-cards-v1/VERIFY-REPORT.md` | T3 验证（§1–§14）+ T6 返工追加（§15.0–§15.9） |
| `research/_raw/home-topic-entry-cards-v1/REVIEW-REPORT.md` | T4 复核（§0–§9）+ **T7 绑定复核（§10，最终 verdict）** |
| `research/_raw/home-topic-entry-cards-v1/CAPTAIN-CORRECTIONS.md` | δ ≥ 2px 更正 · AC-31 口径 · 已核验的 T1 结论 |
| `research/_raw/home-topic-entry-cards-v1/t1-baseline-measure.json` | 1440×900 Before 冻结件（含 8 档视口逐张矩形） |
| `research/_raw/home-topic-entry-cards-v1/t3-verify-after.json` · `t3-verify-compare.json` · `t3-verify-pre-fix.json` | 798 / 804 / 776 项的完整 run artifact |
| `research/_raw/home-topic-entry-cards-v1/t3-geometry.json` · `t3-attribution.json` | 1440 密度 + 6 档几何 + 归因实验原始读数 |
| `research/_raw/home-topic-entry-cards-v1/t3-mutations.json` · `t6-mut-summary.json` · `t6-assertion-diff.json` | 变异牙矩阵 + 零削弱机器对账 |
| `research/home-topic-entry-cards-v1/ci-run-<id>.json` | PR 上 CI 运行的原始读数（`gh run view --json`） |
| `docs/DESIGN-RULES.md`（§「首页专题入口（Topic Entry Card）」） | 本轮对设计规范的补充：入口形态规则 + 密度余量规则 + 每条规则的判据 |

---

**结论**：实现、验证、复核均已完成且可复现；首屏代价已按 Before / After / Delta 全量披露
（1440×900：入口块 31 → 153px、完整可见卡 9 → 6 张、含截断 9 → 9 张），
阈值与基线同步到实测值（6 / 6 / 10，基线只动 `firstScreenFull` 一个字段）。
**merge / Deploy / 线上 smoke 未执行，等待用户二次确认。**
