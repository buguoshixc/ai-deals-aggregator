# AI 优惠聚合器

一个零构建的静态站点，聚合**国内外 AI 大模型的真实优惠与福利**：新用户免费额度、免费模型、
学生 / 教师 / 非营利折扣、限时促销。数据每日自动采集两次，经校验后发布到 GitHub Pages。

- 线上地址：https://buguoshixc.github.io/ai-deals-aggregator/
- 数据文件：`deals.json`（v2 契约，见下文）

## 设计原则

1. **只收录真实优惠**。定价表、"这是付费产品"这类信息不算优惠，只会以 `type: "tool"` 进入"全部工具"页，
   默认视图只展示 `type: "deal"` 的优惠。
2. **落地页指向官方**。聚合站（Layer3Labs 等）作为 `sourceUrl` 署名，卡片主链接给到厂商官方页。
3. **零产出的采集器不上线**。注册表里只保留实测有产出的来源，避免"代码在跑但没数据"。
4. **坏数据不发布**。`scripts/validate.js` 是部署门禁，校验不过就不部署。
5. **不抓登录态**。只抓公开页；需要登录才可见的内容不进自动采集链路。
6. **不编造、不夸大**。看不到升级路径就不写 `priceLine`，没有可信标签就不写 `features`；
   卡片上只有一条「数据更新」日期，不给自己盖章说"核对过"。宁可信息少一行，也不给不可信的内容。
7. **发布产物必须有静态正文**。内容预渲染进 HTML，不依赖 JS 才能被读到；且卡片模板只维护一份
   （见「预渲染与 SEO/GEO」）。
8. **不卖排序**。不收录付费推广位；如将来引入推广，必须带 `rel="sponsored"` 与显式标注，
   且排序、价格说明与推荐理由永不出售。

## 快速开始

```bash
npm ci                  # 安装依赖（axios + cheerio）
npm run collect:dry     # 只采集并打印报告，不写盘
npm run collect         # 全量采集并写入 deals.json
npm test                # 数据 + 前端静态校验（零依赖，可直接跑）
npm run test:strict     # 额外校验内容质量指标
npm run build           # 校验 → 组装并预渲染 dist/ → 产物自检
npm run verify          # 真浏览器验收（密度/裁切/hover/筛选/弹层/移动端）
npm run verify:shots    # 同上，并把截图写到 mockups/.preview/
npm run check:zh        # 译文漂移门禁：对不上 id / 原文已变 / 待译 逐条列出，非零退出即有要办的事
npm run serve                          # 本地预览源码目录 http://127.0.0.1:8080
node scripts/serve.js --dir=dist       # 预览发布产物（预渲染后的 index.html）
```

跑一遍 CI 会跑的全部静态门禁（`npm run verify` 需要浏览器，单列）。
下面刻意写成**一行**：`&&` 在 bash 与 PowerShell 7 里都能用，而换行续行符两边不一样
（bash 是 `\`、PowerShell 是反引号），写成多行会让其中一边复制过去跑不起来。

```bash
npm run test:strict && npm run check:reproducible && npm run check:history && npm run migrate:audience:verify && npm run check:zh && npm run selftest:zh && npm run selftest:expiry && npm run selftest:text && npm run selftest:health && npm run selftest:provenance && npm run selftest:history && npm run selftest:audience && npm run selftest:app-token && npm run build && npm run check:ci
```

> `migrate:audience:verify` **不需要参数**：它默认跑 `scripts/data/fixtures/` 下那对合成夹具
> （9 条记录逐分支覆盖）。要比对一次真实的 `migrate.js --audience`，成对传
> `--before=<旧 deal.json> --after=<新 deal.json>`。

> 本地看效果请一律用 **`npm run build` + `node scripts/serve.js --dir=dist`**：
> 源码目录里的 `index.html` 还没预渲染，`logos.css` 也尚未生成，直接开是看不到 logo 的。

调规则用的报告：

```bash
npm run report:tier                    # 分档分布 + 每张卡命中的判据 + 判据读到的原文
npm run report:tier -- --tier=2        # 只看某一档
npm run report:vendor                  # 厂商归一并计（多少条脏 vendor 归到了同一家）
npm run report:tier -- --all           # 连工具条目一起看
```

抓 JS 渲染的公开页（可选能力，需要本机装有 Edge 或 Chrome）：

```bash
npm run collect:headless:dry   # 静态来源 + 无头来源，dry-run
npm run collect:headless       # 静态来源 + 无头来源，写盘
npm run collect:headless:list  # 查看含无头来源在内的注册表
```

常用排查命令：

```bash
node scripts/collect.js --list                       # 列出已注册采集器
node scripts/collect.js --only=cn_qianfan --dry-run  # 只跑某个来源
node scripts/tools/inspect-source.js <url> --rows    # 查看页面表格结构（写采集器用）
node scripts/tools/find-offers.js <url>              # 探测页面是否含优惠内容
node scripts/tools/term-count.js <url> 免费 额度      # 判断页面是否 JS 空壳
node scripts/tools/term-count.js <url> 免费 额度 --render  # 渲染后再探测（SPA 页面）
node scripts/tools/render-source.js <url> --rows     # 渲染公开页并看表格/优惠信号
node scripts/tools/render-source.js <url> --diag --wait=文案1|文案2   # 渲染诊断（零产出时用）
```

## 数据契约（deals.json v2）

```jsonc
{
  "schemaVersion": 2,
  "updatedAt": "2026-09-21T20:00:00+08:00",
  "count": 128,
  "deals": [
    {
      "id": "a1b2c3d4e5f6",       // sha1(lower(vendor)|lower(title)|lower(url)) 前 12 位，稳定去重键
      "title": "…",
      "vendor": "百度智能云",
      "url": "https://…",          // 必须是官方优惠/定价页
      "source": "百度千帆",         // 采集来源
      "sourceUrl": "https://…",    // 聚合站出处（仅署名，可为 null）
      "region": "cn",              // cn | global —— 由来源决定，不猜
      "type": "deal",              // deal | tool
      "discountInfo": "…",         // type=deal 时必填
      "pricingModel": "free",      // free | freemium | paid | trial | credits | null
      "priceLine": "免费 → $20/月 Pro",  // 卡片价格阶梯；无可靠来源时为 null
      "features": ["15 元代金券", "需实名认证"],  // 卡片特性标签，≤3 个、每个 ≤20 字
      "category": "API服务",       // 固定 12 类枚举
      "description": "…",
      "eligibility": "新用户（需实名认证）",
      "validity": "自开通起 3 个月",  // 有效期说明（无绝对截止日期时用）
      "expiresAt": "2026-12-31",    // 绝对截止日期，可为 null
      "firstSeen": "2026-09-20",
      "lastSeen": "2026-09-21",
      "verified": true,             // 人工核验过
      "verifiedAt": "2026-09-22",   // 核验日期；仅 verified=true 时可填
      "evidence": [                 // v1.3 可选：有界官方原文片段（≤3 条 × ≤200 字，只人工写）
        { "field": "discountInfo", "quote": "…官方原话…",
          "sourceUrl": "https://…官方页…", "capturedAt": "2026-09-22" }
      ],
      "zh": {                       // 中文译文（可选）。只增加字段，绝不覆盖英文原文
        "discountInfo": "…",
        "description": "…"
      }
    }
  ]
}
```

### 卡片三字段的填写纪律

`priceLine` / `features` / `verifiedAt` 是给卡片信息层级用的，**只在有把握时填**：

| 字段 | 规则 |
|---|---|
| `features` | 只取该条 `discountInfo` / `validity` 里已写明的事实，≤3 个、每个 ≤20 字。**不从 `description` 自动切分或生成**——没有可信来源就留空，卡片自动回退展示 `discountInfo`。 |
| `priceLine` | 只有官方页明确给出「免费档 → 付费档」时才填。看不出升级路径就留 `null`，卡片不渲染该行，**不编造价格阶梯**。 |
| `verifiedAt` | 仅人工逐条回访官方页的条目可填（当前 **32 条**策展数据：`curated_cn` 18 + `curated_global` 14，`node scripts/validate.js` 实测输出「策展数据 32 条」）。自动采集条目一律为 `null`。**这两个字段只留在数据里**（`validate.js` 仍在守「`verified=true` 必须带日期」这条断言），页面上不再渲染核验标签——原因见下文「诚实性约束」。 |
| `evidence` | v1.3：官方原文片段，**≤3 条 × ≤200 字**，只能用人工写入 `curated_*.json`（或 `audience-overrides.json` 的 `evidenceQuotes`）。超长**拒收**、出处不得是聚合站、必须绑定某个 `field`。全库还有 12000 字与「≤ deals.json 字节 5%」两道预算。契约见 [`docs/SCHEMA-v1.3.md`](docs/SCHEMA-v1.3.md)。 |
| `history` | v1.4：**构建期派生字段，只进 `dist/deals.json`**。源数据里不能有它（`validate` 白名单与 `check-reproducible` 各拦一道）。真值是 `scripts/data/deal-history.json`（一次性基线 + 追加事件，写入点只有 `scripts/collect.js`）。契约见 [`docs/SCHEMA-v1.4.md`](docs/SCHEMA-v1.4.md)。 |

新增策展条目并补齐这三个字段的流程：

```bash
# 1) 在 scripts/data/curated_*.json 加条目（含 features / priceLine / verifiedAt）
# 2) 校验策展文件本身
node scripts/validate.js
# 3) 跑一次采集，把策展数据合并进 deals.json（预渲染读的是 deals.json）
npm run collect
# 4) 重新构建产物
npm run build
```

> `verifiedAt` 需要填「本次回访官方页的日期」。`scripts/data/backfill-cards.js` 保留了本次
> 补齐所用的 title → 字段映射，可作为新增条目时的写法参考（重复执行会覆盖日期，勿盲跑）。

分类枚举：对话模型 / 图像绘画 / 视频 / 音频语音 / 编程开发 / 办公效率 / API服务 / 智能体 /
搜索研究 / 设计创意 / 教育学习 / 其他。

## 目录结构

```
index.html                    前端（原生 HTML/CSS/JS，无构建；含预渲染标记与 RENDER-CORE 纯函数区）
deals.json                    线上数据
robots.txt                    放行搜索引擎与 AI 爬虫（GEO）
assets/logos/
  manifest.json               厂商 logo 登记表（名称/来源/取图方式/质量）
  *.png *.svg                 从厂商官网下载的原始文件（见 assets/logos/README.md）
scripts/
  collect.js                  采集编排：注册表 → 采集 → 归一 → 去重 → 门槛 → 写盘 → 报告（写盘门槛见文件头注释）
  validate.js                 数据与前端校验（零依赖，CI 门禁）
  migrate.js                  v1 → v2 迁移与清洗
  serve.js                    零依赖本地预览服务器（--dir=dist 可预览产物）
  lib/
    schema.js                 v2 契约：makeDeal / validateDeal / 垃圾与优惠信号判定
    store.js                  读写、合并、过期修剪、发布前断言（采集量骤降只记 degraded 告警，不拦写盘）
    dedup.js                  标题归一 + 别名表 + 信息量择优合并
    audience.js               v1.1 六字段的**单一词汇源**：枚举 / 三态 / 分类判据 / 页面措辞
                               + v1.2 的 NEED_PAGES / NEED_PREDICATES / needsOf（按需求找优惠）
    audience-audit.js         手写数据「声明了却归一后消失」的对账（拼错枚举不会静默变没写）
    audience-overrides.js     第二个人工来源（声明式补充）的加载与应用；contrib 只增不减
    migrate-audience.js       一次性补 provenance 的纯函数（只补出处，**不猜值**）
    health.js                 采集来源健康状态：状态规则 / 摘要 / 绝对时间格式
    classify.js               地区判定、有效期抽取
    official.js               聚合站条目 → 官方页解析
    http.js                   UA / 超时 / 重试 / 并发限流 / robots.txt
    browser.js                无头浏览器渲染（可选能力，仅 --headless 时加载）
    render-core.js            从 index.html 抽取 RENDER-CORE 并在无 DOM 沙箱求值
    zh.js                     中文译文覆盖层：英文散文判定 / 原文指纹校验 / 贴到条目上
    logos.js                  logo 资产装配：manifest → dist/logos/ + dist/logos.css
    og-image.js               零依赖 OG 分享图生成（手写 PNG 编码 + 点阵字模）
    report.js                 采集报告表格
      curated.js                人工策展数据加载
    provenance.js             v1.3 信息来源：有界官方引文的归一/合并/预算 + 采集事实派生（心跳 join）
  collectors/
    index.js                  注册表
    cn_docs.js                国内：百度千帆免费额度表 / 阿里云百炼 / 智谱免费模型
    global_deals.js           国外真实优惠：Layer3Labs 折扣表
    global_directories.js     国外目录站：aitools.fyi / Futurepedia / Futuretools
    headless.js               无头浏览器来源：智谱活动页 / 火山方舟免费额度与活动
  data/
    curated_cn.json           国内人工策展（可核验的官方优惠）
    curated_global.json       国外人工策展
    audience-overrides.json   v1.1 **第二个人工来源**：采集侧条目的六字段声明式补充（每条带引文）
    source-health.json        采集来源的跨运行状态（每轮 collect 写入，与 deals.json 同批提交）
    fixtures/                 migrate-audience-verify 的合成夹具（before/after 成对，逐分支覆盖）
    translations_zh.json      国外英文文案的人工中文译文（键为 deal.id，含原文指纹 src）
    backfill-cards.js         一次性补齐卡片字段的映射记录（新增条目时作写法参考）
    aliases.json              产品别名表（跨源去重）
    official_urls.json        聚合站条目 → 官方页映射
  tools/                      采集器调试工具与发布产物组装
    build-local.js            校验 → 组装 dist/ → 预渲染 → 自检（本地与 CI 同一路径）
    verify-site.js            真浏览器验收：密度/裁切/hover/筛选/弹层/译文折叠/移动端/分类页/按需求页/状态页（dev，需 playwright-core）
    check-mobile-chrome.js    390px 下逐控件量裁切/越出视口/横向溢出（含 nav.needs 入口行）
    check-reproducible.js     可重建性门禁：文件里不许有「没有任何源」的值（五个判据，CI）
    history-verify.js         v1.4 历史门禁：基线 + 事件重放必须等于当前 deals.json（链 / 生命周期 / 上限，CI）
    history-baseline.js       一次性历史基线（已存在或已有事件时拒绝重跑）
    history-audit.js          历史 × git 版本交叉校验（离线，**不进 CI**：浅克隆与历史重写都不适合当闸门）
    history-selftest.js       v1.4 历史自测（噪音抑制 / 锚点 / 链 / 不误报「消失」/ 上限，CI）
    audience-selftest.js      受众字段全部红线守卫（三态 / 仲裁 / 措辞同源 / v1.2 需求注册表，CI）
    provenance-selftest.js    v1.3 信息来源自测（引文上限与预算 / 四种缺失状态 / 渲染措辞，CI）
    audience-report.js        覆盖率报告：已知 / unknown / 缺席三栏分列，逐条可审计
    audience-overrides-extract.js  从 DATA-BACKFILL.md 那张表生成 overrides（与数据对不上就拒绝写）
    migrate-audience-verify.js     `migrate.js --audience` 的验收比对（默认跑合成夹具，CI）
    check-ci-consistency.js   看门狗：门禁步骤序列 / 冻结断言名单 / --expect-checks 互相独立（CI）
    zh-todo.js                中文翻译待办与脚手架（--json / --scaffold 盖原文指纹 / --orphans）
    zh-selftest.js            中文译文门禁演练（自恢复，验证坏译文真的会被拦下）
    tier-report.js            分档与厂商归一报告（调规则时先看它）
    fetch-logos.js            从厂商官网抓取品牌图标，补进 assets/logos/
```

契约文档在 `docs/SCHEMA-v1.1.md`（六字段的语义、可信度档位、可重建判据、五条既有约定）、
`docs/SCHEMA-v1.3.md`（信息来源：证据层 / 派生采集事实 / 引文上限 / 渲染与状态词）
与 `docs/SCHEMA-v1.4.md`（优惠历史：四方案决策 / 存储契约 / 什么算重要变化 / ended 的两种含义 / 上限）。

## 采集来源策略

| 来源 | 类型 | 说明 |
|---|---|---|
| 百度千帆 | 国内 | 官方文档「新用户免费额度」表：服务名称 / 赠送 Tokens / 有效期 |
| 阿里云百炼 | 国内 | 官方帮助文档「新人免费额度」 |
| 智谱AI | 国内 | 官方文档标注的免费大模型（GLM-4.7-Flash 等） |
| 智谱AI活动页 | 国内（无头） | 官方价格页营销位：新用户 2000 万 Tokens、邀请返 Tokens、限时五折、缓存限时免费 |
| 火山方舟 | 国内（无头） | 官方产品页「免费额度」表（文本/图像/语音/向量/联网插件）+ 最新活动 |
| Layer3Labs | 国外 | 折扣表，每行自带官方链接 |
| aitools.fyi / Futurepedia / Futuretools | 国外 | 工具目录，主要产出 `type: "tool"` |

**已实测淘汰**（零产出或纯垃圾）：Zapier、BitDegree、AitoolsDirectory、AppSumo（客户端渲染，0 产出）、
火山引擎文档（旧路径 JS 空壳）、各家控制台（需登录）、
DeepSeek 官网与 API 文档（用无头浏览器渲染后依然 0 条优惠信号——定价页只有"赠送余额"这一计费说明，
不是可领取的公开额度，故不注册采集器）。

抓不到但真实存在的优惠，走 `scripts/data/curated_*.json` 人工策展——**内容准确性优先于自动化率**。

## 无头浏览器采集（JS 渲染的公开页）

国内厂商的活动页/产品页多是 SPA，静态 `fetch` 只能拿到几百字节空壳（`cheerio` 解析出 0 条），
这类来源此前只能靠人工策展。`scripts/lib/browser.js` 用浏览器内核把页面渲染完再取 DOM，
把它们重新纳入自动采集。

设计约束：

1. **只抓公开页，不做登录态抓取**：不加载用户 profile、不注入 cookie、不传凭据。
2. **默认不加载**：只有 `collect.js --headless` 才 `require` 无头来源，所以 `validate.js` 依旧是
   零依赖，不带 `--headless` 的调用完全不依赖 `playwright-core`（CI 的采集步骤显式带 `--headless`）。
3. **规则驱动、失败安全**：每条产出都对应官网上的一句原文正则，页面改版导致正则不命中时产出为 0，
   **绝不猜测、不拼接**。新增一条优惠 = 在 `collectors/headless.js` 加一条带原文正则的规则。
4. **宁可漏采也不发坏数据**：免费额度表结构不匹配（分项对不上）时整行跳过。
5. **等内容，不等网络空闲**：`goto` 只用 `domcontentloaded`，之后显式等待目标文案出现
   （`--wait` / `waitForText`）。`networkidle` 在有长轮询/埋点请求的 SPA 上永远不触发，
   超时后重载页面反而会抓到空壳（CI 上实测过：同一个来源本地 5 条、CI 0 条）。
6. **装不上内核也不拖垮主链路**：CI 里内核安装步骤是 `continue-on-error`，失败时无头来源各自报错、
   产出 0 条，静态来源照常采集，报告与运行 Summary 里都能看到。

浏览器内核优先用本机已装的 Edge / Chrome；CI（Ubuntu）上由工作流安装 playwright 自带 chromium。
出口 IP 已实测可达（`bigmodel.cn` 与 `volcengine.com` 均返回 HTTP 200，无风控特征）。

## 预渲染与 SEO/GEO

页面仍是**单文件、零构建依赖**的原生 HTML/CSS/JS，但发布产物 `dist/index.html` 不是空壳：
`build-local.js` 在组装阶段把内容**预渲染**进静态 HTML，因此不执行 JS 也能读到完整正文
（搜索引擎、生成式引擎、社交 unfurl 都直接可读）。

### 七个预渲染标记

源码 `index.html` 里保留标记，构建期替换；替换后若仍有残留，构建直接失败（不发空壳页）：

| 标记 | 构建期替换为 |
|---|---|
| `<!--PRERENDER:deals-->` | 默认视图（优惠 Tab、无筛选）的**力度分带 + 卡片** HTML |
| `<!--PRERENDER:facets-->` | 筛选条的 facet 按钮与实时计数 |
| `<!--PRERENDER:needs-->` | 「按需求找优惠」入口行（10 枚 `<a>`，无 JS 也在、也能点） |
| `<!--PRERENDER:topstat-->` | 顶栏右侧汇总（条数 / 更新日期） |
| `<!--PRERENDER:stats-->` | 结果条（显示多少条卡片 · 国内 / 国外 · 覆盖几个档位） |
| `<!--PRERENDER:categories-->` | 分类下拉的 `<option>` |
| `<!--PRERENDER:jsonld-->` | `Organization` / `BreadcrumbList` / `FAQPage` / `ItemList` 四段 JSON-LD |
| `__SITE_URL__` | 站点绝对地址（避免源码里硬编码第二份 URL） |

### 模板只有一处：RENDER-CORE 纯函数区

卡片模板**不会**在构建期与浏览器端各写一份。`index.html` 内联脚本里用标记划出一块只含
常量与纯函数的区块：

```
/* ==== RENDER-CORE:START ==== */
    常量与档位     TIERS / tierOf / affirmativeText
    厂商归一       VENDOR_RULES / vendorOf / logoHtml
    时间与转义     daysUntil / escapeHtml / offerOf / featsOf / tagsHtml
    折叠           foldKey / foldGroup / foldDeals
    筛选与渲染     matches / cardsFor / facetBarHtml / cardHtml / gridHtml / detailHtml
/* ==== RENDER-CORE:END   ==== */
```

`scripts/lib/render-core.js` 按标记抽出该区块，在**没有 DOM 的 vm 沙箱**里求值。构建期调
`defaultCards()` + `gridHtml()` 生成静态骨架，浏览器端调 `cardsFor(deals, filters)` 做筛选——
**默认视图就是同一函数取默认筛选参数的那一次调用**，两条路径不可能分叉。

这条约束是刻意的：一旦有人在区块内引用 `document` / `window` / `state`，构建立即报错，
而不是悄悄产出一个坏页面。

### 优惠力度分档（排序依据）

默认排序按「拿到手要花多少钱」从低到高，五档：

| 档 | 名称 | 判据（按顺序命中即停） |
|---|---|---|
| 1 | 完全免费 | `pricingModel` ∈ {free, freemium} |
| 2 | 免费额度 | 标题/说明命中「新用户 / 赠送 / 免费额度 / 代金券 / 首月…免费」，或 `pricingModel` ∈ {credits, trial} |
| 3 | 身份优惠 | 标题/说明命中身份门槛（学生 / 教师 / 非营利 / 初创 / 开源…） |
| 4 | 折扣促销 | 要付费，但命中折扣或限时 |
| 5 | 付费为主 | 其余 |

规则全部写在 RENDER-CORE 里，读的都是数据里**已有**的字段，不引入外部评分。
两个刻意的取舍：

- **判据分两侧读**：`标题 + discountInfo` 是「这是什么优惠」，`eligibility` 是「谁能拿」。
  身份门槛只在优惠侧成立才算数——目录站抓来的适用条件经常是媒体受众词
  （`Students, solo builders, app builders…`），拿它当门槛会把普通免费档错划进身份优惠。
- **先剔除否定句**：采集回来的原文里真有
  `No standing public student or nonprofit discount was listed…`
  和 `…the previous student offer ended March 11, 2026`。
  不剔除就会把「已结束的优惠」挂进身份优惠档。

同一档内按「即将截止优先 → 其次最近更新」排序（严格的旧排序语义细化）。
`npm run report:tier` 会把每张卡命中的判据和判据读到的原文逐条列出来，调规则先看它。

### 活动期限三分类（「即将截止」排序的依据）

「即将截止」按活动期限分三档排，卡片角标就是这三档：

| 档 | 角标 | 判据 | 排序位置 |
|---|---|---|---|
| 1 | `剩 N 天` / `今天截止` | `expiresAt` 有值（绝对截止日期） | 最前，按剩余天数升序 |
| 2 | `未标注截止日期` | 没有 `expiresAt`，且不满足第三档的判据 | 之后，按最近更新降序 |
| 3 | `长期活动` | 没有 `expiresAt`，`validity` 命中**正向线索且没有否定线索** | 最后，按最近更新降序 |

后两档都没有绝对日期可比，退回「最近更新优先」——次序因此是确定的，不再取决于
`deals.json` 的行序；同一天截止的条目也按最近更新兜底。

第三档的判据是**两条正则的与**（`scripts/lib/classify.js` 的 `ONGOING_POSITIVE_RE` /
`ONGOING_HEDGE_RE`，与 `index.html` 的 `ONGOING:START/END` 块逐字节同源）：

- **正向线索**必须锚在活动/有效期语义上：`长期|常年|永久` 之后 0–6 字内出现
  `有效|活动|可用|开放|提供|免费`，或 `不限时|无截止日期|不设截止|ongoing|no expiration|
  always available|no end date`；
- **否定线索**一票否决：`未标(注)截止|未标明截止|以官方…为准|以…实时…为准|随时结束/调整/变更|
  不另行通知`。命中即落第二档，**没有例外**。

三条硬规矩：

- **「未标注」不等于「长期」**。第三档是官方原话（"长期有效"），第二档是「我们没查到」。
  把后者写成前者就是编造，所以宁可分成两档、多一个灰色角标。
  **2026-09-28 的实测教训**：只有正向子串匹配时，21 条 `ongoing` 里有 11 条自己的
  `validity` 就写着「官方未标注截止日期」——详情页于是并列「官方未标注截止日期」与
  「官方…写明长期有效」两行（线上 80 个详情页里 21 页带着伪造的溯源）。判据缺的不是
  关键词，而是**否定**；源头还有采集器自己造词（`cn_docs.js` 给「官方只写免费、没写期限」
  的模型加了「长期有效」前缀）。所以判据与出处是**两层**，只修一层页面上仍然自相矛盾。
- **「某个权益永久」≠「整个优惠活动长期」**。`额度不过期`（讲的是 credits）、`永久五折`
  （讲的是折扣价）都不判 `ongoing`，落第二档。宁可少标一个「长期活动」，也不替官方扩大承诺。
- **相对期限不算截止日期**。「自开通起 3 个月」「有效期 1 年」从开通当天起算，没有绝对日期，
  归入第二档，不折算成 `expiresAt`。

`expiresAt` 只有两个写入途径：人工策展数据里显式填写，或合并时由 `scripts/lib/expiry.js`
从 `validity`/`discountInfo` 里**抽取写死的绝对日期**——必须带 4 位年份，且日期附近有
「截止 / 至 / until / through / ends」这类结束语义；发布日期、文档更新日期、模型下线日
一律不算，早于今天的日期也不收（页面上的往期活动会把本条误判成过期）。抽不到就留空，不猜。

`npm run selftest:expiry`（94 项）验四件事：抽取器的正/负样例、前端三分类与排序次序、
前后端「长期」正则**逐字节一致**（文本级比对，不只是行为比对）、以及**数据不变量**——
任何判成 `ongoing` 的条目都不得自带「官方未标注截止日期 / 以官方为准」这类线索。
`npm run validate --strict` 另有一颗钉子（`checkOngoingGuard()`）：用探针直接验证两层判据都在，
谁把否定层删掉，strict 立刻红。
`npm run validate` 会打印当前分布（有截止日期 / 未标注 / 长期活动；2026-09-28 为 0 / 123 / 10）。

现实是：**绝大多数条目的官方页面只写「限时」而不给日期**，所以第一档经常是空的。
这不是排序失效，而是那个日期在官方页面上确实不存在——宁可留空，也不拿发布日期凑数。

### 厂商 logo

厂商 logo 是**厂商官方品牌图形**，登记在 `assets/logos/manifest.json`，构建期由
`scripts/lib/logos.js` 生成为 `dist/logos/` + `dist/logos.css`。页面上只写 `data-logo`
属性，图形由 CSS 提供——因此渲染核心保持纯函数，且**不热链任何第三方 CDN**。

构建期断言「模板引用的 logo key 全部已登记」，缺一个就构建失败。

**拿不到官方图形时退到名称缩写兜底块**（`Wispr Flow → WF`、`KREA → KR`）：
低饱和深色底 + 白字，`title` / `aria-label` 写明「名称缩写，未取得官方品牌图形」，
且**绝不与官方图形出现在同一张卡上**（构建与 `npm run verify` 都断言二选一）。
顺序是硬的——拿得到真图形就绝不用缩写。当前 **77 家厂商里 38 家用官方图形、39 家用缩写兜底**
（`npm run report:vendor` 实测输出 `官方品牌图形: 38 家 / 名称缩写兜底: 39 家 / 共 77 家`）。
详见 `assets/logos/README.md`（含直连取不到时怎么走代理 + 真浏览器取图）。

### 中文翻译（国外条目的英文文案）

国外来源（Futuretools / Curated）的 `discountInfo` / `description` / `eligibility` / `validity` / `priceLine`
是英文散文（这 5 个就是 `scripts/lib/zh.js` 的 `ZH_FIELDS`——允许翻译的字段就是它们），
而访客以中文为主。做法是**人工译文覆盖层**，不是渲染期机翻：

- 译文集中维护在 `scripts/data/translations_zh.json`，键为 `deal.id`，只放译文。
- 采集（`collect.js`）与构建（`build-local.js`）**都**调用 `scripts/lib/zh.js` 的 `attach()`，
  把结果写进 `deals.json` 的 `zh` 字段。浏览器 `fetch('deals.json')` 与构建期预渲染因此
  读到同一份数据，仍然只有一条代码路径。
- **英文原文字段一个字节都不改**。译文永远挂在原文下面，详情弹层里渲染成
  `<details class="zht">`（默认展开，点一下收起，偏好记在 localStorage）。
- 卡片上给一个 `中文` 胶囊提示「详情页附中文翻译」，放在 `.meta` 行而不是标题旁——
  那一行是 `nowrap + overflow:hidden` 的横排，加个胶囊不会让标题重排，卡片定高不变。
- **原文指纹**：每条译文连同它照抄的那段英文一起存进 `src`。英文被采集器改写后指纹对不上，
  该字段译文**自动停用**并在构建日志里催促复核——宁可不出译文，也不出与原文矛盾的中文。
- 判定「这段是不是英文散文」由 `scripts/lib/zh.js` 统一负责，构建与工具共用：
  零汉字 + 拉丁字母 > 8，或有零星汉字但出现英文虚词。踩过的坑是「CJK 占比 < 25% 就算英文」
  会把 `官方定价页标注多款模型价格为「免费」：文本 Hunyuan-MT-7B、bge-m3……`
  这种**本来就是中文**的条目误判进来。

```bash
npm run todo:zh         # 列出待翻译条目（原文 + 已有译文），--json / --scaffold / --orphans
npm run check:zh        # 译文门禁（硬）：漂移必红；待译按宽限期判（默认 7 天，--grace=N 可调）
npm run selftest:zh     # 门禁演练：塞坏数据进去，验证构建拦得住、check 也标得出来
```

构建期门禁：译文不合规（不含汉字 / 字段名非法 / 超长 / 原文为空）**硬失败阻止发布**；
原文已变则警告并停用该字段；译文键对不上任何条目则告警（条目改名换 URL 会让 id 变化）。

**译文门禁分两档**（2026-09-28 起，此前 `check:zh` 是建议性、却被 `selftest:zh` 反向依赖）：

| 判词 | 内容 | 后果 |
|---|---|---|
| **漂移** | 孤儿（对不上 id） / 原文已变停用 / 不合规 / 覆盖层管不到 | **必红**，没有宽限期 |
| **待译** | 新采进来的英文条目还没人工翻译 | 宽限 7 天内放行（`PENDING_GRACE_DAYS`），数量与「最老 N 天」每次都打印；超期转红 |

为什么不是「待译必红」：自动采集每天两次，任何一条新英文条目都会让下一次人工 push 的 gate
变红（2026-09-28 e01dcfc 实测就是这条链），系统会长期停在「有新优惠 → 必然 CI 红」。
为什么待译也不能无声：数量与最老天数进 CI Summary、采集日志与 `/status/` 页面。
`npm run check:zh -- --grace=0` 可以把待译也当成必红（发布前自查用）。

**年龄从「它进入待译」那天算起**，不是从条目第一次被采集到（`firstSeen`）算起。
这个区别是必须的：上游改写会让**一条老条目**的译文失效（2026-09-28 实测：Midjourney / Grok
的英文被换掉，两条中文随之失效），用 `firstSeen` 计时等于「刚失效就超期」，第二天门禁就红
而人没有反应时间。所以：

- `scripts/data/zh-pending.json`（**入库**的跨运行状态）记下每个 `(条目, 字段)` 进入待译的日期；
  由 `collect.js` 每轮维护，作者循环 `--scaffold` 收尾时也调同一个纯函数划账
  （仍在待译的保留原日期、译好的删掉、新出现的记今天），门禁只读 —— **会改文件的检查不是检查**；
  两边都得划账的理由：账本只该记**还没译**的字段。留着已译好的旧日期，等上游再改写一次、
  人把译文撤下时会翻出上一轮的日期当成「这条已经等了很多天」，宽限期一天不剩 —— 那是假红；
- 没有记录时才退回 `firstSeen`；两者都没有就从今天起算（绝不把「不知道它什么时候进来的」
  当成「它已经陈年」）；
- `npm run check:zh` 会打印 `（N 天，自 YYYY-MM-DD 起 · 依据 pending|firstSeen|today）`，
  算的是哪一天一眼可见。

> 顺带一条血泪账：漂移数曾经把 `stale` 与 `dropped` 加了两遍（`lib/zh.js` 里后者就是前者的
> 计数），于是打印出「漂移 4 处」而分解式只有 2 —— 数字对不上的门禁没人会信，已只计一次。

> 上游改写造成译文失效时，覆盖层那条中文会**自动停用**（指纹对不上），而不是被工具悄悄追认
> —— 必须有人复核新英文再重新落笔。H2 的红线是**不做机器翻译**，不是「不许人写」：
> 2026-09-28 那次采集里 Midjourney / Grok 的英文被上游换掉，两条中文随之失效、从覆盖层移除
> 并进入待译清单（宽限 7 天）；同日人工补译了 Midjourney / Grok / Unboring.ai 三条，账本随即划清。

> 覆盖层是译文的**唯一权威**：源文件 `deals.json` 里不需要手工写 `zh`。
> 构建时 `build-local.js` 会把贴好译文的整份数据写进 **`dist/deals.json`**——
> 那才是浏览器 `fetch('deals.json')` 真正拿到的那一份。
第 1 步的数据校验跑在未贴译文的 `deals.json` 上，所以这道门禁是在构建里单独补的。

### 搜索范围（什么能被搜到）

首页搜索框的 haystack 覆盖：`title` / `vendor` / `discountInfo` / `description` / `category` /
`source` / `eligibility` / **`validity`** / **`priceLine`** / `features`，
以及**中文译文 `zh.*`**（含折叠卡成员的译文 `memberZhText`，后者只用于检索、绝不参与渲染）。

规矩是：**用户能看见的文字都必须能被搜到**。译文是渲染出来的正文（卡片「中文」胶囊 +
详情弹层里的可折叠译文块），把它排除在 haystack 之外会造成「看得见、复制出来搜不到」。
`npm run verify` 的 §8b 现场从产物里取一条带译文的卡片，拿译文里的中文片段去搜并断言命中
（优惠视图与「全部工具」视图各验一次，且都不硬编码条目）。

### 原文截断（不把截断的句子伪装成完整句）

`scripts/lib/schema.js` 的 `cleanText()` 是**所有**用户可见文本的唯一入口，它保留截断语义：

- 上游本来就以 `...` / `…` 结尾（aitools.fyi 的 `zhDescription` 实测 15/15 如此）：
  剥掉原省略号之后**照样补回一个 `…`**。旧实现是把残尾直接删掉，于是屏幕上出现
  `……Getsolved 将检测和重写整` 这种断在半路的「完整句」。
- 我们自己按字段上限切：先退到词边界（切点两侧都是拉丁字母时退到最近的空格，退让下限 60%），
  再补 `…`；中日韩没有词边界，原样切。
- 两条不变量：**返回值绝不超过上限**（补记号先让位，schema 的长度断言依赖它）、
  **清洗幂等**（`validateDeal` 会拿 `cleanText(deal.title,150) === deal.title` 复核存量数据）。
- 采集器的抽句正则同样只认到句读为止（`[^。；;：:\n]`），否则会跨过中文的「；」「：」，
  抓出 `…额度有效期内是否使用均不会暂停计时； 额度过` 这种半句。

`npm run selftest:text`（46 项）验这些；另有两条**数据不变量**：已存文本必须已是规范形态、
没有字段以 ASCII 的 `...` 结尾（规范记号只有 `…`）。

### 数据源状态（/status/）

首页页脚的「数据源状态」指向 **`/status/`**（另有机器可读的 `/source-health.json`）：
每个采集来源的**最近一次**结果与跨运行的连续性——本次/上次条数、状态、连续失败次数、
连续零产出次数、最近成功时间。状态规则写死在 `scripts/lib/health.js` 的文件头：

| 条件 | 状态 |
|---|---|
| 采集器抛异常 | `failed`（`consecutiveFailures+1`，`lastSuccessAt` 不刷成今天） |
| 无头来源 + 本轮浏览器没起来 | `failed`（页面根本没渲染，不许报正常） |
| 成功且 `cur=0` | `degraded`；连续 3 次 → `failed` |
| 成功且 `prev>0` 且 `cur < prev×0.5` | `degraded`（条数骤降） |
| 其余 | `healthy` |

为什么要公开这一页：首页只写「数据更新 {今天}」，而人工策展条目的 `lastSeen` 每天都在刷新，
所以「某个来源坏了几天」与「某个来源这次没有新内容」在首页上看起来一样（采集报告只活在
当次运行的内存里）。`scripts/data/source-health.json` 是**入库**的跨运行状态，由
`collect.js` 每轮写入、与 `deals.json` 同批提交；`npm run selftest:health`（51 项）钉住
上面这张规则表，包括「单次零产出不算 failed」「连续 3 次才升级」「浏览器没起来不许报 healthy」。

**它同时满足站点的五条既有约定**（2026-09-29 收口前只满足两条）：

| 约定 | 做法 |
|---|---|
| sitemap | 进 `sitemap.xml`，`priority 0.3` —— **低于**详情页 0.7（它是工具页，不是搜索入口） |
| feed | 声明两个 `rel="alternate"`；自己不产条目（订阅是「内容更新」语义，一页运维表不是更新） |
| JSON-LD | 两段：`WebPage` + `BreadcrumbList`（**一段一个对象**，不塞进一个数组） |
| 预渲染 | 表格构建期写死 |
| 无 JS 可读 | 绝对时间在 `<time datetime>` 里；「2 小时前」只由内联脚本换算，禁用 JS 时读到的仍是完整信息 |

它还**不发** `Dataset` / `ItemList`：机器可读的那一份就是 `source-health.json`，页面上直接链着它。
把同一份事实声明两次，两次迟早会分家，而分家时两边各自看都自洽 —— 没有任何东西会红。

`npm run verify` 对它有 10 条真浏览器断言，其中最要紧的两条是 **390px / 360px 不产生页面级
横向溢出**：三列数字与时间都是 `white-space: nowrap`，宽表靠 `.stable-wrap` 内部横滚。
把那一层去掉，桌面端毫无变化，390px 溢出 121px、360px 溢出 151px（实测）—— 这类缺陷静态检查
一条都看不见。

### 诚实性约束（与竞品的关键差别）

- 卡片底部只有**一种**新鲜度标注：「数据更新 {lastSeen}」。这里曾分「已核验」（人工逐条回访官方页）
  与「数据更新」（自动采集）两种角标，但两者并列时反而误导——人工核验那条的日期常常比自动采集的旧，
  读起来像「这条更不新鲜」，于是整条撤掉（筛选条的「只看已核验」、顶栏的「已核验 N」、详情/对比里的
  「核验状态」行一并撤掉）。数据字段 `verified` / `verifiedAt` 仍在，`validate.js` 仍守
  「`verified=true` 必须带 `verifiedAt`」；要恢复展示，改 `stampOf()` 一处即可。
- 无 `features` 的条目回退展示 `discountInfo`；工具条目显示工具简介（灰条）而**不冒充优惠**
  （优惠正文用档位配色的竖条，两者视觉上分得开）。
- 优惠正文只在标点处切一刀加粗前半句，**不改写、不截断、不补写**一个字。
- 中文译文只出现在**人工逐条翻译过**的条目上：卡片有「中文」胶囊 ⟺ 详情里真有译文块
  （构建自检与 `npm run verify` 双向断言，两个方向都查）。取不到译文就什么都不渲染，
  **不机翻、不占位**。译文与英文原文并列展示，原文永远在上、一个字都不删。
- `FAQPage` 结构化数据**从页面可见的 `<details>` 文案反向解析**生成，保证两者逐字一致
  （构建自检会校验这一致性）。
- 页脚明确声明「本站不收录付费推广位，排序与推荐理由不出售」。
- **详情页有「信息来源」块（v1.3）**：官方页面 / 原始出处 / 收录来源 / 来源类型 / 采集方式 /
  首次收录 / 最近发现 / 最近成功采集 / 断言依据 / 官方原文片段 —— 十行固定，缺值也出行，
  但**绝不把「缺失」说成同一句话**：
  - **不适用** = 人工策展，按设计不经过采集器；
  - **未知** = 本该有，但来源心跳里没匹配到；
  - **不可用** = 本次构建根本没有可用的心跳数据。

  「最近成功采集」取自 `source-health.json`（构建期 join，只进 `dist`），不是每条记录自己存的
  时间戳。块尾固定免责句，**不给优惠下有效性结论**：不渲染 `verified` / `verifiedAt`，
  也不出现「已核验」「100% 有效」这类词（`validate --strict` 与 `provenance-selftest`
  对措辞做逐字红线检查）。官方原文片段是**有界引文**：≤3 条 × ≤200 字、只人工写、
  超长拒收、出处禁聚合站；全库还有字数与占比两道预算——这一层的存在理由就是
  **不因为要展示而复制第三方全文**。

### 按需求找优惠（v1.2）

首页在筛选条下面有一行「按需求找优惠」入口，把「我是学生 / 我是开发者」的常见诉求
直接用**静态路由**表达出来，而不是要求用户先把需求翻译成筛选条件：

```
学生  学生专享12  教育身份可领7  无需信用卡1  国内可用30  完全免费60
      免费 API45  免费 Tokens44  AI Coding4  免费模型12  开发者 Credits67
```

十条入口各自对应一个 `/need/<slug>/` 静态页（预渲染表格 + 「为什么在这一页」证据列 +
双 feed + 三段 JSON-LD + 自指 canonical + 进 sitemap），完整报告见
`research/v1.2-intent-first-home-report.md`。

**为什么是静态路由而不是 `?need=`**：首页是静态文件，无法按 query string 产出不同内容。
`?need=free-api` 分享出去，别人打开的是「首页」而不是结果页，爬虫读到的也是首页 ——
「URL 可分享」与「无 JS 可读」两条会同时落空。这是本轮唯一的形态性决策。

**判据只写一遍**：十条判据在 `scripts/lib/audience.js` 的 `NEED_PREDICATES`，
结果作为**派生字段** `needs` 写进 `dist/deals.json`（与 `collections` 同构），
前端只做 `includes()`。**v1.1 的字段契约一个字没改**（见 `docs/SCHEMA-v1.1.md` 第十一节）。

**入口行的数字全部按数据现算**：首页入口上的数字、页面顶部、表格行数、JSON-LD
`ItemList` 全部同源；文案里禁止写死条数，有断言守着（这条断言写完当轮就抓到
3 处我自己写死的数字）。

**移动端**：≤760px 换成短标签（专享 / 教育 / 免卡 / 国内 / 免费 / API / Tokens /
Coding / 模型 / Credits）并排成两列，**切换只用 CSS 媒体查询、不用 JS** ——
无 JS 的访客在窄屏上也要看到短标签。全称与短标签两个 `<span>` 同时在 DOM 里，
屏幕阅读器在桌面端读到的仍是全称。

### 真浏览器验收

卡片是**固定高度**的，任何一处内容变高都会被 `overflow:hidden` 静默裁掉；logo 簇是 hover
展开的，很容易把标题挤到换行、把网格行高顶动。这两类问题静态检查都看不见，所以有
`npm run verify`：起一个本地服务器 + Edge 无头浏览器，跑 **256 项断言**；带基线回归比对的
`npm run verify:regress` 共 **262 项**（多出的 6 条是回归比对：覆盖条数、卡片数、首屏完整可见、
页高、外部请求、JS 错误）。
这两个数字由工具自己打印（`✅ 验收 N 项，失败 0 项`），跑一次就能核。**不要拿源码里 `check(`
的调用点数去反推**：按行首 `check(` 计是 177 处，与执行项数并不相等 —— 有的调用在循环里
（分类页 3 条路由 × 5 类断言、10 条需求页 × 7 类断言、状态页 2 个视口各一轮），有的在 `if/else` 里
（取样前提不成立时只打印「跳过」，不计一项）。
无 JS 时的静态骨架、卡片高度是否统一、**每张卡最后一个元素有没有越过内边距**、
hover 前后卡片高/logo 簇宽/标题宽是否一致、弹层、筛选、排序、搜索、中文译文可搜、
移动端横向溢出、**锚点导航的真实渲染状态**（量 `getComputedStyle.display` 与几何，
不只读 `hidden` 属性——`.jump{display:flex}` 是作者级声明，会盖掉 UA 的 `[hidden]{display:none}`，
2026-09-28 之前它就是「hidden=true 却照样可见可点」）、中文译文的展示与折叠、
外部请求数、JS 报错数。

### 无障碍与 OG 图

- `og-image.png` 由 `scripts/lib/og-image.js` 用 Node 内置 `zlib` 手写 PNG 编码生成
  （1200×630），文字用内置 5×7 点阵字模绘制。**取舍**：点阵字模只能绘制 ASCII，因此分享图
  只画品牌标记与站点名，不做中文排版——换来的是构建仍然零外部依赖、CI 无需装图像库。
  自检会校验 PNG magic、IHDR 尺寸，以及三处文字确实绘制成功（像素计数下限）。
- 首页含 `canonical`、`hreflang(zh-CN / x-default)`、`og:*`、`twitter:*`、
  `<meta name="robots" content="index, follow, max-image-preview:large">`。
- `robots.txt` 显式放行主流 AI 爬虫（GEO 意图声明）。

## 自动化与部署

**门禁的步骤实现只有一处**：`.github/actions/gate/action.yml`（复合 action，**17 步**）——
`npm ci → validate --strict → 可重建性门禁 → 迁移验收比对 → 译文门禁 → 译文演练 → 活动期限演练
→ 文本清洗演练 → 健康演练 → 受众字段演练 → 采集机器人身份演练 → 组装产物 → 准备浏览器
→ 浏览器可用性判定 → 真浏览器验收 → 回归比对 → 结论`。
三条 workflow 共用它，没有第二套测试链。

> 步骤的**顺序与数量**是一份冻结契约（`check-ci-consistency.js` 的 `GATE_STEP_NAMES`）：
> 谁把真浏览器验收、回归比对或译文门禁从门禁里拿掉，`npm run check:ci` 立刻红。
> 所以上面这句「17 步」不是抄来的，是被断言钉住的。

- `.github/workflows/verify.yml`（**必需检查名 `gate`**）：`pull_request` / `push`(master) /
  手动。步骤是 checkout → setup-node → 一致性门禁（单行 `run:`，`--expect-checks=N` 是项数的
  **唯一出处**）→ 调用门禁 action。这个 job **永远不许有 job 级 `if`**（被跳过的 job 报 Success
  = 没跑却算过），要判断该不该拦就把判断写进步骤里。
- `.github/workflows/deploy.yml`：`push`(master) / `workflow_run`(Collect) / 手动。
  job 顺序 **`prepublish`（跑完整门禁）→ `build` → `deploy`**：门禁红则 build/deploy
  **根本没有机会执行**。`prepublish` 同样没有 job 级 `if`，「上游采集失败就拒绝发布」写成
  步骤内的显式判定（`::error` + `exit 1`）。
  **为什么以前不是这样**：此前 gate 与 deploy 是两条互不相干的并行链，`build` 的 if 只看
  Collect 的结论，而第一句 `event_name != 'workflow_run'` 让每一次人工 push 都无条件发布
  —— 线上实证：`e01dcfc` 上 `gate=failure` 而 `build`/`deploy=success` 照发。
- `.github/workflows/collect.yml`：cron **名义**上是每天北京时间 08:00 / 20:00（`0 0 * * *` / `0 12 * * *`
  = UTC 00:00 / 12:00）采集 → 校验 → **提交前的完整门禁** → 有变化才提交
  `deals.json` + `scripts/data/source-health.json` + `scripts/data/zh-pending.json`
  （三份一起走：数据本身，以及两份跨运行状态）。门禁排在 `git push` **之前**：数据有问题
  就根本不入库（机器人提交一进 master 就会被 deploy 的 workflow_run 接走）。
  采集步骤为 `node scripts/collect.js --headless`（静态来源 + 无头来源），前面会安装 playwright 自带
  chromium（这一步失败不阻断采集本身，但会让无头来源在健康表里判成 `headless_unavailable`，
  进而让**提交前的门禁**失败——这是刻意的，见下）。
  **实测**：GitHub 的 schedule 队列常把这一跑延后 **3 到 6 小时**。2026-09-23 从 Actions API 复核 4 次
  schedule 运行的 `created_at`（延后 +3h26m50s 到 +5h55m40s）：
  `2026-09-21T17:55:40Z`（名义 12:00Z → 北京 09-22 01:55，延后 5h55m40s，run 35635091297）、
  `2026-09-22T03:26:50Z`（名义 00:00Z → 北京 11:26，延后 3h26m50s，run 35683186610）、
  `2026-09-22T16:22:56Z`（名义 12:00Z → 北京 09-23 00:22，延后 4h22m56s，run 35753733647）、
  `2026-09-23T03:27:38Z`（名义 00:00Z → 北京 11:27，延后 3h27m38s，run 35814407156）。
  所以别把「08:00 / 20:00」当成实际更新时间。
- `.github/workflows/probe-sources.yml`：**手动触发**的只读探针，验证 Actions 出口 IP 能否访问/渲染
  智谱活动页与火山方舟（厂商风控或镜像变更后用它复检）。
- 采集与发布分离，保证线上产物可复现。

> ⚠️ **为什么部署还要监听 `workflow_run`**
> GitHub 规定：用仓库自带的 `GITHUB_TOKEN` 推送所产生的事件**不会**再触发其它 workflow。
> 2026-09-29 起机器人改用**专用 App token** 推送（原因见下一节），而 App token **会**触发
> workflow —— 于是同一个 SHA 上会同时跑 deploy.yml 的 `push` 链与 `workflow_run` 链，
> 白跑一遍发布。所以机器人的提交里带 `[skip ci]`，把 push 触发的那条按掉。
> **这不是猜的**：官方 `Skipping workflow runs` 原文 ——
> 「Skip instructions only apply to the `push` and `pull_request` events.」
> 也就是说它**不会**压住 `workflow_run`，发布链照常；反过来，若有人以为它能拦
> `workflow_run`，站点才会真停更。（同一页还明写：被跳过的 workflow 其检查停在 Pending，
> 所以数据提交上的 `gate` 永远 Pending —— 它在 master 上、没有 PR 要它，属预期。）
> **发布只走 `workflow_run` 这一条**：它是唯一能携带「上游采集结论」的触发方式，
> 无论机器人用哪种身份都必需。
> 于是同一条链路上 verify.yml 也不会跑（被 `[skip ci]` 按掉的正是它），所以 deploy 的
> `prepublish` 是唯一的把关点——这也是为什么门禁必须能在发布链里自己跑一遍。

> ⚠️ **发布路径因此依赖 npm registry**：真浏览器验收需要 `playwright-core`，所以门禁里有
> `npm ci`。此前「发布前无需 npm install」的说法只对 `build-local.js` 那一步成立（它确实零依赖），
> 现在整条发布链不再与网络无关——这是「gate 全过才发布」的必然代价，如实记录。

> ⚠️ **门禁红时会怎样**：本次不发布，线上继续保留上一份成功版本。定时采集那条链路尤其如此
> ——浏览器装不上 = 门禁红 = 本次不提交数据、站点停更。这是刻意的取舍（数据正确性 >
> 更新频率）；逃生口只有一个且必须人工：`workflow_dispatch` 勾 `allow_degraded_run`，
> Summary 里会明确留下「本次没有做真浏览器验收」。

> ⚠️ **回归比对的代价**：`verify --compare` 对覆盖条数 / 卡片数 / 首屏完整可见条数只允许
> 「不减少」。合法的数据缩减（过期下架、重新折叠）会拦发布，处置方式是**人工、留痕**地
> 重刷基线：`npm run verify:baseline`（基线文件 `research/_raw/ours-baseline/verify.json` 在 git 里，
> 改它必然出现在 diff 里，无法静默绕过）。

### 采集机器人的身份（专用 GitHub App）

定时采集要把数据推进 `master`。如果 `master` 设成「**必须走 PR + 必须过 `gate`**」，
用仓库自带的 `GITHUB_TOKEN` 推送就会被挡在门外 —— 而采集是无人值守的，
症状是**每天两次静默失败**。

直觉方案是「把 GitHub Actions 加进 ruleset 的绕过名单」，但**做不到**（2026-09-29 查证）：

- GitHub 文档给出的绕过候选是**穷举**的：仓库/组织/企业管理员、`maintain`|`write` 角色、
  Teams、Deploy keys（仅 GHES）、**可安装的 GitHub Apps**、Dependabot、Copilot cloud agent
  —— 里面没有「GitHub Actions」，所以那个选项在界面上**根本不存在**；
- `github-actions`（App ID **15368**）是**平台原生身份**（每次 `GITHUB_TOKEN` 调用的背后都是它），
  不是「安装在仓库上的 GitHub App」。用 API 传
  `actor_type: "Integration", actor_id: 15368` 会返回 **HTTP 422**：
  `Actor GitHub Actions integration must be part of the ruleset source or owner organization`。
- 也不能改走「机器人开 PR + 自动合并」：用 `GITHUB_TOKEN` 建的 PR **不会触发**
  `pull_request` workflow，`gate` 永远 pending，自动合并永远等不到。

于是本项目给机器人一个**自己的 App 身份**，并把它**单独**列进绕过名单 —— 只豁免机器人，不豁免人：

| 项 | 值 |
|---|---|
| 权限 | Repository permissions → **Contents: Read and write**（推送提交所需的最小集） |
| Webhook | **不勾**（不需要） |
| Secret 1 | `COLLECT_APP_ID` —— App 页面上的 App ID |
| Secret 2 | `COLLECT_APP_PRIVATE_KEY` —— App 页面底部 *Generate a private key* 下载的 `.pem` **全文** |
| ruleset 绕过名单 | 只加这个 App（`Repository admin` **不要**加 —— 那等于人也能绕过） |

实现：`scripts/tools/app-token.js`（零依赖，用 Node 原生 `crypto` 签 RS256 JWT，
再换一次性的 installation token）。三处刻意的设计：

- **换取步骤排在采集之前**：凭据没配好要在 10 秒内失败，而不是等一轮十几分钟的采集跑完
  才发现最后一步推不上去；
- **缺 Secret 时明确失败，不退回 `GITHUB_TOKEN`**：退回会在 ruleset 生效后变成一句含混的
  `GH006`，把真正的原因（凭据没配）藏起来；
- **token 只进 `$GITHUB_OUTPUT`，且先 `::add-mask::`**：日志里不会出现明文。

`npm run selftest:app-token`（67 项，离线、不起网络）盯住三件最容易写错的事：
JWT 不超过 GitHub 的 **10 分钟**硬上限、三步的 `Authorization` **都是 App JWT**、
以及三条失败路径必须给出可照做的报错。它还额外盯住两类真会踩的**输入形态**：
App 页面下载的私钥是 **PKCS#1**（`-----BEGIN RSA PRIVATE KEY-----`，与顺手生成的 PKCS#8 不同），
以及「从 `.pem` 复制粘贴进 Secret 输入框」的四种真实变体（CRLF / 漏结尾换行 / 多带空白 /
换行被压成字面量 `\n`）——实测只有最后一种会炸，而那一种正是 `normalizePrivateKey` 修的。
`check-ci-consistency` 的断言 **(15)** 再把它钉死：
把推送退回 `GITHUB_TOKEN` 的改动**在本地完全看不出来**（本机没有 ruleset，`git push` 照样成功），
只会在线上定时任务里烂掉。

### 更新频率一览

| 内容 | 更新方式 | 频率 |
|---|---|---|
| 采集到的优惠 / 工具条目（静态来源） | 自动（GitHub Actions 定时） | 名义每天 2 次（北京 08:00 / 20:00）；**实测常延后 3 到 6 小时**（见上文）；数据无变化则不提交 |
| 无头来源（智谱活动页 / 火山方舟） | 自动（同上，跑在同一次采集里） | 每天 2 次；内核装不上或页面改版时该来源产出 0 条，不会写坏数据 |
| 线上页面 | 自动（提交后经 `workflow_run` 触发部署，发布前先过完整门禁） | 跟随采集，或任意一次 `push` |
| 过期优惠下架 | 自动（每次采集时修剪） | 过期超过 14 天的优惠被移除 |
| 数据源状态页 `/status/` 与 `/source-health.json` | 自动（每次采集写 `scripts/data/source-health.json`，构建期生成页面） | 跟随采集 |
| 人工策展优惠（`scripts/data/curated_*.json`） | **人工** | 由人修改并推送，无自动更新 |
| 采集器选择器 / 别名表 | **人工** | 对方站点改版导致零产出时需要人修 |

## 隐私声明

本项目仅供个人使用，不收集任何用户访问数据。

## 已知边界

- 需登录的页面（各家控制台）不采集，不做登录态抓取。
- JS 渲染的公开页已用无头浏览器采集（见上文，已在 CI 里每天跑）；渲染后仍无优惠表述的来源
  （如 DeepSeek 官网）不注册采集器，改由人工策展维护。厂商改版会让某个来源产出 0 条——
  这是刻意设计的失败安全，届时用 `scripts/tools/render-source.js` 重新校准规则即可。
- 促销信息时效性强，`expiresAt` 或 `validity` 字段标注时间信息；发现过期信息欢迎提 issue 修正。
