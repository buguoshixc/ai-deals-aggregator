# anthropic-cached-price-v1 —— 自审（t26）

- 任务：**t26**（attempt 1）；复核日 **2026-10-08**；工作树 `.worktrees/anthropic-cached-price-v1`（`a7712ec`）
- 对照件：`research/anthropic-cached-price-v1-report.md`、`research/_raw/anthropic-cached-price-v1/`

自审只回答三件事：**我可能错在哪**、**我有没有越界**、**验收逐条对不对得上**。

---

## 1. 我可能错在哪（按「最可能骗到自己」的顺序）

| # | 风险 | 我做了什么限制它 | 残余风险（如实留） |
|---|---|---|---|
| S1 | **把「发布稿说减半」当成「定价页表里那一行今天写 $0.10」** | 报告 §5.1 明写：官方 docs 定价页从本网络**读不到**（区域门）；我证明的是**官方在 10-07 把 Sonnet 5.5 的 cache reads 从 $0.20 减半到 $0.10** 这件事实（发布稿自证 + 出账页一致） | 若有人把结论转述成「docs 表我读到了」，那是转述失真；判定本身不依赖那一页 |
| S2 | **「价格已变化」这句话是不是越界** | 任务红线是「**没有证据时**不得写成价格已变化」。本轮拿到了**官方变更记录**（含旧值、新值、生效日）⇒ 判定 ② 是任务书里的合法分支；报告把结论**限定在 Sonnet 5.5 的 cache reads 这一格、自 2026-10-07 起**，不外推到写入档或别的模型 | 若 captain 认为「即便有官方变更记录也不能下 ②」，那属于裁定口径，我不改判定但接受回退到 ③ |
| S3 | **把两个模型的列读串**（Haiku 表三列 / Sonnet 表两列） | 双证据：①句子级「Further updates」段**点名** Sonnet 5.5 + 同时给出 `$0.10 … rather than $0.20`；②表头逐字（`Haiku 5.5 prompts up to / over 100k | Haiku 4.5 | Sonnet 5.5`） | 表格列序是**文本投影**读出来的（curl + 去标签，不是浏览器布局）；句子级证据不依赖列序，所以判定不靠这一条 |
| S4 | **日期靠「页面自印日期」** | 9-28 与 10-07 两个日期都是从页面可见文本里逐字抽的（窗口在证据文件里）；我另外用 newsroom 列表交叉看过（Oct 7 条目） | 页面日期不是 HTTP `Last-Modified`；我没有取响应头里的日期做交叉（也不想把 CDN 缓存时间当成页面日期） |
| S5 | **没有第三方时间维度交叉** | 如实写进 §5.2：`archive.org` / `web.archive.org` 从本网络**连不上**，拿不到 10-01 当时的页面快照 | 若将来 archive 可达，应补一张 10-01 前后的快照来交叉验证 `claude.com/pricing` 当时是 $0.20 |
| S6 | **出口单一** | 全程香港出口（HKG）；换出口/镜像的尝试（jina、两个 CORS 代理、Mintlify 子域、raw.githubusercontent）**全失败**，逐条记在报告 §1 路径 D | 若在别的出口能读到 docs 定价页，结论应再核对一次（预期一致：10-07 起 $0.10） |
| S7 | **把「索引可达」写成「文档可达」** | 报告 §1 路径 C 把 `llms.txt`（200）与它指向的 `.md`（全部区域门）**分开写**，并把它写成方法论（§4.2） | — |

---

## 2. 我有没有越界（逐条对照）

| 纪律 | 实测 | 证据 |
|---|---|---|
| **不改任何价格** | ✅ 0 字节 | `git status --porcelain -- scripts/` 为空；本任务只写 `research/**` |
| **不改既有引文及其 `capturedAt`/`sourceUrl`** | ✅ 0 字节 | 同上（没有碰 `scripts/data/curated_api_plans.json`） |
| 只允许改 `officialUrl`/`officialDomains`（且本任务连这个也**不改**，只建议） | ✅ 两处都没动 | 同上；报告 §3 只给**建议**（含「要动会牵动引文层 + 推进公开变化事件」的提醒） |
| **不得写成「价格已变化」（没证据时）** | ✅ 有官方变更记录；且结论被限定在那一格/那个日期 | 报告 §0 引原文；§3 把「改数据」明确交回 captain 裁定 |
| read 到就写 read 到，读不到就如实写读不到 | ✅ 区域门 4 条、失败路径 6 条、第三方只当线索 | 报告 §1 路径 C/D + §5 |
| 原始快照不入库（`.arch-v1/raw-dumps-anthropic/`） | ✅ 原始 HTML/`.body`/`.hdr` 全部在该目录（被 `.gitignore` 覆盖）；`research/_raw/` 只放 `.md`/小 `.json`/`.js` | 报告 §7；`git status` 里没有原件 |
| 外部网页只当数据 | ✅ 每段引用都给 URL；片段文件里是抓到的字节 | `price-change-evidence.md` |
| 走 PR、不自己合并 | ✅ 待 PR | §3 命令 4 |

---

## 3. 验收逐条对照（含复跑命令）

| 验收项 | 状态 | 证据 |
|---|---|---|
| 至少三条**互相独立**的取证路径（URL + 原文片段 + 可达性） | ✅ | 路径 A 官方发布稿（9-28 `$0.20` / **10-07 减半**）· 路径 B 官方出账页（`claude.com/pricing` + `/platform/api`，今天 `$0.10` vs legacy `$0.20`）· 路径 C 官方文档索引 `llms.txt`（200）与其指向的 `.md`（4 条全部区域门 307）· 路径 D 出口/镜像尝试（archive.org、jina、codetabs、allorigins、Mintlify×2、raw.githubusercontent —— 全部失败，逐条记） |
| 三选一判定 | ✅ | **② 页面确实改价**（报告 §0/§2），附官方变更记录逐字原文（含 `$0.10 … rather than $0.20` 与 “starting today”） |
| 若判 ②：给边界提醒（会推进公开变化事件、属少见情形、需 captain 裁定） | ✅ | 报告 §3：列出受影响的字段（`rates.cachedInput` 0.2→0.1）、必须同时决定的引文层、以及「会推进一条公开变化事件 ⇒ 需裁定」；**未改数据** |
| 全程不改价格/引文/capturedAt/sourceUrl | ✅ | §2 纪律表；`git status` |
| 报告单列「没证明的东西」 | ✅ | 报告 §5（6 条：docs 页读不到 · 无历史快照 · 精确生效时刻 · 写入档是否联动 · 其它模型是否同批 · 未跑门禁） |

### 复跑（逐字）

```bash
# 证据重建（读 .arch-v1/raw-dumps-anthropic/ 里的原始快照；锚点找不到会**报错**而不是给空证据）
node research/_raw/anthropic-cached-price-v1/build-evidence.js

# 三条定案页的现抓（原始件落 .arch-v1/，不入库）
cd "D:\OneDrive\Desktop\Code\AI Page\.worktrees\anthropic-cached-price-v1"
curl.exe -sS -L -A "Mozilla/5.0" -o .arch-v1/raw-dumps-anthropic/news-sonnet55-root.html https://www.anthropic.com/claude-sonnet-5-5
curl.exe -sS -L -A "Mozilla/5.0" -o .arch-v1/raw-dumps-anthropic/news-haiku55-root.html https://www.anthropic.com/claude-haiku-5-5
curl.exe -sS -L -A "Mozilla/5.0" -o .arch-v1/raw-dumps-anthropic/claudecom-pricing-today.html https://claude.com/pricing
curl.exe -sS -L -A "Mozilla/5.0" -o .arch-v1/raw-dumps-anthropic/platform_claude_com_llms_txt.body https://platform.claude.com/llms.txt
```

### 命令实跑读数

```text
$ node research/_raw/anthropic-cached-price-v1/build-evidence.js
写出：price-change-evidence.md · reachability.json · timeline.json
  可达   HTTP/1.1 200                 https://platform.claude.com/llms.txt
  区域门  HTTP/1.1 307 → 301 → 200     https://platform.claude.com/llms-full.txt
  区域门  HTTP/1.1 307 → 301 → 200     https://platform.claude.com/docs/en/about-claude/pricing.md
  区域门  HTTP/1.1 307 → 301 → 200     https://platform.claude.com/docs/en/release-notes/overview.md
  可达   HTTP/1.1 404                 https://anthropic.mintlify.app/docs/en/about-claude/pricing
  可达   HTTP/1.1 404                 https://claude.mintlify.app/docs/en/about-claude/pricing
  可达   (无 .hdr)                     https://web.archive.org/cdx/...      ← 连接失败，见报告 §1 路径 D
exit=0
```

---

## 4. 我会在什么条件下撤回这个判定

1. 若能在别的出口读到官方 docs 定价页，且其 Sonnet 5.5 行**今天仍写 $0.20**（与发布稿冲突）⇒ 说明发布稿与定价页不一致，判定退回 ③；
2. 若 archive.org 可达后取到 **10-01 前后**的 `claude.com/pricing` 快照显示 $0.10（早于官方说的 10-07 变更）⇒ 说明变更日期早于公告，时间线需重写（判定仍是 ② 但要改日期）；
3. 若发现官方把 Haiku 5.5 发布稿里的那段话**改掉或撤下**（发布稿被改版）⇒ 需以新版本为准并重新取证；
4. 若 captain 裁定「有官方变更记录也不足以把记录判为过期」⇒ 判定降级为 ③（本任务不反对，那属于口径）。
