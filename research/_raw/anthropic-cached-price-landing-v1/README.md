# t28 证据目录：Anthropic Sonnet 5.5 缓存读价 0.20→0.10（Tier-1）

- 任务：t28 / anthropic-cached-price-landing-v1（attempt 2）；观测/复核日 **2026-10-08**；PR **#97**
- 官方依据：<https://www.anthropic.com/claude-haiku-5-5>（页面自印日期 **October 7, 2026** = 官方生效日）
- 日期口径：官方生效日 **2026-10-07**（模型 `note` + 报告）／我们的观察/记录日 **2026-10-08**（`capturedAt`、`lastSeen`、`verifiedAt`、事件 `at`）

本目录是**进仓**的证据索引；运行时的大块读数（探针、完整日志、`gate.log`、`rates-*.txt`、`render-*.txt`、`compare-records.out.txt`）在本机 `.arch-v1/t28/`（Tier-3，不入库）。

| 文件 | 内容 |
|---|---|
| `old-docs-quote.md` | 被保留为历史的旧 $0.20 docs 引文逐字存档 + 处置理由 |
| `callers-opts-max.md` | `opts.max` 前后调用清单（除 `api-plan-schema.js:1268` 无人传） |
| `readings.md` | 全树摘要改前/改后、渲染面命中、费率逐条 diff、改动面收敛读数 |
| `teeth.md` | 五颗牙的红/绿读数 + 起点与还原后 sha256（由 `.arch-v1/t28/teeth.js` 生成） |
| `manifest.json` | 本目录文件的 sha256 清单 |
