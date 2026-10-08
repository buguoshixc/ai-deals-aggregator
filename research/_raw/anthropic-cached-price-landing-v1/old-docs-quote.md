# 旧 $0.20 引文的逐字存档与处置（t28）

## 处置 = **保留为历史**（不是替换）

`scripts/data/curated_api_plans.json` 的 anthropic 记录里，这条引文**逐字节未动**（字段、引文、URL、`capturedAt` 全同），仍留在 `evidence[]` 中：

```json
{
  "field": "models.claude-sonnet-5.5",
  "quote": "Claude Sonnet 5.5 | Base tokens: Input $2 / MTok, Output $10 / MTok | Prompt caching: 5m writes $2.50 / MTok, 1h writes $4 / MTok, Hits and refreshes $0.20 / MTok",
  "sourceUrl": "https://docs.anthropic.com/en/docs/about-claude/pricing",
  "capturedAt": "2026-10-01",
  "lang": "en"
}
```

## 为什么保留而不是删掉

1. **它是这条记录上 B2「输入价先于输出价」唯一的落点**：该引文同时含输入价 2 与输出价 10（顺序正确），删掉它 = sonnet 少一条列序牙（断言净减少）。
2. **它是「10-01 当时是什么价」的原始证据**：记录的旧值 0.20 在采集日是对的（官方 Sonnet 5.5 发布稿 2026-09-28 写 $0.20）；`capturedAt` 2026-10-01 让它的时效一目了然。
3. 新值另有**官方变更记录引文**（`models.claude-sonnet-5.5.rates.cachedInput.change`，`capturedAt` 2026-10-08，逐字含 “$0.10 … rather than $0.20”）：两条引文并列，读者能直接读出「当时 $0.20 → 现在 $0.10」这件事，不需要任何推断。
4. 仓库的关系层（`scripts/data/model-registry-links.json` 的 sonnet 条目）**也保留**这条副本（规则⑥：链接只许逐字复制记录的引文），并新增变更记录那一份。

## 边界（如实登记）

- 这条旧引文**没有**数据内的「历史」标记，历史性靠 `capturedAt`（2026-10-01）与紧邻的变更记录共同说明。
- 官方 docs 定价页（`platform.claude.com/docs/.../pricing`）从本网络**仍被区域门拦**（t26 §4/§5 已登记）⇒ 本次没有复核该页今天写什么，旧引文的时效判断不依赖该页可达。
