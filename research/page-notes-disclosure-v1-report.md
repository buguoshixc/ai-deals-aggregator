# 分类说明的 disclosure 可发现性（`page-notes-disclosure-v1`）

> **一句话**：折叠逻辑从来没坏 —— 坏的是**看不出能折叠**。本轮不改语义、不改内容、不改路由，
> 只把底部那一行变成「一眼看得出可以展开」的 disclosure 控件：左侧 CSS 画的箭头、
> 右侧状态文案（CSS 生成）、整行 44px 点击区；仍然是原生 `<details>`，默认仍然收起，
> 页面零 JS，改动只落在**一个共享渲染器**上。

| 项 | 值 |
|---|---|
| 基线 | `origin/master = 7872c04`（本地 `master` 当时落后 25 个提交，实现位置只在 origin 上有） |
| 分支 / 工作树 | `page-notes-disclosure-v1` · `.worktrees/page-notes-disclosure-v1` |
| 改动文件 | `scripts/tools/build-local.js`（渲染 + 页面级 CSS）、`scripts/tools/verify-site.js`（新增 §15b3 六条）、`docs/DESIGN-RULES.md`（H12 一节）、本报告 |
| 数据 / 内容 / 路由变化 | **无**（机器证据见 §6） |
| 真浏览器验收 | **861 项 / 失败 0**（改动前 855 项 → 新增 6 项）；带回归比对 **867 项 / 失败 0** |
| 变异回归证明 | 删掉 `.page-notes-action` 的装饰 span ⇒ **恰好 5 条判红**（全部落在 §15b3），其余 856 条照旧全绿 |
| Full Gate | **51 步 → 执行 47 / 通过 47 / 失败 0 / 跳过 4 · exit 0**（本地读同一份 `action.yml`） |
| CI | 见 §9（PR 读数回填） |
| 线上冒烟 | 见 §9 |

---

## 1. 问题与判据

改动前的产物（`origin/master`）：

```html
      <details class="page-notes">
        <summary>分类说明</summary>
        <p class="pnote">同一条优惠可能同时出现在多个标签页。</p>
        <p class="pnote">表格里写「尚未确认」的字段表示我们没查到依据，不代表不可用。</p>
      </details>
```

`.page-notes > summary { display: block; cursor: pointer; … }` —— 于是它在页面上长得像
**一行普通小标题**：没有箭头、没有「展开/收起」、点击区只有「分类说明」四个字宽。
真正把它点开过的人才知道它能点。这类缺陷的共性是**既有断言全绿**：
`<details>` 在、`<summary>` 在、无 JS 读得到正文（那正是 §15b2 在守的）——
唯独「看起来能不能点」没有任何一条在量。

**本轮判据（不是「加了个箭头」）**：

> 收起时**不必尝试**就知道整行可展开；桌面 / 手机 / 键盘 / 暗色 / 无 JS 都自然可用；
> 视觉权重仍低于优惠表格、CTA 与主要导航。

---

## 2. 最终结构（逐字）

```html
      <details class="page-notes">
        <summary class="page-notes-summary">
          <span class="page-notes-leading"><span class="page-notes-chevron" aria-hidden="true"></span><span class="page-notes-title">分类说明</span></span>
          <span class="page-notes-action" aria-hidden="true"></span>
        </summary>
        <p class="pnote">同一条优惠可能同时出现在多个标签页。</p>
        <p class="pnote">表格里写「尚未确认」的字段表示我们没查到依据，不代表不可用。</p>
      </details>
```

三处刻意的设计（都有判据，不是风格偏好）：

| 决定 | 为什么不能反过来 |
|---|---|
| 仍是原生 `<details>` / `<summary>` | 开合、键盘（Enter / Space）、屏读的展开状态全部由浏览器负责；不写 `aria-expanded`、不引 JS 状态管理。无 JS 可开合是**免费**的 |
| 状态文案用 CSS `::before` 生成（DOM 里**没有**「展开/收起」四个字） | ① 既有的无 JS 探针读 `summary.textContent === '分类说明'`，加字面量会当场打红它；② CSS 生成的文案不进正文文本，SEO 字数与检索面不受影响 |
| chevron / action 都 `aria-hidden="true"` | 它们是**装饰**：状态语义由浏览器给屏读，装饰件进无障碍树只会制造噪声 |

正文（`<p class="pnote">` 的内容）与三层说明模型（H11）**一字未改**。

---

## 3. 最终样式（页级 CSS，唯一一处）

```css
.page-notes { margin: var(--s3) 0 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.page-notes > summary { list-style: none; }
.page-notes > summary::-webkit-details-marker { display: none; }
.page-notes-summary {
  display: flex; align-items: center; justify-content: space-between; gap: var(--s2);
  width: 100%; min-height: 44px; padding: 10px 12px;
  cursor: pointer; color: var(--ink2); font-size: var(--fs-sm); font-weight: 600;
  border-radius: var(--r-sm);
  transition: background-color var(--t-fast) var(--e-std);
}
.page-notes-summary:hover { background: var(--card); }
.page-notes > summary:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.page-notes-leading { display: flex; align-items: center; gap: var(--s2); min-width: 0; }
.page-notes-chevron {
  flex: none; width: 7px; height: 7px;
  border-right: 2px solid var(--mut); border-bottom: 2px solid var(--mut);
  transform: rotate(-45deg);
  transition: transform var(--t-fast) var(--e-std);
}
.page-notes[open] .page-notes-chevron { transform: rotate(45deg); }
.page-notes-action { flex: none; color: var(--mut); font-weight: 400; }
.page-notes-action::before { content: '展开'; }
.page-notes[open] .page-notes-action::before { content: '收起'; }
.page-notes > .pnote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0; padding: 0 12px var(--s2); }
.page-notes > .pnote:last-child { padding-bottom: 12px; }
```

- **marker 抑制只在本组件内**（`.page-notes > summary`）：站内还有 4 类语义不同的折叠
  （首页 FAQ / 详情页译文 `.zht` / 变化页 `.chgother` / API 页 `.pevd`），写全局 `summary` 会把它们的箭头一起抹掉。
- **箭头用两条 border 画**（CSS 直角 + rotate）：不依赖字体里有没有 `›` / `⌄` 字形，
  旋转状态由 `[open]` 切换，收起 `rotate(-45deg)` → 指向右，展开 `rotate(45deg)` → 指向下。
- **颜色全部走 token**：亮色 / `data-theme="dark"` / 跟随系统三态共用同一份声明，没有写死白色。
- 动效只有 100ms 的箭头旋转与底色过渡；共享样式里既有的
  `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition-duration: .01ms !important } }`
  会自动把它关掉（`verify-site` 既有断言「prefers-reduced-motion 下动效被关掉」仍绿）。

---

## 4. 六条新断言（`verify-site.js` §15b3）

三族各取一条路线（`/need/ai-coding/`（按需求）· `/student/`（专题集合）· `/category/chat/`（分类落地）），
顺手证明它们共用**同一个** `renderDirectoryPage` 输出。

| # | 断言 | 实测读数（本轮冻结修订） |
|---|---|---|
| 1 | 三件套各**恰好一个**（summary / chevron / action）+ 装饰件 `aria-hidden` + 默认收起 + 默认 marker 已抑制 | `need/ai-coding/ summary×1「分类说明」· chevron×1 9.9×9.9px · action×1 · marker=none · open=false`（三条路线同形） |
| 2 | 右侧状态文案由 CSS 生成且真实可见（收起态 computed content = 「展开」） | `need/ai-coding/="\"展开\"" · student/="\"展开\"" · category/chat/="\"展开\""` |
| 3 | 点一下**状态整体翻转**：open false→true · 「展开」→「收起」 · 正文不可见→可见 · 箭头 transform 改变 | `matrix(0.707107, -0.707107, …)→matrix(0.707107, 0.707107, …)`；正文可见 `false→true`（用 `checkVisibility()`，不用 `offsetHeight` —— Chromium 关闭的 `<details>` 是 content-visibility 语义） |
| 4 | **整行可点**：summary 中段的**空白带**点一下就展开 | `空白带 1261px · 点 (740, 597) 命中 <summary.page-notes-summary> · open false→true`（先 `elementFromPoint` 证明命中的是 summary 本身，再真实鼠标点击） |
| 5 | 键盘：Tab 聚焦 summary（`:focus-visible` 命中且 outline ≥2px）· Enter 展开 · Space 收起 | `焦点在 summary=true · :focus-visible=true · outline solid 2px · Enter→open=true · Space→open=false` |
| 6 | 390px：整行点击区 ≥44px、summary 不超出视口、展开后正文与页面都不横向溢出 | `summary 358×44px（视口 390）· 页面溢出 0px · 正文溢出 0/2 段 · 状态文案仍在行内=true` |

四条探针一律 **fail-soft**：控件整个不见了的时候，判据要说得出口是**哪一项**没了
（`缺 .page-notes-action ⇒ 状态切换无从谈起`），而不是从 `page.evaluate` 里抛 TypeError
把整轮验收打断 —— 那样后面 800 多项都不会跑，失败就不可归因了。

---

## 5. 几何 / 主题 / 无 JS 实测

### 5.1 四个视口（两条路线各量一遍，读数一致）

| 视口 | summary | 标题 | 状态文案右距行右缘 | chevron | 展开后 | 页面横向溢出 | 正文溢出 |
|---|---|---|---|---|---|---|---|
| 1440 | **1380×44px** | 1 行 | 12px | 9.9×9.9 | `"收起"` | 0px | 0 段 |
| 768 | **728×44px** | 1 行 | 12px | 9.9×9.9 | `"收起"` | 0px | 0 段 |
| 390 | **358×44px** | 1 行 | 12px | 9.9×9.9 | `"收起"` | 0px | 0 段 |
| 360 | **328×44px** | 1 行 | 12px | 9.9×9.9 | `"收起"` | 0px | 0 段 |

**长标题探针**（把标题临时换成一整句 35 字）：390px 下 summary 自动折成 **2 行（56px）**、
状态文案**仍在行内且未被挤出视口**（`actionShift = 0`）、页面溢出 **0px** —— 未来标题变长不会挤掉右侧提示。

### 5.2 对比度（WCAG 相对亮度，量的是**真实 hover 底色上**的文字色）

| 主题 | hover 底色 | 标题 | 状态文案 / 箭头 |
|---|---|---|---|
| 亮色 | `--card` `#fff` | 8.01:1 | **4.83:1** ✅ AA |
| `data-theme="dark"` | `--card` `#14171c` | 9.58:1 | **6.08:1** ✅ AA |
| 跟随系统（`prefers-color-scheme: dark`） | `#14171c` | 9.58:1 | **6.08:1** ✅ AA |

为什么 hover 底不取 `--line2`：`--mut` 在 `--bg` 上本来就是 **4.50:1** 的临界值，
换到略深的 `--line2` 会掉到亮色 ≈**4.3:1**，低过 AA。

### 5.3 无 JS / SEO 边界（复核，未变）

- 无 JS 上下文：折叠说明正文 **90 字**可读、点 summary 即 `open=true`、
  `.page-notes-action` 的 `textContent` 为空（它本来就只是装饰）。
- `<details>` 的正文在 DOM 里，`prerenderedText()` 与 `seo.js` 的 `visibleText()`
  只剥 script/style/注释/标签 ⇒ 折起来的内容照样被搜索引擎与「查看源码」读到。
- 既有断言逐字未破：`summary.textContent === '分类说明'`、`notes.textContent > 10 字`。

### 5.4 目检（六态截图，本机 `research/_raw/page-notes-disclosure-v1/shots/`）

收起 / hover / focus / 展开 / 暗色（收起 + 展开）/ 390px / 系统跟随 / 无 JS 共 20 张特写。
**最重要的人工判断**：收起状态下，`› 分类说明 … 展开` 这一行**不必尝试**就能看出可展开；
hover 时整行浮起一层底色、focus 时 2px 品牌色 outline 明确可见 ——
而它的视觉权重仍低于上面的优惠表格与 CTA。

---

## 6. 变异回归证明（只做一个，且不进 CI）

按 `docs/TESTING.md` §5.4「同一 invariant 已有普通断言就不加牙」的原则，
本轮**不往 CI 里塞变异牙**，改为一次性外部探针（`research/_raw/…/make-mutation.cjs`，Tier-3 本机）：

| 步骤 | 读数 |
|---|---|
| 锚点唯一性（反空洞守卫） | `page-notes-action` 的 span 在产物里**恰好 1 次** |
| 变异 | 删掉那一行 span（CSS 与正文一字未动：`detailsKept / cjkIntact / cssKept / bodyKept` 四项守卫全 true） |
| sha256 | `75827175…` → `6dc09d40…`（变异生效） |
| 复测 | **861 项 / 失败 5** —— 五条全部落在 §15b3（三件套 / 状态文案 / 状态翻转 / 整行可点 / 390px），每条都点名 `缺 .page-notes-action` |
| 归因 | 其余 **856 条照旧全绿**（含 §22b M1–M5、§22c 的 12/12 违规码可达）⇒ 失败可归因，不是「整轮炸了」 |
| 磁盘污染 | 变异跑在 `dist` 的**克隆目录**上，主 `dist/` 从未被触碰；克隆跑完即删 |

---

## 7. 「没有改到别的东西」的机器证据

把 `origin/master` 在**独立工作树**里重新构建一份产物，与本轮产物逐文件对账
（`research/_raw/…/diff-artifacts.cjs`，一次性探针）：

| 判据 | 读数 |
|---|---|
| 产物文件数 | **303 → 303**（没有任何路由 / 文件被增删） |
| 逐字节相同 | **258 个** |
| 非 HTML 产物（Feed / JSON / sitemap / logos…） | **全部逐字节相同**（差异 0 个） |
| JSON-LD（每一页） | **全部逐字节相同** |
| HTML 差异 | **45 个** = 44 个「带分类说明的目录页」+ `/need/student-only/`（`noindex` 别名页，它没有说明块但共用同一份页面级 CSS） |
| 允许面之外 | **0**：把「页面级 `<style>` 块」与「summary 里的装饰 span / 标题」剥掉之后，45 个页面的 HTML **逐字节相同**（正文、canonical、内链、robots 一字未动） |

结论：**数据 0 变化 · 内容 0 变化 · 路由 0 变化 · 结构化数据 0 变化**；
差异面恰好等于「一个共享渲染器的标记 + 一段页面级 CSS」。

---

## 8. 本轮踩到并修掉的两个真缺陷（都在同一条路径上，都记进了 DESIGN-RULES H12）

1. **页面级 CSS 是模板字符串，注释里一个反引号就会静默吞掉整页样式**
   第一版注释里写了 `` `**` ``（反引号包住 Markdown 记号）。反引号提前闭合 `pageCss`，
   表达式退化成「字符串 `**` 字符串」⇒ `pageCss = NaN` ⇒ 假值 ⇒ 页面壳**不输出 `<style>`**，
   而**构建期自检全绿**（现象：`.cstop` / `.ctable` / `.page-notes` 全都不在产物里）。
   是 §15b3 读 computed `::before` 时当场咬出来的 —— 这也是「判据要落在浏览器层」的实证。
2. **构建期「作者正文无 Markdown 记号」的扫描窗口按 `<details>` 字面量取**
   页面级 CSS 注释里原本写了折叠标签的字面量，于是扫描窗口从 CSS 注释一路吞到真实的折叠块，
   CSS 注释里的任何 `**` 都变成一条假阳性。去掉那个字面量之后，窗口正好从真实的折叠块开始，
   **扫描面反而更准**（`<details>` 字面量在整页源码里现在恰好 1 次）。

两条都写进了 `build-local.js` 的注释里（写给下一个改这段 CSS 的人）。

---

## 9. 门禁 / CI / 发布读数

### Full Gate（本地，读同一份 `.github/actions/gate/action.yml`）

```
门禁步骤（读自 .github/actions/gate/action.yml）：51 个
合计 319.8s / 47 个脚本，失败 0
跳过的 4 个非 node 步骤：Install dependencies · Prepare browser · Browser availability decision · Gate conclusion
✅ 本地门禁链全过（与 CI 读同一份 action.yml）
```

其中与浏览器直接相关的两步：`Real-browser acceptance (verify-site.js)` ✓ 125.3s ·
`Regression verify (baseline compare)` ✓ 124.2s。

### 真浏览器验收与回归比对

```
node scripts/tools/verify-site.js --dir=dist                          → 861 项 / 失败 0
node scripts/tools/verify-site.js --compare=…/ours-baseline/verify.json
  ✓ 回归：覆盖的优惠条数不减少 — 80 → 80
  ✓ 回归：卡片数不减少 — 50 → 50
  ✓ 回归：首屏完整可见不减少 — 6 → 6
  ✓ 回归：页高不增加（容差 15%） — 4589px → 4787px
  ✓ 回归：外部请求不增加 — 0 → 0
  ✓ 回归：JS 错误仍为 0 — 0 个
  → 867 项 / 失败 0（回归基线**无需重刷**：`--compare` 只比 metrics，不比对断言清单）
```

`npm run check:ci` → **38 项 / 失败 0**（本轮未动 workflow / 复合 action / CI 脚本）。

### PR / CI / Deploy / 线上冒烟

见台账回填（`research/page-notes-disclosure-v1-release-readings.md`）。

---

## 10. Self-Audit（十问）

| # | 问题 | 结论 | 依据 |
|---|---|---|---|
| 1 | 是否明显像可点击控件？ | ✅ | 箭头 + 右侧「展开」+ 整行 hover 底色 + 整行 44px 点击区；空白带 1261px 处任点即开（断言 4） |
| 2 | 是否过于抢眼？ | ✅ | 12px 小字 + `--ink2`/`--mut` + 上下两条 hairline；无填充按钮、无阴影；层级低于优惠表格与 CTA |
| 3 | 是否仍默认折叠？ | ✅ | `open=false` 三条路线逐条断言（断言 1）；没有 `open` 属性 |
| 4 | 是否无 JS 可用？ | ✅ | 原生 details；无 JS 上下文实测正文 90 字可读、点击即展开（§5.3） |
| 5 | 是否键盘可用？ | ✅ | Tab 可达 + `:focus-visible` outline 2px `--brand` + Enter / Space 都能开合（断言 5） |
| 6 | 是否 dark mode 正常？ | ✅ | 三态（手动暗色 / 跟随系统 / 亮色）同一份 token；hover 底上对比度 4.83 / 6.08（§5.2） |
| 7 | 是否手机无溢出？ | ✅ | 360 / 390 两档：summary 328 / 358px ≤ 视口、页面溢出 0px、正文溢出 0 段（§5.1） |
| 8 | 是否影响其它 details？ | ✅ | marker 抑制限定 `.page-notes > summary`；未触碰 FAQ / `.zht` / `.chgother` / `.pevd`；全站冻结串仍恰好 1 次（§22c 186/186 绿） |
| 9 | 是否没有业务数据变化？ | ✅ | 非 HTML 产物逐字节相同、JSON-LD 逐字节相同、允许面外正文逐字节相同（§7） |
| 10 | 是否没有做超范围的事？ | ✅ | 未加依赖、未加 npm script、未动 workflow / action（`check:ci` 38/0）、未加 CI 变异牙、未改正文与注册表 |

**P0 = 0 · P1 = 0 · REPAIR_NOW = 0**

差分项：无（本轮的两个真实缺陷都在提交前被门禁与探针咬出并修掉了，见 §8）。
