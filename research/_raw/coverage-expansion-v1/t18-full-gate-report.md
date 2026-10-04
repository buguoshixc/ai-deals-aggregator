# t18 · 本地 Full Gate 报告（本轮唯一可信的全量门禁结论）

- **HEAD**：`118a95c`（`fix(gate): vendor-page-selftest 的 R5 写死计数改派生式（T18-F1，收口）`）
- **工作树**：`.worktrees/coverage-expansion-v1` · 分支 `coverage-expansion-v1` · 基线 `a4dd40f`
- **口径（动态读取，不写死历史项数）**：action.yml **49 步** · `verify.yml:118 --expect-checks=38` ·
  `package.json` scripts 94 / `selftest:*` 25
- **基线数字**一律引用 `research/_raw/coverage-expansion-v1/baseline.json`（含 t1 的实测更正：gate 45 / expect-checks 37 /
  deal-plan-links links=5,retired=0 / futurepedia 连续失败 9 / dist 173 由基线 SHA 上隔离构建一手数出）
- **驱动器**：`t18-gate-runner.cjs`（步骤表现读 action.yml，逐条执行并记录 exit；`npm ci` 之外一步不落）
- **本报告的唯一读数来源**：`t18-gate-results.json`（同一次运行的 stdout 落在 `t18-gate-run.log`）。
  本报告是 **t41 更新版**（2026-10-04T13:54:00Z→13:57:26Z 那次运行，即 R5 收口提交 `118a95c` 之后的干净重跑）；
  更新前的读数与「为什么会有三套数字」见 **§9 读数时间线**。

> **本结论的适用对象（必须与结论一起引用）**：跑的那棵树是
> **HEAD `118a95c`**，且运行期间**已跟踪文件没有一个字节变化** —— 工作树上当时是 4 个我自己 in-scope 的
> **未提交产物**（`t18-extras.json` / 本报告 / `t18-gate-results.json` / `t41-derived-r5-readings.json`）
> 加队友的两个未跟踪目录（`research/_raw/t43/`、`t45/`）。它们在本轮运行**之前就是 dirty、运行期间逐字未变**。
> ⇒ 这是一份 **"纯 HEAD `118a95c` + 只读产物未提交"** 的门禁读数（不是"HEAD + 生产代码在途改动"）。
> 运行期间只有**队友的 2 个 selftest 文件**（`scripts/tools/api-plans-selftest.js`、`data-docs-selftest.js`，
> t42 同类清扫）在窗口内被他们改动，如实记在 `concurrentEdits`（§9.3）。

---

## 0. 一句话结论

> **49 步里 48 过、0 红、1 跳过。**跳过的仍是环境准备步骤 `npm ci`（§7 T18-F2）。
> 上一版报告里**唯一那条红**（Vendor-pages self-test 的 R5 冻结期望过期 = `T18-F1`）已由 **t41** 修掉：
> 判据从「写死 4 家」改成**派生式**（对 `providers.json` 里每个 `vendorKey === null` 的身份逐条断言「有 skip 记录 + 无路由」），
> 提交 `118a95c`，现场读数见 `t41-derived-r5-readings.json` 与 §9。
> **契约 Verify 列出的四条命令全部 exit 0**；可复现、独立重算、真浏览器、六项完整性对账全部通过。

| 维度 | 结果 |
|---|---|
| 门禁步骤 | **48 / 49 过**（0 红、1 跳过） |
| Vendor-pages self-test（R5，本次修的就是它） | ✅ exit 0 · **57 项 0 失败**（其中 9 个 `vendorKey: null` 身份逐条派生断言） |
| `validate --strict` | ✅ exit 0 |
| `check-ci-consistency`（裸跑，自读 verify.yml=38） | ✅ **38 项 0 失败**；`--expect-checks=38` ✅；**`--expect-checks=37` ❌ exit 1**（外部钉住仍有牙） |
| `build-local` / build A vs B | ✅ exit 0 · **293 文件逐字节一致**（manifest sha `829c0ce8…` 两次相同） |
| 真浏览器 `verify-site` + 回归比对 | ✅ **735/0** 与 **741/0**（exit 0，浏览器链 `mode=full`） |
| `models:rebuild --dry-run` + `check:models:reproducible` | ✅ 均 exit 0（44 模型 / 82 映射逐字节一致） |
| `report:coverage --json` ×2 | ✅ exit 0，**两次输出逐字节一致** |
| 独立重算 vs 报告 | ✅ **4/4 一致**（93 / 81 / 12 / 0） |
| ≥6 条变异复核 | ✅ **6/6**（对照绿、变异红） |
| 静止树自证 | ✅ 已跟踪文件在验收窗口内 **0 个变化**；HEAD 稳定 `118a95c` |

---

## 1. 49 步逐条读数

> 全部由 `t18-gate-runner.cjs` 现读 `action.yml` 后逐步执行；`skip` 只有 `npm ci`。

| # | 步骤 | exit | 耗时 |
| 1 | Install dependencies | ⏭️ 跳过 | — |
| 2 | Validate data (strict) | ✅ 0 | 0.3s |
| 3 | Reproducibility gate (no value without a source) | ✅ 0 | 0.2s |
| 4 | History verify (log consistent with deals.json) | ✅ 0 | 0.1s |
| 5 | Migration verifier (audience provenance backfill) | ✅ 0 | 0.1s |
| 6 | Translation gate (drift blocks, pending ages out) | ✅ 0 | 0.1s |
| 7 | Translation self-test | ✅ 0 | 13.3s |
| 8 | Expiry self-test | ✅ 0 | 0.1s |
| 9 | Text / cleanText self-test | ✅ 0 | 0.1s |
| 10 | Source-health self-test | ✅ 0 | 0.6s |
| 11 | Provenance self-test | ✅ 0 | 0.2s |
| 12 | Deal-history self-test | ✅ 0 | 0.2s |
| 13 | Change-radar self-test | ✅ 0 | 0.1s |
| 14 | Feeds self-test | ✅ 0 | 0.5s |
| 15 | SEO self-test | ✅ 0 | 0.2s |
| 16 | Audience self-test | ✅ 0 | 0.2s |
| 17 | App-token self-test | ✅ 0 | 0.3s |
| 18 | AI layer self-test | ✅ 0 | 2.3s |
| 19 | Collector fixtures (offline replay) | ✅ 0 | 0.3s |
| 20 | Plans self-test (data + page) | ✅ 0 | 0.8s |
| 21 | Plan-history self-test | ✅ 0 | 0.2s |
| 22 | Deal-plan-links self-test | ✅ 0 | 0.2s |
| 23 | API-plans self-test (data + page) | ✅ 0 | 0.3s |
| 24 | API-plans reproducibility (curated → api-plans.json, byte-compare) | ✅ 0 | 0.1s |
| 25 | API-plan-history verify (log consistent with api-plans.json) | ✅ 0 | 0.1s |
| 26 | Model-registry self-test (identity + explicit mapping) | ✅ 0 | 0.3s |
| 27 | Models reproducibility (registry → models.json, byte-compare) | ✅ 0 | 0.1s |
| 28 | Model-registry links check (explicit mapping only, no similarity) | ✅ 0 | 0.1s |
| 29 | Coverage report (gap list consistent with data) | ✅ 0 | 0.2s |
| 30 | Coverage-targets self-test (intent layer + seven derived states) | ✅ 0 | 0.8s |
| 31 | Model-role vocabulary self-test (registry ↔ freshness contract) | ✅ 0 | 0.1s |
| 32 | Freshness self-test (catalogStatus branches) | ✅ 0 | 0.1s |
| 33 | Freshness threshold sensitivity (±90 days, baseline invariants) | ✅ 0 | 0.1s |
| 34 | Assemble site (same path as deploy.yml) | ✅ 0 | 2.5s |
| 35 | Models-page self-test (index + detail pages) | ✅ 0 | 0.5s |
| 36 | Plans-hub self-test (/plans/) | ✅ 0 | 0.2s |
| 37 | Vendor-pages self-test (/vendor/) | ✅ 0 | 0.2s |
| 38 | Archive self-test (/archive/, synthetic ended/restored fixtures) | ✅ 0 | 0.1s |
| 39 | Data-docs self-test (/docs/data/ + /data/index.json) | ✅ 0 | 0.2s |
| 40 | Analytics self-test (bootstrap count / production guard / provider) | ✅ 0 | 8.9s |
| 41 | Feeds reproducibility (build twice, byte-compare) | ✅ 0 | 5.3s |
| 42 | Plans reproducibility (curated → plans.json, byte-compare) | ✅ 0 | 0.1s |
| 43 | Plan-history verify (log consistent with plans.json) | ✅ 0 | 0.1s |
| 44 | SEO verification (independent, from dist/) | ✅ 0 | 0.6s |
| 45 | Prepare browser for the real-browser gate | ✅ 0 | 7.7s |
| 46 | Browser availability decision (never silent) | ✅ 0 | 0.1s |
| 47 | Real-browser acceptance (verify-site.js) | ✅ 0 | 74.5s |
| 48 | Regression verify (baseline compare) | ✅ 0 | 76.3s |
| 49 | Gate conclusion | ✅ 0 | 0.1s |

---

## 2. 执行器自证：我读到的 run 体 == action.yml 的块标量内容

为什么必须自证：`check-ci-consistency` 的 `GATE_STEP_RUN` 是**逐字指纹**判据。执行器只要少一行、多一行空行、
少一层缩进，测的就不是门禁真正跑的东西。第一次运行时我的解析器把**块标量里的空行当成块结束**，
于是 45/46/49 三步各只跑了两行（那三个结果已作废，本报告用的是修正后的干净重跑）。

修正后的规则（与 YAML 块标量语义一致）：**空行属于块**；只剥掉块的公共缩进（保留行内相对缩进）；
`run: |` 之后那个换行是**块头**的结束符，不算内容。判据是**两条独立实现逐字相等**：

| 步骤 | 我的解析器 | 独立第二实现（直接抽原文再剥缩进） | 逐字一致 |
| Prepare browser for the real-browser gate | 1611 字符 | 1611 字符 | ✅ 逐字相同 |
| Browser availability decision (never silent) | 1470 字符 | 1470 字符 | ✅ 逐字相同 |
| Gate conclusion | 409 字符 | 409 字符 | ✅ 逐字相同 |

---

## 3. 附加验收逐条

### ② build A 与 build B 逐字节一致
`build-local.js --out=t18-a.building` 与 `--out=t18-b.building` 各跑一次，对**全部文件**取 sha256 建清单：

- 文件数 **293 / 293**，HTML **176 / 176**
- 清单 sha256：`829c0ce863114c526a398da72a7343286ba3275b4e3e54a55b881fa01c3456f8`（A）＝ 同值（B）
- 仅 A 有 / 仅 B 有 / 内容不同：**0 / 0 / 0** ⇒ 逐字节一致

### ③ 可复现三件套
- `models:rebuild --dry-run` → exit 0，`✓ models.json 与盘上逐字节一致`、`✓ model-registry-links.json 与盘上逐字节一致`、`--dry-run：没有写盘`
- `check:models:reproducible` → exit 0，`44 个模型 · 82 条映射`逐字节一致
- `report:coverage --json` 两次：exit 0/0，stdout sha256 **相同**（`identical=true`）

### ④ 真浏览器（不是"跳过并计绿"）
- 门禁第 45 步真实执行：`browser_available=true`、`executable=…ms-playwright\chromium-1243\chrome-win64\chrome.exe`
  （探针列表的第一项就是 playwright 期望路径，**本机命中**，所以第 46 步判定 `mode=full`、exit 0）
- 第 47 步 `verify-site.js`：**✅ 验收 735 项，失败 0 项**
- 第 48 步回归比对：**✅ 验收 741 项，失败 0 项**（首屏完整 9→9、页高 4589→4665px 在 15% 容差内、外部请求 0→0、JS 错误 0）
- 行为矩阵另证（把输入置真/假再跑同一条判定 shell）：`avail=true ⇒ mode=full exit 0`、
  `avail=false & allow=false ⇒ mode=none **exit 1**`、`avail=false & allow=true ⇒ mode=degraded exit 0 且留 ::warning`
  ⇒ 「浏览器不可用」这条路径**不会静默变绿**。

### ⑤ 独立重算（第二条路径，不复用 lib / 报告代码）
| 项 | 独立算得 | 报告读数 | 一致 |
|---|---|---|---|
| API 计价条目 | **93** | 93 | ✓ |
| API 已映射认领 | **81** | 81 | ✓ |
| API 已处置声明 | **12** | 12 | ✓ |
| API 未判 | **0** | 0 | ✓ |
| Coding 模型串 | **55** = 映射 13 + 已声明 42 | 55 / 13 / 42 | ✓ |

> **一次必须留档的自我更正**：attempt 1 的重算脚本猜错了两个字段名（gap 声明其实是**扁平**的
> `{apiPlanId, modelKey, variant}`；套餐模型串在 `supportedModels` 而不是 `models`），
> 那次得到 `unclaimed=12`、`declared=0` 的读数是**错的**。按真实形状重算后 4/4 一致，脚本见 `t18-recompute.cjs`。

### ⑥ Baseline Integrity Diff（六项，逐条结论）
| # | 项 | 结论 | 证据 |
|---|---|---|---|
| 1 | **Deals 未误删** | ✅ 未误删：135 = 80 deal + 55 tool，与基线**逐项相同**（delta 0/0） | 基线 `data.deals`=135/80/55；当前同值 |
| 2 | **History 未改写** | ✅ 未改写：门禁第 4 步 `history-verify` exit 0（**基线 + 事件重放 == 当前 deals.json**，这正是"历史没被改写"的机器判据）；第 12 步 `Deal-history self-test` exit 0。**注**：基线记录里没有 `deal-history` 事件条数字段，所以"当前 1 条"只是盘上读数，不与基线比 | 步骤读数（第 4 / 12 步） |
| 3 | **Feed / Manifest 变化有解释** | ✅ 无变化可解释：feed 文件 **50**（48 个子订阅 + 根 `feed.xml`/`feed.json`）＝ 基线 50；manifest 四键未变、`count=9 == datasets 9`，`data-docs` 自测绿。**注**：我的清点脚本一度报 51，是把 `/feeds/` **页面**也算成了 feed 文件，口径笔误已更正 | `t18-extras.json` 的 `inventory` |
| 4 | **sitemap 未丢详情页** | ✅ **80/80** 个 deal 详情页都在 sitemap，`missingDealPages=[]` | 同上 |
| 5 | **本地 Analytics 请求为 0** | ✅ verify-site 三条独立读数全 0：`真实资源计时里 0 次 Cloudflare 请求`、`网络层同样 0 次分析请求`、`白名单之外的外部请求 0 个`；`analytics-selftest` exit 0 | 第 47 步 stdout |
| 6 | **页数变化有解释** | ✅ HTML 173→**176**、sitemap 170→**173**，**+3 全部是新增的 `/vendor/` 页**（`aws` / `replit` / `stepfun`，22→共 23 个 vendor 目录含索引页）；`models` 45、`deal` 80、`need` 10、`category` 6、`plans` 3、`archive/changes/status/student/developer/free-api/docs/feeds` 各 1 **均未变** | `t18-extras.json` 的 `inventory.byDir` + 目录实测 |

---

## 4. 与 a4dd40f 的逐文件对账（214 个已跟踪变化 + 6 个未跟踪路径）

按目录汇总（`git diff --name-status a4dd40f`；逐目录的**文件数与归因**沿用本轮首次统计的口径，总数为 t41 收口时的重算值 —— 详见 `t18-extras.json` 的 `reconciliation`）：

| 目录 | 文件数 | 归因 |
|---|---|---|
| `research/_raw/**` | 105 | 本轮全部任务的证据与一次性脚本（t1 基线、t8/t9/t10 调查、t11/t23/t24 落盘脚本、t17 变异电池、t25 复算、t27/t28/t30/t32/t35 反证与边界留档） |
| `scripts/tools/**` | 16 | t23 接线（models-selftest / models-page-selftest / check-models-reproducible / check-model-registry-links / rebuild-models / build-local / validate）、t25 报告与契约、t27 反向登记制、t30 成对调用牙、t35 引文自称扫描、t7 登记 4 步 |
| `scripts/data/**` | 14 | t11/t23/t24 的数据落盘（links 82、gaps 54、providers 34、coverage-targets、source-health、snapshots、hi​story 等） |
| 根目录派生产物 | 7 | `models.json` / `model-registry-links.json` / `api-plans.json` / `plans.json` / `deals.json` / `deal-plan-links.json` 等按来源层重建（t23 已披露 `models.json` 的 16 行 `lastSeen` 归因） |
| `scripts/lib/**` | 6 | t23 双侧化处置、t30 切分集 `[/．._-]`、t35 删死常量 `PRECEDENCE`、t4 新鲜度策略等 |
| `.github/**` | 2 | t7 新增 4 步（45→49）+ t27 口径 37→38 |
| `docs/**` | 2 | SCHEMA-v3.0 双侧口径（t23）、DESIGN-RULES H10 边界（t35） |
| `research/*.md` | 5 | 模型当前性、provider 审查、来源健康裁决、数据质量审查、**残余登记表**（t20/t21 必须引用） |
| `scripts/validate.js` | 1 | t35 引文自称扫描 + `require.main` 守卫 |

**未跟踪路径 6 个**：t18/t41 的产物（`t18-*.json` / `t18-*.cjs` 与 `t41-*.json|cjs|md`）+ 队友的 `research/_raw/t43/`、`t45/`（本轮收口时重算，读数以 `t18-extras.json` 的 `reconciliation` 为准）。

> 每个文件都能落到**某个任务的某次提交**上（JSON 详表见 `t18-extras.json` 的 `reconciliation.files`，含 `lastCommit` 与 `uncommitted` 标记）。
> 没有任何"来路不明"的变化。**本节数字已由 t41 与 §9 的读数一起重算**（`t18-extras.cjs` 在本轮收口后重跑：已跟踪变化 214 / 未跟踪新增 6 / HEAD `118a95c`）。

---

## 5. ≥6 条变异复核（%TEMP% 副本，共享树逐字未变）

| # | 变异 | 对应承诺 | 对照 | 变异 | 结论 |
|---|---|---|---|---|---|
| M1 | 删 `scripts/data/model-registry-links.json` | t14-F1 / t25：关系层缺失必须判红 | exit 0 | **exit 1** | ✓ |
| M2 | `/models/` 索引里 slug+详情链接改名 | t14-F2：索引身份必须逐条对账 | exit 0 | **exit 1** | ✓ |
| M3 | 删 `gaps` 里一条 API 处置声明 | t23/t25 的反方向：处置与映射都不能留空 | exit 0 | **exit 1** | ✓ |
| M4 | 摘掉 `package.json` 的 `selftest:freshness`（action.yml 不动） | t27 的 (19) 反向登记制 | exit 0 | **exit 1** | ✓ |
| M5 | 给门禁某一步加 `continue-on-error: true` | (10) 不许静默跳过 | exit 0 | **exit 1** | ✓ |
| M6 | 删产物 `/data/index.json` | 数据文档自测缺件必须红 | exit 0 | **exit 1** | ✓ |

共享 worktree 自证：6 个受保护文件（links / gaps / package.json / action.yml / dist/models/index.html / dist/data/index.json）
的 sha256 **变异前后逐字相同**（`sharedTreeIntact=true`）。

---

## 6. 静止树自证

- **验收窗口内**：已跟踪文件逐一取 sha256（本轮收口后重算 = **758 个已跟踪文件**），前后 **0 个变化**；HEAD 稳定（`118a95c`）——`t18-extras.json` 的 `staticTree`（`trackedFiles=758` / `changedDuringRun=0` / `static=true` / `headStable=true`）
- **本次全量运行期间**：`concurrentEdits.headChanged=false`；`statusChanged=true` 的唯一来源是**队友的 selftest 清扫**
  （窗口内新增 `scripts/tools/api-plans-selftest.js`、`data-docs-selftest.js` 两个改动，属 t42 的同类工作，不是生产数据）
- 本任务**只读生产文件**：所有变异都在 `%TEMP%` 副本上做；我自己的产出全部落在
  `research/_raw/coverage-expansion-v1/**`（in-scope）

---

## 7. 发现（转 t16）

### T18-F1 [已修复 · t41] `vendor-page-selftest` 的 R5 冻结期望已过期（全量门禁当时唯一的红）
- **现象（修复前）**：`✗ 【R5】没有 A 空间厂商名的 provider 不建路由、逐条记 skip（JetBrains / Groq / Together AI / Fireworks AI / Cerebras / Trae / Qoder CN / 腾讯 CodeBuddy / Qoder International）`
- **根因**：`scripts/tools/vendor-page-selftest.js` 把期望**写死**成 `skippedNoIdentity.length === 4`
  且只认 4 个名字。t11 的推理平台身份与 t24 的 `jetbrains` 都按设计是 `vendorKey: null`，集合长到 **9 家** ⇒ 计数断言失败。
- **不是**"给无身份 provider 建了路由"的真缺陷（已核对：9 家在 `dist/vendor/` 里**都没有**路由；
  磁盘 22 个 vendor 目录 == 计划里 22 个有身份的厂商页 slug 集合）。
- **修法（t41，提交 `118a95c`）**：判据改**派生式** —— 对 `providers.json` 里每个 `vendorKey === null` 的身份逐条断言
  ① 有且恰好一条 `no-vendor-identity` skip 记录（且不带路由）② 计划层没有它的页 ③ `vendor-slugs.json` 里没有它的登记
  ④ 产物层 `dist/vendor/` 的目录集合**恰好等于**计划 slug 集合（多一个目录、少一个目录都红）。
  不写死 4、也不写死 9 —— 断言的对象是**关系**。
- **验证**：这一步现在 ✅ exit 0（57 项 0 失败）；现场读数（9 个 null 身份逐条 + 22 个有身份厂商页逐条）见
  `t41-derived-r5-readings.json` / `t41-*.md`；两个方向的反证（null 身份被建路由 ⇒ 红；有身份却没页 ⇒ 红）都在自测里。
### T18-F2 [info] `Install dependencies (npm ci)` 被如实跳过
理由：它是**环境准备**步骤，在共享 worktree 上重跑会删装 `node_modules` 并打断并发队友；
本机 `node_modules` 已就绪，且 49 步里其余 48 步都真的跑了。CI 上它必须跑（那里的干净检出需要它）。

### T18-F3 [info] 执行器自证（已修）
块标量里的空行曾被当成块结束 ⇒ 45/46/49 只跑两行。修正后与独立第二实现**逐字相等**（1611/1470/409 字符），
本报告用的是修正后的干净重跑（三个步骤分别 exit 0，浏览器链 `mode=full`）。

### T18-F4 [info] 并发编辑如实记录
两次运行期间 `git status` 变了（队友新增未跟踪研究产物），但**没有任何已跟踪文件变化**；静态树自证见 §6。

---

## 8. 复现命令

```bash
# 1) 全量门禁（49 步逐条读数，写 t18-gate-results.json）
node research/_raw/coverage-expansion-v1/t18-gate-runner.cjs
node research/_raw/coverage-expansion-v1/t18-gate-runner.cjs --list      # 只看动态枚举结果

# 2) 三个多行 shell 步骤 + 解析器逐字自证（写 t18-shell-steps.json）
node research/_raw/coverage-expansion-v1/t18-shell-steps.cjs

# 3) 对账 / 静止树 / check-ci 两种口径 / 产物清点（写 t18-extras.json）
node research/_raw/coverage-expansion-v1/t18-extras.cjs

# 4) 6 条变异复核（写 t18-mutations.json）
node research/_raw/coverage-expansion-v1/t18-mutations.cjs

# 5) 独立重算（写 t18-recompute.json）
node research/_raw/coverage-expansion-v1/t18-recompute.cjs

# 6) 摘要
node research/_raw/coverage-expansion-v1/t18-digest.cjs
```

> 产物：`t18-gate-results.json`（49 步含 stdout/stderr 尾 + 附加验收）· `t18-gate-run.log`（本次收口运行的人读全过程，与上一行同源同次）·
> `t18-shell-steps.json` · `t18-extras.json` · `t18-mutations.json` · `t18-recompute.json` · `t18-post-analysis.json` ·
> 历史（修复前）快照已改名保留：`t18-attempt12-pre-fix-run.log` / `t18-attempt12-pre-fix-run2.log`

---

## 9. 读数时间线：三套数字各是哪一次运行（t38 的 R3 / t41 收口）

**结论：本报告与 `t18-gate-results.json` 现在只有一套读数（48 过 / 0 红 / 1 跳过，HEAD `118a95c`）；
历史上出现过的「46」与「47」都自带上文，且都不是"最后那一次"的运行。**

| # | 时间（CST） | HEAD | 门禁读数 | 那条红是什么 | 产物 |
|---|---|---|---|---|---|
| 1 | 2026-10-04 ~21:10（attempt 1） | `9f27836` | **46 / 49 过**（当时的记录值） | Vendor-pages self-test（R5 计数写死，`FAIL ... exit 1`） | **没有留下这次运行的 log**；盘上最早保留的是第 2 行那一版（见 §9.1 的如实说明） |
| 2 | 2026-10-04 21:24（attempt 1） | `9f27836` | **47 过 / 1 红 / 1 跳过** | 同上（R5 那条） | `t18-attempt12-pre-fix-run2.log`（stdout 逐字："门禁步骤：47 过 / 1 红 / 1 跳过（共 49）"） |
| 3 | 2026-10-04 21:39（attempt 1） | `e437e9f` | **48 过 / 0 红 / 1 跳过** | 无（R5 已改派生式，这一步转绿） | `t18-attempt12-pre-fix-run.log` |
| 4 | **2026-10-04 21:54–21:57（t41 attempt 2，本报告）** | **`118a95c`** | **48 过 / 0 红 / 1 跳过** | **无** | **`t18-gate-results.json` + `t18-gate-run.log`（唯一权威）** |

### 9.1 「46」的两个含义（其中"过 46 步"这个读数**没有留下可核对的 log**）
- 任务书里写的「46/49 过」对应第 1 行。**如实说明**：这一次运行的 log 没被保留下来 —— 盘上最早保留的
  修复前快照是第 2 行（21:24，`47 过 / 1 红 / 1 跳过`，红的就是 R5 那一步）。
- 因此对「46」只能给出**两种可核对的解释**，并说明哪一种是本次能证实的：
  1. **可能在传输/转述时与旁边那个 46 混了**：`t18-gate-results.json` 里 Text/cleanText 自测的 stdout 是
     「✅ 文本清洗自测：**46 项**」—— 那是**自测项数**，不是门禁步数。两者出现在同一份产物里，
     正是 t38 R3 记的「相互矛盾的读数」的来源。
  2. **也可能是那一次真的只过了 46 步**（比第 2 行少 1 步）：例如 R5 之外还多出一步因解析器缺陷只跑了半截。
- **本次能证明的边界**：盘上保留的两份修复前快照分别给出 **47/49（21:24，红=R5）** 与 **48/49（21:39，0 红）**；
  修复前唯一那条红**确实只有 R5 那一步**（STEP 表的 `FAIL` 行只有一条）。所以"46 与 47 差的那一步"**不在保留的两份快照里**，
  不能凭本轮的产物断言它是什么 —— 这里只留下"不可证实"的结论，不替它编一个原因。

### 9.2 与最终 48/49 的差 = **1 步断言**（不是"解析器修好后多跑了 2 步"）
- 第 2 行 → 第 4 行只差 **Vendor-pages self-test 这一步**：它从 `FAIL exit 1` 变成 `PASS exit 0`。**没有多出任何步骤，也没有少跑任何步骤**（三行读数的 `total` 都是 49）。
- 解析器缺陷（块标量空行被当成块结束）影响的是**步骤 45/46/49 的 run 体内容**，不是步骤数：修正后三步各跑完整 run 体（1611/1470/409 字符，与独立第二实现逐字相等，见 §2）。
  那三个步骤在修正前后**都是 exit 0**，所以它**不改变过/红的计数**（第 2 行与第 4 行都含修正后的执行）。
- 计数对账（**唯一自洽的一套**）：49 = **48 过** + **0 红** + **1 跳过**（`npm ci`）；修复前那一版 49 = **47 过** + **1 红（Vendor-pages self-test / R5）** + **1 跳过**。

### 9.3 「并发编辑=true」的确切含义（不要让读者以为门禁期间生产数据被改了）
- 本次运行：`headChanged=false`（HEAD 全程 `118a95c`）；`statusChanged=true` 且 `beforeCount=8` → `afterCount=10`。
- 差集**只有 2 个文件**：`scripts/tools/api-plans-selftest.js`、`scripts/tools/data-docs-selftest.js` —— 队友 t42 的同类清扫在窗口内落笔（**不是**本次门禁改的，也不是生产数据）。
- 我自己的 4 个 in-scope 产物（`t18-extras.json` / 本报告 / `t18-gate-results.json` / `t41-derived-r5-readings.json`）在窗口前后都在 dirty 列表里，**属于"运行前就 dirty、运行期间未变"**。
- 生产数据（`deals.json` / `plans.json` / `api-plans.json` / `models.json` / 两份 registry 表）的 sha256 在 §3 的 `dataSha` 里逐项留档，运行期间未变。

### 9.4 与本次收口相关的两份历史日志已改名（消除"同名两套读数"）
- `t18-gate-run.log` / `t18-gate-run2.log` 这两个**不是驱动器写的**（驱动器只写 `t18-gate-results.json` 与 stdout），
  它们是 attempt 1 期间由 shell 重定向留下的**旧快照**，且与 `t18-gate-results.json` 是**不同次运行**的读数 ⇒ 已改名为
  `t18-attempt12-pre-fix-run.log`（21:39，48/49）与 `t18-attempt12-pre-fix-run2.log`（21:24，47/49），并在 §9 表里逐行标注时间与 HEAD。
- `t18-gate-run.log` 现在**只由 t41 这次收口运行生成**（`Tee-Object`），与 `t18-gate-results.json` 同源同次 ⇒ 两份产物一致。

