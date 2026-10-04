# t43 —— t19 的 PR 正文 / 未验证边界 / 合并与回滚 / 发布说明（草稿）

> **本文档只写研究产物**，没有 push / 建 PR / merge / 部署 / 改仓库设置。
> **所有数字都是现场跑出来的**（命令 + 值见 §5「数字来源」）；与历史报告不一致的地方逐条写清了差异与原因。
> 抓取时点：**HEAD `e437e9f`**（分支 `coverage-expansion-v1`，基线 `a4dd40f`，领先 **16** 个提交），
> 工作区另有队友在途改动（见 §2 的边界 6）。
> 复现材料：`measure.cjs`（一次性采集，产出 `measurements.json`）· `release-diff.cjs`（线上 vs 本地）·
> `homepage-probe.cjs` · `citation-rule-probe.cjs` · `citation-drift.cjs` · 各命令日志 `*-live.log`。

---

## 1. PR 草稿（可直接粘贴）

### 标题

```
feat: coverage-expansion-v1 —— Coverage Target 层 + Model Currentness（/models/ Current 化）
```

（若需要更长的标题：`…；数据 23→34 provider · 23→37 套餐 · 13→17 API 记录 · 门禁 45→49 步`）

### 正文

```markdown
## 这一版做了什么

把项目从"收了一堆数据"升级为**知道自己要覆盖什么、当前覆盖到哪里、哪些模型值得默认展示**：

1. **Coverage Target 层**（新）：`scripts/data/coverage-targets.json` 只写 intent / applicability / tier /
   current targets / 人工裁决理由，**绝不手写 COVERED/PARTIAL/MISSING**；七态由 `lib/coverage-targets.js` 派生，
   `DEFERRED` 永不算 `MISSING`。`report:coverage` v2 增列 Target Provider Universe / 分维度覆盖 /
   Current Model Coverage / Source Health impact / deferred 与 unverifiable 清单。
2. **Model Registry v2 + 新鲜度**（新）：来源层每条新增 `modelRole` / `releasedAt` / `releaseEvidence` /
   `freshnessGroup`，派生产物新增 `catalogStatus` / `catalogReason`；`lib/model-freshness.js` 是**唯一判据**
   （不读墙上时钟、不联网），按 modelRole 分档（120/240 · 180/365 · 365/730 天）。
3. **`/models/` Current 化**：索引静态表列出**全部** registry 模型（`data-model`），新增中性「目录状态」与
   「模型角色」两列；`legacy` / `historical` **默认不占首屏**但**一行都不删**（无 JS 时读到全部行、0 控件），
   并提供「显示旧型号」入口；详情页新增「发布时间」（带官方证据链接）与中性状态词，**只有 `status=retired` 才写「已下线」**。
4. **API 侧计价条目终于有出口**：处置登记双侧化（`apiPlanId` + `modelKey` + `variant` + `reason=off-registry-model`），
   把"既没有映射、也没有任何处置"的硬失败补齐；并加了**反绕过牙**（能对回 registry 身份的写法不许写进处置表）。
5. **数据扩张 + Source Health 收口**：见下面的数字表。

## 数字（全部现场跑取；基线 `a4dd40f`）

| 维度 | 基线 | 现在 |
| --- | --- | --- |
| providers | 23 | **34** |
| plans | 23 | **37**（18 个 provider） |
| api-plans | 13 | **17**（93 条模型计价条目） |
| coverage-targets | 0（新文件） | **34** |
| registry 模型 | 44 | **44**（现场复核身份零漂移：派生 id 与 `sha1('model|'+slug)[:12]` 不一致 **0** 条、slug 唯一 **44**、源层身份 **44**） |
| 关系层 links | 64 | **82**（API 69 + Coding 13；其中**新增 14 条 API 映射**） |
| 处置声明 gaps | 10 | **54**（Coding 42 + API 12） |
| 门禁步骤 `action.yml` | 45 | **49** |
| `check-ci-consistency` | 37 项 | **38 项**（`--expect-checks=38` 钉在 `verify.yml`） |

## 门禁证据（现场复核 + 全量 Gate 报告）

现场复核（HEAD `e437e9f`，均 exit 0）：

- `node scripts/validate.js --strict` → ✅ 校验通过
- `node scripts/tools/check-ci-consistency.js` → ✅ **38 项 0 失败**（裸跑会自读 `verify.yml` 的 `--expect-checks=38`）
- `node scripts/tools/check-models-reproducible.js` → ✅ 44 模型 / 82 映射逐字节一致
- `node scripts/tools/coverage-report.js` → ✅ 覆盖报告自检 0 处问题
- `node scripts/tools/vendor-page-selftest.js` → ✅ 57 项 0 失败
- `node scripts/tools/models-selftest.js` → ✅ 143 项 0 失败
- 真浏览器 `node scripts/tools/verify-site.js` → ✅ **735 项 0 失败**（对象：本日 21:21 构建的 `dist/`）

全量 Gate（49 步逐条跑）：见 `research/_raw/coverage-expansion-v1/t18-full-gate-report.md` ——
该报告跑的是 **HEAD `9f27836` + 4 个在途改动**，读数 **47/49 过 · 1 红（R5 vendor-pages 冻结期望）· 1 跳过（`npm ci`）**；
**R5 已在 `e437e9f` 修好**（现场 `vendor-page-selftest` 57/0 为证）⇒ 合并前需要用最终提交再跑一次全量 Gate 确认 48/49（跳过 `npm ci`）。

其他：变异电池在 `research/_raw/t17/logs/battery.json`（**27** 条用例）；两份独立审查 ——
对抗性审查 `research/_raw/t26/report.md`（**verdict = pass**）、数据质量审查
`research/coverage-expansion-v1-data-quality-review.md`；残余登记表
`research/coverage-expansion-v1-residual-register.md`（文件 sha256 `b8b05522…c7ed`，见 §2 的边界 3）。

## 怎么验

```bash
npm run build && node scripts/tools/verify-site.js     # 本地真浏览器 735/0
node scripts/tools/check-ci-consistency.js             # 38 项 0 失败
node scripts/tools/coverage-report.js                  # 覆盖报告 v2
```

部署后线上冒烟（t19）：先 `research/_raw/t40/compare-live.cjs` 判"部署是否真生效"，再
`node scripts/tools/verify-site.js --url=https://buguoshixc.github.io/ai-deals-aggregator/`。
```

---

## 2. 未验证与已知边界（**这一节必须与 PR 一起贴**）

1. **线上冒烟尚未执行 —— 没有任何线上读数。**
   依据：线上当前是**旧版本**（实测 `/models/` 的 `data-model=0`、`models-show-legacy=0`、
   legacy 详情页 `data-release-date=0`），部署之后才有 after 读数。判定手段已备好：
   `research/_raw/t40/compare-live.cjs`（before/after + CDN 600 秒等待策略，**不加查询串**），
   期望读数 `data-model=44` / `models-show-legacy≥1` / `data-release-date≥1` / 7 条路由 200。
2. **`aging` / `historical` 在真实数据上是 0 档 —— 这两条分支只有夹具证据。**
   现场 `models.json` 的 `catalogStatus` 分布：`{unknown: 40, current: 3, legacy: 1}`（**aging=0 · historical=0**）。
   成因：44 条里**只有 4 条有官方 `releasedAt` 证据**（`modelsWithOfficialReleasedAt=4`，且这 4 条都带 `releaseEvidence`），
   没有发布日的记录按口径一律 `unknown`（**`unknown` 绝不自动等于 `legacy`**）⇒ 派生不出 aging/historical。
   夹具证据在 `model-freshness-selftest.js`（五个分支）与 `models-page-selftest.js`（五档合成夹具）。
3. **"引文未点名的历史映射"这个数字：现场重算与登记表不一致（需登记表 owner 复核）。**
   残余登记表 §2 的仲裁值是 **34**（清单 sha256 `b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696`）；
   我按它写下的子句现场重算，**复现不出 34**：按 `apiPlanId` 侧 · `basis != explicit-mapping` ·
   引文不出现 `modelKey` / 记录内 `name` / `registry slug`（raw 子串）⇒ **30 条**（清单 sha256 `f1ae30f9fba1ae18006a7cc8bef93f0a7bde8b214b340aa15e07ac2526550c89`）；
   把引文来源换成"仅链接抄件" ⇒ 33；`citation-rule-probe.cjs` 一次性跑了 24 种口径变体，取值只出现
   30 / 33 / 35 / 40 / 45 / 49 / 59，**没有 34**。漂移时点见 `citation-drift.cjs`：**26（基线）→ 26（t23）→ 30（t33 `af92d5d` 把 4 条引文改成官方逐字片段之后）→ 30（HEAD）**。
   结论：**这一版 PR 里两个数字都要带口径贴上**（登记表 34 + 现场 30），并请登记表 owner（t36/t41）复核刷新；
   **不得**只贴一个数字了事。
4. **两条同名 M24 盲区：其中"测试改自己"那条构造上接不住。**
   `research/coverage-expansion-v1-residual-register.md` §4.3 已消歧：
   **M24-①**「把 `provenance-selftest` 的牙拔掉 ⇒ 自测恒绿」是**变异电池的方法论边界** ——
   自测无法证明自己的断言队列还在工作（拔掉 `check()` 的失败入队后没有门禁能红），
   **构造上就接不住**，状态 `NOT_CAUGHT(KNOWN)`，不列为待修缺陷；
   **M24-②**「真实引文没有离线门禁」是**真实能力缺口**，已由三层覆盖关闭（不得把两者读成一件事）。
5. **`master` 当前没有分支保护 ⇒ gate 没过也能合并。**
   现场（只读 API）：`gh api repos/buguoshixc/ai-deals-aggregator/branches/master/protection`
   → `{"message":"Branch not protected","status":"404"}`。必需检查名确实是 **`gate`**
   （`verify.yml` 的 job id 与 name 都是 `gate`；某次 PR 提交上的 check-run 实测名为 `gate`），
   但平台**不会**拦 —— t19 必须**人工确认 `gate` 在 PR 最新 SHA 上 success 后再合并**。
   想改成平台强制：管理员开分支保护并把 `gate` 设为必需检查（属仓库设置变更，本任务不做）。
6. **本版读数建立在"HEAD + 队友在途改动"上，不是纯 HEAD。**
   现场 `git status --short` 有若干在途改动（t35 等），t18 报告也显式说明了同样的事实
   （它跑的是 `9f27836` + 4 个在途文件）。**合并前必须让工作区收口并复跑一次全量 Gate**，
   否则 PR 里引用的读数是"某个中间态"的。

---

## 3. 合并方式、提交信息与回滚

### 合并方式：**merge commit**（`gh pr merge <PR> --merge --delete-branch=false`）

理由：master 既有历史就是 merge commit 形态（`Merge pull request #36 from …`）；
本版的 16 个提交各自携带证据（数据落盘 / 门禁牙 / 审查收口 / 预检运行单），squash 会把这些逐条证据压成一句，
后面复算"某个数字是哪一次改动造成的"就得靠 PR 之外的记录。**不用 squash、不用 rebase-merge。**

### 合并后的提交信息草稿

```
Merge pull request #<PR> from buguoshixc/coverage-expansion-v1

feat: coverage-expansion-v1 —— Coverage Target 层 + Model Currentness（/models/ Current 化）

数据：providers 23→34 · plans 23→37 · api-plans 13→17（93 条计价条目）· coverage-targets 0→34
      registry 44（身份零漂移）· links 64→82（API 69 + Coding 13，新增 14 条 API 映射）
      gaps 10→54（Coding 42 + API 12 条 off-registry-model 声明）
门禁：action.yml 45→49 步 · check-ci-consistency 37→38 项（--expect-checks=38 钉在 verify.yml）
验证：validate --strict / check-ci-consistency 38·0 / check:models:reproducible / report:coverage
      / vendor-page-selftest 57·0 / models-selftest 143·0 / verify-site 735·0（均 exit 0）
      变异电池 27 例（t17）· 独立审查 t26 verdict=pass · 数据质量审查 t15
已知边界与未验证项见 PR 描述（线上冒烟待部署后执行；aging/historical 真实数据为 0；
      "引文未点名"数字登记表 34 与现场 30 不一致，待复核）
```

### 回滚

```bash
# 1) 找到合并提交
git log --oneline -1 --merges origin/master
# 2) 反向提交（-m 1 = 保留主干那一侧）
git revert -m 1 <merge-sha>
# 3) 推回去 —— 会再走一遍 prepublish(gate) → build → deploy
git push origin master
```

要点：**回滚也必须过同一条门禁链**（`deploy.yml` 的 `prepublish` 跑的是与 PR 同一个 `.github/actions/gate`）；
不要手动重发旧 artifact、不要直接改线上产物。运维层面的退路见 `research/_raw/t37/t19-runbook.md` §6.4。

---

## 4. 面向站点读者的发布说明（短）

1. **模型资料索引 `/models/` 新增「目录状态」与「模型角色」两列**，并把旧型号默认收进「显示旧型号」——
   页面里**一行都没少**：静态表从 44 行仍是 44 行（`data-item` 44 → `data-model` 44），
   关掉 JS 打开读到的仍是全部 44 个模型、0 个控件；打开后才默认隐藏（实测入口 `models-show-legacy` 出现 1 处）。
2. **模型详情页新增「发布时间」**（带官方证据链接）：抽样页 `/models/deepseek-v3.2/` 上 `data-release-date` 从 **0 → 1 处**；
   没有官方发布日的模型如实写「未标注」，不拿"首次收录"顶替。
3. **新增 3 个厂商资料页**：`/vendor/aws/`、`/vendor/replit/`、`/vendor/stepfun/`
   （线上 sitemap 170 → 本地 173，**新增恰好这 3 条、0 条消失**；厂商页从 19 → 22）。
4. **套餐与 API 对比页内容变多、结构不变**：`/plans/coding/` 行数 **23 → 37**，`/plans/api/` 行数 **67 → 93**
   （新增 AWS / Google / JetBrains / Replit / 讯飞 / 阶跃 等记录，以及 4 家推理平台）。
5. **首页与对比页的观感没有变**：首页 HTML **长度与线上旧版相同（399740 B 对 399740 B）**，卡片 **50 → 50**、
   `rel="alternate"` **10 → 10**（长度相同只作"没有大改"的信号，不等于逐字节相同）；
   `/feeds/` 只涨了 1 字节，订阅地址不变。
6. **文档与数据集不变的部分**：`/docs/data/` 的 Manifest 数据集数量与引用方式不变；
   站点地图条目 170 → 173（只多那 3 个厂商页）。

---

## 5. 数字来源（命令 → 值）与和历史报告的差异

采集器：`node research/_raw/t43/measure.cjs` → `measurements.json`（一次跑出 §1 表格里的全部数字，并附与任务书口径的逐条对照）。

| 数字 | 现场命令（全部 exit 0） | 现场值 | 与历史报告的差异 |
| --- | --- | --- | --- |
| providers 23→34 | `measure.cjs`（`scripts/data/providers.json` 键数，基线用 `git show a4dd40f:`） | 23 → 34 | 与 t15 审查一致 |
| plans 23→37 | `node -e "const p=require('./plans.json').plans;console.log('plans',p.length,'providers',new Set(p.map(x=>x.provider)).size)"` | **plans 37 · providers 18** | 一致 |
| api-plans 13→17 | `measure.cjs` + `/plans/api/` 行数（线上旧版 67 → 本地 93） | 13→17 · 计价条目 **93** | 一致 |
| coverage-targets 0→34 | `measure.cjs`（基线该文件不存在） | 0 → 34 | 一致 |
| links / gaps | `measure.cjs` | 82（69+13）/ 54（42+12）；新增 API 映射 **14** | 一致 |
| 门禁步骤 45→49 | 数 `action.yml` 的 `- name:`（基线 `git show`） | 45 → 49 | 一致 |
| `--expect-checks` | `verify.yml` 里那一行 | **38**；裸跑 `check-ci-consistency` = **38 项 0 失败** | 一致 |
| verify-site | `node scripts/tools/verify-site.js` | **735 项 0 失败** | 与 t18 报告一致（对象为其后本日 21:21 构建的 `dist/`） |
| 变异电池 | `research/_raw/t17/logs/battery.json` 的 case 计数 | **27** | 一致 |
| 残余登记表 | 文件 sha256 | `b8b05522…c7ed`（**文件**哈希） | 与登记表 §2 的**清单** sha256 `b9d97c44…` 不是同一个东西，别混用 |
| 引文未点名映射 | `citation-rule-probe.cjs`（24 变体）+ `citation-drift.cjs`（跨提交） | **30**（raw·三支·不算 explicit；sha256 `f1ae30f9…`） | **与登记表仲裁值 34 不一致** —— 复现不出 34（变体取值 30/33/35/40/45/49/59）；漂移时点：26→30 发生在 t33 `af92d5d`。见 §2 边界 3 |
| models-selftest 项数 | `node scripts/tools/models-selftest.js` | **143 项 0 失败** | 历史（t23 报告）写 **134** —— HEAD 之后新增了引文自称牙等断言，属正常增长 |
| vendor-page-selftest | `node scripts/tools/vendor-page-selftest.js` | **57 项 0 失败** | t18 报告里它是**唯一红（R5 冻结期望）**；`e437e9f` 已修 ⇒ 合并前需用最终提交复跑全量 Gate 复核 |
| 线上/本地站点对照 | `release-diff.cjs` + `homepage-probe.cjs` | sitemap 170→173（+3 厂商页、0 消失）；首页 50 卡片 / 10 alternates / **399740 B 两边同长**；`/models/` data-item 44→44、data-model 0→44、show-legacy 0→1；详情页 release-date 0→1 | 新测，无历史对照 |
| 线上可达性 | `curl.exe -sI https://buguoshixc.github.io/ai-deals-aggregator/` | **200** · `Last-Modified: Sun, 04 Oct 2026 07:16:27 GMT` · `Cache-Control: max-age=600` | 线上仍是旧版（`data-model=0`） |

> 校验用品：`measurements.json` · `release-diff.json` · `homepage-probe.json` · `citation-rule-probe.json` ·
> `verify-site-live.log`（735/0）· `validate-live.log` · `ci-consistency-live.log` · `repro-live.log` ·
> `coverage-report-live.log` · `vendor-selftest-live.log` · `models-selftest-live.log` · `release-diff.log`。

---

## 6. 合并前 checklist（给 t19 用，来自 t37 运行单）

1. 工作区收口：`git status --short` 干净（**现在还有在途改动**）；
2. 本地复跑：`validate --strict` / `check-ci-consistency` / `build-local` / `verify-site`（735/0）全绿；
3. 用**最终提交**再跑一次全量 Gate（49 步），把 `research/_raw/coverage-expansion-v1/t18-full-gate-report.md` 的读数刷新到"R5 已修"之后；
4. `git push -u origin coverage-expansion-v1`（**不可逆**）→ `gh pr create` → **人工确认 `gate` success** → `gh pr merge --merge`；
5. 等 `Deploy to GitHub Pages`（prepublish(gate) → build → deploy-pages）→ 用 `research/_raw/t40/compare-live.cjs` 判生效 → 再跑 `verify-site --url=`。
