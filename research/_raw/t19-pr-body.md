## 本版目标
把项目从「收集了很多数据」升级成「明确知道要覆盖什么 / 当前覆盖到哪里 / 哪些模型值得默认展示 / 哪些旧模型只作历史」，并给出可审计的处置与残余登记。

## 变化
- 数据：providers 23→34 · plans 23→37（18 家）· api-plans 13→17（93 条计价条目）· coverage-targets 0→34 ·
  Model Registry 44 个模型（v2 字段：modelRole / releasedAt / releaseEvidence / freshnessGroup）·
  links 82（API 69 + Coding 13）· declarations 54（Coding 42 + API 12）
- 机制：处置登记表**双侧化**（API 侧 `off-registry-model`）+ 反绕过折叠牙 + `validateLinks`/`validateGaps` 成对调用机器牙；
  门禁 action.yml 45→49 步 · `check-ci-consistency` 37→38 项（`--expect-checks=38`；37 必红）· 新增反向登记制与引文自称牙
- 页面：/models/ 索引默认隐藏 legacy/historical（No-JS 完整，静态 44 行）· 新增 /vendor/ 页（aws / replit / stepfun）
- **本分支已合并 master 最新自动采集**（`2ebcf62`，父提交 `23ecd09` + `d57aa3ef`）：`deals.json` / `scripts/data/source-health.json` /
  `scripts/data/source-snapshots.json` / `scripts/data/zh-pending.json` 四处冲突取 master 侧，保证不与 `master` 的定时采集打架

## 证据
- 全量门禁报告 `research/_raw/coverage-expansion-v1/t18-full-gate-report.md`（48 过/0 红/1 跳过）
- **冻结 tip 复跑**：在 `2ebcf62`（本 PR 的实际 head）上重跑 `research/_raw/coverage-expansion-v1/t18-gate-runner.cjs`
  ⇒ 动态枚举 49 步 · **48 过 / 0 红 / 1 跳过**（跳过=npm ci）· exit 0 · `concurrentEdits.headChanged=false`；
  另跑 build-local exit 0 与 verify-site（见下）。**合并前所有读数都在同一个 `2ebcf62` 上取得。**
- 残余登记表 `research/coverage-expansion-v1-residual-register.md`（含 34 条引文残余与 sha256）
- 两份独立审查：`research/coverage-expansion-v1-data-quality-review.md`（t15）· `research/_raw/t26/report.md`（对抗性审查 pass）
- 变异电池 `research/_raw/t17/MUTATION-RESULTS.md`（27 例：CAUGHT 24 / 盲区 2 / 恢复 100%）

## 未验证与已知边界（如实声明）
- 线上冒烟只有**部署后**才有读数（本 PR 不含该读数）。
- **`source-health` 是活读数，不是常量**：`scripts/data/source-health.json` 的 `generatedAt` 为 `2026-10-04T16:31:52Z` 时是
  **healthy 8 / failed 1** —— 失败源 Futurepedia（`consecutiveFailures=10`，`HTTP 403`）。同一分支上它此前出现过 `9/9 healthy`，
  现状又回到 failed ⇒ 本 PR 内**任何**「已恢复」字样都以**带 `generatedAt` + `consecutiveFailures` 的读数**为准，不写成结论。
- `aging` / `historical` 在真实数据上为 **0**，成因：44 个模型里只有 4 条有官方 `releasedAt` 证据 ⇒ 40 条 `unknown`（默认可见）。
- **34 条**历史 API 映射的引文未逐字点名该模型（口径不一致，属已登记残余）。
- 变异电池两条盲区：①「测试改自己」构造上任何门禁都接不住；②真实引文忠于官方页**没有离线门禁**，由抄件逐字耦合 + 独立审查 + 引文自称牙三层覆盖。
- `master` 当前**无分支保护**：`gate` 未过也能合并，本 PR 的"等 CI"靠人工确认。
- §87 完成清单是 **47 条**（题面 2568–2614 行程序化计数；不是 44 条）。其中第 29/30 条的载体是一份**人读报告**
  （`research/coverage-expansion-v1-source-health-rulings.md`），不是机读文件。

## 回滚
`git revert -m 1 <merge-sha>` 后推 master，走同一条门禁链。
