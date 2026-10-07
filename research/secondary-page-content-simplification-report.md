# secondary-page-content-simplification —— 二级数据页信息层级简化

**分支** `secondary-page-content-simplification` · **基线** `origin/master = a795ce3a4e5d3708ea3b17b2fcbb5fcb391218fe`

> ⚠️ 开工时本地 `master` 停在 `4927fe3`，**落后 origin/master 20 个提交**
> （architecture-modernization-v1 重构：新增 `lib/page-shell.js`、`scripts/test/*`、
> `docs/ARCHITECTURE.md` / `TESTING.md`）。本轮全部基于 `origin/master` 开工，
> 行号一律按当时的最新树重新定位 —— 旧行号在本轮**一处都没用上**。

---

## 0. 一句话结论

二级数据页的信息层级重新以用户任务为中心：进入页面先看到**标题 → 条目数 → 最多一句必要限制 →
数据摘要 → 表格**；分类判据、字段模型与维护边界从可见正文移进 `docs/DESIGN-RULES.md`
的**口径归档**，并且「迁移过」这件事有机器断言守着。
数据 / 路由 / 链接 / JSON-LD / sitemap / Feed **0 变化**（逐字节证据见 §6）。

---

## 1. 审计范围与三层归类

### 1.1 扫了哪些页面族（prompt §2）

| # | 路由族 | 页数 | 顶部说明的出处 |
|---|---|---|---|
| 1 | `/need/*` | 10 | `audience.js` `NEED_PAGES[].why` |
| 2 | `/student/` `/developer/` `/free-api/` | 3 | `audience.js` `COLLECTION_PAGES[].why` |
| 3 | `/category/*` | 5 | `landing.js` `CATEGORY_PAGES[].why` |
| 4 | `/category/` | 1 | `landing.js` `CATEGORY_HUB.why` |
| 5 | `/vendor/*` | 25 | `landing.js` 厂商叶子页**动态构造**的 `why` |
| 6 | `/vendor/` | 1 | `landing.js` `VENDOR_HUB.why` |
| 7 | 别名页 | 3 | 与 1/2 同注册表 + `aliasNote` |
| 8 | `/status/` | 1 | `build-local.js` `renderStatusPage()` 模板字面量 |
| 9 | `/changes/` | 1 | `lib/changes.js` `CHANGES_NOTES` + `index.html` RENDER-CORE |
| 10 | `/feeds/` | 1 | `build-local.js` `renderFeedsPage()` + `lib/feeds.js` `FEEDS_NOTES` |
| 11 | `/plans/` `/plans/coding/` `/plans/api/` | 3 | `plans-hub-page.js` / `plans-page.js` / `api-plans-page.js` |
| 12 | `/models/` + 模型详情 | 52 | `models-page.js` |
| 13 | `/archive/` `/docs/data/` | 2 | `archive.js` / `data-docs.js` |

**合计 186 个产物页面全部读过**（`readings.cjs` 的静态读数覆盖全部路由）。

### 1.2 归类结果（prompt §3 的六类）

| 归类 | 典型内容 | 处置 |
|---|---|---|
| **USER_REQUIRED** | 「没写学生身份 ≠ 学生不能用」「只收明说不需要信用卡的条目」「与首页『国内』筛选不是同一件事」「旧地址通知」 | **留在首屏**（重写为 0~1 句） |
| **USER_HELPFUL** | 「国内平台新用户免费额度多属此类」「额度按时长 / 张数 / 积分计」「K-12 与地区限制写在条目里」 | **底部折叠**（`.page-notes`） |
| **MAINTENANCE_DETAIL** | 「本页按 pricingModel 收」「首页卡片数为何少于本页条数」「厂商归一规则」「门槛 ≥2 条 / ≥3 事件」 | **维护文档** + 少量降级为折叠说明 |
| **INTERNAL_IMPLEMENTATION** | 「数据模型里没有『是否用于写代码』这个字段」「不扫标题与正文」「benefitType 含 free_api」 | **维护文档**（`ai-coding` 整段移除） |
| **LEGAL_OR_SOURCE_NOTE** | 「本站只做收录与整理…以官方页面为准」（45 页逐页重复） | **删除** —— 共享页脚 `index.html:1295` 已有一句同义声明 |
| **REDUNDANT** | 摘要卡里的 `<small>判据：type=deal 且未过期…</small>`（`title` 属性已有同一句）、题注里「每一行的依据都在对应的详情页上」 | **直接删除** |

### 1.3 逐族处置总表（prompt §33 要求的列）

| 路由族 | 改动前顶部文案（字数） | 归类 | 动作 | 改动后顶部文案（字数） | 底部处理 |
|---|---|---|---|---|---|
| `/need/ai-coding/` | 232 | INTERNAL_IMPLEMENTATION ×3 | 整段移除 | `本页条目明显偏少：这是我们还没收集到，不是没有这类优惠。`（28） | 折叠：分类边界 + 三态图例；口径进文档 |
| `/need/free-tier/` | 221 | MAINTENANCE + USER_REQUIRED | 压缩 | `「免费档」指存在一个不用付钱的档位，不等于全部功能免费。`（28） | 折叠：额度上限 / 并发 / 实名 逐条写在条目里 |
| `/need/free-model/` | 155 | USER_REQUIRED + USER_HELPFUL | 压缩 | `免费的是模型调用本身，不是账户里的额度。`（20） | 折叠 ×2：限时免费模型计费方式、清单由官方调整 |
| `/need/edu-identity/` | 181 | USER_REQUIRED + USER_HELPFUL | 压缩 | `比「学生专享」更窄：多数来源只写「在校学生」，不说要不要学校邮箱。`（33） | 折叠：K-12 与地区限制写在条目说明里 |
| `/need/no-card/` | 195 | USER_REQUIRED（三态口径） | 压缩 | `只收来源明说「不需要信用卡」的条目；没写支付方式的条目是「尚未确认」，不在这一页。`（41） | 折叠：想知道要不要卡需查官方页 |
| `/need/student-only/` | 198 | USER_REQUIRED + MAINTENANCE | 压缩 | `「来源没提学生身份」不等于「学生不能用」—— 那只说明我们没查到。`（33） | 共享折叠 |
| `/need/china-usable/` | 306 | USER_REQUIRED + MAINTENANCE（4 段） | 压缩 | `只收「已确认大陆可用」的条目，所以比首页点「国内」少；差额是尚未确认，不是不可用。`（41） | 折叠：地区限制原文摘要在某一列 |
| `/need/free-api/` | 161 | USER_REQUIRED + USER_HELPFUL | 压缩 | `「免费」的形态差异很大：一次性赠送、每日重置、限时免费、开源模型免费推理都算在内。`（38） | 折叠：注册 / 实名 / 绑卡只在来源写明时标注 |
| `/need/free-tokens/` | 192 | USER_REQUIRED + USER_HELPFUL | 压缩 | `拿到手是可以按量消耗的 Token、积分或体验金，不是一个免费档位。`（34） | 折叠：计量单位 / 重置周期 / 过期时间 |
| `/need/dev-credits/` | 198 | USER_REQUIRED + USER_HELPFUL | 压缩 | `多是云平台与开发者计划的赠金，常常要申请或满足资格（初创、开源维护者等）。`（37） | 折叠：审核时间 / 有效期 / 是否要卡 |
| `/student/` | 212 | USER_REQUIRED + MAINTENANCE | 压缩 | `「来源没提学生身份」不等于「学生不能用」—— 那只说明我们没查到。`（33） | 共享折叠 |
| `/developer/` | 133 | USER_REQUIRED + USER_HELPFUL | 压缩 | `「来源没提开发者」不等于「不能用于开发」—— 那只说明我们没查到。`（33） | 折叠：新用户免费额度的形态 |
| `/free-api/` | 183 | USER_REQUIRED + MAINTENANCE | 压缩 | `「免费」的形态差异很大：一次性赠送 Token、每月重置、限时试用都算在内。`（38） | 共享折叠 |
| `/category/api/` | 189 | USER_REQUIRED + MAINTENANCE | 压缩 | `这一页的优惠按量计费，额度单位多为 Token 或积分。`（28） | 共享折叠 |
| `/category/audio/` `/image/` `/agent/` | 152 / 130 / 127 | **全部是「为何属于这个分类」** | **整段移除**（prompt §6C） | **无**（标题 → 条数 → 摘要 → 表格） | 折叠：单位不可比 / 按张数计 / 有效期短 |
| `/category/chat/` | 133 | 同上 | **整段移除** | **无** | 共享折叠 |
| `/category/`（枢纽） | 137 | MAINTENANCE（门槛、枚举、跳过原因） | 压缩 | `只列出条目数达到门槛、因而有独立页面的分类。`（22） | 折叠 ×2：入口口径 + 「没出现的分类是没到门槛」 |
| `/vendor/`（枢纽） | 160 | MAINTENANCE（门槛、归一规则） | 压缩 | `只列出当前有效优惠达到门槛、因而有独立页面的厂商。`（25） | 折叠 ×2 + 「同名会合并到同一页」 |
| `/vendor/*` ×25 | 283（zhipu） | MAINTENANCE（归一规则、条数口径、slug / provider identity） | 压缩 | `只列当前有效的优惠；已结束的条目在历史档案里。`（24） | 折叠：非优惠资料的关联来源 |
| `/status/` | 226 | USER_REQUIRED（状态定义）+ 公开理由 | 压缩（prompt §36） | 保留三种状态各自的判据，移除「为什么要公开它」（133） | 保留 `source-health.json` 链接 |
| `/changes/` `/feeds/` | 62 / 98 | 功能说明 | **KEEP**（已简洁，prompt §37） | 不变 | 不变（`/feeds/` 的 `officialNote` 全站只出现一次，不算重复） |
| `/plans/*` `/models/*` `/archive/` `/docs/data/` | 84–121 | 功能说明 | **KEEP**（prompt §37） | 不变 | 不变 —— **刻意不为了「全站统一」强行删** |

---

## 2. 三层说明模型（prompt §21）

```
intro                 → 用户可见，极短        → 注册表 userIntro → <p class="snote">（0~1 句）
secondary explanation → 可折叠 / 底部          → 注册表 userNotes + 共享句 → <details class="page-notes">
maintenance           → docs / code           → docs/DESIGN-RULES.md §8「二级数据页口径归档」
```

**字段改名**：`why: string[]` → `userIntro: string` + `userNotes?: string[]`，覆盖 6 处定义
（`COLLECTION_PAGES` / `NEED_PAGES` / `CATEGORY_PAGES` / `CATEGORY_HUB` / `VENDOR_HUB` /
厂商叶子页构造）。理由：`why` 这个名字本身在邀请作者写「论证我为什么这么分」——
正是本轮要消灭的行为。改名是**有界的**（6 处定义 + 1 处渲染 + 2 处自测），并配一条
**「旧字段回流即红」**的断言收口。

**配置层没有大迁移**（prompt §24）：只拆出确实降低混淆的两个字段；`description` /
`criteria` / `heading` / `title` **一个都没动**。

---

## 3. 底部说明只保留三类（prompt §7/§8）

```html
<details class="page-notes">
  <summary>分类说明</summary>
  <p class="pnote">同一条优惠可能同时出现在多个标签页。</p>
  <p class="pnote">表格里写「尚未确认」的字段表示我们没查到依据，不代表不可用。</p>
</details>
```

- **A 分类边界**：`同一条优惠可能同时出现在多个标签页。`
- **B 来源与条款**：**不进折叠块** —— 由共享页脚 `index.html:1295`
  （`优惠信息来自各厂商官方页面与公开折扣页，最终以官方页面为准。`）统一承担，
  45 个目录页 + `/status/` 上逐页重复的那句删除（prompt §19/§20）。
- **C 误解说明**：三态图例、单位不可比、门槛口径等。
- **没有用户价值的内容直接不展示**（prompt §22）：`/category/chat|audio|image|agent`
  与 `ai-coding` 的顶部说明是**删掉**的，不是搬进折叠块。

### ⚠️ 为什么折叠块**不能**用 `.snote` 类（两个硬约束，都是实测得出的）

| 约束 | 依据 |
|---|---|
| 闭合 `<details>` 里的 `.snote` 会被 §22c 判成 `note-unrendered` | `verify-site.js` 的 `visibleTextOf()` **直接遍历 DOM 子节点**，不看 `display`、也不看 `<details>` 开合 ⇒ `rendered=false` + `textLength>0` + `glyphRects=0` 三条同时成立。所以内层正文用 `.pnote` |
| 外层 `<details>` 也刻意**不带** `.snote` | 否则会扰动 §22c 的 `notes` 索引、`WIDE_SNOTE_FROZEN` 计次与 M1–M13 变异牙的靶位 |

折叠**不影响**无 JS 可读性，也不影响正文下限：`prerenderedText()`（构建期）与
`seo.js` 的 `visibleText()` 都只剥 script/style/注释/标签 ⇒ `<details>` 的正文照样计入。
这是本轮敢用折叠的前提。

---

## 4. 验收读数（Before → After）

### 4.1 首屏几何 @1440×900（prompt §13/§14）

| 路由 | intro 字数 | intro 行数 | caption 字数 | 标题底边 → 首个数据区（px） | 页高（px） | 正文余量（字） |
|---|---|---|---|---|---|---|
| `/student/` | 212 → **33** | 2 → **1** | 95 → 7 | 60.78 → **40.39** | 1902 → 1837 | 986 → 554 |
| `/developer/` | 133 → **33** | 1 | 95 → 7 | 40.39 | 5878 → 5775 | 2540 → 2137 |
| `/free-api/` | 183 → **38** | 2 → **1** | 95 → 7 | 60.78 → **40.39** | 4340 → 4291 | 2018 → 1580 |
| `/need/edu-identity/` | 181 → **33** | 2 → **1** | 115 → 6 | 60.78 → **40.39** | 1292 → 1244 | 839 → 512 |
| `/need/free-tier/`（免费额度） | 221 → **28** | 2 → **1** | 116 → 7 | 60.78 → **40.39** | 6729 → 6680 | 3397 → 2918 |
| `/need/free-model/`（免费模型） | 155 → **20** | 2 → **1** | 116 → 7 | 60.78 → **40.39** | 1724 → 1675 | 944 → 555 |
| `/need/ai-coding/`（编程开发） | 232 → **28** | 2 → **1** | 115 → 6 | 60.78 → **40.39** | 1066 → 1017 | 638 → 242 |
| `/need/no-card/` | 195 → **41** | 2 → **1** | 115 → 6 | 60.78 → **40.39** | 900 | **514 → 152**（最紧） |
| `/need/china-usable/` | 306 → **41** | 3 → **1** | 116 → 7 | 81.17 → **40.39** | 3487 → 3417 | 2404 → 1857 |
| `/need/dev-credits/`（别名页） | 198 → 37 † | 2 | 63 | 113.56 → 93.17 | 5858 → 5734 | 2544 → 2115 |
| `/category/`（枢纽） | 137 → **22** | 2 → **1** | 64 → 8 | 60.78 → **40.39** | 900 | **333 → 146**（最紧） |
| `/category/api/` | 189 → **28** | 2 → **1** | 95 → 7 | 60.78 → **40.39** | 3638 → 3573 | 2447 → 1957 |
| `/vendor/`（枢纽） | 160 → **25** | 2 → **1** | 65 → 9 | 60.78 → **40.39** | 1550 → 1536 | 913 → 725 |
| `/vendor/zhipu/` | 283 → **23** | 3 → **1** | 95 → 7 | 81.17 → **40.39** | 2646 → 2577 | 2217 → 1742 |
| `/status/` | 226 → **133** | 2 | 28 | 60.78 | 1106 | 756 → 628 |

† 别名页（`/need/student-only/` `/need/free-api/` `/need/dev-credits/`）的**首个** `.snote`
是「旧地址」通知（USER_REQUIRED，刻意保留原样），不是 intro —— 表里那一列量的是它。

**首个数据区明显提前**：26 条样本路由里，桌面档 40.39px 是新的**下界**
（标题块底边 → `.lsum` 顶边 = 一段 1 行说明 + 段间距）；改动前同一批是 60.78–113.56px。

### 4.2 三档视口（prompt §15/§16）

| 路由 | 视口 | intro 行数 | 首个数据区距离 | 页高 | 横向溢出 |
|---|---|---|---|---|---|
| `/vendor/zhipu/` | 390×844 | **9 → 1** | 203.52 → **40.39** | 4021 → **3580**（−441） | 0 |
| `/need/ai-coding/` | 390×844 | **8 → 1** | 183.13 → **40.39** | 1616 → **1310**（−306） | 0 |
| `/student/` | 390×844 | **7 → 2** | 162.73 → **60.78** | 2643 → **2267**（−376） | 0 |
| `/category/api/` | 390×844 | **6 → 1** | 142.34 → **40.39** | 6386 → **5976**（−410） | 0 |
| `/need/free-model/` | 390×844 | **6 → 1** | 142.34 → **40.39** | 3053 → **2676**（−377） | 0 |
| `/need/ai-coding/` | 1280×800 | 3 → 1 | 81.17 → 40.39 | 1105 → 1017 | 0 |
| `/free-api/` | 1280×800 | 2 → 1 | 60.78 → 40.39 | 4398 → 4291 | 0 |
| 其余 1440/1280 样本 | — | ≤2 | ≤40.39 | 略降 | 0 |

**窄屏收益最大**（同一段文字在窄屏折行更多），三档 **0 横向溢出**。

### 4.3 页面高度

- 桌面档：−65 ~ −103px（`/status/` 不变；`/need/no-card/` 与 `/category/` 页高本来就等于一屏）。
- 390×844：**−306 ~ −441px**。
- 首页 `/`：**4787px，一字节未动**（本轮没有改 `index.html`）。

---

## 5. 门禁改动（prompt §30）

### 5.1 重新瞄准的既有断言（**没有一条是被简单删掉的**）

| 断言 | 改动前 | 改动后 |
|---|---|---|
| `audience-selftest.js`「每条 why 至少三句」 | `why.length >= 3`（方向与本轮相反） | **换成 7 条方向相反的断言**（见 §5.2） |
| `verify-site.js` §15b2 需求页探针 | `innerText.includes('这一页')` + 断言名「能读到**判据说明**」 | **重瞄**为「能读到条目 + 首屏那一句 + 底部折叠说明」。命名也改了 —— 旧断言在改动后**仍然会绿**（`这一页` 由**表头**「为什么在这一页」保证），但**它声称守的东西已经不在页面上**，属于「数错了东西的断言」 |
| `build-local.js` `thin-content` 下限 | `page.kinds.textFloor()` | **公式一字未改**，作为删除预算的承重闸门 |

### 5.2 新增断言

| 码 / 断言 | 位置 | 判据 | 实测 |
|---|---|---|---|
| **R2** 首屏无内部实现措辞 | `build-local.js` 产物自检 | 45 个目录页 × 8 个禁词（`数据模型` `benefitType` `predicate` `collections` `关键词扫描` `映射表` `字段` `归一规则`），扫描面**只限 intro 区**；`判据` **不在禁词表**（它是业务语义） | **45 页 × 8 词，0 命中**（白名单 0 条） |
| **R2′** 注册表级同名断言 | `audience-selftest.js` §9 | 4 张注册表 × 6 条形状断言（含 `userIntro ≤ 60 字`、旧的 `why` 回流即红、口径归档逐页可查） | **203 项全过** |
| **R1** `note-intro-long` | `verify-site.js` §22c | intro 区首个数据区之前的 `.snote` **≤ 2 行**；前置条件 **阅读列宽 ≥ 1100px** | @1440 **0 条 / 0 页**、@1600 **0 条 / 0 页** |
| **R1 的牙** `M14` | 同上 | DOM 注入填充正文，只推高行数、其余量一个不动 | **实测 `[note-intro-long]`**（隔离命中，无伴随码） |
| **R1 的适用范围自检** | 同上 | 同一段 3 行说明：`introIndexes=[0]` 报、`introIndexes=[]` 不报 | 通过 |
| **违规码自检** | 同上 | 12 个码全部可达、不多不少 | 可达 **12/12** |
| **Markdown 扫描面** | `build-local.js` | `.snote` / **`.vsnote`** / `<caption>` / **`<details>`** | 全站 **0 命中**（扩面前实测漏掉 25 页，见 §7） |

### 5.3 R1 的适用范围：**门禁抓出来的第一个真实缺陷就是这条判据自己**

`note-intro-long` 的第一版**没有**限定阅读列宽，结果：

```
@1440 / @1600  全站 0 命中          ← 正确
@760           4 条命中
@360          17 条命中             ← 错
```

命中的还**大多是本轮根本没改过**的页面（`/plans/` `/models/` `/docs/data/` `/changes/`
`/feeds/` `/status/` —— 都是 prompt §37「已经简洁、KEEP」的那一批）。原因很朴素：
**同一段文字在窄屏上必然折成更多行**，那是响应式排版的正常行为，不是缺陷。

修法与 §22c 既有的 R3-1 同一种写法 —— **物理前置条件**而不是视口白名单：
实测列宽 1440 档 1120–1380px、1600 档 1240–1500px、760 档 676–728px、360 档 276–328px，
取 `WIDE_INTRO_MIN_COLUMN = 1100` 一刀切开。

> 这条留在这里当记录：**一条在正常页面上失败的守卫比没有守卫更糟**（本仓库的既有判词）。
> 判据自己也要被咬 —— 它这次是被真实的门禁读数咬住的，不是被评审读出来的。

---

## 6. HTML 内容等价策略（prompt §28/§29）

装置：`research/secondary-page-content-simplification-verify/diff-verify.cjs`（一次性，不进 CI）。
以改动前产物为 `dist.baseline`（186 页），逐项对账：

| 检查项 | 读数 |
|---|---|
| 非 HTML 产物**逐字节相同**（36 个 Feed × 2 格式 / sitemap / JSON / logo 资产 / 图片） | **117/117** |
| **JSON-LD 三段逐字节相同**（prompt §26） | **186/186** |
| **`data-item` / `data-child` 行集合相同**（prompt §11） | **186/186** |
| **全部 `href` 集合相同**（prompt §11） | **186/186** |
| **canonical / `<title>` / `meta description` / `robots` 相同**（§25/§27） | **186/186** |
| HTML 逐字节相同（**原样**） | **140/186** |
| HTML 逐字节相同（剥掉 **Diff Allowlist** 后） | **186/186** |

### Diff Allowlist（prompt §29，共 5 条，全部登记理由）

1. intro 说明（首个数据区之前的 `.snote`）
2. 底部说明（旧的 `<p class="snote" style="margin-top:…">`）
3. 折叠说明（`<details class="page-notes">`）
4. 题注与摘要小字（`<caption>`、`.lsum` 项上的 `title` 与 `<small>`）
5. **Markdown 强调 ⇄ `<b>`**（两侧同等归一）—— 对应 §7 那个顺带修掉的厂商页缺陷

> 归一后 186/186 相同，意味着**改动一处都没有溢出 allowlist**：
> 页头、页脚、表头、面包屑、JSON-LD、订阅标签、分析注入、行内容全部逐字节原样。

---

## 7. 顺带修掉的真实缺陷（prompt §18 文案验收）

**`vendor-page.js:324`**（改动前）：

```js
const changesBlock = `<p class="vsnote">优惠变化见本页上方的「最近变化」块。下面两支来自**套餐变化日志**与 **API 计费变化日志**`
  + `（同一份事件、同一套措辞，这一层只搬运）。</p>
```

**没有过 `rich()`**，于是 **25 个厂商页**上读者看到的是字面的星号：

```html
<p class="vsnote">…下面两支来自**套餐变化日志**与 **API 计费变化日志**…</p>
```

实测证据（改动前的 `dist/vendor/zhipu/index.html`，剥掉 style/script 后仍有该串），
25 个厂商页**无一例外**。

**它为什么逃过了既有守卫**：构建期的「作者正文无 Markdown 记号」扫描面当时只有
`.snote` / `<caption>`，`.vsnote` 不在里面。**两处都修了**，并把扫描面同时扩到
`<details>`（本轮新建的容器 —— 一个非贪婪 `<p class="snote">…</p>` 正则照不到它）。

修后：`下面两支来自<b>套餐变化日志</b>与 <b>API 计费变化日志</b>`，全站作者容器内
字面 `**` **0 处**。

---

## 8. 维护口径没有丢（prompt §9）

`docs/DESIGN-RULES.md`：
- §8 新增规则 **H11**（含依据与验证方式，符合该文件的收录纪律）；
- 新增附录 **「二级数据页口径归档」**，共 **21 条**逐 slug 条目，保存全部被移出页面的
  MAINTENANCE_DETAIL / INTERNAL_IMPLEMENTATION 原文（含 `ai-coding` 的「唯一没有字段支撑 /
  不扫关键词 / 补法是给采集侧加字段」、`no-card` 的三态口径、`china-usable` 的
  `region ≠ chinaUsable` Schema 契约、`free-tier` 的字段口径、厂商归一规则、
  分类门槛与跳过原因、单位不可比的换算禁令）。

**「说迁移了」与「真的迁移了」有机器断言区分**：`audience-selftest.js` §9 逐页断言
「每个 slug 在口径归档里都有对应条目」，缺一条即红。归档标题格式是被断言解析的
（`^#### \`slug\``），所以「把归档删了但自测没改」也走不通。

同时更新：`docs/SCHEMA-v1.1.md`（§10.4 扫描面、§11.4 断言表）、
`docs/ARCHITECTURE.md` §9（改文案 / 改口径的落点速查）。

---

## 9. 明确**没有**改的东西（prompt §10/§11/§12/§25/§26/§27/§31）

| 类别 | 证据 |
|---|---|
| 分类逻辑（`needsOf()` `collectionsOf()` `NEED_PREDICATES` `COLLECTION_PREDICATES` `CATEGORY_PREDICATES` 厂商映射） | 一个字符未改；`needs` 分布与改动前逐条相同（`student-only 12 · edu-identity 7 · no-card 1 · china-usable 30 · free-tier 60 · free-api 45 · free-tokens 44 · ai-coding 4 · free-model 12 · dev-credits 67`） |
| 数据（Deals / Plans / API Plans / Models / Registry / History / Coverage / Feeds） | `deals.json` 等来源文件未被本分支触碰；`dist/deals.json` 等 117 个非 HTML 产物**逐字节相同** |
| 页面标题语义 | `heading` / `title` 一处未改（"教育身份可领取的 AI 优惠" 仍是原文） |
| JSON-LD | **三段逐字节相同，186/186** |
| sitemap / Feed / canonical | **逐字节相同**（它们都在那 117 个非 HTML 产物里） |
| SEO 结构 | `canonical` / `<title>` / `meta description` / `robots` 全部相同 |
| `index.html` | **完全未改**（共享页脚已有免责声明，不需要动它） |
| 对抗性 CSS Mutation 面（`writing-mode` / `clip-path` / `mask` / 伪元素） | **没有扩张**（prompt §31）—— 本轮的新牙 `M14` 是 **DOM 注入**，不是 CSS 变异 |

---

## 10. 复现命令

```bash
git worktree add .worktrees/secondary-page-content-simplification \
  -b secondary-page-content-simplification origin/master

# Before：基线产物 + 读数
node scripts/tools/build-local.js && cp -r dist dist.baseline
node research/secondary-page-content-simplification-verify/readings.cjs \
  --dir=dist.baseline --label=before --out=research/_raw/secondary-page-content-simplification/before.json

# After：重建 + 读数 + 内容等价 + Full Gate
node scripts/tools/build-local.js
node research/secondary-page-content-simplification-verify/readings.cjs \
  --dir=dist --label=after --out=research/_raw/secondary-page-content-simplification/after.json
node research/secondary-page-content-simplification-verify/diff-verify.cjs \
  --base=dist.baseline --dir=dist --out=research/_raw/secondary-page-content-simplification/diff-verify.json
npm run gate       # 读 .github/actions/gate/action.yml，本地 ≡ CI
npm run verify:regress
```

原始读数：`research/_raw/secondary-page-content-simplification/` 下的 `before.json` · `after.json` ·
`diff-verify.json`，以及 [full-gate-summary.txt](secondary-page-content-simplification-verify/full-gate-summary.txt)
与 [verify-site-readings.txt](secondary-page-content-simplification-verify/verify-site-readings.txt)。

> **为什么证据分两处**（照仓库既有惯例）：`.gitignore:93-95` 会把 `research/_raw/**` 下的
> `.txt` / `.log` / `.cjs` 全部忽略（那是「Tier-3 一次性产物」的分类，由 `check:evidence` 守着），
> 只留 `.json`。所以**读数 JSON** 放 `_raw/`，而**一次性装置与文本读数**放
> `research/<轮次>-verify/` —— 与上一轮的 `research/architecture-modernization-v1/verify/` 同一形状。
> 完整日志（`full-gate.log` / `verify-after-*.log`）按同一规则不入库，只在本机留痕。
