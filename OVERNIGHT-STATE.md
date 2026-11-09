# 过夜施工状态（供给端第二夜）

> 用途：进程随时断掉时，接手的人只看这一个文件就知道停在哪。
> 每完成一个子任务追加三五行（做了什么 / 门禁读数 / 下一步）。收尾时并入 OVERNIGHT-REPORT.md。

## 2026-11-10 00:30 T0 · 保命快照

- git log: `327bc15` WIP 快照（P2 在制品），父提交 `5144293` P1、`6badae2` P0 原地保留。
- `git status --short` 干净（13 文件全部入 WIP 提交：11 M + leads.js/lead-radar.js 新增）。
- 基线读数：`node scripts/tools/ai-selftest.js` → **108 项 · 失败 0**；`node scripts/tools/fixture-test.js` → **6 项 · 失败 0**。
- 数据现状核对：deals.json `count=207`（AppSumo 23 / OpenRouter 5 / 其余结构化+目录站）；type=deal 109、type=tool 98；lead 0 条。
- 下一步：读 collect.js / store.js / history.js / index.js 四条主链，然后 T1.1 生成 8 份 leads feed fixture。

## 2026-11-10 00:52 T1 · P2 收尾（fixture + 判据自测 + 清理假陈述）

- **T1.1 8 份 feed fixture 已生成**：`scripts/data/fixtures/leads_{ithome,36kr,qbitai,ifanr,sspai,geekpark,mydrivers,tmtpost}.feeds/`
  各含 `page.min.xml` + `expected.json` + `PROVENANCE.md`；片段 2.3–6.3 KB（上限 20 KB）。
  修了一处实现缺口：`build-fixtures.js` 里 `RSS_FIXTURE_FEEDS`/`trimRssFeed()` 写好了但**没有登记进 `TRIMS`**
  （`buildOne` 只认 `TRIMS`），已补登记循环，`--source=leads_*` 才真的跑得到。
  读数：`node scripts/tools/fixture-test.js` → **14 项 · 失败 0**（原 6 + 新 8）。
- **T1.2 线索判据自测**：`ai-selftest.js` 新增 `leadRadarTeeth()`，18 条断言覆盖
  三闸同时命中 / 缺时间词反例 / 缺平台名反例 / 近失配清单 / 摘要 120 字窗口两侧 /
  7 天边界（恰好 7 天收、7 天+1s 扔，注入 now）/ 草稿形状（6 键、type=tool、禁字段、fixture 一致）/
  TTL（第 7 天在架、第 8 天下线、不误剪普通 deal、常数唯一出处）。
  读数：`node scripts/tools/ai-selftest.js` → **126 项 · 失败 0**（原 108 + 18）。
- **T1.4 假陈述**：`leads.js` 文件头「首轮真实产出 1 条线索」改为「当日只跑过 dry-run，实跑落盘见
  OVERNIGHT-REPORT.md（T2）」；leads.js:147「由 ai-selftest 盯着」在 T1.2 之后已为真。
  P1 commit message 的「见报告」将在 T5 报告里显式接上（不改写历史 commit）。
- **T1.5 P1 偏差**：`openrouter.js` 文件头 P1 偏差段重写，点名 `check-reproducible.js` 的六字段重放判据、
  要写字段必须动 `scripts/data/audience-overrides.json`（`mergeAll` 的 overrides 注入），
  并说明为什么无人值守下不做。
- **T1.3 页面侧静态核验**：`node scripts/tools/build-local.js` → 产物自检通过（630.7 KB）；
  `dist/index.html` 里 `isLeadRecord` / `radarExtHrefOf` / 「线索 · 未核验」共 8 处命中；
  `validate.js --strict` 通过（6 条既有警告）。线索「不进优惠列表 / 只在变化雷达 / 外链原文」的
  **行为级**验证要等 T2 有数据后在 dist 里做。
- 数据未动：deals.json 仍 207 条、线索 0 条（T2 才实跑）。
- 下一步：提交 T1 → T2 dry-run → 全量实跑 → 核对 deals/history/source-health/dist → 提交。

## 2026-11-10 01:05 T2 · P2 首轮实跑落盘

- **dry-run（8 个 leads 源子集）**：日志 `/tmp/leads-dry.log`。逐源读数（RSS 条目 / 7 天窗口内 / 三闸命中）：
  IT之家 60/60/0 · 36氪 30/30/0 · 量子位 10/10/0 · 爱范儿 20/20/0 · 少数派 10/10/0 ·
  极客公园 30/19/0（11 条因原文日期>7 天被窗口筛掉）· 快科技 100/100/**1** · 钛媒体 15/15/0。
  近失配样本 0 条；最终线索 1 条（快科技《每天白赚几百 AI大模型免费薅羊毛…》，原文日期 2026-11-09）。
- **实跑（全量，不带 --only/--headless）**：日志 `/tmp/leads-real.log`，exit 0。
  deals.json **207 → 210**：+3 = 线索 1（快科技）+ 其它来源新增 2（AppSumo NoCodeBackend、Futuretools Call Annie）；
  AppSumo 本次 22 条（上次 23，少 1 条未达「连续两次未见」门槛，未记 ended，符合既有 absence 规则）。
  deal-history 同日新增 **3 created**（含线索 id 3eac4b6acccb）+ 1 updated；history-verify 绿。
  source-health 新增 8 个 leads_* 行，全部 healthy（mydrivers items=1，其余 0 条也 healthy —— zeroOutputExpected 生效）。
- **页面验证**（build-local 后 dist/）：
  线索只在 `dist/changes/index.html`（1 处）与首页「变化雷达」（1 处）出现，带「线索 · 未核验」徽标 +
  原文外链 `https://news.mydrivers.com/1/1164/1164402.htm`（target=_blank rel=noopener）；
  首页卡片列表 0 处；sitemap 0 处；无站内详情页 `dist/deal/3eac4b6acccb`（正确）。
- 门禁读数：validate --strict ✅ · check-reproducible ✅ · history-verify（81 事件）✅ ·
  health-selftest 72/72 ✅ · check:ci 39/39 ✅ · build-local 产物自检 ✅。
- 下一步：提交 T2 → T3 收回/审阅/合并 → spawn T4。

## 2026-11-10 01:15 T1.3 行为级核验（T2 数据落盘后补做）

- 线索在产物里的实际渲染：
  - `dist/index.html` 首页「变化雷达」1 处：`<a class="ritem" data-deal-id="3eac4b6acccb" href="https://news.mydrivers.com/…" target="_blank" rel="noopener noreferrer">` + `<span class="rty rlead">线索 · 未核验</span>`；
  - `dist/changes/index.html` 1 处：`created` 分栏，外链原文 + 「线索 · 未核验」；
  - 首页卡片网格 0 处（该记录 type=tool，网格只渲 deal；且客户端 visibleDeals 先 `!isLeadRecord` 再筛选，双保险）；
  - `dist/sitemap.xml` 0 处；`dist/deal/3eac4b6acccb` 不存在（无站内详情页，正确）。
- `dist/assets/data/offers.json` 里该记录 `sourceFacts.sourceType="lead"`、`history.events=[created]`、无 discountInfo/六字段。
- T3（P3-A 门禁拆锁）已交给 teammate `p3a-gate` 在 `.worktrees/p3a-gate` 并行做；T4 工位与简报已备好（`.worktrees/p3b-health`），等 T3 收回后立即启动。
- 下一步：等 T3 里程碑 → 审阅 diff + cherry-pick → 文档真话补齐 → 启动 T4。

## 2026-11-10 00:50 修两处「基线既有红」（gate:build 前置；非本夜引入）

- **发现**：接手状态 `27404e3` 的 `npm run gate:build` 本就是红的，红在两处与 P2 代码无关的地方；
  T3 teammate 在其干净 worktree 独立复现，归因一致。
- **红 ①：`selftest:seo` 余量登记过期**（`scripts/lib/seo.js` 的 `TEXT_FLOOR_RESIDUALS`）：
  `category/audio/` 登记 count=6 / `category/image/` 登记 count=5，实时都是 7。
  git 历史实测：master 基点 `ebdd0a8`（179 条）时是 6/5（与登记一致）→ P0 AppSumo +23（`6badae2`，202 条）后变 7/7；
  P1/P2 未再改变。两页当前余量 168 / 267（≥150），已离开「余量 <150」射程 ⇒ 按 `seo-verify.js` §③′
  的双向不变式**退役**（移入 `TEXT_FLOOR_GRADUATED` 并写明理由），下限公式 `textFloor(kind,count)` 一个字没动；
  同步 `research/_raw/p2-residuals-v1/text-floor-margins.json` 转写。读数：seo-selftest 104/0、seo-verify 18/0。
- **红 ②：`selftest:coverage-targets` 反证牙 v3④ 静默空转**：该牙只清空裁决表，咬人前提是真实
  `source-health.json` 里有 `consecutiveFailures>=3` 的来源；当前 19 行全是 0（futurepedia 是 zero_output），
  于是报告 exit 0、牙却判红。修法：牙自给自足 —— 用 `--source-health=` 覆盖入口注入一个同结构的合成失败来源，
  让 `source-rulings.js` 的「连续失败≥3 必须有裁决」判据重新真的被触发；**判据本身未改**。读数 200/0。
- **结果**：`npm run gate:build`（L1+L2+L3，40 个脚本）→ **全绿**。
- 下一步：等 T3 提交 → cherry-pick → 集成复验 → 启动 T4。

## 2026-11-10 00:56 T3 收回 + 文档真话 + 完整门禁读数

- T3 teammate 交付 `c40269d`（check:ci 39/0 · 16/16 负向探针证明 (11)/(13) 有真牙）；Lead 审阅后
  cherry-pick 为 `5e7d828`，集成态复跑 `check:ci` = 39/0，PyYAML 解析 collect.yml = 17 步。
- 文档真话（`4413273`）：README（采集链路描述 / 门禁红处置）、`action.yml` 顶部描述、`verify.yml` 三处注释、
  `docs/DESIGN-RULES.md` H9、`docs/AI-MAINTENANCE-v2.0.md` 采集链路图、`scripts/collect.js` 头注释。
- **完整门禁实跑读数**（`npm run gate`，/tmp/gate-full.log）：解析 54 步骤、执行 49 个脚本步骤，
  **48 通过 · 1 失败**；唯一失败 = `[52] Real-browser acceptance`（本机无浏览器内核 / 默认 Windows Edge 路径），
  `[53]` 回归比对与 `[54]` 结论因此未执行。失败点在浏览器判定，非回归。
- `npm run gate:build`（L1+L2+L3）= 40 脚本 · 失败 0（文档改动后复跑仍绿）。
- T5 报告草稿已写入 `OVERNIGHT-REPORT.md`（§1–§4.3 与 §5/§7/§8 已填；T4 行、BLOCKED、附录待收尾）。
- 下一步：等 T4（worktree `.worktrees/p3b-health`）→ cherry-pick → 集成复验 → 填报告 → 最终提交。

## 2026-11-10 01:00 独立复查（Lead 亲自跑的负向抽查 + TTL 真数据）

- 在独立 worktree `/tmp/wt-mut`（基点 5e7d828）对 P3-A 判据做 4 颗定向篡改 → 全部按预期变红并点名：
  ①数据门禁少 fixture-test ⇒ (13) 红；②release gate allow_degraded_run 改 'false' ⇒ (11) 红（三个事件逐条点名）；
  ③数据门禁加 continue-on-error ⇒ (13) 红；④删留痕步 ⇒ (13) 红。逐字节还原后 check:ci 回 39/0。
- 线索 TTL 真数据（只读）：`store.prune(deals, today)` 在 2026-11-16（第 7 天）保留线索；
  2026-11-17（第 8 天）只下架该 1 条（removed.expired=1），其余 209 条不动。
- 完整门禁 `npm run gate` 读数已写入 OVERNIGHT-REPORT.md §4.3（49 个脚本执行：48 通过、1 失败=真浏览器验收缺内核）。
- 下一步：等 T4 → cherry-pick → 全量复验 → 填报告 T4 行/§4.6 → 最终提交。
