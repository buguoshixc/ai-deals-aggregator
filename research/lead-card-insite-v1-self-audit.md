# lead-card-insite-v1 自审（B 类资讯线索站内卡 + excerpt 收尾）

- 任务：lead-card-insite-v1（收尾轮）；观测/执行日 **2026-11-11**（Asia/Shanghai）；分支
  `feat/deals-supply-2026-11`，收尾起点 HEAD **`6df2751`**
- 报告：`research/lead-card-insite-v1-report.md`
- 本轮性质：功能代码已在工作区，**本轮的交付是「清理 + 重建 + 门禁 + 三颗牙 + 留痕」**，不是重新设计

## 1. 我亲自核过的（有读数）

| 自问 | 读数 |
|---|---|
| 任务描述的每一处实现都在、且行号对得上？ | 是。逐处读过并列表对照（报告 §0）：schema 36/479/555-559/643-655/668-674、leads 140-171、changes 433-478、index.html 4172/4228-4272/4281-4283/665-698、verify-site 4506/4602/4611/4623/4884/4911-4986/4990/5003/5075、ai-selftest 924-1008、history 108、8 个 fixture。**没有发现与描述不一致的地方** |
| 起点 `dist/` 真的是旧的？ | 是。`dist/index.html:4350` 初读是 `'<h3 class="lctitle"><a href="' + escapeAttr(extHref) + '">…`（标题外链）；`dist/changes/index.html` 的线索卡印着手编引文 + 标题外链（跨域链接 2 条）。`index.html` mtime 21:53:40 > `dist/` 21:48:35 |
| 手编 excerpt 删干净了吗？ | 是。`git diff -- deals.json` 空（它原是未提交的 `+2/−1`）；`grep -c` 该句 = 0；`grep -c '"excerpt"' deals.json` = 0；记录 `3eac4b6acccb` 无 excerpt 键；`count=210`、`updatedAt=2026-11-10T00:38:06+08:00` 未动；`node` JSON 解析通过 |
| 采集是「只跑 leads」吗？ | 是。`--only=leads_ithome,leads_36kr,leads_qbitai,leads_ifanr,leads_sspai,leads_geekpark,leads_mydrivers,leads_tmtpost`（8 个），没有全量 collect；没有用 `--force` |
| 采集真实跑了吗？ | 是。8 个源都抓到 RSS 并解析（IT之家 60 / 36氪 30 / 量子位 10 / 爱范儿 20 / 少数派 10 / 极客公园 30→21 窗口内 / 快科技 100 / 钛媒体 14），**三闸命中全部 0**，采集器失败 0 个 |
| 采集写盘了吗？ | **没有**。零产出 ⇒ 设计上跳过写盘、退出码 1；前后三个数据文件 SHA-256 完全一致（报告 §2 贴了三个 hash）。没有为了让字段落盘去加 `--force` 或改数据 |
| 11-09 那条线索的 excerpt 写回了吗？ | **没有，仍为空（字段缺席）**。快科技当前 RSS 100 条里已无 11-09 那篇 Token 羊毛文章、三闸命中 0；按纪律**接受为空、绝不手补**，本轮按「无引文渲染」验证 |
| 数据日推进导致的时间陷阱触发了吗？ | **没有**。采集零产出未写盘，数据日仍是 2026-11-10，线索仍在 7 天窗口且 created 事件日 = 基准日，卡片仍在「今日新增」；这也是本轮门禁能全绿的前提（风险见 §3） |
| 旧产物重建后还对吗？ | 是。`npm run build` 自检全过；`dist/index.html:4350` = 纯文本标题（`lctitle"><a href="http` 全文件 0 命中）；`/changes/` 卡片 = 纯文本标题 + lcdecl + lcbasis + 唯一 `a.lccta`，**无 blockquote.lcexcerpt**、无「暂无摘要」占位句 |
| 9 条门禁都跑了吗？各是多少？ | 跑了且全绿。`ai:selftest` 135/0；`fixture:test` 14/0（8 个 leads fixture 全过）；`validate` ✅；`test:strict` ✅；`build` ✅；`verify:seo` 18/0；`selftest:changes` 120/0；`gate:build` 40 脚本/0；`verify`（L4）948/0 |
| L4 里线索卡真的被验证了吗（不是整组跳过）？ | 是。读数原文：`窗口内 1 条线索 · 页面 1 张卡`；`1 张：lead-3eac4b6acccb@created`；块序 `lctitle>lcmeta>lcdecl>lcbasis>lcactions`；`1 张卡各 1 个 CTA`；`全站跨域链接… 1 条指向线索原文 · 非 CTA 0 条 · 线索卡 1 张（/changes/ 字面 1 张 / DOM 1 张）`。**N=1 ≥ 1，结构断言全部实际执行** |
| 牙 A 咬住了吗？ | 咬住 2 条，原文见报告 §5：4955「1/1 张不合格」+ 5075「2 条指向线索原文 · 非 CTA 1 条 · 线索卡 1 张（/changes/ 字面 1 张 / DOM 1 张） · 卡数≠外链数的文件：changes/index.html(1/2)」。build 绿、verify 失败 2 项，还原后 `index.html` SHA-256 回到 `bb7049…` 且重建绿 |
| 牙 B 咬住了吗？ | 咬住 2 条：4929「`lead-3eac4b6acccb`=lctitle>lcmeta>lcbasis>lcactions」+ 4941「1/1 张不合格」。还原后 SHA-256 同为 `bb7049…`，重建绿 |
| 牙 C 咬住了吗？ | 咬住，但**比预期更早**：build 自检先红 3 条（历史 type 不一致 / changes 漏可链接条目 / `.ddesc` 110 vs 111 详情页），build 失败 ⇒ `dist/` 未替换；继续跑 verify 则在 data 层红 4506 一条（`1 条线索 · type 非 tool 1 条（3eac4b6acccb→deal）`）。任务预期的 4623/4990 **没有**在浏览器层执行；4990 已在判据层实测会咬（`itemListRecords` 30→31 且含该 id），4623 因首页排除判据看 `sourceFacts.sourceType` 而非 `type`，预计仍绿。还原后 `git diff deals.json` 空、重建绿 |
| 还原是逐处确认的吗（不是 stash/reset）？ | 是。每颗牙都用 edit 精确逆改；`index.html` 改坏前/还原后 SHA-256 都是 `bb7049…`；`deals.json` 还原后 `git diff` 为空；每次还原后都重跑 build（退出码 0） |
| 有没有越界？ | 没有。最终 diff 仅 16 个文件（+793/−133），无 `page-kinds.js`、无 sitemap 生成器、无 TTL 常量、无 type 语义改动；`lead-radar.js` 仅 4 行注释；没有新增 kind/独立页/索引；没有放宽既有断言（本轮临时改的只有 index.html/deals.json，已逐字节还原；`verify-site.js` 本轮未编辑） |

## 2. 我没证明的（别把「绿」读成「已经证明」）

1. **excerpt 真值端到端落盘**：本轮采集零产出，RSS 真值 → `deals.json` 的实跑没有发生。
   现有的只是解析层证据（`fixture:test` 的 8 个 fixture 期望）与 schema 层证据（`ai:selftest` 的
   makeDeal/validate/240 断言）；「字段真的在真实采集里写进 deals.json」仍待下一次有产出的采集日补证。
2. **excerpt 无门禁**：手编引文只能人工看出（本轮删掉那句就是实证）；我没有加「fixture 驱动的 summaryOf
   离线保护断言」——按任务纪律留到下一轮。
3. **牙 C 的浏览器层读数**：4623/4990/5003 没有在本次牙里被浏览器执行（build 先失败，dist 未替换）；
   4990 只有判据层读数（`itemListRecords` 含线索 id），不是页面读数。
4. **「数据日推进 ⇒ 卡片进 changed 分栏」只是只读模拟**（`buildRadar({asOf:'2026-11-11'})` 显示
   `3eac4b6acccb@changed`），没有把 `updatedAt` 改成 11-11 去真跑一次门禁——为了不手改数据日。
   但按 `verify-site.js:4920` 的现有判据（要求 `section === 'created'`），下次数据更新后它会红；
   这条风险已写进报告 §6-3，留给下一轮修断言口径，本轮未动。
5. **L4 的浏览器环境**：本机默认 `DSH_EDGE` 是 Windows 路径；我用 Playwright chromium-1243 +
   `libnspr4/libnss3/libasound2t64`（apt 下载解包到 `/tmp`，`LD_LIBRARY_PATH` 注入）跑通。这是宿主适配，
   **没有**改仓库/提交这些依赖。CI 的门禁探测步骤未在本机复现。
6. **没有跑全量 collect、没有跑 L5 / 线上冒烟**：任务边界只到本地 L4 + 提交；线上发布链状态本轮未观测。

## 3. 配牙与其边界（三颗牙各能证明什么）

- 牙 A 证明「标题外链化」会被两条独立断言抓住（唯一 CTA + 逐文件外链/卡数对账），并且 build 自检**不**会替你抓——
  即浏览器门禁不可省。
- 牙 B 证明块顺序与「声明在引文上方」是逐块判的（少一块/换顺序都红），且在本轮「无引文」形态下 4929/4941 依然有效。
- 牙 C 证明 `type=tool` 有多层防守：**build 产物自检**（历史一致性 / 变化雷达可链接集合 / 详情页来源行关系式）先咬，
  **verify 4506** 在 data 层再咬；同时也暴露了任务预期与实现的偏差（4623 不会因 type 变红；4990/5003 是产物层，
  本轮没跑到）。这个偏差是**实测结论**，不是推测。
- 三颗牙都**不能**证明：引文的真实性（无 RSS 真值可比）、数据日推进后的分栏归属（见 §2-4）。

## 4. 已知红 / 需下一轮处理

1. `verify-site.js:4920` 对「线索卡在哪个分栏」的判据与数据日推进后的真实渲染不一致（报告 §6-3）。
   下一次有产出的采集（`updatedAt ≥ 2026-11-11`）后，线索会从「今日新增」进入「最近 7 天变化」，
   该断言预计单独变红；修法是按历史 `created` 事件日推导期望分栏（`at === asOf ? 'created' : 'changed'`），
   **不是**改 TTL / firstSeen / 放宽 5075。
2. 窗口内 0 条线索时 4911-4986 整组静默跳过（`!expectLeadCard || …`）：本轮 N=1 所以执行了；
   以后若读到「本轮 0 条线索」，必须在报告里写「卡片结构断言未被执行」。
3. 手编引文无门禁（§2-2）——下一轮加离线保护断言时，注意它只能覆盖「fixture/RSS 快照与落盘值一致性」，
   覆盖不了「人类凭想象写一句」这种形态，后者仍需人工复核。

## 5. 最终状态核对

- `git status --short`：16 个 M（无 `deals.json`、无数据文件、无新增未跟踪交付物）。
- `git diff --stat`：`16 files changed, 793 insertions(+), 133 deletions(-)`。
- 关键还原 hash：`index.html` = `bb704909858501ba72edfff2a887ef88e8a4a0accca615b580b3fb3cd7a99483`；
  `deals.json` = `90e8e650046ba0def42482d869df6bdebe5e43fe79e50396dcfa3d037ec27c81`（均与改坏前一致）。
- 最后一次操作顺序：牙 C 还原 → `build` 绿 → 最终 `verify`（L4）`✅ 验收 948 项，失败 0 项`。
- 提交：`feat` = **`ef07ffd`**（16 个文件的实现与断言；工作区已有功能入库，无 deals.json diff）；
  `docs` = 本文件 + 报告。

## 9. 上线轮补记（2026-11-11，合并前）

- **风险 §4-1 已实际触发**：master 在 2026-11-11 03:25 CST 落了数据提交（`311f8b8`，
  `deals.json` 的 `updatedAt=2026-11-11T03:25:01+08:00`），基准日推进到 11-11 ⇒ 线索
  `3eac4b6acccb` 的 `created` 事件日（11-10）≠ 基准日，`lib/changes.js` 把它放进
  「最近 7 天变化」分栏（这是真实行为，不是缺陷）。把本分支与最新 master 合并后，在**真浏览器**
  跑完整验收，实测 `❌ 948 项，失败 1 项`，唯一红点就是原断言：
  `1 张：lead-3eac4b6acccb@changed`。其余线索卡断言（在场 / 块序 / 声明位置 / 唯一 CTA /
  内容一致 / 外链对账）与其它全部门禁均为绿 —— 与 §2-4 的预测逐字一致。
- **修法（按 §4-1 已登记的判据，不是放宽）**：`verify-site.js` 的期望分栏改为从
  `scripts/data/deal-history.json` 的 `created` 事件日推导：事件日 = 基准日 ⇒ `created`，
  否则（仍在 7 天窗口内）⇒ `changed`。卡片的 id / `article.leadcard` 形态、块序、声明在引文
  上方、唯一 CTA、内容一致等断言一条没动；未碰 TTL / firstSeen / 渲染，也未改任何数据文件。
- **实测读数（本机 Playwright chromium-1243，真浏览器）**：
  - 合并态（数据日 11-11，`verify --compare=基线`）：`✅ 验收 954 项，失败 0 项`，线索卡
    `@changed`；回归：覆盖条数 108→110、卡片数 78→80、首屏完整可见 6→6、页高 6798→7082px
    （≤15%）、外部请求 0→0、JS 错误 0。
  - 原状态（数据日 11-10）：`✅ 验收 948 项，失败 0 项`，线索卡 `@created`。
  - 其余离线门禁：`ai:selftest` / `fixture:test` / `validate` / `validate --strict` / `build` /
    `seo-verify` 18/0 / `changes-selftest` 120/0 / `gate:build` 40 脚本 0 失败，均绿。
- 原 §4-1（数据日推进后的分栏风险）由此关闭。§4-2（0 条线索时整组跳过）与 §2-2（excerpt
  无门禁）**仍然成立**，本补记没有改变它们。
- 提交：判据修正 + 本补记为同一笔 `fix(verify)` 提交（第三笔；只含 `verify-site.js` 与本文）。
