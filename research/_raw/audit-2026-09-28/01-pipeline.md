# A1｜代码与流水线审计：133 条数据是怎么被机器产出的

- 审计员：code-auditor（任务 t1，attempt `f7b64965-e791-4909-b9b2-c1f949e739f4`）
- 时间：2026-09-28（本机 Asia/Shanghai）
- 纪律：**只读**。没有修改任何源码 / 数据 / workflow，**没有跑 `npm run build`**。
  需要跑「会写盘」的脚本时，一律先复制到 `%TEMP%\audit-head`、`%TEMP%\audit-e01dcfc`
  两份 scratch 副本里跑（只读 git blob 作输入），跑完 `git status --short` 确认仓库只剩
  captain 的 `?? research/_raw/AUDIT-CONTEXT.md`。
- 证据分档：**实测**=我亲手跑的命令 + 输出摘要；**引用**=文件:行号；**推断**=我的判断（附理由）。

---

## 实测结论

### 1) 采集器注册表：默认真正启用 **7 个**（全部静态 HTTP），另有 2 个无头来源需显式开关

**[实测]** `node scripts/collect.js --list` exit=0，逐字输出：

```
已注册采集器：
  cn_qianfan         国内  百度千帆
  cn_aliyun          国内  阿里云百炼
  cn_zhipu           国内  智谱AI
  layer3labs         国外  Layer3Labs
  aitools            国外  aitools.fyi
  futurepedia        国外  Futurepedia
  futuretools        国外  Futuretools

（加 --headless 可看到无头浏览器来源）
```

**[实测]** `node scripts/collect.js --list --headless` 在上面 7 个之后追加：

```
  cn_zhipu_pricing   无头  智谱AI活动页
  cn_volc_ark        无头  火山方舟
```

**[实测]** 直接 require 注册表（绕过 CLI）复算：

```
BASE ids: cn_qianfan, cn_aliyun, cn_zhipu, layer3labs, aitools, futurepedia, futuretools
all({}) count: 7     all({headless:true}) count: 9
playwright-core resolvable: true
```

**[引用]** 注册表由 5 个文件构成，但**文件数 ≠ 来源数**：`scripts/collectors/index.js:10-14`
把 `cn_docs.js`(3) + `global_deals.js`(1) + `global_directories.js`(3) 拼成 `BASE`；
`index.js:17-25` 的 `loadHeadless()` 只在 `options.headless` 为真时才 `require('./headless')`
（`index.js:28`）——所以默认路径与 CI 常规链路**完全不碰 playwright-core**。

| # | id | 名称 | 地区 | 抓取方式 | 目标 URL |
|---|---|---|---|---|---|
| 1 | `cn_qianfan` | 百度千帆 | 国内 | 静态 HTTP | `cloud.baidu.com/doc/qianfan/s/Imi2rpirg`（`cn_docs.js:26`） |
| 2 | `cn_aliyun` | 阿里云百炼 | 国内 | 静态 HTTP | `help.aliyun.com/zh/model-studio/new-free-quota`（`cn_docs.js:69`） |
| 3 | `cn_zhipu` | 智谱AI | 国内 | 静态 HTTP | `docs.bigmodel.cn/cn/guide/start/model-overview`（`cn_docs.js:106`） |
| 4 | `layer3labs` | Layer3Labs | 国外 | 静态 HTTP | `www.layer3labs.io/ai-discounts`（`global_deals.js:16`） |
| 5 | `aitools` | aitools.fyi | 国外 | 静态 HTTP | `https://aitools.fyi/`（`global_directories.js:25`） |
| 6 | `futurepedia` | Futurepedia | 国外 | 静态 HTTP（+最多 40 个详情页） | `https://www.futurepedia.io/`（`global_directories.js:71`） |
| 7 | `futuretools` | Futuretools | 国外 | 静态 HTTP（+最多 60 个详情页 + `/go/` 跳转） | `https://www.futuretools.io/`（`global_directories.js:131`） |
| 8 | `cn_zhipu_pricing` | 智谱AI活动页 | 国内 | **无头浏览器** | `https://bigmodel.cn/pricing`（`headless.js:46`） |
| 9 | `cn_volc_ark` | 火山方舟 | 国内 | **无头浏览器** | `https://www.volcengine.com/product/ark`（`headless.js:144`） |

**[实测]** 在 scratch 副本里真跑全部静态来源（`--dry-run`，不写盘）：

```
来源               地区    产出   合格   优惠   垃圾   耗时     错误
Futuretools        国外    37     37     0      0      12.6s
百度千帆           国内    17     17     17     0      0.6s
aitools.fyi        国外    15     15     0      0      1.1s
Layer3Labs         国外    13     13     9      0      1.0s
智谱AI             国内    7      7      7      0      1.2s
Futurepedia        国外    7      7      0      0      5.6s
阿里云百炼         国内    1      1      1      0      0.6s
合计：7 个来源，产出 97 条，合格 97 条，其中优惠 34 条，失败 0 个
```

**[实测]** 在 scratch 副本里真跑无头来源（`--headless --only=cn_zhipu_pricing,cn_volc_ark --dry-run`）：

```
火山方舟           国内    12     12     12     0      3.5s
智谱AI活动页       国内    5      5      5      0      3.9s
合计：2 个来源，产出 17 条，合格 17 条，其中优惠 17 条，失败 0 个
```

17 条与 `probe-sources.yml:96` 里写的「本地基线：火山方舟 12 条、智谱AI活动页 5 条」完全一致
（本机浏览器内核探测成功，用的应是系统 Edge）。

**[实测]** `--only` 与 `--headless` 是**正交**的，踩坑点：

```
select(["cn_volc_ark"],{})           -> picked 0  missing ["cn_volc_ark"]
select(["cn_volc_ark"],{headless:true}) -> picked ['cn_volc_ark']
```

即 `--only=cn_volc_ark` 但忘了 `--headless` 会打印 `未知采集器 id` 并 `exit 1`（`collect.js:109-112`）。
`registry.select` 的 `missing` 判定（`index.js:37`）只认识「当前可见集合」，所以这不是 bug，但是个隐性坑。

---

### 2) 抓取 → 写盘的确定性步骤链

**[引用]** 编排入口 `scripts/collect.js`，顺序固定：

1. `collectFrom()`（`collect.js:47-89`）逐源采集 → 每条过 `makeDeal()`（`collect.js:60-64`），
   返回 `null` 的计入 `droppedGarbage`（`collect.js:65-68`）；整源抛错 → `report.finish({error})`
   + `console.error` + `collectorFailures++`（`collect.js:82-86`）。
2. `loadCurated()`（`collect.js:129`）读两份人工策展。
3. `loadStore()`（`collect.js:136`）读既有 `deals.json`。
4. `mergeAll({fresh, existing, curated, today})`（`collect.js:140`）。
5. `attachZh()` 贴中文覆盖层（`collect.js:177`）。
6. 两道**拦**（见第 4 节）→ `assertAllValid()`（`collect.js:231`，`store.js:171-188`）
   → `writeDeals()`（`collect.js:232`，`store.js:49-58`）。

**[引用] 去重键是「双键」**（`lib/dedup.js:110-135`）：

- 主键 `deal.id` = `sha1(lower(vendor)|lower(title)|lower(url))` 前 12 位 hex（`schema.js:276-279`）；
- 副键 `aliasKey(title)`（`dedup.js:29-52`）：先 `normalizeTitle`（小写、去括号内容、
  只留 `[a-z0-9\u4e00-\u9fa5]`，`dedup.js:20-26`）→ 查 `aliases.json` → 循环剥离
  `NOISE_SUFFIXES`（`openai/official/官网/中文版/…`，`dedup.js:12-15`）→ 剥首部噪声词。
- 命中任一键就 `merge()`（`dedup.js:84-103`）：按 `score()`（`dedup.js:71-81`）取胜者，
  败者补齐空字段，`firstSeen` 取更早、`lastSeen` 取更晚，`verified` 取「或」。

**[实测]** `aliases.json` 96 条；`normalizeTitle` 后**没有** `getsolved` 条目（`krea` 有）。
这解释了 `validate.js` 的两条警告为什么还没被消掉（详见第 4 节）。

**[引用] 官方链接判定**（`lib/official.js`）：`resolveOfficialUrl(title, fallback)` 用
`aliasKey(title)` 去查 `scripts/data/official_urls.json`，命中就返回官方页并把
`matched=true`，否则原样返回兜底 URL（`official.js:15-20`）。

**[实测]** `official_urls.json`：除 `_comment` 外只有 **10 条**映射：
`chatgpt / claude / githubcopilot / microsoftcopilot / canva / notion / cursor / replit / zapier / make`。

**[实测]** 当前 133 条里，`Layer3Labs` 9 条中有 **6 条**经这张表改写成官方页：
`ChatGPT / OpenAI`、`Canva`、`Cursor`、`Replit`、`Zapier`、`Make`。

**[实测]** 同样重要的一条**否定证据**：全仓只有 `global_deals.js:14,50` 调用
`resolveOfficialUrl`。也就是说 aitools.fyi(15 条 tool) / Futurepedia(3) / Futuretools(32)
这 **50 条**目录站条目**从不做官方页改写**，它们的 `url` 就是目录站自己的页。
（`validate.js:26,104-106` 为此留了一条 warning，见第 4 节。）

**[引用] 策展覆盖采集结果的方式**（`lib/curated.js`）：

- 文件 → 来源/地区：`curated_cn.json` → `Curated-CN`/cn；`curated_global.json` → `Curated`/global（`curated.js:11-14`）。
- `makeDeal(raw, {..., trustType: true})`（`curated.js:42-48`）→ `schema.js:325-331` 的可信分支允许**显式指定 type**。
- 策展里 `type:'deal'` 但算不出有效优惠文案的条目会被**丢弃并报明原因**（`curated.js:54-57`）。
- `deal.verified = raw.verified === true`（`curated.js:58`）——不盖章，原文照搬。
- 合并期（`store.js:109`）**只刷新 `lastSeen = today`**，并刻意**不**写 `verified: true`
  （`store.js:103-108` 的注释解释了为什么：凭空盖章会产出 `verified=true && verifiedAt=null`
  的假声明，`schema.js:439-441` 现在会拦）。
- 结果：策展条目按 `dedup.js:56-57` 的 `SOURCE_PRIORITY`（`Curated:100`/`Curated-CN:100`，
  远高于任何采集器的 10–50）在合并中**必胜**。

**[实测]** `curated_cn.json` 18 条、`curated_global.json` 14 条（合计 32，与 `validate.js`
输出的「策展数据 32 条」一致）；32/32 都是 `type:"deal"`，32/32 `verified=true` 且带 `verifiedAt`。
产物里 32 条策展全部存活。

**[引用] 写盘**（`store.js:49-58`）：`{schemaVersion:2, updatedAt: nowCN(), count, deals}`，
`JSON.stringify(payload, null, 2)` + 尾换行。上限 `MAX_DEALS=300`、过期宽限
`EXPIRED_GRACE_DAYS=14`、骤降阈值 `CIRCUIT_BREAKER_RATIO=0.3`（`store.js:20-23`）。

---

### 3) `type: deal|tool` 判定规则 + 默认视图只显示什么

**[引用] 判定规则在 `lib/schema.js:323-331`**（三行，就是全部规则）：

```js
let type;
const trustedType = opts.trustType === true && TYPES.includes(raw.type);
if (trustedType) { type = raw.type; }                                   // 只有人工策展能直接指定
else { type = (discountInfo && hasDiscountSignal(discountInfo)) ? 'deal' : 'tool'; }
if (type === 'deal' && !discountInfo) type = 'tool';                    // 无优惠文案不可能是 deal
```

- `hasDiscountSignal()`（`schema.js:243-257`）：先剥 `PRICING_TIER_WORDS`（`免费增值/freemium/free tier available/…`，
  `schema.js:66-79`）→ 按句切分并剔除 `NEGATION_PATTERNS`（`no discount`/`未…优惠` 等，`schema.js:234-240`）
  → 再匹配 `DISCOUNT_PATTERNS`（`schema.js:43-63`）。
- **第二道重判**在合并期 `store.js:114-129`：既有条目若 `source ∈ {Curated, Curated-CN}`
  或 `verified` 或 `type !== 'deal'` 就原样放过；否则 `discountInfo` 里没有优惠信号就
  `deal → tool` 并计入 `stats.reclassified`（`collect.js:164-166` 会打印）。

**[实测]** 当前 `deals.json` 的 type 分布与「谁产出的」完全对得上：

```
type deal: 80   type tool: 53
bySource/type: 百度千帆/deal 17, 阿里云百炼/deal 1, 智谱AI/deal 7, Layer3Labs/deal 6,
               Layer3Labs/tool 3, aitools.fyi/tool 15, Futuretools/tool 32, Futurepedia/tool 3,
               智谱AI活动页/deal 5, 火山方舟/deal 12, Curated-CN/deal 18, Curated/deal 14
```

即「3 个目录站 + Layer3Labs 的非折扣行」= 53 条 tool，其余 80 条是 deal。

**[实测] 默认视图只显示 `type==='deal'`，53 条 tool 一条都不进首屏。** 我用仓库自己的
渲染核心（`scripts/lib/render-core.js`，与构建期同一份代码）对当前数据复算：

```
defaultVisible(deals): 80        default visible by type: {"deal":80}
defaultCards(deals):   50        type=tool total: 53 | 其中在默认视图: 0
Σ modelCount(或1) = 80 vs 可见条数 80     ← 折叠无损断言成立
```

**[引用]** 机制：`index.html:2011-2017` 的 `matches()` 在 `filters.tab === 'deals'` 时
把非 deal 直接 `return false`；`DEFAULT_FILTERS.tab = 'deals'`（`index.html:1988-1991`）；
`defaultVisible/defaultCards`（`index.html:2097-2103`）就是构建期预渲染用的口径
（`build-local.js:115-117`）。80 条 deal 被折叠成 50 张卡（`foldDeals`，`index.html:1911` 起）。

**[引用]** tool 只出现在别处：`feed.xml`/`feed.json` 只收 deal（`build-local.js:348-352`），
`deal/<id>/` 静态详情页只给 deal（`build-local.js:480`），sitemap 同理。

**[实测]** 线上 `dist/index.html` 与本地 `dist/index.html` **字节完全相同**（都 294055 字节），
里面 `tierhead` 的计数 6+20+19+5 = 50 张卡，顶栏出现 `<b>50</b> <b>103</b> <b>30</b> <b>20</b> <b>6</b>`。
（`dist/` 在 `.gitignore:2` 里，CI 每次重新生成，所以本地 dist 与线上 dist 的一致性来自同代码同数据。）

---

### 4) `validate.js` 校验什么；「警告」与「错误」的后果；校验不过是否真阻断部署

**[引用] 校验内容分两层。**

层 A：单条记录 `schema.js:379-471` 的 `validateDeal()`，逐字段断言：
`id` 必须 12 位 hex；`title` 存在、清洗后等价、不命中 `GARBAGE_PATTERNS`；
`url` 必须 http(s) 且**不含追踪参数**（`stripTracking` 比对）；
`region ∈ {cn,global}`；`type ∈ {deal,tool}`；`category` 必须在 12 个枚举里；
`pricingModel ∈ {free,freemium,paid,trial,credits}`；`priceLine` 类型/非空/≤60 字/非垃圾；
`features` 必须是数组（或 null）、1–3 个、每个 ≤20 字、不重复、非垃圾；
`verifiedAt` 格式且**不能是未来日期**；`verified !== true && verifiedAt` → 错误；
`verified === true && !verifiedAt` → **错误**（`schema.js:439-441`，防「没有出处的假声明」）；
`type=deal && !discountInfo` → 错误；`expiresAt` 格式；`firstSeen/lastSeen` 格式；
`verified` 必须布尔；`vendor` 必须字符串；`zh` 走 `normalizeZh()`；
最后**白名单** `allowed`（`schema.js:460-468`）——出现任何未知字段 → 错误。

层 B：`validate.js` 文件与统计层：
`deals.json` 必须是 v2 对象且 `schemaVersion===2`、`updatedAt` 可解析、`count===deals.length`、
id 不重复（`validate.js:58-91`）；两份策展文件必须能过 `makeDeal+validateDeal` 且
`curated_cn` 的 region 必须是 cn（`validate.js:169-203`）；`index.html` 必须存在、引用 `deals.json`、
带 6 个 `<!--PRERENDER:*-->` 标记与 `RENDER-CORE:START/END`、引用 `logos.css`、
内联脚本能过 `new vm.Script()` 语法校验（`validate.js:255-300`）。

**[引用] 警告 vs 错误的后果（这是本任务最容易误答的一问）：**

| 类型 | 产出路径 | 是否影响退出码 |
|---|---|---|
| `warn()` → `warnings[]` | `validate.js:341-345` 只 `console.log` | **否**。`process.exit(1)` 只在 `errors.length` 时（`validate.js:347-352`） |
| `error()` → `errors[]` | `validate.js:347-352` 打印前 40 条并 `process.exit(1)` | **是** |

**[实测]** 本地 `node scripts/validate.js` exit=0，2 条警告：

```
总条数 133 / 真实优惠 80 / 国内 60 · 国外 73 / 含截止时间 0 / 含有效期说明 61（合计时间信息 61）
活动期限 : 有截止日期 0 · 未标注截止日期 112 · 长期活动 21
人工核验 32 / 卡片特性标签 32 条 / 价格阶梯 3 条 / 策展数据 32 条
⚠️  警告 2 条：
  - 疑似同一优惠未合并：Getsolved ↔ Getsolved AI Detector（可在 scripts/data/aliases.json 登记别名）
  - 疑似同一优惠未合并：KREA ↔ Kreado AI（可在 scripts/data/aliases.json 登记别名）
✅ 校验通过
```

这两条警告来自 `checkSuspectedDuplicates()`（`validate.js:132-148`）：同地区、归一化标题互为前缀
就报。它们是**建议**，不是拦截。

**[实测]** `node scripts/validate.js --strict` 也是 exit=0（strict 只加阈值与守卫，
`validate.js:330-339`：`deals<40`、`cn<20`、`total<100`、时间信息 `<60% deals` 才报错；
`checkVerifiedGuard()` 只读地构造 3 条假声明探针，确认 `validateDeal` 真的会拦，`validate.js:218-251`）。

**[引用] 校验不过是否真阻断部署——是，但断的是三条不同的路：**

1. **部署路径（deploy.yml）**：`deploy.yml:49` 只跑 `node scripts/tools/build-local.js`；
   而 `build-local.js:1123-1124` 的 `main()` 第一件事就是 `runValidate()` →
   `execFileSync(process.execPath, [scripts/validate.js], {stdio:'inherit'})`（`build-local.js:70-73`）。
   `execFileSync` 在子进程非零退出时**同步抛出**，被 `build-local.js:1133-1140` 捕获 →
   `process.exit(1)` → build job 红 → `deploy` job（`needs: build`，`deploy.yml:59-64`）不跑。
   ⇒ **`validate.js` 确实是发布门禁**（README.md:15 的说法成立），**但 deploy.yml 里没有单独的 validate 步骤**，
   门禁效果是经由 `build-local.js` 内的 `runValidate()` 达成的。
2. **采集路径（collect.yml）**：`collect.yml:40-41`（采集前体检）与 `collect.yml:59-60`
   （`--strict`，采集后）各一次；任一非零 → job 红 → **不会 commit/push** → deploy 的
   `workflow_run` 判 skipped（见第 7 节）。
3. **校验器自我守卫**：`validate.js:218-251` 的 guard 只在 `--strict` 下跑（`validate.js:309`），
   而 `--strict` 只出现在 `collect.yml:60`、`verify.yml:146`（`package.json:20` 的 `test:strict`）——
   普通 `npm test` 与 deploy 路径都不跑它。

**[引用]** 采集侧还有一道更硬的门：`store.assertAllValid()`（`store.js:171-188`）在写盘前
对**最终数组**再跑一次 `validateDeal` 并检查 id 唯一，任何一条不过就 `throw`（`collect.js:236-241` 兜底 exit 1）。

**[实测] 当前 133 条里有 0 条落地页指向聚合站**（我按 `validate.js:26` 的四个 host 复算）：
`落地页仍指向聚合站的条目: 0 / 133`，同时 `带 sourceUrl 署名的条目: 50`。所以那条 warning 现在不触发。

---

### 5) 有效期模型，与「含截止时间 0 / 未标注 112 / 长期活动 21」是否自洽

**[引用] 三分类**（前端 `expiryState`，`index.html:1351-1361`；后端同一口径在 `validate.js:117-119`）：

- `due`：有绝对截止日期 → 「剩 N 天」（`rank 0`，排序最前）
- `unknown`：官方没标注 → 「未标注截止日期」（`rank 1`）
- `ongoing`：官方写明长期/永久 → 「长期活动」（`rank 2`，排最后）

`ongoing ∩ due = ∅`：`validate.js:118-119` 的判据是 `!d.expiresAt && isOngoing(...)`，
即**只有在没有截止日期时**才可能算长期。

**[引用] 截止日期只从文案里抽，规则写死在 `lib/expiry.js`**：
`applyDeadline()` 只扫 `validity` + `discountInfo` 两处（`expiry.js:109`），
`extractDeadline()` 只认**带 4 位年份**的绝对日期（`expiry.js:32-42`），且必须满足
①「A 至 B」区间取结束端（`expiry.js:80-83`）或 ②日期前后 24/12 字窗口里有结束语义
（`END_CUE_RE`，`expiry.js:21,86-94`）；`deadline < today` 一律不采用（`expiry.js:110`）。

**[实测]** 我对当前 133 条逐条复算：

```
total 133
expiresAt non-null: 0           expiresAt values: []
validity non-null: 61           validity non-null & !expiresAt: 61
isOngoing(validity): 21         isOngoing & !expiresAt: 21
noDeadline: 112
texts containing extractable absolute deadline (validity+discountInfo): 0
```

⇒ **三个数字完全自洽**：`0 + 112 + 21 = 133`，而且 `112` 与 `21` 是
`!expiresAt` 集合（133 条）内的互补划分，与 61/133 的 `validity` 覆盖率不冲突——
**「含有效期说明 61」里有 40 条既不是长期、也没有可抽取的绝对日期**（例如 61 条里包含
`自开通起 …`、`各模型额度有独立有效期…` 这类相对期限，`expiry.js` 明确拒绝把它们当截止日，`expiry.js:11-13`）。

**[实测]** `scripts/tools/expiry-selftest.js` exit=0，55 项断言全过，末行自己说破了这件事：
`133 条：有截止日期 0 · 未标注截止日期 112 · 长期活动 21` +
`ℹ️ 当前没有任何条目带绝对截止日期——官方页面普遍只写「限时」不给日期`。

**[引用]** 两侧词表必须一致：后端 `classify.isOngoing()`（`classify.js:89-91`）与前端
`ONGOING_RE`（`index.html:1349`）同一份正则，`expiry-selftest` 断言两边同判（`classify.js:84-88`）。

**[推断]** 「含截止时间 0 条」不是 bug，而是**规则刻意保守 + 上游不给日期**的联合结果：
`expiry.js` 宁可留空也不猜（`expiry.js:11-13`），而国内厂商活动页普遍只写「限时/长期」。
代价是排序档位 `due` 永远为空，`即将截止` 这个排序在前端实际退化成「未标注 vs 长期」两档
（`index.html:2053-2064` 的注释也承认这是常态）。

---

### 6) 中文译文门禁：判定什么、e01dcfc 为什么红、ca183b9 为什么转绿

**[引用] 判定逻辑（`lib/zh.js`）：**

- 哪些字段该翻：`ZH_FIELDS = discountInfo/description/eligibility/validity/priceLine`（`zh.js:27`）。
- 什么算「英文散文」：`isEnglishProse()`（`zh.js:70-79`）——拉丁字母 >8 且
  （零汉字，**或**汉字 <8 且出现英文虚词 `the/and/for/…`）。
- 一条 `zh` 的合法性：`normalizeZh()`（`zh.js:107-166`）——只允许那 5 个字段名、
  每个字段有长度上限（`ZH_MAX`，`zh.js:30-36`）、**必须含汉字**（`cjkCount>0`，`zh.js:147-149`）、
  原文该字段不能为空、`src` 指纹必须与当前原文**逐字相等**否则该字段判 `stale` 并**停用**（`zh.js:155-162`）。
- 覆盖层是「唯一权威」：命中的 id 一旦结果为无，就**删掉** `deal.zh`（`zh.js:223-234`），
  防止「原文变了但旧译文照发」。

**[引用] 门的四种出口与后果：**

| 出口 | 来源 | collect.js | build-local.js | zh-todo --check |
|---|---|---|---|---|
| `skipped`（不合规） | `zh.js:118-149` | `collect.js:211-217` **不写盘 + exit 1** | `build-local.js:631-634` **throw 阻止发布** | 计入漂移 → exit 1 |
| `stale`（原文已变） | `zh.js:159-162` | 只 `console.warn`（`collect.js:179-181`） | 只 warn（`build-local.js:638-639`） | 计入漂移 → **exit 1** |
| `orphaned`（对不上 id） | `zh.js:237-239` | 只 warn（`collect.js:182-184`） | 只 warn（`build-local.js:640-641`） | 计入漂移 → exit 1 |
| `unmanaged`（覆盖层管不到） | `zh.js:206-214` | 只 warn（`collect.js:187-192`） | 只 warn（`build-local.js:644-651`） | 计入漂移 → exit 1 |

`zh-todo.js --check` 的漂移式：`orphaned + stale + dropped + skipped + unmanaged`（`zh-todo.js:96-99`），
`clean = drift===0 && todo.length===0`，最后 `process.exit(clean?0:1)`（`zh-todo.js:120`）。

**[实测] 发现一处口径瑕疵（不影响门禁结论）**：`dropped` 在 `zh.js:221` 被写成
`dropped += result.stale.length`，而 `stale` 数组同一批次也在累加（`zh.js:219`）。
于是同一个「原文已变」被**双计**。实测：

```
deals.json                orphaned 0 stale 0 dropped 0 skipped 0 unmanaged 0 => drift 0
preview（真实采集产物）    orphaned 0 stale 2 dropped 2 skipped 0 unmanaged 0 => drift 4
                         打印的分解式是「（对不上 id 0 · 原文已变停用 2 · 不合法 0 · 覆盖层管不到 0）」→ 与 4 对不上
```

⇒ 门禁的 **exit code 不受影响**（0↔非 0 的判定规则不变），但「漂移 N 处」这个数字会虚高，
分解式加不回总数。**推断**：这是报告口径 bug，不是门禁漏洞。

**[实测] e01dcfc 为什么红——我把那次的状态重放出来了。**
GitHub API 实测（我亲手查的 API，不是转述）：

```
JOB 108781082879 gate failure
   4    CI consistency (action / runner / node-version / engines drift) success
   7    Validate data (strict)                              success
   8    Assemble site (same path as deploy.yml)              success
   9    Translation self-test                               failure     ← 红在这里
  10    Expiry self-test                                    skipped
  13    Real-browser acceptance (verify-site.js)           skipped
  14    Gate conclusion                                     success
```

`Translation self-test` = `node scripts/tools/zh-selftest.js`（`verify.yml:154-155`）。
我在 `%TEMP%\audit-e01dcfc`（只读 git blob 作输入：`git show e01dcfc:deals.json` /
`git show e01dcfc:scripts/data/translations_zh.json`）重跑该脚本，复现出**同样一项失败**：

```
  ✓ 译文不含汉字 → 阻断发布            ✓ 原文已变 → 警告并停用该字段译文（字段数 60，应为 60）
  ✓ 译文对不上 id → 告警但不阻断        ✓ 译文对不上 id → check:zh 非零退出
  ✓ 覆盖层删掉译文 → 产物同步消失       ✓ 撤回整条译文 → 构建放行但产物里的旧译文被标为覆盖层管不到
  ✓ 撤回整条译文 → check:zh 非零退出
  ✓ 复原后构建回到 61 个译文字段
  ✗ 复原后 check:zh 回到 0（建议性门禁不会常红）      ← 唯一失败项
❌ 演练 9 项，失败 1 项
```

该项断言是 `backCheck.code === 0 && /译文与数据一致/.test(...)`（`zh-selftest.js:155-156`）。
在 e01dcfc 那份数据上，`node scripts/tools/zh-todo.js --check` 的真实输出是：

```
  已贴 43 条 / 61 个字段（数据共 133 条）
  ✓ 漂移 0 处（对不上 id 0 · 原文已变停用 0 · 不合法 0 · 覆盖层管不到 0）
  ✗ 待译 1 条 / 1 个字段
    待译   [0ddacfb2cc6e] Wavel.ai：description
❌ 需要人工处理
```

⇒ **机制链完整闭合**：`deals.json` 里 Wavel.ai 的英文描述还没进覆盖层
（`git show e01dcfc:deals.json` 里 43 条带 zh、`translations_zh.json` 里 43 个键，
两两对应，`unmanaged=0`；缺的正是 Wavel.ai 这一条）→ `--check` 报「待译 1 条」→ exit 1
→ `zh-selftest` 的「复原后 check:zh 回到 0」断言失败 → verify.yml 的 gate job 红。

**[实测] ca183b9 为什么转绿**：`git show --stat ca183b9` 只有一行变更——
`scripts/data/translations_zh.json | 7 +++++++`（提交信息：补 1 条定时采集新进条目的中文译文（Wavel.ai））。
我在当前状态下复跑同一脚本（`%TEMP%\audit-head` 副本）：**9/9 全过，exit=0**，
`复原后构建回到 62 个译文字段`、`复原后 check:zh 回到 0`。API 也显示 ca183b9 与 HEAD(a0c4ab2)
的 Verify + Deploy 都是 success。

**[实测] 当前本地门禁状态**（全部 exit=0）：
`zh-todo --check` → `✓ 漂移 0 处 ✓ 待译 0 条 ✅ 译文与数据一致`；
`expiry-selftest` → 55 项通过；`check-ci-consistency` → 24 项 0 失败。

**[引用] 这道门在链路里的**总闸**位置**：verify.yml 的 `Translation self-test` 步骤**没有**
`continue-on-error`（对比同一文件里 `verify.yml:162-170` 的 drift check 是 `continue-on-error: true`）。
但 **verify.yml 本身不控制发布**（见第 7 节），所以它的真实效果是：
**一次「待译/漂移」会让 verify 红，但线上照常发布**——而**采集侧**的对应后果更硬：
`collect.js:211-217` 的 `zhReport.skipped` 会拦住写盘（这道才是发布总闸）。

**[实测] 一个尚未爆发的隐患**：我用仓库自己的 lib 复算了**这次真实采集会产出什么**
（scratch 副本，`--dry-run` + 同一套 lib 组装）：

```
stats: fresh 97, existing 133, curated 32, mergedDuplicates 128, beforePrune 134, afterPrune 134,
       removedExpired 0, removedOverflow 0, extractedDeadlines 0, degraded false
report: attached 42 / total 134 · missing 3 · stale 2 · skipped 0 · orphaned 0 · unmanaged 0
MISSING: [9e7c938ec401] Midjourney(description) / [376b6b3397e6] Grok(description) / [39d2832e3c8f] Unboring.ai(description)
STALE  : Midjourney「zh.description 原文已变」/ Grok「zh.description 原文已变」
```

把这份 134 条的预览喂给 `zh-todo --check`（`--file=` 参数，`zh-todo.js:38`）：

```
  ✗ 漂移 4 处（对不上 id 0 · 原文已变停用 2 · 不合法 0 · 覆盖层管不到 0）
  ✗ 待译 3 条 / 3 个字段
❌ 需要人工处理（见上）        exit=1
```

⇒ **下一次定时采集（`git push` 新数据）会让 verify.yml 的 `Translation self-test` 重新变红**，
直到有人给这 3 条补译文、并复核 Midjourney/Grok 被改写的英文描述。
这不是猜测：`missing`/`stale` 的输入是**真实抓回来的**（97 条 fresh，不是我编的数据）。

---

### 7) 4 个 workflow：触发器、定时任务、以及「verify 不过就不部署」到底存不存在

**[引用] 触发器全表**（逐字来自文件头 `on:` 块）：

| workflow | 触发器 | 定时任务 | 权限 |
|---|---|---|---|
| `collect.yml` | `schedule`（`0 0 * * *` + `0 12 * * *`）、`workflow_dispatch`（`collect.yml:3-7`） | **有**，每日 2 次 = 北京 08:00 / 20:00（注释 `collect.yml:5-6`） | `contents: write`（`:9-10`） |
| `deploy.yml` | `push`→master、`workflow_run`(workflows: ["Collect AI Deals"], types:[completed], branches:[master])、`workflow_dispatch`（`deploy.yml:9-16`） | 无 | `contents: read` + `pages: write` + `id-token: write`（`:18-21`） |
| `verify.yml` | `pull_request`→master、`push`→master、`workflow_dispatch`（含 `allow_degraded_run` 布尔入参）（`verify.yml:24-38`） | 无 | 只读 `contents: read`（`:41-42`） |
| `probe-sources.yml` | **仅** `workflow_dispatch`（`probe-sources.yml:11-12`） | 无 | 只读（`:14-15`） |

**[实测]** 只有 collect 带 cron：`Select-String ... -Pattern 'schedule:'` 只在 `collect.yml:4` 命中。
`probe-sources.yml` 是纯手动探针（注释 `:9`「本工作流只读：不写仓库、不提交、不发布」，`:86-88`
只跑 `--dry-run`），所以它**不是**流水线的一环。

**[引用] job 依赖图**（三条独立链，没有交叉依赖）：

```
collect.yml  ── collect（单 job）
deploy.yml   ── build ──needs──> deploy
verify.yml   ── gate（单 job，无 job 级 if）
probe-sources.yml ── probe（单 job）
```

`deploy` job 的依赖是 `needs: build`（`deploy.yml:64`）；`gate` 无 `needs`、无 job 级 `if`
（`verify.yml:51-56`，且 `check-ci-consistency.js:128,421-425` 把「gate 无 job 级 if」钉成断言）。

**[实测+引用] 「verify 不过就不部署」不存在。** 机制解释（三条独立理由，任一条都足够）：

1. **`gate` 根本不在部署链上**：`deploy.yml` 里没有任何 `needs`/`if` 引用 verify 的 job。
   我按 job 维度复算了四条 workflow 的全部 `runs-on` 与 job 名（`check-ci-consistency.js`
   的解析器口径），deploy 只有 `build`/`deploy` 两个 job（`deploy.yml:27,59`；
   断言 `(5)`，`check-ci-consistency.js:124,373-374`）。verify 是**另一个 workflow 文件里的另一个 job**，
   GitHub 不会跨 workflow 建立依赖。
2. **唯一的发布闸门是 collect 的成败**：`deploy.yml:30` 的
   `if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'`
   ——只在 `workflow_run` 事件（即被 Collect 唤起）时才看 Collect 的结论。
   `platform === 'workflow_run'` 时它等的是 **"Collect AI Deals" 的 conclusion**，
   **不是** "Verify site (gate)" 的结论。
3. **人类 push 路径完全绕过**：`if` 的第一项是 `github.event_name != 'workflow_run'`，
   所以 `push`→master 直接为真 —— 部署**无条件跑**。

**[实测] 你观察到的 e01dcfc 现象，机制上必然如此**：

```
2026-09-28T03:57:42Z | Verify site (gate)       | e01dcfc | push   | failure
2026-09-28T03:57:42Z | Deploy to GitHub Pages   | e01dcfc | push   | success   ← 同 sha 同时刻
```

两条 workflow 由同一个 `push` 事件并行触发，各自独立结算；
`Deploy` 的 build 里跑的是 `build-local.js`（validate + 译文 `skipped` 硬失败 + 产物自检），
而 e01dcfc 那次的问题（`待译 1 条`）**恰好不属于** `skipped`（`build-local.js:631` 只拦 skipped），
所以 build-local 放行、Pages 照发，而 verify 因为 `zh-selftest` 的**额外**断言变红。
**推断**：这是设计上的分工（发布不该被「待译」卡死），但对外看起来就是「门禁红了，站点照发」。

**[引用] 另一条容易忽略的断路**：`verify.yml:22-23` 与 `deploy.yml:5-8` 都把这件事写在注释里——
**机器人用仓库自带 `GITHUB_TOKEN` 推的 `deals.json` 提交不会触发任何 workflow**
（GitHub 的防递归规定）。所以：定时采集的数据提交**从不经过 verify 门禁**；
verify 只在**人类** push/PR 时跑。e01dcfc 之所以暴露这道红，是因为那是人类 push——
此前那 1 条待译已经躺在 master 上 40+ 分钟（98d9550 数据提交 03:50 → e01dcfc 03:57 才被人看见）。

**[引用] 定时任务的实际发布路径**：`schedule`(cron) → collect → 写 deals.json → `git push`
（`collect.yml:106-116`）→ 这次 push **不**唤醒任何 workflow → 但 collect 结束时产生的
`workflow_run(completed)` 会唤醒 deploy（`deploy.yml:12-15`）→ build + deploy。
所以**每日 2 次自动发布**，且这条链上**没有** verify。

**[实测]** CI 实况（GitHub API）：最近 20 次运行里，`Collect AI Deals`(schedule, success) ×1、
`Deploy`(workflow_run, success) ×2、`Deploy`+`Verify`(push) 成对出现。
`collect:list` 的 7 个来源与 `--strict` 的阈值（`total>=100`、`deals>=40`、`cn>=20`）
在 `validate.js:330-339` 里，当前实测值 133/80/60 均有充足余量。

---

### 8) 这台机器做不到什么 / 静默失败路径清单

**[引用] 明确做不到（写在代码注释里的边界）：**

1. **不做登录态抓取**：`browser.js:9`、`headless.js:9` 明确「不加载用户 profile、不注入 cookie、不传凭据」；
   `cn_docs.js:8` 「JS 渲染的页面（火山引擎文档、智谱控制台、各家控制台）一律放弃自动采集，改人工策展」。
2. **静态 HTTP 抓不到 SPA**：`cn_docs.js:10-16` 列了 5 个**实测淘汰**的 URL
   （`bigmodel.cn/pricing` SPA 空壳 3.8KB、`volcengine.com/docs/*` 11KB 空壳、纯价格表 0 条优惠…）。
3. **无头也只覆盖 2 个页面**：`headless.js:15-18` 说明 deepseek 官网/文档「渲染后依然 0 条优惠信号，故不注册」。
4. **等不到就不猜**：`headless.js:12-13`「宁缺毋滥……页面改版导致正则不命中时产出为 0（失败安全），
   绝不猜测或拼接」；`browser.js:92-96` 明确放弃 `networkidle`（长轮询 SPA 永不触发）。
5. **无任何反爬/验证码/风控绕过**：全仓没有代理、cookie、指纹伪装；`http.js` 只设 UA/语言/超时/重试。

**[实测] robots.txt 这道"遵守"存在多个 fail-open 口子**（我把全部 9 个来源的 robots 都取回来了）：

```
robots-baidu     bytes=108  User-agent: * Disallow: /qianfandev/topic/create* Disallow: /qianfandev/user* ...
robots-zhipu     bytes=172  User-agent: * Content-Signal: ai-train=yes ... Disallow: /cdn-cgi/ Allow: /_next/image Disallow: /
robots-l3        bytes=87   User-agent: * Allow: / Disallow: /api/ Sitemap: ...
robots-aitools   ERR        https://aitools.fyi/robots.txt 抓取失败: HTTP 403
robots-ft        bytes=162  User-Agent: * Allow: / Disallow: /go/ Disallow: /admin Disallow: /api/ ...
```

- `http.js:115` `if (res.status !== 200 ...) return []` → robots 拿不到 = **全放行**；
  实测 `aitools.fyi/robots.txt` 返回 **403**，于是 `isAllowedByRobots()` 返回 true（实测 9/9 全 true）。
- `http.js:132` `else if (key === 'disallow' && applies && value && value !== '/')`
  —— **`Disallow: /` 被显式跳过**（即"整站禁止"被判成允许）。实测 `docs.bigmodel.cn` 的 robots
  最后一行正是 `Disallow: /`，但它仍被判 allowed。
- `parseRobots` 只认 `User-agent: *` 段（`http.js:131`），忽略具名 agent、`Crawl-delay`、`Allow`。
- `http.js:72-88` 的 `followRedirect()` 用**裸 axios.head**，**完全不走** robots 检查；
  而 `global_directories.js:172-175` 正是用它去解析 `https://futuretools.io/go/...`——
  实测 futuretools 的 robots 里写着 `Disallow: /go/`。**推断**：这条路径事实上绕过了自家 robots 策略。
- 采集规模：Futurepedia 一次最多 40 个详情页（并发 3，`global_directories.js:87`），
  Futuretools 最多 60 个（并发 5，`global_directories.js:145`），重试退避仅 `600*(n+1)` ms
  （`http.js:59`），**没有请求间 sleep**。

**[引用] 静默失败路径（逐条指到代码）：**

| 路径 | 代码 | 后果 |
|---|---|---|
| 整源抛错 | `collect.js:82-86`、`report.js:62-64`、`collect.js:152-157` | 逐条点名 + 写进 CI Summary，**不拦写盘、不改退出码** |
| 零产出来源 | `report.js:107-109` | 只打一行「零产出来源（不应长期保留在注册表）」 |
| 单条被丢 | `collect.js:65-68` | 只进报告表 `垃圾`/`合格` 列 |
| 采集量骤降 | `store.js:146`、`collect.js:146-151` | 仅当 `fresh < existing*0.3` 才告警，且**只告警** |
| 无头渲染空壳 | `headless.js:28-39,133-136,315-318` | `warnZeroProduction` 打印 DOM 长度/标题/控制台错误 —— 但**只写 stdout**，没人自动看 |
| 上架修剪 | `store.js:65-90` | 过期 >14 天 / 超 300 条按 score 淘汰。**`collect.js` 只打印 `extractedDeadlines`/`reclassified`/`removedGarbage`，从不打印 `removedExpired`/`removedOverflow`**（`store.js:158-159` 算了但没输出） |

**[实测] 真正的静默后果（这次亲手验证过的那一条）**：
`store.js:109` 让策展条目每次采集都刷新 `lastSeen=today`，而**抓取失败的来源不会**。
于是「某个源悄悄坏了」的表现不是条数变少（既有条目会被保留），而是：
**`updatedAt` 照常刷新、策展 `lastSeen` 照常推进、`--strict` 照常通过、站点看着"刚更新过"，
但那一批条目的内容停在最后一次成功的那天**。实测当前 `lastSeen` 只有 4 个取值
`2026-09-22 / 09-24 / 09-26 / 09-28`——即数据面上**无法**区分「源坏了」和「源本来就没新东西」。

**[实测] CI 里最脆的一环**：`collect.yml:46-52` 的浏览器安装是 `continue-on-error: true`，
装不上时两个无头来源各自报错产出 0 条（注释 `collect.yml:43-45` 承认这是设计要容忍的）。
静态源正常时 `fresh≈97 ≥ 133*0.3=40`，**`degraded` 不会报警、`--strict` 也不会红**（`total` 不降）。
⇒ 17 条（火山方舟 12 + 智谱 5，占 133 条的 12.8%）可以在无人察觉的情况下从"这次采集"里消失。
**没有心跳、没有「某源连续 N 次零产出」的告警**。

**[引用] 唯一会真拦的两处**（`collect.js:5-16` 的文件头注释把它们列为仅有两条）：
① 零产出且无 `--force`（`collect.js:223-229`）；② 译文 `skipped`（`collect.js:211-217`）。
`degraded` 与单源失败**刻意不拦**——注释 `store.js:4-10` 解释了理由：
一次 playwright 装不上就让 `deals.json` 不落库 → `deploy` 判 skipped → 线上停更，比「看起来旧一天」更糟。

---

## 未能证实

1. **CI 里无头来源的真实成功率**。[未能证实原因] `probe-sources.yml:4` 自己写着担心
   「国内厂商常见风控会拦截机房 IP」，但我**没有权限读取 GitHub Actions 的运行日志**
   （实测 `GET /repos/.../actions/jobs/108781082879/logs` → **HTTP 403**，未认证 API 拿不到日志）。
   我只证明了：本机（Windows + 系统 Edge）17 条全出；`probe-sources.yml:96` 记录的基线是
   「火山方舟 12 / 智谱 5」（**引用**，非我实测）。CI 上是否稳定，需要一次带日志的实跑才能定论。
2. **`--force` 会真写盘**。[未能证实原因] 跑它必然改 `deals.json`，与只读纪律冲突，我**故意没跑**。
   行为仅由 `collect.js:223-229` 的代码路径支持（**引用**）。
3. **verify-site.js 的 136/142 项断言**。[未能证实原因] 需要真实浏览器 + 完整 dist 验收，
   属于 A2/A3 的范围（captain 已实测 142 项 0 失败）；我只确认了 `verify-site.js` **不**加载
   `lib/zh.js`（grep 无命中），所以**译文门禁的红只可能来自 `zh-selftest`/`zh-todo`，不可能来自浏览器验收**。
4. **线上站点与本地 dist/ 的逐字节全量一致性**。[未能证实原因] 我实测了 `index.html`
   （线上 294055 字节 = 本地 294055 字节，`tierhead` 计数 6+20+19+5=50 完全一致）与 `deals.json`
   （线上 count=133、updatedAt=`2026-09-28T11:50:50+08:00`，与本地一致），但**没有遍历 80 个
   `deal/<id>/index.html` 与 50 个 logo 资源**逐字节比对（工作量大且超出 A1 的"机器做什么"范围）。
5. **GitHub 分支保护的「必需检查」是否已配置**。[未能证实原因] 这是仓库设置，需要
   管理员 API/令牌；`PROJECT_STATUS.md:2078` 自己声明本节不断言这件事。我只能从源码确认
   `gate` 是**唯一**会在 PR 上产生检查的 job（`verify.yml` 只有它一个 job，且它没有任何 `needs`，不会被别的 job 拖着跳过）。
6. **「含有效期说明 61」内部 21/40 的明细**（21 条长期 + 40 条既非长期又无绝对日期）
   是我**推断**的分组（依据：`isOngoing` 命中 21、`!expiresAt` 为 133 条全集、
   `extractDeadline` 命中 0）。我没有逐条列出那 40 条的 `validity` 原文来自证。

---

## 风险

按严重度排序。「实测/引用/推断」分档照旧。

### R1 —（高）**下一次定时采集很可能让 `Verify site (gate)` 再次变红**，而 Deploy 照发
- **实测**：真实采集会产生 3 条待译（Unboring.ai 新进；Midjourney / Grok 的英文描述被改写导致
  2 处 `stale`）+ 2 处双计漂移 → `zh-todo --check` **exit=1** →
  `verify.yml:154-155` 的 `Translation self-test` 失败（它**没有** `continue-on-error`）。
- **推断**（依据第 7 节机制）：同一次 push 的 `Deploy to GitHub Pages` 仍然 success
  （`build-local.js:631` 只拦 `skipped`，`待译`/`stale` 不在其中），复刻 e01dcfc 的形态。
- 影响：门禁的可信度。连续出现「红 + 照发」会让人开始无视红色。

### R2 —（高）**verify 门禁对"机器人数据提交"完全失明**
- **引用**：`verify.yml:22-23`、`deploy.yml:5-8` 都写明 `GITHUB_TOKEN` 推送不触发其他 workflow。
- 后果：每日 2 次的数据提交永不经过任何门禁；唯一会拦住坏数据的，是 collect job 内部的
  `validate.js` + `zhReport.skipped`（**引用** `collect.yml:40-41,59-60`；`collect.js:211-217`）。
  换句话说：**发布链上的门禁只有 collect 内的那两道**，verify 是"人类提交时的旁路检查"。

### R3 —（中高）**静默失败无告警**：源坏了只会让内容冻结，不会让任何检查变红
- **实测/引用**：见第 8 节表格。`degraded` 阈值 30% 太高（17/133 条无头产出消失也够不着），
  `removedExpired`/`removedOverflow` 从不打印，`warnZeroProduction` 只写 stdout，
  无「连续 N 次零产出」告警，无心跳。
- 影响：站点可以长期"看起来在更新"而实际内容不变；这与项目最核心的卖点（真实、及时）直接冲突。

### R4 —（中高）**robots.txt 的"遵守"存在结构性 fail-open**，且有一条实现内绕过
- **实测**：`aitools.fyi/robots.txt` 403 → 全放行；`docs.bigmodel.cn` 的 `Disallow: /` 被跳过判为允许；
  `futuretools.io` 的 `Disallow: /go/` 被 `followRedirect()`（`http.js:72-88`）绕过。
- **推断**：`followRedirect` 不检查 robots 是因为它复用了裸 axios（注释只说"用于解析厂商真实官网"），
  没人意识到它也会去 `/go/`。合规与"被投诉/被 IP 封"的风险都在这里。
- 建议（不在本轮范围）：至少把 `Disallow: /` 的语义处理对，并让 `followRedirect` 也走 robots 判定。

### R5 —（中）**CI 首日就与本地不一致的潜在点：无头来源依赖 `--with-deps` 装内核**
- **引用**：`collect.yml:46-52`（continue-on-error）、`verify.yml:96-128`（探测 + 明确判死）。
- **推断**：verify 那边做得很好（没有浏览器就**明确失败**，不静默变绿，`verify.yml:209-224`），
  但 collect 那边**报错也不拦**。两者口径不一致本身是合理取舍，代价是 R3 的可见性缺失。

### R6 —（中）**`validate.js` 白名单字段校验意味着任何字段新增都是破坏性变更**
- **引用**：`schema.js:460-468`（未知字段 → error → 部署被拦）。
- **推断**：这对数据契约是好事，但采集器/工具若想偷偷加字段（如 `rawNotes`），
  后果是**整条链路红**而不是静默丢字段。需要在文档里写清上线顺序（先改 schema 白名单再发数据）。

### R7 —（中低）**`zh-todo --check` 的 drift 数字双计**（`zh.js:219,221`）
- **实测**：真实数据上打印「漂移 4 处」而分解式是 2。**推断**：不影响 exit code，但会让人以为问题更大；
  如果将来有人拿这个数字做阈值判断（例如 "drift>3 才告警"），就会算错。

### R8 —（中低）**50 条目录站条目的落地页就是目录站本身**
- **实测**：`落地页仍指向聚合站的条目: 0/133`（当前侥幸为 0），但 `aitools.fyi` 15 条 +
  `Futuretools` 32 条 + `Futurepedia` 3 条共 50 条的 `url` 全部是目录站页
  （`resolveOfficialUrl` 只在 `global_deals.js` 被调用，实测全仓仅此一处调用点）。
- **引用**：`validate.js:104-106` 为此留了一条 warning 判据（host 以 `aitools.fyi` 等结尾）。
- **推断**：这 50 条现在是 `type=tool`（不进默认视图），所以"落地页指向聚合站"还没伤到主线；
  但 `Layer3Labs` 那 3 条 tool 之外的 6 条 deal 已经靠 `official_urls.json`（仅 10 条映射）兜住了——
  **映射表只有 10 条**，一旦源里出现新厂商，就会退回聚合站落地页（或被 `PSEUDO_TITLES` 丢掉）。

### R9 —（低）**文档口径与实现的偏差（两处，都不影响运行）**
- `README.md:15` 说「`scripts/validate.js` 是部署门禁，校验不过就不部署」——
  **实测成立**，但 deploy.yml 里**没有** validate 步骤，它是被 `build-local.js:1124` 间接调用的；
  只看 workflow 会误以为这里没有门禁。
- `docs/DESIGN-RULES.md` / 注释里多处写「136 项断言」（`verify.yml:188` 也写 136），
  而 captain 实测为 **142 项**（`research/_raw/AUDIT-CONTEXT.md:44`）。属于陈旧文案，机械无害。

---

## 我跑过的命令清单

> 全部在本仓库根目录或 `%TEMP%` 下的 scratch 副本里执行；scratch 副本用 `mklink /J` 复用
> 仓库的 `node_modules`，**没有任何命令写入仓库工作区**（跑完 `git status --short` 只剩
> captain 的 `?? research/_raw/AUDIT-CONTEXT.md`）。

**A. 采集器注册表与真实抓取（scratch 副本，全部 `--dry-run`）**
1. `node scripts/collect.js --list`
2. `node scripts/collect.js --list --headless`
3. `node -e "const r=require('./scripts/collectors'); …"`（复算 `all({})`=7、`all({headless:true})`=9、`select()` 语义）
4. `node scripts/collect.js --dry-run`（7 个静态源 → 97 条，失败 0）
5. `node scripts/collect.js --headless --only=cn_zhipu_pricing,cn_volc_ark --dry-run`（17 条：12+5）
6. 探针脚本（node stdin）：对 9 个来源逐个 `isAllowedByRobots()`，并取回 8 个 `robots.txt` 原文
7. `Invoke-WebRequest -Method Head` × 9（来源可达性）

**B. 数据与产物复算（只读）**
8. `node scripts/validate.js` → exit 0，警告 2
9. `node scripts/validate.js --strict` → exit 0
10. `node -e "…"` 对 `deals.json` 做分布复算（type/region/source/expiresAt/validity/isOngoing/verified/zh）
11. `node -e` 用 `lib/zh.js` 的 `load()+attach()` 复算覆盖层报告（attached 44、orphaned 0、unmanaged 0）
12. 对比 `deals.json`(43 zh) ↔ `translations_zh.json`(44 keys) → 定位唯一差异条目 `0ddacfb2cc6e Wavel.ai`
13. `node -e`（`render-core.js` 的 `defaultVisible/defaultCards/gridHtml`）→ 80 / 50 / 50
14. 从 git blob 取出 e01dcfc 与 98d9550 的 deals+overlay，复算 unmanaged/orphan 数
15. `node scripts/tools/expiry-selftest.js` → 55 项 0 失败
16. `Invoke-WebRequest` 线上 `index.html` / `deals.json`，与本地 `dist/` 对照

**C. 门禁复现（scratch 副本）**
17. `%TEMP%\audit-head`：`node scripts/tools/zh-selftest.js` → **9 项 0 失败，exit 0**
18. `%TEMP%\audit-e01dcfc`（数据 = `git show e01dcfc:…`）：同上 → **9 项 1 失败，exit 1**，
    失败项 = `复原后 check:zh 回到 0`
19. `%TEMP%\audit-e01dcfc`：`node scripts/tools/zh-todo.js --check` → `待译 1 条 [0ddacfb2cc6e] Wavel.ai`，exit 1
20. 真实采集的合并预览（node stdin，调用 `makeDeal/loadCurated/loadStore/mergeAll/attach`）
    → `missing 3 / stale 2 / skipped 0`
21. `node scripts/tools/zh-todo.js --check --file=%TEMP%\preview-deals.json` → 漂移 4 / 待译 3，exit 1
22. `node scripts/tools/zh-todo.js --check`（仓库当前状态）→ 0 漂移 0 待译，exit 0
23. `node scripts/tools/check-ci-consistency.js` → 24 项 0 失败（含 `--expect-checks=24` 带外校验）
24. `node --check` × 5（collect / validate / check-ci-consistency / zh-todo / zh-selftest 语法）

**D. CI 与 git（只读）**
25. GitHub API：`/actions/runs?per_page=20&branch=master`（按 sha/event 列结论）
26. GitHub API：`/actions/runs/36375740112/jobs`（e01dcfc 的 14 步逐项结论）
27. `GET /actions/jobs/108781082879/logs` → **403**（未能读取日志，已记入「未能证实」）
28. `git status --short` / `git rev-parse HEAD` / `git log --oneline` / `git show --stat ca183b9` /
    `git show --stat e01dcfc` / `git show <sha>:<path> > %TEMP%\…` / `git ls-files dist` / `git ls-files --error-unmatch`
29. `Select-String` 在 `README.md / PROJECT_STATUS.md / NEXT_STEPS / DESIGN-RULES` 里定位「部署门禁 / verify gate」措辞
