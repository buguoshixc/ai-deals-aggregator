# research/_raw/p2-residuals-v1 —— 原始读数（P2 残留三条）

对应报告 [`research/p2-residuals-v1-report.md`](../../p2-residuals-v1-report.md) 与
自审 [`research/p2-residuals-v1-self-audit.md`](../../p2-residuals-v1-self-audit.md)。
基线 `origin/master = 4b366d2`（rebase 到 `narrow-reading-columns-v1` 合并之后）· 读数日期 2026-10-08。

| 文件 | 是什么 | 怎么复现 |
|---|---|---|
| `text-floor-margins.json` | **正文下限余量登记的机器可读转写**（页路由 / kind / 条数 / 当前字数 / 下限 / 余量 / 登记日期）。唯一出处是 `scripts/lib/seo.js` 的 `TEXT_FLOOR_RESIDUALS`，`npm run selftest:seo` §六 会与它**逐字节对账** —— 这个文件是**产物**，不是真值 | `node -e "const fs=require('fs'),seo=require('./scripts/lib/seo');fs.writeFileSync('research/_raw/p2-residuals-v1/text-floor-margins.json', JSON.stringify(seo.TEXT_FLOOR_RESIDUALS,null,2)+'\n')"` |
| `floor-census.json` | 全站 **186 页**的「可见正文 − 下限」普查（kind/count 取自构建期同一份计划） | 一次性探针 `.arch-v1/p2-census.cjs`（不进库；报告 §9 有命令） |
| `readings.json` | 三条 P2 的现场读数汇总：e1 的公式与登记表 · e2 的真函数三层读数 · e3 的入口文案全站普查与措辞出处 · 断言数 before/after | 同上三个探针的输出汇总 |
| `mutations.json` | 四处**沙箱实跑变红**的读数（产物级 3 处 + 源码级 1 处），含改前/改后 sha256、命令、退出码、逐字红行 | 报告 §4 / §9 的命令 |
| `e2-unavailable-log-build.json` | 「历史日志不可用」在**构建路径**上的两次实跑（缺失 / 损坏）：它认出不可用、但在 Dataset Manifest 那一步失败，产物自检与 SEO 门禁**都没跑到** | 源码级沙箱：删掉或改坏沙箱的 `scripts/data/deal-history.json` 后构建 |
| `product-digest.json` | 产物变化面：判据原样 vs 判据带本轮改动的两次构建，逐文件 sha256 对账（**303/303 相同**） | `node .arch-v1/tree-digest.cjs dist --out=…` |

> 一次性探针（`.cjs` / 完整日志）**不进库**：它们属于 Tier-3（见 `docs/EVIDENCE-POLICY.md`），
> 留在本机 `.arch-v1/`。这里只放**结论与可复核的小 JSON**。
