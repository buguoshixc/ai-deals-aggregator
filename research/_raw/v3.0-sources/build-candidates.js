#!/usr/bin/env node
/**
 * 由联网取证快照（probe.js 产出的 index.json）生成两份候选登记：
 *   research/v3.0-source-candidates.json  —— 机器可读（coverage-report.js 读它）
 *   research/v3.0-source-candidates.md    —— 人工可读（题面 §C3 要求的报告）
 *
 * 为什么由脚本生成而不是手抄：40 个来源的「静态字节数 / 渲染后正文长度 / 表格数 / 价格命中数 /
 * 登录墙 / 是否 JS」都是探针实测出来的数字。手抄一遍就会与快照不一致，而那正是题面 §C3
 * 「检查过但没收录的过程不能丢」要防的事。**决策（采信 / 未采信 / 已覆盖）与失败原因是人工写的**，
 * 写在下面 DECISIONS 表里，一条一条对着快照写。
 *
 * 用法：node research/_raw/v3.0-sources/build-candidates.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const OUT_DIR = __dirname;
const RESEARCH = path.join(__dirname, '..', '..');
const INDEX = path.join(OUT_DIR, 'index.json');

/**
 * 人工决策表。字段含义：
 *   decision  adopted（本轮采信，已进 v3.0-adopted-candidates.json）
 *             not_adopted（检查过但本轮不收录）
 *             already_covered（官方页已核对，事实已在既有生产数据里）
 *   reason    未采信/已覆盖的原因（采信时写采信了什么）
 *   js/ login / pagination / offline / incomplete  题面 §C3 要求逐条标注的九个字段里的五个
 *   note      补充说明
 */
const DECISIONS = {
  // ---------------- C1 ----------------
  'volcengine-codingplan': {
    decision: 'not_adopted', js: true, login: false, pagination: false, offline: false, incomplete: true,
    reason: '渲染后 Lite / Pro 两档的价格区块仍是「价格查询中...」，档位价格由异步接口下发；页面只有营销文案「限时 9.9 元起」与档位权益描述。拿不到可核对的固定档价，不收录。',
    note: '同一域名下的 /product/ark（火山引擎方舟产品页）没这个问题，本轮从那里取到了豆包按量价。'
  },
  'volcengine-ark-subscribe': {
    decision: 'adopted', js: true, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：官方产品页直出豆包系列按量价（Doubao-Seed-Evolving / -2.1-pro / -2.1-turbo / -Character 的输入、输出、命中、缓存存储），进 apiPlans 的「豆包模型 API 按量计费」。',
    note: '静态抓取只能拿到空壳（0 字符正文），必须渲染；渲染后 22 张表、44 处价格命中。'
  },
  'qoder-pricing': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: false, incomplete: true,
    reason: 'qoder.com 的 robots.txt 对本路径 Disallow，静态抓取与无头渲染两条路都被拒（遵守 robots，不做绕过）。改用官方文档站 docs.qoder.com/account/pricing.md。',
    note: '这不是「抓不到」，是「不允许抓」——记成候选未采信而不是换 UA 重试。'
  },
  'qoder-docs-pricing-md': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：官方文档站给出 Free / Pro $20 / Pro+ $60 / Ultra $200 与 2,000 / 6,000 / 20,000 Credits 月额度；Pro+ 与 Ultra 作为新条目进 codingPlans。',
    note: '身份层由队长在 t3 验收时裁定：立独立 provider `qoder-intl`（显示名「Qoder International」、vendorKey null），**不与 CN 站的 `qoder` 并表** —— CN / 国际两站是独立定价、独立域名、独立币种的两个 SKU 面。既有 `qoder` 记录（provider 与 id）一个字都不动。'
  },
  'codebuddy-ai-pricing': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：国际站文档页给出个人版 Free/Pro $10（年付 $96）与团队版 $40/坐席/月、每席位 1,000 积分；团队版作为新条目进 codingPlans。',
    note: null
  },
  'codebuddy-cn-pricing': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：中文站定价页给出「体验版/标准版/高级版/旗舰版」四档与月付 免费/99/199/999 元、连续包月折扣、年付与实得积分；高级版与旗舰版作为新条目进 codingPlans（标准版已在生产数据里）。',
    note: '这一页是本轮 C1 价值最高的来源之一：它把 CodeBuddy 国内个人版的完整档位体系给全了。'
  },
  'github-copilot-plans': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：Free $0 / Pro $10 / Pro+ $39 / Max $100 四档，Pro+ 与 Max 作为新条目进 codingPlans（Pro 已在生产数据里）。',
    note: '官方把 AI Credits 写成美元额度（Pro $15 / Pro+ $70 / Max $200），没有给可直接比较的积分数值，因此额度记成 other 而不是折算。'
  },
  'cursor-pricing': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: false, incomplete: true,
    reason: '页面只把 Pro $20 与团队版 $40/user 渲染进正文；Pro+ / Ultra 的价格在页签里，首屏没有渲染出来（渲染后正文仅 1,108 字符、2 处价格命中）。Pro 已在生产数据里，没有新增可采信事实。',
    note: '不是页面下线：是价格区块没渲染。已记录，留待下一轮用更长的等待策略重试。'
  },
  'trae-cn-pricing': {
    decision: 'already_covered', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '官方定价页与既有 plans.json 的两条 Trae 记录（免费 Free / 会员 Pro）逐项一致，没有新增事实。',
    note: null
  },
  'zhipu-coding-plan': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: false, incomplete: true,
    reason: '官方套餐文档页只给出 Lite / Pro / Max 三档的积分额度（每 5 小时 2,000 / 12,000 / 28,000，每周 10,000 / 60,000 / 140,000）与抵扣系数，**没有任何价格**；价格页 bigmodel.cn/pricing 渲染后只有 API 按量价与 FAQ，没有 Coding 套餐价。新增档位缺官方价格，不收录。',
    note: 'Lite 档已在生产数据里且已如实标注「价格未知留空」。新建 Pro / Max 会把「价格未知」翻倍，收益不足。'
  },
  'zhipu-pricing': {
    decision: 'already_covered', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '官方 API 定价页渲染成功（2 张表、11 处价格命中），GLM-5.3 8/28/2 等与既有 zhipu 记录一致。',
    note: '页面还列出 GLM-OCR 0.2/0.2、GLM-TTS 2 元/万字符、GLM-5.3-Flash 限时五折价，属于对**已有记录**的扩充（需改既有条目而不是追加新条目），不在本轮追加范围，已留给后续。'
  },
  'minimax-token-plan': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：官方 Token Plan 页给出 Plus ¥49 / Max ¥119 / Ultra ¥469 三档与额度窗口规则，Max 与 Ultra 作为新条目进 codingPlans（Plus 已在生产数据里）。',
    note: null
  },
  'minimax-token-plan-team': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: false, incomplete: true,
    reason: '官方团队版页渲染后仅 1,119 字符、0 张表、0 处价格命中——页面本身没有给出团队版价格，不收录。',
    note: '宁缺毋滥：页面存在但信息不完整，属于「官方页已确认但没有可采信事实」。'
  },
  'kimi-code': {
    decision: 'not_adopted', js: true, login: false, pagination: false, offline: false, incomplete: true,
    reason: '渲染后正文只有 683 字符，套餐区块停在标题「Kimi Code is available in the following plans」，套餐卡与价格没有挂载出来。',
    note: '静态 698 字符 / 渲染 683 字符 —— 这一页连渲染都没拿到价格，不是 UA 问题。'
  },
  'kimi-membership-pricing': {
    decision: 'not_adopted', js: true, login: false, pagination: false, offline: false, incomplete: true,
    reason: '渲染后正文仅 352 字符，价格区未挂载；页面标题正常（「Kimi 价格 | 会员套餐与订阅方案」）说明页面存在，但价格由前端异步注入且未等到。',
    note: 'Kimi 侧（Coding 与 API）本轮三个页面都没拿到价格，是 C2/C1 里最明确的未采信来源之一。'
  },
  'kimi-code-docs': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: false, incomplete: true,
    reason: '官方文档说明 Kimi Code 包含在 Kimi 会员权益中、并列出 Desktop / CLI / VS Code 三种形态，但**没有会员档位与价格**。',
    note: null
  },
  'windsurf-pricing': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：官方定价页给出 Free $0 / Pro $20 / Max $200 / Teams $80 + $40 每坐席，Pro 与 Max 作为新条目进 codingPlans。',
    note: '页面标题已是「Plans and Pricing | Devin」，Windsurf 已并入 Devin；provider 名仍用 deals 侧的「Windsurf」，别名覆盖「Windsurf (Exafunction)」。'
  },
  'baidu-comate-pricing': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：官方定价页给出个人·标准版免费（首次注册赠 ¥10 模型额度）、个人·专业版 ¥59/月、个人·旗舰版 ¥199/月、企业版 ¥138/双席位/月；专业版与旗舰版作为新条目进 codingPlans。',
    note: '额度以**金额**表示（含模型额度 ¥55/月、¥199/月），不是 Token 数，因此按 other 记录并写明口径。'
  },
  'iflytek-iflycode': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: false, incomplete: true,
    reason: '渲染后 6,614 字符、0 张表、0 处价格命中——该页是 iFlyCode 的解决方案介绍，没有订阅价格。',
    note: null
  },
  'anthropic-pricing': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：官方定价页给出 Free $0 / Pro $20 月付（年付 $200 ≈ $17/月）/ Max「From $100」，并逐功能标注 Claude Code 在 Pro 与 Max 可用；Claude Pro 作为新条目进 codingPlans。',
    note: 'Max 只写「From $100 Per month」并区分 5x / 20x 用量档，没有给出各档单价，故 Max 未收录（见下一条 note 与报告 §未采信汇总）。'
  },
  'openai-chatgpt-pricing': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: false, incomplete: true,
    reason: '静态抓取被拒（HTTP 403）；渲染后 3,546 字符、0 处价格命中。个人版价格不在这一页（页面导向 ChatGPT.com）。',
    note: '与 openai-api-pricing 是同一类结果：OpenAI 侧没有可采信的 Codex 订阅价。'
  },
  'google-code-assist': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: true, incomplete: true,
    reason: 'codeassist.google 官方页当前返回 HTTP 500 错误页（渲染后正文 37 字符），官方页不可用。',
    note: 'Google 的 API 价改由 gemini-api-pricing 覆盖（该页已有 google 记录）。'
  },

  // ---------------- C2 ----------------
  'aliyun-bailian-pricing': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：官方模型价格页渲染后 620 张表 / 305 处价格命中，取到 qwen3.8-max 12/36、qwen3-max 阶梯 2.5/10、qwen-max 2.4/9.6、glm-5.3 8/28、kimi-k3 20/100、deepseek-v4-pro 12/24、MiniMax-M3 4.2/16.8 等中国内地标准价，进 apiPlans 两条记录（标准档 + 闲时档）。',
    note: '**这是本轮最大的翻案**：v2.5 把阿里云百炼记成「未采信」，实际用无头渲染后价格表是完整的（静态抓取也能拿到 309 张表 93,427 字符）。'
  },
  'aliyun-bailian-free-quota': {
    decision: 'already_covered', js: false, login: true, pagination: false, offline: false, incomplete: false,
    reason: '新人免费额度规则的官方页；规则已体现在既有 deals（阿里云免费额度）与 model-pricing 的「免费额度」列里，没有新增事实。',
    note: '渲染快照检测到登录态提示区块（页面含需要登录才能操作的部分），但不影响该页公开规则的读取。'
  },
  'volcengine-ark-pricing': {
    decision: 'not_adopted', js: true, login: false, pagination: false, offline: false, incomplete: true,
    reason: '方舟控制台文档站的定价页渲染后正文只有 47 字符（「火山方舟 控制台 模型广场 …」导航壳）；静态抓取 0 字符。价格文档在控制台内是 JS 应用，未渲染出正文。',
    note: '豆包按量价改从 www.volcengine.com/product/ark 取得（见 volcengine-ark-subscribe）。'
  },
  'volcengine-docs-pricing': {
    decision: 'not_adopted', js: true, login: false, pagination: false, offline: false, incomplete: true,
    reason: 'docs.volcengine.com 会跨域重定向；直接请求后渲染正文 0 字符，静态也是空壳。',
    note: null
  },
  'kimi-api-pricing': {
    decision: 'not_adopted', js: true, login: false, pagination: false, offline: false, incomplete: true,
    reason: '渲染后 1,243 字符，只有计费概念说明与 K3/K2 系列的**小节标题**，模型价格表的行没有渲染出来（表格由异步资源下发）。',
    note: 'v2.5 也是同样的结论；本轮用无头渲染复验，结论不变——这是**复核过的**未采信，不是沿用旧结论。'
  },
  'kimi-api-batch': {
    decision: 'not_adopted', js: true, login: false, pagination: false, offline: false, incomplete: true,
    reason: '同 kimi-api-pricing：渲染后 762 字符，批量推理价目表没有渲染出行。',
    note: null
  },
  'minimax-paygo': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：官方按量计费页渲染后 19 张表 / 30 处价格命中，取到 MiniMax-M3（≤512k 五折后 2.10/8.40/0.42、>512k 4.20/16.80/0.84）、M2.7、M2.7-highspeed、M2.5，进 apiPlans 的「API 按量计费」。',
    note: '页面另有「优先」档价目表（标准价 ×1.5），已在记录的 note 里说明；本轮不为它单开一条记录。'
  },
  'siliconflow-pricing': {
    decision: 'adopted', js: false, login: false, pagination: true, offline: false, incomplete: false,
    reason: '采信：官方价格中心渲染后 97 处价格命中，取到 GLM-5.3 8/28/2、DeepSeek-V4-Pro 12/24/1、DeepSeek-V3.2 4/6/0.4、Kimi-K2.7-Code 6.5/27/1.3、Step-3.5-Flash 0.7/2.1、Qwen3.8-27B 3/12，进 apiPlans 的「模型推理按量计费」。',
    note: '**第二个翻案**：硅基流动此前记成未采信，实际静态抓取即可拿到完整价目表。页面有「展开更多 N 个模型」的折叠交互，未展开的长尾模型本轮未收录。'
  },
  'siliconflow-docs': {
    decision: 'already_covered', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '文档站首页（平台简介），没有价格表；价格事实以 siliconflow.cn/pricing 为准。',
    note: null
  },
  'mistral-pricing': {
    decision: 'not_adopted', js: true, login: false, pagination: false, offline: false, incomplete: true,
    reason: '静态抓取被拒（ECONNABORTED，axios 连接层失败）；渲染成功但落到的是 Vibe **订阅页**（Free / Pro $14.99 / Team $24.99），API 价目表在另一个页签，本页只在 FAQ 里举了「Mistral Large $0.5/M in、$1.5/M out」一例，不成表。',
    note: 'Vibe 订阅本身是 C1 候选，但它的额度口径是「消息 / 搜索次数」（Pro 相对 Free「Up to 6x」），没有可核对的固定数值，因此也没有标成套餐收录。'
  },
  'mistral-docs-models': {
    decision: 'not_adopted', js: true, login: false, pagination: false, offline: false, incomplete: true,
    reason: '官方模型总览页只有模型清单、版本号与许可证，没有价格（定价是 /pricing 的另一个页签）。静态同样 ECONNABORTED。',
    note: null
  },
  'stepfun-pricing': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: true, incomplete: true,
    reason: 'platform.stepfun.com/docs/pricing/details 返回 HTTP 404；渲染后标题为空、正文 0 字符。该官方定价页已下线或改版。',
    note: null
  },
  'baichuan-pricing': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: true, incomplete: true,
    reason: 'platform.baichuan-ai.com/price 返回 HTTP 404，渲染后是 Next.js 的「404: This page could not be found」页。',
    note: null
  },
  'tencent-hunyuan-pricing': {
    decision: 'adopted', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '采信：腾讯云官方文档「混元生文计费概述」给出 6 个模型的刊例价（Hunyuan-a13b 0.5/2、Hunyuan-role-latest 2.4/9.6、翻译系列、视觉系列、embedding 0.7/0.7）与一次性 100 万 tokens 免费额度，进 apiPlans 的「混元生文按量计费」。',
    note: '**第三个翻案/新发现**：腾讯混元此前不在候选名单里，是本轮 C2「其他高价值 provider」扩查到的。'
  },
  'qianfan-pricing': {
    decision: 'already_covered', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '百度千帆「新用户免费额度」官方页；该规则已在既有 deals（百度智能云 ERNIE 免费额度）里，没有价格表。',
    note: null
  },
  'openai-api-pricing': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: false, incomplete: true,
    reason: 'openai.com/api/pricing 静态被拒（HTTP 403）；渲染后实际落到「Business 定价」页（标准席位 US$20/月、高级席位 US$100/月，年付价），不是 API token 价目表。API 价已有 openai 记录，本轮没有新增可采信条目。',
    note: 'Business 席位页含 Codex，但它是企业席位套餐而不是面向个人开发者的 Codex 订阅；记成 coding plan 会把「ChatGPT 企业工作区」当成「编码套餐」，故不收录。'
  },
  'gemini-api-pricing': {
    decision: 'already_covered', js: false, login: false, pagination: false, offline: false, incomplete: false,
    reason: '官方 Gemini API 价格页渲染后 88 张表 / 198 处价格命中；同一 provider 已有 google 记录，本轮没有新增事实。',
    note: '页面里的新模型（如 Pro 系列）属于对**已有条目**的扩充，需要改既有 curated 记录而不是追加，留给后续；已在本文件 §待办 里列出。'
  },
  'sensenova-pricing': {
    decision: 'not_adopted', js: false, login: false, pagination: false, offline: true, incomplete: true,
    reason: 'platform.sensenova.cn 的定价文档路径返回 HTTP 404（渲染后是 404 Not Found 页）。',
    note: null
  }
};

function main() {
  const index = JSON.parse(fs.readFileSync(INDEX, 'utf8'));
  const missingDecision = index.sources.filter(source => !DECISIONS[source.slug]);
  if (missingDecision.length) {
    console.error('❌ 以下来源没有人工决策：' + missingDecision.map(s => s.slug).join(', '));
    return 1;
  }

  const candidates = index.sources.map(source => {
    const decision = DECISIONS[source.slug];
    const stat = source.static || {};
    const render = source.render || {};
    return {
      provider: source.provider,
      slug: source.slug,
      stage: source.stage,
      url: source.url,
      checkedAt: '2026-10-01',
      decision: decision.decision,
      failedReason: decision.decision === 'adopted' ? null : decision.reason,
      adoptedReason: decision.decision === 'adopted' ? decision.reason : null,
      isJs: Boolean(decision.js),
      requiresLogin: Boolean(decision.login),
      dynamicPagination: Boolean(decision.pagination),
      pageOffline: Boolean(decision.offline),
      incomplete: Boolean(decision.incomplete),
      note: decision.note || null,
      measured: {
        staticOk: Boolean(stat.ok),
        staticReason: stat.reason || null,
        staticBytes: stat.bytes || 0,
        staticTextLength: stat.textLength || 0,
        staticTableCount: stat.tableCount || 0,
        renderedOk: Boolean(render.ok),
        renderedTitle: render.title || null,
        renderedFinalUrl: render.finalUrl || null,
        renderedTextLength: render.textLength || 0,
        renderedDomTextLength: render.domTextLength || 0,
        renderedTableCount: render.tableCount || 0,
        priceHits: render.priceHits || 0,
        loginWall: Boolean(render.loginWall),
        captcha: Boolean(render.captcha)
      },
      snapshot: {
        text: `research/_raw/v3.0-sources/text/${source.slug}.txt`,
        domText: `research/_raw/v3.0-sources/domtext/${source.slug}.txt`
      }
    };
  });

  const doc = {
    schemaVersion: 1,
    checkedAt: '2026-10-01',
    producedBy: 'source-researcher (A3 / Stage C)',
    note: [
      '题面 §C3 要求的候选登记表：**检查过但没收录的过程不能丢**。',
      '每条都带 §C3 点名的字段：provider / URL / 检查日期 / 失败原因 / 是否 JS / 是否登录态 /',
      '是否动态分页 / 是否官方页已下线 / 是否信息不完整。',
      'decision=adopted 的条目已整理进 research/v3.0-adopted-candidates.json（schema 试算通过）；',
      'decision=not_adopted 与 already_covered 的条目**一条都没有写进生产数据**。',
      'measured 里的数字全部来自 research/_raw/v3.0-sources/index.json（probe.js 的实测输出），不是估计值。'
    ],
    counts: {
      total: candidates.length,
      adopted: candidates.filter(c => c.decision === 'adopted').length,
      notAdopted: candidates.filter(c => c.decision === 'not_adopted').length,
      alreadyCovered: candidates.filter(c => c.decision === 'already_covered').length
    },
    candidates
  };

  fs.writeFileSync(path.join(RESEARCH, 'v3.0-source-candidates.json'), `${JSON.stringify(doc, null, 2)}\n`);
  fs.writeFileSync(path.join(RESEARCH, 'v3.0-source-candidates.md'), renderMarkdown(doc));
  console.log(`写出 v3.0-source-candidates.json / .md：共 ${doc.counts.total} 条（采信 ${doc.counts.adopted} / 未采信 ${doc.counts.notAdopted} / 已覆盖 ${doc.counts.alreadyCovered}）`);
  return 0;
}

const DECISION_LABEL = {
  adopted: '✅ 已采信',
  not_adopted: '❌ 未采信',
  already_covered: '🟦 已覆盖'
};

function yesNo(value) {
  return value ? '是' : '否';
}

function renderMarkdown(doc) {
  const lines = [];
  lines.push('# v3.0 官方来源逐家核查与候选未采信报告（A3 / Stage C）');
  lines.push('');
  lines.push('> 题面 §C3：**不要让「检查过但没收录」的信息丢失**。本文件就是那份留档。');
  lines.push('>');
  lines.push('> - 机器可读同源文件：`research/v3.0-source-candidates.json`（`npm run report:coverage` 读它）；');
  lines.push('> - 原始快照：`research/_raw/v3.0-sources/`（`index.json` 是探针实测数字，`text/`、`domtext/`、`html/` 是逐源渲染快照）；');
  lines.push('> - 采信条目的落盘清单：`research/v3.0-adopted-candidates.json` + `research/v3.0-adopted-candidates.md`。');
  lines.push('>');
  lines.push('> **第三方聚合站只用于发现候选**：本文件里没有一条生产事实来自聚合站，官方依据缺失的一律记为未采信。');
  lines.push('');
  lines.push(`检查日期：${doc.checkedAt}　｜　共 ${doc.counts.total} 个来源：已采信 ${doc.counts.adopted} · 未采信 ${doc.counts.notAdopted} · 官方页已核对但事实已在生产数据里 ${doc.counts.alreadyCovered}`);
  lines.push('');
  lines.push('## 一、逐条登记表');
  lines.push('');
  lines.push('| # | Stage | provider | 官方 URL | 检查日期 | 结论 | JS | 登录态 | 动态分页 | 官方页已下线 | 信息不完整 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  doc.candidates.forEach((candidate, index) => {
    lines.push(`| ${index + 1} | ${candidate.stage} | ${candidate.provider} | ${candidate.url} | ${candidate.checkedAt} | ${DECISION_LABEL[candidate.decision]} | ${yesNo(candidate.isJs)} | ${yesNo(candidate.requiresLogin)} | ${yesNo(candidate.dynamicPagination)} | ${yesNo(candidate.pageOffline)} | ${yesNo(candidate.incomplete)} |`);
  });
  lines.push('');
  lines.push('## 二、逐条失败原因 / 采信理由（含实测数字）');
  lines.push('');
  doc.candidates.forEach((candidate, index) => {
    lines.push(`### ${index + 1}. ${candidate.provider} —— ${candidate.url}`);
    lines.push('');
    lines.push(`- 结论：**${DECISION_LABEL[candidate.decision]}**（Stage ${candidate.stage}，检查日期 ${candidate.checkedAt}）`);
    lines.push(`- 是否 JS 渲染：${yesNo(candidate.isJs)}　是否登录态：${yesNo(candidate.requiresLogin)}　是否动态分页：${yesNo(candidate.dynamicPagination)}　官方页已下线：${yesNo(candidate.pageOffline)}　信息不完整：${yesNo(candidate.incomplete)}`);
    lines.push(`- ${candidate.decision === 'adopted' ? '采信了什么' : '未收录的原因'}：${candidate.decision === 'adopted' ? candidate.adoptedReason : candidate.failedReason}`);
    if (candidate.note) lines.push(`- 备注：${candidate.note}`);
    lines.push(`- 实测：静态 ${candidate.measured.staticOk ? `OK（${candidate.measured.staticBytes} 字节 / 正文 ${candidate.measured.staticTextLength} 字 / 表 ${candidate.measured.staticTableCount}）` : `失败（${candidate.measured.staticReason}）`}；渲染 ${candidate.measured.renderedOk ? `OK（正文 ${candidate.measured.renderedTextLength} 字 / DOM ${candidate.measured.renderedDomTextLength} 字 / 表 ${candidate.measured.renderedTableCount} / 价格命中 ${candidate.measured.priceHits}${candidate.measured.loginWall ? ' / 检测到登录墙文案' : ''}${candidate.measured.captcha ? ' / 检测到验证码文案' : ''}）` : '失败'}`);
    lines.push(`- 快照：\`${candidate.snapshot.text}\` · \`${candidate.snapshot.domText}\``);
    lines.push('');
  });
  lines.push('## 三、本轮翻案的来源（v2.5 记为未采信、本轮核实可采信）');
  lines.push('');
  lines.push('| provider | 官方页 | v2.5 结论 | 本轮结论 | 依据 |');
  lines.push('|---|---|---|---|---|');
  lines.push('| 阿里云百炼 | https://help.aliyun.com/zh/model-studio/model-pricing | 未采信（JS 分页 / 按模型切换） | 已采信 | 无头渲染后 620 张表、305 处价格命中；静态抓取亦有 309 张表 |');
  lines.push('| 硅基流动 | https://siliconflow.cn/pricing | 未采信 | 已采信 | 静态抓取即可拿到 15+ 个模型的三列价格（输入/输出/缓存） |');
  lines.push('| MiniMax | https://platform.minimax.cn/docs/guides/pricing-paygo | 未采信（改成订阅套餐页） | 已采信 | 官方「按量计费」页仍在，19 张表 |');
  lines.push('| 腾讯混元 | https://cloud.tencent.com/document/product/1729/97731 | 不在候选名单 | 已采信 | 官方计费文档给出 6 个模型的刊例价 |');
  lines.push('');
  lines.push('## 四、仍未采信（照旧如实记录，不硬凑）');
  lines.push('');
  lines.push('| provider | 官方页 | 卡在哪一步 |');
  lines.push('|---|---|---|');
  lines.push('| 月之暗面 / Kimi | https://platform.kimi.com/docs/pricing/chat | 渲染后价目表行未挂载（1,243 字），会员价格页同样未挂载（352 字） |');
  lines.push('| 火山方舟（文档站） | https://ark.volcengine.com/region:cn-beijing/docs/ark/model-pricing | 控制台文档站是 JS 应用，渲染后只有导航壳（47 字） |');
  lines.push('| Mistral | https://mistral.ai/pricing | 渲染后是 Vibe 订阅页；API 价目表在另一页签，FAQ 只给了一个模型的一例 |');
  lines.push('| 阶跃星辰 | https://platform.stepfun.com/docs/pricing/details | 官方页 404 |');
  lines.push('| 百川智能 | https://platform.baichuan-ai.com/price | 官方页 404 |');
  lines.push('| 商汤 | https://platform.sensenova.cn/doc?path=/docs/API/price.md | 官方页 404 |');
  lines.push('| Google Code Assist | https://codeassist.google/ | 官方页 HTTP 500 |');
  lines.push('| OpenAI（Codex 订阅） | https://openai.com/api/pricing/ | 落到 Business 席位页，不是编码订阅价 |');
  lines.push('');
  lines.push('## 五、待办（本轮如实不做，留给后续）');
  lines.push('');
  lines.push('1. **智谱 Coding Plan 的 Pro / Max**：官方文档有额度（12,000 / 28,000 每 5 小时）但没有价格；拿到官方价格后即可补。');
  lines.push('2. **已收录 provider 的模型扩充**：智谱（GLM-OCR / GLM-TTS / GLM-5.3-Flash 五折）、Google（Gemini Pro 系列）、OpenAI（Batch 以外的新档）、Anthropic（Max 5x/20x）——这些要改**既有** curated 条目而不是追加，属于另一类改动。');
  lines.push('3. **Cursor Pro+ / Ultra**、**Kimi 会员档位**：价格区块需要更长的渲染等待或不同的等待锚点，本轮首屏未拿到。');
  lines.push('');
  lines.push('> Qoder 国际站原本是这条清单里的第 1 项（数字完整、只缺身份层决定）。队长已在 t3 验收时裁定：');
  lines.push('> 立独立 provider `qoder-intl`、数据采信落盘。故它已从待办移出，进入 `research/v3.0-adopted-candidates.json`。');
  lines.push('');
  lines.push('## 六、报告素材（供 t13 写最终报告 §8 引用）');
  lines.push('');
  lines.push('### 6.1 同公司两 provider 的登记决定：Qoder CN 与 Qoder International');
  lines.push('');
  lines.push('- **事实**：`docs.qoder.com`（国际站）与 `qoder.com` CN 站是两套独立定价 —— 国际站 Pro $20 / Pro+ $60 / Ultra $200（USD），CN 站个人专业版 ¥59（CNY）。');
  lines.push('- **决定**：新建 provider `qoder-intl`（显示名「Qoder International」、slug `qoder-intl`、`vendorKey: null`），**不与 `qoder`（显示名「Qoder CN」）并表**。');
  lines.push('- **理由**：并表会让同一张表里出现两套货币与两个站点的人群/可购性，正是本仓最忌的展示错误；本仓既有先例允许同一家公司有两个 provider（字节的火山引擎与 Trae），但必须逐条登记。');
  lines.push('- **三条纪律**：① 显示名不取「Qoder」，避免同一家公司两个相似显示名；② `vendorKey` 必须为 `null`（A 空间没有对应厂商名，不得为此新编）；③ 既有 `qoder` 记录（provider 与 id）一个字都不改。');
  lines.push('- **想过 `validateSlugAgreement` 这一层**：该断言比的是**显示名** —— 「Qoder International」不在 `vendor-slugs.json` 里，因此不会与 `qoder` 的 slug 产生约束；新增 provider 的别名刻意都不含裸串 `qoder`，不占用既有 provider 的别名。');
  lines.push('');
  lines.push('### 6.2 架构决定：provider-only 平台不建 `/vendor/` 页');
  lines.push('');
  lines.push('- **背景（t3 实测）**：以下 5 家 provider **没有 deals**，只有套餐 / API 计费资料：');
  lines.push('  `trae`（plans 2 条）、`qoder`（plans 1 条）、`codebuddy`（plans 1 条）、`deepseek`（api 1 条）、`openai`（api 2 条）。');
  lines.push('- **决定**：不为它们新建 `/vendor/<slug>/` 路线。');
  lines.push('- **理由**：① 站上所有 `/vendor/<slug>/` 都以 **A 空间厂商名**为身份键生成；为这 5 家建页要么得为它们**新编 A 空间身份**（等于"因为套餐里有这个平台，就认定它是一家有 deals 的厂商"），要么得改掉这个身份键（结构性改动，会牵连已有 9 条 URL）；② 这些平台的资料本来就有正确去处：`/plans/coding/`、`/plans/api/`、`/plans/` 枢纽与各枢纽页。');
  lines.push('- **结果**：`/vendor/` 页面集合与基点保持 **9 条不变**；题面 §4「Provider Page 至少包含 Deal / Coding Plan / API Pricing / Model 其中至少一种真实资料」由现有 9 页 + t8 新增区块满足，不靠"多建页"。');
  lines.push('- **落点**：已写进 `docs/v3.0/AGENT-REFERENCE.md` §2.4 门槛表；`t8` / `t12` 以它为准。t3 这边的实测名单就是上面那 5 家（`report:coverage` 的「缺口 2：有 Plans 无 Deals 的 provider」正是同一个集合，可复算）。');
  lines.push('');
  lines.push('### 6.3 数据齐备必须先于页面生成（硬顺序）');
  lines.push('');
  lines.push('`report:coverage` 在 t6 落盘前后给出的数字不同：落盘前 Coding 是 provider 8 / plan 9、API 是 records 7 / items 37；');
  lines.push('t3 采信的 12+2 条套餐与 6 条 API 记录落盘后应变为 plan 23、records 13、items 67。');
  lines.push('若页面先于落盘生成，就会出现"页面上写着 9 条套餐、数据里其实有 23 条"的自相矛盾产物 —— 这正是队长加的硬顺序要防的事。');
  lines.push('落盘完成后可直接用 `npm run report:coverage` 复算这三个数字做对账。');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

process.exit(main());
