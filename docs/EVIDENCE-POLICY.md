# 证据政策（Evidence Policy）

> **这份文档回答三个问题**：什么进 Git、什么进 CI Artifact、什么只留本机。
> 它**只约束未来**：本轮**不重写 Git 历史**，也不把已入库的历史证据搬走或删除。
> 判据是可执行的 —— `npm run check:evidence`（`scripts/tools/check-evidence.js`）。

---

## 0. 为什么需要它（实测）

| 项目 | 实测值（基线 `e0ca04a`） |
|---|---|
| `research/` 已跟踪文件 | **2,190 个** |
| 其中 `research/_raw/` | **1,012 个**（开局时）→ 基线时更多；含 `coverage-depth-v1` 单目录 **549 个 / 18.7 MB** |
| 按 Tier-3 类别统计已跟踪文件 | `.txt` **788** · `.log` **196** · `.cjs` **299**（一次性探针） |
| 三者合计（grandfather） | **1,283 个** |
| `research/_raw/` 磁盘占用 | 1,405 个文件 / **104.4 MB**（开局时） |

三类东西被混在一起进了 Git：

1. **结论**（报告、判定表、逐字引文）—— 应该永久保留；
2. **大体积可再生产物**（抓下来的第三方正文、浏览器 trace、完整日志）—— 应该进 CI Artifact；
3. **一次性过程产物**（探针脚本 `.cjs`、中间 dump `.txt`、`scratch/`）—— 只该留在本机。

后果不只是仓库变大：`.gitignore` 里已经积累了**逐目录白名单**（`research/_raw/v3.0-sources/html/`、
`research/_raw/coverage-depth-v1/release-evidence/raw/`、`research/_raw/**/shots/`…），
每开一个新任务就要人工补一条 —— 而漏补的症状是「几十 MB 的第三方正文静默进了仓库」，
没有任何门禁会红。这份政策把「打地鼠」换成**按类别**的规则 + 一条机器判据。

---

## 1. Tier 1 —— 进 Git，永久保留

**只有结论与可复跑的判据**：

- `research/<版本>-report.md`、`-self-audit.md`、`-acceptance.md`（本轮的报告、自审、验收）
- 结论性摘要：判定表、逐条采信/否决表、缺口清单（`.md`）
- **关键失败证据**：证明某个缺陷真实存在过的最小片段（不是整份日志）
- **可复跑脚本**：重新产出上面那些数字所必需的脚本（`research/_raw/<task>/*.cjs` 中被 README 引用者）
- 离线索引：`README.md` / `INDEX.md` / `manifest.json`（文件名 + 字节数 + sha256 + 抓取时间 + 自述 URL）
- 少量关键 JSON 摘要（例如 `research/v3.0-source-candidates.json`）

**判据（进 Git 前自问）**：删掉它，还能不能在未来重新得出同一个结论？不能 ⇒ Tier 1。

---

## 2. Tier 2 —— 进 CI Artifact，不进 Git

**大体积、可再生产、且只有排查时才有人看的东西**：

- 大 JSON（逐页几何快照、mutation 原始输出）
- 浏览器 trace / 截图（`research/_raw/**/shots/` 已有同名规则）
- 完整构建与门禁日志
- 抓下来的第三方正文原件（版权纪律：不入库）
- Full Gate 的机器可读报告（`verify-site.js --json=` 的输出）

**落到哪里**：`.github/actions/gate/action.yml` 的 `upload-artifact` 步骤（retention 14 天）。
**本地对应物**：`.arch-v1/`、`dist.*`、`.qc-*`、`research/_raw/**/shots/` —— 都已在 `.gitignore` 里。

---

## 3. Tier 3 —— 只留本机（`gitignore` 按类别拦）

- 一次性探针脚本（`.cjs`）：结论进 Tier 1 之后脚本就没有保留价值，除非 README 点名引用
- 中间 dump / 抓下来的文本（`.txt`）、日志（`.log`）
- `scratch/`、临时构建目录、变异副本、生成的基线

**`.gitignore` 的类别规则**（取代逐目录白名单）：

```gitignore
research/_raw/**/*.txt
research/_raw/**/*.log
research/_raw/**/*.cjs
research/**/scratch/
```

---

## 4. 为什么不依赖「记得别 add」

`.gitignore` 只能拦**没被跟踪**的文件；一个已经 `git add` 的文件不会因为它被忽略而消失。
所以真正的防线是**一条机器判据**：

```
npm run check:evidence
```

它做两件事：

1. 取 `git ls-files`（当前**已跟踪**的全部文件）里匹配 Tier-3 类别的那些；
2. 与**基线清单** `scripts/data/evidence-tier3-grandfather.txt` 比对 ——
   清单里有的，**登记为 grandfather，不报错**（这条政策只管未来）；
   清单里没有的（= 基线之后**新进**的），**硬失败**并打印文件名与正确去向。

于是「新任务把 20 MB 探针 dump 提交了」会在门禁里红，而不是等仓库涨到 100 MB 才有人发现。

### 4.1 为什么清单要**提交进仓库**（一条真实的踩坑）

第一版直接跑 `git ls-tree -r <baseline>` 取基线集合：**本地全绿，CI 立刻红** ——
`actions/checkout@v5` 默认 `fetch-depth: 1`（浅克隆），基线提交根本不在那个克隆里。
工具当时**按设计拒绝静默放行**（这一步是对的：判不了就宁可拦住），
但结果是门禁在 CI 里跑不起来 —— 一个「只在本地成立的门禁」等于没有门禁。

改成提交一份**基线清单**（像 lockfile）之后：

- CI 不需要历史 ⇒ 判据在**没有历史**的地方也**全强度**生效（新文件照样被拦，已用负例实测）；
- 清单是**可评审的基线产物**：改它是一次显式、可见的 diff；
- 本地（有完整历史时）**额外自证**清单没被悄悄改过 ——
  把清单与 `git ls-tree -r <baseline>` 的 Tier-3 交集逐项比对，不一致即红；
  这一步在浅克隆里会**明确打印「跳过 + 原因 + 影响范围」**，而不是假装跑过。

有意改基线时：`node scripts/tools/check-evidence.js --write`（需要完整历史）并单独提交说明原因。

---

## 5. grandfather 名单（本轮不做的事）

基线 `e0ca04a` 时已跟踪的、按本政策属于 Tier-3 的文件**全部保留、不删、不 untrack**
（数字由 `npm run check:evidence` 实测打印，不是估的）：

| 类别 | 数量 |
|---|---|
| `research/_raw/**/*.txt` | 788 |
| `research/_raw/**/*.log` | 196 |
| `research/_raw/**/*.cjs` | 299 |
| `research/**/scratch/` | 0 |
| **合计** | **1,283** |

**为什么不清理**：① 本轮的目标是架构现代化，不是删证据（删证据会让历史报告里的引用失效）；
② `git rm` 一批文件等于在历史里制造一处「证据消失」，与「不重写历史」同一条纪律；
③ 每条结论都已在 `research/*.md` 里，原件的价值随时间递减 —— 所以「只拦未来」是正确的最小动作。

> 如果将来要真正瘦身，那是一次**独立决定**：需要逐目录给出「结论已自足、原件可弃」的证明，
> 并接受 `research/_raw/**` 里所有历史引用失效。本政策不授权这件事。

---

## 6. 新增任务时的操作顺序（4 步）

1. **边做边把过程产物写进 `scratch/` 或 `.arch-v1/`**（已经被忽略）；
2. 需要留存的原件放 `research/_raw/<task>/`，并在同目录写 `README.md`：
   它是什么、从哪来、sha256、为什么留；
3. **结论**写进 `research/<task>-report.md`（Tier 1）；
4. 提交前跑 `npm run check:evidence` —— 它会告诉你有没有 Tier-3 文件混进来。
