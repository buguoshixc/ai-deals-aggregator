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

## 取不到时怎么办：名称缩写兜底（明确降级，不冒充）

**顺序是硬的：拿得到官方品牌图形就一定要用真图形；只有确实拿不到，才退到名称缩写。**
两者永远不会出现在同一张卡片上（构建与浏览器验收都会断言这一点）。

兜底块的做法（`index.html` 的 `textMarkOf()` / `logoHtml()`）：

| 规则 | 说明 |
|---|---|
| 取字 | 拉丁名取前两个词的首字母（`Wispr Flow → WF`、`Dubly.AI → DA`）；只有一个词或中日韩名取前两个字（`KREA → KR`、`商汤科技 → 商汤`）。纯函数，同名同缩写 |
| 配色 | 6 个**低饱和深色**里按名称哈希取一个，与品牌色明显不同——目的是让人一眼看出「这不是品牌图形」 |
| 标注 | `title` 与 `aria-label` 都写明「名称缩写，未取得官方品牌图形」，鼠标悬停即可看到 |
| 不复用 | 缩写块没有 `data-logo` 属性，不走 `logos.css`，也不会被误当成登记过的图形 |

当前覆盖情况（`npm run report:vendor` 可复核）：**官方品牌图形 35 家 / 名称缩写兜底 37 家 / 共 72 家**。
缩写块里有 1 组重名（`Labrynth` 与 `Leonardo AI` 都是 `LA`）——这不成问题，
因为卡片上紧挨着就写着厂商全名，缩写块只是视觉锚点，不承担唯一标识。

## 直连取不到时：走本机代理 + 真浏览器

**这是本项目实际踩过的坑，记下来免得下次重走一遍。**

症状：`x.ai` / `mistral.ai` / `ideogram.ai` / `leonardo.ai` / `krea.ai` / `www.midjourney.com`
在本机**直连**下全部超时。三段探针（`DNS → TCP:443 → HTTPS`）显示一批互不相关的域名
把 AAAA 解析到同一段 `2a03:2880:…:face:b00c`（Meta 的地址段），A 记录也是杂拼的：

```
x.ai          DNS ✓ 2a03:2880:f126:83:face:b00c(v6),  208.31.254.33(v4)  TCP ✗ ETIMEDOUT
mistral.ai    DNS ✓ 2a03:2880:f111:83:face:b00c(v6),   31.13.73.169(v4)  TCP ✗ ETIMEDOUT
ideogram.ai   DNS ✓ 2a03:2880:f11c:8083:face:b00c(v6), 23.101.24.70(v4)  TCP ✗ ETIMEDOUT
leonardo.ai   DNS ✓ 2a03:2880:f117:83:face:b00c(v6),   65.49.26.98(v4)   TCP ✗ ETIMEDOUT
krea.ai       DNS ✓ 2a03:2880:f127:283:face:b00c(v6), 199.59.148.246(v4)  TCP ✗ ETIMEDOUT
```

**强制 IPv4 没用，真浏览器（Edge，Happy Eyeballs）也没用——不是站点拒绝我们，是本地出口
对这些域名的解析/路由有问题。** 结论：换出口，即把本机代理打开。

代理打开后按情况分三条路，从简到繁：

```bash
# ① 站点不挡爬虫：两个环境变量就够，Node 内置 fetch 会自己走代理（Node 24+）
#    set NODE_USE_ENV_PROXY=1 & set HTTPS_PROXY=http://127.0.0.1:7890   (Windows)
export NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890
npm run fetch:logos -- --only=canva

# ② 站点挡 curl/node（Cloudflare 403）：用真浏览器 + 代理访问首页，再在页面上下文里取图
#    关键点是 fetch(url, { credentials: 'include' })——它带 cookie 与 Referer，
#    等同页面自己加载那张图；用 Playwright 的 ctx.request 取会一路 403。
#    参考实现见 git 历史里的 mockups/_tools/_proxy-logos*.js（一次性脚本，未入库）

# ③ 站点的图标路径本身 403：退一步找 og:image / 页面内 <img> 里的 logo
#    注意 og:image 常是社交预览大图（Hugging Face 那次拿到的是 1200×648 横幅），
#    必须用画布校验 + 长宽比过滤，别把横幅当 logo
```

**每一步都要过画布校验**（不透明像素占比 + 平均色）。这条规矩抓出过两个真问题：
Midjourney 页面内联 favicon 是**整张透明**的占位图（不透明像素 0%），
Ideogram 站内 `new-logo.svg` 是 **5:1 长条字标**（方形格位不合适）。

## 图形尺寸偏小、但已采用的

| 厂商 | 尺寸 | 说明 |
|---|---|---|
| 科大讯飞 | 32×32 | 官网只有这个 favicon 可用 |
| Ideogram | 48×48 | 官网方形图标最大 48×48（24px 格位的 2 倍）；站内字标是 5:1，不适合方块位 |
| KREA | 64×64 | 站点尺寸表里最大就是 64×64 |
| 商汤科技 | 120×184 | 方形图标只有这么大；站内 `logo-frame10.png` 是 3.5:1 长条词标 |

建议有条件时向品牌方索取矢量素材，替换后 `quality` 字段同步改掉。

## 已登记但暂未被引用

这几家的官方图形已登记，**但数据里目前还没有它们的条目**，所以卡片上暂时用不到。
留着是为了等采集器抓到它们时开箱即用——`logos.css` 只有 8 KB（图形是独立文件、按需请求），
未被引用的图形不会产生任何请求：

| key | 来源 |
|---|---|
| `huggingface` | 官网官方 logo SVG `front/assets/huggingface_logo-noborder.svg`（经代理取得） |
| `mistral` | 官网官方 `favicon.svg` 183×183（经代理取得） |
| `together` | 官网 CDN 的 touch icon 256×256 |
| `dify` / `githubcopilot` / `ollama` / `openrouter` | 品牌图形库的品牌路径 |

补的方法：

```bash
npm run fetch:logos                      # 探测内置候选清单，命中就写入 assets/logos/
npm run fetch:logos -- --only=canva      # 只试某几家
# 也可以手工把文件放进 assets/logos/
```

在 `manifest.json` 里登记一条，再把 key 填回 `index.html` 的 `VENDOR_RULES`
（`logo key` 为 `null` 的条目就是「只做厂商归一、不挂官方图形，走名称缩写兜底」）。

## 版权

所有品牌图形版权归各厂商所有，本站仅作标识用途（指明优惠来自哪家）。
页脚有对应声明。

## 加新厂商的完整流程

1. `npm run fetch:logos -- --only=新厂商` 或手工放文件到 `assets/logos/`；
2. 在 `manifest.json` 的 `logos` 里加一条（`name` / `kind` / `source` / `quality` 必填）；
3. 在 `index.html` 的 `VENDOR_RULES` 里加一条归一规则（正则 → 规范厂商 key → 显示名 → logo key）；
4. `npm run build` —— 缺登记会直接报错；
5. `npm run verify` 会逐个 logo 真加载一遍，确认图形没坏。
