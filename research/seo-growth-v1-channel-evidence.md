# Google / 百度对 github.io 的开合结论（证据版）

> 取证对象：`https://buguoshixc.github.io/ai-deals-aggregator/`（GitHub Pages 项目站，仓库 `buguoshixc/ai-deals-aggregator`，公开）
> 取证时间：2026-10-26 15:51–16:12（Asia/Shanghai）
> 取证环境：Windows，Node v24.13.1，`curl.exe` 8.x（Git Bash 调用），出口网络位于中国大陆（无任何代理/VPN 配置；下文「本环境」均指此网络）
> 取证方式：**只做只读 GET / DNS / 公开搜索页查询**。未登录任何平台账号，未伪造 UA 以外的身份（UA 仅用于验证「不同爬虫 UA 是否被区别对待」），未 build、未 git commit、未 push、未改动任何代码文件。
> 证据落盘（临时）：`.scratch/seo-channel-probe/`（可复现；本报告是唯一交付文件）
> 相关配套文档（他人产出）：[`docs/marketing/seo-verification-runbook.md`](../docs/marketing/seo-verification-runbook.md)（站点主操作清单）；本报告负责「通道开不开」的取证，操作清单以本报告 §4 为准并对该文档做证据层校正。

**判定等级约定**（全文统一）：

| 等级 | 含义 |
|---|---|
| **已证实** | 本环境可复现的第一手实测结果（HTTP 状态/字节/哈希、搜索页原文、DNS 记录、官方文档原文）。 |
| **高度可能** | 有多个间接证据 + 官方机制/文档支持，但缺一条直接观测（例如 Google 索引状态、百度实际抓取日志）。 |
| **无法证实** | 本环境结构性不可观测（例如爬虫真实访问日志、百度出口 IP 是否被 CDN 地区策略拦、平台后台行为），只如实记录边界，不猜。 |

---

## 1. 结论摘要（先给结论，再上证据）

### 1.1 一张表看完两个渠道

| 渠道 | ① 爬虫**能不能抓到** | ② 搜索引擎**有没有收录** | ③ **怎么才能开始收**（需要账号的部分） | 通道结论 |
|---|---|---|---|---|
| **Google** | **已证实可抓**（HTTP 层）。浏览器 / Googlebot / Baiduspider 三种 UA + 空 UA 全部 `200`、内容逐字节一致；无 `X-Robots-Tag`、无 noindex；`buguoshixc.github.io/robots.txt`（主机根）`404` ⇒ 按 Google 官方规则等于「无任何抓取限制」 | **无法证实**（本环境到不了 Google：DNS/连接均失败，`site:` 查不了）。间接证据：GSC 从未验证、近 7 天 Google 展示/点击均为 0、站点上线仅约 5 周 ⇒ **高度可能「尚未收录或尚未浮现」** | GSC「**URL 前缀属性**」验证（HTML 标记 / HTML 文件）→ 提交 sitemap → 对 10 个重点 URL 逐个「请求编入索引」。**token 与全部操作只能由站点主 Google 账号完成**。路径本身**已证实**（Google 官方文档给出 URL 前缀属性 + HTML 标记验证 + 请求编入索引的完整说明）；「实际能不能验证通过」需账号操作，**本报告无法证实** | **开（未启用）**：主机与爬虫层没有任何封锁证据（已证实），缺的是账号侧的「开门动作」 |
| **百度** | **已证实可抓**（HTTP 层）。Baiduspider UA 对 robots/sitemap/首页/二级页一律 `200`、与浏览器 UA 同内容同哈希；主机根 `robots.txt` `404`，无 UA 差别对待 | **已证实未收录**。PC 与移动端 `site:buguoshixc.github.io` 均为「抱歉，未找到相关结果。」；裸 URL 查询直接返回「没有找到该URL……还可提交网址给我们」；360 显示「约0个网页被360搜索收录」；搜狗也无结果。**对照**：百度 `site:github.io` 约 **3,430,000** 条 ⇒ 百度并不封锁 github.io 这个主机 | 百度搜索资源平台：**站点验证**（文件验证 / HTML 标签验证；**CNAME 验证已被官方暂停**）→ **普通收录 → sitemap 提交** → **抓取诊断**；需站点主百度账号。官方文档原文：验证方式、提交入口、配额机制均**已证实**。关键卡点：官方验证是**按域名**（文件须放域名根、标签须在站点首页），而本站是共享主机下的**项目路径**——路径能否被当作独立站点验证，**无法证实**，需登录实测；兜底是让站点主另建 `buguoshixc.github.io` 用户站仓库或绑定自定义域名 | **开，但当前是「可抓不可收」的未启用状态**（爬虫层：已证实可达；索引：已证实 0）；启用动作全在账号侧，且路径级验证存在不确定性 |

### 1.2 必须先纠正的一个流行说法

**「GitHub Pages 屏蔽了搜索引擎 / 百度爬虫」在本环境无法复现。**

- 同一批 URL，Googlebot UA 与 Baiduspider UA 的响应与浏览器 UA **逐字节相同**（§2.1），没有任何 UA 级拦截；
- 主机根 `robots.txt` 是 `404`（§2.2），不是 `Disallow`；
- 同主机下，**必应已经正常收录并带来流量**（站点主后台基线：近 7 天必应 141 点击 / 1.7K 展示 / 8.09% CTR，§5），说明 `github.io` 这个托管层不阻碍搜索引擎；
- 百度自己就收录了约 **343 万** 个 `*.github.io` 页面（§2.8）。

因此，**Google / 百度「不收」的原因不在 github.io 主机层**，而在「站点太新 + 两个平台都未验证/未提交 sitemap + 百度对境外新站抓取慢」这一侧。但边界也要说清：**百度爬虫的真实出口 IP 是否被 Fastly/GitHub 的地区策略拦过，本环境无法证实**（我们只能用 UA 模拟，不能伪造 IP）；「2019 年 GitHub 屏蔽百度爬虫」的社区旧帖与本次实测冲突，见 §3.3。

### 1.3 一句话版本

- **Google：通道「开」**。爬虫层已证实可达；索引状态本环境查不到（无法证实），但账号侧从未验证/提交 ⇒ 现在等于「没开门」。开门 = 站点主做 GSC「URL 前缀属性 + HTML 标记 + sitemap + 10 条索引请求」。
- **百度：通道「开」但「未启用」，且开门有结构性卡点**。爬虫层已证实可达；`site:` 已证实 0 收录（不是「没证据」而是「证据显示没有」）；百度本身收 github.io（343 万条），所以不是主机封锁。卡点在于：验证是**域名级**的，文件验证要域名根、标签验证要站点首页，本站是**项目路径**；能否按路径验证需登录实测（无法证实）。兜底是建用户站仓库 `buguoshixc.github.io` 或绑自定义域名（都需要站点主账号）。
- **共同点**：两个平台都**没有任何步骤需要改页面内容就能提高收录**；第 3 周展示量若不涨，先查收录状态（§5）。

---

## 2. 实测证据

### 2.0 取证时间线与原始文件

| 时间（2026-10-26，+08:00） | 动作 | 原始证据文件 |
|---|---|---|
| 15:52:05–15:52:45 | 三 UA × {robots, sitemap, 首页} + `/student/` + 主机根 + 404 + http→https 探测 | `.scratch/seo-channel-probe/probe.log`、`*.hdr`、`*.body` |
| 15:54:19 / 15:54:46 / 15:54:48 | 百度 `site:buguoshixc.github.io` / 裸 URL / `site:github.io` | `baidu_site.html`、`baidu_url.html`、`baidu_gio.html` |
| 15:54:20 / 15:54:42 | 必应 `site:buguoshixc.github.io` + 对照查询 | `bing_site.html`、`bing_ctrl.html`、`bing_gio.html` |
| ~15:55–15:56 | 10 个重点 URL 逐个 GET（浏览器 UA） | 命令输出见 §2.3 |
| 15:57:04 | 抓取 Google 官方 Googlebot IP 段 JSON（`.cn` 镜像） | `gbot_cn.json` |
| 15:58–15:59 | DNS / PTR / FCrDNS | 命令输出见 §2.7 |
| 15:59:18 / 15:59:20 | 搜狗 / 360 `site:` 补充查询 | `sogou.html`、`so360.html` |
| 16:05:02 | 百度移动端 `site:` 交叉验证 | `bd_mobile.html` |
| 15:59–16:12 | 官方文档抓取（Google `.cn` 镜像、GitHub Docs、百度搜索学堂、IndexNow） | `gdoc_*.txt`、`gh_*.html`、`bdoc_*.txt`、`indexnow.txt` |

通用命令模板（下文各表的命令均按此执行，`%{...}` 为 curl 写入格式）：

```bash
curl -sS --compressed -A "<UA>" -D out.hdr -o out.body \
  -w 'http_code=%{http_code} size_download=%{size_download} time_total=%{time_total} url_effective=%{url_effective} content_type=%{content_type} num_redirects=%{num_redirects} remote_ip=%{remote_ip} http_version=%{http_version} ssl_verify=%{ssl_verify_result}' \
  "<URL>"
```

三种 UA 的完整字符串：

- 浏览器：`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36`
- Googlebot：`Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)`
- Baiduspider：`Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)`

### 2.1 三个关键文件 × 三种 UA（核心证据）

时间：2026-10-26 15:52:05–15:52:35（+08:00）。`plain_bytes` = `--compressed` 解压后 `wc -c`；`sha256` 为解压后正文哈希。

| 目标 | UA | HTTP | 传输字节（gzip） | 解压字节 | sha256 | 结果摘要 |
|---|---|---|---|---|---|---|
| `/ai-deals-aggregator/robots.txt` | 浏览器 | 200 | 471 | 747 | `1bbde8cde94f43b2b9f1aca04459460cf65318ba832f8882964eedfdaeae0b33` | 全文一致：`User-agent: * / Allow: /` + 12 个 AI 爬虫显式 Allow + `Sitemap: …/sitemap.xml` |
| 同上 | Googlebot | 200 | 471 | 747 | 同上 | 与浏览器 UA **逐字节相同** |
| 同上 | Baiduspider | 200 | 471 | 747 | 同上 | 与浏览器 UA **逐字节相同** |
| `/ai-deals-aggregator/sitemap.xml` | 浏览器 | 200 | 1,939 | 36,323 | `2915f63739d2bf07f2443ae2621193a119a493e93ab7c3816186162f4c947a49` | `application/xml`；182 条 `<loc>`，全部 `https://buguoshixc.github.io/ai-deals-aggregator/…`，无重复、无外域 |
| 同上 | Googlebot | 200 | 1,939 | 36,323 | 同上 | 逐字节相同 |
| 同上 | Baiduspider | 200 | 1,939 | 36,323 | 同上 | 逐字节相同 |
| `/ai-deals-aggregator/`（首页） | 浏览器 | 200 | 128,177 | 433,858 | `b7988500379fb3cd831702fd4823ac83a8b5b9649a5b6bd8940fb685d328112a` | `text/html; charset=utf-8`；标题「AI 优惠聚合器 — 国内外大模型免费额度与折扣（每日更新）」 |
| 同上 | Googlebot | 200 | 128,177 | 433,858 | 同上 | 逐字节相同 |
| 同上 | Baiduspider | 200 | 128,177 | 433,858 | 同上 | 逐字节相同 |

**同组对照**：

| 对照项 | 结果 |
|---|---|
| 空 UA（不发 `-A`） | robots 与首页仍 `200`、与浏览器 UA 同哈希 → 连「无 UA」都不拦 |
| `/student/`（普通二级页） | 三 UA 均 `200`，解压 127,749 B，sha256 `2fb571e70c03af743f5fd05b06f0c184ea44097a957ccba2f6dc238f07f49503`，三 UA 相同 |
| 响应时延（仅记录，不代表爬虫侧） | 本机到 GitHub Pages 日本边缘节点：robots 0.53–2.65 s；`/student/` 用 Baiduspider UA 一次 5.34 s（同页浏览器 UA 1.10 s）——波动属 CDN/网络噪声，**不能**据此说「百度抓取慢」 |

**结论（已证实）**：三个关键文件对浏览器、Googlebot、Baiduspider、空 UA 均返回 `200`，且**内容逐字节一致**。GitHub Pages 在本站没有做 UA 级拦截/降级/cloaking，也没有对搜索引擎返回不同内容。

### 2.2 主机根域 robots 与根路径（决定「有没有人拦」）

时间：2026-10-26 15:52:36–15:52:45（+08:00）。

| URL | UA | HTTP | 字节 | 结果摘要 |
|---|---|---|---|---|
| `https://buguoshixc.github.io/robots.txt` | 浏览器 | **404** | 9,115 | GitHub Pages 标准 404 页（`text/html`），**不是** robots 文本 |
| 同上 | Googlebot | **404** | 9,115 | 同哈希 `70d613e3acfba24fd2876fcbacaf639e1e111ef4d54baf70761c47673f37d6a3` |
| 同上 | Baiduspider | **404** | 9,115 | 同哈希 |
| `https://buguoshixc.github.io/`（主机根首页） | 浏览器 / Googlebot | **404** | 9,115 | 主机根没有可访问首页（该 GitHub 账号没有用户站仓库，见 §2.9） |
| `/ai-deals-aggregator/definitely-not-a-page-xyz/` | Googlebot | 404 | 9,379 | 项目内 404 正常，无 `X-Robots-Tag` |
| `http://buguoshixc.github.io/ai-deals-aggregator/` | 浏览器 | 301 | 162 | 跳 HTTPS（`num_redirects=0` 指本次未跟随后续跳转） |

**这条为什么关键（官方规则原文，见 §3.2）**：Google 只在**主机根**取 `robots.txt`，并明确规定「抓取工具不会检查子目录中的 robots.txt 文件」；且「所有 4xx 错误（429 除外）会被解读为网站不存在有效的 robots.txt，Google 会假定没有任何抓取限制」。

因此：

- 主机根 `robots.txt` = **404** ⇒ Google 视角「无任何限制」，可抓；
- 项目路径下的 `robots.txt`（`/ai-deals-aggregator/robots.txt`）**不会被 Google 当 robots 读取**（它在子目录里）；同理百度官方文档也写「放置在网站根目录下」（§3.3）；
- 连带结论：项目 robots 里的 `Sitemap:` 行**对 Google 不生效**，sitemap 自动发现这条路是断的，必须在 GSC 手动提交（或改主机根 robots —— 那需要用户站仓库，§4.1）。

### 2.3 10 个重点 URL 的真实可达性

时间：2026-10-26 约 15:55–15:56（+08:00），浏览器 UA，逐个 GET。全部 `200`，标题如下（标题即页面 `<title>` 前 90 字符）：

| # | 路径 | HTTP | 传输字节 | 标题 |
|---|---|---|---|---|
| 1 | `/` | 200 | 128,177 | AI 优惠聚合器 — 国内外大模型免费额度与折扣（每日更新） |
| 2 | `/free-api/` | 200 | 45,282 | 可以免费调用的 API · AI 优惠聚合器 |
| 3 | `/plans/api/` | 200 | 55,599 | API / Token 计费对比 · AI 优惠聚合器 |
| 4 | `/plans/coding/` | 200 | 75,025 | AI Coding 套餐对比 · AI 优惠聚合器 |
| 5 | `/need/free-model/` | 200 | 43,039 | 可以免费使用的模型 · AI 优惠聚合器 |
| 6 | `/need/edu-identity/` | 200 | 42,641 | 凭教育身份可以领取的 AI 优惠 · AI 优惠聚合器 |
| 7 | `/student/` | 200 | 43,095 | 面向学生的 AI 优惠 · AI 优惠聚合器 |
| 8 | `/developer/` | 200 | 47,080 | 面向开发者的 AI 优惠 · AI 优惠聚合器 |
| 9 | `/category/api/` | 200 | 45,084 | AI API 服务与算力平台的优惠 · AI 优惠聚合器 |
| 10 | `/changes/` | 200 | 40,409 | 优惠变化雷达 · AI 优惠聚合器 |

同时核对：这 10 条**全部在线上 sitemap 的 182 条 `<loc>` 内**（§2.1 的 sitemap 解析结果），且都是站内链接可达的入口页，不需要 JS。

**内容是否「不靠 JS 也能读到」**（首页样本，15:52 下载的 `home_browser.body`）：

- HTML 里 8 个 `<script>`，但去掉 `<script>/<style>` 后正文文本仍有 **13,657 字符**；
- 正文实际出现「火山方舟」「免费额度」「学生」「优惠」「最后更新」等关键词；
- `<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">`（没有任何 noindex）；
- `<link rel="canonical" href="https://buguoshixc.github.io/ai-deals-aggregator/">` 自指；
- 5 个 `application/ld+json` 结构化数据块；
- `<html lang="zh-CN">`、`hreflang="zh-CN"` 与 `x-default` 均指向自身。

**结论（已证实）**：两个渠道的「抓取入口」都健康——HTML 预渲染、可索引、canonical 自指、sitemap 覆盖 10 个重点 URL。

### 2.4 响应头里有什么（有没有 `X-Robots-Tag` / CDN 异常 / `cf-*`）

以 15:52 首页响应为例（robots/sitemap 同构）：

```
HTTP/1.1 200 OK
Server: GitHub.com
Content-Type: text/html; charset=utf-8
Content-Length: 128177
Content-Encoding: gzip
Last-Modified: Tue, 20 Oct 2026 16:51:18 GMT
Cache-Control: max-age=600
Vary: Accept-Encoding
Access-Control-Allow-Origin: *
Strict-Transport-Security: max-age=31556952
Via: 1.1 varnish
X-Cache: HIT / X-Cache-Hits: 0-1
X-Served-By: cache-nrt-rjtf7700030-NRT
x-github-edge-region: japaneast
x-proxy-cache: MISS
X-GitHub-Request-Id: 9A54:10DBCD:7AA67C:80DC0A:6ADEE7C3
X-Fastly-Request-ID: 9c3e901344e790fcb93675901e166bf69851a7e3
```

逐项结论：

| 检查项 | 结果 |
|---|---|
| `X-Robots-Tag` | **不存在**（三种 UA、robots/sitemap/首页/二级页/404 全部无此头） |
| `cf-*`（Cloudflare） | **不存在**；`Server: GitHub.com` + `Via: 1.1 varnish` + `X-Served-By: cache-nrt-*` + `x-github-edge-region: japaneast` 是 **GitHub Pages 的 Fastly 边缘**特征 |
| CDN 异常 | 未见：`200/301/404` 语义正确；`Vary: Accept-Encoding` 正常；`X-Cache: HIT/MISS` 与 `Age: 0` 属首次/回源正常；无 403/429/503 挑战页 |
| `X-GitHub-Request-Id` 三 UA 相同 | 同一次 CDN 缓存命中链（同一 `X-GitHub-Request-Id`、`Last-Modified` 相同）⇒ 三 UA 拿到的是**同一份缓存对象**，进一步证明无 UA 分流 |
| 404 页安全头 | `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'`（GitHub 标准 404 页），无 `noindex` 相关头，页面本身也无 `<meta name="robots">`（该页不参与索引，正常） |

**结论（已证实）**：不存在任何 `X-Robots-Tag`、Cloudflare 层、或 UA 分流的「隐形拦截」；CDN 行为符合 GitHub Pages 默认。

### 2.5 DNS / TLS / 托管身份（确认是 GitHub Pages 默认域名，无自定义域）

时间：15:58–15:59（+08:00），DNS 为 `public1.alidns.com`（223.5.5.5）。

```
$ nslookup buguoshixc.github.io
Addresses: 2606:50c0:8001::153  2606:50c0:8002::153  2606:50c0:8003::153  2606:50c0:8000::153
           185.199.109.153  185.199.108.153  185.199.111.153  185.199.110.153
```

- 解析出的 IPv4 **正是 GitHub Pages 官方 A 记录**（`185.199.108.153 / .109 / .110 / .111`），与 GitHub 官方文档一致（§3.1）；
- 仓库根与产物目录中**没有 `CNAME` 文件**（`find` 限仓库根/`dist`，排除 `node_modules`/`.git`），站点未绑定自定义域名；
- 实测 `remote_ip` 在两种之间（`2606:50c0:8000::153` 与 `185.199.111.153`），都是 GitHub Pages 边缘，正常；
- `ssl_verify_result=0`（证书校验通过），`http://` → `301` 到 `https://`。

**结论（已证实）**：这是 GitHub Pages 的**默认托管**，没有自定义域名、没有第三方 CDN 叠加，因此「收录问题」不可能来自私有 CDN 配置。

### 2.6 Googlebot 官方 IP 段与反向 DNS 佐证（只做 DNS，不伪造 IP）

时间：15:57–15:59（+08:00）。方法遵循 Google 官方《验证 Googlebot 和其他 Google 抓取工具》（§3.2）：**查 PTR → 正向解析回同一 IP（FCrDNS）→ 与官方 IP 段清单比对**。

1）官方 IP 段清单（Google 官方文件，经 `developers.google.cn` 镜像获取，`200`，21,768 B）：

```
https://developers.google.cn/static/search/apis/ipranges/googlebot.json
{
  "creationTime": "2026-10-23T14:45:59.000000",
  "prefixes": [ … 共 317 条前缀（其中 IPv4 170 条）… ]
}
```

其中包含 `"ipv4Prefix": "66.249.66.0/27"` 等 66.249.64.0/19 族条目。

2）反向 DNS 实例（PTR）：

| IP | PTR | 正向解析回 | 结论 |
|---|---|---|---|
| `66.249.66.1` | `crawl-66-249-66-1.googlebot.com` | 同名 → `66.249.66.1` | FCrDNS 一致；且 `66.249.66.0/27` 在官方段内 ⇒ 符合官方 Googlebot 命名/网段规范 |
| `66.249.79.118` | `crawl-66-249-79-118.googlebot.com` | 同名 → `66.249.79.118` | 同上（`66.249.79.0/27` 在官方段内） |
| `74.125.151.106` | `rate-limited-proxy-74-125-151-106.google.com` | 同名 → `74.125.151.106` | 符合官方文档列出的 `rate-limited-proxy-***-***-***-***.google.com` 模式 |
| `209.85.238.100` | `rate-limited-proxy-209-85-238-100.google.com` | 同名 → `209.85.238.100` | 同上 |

官方文档同时列出 Googlebot 的 PTR 模式：`crawl-***-***-***-***.googlebot.com`、`geo-crawl-***-***-***-***.geo.googlebot.com`，以及 Google 其他抓取/代理的 `google.com` 结尾模式（§3.2）。

**结论（已证实）**：官方 IP 段清单可获取、PTR/FCrDNS 方法与结果可复现。**无法证实**的部分：本环境没有 Googlebot 的真实访问日志（GitHub Pages 不提供访问日志），所以「Googlebot 到底来没来过本站」无法从外部观测——这也是为什么需要 GSC「网址检查 → 实时测试」由站点主来确认（§4.1）。

### 2.7 `site:` 查询实测（Google / 百度 / 必应 / 搜狗 / 360）

> 说明：`site:` 是**近似指标**，不是官方索引量接口；但结合平台自己返回的「未找到该 URL」提示，足以支撑「当前没有收录」的判断。所有查询均在未登录状态执行。

#### 2.7.1 百度（本环境可直达，第一手）

| # | 查询 | 命令/URL（原样） | 时间 | 原始结果摘要 | 判定 |
|---|---|---|---|---|---|
| B1 | `site:buguoshixc.github.io`（PC） | `curl -sS -A "<浏览器UA>" -L "https://www.baidu.com/s?wd=site%3Abuguoshixc.github.io"` | 15:54:19 | HTTP 200；页面含 **「抱歉，未找到相关结果。」**；`result` 块内无本站任何 URL；页面标题 `site:buguoshixc.github.io_百度搜索` | **已证实：0 收录** |
| B2 | `site:buguoshixc.github.io`（移动） | `https://m.baidu.com/s?word=site%3Abuguoshixc.github.io`（iPhone UA） | 16:05:02 | HTTP 200；**「抱歉，未找到相关结果。您还可以选择：检查输入是否正确…」** | 交叉一致：0 收录 |
| B3 | 裸 URL `buguoshixc.github.io` | `https://www.baidu.com/s?wd=buguoshixc.github.io` | 15:54:46 | HTTP 200；结果区原文：**「没有找到该URL。您可以直接访问 buguoshixc.github.io，还可 提交网址 给我们。」**；并给出 `zhanzhang.baidu.com/sitesubmit/index?sitename=http://buguoshixc.github.io` 的提交入口 | **已证实：百度明确判定该 URL 未收录** |
| B4 | `site:github.io`（对照） | `https://www.baidu.com/s?wd=site%3Agithub.io` | 15:54:48 | HTTP 200；**「找到相关结果数约3,430,000个」**；结果域名含 `ruby-china.github.io`、`leanprover-community.github.io`、`robfig.github.io`、`ibm.github.io`、`hiloteam.github.io` 等 | **已证实：百度大量收录 github.io，主机层未被封锁** |
| B5 | 外链页是否被百度收录（旁证） | 查询 `buguoshixc.github.io` 的同一次结果（B3）中出现标题「肝了个站：把各家大模型免费额度、API 单价、Coding 套餐整理到一处_牛客网」 | 15:54:46 | 该帖（2026-10-16，正文含本站 URL）已被百度收录 | **已证实：百度能收「提到本站的第三方页」，但 10 天后仍未收本站** |

补充说明：查询过程中有一次百度返回 **「百度安全验证」** 页（`baidu_nc.html`，一次带中文关键词的查询），说明**自动化查询百度会触发反爬**；因此报告只采用**出现明确结果语义**的那几次查询，不用「被验证码挡下」的查询下结论。

#### 2.7.2 Google（本环境不可达，如实记录原因）

| 尝试 | 命令 | 结果 |
|---|---|---|
| `curl https://www.google.com/` | `curl -sS -m 12 -o /dev/null -w "%{http_code}"` | `http_code=000`，12 s 内连接失败（本机未区分是 DNS 还是 TCP 被断；工具侧 `web_fetch` 对同一域名直接报 `ENOTFOUND`） |
| `curl https://developers.google.com/...` | 同上 | `curl: (28) Failed to connect … Could not connect to server` |
| `web_fetch https://www.google.com/search?q=site%3Abuguoshixc.github.io` | 工具侧网络 | `Error: getaddrinfo ENOTFOUND www.google.com`（工具侧 DNS 也不可达） |
| `https://www.google.cn/search?q=site%3Abuguoshixc.github.io` | `curl -L` | HTTP 200，但只有 1.8 KB 的「谷歌中国」落地页，写着「点击查看在 google.com.hk 的搜索结果」；`google.com.hk` 同样连接失败 |
| 备用 Google 结果源 | `startpage.com` / `lite.duckduckgo.com` → `000`；`yandex.com` → 跳 `showcaptcha` 验证码 | 全部不可用 |
| **本会话的 `web_search` 工具** | 查询 `site:buguoshixc.github.io`（不登录） | 返回的是**第三方文章**（牛客网帖、微信公众号文章），**0 条本站结果**；该工具不承诺支持 `site:` 限定语义，故**不作为收录判据**；随后用 `web_fetch` 直接访问 Google SERP 报 `getaddrinfo ENOTFOUND`（工具侧也不可达） |

**判定：Google `site:` 查询「本环境不可取」**（原因是网络不可达 + DNS 不可达，不是查询语法问题）。因此 Google 收录状态只能标「**无法证实**」，用间接证据（GSC 从未验证、近 7 天 0 展示、站点仅 5 周）推断为「高度可能未收录/未浮现」。

#### 2.7.3 必应（本环境可直达，但 `site:` 结果不可信——如实记录）

| 查询 | 时间 | 结果 | 判定 |
|---|---|---|---|
| `https://cn.bing.com/search?q=site%3Abuguoshixc.github.io&setlang=zh-CN` | 15:54:20 | HTTP 200；10 个 `b_algo` 结果块，但链接全是知乎/百度经验/百度知道等**与本站无关的翻译类页面** | 不可用 |
| **对照**：`site:thisdomaindoesnotexist12345abc.com`（不存在的域名） | 15:54:42 | HTTP 200；**同样 10 个 `b_algo` 结果块**；`site:example.com` 也 10 条 | **对照实验证明：cn.bing.com 在本环境忽略/改写 `site:` 限定，返回无关兜底结果** |
| `site:github.io`（对照） | 15:54:39 | 7 个 `b_algo`，链接是真实 `*.github.io` 页面（`classicalqy.github.io`、`gtiipoi.github.io` 等） | 部分可用 |

**判定**：必应在**本环境**的 `site:` 查询不可作为收录判据（对照实验已证伪其限定语义）。必应收录状态以站点主后台数据为准：近 7 天 **141 点击 / 1.7K 展示 / 8.09% CTR**（§5 基线），说明必应侧确实已收录并有排名。

#### 2.7.4 搜狗 / 360（补充旁证，非任务要求）

| 引擎 | 查询 | 时间 | 原始结果摘要 |
|---|---|---|---|
| 搜狗 | `https://www.sogou.com/web?query=site%3Abuguoshixc.github.io` | 15:59:18 | HTTP 200；页面出现 `http://buguoshixc.github.io/ 没有找到…未找到相关结果` 语义（`noresult_part1_container`） | 
| 360 | `https://www.so.com/s?q=site%3Abuguoshixc.github.io` | 15:59:20 | HTTP 200；页面卡片原文：**「buguoshixc.github.io 的站点信息 备案号：无 该网站约0个网页被360搜索收录 请到站长平台分析收录量>>」** |

补充：360 的「备案号：无」只是它的站点卡片字段，**不能**据此推断「备案是百度收录的前提」（见 §3.3 对该问题的诚实边界）。

### 2.8 站点侧的「已开门」证据（必应）与「未开门」证据（Google / 百度）

时间：15:56–16:12（+08:00），来源：仓库公开文件 + GitHub API + 线上响应头。

| 证据 | 内容 | 说明 |
|---|---|---|
| 必应站点验证文件已上线 | `https://buguoshixc.github.io/ai-deals-aggregator/BingSiteAuth.xml`（16:14 复核 `200`，85 B；仓库 `BingSiteAuth.xml`，构建期原样拷贝，见 `scripts/tools/build-local.js` 的 `PUBLIC_FILES`） | 必应 Webmaster Tools **已验证**（PR #124 `chore(seo): 上线 Bing Webmaster Tools 站点归属验证文件`） |
| IndexNow 已接入发布链 | 站点根有 IndexNow key 文件 `8c538ee11547009de0fadcebbae5fc91.txt`（16:14 复核 `200`，32 B，内容即 key）；`.github/workflows/deploy.yml` 在 `deploy-pages` **之后**向 `api.indexnow.org` 发送变更 URL | 提交 `84c4bcb feat(indexnow): 内容变更主动通知搜索引擎`（HEAD 提交，2026-10-17）。**IndexNow 的参与引擎 = Microsoft Bing、Naver、Seznam.cz、Yandex、Yep，不含 Google/百度**（§3.4） |
| Google 验证 token | 仓库**从未出现** `google-site-verification` 的站点 token（`git log -S` 仅命中一份抓取来的 AWS 页面样本，不是本站）；线上首页 `<head>` 无该 meta | **GSC 未验证**（已证实：线上产物 + git 历史） |
| 百度验证 token | 仓库**从未出现** `baidu-site-verification`（`git log -S` 无结果）；线上首页无该 meta | **百度未验证**（已证实） |
| sitemap 已存在但未被任何平台「接手」 | 线上 sitemap 182 条、10 个重点 URL 全在；项目级 robots 里有 `Sitemap:` 行，但主机根 robots 404（§2.2）⇒ Google/百度都不会自动发现它 | **sitemap 处于「已备好、无人提交」状态**（已证实） |
| 本轮 v1.8 工作区已接好验证注入（未提交） | `index.html` 有 `<!-- SEO:VERIFICATION:START/END -->` 注入块；`scripts/lib/site-verification.js`（6,098 B）与 `scripts/data/site-verification.json`（1,227 B，google/baidu 两段，`token: null`）已存在；`git status` 显示 `M index.html`、`M scripts/tools/build-local.js`、`?? scripts/lib/site-verification.js`、`?? scripts/data/site-verification.json` | 说明：**token 拿到后只需改一张配置表**（§4 给出建议）；这些改动是并行的 v1.8 工作，本报告未触碰 |
| 站点版本很新 | GitHub API：仓库 `created_at 2026-09-20T15:19:13Z`、`pushed_at 2026-10-20T16:39:19Z`、`has_pages=true`、`private=false`、`homepage` 指向本站；账号 `created_at 2025-09-13`。线上 `Last-Modified: Tue, 20 Oct 2026 16:51:18 GMT`；本地 checkout HEAD 为 `84c4bcb`（2026-10-17）——**线上比本地新，报告以线上为准** | 站点从建仓到今天约 **5 周**，与「新站收录慢」一致（高度可能的解释，不是借口） |
| 外部链接已存在 | 牛客网帖（2026-10-16）正文给出本站 URL：`https://www.nowcoder.com/feed/main/detail/89e78143ce764112904b7cb8fa1ec0cb` | 该帖已被百度收录（§2.7.1 B5）；说明「有外链入口」但百度 10 天未收本站 ⇒ 问题不在「完全没入口」 |

**其他第一手尝试（失败也记录，避免「假装查过」）**：

- Wayback Machine CDX：`http://web.archive.org/cdx/...` → `000`（本环境不可达）；
- Common Crawl Index API：`https://index.commoncrawl.org/CC-MAIN-2025-38-index?...` → 两次均 `504 Gateway Time-out`；
- GitHub REST `repos/buguoshixc/ai-deals-aggregator/pages` → `404`（该端点需要认证；未登录只能到 `has_pages=true` 这一层）。

### 2.9 哪些「抓取层事实」本环境无法证实（必须写清）

| 想证实的问题 | 为什么无法证实 | 谁能证实 |
|---|---|---|
| Googlebot / Baiduspider **实际来过没有**、来了几次、抓了哪些 URL | GitHub Pages **不提供访问日志功能**（官方文档只说明访客 IP 会为安全目的被记录/存储，未提供面向仓库维护者的原始日志） | 站点主：GSC「设置 → 抓取统计信息 / 网址检查 → 实时测试」；百度：「抓取频次 / 抓取诊断」 |
| 百度爬虫的**真实出口 IP** 是否被 GitHub/Fastly 地区策略拦 | 只能用 UA 模拟，不能伪造百度 IP；本环境也没有百度侧日志 | 百度：「抓取诊断 / 抓取异常」会显示失败原因与 IP/地区 |
| Google 是否已收录、收录多少 | Google 全域名在本环境不可达（§2.7.2） | 站点主：GSC「网页 / 索引涵盖范围」 |
| 百度是否接受「项目路径」作为可验证站点 | 需要登录百度后台提交后看回读的「首页/根目录」，本环境无账号 | 站点主：按 §4.2 实测，一次就能判定 |
| 百度/Google 的排名与展示 | 无后台权限 | 站点主：GSC「效果」、百度「索引量/流量与关键词」、必应后台 |

---

## 3. 外部资料（带 URL）

### 3.1 GitHub Pages 是否对搜索引擎封锁/限制（官方口径）

- GitHub 官方《What is GitHub Pages?》：GitHub Pages 是「静态站点托管服务」，公开仓库免费可用；项目站地址规则为 `http(s)://<owner>.github.io/<repositoryname>`——本站正是这种项目站。
  <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
- GitHub 官方《GitHub Pages limits》：只列用量/构建/带宽等限制，**没有任何「屏蔽搜索引擎爬虫」的条款**。
  <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>
- GitHub 官方《Managing a custom domain for your GitHub Pages site》：GitHub Pages 的官方 A 记录正是 `185.199.108.153 / .109 / .110 / .111`——与本站 DNS 完全一致，佐证「未叠加第三方 CDN」。
  <https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site>
- 本次实测（§2.1/§2.4）：三种 UA + 空 UA 全部 200、同哈希、无 `X-Robots-Tag`、无 `cf-*`。

**结论（已证实，就「官方文档 + 实测响应」而言）**：GitHub Pages 没有针对搜索引擎的封锁机制；至少必应已正常收录本站（§5 基线）。**但**「GitHub 是否曾按 IP/地区拦过百度爬虫」属于历史/网络层问题，官方文档未提，本环境**无法证实**。

### 3.2 Google 的官方规则（为什么「抓得到」但「要账号才能收」）

以下链接均取自 Google 官方 Search Central 文档（经 `developers.google.cn` 官方中国镜像实测 `200` 可取；`support.google.com` 在本环境不可达，但其 URL 被 Google 自家文档交叉引用，且搜索索引可见其标题，见每条标注）：

1. **robots.txt 只在主机根、子目录的 robots 不被读取、4xx = 无限制**（直接决定本项目 robots 的命运）：
   <https://developers.google.cn/search/docs/crawling-indexing/robots/robots_txt>
   原文（中文镜像）：「您必须将 robots.txt 文件放在网站的顶级目录中」；「`https://example.com/folder/robots.txt` 不是有效的 robots.txt 文件。**抓取工具不会检查子目录中的 robots.txt 文件**」；「所有 4xx 错误（429 除外）……Google 会假定**没有任何抓取限制**」。
2. **robots.txt 简介**（「不是用来阻止编入索引的机制」）：
   <https://developers.google.cn/search/docs/crawling-indexing/robots/intro>
3. **创建和提交站点地图**：可「在 Search Console 中提交站点地图」，或把 `Sitemap:` 行写进 **robots.txt**：
   <https://developers.google.cn/search/docs/crawling-indexing/sitemaps/build-sitemap>
4. **验证 Googlebot / 反向 DNS 方法**（本报告 §2.6 的方法出处）：
   <https://developers.google.cn/search/docs/crawling-indexing/verifying-googlebot>
5. **Google 搜索要素（技术要求/网络垃圾政策/最佳实践总纲）**：
   <https://developers.google.cn/search/docs/essentials>
6. **Search Console 使用入门**（官方顺序：验证所有权 → 看索引涵盖范围 → 提交站点地图 → 看效果报告）：
   <https://developers.google.cn/search/docs/monitor-debug/search-console-start>
7. **Googlebot 官方 IP 段 JSON**（本报告 §2.6 实际下载的文件，`creationTime 2026-10-23T14:45:59Z`，317 条前缀）：
   <https://developers.google.cn/static/search/apis/ipranges/googlebot.json>

**GSC 后台侧官方文档**（`support.google.com` 本环境不可达；URL 已被上面第 3/6 条 Google 官方文档交叉引用，且 Google 搜索索引可见其标题，故可引用）：

- **添加资源（含「网址前缀 / URL-prefix」属性类型）**：<https://support.google.com/webmasters/answer/34592>
  （Google 官方文档的锚点即 `#url_prefix_prop_tips`；URL-prefix 属性允许把「协议 + 主机 + 路径前缀」作为验证对象，这是本项目能在 `github.io` 共享主机下只验证 `/ai-deals-aggregator/` 这一段的依据。）
- **验证网站所有权（HTML 标记 / HTML 文件方式）**：<https://support.google.com/webmasters/answer/9008080>
  （官方锚点 `#html_verification`；HTML 标记 = 把 `<meta name="google-site-verification" content="…">` 放进该属性首页的 `<head>`；HTML 文件 = 把平台给的文件放到该属性 URL 前缀的根目录。）
- **URL 检查 / 请求编入索引**：<https://support.google.com/webmasters/answer/9012289>
- **站点地图报告 / 提交 sitemap**：<https://support.google.com/webmasters/answer/7451001>
- **效果（Performance）报告**：<https://support.google.com/webmasters/answer/7576553>
- GSC 入口：<https://search.google.com/search-console>（本环境 `000` 不可达，属网络原因）

**Google 对 `*.github.io` 的公开事实（哪些能证、哪些只能推断）**：

| 主张 | 等级 | 依据 |
|---|---|---|
| Google 按普通公共站点抓取 `github.io` 上的页面，不存在「github.io 一律不收录」的官方规则 | **高度可能** | Google 官方只按「可抓取 + 未被 noindex/robots 屏蔽 + 有内容」判断收录；本站实测均满足（§2.1–§2.4）；且 GSC 的 URL-prefix 属性可针对子路径（官方文档 34592） |
| 大量 `github.io` 页面被 Google 收录 | **高度可能（社区证据）** | GitHub Community #44421 回答称「你的 GitHub 个人网站**已经**被 Google 搜索收录」（<https://github.com/orgs/community/discussions/44421>）；#149884 中用户称 GSC「只索引了 GitHub Pages 站点的落地页」（<https://github.com/orgs/community/discussions/149884>）。注意：这两条是**社区回答/用户陈述**，不是 Google 官方数据；本环境无法直接查 Google 索引（§2.7.2） |
| 本站在 Google 的收录状态 | **无法证实 → 高度可能未收录/未浮现** | 本环境查不到 Google；间接：GSC 从未验证（§2.8）、Google 渠道近 7 天 0 展示 0 点击（§5） |

### 3.3 百度的官方规则与 `*.github.io` 现实（含「备案」问题的诚实边界）

**百度官方文档（本环境可直接抓取，均为 `200`）**：

1. **平台使用总览（为什么必须验证、三种提交方式）**：《搜索资源平台使用指南》
   <https://ziyuan.baidu.com/college/articleinfo?id=3329>
   原文要点：「向百度搜索提交资源前，需要完成**账号注册、站点绑定、站点验证**等准备工作」；「平台提供了 **3 种验证方式**」；「普通收录工具……提供了 **API 提交、sitemap 提交、手动提交** 三种资源提交方式」；「sitemap：……**收录速度慢于 API 推送**」。
2. **平台工具使用手册（验证两种方式 + robots 根目录 + 抓取诊断 + 索引量）**：
   <https://ziyuan.baidu.com/college/articleinfo?id=267>
   原文要点：「百度搜索资源平台提供**两种**验证方式（百度统计的导入方式已下线）：**文件验证、html标签验证**」；「文件验证：……将文件上传至您的服务器，**放置于域名根目录下**」；「html 标签验证：将html标签添加至**网站首页**html代码的 `<head>` 与 `</head>` 之间」；「验证完成后，我们将会认为您是**网站的拥有者**……请保留验证的文件、html标签，我们会去定期检查验证记录」。
3. **验证方式图解（文件验证要「网站根目录」；标签验证改首页模板）**：
   <https://ziyuan.baidu.com/college/articleinfo?id=1485>
4. **公告：CNAME 验证已被暂停**（重要——网上旧教程仍写 CNAME 验证，照做会踩空）：
   <https://ziyuan.baidu.com/wiki/3462>
   原文：「近期百度搜索资源平台策略调整，站点管理-验证网站**暂停【CNAME验证】**的方式……若站点未验证或验证过期，可以选择使用**【文件验证】、【HTML标签验证】**方式进行站点验证。」
5. **验证升级公告（验证不过期、主站验证后可批量加子站）**：
   <https://ziyuan.baidu.com/wiki/182>
   原文要点：「从……日之后新验证或重新验证的网站，**验证信息将不会过期**」；「在已验证网站主站的情况下，可**批量添加子站点**，无需再次进行验证」；「添加并验证后，可证明您是该**域名**的拥有者」。
6. **普通收录 / Sitemap 工具说明（sitemap 格式、百度「有选择地抓取及索引」）**：
   <https://ziyuan.baidu.com/college/articleinfo?id=640>
   原文要点：「百度对已提交的数据，**会有选择的抓取及索引**网址」。
7. **工具使用与常见问题（三种提交方式、配额机制、robots 必须放根目录、抓取诊断）**：
   <https://ziyuan.baidu.com/college/articleinfo?id=3076>
   原文要点：「普通收录的三种提交方式：API提交 / 手动提交 / **sitemap文件提交**」；「搜索资源平台上线了**配额机制**，对平台工具的 sitemap 文件提交配额进行限制」；robots 工具注意项「**放置在网站根目录下**，比如 `http://www.abc.com/robots.txt`」。
8. **平台功能入口（均实测 `200`，未登录可打开登录壳）**：
   - 站点管理：<https://ziyuan.baidu.com/site/index>
   - 普通收录：<https://ziyuan.baidu.com/linksubmit/index>
   - 抓取诊断：<https://ziyuan.baidu.com/crawltools/index>
   - 索引量：<https://ziyuan.baidu.com/indexs/index>

**百度对 `github.io` 的现状与难点（逐条标等级）**：

| 主张 | 等级 | 依据 |
|---|---|---|
| 百度**不封锁** `*.github.io` 主机 | **已证实** | 本环境实测 `site:github.io` ≈ **3,430,000** 条，结果含大量真实 `*.github.io` 页面（§2.7.1 B4） |
| 本站**当前 0 收录** | **已证实** | PC/移动 `site:` 均「未找到相关结果」；裸 URL 查询返回「没有找到该URL」；360/搜狗旁证 0（§2.7.1、§2.7.4） |
| 「境外托管导致百度抓取不稳定/慢」 | **无法证实（无官方明文）** | 未找到百度官方文档把「境外托管」列为收录限制；本环境 Baiduspider UA 抓取全部 200（§2.1）。能说的只有：**百度对 github.io 的收录是存在的、但分布不均**；「我们的站慢」只能用「新站 + 未提交 + 无验证」解释，不能把「境外」当已证实原因 |
| 「必须先 ICP 备案，百度才收录」 | **无法证实** | 本次可获取的百度官方文档（上列 1–8）**均未把 ICP 备案写成收录前提**；360 的站点卡片显示「备案号：无」只是字段值。**不要把「备案」写成因果结论**；它是可能影响「站点属性/主体资质/权威性」的因素，需平台后台确认 |
| 百度验证是**域名级**的（文件放域名根、标签放站点首页） | **已证实（官方文档原文）** | 上列 2、4、5 的原文；因此本项目「共享主机 + 项目路径」存在结构性卡点（§4.2） |
| 「GitHub 屏蔽了百度爬虫」 | **与本环境实测冲突，不采纳为事实** | 社区旧帖（2019）：<https://github.com/CloudyCity/CloudyCity.github.io/issues/25> 称「Github 屏蔽了百度的爬虫，所以部署在 Github Page 的 Hexo 无法被百度收录」，给出的方案是双线解析到国内托管。该说法为**历史社区经验**，本次 UA 级实测与「百度收录 343 万 github.io」都与之冲突；但**百度真实 IP 是否曾/正被 CDN 地区策略拦，本环境无法证实**——所以只记录冲突，不裁决 |
| 百度对 github.io 页面「有选择地抓取及索引」 | **已证实（官方文档原文）** | 上列 6：「百度对已提交的数据，会有选择的抓取及索引网址」 |

### 3.4 IndexNow 的参与引擎（解释「为什么必应开了、Google/百度没开」）

- IndexNow 官方站：<https://www.indexnow.org/>，原文：IndexNow「has support from **Microsoft Bing, Naver, Seznam.cz, Yandex, Yep**」——**不含 Google，也不含百度**。
- 本站现状：`BingSiteAuth.xml` 已验证 + `deploy.yml` 在发布后发 IndexNow（§2.8）⇒ 必应通道已「开门」；Google/百度需要各自的账号体系，IndexNow 帮不上。

### 3.5 内网基线数据的出处（非公开可复现，但可核对）

§5 的流量基线来自**站点主后台**（Cloudflare Web Analytics + 必应 Webmaster Tools），不是本次外部实测；仓库内已由配套文档记录：
[`docs/marketing/seo-verification-runbook.md`](../docs/marketing/seo-verification-runbook.md) 的「基线口径」一节（699 PV / 425 会话；必应 141 点击 / 1.7K 展示 / 8.09% CTR；Google 与百度各 0）。本报告不声称能独立复现这些后台数字。

---

## 4. 给站点主的操作清单（我们做不了、需要账号的部分）

> 纪律：以下全部是**建议**，本报告未改任何代码、未执行任何账号操作。平台 token **只能由站点主账号在后台生成**；拿到 token 前，构建产物里不会（也不应）出现任何占位 token。

### 4.1 Google Search Console（URL 前缀属性）

**目标属性**：`https://buguoshixc.github.io/ai-deals-aggregator/`（**不是**「网域」属性——网域属性只能 DNS 验证，`github.io` 不归站点主控制）

| 步骤 | 点哪里 / 填什么 | 凭什么判断成功 | 失败怎么排查 |
|---|---|---|---|
| 1. 打开入口 | <https://search.google.com/search-console> → 用站点主 Google 账号登录 | 能进入「添加资源」页 | 打不开 = 网络/账号问题，先解决登录 |
| 2. 添加资源 | 「添加资源」→ 选 **网址前缀（URL prefix）** → 填 `https://buguoshixc.github.io/ai-deals-aggregator/`（**带结尾斜杠**） | 进入验证向导，出现多种验证方式 | 若误选「网域」，删除重来（网域属性无法用 HTML 标记验证） |
| 3. 选 HTML 标记验证 | 验证方式选 **HTML 标记** → 复制 `content` 值（形如 `abcDEF…`）；也可选 HTML 文件（文件需放在**属性前缀根目录**，即站点 `/ai-deals-aggregator/` 根） | 页面给出 `<meta name="google-site-verification" content="…">` 片段 | token 是一串 ASCII；含引号/尖括号说明复制错了 |
| 4. 把 token 落进仓库 | 编辑 **`scripts/data/site-verification.json`** → `google.token` 填上面复制的值，`acquiredAt` 填当天；这是本轮 v1.8 已接好的**唯一 token 出处**（`index.html` 的 `<!-- SEO:VERIFICATION:START/END -->` 注入块由构建期生成 meta；`scripts/lib/site-verification.js` 是唯一实现） | 本地 `npm run build` 后，构建自检输出「站点归属验证 meta: google …」；产物首页 `<head>` 恰好出现一次 `google-site-verification` | 若仓库还没有该机制（HEAD 尚未合并）：最小改动 = 在 `index.html` 的 `<head>` 加 meta + 重新构建发布；**不要**把 token 写进两个地方 |
| 5. 发布 | 走正常发布链（build → deploy）。确认线上首页 `view-source` 能看到该 meta | `curl -sS https://buguoshixc.github.io/ai-deals-aggregator/ \| grep google-site-verification` 有且仅有一行 | 看不到 = 没发布/缓存（`Cache-Control: max-age=600`，等 10 分钟或换 query 参数）；token 不一致 = 配置表复制错 |
| 6. 回 GSC 点「验证」 | 刚才的验证向导里点「验证」 | 提示「所有权已验证」 | 报「找不到标记」：确认验证的是**同一 URL 前缀属性**、meta 在**首页**、页面可公开访问（无 404/跳转） |
| 7. 提交 sitemap | GSC 左侧「站点地图」→ 输入 `sitemap.xml`（完整地址 `https://buguoshixc.github.io/ai-deals-aggregator/sitemap.xml`）→ 提交 | 状态「成功」；「已提交的网址」= 182；过几天「已编入索引」开始增长 | 「无法抓取」：先在浏览器无缓存打开 sitemap 确认 200/XML；确认属性前缀与 sitemap 路径一致；不要提交项目 robots 里的地址（robots 不被读取，但 sitemap 本身可访问） |
| 8. 逐个「请求编入索引」 | 「网址检查」→ 粘贴 URL → 等实时测试结果 → 点「请求编入索引」；**10 个重点 URL 逐个做（一天别超过 ~10 条）** | 每条显示已加入队列；1–7 天后 URL 检查显示「已编入索引」 | 显示「已发现但未编入」= 正常排队，不要重复猛点；显示「已排除/noindex」= 查页面 meta/canonical；显示「备用网页」= 预期（3 个 `/need/*/` 别名页按策略 canonical 到正本） |
| 9. 之后每周 | 「网页 / 索引涵盖范围」看已编入索引是否上涨；「效果」看展示量 | 见 §5 第 3 周判据 | 见 §5 处置原则 |

**10 个重点 URL（照抄，不增删）**：

1. `/` → `https://buguoshixc.github.io/ai-deals-aggregator/`
2. `/free-api/`
3. `/plans/api/`
4. `/plans/coding/`
5. `/need/free-model/`
6. `/need/edu-identity/`
7. `/student/`
8. `/developer/`
9. `/category/api/`
10. `/changes/`

> 备选（仅当 HTML 标记验证受阻）：**HTML 文件验证**。Google 要求把平台给的 HTML 文件放到「该 URL 前缀」的根目录，即产物 `/ai-deals-aggregator/google….html`。当前构建只原样拷贝 `PUBLIC_FILES = ['index.html','favicon.svg','robots.txt','.nojekyll','BingSiteAuth.xml']`（`scripts/tools/build-local.js`）；**用文件验证需要把文件加进这个拷贝清单**（代码改动，需要开发配合），或临时手放到产物再发布——建议优先用 HTML 标记，避免改构建。

### 4.2 百度搜索资源平台

**关键前提（先读，能省一轮失败）**：百度官方验证是**域名级**的——文件验证要求「放置于**域名根目录**」（即 `https://buguoshixc.github.io/` 根），HTML 标签验证要求加在「**网站首页**」的 `<head>`；而本站是共享主机下的**项目路径**（`/ai-deals-aggregator/`）。**路径能否被当作独立站点添加并验证，本环境无法证实**，只能登录实测；下面是可执行路径与兜底。

| 步骤 | 点哪里 / 填什么 | 凭什么判断成功 | 失败怎么排查 |
|---|---|---|---|
| 1. 打开入口 | <https://ziyuan.baidu.com> → 站点主百度账号登录 → 用户中心 → **站点管理** → 添加网站 | 能进入「添加网站」表单 | 打不开 = 登录/网络问题 |
| 2. 填站点 | 填 `https://buguoshixc.github.io`（百度按**域名/主站**收；路径信息交给 sitemap 表达）。HTTPS 站点**要写协议头**（官方文档 1485 原文提醒） | 站点出现在「站点管理」列表，状态「未验证」 | 若平台拒绝/只接受纯域名，实测记录其提示原文（这一步的结论值钱：它决定后续能不能走） |
| 3. 选验证方式 | 优先 **HTML 标签**（复制 `content`，形如 `codeva-XXXX`）；备选 **文件验证**（下载文件）。⚠️ **不要选 CNAME 验证——官方已暂停**（公告 3462） | 平台给出待验证 meta/文件 | 旧教程写 CNAME 的一律跳过 |
| 4. token 落仓库 | **HTML 标签**：填 **`scripts/data/site-verification.json`** → `baidu.token`（与 Google 同一张表、同一注入块，构建期生成 `baidu-site-verification` meta）；**文件验证**：文件必须放**域名根**，属于另一个仓库（`buguoshixc/buguoshixc.github.io` 用户站仓库）或自定义域名根——**不在本仓库范围**，需站点主额外操作 | 构建自检输出 baidu 段；产物首页出现一次 `baidu-site-verification` | 配置表 token 为空/含非法字符时构建会**直接报错**（这是有意的，别改成静默跳过） |
| 5. 发布 + 回平台验证 | 发布后回「站点管理」点「验证」 | 状态变「已验证」；验证信息按官方公告**不过期** | **若平台回读的「网站首页」是 `https://buguoshixc.github.io/`（域名根，非本站页面）**：HTML 标签验证必失败 ⇒ 走 6 或 7 |
| 6. 兜底 A：文件验证到域名根 | 站点主创建 GitHub **用户站仓库** `buguoshixc/buguoshixc.github.io`（同账号；GitHub Pages 用户站），把百度验证文件放其根，并在该仓库根放一个可访问首页与 `robots.txt` | 百度文件验证通过；顺带解决了「主机根 robots 404」——可在根 robots 写 `Sitemap: https://buguoshixc.github.io/ai-deals-aggregator/sitemap.xml`（对 Google 也生效） | 这是**唯一确定可行**的账号级兜底（不换域名）；需要站点主建仓库/推送，属账号操作 |
| 7. 兜底 B：自定义域名 | 给本站绑自定义域名（GitHub Pages CNAME + DNS；百度用 CNAME 验证仍不可用，须用文件/标签验证） | 同 5 | 用户已明确「不换域名」，仅在明确改变决策时考虑 |
| 8. 验证通过后：提交 sitemap | 平台 → **资源提交 → 普通收录 → sitemap** → 提交 `https://buguoshixc.github.io/ai-deals-aggregator/sitemap.xml` | 提交成功；「索引量」逐步 > 0（官方明说 sitemap 慢于 API，别按天催） | 配额限制（官方文档 3076 提到配额机制）；文件格式/编码问题先自查（`application/xml`、UTF-8） |
| 9. 抓取诊断 | 平台 → **数据统计 → 抓取诊断** → 对首页、`/free-api/`、`/plans/api/` 各跑一次 | 显示抓取成功 / HTTP 200 / 下载大小与实测一致 | 失败先看「抓取异常」的 IP/地区/状态码原因，**不要**先改页面内容 |
| 10. 之后每周 | 「索引量」看是否 > 0 且上行；「抓取频次/抓取异常」看稳定性 | 见 §5 第 3 周判据（百度侧降级为「索引量 > 0 且上行」） | 若验证这条路走不通：按 §4.2 结论记「百度对 github.io 项目路径暂不可验证」，第 3/6 周判据只看必应 + Google，**不伪造 token、不伪造提交记录、不换域名** |

### 4.3 不需要账号、已经就绪的部分（无需再动）

- 爬虫可达性：robots `Allow: /`、无 noindex、无 `X-Robots-Tag`、三 UA 同内容、sitemap 182 条、canonical 自指、10 个重点 URL 全 200；
- 必应：`BingSiteAuth.xml` 已验证 + IndexNow 发布后通知（141 点击 / 1.7K 展示 / 8.09% CTR 为当前唯一有真实搜索流量的渠道）；
- 唯一缺的是：**Google 与百度的账号侧动作**（token 生成 → 配置表 → 发布 → 平台点验证 → 提交/推送）。

### 4.4 「token 拿到后改哪个文件」汇总（只写建议，不改代码）

| 渠道 | token 放哪 | 注入到哪 | 需要改的第二处吗 |
|---|---|---|---|
| Google（HTML 标记） | `scripts/data/site-verification.json` → `google.token` | 构建期注入 `index.html` 的 `<head>`（`SEO:VERIFICATION` 块）→ 产物首页 | 不需要（发布后回 GSC 点验证） |
| 百度（HTML 标签） | `scripts/data/site-verification.json` → `baidu.token` | 同上（`baidu-site-verification`） | 不需要；但「路径级站点能否验证」要先实测 |
| Google（HTML 文件，备选） | 文件放**属性前缀根**（`/ai-deals-aggregator/` 根） | 需加入 `scripts/tools/build-local.js` 的 `PUBLIC_FILES` 拷贝清单（或由构建期生成） | 是（构建代码改动） |
| 百度（文件验证，兜底） | 文件放**域名根** | 属 `buguoshixc/buguoshixc.github.io` 用户站仓库，**不在本仓库** | 是（另一个仓库/账号动作） |

---

## 5. 观测判据（第 3 周 / 第 6 周）

### 5.1 基线口径（先写死，避免事后挪靶）

**统计窗口**：2026-10-19 至 2026-10-25（近 7 天）。**数据源**：Cloudflare Web Analytics（站点主后台）+ 必应 Webmaster Tools（站点主后台）；本报告无法独立复现后台数字，出处见 §3.5。

| 指标 | 基线值 |
|---|---|
| 全站 | **699 PV / 425 会话** |
| 来源构成（会话） | 站内自引 **340**、直接 **200**、**必应 140**、其余合计 ≤19、**Google 0、百度 0** |
| 必应 | **141 点击 / 1.7K 展示 / 8.09% CTR**（唯一有真实搜索流量的渠道；位置数据滞后 4–8 周） |
| Google | **0 点击 / 0 展示**（GSC 未建，无从谈起） |
| 百度 | **0 点击 / 0 索引**（未验证、未提交 sitemap；本次实测 `site:` 0 收录，§2.7.1） |
| 页面结构 | 首页占 55% PV；`/need/student-only/` 32 · `/need/free-model/` 24 · `/need/edu-identity/` 23 · `/plans/coding/` 19 |
| 站点年龄 | 仓库 2026-09-20 创建，取证日约 5 周（§2.8） |

### 5.2 第 3 周（约 2026-11-16）：**只看展示量**

> 为什么三个渠道的通过线写法不同：基线里 **Google 与百度的展示量都是 0**，「0 的 3 倍」没有意义，所以这两路的第 3 周判据只能是「**从 0 到有**」（GSC 展示 > 0 / 百度索引量 > 0 且上行）；必应基线 1.7K 展示，按任务口径执行 **≥ 3 倍**。这不是降标准，是把「0 基线」翻译成可执行判据，避免「3×0=0 算通过」的自欺。

| 渠道 | 看哪里 | 通过线 | 不通过时怎么办（按顺序，不改内容） |
|---|---|---|---|
| 必应 | Webmaster Tools「搜索表现」7 天展示 | **≥ 5.1K（基线 1.7K × 3）** | ① 先看「已编入索引/抓取」是否正常；② 看 sitemap/IndexNow 是否仍在发；③ 看查询词是否还集中在品牌词；④ **不要**改版/堆内容 |
| Google | GSC「效果」7 天展示 | **> 0**（若 GSC 验证未完成则本条降级为「未启用，不计入」） | ① 查「网页/索引涵盖范围」：已编入索引是否 > 0；② 查 sitemap 报告是否「成功」；③ 查 10 条「请求编入索引」的状态；④ 只修「已抓取但未编入」的具体原因（noindex/canonical/重复），不改文案 |
| 百度 | 搜索资源平台「索引量」（验证成功才有数据） | **> 0 且在上行**（百度官方明说 sitemap 慢于 API，不与必应比速度） | ① 查「抓取诊断」是否成功、抓取异常原因；② 查 sitemap 是否已提交且被读取；③ 若验证卡死在「域名根/首页」问题：如实记录「暂不可验证」，第 3/6 周判据只看必应 + Google；④ 不买链接、不造假 token |

**第 3 周纪律（写进记录）**：**展示量没涨，先查收录状态，不要改内容。** 顺序固定：验证状态 → sitemap 读取 → 索引覆盖（已发现/已编入/已排除）→ 抓取诊断 → 最后才回到标题/内容。原因：收录未打开时，改内容对展示量的影响无法归因；且必应位置数据本身滞后 4–8 周。

### 5.3 第 6 周（约 2026-12-07）：才看**平均位置**

| 渠道 | 看哪里 | 通过线 | 说明 |
|---|---|---|---|
| 必应 | 「搜索表现」→ 查询/页面 → 平均位置 | 两个答案页 `/free-api/`、`/plans/api/` **各自至少 1 个查询稳定在前 20** | 位置滞后属正常，不因单日波动改版 |
| Google | GSC「效果」→ 平均位置（需已收录） | 同上；若 Google 仍未收录，则只记录「未收录」并回到第 3 周排查，不强行比较位置 | 新增页面/新站正常需要数周 |
| 百度 | 「索引量/流量与关键词」 | 若验证成功：索引量继续上行；关键词出现 ≥1 个非品牌查询 | 若验证未成功：不设位置判据（无数据基础） |
| 兜底判据 | 两平台都未开或展示量不达 3 倍 | 记录「渠道未启用/未收录」，把结论写清楚；**不换域名、不买外链** | 与配套 runbook 的「红线」一致 |

### 5.4 记录表模板（每周一行，照填）

| 日期 | GSC 验证/已收录/sitemap | GSC 7 天展示 | 百度验证/索引量/抓取诊断 | 必应 7 天展示 | 两个答案页是否有非品牌查询进入 | 结论 / 下一步 |
|---|---|---|---|---|---|---|
| 2026-10-26 | 未验证 / — / 未提交 | 0 | 未验证 / 0（外部实测 site: 0）/ — | 1.7K | 否 | 本报告基线；等站点主 token |
|  |  |  |  |  |  |  |

---

## 6. 复现与证据索引（`.scratch/seo-channel-probe/`）

> 这些是临时抓取文件，保留用于复核（按任务约定放在 `.scratch/seo-channel-probe/`；本任务在仓库里唯一新增的文件就是本报告）。重跑 `bash probe.sh` 即可重新生成 §2.1–§2.5 的全部数字。

| 文件 | 内容 |
|---|---|
| `probe.sh` / `probe.log` | 三 UA × 多 URL 的完整探测脚本与输出（15:52） |
| `robots_browser.{hdr,body}`、`robots_gbot.*`、`robots_baidu.*` | robots.txt 三 UA 响应头/正文（§2.1） |
| `sitemap_browser.*`、`sitemap_gbot.*`、`sitemap_baidu.*` | sitemap.xml 三 UA（§2.1） |
| `home_browser.*`、`home_gbot.*`、`home_baidu.*` | 首页三 UA（§2.1/§2.4） |
| `deep_*`、`root_robots_*`、`host_root_*`、`not_found_gbot.*`、`http_redirect.*` | 二级页/主机根/404/http→https（§2.2） |
| `baidu_site.html`、`baidu_url.html`、`baidu_gio.html`、`bd_mobile.html`、`baidu_nc.html` | 百度 site:/裸 URL/对照/移动端/反爬页（§2.7.1） |
| `bing_site.html`、`bing_ctrl.html`、`bing_gio.html` | 必应查询与对照（§2.7.3） |
| `sogou.html`、`so360.html` | 搜狗/360 旁证（§2.7.4） |
| `gbot_cn.json` | Google 官方 Googlebot IP 段 JSON（§2.6） |
| `gdoc_*.{html,txt}` | Google 官方文档抓取（robots/sitemap/verify-googlebot/essentials/search-console-start） |
| `gh_*.{html,txt}`、`gh_custom.html` | GitHub Docs 与社区讨论/issue |
| `bdoc_*.{html,txt}` | 百度官方文档（267/1485/3329/3076/640、公告 3462/182） |
| `indexnow.html/.txt` | IndexNow 官方站参与引擎说明 |

**本次遵守的边界**：未登录任何平台账号；未读取/提交任何后台数据；未 build；未 git commit/push；除本报告外未改动仓库任何文件；临时文件仅存在 `.scratch/seo-channel-probe/`。

---

## 7. 残余不确定性（明确列出，不藏）

1. **Google 索引状态**：本环境不可达 Google（DNS/TCP 均失败），`site:` 无法取证 ⇒ 只能标「无法证实」。站点主做 GSC 验证后，用「网址检查 → 实时测试」可一次回答。
2. **爬虫实际访问日志**：GitHub Pages 不提供；「Googlebot/百度来过没有」只能由平台后台反查。
3. **百度真实抓取 IP 与地区策略**：本环境只能 UA 模拟，不能证明百度出口 IP 未被 CDN 拦；「GitHub 屏蔽百度」旧说与本环境实测冲突，但无法裁决历史/网络层事实。
4. **百度「路径级站点」验证**：官方文档只写「域名根 / 网站首页」，项目路径能否被接受必须登录实测；本报告给出兜底（用户站仓库/自定义域名），但不假设它能成。
5. **备案与收录的因果关系**：未找到百度官方「必须 ICP 备案才收录」明文；360 仅显示「备案号：无」。不写成结论。
6. **后台基线数据**（699 PV / 425 会话 / 必应 141 点击等）：来自站点主后台，本报告无法独立复现，只作为 §5 判据口径引用（出处 §3.5）。
7. **`site:` 指标本身的局限**：百度 `site:` 是近似值、可能波动；但本次 PC + 移动 + 裸 URL 提示 + 搜狗/360 四路一致，故「当前 0 收录」判定为**已证实（高置信）**，而非「绝对索引量 0」。
