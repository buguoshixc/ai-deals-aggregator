# t15 · 新增记录 evidence 引文的逐段复核（页面骨架比对）

## [MIXED] aws/Amazon Q Developer Free Tier · billing.regularPrice
   引文原文："Amazon Q Developer offers a perpetual Free Tier with monthly limits … Free — 50 agentic requests per month ; 1,000 lines of code per month"
   - 整段命中："Amazon Q Developer offers a perpetual Free Tier with monthly limits"
   - **未整段命中**（最长 25/50）："50 agentic requests per month ; 1,000 lines of code per month"

## [MIXED] aws/Amazon Q Developer Pro · billing.regularPrice
   引文原文："Pro Tier: Expanded limits $19/mo. per user ; Pro — 4,000 lines of code per month per user pooled at account level. Extra lines of code available at $.003 per line of code submitted."
   - **未整段命中**（最长 36/40）："Pro Tier: Expanded limits $19/mo. per user ; Pro"
   - 整段命中："4,000 lines of code per month per user pooled at account level. Extra lines of code available at $.003 per line of code submitted."

## [PARAPHRASE] aws/Amazon Q Developer Pro · restrictions
   引文原文："On April 30, 2027, AWS will discontinue support for Amazon Q Developer IDE plugins. For capabilities similar to Amazon Q Developer IDE plugins, explore Kiro to access the latest models and features."
   - **未整段命中**（最长 166/167）："On April 30, 2027, AWS will discontinue support for Amazon Q Developer IDE plugins. For capabilities similar to Amazon Q Developer IDE plugins, explor"

## [NO_FETCH] google/Gemini Code Assist Enterprise · billing.regularPrice
   本环境抓不到 https://codeassist.google/（网络路径限制），无法复核。

## [NO_FETCH] google/Gemini Code Assist Standard · billing.regularPrice
   本环境抓不到 https://codeassist.google/（网络路径限制），无法复核。

## [MIXED] iflytek/讯飞星辰 MaaS · Astron Coding Plan 速通版 · billing.regularPrice
   引文原文："| **速通版** | ¥999 / 月，限时首月优惠：¥699 / 月 | [讯飞星辰 MaaS 平台套餐订阅页面]展示为准 | 每订阅月：最多约 30,000 次请求 |"
   - 整段命中："¥999 / 月，限时首月优惠：¥699 / 月"
   - **未整段命中**（最长 16/22）："[讯飞星辰 MaaS 平台套餐订阅页面]展示为准"
   - 整段命中："每订阅月：最多约 30,000 次请求"

## [MIXED] iflytek/讯飞星辰 MaaS · Astron Coding Plan 高效版 · billing.regularPrice
   引文原文："| **高效版** | ¥199 / 月 | [讯飞星辰 MaaS 平台套餐订阅页面]展示为准 | 每 5 小时：最多约 6,000 次请求；每周：最多约 45,000 次请求；每订阅月：最多约 90,000 次请求 |"
   - **未整段命中**（最长 16/22）："[讯飞星辰 MaaS 平台套餐订阅页面]展示为准"
   - 整段命中："每 5 小时：最多约 6,000 次请求"
   - 整段命中："每周：最多约 45,000 次请求"
   - 整段命中："每订阅月：最多约 90,000 次请求"

## [MIXED] jetbrains/JetBrains AI Pro · billing.regularPrice
   引文原文："\"code\": \"AIP\" … \"prices\": {\"personal\": {\"yearlyPerMonth\": [\"US $8.33\"], \"monthly\": [\"US $10.00\"]}, \"commercial\": {\"monthly\": [\"US $20.00\"]}} … \"name\": \"JetBrains AI Pro\""
   - 整段命中："\"code\": \"AIP\""
   - **未整段命中**（最长 29/113）："\"prices\": {\"personal\": {\"yearlyPerMonth\": [\"US $8.33\"], \"monthly\": [\"US $10.00\"]}, \"commercial\": {\"monthly\": [\"US $20.00\"]}}"
   - 整段命中："\"name\": \"JetBrains AI Pro\""

## [MIXED] jetbrains/JetBrains AI Ultimate · billing.regularPrice
   引文原文："\"code\": \"AIPU\" … \"prices\": {\"personal\": {\"monthly\": [\"US $30.00\"]}, \"commercial\": {\"monthly\": [\"US $60.00\"]}} … \"name\": \"JetBrains AI Ultimate\""
   - 整段命中："\"code\": \"AIPU\""
   - **未整段命中**（最长 23/84）："\"prices\": {\"personal\": {\"monthly\": [\"US $30.00\"]}, \"commercial\": {\"monthly\": [\"US $60.00\"]}}"
   - 整段命中："\"name\": \"JetBrains AI Ultimate\""

## [PARAPHRASE] replit/Core · billing.regularPrice
   引文原文："Core $20 / $18 / month, billed annually — ✔ AI integrations ✔ Up to 30 hours of chat on Free Mode ✔ Up to 60 projects on Free Mode ✔ $20 towards most powerful models ✔ Plan mode ✔ Unlimited workspaces"
   - **未整段命中**（最长 24/32）："Core $20 / $18 / month, billed annually"
   - **未整段命中**（最长 28/126）："✔ AI integrations ✔ Up to 30 hours of chat on Free Mode ✔ Up to 60 projects on Free Mode ✔ $20 towards most powerful models ✔ Plan mode ✔ Unlimited wo"

## [PARAPHRASE] replit/Pro · billing.regularPrice
   引文原文："Pro $100 / $90 / month, billed annually — ✔ 10 parallel agents ✔ Premium Support ✔ Even more Free Mode usage ✔ $100 towards most powerful models ✔ Up to 15 collaborators"
   - **未整段命中**（最长 24/32）："Pro $100 / $90 / month, billed annually"
   - **未整段命中**（最长 29/104）："✔ 10 parallel agents ✔ Premium Support ✔ Even more Free Mode usage ✔ $100 towards most powerful models ✔ Up to 15 collaborators"

## [VERBATIM] stepfun/Step Plan · Flash Max · billing.regularPrice
   引文原文："| **Flash Max** | 高强度使用 AI 的专业用户 | 40000M | ¥699 | ¥1889 | ¥6666 |"
   - 整段命中："**Flash Max**"
   - 整段命中："高强度使用 AI 的专业用户"

## [VERBATIM] stepfun/Step Plan · Flash Max · quota.amount
   引文原文："Credit 与支付金额按 **1M Credit = ¥1** 换算（即 100 万 Credit 对应 ¥1 的模型用量）"
   - 整段命中："Credit 与支付金额按 **1M Credit = ¥1** 换算（即 100 万 Credit 对应 ¥1 的模型用量）"

## [VERBATIM] stepfun/Step Plan · Flash Mini · billing.regularPrice
   引文原文："| **Flash Mini** | 入门体验 AI 的用户 | 400M | ¥49 | ¥129 | ¥456 |"
   - 整段命中："**Flash Mini**"
   - 整段命中："入门体验 AI 的用户"

## [VERBATIM] stepfun/Step Plan · Flash Mini · quota.amount
   引文原文："Credit 与支付金额按 **1M Credit = ¥1** 换算（即 100 万 Credit 对应 ¥1 的模型用量）"
   - 整段命中："Credit 与支付金额按 **1M Credit = ¥1** 换算（即 100 万 Credit 对应 ¥1 的模型用量）"

## [VERBATIM] stepfun/Step Plan · Flash Plus · billing.regularPrice
   引文原文："| **Flash Plus** | 日常使用 AI 提效的用户 | 1600M | ¥99 | ¥269 | ¥936 |"
   - 整段命中："**Flash Plus**"
   - 整段命中："日常使用 AI 提效的用户"

## [VERBATIM] stepfun/Step Plan · Flash Plus · quota.amount
   引文原文："Credit 与支付金额按 **1M Credit = ¥1** 换算（即 100 万 Credit 对应 ¥1 的模型用量）"
   - 整段命中："Credit 与支付金额按 **1M Credit = ¥1** 换算（即 100 万 Credit 对应 ¥1 的模型用量）"

## [VERBATIM] stepfun/Step Plan · Flash Pro · billing.regularPrice
   引文原文："| **Flash Pro** | 高频使用 AI 的深度用户 | 8000M | ¥199 | ¥539 | ¥1860 |"
   - 整段命中："**Flash Pro**"
   - 整段命中："高频使用 AI 的深度用户"

## [VERBATIM] stepfun/Step Plan · Flash Pro · quota.amount
   引文原文："Credit 与支付金额按 **1M Credit = ¥1** 换算（即 100 万 Credit 对应 ¥1 的模型用量）"
   - 整段命中："Credit 与支付金额按 **1M Credit = ¥1** 换算（即 100 万 Credit 对应 ¥1 的模型用量）"

## [RECONSTRUCTED] api:cerebras/undefined · pricing.currency
   引文原文："$X.XX/M tokens（每百万 token）—— GPT OSS 120B $0.35 / $0.75；Qwen 3.8 27B $0.99 / $1.49（Developer 档逐字）"
   - **未整段命中**（最长 8/24）："$X.XX/M tokens（每百万 token）—"
   - **未整段命中**（最长 10/21）："GPT OSS 120B $0.35 / $0.75"
   - **未整段命中**（最长 10/35）："Qwen 3.8 27B $0.99 / $1.49（Developer 档逐字）"

## [PARAPHRASE] api:fireworks/undefined · pricing.currency
   引文原文："(USD per 1M tokens) —— Model | Standard | Priority；Ember-1 3 / 15；Kimi K3 3 / 15；GLM 5.3 1.4 / 4.4（官方 serverless pricing 页逐字）"
   - **未整段命中**（最长 16/17）："(USD per 1M tokens) —"
   - **未整段命中**（最长 7/11）："Ember-1 3 / 15"
   - **未整段命中**（最长 6/10）："Kimi K3 3 / 15"
   - **未整段命中**（最长 17/37）："GLM 5.3 1.4 / 4.4（官方 serverless pricing 页逐字）"

## [NO_FETCH] api:groq/undefined · pricing.currency
   本环境抓不到 https://console.groq.com/docs/models（网络路径限制），无法复核。

## [NO_FETCH] api:together/undefined · pricing.currency
   本环境抓不到 https://docs.together.ai/docs/serverless/models.md（网络路径限制），无法复核。

## 统计：{"MIXED":6,"PARAPHRASE":4,"NO_FETCH":4,"VERBATIM":8,"RECONSTRUCTED":1}
