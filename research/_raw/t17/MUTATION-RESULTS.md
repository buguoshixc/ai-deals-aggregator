# t17 · Mutation / Tooth Test 电池 —— 运行记录

- 执行：freshness-engineer（t17，attempt 1 · attempt_id `05296185-fe9d-44a4-a422-85fac65712f6`）
- 运行时刻：`2026-10-04T12:45:11.318Z`（用例执行窗口起点 `2026-10-04T12:44:13.862Z`）
- 主机：win32 10.0.26100 · 14 逻辑核 · worker 6
- 可复跑脚本：`research/_raw/t17/mutation-battery.cjs` + 用例库 `research/_raw/t17/mutation-cases.cjs`
- 逐例原始记录（含 sha256 / 门禁 exit code / 断言原文）：`research/_raw/t17/logs/battery.json`
- 覆盖率：**CAUGHT 24/27** · 对照组 1 · 留档盲区 2 · 非预期红 0 · 变异应用失败 0

## 0. 方法（为什么这样测才算数）

| 项 | 做法 |
| --- | --- |
| 在哪变异 | **仓库外的沙箱** `D:\t17-mutation\gold`（从共享树复制，node_modules 用 junction 指回）。每个用例再从 gold 复制一份到 `cases/<id>/`，**在副本上**变异 —— 共享 worktree 全程只读 |
| 变异落在哪一层 | 一律落在**来源层** `scripts/data/**`（改产物会得到假阴性：t20/§21 电池踩过这个坑）；只有"产物渲染层"用例才动 `dist/**`（静态 HTML 丢行 / No-JS / filter 默认全显 / 逐格单位错位） |
| 逐字节恢复 | 每个用例先记录目标文件的 sha256 → 变异 → 跑门禁 → **用 gold 覆盖回写** → 重算 sha256 并与变异前比对（`restore[].byteExact`）。全程**不用** `git checkout/restore/stash` |
| 对照前提 | `M00` 不修改任何文件：13 道门禁必须全绿。它绿才说明"红"是变异引起的，不是环境本来就红 |
| 共享树证据 | 判据 = **所有用例的变异目标文件**在用例执行窗口内 sha256 未变（`mutationTargetsUnchanged`）。故意不把 setup 的整树复制算进窗口 —— 队友在那几十秒里的正常提交不该记在电池头上（本轮实测：窗口内 `scripts/data/curated_plans.json` 被队友改过，属正常提交，已如实列出） |
| 判据来源（本电池如何抓住"两条§70 没被抓住"这类错误） | 每条变异都逐例记录**哪道门禁非 0 + 断言原文**；`M24/M26` 明知抓不住也留着跑，并在 §3 用独立实验说明"为什么抓不住" |

## 1. 总表（预期红 = 实际红）

| # | 组 | 变异 | 落点 | 期望被谁抓住 | 实测红了哪些门禁（exit=1） | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| M00 | 对照 | 对照组：不修改任何文件，全部门禁必须绿 | `scripts/data/models.json` | 全绿（否则"红"不可解释） | — | **GREEN(PASS)** |
| M01 | A registry | 重复顶层 slug：models.json 里再写一遍 glm-5.3（后者静默覆盖前者） | `scripts/data/models.json` | 身份层「重复顶层键」牙 + 派生/校验层 | `validate-strict=1` `check-models-reproducible=1` `check-model-registry-links=1` `models-selftest=1` | **CAUGHT** |
| M02 | A registry | 手写派生字段：来源层给一条记录塞 catalogStatus | `scripts/data/models.json` | schema「派生字段不得手写」 | `validate-strict=1` `check-models-reproducible=1` `check-model-registry-links=1` `models-selftest=1` | **CAUGHT** |
| M03 | A registry | 非法 modelRole：把一条改成词表外的 role | `scripts/data/models.json` | 角色枚举校验 + 词汇表对账 | `validate-strict=1` `check-models-reproducible=1` `check-model-registry-links=1` `models-selftest=1` | **CAUGHT** |
| M04 | A registry | alias 撞 slug：把某条 alias 改成另一个模型的身份 | `scripts/data/models.json` | 别名唯一性牙 | `validate-strict=1` `check-models-reproducible=1` `check-model-registry-links=1` `models-selftest=1` | **CAUGHT** |
| M05 | A registry | releasedAt 改第三方域证据：日期不变、引文 URL 换成聚合站 | `scripts/data/models.json` | 官方域/引文来源门禁 | `validate-strict=1` `check-models-reproducible=1` `check-model-registry-links=1` `models-selftest=1` | **CAUGHT** |
| M06 | A registry | 去掉一条 identity 的 API 映射（关系层少一条记录） | `scripts/data/model-registry-links.json` | 身份唯一性/完整性牙 + 覆盖报告 | `validate-strict=1` `check-models-reproducible=1` `check-model-registry-links=1` `models-selftest=1` `report-coverage=1` | **CAUGHT** |
| M07 | A registry | 一条 pricing identity 映射到两个 registry 模型（通配覆盖第二条） | `scripts/data/model-registry-links.json` | 「同一条价格记录不许映射到两个模型」牙 | `validate-strict=1` `check-models-reproducible=1` `check-model-registry-links=1` `models-selftest=1` `report-coverage=1` | **CAUGHT** |
| M08 | A registry | 删掉一条 API 侧处置声明（计价条目既无映射也无处置） | `scripts/data/model-registry-gaps.json` | 「未判计价条目」牙（t23/t25 的口径） | `validate-strict=1` `check-models-reproducible=1` `check-model-registry-links=1` `models-selftest=1` `report-coverage=1` | **CAUGHT** |
| M09 | A registry | API 侧处置改成"能对上的身份"（拿不对应单一模型身份绕过映射） | `scripts/data/model-registry-gaps.json` | 「能对上的串必须去写映射」牙 | `validate-strict=1` `check-models-reproducible=1` `check-model-registry-links=1` `models-selftest=1` `report-coverage=1` | **CAUGHT** |
| M10 | A registry | 身份层加一个不在档位表里的角色（词汇表对账应红） | `scripts/lib/model-registry.js` | 角色词汇表契约守卫 | `model-role-vocabulary-selftest=1` `model-freshness-selftest=1` | **CAUGHT** |
| M11 | B plans | 手写派生字段：来源层给套餐塞 derivedMetrics | `scripts/data/curated_plans.json` | 「派生字段不得手写」牙 | `validate-strict=1` `plans-selftest=1` `check-plans-reproducible=1` | **CAUGHT** |
| M12 | B plans | billing 单位错位：per_1M 证据配 per_1K 定价单位 | `scripts/data/curated_api_plans.json` | 价格单位同类牙 | `validate-strict=1` `check-api-plans-reproducible=1` | **CAUGHT** |
| M13 | B plans | 第三方证据标成官方：聚合站 URL 写成官方定价页引文 | `scripts/data/curated_api_plans.json` | 官方域/出处牙 | `validate-strict=1` `check-api-plans-reproducible=1` | **CAUGHT** |
| M14 | C targets | 覆盖目标少一行（provider 表有、targets 没有） | `scripts/data/coverage-targets.json` | 目标层完整性/双向对账牙 | `coverage-targets-selftest=1` `report-coverage=1` | **CAUGHT** |
| M15 | C targets | 覆盖目标挂到一个不存在的 provider | `scripts/data/coverage-targets.json` | 目标层「provider 必须存在」牙 | `coverage-targets-selftest=1` `report-coverage=1` | **CAUGHT** |
| M16 | C targets | 覆盖目标字段缺失（删掉 intent） | `scripts/data/coverage-targets.json` | 目标层必填字段牙 | `coverage-targets-selftest=1` `report-coverage=1` | **CAUGHT** |
| M25 | C targets | 把「延期不算漏了」的真实判定改掉（deriveDimension 里给 DEFERRED 加一条 MISSING 短路） | `scripts/lib/coverage-targets.js` | DEFERRED 永不算 MISSING（覆盖目标层的关键牙 —— 它守的是真实分支，不是常量表） | `coverage-targets-selftest=1` | **CAUGHT** |
| M26 | C targets | 改掉没人读的 PRECEDENCE 常量（文档化顺序 vs 真实分支） | `scripts/lib/coverage-targets.js` | **留档的已知盲区**：PRECEDENCE 只被定义与导出、没有任何生产者读取它 ⇒ 改它不动任何行为，没有门禁该红（真实判定在 deriveDimension 的 if 链里） | — | **NOT_CAUGHT(KNOWN)** |
| M17 | D gate | 生产门禁静默降级：把 gate 的 allow_degraded_run 传参改成恒真表达式 | `.github/workflows/verify.yml` | 「必需路径不得静默降级」牙（(11) 按触发事件求值） | `check-ci-consistency=1` | **CAUGHT** |
| M18 | D gate | 健康层：无头来源不可用却仍标 healthy（改判定分支） | `scripts/lib/health.js` | 健康组合矩阵牙 | `health-selftest=1` | **CAUGHT** |
| M19 | E page | 静态 HTML 丢行：/models/ 索引删掉一整行（No-JS 下少一个模型） | `dist/models/index.html` | 页面静态表与 registry 的行集合对账 | `models-page-selftest=1` | **CAUGHT** |
| M20 | E page | No-JS 丢行：删掉「显示旧型号」筛选脚本块（No-JS 语义被破坏） | `dist/models/index.html` | 页面脚本存在性/No-JS 断言 | `models-page-selftest=1` | **CAUGHT** |
| M21 | E page | filter 默认全显：把 showHidden 的默认判定改成恒真 | `dist/models/index.html` | 默认隐藏集合牙（页面/独立 join） | `models-page-selftest=1` | **CAUGHT** |
| M22 | E page | 逐格单位错位：详情页把价格单位改成「每 1000 tokens」（数值不动） | `dist/models/glm-4.5v/index.html` · `dist/models/glm-4.6v/index.html` · `dist/models/deepseek-v4-pro/index.html` · `dist/models/kimi-k3/index.html` | 逐格单位/数值对账（本轮新增牙；全绿即 NOT_CAUGHT 发现） | `models-page-selftest=1` | **CAUGHT** |
| M23 | F history | 改写已落盘的历史（套餐历史加一条伪造 created 事件） | `scripts/data/plan-history.json` | 历史不可改写牙（套餐/API 历史校验） | `check-plan-history=1` `plan-history-selftest=1` | **CAUGHT** |
| M24 | G selftest | 把 provenance 自测的牙拔掉（失败不再入 failures 队列 ⇒ 自测恒绿） | `scripts/tools/provenance-selftest.js` | **留档的已知盲区**：provenance-selftest 的牙是合成夹具牙，拔掉后无第三方门禁能抓（见 probe-provenance-teeth.cjs 的 T1：连"把真实引文改成编造文本"它也 114/114 绿） | — | **NOT_CAUGHT(KNOWN)** |

## 2. 逐字节恢复（每条都成立）

| # | 目标文件 | 变异前 sha256 | 恢复后 sha256 | byteExact |
| --- | --- | --- | --- | --- |
| M00 | `scripts/data/models.json` | `e7c82ae086744911…` | `e7c82ae086744911…` | ✅ |
| M01 | `scripts/data/models.json` | `e7c82ae086744911…` | `e7c82ae086744911…` | ✅ |
| M02 | `scripts/data/models.json` | `e7c82ae086744911…` | `e7c82ae086744911…` | ✅ |
| M03 | `scripts/data/models.json` | `e7c82ae086744911…` | `e7c82ae086744911…` | ✅ |
| M04 | `scripts/data/models.json` | `e7c82ae086744911…` | `e7c82ae086744911…` | ✅ |
| M05 | `scripts/data/models.json` | `e7c82ae086744911…` | `e7c82ae086744911…` | ✅ |
| M06 | `scripts/data/model-registry-links.json` | `116bad28c1d2687a…` | `116bad28c1d2687a…` | ✅ |
| M07 | `scripts/data/model-registry-links.json` | `116bad28c1d2687a…` | `116bad28c1d2687a…` | ✅ |
| M08 | `scripts/data/model-registry-gaps.json` | `8bac901bec1e3856…` | `8bac901bec1e3856…` | ✅ |
| M09 | `scripts/data/model-registry-gaps.json` | `8bac901bec1e3856…` | `8bac901bec1e3856…` | ✅ |
| M10 | `scripts/lib/model-registry.js` | `7acfb2353d24b30a…` | `7acfb2353d24b30a…` | ✅ |
| M11 | `scripts/data/curated_plans.json` | `e5e53bc6a6360460…` | `e5e53bc6a6360460…` | ✅ |
| M12 | `scripts/data/curated_api_plans.json` | `17748f512c5a7ae2…` | `17748f512c5a7ae2…` | ✅ |
| M13 | `scripts/data/curated_api_plans.json` | `17748f512c5a7ae2…` | `17748f512c5a7ae2…` | ✅ |
| M14 | `scripts/data/coverage-targets.json` | `16f55ba0197be64b…` | `16f55ba0197be64b…` | ✅ |
| M15 | `scripts/data/coverage-targets.json` | `16f55ba0197be64b…` | `16f55ba0197be64b…` | ✅ |
| M16 | `scripts/data/coverage-targets.json` | `16f55ba0197be64b…` | `16f55ba0197be64b…` | ✅ |
| M25 | `scripts/lib/coverage-targets.js` | `e66c56b384523dd7…` | `e66c56b384523dd7…` | ✅ |
| M26 | `scripts/lib/coverage-targets.js` | `e66c56b384523dd7…` | `e66c56b384523dd7…` | ✅ |
| M17 | `.github/workflows/verify.yml` | `7fd395e2ad40e261…` | `7fd395e2ad40e261…` | ✅ |
| M18 | `scripts/lib/health.js` | `bf8278b01378301e…` | `bf8278b01378301e…` | ✅ |
| M19 | `dist/models/index.html` | `3f88534f1a83bb01…` | `3f88534f1a83bb01…` | ✅ |
| M20 | `dist/models/index.html` | `3f88534f1a83bb01…` | `3f88534f1a83bb01…` | ✅ |
| M21 | `dist/models/index.html` | `3f88534f1a83bb01…` | `3f88534f1a83bb01…` | ✅ |
| M22 | `dist/models/glm-4.5v/index.html` | `78d3f6c5facc7d49…` | `78d3f6c5facc7d49…` | ✅ |
| M22 | `dist/models/glm-4.6v/index.html` | `cffa17e27f860584…` | `cffa17e27f860584…` | ✅ |
| M22 | `dist/models/deepseek-v4-pro/index.html` | `7ed2c81153027b66…` | `7ed2c81153027b66…` | ✅ |
| M22 | `dist/models/kimi-k3/index.html` | `a38af0fac352cc74…` | `a38af0fac352cc74…` | ✅ |
| M23 | `scripts/data/plan-history.json` | `667a048176671a24…` | `667a048176671a24…` | ✅ |
| M24 | `scripts/tools/provenance-selftest.js` | `fe9b0e107f2c0d2e…` | `fe9b0e107f2c0d2e…` | ✅ |

**恢复失败数**：0（0 = 每条都逐字节复原）

## 3. 留档的已知盲区（NOT_CAUGHT(KNOWN)）—— 这是电池最该产出的东西

### M26 · 改掉没人读的 PRECEDENCE 常量（文档化顺序 vs 真实分支）

- **变异**：`"replaceOnce"` → `const PRECEDENCE = ['NOT_APPLICABLE', 'DEFERRED', 'UNVERIFIA`
- **期望**：**留档的已知盲区**：PRECEDENCE 只被定义与导出、没有任何生产者读取它 ⇒ 改它不动任何行为，没有门禁该红（真实判定在 deriveDimension 的 if 链里）
- **实测**：`coverage-targets-selftest=0` · `report-coverage=0`（全绿 ⇒ 没有任何门禁会红）

### M24 · 把 provenance 自测的牙拔掉（失败不再入 failures 队列 ⇒ 自测恒绿）

- **变异**：`"replaceOnce"` → `  if (ok) { pass++; return; }
  failures.push(`${name}${deta`
- **期望**：**留档的已知盲区**：provenance-selftest 的牙是合成夹具牙，拔掉后无第三方门禁能抓（见 probe-provenance-teeth.cjs 的 T1：连"把真实引文改成编造文本"它也 114/114 绿）
- **实测**：`provenance-selftest=0`（全绿 ⇒ 没有任何门禁会红）

### 3.1 盲区 M24 的独立验证（`probe-provenance-teeth.cjs`，输出见 `probe-provenance-teeth.txt`）

- **T0 基线**：`provenance-selftest` exit=0，`✅ provenance 自测：114 项通过，0 项失败`
- **T1 把一条真实记录的引文改成编造文本**（`deals.json` 里 `4987c183fc1a` 的 `evidence[0].quote` → 「完全编造的引文…」）⇒ 自测**仍然 exit=0、114/114 绿**。
  ⇒ 该自测的 114 项断言**跑的是合成夹具**，没有任何一项拿"盘上真实记录的引文"去对账；也就是说「引文是不是真的」这件事在仓库里**没有独立门禁**（t15 独立审查里的 F1/F2 正是这一类问题：cerebras 引文是改写件却自称"逐字"）。
- **T2 拔掉 `check()` 的失败入队**（M24 的变异）⇒ exit=0，且**没有第三方门禁**能发现。
- 恢复核对：`deals.json` 与 `provenance-selftest.js` 均 `byteExact=true`。

### 3.2 盲区 M26 的独立验证（`diag-m25.txt`）

- `scripts/lib/coverage-targets.js` 的 `PRECEDENCE` 常量**只被定义与 `module.exports` 导出，没有任何生产者读取它**（`grep PRECEDENCE` 在仓库里只有定义行与导出行）。
- 真实优先级判定在 `deriveDimension()` 的 `if` 链里（`!applicable → NOT_APPLICABLE`；`ruling → UNVERIFIABLE / DEFERRED`）。
- 所以"把 `PRECEDENCE` 里 MISSING 提到最前"**不动任何行为**，没有门禁该红 —— 但那份顺序读起来像是权威判据，属"文档化顺序 vs 真实分支"的漂移面。
- **反证（同一语义的真牙是好的）**：`M25` 把 `deriveDimension()` 里 DEFERRED 分支加一条 `row.count === 0 → MISSING` 短路，`coverage-targets-selftest` 立刻红 ⇒ 「DEFERRED 永不算 MISSING」这条牙**守的是真实分支**。

## 4. 共享树证据（电池没有污染共享工作树）

- 变异目标文件在用例执行窗口内逐字节未变：**true**
- 证据口径：电池只在仓库外沙箱里变异。判据是「所有用例的变异目标文件在用例执行窗口内逐字节未变」——这直接证明电池没写共享树；GUARDED 里其余文件的差异可能来自队友的正常提交（都会被逐条列出）
- 窗口内被改动过的 GUARDED 文件（属队友正常提交，不是电池写的）：（无）

## 5. 复跑方式

```powershell
cd .worktrees/coverage-expansion-v1
node research/_raw/t17/mutation-battery.cjs                    # 全部 27 条
node research/_raw/t17/mutation-battery.cjs --only=M01,M19     # 指定用例
node research/_raw/t17/probe-provenance-teeth.cjs              # 复现 §3.1 的盲区实验
node research/_raw/t17/report.cjs                              # 由 logs/battery.json 重新生成本文件
```

退出码：0 = 全部用例预期红=实际红、逐字节恢复成立、且变异目标文件未变；非 0 = 有需要人工看的项（会逐条打印）。

## 6. 本电池覆盖的 §70 面（对照本轮"另加新增变异"清单）

| 题目点名的变异 | 对应用例 |
| --- | --- |
| 静态 HTML 丢行 | M19 |
| No-JS 丢行 | M20 |
| filter 默认全显 | M21 |
| releasedAt 改第三方域 | M05 |
| catalogStatus 手写 | M02 |
| DEFERRED 被算成 MISSING | M25（真分支）/ M26（常量表的漂移面） |
| 阈值扰动 | cross-ref：`scripts/tools/model-freshness-sensitivity.js`（12 情景、`--json` 两次逐字节一致）+ `model-freshness-selftest.js` 的同幅平移牙 4 条（t17 的电池不重复实现策略扰动，见 §7） |

## 7. 与既有牙的分工（避免重复造第二套）

- `scripts/tools/*-selftest.js` 里的**合成夹具牙**（provenance 24 处、models-page 15 处、freshness 3 处…）继续由各自的自测负责；本电池负责"**打到真实树上**还有没有牙"以及"**牙被拔掉之后有没有人发现**"。
- 阈值扰动属"策略层灵敏度"，已由 `model-freshness-sensitivity.js`（我的 t4 产物）覆盖；本电池只在 M25/M26 里覆盖"阈值/优先级语义被改坏"这一类。

---

> 生成方式：`node research/_raw/t17/report.cjs`（只读 `logs/battery.json`，不重跑门禁）
