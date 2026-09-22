# 厂商 logo 资产

页面上的厂商 logo 全部来自这里。**没有一个是拿标题里的字拼出来的。**

## 怎么用

```
assets/logos/manifest.json   唯一事实来源：每个 logo 的名称、来源、取图方式、质量
assets/logos/*.png|*.svg     从厂商官网下载的原始文件
```

构建时 `scripts/lib/logos.js` 读取 manifest，产出：

```
dist/logos/<key>.svg             品牌矢量（由 manifest 里的路径现场生成）
dist/logos/<原始文件名>           官网文件（原样拷贝）
dist/logos.css                   每个 logo 一条规则
```

页面模板里只写 `data-logo="厂商key"`，图形由 CSS 提供。因此：

* **渲染核心保持纯函数** —— 不读文件、不拼 base64，构建期预渲染与浏览器共用同一份模板；
* **不热链任何第三方 CDN** —— 图形全部落盘，访客 IP 不交给别人，也不怕对方改文件后失效；
* 换 logo 只需改 manifest 后重新构建，不碰模板。

构建期会断言「模板引用的每个 logo key 都已登记」。缺一个就**构建失败**，
而不是在页面上留一个空白方块。

## 两种取图方式

manifest 里每条 logo 的 `kind` 只有两种：

| kind | 含义 | 必填字段 | 来源要求 |
|---|---|---|---|
| `brand` | 品牌矢量路径，随构建生成为 SVG，任意缩放不糊 | `d`（或整段 `svg`）+ `color` + `viewBox` | 品牌图形库（simple-icons 等）的官方品牌路径 |
| `file` | 官网发布的图标文件，原样拷贝进产物 | `file`（文件必须在 `assets/logos/`） | **厂商自己的域名** |

两条硬性规矩：

1. `file` 的来源优先取厂商官网。**不从 Google / DuckDuckGo 的 favicon 服务取图**——
   那既拿不到真实出处，也等于把访客指给第三方。
2. 官网在本机网络下不可达时，允许退到**品牌图形库的官方品牌路径**，但必须在 `source` 里
   写明是图形库来源、并注明「官网不可达」，**不要含糊成「官网文件」**。

## 缺口（明确记录，不用近似图凑数）

以下 5 家**数据里有条目、但拿不到官方图形**，卡片上就是不显示 logo：

| 厂商 | 数据里 | 情况 |
|---|---|---|
| Midjourney | 1 条 | 官网对抓取返回 403；页面里的内联 favicon 是 32×32，画布校验**不透明像素 0%**——整张透明的占位图，不是 logo，已丢弃 |
| xAI（Grok） | 1 条 | 官网 `x.ai` 不可达 |
| Ideogram | 1 条 | 官网 `ideogram.ai` 不可达 |
| Leonardo AI | 1 条 | 官网 `leonardo.ai` 不可达 |
| KREA | 1 条 | 官网 `krea.ai` 不可达（注意：`/krea/i` 会误命中「Kreado AI」另一家，规则必须带边界） |

「不可达」的判定依据（`DNS → TCP:443 → HTTPS` 三段探针）：

```
x.ai          DNS ✓ 2a03:2880:f126:83:face:b00c:0:25de(v6), 208.31.254.33(v4)  TCP ✗ ETIMEDOUT
mistral.ai    DNS ✓ 2a03:2880:f111:83:face:b00c:0:25de(v6),  31.13.73.169(v4)  TCP ✗ ETIMEDOUT
ideogram.ai   DNS ✓ 2a03:2880:f11c:8083:face:b00c:0:25de(v6), 23.101.24.70(v4)  TCP ✗ ETIMEDOUT
leonardo.ai   DNS ✓ 2a03:2880:f117:83:face:b00c:0:25de(v6),  65.49.26.98(v4)   TCP ✗ ETIMEDOUT
krea.ai       DNS ✓ 2a03:2880:f127:283:face:b00c:0:25de(v6),199.59.148.246(v4)  TCP ✗ ETIMEDOUT
```

一批互不相关的域名解析到同一段 `2a03:2880:…:face:b00c`（Meta 的地址段），A 记录也是杂拼的，
且**强制 IPv4 后仍全部超时**，真浏览器（Edge，Happy Eyeballs）也一样——
所以这不是「站点拒绝我们」，是本机网络出口对这些域名的解析/路由有问题。
这类情况本地无解，需要在能正常解析的网络里取。

另有 2 家**图形尺寸偏小**，可用但建议向品牌方要矢量素材：

| 厂商 | 情况 |
|---|---|
| 科大讯飞 | 官网只有 32×32 favicon 可用 |
| 商汤科技 | 方形图标只有 120×184；站内 `logo-frame10.png` 是 3.5:1 长条词标，不适合方块位 |

## 已登记但暂未被引用

这三家的官方品牌图形已登记，**但数据里目前还没有它们的条目**，所以卡片上暂时用不到。
留着是为了等采集器抓到它们时开箱即用——`logos.css` 只有 8 KB（图形是独立文件、按需请求），
未被引用的图形不会产生任何请求：

| key | 来源 |
|---|---|
| `huggingface` | simple-icons 官方品牌路径（`huggingface.co` 本机不可达）#FFD21E |
| `mistral` | simple-icons 官方品牌路径（`mistral.ai` 本机不可达）#FA520F |
| `together` | 官网 CDN 的 touch icon 256×256（`www.together.ai` 直连很飘，常超时） |

`dify` / `githubcopilot` / `ollama` / `openrouter` 同理：图形已登记，等有对应条目时自动生效。

补的方法：

```bash
npm run fetch:logos                      # 探测内置候选清单，命中就写入 assets/logos/
npm run fetch:logos -- --only=canva      # 只试某几家
# 也可以手工把文件放进 assets/logos/，然后
```

在 `manifest.json` 里登记一条，再把 key 填回 `index.html` 的 `VENDOR_RULES`
（`logo key` 为 `null` 的条目就是「只做厂商归一、不挂图形」）。

## 版权

所有品牌图形版权归各厂商所有，本站仅作标识用途（指明优惠来自哪家）。
页脚有对应声明。

## 加新厂商的完整流程

1. `npm run fetch:logos -- --only=新厂商` 或手工放文件到 `assets/logos/`；
2. 在 `manifest.json` 的 `logos` 里加一条（`name` / `kind` / `source` / `quality` 必填）；
3. 在 `index.html` 的 `VENDOR_RULES` 里加一条归一规则（正则 → 规范厂商 key → 显示名 → logo key）；
4. `npm run build` —— 缺登记会直接报错；
5. `npm run verify` 会逐个 logo 真加载一遍，确认图形没坏。
