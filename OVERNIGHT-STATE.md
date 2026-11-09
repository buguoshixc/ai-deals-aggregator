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
