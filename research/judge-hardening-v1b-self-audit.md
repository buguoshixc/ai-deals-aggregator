# judge-hardening-v1b 自审（t10）

对象：`scripts/lib/seo.js`、`scripts/tools/seo-verify.js`、`scripts/tools/seo-selftest.js` + 交付文档/证据。
判定口径：**只写我自己实跑过的读数**；别人给的读数（t5 / t24 / t7）一律标注来源，且能复跑的一律复跑。

## 1. 这一轮的起点：继承 + 自证

- 前一位负责人（attempt 1）在断网前留下了 `wip(t10)` 提交（`37e1639` → 本分支 `edf474a`）：
  `seo.js` 的 `stripComments()`、`seo-verify.js` 的三处取词与新增不变式、`seo-selftest.js` 的 §八/§九。
  我的处理：**读全量 diff → rebase 到 `origin/master`（`e1caef9`）→ 逐条复跑**，不采信它的读数。
- rebase 无冲突（`4ecfb9d..e1caef9` 之间那 11 个提交没有碰这三个文件；用 `git diff --stat` 核对过空集），
  所以「保留两侧紧的那条判据」这一条**没有实际用上**。
- 我从头复跑的读数（含 §3 的 pre/post 相位）：见 `research/judge-hardening-v1b-report.md` §2/§5 与
  `research/_raw/judge-hardening-v1b/*.json`；t7 的 §八 5 条是按**原文落地**并逐字核对（非空行 61 行 `identical: true`）。

## 2. 我自己做了哪些改动（与继承的部分分开记账）

| 改动 | 文件 | 为什么 |
| --- | --- | --- |
| A1 矩阵断言 ×2 | `seo-selftest.js` §九 | 继承版的 §九 是「逐点各写一条」；矩阵断言把「注释版 == 不存在版」做成八个读点上的不变式，新增读点漏剥会直接红 |
| `attr()` 纪律化 | `lib/seo.js` | 它 0 调用点、未导出（不是 A1 的「决定点」）；把它也接到 `stripless()`，免得日后被拿去写第四处读点 |
| 装置修正 ×3 | `.arch-v1/`（scratch） | ① `obs2` 目标页选错（`need/edu-identity/` 的块粒度切不到区间）→ 改成「按可见文本量删块 + 区间守卫」；② `sb-registry.cjs` 的 pre-fix 段只退 `seo-verify.js`，会造出历史不存在的混合态（固定版自测 §九 护栏红）→ 改成三个文件一起退；③ 沙箱只拷一个 JSON 让自测 §六 ENOENT → 改成整目录拷贝 |

## 3. 过程事故（如实登记）：一次 `git checkout HEAD --` 抹掉了未提交改动

- **发生了什么**：为了量「pre-fix 自测项数 = 88」，我执行了
  `git checkout origin/master -- scripts/tools/seo-selftest.js scripts/lib/seo.js` → 跑 → `git checkout HEAD -- <同两文件>`。
  最后那一步把**当时还没提交**的「A1 矩阵断言」与「`attr()` 纪律化」一起还原掉了（HEAD 里没有它们）。
  同一时间在后台跑的 `npm run gate`（job `pwsh-1489`）因此跑在一个被我改动过的混合状态上。
- **处置**：kill 掉那个 gate 作业（读数作废、不引用）→ 重新落那两处改动 → 自测确认回到 **103 / 0** →
  **先提交**（`d486010`）→ 再跑完整验收链与 gate（job `pwsh-1513`）。
- **教训（写进装置纪律）**：pre-fix 相位不要用「退文件 → 跑 → 退回来」改工作树；**要么先提交再退**，
  要么像 `sb-registry.cjs` 那样在沙箱副本里退。本任务的 pre-fix 读数（forgery `--phase=before`、88 项自测）
  都是在**已提交**的状态下用同样的退法得到的，落盘后我核对过 `git status --porcelain` 只剩预期改动。
- **影响面**：只影响「gate 那一次读数的有效性」，不影响任何已记录的相位读数（那些跑在提交前但状态明确的状态上，
  且每一次都跟了 `git status` 核对）。为免混淆，本轮所有引用的 gate 读数都取自 `pwsh-1513`。

## 4. 装置自身的缺陷（我发现并已修的，附证据）

1. **`obs2` 形态选错页**：原版对 `need/edu-identity/` 按固定 4 个块正则删，实测「裁不到目标区间（余量 245）」；
   同时它的异常发生在设备写 JSON **之前** ⇒ attempt 1 的 `forgery-*.json` 是**残缺的**（缺 obs2 与后 4 条对照形态）。
   修法：按「删掉的可见文本量」做区间守卫（`[265,340]`），并把它换成反向面（页面被裁薄而没登记）。
2. **`sb-registry.cjs` 的混合工具链**：pre-fix 段只换 `seo-verify.js`，固定版自测的 §九 护栏会因
   「`seo-verify.js` 里没有 `stripComments`」而红 —— 那个红是沙箱造出来的。修法：三个文件一起退；
   实测该段自测回到绿（与 t24 的「两门禁都绿」一致）。
3. **沙箱缺件**：自测 §六 还读同目录的 `floor-census.json`，只拷一个 JSON 会 ENOENT（exit 1、空 tail）。
   修法：整目录拷贝。
4. **PowerShell 读 UTF-8 JSON**：`Get-Content -Raw | ConvertFrom-Json` 在这台机器上按 ANSI 解码中文 ⇒ 解析失败、
   还把旧内容打进了日志。修法：比较逻辑改用 `node` 读（`.arch-v1/make-evidence-v1b.cjs`）或
   `Get-Content -Raw -Encoding utf8`。

## 5. 我没验证的（不要当成已验证）

1. **CI**：本轮没跑 GitHub Actions；本机 `npm run gate` 是完成证据，PR 门禁读数以推分支后的 PR 页面为准。
2. **`verify-site.js` 侧的注释伪造面**：声明面外（t9）。凡「组合仍红」的说法都不记在本轮名下。
3. **`jsonLdBlocks` 在 `verify:seo` 上的产物级判据**：该门禁对「ld+json 包注释」与「真删」都是 0 失败
   （见报告 §6.1）；我没有替它新增判据（那会越界改判据强度而缺少对抗评估），只做了规则级矩阵断言。
4. **`stripComments()` 的对抗边界**：未闭合 `<!--`（当前语义 = 余下全丢，保守）、嵌套注释、`<script>` 串里的 `-->`
   只做了设计说明与 1 条规则级断言，没有做全量对抗；这正是交给 t11 的攻击面。
5. **线上**：本任务不动产物（304 文件全等），所以没有做线上逐字节复核（那属于发布链任务）。

## 6. 验收标准自检（逐条对应任务书的 Acceptance）

| # | 验收项 | 自检结论 | 证据 |
| --- | --- | --- | --- |
| 1 | `lib/seo.js` 每个「读原始文本」的决定点改成剥注释或走解析器，并逐处列改前改后行号 | 满足（12 行对照表；唯一残留 = 死代码 `attr()`，已一并纪律化） | 报告 §3；`precheck-dist.json`（真产物影响面 0） |
| 2 | sitemap `<url>` 块被 XML 注释包住 ⇒ 判红；伪造 / 真删 / 原样三段 | 满足 | `forge-pairs.json` 的 `f2-forge` / `f2-del`；原样 19/0 |
| 3 | canonical 被 HTML 注释包住 ⇒ `verify:seo` 自己判红（不靠 verify-site） | 满足（pre-fix 假绿 → 本分支红，且与真删同解） | `forge-pairs.json` 的 `f3-*` |
| 4 | 会响的断言钉住三条伪造面；红 → 逐字节还原 → 绿；断言只增不减 | 满足（§八 5 + §九 10 = 15 条新增；88 → 103） | `assertion-counts.json`；`gapAPatch` 逐字核对 |
| 5 | `selftest:seo` / `verify:seo` ≥ 87 / 17 且全绿；`check:ci` 39/0；`check:evidence` 绿 | 满足（103/0 · 19/0 · 39/0 · ✅） | 报告 §5 |
| 6 | `docs/DESIGN-RULES.md` / `NEXT-STEPS.md` 未被修改（建议行以消息发 captain） | 满足（两文件 `git status` 零改动；建议行在报告 §7 并单独发消息） | `git status --porcelain` |

## 7. 新判据的假阳性风险评估（观察 2 不变式）

- **口径**：`ownVisibleText(page.html).length - pageKinds.textFloor(kind, count) < 150` 的页面集合必须与
  `TEXT_FLOOR_RESIDUALS` 的 route 集合**相等**（两方向都判）。
- **风险 1（阈值语义）**：登记的 6 页余量 50…142，下一档 409 ⇒ 阈值 150 与 t4 的登记注释同源；页面正文自然增长到
  ≥150 会红，处置 = 按 t4 的流程重新登记（`--print-floor-margins` 打印可逐字贴回的登记块）——**这是一次可见动作，不是静默放行**。
- **风险 2（两套 visibleText 实现不同）**：`seo-verify.js` 用自己的 `ownVisibleText()`（与构建期的 `visibleText()` 独立），
  实测 6 页读数与登记值一致、0 处越界；若某天两者出现 1 字差异，只有当某页余量恰好跨过 150 时才会误红，且错误信息会打印实时余量。
- **风险 3（沙箱/副本）**：不变式读 `--dir` 指定的副本 —— t5 的 A1 清单提过 `verify-site.js` 有一处读 `ROOT/dist` 的例外集，
  这里**没有**该问题（`descriptors` 全部来自 `OUT`）。

## 8. 范围与交付纪律

- 写入面：`scripts/lib/seo.js`、`scripts/tools/seo-verify.js`、`scripts/tools/seo-selftest.js`（三个声明面文件）+
  `research/judge-hardening-v1b-report.md`、`research/judge-hardening-v1b-self-audit.md`、`research/_raw/judge-hardening-v1b/`。
- 未写入：`docs/DESIGN-RULES.md`、`NEXT-STEPS.md`、`scripts/tools/verify-site.js`、`scripts/data/`、`build-local.js`。
- 一次性装置、完整日志、全部伪造副本（15 个 dist 副本）与 4 个沙箱全在 `.arch-v1/`（gitignore，Tier-3）：**未进仓库**。
- `dist/` 只由 `npm run build` 重建（从未手工编辑）；`research/_raw/**` 只放 `.json`（无 `.txt` / `.log` / `.cjs`）。
