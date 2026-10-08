# registry-adversary-v1 证据目录

> 任务 t5（`criteria-adversary-v1`）· 对刚合并的两轮判据做**对抗性独立验证**
> （轮 1 `vertical-note-coverage-v1` 合并 `1c02d84` · 轮 2 `narrow-reading-columns-v1` 合并 `ef395c0`）
> 报告：`research/criteria-adversary-v1-report.md`

## 纪律（为什么这些读数可以信）

* **产品只读**：工作树 `.worktrees/criteria-adversary-v1`（基点 `ef395c0`）里 `scripts/**`、`dist/**` 一个字节没改；
  所有攻击形态都注入到 `.arch-v1/` 下的**副本**（`dist-base` 为源，逐文件 sha256 与 `dist` 全等，见 `sha256-accounting.json`）。
* **每条形态只改 1 个文件**，注入器带锚点命中数守卫（命中数 ≠ 期望 ⇒ 直接退出非零）。
* **登记表层面的实验**只能在 `scripts/` 的副本里做（`.arch-v1/sb-empty`、`.arch-v1/sb-two`），
  产品树的登记清单没有被动过。
* **判定一律读门禁自己的 JSON**（`verify-site.js --json=…`）；探针脚本只量布局，不判。

## 文件

| 文件 | 是什么 |
| --- | --- |
| `attack-forms.json` | 全部 38 条形态记录（37 条形态；`F1` 在伪造/对照两份副本各一条）：目标 / 被攻击的承诺 / 逐字注入（含 `rawDefinition`）/ sha256 前→后 |
| `sha256-accounting.json` | 产物与各副本的逐文件 sha256 台账（「原 dist 被写 0 个」的证据） |
| `gate-readings.json` | 每份副本的门禁原始读数切片（总数/失败/失败项/条级量/扫描面/样本档） |
| `sandbox-readings.json` | 两个登记表沙箱（`entries: []` / 第二条登记未居中+幽灵条目） |
| `probe-readings.json` | 独立探针读数（几何/生效样式/字迹，9 次探针运行） |
| `findings.json` | 结论清单：守住 / 破防 / 未覆盖 / 假红，逐条附读数与修法建议 |
| `pr-body.md` | PR #64 正文的**逐字存档**（仓里前两轮的惯例；由 `.arch-v1/archive-pr-body.cjs` 抓取，不由 `make-evidence.cjs` 生成） |

## 复跑（在 `.worktrees/criteria-adversary-v1` 下）

> **完整的复跑手册在报告 §1.1–§1.4**：前置产物（Node/Edge/构建）、装置清单（每个 `.cjs` 的接口与职责）、
> 11 份副本 + 2 个沙箱 + 9 次探针的**全部命令与期望读数**、以及 t11 的「闭合判据」。
> 下面只是最短路径。

```bash
npm ci && node scripts/tools/build-local.js                 # 产物（303 文件）
node .arch-v1/tree-sha.cjs dist .arch-v1/sha/dist.json      # 基线摘要
node .arch-v1/inject.cjs --src=.arch-v1/dist-base --dst=.arch-v1/dist-att \
  --forms=.arch-v1/forms.json --manifest=.arch-v1/att-manifest.json
node scripts/tools/verify-site.js --dir=.arch-v1/dist-att --json=.arch-v1/json/att.json
node .arch-v1/probe.cjs --dist=.arch-v1/dist-att --plan=.arch-v1/probe-plan-attack.json \
  --out=.arch-v1/probe/attack.json --label=attack
node .arch-v1/make-sandbox.cjs --root=.arch-v1/sb-empty --mode=empty
node .arch-v1/sb-empty/scripts/tools/verify-site.js --dir=dist --json=../json/sb-empty.json
node .arch-v1/make-evidence.cjs                             # 重新生成本目录
```

（`.arch-v1/` 是 gitignore 的 scratch；一次性脚本与大 JSON 都住在那里。）
