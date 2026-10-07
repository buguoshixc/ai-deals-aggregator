## 分类说明的 disclosure 可发现性（`page-notes-disclosure-v1`）

> **一句话**：折叠逻辑从来没坏 —— 坏的是**看不出能折叠**。本轮不改语义、不改内容、不改路由，
> 只把二级页底部那一行变成「一眼看得出可以展开」的 disclosure 控件。

| | |
|---|---|
| 基线 | `origin/master = 7872c04` |
| 改动面 | `scripts/tools/build-local.js`（**唯一**共享渲染器：标记 + 页面级 CSS）· `scripts/tools/verify-site.js`（新增 §15b3 六条）· `docs/DESIGN-RULES.md`（H12 一节）· 报告与证据 |
| 影响范围 | 44 个带分类说明的目录页 + 1 个别名页（共用同一份页面级 CSS）；`/student/` `/developer/` `/free-api/` `/need/*` `/category/*` `/vendor/*` 全是这一条路径，**没有第二份 CSS** |

### 改了什么

```html
<details class="page-notes">
  <summary class="page-notes-summary">
    <span class="page-notes-leading"><span class="page-notes-chevron" aria-hidden="true"></span><span class="page-notes-title">分类说明</span></span>
    <span class="page-notes-action" aria-hidden="true"></span>
  </summary>
  <p class="pnote">…正文一字未改…</p>
</details>
```

- **左箭头**：CSS 画（两条 border + rotate），收起 `›` / 展开 `⌄`；不依赖字体字形，不用 emoji。
- **右侧状态文案**：`::before { content: '展开' }`，**DOM 里没有这两个字**。两条理由：① 既有的无 JS 探针读
  `summary.textContent === '分类说明'`，加字面量会当场打红它；② 生成的文案不进正文文本，SEO 字数与检索面不受影响。
- **整行即点击区**：`min-height: 44px` + `padding: 10px 12px` + 铺满宽度；箭头 / 标题 / 中段空白 / 右侧文案任意一点都能触发。
- **仍是原生 `<details>`**：开合、键盘（Enter / Space）、屏读的展开状态由浏览器负责 —— 不写 `aria-expanded`、不引 JS、默认仍收起。
- **marker 抑制限定在 `.page-notes > summary`**：站内还有 4 类语义不同的折叠（首页 FAQ / 译文 `.zht` / 变化页 `.chgother` / API 页 `.pevd`），不写全局 `summary`。
- **视觉权重低于优惠表格与 CTA**：12px 小字、上下两条 hairline、hover 只浮一层 `--card` 底色、无填充按钮无阴影。

### 判据（`verify-site.js` §15b3，三族各一条路线）

| # | 断言 | 实测 |
|---|---|---|
| 1 | 三件套各恰好一个 + 装饰件 `aria-hidden` + 默认收起 + 默认 marker 已抑制 | `summary×1「分类说明」· chevron×1 9.9×9.9px · action×1 · marker=none · open=false`（3/3 路线） |
| 2 | 状态文案由 CSS 生成且真实可见 | 收起态 computed content = `"展开"`（3/3） |
| 3 | 点一下状态**整体翻转** | `open false→true · 「展开」→「收起」 · 正文可见 false→true · 箭头 transform 翻转` |
| 4 | **整行可点**（中段空白带真实鼠标点击） | `空白带 1261px · 点 (740,597) 命中 <summary.page-notes-summary> · open false→true` |
| 5 | 键盘 | `Tab 聚焦 + :focus-visible=true + outline solid 2px · Enter→open=true · Space→open=false` |
| 6 | 390px | `summary 358×44px · 页面溢出 0px · 正文溢出 0/2 段 · 状态文案仍在行内` |

四条探针 **fail-soft**：控件缺失时点名是**哪一件**没了（`缺 .page-notes-action ⇒ 状态切换无从谈起`），
而不是抛异常打断整轮验收 —— 否则 800 多项都不会跑，失败就不可归因。

### 读数

| 项 | 读数 |
|---|---|
| 真浏览器验收 | **855 → 861 项 / 失败 0**；带回归比对 **867 / 0**（回归基线无需重刷：`--compare` 只比 metrics） |
| Full Gate（本地，读同一份 `action.yml`） | **51 步 → 执行 47 / 通过 47 / 失败 0 / 跳过 4 · exit 0 · 319.8s** |
| `check:ci` | **38 / 0** |
| 变异证明 | 删掉 `.page-notes-action` 的 span ⇒ **恰好 5 条判红且全部落在 §15b3**，其余 856 条照旧全绿；变异跑在 `dist` 克隆上，主产物零污染 |
| 几何（1440 / 768 / 390 / 360） | summary 1380 / 728 / 358 / 328 × **44px**；状态文案距右缘 12px；页面与正文溢出 **0** |
| 对比度（hover 底色上） | 亮色 **4.83:1** · 暗色 **6.08:1** · 跟随系统 6.08:1（都过 AA） |
| 长标题探针 | 390px 下标题折成 2 行，状态文案**仍在行内**、页面溢出 0px |

### 没有改到别的东西（机器证据）

独立工作树重建 `origin/master` 产物逐文件对账：

- **303 → 303** 个产物文件（无路由 / 文件增删）· 非 HTML 产物（Feed / JSON / sitemap / logos）**逐字节相同**
- **每一页 JSON-LD 逐字节相同**
- 45 个 HTML 差异 = 44 个带说明的目录页 + 1 个别名页；把「页面级 `<style>` 块」与 summary 里的装饰 span
  剥掉之后，45 个页面**逐字节相同**（正文 / canonical / 内链 / robots 一字未动）

### 顺带修掉的两个真缺陷（都在同一条路径上）

1. **页面级 CSS 是模板字符串：注释里一个反引号就会静默吞掉整页样式**（`pageCss = NaN` ⇒ 页面壳不输出
   `<style>`，而构建期自检全绿）。是 §15b3 读 computed `::before` 时当场咬出来的。
2. **构建期「作者正文无 Markdown 记号」的扫描窗口按 `<details>` 字面量取** —— 页面级 CSS 注释里写那个
   字面量会把整份样式表卷进扫描面，CSS 注释里的 `**` 变成假阳性；去掉后窗口正好从真实的折叠块开始。

两条都写进了 `build-local.js` 的注释与 `docs/DESIGN-RULES.md` H12。

### 未改动（scope 护栏）

正文内容与注册表（`SHARED_NOTES` / `userIntro` / `userNotes` 一字未改）· 其它 4 类 `<details>` ·
分类逻辑 / 数据 / 路由 / canonical / JSON-LD / Feed / Sitemap / History / Coverage / Analytics /
页面标题 / 优惠表格 · `.snote` 冻结串（186/186 页仍恰好 1 次）· workflow 与复合 action（`check:ci` 38/0）。

**报告**：`research/page-notes-disclosure-v1-report.md`（含 Self-Audit 十问：P0=0 · P1=0 · REPAIR_NOW=0）
