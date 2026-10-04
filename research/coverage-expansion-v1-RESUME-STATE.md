# coverage-expansion-v1 · 恢复用状态快照（服务停机前写入）

> 写于 2026-10-04T22:57+08:00（用户通知 23:00 停服）。恢复后**先读本文件**，再按「恢复第一步」照单核对。

## 0. 一句话状态

全部**实现、数据、门禁、审查、变异、登记**已完成并提交；本地全量门禁 **48 过 / 0 红 / 1 跳过**（跳过 = `npm ci`）。
**只剩最后一段不可逆链路在飞**：t19 = push → PR → 等 `gate` → merge → Deploy → 线上冒烟（负责人 research-inference，停机可能把它打断在中途）。之后是 t20 最终报告、t21 self-audit、t22 §87 验收。

## 1. 恢复第一步（照单核对，不要凭记忆）

```powershell
cd .worktrees/coverage-expansion-v1
git log --oneline -5
git status --short                 # 期望：干净或只有未跟踪研究产物
git ls-remote --heads origin coverage-expansion-v1     # 分支推上去了没有？
gh pr list --head coverage-expansion-v1 --state all    # PR 建了没有？合了没有？
gh run list --workflow "Deploy to GitHub Pages" --limit 5   # 部署跑过没有？
curl.exe -sI https://buguoshixc.github.io/ai-deals-aggregator/   # 线上 Last-Modified/ETag
```

判定：
- 远端**没有**该分支 ⇒ t19 停在 §0/§1，从 §0 重跑（门禁驱动器）后再 push。
- 有分支、无 PR ⇒ 从 §2 继续（`gh pr create`）。
- 有 PR、CI 未定 ⇒ §3（`gh pr checks --watch`，确认名为 `gate` 的检查 success）。
- 有 PR、已 merge ⇒ §5/§6（等 Deploy + 冒烟）。
- 已 merge 且线上 `data-model=44` ⇒ 直接进 t20/t21。

工具与路径：运行单 `research/_raw/t37/t19-runbook.md`（每步标幂等/不可逆）· 线上对照物 `research/_raw/t40/`（`compare-live.cjs` 三模式）· 门禁驱动器 `research/_raw/coverage-expansion-v1/t18-gate-runner.cjs`。

## 2. 恢复第二步：把 t19 的剩余步骤做完（不可逆动作一律卡在绿的前置之后）

§0 前置（冻结 HEAD、树干净）：`t18-gate-runner` **48/0/1** · `build-local` 0 · `verify-site` **735/0** · `git status` 干净 ⇒ 任一红就不许 push。
§1 `git push -u origin coverage-expansion-v1`（不可逆）→ §2 `gh pr create`（正文要点与**未验证边界**见 t19 任务书）→ §3 `gh pr checks --watch`（人工确认 `gate` success；**master 当前无分支保护**，平台不会替我们拦）→ §4 `gh pr merge --merge`（不可逆，记 merge SHA）→ §5 等 `Deploy to GitHub Pages` success → §6 冒烟：
`node research/_raw/t40/compare-live.cjs --before=research/_raw/t40/baseline… --poll-after=… --timeout-min=12 --interval-sec=45 --require-deployed`（期望 `data-model=44` / `models-show-legacy≥1` / `data-release-date≥1` / 7×200；**CDN 600 秒未过期 ≠ 缺陷**），再 `node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/`。
回滚：`git revert -m 1 <merge-sha>` 后推 master（走同一条门禁链）。

## 3. 恢复第三步：剩余任务

| 任务 | 负责人（建议） | 内容 | 依赖 |
|---|---|---|---|
| t20 | freshness-engineer | 最终报告 `research/coverage-expansion-v1-report.md`（素材已备：`research/_raw/t39/report-inputs.md` 11 节，§I 列出 14 个"部署后才能填"的格子） | t19 |
| t21 | ci-gate-engineer（会话已爆，建议改派小会话成员） | 独立 Self-Audit `research/coverage-expansion-v1-self-audit.md`（必须引用残余登记表；如实列两条 M24 盲区，不许写 0 盲区） | t19 |
| t22 | coverage-engineer | §87 最终验收：**注意 §87 是 47 条**（题面 2568–2614 行程序化计数），任务书里的"44"是旧口径；预映射在 `research/_raw/t38/section87-precheck.md`（已可证 33 / 待产出 12 / 缺证据 2 —— 其中 29/30 经队长复核改判为**已可证**，载体 = `research/coverage-expansion-v1-source-health-rulings.md`） | t20, t21 |

引用口径三处必须转述（否则报告会写错）：
1. 残余条数 = **34** + 清单 sha256 `b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696`；登记表整文件 sha256 是另一个值 `b8b05522…`（别混）。
2. `source-health` 基线 **healthy 8 / failed 1** → 现行 **9/9**（T15-F6 是**被证伪的审查发现**，t13 原句为真）。
3. `coverage-report --json` 的 stdout sha256 因 t46 内容增加而变化：`7e50e31d…b751` → **`ff039fa4…9dcf`**；引用旧值的文档（t25 L33 / t38 §87 第 34 条 / t18-gate-results.json）需注明版本或复跑。

## 4. 本轮已完成且已验证（要点与数字）

- **数据**：providers 23→34 · plans 23→37（18 provider）· api-plans 13→17（93 条计价条目）· coverage-targets 0→34 · registry **44** 个模型（v2 字段齐、catalogStatus `{unknown 40, current 3, legacy 1}`）· links **82**（API 69 + Coding 13）· declarations **54**（Coding 42 + API 12）· 方程 `93 = 81 + 12 + 0` 与 `55 = 13 + 42 + 0`。
- **API 侧处置机制**（t23/t26/t30）：处置登记表双侧化 + 反绕过折叠牙（命名空间后缀切分已覆盖 `_`/`-`）+ `validateLinks`/`validateGaps` 成对调用机器牙；对抗性审查 **pass**（10 组对抗 fixture 全红、删 1 条声明后 6 个门禁全红、fail-open 四路径全红）。
- **门禁**：action.yml **49 步**（基线 45）· `check-ci-consistency` **38 项**且 `--expect-checks=38`（37 必红）· 反向登记制 (19)：有 selftest 文件却没被门禁跑到 ⇒ 红 · 引文自称牙：`quote` 里出现"逐字"类元自称 ⇒ 红（读数行 `292 条 quote / 13 篇文件 · 0 命中`，且边界写进读数行）。
- **两次"假红"教训（同类失败形态，都已修）**：① `verify-site` 的 `/0 条/` 子串匹配把 `10 条` 当空态；② `vendor-page-selftest` 的 `skippedNoIdentity.length === 4` 写死计数（null 身份已 9 家）。修法都是**改判据为关系式**（t31/t41），并把这条教训做成判据要求（报错要点名数据对象 + 给实际/期望两侧）。
- **两次审查侧误判（都已 append-only 更正）**：T15-F6（拿错对照物）、T38-R1（把"人读报告里的裁决表"当成"没有载体"）。
- **变异电池**：27 例（1 对照 + 26 变异）· CAUGHT 24 · 盲区 2（M24「测试改自己」构造上接不住；M24-② 真实引文无离线门禁 —— 已由三层覆盖说明，见登记表 §4.3）· 非预期红 0 · 逐字节恢复 100%。
- **审查与登记**：t15 数据质量审查 F1–F8 全闭合（含引文逐字化与 4 条抄件同步）· t26 对抗性审查 pass + 2 条加固已落地 · 残余登记表（`research/coverage-expansion-v1-residual-register.md`，t20/t21 必须引用）。
- **部署预检**：gh 已登录（repo/workflow）· Pages 已开（build_type=workflow）· 必需检查名 `gate`（但 master **无分支保护**）· 线上 URL `https://buguoshixc.github.io/ai-deals-aggregator/`（题面 `buguoshixix` 是笔误 404）· 部署前基线：线上 `data-model=0`、`models-show-legacy=0`、sitemap `<loc>=170`。

## 5. 环境教训（恢复后照做，能省很多 token）

1. **瓶颈是成员会话上下文**（4 个成员因 >512k 被判 400 死掉：registry-schema / page / ci-gate / data-integrator）+ **TPM 限流**。⇒ 契约要短、报告限行数（≤60）、装饰性产出合并（t43 已并入 t19）、一次别超过 2–3 个并发。
2. 成员分工：小而新的会话（research-firstparty / research-inference）最适合接"收尾与核对"类任务。
3. 提交纪律：一律**显式列路径**（`git add -A` 曾把别人在途产物带走）；提交信息用**文件 + `git commit -F`**（inline `-m` 带引号会被 PowerShell 拆参数）。
4. 未跟踪产物（research/_raw/**）是证据，不要清理；`git status` 里的"并发编辑"多数是未跟踪文件。
5. 不要用 `git checkout --` 重置数据文件（t24 那次吃掉了未提交改动，门禁当场抓住）。

## 6. 已知未做 / 明确边界（t20/t21 必须如实写）

- 线上冒烟只有部署后才有读数（本轮尚未拿到）。
- `aging` / `historical` 在真实数据上为 **0**，成因：44 个模型里只有 4 条有官方 `releasedAt` 证据 ⇒ 40 条是 `unknown`（默认可见）。
- 34 条历史 API 映射的引文没有逐字点名该模型（口径不一致，属已登记残余）。
- 已宣布停支：Amazon Q Developer IDE 插件 2027-04-30（Kiro 不在本轮范围）；Tabnine 官方定价面已 302（not-adopted）；xAI / Mistral / Cohere 三家 unverifiable（形态各异）。
- 价格 schema 表达力缺口（打包价 / 季付 / 积分 / 按小时 / 按 GB·天 等）只登记不落盘；`releasedAt` 引文 400 字上限是**有意例外**。
- §41 第 4 条五态普查已由 t46 补齐（此前无载体）；候选明细已同步进 JSON。
