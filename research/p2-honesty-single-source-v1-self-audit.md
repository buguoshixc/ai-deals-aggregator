# `p2-honesty-single-source-v1` · 自审（对自己这版的对抗性检查）

> 任务 **t7** · 报告：[`p2-honesty-single-source-v1-report.md`](p2-honesty-single-source-v1-report.md)
> 自审的口径：**先假设这版有问题**，逐条去证；证不动才写成"守住"。

---

## 0. 逐条对照验收标准

> **先看这一条**：这份自审的**第一版**漏了一个致命项 —— 我第一次报 `completed` 时**门禁是红的**
> （`selftest:plans` §⑪ 架构边界：deals 链路不许提 plans）。**根因、处置与流程纪律见 §4。**
> 下面这张表是**修完之后**的读数。

| 验收 | 判定 | 证据 |
| --- | --- | --- |
| 缺口 A：日志缺失 ⇒ 构建成功且产物含诚实性措辞（贴命中行） | ✅ | 缺失：exit 0 + 6 处命中（`changes/index.html:1227` · `index.html:1225` · `feed/changes.xml\|json:6` · `feed/new.xml\|json:6`）；损坏：同样 exit 0 + 6 处 |
| 缺口 A：日志正常 ⇒ 该措辞不出现（正对照） | ✅ | 正常态 `markupHits 0`（只有 RENDER-CORE 里的措辞表副本，脚本块内，不算渲染） |
| 缺口 B：`全部变化 →` 在渲染源里只剩一处定义 | ✅ | 措辞表 3 处（同一词）· `scripts/lib/` 手写字面量 **0 处**（52 文件扫描）· 枢纽页渲染时取词 |
| 缺口 B：改字面量 ⇒ 判据变红 | ✅ | B1（手写回潮）86/2 红 · B2（表换词）86/2 红 + 构建红 · B3（产物改名）17/1 红；三者都还原到绿 |
| 断言数只增不减 | ✅ | `verify-site` 880=880（**未动该文件**）· `selftest:seo` **87 → 88** · `verify:seo` **17 → 18** · `check:ci` 39=39 |
| 产物变化面逐文件 sha256（含全树摘要） | ✅ | 304 文件全等 · 全树 `df43587c…`（改动前后相同）· `change-surface.json` 的源码 sha256 对 **merge-base** 算（origin/master 会往前走） |
| `npm run check:evidence` 绿 | ✅ | ✅ 没有新增的 Tier-3 文件 · 清单自证通过 |
| `docs/DESIGN-RULES.md` 与 `NEXT-STEPS.md` 未被修改 | ✅ | 对 merge-base 的 diff 只含 `scripts/`；两份文档零改动 |
| **全链门禁（事故之后新增的判据）** | ✅ | `npm run gate`：**47 个脚本 / 378.6s / 失败 0**（与 CI 读同一份 `.github/actions/gate/action.yml`） |

---

## 4. 流程事故：我报 completed 时门禁是红的（如实登记，不辩解）

**事实**：PR #72 的门禁 run `37767125542` 在我报完成之后以 failure 结束，失败原文只有一条：

```
✗ deals 链路（采集 / 合并 / 历史 / 优惠雷达 / 落地页 / SEO）完全不引用 plans
  —— scripts/lib/changes.js 提到了 plan-history
❌ === v2.1 Coding Plan 数据模型演练：263 项通过，1 项失败 ===
```

**我漏它的原因（不是借口）**：我本地跑了 6 条验收命令 + 相邻三套件（data-docs 58 / planshub 32 / changes 119），
但**没有跑全链**，于是没碰到 `selftest:plans` §⑪ 这条**架构边界**（它不在我那条清单里）。
`verdict=completed` 的语义是**可合并** —— 红门禁的交付不算完成，这一点我认。

**处置（t20）**：
* `changes.js` 里的 `LOG_DATASETS`（含 `plan-history` 字面量）**搬走**：`logAvailabilityOf(loads)` 改成
  **由调用方传入** id 与加载结果（收两种形态：`[{id,file,label,load}]` 或 `{id:{missing,broken}}`），
  文件名按约定 `id + '.json'` 推；盘侧判据 `logDatasetDiskHonestyProblems` 也去掉 id 清单，改成**遍历 Manifest 全部数据集**。
  ⇒ `changes.js` 里一个 plan token 都没有；而覆盖面**从 3 份扩到 9 份**（更严，不是放水）。
* `build-local.js` **无需改动**：它已提交的调用形态正是「调用方把已算好的数据（含 id）传进来」。
* **我拒绝的两种"快修"**：(1) 把 id 拆成 `'plan-' + 'history'` 躲静态扫描 —— 糊弄判据；
  (2) 让 `changes.js` 懒 require `./data-docs` 去读注册表 —— 静态绿，但会把 `plans-page` 传递性地拖进 deals 链路的加载图，精神上正是那条边界要防的。

**纪律（写给下一轮，也写给我自己）**：报 completed 之前，至少跑到与 CI 第 5 步等价的链：
`npm run gate`（47 个脚本 / 378.6s，本地实跑读数）或 `validate → 各 selftest → build → verify-site` 的手工链。
**本地跑不到的 CI 步骤只有 4 条非 node 步骤**：Install dependencies · Prepare browser for the real-browser gate ·
Browser availability decision · Gate conclusion（另有 CI 侧的 concurrency/cancel 行为本地复现不了）。

---

## 1. 这版最应该被质疑的四处（我自己先问）

### 1.1 「过滤两条形状抱怨」是不是把判据改松了？

**这是本任务最大的可争议点，我把它写在这里而不是藏起来。**

* 事实：`lib/data-docs.js` 的 `assertManifestShape()`（**不在写作用域**）对 `updatedAt: null` 必然产生
  `dataset X: 缺少 updatedAt`；`assertPageHonesty()` 必然再产生一条 `X: 页面上没有标出时间形状 null`。
  这两条被 `toleratedLogComplaints()` 过滤掉了。
* 为什么**不是**改松：过滤集合**不匹配任何模式**，而是由「登记本身」逐字生成 ——
  只有同时满足 `availability === 'unavailable'`（显式登记）的条目才会进集合；
  没登记就留空 ⇒ 抱怨照旧 ⇒ **红**。同时新增三条**更严**的断言（null 必须 + 必须登记 + 必须有说明 +
  源可用时不许登记/不许留空），而这正是本次要表达的新语义。
* 失败的**方向**：任何"忘了登记"或"想用别的日期顶上"的写法都落在红的一侧（A2 牙实测）。
* 仍然欠的：这套规则现在**不在 schema 里**（schema 的主人是 `lib/data-docs.js`，写作用域外）。
  ⇒ 报告 §7(a) 给了上移补丁；上移之后这两条过滤应当**删掉**（那才是终局形态）。
* **如果 reviewer 认为这不能接受**：那结论只能是「在写作用域内做不到不伪造日期」，
  请按 §1.4 的清单把缺口 A 退回为「需要 `lib/data-docs.js` 的写作用域」。

### 1.2 发布「如实空账本」算不算在说假话？

`dist/deal-history.json` 在降级态是 `{schemaVersion: 2, startedAt: null, baseline: {at: null, …}, absence: {}, events: []}`（298 B）。

* 它**不声称任何日期、不声称任何事件**；页面与 Manifest 都显式说「没有拿到日志」。
* 为什么必须发布它：数据出口的 `assertEndpointsExist` 要求文档里写出的每个 endpoint 真实存在；
  不发布就会把「诚实性」换成「少一个 endpoint」（后者更糟：数据文档会指向 404）。
* 反面意见（我认同一半）：第三方只看 `deal-history.json` 会读到"空账本"，可能理解成"从来没有变化"。
  * 缓解：Manifest 的 `availability` + `updatedAtNote` 就在同一份产物里；`check:history` 会红；页面说得很清楚。
  * 想更彻底就得给账本加一个自我描述字段（例如 `note: '…没有拿到日志…'`）——
    那要改 `lib/history-core.js` 的写入内核与 `check:history` 的校验（**不在写作用域**），
    故本轮**没有**动它，如实登记在这里。

### 1.3 降级产物在独立门禁下会红 —— 那修它干嘛？

* `verify-site` §25 会红 1 条（形状在场断言遇到 `updatedAtShape: null`）。**我没有改它**（写作用域留给 t9）。
* 这不是"修了也没用"：本次要保证的是**产品能带着那句诚实性措辞上线**（缺口 A 的原文），
  这条已经用三层读数钉住（构建 / 产物 / `verify:seo §③⁗`）。
* `verify:seo`（独立门禁，**在写作用域内**）在降级产物上 **18/0 全绿**，且它自己会要求
  「产物文件没有时间 ⇒ 必须登记为不可用」——也就是说降级态在**这一侧**是自洽且被检查的。
* §7(b) 给了 verify-site 那两行的改法，交 t9 一并做。

### 1.4 如果判定「不可能」需要列出来的失败点（备而不用）

若 reviewer 不接受 §1.1 的窄口子，那么「在不伪造日期的前提下让降级产物过构建」在当前写作用域内**不可行**，
失败点按顺序是：

1. `lib/data-docs.js:409`（`assertManifestShape`）要求 `updatedAt` 非空 → 不能是 null；
2. 同文件 `:411–415` 要求 `updatedAtShape` 与值一致、且形状可识别 → 也不能靠"空形状"绕过；
3. 同文件 `:932`（`assertPageHonesty` 内部再跑一遍 `assertManifestShape`）→ 同一个坎走两遍；
4. 同文件 `:944` 要求每条数据集的形状在页面上以 `data-time-shape="<shape>"` 出现 → 没有形状就没有可标的东西；
5. `scripts/data/deal-history.json` 缺失/损坏时**没有**任何可如实公布的时间来源：
   `history.load()` 返回 `emptyStore()`（`startedAt: null`）；写构建时刻是"今天"、写 deals 的日期是"用别的数据的日期冒充"，两者都被验收明令禁止。
   ⇒ 只能扩展 schema（第 1–4 条所在的文件），或保留调用点的窄口子（本版选择）。

---

## 2. 我这版**没**做的（如实登记）

1. **没动 `scripts/tools/verify-site.js`**（captain 明确留给 t9）；因此 §25 那条在降级态会红（§1.3）。
2. **没动 `scripts/lib/data-docs.js` 与 `tools/data-docs-selftest.js`**（不在写作用域）。
3. **A2 的"删掉断言 ⇒ 伪造通过"那一侧是推演**（断言在 ⇒ 红是实测）。
4. 没有实跑 `--url=` 线上冒烟（本任务不涉及发布链）。
5. 没有跑完整 `gate`（`npm run gate`）；跑的是验收要求的 6 条 + 相邻三条套件（合计覆盖本次改动的全部调用点）。

## 3. 我另外自查过的三个薄弱点

* **确定性**：正常态两次构建的产物摘要相同（`df43587c…`）；降级态两次（缺失 / 损坏）也各自稳定。
* **夹具纪律**：三种降级夹具（移走 / 写坏）都用 `.arch-v1/corrupt-fixture.cjs` 备份+还原，
  还原后 `sha256 == 原值`（`563bcfd0…`）且 `git status` 只剩 5 个源文件。
* **牙的副作用**：B2 换词会让**构建**也红（前端受控副本 ≠ 权威表）——这不是我加的断言，是既有的措辞契约；
  它说明"改一个词"在三条不同层面都有牙（selftest / 构建 / 产物门禁），符合"单一出处"的意图。
