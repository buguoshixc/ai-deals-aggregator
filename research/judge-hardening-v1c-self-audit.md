# `judge-hardening-v1c`（t33）自审

配套：`research/judge-hardening-v1c.md` · `research/_raw/judge-hardening-v1c/{readings,regression,product-digest}.json`

## 1. 我声称的 vs 我实际量到的

| 声称 | 原始读数 | 强度 |
| --- | --- | --- |
| ① 裁切祖先变红并点名 | `v1c-newd2.json`：`plans/api/#0..#4 note-clipped`，逐条写「被**裁切祖先** div.arch-clip 裁掉约 73.56px / 53.17px / 32.78px（该祖先 overflow hidden/hidden；说明自身 scroll/client 都看不出问题）」 | 直接读数（形态与 t11 的 N14 逐字相同，副本按**当前树**重建） |
| ② 冻结串「串在但没生效」与「串不存在」分得开 | `v1c-newb.json`：计数判据 **✓**（`186/186 页恰好 1 次`）+ 新生效断言 **✗**（6 条「**没有生效**」：期望 12px/12px/anywhere，实测 14px/0px/normal）；真删对照 `v1c-forge.json`：计数判据 **✗**（理由 = 串不存在） | 直接读数 |
| ③ 两条判据同解 | `v1c-newe.json`：新配对判据 **✗**（`1 个 <!-- / 0 个 -->`）+ `/vendor/zhipu/ 的 sitemap 成员资格 :: sitemap 无` **✗**；同一副本 `seo-verify` **19/2 红**（`漏 archive/,changes/,deal/…`） | 直接读数（两侧） |
| ④ `<noscript><style>` 修进扫描面 | `v1c-newg.json`：`developer/#? narrow-unregistered`（t11 时不报）；产物普查 **0 页**有 `noscript > style` ⇒ 对当前产物零影响 | 直接读数 |
| 只变严、无回归 | `regression.json`：完全不变 **11** · 预期内变化 **13** · **回归 0**；`onlyInT11` 只有两个旧名字（「样本集 29 页」） | 直接读数（逐副本名字级比对） |
| 断言只增不减 | 干净产物 885 → **887/0**（+2 条新命名检查；旧断言一条没删） | 直接读数 |
| 产品零改动 | 见 §3 | 直接读数 |

## 2. 过程中踩到的坑（都进了报告或本节）

1. **浏览器侧模板字符串里不许出现反引号** —— 文件里原有警告，我在注释里写了四对反引号，把模板**提前截断**，
   `node --check` 报在 `const FROZEN = ${…}` 那一行（症状与原因隔了 300 行）。处置：改用「」（并把这次教训写进报告 §1 的读法）。
2. **重建脚本自指**：`v1c-rebuild.cjs` 第一版用 `inject --src=.arch-v1/dist-base --dst=.arch-v1/dist-base`，
   而注入器会**先清空 dst** ⇒ 把基线副本自己清掉了，后续 19 个副本全部「找不到 …/index.html」。
   处置：基线改成直接从 `dist/` 整树 `cpSync`，并在脚本注释里写明这个坑。
3. **`node -e` 的引号**：本轮又踩了一次（t27/t11 同款）。凡是要写带引号的补丁/正则，一律落 `.cjs` 文件再跑。
4. **沙箱与副本重建**：t11 的副本是 t9+t10 树上的产物，本轮**全部按当前树重建**（`.arch-v1/v1c-rebuild.cjs`），
   否则「回归」会混进「产物不同」这一项。沙箱还额外重建了 `scripts/`（登记表 + 判据都是副本）——产品未动。

## 3. 产品零改动

- 工作树 `git status --porcelain` 只有一行：` M scripts/tools/verify-site.js`（唯一的代码改动，已声明）；
  `scripts/data/narrow-reading-columns.json` **一字未改**（N19 选了「修」）。
- 所有形态注入都落在 `.arch-v1/dist-*` 副本上；注入器逐副本断言「每条形态只改 1 个文件 / 意外变更 0」。
- 沙箱 `sb-*`（含 5 个登记表沙箱与 3 个判据副本 `sb-list*`）都是 `scripts/` + `dist/` 的**副本**。
- 产物：`npm run build` 后 dist 全树摘要与 t11 期一致（`df43587c…` / 304 文件，见 `product-digest.json` 与报告 §7）。

## 4. 没证明的东西（与报告 §4 同源，这里只记「为什么没做」）

1. **裁切祖先只认 `hidden`/`clip`**：`auto`/`scroll` 的祖先不判（「能滚到」不算永久切掉）——这是**有意**的边界，不是遗漏；
   代价是「祖先 `overflow:auto` + 内容被推出可视区且不滚动」这一类仍零码（未实测该形态）。
2. **`clip-path` / `mask` / `contain: paint` / 负 margin 裁切**没进判据（t11 也没打这些形态）。
3. **冻结串生效断言只对账 4 个属性**：`color` 会引入 hex↔rgb 口径、`line-height` 是派生量 ⇒ 故意不判（宁可少判，不引入假红）。
4. **没有在 CI/POSIX 上跑**：本机 Windows + Edge；几何判据的跨平台差异不在本轮射程。
5. **N15 只收口「未闭合注释」**：`-- >`（带空格）等畸形不额外判（XML 解析侧由 `verify:seo` 兜）。
6. **没有给四条收口各写一颗「变异牙」进变异电池**：本轮用的是**外部形态副本**（t11 的装置）证明，而不是内置 M17/M18…
   —— 这与 t9 的做法（把牙装进 M 系列）不同；若团队希望内置，可另开小任务（登记为未覆盖）。
7. **`sb-list*` 判据副本**只为了让「未登记窄列页」名单不被 `slice(0,4)` 截断；它们**不是**产品代码（报告里已声明）。

## 5. 纪律自检

- 只改 in-scope 文件：`scripts/tools/verify-site.js`（代码）+ `research/judge-hardening-v1c*.md` + `research/_raw/judge-hardening-v1c/`。
- `docs/DESIGN-RULES.md`、`NEXT-STEPS.md` **零改动**（建议行在报告 §8）。
- 没有碰 `scripts/lib`、`scripts/data`、`api-plans.json`、`models.json`、`plan-changes.js`、`dist/`。
- 判据只变严：新增两条独立命名检查 + `note-clipped` 第三类来源 + 扫描面扩大；**旧断言逐字未动，也没有改松任何一条**。
- 本任务不自行合并：PR 由 captain 验收。
