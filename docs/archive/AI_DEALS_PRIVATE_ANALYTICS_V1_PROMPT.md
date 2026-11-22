# AI Deals Aggregator — Private Analytics v1 开发 Prompt

继续开发 **AI Deals Aggregator**。

当前项目已经完成：

- v1.x 产品体系
- v2.x Coding Plans / API Pricing
- v3.0 Knowledge Base
- Post-Audit Quality Closure
- 正式 CI / Deploy
- 线上 Smoke
- 真实 Collect + 非空 Deal History 验证

从现在开始，不再继续审计前三轮。

本轮进入一个新的、小范围版本：

# `private-analytics-v1`

---

# 0. 本轮目标

目标非常单一：

> 为 AI Deals Aggregator 接入私有网站访问分析，  
> 让项目维护者可以在 Cloudflare Web Analytics Dashboard 中查看真实访问情况，  
> 但不把 Analytics 数据公开给网站访客。

本轮采用：

> Cloudflare Web Analytics

网站仍然托管在：

> GitHub Pages

不要迁移托管平台。

不要迁移 DNS。

不要增加后端。

不要增加数据库。

不要增加用户账号。

不要增加公开统计页面。

不要增加访问计数器。

不要把 Analytics 数据写进 Git 仓库。

---

# 1. 产品目标

本轮完成以后，维护者应该可以在 Cloudflare Dashboard 中私下查看：

- Visitors
- Page Views
- Top Pages
- Referrers
- Countries
- Devices
- Browsers
- Core Web Vitals / 页面性能指标

这些数据只用于：

- 判断网站是否真的有人使用
- 判断哪些页面最有价值
- 判断未来应该优先继续建设哪个资料域
- 判断版本发布前后访问趋势是否变化
- 发现异常访问或页面使用情况

本轮不使用 Analytics 数据改变：

- Deals 排序
- Plans 排序
- Model 排序
- 首页推荐
- SEO 页面生成
- 搜索结果
- 用户看到的任何事实

Analytics 是：

> 运营观测层

不是：

> 产品真值层。

---

# 2. 本轮明确不做

禁止新增：

```text
/stats/
/analytics/
traffic.json
analytics.json
public-analytics.json
访问人数计数器
“本站已有 xxx 人访问”
公开趋势图
公开热门页面
公开国家分布
公开来源分布
用户画像页面
```

禁止：

- Google Analytics
- 自建 Analytics 后端
- Umami
- Plausible
- GoatCounter
- PostgreSQL
- SQLite
- Cloudflare Workers
- Cloudflare D1
- Supabase
- Firebase

本轮只使用：

> Cloudflare Web Analytics Browser Beacon

---

# 3. Analytics 数据不得进入仓库

这是本轮最重要的边界之一。

Analytics 数据：

```text
Visitors
Page Views
Referrers
Countries
Devices
Browsers
Web Vitals
```

全部留在：

> Cloudflare Web Analytics

不得：

```text
Cloudflare Analytics API
↓
GitHub Actions
↓
JSON
↓
commit
```

不得新增：

```text
scripts/data/traffic.json
scripts/data/analytics.json
dist/stats.json
history/traffic-*.json
```

不得把 Analytics 纳入：

```text
PUBLIC_DATASETS
/data/index.json
Data Docs
Feed
History
Archive
Model Registry
```

Analytics 与现有：

```text
Deals
Plans
API Pricing
Models
History
```

完全解耦。

---

# 4. 开发基线

不要假设当前本地 checkout 就是最新版本。

开始前：

```bash
git fetch origin
```

确认 `origin/master` 的最新 HEAD。

本轮必须基于：

> 最新 origin/master

创建独立 worktree / branch。

建议：

```text
private-analytics-v1
```

禁止从旧 v3.0 分支、quality-closure 旧工作树或本地主工作区旧 HEAD 直接开始。

记录：

```text
baseline SHA
git status
当前页面数
当前 sitemap 数
当前 dist 文件数
当前 verify 数
当前 regression 数
```

---

# 5. Cloudflare 配置前置条件

Cloudflare Web Analytics 的真正 Site Token：

> 只能使用 Cloudflare Dashboard 实际生成的值。

禁止：

- 猜 token
- 生成假 token
- 用 placeholder 假装已经接入
- 把 Cloudflare API Token 当成 Web Analytics Site Token
- 把 Global API Key 写入项目
- 把 Cloudflare Account API Token 写入前端

如果任务上下文中没有真实的 Cloudflare Web Analytics browser snippet 或 site token，则：

1. 完成代码接入设计；
2. 明确指出仍缺真实 Cloudflare Site Token；
3. 不得宣布生产 Analytics 已启用；
4. 等维护者提供 Cloudflare Dashboard 生成的 Browser Beacon snippet / Site Token 后再完成最终启用。

推荐维护者在 Cloudflare Dashboard 中创建：

```text
Web Analytics Site
hostname:
buguoshixc.github.io
```

本站实际路径：

```text
/ai-deals-aggregator/
```

如果 Cloudflare Web Analytics 当前支持 Path Rule，则可以额外限制到本站项目路径。

但：

> 不要由代码 Agent 猜 Cloudflare Dashboard 状态。

---

# 6. 严格区分两种 Token

## A. Browser-side Web Analytics Site Token

Cloudflare Web Analytics 给浏览器 Beacon 使用。

它最终会出现在发送给浏览器的 HTML / JS 中。

这是本轮唯一需要使用的 Cloudflare 标识。

## B. Cloudflare API Token / Global API Key

属于账户凭据。

本轮：

```text
完全不需要
```

禁止写进 source code、HTML、config、README、GitHub repository 或 browser JavaScript。

本轮不要调用 Cloudflare Analytics API。

---

# 7. 不要手改大量 HTML 页面

当前站点具有大量 Deal detail pages、Model pages、Vendor pages、Need pages、Category pages、Plans pages、Archive pages、Docs pages。

禁止逐页手工插入：

```html
<script ...></script>
```

必须找到当前共享页面生成层 / shared template / page shell / HTML finalize / build-local 中最合适的唯一注入点。

目标：

> Analytics Beacon 的定义只有一处。

所有正式发布 HTML 从这一处派生。

---

# 8. Tracking Scope

第一版建议统计所有真正发布给用户访问的 HTML 页面，包括：

- `/`
- `/deal/**`
- `/student/`
- `/developer/`
- `/free-api/`
- `/need/**`
- `/category/**`
- `/vendor/**`
- `/plans/**`
- `/models/**`
- `/changes/`
- `/archive/**`
- `/feeds/`
- `/status/`
- `/docs/data/`

可以统计 noindex alias 页面和 404 页面，因为这些访问本身对维护者具有诊断价值：

```text
旧链接是否仍有人访问
是否存在坏链接流量
```

不要统计：

- test fixtures
- source templates
- research artifacts
- local-only HTML
- screenshots
- temporary QA pages
- worktree artifacts

---

# 9. 本地开发不能发送 Analytics

这是强制要求。

本地运行：

```text
127.0.0.1
localhost
file://
preview environment
test environment
```

时：

> 不得向 Cloudflare Web Analytics 发送真实访问事件。

否则自己跑测试、browser verifier、regression 和 Agent 浏览页面都会污染访问数据。

因此 Analytics 必须具备：

> Production Host Guard

至少判断：

```text
hostname
+
GitHub Pages project path
```

只允许真实生产站：

```text
https://buguoshixc.github.io/ai-deals-aggregator/
```

进入 Analytics 加载路径。

不要只判断：

```text
hostname === buguoshixc.github.io
```

应同时检查 pathname prefix。

---

# 10. Analytics Bootstrap

不要让 Cloudflare Beacon 成为新的页面模板分叉。

建议建立类似：

```text
analyticsBootstrap()
analyticsSnippet()
```

的单一实现，具体命名根据当前架构决定。

行为：

```text
非 production URL
→ 什么都不加载

production URL
→ 加载 Cloudflare Web Analytics Beacon
```

Cloudflare 官方 Browser Beacon URL 与 Dashboard snippet：

> 以用户实际从 Cloudflare Dashboard 复制出来的 snippet 为准。

不要凭记忆自行重写协议。

如果为了 Production Host Guard 需要动态加载，必须保证最终行为等价于官方 manual beacon。

不要自己重写 Cloudflare Analytics protocol。

---

# 11. Analytics 失败不得影响网站

Analytics 是 observability，不是 product dependency。

因此 Cloudflare Web Analytics 加载失败、CORS 失败、网络超时、被广告拦截器阻止或 Cloudflare endpoint 不可用，都不得导致：

- 页面正文消失
- 页面 JS 崩溃
- 搜索失败
- 筛选失败
- 排序失败
- Modal 失败
- Plan 页面失败
- Model 页面失败
- Console 出现项目自身未捕获异常

Analytics 必须：

> failure-isolated。

---

# 12. 不引入 Cookie / Local Storage / Fingerprint

本轮禁止自己实现：

```text
visitor ID
UUID
fingerprint
browser fingerprint
persistent device ID
cookie
localStorage ID
sessionStorage ID
IP hash
User-Agent hash
```

不要尝试回答“这个人是不是上周那个访客”。

完全交给 Cloudflare Web Analytics 自己的统计口径。

本站代码：

> 不建立自己的访客身份系统。

---

# 13. 不做 Custom Events

第一版不要追踪：

```text
点击了哪个 Deal
点了哪个官方链接
使用了哪个筛选器
搜索了什么词
打开哪个 Model
展开了哪个套餐
复制了什么
停留时间
scroll depth
```

先只做基础 Web Analytics。

目前目标只是回答：

```text
有没有人在用？
哪些页面有人看？
用户从哪里来？
```

等运行一段时间以后，再根据真实需求决定是否需要 Event Analytics。

---

# 14. 不增加公开 UI

本轮页面视觉应该基本零变化。

不要新增：

```text
“本站使用 Cloudflare Analytics”
访问统计按钮
访问人数
Analytics 图标
Dashboard 链接
```

不要因为 Analytics 新增首页行、增加 footer 高度、改动卡片布局或首屏密度。

如果项目现有文档存在 Privacy / 第三方服务 / 技术说明，可以增加一条纯事实说明。

如果没有合适位置，只更新开发文档 / README。

不要为了 Analytics 新增 Privacy 页面。

也不要做法律合规结论。

只陈述事实：

> 网站使用 Cloudflare Web Analytics 进行站点访问与性能分析，统计结果仅由项目维护者查看。

不要写：

```text
完全匿名
100% GDPR compliant
绝不会收集任何数据
```

这类无法由项目代码证明的绝对化表述。

---

# 15. 不污染现有 External Request Gate

当前项目对 external request / external link 有严格验收。

接入 Analytics 后不要粗暴改成：

```text
“允许所有外部请求”
```

正确做法是建立非常窄的：

```text
ANALYTICS_ALLOWED_ORIGINS
```

只允许 Cloudflare Web Analytics 实际需要的 script origin 和 beacon endpoint，并且只在 production analytics context 生效。

其它外部请求仍按现有 Gate 判断。

禁止：

```text
externalRequests.length > 0
→ 直接不再检查
```

---

# 16. CSP

先检查项目是否已有 Content-Security-Policy。

如果没有：

> 不要为了 Analytics 单独引入一整套 CSP 架构。

如果已有：

只最小追加 Cloudflare 官方文档要求的 script-src / connect-src 来源。

不得用：

```text
script-src *
connect-src *
unsafe-eval
```

来解决 Analytics。

---

# 17. 构建确定性

Analytics 接入不能破坏 deterministic build。

不要在构建时：

- 请求 Cloudflare API
- 请求 Cloudflare Dashboard
- 读取 wall clock
- 下载远端 JS 内容再写进 dist
- 生成随机 visitor ID

两次：

```text
same source
+
same analytics config
```

必须产生相同 dist。

Beacon JS：

> 浏览器运行时从 Cloudflare 加载。

构建系统不抓取远端脚本。

---

# 18. 配置设计

不要把 Analytics token 散落在多个文件。

必须只有一个配置来源，例如：

```text
scripts/config/site.js
```

或当前项目已有站点配置模块。

至少表达：

```text
provider
enabled
productionHostname
productionPathPrefix
siteToken
```

具体 schema 根据当前项目结构决定。

不要为了这几个字段建立新的大型配置系统。

---

# 19. Token 不得做环境差异真值

因为 Browser Beacon 的 Site Token 最终必然发送给浏览器，不要为了“隐藏它”引入：

```text
GitHub Secret
→ build-time token injection
```

导致：

```text
local dist
!=
CI dist
```

如果最终 Cloudflare Dashboard 提供的 Browser Beacon token 已确定：

优先让 production source deterministic。

但一定要在文档里写清：

```text
Web Analytics Site Token
!=
Cloudflare API credential
```

任何真正账户凭据仍严禁提交。

---

# 20. 页面覆盖检查

构建后独立扫描：

```text
dist/**/*.html
```

对于 trackable production page，必须满足：

```text
analytics bootstrap exactly 1
```

不能是 0、2、3。

对于明确 excluded 的 HTML，必须是 0。

建立：

```text
analytics-selftest
```

或等价工具。

不要用 grep 某个 token 字符串作为唯一证明。

应该检查：

- bootstrap 数量
- production guard
- provider URL
- page coverage
- duplicate injection

---

# 21. Local Browser Tooth Test

至少验证：

```text
http://127.0.0.1
localhost
```

页面打开以后：

```text
Cloudflare analytics script requests = 0
Cloudflare beacon requests = 0
```

同时：

```text
console errors = 0
现有页面交互正常
```

必须覆盖：

- `/`
- `/plans/api/`
- `/plans/coding/`
- `/models/`
- 任意 model detail
- `/vendor/`
- `/changes/`

---

# 22. Production Guard Tooth Test

不要真的污染 Cloudflare 数据。

可以在测试中 mock location / pure-function test，证明：

```text
buguoshixc.github.io
+
/ai-deals-aggregator/
→ enabled
```

而：

```text
localhost
127.0.0.1
example.com
buguoshixc.github.io/other-project/
```

→ disabled。

Production Guard 判据必须单一实现。

不要浏览器一份、构建器一份、selftest 再写一份。

---

# 23. Duplicate Beacon Tooth Test

故意制造同页注入两次，必须红。

故意删除某个正常 production page 的 bootstrap，必须红。

故意把：

```text
productionPathPrefix
```

改成：

```text
/
```

如果这会扩大到其它项目，测试必须能发现。

---

# 24. Credential Scan

新增或复用现有静态检查，确保仓库不存在：

```text
CF_API_TOKEN
CLOUDFLARE_API_TOKEN
GLOBAL_API_KEY
Authorization: Bearer ...
X-Auth-Key
```

等 Cloudflare 账户凭据。

但不要把合法 browser-side Site Token 当成泄密。

必须明确区分：

```text
browser analytics identifier
vs
account credential
```

---

# 25. Existing Gate

Analytics 接入不能通过删除断言、降低 assertion threshold、扩大 allowlist、关闭 browser verify 或允许 console error 来让 Gate 变绿。

完成后运行当前最新 master 的完整 Gate。

命令：

> 从当前 `package.json` / workflow 动态读取。

不要使用历史报告里的旧命令数字。

必须确认：

- strict validation
- reproducibility
- build
- SEO
- feeds
- models
- plans
- API plans
- browser verification
- regression
- CI consistency

全部保持通过。

---

# 26. 页面规模不得因为 Analytics 改变

本轮不是新页面版本。

因此以下集合应该保持不变：

```text
HTML page count
indexable page count
sitemap member set
Feed set
Dataset Manifest set
Deals
Plans
API Plans
Models
Registry links
History
```

Analytics 不应增加 sitemap URL。

Analytics 不应增加 Dataset。

Analytics 不应修改任何业务数据。

---

# 27. Production Deployment

完成本地开发后走项目现有流程：

```text
branch
↓
PR
↓
required gate
↓
merge master
↓
Deploy GitHub Pages
```

不要绕过 ruleset。

---

# 28. 线上 Smoke

部署后必须做线上验证。

至少检查：

- `/`
- `/plans/api/`
- `/plans/coding/`
- `/models/`
- 任意 model detail
- `/vendor/`
- `/changes/`

确认：

1. 页面 HTTP 正常；
2. HTML 中 Analytics Bootstrap exactly 1；
3. Production Guard 生效；
4. Cloudflare Beacon script 能成功加载；
5. Analytics 请求只发送到预期 Cloudflare endpoint；
6. 页面核心 JS 无错误；
7. 页面视觉和布局无明显变化；
8. GitHub Pages project subpath 没有被 Analytics 代码处理错。

不要因为 Cloudflare Dashboard 暂时还没出现数据就立刻判失败。

Cloudflare 数据可能存在处理延迟。

---

# 29. Cloudflare Dashboard 人工验收

最终仍有一项只能由项目所有者确认：

登录 Cloudflare Web Analytics Dashboard，确认开始出现本站数据。

至少观察：

```text
Page Views
Visitors
Top Pages
Referrers
```

如果几分钟后还没有，排查：

- hostname
- project path
- Site Token
- Beacon Network Request
- CORS
- 浏览器广告拦截器
- Cloudflare Site Rules

不要通过向仓库加入 Analytics API Token 来排查。

---

# 30. 本轮文档

建议新增：

```text
docs/PRIVATE-ANALYTICS-v1.md
```

记录：

## Purpose

为什么接入 Analytics。

## Provider

Cloudflare Web Analytics。

## Data Boundary

Analytics 数据只存在 Cloudflare Dashboard。

## No Public Stats

为什么网站没有 `/stats/`。

## No Repository Storage

为什么访问数据不进入 Git。

## No User Identity

本站不建立自己的 visitor identifier。

## Production Guard

为什么 localhost 不发统计。

## Credentials

Site Token 与 API Token 的区别。

## Disable

如果以后不需要 Analytics，如何通过唯一配置关闭。

---

# 31. README 只做小修改

README 可以增加一小段：

```text
运营观测：
生产站使用 Cloudflare Web Analytics 观察页面访问与性能趋势。
统计结果不作为公开数据集发布，也不会写入仓库。
```

措辞根据实际实现调整。

不要大篇幅宣传 Analytics。

---

# 32. 完成报告

输出：

```text
research/private-analytics-v1-report.md
```

至少包括：

## 1. Baseline

- base SHA
- branch
- worktree

## 2. Architecture

```text
GitHub Pages
→ Cloudflare Web Analytics Beacon
→ Cloudflare private dashboard
```

## 3. Tracking Scope

统计哪些页面，不统计哪些环境。

## 4. Production Guard

hostname / path 判据。

## 5. Integration Point

Beacon 在哪里统一注入。

## 6. Privacy / Data Boundary

明确：

```text
无本站 visitor ID
无 Cookie 代码
无 localStorage ID
无 stats JSON
无 Analytics API
```

## 7. Credential Boundary

Site Token：

```text
browser side
```

Cloudflare API Token：

```text
未使用
```

## 8. Build Determinism

两次构建对账。

## 9. Local Verification

证明：

```text
localhost Cloudflare requests = 0
```

## 10. Production Coverage

所有 trackable HTML：

```text
exactly one analytics bootstrap
```

## 11. Gate

列出真实运行结果。

## 12. Online Smoke

必须写实际运行结果；未运行就写：

```text
未运行
```

不得写：

```text
应该正常
```

## 13. Cloudflare Dashboard

如果已经人工确认数据开始出现，则记录。

如果无法访问 Dashboard：

```text
OWNER VERIFICATION REQUIRED
```

不要假装验证。

## 14. Data Integrity

确认：

```text
Deals unchanged
Plans unchanged
API Plans unchanged
Models unchanged
History unchanged
Manifest unchanged
Feed set unchanged
Sitemap member set unchanged
```

## 15. Remaining Risks

例如：

- 广告拦截器导致 Analytics 低估
- Dashboard 数据存在延迟
- Production hostname/path 未来迁移需同步配置

---

# 33. 完成条件

只有全部满足才能宣布本轮完成：

- [ ] 使用真实 Cloudflare Web Analytics Site Token
- [ ] Analytics 定义只有一处
- [ ] 正式 production HTML 全覆盖
- [ ] 每页 exactly one bootstrap
- [ ] localhost 不发送 Analytics
- [ ] GitHub Pages project path 正确
- [ ] Analytics 加载失败不影响产品
- [ ] 不建立本站 visitor identifier
- [ ] 不增加 Cookie / localStorage tracking
- [ ] 不使用 Cloudflare Analytics API
- [ ] 不提交 Cloudflare API credential
- [ ] 不产生 `traffic.json` / `analytics.json`
- [ ] 不新增 `/stats/`
- [ ] 不改变业务数据
- [ ] 不改变 sitemap 页面集合
- [ ] 不改变 Feed 集合
- [ ] Build deterministic
- [ ] Full Gate 全绿
- [ ] Required CI 全绿
- [ ] Deploy 成功
- [ ] Online Smoke 成功
- [ ] Cloudflare Dashboard 最终由项目所有者确认数据开始出现

---

# 34. 本轮最重要的原则

第一：

> Analytics 是维护工具，不是产品功能。

第二：

> 访问数据只给维护者看，不公开。

第三：

> Analytics 数据不进入 Git。

第四：

> 本地测试永远不能污染真实访问数据。

第五：

> 不为了统计访问量引入账号、数据库和后端。

第六：

> Beacon 挂掉时，网站必须完全正常。

第七：

> 第一版只观察，不做用户行为追踪体系。

第八：

> 先积累真实数据，再决定下一轮开发方向。
