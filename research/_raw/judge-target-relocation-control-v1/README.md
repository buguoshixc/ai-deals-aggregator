# `research/_raw/judge-target-relocation-control-v1/` · 原始读数（Tier-1）

本轮（`judge-target-relocation-control-v1`）的入库证据。报告与自审在
[`research/judge-target-relocation-control-v1-report.md`](../../judge-target-relocation-control-v1-report.md) 与
[`research/judge-target-relocation-control-v1-self-audit.md`](../../judge-target-relocation-control-v1-self-audit.md)。

| 文件 | 内容 | 对应 |
| --- | --- | --- |
| `readings.json` | **8 个探针模式**的逐模式读数：项数 / 失败数 / exit / 耗时 / 失败断言名 / M15·M10 相关断言的原文+细节（含命中路由 `route#index` 与几何量）/ 正对照判词；另附「仓库里未改的工具在同一副本上」的对照读数 | 报告 §2–§4 |
| `probe.json` | 探针来源与改动面：源文件 sha256（`bcd4ceaa…`）· 探针 sha256 · 逐条替换清单（锚点出现次数）· unified diff 统计（**5 hunk / +18 −10 行**）· 「没动什么」清单 | 报告 §1 |
| `dist-copies.json` | 零改动对照：`dist` 全树摘要 before = after（`67d1d0bd…`）· 干净副本 304/304 逐字节相同 · 注入副本的靶页 sha256 前后与「其余 303 文件相同」· `verify-site.js` sha256 前后相同 · `git status --porcelain -- scripts/ dist/` 为空 | 报告 §1/§3 |

**大块原始读数留在 `.arch-v1/`（gitignore，Tier-3 scratch）**：8 份完整 `--json=` 报告（各 ~891 KB）·
8 份运行日志 · 探针全文与 `probe.diff` · `dist` 的两份副本（`dist-copy` / `dist-inject-m15`）· 装置脚本
（`make-dist-copies.cjs` / `probe/make-probe.cjs` / `run-modes.cjs` / `make-evidence.cjs`）。

## 复跑

```powershell
# 装置（全部只读 dist、只写 .arch-v1/）
node .arch-v1/make-dist-copies.cjs       # 干净副本 + M15 形态注入副本
node .arch-v1/probe/make-probe.cjs       # 从只读的 verify-site.js 生成探针（5 hunk）
node .arch-v1/run-modes.cjs              # 8 个模式 × ~2.5 分钟，串行
node .arch-v1/make-evidence.cjs          # 重算本目录的三份 JSON

# 对照：仓库里那一份未改的工具（应与模式 base 逐项相同：883 / 0）
node scripts/tools/verify-site.js --dir=.arch-v1/dist-copy --json=.arch-v1/json/repo-tool-control.json
```

## 三条口径

* **靶位**：M15 = 变异作用的那一页（`route`）；M10 = 变异作用的档位宽度（`width`，与 `@media (min-width:1500px)` 绑定）。
  「挪走」= 在**探针副本**里换常量，仓库里的 `verify-site.js` 一个字不动。
* **红的落点**：每次注入都要看**是哪条断言红**。本轮出现两种落点：牙自己红（M10 靶位失效）· 全站扫描红而牙全绿（形态落在靶页上）。
  只看「有没有红」会把这两种读成同一件事。
* **正对照的降级**：M15 的正对照在「本轮目录本身带竖排」时会走豁免路径（仍绿），此时它**不再证明严格形式** ——
  读数表里那一行的判词会从「严格形式成立」变成「由 `--dir=dist` 的那一次运行承担」。
