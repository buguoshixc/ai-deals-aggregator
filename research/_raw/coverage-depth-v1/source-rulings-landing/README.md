# t5 · 裁决的采集器侧落地 —— 取证与对账（只读）

- 任务：t5（Workstream C-2）。基线 `ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8`，worktree `.worktrees/coverage-depth-v1`。
- 本目录只放**临时实验/取证**产物（契约允许区：TEMP 或 research）；**裁决数据文件不在这里** ——
  `scripts/data/source-rulings.json` 是 T06 的写域，本任务只交付「交给 T06 的字段与判据」（见 `ruling-landing-checks.json#t06Handoff`）。
- 结论：长期失败来源（本刻 live 读数 `generatedAt=2026-10-04T16:31:52.051Z`，`consecutiveFailures>=3`）**只有 `futurepedia`**，
  裁决 = **`keep-degraded`**（T04 取证结论）⇒ 代码侧落地 = **不改采集代码**；本任务交付的是「三处对账同时绿 + 历史零改动」的可复核证据。

## 文件

| 文件 | 作用 |
| --- | --- |
| `probe-ruling-landing.cjs` | 只读对账探针：① 采集器↔探针表（生产函数 `domDigest.probeCoverage`）② `BASE(+headless)↔source-health` ③ fixture↔注册表 ④ `SOURCE_TYPES`→历史 `sourceType` ⑤ 历史安全（行数/生命周期/`ended`）⑥ 反向对照（证明确实有牙）⑦ T06 handoff 字段 |
| `ruling-landing-checks.json` | 上述七节的机器可读读数（含 `allChecksPass: true`） |
| `hashes-before.txt` / `hashes-after.txt` | 14 个 in-scope + 受保护文件的 sha256（两份**逐行相同** = 零改动） |
| `logs/verify.txt` | t5 首轮六条 Verify 的 stdout（V5/V6 段由 `Tee-Object` 写出，含中文的行有编码噪声；V5 的绿读以 `logs/validate-strict-head-snapshot-TEMP.txt` 为准） |
| `logs/verify-final.txt` | 终态复跑的六条命令：V1/V2/V3/V4/V6 = exit 0；**V5 = exit 1（并发成员未提交改动所致，见下）** |
| `logs/validate-strict-attribution.txt` | V5 终态红的归因：5 条错误全部指向并发成员未提交的 `api-plans.json` 记录 `09ed95f9cd81`（该记录在 HEAD 里不存在） |
| `logs/validate-strict-head-snapshot-TEMP.txt` | 用 `git archive HEAD` 导出的 HEAD 快照（TEMP）上跑同一条命令：**exit 0 / ✅ 校验通过（strict 模式）** |

## 复跑

```powershell
node research/_raw/coverage-depth-v1/source-rulings-landing/probe-ruling-landing.cjs
node scripts/tools/fixture-test.js
node scripts/tools/ai-selftest.js
node scripts/collect.js --list
node scripts/collect.js --headless --list
node scripts/validate.js --strict
node scripts/tools/provenance-selftest.js
```

## 边界

- 本任务**未**修改任何采集器、探针表、fixture、`provenance.js`（`hashes-before.txt` == `hashes-after.txt`，14/14）。
- 未跑不带 `--dry-run` 的采集；未写 `source-health.json` / `deals.json` / `deal-history.json`。
- `validate --strict` 的终态红**不是**本任务引入的：错误全部落在 `api-plans.json`（并发写域），
  HEAD 数据下同一命令是绿的（TEMP 快照实测）。
- 若 T06 后续改判为 `retire` / `headless-migrate` / `repair`，本目录的 ⑦ 节给出对应触发条件；
  落地时必须同时处理 `source-probes.json`、`fixtures/<name>/`、`SOURCE_TYPES`（保留）与 `source-health.json`（保留 stale 行）四处耦合。
