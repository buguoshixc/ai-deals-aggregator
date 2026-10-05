# coverage-depth-v1 · Workstream A 取证现场

本目录是 **Model Release Evidence（Workstream A）** 的原始取证现场。它的作用不是"留个纪念"，
而是让 `scripts/data/models.json` 里每一条 `releasedAt` 都能被**独立复核**到官方页面的逐字片段。

## 目录里有什么

| 路径 | 是什么 | 入库 |
| --- | --- | --- |
| `queue.json` | **确定性队列**：44 条 registry 模型的补日期优先级（排序规则原文写在 `_rule` 字段：unknown 优先 → 可比组规模降序 → tier core>major>long-tail → 引用数降序 → slug code-unit 升序） | ✅ |
| `sources-round1.tsv` / `sources-round2.tsv` | 官方来源抓取清单（`url<TAB>保存名`），**只用官方域**，第三方页一概不进 | ✅ |
| `raw/` | **96 份官方页原件**（HTML / XML / MD），约 37.89 MB | ❌ 见下 |
| `raw-manifest.json` | `raw/` 的**离线索引**：每份原件的文件名 / 字节数 / **sha256** / 抓取时间（UTC）/ 对应官方 URL | ✅ |
| `*.cjs` / `fetch.ps1` | 可复跑脚本：抓取、切片、检索、队列生成、**机械忠实度复核**（`apply-evidence.cjs`） | ✅ |

## `raw/` 为什么不入库

与仓库既有纪律一致（`.gitignore` 里 `research/_raw/v3.0-sources/html|text|domtext` 与
`research/_raw/**/shots/` 的先例），三条理由逐字相同：

1. 是**第三方正文**，版权纪律不入库；
2. 约 **37.89 MB**，与仓库历史不成比例；
3. 可由 URL **重新抓取**。

**唯一的证据不在原件里，而在下面两处**，它们都入库：

- `research/coverage-depth-v1-release-evidence.md` —— 26 行采信表（slug / 官方 URL / 逐字引文 /
  判定 / 采信或否决理由）+ 14 行否决表（含 `month-known-day-unknown` 逐条原文）；
- `scripts/data/models.json` 的 `releaseEvidence` —— 每条 `{field, quote, sourceUrl, capturedAt}`，
  由 `scripts/lib/model-registry.js` 的 `validateRegistry` 强制（官方域、引文非空、capturedAt 真实日期、
  与 `releasedAt` 互为充要）。

## 怎么重新复核

```bash
# ① 原件本身还在本地时：逐个比对 sha256
node research/_raw/coverage-depth-v1/release-evidence/make-raw-manifest.cjs

# ② 原件已不在时：按 raw-manifest.json 的 url 重新抓取，再与清单里的 sha256 对比
#    （官方页随时间变化属正常；此时以采信表里那一条的 quote 与 capturedAt 为准）

# ③ 重新跑一遍机械忠实度复核（引文必须逐字出现在现场抓取的原件里，任一段不命中即整体不写盘）
node research/_raw/coverage-depth-v1/release-evidence/apply-evidence.cjs
```

> `raw-manifest.json` 的 `url` 字段有 68/96 份有值，其中 50 份取自**原件自述**（页面自己的
> `<link rel="canonical">` 或 `<meta property="og:url">`），18 份取自 TSV 清单；剩下 28 份
> （多为 OpenAI 侧，本机对该域为 HTTP 403，原件来自页面内嵌负载的 `raw#source` 渠道）在
> `unmappedFiles` 里**如实列出**，不编造 URL。
