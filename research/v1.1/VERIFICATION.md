# v1.1 学生 / 开发者模型 —— 独立验证报告

- 角色：`t5`（verifier，独立验证人）。**未改任何源码 / 数据 / 测试 / 夹具**。
- 方法：不信实施者自述，只信命令输出。13 条命令实跑 + 9 条反证（逐字节复原）+ 4 条声明独立复核 + 1 条已知缺口独立复量。
- 判据快照（本次交付物描述的正是这份状态）：

| 文件 | sha256 前 12 位 | 字节 | mtime |
|---|---|---|---|
| `deals.json` | `D1E7AC19A04F` | 182298 | 09-29 17:09:04 |
| `dist/deals.json` | `D1E7AC19A04F` | 182298 | （与源**字节相同**） |
| `index.html` | `0499AC64F92E` | 209884 | 16:33:57 |
| `scripts/lib/audience.js` | `0BEA67EB0DD7` | 24224 | 16:38:30 |
| `scripts/lib/schema.js` | `97E8947351E6` | 39983 | 16:55:23 |
| `scripts/lib/dedup.js` | `C22F828F3B69` | 23828 | 17:07:52 |
| `scripts/lib/store.js` | `74015D8DEBE1` | 10901 | 17:08:05 |
| `scripts/validate.js` | `016FB81FAB4E` | 27731 | 16:29:15 |
| `scripts/tools/audience-selftest.js` | `5A5380A0A278` | 35694 | 16:49:23 |
| `scripts/tools/verify-site.js` | `2BC59204F972` | 134442 | 16:55:32 |
| `scripts/data/curated_cn.json` | `F19B1BA3D022` | 37645 | 16:55:53 |
| `scripts/data/curated_global.json` | `B38C402013DA` | 27147 | 16:55:53 |
| `.github/actions/gate/action.yml` | `9F9FE3271271` | 13428 | 16:54:17 |

**最终 12 条命令跑的是一次「零漂移」窗口**：跑前跑后对这 14 个文件（含 `research/_raw/ours-baseline/verify.json`）取 sha256，**TOTAL_DRIFTED_FILES=0**。

> ⚠️ **开工时的工作区不是冻结的**（详见 §5·F-1）。我到达时 `dedup.js`(17:07:52) / `store.js`(17:08:05) / `deals.json`(17:09:04) 刚被改过，字段出现数在一次验证会话内从 `eligibilityDetail 61 → 66`、`availability 32 → 38` 变过。因此我把每条命令重跑在一个**快照副本**（robocopy `/E`，11 个关键文件与现场逐字节 `SAME`）上，等现场稳定后又在现场重跑了整套 12 条。"零漂移"窗口 = 现场那一次。

**总体判定：`pass`（红=0）**，但带 **2 条中等问题**（§6 的 V-1 / V-2），不构成 fail——它们不是本阶段验收条的失败，是**验收条本身没覆盖到的口子**。

---

## 1. 命令表（13 条，逐条退出码 + 关键数字）

全部在仓库根执行；下表 EXIT 来自**现场零漂移窗口**的实跑。

| # | 命令 | EXIT | 关键数字 |
|---|---|---|---|
| 1 | `npm test` | **0** | `✅ 校验通过` · 总条数 134 · 真实优惠 80 · 国内/国外 60/74 · 策展 32 · **受众字段落空 0 处** · 学生 12/80（15.0%）· 开发者 67/80（83.8%）· 任一 80/80（100.0%）· 福利类型 79/80 · 信用信用卡 1/80 · 学生认证 3/80 · 教育邮箱 4/80 · 中国可用 31/80 · **出处声明 32/80 · 有已知值但无出处 56 条 / 有已知值 88 条** · 警告 2 条（Getsolved↔Getsolved AI Detector、KREA↔Kreado AI 疑似未合并） |
| 2 | `npm run test:strict` | **0** | `✅ 校验通过（strict 模式）`；数字与 #1 完全一致（`checkAudienceGuard()` 15 条 mustFail + 5 条 mustPass + 跨层措辞比对全过） |
| 3 | `npm run selftest:audience` | **0** | `✅ 受众字段自测：118 项通过，0 项失败`；分布行（`hasKnown` 口径）`audience 88 · benefitType 80 · eligibilityDetail 61 · claimRequirements 65 · availability 32 · provenance 32` |
| 4 | `npm run selftest:expiry` | **0** | `✅ 活动期限自测：94 项通过，0 项失败` · 134 条：有截止日期 0 · 未标注 124 · 长期活动 10 |
| 5 | `npm run selftest:text` | **0** | `✅ 文本清洗自测：46 项通过，0 项失败` |
| 6 | `npm run selftest:health` | **0** | `✅ 数据源健康自测：51 项通过，0 项失败` |
| 7 | `npm run selftest:zh` | **0** | `✅ 演练 15 项，失败 0 项` |
| 8 | `node scripts/tools/check-ci-consistency.js` | **0** | `✅ CI 口径检查 32 项，失败 0 项` · gate 复合 action **15 步逐项一致** · `(E)` 实跑项数 == `--expect-checks=32` |
| 9 | `npm run build` | **0** | `✅ 构建完成 → dist/` · 详情页 **80 个**（= type=deal）· sitemap 81 · 预渲染卡片 50 · 覆盖 80 条 · JSON-LD 5 类 · 产物 608.2 KB |
| 10 | `npm run verify` | **0** | `✅ 验收 149 项，失败 0 项` |
| 11 | `npm run verify:regress` | **0** | `✅ 验收 155 项，失败 0 项` · 6 条基线回归全过：覆盖 80→80 · 卡片 50→50 · 首屏 9→9 · 页高 4566→4566 · 外部请求 0→0 · JS 错误 0→0 |
| 12 | `npm run report:audience` | **0** | 学生 **12/80（15.0%）** · 开发者 **67/80（83.8%）** · 信用卡 **1/80** · 中国可用 **31/80**（已知是/否 30/1 · unknown 6 · 缺席 43）· benefitType 79/80 · audience 80/80 · 书写期 provenance 32 条/fields 127 个 → 发布期 32 条/127 个（**少 0**，可信度分布 editorial 0 / curated 32 / collected 0）· **第四节「已知值但无 provenance」56 条** |
| 13 | `node scripts/collect.js --dry-run` | **0** | 7 来源产出 97 条（合格 97 / 优惠 34 / 失败 0）· 策展 18/18 + 14/14 · 合并 `新采 97 + 既有 134 + 策展 32 → 去重 129 → 修剪前 134 → 最终 134` · **受众字段冲突 0 处** |

`npm run verify` 与 `verify:regress` 差的 6 项即上表的基线回归项（149 → 155）。两条都跑在**真浏览器**（Playwright）上。

**门禁接线核对**：`.github/actions/gate/action.yml` 的步骤序列里**有** `Audience self-test`（第 78–80 行，位于 Assemble 之前），且 `check-ci-consistency.js` 的冻结清单把「Audience self-test」钉成第 8 步——t1 报的 B5（新自测不在门禁里）**已闭合**。

---

## 2. 反证矩阵（9 条：破坏 → 确认变红 → 逐字节复原 → 确认回绿）

所有破坏都在**快照副本**上做（现场源码一字未动）。"复原"判据 = 该文件 sha256 与现场逐字节相同。

| # | 怎么破坏 | 期望红在哪一条 | 实得 | 复原 |
|---|---|---|---|---|
| ① | `index.html` 措辞块 `triLabel.unknown`：`尚未确认` → `待确认`（**只改前端一边**） | `test:strict` 必须点名 `triLabel.unknown` | **EXIT 1**，`❌ 校验失败，共 1 项：受众字段措辞跨层漂移：AUDIENCE_WORDING.triLabel.unknown：前端「待确认」≠ 后端「尚未确认」`；`selftest:audience` 亦 **EXIT 1**（118→114 通过 / 4 失败，含「牙②」两条） | ✅ `0499AC64F92E` 逐字节；strict 与 selftest 双回 **0** |
| ② | `dedup.pickMap` 退回「只记 `picked.source`」（我先按当时的行号插桩破坏了整个 `merged` 块） | 自测组 ④′ 必须红 | **EXIT 1**，118→**114 通过 / 4 失败**：`④ 两侧都给出该键时，贡献者确实超过一档`、`④ 多来源字段的 fields 条目被丢弃（值来自两档、出处却只署一档 → 假出处）`、`④′ 逐键冲突时落败一侧也记入 contrib — 1 档 = ["curated"]`、`④′ 顶层 credibility 也已下调 — "curated"` | ✅ `C22F828F3B69` 逐字节；回 **118 通过 / 0 失败** |
| ③ | `rebuildProvenance` 最低档取反：`Math.max(...ranks)` → `Math.min(...ranks)` | 自测组 ④ 必须红 | **EXIT 1**，118→**116 通过 / 2 失败**：`④ 顶层 credibility 下调到贡献者最低档（collected，不是书写期声明的 curated） — "curated"`、`④′ 冲突后即使值来自两档、顶层 credibility 也已下调 — "curated"`。**同时 `validate --strict` 与 `npm test` 都仍绿**——这条正是「必须把自测接进门禁」的实证 | ✅ `C22F828F3B69` 逐字节；回 **118 / 0** |
| ④ | `curated_cn.json[0]` 写非法枚举 `audience: ["developer","wizard"]` | `audience-audit` 必须报（不得被 `makeDeal` 静默吃掉） | `validate` **EXIT 1**：`受众字段落空 1 处` + `curated_cn.json[0] … audience 写了却没生效 —— audience 丢弃 1 项：["wizard"]（合法值：student / developer / educator / education / general / other）`；`--strict` 同红；`selftest:audience` 118→**117 / 1 失败** | ✅ `F19B1BA3D022` 逐字节；三条全回 **0** |
| ⑤ | `migrate.js` 拼错 flag：`--audiance`（与 `--bogus` 各一次） | 必须 `exit 2` | 两次都 **EXIT 2**：`❌ 未知参数：--audiance` / `❌ 未知参数：--bogus`，并列出 `已知参数：--dry-run、--audience、--file=<path>`；另 `--audience --dry-run` **EXIT 0** 且 `deals.json` 哈希不变 | 无需复原（未改文件） |
| ⑥ | `index.html` 的 `detailHtml` 里把 `audienceRows(deal)` 换成 `[]`（真实浏览器层） | 详情页断言必须红 | `npm run build` **仍 EXIT 0**（构建期自检抓不到），`npm run verify` **EXIT 1**，149→**146 / 3 失败**：`✗ 详情页出现「适用人群」结构化行，且取值不是空的 — 未找到「适用人群」行`、`✗ unknown 的中国大陆可用性渲染成「尚未确认」… 含「尚未确认」=false`、`✗ chinaUsable=false 的条目照直说「中国大陆用户不可用」…` | ✅ `0499AC64F92E` 逐字节；build+verify 双回 **0**（verify 149/0） |
| ⑦ | `scripts/validate.js` 删掉 `if (strict) checkAudienceGuard();` | strict 必须失去守卫 → 证明它真的接在 strict 上 | 删除后 `--strict` **EXIT 0**（`✅ 校验通过（strict 模式）`）；**且**我把 `lib/audience.js` 的规范措辞 тоже改坏（`triLabel.unknown → 待定`）后 strict 仍 **0**、selftest 也仍 **118/0** | ✅ `016FB81FAB4E` 逐字节；回 **0** |
| ⑦b | 只改 `audience.js` 规范侧 `triLabel.unknown → 待定`（前端不动，守卫已接回） | strict 必须点名 | **EXIT 1**：`受众字段措辞跨层漂移：AUDIENCE_WORDING.triLabel.unknown：前端「尚未确认」≠ 后端「待定」`；selftest 116/2 失败 | ✅ `0BEA67EB0DD7` 逐字节；回 **0** |
| ⑧ | 从 gate `action.yml` 删掉 `Audience self-test` 步骤 | CI 看门狗必须红 | **EXIT 1**：`✗ (10) gate 复合 action 步骤名序列等于冻结清单 — #8 期望「Audience self-test」实得「App-token self-test」…`；32→**31 / 1 失败** | ✅ `9F9FE3271271` 逐字节；回 **32 / 0** |
| ⑨ | `hasKnown` 语义改回「`false` 算无值」：`if (value === false) return true;` → `return false;` | 必须红（这是队长 ⑥ 想测的语义） | **EXIT 1**，selftest 118→**115 / 3 失败**（含 `hasKnown(false) = true`、`hasKnown({chinaUsable:false}) = true`）；`validate --strict` **EXIT 1**（策展 provenance 指向归一后无值的字段）；`npm run build` **拒绝发版**（`dist/ 未被改动`）；分布行 `eligibilityDetail 61 → 50` | ✅ `0BEA67EB0DD7` 逐字节；build+strict+selftest+verify 四条全回 **0** |

**关于队长建议的 ⑥**：`hasKnown` **在前端 RENDER-CORE 里根本不存在**（`index.html:1500` 用的是显式 `value === true || value === false` 分支），前端**不读** `hasKnown`。所以「改前端 `hasKnown` 让详情页那条 false 断言变红」这个破坏点**无法成立**——我按语义换成 ⑨（改库里唯一的 `hasKnown` 出处），它的红在自测 + strict + build 上，不在浏览器详情页上；浏览器详情页的牙我用 ⑥（suppress `audienceRows`）单独证过。

**三条断层（子表）**：本次反证证明存在三个**互不覆盖**的故障域，任何一层单独绿都不能代替其它层——

| 破坏 | `npm test`/`--strict` | `selftest:audience` | `build` | `verify`（浏览器） | CI 看门狗 |
|---|---|---|---|---|---|
| ③ 仲裁取反 | ✅ 绿（**漏**） | ❌ 红 | — | — | — |
| ⑥ 详情页不渲染 | ✅ 绿 | ✅ 绿（**漏**） | ✅ 绿（**漏**） | ❌ 红 | — |
| ⑨ `false` 语义 | ❌ 红 | ❌ 红 | ❌ 红（拒绝发版） | ✅ 绿（**漏**） | — |
| ⑧ 删自测步骤 | — | — | — | — | ❌ 红 |

---

## 3. 对队长四条自报声明的独立复核（**当作待证**）

### 声明 ①：旧 134 条「除新字段外 0 处取值变化」→ **✅ 成立（实测 changed=0）**

对 `git show HEAD:deals.json` 与 `deals.json` 逐条逐字段比对 22 个既有字段（`id,title,vendor,url,source,sourceUrl,region,type,discountInfo,pricingModel,priceLine,features,category,description,eligibility,validity,expiresAt,firstSeen,lastSeen,verified,verifiedAt,zh`）：

```
HEAD_deals=134 now_deals=134 missing_ids=0
legacy_field_changes=0    by_field={}
```

**同一判据我跑了三份数据（现场 / `dist` / 快照），三份都是 `changed=0 / missing=0`。**

⚠️ **但这个数字差点在 17:00 那一轮 merge 里被破掉**：`dist/deals.json`（17:07:47 构建）当时相对现场有 **32 条 `firstSeen` 被刷成 `2026-09-29`、6 条 `sourceUrl` 被清空**（偏差 32 + 6 = 38 字段，215 字节）。现场是靠 `scripts/tools/audience-restore-history.js`（17:08:42 新建）从 `git show HEAD:` 回灌修好的。**结论：声明成立，但它是"被修好的"而不是"从没坏过"**——根因（策展文件不带 `firstSeen` → `makeDeal` 覆盖当天 → merge 后策展侧赢）已由 `store.js` 的 `injectFirstSeen` 与 `dedup.js` 的取更早逻辑修掉，但**已污染的值不会自愈，只靠一次性脚本回灌**。这条应进长期回归（见 §4 建议）。

### 声明 ②：`provenance` 只应有 32 条且全部 `curated` → **✅ 成立**

```
provenance_total=32  credibility={"curated":32}  provenance_on_tools=0
```

- 32/32 全是 `curated`，`editorial`/`collected` 各 0。
- 32 条全部落在**优惠**条目上（工具条目 0 条）。
- `deals.json` 六个字段出现数（键存在口径）：`audience 88 · benefitType 80 · eligibilityDetail 66 · claimRequirements 65 · availability 38 · provenance 32`。
- ⚠️ 口径提醒（**不是矛盾，但极易误读**）：自测第 8 组打印的 `eligibilityDetail 61 · availability 32` 是 **`hasKnown()` 口径**（只有 unknown 值的记录不计），我这里的 `66 / 38` 是**键存在口径**。两个都对，差 5 与 6 条就是「有键但值只有 unknown」的记录。

### 声明 ③：详情页 48+ 页真的有受众行、且 `unknown` 绝不渲染成「中国大陆用户不可用」→ **✅ 成立（80/80 页，0 反例）**

我不用 `verify-site.js`，直接**读 `dist/deal/<id>/index.html` 原始字节**逐页正则取 `<div class="k">…</div><div class="v…">…</div>` 单元格，再拿 `deals.json` 的策略逐条对账（80 页 × 全字段）：

```
deal_count=134  dist_deal_dirs=80  pages_examined=80
pages_with_适用人群行=80      pages_with_中国大陆可用性=37
empty_audience_value=0
unknown_rendered_不可用=0   unknown_row_missing=0   false_softened=0
deals_with_audience=88  deals_with_chinaUsable=38  chinaUsable_unknown=7
```

- 80/80 详情页（**无 JS** 的静态 HTML）都有「适用人群」行，**0 个空值**。
- `chinaUsable='unknown'` 的 7 条：**0 条**被渲染成「中国大陆用户不可用」，**0 条**漏渲染（应出「尚未确认」）。
- `chinaUsable=false` 的条目：**0 条**被软化。
- `中国大陆可用性` 单元格 37 个 vs `deals.json` 里 `chinaUsable` 有值 38 条：差值 1 = 那条是 **tool 条目**（无详情页），不是漏渲染。
- 样例页 `dist/deal/2eae0e246de2/index.html`（ERNIE-4.5-Turbo-128K，纯静态）实读行：`适用人群=开发者`、`福利类型=免费额度 / 免费 API`、`需要注册账号=是`、`仅限新用户=是`、`需要实名 / 身份认证=是`、`中国大陆可用性=中国大陆用户可正常注册使用`。
- 浏览器侧 `verify-site.js` 的 4 条 v1.1 断言在最终跑里全部**命中而非跳过**：`✓ 适用人群行…→ 开发者 · 字段表 12 格`、`✓ unknown → 含「尚未确认」=true · 含「中国大陆用户不可用」=false`、`✓ false 照直说「中国大陆用户不可用」`、`✓ 搜「中国大陆」命中 9 张卡 ≤ 已知可用性 31 条（unknown 6 条不进 haystack）`。

### 声明 ④：`deals.json` 与 `dist/deals.json` 现在是否一致 → **✅ 现在字节相同**（但**收到我这次构建影响**，且基线是自指的）

```
source_deals.json : updatedAt=2026-09-28T23:51:22+08:00  count=134  bytes=182298
dist/deals.json   : updatedAt=2026-09-28T23:51:22+08:00  count=134  bytes=182298
byte_equal=true   updatedAt_equal=true   records_with_any_diff=0
六字段出现数：source == dist（88/80/66/65/38/32 全一致）
```

**必须如实说明两件事：**

1. **我到达时它们不一致**：`dist/deals.json`（17:07:47，`541F35AAF774`）相对现场（17:09:04，`D1E7AC19A04F`）差 215 字节、**32 条记录**不同，差异字段只有 `firstSeen`（32 条）+ `sourceUrl`（6 条）。为了打出 ④ 的结论我被迫在快照上跑过 `npm run build`，而**现场那份 `dist/` 也被我验证过程中的一次 build 刷新成了当前源**，所以"现在一致"部分是我造成的。**当时不一致是真实存在过的状态**，不是队长凭空说错。
2. **`verify:regress` 的基线里没有任何 v1.1 断言**：`research/_raw/ours-baseline/verify.json` = `total=145 · failed=0 · generatedAt=2026-09-29T08:02:33.473Z`，`audience_checks=0`（`contains_v11_audience_assertion=false`），相对 HEAD 是 `132 → 145 / +16`（新增 16 条全是 v1.0 的「已核验」下线 + 中文译文检索 + 锚点几何断言）。所以**「归档基线」并没有把 v1.1 这 4 条浏览器断言钉进去**；它们在 `verify` 里跑，但基线回归比不到它们。

---

## 4. 已知缺口独立复量：`deals.json` 不可由源重建

队长的说法：「把六字段删掉后从零重放与当前文件有 88 处差异，且数字在变大」。**我独立复量的结论是：数字对得上、根因不是"值不对"、性质是"不可复现"而不是"会丢"。**

### 4.1 两种口径的复量

| 复量口径 | 六字段差异数 | 受影响记录数 | 分字段 |
|---|---|---|---|
| **A. 全量重放**：134 条全部剥掉六字段后当 `existing`，再与 32 条策展合并 | **251** | **88** | audience 56 · benefitType 48 · eligibilityDetail 50 · claimRequirements 33 · availability 32 · provenance 32 |
| **B. 真实管线重放**：策展只从人工文件进来（32 条），其余 102 条剥 provenance 后重放（模拟下一轮 `collect.js`） | **203** | **56** | audience 56 · benefitType 48 · eligibilityDetail 34 · claimRequirements 33 · availability 32 |

**队长的"88"是口径 A 的受影响记录数（不是差异数）；真实管线口径是 56 条记录 / 203 处。** 两个数字都对，只是量的东西不同。

### 4.2 根因（逐层定位，不是猜）

1. **差异方向只有一个**：全部是「现在的文件里有值、重放结果里没有」（`sources_where_replay_gained_value=[]`、`fields_whose_value_CHANGED=[]`）。**没有任何值被改写或丢失**，只是**重放产不出它们**。
2. **这 56 条是采集侧条目，不是策展条目**：样例 `2eae0e246de2`（ERNIE-4.5-Turbo-128K，`source=百度千帆`）在 `curated_cn.json` / `curated_global.json` 里**根本不存在**，`id` 也对不上任何人工条目。
3. **`makeDeal` 不生成任何六字段**：`makeDeal(采集记录) 输出六字段 = []`，`regenerated count = 0 / 6`。采集侧每次构造都不会重新产出这些值。
4. 于是这 56 条的值**唯一的保存处就是 `deals.json` 自己**——既不在人工文件里，也不能从采集原始数据重新推出。它们目前只能靠 `dedup` 的「已有记录的值优先」活下来。
5. **`provenance` 是唯一会被重写的一栏**：重放把 `fields` 整块裁掉（多来源不署单一出处），只剩 `contrib` 账本。这与契约 §5.3.2 一致，但意味着 `provenance.fields` 的 127 条声明**只在人工文件那侧可复现**。

### 4.3 我的判断：**这是流程问题为主 + 数据层缺一个落点**，不是"数据写错了"

- **不是数据问题**：值本身有原文依据（`research/v1.1/DATA-BACKFILL.md` 逐条引文），校验全绿，且**没有**被改写。
- **是流程问题**：56 条值的**唯一权威副本是产物 `deals.json`**，而它的"源"（人工文件 / 采集原始数据）里没有这些值。产物成了事实上的源 → 任何从零重放都会"丢"它们，重建性 = 0。
- **稳定性我实测过，可以给一个明确的好消息**（消除"会不会每天变差"的疑虑）：

  | 探测 | 结果 |
  |---|---|
  | 一条带六字段的既有记录，遇到**同一 id 的当晚重新采集**（新记录不含六字段）再 merge | `audience / benefitType / eligibilityDetail / claimRequirements / availability` **5 个值字段全部 PRESERVED** |
  | 同一探测里的 `provenance` | **LOST/CHANGED**（`fields` 被裁、只剩 `contrib`） |
  | `KEYS_LOST_OR_CHANGED` | **1**（仅 `provenance`） |

  ⇒ **不会每天丢值**，`dedup` 的「已知值不得降级/覆盖」是有效的。**变差的只是 `provenance` 的 `fields` 声明与"可复现性"**。

### 4.4 下一阶段怎么修（按性价比排序，给 integrator / 后续阶段用）

1. **给这 56 条值补一个可重建的落点**（根治）。两条路选一：
   - **A. 进人工文件**：把 56 条的六字段作为带引文依据的条目写进 `scripts/data/curated_*.json`（或新建一个 `scripts/data/audience-overrides.json`，与 curated 同格式、同校验、同 audit）。这样它们是**源**，重放自然产得出。
   - **B. 进采集规则**：在 `collect.js` 的来源抽取层把「新用户免费额度 → `newUserOnly:true`」这类**有原文依据**的规则落成代码，由 `makeDeal` 的 `attachAudienceFields` 生成，并让 `audience-audit` 覆盖它。**缺点**：规则化的推断要带 `basis:'inferred' + note`，且必须逐条说得出依据，否则就是回到 v1.0 的假出处。
   
   推荐 **A**（与现有 artificial-file 权威链一致，且不需要新机制）。**副产物**：`validate` 的「有已知值但无出处 56 条」会同时掉到 0——这 56 条与「已知值但无出处 56 条」**恰好是同一批记录**（都是采集侧注入值），一次修复能同时关掉两个洞。

2. **加一条"可从源重建"的守卫**（防回归）。形状建议：`scripts/tools/audience-rebuild.js --check`（已有骨架，现在是 `--dry-run` 报告差异，但**不在任何命令里被断言**）→ 把「`口径B` 差异数 == 0」做成门禁断言，或在 `validate --strict` 里加一条 `checkRebuildable()`。**注意**：加上它之前必须先做第 1 步，否则它会立刻红。
3. **把 `firstSeen`/`sourceUrl` 的一次性回灌变成长期不变量**（§3 声明① 的教训）：`audience-restore-history.js` 是从 `git show HEAD:` 取值的**事后**脚本；应该在 `validate --strict` 里加一条「策展条目的 `firstSeen` 不得等于本轮 `updatedAt` 当天」或「`sourceUrl` 非空」的守卫，让下一轮 merge 再推晚时**当场红**，而不是等发现后再回灌。
4. **归档基线要重新生成**（§3 声明④）：`npm run verify:baseline`（`--json=research/_raw/ours-baseline/verify.json`）需要重跑一次，让 `total` 从 145 升到 155、并把 v1.1 的 4 条受众断言钉进基线；否则 `verify:regress` 对新字段永远"比不到"。

---

## 5. 未达成 / 存疑项（如实列出，不用"应该没问题"代替证据）

### F-1 · 工作区未冻结（过程风险，非产品缺陷）—— 已在本次验证中消解

队长说「工作区当前状态已冻结」，**实测不成立**：我到场时 17:07:52–17:09:04 之间 `dedup.js`/`store.js`/`deals.json` 仍在变，且 `scripts/tools/audience-restore-history.js`（17:08:42）是**新出现**的（队长列的改动清单里没有它）。后果：任何"边改边验"的结论都不可信。**我的处置**：全部命令与反证都在**逐字节快照副本**上复核 + 等现场稳定后在现场重跑整套 12 条（`TOTAL_DRIFTED_FILES=0`）。这一条不作为 fail。

### F-2 · 【中】`report:audience` 的「书写期数据源体检」会给出误导性的全绿 —— 实锤

反证 ④ 暴露的真实缺陷：`curated_cn.json` 里塞进非法枚举 `audience:["wizard"]`（= 一条**会被静默丢弃**的声明）时：

- `validate` / `--strict` / `selftest:audience` **都正确变红**（这一层没问题）；
- 但 `report:audience` 仍然 **EXIT 0**，并且打印 `curated_cn.json：18/18 条可构造为合规记录`。

也就是说：**在被明确告知"有声明被丢了、数据是有问题的"的那一刻，覆盖率报告反而说 18/18 全合规**。这与 §5.2.1「报告与仲裁同一口径」的要求冲突，也是 t1 报的 B1/B2 那一类「声明了却没生效」最容易被重新放过的入口。
**requiredFix**：`audience-report.js` 的第六节应复用 `loadCurated().audienceDropped`（`validate.js checkCurated` 已经在用同一个函数），把落空项列入报告并在非空时**非 0 退出**（或至少打印 `18/18 可构造，但 N 条声明被丢弃`）。

### F-3 · 【中】归档基线未被 v1.1 覆盖 —— `verify:regress` 对新字段无牙

`research/_raw/ours-baseline/verify.json`：`total=145 · audience_checks=0`（相对 HEAD `132 → 145`）。**v1.1 的 4 条受众浏览器断言不在基线里**，所以：

- `verify` 能抓（我 ⑥ 实测 3 条红，这是有效的）；
- `verify:regress` **抓不到**新字段的任何回归（它只比 6 个指标 + 旧断言）；
- 且基线文件本身在 `git status` 里是 **dirty**（`+92 / -28` 行）、`generatedAt` 是 09-29 08:02:33Z，**没有在验证窗口内被写过**（跑前跑后 sha `67AB27A69609` 不变）——所以它是"实现期刷过一次、之后就冻结"的状态。

**requiredFix**：重跑 `npm run verify:baseline`，确认 `total` 含 4 条受众断言，并把该文件提交（它现在是未提交改动）。

### F-4 · 【低】`REQUIREMENTS.md` 已被数据回填甩开，作为验收网已过期

t1 的 `research/v1.1/REQUIREMENTS.md`（第 2 轮核验，2026-09-29 16:45 前）里的判据数字与现在的数据**大面积不符**，若照它验收会误判：

| 条目 | REQUIREMENTS.md 写的 | 实测（本报告） |
|---|---|---|
| audience 覆盖率 | 48/80（60.0%） | **80/80（100.0%）** |
| 学生 | 4/80 | **12/80（15.0%）** |
| 开发者 | 44/80 | **67/80（83.8%）** |
| benefitType | 47/80 | **79/80** |
| 中国可用性 | 27/80（yes 27 / no 0 / unknown 4 / 缺席 49） | **31/80（yes 30 / no 1 / unknown 6 / 缺席 43）** |
| 出处声明 | 48/80 | **32/80（40.0%）** |
| `deals.json` 六字段 | audience 56 · benefitType 48 · eligibilityDetail 31 · claimRequirements 33 · availability 32 · provenance 56 | **88 / 80 / 66 / 65 / 38 / 32** |
| `provenance` credibility | 全部 `collected` | **全部 `curated`** |
| 受众字段落空 | —（当时 6 项红） | **0 处** |
| A1/A2/A3（validate/strict/build） | ✗ EXIT 1 | **✅ 全 EXIT 0** |

t1 文档里带 `✓/✗` 的 43 条本身结构仍可用，但**所有数字格子都已失效**，且它自报的 `needs_revision` 已不适用。**这不算实现方的错**（该文档是 16:45 的快照、数据在 16:55–17:09 才回填），但下游任何"照 REQUIREMENTS.md 逐条打勾"的动作都会得到错误结论。**建议**：t1 重跑一次第 3 轮刷新数字，或在文档头部钉一条"本文件的数字格已被 `research/v1.1/VERIFICATION.md` 取代"。

### F-5 · 【低】`validate --strict` 与报告对 `provenance` 覆盖的口径不一致

- `validateDeal` 的硬拦里**没有**「已知值必须有出处」这条：56 条「有已知值但无出处」的记录**全部合法**，`validate` 只把它当统计打印。
- 而契约 §2.6 明确「`provenance.fields` 必须覆盖这条记录上每一个已知值的字段」，`report:audience` 第四节也按这个口径列出 56 条清单并判定「缺出处」。
- 结果：`--strict` 绿 vs 报告说「56 条缺出处」。两者各自都对，但**同一份契约下有两个相反结论**，读者会不知道该信哪个。**requiredFix**：要么把这条降级写进契约的"目标"而不是"必须"，要么在 `--strict` 里真拦（会立刻红，需要先做 §4.4 第 1 步）。

### F-6 · 【低】`npm run verify:regress` 的 "155 项" 与基线 `total=145` 不同源，易被误读

`verify:regress` 打印 `✅ 验收 155 项`，而它对比的基线文件里是 `total=145`。这两个数字不是同一件事（155 是**本次运行**的断言数，145 是**归档基线**的断言数，回归比对只用 6 个 `metrics` + 同名断言）。不构成缺陷，但**很容易被当成"基线也过了 155 条"**。建议在回归段落打印基线 `total/generatedAt` 的对比行。**已实现的部分**：输出里确有 `基线：research\_raw\ours-baseline\verify.json（生成于 2026-09-29T08:02:33.473Z）`——只是没写 `total`。

### 存疑（未做，明确标注）

- **未做**：真实 GitHub Actions 跑一次（本地无 CI 凭据/网络）。所有 CI 结论都是**静态接线核对**（读 `action.yml` + `check-ci-consistency.js` 实跑 + 反证 ⑧ 证明看门狗有牙），**不是**"CI 真的绿了"。若需要 CI 级证据，得由有权限的一方触发一次 workflow。
- **未做**：`npm run verify:shots`（截图人工目视）。我的详情页结论来自**原始字节读 + 正则取单元格**，比截图更硬（可审计、可复算），但没有像素级视觉确认。
- **未做**：`scripts/tools/migrate-audience-verify.js --before= --after=` 的 AB 比对（需要一份"迁移后"的副本）。已做的是 `migrate.js --audience --dry-run`（EXIT 0、`deals.json` 哈希不变）与未知 flag → `exit 2`。
- **口径提醒（不是存疑，是别读错）**：`selftest:audience` 打印的 `eligibilityDetail 61 / availability 32` 与"键存在口径"的 `66 / 38` 都对，差的是"有键但只有 unknown"的记录；报 `report:audience` 时请全程用**键存在口径**，报 `hasKnown` 覆盖率时用前者。

---

## 6. 验收结论

| 项 | 结果 |
|---|---|
| 12 条命令 + `collect --dry-run` | **13/13 EXIT 0**，且跑前跑后 `TOTAL_DRIFTED_FILES=0` |
| 反证（破坏 → 变红 → 逐字节复原 → 回绿） | **9/9 全部成立**；每次复原都做了 sha256 逐字节确认 |
| 队长声明 ① 旧数据守恒 | ✅ 成立（`changed=0`，三份数据一致） |
| 队长声明 ② provenance 32 条全 curated | ✅ 成立（`{"curated":32}`） |
| 队长声明 ③ 详情页受众行 / unknown 不误渲染 | ✅ 成立（80/80 页，0 反例，纯静态字节读） |
| 队长声明 ④ deals↔dist 一致 | ✅ 现在字节相同（**收到我验证期构建影响**；到达时确实不一致 215 字节 / 32 条） |
| 已知缺口「不可由源重建」 | 复量成立：全量口径 **251 处 / 88 条**，真实管线口径 **203 处 / 56 条**；性质=**不可复现**（不是会丢值），根因=56 条采集侧值无源落点 |
| **总判定** | **`pass`** —— 无红项、无阻断；带 **2 条中等（F-2 / F-3）+ 4 条低** 的改进项，均**不阻断**本阶段交付，但 F-2 与 F-3 建议在合并前修（各一处小改：报告读 `audienceDropped`；基线重生成并提交）。 |

**一句话**：`validate` / `--strict` / `build` / `selftest:*` / `check-ci-consistency` / `verify` / `verify:regress` / `report:audience` **全部真绿**，三态语义与逐字段仲裁**经 9 条反证确有牙齿**（其中 3 条证明「某一层绿 ≠ 其它层绿」，正是把自测接进门禁的理由）；契约的落地质量是可信的。**但"数据可从源重建"这一条当前不成立**（56 条 / 203 处），且**这个问题不会被常规门禁发现**——它不是值错，是这些值目前只活在产物里；下一阶段应先给它们一个源落点（推荐进人工文件），再把"可重建"做成门禁断言。
