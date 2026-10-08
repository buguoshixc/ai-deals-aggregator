# anthropic：重定向链与官方定价页可见原文（Tier-1）

抓取日：2026-10-08（Asia/Shanghai；HTTP 头上的 Date 是 GMT，逐字见下）

本文件只放**结论所需的片段**：重定向链的原始响应头 + 定价页可见文本窗口。
完整的第三方 HTML 原件（`claude_com_pricing.html` / `claude_com_platform_api.html` 等，约 1 MB/份）
按 `docs/EVIDENCE-POLICY.md` §2/§3 **不入库**，本机保留；重跑命令：

```bash
curl -sS -L --max-redirs 5 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
     -o claude_com_pricing.html -D claude_com_pricing.headers.txt \
     -w "%{http_code} %{size_download}" https://claude.com/pricing
```

## 1. 记录里 `officialUrl` 的那条 URL：逐跳响应头（`curl -L`，逐字）

```
$ curl -sS -o NUL -D - --max-redirs 0 https://docs.anthropic.com/en/docs/about-claude/pricing
HTTP/1.1 301 Moved Permanently
Date: Thu, 08 Oct 2026 10:18:42 GMT
Content-Type: text/html; charset=UTF-8
Transfer-Encoding: chunked
Connection: keep-alive
Location: https://platform.claude.com/docs/en/docs/about-claude/pricing
Server: cloudflare
CF-RAY: a47467300ec0d44c-HKG
alt-svc: h3=":443"; ma=86400

$ curl -sS -o NUL -D - -L --max-redirs 10 https://platform.claude.com/docs/en/docs/about-claude/pricing
HTTP/1.1 307 Temporary Redirect
Date: Thu, 08 Oct 2026 10:20:01 GMT
Content-Type: text/html
Content-Length: 29
Connection: keep-alive
location: /docs/en/about-claude/pricing
x-cloud-trace-context: 01668642b89a041fbc0aefe2dab1dd73
Server: cloudflare
via: 1.1 google
alt-svc: h3=":443"; ma=86400
cf-cache-status: BYPASS
set-cookie: __cf_bm=2KuGJUPS7kGDp3IcaxL4UIAM5g725qb.HVAjO.ZXAPc-1791454801.1269596-1.0.1.1-hiLr2RDby6P3hRTOzIZMarPmfsQqRE4NaDNVGhkd9cJxgv4ibcOF0wclhN6DFQcw4BKI6Dm3ddIRjruGBftKt_Yj2Ez5nKrVt4cqZHwMuxz3oIEwxNIazDD3.6oXYyML; HttpOnly; SameSite=None; Secure; Path=/; Domain=claude.com; Expires=Thu, 08 Oct 2026 10:50:01 GMT
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
CF-RAY: a474691b08da03e7-HKG

HTTP/1.1 307 Temporary Redirect
Date: Thu, 08 Oct 2026 10:20:02 GMT
Content-Type: text/html
Content-Length: 70
Connection: keep-alive
strict-transport-security: max-age=31536000; includeSubDomains; preload
x-xss-protection: 1; mode=block
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
referrer-policy: strict-origin
Cache-Control: private, no-store
location: https://www.anthropic.com/app-unavailable-in-region?utm_source=country
x-cloud-trace-context: 6705129f89dd3bb6c2466d9ef516aae1
Server: cloudflare
via: 1.1 google
alt-svc: h3=":443"; ma=86400
cf-cache-status: BYPASS
set-cookie: __cf_bm=hb8Q6MncKv_7ddULDNWHSGuUno2GC1qHjiPaa5NwHUc-1791454802.0083277-1.0.1.1-p5BuUwYJmO_.C2aDu9WHu2t1fr2HYyMjpBBMFGQq5XHWEks1..IxSbOhNrXEHrdDD3Tq_f3NNXLyEeFScaebfhsCZidxIKJ8VBUEDUuULgYGJ3cZ9XPxHKZbvA0XnllB; HttpOnly; SameSite=None; Secure; Path=/; Domain=claude.com; Expires=Thu, 08 Oct 2026 10:50:02 GMT
CF-RAY: a47469208aa603e7-HKG

HTTP/1.1 301 Moved Permanently
Date: Thu, 08 Oct 2026 10:20:03 GMT
Content-Type: text/html
Content-Length: 166
Connection: keep-alive
Location: https://claude.com/app-unavailable-in-region
CF-Ray: a47469269d136aba-HKG
CF-Cache-Status: DYNAMIC
Cache-Control: private
Server: cloudflare
Set-Cookie: _cfuvid=NzHabpppAZuNY_qJeSWLmDz2uabqdvbcwt90EkwnBkQ-1791454803.019413-1.0.1.1-uRJNjuYphTguR_iwu8W83bR84oxJ6QaWA_UR0uQ4jyc; HttpOnly; SameSite=None; Secure; Path=/; Domain=website.anthropic.com
alt-svc: h3=":443"; ma=86400
x-wf-region: us-east-1
Vary: accept-encoding
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.intellimize.co https://cdnjs.cloudflare.com https://d3e54v103j8qbb.cloudfront.net https://cdn.prod.website-files.com https://hubspotonwebflow.com https://www.googletagmanager.com https://a-cdn.anthropic.com https://connect.facebook.net https://www.youtube.com https://cdn.jsdelivr.net https://cdn.finsweet.com https://maps.googleapis.com https://js.hsforms.net https://player.vimeo.com https://claude.com/shared/webflow-antalytics.js https://assets.claude.ai/sdk/antalytics/; style-src 'self' 'unsafe-inline' https://cdn.prod.website-files.com https://cdnjs.cloudflare.com https://fonts.googleapis.com; img-src 'self' data: https://cdn.sanity.io https://www-cdn.anthropic.com https://cdn.prod.website-files.com https://img.youtube.com https://i.ytimg.com https://www.facebook.com https://maps.googleapis.com https://maps.gstatic.com https://www.googletagmanager.com https://forms-na1.hsforms.com; frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://cdn.embedly.com https://assets.claude.ai https://a.anthropic.com https://*.intellimizeio.com https://anthropic.swoogo.com https://*.hsforms.com https://*.hubspot.com; connect-src 'self' blob: https://cdn.intellimize.co https://api.intellimize.co https://log.intellimize.co https://cdn.sanity.io https://links.iterable.com https://a-cdn.anthropic.com https://a-api.anthropic.com https://www.facebook.com https://www.google-analytics.com https://cdn.prod.website-files.com https://hubspotonwebflow.com https://maps.googleapis.com https://vimeo.com https://www.googletagmanager.com https://code.claude.com https://forms.hsforms.com https://hubspot-forms-static-embed.s3.amazonaws.com https://cdnjs.cloudflare.com https://www.gstatic.com https://api.anthropic.com/api/event_logging/ https://claude.com; media-src 'self' https://cdn.sanity.io; worker-src 'self' blob:; font-src 'self' data: https://cdn.prod.website-files.com https://fonts.gstatic.com; object-src 'none'; frame-ancestors 'self'; base-uri 'self'
Strict-Transport-Security: max-age=3600

HTTP/1.1 200 OK
Date: Thu, 08 Oct 2026 10:20:03 GMT
Content-Type: text/html; charset=utf-8
Transfer-Encoding: chunked
Connection: keep-alive
Cache-Control: private, max-age=0, must-revalidate
Link: </_next/static/media/AnthropicMono_Italic_Web-s.p.39343088.woff2>; rel=preload; as="font"; crossorigin=""; nonce="vGQltqMC6eCQNznlZM9VUw=="; type="font/woff2", </_next/static/media/AnthropicMono_Roman_Web-s.p.80d4607c.woff2>; rel=preload; as="font"; crossorigin=""; nonce="vGQltqMC6eCQNznlZM9VUw=="; type="font/woff2", </_next/static/media/AnthropicSans_Italic_Web-s.p.6550bf15.woff2>; rel=preload; as="font"; crossorigin=""; nonce="vGQltqMC6eCQNznlZM9VUw=="; type="font/woff2", </_next/static/media/AnthropicSans_Roman_Web-s.p.050e7498.woff2>; rel=preload; as="font"; crossorigin=""; nonce="vGQltqMC6eCQNznlZM9VUw=="; type="font/woff2", </_next/static/media/AnthropicSerif_Italic_Web-s.p.43888cc6.woff2>; rel=preload; as="font"; crossorigin=""; nonce="vGQltqMC6eCQNznlZM9VUw=="; type="font/woff2", </_next/static/media/AnthropicSerif_Roman_Web-s.p.c28786b4.woff2>; rel=preload; as="font"; crossorigin=""; nonce="vGQltqMC6eCQNznlZM9VUw=="; type="font/woff2", </_next/static/chunks/b361840ccdd9f1ba.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/45606e4d59b5de68.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/e13d83a8a53acbbb.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/7d92f0a84272e102.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/47ef4466364f409c.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/724c8593bbdde418.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/cf745c4b3f3ac840.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/f2978ed852d5142f.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/204bb0973f0559c5.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/a4768d74cb23418f.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/460a3a2ec566ba0d.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/c66465a02e9323a6.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/034c0d400ac5dcdc.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/4be8285ac2227a29.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/a273a1fb11bb50fa.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw==", </_next/static/chunks/7b12f906d696a816.css>; rel=preload; as="style"; nonce="vGQltqMC6eCQNznlZM9VUw=="
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch
content-security-policy-report-only: default-src 'self'; script-src 'nonce-vGQltqMC6eCQNznlZM9VUw==' 'strict-dynamic' 'self' 'wasm-unsafe-eval' https://assets.claude.ai https://www.googletagmanager.com https://js.hsforms.net https://js.hs-scripts.com https://js.hs-analytics.net https://js.hsadspixel.net https://js.hs-banner.com https://embed.typeform.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://cdn.sanity.io https://assets.claude.com https://assets-staging.claude.com https://i.ytimg.com https://forms.hsforms.com https://forms-na1.hsforms.com https://track.hubspot.com; font-src 'self' https://fonts.gstatic.com; media-src 'self' https://cdn.sanity.io https://assets.claude.com https://assets-staging.claude.com https://assets.claude.ai; frame-src https://www.youtube-nocookie.com https://form.typeform.com https://*.hsforms.com https://*.hubspot.com https://a.claude.com https://assets.claude.ai https://eulerapp.com; connect-src 'self' https://api.anthropic.com https://cdn.sanity.io https://assets.claude.com https://assets-staging.claude.com https://links.iterable.com https://claude.ai/api/billing/subscription_pricing https://forms.hsforms.com https://forms-na1.hsforms.com https://api.hubapi.com/hs-script-loader-public/ https://www.googletagmanager.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self' https://*.hsforms.com https://links.iterable.com; report-uri /api/csp-report; report-to csp
cross-origin-opener-policy: same-origin-allow-popups
cross-origin-resource-policy: same-site
permissions-policy: camera=(self), microphone=(self), geolocation=(self), payment=(self)
referrer-policy: strict-origin-when-cross-origin
reporting-endpoints: csp="/api/csp-report"
x-content-type-options: nosniff
x-frame-options: SAMEORIGIN
x-xss-protection: 0
set-cookie: __cf_bm=2c.Ein3i33B4dPUcQzuP.7VwvpZcUqcM4G8pOJmTfhY-1791454803.7880528-1.0.1.1-lCSELzRk4bTj1Y5WMd5lP1MUVOMXMm9I3aNuX6k67zL2EhMZsof4cfsA9fH2J2dXaOyF1JffCrFZqFN31miNX.ga5kX0SNVAw0nIvIVugAQAkwguY9IXKsl4lgzutRUU; HttpOnly; SameSite=None; Secure; Path=/; Domain=claude.com; Expires=Thu, 08 Oct 2026 10:50:03 GMT
Server: cloudflare
CF-RAY: a474692bab744e53-HKG
alt-svc: h3=":443"; ma=86400
```

链路（按上面的响应头逐字读出）：

1. `https://docs.anthropic.com/en/docs/about-claude/pricing` → **301**，`Location: https://platform.claude.com/docs/en/docs/about-claude/pricing`（跨域；注意路径里 `docs` 出现两次）。
2. `https://platform.claude.com/docs/en/docs/about-claude/pricing` → **307**，`location: /docs/en/about-claude/pricing`（同域路径归一）。
3. `https://platform.claude.com/docs/en/about-claude/pricing` → **307**，`location: https://www.anthropic.com/app-unavailable-in-region?utm_source=country`（**区域门**：`app-unavailable-in-region`）。
4. `https://www.anthropic.com/app-unavailable-in-region?utm_source=country` → **301** → `https://claude.com/app-unavailable-in-region`。
5. `https://claude.com/app-unavailable-in-region` → **200**（终页是「该应用在当前地区不可用」说明页，不是定价页）。

> 与 `NEXT-STEPS.md` §A.1 登记的读数的差别：§A.1 写的是「→ platform.claude.com → www.anthropic.com（营销首页，没有 API 价格表）」；
> **今天从本网络看，第 3 跳之后并不是营销首页，而是区域封锁页**（`app-unavailable-in-region`，HTTP 200 的说明页）。
> 两者结论方向一致（用户点到的不是定价页），但「终点是什么页面」这一条今日读数与登记不同，如实记下。

## 2. 候选官方定价页：可达性与性质

| 候选 URL | 结果 | 性质 |
|---|---|---|
| `https://claude.com/pricing` | **200**，1,191,415 bytes | Claude 官方「Plans & pricing」页，含 **API tab**（`/pricing#api`）的逐模型价格模块 |
| `https://claude.com/platform/api` | **200**，1,035,017 bytes | Claude Platform 落地页，含同源的同款价格模块 |
| `https://www.anthropic.com/pricing` | **301** → `https://claude.com/pricing` → 200 | 官网 pricing 入口已改指 claude.com |
| `https://platform.claude.com/docs/en/about-claude/pricing` | **307** → `…/app-unavailable-in-region` → 200 | 官方**详细**定价页，本网络**被区域封锁**，读不到正文 |
| `https://platform.claude.com/docs/en/about-claude/pricing.md` | 同上（区域封锁） | Mintlify 的 `.md` 变体同样被门拦住 |
| `https://docs.claude.com/en/docs/about-claude/pricing` | **302** → `platform.claude.com/docs/en/about-claude/pricing` → 区域封锁 | 旧文档域现在是 302 跳板 |
| `https://platform.claude.com/docs/en/home` | 区域封锁 | 连 Console 文档首页也拦 |
| `https://claude.com/pricing.md` | **404** | 没有 `.md` 变体 |
| `https://platform.claude.com/` | **403**（Cloudflare「Just a moment...」） | 控制台首页人机校验 |

`claude.com/pricing` 页面自己给「详细定价」的出口是这三个（从 HTML 里抓到的 `href`，逐字）：

```html
href="https://platform.claude.com/docs/en/about-claude/pricing"
href="https://platform.claude.com/docs/en/about-claude/pricing#fast-mode-pricing"
href="https://platform.claude.com/docs/en/about-claude/pricing#specific-tool-pricing"
```

⇒ 官方自己认定的「详细定价页」仍是 `platform.claude.com/docs/en/about-claude/pricing`；
**可达的那一页（claude.com/pricing#api）是它的摘要版**。这是本条裁定「不改数据」的主要理由之一。

## 3. `claude.com/pricing#api` 的 API 价格模块：可见文本窗口（逐字）

快照 `claude_com_pricing.html` sha256 = `2bed7f105357011958b861aab53ea2d31032e530a8fdfdac379ed12d1c93518e`

```
Batch processing
Fable 5.1
Next generation intelligence for long-running agents
Prompt caching
Read
$0.25
/ MTok
Write
$12.50
/ MTok
Input
$10
/ MTok
Output
$50
/ MTok
Opus 5.5
Daily driver for agentic coding and enterprise work
Prompt caching
Read
$0.20
/ MTok
Write
$5
/ MTok
Input
$4
/ MTok
Output
$20
/ MTok
Sonnet 5.5
High-performance model for coding and agents
Prompt caching
Read
$0.10
/ MTok
Write
$2.50
/ MTok
Input
$2
/ MTok
Output
$10
/ MTok
Haiku 5.5
Fastest, most cost-efficient model
Prompt caching
Prompts ≤ 100K tokens
Read
$0.01
/ MTok
Write
$0.125
/ MTok
Prompts > 100K tokens
Read
$0.05
/ MTok
Write
$0.625
/ MTok
Input
Prompts ≤ 100K tokens
$0.10
/ MTok
Prompts > 100K tokens
$0.50
/ MTok
Output
Prompts ≤ 100K tokens
$0.50
/ MTok
Prompts > 100K tokens
$2.50
/ MTok
For workloads that need to run in the US, US-only inference is available at 1.1x pricing for input and output tokens.
Learn more
.
Get up to 2.5x faster speeds with fast mode for Opus 5.5 at 2x standard pricing.
Learn more
.
Prompt caching pricing reflects 5-minute TTL. Learn about
extended prompt caching
.
Explore detailed pricing
(opens in new tab)
Pricing for Claude Platform features
Get more out of Claude with advanced features and capabilities.
Learn more
(opens in new tab)
Managed Agents
Build and deploy agents at scale with a suite of composable APIs. Standard token rates apply.
Cost
$0.08 per session-hour for active runtime
Web search
Give Claude access to the latest information from the web. Doesn’t include input and output tokens required to process requests.
Cost
$10 / 1K searches
Code execution
Run Python code in a sandboxed environment for advanced data analysis. 50 free hours of usage daily per organization.
Additional hours
$0.05 per hour per container
Service tiers
Balance availability, performance, and predictable costs based on your needs.
Learn more
(opens in new tab)
Contact sales
Standard
Default tier for both piloting and scaling everyday use cases
Batch
For asynchronous workloads that can be processed together for better efficiency
Legacy models
Learn more
(opens in new tab)
Explore detailed pricing
(opens in new tab)
Haiku 4.5
Prompt caching
Read
$0.10
/ MTok
Write
$1.25
/ MTok
Input
$1
/ MTok
Output
$5
/ MTok
Sonnet 5
Prompt caching
Read
$0.20
/ MTok
Write
$2.50
/ MTok
Input
$2
/ MTok
Output
$10
/ MTok
Save 50% with batch processing.
Learn more
Batch processing
Opus 5
```

（窗口从 API tab 的 `Batch processing` 小标题起 150 行；含现行模型 4 条 + `Legacy models` 区块的 Haiku 4.5 / Sonnet 5。）

