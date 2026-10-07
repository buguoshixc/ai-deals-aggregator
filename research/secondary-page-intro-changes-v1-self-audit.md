# Self-Audit — `secondary-page-intro-changes-v1`

> 基线 `origin/master = a57670d` · 逐条回答 prompt §37 的 14 个自查问题 + §23 的允许范围 + §42 的最终成功标准。
> 判定口径：**P0 = 会让读者看到错的东西 / 数据或 SEO truth 变化 / 路由坏掉**；
> **P1 = 规则没落到位、门禁形同虚设、可发现性倒退**；**P2 = 记录在案、有明确处置**。

**结论：P0 = 0 · P1 = 0 · REPAIR_NOW = 0 · DEFERRED(P2) = 2（见 §风险）**

---

## 1. 十四个自查问题

| # | 问题 | 回答 | 证据 |
|---|---|---|---|
| 1 | 所有二级页顶部说明是否真的清空？ | **是。** 45 个目录页里 42 页 `introNotes = 0`，3 个别名页各 1 条**导航更正**（H13 的登记例外） | 构建期结构性扫描（45 页逐页）+ `verify-site` §15b2（3 条需求页 `introNotes === 0`）+ 真浏览器 13 条抽样路由 `introNotes: 1 → 0` |
| 2 | 有没有漏掉某个 page family？ | **没有。** 集合页（3）· 按需求页（10，含 3 别名）· 分类页（5 + 枢纽）· 厂商页（25 + 枢纽）全部在扫描面上；厂商那 25 页的文案是 `landing.js` **算出来的**，只有回读产物才照得到 —— 那条断言正是为此写的 | `build-local.js` 的「二级数据页首屏无说明」逐页扫 `built.directoryPages`（45 条）+ 报告 §2.2 的逐族清单 |
| 3 | 删除后页面是否仍然一眼能看懂？ | **是。** 页面顺序变成「标题 + 条数 + 更新时间 → 摘要 → 表格 →（有变化才有）最近变化 → 分类说明」。被删的 39 句里**能帮读者判读的**全部进了底部折叠（`userNotes`），维护口径早就在 `docs/DESIGN-RULES.md` 的归档里 | 真浏览器无 JS 上下文：折叠正文 88–121 字可读、`summary.textContent === '分类说明'`；narrative 见报告 §2.2 |
| 4 | 无变化页面是否完全没有变化空模块？ | **是。** 40 个目录页的 `chgsecPresent` 全为 false；四类串（「当前没有观察到变化」「为基准」「变更记录自」旧标题形态）在目录页 **0 命中** | `strings-check.cjs` 逐页 + `digest`（41 → 1，剩下那 1 个是 `/changes/`）+ `selftest:changes` ⑩ |
| 5 | 有变化页面是否仍然能看到真实变化？ | **能。** 非空分支：标题「最近变化」、≤3 条、每行 `(id, 日期)` 都能在雷达事件里逐条命中、顺序 = `renderOrderOf()`、入口指向 `/changes/` | `selftest:changes` ⑩ 18 条 + fixture 真浏览器量测（1440/390/360、亮/暗、无 JS） |
| 6 | 有没有把 `/changes/` 本身删坏？ | **没有。** `/changes/` 在 Before/After 的**全部摘要字段**上零差异（分栏 7 个、起算日、基准日、免责句、折叠块「不计入高价值的其他变化」全在） | `diff-verify.json`（`/changes/` 不在任何差异清单里）+ `strings-check.cjs` 的 `/changes/` 段 |
| 7 | 有没有改数据？ | **没有。** 854 行 / 735 个详情链接 / `itemIds` 集合逐条相同；`deals.json` / `plans.json` / `api-plans.json` / `models.json` / 三份 history **一个字节都没动** | `diff-verify.json` 的 `dataDiffCount = 1`（唯一一条是 `/need/student-only/` 多了一块 `userNotes` 折叠，见下） |
| 8 | 有没有改分类？ | **没有。** 所有判据函数、`NEED_PREDICATES` / `COLLECTION_PREDICATES` / `CATEGORY_PREDICATES`、`criteria` 字段一字未改；`audience-selftest` 新增一条断言守着「每条按需求页仍保留机器可读 `criteria`」 | `selftest:audience` 205/0（含 §9 新增四条 + §8 的判据分布：student-only 12 · edu-identity 7 · no-card 1 · china-usable 30 · free-tier 60 · free-api 45 · free-tokens 44 · ai-coding 4 · free-model 12 · dev-credits 67，与 Before 逐条相同） |
| 9 | 有没有改路由？ | **没有。** 186 个页面全部仍在（含 3 个别名页），sitemap 183 条不变，模块入口复用既有 `/changes/`，没有新造任何 URL | `digest` 路由集合逐条相同 + 构建期「sitemap 成员逐个对账」 |
| 10 | 有没有改 SEO truth？ | **没有。** `canonical` / `<title>` / `<meta description>` / `robots` / JSON-LD（每段 sha256）186 页逐条相同 | `diff-verify.json`（这些字段 0 差异） |
| 11 | 有没有影响分类说明 disclosure？ | **没有。** 45 个目录页仍各有一个 `details.page-notes`（`/need/student-only/` 是本轮唯一新增的，因为它的迁移句此前无处安放）；§15b3 六条断言全绿 | `verify-site` §15b3 + `verify:regress` 867/0 |
| 12 | 首屏几何是否真的提前？ | **是。** 标题底边 → 首个数据区顶边 **41px → 9px**（13 条抽样路由）；别名页 94px → 61px | 报告 §7.1 + `geometry.json` |
| 13 | 移动端 / 暗色 / 无 JS？ | **全过。** 1440 / 390 / 360 横向溢出 **0 页**；暗色下模块走 token（`rgb(15,23,42)` → `rgb(232,236,242)`，背景透明 —— 没有硬编码白底）；无 JS 下模块 / 表格 / 折叠说明全在 DOM | `geometry.json` 的 `fixture.dark` / `fixture.noJs` / 各档 `overflowX` |
| 14 | 有没有「断言还绿、守的东西已经不在页面上」的失效？ | **本轮修掉两处、新增两处防线。** ① §15b2 的 `introChars > 0` 在首屏说明删除后恒为 0 —— 已重瞄为「说明条数 = 0」；② §22c 的五个变异牙靶页 `student/` 不再有页面级说明 —— 已改靶 `need/student-only/`；③ 新增构建期「首屏说明 = 0」结构性断言；④ `audience-selftest` 的 `userIntro` 回流牙 | 报告 §5 的逐条重瞄表；`selftest:audience` / `selftest:changes` 项数只增不减（205 / 119） |

---

## 2. 顺带修掉的两个真实缺陷（都属于「扫描面照不到」，本轮实测发现）

| # | 缺陷 | 影响面 | 修法与证据 |
|---|---|---|---|
| D1 | 构建期两条 `.snote` 扫描用 `/<p class="snote"[^>]*>/`，对 `<p class="snote aliasnote">` **0 命中** | 3 个别名页上的内部措辞（`benefitType 含 free_api`）从来没被任何守卫看见 | matcher 改成 class token 级（`\bsnote\b` / `\bvsnote\b`）；`selftest:changes` ⑪ 三条正反例探针（旧 matcher 0 命中 / 新 matcher 命中 / 不误命中 `.vsnote`）；`scripts/data/landing-aliases.json` 里那句内部措辞去掉 |
| D2 | 同一处修复照出 `<p class="snote mnone">` 里的字面反引号（`` `supportedModels` ``） | **45 个模型详情页**上读者看到 2 个反引号 | 按仓库既有约定改成直接写字面量；45 页各 −2 字符，是唯一一处超出两条 UX 范围的可见文本变化，已在报告 §4.2 单列 |

> 两个都不是「本轮改坏的」，是**本轮的量测把它们照出来的**。按仓库纪律（「误报的处置是改文案」），
> 都做了改文案 + 补断言，而不是把词从禁词表里删掉或加一条豁免。

---

## 3. prompt §23 的「允许变化范围」逐条对照

| 允许项 | 本轮实际 |
|---|---|
| 删除顶部 explanatory intro | ✅ 41 条（39 条进折叠、2 条枢纽句直接删） |
| 隐藏无内容的 recent changes | ✅ 40 页 |
| 简化 recent changes heading | ✅ 固定「最近变化」（`CHANGES_LABELS.recent`，两端同源断言守着） |
| 简化 recent changes metadata | ✅ 基准日 / 起算日从二级页移除，只留 `/changes/` |
| 调整 recent changes 的轻量 HTML | ✅ 9 条作用域 CSS + 模块头（标题 + 全站同词的「全部变化 →」） |
| **不允许**：数据行 / 标题 / 门槛 / 链接 / 排序变化 | ✅ 一条没动（`dataDiffCount = 1`，且那条是**新增折叠说明**，不是数据） |

---

## 4. 自我否证（试过但**没有**采用的两条路）

| 想法 | 为什么放弃 |
|---|---|
| 把「最近变化」模块在日志不可用时也渲染一行「没拿到历史日志」 | prompt §9/§13 要的是二级页只回答「有没有值得注意的变化」；而 `availability !== 'ok'` 时雷达本来就是空的，多一条分支 = 多一套要维护的措辞。处置写进 H14 与代码注释，并在报告 §9-R3 单列（改回来只需 1 个分支 + 1 条断言） |
| 把 41 条说明**全部**搬进 `userNotes` | 两个枢纽页那句与渲染层的共享句 `SHARED_NOTES.hubMissing` 完全同义 —— 搬过去就是同一句话在页面上出现两遍。`audience-selftest` 里新增了一条反向断言把「我们决定不搬」写成可执行形式 |
| 为这一块新造 `/changes/?tag=…` 深链 | 那不是既有稳定路由（prompt §12 明确不要），入口继续用 `/changes/` |

---

## 5. 风险（P2，记录在案）

| # | 风险 | 处置 |
|---|---|---|
| R1 | 生产数据下没有二级页存在相关变化 ⇒ 非空分支只有合成 fixture | 用**真实渲染函数** + 真浏览器 fixture 验证；不伪造生产事件。数据侧一旦产生相关事件，模块会自然出现 |
| R2 | 正文下限余量最薄降到 **50 字**（`/need/no-card/`） | 迁移句进折叠（正文长度只掉那一句与空模块）；构建期 `thin-content` 与 `verify:seo` 两处独立判定全过；**不调低下限公式** |
