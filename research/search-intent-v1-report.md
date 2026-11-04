# search-intent-v1 施工报告（用现有页面接住已有搜索需求）

- 分支 `feat/search-intent-v1`（worktree），基线 `origin/master` = **`3e8699b`**
- 日期 2026-11-04 · 施工机 Linux（Node 26.13 · Playwright chromium-1243）
- **发布：PR #130（`gate` success 12m32s）→ merge `94283f2` → Deploy to GitHub Pages
  success → L5 `smoke` 15 / 0**（2026-11-04 20:13–20:16 CST 实测）
- 产出：**10 个提交**（前 7 个是主体、第 8 个是本报告初稿、第 9–10 个是收口：M11 修红 +
  本报告重测）、**27 个文件**、`git diff --shortstat 3e8699b..HEAD` 实测 **+2335 −225**
  （提交本报告收口编辑前；初稿的「25 文件 / +2000 −167」对不上仓库，更正见 §7）；新增
  `scripts/lib/fact-summary.js`、`scripts/tools/verify-api-plans.js`、`scripts/data/api-plan-health.json`
- 边界：没有新增页面族、没有后端、数据模型只加两个字段、没有动 132 个工具页、
  没有发布数据 JSON / MCP / llms.txt、没有修 Futurepedia、`.snote` 判据/下限一个字符没改
  （产物 `.snote` 因 W1 的数据变化 202 → 203，见 §1 W2 与 §7）

---

## 1. 改了什么

### W1 数据层：两个字段 + 每日静态校验（`16af112`）

`scripts/data/curated_api_plans.json` 24 条各加 **仅两个**字段（`checkMethod` / `lastVerifiedAt`）。
逐条实测 21 个 URL 的状态、最终地址与字节数，全部记在 `docs/api-plan-verification.md`：

| 方式 | 条数 | 说明 |
|---|---|---|
| `static`（每日裸 HTTP 自动校验） | **7 条 / 6 家厂商** | DeepSeek×2（标准 / 低峰）、Fireworks、腾讯云、硅基流动、百川、商汤 |
| `headless`（需渲染或绕反爬） | 9 条 | 智谱、OpenAI×2、火山、Groq、Together、Cerebras、讯飞、Kimi |
| `manual`（只能人工核对） | 8 条 | Anthropic、Google、阿里云×2、MiniMax、360、百度、StepFun |

- Anthropic 的 `officialUrl`/`sourceUrl` 从 301 的旧地址修到
  `https://platform.claude.com/docs/en/about-claude/pricing`；本机出口 307 到区域封锁页
  ⇒ **判 `manual`，没有硬标 static**。
- `scripts/tools/verify-api-plans.js`：只校验 `static`。成功 → 刷新 `lastVerifiedAt`；
  价格**未变 → 0 事件**；变了 → 按 `api-plan-history.json` 现有形状追加一条并更新 curated 价格
  （CI 随后 rebuild `api-plans.json`）；失败 → 不改日期、只记健康。`--dry-run` 只报告不写盘。
- 健康槽位**形态照抄** `source-health.json`，但落在独立文件 `scripts/data/api-plan-health.json`。
  原因：那一份与采集器注册表逐行对账（`check:coverage-targets` t46），把 7 条定价源塞进去
  会把「9 行 = 9 行」撑成「16 行 ≠ 9 行」，直接红 L1。**这条是施工中被门禁抓出来的真问题**（`fe299ed`）。

**读数**：`--dry-run` = 成功 **7 / 7**、失败 0、价格变化 0、历史事件 **0 条**、健康 7/7 healthy；
同一天连跑两次四个数据文件 SHA-256 完全一致。

### W2 目录页事实摘要（10 个 `/need/*`，`67e9284`）

新容器 `aside.factsum`（**不是** `.snote`），5 行事实全部构建期现算：

| 行 | 口径 |
|---|---|
| 收录条目 | 本页条目数 |
| 平台分布 | 规范厂商名归并后的前两名 + 合计占比 |
| 实名门槛 | `identityVerificationRequired` 三态：明确免实名 / 明确需实名 / 未说明 |
| 中国大陆可用 | `availability.chinaUsable` 三态：确认可用 / 确认不可用 / 未标注 |
| 数据日期 | 本次数据日（`deals.json.updatedAt`，不是「今天」） |

- **唯一实现** `scripts/lib/fact-summary.js`；构建期渲染与门禁重算 `require` **同一个模块**，
  口径句 `CALIBER` 是常量，页面与断言逐字共用 ⇒ 不存在「两处各写一份口径」。
- 3 个 `/need/*` 是钉住的**别名页**（student-only / free-api / dev-credits），判据按**路由前缀**
  取而不是按 `kind` 取，所以 10 页一个没漏。
- **`.snote` 判据一个字没改**：`index.html` 里那条 frozen 规则的唯一定义点没动，
  §22c ③b「目录页首屏 `.snote` = 0」照旧（产物 `.snote` **202 → 203**：W1 写入
  `scripts/data/api-plan-history.json` 后，`changes/` 的「另有 N 条只影响记录元信息的变化」
  从「不渲染」变成「渲染」，该页说明 14 → 15；清单仍**逐页对账一致（203 = 203）**，
  更正见 §7 第 2 条）；新容器类名登记进
  `docs/DESIGN-RULES.md` 的「事实摘要 ≠ 解释段」一节（含三条纪律与射程）。
- 新增断言**只有 2 条**（`verify-site.js` §22e，只加不删）：
  ① 10 页各有 ≥3 行、5 个 key 齐、口径句逐字等于常量；
  ② 每行值用 `deals.json` 原始记录按同一口径重算，与 `data-fact-value` 及可见 `<dd>` 逐字一致。

### W2 的连带修复：两条 need 页「毕业」出余量登记表（`fa23398`）

事实摘要让 `/need/no-card/` 的可见正文 671 → **973**、`/need/ai-coding/` 937 → **1257**，
余量 11 → **313**、97 → **417**，两页离开「余量 < 150」的射程。这撞上两条**互相打架**的既有判据：

1. `seo-verify.js` §③′：「登记集合 == 实时余量 < 150 的集合」，两个方向都判 ⇒ 留在表里是「过期登记」，红；
2. `seo-selftest.js`：「被点名的 `/need/no-card/` 不许静默下架」⇒ 直接删也是红。
   （它自己的注释写的是「可以从登记表里毕业，但不许悄悄消失」—— 代码当时只实现了前半句。）

处置：**下限一个字没动**。登记表按今天读数重写（4 条 category 页更新、2 条 need 页下架），
新增 `seo.TEXT_FLOOR_GRADUATED`（毕业 = 登记搬家：route / kind / count / chars / floor / margin /
graduatedAt / reason），并把那条守卫从「必须在登记表里」扩成「在登记表里 **或** 已毕业」，
同时**净增 3 条牙**：① 毕业记录不许与登记表重叠；② 毕业当天余量必须 ≥ 150（不许拿毕业藏变薄内容）；
③ 毕业记录 floor 必须等于 `textFloor(kind,count)` 且 chars − floor === margin。

### W3 三处查询形状（`442951c`）

1. **`/models/<slug>/`（51 页）**：首屏 `aside.factsum` 三行 —— 是否免费 / 各平台单价 / 上下文长度，
   末尾一跳 `/tools/api-cost/` 与 `/plans/api/`。三个值全部由**本页下面那张表的同一批 rows** 算出；
   免费与否只看 `rates === 0`，单价照抄表格文本与单位（**不折算、不排序成「最便宜」**）；
   `models.json` 没有上下文长度字段 ⇒ 如实写「本站未收录上下文长度」；没有计价条目时前两行
   都明写「本站未收录该模型计价」。
2. **12 个 `free_model` 详情页**：`<title>` / og / H1 用查询形状 —— **7 条**本来就是
   「<模型名> 免费模型」原样保留，**5 条**是带描述从句或聚合专区条目（不是单一模型），
   加查询词前缀「免费模型：」，不改条目原文（硬套「…免费模型」会写出一句不成立的话）。
   首屏三行：免费到什么程度 / 限制 / 怎么开始，值全部来自条目字段
   （`pricingModel` / `expiresAt` / `validity` / `eligibilityDetail` / `claimRequirements` /
   `availability` / `description`）。为此 RENDER-CORE `detailHtml()` 新增可选 `headingText`
   （默认仍是 `deal.title`，首页弹层与其它调用点行为逐字不变）。
3. **`/plans/api/` 与 `/plans/coding/`** 顶部 `aside.factsum`「数据校验状态」三行：
   - `/plans/api/`：静态自动校验 **7** · 无头浏览器 **9** · 人工核对 **8**（共 24 条）·
     最近校验 **2026-11-04** · 最近一次真实变化 **2026-10-08**；每行在「官方来源」格下带
     「静态自动校验 · 2026-11-04」副行（只有 `static` 是每日自动的，所以不写「全站每日自动校验」）。
   - `/plans/coding/`：44 条**全部人工核对**（这一份数据没有静态可读的官方源，如实写在页面上）·
     最近校验 **2026-10-05** · 最近一次真实变化 **2026-10-05**。

### W4 链接链（只加链接 + 一句话，不改版式）

| 从 | 到 | 锚文本 |
|---|---|---|
| 10 个 `/need/*`（表格下一行） | `/plans/api/` | 各平台每百万 tokens 多少钱 |
| 10 个 `/need/*` | `/tools/api-cost/` | 按我的用量算一遍 |
| `/plans/api/` | `/tools/api-cost/` | 每百万 tokens 多少钱 |
| `/plans/coding/` | `/tools/api-cost/` · `/plans/api/` | API 成本计算器 · API 计费对比表 |
| `/tools/api-cost/` | `/need/free-tier/` · `/need/student-only/` · `/need/free-model/` | 免费额度 · 学生优惠 · 免费模型 |

锚文本全部用查询词，没有一处「点击这里」。

### W5 站长平台验证（`839a2b5`）

**管道已实测可用，token 仍缺**（缺的是站点主账号登录后台这一步，不是代码）：

1. 临时把两个 token 写成探针值后构建；2. 产物首页 `<head>` 逐字出现
`google-site-verification` / `baidu-site-verification` 两条 meta；3. `grep -rl` 全产物
**只有 `index.html`** 一处命中；4. 构建自检全过，探针值已回滚（`git status` 对该文件为空）。
记录写进 `docs/marketing/seo-verification-runbook.md` 第 3 节（含「还缺什么」四行表）。

---

## 2. 哪个查询落在哪一页

| 搜索意图（问句形状） | 落地页 | 首屏第一眼给出的答案 |
|---|---|---|
| 免费大模型 / 哪些模型免费 | `/need/free-model/` | 事实摘要 5 行（条数 / 平台前两名 / 实名门槛 / 国内可用 / 数据日） |
| 免费 API / 不要钱的 API | `/need/free-api/` | 同上 + 表格下的门槛速查表 |
| 不需要信用卡 | `/need/no-card/` | 同上 |
| 国内能用的 AI | `/need/china-usable/` | 同上（国内可用一行是三态计数） |
| 学生优惠 / 教育认证 | `/need/student-only/`、`/need/edu-identity/` | 同上 |
| 白嫖 tokens / 免费额度 | `/need/free-tier/`、`/need/free-tokens/` | 同上 |
| AI 编程工具 | `/need/ai-coding/` | 同上 |
| 开发者额度 / 创业 credits | `/need/dev-credits/` | 同上 |
| `<模型名> 免费模型` | 12 个 `/deal/<id>/` | 免费到什么程度 / 限制 / 怎么开始 |
| `<模型名> 多少钱 / 免费吗 / 上下文多长` | 51 个 `/models/<slug>/` | 是否免费 / 各平台单价 / 上下文长度 + 计算器深链 |
| 各平台每百万 tokens 多少钱 | `/plans/api/` | 校验方式分布 / 最近校验 / 最近一次真实变化 + 计算器 |
| Coding 套餐多少钱 | `/plans/coding/` | 同上（人工核对口径） |
| 我的用量要花多少钱 | `/tools/api-cost/` | 计算器本身 + 回指三个需求页 |

---

## 3. 门禁读数

| 项 | 读数 |
|---|---|
| `node scripts/tools/build-local.js` | ✅ 产物自检全过 · **186 页** · 580.3 KB · `.snote` **203 = 203**（基线 202，+1 见 §7 第 2 条）· `.pnote` 165 · `.vsnote` 125 · sitemap 183 |
| `verify-site.js`（本轮树，装了 CJK 字体） | **931 项 / 失败 0**（收口前是 931 / 1 —— 唯一那条 §22c M11 承重证明已在 `8c898ab` 换靶修掉，判据一字未改；见 §4 第 3 行 / §5 第 2 条）；§22e 两条 **✓**（`10 页 · 50 行`） |
| `verify-site.js --compare`（`verify:regress` 基线） | **937 项 / 0 失败**（= 931 + 6 条回归比对；门禁 step 53 实测 291.6s，收口复跑同样 937 / 0）：覆盖条数 / 卡片数 / 首屏完整可见不减少、页高 ≤ 基线 × 1.15、外部请求不增加、JS 错误 0 |
| `verify-site.js`（同一棵树，**没装** CJK 字体） | 初稿读数 931 项 / 失败 4 —— 多出的 3 条是字体度量导致（`/models/` 320/348px、§22c M14）；收口轮**没有**重跑无字体环境（门禁环境必须装 CJK 字体，见 §3.1 环境说明） |
| 改动前基线（`origin/master` 产物） | **929 项 / 失败 5**（本来就有 M11 变异 + M11 承重 + M14 + 2×`/models/` 顶栏折行） |
| 失败项是否由本轮引入 | **否**（收口前那 1 条是 M11 牙的**承重前提**在 `changes/` 上不成立，不是产品缺陷；换靶修掉后同一棵树 931 / 0 —— 见 §5 第 2 条） |
| 新增断言 | **恰好 2 条**（§22e），931 − 929 = 2；收口只换 M11 靶页，**没有**新增 / 删除断言 |
| 首页页高 | **4957px**，与改动前逐像素相同（回归线 = 基线 × 1.15） |
| `npm run check:zh` | ✅ 已贴 58 条 / 76 字段 · 漂移 0 · 待译 0 · 超期 0（修前 待译 5 / 超期 3，`origin/master` 就是红的，`6f8864f` 修） |
| `npm run selftest:coverage-targets` | ✅ **200 / 0**（修前 199 / 1，红在 t46） |
| `npm run selftest:seo` | ✅ **104 / 0**（修前 100 / 0；净增 4 = 1 条改写 + 3 条毕业牙） |
| `npm run verify:seo` | ✅ **18 / 0**（修前红在「登记过期：need/ai-coding/ need/no-card/」） |
| `verify-api-plans.js --dry-run` | ✅ 7/7 static · 价格变化 0 · 历史事件 0 · 健康 7/7（收口日重测仍 7/7、0 变化、0 事件） |
| `npm run check:reproducible` | ✅ `deals.json` 值全部有源、管线幂等（手写值矛盾 0 处）；门禁 L1 的产物可复现脚本同样全绿 |
| `npm run gate` | ✅ **608.2s / 50 个脚本，失败 0**（见 §3.1） |

### 3.1 完整门禁（`npm run gate`，读 CI 的 `.github/actions/gate/action.yml`）

- 读数（收口轮重跑）：`合计 608.2s / 50 个脚本，失败 0` —— **50 个脚本全绿**（validate /
  全部 selftest / 译文门禁 / 产物可复现 / SEO 验收 / 覆盖意图层 / 变异牙清单 …）。
- **CI 上同一条链（发布前实测）**：PR #130 的必需检查 `gate` **success 12m32s**；
  master push 后的 `Verify site (gate)` **success 12m53s**；`Deploy` 的 `prepublish`
  **success 12m32s**（同一份 `.github/actions/gate/action.yml`，本地与 CI 无第二份步骤清单）。
- **L4 真浏览器验收（`verify-site.js`）**：**931 项 / 0 失败**（293.1s）；
  **回归比对**（`verify-site.js --compare=research/_raw/ours-baseline/verify.json`，6 条）：**0 失败**（291.6s）。
- 收口前同一条命令是 `合计 312.9s / 49 个脚本，失败 1`（L4 931 / 1）；红点、根因与修法见
  §5 第 2 条与 §4 第 3 行 —— **只换靶页，判据一个字没改**。
- **L5（`smoke`）已在发布后执行**：**15 项 / 0 失败**（2026-11-04 20:16 CST；183 条 sitemap URL、
  10 个页面族 + 模型 / 优惠详情页抽样 + 两条订阅产物 `feed.xml` 16604B · `feed.json` 20050B）。
  它只对**已部署**站点有意义（canonical 自指断言要求请求地址与产物里的绝对 canonical 逐字相同），
  所以不在 `npm run gate` 里，也不该拿本地 `dist/` 冒充；判据与 L1–L4 不重复。
- 环境说明：`verify-site.js` 里的浏览器路径是 Windows Edge
  （`process.env.DSH_EDGE` 可覆盖）。本机用 Playwright 自带 chromium + 解包的
  `libnspr4 / libnss3 / libasound2`（`LD_LIBRARY_PATH`）跑通；另外**本机原本一个中文字体都没有**
  （`fc-list :lang=zh` = 0），装 Noto CJK 之后 3 条字体度量失败转绿、只剩 1 条（M11 承重证明，
  收口轮已换靶修掉 —— 见 §5 第 2 条）。重装依赖的命令见 §6。

---

## 4. 变异证明（断言的牙）

| 命题 | 做法 | 读数 |
|---|---|---|
| ① 存在性断言不是空跑 | 用**改动前**的产物跑同一套 verify | ✗ 红：「need/ai-coding/ 没有 aside.factsum」（10 页 · 0 行）→ 加上块之后 ✓ |
| ② 重算断言能咬住数字 | 复制产物只改一处：`need/free-tier/` 的 `data-fact-value` 从 **60 条 → 61 条**（属性与可见 `<dd>` 同改），再跑同一套 verify | ✅ 咬住：②红并点名 `need/free-tier/#count 属性值「61 条」≠ 重算「60 条」`；同一份里 ① 仍 ✓（存在性不受影响） |
| `.snote` 判据没被放宽 | 两次运行里 §22c ③b 都是 ✓，产物 `.snote` 计数 **203 = 203**（基线 202，+1 见 §7 第 2 条） | ✓ |
| 毕业的三条牙 | `selftest:seo` 新增：重叠 / 余量 < 150 / floor 不自洽 ⇒ 各红 | 104 项里 3 条新牙全绿 |
| ③ **承重证明的前提本身也要有牙**（收口轮） | 2026-11-04：M11 在 `changes/` 上**恒红** —— 该页 #13 说明含两个块级 `span.pchgmeta`（`display:block`），grid 变异下它们成为 70ch 轨道的 grid item，内容盒 914px < 0.85×1380 = 1173px ⇒ **旧判据** `note-narrow` 真的咬中 ⇒「旧判据一条都没咬」前提不成立。换靶 `plans/coding/`（判据一字未改） | **换靶前** 931 项 / 1 失败（`note-narrow 1 条`，点名 `changes/#13`）；**换靶后** M11 码集 `[note-ink-narrow, note-intro-long, note-ink-narrow]`（intro-long 为同一物理原因的伴随码）、承重证明读数 `note-narrow 0 条 · note-ink-narrow 2 条 [plans/coding/#0 3 行 / 455.81px · #4 2 行 / 462.61px，内容盒都还是 1380px]` ⇒ **931 / 0** |

---

## 5. 边界、没做什么、没验证什么（如实；第 1 条已在发布轮完成）

1. **（发布轮更新：已完成）PR / 合并 / 部署 / 线上冒烟（2026-11-04 晚，全部实测）**：
   - PR **#130** → 必需检查 `gate` **success（12m32s）** → merge commit **`94283f2`**
     （19:59:17 CST 合并）。仓库规则 `master-gate` 仍要求 `pull_request` + `gate`，
     走的就是 PR 路径，**没有直推 master**。
   - push master 触发两条链：`Verify site (gate)` **success（12m53s）**；
     `Deploy to GitHub Pages` 首次在 **Setup Pages**（`actions/configure-pages@v6`）遇到一次
     **`other side closed`** 的瞬时网络错误（build 失败、deploy 未执行），
     `gh run rerun --failed` 后 **success**（prepublish 12m32s · build 13s · deploy 14s）。
     —— 记在这里的原因：它不是门禁红，也不是内容问题，重跑即过；看到它别去改代码。
   - L5 `smoke` **15 项 / 0 失败**（线上 183 条 sitemap URL；订阅产物 16604B / 20050B）。
   - 凭证变化：本轮由站点主 `gh auth login` 授权后推送；`gh auth setup-git` 写入了
     `credential.https://github.com.helper`（之前为空）。仓库级 `http(s).proxy=127.0.0.1:7890`
     在本机不可达，推拉统一用 `-c http.proxy= -c https.proxy=` 直连。
2. **收口前唯一那 1 条 verify 失败（§22c M11「承重证明」）已修掉 —— 是换靶，不是放宽**：
   红点不是产品断言，而是那条**变异自我证明的前提**。`changes/` 的 #13 说明里嵌了两个
   **块级** `<span class="pchgmeta">`（`display:block`），grid 变异下它们各自成为 70ch 轨道的
   grid item ⇒ 内容盒被压到 **914px < 0.85 × 1380 = 1173px** ⇒ **旧判据**（`note-narrow`，
   textWidth = 承载块内容盒的最小值）**真的咬中了它**。也就是说「旧判据一条都没咬」在那一页上
   不成立 —— 这由页面结构决定，与字体无关，牙留在那里只会恒红。
   处置（`8c898ab`）：靶页换 `plans/coding/`。全站 186 页里只有它与 `tools/api-cost/` 满足前提；
   取前者是因为被咬的 #0 有 **136 字**（约 3 倍换行余量），后者最长被咬条只有 45 字
   （字体步进抖几个百分点就退回单行 ⇒ 牙在 CI 上静默失效，与 M15 换靶记录同因）。
   **判据、下限、码集一条没改**；M11 变异码集变成
   `[note-ink-narrow, note-intro-long, note-ink-narrow]` —— `note-intro-long` 是**同一物理原因**
   的伴随码（首屏说明被排进 70ch 后 3 行 > 2 行上限），已写进断言名字与注释。
   （收口前那 3 条字体度量失败在装了 Noto CJK 之后已转绿：`/models/` 320px、348px、§22c M14。）
3. **W5 的两个 token 没拿到**：只能站点主账号登录 GSC / 百度后台生成；管道实测已可用（§1 W5）。
4. **17 条 headless / manual 的 API 定价源仍是人工**：只做了「如实标注」，没搭无头浏览器采集，
   也没逐家人工复核。它们**不在**每日自动校验里。
5. **5 条 `free_model` 聚合条目用了前缀形式**（「免费模型：硅基流动 免费模型专区」等）：
   它们收的是专区 / API 入口而不是单一模型，硬套「<模型名> 免费模型」会写出一句不成立的话。
6. **上下文长度没有任何来源**：`models.json` 里没有这个字段，三行事实里如实写「本站未收录」，
   没有拿参数规模、发布时间之类的东西凑数。
7. **接受度指标（Bing 点击、排名、CTR、Cloudflare PV/visit）本轮无法测量**：需要发布后 14 天
   的面板数据，而发布链本身被第 1 条挡住。

---

## 6. 复现

```bash
# 构建 + 产物自检
node scripts/tools/build-local.js

# 真浏览器验收（Linux：chromium + libnspr4/libnss3/libasound2 + 中文字体）
# 本机（Ubuntu 26.04）没有这三个库；不用 root 也能补：
mkdir -p /tmp/bdeps/debs /tmp/bdeps/root && cd /tmp/bdeps/debs
apt-get download libnss3 libnspr4 libasound2t64
for d in *.deb; do dpkg-deb -x "$d" /tmp/bdeps/root; done
# 中文字体：fc-list :lang=zh 为 0 时，把 Noto CJK 放进 ~/.fonts 再 fc-cache -f
# （缺字体时多红 3 条字体度量：/models/ 320px、348px、§22c M14）
cd - && DSH_EDGE=$HOME/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
LD_LIBRARY_PATH=/tmp/bdeps/root/usr/lib/x86_64-linux-gnu \
node scripts/tools/verify-site.js

# 完整门禁（读 CI 的 action.yml；同一条链、同一份步骤定义）
DSH_EDGE=... LD_LIBRARY_PATH=... npm run gate

# W1 的每日校验（dry-run 不写盘）
node scripts/tools/verify-api-plans.js --dry-run

# L5（部署后才有意义）
npm run smoke
```

---

## 7. 收口轮更正（2026-11-04 晚 · 如实）

1. **计数更正**：本报告初稿写的「7 个提交、25 个文件、+2000 −167」对不上仓库实测。
   `git diff --shortstat 3e8699b..HEAD`（提交初稿后）= **27 个文件 / +2311 −220**；
   若按「排除 `research/`」口径则是 **25 个文件 / +2072 −190**。初稿的 +2000 −167 两个数
   不在任何一种口径上（−167 恰是 `839a2b5` 时的删除数），**以本节实测为准**。
   收口（M11 换靶 `8c898ab` + 本报告重测）之后：提交数 **10**、27 个文件；
   行数见页首（提交本报告编辑前实测 **+2335 −225**）。
2. **`.snote` 读数更正**：初稿两处写「202 = 202（未动）」。实测：基线 `3e8699b` 产物是 **202**，
   本分支产物是 **203** —— 多的 1 条是 `changes/` 的「另有 N 条只影响记录元信息的变化」：
   W1 写入 `scripts/data/api-plan-history.json`（2 条只影响元信息的事件）之后，这一条从
   「不渲染」变成「渲染」（该页说明 14 → 15）。清单仍是逐页对账一致（**203 = 203**），
   但「未动」这个说法是错的；`.snote` 的**判据与下限**本身确实一字未改。
3. **门禁读数重测**（收口轮，同一棵树）：`npm run gate` **608.2s / 50 个脚本 / 0 失败**；
   `verify-site.js` **931 项 / 0 失败**（293.1s）；回归比对 **937 项 / 0 失败**（= 931 + 6，
   门禁 step 53 实测 291.6s，收口复跑同样 937 / 0）；
   `verify-api-plans --dry-run` 仍 **7/7**、0 变化 0 事件；`selftest:seo` 104 / 0、
   `selftest:coverage-targets` 200 / 0、`verify:seo` 18 / 0、`check:zh` 待译 0 / 超期 0。
4. **仍未完成的只有外部阻塞项**：W5 两个站长平台 token（站点主账号，§1 W5）、
   17 条 headless/manual 定价源的人工复核（§5 第 4 条）、发布后 14 天的接受度面板数据
   （§5 第 7 条）。**代码侧与发布侧都没有已知红点**：已合并（`94283f2`）、已部署、
   L5 **15 / 0**（读数见 §5 第 1 条与 §3.1）。
