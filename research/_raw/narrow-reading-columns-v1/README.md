# `research/_raw/narrow-reading-columns-v1/` · 这一轮的原始读数

> 轮次 `narrow-reading-columns-v1`（2026-10-08）· 主题：**「保留窄阅读列」变成可失败的登记制**，
> 并让 `.pdetailbody` 按 `docs/DESIGN-RULES.md` **S4** 居中。
> 人读报告：[research/narrow-reading-columns-v1-report.md](../../narrow-reading-columns-v1-report.md) ·
> 独立复核：[research/narrow-reading-columns-v1-self-audit.md](../../narrow-reading-columns-v1-self-audit.md)

## 文件索引

| 文件 | 是什么 | 规模 |
| --- | --- | --- |
| `geometry.json` | 门禁切片：ch 窄列普查 · `.pdetailbody` 居中几何与隔离牙 · M16 三条断言 · 适用范围自检逐字 | 6 KB |
| `registry.json` | `scripts/data/narrow-reading-columns.json` 的**逐字副本**（证据侧的静态快照，便于对照当时登记了什么） | 1 KB |
| `pr-body.md` | PR 正文存档（与线上逐字一致） | 文本 |
| `release.json` | 发布读数（PR / CI / 合并 / Deploy / 线上冒烟） | 1 KB |

**大报告与日志留在 Tier-3（`.arch-v1/`，gitignore）**：`nrc-after.json`（874 项 / 0 失败，改后）、
`vn-digest-A.json`（改前产物逐文件摘要）· `nrc-digest.json`（改后）· `full-gate.json`。
复跑命令见报告 §6。
