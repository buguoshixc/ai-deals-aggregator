# architecture-modernization-v1 · Self Audit

> **这份文档不宣布完成** —— 它按 §25 逐项审查本轮的实际状态，并对每条 finding 给出分类：
> `REPAIR_NOW` / `GUARDRAIL` / `DESIGN_ACCEPTED` / `DEFERRED` / `OUT_OF_SCOPE`。
> 结论：**P0 = 0 · P1 = 0 · REPAIR_NOW = 0**；有 3 条 DEFERRED（见 §11），因此最终判定是
> **PASS WITH DEFERRED**（不是 PASS）。

审查范围：`architecture-modernization-v1` 分支，基线 `e0ca04a` → 最终提交见《最终报告》。

---

## 1. Scope（做了多少、没做多少）

| 工作流 | 计划 | 实际 | 状态 |
|---|---|---|---|
| **B** Page Rendering / Shared Shell | SPLIT + SIMPLIFY | 9/9 页面族收敛到唯一页壳 | ✅ 完成 |
| **L** Unit / Selftests | REFACTOR（分层登记） | L1–L6 + 本地门禁链 | ✅ 完成 |
| **M** Mutation / Tooth | KEEP + 分类登记 | 清单从源码派生 + 判定纪律进 TESTING.md | ✅ 完成 |
| **N** CI / Gate | REFACTOR（保守） | +2 步（fitness / evidence），不拆 job、不动冻结体 | ✅ 完成（收窄后） |
| **O** Research / Evidence | SIMPLIFY + DELETE（未来规则） | 三层政策 + 类别规则 + 机器判据 | ✅ 完成 |
| **P** Documentation | ADD 4 + 取代同义面 | ARCHITECTURE / TESTING / BUILD / EVIDENCE-POLICY | ✅ 完成 |
| **C** CSS / Layout | REFACTOR | 审计完成、分歧项未合并（刻意） | ⚠️ 部分（见 §11-D1） |
| **A** Build System | SPLIT | 渲染器已迁出、`finalizePage` 已收敛；**未**拆 `scripts/build/*` | ⚠️ 部分（见 §11-D2） |
| **E/K** verify-site 拆分 | SPLIT | **未做** | ⚠️ DEFERRED（见 §11-D3） |
| **D** Domain Layer | REFACTOR（局部） | 无证据 ⇒ 不做 | ✅ 按审计执行（DEFER 是对的） |
| **F/H/I/J** | KEEP | 未动 | ✅ |
| **Phase 12** PR / Deploy / 线上冒烟 | 需用户确认 | 未启动 | ⏸ 待授权 |

---

## 2. Dependency direction（依赖方向）

**判据**：`npm run fitness` 断言 ①。

| 检查 | 结果 |
|---|---|
| `scripts/lib/**` → `scripts/{build,tools,ai}/**` | **0 违规**（扫 52 个 lib 模块） |
| 循环依赖 | 0 |
| require 边总数 | 489（基线）→ 见最终报告 |

**审查意见**：这是本轮**唯一一处「审计推翻了计划」的地方** —— 计划假定要「重建分层」，
实测分层本来就是干净的（0 环 / 0 违规）。所以本轮把它从「重建」改成「**转为强制**」：
加了一条断言让这条边界不会再退化。这是正确的动作，而不是「没做事」。
分类：`GUARDRAIL`。

---

## 3. Module boundaries（模块边界）

| 边界 | 证据 | 分类 |
|---|---|---|
| 页面正文（`lib/*-page.js`）与文档脚手架（`lib/page-shell.js`）分离 | 9 族全部走页壳；生产模块里 `<!DOCTYPE` 由 9 处 → **0 处** | ✅ |
| 布局族不在页壳里声明 | 唯一出处仍是 `page-kinds.js`；页壳查不到即硬失败 | ✅ |
| `renderStaticPage` 的 `kind` 由调用方显式给出 | 不再靠「传不传 mainClass」暗示 | ✅ |
| `renderModelsShell` → `renderStaticPage` 改名 | 它服务 5 个族（模型/档案/数据文档），旧名是误称 | ✅ |
| `feedTagsHtml` / `jsonLdHtml` / `extraCss` 等由调用方预渲染 | 页壳不重新推导业务判断 | ✅ |

**审查意见**：`renderStaticPage` 保留为一个**参数映射层**（15 行），而不是让 5 个调用点各写
一遍 `route → canonical → favicon → 根 Feed`。这**不是**「旧模块套新 API」——它不拥有任何
脚手架，只做映射。但它确实多了一层间接。分类：`DESIGN_ACCEPTED`，理由写在函数头注释里。

---

## 4. Build purity（构建纯度）

| 检查 | 结果 |
|---|---|
| renderer / 页壳读盘、联网、看当前时间 | **0 处**（fitness 断言 ②） |
| 构建期是否联网 | 否（offline deterministic） |
| 时间来源 | context 注入 / 来自数据 |
| 写入面 | `assemble()` 内的 `fs.writeFileSync` + `.building`/`.stale` 原子替换 |
| 产物注册表 | `PUBLIC_FILES` / `GENERATED_FILES` / `dataDocs` 注册表（构建期 `selfCheck` 对账） |

**审查意见**：写入面**尚未**收敛成独立的 `write-output.js`（见 §11-D2）。当前它是
「`assemble()` 内部的一组 `fs.writeFileSync` + 3 个 staging 辅助函数」，纪律仍然成立
（暂存 → 自检 → 原子替换），只是没有物理隔离。分类：`DEFERRED`（与 D2 同一条）。

---

## 5. Renderer purity（渲染器纯度）

`npm run fitness` 断言 ② 覆盖 `lib/page-shell.js` + `lib/{plans,api-plans,models,vendor,plans-hub}-page.js`
共 6 个模块：不 require `fs`/`http`/`playwright`/`child_process`，不出现 `Date.now()` / `new Date()`。

**审查意见**：本轮的迁移**没有**把 `status` / `changes` / `feeds` / `directory` / `deal` 五族的
正文搬进 `lib/*-page.js`（它们仍在 `build-local.js` 里，只是不再拼文档）。
所以「renderer 纯度」这条断言目前只覆盖 6 个模块，覆盖面小于「9 族」。
这是**有意的最小 diff 选择**（正文搬家风险高、收益低于页壳收敛），但它意味着
`build-local.js` 里仍有页面正文。分类：`DEFERRED`（见 §11-D2）。

---

## 6. Domain integrity（真值完整性）

| 铁律 | 是否被本轮触碰 | 证据 |
|---|---|---|
| `firstSeen ≠ releasedAt` | 否 | 数据文件逐字节一致 |
| 采集器失败 ≠ 优惠结束 | 否 | `health.js` 未改 |
| `catalogStatus` 是派生 | 否 | `models.json` 逐字节一致 |
| `coverageStatus` 是派生 | 否 | 覆盖报告与自测全过 |
| 归档层是派生视图 | 否 | `archive.js` 未改 |
| 稳定 ID 不变 | 否 | deal 138 / model 51 / plan 44 / apiPlan 24 全部一致 |

**审查意见**：本轮**没有**发现需要抽 View Model 的证据（审计的 (a)(b) 两条判据都不成立），
因此 Domain 层**一行未改**。这是遵守 §19「不要为了架构图好看加抽象层」的结果，
不是遗漏。分类：`DESIGN_ACCEPTED`。

---

## 7. Test layering（测试分层）

| 检查 | 结果 |
|---|---|
| 分层表是否有幽灵条目 | 0（fitness 断言 ④） |
| 每个 `selftest:*` 是否恰好属于一层 | 是（25 个） |
| 同一 script 是否出现在两层 | 否 |
| 「每个测试被门禁跑到」这个方向 | **刻意不重复** —— owner 是 `check-ci-consistency` (17)/(19) |
| 本地是否有「跑一遍 CI 门禁」的入口 | **本轮新增**（之前不存在） |

**审查意见**：分层表**没有**变成第三份平行注册表 —— 它只补「层归属」这一条新信息，
并用一条断言与既有的两个出处绑定。这是这份设计里最容易做错的地方，专门在
`layers.js` 与 `TESTING.md` 里写明了边界。分类：`GUARDRAIL`。

---

## 8. CI layering（CI 分层）

| 检查 | 结果 |
|---|---|
| job 结构 / 必需检查名 / 冻结 `run:` 体 | **未动** |
| 新增步骤 | 2 步（fitness / evidence），已同步 `GATE_STEP_NAMES` + `GATE_STEP_RUN` |
| `--expect-checks` | 仍 38（新增的是**步骤**不是**断言**）—— 已自证 |
| 门禁总时长 | 263.8s（45 步）→ **277.1s（50 步）**，**+5.0%** |

**审查意见**：没有拆 `gate:fast/build/browser/release` 为独立 CI job —— 那会破坏
「必需检查名 `gate`」与「三个调用方共用一处实现」两条既有不变量，而收益（并行）远小于风险。
改成了**本地的分级门禁**（`gate:fast` 等），CI 仍是一条链。分类：`DESIGN_ACCEPTED`。

---

## 9. Evidence policy（证据治理）

| 检查 | 结果 |
|---|---|
| 三层定义是否有文档 | 是（`docs/EVIDENCE-POLICY.md`） |
| `.gitignore` 是否还是逐目录白名单 | 否（改成按类别） |
| 是否有「不依赖记得别 add」的判据 | 是（`check:evidence`，进 CI 门禁） |
| 是否重写了历史 / 删了既有证据 | **否**（1,283 个 grandfather 全部保留） |
| 对已跟踪文件的影响 | 0（`.gitignore` 不会取消跟踪） |

**审查意见**：`check:evidence` 的 grandfather 边界是**硬编码的基线 SHA**（`e0ca04a`），
并接受 `--baseline=` 覆盖。写成常量而不是「policy 文档首次加入的提交」，是因为后者自指 ——
文档一旦移动/改名，边界就静默变了而**没有任何东西会红**。分类：`DESIGN_ACCEPTED`。

---

## 10. Behavior equivalence（行为等价）—— 本轮最重要的证据

对 186 条路由做了**四个独立维度**的比对（全部对比基线 `e0ca04a` 的构建产物）：

| 维度 | 方法与判据 | 结果 |
|---|---|---|
| **语义指纹** | visible text / links / canonical / hreflang / JSON-LD（类型 + ItemList 成员）/ `data-item` 行 id / 稳定 ID / `data-*` / feed 标签 / `<main>` class | **186/186 页一致** |
| **CSS** | 每页全部 `<style>` 规范化后逐字节 + 选择器集合 | **186/186 页一致** |
| **生产数据文件** | `deals.json` / `plans.json` / `api-plans.json` / `models.json` / `model-registry-links.json` / 三份 `*-history.json` / `deal-plan-links.json` / `source-health.json` / `sitemap.xml` / `feed.xml` / `feed.json` / `data/index.json` 的 sha256 | **15/15 逐字节一致** |
| **路由 / 订阅 / 站点地图** | 路由集合、sitemap URL 集合、根 feed 条目 id | 186 / 183 / 80 全部一致 |

**并且**：852 项真浏览器断言全过、clean build A == B（逐字节）、门禁链全过。

**审查意见**：这是本轮**唯一**能证明「重构没有改变产品行为」的东西，而且它抓到了两处真实缺陷
（见 §12）。四个维度里前两个是**本轮新建**的工具（`.arch-v1/equiv.cjs`、`.arch-v1/css-diff.cjs`），
它们目前是 Tier-3 scratch。分类：**`GUARDRAIL`（建议提升为常设工具，见 §11-D4）**。

---

## 11. Remaining complexity（未做完的与留在案上的）

### D1 · CSS 分歧项未合并 —— `DEFERRED`

审计记录了 13 个跨块重复的选择器，分成三类：6 个**逐字节相同**（可安全上提）、
2 个**基础 + 覆盖**、**5 个声明体分歧**（`.pchgtype` 是同名不同组件）。

本轮**只做了分类与保留**，没有合并任何一条。理由：合并分歧项会**静默改变外观**，
而外观回归只有真浏览器几何断言抓得到 —— 这正是本轮踩过的坑（§12）。
**后续触发条件**：当某条规则被**第二个布局族**需要时，按「先证明两条规则同值」的
判据逐条合并（写在 `docs/ARCHITECTURE.md §3.3`）。

### D2 · Build System 未拆成 `scripts/build/*` —— `DEFERRED`

已完成的部分（真实收益）：9 个页面族的文档组装收敛、`finalizePage`/`resolveRouteHrefs`
的唯一实现、`renderStaticPage` 取代自带脚手架的 105 行版本。
未完成的部分：`assemble()`（~1,390 行编排）、`selfCheck()`（~2,380 行产物自检）、
写入面（`fs.writeFileSync` + staging 辅助）仍在同一文件；5 族的页面正文也仍在里面。

**为什么不做**：`build-local.js` 有模块级可变状态（`DIRECTORY_PAGES` / `PLAN` /
`VENDOR_KEY_OF` / `OUT` / `STAGE_OUT`），而 `selfCheck()` 大量读它们。搬迁必须先把这些
改成显式传参 —— 那是一次**独立的高风险手术**，与「行为等价」这一硬约束正面冲突，
且在剩余预算里无法同时完成「搬迁 + 四维等价验证」。
**后续触发条件**：下一次专门的重构轮次，且必须先为 `selfCheck` 建立黄金输出基线。

### D3 · `verify-site.js` 未拆分（8,057 行 / 484 `check()` / 852 运行时项）—— `DEFERRED`

计划是拆成 `scripts/verify/{discover,static-html,routing,seo,browser/*,compare,report}`，
并按已有的 26 个编号段照抄缝。**为什么不做**：它是 L4 的唯一实现，852 项断言的
「一项都不能静默减少」需要逐段搬家 + 逐段对账（`--json` 的 `checks[]` 逐项 name 对比），
工作量与本轮已完成的全部工作相当。
**后续触发条件**：× 与 D2 同批（都需要「先冻结黄金基线再搬」的同一套手法）。

### D4 · 等价性工具仍是 Tier-3 scratch —— `DEFERRED`

`equiv.cjs`（语义指纹）与 `css-diff.cjs`（CSS 级对比）本轮各抓到一处真实缺陷，
价值已被证明。它们现在住在 `.arch-v1/`（gitignore）。
**建议**：提升为 `scripts/tools/equivalence-{capture,compare}.js` 并入 L3。
**为什么本轮不做**：提升意味着要给它写测试、登记进分层与门禁 —— 那会改变
`--expect-checks`，属于一次需要留痕的口径变更，应在下一轮单独做。

### D5 · `upload-artifact`（Tier-2 出口）未接 —— `DEFERRED`

证据政策定义了 Tier 2（大 JSON / trace / 截图 → CI Artifact），但**没有**在门禁里接
`actions/upload-artifact`。原因：要上传 `verify-site.js --json=` 的报告，就得给
**冻结的** `run:` 体加参数（`Real-browser acceptance (verify-site.js)` 那一行），
而 `check-ci-consistency` 断言 (8) 会逐字比对。这是一次**有意的口径变更**，
应当与它的理由一起单独提交。

---

## 12. 本轮被门禁抓到的真实缺陷（4 处，全部已修）

| # | 缺陷 | 谁抓到的 | 为什么值得记 |
|---|---|---|---|
| 1 | `renderStaticPage` 接管 5 个族时漏掉**族级表格 CSS** ⇒ `/docs/data/`、`/models/` 等 **27 页**在 390/360px 出现 209–239px 页面级横向溢出 | `verify-site.js` §22c（真浏览器几何） | 构建期自检、静态检查、语义指纹**全绿** —— 只有浏览器抓得到 |
| 2 | `/plans/coding/` 丢了静态表格原语 ⇒ 360/390px **290px** 溢出（634px 宽表撑破 328px 容器） | 同上 | 同一类缺陷的第二个实例，直接催生了 CSS 级对比工具 |
| 3 | 改名 `renderModelsShell` → `renderStaticPage` 后，`archive-selftest` 里那条 grep 构建源码的接线断言红了 | **本地门禁链第一次运行** | 它守的是「档案详情真的把统一内容列常量传下去」—— 断言的**意图**没变，只是锚点要跟着改名；已同步 |
| 4 | `check-evidence.js` 的文档注释里出现 `**/`（`**/shots/`）⇒ 提前终止块注释 ⇒ 语法错误 | `node --check` | 小但值得记：脚本注释里的 glob 会把注释切断 |

**审查意见**：这 4 条里前 2 条是**产品级**的（线上会看到横向滚动条），
如果没有 L4 几何门禁与新建的 CSS 对比工具，它们会静默上线。分类：`GUARDRAIL`（已修）。

---

## 13. §29 六问（逐条给证据，不靠印象）

| 问题 | 回答 | 证据 |
|---|---|---|
| **Q1 新增一个页面是否更简单？** | **是** | 页壳前：手写 100+ 行 `<!DOCTYPE>…</html>` + 自抽共享片段 + 自调 `finalizePage`（9 族各一份）。页壳后：`kind` 查表 + `docStart/docEnd` 两次调用；布局族由 `page-kinds.js` 判，漏声明即硬失败；页脚/分析注入/占位符解析全在页壳里 |
| **Q2 新增 Provider / API Pricing 是否减少无关代码？** | **部分是** | 页面侧确实减少了（不必碰文档脚手架）；但数据侧（`curated_api_plans.json` + schema + 历史 + 页面模块 + sitemap 登记 + 统计范围登记）未变 —— 那部分本就不属于本轮范围。**不夸大** |
| **Q3 改共享布局规则是否基本只改一处？** | **是** | 共享规则只有一处出处（`index.html` 的单个 `<style>`）；共享页头/meta/页脚只有一处（`lib/page-shell.js`）；`fitness` 断言 ③ 保证它不会回到 9 处 |
| **Q4 改 Coverage / Currentness 是否容易预测影响范围？** | **是（未变，但已写明）** | 判据唯一在 `coverage-targets.js` / `model-freshness.js`；`docs/ARCHITECTURE.md §2/§6` 明确写了「谁派生、谁读、三处调用点必须同支」 |
| **Q5 一个测试失败能否快速判断属于哪层？** | **是** | `L1..L5` 有声明表 + `npm run test:l1..l4` 单层可跑；`run.js` 失败时打印层名与脚本名；分层判据是「需要什么才能跑」，所以层的含义是可预测的 |
| **Q6 新 Agent 第一次读仓库能否靠少量核心文档理解？** | **是** | 4 份文档各有明确问题集且互不重叠；`AGENT-REFERENCE.md §2.1` 已标注被取代；`docs/ARCHITECTURE.md §9` 给了「改什么 → 改哪里」速查表 |

**六问里 5 个「是」、1 个「部分是」** ⇒ 达到 §29 的判据（多数为「是」）。

---

## 14. Finding 分类汇总

| 分类 | 条目 |
|---|---|
| `REPAIR_NOW` | **0** |
| `GUARDRAIL`（本轮新增的守卫） | 依赖方向断言 · renderer 纯度断言 · 唯一 document 出口断言 · 分层表完整性断言 · 本地门禁链 · 证据 Tier-3 拦截 · 四维等价验证方法 |
| `DESIGN_ACCEPTED` | `renderStaticPage` 作为参数映射层 · 不拆 CI job · Domain 层一行未改 · grandfather 边界用常量 SHA |
| `DEFERRED` | D1 CSS 分歧项 · D2 Build System 拆分 · D3 verify-site 拆分 · D4 等价工具提升 · D5 Tier-2 artifact 出口 |
| `OUT_OF_SCOPE` | 数据事实修正（本轮**未发现**需要记录的 `OUT_OF_SCOPE_DATA_FINDING`）· 历史证据瘦身（政策明确不授权） |

---

## 15. 结论

- **P0 = 0**（无稳定 ID / 路由 / 数据事实的非预期变化 —— 四维等价验证为证）
- **P1 = 0**（无安全 / 隐私 / 发布链风险；`check:ci` 的 38 条断言与门禁全过）
- **REPAIR_NOW = 0**
- **Behavior equivalence 有独立证据**（不是「我认为等价」）
- **Determinism 有独立证据**（clean build A == B，303 文件逐字节）

**最终判定：`PASS WITH DEFERRED`** —— 5 条 DEFERRED 全部有明确的范围边界、
不做它的**技术理由**与**后续触发条件**（§11）。其中 D2/D3 是本轮计划里
最大的两块未完成工作；把它们的真实状态写清楚，比含糊地宣称「完成」更有价值。
