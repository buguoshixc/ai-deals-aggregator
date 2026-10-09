# `secondary-page-residue-v2` · 扫描面外 8 类小字容器的逐条普查 + 「待用户确认」7 组裁定书

> 分支 `master`（v1 已并入 `9854e48`）· 普查日期 2026-10-09 · **只读源码与产物**，只写 `research/`
>
> **一句话**：把 brief 点名的 8 类容器（上一轮 §4.4 只盘点不判）做成 **86 组 / 352 次出现 / 186 个产物页面**的逐条表，逐条给出可执行的最终动作（**A/B 类实删 97 条 · keep 255 条 · 被正文下限钉住 0 条**），并把上一轮 §8 的 7 组「待确认」全部裁定到底（其中 1 组**批准删除**，其余 6 组保留并写明机制理由）。
>
> 产物锚定：`dist` **304 文件 · treeDigest `141af6139516922f925cc9605ee45efd6c4b65c499b2ad2cda689984612d2f34`** —— 与仓库自己的 `node scripts/tools/tree-digest.cjs dist` 逐字符相同。

---

## 0. 摘要

| 项 | 读数 |
|---|---|
| 扫描面 | **186 个产物页面**（含 `/deal/*` **80** 页）|
| 8 类容器的出现次数 | **352** |
| 归并组（容器 × 祖先 × 原文） | **86** |
| A/B 类（删） | **4 组 / 97 次出现**，覆盖 **80 页** |
| C/D 类（留） | **82 组 / 255 次出现**，覆盖 **86 页** |
| 被正文下限钉住（删了就 < `textFloor`） | **0 条** |
| 判类分布 | A 19 · B 80 · C 180 · D 73 |
| 删掉的可见正文 | 共 **1164 字**（80 页 × 12 字的尾半句 + 17 页 × 12 字的采集方式）|
| 编辑点唯一性 | 4/4 个删除组有「一次唯一命中」的编辑点（已现场重数，见 §3.3）|
| 数据面依赖 | 3 个删除组**本体在数据面**（`deals.json`）⇒ 本轮不能靠改数据删（见 §3.2）|

逐类：

| 容器 | 组 | 次数 | 页 | 删（组/次） | 留（组/次） |
|---|---|---|---|---|---|
| `.dsrc-note` | 3 | 165 | 80 | 1 / 80 | 2 / 85 |
| `.ddesc` | 44 | 80 | 80 | 3 / 17 | 41 / 63 |
| `.chgnote` | 1 | 19 | 1 | 0 / 0 | 1 / 19 |
| `.pchnote` | 3 | 4 | 2 | 0 / 0 | 3 / 4 |
| `.pftdesc` | 4 | 4 | 1 | 0 / 0 | 4 / 4 |
| `.chgmeta` | 1 | 1 | 1 | 0 / 0 | 1 / 1 |
| `.hint` | 5 | 54 | 1 | 0 / 0 | 5 / 54 |
| `.fdesc` | 25 | 25 | 1 | 0 / 0 | 25 / 25 |
| **合计**（页为并集） | **86** | **352** | **86** | **4 / 97** | **82 / 255** |

**7 组裁定的结论（一句话）**：42–45 条目录页题注 **保留**（题注牙齿 + a11y 名承重，实测不碰正文下限）；`/status/` 32 字 **保留**（页族下限 `main-snote ≥ 2` 钉住）；
`/feeds/` 21 字与 133 字 **保留**（页族下限 `main-snote ≥ 4` 钉住）；`/models/` 题注末句 **批准删除**（不碰题注牙：`/models/` 不在牙齿射程内；余量 2080 → 2051，不碰下限）；
`/status/` 128 字判据 **保留**（C 类，前一轮已裁定）；8 类容器 **按本普查逐条处置**（4 组删 / 82 组留）。

---

## 1. 扫描面与口径

### 1.1 dist 锚定（读数属于哪一份产物）

| 项 | 读数 |
|---|---|
| 目录 | `dist` |
| 文件数 | 304 |
| 全树摘要 | `141af6139516922f925cc9605ee45efd6c4b65c499b2ad2cda689984612d2f34` |
| 摘要口径 | scripts/tools/tree-digest.cjs 的同一口径（每层按名升序 · rel\0sha256\n） |
| HTML 页面数 | 186（= `dist/_notes.ndjson` 里 `kind:"page"` 的行数）|

任何一次 `npm run build` 都会让本报告的读数作废；复核方式见 §9。

### 1.2 取文与计数

- **窗口**：`<script>` / `<style>` / `<!-- -->` 用**等长遮蔽且保留换行**（`m.replace(/[^\n]/g, " ")`）。
  与上一轮 `other-smallprint.cjs` 的 `" ".repeat(len)` 相比，这一版**行号不漂** —— 逐条表里的 `line` 可以直接去 dist 里复核。
- **容器匹配**：class **token 级**（`\bdsrc-note\b`），不是 `class="dsrc-note"` 精确串 —— `<p class="dsrc-note">` 与将来 `class="dsrc-note x"` 都能照到。
- **祖先**：从元素位置往回扫开/闭标签栈，取最近命中 `dhist / dsrc / dplans / dbody / dpane / dsum / ctable / stable / ptable / zht / g / stop / cstop` 的 class token。
  这一列是必需的：`.dsrc-note` 一个 class 其实是**三个构造点**（`.dhist` 80 / `.dsrc` 80 / `.dplans` 5），不分开就写不出删除规格书。
- **字数**：chars / visibleChars 一律用 `scripts/lib/seo.js` 的 `visibleText()`（标签换空格、实体解码、空白折叠）——全仓统一口径
- **逐页取文**：`seo.visibleText(整页 HTML)`（同一口径，供 `floorRisk` 用）。
- **`exactSubstring` 的落点**（`census2.json` 逐条的 `substringLocus`）：删除目标 = 唯一性现场重数；静态字面量 = 在指名文件里数到的次数；`anchor` = 整串是运行时拼的、改用模板/标记锚点定位；`data-driven` = 文案来自数据（不做字面唯一性）；`composed` = 模板 + 运行时变量（计数 / 日期）。本轮 352 条的落点**全部有解**（0 条「找不到」）。

### 1.3 逐页 kind 与正文下限的出处

- kind 优先取 `dist/_notes.ndjson` 的 `pageKind`（**构建期自己声明的页面族**，共 6 种出现在本扫描面里），再落到 `scripts/lib/page-kinds.js` 的 `kindOfRoute()`。
- `textFloor` 一律用 `page-kinds.textFloor(kind, ItemList.numberOfItems)`：`deal` = `floor(500)`（与条目数无关）、`feeds` / `status` / `changes` = `floor(600)`、`plans-hub` = `700+60n`、`plans` = `600+60n`、`models-index` = `600+60n`、`home` = `3000`。
- 余量 = `seo.visibleText(整页).length − textFloor`；删除类条目按**这一页实际被删掉的字数**扣。
- ⚠️ 口径边界（不许把读数当射程用）：构建期与 `seo-verify` 数的不是整页 `visibleText`，而是 `prerenderText()`（剥 script/style 后的正文）；
  两者**不是同一个数**（整页含导航、页脚、表格等）。本报告的 `floorRisk` 是**同一口径下的比较**，权威读数仍在构建期与 `seo-verify`。
  本轮所有删除都远未逼近下限（最小余量 860 → 848），结论不受这条边界影响。

### 1.4 三处勘误（照实测写，不照简报/上一轮的说法抄）

| # | 说法出处 | 说法 | 实测 |
|---|---|---|---|
| 1 | 本轮任务简报 | 「含 `/deal/*` 95 页」 | **`/deal/` = 80 页**。全站 186 页 = 80 deal + 52 models + 26 vendor + 6 category + 10 need + 3 plans + 9 单页；`deals.json` 里有 **153** 条记录，只有 **80** 条产出详情页（`landing` 的清单决定），所以 95 与任何一份现成读数都对不上 |
| 2 | 上一轮 census §4.4 | 「`.chgnote` = 折叠控件标签」 | **产物里不是**。`/changes/` 全页只有 **1** 个折叠控件：`<details class="chgother"><summary>不计入高价值的其他变化（0）</summary>`；19 个 `.chgnote` 是生命周期事件行 `<div class="chgv">` 里的正文（详见 §2.3）|
| 3 | 上一轮报告 §8 第 1 组 | 「42 条目录页题注」 | **45 条**（`captionScanned = captionExpected = 45`）。42 是题注牙**修好之前**的读数（别名页当时被挤出射程）|

---

## 2. 逐条表

### 2.1 .dsrc-note —— 优惠详情页的来源/免责小字

**实测**：165 次 / 80 页 / 3 组（祖先 `.dhist` 80 + `.dsrc` 80 + `.dplans` 5）

| # | 祖先 | 原文 | 字数 | 次数 × 页 | 判类 | 动作 | 删什么 / 保留什么 | 下限余量（删后最小） | 来源 |
|---|---|---|---|---|---|---|---|---|---|
| DSRC-NOTE-DSRC-TAIL | `.dsrc` | 以上是本站采集与整理过程的事实，不构成对优惠是否有效、是否适用于你的判断；最终以厂商官方页面为准。 | 49 | 80 × 80 | **B** | **delete** | **删**：只删尾半句（元素与前半句都留）（`；最终以厂商官方页面为准。` → `。`；文件内命中 **1** 次） | 663 → **651**（deal，floor 500） | `scripts/lib/audience.js`:826 |
| DSRC-NOTE-DHIST | `.dhist` | 起算日之前的状态没有历史记录，因此这里不显示任何变化。 | 27 | 80 × 80 | **C** | keep | **留**：起算日之前的状态没有历史记录，因此这里不显示任何变化。 | 663 → **663**（deal，floor 500） | `scripts/lib/history.js`:202 |
| DSRC-NOTE-DPLANS | `.dplans` | 套餐价格与额度以平台官方定价页为准；「当前活动价」是该套餐自己的官方活动价，与这条优惠不是同一个价格。 | 51 | 5 × 5 | **C** | keep | **留**：套餐价格与额度以平台官方定价页为准；「当前活动价」是该套餐自己的官方活动价，与这… | 1098 → **1098**（deal，floor 500） | `index.html`:3656 |

### 2.2 .ddesc —— 优惠详情页的领取说明

**实测**：80 次 / 80 页 / 44 组（每页恰好 1 条）

| # | 祖先 | 原文 | 字数 | 次数 × 页 | 判类 | 动作 | 删什么 / 保留什么 | 下限余量（删后最小） | 来源 |
|---|---|---|---|---|---|---|---|---|---|
| DDESC-READER-DESC | `.dbody` | 百度千帆大模型平台新用户免费额度，访问平台并同意用户协议后自动开通发放，仅可抵扣预置模型在线推理消耗的 Tokens。 | 59 | 17 × 17 | **C** | keep | **留**：百度千帆大模型平台新用户免费额度，访问平台并同意用户协议后自动开通发放，仅可抵扣… | 818 → **818**（deal，floor 500） | `deals.json` |
| DDESC-SOURCE-LINE | `.dbody` | 来源：火山方舟产品页「免费额度」表（无头浏览器渲染后提取）。 | 30 | 10 × 10 | **A** | **delete** | **删**：只删括号（采集方式），保留 `来源：…表` 这个出处指针（`'来源：火山方舟产品页「免费额度」表（无头浏览器渲染后提取）。'` → `'来源：火山方舟产品页「免费额度」表。'`；文件内命中 **1** 次） | 875 → **863**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 智谱开放平台（bigmodel.cn）注册并创建 API Key 后可直接调用，无需单独领取额度。 | 49 | 7 × 7 | **C** | keep | **留**：智谱开放平台（bigmodel.cn）注册并创建 API Key 后可直接调用，… | 818 → **818**（deal，floor 500） | `deals.json` |
| DDESC-SOURCE-LINE | `.dbody` | 来源：智谱开放平台官方价格页营销位与活动说明（无头浏览器渲染后提取）。 | 35 | 5 × 5 | **A** | **delete** | **删**：只删括号（采集方式），保留 `来源：…表` 这个出处指针（`'来源：智谱开放平台官方价格页营销位与活动说明（无头浏览器渲染后提取）。'` → `'来源：智谱开放平台官方价格页营销位与活动说明。'`；文件内命中 **1** 次） | 663 → **651**（deal，floor 500） | `deals.json` |
| DDESC-SOURCE-LINE | `.dbody` | 来源：火山方舟产品页「最新活动」区（无头浏览器渲染后提取）。 | 30 | 2 × 2 | **A** | **delete** | **删**：只删括号（采集方式），保留 `来源：…表` 这个出处指针（`'来源：火山方舟产品页「最新活动」区（无头浏览器渲染后提取）。'` → `'来源：火山方舟产品页「最新活动」区。'`；文件内命中 **1** 次） | 688 → **676**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 注册魔搭账号 → 绑定阿里云账号并完成实名认证 → 在支持 API-Inference 的模型详情页复制代码范例（Base URL api-inference.modelscope.cn/v1 + 访问令牌）即可免费调用；官方提示它面向体验、请勿用于需要高并发或 SLA 保障的线上任务。 | 144 | 1 × 1 | **C** | keep | **留**：注册魔搭账号 → 绑定阿里云账号并完成实名认证 → 在支持 API-Infere… | 1399 → **1399**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 用 360 账号登录 ai.360.com/open 并绑定手机号，按协议要求先提交意向申请说明使用场景，由平台开通权限后按营销活动发放体验券/代金券，调用 360智脑大模型 API 时自动抵扣；具体券额需登录控制台查看。 | 111 | 1 × 1 | **C** | keep | **留**：用 360 账号登录 ai.360.com/open 并绑定手机号，按协议要求先… | 1290 → **1290**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 登录 MiniMax 开放平台后在 Token Plan 订阅页使用或分享好友邀请链接：受邀人结算自动 9 折，邀请人按好友实付金额获得 10% 通用代金券（仅可抵扣平台内 API 调用费用，代金券抵扣部分不可开票）。 | 109 | 1 × 1 | **C** | keep | **留**：登录 MiniMax 开放平台后在 Token Plan 订阅页使用或分享好友邀… | 1232 → **1232**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 在扣子智能体或工作流的大模型节点里选择标注「限时免费」的模型即可零积分调用，超出当日免费额度后系统会提示上限；豆包与 DeepSeek 模型属收费模型、按 token 扣积分，不在免费范围内。 | 96 | 1 × 1 | **C** | keep | **留**：在扣子智能体或工作流的大模型节点里选择标注「限时免费」的模型即可零积分调用，超出… | 862 → **862**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 在 Google 官方学生 hub（gemini.google.com/students）领取；含 4 倍 Gemini 用量、Gmail/Docs 中的 Gemini、5TB 存储等。 | 93 | 1 × 1 | **C** | keep | **留**：在 Google 官方学生 hub（gemini.google.com/stud… | 1157 → **1157**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 通过合作方 Goodstack 提交非营利资格核验表单后即可开通；折扣价包含与标准 Team / Enterprise 相同的 Opus / Sonnet / Haiku 模型。 | 89 | 1 × 1 | **C** | keep | **留**：通过合作方 Goodstack 提交非营利资格核验表单后即可开通；折扣价包含与标… | 1042 → **1042**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 在 github.com/settings/education/benefits 完成学籍验证后激活 Copilot Student；验证通过与权益生效是两个步骤，可能需数天。 | 88 | 1 × 1 | **C** | keep | **留**：在 github.com/settings/education/benefits… | 1293 → **1293**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 用学校邮箱登录后在 Billing 页选择「Get free Education plan」自动升级；学校需被 WHED 收录，不接受学生证，K-12 学生与教师不符合资格。 | 87 | 1 × 1 | **C** | keep | **留**：用学校邮箱登录后在 Billing 页选择「Get free Education… | 918 → **918**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | Verify student or educator status, or use partner promotions from official channels. | 84 | 1 × 1 | **C** | keep | **留**：Verify student or educator status, or us… | 1220 → **1220**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 在智能体或工作流中调用这些官方插件，免费额度内不产生扣费，超出后按积分或现金单价结算；主账号与其所有子账号共享并发限制与免费额度，部分第三方付费插件仅企业版可用。 | 81 | 1 × 1 | **C** | keep | **留**：在智能体或工作流中调用这些官方插件，免费额度内不产生扣费，超出后按积分或现金单价… | 870 → **870**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 登录海螺AI（hailuoai.com）进入会员订阅页，在促销期内按限时优惠价下单；会员每月发放贝壳（基础会员 1000 贝壳/月），可用于视频与图片生成。 | 78 | 1 × 1 | **C** | keep | **留**：登录海螺AI（hailuoai.com）进入会员订阅页，在促销期内按限时优惠价下… | 936 → **936**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | Verify military or veteran status through SheerID at the official claim page. | 77 | 1 × 1 | **C** | keep | **留**：Verify military or veteran status throug… | 1280 → **1280**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 首次注册扣子个人版账号并登录后按官方规则发放，到账时间以页面实际提示为准（通常实时或 T+1）；积分余额与到期时间可在「订阅管理 - 积分明细」查看。 | 75 | 1 × 1 | **C** | keep | **留**：首次注册扣子个人版账号并登录后按官方规则发放，到账时间以页面实际提示为准（通常实… | 847 → **847**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | Apply through Canva Nonprofits or Canva Education eligibility verification. | 75 | 1 × 1 | **C** | keep | **留**：Apply through Canva Nonprofits or Canva … | 1231 → **1231**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 用学校邮箱 / 学籍材料申请 Student Developer Pack，通过后在 GitHub Education 中激活各合作方 offer。 | 74 | 1 × 1 | **C** | keep | **留**：用学校邮箱 / 学籍材料申请 Student Developer Pack，通过… | 969 → **969**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 在活动期间内每日登录扣子个人版即可领取当日登录奖励，积分通常在登录后实时或 T+1 发放至账户；活动为不定期开放，规则调整会提前在活动规则页公告。 | 73 | 1 × 1 | **C** | keep | **留**：在活动期间内每日登录扣子个人版即可领取当日登录奖励，积分通常在登录后实时或 T+… | 898 → **898**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 阿里云百炼（Model Studio）对首次开通的用户发放通义千问等模型的免费 Token 额度，额度按模型独立计算，需完成实名认证后使用。 | 70 | 1 × 1 | **C** | keep | **留**：阿里云百炼（Model Studio）对首次开通的用户发放通义千问等模型的免费 … | 917 → **917**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 在 Copilot 设置页若显示「GitHub Copilot Pro」资格页即表示符合条件；不符合者可使用 Copilot Free。 | 68 | 1 × 1 | **C** | keep | **留**：在 Copilot 设置页若显示「GitHub Copilot Pro」资格页即… | 1153 → **1153**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 无需领取：在开放平台用按量计费 API Key 调用 MiniMax-M3 即按折后价结算，定价表中原价以删除线展示、折后价为当前价。 | 67 | 1 × 1 | **C** | keep | **留**：无需领取：在开放平台用按量计费 API Key 调用 MiniMax-M3 即按… | 911 → **911**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | Check Replit pricing and student signup paths before subscribing. | 65 | 1 × 1 | **C** | keep | **留**：Check Replit pricing and student signup … | 1022 → **1022**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | Use the free plan and buy only through cursor.com if upgrading. | 63 | 1 × 1 | **C** | keep | **留**：Use the free plan and buy only through c… | 1142 → **1142**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 在 AWS Activate 申请页按阶段（MVP → Series A）提交申请，通过后获得 credits 与技术支持。 | 62 | 1 × 1 | **C** | keep | **留**：在 AWS Activate 申请页按阶段（MVP → Series A）提交申… | 804 → **804**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | Choose annual billing or apply through Zapier for Nonprofits. | 61 | 1 × 1 | **C** | keep | **留**：Choose annual billing or apply through Z… | 920 → **920**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 提交非营利证明材料申请，审核通过后 Notion 自动应用折扣并邮件通知，随后即可按折扣价升级 Business 计划。 | 60 | 1 × 1 | **C** | keep | **留**：提交非营利证明材料申请，审核通过后 Notion 自动应用折扣并邮件通知，随后即… | 838 → **838**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 注册讯飞开放平台并创建应用后，使用对应版本的 APIPassword 即可调用；Lite 版免费用量在控制台查看。 | 57 | 1 × 1 | **C** | keep | **留**：注册讯飞开放平台并创建应用后，使用对应版本的 APIPassword 即可调用；… | 801 → **801**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 用学校邮箱注册 Azure for Students；额度用尽或到期后可转按量付费，订阅可每年续期继续免费使用。 | 56 | 1 × 1 | **C** | keep | **留**：用学校邮箱注册 Azure for Students；额度用尽或到期后可转按量付… | 917 → **917**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 在 StepFun 开放平台注册并创建 API Key 后即可调用；同页其他模型按 Token/字符计费。 | 53 | 1 × 1 | **C** | keep | **留**：在 StepFun 开放平台注册并创建 API Key 后即可调用；同页其他模型… | 815 → **815**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 完成腾讯云实名认证后，首次在混元大模型控制台点击「立即使用」即自动发放；免费额度用完后不会自动转后付费。 | 52 | 1 × 1 | **C** | keep | **留**：完成腾讯云实名认证后，首次在混元大模型控制台点击「立即使用」即自动发放；免费额度… | 1109 → **1109**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 登录 SenseNova 平台即可申请领取限时免费使用；官方称后续将推出 Lite、Pro 等档位。 | 50 | 1 × 1 | **C** | keep | **留**：登录 SenseNova 平台即可申请领取限时免费使用；官方称后续将推出 Lit… | 775 → **775**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 火山方舟面向个人开发者开放后，注册即可调用豆包等十数种大模型并使用免费推理额度，额度按模型计算。 | 48 | 1 × 1 | **C** | keep | **留**：火山方舟面向个人开发者开放后，注册即可调用豆包等十数种大模型并使用免费推理额度，… | 824 → **824**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 需提交姓名、就读院校、学校邮箱、出生日期等资料完成学生资格核验（条款页未标示具体折扣金额）。 | 46 | 1 × 1 | **C** | keep | **留**：需提交姓名、就读院校、学校邮箱、出生日期等资料完成学生资格核验（条款页未标示具体… | 913 → **913**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 注册硅基流动账号并创建 API Key 后即可直接调用这些免费模型，按量计费价格显示为 0。 | 46 | 1 × 1 | **C** | keep | **留**：注册硅基流动账号并创建 API Key 后即可直接调用这些免费模型，按量计费价格… | 813 → **813**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 注册即得免费额度，无需付费；免费计划不参与 credits 结转（rollover）。 | 43 | 1 × 1 | **C** | keep | **留**：注册即得免费额度，无需付费；免费计划不参与 credits 结转（rollove… | 807 → **807**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 完成实名认证后发放；剩余额度可在控制台「费用明细」查看，代金券用完后需充值继续使用。 | 42 | 1 × 1 | **C** | keep | **留**：完成实名认证后发放；剩余额度可在控制台「费用明细」查看，代金券用完后需充值继续使… | 959 → **959**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 在微软教育学生页按引导用学校邮箱验证身份，即可获得折扣与免费网页版 Office。 | 41 | 1 × 1 | **C** | keep | **留**：在微软教育学生页按引导用学校邮箱验证身份，即可获得折扣与免费网页版 Office… | 925 → **925**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 注册 Runway 账号即可获得 125 credits 体验生成式视频工具。 | 39 | 1 × 1 | **C** | keep | **留**：注册 Runway 账号即可获得 125 credits 体验生成式视频工具。 | 763 → **763**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 点击页面横幅进入申请流程，审核通过后即可免费使用 M3Plus API。 | 36 | 1 × 1 | **C** | keep | **留**：点击页面横幅进入申请流程，审核通过后即可免费使用 M3Plus API。 | 743 → **743**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 注册讯飞开放平台账号后在新手指南页按引导领取，部分权益需完成认证。 | 33 | 1 × 1 | **C** | keep | **留**：注册讯飞开放平台账号后在新手指南页按引导领取，部分权益需完成认证。 | 720 → **720**（deal，floor 500） | `deals.json` |
| DDESC-READER-DESC | `.dbody` | 用学生 / 教师邮箱注册账号，再完成教育身份验证即可免费开通。 | 31 | 1 × 1 | **C** | keep | **留**：用学生 / 教师邮箱注册账号，再完成教育身份验证即可免费开通。 | 701 → **701**（deal，floor 500） | `deals.json` |

### 2.3 .chgnote —— 变化雷达行的事件注记

**实测**：19 次 / 1 页（`/changes/`）/ 1 组

| # | 祖先 | 原文 | 字数 | 次数 × 页 | 判类 | 动作 | 删什么 / 保留什么 | 下限余量（删后最小） | 来源 |
|---|---|---|---|---|---|---|---|---|---|
| CHGNOTE-LIFECYCLE | `.(root)` | 本条记录的生命周期事件 | 11 | 19 × 1 | **D** | keep | **留**：本条记录的生命周期事件 | 3810 → **3810**（changes，floor 600） | `scripts/lib/history.js`:201 |

### 2.4 .pchnote —— 套餐页的变更记录脚注

**实测**：4 次 / 2 页（`/plans/`、`/plans/coding/`）/ 3 组

| # | 祖先 | 原文 | 字数 | 次数 × 页 | 判类 | 动作 | 删什么 / 保留什么 | 下限余量（删后最小） | 来源 |
|---|---|---|---|---|---|---|---|---|---|
| PCHNOTE-SINCE | `.(root)` | 变更记录自 2026-10-01 起（此前状态没有记录） · 全部变化 → | 37 | 2 × 2 | **C** | keep | **留**：变更记录自 2026-10-01 起（此前状态没有记录） · 全部变化 → | 2466 → **2466**（plans-hub/plans，floor 820/3240） | `scripts/lib/plans-page.js`:678 |
| PCHNOTE-MORE | `.(root)` | 另有 16 条更早的变化 | 12 | 1 × 1 | **C** | keep | **留**：另有 16 条更早的变化 | 2466 → **2466**（plans-hub，floor 820） | `scripts/lib/plan-changes.js`:97 |
| PCHNOTE-MORE | `.(root)` | 另有 30 条更早的变化 | 12 | 1 × 1 | **C** | keep | **留**：另有 30 条更早的变化 | 29968 → **29968**（plans，floor 3240） | `scripts/lib/plan-changes.js`:97 |

### 2.5 .pftdesc —— API 计费页的官方原文摘要

**实测**：4 次 / 1 页（`/plans/api/`）/ 4 组

| # | 祖先 | 原文 | 字数 | 次数 × 页 | 判类 | 动作 | 删什么 / 保留什么 | 下限余量（删后最小） | 来源 |
|---|---|---|---|---|---|---|---|---|---|
| PFTDESC-OFFICIAL-QUOTE | `.(root)` | 官方「新人免费额度」规则页（help.aliyun.com/zh/model-studio/new-free-quota）：首次开通百炼自动发放新人专属免费额度，有效期为 90 天（自开通 / 模型发布 / 申请通过之日起算，以较晚者为准）；定价表「免费额度」列写多数模型 100 万 Token | 148 | 1 × 1 | **C** | keep | **留**：官方「新人免费额度」规则页（help.aliyun.com/zh/model-s… | 23976 → **23976**（plans，floor 7080） | `api-plans.json` |
| PFTDESC-OFFICIAL-QUOTE | `.(root)` | 官方长期提供的免费 API 模型：文本模型 GLM-4.7-Flash（200K 上下文）与视觉模型 GLM-4.6V-Flash，输入 / 输出 / 缓存均为免费。这是官方 FAQ 里写明的常规能力，不是限时活动 | 107 | 1 × 1 | **C** | keep | **留**：官方长期提供的免费 API 模型：文本模型 GLM-4.7-Flash（200K… | 23976 → **23976**（plans，floor 7080） | `api-plans.json` |
| PFTDESC-OFFICIAL-QUOTE | `.(root)` | 官方定价页的 Free Tier 列：这四个模型在免费档下的输入价与输出价均为 Free of charge（免费档的速率限制与「用于改进产品」条款由官方单独规定） | 82 | 1 × 1 | **C** | keep | **留**：官方定价页的 Free Tier 列：这四个模型在免费档下的输入价与输出价均为 … | 23976 → **23976**（plans，floor 7080） | `api-plans.json` |
| PFTDESC-OFFICIAL-QUOTE | `.(root)` | 官方写「首次开通腾讯混元大模型服务后…共100万 tokens，共享消耗。资源包有效期为1年」 | 47 | 1 × 1 | **C** | keep | **留**：官方写「首次开通腾讯混元大模型服务后…共100万 tokens，共享消耗。资源包… | 23976 → **23976**（plans，floor 7080） | `api-plans.json` |

### 2.6 .chgmeta —— 变化雷达的基准日/起算日

**实测**：1 次 / 1 页（`/changes/`）/ 1 组

| # | 祖先 | 原文 | 字数 | 次数 × 页 | 判类 | 动作 | 删什么 / 保留什么 | 下限余量（删后最小） | 来源 |
|---|---|---|---|---|---|---|---|---|---|
| CHGMETA-BASELINE | `.(root)` | 以最近一次数据更新 2026-10-08 为基准 变更记录自 2026-09-30 起（此前状态没有记录） | 53 | 1 × 1 | **C** | keep | **留**：以最近一次数据更新 2026-10-08 为基准 变更记录自 2026-09-3… | 3810 → **3810**（changes，floor 600） | `index.html`:3916 |

### 2.7 .hint —— 首页的交互提示与档位条数

**实测**：54 次 / 1 页（首页）/ 5 组（`详情` ×50 + 档位条 ×4）

| # | 祖先 | 原文 | 字数 | 次数 × 页 | 判类 | 动作 | 删什么 / 保留什么 | 下限余量（删后最小） | 来源 |
|---|---|---|---|---|---|---|---|---|---|
| HINT-DETAIL | `.g` | 详情 | 2 | 50 × 1 | **D** | keep | **留**：详情 | 10306 → **10306**（home，floor 3000） | `index.html`:3070 |
| HINT-TIERHEAD | `.(root)` | 学生 / 教师 / 非营利 / 初创 —— 有资格就不花钱 · 19 条 | 36 | 1 × 1 | **D** | keep | **留**：学生 / 教师 / 非营利 / 初创 —— 有资格就不花钱 · 19 条 | 10306 → **10306**（home，floor 3000） | `index.html`:3107 |
| HINT-TIERHEAD | `.(root)` | 新用户一次性赠送 / 首月免费，够跑一段时间 · 20 条 | 29 | 1 × 1 | **D** | keep | **留**：新用户一次性赠送 / 首月免费，够跑一段时间 · 20 条 | 10306 → **10306**（home，floor 3000） | `index.html`:3107 |
| HINT-TIERHEAD | `.(root)` | 注册就能用，不用等额度到账 · 6 条 | 19 | 1 × 1 | **D** | keep | **留**：注册就能用，不用等额度到账 · 6 条 | 10306 → **10306**（home，floor 3000） | `index.html`:3107 |
| HINT-TIERHEAD | `.(root)` | 要花钱，但比标准价便宜 · 5 条 | 17 | 1 × 1 | **D** | keep | **留**：要花钱，但比标准价便宜 · 5 条 | 10306 → **10306**（home，floor 3000） | `index.html`:3107 |

### 2.8 .fdesc —— 订阅中心的每条订阅描述

**实测**：25 次 / 1 页（`/feeds/`）/ 25 组

| # | 祖先 | 原文 | 字数 | 次数 × 页 | 判类 | 动作 | 删什么 / 保留什么 | 下限余量（删后最小） | 来源 |
|---|---|---|---|---|---|---|---|---|---|
| FDESC-FEED-SLOT-A | `.(root)` | AI 平台 API 的单价、计费单位、模型计价条目、免费额度、限速与 credits 的变化。数据来自本站重建 API 计费数据时的观测记录；每条变化都能在 API 计费对比页找到落点。 | 93 | 1 × 1 | **A** | keep | **留**：AI 平台 API 的单价、计费单位、模型计价条目、免费额度、限速与 credi… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:491 |
| FDESC-FEED-SLOT-A | `.(root)` | AI Coding 套餐的价格、活动价、额度、模型与限制的变化。数据来自本站重建套餐数据时的观测记录；每条变化都能在套餐对比页找到落点。 | 68 | 1 × 1 | **A** | keep | **留**：AI Coding 套餐的价格、活动价、额度、模型与限制的变化。数据来自本站重建… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:491 |
| FDESC-FEED-SLOT-C | `.(root)` | MiniMax（稀宇科技） 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；想看「它最近变了什么」，订最近变化。 | 67 | 1 × 1 | **C** | keep | **留**：MiniMax（稀宇科技） 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | Microsoft 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；想看「它最近变了什么」，订最近变化。 | 63 | 1 × 1 | **C** | keep | **留**：Microsoft 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 可以免费调用的 AI API：福利类型标注为「免费 API」的条目，含国内大模型平台的新用户免费额度与国外平台的试用额度。 | 61 | 1 × 1 | **C** | keep | **留**：可以免费调用的 AI API：福利类型标注为「免费 API」的条目，含国内大模型… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 扣子 Coze 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；想看「它最近变了什么」，订最近变化。 | 61 | 1 × 1 | **C** | keep | **留**：扣子 Coze 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 面向开发者与程序员的 AI 优惠：免费 API 额度、开发者赠金、模型调用免费额度，逐条标注领取要求与是否中国大陆可用。 | 60 | 1 × 1 | **C** | keep | **留**：面向开发者与程序员的 AI 优惠：免费 API 额度、开发者赠金、模型调用免费额… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 大模型 API 服务与算力平台的优惠与免费额度：新用户赠送、限时免费模型与按量抵扣，逐条标注领取门槛与是否中国大陆可用。 | 60 | 1 × 1 | **C** | keep | **留**：大模型 API 服务与算力平台的优惠与免费额度：新用户赠送、限时免费模型与按量抵… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | GitHub 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；想看「它最近变了什么」，订最近变化。 | 60 | 1 × 1 | **C** | keep | **留**：GitHub 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | Notion 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；想看「它最近变了什么」，订最近变化。 | 60 | 1 × 1 | **C** | keep | **留**：Notion 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 智能体与 Agent 平台的优惠与免费额度：积分赠送、每日免费调用次数与限时折扣，逐条标注领取门槛与是否中国大陆可用。 | 59 | 1 × 1 | **C** | keep | **留**：智能体与 Agent 平台的优惠与免费额度：积分赠送、每日免费调用次数与限时折扣… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 百度智能云 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；想看「它最近变了什么」，订最近变化。 | 59 | 1 × 1 | **C** | keep | **留**：百度智能云 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 聚合国内外 AI 大模型的真实优惠：新用户免费额度、免费模型、学生/教师/非营利折扣、限时促销。全部指向厂商官方页。 | 58 | 1 × 1 | **C** | keep | **留**：聚合国内外 AI 大模型的真实优惠：新用户免费额度、免费模型、学生/教师/非营利… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 面向学生的 AI 优惠与免费额度：需要学生身份或教育邮箱的订阅、学生套餐与教育折扣，逐条标注门槛与是否中国大陆可用。 | 58 | 1 × 1 | **C** | keep | **留**：面向学生的 AI 优惠与免费额度：需要学生身份或教育邮箱的订阅、学生套餐与教育折… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 智谱AI 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；想看「它最近变了什么」，订最近变化。 | 58 | 1 × 1 | **C** | keep | **留**：智谱AI 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 火山引擎 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；想看「它最近变了什么」，订最近变化。 | 58 | 1 × 1 | **C** | keep | **留**：火山引擎 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 科大讯飞 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；想看「它最近变了什么」，订最近变化。 | 58 | 1 × 1 | **C** | keep | **留**：科大讯飞 当前收录的 AI 优惠与免费额度。厂商订阅收的是该厂商当前收录的优惠；… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 对话类大模型的优惠与免费额度：免费模型、新用户赠送 Token 与限时折扣，逐条标注领取门槛与是否中国大陆可用。 | 56 | 1 × 1 | **C** | keep | **留**：对话类大模型的优惠与免费额度：免费模型、新用户赠送 Token 与限时折扣，逐条… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 语音识别、语音合成与音频生成的 AI 优惠与免费额度：按小时或字符计的免费额度与限时折扣，逐条标注门槛与可用性。 | 56 | 1 × 1 | **C** | keep | **留**：语音识别、语音合成与音频生成的 AI 优惠与免费额度：按小时或字符计的免费额度与… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 赠送 Token 与免费额度的 AI 优惠：新用户礼包、活动积分、按量抵扣的体验金，逐条标注领取门槛与可用性。 | 55 | 1 × 1 | **C** | keep | **留**：赠送 Token 与免费额度的 AI 优惠：新用户礼包、活动积分、按量抵扣的体验… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 图像生成与绘画类 AI 的优惠与免费额度：免费出图额度、限时折扣与面向学生、教师的设计工具优惠，逐条标注门槛。 | 55 | 1 × 1 | **C** | keep | **留**：图像生成与绘画类 AI 的优惠与免费额度：免费出图额度、限时折扣与面向学生、教师… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 编程开发类的 AI 优惠：代码补全、编程助手与开发者工具包，含学生与教师可领的免费额度。 | 44 | 1 × 1 | **C** | keep | **留**：编程开发类的 AI 优惠：代码补全、编程助手与开发者工具包，含学生与教师可领的免… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 中国大陆用户可正常注册使用的 AI 优惠：来源写明可用或可完成国内实名认证的条目。 | 41 | 1 × 1 | **C** | keep | **留**：中国大陆用户可正常注册使用的 AI 优惠：来源写明可用或可完成国内实名认证的条目… | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 本站观测到的优惠变化：优惠内容、领取条件、有效期与收录状态。 | 30 | 1 × 1 | **C** | keep | **留**：本站观测到的优惠变化：优惠内容、领取条件、有效期与收录状态。 | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |
| FDESC-FEED-SLOT-C | `.(root)` | 本站观测到的首次收录：哪些优惠是最近才被收录进来的。 | 26 | 1 × 1 | **C** | keep | **留**：本站观测到的首次收录：哪些优惠是最近才被收录进来的。 | 3371 → **3371**（feeds，floor 600） | `scripts/lib/feeds.js`:66 |

> 完整原文、逐页 `floorRisk`、每一行的 dist 行号都在 `research/_raw/secondary-page-residue-v2/census2.json` 的 `items`（逐次出现，352 条）里。

---

## 3. 裁定书（A/B 类：删什么、怎么删、门禁怎么走）

### 3.1 `DSRC-NOTE-DSRC-TAIL` —— 80 页 × 80 次

**原文**：

- `以上是本站采集与整理过程的事实，不构成对优惠是否有效、是否适用于你的判断；最终以厂商官方页面为准。`（49 字 × 80 次 × 80 页）

**判类**：**B**（重复（同一句话或同一个数字在多个容器各写一遍；与共享页脚同义）→ 删）

**动作**：`delete` —— 只删尾半句（元素与前半句都留）
**保留的部分**：`以上是本站采集与整理过程的事实，不构成对优惠是否有效、是否适用于你的判断`

**理由**：元素整体 =「本条特有的诚实声明」（最后半句除外）：它说的是**本页这一块信息来源**的性质，不是别处已经说过的套话；而尾半句「最终以厂商官方页面为准」与全站共享页脚「优惠信息来自各厂商官方页面与公开折扣页，最终以官方页面为准。」同义 ⇒ B 类（同一句话的第二个容器）⇒ **只删尾半句**。

**门禁影响（实测）**：不许删整个元素：`verify-site.js:1926` 的既有无头浏览器断言要求 `.dsrc .dsrc-note` 的整块文本匹配 `/不构成对优惠是否有效/`；真删元素还会让 `verify-site.js:1922`（`hasNote`）变红。只删尾半句两条都仍然绿。`provenance-selftest.js:265` 比的是常量本身（两侧同批改即绿）。

**编辑点（已现场重数唯一性）**：

| 对应原文 | 文件 | 要删/改成 | 文件内命中次数 |
|---|---|---|---|
| 以上是本站采集与整理过程的事实，不构成对优惠是否… | `scripts/lib/audience.js` | `；最终以厂商官方页面为准。` → `。` | **1** |
| （全族同批） | `index.html` | `；最终以厂商官方页面为准。` → `。` | **1** |

> 同批编辑点：index.html（前端受控副本：两处必须同批改，否则 `validate.js --strict` 的 `checkWordingContract` 逐字比对当场变红。）。这几个字面量在各自文件里都**只命中一次**，所以可以按字面量做外科式替换（不需要按行号定位）。

**来源**：`scripts/lib/audience.js`:826 · 另见 index.html:1347（RENDER-CORE 的 SOURCE_WORDING 受控副本，checkWordingContract 逐字比对）

**下限读数**：80 个页面·次，deal，floor 500；每页删 12 字，余量最小 663 → **651** ⇒ **不被下限钉住**。

### 3.2 `DDESC-SOURCE-LINE` —— 17 页 × 17 次

**原文**：（本组含 3 条不同字面量的同族文案）

- `来源：火山方舟产品页「免费额度」表（无头浏览器渲染后提取）。`（30 字 × 10 次 × 10 页）
- `来源：智谱开放平台官方价格页营销位与活动说明（无头浏览器渲染后提取）。`（35 字 × 5 次 × 5 页）
- `来源：火山方舟产品页「最新活动」区（无头浏览器渲染后提取）。`（30 字 × 2 次 × 2 页）

**判类**：**A**（站务 / 自证 / 内部实现（采集方式、生成方式、字段模型、文件名、判据门槛）→ 删）

**动作**：`delete` —— 只删括号（采集方式），保留 `来源：…表` 这个出处指针
**保留的部分**：`来源：<来源页/表名>`

**理由**：「（无头浏览器渲染后提取）」是**采集方式**（A 类：把内部取数手段写进读者可见的句子）；而 `来源：火山方舟产品页「免费额度」表` 是**出处指针**，读者据此能去核对，属于可追溯性（留）。两种切法里选**删括号**：删整条 `来源：…句` 会让这 17 页**一条说明都不剩**（这 17 页的 `.ddesc` 就是这句来源行），既丢出处也丢 30–35 字/页正文，而 A 类判据只要求删掉「采集方式」，不要求删掉「来源」。

**门禁影响（实测）**：⚠️ **数据面依赖**：这句在 `deals.json` 里出现 17 次（行 3851/3933/4015/4075/4135/4188/4241/4294/4347/4400/4453/4506/4559/4612/4665/4726/5361），而本轮硬约束是「不许改数据面产物字节」⇒ **不能靠改数据删**。可行的两条路：① 渲染层归一（RENDER-CORE 在渲染 `.ddesc` 前剥掉这个括号，预渲染与前端同一份实现）＋采集器模板同批去掉括号（新数据不再写进去）；② 把这一步留到允许动数据面的那一轮。

**执行前置（实测约束）**：本体在数据面（`deals.json` ×17）与采集器模板（`headless.js` ×3）里 ⇒ 不改数据面字节的前提下，只有渲染层归一（RENDER-CORE 预渲染与前端同一份实现）能改到当前产物；采集器模板同批改，新数据不再写进去。若本轮只改采集器，则**当前产物不变**（要如实说明这一点）。

**编辑点（已现场重数唯一性）**：

| 对应原文 | 文件 | 要删/改成 | 文件内命中次数 |
|---|---|---|---|
| 来源：火山方舟产品页「免费额度」表（无头浏览器渲… | `scripts/collectors/headless.js` | `'来源：火山方舟产品页「免费额度」表（无头浏览器渲染后提取）。'` → `'来源：火山方舟产品页「免费额度」表。'` | **1** |
| 来源：智谱开放平台官方价格页营销位与活动说明（无… | `scripts/collectors/headless.js` | `'来源：智谱开放平台官方价格页营销位与活动说明（无头浏览器渲染后提取）。'` → `'来源：智谱开放平台官方价格页营销位与活动说明。'` | **1** |
| 来源：火山方舟产品页「最新活动」区（无头浏览器渲… | `scripts/collectors/headless.js` | `'来源：火山方舟产品页「最新活动」区（无头浏览器渲染后提取）。'` → `'来源：火山方舟产品页「最新活动」区。'` | **1** |

> 唯一性说明：括号本身在 `headless.js` 里出现 3 次、在 `deals.json` 里出现 17 次 ⇒ **不存在**「一次唯一命中」的编辑点；上面三条**整行字面量**各自在 `headless.js` 里唯一（已现场重数）。数据侧只能靠渲染层归一或另开一轮。

**来源**：`deals.json` · 另见 scripts/collectors/headless.js:132 / :298 / :313（采集器模板：新数据的同一句话从这里写进 deals.json） · index.html:3258（渲染点：<p class="ddesc"> + deal.description，RENDER-CORE 同时供预渲染与前端）

**下限读数**：17 个页面·次，deal，floor 500；每页删 12 字，余量最小 663 → **651** ⇒ **不被下限钉住**。

### 3.3 唯一性总表（生成时现场重数）

| 标签 | 文件 | 命中次数 | 行号 |
|---|---|---|---|
| DSRC-NOTE-DSRC-TAIL · 主编辑点（以上是本站采集与整理过程…） | `scripts/lib/audience.js` | **1** | 826 |
| DSRC-NOTE-DSRC-TAIL · 同批编辑点 | `index.html` | **1** | 1347 |
| DDESC-SOURCE-LINE · 主编辑点（来源：火山方舟产品页「免…） | `scripts/collectors/headless.js` | **1** | 298 |
| DDESC-SOURCE-LINE · 主编辑点（来源：智谱开放平台官方价…） | `scripts/collectors/headless.js` | **1** | 132 |
| DDESC-SOURCE-LINE · 主编辑点（来源：火山方舟产品页「最…） | `scripts/collectors/headless.js` | **1** | 313 |
| §8-5 · /models/ 题注末句 | `scripts/lib/models-page.js` | **1** | 872 |

> 口径：唯一性是**每次生成 census2.json 时现场重数**的读数（`countInFile()`），不是写死的结论。
> **没有唯一命中的那一类**（`.ddesc` 的「（无头浏览器渲染后提取）」）在这里就暴露出来了：它在 `headless.js` 里 3 次、在 `deals.json` 里 17 次 —— 只能靠整行字面量或渲染层归一。

---

## 4. 保留裁定（C/D 类：为什么留、谁在承重）

| 裁定 | 容器 @ 祖先 | 判类 | 覆盖（组 / 次 / 页）| 为什么留 |
|---|---|---|---|---|
| DSRC-NOTE-DHIST | `.dsrc-note` @ `dhist` | **C** | 1 / 80 / 80 | 既有断言钉住：`build-local.js:5523` 的构建期自检要求无变更记录的条目**必须**包含 `HISTORY_NOTES.emptyNote`（「无变更记录的条目缺少『起算日之前没有历史』的说明」）⇒ 删它构建当场 exit 1 |
| DSRC-NOTE-DPLANS | `.dsrc-note` @ `dplans` | **C** | 1 / 5 / 5 | 无既有断言引用；`.dplans` 只在**真有相关套餐**的 5 条优惠上渲染（本轮 5 页），删它等于在这 5 页上去掉价格口径 |
| DDESC-READER-DESC | `.ddesc` @ `dbody` | **C** | 41 / 63 / 63 | 领取说明（怎么领、有什么限制）是**读者内容**，不是站务/自证/内部实现：44 条唯一串里的 41 条长句一律保留 |
| CHGNOTE-LIFECYCLE | `.chgnote` @ `(root)` | **D** | 1 / 19 / 1 | 实测订正：它**不是**折叠控件标签（v1 §4.4 的说法与产物不符）——`/changes/` 页只有一个折叠控件 `<details class="chgother"><summary>不计入高价值的其他变化（0）</summary>`，而 19 个 `.chgnote` 是生命周期事件行 `<div class="chgv">` 里的**唯一正文**（例：`<li class="chgi" data-kind="created">…<div class="chgv"><span class="chgnote">本条记录的生命周期事件</span></div></li>`） |
| PCHNOTE-SINCE | `.pchnote` @ `(root)` | **C** | 1 / 2 / 2 | `build-local.js:5859-5861` 要求 `CHANGES_LABELS.base` / `.more` 等模板保留 `{date}`/`{n}` 槽位（退化成写死一句即红）—— 措辞表动不得 |
| PCHNOTE-MORE | `.pchnote` @ `(root)` | **C** | 2 / 2 / 2 | 截断口径：「另有 30 条更早的变化」说的是**这一块只显示了一部分**——删掉它，读者会把「显示了 30 条」当成「一共只有 30 条」 |
| PFTDESC-OFFICIAL-QUOTE | `.pftdesc` @ `(root)` | **C** | 4 / 4 / 4 | 数据面依赖：文案来自 `api-plans.json`（本轮不许改数据面字节） |
| CHGMETA-BASELINE | `.chgmeta` @ `(root)` | **C** | 1 / 1 / 1 | 实测：删它**不会**让 `verify-site.js:4379/4388`（无 JS 的 `/changes/` 必须含「变更记录自 YYYY-MM-DD 起」）变红 —— 页面上另有 2 处 `.snote`（1227 行附近的「变更记录自 2026-10-01 起 |
| HINT-DETAIL | `.hint` @ `g` | **D** | 1 / 50 / 1 | 既有断言 `verify-site.js:215/238`（无 JS 时所有 `.meta .hint` 必须 `display:none`）就钉在这 50 个元素上 |
| HINT-TIERHEAD | `.hint` @ `(root)` | **D** | 4 / 4 / 4 | `build-local.js:6349-6359` 只断言分带数与卡片数（`tierHeads` / `tierDots`），不检查这一串文字；删它不会变红，但会丢掉档位口径与条数 |
| FDESC-FEED-SLOT-A | `.fdesc` @ `(root)` | **A** | 2 / 2 / 2 | 硬约束：Feed 产物本轮逐字节不变 |
| FDESC-FEED-SLOT-C | `.fdesc` @ `(root)` | **C** | 23 / 23 / 23 | 硬约束：Feed 产物本轮逐字节不变 |

逐组完整理由（含出台的门禁与实测断言名）见 `census2.json` 的 `rulings[].reason` / `rulings[].gate`；下面对 8 个保留族逐条展开。

#### DSRC-NOTE-DHIST

- **代表原文**：`起算日之前的状态没有历史记录，因此这里不显示任何变化。`
- **判类**：**C**（会改变读者判断的数据语义（时间口径、空态事实、官方原文引证、计数）→ 留）· 覆盖 80 次 / 80 页
- **理由**：空态事实 + 时间边界：「起算日之前的状态没有历史记录，因此这里不显示任何变化。」把「没有历史记录」与「没有发生变化」分成两句话（C 类：读者据此才知道这块空白不是因为没变化）。它不是站务说明，也不需要读者知道任何内部实现。
- **承重/门禁（实测）**：既有断言钉住：`build-local.js:5523` 的构建期自检要求无变更记录的条目**必须**包含 `HISTORY_NOTES.emptyNote`（「无变更记录的条目缺少『起算日之前没有历史』的说明」）⇒ 删它构建当场 exit 1。契约禁止删断言 ⇒ 留。
- **来源**：`scripts/lib/history.js`:202

#### DSRC-NOTE-DPLANS

- **代表原文**：`套餐价格与额度以平台官方定价页为准；「当前活动价」是该套餐自己的官方活动价，与这条优惠不是同一个价格。`
- **判类**：**C**（会改变读者判断的数据语义（时间口径、空态事实、官方原文引证、计数）→ 留）· 覆盖 5 次 / 5 页
- **理由**：这是一条**会改变读者判断的价格口径**：「当前活动价」是套餐自己的官方活动价，与这条优惠不是同一个价格 —— 没有它，读者会把套餐对比里的活动价误当成这条优惠的价格。前半句（以平台官方定价页为准）与页脚**同承诺但不同对象、也不同字面**（页脚说的是「优惠信息」），不满足 B 类判据（B 判的是同一句话/同一个数字在多处各写一遍）⇒ 不做半句删，整条留。
- **承重/门禁（实测）**：无既有断言引用；`.dplans` 只在**真有相关套餐**的 5 条优惠上渲染（本轮 5 页），删它等于在这 5 页上去掉价格口径。
- **来源**：`index.html`:3656

#### CHGNOTE-LIFECYCLE

- **代表原文**：`本条记录的生命周期事件`
- **判类**：**D**（交互 / 无障碍 / 结构槽位提示 → 留）· 覆盖 19 次 / 1 页
- **理由**：实测订正：它**不是**折叠控件标签（v1 §4.4 的说法与产物不符）——`/changes/` 页只有一个折叠控件 `<details class="chgother"><summary>不计入高价值的其他变化（0）</summary>`，而 19 个 `.chgnote` 是生命周期事件行 `<div class="chgv">` 里的**唯一正文**（例：`<li class="chgi" data-kind="created">…<div class="chgv"><span class="chgnote">本条记录的生命周期事件</span></div></li>`）。删掉它不是「少一句话」，而是留下**空的正文槽**，同时抹掉「这一行记的是条目的生命周期事件」与「这一行记的是字段变化」的区分 ⇒ D（结构槽位提示）+ C（事件语义）。
- **来源**：`scripts/lib/history.js`:201

#### PCHNOTE-SINCE

- **代表原文**：`变更记录自 2026-10-01 起（此前状态没有记录） · 全部变化 →`
- **判类**：**C**（会改变读者判断的数据语义（时间口径、空态事实、官方原文引证、计数）→ 留）· 覆盖 2 次 / 2 页
- **理由**：时间口径 + 数据出口：`变更记录自 2026-10-01 起（此前状态没有记录）` 是这一块变化的**起算日**（没有它，空/少的两栏会被读成「没有变化」）；`全部变化 →` 是指向 `/changes/` 的站内出口（C/D）。
- **承重/门禁（实测）**：`build-local.js:5859-5861` 要求 `CHANGES_LABELS.base` / `.more` 等模板保留 `{date}`/`{n}` 槽位（退化成写死一句即红）—— 措辞表动不得。
- **来源**：`scripts/lib/plans-page.js`:678

#### PFTDESC-OFFICIAL-QUOTE

- **代表原文**：`官方「新人免费额度」规则页（help.aliyun.com/zh/model-studio/new-free-quota）：首次开通百炼自动…`
- **判类**：**C**（会改变读者判断的数据语义（时间口径、空态事实、官方原文引证、计数）→ 留）· 覆盖 1 次 / 1 页
- **理由**：官方原文引证：这 4 条是「免费额度与 credits（厂商级事实）」一节的**依据原文**（官方规则页/定价页/FAQ 的原话与链接）。删掉它们等于把「官方这么说」变成「本站这么说」—— 属于会改变读者判断的数据语义（C），而且它们同时是数据面字段。
- **承重/门禁（实测）**：数据面依赖：文案来自 `api-plans.json`（本轮不许改数据面字节）。
- **来源**：`api-plans.json`

#### PFTDESC-OFFICIAL-QUOTE

- **代表原文**：`官方长期提供的免费 API 模型：文本模型 GLM-4.7-Flash（200K 上下文）与视觉模型 GLM-4.6V-Flash，输入 /…`
- **判类**：**C**（会改变读者判断的数据语义（时间口径、空态事实、官方原文引证、计数）→ 留）· 覆盖 1 次 / 1 页
- **理由**：官方原文引证：这 4 条是「免费额度与 credits（厂商级事实）」一节的**依据原文**（官方规则页/定价页/FAQ 的原话与链接）。删掉它们等于把「官方这么说」变成「本站这么说」—— 属于会改变读者判断的数据语义（C），而且它们同时是数据面字段。
- **承重/门禁（实测）**：数据面依赖：文案来自 `api-plans.json`（本轮不许改数据面字节）。
- **来源**：`api-plans.json`

#### PFTDESC-OFFICIAL-QUOTE

- **代表原文**：`官方定价页的 Free Tier 列：这四个模型在免费档下的输入价与输出价均为 Free of charge（免费档的速率限制与「用于改进产…`
- **判类**：**C**（会改变读者判断的数据语义（时间口径、空态事实、官方原文引证、计数）→ 留）· 覆盖 1 次 / 1 页
- **理由**：官方原文引证：这 4 条是「免费额度与 credits（厂商级事实）」一节的**依据原文**（官方规则页/定价页/FAQ 的原话与链接）。删掉它们等于把「官方这么说」变成「本站这么说」—— 属于会改变读者判断的数据语义（C），而且它们同时是数据面字段。
- **承重/门禁（实测）**：数据面依赖：文案来自 `api-plans.json`（本轮不许改数据面字节）。
- **来源**：`api-plans.json`

#### PFTDESC-OFFICIAL-QUOTE

- **代表原文**：`官方写「首次开通腾讯混元大模型服务后…共100万 tokens，共享消耗。资源包有效期为1年」`
- **判类**：**C**（会改变读者判断的数据语义（时间口径、空态事实、官方原文引证、计数）→ 留）· 覆盖 1 次 / 1 页
- **理由**：官方原文引证：这 4 条是「免费额度与 credits（厂商级事实）」一节的**依据原文**（官方规则页/定价页/FAQ 的原话与链接）。删掉它们等于把「官方这么说」变成「本站这么说」—— 属于会改变读者判断的数据语义（C），而且它们同时是数据面字段。
- **承重/门禁（实测）**：数据面依赖：文案来自 `api-plans.json`（本轮不许改数据面字节）。
- **来源**：`api-plans.json`

#### CHGMETA-BASELINE

- **代表原文**：`以最近一次数据更新 2026-10-08 为基准 变更记录自 2026-09-30 起（此前状态没有记录）`
- **判类**：**C**（会改变读者判断的数据语义（时间口径、空态事实、官方原文引证、计数）→ 留）· 覆盖 1 次 / 1 页
- **理由**：时间口径（两块）：`以最近一次数据更新 2026-10-08 为基准` 是整页的**基准日**（下面每个分栏的「剩余天数」都按它算），`变更记录自 2026-09-30 起（此前状态没有记录）` 是**起算日**（区分「没有变化」与「我们刚开始记」）⇒ C 类，删了读者就失去时间坐标。
- **承重/门禁（实测）**：实测：删它**不会**让 `verify-site.js:4379/4388`（无 JS 的 `/changes/` 必须含「变更记录自 YYYY-MM-DD 起」）变红 —— 页面上另有 2 处 `.snote`（1227 行附近的「变更记录自 2026-10-01 起。」×2，套餐/API 变化块）也写着同一形状。也就是说那条既有断言**不是** `.chgmeta` 的安全网；安全网只有 C 类判据本身。这条读数如实记下来。
- **来源**：`index.html`:3916

#### HINT-DETAIL

- **代表原文**：`详情`
- **判类**：**D**（交互 / 无障碍 / 结构槽位提示 → 留）· 覆盖 50 次 / 1 页
- **理由**：交互提示：卡片右下角的「详情」是可点区域的**可点性提示**，且只在有 JS 时显示（CSS 由 `body.js` 门控）。它不描述内容、也不自证任何实现 ⇒ D 类（交互提示）。
- **承重/门禁（实测）**：既有断言 `verify-site.js:215/238`（无 JS 时所有 `.meta .hint` 必须 `display:none`）就钉在这 50 个元素上。⚠️ 如实记一个**反空洞缺口**：那条断言写的是 `[...document.querySelectorAll(".meta .hint")].every(...)`，空集合也返回 true ⇒ **把 50 个 `.hint` 全删掉它仍然绿**。新扫描面的断言不能照抄这个形状（要点数，不能只 `every`）。
- **来源**：`index.html`:3070

#### FDESC-FEED-SLOT-A

- **代表原文**：`AI 平台 API 的单价、计费单位、模型计价条目、免费额度、限速与 credits 的变化。数据来自本站重建 API 计费数据时的观测记录…`
- **判类**：**A**（站务 / 自证 / 内部实现（采集方式、生成方式、字段模型、文件名、判据门槛）→ 删）· 覆盖 1 次 / 1 页
- **理由**：形状上是 A 类（第二句「数据来自本站重建套餐数据时的观测记录」= 生成方式自证），**但它是 Feed 产物的 description 槽位**：实测这两条文案逐字出现在 `dist/feed/plans/coding/changes.{json,xml}` 与 `dist/feed/plans/api/changes.{json,xml}`（每个各 2 个产物文件），而 Feed 的频道 description = `spec.description` + 构建期注记（`feeds.js:1226-1246` 用空格 join）⇒ **改它 = 改 Feed 产物字节**（本轮硬约束禁止）⇒ keep。
- **承重/门禁（实测）**：硬约束：Feed 产物本轮逐字节不变。要删形状上的 A 句，必须另开一轮并接受 Feed 字节变化（订阅者会看到 description 变了）。
- **来源**：`scripts/lib/feeds.js`:491

#### FDESC-FEED-SLOT-A

- **代表原文**：`AI Coding 套餐的价格、活动价、额度、模型与限制的变化。数据来自本站重建套餐数据时的观测记录；每条变化都能在套餐对比页找到落点。`
- **判类**：**A**（站务 / 自证 / 内部实现（采集方式、生成方式、字段模型、文件名、判据门槛）→ 删）· 覆盖 1 次 / 1 页
- **理由**：形状上是 A 类（第二句「数据来自本站重建套餐数据时的观测记录」= 生成方式自证），**但它是 Feed 产物的 description 槽位**：实测这两条文案逐字出现在 `dist/feed/plans/coding/changes.{json,xml}` 与 `dist/feed/plans/api/changes.{json,xml}`（每个各 2 个产物文件），而 Feed 的频道 description = `spec.description` + 构建期注记（`feeds.js:1226-1246` 用空格 join）⇒ **改它 = 改 Feed 产物字节**（本轮硬约束禁止）⇒ keep。
- **承重/门禁（实测）**：硬约束：Feed 产物本轮逐字节不变。要删形状上的 A 句，必须另开一轮并接受 Feed 字节变化（订阅者会看到 description 变了）。
- **来源**：`scripts/lib/feeds.js`:491


---

## 5. 上一轮报告 §8 的 7 组「待确认」——最终裁定

| # | 组 | 动作 | 结论 |
|---|---|---|---|
| 1 | 42–45 条目录页题注 `共 N 条。` / `共 N 个入口。` | **keep** | 保留 |
| 2 | /status/「机器可读的同一份数据：source-health.json。」（32 字） | **keep** | 保留 |
| 3 | /feeds/「信息来自厂商官方页面，最终以官方页面为准。」（21 字） | **keep** | 保留 |
| 4 | /feeds/「套餐变化来自人工逐条核对官方页后重建的套餐数据（plans.json）…」（133 字） | **keep** | 保留 |
| 5 | /models/ 题注末句「「目录状态」是派生分类，「模型角色」来自 registry。」 | **delete** | **批准删除（只删末句）** |
| 6 | /status/「这一页列出每个采集来源最近一次的结果与跨运行的连续性…」（128 字状态判据） | **keep** | 保留 |
| 7 | 扫描面之外的 8 类小字容器（`.dsrc-note` / `.ddesc` / `.chgnote` / `.pchnote` / `.pftdesc` / `.chgmeta` / `.hint` / `.fdesc`） | **per-item** | 逐条裁定见 §3/§4：4 组 delete（`.dsrc-note` 尾半句 ×80 页 · `.ddesc` 采集方式 ×17 页）· 82 组 keep |

### 5.1 42–45 条目录页题注 `共 N 条。` / `共 N 个入口。`

**位置**：目录页家族 45 页的 `.ctable` `<caption>`

**动作**：`keep` —— 保留

**实测**：

- 实测 45 个目录页**全部**有题注（`captionScanned = captionExpected = 45`；上一轮报告写的「42 条」是牙齿修好**之前**的读数）。
- 题注只有两种逐字形状：`共 N 条。`（目录/分类/需求/厂商/别名页）与 `共 N 个入口。`（枢纽页 2 页）。
- 删整条题注 ⇒ 构建期「有主表却没有 <caption>」当场红（`build-local.js:6262-6266`）；只删文字 ⇒ `^(共 N 条。)$` 整串匹配失败，同样红。

**下限读数**：

| 项 | 读数 |
|---|---|
| kind | family: collection/need/alias/category/vendor/hub |
| textFloor | 600+60×条目数（hub 500+60×子页数） |
| tightestPage | need/no-card/ |
| marginBefore | 50 |
| captionChars | 6 |
| marginAfter | 44 |
| floorPinned | false |

> **不被正文下限钉住**（最薄的 need/no-card/ 删掉 6 字题注后余量 44 仍 ≥ 0），被钉住的是**题注牙 + a11y 名**。

**门禁/判据**：① `<caption>` 在任何浏览器里都不渲染（对读者零可见价值、零干扰），但它是 `.ctable` 的**可访问名**（a11y，D 类口径「留」）；② 它是构建期「目录页家族题注形状牙」的**承重面**（`build-local.js:6196-6267`，判据 `captionScanned === captionExpected` 按产物现算，没有可退化的区间）——删它必须同批改牙（= 删/改断言，契约禁止）。

**结论**：保留。若确要删，需同时决定 a11y 名由谁承担、并把题注牙换成等强度替代物（那是另一轮的范围）。

### 5.2 /status/「机器可读的同一份数据：source-health.json。」（32 字）

**位置**：/status/ `<main>` 末段 `p.snote`

**动作**：`keep` —— 保留

**实测**：

- `/status/` 的 `.snote` 恰好 2 条（128 字状态判据 + 本条）＝ 页面族下限声明的 `main-snote: {min: 2}`（`build-local.js:1379`）。
- 正文下限读数：`visibleText = 1228`，`textFloor(status) = 600` ⇒ 余量 628；删 32 字后余量 596 ≥ 0。

**下限读数**：

| 项 | 读数 |
|---|---|
| kind | status |
| textFloor | 600 |
| visibleChars | 1228 |
| marginBefore | 628 |
| deleteChars | 32 |
| marginAfter | 596 |
| floorPinned | false |

> **不被正文下限钉住**（余量 628→596），被钉住的是页面族结构下限。

**门禁/判据**：被**页面族结构下限**钉住：`main-snote ≥ 2`，删它剩 1 < 2 ⇒ 构建期 `floors` 与 `verify-site.js` §22c ⑨ 当场红。要删必须同批把下限调低（契约禁止「调低正文下限」，页面族下限同理）。

**结论**：保留（被结构下限钉住 + 它是数据出口，属 C/D 边缘）。

### 5.3 /feeds/「信息来自厂商官方页面，最终以官方页面为准。」（21 字）

**位置**：/feeds/ 说明段 `p.snote`；源码 `scripts/lib/feeds.js:151`（`officialNote`），渲染点 `build-local.js:2507`

**动作**：`keep` —— 保留

**实测**：

- `/feeds/` 的 `.snote` 恰好 4 条＝页面族下限 `main-snote: {min: 4}`（`build-local.js:2359`）。
- 正文下限读数：`visibleText = 3971`，`textFloor(feeds) = 600` ⇒ 余量 3371；删 21 字后余量 3350。

**下限读数**：

| 项 | 读数 |
|---|---|
| kind | feeds |
| textFloor | 600 |
| visibleChars | 3971 |
| marginBefore | 3371 |
| deleteChars | 21 |
| marginAfter | 3350 |
| floorPinned | false |

> **不被正文下限钉住**；被页面族结构下限（main-snote ≥ 4）钉住。

**门禁/判据**：B 类形状（与共享页脚重复）确实成立，但删它 ⇒ `main-snote` 3 < 4 ⇒ 构建期红。按契约「不许调低下限」⇒ 只能保留。若真要删，必须同一轮显式裁定放宽该页下限（不是本轮）。

**结论**：保留（被页面族下限钉住；不是「内容上不该删」而是「这一轮删不得」）。

### 5.4 /feeds/「套餐变化来自人工逐条核对官方页后重建的套餐数据（plans.json）…」（133 字）

**位置**：/feeds/「套餐与 API 计费」段 `p.snote`；源码 `scripts/lib/feeds.js:316-318`（`FEED_LIST_GROUPS` 的 `plans` 组 `note`）

**动作**：`keep` —— 保留

**实测**：

- 同第 3 组：`/feeds/` `.snote` 恰好 4 条、下限 4。
- 正文下限：删 133 字后余量 3371 − 133 = 3238 ≥ 0。

**下限读数**：

| 项 | 读数 |
|---|---|
| kind | feeds |
| textFloor | 600 |
| visibleChars | 3971 |
| marginBefore | 3371 |
| deleteChars | 133 |
| marginAfter | 3238 |
| floorPinned | false |

> **不被正文下限钉住**；被结构下限钉住。

**门禁/判据**：A 类形状成立（点名 `plans.json` / `api-plans.json` / `deals` 并说明生成方式），但删它 ⇒ `main-snote` 3 < 4 ⇒ 红。

**结论**：保留（被下限钉住）。若要消掉 A 形状，正确做法是把这一组 note **改写**成面向读者的落点说明，而不是删（改写不改条数 ⇒ 不碰下限）。

### 5.5 /models/ 题注末句「「目录状态」是派生分类，「模型角色」来自 registry。」

**位置**：/models/ 的 `.ptable` `<caption>`；源码 `scripts/lib/models-page.js:872`

**动作**：`delete` —— **批准删除（只删末句）**

**实测**：

- 正文下限：`/models/` `visibleText = 5740`，`textFloor(models-index, 51) = 600 + 60×51 = 3660` ⇒ 余量 2080；删末句后 2051 ⇒ **远不碰下限**。
- 题注牙：**不碰**。牙齿的扫描面是 `built.directoryPages`（`build-local.js:6208-6209`），它来自 `DIRECTORY_PAGES`，**只含 collection / need / alias / vendor / category / hub**；`/models/` 是 `models-index`，**不在射程内**（`build-local.js:6280-6283` 明确写着「非目录页的题注一条都不进 `captionProblems`」，只报告不判）。
- 删后题注仍非空（前两句留着）⇒ 不会触发「有主表却没有 <caption>」，a11y 名照旧存在（只是短了 29 字）。
- 没有任何既有断言引用这句话（全仓 grep `「目录状态」是派生分类` 只命中 `models-page.js:872` 那一行本身）。

**下限读数**：

| 项 | 读数 |
|---|---|
| kind | models-index |
| textFloor | 3660 |
| visibleChars | 5740 |
| marginBefore | 2080 |
| deleteChars | 29 |
| marginAfter | 2051 |
| floorPinned | false |

> 不碰正文下限，也不碰题注牙（不在射程内）。

**编辑点**：`scripts/lib/models-page.js` 里 `的本站数据；「目录状态」是派生分类，「模型角色」来自 registry。` → `的本站数据。`（文件内命中 **1** 次）

**理由**：末句 = 内部列来源（`registry` 是内部数据文件名）+ 分类说法，而「目录状态是派生的中性分类、不是质量评分」这件事在同一页下方的「口径与说明」里已经**完整讲过一遍**（`models-page.js:170-172`，面向读者、写得比题注细）⇒ 题注末句是 B 类重复 + A 类内部标识符。前两句（一行是什么 / 计数只统计已显式映射的数据）是表图例，留。

**结论**：批准删除末句。切点：连同前面那个分号一起换成句号，判据是一次唯一命中（已现场重数）。

### 5.6 /status/「这一页列出每个采集来源最近一次的结果与跨运行的连续性…」（128 字状态判据）

**位置**：/status/ `<main>` 首条 `p.snote`

**动作**：`keep` —— 保留

**实测**：

- `/status/` `.snote` = 2，其中 128 字这条是三态定义（正常 / 异常 / 失败）与阈值（连续 3 次零产出、掉到上次一半以下）的唯一说明。

**下限读数**：

| 项 | 读数 |
|---|---|
| kind | status |
| textFloor | 600 |
| visibleChars | 1228 |
| marginBefore | 628 |
| deleteChars | 128 |
| marginAfter | 500 |
| floorPinned | false |

> 删它正文仍 ≥ 600（余量 500），但会立刻触发页面族结构下限（`main-snote ≥ 2` ⇒ 剩 1）。

**门禁/判据**：前一轮已裁定保留（三态/阈值定义会改变读者判断 = C 类）；本轮复核结论不变。删它 = 删掉 `main-snote` 的一半，结构下限同样当场红。

**结论**：保留（C 类 + 结构下限双重）。

### 5.7 扫描面之外的 8 类小字容器（`.dsrc-note` / `.ddesc` / `.chgnote` / `.pchnote` / `.pftdesc` / `.chgmeta` / `.hint` / `.fdesc`）

**位置**：本轮 census（`census2.json` 逐条 + `secondary-page-residue-v2-census.md` 逐条表）

**动作**：`per-item` —— 逐条裁定见 §3/§4：4 组 delete（`.dsrc-note` 尾半句 ×80 页 · `.ddesc` 采集方式 ×17 页）· 82 组 keep

**实测**：

- `dist` 锚定：304 文件 · treeDigest `141af6139516922f…2d2f34`（与仓库 `scripts/tools/tree-digest.cjs` 逐字符相同）。
- 扫描面 186 个产物页面 · 352 次出现 · 86 个（容器 × 祖先 × 原文）组。
- `/deal/*` **实测 80 页**（不是简报里写的 95 页；全站 186 页 = 80 deal + 52 models + 26 vendor + 6 category + 10 need + 3 plans + 9 单页）；`deals.json` 里有 153 条记录，只有 80 条有详情页。

**下限读数**：

| 项 | 读数 |
|---|---|
| kind | per-page |

> 逐页余量见 `census2.json` 每条 `floorRisk`；被下限钉住的条数 = 0（最薄的一页仍是 need/no-card/，余量 50 与本轮 8 类容器无关）。

**结论**：见 §3 裁定书与 §4 统计。

---

## 6. 统计

| 口径 | 读数 |
|---|---|
| 页面 | 186 |
| 出现次数 | 352 |
| 归并组 | 86 |
| 删除 | 4 组 / 97 次 / 80 页（占出现次数 27.6%）|
| 保留 | 82 组 / 255 次 / 86 页 |
| 判类 | A 19 · B 80 · C 180 · D 73 |
| 被下限钉住 | 0 条 / 0 组 |
| 删除的可见正文字数 | 1164 字（全站 86 页面上）|
| 有唯一编辑点的删除组 | 4 / 4 |
| 有数据面依赖的删除组 | 3 组（`.ddesc` 的 3 组）|

按容器：

| 容器 | 组 | 次数 | 页 | 删（组/次） | 留（组/次） | 祖先 |
|---|---|---|---|---|---|---|
| `.dsrc-note` | 3 | 165 | 80 | 1 / 80 | 2 / 85 | `.dsrc` `.dhist` `.dplans` |
| `.ddesc` | 44 | 80 | 80 | 3 / 17 | 41 / 63 | `.dbody` |
| `.chgnote` | 1 | 19 | 1 | 0 / 0 | 1 / 19 | `.(root)` |
| `.pchnote` | 3 | 4 | 2 | 0 / 0 | 3 / 4 | `.(root)` |
| `.pftdesc` | 4 | 4 | 1 | 0 / 0 | 4 / 4 | `.(root)` |
| `.chgmeta` | 1 | 1 | 1 | 0 / 0 | 1 / 1 | `.(root)` |
| `.hint` | 5 | 54 | 1 | 0 / 0 | 5 / 54 | `.g` `.(root)` |
| `.fdesc` | 25 | 25 | 1 | 0 / 0 | 25 / 25 | `.(root)` |

---

## 7. 交给下一阶段的「断言面」（把「删掉不许回流」扩到新扫描面）

本普查只判不删。下一阶段要实现删除时，**断言的判据字面必须按下面的实测边界写** —— 写成宽口径会把合法的同族文案一起判红，写成 `every()` 又会被空集合架空：

| 面 | 判据（可机器判定） | 本轮实测边界（用来标定字面与阈值） |
|---|---|---|
| **删除面 1**：`.dsrc-note` 尾半句 | 遮蔽 `script`/`style`/注释后，产物里不得出现 **`；最终以厂商官方页面为准。`（带分号）** | 现在：遮蔽后 **80 页 80 次，全部落在 `class="dsrc-note"`**。⚠️ 去分号的 `最终以厂商官方页面为准。` 还有 **1 处合法存在**（`/plans/` 的导语，v1 §3.4 已登记不动）⇒ 判据必须带分号；⚠️ **不遮蔽**的话会多报一页（`dist/index.html` 的内联脚本里有 AUDIENCE 副本）⇒ 判据必须只看可见正文 |
| **删除面 2**：`.ddesc` 采集方式 | 产物里不得出现 **`（无头浏览器渲染后提取）`（整括号）** | 现在：**17 页 17 次，全部落在 `class="ddesc"`**。⚠️ **不许**把判据写成 `无头浏览器渲染` —— 那个宽口径全站有 **35 次**，其中 **17 次是 `.dsrc` 里合法的「采集方式：无头浏览器渲染」标签行**（`class="v"`），写成宽口径会把一个**必须存在**的字段判红 |
| **保留面 1**：诚实声明不许被顺手删掉 | `.dsrc` 块必须仍匹配 `/不构成对优惠是否有效/`（既有的 `verify-site.js:1926` 已经是这条，不要重复造） | 现在：遮蔽后 **80/80 页**命中 |
| **保留面 2**：空态说明不许被顺手删掉 | 无变更记录的条目必须仍含 `HISTORY_NOTES.emptyNote`（既有 `build-local.js:5523` 已是这条） | 现在：80/80 页命中 |
| **保留面 3**：页脚与导语不许被连坐 | 页脚字面 `最终以官方页面为准。` 必须仍在全部页面（**与删除面的字面不同**，别用一条正则同时管两边） | 现在：**186 页 189 次** |
| **保留面 4**：Feed 槽位 | `.fdesc` 的 25 条文案必须与 Feed 产物的频道 description 前缀逐字一致（「Feed 字节不变」这条硬约束的机器化） | 现在：**25/25** 在 Feed 产物里逐字命中，**25/25** 频道 description 以它为前缀 |
| **保留面 5**：行结构不许留空槽 | `.chgnote` 所在的 `.chgv` 不许为空；档位条 `.tierhead .hint` 的 4 条不许消失 | 现在：19/19 行有 `.chgnote`；4 个档位条各 1 条 |
| **返回面**：新断言本身不许被架空 | 新扫描器必须同时打印**判了几条 / 应有几条**（`scanned === expected` 按产物现算）——`every()` 形状在空集合上恒真 | 反例（本轮实测的既有缺口）：`verify-site.js:215/238` 的 `.meta .hint` 断言就是 `every()`，把 50 个 `.hint` 全删掉它**仍然绿**；`build-local.js:6349-6359` 只数分带与卡片，不检查档位条文字 |

**删除模拟（在真实产物上做过，不是纸面推演）**：`research/_raw/secondary-page-residue-v2/probe-boundary.cjs` 对 `dist/deal/017bdbc04e70/index.html` 与 `dist/deal/1888ab62bd67/index.html` 直接做字面替换后重算：

| 页面 | 删前 visibleText | 删尾半句后 | 再删括号后 | 删后得到的句子 |
|---|---|---|---|---|
| `/deal/017bdbc04e70/` | 1372 | **1360**（Δ 12） | 1360（这一页 `.ddesc` 是正常的领取说明，不含括号） | `.ddesc`：`百度千帆大模型平台新用户免费额度，访问平台并同意用户协议后自动开通发放，仅可抵扣预置模型在线推理消耗的 Tokens。`（未动） |
| `/deal/1888ab62bd67/` | 1438 | 1438 | **1426**（Δ 12） | `.ddesc`：`来源：火山方舟产品页「免费额度」表。` |

两页都仍然满足：诚实声明在（`不构成对优惠是否有效、是否适用于你的判断`）、页脚那句在（`最终以官方页面为准。`）⇒ **删除是外科式的，不是把元素删掉**。

> 这三类「保留面」不是新判据：它们全部**已经存在于仓库**（`verify-site.js:1926` / `build-local.js:5523` / Feed 可复现门禁），本轮只是把「删哪半句」与「哪半句必须留」的对应关系钉清楚，避免下一阶段删过头。

---

## 8. 方法与局限（不许把读数当射程用）

1. **总数口径**：`chars` / `visibleChars` 用 `seo.visibleText()`（全仓统一口径），与构建期的 `prerenderText()` **不是同一个计数器**（后者剥 script/style 但同样含导航/页脚）。
   本报告的 `floorRisk` 是同口径内的比较；权威下限读数在构建期与 `seo-verify`。
2. **`floorRisk` 是推断值**：`textFloor` 需要 `ItemList.numberOfItems`；`/plans/*` 的 count 语义（44 / 108）与 `seo-verify` 的 `rows.items.length` 可能不同 —— 但本轮 8 类容器**都不在 `/plans/*` 的删除面上**，结论不受影响。
3. **`.ddesc` 的删除本体在数据面**：`（无头浏览器渲染后提取）` 写在 `deals.json`（17 条）与 `scripts/collectors/headless.js`（3 条模板）里。在「不许改数据面产物字节」的前提下，改当前产物只有渲染层归一这一条路；**只改采集器不会改当前产物**（这一点必须写进交付说明，不能假装已删）。
4. **`.fdesc` 的 keep 是硬约束推论，不是内容判断**：这 25 条里有 2 条形状上是 A 类（生成方式自证），但因为它们与 Feed 产物的 description **同源**，本轮判 keep。要删必须另开一轮并接受 Feed 字节变化。
5. **`.hint` 的两处断言缺口**（本轮实测）：`verify-site.js:215/238` 用 `every()`，空集合恒真；`build-local.js:6349-6359` 只数分带与卡片，不检查档位条文字。⇒ 这两处都**不能**充当新扫描面的安全网。
6. **`.chgmeta` 的既有断言不是它的安全网**：`verify-site.js:4379/4388` 只要求 `/changes/` 的 body 文本里有「变更记录自 YYYY-MM-DD 起」，而页面上另有 2 处 `.snote` 满足它 ⇒ 删 `.chgmeta` 不会变红。它留下来的唯一依据是 C 类判据（时间口径）。
7. **动态数字**：`另有 30 条更早的变化`、`共 N 条。`、`显示 51 / 51 个模型` 里的 N 随数据变；删除规格书用模板（带 `{n}` / `N`）就不会因数据漂移失效。
8. **判断成分**：C/D 的边界（尤其「结构槽位提示」vs「数据语义」）带判断成分 —— 每一条的判类与理由都写进了 `census2.json`，可逐条复核与推翻。
9. **只读承诺**：本轮没有改任何源码/数据/产物；`dist` 的 treeDigest 在普查前后各取一次，都是 `141af6139516922f925cc9605ee45efd6c4b65c499b2ad2cda689984612d2f34`。

---

## 9. 证据文件与复现

| 文件 | 内容 |
|---|---|
| `research/secondary-page-residue-v2-census.md` | 本报告（逐条表 + 裁定书 + 统计）|
| `research/_raw/secondary-page-residue-v2/census2.json` | 机器可读全量：`rulings`（86 组）+ `items`（352 次出现）+ `section8`（7 组）+ `uniqueness` |
| `research/_raw/secondary-page-residue-v2/other-smallprint2.txt` | 去重清单（容器 × 祖先 × 原文，带行号与页数）|
| `research/_raw/secondary-page-residue-v2/scan2.cjs` | 扫描器（只读 dist；遮蔽保换行；输出 `scan2-pages.json` / `scan2-raw.json` / `other-smallprint2.txt`）|
| `research/_raw/secondary-page-residue-v2/classify2.cjs` | 分类器 / 裁定表（生成 `census2.json`，现场重数唯一性）|
| `research/_raw/secondary-page-residue-v2/probe-specs.cjs` | 侦察：`<details>` 分布、候选编辑点唯一性、deals.json 的 17 条来源行、45 条题注的逐页余量 |
| `research/_raw/secondary-page-residue-v2/probe-feeds.cjs` | 侦察：`.fdesc` ↔ Feed 产物同源（25/25 正向 + 25/25 频道 description 前缀）|
| `research/_raw/secondary-page-residue-v2/probe-boundary.cjs` | 侦察：删除面的边界（精确字面 vs 宽口径的全站命中数、容器分桶、**在真实产物上做删除模拟**）|
| `research/_raw/secondary-page-residue-v2/probe-floors.cjs` | 侦察：`pageKind` 词表与逐页下限（186 页）|
| `research/_raw/secondary-page-residue-v2/inspect.cjs` / `probe2.cjs` | 一次性侦察（未列进交付）：**`/deal/*` 页是静态预渲染**（不是客户端渲染，所以容器在遮蔽 script 之后仍能扫到）、`dist/_notes.ndjson` 的结构与 `floors` 声明 |
| `research/_raw/secondary-page-residue-v2/verify2.cjs` | 交付自检（18 项：必填字段 / 计数自洽 / 唯一性可复现 / §8 七组 / dist 未变 / 没有本轮写产物）|

复现（全部只读）：

```bash
node scripts/tools/tree-digest.cjs dist                     # 141af613…（本报告锚定的产物）
node research/_raw/secondary-page-residue-v2/scan2.cjs      # 352 次 / 86 组 / 186 页
node research/_raw/secondary-page-residue-v2/classify2.cjs  # census2.json（86 组全部必须被裁定，否则 exit 1）
node research/_raw/secondary-page-residue-v2/probe-specs.cjs
node research/_raw/secondary-page-residue-v2/probe-feeds.cjs
node research/_raw/secondary-page-residue-v2/probe-boundary.cjs   # 删除面边界 + 真实产物上的删除模拟
node research/_raw/secondary-page-residue-v2/make-census-md.cjs   # 重新生成本报告
node research/_raw/secondary-page-residue-v2/verify2.cjs          # 交付自检 18 项（exit 0 = 全过）
```

> 纪律：`classify2.cjs` 里**每一组都必须被裁定**（未匹配就 `exit 1`）—— 这样「又冒出一个没判过的容器」不会静默通过。
