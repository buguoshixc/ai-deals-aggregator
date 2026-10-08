# `registry-adversary-v1` 证据目录（t5 原始 + **t11 再攻击**）

本目录 = 两轮对抗性验证的 Tier-2 证据（可入库）。原始副本、完整日志与一次性装置留在本机
`.arch-v1/`（Tier-3，按 `docs/EVIDENCE-POLICY.md` 不进库）。

## t5（原攻击轮）的 7 份

`attack-forms.json` · `findings.json` · `gate-readings.json` · `probe-readings.json` ·
`sandbox-readings.json` · `sha256-accounting.json` · `pr-body.md`（+ 本 README 的原章节）

## t11（再攻击轮，`criteria-adversary-v1-reattack`）新增的 3 份

| 文件 | 内容 |
| --- | --- |
| `reattack-copies.json` | **24 次门禁实跑**的逐副本读数：总项 / 失败数 / 失败检查名与明细 / 条级码样本 / `att` 与 `newa` 的**完整未登记页清单**（来自把判据副本的 `slice(0,4)` 改成 `200`） |
| `reattack-extra.json` | `verify:seo` 在注释伪造副本上的读数（forge / forge-ctl / forge3 / forge3-ctl / newe）· 14 次探针读数 · **产品零改动证明**（dist 全树摘要前后同一串 + 逐副本注入面） |
| `reattack-README.md` | 本文件 |

## t11 的判定一句话

**9 条破防 9/9 闭合 · 守住面 15/15 无回归 · 前 3 名绕过路径全闭合 · 未覆盖 6 条里 1 闭合 1 修好 1 部分闭合 3 仍开 ·
新增 15 条形态 + 6 个沙箱里 2 条新破防（N14 裁切祖先零码 / N8-N9 冻结串判据级仍可伪造）+ 1 条新未覆盖（N19 `<noscript><style>`）。**

## 复跑

见 `research/criteria-adversary-v1-reattack-report.md` §9（从零复跑命令块，含 24 次门禁的逐条命令）。
关键一条：`node .arch-v1/mk-reattack-evidence.cjs` 从 `.arch-v1/` 的原始读数重建本轮的 3 份证据文件
（**不会覆盖 t5 的 7 份**）。
