#!/usr/bin/env node
/**
 * 一次性数据补齐：给 curated_*.json 的条目加 v1.1 六个字段（**可重跑、幂等**）。
 *
 * 用法：
 *   node scripts/tools/audience-backfill.js --dry-run   # 打印将写入的内容，不落盘
 *   node scripts/tools/audience-backfill.js             # 写盘
 *
 * ⚠️ 这份脚本不是「批量填空器」，它只编码**能从该条自己的文本里读出来的判断**。
 * 每一处赋值都必须在 `REASONS` 里有对应的一句依据，并且能在该条的
 * eligibility / description / discountInfo / validity 原文里找到出处。
 * 读不出依据的一律不写（缺席 = unknown）—— 覆盖率低是正确结果，编数据才是失败。
 *
 * 为什么不做成「按关键词自动推断」：那正是本阶段要根除的做法。关键词表会把
 * 「Students, solo builders…」（媒体受众词）判成学生门槛，v1.0 的 TIER 分档
 * 就吃过这个亏。这里是**逐条人工判断 + 机械可复核**，不是启发式。
 */

const fs = require('fs');
const path = require('path');
const { hasKnown } = require('../lib/audience');

const ROOT = path.join(__dirname, '..', '..');
const FILES = [
  { file: path.join(ROOT, 'scripts/data/curated_cn.json'), region: 'cn' },
  { file: path.join(ROOT, 'scripts/data/curated_global.json'), region: 'global' }
];

const DRY_RUN = process.argv.includes('--dry-run');
/** 显式覆盖人工定向补值（默认拒绝，见 main 里的保护检查） */
const FORCE = process.argv.includes('--force');

/* ------------------------------------------------------------------ */
/* 逐条的判断。键 = title（稳定，且与文件里的标题逐字相同）              */
/*                                                                     */
/* 依据一律引原文。`stated` = 来源明说；`inferred` = 由来源原文推出，     */
/* 必须带 note。凡是没把握的字段，**不写**（缺席 = unknown）。           */
/* ------------------------------------------------------------------ */

const SHARED = {
  // 所有 curated 条目都来自厂商官方页，出处声明统一用官方页本身
  credibility: 'curated',
  basis: 'source'
};

/** 国内厂商：只要没有明文地区条款，可用性就是 unknown（域名所在地不是证据） */
function cnAvailability() {
  return { chinaUsable: 'unknown' };
}

/**
 * 逐条的**删减表**：凡是原文没有明说、而我第一版顺手写下的取值，一律删掉。
 *
 * 这份表是本脚本最重要的一节，因为它记录的正是本阶段要根除的两种过度推断：
 *
 * ① `studentRequired: false` —— 原文只写「面向个人开发者」，没有一句话说「不要求学生
 *    身份」。**没有证据 ≠ false**，所以只能缺席（= unknown）。面向谁由
 *    `audience: ['developer']` 表达，不需要替它冒充一个资格断言。
 * ② `chinaUsable: true` —— 国内厂商的页面以中文呈现、面向国内开发者，这是**推断**而不是
 *    原文陈述；`regionRestriction` 里写「未标注境外用户限制」同样是替官方说话。
 *    凡没有明文地区条款的，一律只留 `{ chinaUsable: 'unknown' }`。
 *
 * 保留的 `false` 只有一种：原文**明说**「无需 / 即自动」。目前全仓只有 Azure 的
 * 「均无需信用卡」一条属于前者、下面这个集合里的条目属于后者。
 */
const DROP_DEFAULTS = [
  'eligibilityDetail.studentRequired',
  'claimRequirements.creditCardRequired',
  'claimRequirements.manualApplication',
  'availability.chinaUsable',
  'availability.regionRestriction'
];

/** 原文明说「自动 / 即自动」才敢写 manualApplication: false 的条目 */
const EXPLICIT_NO_MANUAL = new Set([
  '腾讯混元', '扣子 Coze 新用户', '扣子 Coze 个人版每日', 'MiniMax 开放平台 Token Plan',
  'MiniMax MiniMax-M3', 'ElevenLabs 免费计划', 'Runway 免费计划', '硅基流动'
]);

/** 原文明确交代了地区条款的条目（只有这两条，其余一律 unknown） */
const EXPLICIT_REGION = new Set(['Google AI Pro 学生免费', 'Anthropic Claude 非营利']);

/** 按删减表裁剪一条判断：只留「原文说的」，去掉「我推断的」 */
function dropFields(entry, key) {
  const drop = new Set(DROP_DEFAULTS);
  if (EXPLICIT_NO_MANUAL.has(key)) drop.delete('claimRequirements.manualApplication');
  if (EXPLICIT_REGION.has(key)) {
    drop.delete('availability.chinaUsable');
    drop.delete('availability.regionRestriction');
  }
  const out = {};
  if (entry.audience) out.audience = entry.audience;
  if (entry.benefitType) out.benefitType = entry.benefitType;
  const strip = (obj, prefix) => {
    if (!obj) return null;
    const kept = {};
    for (const [k, v] of Object.entries(obj)) {
      if (drop.has(`${prefix}.${k}`)) continue;
      kept[k] = v;
    }
    return Object.keys(kept).length ? kept : null;
  };
  out.eligibilityDetail = strip(entry.eligibilityDetail, 'eligibilityDetail');
  out.claimRequirements = strip(entry.claimRequirements, 'claimRequirements');
  if (entry.availability) {
    const kept = {};
    for (const [k, v] of Object.entries(entry.availability)) {
      if (drop.has(`availability.${k}`)) continue;
      kept[k] = v;
    }
    out.availability = Object.keys(kept).length ? kept : null;
  }
  return out;
}

const ENTRIES = {
  /* ---------------- curated_cn.json ---------------- */
  "火山方舟 豆包全系模型": {
    audience: ['developer'],
    benefitType: ['free_credits', 'free_api'],
    eligibilityDetail: { newUserOnly: 'unknown', studentRequired: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      audience: '「个人开发者」「注册即可调用豆包等十数种大模型」——面向开发者',
      benefitType: '「免费推理额度」= free_credits；额度用于 API 推理 = free_api',
      accountRequired: '「需注册火山引擎账号」',
      manualApplication: '「注册即可调用」→ 不需要人工审核',
      studentRequired: '面向个人开发者，未提及学生身份 → 明说无关（false）',
      identityVerificationRequired: '原文只写「需注册火山引擎账号」，未提实名 → unknown'
    }
  },
  "腾讯混元": {
    audience: ['developer'],
    benefitType: ['free_credits', 'free_api'],
    eligibilityDetail: { newUserOnly: true, identityVerificationRequired: true, studentRequired: false },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      newUserOnly: '「首次开通腾讯混元服务后发放一次性免费资源包」',
      identityVerificationRequired: '「通过腾讯云实名认证的新用户」',
      manualApplication: '「首次在混元大模型控制台点击『立即使用』即自动发放」→ 不需要人工审核',
      studentRequired: '面向实名认证新用户，与学生身份无关'
    }
  },
  "讯飞星火": {
    audience: ['developer'],
    benefitType: ['free_model', 'free_api'],
    eligibilityDetail: { studentRequired: false, newUserOnly: 'unknown', identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      benefitType: '「轻量级大语言模型 Spark Lite『支持免费使用』」= free_model + free_api',
      accountRequired: '「注册讯飞开放平台并创建应用后」',
      studentRequired: '面向注册开发者，未提学生身份'
    }
  },
  "讯飞开放平台": {
    audience: ['developer'],
    benefitType: ['free_credits', 'developer_credit'],
    eligibilityDetail: { newUserOnly: true, studentRequired: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: 'unknown' },
    availability: cnAvailability(),
    why: {
      newUserOnly: '「新手免费福利礼包」「新注册开发者」',
      benefitType: '「百万级交互量免费领取」「乐享会员」= 开发者赠送额度',
      manualApplication: '「按引导领取，部分权益需完成认证」→ 是否人工审核未说明'
    }
  },
  'Kimi 开放平台': {
    audience: ['developer'],
    benefitType: ['free_credits', 'developer_credit'],
    eligibilityDetail: { newUserOnly: true, identityVerificationRequired: true, studentRequired: false },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      newUserOnly: '「新注册用户」「注册即赠送 15 元代金券」',
      benefitType: '「15 元代金券」可用于 API 调用 = 开发者赠送额度',
      identityVerificationRequired: '「完成实名认证后发放」'
    }
  },
  "商汤日日新": {
    audience: ['developer'],
    benefitType: ['free_api', 'trial'],
    eligibilityDetail: { studentRequired: false, newUserOnly: 'unknown', identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: 'unknown' },
    availability: cnAvailability(),
    why: {
      benefitType: '「限时免费开放」「每 5 小时 1500 次调用的无门槛免费配额」= 免费 API + 试用',
      accountRequired: '「登录 SenseNova 平台即可申请领取」',
      studentRequired: '「无门槛配额」→ 与学生身份无关'
    }
  },
  "硅基流动": {
    audience: ['developer'],
    benefitType: ['free_model', 'free_api'],
    eligibilityDetail: { studentRequired: false, newUserOnly: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      benefitType: '「多款模型价格为『免费』」= free_model；通过 API 调用 = free_api',
      newUserOnly: '「所有注册开发者」→ 不限新用户',
      manualApplication: '「注册账号并创建 API Key 后即可直接调用」'
    }
  },
  "阶跃星辰": {
    audience: ['developer'],
    benefitType: ['free_model', 'trial'],
    eligibilityDetail: { studentRequired: false, newUserOnly: 'unknown', identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      benefitType: '「两个语音大模型的输入/输出价格均标注为『限时免费』」= free_model + trial',
      accountRequired: '「注册并创建 API Key 后即可调用」'
    }
  },
  "百川智能": {
    audience: ['developer'],
    benefitType: ['free_api'],
    eligibilityDetail: { studentRequired: false, newUserOnly: 'unknown', identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: true },
    availability: cnAvailability(),
    why: {
      benefitType: '「免费使用 M3Plus API」',
      manualApplication: '「点击页面横幅进入申请流程，审核通过后即可免费使用」'
    }
  },
  '扣子 Coze 新用户': {
    audience: ['developer'],
    benefitType: ['free_credits', 'developer_credit'],
    eligibilityDetail: { newUserOnly: true, studentRequired: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      newUserOnly: '「新用户首次注册一次性赠送 1500 活动积分」',
      benefitType: '「活动积分」可抵扣 Token 与插件调用 = 开发者赠送额度',
      manualApplication: '「首次注册并登录后按官方规则发放」'
    }
  },
  '扣子 Coze 个人版每日': {
    audience: ['developer'],
    benefitType: ['free_credits', 'developer_credit'],
    eligibilityDetail: { newUserOnly: false, studentRequired: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      newUserOnly: '「扣子个人版用户（含个人免费版）每日成功登录即可获赠」→ 不限新用户',
      benefitType: '每日赠送活动积分 = 开发者赠送额度'
    }
  },
  '扣子 Coze 部分模型': {
    audience: ['developer'],
    benefitType: ['free_model'],
    eligibilityDetail: { studentRequired: false, newUserOnly: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      benefitType: '「Kimi-8k/32k/128k、阶跃星辰等模型限时免费」= free_model',
      newUserOnly: '「所有扣子用户」'
    }
  },
  '扣子 Coze 官方付费插件': {
    audience: ['developer'],
    benefitType: ['free_api', 'free_credits'],
    eligibilityDetail: { studentRequired: false, newUserOnly: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      benefitType: '「官方付费插件普遍配有每日免费额度……额度内调用不扣积分」',
      newUserOnly: '「所有扣子用户（主账号及其子账号共享免费额度）」'
    }
  },
  '360智脑': {
    audience: ['developer'],
    benefitType: ['free_credits', 'developer_credit'],
    eligibilityDetail: { newUserOnly: true, identityVerificationRequired: true, studentRequired: false },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: true },
    availability: cnAvailability(),
    why: {
      newUserOnly: '「针对新用户等不特定人群赠与体验券或代金券」',
      identityVerificationRequired: '「需 360 账号、绑定手机号并通过意向申请开通」',
      manualApplication: '「先提交意向申请说明使用场景，由平台开通权限后发放」'
    }
  },
  'MiniMax 开放平台 Token Plan': {
    audience: ['developer'],
    benefitType: ['discount'],
    eligibilityDetail: { studentRequired: false, newUserOnly: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      benefitType: '「受邀人结算自动 9 折」= discount',
      newUserOnly: '「MiniMax 开放平台注册用户」'
    }
  },
  'MiniMax MiniMax-M3': {
    audience: ['developer'],
    benefitType: ['discount', 'free_api'],
    eligibilityDetail: { studentRequired: false, newUserOnly: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      benefitType: '「MiniMax-M3 标注『永久五折』」= discount（按量计费 API 调用）',
      newUserOnly: '「所有开放平台用户（按量计费 API Key）」'
    }
  },
  "海螺AI": {
    audience: ['general'],
    benefitType: ['discount'],
    eligibilityDetail: { studentRequired: false, newUserOnly: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      audience: '面向海螺AI 普通注册用户（消费级订阅），非开发者门槛',
      benefitType: '「限时优惠价」= discount'
    }
  },
  "魔搭": {
    audience: ['developer'],
    benefitType: ['free_api', 'free_model'],
    eligibilityDetail: { studentRequired: false, newUserOnly: false, identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: cnAvailability(),
    why: {
      benefitType: '「免费推理 API……免费提供给广大开发者体验」= free_api + free_model',
      identityVerificationRequired: '「绑定阿里云账号并完成实名认证」',
      newUserOnly: '「广大开发者」→ 不限新用户'
    }
  },

  /* ---------------- curated_global.json ---------------- */
  'Anthropic Claude 非营利': {
    audience: ['other'],
    benefitType: ['discount'],
    eligibilityDetail: { studentRequired: false, newUserOnly: false, identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: true },
    availability: { chinaUsable: 'unknown' },
    why: {
      audience: '「经核验的非营利组织」——不在 student/developer/educator/education 四类内，如实记 other',
      identityVerificationRequired: '「通过合作方 Goodstack 提交非营利资格核验表单」',
      manualApplication: '「提交……核验表单后即可开通」→ 需人工审核',
      chinaUsable: '官方页未提及中国大陆可用性 → 不写值，只留 unknown（不推断）'
    }
  },
  'GitHub Copilot 学生免费': {
    audience: ['student', 'developer'],
    benefitType: ['student_plan', 'free_subscription'],
    eligibilityDetail: { studentRequired: true, educationEmailRequired: 'unknown', identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: true },
    availability: { chinaUsable: 'unknown' },
    why: {
      audience: '「经 GitHub Education 验证的在校学生」+ 开发者工具 → student + developer',
      benefitType: '「可免费使用 Copilot 全部付费功能」= 学生计划 + 免费订阅',
      studentRequired: '「经 GitHub Education 验证的在校学生」',
      educationEmailRequired: '原文只写「完成学籍验证」，未强制教育邮箱 → unknown 而非 false',
      manualApplication: '「验证通过与权益生效是两个步骤，可能需数天」→ 需审核等待',
      chinaUsable: '官方页未提及中国大陆可用性'
    }
  },
  'GitHub Copilot 教师': {
    audience: ['educator', 'developer'],
    benefitType: ['free_subscription'],
    eligibilityDetail: { studentRequired: false, identityVerificationRequired: true, newUserOnly: false },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: true },
    availability: { chinaUsable: 'unknown' },
    why: {
      audience: '「经验证的教师 / 热门开源项目维护者」→ educator（教师）+ developer（开源维护者）',
      studentRequired: '面向教师与维护者，明确不是学生身份',
      chinaUsable: '官方页未提及中国大陆可用性'
    }
  },
  'GitHub Student Developer Pack': {
    audience: ['student', 'developer'],
    benefitType: ['student_plan', 'free_credits', 'developer_credit'],
    eligibilityDetail: { studentRequired: true, educationEmailRequired: 'unknown', identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: true },
    availability: { chinaUsable: 'unknown' },
    why: {
      benefitType: '「学生免费领取开发者工具包，含……合作方免费额度与服务」= 学生计划 + 赠送额度',
      manualApplication: '「申请 Student Developer Pack，通过后在 GitHub Education 中激活」'
    }
  },
  'Google AI Pro 学生免费': {
    audience: ['student'],
    benefitType: ['student_plan', 'free_subscription', 'trial'],
    eligibilityDetail: { studentRequired: true, educationEmailRequired: 'unknown', identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: { chinaUsable: false, regionRestriction: '官方学生优惠按国家/地区区分（美国为 AI Pro、美国以外为 AI Plus）' },
    why: {
      studentRequired: '「符合条件的高校学生」',
      benefitType: '「免费获得 12 个月 Google AI Pro」= 学生计划 + 免费订阅 + 12 个月试用期',
      chinaUsable: '原文写明按国家/地区区分而**未列出中国大陆** → 按「已知的地区限制」记 false，并把限制原文写进 regionRestriction',
      manualApplication: '「在 Google 官方学生 hub 领取」→ 自助领取'
    }
  },
  'Microsoft Azure for Students': {
    audience: ['student', 'developer'],
    benefitType: ['student_plan', 'free_credits', 'developer_credit'],
    eligibilityDetail: { studentRequired: true, educationEmailRequired: 'unknown', identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: false, manualApplication: false },
    availability: { chinaUsable: 'unknown' },
    why: {
      benefitType: '「学生免费获得 $100 Azure 额度（可用于 Azure OpenAI 等）」',
      creditCardRequired: '原文明确「均无需信用卡」→ false（这是本阶段少数有原文依据的 false）',
      studentRequired: '「用学校邮箱注册 Azure for Students」',
      chinaUsable: '官方页未提及中国大陆可用性'
    }
  },
  '微软 Microsoft 365 教育版': {
    audience: ['student', 'educator'],
    benefitType: ['discount', 'free_subscription'],
    eligibilityDetail: { studentRequired: true, educationEmailRequired: true, identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: { chinaUsable: 'unknown' },
    why: {
      audience: '「在校大学生及家长」；教育版同样面向教师 → student + educator（家长不在枚举内，不计）',
      benefitType: '「可 5 折购买含 Copilot 的 Microsoft 365」= discount；另「免费使用 Microsoft 365 for the web」= 免费订阅',
      educationEmailRequired: '「用大学邮箱可 5 折购买」「用学校邮箱验证身份」→ 明说用学校邮箱',
      studentRequired: '「在校大学生」'
    }
  },
  'AWS Activate': {
    audience: ['developer'],
    benefitType: ['free_credits', 'developer_credit'],
    eligibilityDetail: { studentRequired: false, newUserOnly: false, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: true },
    availability: { chinaUsable: 'unknown' },
    why: {
      audience: '「初创公司（含自筹与已融资团队）」→ 开发者/团队向（初创不在枚举内，按 developer 记并在此说明）',
      benefitType: '「最高 $200,000 AWS Activate Credits」',
      manualApplication: '「在 AWS Activate 申请页按阶段提交申请，通过后获得 credits」',
      studentRequired: '面向初创公司，与学生身份无关'
    }
  },
  'Figma for Education': {
    audience: ['student', 'educator', 'education'],
    benefitType: ['student_plan', 'free_subscription'],
    eligibilityDetail: { studentRequired: true, educationEmailRequired: true, identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: { chinaUsable: 'unknown' },
    why: {
      audience: '「学生和教师免费」→ student + educator；产品面向教育机构 → education',
      educationEmailRequired: '「用学生 / 教师邮箱注册账号」',
      benefitType: '「免费使用 Figma 与 FigJam」'
    }
  },
  'Notion 教育版': {
    audience: ['student', 'educator'],
    benefitType: ['student_plan', 'free_subscription'],
    eligibilityDetail: { studentRequired: true, educationEmailRequired: true, identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: { chinaUsable: 'unknown' },
    why: {
      studentRequired: '「高校学生与教育工作者」',
      educationEmailRequired: '「用学校邮箱登录后在 Billing 页选择……自动升级」',
      benefitType: '「免费获得 Notion Plus 计划」',
      manualApplication: '「选择『Get free Education plan』自动升级」',
      chinaUsable: '官方页未提及中国大陆可用性'
    }
  },
  'Notion for Nonprofits': {
    audience: ['other'],
    benefitType: ['discount'],
    eligibilityDetail: { studentRequired: false, identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: true },
    availability: { chinaUsable: 'unknown' },
    why: {
      audience: '「经核验的非营利组织」→ other（与 Claude 非营利同口径）',
      manualApplication: '「提交非营利证明材料申请，审核通过后……应用折扣」'
    }
  },
  'ElevenLabs 免费计划': {
    audience: ['general'],
    benefitType: ['free_subscription', 'free_credits'],
    eligibilityDetail: { studentRequired: false, newUserOnly: true, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: { chinaUsable: 'unknown' },
    why: {
      audience: '「所有新用户」→ general',
      benefitType: '「Free 计划 $0，每月 10,000 credits」= 免费档 + 每月额度',
      newUserOnly: '「所有新用户」'
    }
  },
  'Runway 免费计划': {
    audience: ['general'],
    benefitType: ['free_subscription', 'free_credits'],
    eligibilityDetail: { studentRequired: false, newUserOnly: true, identityVerificationRequired: 'unknown' },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: false },
    availability: { chinaUsable: 'unknown' },
    why: {
      newUserOnly: '「所有新用户」',
      benefitType: '「赠送一次性 125 credits」= 一次性额度'
    }
  },
  'Windsurf 学生折扣': {
    audience: ['student', 'developer'],
    benefitType: ['student_plan', 'discount'],
    eligibilityDetail: { studentRequired: true, educationEmailRequired: true, identityVerificationRequired: true },
    claimRequirements: { accountRequired: true, creditCardRequired: 'unknown', manualApplication: true },
    availability: { chinaUsable: 'unknown' },
    why: {
      benefitType: '「按折扣月费订阅 Windsurf Pro」= 学生折扣（非免费）',
      educationEmailRequired: '「需提交……学校邮箱……完成学生资格核验」',
      manualApplication: '「需提交姓名、就读院校、学校邮箱、出生日期等资料完成学生资格核验」'
    }
  }
};

/* ------------------------------------------------------------------ */

/** 按标题前缀匹配（标题里有型号等易变部分，用前缀更稳） */
function findEntry(title) {
  if (ENTRIES[title]) return { key: title, entry: ENTRIES[title] };
  const keys = Object.keys(ENTRIES).filter(key => title.startsWith(key));
  if (keys.length === 1) return { key: keys[0], entry: ENTRIES[keys[0]] };
  if (keys.length > 1) {
    // 取最长匹配（更具体）
    const key = keys.sort((a, b) => b.length - a.length)[0];
    return { key, entry: ENTRIES[key] };
  }
  return null;
}

function buildProvenance(entry, sourceUrl, verifiedAt) {
  const fields = {};
  for (const field of ['audience', 'benefitType', 'eligibilityDetail', 'claimRequirements', 'availability']) {
    // ⚠️ 判据必须是「这个字段组里有**已知值**」，而不是「决策对象里有这个键」。
    // 两种错法我都踩过：
    //   ① 判 `if (entry[field])` → dropFields 删空的组仍然是 `null`，于是出处指向一个
    //      记录上根本不存在的字段（validateDeal 报「写了却没生效」）；
    //   ② 判「有没有键」 → `{ newUserOnly: 'unknown' }` 有键、但**没有已知值**
    //      （unknown 是「我们查过、没有证据」），出处指向它同样报错。
    // 所以这里直接复用 lib 的 `hasKnown`（它正是为这件事写的），不自己再判一遍。
    if (!hasKnown(entry[field])) continue;
    fields[field] = { basis: SHARED.basis, derived: 'stated' };
  }
  // 一个字段都没留下就不写 provenance：出处声明不得指向空的字段组
  if (!Object.keys(fields).length) return null;
  const provenance = { credibility: SHARED.credibility, sourceUrl: sourceUrl, fields: fields };
  if (verifiedAt) provenance.verifiedAt = verifiedAt;
  return provenance;
}

function main() {
  let total = 0;
  let annotated = 0;
  const unchanged = [];
  /** 文件里「表会删掉/改写、而它确实有值」的字段（= 别人做过的定向补值） */
  const curatedEdits = [];
  /** 待写盘的文件（推迟到最后，让保护检查能拦住整批） */
  const pending = [];

  for (const spec of FILES) {
    const list = JSON.parse(fs.readFileSync(spec.file, 'utf8'));
    if (!Array.isArray(list)) throw new Error(`${spec.file} 必须是数组`);

    for (const raw of list) {
      total++;
      const hit = findEntry(raw.title);
      if (!hit) {
        unchanged.push(raw.title);
        continue;
      }
      // 按删减表裁剪：把第一版顺手写下的推断值（studentRequired:false / chinaUsable:true 等）
      // 全部去掉，只留原文真的说了的东西。见 DROP_DEFAULTS 的注释。
      const entry = dropFields(hit.entry, hit.key);

      // 新字段一律追加在记录末尾（zh 之后），既有 key 一个都不动。
      //
      // ⚠️ 两个都踩过的坑，一起写在这里：
      //
      // ① 决策为空时必须**主动删掉**该字段，而不是「跳过写入」—— 跳过意味着上一次跑留下的
      //    值会永远活着：本脚本第一版就是这样，把一版被否掉的 `chinaUsable:true` 留在了
      //    文件里，重跑「清理版」也擦不掉（实测 6/32 条）。
      //    幂等的正确形状是「结果由决策唯一决定」，与文件里原来有什么无关。
      //
      // ② 但「唯一决定」不等于「无条件覆盖」：本表是**初始**判断，之后有人在文件上做过
      //    定向补值（Azure 有原文依据的 `creditCardRequired:false`、若干
      //    `manualApplication:true`、腾讯/Kimi/魔搭 的 `chinaUsable:true` + inferred note）。
      //    直接按表覆盖会把它们**静默删掉**（DROP_DEFAULTS 会把表里没写的键一律当"我推断的"）。
      //    所以：文件里存在「表会删掉或改写、而它确实有值」的字段时，收集起来、**拒绝写盘**，
      //    由人决定是并入 ENTRIES 还是加 --force 覆盖。
      const ASSIGN = {
        audience: entry.audience,
        benefitType: entry.benefitType,
        eligibilityDetail: entry.eligibilityDetail,
        claimRequirements: entry.claimRequirements,
        availability: entry.availability
      };
      for (const [field, value] of Object.entries(ASSIGN)) {
        const existing = raw[field];
        if (!hasKnown(existing)) continue;              // 空/只有 unknown → 表说了算
        if (JSON.stringify(existing) === JSON.stringify(value === undefined ? null : value)) continue;
        curatedEdits.push({
          file: path.basename(spec.file),
          title: raw.title,
          field,
          existing: JSON.stringify(existing),
          table: JSON.stringify(value === undefined ? null : value)
        });
      }
      for (const [field, value] of Object.entries(ASSIGN)) {
        if (value) raw[field] = value;
        else delete raw[field];
      }
      const provenance = buildProvenance(entry, raw.url, raw.verifiedAt);
      if (provenance) raw.provenance = provenance;
      else delete raw.provenance;
      annotated++;
      if (DRY_RUN) {
        console.log(`\n── ${raw.title}`);
        console.log(`   audience        ${JSON.stringify(raw.audience || null)}`);
        console.log(`   benefitType     ${JSON.stringify(raw.benefitType || null)}`);
        console.log(`   eligibility     ${JSON.stringify(raw.eligibilityDetail || null)}`);
        console.log(`   claim           ${JSON.stringify(raw.claimRequirements || null)}`);
        console.log(`   availability    ${JSON.stringify(raw.availability || null)}`);
        console.log(`   依据            ${Object.entries(hit.entry.why).map(([k, v]) => `${k}: ${v}`).join(' / ')}`);
      }
    }

    // 先只解析与改写内存中的对象；**写盘推迟到全部文件都处理完**，
    // 这样「保护定向补值」的检查才有机会在写入之前拦住整批操作
    // （边处理边写的话，第一个文件已经落盘了才发现第二个文件有问题）。
    pending.push({ file: spec.file, list });
  }

  console.log(`\n合计 ${total} 条，已标注 ${annotated} 条，未标注 ${unchanged.length} 条（允许留空 = unknown）`);
  if (unchanged.length) unchanged.forEach(title => console.log(`  · 未标注：${title}`));

  // 保护别人做过的定向补值：见上面 ASSIGN 处的注释②
  if (curatedEdits.length && !FORCE) {
    console.error(`\n❌ 有 ${curatedEdits.length} 处人工定向补值会被本表删掉或改写 —— 拒绝写盘：`);
    curatedEdits.slice(0, 20).forEach(e =>
      console.error(`   · ${e.file} 「${e.title}」${e.field}\n       文件现值 ${e.existing}\n       本表会写成 ${e.table}`));
    if (curatedEdits.length > 20) console.error(`   …… 其余 ${curatedEdits.length - 20} 处省略`);
    console.error('\n   两个处置方式（都要求人做决定，脚本不替你做）：');
    console.error('   ① 把这些值并入本文件的 ENTRIES（推荐 —— 它们是有原文依据的人工判断）；');
    console.error('   ② 确认要以本表为准，加 --force 覆盖。');
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n(dry-run，未写盘)');
    return;
  }
  for (const { file, list } of pending) {
    fs.writeFileSync(file, `${JSON.stringify(list, null, 2)}\n`, 'utf8');
    console.log(`已写入 ${path.relative(ROOT, file)}`);
  }
}

main();
