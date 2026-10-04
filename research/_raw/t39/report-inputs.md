# t39 · 最终报告（t20）素材清单 —— 按节组织，每条读数带出处与现场取值

> 用途：**部署一完成就能直接写 t20**，不必那时再到满仓库找读数。
> 本文件**不是报告正文**（正文由 t20 在 t19 之后写）。
>
> - 采集器：`node research/_raw/t39/collect.cjs`（人读）/ `--json`（机器读，**同状态两次运行逐字节一致**）
> - 本文件的每条读数都由 t39 **现场跑出来**（命令逐条给出）；凡未跑的，一律写 **『未核对』**，不写"预计/应该"。
> - 写法约定：`值` = 现场取值；`出处` = 复现命令或文件；`t20 用法` = 建议写进报告哪一节。
> - 采集批次：2026-10-04（t39 attempt 1）· 采集时 `HEAD = e437e9f` · 分支 `coverage-expansion-v1` · 领先 `origin/master` **16** 个提交 · 基线 `a4dd40f`。

---

## §A 本轮目标与范围

| 读数 | 现场取值 | 出处 |
|---|---|---|
| 分支 / HEAD / 基线 | `coverage-expansion-v1` / `e437e9f` / `a4dd40f` | `git rev-parse --abbrev-ref HEAD` · `git rev-parse --short HEAD` · 基线见各报告表头 |
| 领先 origin/master 的提交数 | **16** | `git rev-list --count origin/master..HEAD` |
| 最终报告要交代的节（题面 §90） | 19 节：Baseline / Before-After / Coverage Architecture / Provider Universe / 12 家 Candidate Review / Coding Review / Model Freshness / Currentness Migration / Coverage Results / Data Added / Data Not Added / Source Health / Reproducibility / Gate / CI-Deploy / Online Smoke / Data Integrity / Remaining Risks | t20 的任务描述（team.json 的 t20 行）；本节即按它取材 |
| 覆盖报告 v2 与机器可读输出（题面 §41/§42） | 见 §E；一条命令 `node scripts/tools/coverage-report.js --json` 同时给出文本与 JSON | 同上 |

**t20 用法**：§A 只写"范围与口径"，不要在这里堆数字。

---

## §B 数据扩充（provider / plans / api-plans / coverage-targets / registry currentness）

出处（全部现场复算）：`node research/_raw/t39/collect.cjs --json` 的 `data` 段；逐项原始文件亦可单独读。

| 读数 | 现场取值 | 出处 |
|---|---|---|
| `models.json` schemaVersion / count / 条数 | **2 / 44 / 44** | `models.json`（`node -e` 读 `schemaVersion/count/models.length`） |
| 来源层 `scripts/data/models.json` 非 `_` 键 | **44** | 同上 |
| `catalogStatus` 分布 | **unknown 40 · current 3 · legacy 1**（aging 0 / historical 0） | `models.json` 按 `catalogStatus` 计数 |
| `modelRole` 分布 | **general 24 · vision 8 · fast 6 · other 2 · translation 2 · embedding 1 · coding 1** | `models.json` 按 `modelRole` 计数 |
| `releasedAt` 有值 / 为 null | **4 / 40**（有值者：deepseek-flash 2026-09-10 · deepseek-v3.2 2025-12-01 · deepseek-v4-pro 2026-08-13 · minimax-m3 2026-06-01） | `models.json` 的 `releasedAt`；逐条证据见 `research/coverage-expansion-v1-model-currentness.md` |
| 声明了 `freshnessGroup` 的条数 | **1**（`deepseek-flash` = `current-mainline`） | `models.json` |
| `plans.json` schemaVersion / count / 条数 / provider 数 | **1 / 37 / 37 / 18** | `plans.json` |
| `api-plans.json` schemaVersion / 记录数 / 计价条目 / 不同 modelKey / provider 数 | **1 / 17 / 93 / 66 / 14** | `api-plans.json` |
| `coverage-targets.json` schemaVersion / 行数 / reviewedAt | **1 / 34 / 2026-10-04** | `scripts/data/coverage-targets.json` |
| providers 注册数 | **34** | `scripts/data/providers.json` 非 `_` 键 |
| 目标层七态分布（34 行 × 4 维度 = 136 格） | **COVERED 64 · NOT_APPLICABLE 50 · MISSING 17 · DEFERRED 2 · UNVERIFIABLE 2 · PARTIAL 1 · BLOCKED_SOURCE 0**（和 = **136**） | `node scripts/tools/coverage-report.js --json` 的 `coverageTargets.states` |
| 候选总账 | **total 40 · adopted 13 · notAdopted 21** | 同上 `candidates` |
| 未采纳 provider 列 | **13 项** | 同上 `gaps.notAdoptedProviders[]` |
| `/models/` 索引产物 | 存在 · **143263 字节** · `data-model` 行 **44** · `data-item` 行 **44** · 含 `models-show-legacy` **true** | `dist/models/index.html`（`collect.cjs` 的 `data.modelsIndexPage`） |
| 数据质量审查（t15） | verdict **needs_revision**（F1/F2 medium、F3 medium、F4–F8 low、F9 info） | `research/coverage-expansion-v1-data-quality-review.md`（sha256 见 §I） |

**t20 用法**：Data Added 一节直接搬本表；"Before-After"用 provider 33→34、plans 29→37、api-plans 13→17、coverage-targets 0→34 这四组（Before 值来自 t1 的 baseline）。

---

## §C Model Registry v2 与 API 侧处置（14 条映射 + 12 条声明）

出处：`node research/_raw/t39/collect.cjs --json` 的 `data.links` / `data.gaps` / `coverageReport.registry`；
另可单独跑 `node scripts/tools/coverage-report.js`（文本里就有方程行）。

| 读数 | 现场取值 | 出处 |
|---|---|---|
| 关系层 schemaVersion / 总条数 | **2 / 82** | `scripts/data/model-registry-links.json` |
| 关系层 API 侧 / Coding 侧 | **69 / 13** | 同上 |
| 关系层带 evidence 的条数 | **61**（API 侧 59 + Coding 侧 2） | 同上（第 4.3 节的"抄件逐字耦合"读的就是 API 侧那 59） |
| 处置登记 schemaVersion / 总条数 | **2 / 54** | `scripts/data/model-registry-gaps.json` |
| 处置登记 Coding 侧 / API 侧 | **42 / 12** | 同上 |
| API 侧处置理由分布 | **off-registry-model 12** | 同上 |
| 计价条目记账方程 | **93 = 已映射认领 81 + 已处置声明 12 + 未判 0** | `node scripts/tools/coverage-report.js`（文本行"API 侧记账"）；JSON 的 `registry.mappedApiEntries/declaredApiEntries` |
| 套餐侧模型串记账 | **55 = 已映射 13 + 已声明 42 + 未判 0** | 同上（`registry.planModelStrings/mappedPlanModelCount/declaredPlanModels`） |
| 未映射模型 / 未映射套餐串 | **0 / 0** | 同上 |
| API 侧处置逐条留档 | **12 行**（`declaredApiEntryRows[]`） | 同上 JSON |
| t23 的 14 条映射落盘脚本 | `research/_raw/coverage-expansion-v1/t23-land-api-dispositions.cjs`（幂等 · 自带断言 · 第二次跑"已是目标状态"） | t23 任务 output |
| 门禁层复核 | `node scripts/tools/check-model-registry-links.js` → **exit 0**；`node scripts/validate.js --strict` → **exit 0**（2 条 pre-existing 优惠合并警告） | 现场跑（`collect.cjs` 的 `gates`） |

**t20 用法**：Model Registry v2 一节写清"两侧各有出口、同一本账"（映射 / 处置），并给方程行原文。

---

## §D 门禁登记与自测清单

出处：`node research/_raw/t39/collect.cjs --json` 的 `gates` 段（每条都现场 spawn 过）。

| 读数 | 现场取值 | 出处 |
|---|---|---|
| gate 复合 action 具名步骤数 | **49**（`- name:` 计 49，`uses`/`run` 无裸步骤） | `.github/actions/gate/action.yml` |
| `check-ci-consistency` 断言数 | **38**；看门狗自述「实跑 37 条 = 冻结清单 37 条 + 本看门狗」 | `node scripts/tools/check-ci-consistency.js` 末行 |
| `--expect-checks=38` | **exit 0** | 同上（默认调用方钉的就是 38） |
| `--expect-checks=37`（反证） | **exit 1**，失败 1 项：`实跑 38 项 ≠ 钉住 37 项` | `node scripts/tools/check-ci-consistency.js --expect-checks=37` |
| 反向登记制 | 扫 **26** 个 `*selftest*.js`，26 个都有门禁指向，**豁免 0 条** | 同上（断言 (19)） |
| `package.json` 的 `selftest:*` 条数 | **25** | `package.json`（`collect.cjs` 的 `gates.selftestScripts.keys` 全列出） |
| `validate --strict` | **exit 0**（警告 2 条：Getsolved / KREA 疑似未合并优惠） | `node scripts/validate.js --strict` |
| `check-models-reproducible` | **exit 0**（`44 个模型 · 82 条映射 · updatedAt=2026-10-04T00:00:00+08:00`） | `node scripts/tools/check-models-reproducible.js` |
| `check-model-registry-links` | **exit 0**（候选 API 0 条 · 套餐 0 条） | `node scripts/tools/check-model-registry-links.js` |
| `models-selftest` | **143 项通过 / 0 失败** | `node scripts/tools/models-selftest.js` |
| `models-page-selftest` | **115 项通过 / 0 失败** | `node scripts/tools/models-page-selftest.js` |
| `coverage-targets-selftest` | **96 项通过 / 0 失败** | `node scripts/tools/coverage-targets-selftest.js` |
| `model-freshness-selftest` | **100 项通过 / 0 失败** | `node scripts/tools/model-freshness-selftest.js` |
| `model-role-vocabulary-selftest` | **7 项通过 / 0 失败** | `node scripts/tools/model-role-vocabulary-selftest.js` |
| `provenance-selftest` | **132 项通过 / 0 失败**（t35 由 114 → 132） | `node scripts/tools/provenance-selftest.js` |
| `feeds-selftest` | **144 项通过 / 0 失败** | `node scripts/tools/feeds-selftest.js` |
| **未核对**（t39 不跑，留给 t18/t20） | `build-local` 的构建 ×2 逐字节一致、`verify-site` 真浏览器项数、`report:coverage --json` 两次逐字节一致（后者 t39 已单独核对：**逐字节一致**，见 §H） | — |

**t20 用法**：Gate 一节用"步骤数 + 断言数 + 反证"三件套；每个 selftest 给项数**与**退出码。

---

## §E 覆盖报告 v2 与机器可读输出（题面 §41/§42）

出处：`node scripts/tools/coverage-report.js --json`（**exit 0**；文本在前、JSON 在后，`collect.cjs` 用括号配对取出载荷块）。

| 读数 | 现场取值 |
|---|---|
| deals（provider / currentDeals / expiredDeals / tools） | **31 / 80 / 0 / 55** |
| 工具行厂商数（对照，不计入） | **52** |
| coding plans | **37** |
| api（providers / pricingRecords / modelPricingItems / distinctModelKeys） | **14 / 17 / 93 / 66** |
| registry 三件套在位 | `registryPresent / linksPresent / gapsPresent` = **true / true / true** |
| 方程行（文本原文） | `API 侧记账：计价条目 93 条 = 已映射认领 81 + 已处置声明 12 + 未判 0` |
| coverageTargets（schemaVersion / reviewedAt / 校验问题数） | **1 / 2026-10-04 / 0** |
| coverageTargets 七态 | COVERED 64 · NOT_APPLICABLE 50 · MISSING 17 · DEFERRED 2 · UNVERIFIABLE 2 · PARTIAL 1 · BLOCKED_SOURCE 0（和 136） |
| generatedAt（报告自报） | **2026-10-04**（数据日期，不是运行时刻 ⇒ 报告 JSON 可复现） |
| 报告自检 | `✅ 覆盖报告自检通过（0 处问题）`（exit 0） |

**t20 用法**：Coverage Results 一节用方程行 + 七态分布；§42 的机器可读输出要写清"JSON 与文本同源、两次运行逐字节一致"。

---

## §F 变异电池结果（t17）

出处：`research/_raw/t17/MUTATION-RESULTS.md`（现场抽取的原文行：`覆盖率：**CAUGHT 24/27** · 对照组 1 · 留档盲区 2 · 非预期红 0 · 变异应用失败 0`）。

| 读数 | 现场取值 | 出处 |
|---|---|---|
| 用例总数 / CAUGHT / 对照组 | **27 / 24 / 1** | `collect.cjs` 的 `evidence.mutationBattery` |
| 留档盲区（NOT_CAUGHT(KNOWN)） | **2**（M24 拔牙 · M26 死常量） | 同上；逐条见 `MUTATION-RESULTS.md` §3 |
| 非预期红 / 变异应用失败 / 逐字节恢复失败 | **0 / 0 / 0** | 同上 |
| 共享树证据 | 变异目标文件在用例执行窗口内 **sha256 未变 = true** | 同上 §4 |
| 电池脚本（可复跑） | `research/_raw/t17/mutation-battery.cjs`（`--only=` / `--strict`）· 用例库 `mutation-cases.cjs` | 同上 |
| 盲区 M24 的独立验证 | 把真实记录 `4987c183fc1a` 的引文改成编造文本 ⇒ `provenance-selftest` 仍 **114/114 绿**（当轮项数） | `research/_raw/t17/probe-provenance-teeth.txt` |
| 盲区 M26 的收尾 | `PRECEDENCE` 已删除（`diff --numstat` = `13 3`）；M25 复跑 ⇒ `coverage-targets-selftest` **exit 1 · 10 项失败** | `research/_raw/t35/m26-m25-replay.cjs`；本表 §I 的登记表 §4.3 |

**t20 用法**：Mutation 一节**必须**同时写"24 条抓住"与"2 条留档盲区"，并链接残余登记表 §4.3 的消歧（两条同名 M24）。

---

## §G 两份独立审查与其结论

| 审查 | 结论（现场值） | 出处（含整文件 sha256 前 16 位） |
|---|---|---|
| t15 数据质量独立审查（官方性与身份正确性） | verdict = **needs_revision**；F1/F2/F3 medium、F4–F8 low、F9 info；核心结论：**数值面零错误**，问题集中在"证据字段的表达保真度" | `research/coverage-expansion-v1-data-quality-review.md` · **21454 bytes** · sha256 `c794cdc0d7c5d21d…` |
| t26 对抗性独立审查（t23 的 API 处置门禁能否被绕过） | verdict = **pass**；六条 acceptance 全满足；12 条声明 × 17 个探测键 × 4 类精确相等探测 ⇒ 对 44 个折叠身份命中 **0**；删任一条声明六个门禁全红；另有 2 条**不阻塞**加固建议 | `research/_raw/t26/report.md` · **19828 bytes** · sha256 `3d24ec8a5608a2eb…` |
| t17 变异电池（独立"牙"审查） | CAUGHT **24/27**，盲区 2（见 §F） | `research/_raw/t17/MUTATION-RESULTS.md` · **17910 bytes** · sha256 `661a1684e3609e14…` |
| t35 M24 边界（引文验真到底有没有门禁） | **三层覆盖、没有第四层**；禁止措辞两条 | `research/_raw/t35/M24-BOUNDARY.md` · **4330 bytes** · sha256 `0555cfc3e54f6c82…` |
| 调查物料（4 路调查合并） | provider-review 最终版 **35677 bytes** / 原始版 **20605 bytes** / model-currentness **34526 bytes** / source-health 裁决 **18418 bytes** | 见 `collect.cjs` 的 `evidence.evidenceFiles`（含各自 sha256） |

**t20 用法**：两份审查各占一小节，写"审的是什么 / 结论 / 落地到哪"；数字直接引本表。

---

## §H 残余登记表（34 + sha256 + §4.1/§4.2/§4.3）

出处：`research/coverage-expansion-v1-residual-register.md`（t36 刚追加过 §4.3）。

| 读数 | 现场取值 | 出处 |
|---|---|---|
| 仲裁条数 | **34** | `collect.cjs` 的 `evidence.residualRegister.arbitrationCount`（登记表 §2 的 `| **条数** | **34** |` 行） |
| 清单 sha256（全串，逐字保留） | `b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696` | 同上（`arbitrationSha256Present = true`） |
| 登记表整文件 | **44497 bytes** · sha256 `b8b055223e7575874b10f69a68095bcf849e1b0208085d830fd64b9c1c27ed71` | `sha256sum research/coverage-expansion-v1-residual-register.md`（或 `collect.cjs`） |
| 收录的节 | **§0 · §1B · §2 · §4.1 · §4.2 · §4.3 · §6**（另有 §1 · §3 · §5） | 同上（`sections`） |
| t36 追加 | 是（`t36（本次更新` 命中）—— §4.3「M24 的边界结论（t35）」+ §6 变更记录 | 同上 |
| §4.1 / §4.2 / §4.3 各是什么 | §4.1 = T15-F6 **被证伪**（审查员拿错对照物）；§4.2 = T26-F1 **举例更正**（结论不变）；§4.3 = M24 三层覆盖 + 两条同名 M24 消歧 + M26 收尾 | 登记表正文 |
| 覆盖报告 JSON 两次运行 | **逐字节一致**（stdout sha256 `7e50e31df838c966…`；JSON 段 sha256 `72b2bab384489e1a…`；`generatedAt` 稳定为 `2026-10-04`） | `node scripts/tools/coverage-report.js --json` ×2（t39 现场跑） |

**t20 用法**：Remaining Risks 一节直接引登记表（**不要另起名单**）——表头就写着"t20/t21 必须引用本表"。

---

## §I 部署与线上冒烟 —— **只有部署后才能填的格子**

> 这些格子在部署前**没有值**。t39 **只列格子，不臆造值**；来源是 **t19（CI → merge → Deploy → 线上冒烟）**，由 **t20** 填进报告。
> 机器可读的格子清单：`node research/_raw/t39/collect.cjs --json` 的 `deployPlaceholders.cells`（14 格）。

| # | 格子 | 含义 | 取值方式（建议命令） | 现值 |
|---|---|---|---|---|
| 1 | `onlineUrl` | 线上站点 URL | t19 的 PR / Deploy 输出 | **待填** |
| 2 | `deployRunConclusion` | Deploy workflow 的 job/步骤结论（prepublish / build / deploy） | GitHub Actions 运行页 或 `gh run view` | **待填** |
| 3 | `gateRequiredCheckName` | PR 上的必需检查名与结论 | `gh pr checks <n>` | **待填** |
| 4 | `lastModifiedBefore` | 部署前 `/models/` 的 Last-Modified | `curl -sI <url>/models/` | **待填** |
| 5 | `lastModifiedAfter` | 部署后 `/models/` 的 Last-Modified | 同上 | **待填** |
| 6 | `etagBefore` | 部署前 ETag | 同上 | **待填** |
| 7 | `etagAfter` | 部署后 ETag | 同上 | **待填** |
| 8 | `onlineDataModelCount` | 线上 `/models/` 的 `data-model` 计数（应 = registry 模型数） | `curl -s <url>/models/ \| grep -o 'data-model="' \| wc -l` | **待填** |
| 9 | `onlineDataItemCount` | 线上 `/models/` 的 `data-item` 计数 | 同上（换 `data-item`） | **待填** |
| 10 | `onlineLegacyToggleCount` | 线上 `models-show-legacy` 计数（应 ≥ 1） | `curl -s <url>/models/ \| grep -c models-show-legacy` | **待填** |
| 11 | `onlineCatalogStatusDistribution` | 线上暴露的目录状态分布 | 按 `data-catalog-status` 统计 | **待填** |
| 12 | `smokeVerifySiteResult` | 线上小规模冒烟（真浏览器）项数与失败数 | `node scripts/tools/verify-site.js --base=<url>`（参数名以脚本 `--help` 为准，t39 **未核对**该参数） | **待填** |
| 13 | `cdnCacheNote` | CDN 缓存导致观察延迟的说明 | t37 实测 **600 秒** | **待填（说明可先写死 600s）** |
| 14 | `remoteBranchState` | 远端分支/合并事实（是否已推、PR 是否已合并） | `git ls-remote` / `gh pr view` | **待填** |

**本地对照值（部署前已测得，可作"部署后应该看到什么"的预期基线）**：`dist/models/index.html` 的 `data-model` = **44** · `data-item` = **44** · 含 `models-show-legacy` = **true** · 目录状态分布 = **unknown 40 / current 3 / legacy 1**（出处见 §B）。

**t20 用法**：Online Smoke 一节**先写"未部署 ⇒ 以下为部署后填充"**，再逐格填；`before/after` 两列必须成对出现（t34 的 §4.1 纪律：**"没有差异"是最需要证据的一句话**）。

---

## §J 明确未做 / 已知边界

出处：各任务 output 与残余登记表；t39 **只汇总，不新增**。

| 边界 | 现场取值 / 表述 | 出处 |
|---|---|---|
| 真实引文是否忠于官方页 | **没有离线门禁**；由三层覆盖（(a) 抄件逐字耦合 59 条一致/不一致 0 · (b) 独立审查抓到 4 条改写件 → t33 提交 `af92d5d` · (c) 自称牙 292 条 quote / 13 篇文件 · 0 命中）；**没有第四层** | 登记表 §4.3；`research/_raw/t35/M24-BOUNDARY.md` |
| 禁止措辞 | 不许写「真实引文已逐条验真」「0 命中 ⇒ 引文都是真的」 | 同上 |
| `aging` / `historical` 在真实数据上 | **0 条**（只有夹具证明这两档能渲染） | 登记表 §1 (b) |
| 价格 schema 表达力缺口 | 12 条 `DEFER-INF-01..12` + 打包价 / 季付 / 积分 / 按小时 / 年付（刻意不落盘、不换算） | 登记表 §1 (f) |
| Tabnine | `not-adopted`（官方独立档价面已不存在，302 → Tricentis 联系表单） | 登记表 §1 (d) |
| 三家 unverifiable | xAI / Mistral / Cohere 形态各不相同（fetch failed / 只能取到导航） | 登记表 §1 (c) |
| Amazon Q 时效 | 2027-04-30 起停支 IDE 插件、指向 Kiro；**Kiro 不在本轮范围** | 登记表 §1 (e) |
| 历史引文未点名模型 | **34 条**（列为残余 (a)，机器不可核价格归属） | 登记表 §1 (a) + §2 |
| 变异留档盲区 | M24-①（测试改自己，构造上接不住）· M26（死常量，已删 ⇒ 该变异再也落不下去） | 登记表 §4.3 |
| t39 自身未做的 | **不写报告正文**、不改登记表、不动生产文件；`build-local` / `verify-site` / 真浏览器**未跑**（属 t18/t19/t20） | 本文件 + t39 任务边界 |

---

## §K 复跑方式（一条命令拿到全部离线读数）

```powershell
cd .worktrees/coverage-expansion-v1

# 人读
node research/_raw/t39/collect.cjs

# 机器读（确定性：同状态两次运行逐字节一致）
node research/_raw/t39/collect.cjs --json

# 上面的 determinism 核对（两次跑 + sha256 比对 + 关键字段打印）
node research/_raw/t39/verify-determinism.cjs

# 覆盖报告（t20 的 §41/§42 素材）
node scripts/tools/coverage-report.js --json
```

**确定性口径**：`collect.cjs` **不读墙上时钟、不读 git 工作区状态**；输出里没有运行时刻/耗时字段。
唯一与时间有关的是两个**数据自带**的日期字符串：`apiPlans.updatedAt`（来源层写死）与
`coverageReport.generatedAt`（覆盖报告自报，实测稳定为 `2026-10-04`）。
刻意**不采集**的量：`git status` 的脏文件数（会因队友并发编辑而变）——t20 若要写，请自己现场跑并注明时刻。

**t39 现场核对结果**：两次 `--json` 均为 **96854 bytes**、sha256 `02dc435cc940c4912f814e30c2a0048ab349fca916dd366b8c3ab127c744f727`（**逐字节一致**）；
`coverage-report --json` 两次 stdout sha256 均为 `7e50e31df838c966…`（同上）。

---

## §L（t46 append-only 口径更正）L169 的「JSON 段 sha256」不可复现 —— 原文一字未动

> **本节纪律**：上面 L169 那一行（含 `72b2bab384489e1a…`）**原样保留**，不改、不删。本节只做两件事：
> ① 说明那个数字为什么不能当基线引用；② 给出可复跑的口径与当前值。依据 = t45 §4.1（在同一份 stdout 上试了
> **31 种**「JSON 段」定义，无一命中该前缀）+ t46 现场复算。

- **不可复现**：`72b2bab384489e1a…` 既不是载荷块、也不是任何常见的子对象 / 编码 / 拼接形式（t45 §4.1 逐条列出）。
  因此它**不构成 determinism 基线**：t20 与后续报告**不得引用它**（引用一个没有定义的数字，等于把不可复现的东西写进结论）。
- **该引什么**（两种口径，**必须连定义一起写**）：
  1. **stdout sha256**（推荐）：两次 `node scripts/tools/coverage-report.js --json` 的**完整 stdout 字节**的 sha256。
  2. **载荷段 sha256**：从 stdout 里按**括号配对**切出**第 2 个** JSON 块（顶层同时含 `registry` 与 `api` 的那个；
     第 1 个是 freshness 策略快照）的**原文**的 sha256。切法与 t45 `extract-payload.cjs` / t39 `collect.cjs` 同口径。
- **值会随报告内容变** —— 引值时必须连**内容版本**一起引：

| 内容版本 | stdout sha256 | 载荷段 sha256 |
| --- | --- | --- |
| t25 / t39 / t45 记录的那一版（t46 之前） | `7e50e31df838c9667adf36aa741dd7a6d89b851f2ef64b1ce7a096fc61aeb751` | `7dd8cc8f0847bb7d0bb98ec57145f9f9ea5e5716fb290158f58a2044715eff7f` |
| **t46 之后（当前）**：文本 + JSON 新增五态普查行 / 四个 §41 条目英文名 / R8 来源宇宙对照 / 候选明细进 JSON | `ff039fa40a804a2d5e5a9004509670e3eb9babfd6db33723f2b6e3b5beab9dcf` | `5288c615e4fc39fa4850db4630b4315e1b226febd21775ff673071ff0f04be77` |

  （两次运行 stdout 逐字节一致 = `true`；218443 B → 218443 B。）
- **L246 那句「两次 stdout sha256 均为 `7e50e31d…`」仍然成立，但描述的是 t46 之前那一版输出**：
  那一版的自检结论（两次逐字节一致、0 处问题）与当前版本一致；值不同只是因为报告内容按 t46 的验收要求变多了。
- **复跑**：`node research/_raw/t46/hashes-and-readings.cjs`（两条口径各算一次 + 五态普查 / 候选明细 / 来源宇宙的读数，机器可读加 `--json`）。
