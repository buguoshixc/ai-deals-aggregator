# v1.8-seo-answer-pages 实施报告（2026-10-26）

> 任务来源：用户 2026-10-26 的增长/SEO 施工单。范围按原文五项执行、全部免费、**不换域名**。
> 本报告记录「做了什么 / 判据在哪 / 证据是什么 / 还差哪一步需要站点主账号」。
> 渠道取证单列：[`seo-growth-v1-channel-evidence.md`](seo-growth-v1-channel-evidence.md)（572 行，第一手探测）。
> 工作树：`D:\OneDrive\Desktop\Code\AI Page`，基线 `master = 84c4bcb`（v3.3 IndexNow 那一轮之后）。

---

## 0. 结论摘要（先看这五条）

| # | 范围 | 状态 | 一句话 |
|---|---|---|---|
| 1 | 别名页信号冲突 | ✅ 已实现 | 三条 `/need/*/` 别名页：去掉 `noindex`、canonical 指向正本、不进 sitemap；`seo.js` 的 `canonical-self` / `alias-canonical` / `sitemap-policy` 与文档 `SCHEMA-v1.7.md` §5.1 同批更新 |
| 2 | GSC / 百度验证 meta | ⚠️ 管道已就绪，token 待站点主填入 | 首页 `<head>` 有注入点、构建期按唯一配置表生成；**未配置就不输出**（绝不生成假 token）。GSC 提交 sitemap 与 10 个 URL 请求编入索引需要账号，操作清单已写好 |
| 3 | 五个意图页的 title / description | ✅ 已实现 | `/free-api/`、`/need/free-model/`、`/need/edu-identity/`、`/plans/api/`、`/plans/coding/` 全部改为查询句式（含「免费 / 价格 / 2026」+ 真实厂商名） |
| 4 | 两个答案页 | ✅ 已实现 | `/free-api/` 与 `/plans/api/` 各加「各平台门槛速查」表（实名 / 限流 / 商用 / 地区，全部数据现算）+「最后核对」+ 数据修正 issue 入口 |
| 5 | 数据集许可与包装 | ✅ 已实现 | 代码 MIT / 数据 CC BY 4.0 分开授权；`/docs/data/` 给数据集清单（schema / 记录数 / 数据日期现算）、引用格式、字段口径 |

渠道结论（详见取证报告，证据等级逐条标注）：
**Google「开但未启用」、百度「开、可抓、但在项目路径上不可验证/未收录」**。
站点本身对两个爬虫都不设限（三种 UA 抓 robots / sitemap / 首页全部 200 且 sha256 一致；主机根
`robots.txt` = 404 ⇒ 按 Google 规则无抓取限制）；0 流量是**收录问题，不是封锁问题**。

---

## 1. 基线（任务给定，作为验收口径固定下来）

- 近 7 天：699 PV / 425 会话；引用方 = 站内自引 340 · 直接 200 · 必应 140 · 其余合计 ≤19；Google、百度各 0。
- 必应：141 点击 / 1.7K 展示 / 8.09% CTR；首页占 55% PV。
- `/need/student-only/` 32 · `/need/free-model/` 24 · `/need/edu-identity/` 23 · `/plans/coding/` 19；
  80 个 `/deal/<id>/` 一周内一个都没进前五（门槛 19 PV/周）—— 详情页是数据，不是获客。
- 画像：中国 53% / Windows 59% / Edge 43% / 移动 17%；受众 = 中国 CS 学生 + 独立开发者。
- 已知滞后：必应位置数据滞后 4–8 周 ⇒ 第 3 周只判展示量，第 6 周才判位置。

---

## 2. 逐项改动

### 2.1 别名页：从「noindex + 自指 canonical」改为「canonical 收口」

**问题**：`dist/need/student-only/index.html:8-9` 同时有 `robots: noindex,follow` 与自指 canonical。
两句话自相矛盾（noindex 赢，canonical 白写），且 GitHub Pages 发不出 301 —— canonical 是这台 host
上**唯一**能把旧地址权重归并到正本的工具。

**处置**（二选一里选「canonical 指向正本并去掉 noindex」）：

| 层 | 改动 |
|---|---|
| 配置 | `scripts/data/landing-aliases.json` 的 `_note` / `_rule` 重写（六条机制契约保留，索引策略三条替换） |
| 计划 | `scripts/lib/landing.js`：别名页描述符 `indexable: true` + `canonicalRoute: alias.target`；分类页「是否已有相同条目集合」的判据排除 canonical 别名 |
| 规则 | `scripts/lib/seo.js`：`canonical-self` 按 `canonicalRoute` 判期望值；`alias-indexable` **退役**，新增 `alias-canonical`（描述符必须指向正本）；`sitemap-policy` 改为「独立可索引（canonical 自指）页必须进 sitemap、canonical 收口页不得进」；`title-unique` / `desc-unique` / `duplicate-item-set` 只在独立页面之间判 |
| 渲染 | `scripts/tools/build-local.js`：robots 一律 `index, follow, max-image-preview:large`；canonical / JSON-LD `url` 用 `canonicalRoute` 拼；sitemap 生成与条数断言都按「独立可索引」过滤；产物自检按 `canonicalRoute` 核对 canonical |
| 独立门禁 | `scripts/tools/seo-verify.js`：从产物现场读 robots + canonical 自指关系，重算 sitemap 成员；「noindex 页面 0 条」 |
| 浏览器套件 | `scripts/tools/verify-site.js`：§18 别名样本从「robots 是 noindex」改为「canonical 指向正本 + robots 不含 noindex + sitemap 无它」；`/need/*/` 逐页检查按别名表判 canonical 期望值 |
| 文档 | `docs/SCHEMA-v1.7.md` §2 / §4 / §5 / §5.1 同步（含「为什么改判」与判据清单） |
| 自测 | `scripts/tools/seo-selftest.js` 夹具与真实数据断言同批更新（101 项全过） |

**产物验证**（本地 build）：
`/need/student-only/`、`/need/free-api/`、`/need/dev-credits/` 的 canonical 分别指向
`/student/`、`/free-api/`、`/developer/`；robots 为 `index, follow, max-image-preview:large`；
sitemap 183 条里不含它们；SEO 门禁 `可索引 185 · noindex 0 · canonical 别名 3`。
别名页**不再有**任何可见说明文字（沿用 `secondary-page-residue-v1` 的零文案契约）。

### 2.2 GSC / 百度验证 meta：注入机制（token 待填）

- 首页 `index.html` 的 `<head>` 增加注入块 `<!-- SEO:VERIFICATION:START/END -->`（**在 PUBLIC_FILES 之外，不动 PUBLIC_FILES**）。
- 唯一实现 `scripts/lib/site-verification.js`：
  - token 唯一出处 `scripts/data/site-verification.json`（`google.token` / `baidu.token`，默认 `null`）；
  - 构建期把注入块替换成实际 `<meta name="…-site-verification" content="…">`；
  - 未配置 ⇒ **整块不输出**，绝不生成占位/假 token；配置了 ⇒ 首页恰好出现一次（构建期自检双向断言）；
  - token 只允许 `[A-Za-z0-9._-]`，防止把引号/尖括号带进 HTML。
- 为什么这样做：两个 token 只能由站点主账号后台生成（用户 2026-10-26 在会话中确认「先做注入管道 + 操作清单」）。
- 操作清单（GSC URL 前缀属性 → HTML 标记 → 构建发布 → 验证 → 提交 sitemap → 10 个 URL 请求编入索引；
  百度站点管理 → HTML 标签 → sitemap 提交 → 抓取诊断；含百度**域名级验证**的风险与兜底）：
  [`docs/marketing/seo-verification-runbook.md`](../docs/marketing/seo-verification-runbook.md)。

### 2.3 五个意图页的查询句式标题

| 页面 | `<title>`（构建产物实测） |
|---|---|
| `/free-api/` | 免费 API 有哪些？2026 百度千帆、智谱、阿里云百炼免费额度对比 · AI 优惠聚合器 |
| `/need/free-model/` | 免费大模型 API 有哪些？2026 智谱 GLM-4.7-Flash、硅基流动免费模型清单 · AI 优惠聚合器 |
| `/need/edu-identity/` | 学生与教育邮箱免费 AI 怎么领？2026 GitHub、Notion、Figma 教育版对比 · AI 优惠聚合器 |
| `/plans/api/` | API 价格对比 2026：DeepSeek、智谱、阿里云百炼每百万 Token 单价 · AI 优惠聚合器 |
| `/plans/coding/` | AI Coding 套餐价格 2026：Claude Pro、GitHub Copilot、Cursor 月费对比 · AI 优惠聚合器 |

实现方式：新增 `pageTitle` 字段（`<title>` 专用），H1 / 面包屑 / JSON-LD 仍用短名 `heading`——
两种用途不互相顶替；description 同步改为查询句式（含年份、免费/价格与厂商名）。
所有标题长度 ≤ 80 字符、description 全局唯一（SEO 门禁 `title-length` / `title-unique` / `desc-unique` 实测全过）。

### 2.4 两个答案页

**判据层（新增，唯一实现）**：`scripts/lib/threshold-summary.js`
- 实名：deals 的三态字段聚合（需要 n 条 / 不需要 m 条 / 尚未确认 k 条；unknown 不并进「不需要」）；
- 限流：api-plans 的 `limits`（rpm/tpm/rpd/tpd/concurrency）与 `restrictions.rate_limit`；
- 商用 / 公平使用：api-plans 的 `fair_use` / `region_restriction`，**「不可商用」无结构化字段 ⇒ 明写「数据未收录」**；
- 地区：deals `chinaUsable` / `regionRestriction` 与 api-plans `region`；
- 免费额度：api-plans `freeTier`（stability / amount / models）。

**`/free-api/`（答案页 1，接「免费 API / 免费额度」查询组）**
- 首屏新增「各平台门槛速查」表：12 个平台 × 实名 / 限流 / 商用 / 地区；
- 表尾「最后核对 2026-10-17」（= 数据 `updatedAt`，不写构建时间）+ 数据修正 issue 入口；
- 逐条明细表（45 行、`data-item` 行标记）保持不变 ⇒ `itemlist-arity` 的「声明 45 = 行 45」仍成立。

**`/plans/api/`（答案页 2，接「API 价格」查询组）**
- 价格表之前新增「各平台门槛速查」表：21 个平台 × 免费额度 / 实名 / 限流 / 商用 / 地区 / 最近核对；
- 页头 meta 与表题注都写「最后核对 2026-10-08」（api-plans 的 `lastSeen` 最大值）；
- 数据修正 issue 入口；价格表（108 行 / 11 列）与 `assertPageHonesty()` 逐格对账不变
  （表头对账已锚定 `.ptable`，不会被汇总表的 8 列误伤）。

**数字出处**：两页的每个数字都由数据文件在构建期现算（无手写计数）；`/free-api/` 的 summary
新增「需实名认证」行，由 `seo.js` 的 `recomputeSummary()` 独立重算对账（`summary-source`）。
`thin-content` 下限一个字没改（内容只增不减）。

### 2.5 数据集许可与包装

- **代码 MIT**：`LICENSE`（含「适用范围」说明：`scripts/**`、模板、构建/测试脚本）。
- **数据 CC BY 4.0**：`LICENSE-DATA`（覆盖 `deals.json` / `plans.json` / `api-plans.json` /
  `models.json` / 三份变化日志 / 两个关系文件；署名 = 来源 + 数据日期 + 改动说明；
  厂商文案/商标不属于数据许可）。
- **`/docs/data/` 页**（新 `data-docs` kind，revive 自 t4 下架的页面族，但**不恢复数据下载面**）：
  - 数据集清单：4 份数据集（schemaVersion / 记录数 / 数据日期）**构建期从真实文件读**；
  - 三份变化日志：起算日 + 事件数；
  - 引用格式：`AI 优惠聚合器（数据日期 2026-10-17），https://…/docs/data/`（站点地址来自 `SITE_URL`）；
  - 字段口径：null / unknown / 0 三态、免费额度 stability、单位不换算、不可商用未收录；
  - JSON-LD：BreadcrumbList + 每份数据集一个 `Dataset`（license / dateModified / distribution）；
  - 站内入口：页脚「按厂商 / 分类浏览」行末新增「数据与引用」（`ROUTE_HREFS` 单源，深度前缀自动解析）；
  - 产物里**仍然没有数据文件**（`lib/published-assets.js` 的逐路径登记制不变，构建期产物资产门禁实测 245 文件无未登记项）。

---

## 3. 门禁与证据（本地实测）

| 门禁 | 结果 |
|---|---|
| `npm run build`（含产物自检 100+ 条） | ✅ 通过；sitemap **183** 条；页面 **186**；SEO 门禁 27 码 × 186 页全过（可索引 186 · noindex 0 · canonical 别名 3） |
| `npm run gate:build`（L1+L2+L3，40 个脚本） | ✅ 40/40，49.1s（含 `selftest:seo` / `selftest:analytics` / `check:feed:reproducible` / `verify:seo`） |
| `npm run selftest:seo` | ✅ 101 项 0 失败（新增 `alias-canonical` 牙；`alias-indexable` 同批退役） |
| `npm run verify:seo`（独立解析产物） | ✅ 18 项 0 失败（sitemap 成员 = 独立可索引页面集合；noindex 0 条） |
| `npm run verify`（真浏览器套件，本地） | ✅ 929 项 0 失败（修复 3 条按旧别名策略写的断言后复跑） |
| `npm run report:seo` | ✅ 报告口径更新（noindex → 「canonical 收口的别名」） |

产物级事实（构建日志/产物回读）：
- 三个别名页：可抓取、canonical 指向正本、sitemap 0 条、robots 无 noindex；
- `/free-api/`：门槛速查表 12 行、明细表 45 行、summary 含「需实名认证」并由独立重算对账；
- `/plans/api/`：门槛速查表 21 行、价格表 108 行 × 11 列；
- `/docs/data/`：canonical 自指、进 sitemap、JSON-LD [BreadcrumbList + Dataset × 4]；
- 站点验证注入块：0/2 已配置（token 均为 null），首页 head 回读对账通过。

---

## 4. 发布与线上验证

- 本轮改动提交并推送到 `master` 后，`deploy.yml` 的 `prepublish`（与 PR 同一个 gate）→ `build` → `deploy`
  会重新跑完整门禁并发布；发布后用 `npm run verify -- --url=https://buguoshixc.github.io/ai-deals-aggregator/`
  做线上冒烟（见提交记录与 CI run 链接）。
- 线上变更可核对点：`/need/free-api/` 的 canonical 应指向 `/free-api/`（`curl -s https://…/need/free-api/ | grep canonical`）；
  `sitemap.xml` 应为 183 条；`/docs/data/` 应 200。

> 本报告写作时（2026-10-26 16:20）本地门禁全绿；**线上生效以推送后的 Deploy run 为准**。

---

## 5. 需要站点主账号完成的事（我们无权操作）

1. **GSC**：生成 `google-site-verification` token → 填 `scripts/data/site-verification.json` 的
   `google.token` → `npm run build` → 发布 → 验证 → 提交 sitemap → 对 10 个重点 URL 请求编入索引。
2. **百度搜索资源平台**：生成 `baidu-site-verification` token → 填 `baidu.token` → 构建发布 → 验证 →
   提交 sitemap → 抓取诊断。⚠️ 百度按域名验证；若回读的是域名根而不是项目路径，按 runbook §2.1 的
   风险处置（HTML 文件只能放域名根的用户站仓库，**不在本仓库范围**）。
3. 两平台验证通过后，按 `docs/marketing/seo-verification-runbook.md` §3 的表格每 3 / 6 周记录一次读数。

---

## 6. 已知缺口与风险（如实登记）

1. **「不可商用」没有结构化数据**：deals / api-plans 都没有这个字段。答案页如实写「数据未收录」并给
   报错入口；没有把它写成「允许商用」。要让这一列真正可用，需要采集侧新增字段（本轮不改采集链路）。
2. **百度路径级验证可行性未证实**：百度站点管理按域名收，HTML 标签验证按站点首页；项目路径
   （`buguoshixc.github.io/ai-deals-aggregator/`）能否作为独立站点验证，没有官方明文。兜底是站点主
   另建 `buguoshixc.github.io` 用户站仓库（或换自定义域名 —— 用户已明确不换）。
3. **Google 收录无法在本环境证实**：本环境 Google 全域 DNS/TCP 不可达，无法查 `site:`；只证实了
   爬虫可达性。GSC 验证后以「覆盖率 / 网页」为准。
4. **别名改判的生效时间**：Google/Bing 需要重新抓取才会更新 canonical 关系（数周量级）；
   第 3/6 周观测时先看「已发现 / 已编入」与 sitemap 读取状态，不要因为别名页还在结果里就回滚。
5. **浏览器套件只在本地跑过**：本轮 `npm run verify` 929 项全过；CI 的 L4 会在 Deploy 前的 gate 里再跑一遍，
   以 CI 为准。
6. **标题/描述改了，外链锚文本没有改**：站内指向这五页的锚文本仍是旧短名（如「免费 API」）。
   这是刻意的（锚文本与页面标题不必逐字相同）；若第 6 周两个答案页没有接住查询，再考虑统一锚文本。

---

## 7. 观测判据（与 runbook §3 同源，写死避免事后找理由）

| 时间点 | 只看什么 | 通过线 | 不通过时 |
|---|---|---|---|
| 第 3 周（≈ 2026-11-16） | 展示量（GSC + 必应） | 必应 7 天展示 ≥ 基线 3 倍；GSC 展示 > 0 | 先查收录状态，不改内容 |
| 第 6 周（≈ 2026-12-07） | 平均位置 | `/free-api/`、`/plans/api/` 各有 ≥1 查询稳定前 20 | 只调标题/描述/内链锚文本 |
| 第 8 周 | 查询词 | 两个答案页各接住一组查询（≥2 个不同查询有展示） | 复盘首屏答案与查询意图是否对齐 |

---

## 8. 本轮改动文件清单

**新增**
- `LICENSE` · `LICENSE-DATA`
- `scripts/lib/site-verification.js` · `scripts/data/site-verification.json`
- `scripts/lib/threshold-summary.js`
- `scripts/lib/data-docs-page.js`
- `docs/marketing/seo-verification-runbook.md`
- `research/seo-growth-v1-channel-evidence.md`（渠道取证，572 行）
- `research/seo-growth-v1-report.md`（本文件）

**修改**
- `scripts/lib/seo.js`（canonical-self / alias-canonical / sitemap-policy / 唯一性范围 / 摘要重算新增「需实名认证」）
- `scripts/lib/landing.js`（别名计划 canonicalRoute；摘要新增「需实名认证」）
- `scripts/lib/page-kinds.js`（alias 声明注释；新增 `data-docs` kind 与固定路由）
- `scripts/lib/landing-aliases.json`（`_note` / `_rule` 重写）
- `scripts/lib/audience.js`（free-api / free-model / edu-identity 的 pageTitle + description + thresholdSummary 开关）
- `scripts/lib/plans-page.js` / `scripts/lib/api-plans-page.js`（查询句式标题；API 页门槛速查表；诚实性断言锚定 `.ptable`）
- `scripts/lib/analytics-routes.js`（/docs/data/ 统计规则）
- `scripts/tools/build-local.js`（别名 canonical/robots/sitemap；验证 meta 注入与自检；答案页表；/docs/data/ 渲染与 sitemap；页脚路由；REPO_URL 从 index.html 现读）
- `scripts/tools/seo-verify.js` · `scripts/tools/seo-selftest.js` · `scripts/tools/seo-report.js` · `scripts/tools/verify-site.js`
- `index.html`（head 注入点 + 页脚「数据与引用」入口）
- `docs/SCHEMA-v1.7.md`（§2 / §4 / §5 / §5.1）
- `README.md`（许可、数据面口径、v1.8 摘要）

**未做（用户明确排除）**：换域名、新页面类型、v3.x 功能、`/deal/` 条目页、采集链路、feed 体系、
小红书/牛客投放、「优惠码」内容、为外链做长期投入。
