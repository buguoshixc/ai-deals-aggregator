# lead-card-insite-v1 收尾报告（B 类资讯线索站内卡 + excerpt 字段）

- 分支 `feat/deals-supply-2026-11`，收尾起点 HEAD **`6df2751`**（工作区已有 16 个文件的 B 类功能改动，
  本轮**不重写、不重排块序、不加字段**）
- 日期 2026-11-11 · 起点数据日 **`2026-11-10T00:38:06+08:00`** · 起点 `deals.json` count = **210**
- 本轮只做四件事：① 删手编 excerpt ② 真跑一次 leads 源采集 ③ 重建陈旧 `dist/` ④ 全门禁 + 三颗牙 + 两笔提交
- 边界（逐条遵守）：不加 kind、不动 `page-kinds.js`、不动 7 天 TTL / 三闸 / type 语义、不做独立页 /
  `/leads/` 索引 / sitemap 改动、不放宽任何现有断言、不手编任何 excerpt、不补「暂无摘要」占位句

---

## 0. 起点核对（与任务描述的逐处对照）

动手前逐处读过，全部与任务描述一致（行号为收尾起点工作区）：

| 描述 | 实测位置 | 结果 |
|---|---|---|
| `MAX_EXCERPT_LENGTH = 240` | `scripts/lib/schema.js:36` | ✓ |
| cleanText 清洗 excerpt | `scripts/lib/schema.js:479` | ✓ |
| 只在有值时追加（无值不写 null） | `scripts/lib/schema.js:555-559` | ✓ |
| `validateDeal` excerpt 形状校验 | `scripts/lib/schema.js:643-655`（字符串 / 空串 / 超长 / 垃圾特征） | ✓ |
| `allowed` Set 已登记 excerpt | `scripts/lib/schema.js:668-674` | ✓ |
| `toDraft` 带 `excerpt: item.description`、「五个事实」自述 | `scripts/collectors/leads.js:140-171` | ✓ |
| 链接 / 锚点唯一构造点 `identityOf` | `scripts/lib/changes.js:433-478` | ✓ |
| 条带 `changes/#anchor`（无 target） | `index.html:4172-4173` | ✓ |
| `leadCardHtml` 块序 / 唯一 CTA | `index.html:4228-4272` | ✓ |
| `changesRowHtml` 按 `item.lead === true` 分支 | `index.html:4281-4283` | ✓ |
| 卡内 CSS | `index.html:665-698` | ✓ |
| 断言 4506 / 4602 / 4611 / 4623 / 4884 / 4911-4986 / 4990 / 5003 / 5075 | `scripts/tools/verify-site.js` 对应行 | ✓ |
| ai-selftest 7 键形状 / summaryOf 逐字 / makeDeal / validate | `scripts/tools/ai-selftest.js:924-1008` | ✓ |
| `history.js` UNTRACKED_FIELDS 登记 excerpt | `scripts/lib/history.js:108` | ✓ |
| fixture expected 已含 excerpt | `scripts/data/fixtures/leads_*.feeds/expected.json`（8 个） | ✓ |

**起点陈旧产物证据**（③ 的对象）：工作区 `index.html` mtime `2026-11-10 21:53:40`，`dist/index.html`
mtime `2026-11-10 21:48:35`；`dist/index.html:4350` 仍是
`'<h3 class="lctitle"><a href="' + escapeAttr(extHref) + '">' + …`（标题外链），
`dist/changes/index.html:1669` 的线索卡同时印着**手编引文**与**标题外链**（两个跨域链接）。
即：最后一次修改之后没有构建过。

---

## 1. ① 删除手编 excerpt —— 已完成（它只存在于工作区，未进过任何提交）

- 位置：`deals.json:3342`，记录 `id = 3eac4b6acccb`（快科技 · 标题
  「每天白赚几百 AI大模型免费薅羊毛：DeepSeek、GPT等全都有」· `url = https://news.mydrivers.com/1/1164/1164402.htm`
  · `firstSeen = 2026-11-09`）
- 被删掉的那句（与原文毫无关系）：
  `"excerpt": "本周限时免费：DeepSeek 等大模型均可免费使用，具体活动规则与截止时间以原文为准。"`
- **为什么它是伪造引文**：同一条记录在 fixture 快照上的真实管线输出是
  `scripts/data/fixtures/leads_mydrivers.feeds/expected.json` 第 1 条（文件内第 19 行）：
  「快科技11月9日消息，AI用过就回不去，大家发愁的都是Token够不够，其实每天可以免费领取的Token羊毛就有几百块了，别轻易错过。知名AI大V@数字生命卡兹克不仅开源了他自己做出来的AIHot网站，今天还增加了一个很有用的新功能——Token羊毛，汇总了网上各种免费白嫖Token的方案，点击直达就能领取。这些Token羊毛可能每一个项目并不多，但架不住能白嫖的太多了，加起来一天也有几百块的额度」
  —— 手编那句和原文毫无关系，而旧 `dist/` 会把那句印在 `blockquote` 里、底下标
  「—— 摘录自快科技的 RSS 原文（仅清理空白，未改写）」＝**带出处的伪造引文**。
- 做法：**整行删除**（不改 null、不改空串、不补一句真的），该记录其它字段一个未动；
  `schemaVersion` / `updatedAt` / `count` 一个未动。
- 验证读数：
  - `git diff -- deals.json` → **空**（该手编行原本是**未提交**的工作区改动 `+2/−1`，删掉后
    `deals.json` 回到 HEAD `6df2751` 的字节；因此 feat 提交里**不含 deals.json diff** ——
    「数据清理」的产物是「工作区回到已提交真值」，而不是一次新的数据提交）
  - `grep -c "本周限时免费：DeepSeek 等大模型均可免费使用" deals.json` → **0**
  - `grep -c '"excerpt"' deals.json` → **0**；记录 `3eac4b6acccb` 的 `excerpt` 键**缺席**（不是 null）
  - `node -e` 解析通过：`count = 210`、`updatedAt = 2026-11-10T00:38:06+08:00` 未变

---

## 2. ② 只跑 leads 源采集 —— 真实管线跑了，但本轮**零产出、未写盘**（按设计）

命令（`--list` 确认 8 个 leads 源；**没有**跑全量 collect）：

```bash
node scripts/collect.js --only=leads_ithome,leads_36kr,leads_qbitai,leads_ifanr,leads_sspai,leads_geekpark,leads_mydrivers,leads_tmtpost
```

采集报告读数（8 个源全部真实抓 RSS、真实解析）：

| 来源 | RSS 条目 | 7 天窗口内 | 三闸命中 |
|---|---:|---:|---:|
| IT之家 | 60 | 60 | 0 |
| 36氪 | 30 | 30 | 0 |
| 量子位 | 10 | 10 | 0 |
| 爱范儿 | 20 | 20 | 0 |
| 少数派 | 10 | 10 | 0 |
| 极客公园 | 30 | 21 | 0 |
| **快科技** | **100** | **100** | **0** |
| 钛媒体 | 14 | 14 | 0 |

- 合计：**8 个来源，产出 0 条，合格 0 条，采集器失败 0 个**。
- 结果：`❌ 本次采集零产出（本轮实际运行 8 个来源都没有可发布的条目），跳过写盘。既有 deals.json 未被改动；确需照写请加 --force`（退出码 1）。
  这是仓库写明的设计：**零产出不写盘**（「零产出还要照写 updatedAt/策展 lastSeen，等于把一次失败伪装成
  '刚更新过'」）。**没有使用 `--force`**，也没有为了「让字段落盘」去造执行环境。
- 证据：采集前后三个数据文件 SHA-256 完全一致（未写盘）：
  - `deals.json` = `90e8e650046ba0def42482d869df6bdebe5e43fe79e50396dcfa3d037ec27c81`
  - `scripts/data/deal-history.json` = `5d4ddd3830f74438db3b69fb79ba9414721357223aa15bdf8c8388d3f1f66c55`
  - `scripts/data/source-health.json` = `5490690a25446c76b0cd86c1f7218bc8e794eef762f2cb48f0f5671f2e5b0b11`
- 于是本轮时间陷阱**没有被触发**：数据日仍是 `2026-11-10`，那条 `2026-11-09` 的线索仍在
  7 天窗口内、`created` 事件日 = 基准日，卡片仍在 `/changes/` 的「今日新增」分栏。

### 那条线索的 excerpt 写回情况：**仍为空（字段缺席），如实记录、未手补**

- `grep -n '"source": "快科技"' deals.json` → 1 条（`deals.json:3325`），记录 `3eac4b6acccb`
  **没有 `excerpt` 字段**。
- 原因：11-09 那篇 Token 羊毛文章已滚出快科技当前 RSS（100 条全部落在 7 天窗口内，但三闸命中 0），
  真实管线本轮没有产出这条线索 → 没有真值可落。按任务纪律：**接受 excerpt 为空，绝不手补**；
  这条线索本轮就是「无引文渲染」，卡片必须整块省略引文（见 §3 / §4 的 DOM 读数）。
- 真值参照仍在 fixture（`expected.json`，上面的逐字文本）——它钉住的是**解析器输出**；
  本轮 `npm run fixture:test` 8 个 leads fixture 全绿（§4）。
- 顺手门禁（采集动了数据就应先确认的两条）：
  - `npm run validate` → `✅ 校验通过`（6 条警告全部是既有的「疑似同一优惠未合并」别名提醒，与本轮无关）
  - `npm run check:history` → `✅ 历史可重建：基线 + 事件重放逐字段等于当前 deals.json，且生命周期成对。`
    （81 条事件 · created=76 / updated=2 / benefit_changed=3）

> **诚实标注**：本轮没有完成「excerpt 真值端到端落盘」的验证 —— 采集零产出，真值没有可写回的对象。
> `excerpt` 从草稿到 `deals.json` 的链路仍由 `ai:selftest`（makeDeal 白名单 / validate allowed /
> 240 截断）与 `fixture:test`（`summaryOf` 逐字）覆盖；RSS 真值 → 落盘的实跑留待下一次有产出的采集日。

---

## 3. ③ 重建陈旧产物 —— `npm run build`（写共享 `dist/`）

- 构建前已确认没有别的会话在跑构建/浏览器（`ps` 无相关进程；`dist/` 无锁）。
- 构建读数：`✅ 产物自检通过` · `✅ 构建完成 → dist/（自检全过，已从暂存目录就位）`；
  `变化雷达: 可用 · 基准日 2026-11-10 · 今日新增 3 · 最近 7 天变化 48 · 即将结束 7 …`
- 重建后证据：
  - `dist/index.html:4350`（与旧版同一行）已变成 `'<h3 class="lctitle">' + radarTitleHtml(item) + '</h3>'`
    —— **标题纯文本，不再外链**；全文件 `lctitle"><a href="http` 命中 0。
  - `dist/changes/index.html` 的线索卡：`<h3 class="lctitle">每天白赚几百 AI大模型免费薅羊毛：…</h3>`（纯文本）
    + `.lcdecl`（线索 · 未核验）+ `.lcbasis` + `.lcactions`；**没有 `blockquote.lcexcerpt`**（excerpt 缺席 ⇒ 整块省略）、
    **没有一个「暂无摘要」占位句**；卡片范围内唯一的 `<a>` 是 `a.lccta`
    （`href=https://news.mydrivers.com/1/1164/1164402.htm`、`target=_blank`、`rel="noopener noreferrer"`）。
  - 手编引文在重建后的 `dist/` 中已不存在（全站 `grep` 该句 0 命中）。
- `dist/` 在 `.gitignore`（deploy 上传它，但不提交它）；本轮重建是**为了验证**，不是为了提交。

---

## 4. ④ 门禁全跑 —— 读数（按任务顺序，前一步绿了才进下一步）

> 执行方式：用 `package.json` 里每个 npm script 对应的 node 命令直接执行（与 `npm run <name>` 同一脚本）。
> L4 需要真浏览器：本机 `verify-site.js` 默认 `DSH_EDGE` 是 Windows Edge 路径，不可用；
> 本轮按 `docs/BUILD.md` 的约定设 `DSH_EDGE` 指向 Playwright 的 chromium-1243，并把
> `libnspr4 / libnss3 / libasound2t64` 三个 .deb 解到 `/tmp` 后以 `LD_LIBRARY_PATH` 注入
> （**宿主环境适配，不落仓库、不改代码**）。

| # | 门禁 | 退出码 | 实测读数 |
|---|---|---|---|
| 1 | `ai:selftest` | 0 | `AI 自检 135 项 · 失败 0`（其中 excerpt 相关 6 条断言全绿：保留并清洗 / allowed / 垃圾丢弃不写 null / 240 截断 / 拒绝非字符串 / 拒绝超长） |
| 2 | `fixture:test` | 0 | `fixture 14 项 · 失败 0`；8 个 leads fixture 全部「8 条与期望一致」（含 excerpt） |
| 3 | `validate` | 0 | `✅ 校验通过`（警告 6 条 = 既有别名提示） |
| 4 | `test:strict` | 0 | `✅ 校验通过（strict 模式）` |
| 5 | `build` | 0 | `✅ 产物自检通过` · `✅ 构建完成 → dist/` |
| 6 | `verify:seo` | 0 | `SEO 验收 18 项，失败 0 项` · sitemap entries 213 · orphan 0 · duplicate canon. 0 · invalid links 0 |
| 7 | `selftest:changes` | 0 | `=== v1.5 变化雷达演练：120 项通过，0 项失败 ===` |
| 8 | `gate:build`（L1-L3） | 0 | `合计 24.4s / 40 个脚本，失败 0` · `✅ 全部通过` |
| 9 | `verify`（L4 真浏览器） | 0 | `✅ 验收 948 项，失败 0 项` |

L4 里线索卡的实际读数（原文，**N = 1 ≥ 1，卡片结构断言真的被执行了**）：

```
✓ 线索卡在场性：窗口内有线索 ⇒ /changes/ 上必须有线索卡；窗口内没有 ⇒ 卡片也必须为 0 — 窗口内 1 条线索 · 页面 1 张卡
✓ /changes/ 的 created 分栏里线索渲染成结构不同的线索卡（article.leadcard id=lead-<id>，不是普通变化行） — 1 张：lead-3eac4b6acccb@created
✓ 线索卡块顺序：标题 → 来源媒体+原文日期 → 未核验声明 → 摘录引文（有则出）→ 判据与下架说明 → CTA — lctitle>lcmeta>lcdecl>lcbasis>lcactions
✓ 未核验声明压在摘录引文上方，且文本来自 SOURCE_WORDING.SOURCE_TYPE.lead（「线索 · 未核验」） — 1 张卡声明块全部合格
✓ 线索卡只有一个可点链接 = 「阅读原文 →」CTA（href=原文、target=_blank、rel 含 noopener noreferrer） — 1 张卡各 1 个 CTA
✓ 线索卡内容与记录一致（标题 / 来源 / 原文日期 / 摘要引文；无 excerpt 时整块省略、不写占位句） — 1 张卡逐项对齐
✓ /changes/ 的 ItemList 不含线索（线索没有站内详情页，不能进结构化数据） — ItemList 30 项 · 线索 1 条均未出现
✓ /changes/ 的线索不进 sitemap（无 /deal/<lead-id>/ 或线索独立页） — sitemap 里没有线索 id
✓ 全站跨域链接只剩线索卡里的那个 CTA（逐文件：指向线索原文的外链数 == 线索卡张数，且每条都是 .lccta） — 1 条指向线索原文 · 非 CTA 0 条 · 线索卡 1 张（/changes/ 字面 1 张 / DOM 1 张）
```

> 注意块顺序读数 `lctitle>lcmeta>lcdecl>lcbasis>lcactions`：**没有 lcexcerpt** 是本轮的真实状态
> （excerpt 缺席 → 整块省略），不是断言被跳过；`expectedBlocks()` 对「无引文」本来就按 5 块判。

另：条带相关读数 `1 条线索项 · 不合格 0 条`、`条带内零跨域链接`、`首页条带 → /changes/ 的线索锚点真实存在`
也全绿；首页卡片成员集合 `卡片 106 个成员 id · 线索 1 条均未出现`。

---

## 5. 三条牙测试（每次：改坏 → build → verify → 红在预期 → 逐字节还原 → build）

### 牙 A：把线索卡标题改回外链

改坏：`index.html` 的 `leadCardHtml` 标题行
`'<h3 class="lctitle">' + radarTitleHtml(item) + '</h3>'`
→ `'<h3 class="lctitle"><a href="' + escapeAttr(extHref) + '">' + radarTitleHtml(item) + '</a></h3>'`。

- `build`：退出码 0（构建自检不抓这个，**真浏览器门禁才抓**）
- `verify`：退出码 1，`❌ 验收 948 项，失败 2 项`，红在这两条（原文）：

```
✗ 线索卡只有一个可点链接 = 「阅读原文 →」CTA（href=原文、target=_blank、rel 含 noopener noreferrer） — 1/1 张不合格
✗ 全站跨域链接只剩线索卡里的那个 CTA（逐文件：指向线索原文的外链数 == 线索卡张数，且每条都是 .lccta） — 2 条指向线索原文 · 非 CTA 1 条 · 线索卡 1 张（/changes/ 字面 1 张 / DOM 1 张） · 卡数≠外链数的文件：changes/index.html(1/2)
```

- 还原：`index.html` SHA-256 回到改坏前的 `bb704909858501ba72edfff2a887ef88e8a4a0accca615b580b3fb3cd7a99483`；
  `build` 退出码 0。

### 牙 B：删掉未核验声明 `<p class="lcdecl">…</p>`

改坏：卡片拼装 `meta + decl + quote + basis + actions` → `meta + quote + basis + actions`（卡片里不再有声明块）。

- `build`：退出码 0；`verify`：退出码 1，`❌ 验收 948 项，失败 2 项`，红在这两条（原文）：

```
✗ 线索卡块顺序：标题 → 来源媒体+原文日期 → 未核验声明 → 摘录引文（有则出）→ 判据与下架说明 → CTA — 「lead-3eac4b6acccb」=lctitle>lcmeta>lcbasis>lcactions
✗ 未核验声明压在摘录引文上方，且文本来自 SOURCE_WORDING.SOURCE_TYPE.lead（「线索 · 未核验」） — 1/1 张不合格
```

- 还原：SHA-256 同上 `bb7049…`；`build` 退出码 0。

### 牙 C：把 `3eac4b6acccb` 的 `type` 改成 `deal`（并补 discountInfo，避免先红在「deal 必须有优惠说明」）

改坏：`type: "tool"` → `"deal"`，`discountInfo: null` → `"限时免费活动：AI 大模型可免费使用，具体规则与截止时间以原文为准。"`

**实测比预期更早被咬住**：`build` **退出码 1**，`❌ 产物自检失败（3 项）` ——

```
✗ 变更记录（v1.4）：3eac4b6acccb · 优惠说明: 现状与历史不一致（文件 限时免费活动：AI 大模型可免费使用，具体规则与截止时间以原文为准。 / 日志 null）；3eac4b6acccb · 记录类型: 现状与历史不一致（文件 deal / 日志 tool）
✗ 变化雷达（v1.5）：changes/ 漏了 1 条可链接条目（如 3eac4b6acccb）；changes/ data-item 行 3eac4b6acccb 在页面上没有对应链接（行与链接分了家）
✗ 关系式不成立：.ddesc 在产物里 110 次，但要求 >= 1 × 详情页数（111）= 111 —— 每张详情页一条来源行（`.ddesc` 就是那 17 页唯一的来源说明）。关系式的取用理由：它把阈值型下限的 25% 余量收成 0（数据收缩时基准量跟着产物走，不是静态快照）。
```

build 失败 ⇒ `dist/` 保持上一次成功构建（未被替换），因此继续跑 `verify`（data 层不变量读仓库根 `deals.json`，
与产物无关）：退出码 1，`❌ 验收 948 项，失败 1 项`，红在这条（原文）：

```
✗ 线索记录 type 仍是 tool（来源登记为 lead ⇒ type=tool；改成 deal 会混进优惠列表/计数/ItemList） — 1 条线索 · type 非 tool 1 条（3eac4b6acccb→deal）
```

- 与任务预期的偏差（如实记录）：任务预期「4506 + 4623/4990 同时被咬」。实际：
  1. **build 的产物自检先咬住 3 条**（见上），所以 `verify` 拿不到「type=deal 的 dist」，只在 data 层红 4506 一条；
  2. `4623`（线索不进首页优惠列表/筛选器）**不会**因 type 变化而红 —— 首页卡片的排除判据是
     `sourceFacts.sourceType === 'lead'`（`index.html:3119-3127`，与 `type` 无关），这是设计上的双保险；
  3. `4990`（ItemList 不含线索）/ `5003`（sitemap）在**判据层**已确认会咬：用仓库真数据 + 仅把该记录
     `type` 换成 `deal` 做只读计算，`changes.itemListRecords()` 从 30 项变 31 项并**包含** `3eac4b6acccb`
     （`type=tool` 时不含）—— 也就是「若 build 放行、dist 被替换，ItemList 会把线索 id 收进去」。
- 还原：`git diff -- deals.json` **空**（`type`/`discountInfo` 回到 `tool`/`null`，`count`/`updatedAt` 未动）；
  `build` 退出码 0。

---

## 6. 已知缺口与风险（本轮不修，按任务纪律登记）

1. **excerpt 目前无门禁可验（已知缺口，任务点名留到下一轮）**：门禁手里没有 RSS 真值可比，
   手编引文（包括本轮删掉的那句）**只能靠人工看出来**；卡片会把它印在 blockquote 里并标「摘录自…原文」，
   页面本身没有任何异常。本轮删掉的那句正是这个缺口的实证。**没有**顺手加「fixture 驱动的 summaryOf 离线保护断言」——
   那是本轮之后的事。
2. **窗口内 0 条线索时，卡片结构断言整组静默跳过（结构性盲区）**：`verify-site.js:4911-4986` 的每条断言都写成
   `!expectLeadCard || …`，`expectLeadCard=false` 时整组视为通过。所以「verify 绿」不等于「线索卡被验证过」；
   **本轮 N = 1（窗口内 1 条线索 · 页面 1 张卡），卡片断言真的执行了**；若哪天输出是「本轮 0 条线索」，报告必须写
   「本轮卡片结构断言未被执行」，不能当通过。
3. **（本轮新发现，下一轮需处理）数据日推进会让线索卡从 `created` 分栏移到 `changed` 分栏，而
   `verify-site.js:4920` 要求 `card.section === 'created'`**。线索的 `created` 历史事件 `at` 是「首次收录的数据日」；
   数据日一旦推进到次日（例如下一次有产出的采集把 `updatedAt` 推到 2026-11-11），
   `lib/changes.js` 会把它从「今日新增」移进「最近 7 天变化」（真实行为，非缺陷），而门禁仍要求它在 created ⇒
   **下一次数据更新后该断言会红**。本轮因为采集零产出、数据日没推进，所以没有触发。只读模拟读数（仓库真数据，
   `buildRadar({asOf:'2026-11-11'})`）：线索项出现在 `changed` 分栏（`3eac4b6acccb@changed`），
   `changed` 仍会渲染 `article.leadcard`；按现行断言，届时唯一红点应是 4920（4911/4929/4941/4955/4982/5075 仍应绿）。
   建议下一轮把期望分栏按历史事件日推导（`at === asOf ? 'created' : 'changed'`），**不要**为了让它留在 created 去改 TTL / firstSeen。
4. **excerpt 真值端到端落盘本轮未发生**（采集零产出；见 §2 的诚实标注）。
5. 本机 L4 的浏览器依赖需要宿主适配（`DSH_EDGE` + 三个系统库解包注入），这是环境事实，不是仓库改动；
   CI 的探测步骤与本机不同，故报告只记录本轮实际命令与读数。

---

## 7. 越界检查 / 最终 diff

- 最终工作区改动 = **16 个文件**（`index.html`、`scripts/collectors/leads.js`、8 个 leads fixture、
  `scripts/lib/{changes,history,lead-radar,schema}.js`、`scripts/tools/{ai-selftest,verify-site}.js`），
  合计 `+793 −133`；`deals.json` / `deal-history.json` / `source-health.json` 与 HEAD **逐字节一致**（本轮无数据 diff）。
- `git diff --name-only` 中没有：`page-kinds.js`、sitemap 生成器、TTL 常量、type 语义相关文件；
  `lead-radar.js` 的 diff 只有 4 行注释（把「四个字段」改成「五个事实」，无判据/常数变化）。
- 没有新增 kind / 独立页 / `/leads/` 索引；没有放宽任何既有断言（本轮只在牙测试中临时改过 `index.html`，
  已按 SHA-256 逐字节还原；`verify-site.js` 本轮未编辑）。
- 三条牙测试的改坏现场都已还原：`index.html` SHA-256 = `bb7049…`（与改坏前一致）、
  `deals.json` `git diff` 为空，且每次还原后都重新 `build` 成功。

## 8. 提交

- `feat`：**`ef07ffd`** —— B 类资讯线索站内卡 + excerpt 字段（工作区已完成的实现与断言一并入库；
  含 8 个 fixture 的 excerpt 期望；16 files / +793 −133）；提交说明里写明「手编 excerpt 删除后
  `deals.json` 与 HEAD 逐字节一致、本提交无 deals.json diff」
- `docs`：本报告 + `research/lead-card-insite-v1-self-audit.md`
- **没有**提交 `dist/`（gitignore；deploy 上传的是它，重建只为验证）
