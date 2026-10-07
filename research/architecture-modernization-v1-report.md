# architecture-modernization-v1 · 最终报告

> **版本名**：`architecture-modernization-v1`
> **基线**：`e0ca04a`（`origin/master`，2026-10-07）
> **分支 / 工作树**：`architecture-modernization-v1` / `.worktrees/architecture-modernization-v1`
> **最终判定**：**PASS WITH DEFERRED**（P0 = 0 · P1 = 0 · REPAIR_NOW = 0；5 条 DEFERRED，见 §14）
> 配套文档：审计 `research/architecture-modernization-v1-audit.md` · 自审 `research/architecture-modernization-v1-self-audit.md`

---

## 1. Baseline（实测，非估计）

| 项目 | 值 |
|---|---|
| baseline SHA | `e0ca04a` |
| Node / npm | v24.13.1 / 11.19.0 |
| `package-lock.json` sha256 | `47C3A2F0…125028` |
| 工作树 | 干净（6 项 untracked 遗留，未纳入本轮） |
| `scripts/**/*.js` | 165 个 / 89,505 行 · 489 条 require 边 |
| **循环依赖 / `lib→tools` 违规** | **0 / 0**（← 推翻了计划里「层次混杂」的前提） |
| build | **2.9s**，产物自检全过 |
| verify（真浏览器） | **106.7s / 852 项全过** |
| 门禁链（45 个 node 步骤） | **263.8s** 全过 |
| 产物 | `dist/` 303 文件 / **186 个 HTML** |
| 稳定 ID | deal 138 · model 51 · plan 44 · apiPlan 24 |
| sitemap / 根 feed | 183 URL / 80 条目 |
| 最大两个文件 | `verify-site.js` **8,057 行** · `build-local.js` **6,677 行**（含 **9 份完整 document 组装**） |
| 门禁 action | 553 行 / 48 步 / **45 个冻结脚本路径** |
| `research/` 已跟踪 | 2,190 文件（Tier-3 类别 1,283 个） |

---

## 2. Architecture Audit（Phase 1）

产出 `research/architecture-modernization-v1-audit.md`（487 行），覆盖 A–P 共 16 个模块，
每个给出「当前职责 / 不该承担 / 依赖谁 / 被谁依赖 / 状态 / 原因 / 风险 / 目标边界」。

**审计用证据推翻了 3 条计划前提**（这是审计最有价值的部分）：

| 计划前提 | 实测 | 后果 |
|---|---|---|
| 「层次混杂、需要重建分层」 | 0 环 / 0 违规 / 489 边全部单向 | Domain 重构**降级为 DEFER（最终未做）** |
| 「布局族没有正式声明」 | 已存在（`page-kinds.js` 的 `LAYOUT_FAMILIES` + 正反完整性断言 + 双门禁） | **删掉**这条计划中的 fitness test（避免同一不变量第三处证明） |
| 「`.snote` ×8 等 CSS 重复」 | PR #46 已修；真实重复面是另外 **13 个选择器**（其中 5 个声明体分歧） | Workstream C 收窄为「分类 + 保留」，不合并分歧项 |

审计还确定了 **7 条硬约束**（45 个冻结脚本路径、gate job 名、`--expect-checks=38`、
deploy 链、npm scripts / CLI / report shape），并据此导出 **shim 政策**（只允许 2 个 thin entry）。

---

## 3. Architecture Before

```
index.html（源模板：共享 CSS + 主题脚本 + 页脚片段 + RENDER-CORE + 标记）
        │
        ▼
build-local.js（6,677 行）
   ├── 9 个 renderer，各自拼一份完整 <!DOCTYPE>…</html>（9× head / header / footer / finalizePage）
   ├── 自带 resolveRouteHrefs() + finalizePage()
   ├── assemble()（~1,390 行编排）
   └── selfCheck()（~2,380 行产物自检）
        ↓
scripts/lib/**（52 模块，分层干净）
        ↓
dist/**
```

具体重复（迁移前实测**逐字相同**）：9 次抽共享 `<style>`/主题脚本/页脚、9 次
`footerRaw.replace(…'见首页'…)`、9 次 `finalizePage(页脚, route, prefix)`、
9 份 `<header class="top">` 与 `<div class="wrap"><main>` 脚手架。

另有：`verify-site.js` 单文件 8,057 行 / 484 个 `check()`；**没有**「本地跑一遍 CI 门禁」的入口；
证据靠逐目录白名单 + 记得别 add。

---

## 4. Architecture After

```
index.html（源模板，不变）
        ↓
scripts/lib/*-page.js（页面正文：纯函数）
        ↓
scripts/lib/page-shell.js  ← **唯一 document 出口**（<!DOCTYPE 在全仓生产模块里只有这一处）
        ↓
scripts/tools/build-local.js（编排；渲染器已瘦身，`<!DOCTYPE` 0 处）
        ↓
dist/**（暂存 → 自检 → 原子替换）
```

新增的横向能力：

```
scripts/test/layers.js   层归属的唯一出处（L1–L6）
scripts/test/run.js      分层跑 / **--gate：解析 action.yml 跑 CI 门禁本体**
scripts/test/fitness.js  4 条架构不变量
scripts/test/smoke.js    L5 线上冒烟（关键页、HTTP、不重复 Full Gate）
scripts/tools/check-evidence.js  Tier-3 拦截（只拦基线之后新进的）
docs/{ARCHITECTURE,TESTING,BUILD,EVIDENCE-POLICY}.md  4 份权威文档
```

---

## 5. Build System 改了什么

**已完成（真实收益）**：
- 9 个页面族的文档组装全部收敛（`<!DOCTYPE` 9 处 → **0 处**）；
- `resolveRouteHrefs()` / `finalizePage()` 的本地副本删除，唯一实现在页壳；
- `renderModelsShell`（105 行、自带第二份文档脚手架）→ `renderStaticPage`（参数映射，走页壳）；
- 页面级 CSS 提成具名常量（`STATIC_PAGE_CSS` / `PLANS_TABLE_CSS`），与 git 原件**逐字节核对过**。

**未完成（DEFERRED，见 §14-D2）**：`assemble()` / `selfCheck()` / 写入面仍在同一文件，
5 个族的页面正文也仍在里面。理由是模块级可变状态（`DIRECTORY_PAGES`/`PLAN`/`VENDOR_KEY_OF`/`OUT`）
使搬迁必须先做一次「显式传参」改造，与「行为等价」硬约束正面冲突。

`build-local.js`：**6,677 → 6,345 行**（−332），且减少的是**重复**而不是功能。

---

## 6. Page System 改了什么

新增 `scripts/lib/page-shell.js`（~340 行），**唯一**产出完整 HTML document 的模块。

| 设计决定 | 理由 |
|---|---|
| **两条入口共用一份实现**：`docStart/docEnd`（正文留原地）与 `renderPageShell({bodyHtml})` | 前者让 9 族迁移的 diff 最小（正文不搬家），后者给「正文是一个值」的场景 |
| 布局族**不在页壳里声明**，按 `kind` 查 `page-kinds.js` | 声明表已是唯一出处；查不到即**硬失败**（不回落默认族） |
| `detail` 族必须有内容列 class | 缺了就是「详情页悄悄渲染成宽页」这种静默缺陷 |
| `feedTagsHtml`/`jsonLdHtml`/`headerExtra`/`extraCss`/`extraScript`/`extraTailHtml` 由调用方**预渲染** | 页壳只拥有「脚手架 + 顺序 + 属性落位」，不重新推导业务判断（订阅标签有 6 种取法） |
| `renderStaticPage` 的 `kind` 显式传入 | 不再靠「传不传 mainClass」暗示 —— 忘了传的症状是详情页渲染成宽页 |
| 首页**不纳入**页壳 | `index.html` 本身就是源模板，走 marker 替换；这条不对称是固有的，记为 DESIGN_ACCEPTED |

---

## 7. Domain Boundaries 改了什么

**一行未改。** 审计的 (a)(b) 两条判据（≥2 renderer 派生同一字段 / renderer 重算了 lib 已派生的字段）
都没有实例，所以按 §19「只有真实职责才抽象」**不做**。
真值边界（`firstSeen ≠ releasedAt`、采集失败 ≠ 优惠结束、`catalogStatus`/`coverageStatus` 派生、
归档是派生视图）全部保持 —— 15 份数据文件逐字节一致即为证。

---

## 8. Test Architecture 改了什么

**新增分层（L1–L6）+ 本地门禁链**：
- `scripts/test/layers.js` 是**层归属的唯一出处**（L1 2 个 · L2 27 · L3 9 · L4 2 · L5 1 · L6 清单）；
- 分层判据是「**它需要什么才能跑**」，与门禁自己的步骤顺序一致 ⇒ L1+L2 在没有 `dist/` 时也必须全绿；
- `npm run gate` **解析 `.github/actions/gate/action.yml`**（唯一出处）跑门禁本体，
  非 node 步骤明确列出跳过原因。**本轮之前这个入口根本不存在** —— 这正是 §29-Q5 答不上来的根因。

**新增架构不变量（只 4 条）**：依赖方向 · renderer 纯度 · 唯一 document 出口 · 分层表完整性。
收录标准写死在 `fitness.js` 头注释里（真实边界 + **没有别人会红** + 今天真的成立），
并**显式列出刻意不收的 4 条**及各自的 owner。

**Mutation 治理**：清单从源码派生（不另立手写目录）；CORE/REGRESSION/ADVERSARIAL/THEORETICAL
四类与「新增前的四个问题」「什么时候不该加」写进 `docs/TESTING.md`。
§22b 的 M1–M5 判为 **REGRESSION**（守护 commit `f2dec0c` 记录的真实回归）留在 required CI。

---

## 9. CI 改了什么（保守）

| 动了 | 没动 |
|---|---|
| gate action **+2 步**（Architecture fitness / Evidence policy），同步 `GATE_STEP_NAMES` + `GATE_STEP_RUN` | job 结构、必需检查名 `gate`、任何冻结的 `run:` 体、`--expect-checks`（仍 38） |
| — | 三个调用方各调一次门禁 action 的关系 |

新增的是**步骤**不是**断言**，所以项数不变 —— 已用
`node scripts/tools/check-ci-consistency.js --expect-checks=38` 自证（38/38）。

**没做**（并有理由）：不拆 `gate:fast/build/browser/release` 为独立 CI job —— 会破坏
「必需检查名 `gate`」与「一处实现三个调用方」两条不变量，收益（并行）远小于风险。
改成了**本地的分级门禁**。也没接 `upload-artifact`（见 §14-D5）。

---

## 10. Evidence Governance 改了什么

三层政策（`docs/EVIDENCE-POLICY.md`）+ `.gitignore` 从**逐目录白名单**改成**按类别**
（`research/_raw/**/*.txt|*.log|*.cjs`、`research/**/scratch/`）+ 一条机器判据：

`npm run check:evidence` 取「当前已跟踪 ∩ Tier-3 类别」与基线 `e0ca04a` 比对 ——
基线内 **1,283 个** grandfather 放行，基线之后新进的**硬失败**。
它已进 CI 门禁。

**明确不做**：不删、不 untrack、不重写历史（删证据会让历史报告里的引用失效）。
grandfather 边界写成**常量 SHA** 而不是「policy 文档首次加入的提交」（后者自指，
文档一移动边界就静默变了而没有任何东西会红）。

---

## 11. Compatibility

| 契约 | 状态 |
|---|---|
| 45 个门禁冻结脚本路径 | **全部保持可执行**（只允许 2 个 shim 的政策最终**只用了 0 个** —— 渲染器迁移没有改变任何文件路径） |
| `npm scripts` 既有 113 个名字 | **一个都没改**；新增 15 个 |
| CLI 参数（`--out/--dir/--url/--json/--compare/--shots/--keep`） | 不变 |
| `verify-site.js --json` 报告 shape | 不变（`{target,generatedAt,total,failed,metrics,checks[]}`） |
| `--compare` 的 7 条回归判据 | 不变 |
| `verify.yml` 的 job id/name / 无 job 级 if / 无 paths 过滤 | 不变 |
| `deploy.yml` 的 workflow_run 桥接与 needs 链 | 不变 |

**唯一的兼容性破损**（已修）：`archive-selftest.js` 的一条断言 grep 构建源码里的
`renderModelsShell({` —— 随改名同步更新，守住的性质不变。

---

## 12. Behavior Equivalence（四维独立证据）

对 **186 条路由**与 **15 份生产数据文件**做的比对（基线 = `e0ca04a` 构建产物）：

| 维度 | 判据 | 结果 |
|---|---|---|
| 语义指纹 | visible text / links / canonical / hreflang / JSON-LD（类型 + ItemList 成员）/ `data-item` 行 id / 稳定 ID / `data-*` / feed 标签 / `<main>` class | **186 / 186 一致** |
| CSS | 每页全部 `<style>` 规范化后逐字节 + 选择器集合 | **186 / 186 一致** |
| 生产数据 | 15 份文件的 sha256 | **15 / 15 逐字节一致** |
| 路由 / sitemap / feed | 集合与条目 id | 186 / 183 / 80 全一致 |

**外部门禁**：852 项真浏览器断言全过 · 门禁链全过 · clean build A == B。

**没有**发现任何稳定 ID / 路由 / SEO / Feed / History / Coverage 的非预期变化。
**没有**发现需要记录的 `OUT_OF_SCOPE_DATA_FINDING`。

---

## 13. Performance（Before → After）

| 指标 | Before | After | 变化 |
|---|---|---|---|
| build | 2.9s | **~2.9s** | ±0 |
| verify（真浏览器，852 项） | 106.7s | **~119s** | +12%（**同一台机器上多次测量波动 107–120s**；本轮未改 L4 的任何断言，差异在噪声带内） |
| 门禁链（node 步骤） | 263.8s（45 步） | **277.1s（50 步）** | **+5.0%**（其中 2 个新步骤 <0.2s，其余为波动） |
| CI | 未测（本轮未触发远端 CI） | 未测 | — |

**未超过 25% 阈值**，因此不触发「必须分析原因」的条件。
诚实说明：`verify` 与门禁的绝对秒数受本机负载影响明显，上表按同一台机器上的多次测量取代表值。

---

## 14. Deleted Dead Code / Kept Large Modules / Risks

### 删除（4 个文件 / 102,940 B）

`history-nonempty-e2e.js`（62,868）· `audience-backfill.js`（34,638）·
`audience-restore-history.js`（4,115）· `rows-by-link.js`（1,319）

**六条判据全部满足**（无 require、无 package script、无 workflow、无 registry discovery、
无 dynamic load、**无 docs promise**）。

### 确认身份而不是删（6 个）

`restore-from-git` / `audience-overrides-extract` / `probe-offers` / `inspect-source` /
`backfill-cards` / `study-site` —— 文档承诺过（第 6 条不满足），因此处置是
在 `docs/BUILD.md §8` 里**写清身份、用途与危险度**，让「提过但没接线」的中间态消失。

### 保留的大模块与理由

| 模块 | 行数 | 为什么留 |
|---|---|---|
| `verify-site.js` | 8,058 | L4 的唯一实现；852 项断言的「一项都不能静默减少」需要逐段搬家 + 逐项对账，工作量与本轮全部已完成工作相当 ⇒ **DEFERRED** |
| `build-local.js` | 6,345 | 编排 + `selfCheck` + 写入面；搬迁受模块级可变状态牵制 ⇒ **DEFERRED** |
| `check-ci-consistency.js` | 1,785 | 38 条断言是「口径唯一出处」的载体，按设计就该集中 |
| `coverage-report.js` / `coverage-targets-selftest.js` | 1,827 / 1,705 | 报告器与门禁各一份，职责不同（审计已复核不是重复证明） |
| `model-registry.js` | 1,924 | 身份与显式映射的唯一判据 |

### 风险登记（全部有缓解）

| 风险 | 缓解 |
|---|---|
| 45 个冻结路径 + 冻结 `run:` 体 | 本轮**一个路径都没改**；测试文件不迁移 |
| 9 份文档的**真实差异**（robots/hreflang/OG/canonical/6 种 feed 取法/页面脚本/main class） | 页壳把差异**显式参数化**，预渲染字符串传入 |
| CSS 是重构最易静默漂移的部分 | **两次实测踩中**（27 页 + 1 页溢出）；据此新建 CSS 级对比工具，最终 186/186 一致 |
| 新增 gate 步骤牵动 3 张冻结表 | 已同步并自证（38/38） |
| 分层表成为第四份平行注册表 | 只补「层归属」；用一条断言绑定既有两处；「被门禁跑到」方向仍归 `check-ci-consistency` |
| 主检出在 OneDrive 同步区 + 6 个 worktree | 全程在独立 worktree；构建走既有原子替换 |

### DEFERRED 清单（5 条，每条有边界 + 技术理由 + 触发条件）

| # | 项 | 触发条件 |
|---|---|---|
| D1 | CSS 分歧项未合并（5 个同选择器不同声明体，含 `.pchgtype` 同名不同组件） | 当某规则被**第二个布局族**需要时，按「先证明同值」逐条合并 |
| D2 | `build-local.js` 未拆成 `scripts/build/*` | 下一轮专项，且**先为 `selfCheck` 建立黄金输出基线** |
| D3 | `verify-site.js` 未拆分（8,058 行 / 484 `check()`） | 与 D2 同批（同一套「先冻结基线再搬」手法） |
| D4 | 等价性工具仍是 Tier-3 scratch（`equiv.cjs` / `css-diff.cjs`） | 下一轮提升为 `scripts/tools/equivalence-*.js` 并入 L3（会改 `--expect-checks`，需留痕） |
| D5 | `upload-artifact`（Tier-2 出口）未接 | 需给**冻结的** verify 步骤加 `--json=` 参数 ⇒ 一次有意的口径变更，单独提交 |

---

## 15. Self Audit（摘要）

完整版：`research/architecture-modernization-v1-self-audit.md`。

- **P0 = 0**（无稳定 ID / 路由 / 数据事实的非预期变化 —— 四维等价为证）
- **P1 = 0**（无安全 / 隐私 / 发布链风险）
- **REPAIR_NOW = 0**
- Finding 分类：`GUARDRAIL` 7 条 · `DESIGN_ACCEPTED` 4 条 · `DEFERRED` 5 条 · `OUT_OF_SCOPE` 2 条
- **§29 六问**：5 个「是」+ 1 个「部分是」（Q2：数据侧新增 Provider/Pricing 的改动面未变，
  那不属于本轮范围 —— **不夸大**）
- **本轮被门禁抓到的真实缺陷 4 处**（全部已修）：
  ① 漏族级 CSS ⇒ 27 页 390/360px 溢出 209–239px；
  ② `/plans/coding/` 丢表格原语 ⇒ 溢出 290px；
  ③ 改名导致 `archive-selftest` 接线断言红（本地门禁链第一次运行抓到）；
  ④ 脚本注释里的 `**/` 提前终止块注释。
  前两处**构建期自检、静态检查、语义指纹全绿**，只有真浏览器几何门禁抓得到。

---

## 16. Release

| 步骤 | 状态 |
|---|---|
| 分支 / 工作树 / 阶段提交 | ✅ 4 个阶段提交（08bc73e → 56009cd → cbae420 → 1ae53e2 → 本轮收尾） |
| clean install / L1–L4 / fitness / 确定性 A/B / Full Gate | ✅ 全部实测通过 |
| **PR / merge / deploy / 线上冒烟（Phase 12）** | ⏸ **未启动 —— 需要用户显式确认**（部署是不可逆外部动作） |

线上冒烟工具已就绪：`npm run smoke`（L5，11 条关键路由 + sitemap 抽样，
断言 HTTP 200 / title / canonical 自指 / 无残留占位符 / JSON-LD 可解析）。

---

## 17. ADR（重大架构决策）

**ADR-1 · 为什么不换 Next.js / Astro / 任何框架**
审计没有找到「静态生成结构性不适用」的证据：186 页、构建 2.9s、逐字节可复现、
852 项浏览器断言、SEO/Feed/Manifest 全部由声明表驱动。换成框架会引入运行时、
构建不确定性与一条与「离线确定性」冲突的依赖链，而**收益是零**（没有任何当前做不到的事）。
保留**静态站 + GitHub Pages**。

**ADR-2 · 为什么页面壳用「预渲染字符串传入」而不是「把语义搬进壳里」**
壳如果自己算 feed 标签 / JSON-LD / canonical，就会成为第二个业务判断层，而 9 族的
订阅标签有 6 种取法、JSON-LD 段数各不相同。把差异**显式参数化**之后，等价性风险最小，
且壳的职责一眼可读（脚手架 + 顺序 + 属性落位）。

**ADR-3 · 为什么重型对抗性测试**不**移入 nightly**
审计实测只有 4 个文件带变异牙，其中 `verify-site.js` §22b 的 M1–M5 守护的是**真实发生过**
的回归（commit `f2dec0c`），且带反空洞守卫（锚点必须唯一、变异不生效即判红、M4 正对照、
零磁盘污染）。它们**便宜且高价值** ⇒ 留在 required CI。
「重型就移到 nightly」在这里没有适用对象；把能守住真实回归的牙挪走，是拿保障换时间。

**ADR-4 · 为什么 Domain 层一行未改 / 为什么某个大模块选择 KEEP**
因为分层本来就是干净的（0 环 / 0 违规），且没有 View Model 的抽取证据（(a)(b) 都不成立）。
`check-ci-consistency.js` 这类「口径唯一出处」的模块**按设计就该集中** ——
`KEEP` 是对 §19 的遵守，不是偷懒。

**ADR-5 · 为什么 grandfather 用常量 SHA 而不是「政策文档首次提交」**
后者自指：文档一旦移动/改名，边界就静默变化，而**没有任何东西会红**。
常量 + `--baseline=` 覆盖是显式且可审计的。

**ADR-6 · 为什么不拆 CI job（改成本地分级门禁）**
拆 job 会破坏两条既有不变量（必需检查名 `gate`、一处实现三个调用方），
而真正的缺口是「本地没有跑一遍门禁的入口」—— 用 `run.js --gate` 解析同一份 action.yml
补上了这个缺口，**不改变 CI 的形状**。

---

## 18. 最终交付格式（§30 对照）

| # | 项 | 值 |
|---|---|---|
| 1 | baseline SHA | `e0ca04a` |
| 2 | final SHA | 见本轮收尾提交（分支 `architecture-modernization-v1`） |
| 3 | PR | **未开**（待用户确认） |
| 4 | merge | **未做**（待用户确认） |
| 5 | deploy | **未做**（待用户确认） |
| 6 | Architecture Before | §3 |
| 7 | Architecture After | §4 |
| 8 | 最大源码文件 Before / After | `verify-site.js` 8,057 → 8,058 行（未动）· `build-local.js` **6,677 → 6,345 行** |
| 9 | Build system 改了什么 | §5（页壳收敛完成；`scripts/build/*` 拆分 DEFERRED） |
| 10 | Page system 改了什么 | §6（唯一 document 出口；`<!DOCTYPE` 9 → 0） |
| 11 | Domain 改了什么 | §7（**未改**，且这是正确决定） |
| 12 | Test system 改了什么 | §8（L1–L6 + 本地门禁链 + 4 条架构不变量） |
| 13 | CI 改了什么 | §9（+2 步，不拆 job，项数不变） |
| 14 | Evidence policy 改了什么 | §10（三层 + 类别规则 + 机器判据；grandfather 1,283） |
| 15 | 数据 / 路由 / SEO 是否变化 | **没有**（四维等价，186/186 + 15/15 逐字节） |
| 16 | Build / Verify / CI 时间 Before → After | §13（2.9s→2.9s · 106.7s→~119s · 263.8s→277.1s） |
| 17 | 删除了哪些死代码 | §14（4 个文件 / 102,940 B）+ 6 个确认身份 |
| 18 | 保留了哪些大模块及为什么 | §14 |
| 19 | Self Audit | §15 / 完整版另见 |
| 20 | Remaining Risks | §14（风险登记 6 条 + DEFERRED 5 条） |
| 21 | Final Verdict | **PASS WITH DEFERRED** |
