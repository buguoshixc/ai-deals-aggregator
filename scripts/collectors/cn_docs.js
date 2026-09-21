/**
 * 国内来源采集器。
 *
 * 设计原则（经实测校准）：
 * 1. 只抓**官方文档中的"免费额度 / 免费模型"**这类真正的福利信息，
 *    不抓价格表 —— 价格表会让站点退化成"AI 工具介绍"，正是要修的问题。
 * 2. 每个适配器都必须实测有产出，零产出的适配器不上线。
 * 3. JS 渲染的页面（火山引擎文档、智谱控制台、各家控制台）一律放弃自动采集，改人工策展。
 *
 * 已实测淘汰：
 *   - bigmodel.cn/pricing（SPA 空壳，3.8KB）
 *   - qianfan.cloud.baidu.com/pricing（选择器不存在）
 *   - volcengine.com/docs/*（11KB JS 空壳，正文 0 命中）
 *   - api-docs.deepseek.com/quick_start/pricing（纯价格表，0 条优惠信号）
 *   - platform.moonshot.cn/docs/pricing/chat（纯价格表，仅"缓存优惠"计费说明）
 */

const cheerio = require('cheerio');
const { getText } = require('../lib/http');
const { cleanText } = require('../lib/schema');

/* ------------------------------------------------------------------ */
/* 百度千帆：新用户免费额度表（序号 | 服务名称 | 赠送Tokens量 | 有效期）  */
/* ------------------------------------------------------------------ */

const QIANFAN_URL = 'https://cloud.baidu.com/doc/qianfan/s/Imi2rpirg';

async function collectQianfan() {
  const html = await getText(QIANFAN_URL, { timeout: 25000 });
  const $ = cheerio.load(html);
  const items = [];

  $('table').each((_, table) => {
    const headers = $(table).find('tr').first().text();
    if (!/赠送|Tokens/i.test(headers) || !/服务名称|有效期/i.test(headers)) return;

    $(table).find('tr').slice(1).each((__, row) => {
      const cells = $(row).find('td');
      if (cells.length < 4) return;

      const model = cleanText($(cells[1]).text(), 80);
      const tokens = cleanText($(cells[2]).text(), 40);
      const validity = cleanText($(cells[3]).text(), 40);
      if (!model || !tokens) return;

      items.push({
        title: `${model} 新用户免费额度`,
        url: QIANFAN_URL,
        source: '百度千帆',
        vendor: '百度智能云',
        category: 'API服务',
        type: 'deal',
        discountInfo: `首次开通千帆即自动发放免费额度：赠送 ${tokens} Tokens，有效期 ${validity}`,
        description: '百度千帆大模型平台新用户免费额度，访问平台并同意用户协议后自动开通发放，仅可抵扣预置模型在线推理消耗的 Tokens。',
        eligibility: '千帆平台新用户（需实名认证）',
        validity: `自开通起 ${validity}`,
        pricingModel: 'free'
      });
    });
  });

  return items.slice(0, 20);
}

/* ------------------------------------------------------------------ */
/* 阿里云百炼：新用户免费额度（官方帮助文档，一条汇总条目）              */
/* ------------------------------------------------------------------ */

const ALIYUN_URL = 'https://help.aliyun.com/zh/model-studio/new-free-quota';

async function collectAliyun() {
  const html = await getText(ALIYUN_URL, { timeout: 25000 });
  const $ = cheerio.load(html);
  $('script,style,noscript,svg').remove();
  const text = $('body').text().replace(/\s+/g, ' ');

  const quota = text.match(/每个模型均有独立的免费额度[^。]{0,40}/);
  const region = text.match(/仅华北\s*2（北京）地域模型享有免费额度[^。]{0,30}/);
  const expire = text.match(/额度过期后[^。]{0,40}/);

  if (!quota) return [];

  const detail = [quota[0], region ? region[0] : null, expire ? expire[0] : null]
    .filter(Boolean)
    .join('；');

  return [{
    title: '阿里云百炼 新用户免费额度',
    url: ALIYUN_URL,
    source: '阿里云百炼',
    vendor: '阿里云',
    category: 'API服务',
    type: 'deal',
    discountInfo: `新用户开通百炼后各模型独立赠送免费额度：${detail}`,
    description: '阿里云百炼（Model Studio）对首次开通的用户发放通义千问等模型的免费 Token 额度，额度按模型独立计算，需完成实名认证后使用。',
    eligibility: '阿里云百炼新用户（需实名认证）',
    validity: '各模型额度有独立有效期，过期后剩余部分自动作废、不补发',
    pricingModel: 'free'
  }];
}

/* ------------------------------------------------------------------ */
/* 智谱 AI：模型总览页里所有指向 /models/free/ 的模型即免费模型          */
/* ------------------------------------------------------------------ */

const ZHIPU_OVERVIEW_URL = 'https://docs.bigmodel.cn/cn/guide/start/model-overview';
const ZHIPU_DOC_ORIGIN = 'https://docs.bigmodel.cn';

/** 免费模型页在总览表里以 /models/free/<slug> 链接出现，这是智谱自己的稳定标记 */
function zhipuCategory(model) {
  if (/^CogView/i.test(model)) return '图像绘画';
  if (/^CogVideo/i.test(model)) return '视频';
  return '对话模型';
}

async function collectZhipu() {
  const html = await getText(ZHIPU_OVERVIEW_URL, { timeout: 25000 });
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  $('table').each((_, table) => {
    $(table).find('tr').each((__, row) => {
      let freeHref = null;
      $(row).find('a[href]').each((___, a) => {
        const href = $(a).attr('href');
        if (!freeHref && href && /\/models\/free\//.test(href)) freeHref = href;
      });
      if (!freeHref) return;

      const cells = $(row).find('td,th');
      const model = cleanText($(cells[0]).text(), 60);
      const summary = cleanText($(cells[1]).text(), 120);
      if (!model || seen.has(freeHref)) return;
      seen.add(freeHref);

      items.push({
        title: `${model} 免费模型`,
        url: freeHref.startsWith('http') ? freeHref : `${ZHIPU_DOC_ORIGIN}${freeHref}`,
        source: '智谱AI',
        vendor: '智谱AI',
        category: zhipuCategory(model),
        type: 'deal',
        discountInfo: `官方模型列表标注为免费模型，调用价格 0 元${summary ? `：${summary}` : ''}`,
        description: '智谱开放平台（bigmodel.cn）注册并创建 API Key 后可直接调用，无需单独领取额度。',
        eligibility: '所有注册开发者（需实名认证开通）',
        validity: '长期有效（官方模型列表未标注截止日期）',
        pricingModel: 'free'
      });
    });
  });

  return items;
}

module.exports = [
  { id: 'cn_qianfan', name: '百度千帆', region: 'cn', collect: collectQianfan },
  { id: 'cn_aliyun', name: '阿里云百炼', region: 'cn', collect: collectAliyun },
  { id: 'cn_zhipu', name: '智谱AI', region: 'cn', collect: collectZhipu }
];
