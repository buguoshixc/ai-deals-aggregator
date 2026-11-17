# v6-fix · 第 0 步示意图（只出图，不改源码）

三张「改前 / 改后」并排图，全部来自 `dist/index.html` 的补丁副本；`dist` 与源码未改，`git status` 只多出 `mockups/v6-fix/`。

| 图 | 尺寸 | 内容 |
|---|---|---|
| [1440-light.png](1440-light.png) | 2976×3123（2×） | 1440×1800，亮色；改前/改后 + 两组 2× 细节 |
| [1440-dark.png](1440-dark.png) | 2976×2119（2×） | 1440×1800，暗色；改前/改后 |
| [390.png](390.png) | 1640×2983（2×） | 390×900 首屏；改前/改后 + 入口卡块（10 张）改前/改后裁切 |

看完请点头或否决。点头后按 **A1→A2→A3→B→C1→C2→D1→D2** 一次做完，中间不再交付。

---

## 1. 图上这一段 ↔ 第 N 项改动

任务书用 A1/A2/A3/B/C1/C2/D1/D2 分段；图例用 ①–⑥。对应关系如下。

| 图上的位置 | 图上找什么 | 对应改动 | 实测读数（改前 → 改后） |
|---|---|---|---|
| 390 图，左/右主图 | 左边首屏是入口卡，优惠网格在 1149px 之后；右边首屏直接是「显示 88 条卡片」+ 第一张优惠卡 | **C1**（视觉 ①） | 网格 top 1148.75 → 390.75px；首卡 top 1180.75 → 422.75px；390×900 内完整优惠卡 0 → 2 张 |
| 390 图，底部「入口卡块（10 张）」细节 | 同一块 10 张卡：改前在首屏，改后在优惠网格之后（top≈17,253px），一张没少、没有 `<details>`、没有新增控件 | **C1**（视觉 ①） | 块高 758px 不变；改后 top 17,253.13px；`previousElementSibling = #dealsList` |
| 1440 亮/暗顶栏 | 改前三枚实心药丸；改后一枚实心（AI Coding 套餐对比）+ 两枚普通文字链，文案恢复全称「API / Token 计费对比」「API 成本计算器」 | **C2**（视觉 ②） | 1240px：search 201.28 → 203.61px；1440px：381.28 → 383.61px；ghlink 右缘 = 内容右缘（0.00px 溢出） |
| 1440 首行首卡；390 首屏首卡 | 9 张 OpenRouter 免费模型卡并成 1 张，标题「OpenRouter · 免费模型（9 个）」，成员行有 9 条详情链接 | **D1 预览**（视觉 ③） | 卡片 96 → 88；完全免费档 15 → 7 张；合并卡 1440 426–618px（452×192）、390 422.75–616.44px |
| 1440 下半部「细节」左列 | 智谱卡成员行：改前 15px 灰色横向滚动条压在引言上；改后单行 + 省略号，无滚动条 | **A1**（视觉 ⑤） | `.fmembers` offsetH/clientH 30/15 → 15/15；scrollW 3063 → 仍 3063，但 overflow 已隐藏 |
| 1440 下半部「细节」右列；1440 亮/暗全页角标 | 角标「未标注截止日期」→「未标注」；讯飞卡标题从 2 行收回 1 行；`title`/`aria-label` 仍是全句 | **A2**（视觉 ④） | 改前全站 66 个 `.tg.uns`（合并 9→1 后 58 个）；1440 折行标题 34 → 21 条；8 条真正收回一行（名单见 §2.4） |
| 1440 / 390 筛选条右端 | 最后一枚 chip 的右缘渐隐（390 图上「国外 66」最明显）；没有左右箭头按钮 | **A3**（视觉 ⑥） | 1440：scrollW 1426 / clientW 1420；390：1418 / 390；mask 左 10px、右 26px |
| （不在图上） | 没有画 | **B** | 176,420 字符内联脚本 → 外链；无视觉变化 |
| （不在图上） | 没有画 | **D2** | `cleanText` 200 字上限；数据/详情页改动，无首页视觉变化 |

> 图例编号在 390 图里没有 ②：≤560px 时 `.plansnav-api` / `.plansnav-cost` 本来就 `display:none`，顶栏只留第一枚药丸；顶栏降权只在 ≥1240px 可见，所以 ② 只在 1440 图里。

---

## 2. 五项可见证据（实测）

### 2.1 390：入口卡整块后移（C1）

- 改前：`nav.needs` 在 `main` 之前，top 194–952px（高 758px），390 单列 10 张 `.need-card`；`#dealsList` top 1148.75px，首卡 1180.75px，**390×900 首屏 0 张完整优惠卡**。
- 改后：`nav.needs` 移到 `#dealsList` 之后，top 17,253.13–18,011.13px；`#dealsList` top 390.75px，首卡（合并卡）422.75–616.44px，第二张（百川）630.44–824.13px，**首屏 2 张完整优惠卡**。
- 10 张卡全部保留，仍是整卡 `<a>` 链接，没有 `<details>`、没有新增按钮/控件；`/need/<slug>/` 链接不变。
- 390 图底部的「入口卡块（10 张）」细节是把同一块单独裁出来对照：改前在首屏、改后在页面底部；主图 900px 高装不下 17,253px 处的内容，所以用细节条补证。

**实现注意（第 1 步 C1 会碰到）**：`nav.needs` 移进 `main` 后，会吃到 `main` 的 16px 横向 padding，块宽从 390 变成 358，卡片跟着变窄。本示意图里用 `#dealsList + nav.needs{margin-left:-16px;margin-right:-16px}` 补回；最终源码移动 `<!--PRERENDER:needs-->` 时必须处理这个包含块变化，否则移动后的卡片会比移动前窄 32px。

### 2.2 顶栏降权（C2）

- 改前：三枚 `.plansnav` 实心药丸（AI Coding 套餐对比 / API 计费对比 / 成本计算器）。
- 改后：第一枚保持实心；`.plansnav-api`、`.plansnav-cost` 改成普通文字链，文案恢复全称；样式 `font-size:11.5px; font-weight:400; padding:6px 0; border:0; background:none; color:var(--ink2)`。
- 断点保持 **1240px**：`@media (min-width:1240px){display:inline-block}`。1260px 的方案也测过（search≈219.8px），但会多藏 20px 宽度；1240px 已经放得下，所以没有抬断点。
- 宽度账（Linux Chromium，2× 截图同源）：
  - 1240px：before search 201.28px；after 203.61px（+2.33px）；API 链 113.77px、成本链 81.86px；`ghlink` 右缘 = `.topin` 内容右缘，无溢出。
  - 1440px：before 381.28px；after 383.61px（+2.33px）。
  - 暗色：文字链 `rgb(182,190,201)` on `rgb(11,13,16)`，对比约 10:1；第一枚药丸仍用 `--brand`，不另造颜色。
- 任务书说现行 1240px slack 只剩 1px；本机实测现行 dist 三枚药丸 **没有溢出**，`ghlink` 右缘与内容右缘差 0.00px（不是 1px）。这个出入可能来自 Windows/字体取整；这里按 Linux 实测记录，不把 1px 当成判据。

### 2.3 OpenRouter 9→1（D1 预览，视觉 ③）

- 9 条记录（deals.json 下标 55/56/57/58/59/60/142/158/163，`sourceUrl` 均为 `https://openrouter.ai/api/v1/models`）在改前是 9 张独立卡，位于 t1 的第 1–6、13–15 张。
- 图上按任务书字面把它们并成 1 张：
  - 标题「OpenRouter · 免费模型（9 个）」；h3 链到第一条 deal。
  - `data-deal-ids` 9 个 id；`data-model-count="9"`；`data-quota="shared"`；`data-models` 9 行。
  - `.fmembers` 里 9 个 `<a href="deal/<id>/">模型名</a>：…`，每条详情页跳转都保留；Crouton 的成员注是「免费；限流未标注」。
  - `.of` 的引言用 8 条逐字相同的 `discountInfo`；第 9 条（Crouton，`ef3cba339a72`）的限流口径不同，没有硬塞进同一句。
  - 角标仍「国外」+「未标注」；feats「9 个模型 · 均免费 / 20 RPM / 50–1000 RPD / :free 路由」。
- **冲突（需要你裁定）**：D1 的规则是「同一 `sourceUrl` 且 `discountInfo` 逐字相同且条数 ≥2」。这 9 条里只有 8 条逐字相同；Crouton 的 `discountInfo` 是「限流：未标注（该模型 ID 无 :free 后缀…）」，按规则应单独成卡。所以严格按 D1 是 **8+1**，标题应是「（8 个）」；图上是按你「9 条并 1 张 / 标题（9 个）」的字面做的 **9→1**。
  - 选 9→1：D1 规则要放宽成「同 sourceUrl + 同一免费计划」，并允许成员级限流注不同；或者接受标题写 9、其中 1 条口径不同。
  - 选 8+1：图上这张合并卡改成 8 个成员，Crouton 恢复单独一张；其余不变。
  - 请在这两个里点一个，第 1 步 D1 按它写断言和 `build-local.js` 的无损对账。
- 这张合并卡是**手工 DOM 演示**，不是最终数据模型；`data-model-count`、`data-quota=shared`、`#stats` 条数、排序、`/need/<slug>/` 落地页对账都要在第 1 步 D1 里按真实分组重算。

### 2.4 角标 7 字 → 3 字（A2）

- 只改 `label`：`未标注截止日期` → `未标注`；`note` 全句不动；`title`/`aria-label` 仍是「官方未标注截止日期，以官方页面为准」。
- 三态保留：`.tg.uns` 改前 66 个（合并 9→1 后 58 个，unknown）、`.tg.due` 21 个、`.tg.long` 10 个；没有删 unknown，也没有把 unknown 并进 long。
- 1440px 折行标题 34 → 21 条；角标缩短后**真正收回一行**的 8 条：
  1. 讯飞星火 Spark Lite 轻量级大模型免费使用
  2. 阶跃星辰 StepAudio 3 语音大模型限时免费
  3. 腾讯混元 新用户 100 万 tokens 免费资源包
  4. 智谱AI 邀请好友注册赠送 Tokens 资源包
  5. Runway 免费计划 一次性 125 credits
  6. ChatGPT Plus for Veterans (OpenAI)
  7. MiniMax MiniMax-M3 按量计费永久五折
  8. 海螺AI 会员限时优惠价 基础会员 55 元/月
- 另有 5 条折行标题消失，是因为整张卡被并进 OpenRouter 合并卡（Baidu / inclusionAI / Thinking Machines / NVIDIA / XingChen），不算角标收益。
- 1440 图下半部「细节」右列用讯飞卡做 2× 对照：改前角标全称 + 标题 2 行；改后「未标注」+ 标题 1 行。

### 2.5 `.fmembers` 不再横向滚动（A1）

- 改前：`.fmembers` 是 `position:absolute` + `white-space:nowrap` + `overflow-x:auto`；1440 下智谱卡 clientW 422 / scrollW 3063，Windows 经典横向滚动条高 15px，压在引言上方。
- 改后：`overflow-x:hidden` + `text-overflow:ellipsis` + `white-space:nowrap`；文本和链接仍在 DOM 里，`verify-site` 的 `memberTextChars > 0`、`memberLinks.length === declared` 仍能过；键盘 focus 仍可把隐藏链接程序化滚入视野。
- 没有改成换行 chips：卡片是 `height:192px` + `.g{overflow:hidden}`，换行会被裁掉；也没有删成员链接。
- 1440 图下半部「细节」左列是 2× 证据：智谱卡改前 30/15（有滚动条）→ 改后 15/15（无滚动条）；合并卡、百度千帆、火山方舟也都 15/15。
- 滚动条是 **Windows 条件复现**：Playwright 默认 headless 会加 `--hide-scrollbars`，不画内部滚动条；截图时用 `ignoreDefaultArgs:['--hide-scrollbars']` 关掉它，再单独用 `html::-webkit-scrollbar{display:none!important}` 隐藏页面级竖滚动条。只影响截图渲染，不改字体度量、不改卡片布局；Linux headless 默认看不到这条滚动条。

### 2.6 筛选条两端渐隐（A3）

- 现行 dist 的 `.facetsin` 已经是 `overflow-x:auto; scrollbar-width:none;` + `::-webkit-scrollbar{display:none}`，也就是说 A3 的「隐藏滚动条」在现行版本里**已经存在**；本示意图只加了渐隐。
- 渐隐：`.facetsin` 上 `mask-image: linear-gradient(90deg, transparent 0, #000 10px, #000 calc(100% - 26px), transparent 100%)`（含 `-webkit-`）；没有加左右箭头按钮，没有改 `build-local.js`。
- 1440px：scrollW 1426 / clientW 1420（只溢出 6px），最后一枚 chip 右缘渐隐。
- 390px：scrollW 1418 / clientW 390；首枚 chip 左缘 x=16px，左 10px 的渐隐落在容器 padding 里，静止时首枚 chip 不被淡化；右端「国外 66」明显渐隐。mask 是对称的：向右滚动后左端才会出现渐隐，静止时左边没有可提示的内容。

---

## 3. 没进图的两项

### B. render-core 外链（6a）

`dist/index.html` 里 176,420 字符的内联主脚本改成 `<script defer src="app.<内容哈希>.js">`，**没有视觉变化**，所以图上不假装展示。图上看到的筛选/排序/弹层仍是内联脚本跑的；第 1 步要同步改 `scripts/lib/render-core.js` 的抽取、`scripts/tools/verify-site.js:11438` 一类「没有内联脚本」的断言、`npm run check:reproducible`。共享 CSS 外链化不做（GitHub Pages 无自定义响应头，哈希换不到长缓存；代价是 verify-site 对 `<style>` 真文本的变异测试牙）。

### D2. 详情全文

详情英文被截断不是前端截的：源头是 `scripts/lib/schema.js:198 cleanText(value, maxLength = 200)`（`:225` 补 `…`），`deals.json` 里存的就是带 `…` 的串；全站三处 `-webkit-line-clamp` 都不在详情弹层。第 1 步给 `description` 单独更高上限、重跑 `npm run collect`，同步改 `scripts/tools/ai-selftest.js:996` 一类按 `MAX_EXCERPT_LENGTH` 的断言；**不造数据**，上游短就不补，也不在前端补「已截断」。图上没有详情弹层，这条不影响首页三张图；卡片 `.tx` 的 2 行 clamp 是另一个 UI，不是详情截断。

---

## 4. 与任务书 / 现行 dist 的出入（请一起看）

1. **dist 比任务书新**：现行 `dist/index.html` 是 **554,172 B**、6,583 行、数据更新 2026-11-17、96 张 article 卡；任务书写的 493,326 B 已过时。所有读数以现行 dist 为准；任务书里的行号（如 `index.html:834-840`）用于源码定位，不用于字节数。
2. **A3 的滚动条已经隐藏**：现行 `.facetsin` 已有 `scrollbar-width:none` 和 `::-webkit-scrollbar{display:none}`；第 1 步只需加渐隐（如果源码里确实已有，不要把「加 scrollbar-width」当成新改动重复写）。
3. **9→1 与 D1 规则冲突**：只有 8 条 `discountInfo` 逐字相同；图按字面做了 9→1。需要你裁定 9→1（放宽规则）还是 8+1（严格按规则）。
4. **1240px slack**：任务书说 1px；本机现行 dist 三枚药丸无溢出，`ghlink` 右缘与内容右缘差 0.00px；改后 search 宽 +2.33px。Linux 与 Windows 的字体差约 29px，1px 可能是 Windows 读数；本图按 Linux 实测。
5. **390 入口卡块双 padding**：移进 `main` 后会吃 16px 横向 padding；示意图用负 margin 补回。最终源码移动时必须处理，否则块宽 390→358、卡片变窄。
6. **计数两套口径**：`#topStat`「96 条优惠」和筛选条「优惠 96 / 国内 30 / 国外 66」是**优惠条数**；`#stats`「88 条卡片 · 国内 30 · 国外 58」和 t1 分档头「7 条」是**卡片数**。合并 9 条后两者不再相等。示意图只改了卡片级（t1=7、#stats=88/58），保留优惠级 96/66；第 1 步要么继续双口径并在文案上写清，要么统一成卡片级并同步筛选逻辑——需要你确认口径。
7. **合并卡的 logo**：没有取得 OpenRouter 官方品牌图形，用文本 `OR`（#4a5568）占位，`title`/`aria-label` 注明「名称缩写，未取得官方品牌图形」；不伪造 logo。
8. **Linux 字体/emoji**：入口卡图标是页面原生 emoji；Linux 截图缺彩色 emoji 字体，显示为方框（Windows 为原生 emoji），不影响布局；390 图注已写明。字体度量与 Windows 有约 29px 差异，所有宽度读数都是 Linux Chromium 的。

---

## 5. 已量到的数字（第 1 步最终报告会再测 6 项）

| 指标 | 改前 | 改后（示意图） |
|---|---|---|
| 首页 HTML 字节数 | dist 554,172 B（before 副本 554,200 B） | after 副本 562,521 B（含补丁 `<style>`/`<script>`，不是最终构建） |
| 1440 卡片数 | 96（t1 15 / t2 20 / t3 20 / t4 41） | 88（t1 7 / t2 20 / t3 20 / t4 41） |
| 1440 三列卡宽 / 网格 top / 首卡 top | 452 / 390 / 426px | 452 / 390 / 426px |
| `#stats` | 96 条卡片 · 30 国内 · 66 国外 | 88 条卡片 · 30 国内 · 58 国外 |
| 390 网格 top / 首卡 top / 900 内完整卡 | 1148.75 / 1180.75 / 0 | 390.75 / 422.75 / 2 |
| 390 入口卡块 top / 高 | 194 / 758px | 17,253.13 / 758px |
| 1240 顶栏 search 宽 | 201.28px | 203.61px |
| 1440 顶栏 search 宽 | 381.28px | 383.61px |
| 1440 折行标题数 | 34 | 21 |
| `.fmembers`（智谱）offsetH/clientH | 30 / 15px | 15 / 15px |

**未测、不编**：`br` 后首屏传输量、Lighthouse mobile 的 TBT/LCP、1240px「slack」的 1px 口径——这些要等第 1 步构建/Lighthouse 跑完再写进最终报告。本步只量了几何、字节和 DOM。

---

## 6. 复现

```bash
# 1) 从仓库根起静态服务（只读 dist；8081 不是 DSH 的 3081）
node scripts/serve.js --port 8081

# 2) 生成补丁副本（before.html / after.html；不改 dist、不改源码）
node mockups/v6-fix/_tools/build-fix.js

# 3) 六张原始截图（2×，1440×1800 与 390×900）
LD_LIBRARY_PATH=$HOME/.local/lib/chromium-deps/usr/lib/x86_64-linux-gnu \
  node mockups/v6-fix/_tools/shoot-fix.js --page=before --w=1440 --h=1800 --theme=light --out=mockups/v6-fix/shots/before-1440-light.png
# … 同理 before/after × 1440-light/1440-dark/390-light

# 4) 合成三张图
LD_LIBRARY_PATH=$HOME/.local/lib/chromium-deps/usr/lib/x86_64-linux-gnu \
  node mockups/v6-fix/_tools/compose.js
```

细节裁切（`shots/detail-*.png`）由 `_tools/measure-fix.js --card=…` 生成；本次用的是智谱卡（改前滚动条）、合并卡、讯飞卡（角标/标题）和 390 入口卡块。`before.html` 只比 dist 多一行 `<base href="../../dist/">`；`after.html` 在 `</body>` 前追加一段 `<style id="v6-mock-style">` 和一段最小 DOM 脚本，所有改动都在 `mockups/v6-fix/` 内。

---

## 7. 停在这里

这是第 0 步，源码与 `dist` 都没动；请先看三张图。需要你点头的三件事：

1. **9→1 还是 8+1**（D1 逐字相同规则 vs 图上字面 9 条）。
2. **顶栏 11.5px / 1240px 断点**是否接受（12px 会把 1240 的 search 压到 199.8px，比改前窄 1.48px；11.5px 才 +2.33px）。
3. **计数口径**：继续「`#topStat`/筛选条按优惠条数（96/30/66）、`#stats`/分档头按卡片数（88/30/58、t1=7）」的双口径，还是全部统一成卡片级并把筛选条也改成 88/30/58？第 1 步按你选的口径写断言。

点头后我再开始 A1，不会在这之前改源码。

---

## 8. 实现回填（2026-11-18，用户点头后）

上面第 1–7 节是**第 0 步的示意图记录**，保留不改；这里是第 1 步真做之后的回填，差异以本节为准。

- **折叠走严格规则 8+1，不是 9→1**：OpenRouter 9 条里只有 8 条 `discountInfo` 逐字相同，Crouton（`ef3cba339a72`）的限流口径不同，按 D1 单独成卡。最终首页 **89 张卡**（改前 96），t1=8，OpenRouter 合并卡标题「OpenRouter · 免费模型（8 个）」、`data-model-count=8`、`data-quota=shared`、8 个成员详情链接；Crouton 单卡紧随其后。
- **计数统一为卡片级**：最终 `#topStat`、筛选条、`#stats`、分档头都显示 **89 / 国内 30 / 国外 59**（不再保留第 0 步图上的 96/30/66 双口径；用户已批准「继续往下做」，实现按卡片级统一）。
- **合并卡 logo**：`assets/logos/manifest.json` 本来就有 OpenRouter 官方矢量（`openrouter`），构建期补了 `VENDOR_RULES` 映射；同源折叠卡不再叠成员条目的底层模型厂 logo（Baidu 等），只显示 OpenRouter 图形。没有使用示意图里的 `OR` 文本占位。
- **390 真图**：改后 390×900 首屏 **2 张完整优惠卡**（网格 391.75、首卡 423.75–617.44；改前 0，网格 1148.75）；入口卡块 10 张在网格之后（top≈17,431.72，高 758，宽 390）。合并卡标题在 390 上折成两行（「OpenRouter · 免费模型（8 / 个）」），成员行 ellipsis、无横向滚动条。
- **顶栏最终读数**：1240 搜索框 228.55px（改前 221.39，+7.16），gh 右缘 1220 = 内容右缘、overflow 0；1440 搜索 408.55px。任务书写的 1240「slack=1px」在本机不是可复现值（改前三药丸实测无溢出）。
- **6 个数字（最终）**：HTML **318,916 B**（改前 554,172）；首屏 37 个资源 br(q11) 合计 **237,356 B**（改前 36 个 231,814，+5,542 / +2.39%，外链拆文件的压缩开销）；Lighthouse mobile **TBT 53.5ms / LCP 2630.8ms**（改前 137.87 / 3487.20，score 0.94 / 0.82）；390×900 首屏完整卡 **2**（改前 0）；1240 搜索 **228.55px**（改前 221.39）。外链 JS 为 `dist/app.96016fea9674b1e2.js`，233,714 B。
- **D2**：`MAX_DESCRIPTION_LENGTH=600`（excerpt 仍 240），9 条 OpenRouter 描述已用 `npm run collect -- --only=openrouter` 重采；但上游原文本来就在 `total...` 处截断，`total…` 是上游字符串自带的省略号，**没有完整全文可恢复**，也没有前端补写「已截断」。
- **真图**：`real/after-1440-light.png`、`real/after-1440-dark.png`、`real/after-390-light.png`（2×）。与示意图 after 的已知差异：89 vs 88 卡（8+1 vs 9+1）、Crouton 单卡、官方 OpenRouter logo vs `OR` 占位、1240 search 228.55 vs 203.61（示意图基于当时 dist）、390 合并卡标题两行。
