# research/_raw/full-gate-local-v1 —— 本机 Full Gate 的原始读数

对应报告 [`research/full-gate-local-v1-report.md`](../../full-gate-local-v1-report.md) 与
自审 [`research/full-gate-local-v1-self-audit.md`](../../full-gate-local-v1-self-audit.md)。
运行日期 2026-10-08 · 树 `origin/master = 95dfeb99…`（含 PR #62 的合并 `33d2472` 与随后的 #63 / #64）。

| 文件 | 是什么 |
|---|---|
| `local-gate.json` | 本机 Full Gate 的**逐步骤**读数：51 步的 status / exitCode / ms、跳过理由、最慢 6 步、计数与用时；命令 `node .arch-v1/full-gate.cjs` |
| `npm-ci.json` | 第 1 步 `npm ci` 的运行方式：新工作树 `node_modules` 跑前不存在、装完后 `LinkType` 为空串（实体目录）、主工作区目录数与类型跑前跑后逐项相同 |
| `product-digest.json` | 产物变化面：跑前（手工 `build-local.js`）vs 跑后（Gate 第 36 步重建）**304/304 逐文件 sha256 相同** + 全树/清单摘要；另附「为什么是 304 而不是 303」（多出 `_notes.ndjson`，PR #63 新增） |
| `gate-alignment.json` | **51 行逐条对齐**：`action.yml` 步骤名 / 该步是否 CI-only / CI 日志里的对应命令与是否报错 / 本机结论与耗时 |
| `readings-compare.json` | 同一批工具读数的三方对照：本机 · CI @ PR #62（`0ff05f2` 合并预览）· CI @ master `95dfeb9`（与本机同一棵树）；含 `localSupplement`（本机日志只留每步末尾 3 行，非末尾读数用单独复跑补齐并标明） |
| `ci-runs.json` | 引用的 CI 运行：PR #62 的 gate（run 37760907386 / job 113256788677，success，274s）· master `95dfeb9` 的 gate（run 37762919782，success）· `33d2472` 的 master gate（run 37761851998，**cancelled**） |

**一次性探针与完整日志不进库**（Tier-3，见 `docs/EVIDENCE-POLICY.md`）：运行器与解析脚本
（`full-gate.cjs` / `tree-digest.cjs` / `ci-steps.cjs` / `ci-log-parse.cjs` / `align.cjs` /
`readings-compare.cjs` / `collect-gate-evidence.cjs`）、`full-gate-local.log`、`full-gate.json`、
CI 原始日志 —— 全部留在本机 `.arch-v1/`（`.gitignore` 已忽略）。
