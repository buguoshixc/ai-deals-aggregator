# `unavailable-note-machine-independence-v1`（t27）证据目录

本目录 = t27 的**小 JSON 证据**（Tier-2，可入库）。原始产物树、完整构建日志与一次性探针脚本
留在本机 `.arch-v1/t27/`（Tier-3，按 `docs/EVIDENCE-POLICY.md` 不进库）。

## 结论一句话

日志不可用时的「本次构建没有拿到 …」说明原先印的是加载器给的**宿主绝对路径**
（实测 `D:\…\scripts\data\deal-history.json`），已改成**只写 basename**，并新增一条
**机器无关性判据**（构建期 + 独立门禁两侧都跑）。

## 文件

| 文件 | 内容 |
| --- | --- |
| `scan-machine-strings.json` | 六棵产物树（改前/改后 × 正常/不可用缺失/不可用损坏/毒化副本）逐文件扫「机器相关串」与「没有拿到」的计数与命中行 |
| `artifact-invariants.json` | 产物级不变量：渲染侧那句话出现在哪些文件、三份数据集的 `updatedAt / availability / updatedAtNote` |
| `tree-digests.json` | 全树摘要 + 逐文件对账（正常路径改前↔改后；不可用路径改前↔改后；改后↔`git checkout` 还原后重建） |
| `teeth.json` | 两颗牙的实跑读数：T1（构建期，改回印绝对路径 ⇒ 红）、T2（独立门禁，只毒化产物副本 ⇒ 红） |
| `unit-probe.json` | 纯函数边界两侧：正例 / 反例（`https://…`、中文里的斜杠）/ 边界形态（含**已知未覆盖**的 `~user/…`）+ 真实三函数链 |
| `suite-counts.json` | 改前/改后的四个套件读数 + 最终链（`build` / 四个套件 / `verify-site` / `check:evidence` / `gate`）的退出码 |
| `source-digests.json` | 三个 in-scope 源文件与三份日志数据文件的 sha256（含改前/改后两个已知哈希） |
| `out-of-scope-findings.json` | **in-scope 之外的发现**：`plan-history.json` / `api-plan-history.json` 不可用时构建死在 Dataset Manifest 那一步（到不了本任务的文案） |

## 复现（本机）

```powershell
# 装置（Tier-3，留在 .arch-v1/t27/）：scan.cjs / readings.cjs / tree-diff.cjs / poison.cjs / make-evidence.cjs / unit-probe.cjs
node .arch-v1/t27/readings.cjs .arch-v1/t27/readings.json   # 产物级不变量
node .arch-v1/t27/unit-probe.cjs                            # 纯函数边界两侧（含「不许误伤 https://」反例）
node .arch-v1/t27/make-evidence.cjs                         # 由原始读数重建本目录
```

不可用形态 = 临时移走 `scripts/data/deal-history.json`（其余两份见 `out-of-scope-findings.json`），
构建到 `.arch-v1/t27/dist-unavail-*`；数据文件每次都按 sha256 逐字节还原
（`563bcfd0e00e3211995bdefe097b3096ed778a7ebed69c4e1c1614ca8187802e`）。
