# `research/_raw/post-merge-deploy-v1/` · 原始读数（Tier-1）

本轮（`post-merge-deploy-v1`）的入库证据。报告与自审在
[`research/post-merge-deploy-v1-report.md`](../../post-merge-deploy-v1-report.md) 与
[`research/post-merge-deploy-v1-self-audit.md`](../../post-merge-deploy-v1-self-audit.md)。

| 文件 | 内容 | 对应 |
| --- | --- | --- |
| `build-digest.json` | 干净工作树（master 头 `d19017af`）两次构建的文件数 / 字节数 / 全树摘要 / 清单摘要 / 逐文件差异 + `_notes.ndjson` 在摘要里的条目 | 报告 §1 |
| `online-check.json` | 14 条目标的线上↔本地逐字节对账：HTTP 状态 / 字节数 / 两侧 sha256 / 是否相同 / `x-cache`·`age`·`last-modified` 等响应头；页面另带 canonical 自指 / 冻结串次数 / 竖排泄漏；`_notes.ndjson` 另带行数与逐行 JSON 合法性 | 报告 §2–§3 |
| `deploy-anchor.json` | 时间锚：被复核提交的 gate / Deploy run 终态、读数窗口，以及读数之后 master 的两次前进 | 报告 §4 |

## 复跑

```powershell
git worktree add .worktrees/pmd <sha>; cd .worktrees/pmd; npm ci; npm run build
npm run build -- --out=dist.b2
node .arch-v1/tree-digest.cjs dist    --out=.arch-v1/dist-b1.json
node .arch-v1/tree-digest.cjs dist.b2 --out=.arch-v1/dist-b2.json
node .arch-v1/post-merge-online-check.cjs --out=.arch-v1/online-check.json
```

## 两条口径

* **判据**：线上响应体的 sha256 == 本地 dist 同一个文件的 sha256；页面另加三条不变量
  （canonical 自指 · 冻结串恰好 1 次 · 无 `writing-mode` 竖排泄漏）。与 t1 完全同一套，便于两轮对着看。
* **异常处置**：非 200 或逐字节不同 ⇒ 先报 captain、原样记录、**不自行归因**、不用重试掩盖；
  用 `Deploy` run 终态当时间锚区分「部署尚未完成」与「真的不一致」。本轮**没有**触发这条分支（0 条）。
