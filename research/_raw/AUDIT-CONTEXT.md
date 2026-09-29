# 审计共享基线（captain 在 2026-09-28 本轮实测，团队请直接引用，不要重复推导）

> 本文件由 captain 亲自跑命令得到，是本次审计的**共享起点**。团队成员可复跑验证，
> 但不要把它当作结论抄一遍——它的用途是让你们把精力花在**尚未证实**的地方。

## 1. 仓库与版本坐标

- 工作目录：`D:\OneDrive\Desktop\Code\AI Page`（项目名 `ai-deals-aggregator`，package.json version `2.0.0`）
- 远端：`https://github.com/buguoshixc/ai-deals-aggregator.git`
- 当前 `HEAD` = `a0c4ab2709fb309a6edeac2afa1798d0ede9cbe5`（`a0c4ab2`，2026-09-28 12:10:53 +0800，`docs: 2.32 上线记录…`）
- 远端 `master` = 同一个 `a0c4ab2` → **本地与线上没有未推送的差异**（工作区干净，`git status --short` 空）
- 提交总数 118；首个提交 2026-09-20 23:09:30
- 本地分支 15 个（含 `master`、`backup-pre-rewrite`、`feat/*`、`fix/*`、`trial/*`）；tag 2 个（`backup/pre-ab-merge`、`backup/pre-origin-merge-b261add`）
- 活跃 worktree 2 个：主工作区 + `.worktrees/fold-same-vendor`（在 `52f6164 [fix/fold-same-vendor]`，**落后于 master**）
- Node 实测 `v24.13.1`（`engines` 要求 `>=20.18.1`）
- 依赖只有 `axios` + `cheerio`（运行时）、`playwright-core`（开发）；**无打包器、无框架**

## 2. CI / 上线实况（GitHub API 实测，非文档转述）

- 工作流 4 个：`collect.yml`、`deploy.yml`、`verify.yml`、`probe-sources.yml`
- 最近运行（`total_count` 累计 90 次）：
  - `a0c4ab2`：`Verify site (gate)` **success** + `Deploy to GitHub Pages` **success**
  - `ca183b9`：两条均 success
  - `e01dcfc`：`Verify site (gate)` **failure**（译文门禁红），同 sha 的 Deploy 为 success
  - 更早：`Collect AI Deals`（schedule）success × N，`Deploy …`（workflow_run）success
- 结论：**当前 HEAD 的两条工作流都是 success**；e01dcfc 的红色已被 ca183b9/a0c4ab2 覆盖。

## 3. 线上产物实况（HTTPS 实测）

- 站点：`https://buguoshixc.github.io/ai-deals-aggregator/`
- `index.html` HTTP 200，294055 字节，`last-modified: Mon, 28 Sep 2026 04:11:20 GMT`
- 线上 `deals.json`：HTTP 200，132665 字节，`schemaVersion=2`，`count=133`，`updatedAt=2026-09-28T11:50:50+08:00`
- 线上 `deals` 数组实测：133 条；`type=deal` **80** 条；`region` cn **60** / global **73**
- 线上 `sitemap.xml` `<loc>` 计数 **81**（首页 1 + `deal/<id>/` 80）
- **线上 deals.json 与本地 deals.json 完全一致**（count 133、updatedAt 一致、id 集合相同）
- **线上 index.html 与本地 `dist/index.html` 字节数一致**（均 294055）→ 线上就是当前 master 的产物

## 4. 本地门禁实况（captain 实跑）

- `node scripts/validate.js` → **通过**，警告 2 条：
  - 疑似同一优惠未合并：`Getsolved ↔ Getsolved AI Detector`
  - 疑似同一优惠未合并：`KREA ↔ Kreado AI`
  - 明细：总 133 / 真实优惠 80 / 国内 60 · 国外 73 / 含截止时间 **0** / 有效期说明 61 / 人工核验 32 / 卡片特性标签 32 / 价格阶梯 3 / 策展数据 32
- `node scripts/tools/verify-site.js --compare=research/_raw/ours-baseline/verify.json` → **验收 142 项，失败 0 项**
  - 回归项：覆盖优惠 80→80、卡片 50→50、首屏完整可见 9→9、页高 4566px→4566px、外部请求 0→0、JS 错误 0→0
  - 基线文件 `research/_raw/ours-baseline/verify.json` 生成于 2026-09-27T15:50:34.934Z（**早于当前 HEAD**）

## 5. 代码规模（供分工参考，非结论）

- `scripts/` 约 48 个文件：采集器 5（`collectors/`）、库 `lib/` 17、工具 `tools/` 24、数据 `data/` 6（`curated_cn.json`/`curated_global.json`/`translations_zh.json`/`aliases.json`/`official_urls.json`/`backfill-cards.js`）
- 体积最大的三个：`tools/verify-site.js` 约 120KB、`tools/build-local.js` 约 58KB、`tools/check-ci-consistency.js` 约 35KB
- 根目录文档：`PROJECT_STATUS.md` 约 173KB、`README.md` 约 32KB、`NEXT-STEPS.md` 约 17KB、`SUMMARY.md` 约 21KB
- `docs/DESIGN-RULES.md` 约 21KB；`research/` 含 `benchmark/`、`vertical/`、`_raw/`、`DESIGN-TOKENS.md`、`EVIDENCE.md`、`GAP-MATRIX.md`、`VISION-REVIEW.md`
- `dist/` 已是完整产物：`index.html` + `deals.json` + `feed.xml`/`feed.json` + `sitemap.xml` + `logos.css` + `og-image.png` + 80 个 `deal/<id>/index.html` + 约 50 个 logo 资源

## 6. 已知的「文档 vs 现实」风险点（请优先证伪）

这些是 captain 观察到的**可疑处**，不是结论。团队成员必须自己动手验证：

1. `SUMMARY.md` 头部写「`master` = `origin/master` = `fa2403d`」，与实测 `a0c4ab2` **不一致** → 文档滞后于现实。
2. `PROJECT_STATUS.md` 有 173KB，声称记录到 2.32；需确认它内部对版本/数字的描述是否与当前实测一致。
3. `verify` 的基线文件生成于 09-27，早于当前 HEAD（09-28），**回归比对的分母可能是旧的** → 需判断这是否会掩盖回归。
4. 「含截止时间 0 / 未标注截止日期 112 / 长期活动 21」与「133 条」的对账关系需要说清（112+21=133，但「含截止时间 0」又是怎么来的）。
5. `.worktrees/fold-same-vendor` 停在 `52f6164`，长时间未清理 → 需要判断它是残留还是有意保留。
6. 2 条「疑似同一优惠未合并」是真实数据缺陷还是别名表漏登记。

## 7. 审计纪律（必须遵守）

- **只写你亲手跑出来、亲眼看到的东西**。每条数字都要能指到命令或文件行号。
- 区分三档：**实测**（跑了命令）/ **引用**（读了文件/文档/API）/ **推断**（你的判断，必须标注）。
- 文档里写的数字**不算证据**，只能当作「待验证的声明」。
- 发现文档与现实不符时，明确写出「文档说什么 / 实测是什么 / 差在哪」。
- 不要修改任何代码、数据、产物、workflow。本轮是**只读审计**。
- 报告写进各自被分配的 `research/_raw/audit-2026-09-28/` 下的文件，不要互相覆盖。
