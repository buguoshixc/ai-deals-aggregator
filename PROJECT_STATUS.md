# AI 优惠聚合器 — 项目状态

**最后更新**：2026-09-21
**项目地址**：https://buguoshixc.github.io/ai-deals-aggregator/
**仓库**：https://github.com/buguoshixc/ai-deals-aggregator

---

## 一、目标与当前状态

**目标**：浏览器打开即用的静态站点，展示国内外 AI 大模型的**真实优惠**——新用户免费额度、免费模型、
学生 / 教师 / 非营利折扣、限时促销。

| 维度 | 改造前 | 现在 |
|---|---|---|
| 网站可访问 | ✅ GitHub Pages | ✅ 不变（仍是静态站，零构建） |
| 数据契约 | 裸数组，`discount` 字段语义混装 | v2 契约（`type` / `region` / `priceModel` / `discountInfo` / `validity`），有校验 |
| 真实优惠 | ~11 条（13.6%） | **29 条**（占全部条目 35%） |
| 国内数据 | 0 条 | **20 条**（含厂商官方免费额度与免费模型） |
| 垃圾数据 | 15 条（CSS / 导航文本） | **0 条**（有正则拦截，校验不过不发布） |
| 默认视图 | 全部条目混在一起 | 只显示真实优惠，"全部工具"独立 Tab |
| 落地页 | 26 条指向聚合站同一页 | 优惠条目 100% 指向厂商官方页，聚合站降级为署名 |
| 自动化 | 采集与部署互相耦合，构建期抓取 | 采集 / 发布职责分离，发布不再依赖网络抓取 |
| 质量门禁 | 无 | `npm test`（零依赖）+ strict 内容指标，部署前强制 |

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
| 阿里云百炼 | 官方帮助文档「新人免费额度」 | 1 条 |
| 智谱AI | 官方文档标注的免费大模型 GLM-4-Flash | 1 条 |
| 人工策展 | 火山引擎等抓不到的官方优惠（`scripts/data/curated_cn.json`） | 1 条 |

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

---

## 三、命令速查

```bash
npm ci                  # 安装依赖
npm run collect:dry     # 采集但不写盘，看每源产出报告
npm run collect         # 全量采集并写入 deals.json
npm test                # 数据 + 前端校验（零依赖）
npm run test:strict     # 附加内容质量指标
npm run build           # 本地复现发布产物并自检
npm run serve           # 本地预览 http://127.0.0.1:8080

node scripts/collect.js --list                       # 已注册来源
node scripts/collect.js --only=cn_qianfan --dry-run  # 单源调试
node scripts/tools/inspect-source.js <url> --rows    # 看页面表格结构
node scripts/tools/find-offers.js <url>              # 探测页面有无优惠内容
node scripts/tools/term-count.js <url> 免费 额度      # 判断是否 JS 空壳
```

---

## 四、当前数据分布

| 类型 | 数量 |
|---|---|
| 总条目 | 82 |
| 真实优惠（`type: "deal"`） | 29 |
| 其中：国内 | 20 |
| 其中：国外 | 9 |
| 工具信息（`type: "tool"`） | 53 |
| 带时间信息（截止日期或有效期说明） | 23 |
| 人工核验（`verified: true`） | 5 |
| 垃圾条目 | 0 |

来源分布：Futuretools 37 · 百度千帆 17 · aitools.fyi 15 · Layer3Labs 13 · Futurepedia 7 ·
阿里云百炼 1 · 智谱AI 1 · 人工策展 4（去重后 82）。

---

## 五、已知边界与后续可做

**边界**

- 需登录的页面（各家控制台）不采集，不做登录态抓取。
- JS 渲染的定价页不采集，由人工策展补。
- 部分优惠的实际有效期写在控制台里（如"自开通起 3 个月"），无法从公开页拿到绝对截止日期，
  用 `validity` 字段如实描述，不编造 `expiresAt`。

**后续可做（按价值排序）**

1. **继续扩充人工策展**：火山引擎、腾讯混元、讯飞星火、MiniMax、硅基流动、魔搭、月之暗面等
   的新用户额度与免费模型；国外 AppSumo 的 lifetime deal、各大云的 AI startup credit 计划。
   这是提升"优惠条数"最有效的路径——比再写十个脆弱采集器更靠谱。
2. **过期信息的自动降级**：`expiresAt` 到期后自动从默认视图移除（已实现），可再加"最近过期"归档页。
3. **来源健康度监控**：采集报告落库，某个源连续 N 天零产出就报警。
4. **自定义域名**：目前用 `buguoshixc.github.io/ai-deals-aggregator/`，如需绑域名需另行配置 CNAME。
5. **用户反馈入口**：卡片上加"信息有误"链接，跳 GitHub Issue 模板。

---

## 六、技术栈

- **前端**：原生 HTML + CSS + JavaScript（单文件，零构建）
- **采集**：Node.js 20+ / axios / cheerio，自建 http 封装（UA、超时、重试、并发限流、robots.txt）
- **校验**：自建零依赖校验脚本（`scripts/validate.js`）
- **部署**：GitHub Actions → GitHub Pages
- **存储**：静态 `deals.json`（v2 契约）
