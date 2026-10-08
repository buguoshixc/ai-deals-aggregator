# `post-merge-deploy-v1` · 今日大量合并后的线上 ↔ 本地逐字节复核

> 复核对象：**master 头 `d19017af04051048e0565af6c3675f3faf75cb6a`**（`Merge pull request #78`，提交于 2026-10-08T11:41:15Z）
> 工作树：`.worktrees/post-merge-deploy-v1`（从该提交切出，`npm ci` 装在本工作树内）·
> 证据：[`_raw/post-merge-deploy-v1/`](_raw/post-merge-deploy-v1/) · 装置：`.arch-v1/`（Tier-3）
> **只读**：产物只读；`scripts/` / `docs/` / `NEXT-STEPS.md` / `dist/` / `.github/` 一字未改。

---

## 0. 结论

| 判据 | 读数 |
| --- | --- |
| 干净构建文件数 | **304**（旧 303 + `_notes.ndjson`）✅ |
| 两次构建逐字节一致 | ✅ 全树摘要相同、逐文件差异 **0** |
| 线上 ↔ 本地逐字节对账 | **14/14 相同**（含新产物面 `/_notes.ndjson`）✅ |
| 页面三不变量（13 页） | canonical 自指 **13/13** · 冻结串恰好 1 次 **13/13** · 竖排泄漏 **0/13** ✅ |
| 非 200 / 逐字节不同 | **0 条** |

一句话：**线上（`d19017af` 的那次部署）就是这棵 master 的产物，逐字节相同** —— 包括今天新加的 `_notes.ndjson`。

---

## 1. 干净工作树构建

```
git worktree add .worktrees/post-merge-deploy-v1 <d19017af>      # 从复核对象切出
npm ci                                                            # 51 包，装在本工作树内（绝无 junction）
npm run build                                                     # → dist/（产物自检全过，4.2s）
npm run build -- --out=dist.b2                                    # 第二次构建，另落一处
node .arch-v1/tree-digest.cjs dist      --out=.arch-v1/dist-b1.json
node .arch-v1/tree-digest.cjs dist.b2   --out=.arch-v1/dist-b2.json
```

| | 文件数 | 字节数 | 全树摘要 | 清单摘要 |
| --- | --- | --- | --- | --- |
| 构建 1（`dist/`） | **304** | 20,386,654 | `67d1d0bdcdffe29f1b2bd0185c35408da897d53d20e44c495fec385f7ec1337d` | `2b8fe49fa776a8789e592d79fb507c2c1e9cac233801a9425b4e9e8f55f638de` |
| 构建 2（`dist.b2/`） | **304** | 20,386,654 | **同上** | **同上** |
| 逐文件差异 | — | — | **0 条** | — |

* 文件数 **304 = 303 + 1**，新增的正是本轮要重点看的 `_notes.ndjson`（见 §2 最后一行）。
* ⚠️ 任务书 Verify 里的 `node scripts/tree-digest.cjs dist` **在本仓不存在**（`Test-Path` = false）——
  改用了前几轮同一份 Tier-3 摘要器 `.arch-v1/tree-digest.cjs`（逐文件 sha256 + 全树摘要，算法与 t1/t6 一致）。
  这一点已在证据 `build-digest.json.digestTool` 里注明。

---

## 2. 线上 ↔ 本地逐字节对账（判据 = 响应体 sha256 == 本地 dist 文件 sha256）

读数窗口：**2026-10-08T11:54:23Z – 11:54:49Z**（时间锚见 §4）。全部 14 条的 `x-cache` 都是 **MISS**、`age=0`，
说明每条都是**从源站现取**（不是边缘上的一份旧副本）。

| # | 路由 | HTTP | 字节数 | 线上 sha256（前 16） | 本地 sha256（前 16） | 逐字节相同 | 本地文件 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `/` | 200 | 405,756 | `a4a12094a85214af` | `a4a12094a85214af` | ✅ | `index.html` |
| 2 | `/changes/` | 200 | 112,546 | `5477661c4ba72cad` | `5477661c4ba72cad` | ✅ | `changes/index.html` |
| 3 | `/plans/` | 200 | 98,861 | `dd22bf3dd48921fd` | `dd22bf3dd48921fd` | ✅ | `plans/index.html` |
| 4 | `/plans/coding/` | 200 | 282,427 | `2f593e8742a2d560` | `2f593e8742a2d560` | ✅ | `plans/coding/index.html` |
| 5 | `/plans/api/` | 200 | 237,113 | `2e5a095a87515891` | `2e5a095a87515891` | ✅ | `plans/api/index.html` |
| 6 | `/docs/data/` | 200 | 103,550 | `28b1386b2dbccd9d` | `28b1386b2dbccd9d` | ✅ | `docs/data/index.html` |
| 7 | `/status/` | 200 | 89,196 | `096e1fd06e470d74` | `096e1fd06e470d74` | ✅ | `status/index.html` |
| 8 | `/need/free-api/` | 200 | 122,048 | `62ae8f3d736691a0` | `62ae8f3d736691a0` | ✅ | `need/free-api/index.html` |
| 9 | `/models/deepseek-v3.2/` | 200 | 89,482 | `5c9458a9a968eefc` | `5c9458a9a968eefc` | ✅ | `models/deepseek-v3.2/index.html` |
| 10 | `/vendor/ai360/` | 200 | 97,155 | `314a7f41068e9a42` | `314a7f41068e9a42` | ✅ | `vendor/ai360/index.html` |
| 11 | `/category/agent/` | 200 | 94,764 | `60d647220a96db82` | `60d647220a96db82` | ✅ | `category/agent/index.html` |
| 12 | `/student/` | 200 | 99,529 | `1c77fdbf6c6db785` | `1c77fdbf6c6db785` | ✅ | `student/index.html` |
| 13 | `/feeds/` | 200 | 101,049 | `b08670fb2856e68e` | `b08670fb2856e68e` | ✅ | `feeds/index.html` |
| 14 | **`/_notes.ndjson`** | 200 | **104,591** | **`58a7373b502dbbde`** | **`58a7373b502dbbde`** | ✅ | `_notes.ndjson` |

* 完整的 64 位 sha256、响应头、本地字节数都在证据 `online-check.json` 里逐条可查。
* **`/_notes.ndjson`（本轮新产物面）**：104,591 B · 187 行 · **187 行全部是合法 JSON**（逐行 `JSON.parse` 通过）·
  `content-type: application/octet-stream`（`.ndjson` 的常规类型，不影响逐字节判据）。
* 每一行的 `last-modified` 都是 `Thu, 08 Oct 2026 11:52:48/49 GMT`，与部署结束时刻吻合（§4）。

---

## 3. 页面三不变量（逐条）

判据沿用 t1：`canonical` 必须等于该路由自身的绝对 URL；冻结串
`.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }`
在每页恰好出现 **1** 次；页面里不得出现 `writing-mode: vertical-*` / `sideways-*`。

| 路由 | canonical 自指 | 冻结串次数 | 竖排泄漏 |
| --- | --- | --- | --- |
| `/` · `/changes/` · `/plans/` · `/plans/coding/` · `/plans/api/` · `/docs/data/` · `/status/` · `/need/free-api/` · `/models/deepseek-v3.2/` · `/vendor/ai360/` · `/category/agent/` · `/student/` · `/feeds/`（13 页） | ✅ 13/13 | 1（13/13） | 0（13/13） |
| `/_notes.ndjson` | 不适用（不是页面） | 不适用 | 不适用 |

---

## 4. 非 200 / 逐字节不同：**本轮 0 条**，以及判定口径

* 本轮**没有**出现任何非 200，也没有任何一条逐字节不同 ⇒ 不需要走「先报差异」的分支。
  为免下一轮重复争论，口径写在这里：**非 200 或不同时，先报 captain（附差异摘要）、原样记录、
  不自行归因、不用重试掩盖**，并用 `Deploy` run 的终态当时间锚，区分「部署尚未完成」与「真的不一致」。
* **时间锚（证明读数对应的是哪一次部署）**：

| 项 | 值 |
| --- | --- |
| 复核对象 | `d19017af`（提交于 11:41:15Z） |
| 它的 master gate | run **#190** → success（11:45:57Z） |
| 它的 Deploy | run **#157** → **success（11:52:55Z）** |
| 线上读数的 `last-modified` | 11:52:48Z（与 #157 的结束时刻吻合） |
| 本次读数窗口 | **11:54:23Z – 11:54:49Z**（在 #157 之后、下一次部署完成之前） |
| 读数之后 master 又前进 | `557095875f`（11:53:15Z，Deploy #158 当时在跑）· `4ecfb9db`（11:55:02Z，复核期间的当前头） |

* **上一轮的 503 瞬态按同一口径登记**（不重复调查、不命名成因）：`/category/agent/` 曾在 2026-10-08
  ＊部署完成后约 56 秒＊出现过一次 `503 · 54,887 B · sha256 27927b33…`，**响应体未留存**、
  成因**未归因**；同路由随后 4/4 探测 200。本轮该路由（#11）**200 且逐字节相同**。
  两次读数都只是各自时刻的观测，**不互相解释**。

---

## 5. 本轮**没有**证明的东西（这次复核**不能**证明什么）

1. **抽样范围**：只对了 **14 条**目标（13 页 + 1 个数据文件）。产物共 **304** 个文件（其中 186 个页面），
   未抽到的路由**没有**被这次复核覆盖 —— 「线上 == 本地」这句话只对这 14 条成立。
2. **CDN 边缘**：每条读数只打在**一个**边缘节点、**一个**时刻（全部 `x-cache: MISS` ⇒ 都是现取源站，
   这提高了「读到的是源站当前内容」的把握，但**没有**多点/多时刻采样 ⇒ 「所有边缘都已一致」**未证明**。
3. **出口区域**：本机出口是单一地区，没有换出口/换 DNS 复测 ⇒ 区域差异**未证明**。
4. **时序**：master 在复核期间又前进了两次（`557095875f` / `4ecfb9db`）。本轮证明的是
   「**`d19017af` 的那次部署** == `d19017af` 的本地构建」，**不是**「当前 master 头的部署已就位」。
5. **内容正确性**：逐字节相同只回答「线上跑的是不是这一版字节」，**不回答这一版内容对不对**
   （那由 880 项 verify-site / 39 项 check:ci 等门禁承担）。
6. **`_notes.ndjson` 的语义**：本轮只证明了它**逐字节一致**且 187 行都是合法 JSON；
   「清单里每一条说明都对应页面上真实存在的一条」这类**跨源对账**不在本任务射程。
7. **两次构建一致 ≠ 跨环境一致**：两次构建都在同一台机器、同一个 Node/浏览器版本上完成；
   没有做跨平台/跨 Node 版本的构建比较。

---

## 6. 复跑命令

```powershell
git worktree add .worktrees/pmd <master-sha>; cd .worktrees/pmd
npm ci; npm run build; npm run build -- --out=dist.b2
node .arch-v1/tree-digest.cjs dist      --out=.arch-v1/dist-b1.json
node .arch-v1/tree-digest.cjs dist.b2   --out=.arch-v1/dist-b2.json
node .arch-v1/post-merge-online-check.cjs --out=.arch-v1/online-check.json       # 14 条目标的逐字节对账
npm run check:evidence
```
