# 当前版本全貌报告 · `ai-deals-aggregator` @ `a0c4ab2`

- **任务**：t5 [A5]《当前版本全貌报告》｜团队 `ai-deals-audit-2026-09-28`
- **撰写人**：synthesizer（attempt 1 / `7f710d8f-ce41-4c1e-9ae8-9102a01193cb`）
- **撰写时间**：2026-09-28 18:48 起（Asia/Shanghai）
- **性质**：**只读汇总 + 定点复测**。未修改任何代码 / 数据 / 产物 / workflow / 根目录文档；本次唯一写出的文件是本报告。
- **证据分档**（全文统一，任何数字都可按档案回原文）：
  - `[我]` = 我本轮亲手跑命令或抓取得到的（复测清单见 **§9.1**）；
  - `[A1]`–`[A4]` = 依赖报告 `01-pipeline.md` / `02-data.md` / `03-frontend.md` / `04-ops-docs.md` 的实测结论；
  - `[cap]` = `research/_raw/AUDIT-CONTEXT.md`（captain 基线）与 captain 在 t5 派单里的**更正**（见 §3.3、§4.3）；
  - `[推断]` = 我的判断（附理由）；`【未证实】` = 明确没证明的事。
- **口径纪律**：四份报告或与基线冲突时，文内显式写出「两份报告不一致，采信 X 因为 Y」并给原始数字。**本报告不含任何无法追溯的数字。**

---

## §0. 一页速读（如果你只有 3 分钟）

1. **现在这一版是什么**：`a0c4ab2`（2026-09-28 12:10:53 +0800），本地 = 远端 = 线上，**线上 `index.html` 与本地 `dist/index.html` 逐字节相同**（294055 字节，sha256 `a188233ad55a04b0…`）`[我]`。现役数据 133 条、其中真实优惠 80 条、默认视图 50 张卡。
2. **机器确实在自转**：每天 2 次定时采集（北京 08:00 / 20:00）→ `validate.js --strict` → 写 `deals.json` → 唤醒 `deploy` 构建 GitHub Pages。近 20 次 CI run：**19 success / 1 failure** `[我]`。
3. **但「门禁」是能看不能拦**：`verify.yml` 的 `gate` **不在发布链上**（`deploy.yml` 与它互不阻塞），而且机器人 `GITHUB_TOKEN` 推的数据提交**不触发任何 workflow** ⇒ 每天 2 次的数据变更事实上绕过门禁；仓库又**没有 PR 流程**（PR 触发的 run 累计 0 次），所以 `gate` 从未在合并前拦下过任何东西 `[A1][A4][我]`。
4. **用户能在线上踩到两类真缺陷**：① 13 条「长期活动 / 未标注」角标与它自己的文案**互相打脸**，且已渲染进线上静态页（详情页同一信息栅格里两行互斥，首页 15 张「长期活动」角标的 tooltip 复述了不存在的依据）`[我]`；② `#jumpNav` 导航在排序/列表视图下**应当隐藏却可见**，4 个锚点全是死锚点，点击不滚动、只在 URL 留无效 hash `[cap][A3]`。
5. **文档的机制部分可信、状态部分系统性滞后**：28 条可验证声明里 **16 条与实测不符**、5 条会让人做错决定；**没有任何一份文档说清「现在这一版是什么」**（根目录 4 份文档分别凝固在 `fa2403d`/`777e3b7`/`52f6164`/`a0c4ab2` 四个时点）`[A4]`。
6. **健康度一句话**：**工程实现 > 运维治理 > 文档**。数据 3/5、前端 4/5、自动化 3/5、文档 2/5（评分依据见 §7）。

> 30 分钟阅读路线：§1（版本坐标）→ §3（数据真相）→ §4.2（能力矩阵）→ §5.3（发布机制的结构性漏洞）→ §6（文档偏差表）→ §8（风险与最小修复）。

---

## §1. 一句话定位 + 版本坐标

**一句话定位**：这是一个用「7 个静态采集器 + 2 个无头采集器 + 32 条人工策展」喂出来的国内外 AI 优惠聚合站，产物是**零依赖、预渲染、无 JS 也能读**的静态站（GitHub Pages），机器链路能自转；它的问题不在「能不能跑」，而在「跑出来的东西有没有人守门、文档有没有告诉读者现在是哪一版」。

### 1.1 版本坐标（全部 `[我]` 本机/线上实测，2026-09-28 18:48–18:55）

| 项 | 值 | 证据 |
|---|---|---|
| 本地 HEAD | `a0c4ab2709fb309a6edeac2afa1798d0ede9cbe5`（`a0c4ab2`） | `git rev-parse HEAD` |
| HEAD 提交时间 / 标题 | 2026-09-28 12:10:53 +0800 · `docs: 2.32 上线记录 —— 快进 e01dcfc..ca183b9、两条工作流 success（含第一推暴露的译文门禁红）` | `git log -1 --format='%H\|%ai\|%s'` |
| 远端 master | `a0c4ab2`（`git rev-parse origin/master` + GitHub API `/branches/master` 双向一致） | 同上 + API |
| 工作区 | 干净；未跟踪只有 `research/_raw/AUDIT-CONTEXT.md` 与 `research/_raw/audit-2026-09-28/` | `git status --short` |
| 线上地址 | `https://buguoshixc.github.io/ai-deals-aggregator/` | HTTP 200 |
| 线上产物时间戳 | `last-modified: Mon, 28 Sep 2026 04:11:20 GMT`（= 北京 12:11:20），`index.html`/`deals.json`/`sitemap.xml`/`feed.xml` 四个文件同值 | `fetch` 响应头 |
| 数据版本 | `deals.json` `schemaVersion=2`、`count=133`、`updatedAt=2026-09-28T11:50:50+08:00` | 本地与线上同值 |
| **本地 vs 线上** | **一致（逐字节）**：`dist/index.html` 294055 B sha256 `a188233ad55a04b0…` == 线上；`dist/deals.json` 132665 B sha256 `5c752b8083662f00…` == 线上 | 见 1.2 |

### 1.2 一致性核验：3 个层次，只做到第 2 层

| 层次 | 结论 | 证据 |
|---|---|---|
| ① 三个判据（`count` / `updatedAt` / id 集合） | 一致 | `[cap]` 基线原话，`[我]` 复核 |
| ② **逐字节**（sha256） | `index.html` + `deals.json` 一致；另**抽样 12 个线上文件全部与本地 `dist/` 字节相同**（`sitemap.xml` `562a53b5…` / `feed.xml` `f2a65aa8…` / `feed.json` `4756221c…` / `robots.txt` `1bbde8cd…` / `logos.css` `8f6cc153…` / `og-image.png` `b431610d…` / `favicon.svg` `bda7042d…` + 5 个 `deal/<id>/index.html`） | `[我]` `fetch` + `Buffer.equals` |
| ③ 全量 139 个产物文件 | **未做** ⇒ 【未证实】 | 只抽样 12/139 |

**⚠️ 本次审计最重要的一条方法论教训（写在这里，因为它是全报告的前提）**：`count` / `updatedAt` / id 集合三个判据**一致**，但字段级并不一致——

| 文件 | 字节 | sha256(前16) | 带 `zh` 条目 |
|---|---|---|---|
| 线上 `deals.json`（= `dist/deals.json`） | 132665 | `5c752b8083662f00` | **44 条 / 62 字段** |
| 仓库根 `deals.json` | 132544 | `46a1947272f58cde` | **43 条 / 61 字段** |

差异恰好 121 字节 = `0ddacfb2cc6e`（Wavel.ai）的 `zh.description`。
⇒ **两份报告不一致**：`[cap]` 基线 §3 写「线上 `deals.json` 与本地 `deals.json` 完全一致」；`[A2]` §9 与 `[A3]` §2.3 用字节比对否定它。
**采信 A2/A3 与我的复测**（三者独立同结论、可复现）；captain 已在 t5 派单里**主动更正**了这句，我在此按更正后的口径书写。
—— 这条不是文字游戏：如果只看那三个判据，你会以为仓库数据文件 = 线上数据文件，从而**永远发现不了**「覆盖层已译 44 条、落盘只 43 条」这类漂移（谁没发现它：见 §3.4 门禁盲点）。

另：`dist/` 在 `.gitignore:2` 里，是**无版本记录的构建产物** `[A1]`；本地与线上的一致来自「同代码 + 同数据」，而不是「同一份被保存的产物」。

---

## §2. 「这台机器在干什么」——端到端链路（实测事实，不抄 README）

### 2.1 采集：默认 7 个静态源，另有 2 个无头源必须显式开关

`[我] node scripts/collect.js --list` exit=0，逐字输出：

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

`[A1]` 追加实测：`--headless` 时再注册 `cn_zhipu_pricing`（智谱AI活动页）、`cn_volc_ark`（火山方舟）；
直接 require 注册表得 `all({}) = 7`、`all({headless:true}) = 9`。**默认路径完全不碰 `playwright-core`**（`collectors/index.js:17-28`）。

真抓结果 `[A1]`（scratch 副本 `--dry-run`，不写盘）：7 个静态源 **97 条 / 失败 0**（Futuretools 37、百度千帆 17、aitools.fyi 15、Layer3Labs 13、智谱AI 7、Futurepedia 7、阿里云 1）；2 个无头源 **17 条**（火山方舟 12 + 智谱活动页 5），与 `probe-sources.yml:96` 记录的本地基线一致。

### 2.2 从抓回到写盘的固定步骤（`[A1]` 引用 `scripts/collect.js` + `lib/*`）

1. `collectFrom()` 逐源抓取 → 每条 `makeDeal()`；返回 `null` 的计入「垃圾」；整源抛错只记 `collectorFailures`。
2. `loadCurated()` 读两份人工策展（`curated_cn.json` 18 条 + `curated_global.json` 14 条 = 32 条）。
3. `loadStore()` 读既有 `deals.json`（133 条）。
4. `mergeAll({fresh, existing, curated, today})`：**去重是双键**——
   - 主键 `id = sha1(lower(vendor)|lower(title)|lower(url))[:12]`（`schema.js:276-279`）；
   - 副键 `aliasKey(title)`（剥括号内容、查 `aliases.json`、循环剥 `NOISE_SUFFIXES`，`dedup.js:20-52`）；
   - 命中任一键即 `merge()`（`dedup.js:84-103`）：按 `score()` 取胜者、败者补空字段、`firstSeen` 取早、`lastSeen` 取晚、`verified` 取「或」。
   - 策展来源优先级 `SOURCE_PRIORITY: Curated/Curated-CN = 100`（远高于采集器的 10–50）⇒ 策展在合并中**必胜**；合并期**只刷 `lastSeen`，刻意不盖章 `verified`**（`store.js:103-109`）。
5. `attachZh()` 贴中文覆盖层（采集期也贴，`collect.js:30,177` `[cap]`）。
6. **两道真拦**（`collect.js:5-16` 的文件头把它们列为仅有两条）：① 零产出且无 `--force`；② 译文 `skipped`（不合规译文：**不写盘 + exit 1**）。
7. `assertAllValid()`（写盘前对最终数组再跑一遍逐条校验，任何一条不过就 `throw`）→ `writeDeals()`：`{schemaVersion:2, updatedAt, count, deals}`，上限 `MAX_DEALS=300`、过期宽限 14 天、骤降熔断比 0.3。

**`type: deal | tool` 的判定只有三行**（`schema.js:323-331`）：只有人工策展能通过 `trustType` 直接指定 `type`；否则「有真优惠信号才 `deal`」，且 `deal` 无 `discountInfo` 一律降为 `tool`。第二道重判在 `store.js:114-129`（策展 / `verified` / 非 deal 放过，其余无优惠信号则 `deal → tool`）。

`[我] node scripts/validate.js` 实测 type 分布与「谁产出的」严丝合缝：**80 deal / 53 tool**，且 **53 条 tool 全部来自 3 个目录站 + Layer3Labs 的非折扣行**（aitools.fyi 15 / Futuretools 32 / Futurepedia 3 / Layer3Labs 3）。

### 2.3 校验：警告不拦，错误才拦；`--strict` 只在两处跑

`[A1]` 引用 + `[我]` 实跑：

| 出口 | 行为 | 是否影响退出码 |
|---|---|---|
| `warn()` → `warnings[]` | 只 `console.log`（`validate.js:341-345`） | **否** |
| `error()` → `errors[]` | 打印前 40 条 + `process.exit(1)`（`validate.js:347-352`） | **是** |

`[我] node scripts/validate.js` exit=0，2 条警告（`Getsolved ↔ Getsolved AI Detector`、`KREA ↔ Kreado AI`）。
`--strict` 额外加 4 条数量阈值（`total≥100`、`deals≥40`、`cn≥20`、带时间信息 ≥60% deals，`validate.js:330-339`）与一个校验器自我守卫探针；`[A1]` 实测 `--strict` 也是 exit=0。
**`--strict` 只出现在 `collect.yml:60` 与 `verify.yml:146`**（`package.json` 的 `test:strict` 是第三个入口）。

**校验不过真的阻断部署吗？——是，但走的是间接路径**（`[A1]` 实测 + 我复核 workflow）：

- `deploy.yml:48-49` 的步骤名叫 **`Validate data and assemble site`**，但它只跑一条命令 `node scripts/tools/build-local.js`——**deploy.yml 里没有单独的 validate 步骤** `[我]`；
- 门禁效果来自 `build-local.js:1123-1124` 的 `main()` 第一件事 `runValidate()` → `execFileSync(node scripts/validate.js)`（`build-local.js:70-73`），子进程非零即抛 → build job 红 → `deploy` job（`needs: build`，`deploy.yml:64`）不跑。

### 2.4 构建与部署：产物是「暂存 + 自检 + 一次性 promote」

`[A1][A3]` 引用 `scripts/tools/build-local.js`（58363 B / 1141 行）：
先 `runValidate()`（**不带 `--strict`**）→ 全部写进 `dist.building` → 自检 40+ 项全过才 `promoteStaging()` rename 成 `dist`（失败则删暂存、旧 `dist` 保留）。
组装动作：替换 6 个 `<!--PRERENDER:*-->` 锚点、`__SITE_URL__` ×6、删 `loading` 占位、`attachZh()` 后把贴好译文的那份写进产物、用 Node 内置 `zlib` 现画 1200×630 OG 图、为每条 `type=deal` 生成 `deal/<id>/index.html`、生成 `sitemap.xml` / `feed.xml` / `feed.json`。
最硬的三条自检：**折叠覆盖条数 === 未过期优惠条数**（从产物 markup 的 `data-model-count` 反算）、**详情页目录数 === `type=deal` 条数 且 sitemap = 首页 1 + 详情页 N**、**FAQ 可见文案与 `FAQPage` 逐字一致（可见侧用不同解析器回读）**。
`[A4]` 实测：`npm run build` ×3，`dist/index.html` SHA256 恒为 `A188233AD55A04B049F6EA9A3D31A421EAB32928EFC0F679EF9B577D66F714E3`；`[我]` 复算当前 `dist/index.html` 的 sha256 前 16 位 = `a188233ad55a04b0`（同值）。
⇒ **构建确定性成立**；但仓库里**没有脚本守着它**（`[A3]` grep `sha256|确定性|两次构建` → 0 命中，唯一 `createHash` 是 `schema.js:278` 的 sha1 指纹）。

`[我]` 复核四条工作流的关键行：

- `collect.yml`：`cron '0 0 * * *'` / `'0 12 * * *'`（= 北京 08:00 / 20:00）；采集前 `validate.js`（:41）、采集后 `validate.js --strict`（:60）；浏览器安装与译文漂移检查是 `continue-on-error: true`（:47/:66/:82）；末尾 `git push`（:115）。
- `deploy.yml`：`workflow_run: Collect AI Deals (completed, master)` + `push(master)` + `dispatch`（:12）；`build` job 的 `if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'`（:30）——**只关心「是不是采集失败」**；`deploy: needs: build`（:64）。
- `verify.yml`：`push`/`pull_request`/`dispatch`；`check-ci-consistency --expect-checks=24`（:88）、`validate.js --strict`（:146）、`build-local.js`（:151）、`zh-selftest.js`（:155）、`expiry-selftest.js`（:158）、**`verify-site.js` 不带 `--compare`**（:235）。
- `probe-sources.yml`：**仅手动**（`workflow_dispatch`），只读探针，累计只跑过 2 次（最近 2026-09-21）`[我][A4]`。

### 2.5 这台机器的三条独立链路（**这是全报告最需要记住的一张图**）

```
[定时] cron 08:00/20:00 ─► collect.yml ─► validate --strict ─► 写 deals.json + git push(GITHUB_TOKEN)
                                                  │                      │
                                                  │(失败=不 push)         │(不触发任何 workflow!)
                                                  ▼                      ▼
                                         线上保留上一份好数据      workflow_run(completed) ─► deploy.yml
                                                                       build(内含 validate) ─► GitHub Pages

[人类 push/PR] ──┬─► deploy.yml（无条件跑：if 第一项 event_name != 'workflow_run' 即为真）──► 发布
                 └─► verify.yml 的 gate（旁路、与 deploy 并行、互不阻塞）
```

⇒ **发布链上的真门禁只有 collect 内部那两道 + build-local 的自检**；`verify.yml` 的 `gate` 是「人类提交时的旁路检查」，而且因为**没有 PR 流程**（`pull_request` 触发的 run 累计 0 次 `[A4][我]`），它连「合并前拦截」这个唯一有牙的形态也从未生效。

### 2.6 机器做不到什么 / 静默失败清单（`[A1]` 引用 + 实测）

**明确的边界**（代码注释自述）：不做登录态/不注入 cookie/不传凭据（`browser.js:9`、`headless.js:9`）；SPA 页放弃自动采集（`cn_docs.js:10-16` 列了 5 个实测淘汰 URL：`bigmodel.cn/pricing` 3.8 KB 空壳等）；无头也只覆盖 2 个页面（deepseek 渲染后 0 优惠信号，不注册）；**宁缺毋滥**，页面改版导致正则不命中就产出 0，绝不猜。

**robots.txt 的「遵守」有 3 个 fail-open 口子 + 1 条实现内绕过** `[A1]` 实测：
① robots 抓不到（`aitools.fyi/robots.txt` → HTTP 403）⇒ 全放行（`http.js:115`）；
② `Disallow: /` 被显式跳过（`http.js:132` 的 `value !== '/'` 判断）⇒ `docs.bigmodel.cn` 的整站禁止被判成允许；
③ `parseRobots` 只认 `User-agent: *` 段，忽略具名 agent / `Crawl-delay`；
④ `followRedirect()`（`http.js:72-88`）用裸 axios.head，**完全不走 robots 检查**，而它正是用来解析 `futuretools.io/go/...` 的——而 futuretools 的 robots 明写 `Disallow: /go/`。

**静默失败路径**（每条指到代码，`[A1]`）：整源抛错不拦写盘不改退出码（`collect.js:82-86`）；零产出来源只打一行（`report.js:107-109`）；采集量骤降只在 `fresh < existing*0.3` 时才告警且**只告警**（`store.js:146`）；无头渲染空壳只写 stdout（`headless.js:28-39`）；`removedExpired`/`removedOverflow` 算了但**从不打印**（`store.js:158-159`）。
**后果（实测）**：`store.js:109` 让策展条目每次采集都刷新 `lastSeen=today`，抓取失败的来源不刷新 ⇒ 「某个源悄悄坏了」的表现**不是条数变少**，而是 `updatedAt` 照常刷新、`--strict` 照常通过、站点看着「刚更新过」，内容却停在最后一次成功那天 `[A1]`。当前 `lastSeen` 只有 4 个取值（`09-22 / 09-24 / 09-26 / 09-28`）⇒ 数据面上**无法**区分「源坏了」与「源本来就没新东西」。

**CI 里最脆的一环**：浏览器安装 `continue-on-error` ⇒ 装不上时 2 个无头源产出 0 条，而静态源 `fresh≈97 ≥ 133*0.3=40`，`degraded` 不报警、`--strict` 也不红。⇒ **17 条（火山方舟 12 + 智谱 5，占 133 条的 12.8%）可以在无人察觉的情况下从这次采集里消失**，且**没有心跳、没有「连续 N 次零产出」告警** `[A1]`。

---

## §3. 数据现状表（每个数字都标注来源）

> 口径说明：**条目（entry）** = `deals.json` 里一行；**卡片（card）** = 折叠/筛选后用户看到的一张卡。默认视图 = 优惠 Tab（`DEFAULT_FILTERS.tab='deals'`）。

### 3.1 分布与对账

| 指标 | 值 | 来源 |
|---|---|---|
| 条目总数 | **133** | `[我] node scripts/validate.js` → 「总条数 : 133」；`deals.json.count` |
| 真实优惠 `type=deal` | **80** | `[我]` 同上「真实优惠 : 80」 |
| 工具信息 `type=tool` | **53** | `[A2]` 133 − 80；`dist/index.html` 顶部「全部工具 103」 |
| 国内 / 国外 | **60 / 73** | `[我]` 同上「国内 / 国外 : 60 / 73」 |
| cn 里的 deal / tool | 60 / **0**（53 条 tool 全是 global） | `[A2]` |
| global 里的 deal | 20（Curated 14 + Layer3Labs 6） | `[A1][A2]` |
| 默认视图卡片 | **50** | `[我] node scripts/tools/tier-report.js` 首行「=== 分档分布（默认视图，50 张卡片）===" |
| 折叠结构 | **3 张折叠卡覆盖 33 行**（百度千帆 17→1、火山方舟 9→1、智谱免费模型 7→1）+ 47 张单条卡 = 50 | `[A1][A2]`（80 = 33 + 47） |
| 53 条 tool 会进默认视图吗 | **不会**（`matches()` 首句 `tab==='deals'` 时非 deal 直接 `return false`） | `[A1][A2]` 引用 `index.html:2011-2013,1988-1995` |
| 厂商：原始串 / 归一后 | **86 / 80 家** | `[A2]`（`VENDOR_RULES`） |
| 只算 80 条 deal 的厂商 | **32 家**，其中 **42 条（52.5%）来自 3 家**（baidu 17 + volcengine 13 + zhipu 12） | `[A2]` |
| category 覆盖面 | 12 个枚举全部命中；`API服务` 36 条（被「按模型列举」拉偏） | `[A2]` |
| `pricingModel=null` | 40 条（35 tool + 5 条 Layer3Labs 目录行） | `[A2]` |

### 3.2 有效期：**0 条有绝对截止日期**，不是解析失败

| 指标 | 值 | 来源 |
|---|---|---|
| `expiresAt` 非空 | **0 / 133** | `[我] validate.js`「含截止时间 : 0」 |
| `validity` 非空 | **61** | `[我]` 同上「含有效期说明 : 61」 |
| 三分类 | **有截止日期 0 · 未标注截止日期 112 · 长期活动 21**（0+112+21=133） | `[我]` 同上 + `[A2]` 独立复核（口径与 `validate.js:117-119` 逐字一致） |
| 为什么是 0 | 112 = 133 − 21 = **72 条根本没有 validity 文本 + 40 条只有相对期限**（如「自开通起 3个月」），`expiry.js:11-13` 明确拒绝把相对期限折算成截止日 | `[A2]` |
| 不是解析器失灵 | 全库 6 个文本字段里**只有 1 条**含 4 位年份：`c789f0a090bf`（Google Gemini 的 "March 11, 2026"，**过去**日期、无结束语义）；`extractDeadline` 命中 **0** | `[A2]` |
| 代价 | 「即将截止」排序在当前数据下**退化成「最近更新」**；`due` 档永远为空 | `[A3]` 实测 |

### 3.3 内部矛盾（本报告最值得先看的数据缺陷）：**角标与文案互相打脸**

`[我]` 用仓库自己的 `isOngoing()`（`scripts/lib/expiry.js` → `classify.js:89-91`：`/长期|永久有效|常年|不限时|ongoing|no expiration|always available|no end date/i`）逐条复算，结论与 `[cap]` 的更正一致：

| 方向 | 条数 | 明细 |
|---|---|---|
| **A：判「长期活动」，但文案自己说官方没标** | **11** | 严格写「未标注截止日期」字样 **9 条**：智谱 7（`ebd47f6d2522` `e7e8f538456c` `6798f78de5ce` `f22e3cd094ad` `62e3166acec0` `5dedb9455508` `df1210f69a39`）+ 火山方舟 `4caf88e30671` + 讯飞 `6869e7866510`；另 **2 条**同形态但写「以官方…为准」：`833a9889bfb7`（讯飞礼包）、`d8d0ba522315`（硅基流动） |
| **B：文案说长期/不过期，却判「未标注截止日期」** | **2** | `b75b42583ad8`（Runway，「一次性额度，不过期」）、`b4d87c02f4d9`（MiniMax，「永久五折」）——`isOngoing('不过期')=false`、`isOngoing('永久五折')=false` 我实测复现 |

**两份报告不一致，处理如下**：`[A2]` 写 13 条、`[cap]` 要求按 11 条写。我的实测给出答案：**A 向严格 9 + A 向宽 2 + B 向 2 = 13**；captain 的 11 = A 向合计（9 + 2），A2 的 13 = A + B。⇒ **两个数都对，差别只在「方向 A 是否把『以官方…为准』算进来」**。本报告统一表述为 **「11 条（严格 9）+ 2 条 = 13 条角标/文案不自洽」**。

**它与代码自己的原则直接冲突**：`scripts/lib/expiry.js:9` 写着「ongoing 与 unknown 必须分开：**把「我们没查到」写成「长期活动」就是编造**。」——方向 A 的 11 条正是那个形态。

**而且是线上可见的（我这轮的渲染级取证）**：

- 首页预渲染角标清点 `[我]`：`国内` 30 + `国外` 20 + **`长期活动` 15** + **`未标注截止日期` 35** = 50 张卡。智谱那张折叠卡的角标是
  `<span class="tg long" title="长期活动（官方有效期说明里写明长期有效）">长期活动</span>`——**tooltip 复述了一份并不存在的依据**。
- 详情页 `dist/deal/ebd47f6d2522/index.html`（= 线上，逐字节相同）**同一个信息栅格里两行互斥** `[我]`：

  ```
  <div class="k">有效期说明</div><div class="v">长期有效（官方模型列表未标注截止日期）</div>
  <div class="k">活动期限</div>  <div class="v">长期活动（官方有效期说明里写明长期有效）</div>
  ```

  第二行声称第一行「写明了长期有效」，而第一行写的恰恰是「未标注截止日期」。
- 反向那 2 条同样上线：`dist/deal/b75b42583ad8/index.html` 的「有效期说明」= 一次性额度，**不过期**，而「活动期限」= 官方未标注截止日期，以官方页面为准 `[我]`。

### 3.4 中文译文：覆盖完整，但仓库里那份数据文件暂时落后一条（**不是缺陷**）

| 口径 | 数量 | 来源 |
|---|---|---|
| 需要译文（`ZH_FIELDS` 里任一段判为英文散文） | 44（38 tool + 6 deal） | `[A2]` |
| 覆盖层 `translations_zh.json` | 44 条 / 62 字段 | `[我] zh-todo --check`「已贴 44 条 / 62 个字段」 |
| 仓库根 `deals.json` 落盘 | **43 条 / 61 字段** | `[我]` node 直读文件 |
| `dist/deals.json` = 线上 | **44 条 / 62 字段** | `[我]` node 直读 + sha256 与线上相同 |
| 译文质量 | 人工译（有意译、保留否定语气），无错译漏译；62 字段全部有 `src` 指纹 | `[A2]` 逐条读完 |

**这一条按 captain 的更正书写，勿写成「数据缺失」** `[cap]`：`collect.js:30,177` 采集期也会贴覆盖层；`ca183b9`（12:01）只改了 `translations_zh.json`，晚于 `98d9550`（11:50）的数据再生成，根文件只是**暂时落在覆盖层后面，下次采集自愈**；而 `build-local.js:617-636` 会在构建期再贴一次，所以**线上不缺这条译文**。差异 100% 是构建期新增 1 条 `zh`，英文原文字段一字未动 `[A3]`。

**但门禁盲点是真的**：`zh-todo.js --check` 的漂移计数器只统计「孤儿 / 原文已变停用 / 不合法 / 覆盖层管不到」，**没有「覆盖层已译但落盘没有」这一类** ⇒ 它对着一个落后一条的 `deals.json` 仍然报 `✅ 译文与数据一致`（`[我]` 实跑 exit=0）`[A2]`。

### 3.5 质量投入的真实结构：**「核验 32 / 特性 32 / 策展 32」是同一批数据**

| 字段 | 133 条 | 80 条 deal | 谁在填 | 来源 |
|---|---|---|---|---|
| `discountInfo` | 83 | **80（100%）** | 机器/人工 | `[A2]` |
| `eligibility` | 73 | 70 | 机器/人工 | `[A2]` |
| `validity` | 61 | 61 | 机器/人工 | `[A2]` |
| **`expiresAt`** | **0** | **0** | 无人填 | `[我]` |
| **`priceLine`** | **3** | 3 | **仅人工策展** | `[我]`「价格阶梯 : 3 条」 |
| **`features`** | **32** | 32 | **仅人工策展** | `[我]`「卡片特性标签 : 32 条」 |
| **`verified` / `verifiedAt`** | **32** | 32 | **仅人工策展** | `[我]`「人工核验 : 32」 |
| `sourceUrl` | 50 | 12 | 机器 | `[A2]` |
| `zh` | 43（线上 44） | 6 | 人工覆盖层 | `[我][A2]` |
| `firstSeen` | **121/133 = 2026-09-21**（迁移批次日）⇒ 不能当「首次发现该优惠的时间」 | — | 机器 | `[A2]` |

`[A2]` 的两条强关联（集合完全相同，非推断）：`features` 非空 32 == `verified` 非空 32 == **策展文件的行**（18 + 14）。⇒ 「人工核验 32 条」「特性标签 32 条」「策展数据 32 条」是**同一批数据的三个说法**，不是三份独立投入。`priceLine` 只有 3 条 ⇒ 价格阶梯基本等于没做。

### 3.6 真实性抽样：11 条里 5 条逐字证实、2 条部分、4 条无法证实

`[A2]`（超出任务要求的 5–8 条，抽了 11 条）：

- **逐字证实 5**：百度千帆 100万/3个月、阿里云百炼独立免费额度+华北2+过期作废、硅基流动 `bge-m3` 免费、Runway `$0/125 credits/5GB`、Coze 1500 积分/30 天。
- **部分证实 2**：智谱 `/models/free/` 路径+标题命中但正文静态 HTML 无「免费／0 元」；讯飞礼包 `礼包/免费` 命中、「2888 元」未核到。
- **无法证实 4**：`97d21ff73d3e`（智谱 2000万 Tokens，落地页是 3853 B 的 JS 壳）、`4caf88e30671`（火山方舟，静态 HTML 里「免费/领取/奖励/Token」0 命中）、`c971e33a9cd0`（chatgpt.com 本机不可达）、`f5ffff50772c`（openai.com 403）。
- **「具体到可疑但静态不可证实」的集中区**：火山方舟 12 条（200 张 / 20 小时 / 5000 字符 / 每日 500 万 Tokens）与智谱活动页 5 条 `[A2]`。
- **做得对的反例**：`4987c183fc1a`（360智脑）写「协议未公布具体面额与有效期」、`aacd5856bba2`（Notion 非营利）写「官方页未标示具体折扣比例」——把「查不到」写进了数据 `[A2]`。

### 3.7 用户可见的残缺与两条「不是重复」的警告

| 现象 | 条数 | 来源 |
|---|---|---|
| aitools.fyi 描述被**上游截断 + 我们剥掉了省略号** ⇒ 以半个词结尾（如「…将检测和重写整」） | **15** | `[A2]` 与上游 payload 逐条比对 **15/15 逐字一致**（丢失的正是「这里被截断了」这个信号） |
| `discountInfo` 触 240 字上限、断在词中（`c971e33a9cd0`，尾部 `, and relocation pla`） | 1 | `[A2]` |
| 采集正则断句（`e237cab7c007`，尾部「…额度过」） | 1 | `[A2]` |
| 「疑似同一优惠未合并」警告 | 2 | `[我]` validate.js；`[A2]` 判定：**都不是重复**——`KREA ↔ Kreado AI` 是前缀启发式误报（两家公司、两个域名、不同 sourceUrl），`Getsolved ↔ Getsolved AI Detector` 是同域不同页（`/` vs `/ai-detector`）；**四条记录全是 `type=tool`，不在默认视图** |
| 别名表实际效果 | `aliases.json` 96 键；**别名归一后仍有 133 个不同 titleKey ⇒ 在当前数据上实际合并 0 条** | `[A2]` |

### 3.8 未证实（数据线）

其余 **69/80** 条优惠**未抽样**（不是「有问题」）；22 条落在 JS 壳页面上（火山 12 + 智谱活动页 5 + 智谱免费模型 7 的「0 元」口径）；`translated` 的语义级对应未做双语人工复核；`f5ffff50772c` 的否定式声明（「无公开学生/非营利折扣」）最难证实 `[A2]`。

---

## §4. 前端与产物现状

### 4.1 产物清单（`[我]` 独立清点，与 `[A3]` 一致）

```
dist/ 共 139 个文件 · 5,285,602 字节
├── index.html     294055      ← 首页，预渲染 50 张卡
├── deals.json     132665      ← 已贴译文的那一份（= 线上）
├── feed.xml        44174      ← 80 <item>
├── feed.json       44571      ← 80 items
├── sitemap.xml     16210      ← 81 <loc>（= 首页 1 + 详情页 80）
├── logos.css        9811      ← 49 个 logo key
├── og-image.png     7808      ← 1200×630 PNG（构建期用 zlib 现画）
├── robots.txt        747      ← 放行 11 个生成式引擎爬虫
├── favicon.svg       403
├── .nojekyll           0
├── deal/  80 个 index.html（**56,319–58,731 字节，均值 57,140**）
└── logos/ 49 个文件
```

**两份报告不一致，以我的清点为准**：`[A3]` §2.1 把详情页体积写成「49543–51033 字节，均值 50140」；我用 `Get-ChildItem | Measure-Object -Length` 实测为 **56,319–58,731 字节 / 均值 57,140**。
⇒ 采信我的数值，因为 `[A3]` 那组数恰好是**字符数**量级（我读同一批文件：`ebd47f6d2522` = 49,907 字符 / 56,839 字节），这是**单位滑落**（同 A3 自己指出的任务书 152977/233517 那类错误）。`dist` 总量 139 文件 / 5,285,602 字节 两方一致，不受影响。

### 4.2 页面能力矩阵（`[A3]` 真浏览器实测 + `[我]` 产物核对）

| 能力 | 状态 | 实测要点 |
|---|---|---|
| 筛选 | ✅ | 预渲染 10 枚 `button[data-facet]`（2 Tab + 2 地区 + 6 厂商），重建后焦点归还 |
| 分类下拉 | ✅ | 12 个 `<option>` 现场生成；选「API服务」→ 20 张卡（36 条 deal 折叠后 20，口径自洽） |
| 搜索 | ⚠️ 有缺口 | 能收窄、空态正常；但检索域（`title/vendor/discountInfo/description/category/source/eligibility/features`）**不含 `zh.*`** ⇒ 用户复制译文里的中文去搜**搜不到**（实测 `c05dc74bfd78` 的「通过验证的学生与」→ 0 张卡） |
| 排序 | ⚠️ 2/3 可观测 | 3 枚按钮（`tier/expiry/updated`）；因 `expiresAt` 全为 0，「即将截止」**退化成最近更新** |
| 收藏 | ✅ | 星标完全由 JS 建、存 `localStorage['dsh.favorites']`；预渲染 HTML 里 0 个收藏控件（与门禁断言一致） |
| 对比 | ✅ | 底部条 + `<dialog>` 由 JS 建；跨视图选择集，上限 `CMP_MAX=4`，可写进 `?compare=` 分享 URL |
| 卡片折叠 | ✅ | 50 张卡覆盖 80 条；`foldKey` 把「适用条件 + 有效期」留在键里，组内不一致就不合并 |
| 列表视图 | ✅ | 768px 下 50 行、行高 54px、无横向溢出、150 个隐藏列单元 |
| 暗色 | ✅ | 手动 + **系统自动暗色**（`emulateMedia` 补测：`--bg #0b0d10`、`aria-pressed=auto`）；**门禁从未模拟媒体特性** |
| 移动端 | ✅ | 我采纳 `[A3]` 补测的 9 个宽度（1440/1181/1180/900/768/761/760/390/360）：断点行为精确、无横向溢出；门禁只测 1440/390/360 |
| 关 JS 可读性 | ✅ 有瑕 | 12565 字符正文 / 50 张卡 / 50 站内详情链 / 50 官方外链可读；但**筛选 10 + 排序 3 + 分类 1 + 搜索 1 = 15 个控件可见却无响应** |
| 零依赖 / 零 CDN | ✅ 属实 | 首页 11 类请求全同源、0 `<img>`、0 iframe、无 `@font-face`；`build-local.js`+`validate.js` 的 require 闭包只有 Node 内置模块 |
| 构建确定性 | ✅ | `[A4]` 连跑 3 次 SHA256 恒定；`[我]` 复算同值 |

### 4.3 线上正在生效的缺陷

**① `#jumpNav` 死锚点（唯一「用户能直接点错」的前端缺陷）** `[cap]`（captain 在真实浏览器对 `dist` 复现，我采信）+ `[A3]` 独立复现：

- `render()` 里 `jump.hidden = rowsView || sort !== 'tier'`（`index.html:3343-3345`），但 `.jump` 自定义了 `display:flex`（`index.html:303-306`；760px 下 `display:grid`）——**作者样式覆盖 UA 的 `[hidden]{display:none}`**；
- 实测：`attrHidden=true` / computed `display:flex` / `getBoundingClientRect().height=28` / `tier-1..4` 四个锚点 `exists=false`；点击 `#tier-2` 后 `scrollY 0→0`，只在 URL 留下无效 hash；
- 根因旁证 `[我]`：`dist/index.html` 里 `.jump[hidden]` 规则计数 **0**；而 `.cmpbar[hidden]`（`index.html:714`）、`.cmpdlg[hidden]`（`:742`）都写过补丁——**唯独 `.jump` 漏了**；
- 线上 `index.html` 与本地逐字节相同 ⇒ **脏在线上**。

**② 搜索不索引中文译文**（见 §4.2）。
**③ 关 JS 有 15 个假控件**（见 §4.2）——仓库自己在 `build-local.js:861-874` 立过 G11 规矩「无 JS 时不给可点暗示」，只落实了收藏/对比那一半。

### 4.4 门禁覆盖率与**盲区**（含 captain 的口径更正）

**规模（三个数各自的口径，别混用）** `[cap][我][A3][A4]`：

| 数字 | 含义 |
|---|---|
| **136** | **CI `verify.yml:235` 实际跑的覆盖面**（`node scripts/tools/verify-site.js`，**不带 `--compare`**；`package.json` 的 `verify` 同） |
| 142 | **本地带基线手工复跑**（`--compare=research/_raw/ours-baseline/verify.json`）；captain 之前口头引用的就是这个 |
| 143 | `verify-site.js` 里 `check()` 的调用点总数（136 常跑 + 6 回归 + 1 条仅基线缺失时执行的失败分支） |

**盲区清单（按「坏了门禁会不会红」排序，`[A3]`，我复核了关键结论）**：

| # | 盲区 | 证据 |
|---|---|---|
| A1 | **「隐藏」类断言只读属性不读渲染** | `verify-site.js:1152/1156`、`:1317/1327` 读 `nav.hidden`；`#jumpNav` 就是这么溜过去的（同类写法还在 `#cmpbar` 上） |
| A2 | **门禁自己有多少条断言无人守** | 基线 `verify.json` 的 `total` = **132**（生成于 2026-09-27T15:50:34.934Z），现在 136/142；`--compare` 只读 `parsed.metrics`，`checks` 数组写进 JSON 却**从不参与比对** ⇒ 删断言/改判据不会红 |
| A3 | **回归比对不在 CI** | `verify.yml:235` 不带 `--compare`；`package.json` 的 `verify:regress` 才是带基线的。⇒ **captain 的「旧基线掩盖回归」疑点应改写为**：这套比对从来不在门禁路径上，而且**只比 6 个计数器**（`cards 50 / coveredDeals 80 / firstScreenFull 9 / pageHeight 4566 / externalRequests 0 / jsErrors 0`，当前值与基线**完全相同**），**没有 id 集合指纹、没有内容哈希** ⇒ 把 80 条优惠整批换成另外 80 条也不会红 |
| A4 | **对比度断言是「额度」不是「门槛」** | `verify-site.js:1060/1087` 断言「低于 4.5:1 的文本 ≤ 20」；`[A3]` 独立复算亮/暗各 714 抽样 **0 条不达标**；`DESIGN-RULES.md:128` 承诺 0 ⇒ **闸门比文档松 20 个节点** |
| A5 | **断点只测 1440/390/360** | 需补 768 / 1180 边界 / 760 边界（`[A3]` 补测：正常） |
| A6 | **从不 `emulateMedia`** | 自动暗色路径无人验（`[A3]` 补测：正常）；`prefers-reduced-motion` 是唯一被模拟的媒体特性 |
| A7 | **没有真正的无障碍工具链** | 全文件 0 次 `axe`、0 次 `a11y`；不检查标题层级/跳过导航/表单标签/zoom 200% |
| A8–A10 | 不验外链死链、不验 HTML 结构合法性、搜索只测「能收窄」 | `[A3]`（当前实测没坏，属「运气好」而非「门禁保的」） |
| A11 | **部署链上的门禁强度弱于 PR 门禁** | `deploy.yml:49` → `build-local.js` 内部 `runValidate()` **不带 `--strict`**；`verify.yml:146` 才带；且机器人推送不触发 verify |
| A12 | 只跑 `dist/`，不检查「源码改了但产物是旧的」 | 风险有限（CI 必经 build） |

### 4.5 无障碍、SEO/GEO（挑门禁没覆盖的角度）

- **无障碍** `[A3]`：**整站 0 个 `<h1>`**；50 个 `<h3>`（卡片标题）全部排在唯一 1 个 `<h2>`（"常见问题"）之前（层级倒置）；力度分带标题是 `<div>` 不是标题；无 skip link；键盘走到正文要穿过 25 个控件（可由 landmark 技术满足，属最佳实践欠缺）。对比度独立复算 714 抽样 0 条不达标。
- **SEO/GEO 对账干净** `[我][A3]`：`sitemap.xml` **81 `<loc>`** = 首页 + 80 详情页，与 `type=deal` 集合**完全相等**；`feed.xml`/`feed.json` 各 **80** 条且 guid 唯一；`robots.txt` 放行 11 个生成式引擎爬虫。
- **但三处未接起来** `[A3]`：首页 `ItemList` 只列 **50** 张默认视图卡（30 条被折叠的优惠不在结构化数据）；条目 `url` 指向**厂商官方页**（50 条仅 43 个不同 URL）而不是站内 80 个详情页；feed 的 `<link>` 同理（80 条仅 49 个不同目标）+ `pubDate` 全同一天。
- **架构事实** `[A3]`：`index.html` 191057 字节 = 内联 CSS 41321 字符（27.0%）+ 应用 JS 103960 字符（68.0%，其中 `RENDER-CORE` 66718 = 43.6%）+ 骨架 7336；源码**无 `{{ }}` 占位符**，真实占位符是 6 个 `<!--PRERENDER:*-->` + 6 处 `__SITE_URL__`，产物中 0 残留。

---

## §5. 运维现状

### 5.1 CI 实况（`[我]` GitHub API 复测）

| 项 | 值 | 来源 |
|---|---|---|
| `total_count` | **90** | `[我] /actions/runs` |
| 最近 20 次 | **success 19 · failure 1 · cancelled 0 = 95%** | `[我]` 逐条列出（表格见下） |
| 累计分 workflow | `collect` **17** · `deploy` **54** · `verify` **12** · `probe-sources` **2** | `[我] /actions/workflows/<wf>/runs` |
| 唯一一次 failure | `e01dcfc` 的 `Verify site (gate)`（2026-09-28T03:57:42Z，push，62s）；**同 sha 的 `Deploy` 同时刻 success** | `[我]` |
| 当前 HEAD | `a0c4ab2` 的 Verify + Deploy 都 success | `[我]` |
| `probe-sources` 最后一次 | 2026-09-21T14:29（**7 天前**，仅手动触发） | `[我][A4]` |

**两份报告不一致**：`[A4]` §3.1 记「success 18 / failure 1 / cancelled 0 = 90%」；`[我]` 的同一端点同一窗口实测为 **19 success + 1 failure = 95%**（我把 20 条逐条打了出来：#1–#20 里只有 #5 是 failure）。
**采信我的 19/1**，因为逐条可复现、且窗口内没有任何新 run（最新一条仍是 04:11:03Z）。差异只影响百分比（90% vs 95%），不影响定性结论：**唯一那次红是 verify、而 deploy 照样绿**。

`e01dcfc` 失败原因：`[A1][A4]` 用 API 取到步骤级结论——**第 9 步 `Translation self-test` failure，其后 10–13 步连锁 skipped**；`[A1]` 进一步在 scratch 副本里**重放**了那次数据状态，复现出唯一失败项「复原后 `check:zh` 回到 0」，原因是 `deals.json` 里 `0ddacfb2cc6e`（Wavel.ai）的 `description` 还没进覆盖层 ⇒ `--check` 报「待译 1 条」⇒ exit 1。
**日志正文取不到**：`/runs/{id}/logs`、`/attempts/1/logs`、`/jobs/{id}/logs` 全部 **403 "Must have admin rights"** `[A1][A4]`（`[A1]` 用数据重放绕过了这个限制，A4 只能停在步骤级）。

### 5.2 定时采集节奏与「下一次很可能再红」

- cron：**每天 2 次**（`0 0 * * *` / `0 12 * * *` = 北京 08:00 / 20:00）；`[我]` 实测本机时间 18:48 ⇒ **下一次约 20:00（北京）**。
- `[A1]` 用真实抓回的 97 条 fresh 做合并预览（scratch、`--dry-run`）：`missing 3`（Unboring.ai 新进 + Midjourney/Grok 描述被改写）`/ stale 2 / skipped 0`；喂给 `zh-todo --check` 得 **exit=1**（漂移 4、待译 3）。
- ⇒ `[A1]` **推断**：下一次定时采集让 `verify.yml` 的 `Translation self-test` 再次变红的概率很高，而复刻 e01dcfc 形态（**verify 红 + Deploy 照发**）。
- `[A1]` 同时实测发现一处**报告口径 bug**（不影响门禁结论）：`zh.js:221` 把 `dropped` 写成 `+= result.stale.length`，而 `stale` 同批也在累加 ⇒ 同一处「原文已变」被**双计**，打印的分解式加不回总数（实测「漂移 4 处」而分解式是 2）。exit code 不受影响；但若将来有人拿这个数字做阈值就会算错。

### 5.3 发布机制里的结构性漏洞（**这一节是运维线最该被记住的部分**）

| # | 漏洞 | 机制 | 后果 |
|---|---|---|---|
| L1 | **`gate` 不在发布链上** | `deploy.yml` 没有任何 `needs`/`if` 引用 verify 的 job；`deploy.yml:30` 的 `if` 只看 **Collect 的 conclusion**；两条 workflow 由同一个 `push` 并行触发，GitHub 不排序跨 workflow | 「门禁红了但站点照发」是**机制必然**，不是偶发（e01dcfc 实证；check-run 级证据：同一 sha 上 `deploy=success`、`gate=failure` 并列） |
| L2 | **每日 2 次数据变更绕过门禁** | 机器人用仓库自带 `GITHUB_TOKEN` 推的提交**不触发任何 workflow**（`verify.yml:22-23`、`deploy.yml:5-8` 自己写明） | 数据线唯一的闸是 collect job 内部的 `validate.js --strict` + 译文 `skipped`；verify 只在人类 push/PR 时跑 |
| L3 | **没有 PR 流程 ⇒ `gate` 唯一的「拦截形态」从未生效** | `pull_request` 触发的 run 累计 **0 次**；而 `gate` 是四个 workflow 里**唯一**会在 PR 上产生检查的 job | `gate` 实际只在**事后**告诉你「刚才那推是红的」 |
| L4 | **仓库没有可公开观察的保护配置** | `[A4]` 实测 `/rulesets` → `[]`（空）；`/branches/master/protection*` → **401**（未能读取）| 【未证实】必需检查是否配置；但至少**没有仓库级 ruleset** |
| L5 | **回归比对既不在 CI，维度也窄** | `verify.yml:235` 不带 `--compare`；`--compare` 只比 6 个计数器，`checks` 名单从不比对 | 「删断言 / 换内容」都不会红（§4.4 A2/A3） |
| L6 | **静默失败无告警** | 无心跳、无「连续 N 次零产出」告警；`degraded` 阈值 30% 太高（17/133 = 12.8% 无头产出消失够不着）；`removedExpired/removedOverflow` 从不打印 | 源坏了的表现是**内容冻结而站点看着在更新**（§2.6） |

**为什么这是设计取舍而不是纯 bug**：`store.js:4-10` 的注释解释了「一次 playwright 装不上就让 `deals.json` 不落库 → 线上停更，比看起来旧一天更糟」。**取舍本身合理，问题是没有任何文档把 L1/L2/L3 写成机制声明** `[A4]`。

### 5.4 仓库卫生：分支、worktree、tag（`[A4]` 实测，`[我]` 复核 worktree）

- **提交 118 次 / 跨度 8 天 13 小时**（2026-09-20 23:09 → 09-28 12:10）。按天高度倾斜：**09-23 单日 63 次（53%）**，四天吃掉 77%。最近 20 次：`docs` 6 · `chore(data)` 4 · `fix` 4 · `merge` 2 · `data(zh)` 2 · 其他 2 ⇒ **节奏是「一次性大施工 + 事后收尾」，不是「数据在跑」**。
- **15 个本地分支**：**11 个已并入 master 且 ahead=0**（09-23 台账已登记却至今未执行；台账还漏登 `trial/fav-cmp-merge`、`fix/favorites-entry-and-compare-open`）；只有 2 个未并入且**有意保留**（`backup-pre-rewrite` 11 ahead、`trial/merge-rehearsal` 6 ahead）。
- **`.worktrees/fold-same-vendor` = 残留** `[我] git worktree list` 确认它停在 `52f6164 [fix/fold-same-vendor]`（ahead 0 / behind 5）；`[A4]` 实测目录 09-27 23:56 后未再改动 ⇒ 它同时是 `fix/fold-same-vendor` 删不掉的原因。**`NEXT-STEPS.md:192-193` 的「还在，随时能复跑」会让人复跑 09-27 的旧代码。**
- **upstream 错配只有 1 条**：`fix/detail-close → origin/master`（台账写 `behind 29`，实测 **`behind 58`**）。
- **远端无 tag、无分支** `[我]`：API `/tags` → `[]`，`/git/refs/heads` 只有 `master`。本地 2 个 tag 纯本地回退点（都是 master 祖先）。
- **坑**：若干提交 subject 以 **U+FEFF(BOM)** 开头，`^docs:` 这类正则静默漏匹配，提交分类必须先剥 BOM `[A4]`。

---

## §6. 文档与现实偏差清单（提炼自 `[A4]`；28 条声明 / 16 条不符 / 12 条一致）

**总判断**：**流程类、机制类文档高度可信（逐条复现成功）；数字类、状态类文档系统性滞后 1–2 个迭代。**
**最严重的结构性缺陷**：**没有任何一份文档说清「现在这一版是什么」**——根目录 4 份文档分别凝固在 `fa2403d`(2.28) / `777e3b7`(2.29) / `52f6164`(2.31) / `a0c4ab2`(2.32) 四个时点。

### 6.1 会让你做错决定的（🔴）

| # | 文档说什么（文件:行） | 实际是什么 | 影响 |
|---|---|---|---|
| D1 | `SUMMARY.md:9,70,85`：`master` = `origin/master` = **`fa2403d`**，「状态：已上线（2026-09-23）」，`verify --url=` **108 项 0 失败** | `a0c4ab2`（09-28 12:10）；`fa2403d` 之后走过 2.29→2.30→2.31→2.32 + 8 次数据提交 | 读者会以为线上跑的是 09-23 那一版，对 2.30 卡片折叠、2.32 撤「已核验」完全无感 |
| D2 | `NEXT-STEPS.md:160,195`：分支地图顶 `777e3b7` + 「**现在**本地与上游完全一致」；`:8` 记到 2.30 | `a0c4ab2`（落后 5 个提交）；2.31/2.32 一个字没记 | 它是被 `SUMMARY.md` 指定为「先看这个」的入口文件，会让读者以为后面没有实质改动 |
| D4 | `PROJECT_STATUS.md:14-28` 的「改造前 → **现在**」表：真实优惠 **71 条**、国内 **51 条**、折叠 **53 张卡** | 80 / 60 / **50** | 这是全文最像「现状摘要」的一张表，停在 2.10~2.11 时代 |
| D13 | `PROJECT_STATUS.md:1735,1738,1921-1923`：verify **124** 项 / regress **129** / 调用点 **130** | **136 / 142 / 143**（同一文件 `:1696` 自己又写 136/142） | 同一文件内 124 与 136 并存且都声称「当前」；按 124 预估门禁强度会算错 |
| D26 | `research/GAP-MATRIX.md:92`：G11 收藏/对比「⬜ **未做**（属 C）」 | **2.22 已落地、2.29 已补完、已上线**（`feat/favorites-compare`/`e0cd50d` 在 master 祖先里） | **最容易造成实际返工的一条**：按它排期会去做一件已经做完的事 |

### 6.2 会让你形成错误认知的（🟡）

| # | 文档说什么 | 实际是什么 |
|---|---|---|
| D3 | `PROJECT_STATUS.md:3`「最后更新 2026-09-23」 | 正文已到 2.32（09-28 12:10）；头部日期比正文早 5 天 |
| D5–D10 | 第四节快照：总 132 / tool 52 / Futuretools 31 / 视频 9；README「77 家」 | 133 / 53 / 32 / 10；**80 家**（`report:vendor` 末行「官方品牌图形 38 / 兜底 42 / 共 80 家」） |
| D6 特别提示 | `PROJECT_STATUS.md:1787-1788`「其中：国内 60 / 国外 **20**」 | 20 是**按 `type=deal` 过滤后**的国外拆分；国外**条目总数是 73**（含 53 条 tool）。同节 132/20/73 三个数没有任何口径说明 ⇒ 会低估国外内容 3.6 倍 |
| D14/D15 | `NEXT-STEPS.md:79,80` 124/129；`SUMMARY.md:61,64`「113 项 0 失败」 | 136 / 142 |
| D17 | `PROJECT_STATUS.md:1695` 两次构建 SHA256 `62692BB8…` | 当前恒定值 `A188233A…`（确定性成立，值过时） |
| D19 | `PROJECT_STATUS.md:29-30` `selftest:zh` **7 项** | **9 项**（是增强，文档没说） |
| D20/D21 | `PROJECT_STATUS.md:28` 71→53 张卡；`:1867`「48 条自动条目没有特性标签」 | 80→50；口径实为「`type=deal` 里无 features 的 48 条」，全库无 features 的是 **101 条** |
| D22–D25 | `docs/DESIGN-RULES.md:104,146,147,150`：facet **11/11**、卡片 **62/62** 可聚焦、断网仍有 **62 卡** | 10 个 facet（2.32 撤了「只看已核验」）、**50** 张卡 |
| D27 | `GAP-MATRIX.md:82,102`：首页 **62** 个标题链接、断言 55 → **95** | **50** 个；断言 136/142 |
| D-补A | `SUMMARY.md:11,89`、`NEXT-STEPS.md:26` 三处「见 **P0-2**」 | 全仓 `.md` 里搜 `P0-2` **只有这三处引用、零处定义**（断链） |

### 6.3 文档里**站得住**的部分（不只是坏消息）

| 声明 | 位置 | 实测 |
|---|---|---|
| 断言数分解 **136 / 142 / 143** | `README.md:407-409` | ✅ **唯一一份「断言数 = 现实」的文档**（我复核 `[cap][A3][A4]` 三方一致） |
| 快速开始命令 **4/4 跑通** | `README.md` 快速开始 | ✅ `npm test` / `check:zh` / `report:tier` / `serve.js` 全部 exit=0 |
| 产物含完整静态正文、不依赖 JS | `README.md:19-20` | ✅ 预渲染 50 卡 + 80 详情页 |
| 无外部请求（不热链 CDN） | `README.md:336`、`DESIGN-RULES.md:85` | ✅ 11 类请求全同源 |
| 折叠无损（50 卡覆盖 80 条） | `NEXT-STEPS.md:110`、`PROJECT_STATUS.md:1599` | ✅ 构建自检 `50 张卡片覆盖 80 条优惠（3 张折叠卡 / 33 个模型）` |
| 策展 32 = `curated_cn` 18 + `curated_global` 14 | `README.md:120` | ✅ 实测 18/14、`verified=true` 恰好 32 条 |
| 第四节快照**自带免责声明** | `PROJECT_STATUS.md:1779`「本节是当时值，不是常量」 | ✅ 诚实标注（记一功） |
| `DESIGN-RULES.md` 的**规范部分**（§1–§9） | 多处 | ✅ 用得上的地方都对（对比度、字重、禁 `transition: all`、外部请求 0）；**只有「落地情况」那节计数过期** |
| `research/` 整体质量最高 | `research/*` | ✅ 方法、口径、剔除清单、已知限制都写清；`EVIDENCE.md` 明确「只搬运、不解释、不打分」 |

---

## §7. 健康度评分（1–5，每条都能由 §1–§5 的事实推出）

| 维度 | 分数 | 一句话理由 | 扣分依据（对应章节） |
|---|---|---|---|
| **数据** | **3 / 5** | 结构自洽、可复跑、译文覆盖完整且有指纹机制；但「80 条优惠」的高度集中与 13 条自相矛盾声明，让它还不是一份可以照着做决策的数据集 | ＋三项自检对账（0+112+21=133）、62 字段全有 `src` 指纹、抽样 5/11 逐字证实｜− 80 条 deal 里 **52.5% 只来自 3 家**（§3.1）、**`expiresAt` 全库 0 条**（§3.2）、**13 条角标/文案互斥且已上线**（§3.3）、15 条描述被截断（§3.7）、`features`/`verified`/策展是**同一批 32 条**而非三份投入（§3.5）、`priceLine` 3 条、69/80 条未抽样（§3.8） |
| **前端** | **4 / 5** | 单文件零依赖 + 预渲染 + 真浏览器门禁 136 项，是**工程完成度最高**的一环；缺陷都是局部的、修复动作都很小，且没有内容造假 | ＋80/80 详情页全量核对通过、折叠无损、零 CDN 属实、构建确定性三次恒定、暗色/移动端补测正常（§4.1–4.2）｜− **`#jumpNav` 死锚点线上生效**（§4.3①）、搜索不索引中文译文（§4.3②）、无 JS 15 个假控件（§4.3③）、**整站 0 个 `<h1>`**（§4.5）、结构化数据把 url 指向厂商页而非自己的 80 个详情页（§4.5）、门禁自身的守卫缺失（§4.4 A1–A3） |
| **自动化** | **3 / 5** | 机器链路**确实在自转**（cron 2×/日、真抓 97+17 条、validate 真能拦发布、CI 19/20）；但门禁不在发布链上、数据线绕过门禁、失败静默，让「自动化」的可信度打了折 | ＋`validate.js --strict` 与译文 `skipped` 是**真拦**、构建期暂存+40 余项自检、产物自检从 markup 反算而非内存计数（§2.3–2.4）｜− L1–L3 三条结构性漏洞（§5.3）、静默失败无告警与 `degraded` 阈值失真（§2.6）、回归比对只有 6 个计数器且不在 CI（§4.4 A3）、**下一次采集很可能再红**（§5.2）、11 个死分支 + 1 个残留 worktree + `probe-sources` 7 天未复检（§5.4） |
| **文档** | **2 / 5** | 机制类文档可信到能照着复现，状态类文档却系统性滞后，且**没有任何一份能回答「现在这一版是什么」** | ＋README 断言数与快速开始准确、`DESIGN-RULES` 规范部分可用、`PROJECT_STATUS` 第四节有免责声明（§6.3）｜− **28 条声明 16 条不符**、**5 条 🔴 会让人做错决定**（§6.1）、4 份文档停在 4 个不同时点、`见 P0-2` 是断链（§6.2） |

**综合一句话**：**工程实现（4）> 自动化（3）= 数据（3）> 文档（2）**。若只按「用户今天打开页面看到什么」评，这版接近 4 分；若按「作为一份可被长期依赖的数据产品」评，接近 2.5——**差距全部出在「时效性证据链」和「门禁可信度」上，而不是出在功能是否做完。**

---

## §8. 风险与待办 Top 12（按「会不会让人看到错信息」排序）

| # | 风险 | 严重度 | 最小修复动作 |
|---|---|---|---|
| 1 | **13 条角标/文案互斥已上线**：详情页同一信息栅格里「有效期说明=未标注截止日期」与「活动期限=长期活动（官方有效期说明里写明长期有效）」并列；首页 15 张「长期活动」角标的 tooltip 复述了不存在的依据 | 🔴 直接错信息 | 最小：给 `isOngoing()`（`classify.js:89-91`）加**免责/否定判据**——文案里出现「未标注截止日期 / 未标截止 / 以官方…为准」时不判 ongoing；前端 `ONGOING_RE` 同步（`selftest:expiry` 会断言两侧同判）→ 重建。B 向那 2 条**不要用「往正则加词条」解决**：`不过期` 说的是 credits、`永久五折` 说的是折扣永久，都不等于「活动长期」；要么统一判 `unknown`，要么先定语义再加判据——直接塞这两个词会扩大误判面 |
| 2 | **`#jumpNav` 死锚点（线上可见的假控件 + 无效 hash）** | 🔴 假控件 | 一行 CSS：`.jump[hidden]{display:none}`；同时把门禁判据从 `nav.hidden` 改成渲染可见性（`offsetHeight===0 \|\| display==='none'`），否则同类漏判会再来 |
| 3 | **文档把读者指向旧版本**（`SUMMARY.md` 说 `fa2403d` 已上线、`NEXT-STEPS.md` 说 `777e3b7`；`GAP-MATRIX` 说 G11 未做） | 🔴 让人做错决定/返工 | 头部「当前值」改成一句「见 `STATUS.md`（自动生成）」；`GAP-MATRIX.md` 第 4 节加「本节最后校准于 `<sha>`」并把 G11 改 ✅ |
| 4 | **「门禁红 + 照发」+ 数据线绕过门禁**（§5.3 L1/L2/L3） | 🔴 门禁可信度 | README「自动化与部署」补一句机制声明（素材已在 `PROJECT_STATUS.md:7.5`）；把 `verify:regress` 挂到 `push→master` 并加一条**内容指纹**（`type=deal` id 集合排序后的哈希） |
| 5 | **静默失败**：源坏了内容冻结、站点看着在更新；17 条无头产出可无声消失 | 🟠 让人看到「旧」当「新」 | 在 collect 的 Summary 里显式打印 `removedExpired`/`removedOverflow` 与「本批零产出/降幅」表；加「连续 N 次零产出」告警（至少开 issue 或写 Summary 顶部红字） |
| 6 | **15 条 aitools 描述以半词结尾**（上游截断 + `cleanText` 剥掉省略号）+ 1 条 240 字截断 + 1 条正则断句 | 🟠 用户可见残缺 | `schema.js:158` 附近：若清洗前的原文以 `...`/`…` 结尾，清洗后补回省略号或加「（原文截断）」标记 |
| 7 | **下一次定时采集很可能再红**（3 条待译：Unboring.ai 新进 + Midjourney/Grok 描述被改写） | 🟠 门禁可信度 | 现在就补这 3 条译文并复核 Midjourney/Grok 被改写的英文描述；不必等红 |
| 8 | **结构化数据/订阅把流量导给厂商页**：`ItemList` 只 50 卡且 url 指厂商官方页（50 条仅 43 个不同 URL）；feed 80 条仅 49 个不同目标 | 🟡 权益外流（非错信息） | `buildJsonLd()`/feed 的 `url` 改指站内 `deal/<id>/`，官方页放 `sameAs` |
| 9 | **21 条无法证实**（火山 12 + 智谱活动页 5 + 智谱免费模型 7 的「0 元」口径）——「看起来具体却无从证实」 | 🟡 可信度 | 用带渲染的探针（`render-source.js` 已在仓库里）复核一次并落一条 `verifiedAt`；核不动就降级措辞（照 `4987c183fc1a` / `aacd5856bba2` 的写法把「查不到」写进数据） |
| 10 | **仓库卫生**：11 个死分支 + 1 个残留 worktree（`NEXT-STEPS.md:192-193` 会让人复跑旧版本）+ 台账漏登 2 条 + `probe-sources` 7 天未复检 | 🟡 让人做错决定 | 执行 `PROJECT_STATUS.md:2017-2025` 台账（或至少补登 2 条）；`NEXT-STEPS.md` 那句改成「该 worktree 停在 `52f6164`，落后 master，勿用于复核当前版」 |
| 11 | **robots 遵守有三个 fail-open 口子 + `followRedirect` 绕过 `/go/`** | 🟡 合规/IP 被封 | `http.js:132` 正确处理 `Disallow: /`；让 `followRedirect()` 也走 robots 判定；robots 抓取失败时的策略改成「保守放行但记一行告警」 |
| 12 | **门禁阈值与文档/能力缺口**：对比度断言 ≤20（文档承诺 0）、断点只测 3 个宽度、不 `emulateMedia`、搜索不索引 `zh`、无 `<h1>`、无 JS 15 个假控件 | 🟢 打磨 | 阈值收紧到 0（当前真值 0/714，收紧不会红）；`matches()` 的 haystack 补 `deal.zh` 各字段；补 `<h1>` 并把 `.tierhead` 的 `<div>` 换成带 id 的 `<h2>`；`.facets/.sortbox/.search` 交给 `body.js` 门控或加一句「筛选需启用 JavaScript」 |

---

## §9. 证据索引

### 9.1 我本轮亲手执行的命令（全部只读；任何一条都可复跑）

```powershell
# 版本坐标与工作区
git rev-parse HEAD
git rev-parse origin/master
git log -1 --format='%H|%ai|%s'
git status --short
git worktree list

# 本地/线上产物：字节、字符、sha256（node -e，用 fetch + Buffer.equals 逐字节比对）
node -e  # index.html / dist/index.html / deals.json / dist/deals.json → bytes/chars/sha256
node -e  # fetch 线上 index.html、deals.json、sitemap.xml、feed.xml → status/bytes/sha256/last-modified
node -e  # fetch 12 个线上文件（sitemap.xml feed.xml feed.json robots.txt logos.css og-image.png favicon.svg
         #   + deal/{ebd47f6d2522,b75b42583ad8,2eae0e246de2,c971e33a9cd0,4e659666cbb2}/index.html）→ equals(dist 对应文件)

# 数据面复算
node scripts/validate.js                                   # 133/80/60·73/0/61/0·112·21/32/32/3/32 + 2 条警告，exit 0
node scripts/tools/zh-todo.js --check                      # 已贴 44 条 / 62 字段，漂移 0，待译 0，exit 0
node scripts/tools/tier-report.js                          # 首行「默认视图，50 张卡片」
node -e  # isOngoing 探针（不过期/永久五折/永久有效/长期有效…）+ A向严格9/A向宽2/B向2 逐条枚举
node -e  # root vs dist 的 zh 计数（43/61 vs 44/62）；sitemap <loc>=81；feed <item>=80
node -e  # 角标统计：dist/index.html 的 <span class="tg …> 计数 = 国内30/国外20/长期活动15/未标注35；
         #   以及 dist/deal/ebd47f6d2522 与 b75b42583ad8 的矛盾上下文切片

# 产物清点
Get-ChildItem dist -Recurse -File | Measure-Object -Property Length -Sum       # 139 / 5285602
Get-ChildItem dist\deal -Directory | …                                         # 80 页：min 56319 / max 58731 / mean 57140

# 流水线与工作流结构
node scripts/collect.js --list                                                 # 7 个静态源，exit 0
Select-String .github/workflows/deploy.yml  -Pattern 'run:|needs:|if:|workflow_run|conclusion|build-local'
Select-String .github/workflows/collect.yml -Pattern 'cron|--strict|validate|continue-on-error|git push'
Select-String .github/workflows/verify.yml  -Pattern 'run: node|--strict|--compare|verify-site|continue-on-error'

# CI 实况（GitHub API，只读）
GET /repos/buguoshixc/ai-deals-aggregator/actions/runs?per_page=20        # total_count=90，19 success + 1 failure
GET /repos/buguoshixc/ai-deals-aggregator/actions/workflows/<wf>/runs?per_page=1
GET /repos/buguoshixc/ai-deals-aggregator/branches/master                 # a0c4ab2
GET /repos/buguoshixc/ai-deals-aggregator/tags                            # []
```

### 9.2 依赖报告与可复核文件

| 文件 | 用途 |
|---|---|
| `research/_raw/AUDIT-CONTEXT.md` | captain 基线（含 §3 那处已被更正的一致性表述） |
| `research/_raw/audit-2026-09-28/01-pipeline.md` | 采集→校验→构建→部署的代码级证据（732 行） |
| `research/_raw/audit-2026-09-28/02-data.md` | 数据分布/对账/译文/抽样核验（530 行） |
| `research/_raw/audit-2026-09-28/03-frontend.md` | 产物/能力矩阵/门禁边界/a11y（535 行） |
| `research/_raw/audit-2026-09-28/04-ops-docs.md` | git/CI/文档偏差清单（789 行） |
| `deals.json`、`dist/deals.json`、`dist/index.html`、`dist/deal/<id>/index.html` | 数据与产物原件（`dist/` 在 `.gitignore` 内，无版本记录） |
| `scripts/lib/{schema,dedup,expiry,classify,curated,store,zh,render-core}.js`、`scripts/validate.js`、`scripts/tools/{build-local,verify-site,zh-todo,zh-selftest,tier-report}.js` | 机制引用点（行号见 01/03 报告） |
| `.github/workflows/{collect,deploy,verify,probe-sources}.yml` | 触发器、门禁与发布链结构 |
| `SUMMARY.md` / `NEXT-STEPS.md` / `PROJECT_STATUS.md` / `README.md` / `docs/DESIGN-RULES.md` / `research/GAP-MATRIX.md` | 偏差清单的「文档侧」（行号见 §6 与 04 报告） |

### 9.3 本次审计留下的 5 条方法论教训（比单个结论更值钱）

1. **一致性必须按字节比，不能按字段比**。「`count` / `updatedAt` / id 集合」三个判据全一致，却掩盖了「线上 44 条译文 vs 仓库根 43 条」（sha256 `5c752b80…` vs `46a19472…`）。这条同时纠正了 captain 基线 §3 的表述。
2. **HTML 体积必须声明单位**。任务书给的 `152977 / 233517` 是**字符数**，字节真值是 `191057 / 294055`（`[A3]` 已复原出精确总账：`152977 + 222 − 40 − 141 + 80499 = 233517`，重建产物与真实产物逐字符相同）；同一类单位滑落也出现在 `[A3]` 自己的详情页体积表（§4.1），已在本报告中修正。
3. **「读属性而不读渲染」会产出假绿**（`#jumpNav` 就是活例）；同源的错法还有「读统计而不读集合」——回归比对只比 6 个计数器，换掉全部内容也不会红。
4. **做提交分类/文本统计前先剥 BOM**（U+FEFF 会让 `^docs:` 静默漏匹配），否则比例会算错。
5. **只读审计的可信做法**：会写盘的脚本一律在 `%TEMP%` scratch 副本里跑、输入用 `git show <sha>:<path>` 取只读 blob、跑完以 `git status --short` 自证（A1/A3 全程如此；`[我]` 本轮只写本报告一个文件）。

### 9.4 本报告层面的「未证实」（不许猜）

| # | 事项 | 为什么未证实 |
|---|---|---|
| 1 | 线上**全量 139 个**产物文件逐字节一致 | 只抽样 12/139（含 5 个详情页）；其余 68 个详情页与 49 个 logo 未比 |
| 2 | CI 上无头来源的真实成功率 | `/actions/jobs/{id}/logs` → **403**；`probe-sources.yml` 只有 2 次 run（7 天前），出口 IP 可达性是 7 天前的结论 |
| 3 | branch protection / 必需检查 | `/branches/master/protection*` → **401**；只证到 `/rulesets` → `[]` |
| 4 | 构建确定性 | `[A4]` 连跑 3 次 SHA256 恒定；`[我]` 只复算了一次 hash 与之相同，**未复跑 build**（本轮纪律要求不动 `dist/`） |
| 5 | 其余 69/80 条优惠的真实性 | 只抽样 11 条 |
| 6 | `verify` 全量 142 项复跑 | `[cap]` 已跑过；`[我]` 只复算了其中 6 个指标（`cards 50` / `coveredDeals 80`）与断言条数口径 |
| 7 | GitHub Pages CDN 的缓存换新时机 | 只观察到四个线上文件 `last-modified` 同值 |
| 8 | 屏幕阅读器实读体验、真机（iOS/Android/Firefox）、200% zoom | 未做（`[A3]` 用 DOM/属性层检查代替） |

### 9.5 本报告未触碰的路径

未运行 `npm run build` / 未写 `dist/`、未改 `index.html` / `scripts/` / `deals.json` / `scripts/data/*` / 任何 workflow / 任何根目录 `.md`；未 commit/push/fetch；未动分支、tag、worktree。`git status --short` 自证：只多出 `research/_raw/AUDIT-CONTEXT.md`（captain）与 `research/_raw/audit-2026-09-28/`（A1–A4 与本报告）。
