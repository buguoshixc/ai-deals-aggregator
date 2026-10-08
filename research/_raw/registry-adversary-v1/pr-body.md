# `criteria-adversary-v1` · 对刚合并的两轮判据做对抗性独立验证

对 `vertical-note-coverage-v1`（合并 `1c02d84`）与 `narrow-reading-columns-v1`（合并 `ef395c0`）做**证伪**，不是复述。
**37 条攻击形态 / 38 条记录**（`F1` 在伪造与对照副本各一条），判定分布：

> **守住 15 · 破防 9 · 未覆盖 6 · 假红 1**

产品零改动：`dist` 逐文件 sha256 实验前后**全等**（`c81765cde8e2d0e7cf612be043d3671f841126b951c04db17a0a51c7e7a1c82c`，303 文件）；
全部形态注入 `.arch-v1/` 下的 11 份副本（每条形态只改 1 个文件，`unexpectedChangedFiles: []`），登记表层面的实验只在 `scripts/` 的沙箱副本里做。
判定一律读门禁自己的 JSON（`verify-site.js --json=…`），另有 9 次独立探针（playwright-core + 本机 Edge）**只量布局**，用来区分「形态没生效」与「生效了但判据看不见」。

## 三条最重要的破防（每条都有伪造侧 + 真删对照侧）

1. **出货判据可被注释伪造**（captain 现场撞到的同族第三次，出货路径上确实存在）
   * `sitemap.xml` 里把 `vendor/zhipu/` 的整个 `<url>` 块包进 XML 注释 ⇒ §18「sitemap 成员资格」✓、`/vendor/ 枢纽列出 24 个厂商入口`✓、`verify:seo` **11 项 / 0 失败**（`sitemap entries` 仍是 183）；
     **真删对照**三条同时红（`sitemap 无` / `页面 25 行 / sitemap 24 个` / `漏 vendor/zhipu/`）。
   * `<link rel="canonical">` 包进 HTML 注释 ⇒ `verify:seo` **11 项 / 0 失败**（`canonical-self`/`canonical-unique` 被注释骗过）；真删对照 `❌ [canonical-self] … 没有 canonical`。
     `verify-site` 的 **DOM** 判据把它兜住（组合仍红），但 `verify:seo` 作为独立门禁的证据强度被削弱。
   * §22c「冻结串恰好 1 次」也被骗过（`186/186` 绿）；探针证明真规则已不在：note computed 从 `12px / 20.4px / margin-bottom 12px` 变成 `14px / 21px / 0px`。
   * 报告 §6 给出**逐处行号清单**（可伪造 / 免疫 分类）：`verify-site.js` 6792、6943（实测）· 4112-4115、4138-4141（静态）· 4338+4382（实测）· 5472-5474（静态，且读的是 `ROOT/dist` 而非 `--dir` 副本）· 8817 / 1512-1524 / 4350-4369（免疫：方向是「必须不出现」或走 DOM/DOMParser）；`lib/seo.js` 88/93/98/103/108/112-125/162-188（只有 `visibleText` 剥注释）；`seo-verify.js` 48/94/105-106/156/202-205。
2. **登记制可被极小代价绕过**：`max-width: 70CH`（单位大小写）与 `MAX-WIDTH:`（属性名大小写）**完全不在扫描面**（探针：生效 `452.812px` / `466.348px`）；`.pnote, .pdetailbody { max-width: 72ch }` 借逗号段登记 ⇒ 0 码（去逗号对照 ⇒ 红；字面 `70ch` 例也红）；`content:"/*"` 之后的真规则被注释剥离器（非贪心正则）吃掉 ⇒ 0 码；`width: 300px` 覆盖生效宽 ⇒ 874/0 全绿。
3. **竖排单列 + 裁切 = 整页零码**：`.snote { writing-mode: vertical-rl; width:100%; height:5.6rem; overflow:hidden; white-space:nowrap }` ⇒ 列 1（② 前置不成立）· 内容盒 1377（① 看不见）· `note-clipped` 只看横向 ⇒ **0 码**，而 `scrollHeight 1489 / clientHeight 90` ⇒ 157 字里 ~94% 被裁掉。

另外两条与轮 2 报告措辞不符的实测：**§19 的几何承诺只对 `entries[0]` 成立**（沙箱 `entries = [.pdetailbody, .page-notes-summary（未居中）, .ghost-nowhere]` + 产物真写入未居中窄列 ⇒ **874/0 全绿**；探针：`466.348px`、左 0 / 右 913.66）；**容差边界实测 1.87px 绿 / 2.09px 红**（Chromium 把位移量化到 1/64px，标称 1.90/2.10 在实测里表现为 1.87/2.09）。

## captain 的三问（都是实跑）

* `entries: []` ⇒ **立刻红**：沙箱 874 项 / 失败 5（四档逐条判据 + `M16` 承重证明），且 §19 几何靠 `entries[0] || {'.pdetailbody','max-width: 72ch'}` 的 fallback **继续跑**（清空登记表不会留下几何空窗）。
* 扫描面：`@media` 内规则与 `@supports` 外层 + 注释混排**都扫得到**（不是漏）；**逗号多选择器是真漏**；行内 `style=` / `px` / `min-width` 确认在已声明射程外（`min-width` 且不构成窄列）。
* 祖先 `writing-mode`：**轴是对的** —— 判据读 computed style，继承可见（note computed `wm=vertical-rl`、列 5–15、列栈 97–301px 全部 `note-ink-narrow`）。

## 守住面（真咬人，15 条）

`sideways-rl`（列 18 / 列栈 362.64px）· `vertical-lr`（20 / 403.42px）· 祖先继承轴 · 竖排 + `scaleX(<1)` · `@media 700–800` 在 760 样本档被咬 ·
容差边界（1.87px 绿 / 2.09px 红）· `min-width:1400px` 红（真的比容器窄有牙）· 父级 `direction: rtl` · 祖先 `transform scaleX(0.9)` ·
未登记声明 + `!important` · 逗号 + 不一致声明文本 · `@supports` 外层 · `columnCount = 1` 的正常单列不误报 · 列栈铺满列宽不误报 · `entries: []` fail-closed。

## 未覆盖边界（可直接抄进下一轮登记表，6 条）

未量测档位（`@media 901–1439px` 实测形态成立、全站零码）· 样本集外页面上的 760 形态（`models/deepseek-v3.2/` 探针 `wm=vertical-rl`、`179.1px`、零码）·
② 的轴可被后代 `writing-mode` desync（列 1 静默，本形态由 ① 兜住）· 生效宽 vs 声明值（`width:300px` 全绿）· 竖排 <366 字一律红（设计内的假红带）·
`sharedFooterExternalHrefs` 读的是 `ROOT/dist` 而不是 `--dir` 副本。

## 最省的绕过路径（按成本，报告 §7）

`70CH`（**2 个字符**）→ 逗号借登记（一个逗号）→ `width: 300px`（一个单位 token）→ 竖排 `nowrap + overflow:hidden`（3 个声明）→ 未量测档位（一个 `@media`）→ 注释伪造（4 个字符）→ 新增一条窄列 + 登记为 `entries[1]`（一次 JSON 编辑）。
另列「最不划算的 8 条」，用来说明哪些牙真的在咬人。

## t11 再攻击的判据（报告 §1.4，逐条）

每条破防都写了「重放同一形态时**必须出现什么码**」以及「哪些修法**不算**闭合」（例如：靠 `M15` 连带红不算闭合冻结串；把 sitemap 判据删掉不算闭合；用「凡竖排单列必红」换绿会打坏合法的单列）。
同时明确了我认为**不该为闭合而改松**的几条（`!important` 假红可以只做一行归一化或如实写进 `rule`；竖排 <366 字不是缺陷；`V4` 已由 `note-clipped` 兜住；任何修复都要整套重跑 37 条形态并核对守住面）。

## 装置与复跑

* 报告 §1.1 前置产物（Node v24.13.1 / npm 11.19.0 / `playwright-core` + `DSH_EDGE` / `build-local.js` 产出 303 文件）·
  §1.2 装置清单（`.arch-v1/*.cjs` 的接口与职责 —— gitignore scratch，本机保留）·
  §1.3 全部命令与**期望读数**（12 次门禁 + 9 次探针 + 2 个沙箱）· §1.4 t11 闭合判据。
* `attack-forms.json` 增加 `rawDefinition`（`wrap`/`spanLines`/`replace`/`replaceRe` 的逐字锚点）⇒ 即使 scratch 丢失，也能只靠证据文件重放全部形态。
* 纪律：注入器带锚点命中数守卫；每条形态只改 1 个文件；11 份副本的逐文件 sha256 台账在 `sha256-accounting.json`；`npm run check:evidence` 绿。

## 交付物

* `research/criteria-adversary-v1-report.md`（报告，含 §6 文本伪造行号审计表 + §7 绕过成本表 + §8 下一轮登记表条目 + §1.4 t11 闭合判据）
* `research/_raw/registry-adversary-v1/**`（7 个文件：`attack-forms` / `sha256-accounting` / `gate-readings` / `sandbox-readings` / `probe-readings` / `findings` / `README`）

> **请勿由本 PR 作者合并**：等 captain 验收。

