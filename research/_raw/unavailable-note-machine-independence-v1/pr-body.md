# t27 · `unavailable-note-machine-independence-v1`：不可用说明不得含宿主绝对路径

闭合 t19 独立复核的**观察 O1**：日志不可用时，「本次构建没有拿到 …」那句如实说明把**宿主绝对路径**
印进了公开产物。

## 结论

| | 读数 |
| --- | --- |
| 触发 | `scripts/data/deal-history.json` 缺失 ⇒ `npm run build` **exit 0**（t7 修的那条路） |
| 改前 | `dist/data/index.json:45` 的 `updatedAtNote` = `本次构建没有拿到 D:\OneDrive\Desktop\Code\AI Page\.worktrees\…\scripts\data\deal-history.json（文件缺失）——…` ⇒ **1 处宿主绝对路径进产物**（`/docs/data/` 与 endpoint 都读它） |
| 改后 | 同字段 = `本次构建没有拿到 deal-history.json（文件缺失）——这份数据集的更新时间不可公布，这不表示「没有变化」。` |
| 判据 | 新增**机器无关性**检查（5 条形状：盘符 / UNC / 反斜杠目录段 / POSIX 绝对路径 / `~`），挂在 `logDatasetHonestyProblems()`（构建期）与 `logDatasetDiskHonestyProblems()`（独立门禁 `verify:seo`）**两侧** |
| 牙 | **T1** 把说明改回印绝对路径 ⇒ 构建 **exit 1**（点名 2 条形状）· **T2** 只毒化产物副本的 `updatedAtNote` ⇒ `verify:seo` **18 项 / 1 失败**；两者都 `git checkout` 逐字节还原后回绿 |
| 正常路径 | 整树 **304 文件 0 变化**（全树摘要 `2d2d15b3…` 改前 = 改后）；`updatedAt` 仍等于日志 `startedAt`（不是「今天」2026-10-08） |
| 「没有拿到」 | 不可用产物里该串 **11 → 11**（6 处渲染侧同址）；判据只要求含「没有拿到」这条**一个字未松** |
| 断言账 | `selftest:changes` 119/0 · `selftest:feeds` 145/0 · `selftest:seo` 88/0 · `verify:seo` 18/0 · `verify-site` **880/0** · `npm run gate` **48 脚本 / 失败 0 / 292.7s**（改前 = 改后）· `check:evidence` ✅ |

产品改动**只有** `scripts/lib/changes.js`（+90 / −2）。`updatedAt` / `updatedAtShape` / `availability`
语义一字未改；不许用别的日期顶替的红线照旧。

## 过程中被判据咬到的一次（写进报告的教训）

`reason` 那道筛第一版只认"以空白/引号起头的绝对路径"，结果在**真实三函数链**喂
`EPERM: … open 'D:\…\Code\AI Page\scripts\data\deal-history.json'` 时，**在本仓库自己的目录名
`AI Page` 的空格处截断**，留下 `'AI Page\scripts\data\…'` ⇒ 判据报 `反斜杠目录段` ⇒ 构建因为
"说明写不干净"失败。修法 = 增加"引号里的路径允许含空格"一步。这条是**判据先于我发现缺陷**。

## in-scope 之外的发现（未改，交 captain 排期）

1. **`plan-history.json` / `api-plan-history.json` 不可用时构建死在这一步之前**：
   `TypeError: Cannot read properties of null (reading 'schemaVersion')` @ `build-local.js:4216/4220`
   （`lib/history.js:257` 有 `store || emptyStore()` 兜底，两个 plan 侧加载器没有）
   ⇒ 这两份数据集的「如实说没有拿到」**目前到不了产物**，t4/t7 的结论只对 deal-history 成立。
2. `scripts/lib/archive.js:524` 的同类文案已核：`${label}` 来自 `ARCHIVE_KIND_LABEL` 常量表 ⇒ **不嵌路径**，无需改。

## 证据

- 报告 `research/unavailable-note-machine-independence-v1-report.md`（含边界两侧、未覆盖清单、复现命令）
- 自审 `research/unavailable-note-machine-independence-v1-self-audit.md`（含"没证明的东西"与三件自咬事故）
- Tier-2 `research/_raw/unavailable-note-machine-independence-v1/`（8 份小 JSON + README）
- 完整日志与一次性装置在 `.arch-v1/t27/`（Tier-3，本机未入库）

**未覆盖（如实）**：`~user/…`（`~` 后不接分隔符）不命中任何形状 · 判据只钉 `updatedAtNote` 一个字段 ·
POSIX/CI 侧只有推理 + 纯函数读数（本机 Windows）· `reason` 的真 fixture 造不出 EPERM（用真实函数链 + 实测错误文本代替）。
