# t2 证据：/deal/* `.dsrc-note` 尾半句删除（文案实现 A）

> 执行者 deal-copy · attempt `d9dbc917-c496-4342-ade9-aa220aa127f9` · 工作树 `.worktrees/secondary-page-residue-v2`（基线 f091ac4）
> 证据文件里的 `.txt/.log/.cjs` 被 `.gitignore`（Tier-3 规则）挡住，**只有本 README 是可入库的结论**；原始清单可用 `node manifest.cjs <out.txt>` 重算。

## 1. 改动（2 个文件 / 2 行）

| 文件 | 改前 | 改后 |
|---|---|---|
| `scripts/lib/audience.js:826`（`WORDING_CONTRACT.SOURCE_NOTES.disclaimer`，权威常量） | `以上是本站采集与整理过程的事实，不构成对优惠是否有效、是否适用于你的判断；最终以厂商官方页面为准。` | `以上是本站采集与整理过程的事实，不构成对优惠是否有效、是否适用于你的判断。` |
| `index.html:1347`（`/* AUDIENCE/… */` 受控副本 `SOURCE_WORDING.SOURCE_NOTES.disclaimer`，RENDER-CORE 实际渲染源） | 同上 | 同上 |

- 删除片段：**「；最终以厂商官方页面为准。」13 字**；原句 49 → 37 字（Δ **−12**/页，句末「。」保留）。
- 两处必须同批：`checkWordingContract()`（`scripts/lib/audience.js:1043`）逐字比 `WORDING_CONTRACT` ↔ `index.html` 标记块；只改一边 `validate --strict` 当场红。
- 保留「不构成对优惠是否有效、是否适用于你的判断」：`scripts/tools/verify-site.js:1926` 有既有断言 `/不构成对优惠是否有效/`（不得删断言）。
- B 类判据（`census2.json` DSRC-NOTE-DSRC-TAIL）：尾半句与共享页脚同义 ⇒ 删；**实测 80/80 详情页页脚同义句仍在**。

## 2. 命令读数（全部在 worktree 内执行）

| 命令 | 退出码 | 读数 |
|---|---|---|
| `npm run selftest:audience` | 0 | ✅ 206 项通过 / 0 失败 |
| `npm run selftest:provenance` | 0 | ✅ 132 项通过 / 0 失败 |
| `npm run test:strict`（validate --strict） | 0 | ✅ 校验通过（4 条既有告警） |
| `npm run check:reproducible` | 0 | ✅ deals.json 可重建（孤儿 0 / 凭空 0 / 漂移 0） |
| `npm run build` | 0 | ✅ 产物自检通过 · 186 页 · SEO 安全门禁 28×186 全过 · 说明清单 523 条 |
| `npm run verify:seo` | 0 | ✅ SEO 验收 19 项 / 失败 0（indexable 183 · deal 80 · dist 304 文件） |
| `npm run test:l3` | 0 | 9 个脚本 / 失败 0（含 `check:feeds:reproducible` 建两次逐字节比对） |
| `node probe-t2.cjs` | 0 | 见 §3 |

## 3. 产物级读数（`probe-t2.cjs`，304 文件 / 186 HTML）

- 含**旧整句**的文件：**0**（改前 81）
- 含**新前半句**的文件：81 = 80 详情页 + `dist/index.html`（受控副本宿主页）
- 仍含**被删尾半句**的文件：**0**
- 详情页含免责句 `.dsrc-note`：**80 / 80**；样本「以上是本站采集与整理过程的事实，不构成对优惠是否有效、是否适用于你的判断。」= 37 字（Δ −12）
- 全站净减字：**960 字**（12 × 80 页）
- 同页保留的 `.dsrc-note`（`.dhist` 空态）：「起算日之前的状态没有历史记录，因此这里不显示任何变化。」（keep，未被本轮触碰）

## 4. 数据面逐字节（`manifest-A/B/C.txt`，各 363 条：dist/** + 根 *.json/txt/xml + scripts/data/**）

- **A（改后） vs B（pristine HEAD 构建）**：差异 **81 个文件，全部是 HTML** —— 80 个 `dist/deal/*/index.html` + `dist/index.html`；**非 HTML 差异 0**。
- 逐字节相同（改前 = 改后）：`deals.json` `290cc082…` · `plans.json` `1668d19c…` · `api-plans.json` `30fdf7b8…` · `models.json` `c6ea1547…` · `dist/deals.json` `af6944ad…` · `dist/data/index.json` `82e495f6…` · `dist/sitemap.xml` `57beecad…` · `dist/robots.txt` `1bbde8cd…` · `dist/feed.json` `0cb7725d…` · `dist/feed/**` 48 个文件全同。
- **C（改回来重建）与 A 的清单 sha256 完全相同**（`01a21419…`）⇒ 构建确定性可复现，dist 已回到「改后」状态（不是 pristine）。
- 方法：`npm run build` → `node manifest.cjs <out>`；B 由 `git checkout -- <2 文件>` 后重建取得，C 由还原后重建取得。

## 5. A 类（`.ddesc`「（无头浏览器渲染后提取）」×17 页）**未落地**，原因与证据

- 该串本体在**数据面**：`deals.json` **17 处**（行 3851/3933/4015/4075/4135/4188/4241/4294/4347/4400/4453/4506/4559/4612/4665/4726/5361）+ 采集器模板 `scripts/collectors/headless.js` 3 处（132/298/313）；`scripts/data/**` **0 处**。
- **产物侧同样承载**：`dist/deals.json` 也含该串（实测 18 个产物文件 = 17 详情页 + `dist/deals.json`）⇒ 即使做渲染层归一，`dist/deals.json` 仍是命中源，census §「删除面 2」的「产物里不得出现整括号」在全产物口径下**无法变绿**。
- 本轮硬约束「禁止改数据面/Feed 产物字节」禁止改 `deals.json`；t2 派单同时要求「不要在渲染层做正则替换」⇒ 两条路都被封，**本轮不删，且不做假删除**（未改数据、未加渲染层剥离）。
- 待队长裁定：① 授权渲染层归一（`.ddesc` 渲染前剥该括号）＋采集器模板同批去括号，并把牙收到 HTML 面（`dist/deals.json` 记为已知承载）；② 把 A 类排到允许动数据面的轮次。
- 采集器口径提醒：判据**不能**写成宽口径 `无头浏览器渲染` —— 全站 35 次里 17 次是 `.dsrc` 里合法的「采集方式：无头浏览器渲染」标签行。

## 6. 给下游的两条口径提醒

1. **B 类牙要按精确句锚定**：全仓扫描（排除 `research/` 历史证据）里，被删的**整句**只剩 `docs/SCHEMA-v1.3.md:102`（文档，属 t7）；而**裸短语**「最终以厂商官方页面为准。」在别的容器里合法存在（`scripts/lib/plan-history.js:231`、`plans-hub-page.js:68` 等）⇒ 牙写成裸短语会把合法 keep 判红。
2. **`.scratch/` 不是本任务产物**：worktree 里 13 个探针脚本（12:49–12:55 由其他成员持续写入），**未被 `.gitignore` 覆盖**，提交前需排除或加忽略规则。

## 7. 复现

```powershell
cd .worktrees/secondary-page-residue-v2
node research/_raw/secondary-page-residue-v2-t2/probe-t2.cjs                    # 产物级读数
node research/_raw/secondary-page-residue-v2-t2/manifest.cjs out.txt            # 全量 sha256 清单
npm run selftest:audience; npm run selftest:provenance; npm run test:strict
npm run check:reproducible; npm run build; npm run verify:seo
```
