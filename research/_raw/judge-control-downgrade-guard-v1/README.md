# `research/_raw/judge-control-downgrade-guard-v1/` · 原始读数（Tier-1）

本轮（`judge-control-downgrade-guard-v1`）的入库证据。报告与自审在
[`research/judge-control-downgrade-guard-v1.md`](../../judge-control-downgrade-guard-v1.md) 与
[`research/judge-control-downgrade-guard-v1-self-audit.md`](../../judge-control-downgrade-guard-v1-self-audit.md)。

| 文件 | 内容 | 对应 |
| --- | --- | --- |
| `readings.json` | **7 个用例**（改前工具 / 改后工具 × 干净副本 / 形态副本 / 换靶页）× 项数 / 失败数 / exit / 耗时 / 失败断言名 / M15 与正对照相关断言原文与 detail / **豁免登记**（`exemptionMetrics`）/ 可 grep 的行（`grepLines`） | 报告 §2–§5 |
| `tooling.json` | 装置与改动面：改前工具冻结副本（源 sha256 → 副本 sha256、2 处改写）· 改后工具（sha256 / `git diff --numstat` = `87 0` / 三条新断言名 / 新开关 / 可 grep 的码 / 断言数 887→890）· 两份 dist 副本与形态注入的 sha256 · `dist` 在用例期间**逐字节未变**的对照（与用例前的副本重比，不同 0 个文件）· 范围外改动面（`git status --porcelain` 为空）· 靶位探针的来源与改动面 | 报告 §1 / §8 |

**大块原始读数留在 `.arch-v1/`（gitignore，Tier-3 scratch）**：7 份完整 `--json=` 报告（各 ~890 KB）· 7 份运行日志 ·
改前工具冻结副本 · 改后工具的靶位探针与 `probe.diff` · 两份 dist 副本 · 装置脚本
（`setup.cjs` / `run-cases.cjs` / `probe/make-probe.cjs` / `make-evidence.cjs`）。

## 复跑

```powershell
node .arch-v1/setup.cjs              # 冻结改前工具 + 建 dist 的两份副本（干净 / 形态）
node .arch-v1/probe/make-probe.cjs   # 从**改后**工具生成靶位探针（换靶页用）
node .arch-v1/run-cases.cjs          # 7 个用例（每个 ~2.5 分钟）
node .arch-v1/make-evidence.cjs      # 重算本目录的两份 JSON

# 单跑：干净产物（890/0）· 形态副本 + 显式声明（890/5 且登记 1 条）
node scripts/tools/verify-site.js --dir=dist
node scripts/tools/verify-site.js --dir=.arch-v1/dist-contaminated --allow-control-exemption
```

## 三条口径

* **改前 vs 改后**：两支工具（改前 = 冻结副本，只改 ROOT + 5 处 require；改后 = 仓库那一份）× **同一批** dist 副本 ⇒
  差值只能归因给本轮补丁（`verify-site.js` +87/−0）。
* **降级的两种读出**：改前降级只写在一条断言的 `detail` 里（断言本身 ✓、`metrics` 里**没有**这个键）；
  改后 = **默认判红**（未声明 `--allow-control-exemption`）+ **显式登记**（可 grep 的码 `M15-CONTROL-EXEMPTION`、
  计数、专用读数列、变异牙读数表新行、`metrics.layoutControlExemptionCount`）。
* **前提断言**：「M15 靶页必须含 ≥1 条页面级说明」现在是显式断言 —— 靶页 0 条说明时**先红这一条**并点名靶页，
  而不是让「复测/承重证明」以「期望码没出现」的形式红（那会让人先去怀疑牙坏了）。
