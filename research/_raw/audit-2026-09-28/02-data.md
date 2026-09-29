# 02 · 数据质量审计：133 条里的 80 条「真实优惠」到底成色如何

> 审计员：`data-auditor`（任务 t2 / attempt 1） · 日期：2026-09-28 · 性质：**只读**（未修改任何数据文件）
> 基线：`research/_raw/AUDIT-CONTEXT.md`（captain 实测）——本文直接引用，不重复推导；凡基线之外的结论均标注 **实测 / 引用 / 推断**。
> 所有命令均在本机 `D:\OneDrive\Desktop\Code\AI Page` 下跑过，可复跑；命令清单见 §11。

---

## 0. 结论摘要（先看这 10 条）

| # | 结论 | 性质 |
|---|---|---|
| 1 | 分布：`type=deal` **80** / `type=tool` **53**；`region` cn **60** / global **73**；cn 60 条**全部**是 deal，53 条 tool **全部**是 global（0 条 cn/tool） | 实测 |
| 2 | 关系对账：133 = 80 deal + 53 tool = 60 cn + 73 global；80 = 60 cn deal + 20 global deal。**53 条非 deal 全是 `type=tool`，默认视图（优惠 Tab）看不到，只在「全部工具」Tab 里**（预渲染产物顶部 Tab 写死 `优惠 50` / `全部工具 103`） | 实测 |
| 3 | 默认视图是 **50 张卡片**（80 条 deal 折叠后），其中 **3 张卡聚合了 33 条条目**（百度千帆 17→1、火山方舟 9→1、智谱免费模型 7→1），另外 47 张 = 一条一卡 | 实测 |
| 4 | **全库 0 条带绝对截止日期**（`expiresAt` 非空 = 0/133）。独立复核：全部 133 条里只有 **1 条**文本含 4 位年份（`c789f0a090bf` Google Gemini 的 "March 11, 2026"，且是**过去**日期、无结束语义）→ 「含截止时间 0」不是解析失败，是源数据里根本没有截止日 | 实测 |
| 5 | `含有效期说明 61` + 三分类 `0 / 112 / 21` 与 133 完全对账：112 = 133 − 21（含 72 条根本没有 validity 文本 + 40 条只有相对期限如「自开通起 3个月」）。已逐字复跑 `validate.js`，与 captain 的数字**完全一致** | 实测 |
| 6 | **卡片角标与文案自相矛盾**：21 条「长期活动」里 **11 条**的 validity 自己写着「（官方…未标注截止日期）」，其中 7 条是智谱的同一句模板；另有 **2 条**文本明写「不过期 / 永久五折」却被判「未标注截止日期」。这 13 条的不一致**已经渲染进线上静态页**（`dist/deal/ebd47f6d2522/index.html` 同时含「长期活动」与「未标注截止日期」） | 实测 |
| 7 | 译文：**44 条需要译文、覆盖层译了 44 条、但仓库根 `deals.json` 只有 43 条**（缺 `0ddacfb2cc6e` Wavel.ai）。`node scripts/tools/zh-todo.js --check` 仍打印「漂移 0 / 待译 0 / ✅」（它读的 deals.json 只是入参，不做落盘比对），线上/`dist` 是 44 条 → **门禁不报这个差** | 实测 |
| 8 | **修正 captain 基线的一条结论**：线上 `deals.json` 与 `dist/deals.json` **逐字节相同**（sha256 `5c752b8083662f00`，132665 B），但与**仓库根 `deals.json` 不同**（sha256 `46a1947272f58cde`，132544 B，差 121 字节 = Wavel.ai 那条 zh）。「count/updatedAt/id 集合一致」掩盖了这个差异 | 实测 |
| 9 | 两条疑似重复警告：`KREA ↔ Kreado AI` 是**前缀启发式的误报**（两家不同公司、不同域名、不同 sourceUrl，字段逐项比对见 §6）；`Getsolved ↔ Getsolved AI Detector` 是**同域不同页**（`/` vs `/ai-detector`），两条都是 `type=tool`、无优惠文案，合并与否是产品决策，**不是「同一优惠重复」** | 实测 |
| 10 | 抽样 11 条 `type=deal` 做真实性核验：**5 条在官方 URL 逐字证实**、2 条部分证实、4 条**无法证实**（智谱活动页/火山方舟是 JS 壳、chatgpt.com/openai.com 本机不可达）。全库 discountInfo 里 68/80 带数字，其中「200 张 / 每日 500 万 Tokens / 2000 万 Tokens」这类**具体到可疑但静态不可证实**的条目集中在火山方舟与智谱活动页 | 实测 |

---

## 1. 口径与复跑基础

- 数据文件：`deals.json`（`schemaVersion=2`, `updatedAt=2026-09-28T11:50:50+08:00`, `count=133`, `deals.length=133`）—— 实测
- 契约：`scripts/lib/schema.js`（字段白名单 21 个 + `zh`；`cleanText` 上限：title 150 / discountInfo **240** / description 200 / eligibility 120 / validity 60 / priceLine 60 / feature 20）—— 引用
- 统计口径的「真源」：默认视图 = `index.html` 的 `RENDER-CORE`（`DEFAULT_FILTERS.tab='deals'`），我用 `scripts/lib/render-core.js` 在无 DOM 沙箱里跑**同一份**函数，而不是自己重写筛选/折叠逻辑 —— 实测
- 术语：**条目（entry）** = `deals.json` 里一行；**卡片（card）** = 折叠、筛选后用户看到的一张卡。

---

## 2. 分布实测（Q1）

### 2.1 region / type

| 维度 | 值 | 条数 |
|---|---|---|
| region × type | cn / **deal** | **60** |
| | global / **deal** | **20** |
| | global / **tool** | **53** |
| | cn / tool | **0** |
| 合计 | | **133** |

### 2.2 category（12 个枚举全部被命中，无 `覆盖偏低` 警告）

| category | deal | tool | 合计 |
|---|---|---|---|
| API服务 | 36 | 0 | 36 |
| 对话模型 | 15 | 12 | 27 |
| 图像绘画 | 5 | 15 | 20 |
| 视频 | 2 | 8 | 10 |
| 办公效率 | 3 | 6 | 9 |
| 编程开发 | 4 | 4 | 8 |
| 音频语音 | 6 | 1 | 7 |
| 智能体 | 4 | 1 | 5 |
| 其他 | 1 | 3 | 4 |
| 教育学习 | 2 | 1 | 3 |
| 设计创意 | 1 | 2 | 3 |
| 搜索研究 | 1 | 0 | 1 |

> 注：`API服务` 36 条里有 35 条来自 CN 平台采集（百度千帆 17 + 火山方舟 12 + 智谱 7 里的一部分 + 阿里云 1），分类分布被「按模型/按接口列举」的采集方式强烈拉偏。

### 2.3 pricingModel

| 值 | 条数 | 说明 |
|---|---|---|
| free | 60 | deal 60 / tool 0 |
| **null** | **40** | tool 35 + deal 5（Canva / Cursor / Replit / Zapier / ChatGPT Plus for Veterans —— Layer3Labs 目录行的 5 条） |
| paid | 15 | deal |
| freemium | 13 | tool 9 + deal 4 |
| credits | 4 | deal（讯飞礼包 / Kimi 代金券 / Azure $100 / AWS $200k） |
| trial | 1 | deal（阶跃 StepAudio 3） |

### 2.4 vendor

**两个口径要分开报**（这也是最容易讲错的地方）：

- **原始 `vendor` 字符串：86 个不同值**（`百度智能云` 17、`智谱AI` 12、`火山引擎`/`火山引擎（字节跳动）` 12、`扣子 Coze（字节跳动）` 4 …）
- **归一后（`RENDER-CORE.vendorOf` 的 `VENDOR_RULES`）：80 家**

top 12（归一后，全部 133 条）：

| 条数 | 归一 key | 覆盖的原始 vendor 串 |
|---|---|---|
| 17 | `baidu` | 百度智能云 |
| 13 | `volcengine` | 火山引擎 / 火山引擎（字节跳动） |
| 12 | `zhipu` | 智谱AI |
| 4 | `google` | Google Gemini / Google AI / NotebookLM / Google |
| 4 | `coze` | 扣子 Coze（字节跳动） |
| 3 | `openai` | ChatGPT / ChatGPT Plus / GPT Image |
| 3 | `github` | GitHub |
| 2 | `iflytek` | 科大讯飞 讯飞开放平台 |
| 2 | `microsoft` | Microsoft |
| 2 | `notion` | Notion |
| 2 | **`MiniMax（稀宇科技）`** | 同名字符串（**未归一**，见下） |
| 1 | `aliyun` | 阿里云 |

**只算 80 条 deal**：归一后只有 **32 家**，其中 **23 家只有 1 条**；`baidu 17 + volcengine 13 + zhipu 12 = 42 条 = 全部优惠的 52.5%`。

**发现（推断，有据）**：`MiniMax（稀宇科技）` 的归一 key 就是原字符串——`VENDOR_RULES`（`index.html:1117-1169`）里**没有 MiniMax 规则**；而 `aliases.json` 里的 `"minimax": "minimax"` 是**标题别名表**（`lib/dedup.js:aliasKey`），对 vendor 字段不生效（且当前两条 MiniMax 标题归一后也不等于 `minimax`）。两套表各说各话。

---

## 3. 四个数的对账：133 / 80 / 60 / 73（Q2）

| 口径 | 数 | 出处（可复跑） |
|---|---|---|
| 数据总条数 | **133** | `deals.json` `count` / `node scripts/validate.js` 的「总条数」 |
| 真实优惠 `type=deal` | **80** | `validate.js` 的「真实优惠」 |
| 非 deal（`type=tool`） | **53** | 133 − 80；`{"Layer3Labs":3,"aitools.fyi":15,"Futuretools":32,"Futurepedia":3}`，**全部 region=global** |
| 国内 `region=cn` | **60** | `validate.js`；**全部是 deal**（百度千帆 17 / Curated-CN 18 / 火山方舟 12 / 智谱AI 7 / 智谱AI活动页 5 / 阿里云百炼 1） |
| 国外 `region=global` | **73** | 20 deal（Curated 14 + Layer3Labs 6）+ 53 tool |
| 默认视图卡片（优惠 Tab） | **50** | `node scripts/tools/tier-report.js` 首行；`dist/index.html` 顶部 `优惠<b>50</b>` |
| 全部工具 Tab 卡片 | **103** | `tier-report.js --all`；`dist/index.html` 的 `全部工具<b>103</b>` |

**53 条 tool 会不会出现在默认视图？——不会。** 依据（实测，非推断）：

1. `RENDER-CORE.matches()` 第一句就是 `if (filters.tab === 'deals') { if (deal.type !== 'deal') return false; }`（`index.html:2011-2013`）；
2. `DEFAULT_FILTERS.tab === 'deals'`（`index.html:1988-1995`）；
3. 预渲染产物实测：`dist/index.html` 的首屏统计是 `<b>50</b> 条优惠 · 更新 2026-09-28`，Tab 是 `优惠 50` / `全部工具 103`。

**80 → 50 的折叠明细（实测）**：

| 折叠卡 | 代表条目数 | 厂商 |
|---|---|---|
| 百度千帆 新用户免费额度 | **17** | 百度智能云 |
| 火山方舟 免费额度 | **9** | 火山引擎 |
| 智谱AI 免费模型 | **7** | 智谱AI |
| 其余 47 张 | 各 1 | — |

其他去重口径（供交叉验证，实测）：`(厂商归一, url, 优惠文案)` 唯一值 **62**；`(厂商归一, url)` 唯一值 **49**；**归一化标题重复 = 0 组**；完全相同 url 的条目组只有 3 组（上面 17/5/12 那三个平台页）。

> 解读（推断）：**「80 条真实优惠」是「按模型/按接口列举」的行数，不是「优惠份数」。** 用户在默认视图看到的是 50 张卡；其中最大的 3 张卡合计由 33 行组成，而它们的 `discountInfo` 逐字相同（百度千帆 17 行共用一句「首次开通千帆即自动发放免费额度：赠送 100万 Tokens，有效期 3个月」）。

---

## 4. 有效期字段实测（Q3）：**真的带绝对截止日期的，是 0 条**

### 4.1 我的独立统计（与 `validate.js` 逐字一致）

| 指标 | 数值 | 口径 |
|---|---|---|
| `expiresAt` 非空 | **0 / 133** | 字段级 |
| `validity` 非空 | **61 / 133** | 字段级 |
| `validity` 为空 | **72** | 133 − 61 |
| `isOngoing(validity)` 且无 `expiresAt`（=「长期活动」） | **21** | `scripts/lib/expiry.js` → `classify.js` 的 `isOngoing` |
| 无 `expiresAt` 且非 ongoing（=「未标注截止日期」） | **112** | 133 − 21 |
| 三分类 | **有截止日期 0 / 未标注 112 / 长期 21** | 0 + 112 + 21 = 133 ✅ |

`node scripts/validate.js` 实跑输出（本机，2026-09-28）：

```
总条数 133 / 真实优惠 80 / 国内·国外 60·73
含截止时间 0 / 含有效期说明 61（合计时间信息 61）
活动期限: 有截止日期 0 · 未标注截止日期 112 · 长期活动 21
人工核验 32 / 卡片特性标签 32 / 价格阶梯 3 / 策展数据 32
⚠️ 警告 2 条：Getsolved ↔ Getsolved AI Detector；KREA ↔ Kreado AI
```

**与 captain 基线完全一致；与 `validate.js` 也完全一致 —— 三个数字没有口径分歧。**

### 4.2 为什么是 0 / 112 / 21

```
133 条
├── expiresAt 非空 ............ 0        （没有任何一条抽到绝对截止日）
└── expiresAt 空 ............. 133
    ├── validity 为空 ......... 72  ┐
    └── validity 非空 ......... 61  ┤→ 全部归入「未标注截止日期 112」
        ├── 相对期限（非长期）.. 40  ┘   （如「自开通起 3个月」×17、「12 个月，可每年续期」）
        └── isOngoing 命中 ..... 21  → 「长期活动 21」
```

- `112 = 133 − 21`，其中 **72 条连 validity 文本都没有**、**40 条只有相对期限**（相对期限按 `lib/expiry.js` 的设计**故意**不折算成截止日：注释写「宁可留空，也不把一个日期猜成截止日」——引用）。
- **「0」不是解析器失灵**：我把全部 6 个文本字段扫了一遍 `/20\d\d/`，**只有 1 条**命中 —— `c789f0a090bf [tool] Google Gemini`，`discountInfo` 含 "March 11, 2026"，而那条讲的是**上一轮学生优惠已结束**，日期在过去、窗口内无结束语义，`extractDeadline` 与 `applyDeadline`（只收 ≥ 今天）都会拒掉它。
  - 独立口径：「文本里出现任何 4 位年份的条目」= **1/133**；「`extractDeadline(validity + discountInfo)` 非空」= **0**。
  - **所以「含截止时间 0」是源数据就没有绝对日期，而不是抽取器漏了。**

### 4.3 但「长期 / 未标注」的判定本身有 13 条自相矛盾（本节是本次审计的新发现）

`isOngoing` 与前端 `ONGOING_RE` 是同一个词表：`/长期|永久有效|常年|不限时|ongoing|…/`。它只做**子串命中**，不看否定/免责语境，于是两个方向都出错：

**方向 A：把「我们没查到」写成了「长期活动」（11 条）** —— validity 文本自己承认官方没写截止日：

| id | 标题 | validity 原文 |
|---|---|---|
| `ebd47f6d2522` `e7e8f538456c` `6798f78de5ce` `f22e3cd094ad` `62e3166acec0` `5dedb9455508` `df1210f69a39` | 智谱 7 条 Flash / 免费模型 | 长期有效（**官方模型列表未标注截止日期**） |
| `4caf88e30671` | 火山方舟 协作奖励计划 | 每日可领取（活动长期，**官方未标注截止日期**） |
| `6869e7866510` | 讯飞星火 Spark Lite 免费使用 | 长期有效（**官方文档未标注截止日期**） |
| `833a9889bfb7` | 讯飞开放平台 新手免费福利礼包 | 长期活动（**以官方页面展示为准**） |
| `d8d0ba522315` | 硅基流动 免费模型专区 | 长期有效（**以官方定价页实时标注为准**） |

前端角标注 `长期活动`，`note` 还写成「长期活动（官方有效期说明里写明长期有效）」——而 `lib/expiry.js` 自己的注释写的是：「把『我们没查到』写成『长期活动』就是编造」。**这 11 条正是那个形态。**（推断 + 实测：字符串逐条来自 deals.json，角标来自 `RENDER-CORE.expiryState`。）

**方向 B：文本明说长期/不过期，却被判「未标注截止日期」（2 条）**

| id | 标题 | validity 原文 | 角标 |
|---|---|---|---|
| `b75b42583ad8` | Runway 免费计划 一次性 125 credits | 一次性额度，**不过期** | 未标注截止日期 |
| `b4d87c02f4d9` | MiniMax M3 按量计费永久五折 | 官方标注「**永久**五折」，未标截止日期 | 未标注截止日期 |

（原因是 `ONGOING_RE` 只认「永久有效」四个字，不认「永久五折」；也不认「不过期」。）

**这两类不一致已经落到线上静态页**（实测）：
`dist/deal/ebd47f6d2522/index.html` 同时含 `长期活动` 与 `未标注截止日期`；`dist/deal/b75b42583ad8/index.html` 含 `未标注截止日期` 而正文明写「不过期」。

### 4.4 另一处信息缺口（不是矛盾）

阿里云那条（`e237cab7c007`）官方页在同一页写明「**免费额度的有效期为 90 天**」，而我们的 `validity` 只写「各模型额度有独立有效期，过期后剩余部分自动作废、不补发」、`expiresAt=null` —— **官方给了相对期限，采集时没落进 validity**（同为平台新用户额度，百度千帆那条就落了「自开通起 3个月」）。口径不一致，非造假。

---

## 5. 中文译文覆盖（Q4）

### 5.1 双向核对结果

| 口径 | 数量 | 证据 |
|---|---|---|
| 需要译文（任一 `ZH_FIELDS` 字段判为英文散文） | **44**（38 tool + 6 deal） | `lib/zh.js isEnglishProse` 逐条统计 |
| `translations_zh.json` 覆盖层条目 | **44**（62 个字段） | `load()` / `attach()` 报告 |
| **仓库根 `deals.json` 实际落盘的 zh** | **43**（61 字段） | 直接读文件 |
| `dist/deals.json`（= 线上）落盘 zh | **44**（62 字段） | 直接读文件 |
| `zh-todo.js --check` 结论 | `已贴 44 条 / 62 字段` · 漂移 0 · 待译 0 · **exit 0** | 实跑 |

**差 1 条 = `0ddacfb2cc6e` Wavel.ai**：覆盖层里有译文（`src.description` 指纹与原文逐字相符），仓库根 `deals.json` 里却没有 `zh`。成因（实测 + 引用）：

- `git log` 顺序：`98d9550`（11:50:50 更新数据）→ `e01dcfc`（11:56）→ **`ca183b9`（12:01 补 Wavel.ai 译文）** → `a0c4ab2`（12:10 docs）。
- 译文是在最后一次数据再生成**之后**才提交的，而 `deals.json` 只由采集任务重写 → 根文件落后一条。
- `build-local.js:617-636` 会读根 `deals.json` → `attachZh()` 再贴一次 → 写 `dist/deals.json`，所以**线上不缺**这条译文。

**门禁盲点（实测）**：`zh-todo.js --check` 的漂移计数器只统计「孤儿 / 原文已变停用 / 不合法 / 覆盖层管不到」，**没有「覆盖层已译但 deals.json 未落盘」这一类**，所以它对着一个落后一条的 `deals.json` 仍然报 ✅。另外 `lib/zh.js needsZh()` 在 `hasZh` 为真时直接返回空数组（`if (hasZh) return out;`）——「一条部分翻译」的条目会被整体当成已覆盖；当前数据里**没有**触发（我逐字段核过：真缺口 0），但这是潜伏的漏报路径。

### 5.2 译文质量（逐条读完 44 条 / 62 字段）

**结论：不是机翻，是人工写的**（推断，但证据明显）。特征：会把英文里的自嘲/隐含语气译出来，并保留专名与数字：

- 有意译而非直译：`Autocorrect but for drawings` → 「画画版的自动纠错。」；`Unlock true digital artistry.` → 「释放真正的数字艺术表现力。」
- 会保留原文的免责语气：ChatGPT 那条把 "No standing public student or nonprofit discount was listed…" 译成「核查官方定价页时，页面上没有列出长期有效的公开学生或非营利折扣。」——**没有把否定译成肯定**。
- **未发现错译/漏译**；62 个字段全部有 `src` 指纹，`stale=0`、`skipped=0`、`warnings=0`（无指纹字段 0 个）。
- 一处**轻微**问题（推断）：`c971e33a9cd0` 的英文原文本身被 240 字上限截断成 `…relocation pla`，译文却译成完整句子「…搬迁规划的入门指南」——**译文比原文「更完整」**，读者看中文不会察觉英文是断的；这不影响可信度，但说明指纹机制无法发现「原文被截断」。

---

## 6. 两条警告的判定（Q5）：不是重复优惠

两条警告都由 `validate.js checkSuspectedDuplicates()` 的**前缀启发式**产生（归一化标题里短的是长的前缀），而**四条记录都是 `type=tool`**——也就是说：**它们根本不在默认视图里，也不是「优惠重复」。**

### 6.1 `Getsolved ↔ Getsolved AI Detector`

| 字段 | `c3d6bd34ebfe` | `8583e9860d88` |
|---|---|---|
| title | Getsolved | Getsolved AI Detector |
| vendor | Getsolved | **Getsolved AI** |
| url | `https://getsolved.ai/` | `https://getsolved.ai/ai-detector` |
| source / sourceUrl | aitools.fyi / null | aitools.fyi / null |
| type / pricingModel | tool / freemium | tool / freemium |
| discountInfo | null | null |
| description 前 40 字 | Getsolved 将写作、检测和研究工具整合到一个浏览器工作区… | Getsolved AI Detector 扫描粘贴的文本或上传的文档… |

**判定：同域不同产品页，不是「同一优惠重复」。** 母产品落地页 ≠ 子工具页；两条都没有 `discountInfo`，没有可合并的优惠。`aliases.json` 里也没有任何 `getsolved*` 键。（若产品上希望只留一条，应该走「同厂商同域去重」而不是别名表——推断。）

### 6.2 `KREA ↔ Kreado AI`

| 字段 | `8ad33957ce77` | `ab4c0e5c007e` |
|---|---|---|
| title / vendor | KREA / KREA | Kreado AI / Kreado AI |
| url | `https://www.krea.ai/` | `https://www.kreadoai.com/` |
| source / sourceUrl | Futuretools / `futuretools.io/tools/krea` | Futuretools / `futuretools.io/tools/kreadoai` |
| description（+ zh） | A design tool to generate images and videos.（生成图像与视频的设计工具。） | A tool to create multilingual language videos.（制作多语言视频的工具。） |

**判定：纯粹的误报——两家不同公司、不同域名、不同上游页。** 触发原因只是归一化后 `krea` 是 `kreadoai` 的前缀。

**顺带证实一件事**：`VENDOR_RULES` 里 KREA 的规则**已经**写了边界 `[/\bkrea\b|krea\.ai/i, …]`，注释明说「必须带边界：`/krea/i` 会命中『Kreado AI』」——厂商归一没被误伤；**只有 `validate.js` 的疑似重复检查器还在用无边界前缀比较**。所以正确动作是**修检查器**（加厂商/域名判据），而不是往 `aliases.json` 里登记 `kreadoai → krea`（那会把两家公司并成一家）。

### 6.3 别名表现状（补充实测）

- 条目 **96** 个键：被当前 133 条标题**直接命中 33**、只作「归并桶」15、**既未命中也不是桶 48**（纯防御性条目）。
- **别名归一后仍有 133 个不同 titleKey → 别名表在当前数据上实际合并了 0 条**（它是一张「防未来重复」的表，不是「已修好的重复」）。

---

## 7. 抽样真实性核验（Q6）：11 条（任务要求 5–8，我多抽了几条）

抽样规则（实测）：覆盖每个来源至少 1 条、优先选「文案里有具体数字」的条目；逐条核对**额度 / 适用条件 / 链接是否官方落地页 / 内部是否自洽**，并**实际抓取** URL 关键词。

| # | id | 标题 | 官方域? | 抓取结果 | 判定 |
|---|---|---|---|---|---|
| 1 | `2eae0e246de2` | ERNIE-4.5-Turbo-128K 新用户免费额度 | ✅ cloud.baidu.com | HTTP 200；页面表格逐字命中 `ERNIE-4.5-Turbo-128K 100万 3个月` | **逐字证实** |
| 2 | `e237cab7c007` | 阿里云百炼 新用户免费额度 | ✅ help.aliyun.com | 200；`每个模型均有独立的免费额度（通常为 100 万 Token）`、`仅华北 2（北京）地域模型享有免费额度`、`免费额度过期后自动失效，不支持补发、延期或重置` 全部命中 | **逐字证实**（但见 §4.4 的 90 天缺口 + 字段断句） |
| 3 | `ebd47f6d2522` | GLM-4.7-Flash 免费模型 | ✅ docs.bigmodel.cn | 200（1.2 MB）；URL 路径命中 `/models/free/`、标题命中；**正文静态 HTML 里「免费」「0 元」均 0 命中** | **部分证实** |
| 4 | `97d21ff73d3e` | 智谱AI 新用户注册专享 2000万 Tokens 资源包 | ✅ bigmodel.cn | 200 但只有 3853 B 的 **JS 壳**，`2000/免费/资源包` 全不命中 | **未证实** |
| 5 | `4caf88e30671` | 火山方舟 协作奖励计划 每日最高 500 万 Tokens | ✅ volcengine.com | 200（170 KB）；`免费/领取/奖励/Token` **全不命中** | **未证实** |
| 6 | `d8d0ba522315` | 硅基流动 免费模型专区（策展，verified 2026-09-22） | ✅ siliconflow.cn | 200；定价表逐字命中 `BAAI/bge-m3 免费`、`bge-reranker-v2-m3 免费` | **逐字证实** |
| 7 | `b75b42583ad8` | Runway 免费计划 一次性 125 credits（策展） | ✅ runway.com | 200；命中 `Free forever`、`$0 /month`、`125 one-time credits`、`5GB asset stora…`、年付 `-20% off` | **逐字证实**（「（不过期）」仅部分：页面写 Free forever，未逐字说明 credits 不过期） |
| 8 | `176234a80147` | 扣子 Coze 新用户首次注册赠送 1500 活动积分（策展） | ✅ docs.coze.cn | 200；命中 `个人版新用户注册扣子：活动积分 个人免费版 一次性赠送 1500 积分 30 天` | **逐字证实**（额度 + 有效期都命中） |
| 9 | `833a9889bfb7` | 讯飞开放平台 新手免费福利礼包（策展） | ✅ xfyun.cn | 200；`礼包/免费` 命中、`新人` 未命中；「乐享会员最高价值 2888 元」未核到 | **部分证实** |
| 10 | `c971e33a9cd0` | ChatGPT Plus for Veterans (OpenAI) | ⚠️ chatgpt.com（OpenAI 域） | `chatgpt.com/veterans-claim` 在 node fetch 与 web_fetch 下**均失败**（本机网络不可达，非 404 证据） | **未证实** |
| 11 | `f5ffff50772c` | ChatGPT / OpenAI（tool） | ⚠️ openai.com | `openai.com/chatgpt/pricing/` → **HTTP 403**（反爬） | **未证实**（其「无公开学生/非营利折扣」本身是**否定式声明**，更难证实） |

**内部自洽性检查（逐条）**：

- #1 额度（100 万）/ 期限（3 个月）/ 适用条件（新用户+实名）三者一致，且与官方表格一致 ✅
- #2 `discountInfo` 说「每个模型独立 100 万 Token」、`validity` 说「各模型额度有独立有效期」→ 互相一致 ✅；但**字段本身在「额度过」处断句**（这是采集器正则 `[^。]{0,40}` 在「：」「；」分隔的页面上截断的结果，见 §8.3）
- #3 `discountInfo`「调用价格 0 元」有出处（官方把它放在 `/models/free/` 目录下），但 `validity`「长期有效」在官方页上**没有出处** → 与 §4.3 方向 A 同源 ❌
- #4/#5 文案自洽（额度/期限互不冲突），但**无法在官方 URL 证实**
- #6/#7/#8/#9 与官方页一致 ✅
- #10 最弱：`discountInfo` 被 240 字上限截断成 `…relocation pla`；`pricingModel=null`、`validity=null`、落地页不可达 ❌

**官方落地页 vs 聚合站（全库，实测）**：`validate.js` 的 `AGGREGATOR_HOSTS`（layer3labs.io / futuretools.io / futurepedia.io / aitools.fyi）**0 命中**；53 条 tool 的 `url` 全部是产品自己的域名；聚合站只出现在 `sourceUrl`（layer3labs.io 13 / futuretools.io 34 / futurepedia.io 3，共 50 条），署名关系正确。

---

## 8. 数据可信度弱点清单（Q7）

### 8.1 字段覆盖（整库 / deal 子集 / tool 子集）

| 字段 | 133 条 | 80 条 deal | 53 条 tool | 谁在填 |
|---|---|---|---|---|
| title/vendor/url/source/region/type/category/description/firstSeen/lastSeen/verified | 100% | 100% | 100% | 机器 |
| `pricingModel` | 93 (70%) | 75 (94%) | 18 (34%) | 机器 |
| `discountInfo` | 83 (62%) | **80 (100%)** | 3 (6%) | 机器/人工 |
| `eligibility` | 73 (55%) | 70 (88%) | 3 (6%) | 机器/人工 |
| `validity` | 61 (46%) | 61 (76%) | 0 | 机器/人工 |
| **`expiresAt`** | **0 (0%)** | **0** | 0 | 无人填 |
| **`priceLine`** | **3 (2%)** | 3 | 0 | **仅人工策展** |
| **`features`** | **32 (24%)** | 32 (40%) | 0 | **仅人工策展** |
| **`verified`/`verifiedAt`** | **32 (24%)** | 32 (40%) | 0 | **仅人工策展** |
| `sourceUrl` | 50 (38%) | 12 (15%) | 38 (72%) | 机器 |
| `zh` | 43 (32%) | 6 (8%) | 37 (70%) | 人工覆盖层 |

**实测的两条强关联**：

1. `features` 非空的 32 条 == `verified` 非空的 32 条 == **策展文件的行**（`curated_cn.json` 18 + `curated_global.json` 14 = 32），集合**完全相同**。→ 「人工核验 32 条」「特性标签 32 条」「策展数据 32 条」是**同一批数据的三个说法**，不是三份独立质量投入。
2. `priceLine` 只有 3 条，全部来自 `curated_global.json`（ElevenLabs / Runway / Windsurf）。→ 价格阶梯基本等于「没做」。

### 8.2 机器填的字段里，哪些是「模板/上游复制」

| 现象 | 证据 |
|---|---|
| 百度千帆 17 条的 `discountInfo`/`validity`/`eligibility` **逐字相同** | 17×「首次开通千帆即自动发放免费额度：赠送 100万 Tokens，有效期 3个月」/「自开通起 3个月」/「千帆平台新用户（需实名认证）」——由 `cn_docs.js:37-62` 从**同一张表**的 17 行生成 |
| 智谱 7 条免费模型的 `validity` 是同一句模板 | 7×「长期有效（官方模型列表未标注截止日期）」——`cn_docs.js:116+` 按「总览表里链接指向 `/models/free/`」批量生成，`discountInfo` 也是模板 `官方模型列表标注为免费模型，调用价格 0 元：{summary}` |
| 火山方舟 12 条共用同一个落地页 | `volcengine.com/product/ark`；其中 9 条被折成 1 张卡 |
| 15 条 aitools.fyi 的 `description` 是**上游的中文预览串** | `global_directories.js:60` 用 `tool.zhDescription`（aitools.fyi 自带的中文），见 §8.3 |
| Layer3Labs 的 6 条 deal 是**目录站行文**，不是官方口径 | 文案里带 "Cursor says…"，"Its docs **have also listed** student discounts such as…"（过去式 + 模糊），无金额、无期限、无适用条件细节 |

### 8.3 截断/断句（**用户可见的残缺**，全部实测）

| 类型 | 条数 | 证据 |
|---|---|---|
| aitools.fyi 描述被**上游截断 + 我们剥掉了省略号** | **15** | 上游 `zhDescription` 长 157 字、**以 `...` 结尾**；我们的 `cleanText` 会把结尾 `...` 删掉（`schema.js:158`），于是存成 152–154 字、**以半个词结尾**（如「…Getsolved 将检测和重写整」「…它适合希望获得」「…大多数」）。我逐条与上游 payload 比对：**15/15 剥离省略号后逐字一致**，即丢失的正是「这里被截断了」这个信号 |
| `discountInfo` 触顶 240 字上限、**断在词中间** | 1 | `c971e33a9cd0`：长度正好 240，尾部 `, and relocation pla` |
| 采集器正则断句，尾部是半句 | 1 | `e237cab7c007`：`cn_docs.js:77-85` 用 `[^。]{0,40}` 抓取，而阿里云页面用「：」「；」分隔 → 尾部「…暂不暂停计时； 额度过」 |

### 8.4「看起来很具体但其实无从证实」的内容

- **火山方舟系**：「免费额度（图像生成）：**200张**」「（语音模型）：**20小时**」「5000字符 + **10 复刻声音**」「每日最高 **500 万** Tokens」——全部指向一个静态 HTML 里查不到这些字的 SPA 页（§7 #5）。
- **智谱活动页系**：「新用户 **2000万** Tokens + **120 次**图像和视频资源包」「GLM-5.3-Flash 限时五折」「Batch API 五折」——落地页是 3.8 KB 的 JS 壳。
- **讯飞**：「乐享会员（最高价值 **2888 元**）」「百万级交互量」——页面命中「礼包/免费」，2888 未核到。
- **AI 类金额**：「AWS Activate 最高 **$200,000**」「Azure for Students **$100**」「Claude Team **$8/用户/月**、Enterprise **$10/用户/月**」——量级与官方公开说法一致，但**本次未逐条抓取**（标注未证实，不是错）。
- 反例（做得对的）：`4987c183fc1a`（360智脑）明确写「协议**未公布具体面额与有效期**」；`aacd5856bba2`（Notion 非营利）写「官方页**未标示具体折扣比例**」——这两条把「查不到」写进了数据，是正确的做法。

### 8.5 其他可复跑的小结论

- `pricingModel` 与文案**未发现真正的自相矛盾**（扫描命中的 `c694e7c5f125` 属扫描口径误报：文案是「限时 9.9 元起」）。
- `firstSeen` 分布：**121/133 都是 `2026-09-21`**（迁移批次日），只有 12 条晚于它 → **`firstSeen` 不能当「首次发现该优惠的时间」用**，它主要是「数据进库日」。
- `lastSeen`：129/133 = `2026-09-28`（今日），4 条更早。
- 4 条 `type=deal` 的 `discountInfo` 用 `hasDiscountSignal()` 判**已不含优惠信号**（硅基流动「价格为『免费』」、AWS「credits」、Notion「折扣价」、ElevenLabs「Free 计划 $0…credits」）→ 它们靠策展的 `trustType` 保住 `deal` 身份。**这不是错标（都是真优惠），但意味着「`type` 的自动判定」与「人工策展」是两套口径，混在一列里**。

---

## 9. 与线上一致性（Q8）：修正 captain 的「完全一致」

我独立复跑了线上抓取（`fetch` + `arrayBuffer` 逐字节比对）：

| 文件 | 字节 | sha256(前16) | 带 zh 条目 | zh 字段数 |
|---|---|---|---|---|
| 线上 `https://buguoshixc.github.io/ai-deals-aggregator/deals.json` | 132665 | `5c752b8083662f00` | 44 | 62 |
| 本地 `dist/deals.json` | 132665 | `5c752b8083662f00` | 44 | 62 |
| 本地仓库根 `deals.json` | 132544 | `46a1947272f58cde` | **43** | **61** |

- **线上 == `dist/deals.json`：逐字节相同** ✅（captain 的 132665 字节也吻合）
- **线上 != 仓库根 `deals.json`**：差 **121 字节**，差异**恰好只有** `0ddacfb2cc6e` Wavel.ai 的 `zh.description`（「一个提供视频解决方案的平台，包含字幕与配音功能。」）
- `count=133`、`updatedAt=2026-09-28T11:50:50+08:00`、id 集合**三者一致**——所以按 captain 的三个判据看是「一致」，按字节看**不一致**。

**因果链（实测+引用，非猜测）**：`deals.json` 由采集任务重写（`98d9550` 11:50:50）→ 译文在 12:01 才提交（`ca183b9`）→ 之后 `deploy.yml` 用 `build-local.js` 读根文件 + `attachZh()`（`build-local.js:617-636`）产出 `dist/deals.json` → 上传 → **线上拿到 44 条译文，而仓库里那份 `deals.json` 停在 43 条**。`dist/` 在 `.gitignore` 里，是没有版本记录的构建产物。

→ **对用户无影响（线上是对的）**，但「仓库数据文件与译文覆盖层不同步」这件事**对任何门禁都不可见**（§5.1）。这正是本报告建议补的一条检查：`node scripts/tools/zh-todo.js --file=deals.json` 应能报出「覆盖层 44 vs 落盘 43」。

---

## 10. 未证实项清单（不许猜，逐条挂账）

| # | 条目/字段 | 未证实的原因 | 需要什么才能证实 |
|---|---|---|---|
| U1 | `c971e33a9cd0` ChatGPT Plus for Veterans（一年免费 ChatGPT Plus） | `chatgpt.com/veterans-claim` 本机网络不可达（node fetch + web_fetch 均失败） | 可访问的网络/代理，或用带 JS 的浏览器打开该 URL |
| U2 | `f5ffff50772c` ChatGPT/OpenAI「无公开学生/非营利折扣」 | `openai.com/chatgpt/pricing/` → HTTP 403 反爬；且是否定式声明 | 人工打开定价页截图核对 |
| U3 | `97d21ff73d3e` 及 **智谱活动页 5 条**（2000万 Tokens、邀请好友、GLM-5.3 五折、Batch 五折、上下文缓存限时免费） | `bigmodel.cn/pricing` 是 3853 B 的 JS 壳，静态抓取无正文 | 渲染后页面 或 官方公告页 |
| U4 | **火山方舟 12 条**（免费额度 200 张 / 20 小时 / 5000 字符 / 每日 500 万 Tokens / 9.9 元起） | `volcengine.com/product/ark` 静态 HTML 中「免费/领取/奖励/Token」0 命中；`volcengine.com/docs/6359/1279663` 也是 JS 壳 | 火山方舟控制台文档的渲染页/公告 |
| U5 | **智谱 7 条免费模型**的「调用价格 0 元」与「长期有效」 | 页面可达、URL 路径含 `/models/free/`、标题命中，但正文静态 HTML 无「免费」「0 元」 | 渲染后页面 或 官方定价表 |
| U6 | `833a9889bfb7` 讯飞「乐享会员最高价值 2888 元」 | 新手页命中「礼包/免费」，未命中 2888 | 渲染页或活动规则页 |
| U7 | 其余 69 条 deal（本次只抽了 11 条） | **未抽样**，不是「有问题」 | 后续按 U3/U4 同样方法批量核 |
| U8 | `translated` 译文与英文原文的**语义**对应 | 我只做了「不是机翻 + 无漏字段 + 指纹相符」的判断，没有逐句对照英文语意 | 双语人工复核 |
| U9 | 「线上 `index.html` = 本地 `dist/index.html`」 | 本条归 captain 的基线（字节数 294055 一致），我本轮**未独立复核** | 复跑线上抓取 |

---

## 11. 命令清单（全部可复跑；本机 PowerShell + Node v24.13.1）

> 说明：PowerShell 会把 `node -e "…"` 里的双引号吃掉（我踩过：`require("./deals.json")` 会变成 `require(./deals.json)` 并报 SyntaxError），所以下面统一用**单引号 here-string** `@'…'@`，JS 内只用单引号/模板外的普通字符。
> 中文文件**不要用 `Get-Content`**（控制台编码会乱码），一律用 `read` 工具或 node 读 JSON。

```powershell
# 0) 基线复现（captain 的两个门禁）
node scripts/validate.js
node scripts/tools/zh-todo.js --check
node scripts/tools/tier-report.js            # 默认视图 50 张卡
node scripts/tools/tier-report.js --all      # 全量 103 张卡
node scripts/tools/tier-report.js --vendor   # 厂商归一表

# 1) 分布（region/type/category/pricingModel/vendor）
node -e @'
const d=require('./deals.json').deals;
const cnt=(f)=>{const m={};for(const x of d){const k=String(f(x));m[k]=(m[k]||0)+1;}return m;};
for(const f of ['region','type','category','pricingModel','source'])console.log(f,JSON.stringify(cnt(x=>x[f])));
console.log('region/type',JSON.stringify(cnt(x=>x.region+'/'+x.type)));
console.log('原始 vendor 去重',new Set(d.map(x=>x.vendor)).size);
const core=require('./scripts/lib/render-core').load();
const m=new Map();for(const x of d){const v=core.vendorOf(x);const k=v.key||'(none)';if(!m.has(k))m.set(k,{n:0,raw:new Set()});m.get(k).n++;m.get(k).raw.add(x.vendor);}
console.log('归一厂商数',m.size);
[...m.entries()].sort((a,b)=>b[1].n-a[1].n).slice(0,12).forEach(([k,r])=>console.log(String(r.n).padStart(3),k,[...r.raw].join(' / ')));
'@

# 2) 133/80/60/73 与默认视图对账（含折叠明细）
node -e @'
const d=require('./deals.json').deals;const core=require('./scripts/lib/render-core').load();
console.log('deal',d.filter(x=>x.type==='deal').length,'tool',d.filter(x=>x.type==='tool').length);
console.log('cn',d.filter(x=>x.region==='cn').length,'global',d.filter(x=>x.region==='global').length);
console.log('默认视图卡片',core.defaultCards(d).length,'全部工具 tab 卡片',core.cardsFor(d,Object.assign(core.defaultFilters(),{tab:'tools'})).length);
console.log(JSON.stringify(core.facetModel(d,core.defaultFilters()).tabs));
for(const c of core.defaultCards(d))if(c.models&&c.models.length>1)console.log('折叠 '+c.models.length+' 条 -> '+c.title);
'@

# 3) 有效期三分类 + 独立复核「有没有绝对日期」
node -e @'
const d=require('./deals.json').deals;const {isOngoing,extractDeadline,collectAbsoluteDates}=require('./scripts/lib/expiry');
console.log('expiresAt非空',d.filter(x=>x.expiresAt).length,'validity非空',d.filter(x=>x.validity).length);
console.log('ongoing',d.filter(x=>isOngoing(x.validity||'')).length,'noDeadline',d.filter(x=>!isOngoing(x.validity||'')).length);
const F=['title','discountInfo','description','eligibility','validity','priceLine'];
const hits=d.filter(x=>F.some(f=>collectAbsoluteDates(String(x[f]||'')).length));
console.log('文本含 4 位年份的条目',hits.length,hits.map(x=>x.id+' '+x.title));
let n=0;for(const x of d)if(extractDeadline([x.validity,x.discountInfo].filter(Boolean).join('。')))n++;
console.log('extractDeadline 非空',n);
'@

# 4) 角标 vs 文案 矛盾（13 条）
node -e @'
const d=require('./deals.json').deals;const {isOngoing}=require('./scripts/lib/expiry');
const on=d.filter(x=>isOngoing(x.validity||''));
console.log('ongoing 但自称官方未标注:',on.filter(x=>/未标注截止日期|未标截止|以官方.*为准/.test(x.validity)).length);
on.filter(x=>/未标注截止日期|未标截止|以官方.*为准/.test(x.validity)).forEach(x=>console.log('  ',x.id,x.title,'|',x.validity));
const un=d.filter(x=>!x.expiresAt&&!isOngoing(x.validity||''));
console.log('未标注 但文案说长期/不过期:',un.filter(x=>/不过期|永久|长期|无限期/.test(x.validity||'')).length);
un.filter(x=>/不过期|永久|长期|无限期/.test(x.validity||'')).forEach(x=>console.log('  ',x.id,x.title,'|',x.validity));
'@

# 5) 译文双向核对（覆盖层 vs 落盘；含 Wavel.ai 那条）
node -e @'
const fs=require('fs');const d=require('./deals.json').deals;const zh=require('./scripts/lib/zh');
const ov=zh.load();const {deals:att,report}=zh.attach(d,ov);
console.log('覆盖层',Object.keys(ov.byId).length,'attach',report.attached,'字段',report.fields,'漂移',report.orphaned.length+report.stale.length+report.skipped.length+report.unmanaged.length);
const disk=new Set(d.filter(x=>x.zh&&Object.keys(x.zh).length).map(x=>x.id));
att.filter(x=>x.zh&&!disk.has(x.id)).forEach(x=>console.log('  覆盖层已译/落盘没有:',x.id,x.title));
for(const f of ['deals.json','dist/deals.json']){const j=JSON.parse(fs.readFileSync(f,'utf8'));const z=j.deals.filter(x=>x.zh&&Object.keys(x.zh).length);console.log(f,'withZh',z.length,'fields',z.reduce((n,x)=>n+Object.keys(x.zh).length,0));}
'@

# 6) 疑似重复的四条记录逐字段比对
node -e @'
const d=require('./deals.json').deals;
for(const x of d)if(/Getsolved|KREA|Kreado/.test(x.title+x.vendor))console.log(JSON.stringify({id:x.id,title:x.title,vendor:x.vendor,url:x.url,source:x.source,sourceUrl:x.sourceUrl,type:x.type,discountInfo:x.discountInfo}));
'@

# 7) 上游截断取证（aitools.fyi 的 zhDescription 以 ... 结尾，我们把它剥掉了）
node -e @'
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0';
(async()=>{const r=await fetch('https://aitools.fyi/',{headers:{'user-agent':UA}});const h=await r.text();
const m=h.match(/<script id=.__NEXT_DATA__.[^>]*>([\s\S]*?)<\/script>/);const j=JSON.parse(m[1]);
const ours=require('./deals.json').deals.filter(x=>x.source==='aitools.fyi');
for(const t of j.props.pageProps.regularTools){const o=ours.find(x=>x.title===t.name);if(!o)continue;
 console.log(t.name,'| 上游 zhDescription 尾 3 字:',JSON.stringify(t.zhDescription.slice(-3)),'| 我方:',JSON.stringify(o.description.slice(-8)));}})();
'@

# 8) 官方页关键词取证（抽样核验）
node -e @'
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0';
const strip=h=>h.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const probes=[['https://cloud.baidu.com/doc/qianfan/s/Imi2rpirg','100万'],['https://help.aliyun.com/zh/model-studio/new-free-quota','每个模型均有独立的免费额度'],
['https://siliconflow.cn/pricing','bge-m3'],['https://runway.com/pricing','125 credits'],['https://docs.coze.cn/coze_pro_credits','1500 积分']];
(async()=>{for(const [u,kw] of probes){try{const r=await fetch(u,{headers:{'user-agent':UA}});const t=strip(await r.text());const i=t.indexOf(kw);
console.log('###',u,r.status,'|',kw,'@',i,i>0?('...'+t.slice(Math.max(0,i-90),i+110)):'(未命中)');}catch(e){console.log('###',u,'ERR',e.message);}}})();
'@

# 9) 线上 vs 本地逐字节（三个文件一起比）
node -e @'
const crypto=require('crypto');const fs=require('fs');
(async()=>{const r=await fetch('https://buguoshixc.github.io/ai-deals-aggregator/deals.json',{cache:'no-store'});
const live=Buffer.from(await r.arrayBuffer());const h=b=>crypto.createHash('sha256').update(b).digest('hex').slice(0,16);
for(const f of ['deals.json','dist/deals.json'])console.log(f,fs.statSync(f).size,h(fs.readFileSync(f)));
console.log('online',live.length,h(live),'== dist:',live.equals(fs.readFileSync('dist/deals.json')),'== root:',live.equals(fs.readFileSync('deals.json')));})();
'@

# 10) 截断/断句普查
node -e @'
const d=require('./deals.json').deals;const END=/[。！？.!?)）」』\u201d]$/;
const caps={discountInfo:240,description:200,eligibility:120,validity:60,title:150};
for(const [f,c] of Object.entries(caps))console.log('触顶',f,d.filter(x=>typeof x[f]==='string'&&x[f].length===c).length);
for(const x of d)for(const f of ['discountInfo','description']){const v=x[f];if(typeof v==='string'&&v.length>60&&!END.test(v))console.log(' 尾部残缺',x.id,f,'len='+v.length,JSON.stringify(v.slice(-14)));}
'@
```

---

### 附：本报告的自我限制

- 抽样只做了 11/80 条，**其余 69 条不是「已证实」**，只能说「未抽样」。
- 我**没有**用渲染浏览器打开任何 SPA 页（U3/U4/U5 因此悬空）；本机网络**不能**访问 `chatgpt.com` / `openai.com`。
- 所有「官方页逐字命中」都是**静态 HTML 文本**命中，不等于「我今天亲眼在页面上看到」（页面可能随后台数据变化）。
- 本轮**未修改任何数据文件**：`git status --short` 只有两个未跟踪路径（captain 的 `research/_raw/AUDIT-CONTEXT.md` 与本目录），**没有任何被跟踪文件被改动**。
