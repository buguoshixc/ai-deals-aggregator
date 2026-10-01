# v3.0 阶段计划与执行台账

> 权威顺序：题面 `docs/v3.0/TASK-SPEC-v3.0.md` > 本文件 > `docs/v3.0/AGENT-REFERENCE.md`。
> 冲突时以题面为准，并把冲突与处置记进台账。

---

## 一、零偷工减料（第一原则）

**一个阶段只有在 6 项全为真时才算完成**：

1. 该阶段的**每一条交付物**都存在，且是真实实现（不是占位、不是 TODO、不是 `return null`）。
2. 该阶段的**验证命令全部为绿**，且**原始输出（条数/失败数）逐字抄进台账**。
3. 该阶段的**牙实跑变红过**，并记录「污染方式 / 预期失败 / 实际失败 / 还原方式」。
4. **没有新增任何豁免**：没删断言、没放宽容差、没提高下限、没加 `--skip`/`--allow`、没把硬失败降级成 warn。
5. **真实数据原则成立**：数据只来自官方源；查不到就如实缺失并记入候选未采信报告；**空的就交付空**并写明"空是事实，不是故障"。
6. **独立验收员能独立复现**该项（不是只有提交者说它过了）。

**明文禁止（出现即该阶段作废重做）**：

| # | 行为 | 后果 |
|---|---|---|
| S1 | 只做部分子项就宣告阶段完成 | 作废重做 |
| S2 | "数据为空 / 无事件"就跳过页面或跳过断言 | 作废重做 |
| S3 | 用硬编码样例代替真实数据驱动的页面 | 作废重做 |
| S4 | 删 / 注释 / 弱化断言，提高容差，降低门槛下限 | 作废重做 |
| S5 | `try/catch` 静默吞错，把红变绿 | 作废重做 |
| S6 | 伪造数据：编 eventId、编历史事件、`unknown`→`false`、`null`→`0` | 作废重做 |
| S7 | 用字符串相似度 / LLM 猜测写生产关系 | 作废重做 |
| S8 | 只跑自测，不做端到端（真实构建 + 真实浏览器） | 作废重做 |
| S9 | 报告数字靠估 / 抄题面 / 沿用上一版 | 作废重做 |
| S10 | "先跳过、最后补" | 作废重做 |
| S11 | 丢掉"检查过但没收录"的过程 | 作废重做 |
| S12 | 用第三方聚合站当生产事实来源 | 作废重做 |

---

## 二、反作弊检查（阶段 J 必做，独立验收员复核）

与基点 `49122ad` 对比，逐条留证：

1. **断言总数只增不减**：逐文件统计 `check(` / `fail(` / `test(` 计数，不得有文件净减少。
2. **下限与门槛只增不减**：`seo.textFloor` 各分支、`MIN_PRERENDERED_CARDS`、`VENDOR_THRESHOLDS`、`CATEGORY_MIN_DEALS`、各页逐页文本下限。
3. **没有删除事件或记录**：三份 History baseline 记录数 ≥ 134 / 9 / 7；`deals.json` 的 `type=deal` ≥ 80；`api-plans.json` 模型计价条目 ≥ 37。
4. **没有新增豁免**：全仓扫描 `--skip`、`--allow-`、`continue-on-error`、`|| true` 的新增实例。
5. **没有占位实现**：新增文件里不得有 `TODO` / `FIXME` / `not implemented` / 空 `return null`。
6. **例外必须自证**：任何"看起来是例外"的地方（例如某页确实为 0 条）必须在报告里逐条说明并给可核对证据。

---

## 三、阶段与任务对照

| Stage | 题面节 | 团队任务 | 负责 |
|---|---|---|---|
| Stage A 审计与架构 | §Stage A | （队长内部产出，见 `AGENT-REFERENCE.md` §2） | 队长 |
| A1 身份层 | §Stage E 前置 | `t1` | registry-curator |
| A2 页面模块骨架 | §Stage B/D/F/G 前置 | `t2` | pages-builder |
| A3 数据扩充 | §Stage C | `t3` | source-researcher |
| A4 流水线基建 | §Stage H 前置 | `t4` | feed-pipeline |
| Stage B `/plans/` hub | §Stage B | `t5` | pages-builder |
| Stage D Model Registry | §Stage D | `t6` | registry-curator |
| Stage D2 `/models/` | §Stage D5–D9 | `t7` | pages-builder |
| Stage E 厂商资料页 | §Stage E | `t8` | pages-builder |
| Stage F Archive | §Stage F | `t9` | pages-builder |
| Stage G Data Docs | §Stage G | `t10` | pages-builder |
| Stage H API Feed/Changes | §Stage H | `t11` | feed-pipeline |
| Stage I IA 收口 | §Stage I | `t12` | pages-builder |
| Stage J 集成与完整门禁 | §§16/20 | `t13` | feed-pipeline |
| 验收 V | §18 完成标准 | `t14` | acceptance-auditor |

**依赖**：`t1,t2,t3,t4` 起点 → `t5`(B) 与 `t6`(D) → `t7`(D2) 与 `t8`(E) → `t10`(G) → `t11`(H) → `t12`(I) → `t13`(J) → `t14`(V)。
`t9`(F) 只依赖 `t1,t2`，与 `t5`/`t6` 并行。

---

## 四、阶段台账模板（每个 Stage 一行，缺行 = 未完成）

最终报告必须包含这张表，每行都有可核对的原始输出：

| Stage | 交付物 | 验证命令与实测结果（逐字） | 牙实跑变红 | 新增豁免 | 状态 |
|---|---|---|---|---|---|
| A 审计架构 | | — | — | 无 | |
| A1 身份层 | | | | 无 | |
| A2 页面模块 | | | | 无 | |
| A3 数据扩充 | | | | 无 | |
| A4 流水线基建 | | | | 无 | |
| B `/plans/` hub | | | | 无 | |
| D Model Registry | | | | 无 | |
| D2 `/models/` | | | | 无 | |
| E 厂商资料页 | | | | 无 | |
| F Archive | | | | 无 | |
| G Data Docs | | | | 无 | |
| H API Feed | | | | 无 | |
| I IA 收口 | | | | 无 | |
| J 集成与门禁 | | | | 无 | |
| V 独立验收 | | | | 无 | |

---

## 五、每个阶段收口动作（缺一不可）

1. 跑该阶段的**局部**验证命令（见 `AGENT-REFERENCE.md` §8）。
2. 跑该阶段的**牙**，逐条实跑变红，逐条还原。
3. 用**真实构建**确认既有页面未被破坏：`npm run build` → 页数与 sitemap 条数不比基点少、`npm run verify:seo` 全绿。
4. 填台账。
5. 独立提交（一个阶段一个 commit，message 写明实测数字与变红过的牙）。

---

## 六、阶段 0 门禁基线（已实测）

在 worktree 的原始 HEAD（`49122ad`）上跑 `.agent-run-gate.ps1`，31 步：

- **29 步全绿**（validate --strict、check-reproducible、history-verify、migrate-audience-verify、zh-todo --check、
  全部 21 支 selftest、check-api-plans-reproducible、check-api-plan-history、build-local、
  check-feeds-reproducible、check-plans-reproducible、check-plan-history、seo-verify）。
- `verify-site` 与 `verify-site --compare` 首次失败的原因是脚本里硬编码的浏览器路径被非 UTF-8 读取损坏，
  **不是断言失败**；已改成用 node 动态求值浏览器路径后重跑（结果见 `research/_raw/v3.0-gate/`）。

> 这条本身要记进最终报告：**环境适配问题不是"门禁不适用"，必须修到真浏览器验收真实执行**，
> 否则等于跳过了题面 §17/§18 要求的端到端验证。

---

## 七、在途发现的待办（防止丢失）

| # | 发现 | 来源 | 处置 | 状态 |
|---|---|---|---|---|
| D1 | `deals.json` 里 `GPT Image` 的 `url` 是 `https://gptimage-2-5.com/`、`ChatGPT Plus` 的是 `https://chatgpt.com/veterans-claim`，两条来源都是第三方目录站（`aitools.fyi` / `Layer3Labs`），URL 不像任何官方定价页 ⇒ **疑似非官方来源条目** | `registry-curator` 在 t1 判别名时顺手发现 | 不在 t1 范围改。在 Stage C（`t3`）或报告 §18「已知限制」里核实：有官方依据则登记，没有则按既有纪律**不写生产事实**并如实登记 | 待核实 |
| D2 | ~~题面 §16 列出的 7 个脚本名与实际 `package.json` 不一致~~ **⇒ 已证伪（队长早期审计误判，勿沿用）** | 队长基线审计；由 `completeness-auditor` 与队长用脚本**双重复核**推翻 | **实测：题面 §16 的 31 个 `npm run` 脚本名在当前 `package.json` 里全部存在，`npm test` 也存在。** 根因：队长早期用 `Select-String` 粗略提取题面脚本名并靠印象比对。**最终报告必须写"实测无差异"** | 已闭环（结论翻转） |
| D3 | 仓库无 `LICENSE`/`COPYING` 文件 | 队长基线审计 | 报告 §10 列为"需项目所有者决定"，**不擅自决定** | 待写入报告 |
| D4 | 三份 History 均 0 事件 ⇒ `/archive/` 与 API 变化 Feed 交付日为空 | 队长基线审计 | 如实交付 + 明确文案；Archive 的 ended/restored 分支仅由合成夹具驱动；报告 §18 写明 | 待写入报告 |
| D5 | 真浏览器回归基线页高是 4589px，而当前真实页高 4665px ⇒ 容差上限 5277px，**仅剩 612px 余量** | 队长基线门禁 | **禁止新增页脚整行**；新入口只能挤进已有行 | 已作为硬约束下发 |
| D6 | `VENDOR_RULES` 的 A 空间是 **45 条**，但两版审计正则都数成 44（正则字面量含 `]`/`/` 导致提前收尾） | `registry-curator` 两次更正 | 已写进 `AGENT-REFERENCE.md` 勘误块；以 `t1` 的 `FROZEN_VENDOR_KEYS` 为准 | 已闭环 |
| D7 | **`package.json` 的重复键能静默存活**：JSON 解析只留最后一个，两个成员撞名（`selftest:models`）在构建期**没有任何东西会红** | `registry-curator` 在 t6 撞到并改名 | `t13` 补一条断言：`scripts` 键在**文本层**不得重复（不能用 `JSON.parse` 判，它已经去重了） | 待 t13 落地 |
| D8 | `deepseek-flash` 与阿里云 `deepseek-v4.1-flash` 的合并**依据待补**：归一形态并不相等，属"用 registry alias 连两个不同串"，需要阿里云官方页能对上 V4.1 版本的证据；补不出则拆成两条身份 | 队长在 t6 验收时提出 | **已收口**：note 写明"人工判断"+两处官方串（附记录 id）+ 撤回口，符合题面 D4「明确人工确认依据」⇒ **接受合并**，只要求把「⇒ 同一身份」改成判断口吻（已改，230 字）。作为**唯一一条人工判断型跨平台身份合并**进报告供抽查 | 已闭环 |
| D9 | 工具在**并发编辑窗口**里会读到半成品而**伪造红**（队长实测两次：`deal-plan-links.js` 瞬态崩溃、`validate`/`zh-todo` 假红） | 队长实测 | **最终验收必须在冻结提交上跑**（t14 验收契约已如此要求）；队长自己的运行器还出过"把 `x.js --flag` 当单个文件名"的 bug，已修 | 已闭环 |
| D10 | **t8 的 build-local 六步接线未执行**（`t8` 只交模块+断言+接线说明，依 DAG 归属 **t13**） | `pages-builder` 在 t8 交付 | **已由 t13 完成**：五份 join 输入、`renderDirectoryPage` 的 `extraSections`、vendor 分支 + `eventCount`/`nonDealMaterial`、SEO 描述符两字段、`selfCheck` 的 `assertVendorSlugDeclared/Honesty/ApiCounts/CandidateIdentity` 全部在位；产物 **19** 家人链。**注意：数字是 19 家，不是 18**（详见 R5 修正） | 已闭环 |
| D11 | `verify-site.js` 尚无 `/models/` 与 `/vendor/` 真浏览器分节 | `t7`/`t8` 交接 | **已由 `t12` 完成**：`verify-site.js` 新增 §21–§25（含 `/models/`、厂商页六节、跨页深链分节）；真浏览器 **642 项 0 失败**、回归 **648 项 0 失败** | 已闭环 |
| D12 | `gate/action.yml` 尚未登记 6 支新自测 | `t2`/`t6`/`t8` 交接 | **已由 t13 完成**：`action.yml` 共 **43 步**，含 Model-registry / Models-page / Plans-hub / Vendor-pages / Archive / Data-docs 自测 + Models reproducibility + Model-registry links check；`check:ci` **35 条断言 + 1 看门狗 = 36**，`--expect-checks=36` | 已闭环 |

---

## 八、队长裁定（对下游有约束力，均附理由）

| # | 裁定 | 理由 | 影响 |
|---|---|---|---|
| R1 | **不重命名 `moonshotai` logo 键**；改用「provider.vendorKey → A 空间键 → 显示名」恒等式断言钉死 | 该键在 `manifest` 硬断言里，且是已发布 URL `dist/logos/moonshotai.svg` | 已写进 `AGENT-REFERENCE.md` 勘误块 |
| R2 | `openai.vendorKey = 'openai'`（**不是 null**） | A 空间 `index.html:1461` 确有 `openai` 规则（45 条实测） | 同上 |
| R3 | 4 个纯产品名串：`ChatGPT`/`NotebookLM` **批准并入**；`ChatGPT Plus`/`GPT Image` **否决** | 按**域名为客观证据**逐条判（`openai.com` / `notebooklm.google.com` 通过；`chatgpt.com` / `gptimage-2-5.com` 不通过） | `t1` 补 2 条别名 |
| R4 | **批准新建 provider `qoder-intl`**（显示名「Qoder International」、slug `qoder-intl`、`vendorKey: null`） | CN 站与国际站是独立定价/域名/币种的两个 SKU 面；并表会造出"同一张表两套货币"的假象。本仓已有"同一家公司两条产品线各占一个 provider，但必须逐条登记"的先例 | `t6` 落盘；**不得**改 `qoder` 既有记录；**不得**为此新编 A 空间厂商名 |
| R5 | **provider-only 平台是否建 `/vendor/` 页** → **修正为按"是否在 A 空间有厂商名"判定**：**19 家有 ⇒ 建**（含 `deepseek`/`openai` 这类当前零优惠但有 API 资料的，标题用「X 的 AI 资料」）；**4 家无**（`trae`/`qoder`/`codebuddy`/`qoder-intl`，`vendorKey: null`）**⇒ 不建**，资料走 `/plans/coding/` 与 `/plans/` 枢纽 | 原名（"站上所有 `/vendor/` 以 A 空间厂商名为身份键，为无名的 provider 建页等于新编身份"）**仍然成立**；但原裁定**两处数字都错过**（先写 23、再写 18）。**权威数字：`providers.json` 里 `vendorKey !== null` 的条数 = 19**（实测）。`pages-builder` 用实测纠正了队长的 18 | **最终实测：厂商页 9 → 19、sitemap → 170**（构建期 `expectedLocs` 断言为准，不手算）。已给 `planLandingPages` 加断言：候选厂商名必须能在 A 空间 `[键,名]` 表里查到，否则不生成并记 `skip(reason=no-vendor-identity)` |
| R6 | **硬顺序**：`t6` 必须在同一轮里"先落 t3 采信数据 → 跑通两道可重建门禁 → 再做 Registry"，页面构建（t5/t7/t8/t10）一律在 t6 之后 | 否则会出现"页面写套餐数 9、数据其实 21 条"的**自相矛盾产物** | 已通知 `registry-curator` |

---
