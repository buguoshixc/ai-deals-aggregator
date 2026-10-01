# v3.0 官方来源取证目录（`research/_raw/v3.0-sources/`）

> 本目录是 **v3.0 数据扩充（题面 Stage C）** 的取证现场。它属于 `research/_raw/`，
> 按本仓既有纪律：**只入结构、索引与工具，不入原始第三方正文**（同 `research/_raw/**/shots/` 的处理）。

## 入库的内容（可复跑、可核对）

| 文件 | 作用 |
|---|---|
| `index.json` | **40 个官方来源的离线索引**：`slug` / `provider` / `stage` / `url` / `checkedAt` / `static`（静态抓取实测）/ `render`（无头渲染实测）。**不含任何本机绝对路径** |
| `probe.js` | 抓取器：静态 + 无头双路，把每个来源存成三份快照（见下） |
| `build-candidates.js` | 把快照整理成候选清单 |
| `validate-candidates.js` | 用**生产同一套 schema** 试算候选，构造问题 / 引文丢弃必须为 0 |
| `candidates.backup.json` / `adopted.backup.json` | 候选与采信清单的备份快照 |
| `probe.log` | 抓取过程的原始日志 |

## **不入库**的内容（`.gitignore` 已排除）

每次 `probe.js` 运行会在本目录下生成三类**原始快照**：

```
html/      # 官方页面的原始 HTML（40 份，约 21 MB）
text/      # 纯文本提取（40 份，约 0.3 MB）
domtext/   # DOM 文本提取（40 份，约 0.6 MB）
```

**为什么排除**：① 它们是**第三方的正文内容**，本仓的版权纪律是"不入库第三方正文"；
② 体积（21 MB+）与仓库历史不成比例；③ 它们是**可重新生成的派生物**，不是唯一的证据 ——
唯一的证据（官方 URL + 检查日期 + 实测数字 + 失败原因）已经完整落在
`index.json` 与 `research/v3.0-source-candidates.{md,json}` 里。

## 怎么重新生成这些快照

需要联网（部分站点需要无头浏览器）：

```bash
node research/_raw/v3.0-sources/probe.js
```

真浏览器内核由 `playwright-core` 提供；若 `verify-site.js` 那类脚本需要指定路径，
用 `DSH_EDGE=$(node -e "process.stdout.write(require('playwright-core').chromium.executablePath())")`。

## 采信与未采信的结论落在哪

- **候选未采信登记表（题面 §C3）**：`research/v3.0-source-candidates.md` / `.json`
  —— 逐条写 provider / URL / 检查日期 / 失败原因 / 是否 JS / 是否登录态 / 是否动态分页 /
  官方页是否下线 / 是否信息不完整。
- **已采信清单**：`research/v3.0-adopted-candidates.md` / `.json`。
- **覆盖报告**：`npm run report:coverage`（已登记进 CI 门禁）。
