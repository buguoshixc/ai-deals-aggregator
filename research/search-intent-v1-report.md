# search-intent-v1 施工报告（用现有页面接住已有搜索需求）

- 分支 `feat/search-intent-v1`（worktree），基线 `origin/master` = **`3e8699b`**
- 日期 2026-11-04 · 施工机 Linux（Node 26.13 · Playwright chromium-1243）
- 产出：**7 个提交**、25 个文件、+2000 −167；新增 `scripts/lib/fact-summary.js`、
  `scripts/tools/verify-api-plans.js`、`scripts/data/api-plan-health.json`
- 边界：没有新增页面族、没有后端、数据模型只加两个字段、没有动 132 个工具页、
  没有发布数据 JSON / MCP / llms.txt、没有修 Futurepedia、`.snote` 判据一个字符没改

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
  §22c ③b「目录页首屏 `.snote` = 0」照旧（产物 `.snote` 202 = 202）；新容器类名登记进
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
| `node scripts/tools/build-local.js` | ✅ 产物自检全过 · **186 页** · 579.7 KB · `.snote` **202 = 202**（未动）· `.pnote` 165 · `.vsnote` 125 |
| `verify-site.js`（本轮树，装了 CJK 字体） | **931 项 / 失败 1**（§22c M11 承重证明，见 §5）；§22e 两条 **✓**（`10 页 · 50 行`） |
| `verify-site.js`（同一棵树，**没装** CJK 字体） | 931 项 / 失败 4 —— 多出的 3 条是字体度量导致（`/models/` 320/348px、§22c M14） |
| 改动前基线（`origin/master` 产物） | **929 项 / 失败 5**（本来就有 M11 变异 + M11 承重 + M14 + 2×`/models/` 顶栏折行） |
| 失败项是否由本轮引入 | **否**（见 §5 第 2 条：同一台机器上，改动前的产物同样红） |
| 新增断言 | **恰好 2 条**（§22e），931 − 929 = 2 |
| 首页页高 | **4957px**，与改动前逐像素相同（回归线 = 基线 × 1.15） |
| `npm run check:zh` | ✅ 已贴 58 条 / 76 字段 · 漂移 0 · 待译 0 · 超期 0（修前 待译 5 / 超期 3，`origin/master` 就是红的，`6f8864f` 修） |
| `npm run selftest:coverage-targets` | ✅ **200 / 0**（修前 199 / 1，红在 t46） |
| `npm run selftest:seo` | ✅ **104 / 0**（修前 100 / 0；净增 4 = 1 条改写 + 3 条毕业牙） |
| `npm run verify:seo` | ✅ **18 / 0**（修前红在「登记过期：need/ai-coding/ need/no-card/」） |
| `verify-api-plans.js --dry-run` | ✅ 7/7 static · 价格变化 0 · 历史事件 0 · 健康 7/7 |
| `npm run check:reproducible` | ✅ `deals.json` 值全部有源、管线幂等（手写值矛盾 0 处）；门禁 L1 的产物可复现脚本同样全绿 |
| `npm run gate` | 见 §3.1 |

### 3.1 完整门禁（`npm run gate`，L1–L5）

- 读数：`合计 312.9s / 49 个脚本，失败 1` —— **48 个脚本全绿**（validate / 全部 selftest /
  译文门禁 / 产物可复现 / SEO 验收 / 覆盖意图层 / 变异牙清单 …）。
- **L4 真浏览器验收（`verify-site.js`）**：**931 项 / 1 失败**（290.5s）—— 唯一那 1 条是
  §22c M11「承重证明」（一条**变异测试的自我证明**，不是产品断言），见 §5 第 2 条。
- **L5** 因 L4 未全绿而未执行。
- 也就是说：**本轮唯一没拿到的绿色，是一条在本机字体/内容下站不住的变异自我证明**；
  产品断言、SEO 验收、覆盖意图层、四份数据可复现全部通过。
- 环境说明：`verify-site.js` 里的浏览器路径是 Windows Edge
  （`process.env.DSH_EDGE` 可覆盖）。本机用 Playwright 自带 chromium + 解包的
  `libnspr4 / libnss3 / libasound2`（`LD_LIBRARY_PATH`）跑通；另外**本机原本一个中文字体都没有**
  （`fc-list :lang=zh` = 0），装 Noto CJK 之后 4 条字体度量失败降到 1 条。

---

## 4. 变异证明（断言的牙）

| 命题 | 做法 | 读数 |
|---|---|---|
| ① 存在性断言不是空跑 | 用**改动前**的产物跑同一套 verify | ✗ 红：「need/ai-coding/ 没有 aside.factsum」（10 页 · 0 行）→ 加上块之后 ✓ |
| ② 重算断言能咬住数字 | 复制产物只改一处：`need/free-tier/` 的 `data-fact-value` 从 **60 条 → 61 条**（属性与可见 `<dd>` 同改），再跑同一套 verify | ✅ 咬住：②红并点名 `need/free-tier/#count 属性值「61 条」≠ 重算「60 条」`；同一份里 ① 仍 ✓（存在性不受影响） |
| `.snote` 判据没被放宽 | 两次运行里 §22c ③b 都是 ✓，产物 `.snote` 计数 202 = 202 | ✓ |
| 毕业的三条牙 | `selftest:seo` 新增：重叠 / 余量 < 150 / floor 不自洽 ⇒ 各红 | 104 项里 3 条新牙全绿 |

---

## 5. 没做什么 / 没验证什么（如实）

1. **PR / 合并 / 部署 / 线上冒烟全部没做**：这台机器没有可用的 GitHub 推送凭证
   （无 token、无 credential helper、无 SSH key、未装 `gh`）。`git fetch` 可以直连
   （`git -c http.proxy= -c https.proxy= fetch`），`git push` 报
   `could not read Username for 'https://github.com'`。仓库规则 `master-gate` 要求
   `pull_request` + 必需检查 `gate`，**直推 master 会被拒**，所以没有绕过。
2. **1 条 verify 失败（§22c M11「承重证明」）不是本轮引入**：它是一条**变异测试的自我证明**
   （把 `.snote` 改成 70ch 网格后，要求「旧口径一条都咬不到、全靠新的逐行字迹码咬住」）。
   本轮运行里变异后旧口径也咬到 1 条（`changes/#13`），所以这条自我证明不成立。
   改动前的产物在同一台机器上**同样红**（那一轮是另一种红法：`note-ink-narrow` 一条都没咬）。
   它的结论依赖页面内容与字体度量，**没有为了它改任何判据**。
   （另外 3 条字体度量失败在装了 Noto CJK 之后已转绿：`/models/` 320px、348px、§22c M14。）
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
DSH_EDGE=$HOME/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
LD_LIBRARY_PATH=/tmp/bdeps/root/usr/lib/x86_64-linux-gnu \
node scripts/tools/verify-site.js

# 完整门禁
DSH_EDGE=... LD_LIBRARY_PATH=... npm run gate

# W1 的每日校验（dry-run 不写盘）
node scripts/tools/verify-api-plans.js --dry-run
```
