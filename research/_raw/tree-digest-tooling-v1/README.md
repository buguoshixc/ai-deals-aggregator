# `research/_raw/tree-digest-tooling-v1/` · 原始读数（Tier-1）

本轮（`tree-digest-tooling-v1`）的入库证据。报告与自审在
[`research/tree-digest-tooling-v1-report.md`](../../tree-digest-tooling-v1-report.md) 与
[`research/tree-digest-tooling-v1-self-audit.md`](../../tree-digest-tooling-v1-self-audit.md)。

| 文件 | 内容 | 对应 |
| --- | --- | --- |
| `scratch-vs-repo-equivalence.json` | 仓库工具 `scripts/tools/tree-digest.cjs` 与历轮 scratch 版在同一棵 `dist` 上的等价性：`--out` JSON 字节 sha256（两侧 `d250a63c…`）· 键序与键值 · 304 条 `perFile` 逐条 diff（0）· stdout 逐字符 · 仓库工具连跑两次同串；两侧工具自身的 sha256 / blob | 报告 §2 |
| `teeth.json` | 三处变异（漏一层目录 / 排序颠倒 / 拼接少一个 LF）各咬一次 → 逐字节还原回绿的现场读数；两条负例（目录不存在 exit 2 / 字面旧路径 exit 1）；还原前后工具 sha256（`64e0ffcc…`） | 报告 §6.1 |
| `digest-dist.json` | 仓库工具对当前 `dist` 的完整输出：`dir` / `files=304` / `bytes=20386654` / `treeDigest=67d1d0bd…` / `manifestSha256=2b8fe49f…` / **304 条 `perFile`**（供后续轮次逐条 diff） | 报告 §3 |

大份原始 dump（scratch 侧输出、第二次重跑输出、探针 stdout）留在 `.arch-v1/`（gitignore，Tier-3）——
只把它们的 **sha256** 写进 `scratch-vs-repo-equivalence.json`，不再把同一份 30 KB 清单在仓里放三遍。

## 复跑（一条命令，不需要 scratch）

```powershell
git worktree add .worktrees/td <sha>; cd .worktrees/td; npm ci
npm run build
npm run report:digest                       # 期望：304 文件 / 20386654 B · 全树摘要 67d1d0bd…
node scripts/tools/tree-digest.cjs dist --json | ConvertFrom-Json   # 机读（取 .treeDigest / .perFile）
```

diff 后续版本：

```powershell
node scripts/tools/tree-digest.cjs dist --out=.arch-v1/now.json
# 与 digest-dist.json 的 perFile 逐条比；不同即列出（本轮 304 条全同）
```

## 两条口径

* **等价性**：两份实现在同一棵树上的 `--out` JSON **逐字节相同**才算「口径一致」——
  只比 `treeDigest` 不够（`perFile` 与 `manifestSha256` 各有 owner，`dir` 也在文件里）。
* **负例**：目录不存在或 `--out` 目标目录不存在时，工具**非零退出**并给一行原因 ——
  不允许「跑不出摘要但 exit 0」这种静默成功（本轮两条负例实测 exit 2 / exit 1）。
