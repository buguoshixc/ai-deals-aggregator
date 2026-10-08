# unavailable-dataset-build-crash-v1（t29）· Tier-1 证据

修掉「`plan-history.json` / `api-plan-history.json` 不可用 ⇒ 构建崩在 Dataset Manifest」的缺陷；
「损坏」形态按 captain 裁定**只量不修**（api 侧的阻断点与对称性读数见 `fixture-matrix.json`）。

装置与完整日志在 `.worktrees/unavailable-dataset-build-crash-v1/.arch-v1/`（gitignore，Tier-3）：
`fixtures/run-fixtures.cjs`（夹具矩阵：锚点守卫 + 前置守卫 + 退出无条件还原）· `teeth/run-teeth.cjs`（三颗牙）·
`make-evidence-t29.cjs`（本目录的生成器）· `logs/`。

| 文件 | 内容 | 装置 |
| --- | --- | --- |
| `fixture-matrix.json` | 9 形态 × 修复前后：exit / 阻断点 / 「没有拿到」逐字命中位置 / Manifest 登记（9 形态含 deal-history 两个对照与三份都损坏） | `.arch-v1/fixtures/run-fixtures.cjs --phase=before-all\|after-all` |
| `teeth.json` | 三颗牙：T1 改回 null 便利变量 ⇒ TypeError · T2 自检日志视图改回直接解析 dist ⇒ 点名诚实性断言 · T3 注入伪造日期 ⇒ 「不是如实空账本」；每颗都逐字节还原后复跑绿 | `.arch-v1/teeth/run-teeth.cjs` |
| `product-surface.json` | 正常形态零回归：304 文件逐文件 sha256（changed 0），全树 `f964d6ba19…` 修复前后同一个 | 同机两次构建 + 基线快照 |
| `suite-counts.json` | 断言数只增不减（同工作树 pre/post）：构建期自检 73 · selftest:plans 264 · selftest:feeds 145 · selftest:changes 119 · verify:seo 19 · verify-site 883 | 各套件实跑 |
| `README.md` / `pr-body.md` | 本索引 / PR 正文存档 | — |

报告：`research/unavailable-dataset-build-crash-v1-report.md`（§1 根因三层、§2 夹具矩阵、§4 牙、§7 留给 captain 的政策问题）；
自审：`research/unavailable-dataset-build-crash-v1-self-audit.md`（含两次装置事故：管道截断杀死夹具驱动、证据脚本比较键 bug）。
