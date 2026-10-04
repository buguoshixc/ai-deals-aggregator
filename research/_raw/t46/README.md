# t46 · §41 第 4 条载体（五态普查）+ 候选明细进 JSON + t39 哈希口径 append-only 更正

任务 t46（repair）。边界：只动 `scripts/tools/coverage-report.js` · `scripts/tools/coverage-targets-selftest.js` · `research/_raw/t39/report-inputs.md`（**append-only**）· `research/_raw/t46/`；生产数据、`scripts/lib/**`、门禁登记口径一个字节未动。

## 逐条状态（F1 与 F2 是本任务的核心）

| # | 严重度 | 状态 | 载体（改后） |
| --- | --- | --- | --- |
| F1 | high | ✅ | 文本 `catalogStatus 普查：current 3 · aging 0 · legacy 1 · historical 0 · unknown 40（和 44）`；JSON `coverageTargets.catalogStatusCensus`（仿 `dimensions` 的计数对象 + 词表 + `sum`/`registryModels`/词表外）；硬断言「五态之和必须有 registry 模型数，否则报告自检非 0」 |
| F2 | medium | ✅ | JSON `candidates.rows[40]`：`provider/slug/url/checkedAt/decision/adopted/flags{5}/failedReason/adoptedReason`，code-unit 稳定排序 |
| F3 | low | ✅ | R2/R5/R6/R7 标题并列题面英文名：`Provider coverage by dimension` · `Missing Current Targets` · `Unverifiable Providers` · `Deferred Complexity Providers` |
| F4 | low | ✅ | `t39/report-inputs.md` §L（append-only：+26 行 / −0 行，L169 原文逐字保留） |
| F5 | low | ✅ | 文本与 JSON 双侧来源宇宙对照：注册表 9 行 / 挂 target 5 行 / 差集 4 行 |

## 现场读数（`node research/_raw/t46/hashes-and-readings.cjs`）

- 五态：JSON `{"current":3,"aging":0,"legacy":1,"historical":0,"unknown":40}` · `sum=44` · `registryModels=44` · 词表外 `[]`；文本 `current 3 · aging 0 · legacy 1 · historical 0 · unknown 40（和 44）`（两侧逐档一致，自测里有对拍）。
- 候选明细：`rows 40` · 带 `url` 40 · 带 `checkedAt` 40 · 带 `failedReason` 27（文本侧 URL 34 次；JSON 多出的 6 条是「既没采信、也没记未采信」的中间态 —— JSON 现在比文本更全）。
- 来源宇宙：`registryRowCount 9` · `registryOnlySources 4`（Futurepedia / Futuretools / Layer3Labs / aitools.fyi）。
- 复算（验收 ③）：契约里那条命令指向 `scripts/data/models.json` ⇒ `{ undefined: 44 }`（该文件**不带** `catalogStatus`）；同一口径换成发布产物 `./models.json` ⇒ `{ unknown: 40, current: 3, legacy: 1 }` sum 44 —— 恰好是上面那一行。
- determinism：两次 `--json` 逐字节一致 `true`；stdout 218443 B sha256 `ff039fa40a804a2d5e5a9004509670e3eb9babfd6db33723f2b6e3b5beab9dcf`（**与 t25/t39/t45 记的 `7e50e31d…b751` 不同 —— 报告内容按本任务验收变多了**；t39 §L 已 append 口径与两版值）；载荷段 179383 B sha256 `5288c615e4fc39fa4850db4630b4315e1b226febd21775ff673071ff0f04be77`。

## 反证明细（`node research/_raw/t46/counter-proofs.cjs` → 5/5；只喂 `--published-models=` / `--candidates=` 临时文件，不碰生产数据）

| id | 变异 / 构造 | 期望 | 实测 |
| --- | --- | --- | --- |
| C1 | 不改任何输入（对照绿） | exit 0 | 文本行与 JSON 逐档一致；JSON == 直接过滤 `models.json` |
| P1 | 发布产物少 1 个模型 | 红 | exit 1：`五态普查不闭合：五态之和 43（…unknown 39（和 43））≠ registry 模型数 44` |
| P2 | 一个 `catalogStatus = 'retired'` | 红 | exit 1：`不在词表里（retired）` |
| P3 | 一条**缺** `catalogStatus` 字段 | 红 | exit 1：`不在词表里（(字段缺失)）` —— 不许静默并进 unknown |
| P4 | 候选登记表换成 2 条 | 跟着输入走 | exit 0：`rows=[…/a, 2026-10-01, 未采信] […/b, 2026-10-02, 采信]` |

反证只落 TEMP，跑完复核共享工作区 ✓ 7/7 文件 sha256 未变。

## 冻结契约与自测

- 白名单**追加** `coverageTargets: [catalogStatusCensus]` · `coverageTargets.sourceHealth: [registryRowCount, registryRows, registryOnlySources]` · `candidates: [rows]`；并把 `coverageTargets`、`coverageTargets.sourceHealth` 冻成「旧键前缀（逐字逐序）+ 追加键白名单」，嵌套节用点分路径取值（配反证牙）。旧键一个没挪位（顶层键序实测仍是 `generatedAt…coverageTargets`）。
- 自测 **96 → 110 项，0 失败**；新牙：P1/P2 两条动态反证 + 点分路径取值器 + 五态逐档对拍（文本↔JSON、JSON↔`models.json` 直接过滤）+ 候选明细 / 来源宇宙的存在性与关系断言。

## 需要队长裁决的一件事（不在本任务可修范围）

验收 ③ 给的复算命令（`require('./scripts/data/models.json')`）**在构造上拿不到**五态：那是**来源层注册表**，而 `catalogStatus` 是 `lib/model-registry.js` 的 `DERIVED_KEYS` 之一（来源层**禁止手写**派生字段），所以它必然打印 `{ undefined: 44 }`；带该字段的是**发布产物** `./models.json`（build 期由 freshness 策略派生）。本任务按验收 ① 的「单一出处 = lib 词表 + `models.json` 的 `catalogStatus`」把普查建在发布产物上，报告文本印的也是这条（发布产物的）复算命令；**没有**改数据层。若希望那条 Verify 命令原样成立，要改的是数据模型或该命令本身（越界，未做）。

## 复跑

```powershell
node scripts/tools/coverage-report.js            # 文本（五态普查行 + 英文条目名 + 来源宇宙对照）
node scripts/tools/coverage-report.js --json     # 追加机器可读（catalogStatusCensus / candidates.rows / sourceHealth.*）
node scripts/tools/coverage-targets-selftest.js  # 110 项（含 2 条动态反证牙）
node research/_raw/t46/hashes-and-readings.cjs   # determinism 两条口径 + 五态 / 候选明细 / 来源宇宙读数
node research/_raw/t46/counter-proofs.cjs        # 5/5 反证（--json 写 t46-counter-proofs.json）
```
