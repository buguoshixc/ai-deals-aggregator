# t9 证据：`.ddesc` 采集方式（A 类 17 条）改真源落地

> 执行者 deal-copy · attempt `81558002-2af2-4696-af0f-6eb36e0e9300` · 工作树 `.worktrees/secondary-page-residue-v2`（基线 f091ac4）
> 队长裁定：执行「选项 ② 改真源」，不授权渲染层归一。冻结**收窄**为：`deals.json` 的 17 条 `description` 是唯一被授权的数据面改动。
> 本目录的 `.cjs/.txt` 被 `.gitignore`（Tier-3 规则）挡住 ⇒ **只有本 README 可入库**；原始清单/日志可用下方命令重算。

## 1. 逐条改动表（6 行 = 3 行采集器 + 17 行数据，同批）

### 1.1 根因（防回流）：`scripts/collectors/headless.js` 3 处

| 行 | 改前 | 改后 | Δ |
|---|---|---|---|
| 132 | `description: '来源：智谱开放平台官方价格页营销位与活动说明（无头浏览器渲染后提取）。'` | `description: '来源：智谱开放平台官方价格页营销位与活动说明。'` | −12 |
| 298 | `description: '来源：火山方舟产品页「免费额度」表（无头浏览器渲染后提取）。',` | `description: '来源：火山方舟产品页「免费额度」表。',` | −12 |
| 313 | `description: '来源：火山方舟产品页「最新活动」区（无头浏览器渲染后提取）。'` | `description: '来源：火山方舟产品页「最新活动」区。'` | −12 |

### 1.2 存量订正：`deals.json`（仓库根）17 条 `description`

| 行 | 改前 | 改后 | Δ |
|---|---|---|---|
| 3851 | `"description": "来源：智谱开放平台官方价格页营销位与活动说明（无头浏览器渲染后提取）。",` | `"description": "来源：智谱开放平台官方价格页营销位与活动说明。",` | −12 |
| 3933 | 同上 | 同上 | −12 |
| 4015 | 同上 | 同上 | −12 |
| 4075 | 同上 | 同上 | −12 |
| 4135 | `"description": "来源：火山方舟产品页「免费额度」表（无头浏览器渲染后提取）。",` | `"description": "来源：火山方舟产品页「免费额度」表。",` | −12 |
| 4188 | 同上 | 同上 | −12 |
| 4241 | 同上 | 同上 | −12 |
| 4294 | 同上 | 同上 | −12 |
| 4347 | 同上 | 同上 | −12 |
| 4400 | 同上 | 同上 | −12 |
| 4453 | 同上 | 同上 | −12 |
| 4506 | 同上 | 同上 | −12 |
| 4559 | 同上 | 同上 | −12 |
| 4612 | 同上 | 同上 | −12 |
| 4665 | `"description": "来源：火山方舟产品页「最新活动」区（无头浏览器渲染后提取）。",` | `"description": "来源：火山方舟产品页「最新活动」区。",` | −12 |
| 4726 | 同上 | 同上 | −12 |
| 5361 | `"description": "来源：智谱开放平台官方价格页营销位与活动说明（无头浏览器渲染后提取）。",` | 同 3851 改后 | −12 |

- 分组：**5 × 智谱 / 10 × 火山「免费额度」表 / 2 × 火山「最新活动」区 = 17**（与派单一致）。
- 被删片段统一为 12 字整括号「（无头浏览器渲染后提取）」；`来源：…` 出处指针保留。
- **逐条核对（`verify-source.cjs`，exit 0）**：`deals.json` 改动行 17、`headless.js` 改动行 3，**每行都是纯删括号**（`含非纯删括号的改动行 = 0`）；把 HEAD 全文里的整括号全部删掉后 **=== 现文件全文**（两文件都 true）；现文件残留括号 0。
- **没有第 18 条**：全仓（排除 `research/` 历史证据、`node_modules`、`.git`、`dist/`）该括号命中 = `deals.json` 17 + `headless.js` 3，别处 0。

## 2. 五项验收原始读数

| # | 命令 | 退出码 | 读数 |
|---|---|---|---|
| ① | `node -e`（扫 `dist/**` 全部 304 文件） | **0** | **命中 0 次**（改前 18 个文件：17 个 `/deal/*/index.html` + `dist/deals.json`） |
| ②a | `npm run build` | 0 | ✅ 产物自检通过（186 页 · 详情页 80 · sitemap 183 · 订阅 50 文件 472 条 · 说明清单 523 条） |
| ②b | `npm run verify:seo` | 0 | ✅ SEO 验收 19 项 / 失败 0 项 |
| ②c | `npm run check:reproducible` | 0 | ✅ deals.json 可重建：孤儿值 0 / 凭空出现 0 / provenance 漂移 0 / 值字段漂移 0 / 引文漂移 0 |
| ②d | `npm run test:strict` | 0 | ✅ 校验通过（strict 模式） |
| ②e | `npm run selftest:audience` | 0 | ✅ 206 项通过 / 0 失败（B 类 2 行未被回退，实测仍在） |
| ②f | `npm run selftest:provenance` | 0 | ✅ 132 项通过 / 0 失败 |
| ④ | `node floor-check.cjs` | 0 | 17 页余量全部 > 0；**最小 639**（`/deal/adcb6471a512/`、`/deal/ead998e58cd9/`，chars 1139 − floor 500）；改前 = 改后 + 12 ⇒ baseline 最小 651（与 census 的 651 吻合） |
| ⑤ | `node scripts/tools/verify-site.js --dir=dist` | 0 | **✅ 验收 892 项，失败 0 项**（覆盖到 ⑨ 以后的全部 26 节） |

## 3. 数据面逐字节对照表（baseline 构建 vs 终态构建，各 363 条清单）

方法：把 `deals.json` + `headless.js` 回退到 HEAD → 构建得 baseline 清单；还原改动 → 再次构建得终态清单。**两次构建之间只有这 6 行动**，因此差异可 100% 归因于本轮改动。

| 文件 | 改前 sha256(前 16) | 改后 | same |
|---|---|---|---|
| `deals.json`（**授权改动**） | `290cc082428ac82b` | 变化 | ✗ 授权 |
| `dist/deals.json`（**授权改动**） | `af6944addb170f5d` | 变化 | ✗ 授权 |
| `plans.json` | `1668d19cadbce7e2` | 同 | ✅ |
| `api-plans.json` | `30fdf7b8758d2aea` | 同 | ✅ |
| `models.json` | `c6ea15477a85c18b` | 同 | ✅ |
| `model-registry-links.json` | `0eb038d925066374` | 同 | ✅ |
| `dist/sitemap.xml` | `57beecad6443697e` | 同 | ✅ |
| `dist/robots.txt` | `1bbde8cde94f43b2` | 同 | ✅ |
| `dist/data/index.json` | `82e495f6b2322e94` | 同 | ✅ |
| `dist/deal-history.json` | `563bcfd0e00e3211` | 同 | ✅ |
| `dist/plan-history.json` | `8c0003aa37521c86` | 同 | ✅ |
| `dist/api-plan-history.json` | `f4dc9710bfca3b3c` | 同 | ✅ |
| `dist/deal-plan-links.json` | `a22ea742e25adfc2` | 同 | ✅ |
| `dist/model-registry-links.json` | `0eb038d925066374` | 同 | ✅ |
| `dist/source-health.json` | `b32bdb409995a6db` | 同 | ✅ |
| `dist/_notes.ndjson`（说明清单） | `8964efe47a20021c` | 同 | ✅ |
| `dist/feed.json` / `dist/feed.xml` | — | 同 | ✅ |
| `dist/feed/**`（48 = 24 `.json` + 24 `.xml`） | — | 48/48 同 | ✅ |

- **总差异 19 个文件**：`deals.json` + `dist/deals.json` + **17 个 `/deal/*/index.html`**；**非 `/deal/` 的 HTML 差异 0**。
- Feed 相关产物合计 50 个（`dist/feed/**` 48 + `dist/feed.json` + `dist/feed.xml`）**全部逐字节不变**。

## 4. 复现

```powershell
cd .worktrees/secondary-page-residue-v2
node research/_raw/secondary-page-residue-v2-t9/verify-source.cjs    # 逐条纯删核对
node research/_raw/secondary-page-residue-v2-t9/floor-check.cjs      # 17 页余量
node research/_raw/secondary-page-residue-v2-t2/manifest.cjs out.txt # 363 条全量 sha256
node -e "…扫 dist 里「（无头浏览器渲染后提取）」"                      # 收口判据：0
npm run build; npm run verify:seo; npm run check:reproducible; npm run test:strict
npm run selftest:audience; npm run selftest:provenance
node scripts/tools/verify-site.js --dir=dist
```
