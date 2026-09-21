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

## 快速开始

```bash
npm ci                  # 安装依赖（axios + cheerio）
npm run collect:dry     # 只采集并打印报告，不写盘
npm run collect         # 全量采集并写入 deals.json
npm test                # 数据 + 前端静态校验（零依赖，可直接跑）
npm run test:strict     # 额外校验内容质量指标
npm run serve           # 本地预览 http://127.0.0.1:8080
```

常用排查命令：

```bash
node scripts/collect.js --list                       # 列出已注册采集器
node scripts/collect.js --only=cn_qianfan --dry-run  # 只跑某个来源
node scripts/tools/inspect-source.js <url> --rows    # 查看页面表格结构（写采集器用）
node scripts/tools/find-offers.js <url>              # 探测页面是否含优惠内容
node scripts/tools/term-count.js <url> 免费 额度      # 判断页面是否 JS 空壳
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
      "category": "API服务",       // 固定 12 类枚举
      "description": "…",
      "eligibility": "新用户（需实名认证）",
      "validity": "自开通起 3 个月",  // 有效期说明（无绝对截止日期时用）
      "expiresAt": "2026-12-31",    // 绝对截止日期，可为 null
      "firstSeen": "2026-09-20",
      "lastSeen": "2026-09-21",
      "verified": true              // 人工核验过
    }
  ]
}
```

分类枚举：对话模型 / 图像绘画 / 视频 / 音频语音 / 编程开发 / 办公效率 / API服务 / 智能体 /
搜索研究 / 设计创意 / 教育学习 / 其他。

## 目录结构

```
index.html                    前端（原生 HTML/CSS/JS，无构建）
deals.json                    线上数据
scripts/
  collect.js                  采集编排：注册表 → 归一 → 去重 → 熔断 → 写盘 → 报告
  validate.js                 数据与前端校验（零依赖，CI 门禁）
  migrate.js                  v1 → v2 迁移与清洗
  serve.js                    零依赖本地预览服务器
  lib/
    schema.js                 v2 契约：makeDeal / validateDeal / 垃圾与优惠信号判定
    store.js                  读写、合并、过期修剪、写盘熔断、发布前断言
    dedup.js                  标题归一 + 别名表 + 信息量择优合并
    classify.js               地区判定、有效期抽取
    official.js               聚合站条目 → 官方页解析
    http.js                   UA / 超时 / 重试 / 并发限流 / robots.txt
    report.js                 采集报告表格
    curated.js                人工策展数据加载
  collectors/
    index.js                  注册表
    cn_docs.js                国内：百度千帆免费额度表 / 阿里云百炼 / 智谱免费模型
    global_deals.js           国外真实优惠：Layer3Labs 折扣表
    global_directories.js     国外目录站：aitools.fyi / Futurepedia / Futuretools
  data/
    curated_cn.json           国内人工策展（可核验的官方优惠）
    curated_global.json       国外人工策展
    aliases.json              产品别名表（跨源去重）
    official_urls.json        聚合站条目 → 官方页映射
  tools/                      采集器调试工具（探测页面结构、优惠信号、词频）
```

## 采集来源策略

| 来源 | 类型 | 说明 |
|---|---|---|
| 百度千帆 | 国内 | 官方文档「新用户免费额度」表：服务名称 / 赠送 Tokens / 有效期 |
| 阿里云百炼 | 国内 | 官方帮助文档「新人免费额度」 |
| 智谱AI | 国内 | 官方文档标注的免费大模型（GLM-4-Flash） |
| Layer3Labs | 国外 | 折扣表，每行自带官方链接 |
| aitools.fyi / Futurepedia / Futuretools | 国外 | 工具目录，主要产出 `type: "tool"` |

**已实测淘汰**（零产出或纯垃圾）：Zapier、BitDegree、AitoolsDirectory、AppSumo（客户端渲染，0 产出）、
火山引擎文档（JS 空壳）、各家控制台（需登录）。

抓不到但真实存在的优惠，走 `scripts/data/curated_*.json` 人工策展——**内容准确性优先于自动化率**。

## 自动化与部署

- `.github/workflows/collect.yml`：每天北京时间 08:00 / 20:00 采集 → 校验（含 strict 门禁）→ 有变化才提交 `deals.json`。
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
| 采集到的优惠 / 工具条目 | 自动（GitHub Actions 定时） | 每天 2 次（北京 08:00 / 20:00）；数据无变化则不提交 |
| 线上页面 | 自动（提交后经 `workflow_run` 触发部署） | 跟随采集，或任意一次 `push` |
| 过期优惠下架 | 自动（每次采集时修剪） | 过期超过 14 天的优惠被移除 |
| 人工策展优惠（`scripts/data/curated_*.json`） | **人工** | 由人修改并推送，无自动更新 |
| 采集器选择器 / 别名表 | **人工** | 对方站点改版导致零产出时需要人修 |

## 隐私声明

本项目仅供个人使用，不收集任何用户访问数据。

## 已知边界

- 需登录的页面（各家控制台）不采集，不做登录态抓取。
- JS 渲染的定价页（火山引擎等）不采集，改由人工策展维护。
- 促销信息时效性强，`expiresAt` 或 `validity` 字段标注时间信息；发现过期信息欢迎提 issue 修正。
