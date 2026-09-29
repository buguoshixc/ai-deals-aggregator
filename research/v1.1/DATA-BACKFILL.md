# 学生 / 开发者字段补齐交付说明（DATA-BACKFILL）

> 任务：`t3 [data]` 高价值优惠的学生 / 开发者字段补齐（curated 全量 + deals.json 重点条目）
> 契约：`docs/SCHEMA-v1.1.md`（冻结；§2.5.1 四档证据口径为 captain 本轮修正后追加）
> 数据：`scripts/data/curated_cn.json`（18）· `scripts/data/curated_global.json`（14）· `deals.json`（80 优惠 / 54 工具）
> 本报告写的是**最终落盘状态**：curated 两文件的六字段由 captain 的 `scripts/tools/audience-backfill.js` 逐条判断落盘（我在其上做了 12 处定向补值），deals.json 的 56 条由我逐条判断落盘。

---

## 一、一句话结论

**真值只在有原文依据的地方写。** 88 条被标注的记录里，每个值都能在该条自己的 `url` 官方页或该条既有字段（`discountInfo` / `description` / `eligibility` / `validity`）里找到出处；找不到出处的一律**不写**（缺席 = unknown），而不是写 `false`。全仓只有两处 `false` 属于「来源明说不需要」：Azure for Students 的「**均无需信用卡**」，以及一批原文写着「自动发放 / 无需单独领取 / 即可直接调用」的 `manualApplication: false`。

产物：

| 文件 | 我做了什么 |
|---|---|
| `scripts/data/curated_cn.json`（18 条） | 六字段全量（captain 的 backfill 逐条判断 + 我在 4 条上定向补改 `availability`） |
| `scripts/data/curated_global.json`（14 条） | 六字段全量（同上 + 我在 8 处定向补值：`manualApplication` / `creditCardRequired` / Google 的 provenance 定性） |
| `deals.json`（80 优惠 + 54 工具） | **56 条**逐条补：48 条 `type=deal`（学生 / 教师 / 非营利 / 退伍军人 + 开发者 API 与高价值额度）+ 8 条工具条目 |
| `research/v1.1/DATA-BACKFILL.md` | 本文件 |

**我的改动是纯追加**：merge 之前实测 —— `deals.json` 的删行全部是同一条 `"verifiedAt": null`（它从记录末行变成带逗号的中间行）、curated 两文件的删行只有 `"verifiedAt": "2026-09-22"` 这一种形态，**值层面没有任何既有字段被我改过**（每次写盘后都跑「剥掉六个新字段再逐字节比对」的自检）。

**17:00 那次真实 merge 动了 32 条策展记录的既有字段（不是我的改动，但与数据有关，如实记下）**：`firstSeen` 从 `2026-09-21/22/23` 被刷成 `2026-09-29`；部分条目的 `sourceUrl`（原先指向 layer3labs / futuretools 聚合站）被置空。逐条比对 HEAD 与当前 `deals.json` 的结果是「134 条中 32 条既有字段有变化，全部是这 32 条策展记录，键只有 `firstSeen` 与 `sourceUrl` 两个」。原因在 `loadCurated → makeDeal`：策展原始文件不带 `firstSeen`，`makeDeal` 按当天盖章，merge 后策展侧赢了记录，于是「首次收录日期」被刷成今天 —— **这会让策展条目的 `firstSeen` 每次 merge 都重置**，是否预期需要 captain / t4 定夺；本任务不动这 32 条记录的既有字段。

---

## 二、判据纪律（写这份数据时用的六条）

1. **`false` 是重话，只在来源明说「不需要」时写。** 没有证据 ≠ false。全仓 `creditCardRequired` 有值的只有 2 条：Azure「均无需信用卡」= `false`、Windsurf 条款「payment details」= `true`；其余优惠一律**不写**。
2. **`true` 需要来源陈述，或者一条可核的推理链。** 按契约 §2.5.1 四档：官方明文地区条款 → 按条款取值；**明写实名认证 / 大陆手机号绑定** → `true`，且必须 `basis:"inferred"` + `derived:"inferred"` + note 写清推理链；只是国内厂商 / 中文页面 / 面向国内开发者 → `unknown`；只写「需完成认证」（没说是哪种认证）→ `unknown`。
3. **`"unknown"` 与「缺席」都是诚实取值，但语义不同**：写 `"unknown"` = 查过了、没有证据（例如 Layer3Labs 那几条的 `availability`）；缺席 = 这一维没有可说（例如 54 条聚合站工具）。两者都不进覆盖率分子。
4. **数组是「并集」语义**：一条可以同属多个人群。`["student","developer"]` 是常客（GitHub Student Developer Pack、Copilot Student、Windsurf 学生折扣）。
5. **枚举里没有的群体，宁可 `other` + note，也不硬塞**。非营利组织 / NGO / 初创公司 / 退伍军人 / 家长 → `other` 或落到最贴近的一档，并在 provenance note 里写明「枚举无 X，归入 Y」。
6. **`provenance` 逐字段，且只给真的有值的字段背书**（契约 §7.1）：`fields` 里绝不出现指向 `unknown` / 缺席字段的条目。`credibility` 上，curated 文件写 `curated`、采集条目写 `collected`，**不冒用 `editorial`** —— 那是「人工回访过官方页」的意思，这一轮我没有做第二次回访，就不签这个字。

三条**我自己改过**的判断（留痕）：

- 第一版给 4 条 `扣子 Coze` 写 `audience: ["general"]`。复核契约 §2.1「`general` 的含义是来源**明说**面向所有用户，不是『我们不知道它面向谁』」后改为 `["developer"]`：原文只写「扣子个人版用户」，而积分可抵扣**扣子编程 / Token / 插件调用**，使用者是搭智能体的开发者。这一处与 captain 的 backfill 表一致。
- 第一版用「需实名认证」推 `chinaUsable: true`（27 + 3 条）。中间被 captain 按「无明文地区条款即 unknown」撤掉过一次，captain 复核证据后**修正裁决**为四档（见 §七），我按修正后的 §2.5.1 恢复为 `true` + `inferred` + note。
- 第一版给 `火山方舟` 免费额度 10 条写了通用 note，收尾时改成**各自 `discountInfo` 的原文引文**（同一个值不该只有一个模糊出处）。

---

## 三、curated 两文件逐条（32 条）

「依据」列全部是**该条自己的原文片段**（来自 `discountInfo` / `description` / `eligibility` / `validity`，或官方条款原文）。逐条完整判断依据另见 `scripts/tools/audience-backfill.js` 的 `ENTRIES[*].why`（captain 维护，同仓库可核）。

| # | 条目 | audience | benefitType | 资格门槛 | 领取要求 | 中国可用性 | 依据（该条自己的原文） |
|---|---|---|---|---|---|---|---|
| 1 | CN · 火山方舟 豆包全系模型 个人开发者 50 万 tokens 免费额度 | developer | free_credits · free_api | newUserOnly=unknown · identityVerificationRequired=unknown | accountRequired=true | — | discountInfo「500,000 tokens 的免费推理额度」；eligibility「个人开发者（需注册火山引擎账号）」「注册即可调用豆包等十数种大模型」 |
| 2 | CN · 腾讯混元 新用户 100 万 tokens 免费资源包 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | accountRequired=true · manualApplication=false | chinaUsable=true | discountInfo「一次性免费资源包…共用 100 万 tokens」；eligibility「通过腾讯云实名认证的新用户」；description「点击「立即使用」即自动发放」 |
| 3 | CN · 讯飞星火 Spark Lite 轻量级大模型免费使用 | developer | free_model · free_api | newUserOnly=unknown · identityVerificationRequired=unknown | accountRequired=true | — | discountInfo「轻量级大语言模型 Spark Lite『支持免费使用』」；eligibility「注册讯飞开放平台的开发者（需创建应用）」；description「使用对应版本的 APIPassword 即可调用」 |
| 4 | CN · 讯飞开放平台 新手免费福利礼包 | developer | free_credits · developer_credit | newUserOnly=true · identityVerificationRequired=unknown | accountRequired=true | — | discountInfo「新手产品礼包（八大 AI 服务、百万级交互量免费领取）…乐享会员」；eligibility「新注册开发者；乐享会员需完成认证」 |
| 5 | CN · Kimi 开放平台 新用户 15 元代金券 | developer | free_credits · developer_credit | newUserOnly=true · identityVerificationRequired=true | accountRequired=true | chinaUsable=true | discountInfo「注册即赠送 15 元代金券，可用于体验 Kimi K3 等模型的 API 调用」；eligibility「新注册用户（需实名认证）」 |
| 6 | CN · 商汤日日新 Token Plan 首月限时免费 | developer | free_api · trial | newUserOnly=unknown · identityVerificationRequired=unknown | accountRequired=true | — | discountInfo「限时免费开放，开发者首月可享每 5 小时 1500 次调用的无门槛免费配额」；description「登录 SenseNova 平台即可申请领取」 |
| 7 | CN · 硅基流动 免费模型专区 | developer | free_model · free_api | newUserOnly=false · identityVerificationRequired=unknown | accountRequired=true · manualApplication=false | — | discountInfo「官方定价页标注多款模型价格为「免费」」；eligibility「所有注册开发者」；description「注册账号并创建 API Key 后即可直接调用」 |
| 8 | CN · 阶跃星辰 StepAudio 3 语音大模型限时免费 | developer | free_model · trial | newUserOnly=unknown · identityVerificationRequired=unknown | accountRequired=true | — | discountInfo「stepaudio-3-realtime-preview 与 stepaudio-3-chat-preview 的输入/输出价格均标注为『限时免费』」；description「注册并创建 API Key 后即可调用」 |
| 9 | CN · 百川智能 海纳百川计划 免费使用 M3Plus API | developer | free_api | newUserOnly=unknown · identityVerificationRequired=unknown | accountRequired=true | — | discountInfo「申请加入海纳百川计划 · 免费使用 M3Plus API」；description「点击页面横幅进入申请流程，审核通过后即可免费使用」 |
| 10 | CN · 扣子 Coze 新用户首次注册赠送 1500 活动积分 | developer | free_credits · developer_credit | newUserOnly=true · identityVerificationRequired=unknown | accountRequired=true · manualApplication=false | — | discountInfo「新用户首次注册一次性赠送 1500 活动积分」；eligibility「每个账号仅限领取一次，企业版用户不参与」；description「按官方规则发放（通常实时或 T+1）」 |
| 11 | CN · 扣子 Coze 个人版每日登录赠送 1500 活动积分 | developer | free_credits · developer_credit | newUserOnly=false · identityVerificationRequired=unknown | accountRequired=true · manualApplication=false | — | discountInfo「每日成功登录即可获赠 1500 活动积分」；eligibility「扣子个人版用户（含个人免费版；企业版用户不参与）」 |
| 12 | CN · 扣子 Coze 部分模型限时免费 每模型 100 次/天 | developer | free_model | newUserOnly=false · identityVerificationRequired=unknown | accountRequired=true | — | discountInfo「Kimi-8k/32k/128k、阶跃星辰等模型限时免费，每个模型 100 次/天，不扣减积分」；eligibility「所有扣子用户」 |
| 13 | CN · 扣子 Coze 官方付费插件每日免费额度 10-30 次/天 | developer | free_api · free_credits | newUserOnly=false · identityVerificationRequired=unknown | accountRequired=true | — | discountInfo「官方付费插件普遍配有每日免费额度…额度内调用不扣积分」；eligibility「所有扣子用户（主账号及其子账号共享免费额度）」 |
| 14 | CN · 360智脑开放平台 新用户获赠体验券/代金券（官方协议条款） | developer | free_credits · developer_credit | newUserOnly=true · identityVerificationRequired=true | accountRequired=true | chinaUsable=unknown | 协议原文「针对新用户等不特定人群赠与体验券或代金券…可用于平台上360智脑大模型API调用消耗使用」；description「需 360 账号、绑定手机号并通过意向申请开通」 |
| 15 | CN · MiniMax 开放平台 Token Plan 好友邀请 受邀人 9 折 | developer | discount | newUserOnly=false · identityVerificationRequired=unknown | accountRequired=true · manualApplication=false | — | discountInfo「受邀人结算自动 9 折」+「邀请人可获得该订单实付金额 10% 的开放平台通用代金券」 |
| 16 | CN · MiniMax MiniMax-M3 按量计费永久五折 | developer | discount · free_api | newUserOnly=false · identityVerificationRequired=unknown | accountRequired=true · manualApplication=false | — | discountInfo「MiniMax-M3 标注「永久五折」，原价以删除线展示」；eligibility「所有开放平台用户（按量计费 API Key）」 |
| 17 | CN · 海螺AI 会员限时优惠价 基础会员 55 元/月 | general | discount | newUserOnly=false · identityVerificationRequired=unknown | accountRequired=true | — | discountInfo「基础会员：价格：105元/月，限时优惠价55元，促销期结束后将恢复为105元」 |
| 18 | CN · 魔搭 ModelScope API-Inference 免费推理 API（动态限流） | developer | free_api · free_model | newUserOnly=false · identityVerificationRequired=true | accountRequired=true | chinaUsable=true | discountInfo「魔搭通过API-Inference…免费提供给广大开发者体验」；eligibility「该阿里云账号已通过实名认证」 |
| 19 | Global · Anthropic Claude 非营利组织折扣 | other | discount | newUserOnly=false · identityVerificationRequired=true | manualApplication=true · accountRequired=true | chinaUsable=unknown | discountInfo「经核验的非营利组织可享 Claude Team / Enterprise 折扣价」；description「通过合作方 Goodstack 提交非营利资格核验表单后即可开通」 |
| 20 | Global · GitHub Copilot 学生免费（Copilot Student） | student · developer | student_plan · free_subscription | educationEmailRequired=unknown · identityVerificationRequired=true | manualApplication=true · accountRequired=true | — | discountInfo「通过 GitHub Education 验证的在校学生可免费使用 Copilot 全部付费功能」；description「完成学籍验证后激活…验证通过与权益生效是两个步骤，可能需数天」 |
| 21 | Global · GitHub Copilot 教师与开源维护者免费 Pro | educator · developer | free_subscription | identityVerificationRequired=true · newUserOnly=false | accountRequired=true | — | discountInfo「已验证教师以及热门开源仓库维护者可免费获得 GitHub Copilot Pro 访问权」 |
| 22 | Global · GitHub Student Developer Pack 学生开发者工具包 | student · developer | student_plan · free_credits · developer_credit | educationEmailRequired=unknown · identityVerificationRequired=true | manualApplication=true · accountRequired=true | — | discountInfo「含 GitHub Copilot、Codespaces、Microsoft Azure、DataCamp、FrontendMasters 等合作方免费额度与服务」；description「用学校邮箱 / 学籍材料申请…通过后激活」 |
| 23 | Global · Google AI Pro 学生免费 12 个月（含 Gemini 高级版） | student | student_plan · free_subscription · trial | educationEmailRequired=unknown · identityVerificationRequired=true | accountRequired=true | chinaUsable=false · regionRestriction=官方学生优惠按国家/地区区分（美国为 AI Pro、美国以外为 AI Plus） | discountInfo「美国…Google AI Pro（价值 $19.99/月）；美国以外学生…Google AI Plus」；validity「限时返校季活动，领取后 12 个月免费」 |
| 24 | Global · Microsoft Azure for Students 学生免费 100 美元额度 | student · developer | student_plan · free_credits · developer_credit | educationEmailRequired=unknown · identityVerificationRequired=true | creditCardRequired=false · accountRequired=true | — | discountInfo「学生免费获得 $100 Azure 额度（可用于 Azure OpenAI 等）…均无需信用卡」；description「用学校邮箱注册」 |
| 25 | Global · 微软 Microsoft 365 教育版 学生 5 折（含 Copilot） | student · educator | discount · free_subscription | educationEmailRequired=true · identityVerificationRequired=true | accountRequired=true | — | discountInfo「用大学邮箱可 5 折购买含 Copilot 的 Microsoft 365」；eligibility「在校大学生及家长」；description「用学校邮箱验证身份」 |
| 26 | Global · AWS Activate 初创公司最高 20 万美元云 credits | developer | free_credits · developer_credit | newUserOnly=false · identityVerificationRequired=unknown | accountRequired=true | — | discountInfo「初创公司最高 $200,000 AWS Activate Credits」；eligibility「初创公司（含自筹与已融资团队）」；description「按阶段提交申请，通过后获得 credits」 |
| 27 | Global · Figma for Education 学生与教师免费 | student · educator · education | student_plan · free_subscription | educationEmailRequired=true · identityVerificationRequired=true | accountRequired=true | — | discountInfo「学生和教师免费使用 Figma 与 FigJam（含设计、白板协作与课堂工具）」；description「用学生 / 教师邮箱注册账号，再完成教育身份验证」 |
| 28 | Global · Notion 教育版 学生与教师免费 Plus | student · educator | student_plan · free_subscription | educationEmailRequired=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | — | discountInfo「符合条件的学生与教育工作者免费获得 Notion Plus 计划」；description「学校需被 WHED 收录，不接受学生证，K-12 学生与教师不符合资格」 |
| 29 | Global · Notion for Nonprofits 非营利组织 Business 折扣 | other | discount | identityVerificationRequired=true | manualApplication=true · accountRequired=true | — | discountInfo「通过核验的非营利组织可在 Notion Business 计划上获得折扣价」；description「提交非营利证明材料申请，审核通过后自动应用折扣」 |
| 30 | Global · ElevenLabs 免费计划 每月 10000 credits | general | free_subscription · free_credits | newUserOnly=true · identityVerificationRequired=unknown | accountRequired=true · manualApplication=false | — | discountInfo「Free 计划 $0，每月 10,000 credits，可用于 TTS、语音克隆、Dubbing 等全部产品」；description「注册即得免费额度，无需付费」 |
| 31 | Global · Runway 免费计划 一次性 125 credits | general | free_subscription · free_credits | newUserOnly=true · identityVerificationRequired=unknown | accountRequired=true · manualApplication=false | — | discountInfo「Free 计划 $0，赠送一次性 125 credits（不过期），可试用 Gen 系列视频/图像生成模型」；description「注册 Runway 账号即可获得」 |
| 32 | Global · Windsurf 学生折扣订阅 Pro（最长 12 个月） | student · developer | student_plan · discount | educationEmailRequired=true · identityVerificationRequired=true | manualApplication=true · accountRequired=true | — | 条款 §2.A「students at accredited higher education institutions」；§2.B「submit certain information…name, valid educational institution, email address, date of birth … |

> 说明两处容易被读成「漏填」的地方：
> ① `eligibilityDetail` 里显式写 `"unknown"`（如「讯飞星火」的 `newUserOnly/identityVerificationRequired`）是 captain 的 backfill 口径 —— 表示「这一维核过、没有证据」，与缺席同义但更明确；
> ② 海外条目的 `availability` 多数缺席：官方页根本没写地区条款，按 §2.5.1 第 3/4 档只能 `unknown` 或缺席，**不能写 false**。唯一的例外是 Google AI Pro 与 Anthropic Claude 两条，它们的官方页有明文地区条款。

---

## 四、deals.json 逐条（48 条优惠 + 8 条工具）

这 56 条是我这一轮逐条落盘的：`type=deal` 的 48 条覆盖「学生 / 教师 / 非营利 / 退伍军人」与「开发者 API、AI Coding、高价值额度（≥50 万 tokens 或等价）」；另 8 条是明确面向学生 / 开发者的**工具**条目（分母之外，v1.2 分类页的原料）。落盘时它们的 `provenance.credibility` 一律是 `collected`（来源是自动采集，值是我按该条自己的官方页 / 文案引文落盘的，不冒用 curated）；**17:00 那次真实 merge 之后，这 56 条的 provenance 已按契约 §5.3.2 被整块裁剪**（值一条没丢），所以下面 `provenance` 列显示「（merge 后无）」—— 逐条依据以本表末列为准。

| id | 条目 | audience | benefitType | 资格门槛 | 领取要求 | 中国可用性 | provenance | 依据（引原文，merge 之后数据里的 note 已被裁剪，依据以本表为准） |
|---|---|---|---|---|---|---|---|---|
| `2eae0e246de2` | ERNIE-4.5-Turbo-128K 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `9c12f13df3ba` | ERNIE-4.5-Turbo-32K 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `ad1d0c83909d` | ERNIE-4.5-Turbo-VL 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `8b2e8d64f11f` | ERNIE-X1-Turbo-32K 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `4d4bcb5b6829` | DeepSeek-R1 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `bf156583e97c` | DeepSeek-R1-250528 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `8814355d59e1` | DeepSeek-V3-250324 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `e384895f5935` | DeepSeek-V3.1-250821 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `e65f54470862` | DeepSeek-V3.1-Think-250821 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `9180073deef1` | Kimi-K2-Instruct 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `017bdbc04e70` | Qwen3-235B-A22B-Instruct-2507 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `8b609cb05116` | Qwen3-30B-A3B-Instruct-2507 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `78384299b660` | Qwen3-Coder-30B-A3B-Instruct 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `c4ab5c5d8101` | Qwen3-Coder-480B-A35B-Instruct 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `5c38e515a3ae` | bge-large-en 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `4c7952115477` | bge-large-zh 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `a1255b2fbae2` | qianfan-sug-8k 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「赠送 100万 Tokens…仅可抵扣预置模型在线推理消耗」→ free_credits + free_api；eligibility「千帆平台新用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true；description「访问平台并同意用户协议后自动开通发放」→ manualApplication =… |
| `e237cab7c007` | 阿里云百炼 新用户免费额度 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「各模型独立赠送免费额度（通常为 100 万 Token）」→ free_credits + free_api；eligibility「阿里云百炼新用户（需实名认证）」；description「需完成实名认证后使用」→ accountRequired；discountInfo「新用户开通百炼后…赠送」→ manualApplication = false |
| `ebd47f6d2522` | GLM-4.7-Flash 免费模型 | developer | free_model · free_api | identityVerificationRequired=true · newUserOnly=false | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「官方模型列表标注为免费模型，调用价格 0 元」→ free_model + free_api；eligibility「所有注册开发者（需实名认证开通）」→ identityVerificationRequired = true、不限新用户；description「注册并创建 API Key 后可直接调用，无需单独领取额度」→ manualApplication = fal… |
| `e7e8f538456c` | GLM-4.5-Flash 免费模型 | developer | free_model · free_api | identityVerificationRequired=true · newUserOnly=false | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「官方模型列表标注为免费模型，调用价格 0 元」→ free_model + free_api；eligibility「所有注册开发者（需实名认证开通）」→ identityVerificationRequired = true、不限新用户；description「注册并创建 API Key 后可直接调用，无需单独领取额度」→ manualApplication = fal… |
| `6798f78de5ce` | GLM-4.6V-Flash 免费模型 | developer | free_model · free_api | identityVerificationRequired=true · newUserOnly=false | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「官方模型列表标注为免费模型，调用价格 0 元」→ free_model + free_api；eligibility「所有注册开发者（需实名认证开通）」→ identityVerificationRequired = true、不限新用户；description「注册并创建 API Key 后可直接调用，无需单独领取额度」→ manualApplication = fal… |
| `f22e3cd094ad` | GLM-4.1V-Thinking-Flash 免费模型 | developer | free_model · free_api | identityVerificationRequired=true · newUserOnly=false | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「官方模型列表标注为免费模型，调用价格 0 元」→ free_model + free_api；eligibility「所有注册开发者（需实名认证开通）」→ identityVerificationRequired = true、不限新用户；description「注册并创建 API Key 后可直接调用，无需单独领取额度」→ manualApplication = fal… |
| `62e3166acec0` | GLM-4V-Flash 免费模型 | developer | free_model · free_api | identityVerificationRequired=true · newUserOnly=false | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「官方模型列表标注为免费模型，调用价格 0 元」→ free_model + free_api；eligibility「所有注册开发者（需实名认证开通）」→ identityVerificationRequired = true、不限新用户；description「注册并创建 API Key 后可直接调用，无需单独领取额度」→ manualApplication = fal… |
| `5dedb9455508` | CogView-3-Flash 免费模型 | developer | free_model · free_api | identityVerificationRequired=true · newUserOnly=false | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「官方模型列表标注为免费模型，调用价格 0 元」→ free_model + free_api；eligibility「所有注册开发者（需实名认证开通）」→ identityVerificationRequired = true、不限新用户；description「注册并创建 API Key 后可直接调用，无需单独领取额度」→ manualApplication = fal… |
| `df1210f69a39` | CogVideoX-Flash 免费模型 | developer | free_model · free_api | identityVerificationRequired=true · newUserOnly=false | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「官方模型列表标注为免费模型，调用价格 0 元」→ free_model + free_api；eligibility「所有注册开发者（需实名认证开通）」→ identityVerificationRequired = true、不限新用户；description「注册并创建 API Key 后可直接调用，无需单独领取额度」→ manualApplication = fal… |
| `f5ffff50772c` | ChatGPT / OpenAI | general | — | — | — | — | （merge 后无） | DI 原文「Free ChatGPT tier」→ general；同一条 DI 记录到官方定价页未见常设学生 / 非营利折扣 —— 这是「查过没有」的证据，不是 student 判定 |
| `c789f0a090bf` | Google Gemini | student · general | — | — | — | chinaUsable=unknown · regionRestriction=学生优惠按国家/地区而异；美国站学生优惠已于 2026-03-11 结束 | （merge 后无） | DI 原文「Free Gemini access remains available…Google AI Pro student offers vary by country；美国站学生优惠已于 2026-03-11 结束」→ student + general，并把地区差异留在 regionRestriction |
| `c05dc74bfd78` | Perplexity | student · educator | discount | studentRequired=true · identityVerificationRequired=true | — | chinaUsable=unknown | （merge 后无） | DI 原文「Education Pro is offered to verified students and educators at a discount」→ audience / benefitType / studentRequired；description「Verify student or educator status」→ identityVerificationRequired |
| `4a875a435019` | Canva | student · educator · other | free_subscription · discount | studentRequired=true · identityVerificationRequired=true | manualApplication=true | chinaUsable=unknown | （merge 后无） | DI 原文「Canva Education is free for eligible K-12 educators and students」+「eligible registered nonprofits」→ student / educator / other（枚举无 nonprofit、K-12）；description「Apply through…eligibility verificat… |
| `9c553dd82d2d` | Cursor | student · developer | — | — | — | chinaUsable=unknown | （merge 后无） | DI 原文「student page points students toward campus and online event promotions」→ student；Cursor 是 AI 编程工具 → developer（推断）。免费档不是完整订阅，benefitType 刻意留空 |
| `3c8a9a6a9ee9` | Replit | student · developer | discount | studentRequired=true | — | chinaUsable=unknown | （merge 后无） | DI 原文「student discounts such as $15 off per month for the first six months of Replit Core」→ student + discount + studentRequired |
| `6013b80f266f` | Zapier | other | discount | — | manualApplication=true | — | （merge 后无） | DI 原文「nonprofits get 15% off any paid plan」→ other（枚举无 nonprofit）+ discount；description「apply through Zapier for Nonprofits」→ manualApplication |
| `7762168d515d` | Make | other | free_subscription | — | manualApplication=true | — | （merge 后无） | DI 原文「12-month free license for eligible NGOs」→ other（枚举无 NGO）+ free_subscription；description「Apply through Make for NGOs」→ manualApplication |
| `c971e33a9cd0` | ChatGPT Plus for Veterans (OpenAI) | other | free_subscription | identityVerificationRequired=true | manualApplication=true | — | （merge 后无） | DI 原文「one full year of free ChatGPT Plus to eligible veterans and transitioning servicemembers」→ other（枚举无 veterans）+ free_subscription；「working with SheerID for verification」→ identityVerificationReq… |
| `070cad8aa770` | Verla | student | — | — | — | — | （merge 后无） | description 原文「Verla 是一款为大学生设计的作业助手」→ student |
| `c3d6bd34ebfe` | Getsolved | student · other | — | — | — | — | （merge 后无） | description 原文「面向学生、营销人员和专业人士」→ student + other（枚举无营销 / 专业人士） |
| `413a77602a7c` | Tenki Cloud | developer | — | — | — | — | （merge 后无） | description 原文「self-hosted GitHub Actions runners with automatic scaling」是开发者基础设施 → developer（推断） |
| `e3af28ce5ca1` | Emergent.sh | developer | — | — | — | — | （merge 后无） | description 原文「An IDE for code migration from legacy to modern frameworks through coding agents」→ developer（推断） |
| `28434ca44079` | Google AI Studio | developer | — | — | — | — | （merge 后无） | description 原文「A tool for AI development with diverse tools and models」→ developer（推断） |
| `97d21ff73d3e` | 智谱AI 新用户注册专享 2000万 免费 Tokens 资源包 | developer | free_credits · free_api | newUserOnly=true · identityVerificationRequired=true | accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「新用户注册专享 2000万 免费 Tokens 资源包」→ free_credits + free_api；eligibility「新注册用户（需实名认证）」→ newUserOnly / identityVerificationRequired = true |
| `1688614d6669` | 智谱AI 邀请好友注册赠送 Tokens 资源包 | developer | free_credits · developer_credit | identityVerificationRequired=true | manualApplication=false · accountRequired=true | chinaUsable=true | （merge 后无） | discountInfo「邀好友注册赠送 Tokens 资源包（最高 2 亿 Tokens）」→ free_credits + developer_credit；同一句「邀好友实名注册」→ identityVerificationRequired = true 且 manualApplication = false |
| `adcb6471a512` | 智谱AI Batch API 批量调用五折 | developer | discount | newUserOnly=false | — | — | （merge 后无） | eligibility「所有开发者（批量离线任务）」→ developer 且不限新用户；discountInfo「按标准 API 价格的五折计费」→ discount |
| `ead998e58cd9` | 智谱AI 上下文缓存存储限时免费 | developer | trial | newUserOnly=false | — | — | （merge 后无） | eligibility「所有调用智谱 API 的开发者」→ developer 且不限新用户；discountInfo「上下文缓存存储限时免费」→ trial |
| `1888ab62bd67` | Doubao-Seed-Character 免费额度 | developer | free_credits · free_api | — | — | — | （merge 后无） | 模型 API 平台产品页的免费额度 → audience = developer（推断）；额度本身按 discountInfo 原文 → free_credits + free_api。该条 eligibility 字段本身为空，门槛类字段一律不写；额度原文「火山方舟免费额度（文本生成）：50万tokens」 |
| `d6aaee8c7379` | Doubao-Seedream-5.0-lite 免费额度 | developer | free_credits · free_api | — | — | — | （merge 后无） | 模型 API 平台产品页的免费额度 → audience = developer（推断）；额度本身按 discountInfo 原文 → free_credits + free_api。该条 eligibility 字段本身为空，门槛类字段一律不写；额度原文「火山方舟免费额度（图像生成）：50张」 |
| `45ead69d60cc` | Doubao-Seedream-4.5 免费额度 | developer | free_credits · free_api | — | — | — | （merge 后无） | 模型 API 平台产品页的免费额度 → audience = developer（推断）；额度本身按 discountInfo 原文 → free_credits + free_api。该条 eligibility 字段本身为空，门槛类字段一律不写；额度原文「火山方舟免费额度（图像生成）：200张」 |
| `7f8c32f6a327` | Doubao-Seedream-4.0 免费额度 | developer | free_credits · free_api | — | — | — | （merge 后无） | 模型 API 平台产品页的免费额度 → audience = developer（推断）；额度本身按 discountInfo 原文 → free_credits + free_api。该条 eligibility 字段本身为空，门槛类字段一律不写；额度原文「火山方舟免费额度（图像生成）：200张」 |
| `47a4c57f3a15` | Doubao-语音合成 免费额度 | developer | free_credits · free_api | — | — | — | （merge 后无） | 模型 API 平台产品页的免费额度 → audience = developer（推断）；额度本身按 discountInfo 原文 → free_credits + free_api。该条 eligibility 字段本身为空，门槛类字段一律不写；额度原文「火山方舟免费额度（语音模型）：5000字符」 |
| `57847fbcc1ed` | Doubao-声音复刻 免费额度 | developer | free_credits · free_api | — | — | — | （merge 后无） | 模型 API 平台产品页的免费额度 → audience = developer（推断）；额度本身按 discountInfo 原文 → free_credits + free_api。该条 eligibility 字段本身为空，门槛类字段一律不写；额度原文「火山方舟免费额度（语音模型）：5000字符 + 10复刻声音」 |
| `2db62eb1a8a0` | Doubao-流式语音识别 免费额度 | developer | free_credits · free_api | — | — | — | （merge 后无） | 模型 API 平台产品页的免费额度 → audience = developer（推断）；额度本身按 discountInfo 原文 → free_credits + free_api。该条 eligibility 字段本身为空，门槛类字段一律不写；额度原文「火山方舟免费额度（语音模型）：20小时」 |
| `8dada3205ed8` | Doubao-录音文件识别 免费额度 | developer | free_credits · free_api | — | — | — | （merge 后无） | 模型 API 平台产品页的免费额度 → audience = developer（推断）；额度本身按 discountInfo 原文 → free_credits + free_api。该条 eligibility 字段本身为空，门槛类字段一律不写；额度原文「火山方舟免费额度（语音模型）：20小时」 |
| `407572a1e046` | Doubao-embedding-vision 免费额度 | developer | free_credits · free_api | — | — | — | （merge 后无） | 模型 API 平台产品页的免费额度 → audience = developer（推断）；额度本身按 discountInfo 原文 → free_credits + free_api。该条 eligibility 字段本身为空，门槛类字段一律不写；额度原文「火山方舟免费额度（向量模型）：50万tokens」 |
| `4e659666cbb2` | 联网资源 免费额度 | developer | free_credits · free_api | — | — | — | （merge 后无） | 模型 API 平台产品页的免费额度 → audience = developer（推断）；额度本身按 discountInfo 原文 → free_credits + free_api。该条 eligibility 字段本身为空，门槛类字段一律不写；额度原文「火山方舟免费额度（联网插件）：2万次/月」 |
| `4caf88e30671` | 火山方舟 协作奖励计划：每日免费领取单模型最高 500 万 Tokens | developer | free_credits · developer_credit | — | accountRequired=true | — | （merge 后无） | discountInfo「可免费领取单模型每日最高 500万 Tokens」→ free_credits + developer_credit（协作奖励）；eligibility「火山方舟用户」→ accountRequired |
| `c694e7c5f125` | 火山方舟 Agent Plan 限时 9.9 元起 | developer | discount | — | accountRequired=true | — | （merge 后无） | discountInfo「方舟 Agent Plan 限时首月 9.9 元起」→ discount；eligibility「火山方舟用户（首月优惠）」→ accountRequired |
| `e4bd8003b3d6` | GLM-5.3-Flash 限时五折 | developer | discount | newUserOnly=false | — | — | （merge 后无） | eligibility「所有调用 GLM-5.3-Flash 的开发者」→ developer 且不限新用户；discountInfo「GLM-5.3-Flash…限时五折」→ discount |

---

## 五、三张清单

### 5.1 判断为 `student` 的条目

1. **GitHub Copilot 学生免费（Copilot Student）** — `curated_global` · audience=[student, developer]
2. **GitHub Student Developer Pack 学生开发者工具包** — `curated_global` · audience=[student, developer]
3. **Google AI Pro 学生免费 12 个月（含 Gemini 高级版）** — `curated_global` · audience=[student]
4. **Microsoft Azure for Students 学生免费 100 美元额度** — `curated_global` · audience=[student, developer]
5. **微软 Microsoft 365 教育版 学生 5 折（含 Copilot）** — `curated_global` · audience=[student, educator]
6. **Figma for Education 学生与教师免费** — `curated_global` · audience=[student, educator, education]
7. **Notion 教育版 学生与教师免费 Plus** — `curated_global` · audience=[student, educator]
8. **Windsurf 学生折扣订阅 Pro（最长 12 个月）** — `curated_global` · audience=[student, developer]
9. **Google Gemini** — `deals.json` · `c789f0a090bf` · audience=[student, general]
10. **Perplexity** — `deals.json` · `c05dc74bfd78` · audience=[student, educator]
11. **Canva** — `deals.json` · `4a875a435019` · audience=[student, educator, other]
12. **Cursor** — `deals.json` · `9c553dd82d2d` · audience=[student, developer]
13. **Replit** — `deals.json` · `3c8a9a6a9ee9` · audience=[student, developer]
14. **Verla** — `deals.json` · `070cad8aa770` · audience=[student]
15. **Getsolved** — `deals.json` · `c3d6bd34ebfe` · audience=[student, other]

### 5.2 判断为 `developer` 的条目

1. **火山方舟 豆包全系模型 个人开发者 50 万 tokens 免费额度** — `curated_cn` · audience=[developer]
2. **腾讯混元 新用户 100 万 tokens 免费资源包** — `curated_cn` · audience=[developer]
3. **讯飞星火 Spark Lite 轻量级大模型免费使用** — `curated_cn` · audience=[developer]
4. **讯飞开放平台 新手免费福利礼包** — `curated_cn` · audience=[developer]
5. **Kimi 开放平台 新用户 15 元代金券** — `curated_cn` · audience=[developer]
6. **商汤日日新 Token Plan 首月限时免费** — `curated_cn` · audience=[developer]
7. **硅基流动 免费模型专区** — `curated_cn` · audience=[developer]
8. **阶跃星辰 StepAudio 3 语音大模型限时免费** — `curated_cn` · audience=[developer]
9. **百川智能 海纳百川计划 免费使用 M3Plus API** — `curated_cn` · audience=[developer]
10. **扣子 Coze 新用户首次注册赠送 1500 活动积分** — `curated_cn` · audience=[developer]
11. **扣子 Coze 个人版每日登录赠送 1500 活动积分** — `curated_cn` · audience=[developer]
12. **扣子 Coze 部分模型限时免费 每模型 100 次/天** — `curated_cn` · audience=[developer]
13. **扣子 Coze 官方付费插件每日免费额度 10-30 次/天** — `curated_cn` · audience=[developer]
14. **360智脑开放平台 新用户获赠体验券/代金券（官方协议条款）** — `curated_cn` · audience=[developer]
15. **MiniMax 开放平台 Token Plan 好友邀请 受邀人 9 折** — `curated_cn` · audience=[developer]
16. **MiniMax MiniMax-M3 按量计费永久五折** — `curated_cn` · audience=[developer]
17. **魔搭 ModelScope API-Inference 免费推理 API（动态限流）** — `curated_cn` · audience=[developer]
18. **GitHub Copilot 学生免费（Copilot Student）** — `curated_global` · audience=[student, developer]
19. **GitHub Copilot 教师与开源维护者免费 Pro** — `curated_global` · audience=[educator, developer]
20. **GitHub Student Developer Pack 学生开发者工具包** — `curated_global` · audience=[student, developer]
21. **Microsoft Azure for Students 学生免费 100 美元额度** — `curated_global` · audience=[student, developer]
22. **AWS Activate 初创公司最高 20 万美元云 credits** — `curated_global` · audience=[developer]
23. **Windsurf 学生折扣订阅 Pro（最长 12 个月）** — `curated_global` · audience=[student, developer]
24. **ERNIE-4.5-Turbo-128K 新用户免费额度** — `deals.json` · `2eae0e246de2` · audience=[developer]
25. **ERNIE-4.5-Turbo-32K 新用户免费额度** — `deals.json` · `9c12f13df3ba` · audience=[developer]
26. **ERNIE-4.5-Turbo-VL 新用户免费额度** — `deals.json` · `ad1d0c83909d` · audience=[developer]
27. **ERNIE-X1-Turbo-32K 新用户免费额度** — `deals.json` · `8b2e8d64f11f` · audience=[developer]
28. **DeepSeek-R1 新用户免费额度** — `deals.json` · `4d4bcb5b6829` · audience=[developer]
29. **DeepSeek-R1-250528 新用户免费额度** — `deals.json` · `bf156583e97c` · audience=[developer]
30. **DeepSeek-V3-250324 新用户免费额度** — `deals.json` · `8814355d59e1` · audience=[developer]
31. **DeepSeek-V3.1-250821 新用户免费额度** — `deals.json` · `e384895f5935` · audience=[developer]
32. **DeepSeek-V3.1-Think-250821 新用户免费额度** — `deals.json` · `e65f54470862` · audience=[developer]
33. **Kimi-K2-Instruct 新用户免费额度** — `deals.json` · `9180073deef1` · audience=[developer]
34. **Qwen3-235B-A22B-Instruct-2507 新用户免费额度** — `deals.json` · `017bdbc04e70` · audience=[developer]
35. **Qwen3-30B-A3B-Instruct-2507 新用户免费额度** — `deals.json` · `8b609cb05116` · audience=[developer]
36. **Qwen3-Coder-30B-A3B-Instruct 新用户免费额度** — `deals.json` · `78384299b660` · audience=[developer]
37. **Qwen3-Coder-480B-A35B-Instruct 新用户免费额度** — `deals.json` · `c4ab5c5d8101` · audience=[developer]
38. **bge-large-en 新用户免费额度** — `deals.json` · `5c38e515a3ae` · audience=[developer]
39. **bge-large-zh 新用户免费额度** — `deals.json` · `4c7952115477` · audience=[developer]
40. **qianfan-sug-8k 新用户免费额度** — `deals.json` · `a1255b2fbae2` · audience=[developer]
41. **阿里云百炼 新用户免费额度** — `deals.json` · `e237cab7c007` · audience=[developer]
42. **GLM-4.7-Flash 免费模型** — `deals.json` · `ebd47f6d2522` · audience=[developer]
43. **GLM-4.5-Flash 免费模型** — `deals.json` · `e7e8f538456c` · audience=[developer]
44. **GLM-4.6V-Flash 免费模型** — `deals.json` · `6798f78de5ce` · audience=[developer]
45. **GLM-4.1V-Thinking-Flash 免费模型** — `deals.json` · `f22e3cd094ad` · audience=[developer]
46. **GLM-4V-Flash 免费模型** — `deals.json` · `62e3166acec0` · audience=[developer]
47. **CogView-3-Flash 免费模型** — `deals.json` · `5dedb9455508` · audience=[developer]
48. **CogVideoX-Flash 免费模型** — `deals.json` · `df1210f69a39` · audience=[developer]
49. **Cursor** — `deals.json` · `9c553dd82d2d` · audience=[student, developer]
50. **Replit** — `deals.json` · `3c8a9a6a9ee9` · audience=[student, developer]
51. **Tenki Cloud** — `deals.json` · `413a77602a7c` · audience=[developer]
52. **Emergent.sh** — `deals.json` · `e3af28ce5ca1` · audience=[developer]
53. **Google AI Studio** — `deals.json` · `28434ca44079` · audience=[developer]
54. **智谱AI 新用户注册专享 2000万 免费 Tokens 资源包** — `deals.json` · `97d21ff73d3e` · audience=[developer]
55. **智谱AI 邀请好友注册赠送 Tokens 资源包** — `deals.json` · `1688614d6669` · audience=[developer]
56. **智谱AI Batch API 批量调用五折** — `deals.json` · `adcb6471a512` · audience=[developer]
57. **智谱AI 上下文缓存存储限时免费** — `deals.json` · `ead998e58cd9` · audience=[developer]
58. **Doubao-Seed-Character 免费额度** — `deals.json` · `1888ab62bd67` · audience=[developer]
59. **Doubao-Seedream-5.0-lite 免费额度** — `deals.json` · `d6aaee8c7379` · audience=[developer]
60. **Doubao-Seedream-4.5 免费额度** — `deals.json` · `45ead69d60cc` · audience=[developer]
61. **Doubao-Seedream-4.0 免费额度** — `deals.json` · `7f8c32f6a327` · audience=[developer]
62. **Doubao-语音合成 免费额度** — `deals.json` · `47a4c57f3a15` · audience=[developer]
63. **Doubao-声音复刻 免费额度** — `deals.json` · `57847fbcc1ed` · audience=[developer]
64. **Doubao-流式语音识别 免费额度** — `deals.json` · `2db62eb1a8a0` · audience=[developer]
65. **Doubao-录音文件识别 免费额度** — `deals.json` · `8dada3205ed8` · audience=[developer]
66. **Doubao-embedding-vision 免费额度** — `deals.json` · `407572a1e046` · audience=[developer]
67. **联网资源 免费额度** — `deals.json` · `4e659666cbb2` · audience=[developer]
68. **火山方舟 协作奖励计划：每日免费领取单模型最高 500 万 Tokens** — `deals.json` · `4caf88e30671` · audience=[developer]
69. **火山方舟 Agent Plan 限时 9.9 元起** — `deals.json` · `c694e7c5f125` · audience=[developer]
70. **GLM-5.3-Flash 限时五折** — `deals.json` · `e4bd8003b3d6` · audience=[developer]

### 5.3 两者兼具（`["student","developer"]`）的条目

1. **GitHub Copilot 学生免费（Copilot Student）** — `curated_global` · audience=[student, developer]
2. **GitHub Student Developer Pack 学生开发者工具包** — `curated_global` · audience=[student, developer]
3. **Microsoft Azure for Students 学生免费 100 美元额度** — `curated_global` · audience=[student, developer]
4. **Windsurf 学生折扣订阅 Pro（最长 12 个月）** — `curated_global` · audience=[student, developer]
5. **Cursor** — `deals.json` · `9c553dd82d2d` · audience=[student, developer]
6. **Replit** — `deals.json` · `3c8a9a6a9ee9` · audience=[student, developer]

---

## 六、刻意没填的条目与原因

- **deals.json 里完全没写六字段的 46 条**（全部是聚合站工具条目，没有优惠文案也没有人群证据）：aitools.fyi 13 条、Futuretools 30 条、Futurepedia 3 条
- **没有对应人群枚举的群体按 `other` 记，而不是留空**：非营利组织 / NGO 归 `other`、初创公司归 `other`（curated 侧 captain 判为 developer）、退伍军人归 `other`，每一处都在 provenance note 里写明「枚举无 X，归入 Y」。本版实测「写了别的字段却没有 audience」的条数为 0 条
- **`claimRequirements.creditCardRequired` 全仓只有 2 条有值**：Azure for Students「均无需信用卡」= `false`、Windsurf 条款 §2.B「payment details」= `true`。其余优惠一律不写 —— **不知道要不要卡 ≠ 不要卡**；这一维是覆盖率最低的一维（1/80），它只能靠下一轮去官方页逐条查，不能在数据层猜
- **`manualApplication` 只在原文明说时才写**：deals.json 里 44 条有值（「自动开通发放 / 无需单独领取 / 即可直接调用」→ false；curated 侧「提交申请、审核通过」→ true），其余缺席
- **`eligibilityDetail` 全程缺席的 22 条**：原文只说了谁是受众、没说领取门槛（如火山方舟免费额度表 10 条），不替它编 newUserOnly / identityVerificationRequired
- **`availability.chinaUsable` 写 unknown 的 7 条**：这些条目的原文都核过，确实没有地区 / 身份依据（Layer3Labs 的全球折扣条目就在其中），写 unknown 是「查过没有证据」，不是「不可用」

补充几条**单点**的刻意留空：

- **`讯飞开放平台 新手免费福利礼包`**：原文「部分权益需完成认证」——**没说是哪种认证**（企业认证、邮箱认证都叫认证），按 §2.5.1 第 4 档 → `identityVerificationRequired` 不写，`availability` 也缺席。
- **`360智脑`**：「需 360 账号、绑定手机号」——原文没写「**大陆**手机号」、也没写「实名认证」，证据不到第二档 → `chinaUsable` 保持 `unknown`，理由已写进 note。
- **`Cursor`**：`benefitType` 不写。原文只说「anyone can start free」，免费档不是完整订阅，枚举里没有 `free_tier` 这种值；`studentRequired` 也不写（DI 只说学生页指向校园活动，没有一句说领取门槛）。宁可两处空着，也不套一个看起来完整的错值。
- **`火山方舟` 免费额度 10 条**：这些条目**自己的 `eligibility` 字段就是空的**（采集器没抓到），所以 `newUserOnly` / `identityVerificationRequired` / `accountRequired` 一律不写 —— 它们只说「有 50 万 tokens 免费额度」，那就只写 `audience` + `benefitType`。
- **`Perplexity` / `Canva` / `Cursor` / `Replit` 的 `availability` = `unknown`（不是 `false`）**：它们来自全球折扣聚合站，页面没有地区条款；写 `false` 就是「把没查到写成不可用」，正是本阶段要根除的错误。
- **`Microsoft Azure for Students` 的 `identityVerificationRequired`**：原文只说「用学校邮箱注册」，没说要不要实名 → 不写（只写 `educationEmailRequired: true`）。
- **`Figma` / `Notion 教育版` 的 `regionRestriction`**：官方页没有地区条款 → 整块不写（`availability` 缺席 = 不渲染该行，也不假装查过）。

---

## 七、裁决记录与口径分歧（可核）

1. **`chinaUsable` 的两次修正（captain 裁决）**：
   - 第一次：裁定「只有来源**明写**地区条款才写值，其余一律 `unknown`」，撤掉我 27 条 + 自己 6 条 `true`；
   - 第二次（本轮）：captain 逐条复核证据后修正为**四档**（写进契约 §2.5.1），其中「明写实名认证 / 大陆手机号绑定」→ `true`（`inferred` + note）—— 27 条按这一档恢复，curated 侧我又补了 3 条（腾讯混元「通过腾讯云实名认证」、Kimi「需实名认证」、魔搭「该阿里云账号已通过实名认证」）。
   - 我按下这把尺子**没有**恢复的两条，理由同上 §六：讯飞（「完成认证」不指明种类）、360智脑（只写「绑定手机号」）。
2. **`manualApplication`**：captain 口径 = 原文明说「自动发放 / 无需领取 / 即可调用」才写 `false`。我据此在 deals.json 补了 26 条 `false`（百度千帆 17、智谱免费模型 7、阿里云百炼、智谱邀请各 1），并把 curated 侧原文写着「申请 / 审核 / 提交资料 / 需数天」的 5 条补成 `true`（Anthropic、Copilot 学生、Student Pack、Notion 非营利、Windsurf）—— captain 的 backfill 因 `DROP_DEFAULTS` 把它们一起删掉了，这一处是我在它之上做的定向补值。
3. **与 `scripts/tools/audience-backfill.js`（captain 写）的差异**：我在 curated 两文件上只做了 12 处定向补值（4 条 `availability` + 5 条 `manualApplication: true` + Notion 教育 `manualApplication: false` + Azure `creditCardRequired: false` + Google 的 `availability` provenance 由 `source/stated` 改 `inferred/inferred` + note）。**其余值一律以 backfill 的落盘为准**，我没有整体重写。若该脚本再跑一次，这 12 处会被它的 `DROP_DEFAULTS` 覆盖掉 —— 建议把这几条并入它的 `ENTRIES`（见 §九）。
4. **Google AI Pro 的 `chinaUsable: false`**：值保留（captain 裁定「官方有明文地区条款」），但它的 `provenance.fields.availability` 我改成了 `basis:"inferred"` + note：来源写的是「美国为 AI Pro、美国以外为 AI Plus」，**没有逐国列出可用清单**，把 `false` 定性为引述并不成立，定性为推断才与数据一致。

---

## 八、验收（逐条实跑）

| 命令 | 结果 |
|---|---|
| `node scripts/validate.js --strict` | **exit 0** · ✅ 校验通过（strict 模式）· 「受众字段落空 0 处」 |
| `node scripts/tools/audience-report.js` | **exit 0**（分母 80 优惠 / 54 工具） |
| `npm test`（= `node scripts/validate.js`） | exit 0 |
| 既有字段核验（逐条比对 `git show HEAD:deals.json` 与当前文件，剥掉六个新字段后比 JSON） | 我的写入是纯追加（merge 之前实测：删行只有 `"verifiedAt"` 尾随逗号那一种）。**17:00 的 merge 之后**：134 条里 32 条既有字段有变化，全部是策展记录，变化的键只有 `firstSeen`（→ 2026-09-29）与 `sourceUrl`（→ null）两个，属 merge 侧行为（见 §一 / §九.5） |

覆盖率实测（分母 = `type === 'deal'` 的 80 条优惠，全部来自 17:00 那次真实 merge 之后的 `deals.json`）：

| 指标 | 数字 |
|---|---|
| 学生适用信息 | 12/80（15.0%） |
| 开发者适用信息 | 67/80（83.8%） |
| audience 覆盖（任一） | 80/80（100.0%） |
| benefitType 覆盖 | 79/80（98.8%） |
| **信用卡要求** | 1/80（1.3%）—— Azure 的 `false` 是唯一一条由原文直接给出的「不需要卡」 |
| **中国可用性** | 31/80（38.8%）· 另有 6 条写 `"unknown"`（查过、没有证据） |
| **有已知值但无 provenance** | **56 条**（有已知值的共 88 条） |

三件事要说清，否则数字会被读反：

- **merge 已经把书写期的值带进发布期**：17:00 那次真实 merge 之后，curated 两文件的六字段已经进了 `deals.json`（学生覆盖 4 → 12、信用卡 0 → 1、中国可用性 27 → 31，audience 80/80）。**没有采用手工镜像**（captain 判定那是错修法：`deals.json` 是 merge 产物）。
- **`有已知值但无 provenance` = 56 条，不是漏写**：这 56 条全是**采集条目**，我在落盘时逐条写了 `credibility: collected` + `basis/derived/note` 的 provenance；merge 按契约 §5.3.2 / §5.3.3 的「宁可不写出处、也不写一个错的出处」把它们裁掉了（fresh 侧赢了记录、六个字段的值却来自 existing 侧，于是 `fields` 被整块裁剪），**值本身一条没丢**。merge 之前这个数字是 0。逐条依据因此只活在本报告 §四（这也是我把引文抄进报告的原因）。
- **书写期 vs 发布期（契约 §5.3.3）**：`audience-report` 显示书写期 32/32 条有 provenance，发布期 32/80（40.0%）。这与契约预言的「发布期低于书写期是预期」一致 —— 差值 56 条正是上面那批被裁剪的采集条目。

---

## 九、残余风险与给下一棒的动作

1. **curated → deals.json 的搬运已经由真实 merge 完成**（17:00，t4 的 verify 链路上跑的）。结果符合契约：**值全部保留，provenance 按 §5.3.2 裁剪**。后续每次 `collect` 只要采集侧赢下记录，这个裁剪会重演 —— 也就是说 deals.json 里那 56 条的依据会**反复消失**。若团队希望这些依据长期在线，需要的是把「单来源字段的 `fields` 条目应当保留」（契约 §5.3.2 第一句）在 merge 里落实，而不是靠人工回填 `deals.json`（回填会在下一次 merge 再被裁掉）。这条留给 v1.2 / dedup 侧定夺，我这一轮不改 merge。
2. **`audience-backfill.js` 若重跑，会覆盖我在 curated 侧做的 12 处定向补值**（Azure 的 `creditCardRequired: false`、5 条 `manualApplication: true`、Notion 教育的 `manualApplication: false`、4 条 `availability`、Google 的 provenance 定性）。建议把这几条并入它的 `ENTRIES` 表，否则每次重跑都要人工补一遍。
3. **`creditCardRequired` 是全仓覆盖最低的一维（1/80）**。它不能被推断补上：「没写要不要卡」只能留空。要提覆盖率只能去官方页逐条查支付方式 —— 这是下一轮（v1.2）的采集侧工作，不该在数据层猜。
4. **本报告里的「依据」是引文摘要**；落盘时逐字段的完整依据写在数据的 `provenance.fields[*].note` 里（≤200 字），curated 两文件至今保留着它们；deals.json 侧因 merge 裁剪已不在数据里，故以本报告 §四 末列为准。
5. **【需要 captain / t4 定夺】merge 会把 32 条策展记录的 `firstSeen` 刷成当天**（本次 `2026-09-21/22/23` → `2026-09-29`），并把它们原有的 `sourceUrl`（layer3labs / futuretools）置空。机制是 `loadCurated → makeDeal`：策展原始文件不带 `firstSeen`，`makeDeal` 按今天盖章，merge 后策展侧赢记录于是覆盖了既有值。若不修，策展条目的「首次收录日期」每 merge 一次就重置一次 —— 这是个会持续产生错误日期的口子，不是我这边的字段。我没有改它（不在 t3 范围内，且 `deals.json` 是 merge 产物）。

---

_报告生成：`t3 [data]`（attempt 6598ec3b-de61-4483-b7c1-216634ebd83b）· 覆盖率数字取自 `node scripts/tools/audience-report.js` 与 `node scripts/validate.js --strict` 的实测输出。_
