# T1 验收契约：首页「按需求找优惠」标签式入口 → Topic Entry Card

- 团队：`home-topic-entry-cards-v1`　任务：`t1`（kind = requirements，round 1）
- 本文件是 T2（实现）/ T3（验证）/ T4（复核）**唯一**的判定依据。凡本文件写明的，不必再回头猜 prompt 的意思。
- 写入范围：`research/_raw/home-topic-entry-cards-v1/`（本目录）。本文件不改任何源码 / 数据 / 基线。

---

## 0. 材料来源与一个必须先说清的事实

### 0.1 主 prompt 文件在磁盘上不存在（阻塞性事实，如实记录）

任务 objective 写的是「把 `D:\AI_DEALS_HOME_TOPIC_ENTRY_CARDS_PROMPT.md`（1415 行）抽成契约」。**该文件不存在**，实测：

```
PS> Test-Path "D:\AI_DEALS_HOME_TOPIC_ENTRY_CARDS_PROMPT.md"      → False
PS> Get-ChildItem D:\ -Filter "*AI_DEALS*" -File                   → 0 条
PS> Get-ChildItem D:\ -Recurse -Depth 4 -File -Filter "*PROMPT*.md" → 只有
      D:\secondary-page-layout-unification-prompt.md            (24513 B)
      D:\OneDrive\Desktop\移动\AI_Code_Doctor_Next_Phase_Prompt.md (15974 B)
PS> 全仓 grep "Topic Entry Card|topic-entry|专题导航卡"            → 0 命中
```

因此**没有第 3 个信息来源**可以核对 § 编号。本文件的 § 编号全部来自团队任务元数据
（`.agent-teams/home-topic-entry-cards-v1/team.json` 里 t1–t5 的 `coverageOf` / `acceptance` /
`objective` 字段，它们逐条引用了 prompt 的 §n）。这是**二次来源**，可信度分两档，正文逐条标注：

| 标注 | 含义 |
|---|---|
| **[§已载]** | 该 §n 在 team.json 的 `coverageOf` 里被**点名并给了主题**（例：`prompt §26 short 字段`） |
| **[§未载]** | 该条目对应的 § 不在 team.json 的任何 `coverageOf` 里（本文件按主题就近归入，标注出来供 captain 复核） |

**未标定的 §**：team.json 覆盖了 §2–§14、§16–§22、§24–§41，缺 **§1 / §15 / §23**。
其中 t3/t2 反复提到的 `verify-site.js §15b2` 是**脚本自己的小节号**（实测 `scripts/tools/verify-site.js:2248`
写着 `=== 15b2) 按需求找优惠：入口行与十条静态落地页 ===`），**不是** prompt 的 §15。

> **给 captain 的请求**：若 prompt 原件可提供，§ 编号应在 T2 开工前校正一次。除此之外，
> 本文件的**判据本身不依赖 § 编号**——每条判据都有独立于 prompt 的客观判据（断言名 / 命令 / 实测读数），
> 编号只用于回溯出处。

### 0.2 数字来源的标注约定（强制）

本文件**每一个**高度 / 张数 / px 都带下列标签之一；没有标签的数字一律视为缺陷，T4 应判失败：

| 标签 | 取得方式 |
|---|---|
| **【实测】** | 本目录 `t1-baseline-measure.js` / `t1-growth-sim.js` 的输出（Edge 149 + `node_modules/playwright-core`，headless，viewport 1440×900，`page.goto(base,{waitUntil:'load'})` 后等 `waitForApp()`：`#lastUpdated` 由 `--` 变为真实时间戳，即应用已接管）。原始读数落盘 `t1-baseline-measure.json` / `t1-growth-sim.json` |
| **【源码】** | 读仓库源码得到，附 `文件:行号` |
| **【推导】** | 由【实测】或【源码】数字算术得到，附算式 |
| **【契约】** | 由 team.json 的 t1–t5 契约给定，**T1 未在本地复现**（如目标高度区间），T3 必须实测确认 |

---

## 1. 验收契约（AC-01 … AC-31）

每条格式：**判据 → 怎么判**。全部为「可通过/不通过」的客观判定，不含「做得好不好」。

### A 组：结构与语义（这是本轮的第 1 目的）

**AC-01　整卡是 `<a>` 导航卡，不是 chip。** **[§已载 §5]**
- 判据：`nav.needs` 下每张卡的 `tagName === 'A'`，`classList.contains('need-card')`，且有非空 `href`。
- 怎么判：真浏览器 `page.$$eval('nav.needs a.need-card', els => els.map(e => [e.tagName, e.getAttribute('href')]))`，
  要求 `10/10` 条 `tagName === 'A'` 且 `href` 全部形如 `need/<slug>/`。
- 反例（必须判红）：`<div class="need-card"><a>文字</a></div>` 这种「卡是容器、只有文字是链接」的形状。

**AC-02　每张卡内部四件套齐全。** **[§已载 §5 / §8]**
- 判据：每张卡同时含 `.need-icon`（`aria-hidden="true"`）、`.need-copy > strong`（非空）、
  `.need-copy > small`（非空）、`.need-arrow`（`aria-hidden="true"`）。
- 怎么判：`page.$$eval('nav.needs a.need-card', ...)` 逐张检查四个选择器各命中 1 个且文本非空，
  要求 `10/10` 张齐全。变异 M2（删 `small`）/ M3（删 `arrow`）必须让本条变红。

**AC-03　与筛选器的语义隔离：`nav.needs` 里零 facet 控件。** **[§已载 §3 / §13 / §29]**
- 判据：`nav.needs` 内 `[data-facet]`、`[aria-pressed]`、`[role="button"]`、`button`、`input`、`select`
  的**计数全部为 0**。
- 怎么判：真浏览器
  `document.querySelector('nav.needs').querySelectorAll('[data-facet],[aria-pressed],[role="button"],button,input,select').length === 0`。
- 现状对照【实测】：`nav.needs` 内 `[data-facet]`/`[aria-pressed]`/`[role=button]` 已是 **0**，
  但**类名是 chip 的**（见 AC-20）。变异 M1（`.need-card` 改回 facet 类）/ M5（加 `aria-pressed`）必须让本条变红。

**AC-04　没有选中态。** **[§已载 §13]**
- 判据：产物里 `nav.needs` 作用域内不存在 `.on` / `.active` / `.selected` / `[aria-pressed]` /
  `[aria-current]` 选择器的**消费者**（CSS 规则），也不存在生成这些类的分支。
- 怎么判：`node -e` 读 `dist/index.html`，正则 `/nav\.needs[^{]*\.(on|active|selected)\b/` 与
  `/[^{]*\.needs[^{]*(aria-pressed|aria-current)/` 均 0 命中；再在真浏览器断 `nav.needs [aria-pressed]` 计数 0。

**AC-05　无 JS 完整可用。** **[§已载 §16]**
- 判据：`javaScriptEnabled: false` 打开首页，`nav.needs` 的卡数、标题、说明、`href` 与有 JS 时**逐条相等**。
- 怎么判：`browser.newContext({ javaScriptEnabled: false })`，断 `nav.needs a.need-card` 数 === 10，
  每张 `strong`/`small` 非空，`href` 与有 JS 时同序同值（逐条 `JSON.stringify` 比对）。
- 现状对照【实测】`t1-baseline-measure.json` → `probes["1440x900-nojs"]`：`navExists=true, links=10, allA=true, navH=31, gridTop=227, cards=50, pageH=4665, overflowX=0`。
  **这是「构建期预渲染」已经成立的证据**，本轮必须保持。

**AC-29　构建期预渲染链路不变。** **[§已载 §2 / §16]**
- 判据：`index.html` 源码仍有 `<!--PRERENDER:needs-->` 标记，且 `build-local.js` 仍用 `replaceMarker` 注入同一处。
- 怎么判（【源码】）：`index.html:1137` 有 `<!--PRERENDER:needs-->`；
  `scripts/tools/build-local.js:440` 的标记白名单含 `PRERENDER:needs`；`:3295` 调用
  `replaceMarker(html, '<!--PRERENDER:needs-->', renderNeedRow(payload.deals))`；
  `scripts/validate.js:1035` 的必需标记清单也含它。三处**任一被改即判红**（T2 不得改这三行）。

### B 组：单一来源对账（这是本轮的第 2 目的）

**AC-06　卡数 === NEED_PAGES.length（从注册表取，不写死 10）。** **[§已载 §2 / §6]**
- 判据：`dist/index.html` 里 `class="need-card"` 的出现次数 === `require('./scripts/lib/audience.js').NEED_PAGES.length`。
- 怎么判：`node -e` 双向比对，断言里**不得出现字面量 `10`**。
- 现状【源码】：`NEED_PAGES.length === 10`（10 条 slug：`student-only, edu-identity, no-card, china-usable, free-tier, free-api, free-tokens, ai-coding, free-model, dev-credits`）。

**AC-07　逐条 label / href 与 NEED_PAGES 对账不错位。** **[§已载 §6]**
- 判据：第 i 张卡的可见标题 === `NEED_PAGES[i].label`，`href` === `need/${NEED_PAGES[i].slug}/`，顺序一致。
- 怎么判：真浏览器读出卡片数组，`node` 侧读注册表，逐条 `===`；错位 1 条即红。

**AC-08　卡上的数字 === 数据层里该 slug 的条数。** **[§已载 §7]**
- 判据（**口径写死，避免踩坑**）：`deals.json.deals.filter(d => d.type === 'deal' && d.needs.includes(slug)).length`。
  ⚠️ 必须带 `type === 'deal'`：`dist/deals.json` 里还有 `type: 'tool'` 的条目【实测：全部 135 条 = deal 80 + tool 55】，
  不滤会把徽标算成 15/73/8/70 而不是 12/60/4/67（T1 实测踩到过）。
- 怎么判：`verify-site.js` 现有的 `needTruth`（`scripts/tools/verify-site.js:2265-2271`）已经是这个口径，直接复用。
- 现状【实测】10 条徽标与 `dist/deals.json` 逐条相等：`12/7/1/30/60/45/44/4/12/67`。
  变异 M7（一个 `href` 指向错 slug）必须让本条变红。

**AC-09　文案来源仍是 NEED_PAGES 单一注册表，全仓没有第二份手写清单。** **[§已载 §6 / §17 / §18]**
- 判据：把 10 条 `label` 作为字符串在全仓（排除 `node_modules` / `.git` / `dist` / `research`）里搜索，
  命中处**只能**是 `scripts/lib/audience.js` 的注册表本身，不得出现于 `index.html`、任何 `scripts/**` 的第二处，
  也不得出现于任何数据 JSON 的手写副本。
- 怎么判：`node -e` 遍历 10 个 label，对每个 label 收集命中文件集合，要求 `⊆ {scripts/lib/audience.js}`。

**AC-10　新增的展示文案字段（`homeDescription`）形状受约束。** **[§已载 §7]**
- 判据：每条 12–24 个**非空格字符**；不含内部判据措辞（`benefitType` / `audience` / `contains` / `pricingModel` /
  「字段」/「判据」）；不含数字与版本号（`/\d/` 与 `/v\d/`）；非空。
- 怎么判：`audience-selftest.js` §9 新增断言（见 AC-30），逐条 `check`。

**AC-11　图标是单个 emoji，且十张两两不同。** **[§已载 §8]**
- 判据：`new Set(NEED_PAGES.map(p => p.icon)).size === 10`；每个 `icon` 单字符（`[...icon].length === 1`）；
  DOM 上 `.need-icon` 有 `aria-hidden="true"`（装饰性，不进无障碍树）。
- 怎么判：`audience-selftest.js` 断言 + 真浏览器断 `aria-hidden`。

**AC-12　NEED_PREDICATES 逐字未变。** **[§已载 §2 / §18 / §35]**
- 判据：`NEED_PREDICATES` 的 **键集**、**每个函数体源码**、`NEED_GROUPS`、`NEED_PAGES` 的 `slug|predicate|label` 三元组
  全部逐字未变。
- 怎么判（T1 已冻结指纹，`node -e` 重算比对即可）：

  | 对象 | 指纹（sha256 前 16 位） |
  |---|---|
  | `NEED_PREDICATES` 键集 | `4c8125ab1c0828af` |
  | `studentOnly` 函数源码 | `e3fb583985d08c85` |
  | `eduIdentity` | `67645e78cca2c8a3` |
  | `noCard` | `7660a555ac2cc196` |
  | `chinaUsable` | `72ca39c0f45e15f4` |
  | `freeTier` | `b4ffdd32578372f5` |
  | `freeApi` | `ed9aeee00a0b3c28` |
  | `freeTokens` | `77fdbad4c51f0535` |
  | `aiCoding` | `0ee61a6c24c4ee5b` |
  | `freeModel` | `5275e61463974a3d` |
  | `devCredits` | `a49e24882d538a87` |
  | `NEED_GROUPS` | `794d0e084c09e2bd` |
  | `NEED_PAGES` 的 `slug\|predicate\|label` | `9307d2faa110243b` |
  | `NEED_PAGES` 的 `short` 序列 | `8e25f9a6c9041660` |

  复现：`node -e "const c=require('crypto'),au=require('./scripts/lib/audience.js'),h=s=>c.createHash('sha256').update(s).digest('hex').slice(0,16);console.log(h(Object.keys(au.NEED_PREDICATES).join(',')),h(au.NEED_PREDICATES.studentOnly.toString()),h(JSON.stringify(au.NEED_GROUPS)),h(au.NEED_PAGES.map(p=>p.slug+'|'+p.predicate+'|'+p.label).join(',')),h(au.NEED_PAGES.map(p=>p.short).join(',')))"`
- 注意：**新增字段（`homeDescription` / `icon`）允许**，那不改上述任何指纹。

**AC-13　不改 `/need/**` 页面。** **[§已载 §17]**
- 判据：`dist/need/` 下 10 个页面的**逐文件字节**未变。
- 怎么判：T3/T4 在改动前跑
  `node -e "const f=require('fs'),p=require('path'),c=require('crypto');const w=d=>f.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?w(p.join(d,e.name)):[p.join(d,e.name)]);console.log(w('dist/need').sort().map(x=>x+' '+c.createHash('sha256').update(f.readFileSync(x)).digest('hex')).join('\n'))"`
  存成本目录 `need-pages.before.sha256`，改动后重跑要求 `diff` 为空。
- 现状【实测】：`dist/need/` 共 **10** 个文件，聚合 sha256 = `351B0A330510DF8A52EF729CA876BBDC`（算法见上）。

### C 组：布局 / 响应式 / 首屏（本轮的主要代价面）

**AC-14　桌面多列，10 张**不得**挤成一行。** **[§已载 §10 / §11]**
- 判据：viewport 宽度 ≥ 1440 时，`nav.needs`（新 `.need-grid`）每行的卡数 ≤ 6，且**行数 === 2**（10 张 5×2）。
- 怎么判：真浏览器按 `getBoundingClientRect().top` 分组，断 `rows.length === 2 && rows.map(r => r.n).every(n => n === 5)`。
- 现状对照【实测】：**Before 是反例** —— 1440×900 下 10 条入口 `rowTops=[107]`、`perRow=[10]`，
  即 **10 张全部挤在 1 行**、单个 26px 高、宽 86.53–117.44px。这正是本轮要修掉的形状。
  1600 / 1280 实测同样是 `perRow=[10]`。

**AC-15　禁止用横向滚动隐藏入口。** **[§已载 §20]**
- 判据：`nav.needs` 自身的 `overflow-x` **不是** `auto` / `scroll`；且 10 张卡在视口内
  （`left >= 0 && right <= innerWidth + 1 && width > 0`），`clipped`（`scrollWidth > clientWidth + 1`）为 0。
- 怎么判：真浏览器断 `getComputedStyle(nav).overflowX ∉ {'auto','scroll'}` 且 `clipped === 0` 且 `visible === total`。
- 现状【实测】：`nav.needs` `overflow-x: visible`；1600/1440/1280/768/430/390/360 全部 `clipped=0`、`allInViewport=true`。
  变异 M6（给 `.need-grid` 加 `nowrap` / 横滑）必须让本条变红。

**AC-16　手机端无横向滚动。** **[§已载 §19 / §32]**
- 判据：390 / 360 / 430px 三档 `document.documentElement.scrollWidth - clientWidth === 0`，且 `nav.needs` 里无卡越出视口。
- 怎么判：真浏览器逐档 `setViewportSize` 后测量。
- 现状【实测】`overflowX = 0` @ 1600/1440/1280/768/430/390/360，全部 0px。

**AC-17　卡片高度落在 64–80px，且同一视口内一致。** **[§已载 §11 / §12]**
- 判据：桌面（≥1440）每张 `a.need-card` 的 `getBoundingClientRect().height ∈ [64, 80]`；
  同一视口内所有卡高度**取值集合大小 === 1**（沿用 `verify-site.js:262`「卡片高度统一」的写法）。
- 现状对照【实测】：入口行单条高度 **26px**（`navLinks.heights=[26]`）；
  作为对照，13 个筛选器 chip（`[data-facet]`，全部是 `BUTTON`）实测也是 **26px**、容器 43px。
  也就是说「Filter Chip 26px」与「Topic Card 64–80px」在视觉上必须能一眼分开。
- 「区块目标高度 145–175px」是 **【契约】**（t1 契约原文），T3 必须实测：
  **【推导】** 若 2 行 × 单卡 h、行距 12px（现网格 gap 实测 12px），则整块 = 2h + 12 ∈ [140, 172]，
  与 145–175 相差 3–5px（可能含内边距/组标签，T3 以实测为准，若超出 145–175 应报 P1）。

**AC-18　hover 只做低成本变化。** **[§已载 §12 / §24]**
- 判据：`:hover` 规则只允许 ① 边框变色 ② 背景微变 ③ 箭头右移 2px。
  产物里不得出现 `scale(`、`box-shadow` 强阴影、`animation` / `bounce` 之类的 hover 效果。
- 怎么判：`node -e` 从 `dist/index.html` 抽出 `nav.needs` 相关 `:hover` 规则体，正则断言不含 `scale(`、`animation`；
  真浏览器 `page.hover` 后比对 `transform`（只允许箭头元素变化）与卡自身 `transform === 'none'`。

**AC-19　复用既有 design tokens，不引入第二套。** **[§已载 §24]**
- 判据：新增 CSS 只用既有 token：`--card` `--line` `--ink` `--mut` `--brand` `--r` `--fs-xs` `--fs-sm`
  `--s1` `--s2` `--s3` `--t-fast` `--e-std`；不得出现新的十六进制色值 / 新的圆角 / 新的字体 / 新的 transition 时长。
- 怎么判：`node -e` 抽新增 CSS 块，扫 `#[0-9a-fA-F]{3,8}\b` 与 `border-radius:\s*\d` 与 `transition:` 的裸毫秒值，命中即红。

**AC-20　无僵尸 CSS / 僵尸类。** **[§已载 §25]**
- 判据：`nl` / `nl-full` / `nl-short` / `nlb` / `nsep` / `ngroup` / `nlinks` 这 7 个类，
  在 `dist/index.html` 里**既无生成者也无消费者**（DOM 不出现、CSS 规则不出现），
  `index.html` 源码里对应的 CSS 规则已被删除（不许留「死角规则」）。
- 怎么判：`node -e` 读 `dist/index.html`，断这些字符串 0 命中；再读 `index.html` 源码同判。
- 现状对照【实测】：**Before 全部存在** ——
  DOM：`<span class="ngroup"><span class="nlb">学生</span><span class="nlinks">…</span></span><span class="nsep">…</span>`
  （`dist/index.html:1144`）；CSS（全部在 `dist/index.html`）：`.needs .nl-short`（`:403`）、
  `.needs .ngroup, .needs .nlinks`（`:407`）、`.needs .nsep`（`:408`）、`.needs .nl-full`（`:1065`）、
  `.needs .nl-short`（`:1066`）、`.needs .nlinks`（`:1083`）、`.needs .nsep`（`:1085`）、
  `.needs .ngroup`（`:1086`）、`.needs .ngroup a`（`:1087`）。
  `navLinks.zombieClasses` 实测返回全部 7 个。

**AC-30　`audience-selftest.js` 既有断言不动 + 新增字段断言。** **[§已载 §26 / §18]**
- 判据：既有 §9 断言（含 `每条都有窄屏短标签，且短于全称`、10 条 `短标签不含数字或版本号（<slug>「<short>」）`）
  **逐条保留**；只**新增** `homeDescription` / `icon` 的断言。
- 怎么判：`node scripts/tools/audience-selftest.js` 退出码 0，且输出里既有断言名仍全部出现。

### D 组：不得触碰的面

**AC-21　数据层零变化。** **[§已载 §35]**
- 判据：`deals.json` / `plans.json` / `api-plans.json` / `models.json` 及产物 `dist/deals.json`、
  以及 `coverage` / `history` / `source-health` 类产物，逐字节未变。
- 怎么判：`git diff -- deals.json plans.json api-plans.json models.json` 输出为空；
  产物侧用 T1 冻结的 sha256 前 16 位比对：

  | 文件 | 字节数 | sha256(前16) |
  |---|---|---|
  | `deals.json` | 242373 | `1CF4733901206580` |
  | `plans.json` | 91744 | `1668D19CADBCE7E2` |
  | `api-plans.json` | 106148 | `ACEBDE3A35BEBBC6` |
  | `models.json` | 48014 | `CE69F006F0FA481A` |
  | `dist/deals.json` | 293515 | `4BAA1F758FD88566` |
  | `dist/index.html`（Before） | 400355 | `0C90EC488F8C534D` |
  | `index.html`（Before 源码） | 290339 | `2670AF67C4C05AC1` |

  `dist/index.html` **必然变化**（那是产物），只作为 Before 快照留档，不作为「不变」判据。

**AC-22　Analytics 零改动。** **[§已载 §36]**
- 判据：`scripts/lib/analytics.js` 未出现在 `git diff --name-only` 里；本地运行时
  `analyticsRequests === 0`；无任何新增 `click` 事件 / 自定义上报 / Cloudflare API 调用。
- 怎么判：`git diff --name-only | Select-String analytics` 为空；`verify-site.js` 已有
  `analyticsRequests` 账本（`scripts/tools/verify-site.js:163` 注释处的两条账本），本地必须 0。

**AC-23　不改其它首页组件。** **[§已载 §37]**
- 判据：Header / 搜索 / 筛选器（`[data-facet]`）/ 排序 / Deal Card（`article.g`）/ 变更雷达 /
  收藏 / 对比 / 页脚的行为与断言全部不变；`article.g` 数仍为 50、列数仍为 3、卡高仍为 192px。
- 怎么判：`verify-site.js` 既有断言全绿 + 【实测】Before 对照：
  `cards=50`、`cols=3`、`cardHeight=192`、`gridTop=227`、`overflowX=0`。

**AC-31　首屏阈值与基线同步（本轮**唯一**授权的契约变更）。** **[§已载 §21 / §40]**
- 判据：`scripts/tools/verify-site.js:263` 的 `首屏完整可见卡片 ≥ 9` 阈值、
  以及 `research/_raw/ours-baseline/verify.json` **且** `verify-pre-fold.json` 的 `firstScreenFull`，
  三者**同步改成 After 的实测值**；除 `firstScreenFull` 外，基线里其余字段（`generatedAt` / `target` /
  `cards` / `coveredDeals` / …）**逐字未变**；`verify-site.js:6254` 的
  `回归：首屏完整可见不减少` 保持原判据（`>= num(ref.firstScreenFull)`）不动。
- 怎么判：`git diff research/_raw/ours-baseline/verify.json` 只出现 `firstScreenFull` 一行；
  `node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json` 退出码 0。
- 现状【源码+实测】：`verify.json`（生成于 `2026-09-29T12:05:42.914Z`，181 项 / 失败 0）
  `firstScreenFull=9, firstScreenPart=12, gridTop=196, pageHeight=4589, cards=50, cardHeight=192`；
  `verify-pre-fold.json`（`generatedAt 2026-09-27T15:34:57.819Z`）
  `firstScreenFull=9, firstScreenPart=12, gridTop=160, pageHeight=5334, cards=62`。

### E 组：变异牙 / 门禁 / 交付

**AC-24　Mutation M1–M7 每条真红，且红的是**指定的**那条断言。** **[§已载 §34]**
- M1：`.need-card` 改回 facet 类 → 红在 **AC-03**（`nav.needs` 内 `[data-facet]` 计数 > 0）
- M2：删掉卡上的说明 `small` → 红在 **AC-02**（四件套不齐）
- M3：删掉箭头 `.need-arrow` → 红在 **AC-02 / AC-18**（导航暗示消失）
- M4：`<a>` 改成 `<button>` → 红在 **AC-01 / AC-05**（`href` 消失、无 JS 不可导航）
- M5：加 `aria-pressed` → 红在 **AC-03 / AC-04**（语义隔离）
- M6：`.need-grid` 加 `nowrap` / 横滑 → 红在 **AC-15 / AC-16**（视口完整性 / 横向溢出）
- M7：一个 `href` 指向错 slug → 红在 **AC-07 / AC-08**（注册表对账）
- 怎么判：每条**只改一处**，记录变红的那条断言名 + 原始输出；T4 至少抽查 3 条并**自己重跑**。

**AC-25　变异还原必须 byte-exact，且还原后回绿。** **[§已载 §34]**
- 判据：变异前保存原始字节（`Get-FileHash` / `git stash` 等价物）→ 还原 → `git diff` 为空
  （**`git status --short` 里不残留被变异文件**）→ 重跑同一断言回绿。
- 怎么判：证据文件里给出还原后的 `git status --short` 与 `git diff` 原始输出（**空输出本身也是证据，必须贴**）。
- 「byte-exact」的判据就是文件 sha256 与变异前**逐位相等**，不接受「看起来一样」。

**AC-26　Full Gate 在当前 HEAD 全绿，且**动态**读门禁清单。** **[§已载 §38 / §39]**
- 判据：从 `package.json` 的 `scripts`、`.github/actions/gate/action.yml`、`.github/workflows/` **现读**
  当前门禁清单再执行，退出码 0；不得把历史项数写死进报告。
- 怎么判：T4 的 verify 命令
  `node scripts/tools/check-ci-consistency.js`、`node scripts/tools/build-local.js`、
  `node scripts/tools/verify-site.js`、`node scripts/tools/verify-site.js --compare=…`、`git diff --stat`。
- 现状【实测】：`node scripts/tools/check-ci-consistency.js` 裸跑 →
  `✅ CI 口径检查 38 项，失败 0 项`，`(W)` 报 `实跑 37 条 = 冻结清单 37 条 + 本看门狗`，
  `(E)` 报 `实跑项数 == --expect-checks=38`。机器名【源码】：`--expect-checks=38` 出现在
  `.github/workflows/verify.yml:125`（`run: node scripts/tools/check-ci-consistency.js --expect-checks=38`）。

**AC-27　本轮不新增 selftest 脚本、不新增门禁步骤 ⇒ `--expect-checks=38` 与 `FROZEN_ASSERTION_NAMES` 均不变。** **[§已载 §38]**
- 判据：`check-ci-consistency.js` 里的 `--expect-checks=38`（**唯一出处** `verify.yml:125`）与
  `FROZEN_ASSERTION_NAMES`（源码 `scripts/tools/check-ci-consistency.js:547` 起）**都不改**；
  `package.json` 不新增 `selftest:*`；`.github/actions/gate/action.yml` 不新增步骤。
- **为什么删 `verify-site.js` 的断言不影响这两个值（这是本轮最容易搞错的一点，写清楚）：**
  `--expect-checks=38` 与 `FROZEN_ASSERTION_NAMES` 冻结的是 **`check-ci-consistency.js` 自己的 37 条断言 + 1 条看门狗 (W) = 38**，
  它管的是「workflow / 复合 action / package.json / selftest 登记」这一类**仓库口径**，
  **完全不数 `verify-site.js` 的断言**（T1 实测：裸跑输出里 19 条断言的 detail 全部只提 workflow、action.yml、
  package.json、`*selftest*.js`，没有一条提 `verify-site.js` 的项数）。
  所以 T3 增删 `verify-site.js` 的断言时，**不需要**、也**不允许**去动 `38` 或那张冻结清单。
- 怎么判：`git diff .github/workflows/verify.yml .github/actions/gate/action.yml package.json` 为空；
  `node scripts/tools/check-ci-consistency.js` 仍报 `38 项，失败 0 项`。

**AC-28　首屏密度 Before / After 实测报告。** **[§已载 §21 / §40]**
- 判据：报告里给出 1440×900 下 **6 个数字**的 Before / After / Delta：
  ① `nav.needs`（新 `.need-grid` 所在块）高度　② `.grid` 网格起点　③ 首屏**完整**可见 Deal Card 数
  ④ 首屏**含截断**可见 Deal Card 数　⑤ slack　⑥ 页高。
- 怎么判：After 数字必须来自 T3 自己跑的浏览器实测（同一脚本、同一视口、同一 `waitForApp` 口径），
  与 Before **逐项对齐**并给出 Delta；Before 数字应等于本文件 §2 的冻结值，不等则必须解释。
- 「slack」的**唯一定义**（本文件定义，其它地方引用它）：
  `slackFull = viewportH − (首屏最后一张「完整可见」卡的 bottom)`；
  「完整可见」与 `verify-site.js:255` 逐字同口径：`bottom <= window.innerHeight`。

### F 组：交付（T5 范围，列在此处只为契约完整）

**AC-32　独立分支 → PR → 必需 CI；不 merge、不 deploy。** **[§已载 §40 / §41]**
- 判据：在最新 `origin/master` 上建独立分支；只提交本轮授权范围内的改动；PR 上的必需检查真实跑到结论；
  报告必须写明 1440×900 的 Topic/Need 区高度 Before/After/Delta 与首屏完整 Deal Card Before/After/Delta；
  明确标注 merge / Deploy / 线上 smoke **未执行**。
- 现状【实测】：当前 `HEAD = master @ 4927fe3`；`git status --short` 已有 6 条未跟踪项
  （`AI_DEALS_AGGREGATOR_ROADMAP_AND_PROMPTS.md`、`AI_DEALS_CODING_PLAN_PHASES_PROMPTS.md`、
  `final-dist-A.sha256`、`final-dist-B.sha256`、`research/_raw/home-topic-entry-cards-v1/`、`research/audit/`）
  —— 这些**不是**本轮改动，不许混进本轮的提交。

---

## 2. 基线读数（Before，1440×900 冻结）

**取得方式（逐字复现）**

```
node research/_raw/home-topic-entry-cards-v1/t1-baseline-measure.js > research/_raw/home-topic-entry-cards-v1/t1-baseline-measure.json
node research/_raw/home-topic-entry-cards-v1/t1-growth-sim.js        > research/_raw/home-topic-entry-cards-v1/t1-growth-sim.json
```

- 被测对象：`dist/`（**只读**，未构建、未改动）。`dist/index.html` mtime = `2026-10-05T13:46:35.183Z`（UTC）＝ 本机 `2026/10/5 21:46:35`。
- 浏览器：`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`，headless，由 `node_modules/playwright-core`（^1.63.0）启动
  —— 与 `scripts/tools/verify-site.js:48/139` 同一套路径与启动方式。
- 视口：`{ width: 1440, height: 900 }`。
- 加载口径：`page.goto(base, { waitUntil: 'load' })` 后 `waitForApp()`：
  等 `#lastUpdated` 的文本由 `--` 变成真实时间戳（`verify-site.js:98-104` 的同一判据），再 `waitForTimeout(120)`。
  那一刻 `bindEvents()` / `render()` 已在同一个 `.then` 里跑完 == **应用已接管**。
- 测量口径：`getBoundingClientRect()` / `getComputedStyle()`，页面内取浮点、round 后落盘。

| # | 指标 | 实测值 | 备注（都能在 `t1-baseline-measure.json` 里逐字找到） |
|---|---|---|---|
| 1 | `nav.needs` 存在 | `true` | top=102、bottom=133、left/right 未越界 |
| 2 | **`nav.needs` 高度** | **31px** | `navStyle.display=flex`、`overflow-x=visible`、`gap=6px 8px`、`margin-bottom=0px` |
| 3 | `nav.needs` 内链接 | **10 条，全部 `<a>`** | `rowTops=[107]`、`perRow=[10]`、`heights=[26]`、`widths=86.53–117.44` |
| 4 | 分组容器 | **2 个 `.nlinks`，各 5 条** | 每个 `height=26`、`top=107`、`bottom=133` |
| 5 | `.grid` 网格起点 | **top = 227px** | `cols=3`、`rowGap=12px`、`colGap=12px`、宽 1380px |
| 6 | Deal Card 高 | **192px（唯一值）** | `article.g` 共 **50** 张 |
| 7 | **首屏完整可见 Deal Card** | **9 张** | `bottom <= 900` 口径（`verify-site.js:255` 逐字同口径） |
| 8 | **首屏含截断** | **9 张** | `top < 900` 口径（`verify-site.js:256`）；第 4 行首卡 top=911 > 900 |
| 9 | 最后一张完整可见卡的 bottom | **899.00px** | 第 3 行 `top=707`、`+192 = 899` |
| 10 | **slack** | **1.00px** | `900 − 899`（=`t1-growth-sim.json` 的 `slack`） |
| 11 | **页高** | **4665px** | `document.documentElement.scrollHeight` |
| 12 | 横向溢出 | **0px** | `scrollWidth 1440 − clientWidth 1440` |
| 13 | 网格行分布 | 18 行，多为 3 张/行 | `263/467/707/911/1115/…`（`tierhead` 会插入额外间距） |
| 14 | 筛选器（Filter Chip） | 13 个 `[data-facet]`，全是 `BUTTON` | 每个高 **26px**；容器 top=59 / bottom=102 / 高 **43px** |
| 15 | 无 JS 打开首页 | 入口行仍在 | `links=10, allA=true, navH=31, gridTop=227, cards=50, pageH=4665, overflowX=0` |

**窄屏几何（Before，同一脚本同一口径）**

| 视口 | `nav.needs` 高 | 行数 / 每行 | 单条高 | `.grid` 起点 | 列数 | 完整可见卡 | slack | 页高 | 横向溢出 |
|---|---|---|---|---|---|---|---|---|---|
| 1600×900 | 31px | 1 行 · 10/10 | 26px | 227px | 3 | 9 | 1.00px | 4665px | 0 |
| 1440×900 | 31px | 1 行 · 10/10 | 26px | 227px | 3 | 9 | 1.00px | 4665px | 0 |
| 1280×900 | 31px | 1 行 · 10/10 | 26px | 227px | 3 | 9 | 1.00px | 4665px | 0 |
| 768×900 | 63px | 2 行 · 5/5 | 26px | 336.75px | 2 | 4 | 131.25px | 6430px | 0 |
| 430×900 | 240px | 6 行 · 2/2/1/2/2/1 | 28px | 617.75px | 1 | 1 | 56.56px | 11168px | 0 |
| 390×900 | 240px | 6 行 · 2/2/1/2/2/1 | 28px | 617.75px | 1 | **1** | 56.56px | 11312px | 0 |
| 360×900 | 240px | 6 行 · 2/2/1/2/2/1 | 28px | 617.75px | 1 | 1 | 56.56px | 11350px | 0 |

> 这张表是**手机端的真实动机**：390px 下入口块吃掉 240px，首屏只剩 **1 张**完整卡。
> Before 的 10 条入口在 1600/1440/1280 是**一行平铺**（`perRow=[10]`），
> 在 430/390/360 是**两列 2/2/1 的 chip 网格**（`.nlinks` 的 `grid-template-columns: repeat(2, minmax(0,1fr))`，`dist/index.html:1083`）。

### 2.1 仓库里已有一份**独立**的同款读数（交叉验证，非 T1 自证）

`index.html:1162-1168` 的注释（v1.5 变化雷达那一行，**本轮之前就写在仓库里**）逐字写着：

> 变化雷达（v1.5）与「跳到档位」**共用一行**（`.hubline`）。
> 为什么不是自己占一行：1440×900 实测网格起点 227px、卡片 192px、行距 12px、
> 每档之间的分带标题 26px —— 第三行（档 2 的第一行）底边落在 899px，距视口底边
> 只剩 **1px**。任何独立成行的条带（哪怕 23px）都会整掉一行，首屏完整可见从
> 9 张掉到 6 张。

**它与 T1 的独立实测逐项吻合**：网格起点 227px ✓、卡片 192px ✓、行距 12px ✓、
第三行底边 899px ✓、slack 1px ✓、9 张 → 6 张 ✓。
也就是说「首屏余量只有 1px、任何增高都会整掉一行」这句话**不是 T1 的推测**，
而是仓库里**早于本轮**用同一套方法测出来并写进注释的事实。
T3/T4 应当把这段注释当作 §3 冲突的佐证引用（**不要**删它，它正是「阈值改动必须写明代价」的范例）。

**校验命令（T3/T4 直接跑，用来确认 §2 没被抄错）**

```
node -e "const j=require('./research/_raw/home-topic-entry-cards-v1/t1-baseline-measure.json').probes['1440x900'];console.log(j.navNeeds.height,j.grid.top,j.cards.count,j.firstScreenFull,j.firstScreenPart,j.slackFull,j.pageHeight,j.overflowX)"
# 期望输出：31 227 50 9 9 1 4665 0
```

---

## 3. 与既有硬规则的**冲突**（本轮必然打破的两条）

### 3.1 冲突一：`verify-site.js` 的首屏硬断言 `≥ 9` 必红

`scripts/tools/verify-site.js:263-264`：

```js
check('首屏完整可见卡片 ≥ 9', rendered.firstScreenFull >= 9,
  `完整 ${rendered.firstScreenFull} 张 / 含截断 ${rendered.firstScreenPart} 张 · 网格起点 ${rendered.gridTop}px · 页高 ${rendered.pageHeight}px`);
```

- Before 实测：`firstScreenFull = 9`，阈值 **≥ 9** 恰好**踩线通过**（余量 0 张）。
- Topic Card 要把 `nav.needs` 从 **31px** 抬到目标区间 **145–175px**（**【契约】** t1 原始要求），
  即 **δ ∈ [114, 144] px**（**【推导】** `145−31=114`、`175−31=144`）。

### 3.2 冲突二：`research/_raw/ours-baseline/verify.json` 的 `firstScreenFull` 基线必红

`scripts/tools/verify-site.js:6254-6255`：

```js
check('回归：首屏完整可见不减少', metrics.firstScreenFull >= num(ref.firstScreenFull),
  `${num(ref.firstScreenFull)} → ${metrics.firstScreenFull}`);
```

- 基线 `verify.json` 的 `firstScreenFull = 9`（生成于 `2026-09-29T12:05:42.914Z`）。
- After 若为 6，则 `6 >= 9` 为假 ⇒ **必红**。`verify-pre-fold.json` 的 `firstScreenFull` 同样是 **9**，`npm run verify:prefold` 同理会红。

### 3.3 算术理由（**已实测复现**，不是推算）

`t1-growth-sim.js` 在**运行时**给 `nav.needs` 注入 `padding-bottom: δ`（不改任何文件、不构建），
用与 `verify-site.js:255/256` 逐字相同的口径重测：

| δ (px) | `nav.needs` 高 | `.grid` 起点 | `firstScreenFull` | `firstScreenPart` | 最后完整卡 bottom | slack | 页高 |
|---|---|---|---|---|---|---|---|
| 0（Before） | 31px | 227px | **9** | 9 | 899px | **1.00px** | 4665px |
| +1 | 32px | 228px | **9** | 9 | 900px | **0.00px** | 4666px |
| +2 | 33px | 229px | **6** | 9 | 661px | 239px | 4667px |
| +114（⇒ 145px） | 145px | 341px | **6** | 9 | 773px | 127px | 4779px |
| +144（⇒ 175px） | 175px | 371px | **6** | 9 | 803px | 97px | 4809px |
| 还原 | 31px | 227px | 9 | 9 | 899px | 1.00px | 4665px |

**结论（把契约里的近似说法修准）：**

1. **slack 恰为 1.00px**（`900 − 899`）。第 3 行卡的 `bottom` 实测正好 899。
2. **δ = 1 恰好踩线**：`bottom` 变成 900 = `innerHeight`，`bottom <= innerHeight` 仍为真 ⇒
   `firstScreenFull` 仍是 9，但 **slack 归零**。所以「任何 ≥1px 的增高都掉一行」这句**差 1px**：
   准确说法是 **δ ≥ 2px 时 `firstScreenFull` 从 9 掉到 6**（掉整整一行 = 3 张）。
3. **δ ∈ [114, 144] 远大于临界值 2**（是它的 **57–72 倍**，**【推导】** `114/2=57`、`144/2=72`），
   所以 Topic Card 落地后 `firstScreenFull` **必然**从 **9** 掉到 **6**，两条硬断言**必然**变红。
   这不是「可能」，是实测出来的。
4. 注意 `firstScreenPart`（含截断）在 δ=114/144 时**仍是 9**（第 3 行首卡 `top` 仍 < 900）
   —— 所以**不要**用「含截断」去掩盖「完整可见」的下降；AC-28 要求两个口径**都**报。
5. `pageHeight` 同步增长：4665 → 4779（+114）→ 4809（+144）。基线回归里「页高不增加（容差 15%）」
   （`verify-site.js:6256`，`4665 × 1.15 = 5364.75`）**不会**被打破，无需改。
6. **交叉验证**：上表的 δ=0 一行（227 / 192 / 12 / 899 / slack 1 / 9→6）与
   `index.html:1162-1168` **本轮之前就写在仓库里的**注释逐项吻合（见 §2.1）。
   两套独立来源给出同一组数字，因此 §3 的结论不是单次测量的孤证。

---

## 4. 本轮**唯一**被授权的契约变更

**授权变更（且仅限于此）：把被实测打破的首屏读数同步到实测值。**

| # | 位置 | 变更 | 边界 |
|---|---|---|---|
| 1 | `scripts/tools/verify-site.js:263` | 断言名与阈值「首屏完整可见卡片 ≥ 9」→ 按 **After 实测值** | 断言名必须同步（否则 T4 无法引用）；**不得**放宽成「≥ 0」这种看不见回归的值 |
| 2 | `research/_raw/ours-baseline/verify.json` | **只动 `firstScreenFull` 一个字段** | `generatedAt` / `target` / `cards` / `coveredDeals` / `firstScreenPart` / `gridTop` / `pageHeight` / `checks[]` 全部**逐字未变** |
| 3 | `research/_raw/ours-baseline/verify-pre-fold.json` | **只动 `firstScreenFull` 一个字段** | 同上 |

**边界（写给 T3/T4 的硬约束）：**

- **除上述 3 处，其余断言只允许「按新结构等价重写」**：即判据要表达的**事实不变**
  （入口都在视口内、无横向溢出、无 JS 控件、数字与数据对账、无 JS 仍可用），
  只是从「读 `.nl-full`/`.nl-short`/`.nlinks`」改成「读 `.need-card` / `.need-grid`」。
- **禁止**借这次变更顺手放松任何别的阈值（`cards >= 45`、`cols === 3`、`heights.length === 1`、
  `pageHeight <= ref * 1.15`、`externalRequests <= ref` 等一律不动）。
- 阈值与基线的**代码注释必须写明代价与理由**（改了什么、从几到几、为什么必须改、换来了什么）
  —— 仓库既有习惯：`index.html:1162-1168` 那种「实测数字 + 为什么这么写」的注释写法。
- T4 的复核判据就是这一条：**是「同步实测值」还是「放宽到看不见回归」**，只此一问。

---

## 5. 必须**删除**的旧断言（`nl-full` / `nl-short` / `nlinks` 相关）

判据已经不存在于新结构里（新结构没有「CSS 标签切换」，也没有「每组两列 2/2/1」），留着只会是
「永远为真」或「永远为假」的死断言 —— 那正是 `verify-site.js:2286-2289` 注释里说的那种
「把 bug 藏起来的断言」。

| # | 断言名（源码原文） | 源码位置 | 运行时条数 | 删除理由 |
|---|---|---|---|---|
| 1 | `每条入口都同时带全称与窄屏短标签（CSS 切换，无 JS 也生效）` | `verify-site.js:2321` | 1 | 判据是每张卡同时存在 `.nl-full` 与 `.nl-short` 两个 span 由 CSS 切换。新结构是「图标 + 标题 + 说明 + 箭头」的整卡，**没有两套标签**，`short` 不再上首页（见 §6）。此断言在新结构下**不可能为真**。 |
| 2 | `桌面端入口显示的是全称、不是缩写` | `verify-site.js:2324` | 1 | 判据是「`display !== 'none'` 的那个 span 的文字 === 全称」。没有两套 span 就没有「当前可见的是哪一个」这回事。 |
| 3 | `按需求入口 390px：切到了窄屏短标签（每枚都有可见文字）` / `按需求入口 360px：…` | `verify-site.js:2456`（在 `for (const width of [390, 360])` 内） | 2 | 判据是 `.nl-full, .nl-short` 里可见者长度 ≤ 8。同上，selector 已不存在。 |
| 4 | `按需求入口 390px：每组两列排布，没有幽灵行、没有被拉高` / `按需求入口 360px：…` | `verify-site.js:2477`（同循环内） | 2 | 判据是 `nav.needs .nlinks` 的 `grid-template-rows` 有 3 条轨道、`perRow === [2,2,1]`、`boxH <= 100`。新结构是**整卡网格**（桌面 5×2），`.nlinks` 被删（AC-20），此断言的 `querySelectorAll` 返回空集合，`groups.length === 2` 恒假。 |

**合计：删除 4 个调用点 ⇒ 运行时少 6 条断言**【推导：`1 + 1 + 2 + 2 = 6`；其中 #3/#4 在 390/360 循环里各跑两次】。

**保留但必须**等价重写**的（**不要**误删）：**

| 断言名 | 位置 | 改法 |
|---|---|---|
| `首页有「按需求找优惠」入口行，且每条都是 <a>（无 JS 也能点）` | `:2314` | 判据从「`nav.needs a` 计数 === needs 条数」改成「`nav.needs a.need-card` 计数 === `NEED_PAGES.length`」，**保留 `isAnchor` 这半条**（AC-01） |
| `入口行里没有任何 JS 控件（无 JS 时不给可点暗示）` | `:2318` | **加强**：selector 从 `button, input, select` 扩到 `button, input, select, [role="button"], [aria-pressed], [data-facet]`（AC-03） |
| `首页每条入口的数字 == 数据里该需求的条数` | `:2332` | **不动**（口径 `verify-site.js:2265-2271` 已是 `type==='deal'`，见 AC-08） |
| `按需求入口 390px/360px：全部入口在视口内、不被裁、页面不横向溢出` | `:2453` | **不动**（`clipped === 0 && visible === total && overflowX === 0` 在新结构下同样成立，AC-15/16） |
| `无 JS 打开首页时「按需求找优惠」入口行仍在且指向需求页` | `:2512` | **不动**（AC-05） |

**需要注意但不改判据的 1 处**（info 级，写出来免得 T3 误伤）：
`verify-site.js:2693` 的断言「列表视图：首屏完整可见 ≥ 12 行（实测 13，卡片视图 9）」，
其**判据**是 `rowsView.visible >= 12`（列表视图），与卡片视图无关；
只有**断言名与 detail 文案里的「卡片视图 9」**会过期。允许只改文案，**不得**改 `>= 12` 这个阈值。
（`verify-site.js:2744` 的 `backToCards.visible === rendered.firstScreenFull` 是**动态**取值，会自动跟着走，不用改。）

---

## 6. `short` 字段：本轮**保留**，只**停止在首页使用**

- **决定**：`NEED_PAGES[].short` 字段**保留在注册表里**，本轮只让首页不再渲染它。 **[§已载 §26：优先保留数据结构]**
- **理由**（逐条）：
  1. prompt §26 的方向是「优先保留数据结构」——删字段是数据形状变更，会波及 `audience-selftest.js` 的既有断言。
  2. `audience-selftest.js:697-704` 有 **11 条**既有断言依赖 `short`（1 条总断言 + 10 条逐 slug 断言：
     `每条都有窄屏短标签，且短于全称（窄屏折行靠它压下来）`、`短标签不含数字或版本号（<slug>「<short>」）`）。
     AC-30 要求这些断言**逐条保留不动**，删字段会直接让它们变红。
  3. `short` 的**历史用途**是窄屏折行压缩（`audience.js:463-472` 注释：窄屏十枚完整标签折成 5 行 chip、整块 204px）。
     本轮把入口换成整卡后，首页不再需要它；但保留字段的成本是 **0 字节产物**（它不进 `dist/deals.json`），
     删除的成本是「11 条断言 + 一次数据形状变更」。
- **判据（怎么判它是「保留但停用」而不是「偷偷还在用」）**：
  - 正：`node -e "console.log(require('./scripts/lib/audience.js').NEED_PAGES.map(p=>p.short).join('/'))"`
    输出 `专享/教育/免卡/国内/免费/API/Tokens/Coding/模型/Credits`（【源码】= 当前实测值，指纹 `8e25f9a6c9041660`）。
  - 反：`dist/index.html` 里 `nav.needs` 作用域内**不得**出现 `short` 的任何一条取值作为**独立可见标签**
    （`nl-short` 已按 AC-20 删除；若 T2 保留 `.nl-short` 只把 `display:none` 兜着，AC-20 判红）。
- **注意**：`short` 不变量已计入 AC-12 的指纹表（`8e25f9a6c9041660`），T3/T4 可直接重算比对。

---

## 7. 门禁口径不变性：`--expect-checks=38` 与 `FROZEN_ASSERTION_NAMES` 均不变

- **本轮不新增 selftest 脚本、不新增门禁步骤**，因此：
  - `.github/workflows/verify.yml:125` 的 `run: node scripts/tools/check-ci-consistency.js --expect-checks=38` **不动**；
  - `scripts/tools/check-ci-consistency.js:547` 起的 `FROZEN_ASSERTION_NAMES` **不动**；
  - `package.json` 不新增 `selftest:*`；`.github/actions/gate/action.yml` 不新增步骤。
- **为什么删 `verify-site.js` 的断言不牵动这两者**：这两个值冻结的是 **`check-ci-consistency.js` 自己的
  37 条断言 + 1 条看门狗 (W) = 38 项**，管的是仓库口径（workflow / 复合 action / `package.json` / selftest 登记），
  **一条都不数 `verify-site.js` 的断言**。裸跑输出的 detail 全部只提 workflow、`action.yml`、`package.json`、
  `*selftest*.js`，没有任何一条引用 `verify-site.js` 的项数。
- **现状实测（T1 跑的 Before 读数，供 T4 对照）**：

  ```
  PS> node scripts/tools/check-ci-consistency.js
    ✓ (W) 断言名单与冻结清单等值（删一条或改名都会红；本看门狗保护不了自己被删）
        — 实跑 37 条 = 冻结清单 37 条 + 本看门狗
  ✓ (E) 实跑项数 == --expect-checks=38（期望值来自 verify.yml 的 gate 调用行；数字钉在调用方，与看门狗互相独立）
  ✅ CI 口径检查 38 项，失败 0 项
  ```

---

## 8. T1 未在本地复现的数字（**T3 必须实测**，不许直接信本文件）

下列数字来自 t1–t5 契约的 **【契约】** 来源，T1 没有 prompt 原件可校，也**没有**在本地测量过：

| 数字 | 出处 | 为什么没测 / T3 要做什么 |
|---|---|---|
| `nav.needs` 区块目标高度 **145–175px** | t1 acceptance「Topic Card 目标高度 145–175px」 | 那是 **After 目标**，Before 只测得 31px。T3 在 After 上实测本块高度并报是否落在区间内 |
| 单卡目标高度 **64–80px** | t1 acceptance「卡片高度 64-80px」 | 同上；T3 实测每张 `a.need-card` 的 `getBoundingClientRect().height`（AC-17） |
| 桌面列数 **5**（10 张 = 5×2） | t2 acceptance「1440px 下 .need-grid 轨道数为 5」 | T3 实测 `getComputedStyle(grid).gridTemplateColumns` 的轨道数 |
| `homeDescription` 长度 **12–24 非空格字符** | t3 acceptance | 由 `audience-selftest.js` 新增断言判，T3 复核断言真的在跑 |
| 箭头右移 **2px** | t3 acceptance | T3 用 `page.hover` 实测（AC-18） |

---

## 9. 一共多少条、覆盖了什么（自检表）

- 条目总数：**AC-01 … AC-32 = 32 条**（≥ 20 ✓）。
- 每条都带 §编号 + 客观判据（断言名 / 命令 / 实测读数）✓。
- 任务 acceptance 点名要覆盖的主题，逐条落位：

| 要求覆盖的主题 | 落在 |
|---|---|
| 整卡 `<a>` | AC-01 |
| 无选中态 / `aria-pressed` / `data-facet` / `role=button` | AC-03、AC-04 |
| 无 JS 完整 | AC-05、AC-29 |
| 与 NEED_PAGES 对账 | AC-06、AC-07、AC-09 |
| 不改 NEED_PREDICATES | AC-12 |
| 不改 `/need/**` 页面 | AC-13 |
| 桌面多列不得 10 张挤一行 | AC-14 |
| 禁止横向滚动隐藏入口 | AC-15 |
| 手机无横向滚动 | AC-16 |
| 卡片高度 64–80px | AC-17 |
| 文案来源仍是 NEED_PAGES 单一注册表 | AC-09、AC-10 |
| 数据层零变化 | AC-21 |
| Analytics 零改动 | AC-22 |
| Mutation M1–M7 真红后 byte-exact 还原 | AC-24、AC-25 |
| Full Gate 全绿 | AC-26、AC-27 |
| 首屏密度 Before/After 实测 | AC-28、§2、§3 |

---

## 10. 一页速查（给 T2 / T3 / T4 的最短路径）

```
# 0) 读契约
research/_raw/home-topic-entry-cards-v1/REQUIREMENTS.md

# 1) T2 改完先自查（不跑浏览器）
node scripts/tools/build-local.js
node scripts/tools/audience-selftest.js
node scripts/tools/validate.js --strict

# 2) T3 真浏览器验收（同一时刻只允许一个人动 dist/）
node scripts/tools/verify-site.js
node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json

# 3) T1 的 Before 读数复现（只读，随时可跑）
node research/_raw/home-topic-entry-cards-v1/t1-baseline-measure.js
node research/_raw/home-topic-entry-cards-v1/t1-growth-sim.js

# 4) T4 Full Gate
node scripts/tools/check-ci-consistency.js
git diff --stat
git diff -- deals.json plans.json api-plans.json models.json
```

**Before 关键读数（1440×900，【实测】）：`nav.needs` 31px · `.grid` 起点 227px · 卡高 192px ·
完整可见 9 张 · 含截断 9 张 · slack 1.00px · 页高 4665px · 横向溢出 0px。**

**必然被打破的两条硬规则：`verify-site.js:263` 的「首屏完整可见卡片 ≥ 9」、
`verify.json`/`verify-pre-fold.json` 的 `firstScreenFull=9` —— 实测 δ=+114~144px 会把
`firstScreenFull` 打到 **6**（δ≥2 就掉一行）。这是本轮**唯一**被授权改的契约，改法见 §4。**
