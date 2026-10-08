# `p2-honesty-single-source-v1` · 补上 t4 亲口登记的两处缺口

t4（`p2-residuals-v1`）在报告里如实登记了两处没做完的缺口，本 PR 把它们补上。
**不伪造日期、不下调任何文本下限、断言只增不减、产物 0 变化。**

## 缺口 A：那句诚实性措辞以前**永远上不了线**

**复现（改动前，源码级实跑）** —— 把 `scripts/data/deal-history.json` 移走：

```
❌ 构建失败：Error: Dataset Manifest 形状不合法（1 处）：
  - dataset deal-history: 缺少 updatedAt        （build-local.js:4193）
```

根因是一条不变量：`lib/data-docs.js` 的 `assertManifestShape()` 要求每条数据集都有可识别的 `updatedAt`，
而日志不可用时它该有的是「没有」（`history.load()` 返回 `emptyStore()`，`startedAt = null`）——
schema 里没有「未知时间」这个状态，于是构建死在组装阶段，`/changes/` 上那句
「本次构建没有拿到历史日志…这不表示「没有变化」」根本渲染不出来。

**修法（不伪造日期）**：

1. **如实登记**：日志不可用时数据集的 Manifest 条目写成
   `updatedAt: null` + `updatedAtShape: null` + `availability: 'unavailable'` + `updatedAtNote`（同一句"没有拿到"）。
   既不写构建时刻（「今天」），也不拿 deals 的数据日期冒充 —— A2 牙专门打这两条诱惑路径。
2. **发布如实空账本**：`dist/deal-history.json`（`startedAt: null` / 0 事件 / 298 B），让数据出口的 endpoint 自洽。
3. **三条更严的新断言**（构建期 + 盘侧各一遍）：源不可用 ⇒ `updatedAt` 必须 null、必须显式登记、必须有说明；
   源可用 ⇒ 不许登记为 unavailable / 不许留空；反向：产物文件没有时间 ⇒ 必须登记为不可用。
4. **`/changes/` 自检按可用性分支**：不可用时不再要求"五栏齐"，改为要求"明说没有拿到日志" +
   **"优惠雷达自己的分栏一个都不许出现"**（新增的反向断言：别把"没有拿到日志"伪装成"没有变化"）。

**读数（三条实跑）**：

| 状态 | 构建 | 措辞命中 | Manifest `deal-history` |
| --- | --- | --- | --- |
| 日志缺失 | **exit 0** | **6 处**：`changes/index.html:1227` · `index.html:1225` · `feed/changes.xml:6` · `feed/changes.json:6` · `feed/new.xml:6` · `feed/new.json:6` | `updatedAt: null · availability: unavailable · count: 0` |
| 日志损坏 | **exit 0** | **6 处**（同上） | 同上，说明里带真实解析错误 |
| 日志正常（对照） | exit 0 | **0 处** | `updatedAt: 2026-09-30 · shape: date · count: 19` |

另外 `/docs/data/` 上那一行显示 `<time datetime="">未标注</time>`（不显示任何日期）。
独立门禁侧新增 `verify:seo §③⁗`：**正常态「不可用 0 份」18/0 绿；降级态「不可用 1 份」仍 18/0 绿**——
即"如实不可用"这个状态在独立门禁里也被接受、且被要求。

## 缺口 B：`全部变化 →` 的第二处定义

`plans-hub-page.js:251` 原来是硬编码字面量（t4 的断言是"登记表"式的，**允许**那一处）。
现在改成渲染时从 `changes.CHANGES_WORDING.CHANGES_LABELS.all` 取词；断言升级成**零容忍**
（`scripts/lib/**` 里"指向 /changes/ 的锚 + 手写文字 + 箭头" = 0 处，52 个文件扫描），
并新增一颗**入口锚变异牙**（把表里的词换掉 ⇒ 渲染必须跟着变、复位必须回原词）。
生产产物逐字节未变（正常态 304 文件全树摘要与改动前相同）。

## 四组牙（实跑红 → 逐字节还原 → 复跑绿）

| 牙 | 红读数 | 还原 | 绿读数 |
| --- | --- | --- | --- |
| B1 手写字面量回潮 | `selftest:seo` 86/**2**（点名 `plans-hub-page.js`） | `byteExact` | `selftest:seo` **88/0** |
| B2 措辞表换词 | `selftest:seo` 86/**2** + **构建 exit 1**（前端副本 ≠ 权威表） | `byteExact` | 构建 0 + `selftest:seo` 88/0 |
| B3 产物级改名（副本） | `verify:seo --dir=副本` **exit 1**（`plans/：「形变词·牙 →」`） | 原 dist sha256 未变 | `verify:seo --dir=dist` 18/0 |
| A2 假日期（**不许用别的日期顶上**） | 构建 exit 1：`源日志不可用时 updatedAt 必须是 null（实得 2026-10-08）` | `byteExact` | 日志仍缺失 ⇒ 构建 exit 0 |

## 断言账（只增不减）与验收读数

`verify-site` **880/0**（**本文件一字未动**，写作用域留给 t9）· `selftest:seo` **87 → 88** ·
`verify:seo` **17 → 18** · `check:ci` **39/0** · `check:evidence` ✅ ·
相邻套件 `selftest:data-docs` 58/0 · `selftest:planshub` 32/0 · `selftest:changes` 119/0。
文本下限一个字未改；`docs/DESIGN-RULES.md` 与 `NEXT-STEPS.md` 零改动。

## 产物变化面

**304 个文件逐文件 sha256 全等**，全树摘要 `df43587cfe90a60453e29df96599b138a8dd02242130968340cba589e6979675`（改动前 = 改动后）。

## 交付物

* `research/p2-honesty-single-source-v1-report.md`（含 §7 待排补丁：把 `unavailable` 上移进 schema 的逐行说明；
  §7(b) 给 t9 的 `verify-site §25` 两行改法）
* `research/p2-honesty-single-source-v1-self-audit.md`（**先假设这版有问题**：过滤两条形状抱怨是否等于改松、
  空账本算不算说假话、降级产物为何不过 verify-site、以及"若判定不可能"的失败点清单）
* `research/_raw/p2-honesty-single-source-v1/**`（5 个文件：降级实跑 / 入口出处 / 四组牙 / 变化面 / 断言读数）

> **请勿由本 PR 作者合并**：等 captain 验收。

