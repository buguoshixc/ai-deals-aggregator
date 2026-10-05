# coverage-depth-v1：把已有的 Coverage / Currentness / Source Health 做深、做稳、做可信

本轮**不横向扩 Provider**，而是把 `coverage-expansion-v1` 建起来的体系真正用起来。三条主线
A（Model Release Evidence）/ B（Existing Provider Gap Closure）/ C（Source Reliability Cleanup）
全部收口，并同轮完成自测 → 变异 → 独立重算 → Self-Audit → Full Gate → CI → Deploy → Online Smoke。

> 基线：`origin/master` @ `ff86368e6d12d1ef57b2f51aa2c957c01d2a9ed8`（全部 Before 读数都由
> `research/_raw/coverage-depth-v1/baseline/capture-baseline.cjs` 在这个 detached 纯净树上重新实测，
> **未沿用任何题面旧数字**）。

---

## 1. Before → After

| 指标 | Before | After |
| --- | --- | --- |
| Model Registry 身份 | 44 | **51**（+7，零消失） |
| `releasedAt` 已知 / 未知 | **4 / 40** | **32 / 19** |
| `catalogStatus` | current 3 · aging 0 · legacy 1 · historical 0 · **unknown 40** | current **29** · aging **2** · legacy 1 · historical 0 · unknown **19** |
| Coverage 七态（136 格） | COVERED 64 · **MISSING 17** · **PARTIAL 1** · DEFERRED 2 · UNVERIFIABLE 2 · N/A 50 | COVERED **79** · **MISSING 0** · **PARTIAL 0** · DEFERRED 3 · UNVERIFIABLE 2 · N/A 52 |
| API 计价记录 / 计价条目 | 17 / 93 | **24 / 108** |
| Coding 套餐 / provider | 37 / 18 | **44 / 20** |
| Model Registry 映射 | 82 | **92** |
| 长期失败来源裁决 | 无 | futurepedia → **keep-degraded**（带复查窗口与 4 条升级触发条件） |
| 采集来源注册数 | 9（8 healthy / 1 failed） | **9（不变）** —— 裁决为 keep-degraded ⇒ 代码侧 no-op |
| Provider Universe | 34 | **34（未膨胀）** |
| Full Gate | 49 步 | **49 步 0 失败** |

---

## 2. 三条主线各自做了什么

### A. Model Release Evidence（+26 条官方日期，4 → 30 → 32）

- 先建**确定性队列**（`unknown` 优先 → 可比组规模降序 → tier `core>major>long-tail` →
  API/Coding 引用数降序 → slug code-unit 升序），规则原文落在 `queue.json` 与研究报告里。
- 每条新增日期都带 `releaseEvidence`：**官方逐字引文 + 官方域出处 + `capturedAt`**，
  由 `validateRegistry` 强制（官方域登记、引文非空、日期真实、与 `releasedAt` 互为充要）。
- **不制造精度**：官方只到月的 5 条（火山豆包 4 条 + MiniMax M2.5）保持 `releasedAt: null`，
  逐条记 `month-known-day-unknown` + 原文。数据里**零个非规范日期**。
- **第三方零采信**：OpenRouter / SiliconFlow / Together / 媒体 / 榜单只用于发现候选，
  14 条候选被否决，逐条写明理由。
- 写盘前由 `apply-evidence.cjs` 做**机械忠实度复核**：quote 必须逐字出现在现场抓取的官方页里
  （双通道：去标签正文 + 页面内嵌负载），任一段不命中即整体不写盘。

### B. Existing Provider Gap Closure（MISSING 17 → 0，PARTIAL 1 → 0）

- 18 格缺口逐条给出口：12 COVERED · 1 UNVERIFIABLE（deepseek/deals，查过 4 类官方来源后
  **没有制造优惠**）· 1 DEFERRED（microsoft/coding，带 `revisitBy`）· 2 NOT_APPLICABLE
  （ai360/baichuan 的 coding，属**意图层编码修正**：原字符串自己就写着"没有自营 Coding 套餐"）。
- **不为降 MISSING 造数据**：`deepseek/deals` 与 `coze/api` 诚实地留在 UNVERIFIABLE。
- 每条新增 API 计价记录逐项过 11 项核对（unit / currency / input / output / cached / variant /
  freeTier / credits / evidence…），**零条**把配额包/万字符/小时/区间价硬写成 `per_1M_tokens`；
  schema 表达不了的（音频类媒体单位，3 家满足门槛）只留 `DEFERRED_SCHEMA` 证据，本轮零条硬写。
- 关系层出口齐备：新增计价条目 **15 条全部有结局**（3 link + 12 `off-registry-model` 声明），
  未判 0，方程 `108 = 92 + 16 + 0` 成立。
- `models` 维度新增 7 个身份，每个都写了「为什么是独立身份而不是别名/系列名」，
  并明确列出**不新增**的类别（第三方托管行、区间价/端侧/精调价模型、老旧线）。

### C. Source Reliability Cleanup

- 实况普查带时间戳：CI 侧 `generatedAt=2026-10-04T16:31:52.051Z`（8 healthy / 1 failed，
  futurepedia `consecutiveFailures=10`、`HTTP 403`）；本机侧 9 轮全成功。
- **归因到出口**：同 UA / 无 UA / 满浏览器头 / Googlebot 五变体全 200、无重定向、`robots: Allow /`
  ⇒ 与请求头无关；唯一无法本机复现的变量是出口 IP/机房（记为**假设**，不写成结论）。
- **overlap 不用 title 相等**：复用 `dedup.aliasKey` + 官方 URL host+path + `vendorOf`；
  「逐字相等」只能抓到 2 条 ⇒ 量化证明不能用 `title === title`。
- 裁决 = `keep-degraded`（`repair` 无可复现缺陷、`headless-migrate` 换指纹不换 IP、
  `retire` 会冻结两条独占记录的唯一刷新通道），并**如实写出反方**（增量价值 0，砍链亦有据），
  附 `revisitBy=2026-10-19` 与 4 条升级触发条件。
- 新增人工裁决层 `scripts/data/source-rulings.json`（**内部维护层**：不进 `PUBLIC_DATASETS` /
  Dataset Manifest / Sitemap / Feed），判据与三方对账在 `scripts/lib/source-rulings.js`。

---

## 3. 报告与判据层

`npm run report:coverage`（唯一维护者总入口）新增四节，文本与 `--json` 双侧同源：

1. **Release Evidence Coverage**（registry / known / unknown / known% + 按 developer、modelRole、
   catalogStatus 三维拆分；报告里写明**百分比不是 KPI**）
2. **Model Release Evidence Queue**（排序规则原文打印）
3. **Gap Closure Queue**（Priority A–D 分层 + 每条"缺哪部分"）
4. **Source Reliability**（裁决 × live 读数 join，**必带 `generatedAt`**）

`--json` 顶层键**零新增**，新键一律追加在 `coverageTargets` 既有 21 键之后；
`LEGACY_CONTRACT` 一位未动、白名单只追加。两次 `--json` **逐字节一致**。

---

## 4. 本轮修掉的 4 类"测试自己骗自己"

这一轮最值得记的不是新增数据，而是**四类假绿被当场拔掉**：

| 形态 | 实例 | 修法 |
| --- | --- | --- |
| **负例夹具依赖真实数据** | `models-selftest` 的两个 v2 负例只改 `glm-5.3` 的一半字段，靠"另一半恰好为空"才红 | 显式写死另一半 + **解耦牙**（判夹具逻辑，不判当前数据） |
| **跨语义等值断言** | `reg.declaredApiEntries === gap.declaredApiEntryCount` 把"展开后计价条目数"与"声明行数"当同一个量，只在没有 `variant:null` 通配时巧合成立 | 换成一般成立的关系式 + 通配定向牙 |
| **代数恒真式** | 修上一条时曾写入 `X === Y + (X - Y)`（永远为真） | 换成两条各有独立来源的真不变量 |
| **写死基线快照** | `total === 44`、`=== 12`、`9`、`13 组 / 10 slug`、索引次序拿源层键序冒充发布数据集次序 | 全部改成**以现读文件为分母**的结构不变量 |

每一条都配了**可证伪性证明**（构造扰动输入 ⇒ 必红）与「旧断言会红、新断言仍红」的对照，
不写"Mutation 全覆盖"。

---

## 5. 完整性（题面 §51–§54）

- **Stable ID 零 churn**：registry slug / 发布 model id / provider key / plan id / api plan id /
  deal id 六类集合**双向差零消失**。
- **History 无伪造**：补 26 条 `releasedAt` **没有**产生任何 history 事件；
  `plan-history`/`api-plan-history` 只有 7+7 条 `created`，**零 `ended`**；`deal-history` 未动。
- **Pricing 无损**：legacy 模型（`deepseek-v3.2`）详情路由与 API 计价行都保留。
- **Sitemap**：无非预期丢页；legacy 详情页仍在 sitemap 里。
- **Analytics**：本地 verify 的分析请求 **0 次**（Production Guard 未被破坏）。
- **可重建性**：build A / build B **全树逐字节一致**（303 文件，tree digest 相同），
  另有 5 条既有 `check:*-reproducible` 全绿。

---

## 6. 证据入口

```
research/coverage-depth-v1-report.md              最终报告（本文档的完整版）
research/coverage-depth-v1-self-audit.md          Self-Audit（RTM / diff review / 独立重算 / findings）
research/coverage-depth-v1-release-evidence.md    Workstream A：队列规则 + 26 行采信表 + 14 行否决表
research/coverage-depth-v1-gap-closure.md         Workstream B：逐条 before → action → after → evidence
research/coverage-depth-v1-source-reliability.md  Workstream C：每个异常来源的读数 / overlap / 裁决
research/_raw/coverage-depth-v1/                  可复跑探针、读数 JSON、变异夹具、Gate 日志
```

原始官方页快照（96 份 / 37.89 MB）按仓库既有纪律**不入库**（与 `research/_raw/v3.0-sources`
同一条），但补了离线索引 `raw-manifest.json`（96 份全部有 sha256，68 份有官方 URL），
见该目录 `README.md`。
