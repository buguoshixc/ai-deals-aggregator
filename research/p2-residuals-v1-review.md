# p2-residuals-v1 独立 review（t13）

> **对象**：`p2-residuals-v1`（t4）—— PR #62，合并提交 `33d2472`（mergedAt 2026-10-08T10:11:37Z）。
> **复核者**：`notes-manifest-engineer`（t3 的实现者，**不是** t4 的实现者）。
> **复核方式**：在**自己的 worktree**（`.worktrees/p2-review`，detached @ `33d2472`）里**自己跑数**，
> 不复用 t4 的探针与结论；牙全部在 `.arch-v1/` 的**副本**里构造。
> **verdict：`pass`**（19 条读数逐条复现、5 颗牙实跑变红并逐字节还原、两条「如实偏差」的登记属实；
> 另附 2 条**非阻断**的收口改进项与 6 条我**没能**验证的东西）。
>
> 机读证据：`research/_raw/p2-residuals-v1-review/readings.json` · `research/_raw/p2-residuals-v1-review/teeth.json`。
> 一次性探针（不进库）：`.arch-v1/rev-*.cjs` 与它们的 `.log`。

---

## 0. 为什么在 `33d2472` 上复核，而不是当前 master

当前 master（`95dfeb9`）已经含 **t3（notes-manifest-v1）**，那会让两处读数与 t4 报告不同：
`verify-site` 会报 **880** 项、`dist` 会多一个 `_notes.ndjson`（303 → 304 个文件）。
那两处差异是 t3 自己的、有报告记录的产物面变化，**不是 t4 的读数错误** —— 所以本轮把复核钉在
**t4 的合并提交**上，并在基线侧用 `4b366d2` 的干净检出（已核：`git diff 4b366d2 e455b3a -- scripts/ index.html package.json`
为空 ⇒ 与 PR #62 的父提交**同源**）。

环境：Windows · Node v24.13.1 · 全部读数本机跑出（CI 侧另有 §1 末那条证据）。

---

## 1. 关键读数逐条复现（我自己跑出来的值）

| # | t4 报告的读数 | **我复现到的值** | 复现方式 |
|---|---|---|---|
| 1 | 新检查码 `thin-content-margin`（27 → 28） | 基线树 `PROBLEM_CODES.length` = **27**；复核树 = **28**；构建日志逐字 `✓ SEO 安全门禁: 28 个检查码 × 186 个页面全过` | 读模块导出 + 实跑构建 |
| 2 | 余量登记 **6 页** | **6 页，逐条 ★一致**（chars / floor / margin 三个数逐值相同） | 自写计数器 + 自判 count（`.arch-v1/rev-margins.cjs`） |
| 3 | `/need/no-card/` **710 − 660 = 50** | **710 − 660 = 50**（我的计数器数到 710；`textFloor('need',1)` = 600+60×1 = 660） | 同上 + 直接读 `page-kinds.textFloor` |
| 4 | 次薄 **123**；第 7 页起 **409** | 升序：50 · 123 · 123 · 136 · 139 · 142 · **409**（`need/edu-identity/`）—— 150 以下正好 6 页 | 全站 186 页普查 |
| 5 | `selftest:seo` **69 → 87** | 基线 **69 / 0**；复核树 **87 / 0** | 两棵 worktree 各跑一次 |
| 6 | `verify:seo` **11 → 17** | 基线 **11 / 0**（`--dir=dist.master`）；复核树 **17 / 0**（`dist 文件数: 303`） | 同上 |
| 7 | `verify-site --dir=dist` **874 / 0** | **874 项 / 0 失败** | `--json=.arch-v1/rev-verify.json` |
| 8 | `check:ci` **39 / 0** | **39 项 / 0 失败**（`--expect-checks=39`） | 任务 Verify 行指定的调用 |
| 9 | 产物 **303/303 逐字节未变** | 复核树 dist：**303 文件 / 20,282,063 B / 全树摘要 `75ecb983…`**；基线树（我在 `4b366d2` 上亲手构建的 `dist.master`）：**同一摘要**；逐文件对账：只在 A **0** / 只在 B **0** / 同名不同内容 **0** | 自写 digest + 自写 diff |
| 10 | `selftest:changes` **119（不该变）** | 两棵树都是 **119 / 0** | 同上 |
| 11 | `check:evidence` 绿 | ✅ 无新增 Tier-3（1283 个已跟踪全在清单内）+ 清单自证通过 | 复核树 |
| 12 | e3：入口锚 **4 个 / 3 页**、逐字「全部变化 →」 | **4 个锚 / 3 页**（`/` · `/plans/`×2 · `/plans/coding/`），**4/4 逐字都是「全部变化 →」** | 自写扫描（`.arch-v1/rev-wording.cjs`） |
| 13 | e3：「查看全部」产物 **0 处**（静态 DOM 0 / 含 script 模板 0） | 静态 DOM **0 页** · 原始文件（含 `<script>` 模板）**0 页** | 同上 |
| 14 | `plans-hub-page.js:251` 是硬编码字面量 | 逐字确认：`<p class="snote"><a href="…changes/">全部变化 →</a> ·`（无措辞键）；`seo-selftest` 的登记断言确实只放行这一处 | 读源码 + 牙 `literal-second-site`（见 §2） |
| 15 | §7-3：`check-ci-consistency.js:191` 的注释漂移（写 27，实际 28） | L191 逐字 `// v1.7 新增：SEO 门禁自测（27 个检查码逐条定向篡改 + …` ⇒ **漂移真实**（且与 `check:ci` 39/0 无关） | 读文件 |
| 16 | §1.2：`--print-floor-margins` 打印的块可逐字贴回 | 打印 **6 行**，与 `seo.js` 的 `TEXT_FLOOR_RESIDUALS` 声明**逐行相同**（`逐行相同=true`） | `.arch-v1/rev-validate.cjs` ④ |
| 17 | §1.3：`thin-content-margin` 在**构建期**也会响 | 在源码级副本里改数据（title 砍 12 字）⇒ 构建 **exit 1**：`✗ SEO[thin-content-margin] need/no-card/：可见正文 698 字符，下限 660，余量 38 < 登记值 50` | 牙 `build-thin-content-margin` |
| 18 | §1.3：条数涨也走同一条路（`count` ↑ ⇒ 下限涨得比正文快） | 直接调 `seo.validate()`：`count=2` 时同时出现 `thin-content`（710 < 720）与 `thin-content-margin`（带「本页是 kind=need count=2」那一支的措辞） | `.arch-v1/rev-validate.cjs` ③ |
| 19 | 自审 §3-6 的跨平台风险（Ubuntu 上字面量位置断言） | PR #62 的 gate run **37760907386 = pass（4m34s，Ubuntu）** ⇒ 该风险已由 CI 证据闭合 | `gh pr checks 62` |

**一条被我自己先弄错的读数（写下来，避免下一个人重复）**：我第一版手写扫描只数到「2 个锚 / 2 页」，
与报告的 4 / 3 对不上 —— 原因是两条锚的 href 形如 `../changes/#plans`（**带片段**），而我的正则
要求 `changes/"` 引号紧跟。修正后 4 / 4 逐字一致（`.arch-v1/rev-anchors.cjs` 把差异查到了底）。
**报告这一项是对的，错的是我的扫描。**

---

## 2. 牙：抽查（实际做了 **5 颗 + 1 条阴性对照**）

纪律：全部构造只发生在 `.arch-v1/` 下的副本；每颗牙都是「构造 → 实跑 → 记录红 → 逐字节拷回 → 复跑绿 → 核对 sha256」。
复核树自身的 `dist` 全程摘要不变（`75ecb983…`），`git status` 只剩本轮新增的两个交付文件。

| # | 牙 | 沙箱 | 实跑读数 | 还原 |
|---|---|---|---|---|
| ① | `/need/no-card/` 说明砍 **8 字**（710 → 702） | 产物副本 | **exit 1**：`[thin-content-margin] need/no-card/ 可见正文 702 字符，下限 660，余量 42 < 登记值 50`；`按码统计：{"thin-content-margin":1}` ⇒ **`thin-content` 保持沉默** | 逐字节 ✅ / 复跑绿 ✅ |
| ② | `/plans/` 入口改名「查看全部 →」 | 产物副本 | **exit 1**：两条 §③‴ 都点名 `plans/` | 逐字节 ✅ / 复跑绿 ✅ |
| ③ | 往 `/need/no-card/` 注入零变化空壳模块 | 产物副本 | **exit 1**：`✗ H14 条件模块…need/no-card/：data-topic-total=0 ⇒ 零变化却渲染了模块；…shown=0…` | 逐字节 ✅ / 复跑绿 ✅ |
| ④ | **构建期**：改数据（title 砍 12 字） | 源码副本 | **构建 exit 1**：`✗ SEO[thin-content-margin] … 698 字符 … 余量 38 < 登记值 50` | 逐字节 ✅ / 重建绿 ✅ |
| ⑤ | 在 `scripts/lib/` 加**第二处**「全部变化 →」字面量 | 源码副本 | **exit 1**：`✗ …位置 = 登记的那一处（plans-hub-page.js） —— models-page.js, plans-hub-page.js` | 逐字节 ✅ / 复跑绿 ✅ |
| 阴 | 砍**不在登记表里**的一页 12 字 | 源码副本 | **exit 0** —— 与「登记只覆盖余量 < 150 的 6 页」一致（见 §4 观察 2） | 逐字节 ✅ |

另外两条与该轮结论直接相关的实跑（放在 `teeth.json` 的 `build-nolog-dataset-manifest`）：

```console
# 源码级副本里把 scripts/data/deal-history.json 移走再构建
⚠️  历史日志不可用（文件缺失）——本次产物里没有变更记录，check:history 会报错
❌ 构建失败：Error: Dataset Manifest 形状不合法（1 处）：
  - dataset deal-history: 缺少 updatedAt
「=== 4) 产物自检 ===」出现 = false
```

⇒ t4 报告 §2.2′ 的三条读数（认出了日志不可用 / 却在更早一步中止 / 自检与 SEO 门禁都没跑到）**逐条复现**。

> ③ 的第一次注入我插错了位置（文件里第一个 `<h1>` 在**内联的 RENDER-CORE 脚本字符串**里，
> 剥掉 script 后不在 DOM 里 ⇒ 判决为绿）。改成插在最后一个 `</main>` 之前后立刻变红。
> **这条差异说明的是「注入要落在真 DOM 里」，不是判据的问题** —— 与 t4 §3.3 的读数没有矛盾。

---

## 3. 两条「如实偏差」的诚实性判断

### ① 日志不可用时构建在 Dataset Manifest 步失败 ⇒ 诚实性措辞永远上不了线

**判断：登记属实、没有被轻描淡写**（在报告正文里甚至是最醒目的一处新发现）。

- 我独立复现了它（§2 末）：日志缺失 ⇒ 构建在 `buildManifestFromRegistry` 那一步抛
  `dataset deal-history: 缺少 updatedAt` ⇒ `=== 4) 产物自检 ===` 整节不出现 ⇒ 那条「日志不可用」的
  诚实性自检与 SEO 门禁都没跑到。
- 报告把它写在 §0 结论表（e2 行）、专门开了 §2.2′（标题就写着「这一半是**防御性分支**，在产物上到不了」），
  并在 §7 第 1 条列成「需要 captain 排下一轮」的第一项，给了 (a)/(b) 两条路线与自己的偏好。
- 自审 §1.5 把结论**拆成两半**（「渲染口径一致」= 有出处；「构建链不一致」= 新发现的残留），
  并明确写「我没有把第 2 条说成『H14 被违反』，也没有把第 1 条说成『一切正常』」。
- **唯一的弱处在 §8.4**（建议粘进 `NEXT-STEPS.md` 的收口原文）：② 那一行写「✅ 已收口 … **无需修复**」，
  没有带上 §2.2′ 这条**活着的**残留。若逐字粘贴，收口记录会读成「三条 P2 全部收口、无需修复」，
  与 §7-1「待 captain 拍 (a)/(b)」自相矛盾。→ 见 §4 观察 1（低，非阻断）。

### ② `plans-hub-page.js:251` 硬编码字面量 ⇒「唯一出处」不完全成立

**判断：登记属实、没有被轻描淡写**，而且是**可检查的**登记，不是一句说明。

- 逐字确认：入口写成 `<a href="…changes/">全部变化 →</a>`，**没有**读 `CHANGES_LABELS.all`。
- 报告 §0 表 e3 行直接写「**但「唯一出处」不完全成立**（有 1 处硬编码字面量，如实登记）」，
  §3.1 把「措辞的声明处」列成 4 行（3 个措辞键 + 1 处字面量），§3.2 专门讲这一处偏差，
  §7 第 2 条给出最小补丁，§8.2 的 H15 行里**也**带上了这句偏差 —— 三处都说了，没有藏。
- 而且它**不是**「只登记在文档里」：`seo-selftest` §七 有一条断言把 `scripts/lib/` 里字面量的位置
  钉成 `plans-hub-page.js` 一处。我实跑验证这条断言会咬人（牙 ⑤）：加第二处 ⇒ 立刻红并点名两处文件。
- 结论：这一条是**诚实且可执行**的登记（「新增第二处 = 红」是机械保证，不是承诺）。

---

## 4. 非阻断的改进项（`pass` 也不该丢掉的）

> 这两条都**不构成** `needs_revision`：它们不改实现、不改判据语义，也不影响任何读数；
> 但都会影响**收口文件读完之后的印象**，所以请 captain 在收口时带上。

### 观察 1（severity: low）—— 收口原文 §8.4-② 会把一条活着的残留写成「无需修复」

- **file**：`research/p2-residuals-v1-report.md` **§8.4** 的 ② 行（该块自称「可以直接粘贴」）
- **problem**：该行写「② **不可用日志的处置**：与 **H14** 一致（…），**无需修复**」，
  没有提 §2.2′ / §7-1 那条残留（「日志不可用 ⇒ 构建在 Dataset Manifest 步失败 ⇒ 诚实性措辞到不了读者眼前」）。
  报告正文是诚实的，但收口记录若照抄这一行，会把**未决**写成**已决**。
- **requiredFix（建议）**：把 §8.4 的 ② 行改成
  「渲染口径与 H14 一致（真函数三层实跑：不可用 ⇒ 0 字节、零变化 ⇒ 0 字节、正对照 478 字节）；
  **构建链上仍有一处残留**：日志不可用时构建在 Dataset Manifest 步失败（`dataset deal-history: 缺少 updatedAt`），
  诚实性措辞上不了线 —— 见 §2.2′ 与 §7-1，待 captain 拍 (a) 让它上线 / (b) 把 fail-closed 写成策略」。

### 观察 2（severity: low）—— 登记表可以**静默缩小**（表外的页面没人看）

- **file**：`scripts/lib/seo.js` 的 `TEXT_FLOOR_RESIDUALS`（6 条）+ `scripts/tools/seo-selftest.js` §六
- **problem**：两条实测事实：
  1. 断言只把 **`/need/no-card/`** 钉在表里（「不许静默下架」），其余 5 条连同行带 JSON 转写一起删掉时，
     `selftest:seo` / `verify:seo` 都**保持全绿**（自审 §2 表里写了「两份一起改 ⇒ 这条挡不住」，
     但没有点明「于是登记范围可以悄悄缩水」这个后果）；
  2. 我实测：砍**不在表里**的页面 12 个字 ⇒ 构建**不红**（阴性对照）。
     于是「登记范围：全站余量 < 150 字的**全部**页面」读起来像一条不变式，实际是**一次普查的结论**：
     表外的页面只有 `thin-content`（下限本身）看着。
- **requiredFix（下一轮，可选二选一）**：
  - **(a) 把它变成可检查的不变式**：`seo-verify.js` §③′ 已经有 `descriptors`（含 kind/count）与 `textFloor`，
    再加一条「**登记集合 == 实时余量 < 150 的页面集合**」即可 —— 这样「静默下架一页」立刻红；
    代价是数据变化让某页从 160 掉到 145 时会要求登记（那正是这张表想要的行为）。
  - **(b) 或者把边界写死进收口文件**：「登记范围是 2026-10-08 的普查结论；表外页面只由 `thin-content` 守；
    新增登记是一次显式动作」。
- 附带一条**不是缺陷**的观察：表内的 6 页里，有几页的余量会随**数据**变化（`count` ↑ ⇒ 下限 ↑），
  处置是「补内容或显式重新登记」——报告 §1.2 已写明两条路都要被人看见，`--print-floor-margins`
  的粘贴块我也验证过与声明逐行相同；所以这条只记边界，不算问题。

---

## 5. 我没能验证的东西（明确边界，别当成已验证）

1. **e2 的「真函数三层实跑」原读数（0 字节 / 0 字节 / **478 字节**）没有独立复现**：
   那是 t4 自己的一次性探针（`p4-e2-unavailable.cjs`，不在仓库里）。我复核的是它的**判据出处**
   （`changes-selftest` 的 R2/R2b/R2c/R2d 全在且 119/0）与产物侧的自洽断言（§③″ 在 `verify:seo` 17/0 里）。
   也就是说：**「模块在场时能渲染出 478 字节」这句话我没有自己跑出来**。
2. **§2.2′ 的「坏 JSON」变体没复现**：我只跑了「文件**缺失**」那一支（读数与报告一致）；
   报告说损坏 JSON 还会额外打一行日志，那一行我没有独立看到。
3. **重新登记的端到端流程没演练**：我验证了 `--print-floor-margins` 打印的 6 行与声明**逐行相同**，
   以及「改登记值 ±1 会让边界那页变红/变绿」（t4 的自测里有），但**没有**真的走一遍
   「改 `seo.js` → 刷 `text-floor-margins.json` → 复跑」的完整流程（t4 自审 §3-5 也把它列为未验证）。
4. **e3 的「7 个渲染源文件 0 处『查看全部』」没有逐文件核**：我核的是**产物侧 0 处**与
   **`scripts/lib/` 里字面量只有一处**（并用牙证明那条断言会咬人）。
5. **`check:ci` 的 39 条断言内容没有逐条读**：我只核了「39 项 / 0 失败」这个读数与任务指定的调用方式；
   §7-3 那条注释漂移（27）我做了事实核对，但没有把它的影响面展开（它是注释，不参与判据）。
6. **没有跑 Full Gate 的 L1–L5 全量**：本轮跑的是与本轮改动直接相关的那批（§1 的 19 条）。
   `verify:regress` / L5（线上冒烟）由 CI 与 release 线覆盖 —— PR #62 的 gate 是绿的（§1 第 19 条）。

---

## 6. 复现命令（每一条都能自己跑出上面的数）

```console
# 复核树：.worktrees/p2-review（detached @33d2472）· 基线树：.worktrees/nm-baseline（@4b366d2）
node scripts/tools/build-local.js
node scripts/tools/seo-selftest.js                     # 87 / 0
node scripts/tools/seo-verify.js --dir=dist            # 17 / 0
node scripts/tools/verify-site.js --dir=dist --json=.arch-v1/rev-verify.json     # 874 / 0
node scripts/tools/check-ci-consistency.js --expect-checks=39                    # 39 / 0
npm run check:evidence
node scripts/tools/changes-selftest.js                 # 119 / 0

# 我自写的复核探针（只在 .arch-v1/，不进库）
node .arch-v1/rev-margins.cjs        # 自写计数器 + 自判 count：6 页逐条 ★一致
node .arch-v1/rev-digest.cjs dist --out=.arch-v1/rev-head.json
node .arch-v1/rev-diff.cjs .arch-v1/rev-base.json .arch-v1/rev-head.json          # 逐文件 0 差异
node .arch-v1/rev-wording.cjs        # 4 锚 / 3 页；「查看全部」0
node .arch-v1/rev-validate.cjs       # thin-content-margin 两条路径 + 打印块逐行相同

# 牙（全部在 .arch-v1/ 的副本里；跑完会从源树逐字节拷回）
node .arch-v1/rev-teeth.cjs          # ① 砍 8 字 ② 改名 ③ 空壳模块
node .arch-v1/rev-sbx-thin.cjs       # ④ 构建期（改数据）
node .arch-v1/rev-tooth-literal.cjs  # ⑤ 第二处字面量
node .arch-v1/rev-sbx-tests.cjs      # 日志缺失那一支（如实偏差 ①）
```

**复核过程对仓库的改动**：`dist/` 与 `scripts/` **一个字节都没动**（复核树 dist 全树摘要在全部实验前后
同为 `75ecb983…`；`git status` 只剩本轮新增的 `research/p2-residuals-v1-review.md` 与
`research/_raw/p2-residuals-v1-review/`）。
