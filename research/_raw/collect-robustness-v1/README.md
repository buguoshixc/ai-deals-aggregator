# `collect-robustness-v1` 取证（Tier-1 摘要）

> 报告见 [`research/collect-robustness-v1-report.md`](../../collect-robustness-v1-report.md)。
> 证据分级见 [`docs/EVIDENCE-POLICY.md`](../../../docs/EVIDENCE-POLICY.md)。

| 文件 | 内容 | 为什么留 |
|---|---|---|
| `incident.json` | 出事那一轮的**逐步骤状态**（哪一步 cancelled、哪几步被 skipped）、最近 20 轮采集的时长分布、事故后的调度推迟事实、取证时的数据陈旧度 | 它是「30 分钟预算被吃光 ⇒ 整轮取消」这条结论本身；删掉它就只剩一句声明。**原始日志在 GitHub Actions**（Tier-2），这里只留结论性读数 |

## 复跑

```bash
# 装置在 .arch-v1/collect-evidence.cjs（Tier-3，不入库）
node .arch-v1/collect-evidence.cjs
```

## 读这份证据时要注意的一件事

`incident.json` 的 `scheduleDelay` 是**改正后**的读数：第一版判词写的是「2026-10-08T00:00Z 那一轮没有产生 run」，
后续复查发现它只是**迟到**（04:39Z 才起来，晚 4.65 小时）并正常跑完了。
两版都在报告 §1.2 里如实写明 —— 「没跑」与「迟到」是两件不同的事，不能混着说。
