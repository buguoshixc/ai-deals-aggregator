# 下一步：现在的状态，以及还需要你点头的事

> **2026-10-01 最新一轮：`v2.1` 第二段 —— 把套餐数据发布出来、做成 `/plans/coding/` 页面**
> （同一分支 `v2.1-coding-plan-data-model`）
> —— 上一轮收尾时列了「进 2.2 前要先解决的三件事」，这一轮就是那三件事（它们正好是 2.2 的**接线**部分）：
> ① `plans.json` 进 `PUBLIC_FILES`，产物自检断言 `dist/plans.json` 与源**逐字节相同**；
> ② `/plans/coding/` 接成一条真路由（走 `/status/` 那条**独立静态页**路径，不是落地页家族 ——
> 它只有一条路由、不分页、不需要门槛），四张清单逐处更新（页脚占位符 / sitemap 条数公式 /
> `pageRoutes` / 两张逐层扫描表），`seo.js` 的 `textFloor` 新增 `plans` 分支；
> ③ 口径文案与禁词（性价比 / 最划算 / 排行榜 / TOP 1 …）从产品规则变成**可失败的断言** ——
> 唯一出处 `lib/plans-page.js` 的 `FORBIDDEN_CLAIM_WORDS`，**三处查同一份清单**：
> 构建期查内存、产物自检**从磁盘回读**再查、真浏览器查渲染出来的 `innerText`（数据层另查一遍）。
> 页面：11 列（平台 / 套餐 / 正常价格 / 活动价 / 计费周期 / 可用模型 / 额度类型 / 原始额度 /
> 名义 Token 单价 / 最近更新 / 备注），每行一个 `data-item`，JSON-LD 三段（ItemList 指向**官方定价页**），
> 可索引 + 进 sitemap（0.9）+ 两个根 Feed，正文 2971 字，**11 列宽表在 390/360px 页面级溢出 0px**。
> 「未知」三种写法：`未标注`（文本缺失）/ `—`（数值缺失或**不可比较**）/ `未确认`（三态）——
> 并且**「原价未知」与「确实免费」成对断言**（只查一半会在另一个方向漏掉，把免费档也写成"未标注"）。
> 实测：`selftest:plans` **135 项 0 失败**（+页面层 15 项含 4 条牙）· `verify` **350 项 0 失败**（+§19 15 项）·
> `verify:regress` **356 项 0 失败**（卡片 50→50 · 首屏 9→9 · 页高 4589→**4665px 未变**）·
> `verify:seo` **8 项 0 失败**（114 页 · sitemap 111 · 孤儿 0）· 构建期 SEO **27 码 × 114 页全过** ·
> `build` ×2 页面逐字节一致 · `check:feeds:reproducible` 46 个 Feed 文件一致 · 既有 20 道门禁全绿。
> **两个真问题是断言抓的、不是人看出来的**：面包屑回站根写成 `../`（两层路由会解析到不存在的
> `/plans/`，被 SEO 内链存在性当场抓住）；页面诚实性断言第一版拿整行做正则，把 `2,000` 的末位 0
> 判成「原价未知却像 0」（改成逐单元格比对）。**两处都已纠正并补了断言。**
> **✅ 已上线（2026-10-01，按你的「合并推送」）**：PR **#13** → `gate` **success** → 合并 **`535a25b`**
> → master 的 `Verify site (gate)` 与 `Deploy to GitHub Pages` **双双 success**。
> 走 PR 而不是直推，原因与 v2.0 相同：ruleset 要求 `pull_request` + 必需检查 `gate`。
> **线上冒烟（本机这次有通路，实跑的）**：`/plans/coding/` **200**（9 行 · 口径文案在位 · 无禁词）·
> `/plans.json` **200** · `/sitemap.xml` **200**（**111** 条 `<loc>`）· 首页页脚「套餐对比」入口在线 ·
> 详情页与 `/vendor/zhipu/` `/category/api/` `/changes/` `/status/` `/feeds/` 全部 **200**。
>
> Phase 2.2 还剩下的（本段有意没做）：筛选 / 搜索 / 排序控件、套餐详情页（或行内展开）、
> 首页主入口（现在只有页脚入口）、同币种价格区间筛选。
>
> **2026-10-01 上一轮：`v2.1-coding-plan-data-model` 第一段（数据契约）**
> —— 目标：为「AI Coding 套餐对比」建立**独立于 Deals**、可长期维护 / 可校验 / 可重建 /
> 能为 Phase 2.3 History 打底的数据契约。**这一段前端一个字节没改**
> （第二段改了页脚一行：多了一个「套餐对比」入口，见上）。
> 新增 `plans.json`（**9 条套餐 / 8 个平台 / 国内 7**）与它的人工来源层
> `scripts/data/curated_plans.json`、provider 归一表 `scripts/data/providers.json`；
> 派生管线是 `curated_plans.json → npm run plans:rebuild → plans.json`（不联网、不读墙上时钟，
> `updatedAt` = 全部 `lastSeen` 的最大值）。
> 判据只有两处实现（`lib/plan-schema.js` 与 `lib/providers.js`），**校验的做法是把归一器再跑一遍**
> 再逐字段比对 —— 手改 `id`、手算 `derivedMetrics`、枚举拼错、文本多个空格都会被指名道姓地判红。
> 三道硬承诺：**不该算的绝不算**（「名义 Token 单价」只在 5 个条件同时成立时产出，
> 真实数据 **9 条全部为 null** —— 没有任何一家厂商在官方页给出固定 Token 额度）·
> **改价不换 id**（`id = sha1(kind|provider|planName|计费周期)`）·
> **只认官方页**（聚合站出处拒收；第三方只能用来发现候选，最终没有一条事实来自第三方）。
> 新增 `selftest:plans`（**117 项**，含题面 6 条 Tooth Test + 扩充的牙）、
> `check:plans:reproducible`；门禁新增两步（27 → **29 步**，`--expect-checks=35` 不变）。
> 门禁实跑：`verify` **335 项 0 失败** · `verify:regress` **341 项 0 失败**（卡片 50→50 · 首屏 9→9 ·
> 页高 4589→4665px 在 15% 容差内）· `verify:seo` **8 项 0 失败** · 既有 20 道门禁全绿
> （`selftest:provenance` 仍是 91 项，证明引文层参数化没改变 deals 侧行为）·
> **构建 ×2 + 一次 stash 对照，三次 `dist/` 全树 SHA256 完全相同** ⇒ 零页面影响有实证。
> 真实数据牙齿演练两条（硬塞 Token 单价 / 改来源层不重建）都已实跑变红并**逐字节还原**。
> 契约 `docs/SCHEMA-v2.1.md` · 报告 `research/v2.1-coding-plan-data-model-report.md`。
> **✅ 已上线（2026-10-01）**：与第二段同批走 PR **#13** → `gate` success → 合并 **`535a25b`**（见上）。
>
> 对下一阶段的判断：**适合进入 `Phase 2.2 — Coding Plan Compare`**。进入时要先解决三件事：
> ① 把 `plans.json` 接进 `build-local.js` 的 `PUBLIC_FILES`（或在构建期注入派生字段）——
> 本阶段刻意没做；② `/plans/coding/` 是一个**新的落地页家族**，`landing.js` 的 `itemsOf` 的
> `match.by`、门槛分支、`seo.js` 的 `textFloor`、构建期 sitemap 计数公式与 SEO 描述符列表
> 都要一起改（且首页页高有 15% 硬容差，导航项慎加）；③ 把口径文案
> （"名义 Token 单价只用于粗略比较"）与禁词（性价比 / 最划算 / TOP 1）补成**可失败的断言** ——
> 目前它们只是产品规则，仓库里没有脚本检查。
> 可选前置：智谱当前档位价格、百度 Comate 与 Anthropic Claude 的官方定价页需要**真浏览器**
> 才能取到（本环境的文本提取器读不动 JS 页与标签页），要覆盖这三家就先补一次浏览器取证。
>
> **2026-09-30 上一轮：`v1.7-seo-expansion`（分支 `v1.7-seo-expansion`，隔离工作树
> `.worktrees/v1.7-seo-expansion`，基点 `v1.6-subscription = 71a4057`）**
> —— 目标：**把已有的结构化数据组织成真正有搜索价值的静态入口页**（不是批量造 SEO 页）。
> 新增 **16 个页面**：厂商页 9（`/vendor/<slug>/`，门槛复用订阅的 `VENDOR_THRESHOLDS`）·
> 分类页 5（`/category/<slug>/`，门槛 ≥4 条 + 人工允许表 + 集合唯一性）· 枢纽页 2
> （`/vendor/` `/category/`，同时是面包屑父级）。另收口 **3 对早就是重复内容的近义 URL**
> （旧地址降为 `noindex,follow` 别名页，短路由保留为被索引入口）。
> 顺手修掉四个**早就在、但没有任何断言会红**的缺陷：首页与 80 个详情页缺 `<h1>`（113 页里 81 页）·
> `ItemList` 声明数与页面行数不符（`/developer/` 声明 67 实列 50）· 详情页面包屑把分类指向站根。
> 新增 **27 个检查码**的 SEO 门禁，两个**输入完全不同源**的执行点（构建期 + `npm run verify:seo`
> 只读 dist 独立重推），外加 6 条 Tooth Test 实证「该红时真的会红」。
> 实测：113 页 / 可索引 110 / sitemap 110 / Feed 46 个文件；`verify` 335 项、`verify:regress` 341 项全过，
> **首屏仍是 9 张卡**（首页只把品牌 `<b>` 换成 `<h1>` 并在页脚那一行加了入口，没有新增整行）。
> 契约 `docs/SCHEMA-v1.7.md` · 报告 `research/v1.7-seo-expansion-report.md`。
> **未合并、未推送 —— 等你的「推送」。**
>
> 对下一阶段的判断：**适合进入 `v2.0-ai-assisted-maintenance`**，唯一前置条件与 v1.6 相同 ——
> `deal-history.json` 仍是 **0 事件**，先跑满 3 天采集拿到真实变化样本再进。
>
> **2026-09-30 上一轮：`v1.6-subscription`（分支 `v1.6-subscription`，隔离工作树
> `.worktrees/v1.6-subscription`，基点 `v1.5-change-radar = 12d4d08`）**
> —— 目标：**在不引入账号 / 数据库 / 邮件 / 推送 / 第三方 SDK / 行为追踪的前提下，
> 让读者订阅自己真正关心的优惠变化**，继续跑 GitHub Pages 静态构建。
> 产出 **18 个 Feed × 2 种格式（RSS 2.0 + JSON Feed 1.1）= 36 个静态文件**：
> A 类优惠 Feed（全部 / 学生 / 开发者 / 免费 API / 免费 Tokens / AI Coding / 国内可用 / 9 家厂商）
> 回答「当前有哪些符合这个条件的优惠」；B 类变化 Feed（`/feed/new.*`、`/feed/changes.*`）
> 回答「最近发生了什么」。判据只有一处：`scripts/lib/feeds.js` 的注册表 + `validate()`，
> 优惠 Feed 的谓词**直接引用页面注册表**、变化 Feed 的条目**直接取雷达分栏**。
> 三处硬承诺：**主链接回归站内**（此前 80 条条目全部把权重导出站外）· **Stable ID
> 不动 `deal.id`**（升级不会给老订阅者重推）· **连续 10 次真实构建逐字节一致**。
> 新增 `selftest:feeds`（66 项，含 4 项 Tooth Test）、`check:feeds:reproducible`、`report:feeds`；
> 门禁新增两步（冻结序列 21 → 23 步，`--expect-checks=32` 不变）。
> 门禁实跑：`verify` **297 项 0 失败** · `verify --compare` **303 项 0 失败**（页高 +1.2%，
> 容差 15%）· 既有 11 支自测全绿 · 投毒演练确认「重复 guid / 死链 ⇒ 构建红」。
> **未合并、未推送** —— 等你的「推送」。完整报告：`research/v1.6-subscription-report.md`；
> 契约：`docs/SCHEMA-v1.6.md`。
> ⚠️ 交付当天**变化订阅是空的**（变更日志起算日 2026-09-30、0 条事件）—— 这是如实结果，
> 页面与 Feed 的说明都写明「空是事实，不是故障」，**没有补造任何历史事件**。
> 下一阶段建议：**可进入 `v1.7-seo-expansion`**（订阅把主链接、`/feeds/` 入口、
> `atom:link rel=self`、`icon`/`favicon` 这几块 SEO 地基补齐了）；但先让采集链跑满
> 2–3 天拿到真实变化样本，**在此之前不要改 `changes.js` 的窗口与高价值判据**。
>
> **2026-09-30 上一轮：`v1.5-change-radar`（分支 `v1.5-change-radar`，隔离工作树
> `.worktrees/v1.5-change-radar`，基点 `origin/master = b202d21`，其中已含 v1.4 的 PR #6）**
> —— 目标：**让用户有理由反复回来**，而不是搜索一次就离开。在 v1.4 的变更日志之上做出
> 五个分栏：今日新增 / 最近 7 天变化 / 即将结束 / 已结束 / 重新出现；
> **首页一行条带只展示高价值变化**，完整视图在 `/changes/` 静态页。
> 判据只有一处（`scripts/lib/changes.js` 的 `buildRadar()`，纯函数、零依赖、无网络、不用 LLM），
> 构建期算一次，条带与页面读同一份结果；**不注入 `dist/deals.json`、不写任何数据文件**。
> 首页条带**不单独占行**：实测第三行底边距视口底边只剩 1px，所以它与「跳到档位」共用一行
> （演练实测：独立成行 ⇒ 首屏 9→6 张；共用一行 ⇒ 9 张不变）。
> 新增 `selftest:changes`（89 项，进 CI 门禁）、`report:changes`；`history-selftest` 扩到 61 项
> （`ended` 新增可选墓碑 `label`，向后兼容）。
> 门禁实跑：`verify` **281 项 0 失败** · `verify --compare` **287 项 0 失败**（首屏 9→9）·
> `build` ×2 产物 SHA256 一致 · 非空路径用**真实数据演练**证明后逐字节还原。
> **未合并、未推送** —— 等你的「推送」。完整报告：`research/v1.5-change-radar-report.md`；
> 契约：`docs/SCHEMA-v1.5.md`。
> ⚠️ 交付当天雷达是**空的**（变更日志起算日 2026-09-30、0 条事件；`deals.json` 里 0 条 `expiresAt`）——
> 这是如实结果，**没有补造历史**；第一次真实变化会在下一次定时采集时落库。
>
> **2026-09-30 上一轮：`v1.4-deal-history`（分支 `v1.4-deal-history`，隔离工作树
> `.worktrees/v1.4-deal-history`，基于 `master = 2204565`）**
> —— 目标：**记录优惠生命周期与重要变化**，让「首次发现 / 免费额度变化 / 新增截止日期 /
> 领取条件变化 / 从官方页消失 / 消失后重现」六个问题可被机器验证地回答。
> 方案是 **D 混合**：显式 change event 作唯一运行时存储 + 一次性值基线（可重放验证）+
> git diff 降级为离线交叉校验（`npm run history:audit`，不进 CI）。**首页一行未改**（不做变化雷达）。
> 新增 `scripts/data/deal-history.json`（一次性基线 86.7 KB + 追加事件，交付时 0 条 ——
> 历史自 2026-09-30 起算，不补造）；新增两个 CI 门禁 `check:history` 与 `selftest:history`(52)。
> 门禁实跑：`verify` 262 项 0 失败 · `verify --compare` 268 项 0 失败；`build` ×2 产物 SHA256 一致。
> **已上线（2026-09-30）**：PR **#6** → `gate` success → 合并 **`bec6068`** → Deploy success；
> 线上 `verify --url=` **262 项 0 失败**（详情页「变更记录」块在线、空态与无 JS 可读都验过）。
> 完整报告：`research/v1.4-deal-history-report.md`；契约：`docs/SCHEMA-v1.4.md`。
> 下一阶段建议：**可进入 `v1.5-change-radar`**，但先观察一个采集周期拿到真实事件样本，
> 再决定聚合粒度；入口优先考虑 `/changes/` 静态页，而不是动首页密度（见报告第十节）。
>
> ⚠️ **本文件里的分支/版本坐标已作废**（当时的 `master = 777e3b7`）：之后又有多次定时数据更新、
> 推送、以及 `v1.0` / `v1.1` 两轮（均已合并进 master）。要复核现状请以 `git log` 与
> `PROJECT_STATUS.md` 为准。
>
> **2026-10-01 新增一轮：`v2.0-ai-assisted-maintenance`（分支 `v2.0-ai-assisted-maintenance`，隔离工作树）**
> —— 目标：**用 AI 降低后台维护成本，而不是给网站加聊天入口**（采集器维护、字段标注、
> 去重判断、翻译草稿、异常诊断）。**前端一个字节没改。**
> AI 只能提出候选：候选由 `scripts/ai/` 产出、进 `.ai-cache/`（不入仓），
> 人工 `ai:accept` 之后由 `ai:apply` 写进两个**已有人工来源层**（`curated_*.json` /
> `audience-overrides.json`），再离线重建 `deals.json` 并跑门禁；红了整批回滚。
> **采集链路完全不引用 AI 层**（静态断言），AI 挂掉/无 key 时退出码 0、站点照常。
> 门禁新增两步（AI 层自检 37 项 + 采集器 fixture 回放 4 项，均离线）；
> `check-ci-consistency` 新增 (16) 断言「AI 维护链路只手动触发、只读仓库、只出 artifact」，
> `--expect-checks` 32 → 35。分支基线验收 **262 项 0 失败**（六项回归全过）；
> **并回 master 后重测为 341 项 0 失败**（上游 v1.4–v1.7 的断言都在，页高 4589→4665px 在容差内），
> 门禁步骤 27 步，`build` 946.0 KB。
> 新门禁与新能力对本机没有 key 的限制也如实记在报告里：**前两臂评测不是模型分数**。
> 完整报告：`research/v2.0-ai-assisted-maintenance-report.md`；
> 前置的成本审计：`research/v2.0-maintenance-cost-audit.md`；契约：`docs/AI-MAINTENANCE-v2.0.md`。
> 合并态记录见 `PROJECT_STATUS.md` 2.39 的 ⑨ 节。
> **✅ 已上线（2026-10-01）**：直接推 master 被 ruleset 拒绝（`Changes must be made through a
> pull request` + `Required status check "gate"`），改走 PR：#11 gate 绿 → 合并 `9bf46f9` →
> deploy 链（prepublish/build/deploy）全绿 → 线上冒烟 6 条全 200。记录见 2.39 的 ⑪ 节。
>
> **2026-09-29 新增一轮：`v1.2-intent-first-home`（分支 `v1.2-intent-first-home`，隔离工作树）**
> —— 目标：**把首页从「数据库筛选器」升级成「按用户真实需求找优惠」**。
> 首页多了一行「按需求找优惠」入口（10 枚静态 `<a>`，无 JS 也在、也能点），
> 每条对应一个 `/need/<slug>/` 静态落地页（预渲染表格 + 「为什么在这一页」证据列 +
> 双 feed + 三段 JSON-LD + 自指 canonical + 进 sitemap）。
> 判据只写一遍（`scripts/lib/audience.js` 的 `NEED_PREDICATES`），结果作为**派生字段** `needs`
> 进 `dist/deals.json`，**v1.1 契约一个字没改**。
> 桌面端密度未倒退（首屏完整卡片 9 → 9，网格起点 196 → 227px，页高 +0.7%）；
> 窄屏入口给全、卡片靠滚动（这是显式取舍，见报告第七节）。
> 验收 **250 项 / 失败 0**。完整报告：`research/v1.2-intent-first-home-report.md`。
> **未合并、未推送** —— 等你的「推送」。
>
> 下一阶段的建议（含是否进入 `v1.3-evidence-provenance`）也写在那份报告第八节：
> 建议进入，并把 `ai-coding` 的字段缺口并进去。
>
> **2026-09-28 新增一轮：`v1.0-public-readiness`（16 个提交，已合并进 master）**
> —— 目标是把项目从「功能比较完整的个人项目」变成「可以公开、长期、低维护成本运行的数据产品」。
> 四项已知线上问题已修（有效期语义 / 锚点假隐藏 / 中文译文可搜 / 原文截断留痕）；
> 发布链改成 `prepublish(完整门禁) → build → deploy`，**门禁红时本次版本绝不发布**；
> 新增数据源健康状态与 `/status/` 页（跨运行的 `scripts/data/source-health.json`）。
> 另外：译文门禁从建议性改成硬门禁（漂移必红、待译按 7 天宽限期）。
> 收尾时 3 条待译（Midjourney / Grok / Unboring.ai，上游改写 + 新进条目）**已由人补译完毕**，
> 现在 `npm run check:zh` 报 `待译 0 条`；同时修掉一个假红陷阱 —— 已译好的行原先会一直留在
> `scripts/data/zh-pending.json` 里，等上游再改写一次、译文撤下时会翻出旧日期当成「等了很久」，
> 现在作者循环 `--scaffold` 会顺带划账（两条牙守着：已译好的必须消失、仍缺译的必须保留原日期）。
> 下一阶段（学生 + 开发者数据模型）的前置条件见 `PROJECT_STATUS.md` 2.33 的 F 节。
>
> **✅ 那三件只能由人在 GitHub 网页上做的事：已全部完成**（2026-09-28 当晚）
> 1. **专用 GitHub App** 已建、已安装，`COLLECT_APP_ID` / `COLLECT_APP_PRIVATE_KEY` 已存。
>    为什么必须：`github-actions`（App ID 15368）是平台原生身份，**不能**被加进 ruleset
>    绕过名单（API 422）—— 细节见 `research/v1.0-public-readiness-report.md` 第七节。
> 2. **PR #1 已合并**（`b95f15c`）；合并后 master 上 `gate` + `prepublish` + `build` + `deploy` 四段全绿。
> 3. **ruleset `master-gate` 已 Active**，生效规则四条：`pull_request`(0 审批) ·
>    `required_status_checks: gate`（**钉在 GitHub Actions 签发方上**）· `non_fast_forward` · `deletion`；
>    绕过名单只有那个 App。机器人已在其下两次成功提交数据（`a7d7a22` / `259199b`）。
>
> 真机证据（两条红探针 run 的逐 job 结论）、以及「第一次配置漏了 `required_status_checks`、
> 后来怎么用 `GET /rules/branches/master` 发现」都记在报告第七节。
> 只剩一件顺带做的事：**下次开 PR 时留意 `gate` 红时 Merge 是否真的被禁用** ——
> 现有证据证明的是「门禁红 ⇒ 不发布」，不是「红着合不了」。

---

## 一、已经办掉的（都可复核）

| 事项 | 结果 |
|---|---|
| **合并 A+B+收尾** | ✅ 按你的点单「全合」：`git merge --no-ff trial/merge-rehearsal-2` → **`10cc923`**，零冲突 |
| **收藏 / 对比（G11）** | ✅ **`30d547f`**。门禁抓出「62 张卡集体 3px 纵向溢出」并修掉（纯 CSS 一行，判据一字未动） |
| ~~首页按意图重排（C2）~~ | ⛔ **已按你的决定撤下** —— 不额外加一个主页、入口级别先不议。评审页已删，**线上首页一行未改** |
| **视觉复核** | ✅ 已补齐（原计划 B4）：**23 条**独立视觉评述，逐条在 [`research/VISION-REVIEW.md`](research/VISION-REVIEW.md) |
| **并回上游（第一次）** | ✅ **`71d020a`** —— 并回 `origin/master` 的 13 个提交（**被重写过的 A/B 线** + 数据更新 + 活动期限三分类）；6 个文件冲突逐个人工解，两侧内容零丢失（见 2.27） |
| **并回上游（第二次）** | ✅ **`0d6b869`** —— 集成期间上游又推了 `fix/detail-close`（删掉详情里重复的「关闭」死链），零冲突 |
| **修掉 chip 折行** | ✅ 390px 下 `rows=2 perRow=[3,1]`、右侧空 **269px** → **`rows=1 perRow=[4]`、余量 0px** |
| **窄屏横向溢出（新发现）** | ✅ 门禁只量 390px，所以从没报过：**320px 溢出 42px、360px 溢出 2px**（根因 `.grid` 的 `1fr` = `minmax(auto,1fr)`，下限被卡片顶在 345.5px）。改成 `minmax(0, 1fr)` 后**均归 0**，且卡内被裁元素 0 个 |
| **门禁补盲区** | ✅ `verify-site.js` §10 新增 3 条断言（逐个控件是否被裁 / chip 是否排满一行 / **360px 页面级溢出**），前两条同时验 390 与 360 两档；**§4 既有判据一字未改**（该文件 +78/−0 纯新增） |
| **本地预览** | ✅ `node scripts/serve.js --dir=dist` → `http://127.0.0.1:8080/`（200，标题正确） |
| **上线** | ✅ 按你的「push」：`git push origin master` **快进** `c70706b..ecbc815`；Deploy 工作流 **success**；线上 `verify --url=` **108 项 0 失败**（上线当日的记录；**线上复测值待复测，见 P0-2**——本机到该 host 无通路）；记录本身随后也推了（`ecbc815..fa2403d`，两次 Deploy 都 success）。现本地 = 上游 = **`fa2403d`**（见 2.28） |

**合并态门禁（在 `0d6b869` + 本轮改动这一棵树上实跑）**：`test` / `test:strict` / `check:zh` exit 0（漂移 0、待译 0）；
`selftest:zh` **7 项 0 失败**；`selftest:expiry` **55 项 0 失败**；`build` ×2 → **产物 139 文件**、全树摘要两次一致
（`8be46e1581651038a7662e41…`）、产物自检通过；`verify:regress` **验收 113 项 0 失败**（113 已含那 5 项回归比对）。

> **环境坑已过时（如实更新）**：2.21 / 2.26 都记着「沙箱 `workspace-write` 禁止子进程管道 stdio，
> playwright 与 `spawnSync` 会以 `spawn EPERM` 失败」。**本会话策略已改为 `danger-full-access` 且关闭审批**，
> 所以上面这些门禁全是**直接跑通**的，没有再绕。前两节的记录是当时的真实情况，后来人不必再照着绕。

---

## 二、已上线；剩下可选的只有观感项

### 是否上线

**已上线（2026-09-23）**：你说「push」后执行了 `git push origin master` ——
`c70706b..ecbc815` **快进**推送成功，Deploy 工作流 [run 35841045158](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/35841045158) **success**。
随后这份**上线记录本身**也推了（`ecbc815..fa2403d`，同样快进，
Deploy [run 35849728738](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/35849728738) success）——
两次差别只在 3 个 `.md`，`dist` 不含 `.md`，所以**线上产物两次完全相同**。

> **一处口径纠正（原先写错了，已改）**：旧文档说「`push` 会触发 CI 采集与 Pages 部署」。
> 实际 `deploy.yml` 是**纯发布**流程（它自己的注释就写着「不做采集（采集由 collect.yml 负责）」）：
> **push 只触发发布**；采集由 `collect.yml` 按**定时**（北京时间 08:00 / 20:00）或手动 dispatch 跑，
> 跑完再由 `workflow_run` 唤起发布。所以推送后线上会立刻更新，但数据采集不会因此多跑一次。

### 不用点头、但你可以点单的：三个观感项

`research/VISION-REVIEW.md` §6 第 4–6 条：控制带偏厚、强调色重复节奏、暗色卡片与底色的明度差。
**它们都不是缺陷，是取舍**；要做的话我按同一套流程来（改 → 门禁 → 视觉复核）。

> 已撤下的两项不算「待办」：**C2 首页按意图重排**（你的决定：不额外加主页）与**英文覆盖**
> （唯一带持续人工成本的项）。素材：`mockups/v3/C-ambitious/PLAN.md`、
> `mockups/v4/README.md`（含一条命令恢复评审页）。

---

## 二·五、已办：收藏入口 + 「打开对比」修复（**2026-09-27 已上线**）

**起因是你的两条反馈**：点击收藏后没有入口打开收藏列表；加入 2 个模型后点「打开对比」打不开。
复核后是**三条现象、三条根因**（真浏览器实测，详见 `PROJECT_STATUS.md` 2.29）：

| 现象 | 根因（一句话） |
|---|---|
| 「打开对比」点不开（必现） | 弹层的 `hidden` 属性从没被摘掉，而 `body.js .cmpdlg[hidden]{display:none}` 是作者级规则 ⇒ 进了顶层却 `display:none`、0×0，**页面还被 inert 冻住** |
| 换筛选后「打开对比」静默失效 | 对比项只在**当前筛选后的卡片**里解析；不足 2 条时直接 `return`，条上却仍写「已选 2 条」而标题条 0 个 |
| 收藏只有「加」没有「看」 | 2.22 当时明确列为不做；本轮补上入口 |

**做了什么**：弹层显隐交回 `<dialog>` 的 `open`；新增 `state.selectIndex`（按**整份数据**解析收藏/对比，
与筛选/Tab/折叠无关）；新增**收藏入口**「★ 我的收藏 N」（只看收藏的视图 + 空态说明 +
失效收藏的「清理这 N 条」，入口放筛选条最前面以免手机上要横滑才看见）。

**门禁（本地同一份产物实跑）**：`verify` **124 项 0 失败**（基线 108，+16 条新断言，全部量几何而不是 DOM 状态）；
`verify:regress` **129 项 0 失败**（5 项回归全过：卡片 62→62、首屏 9→9、页高 5382px 在容差内、外部请求 0、JS 错误 0）；
`build` 自检通过；`test` / `test:strict` / `check:zh` / `selftest:zh`(9) / `selftest:expiry`(55) 全绿；
`check-mobile-chrome` 零裁切。默认视图**预渲染产物与改动前逐字节相同**。

**上线（2026-09-27）**：推送前先 `fetch`，远端已前进到 `4a37a3c`（8 次定时数据更新）→ 零冲突并回 →
重跑门禁 → 补 2 条新进条目的中文译文（否则新门禁 `Translation self-test` 会当场变红）→
`git push origin master` 快进到 **`da3b6e1`**。
`Deploy to GitHub Pages` 与 `Verify site (gate)` **双双 success**；线上定向探针实测：
收藏入口出现、收藏视图正常、**「打开对比」弹层可见（920×548、`:modal=true`、2 列）**、Esc 后无残留弹层、JS 错误 0。
唯一没拿到绿的是 `verify --url=` **整链路**冒烟——本机经代理访问 Pages 抖动，三次死在不同加载阶段（如实记在 2.29 ⑩）。

---

## 二·六、已修并上线：同一家公司的同类优惠并成一张卡（2026-09-27）

**起因是你的反馈**：「同一家公司的优惠没有被合并，就比如 GLM 一下子有 8 条优惠信息」。
复核后确认**不是数据重复，是呈现口径的问题**（逐步记录见 `PROJECT_STATUS.md` 2.30）：

| 现象 | 根因（一句话） |
|---|---|
| 智谱AI 铺了 **12 张卡**，其中 7 条是几乎一样的「GLM-*-Flash 免费模型」 | 折叠键把**落地页**算进去了：`[厂商, url, 优惠文案, 条件, 有效期]`；而智谱的免费模型**一条一个 docs 页**，键全不相同 ⇒ 一条都合不上 |
| 火山引擎 11 张（只合上了 2 条） | 同上：同一份免费额度表被拆成多条，落地页各不相同 |

**改法**：折叠键换成「**同一家公司的同一类优惠 = 一张卡**」——
`(归一厂商, 优惠类型)`，优惠类型是标题去掉厂商名、把型号令牌抹成占位符但**保留品牌词**
（`GLM-4.7-Flash → GLM-*`、`Doubao-语音合成 → Doubao-*`，所以跨厂商永远合不到一块）；
外加一条合并轮，把「同一家公司、同一类免费模型但换了型号品牌」的组并起来
（`GLM-* 免费模型` 与 `CogView-* 免费模型` ⇒ 并；`GLM-* 限时五折` 与 `Batch API 批量调用五折`
品牌词不在打头位置 ⇒ 一律不并）。

**结果**（同一份 `deals.json` 实测，不是估的）：**卡片 62 → 50，覆盖条目仍是 80（一条不丢）**

| 厂商 | 改前 | 改后 |
|---|---|---|
| 智谱AI | 12 张 | **6 张**（7 条免费模型并成 1 张，卡内列 7 个模型名） |
| 火山引擎 | 11 张 | **5 张**（9 条并成 1 张） |
| 百度智能云 | 1 张（17 个模型） | 1 张（不变） |

型号不同 ⇒ 额度往往不同（图像生成 50 张 vs 200 张）。卡片那行文案现在用
「公共前缀只说一遍 + 差异归堆（`（图像生成）50张/200张`）」的写法覆盖全组，
**实测两行装得下才合并**（13px 下实测 56 字），装不下就退回代表条目原文，
**绝不吐一句被裁掉半截的话**；每个型号自己的官方原文留在详情弹层「各型号额度」里。

**门禁（本地同一份产物实跑）**：`verify` **127 项 0 失败** · `verify --compare` **133 项 0 失败** ·
产物自检 0 失败（`折叠无损: 50 张卡片覆盖 80 条优惠`）· `validate` / `validate --strict` / `check:zh` /
`selftest:zh`(9) / `selftest:expiry`(55) 全绿 · `check-mobile-chrome` 零裁切 ·
`check-ci-consistency` 24 项 0 失败。
新增的 §4b 三条断言**当场抓出两个真问题**（认领判据写错、89 字文案确实被 clamp 裁了），
所以它们不是「写完就绿」的装饰。

**上线后又做了一轮独立对抗性复核（2.31）**：一个独立子代理专门去**证伪**这次改动 ——
用破坏性改动验断言是否真会变红、自己写解析器核对产物、构造合并规则反例、真浏览器验收藏/对比/无 JS。
它查出 **9 个真问题**（其中两个是本轮自己引入的：火山那张卡谎称「9 个模型共用额度」、
单条卡的加粗前半句被改没了），逐条修完并再次上线（`f9826fd` + `43eba28`）。详见
`PROJECT_STATUS.md` 2.31；牙齿测试也实跑了（把改动破坏掉，看断言是否变红：4 条断言有牙，
另一条要用「折叠键根本不含厂商」那种版本才验得出）。

**上线（2026-09-27，按你的「推送」）**：推送前先 `fetch` —— 远端没有前进（`origin/master` 仍是
`674c63f`），本分支的基点正是它，于是 **快进**：`git merge --ff-only fix/fold-same-vendor`
（**文件零改动**，只挪 master 指针；主工作区 `git status` 全程干净）→ `git push origin master`
**`674c63f..250ba12`**。两条工作流对 `250ba12` **双双 success**：
[Deploy](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36328609547) ·
[Verify site (gate)](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/36328609490)。

**线上实证**（不拿工作流绿灯当结论）：线上首页 **50 张卡**（改前 62）· 折叠卡
`智谱AI 免费模型×7` / `百度千帆 新用户免费额度×17` / `火山方舟 免费额度×9` ·
卡片覆盖条数 **80**（一条不丢）· 智谱AI 只剩 **6 张**（其中「GLM-5.3-Flash 限时五折」标题不以「智谱」开头，
探测按标题前缀只数到 5 张，属探测口径）· 汇总条「显示 50 条卡片 · 国内 30 · 国外 20」· **JS 错误 0**。
并且**线上整链路冒烟跑通了**：`verify --url=<线上>` **127 项 0 失败**（2.29 那次因本机经代理抖动没跑完，
这次一次跑完）。

> 本轮全程在隔离工作树 `.worktrees/fold-same-vendor`（分支 `fix/fold-same-vendor`）里做，
> **没碰主工作区**（当时有另一个会话在跑）——只有最后快进 master 指针那一步是在主工作区执行的，
> 那一步不改任何文件。

---

## 三、分支地图

```
master = origin/master            777e3b7  ← 已上线（2026-09-27）：A/B/收尾 + G11 + 活动期限 + 手机端修复
                                            + 另一会话的采集/门禁收敛 + 2.29（收藏入口 + 「打开对比」修复）
 ├─ 777e3b7   docs: 上线记录 —— 收藏入口 + 「打开对比」修复已推送并复核线上
 ├─ da3b6e1   data(zh): 补 2 条定时采集新进条目的中文译文（DeepBrain AI / AutoDraw）
 ├─ 11d1551   merge: 并回 origin/master 的 8 次定时数据更新（2026-09-24 ~ 09-27，零冲突）
 ├─ 0c7e5aa   docs: 预演分支复跑门禁 + 澄清合并态 JSON-LD 的哈希变化来源
 ├─ f601f37   merge: 把 fix/favorites-entry-and-compare-open 并进 master 线（冲突仅 2 个文档）
 ├─ 882da8d / cfd443b   另一会话：CI 一致性门禁 / 数据契约 / 生成器与文档口径收敛
 ├─ fa2403d   docs: 上线记录（2.28）+ 口径纠正：push 只触发发布，不触发采集
 ├─ ecbc815   fix(mobile): 修掉两个手机端横向问题 + 门禁补 3 条断言   ← 108 项线上冒烟测试打的就是这份（上线当日的记录；线上复测值待复测，见 P0-2）
 ├─ 0d6b869   merge: 并回 origin/master 的 fix/detail-close
 ├─ 71d020a   merge: 并回 origin/master（重写过的 A/B 线 + 数据 + 活动期限三分类）
 ├─ feat/visual-token-layer      874cd6b  A：token 层 / 暗色 / 对比度 / 语义与无障碍
 │   └─ feat/b-extras            ec05252  + 订阅 feed / 纠错入口 / WebSite / 同页锚点
 │       └─ feat/detail-pages    f1213d5  + 每条优惠一个独立静态页（URL 1 → 81）
 │           └─ feat/row-view    7bfc607  + 紧凑行视图（首屏 13 行 / 手机 5.5 屏）
 │               └─ feat/polish  f55e8a9  + 圆角间距收敛与键盘可达
 ├─ feat/favorites-compare       e0cd50d  ← 收藏/对比（c2310d8 实现 + e0cd50d 修 3px）
 ├─ feat/expiry-window           c02e017  ← 活动期限三分类
 ├─ fix/favorites-entry-and-compare-open  875b723  ← 2.29：修「打开对比」+ 收藏列表入口（**已并入 master**）
 ├─ fix/fold-same-vendor         da35d0d  ← 2.30：同一家公司的同类优惠并成一张卡（智谱 12→6 张，**已并入 master**）
 │                                f9826fd  ← 2.31：修掉对抗性复核查出的 9 个问题（**已并入 master**）
 │                                43eba28  ← 2.31：加粗切点回到原文第一个标点（**已并入 master**）
 └─ trial/fav-cmp-merge         0c7e5aa  ← 2.29 的合并预演分支（**已随快进并入 master**）
backup/pre-ab-merge              fb08832  ← A/B 合并前的 master（保险）
backup/pre-origin-merge-b261add  b261add ← 并上游前的 master（保险）
```

> **2.30 / 2.31 是在隔离工作树里做的**：`.worktrees/fold-same-vendor`（`.gitignore` 已覆盖
> `.worktrees/`，不会进主仓库索引）。当时主工作区有另一个会话在跑采集，所以没有在主工作区里改任何文件。
> 已按你的「推送」**快进并入 `master` 并推上去了**：2.30 = `674c63f..250ba12`，
> 2.31（复核修复）= `6554e26..43eba28`，四次工作流全 success。
> 要复核：`git -C ".worktrees/fold-same-vendor" log --oneline -6`，或
> `cd .worktrees/fold-same-vendor && npm run build && npm run verify`（还在，随时能复跑）。

> **现在本地与上游完全一致**（`git status -sb` 无 ahead/behind）。要回退**已上线的**东西，
> 不要 `reset`（历史已经推出去了），用 `git revert -m 1 <merge>` 或直接 revert 单个提交。
> 两个 backup tag 只对「本地还想回到某个旧状态」有用，且它们都没推送过。
