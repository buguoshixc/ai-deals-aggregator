# 私有站点分析（private-analytics-v1）

> 生产站使用 **Cloudflare Web Analytics** 观察页面访问与性能趋势。
> 统计结果只存在于 Cloudflare Dashboard，**仅由项目维护者查看**；
> 不作为公开数据集发布，也不写入 Git 仓库。

这一份文档是这一层的**唯一说明**。它同时是「怎么开」「怎么关」「边界在哪」三件事的答案。

---

## Purpose

接入分析的目的只有四个，全部是**维护者视角**的运营问题：

1. 有没有人真的在用这个站？（Visitors / Page Views）
2. 哪些页面有人看？（Top Pages）→ 决定下一轮优先补哪个资料域
3. 用户从哪里来？（Referrers / Countries / Devices / Browsers）
4. 版本发布前后访问趋势有没有变化？（时间序列）+ 页面性能是否退化（Core Web Vitals）

它 **不**用来改变任何产品或事实：Deals / Plans / Model 的排序、首页推荐、SEO 页面生成、
搜索结果都不读它。Analytics 是**运营观测层**，不是产品真值层。

---

## Provider

**Cloudflare Web Analytics**（Browser Beacon）。

| 项 | 值 |
| --- | --- |
| profile | `scripts/lib/analytics.js` 的 `ANALYTICS.provider` = `cloudflare-web-analytics` |
| 脚本地址 | `https://static.cloudflareinsights.com/beacon.min.js` |
| 上报端点 | `https://cloudflareinsights.com/cdn-cgi/rum`（本站**未**走 Cloudflare 代理） |
| 订阅页 hostname | `buguoshixc.github.io`（站点在 GitHub Pages 项目页 `/ai-deals-aggregator/` 下） |
| 本站地址 | `https://buguoshixc.github.io/ai-deals-aggregator/` |

托管平台**不变**（仍是 GitHub Pages）：不加后端、不加数据库、不加用户账号、
不迁移 DNS、不引入任何 Worker / D1 / Supabase / Firebase。

**Sources**（本轮判据的来源，不是凭记忆重写的协议）：

- [Cloudflare Web Analytics · Get started](https://developers.cloudflare.com/web-analytics/get-started/)
- [RUM beacon for Web Analytics](https://developers.cloudflare.com/speed/observatory/rum-beacon/)
- [Data origin and collection](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)
- [Web Analytics for SPAs](https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/)

---

## Data Boundary

分析数据只存在于 **Cloudflare Dashboard**。仓库里**没有**任何一份访问数据，产物里也没有：

- 不产生 `traffic.json` / `analytics.json` / `public-analytics.json` / `stats.json`（构建期硬失败 + 独立门禁双向检查）；
- 不调用 Cloudflare Analytics API，**没有任何** `Cloudflare API → GitHub Actions → JSON → commit` 这条链路；
- 与任何公开数据集注册表**无关**：`PUBLIC_DATASETS` 与 `/data/index.json`、数据文档页、Feed
  本轮已随数据出口 / 订阅层整族下架（不再存在），产物里的非 HTML 文件由
  `scripts/lib/published-assets.js` 的允许清单 fail-closed 兜底 —— Analytics 不在其中；
- 与 Deals / Plans / API Pricing / Models / History **完全解耦**。

唯一的例外是**构建产物**里那份 `<script data-dsh-analytics=…>`：它不是数据，是**取数代码**。

---

## No Public Stats

网站**没有** `/stats/`、`/analytics/`，也没有任何公开统计页面、公开趋势图、公开热门页面、
公开国家分布、公开来源分布、访问人数计数器或「本站已有 xxx 人访问」这类文案。

理由：这一层的数据用于维护者判断方向，公开它只会带来两个后果 —— 把内部判断暴露给外部，
以及让页面多一份随时会过期的数字。**访客完全看不到任何统计**，页面上也**没有**任何
「本站使用 Cloudflare Analytics」之类的提示、图标或 Dashboard 链接。

如果将来确实需要公开统计，那应当是新的一轮、新的设计，而不是把这一层顺手打开。

---

## No Repository Storage

访问数据不进入 Git，这是本轮最重要的边界之一。三道防线：

1. **构建期**（`scripts/tools/build-local.js` 产物自检）：产物里出现
   `stats.json` / `traffic.json` / `analytics.json` / `public-analytics.json` 即失败；
2. **独立门禁**（`scripts/tools/analytics-selftest.js`）：扫 `dist/**`，
   任何名字像分析数据的文件都判红，且 `data-docs.js` 的注册表里不许出现分析条目；
3. **仓库层**：`.gitignore` 里没有、也不需要任何分析产物路径 —— 因为根本不会产生。

---

## No User Identity

本站代码**不建立自己的访客身份系统**。具体到代码，注入段里**不许出现**：

```
visitor ID · UUID · fingerprint · persistent device ID
cookie · localStorage · sessionStorage · IndexedDB
IP hash · User-Agent hash · crypto.randomUUID · navigator.userAgent · sendBeacon
```

「这个人是不是上周那个访客」这个问题**不由本站回答** —— 统计口径完全交给 Cloudflare
Web Analytics 自己（其 RUM 文档明确说明 beacon 不使用任何浏览器存储）。

注：站点**其它功能**（主题偏好 `dsh.theme`、视图偏好 `dsh.view`、收藏、对比选择）
本来就用 `localStorage`，那是产品功能，与本轮分析层无关；分析层一个字节都不读它们。

---

## Tracking Scope

**统计**：本站发布的全部 HTML 页面 —— `/`、`/deal/**`、`/student|developer|free-api/`、
`/need/**`（含 noindex 别名页）、`/category/**`、`/vendor/**`、`/plans/` `/plans/coding/`
`/plans/api/`、`/models/**`、`/changes/`、`/archive/**`、`/feeds/`、`/status/`、`/docs/data/`。

noindex 别名页与将来的 404 页**同样统计**：它们回答的是「旧链接还有没有人在点」与
「有没有坏链流量」，那正是最需要诊断的一类访问。

**不统计**：test fixtures、source templates、research artifacts、screenshots、local-only HTML、
临时 QA 页面、worktree 产物 —— 它们根本不在发布产物里；万一出现，门禁会以
「没有被 `ROUTE_RULES` 覆盖」判红（fail-closed，不做静默跳过）。

统计范围声明在 `scripts/lib/analytics-routes.js` 的 `ROUTE_RULES`：**每条规则都带理由**，
新增页面族必须在那里登记，否则那一族会「零统计却全绿」——门禁专门盯着这件事。

---

## Production Guard

**本地与测试环境绝不发送任何访问事件**（否则自己跑验收、跑 regression、Agent 浏览页面
都会污染真实数据）。判据是 `scripts/lib/analytics.js` 里 `ANALYTICS-GUARD` 区块中的
`isProductionAnalyticsContext()`：

```
config.enabled === true
AND location.protocol ∈ { http:, https: }
AND location.hostname === productionHostname     （小写全等）
AND location.pathname 以 productionPathPrefix 开头（前缀以 / 开头且以 / 结尾）
```

必须**同时**判 hostname 与 pathname 前缀：本站是 GitHub Pages **项目页**，
同一个 `buguoshixc.github.io` 下还住着别的项目 —— 只判 hostname 就等于把同一账户下
其它项目的访问记进本站，那是错的归属，而且不会有任何东西报错。

真值表（由 `scripts/tools/analytics-selftest.js` 在 `vm` 沙箱里**真的执行**这段代码来验）：

| location | 结果 |
| --- | --- |
| `https://buguoshixc.github.io/ai-deals-aggregator/`（含 `deal/x/`、`plans/api/` 等子路径） | ✅ enabled |
| `http://127.0.0.1:*` / `http://localhost`（任何路径） | ⛔ disabled |
| `file://…` | ⛔ disabled |
| `https://example.com/…` | ⛔ disabled |
| `https://buguoshixc.github.io/other-project/` | ⛔ disabled |
| `https://buguoshixc.github.io/`（用户页根路径） | ⛔ disabled |
| `https://buguoshixc.github.io/ai-deals-aggregator-old/`（兄弟目录名） | ⛔ disabled |
| `https://buguoshixc.github.io.evil.com/ai-deals-aggregator/`（伪装域） | ⛔ disabled |
| 任意 location + `enabled:false` | ⛔ disabled |

**判据只有一份实现**：浏览器里跑的那段、构建期内联的那段、门禁沙箱里求值的那段，
都是同一个文件同一个标记区块的**逐字文本**（`guardSource()`）。
不允许出现「浏览器一份、构建器一份、selftest 再写一份」。

---

## Integration Point

Beacon 的**定义只有一处**，所有正式发布 HTML 都从这一处派生：

```
index.html 的共享页脚区（<!--SHARED:footer:START--> … END）末尾
  └─ <!--ANALYTICS:BOOTSTRAP-->            ← 唯一占位符
       └─ scripts/lib/analytics.js          ← 唯一的 beacon 定义与配置
            └─ build-local.js finalizePage(html, route, prefix)
                 · 先按输出深度解析全部路由占位符（既有行为）
                 · 再按该页路由把占位符换成 beacon 或注释
                 · 最后断言：残留占位符 0 个、bootstrap 数 == 该页应有值
```

为什么挂在页脚：**页脚是站内唯一被全部页面族共享的片段**（首页骨架、详情页、状态页、
变化页、以及 11 个资料页渲染器都从 `index.html` 的同一段页脚派生）。
`finalizePage()` 是本文件里**全部** HTML 落盘路径的收尾动作 ——
所以「新页面族也自动带上 beacon」不是因为大家记得改，而是**没有别的出口**。

为什么不是 `<head>`：派生页面族各自拼自己的 `<head>`，那里没有共享点；
而 Cloudflare 官方也要求把 snippet 放在 `</body>` 之前。

**官方 snippet 与本实现的逐项对应**（这是本轮唯一允许的差异）：

| | 官方（静态写死） | 本站（需要先过守卫） |
| --- | --- | --- |
| URL | `https://static.cloudflareinsights.com/beacon.min.js` | 同 |
| 属性 | `type="module"` + `data-cf-beacon='{"token":"…"}'` | 同（由 `createElement` + `setAttribute` 建出**逐属性相同**的元素） |
| 时机 | 写在 HTML 里，页面解析到就加载 | `readyState === 'loading'` 时挂 `DOMContentLoaded`，否则立即插入 |
| 差异原因 | —— | 必须先判「是不是生产站」才能决定加载；本地一个请求都不许发 |

协议本身**没有**被重写：仍然是官方那个脚本、官方那个载荷、官方那个上报端点。

---

## Failure Isolation

Analytics 是 observability，**不是产品依赖**。所以下面任何一种情况都**不得**影响产品：

CSP 拦了 · 广告拦截器拦了 · 网络超时 · CORS 失败 · Cloudflare 端点不可用。

注入段整体包在 `try { … } catch (error) { }` 里，`catch` 刻意什么都不做；
它只做一件事：往 `<head>` 里插一个 `<script type="module">`。
页面正文、搜索、筛选、排序、弹层、Plan 页、Model 页**都不读它的结果**。

现场证据（本地真浏览器）：`node scripts/tools/verify-site.js` 的第 26 节逐页断言
「0 次 Cloudflare 请求 + 0 个新增 JS 错误 + 正文完整」。

---

## Credentials

**这里有两类东西，绝不能混为一谈：**

| | Browser Web Analytics **Site Token** | Cloudflare **API Token / Global API Key** |
| --- | --- | --- |
| 值 | `dcabf20adc0049bca647eb83b1408a5a` | （本项目**没有任何**这种凭据） |
| 用在哪 | 浏览器 beacon 的 `data-cf-beacon` | Cloudflare REST API 的 `Authorization` 头 |
| 会发给访客吗 | **会**（它就在 HTML 里） | 绝不会 |
| 能读到分析数据吗 | **不能** | 能（这就是它危险的地方） |
| 本轮需要吗 | 是（唯一需要的 Cloudflare 标识） | **完全不需要** |
| 进仓库吗 | 是，这是设计的一部分 | 严禁（有专门的门禁扫它） |

- Site Token 是**浏览器侧标识符，不是密钥**：任何访客按 F12 都能看到它，
  而它只能用来「往这个 site 记一次访问」，读不出任何统计结果。
- 账户凭据（`CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` / `GLOBAL_API_KEY` / `X-Auth-Key` /
  `X-Auth-Email` / `CLOUDFLARE_ACCOUNT_ID`）**严禁**出现在 source code、HTML、config、README、
  GitHub repository 或 browser JavaScript 里。`scripts/lib/secret-scan.js` 里有对应模式，
  构建产物自检与 `npm run selftest:analytics` 都会扫；
  `npm run selftest:analytics` 还会**反向**断言「合法的 Site Token 不被判成泄密」——
  否则那条门禁会逼着人把 token 藏进 GitHub Secret，而那恰好会破坏构建确定性。

**为什么 token 不做 build-time 注入**：Beacon 的 Site Token 最终必然会出现在发给浏览器的
HTML 里，用 GitHub Secret 注入只能造成 `local dist != CI dist`，与「两次同源构建逐字节一致」
直接冲突。所以它**确定性地**写在 `scripts/lib/analytics.js` 的配置里。

---

## Disable

关掉 Analytics 的**唯一动作**是把配置里的 `enabled` 改成 `false`：

```js
// scripts/lib/analytics.js
const ANALYTICS = {
  ...
  enabled: false,
  ...
};
```

行为：

- 产物里**不会**再有 `<script data-dsh-analytics=…>`：占位符照常被解析掉（不留模板标记），
  但注入的是一个 HTML 注释 —— 因此「每页 exactly 1」这条断言会自动切换成「每页 0」；
- 浏览器里一个请求都不会发（守卫的第一个条件就是 `enabled !== true`）；
- 恢复时把 `enabled` 改回 `true` 并重新构建即可，**不需要改任何模板或页面**。

`enabled:false` 时 `siteToken` 必须留空或 `null` —— 门禁会拒绝「关掉的 provider 还带着标识」。

想连 `<script>` 代码一起清掉，只需删掉 `index.html` 页脚区那一行占位符并按
`scripts/lib/analytics.js` 的 `guardSource()` 契约保留实现（门禁会以
「页面里没有占位符」判红，提醒你这是一个有意的决定）。

---

## Verification（怎么证明这一层真的成立）

```bash
npm run build                                   # 组装产物（内含逐页注入断言）
npm run selftest:analytics                      # 独立门禁：配置 / 真值表 / 覆盖 / 牙测试 / 凭据
npm run verify                                  # 真浏览器：第 26 节 = 本地 0 次 Cloudflare 请求
npm run check:ci                                # CI 口径：门禁步骤与断言项数一致
node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/
                                                # 部署后冒烟：线上应当观测到 beacon 请求
```

`npm run selftest:analytics` 会打印逐项结论，并包含 **8 种定向篡改的牙测试**
（多注入一份 / 删掉一个页面的 bootstrap / 换 token / 抽掉守卫 / 把路径前缀放宽成 `/` /
凭空多出 `stats.json` / 新增未登记的页面族 / 留下未解析的占位符）——
任何一种篡改没被扫出来，它就红。

---

## 本轮明确不做

Google Analytics · Umami · Plausible · GoatCounter · 自建 Analytics 后端 ·
Cloudflare Workers / D1 · PostgreSQL / SQLite · Supabase / Firebase ·
用户账号 · 自定义事件（点击了哪个 Deal / 用了哪个筛选器 / 搜索了什么词 / 停留时间 / scroll depth）·
公开统计页面或计数器 · Cookie / localStorage 访客 ID · 指纹 · IP hash ·
Cloudflare Analytics API · 把分析数据写进 Git。

第一版**只观察**基础 Web Analytics：先积累真实数据，再决定下一轮开发方向；
等运行一段时间以后，再根据真实需求决定是否需要 Event Analytics。
