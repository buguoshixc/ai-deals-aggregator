# AI 优惠聚合器

一个零构建的静态站点，聚合**国内外 AI 大模型的真实优惠与福利**：新用户免费额度、免费模型、
学生 / 教师 / 非营利折扣、限时促销。数据每日自动采集两次，经校验后发布到 GitHub Pages。

- 线上地址：https://buguoshixc.github.io/ai-deals-aggregator/
- 数据文件：`deals.json`（v2 契约，见下文）

## 设计原则

1. **只收录真实优惠**。定价表、"这是付费产品"这类信息不算优惠，只会以 `type: "tool"` 进入"全部工具"页，
   默认视图只展示 `type: "deal"` 的已核验优惠。
2. **落地页指向官方**。聚合站（Layer3Labs 等）作为 `sourceUrl` 署名，卡片主链接给到厂商官方页。
3. **零产出的采集器不上线**。注册表里只保留实测有产出的来源，避免"代码在跑但没数据"。
4. **坏数据不发布**。`scripts/validate.js` 是部署门禁，校验不过就不部署。
5. **不抓登录态**。只抓公开页；需要登录才可见的内容不进自动采集链路。
6. **不编造、不夸大**。看不到升级路径就不写 `priceLine`，没有可信标签就不写 `features`，
   自动采集的条目不冒充"已核验"。宁可信息少一行，也不给不可信的内容。
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
      "id": "a1b2c3d4e5f6",       // sha1(vendor|title|url) 前 12 位，稳定去重键
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
| `verifiedAt` | 仅人工逐条回访官方页的条目可填（当前 23 条策展数据）。自动采集条目一律为 `null`，卡片显示「数据更新：{lastSeen}」而不是「已核验」——不把「抓到过」说成「核验过」。 |

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
  collect.js                  采集编排：注册表 → 归一 → 去重 → 熔断 → 写盘 → 报告
  validate.js                 数据与前端校验（零依赖，CI 门禁）
  migrate.js                  v1 → v2 迁移与清洗
  serve.js                    零依赖本地预览服务器（--dir=dist 可预览产物）
  lib/
    schema.js                 v2 契约：makeDeal / validateDeal / 垃圾与优惠信号判定
    store.js                  读写、合并、过期修剪、写盘熔断、发布前断言
    dedup.js                  标题归一 + 别名表 + 信息量择优合并
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
  collectors/
    index.js                  注册表
    cn_docs.js                国内：百度千帆免费额度表 / 阿里云百炼 / 智谱免费模型
    global_deals.js           国外真实优惠：Layer3Labs 折扣表
    global_directories.js     国外目录站：aitools.fyi / Futurepedia / Futuretools
    headless.js               无头浏览器来源：智谱活动页 / 火山方舟免费额度与活动
  data/
    curated_cn.json           国内人工策展（可核验的官方优惠）
    curated_global.json       国外人工策展
    translations_zh.json      国外英文文案的人工中文译文（键为 deal.id，含原文指纹 src）
    backfill-cards.js         一次性补齐卡片字段的映射记录（新增条目时作写法参考）
    aliases.json              产品别名表（跨源去重）
    official_urls.json        聚合站条目 → 官方页映射
  tools/                      采集器调试工具与发布产物组装
    build-local.js            校验 → 组装 dist/ → 预渲染 → 自检（本地与 CI 同一路径）
    verify-site.js            真浏览器验收：密度/裁切/hover/筛选/弹层/译文折叠/移动端（dev，需 playwright-core）
    zh-todo.js                中文翻译待办与脚手架（--json / --scaffold 盖原文指纹 / --orphans）
    zh-selftest.js            中文译文门禁演练（自恢复，验证坏译文真的会被拦下）
    tier-report.js            分档与厂商归一报告（调规则时先看它）
    fetch-logos.js            从厂商官网抓取品牌图标，补进 assets/logos/
```

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

### 六个预渲染标记

源码 `index.html` 里保留标记，构建期替换；替换后若仍有残留，构建直接失败（不发空壳页）：

| 标记 | 构建期替换为 |
|---|---|
| `<!--PRERENDER:deals-->` | 默认视图（优惠 Tab、无筛选）的**力度分带 + 卡片** HTML |
| `<!--PRERENDER:facets-->` | 筛选条的 facet 按钮与实时计数 |
| `<!--PRERENDER:topstat-->` | 顶栏右侧汇总（条数 / 已核验数 / 更新日期） |
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

### 厂商 logo

厂商 logo 是**厂商官方品牌图形**，登记在 `assets/logos/manifest.json`，构建期由
`scripts/lib/logos.js` 生成为 `dist/logos/` + `dist/logos.css`。页面上只写 `data-logo`
属性，图形由 CSS 提供——因此渲染核心保持纯函数，且**不热链任何第三方 CDN**。

构建期断言「模板引用的 logo key 全部已登记」，缺一个就构建失败。

**拿不到官方图形时退到名称缩写兜底块**（`Wispr Flow → WF`、`KREA → KR`）：
低饱和深色底 + 白字，`title` / `aria-label` 写明「名称缩写，未取得官方品牌图形」，
且**绝不与官方图形出现在同一张卡上**（构建与 `npm run verify` 都断言二选一）。
顺序是硬的——拿得到真图形就绝不用缩写。当前 72 家厂商里 35 家用官方图形、37 家用缩写兜底。
详见 `assets/logos/README.md`（含直连取不到时怎么走代理 + 真浏览器取图）。

### 中文翻译（国外条目的英文文案）

国外来源（Futuretools / Curated）的 `discountInfo` / `description` / `eligibility` 是英文散文，
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
npm run check:zh        # 漂移门禁：非零退出 = 有译文对不上 id / 原文已变 / 还有条目没译
npm run selftest:zh     # 门禁演练：塞坏数据进去，验证构建拦得住、check 也标得出来
```

构建期门禁：译文不合规（不含汉字 / 字段名非法 / 超长 / 原文为空）**硬失败阻止发布**；
原文已变则警告并停用该字段；译文键对不上任何条目则告警（条目改名换 URL 会让 id 变化）。

`check:zh` 是**建议性**门禁：它不阻断发布（有漂移时站点该照常上线，英文原文仍在，卡片只是少一枚
「中文」胶囊），但把漂移写进 CI 运行 Summary，不让它只留在构建日志里。采集工作流里的这一
步是 `continue-on-error`，其余仍是硬门禁。

> 覆盖层是译文的**唯一权威**：源文件 `deals.json` 里不需要手工写 `zh`。
> 构建时 `build-local.js` 会把贴好译文的整份数据写进 **`dist/deals.json`**——
> 那才是浏览器 `fetch('deals.json')` 真正拿到的那一份。
第 1 步的数据校验跑在未贴译文的 `deals.json` 上，所以这道门禁是在构建里单独补的。

### 诚实性约束（与竞品的关键差别）

- 卡片底部只在**人工逐条回访官方页**的条目上显示「已核验 {日期}」；自动采集条目显示
  「数据更新 {lastSeen}」。不把「抓到过」说成「核验过」。
- 无 `features` 的条目回退展示 `discountInfo`；工具条目显示工具简介（灰条）而**不冒充优惠**
  （优惠正文用档位配色的竖条，两者视觉上分得开）。
- 优惠正文只在标点处切一刀加粗前半句，**不改写、不截断、不补写**一个字。
- 中文译文只出现在**人工逐条翻译过**的条目上：卡片有「中文」胶囊 ⟺ 详情里真有译文块
  （构建自检与 `npm run verify` 双向断言，两个方向都查）。取不到译文就什么都不渲染，
  **不机翻、不占位**。译文与英文原文并列展示，原文永远在上、一个字都不删。
- `FAQPage` 结构化数据**从页面可见的 `<details>` 文案反向解析**生成，保证两者逐字一致
  （构建自检会校验这一致性）。
- 页脚明确声明「本站不收录付费推广位，排序与推荐理由不出售」。

### 真浏览器验收

卡片是**固定高度**的，任何一处内容变高都会被 `overflow:hidden` 静默裁掉；logo 簇是 hover
展开的，很容易把标题挤到换行、把网格行高顶动。这两类问题静态检查都看不见，所以有
`npm run verify`：起一个本地服务器 + Edge 无头浏览器，跑 55 项断言——
无 JS 时的静态骨架、卡片高度是否统一、**每张卡最后一个元素有没有越过内边距**、
hover 前后卡片高/logo 簇宽/标题宽是否一致、弹层、筛选、排序、搜索、移动端横向溢出、
中文译文的展示与折叠、外部请求数、JS 报错数。

### 无障碍与 OG 图

- `og-image.png` 由 `scripts/lib/og-image.js` 用 Node 内置 `zlib` 手写 PNG 编码生成
  （1200×630），文字用内置 5×7 点阵字模绘制。**取舍**：点阵字模只能绘制 ASCII，因此分享图
  只画品牌标记与站点名，不做中文排版——换来的是构建仍然零外部依赖、CI 无需装图像库。
  自检会校验 PNG magic、IHDR 尺寸，以及三处文字确实绘制成功（像素计数下限）。
- 首页含 `canonical`、`hreflang(zh-CN / x-default)`、`og:*`、`twitter:*`、
  `<meta name="robots" content="index, follow, max-image-preview:large">`。
- `robots.txt` 显式放行主流 AI 爬虫（GEO 意图声明）。

## 自动化与部署

- `.github/workflows/collect.yml`：每天北京时间 08:00 / 20:00 采集 → 校验（含 strict 门禁）→ 有变化才提交 `deals.json`。
  采集步骤为 `node scripts/collect.js --headless`（静态来源 + 无头来源），前面会安装 playwright 自带
  chromium（失败不阻断），运行结果汇总到该次运行的 **Summary** 标签页。
- `.github/workflows/probe-sources.yml`：**手动触发**的只读探针，验证 Actions 出口 IP 能否访问/渲染
  智谱活动页与火山方舟（厂商风控或镜像变更后用它复检）。
- `.github/workflows/deploy.yml`：`push` 到 master 时**纯发布**（不再在构建期采集），组装 `dist/` 后部署到 Pages。
- 采集与发布分离，保证线上产物可复现；`validate.js` 零依赖，发布前无需 `npm install`。

> ⚠️ **为什么部署还要监听 `workflow_run`**
> GitHub 规定：用仓库自带的 `GITHUB_TOKEN` 推送所产生的事件**不会**再触发其它 workflow。
> 所以 collect.yml 里机器人提交 `deals.json` 后，`push` 事件唤不醒 deploy.yml，线上不会更新。
> 因此 deploy.yml 额外监听 `workflow_run: Collect AI Deals completed` 把这条链路补上；
> 采集任务失败时（例如 strict 门禁没过）跳过发布，线上保留上一份好数据。

### 更新频率一览

| 内容 | 更新方式 | 频率 |
|---|---|---|
| 采集到的优惠 / 工具条目（静态来源） | 自动（GitHub Actions 定时） | 每天 2 次（北京 08:00 / 20:00）；数据无变化则不提交 |
| 无头来源（智谱活动页 / 火山方舟） | 自动（同上，跑在同一次采集里） | 每天 2 次；内核装不上或页面改版时该来源产出 0 条，不会写坏数据 |
| 线上页面 | 自动（提交后经 `workflow_run` 触发部署） | 跟随采集，或任意一次 `push` |
| 过期优惠下架 | 自动（每次采集时修剪） | 过期超过 14 天的优惠被移除 |
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
