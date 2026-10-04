# private-analytics-v1 · CI 结果（PR #36）

> 本文件是 CI 的**原始结果记录**，与 `research/private-analytics-v1-report.md` §12 配套。
> 报告正文写在 CI 跑完之前，因此当时只能写「见 PR 页面」；这里是跑完之后补记的实际结论。

| 项 | 值 |
|---|---|
| PR | https://github.com/buguoshixc/ai-deals-aggregator/pull/36 |
| 分支 | `private-analytics-v1` → `master` |
| 最终提交 | `237496a`（`docs(private-analytics-v1): 记录全量产物对账…`），父提交 `3ce18c6`（页脚注释修复） |
| 必需检查 | **`gate` → pass**（3m14s） |
| 运行 | https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/37181642429 |
| Job | https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/37181642429/job/111375249369 |
| 触发 | `pull_request`（不是人工降级路径 → `allow_degraded_run=false`） |

## 这次 `gate` 里真的跑了什么

`verify.yml` 的 gate job 与本地跑的是**同一个复合 action**（`.github/actions/gate/action.yml`），
因此这次 CI 里逐项真实执行了：

- `CI consistency (action / runner / node-version / engines drift)` → `--expect-checks=37`
  （本轮把 36 提到 37，新增断言 (18) 私有分析门禁步骤）；
- `Validate data (strict)` · 可重建性 · 历史一致性 · 迁移验收 · 译文门禁 · 全部 selftest
  （含本轮新增的 **Analytics self-test**）；
- `Assemble site`（与 deploy.yml 同一条构建路径）→ 产物自检；
- 5 个产物依赖的页面自测 + **Analytics self-test** + Feeds 可复现（都显式 `--dir=dist`）；
- `SEO verification (independent, from dist/)`；
- **真浏览器验收 `verify-site.js`**（含本轮新增的第 26 节）与**回归比对 `--compare`**。

## 之前两次运行（同一分支，供对照）

| run | 提交 | 结论 | 耗时 |
|---|---|---|---|
| [37181186537](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/37181186537) | `623fce7` | success | 3m16s |
| [37181353704](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/37181353704) | `59340a5` | success | 3m05s |
| [37181642429](https://github.com/buguoshixc/ai-deals-aggregator/actions/runs/37181642429) | `237496a` | **success（最终）** | 3m14s |

（`37181617044` 被 `concurrency.cancel-in-progress` 取代 —— 同 ref 上新提交会取消旧运行，
这是仓库既有配置，不是失败。）

## 仍然未运行的两项（如实记录）

| 项 | 状态 |
|---|---|
| **Deploy GitHub Pages** | **未运行** —— 合并进 `master` 才会触发 `deploy.yml`（本轮按约定只开 PR，不合并） |
| **线上 Smoke**（`verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/`） | **未运行** —— 线上目前仍是旧版本，此时打线上验不到本轮产物 |
| **Cloudflare Dashboard 人工确认** | `OWNER VERIFICATION REQUIRED` —— 需要账户登录，本轮刻意不持有任何账户凭据 |
