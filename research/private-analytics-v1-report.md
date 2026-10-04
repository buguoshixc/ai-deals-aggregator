# private-analytics-v1 —— 完成报告

> 本轮把 **Cloudflare Web Analytics（Browser Beacon）** 接入 AI Deals Aggregator 的生产发布产物：
> 维护者可在 Cloudflare Dashboard 私下查看访问与性能趋势，访客看不到任何统计，
> 访问数据不进入仓库，本地测试一个请求都不发。
>
> **本报告里的每一个数字都来自实际运行输出**；没有运行过的项目一律写「未运行」，
> 不写「应该正常」。所有命令都在
> `D:\OneDrive\Desktop\Code\AI Page\.worktrees\private-analytics-v1` 下运行。

---

## 1. Baseline

| 项 | 值 |
|---|---|
| **base SHA** | `45b7b4786d6a86ce016372872abcb6c06dd0f481`（`origin/master`，2026-10-04 12:31 CST `chore(data): 更新优惠数据…[skip ci]`） |
| **branch** | `private-analytics-v1`（从 `origin/master` 新建，非旧 v3.0 / quality-closure 分支） |
| **worktree** | `.worktrees/private-analytics-v1`（仓库内，已在 `.gitignore`；主工作区 HEAD 当时落后为 `433477d`，**未**用于本轮开发） |
| 开工前 `git status` | **clean**（`git status --porcelain` 输出为空） |
| 本地 Node | `v24.13.1`；worktree 内 `npm ci` → 51 packages |
| 当前页面数 | **173** 个 HTML（`dist/**/*.html`）· 其中可索引 170 · noindex 别名 3 |
| 当前 sitemap 数 | **170** 条 `<loc>` |
| 当前 dist 文件数 | **290** 个 |
| 当前 verify 数 | 真浏览器验收 **709 项**（本地 `127.0.0.1`）；`--compare` 回归比对 **715 项** |
| 当前 regression 数 | 回归基线 `research/_raw/ours-baseline/verify.json`：`coveredDeals 80` · `cards 50` · `pageHeight 4589` · `externalRequests 0` · `jsErrors 0` |
| CI 口径项数 | `check-ci-consistency` **36 项**（本轮 → 37） |
| 数据现状 | Deals **135** · Plans **23** · API Plans **13** · Models **44** · Registry links **64** · Feed **24 份 × 2 = 48 文件** · Manifest **9** 份 |
| CSP | **全仓无 `Content-Security-Policy`** → 本轮**不引入** CSP（P1 §16） |
| 托管 | GitHub Pages 项目页 `https://buguoshixc.github.io/ai-deals-aggregator/`（**无 CNAME**、**无 404.html**） |

基线产物对账方式：用 `git stash push -u` 把本轮全部改动**暂时移出**工作区，
在**真正干净的源码**上构建出一份基线产物（`--out=../../analytics-baseline-pristine`），
再 `git stash pop` 恢复。所有「产物是否只有分析差异」的结论都以那一份为对照。

---

## 2. Architecture

```
GitHub Pages（静态托管，不变）
  └─ dist/**/*.html
       └─ 共享页脚里的内联 bootstrap（唯一注入点派生）
            └─ Production Guard：不是生产站 → 直接 return（0 请求）
                 └─ 生产站 → document.createElement('script')
                      type="module"
                      src=https://static.cloudflareinsights.com/beacon.min.js
                      data-cf-beacon='{"token":"dcabf20adc0049bca647eb83b1408a5a"}'
                        ├─ beacon 脚本：static.cloudflareinsights.com  ← 白名单 origin 1
                        └─ 上报：cloudflareinsights.com/cdn-cgi/rum     ← 白名单 origin 2
                             └─ Cloudflare 私有 Dashboard（仅维护者可见）
```

- 托管平台、DNS、仓库结构**均未改变**；没有引入后端 / 数据库 / 用户账号 / Worker / D1。
- 构建期**不请求** Cloudflare（不调 API、不下载远端 JS）：beacon 由**浏览器运行时**加载。
- 唯一的 Cloudflare 标识是浏览器侧 **Site Token**；账户凭据一个都没有（见 §7）。

---

## 3. Tracking Scope

**统计**（`scripts/lib/analytics-routes.js` 的 `ROUTE_RULES`，每条规则都带理由）：

| kind | 路由 | 页数 | 为什么统计 |
|---|---|---|---|
| home | `/` | 1 | 「有没有人在用」最直接的一页 |
| deal | `/deal/<id>/` | 80 | Top Pages 主体；「哪些优惠真的有人看」 |
| model | `/models/<slug>/` | 44 | 判断「下一轮该补哪个资料域」 |
| vendor | `/vendor/<slug>/` | 19 | 判断哪家厂商的资料最值得继续补 |
| need | `/need/<slug>/`（含 3 个 noindex 别名页） | 10 | 别名页统计的是「旧链接还有没有人在点」 |
| category | `/category/<slug>/` | 5 | 筛出来的那批条目值不值得继续收录 |
| collection | `/student/` `/developer/` `/free-api/` | 3 | 按需求/人群的最主要入口 |
| hub | `/category/` `/vendor/` | 2 | 入口密度是否够用 |
| plans | `/plans/coding/` `/plans/api/` | 2 | P1 §21 指定的验收页 |
| 其余 | `/models/` `/plans/` `/archive/` `/archive/<kind>/<id>/` `/changes/` `/feeds/` `/status/` `/docs/data/` | 各 1 | 资料域入口 / 变化趋势观察点 / 订阅需求 / 维护者自用页 / 开放数据是否有人用 |

**合计 173 / 173 个发布 HTML 全部 trackable**（实测，逐页扫描）。

**不统计**：test fixtures · source templates · research artifacts · screenshots · local-only HTML ·
临时 QA 页面 · worktree 产物。它们在产物里本来就不存在；一旦出现，门禁以
「没有被 `ROUTE_RULES` 覆盖」判红（fail-closed），而**不是**静默跳过。

**不统计的环境**（Production Guard，见 §4）：`127.0.0.1` · `localhost` · `file://` ·
preview / test 环境 · 同域其它项目路径。

**不做**（第一版刻意留白）：自定义事件、点击 / 筛选 / 搜索 / 停留时间 / scroll depth、
访客身份、Cookie、localStorage ID。

---

## 4. Production Guard

**唯一实现**：`scripts/lib/analytics.js` 的 `/* ANALYTICS-GUARD:START */ … END */` 区块
（第 124–159 行），其中只有一个纯函数 `isProductionAnalyticsContext({ location, config })`。
浏览器里跑的那段、构建期内联的那段、门禁 `vm` 沙箱里求值的那段，都是**这一份字节**
（独立审计逐字提取后与 `dist/index.html` 比对：**逐字相同**）。

判据（四个条件全满足才加载）：

```
config.enabled === true
location.protocol ∈ { https:, http: }
location.hostname === productionHostname        （小写全等）
location.pathname 以 productionPathPrefix 开头   （前缀以 / 开头且以 / 结尾）
```

真值表（由 `analytics-selftest` 在沙箱里**真实执行**，11 条全过）：

| location | 期望 | 实测 |
|---|---|---|
| `https://buguoshixc.github.io/ai-deals-aggregator/` | enabled | ✅ |
| `https://buguoshixc.github.io/ai-deals-aggregator/deal/abc123/` | enabled | ✅ |
| `https://buguoshixc.github.io/ai-deals-aggregator/plans/api/` | enabled | ✅ |
| `http://127.0.0.1:*` | disabled | ✅ |
| `http://localhost/ai-deals-aggregator/` | disabled | ✅ |
| `file:///C:/dist/index.html` | disabled | ✅ |
| `https://example.com/ai-deals-aggregator/` | disabled | ✅ |
| `https://buguoshixc.github.io/other-project/` | disabled | ✅ |
| `https://buguoshixc.github.io/`（用户页根路径） | disabled | ✅ |
| `https://buguoshixc.github.io/ai-deals-aggregator-old/` | disabled | ✅ |
| `https://buguoshixc.github.io.evil.com/ai-deals-aggregator/` | disabled | ✅ |
| 任意 location + `enabled:false` | disabled | ✅ |

**为什么必须同时判 pathname 前缀**：本站是 GitHub Pages **项目页**，同一个
`buguoshixc.github.io` 下还住着别的项目。只判 hostname 会把同账户其它项目的访问记进本站
——错的归属，且不会有任何东西报错。门禁里有一条**反向证明**：把 `productionPathPrefix`
放宽成 `/` 之后，`/other-project/` 会被**误判为生产**（实测 `true`）——
也就是说「前缀的严格性」不是注释里的一句话，而是可被观测的行为。

---

## 5. Integration Point

```
index.html（共享页脚区，<!--SHARED:footer:START--> … END 之内）
  └─ <!--ANALYTICS:BOOTSTRAP-->                    ← 唯一占位符（源码里出现 1 次）
       └─ scripts/lib/analytics.js                 ← 唯一 beacon 定义 + 唯一配置源
            └─ build-local.js  finalizePage(html, route, prefix)
                 · resolveRouteHrefs()              ← 既有共享解析（按输出深度）
                 · analyticsRoutes.classifyRoute(route)  → trackable / excluded
                 · analytics.inject()               → beacon 或注释（占位符必须恰好 1 个）
                 · analytics.assertPageHtml()       → 残留占位符 0 · bootstrap 数 == 应有值
```

- **为什么挂在页脚**：页脚是站内**唯一被全部页面族共享的片段** —— 首页骨架、详情页、状态页、
  变化页，以及 11 个资料页渲染器（plans / api-plans / plans-hub / models / archive / data-docs /
  feeds / directory）都从 `index.html` 的**同一段页脚**派生。
- **`finalizePage()` 是全部 13 处 HTML 落盘路径的收尾动作**（含首页、80 个详情页、
  93 个落地页、各资料页、状态页、feeds 页）——所以「新页面族也自动带上 beacon」不是因为
  大家记得改，而是**没有别的出口**。
- **为什么不放 `<head>`**：派生页面族各自拼自己的 `<head>`，那里没有共享点；
  Cloudflare 官方也要求 snippet 放在 `</body>` 之前。
- **与官方 snippet 的关系**：同一个 URL、同一个 `type="module"`、同一个
  `data-cf-beacon='{"token":…}'` 载荷，由 `createElement` + `setAttribute` 建出**逐属性相同**
  的元素再插入 `<head>`。唯一差异是**加载时机**（先过守卫再决定加载）——
  这是 P1 §10 允许的「等价于官方 manual beacon」，协议本身没有被重写。
- **官方 snippet（用户提供，逐字）**：
  `<script type='module' src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "dcabf20adc0049bca647eb83b1408a5a"}'></script>`

---

## 6. Privacy / Data Boundary

明确成立（每一条都有门禁盯着）：

```text
无本站 visitor ID          —— 注入段里禁止出现 crypto.randomUUID / navigator.userAgent
无 Cookie 代码             —— 禁止 document.cookie
无 localStorage ID         —— 禁止 localStorage / sessionStorage / indexedDB（注入段逐字扫描）
无 stats JSON              —— 构建期 + 独立门禁双查 traffic.json / analytics.json /
                              public-analytics.json / stats.json
无 Analytics API           —— 源码 / workflow 里没有该 API 域名（含运行时拼接形式）
无公开统计页               —— 无 /stats/、无 /analytics/、无访问计数器、无公开趋势图
不进公开数据集             —— PUBLIC_DATASETS 里没有分析条目；sitemap 里没有统计 URL
```

- Analytics 与 Deals / Plans / API Pricing / Models / History **完全解耦**：
  没有任何一处排序、推荐、SEO 生成或搜索结果读它。
- **页面视觉零变化**：首屏完整可见卡片 9 张（基线 9 张）· 网格起点 227px · 页高 4707px
  （基线 4589px 的容差内）· 卡片高度 192px 未变；产物里没有新增可见元素、没有新增页脚行、
  没有 Analytics 图标 / 按钮 / Dashboard 链接 / 「本站使用 Cloudflare Analytics」提示。
- 唯一与「说明」有关的改动是 README 的隐私声明一小段与本轮文档（纯事实陈述，
  不写「完全匿名」「100% GDPR compliant」这类无法由项目代码证明的绝对化表述）。

**Failure isolation**：注入段整体包在 `try { … } catch (error) { }` 里，`catch` 什么都不做；
它只往 `<head>` 插一个 `<script type="module">`，页面正文、搜索、筛选、排序、弹层、
Plan 页、Model 页都不读它的结果。真浏览器实测（本地 7 个抽样页）：**新增 JS 错误 0**。

---

## 7. Credential Boundary

| | Browser Web Analytics **Site Token** | Cloudflare **API Token / Global API Key** |
|---|---|---|
| 值 | `dcabf20adc0049bca647eb83b1408a5a` | 本项目**没有任何**这种凭据 |
| 位置 | `scripts/lib/analytics.js` 的配置（**browser side**） | —— |
| 会发给访客吗 | **会**（每个页面的 `data-cf-beacon` 里各 1 次） | —— |
| 本轮用到了吗 | 是（唯一需要的 Cloudflare 标识） | **未使用**（完全不需要） |

- 独立审计逐字确认：该 token 只出现在 `scripts/lib/analytics.js:59` 与
  `docs/PRIVATE-ANALYTICS-v1.md:217`（对照表），**每次出现都没有伴随任何账户凭据名**。
  它是**浏览器侧标识符，不是密钥**，读不到任何分析数据。
- 账户凭据扫描：`git grep` 六种「名字 = 值」形状（`CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` /
  `GLOBAL_API_KEY` / `X-Auth-Key` / `X-Auth-Email` / `CLOUDFLARE_ACCOUNT_ID`）
  → **exit 1，无命中**（tracked 与 `--untracked` 都无）。全部 290 个 dist 文件同样零命中。
- 门禁**反向**也断言了一件事：合法的 browser Site Token **不被**判成泄密 ——
  否则那条门禁会逼着人把 token 藏进 GitHub Secret，而那恰好破坏构建确定性。
- `scripts/lib/secret-scan.js` 新增 6 条 Cloudflare **账户凭据**模式（沿用既有「只在
  名字带上了值时报红」的口径，避免把合法讨论凭据的文档判成泄密）。

**为什么不做 build-time token 注入**：Site Token 最终必然出现在发给浏览器的 HTML 里，
用它做 GitHub Secret 注入只会造成 `local dist != CI dist`，与「两次同源构建逐字节一致」
直接冲突。所以 token 确定性地写在配置里。

---

## 8. Build Determinism

**两次构建逐字节对账（全量 dist）**：

| 步骤 | 结果 |
|---|---|
| 构建 A（首次完整构建后的 dist） | 290 个文件，逐个 sha256 |
| 构建 B（再跑一次 `build-local.js`） | 290 个文件，逐个 sha256 |
| 比对 | **完全一致**（`Compare-Object` 无差异） |

另外两条**同源但独立**的可复现门禁也在门禁里跑过并全绿：

- `Feeds reproducibility (build twice, byte-compare) → --dir=dist`：**2 次构建，全部逐字节一致**；
- **全量产物逐字节对账**（基线 `45b7b47` 的独立 worktree 构建 vs 本轮最终产物）：

  ```
  基线文件 290 · 本轮文件 290
  只存在于基线：（无）      只存在于本轮：（无）
  逐字节比对：HTML 173 个 · 非 HTML 117 个
  归一后仍不同的文件：0 个（除分析注入外，产物完全一致）
  页脚泄漏检查：0 / 173 个页面有问题
  ```

  ——「归一」只抹掉分析注入本身（`<script data-dsh-analytics=…>` 段、源码模板注释、
  占位符、以及占位符那一行留下的空白）；**其余每一个字节都必须相同**，包括 117 个
  非 HTML 文件（deals / plans / api-plans / models / registry-links / feed / sitemap /
  Manifest / logos / og-image …）。

> **对账抓到过一个真缺陷（如实记录）**。第一轮对账报出 173 个 HTML 全部有差异，
> 定位在 `</footer>` 之后：我写在 `index.html` 共享页脚里的说明注释**多了一个 HTML
> 注释结束符**，注释提前闭合，后半段说明文字作为**可见文本**泄漏进了每一个页面。
> **既有断言一条都没抓到它** —— bootstrap 仍是 1 个、没有占位符残留、没有 JS 错误、
> 正文长度与页高都在容差内。抓住它的是这条**全量逐字节对账**。
> 修法：合成一个注释块，并把两条约束写进注释本身（不许标签字面量、不许第二个结束符）；
> 修复后重跑完整门禁 22 步全绿，并新增一条页脚泄漏检查（`</footer>` 到 `</div>` 之间
> 除注释与 bootstrap 外无可见文本）。提交：`3ce18c6`。

构建期不做的事（逐条确认）：不请求 Cloudflare API · 不请求 Dashboard · 不读墙上时钟 ·
不下载远端 JS 写进 dist · 不生成随机 ID。beacon 的 JS 由**浏览器运行时**从 Cloudflare 加载。

---

## 9. Local Verification

**真浏览器（Edge，headless）· 服务地址 `http://127.0.0.1:<随机端口>/`**：

```
=== 26) 私有分析（Production Guard / 覆盖 / 端点）===
  ✓ 抽样 7 个页面在真实 DOM 里各有一个 analytics bootstrap（含 noindex / 深层路由）
      — /=1 · plans/api/=1 · plans/coding/=1 · models/=1 · models/claude-fable-5.1/=1 · vendor/aliyun/=1 · changes/=1
  ✓ 抽样页面里没有残留的分析占位符 — 0 个
  ✓ 抽样页面正文都有内容（分析注入没有把正文吃掉） — /:12284 · plans/api/:14339 · plans/coding/:8224 ·
      models/:4589 · models/claude-fable-5.1/:1403 · vendor/aliyun/:2781 · changes/:2445
  ✓ 本地：真实资源计时里 0 次 Cloudflare 请求（不是「没看到」，是浏览器确实没去取） — 全部 0
  ✓ 本地：网络层同样 0 次分析请求（guard 在插入 <script> 之前就返回了） — 本轮累计 0 次
  ✓ 本地：抽样页面没有新增 JS 错误（Analytics 失败不得影响产品） — 全部 0
  ✓ 本地：没有出现白名单之外的外部请求 — 0 个

✅ 验收 709 项，失败 0 项
```

机器可读指标（`research/_raw/private-analytics-v1/verify.json`）：

```json
{ "total": 709, "failed": 0,
  "metrics": { "cards": 50, "coveredDeals": 80, "firstScreenFull": 9, "pageHeight": 4707,
               "externalRequests": 0, "analyticsRequests": 0, "failedRequests": 0, "jsErrors": 0 } }
```

**`localhost` 主机名（而不是 `127.0.0.1`）的补充验证**：本地静态服务只绑 `127.0.0.1`，
因此用一个极小的脚本在**同一份 guard 源码**上对 `localhost` 主机名求值 —— 结果同样
`disabled`（见 §4 真值表第 5 行）。**没有**为此启动一个 `localhost` 监听端口：
`127.0.0.1` 与 `localhost` 走的是**同一个函数、不同的 hostname 字符串**，而 hostname
是显式传入的入参，不是从环境推断的。

---

## 10. Production Coverage

**独立门禁 `npm run selftest:analytics`（读 `dist/` 现场，不读构建期记录）实测**：

```
3) 产物页面覆盖（dist/**/*.html 现场扫描）
  ✓ 每个页面都能被判出统计范围（没有「未登记的页面族」）
  ✓ trackable 页面 each exactly 1 bootstrap（173 页）
  ✓ 声明为 excluded 的页面一律 0 个 bootstrap
  ✓ 产物里没有任何残留占位符
  ✓ bootstrap 总数 == trackable 页面数（不存在「某页多注入了一次」）
  ✓ 产物里没有分析数据文件（traffic.json / analytics.json / public-analytics.json / stats.json）与 /stats/ 目录
      页面家族：deal×80 · model×44 · vendor×19 · need×10 · category×5 · collection×3 · hub×2 ·
                plans×2 · archive-index×1 · changes×1 · data-docs×1 · feeds×1 · home×1 ·
                models-index×1 · plans-hub×1 · status×1
   页面覆盖：173 个 HTML（trackable 173 · excluded 0）· bootstrap 173 个
```

独立审计（另一个代理，只读）用两条互不相同的扫描复核：**173 个 HTML，逐个文件的
`data-dsh-analytics=` 计数 min = 1 / max = 1，没有一个文件是 0 或 ≥2**；
`beacon.min.js` 与 Site Token 在每页也各恰好 1 次（没有「属性只有一份、脚本藏了两份」）；
非 HTML 文件（117 个）里零命中。

**牙测试（8 种定向篡改，在临时副本上做，每一种都必须被扫出来）**：全过 ——

1. 同一页多注入一份 bootstrap 2. 删掉某个正常生产页的 bootstrap 3. token 改成 placeholder
4. 抽掉 guard（beacon 会在 localhost 也发出去）5. `productionPathPrefix` 改成 `/`
6. 凭空多出 `stats.json` 7. 新增没登记的页面族 8. 留下一处未解析的占位符。

外加一条：**干净产物必须静默**（零问题）—— 否则「抓到篡改」什么也证明不了。

---

## 11. Gate

命令**从当前 `package.json` / `.github/actions/gate/action.yml` 动态读取**（未使用历史报告里的旧数字）。
本地按 CI 逐步执行（复合 action 的 45 个 run 步骤里，`Prepare browser` /
`Browser availability decision` 两步是 CI 路径专用：本地用 `DSH_EDGE` 直接跑真浏览器验收）。

| # | 步骤 | 结果 |
|---|---|---|
| 1 | `node scripts/validate.js --strict` | ✅ 校验通过（strict 模式） |
| 2 | `check-reproducible.js` | ✅ 值全部有源，且管线幂等 |
| 3 | `history-verify.js` | ✅ 基线 + 事件重放逐字段等于当前 deals.json |
| 4 | `migrate-audience-verify.js` | ✅ 15/15 |
| 5 | `zh-todo.js --check` | ✅ 译文与数据一致 |
| 6–29 | 各 selftest（zh / expiry / text / health / provenance / history / changes / feeds / seo / audience / app-token / ai / fixtures / plans / plan-history / deal-plan-links / api-plans / api-plans 可复现 / api-plan-history / models / models 可复现 / registry-links / coverage） | ✅ 全部通过（例：audience 191 项 · plans 264 项 · api-plans 175 项 · feeds 131 项 · SEO 63 项） |
| 30 | `build-local.js`（Assemble site） | ✅ 产物自检通过 |
| 31 | `models-page-selftest.js --dir=dist` | ✅ 75 项 |
| 32 | `planshub-selftest.js --dir=dist` | ✅ 32 项 |
| 33 | `vendor-page-selftest.js --dir=dist` | ✅ 52 项 |
| 34 | `archive-selftest.js --dir=dist` | ✅ 69 项 |
| 35 | `data-docs-selftest.js --dir=dist` | ✅ 57 项 |
| 36 | **`analytics-selftest.js --dir=dist`（本轮新增）** | ✅ **31 项**（含 8 种篡改牙测试） |
| 37 | `check-feeds-reproducible.js --dir=dist` | ✅ 2 次构建逐字节一致 |
| 38 | `check-plans-reproducible.js` | ✅ 23 条 |
| 39 | `check-plan-history.js` | ✅ 可重建 |
| 40 | `seo-verify.js` | ✅ 11 项 0 失败 |
| 41 | `verify-site.js`（Real-browser acceptance） | ✅ **709 项 0 失败** |
| 42 | `verify-site.js --compare=…`（Regression verify） | ✅ **715 项 0 失败** |
| — | `check-ci-consistency.js`（CI 口径） | ✅ **37 项 0 失败** |

**构建确定性**：见 §8（290 文件两次构建逐字节一致）。

**门禁强度没有被削弱**：没有删除断言、没有下调阈值、没有扩大 allowlist、没有关闭
browser verify、没有允许 console error。本轮唯一「放宽」的地方是
`planshub-selftest` 与 `build-local` 的**「这一页不许有内联脚本」**两条断言 ——
它们改为先剥掉**全站共享页脚里的分析段**（剥离用的是唯一实现 `analytics.stripBootstrap()`），
剥掉之后**原判据逐字不变**。这是必要的：分析 bootstrap 与「主题脚本 / JSON-LD」同属
允许的共享内联段，它加载外部观测脚本、不改变页面行为。

**本轮新增/改动的门禁接线**（三处冻结文件原子同步，任一不同步 CI 立刻红）：

| 文件 | 改动 |
|---|---|
| `package.json` | 新增 `selftest:analytics` |
| `.github/actions/gate/action.yml` | 新增 `Analytics self-test (bootstrap count / production guard / provider)` 步骤（排在 Assemble site 之后，显式 `--dir=dist`） |
| `scripts/tools/check-ci-consistency.js` | `GATE_STEP_NAMES` + `GATE_STEP_RUN` 各加一条；加入 `GATE_ARTIFACT_STEPS`；新增断言 **(18)** |
| `.github/workflows/verify.yml` | `--expect-checks` **36 → 37**（保持单行，读取器 fail-closed） |

**外部请求 Gate 没有被放宽**（P1 §15）：`verify-site.js` 仍然逐条判外部请求来源，
只放行 `ANALYTICS.allowedOrigins` 里的两个精确 origin（脚本 + 上报），
其余一律计进 `externalRequests` 并判红；**没有**出现「`externalRequests.length > 0`
就不再检查」那种改法。本地因为 guard 生效，两个账本都是 0。

---

## 12. Online Smoke

**未运行**（尚未部署）。

原因：本轮按约定**推分支 + 开 PR，不合并**——`deploy.yml` 只在 `master` 的 push 或
`Collect AI Deals` 的 `workflow_run` 上触发，因此线上仍是旧版本，此时打线上看到的
不会是本轮产物，跑出来的结果没有意义。

PR 已创建：**https://github.com/buguoshixc/ai-deals-aggregator/pull/36**（CI 结果见 §12.1）。

合并后请运行（这是**唯一**需要在部署后做的机器验证）：

```bash
node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/
```

该命令在本轮新增了第 26 节的**线上分支**，会断言：

1. 抽样 7 个页面各恰好 1 个 bootstrap（`/`、`/plans/api/`、`/plans/coding/`、`/models/`、
   任一 model detail、`/vendor/`、`/changes/`）；
2. 至少一个页面真的加载了 `beacon.min.js`，且请求 URL **精确等于**
   `https://static.cloudflareinsights.com/beacon.min.js?token=<配置里的 Site Token>`；
3. 分析请求只发往白名单的两个 origin，其它外部请求仍然判红；
4. 每页核心 JS 无错误；正文完整；页面视觉与布局与本地一致；
5. GitHub Pages 项目子路径（`/ai-deals-aggregator/`）没有被处理错 —— canonical 自指、
   页脚相对路径、`logos.css` / `favicon.svg` 全部按 2 层深度解析。

**未观测到 beacon 时的处置**：不立即判失败（广告拦截器 / 网络 / 版本差异都可能），
第 26 节会打印 `ℹ️ 未观测到 beacon 请求（可能是广告拦截器…）`，由人工看 DevTools 的
Network 面板确认。**不会**通过往仓库里加 Analytics API Token 来排查（P1 §29）。

### 12.1 已运行的相关 CI 结果

| 检查 | 状态 |
|---|---|
| PR #36 的 `gate`（verify.yml，PR 路径） | 见 https://github.com/buguoshixc/ai-deals-aggregator/pull/36/checks |

> 记录方式：本轮结束时该 check 处于 `pending`（提交后不久查询）。
> **不写「应该通过」**——请以 PR 页面上的实际结论为准。

### 12.2 部署信息（如实记录）

| 项 | 值 |
|---|---|
| 分支 | `private-analytics-v1`（已推送，跟踪 `origin/private-analytics-v1`） |
| 提交 | `623fce7`（实现）· `59340a5`（报告与验收指标）· **`3ce18c6`（页脚注释修复，当前 HEAD）** |
| 基线 | `45b7b47`（`origin/master`） |
| PR | https://github.com/buguoshixc/ai-deals-aggregator/pull/36 |
| Required CI | 见 PR 页面（**未运行在线 Smoke**，因为未合并） |
| Deploy | **未运行**（未合并，因此 `deploy.yml` 未触发） |
| 线上 Smoke | **未运行**（同上） |

---

## 13. Cloudflare Dashboard

```
OWNER VERIFICATION REQUIRED
```

我**没有**、也**无法**访问你的 Cloudflare Dashboard（那需要账户登录，而本轮刻意
不持有任何账户凭据）。因此「数据是否已开始出现」这一项**只能由项目所有者确认**，
我不假装验证。

合并部署后，请在 Cloudflare Dashboard 人工确认：

1. **Web Analytics → 站点**：hostname 应为 `buguoshixc.github.io`；
   如果 Dashboard 支持 **Rules / Advanced options**（Path Rule），可以额外限制到
   `/ai-deals-aggregator/` 项目路径 —— 这**不是必须的**（代码侧已经用 pathname 前缀
   把统计限制在本项目内），但加一条能防止将来同域其它项目被误统计。
2. 至少观察这四项开始出现数据：**Page Views** · **Visitors** · **Top Pages** · **Referrers**。
3. 若几分钟后仍无数据，排查顺序（**不要**通过往仓库加入 Analytics API Token 来排查）：
   hostname · project path · Site Token 是否与页面里的一致 ·
   DevTools Network 里 `beacon.min.js` 与 `cloudflareinsights.com/cdn-cgi/rum` 是否发出 ·
   CORS · 浏览器广告拦截器 · Cloudflare Site Rules。
   **数据存在处理延迟**：不要因为暂时没出现就判失败。

---

## 14. Data Integrity

**逐项确认（与基线 `45b7b47` 对照，全部用实际文件/构建输出核过）**：

| 集合 | 结果 |
|---|---|
| **Deals unchanged** | ✅ 源数据零改动（`git diff` 不含 `deals.json`）；产物 `dist/deals.json` 业务字段与基线**逐字节相同** |
| **Plans unchanged** | ✅ 同上（`plans.json` 23 条） |
| **API Plans unchanged** | ✅ 同上（`api-plans.json` 13 条） |
| **Models unchanged** | ✅ 同上（`models.json` 44 条；`model-registry-links.json` 64 条映射） |
| **History unchanged** | ✅ 同上（`deal-history.json` / `plan-history.json` / `api-plan-history.json` 未改） |
| **Manifest unchanged** | ✅ `dist/data/index.json` **9 份**数据集，与基线**逐字节相同**（Analytics 不在其中） |
| **Feed set unchanged** | ✅ **24 份 × 2 = 48 文件**，逐字节相同；`/feeds/` 仍列出 51 个订阅地址 |
| **Sitemap member set unchanged** | ✅ **170 条** `<loc>`，逐字节相同；没有新增统计 URL |
| HTML page count | ✅ **173**（可索引 170 + noindex 别名 3）—— 未变 |
| indexable page count | ✅ **170** —— 未变 |
| dist 文件数 | ✅ **290**（beacon 内联，不新增产物文件） |
| Registry links | ✅ 64 条（未变） |

**最强的一条证据**：全量产物对账 —— 基线 vs 本轮，**290 vs 290 个文件、无增无删；
173 个 HTML 的差异逐字只等于注入的 beacon 段；其余 117 个非 HTML 文件逐字节相同**。

独立审计（另一个代理，只读，未参与实现）的结论：C3（sitemap/feed/dataset 集合不变）
**VERIFIED**；C4（每页 exactly 1 bootstrap、只有一个注入点）**VERIFIED**；
C5（无 Cloudflare 账户凭据、Site Token 不算泄密）**VERIFIED**；
C6（不调用 Cloudflare Analytics API）**VERIFIED**；
C7（Production Guard 只有一份实现，且 `dist/index.html` 里逐字就是区块里的那份）**VERIFIED**。
它对 C1/C2 判 PARTIAL 的两条理由都是**过程性**的、且本轮已处置：
① 改动当时尚未提交（现已提交 `623fce7` 并推送）；② 审计窗口内我与门禁在并发构建
（`dist` 重建、`translations_zh.json` 出现瞬时差异 —— 该文件现已确认与 base 逐字节相同）。

---

## 15. Remaining Risks

1. **广告拦截器导致低估**：任何浏览器侧统计都会被 uBlock 类拦截器挡掉一部分。
   本站不打算为此做服务端旁路（那会引入后端，本轮明确禁止）。**结论应当按「趋势」读，
   不按「绝对值」读**。
2. **Dashboard 数据存在处理延迟**：Cloudflare 侧从接收到可见可能有几分钟延迟，
   不要据此判失败。
3. **Production hostname / path 未来迁移需同步配置**：`productionHostname` /
   `productionPathPrefix` 必须与 `lib/feeds.js` 的 `SITE_URL` 一致 —— 门禁会逐字对账并报红，
   但**迁移时仍然要人改配置**（`docs/PRIVATE-ANALYTICS-v1.md` 的 Disable/Verification 两节）。
4. **风控与外链无关，但值得知道**：分析请求只去 Cloudflare 的两个 origin，
   不影响本站「不热链第三方 CDN」的既有承诺；`verify-site` 的外部请求 Gate 仍会
   对任何**新增**的外部请求报红。
5. **Core Web Vitals 的观测口径**：官方在页面首次 hidden 之后才上报 Web Vitals
   （见 data-origin 文档）。因此短会话 / 快速离开的样本可能只有 pageview 而没有 vitals。
   本轮门禁**不**断言上报端点请求（那样判据会不确定），只断言脚本加载与端点白名单。
6. **`spa` 默认行为**：官方 snippet 未显式设置 `spa`，beacon 会按文档自动处理 History API
   导航。本站是静态多页站、**没有** SPA 路由（视图切换不走 pushState），因此预期不会产生
   重复计数；这一条我没有在真机线上长期观察过，**列为待观察项**而不是已证结论。
7. **`localStorage` 的既有使用**：站点其它功能（主题、视图、收藏、对比）本来就用
   `localStorage`；本轮分析层一个字节都不读它们。若将来有人以为「本站不用 localStorage」，
   这是个容易混淆的点，已在 README 与 `docs/PRIVATE-ANALYTICS-v1.md` 写明。
8. **`--url=` 线上 Smoke 会真的产生访问**：它是对生产站的真浏览器访问，因此那几次
   pageview 会计入 Cloudflare 数据（几条量级，不影响趋势）。本轮**没有**在本次运行中
   执行该命令（未部署）。
9. **本地 Worktree 与主工作区**：本轮成果在 `.worktrees/private-analytics-v1`（分支
   `private-analytics-v1`）。主工作区仍是旧的 `433477d` 且带未提交的其它文件；
   合并 PR 后请以 `master` 为准，不要误用主工作区的旧 HEAD。

---

## 附：本轮交付物清单

| 文件 | 说明 |
|---|---|
| `scripts/lib/analytics.js` | **唯一配置源 + 唯一 beacon 定义**（含 ANALYTICS-GUARD 区块） |
| `scripts/lib/analytics-routes.js` | 统计范围声明（路由 → 要不要统计，每条带理由） |
| `scripts/tools/analytics-selftest.js` | 独立门禁（31 项，含 8 种篡改牙测试） |
| `docs/PRIVATE-ANALYTICS-v1.md` | 完整说明：Purpose / Provider / Data Boundary / No Public Stats / No Repository Storage / No User Identity / Production Guard / Credentials / Disable / Verification |
| `index.html` | 共享页脚里的唯一占位符 `<!--ANALYTICS:BOOTSTRAP-->` |
| `scripts/tools/build-local.js` | `finalizePage()` + 13 处 HTML 写出接线 + 2 条产物自检 |
| `scripts/lib/secret-scan.js` | 6 条 Cloudflare 账户凭据模式 |
| `scripts/tools/verify-site.js` | 第 26 节（本地零上报 / 线上端点）+ 外部请求白名单分类 |
| `scripts/tools/planshub-selftest.js` | 「不许内联脚本」断言改为先剥离共享分析段（唯一实现） |
| `scripts/tools/check-ci-consistency.js` | 步骤冻结三处 + 新断言 (18) |
| `.github/actions/gate/action.yml` | 新增 Analytics self-test 步骤 |
| `.github/workflows/verify.yml` | `--expect-checks` 36 → 37 |
| `package.json` | `selftest:analytics` |
| `README.md` · `PROJECT_STATUS.md` | 隐私声明一段 + 本轮状态一节 |
| `research/_raw/private-analytics-v1/verify.json` | 机器可读验收指标（709 项 0 失败） |
| `AI_DEALS_PRIVATE_ANALYTICS_V1_PROMPT.md` | 本轮题面（入库留档） |
