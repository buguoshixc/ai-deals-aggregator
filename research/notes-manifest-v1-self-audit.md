# notes-manifest-v1 自审（对抗性自查）

- 分支 `notes-manifest-v1`（rebase 到 `origin/master` = `4b366d2`）
- 报告：`research/notes-manifest-v1-report.md`　·　机读证据：`research/_raw/notes-manifest-v1/`
- 这一节的目的：把「我可能在自己骗自己」的地方逐条写出来，并给出**可证伪的证据**（或如实标注为未验证）。

---

## A. 可能自我欺骗的点，逐条查

### A1. 清单是不是「回扫产物 / 正则扫 HTML」得来的？（acceptance 的第一条）

**不是**，而且这一点有**可证伪的实验**：`noteManifestText()` 只读内存里的登记表 `noteIntent`，
`noteIntent` 只有三个写入点（`noteDeclare()` / `notePinned()` / `notePage()`+`noteUntracked()`），
全部发生在**内容构造点**；构建期自检（`noteManifestSelfCheck()`）才第一次回读 HTML。

实验（牙 M1）：把模板里的 `class="snote aliasnote"` 改成 `class="xnote aliasnote"`，**登记那句一字不动**
⇒ 清单仍声明 1 条 `snote aliasnote`，渲染侧 0 条 ⇒ 构建 exit 1。

**如果清单是回扫产物得来的，两侧会同时变成 0、什么都不会红** —— 这正是「两个来源互相独立」的可证伪判据。
反过来说，如果哪天有人把清单改成回扫产物，M1 这颗牙会立刻失效（构建重新变绿），所以牙本身也是这条性质的守卫。

### A2. 「先登记、后输出」是不是真的？还是登记与输出可以分家？

`noteDeclare(route, decl, html)` **返回它收到的 HTML**，构造点的模板只能写
`` `${noteDeclare(..., `…html…`)}` `` —— 想把说明写进页面就得先登记。空 HTML、缺槽位 token、
缺 `declaredBy`、槽位名拼错，都会**抛错**（不是静默跳过）。实测过一次：`route` 传空串时构建失败并给出原因（首页路由是空串，已修正）。

**但有一个已知例外**：`/plans/coding/` 的 `.snote.pnoscript` 用的是 `notePinned()`（组装点 pin）——
它的 HTML 由范围之外的 `lib/plans-page.js:1013` 输出，登记**不产生** HTML。这一点在报告 §5 明说，
清单里也带 `pinned` / `pinnedReason` 字段，不会被误读成构造点登记。

### A3. 判据会不会在正常页面上误报（假警报）？——这是本仓最怕的坏法

- 结构下限（floor）只取**无条件产出**的条数，逐条给了源码位置：状态页 2（`:1005`/`:1030` 两处都在
  无条件模板里）、订阅中心 4（订阅方法 / 厂商门槛 if-else / 两段「怎么读」）、别名页 1、厂商页 6
  （六节各一条，`VENDOR_NOTE_COUNT`）、非别名目录页 0。
- **条件分支不进 floor、只进逐条对账**：`/feeds/` 的「未分组订阅」「变化空态」「套餐空态」
  「没有达门槛的厂商订阅」都是 if/else 里各自登记 —— 分支不触发时两侧同时少，不产生假警报。
- 台账下限取的都是**无条件**的那一条（`models-page.js:1112`/`:1123`、`data-docs.js:794`、
  `plans-page.js:1010`、`plans-hub-page.js:313`、`api-plans-page.js:613`、`archive.js:589`/`:601`、
  `index.html:3930`），且**只在页面存在时**才判（档案详情页当前 0 个 ⇒ 那段代码不跑）。
- **未验证（如实标注）**：没有构造「archive 索引 0 条」「plans 页 0 套餐」「feeds 一个分组都不渲染」
  这类**极端数据态**去跑 floor。风险是**红一次让人去看**（而不是静默放行），符合本仓「过期豁免要删掉」
  那条既有纪律；但下一轮遇到这类数据态时，第一反应应当是「更新台账/下限」，不是怀疑判据坏了。

### A4. 两侧的检测口径真的同构吗？会不会「一边看不见、一边看得见」导致假红？

- 构建期 `noteSignaturesInMain()`：去注释 / 去 `<script>` / 去 `<style>` → 扫标签 → `class` 属性分词 →
  按**排序后的 token 集合**分组。
- §22c `wideMeasure().notesBySignature`：`main.querySelectorAll('[class]')` → `getAttribute('class')` 分词 →
  同一套分组。
- 两处注释互相点名、并各自写明「检测是 token 级、判定是集合级」。
- 边角形态（单引号 `class='snote'`、无引号、SVG 的 `className` 是对象）：检测**看不见** ⇒
  渲染侧少一条 ⇒ **红**（保守方向），不会静默放行。未逐一边角实跑。
- M3 牙证明了 §22c 侧真的会红（改产物即可，无需重建）。

### A5. 断言数只增不减？

| 运行 | 项数 |
| --- | --- |
| `origin/master` `4b366d2`（captain 给的基线读数） | 874 |
| 本分支 `--dir=dist` | **880**（+6，全部是新加的 §22c ⑨；没有删除或改名任何既有检查） |
| 同一次运行减去 ⑨ 的 6 条 | 874 —— 与 master 基线一致（该项由 master 自身的 verify 复跑复核，见 `.arch-v1/nm-baseline-master.json`） |

### A6. 产物变化面只有清单文件？

与 `origin/master` `4b366d2` 的**干净检出**（`.worktrees/nm-baseline`，`--out=dist.master`）逐文件 sha256 对账：
**新增 1**（`_notes.ndjson`）、**改变 0**、**删除 0**。没有「顺手改了某个页面」这种事。

### A7. 越界了吗？

改动只有 4 个文件，全部在 in-scope 列表内：`scripts/tools/build-local.js`、`scripts/tools/verify-site.js`、
`scripts/lib/landing.js`、`scripts/lib/vendor-page.js`（+ `research/` 的两份报告与四份小 JSON）。
**未动**：`docs/DESIGN-RULES.md`、`NEXT-STEPS.md`、`scripts/lib/seo.js`、`seo-selftest.js`、`seo-verify.js`、
其余 `/research/_raw/` 目录、`dist/`（产物，gitignore）。
`scripts/lib/audience.js` 与 `scripts/data/` 在 in-scope 里但**本轮无需改动**（理由见报告 §5 末）。

### A8. 我有没有把「临时变异」留在工作区里？

`node .arch-v1/nm-mutations.cjs restore` 用 `git checkout --` 还原；实测 `git status` 干净、`git diff` 为空，
重建后全树摘要回到 `67d1d0bd…`（与变异前同一串）。三颗牙的注入点都是**脚本化的**（`.arch-v1/nm-mutations.cjs`），
不是手改 —— 手改无法证明还原是逐字节的。

---

## B. 本轮**没有**做到 / 没有验证的（如实清单）

1. **单条改名的覆盖只到 186 页里的 6 个 `.snote` 页族 + 全部 `.pnote`/`.vsnote`**：
   `models/*`（52 页）· `plans/`·`plans/api/`·`plans/coding/`（3 页）· `docs/data/` · `archive/` ·
   `changes/` 这 58 页的 257 条 `.snote` 构造点在范围之外的模块里，本轮只做到「台账 + 下限 + 棘轮」。
   报告 §5 给了下一轮的机械接管清单（注入 `ctx.note`，与 `lib/vendor-page.js` 同形）。
2. **没有跑 Full Gate 的完整 L1–L5**：跑了与本轮改动相关的那批（`check:ci`、`check:evidence`、
   `verify:seo`、`selftest:zh`、`selftest:analytics`、`check:feeds:reproducible`、8 个 `selftest:*`）
   与 §22c 全量（880/0）。L5（线上冒烟）与 L4 的 `verify:regress` 交给 PR 的 CI gate 跑。
   `--compare` 只比 6 个聚合量（覆盖条数 / 卡片数 / 首屏 / 页高 / 外链 / JS 错误），本轮首页产物逐字节未变 ⇒ 应当不回归。
3. **没有验证台账下限在极端数据态下的稳定性**（见 A4 末）。
4. **清单文件名是 `_notes.ndjson` 而不是任务建议的 `_notes.json`**：原因是产物里每个 `*.json` 必须被
   注册表认领，而注册表在 out-of-scope 的 `lib/data-docs.js`。报告 §7 给了需要新增的那一行
   （`INTERNAL_ARTIFACTS`）；若 captain 决定采纳，改名是纯机械动作（文件名常量 + 一处注册表）。
5. **没有做 `.vsnote` 的 §22c 几何判据**（窄柱 / 同轴 / 藏字）：本轮只把它纳入**条数**对账
   （150 条逐页相等）。给 `.vsnote` 也上几何判据是另一件事，本轮不碰。
6. **`dist/_notes.ndjson` 会公开可下载**（GitHub Pages 不排除 `_` 前缀文件，`.nojekyll` 在位）：
   清单里只有路由、槽位、class 签名与源码位置，没有内部措辞或数据 —— 已核过不含密钥/内部文案，
   `secret-scan` 也扫过整个暂存目录（构建期第 4 步）。
