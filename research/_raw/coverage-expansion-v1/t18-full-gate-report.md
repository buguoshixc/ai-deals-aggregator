# t18 · 本地 Full Gate 报告（本轮唯一可信的全量门禁结论）

- **HEAD**：`9f27836`（`test(research): 引文自称扫描脚本（t35 的前提证据：真实数据 0 命中）`）
- **工作树**：`.worktrees/coverage-expansion-v1` · 分支 `coverage-expansion-v1` · 基线 `a4dd40f`
- **口径（动态读取，不写死历史项数）**：action.yml **49 步** · `verify.yml:118 --expect-checks=38` ·
  `package.json` scripts 94 / `selftest:*` 25
- **基线数字**一律引用 `research/_raw/coverage-expansion-v1/baseline.json`（含 t1 的实测更正：gate 45 / expect-checks 37 /
  deal-plan-links links=5,retired=0 / futurepedia 连续失败 9 / dist 173 由基线 SHA 上隔离构建一手数出）
- **驱动器**：`t18-gate-runner.cjs`（步骤表现读 action.yml，逐条执行并记录 exit；`npm ci` 之外一步不落）

> **本结论的适用对象（必须与结论一起引用）**：跑的那棵树是
> **HEAD `9f27836` + 4 个**已经处于 dirty 状态的**未提交**文件 ——
> `scripts/lib/coverage-targets.js`、`scripts/tools/provenance-selftest.js`、`scripts/validate.js`、`docs/DESIGN-RULES.md`
> （t35 的在途改动）。它们在本轮运行**之前就是 dirty、运行期间逐字未变**
> （`t18-gate-results.json` 的 `statusBefore` 与 `statusAfter` 去掉未跟踪项后**完全相同**）。
> 换句话说：**这不是"纯 HEAD"的门禁读数，而是"HEAD + t35 在途改动"的读数**；
> t35 提交之后，节数不会变，但若要写进最终报告，请以提交后的树再复跑一次本驱动器确认。

---

## 0. 一句话结论

> **49 步里 47 过、1 红、1 跳过。**唯一的红是 **Vendor-pages self-test `/vendor/`**（R5 的**冻结期望过期**，见 §7 T18-F1），
> 跳过的是环境准备步骤 `npm ci`（§7 T18-F2）。**契约 Verify 列出的五条命令全部 exit 0**；
> 可复现、独立重算、真浏览器、六项完整性对账全部通过。
> ⇒ **在 R5 修好之前，本轮不能声称「本地全量门禁全绿」**；CI 会在同一步红（`deploy.yml` 的 prepublish 与 `collect.yml` 都会跑这一步）。

| 维度 | 结果 |
|---|---|
| 门禁步骤 | **47 / 49 过**（1 红、1 跳过） |
| `validate --strict` | ✅ exit 0 |
| `check-ci-consistency`（裸跑，自读 verify.yml=38） | ✅ **38 项 0 失败**；`--expect-checks=38` ✅；**`--expect-checks=37` ❌ exit 1**（外部钉住仍有牙） |
| `build-local` / build A vs B | ✅ exit 0 · **293 文件逐字节一致**（manifest sha `829c0ce8…` 两次相同） |
| 真浏览器 `verify-site` + 回归比对 | ✅ **735/0** 与 **741/0**（exit 0，浏览器链 `mode=full`） |
| `models:rebuild --dry-run` + `check:models:reproducible` | ✅ 均 exit 0（44 模型 / 82 映射逐字节一致） |
| `report:coverage --json` ×2 | ✅ exit 0，**两次输出逐字节一致** |
| 独立重算 vs 报告 | ✅ **4/4 一致**（93 / 81 / 12 / 0） |
| ≥6 条变异复核 | ✅ **6/6**（对照绿、变异红） |
| 静止树自证 | ✅ 718 个已跟踪文件在验收窗口内 **0 个变化**；HEAD 稳定 |

---

## 1. 49 步逐条读数

> 全部由 `t18-gate-runner.cjs` 现读 `action.yml` 后逐步执行；`skip` 只有 `npm ci`。

| # | 步骤 | exit | 耗时 |
|---|---|---|---|
| 1 | Install dependencies | ⏭️ 跳过 | — |
| 2 | Validate data (strict) | ✅ 0 | 0.4s |
| 3 | Reproducibility gate (no value without a source) | ✅ 0 | 0.2s |
| 4 | History verify (log consistent with deals.json) | ✅ 0 | 0.1s |
| 5 | Migration verifier (audience provenance backfill) | ✅ 0 | 0.1s |
| 6 | Translation gate (drift blocks, pending ages out) | ✅ 0 | 0.1s |
| 7 | Translation self-test | ✅ 0 | 12.8s |
| 8 | Expiry self-test | ✅ 0 | 0.1s |
| 9 | Text / cleanText self-test | ✅ 0 | 0.1s |
| 10 | Source-health self-test | ✅ 0 | 4.0s |
| 11 | Provenance self-test | ✅ 0 | 0.2s |
| 12 | Deal-history self-test | ✅ 0 | 0.2s |
| 13 | Change-radar self-test | ✅ 0 | 0.1s |
| 14 | Feeds self-test | ✅ 0 | 0.5s |
| 15 | SEO self-test | ✅ 0 | 0.2s |
| 16 | Audience self-test | ✅ 0 | 0.1s |
| 17 | App-token self-test | ✅ 0 | 0.3s |
| 18 | AI layer self-test | ✅ 0 | 2.3s |
| 19 | Collector fixtures (offline replay) | ✅ 0 | 0.4s |
| 20 | Plans self-test (data + page) | ✅ 0 | 0.7s |
| 21 | Plan-history self-test | ✅ 0 | 0.2s |
| 22 | Deal-plan-links self-test | ✅ 0 | 0.2s |
| 23 | API-plans self-test (data + page) | ✅ 0 | 0.6s |
| 24 | API-plans reproducibility (curated → api-plans.json, byte-compare) | ✅ 0 | 0.1s |
| 25 | API-plan-history verify (log consistent with api-plans.json) | ✅ 0 | 0.1s |
| 26 | Model-registry self-test (identity + explicit mapping) | ✅ 0 | 0.2s |
| 27 | Models reproducibility (registry → models.json, byte-compare) | ✅ 0 | 0.1s |
| 28 | Model-registry links check (explicit mapping only, no similarity) | ✅ 0 | 0.1s |
| 29 | Coverage report (gap list consistent with data) | ✅ 0 | 0.1s |
| 30 | Coverage-targets self-test (intent layer + seven derived states) | ✅ 0 | 0.8s |
| 31 | Model-role vocabulary self-test (registry ↔ freshness contract) | ✅ 0 | 0.1s |
| 32 | Freshness self-test (catalogStatus branches) | ✅ 0 | 0.1s |
| 33 | Freshness threshold sensitivity (±90 days, baseline invariants) | ✅ 0 | 0.1s |
| 34 | Assemble site (same path as deploy.yml) | ✅ 0 | 2.4s |
| 35 | Models-page self-test (index + detail pages) | ✅ 0 | 0.5s |
| 36 | Plans-hub self-test (/plans/) | ✅ 0 | 0.2s |
| 37 | Vendor-pages self-test (/vendor/) | ❌ 1 | 0.2s |
| 38 | Archive self-test (/archive/, synthetic ended/restored fixtures) | ✅ 0 | 0.1s |
| 39 | Data-docs self-test (/docs/data/ + /data/index.json) | ✅ 0 | 0.2s |
| 40 | Analytics self-test (bootstrap count / production guard / provider) | ✅ 0 | 9.7s |
| 41 | Feeds reproducibility (build twice, byte-compare) | ✅ 0 | 5.3s |
| 42 | Plans reproducibility (curated → plans.json, byte-compare) | ✅ 0 | 0.1s |
| 43 | Plan-history verify (log consistent with plans.json) | ✅ 0 | 0.1s |
| 44 | SEO verification (independent, from dist/) | ✅ 0 | 0.5s |
| 45 | Prepare browser for the real-browser gate | ✅ 0 | 20.6s |
| 46 | Browser availability decision (never silent) | ✅ 0 | 0.1s |
| 47 | Real-browser acceptance (verify-site.js) | ✅ 0 | 68.6s |
| 48 | Regression verify (baseline compare) | ✅ 0 | 68.4s |
| 49 | Gate conclusion | ✅ 0 | 0.0s |

---

## 2. 执行器自证：我读到的 run 体 == action.yml 的块标量内容

为什么必须自证：`check-ci-consistency` 的 `GATE_STEP_RUN` 是**逐字指纹**判据。执行器只要少一行、多一行空行、
少一层缩进，测的就不是门禁真正跑的东西。第一次运行时我的解析器把**块标量里的空行当成块结束**，
于是 45/46/49 三步各只跑了两行（那三个结果已作废，本报告用的是修正后的干净重跑）。

修正后的规则（与 YAML 块标量语义一致）：**空行属于块**；只剥掉块的公共缩进（保留行内相对缩进）；
`run: |` 之后那个换行是**块头**的结束符，不算内容。判据是**两条独立实现逐字相等**：

| 步骤 | 我的解析器 | 独立第二实现（直接抽原文再剥缩进） | 逐字一致 |
|---|---|---|---|
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

## 4. 与 a4dd40f 的逐文件对账（158 个已跟踪变化 + 12 个未跟踪路径）

按目录汇总（`git diff --name-status a4dd40f`）：

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

**未跟踪路径 12 个**：本次 t18 的 8 个产物（`t18-*.json` / `t18-*.cjs`）+ 队友的 `research/_raw/t17/diag/`、`t35/`、`t36/`、`t38/`。

> 每个文件都能落到**某个任务的某次提交**上（JSON 详表见 `t18-extras.json` 的 `reconciliation.files`，含 `lastCommit` 与 `uncommitted` 标记）。
> 没有任何"来路不明"的变化。

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

- **验收窗口内**：718 个已跟踪文件逐一取 sha256，前后**0 个变化**；HEAD 稳定（`9f27836`）——`t18-extras.json` 的 `staticTree`
- **两次全量运行之间**：`statusChanged=true`（队友新增了 `research/_raw/t36/`、`t38/` 等**未跟踪**产物），
  但 **HEAD 未变、已跟踪的生产文件未变**（两次运行记录的 6 个关键数据文件 sha256 相同）
- 本任务**只读生产文件**：所有变异都在 `%TEMP%` 副本上做；我自己的产出全部落在
  `research/_raw/coverage-expansion-v1/**`（in-scope）

---

## 7. 发现（转 t16）

### T18-F1 [blocker] `vendor-page-selftest` 的 R5 冻结期望已过期 ⇒ 全量门禁唯一的红
- **现象**：`✗ 【R5】没有 A 空间厂商名的 provider 不建路由、逐条记 skip（JetBrains / Groq / Together AI / Fireworks AI / Cerebras / Trae / Qoder CN / 腾讯 CodeBuddy / Qoder International）`
- **根因**：`scripts/tools/vendor-page-selftest.js:258-261` 把期望**写死**成 `skippedNoIdentity.length === 4`
  且只认 `['Trae','Qoder CN','Qoder International','腾讯 CodeBuddy']`。t11 的推理平台身份与 t24 的 `jetbrains`
  都按设计是 `vendorKey: null`，于是这个集合长到 **9 家** ⇒ `length === 4` 失败。
- **不是**"给无身份 provider 建了路由"的真缺陷（已核对：9 家在 `dist/vendor/` 里**都没有**路由；
  23 个 vendor 目录 = 1 个索引 + 22 个有身份的厂商页）。
- **要求（t16）**：把冻结期望更新为当前集合，或改成从 `providers.json` 派生（`vendorKey === null` 的 provider 必须逐条 skip 且不得有路由）——
  后者更抗漂移；改完请把这一步跑绿，并复跑一次本报告第 1 节的全量读数。

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

> 产物：`t18-gate-results.json`（49 步含 stdout/stderr 尾 + 附加验收）· `t18-gate-run2.log`（人读全过程）·
> `t18-shell-steps.json` · `t18-extras.json` · `t18-mutations.json` · `t18-recompute.json` · `t18-post-analysis.json`
