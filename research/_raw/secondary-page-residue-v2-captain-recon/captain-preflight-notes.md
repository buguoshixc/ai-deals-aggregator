# captain-preflight-notes —— 队长在 t1 之前的独立预读与终验基线（v2 · worktree）

> v2 worktree：`.worktrees/secondary-page-residue-v2`（分支 `secondary-page-residue-v2`，基线 `f091ac4`）
> 主检出那份同名文件（`<主检出>/research/_raw/secondary-page-residue-v2-captain-recon/`）是**只读的
> 第一版预读**（扫的是主检出 `dist/`）；这一份是 worktree 版，追加了终验用的基线读数。
> 复现：`node research/_raw/secondary-page-residue-v2-captain-recon/dataplane-hash.cjs`

## 0. 这份文件的作用

本轮的「数据面逐字节」验收要证明的是**只有被授权的文件变了**。为此需要在**写入之前**取一份
全量 sha256 基线，写入之后逐条比对。基线不是结论，是**判据**。

## 1. 数据面全量基线（写入前）

- 文件：`dataplane-pre-t9.sha256.txt`（**115 个文件**：根目录 `*.json|*.txt|*.xml` + `scripts/data/**` + `dist/feed/**`(48) + `dist/{sitemap.xml,robots.txt,deals.json,plans.json,api-plans.json,models.json,index.html}` + `dist/data/**`）
- 采集时刻：2026-10-09T06:53:12Z（CST 14:53）
- 覆盖范围的选择理由：`dist/` 下的 HTML 不在其中（本轮**就是要改页面文案**，它们必然变）；
  数据面要防的是「顺手改了数据 / 改了 Feed 字节」这类**看不见的**改动。

关键锚点（写入前）：

| 文件 | sha256（前 16） |
|---|---|
| `deals.json` | `290cc082428ac82b` |
| `plans.json` == `dist/plans.json` | `1668d19cadbce7e2` |
| `api-plans.json` == `dist/api-plans.json` | `30fdf7b8758d2aea` |
| `models.json` == `dist/models.json` | `c6ea15477a85c18b` |
| `dist/sitemap.xml` | `57beecad6443697e` |
| `dist/robots.txt` == `robots.txt` | `1bbde8cde94f43b2` |
| `dist/deals.json` | `af6944addb170f5d` |
| `dist/data/index.json` | `82e495f6b2322e94` |
| `model-registry-links.json` | `0eb038d925066374` |

## 2. 本轮**被授权**的数据面改动（只有这一个）

| 文件 | 改什么 | 授权来源 |
|---|---|---|
| `deals.json` | **17 条** `description` 删「（无头浏览器渲染后提取）」整括号 | 队长裁定（t9 任务）：渲染层遮盖会让字符串仍留在数据里 ⇒ 改真源 |
| `scripts/collectors/headless.js` | 3 处模板同步去括号（防回流到源头） | 同上 |

**其余 113 个文件必须逐字节不变**（含 `dist/feed/**` 全部 48 个、`scripts/data/**` 全部）。
`dist/deals.json` 与 17 个 `/deal/*/index.html` 会随之改变 —— 它们是 `deals.json` 的下游，属**同一处授权**的必然结果，收口时逐条列出。

## 3. 一些口径提醒（都来自本轮的实测教训）

1. **元素数 vs 行数**：v1 普查表头写的 `.dsrc-note` 165 是**行数**（去重后的文案条数各自的页数之和），
   真实元素数 **162**（80 + 80 + **2**）。本轮一律用元素数。
2. **`（无头浏览器渲染后提取）` 有 18 个产物承载点**：17 个 `/deal/*/index.html` + `dist/deals.json`。
   收口判据是「`dist/**` 里 0 次」，**不许**记为「已知承载」。
3. **`最终以厂商官方页面为准。` 裸短语在别处合法存在**（`plan-history.js` 的「不表示厂商已经下架…」
   是 C 类口径）。牙要按**整句 + 剥标点归一**锚定，不能按裸短语。
4. **`无头浏览器渲染` 宽口径 35 次里 17 次是合法标签行**（`.dsrc` 的「采集方式：无头浏览器渲染」）。
   牙必须用**整括号**。
5. **「去分号的 `最终以厂商官方页面为准。`」的那处合法存在是 `plan-history.js`，不是
   `PLANS_HUB_NOTES[3]`** —— t3 的注释把归因写错了，已由队长改正（这正是它当时判「本轮不动」的原因）。
