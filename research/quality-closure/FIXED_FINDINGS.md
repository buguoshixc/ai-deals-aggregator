# T18 · 本轮修复的独立复核（registry join / 真浏览器 / 子路径 / 数据完整性 / fail-closed）

- 复核人：verifier（t18，attempt 2 / attempt_id `ae79f2db-eb48-4d64-a29f-a043030bae51`）
- 复核时点：2026-10-04
- 复核对象：本轮全部修复（T05/T06 registry 身份与多变体行、T13 API 计价守卫、T14 三态、T15 AI 隔离、T15/T16 Manifest、T17 gate fail-closed、T07/T08 历史与 archive、T09/T11 来源与健康）
- **判据自建**：所有期望都由本轮新写的脚本自己推导（`research/quality-closure/verify-work/**`），不 require 被测判定模块自证；作者自述只作对照
- **隔离**：产物改动只落 `dist.qc-verify/`（gitignore）；来源层/工作流变异一律在仓库外沙箱副本（`D:\qc-t18\**`，与共享树关键 186 文件逐字节相同），共享树全程只读
- **产物**：`dist.qc-verify`（`build-local --out=dist.qc-verify`，自检全过，1216.8 KB，290 文件）

## 0. 结论（verdict = **pass**）

| # | 验收项 | 结论 | 一句话证据 |
| --- | --- | --- | --- |
| 1 | §17 独立 join（missing/extra/duplicate/multi-owner 全 0） | **pass** | 自写 `join-audit.cjs`：44 模型/44 页 · 期望 67 行 = 真实计价条目 67 · 四计数 **0/0/0/0**，另加价格/单位/通道/变体/来源链接/canonical 逐项对账 |
| 2 | 口径二次更正（按「记录 × 变体」展开） | **pass** | 自算逐页行数 = 约定值：glm-4.5v 2 · glm-4.6v 2 · glm-4.6v-flashx 2 · glm-5v-turbo 2 · qwen3-max 2 · gpt-6-astra 4 · gpt-6-luna 4 · gpt-6.1-sol 4 · minimax-m3 3 = **25 行** |
| 3 | §6.1 独立复现 5 条 Tooth Test（含来源层变异） | **pass** | 自造夹具 17/17；来源层变异矩阵 9 case × 5 门禁：P0 形态 8 个 case 全部多道红；F-T19-1 形态四入口全红 |
| 4 | §18 真浏览器（4 视口 × JS 开/关 × 5+ 路由） | **pass** | 自写矩阵 **48/48**（6 路由 × 4 视口 × 2 模式：溢出/console/失败请求/站内链接与锚点/canonical/面包屑/来源外链）；作者工具 `verify-site.js --dir` **703/0** |
| 5 | §19 GitHub Pages 子路径 | **pass** | 把产物挂在 `/ai-deals-aggregator/`：**229 次取回 · 非 200 = 0**；无根绝对路径内部引用；canonical 全部带前缀；feed/资产/JSON endpoint 全 200 |
| 6 | fail-closed 与降级路径（非 0） | **pass** | 空产物目录 6/6 工具 exit≠0；`--allow-missing-dist` 6/6 exit 0 且带 OPTIONAL DIAGNOSTIC；真实产物 6/6 exit 0；`allow_degraded_run` 自求值 3 文件 × 6 事件全部符合语义 |
| 7 | §27 真值层 diff（无无关改写） | **pass** | 9 份冻结文件 8 份逐字节相同；唯一 DIFF `api-plans.json` 由来源层重建解释（0 身份变化）；`deals.json` 相对审计基准只有 `lastSeen` 127 条 + `updatedAt` |
| 8 | 结论口径（不得只复跑作者命令） | **pass** | 6 个自写脚本 + 2 个定向实验（CI 指纹、t16 三态）+ 40 步全量门禁复跑；作者命令只用于交叉对照 |

**没有发现真实产品/数据缺陷**；三条观察项（非缺陷）见 §8。

## 1. §17 独立 join（判据自建）

脚本：`verify-work/join-audit.cjs`（自己读 `api-plans.json` + `scripts/data/model-registry-links.json` 原文展开，自己解析 `dist.qc-verify/models/<slug>/index.html` 的 `<tr class="mapirow">`；**不 require** models-page / model-registry / registry-join-audit）。

结果（exit 0）：

```
模型 44 个 · 已发布模型页 44 个 · 期望行（展开后）67 行 = api-plans 真实计价条目 67 条
多变体页 9 个 · 逐页行数 glm-4.5v:2 glm-4.6v:2 glm-4.6v-flashx:2 glm-5v-turbo:2 qwen3-max:2
                        gpt-6-astra:4 gpt-6-luna:4 gpt-6.1-sol:4 minimax-m3:3 · 合计 25 行
共 67 条身份被认领 · 唯一 owner 67 条
missing=0 extra=0 duplicate=0 multi-owner=0
```

独立推导与约定的**逐项一致**（无需口径分歧）：gpt-6 三兄弟各跨两条 `apiPlanId` × 两个变体 = 4 行；minimax-m3 = `796e0c92ecdc` 的双变体 + `ebc4af9a71b6` 的单变体 = 3 行。

除四项计数外，我另加了 6 组独立对账（全部通过）：

| 对账 | 判据（自建） | 结果 |
| --- | --- | --- |
| 行身份自洽 | `data-item == data-plan\|data-model-key\|data-variant` | 67/67 通过 |
| 价格数字 | Input/Output/Cache 三格数字 == `rates.input/output/cachedInput`（null ⇒ 「—」） | 67 行通过（含 8 条带 `mediaRates` 的条目；价格格与 rates 逐格相等，**0 条豁免偏差**） |
| 单位 | Unit 格 == `currency + " / 每 100 万 tokens"`（只认数据里的 currency/unit，不猜） | 67/67 通过 |
| 计费通道 / 变体 | 通道格 == plan.channel 标签（标准/批处理/低峰时段）· 变体格 == 变体标签 | 67/67 通过 |
| 来源链接 | 行内 `<a href>` ∈ 该记录的 `officialUrl` ∪ `evidence[].sourceUrl`（不许链到别处） | 67/67 通过 |
| canonical | == `https://buguoshixc.github.io/ai-deals-aggregator/models/<slug>/` | 44/44 通过 |

## 2. §6.1 五条 Tooth Test（独立复现）+ 来源层变异矩阵

### 2.1 自造夹具（`verify-work/unit-teeth.cjs`，exit 0 · 17/17）

夹具与生产数据无关：`P1{m: standard,long_context}` · `P2{n: standard}` · registry `{alpha,beta,gamma}`。

| 牙 | 方向 | 判据我自己写的期望 | 实测 |
| --- | --- | --- | --- |
| Tooth 1 | A：已有显式 standard，追加通配 null 到另一 slug | 红（null 展开含 standard） | 红 |
| Tooth 1 | B：已有通配 null，追加显式 standard 到另一 slug | 红 | 红 |
| Tooth 1 | 语义：通配展开 = 记录内该 modelKey 全部真实变体 | expanded、不折叠 | ✔ |
| Tooth 2 | A：同一条 identity 两个 owner | 红 | 红 |
| Tooth 2 | B：同 slug 完全重复记录 | 红（重复记录判据） | 红 |
| Tooth 3 | 同一 slug 认领两个 Provider 的记录 | 绿 | 绿 |
| Tooth 4 | A：standard 归 alpha、long_context 归 beta（不相交） | 绿 | 绿 |
| Tooth 4 | B：两条都改成 standard（相交） | 红 | 红 |
| Tooth 4 | C：同 slug「通配 + 显式」冗余 | 红 | 红 |
| Tooth 5 | 覆盖率按展开条目记账（3 条 = 3 认领；只认 1 条 ⇒ 未认领 2 条） | 不虚高 | ✔ |
| §10.6 | API 侧未认领 ⇒ `validateLinks` 红；Coding 侧未判 ⇒ 红 | 两侧同级 | 两侧红 |
| 空输入 | 空 registry ⇒ `validateRegistry` 红；有表无映射 ⇒ 红 | 不假绿 | ✔ |

### 2.2 来源层变异矩阵（`verify-work/mutation-matrix.cjs`，exit 0 · 9 case × 5 门禁）

每个 case 独立副本，**改的是来源层**（`scripts/data/**`）或仓根派生物，全部按生产规范序写回。

| case | 变异 | links-check | registry-selftest | validate | reproducible | rebuild |
| --- | --- | --- | --- | --- | --- | --- |
| m1 P0 原始形态（追加通配到第二个 slug） | 来源层 | RED | RED | RED | RED | RED（拒绝写盘） |
| m2 追加显式 standard | 来源层 | RED | RED | RED | RED | RED |
| m3 追加相邻显式 long_context | 来源层 | RED | RED | RED | RED | RED |
| m4 删一条必需映射（审计 M09） | 来源层 | RED | RED | RED | RED | RED |
| **m5 重复顶层 slug（F-T19-1 形态）** | 来源层 | **RED** | **RED** | **RED** | **RED** | RED |
| m6 **只改仓根产物**（已知事实①） | 仓根 | green | green | green | **RED** | green（重建即自愈重写） |
| m7 通配指向不存在的 modelKey | 来源层 | RED | RED | RED | RED | RED |
| m8 registry 只剩 `_` 元信息键 | 来源层 | RED | RED | RED | RED | RED |
| m9 删掉关系层来源文件 | 来源层 | RED | RED | RED | RED | RED |

**F-T19-1 复核结论（队长追加项）**：`scripts/validate.js:1055` 与 `scripts/tools/check-models-reproducible.js:54` 现在都传 `duplicateKeys`；m5 形态下**四道门禁全部 exit≠0**，`validate --strict` 直接报「models.json 的顶层键 "glm-5.3" 重复出现」——**不再有任一入口假绿**。

**「同一形态不同入口结论相反」的扫描**（队长要求）：把 9 个注册表形态 × 5 个入口，加上 t16 的 4 个 plans 形态 × 4 个入口、6 个 CI 变异 × check-ci，逐格记录 exit code。**唯一出现的绿/红分裂是 m6 与 t16-c4**，两者都是**输入层不同**造成的分工（来源层入口 vs 产物可重现性入口），不是同一输入的结论相反：m6 中 `rebuild-models` 重写仓根即自愈，`check-models-reproducible` 是唯一负责"产物是否被手改"的入口。**没有发现别的实例**。

## 3. §18 真浏览器验收

### 3.1 自写矩阵（`verify-work/browser-matrix.cjs`，exit 0 · **48/48**）

6 路由 × 4 视口 × JS 开/关 = 48 组合：`/` · `/changes/` · `/archive/` · `/feeds/` · `/plans/api/` · `/models/glm-4.5v/`（多变体页）；视口 360×640 / 390×844 / 768×1024 / 1440×900；`javaScriptEnabled` 开与关。

每条组合的判据（全部自建）：横向溢出（`scrollWidth > clientWidth+1` 与 `body.scrollWidth > 视口宽`，并定位最宽元素）· console error · pageerror · 失败请求（HTTP≥400 / requestfailed）· 站内链接与 assets 目标文件存在 · `#anchor` 目标 id 存在 · canonical 逐字等于生产前缀 URL · 面包屑标记存在 · 模型页//plans/api//changes 至少一条官方来源外链。

结果：**48/48 通过**（0 溢出、0 console error、0 失败请求、0 死链、0 锚点缺失）。JSON：`verify-work/logs/browser-matrix.json`。

### 3.2 作者工具交叉对照

`node scripts/tools/verify-site.js --dir=dist.qc-verify --json=…` → **703 项，失败 0**（含 360/390 无溢出、无 JS 正文完整、外链 0、`/docs/data/` 9 行 == Manifest 9 份、每个 endpoint HTTP 200）。沙箱全量门禁里同一支（`--dir=dist`）也是 0。

## 4. §19 GitHub Pages 子路径

脚本：`verify-work/subpath-check.cjs`（自写服务器把产物挂在 `/ai-deals-aggregator/` 下）。exit 0：

```
sitemap 路由 170 条 · 实际取回 171 个页面（首页 + 170）
Feed：根 2 个 + 家族文件 48 个（抽样取回 16 个）
必需路径 33 个（含资产抽样 17 个、JSON endpoint 抽样 7 个）
JSON endpoint 7 个全部 200 且可解析
静态资源：logos/ 49 个 + 根资产 5 个全部存在
HTTP 取回 229 次 · 非 200 0 次
```

判据（自建）：① 每个页面里的站内引用**必须相对**（出现以 `/` 开头的根绝对引用即红——项目页子路径下会打到域名根）；② 每个相对引用解析到真实文件；③ canonical 逐字等于 `https://buguoshixc.github.io/ai-deals-aggregator/<route>/`；④ sitemap `<loc>` 全带前缀；⑤ feed 内容包含带前缀站点 URL；⑥ `/docs/data/`、`/data/index.json`、根 JSON endpoint 全 200 且可解析；⑦ `logos/` + 根资产全在。全部通过。

## 5. fail-closed / 降级语义 / 步骤指纹 / Manifest / 三态（队长点名的四块）

### 5.1 缺产物 fail-closed（`verify-work/failclosed-replay.cjs`）

| 阶段 | 命令形态 | 期望 | 实测 |
| --- | --- | --- | --- |
| A 空产物目录 | 6 工具 `--dir=<空目录>` | 全部非 0 | **6/6 exit 1**（文案含「先跑 npm run build / --dir / --allow-missing-dist」指引） |
| B 显式退出 | 6 工具加 `--allow-missing-dist` | 允许跳过且**显式标注** | **6/6 exit 0**，全部打印 `⚠️ OPTIONAL DIAGNOSTIC` |
| C 真实产物 | 6 工具 `--dir=dist.qc-verify` | 全 0 | **6/6 exit 0** |

### 5.2 `allow_degraded_run` 语义（自求值，不调作者断言）

按 GitHub 表达式规则自己求值 `${{ inputs.allow_degraded_run && 'true' || 'false' }}`，3 个调用方 × 6 种事件：

| 调用方 | PR | push | schedule | workflow_run | dispatch 默认 | dispatch 勾选 |
| --- | --- | --- | --- | --- | --- | --- |
| verify.yml | false | false | false | false | false | **true** |
| collect.yml | false | false | false | false | false | **true** |
| deploy.yml | false | false | false | false | false | **false**（发布链不许降级） |

全部符合语义（逃生口没堵死，也只有人工显式勾选才打开）。对照：`node scripts/tools/check-ci-consistency.js --expect-checks=36` → **36 项 0 失败**（DSH_BASH=Git bash；不设 DSH_BASH 走默认解析同样 0）。

### 5.3 步骤体指纹到底冻结了什么（`verify-work/ci-fingerprint-experiment.cjs`，5 实验）

| 实验 | 变异 | 期望 | 实测 |
| --- | --- | --- | --- |
| g1 | run 体里插一行注释（语义不变） | 绿 | **exit 0**（规范化确实剥整行注释） |
| g2 | run 体里插空行（语义不变） | 绿 | **exit 0** |
| g3 | 只改步骤 name | 观察 | **exit 1**：`(10) 步骤名序列等于冻结清单 — #30 期望「Assemble site…」实得「…T18 实验改名」`（比"只冻结 run 体"更严：**步骤名与序列也冻结**） |
| g4 | 加 `continue-on-error: true`（正确缩进） | 红 | **exit 1**：`(10) 这些步骤带 continue-on-error（门禁不许静默放过）：Validate data (strict)` |
| g5 | `--dir=dist` → `--dir=dist.qc-gate`（语义变化） | 红 | **exit 1**：`(10) 步骤体变了：… run 体与冻结指纹不一致` |

另在 failclosed-replay 的 F 组里：`verify-site.js` → `echo skipped`（换实现）红、浏览器判定 `exit 1` → `exit 0` 红（那段 shell 是**真执行**的）、去掉 `--dir` 红、`allow_degraded_run` 恒 true 红。

> **F 组两条"不吻合"的如实记录**（避免下游误读 `logs/failclosed-replay.json` 的 `failures` 数组）：
> ① `f1-rename-step` 我原以为"改名允许"，实测红 —— 红是**正确行为**（`(10)` 冻结步骤名序列），是我的期望写错，已由 g3 复现并解释；
> ② `f5-continue-on-error` 我的注入锚点缩进写错（`yamlChanged=false`，**变异根本没生效**），该条**不构成证据**；同一形态由 g4（正确注入）实测 **exit 1**。
> 两条都不影响本节的结论：步骤语义冻结与"不许 continue-on-error"都成立。

### 5.4 t15 Manifest 双向对账（`verify-work/manifest-audit.cjs`，exit 0）

```
Manifest data/index.json · 9 条数据集
dist 全树 JSON 36 份 = Manifest 自身 1 + 数据集 9 + Feed 家族 25 + 内部产物 1（source-health.json）
/docs/data/ 页面 9 行 == Manifest 9 份（verify-site 独立复核同一数字）
独立变异（多放一份未登记 JSON）→ data-docs-selftest --dir=<副本> exit 1（点名文件）
对照（真实产物）→ exit 0（57 项 0 失败）
```

分类唯一、URL 全存在、页面与数据两侧一致、**未登记 JSON 必红**（fail-closed 的反向）。

### 5.5 t16 三态契约（`verify-work/t16-replay.cjs`，4 case 全符合）

| case | 变异（来源层/派生物） | 期望 | 实测 |
| --- | --- | --- | --- |
| c1 | `fair_use: true → "unknown"` + 见证词 + 完整 rebuild | 绿，且派生值仍是字符串 `"unknown"` | validate/plans-selftest/reproducible/rebuild 全 0；普查行 `true 1 · false 0 · unknown 1`；派生值 **"unknown"** |
| c2 | `true → false` 而 note 一字不动 | 红 | validate/plans-selftest/reproducible/rebuild **全 1**（rebuild 拒绝写盘） |
| c3 | `"unknown"` 但 note 仍是肯定式记述 | 红 | 四道全 1 |
| c4 | 手改仓根 `plans.json`（带见证词，schema 单独看会放行） | 红（派生层不许手改） | validate / plans-selftest / plans-reproducible 全 1；`来源层↔派生产物逐条同值 22/23` |

## 6. §27 真值层 diff 审计（`verify-work/truth-diff.cjs`）

### 6.1 与 T01 BASELINE 冻结值对比（9 份真值文件）

| 文件 | 冻结 sha256（BASELINE §4） | 现状 | 判定 |
| --- | --- | --- | --- |
| `deals.json` | `3ba148db…d301` | 相同 | **SAME** |
| `plans.json` | `a72c91ef…0938` | 相同 | **SAME** |
| `api-plans.json` | `962fc9c4…ee46` | `fdd1e0d…`（本轮来源层驱动的重建） | DIFF（见 6.3） |
| `models.json` | `8fa85b1d…a95b` | 相同 | **SAME** |
| `model-registry-links.json` | `fd2336c8…1a2e` | 相同 | **SAME** |
| `scripts/data/model-registry-gaps.json` | `1e89ba04…6e5c` | 相同 | **SAME** |
| `scripts/data/deal-history.json` | `6c9909d9…2829` | 相同 | **SAME** |
| `scripts/data/plan-history.json` | `67dbc7f1…7b7a` | 相同 | **SAME** |
| `scripts/data/api-plan-history.json` | `56685dd5…ecf5` | 相同 | **SAME** |

**8/9 逐字节未动**；唯一 DIFF 的成因见下。三份「生产真值层」（deals / plans / api-plans）没有无关改写。

### 6.2 `deals.json` 相对审计基准（`1c024db`）的字段级差异

```
id 增删：0 / 0
逐条字段差异：{ "lastSeen": 127 }        ← 只有 lastSeen
顶层差异：updatedAt、deals（数组因 lastSeen 而变）
```

与队长给的现场事实**逐字一致**：唯一差异是 `lastSeen`（127 条）+ `updatedAt`，属采集刷新，不是本轮改写；`count` 不变。

### 6.3 本轮真实数据变更清单（走「来源层 → rebuild」路径）

| 文件 | vs HEAD | 性质 | 语义核验 |
| --- | --- | --- | --- |
| `scripts/data/curated_api_plans.json` → `api-plans.json` | +8 / +8 行 | freeTier.stability ×4、unitNote 改写 ×1、freeTier.description 扩写 ×1 | **记录数 13 不变 · 计价身份 +0/-0 · 价格字段 0 变化** |
| `scripts/data/official_urls.json` | +22 行 | 官方域白名单（T09/T11 来源语义） | 派生进产物（dist 构建自同一来源） |
| `scripts/data/providers.json` | 70 行 | 开发者/平台登记（本轮其它修复） | 同上 |

**独立重建证据**：在沙箱副本里跑 `rebuild-api-plans` / `rebuild-plans` / `rebuild-models`，三份都报「与盘上逐字节一致 ⇒ 无需写盘」——**仓根派生物确实是来源层的产出，没有手改**。

## 7. 全量门禁复跑（沙箱，按 `.github/actions/gate/action.yml` 步骤顺序）

40 步，**非 0 = 0**（`verify-work/logs/gate-suite.json`）：CI 口径 36 断言 · validate --strict · 可重建/历史/迁移/译文五条 · **23 支演练与自测**（zh/expiry/text/health/provenance/history/changes/feeds/seo/audience/app-token/ai/fixture/plans/plan-history/deal-plan-links/api-plans/registry/models-page/planshub/vendor/archive/data-docs）· 四条可重建性 · 关系层门禁 · 覆盖报告 · build-local · feeds 可复现 · SEO 验收 11 项 · 真浏览器 703 项。

沙箱保真度：与共享树 `scripts/lib`+`scripts/tools`+`scripts/data`+`.github`+根 JSON+`index.html` 共 **186 个文件逐字节相同**（0 差异）。

## 8. 观察项（非缺陷，无需修复）与边界

### 观察项

1. **步骤名也被冻结**（比作者自述的"run 体 + 步骤级 if"更严）：改一个 `- name:` 就会让 `(10)` 红（还会连带 `(17)` 的位置断言报错）。这是更强的守卫，但改名的成本是"必须同步冻结清单"，写在这里免得下游误当 flake。
2. **`rebuild-models` 的职责边界**：只改仓根产物时它 exit 0 并把仓根重写回来源层的产出（自愈）；"产物是否被手改"由 `check-models-reproducible` 负责。两者分工正确，不是假绿。
3. **manifest-audit 里的页面对账**用宽松匹配（文件名出现在 HTML 里）而非逐链接解析；9/9 严格计数由 `verify-site.js` 的「页面 9 行 == Manifest 9 份」与我的 `join`/`subpath` 取回共同锁定。

### 边界（未验证项，如实记录）

1. **没有真实 GitHub Actions 运行**：CI 语义靠静态断言 + **真执行那段判定 shell**（POSIX bash）验证；runner 环境、分支保护、concurrency 行为不在本轮验证面。
2. **浏览器只有 Edge（headless，Windows）**：与仓库自己的门禁同一支；未覆盖 Firefox/Safari/真机。
3. **`allow_degraded_run` 的求值器只认仓库里实际出现的表达式形态**（`inputs.X && 'true' || 'false'` 与字面量）；换成别的写法我的实验会显式抛错（不会静默给绿灯）。
4. 沙箱门禁复跑用的是与共享树逐字节相同的副本，而不是 CI runner 本身。
5. 我自己的 harness 在过程中修过 4 处自身缺陷（路径含空格未加引号、Feed 家族正则漏 `feed/**`、把 §7 的 `research/audit` 快照当根相对路径、步骤名解析把 `description:` 当表达式）——修复后重跑才取数，**没有把 harness 缺陷当成产品发现**。

## 9. 复现指引

```powershell
cd <worktree>
# 0) 产物（合同要求）
node scripts/tools/build-local.js --out=dist.qc-verify
# 1) 自建判据脚本（全部无第三方依赖；exit 0 = 通过）
node research/quality-closure/verify-work/join-audit.cjs      --dist=dist.qc-verify
node research/quality-closure/verify-work/unit-teeth.cjs
node research/quality-closure/verify-work/browser-matrix.cjs  --dist=dist.qc-verify
node research/quality-closure/verify-work/subpath-check.cjs   --dist=dist.qc-verify
node research/quality-closure/verify-work/manifest-audit.cjs  --dist=dist.qc-verify
node research/quality-closure/verify-work/ci-step-order.cjs
node research/quality-closure/verify-work/truth-diff.cjs
node research/quality-closure/verify-work/failclosed-replay.cjs --gold=D:\qc-t18\wt
node research/quality-closure/verify-work/t16-replay.cjs        --gold=D:\qc-t18\wt
node research/quality-closure/verify-work/ci-fingerprint-experiment.cjs --gold=D:\qc-t18\wt
node research/quality-closure/verify-work/mutation-matrix.cjs   --gold=D:\qc-t18\wt
node research/quality-closure/verify-work/gate-suite.cjs        --root=D:\qc-t18\wt
# 2) 作者工具交叉对照
node scripts/tools/verify-site.js --dir=dist.qc-verify --json=research/quality-closure/verify-work/logs/verify-site.json
node scripts/tools/seo-verify.js --dir=dist.qc-verify
```

沙箱：`D:\qc-t18\wt`（金样本，与共享树 186 关键文件逐字节相同）· `D:\qc-t18\cases`（9 变异副本）· `D:\qc-t18\ci-cases`、`D:\qc-t18\ci-exp`（CI 变异）· `D:\qc-t18\t16`（三态变异）· `D:\qc-t18\empty-dist`（缺产物）。**全部在仓库外**，可整目录删除；共享树内只落 `research/quality-closure/verify-work/**` 与本文件。

## 10. 判定

**verdict = pass**：八条验收项逐条通过；无 P0/P1/P2 级新发现；作者自述与我的独立复现**没有实质性不一致**（差异只有"步骤名也被冻结"这一条更强的守卫，以及我在 §8 记录的三条观察项）。
