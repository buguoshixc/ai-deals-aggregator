# T9 §19/§20 只读审计摘要

扫描范围：`index.html`、`scripts/**`，共 215 个文件；只读，未改动任何生产源码。

## 一、六个类名的重复度清单（`layout-rule-inventory.json`）

| 类名 | 产物样式里的声明处数 | 不同规则体 | 复制多出来的份数 | 含宽度声明 | 判定 | 本次是否处理 |
| --- | --- | --- | --- | --- | --- | --- |
| `.snote` | 2 | 2 | 0 | 是 | 唯一出处（含宽度的规则 1 条；另 1 条是不含宽度的修饰类 .snote.chgwarn） | **是** |
| `.ph2` | 9 | 5 | 4 | 否 | 同一条规则被复制（多处逐字相同） | 否 |
| `.plist` | 8 | 2 | 6 | 是 | 同一条规则被复制（多处逐字相同） | 否 |
| `.stop` | 15 | 3 | 12 | 否 | 同一条规则被复制（多处逐字相同） | 否 |
| `.cstop` | 3 | 3 | 0 | 否 | 同一类名的多处不同规则（各自页面壳独有） | 否 |
| `.detail-main` | 1 | 1 | 0 | 是 | 唯一出处 | 否 |

逐类说明：

- `.snote`：本次的主角：**宽度声明只剩 1 处**（index.html:734，唯一的 `max-width: none`）；另一处 `.snote.chgwarn` 是颜色修饰、不含宽度。8 份页面级副本已删除 ⇒ 唯一出处。
- `.ph2`：4 份逐字复制 + 5 处带父级作用域的变体（`.pchanges .ph2` / `.pplandeals .ph2` / `.phubsec .ph2` / `.asec .ph2`）；全部无宽度声明 ⇒ 不产生布局漂移。
- `.plist`：4 份逐字复制（都带 `max-width: none`，**取值一致**）+ 4 份 `.plist b`；取值一致 ⇒ 无漂移，本次故意不动。
- `.stop`：5 份逐字复制（`.stop` / `.stop h1` / `.stop .meta` 各 5 份，分布在 status / plans / api-plans / plans-hub / models）；全部无宽度声明。
- `.cstop`：目录页壳里的 `.stop` 版本，单处、无宽度、无副本。
- `.detail-main`：唯一出处（index.html:725），本次之前就已经是唯一出处，不需要改动。

### 同一条规则被逐字复制的组

- `.stop` ×5：`.stop { display: flex; align-items: baseline; gap: var(--s2); flex-wrap: wrap; margin-bottom: var(--s2); }`（无宽度声明）
  - 出处：scripts/tools/build-local.js:1054 (shell-status) · scripts/tools/build-local.js:1611 (shell-plans-coding) · scripts/tools/build-local.js:1742 (shell-plans-api) · scripts/tools/build-local.js:1885 (shell-plans-hub) · scripts/tools/build-local.js:2002 (shell-models)
- `.stop` ×5：`.stop h1 { font-size: 19px; margin: 0; }`（无宽度声明）
  - 出处：scripts/tools/build-local.js:1055 (shell-status) · scripts/tools/build-local.js:1612 (shell-plans-coding) · scripts/tools/build-local.js:1743 (shell-plans-api) · scripts/tools/build-local.js:1886 (shell-plans-hub) · scripts/tools/build-local.js:2003 (shell-models)
- `.stop` ×5：`.stop .meta { color: var(--mut); font-size: var(--fs-sm); }`（无宽度声明）
  - 出处：scripts/tools/build-local.js:1056 (shell-status) · scripts/tools/build-local.js:1613 (shell-plans-coding) · scripts/tools/build-local.js:1744 (shell-plans-api) · scripts/tools/build-local.js:1887 (shell-plans-hub) · scripts/tools/build-local.js:2004 (shell-models)
- `.ph2` ×4：`.ph2 { font-size: 15px; margin: var(--s4) 0 var(--s2); }`（无宽度声明）
  - 出处：scripts/tools/build-local.js:1620 (shell-plans-coding) · scripts/tools/build-local.js:1745 (shell-plans-api) · scripts/tools/build-local.js:1888 (shell-plans-hub) · scripts/tools/build-local.js:2005 (shell-models)
- `.plist` ×4：`.plist { margin: 0; padding-left: 1.15em; color: var(--mut); font-size: var(--fs-sm); line-height: 1.8; max-width: none; }`（**含宽度声明**）
  - 出处：scripts/tools/build-local.js:1621 (shell-plans-coding) · scripts/tools/build-local.js:1746 (shell-plans-api) · scripts/tools/build-local.js:1889 (shell-plans-hub) · scripts/tools/build-local.js:2006 (shell-models)
- `.plist` ×4：`.plist b { color: var(--ink2); }`（无宽度声明）
  - 出处：scripts/tools/build-local.js:1622 (shell-plans-coding) · scripts/tools/build-local.js:1747 (shell-plans-api) · scripts/tools/build-local.js:1890 (shell-plans-hub) · scripts/tools/build-local.js:2007 (shell-models)
- `.ph2` ×2：`.pchanges .ph2 { margin: 0 0 var(--s2); }`（无宽度声明）
  - 出处：scripts/tools/build-local.js:1529 (shell-plans-coding) · scripts/tools/build-local.js:1913 (shell-plans-hub)

### 「同一类名的多处不同规则」（各自页面壳独有，不算重复）

- `.cstop`：3 处 —— .cstop / .cstop .meta / .cstop h1

## 二、`max-width` 普查（`narrow-width-census.json`）

合计 **37** 条声明。

- 按分类：页面容器 5 · 局部组件 8 · 响应式断点 13 · 阅读列 7 · 其它 4
- 按单位：px 20 · keyword 10 · ch 5 · em 2
- 按来源：rule 19 · media-condition 13 · media-inner-rule 5

### `ch` 单位的全部 5 条

- scripts/tools/build-local.js:1516 .pdetailbody → max-width: 72ch; [阅读列]
- scripts/tools/build-local.js:2717 .lsum li small → max-width: 34ch; [局部组件]
- scripts/tools/verify-site.js:6814 .snote ~ .snote → max-width: 70ch; [其它]
- scripts/tools/verify-site.js:6817 .snote:not(:first-of-type) → max-width: 70ch; [其它]
- scripts/tools/verify-site.js:6820 .snote → max-width: 70ch; [其它]

### `%` 单位的全部 0 条

- （本仓库没有任何 `%` 单位的 max-width 限宽）

### 独立对照：裸文本 `max-width:` 计数 ↔ 解析器分类（逐文件，差额必须为 0）

方法：裸文本正则数 `max-width:` 的出现次数（不经 CSS 解析器）↔ 解析器的五个账目桶（注释 / 规则声明 / @media 条件 / 声明片段）逐文件对账

| 文件 | 裸文本出现次数 | 注释里 | 规则声明 | @media 条件 | 声明片段 | 未解释差额 |
| --- | --- | --- | --- | --- | --- | --- |
| `index.html` | 19 | 1 | 12 | 6 | 0 | 0 ✅ |
| `scripts/lib/page-kinds.js` | 2 | 2 | 0 | 0 | 0 | 0 ✅ |
| `scripts/tools/build-local.js` | 15 | 0 | 8 | 7 | 0 | 0 ✅ |
| `scripts/tools/verify-site.js` | 12 | 4 | 4 | 0 | 4 | 0 ✅ |

**全部对账通过**：没有"解析器漏掉的 max-width"。


### 附带交代：表类名族 `.ptable` / `.stable` / `.ctable`（本次故意不动）

- `.ptable`：42 处声明 / 22 个不同规则体 / 复制多出来 20 份 / 含宽度声明：是
  - ×3：`.ptable { overflow: visible; }`
  - ×3：`.ptable { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); bord…`
  - ×3：`.ptable caption { text-align: left; color: var(--mut); font-size: var(--fs-sm); padding: 0 0 var(--s2); }`
- `.stable`：8 处声明 / 8 个不同规则体 / 复制多出来 0 份 / 含宽度声明：是
- `.ctable`：9 处声明 / 9 个不同规则体 / 复制多出来 0 份 / 含宽度声明：是

## 三、明确保留的局部窄宽（`retained-narrow-widths.json`）

- `.lsum li small { max-width: 34ch; }`（scripts/tools/build-local.js:2717）
  - 保护什么：目录页家族（<slug>/、/need/<slug>/ 等）顶部「本页摘要条」里每一项的第二行小字：它是**一个计数卡片的副标题**，不是页面说明。
  - 为什么可以保留：① 它是 `<li>` 里的 `<small>`，盒子本来就只有一个卡片宽（几百 px），34ch 在这里等于「最多两行小字」——限制的是卡片内部的换行节奏；② 页面级说明 `.snote` 与它同级存在，宽度由共享规则（max-width: none）给出，不受这条影响；③ 去掉它会把这行小字拉成整张卡片的宽度，摘要条的每一格高度参差，反而是退步。
- `.pdetailbody { max-width: 72ch; }`（scripts/tools/build-local.js:1516）
  - 保护什么：套餐对比页里**展开行**的详情正文（`<div class="pdetailbody">`，见 lib/plans-page.js）：一行表格展开后的一小段字段清单。
  - 为什么可以保留：① 它是**表内展开区**，不是一个页面的正文列 —— 页面说明与它不同轴的那件事在这里没有发生；② 它服务的是一小段「字段: 值」清单，72ch 是行长的可读上限（同一行的其它单元格仍在表格里）；③ 这条宽度与主数据区没有竞争关系：展开区的父级就是表格单元格。（实测比例由 T4 独立复核，本清单只做静态归属与理由。）
- `.ptable thead th:nth-child(2), .ptable tbody td:nth-child(2) { max-width: 10em; }`（scripts/tools/build-local.js:1575）
  - 保护什么：窄屏（≤760px）下套餐/计费宽表的**第二列粘性单元格**：`position: sticky` 的单元格必须有一个有限的宽，否则长文本会把整张表撑开、横向滚动失效。
  - 为什么可以保留：① 它只在 `@media (max-width: 760px)` 里生效，是**响应式修复**而不是全局限宽；② 去掉它会让粘性列按最长内容撑宽，直接把手机端变成横向滚动条（这正是本仓库反复踩过的坑）；③ 它限制的是一个单元格，不是页面内容列。
- `.ptable thead th:first-child, .ptable tbody th:first-child { (相邻规则) width: 6.5em; }`（scripts/tools/build-local.js:1572,1791,2036）
  - 保护什么：同一张宽表的第一列（平台名）在窄屏下的列宽 —— 与上一条是一对：第一列 6.5em，第二列从 6.5em 起粘、限 10em。
  - 为什么可以保留：① 同上：只在 ≤760px 生效；② 两列粘性必须给出确定宽度才能成立；③ 不是页面内容列。
- `.search { max-width: 440px; }`（index.html:284）
  - 保护什么：顶栏搜索框的最大宽度：`flex: 1` 会让它在宽屏上吃掉整条顶栏，440px 是它作为**控件**的合理上限。
  - 为什么可以保留：① 控件尺寸，与页面内容列无关；② 窄屏（≤940px）里另有 `.search { max-width: none; min-width: 100% }` 覆盖它 —— 说明这条本来就是「宽屏下的上限」；③ 页面说明不经过它。
- `.cmpchip { max-width: 210px; }`（index.html:968）
  - 保护什么：对比条里每个已选条目的标签：配合 `overflow: hidden; text-overflow: ellipsis`，长标题只裁切不撑宽（横向溢出为 0 的关键之一）。
  - 为什么可以保留：① 它是省略号生效的前提（没有宽度就没有「省略」）；② 限的是一个 chip；③ 去掉它会撑破对比条并造成页面级横向滚动。

## 四、结论（`conclusion.json`）

- 「页面级说明被 `ch` 限宽」的同缺陷残留：**0 处**（预期 0）。
- 其中被排除的测试夹具命中 3 处（verify-site.js 的变异载荷，是牙不是残留）：
  - scripts/tools/verify-site.js:6814 .snote ~ .snote → max-width: 70ch; [其它]
  - scripts/tools/verify-site.js:6817 .snote:not(:first-of-type) → max-width: 70ch; [其它]
  - scripts/tools/verify-site.js:6820 .snote → max-width: 70ch; [其它]
- 「阅读列」类选择器上仍有 `ch` 限宽（§20 允许的局部保留）：1 处
  - scripts/tools/build-local.js:1516 .pdetailbody → max-width: 72ch; [阅读列]
- 同义规则扫描：PASS：0 处新增同义规则
  - 产物里 `.snote` 的规则定义有几处？ → 唯一出处（index.html:734（共享 <style>））
  - `.detail-main`（详情内容列）的规则定义有几处？ → 唯一出处（index.html:725（共享 <style>））
  - 有没有第二条规则再给 `.snote` 设宽度？ → 唯一出处（index.html:734 那条（max-width: none）之外没有第二条）
  - 本次是否引入了第三/第四套同义规则（例如「居中列」的第二种写法）？ → 0 处新增同义规则（本次没有新增任何居中/限宽机制：`.detail-main` 仍是唯一的居中内容列，`.snote` 只是从 8 份副本收成 1 条既有取值）

## 五、本次故意不动（`notTouched`）

- **ph2-plist-stop-cstop-ptable**：.ph2 / .plist / .stop / .cstop / .ptable* 仍是多个页面壳各自复制一份的规则
  - 理由：本次的目标是**减少布局漂移风险**，不是「代码更漂亮」。这五组类名里只有 `.plist` 带宽度声明，而且四处逐字相同（`max-width: none`）—— 四份相同取值不会产生漂移；真正的漂移来自「同一条规则、两种取值」（`.snote` 就是这样：4 份 70ch + 4 份 none）。把它们一并收口需要改动 5 个页面壳的样式抽取顺序与作用域（局部规则与共享规则的选择器优先级、`${extraCss}` 注入点都要重新论证），收益是「更整齐」，风险是**新的、没有被本次变异牙覆盖的回归面** —— 所以本次故意不动。
- **local-shell-extraction-order**：各页面壳「共享 <style> → 页面局部 <style>」的抽取顺序与会话作用域
  - 理由：它已经是被验证过的机制（`.detail-main` 一直靠它工作）；改它会牵动全部 186 个页面，超出「布局漂移治理」的范围。
- **verify-site-fixtures**：verify-site.js 里的 CSS 文本（变异锚点 / 断言载荷，如 WIDE_SNOTE_FROZEN、`.detail-main` 的三处 anchor）
  - 理由：它们是**测试工具的输入**，不是产物样式定义。它们**必须**逐字引用产品规则（否则变异就锚不住）；把它们「去重」等于把变异牙拆掉。本审计把它们单独归类（fixtureMentions），不计入重复度。

未分类条目：0（0 表示每条 max-width 都有分类，六类名条目都有判定）。
