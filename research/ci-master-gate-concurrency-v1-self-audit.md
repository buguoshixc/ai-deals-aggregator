# `ci-master-gate-concurrency-v1` · 独立自审（对抗性自查）

> 报告：[`ci-master-gate-concurrency-v1-report.md`](ci-master-gate-concurrency-v1-report.md) ·
> 原始取证：[`_raw/ci-master-gate-concurrency-v1/`](_raw/ci-master-gate-concurrency-v1/)

## 1. 结论 → 证据 → 如果错了会长什么样

| # | 结论 | 证据 | 反证机会 |
| --- | --- | --- | --- |
| C1 | 历史 51 次 master gate：**46 success / 4 cancelled / 0 failure**（取消率 7.8%） | `gh api …/actions/runs?event=push&per_page=100` 的原始 JSON；按 `head_branch == 'master'` 且 `name == 'Verify site (gate)'` 过滤 | 若我把非 master 的 run 混进来，分母会变；若我按 `status` 而不是 `conclusion` 归档，在跑的那 1 次会被算错 —— 证据里两个字段都留着，可逐条复核 |
| C2 | **突发时取消率 ≈ 100%**：今天 5 次 master 推送里 **4 次 gate + 3 次 Deploy** 被取消 | 逐次 `created_at / updated_at / conclusion`（`burst-2026-10-08.json`）：两次 +10s/+11s 的 cancelled 说明那次**还在排队**；一次跑了 **4m04s** 才被杀 | 若是人工取消，间隔与模式不会这么整齐地贴着下一次 push 的时间（+8s/+10s 后就出现新的 run）；若是别的机制，`concurrency` 组名对不上 —— 两次 cancelled 的 `head_branch` 都是 master、组都是 `verify-refs/heads/master` |
| C3 | **Deploy 也会丢 run**（3/5），尽管它是 `cancel-in-progress: false` | 同上表：`#144/#145/#146` 的结论都是 cancelled，且都发生在**排队阶段**（+10s/+11s/+141s） | 若 Deploy 只是「没跑完」而不是被取代，它的 `updated_at` 不会紧跟下一次 push；实测三次都紧跟 |
| C4 | 发布链有**独立**的完整门禁（同一 action、更严） | `deploy.yml`：`prepublish` 用 `./.github/actions/gate` + `allow_degraded_run: 'false'`，`build` 靠 `needs: prepublish` | 若 prepublish 被 job 级 `if` 跳过，它就会报 Success —— `check-ci` 的 (6) 明确守着「prepublish 无 job 级 if + needs 关系」，本 PR 未触碰 |
| C5 | runner 成本这一项可以放掉 | `gh api repos/… --template '{{.private}}'` → `false`（public 仓库，标准 runner 不计费） | 若仓库转私有，这条论证失效 —— 报告 §3 写明了「那时要重估」 |
| C6 | 改动不触及任何冻结断言 | `check-ci-consistency.js` 全文没有 `concurrency` 字样（grep 0 命中）；改动后 `npm run check:ci` = **39 项 / 0 失败**；`--expect-checks=39` 未变 | 若某条断言按文件内容哈希冻结 verify.yml，改注释都会红 —— 实测没有（改前改后都是 39/0） |
| C7 | 改动方向正确（不是「把牙磨松」） | master 上从「取消」变成「排队跑完」＝**更多**验证不是更少；PR/其它分支仍取消（force-push 后旧 head 没有价值） | 若退化成「master 上永远不跑」，那是另一个极端 —— 本改动没有动触发面（`on:` 一字未改，(9) 仍守着不许加 paths 过滤） |

## 2. 本轮**没有**证明的东西（与报告 §6 同源，这里只列自审新增视角）

1. **没有真正的故障样本**：历史上 master gate **0 次 failure** ⇒ 「取消导致漏掉一个坏合并」这件事
   没有发生过。本轮的论据是「结论缺失 + 归因成本」，不是「已经出过事故」。
2. **排队延迟只有耗时分布，没有排队实测**：中位 207s / 最大 696s 是**单次运行**的耗时；
   同一 ref 串行排队时的实际端到端延迟（含 checkout 缓存冷热、runner 池拥挤）本轮没测。
3. **没有验证表达式求值的兜底**：`cancel-in-progress: ${{ github.ref != 'refs/heads/master' }}`
   只实测了两种取值（master ⇒ false；其它 ref ⇒ true）。
4. **没有审查其它 workflow 的同类风险**（`collect.yml` / `probe-sources.yml` / `ai-maintenance.yml`）。
5. **没有做改动前的对照实验**（例如在同一分支上用 `workflow_dispatch` 制造两次同组运行来复现取消）——
   改动前的证据全部来自**真实 push**（这是更强的证据，但没有可重复的对照）。

## 3. 本轮被自己的工具咬到的三个坑（记下来，别让下一轮再踩）

1. **`gh api` 的 runs 列表端点有秒级到分钟级缓存**：同一 run 在相隔 1 分钟的两次拉取里，
   一次报 `completed/cancelled`、另一次报 `in_progress`（实测踩到，差点写进报告）。
   ⇒ 结论必须用**单 run 的 `updated_at` + 最终拉取**交叉核对；本轮的突发表全部带了
   `created_at → updated_at` 两个时间戳（`+10s` 这类差值一眼能看出「排队就被取代」）。
2. **PowerShell 的 `>` 重定向写的是 UTF-16LE**（Windows PowerShell 5.1）：直接 `JSON.parse` 会炸在
   第一个字符上。分析脚本改成按 BOM 解码（FF FE ⇒ utf16le）。
3. **`gh api --jq` 与 `node -e "…"` 的引号会被 PowerShell 吃掉**（captain 也踩了三次）：
   本轮一律「`gh api` 落盘 + 脚本文件分析」，不再用内联表达式。

## 4. 回滚与失效条件（写清楚，免得改动变成不可逆的隐式契约）

* **回滚**：`.github/workflows/verify.yml` 那一行改回 `cancel-in-progress: true`（单文件、单行）。
  回滚后行为与 2026-10-08 之前**完全一致**（已把这句话写进文件注释里，改文件的人会看到）。
* **失效条件**：若未来出现「同一分支高频连推」的自动化（例如机器人 rebase 循环），
  master 上的排队会变成串行瓶颈 —— 那时正确的处置是**改推送节奏**，而不是把这一行改回 `true`
  （改回去等于重新接受「合并提交没有结论」）。
* **另一条腿**：`Deploy` 侧排队丢 run 是 GitHub 并发组的语义、仓库不可配；本轮**没有**处置它，
  它只是被记录（§1.3）。若哪天发布链需要「每个中间提交都发布过」的保证，那要另开一轮。
