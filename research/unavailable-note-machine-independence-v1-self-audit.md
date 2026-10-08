# `unavailable-note-machine-independence-v1`（t27）自审

配套：`research/unavailable-note-machine-independence-v1-report.md` ·
`research/_raw/unavailable-note-machine-independence-v1/`（7 份小 JSON + README）

## 1. 我声称的 vs 我实际量到的

| 声称 | 证据 | 强度 |
| --- | --- | --- |
| O1 复现（产物含宿主绝对路径） | `scan-machine-strings.json` 的 `unavailBefore`（`data/index.json:45` 一行，盘符 1 / 反斜杠段 4 / 宿主根 1） | 直接读数 |
| 修复后机器无关 | 同一份扫描 `unavailAfter`：五类计数**全 0**；`artifact-invariants.json` 里那句说明逐字可见 | 直接读数 |
| 判据能红（构建期） | `teeth.json` 的 `T1_buildSide`（exit 1 + 2 条点名） | 直接读数 |
| 判据能红（独立门禁） | `teeth.json` 的 `T2_independentGate`（毒化副本 18/1；干净 18/0；O1 原产物 18/1） | 直接读数 |
| 正常路径零回归 | `tree-digests.json`（304 文件，added/removed/changed = 0/0/0，全树摘要同一串） | 直接读数 |
| 「没有拿到」要求未松 | 不可用路径该串命中 11 → 11；渲染侧那 6 处同址 | 直接读数 |
| 断言只增不减 | `suite-counts.json`（119/145/88/18 两侧相同）+ 门禁 48/0 + verify-site 880/0 | 直接读数 |

**没有夸大的一处**：具名断言**条数没变**（新规则挂在两个已有检查函数内部），所以"只增不减"是靠
相等 + 两颗牙"能红"来支撑的，不是靠计数变大。

## 2. 过程中真正咬到我自己的三件事（如实登记）

1. **判据在第一个"真实形态"的对抗输入上就抓到了我**：`unit-probe.cjs` 的 `reasonChain`（真实三函数链）
   喂 `EPERM: … open 'D:\…\Code\AI Page\scripts\data\deal-history.json'` ⇒ 我原先的
   `machineIndependentText()` 在**空格处截断**（本仓库目录名就叫 `AI Page`），留下
   `'AI Page\scripts\data\deal-history.json'`，判据随即给出 `反斜杠目录段`。处置：加一步
   "引号里的路径允许含空格"（`changes.js` 里就写着这条教训），链路口径复跑 ⇒ 说明干净、`honestyProblems` 空。
   这也是本轮唯一一次**判据先于我发现缺陷**的记录。
2. **第一次 `npm run gate` 是我自己弄红的**：我在后台跑门禁的同时做"临时移走 `scripts/data/*.json`"的探针，
   门禁第 [41] 步 `Archive self-test` 读到 `ENOENT … api-plan-history.json` 而失败。串行重跑 ⇒ **48 脚本 / 失败 0**。
   教训与 t20 那条一致：**本机判据链不能在数据面被借走时跑**。
3. **毒化脚本第一版写坏了 JSON**：用 `node -e` 通过 PowerShell 传反斜杠，写出 `\O` 这类非法转义，
   `seo-verify` 直接 `SyntaxError`（不是判据红）。改成专门脚本 + `JSON.parse/stringify` 往返，
   并**先证明往返逐字节无损**（`roundTripIdentical: true`）再毒化。

（另：所有证据 JSON 第一次是用 PowerShell `>` 重定向写的 —— 那是 **UTF-16**，`JSON.parse` 直接报错。
后改为 node 自写文件 / `Out-File -Encoding utf8` + 读入时去 BOM。）

## 3. 没证明的东西（明确边界）

1. **POSIX / 真 CI runner 上没跑过**：本机是 Windows。`noteFileLabel()` 两种分隔符都切、纯函数读数
   覆盖了 POSIX 形态，但"在 Linux runner 上产物逐字节相同"是推理，不是实测（本地跑不到 CI 的 4 步：
   Install dependencies / Prepare browser / Browser availability decision / Gate conclusion）。
2. **`~user/…`（`~` 后不接分隔符）不命中任何一条形状**（`unit-probe.json` 的 `edge`）—— 已写进报告 §4/§8。
3. **`plan-history.json` / `api-plan-history.json` 的不可用路径到不了这句文案**（构建死在
   Dataset Manifest 步），所以这两份数据集的"说明机器无关"只有代码级成立、**没有产物级读数**。
   它俩的加载器与 `build-local.js` 都在 t27 的 in-scope 之外，我没有改（详见报告 §9，交 captain 排期）。
4. **判据只钉 `updatedAtNote` 一个字段**：别的自由文本字段若被塞绝对路径不会红。本轮的整树扫描证明
   **当前形态** 0 命中，但那是"现在没发生"，不是"结构上不可能"。
5. **构建日志仍印绝对路径**（终端/stderr、`build-local.js` 的三条告警）：那是本机诊断，不进产物；
   本轮判据**有意**不管它（要管就得改 in-scope 之外的文件）。
6. **`reason` 的"真 fixture"没造出来**：本机造不出 EPERM/EACCES 的读失败（EISDIR 的消息里不带路径，
   实测），所以 `machineIndependentText` 的端到端覆盖是**真实三函数链 + 实测形态的错误文本**，
   不是"文件真的读不了"。其余两个形态（缺失 / 损坏）是**真 fixture**（移走文件 / 写坏内容，都逐字节还原）。
7. **本轮只测了 deal-history 的不可用形态**；`changes.js` 的 `logAvailabilityOf()` 是纯函数、三份日志
   走同一条路径，但另外两份走不到（见 3）。

## 4. 工作纪律自检

- 产品写入面：**只有 `scripts/lib/changes.js` 一个文件**（提交 `c18e0f9`，+90 / −2）；`dist/` 与
  `scripts/data/` 的每一次临时改动都逐字节还原并附 sha256（`source-digests.json` / 报告 §2）。
- 零改动核对：改前/改后两次"正常路径"构建的全树摘要相同；不可用路径只多出 `data/index.json` 一处内容变化。
- 装置全部在 `.arch-v1/t27/`（Tier-3，本机，未入库）；入库证据只含 `.md` / `.json`（`check:evidence` 绿）。
- 我没有改 `scripts/lib/archive.js`（captain 明示留给 t14）；只做了事实核查并写进报告 §9。
- 本任务不自行合并：PR 由 captain 验收。
