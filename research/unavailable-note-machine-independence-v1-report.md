# `unavailable-note-machine-independence-v1`（t27）：不可用说明不得含宿主绝对路径

> 任务：t27（implementation）· 分支 `unavailable-note-machine-independence-v1` · 提交 `c18e0f9`（`scripts/lib/changes.js` +90 / −2，sha256 `07887908679b2dd5587c790cc4a785964e474c94637d10c4eeeeed5a1d8a1014`）
> 原始读数：`.arch-v1/t27/`（Tier-3，本机）· 可入库小 JSON：`research/_raw/unavailable-note-machine-independence-v1/`（8 份 + README）
> 改动的产品文件：**只有** `scripts/lib/changes.js`

---

## 1. 结论

t19 的观察 O1 **复现成立且已闭合**：

| | 读数 |
| --- | --- |
| 触发 | `scripts/data/deal-history.json` 缺失（不可用形态），`npm run build` **exit 0**（t7 修的路径） |
| 改前 | `dist/data/index.json:45` 的 `updatedAtNote` = `本次构建没有拿到 D:\OneDrive\Desktop\Code\AI Page\.worktrees\notes-manifest-residual-v1\scripts\data\deal-history.json（文件缺失）——…` ⇒ **1 处宿主绝对路径进产物**（槽位 = 公开数据出口 `data/index.json`，`/docs/data/` 与 endpoint 都读它） |
| 改后 | 同一字段 = `本次构建没有拿到 deal-history.json（文件缺失）——这份数据集的更新时间不可公布，这不表示「没有变化」。` ⇒ 盘符 / 反斜杠路径段 / 宿主根 / 用户名 **全 0 命中** |
| 判据 | 新增**机器无关性**检查（5 条形状），挂在 `logDatasetHonestyProblems()`（构建期）与 `logDatasetDiskHonestyProblems()`（独立门禁 `verify:seo`）**两侧** |
| 牙 | T1（把说明改回印绝对路径 ⇒ 构建 **exit 1**，点名 2 条形状）；T2（只毒化产物副本的 `updatedAtNote` ⇒ `verify:seo` **18 项 / 1 失败**）。两者都逐字节还原 |
| 正常路径 | 整树 **304 文件 0 变化**（全树摘要 `2d2d15b3…` 改前 = 改后），`updatedAt` 仍等于日志 `startedAt`（不是「今天」2026-10-08） |
| 断言账 | `selftest:changes` 119/0 · `selftest:feeds` 145/0 · `selftest:seo` 88/0 · `verify:seo` 18/0 · `verify-site` **880/0** · `npm run gate` **48 脚本 / 失败 0 / 292.7s**（改前 = 改后，只增不减） |

**「判据只要求说明里含『没有拿到』」这条一个字未松**：改前/改后该串在不可用产物里的命中数都是 **11**，
其中渲染侧那句条件文案（`本次构建没有拿到历史日志…`）**6 处同址**（`changes/index.html:1227` ·
`index.html:1225` · `feed/changes.{xml,json}:6` · `feed/new.{xml,json}:6`）+ 1 处页面内嵌措辞表（`index.html:1446`）。

## 2. 改前读数（逐处，可复算）

不可用形态 = 临时移走 `scripts/data/deal-history.json`（构建到 `.arch-v1/t27/dist-unavail-before`），
数据文件以 sha256 逐字节还原（`563bcfd0e00e3211995bdefe097b3096ed778a7ebed69c4e1c1614ca8187802e`）。

| 扫面（整树 html/json/xml/ndjson/css/svg/js） | 改前 | 改后 | 毒化副本（对照） |
| --- | ---: | ---: | ---: |
| 盘符绝对路径 `D:\` | **1** | 0 | 1 |
| 反斜杠路径段 `\\a\\b` | **4** | 0 | 3 |
| 宿主根 `OneDrive` | **1** | 0 | 1 |
| 宿主用户名（`Users\` / `星澈`） | 0 | 0 | 0 |
| 「没有拿到」 | 11 | 11 | 11 |

改前的唯一命中就是 `data/index.json:45` 那一行（逐字见 `research/_raw/unavailable-note-machine-independence-v1/scan-machine-strings.json`）。

> 两层口径：**字段值层**（`machineDependenceProblems()` 看的是 JSON 解析后的字符串，路径是单反斜杠）
> 与**产物字节层**（扫的是文件原文，路径是 JSON 转义后的 `D:\\OneDrive\\…`）。两层都量了，
> 修后两层都是 0 —— 不是"某一种写法没测到"。

## 3. 修法与理由（为什么改文案侧，不改加载器）

三个加载器（`lib/history.js` / `lib/plan-history.js` / `lib/api-plan-history.js`）返回的 `file` 字段
都是 `path.join(__dirname, …)` 算出来的绝对路径；`logAvailabilityOf()` 把它原样交给 `logUnavailableNote()`。
两条可选修法：

1. **改加载器**（只返回 basename）：会把"真实路径"这一事实从加载器里抹掉 —— 构建日志、其它调用方
   （`build-local.js:3189/3272/3307` 的告警、`data/index.json` 之外的地方）本来靠它说清是哪个文件，
   而且这要动三个 in-scope 之外的加载语义面。
2. **改这一句公开说明**（本轮采纳）：影响面**只**是那句会进产物的文案；加载器与构建日志一个字不动。

配套做了三件事：

- `noteFileLabel(file)`：只留文件名，**两种分隔符都切**（不用 `path.basename()` —— 它在 POSIX 上不认 `\`，
  而这个站的产物要跨平台逐字节相同）。
- `machineIndependentText(text)`：把 `reason` 里可能出现的绝对路径也压成 basename
  （加载器 `broken` 字段在 `EPERM/EACCES` 一类失败形态下是 `fs` 的错误文本，里面带宿主路径）。
  规则**只认"绝对路径形状"**：路径必须以字符串开头 / 空白 / 引号 / 括号起始 —— 免得误伤 `https://…`。
  **两步走**：① 引号里的路径整段压（**允许含空格**）；② 没有引号的路径（保守，遇空白即停）。
  第 ① 步是**被判据抓出来的**：只做第 ② 步时，`open 'D:\…\Code\AI Page\scripts\data\deal-history.json'`
  会在空格处截断（本仓库目录名就叫 `AI Page`），留下 `'AI Page\scripts\data\…'` ⇒ 判据报
  `反斜杠目录段` ⇒ 构建因为"说明写不干净"而失败。详见自审 §2.1。
- `machineDependenceProblems(text)`：**判据**。5 条形状逐条给名字（Windows 盘符绝对路径 / UNC 路径 /
  反斜杠目录段 / POSIX 绝对路径 / 家目录记号 `~`），红的时候直接说出犯的是哪一条。
  挂在两个诚实性检查函数里 ⇒ 构建期与独立门禁**各自**都能红（不是只有构建期）。

`updatedAt` / `updatedAtShape` / `availability` 的语义**一字未改**；不许用别的日期顶替这条红线照旧
（`updatedAt: null` + `availability: 'unavailable'` 的分支与本轮改动无关，读数见 §6）。

## 4. 边界两侧（纯函数，7 + 4 正反例 + 6 边界形态）

装置：`.arch-v1/t27/unit-probe.cjs`（直接 require `lib/changes.js`，不跑构建）。

| 形态 | 期望 | 实测 |
| --- | --- | --- |
| `D:\…\scripts\data\deal-history.json` | 命中 | 盘符 + 反斜杠目录段 |
| `/home/runner/work/…/deal-history.json` | 命中 | POSIX 绝对路径 |
| `\\buildhost\share\deal-history.json` | 命中 | UNC + 反斜杠目录段 |
| `~/work/…/deal-history.json` | 命中 | 家目录记号 |
| `basename` 说明（「没有拿到 deal-history.json（文件缺失）…」） | **沉默** | 沉默 |
| `https://platform.openai.com/docs/pricing` | **沉默** | 沉默（`s:` 不算盘符） |
| 中文里的斜杠 `API / Token 计费与套餐 3 / 4 条` | **沉默** | 沉默 |
| 生成器喂绝对路径 / 喂 `EPERM … open 'D:\a b\plan-history.json'` | 说明仍机器无关且含「没有拿到」 | 4/4 通过 |
| **真实三函数链**（`logAvailabilityOf` → `markUnavailableLogDatasets` → `logDatasetHonestyProblems`），加载器输入 = 实测形态的 EPERM 文本 | 说明机器无关、`honestyProblems` 为空 | `本次构建没有拿到 deal-history.json（EPERM: operation not permitted, open 'deal-history.json'）——…`；`machineShapes = []` |

**另外两个形态也是真 fixture（不是纯函数推演）**：

| 形态 | 造法 | 读数 |
| --- | --- | --- |
| 缺失 | 移走 `scripts/data/deal-history.json` | build exit 0；说明 = `（文件缺失）`；整树机器相关串 0 |
| 损坏（且文件内容里**确实有宿主路径**） | 写入 `{"…": "D:\OneDrive\Desktop\Code\AI Page\scripts\data\deal-history.json"`（非法 JSON） | build exit 0；说明 = `（Bad escaped character in JSON at position 33 (line 1 column 34)）` —— Node 这条错误文本**只给位置不给路径**，所以这里没有路径可漏；整树机器相关串 0 |

> 也就是说：`reason` 那道筛的**端到端**覆盖是"真实三函数链 + 实测形态的错误文本"，
> 不是"文件真的读不了"（本机造不出 EPERM/EACCES；`EISDIR` 的消息里不带路径，实测）。
> 但它不是唯一防线：**判据扫的是整句说明**，筛子漏掉的任何路径形状都会让构建红（fail-closed），
> 而不是静默进产物 —— 上面第 ① 步就是这么被抓出来的。

**未覆盖（如实）**：`~user/work/x.json`（`~` 后不接分隔符的家目录写法）**不命中任何一条形状** ——
5 条形状只认「盘符 / UNC / 反斜杠目录段 / 以 `/` 起的 POSIX 绝对路径 / `~` 后接分隔符」。
另外**故意不认**「相对路径」（`scripts/data/deal-history.json`）：它跨机器是同一个字符串，
不算机器相关。本轮产物里这两种都不存在（整树扫描 0 命中），但这是**判据的已知边界**，不是"没测到就没事"。

## 5. 牙（两颗，都实跑变红 → 逐字节还原 → 回绿）

装置：`.arch-v1/t27/`（`tooth-t1-build.log` / `poison.cjs` / `seoverify-*.log`）。

**T1 —— 构建期（把说明改回 O1 修复前的写法，登记与断言都不动）**

```js
const file = item.file;                    // 牙：退回印绝对路径
const reason = item.reason || '缺失或损坏'; // 牙：原因文本同样不过滤
```

```
❌ 构建失败：Error: Dataset Manifest 形状/诚实性不合法（2 处）：
- deal-history: updatedAtNote 含机器相关形状「Windows 盘符绝对路径」——不可用说明必须跨机器可复现（日志名只写 basename，不许出现宿主绝对路径）
- deal-history: updatedAtNote 含机器相关形状「反斜杠目录段」——不可用说明必须跨机器可复现（日志名只写 basename，不许出现宿主绝对路径）
```

⇒ `git checkout -- scripts/lib/changes.js` ⇒ `sha256 = 07887908679b2dd5587c790cc4a785964e474c94637d10c4eeeeed5a1d8a1014`
（与提交逐字节一致，`git status` 干净）⇒ 复跑不可用构建 **exit 0**、产物树与牙前**逐文件全等**
（`4eab9832f3a7601382b8998b54a010eb80bc5818c3ae03536cefcb24ba7b11aa`）。

**T2 —— 独立门禁（只毒化产物副本的一个字段，源码与清单不动）**

`poison.cjs` 先证明「JSON 解析 + 重新序列化」本身无损（`roundTripIdentical: true`），再只把
`data/index.json` 里那一句换回含 `D:\…` 的形态（树里其它文件由 `cpSync` 原样拷贝）。

| 产物 | 命令 | 读数 |
| --- | --- | --- |
| 改前产物（真实 O1 形态） | `node scripts/tools/seo-verify.js --dir=.arch-v1/t27/dist-unavail-before` | ❌ **18 项 / 1 失败**，点名同一句断言 |
| 改后产物（干净） | `… --dir=.arch-v1/t27/dist-unavail-after2` | ✅ 18 项 / 0 失败 |
| 改后产物 + 只毒化 `updatedAtNote` | `… --dir=.arch-v1/t27/dist-unavail-poisoned` | ❌ **18 项 / 1 失败** |

红的那条断言名（逐字）：`数据集的可用性：Manifest 的如实登记 ↔ 产物文件逐条一致（9 份，其中登记为不可用 1 份）`
—— 断言**名与条数不变**（18 项），语义变严：新增一条机器无关性判据挂进同一个检查。
这也就把"改前那份产物在独立门禁下长什么样"补上了：**如果这条判据当时存在，O1 一上线就会红**。

## 6. 正常路径零回归

正常路径（三份日志齐全）构建到 `.arch-v1/t27/dist-normal-{before,after}`（before = `git checkout` 回
master 版 `changes.js` 后构建）：

| 读数 | 改前 | 改后 |
| --- | --- | --- |
| 文件数 | 304 | 304 |
| 全树摘要 | `2d2d15b3ffceea705333e1444dcc5d8e537d41acda811731b7538e1db28d2a40` | **同一串** |
| 逐文件 added / removed / changed | — | **0 / 0 / 0** |
| 渲染侧那句「没有拿到…历史日志」 | 0 处（唯一命中 `index.html:1446` = 页面内嵌措辞表） | 0 处（同） |
| `deal-history.updatedAt` | `2026-09-30` = 日志 `startedAt` | 同 |
| `plan-history` / `api-plan-history.updatedAt` | `2026-10-01` = 各自 `startedAt` | 同 |
| 今天 | `2026-10-08` | — |

不可用路径的产物树改前↔改后：**只有 `data/index.json` 一个文件变化**
（`39b26a1f…` → `4eab9832…`；t7 要求的那 6 处渲染侧文案同址不变）。

## 7. 断言账（改前 = master 版 `changes.js`，改后 = 本提交）

| 套件 | 改前 | 改后 |
| --- | --- | --- |
| `npm run selftest:changes` | 119 / 0 | 119 / 0 |
| `npm run selftest:feeds` | 145 / 0 | 145 / 0 |
| `npm run selftest:seo` | 88 / 0 | 88 / 0 |
| `npm run verify:seo` | 18 / 0 | 18 / 0 |
| `verify-site.js`（门禁步骤 [50] 跑的同一个） | — | **880 / 0** |
| `npm run gate`（本机，与 CI 读同一份 `action.yml`） | — | **48 脚本 / 失败 0 / 292.7s**（52 步里 4 步是 CI 侧装备） |

**「只增不减」怎么理解（如实）**：具名断言**条数**不变 —— 新规则是挂进两个已有检查函数内部的
`problems` 流（`logDatasetHonestyProblems` 的规则 4 → 5；`logDatasetDiskHonestyProblems` 的规则 3 → 4），
所以套件计数不动；**能红**这件事由 T1/T2 两颗牙证明，而不是由计数增加证明。

## 8. 跨机器可复现性结论（含仍未覆盖的部分）

- **已闭合**：日志不可用时，`updatedAtNote` 不再含任何宿主相关串 ⇒ 同一份源码在任何机器、任何目录下
  构建出的**不可用形态产物**在这一处逐字节相同（此前`D:\…` vs `/home/...` 必然不同）。
- **仍未覆盖**：
  1. `~user/…` 形态（§4）；
  2. **`plan-history.json` / `api-plan-history.json` 的不可用路径根本到不了这句文案** —— 构建死在
     Dataset Manifest 那一步（§9），所以"这两份数据集的说明机器无关"目前只是**代码级**成立、**没有产物级读数**；
  3. 判据只钉 `updatedAtNote` 一个字段；别的字段（如 `source-health.json` / 各 endpoint 的自由文本）
     若被塞进绝对路径，这层判据不会红 —— 本轮的整树扫描证明**当前形态**0 命中，但那是"现在没发生"；
  4. 构建**日志**（终端/stderr）仍然印绝对路径：那是本机诊断信息，不进产物，本轮不钉；
  5. 未在真 CI runner（POSIX）上跑过 —— 本机是 Windows；`noteFileLabel()` 特意两种分隔符都切，
     但 POSIX 侧的可复现性结论是**推理 + 纯函数读数**，不是 CI 实测（本地跑不到 CI 的 4 步）。
  6. `reason` 那道筛的端到端覆盖 = 真实三函数链 + 实测形态的错误文本；本机造不出真正的 EPERM/EACCES
     读失败（见 §4 小字）。筛子漏掉时**判据会红**（fail-closed），这是设计而非保险。

## 9. in-scope 之外的发现（交 captain 排期，未改）

1. **`plan-history.json` 缺失 ⇒ 构建 exit 1**：`TypeError: Cannot read properties of null (reading 'schemaVersion')`
   @ `scripts/tools/build-local.js:4216`（`assemble` → `buildManifestFromRegistry` 的 `plan-history` 那一行直接取
   `planHistoryStore.schemaVersion`，而 `planHistoryStore = availability === 'ok' ? load.store : null`）。
   `api-plan-history.json` 缺失 ⇒ 同一处同一条 TypeError（`build-local.js:4220` 同形）。
   对照：`deal-history` 之所以走得通，是因为 `lib/history.js:257` 有 `store: result.store || emptyStore()` 兜底，
   而 `plan-history.js:986` / `api-plan-history.js` 的 `load()` 直接返回 `core.load()`（缺失 ⇒ `store: null`）。
   **后果**：t7/t4 的「日志缺失 ⇒ 构建 exit 0 + 如实登记 + 页面说没有拿到」目前只在 **deal-history 这一半**成立；
   另两份数据集的「如实说没有拿到」上不了线。**这不在 t27 的 in-scope 里（`build-local.js` 与两个加载器都没动）**，
   建议单独排期（改动面很小：两处空值兜底 + 对应断言）。
2. **`scripts/lib/archive.js:524` 的同类文案不嵌路径**（captain 点名要查的）：`本次构建没有拿到${label}的变更日志 —— …`
   里的 `${label}` 来自 `archive.js:69` 的 `ARCHIVE_KIND_LABEL` 常量表（`:522` `ARCHIVE_KIND_LABEL[kind] || kind`），
   不是加载器给的路径 ⇒ **该处不需要改**。仅为事实登记（未改该文件）。

## 10. 复现命令

```powershell
# 0) 依赖（工作树内，无 junction）
npm ci

# 1) 正常路径（改前/改后对照：before 要先 git checkout -- scripts/lib/changes.js）
node scripts/tools/build-local.js --out=.arch-v1/t27/dist-normal-after
node .arch-v1/t27/readings.cjs .arch-v1/t27/readings.json      # 产物级不变量
node .arch-v1/t27/tree-diff.cjs .arch-v1/t27/dist-normal-before .arch-v1/t27/dist-normal-after

# 2) 不可用路径（把数据文件挪走 → 构建 → 逐字节还回来）
Move-Item scripts\data\deal-history.json .arch-v1\t27\backup\ -Force
node scripts/tools/build-local.js --out=.arch-v1/t27/dist-unavail-after2   # 期望 exit 0
Move-Item .arch-v1\t27\backup\deal-history.json scripts\data\ -Force       # sha256 = 563bcfd0…

# 3) 牙
node .arch-v1/t27/unit-probe.cjs                                # 边界两侧（含反例）
node .arch-v1/t27/poison.cjs .arch-v1/t27/dist-unavail-after2 .arch-v1/t27/dist-unavail-poisoned
node scripts/tools/seo-verify.js --dir=.arch-v1/t27/dist-unavail-poisoned  # 期望 18 项 / 1 失败
node .arch-v1/t27/make-evidence.cjs                             # 重建 research/_raw/… 的小 JSON

# 4) 门禁
npm run build; npm run selftest:changes; npm run selftest:feeds; npm run selftest:seo; npm run verify:seo
node scripts/tools/verify-site.js --dir=dist; npm run gate; npm run check:evidence
```

## 11. 建议插进 `docs/DESIGN-RULES.md` / `NEXT-STEPS.md` 的行（原文，供 captain 直接用）

`DESIGN-RULES.md` 主表新增一行（沿用现有列）：

```
| **S6** | **不可用说明必须机器无关**：凡是「本次构建没有拿到 …」这类会进产物的自由文本，**只许点 basename**，不许出现盘符 / UNC / POSIX 绝对路径 / 家目录记号（判据 = `lib/changes.js` 的 `machineDependenceProblems()`，挂在构建期与独立门禁两侧的诚实性检查里）。理由：该文案落进公开数据出口 `data/index.json`（`/docs/data/` 与 endpoint 都读它），嵌宿主路径既泄露构建机目录结构，又让同一份源码在不同机器上构建出的产物**不逐字节相同** | ✅ 新增（`unavailable-note-machine-independence-v1`） | t19 观察 O1：`updatedAtNote` 实测含 `D:\…\notes-manifest-residual-v1\scripts\data\deal-history.json`。实测牙：把说明改回印绝对路径 ⇒ 构建 exit 1（点名 2 条形状）；只毒化产物副本 ⇒ `verify:seo` 18 项 / 1 失败 | 断言：`logDatasetHonestyProblems()` / `logDatasetDiskHonestyProblems()` 内的机器无关性规则（5 条形状）+ `selftest:changes` 119/0 · `verify:seo` 18/0 · `verify-site` 880/0 · `gate` 48/0；改前/改后正常路径 304 文件全等 |
```

`NEXT-STEPS.md` §0 记录行：

```
N. ~~日志不可用说明含宿主绝对路径~~ → **t27 已闭合**（`unavailable-note-machine-independence-v1`）：
   `logUnavailableNote()` 只写 basename + `reason` 同筛；新增机器无关性判据（5 条形状）挂构建期与
   `verify:seo` 两侧；牙两颗（构建 exit 1 / 门禁 18 项 1 失败）。**新登记（不在 t27 范围）**：
   `plan-history.json` / `api-plan-history.json` 缺失时构建死在 `build-local.js:4216/4220`（null deref）⇒
   这两份数据集的「如实说没有拿到」目前到不了产物；`archive.js` 同类文案已核**不嵌路径**。
```
