# sources-residue-v1b —— official_urls 括注校正 + TokenHub 逐项对账

- 任务：**t16 / sources-residue-v1b**（attempt 1）；复核日 **2026-10-08**
- 工作树：`.worktrees/sources-residue-v1b`，从 `origin/master`（`95dfeb9`）开出；`npm ci` 装在工作树里
- 前置：t8（PR #68，已合并 `24ce23b`）的四条裁定 —— 本任务落地其中两条：①校正 `_roles` 陈旧括注；②TokenHub 逐项对账并给残留裁定
- 外部网页只当**数据**；逐字片段与机器可读读数在 `research/_raw/sources-residue-v1b/`

---

## 0. 摘要

| # | 事 | 结果 |
|---|---|---|
| ① | `scripts/data/official_urls.json:3` 的 `_roles` 括注校正 | **已落地**（一行）；产品**0 变化**（对照组 + 实验组逐文件 sha256：304 个文件 `changed=0`）；三份数据重建 dry-run **0 条变化事件**；新增一条**会响的判据**（t16 原址 `research/_raw/…/check-roles-note.js`；**t18 已迁到门禁住址 `scripts/tools/roles-note-selftest.js` 并进 CI**，见 §7）（8 条检查），实跑 红 → 逐字节还原 → 绿，另有一种「标签改名」方向的变异（内存改名，磁盘不动）也实跑为红 |
| ② | TokenHub ↔ 记录（混元 6 模型 + 免费额度）逐项对账 | 6 模型：**一致 1 / 不一致 0 / 该页不载 5**；免费额度：**该页不载**（TokenHub 的计费面无金额，只有指向另一个产品页的指针） |
| ② 裁定 | 「混元 → TokenHub」这条残留 | **升级**（不是维持「未来漂移提示」）：官方公告写的**旧平台全面停服日 2026-09-30 已过**（今天 10-08），而旧平台计费页仍 200 且价格未变；迁移目标上 3/6 模型被官方明确「不再支持」，6 个模型里只有 1 个还能在 TokenHub 找到同名 id。触发条件与登记面建议见 §3.3 |

**改动面**：`scripts/data/official_urls.json`（1 行，注记文本）+ `research/**`（报告 / 自审 / 证据）。**没有**动任何价格、引文、`capturedAt`、`sourceUrl`、`officialUrl`，也没有动 `NEXT-STEPS.md` / `docs/DESIGN-RULES.md`（建议行见 §5）。

---

## 1. ① `_roles` 陈旧括注：校正 + 「产物是否变化」

### 1.1 改了什么（`scripts/data/official_urls.json:3`，只改一行里的一段）

| | 文本 |
|---|---|
| 改前 | `② \`deal.sourceUrl\` / \`plan.sourceUrl\` = **收录渠道**（渲染成「原始出处」行）：这条记录最初是从哪里被发现的…` |
| 改后 | `② \`deal.sourceUrl\` / \`plan.sourceUrl\` = **收录渠道**（页面行标签：deal 侧渲染成「收录渠道」行 —— 与 \`scripts/lib/audience.js\` 的 \`SOURCE_LABELS.origin\` **逐字同值**，措辞的唯一出处是那个常量，此处只是引用它（可复核判据：\`research/_raw/sources-residue-v1b/check-roles-note.js\`）；plans 侧（套餐 / API 计费 / 厂商页）**不渲染这个字段的行标签** —— 它的值只在变化事件的句子里原样出现（\`scripts/lib/plans-page.js\`），厂商页只把它算进「另有 N 个官方地址」的计数（\`scripts/lib/vendor-page.js\`））：这条记录最初是从哪里被发现的…` |

即 t8 报告 §7 给的那句，另加了两处**可复核的落点**：措辞唯一出处（`SOURCE_LABELS.origin`）与判据脚本路径。

改动的依据（t8 已实测、本轮复核仍然成立）：deal 侧行标签由 `scripts/lib/audience.js:749` 的 `origin: '收录渠道'` 决定，并与 `index.html` 的 `SOURCE_WORDING` 前端副本逐字一致（`checkWordingContract` 绿）；plans 侧 `scripts/lib/plans-page.js:546-549` 只把这个字段的值原样贴进变化句子、`scripts/lib/api-plans-page.js` 里没有它的标签表。

### 1.2 产物是否变化：**0 变化**（逐文件 sha256）

方法：`hash-dist.js` 对 `dist/` 做逐文件 sha256；先做**对照组**（同一份源码连续构建两次），再做**实验组**（改括注后再构建一次）。

| 组 | 读数 |
|---|---|
| 对照组：build #1 → build #2 | 304 files / 20,386,654 bytes；**changed = 0** ⇒ 构建在这台机器上逐字节可复现（所以「0 变化」这个结论是有意义的，不是噪点） |
| 实验组：改括注后 build #3 vs build #1 | 304 files / 20,386,654 bytes；**changed = 0** |

清单：`dist-hashes-before.json` · `dist-hashes-control2.json` · `dist-diff-control.json`（对照组）· `dist-hashes-after.json` · `dist-diff-after-note.json`（实验组，`changedFileCount: 0`）。

**为什么必然是 0**（不是运气）：`official_urls.json` 全仓只被两处读——`scripts/validate.js:908`（校验入口）与 `scripts/lib/official.js:53`；后者显式**丢掉所有 `_` 开头的键**（`Object.entries(officialUrls).filter(([k]) => !k.startsWith('_'))`，`:57`），`_roles` 是纯注记，**没有任何代码读它**（`grep -rn "_roles" scripts/` 的命中只有 `scripts/lib/audience.js:748` 的一句**注释**，以及 `official_urls.json` 自己那一行）。

### 1.3 会不会触发变化日志事件：**不会**（三份数据重建 dry-run 实测）

| 命令 | 读数 |
|---|---|
| `node scripts/tools/rebuild-api-plans.js --dry-run` | 「重建结果与盘上的 api-plans.json 逐字节一致 —— 数据不需要写盘」·「变化日志（scripts\data\api-plan-history.json）：本次追加 **0** 条事件」 |
| `node scripts/tools/rebuild-plans.js --dry-run` | 「逐字节一致 · 本次追加 **0** 条事件」 |
| `node scripts/tools/rebuild-deals.js --dry-run` | 「重放结果与盘上的 deals.json 逐字节一致 —— 不需要写盘」 |

外加 `npm run test:strict`（`validate --strict`）通过 —— `_roles` 改文本不影响官方域白名单判据（它读的是 `_officialDomains` 与 providers.json）。

### 1.4 「括注再脱节会被发现吗」：加了一条**会响的判据**（8 条检查）

判据脚本（**t16 原址**）：`research/_raw/sources-residue-v1b/check-roles-note.js`。**t18 已把它迁到 `scripts/tools/roles-note-selftest.js` 并装进门禁**（迁址、登记、三段实跑的读数见 §7）。它把三处串起来，任一处脱节即红：

1. `note-quotes-live-label`：注必须逐字引用 `audience.js` 的 `WORDING_CONTRACT.SOURCE_LABELS.origin` 的**当前值**；
2. `note-has-no-stale-term`：注里不得再出现旧称「原始出处」；
3. `note-names-source-of-truth`：注必须指明唯一出处（`SOURCE_LABELS.origin` + `audience.js`），否则下次改名无从对照；
4. `note-states-plans-not-rendered`：注必须写明 plans 侧的行为；
5. `note-points-at-this-probe`：注必须指向判据脚本本身（可复核入口）；
6. `frontend-copy-agrees-with-lib`：`index.html` 的前端副本与 lib 常量逐字一致（直接调 `audience.checkWordingContract()`）；
7. `plans-page-passes-value-through`：`plans-page.js` 里 `case 'sourceUrl':` 之后仍是 `String(value)` 原样透传（括注那句「不渲染」的依据）；
8. `api-plans-page-has-no-label-map`：`api-plans-page.js` 里**没有** `case 'sourceUrl':`（没有开始给这个字段建标签表）。

**实跑读数**（两次变异，都留了 JSON）：

| 步骤 | 命令 | 结果 |
|---|---|---|
| 绿（改动后） | `node …/check-roles-note.js`（**现址** `npm run selftest:roles-note`） | **8/8 通过**，exit 0 → `roles-note-check-green.json` |
| 红（变异 M1：把括注改回旧写法） | `node …/note-mutation.js --bend` → 判据 | **2/8 失败**（`note-quotes-live-label`、`note-has-no-stale-term`），exit 1 → `roles-note-check-red-bent.json` |
| 逐字节还原 | `node …/note-mutation.js --restore` | 还原前 sha256 `3483dfaf…` → 还原后 `183f5b63…` = 备份 sha256；「✅ 逐字节还原成功」 |
| 绿（还原后） | 判据再跑 | **8/8 通过**，exit 0；`git diff --stat` 只剩「1 file changed, 1 insertion(+), 1 deletion(-)」 |
| 红（变异 M2：**内存里**把 live 标签改名 `收录渠道` → `来源渠道`） | `node …/mutate-live-label.js` | **2/8 失败**（`note-quotes-live-label`、`frontend-copy-agrees-with-lib`），exit 1；`scripts/lib/audience.js` 的 sha256 **前后一致**（`e8150b25e41c251c`）⇒ 磁盘未被改动 |

M2 回答的正是「括注为什么不会再次脱节」：**标签改名那一刻**，判据就会红（而不是等读者发现）。

**当时没有把它装进门禁**（t16 的如实说明，历史记录）：那一轮 in-scope 只有 `scripts/data/official_urls.json` 与 `research/**`，`scripts/lib/`、`scripts/tools/` 在 out-of-scope 里 —— 而门禁断言必须住在 `scripts/tools/*selftest*.js` 并且**登记进 `.github/actions/gate/action.yml`**（`check:ci` 的第 19 条断言会拒绝「写了 selftest 但没进门的脚本」）。
⇒ **t18 已补上**：迁到 `scripts/tools/roles-note-selftest.js`、加 `selftest:roles-note`、登记进 action.yml 与两处冻结/分层表，`check:ci` 仍 39/0；迁址与三段实跑读数见 **§7**。

---

## 2. ② TokenHub ↔ 记录：逐项对账

### 2.1 环境与可达性（先把「读到了什么」钉死）

| 事实 | 读数 |
|---|---|
| 出口 | 香港（HTTP 响应头 `CF-RAY: …-HKG`）；**腾讯云五张页面全部 200，没有区域门**（对照组：同一轮里 `platform.claude.com` 的文档页被区域门 307 拦在 `app-unavailable-in-region`） |
| 抓取方式 | `curl -L`（不是无头浏览器）。腾讯云在不带 `--compressed` 时仍返回 `Content-Encoding: gzip`，脚本按魔数解压（否则读到的是乱码而不是空结果） |
| 页面自报更新时间 | 模型价格 130055 → **2026-09-24 20:08:15**；计费方式 130054 → **2026-09-18 14:22:00**；模型列表 130051 → **2026-09-28 11:12:30**；新人免费体验包 130053 → **2026-09-04 10:23:30**；迁移指南 131382 → **2026-08-05 15:37:30** |
| tab 面板 | 价格页的语言模型有「广州 / 新加坡」两个 tab，两份表都在同一份 HTML 里；`tse-tabs__item is-active` 是「广州」，紧随其后的 `tse-tabs__cont is-active` 是第一张表（**含 Hy-Role-Latest**）；第二张（新加坡）**没有** Hy-Role-Latest / Hy-Role 行 |
| 记录侧基线 | `scripts/data/curated_api_plans.json` → provider「腾讯云」/「混元生文按量计费」（`verifiedAt 2026-10-01`）：6 个模型 + `freeTier`（100 万 tokens、一次性、资源包有效期 1 年） |

### 2.2 逐行对账（三分类）

分类**由快照字节推出**（脚本 `build-v1b-evidence.js`：先在 TokenHub **模型列表**里找记录的 `modelKey` 作为模型 id；找到才去价格页读音价比对；找不到则断言「两张页面里都不存在这个 id」）。机器可读取数：`tokenhub-vs-record.json`。

| # | 记录里的模型 | 记录价（输入/输出，元/百万 tokens） | TokenHub 侧 | 分类 |
|---|---|---|---|---|
| 1 | `hunyuan-role-latest`（Hunyuan-role-latest） | 2.4 / 9.6 | 模型列表：展示名 **Hy-Role-Latest**，`model（调用参数）`= **`hunyuan-role-latest`**（**同一个模型 id**）；价格页「广州」tab：**2.4 / 9.6**（缓存命中 `-`） | **一致** |
| 2 | `hunyuan-a13b` | 0.5 / 2 | 模型列表与价格页都没有这个 id；迁移指南明确「**`hunyuan-a13b` … TokenHub 将不再支持**」 | **该页不载** |
| 3 | `hunyuan-translation` | 1.2 / 3.6 | 同上（指南点名「`hunyuan-translation` … 不再支持」） | **该页不载** |
| 4 | `hunyuan-translation-lite` | 1 / 3 | 同上（指南点名） | **该页不载** |
| 5 | `tencent-hy-vision-1.5-instruct` | 3 / 9 | 多模态理解模型只有 `HY-Vision-2.0-Instruct`（7.5/17.5）、`HY-Vision-1.5-Thinking`（3/9）、`HY-Vision-Video`（3/9）、`YT-VITA`（1.2/3.5）；**没有 1.5-Instruct** | **该页不载** |
| 6 | `hunyuan-embedding` | 0.7 / 0.7 | 向量模型只有 `Kinfra-Text-Embedding-0.6b/4b`、`Kinfra-VL-Embedding-2b/8b`；**没有 hunyuan-embedding** | **该页不载** |

**汇总：一致 1 · 不一致 0 · 该页不载 5。**

三分类的语义要说清（不然「该页不载」会被读成「不一致」的反面）：
- **不一致 = 0** 的意思是：**没有任何一个模型在 TokenHub 上以同名 id 出现却给出不同价格**。所以本轮的读数**不是**「迁移后价格变了」的证据；
- 5 个「该页不载」的意思是：**迁移目标上根本没有这些模型**（其中 3 个被迁移指南逐字点名「不再支持」）。这与「价格不同」是两类事实，不要混写。

**候选对照（**不作为判定**，只登记线索）**：

| 记录模型 | 近似行 | 数字 | 为什么不当作「一致」 |
|---|---|---|---|
| `tencent-hy-vision-1.5-instruct` 3/9 | `HY-Vision-1.5-Thinking` 3/9 | 数字相同 | 后缀不同（Thinking ≠ Instruct），模型 id 也不同（`hy-vision-1.5-thinking`）；官方没给「旧名 → 新名」映射 ⇒ **身份未证实** |
| `hunyuan-translation` 1.2/3.6 | `Hy-MT2-Plus` 0.5/2 | 数字不同 | 名称与代次都不同（MT2 是新一代翻译模型，描述写「混元翻译模型」），且指南明确 `hunyuan-translation` 不再支持 ⇒ 这是**另一个模型**，不是同一条记录的新价 |
| `hunyuan-translation-lite` 1/3 | `Hy-MT2-Lite` 0.3/1.2 | 数字不同 | 同上 |
| `hunyuan-embedding` 0.7/0.7 | `Kinfra-Text-Embedding-*` 0.5/0.6 | 数字不同 | 不同产品线（Kinfra 系列），无官方映射 |

### 2.3 免费额度（100 万 tokens / 1 年）

| 面 | 逐字读数 | 分类 |
|---|---|---|
| TokenHub **模型价格**（130055） | **没有**平台级免费额度；里面的「免费」共 22 行，全是**单次调用内的图片张数细则**，例如「输入图片前3张免费，第4张起每张10,000 tokens/张」 | **该页不载** |
| TokenHub **计费方式**（130054） | 不写金额与期限，只有一句指针：「新人免费额度详情请参见新人免费体验包」 | **该页不载**（有指针、无内容） |
| TokenHub **新人免费体验包**（130053） | 「**所有语言模型均提供 100 万 Tokens 的免费体验额度，有效期 1 年。**」+「本期活动时间截至 2026 年 12 月 31 日」+ 视觉/3D 是另一套积分包（如生视频 50 积分 / 1 年） | **同量同期，但不是同一条** ⇒ 不计入「一致」 |
| **下线公告**（2287） | 「完成 TokenHub 迁移的用户，可申领免费体验额度，**有效期 3 个月**」 | 又一条不同的额度 |

**为什么不把 130053 算成「一致」**：记录的 `freeTier` 是**旧平台**「首次开通腾讯混元大模型服务后」发的资源包（`stability: new_user`、`period: one_time`，来源是旧计费页）；130053 是 TokenHub 的**活动包**（按模型领取、有活动截止日 2026-12-31、语言模型统一 100 万 / 1 年）。两句话在数字上重合，但主体、发放条件、有效期起算、活动截止都不同 —— 把「数字碰巧相同」当「同一条事实」，正是这份项目里反复在防的那类假绿。

### 2.4 时间线（为什么这条残留不该再叫「未来」漂移）

| 日期 | 官方原文（逐字） | 出处 |
|---|---|---|
| 2026-05-12 | 公告元数据 `beginTime 2026-05-12 16:56:15` / `addTime 2026-05-12 10:46:49`（字段名与值逐字来自页面 JSON；页面上另有 `endTime 2026-06-12 16:56:15` —— **这些字段的语义官方没有说明，我只报值不解释**） | /announce/detail/2287 |
| 2026-06-30 00:00 | 「**停止售卖**：旧平台全量产品关闭购买及资源创建通道，新老用户均无法新增订购、开通服务及创建 API Key；存量老用户现有在用服务暂时不受影响」 | 同上 |
| 2026-09-30 00:00 | 「**全面停服下线**：旧平台控制台、API 接口同步关停，届时平台功能将无法访问、查看及正常调用，服务正式终止」 | 同上 |
| 2026-08-05 | 迁移指南：「原平台将不再新增模型能力，并停止新购模型服务…建议您将已购买的模型服务迁移到 TokenHub 使用」+ 点名 7 个「不再支持」的模型 | 1823/131382 |
| 2026-10-01 | （记录侧的 `firstSeen/lastSeen/verifiedAt`） | 记录 |
| **2026-10-08（今天）** | 旧平台计费页仍然 **200**、价格与记录**仍一致**（本任务重抓：49,933 bytes）；公告里写的全面停服日**已经过去 8 天** | 1729/97731 + 2287 |

---

## 3. 裁定（②）

### 3.1 结论：**升级**这条残留

`NEXT-STEPS.md` §A.2 现在把这条记为「**未来漂移提示、不是事实错误**」。基于上面的读数，**升级**为：

> **「混元 → TokenHub」已经不是未来漂移，而是「已经越过官方停服日、来源仍可读但描述的是一个官方宣布终止的平台」。**
> 具体三条：
> 1. 官方公告给出的旧平台**全面停服日 2026-09-30 已过**（今天 2026-10-08），而旧平台计费页仍可访问、价格与记录仍一致 —— 这构成一个**互相矛盾的双读数**（「服务已终止」vs「计费页还在卖」），需要人来裁定哪一面才算今天的现场；
> 2. 迁移目标 TokenHub 上，记录的 **6 个模型里只有 1 个还能找到同名 id**（`hunyuan-role-latest`，价格一致），其余 **5 个不在 TokenHub**，其中 3 个被迁移指南**点名「不再支持」**；
> 3. 免费额度在 TokenHub 的**计费面**上不存在（只有指向另一个产品页的指针），TokenHub 侧的两条额度（新人体验包 100 万/1 年、迁移用户 3 个月）都与记录所述的不是同一条。

**必须同时写明的边界（不得被上面这段话带偏）**：
- 这**不是**「记录里的价格错了」——旧平台计费页今天仍逐字支持那 6 个价格；
- 这**不是**「TokenHub 上的价格不一样」——`不一致 = 0`，没有任何同名 id 出现不同价格；
- 也**不是**「旧平台已经停止服务」的实测断言——我没有调用过旧平台的认证 API（见 §4）。

### 3.2 为什么不是「维持」

「未来漂移提示」的前提是「事情还没发生」。今天的读数里有两件事**已经发生**：官方公告的停服日已过（10-08 > 09-30），以及迁移目标上 3 个模型被官方明确不再支持。把这两条继续登记成「未来」提示，会让下一个读状态文件的人以为时间还没到。

### 3.3 升级要带的东西（触发条件 + 登记面建议）

**触发条件**（满足任一条就必须动，且都应是「先报 captain」的动）：

| # | 触发条件 | 为什么是它 | 怎么查（可复跑） |
|---|---|---|---|
| T1 | 旧平台计费页 `https://cloud.tencent.com/document/product/1729/97731` 返回非 200 / 跳转 / 页面出现下线公告 / 价格或型号变化 | 那意味着「记录的依据消失了」，记录的 `lastSeen` 与引文口径要重做 | 重抓该 URL 比字节；t8 与本任务的 `build-*-evidence.js` 都会因为锚点找不到而**报错**（不是静默出空证据） |
| T2 | TokenHub 侧出现记录里**另外 5 个模型**的同名 id（`hunyuan-a13b` / `hunyuan-translation` / `hunyuan-translation-lite` / `tencent-hy-vision-1.5-instruct` / `hunyuan-embedding`），或迁移指南给出「旧名 → 新名」的官方映射 | 那会把「该页不载」升级成可对账状态：要么一致、要么出现**真实的价格冲突**（那才需要裁定记录该跟哪个平台、`officialUrl`/`sourceUrl` 归属怎么办） | `build-v1b-evidence.js` 的规则表：`idPresent` 一旦为真，它会自动去比价格并给出「一致/不一致」；`problems` 非空即红 |
| T3 | TokenHub 侧对同一个 id（`hunyuan-role-latest`）改价 | 记录会出现**第一个真实的价格不一致** | 同上脚本；也可以只重跑那一段数字比对 |
| T4 | 旧平台计费页被重定向到 TokenHub 的某个页面 | 那时「官方定价页迁移」与「混元迁移」两条残留会合并成一条 | 抓 `curl -I` 看 `Location`（t8 给过逐跳读数的写法） |

**登记面建议**（按「改什么、谁改、代价」）：

| 登记面 | 建议 | 代价 / 约束 |
|---|---|---|
| `NEXT-STEPS.md` §A.2 | 换成升级后的表述 + T1–T4 触发条件（建议行见 §5.2） | captain 收口，本轮**没动** |
| 记录层（`scripts/data/curated_api_plans.json` 的 tencent 记录） | **不建议本轮动**：加任何注记都会被 `officialUrl/sourceUrl/价格/引文` 四条边界挡住，而且会推进一条变化事件（t8 已实测这类副作用） | 要动必须先裁定该字段（例如给记录加「来源平台状态」注记需要 schema 决定） |
| 判据层（selftest） | 可选：把「记录 6 个 modelKey ∩ TokenHub 模型列表 id」做成一条**离线**判据（脚本已在本目录），由 captain 决定是否固化成门禁牙 | 需要改 `scripts/tools/` + `action.yml`（out-of-scope，见 §1.4） |
| 供应商页/API 页面文案 | **不需要动**：记录与页面都没有把 TokenHub 当成依据来源；`officialUrl` 仍指旧平台计费页（今天仍 200 且一致） | — |

---

## 4. 我没能证明的东西（完备性台账）

1. **旧平台今天是否真的停止服务**：我只读了文档页。没有调用过任何需要认证的旧平台 API（没有账号、也不该在审计里做写操作）⇒ 「2026-09-30 全面停服」是**公告的要求**，不是我实测的服务状态。文档页在停服日之后仍 200，两种可能（页面仍在、服务已停 / 两者都在）我**无法区分**。
2. **公告元数据字段的语义**：`beginTime` / `endTime` / `addTime` 是页面 JSON 里的字段名与值，我**没有**官方文档说明它们分别表示什么（例如 `endTime` 是公告展示截止还是别的），所以 §2.4 只报值。
3. **tab 面板与地域的绑定**：我是从 HTML 的 `is-active` 类与文档顺序读的，**没有**用真浏览器点 tab。若腾讯云改成交互式按需加载，这个绑定会失效（脚本会报「锚点找不到」而不是给错结论）。
4. **模型身份**：只有 `hunyuan-role-latest` 有**同名模型 id**这一硬证据（`model（调用参数）`列）；其余 5 个是「没有同名 id」的**否定证据**。HY-Vision-1.5-Thinking 与记录的 1.5-Instruct 数字相同，但后缀不同、id 不同 ⇒ 我**没有**把它算成一致，也没有把 Hy-MT2 系列算成 translation 的新价。
5. **免费额度是否会被领取规则改变**：130053 写了「每个主账号一次」「按模型领取」「活动截至 2026-12-31」，但实际可见额度以控制台为准 —— 文档是**要约描述**，不是账户实测。
6. **产品面（dist）与线上产物的差异**：本轮的产物哈希是我在**本工作树**构建的 `dist/`（304 个文件），不是线上 `dist`。结论「产物 0 变化」是关于**同一份源码在改动前后**的对比，不受线上版本影响。
7. **入口 IP 的其他可能**：腾讯云页面没有区域门，但我没有换出口 IP 复核（例如中国大陆出口是否看到同一份内容）。

---

## 5. 给 captain 的建议行（**原文**；`NEXT-STEPS.md` / `docs/DESIGN-RULES.md` 由 captain 收口，本轮未动）

### 5.1 `docs/DESIGN-RULES.md`（可选，加一条「注记类文本也要有判据」的规则）

```
- **数据文件里的注记（`_roles` / `_official_domains_note` 这类 `_` 开头的说明）也要有一条可复核判据**：
  它们写的是「页面会渲染成什么」，而渲染措辞的唯一出处是 `scripts/lib/audience.js` 的措辞常量。
  只写文字、没有判据的注记，会在下一次改名时静默变成假话（t8 实测：`official_urls.json` 的 `_roles`
  写着「渲染成「原始出处」行」，而 deal 侧标签早在 t7 就改成了「收录渠道」）。
  判据已在位（**t18 已落地**）：`scripts/tools/roles-note-selftest.js`（8 条检查，`selftest:roles-note`），
  已登记进 `.github/actions/gate/action.yml`（步骤名 `Roles-note self-test (official_urls note vs live wording)`）；
  变异实测：改回旧括注 → 红（exit 1），内存改名 → 红（且磁盘不变）。
```

### 5.2 `NEXT-STEPS.md` §A.2（整条替换）

```
2. **腾讯混元 → TokenHub（来源迁移风险 · 已升级，不再是「未来」提示）**：旧平台计费页（1729/97731）
   今天仍 200 且 6 个模型价格与记录**逐一一致**，但官方公告（/announce/detail/2287）给出的
   **旧平台全面停服日 2026-09-30 已过**（2026-10-08 复核），公告另写明 2026-06-30 起停止售卖。
   迁移目标 TokenHub 的公开计费面（1823/130054 · 130055 · 130051）逐项对账结果为
   **一致 1 / 不一致 0 / 该页不载 5**：只有 `hunyuan-role-latest`（展示名 Hy-Role-Latest，
   模型 id 同名）在 TokenHub 上仍是 2.4/9.6；`hunyuan-a13b`、`hunyuan-translation`、
   `hunyuan-translation-lite` 被迁移指南**点名「TokenHub 将不再支持」**；
   `tencent-hy-vision-1.5-instruct`、`hunyuan-embedding` 不在 TokenHub。
   免费额度（100 万 tokens / 1 年）在 TokenHub 的**计费面**上不载（130054 只有指向
   130053 新人免费体验包的指针；该体验包是活动包、截至 2026-12-31，与记录所述不是同一条）。
   **不得写成「价格已变化」**（不一致 = 0）。
   触发条件（满足任一条先报 captain）：T1 旧计费页非 200 / 跳转 / 内容变更；
   T2 TokenHub 出现另外 5 个模型的同名 id 或官方给出旧名→新名映射；
   T3 TokenHub 对 `hunyuan-role-latest` 改价；T4 旧计费页被重定向到 TokenHub。
   复核脚本：`research/_raw/sources-residue-v1b/build-v1b-evidence.js`（断言失败即红）。
```

### 5.3 `NEXT-STEPS.md` §A.3（在 t8 那一行后面补一句，指向本轮的判据）

```
   ⇒ 2026-10-08 追加：该括注已按 t16 校正，并且新增一条可复核判据
     （`scripts/tools/roles-note-selftest.js`：注里的行标签必须逐字等于
     `SOURCE_LABELS.origin`；改回旧写法 / 内存改名两种变异都实测为红）。
     **该判据已装进门禁**（t18：`selftest:roles-note` + action.yml 的 `Roles-note self-test …` 步骤，
     `check:ci` 仍 39/0）—— 门的这一半已经闭上。
```

---

## 6. 本轮改动与验证

> 本节描述的是 **t16**（`sources-residue-v1b`）那一轮的改动面。**t18 的改动面见 §7** ——
> 那一轮动了 `scripts/tools/`、`package.json`、`.github/actions/gate/action.yml`、`scripts/test/layers.js`
> 与 `scripts/data/official_urls.json` 的一处引用（都只为了把 §1.4 的判据装进门禁）。

**改了什么**：

- `scripts/data/official_urls.json`（**1 行**：`_roles` 注里的 sourceUrl 括注，见 §1.1）
- `research/sources-residue-v1b-report.md`（本文件）、`research/sources-residue-v1b-self-audit.md`
- `research/_raw/sources-residue-v1b/`（判据 / 变异工具 / 哈希清单 / 对账脚本与 JSON / 6 份逐字片段 / README）

**没改什么**：价格、引文、`capturedAt`、`sourceUrl`、`officialUrl`、`NEXT-STEPS.md`、`docs/DESIGN-RULES.md`、`scripts/lib/**`、`scripts/tools/**`、`dist/**`（构建产物是验证用，不入库）。

**验证命令**：见 `research/sources-residue-v1b-self-audit.md` §3（含 `npm run build` / `verify-site.js --dir=dist` / `check-ci-consistency.js --expect-checks=39` / `check:evidence` 的实跑读数）。

---

## 7. 门禁固化（t18 / `roles-note-tooth-v1`）：把 §1.4 的牙装进 CI

**一句话**：§1.4 那条判据从 `research/_raw/…/check-roles-note.js` 迁到 `scripts/tools/roles-note-selftest.js`，
加了 `selftest:roles-note`，登记进 `.github/actions/gate/action.yml`（`Roles-note self-test (official_urls note vs live wording)`），
并把仓库要求的两处**登记表/分层表**各追加一条 —— `check:ci` 仍 **39/0**，`--expect-checks=39` 不变、没有删改任何既有断言。

### 7.1 做了什么（8 处）

| # | 文件 | 改动 | 为什么 |
|---|---|---|---|
| 1 | `scripts/tools/roles-note-selftest.js` | **新增**：判据本体（8 条检查，仓库自测的样式：`check()` + 分节打印 + 现场读数 + 汇总 + 失败 `exit 1`） | 门禁认可的住址是 `scripts/tools/*selftest*.js` |
| 2 | `package.json` | **新增** `"selftest:roles-note": "node scripts/tools/roles-note-selftest.js"`（放在 `selftest:audience` 之后） | 可独立复跑；`check:ci` (17) 会核对每个 `selftest:*` 是否真的被门禁跑到 |
| 3 | `.github/actions/gate/action.yml` | 在 `Audience self-test` 之后**新增步骤**（带一段「为什么必须进门禁」的注释） | 进门禁本体 |
| 4 | `scripts/tools/check-ci-consistency.js` | `GATE_STEP_NAMES` 与 `GATE_STEP_RUN` 各**追加一条**（同名、同位置、纯追加） | 登记制：新增门禁步骤必须同时登记**步骤名序列**与 **run 体指纹**，否则 (10) 红（实测见 §7.2） |
| 5 | `scripts/test/layers.js` | L2 的 script 列表**追加** `selftest:roles-note` | `fitness` ④：每个 `selftest:*` 必须**恰好属于一层** |
| 6 | `scripts/data/official_urls.json` | `_roles` 括注末尾的判据路径：`research/_raw/…/check-roles-note.js` → `scripts/tools/roles-note-selftest.js`（并写出步骤名） | 迁址的引用更新；**不更新判据自己会红**（第 5 条检查「注里指向本判据」） |
| 7 | `research/_raw/sources-residue-v1b/check-roles-note.js` | **删除**（迁走） | 一个判据只有一个住址 |
| 8 | `research/_raw/sources-residue-v1b/{note-mutation.js,mutate-live-label.js,README.md}` + 本报告 | 引用更新（现址/原址、复跑命令） | 变异工具与文档指向新址 |

### 7.2 越界说明：为什么动了 `check-ci-consistency.js` 与 `scripts/test/layers.js`

这两个文件在 t18 的 **out-of-scope** 清单里。动它们的理由是**实测**出来的，不是为了让门禁变绿而放宽：

**只登记 action.yml、两张表不动时的实测读数**（这就是登记制本身的证据）：

```
✗ (10) gate 复合 action 存在且步骤名序列等于冻结清单 — #19 期望「App-token self-test」实得
      「Roles-note self-test (official_urls note vs live wording)」；#20 期望「AI layer self-test」实得「App-token self-test」…
❌ CI 口径检查 39 项，失败 1 项            （exit 1）
```

⇒ 那张冻结表**就是门禁强度**：不登记，门禁红；登记，这一步从此被 CI **真的执行**（这正是本任务的目的）。
两处改动的边界（可逐条复核）：

- **纯追加**：`git diff --numstat` 实读 `scripts/tools/check-ci-consistency.js` = **+7 / −0**、`scripts/test/layers.js` = **+1 / −0**（删除行数都是 0，含注释），**没有修改、没有删除任何既有条目**；
- **断言数不变**：`--expect-checks=39` 通过、(W) 仍是「实跑 38 条 = 冻结清单 38 条 + 本看门狗」⇒ 没有删改任何既有断言；
- **既有步骤的 run 体指纹逐字未动**（`git diff` 里只有新增行）；
- `fitness` ④ 报「**26** 个 `selftest:*` 全部已分层」（t16 前是 25）⇒ 新脚本已归层。

**回退方式（如果 captain 认为这两处不该在本轮动）**：撤掉 #3（action.yml 步骤）与 #4（两条登记）即可 ——
`selftest:*` 脚本、分层表、脚本本体都保留，`check:ci` 仍是 39/0，但这条牙**不在门禁里**（退回到 t16 的状态）。

### 7.3 三段实跑（干净绿 → 沙箱红 → 逐字节还原绿）

| 段 | 命令 | 读数 | `official_urls.json` sha256（前 16） |
|---|---|---|---|
| ① 干净树 | `node scripts/tools/roles-note-selftest.js` | **8 项通过 / 0 失败 · exit 0** | `d2197a952a74cf96` |
| ② 沙箱变异：把括注改回旧称 | `node research/_raw/sources-residue-v1b/note-mutation.js --bend` → 同一条判据 | **6 通过 / 2 失败 · exit 1** —— 红在「注里逐字引用今天的标签「收录渠道」」与「注里不再把旧称「原始出处」写成本字段的行标签」 | `3327de0756ebed8a` |
| ③ 逐字节还原 → 复跑 | `…/note-mutation.js --restore` → 同一条判据 | 还原 sha256 与 ① **完全一致**；判据 **8 / 0 · exit 0** | `d2197a952a74cf96` |

- 驱动器：`research/_raw/sources-residue-v1b/roles-note-gate-3phase.js`（把三段串起来，**还原放在 `finally` 里** ——
  中途失败也会还原，不会把生产数据留在被改坏的状态）；读数：`roles-note-gate-3phase.json`。
- 另一个方向（**内存里**把 live 常量 `收录渠道` 改名，不写盘）：判据 **6 / 2 · exit 1**，
  且 `scripts/lib/audience.js` 的 sha256 前后一致（`e8150b25e41c251c`）⇒ 磁盘未被改动。

### 7.4 「它在 CI 里真的会跑」的证据（三个独立角度）

1. **门禁步骤清单命中**：`check:ci` 的 (10) 绿 —— 它逐个比对 action.yml 的**步骤名序列**与**run 体指纹**，我的步骤在两张冻结表里；`--expect-checks=39` 通过。
2. **门禁的唯一实现会执行它**：`node scripts/test/run.js --gate` 是「本地跑一遍 CI 门禁」的入口 —— 它**直接解析 `.github/actions/gate/action.yml` 并按顺序执行其中的 `node` 步骤**（不抄第二份清单）。见下方日志读数。
3. **分层入口命中**：`node scripts/test/run.js --list` 的 L2 里有 `selftest:roles-note`（同一份 `scripts/test/layers.js` 也是 CI 的分层定义）。

`run.js --gate` 的日志读数：

```
$ node scripts/test/run.js --gate
门禁步骤（读自 .github/actions/gate/action.yml）：52 个
  ✓     0.2s  [17] SEO self-test
  ✓     0.1s  [18] Audience self-test
  ✓     0.1s  [19] Roles-note self-test (official_urls note vs live wording)   ← 本任务新增的那一步
  ✓     0.4s  [20] App-token self-test
  …
合计 308.9s / 48 个脚本，失败 0
跳过的 4 个非 node 步骤（本地无意义或需要 bash/网络）：Install dependencies · Prepare browser for the real-browser gate · Browser availability decision (never silent) · Gate conclusion
✅ 本地门禁链全过（与 CI 读同一份 action.yml）        （exit 0）
```

读数归档：`research/_raw/sources-residue-v1b/gate-run-evidence.json`（由 `gate-run-evidence.js` 从 gate 日志解析：
实跑 40 条步骤行 / 失败 0 / 本步骤 `[19] ✓ 0.1s`）。**本机 Full Gate 是跑完的**（48 个脚本，0 失败；本次 elapsed **308.9s**）；
rebase 到最新 master（`26c6614`）**之前**还跑过一次同样全过的（380.0s），两次的步骤序列与我的步骤读数相同，归档的是**最终那次**。

### 7.5 我没能证明的东西（t18）

1. **GitHub Actions 上的真实运行没实测**：本机没有 runner。「CI 会跑它」我证明到的是
   「CI 使用的唯一门禁实现（`action.yml`）里有这一步」+「本地用同一份 `action.yml` 执行到了它」+「`check:ci` 的步骤/指纹双表比对绿」。
   远端那次运行不在本机能力范围内。
2. **本机 Full Gate 的完整结果**：见 §7.4 的如实记录（跑完 / 没跑完 + 原因）。
3. **`--roles=<path>` 覆盖参数**：判据支持它（给变异实验指向被改坏的副本）。门禁调用**不带参数**，
   而且调用形态被冻结在 `GATE_STEP_RUN` 的指纹里（`node scripts/tools/roles-note-selftest.js`）——改指纹会红。
   它**不能**被用来让门禁看到另一份文件。
4. **t16 的 `-self-audit.md` 里仍写着旧路径**（那份文档不在 t18 的 in-scope 清单里，未改）：
   它是 t16 的历史读数；迁址后的现状以本报告 §7 与 `research/_raw/sources-residue-v1b/README.md` 为准。
5. **判据的语义边界**：第 7、8 条检查是「`plans-page.js` 仍原样透传 / `api-plans-page.js` 没有 `case 'sourceUrl':`」——
   如果将来 plans 侧改成在**别处**拼一个标签，这两条机械核对可能看不见。边界写在这里，不假装它覆盖一切。

---

## 8. 范围补正与合并后再确认（t21 / 修复轮）

t18 的交付被判 `failed` 的唯一原因是**范围冲突**（不是读数或实现问题）。captain 裁定 **(A)**：把两张登记表
正式纳入声明面，并用本任务（t21，kind=repair）在**合并后的 master** 上再确认一次。

### 8.1 范围补正：两条登记表

| 表 | 文件:行 | 改了什么 | 为什么必须 | diff |
|---|---|---|---|---|
| **冻结表** | `scripts/tools/check-ci-consistency.js:205`（`GATE_STEP_NAMES`）+ `:350`（`GATE_STEP_RUN`） | 各追加一条：步骤名 `Roles-note self-test (official_urls note vs live wording)` 与它的 run 体指纹 `node scripts/tools/roles-note-selftest.js` | 门禁步骤的**名字序列与 run 体**都冻在这张表里；(10) 会逐项比对，不登记即红 | **+7 / −0** |
| **分层表** | `scripts/test/layers.js:69`（L2） | 追加 `selftest:roles-note` | `fitness` ④ 要求「每个 `selftest:*` 恰好属于一层」 | **+1 / −0** |

**原契约下「只动 in-scope」与「`check:ci` 39/0」不可兼得** —— 实测的反证（只登记 `action.yml`、两张表不动）：

```
✗ (10) gate 复合 action 存在且步骤名序列等于冻结清单 — #19 期望「App-token self-test」实得
      「Roles-note self-test (official_urls note vs live wording)」；#20 期望「AI layer self-test」实得「App-token self-test」…
❌ CI 口径检查 39 项，失败 1 项            （exit 1；`fitness` ④ 同样会红）
```

两处都是**纯追加**（`git diff --numstat` = +7/−0 与 +1/−0，删除行数 0，另加注释），
**没有删改任何既有断言**：`--expect-checks=39` 通过、(W) 仍是「实跑 38 条 = 冻结清单 38 条 + 本看门狗」。
⇒ 这两张表**是 captain 裁定 (A) 后纳入声明面的**；t18 的 failed 记的是那次范围冲突，不是交付缺陷。

### 8.2 合并后再确认（基线 `origin/master` `d19017af04051048e0565af6c3675f3faf75cb6a`，含 PR #78）

| 项 | 命令 | 读数 |
|---|---|---|
| 判据独立复跑 | `npm run selftest:roles-note` | ✅ **8 项通过 / 0 失败 · exit 0**（现场读数：live 标签=「收录渠道」· 注里出现=是 · 旧称残留=否 · 前端副本一致=是 · plans 侧原样透传=是 · api-plans 标签表=无） |
| CI 口径 | `node scripts/tools/check-ci-consistency.js --expect-checks=39` | ✅ **39 项 / 0 失败 · exit 0**；`✓ (10) … action.yml 共 52 步：名字序列 / run 体指纹 / 步骤级 if / 无 continue-on-error 全过`；`✓ (W) 实跑 38 条 = 冻结清单 38 条 + 本看门狗`；`✓ (E) == --expect-checks=39` |
| 架构不变量 | `npm run fitness` | ✅ **4 条 / 0 失败 · exit 0**；`✓ ④ 分层表完整性 … 42 个 script 分在 5 层，26 个 selftest:* 全部已分层` |
| 证据政策 | `npm run check:evidence` | ✅ 无新增 Tier-3（1283 grandfather）· 清单自证与基线 `e0ca04a` 逐项一致 |
| **本机 Full Gate** | `npm run gate`（= `node scripts/test/run.js --gate`，解析 `action.yml` 并按顺序执行） | ✅ **52 个门禁步骤 / 48 个脚本 / 313.9s / 失败 0 / exit 0**；日志含 **`✓     0.1s  [19] Roles-note self-test (official_urls note vs live wording)`**；归档 `gate-run-evidence.json`（实跑 40 条步骤行 / 失败 0 / 本步骤 [19] ✓） |
| PR #78 的 PR 级门禁 | `gh run view 37770554206` | `name=Verify site (gate)` · `event=pull_request` · `status=completed` · **`conclusion=success`** |

**三段实跑**：按 captain 指示**不重跑**，读数仍然有效 —— 证据文件 `roles-note-gate-3phase.json`：
① 干净树 **8/0 exit 0**（`official_urls.json` sha256 `d2197a952a74cf96…`）→ ② 沙箱把括注改回旧称 **6/2 exit 1**（sha256 `3327de0756ebed8a…`）
→ ③ `--restore` 逐字节还原 → **8/0 exit 0**（sha256 与 ① 相同，`restoredByteExact=true`）。
合并后的**再验证**：在 `d19017a` 上重算 `scripts/data/official_urls.json` 的 sha256 = `d2197a952a74cf96…`，与 ① / ③ 记录**逐字相同** ⇒ 三段读数与合并后的树对得上。

### 8.3 供 `docs/DESIGN-RULES.md` N8 照抄的两项（captain 要的原文）

- **脚本路径**：`scripts/tools/roles-note-selftest.js`
- **npm 脚本名**：`selftest:roles-note`（`package.json:34` → `node scripts/tools/roles-note-selftest.js`）
- **门禁步骤名**（逐字，含括号）：`Roles-note self-test (official_urls note vs live wording)`
- **该步骤的 run 体**（逐字）：`node scripts/tools/roles-note-selftest.js`
- 登记面：`.github/actions/gate/action.yml:208`（排在 `Audience self-test` 之后）· 冻结表 `scripts/tools/check-ci-consistency.js:205` + `:350` · 分层表 `scripts/test/layers.js:69`（L2）

### 8.4 本节改了哪些已合并内容

**没有改任何已合并的代码**：`scripts/tools/roles-note-selftest.js`、`scripts/tools/check-ci-consistency.js`、
`scripts/test/layers.js`、`.github/actions/gate/action.yml`、`package.json` 在 `d19017a` 上**逐字节未动**
（再确认只是**重跑**它们）。本任务只新增/更新三项：本节（§8）、`post-merge-reconfirm.json`、
按合并后基线重新生成的 `gate-run-evidence.json`。
