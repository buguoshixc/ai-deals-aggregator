# 二级页首屏去解释化 + 「最近变化」条件化（`secondary-page-intro-changes-v1`）

> 分支 `secondary-page-intro-changes-v1` · 基线 `origin/master = a57670d`
> · 报告日期 2026-10-08 · 口径与证据政策见 [`docs/EVIDENCE-POLICY.md`](../docs/EVIDENCE-POLICY.md)
>
> **一句话**：二级标签 / 聚合页的首屏从此只有「标题 + 条目数 + 数据更新时间」——
> 41 个页面上的解释性副标题整层删除（能留的信息进底部折叠，内部口径只留维护文档）；
> 页底「最近变化」改成**条件模块**，零变化（含日志不可用）整块不渲染，
> 有变化时最多 3 条、标题固定「最近变化」、入口复用 `/changes/`。

---

## 0. 两条规则的最终形态（写进 `docs/DESIGN-RULES.md` §8：H13 / H14）

```text
标题 + 条目数 + 数据更新时间        ← 首屏只有这三样（H13）

[摘要]  [优惠列表 / 表格]

[最近变化]                          ← 只有真的存在相关变化事件时才出现（H14）
                                    ← 标题固定「最近变化」；≤3 条；「全部变化 →」进 /changes/

› 分类说明                    展开   ← 更低层级，默认折叠

Footer
```

---

## 1. 现状实测（Before，全部来自产物与真浏览器）

| 量 | Before 读数 | 取法 |
|---|---|---|
| 首屏（`.cstop` 之后 → 首个数据区之前）有说明的页面 | **41 页**（46 个目录页中的 41 个） | `digest` 逐页扫描 + 真浏览器 `introNotes` |
| 说明块总数 | **44 条**：41 条解释性副标题 + 3 条别名页旧地址通知 | 同上 |
| 每页说明字数 | 20–41 字（厂商页 23 字；`/need/no-card/` 41 字）；别名页 192–202 字 | `digest.introSnoteText` |
| 标题底边 → 首个数据区顶边 @1440×900 | **41px**（别名页 94px） | msedge headless 实测 |
| 目录页「最近变化」模块 | **40 页全部渲染**，且 `data-topic-total="0"` | `digest.chgsecPresent` + `data-topic-*` |
| 模块的可见文本 | 每页约 100 字（标题 + 基准日 + 起算日 + 空态 + 入口） | `digest.chgsecText` |
| 模块的 CSS | 目录页 **0 条**（`.chgsec/.chgmeta/.chglist/.chgi` 只定义在 `/changes/` 的页面级 CSS 里） | `index.html` 共享样式里 0 命中 |
| 生产数据里与二级页相关的变化事件 | **0 条**（`deal-history.json` 的 4 条事件全是 `type=tool`） | `changes.buildRadar()` 现算 |

---

## 2. 修改一：顶部只留标题 / 条目数 / 更新时间

### 2.1 机制删除（不是把文字改短）

| 位置 | 改动 |
|---|---|
| `scripts/tools/build-local.js` | 删掉 `userIntro → introHtml` 那一层与模板插槽（`${aliasNote}${introHtml}${summaryHtml}` → `${aliasNote}${summaryHtml}`）；模型注释从「三层」改为「两层」，并写清首屏为什么一个字都不留 |
| `scripts/lib/audience.js` | 13 条 `userIntro` 逐条处置；文件头「三层说明模型」改写为「两层」；`NEED_PAGES` 那节的边界判据改为「首屏一个字都不写」 |
| `scripts/lib/landing.js` | 3 条（`category/api` + 两个枢纽页）与厂商页那段**算出来的** `userIntro` 逐条处置；文件头「分类页为什么大多不需要 userIntro」改写为「为什么首屏一个字都没有」 |
| `scripts/lib/vendor-page.js` | 资料区块里那句「优惠变化见本页上方的「最近变化」块」随模块**条件化**（见 §3.4） |

### 2.2 41 条说明的逐条处置（prompt §7 的判据：用户价值 → 底部折叠；内部口径 → 只留 docs）

**进底部折叠 `userNotes`（39 条）**：

| 页面（个数） | 内容类型 | 例子 |
|---|---|---|
| `/student/` `/developer/` `/free-api/`（3） | 误解说明 / 分类边界 | 「来源没提学生身份」≠「学生不能用」 |
| `/need/*`（10，含 3 个别名页） | 分类边界 / 误解说明 / 数据缺口 | 「只收来源明说『不需要信用卡』的条目；没写支付方式的条目是『尚未确认』」；「本页条目明显偏少：这是我们还没收集到」 |
| `/category/api/`（1） | 单位可比性 | 「这一页的优惠按量计费，额度单位多为 Token 或积分」 |
| `/vendor/<slug>/`（25） | 分类边界 | 「只列当前有效的优惠；已结束的条目在历史档案里」；`/vendor/deepseek/` 的资料页说明 |

**直接删除、不复制（2 条）**：`/category/` 与 `/vendor/` 枢纽页那句「只列出达到门槛、因而有独立页面的分类 / 厂商」——
渲染层已经有一条共享句（`SHARED_NOTES.hubMissing`「没有出现在这里的分类与厂商，是条目数还没有达到独立成页的门槛」）在说同一件事，
搬过去就是同一句话在页面上出现两遍。`audience-selftest` 里有一条断言把「我们决定不搬」写成了可执行形式。

**保留（唯一例外，3 条）**：别名页（`/need/student-only/`、`/need/free-api/`、`/need/dev-credits/`）顶部的
旧地址通知 `.aliasnote`。它不是解释性副标题，而是「你在哪、该去哪」的**导航更正**，那三页本身 noindex。
构建期扫描把它逐条登记成白名单，并且要求**恰好 1 条、必须带 `aliasnote` 类**（不是「跳过那一页」）。

### 2.3 实测结果

| 量 | Before | After |
|---|---|---|
| 首屏有说明的页面 | 41 页 / 44 条 | **38 页 0 条**；3 个别名页各 1 条（导航更正） |
| 标题底边 → 首个数据区顶边 @1440×900 | 41px（别名页 94px） | **9px**（别名页 61px） |
| 正文下限余量（最薄一页） | `/need/no-card/` 152 字 | **50 字**（仍为正；迁移句进折叠 ⇒ 正文长度只掉了那一句 + 空模块） |

---

## 3. 修改二：「最近变化」改成条件模块

### 3.1 判据：本页相关变化事件 ≥ 1 条，否则**逐字返回空串**

```js
const sections = view && view.availability === 'ok' && Array.isArray(view.sections) ? view.sections : [];
const rows = 按分栏顺序扁平化取前 TOPIC_CHANGES_MAX(=3) 条;
if (!rows.length) return '';          // 零变化 / 日志不可用 / 无主题：整块不输出
```

「历史日志不可用」时 `buildRadar()` 本来就产出空 sections ⇒ 与「零变化」自然收敛到同一处置。
诚实性信号保留在 `/changes/`、首页条带与变化 Feed（三处各有断言），构建期那条
「日志不可用时条带与页面必须说『没有拿到历史日志』」的断言**原样保留**。

### 3.2 标题与入口

* 标题固定 **「最近变化」**（新措辞键 `CHANGES_LABELS.recent`，权威表在 `scripts/lib/changes.js`，
  `index.html` 的受控副本同步 —— 构建期「措辞同源」断言会自动比对，漏镜像即红）。
  `build-local.js` 里注入 `「${spec.title}」最近的变化` 的那一行**删除**。
* 入口复用既有稳定路由 `/changes/`，文案沿用全站同一个词「全部变化 →」（首页条带与 `/changes/` 同词），
  **不新造** `?tag=` 之类 URL。
* 行渲染复用 `/changes/` 的 `changesRowHtml()` ⇒ 同一件事在两页上是同一个词，
  且「页面不自己造事件」这件事由「同源」直接保证。

### 3.3 轻量样式（此前这些类在目录页一条样式都没有）

`renderDirectoryPage` 的页面级 CSS 新增 9 条 `.chgtopic` 规则（hairline + 小标题 + 紧凑列表），
全部走设计 token ⇒ 亮色 / `data-theme="dark"` / 跟随系统三态自动成立；
不做卡片、不加底色、字号与 `/changes/` 同级。**不新增任何 `.snote` 规则**（冻结串纪律）。

### 3.4 顺带修掉的悬空引用

`vendor-page.js` 的资料区块原先无条件写「优惠变化见本页上方的「最近变化」块」——
模块条件化之后这句在 25 个厂商页里绝大多数会指向一块不存在的模块。
现在由 `ctx.hasTopicChanges` 决定：有那一块时保留原句，没有时**只删掉指向子句**，
不补任何关于变化的断言（「没有变化」这句话我们不能说，我们只是没有可展示的事件）。

### 3.5 实测结果

| 量 | Before | After |
|---|---|---|
| 渲染了变化模块的目录页 | 40 页（全部 `data-topic-total="0"`） | **0 页** |
| 标题形态 | 「「无需信用卡」最近的变化」（把页面名再念一遍） | 固定「最近变化」（非空分支实测） |
| 每页可见文本 | 约 100 字 | 0 字（无变化页）；非空分支 ≤3 行 |
| `/changes/` 自身 | — | **逐字节不变**（`digest` 的全部字段无差异，含分栏 / 起算日 / 免责句 / 折叠块） |

**非空分支怎么验的**（生产上当前 0 个页面有相关变化）：用**合成雷达 + 真实渲染函数**
（`changesTopicHtml()` / `changesRowHtml()`）在 `selftest:changes` ⑩ 里逐条断言
（在场 / 标题逐字 / ≤3 条 / 顺序 = `renderOrderOf()` / 每行能在事件集合里逐条命中 / 无基准日文案 / 不再是 `.snote`），
并把**真实产物 + 该函数对合成事件的输出**拼成 fixture，在真浏览器里量 1440 / 390 / 360、亮 / 暗、无 JS。
**不伪造生产事件**（合成事件只活在量测过程里）。

---

## 4. 顺带修掉的两个真实缺陷（都是「扫描面照不到」这一类）

### 4.1 `.snote` 文本容器的 class 匹配有盲区（本轮实测出来的）

构建期两处扫描用的是 `/<p class="snote"[^>]*>/`：它要求 `snote` 后面**紧跟引号**，
于是 `<p class="snote aliasnote">` **一条都照不到**。后果：`/need/free-api/` 的别名通知里那句
`（benefitType 含 free_api）` 从来没被任何守卫看见过 —— 用放宽后的 matcher 一跑就命中 1 条。
处置：两处改成 class token 级匹配（`\bsnote\b` / `\bvsnote\b`），补正反例探针（`selftest:changes` ⑪ 3 条），
并把那句内部措辞从 `scripts/data/landing-aliases.json` 里去掉（它是逐字渲染给读者的文案）。

### 4.2 45 个模型详情页正文里有字面反引号

同一处修复照出了第二个盲区：`<p class="snote mnone">` 也是多类名容器，
里面写着 `` `supportedModels` `` —— 读者看到的是字面反引号。按仓库既有约定
（「强调用 `<b>`、字段名直接写」）改成直接写字面量。**45 个页面每页恰好 −2 字符**，
这是本轮唯一一处超出两条 UX 范围的可见文本变化，已单独列出（见 §7 的允许清单说明）。

---

## 5. 受影响的门禁：重瞄而不是删除

| 位置 | 重瞄后的形状 |
|---|---|
| `build-local.js` 首屏扫描 | 从「intro 区不许有内部措辞」升级为**结构性断言**：「非别名目录页首屏说明 = 0」，白名单是现算的别名页集合（要求恰好 1 条带 `aliasnote` 类）；残留说明继续扫 8 个禁词 |
| `audience-selftest.js` §9 | `userIntro` **回流即红**；新增「原来靠首屏那句话说话的 13 个页面，删掉的内容必须落在折叠里」；新增「枢纽页没有把入口门槛那句搬进折叠」；新增「别名页『原因』文案不含内部措辞」；新增「每条按需求页仍保留机器可读 `criteria`」 |
| `verify-site.js` §15b2 无 JS 探针 | 从量「首屏那一句的字数」改为量「首屏说明条数 = 0」，保留条目 / 折叠说明 / 回跳链接三条 |
| `verify-site.js` §22c 变异牙 | M6 / M8 / M10 / M12 / M14 与 M1–M4 的第一个壳、两条正对照、负例自检靶页：`student/` → `need/student-only/`。**理由**：首屏说明删除后，非别名目录页在 `<main>` 里已经一条 `.snote` 都没有（变化块的入口也不再是 `<p class="snote">`），而别名页仍走**同一个** `renderDirectoryPage` ⇒ 四个壳的覆盖面一点没变 |

断言**只增不减**：`audience-selftest` 203 → 205 项、`changes-selftest` 101 → 119 项、
`verify-site` **861 → 862 项**（1:1 重瞄 + 1 条新增的全站首屏断言）。CI 步骤数与 `--expect-checks=38` 一项未动。

---

## 6. 数据面与 SEO truth：零变化（逐条证据）

`digest` 对 186 个页面逐字段比对（`.arch-v1/compare.cjs`，摘要见
[`research/_raw/secondary-page-intro-changes-v1/diff-verify.json`](_raw/secondary-page-intro-changes-v1/diff-verify.json)）：

| 字段 | 差异 |
|---|---|
| `kind` / `count` / 行数 / `itemIds` 集合 / 详情 `href` 集合 | **0**（854 行 / 735 个详情链接逐条相同） |
| `canonical` / `title` / `<meta description>` / `robots` | **0** |
| JSON-LD（每段 sha256，186 页 × 3 段） | **0** |
| `textFloor`（正文下限口径） | **0** |
| `pageNotesPresent` | **1** —— `/need/student-only/` 多了一块 `userNotes` 折叠（迁移的必然结果） |
| sitemap / Feed / `plans.json` / `api-plans.json` / `models.json` | 未触碰（构建期逐字节发布 + 可复现门禁全过） |
| 正文长度 | 89 页变化：45 个目录页（删说明）+ 45 个模型页（去反引号，各 −2 字符） |

装置自证：把 BEFORE 产物**重新构建一遍**（`a57670d` 的干净 worktree）再取摘要，
与原摘要**逐字段相同** —— 既证明装置可复跑，也证明构建是确定性的。

---

## 7. 验收读数

### 7.1 真浏览器（msedge headless）

| 场景 | 读数 |
|---|---|
| 首屏几何 @1440×900 | 13 条抽样路由：说明条数 1 → 0、间距 41px → 9px（别名页 94 → 61px） |
| 横向溢出 | 1440 / 390 / 360 全档 **0 页**（Before 与 After 都是 0） |
| 非空分支 fixture @1440/390/360 | 模块在场、标题逐字「最近变化」、**3 条**、「全部变化 →」右缘 374/390 与 344/360（不溢出）、模块自身溢出 0 |
| 暗色（`colorScheme: dark`） | 模块正文色 `rgb(15,23,42)` → `rgb(232,236,242)`（token 驱动），背景保持透明 —— **没有硬编码白底** |
| 无 JS（`javaScriptEnabled:false`） | 模块 / 表格 / 分类说明全在 DOM：模块 3 行 + 入口 `../../changes/`、表格行数不变、`summary.textContent === '分类说明'`、折叠正文 88–121 字可读 |
| 生产页（空分支） | 40 个目录页 `chgsecPresent = false`；「当前没有观察到变化」「为基准」「变更记录自」「最近的变化」四类串**全站目录页 0 命中** |

### 7.2 门禁与自测

| 装置 | 读数 |
|---|---|
| `verify-site.js --dir=dist` | **862 项 / 失败 0**（新增 §22c「目录页家族 45 页首屏无页面级说明 + 3 条别名页各恰好 1 条」） |
| `verify-site.js --compare`（回归） | **867 项 / 失败 0**（6 条回归读数全过） |
| `selftest:audience` | **205 项 / 0 失败**（此前 203） |
| `selftest:changes` | **119 项 / 0 失败**（此前 101；新增 ⑩ 18 条 + ⑪ 3 条） |
| `selftest:seo` / `selftest:vendor` / `selftest:models` / `selftest:archive` / `selftest:data-docs` / `selftest:planshub` | 69 / 57 / 120 / 76 / 58 / 32 项，**全 0 失败** |
| `verify:seo`（独立 SEO 门禁） | 11 项 / 0 失败 |
| `check:ci` | 38 项 / 0 失败（CI 口径一字未动） |
| `check:evidence` | 无新增 Tier-3；清单自证与基线交集逐项一致 |
| `check:reproducible` / feeds / plans / api-plans 可复现 | 全部逐字节一致 |
| **Full Gate（本地按 `.github/actions/gate/action.yml` 现读复跑）** | **51 步 · 执行 48 · 通过 48 · 失败 0 · 跳过 3**（跳过的 3 步全部是 CI 上下文专用：`${{ steps.*.outputs }}` / runner 装浏览器 / Summary 输出；浏览器可用性由第 49 步实跑 861 项证明） |

### 7.3 允许变化的范围（逐条对照 prompt §23）

```text
✅ 删除顶部 explanatory intro（41 条）
✅ 隐藏无内容的 recent changes（40 页）
✅ 简化 recent changes heading（固定「最近变化」）
✅ 简化 recent changes metadata（删掉基准日 / 起算日）
✅ 调整 recent changes 的轻量 HTML + 9 条作用域样式
✅ 顺带修掉两个「扫描面照不到」的真实缺陷（别名页文案去掉 benefitType；45 个模型页去掉字面反引号）
❌ 数据行 / 优惠标题 / 门槛 / 链接 / 排序 —— 一条没动（§6 的逐条证据）
```

---

## 8. 发布

见 [`research/_raw/secondary-page-intro-changes-v1/online-smoke.json`](_raw/secondary-page-intro-changes-v1/online-smoke.json)
（PR / CI / merge / deploy / 线上抽查的实测读数，合并后回填）。

线上抽查至少覆盖：一个无变化的 `/need/*`、`/student/` 或 `/developer/`、一个 `/vendor/*`、以及 `/changes/` 自身。

---

## 9. Remaining Risks

| # | 风险 | 现状与处置 |
|---|---|---|
| R1 | 生产数据下**没有**任何二级页存在相关变化 ⇒ 「有变化」分支只有合成 fixture 的证据 | 已用真实渲染函数 + 真浏览器 fixture 验证（§3.5）；数据侧一旦真的产生相关事件，页面会自然出现模块。**不伪造生产事件** |
| R2 | 正文下限余量变薄：`/need/no-card/` **50 字**（`/category/` 123、`/category/audio/` 123） | 迁移句进折叠 ⇒ 长度只掉那一句与空模块；构建期 `thin-content` 与 `verify:seo` 两处独立判定全过。**不调低下限公式**（`v3.0-antigaming` 有下限单调性规则）。若将来继续删正文，`/need/no-card/` 会第一个变红 |
| R3 | 日志不可用（降级构建）时二级页不再显示「没拿到历史日志」 | 本轮把它与「零变化」统一处置（判据 = 相关事件 ≥ 1 条），诚实性由 `/changes/`、首页条带、变化 Feed 承担，三处断言原样保留。若要在二级页恢复一行提示，改动量是 1 个分支 + 1 条断言 |
| R4 | 入口文案用的是「全部变化 →」而不是字面的「查看全部 →」 | 有意为之：首页条带与 `/changes/` 都用「全部变化」，同一件事同一个词。要改成「查看全部」只需加一个措辞键 |
| R5 | `origin/master` 在本轮进行中从 `a57670d` 前进到 `fa1e4ce`（docs-only，`git diff --stat a57670d fa1e4ce -- scripts index.html docs .github` 为空） | 分支基于 `a57670d`；合并前如需要可 rebase，代码面无重叠 |
