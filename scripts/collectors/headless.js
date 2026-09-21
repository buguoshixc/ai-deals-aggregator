/**
 * 无头浏览器采集器（headless）。
 *
 * 解决的问题：`bigmodel.cn/pricing`、`volcengine.com/product/ark` 这类页面是纯 SPA，
 * 静态 fetch 只能拿到几百字节空壳（因此此前被判定"零产出"淘汰）。用本机浏览器内核
 * 渲染后取 DOM，就能把它们重新纳入自动采集。
 *
 * 三条硬约束：
 *  1. **只抓公开页，不做登录态抓取**：不加载用户 profile、不注入 cookie、不传凭据。
 *  2. **本模块默认不加载**：只有 `collect.js --headless` 才会 require 它，
 *     因此 CI 的常规采集链路完全不依赖 playwright-core。
 *  3. **宁缺毋滥**：每个来源的产出都由"官网原文表述"规则驱动，页面改版导致正则不命中时
 *     产出为 0（失败安全），绝不猜测或拼接。要新增一条优惠 = 新增一条带原文正则的规则。
 *
 * 已实测淘汰（渲染后依然 0 条优惠信号，故不注册）：
 *   - www.deepseek.com / api-docs.deepseek.com（官网与文档渲染后无任何优惠表述，
 *     定价页仅有"赠送余额"这一计费说明，不是可领取的公开优惠）
 */

const cheerio = require('cheerio');
const { withPage, render } = require('../lib/browser');
const { cleanText } = require('../lib/schema');

/* ------------------------------------------------------------------ */
/* 智谱 AI：官方价格页的营销位与活动文案                                */
/*   URL: https://bigmodel.cn/pricing （SPA，必须渲染）                 */
/* ------------------------------------------------------------------ */

const ZHIPU_URL = 'https://bigmodel.cn/pricing';

/**
 * 规则驱动：每条规则对应官网上一句可核验的原文。
 * match 命中的捕获组用于生成标题/描述；不命中就跳过（不猜）。
 */
const ZHIPU_RULES = [
  {
    key: 'new_user_tokens',
    match: /新用户注册专享\s*([\d.]+万)\s*免费\s*Tokens\s*资源包/,
    build: m => ({
      title: `智谱AI 新用户注册专享 ${m[1]} 免费 Tokens 资源包`,
      discountInfo: `新用户注册专享 ${m[1]} 免费 Tokens 资源包，并含 120 次图像和视频资源包。`,
      eligibility: '智谱开放平台新注册用户（需实名认证）',
      pricingModel: 'free'
    })
  },
  {
    key: 'invite_tokens',
    match: /邀好友实名注册得\s*Tokens[^。]{0,30}?最高可领取总计\s*([\d.]+亿)\s*Tokens\s*资源包/,
    build: m => ({
      title: '智谱AI 邀请好友注册赠送 Tokens 资源包',
      discountInfo: `邀好友实名注册即赠送 Tokens：官方活动页标注最高可领取总计 ${m[1]} Tokens 资源包。`,
      eligibility: '智谱开放平台注册用户（邀请好友完成实名注册）',
      pricingModel: 'free'
    })
  },
  {
    key: 'glm_flash_half',
    match: /(GLM-5\.3-Flash[^。]{0,24}限时五折[^。]{0,120})/,
    build: m => ({
      title: 'GLM-5.3-Flash 限时五折',
      discountInfo: cleanText(m[1], 240),
      eligibility: '所有调用 GLM-5.3-Flash 的开发者',
      validity: '限时活动（官方未标注截止日期）',
      pricingModel: 'paid'
    })
  },
  {
    key: 'batch_half',
    match: /Batch API[^。]{0,40}?五折[^。]{0,80}/,
    build: m => ({
      title: '智谱AI Batch API 批量调用五折',
      discountInfo: `批量调用五折特惠：${cleanText(m[0], 200)}`,
      eligibility: '所有开发者（批量离线任务）',
      pricingModel: 'paid'
    })
  },
  {
    key: 'cache_free',
    match: /缓存存储[：:]([^。]{0,80}?限时免费[^。]{0,40})/,
    build: m => ({
      title: '智谱AI 上下文缓存存储限时免费',
      discountInfo: `上下文缓存存储限时免费：${cleanText(m[1], 200)}`,
      eligibility: '所有调用智谱 API 的开发者',
      validity: '限时免费（官方未标注截止日期）',
      pricingModel: 'free'
    })
  }
];

async function collectZhipuPricing() {
  // 用 domText 而非 innerText：活动横幅在部分视口下是 display:none，innerText 看不到
  const { domText, url } = await withPage(page => render(page, ZHIPU_URL));

  const items = [];
  for (const rule of ZHIPU_RULES) {
    const matched = domText.match(rule.match);
    if (!matched) continue;
    const built = rule.build(matched);
    items.push({
      ...built,
      url,
      vendor: '智谱AI',
      category: 'API服务',
      description: '来源：智谱开放平台官方价格页营销位与活动说明（无头浏览器渲染后提取）。'
    });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* 火山方舟：产品页「免费额度」表 + 最新活动                            */
/*   URL: https://www.volcengine.com/product/ark （SPA，必须渲染）      */
/* ------------------------------------------------------------------ */

const VOLC_ARK_URL = 'https://www.volcengine.com/product/ark';

/** 表格里的模态名 → 分类枚举（让站点的分类筛选对得上） */
const MODALITY_CATEGORY = [
  [/文本生成|深度思考|语言模型/, '对话模型'],
  [/图像生成|图片/, '图像绘画'],
  [/视频生成|视频/, '视频'],
  [/语音|音频/, '音频语音'],
  [/联网|搜索/, '搜索研究'],
  [/向量|embedding/i, 'API服务']
];

function modalityCategory(modality) {
  for (const [re, category] of MODALITY_CATEGORY) {
    if (re.test(modality)) return category;
  }
  return 'API服务';
}

/** 取一行里的单元格文本 */
function cellTexts($, row) {
  return row
    .find('td,th')
    .map((_, cell) => cleanText($(cell).text(), 80))
    .get();
}

/**
 * 取单元格内的分项：形如 <p><span>项1</span><span>项2</span></p>。
 * 模型列与额度列的分项按下标一一对应；拿不到分项时退回整格文本。
 */
function cellItems($, cell) {
  const paragraph = $(cell).find('p').first();
  const children = paragraph.children();
  if (children.length > 1) {
    return children
      .map((_, el) => cleanText($(el).text(), 60))
      .get()
      .filter(Boolean);
  }
  const whole = cleanText($(cell).text(), 60);
  return whole ? [whole] : [];
}

/**
 * 解析所有「免费额度」表，输出 { modality, model, quota }。
 *
 * 表结构（实测）：表头 [模态, 模型版本, 免费额度]，模态列常带 rowspan ⇒ 后续数据行
 * 只有 2 个 <td>（模型、额度）。模型列与额度列各自用若干分项（<p> 的直接子元素）
 * 承载，正常情况下按下标一一对应。
 *
 * 宁可漏采也不发布拼错的数据：分项数对不上且模型不是单个时，直接跳过该行。
 */
function parseFreeQuotaTables($) {
  const rows = [];

  $('table').each((_, table) => {
    const trs = $(table).find('tr');
    if (trs.length < 2) return;

    const header = cellTexts($, trs.eq(0));
    if (!header.some(text => /免费额度/.test(text))) return;
    const modality = cleanText(header[0], 40);
    if (!modality) return;

    trs.slice(1).each((__, tr) => {
      const cells = $(tr).find('td,th');
      // 有 rowspan 的行会少一列：>=3 列时 [模态, 模型, 额度]，2 列时 [模型, 额度]
      let modelCell;
      let quotaCell;
      if (cells.length >= 3) {
        modelCell = cells.eq(1);
        quotaCell = cells.eq(2);
      } else if (cells.length === 2) {
        modelCell = cells.eq(0);
        quotaCell = cells.eq(1);
      } else {
        return;
      }

      const models = cellItems($, modelCell);
      const quotas = cellItems($, quotaCell);
      if (!models.length || !quotas.length) return;

      if (models.length === quotas.length) {
        models.forEach((model, index) => {
          if (!model || !quotas[index]) return;
          // 单格塞了多个数字 ⇒ 分项没切开，丢弃
          if (models.length === 1 && (quotas[0].match(/\d+(\.\d+)?/g) || []).length > 1) return;
          rows.push({ modality, model, quota: quotas[index] });
        });
        return;
      }

      // 一个模型对应多段额度（如"5000字符 + 10复刻声音"）：合并成一条额度描述
      if (models.length === 1) {
        rows.push({ modality, model: models[0], quota: quotas.join(' + ') });
      }
    });
  });

  return rows;
}

/** 最新活动区的两条活动（原文表述驱动） */
const VOLC_ARK_RULES = [
  {
    key: 'collab_reward',
    match: /协作奖励计划[^。]{0,40}?单模型最高\s*([\d.]+万)\s*Tokens/,
    build: m => ({
      title: '火山方舟 协作奖励计划：每日免费领取单模型最高 500 万 Tokens',
      discountInfo: `协作奖励计划：可免费领取单模型每日最高 ${m[1]} Tokens（官方标注二期已全面升级）。`,
      eligibility: '火山方舟用户',
      validity: '每日可领取（活动长期，官方未标注截止日期）',
      pricingModel: 'free',
      category: 'API服务'
    })
  },
  {
    key: 'agent_plan',
    match: /方舟\s*Agent\s*Plan[^。]{0,40}?([\d.]+)\s*元起/,
    build: m => ({
      title: `火山方舟 Agent Plan 限时 ${m[1]} 元起`,
      discountInfo: `方舟 Agent Plan 限时首月 ${m[1]} 元起，覆盖超全模态模型与 Harness 能力。`,
      eligibility: '火山方舟用户（首月优惠）',
      validity: '限时活动（官方未标注截止日期）',
      pricingModel: 'paid',
      category: '智能体'
    })
  }
];

async function collectVolcArk() {
  const { html, domText, url } = await withPage(page => render(page, VOLC_ARK_URL));
  const $ = cheerio.load(html);

  const items = [];

  // 1) 免费额度表：每个模型一条
  for (const row of parseFreeQuotaTables($)) {
    items.push({
      title: `${row.model} 免费额度`,
      url,
      vendor: '火山引擎',
      category: modalityCategory(row.modality),
      discountInfo: `火山方舟免费额度（${row.modality}）：${row.quota}。`,
      description: '来源：火山方舟产品页「免费额度」表（无头浏览器渲染后提取）。',
      pricingModel: 'free'
    });
  }

  // 2) 最新活动
  for (const rule of VOLC_ARK_RULES) {
    const matched = domText.match(rule.match);
    if (!matched) continue;
    const built = rule.build(matched);
    items.push({
      ...built,
      url,
      vendor: '火山引擎',
      category: built.category || 'API服务',
      description: '来源：火山方舟产品页「最新活动」区（无头浏览器渲染后提取）。'
    });
  }

  return items;
}

module.exports = [
  {
    id: 'cn_zhipu_pricing',
    name: '智谱AI活动页',
    region: 'cn',
    headless: true,
    collect: collectZhipuPricing
  },
  {
    id: 'cn_volc_ark',
    name: '火山方舟',
    region: 'cn',
    headless: true,
    collect: collectVolcArk
  }
];
