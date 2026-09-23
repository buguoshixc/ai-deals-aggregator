# 厂商 logo 资产

样稿 009 用的厂商品牌图形。原则：**只用厂商官方发布的图形，不猜、不拼、不热链**。

## 三类来源

| 方式 | 数量 | 说明 |
|---|---|---|
| 品牌矢量（simple-icons） | 18 | 官方品牌路径，随样稿内联为 SVG，任意缩放不糊 |
| 官网文件 | 11 | 从厂商自己域名下的 `<link rel=icon>` / `apple-touch-icon` / 站内 logo 资源下载 |
| 矢量重建 | 1 | Microsoft 四色方块（几何极简，可直接重建） |

**没有热链任何 CDN。** 样稿里全部内联为 data URI：
既不把访客 IP 交给第三方，也不怕对方改文件后图形失效。

## 文件说明

- `_brand-svg.json` — 18 个品牌矢量的路径数据（viewBox / path d / 品牌色 / 来源）
- `_sources.json` — 11 个位图 logo 的原始下载地址与格式记录
- `*.png` / `*.svg` — 位图 logo 本体

## 质量标注（需人工确认）

| logo | 问题 |
|---|---|
| 科大讯飞 `iflytek.png` | 官网只有 32×32 favicon 可用；解码后主色偏青（#00FFFF），与其官网蓝色系（#2F8BFC 等）不符 —— **需人工核对该图标是否为其现行品牌图形** |
| 商汤 `sensetime.png` | 方形图标仅 120×184；站内 `logo-frame10.png` 是 2105×592 的长条词标，不适合方块位 —— 建议向品牌方索取矢量素材 |
| 硅基流动 `siliconflow.svg` | 原图 156×32（4.9:1 横条），方块位里会显示成一条 —— 样稿中已改为横向胶囊适配 |

## 复核方法

```bash
node mockups/_tools/check-logos.js     # 解码每个 PNG，统计白底墨迹与内容包围盒
node mockups/_tools/find-logos.js      # 重新在厂商官网搜 logo 资源（换更清晰的版本时用）
node mockups/_tools/verify-009.js      # 浏览器里验证 logo 是否真的画出来
node mockups/_tools/build-009.js       # 重新生成 009 样稿（读本目录的 logo，写 mockups/v2-dense/）
```

四个脚本都能从任意工作目录调用：它们一律以 `__dirname/../..` 定位仓库根，
启动时各自打印一次解析出来的目标目录（`[check-logos] 扫描目录 …`），路径不对一眼就能看出来。
（早先它们是在 `__dirname` 之下又拼了一层 `mockups`，解析成不存在的
`mockups/_tools/mockups/…`，四个工具因此全部被阻断——现已修正。）

> `check-logos.js` 实现了完整的 PNG 解码（含 scanline filter 反演与调色板），
> 因为"图能不能显示"必须靠真实解码判断——只看文件大小会被空图骗过。

## 图源登记已搬到 assets/logos/manifest.json

样稿阶段的那份登记已经落到 `assets/logos/manifest.json`，它才是页面用的**唯一事实来源**。
`mockups/_tools/gen-manifest.js` 当初只跑一次、用来播种，现在是**只并集、不覆盖**：

```bash
node mockups/_tools/gen-manifest.js    # 安全：只补种子里新出现的 key，绝不删登记
```

重跑它对当前 manifest 是**字节无变化**的操作。之所以改成并集，是因为旧的覆盖语义会把
49 条登记砍回 38 条（删掉 ai360 / huggingface / mistral / together / midjourney / xai /
ideogram / leonardo / krea / coze / modelscope），随后 `npm run build` 直接失败。
日常维护请直接编辑 `assets/logos/manifest.json`，详见 `assets/logos/README.md`。

## 版权

所有厂商 logo 版权归各厂商所有，本站仅作来源标识用途。
