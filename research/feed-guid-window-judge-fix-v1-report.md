# feed-guid-window-judge-fix-v1 报告：修掉「feed 条数 == 日志全部事件数」这条只在巧合下成立的断言

> **一句话**：`verify-site.js` 里那条「API 价格变化订阅的 guid 逐条等于日志派生事件身份」把
> **feed 条数 == 日志全部事件数** 当不变量，而订阅源的分栏口径是**窗口**（`created`/`changed` 7 天、
> `ended`/`restored` 30 天，`asOf` = `api-plans.json.updatedAt` 的日期）。master 的 17/17 是**巧合**
> （17 条恰好全在窗口内）；t28 把 anthropic 的 `lastSeen` 如实推到 2026-10-08 后 **feed 12 / 日志 18 ✗**，
> 门禁步骤 50 红、其余 49 步全绿 —— **不是数据错，是判据错**。
> 现在改成按**设计口径**比，窗口由验证侧**独立重算**（不 require 产品实现），既有三颗牙齿全部保留，
> 并新增两颗：**「窗口内每一条事件都必须出现在 feed 里」**（老断言结构性做不到）与
> **「镜像常量 ↔ 产品声明漂移即红」**。
>
> 读数：`verify-site` 断言 **883 → 885（+2，只增不减）** · `check:ci` **39/0** · `check:evidence` 绿 ·
> `npm run gate` 绿 · 改动只有 `scripts/tools/verify-site.js`（+126 / −5）。

基线：`origin/master = 682adde`（含 PR #95）· 分支 `feed-guid-window-judge-fix-v1` ·
工作树 `.worktrees/feed-guid-window-judge-fix-v1`（`npm ci` 装在工作树内）。

原始读数（六次 `verify-site --json` 的断言明细、两个 dist 的数据面、夹具说明）已压成 Tier-1 索引：
[`research/_raw/feed-guid-window-judge-fix-v1/readings.json`](research/_raw/feed-guid-window-judge-fix-v1/readings.json)（12.4 KB）。

---

## 1. 缺陷的形状（为什么它「只在巧合下成立」）

唯一实现是 `scripts/lib/plan-changes.js` + `scripts/lib/feeds.js`，口径有四条（本轮逐条读出来的）：

| # | 规则 | 出处 |
|---|---|---|
| 1 | `created` / `changed`：`at >= asOf − (recentDays−1)`，`recentDays = 7`（`asOf−6` 在内） | `plan-changes.js` `PLAN_CHANGES_WINDOWS` / `recentFrom` / `if (event.at < recentFrom) continue` |
| 2 | `ended` / `restored`：`at >= asOf − (endedDays−1)`，`endedDays = 30` —— **不是同一个窗口** | 同上，`endedFrom` 分支 |
| 3 | `asOf = String(api-plans.json.updatedAt).slice(0,10)`（**数据时间**，不是构建时刻） | `build-local.js` 的 `radarAsOf` |
| 4 | `type === 'updated'`（记录级元信息）不进订阅；每条分栏最多 30 条 | `feeds.js` `changeItemsFor` · `PLAN_CHANGES_LIMITS.itemsPerSection` |

旧断言写的是 `jsonGuids.length === eventIds.size`（`eventIds` = 日志**全部**事件）。
两份产物的实测对照：

| 产物 | `api-plans.json.updatedAt` | 日志事件 | 窗口 | 窗口内 | feed 条数 | 旧断言 |
|---|---|---|---|---|---|---|
| master `dist` | 2026-10-05 | 17（10-01×6 · 10-04×4 · 10-05×7） | 2026-09-29..10-05 | **17** | 17 | ✓（**巧合**） |
| t28 分支 `dist` | 2026-10-08 | 18（+10-08×1） | 2026-10-02..10-08 | **12** | 12 | ✗（12 ≠ 18） |

⇒ 任何一次如实的数据更新都会把它弄红（t28 只是第一个撞上的）。**没有放宽**：判据仍然要求逐条相等，
只是相等的那一边从「全量」换成「窗口内」。

---

## 2. 改了什么

`scripts/tools/verify-site.js`（唯一改动文件，+126 / −5）：

1. **窗口独立重算**（`API_FEED_WINDOW_MIRROR` + 本地 UTC 日期算术）：从 `dist/api-plans.json` 取 `asOf`，
   按上表 1–4 条算出期望集 `apiFeedExpectedIds`。**不 require `plan-changes.js`** ——
   否则这条判据就变成「用产品自己的实现证明产品自己」，产品口径写错时它一样绿。
2. **既有三颗牙齿全部保留**（同一条断言里）：
   - ① 条数 == **窗口内**事件数（原为全量 ⇒ 修的就是这一条）
   - ② 每条 guid ∈ 日志**全量**身份空间（`eventIds`）
   - ③ RSS 与 JSON 的 guid 序列逐条相同
3. **新牙 A**（独立断言）：「日志里**窗口内的每一条**事件都出现在 feed 里」。
   它在结构上比 ① 强：**条数相等 + 每条 guid 都 ∈ 日志** 仍然挡不住「少一条窗口内、换进一条窗口外」——
   那条窗口外事件本来就是真事件。见 §4 的 C2 读数。
4. **新牙 B**（独立断言）：「镜像常量 ↔ 产品声明漂移即红」。只解析 `plan-changes.js` 的**声明文本**
   （`PLAN_CHANGES_WINDOWS` / `PLAN_CHANGES_LIMITS` / `API_PLAN_META_FIELD_TYPES`），与
   `check-ci-consistency.js` 读 `action.yml` 同一手法：口径改了而这里没跟 → **红**，不许静默失守。
   解析不出来也算**不通过**（不是「跳过」）。

断言名（改后逐字）：
- `API 价格变化订阅的 guid 逐条等于日志里**落在当前窗口内**的派生事件身份（不是每次 build 重新生成）`
- `API 价格变化订阅：日志里**窗口内的每一条**事件都出现在 feed 里（只比条数挡不住「换掉一条」）`
- `API 变化订阅的窗口镜像常量与产品声明一致（漂移即红：改 recentDays / endedDays / 元信息类型 / 分栏上限都必须同步这条判据）`

---

## 3. 控制组：六次运行（全部是同一台机器、同一份判据文件）

| 运行 | 判据 | 产物 | 项数 / 失败 | exit | 关键读数 |
|---|---|---|---|---|---|
| **A0** | 原始 | master `dist` | **883 / 0** | 0 | `JSON 17 条 / RSS 17 条 / 日志 17 条`（改前基线，巧合成立） |
| **A1** | 修后 | master `dist` | **885 / 0** | 0 | `JSON 17 条 / RSS 17 条 / 窗口内日志 17 条（日志全量事件 17 条 · asOf 2026-10-05 · 窗口 2026-09-29..2026-10-05…）` ← **控制组 ①** |
| **B0** | 原始 | t28 `dist` | **883 / 1** | 1 | 唯一 ✗ = 旧断言 `JSON 12 条 / RSS 12 条 / 日志 18 条`（**t28 撞到的那条红，原样复现**） |
| **B1** | 修后 | t28 `dist` | **885 / 0** | 0 | `JSON 12 条 / RSS 12 条 / 窗口内日志 12 条（日志全量事件 18 条 · asOf 2026-10-08 · 窗口 2026-10-02..2026-10-08…）` ← **控制组 ②** |
| **C1** | 修后 | t28 `dist` 删 1 条窗口内事件（feed 12→11） | **885 / 2** | 1 | ✗①`JSON 11 条 / RSS 11 条 / 窗口内日志 12 条`；✗②`窗口内 12 条里有 1 条没进 feed：3edb0ae3da4c` ← **负例** |
| **C2** | 修后 | t28 `dist` 删 1 条窗口内 **+ 换进 1 条窗口外**（feed 仍 12） | **885 / 1** | 1 | ✗ 只有**新牙 A**：`窗口内 12 条里有 1 条没进 feed：3edb0ae3da4c` ← **新牙的独立读数** |

「**窗口外事件缺席 ⇒ 仍绿**」的正例就是 **B1**：日志 18 条里有 6 条（2026-10-01）在窗口外、**确实不在 feed 里**，
判据仍绿，并且 detail 里明写 `日志全量事件 18 条` 与 `窗口内日志 12 条` 的差 —— 差异是**被看见并允许**的，
不是被忽略的。C2 的对照面（把窗口外事件**塞进** feed）才是错。

判例均为**副本**：`dist.t28` / `dist.c1` / `dist.c2` 都在 `.arch-v1/`（gitignore）下，
由 `mkfeedfix.cjs` 只改两份产物副本的 `feed/plans/api/changes.{json,xml}`；
**没有碰任何被跟踪的数据文件**（`git status` 里除 `scripts/tools/verify-site.js` 与 `research/` 外为空）。

---

## 4. 新牙到底「做到了什么老断言做不到的事」（C2 的逐条解释）

C2 的 feed 条数**仍是 12**、窗口内事件数**也是 12**、每条 guid **都 ∈ 日志**、RSS 与 JSON **逐条相同** ——
旧的三颗牙齿**一颗都不会响**（在 t28 数据上它们本来也响不了：旧断言比的是全量 18）。
唯一咬住它的是新牙 A：

```
✗ API 价格变化订阅：日志里**窗口内的每一条**事件都出现在 feed 里（只比条数挡不住「换掉一条」）
   — 窗口内 12 条里有 1 条没进 feed：3edb0ae3da4c
```

这就是「集合错」与「条数错」的区别。C1 是更粗的同一类错（条数也变了），两颗牙一起响。

---

## 5. 设计边界（**必须同步**，不是「一劳永逸」）

这条判据的**独立重算**是以「镜像常量 == 产品声明」为前提的。前提一旦破了而没人发现，
判据会**用错的窗口**去比一份对的产物（或反过来）—— 那正是本轮要修掉的那类静默失守。因此：

| 边界 | 现在的处理 |
|---|---|
| 产品改 `recentDays` / `endedDays` | **新牙 B 立刻红**（阈值与镜像逐值比对） |
| 产品改 `PLAN_CHANGES_LIMITS.itemsPerSection` | **新牙 B 立刻红** |
| 产品改 `API_PLAN_META_FIELD_TYPES` | **新牙 B 立刻红** |
| 产品改**窗口定义本身**（例如改成按小时、或给某类事件换窗口） | 新牙 B **抓不到**（常量没变）—— 这是**如实登记的边界**：搬动窗口定义的人必须同时改 `verify-site.js` 里那段注释点名的镜像逻辑 |
| 一个分栏的窗口内事件 > 30 条（分栏上限截断） | 判据**红**并在 detail 里写明「条数等式不再成立，需要按分栏镜像截断」。这是**保守前提**：总数 ≤ 30 ⇒ 任一栏都不可能被截断。**没有**去镜像分栏桶与截断排序（那是第二套产品逻辑，漂移面更大）；这里选择**响亮地红**，而不是静默地少判 |
| `api-plans.json.updatedAt` 变成非法日期 | 判据红（`apiFeedAsOfOk`）—— 与旧版行为一致（旧版此时 feed 为空，`length > 0` 会红） |

---

## 6. 门禁

| 命令 | 读数 |
|---|---|
| `npm run build` | exit 0（`✅ 产物自检通过` / `✅ 构建完成 → dist/`） |
| `npm run check:ci` | **39 项 / 0 失败**（`(E) 实跑项数 == --expect-checks=39`；38 条冻结清单 + 看门狗自身） |
| `npm run check:evidence` | exit 0（无新增 Tier-3） |
| `npm run gate` | **见 §6.1**（52 步 / 本机门禁链） |
| `verify-site` 断言总数 | **883 → 885（+2）** —— 只增不减 |
| 阈值 | **一处未改**：`WIDE_*`、文本下限、登记表全部未动；改动只有这一段与它新增的两个 `check` |

### 6.1 `npm run gate`

```
合计 315.8s / 48 个脚本，失败 0
✅ 本地门禁链全过（与 CI 读同一份 action.yml）      EXIT=0 · wall 316.1s
  ✓   134.4s  [50] Real-browser acceptance (verify-site.js)   ← 修后判据在全新构建产物上 exit 0
  ✓   133.8s  [51] Regression verify (baseline compare)
```

4 个非 node 步骤（`npm ci` / 装浏览器 / 浏览器可用性判定 / 结论）按设计跳过（本地无意义或需要 bash/网络）。

---

## 7. 没证明的东西（如实登记）

1. **没有证明「产品口径本身正确」**：本轮只让判据与产品口径**对齐**，没有独立判定
   「7 天 / 30 天 / 分栏 30 条」这三个数选得对不对。若产品口径本身要改，那是另一件事（本轮不许碰 `scripts/lib`）。
2. **没有覆盖 `ended` / `restored` 的真实数据**：现有两份产物里 18 条事件全是 `created` / `price_decreased`，
   **没有一条 ended / restored**。30 天窗口那一支的镜像逻辑**只有代码与常量守卫，没有数据级读数**。
3. **没有覆盖 `type === 'updated'`（元信息）真实数据**：同理，只有常量守卫。
4. **没有覆盖分栏截断的真实数据**：分栏上限 > 30 条时判据会红 —— 这条路径**没有实测**（只是读代码 + 设计决策）。
5. **t28 的产物是「分支真产物」但基线较旧**：`.worktrees/t28-real` 建在 `anthropic-cached-price-landing-v1`
   （`ef70816`）上，它的 master 基线比当前 `682adde` 旧。跑本工作树的 `verify-site` 时，
   **与 API 订阅读数无关的断言**可能受这层版本差影响 —— 实测 B0/B1 除目标断言外**全部一致且绿**（B0 唯一 ✗ 就是目标断言），
   所以这一层没有实际干扰；但它不是「t28 rebase 到 682adde 之后」的读数。
   （本机 `github.com:443` 当时不可达，**没能 fetch/检出** t28 的最新推送，只能用本地分支 tip。）
6. **没有覆盖 `--url=` 线上冒烟模式**：本轮只在 `--dir=` 下验证。该判据在 `--url=` 下同样会跑
   （`DIR` 仍指本地 `dist`，行为与旧版一致），但**没有实测**。
7. **CI（Ubuntu + chromium）未验**：本机是 Windows + msedge。

---

## 8. 复现命令

```console
cd "D:\OneDrive\Desktop\Code\AI Page\.worktrees\feed-guid-window-judge-fix-v1"
npm ci && npm run build

# 控制组 ①（master 产物）：883/0（原始）→ 885/0（修后）
node scripts/tools/verify-site.js --dir=dist

# 控制组 ② / 负例 / 新牙独立读数：在 t28 分支的真产物上跑
#   （t28 = anthropic-cached-price-landing-v1 @ ef70816，源码与数据都在那条分支上，不能在 master 代码上复现）
git worktree add .worktrees/t28-real --detach anthropic-cached-price-landing-v1
cd .worktrees/t28-real && npm ci && npm run build && cd ..
copy /e .worktrees\t28-real\dist .arch-v1\feed-guid-window-judge-fix-v1\dist.t28

node .arch-v1\feed-guid-window-judge-fix-v1\mkfeedfix.cjs .arch-v1/feed-guid-window-judge-fix-v1/dist.t28 .arch-v1/feed-guid-window-judge-fix-v1/dist.c1 dropIn 3edb0ae3da4c
node .arch-v1\feed-guid-window-judge-fix-v1\mkfeedfix.cjs .arch-v1/feed-guid-window-judge-fix-v1/dist.t28 .arch-v1/feed-guid-window-judge-fix-v1/dist.c2 swap 3edb0ae3da4c 721e0657c80d

node scripts/tools/verify-site.js --dir=.arch-v1/feed-guid-window-judge-fix-v1/dist.t28   # B1 885/0
node scripts/tools/verify-site.js --dir=.arch-v1/feed-guid-window-judge-fix-v1/dist.c1    # C1 885/2
node scripts/tools/verify-site.js --dir=.arch-v1/feed-guid-window-judge-fix-v1/dist.c2    # C2 885/1（只有新牙）

npm run check:ci && npm run check:evidence && npm run gate
```

**改动面**：`scripts/tools/verify-site.js`（+126 / −5）· `research/feed-guid-window-judge-fix-v1-report.md` ·
`research/_raw/feed-guid-window-judge-fix-v1/readings.json`。
**没有碰**：`scripts/lib/**` · `scripts/data/**` · `api-plans.json` · `dist/**` ·
`docs/DESIGN-RULES.md` · `NEXT-STEPS.md` · 任何阈值与登记表。
