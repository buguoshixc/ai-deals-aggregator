# `research/_raw/ci-master-gate-concurrency-v1/` · 原始取证（Tier-1）

本轮（`ci-master-gate-concurrency-v1`）的入库证据。报告与自审在
[`research/ci-master-gate-concurrency-v1-report.md`](../../ci-master-gate-concurrency-v1-report.md) 与
[`research/ci-master-gate-concurrency-v1-self-audit.md`](../../ci-master-gate-concurrency-v1-self-audit.md)。

| 文件 | 内容 | 对应 |
| --- | --- | --- |
| `gate-runs.json` | `gh api …/actions/runs?event=push&per_page=100` 的统计：master gate **51 次 = success 46 / cancelled 4 / failure 0** + 每次 cancelled 被哪个更晚的 run 取代 + 原始 API JSON 的 sha256 | 报告 §1.1–1.2 |
| `burst-2026-10-08.json` | 2026-10-08 10:41–10:46Z 的突发（5 次 master 推送）：gate 4/5 cancelled（#163 已跑 4m04s）· Deploy 3/5 cancelled（+10s/+11s，仍在排队）；含逐次时间戳与 gate 耗时分布（中位 207s / 最大 696s） | 报告 §1.3 |
| `concurrency-config.json` | 两侧 workflow 的并发配置与 sha256、规则集 `master-gate`（要求 context = `gate`）、仓库可见性（public） | 报告 §2–§3 |
| `post-change-measurement.json` | **改动后的实测**：`v1`（只关 `cancel-in-progress`）= INSUFFICIENT（#175 在跑未被打断、#176 排队被取代且零 job）· `v2`（master 每个提交一个组）= **PASS**（#186/#187 都 `completed/success` 且都处在真实重叠窗口里，`cancelled` = 0）；另附 Deploy 侧对照 | 报告 §5 |

## 数据是怎么来的（可复跑）

* 全部原始 JSON 由 `gh api` 落盘（`.arch-v1/runs-*.json`，Tier-3，gitignore）；
* 分析脚本：`.arch-v1/analyze-runs.cjs`（计数与取代关系）· `.arch-v1/analyze-burst.cjs`（突发窗口）·
  `.arch-v1/compose-ci-evidence.cjs`（前三份）· `.arch-v1/compose-postchange-evidence.cjs`（实测那份）·
  `.arch-v1/wait-for-v2-pair.cjs`（自动判定重叠窗口）；
* ⚠️ 两个坑：`gh api` 的 runs **列表端点有缓存**（同一 run 可能报出矛盾状态，结论要用 `updated_at` 交叉核对）；
  Windows PowerShell 的 `>` 重定向写 **UTF-16LE**（分析脚本按 BOM 解码）。
