# secondary-page-layout-unification · PR

> 分支 `secondary-page-layout-unification` → `master`；基线 `origin/master = 1f225d2`
> （PR 由发布流程创建，标题与提交信息同源：见 `release/commit-message.txt`）。
> **纯布局版本**：数据 / 文案 / 路由 / 结构化数据 0 变化（证明指引见 §4）。
> 发布顺序、成功判据与失败处置：见 [`release/checklist.md`](checklist.md)。

## 1. 变更摘要

| # | 改了什么 | 为什么 | 机器证据 |
| --- | --- | --- | --- |
| 1 | 页面级说明 `.snote` 的宽度规则从 **8 份页面壳副本**（4×`max-width: 70ch` + 4×`max-width: none`）收成 `index.html` 共享 `<style>` 里的**唯一一条**（`max-width: none; overflow-wrap: anywhere;`） | 同一条规则 8 份副本、两种取值：48 个数据型页面里说明只占主数据区（1380px）的三分之一，左边对齐右边半截 —— 同一页的说明看起来像"另一页的内容" | `t1/07-dist-snote-audit.txt`、`t1/10-frozen-string-audit.txt`、`t1/11-no-other-snote-rules.txt` |
| 2 | `scripts/lib/page-kinds.js` 新增**布局族**声明：`LAYOUT_FAMILIES`（wide / detail / prose）、18 个 kind 的 `layout`、`LAYOUT_FAMILIES_WITHOUT_INSTANCES`（prose 无实例是显式登记）、`layoutOf()`、`assertLayoutDeclarations()` | 「这一页的正文该跟随谁」原先只存在于人的记忆里；新页面家族必须显式登记，不许默认落进某个族 | `t1/17-t1-summary.md` §5、`gate/steps/15-seo-self-test.txt` |
| 3 | `/archive/<kind>/<id>/` 接入统一内容列（`ARCHIVE_ENTRY_MAIN_CLASS` = `detail-main`），并在 `assertPageHonesty()` 里从**整页 HTML** 反查「恰好 1 个 `<main>` 且 class 含 `detail-main`」 | 档案详情今天生产 0 个实例 —— 一个"永远跑不到"的渲染分支最容易在它第一次跑起来那天露出未验证布局 | `t1/18-main-class-spotcheck.txt`、`gate/steps/38-archive-self-test-archive-synthetic-ended-restor.txt` |
| 4 | `scripts/tools/verify-site.js` 新增 **§22c 全站几何门禁**：1440/1600 全站逐条扫描 + 390 全站溢出 + 760/360 样本集；判据只由 `wideProblems()` 一处产出（**10 个违规码**）；窄柱判据取**并集**：`note-narrow`（内容盒宽）∪ `note-ink-narrow`（**逐行字迹宽**）∪ `note-hidden-text`（文本非空但零可见字形盒）；逐行字迹只在该页真的排得下 70ch（现场量 452.81px）时判 | 「盒宽一字不动、有字区域被 padding 压回 70ch」这类缺陷在只看 border-box 的旧口径下**整轮 0 失败放行**；换成"内容盒"后又被 grid / 伪元素 / multicol / float 逐个绕过（三轮对抗复审逐轮复现）—— 所以最终量的是**排版出来的行** | `review.md`（T6 复审的 blocker 与复现命令）、`teeth/T19-ROUND4.md`（轮 4 的作用域闭合）、`geometry/truth-401.json`（401 条逐条真值） |
| 5 | §22c 自带 **M0 反证 + M1–M12 变异牙**（M1–M4 四个壳换回 70ch · M5 对账既有 §22b 的 M1–M5 · M6 长串正对照 · M7–M10 三种绕过形态 · **M11 grid 窄轨 ⇒ `note-ink-narrow`** · **M12 伪元素承载正文 ⇒ `note-hidden-text`**）：变异前守卫锚点唯一、变异后必须出现期望违规码、变异前后产物 sha256 相等 | "判据写错了"与"产品没问题"在日志里长得一样 —— 判据本身也要能被咬到 | `teeth/README.md`、`teeth/mutations.json`、`teeth/M0-baseline.json`、`mutations-real/M-disk.json` |
| 6 | 两个离线自测补牙：`archive-selftest.js`（档案详情内容列的三件事）+ `seo-selftest.js`（布局族声明的正向/反向完整性，含"登记为无实例却有了实例"） | 判据失效的方式全是**静默的**（页面照常、构建照常、CI 绿） | `gate/steps/38-…txt`、`gate/steps/15-seo-self-test.txt` |

**明确不做的事**（边界，逐条登记）：不改任何数据文件；不动 `FIXED_ROUTE_KINDS` / `ROUTE_PATTERNS` /
各 kind 的 `textFloor` / `itemList` / `sitemap` 声明；不动 `index.html` 的正文与脚本（+9 行全在共享
`<style>` 内）；不给任何页面加 `detail-main`（`/deal/`、`/models/<slug>/` 上一版已是这一列）；
不新增 gate 步骤、不动 CI 冻结口径（`--expect-checks=38` 一字未改）。

## 2. 改动文件（源码 7 个，全部 in-scope）

| 文件 | 改动 |
| --- | --- |
| `index.html` | 共享 `<style>`：唯一一条 `.snote` 规则 + 解释它的注释（正文/脚本 0 改动） |
| `scripts/lib/page-kinds.js` | 布局族声明 + `layoutOf()` + `assertLayoutDeclarations()`（纯新增） |
| `scripts/lib/archive.js` | `ARCHIVE_ENTRY_MAIN_CLASS` + 档案详情的整页内容列断言（纯新增） |
| `scripts/tools/build-local.js` | 删除 8 份 `.snote` 宽度副本；档案详情调用点接入统一内容列；文件头补样式纪律 |
| `scripts/tools/verify-site.js` | 新增 §22c（并集几何牙 + M0 反证 + M1–M12 变异牙）；既有断言一行未改 |
| `scripts/tools/archive-selftest.js` | 档案详情内容列的离线牙（替代性设计约束） |
| `scripts/tools/seo-selftest.js` | 布局族声明的自洽性与牙 |

> 冻结口径：提交前请用 `git diff --stat 1f225d2..HEAD` 复核这份清单（命令与判据见 `checklist.md` §2）。
> 证据与发布物料随提交进入 `research/_raw/secondary-page-layout-unification/**`。

## 3. 验收证据索引

**每一条路径都真实存在**（机器核对：`node research/_raw/secondary-page-layout-unification/release/check-evidence-index.cjs`
会逐条 `fs.existsSync`，缺失即非 0 退出）。

<!-- EVIDENCE-INDEX:BEGIN -->
**① 布局族的「唯一出处」与 `.snote` 的唯一性（静态）**
- `research/_raw/secondary-page-layout-unification/t1/17-t1-summary.md` — T1 证据摘要（改了哪些文件 / 六条 verify 命令 / 设计取舍）
- `research/_raw/secondary-page-layout-unification/t1/07-dist-snote-audit.txt` — 186/186 页各含共享 `.snote` 规则恰好 1 次；`max-width: 70ch` 的页 0
- `research/_raw/secondary-page-layout-unification/t1/10-frozen-string-audit.txt` — 冻结串在 `index.html` 的 `<style>` 里出现 1 次且逐字等于契约串
- `research/_raw/secondary-page-layout-unification/t1/11-no-other-snote-rules.txt` — `scripts/` 下 `.snote {` 规则残留 0
- `research/_raw/secondary-page-layout-unification/t1/18-main-class-spotcheck.txt` — detail 族页面 `<main class="detail-main">`、wide 族 `<main>` 不带 class
- `research/_raw/secondary-page-layout-unification/t1/audit-dist-snote.js` — 上面那条审计的实现（只读 `dist`）
- `research/_raw/secondary-page-layout-unification/t1/audit-frozen-snote.js` — 冻结串审计的实现（只读源码）
- `research/_raw/secondary-page-layout-unification/t1/compare-dist-baseline.js` — 全产物对账的实现（只读两个目录，§4 ② 直接用它）

**② 全产物对账：「纯布局」的机器证明（数据/文案/路由/结构化数据 0 变化）**
- `research/_raw/secondary-page-layout-unification/diff/01-git-content-proof.txt` — 数据层文件在提交区间内 0 改动（git 侧读数）
- `research/_raw/secondary-page-layout-unification/diff/04-before-after-compare.log` — 303 vs 303 文件；117/117 非 HTML 逐字节相同；186/186 HTML 剥掉样式块后正文逐字节相同；样式行集合差 +9/−2
- `research/_raw/secondary-page-layout-unification/diff/before-after-compare.json` — 同上的机器可读版
- `research/_raw/secondary-page-layout-unification/diff/03-nonhtml-sha256.log` — 非 HTML 文件的 sha256 清单
- `research/_raw/secondary-page-layout-unification/baseline/dist-baseline-sha256.txt` — 只读基线的 sha256（改动前产物未被写入）

**③ 几何：改动前后逐页逐档（独立探针，不 require 被测代码）**
- `research/_raw/secondary-page-layout-unification/geometry/before-after.md` — 48 个违规页 → 0；401 条说明逐条 before/after 宽与左右边缘；21 页 × 6 档
- `research/_raw/secondary-page-layout-unification/geometry/before.json` / `after.json` — 两份原始读数（sha256 记在 before-after.md §0）
- `research/_raw/secondary-page-layout-unification/geometry/truth-401.json` — 全站 401 条说明的逐条真值（`route#index` 可逐条核对）
- `research/_raw/secondary-page-layout-unification/geometry/wide-probe.cjs` — 上面两份 JSON 的探针（独立实现）
- `research/_raw/secondary-page-layout-unification/geometry/gate-vs-truth.cjs` — 门禁读数 vs 独立真值的逐条对账
- `research/_raw/secondary-page-layout-unification/geometry/all-notes-after.json` — 每条 `.snote`（不只第一条）的逐条读数

**④ 牙：判据真的会响（M0 反证 + M1–M12 变异 + 真实磁盘变异）**
- `research/_raw/secondary-page-layout-unification/teeth/README.md` — 变异牙总览与复现命令
- `research/_raw/secondary-page-layout-unification/teeth/mutations.json` — §22c 的变异定义与期望违规码（M1–M4 四个壳 · M6 长串 · M7 DOM 注入 · M8/M9a/M9b/M10 三种新绕过形态 · **M11 grid 窄轨 · M12 伪元素承载正文**）
- `research/_raw/secondary-page-layout-unification/teeth/M0-baseline.json` — M0 反证：对改动前产物必须真红（note-narrow）
- `research/_raw/secondary-page-layout-unification/teeth/M0-after-repair.json` — 修复轮之后的 M0 复测
- `research/_raw/secondary-page-layout-unification/teeth/adversarial-replay.cjs` — 变异复现脚本
- `research/_raw/secondary-page-layout-unification/mutations-real/M-disk.json` — **真实磁盘变异**（改源码 → 重建 → 必红 → 复原 → 回绿）的机器可读记录
- `research/_raw/secondary-page-layout-unification/mutations-real/M-disk.log` — 同上的逐步日志

**⑤ 门禁：Full Gate 全步原始日志**
- `research/_raw/secondary-page-layout-unification/gate/run-full-gate.cjs` — 本地 Full Gate 运行器
- `research/_raw/secondary-page-layout-unification/gate/00-dry-run.txt` — 干跑（步骤清单与期望项数）
- `research/_raw/secondary-page-layout-unification/gate/01-static-run.txt` — 静态门禁整轮
- `research/_raw/secondary-page-layout-unification/gate/steps/summary.json` — 逐步退出码汇总（机器可读）
- `research/_raw/secondary-page-layout-unification/gate/steps/` — 45 个步骤的逐步原始日志（含 `15-seo-self-test`、`38-archive-self-test`、`44-seo-verification`、`47-real-browser-acceptance`、`48-regression`）

**⑥ 独立复核与对抗（寻假绿）**
- `research/_raw/secondary-page-layout-unification/review.md` — T6 复审：两条 blocker（盒宽 vs 有字区域、只看第一条说明）与复现命令
- `research/_raw/secondary-page-layout-unification/review/adversarial.cjs` — 对抗式用例生成（19 个注入形态 + 守卫四例）
- `research/_raw/secondary-page-layout-unification/review/runs/dist-green.json` — 干净产物上的绿轮读数
- `research/_raw/secondary-page-layout-unification/review/runs/m0/M0-baseline.json` — 复审侧的 M0 反证读数
- `research/_raw/secondary-page-layout-unification/t3/README.md` — 修复轮（T3）的证据编排与复现
- `research/_raw/secondary-page-layout-unification/verify/byte-compare.cjs` — 独立字节对账脚本

**⑦ 发布物料**
- `research/_raw/secondary-page-layout-unification/release/README.md` — 物料清单 + 线上/本地模式差别 + dry-run 真实读数 + provenance
- `research/_raw/secondary-page-layout-unification/release/online-smoke.cjs` — 线上几何冒烟（部署后由 captain 运行；只写不跑）
- `research/_raw/secondary-page-layout-unification/release/online-smoke-dryrun.json` / `online-smoke-dryrun.txt` — 对着本地 `dist` 的 dry-run（1 页，**未访问任何线上地址**）
- `research/_raw/secondary-page-layout-unification/release/online-smoke-dryrun-detail.json` / `.txt` — dry-run 的 detail 族分支（现场推导出的 `/deal/<id>/` 与 `/models/<slug>/`）
- `research/_raw/secondary-page-layout-unification/release/online-smoke-negcontrol-baseline.json` / `.txt` — **负对照**：对改动前产物必须红（退出码 1，note-narrow + frozenCount=0）
- `research/_raw/secondary-page-layout-unification/release/checklist.md` — 发布顺序清单（与 `verify.yml` / `deploy.yml` 逐条对照）
- `research/_raw/secondary-page-layout-unification/release/commit-message.txt` — 提交信息
- `research/_raw/secondary-page-layout-unification/release/serve-dist-http.cjs` — 演练用本机静态托管（回环 + 随机端口 + 子路径挂载 + 访问日志）
- `research/_raw/secondary-page-layout-unification/release/rehearse-online-path.cjs` — **线上代码路径**的本地演练编排器（8 条用例，一条命令重跑）
- `research/_raw/secondary-page-layout-unification/release/online-path-rehearsal.json` / `online-path-rehearsal.txt` — 线上路径（`--base=` + HTTP 取 sitemap）演练：8 页全绿，含服务端访问日志
- `research/_raw/secondary-page-layout-unification/release/online-path-prefix-rehearsal.json` / `.txt` — 同上，但挂在**项目站前缀** `/ai-deals-aggregator/` 下（与 GitHub Pages 同形状）
- `research/_raw/secondary-page-layout-unification/release/online-path-negcontrol-baseline.json` / `.txt` — 同一 `--base=` 模式的负对照：改动前产物必须 exit 1
- `research/_raw/secondary-page-layout-unification/release/robustness-rehearsal.txt` — 健壮性三情形（sitemap 缺条目 / 404 与超时 / 前缀写错）的实测 + 代码级论证
- `research/_raw/secondary-page-layout-unification/release/rehearsal-summary.json` — 8 条用例的机器可读汇总 + 出口纪律核对（非回环 base 0 条 · 产物里真实域名 0 次）
- `research/_raw/secondary-page-layout-unification/release/add-manifest.txt` / `add-manifest-dryrun.txt` — 发布 `git add` 的精确清单与预演读数（**时间无关口径 = tracked ∪ untracked**；`dryrun` 那份是发布前冻结快照，供口径自证）
- `research/_raw/secondary-page-layout-unification/release/add-manifest-postcommit.txt` — 提交后的逐条清单（tracked 975 + 本次增量 5 = 976 个路径）
- `research/_raw/secondary-page-layout-unification/release/evidence-index-snapshot.txt` — 本索引的**某一时刻**核对快照（发布前须在众人停写后重跑）
- `research/_raw/secondary-page-layout-unification/release/check-evidence-index.cjs` — 本索引的机器核对器（存在性 + `--git` 提交后是否仍在）
- `research/_raw/secondary-page-layout-unification/release/check-release-consistency.cjs` — 发布前最终闸门的唯一装置（索引 ⊂ add 清单 / 文档引用分类 / sha 绑定 / 版本 pin）
- `research/_raw/secondary-page-layout-unification/release/T23-FINAL-GATE.md` — 发布前最终闸门报告（add 清单终检 · 索引终检 · 物料自洽性 · §30 十五项 · 文档引用对账快照）
- `research/_raw/secondary-page-layout-unification/release/proposed-gitignore-addendum.txt` — 证据目录 `.gitignore` 的追加块（排除可再生 scratch；含按名字放回的 4 个被引用文件）
- `research/_raw/secondary-page-layout-unification/release/version-pins.json` — 版本绑定表（源文件 / 判据 / 发布脚本 / 产物 / 文档的 sha256·大小·行数·mtime）
- `research/_raw/secondary-page-layout-unification/release/final-gate.json` — 最终闸门的机器可读结果（FATAL / DRIFT / 各文档桶计数 / add 读数）
<!-- EVIDENCE-INDEX:END -->

> ✅ **提交前必读（原先的一条死链风险已解决）**：`diff/04-before-after-compare.log`、
> `diff/03-nonhtml-sha256.log`、`mutations-real/M-disk.log` 这三条 `.log` 证据原先会被顶层
> `.gitignore` 的 `*.log` 吃掉（现在存在、提交之后是死链）。现已按
> `research/_raw/secondary-page-layout-unification/.gitignore` 的 `!**/*.log` 规则按名字放回来
> （与 `research/_raw/leaf-detail-layout-v1/.gitignore` 的先例一致；同一份 `.gitignore` 也排除了
> `review/scratch/` 等可再生字节）。判据是机器可跑的：
> `node research/_raw/secondary-page-layout-unification/release/check-evidence-index.cjs --git`
> —— 它把"存在"与"提交后还存在"当成两条判据（后者才是链接点不点得开）。

## 4. 「本版本不改数据 / 文案 / 路由 / 结构化数据」的证明指引

照着跑，四条互相独立（git 侧 / 产物侧 / 几何侧 / 声明侧）：

```bash
# ① 数据层：提交区间内 0 改动（期望：三条全空）
git diff --name-only 1f225d2..HEAD -- deals.json plans.json api-plans.json models.json model-registry-links.json scripts/data
git status --porcelain  -- deals.json plans.json api-plans.json models.json model-registry-links.json scripts/data

# ② 产物侧：改动前后逐字节对账（期望：117/117 非 HTML 相同、186/186 正文相同、样式行集合差 +9/−2）
#    需要 dist.baseline/（改动前产物，只读基线）与 dist/（本次构建）同时存在
node scripts/tools/build-local.js                  # 重建成 dist/（与 deploy.yml 同一条路径）
node research/_raw/secondary-page-layout-unification/t1/compare-dist-baseline.js
node research/_raw/secondary-page-layout-unification/t1/audit-dist-snote.js dist   # 期望：186/186 恰好 1 次；70ch 页 0

# ③ 声明侧：布局族与页面类型的声明一字未动（期望：page-kinds.js 的删除行数为 0）
git diff --stat 1f225d2..HEAD -- scripts/lib/page-kinds.js
git diff 1f225d2..HEAD -- index.html | grep -c '^-[^-]'   # 期望 0：index.html 没有删除行

# ④ 几何侧：改动前产物必须红、改动后必须绿（同一支探针，不 require 被测代码）
node research/_raw/secondary-page-layout-unification/geometry/wide-probe.cjs --help   # 用法见文件头
```

判据口径（说清楚"0 变化"是在什么意义上）：
- **文案 / 正文**：HTML 页剥掉全部 `<style>` 块后逐字节相同（186/186，正文字节差 0 —— 不是"肉眼看着一样"）。
- **结构化数据**：JSON-LD、`<meta>`、canonical、sitemap、Feed 全部属于"非 `<style>` 内容"，因此被上一条覆盖；
  另有 117/117 非 HTML 文件（含 `sitemap.xml` 与 36 个 Feed）逐字节相同。
- **路由**：`FIXED_ROUTE_KINDS` / `ROUTE_PATTERNS` / sitemap 成员集合 `loc` 数（183）前后一致；
  产物页面数 186 前后一致。
- **数据**：`scripts/data/**` 与五份数据 JSON 在提交区间内 0 改动（git 侧读数）。

## 5. 发布与验收顺序

见 [`release/checklist.md`](checklist.md) —— 每步都写了**成功判据**与**失败时的处置**，并与
`.github/workflows/verify.yml`（必需检查名 `gate`）与 `.github/workflows/deploy.yml`
（`prepublish` 完整门禁 → `build` → `deploy`）的实际内容逐条对照。摘要：

1. `git fetch` → 2. 冻结前复核（文件清单 / 数据 0 改动 / Full Gate）→ 3. `git add` 源码 + 证据 →
4. `git commit -F …/release/commit-message.txt` → 5. `git push -u origin secondary-page-layout-unification` →
6. `gh pr create --base master --body-file …/release/pr-body.md` →
7. 等必需检查 **`gate`** 变绿（PR 上 `verify.yml` 的 job 名即为它）→ 8. `gh pr merge --merge` →
9. 观察 **Deploy to GitHub Pages** 的 `prepublish` / `build` / `deploy` 三个 job →
10. 线上几何冒烟 `release/online-smoke.cjs`（退出码 0）→ 11. 回填最终报告。

## 6. 风险与回滚

- **风险 1 · 视觉批量变化**：48 个页面的页面级说明从 452px 变宽到与主数据区同轴。这正是本版的目的；
  `plans/` `models/` `archive/` `docs/data/` 这些原本已是 `max-width: none` 的页面**前后读数完全一致**
  （`geometry/before-after.md` §3），所以变化面是"曾经被压窄的那一批"，不是"顺手一起改"。
- **风险 2 · 长串换行**：说明里出现不可断的长 URL / 长 token 时必须有换行兜底 ——
  `overflow-wrap: anywhere` 是共享规则的一部分，§22c 的 M6 正对照（注入 200 字符不可断串、CSS 一字不动 ⇒
  390 档不得溢出）与冻结串审计都盯着它。
- **风险 3 · 数据停机**：本版不动数据文件，也不新增 gate 步骤，因此不会与每日采集链路互相踩。
- **回滚**：`git revert -m 1 <merge-sha>` 生成一条 revert 提交并推送 —— push 到 master 会重新触发
  `deploy.yml`（先过完整 `prepublish` 门禁）把上一份产物发回去。回滚**不需要**动 `research/` 下的证据。
- **回归基线的代价**（与上一版同一句话）：`verify --compare` 对覆盖条数只允许"不减少"，数据缩减会拦发布，
  处置是人工、留痕地重刷基线（`npm run verify:baseline`），本版不涉及。

## 7. 发布后回填（这些产物**现在还不存在**，不要在本 PR 里引用它们）

| 产物 | 由谁产生 | 回填位置 |
| --- | --- | --- |
| `release/online-smoke-result.json` + `.txt` | captain 在部署后运行 `release/online-smoke.cjs` | 最终报告的线上 smoke 小节 |
| CI run 读数（`gate` 结论 / 项数） | PR 上的 `verify.yml` | 最终报告的 CI 小节 |
| Deploy run 读数（`prepublish` / `build` / `deploy` 结论） | merge 后的 `deploy.yml` | 最终报告的 Deploy 小节 |
| 线上首页几何抽查 | captain（可选，`--base=` + `--only=`） | 同上 |
