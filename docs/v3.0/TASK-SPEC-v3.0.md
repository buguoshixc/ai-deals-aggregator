继续开发 AI Deals Aggregator。

这一次不是做一个小功能，也不是拆成多个独立版本。

请一次性完成一个完整大版本：

# v3.0-ai-deals-knowledge-base

目标：

把当前项目从：

“AI 优惠 + Coding 套餐 + API 价格页面集合”

升级为：

“AI 优惠、套餐、API 计费、模型、厂商和历史变化的结构化资料库”。

==================================================
0. 产品定位
==================================================

这个网站的核心定位不是：

- 帮用户决定买什么
- 推荐最值得买的套餐
- 给模型打分
- 做性价比排行榜
- 用 AI 替用户做购买决策

而是：

> 把散落在各厂商官网中的 AI 优惠、Coding 套餐、API 价格、模型关系与历史变化，
> 整理成长期维护、可搜索、可比较、可追溯、可引用的结构化资料库。

网站回答的是：

- 现在有哪些优惠？
- 某个平台有哪些套餐？
- 某模型在哪些平台提供？
- 官方价格是多少？
- 价格单位是什么？
- 有没有免费额度？
- 最近发生过什么变化？
- 历史上曾经是什么价格？
- 这条数据来自哪里？
- 最后什么时候确认？
- 哪些内容已经结束或下线？

最终判断由用户自己完成。

==================================================
1. 当前仓库基线
==================================================

开始之前必须完整阅读当前仓库。

至少阅读：

- README.md
- PROJECT_STATUS.md
- NEXT-STEPS.md
- package.json
- deals.json
- plans.json
- api-plans.json
- scripts/data/deal-history.json
- scripts/data/plan-history.json
- scripts/data/api-plan-history.json
- scripts/data/deal-plan-links.json
- scripts/data/providers.json
- 当前所有 docs/SCHEMA-*.md
- scripts/lib/history-core.js
- scripts/lib/history.js
- scripts/lib/plan-history.js
- scripts/lib/api-plan-history.js
- scripts/lib/feeds.js
- scripts/lib/seo.js
- scripts/lib/landing.js
- scripts/lib/plans-page.js
- API plans 页面相关代码
- build-local.js
- verify-site.js
- 所有 selftest / reproducible / CI consistency 脚本
- .github/workflows
- 当前 sitemap / feeds / changes 构建逻辑

当前文档快照大致为：

- deals.json：约 134 条，其中约 80 条真实优惠
- plans.json：9 条 Coding 套餐
- api-plans.json：7 条 API 计费记录 / 37 个模型计价条目 / 5 家平台
- Deals / Coding Plans / API Plans 三套数据独立
- 三套 History 独立
- deal-plan-links.json 显式连接 Deals 与 Plans
- 当前已经有 /plans/coding/
- 当前已经有 /plans/api/
- 当前已经有 /changes/
- 当前已经有 Feed / SEO / Source Health / Evidence / AI Maintenance

但：

> 以上数字只是进入任务时的背景信息。

必须以开始执行任务时：

git HEAD
+
真实数据
+
真实构建产物

为准。

如果文档与代码冲突：

实际代码和可重建数据优先。

完成后同步修正文档。

==================================================
2. 全版本最高优先级
==================================================

优先级必须保持：

数据正确性
>
来源可信度
>
身份稳定性
>
历史可追溯性
>
资料可查性
>
页面数量
>
视觉扩展

不得为了：

- 多收几个平台
- 多生成几个页面
- 页面看起来更完整
- SEO 数量
- 功能清单完成率

牺牲数据真实性。

继续遵守现有项目已经形成的红线：

1. 官方来源优先。
2. 查不到官方原文就不写生产数据。
3. unknown 不等于 false。
4. null 不等于 0。
5. 0 必须表示官方明确为 0 / 免费。
6. 不猜地区可用性。
7. 不猜模型对应关系。
8. 不把 credits 强转成 tokens。
9. 不做未经依据的单位换算。
10. 不因为名称相似就自动认为是同一个模型。
11. 不因为一轮采集失败就判定数据已下线。
12. AI 只能提出候选，不直接修改生产事实。

==================================================
3. 大版本内部执行方式
==================================================

这次虽然一次完成整个 v3.0，但内部必须严格按 Stage 推进。

顺序：

Stage A
现状审计 + 总体架构设计

Stage B
/plans/ 统一资料入口

Stage C
Coding / API 数据覆盖扩充

Stage D
Model Registry

Stage E
厂商统一资料页

Stage F
历史档案体系

Stage G
Data Docs / 数据出口

Stage H
API Pricing Feed + Changes

Stage I
全站信息架构收口

Stage J
完整门禁、Tooth Test、回归、最终报告

每完成一个 Stage：

1. 跑对应局部测试。
2. 检查数据假设是否仍成立。
3. 如果真实数据推翻后续设计：
   修改后续设计。
4. 不允许为了“不推翻前面已经写的代码”而给错误模型打补丁。
5. 最终再跑完整 Gate。

==================================================
Stage A — 现状审计与架构设计
==================================================

不要一开始就写代码。

先输出一份内部实施分析。

回答：

1. 当前 Deals / Coding Plans / API Plans 各自的真值层在哪里？
2. 三套 History 如何共享 history-core？
3. provider normalization 当前在哪里？
4. vendor 与 provider 当前有什么区别？
5. `/vendor/` 已经存在，是否有必要再生成 `/provider/`？
6. 当前 API modelKey 是否足够作为 Model Registry 输入？
7. 哪些模型只在 API Pricing 出现？
8. 哪些模型同时出现在：
   - Deals
   - Coding Plans
   - API Plans
9. 当前结束优惠 / 下线套餐 / API 旧价格能否从 History 重建？
10. 当前静态 JSON 哪些已经适合公开作为数据接口？
11. 当前页面之间有哪些信息孤岛？

特别注意：

不要因为 v3.0 要统一资料库，就设计一个超级 Entity 表把：

Deals
Plans
API Plans
Models
Providers

全部塞进去。

现有三份生产数据契约已经稳定。

v3.0 原则是：

> 建立索引层与关系层，而不是破坏现有真值层。

==================================================
Stage B — /plans/ 统一资料入口
==================================================

新增真正的：

/plans/

它不是简单的两个链接。

定位：

# AI 套餐与 API 计费资料库

至少展示：

--------------------------------------------------
Coding 套餐
--------------------------------------------------

当前：

- 套餐数
- 平台数
- 最近更新时间
- 最近变化数量

入口：

/plans/coding/

简要解释：

这里收录订阅型 / Coding Plan：

月费
活动价
可用模型
额度
限制
官方来源

--------------------------------------------------
API 计费
--------------------------------------------------

当前：

- provider 数
- API pricing record 数
- model pricing item 数
- 最近更新时间

入口：

/plans/api/

简要解释：

这里收录：

输入价格
输出价格
缓存
Batch
Off-Peak
Free Tier
Credits
其他官方计费维度

--------------------------------------------------
最近套餐与价格变化
--------------------------------------------------

复用真实 History。

不要写一套新的变化判据。

--------------------------------------------------
当前相关优惠
--------------------------------------------------

利用 deal-plan-links。

展示当前仍有效的：

Coding Plan 优惠
API 免费额度
API 新用户赠送

--------------------------------------------------

要求：

- 静态预渲染
- 无 JS 仍有完整内容
- self canonical
- h1
- breadcrumb
- sitemap
- JSON-LD
- 不产生孤儿页
- 不复制 Coding / API 页面已有大表

/plans/ 是：

资料入口

不是：

第三张重复大表。

==================================================
Stage C — 扩充 Coding / API 数据覆盖
==================================================

这一阶段的目标不是：

“至少增加 N 条”。

而是：

> 系统性检查重要来源，并尽可能增加经过官方验证的数据。

--------------------------------------------------
C1. Coding Plan
--------------------------------------------------

重新检查当前市场中的重要：

AI Coding
Developer Plan
Token Plan
Coding Subscription

优先检查：

国内开发者常用平台
国际主流平台
已有 Deals 中频繁出现的厂商

不要因为搜索到第三方套餐表就直接采信。

第三方只能用于：

发现候选。

生产事实必须尽量落到：

官方 pricing
官方 docs
官方 announcement
官方 product page

--------------------------------------------------
C2. API Pricing
--------------------------------------------------

重点重新尝试当前未采信的来源。

当前历史候选包括：

阿里云百炼
火山方舟
月之暗面 / Kimi
MiniMax
硅基流动
Mistral

以及其他高价值 Provider。

允许：

- 静态抓取
- Headless
- 页面载荷分析
- Next.js 数据
- 官方文档
- 人工策展

但仍然：

没有可靠官方依据
=
不进入 api-plans.json。

--------------------------------------------------
C3. 候选失败也要留下记录
--------------------------------------------------

不要让：

“检查过但没收录”

的信息丢失。

继续使用当前合适的 research/report 方式记录：

provider
URL
检查日期
失败原因
是否 JS
是否登录态
是否动态分页
是否官方页面已经下线
是否信息不完整

这部分是维护资料。

不要污染生产数据。

--------------------------------------------------
C4. 数据覆盖报告
--------------------------------------------------

新增或更新：

report:coverage

或当前架构下合适的报告。

至少输出：

Deals:
provider 数
当前优惠数

Coding:
provider 数
plan 数

API:
provider 数
pricing records
model pricing items

以及：

有 Deals 无 Plans 的 provider
有 Plans 无 Deals 的 provider
有 API Pricing 无 Model Registry 映射的模型
重要候选但尚未采信的 provider

==================================================
Stage D — Model Registry
==================================================

这是 v3.0 最重要的数据结构之一。

目标：

建立一个稳定的：

Model Registry

让系统第一次可以回答：

> 某个 AI 模型在哪些平台出现？

但：

Model Registry 是索引 / 身份层。

不是新的 API pricing 真值层。

--------------------------------------------------
D1. 新数据结构
--------------------------------------------------

设计：

models.json

或当前架构下更合理的文件。

建议顶层：

{
  "schemaVersion": 1,
  "updatedAt": "...",
  "count": ...,
  "models": []
}

每个模型至少考虑：

id
canonicalName
slug
developer / owner
family
aliases
officialUrl
status
firstSeen
lastSeen

字段必须根据真实数据决定。

不要为了 schema 漂亮强行增加无法可靠维护的字段。

--------------------------------------------------
D2. 身份问题
--------------------------------------------------

必须明确区分：

模型
模型家族
版本
Provider 上的部署别名

例如：

同一个基础模型：

DeepSeek 某版本

可能出现在：

DeepSeek 官方
阿里百炼
火山方舟
硅基流动

但：

名称相似
≠
同一模型。

生产关系必须：

显式映射
或
基于可靠官方证据。

禁止：

Levenshtein
字符串相似度
LLM 猜测

直接写生产映射。

这些只能生成 candidate。

--------------------------------------------------
D3. 映射层
--------------------------------------------------

不要强迫修改 api-plans.json 已稳定的 modelKey。

可以设计：

model-registry-links.json

或类似显式关系层：

registryModelId
apiPlanId
modelKey

如果 Coding Plan 中也有模型：

可以使用同一 Registry 连接。

目标：

现有数据契约尽量保持稳定。

--------------------------------------------------
D4. Alias
--------------------------------------------------

Alias 只用于：

已确认改名
官方别名
格式差异

不要用于：

猜测同模型。

任何 alias 都需要来源或明确人工确认依据。

--------------------------------------------------
D5. /models/
--------------------------------------------------

生成：

/models/

作为模型资料索引。

支持：

- 搜索
- developer/provider
- model family
- 状态
- 出现平台数

保持简单。

--------------------------------------------------
D6. /models/<slug>/
--------------------------------------------------

模型详情页至少可以展示：

模型名称
开发者
别名
官方链接

API 提供平台
----------------

Provider
计费通道
Variant
Input
Output
Cache
Unit
Last Seen

如果同一模型存在于多个平台：

全部列出。

不要：

自动折算
推荐
排序为“最便宜”
高亮“最佳”。

允许用户自行点击：

价格排序

但 UI 不能写：

“最值得”
“性价比”
“推荐”。

--------------------------------------------------
D7. 相关 Coding Plan
--------------------------------------------------

如果 Coding Plan 明确包含这个模型：

展示相关套餐。

--------------------------------------------------
D8. 相关 Deals
--------------------------------------------------

如果 Deal 显式关联该模型 / 对应 API plan：

展示相关优惠。

不要用标题关键词自动猜生产关系。

--------------------------------------------------
D9. 模型 History
--------------------------------------------------

模型页可以聚合：

API Plan History 中与该 modelKey 有关的事件。

例如：

价格变化
新增 Provider
Provider 下线
Variant 增加

但不要再建立第四套 History 真值。

这是派生视图。

==================================================
Stage E — 厂商统一资料页
==================================================

当前已有：

/vendor/

因此不要机械再生成一套：

/provider/

造成重复内容。

先分析：

vendor
provider

当前语义。

然后选择：

方案 A：
升级现有 /vendor/<slug>/ 成统一资料页

或：

方案 B：
建立 /provider/<slug>/ 为 canonical，
旧 /vendor/<slug>/ 作为 alias / redirect-like static page / noindex follow

只有在语义上确实需要时才能选 B。

禁止：

同时保留两套几乎相同的 indexable 页面。

--------------------------------------------------
统一厂商资料页应包括
--------------------------------------------------

例如 OpenAI：

OpenAI

官方入口
数据最后更新时间

优惠
----------------
当前有效 Deals

Coding Plans
----------------
如果存在

API Pricing
----------------
相关 API pricing records
模型数量
计费通道

Models
----------------
Model Registry 中属于或由该厂商提供的模型

Recent Changes
----------------
Deal History
Plan History
API Plan History

Feeds
----------------
如果存在对应订阅源

--------------------------------------------------

所有内容必须来自已有数据关系。

不要复制生产事实到新的 provider data 文件。

Provider Page 应：

join

而不是：

duplicate。

==================================================
Stage F — 历史档案体系
==================================================

资料库的原则：

> 资料失效不等于资料删除。

当前 History 已经有：

Deal History
Plan History
API Plan History

v3.0 要把这些历史能力真正变成用户可查的 Archive。

--------------------------------------------------
F1. Archive 数据来源
--------------------------------------------------

优先从：

baseline
+
events
+
tombstone / ended snapshot

重建。

不要人为维护第二份“历史数据”。

--------------------------------------------------
F2. Archive 页面
--------------------------------------------------

设计：

/archive/

或更符合当前 IA 的结构。

至少允许查看：

已结束优惠
已下线 Coding Plan
已下线 API Pricing Record / Model Price

--------------------------------------------------
F3. 历史详情
--------------------------------------------------

对于已结束资料：

显示：

状态
首次发现
最后有效时间
结束发现时间
最后已知内容
官方来源
变化时间线

--------------------------------------------------
F4. SEO
--------------------------------------------------

Archive 不是垃圾页。

但也不能：

每一个历史 event 都生成 SEO 页面。

只给：

有独立资料价值的实体

生成 indexable archive/detail 页面。

Event 本身继续作为：

timeline item。

--------------------------------------------------
F5. 不删除历史
--------------------------------------------------

未来 collect / rebuild：

不能因为当前数据消失就自动删除 Archive 所需墓碑数据。

需要 Tooth Test。

==================================================
Stage G — Data Docs / 数据出口
==================================================

网站已经不只是页面。

v3.0 要正式承认：

它也是一个公开数据源。

建立：

/docs/data/

或当前 URL 架构下等价入口。

==================================================
G1. Dataset Index
==================================================

介绍：

deals
coding plans
api pricing
models
relationships
history

每份数据写清：

URL
schemaVersion
updatedAt
记录数
用途

==================================================
G2. 稳定 JSON Endpoints
==================================================

现有：

/deals.json
/plans.json
/api-plans.json

继续保持兼容。

新增 Model Registry 后：

/models.json

如果需要：

可以新增：

/data/index.json

作为 Dataset Manifest。

例如：

{
  "datasets": [...]
}

但：

不要为了“统一”复制所有数据。

Manifest 只描述数据集。

==================================================
G3. Data Documentation
==================================================

至少解释：

ID 稳定性
null
unknown
0
firstSeen
lastSeen
verified
Evidence
derived fields
History
relation files
单位
currency
modelKey
registry model id

==================================================
G4. 使用示例
==================================================

提供最简：

JavaScript fetch
Python requests

示例。

示例必须基于真实 endpoint。

==================================================
G5. 引用方式
==================================================

告诉别人：

如果引用本站数据：

应该同时保留：

本站记录 URL
官方 source URL
更新时间

不要宣称本站是官方来源。

==================================================
G6. License
==================================================

检查仓库当前 LICENSE。

如果已经有：

文档如实说明。

如果没有：

不要擅自决定数据许可证。

在最终报告列为：

需要项目所有者决定。

==================================================
G7. Schema 稳定性
==================================================

说明：

Breaking Change
Additive Change
schemaVersion

至少建立一套文档约定。

不要承诺目前无法保证的永久 API compatibility。

==================================================
Stage H — API Pricing Feed + Changes
==================================================

当前：

Coding Plan 已经有变化 Feed。

API Pricing History 已存在。

但 API Pricing 还没有完整进入：

Feed
+
/changes/

v3.0 补齐。

--------------------------------------------------
H1. /changes/
--------------------------------------------------

不要新做一个孤立页面。

扩展现有：

/changes/

让用户可以区分：

优惠变化
Coding 套餐变化
API 价格变化

API 变化至少包括：

价格变化
模型新增
模型移除
Variant 新增
Free Tier 变化
限制变化
Record 下线
Record 恢复

所有判据必须直接来自：

api-plan-history

不要建立第二套变化检测。

--------------------------------------------------
H2. API Pricing Feed
--------------------------------------------------

新增：

/feed/plans/api/changes.xml
/feed/plans/api/changes.json

或符合当前 feed registry 命名规则的等价路由。

Stable ID：

直接使用 api plan history 的稳定 event ID。

不能每次 build 重新生成。

--------------------------------------------------
H3. Feed Registry
--------------------------------------------------

当前 feeds registry 如只支持单一 Plan Change Spec：

请正式抽象成多 spec。

不要：

复制一份 `feeds-api.js`

形成两套逻辑。

--------------------------------------------------
H4. /feeds/
--------------------------------------------------

加入：

API 价格变化

并保证：

RSS
JSON Feed
页面链接
Feed Discovery

一致。

==================================================
Stage I — 全站信息架构收口
==================================================

完成上述能力之后重新审查导航。

产品顶层概念已经变成：

优惠
套餐
模型
厂商
变化
订阅

但不要机械把六个链接全部塞进顶栏。

需要结合：

当前首页密度
移动端宽度
现有导航
真实页面价值

设计清晰入口。

--------------------------------------------------
I1. 建议核心 IA
--------------------------------------------------

概念上：

首页

优惠
/plans/
/models/
厂商
/changes/
/feeds/

但具体 UI 自行分析。

--------------------------------------------------
I2. 首页
--------------------------------------------------

不要把首页改成另一个 sitemap。

首页仍然应该突出：

AI 优惠

因为这是目前最成熟的数据集和主要入口。

可以增加：

资料库

相关入口，例如：

套餐与 API 计费
模型
厂商
历史变化

但不要破坏：

首屏密度
卡片数量
筛选体验。

--------------------------------------------------
I3. Global Search
--------------------------------------------------

评估是否值得在 v3.0 加：

统一资料搜索。

如果实现简单且数据稳定：

允许搜索：

Deals
Coding Plans
Models
Providers

并按类型分组。

如果需要大规模前端重构：

本版本不强制。

最终报告说明取舍。

==================================================
4. Archive / Model / Provider 页的生成门槛
==================================================

不要为了 SEO 批量生成薄页。

Model Page：

至少要求：

存在真实 registry entry
+
至少被一个当前或历史实体引用

Provider Page：

至少包含：

Deal
Coding Plan
API Pricing
Model

其中至少一种真实资料。

Archive Detail：

必须存在：

真实历史 snapshot / event chain。

禁止：

只根据名称生成空页面。

==================================================
5. SEO / GEO
==================================================

所有新页面继续遵守现有 SEO contract。

至少：

unique title
meta description
self canonical
h1
breadcrumb
JSON-LD
sitemap
no orphan
no duplicate canonical
static body
no-JS readable

不要：

自动生成大量关键词文章。

不要：

AI 生成 SEO 长文。

内容必须主要来自：

结构化数据
+
必要的页面说明。

==================================================
6. Evidence / Provenance
==================================================

v3.0 新的数据结构：

Models
Provider views
Archive
Data Docs

不能削弱现有 Evidence 原则。

特别：

Model Registry 中：

“Model A == Model B”

属于事实。

如果没有依据：

只能 candidate。

API Provider Mapping 同理。

能够链接到官方：

就链接官方。

==================================================
7. AI Maintenance 在 v3.0 的作用
==================================================

AI Maintenance 可以增加：

model mapping candidate
provider candidate
possible alias
possible rename
source extraction candidate

但：

candidate
≠
production relation。

例如：

AI 认为：

DeepSeek-V3.1
=
deepseek-v3.1-terminus

只能进入：

review candidate。

不能自动写 model registry。

==================================================
8. 测试与 Tooth Tests
==================================================

每个 Stage 都必须增加能真的失败的测试。

至少包含以下类别。

--------------------------------------------------
Model Registry
--------------------------------------------------

1. 两个同名模型来自不同开发者，被错误自动合并
→ 红

2. alias 指向两个 registry model
→ 红

3. mapping 指向不存在 api plan / modelKey
→ 红

4. modelKey 改名被工具直接自动 merge
→ 红

5. Model Page 展示不存在的 Provider
→ 红

--------------------------------------------------
Provider Page
--------------------------------------------------

6. 同一 provider 出现两个 canonical slug
→ 红

7. /vendor/ 与 /provider/ 两个 indexable 重复页面
→ 红

8. Provider Page 的 API 数量与 api-plans 数据不一致
→ 红

--------------------------------------------------
Archive
--------------------------------------------------

9. 当前 Deal 消失后历史记录也消失
→ 红

10. Source 故障导致大批 Archive ended
→ 红

11. ended → restored 后状态错误
→ 红

--------------------------------------------------
Data Docs
--------------------------------------------------

12. 文档里的 JSON endpoint 不存在
→ 红

13. schemaVersion 文档与真实数据不一致
→ 红

14. Dataset Manifest 数量与真实数据不一致
→ 红

--------------------------------------------------
Feed
--------------------------------------------------

15. API event 重复 build 后 GUID 改变
→ 红

16. API Feed event 指向不存在页面锚点
→ 红

17. API Feed 混入 Coding Plan event
→ 红

--------------------------------------------------
SEO
--------------------------------------------------

18. Model Page duplicate canonical
→ 红

19. 空 Model Page 进入 sitemap
→ 红

20. orphan provider page
→ 红

==================================================
9. Regression
==================================================

v3.0 不能破坏现有：

Deals 首页
收藏
对比
筛选
搜索
中文翻译
Need Pages
Vendor Pages
Deal Details
Coding Plans
API Plans
Changes
Feeds
Status
Dark Mode
Mobile
No-JS
SEO
History
Source Health
AI Maintenance

尤其检查：

deals.json
plans.json
api-plans.json

如果 v3.0 不需要修改其契约：

必须保持兼容。

不要为了 Model Registry：

重写 api-plans.json。

==================================================
10. 数据扩充不设硬数量 KPI
==================================================

这是强制原则。

不要写：

“必须新增 10 家 Provider”。

正确规则：

检查 10 家
↓
官方能验证 4 家
↓
只发布 4 家

另外 6 家：

进入候选未采信报告。

成功标准不是：

数量。

而是：

可信覆盖率。

==================================================
11. v3.0 质量指标
==================================================

最终报告至少统计：

Deals
----------------
当前优惠数
Provider 数
官方来源覆盖
Evidence 覆盖
最近确认率

Coding Plans
----------------
Plan 数
Provider 数

API Pricing
----------------
Provider 数
Pricing Record 数
Model Price Item 数
单位类型
计费通道

Models
----------------
Registry Models
Mapped API price items
Unmapped modelKeys
Alias 数
Candidate mappings

Provider Pages
----------------
生成页数
每页资料类型覆盖

Archive
----------------
Ended Deals
Ended Plans
Ended API Records
Restored Records

Data
----------------
公开 dataset 数
schemaVersion
JSON endpoint

History
----------------
Deal events
Coding events
API events

SEO
----------------
indexable pages
sitemap entries
orphan pages
duplicate canonical

==================================================
12. 性能
==================================================

记录：

dist file count
dist size
build time
verify time
sitemap count

防止：

Models × Providers

产生页面爆炸。

不要生成：

provider × model × variant

组合页。

Model Page 已经足够。

==================================================
13. 明确禁止
==================================================

v3.0 不做：

AI 推荐
购买建议
最值得买
综合推荐
星级评分
模型能力排行榜
AA 分数
Benchmark 排名
API Cost Calculator
跨币种自动比较
credits → tokens
用户画像
账号
登录
评论
社区
广告
付费排名
个性化推荐
App

也不要：

为了“统一架构”

重写已经稳定的三份核心数据集。

==================================================
14. 文档同步
==================================================

完成后必须更新：

README.md
PROJECT_STATUS.md
NEXT-STEPS.md

新增：

docs/SCHEMA-v3.0.md

建议增加：

research/v3.0-ai-deals-knowledge-base-report.md

SCHEMA-v3.0 要重点写：

Model Registry
Model Mapping
Provider Page
Archive
Dataset Manifest
API Change Feed
生成门槛
SEO 策略
兼容性

不要把旧版契约复制一遍。

通过引用旧文档避免重复。

==================================================
15. Git / 分支要求
==================================================

在独立分支：

v3.0-ai-deals-knowledge-base

完成。

如果当前环境支持 worktree：

优先使用隔离 worktree。

不要直接重写 master。

不要绕过：

gate
ruleset
required checks。

除非用户已经明确要求发布：

完成后不要自动 merge master。

先输出最终完成报告。

==================================================
16. 验证要求
==================================================

运行：

所有现有 npm test / selftest / check / verify

以及 v3.0 新增测试。

至少必须覆盖当前已有：

npm test
npm run test:strict
npm run check:reproducible
npm run check:plans:reproducible
npm run check:api-plans:reproducible
npm run check:history
npm run check:plan-history
npm run check:api-plan-history
npm run check:zh
npm run selftest:zh
npm run selftest:expiry
npm run selftest:text
npm run selftest:health
npm run selftest:provenance
npm run selftest:history
npm run selftest:changes
npm run selftest:feeds
npm run selftest:audience
npm run selftest:app-token
npm run selftest:plans
npm run selftest:plan-history
npm run selftest:deal-plan-links
npm run selftest:api-plans
npm run ai:selftest
npm run fixture:test
npm run selftest:seo
npm run build
npm run verify
npm run verify:regress
npm run verify:seo
npm run check:feeds:reproducible
npm run check:ci

如果 package.json 已变化：

以实际 scripts 为准。

不要为了让测试变绿删除旧断言。

不要提高容差掩盖回归。

发现真实问题：

修代码。

==================================================
17. 线上验收
==================================================

如果本版本最终被用户允许发布：

部署后必须对线上 GitHub Pages 做真实冒烟。

至少检查：

/
 /plans/
 /plans/coding/
 /plans/api/
 /models/
 任意 3 个 model detail
 厂商资料页
 /archive/
 /changes/
 /feeds/
 /docs/data/
 /deals.json
 /plans.json
 /api-plans.json
 /models.json
 /sitemap.xml

以及：

JS error = 0
unexpected external request = 0
mobile overflow = 0
all core endpoints HTTP 200

不要只根据 Deploy success 推断线上正确。

==================================================
18. 最终完成标准
==================================================

v3.0 完成后，用户应该可以沿至少四个方向浏览同一套资料：

按优惠：

Deals
→
Deal Detail

按套餐：

Plans
→
Coding / API

按模型：

Models
→
Model Detail
→
各平台价格

按厂商：

Provider
→
Deals
→
Plans
→
Models
→
Changes

同时：

历史失效资料不会消失，
公开 JSON 有正式文档，
API Pricing 变化可以订阅。

==================================================
19. 最终产品结构
==================================================

最终目标应接近：

AI 优惠与计费资料库

├── 优惠
│   ├── 当前优惠
│   ├── 学生
│   ├── 开发者
│   └── 历史优惠
│
├── 套餐与计费
│   ├── /plans/
│   ├── Coding Plans
│   └── API Pricing
│
├── 模型
│   ├── /models/
│   └── /models/<slug>/
│
├── 厂商
│   └── 每家厂商统一资料页
│
├── Changes
│   ├── Deals
│   ├── Coding
│   └── API Pricing
│
├── Archive
│
├── Feeds
│
└── Data
    ├── JSON datasets
    └── Data Docs

==================================================
20. 最终报告
==================================================

任务结束后输出：

# v3.0-ai-deals-knowledge-base 完成报告

## 1. 执行前基线

## 2. 总体架构决策

## 3. /plans/ Hub

## 4. Coding Plan 数据扩充
### 检查来源
### 采信来源
### 未采信来源及原因

## 5. API Pricing 数据扩充
### 检查来源
### 采信来源
### 未采信来源及原因

## 6. Model Registry
### Schema
### ID
### Alias
### Mapping
### Candidate Policy

## 7. Model Pages
### /models/
### Detail Pages
### API Pricing 聚合
### Coding Plan
### Deals

## 8. Provider Knowledge Pages
### URL 策略
### /vendor/ 兼容策略
### 聚合数据

## 9. Archive
### 数据来源
### 结束记录
### 恢复记录
### 页面

## 10. Data Docs
### Dataset Manifest
### Endpoints
### Schema Version
### 使用示例
### License 状态

## 11. API Pricing Changes
### /changes/
### RSS
### JSON Feed
### Stable IDs

## 12. 全站信息架构

## 13. SEO / GEO

## 14. Tooth Tests
逐条列出：
污染方式
预期失败
实际失败

## 15. 完整测试结果

## 16. 构建规模变化
before / after：
files
size
pages
sitemap
build time
verify time

## 17. 数据规模
Deals
Coding Plans
API Pricing
Models
Providers
Archive
History

## 18. 已知限制

## 19. 刻意没做的事情

## 20. 后续建议

最后必须明确回答：

1. v3.0 是否真正完成了“资料库化”，而不是只新增几个页面？
2. 当前最大的瓶颈已经变成代码、数据覆盖还是人工维护？
3. 哪些重要 Provider 仍缺数据，以及为什么？
4. Model Registry 还有多少未映射项？
5. 下一版本最值得投入的方向是什么？

==================================================
21.最后原则
==================================================

整个 v3.0 最重要的一句话：

> 不替用户做判断，把事实整理到足以让用户自己判断。

第二重要：

> 资料消失不等于资料删除。

第三重要：

> 新索引层可以不断增加，但已有真值层不要为了“统一”而被破坏。

第四重要：

> 宁可资料暂时缺失，也不要把不确定事实写成确定数据。