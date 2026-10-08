# unavailable-dataset-build-crash-v1 自审（t29）

对象：`scripts/tools/build-local.js` 的根因修法 + 夹具矩阵 + 三颗牙 + 报告/证据。
判定口径：只写我自己实跑过的读数；推断一律标注（本报告里唯一一处推断 = `verify-site` 的「改前」项数，理由已写明）。

## 1. 我做了什么（与「只量不修」的分界）

| 做了 | 没做（captain 裁定 / 范围外） |
| --- | --- |
| manifest 两条改读如实空账本（`…Load.store`） | `scripts/validate.js` **一个字节没碰** |
| 产物自检的「发布面」判据：可用 ⇒ 与源逐字节相同；不可用 ⇒ 产物必须就是如实空账本 | `scripts/lib/changes.js`（t7 的规则本体）未改 |
| 自检里 5 处「日志视图」与构建期同口径（不可用 ⇒ `null`） | 各 selftest / `verify-site.js` / `seo-*` 判据文件未改 |
| 变化雷达两处分栏判据按可用性分支（不可用 ⇒ 只许那句说明） | 三份日志的**损坏**形态只量不修（api 侧仍 fail-closed） |

## 2. 我自己的读数（可复跑）

- 夹具矩阵 9 形态 × 前后：`.arch-v1/fixtures/readings-{before,after}-all.json`（每组跑完核对 3 个源文件 sha256）。
- 三颗牙：`.arch-v1/teeth/readings.json`（红 → 还原 → 绿，每次都有源码与夹具的双 sha256 比对）。
- 正常形态零回归：`.arch-v1/fixtures/baseline-digest.json` vs `dist/` ⇒ 0 changed（全树 `f964d6ba19…`）。
- 套件项数：同工作树 pre/post 各跑一遍（73 / 264 / 145 / 119 / 19）+ verify-site 883/0。

## 3. 我没验证的（不要当成已验证）

1. **api 侧「损坏」的修复**：没做（范围外）——只给了精确阻断点 `scripts/validate.js:688–690`。
2. **`verify-site` 的「改前」项数**：**推断**（产物逐字节相同 + 判据文件未改），没有为它再跑一次浏览器验收。
3. **CI**：本机 `gate` + 上面几套是完成证据；PR 门禁读数以 PR 页面为准。
4. **`check:plan-history` / `check:api-plan-history` 两个独立 npm 步骤在日志不可用时的行为**：本任务没跑它们
   （它们**本来就该报错** —— 构建期的告警里逐字写着「check:… 会报错」；那是设计，不是缺陷）。
5. **「损坏」形态下页面措辞是否也正确**：api 侧走不到（validate 拦下）；plan 侧走到了（exit 0 + 6 个文件命中逐字措辞）✔。

## 4. 装置事故（如实登记，已修）

1. **管道截断杀死夹具驱动 ⇒ 源文件留在「损坏」状态**：我一次把驱动的输出接到 `Select-Object -First 8`，
   PowerShell 在取够行后**终止上游**，驱动死在 `plan-broken` 夹具上 ⇒ `scripts/data/plan-history.json` 留着 17 字节的
   非法 JSON（`git status` 才暴露）。
   后果：紧接着的「正常形态产物对照」显示 **36 个文件变化** —— 那不是修复引起的回归，是我把源日志写坏了。
   处置：`git checkout --` 还原（sha256 回到 `8C0003AA…`）→ 重跑正常形态 ⇒ **0 变化**。
   加固：驱动加**前置守卫**（源文件与 git HEAD 不一致就拒绝跑）+ **`exit`/信号处理器无条件还原**；
   之后的每次运行都核对三个文件的 sha256。
2. **证据脚本的比较键 bug**：`product-surface.json` 第一版把 304 个文件全报成「变化」（基线 JSON 用 `h` 键、
   我读的是 `sha256`）；修好后 `changedCount=0`。**这条留在自审里，因为它正是「看起来很吓人的读数」**
   —— 差一点就变成一份说「回归了 304 个文件」的假报告。
3. **两次不同基线的数字混用风险**：`verify:seo` 在 `70d7463` 基线的旧工作树上是 18 项、在 `2416283` 基线上是 19 项。
   本报告的项数一律取自**同一工作树**的 pre/post 对照，不跨基线比。

## 5. 验收标准自检（按 captain amend 后的完成面）

| # | 要求 | 自检结论 | 证据 |
| --- | --- | --- | --- |
| ① | 缺失三形态 exit 0 + 如实说「没有拿到…」（含根因修法） | 满足（plan / api / 两份都缺失：exit 0 + 6/6/9 个文件命中逐字措辞 + Manifest `unavailable/updatedAt=null`） | `fixture-matrix.json` |
| ② | 损坏形态只量不修 + 三者是否对称 | 满足（deal 0 / plan **0** / api **1**，阻断点 `validate.js:688–690`；不对称已写进报告 §7） | `fixture-matrix.json` |
| ③ | 牙齿红/绿；断言数只增不减；`check:evidence` / `gate` 全绿 | 满足（三颗牙红→逐字节还原→绿；73/264/145/119/19/883 全部不降；`check:evidence` ✅、`check:ci` 39/0、`gate` 见 PR） | `teeth.json` · `suite-counts.json` |
| ④ | 正常形态零回归（逐文件 sha256 / 全树摘要） | 满足（304 文件 changed 0，全树 `f964d6ba19…` 前后同一个） | `product-surface.json` |

## 6. 范围与交付纪律

- 写入面：`scripts/tools/build-local.js` + `research/unavailable-dataset-build-crash-v1-*.md` + `research/_raw/unavailable-dataset-build-crash-v1/`。
  另外按 captain 指令把 t14 的收尾补记 `d641d7f` cherry-pick 成 `0ad028c`（随本 PR 一起进，报告 §0 已注明来源）。
- 未写入：`scripts/validate.js`、`scripts/lib/changes.js`、`scripts/data/`（只做夹具，每次逐字节还原）、`docs/DESIGN-RULES.md`、`NEXT-STEPS.md`。
- `dist/` 只由 `npm run build` 重建；夹具/牙/证据脚本全在 `.arch-v1/`（gitignore，Tier-3，不进仓库）。
