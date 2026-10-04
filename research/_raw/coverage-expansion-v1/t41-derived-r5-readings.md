# t41 · R5 判据派生式：现场读数与反向牙（T18-F1 收口）

> 任务：t41（repair）。把 `scripts/tools/vendor-page-selftest.js` 的 R5 期望从**写死计数**改成**派生式判据**，
> 补两侧反证，复跑全量门禁到 48/49，并把 t18 的**两套矛盾读数**合并成一份自洽产物。
>
> 机器可读同源文件：`t41-derived-r5-readings.json`（现场读数）· `t41-reverse-teeth.json`（反向牙实验）·
> `t18-gate-results.json` + `t18-gate-run.log`（全量门禁，同一次运行）。

- **HEAD**：`118a95c` · 分支 `coverage-expansion-v1` · 基线 `a4dd40f`
- **判据（派生式）**：派生式：对 providers.json 里每个 vendorKey === null 的身份，逐条要求 (a) 恰好 1 条 no-vendor-identity 记录且不带路由 (b) 计划层无页 (c) vendor-slugs.json 无登记 (d) dist/vendor/ 目录集合 == 计划 slug 集合
- **现场计数**：providers 34 · `vendorKey === null` **9 家** · 有身份 25 家 · 厂商页 **22 个** · 磁盘目录 **22 个**
- **读数与哈希**：`scripts/data/providers.json` `07d216b4965043c9…` · `scripts/data/vendor-slugs.json` `459e0b4a77d4f601…` · `dist/vendor` 目录清单 `98651e70cbe0bc42…`

---

## 1. 判据改成了什么（不写死 4、也不写死 9）

对 `scripts/data/providers.json` 里**每一个** `vendorKey === null` 的身份，逐条要求四件事：

| # | 断言 | 为什么必须有 |
|---|---|---|
| (a) | `extPlan.skipped` 里有且**恰好一条** `no-vendor-identity` 记录，且该记录**不带路由** | 「不建路由」必须是计划层主动记下的事实，而不是"悄悄没有" |
| (b) | 计划层**没有**它的厂商页 | 计划层自己就不许产出这条路由 |
| (c) | `scripts/data/vendor-slugs.json` 里**没有**以它为键的登记 | 否则 slug 会绕开身份检查 |
| (d) | 产物层 `dist/vendor/` 的目录集合**恰好等于**计划里的 slug 集合 | 多一个目录 = 给谁建了计划外的路由；少一个 = 计划里有页而磁盘上没有 |

断言的对象是**关系**（身份 ↔ skip 记录 ↔ 计划 ↔ 磁盘 ↔ 登记表），**没有一个数字常量参与判定**。
计数只出现在**消息文本**里（"9 个没有 A 空间厂商名的身份…"、"计划里的 22 个 slug"），是给人读的现场读数，不是判据。

判据本体是一个纯函数 `nullIdentityProblemsOf({ names, skipped, pages, dirs, slugs })` —— 真实数据与合成输入走同一条路径，
所以两个方向的反证不需要另写一套逻辑（见 §3）。

---

## 2. 现场读数

### 2.1 9 个 `vendorKey === null` 的身份逐条

| 身份 | skip 记录数 | skip 的 route | 计划层有页 | 有页的 route | vendor-slugs 里有登记 | 判定 |
|---|---|---|---|---|---|---|
| JetBrains | 1 | null | 无 | null | 无 | ✅ OK |
| Groq | 1 | null | 无 | null | 无 | ✅ OK |
| Together AI | 1 | null | 无 | null | 无 | ✅ OK |
| Fireworks AI | 1 | null | 无 | null | 无 | ✅ OK |
| Cerebras | 1 | null | 无 | null | 无 | ✅ OK |
| Trae | 1 | null | 无 | null | 无 | ✅ OK |
| Qoder CN | 1 | null | 无 | null | 无 | ✅ OK |
| 腾讯 CodeBuddy | 1 | null | 无 | null | 无 | ✅ OK |
| Qoder International | 1 | null | 无 | null | 无 | ✅ OK |

⇒ 9/9 条全部 OK：**每家都有恰好一条 skip、都没有页、都没有登记**。

### 2.2 22 个有身份厂商页逐条（计划 route ↔ 磁盘目录）

| 身份 | slug | route | 磁盘目录 | count | 靠非优惠资料达标 | Coding 套餐 | API 记录 | 模型 | 判定 |
|---|---|---|---|---|---|---|---|---|---|
| 百度智能云 | `baidu-ai-cloud` | `vendor/baidu-ai-cloud/` | 有 | 17 | 是 | 2 | 0 | 0 | ✅ |
| 火山引擎 | `volcengine` | `vendor/volcengine/` | 有 | 13 | 是 | 0 | 1 | 4 | ✅ |
| 智谱AI | `zhipu` | `vendor/zhipu/` | 有 | 12 | 是 | 1 | 1 | 8 | ✅ |
| 扣子 Coze | `coze` | `vendor/coze/` | 有 | 4 | 否 | 0 | 0 | 0 | ✅ |
| GitHub | `github` | `vendor/github/` | 有 | 3 | 是 | 3 | 0 | 0 | ✅ |
| MiniMax（稀宇科技） | `minimax` | `vendor/minimax/` | 有 | 3 | 是 | 3 | 1 | 4 | ✅ |
| 科大讯飞 | `iflytek` | `vendor/iflytek/` | 有 | 2 | 是 | 2 | 0 | 0 | ✅ |
| Microsoft | `microsoft` | `vendor/microsoft/` | 有 | 2 | 否 | 0 | 0 | 0 | ✅ |
| Notion | `notion` | `vendor/notion/` | 有 | 2 | 否 | 0 | 0 | 0 | ✅ |
| 阿里云 | `aliyun` | `vendor/aliyun/` | 有 | 1 | 是 | 0 | 2 | 9 | ✅ |
| 硅基流动 | `siliconflow` | `vendor/siliconflow/` | 有 | 1 | 是 | 0 | 1 | 6 | ✅ |
| 阶跃星辰 | `stepfun` | `vendor/stepfun/` | 有 | 1 | 是 | 4 | 0 | 1 | ✅ |
| 腾讯云 | `tencent-cloud` | `vendor/tencent-cloud/` | 有 | 1 | 是 | 0 | 1 | 6 | ✅ |
| 月之暗面 | `moonshot` | `vendor/moonshot/` | 有 | 1 | 是 | 1 | 0 | 2 | ✅ |
| Anthropic | `anthropic` | `vendor/anthropic/` | 有 | 1 | 是 | 1 | 1 | 4 | ✅ |
| AWS | `aws` | `vendor/aws/` | 有 | 1 | 是 | 2 | 0 | 0 | ✅ |
| Cursor | `cursor` | `vendor/cursor/` | 有 | 1 | 是 | 1 | 0 | 0 | ✅ |
| Google | `google` | `vendor/google/` | 有 | 1 | 是 | 2 | 1 | 4 | ✅ |
| OpenAI | `openai` | `vendor/openai/` | 有 | 1 | 是 | 0 | 2 | 4 | ✅ |
| Replit | `replit` | `vendor/replit/` | 有 | 1 | 是 | 2 | 0 | 0 | ✅ |
| Windsurf | `windsurf` | `vendor/windsurf/` | 有 | 1 | 是 | 2 | 0 | 0 | ✅ |
| DeepSeek | `deepseek` | `vendor/deepseek/` | 有 | 0 | 是 | 0 | 2 | 3 | ✅ |

### 2.3 磁盘目录集合 vs 计划 slug 集合

- 磁盘 `dist/vendor/` 目录数：**22**（索引 `index.html` 之外全是厂商页目录）
- 计划 slug 数：**22**
- 相等：**true** · 孤儿目录：`[]` · 缺目录：`[]`

### 2.4 反方向（有身份 + 靠非优惠资料达标，却没有页）

- `identityWithMaterialButNoPage` = `[]`（空集 ⇒ 没有漏页）
- 有身份共 25 家，其中 22 家建了页；差额 3 家的非优惠资料**没有达到门槛**（不是"漏页"——门槛判据与判据层同在 `landing.shouldGenerateLandingPage`）。

---

## 3. 反向牙实验（%TEMP% 忠实副本，共享 worktree 逐字未动）

副本：`C:\Users\星澈\AppData\Local\Temp\t41-copy-215933`（`robocopy /E` 全量拷贝，排除 `node_modules` / `.git` / `.worktrees`）。

| 变体 | 构造 | 期望 | 实得 exit | 汇总 | 判定 |
|---|---|---|---|---|---|
| **A** | `vendor-slugs.json` 里给 **null 身份 Groq** 加一条 `"Groq": "groq"` 登记（= 让它被当成有身份去建路由） | **红** | 1 | === v3.0 厂商统一资料页演练：56 项通过，1 项失败 === | ✅ 有牙 |
| **B** | 撤销变异（恢复原 `vendor-slugs.json`）后重跑 | **绿** | 0 | === v3.0 厂商统一资料页演练：57 项通过，0 项失败 === | ✅ 对照组绿 |
| **C** | 删掉一个有身份厂商页的产物目录 `dist/vendor/zhipu/` | **红** | 1 | === v3.0 厂商统一资料页演练：54 项通过，3 项失败 === | ✅ 有牙 |

### 3.1 变体 A 的红（逐条）

- `✗ 【R5】9 个没有 A 空间厂商名的身份：逐条有 skip 记录，且计划 / 磁盘 / 登记表里都没有它的路由（JetBrains / Groq / Together AI / Fireworks AI / Cerebras / Trae / Qoder CN / 腾讯 CodeBuddy / Qoder International） —— Groq: vendor-slugs.json 里不该有它的登记`
- `✗ 【R5】9 个没有 A 空间厂商名的身份：逐条有 skip 记录，且计划 / 磁盘 / 登记表里都没有它的路由（JetBrains / Groq / Together AI / Fireworks AI / Cerebras / Trae / Qoder CN / 腾讯 CodeBuddy / Qoder International）`

### 3.2 变体 C 的红（逐条 —— 原方向没被删弱）

- `✗ 【R5】9 个没有 A 空间厂商名的身份：逐条有 skip 记录，且计划 / 磁盘 / 登记表里都没有它的路由（JetBrains / Groq / Together AI / Fireworks AI / Cerebras / Trae / Qoder CN / 腾讯 CodeBuddy / Qoder International） —— 计划里有页、磁盘上没有：zhipu`
- `✗ 【R5】dist/vendor/ 磁盘目录集合 == 计划里的 22 个 slug（多一个目录就是给谁建了路由） —— 磁盘 21 个 / 计划 22 个`
- `✗ dist 现场：22 个厂商页的资料区块与数据逐项对账 —— vendor/zhipu/: 缺少产物`
- `✗ 【R5】9 个没有 A 空间厂商名的身份：逐条有 skip 记录，且计划 / 磁盘 / 登记表里都没有它的路由（JetBrains / Groq / Together AI / Fireworks AI / Cerebras / Trae / Qoder CN / 腾讯 CodeBuddy / Qoder International）`
- `✗ 【R5】dist/vendor/ 磁盘目录集合 == 计划里的 22 个 slug（多一个目录就是给谁建了路由）`
- `✗ dist 现场：22 个厂商页的资料区块与数据逐项对账`

### 3.3 关于变体 A 的一处如实说明

- 副本里 `build-local.js` 是 **exit 0**，但 `dist/vendor/groq/` **没有被建出来**（`groqDirExists=false`）——
  因为输出目录用的是 `apply` 之后的页面集合，而 `apply` 另有身份校验；**计划层与登记表**这一侧仍然如实产出了违规事实。
- 所以 A 判红的落点是 `nullIdentityProblemsOf` 的「`vendor-slugs.json` 里不该有它的登记」这一条（+ 该 check 的汇总行），
  而**不是**磁盘集合那一条。这是**更强的**方向：只要有人把 null 身份往「有路由」的方向推（哪怕产物层还没建出目录），判据就红。

---

## 4. 全量门禁读数（与 t18 产物合并后的唯一一套）

- 本次运行：`2026-10-04T13:54:00.517Z` → `2026-10-04T13:57:26.565Z`，HEAD `118a95c`
- **48 / 49 过 · 0 红 · 1 跳过**（跳过 = `npm ci`，理由见 t18 报告 §7 T18-F2）
- 红的步骤：`[]`
- Vendor-pages self-test 这一步：exit `0`（修复前是 exit 1）
- `concurrentEdits`：`{"headChanged":false,"statusChanged":true,"afterCount":10,"beforeCount":8}`（含义与差集见 t18 报告 §9.3）

**两套读数的处置**：

| 旧读数 | 出处 | 时间 / HEAD | 为什么与 48/49 不同 |
|---|---|---|---|
| 46/49 过 | 任务书记录的 attempt 1 读数 | 2026-10-04 ~21:10 · `9f27836` | 当时既有 R5 的写死计数红，还有解析器缺陷让 1 步没跑全 |
| 47/49 过 | `t18-attempt12-pre-fix-run2.log`（改名保留） | 2026-10-04 21:24 · `9f27836` | 唯一那条红就是 R5（`FAIL Vendor-pages self-test (exit 1)`） |
| **48/49 过** | **`t18-gate-results.json` + `t18-gate-run.log`（唯一权威）** | **本次运行 · `118a95c`** | R5 改派生式后转绿；**没有多跑/少跑任何步骤**（三行读数 total 都是 49） |

⇒ 差异是 **1 步断言**（Vendor-pages self-test 从红转绿），不是"多跑了 2 步"，也不是判定字段口径变了。
- 完整时间线写在 `t18-full-gate-report.md` §9。

---

## 5. 只增不减：本次改动逐条说明「等价或更强」

现场实测（`git show 118a95c^:scripts/tools/vendor-page-selftest.js` 与当前文件逐项比对）：

| 量 | 修复前 | 修复后 | 方向 |
|---|---|---|---|
| `check(` 调用数 | **53** | **58** | +5（只增） |
| 断言文本含 `【R5` 的条数 | **7** | **12** | +5（只增） |
| 自测实跑项数（含 `requireDist` 与循环项） | 56 项（含 1 项失败） | **57 项 / 0 失败** | +1（只增） |
| 文件字节 | 27,701 | 33,954 | +6,253（全是判据与注释） |

| 旧断言（写死） | 新断言（派生式） | 关系 |
|---|---|---|
| `skippedNoIdentity.length === 4` + 只认 4 个名字 | 对**每个** `vendorKey === null` 的身份逐条判 (a)(c)(d) | **更强**：集合长大了也不会假红，且每家都被逐条点名（旧版只保证"总数是 4"） |
| （无） | 计划层没有它的页（b） | **新增**：旧版从未断言过 null 身份在计划层不被建页 |
| （无） | 磁盘目录集合 == 计划 slug 集合（d） | **新增**：旧版没有产物层的独立判定 |
| （无） | 计划里有页、磁盘上却缺目录 ⇒ 红 | **新增**：反向（少一个目录）原先无人守护 |
| 有身份却无页（原方向） | 保留在同一条纯函数里（`candidateSetProblems` 与 (d) 两条路径） | **等价**：变体 C 实测仍红 |

---

## 6. 复现命令

```bash
node scripts/tools/vendor-page-selftest.js                              # 57 项 / 0 失败
node research/_raw/coverage-expansion-v1/t41-derived-r5-readings.cjs    # 现场读数 → t41-derived-r5-readings.json
node research/_raw/coverage-expansion-v1/t41-doc.cjs                   # 本文档（t41-derived-r5-readings.md）
node research/_raw/coverage-expansion-v1/t41-reverse-teeth.cjs <副本>   # 反向牙（%TEMP% 副本，见 §3）
node research/_raw/coverage-expansion-v1/t18-gate-runner.cjs           # 全量门禁 → t18-gate-results.json
```
