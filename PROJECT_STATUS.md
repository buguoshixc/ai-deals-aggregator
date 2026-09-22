# AI 优惠聚合器 — 项目状态

**最后更新**：2026-09-22
**项目地址**：https://buguoshixc.github.io/ai-deals-aggregator/
**仓库**：https://github.com/buguoshixc/ai-deals-aggregator

---

## 一、目标与当前状态

**目标**：浏览器打开即用的静态站点，展示国内外 AI 大模型的**真实优惠**——新用户免费额度、免费模型、
学生 / 教师 / 非营利折扣、限时促销。

| 维度 | 改造前 | 现在 |
|---|---|---|
| 网站可访问 | ✅ GitHub Pages | ✅ 不变（仍是静态站，零构建） |
| 数据契约 | 裸数组，`discount` 字段语义混装 | v2 契约（`type` / `region` / `pricingModel` / `discountInfo` / `validity`），有校验 |
| 真实优惠 | 11 条（13.6%） | **71 条**（占全部条目 59%） |
| 国内数据 | 0 条 | **51 条**（厂商官方免费额度与免费模型） |
| 垃圾数据 | 15 条（CSS / 导航文本） | **0 条**（正则拦截 + 否定语境识别，校验不过不发布） |
| 默认视图 | 全部条目混在一起 | 只显示真实优惠，「全部工具」独立 Tab |
| 默认视图密度 | 同一张官方表格摊成 N 张几乎相同的卡片（千帆 17 张卡共用 1 个落地页） | **折叠为一张卡片**：71 条优惠 → 53 张卡片（见 2.10） |
| 落地页 | 26 条指向聚合站同一页 | 优惠条目 100% 指向厂商官方页，聚合站降级为署名 |
| 自动化 | 采集与部署互相耦合，构建期抓取 | 采集 / 发布职责分离，发布不再依赖网络抓取 |
| JS 渲染的公开页 | 一律放弃，只能人工策展 | 无头浏览器采集，火山方舟/智谱活动页已自动化（CI 每天 2 次） |
| 质量门禁 | 无 | `npm test`（零依赖）+ strict 内容指标，部署前强制 |
| 卡片信息层级 | 标题 + 段落文字，需逐字阅读 | 价格阶梯 / 频率标签 / 特性 chip / 核验日期 / 全宽 CTA（可扫读） |
| 可发现性 | 纯 JS 渲染，爬虫看到「加载数据中…」 | 发布产物含完整静态正文 + canonical / hreflang / og / 4 段 JSON-LD / FAQ / og 图 |

---

## 二、这次做了什么

### 2.1 数据契约与校验（P0）

- `scripts/lib/schema.js`：v2 契约的构造与校验。`makeDeal()` 是唯一入口，任何采集器不得自行拼字段。
- `deals.json` 改为 `{ schemaVersion, updatedAt, count, deals: [] }`，时间统一北京时间。
- `scripts/validate.js`：**零依赖**门禁，校验 schema、id 唯一、URL 协议、垃圾特征、分类枚举、
  前端内联脚本语法；`--strict` 另查内容指标。部署流水线直接调用它，因此发布无需 `npm install`。
- `scripts/migrate.js`：一次性把旧的 81 条数据迁移清洗到 v2（报告里逐条列出丢弃原因）。

### 2.2 采集器重构（P1）

旧代码的问题：三个采集器各写各的字段、选择器靠猜、零产出也留在流程里。

新结构：注册表 + 统一归一 + 去重 + 熔断 + 报告。

```
scripts/collectors/
  index.js                 注册表（只登记实测有产出的来源）
  cn_docs.js               国内：百度千帆 / 阿里云百炼 / 智谱
  global_deals.js          国外真实优惠：Layer3Labs 折扣表
  global_directories.js    国外目录站：aitools.fyi / Futurepedia / Futuretools
scripts/lib/
  schema.js  store.js  dedup.js  classify.js  official.js  http.js  report.js  curated.js
```

关键机制：

- **写盘熔断**：新采条目少于既有数据的 30% 时告警并合并保留，不会把站点写空。
- **既有数据每次体检**：垃圾条目自动退役、分类按当前规则重算（修掉了"改了规则对旧数据无效"的坑）。
- **否定语境识别**：折扣表里写着"No standing public discount was listed"的行，不会被误判成优惠。
- **官方页解析**：聚合站条目优先取行内官方链接，缺链接时查 `data/official_urls.json` 映射。
- **去重**：稳定 `id` + 标题别名表；`validate.js` 会提示"疑似同一优惠未合并"，提醒补别名。

### 2.3 国内数据（P2）

原 `cn_sources.js` 的选择器（`.model-card` / `.discount-badge` 等）在任何真实页面上都不存在——实跑返回 0 条。

实测后重新选源，**只抓官方文档里的"免费额度 / 免费模型"**，不抓价格表（价格表会让站点退化成工具介绍）：

| 来源 | 抓取内容 | 产出 |
|---|---|---|
| 百度千帆 | 官方「新用户免费额度」表（服务名称 / 赠送 Tokens / 有效期） | 17 条 |
| 智谱AI | 模型总览页里所有指向 `/models/free/` 的免费模型（GLM-4.7-Flash、CogView-3-Flash、CogVideoX-Flash 等） | 7 条 |
| 阿里云百炼 | 官方帮助文档「新人免费额度」 | 1 条 |
| 人工策展 | 火山方舟、腾讯混元、讯飞、Kimi、商汤、硅基流动、阶跃星辰、百川等抓不到的官方优惠 | 9 条 |

**已实测淘汰**：`bigmodel.cn/pricing`（3.8KB SPA 空壳）、`qianfan.cloud.baidu.com/pricing`（选择器不存在）、
火山引擎文档（11KB JS 空壳）、DeepSeek / Moonshot 定价页（纯价格表，0 条优惠信号）、
AppSumo（客户端渲染，0 产出）、Product Hunt deals（403）。

> 结论：国内厂商页面普遍 JS 渲染 + 需登录，**自动采集只能覆盖一小部分，人工策展是主力**。
> 项目提供了 `scripts/tools/` 三个探测工具（`inspect-source` / `find-offers` / `term-count`）来快速判断某个源值不值得写采集器。

### 2.4 前端（P3）

保持原生 HTML/CSS/JS 单文件、零构建（这是它能在 Pages 上稳定运行的根本原因），做了这些改动：

- **严格模式**：默认 Tab 只显示 `type: "deal"` 且未过期的优惠；"全部工具"独立 Tab。
- **分面筛选**：地区（国内 / 国外）、分类（固定 12 类枚举）、搜索、排序（即将截止 / 最近更新 / 名称）。
- **视觉层级**：优惠徽章红底高亮，定价模式灰字，国内 / 国外颜色区分，`≤7 天` 截止高亮。
- **安全修复**：原 `escapeHtml` 用于 `href` 属性不转义引号，存在属性注入风险；现在 URL 走 `http(s)` 白名单 + `escapeAttr`。
- **"最后更新"改为读数据里的 `updatedAt`**（原来显示的是浏览器当前时间，与数据无关）。
- 补齐 meta description / OG / favicon / robots.txt / sitemap.xml 与空状态、加载态、错误态。

### 2.5 自动化与部署（P4）

改造前：`deploy.yml` 在构建期跑一次采集，并把整个仓库（含 `node_modules`、脚本、文档）作为 Pages 产物上传；
同时 `collect.yml` 也在采集——两处采集、产物不可复现。

现在：

- `collect.yml`：每天北京时间 08:00 / 20:00 采集 → `validate`（含 strict 门禁）→ 有变化才提交 `deals.json`。
- `deploy.yml`：`push` 到 master 时**纯发布**。调用 `node scripts/tools/build-local.js` 组装 `dist/`
  （只有 6 个公开文件，约 80 KB），零依赖、不联网抓取。
- 本地 `npm run build` 与 CI 走**同一个脚本**，避免"本地通过、线上失败"。

### 2.6 修复：机器人提交无法触发部署（上线后发现）

GitHub 规定——**用仓库自带的 `GITHUB_TOKEN` 推送产生的事件不会再触发其它 workflow**。
原来的链路是「collect.yml 提交 → push 事件 → deploy.yml 部署」，实际跑下来这条链路是断的：

```
Collect AI Deals   7754087  schedule  2026-09-21T03:28Z   → 提交了 76ee1e5
                    ↑ 76ee1e5 之后没有任何 Deploy 运行
```

也就是说**自动采集能把数据写进仓库，但线上站点不会更新**，只有人工推送才会更新网站。

修复：`deploy.yml` 额外监听 `workflow_run: Collect AI Deals completed`（该事件由 workflow 完成触发，
不受 `GITHUB_TOKEN` 限制），并在采集任务失败时跳过发布，线上保留上一份好数据。

---

### 2.7 新增：无头浏览器采集（JS 渲染的公开页）

**背景**：国内厂商的活动页/产品页多为 SPA，静态 `fetch` 只能拿到几百字节空壳（`cheerio` 解析 0 条），
因此 `bigmodel.cn/pricing`、`volcengine.com/product/ark` 这类页面此前被判"零产出"淘汰，只能人工策展。

**做法**：`scripts/lib/browser.js`（playwright-core + 本机已装 Edge/Chrome，不下载内核）把页面渲染完再取 DOM，
新增 `scripts/collectors/headless.js` 两个来源：

| 来源 | 抓取内容 | 产出 |
|---|---|---|
| 智谱AI活动页 | 官方价格页营销位：新用户 2000 万 Tokens、邀请返 Tokens、GLM-5.3-Flash 限时五折、Batch 五折、缓存限时免费 | 5 条 |
| 火山方舟 | 产品页「免费额度」表（文本/图像/语音/向量/联网插件，共 10 个模型额度）+ 最新活动（协作奖励计划、Agent Plan） | 12 条 |

关键约束（都写进了代码注释）：

- **只抓公开页，不做登录态抓取**：不加载 profile、不注入 cookie、不传凭据。
- **默认不加载**：只有 `collect.js --headless` 才 require 无头来源；`validate.js` 依旧零依赖，
  不带 `--headless` 的调用完全不依赖 `playwright-core`。
- **规则驱动、失败安全**：每条产出对应官网一句原文正则；页面改版导致不命中时产出为 0，不猜测、不拼接。
- **宁可漏采也不发坏数据**：免费额度表的分项按下标配对，对不上且模型非单个时整行跳过。

**踩到的四个坑**（都已修）：

1. `innerText` 取不到 `display:none` 的活动横幅 ⇒ 新增 `domText`（整个 DOM 的文本）专门用于规则匹配，
   `text`（innerText）仍用于"用户可见正文"探测。
2. 免费额度表的模态列带 `rowspan="4"` ⇒ 后续数据行只有 2 个 `<td>`，被"至少 3 列"的守卫整行误杀，
   漏掉 3 条语音额度。
3. 额度单元格里是多个分项（如"5000字符"+"10复刻声音"）⇒ 模型 1 个、额度 N 段时合并描述，
   模型 N 个、额度 N 段时按下标配对。
4. **`networkidle` 不能当主等待策略** ⇒ 有长轮询/埋点请求的 SPA 永远等不到 idle，超时后代码又调了一次
   `page.goto`，等于把页面重新加载一遍，只等 1.5s 就抓 DOM ⇒ 拿到空壳。改为 `domcontentloaded`
   + 显式等待目标文案（`waitForText`），不但修好了，耗时也从 28–50s 降到 4–8s。

**CI 可达性实测**（`.github/workflows/probe-sources.yml`，只读、手动触发）：

| 项 | 结果 |
|---|---|
| Actions 出口 IP | `135.232.201.85` |
| `bigmodel.cn/pricing` 直连 | HTTP 200 / 4301 bytes（正常 SPA 空壳，**无风控特征**） |
| `volcengine.com/product/ark` 直连 | HTTP 200 / 168969 bytes，**无风控特征** |
| 火山方舟在 CI 的产出 | 12 条（与本地一致） |
| 智谱AI活动页在 CI 的产出 | 首轮 0 条 → 定位为上面的坑 4，已修复；复测运行 [#35612557532](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/35612557532) 全绿，两来源总耗时从 49.7s 降到 18s |

结论：**机房 IP 没有被拦**，把无头来源接进 `collect.yml` 在可达性上没有障碍。

**边界**：无头来源最初只在本地手动跑，现已**接入 `collect.yml`**（见 2.8），与静态来源在同一次采集里
每天自动跑 2 次；内核安装步骤是 `continue-on-error`，装不上时该来源产出 0 条而不拖垮静态链路。
每次运行的 Summary 会打印各来源产出，零产出能立刻被发现。

**DeepSeek 的结论**：官网（`www.deepseek.com`）与 API 文档（`api-docs.deepseek.com`）用无头浏览器渲染后
**依然是 0 条优惠信号**——定价页只有"扣减…将从充值余额或赠送余额中扣减"这类计费说明，不是可领取的公开额度。
按"零产出的采集器不上线"原则**不注册采集器**，如需收录只能人工策展。

---

### 2.8 无头来源接入 CI

探针实测确认机房 IP 可达后，`collect.yml` 改成：

1. runner 钉 `ubuntu-24.04`（避免 `ubuntu-latest` 迁到 Ubuntu 26 后浏览器系统库变化）
2. `actions/checkout@v5` / `actions/setup-node@v5` + `node-version: '24'`（消除 Node 20 弃用警告）
3. 新增 `Install browser for JS-rendered sources`：按 `playwright-core` 的版本号安装自带 chromium，
   **`continue-on-error: true`**——装不上时无头来源各自报错、产出 0 条，静态来源照常跑，不会拖垮主链路
4. 采集步骤改为 `node scripts/collect.js --headless`，并加 `set -o pipefail` 与 `tee`，
   保证采集失败不会被管道掩盖
5. 新增 `Publish run summary`（`if: always()`）：把各来源产出、零产出告警、熔断告警写进运行 Summary，
   某天某个来源零产出时不用翻日志就能看见

`deploy.yml` 未改动（纯发布路径保持原样）。

---

### 2.9 新增：卡片信息架构 + SEO/GEO 静态骨架

**背景**：与同类站点（devtk.ai 的优惠页）逐项对比后确认，我们的**数据侧明显更强**（优惠 71 条 vs 18 条、
国内 51 条对方几乎空白、全自动采集 vs 人工维护），但**产品侧与可发现性明显更弱**：
卡片把信息压成等权重的连续文本（阅读式而非扫描式）、没有价格阶梯与核验日期、CTA 是页脚文字链；
页面内容全靠 JS 运行时渲染，爬虫拿到的是「加载数据中…」；没有 canonical / JSON-LD / og 图 / FAQ。

**这次把这 7 项补齐**（1–4 卡片信息架构，5–7 SEO 基建）：

| 项 | 做法 |
|---|---|
| ① 特性标签 | v2 契约新增 `features`（≤3 个、每个 ≤20 字），卡片渲染为 chip；无标签时回退 `discountInfo` |
| ② 核验日期 | 新增 `verifiedAt`；**只有人工逐条回访官方页的条目显示「已核验」**，自动采集条目显示「数据更新：{lastSeen}」 |
| ③ 价格阶梯 | 新增 `priceLine`；无可靠来源时为 `null`，卡片不渲染该行（不编造升级路径） |
| ④ CTA 按钮化 | 页脚文字链改为卡片底部全宽实心按钮「获取优惠 →」 |
| ⑤ FAQ + FAQPage | 页面新增 4 条可见问答；`FAQPage` 结构化数据**从可见文案反向解析生成**，构建自检校验逐字一致 |
| ⑥ canonical / hreflang / og / twitter / 结构化数据 | 补 canonical、`hreflang(zh-CN / x-default)`、`og:*`、`twitter:*`、`max-image-preview:large`；4 段 JSON-LD（Organization / BreadcrumbList / FAQPage / ItemList）；零依赖生成的 `og-image.png`（1200×630） |
| ⑦ robots.txt | 显式放行 GPTBot / ClaudeBot / PerplexityBot / Google-Extended 等 11 个爬虫，声明 GEO 意图 |

**关键设计：预渲染，但不引入第二份模板**

发布产物 `dist/index.html` 现在含**完整静态正文**——不执行 JS 也能读到 71 张卡片的标题、价格、
标签与官方链接（爬虫/生成式引擎视角与用户一致）。做法是在 `index.html` 里划出一块
`RENDER-CORE` 纯函数区，构建脚本按标记抽出、在**无 DOM 的 vm 沙箱**里求值后调用同一个
`cardHtml()` 生成静态卡片。因此「构建期渲染」与「浏览器渲染」是**同一份模板**，不会分叉；
一旦有人在区块里引用 `document` / `window` / `state`，构建立即失败，而不是悄悄产出坏页面。

产物自检新增断言：预渲染卡片数下限（2.9 上线时为 ≥60，2.10 折叠后下调为 **≥45**）、CTA 数不少于卡片数、
无 `PRERENDER`/`__SITE_URL__` 残留、4 段 JSON-LD 均可 `JSON.parse`、FAQ 可见文案与结构化数据逐字一致、
`og-image.png` 为合法 PNG 且 1200×630。

**诚实性红线（与竞品的差别，刻意保留）**

- 不把「抓到过」说成「核验过」：只有 23 条人工策展条目显示核验日期。
- 看不到升级路径就不写价格阶梯；没有可信标签就不写特性标签（**不从 `description` 自动切分**）。
- 不收录付费推广位；页脚明写「排序与推荐理由不出售」。

**取舍**：`og-image.png` 用 Node 内置 `zlib` 手写 PNG 编码 + 5×7 点阵字模生成。点阵字模只能画
ASCII，所以分享图只排品牌标记与站点名，不做中文排版——换来构建仍然零外部依赖（CI 不需要装图像库）。

**顺带修正**：`serve.js` 新增 `--dir=` 以便直接预览发布产物；修正分类下拉被误标为「地区」的
`aria-label`；`.github/workflows` 未改动（`build-local.js` 依旧零依赖，`dist/` 仍是产物路径）。

**验证**（本机 Edge + playwright-core 实测）：

| 场景 | 结果 |
|---|---|
| 不执行 JS 读取 `dist/index.html` | 71 张卡片、71 个 CTA、完整正文可见 |
| 浏览器默认视图 | 71 卡片 / 53 特性 chip / 3 价格行 / 23 条「已核验」/ 48 条「数据更新」 |
| 全部工具 Tab | 121 条（含 50 条工具） |
| 搜索 | 「学生」命中 8 条；「tokens」命中 25 条（特性标签已参与搜索） |
| 地区筛选 | 国内 51 条，全部带国内徽章 |
| 页面控制台错误 | 0 |

> 注：本节的卡片数是 **2.9 上线时的状态（71 张）**。2.10 折叠上线后默认视图为 **53 张卡片**，
> 「全部工具」Tab 由 121 条变为 **103 张卡片**，地区筛选国内由 51 条变为 **33 张**——
> 这些都是呈现粒度变化，`deals.json` 本身一条未动。

---

### 2.10 新增：同一官方页面的「一张表」折叠为一张卡片

**背景**：71 条优惠里有 41 条（58%）来自三个「表格型」来源。问题最突出的是百度千帆——17 条数据的
`discountInfo` / `eligibility` / `validity` / `url` **逐字相同**，连 CTA 都指向同一个链接，只有标题里的
模型名不同，等于把同一张官方表格的 17 行摊成了 17 张几乎一样的卡片。火山方舟同样 12 张卡共用 1 个落地页。

而同一个 `cn_docs.js` 里，阿里云百炼（同样来自官方帮助文档的一张表）却被处理成 **1 条汇总条目**：
**采集器内部对「一张表」给出了两种答案。**

一度考虑过「以厂商作为一级分类」，实测数据否决了这个方案：

| 考察项 | 数据 |
|---|---|
| 厂商维度长尾 | 121 条里有 **78 个 vendor 名，其中 71 个只有 1 条**；71 条优惠来自 28 个厂商名，21 个只有 1 条。按厂商分组会得到 78 个分组头、71 个下面只挂一张卡 |
| 厂商字段未归一 | 同时存在 `火山引擎` 与 `火山引擎（字节跳动）`，同一家公司会被拆成两组 |
| 厂商 ≠ 模型厂商 | 千帆那 17 条里含 `DeepSeek-R1` / `Kimi-K2-Instruct` / `Qwen3-235B`，是**第三方模型托管在千帆平台上**，按公司分组会产生语义混乱 |

最终确立的规则：**一个官方页面上的一张表 = 一条优惠**，且在**渲染层折叠**，不动数据契约。

**做法**（`index.html` 的 `RENDER-CORE` 区新增纯函数，构建期与浏览器共用同一份，不会分叉）：

| 函数 | 职责 |
|---|---|
| `foldKey()` | 折叠键 = 厂商 + 落地页 + 优惠文案 + 适用条件 + 有效期；`type !== 'deal'` 或缺 `vendor`/`url` 时返回 `null`，即不折叠 |
| `foldDeals()` | 折叠入口；**单成员组原样返回、不改写任何字段**，因此非重复条目与工具条目渲染结果逐字节不变 |
| `commonSuffix()` / `boundarySuffix()` | 求公共后缀；后者只取「以空格开头」的那一段 |
| `foldTitle()` | 组标题 = 显示名（来源名，人工策展退回厂商名）+ 公共后缀，重名时两级降级 |
| `modelsHtml()` | 模型清单：一个纯文本 `div` + `data-model-count`，**不新增任何 CSS** |
| `defaultCards()` | `defaultOrder(foldDeals(defaultVisible(deals)))`——预渲染与浏览器的**唯一入口** |

**两个关键设计**

- **边界安全后缀**。若用无约束的最长公共后缀，`Doubao-流式语音识别 免费额度` 与
  `Doubao-录音文件识别 免费额度` 会剥出 `Doubao-流式语音`、`Doubao-录音文件`——把共享的「识别」
  一起切掉了。改为只从「以空格开头」处切分，剥出的是**完整模型名**。这是本项目「只取原文事实、
  不生成近似内容」这条红线的直接推论。
- **无损断言**。`build-local.js` 新增 `Σ(卡片模型数) === 未过期优惠条数`，不等即**构建失败**。
  这比「卡片数 ≥ N」这类魔法数字更能抓住真正的失效模式（折叠丢条目），也是把
  `MIN_PRERENDERED_CARDS` 从 60 下调到 45 的底气所在。

**结果**

| 指标 | 折叠前 | 折叠后 |
|---|---|---|
| 默认视图卡片 | 71 | **53** |
| 百度千帆 | 17 张卡（共用 1 个落地页） | **1 张卡，卡内 17 个模型** |
| 火山方舟 | 12 张卡（共用 1 个落地页） | **10 张卡**（其中 2 张折叠卡各 2 个模型） |
| CTA 按钮 | 71 | 53（每卡一个） |
| 「数据更新」标识 | 48 | 30（21 条自动条目折成 3 张卡） |
| 特性 chip / 价格行 / 「已核验」 | 53 / 3 / 23 | **53 / 3 / 23（完全不变）** |
| `deals.json` | 121 条 | **121 条（零改动）** |

**代价与对冲**

- **SEO 长尾**：合并会损失「模型名 + 免费额度」这类独立标题。对冲方式是折叠卡把 **17 个模型名全量
  写进静态正文**，`ItemList` 的一条 `ListItem` 也带上 `description: "覆盖 N 个模型：…"`。实测线上
  产物仍可检索到 `ERNIE-4.5-Turbo-VL`、`Doubao-录音文件识别`。
- **搜索语义**：搜索是「先筛选、再折叠」，所以搜 `ERNIE` 得到 1 张折叠卡、卡内只列命中的 4 个模型；
  但若命中来自 `discountInfo`（如搜 `tokens`），卡片会列出该组全部 17 个模型。这是刻意取舍：
  保留上下文，代价是不高亮具体命中项（`matchedModels` 字段评估后未实现，因为它与 `models` 高度重合）。

**顺带修正**：`build-local.js` 的 CTA 自检原用 `/class="cta"/g`，会把内联脚本里的模板字符串字面量
也算进去，使 CTA 计数**恒定虚高 1**——意味着「少渲染一个 CTA」永远查不出来（53 个里少 1 个仍是
53 ≥ 53）。已改为只匹配渲染结果 `class="cta" href="https?:`；折叠卡计数同一个坑一并修正。

**验证**（本机 Edge + playwright-core 实测发布产物）

| 场景 | 结果 |
|---|---|
| `npm test` / `npm run test:strict` | 全绿，指标原样（总 121 / 优惠 71 / 国内 51）——`validate.js` **未改动** |
| `npm run build` | `卡片预渲染: 53 条`，自检全绿；`✓ 折叠无损: 53 张卡片覆盖 71 条优惠（3 张折叠卡 / 21 个模型名）` |
| 不执行 JS 读取 `dist/index.html` | 53 张卡片、53 个 CTA、模型名全部在静态正文里 |
| 浏览器默认视图 | 53 卡片 / 3 折叠卡 / 53 特性 chip / 3 价格行 / 23「已核验」/ 30「数据更新」 |
| 搜索 | 「ERNIE」→ 1 张卡（4 模型）；「学生」→ 8 张卡；「tokens」→ 9 张卡 |
| 地区筛选 | 国内 33 张 / 国外 20 张 |
| 全部工具 Tab | 103 张卡片（含 50 条工具） |
| 确定性 | 连续两次构建 `dist/index.html` SHA256 一致 |
| 页面控制台错误 | 0 |
| 线上 GitHub Pages | 53 张卡片 / 3 折叠卡；(53−3)+21 = **71**，与 `deals.json` 无损对齐 |

**明确不做**（留作独立议题）：智谱那 7 条「XX 免费模型」不合并——它们 `url` 各不相同（8 个落地页），
不属于「同一张表」，要合并得另写一条厂商级策略。

**交接**：模型清单的样式（chip / 截断 / 展开）刻意留给后续单独处理，本次不含任何视觉设计。
挂载点：`.deal-models`、`[data-model-count]`、`foldTitle()` 里的后缀函数、`cardHtml()` 中
`modelsHtml(deal)` 的位置。

**改动范围**：`index.html`（+181 行）与 `scripts/tools/build-local.js`（+96/−36）。
`deals.json` / 采集器 / `schema.js` / `validate.js` / `.github/workflows` 零改动。

---

### 2.11 新增：前端重做为高密度分档网格 + 真厂商 logo

**背景**：线上是「一行一张卡」，1440×900 首屏只能完整看到 **1 张**卡片（卡片高度 216–330px 不等），
全部内容要滚 **15.3 屏**；
优惠与免费额度的区别也要读文字才知道。这里把「一屏能看到多少条」和「一眼能不能分出
免费 / 收费」当成两个可测量指标来解。

**做了什么**

| 项 | 之前 | 现在 |
|---|---|---|
| 布局 | 单列，卡片宽 1008px、高 228px | 1440px 下 **3 列**，卡片高 **192px**（统一） |
| 首屏完整可见卡片 | 1 张（含截断 2 张） | **9 张**（含截断 12 张） |
| 全部内容滚动 | 15.3 屏（页高 13815px） | **5.0 屏**（页高 4518px，含 FAQ + 页脚） |
| 排序依据 | 即将截止优先 | **优惠力度五档**（完全免费 → 免费额度 → 身份优惠 → 折扣促销 → 付费为主），同档内按即将截止 → 最近更新 |
| 厂商标识 | 纯文字 vendor | **29 家真厂商 logo**（官方品牌图形），折叠卡上还显示覆盖的模型家族 logo |
| 筛选 | 两个下拉 + 两个 Tab | **facet 筛选条**（已核验 / 类型 / 地区 / 厂商计数），带实时计数 |
| 详情 | 无 | 点卡片开弹层，字段原样铺开（适用条件 / 有效期 / 价格阶梯 / 核验状态 / 覆盖模型 / 来源） |

**分档规则的两次纠错**（都由报告工具查出来，不是拍脑袋）

1. 一开始只在 `eligibility` 里找身份词，结果 Replit / Zapier / Google Gemini 这类普通免费档
   被划进「身份优惠」——因为目录站抓来的适用条件写的是媒体受众词
   （`Students, solo builders, app builders…`），不是门槛。
   → 改成 **offer 侧（标题 + 优惠说明）才算身份门槛**，适用条件只作参考。
2. 修正后仍有假阳性，因为原文里就有否定句：
   `No standing public student or nonprofit discount was listed…`、
   `…says the previous student offer ended March 11, 2026`。
   → 加 **否定句剔除**（与 `schema.js` 的 `hasDiscountSignal` 同一套思路）。断句刻意手写而不用
   正则一次切完——`U.S.` 这类缩写会把句子拦腰截断，反而把否定词和它否定的对象分到两句里。

最终分布：**①完全免费 12 · ②免费额度 20 · ③身份优惠 18 · ④折扣促销 3 · ⑤付费为主 0**
（第 5 档当前无成员：默认视图里所有条目要么免费、要么有额度、要么有身份或折扣信号）。
`npm run report:tier` 会逐条列出命中的判据和判据读到的原文，调规则先看它。

**厂商 logo：全部是官方品牌图形**

* 19 条品牌矢量（simple-icons 品牌路径 + Microsoft 四色方块矢量重建）
* 19 个厂商官网文件（`openai.com` 的 apple-icon、`siliconflow.cn/logo-new.svg`、
  `portal.volccdn.com` favicon、`bigmodel.cn` favicon …）
* 构建期由 `scripts/lib/logos.js` 生成为 `dist/logos/` + `dist/logos.css`；
  页面只写 `data-logo` 属性，**不热链任何 CDN**（`npm run verify` 断言外部请求 = 0）
* 构建期断言「模板引用的 logo key 全部已登记」，缺一个直接构建失败
* 抓不到官方图形的 8 家（Midjourney 403，xAI / Mistral / Hugging Face / Ideogram /
  Leonardo / KREA / Together 连通性失败）**就是不挂 logo**，不拿近似图凑数；
  科大讯飞只有 32px favicon、商汤方形图标只有 120×184，如实记进
  `assets/logos/README.md` 的缺口表

**厂商归一**：采集来的 vendor 字符串有 78 种写法（`火山引擎` / `火山引擎（字节跳动）`、
`科大讯飞 讯飞开放平台`、`腾讯云 混元大模型`…）。RENDER-CORE 里一张有序规则表把它们归到
规范厂商，同时供**厂商筛选、卡片 vendor 行、logo 取图**三处使用。没有规则的条目原样返回，
不硬套厂商。

**架构上没有分叉**：筛选、排序、分档、渲染全部收进 RENDER-CORE 纯函数区，浏览器走
`cardsFor(deals, filters)`，构建期走 `cardsFor(deals, DEFAULT_FILTERS)`——**默认视图就是同一
函数取默认参数的那一次调用**。预渲染标记从 2 个增加到 6 个（卡片、facet 计数、顶栏汇总、
结果条、分类选项、JSON-LD）。

**修掉的两个真实缺陷**

1. 详情弹层的 logo 簇只有类名、没有布局规则，`display:grid` 的 tile 会在行内元素里**竖着叠起来**。
   由 `npm run verify` 的移动端 tile 计数异常暴露。现在弹层用独立的 `.dh-logos` 一行平铺。
2. 工具条目渲染了优惠正文块，再用 CSS `display:none` 藏掉——DOM 里存在、视觉上不存在。
   改成工具条目显示**工具简介（灰条、不加粗）**，优惠条目显示**优惠说明（档位配色竖条、
   前半句加粗）**，两者都是数据原文，视觉语言也分得开。

**验证**：新增 `npm run verify`（真浏览器 35 项断言）。卡片是固定高度，内容变高会被
`overflow:hidden` 静默裁掉，所以断言里最关键的一条是「每张卡最后一个元素的底边有没有越过
卡片内边距」——53 张卡全部通过。另有 hover 前后「卡片高 / logo 簇宽 / 标题宽」三量不变
（logo 簇的容器宽度按展开后预留，展开只填满预留空间，不挤标题、不顶网格行高）。
截图见 `mockups/.preview/site-*.png`。

`--url=` 可直接验收线上站点，部署后拿它当冒烟测试：

```bash
npm run verify -- --url=https://buguoshixc.github.io/ai-deals-aggregator/
```

密度数字的口径说明：**「首屏完整可见」= 卡片底边 ≤ 视口底边**，比「顶边在视口内」严格，
也不受亚像素取整影响。上面那组前后对比是拿同一个脚本量旧版（`3e67867` 的 index.html）
与新版各一遍得出的，不是估算。

**上线结果**：`b0b68ed` → Deploy #17 成功 → 线上 35 项断言全过
（53 张预渲染卡片 / 4 档分带 / `logos.css` 39 条规则 / `logos/openai.png` HTTP 200 / 外部请求 0 / JS 报错 0）。

**改动范围**：`index.html`（重写）、`scripts/lib/logos.js`、`scripts/lib/render-core.js`（新）、
`scripts/tools/build-local.js`、`scripts/tools/verify-site.js`（新）、
`scripts/tools/tier-report.js`（新）、`scripts/tools/fetch-logos.js`（新）、
`assets/logos/`（38 个 logo + manifest + README）、`scripts/validate.js`（预渲染标记清单）。
`deals.json` / 采集器 / `schema.js` / CI 工作流**零改动**。

---

### 2.12 新增：厂商 logo 的名称缩写兜底

**背景**：2.11 上线后卡片上只有 30 家厂商有官方品牌图形，剩下 42 家（几乎全是目录站抓来的
长尾工具）卡片上什么都不挂，`全部工具` 那一屏看起来像没做完。复查了那 5 家够不着的厂商
（见 `assets/logos/README.md` 的缺口表）之后确认本地无解，于是加一层**明确的降级**。

**规则（顺序是硬的）**

1. 拿得到官方品牌图形 → 一定用真图形；
2. 确实拿不到 → 用厂商名生成的缩写方块；
3. **两者永远不出现在同一张卡上** —— 构建期与 `npm run verify` 都断言二选一。

**缩写块怎么做成「一眼看出不是品牌图形」**

| 项 | 做法 |
|---|---|
| 取字 | 拉丁名取前两词首字母（`Wispr Flow → WF`、`Dubly.AI → DA`）；单词或中日韩名取前两字（`KREA → KR`、`商汤科技 → 商汤`）。纯函数，同名同缩写 |
| 配色 | 6 个低饱和深色按名称哈希取一个，与品牌色明显不同 |
| 标注 | `title` 与 `aria-label` 都写明「名称缩写，未取得官方品牌图形」 |
| 不复用 | 缩写块没有 `data-logo` 属性，不走 `logos.css`，不会被误当成已登记的图形 |

**结果**：72 家厂商里 **30 家用官方品牌图形、42 家用缩写兜底**（`npm run report:vendor` 可复核）。
默认视图 53 张卡片本来就全部有真图形（兜底 0 个），变化集中在 `全部工具` Tab。
42 个缩写块里有 1 组重名（`Labrynth` 与 `Leonardo AI` 都是 `LA`）——不成问题，
卡片上紧挨着就写着厂商全名，缩写块只是视觉锚点。

**验证**：`npm run verify` 从 35 项加到 **38 项**，新增的三项是
「缩写块有字 / 不裁切 / 已标注」、「官方图形与缩写块不混用」、「长尾厂商走名称缩写兜底」。


---

## 三、命令速查

```bash
npm ci                  # 安装依赖
npm run collect:dry     # 采集但不写盘，看每源产出报告
npm run collect         # 全量采集并写入 deals.json
npm run collect:headless:dry  # 额外启用无头来源（智谱活动页 / 火山方舟），不写盘
npm run collect:headless      # 额外启用无头来源并写盘（需本机 Edge/Chrome）
npm test                # 数据 + 前端校验（零依赖）
npm run test:strict     # 附加内容质量指标
npm run build           # 本地复现发布产物（含预渲染 + logo 资产）并自检
npm run verify          # 真浏览器验收（35 项断言；需 playwright-core + 本机 Edge）
npm run verify:shots    # 同上，并把截图写到 mockups/.preview/
npm run report:tier     # 分档分布 + 每张卡命中的判据 + 判据读到的原文
npm run report:vendor   # 厂商归一报告（多少种脏写法归到了同一家）
npm run fetch:logos     # 从厂商官网抓品牌图标，补进 assets/logos/
npm run serve                          # 本地预览源码目录 http://127.0.0.1:8080
node scripts/serve.js --dir=dist       # 预览发布产物（预渲染后的 index.html）

node scripts/collect.js --list                       # 已注册来源
node scripts/collect.js --only=cn_qianfan --dry-run  # 单源调试
node scripts/tools/inspect-source.js <url> --rows    # 看页面表格结构
node scripts/tools/find-offers.js <url>              # 探测页面有无优惠内容
node scripts/tools/term-count.js <url> 免费 额度      # 判断是否 JS 空壳

node scripts/lib/og-image.js --out=dist/og-image.png # 单独重新生成 OG 分享图（带像素自检）
node scripts/data/backfill-cards.js --check          # 核对策展条目的卡片字段是否齐备
```

> 新增策展条目时：先编辑 `scripts/data/curated_*.json`（含 `features`/`priceLine`/`verifiedAt`）
> → `npm run collect` 把新字段合并进 `deals.json` → `npm run build` 重新预渲染。
> 顺序不能颠倒：预渲染读的是 `deals.json`，不是策展文件（见 2.9 / 2.10）。

---

## 四、当前数据分布

| 类型 | 数量 |
|---|---|
| 总条目 | 121 |
| 真实优惠（`type: "deal"`） | 71 |
| 其中：国内 | 51 |
| 其中：国外 | 20 |
| 工具信息（`type: "tool"`） | 50 |
| 带时间信息（截止日期或有效期说明） | 52 |
| 人工核验（`verified: true`） | 23 |
| 卡片特性标签（`features`） | 23（全部为人工策展条目） |
| 价格阶梯（`priceLine`） | 3（仅官方页明确写出「免费 → 付费」的条目） |
| 垃圾条目 | 0 |

**折叠后默认视图**（见 2.10）：**53 张卡片** = 50 张单条卡 + 3 张折叠卡（百度千帆 1 张覆盖
17 个模型、火山方舟 2 张各覆盖 2 个模型）。换言之，71 条优惠里有 **18 条**是「同一张官方表格的
重复投影」。国内 33 张 / 国外 20 张。

**力度分档分布**（见 2.11）：①完全免费 12 · ②免费额度 20 · ③身份优惠 18 · ④折扣促销 3 ·
⑤付费为主 0。卡片上出现 **29 家厂商 logo**；`assets/logos/` 共登记 38 个图形
（19 个品牌矢量 + 19 个官网文件），其余为工具页备用。

来源分布：Futuretools 29 · 百度千帆 17 · aitools.fyi 15 · 人工策展（国外）14 · 火山方舟 12 ·
Layer3Labs 9 · 人工策展（国内）9 · 智谱AI 7 · 智谱AI活动页 5 · Futurepedia 3 · 阿里云百炼 1
（跨源去重后 121 条）。

分类分布：API服务 32 · 对话模型 25 · 图像绘画 19 · 办公效率 9 · 视频 8 · 编程开发 8 ·
音频语音 7 · 其他 4 · 教育学习 3 · 设计创意 3 · 智能体 2 · 搜索研究 1。

---

## 五、已知边界与后续可做

**边界**

- 需登录的页面（各家控制台）不采集，不做登录态抓取。
- JS 渲染的公开页已用无头浏览器采集并接入 CI（见 2.7 / 2.8）；渲染后仍无优惠表述的来源
  （如 DeepSeek 官网）不注册采集器，改由人工策展补。厂商改版会让某个来源产出 0 条——
  这是刻意设计的失败安全，届时用 `scripts/tools/render-source.js` 重新校准规则。
- 部分优惠的实际有效期写在控制台里（如"自开通起 3 个月"），无法从公开页拿到绝对截止日期，
  用 `validity` 字段如实描述，不编造 `expiresAt`。
- **关于 strict 门槛**：原先设想"总条数 ≥ 120"，实测后调整为 **≥ 100**。原因是实测可稳定采集的
  来源只有 7 个（目录站首页能拿到的条目本身有限），再往上只能靠堆目录站的"工具介绍"条目凑数——
  那正是本项目要修掉的问题。优惠条数（≥ 40）与国内条数（≥ 20）两个真正衡量内容价值的目标均已超额达成
  （实际 71 / 51）。

**后续可做（按价值排序）**

1. **继续扩充人工策展**：腾讯混元、讯飞星火、MiniMax、硅基流动、魔搭、月之暗面等
   的新用户额度与免费模型；国外 AppSumo 的 lifetime deal、各大云的 AI startup credit 计划。
   这是提升"优惠条数"最有效的路径——比再写十个脆弱采集器更靠谱。
   （火山引擎与智谱的活动页已改由无头采集器覆盖，见 2.7。）
2. **给无头来源加健康度监控**：现在只有 Summary 里的零产出提示（人工看）。可做"连续 N 次零产出
   就在 Actions 里失败/开 issue"，让改版导致的失配自动浮出来。
3. **过期信息的自动降级**：`expiresAt` 到期后自动从默认视图移除（已实现），可再加"最近过期"归档页。
4. **来源健康度监控**：采集报告落库，某个源连续 N 天零产出就报警。
5. **自定义域名**：目前用 `buguoshixc.github.io/ai-deals-aggregator/`，如需绑域名需另行配置 CNAME。
   （绑域名后记得同步 `build-local.js` 里的 `SITE_URL`，canonical / og:url / sitemap 都由它生成。）
6. **用户反馈入口**：卡片上加"信息有误"链接，跳 GitHub Issue 模板。
7. **`deploy.yml` 同步收尾**：把它的 `checkout@v4` / `setup-node@v4` 也升到 `@v5`、runner 钉版本，
   与 `collect.yml` 保持一致（纯清理，不影响发布逻辑）。
8. **给自动采集条目补 `features`**：目前 48 条自动条目没有特性标签，卡片回退展示 `discountInfo`。
   若能为常见来源（百度千帆、火山方舟）写规则化的标签提取，卡片整齐度会再上一个台阶——
   但必须遵守"只取原文事实、不生成近似内容"的约束（见 2.9 诚实性红线）。
9. **`priceLine` 覆盖率**：目前只有 3 条。可在日报价页明确给出档位时补，不必强求。
10. **i18n**：已预留 `hreflang` 结构（`zh-CN` + `x-default` 自指）。若要做英文站，
    加 `en` 版本并补 `hreflang="en"` 即可，无需返工现有结构。
11. ~~**折叠卡的模型清单样式化**~~ —— **2.11 已做**：折叠卡上显示覆盖的模型家族 logo（最多 4 个 +
    `+N`），旁边一枚「N 个模型共用额度」的 chip，点击卡片在弹层里列出全部模型名。
    卡片正文里不再铺 17 个模型名（放不下），模型名保留在 JSON-LD 的 `ItemList.description` 里。
12. ~~**厂商筛选器**~~ —— **2.11 已做**：筛选条上有按条数排序的厂商 facet（≥2 条的才出现，
    最多 6 个），底层是 RENDER-CORE 里的 `VENDOR_RULES` 归一表（78 种脏写法 → 规范厂商）。
    归一表同时给卡片 vendor 行与 logo 取图用。
13. **`eligibility` 筛选器**：学生 / 教师 / 新用户 / 初创 / 非营利是这类站点最真实的检索意图之一。
    2.11 的「身份优惠」档只是它的近似（18 张卡），真正按身份筛需要先把 `eligibility` 补齐
    （目前 71 条优惠里仍有一部分为空）。
14. **智谱免费模型的厂商级合并**：那 7 条「XX 免费模型」`url` 各不相同，不属于「同一张表」，
    2.10 刻意没有合并。要合并需另写一条厂商级策略（与「同源折叠」是两回事，不要混在一个函数里）。
15. **还有 5 家厂商只有名称缩写兜底块、没有官方图形**（数据里有条目）：Midjourney（官网 403，
    页面内联 favicon 经画布校验是整张透明的占位图）、xAI / Ideogram / Leonardo / KREA（官网域名
    解析异常，强制 IPv4 与真浏览器均超时）。**这 5 家的官网在本机网络下不可达，本地无解**，
    需要在能正常解析的网络里取；判定依据与探针输出见 `assets/logos/README.md`。
    Hugging Face / Mistral / Together 的官方品牌图形已经拿到并登记，但数据里还没有这三家的条目。
    另外科大讯飞只有 32px favicon、商汤方形图标只有 120×184，需要向品牌方要矢量素材。
16. **`deals.json` 的体积**：`dist/index.html` 155 KB（预渲染 53 张卡 + 内联脚本）。
    GitHub Pages 会 gzip，实际传输约 30 KB；如果继续增长，可把内联脚本拆成外部文件换取缓存命中。

---

## 六、技术栈

- **前端**：原生 HTML + CSS + JavaScript（单文件，零构建）；1440px 下三列高密度卡片网格，
  档位分带 + facet 筛选条 + `<dialog>` 详情弹层
- **厂商 logo**：`assets/logos/manifest.json` 登记 → `scripts/lib/logos.js` 构建期生成
  `dist/logos/`（品牌矢量现场生成 SVG）+ `dist/logos.css`；不热链 CDN
- **采集**：Node.js 20+ / axios / cheerio，自建 http 封装（UA、超时、重试、并发限流、robots.txt）
- **无头采集**：playwright-core + 本机 Edge/Chrome（本地）/ playwright 自带 chromium（CI），不下载多余内核
- **校验**：自建零依赖校验脚本（`scripts/validate.js`）
- **预渲染**：`scripts/lib/render-core.js` 用 `vm` 沙箱抽出主页面里的 RENDER-CORE 纯函数区求值
  （构建期与浏览器端共用同一份模板）；默认视图由唯一的 `cardsFor(deals, DEFAULT_FILTERS)` 产出：
  **过滤 → 折叠同源 → 打档位 → 排序**
- **真浏览器验收**：playwright-core + 本机 Edge，35 项断言（`scripts/tools/verify-site.js`）
- **OG 分享图**：Node 内置 `zlib` 手写 PNG 编码 + 内置 5×7 点阵字模（零外部依赖）
- **部署**：GitHub Actions → GitHub Pages
- **存储**：静态 `deals.json`（v2 契约，前端新增的档位/logo 均为**派生**，不写回数据）
