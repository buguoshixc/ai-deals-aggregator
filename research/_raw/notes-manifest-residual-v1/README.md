# notes-manifest-residual-v1（t14）· Tier-1 证据

七个模块的 `.snote` 构造点接入登记（`ctx.note`，与 `lib/vendor-page.js` 同形），台账 58 页 → **0 页**。
装置、副本、完整日志在 `.worktrees/notes-manifest-residual-v1b/.arch-v1/`（gitignore，Tier-3）：
`scan-notes.cjs`（签名普查）· `list-notes.cjs` / `where-notes.cjs`（逐处定位）· `teeth/prod-rename.cjs`（牙 M3）·
`teeth/m1-archive.txt` · `teeth/m2-models.txt` · `teeth/m3-prod-rename.txt` · `logs/` · `dist-baseline/`（对照面）。

| 文件 | 内容 | 装置 |
| --- | --- | --- |
| `ledger-closure.json` | 台账清零：8 族 / 58 页的逐族对照（页数 / minNotes / 归属模块）+ 前后声明读数 + 台账机制现状（0 调用点） | `.arch-v1/scan-notes.cjs --only-ledger` |
| `teeth.json` | 三颗牙的读数：M1 `lib/archive.js` · M2 `lib/models-page.js`（构建 exit 1 点名 `route#index`）· M3 产物副本（verify-site §22c ⑨ 点名 `archive/#0`） | `.arch-v1/teeth/*` |
| `product-change-surface.json` | 304 文件逐文件 sha256：2 个变化（`_notes.ndjson` 预期 / `index.html` 已解释：内联 RENDER-CORE 模板源码，DOM 去 script 后逐字节相同） | `.arch-v1/dist-baseline/` vs `dist/` |
| `readings.json` | 关键读数行（原样）：构建自检那一行、`881/0`、M1/M2/M3 的点名行 | 本机日志（PowerShell 提取以免编码损失） |
| `README.md`（本文件）/ `pr-body.md` | 证据索引 / PR 正文存档 | — |

报告：`research/notes-manifest-residual-v1-report.md`（§3 台账逐族对照、§4 三颗牙、§5 产物变化面、§7 未验证清单）；
自审：`research/notes-manifest-residual-v1-self-audit.md`。
