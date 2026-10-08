# `research/_raw/vertical-note-coverage-v1/` · 这一轮的原始读数

> 轮次：`vertical-note-coverage-v1`（2026-10-08）· 主题：**§22c 的 ② 判据按 `writing-mode` 参数化**，
> 闭合 `secondary-page-layout-unification` 留下的 P1（T31 的 `requiredFix`）。
> 人读报告：[research/vertical-note-coverage-v1-report.md](../../vertical-note-coverage-v1-report.md) ·
> 独立复核：[research/vertical-note-coverage-v1-self-audit.md](../../vertical-note-coverage-v1-self-audit.md)

## 1. 文件索引（本目录只有小 JSON 与人读文本；**大报告不进仓**）

| 文件 | 是什么 | 规模 |
| --- | --- | --- |
| `T31-P1-CLOSURE.md` | 配对证据（人读）：旧口径 vs 本轮口径在同一批字节上的逐档读数 + 复跑命令 | 文本 |
| `probe-verdict.json` | 从探针自己的读数**独立复算**两套口径的码（逐档） | 6 KB |
| `paired-gate-readings.json` | 三份门禁报告切出的配对读数（旧@副本 / 新@副本 / 新@dist）与 M15 三条断言逐字 | 26 KB |
| `scratch-accounting.json` | 形态注入副本的对账（303 文件 · 只 1 个与 dist 不同 · dist 被写 0 个 · 冻结串 1→1 · +85 B） | 1 KB |
| `dist-unchanged.json` | 产物零变化证明（判据改动前后重建 dist 的全树摘要 + 逐文件差异数） | 1 KB |
| `pr-body.md` | PR 正文存档（与线上 PR 逐字一致） | 文本 |

**不在这里的东西（按证据政策留在 Tier-3，`.arch-v1/` 已 gitignore）**：
`vn-pre-change-on-form.json`（862 项 / 失败 1 = 改动前那一版打注入副本）· `vn-old-gate-on-form.json`（1.1 MB）·
`vn-form.json`（868 / 4）· `vn-after.json`（868 / 0）· `vn-baseline.json`（862 / 0，改判据前）·
`vn-probe-dist.json` · `vn-probe-form.json` · `vn-full-gate.json` 与对应 `.log`。
它们都是**可复跑的中间产物**，命令见 `T31-P1-CLOSURE.md` §4 与人读报告 §7。

## 2. 这一轮的三个「独立来源」

1. **门禁自己**（`scripts/tools/verify-site.js`，改前 = 轮 6 冻结版 `2cbc160dc64f8ade…`，522,527 B）
   —— 全站 186 页 × 1440/1600 逐条 + 760/360 样本集 + M15 变异牙。
2. **探针**（`research/_raw/secondary-page-layout-unification/verify/t31/writing-mode-probe.cjs`，**本轮一字未改**）
   —— 自带静态服务器、自写量测与归并、不 require 门禁；本轮只换 `--dir=` 与 `--route=` 复跑。
3. **独立复算**（`.arch-v1/vn-verdict.cjs`，Tier-3）—— 只读探针 JSON，按公开口径把两套码各实现一遍。

三条线在「18 列 / 列栈 362.64px / 行 1 / 内容盒 1369px（满宽）」这组读数上**互相吻合**（见 §1 的两份 JSON）。
