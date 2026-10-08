# `p2-honesty-single-source-v1` · 补上 t4 亲口登记的两处缺口（诚实性措辞上线路径 + 入口文案单一出处）

> 任务 **t7** · 隔离工作树 `.worktrees/p2-honesty-single-source-v1` · 基点 `origin/master = 95dfeb9`（含 t3 `8c9fb29` 与 t4 `33d2472` 的合并）
> 证据：[`research/_raw/p2-honesty-single-source-v1/`](_raw/p2-honesty-single-source-v1/README.md)（5 个文件：降级实跑 / 入口出处 / 四组牙 / 变化面 / 断言读数）
> 自审：[`research/p2-honesty-single-source-v1-self-audit.md`](p2-honesty-single-source-v1-self-audit.md)
> **交付方式：走 PR，不自己合并**（等 captain 验收）。

---

## 0. TL;DR

| 缺口 | 修法 | 关键读数 |
| --- | --- | --- |
| **A：日志缺失/损坏 ⇒ 诚实性措辞上不了线**（构建死在 Dataset Manifest 步） | 日志不可用时**如实登记**数据集的更新时间为「不可公布」（`availability: 'unavailable'` + `updatedAt: null` + 说明），**不用任何日期顶替**；并发布一份**如实空账本**让 endpoint 自洽；配三条更严的新断言 | **缺失**：构建 **exit 0**，产物里那句措辞命中 **6 处**（`changes/index.html:1227`、`index.html:1225`、`feed/changes.xml\|json:6`、`feed/new.xml\|json:6`）；**损坏**：同样 exit 0 + 6 处；**正常对照**：构建 exit 0 且该句在产物里 **0 处** |
| **B：`全部变化 →` 是 `plans-hub-page.js` 的硬编码字面量** | 改成**渲染时**从 `changes.js` 的措辞表取词；断言从「登记一处手写」升级成**零容忍** + 加一颗**入口锚变异牙** | 手写字面量 0 处（52 个 lib 文件扫描）；三颗牙都实跑红→逐字节还原→复跑绿（见 §4） |
| 硬约束 | 断言**只增不减** · 文本下限一个字未改 · 产物**0 变化** | `verify-site` 880/0（**未动该文件**，写作用域留给 t9）· `selftest:seo` **87 → 88** · `verify:seo` **17 → 18** · `check:ci` 39/0 · 产物 304 文件全树摘要 `df43587c…` **改动前后全等** |

---

## 1. 缺口 A：那条诚实性措辞以前**永远上不了线**

### 1.1 先复现（源码级实跑，改动之前）

把 `scripts/data/deal-history.json` 移走，跑构建：

```
❌ 构建失败：Error: Dataset Manifest 形状不合法（1 处）：
  - dataset deal-history: 缺少 updatedAt
    at assemble (scripts/tools/build-local.js:4193:13)
   dist/ 未被改动；暂存目录已清理，可直接重跑。
```

与 t4 登记的完全一致：构建**在组装阶段就死**（`=== 2) 组装产物`），因此「产物自检」与 SEO 门禁都没跑到；
而那句诚实性措辞的渲染分支（`CHANGES_NOTES.unavailable`）虽然由渲染器断言钉着（build-local:5819–5826），
**在真实构建里够不着** —— H14 的不可用分支是防御性的。

**根因（一条不变量）**：`lib/data-docs.js` 的 `assertManifestShape()` 要求**每条数据集**都有一个
可识别的 `updatedAt`（`if (!dataset.updatedAt) problems.push('缺少 updatedAt')`），而日志不可用时
它该有的是「没有」（`history.load()` 在缺失/损坏时返回 `emptyStore()`，`startedAt = null`）。
manifest 的 schema 里**没有「未知时间」这个状态**。

### 1.2 修法：如实登记 + 空账本（**不伪造日期**）

1. **Manifest 如实登记**（`lib/changes.js` 新增的纯函数，构建期与独立门禁同一份口径）：
   ```json
   { "id": "deal-history", "url": "deal-history.json",
     "updatedAt": null, "updatedAtShape": null,
     "availability": "unavailable",
     "updatedAtNote": "本次构建没有拿到 deal-history.json（文件缺失）——这份数据集的更新时间不可公布，这不表示「没有变化」。",
     "count": 0 }
   ```
   * **不写构建时刻**（「今天」）、**不拿 deals 的数据日期冒充** —— 这两条诱惑路径都由新断言打掉（§4 的 A2 牙）。
   * 只放过**两条**「形状」抱怨（`dataset X: 缺少 updatedAt` 与 `X: 页面上没有标出时间形状 null`），
     且这两条是**从登记本身逐字生成**的（`toleratedLogComplaints()`，不做模式匹配）——
     没有登记就想留空时，抱怨照旧 ⇒ 红。失败方向是红。
2. **发布一份如实空账本**：`dist/deal-history.json`（298 B，`startedAt: null`、`events: []`），
   让数据出口的 endpoint 真的存在（否则数据文档页的 `assertEndpointsExist` 会红），
   且**不声称任何日期**；页面上的说法仍是「没有拿到日志」。
3. **三条更严的新断言**（`logDatasetHonestyProblems` / `logDatasetDiskHonestyProblems`，构建期 + 盘侧各一遍）：
   * 源不可用 ⇒ `updatedAt` 必须 null（**拿任何日期顶上即红**）；
   * 源不可用 ⇒ 必须显式登记 `availability` + 给出「没有拿到」的说明；
   * 源可用 ⇒ 不许登记为 unavailable、不许留空（反向亦然：产物文件没有时间 ⇒ 必须登记为不可用）。
4. **`/changes/` 的自检按可用性分支**：日志不可用时不再要求「五栏标题齐」（那一页按纪律不渲染分栏），
   改为要求「明说没有拿到日志」+「**优惠雷达自己的分栏（`section.chgsec#<key>`）一个都不许出现**」——
   后者是新增的反向断言：别把「没有拿到日志」伪装成「没有变化」。套餐/API 那两块有各自的日志，不在此列。

### 1.3 三条实跑读数

| 状态 | 构建 | 那句措辞在产物里 | Manifest 的 `deal-history` | 产物文件 |
| --- | --- | --- | --- | --- |
| **日志缺失**（文件移走） | **exit 0** | **6 处**：`changes/index.html:1227`（`<p class="snote chgwarn">`）· `index.html:1225`（首页条带 `.rnone`）· `feed/changes.xml:6` / `feed/changes.json:6` / `feed/new.xml:6` / `feed/new.json:6`（订阅描述） | `updatedAt: null · availability: unavailable · count: 0` + 说明 | `deal-history.json` 298 B · `startedAt: null` · `events: 0` |
| **日志损坏**（语法坏掉） | **exit 0** | **6 处**（同上） | 同上，说明里带**真实的解析错误**（`Expected property name or '}' in JSON at position 69 …`） | 同上 |
| **日志正常**（对照） | **exit 0** | **0 处**（只有 RENDER-CORE 里那份措辞表副本，不算渲染） | `updatedAt: 2026-09-30 · shape: date · count: 19` | 96546 B · 19 事件 |

* `/docs/data/` 页面上那一行也在说实话：`<time datetime="">未标注</time> <small data-time-shape="">未标注</small>`
  （`data/index.json` 里 `updatedAt: null` ⇒ 页面**不显示任何日期**）。
* 两种降级状态下，`deal-history.json` 的源文件都被**逐字节还原**（`byteExact: true`，sha256 校验），
  `git status` 只剩本次要提交的 5 个源文件。

### 1.4 为什么规则写在 `lib/changes.js` 而不是 `lib/data-docs.js`

`lib/data-docs.js`（`assertManifestShape` / `assertPageHonesty`）**不在本任务的写作用域**里，
而 `assertManifestShape` 的规则是「每条数据集都要有时间」。因此这一版把「如实不可用」这个状态
**在调用点**表达出来（构建期写、构建期读、独立门禁读），规则本体收在 `lib/changes.js` 的纯函数里
（可被 `seo-selftest` 直接开牙）。**正确的归宿**是把这段上移进 schema（见 §7 的待排补丁）——
那需要同时改 `lib/data-docs.js` 与 `tools/data-docs-selftest.js`，属下一轮的写作用域。

---

## 2. 缺口 B：入口文案的第二处定义

* **改动前**：`scripts/lib/plans-hub-page.js:251` 手写 `>全部变化 →</a>`；
  t4 的断言是「登记表」式的（`scripts/lib/ 里手写「全部变化 →」的位置 = 那一处（plans-hub-page.js）`），
  也就是说**判据本身承认了第二处定义**。
* **改动后**：那一枚锚在渲染时取词 ——
  `<a href="…changes/">${escapeHtml(changes.CHANGES_WORDING.CHANGES_LABELS.all)} →</a>`；
  `scripts/lib/` 52 个文件里**手写字面量 0 处**，三张措辞表（changes / plan-changes ×2）仍是同一个词。
* **断言升级**：
  * 旧：`literalSites.join(',') === 'plans-hub-page.js'`（**允许**那一处）；
  * 新：`scripts/lib/**` 逐行扫描 **「指向 /changes/ 的锚 + 手写文字 + 箭头」= 0 处**（**零容忍**，
    判据写成**代码形状**：从表里取词的写法含 `${`，天然不匹配；`>全部变化 →` / `>查看全部 →` / 任何别的词都会匹配）；
  * 加一颗**入口锚变异牙**：在内存里把措辞表的词换掉再渲染 `/plans/`，锚文本必须跟着变、复位后必须回原词。

---

## 3. 断言增减账（只增不减）

| 口径 | 改动前 | 改动后 | 说明 |
| --- | --- | --- | --- |
| `verify-site.js`（`--dir=dist`） | 880 / 0 | **880 / 0** | **本文件一个字未动**（captain 把 `verify-site.js` 整块留给 t9，避免撞车） |
| `selftest:seo` | 87 / 0 | **88 / 0** | §七：−1（登记表式）+2（零容忍 + 入口锚变异牙） |
| `verify:seo` | 17 / 0 | **18 / 0** | 新增 §③⁗「变化日志的可用性：Manifest ↔ 产物文件」（正常态「不可用 0 份」；降级态「不可用 1 份」且仍 ✓） |
| `check:ci`（`--expect-checks=39`） | 39 / 0 | **39 / 0** | 未新增门禁步骤，冻结清单不变 |
| 构建期自检（不计入上表） | — | **+3 条不变量 + 1 条分支反向断言** | 「如实不可用」三条 + `/changes/` 不可用时不许出现雷达分栏 |
| 相邻套件 | — | `selftest:data-docs` 58/0 · `selftest:planshub` 32/0 · `selftest:changes` 119/0 | 都实跑过 |

**文本下限一个字未改**：本任务没有触碰 `lib/seo.js` 的 `TEXT_FLOOR*` 与任何下限数值（`selftest:data-docs` 58/0 也覆盖了这部分）。

---

## 4. 四组牙（实跑红 → 逐字节还原 → 复跑绿）

| 牙 | 形态（源码级/产物级） | 红读数 | 还原 | 绿读数 |
| --- | --- | --- | --- | --- |
| **B1** 手写字面量回潮 | 把枢纽页的锚改回 `>全部变化 →</a>` | `selftest:seo` = **86/2**：`✗ 没有把入口文案手写成字面量 —— plans-hub-page.js` + `✗【牙】入口锚随措辞表变（换表后仍是「全部变化 →」）` | `byteExact: true` | `selftest:seo` = **88/0** |
| **B2** 措辞表换词 | `CHANGES_LABELS.all: '全部变化' → '形变词·牙'` | `selftest:seo` = **86/2**（三表不一致 + 变异牙）+ **构建 exit 1**：`✗ CHANGES_LABELS.all：前端「全部变化」≠ 权威表「形变词·牙」` | `byteExact: true` | 构建 exit 0（产物摘要回到 `df43587c…`）+ `selftest:seo` **88/0** |
| **B3** 产物级改名 | 产物**副本** `.arch-v1/dist-b3` 里把 `/plans/` 的 2 处锚文本改成 `形变词·牙 →` | `verify:seo --dir=副本` = **exit 1**：`✗ 入口文案：… plans/：「形变词·牙 →」；plans/：「形变词·牙 →」` | 原 `dist` 的 sha256 未变（`distUntouched`） | `verify:seo --dir=dist` = **18/0** |
| **A2** 假日期（**不许用别的日期顶上**） | 源日志不可用时把 `updatedAt` 写成 `2026-10-08` + `updatedAtShape: 'date'`（完整伪造） | 构建 **exit 1**：`- deal-history: 源日志不可用时 updatedAt 必须是 null（不许用别的日期顶上，实得 2026-10-08）` · `- … updatedAtShape 必须是 null（实得 date）` | `byteExact: true` | 日志仍缺失 ⇒ 构建 **exit 0**（如实登记 `updatedAt: null`） |

---

## 5. 产物变化面（**0 变化**，逐文件 sha256）

* 正常态重建后，`dist` 的 **304 个文件逐文件 sha256 全等**：全树摘要
  `df43587cfe90a60453e29df96599b138a8dd02242130968340cba589e6979675`（**改动前 = 改动后**，`change-surface.json`）。
* 也就是说「日志正常」这条主路径上，本次改动**一个字节都没改产物**：入口文案从表里取词与原来手写的是同一个词 ✓；
  可用性分支只在降级时生效 ✓。
* **降级产物**只在我做实验时存在（构建完我立刻重跑正常构建还原），它不在交付面里。

## 6. 没做 / 边界（如实登记）

1. **`verify-site.js` 一个字未动**（写作用域留给 t9）。⇒ 在**降级产物**上跑 `verify-site` 的 §25 会红 1 条
   （「页面标出每份数据的时间形状」：`data/index.json` 里有一条 `updatedAtShape: null`）。
   这是**已知的交接项**，改法见 §7；在**正常产物**上它 880/0。
2. **`lib/data-docs.js` 未动**（不在写作用域）：所以「如实不可用」这个状态目前由**两个调用点 + 一个纯函数库**共同守，
   而不是 schema 自己的规则。§7 给了上移补丁。
3. **A2 的「删掉断言 ⇒ 伪造通过」那一侧是推演**，没有实跑（时间预算）：断言在 ⇒ 红这一侧实测过；
   推演的依据是「日期 + 形状都写上时，`assertManifestShape` / `assertPageHonesty` / `assertUpdatedAt`
   （真实值为 null ⇒ 跳过）三条都不说话」。我不把它写成实测。
4. 没有动任何**文本下限**与任何**词条下限**；没有新增门禁步骤（`check:ci` 39 不变）。

## 7. 待排补丁（下一轮，都只有几行）

**(a) 把「如实不可用」上移进 schema**（`lib/data-docs.js` + `tools/data-docs-selftest.js`）：
* `datasetEntryOf()`：`updatedAt` 为空且调用方声明 `availability: 'unavailable'` ⇒ `updatedAtShape: 'unavailable'`（新形状常量）；
* `assertManifestShape()`：允许 `unavailable`（但仍要求 `updatedAt === null`）；
* `assertPageHonesty()` 的形状在场断言：`unavailable` 在页面上以 `data-time-shape="unavailable"` 呈现（`TIME_SHAPE_LABEL` 加一行「本次没有拿到日志」）；
* 两侧调用点即可删掉 `toleratedLogComplaints()` 的过滤（那是过渡期的窄口子）。

**(b) `verify-site.js` 的 §25（交给 t9）**：把
`[...new Set(doc.datasets.map(d => d.updatedAtShape))].every(s => onPage.has(s))`
改成**排除 `availability === 'unavailable'` 的数据集**，并**新加一条**：
「如实不可用的数据集在页面上不许出现日期」（`<time>` 文本不含 `\d{4}-\d{2}-\d{2}`，形状属性为空）——
与 `verify:seo §③⁗` 同口径，两处合起来才是完整的应用面。

**（c）本任务留给 t11 的交接**：t11 的形态集要覆盖本次新增的边界 ——
「日志缺失 / 损坏 ⇒ 构建成功 + 措辞在场 + Manifest 不许有日期」这一组三层读数（构建 / 产物 / 独立门禁）。

## 8. 附录：复跑

见 [`research/_raw/p2-honesty-single-source-v1/README.md`](_raw/p2-honesty-single-source-v1/README.md)：
正常态与两种降级态的构建命令、`scan-wording` 的命中口径、四组牙的 make/restore、
以及 `verify-site` / `selftest:seo` / `verify:seo` / `check:ci` / `check:evidence` 的期望读数。
