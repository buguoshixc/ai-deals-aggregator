# 设计 token 对照：我们现有 ↔ 标杆证据 ↔ 建议

**这份文档只做一件事**：把「标杆站真实在用的数值」与「我们 `index.html` 里真实写着的数值」并排放，
给出**有出处**的建议值。所有标杆数值都可在 `research/_raw/<slug>/tokens.json` 里逐条复核；
我们自己的数值取自 `index.html` 的 `:root` 与规则块，以及用同一把尺子量出来的
`research/_raw/ours-baseline/`（`node scripts/tools/study-site.js` 打 `dist/`）。

**红线（写建议时的硬约束）**：浏览器端零依赖、不热链任何 CDN / Web 字体、零构建、单文件 `index.html`。
凡依赖 Web 字体、图标字体、构建产物的做法，本节一律归入「不学」。

---

## 0. 先看我们自己：同一把尺子量出来的现状

| 指标 | 我们（1440×900，dist 产物） | 标杆里最好的 | 结论 |
|---|---|---|---|
| 页面高度 / 滚动屏数 | 5334px / **5.9 屏** | llm-prices 8.3 屏、aitools.fyi 3.3 屏、appsumo 2.2 屏 | 密度已属上游；不追「页面更短」，追「一屏条数」 |
| 首屏完整可见条目 | **9 张**（`npm run verify` 口径，卡片 192px） | llm-prices **16 行**（行高 45px）、openrouter **15 行**（行高 47px） | 差距在**行高**，不在信息量 |
| 静态正文（不执行 JS） | **11459 字符**（水合前后一致） | toolify 22717、free-for-dev 209613、vercel 仅 878 | 我们已达标；vercel 这类标杆反而更差 |
| 外部域名 | **0** | openrouter 14、appsumo 20、superhuman 18 | 我们的红线带来的优势，保持 |
| 同源内链 | **1 条** | theresanaiforthat 3417、ai-bot.cn 636、toolify 393 | **最刺眼的差距**：我们没有站内可爬结构 |
| 独立条目 URL | **0 种** | futuretools `/tools/:slug ×40`、toolify `/tool/:slug ×27`、artificialanalysis `/models/:slug ×49` | 同上，是 SEO 长尾的根因 |
| 结构化数据 | **4 类**（Organization/BreadcrumbList/FAQPage/ItemList） | openrouter 5 类（多 CollectionPage）、vercel 3 类、多数垂直站 0–1 类 | **我们领先**，保持并给详情页补 BreadcrumbList |
| 暗色模式 | 无（`prefers-color-scheme` 规则 0 条、无 `color-scheme` meta） | vercel `meta color-scheme="dark light"`；notion 1 条规则；8 个标杆里 4 个默认暗色 | **缺失** |
| 对比度（近似，纯色背景） | 抽样 400：最低 **2.84**、中位 5.41、**低于要求 100 条（25%）** | openrouter 最低 5.59、llm-prices 5.13、superhuman 4.85、aitools.fyi 4.79 —— **全部 0 条低于要求** | **缺失**，且可修（见 §7） |

---

## 1. 色彩

### 我们现在的值（`index.html` `:root`）

```
--bg:#f6f7f9  --card:#fff  --ink:#0f172a  --ink2:#495066  --mut:#8c94a6
--line:#e6e9ef  --line2:#f0f2f6  --brand:#3b5bfd  --deal:#d92d4b  --dealsoft:#fff1f4
--cn:#0b7a63  --cnbg:#e8f7f2  --gl:#2348c4  --glbg:#eef3ff  --ok:#0b7a63  --warn:#c2410c
档位：t1 #0e9f6e · t2 #5b7cfa/#7c3aed · t3 #2563eb · t4 #e08a2e/#c2410c · t5 #94a3b8
```

### 标杆在用的做法（数字＝频次）

| 观察 | 证据 |
|---|---|
| **暗色分层靠「底 + 面 + 发丝环」三件套，不靠大投影** | linear：底 `rgb(8,9,10)`×6 → 面 `rgb(15,16,17)`×34 → 环 `rgba(255,255,255,0.08)`×36；raycast：底 `rgb(8,9,12)`×6、面 `rgba(255,255,255,0.05)`×21、边 `rgb(67,67,69)`×18 |
| 亮色站点普遍「白卡 + 中性灰底」，色相极少 | aitools.fyi 文字色只有 5 个取值（`rgb(14,19,52)`×300 主力 + 品牌紫 ×135）；vercel 文字色 `rgb(23,23,23)`×289 / `rgb(77,77,77)`×189 / `rgb(143,143,143)`×30 —— 三档灰走天下 |
| 品牌色只出现在少数元素上 | stripe 文字色 `rgb(83,58,253)`×470 但背景色仅 9 次；openrouter 主色是 `rgb(0,117,68)`/`rgb(0,136,254)` 各 30 余次 |
| 半透明文字色很常见（`rgba(0,0,0,.69)` 等） | openrouter `rgba(3,8,10,0.69)`×758、notion `rgba(0,0,0,0.898)`×194 —— 但它们都建立在**大字号**上（16px 基准） |

### 建议（可直接落进 `:root`）

```css
/* 亮色：只改一个值就能把 25% 的对比度不达标砍掉（推导见 §7） */
--mut: #6b7280;              /* 原 #8c94a6：在 --bg 上仅 2.84:1；#6b7280 = 4.50:1 */
--mut-deco: #8c94a6;         /* 原值降级为「纯装饰」专用（分隔线图标等），不承载文字 */

/* 暗色：照抄标杆的三件套结构，色相不动、语义档位不变 */
--bg:#0b0d10;  --card:#14171c;  --line:#242a33;  --line2:#1c2129;
--ink:#e8ecf2;  --ink2:#b6bec9;  --mut:#8d97a5;      /* 暗底上 ≥4.5:1 */
--ring: rgba(255,255,255,.07);                        /* 发丝环，替代投影 */
--brand:#7c93ff;  --deal:#ff6b81;  --dealsoft:#2a1418; --cn:#3ddc97;  --cnbg:#10231d;
--gl:#8fb0ff;  --glbg:#141c33;  --ok:#3ddc97;  --warn:#ffab6b;
```

**档位配色在暗色下的映射原则**：保持色相（绿/紫/蓝/橙），**降饱和、提亮度**，保证在 `--card` 上
文字与色条都 ≥3:1（色条属大色块，按 3:1 判）。不用同一组色值硬套两个主题——linear 与 raycast
都各自维护了一套暗色值，没有一份「自动反色」的糊弄做法。

---

## 2. 字体与排版阶梯

### 我们现在的值

基准 `13.5px/1.5`；实际用到的字号有 **9.5 / 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 14.5 / 15 / 19 / 29px**
（含 `.tiernum` 9px、`.lg.text` 9.5px、`.tg` 10px、`.dz .lab` 10.5px、`.meta` 11px…）。
字重用了 **550 / 650 / 680 / 750 / 780** 这些值。

### 标杆的做法

| 观察 | 证据 |
|---|---|
| 基准字号：B2B/数据密集站 14px，营销站 16px | openrouter 14px×1369、artificialanalysis 14px×1428、llm-prices 14px×958；linear 16px×1877、stripe 16px×1791、raycast 16px×744 |
| 行高与基准成 1.4–1.55 | linear 16/24（1.5，占 81%）、ai-bot.cn 16/24、openrouter 14/22.75 |
| 阶梯**极短**：3–4 级 | linear 字阶仅 3 级（16 / 13–14 / 12）；vercel 14/16/12/24/11/56；notion 16/14/24/40 |
| 小字确实存在，但用在**非必要信息**上 | framer 12px×2315（占比最大，但它是编辑器 UI 场景）；ai-bot.cn 12px×334 只用于辅助 |
| 分数字重需要可变字体 | linear 510/590、superhuman 460/540、openrouter 450 —— 都是随 Web 字体一起下发的 |

### 建议

```css
/* 阶梯收到 6 级，正文抬到 14px（我们是数据密集站，对齐 openrouter/artificialanalysis 一档） */
--fs-xs: 11px;   /* 只给角标/档位号，不承载句子 */
--fs-sm: 12px;   /* 次要元信息 */
--fs-md: 13px;   /* 卡片元信息 */
--fs-base: 14px; /* 正文、优惠说明、弹层字段 */
--fs-lg: 16px;   /* 卡片标题 */
--fs-xl: 19px;   /* 弹层标题 */
--lh: 1.5;
```

**字重只用真实存在的 400 / 500 / 600 / 700**。原因不是审美，是**我们没有 Web 字体**：
系统字体（PingFang SC / Microsoft YaHei / Segoe UI）没有 550/680/750 这些实例，
浏览器会四舍五入到最近的一档 —— 现在写 `font-weight: 680` 的实际渲染结果就是 700，
`550` 就是 500。写假字重等于把「设计意图」和「实际渲染」拆成两份，还看不出差别。
（标杆能用分数字重，是因为 `linear.app` 页面里 Inter Variable 被声明了 2878 次 —— 那条路我们走不了。）

---

## 3. 圆角 / 描边 / 阴影

| 项 | 我们 | 标杆 | 建议 |
|---|---|---|---|
| 圆角 | `--r:10px`（卡片、弹层 14px） | 8px 是主流（aitools 79、artificialanalysis 193、futuretools 62、notion 52、framer 230）；12px 次之（toolify 152、superpedia 26） | 保留 `--r:10px`，弹层改 12px，**统一** chip/按钮 6px |
| 层级 | `1px solid var(--line)` + hover 大投影 `0 6px 18px -12px` | **发丝环**：linear `rgba(0,0,0,.2) 0 0 0 1px`、vercel `rgba(0,0,0,.08) 0 0 0 1px`、superhuman `… 0 0 0 1px`、notion 多层微投影（`0 0.175px 1.041px` 起） | 卡片常态：`1px solid var(--line)`；hover：**环 + 微投影**（`0 0 0 1px var(--ring), 0 2px 8px -4px rgba(15,23,42,.18)`），不再用 18px 扩散的大投影 |

理由：我们卡片是 192px 定高、12px 间距的高密度网格，大投影会在相邻卡片之间互相压暗，
而发丝环不产生这种干扰（4 个标杆都选了环，这是有共识的做法）。

---

## 4. 间距节奏

| | 我们 | 标杆 | 建议 |
|---|---|---|---|
| 栅格间距 | `gap:12px` | 4/8/12/16 簇：futuretools gap 12×29、8×24；linear 8×88、4×59、6×51（4·6·8 占 79%） | 保持 12px，内部改 4 的倍数 |
| 卡片内边距 | `13px 14px`（非 4 的倍数） | devtk `20px`×11 / `24px`×9；openrouter `12px`×18 / `16px`×15 | 改 `12px 14px` 或 `14px`，纳入 4 的倍数体系 |
| 卡片内小节间距 | 9px（`.of`/`.feats` 的 `margin-top:9px`） | 8px / 12px 为主流 | 改 8px |

---

## 5. 动效（本节是最可直接照抄的）

### 我们在用的（全部声明，共 3 处）

```css
.g      { transition: border-color .13s, box-shadow .13s; }
.logos .lg { transition: margin-left .18s cubic-bezier(.34, 1.4, .64, 1), width .18s; }
.f      { transition: border-color .13s, color .13s, background .13s; }
```
另外**没有** `@media (prefers-reduced-motion: reduce)`，也**没有** `:focus-visible` 之外的动效降级。

### 标杆的数值（时长 · 曲线 · 出现次数）

| 站点 | 主过渡 | 次数 | 语义 |
|---|---|---|---|
| linear | `color .1s cubic-bezier(.25,.46,.45,.94)` | 187 | 100ms 级反馈（最快的一档） |
| vercel | `color,background-color,…,fill,stroke .1s cubic-bezier(.4,0,.2,1)`；`opacity .3s` | 79 / 7 | 快反馈 + 慢淡入 |
| openrouter | `… .15s cubic-bezier(.4,0,.2,1)`；`opacity,translate,filter .25s cubic-bezier(.22,1,.36,1)` | 174 / 60 | Tailwind 默认 + expo-out 进场 |
| aitools.fyi / devtk / futuretools / appsumo / toolify | `… .15s cubic-bezier(.4,0,.2,1)` | 40 / 52 / 115 / 3 / 40 | Tailwind 默认（跨站出现最多的一条） |
| stripe | `color,fill,opacity,stroke .3s cubic-bezier(.25,1,.5,1)` | 139 | 300ms ease-out-quart（营销图元） |
| raycast | `opacity,box-shadow,transform,color,… .4s/.2s cubic-bezier(.23,1,.32,1)` | 159 | ease-out-quint（弹性手感） |
| notion | `background-color,color .2s cubic-bezier(.42,0,1,1)` | 27 | 200ms |

**反例（值得单独记一笔）**：ai-bot.cn 用 `all 0.3s ease`×373、free-for-dev 用 `all 0.3s ease`×59。
`all` 会把布局属性也纳入过渡，在长列表上是廉价的做法；标杆站没有一家用 `all` 做主过渡。

### 建议

```css
--t-fast: 100ms;   /* hover/按下反馈（linear 一档） */
--t-base: 150ms;   /* 默认（Tailwind 默认，跨站最多） */
--t-slow: 250ms;   /* 弹层/展开（openrouter expo-out 一档） */
--e-std: cubic-bezier(.4, 0, .2, 1);
--e-out: cubic-bezier(.22, 1, .36, 1);   /* expo-out，进场不肉 */

/* 只过渡真正会变的属性，不用 all */
.g, .f { transition: border-color var(--t-base) var(--e-std), background-color var(--t-base) var(--e-std),
                     box-shadow var(--t-base) var(--e-std), color var(--t-base) var(--e-std); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
```

---

## 6. 暗色模式策略

| 策略 | 谁在用 | 证据 |
|---|---|---|
| 默认暗色单主题（不跟随系统） | linear、framer、raycast、stripe | linear `theme-color=#08090A`、`prefers-color-scheme` 规则 0 条、body 背景偏暗 |
| 跟随系统 | notion | `prefers-color-scheme` 规则 1 条，body 亮色 |
| **显式声明双主题** | vercel | `<meta name="color-scheme" content="dark light">` —— 这是唯一给出「两套都支持」明确信号的站 |

**建议**：走 vercel 那条路，但多给一个手动三态（`auto / light / dark`，记 `localStorage`）：

```html
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
```
```css
:root[data-theme="dark"] { /* §1 的暗色值 */ }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* 同上 */ } }
```

**为什么不做「默认暗色」**：我们的主场景是「白天快速扫一眼有什么免费额度」，
而且现有 53 张卡的档位配色、厂商 logo（多为深色图形、白底承载）都是按亮色底调的；
默认暗色会让 30 余家厂商 logo 的可辨识度集体下降 —— 这是标杆站不需要承担的约束（它们极少放第三方 logo）。

---

## 7. 对比度红线（我们自己最该修的一处）

**实测**：我们抽样 400 个文本节点，**100 条低于 WCAG 要求**（正文 4.5:1 / 大字 3:1），最低 **2.84**。
标杆里最好的四家是 **0 条**：openrouter（最低 5.59）、llm-prices（5.13）、superhuman（4.85）、aitools.fyi（4.79）。

**根因（算出来的，不是猜的）**：`--mut:#8c94a6` 用在 `--bg:#f6f7f9` 上——
相对亮度 L(#8c94a6)=0.2946、L(#f6f7f9)=0.9288，对比度 =(0.9288+0.05)/(0.2946+0.05)= **2.84:1**，
与我们仪器量到的最低值**逐位吻合**。而 `--mut` 正是 `.meta`（11px）、`.vendor`（11px）、
`.topstat`（12.5px）这些**承载文字**的地方。

**修法（一处 token 改动）**：把 `--mut` 改为 `#6b7280` → L=0.1673 → 对比度 =(0.9788)/(0.2173)= **4.50:1** ✓
（同一个灰已经是 `.feats span` 的正文色，所以不会引入新的色相）。

**配套**：把「对比度断言」加进 `scripts/tools/verify-site.js`（现在只有 55 项，没有任何对比度检查），
让它在两种主题下都跑一遍 —— 否则下次改配色又会悄悄退回去。

---

## 8. 明确不学（每条都触红线或与场景冲突）

| 做法 | 谁在用 | 为什么不学 |
|---|---|---|
| Web 字体 / 可变字重 | linear（Inter Variable 2878 次声明）、framer、stripe | 触碰「不热链 CDN、零外部请求」红线；系统字体栈已覆盖中英文 |
| 图标字体 / CDN 图标库 | 多数站（`resourceTypes` 里 font 类请求） | 同上；我们现有 logo 是构建期生成本地文件，正确做法 |
| 大投影做层级 | notion（10 层微投影）、部分营销站 | 与 192px 定高高密度网格冲突（相邻卡片互相压暗） |
| `transition: all .3s ease` | ai-bot.cn 373 次、free-for-dev 59 次 | 把布局属性也纳入过渡，长列表上代价明显；标杆无一家采用 |
| 默认暗色单主题 | linear / framer / raycast / stripe | 与我们的第三方厂商 logo 承载方式冲突（见 §6） |
| 用「页面更长」换内容量 | openrouter 112.6 屏、free-for-dev 67.6 屏 | 我们的产品目标是「一屏看到多少条」，不是「收录多少条」 |
| 分数字重 450/510/590 | linear / superhuman / openrouter | 系统字体没有这些实例，写了也不生效（见 §2） |
