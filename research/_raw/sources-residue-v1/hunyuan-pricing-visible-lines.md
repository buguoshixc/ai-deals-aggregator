# 腾讯混元计费页：今日原文片段（Tier-1）

抓取日：2026-10-08；URL：<https://cloud.tencent.com/document/product/1729/97731>

原件 `cloud_tencent_1729_97731.html`（49,938 bytes）按证据政策不入库；重跑命令：

```bash
curl -sS -L --max-redirs 5 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" \
     -o cloud_tencent_1729_97731.html -D cloud_tencent_1729_97731.headers.txt \
     -w "%{http_code} %{size_download}" https://cloud.tencent.com/document/product/1729/97731
```

响应头（逐字）：

```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Server: nginx
Vary: Origin
Access-Control-Allow-Origin: https://cloud.tencent.com
Access-Control-Allow-Credentials: true
X-RateLimit-Limit: 900
X-RateLimit-Remaining: 893
X-RateLimit-Reset: 1791454712
x-req-id: gqSisMWYap
Set-Cookie: qcloud_uid=gQ6BUmvUP2; path=/; expires=Sat, 30 Sep 2056 10:18:31 GMT; domain=.cloud.tencent.com
Set-Cookie: cn_en_tag=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.cloud.tencent.com; secure
Set-Cookie: language=zh; path=/; expires=Mon, 07 Dec 2026 10:18:31 GMT; domain=.cloud.tencent.com; secure
Content-Encoding: gzip
Content-Length: 49938
Connection: keep-alive
Date: Thu, 08 Oct 2026 10:18:31 GMT
EO-LOG-UUID: 4225735494395586037
EO-Cache-Status: MISS
```

快照 sha256 = `6ff32dd2ed89f8dafd80ef7828bc19c767612bccf37d8f766f3d4ad2e7990d42`

页面自报的更新时间（逐字；表头与值在 DOM 里是相邻的两行）：

```
最近更新时间：
2026-06-26 10:56:00
微信扫一扫
```

## 1. 顶部迁移公告（逐字，窗口从公告首句起 7 行）

```
为进一步提升大模型服务体验，腾讯混元大模型相关功能将逐步迁移至
TokenHub
。迁移后，原平台将不再新增模型能力，并停止支持新购模型服务。用户已购买的模型服务可继续使用，暂不受影响。如需开通新的模型服务或使用更多模型能力，请前往
TokenHub
。
计费方式
腾讯混元大模型提供 API 接入方式，采用后付费日结和预付费的计费模式。
```

## 2. 免费额度表（逐字，窗口从发放说明起 24 行）

```
首次开通腾讯混元大模型服务后，混元生文将发放一定量级的免费调用额度，供您测试体验。免费调用额度将以一次性的免费资源包的形式发放，并在计费结算时优先扣减。
产品名
免费额度
Hunyuan-a13b
共100万 tokens，共享消耗。
资源包有效期为1年，自开通服务之日起1年内若免费资源包未使用完，则过期作废。
Hunyuan-role-latest
Hunyuan-translation
Hunyuan-translation-lite
Tencent HY Vision 1.5 Instruct
Hunyuan-turbos-vision
Hunyuan-t1-vision
Hunyuan-turbos-vision-video
Hunyuan-embedding
100万 tokens。
资源包有效期为1年，自开通服务之日起1年内若免费资源包未使用完，则过期作废。
注意：
在账单结算时，系统将按照免费资源包 > 付费资源包 > 按量后付费的顺序进行结算，即免费资源包优先扣除。
若您欠费或因违规原因停服，将不能继续享受免费额度，只有服务重新开启后才可继续享受免费额度。
混元生文价格说明
token 后付费
在免费额度用完后，按如下价格进行后付费计费，每月1 - 3日系统会推送上个月账单并自动完成结算和扣费。
默认情况下，免费资源包耗尽或到期后
不会
```

## 3. token 后付费价格表（逐字，窗口从表头「刊例价」起 40 行）

```
刊例价（每 百万 tokens）
Hunyuan-a13b
输入：0.5元
输出：2元
Hunyuan-role-latest
输入：2.4元
输出：9.6元
Hunyuan-translation
输入：1.2元
输出：3.6元
Hunyuan-translation-lite
输入：1元
输出：3元
Tencent HY Vision 1.5 Instruct
输入：3元
输出：9元
Hunyuan-turbos-vision
输入：3元
输出：9元
Hunyuan-t1-vision
输入：3元
输出：9元
Hunyuan-turbos-vision-video
输入：3元
输出：9元
Hunyuan-embedding
输入：0.7元
输出：0.7元
腾讯元器
输入：100元
输出：100元
计费与结算方式
混元生文结算顺序为：赠送的
免费资源包
>
付费资源包
>
后付费
。
按用量（
```

## 4. 计费示例（逐字，窗口从示例首句起 8 行）

```
用户当月首次使用，累计调用混元生文接口 Hunyuan-role-latest 模型共200万 tokens，则在使用达到100万 tokens 时消耗完免费资源包，剩余100万 tokens 需通过后付费进行结算，区分输入和输出。假设用户使用了80万 tokens 输入，20万 tokens 输出，所需支付的费用计算如下：
800000 tokens / 1000000 tokens × 2.4元/每百万 tokens + 200000 tokens / 1000000 tokens × 9.6元/每百万 tokens = 3.84（元）
上一篇
:
应用场景
下一篇
:
混元生图计费概述
```

