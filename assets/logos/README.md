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

| kind | 含义 | 要求 |
|---|---|---|
| `brand` | 品牌矢量路径（simple-icons 等品牌图形库） | 必须有 `d` 或 `svg` 字段；可任意缩放 |
| `file` | 厂商官网自己发布的图标文件 | 必须有 `file` 字段，且文件确实在 `assets/logos/` |

`file` 类型的来源必须是**厂商自己的域名**。不从 Google/DuckDuckGo 的 favicon 服务取图——
那等于把访客指给第三方，也拿不到真实来源。

## 缺口（明确记录，不用近似图凑数）

以下厂商**目前没有 logo**，卡片上就是不显示 logo。原因如实记录：

| 厂商 | 情况 |
|---|---|
| Midjourney | 官网对抓取返回 403 |
| Hugging Face / Mistral / Ideogram / Leonardo / KREA / xAI | 官网在本机网络下连不上（DNS/TLS 层失败），非 404 |
| Together AI | 图标托管在 framerusercontent，直连失败 |
| 科大讯飞 | 官网只有 32px favicon 可用，偏小 |
| 商汤科技 | 方形图标只有 120×184；站内 `logo-frame10.png` 是 3.5:1 长条词标，不适合方块位 |

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
