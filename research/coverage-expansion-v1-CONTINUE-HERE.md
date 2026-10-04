# ▶ 从这里继续：coverage-expansion-v1 续跑手册（自包含）

> **入口文件**。本文件自包含：只读它就能继续任务，不需要原始对话。
> 配套快照（细节更全，按需查）：`coverage-expansion-v1-RESUME-STATE.md`（状态与口径）· `coverage-expansion-v1-AGENT-STATUS.md`（成员/subagent 情况与派活模板）。
> 最后更新：停机窗口，分支 `coverage-expansion-v1`，HEAD `42aad10`，**远端无该分支、无 PR**（t19 未被推送）。

---

## 1. 启动检查（先跑这五条，别凭记忆）

```powershell
cd ".worktrees/coverage-expansion-v1"          # 相对 D:\OneDrive\Desktop\Code\AI Page
git log --oneline -3                            # 期望 HEAD = 42aad10（或其后我方的提交）
git status --short                              # 期望：干净，或只有未跟踪的 research/_raw/**
git ls-remote --heads origin coverage-expansion-v1
gh pr list --head coverage-expansion-v1 --state all
gh run list --workflow "Deploy to GitHub Pages" --limit 5
curl.exe -sI https://buguoshixc.github.io/ai-deals-aggregator/     # 看 Last-Modified / ETag
```

**判定表 → 从哪一步续**

| 现场 | 含义 | 从哪续 |
|---|---|---|
| 远端无分支 | t19 未推送（**2026-10-04 停机时的实际状态**） | §2 第 0 步（门禁前置）→ 第 1 步 push |
| 有分支、无 PR | 推了没建 PR | §2 第 2 步 |
| 有 PR、checks 未定 | 等 CI | §2 第 3 步（人工确认名为 `gate` 的检查 success） |
| 有 PR、已 merge | 已合 | §2 第 5 步（等 Deploy）→ 第 6 步（冒烟） |
| 线上 `data-model=44` | 已经部署并生效 | 直接进 §3（t20/t21/t22） |

---

## 2. 续跑运行单（不可逆动作一律卡在绿的前置之后）

### 第 0 步 · 冻结 HEAD 上的门禁前置（任一红 ⇒ 停，不许 push）

```powershell
node research/_raw/coverage-expansion-v1/t18-gate-runner.cjs   # 期望 48 过 / 0 红 / 1 跳过（跳过=npm ci）
node scripts/tools/build-local.js                              # 期望 exit 0
node scripts/tools/verify-site.js                              # 期望 735 项 0 失败
git rev-parse HEAD ; git status --short                        # 记下 HEAD；树必须干净
```
命令速查（更快的一批，可先跑）：`node scripts/validate.js --strict` · `node scripts/tools/check-ci-consistency.js`（期望 38 项 0 失败；`--expect-checks=37` **必须** exit 1）· `node scripts/tools/coverage-report.js` · `node scripts/tools/models-selftest.js`（143/0）。

### 第 1 步 · 推送（**不可逆**，public 仓库）

```powershell
git push -u origin coverage-expansion-v1
```

### 第 2 步 · 建 PR（正文直接贴下面这段）

```powershell
gh pr create --base master --head coverage-expansion-v1 `
  --title "feat(coverage): coverage-expansion-v1 —— 结构化覆盖体系 + 4 家推理平台定价 + 8 条国际 Coding 套餐" `
  --body-file research/_raw/t19-pr-body.md
```

PR 正文（存成 `research/_raw/t19-pr-body.md` 后使用）：

```markdown
## 本版目标
把项目从「收集了很多数据」升级成「明确知道要覆盖什么 / 当前覆盖到哪里 / 哪些模型值得默认展示 / 哪些旧模型只作历史」，并给出可审计的处置与残余登记。

## 变化
- 数据：providers 23→34 · plans 23→37（18 家）· api-plans 13→17（93 条计价条目）· coverage-targets 0→34 ·
  Model Registry 44 个模型（v2 字段：modelRole / releasedAt / releaseEvidence / freshnessGroup）·
  links 82（API 69 + Coding 13）· declarations 54（Coding 42 + API 12）
- 机制：处置登记表**双侧化**（API 侧 `off-registry-model`）+ 反绕过折叠牙 + `validateLinks`/`validateGaps` 成对调用机器牙；
  门禁 action.yml 45→49 步 · `check-ci-consistency` 37→38 项（`--expect-checks=38`；37 必红）· 新增反向登记制与引文自称牙
- 页面：/models/ 索引默认隐藏 legacy/historical（No-JS 完整，静态 44 行）· 新增 /vendor/ 页（aws / replit / stepfun）

## 证据
- 全量门禁报告 `research/_raw/coverage-expansion-v1/t18-full-gate-report.md`（48 过/0 红/1 跳过）
- 残余登记表 `research/coverage-expansion-v1-residual-register.md`（含 34 条引文残余与 sha256）
- 两份独立审查：`research/coverage-expansion-v1-data-quality-review.md`（t15）· `research/_raw/t26/report.md`（对抗性审查 pass）
- 变异电池 `research/_raw/t17/MUTATION-RESULTS.md`（27 例：CAUGHT 24 / 盲区 2 / 恢复 100%）

## 未验证与已知边界（如实声明）
- 线上冒烟只有**部署后**才有读数（本 PR 不含该读数）。
- `aging` / `historical` 在真实数据上为 **0**，成因：44 个模型里只有 4 条有官方 `releasedAt` 证据 ⇒ 40 条 `unknown`（默认可见）。
- **34 条**历史 API 映射的引文未逐字点名该模型（口径不一致，属已登记残余）。
- 变异电池两条盲区：①「测试改自己」构造上任何门禁都接不住；②真实引文忠于官方页**没有离线门禁**，由抄件逐字耦合 + 独立审查 + 引文自称牙三层覆盖。
- `master` 当前**无分支保护**：`gate` 未过也能合并，本 PR 的"等 CI"靠人工确认。
- §87 第 29/30 条（Source Health 已审查 / 长期失败源有裁决）的载体是一份**人读报告**（`research/coverage-expansion-v1-source-health-rulings.md`），不是机读文件。

## 回滚
`git revert -m 1 <merge-sha>` 后推 master，走同一条门禁链。
```

### 第 3 步 · 等 CI（人工确认，平台不会拦）

```powershell
gh pr checks --watch        # 必须看到名为 gate 的检查 success
```

### 第 4 步 · 合并（**不可逆**）

```powershell
gh pr merge --merge --delete-branch=false      # 保留提交历史；记下 merge SHA
```

### 第 5 步 · 等部署

```powershell
gh run list --workflow "Deploy to GitHub Pages" --limit 5      # 等到 success
```

### 第 6 步 · 线上冒烟（先等版本指纹变化，再跑全量）

```powershell
node research/_raw/t40/compare-live.cjs --before=research/_raw/t40/live-baseline.json `
  --poll-after=research/_raw/t40/after-deploy.json --timeout-min=12 --interval-sec=45 --require-deployed
# 期望：data-model=44 · models-show-legacy≥1 · legacy 详情页 data-release-date≥1 · 7 条路由 200
# CDN max-age=600 未过期 ≠ 缺陷（四象限判定见 research/_raw/t40/README.md）
node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/
# 注意：题面里的 buguoshixix 是笔误（404）；--url= 时 Analytics 断言翻转为"应看到官方 beacon"属预期
```

### 第 7 步 · 回执

每步命令 + 读数（推送的 commit 范围 · PR 号与 URL · CI 结论 · merge SHA · Deploy 结论 · 冒烟读数）。**失败就停在那一步并报**，不跳步、不 force push、不改仓库设置或分支保护。

---

## 3. 剩余三个任务（现成任务书，可直接粘进 `reassign_task` 的 reason）

### t20 · 最终报告（建议 freshness-engineer）

> 前置：`research/_raw/t39/report-inputs.md`（11 节素材 + §I 的 14 个"部署后才能填"格子）· `research/coverage-expansion-v1-residual-register.md`（**必须引用**）· t19 的回执（部署与冒烟读数）· `research/_raw/t37/evidence.md`（部署事实）。
> 要做：写 `research/coverage-expansion-v1-report.md`（≤400 行）：① 目标与范围 ② 数据扩充 ③ Registry v2 与 API 侧处置 ④ 门禁与自测清单 ⑤ 覆盖报告 v2（§41/§42）⑥ 变异电池 ⑦ 两份独立审查（含两次**审查侧误判**的 append-only 更正：T15-F6、T38-R1）⑧ 残余登记表（引用 34 + sha256，两条 M24 盲区如实列）⑨ 部署与线上冒烟（填 §I 的 14 格）⑩ 未做与已知边界。
> 口径（三处必须按 §4 转述）：残余 34 + 清单 sha256 · source-health 基线 8/1 → 现行 9/9 · coverage-report stdout sha256 已变为 `ff039fa4…`。
> 禁止：改数据/代码/登记表；无出处命令的数字；把 aging/historical=0 写成缺陷或略过。
> 回执 ≤40 行。

### t21 · 独立 Self-Audit（**务必改派小会话成员**，如 research-firstparty）

> 独立复核（第二条路径，**不 require** `scripts/lib/**` 的同类实现）：① 自己写脚本复算 registry 44 · links 82 · declarations 54 · 计价条目 93 = 81 + 12 + 0 · plans 37 · api-plans 17 · coverage-targets 34；② 抽查三条牙：删关系层 ⇒ `report:coverage` 红；索引身份改名 ⇒ `models-page-selftest` 红；摘掉一条 selftest 登记 ⇒ `check-ci-consistency` 红；③ **如实列**两条 M24 盲区 + 34 条引文残余 + aging/historical=0 + master 无分支保护（不许写"0 盲区"）；④ 给 verdict。
> 交付 `research/coverage-expansion-v1-self-audit.md`（≤200 行）。只读生产文件，变异在 %TEMP% 副本。

### t22 · §87 最终验收（建议 coverage-engineer）

> 前置：`research/_raw/t38/section87-precheck.md`（预映射：已可证 33 / 待产出 12 / 缺证据 2 —— 其中 **29/30 已由队长复核改判为已可证**，载体是 `research/coverage-expansion-v1-source-health-rulings.md`）。
> 要做：对 **47 条**（题面 `D:\AI_DEALS_COVERAGE_EXPANSION_V1_PROMPT.md` 第 2568–2614 行程序化计数；任务书里的"44"是旧口径）逐条判定 pass/fail，每条给：文件路径 + 可执行命令 + 状态（已可证 / 待产出 / 缺证据），并单独列缺证据与风险；输出 verdict。
> 交付 `research/coverage-expansion-v1-acceptance.md`。

---

## 4. 引用口径（写报告/审查时必须照抄，否则会写错）

1. **残余条数 = 34**，清单 sha256 `b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696`；
   注意登记表**整文件** sha256 是另一个值（`b8b05522…`），别混。
2. **`scripts/data/source-health.json`：基线 a4dd40f = healthy 8 / failed 1（futurepedia cf=9、HTTP 403）→ 现行 9/9 healthy。**
   T15-F6 声称"与基线逐字节相同"是**错的**（拿错对照物），t13 原句为真 —— 这条已作为"被证伪的审查发现"登记在残余登记表 §4.1。
3. **`coverage-report --json` 的 stdout sha256 已因内容增加而变化**：`7e50e31d…b751` → **`ff039fa4a804a2d5e5a9004509670e3eb9babfd6db33723f2b6e3b5beab9dcf`**（载荷段 `5288c615…`）。
   引用旧值的文档（t25 L33 / t38 §87 第 34 条 / t18-gate-results.json）需注明版本或复跑；determinism 判据本身是"两次运行相等"，不受影响。
4. **§87 是 47 条**（不是 44）；**线上 URL 是 `https://buguoshixc.github.io/ai-deals-aggregator/`**（题面 `buguoshixix` 是笔误，404）。

## 5. 关键数字（t20 直接可用，均已现场跑过）

| 项 | 值 |
|---|---|
| providers / plans / api-plans | **34** / **37**（18 家）/ **17** 条记录 · **93** 条计价条目 |
| Model Registry | **44** 个模型 · catalogStatus `{unknown 40, current 3, legacy 1}` · modelRole `{general 24, vision 8, fast 6, other 2, translation 2, embedding 1, coding 1}` · releasedAt 4 有值 / 40 空 |
| 关系层 / 处置登记 | links **82**（API 69 + Coding 13，带 evidence 61）· declarations **54**（Coding 42 + API 12） |
| 记账方程 | `93 = 81 已映射 + 12 已处置 + 0 未判` · Coding `55 = 13 + 42 + 0` |
| coverage-targets | **34** 行 = 34 个 provider 身份（双向对账差集为空） |
| 门禁 | action.yml **49** 步（基线 45）· `check-ci-consistency` **38** 项（`--expect-checks=38`；37 必红）· selftest:* **25** 条 |
| 自测项数 | models 143 · models-page 115 · coverage-targets 110 · provenance 132 · feeds 145 · data-docs 58 · api-plans 176 · freshness 100 · 枚举 7 |
| 浏览器验收 | verify-site **735/0**（回归比对 741/0） |
| 变异电池 | 27 例（1 对照 + 26 变异）· CAUGHT **24** · 盲区 **2** · 非预期红 0 · 逐字节恢复 100% |
| 部署前线上基线 | `data-model=0` · `models-show-legacy=0` · `release-date=0` · sitemap `<loc>=170` · 7 路由 200 · `Cache-Control: max-age=600` |

## 6. 禁止事项与环境纪律

**禁止**：force push · 改仓库设置或分支保护 · 绕过 CI 合并 · `git checkout --` 重置数据文件（曾吃掉未提交改动）· `git add -A`（曾把别人在途产物带走）· 用 inline `-m` 带引号提交（PowerShell 会拆参数）· 追溯性改写已发布结论（更正一律 append-only）· 把"未验证"写成"已满足"。

**纪律**（本轮教训换来的）：
1. 瓶颈是**成员会话上下文**（4 个成员 >512k 被判 400 死掉）与 **TPM 限流** ⇒ 契约短、报告限行数、并发 ≤2–3、优先小会话成员（`research-firstparty` / `research-inference`）。
2. 提交一律**显式列路径** + 消息文件（`git commit -F msg.txt`）。
3. 只读类任务（审查/核对）放小会话成员；写代码/数据的任务同时只给一个成员。
4. 每条改动配**反证**（构造违规输入 ⇒ 必红 + 对照绿）；报错要**点名数据对象并给实际/期望两侧**；断言**只增不减**。
5. 不可逆动作（push / merge / deploy）**卡在绿的前置之后**；失败就停在那一步。
6. `send_message` 在本环境多次报 "active teammate not found" ⇒ 交互走 `agent_teams_status` + `reassign_task`。

## 7. 证据索引（找读数从这里进）

- 状态/口径：本文件 · `coverage-expansion-v1-RESUME-STATE.md` · `coverage-expansion-v1-AGENT-STATUS.md`
- 门禁与全量 Gate：`research/_raw/coverage-expansion-v1/t18-full-gate-report.md` · `t18-gate-results.json` · `t18-gate-runner.cjs`（可复跑）· `t41-derived-r5-readings.{json,md}`
- 审查：`research/coverage-expansion-v1-data-quality-review.md`（t15）· `research/_raw/t26/report.md`（对抗性审查）· `research/_raw/t28/`（t14 闭环 + 仲裁 34）· `research/_raw/t35/M24-BOUNDARY.md`
- 变异：`research/_raw/t17/MUTATION-RESULTS.md` · `logs/battery.json` · `mutation-battery.cjs`
- 覆盖报告：`scripts/tools/coverage-report.js`（文本 + `--json`）· `research/_raw/t45/section41-audit.md`（§41/§42 载体核对）· `research/_raw/t46/README.md`（五态普查与反证）
- 部署：`research/_raw/t37/t19-runbook.md` + `evidence.md` · `research/_raw/t40/{live-baseline.json,compare-live.cjs,README.md}`
- 报告素材：`research/_raw/t39/report-inputs.md` + `collect.cjs`
- 残余与裁决：`research/coverage-expansion-v1-residual-register.md` · `research/coverage-expansion-v1-source-health-rulings.md` · `research/coverage-expansion-v1-model-currentness.md` · `research/coverage-expansion-v1-provider-review.md` 与 `research/_raw/coverage-expansion-v1/provider-review.md`
