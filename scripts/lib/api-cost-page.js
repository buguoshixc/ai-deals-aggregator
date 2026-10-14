/**
 * `/tools/api-cost/` 的**正文渲染**（v3.1：API 成本计算器）。
 *
 * ## 与 `/plans/api/` 的关系
 *
 * `/plans/api/` 回答「每个模型每百万 token 多少钱」（列事实）。
 * `/tools/api-cost/` 回答「给定用量，按官方单价算出多少钱」（算成本）。
 *
 * 前者是静态表（零控件），后者有表单控件（用户输入 token 数）。
 * 两者共用同一份数据（`api-plans.json`），但渲染方式和交互逻辑不同。
 *
 * ## 这一页的四条硬承诺（与 `/plans/api/` 同源）
 *
 * 1. **只算不判断**。没有评分、没有排名、没有"性价比"、没有"哪个更便宜"。
 *    页面上不许出现结论性词汇 —— 与套餐页**共用同一份** `FORBIDDEN_CLAIM_WORDS`。
 * 2. **单位永远与数字同时出现**。每个结果旁边写着币种和计费单位。
 *    **不把「每千」换算成「每百万」**。
 * 3. **缺值不占位**。没有那一档的价 ⇒ 标「该维度无已收录单价」；官方免费 ⇒ 0。
 * 4. **credits 绝不折算成 token**。计算器不接受 credits 输入。
 *
 * ## 纯函数
 *
 * 不读盘、不联网、不看时钟、不写盘 —— 输入是 api-plans 数据，
 * 输出是 HTML 字符串。
 */

'use strict';

const costLib = require('./api-cost');
const plansPage = require('./plans-page');

const FORBIDDEN_CLAIM_WORDS = plansPage.FORBIDDEN_CLAIM_WORDS;

const API_COST_ROUTE = 'tools/api-cost/';
const API_COST_HEADING = 'API \u6210\u672c\u8ba1\u7b97\u5668';
const API_COST_DESCRIPTION = '\u6309\u5b98\u65b9\u5355\u4ef7\u8ba1\u7b97 API \u8c03\u7528\u6210\u672c\uff1a\u8f93\u5165 token \u7528\u91cf\uff0c\u9009\u62e9\u6a21\u578b\u4e0e\u6863\u4f4d\uff0c\u9875\u9762\u6309\u5df2\u6536\u5f55\u7684\u5b98\u65b9\u4ef7\u683c\u7b97\u51fa\u6210\u672c\u3002\u53ea\u7b97\u4e0d\u5224\u65ad\u3002';

/** \u8bf4\u660e\u767b\u8bb0\uff08notes-manifest\uff09\uff1a`.snote` \u6784\u9020\u70b9\u7684 ctx.note \u6ce8\u5165\u70b9 */
const NOTES_DECLARED_BY = 'lib/api-cost-page.js';
function noteIn(source) {
  if (typeof source === 'function') return source;
  if (source && typeof source.note === 'function') return source.note;
  return function (decl, html) { return html; };
}

/**
 * \u6784\u5efa\u5185\u5d4c\u6570\u636e\u8f7d\u8377\uff08\u4ec5\u5305\u542b\u8ba1\u7b97\u9700\u8981\u7684\u5b57\u6bb5\uff0c\u4e0d\u542b evidence/restrictions\uff09\u3002
 */
function buildPayload(apiPlans) {
  return {
    updatedAt: apiPlans.updatedAt,
    plans: (apiPlans.plans || []).map(function (plan) {
      return {
        id: plan.id,
        provider: plan.provider,
        planName: plan.planName,
        channel: plan.channel,
        officialUrl: plan.officialUrl,
        lastSeen: plan.lastSeen,
        pricing: plan.pricing,
        models: (plan.models || []).map(function (model) {
          return {
            name: model.name,
            modelKey: model.modelKey,
            variant: model.variant,
            rates: model.rates,
            mediaRates: model.mediaRates,
            note: model.note
          };
        })
      };
    })
  };
}

/**
 * \u9884\u6e32\u67d3\u793a\u4f8b\uff08\u6807\u660e\u662f\u793a\u4f8b\uff09\u3002
 * \u7528\u7b2c\u4e00\u4e2a\u53ef\u8ba1\u7b97\u7684\u6a21\u578b + \u56fa\u5b9a\u5de5\u4f5c\u8d1f\u8f7d\u3002
 */
function renderExample(apiPlans) {
  var computable = null;
  for (var i = 0; i < apiPlans.plans.length; i++) {
    var plan = apiPlans.plans[i];
    for (var j = 0; j < plan.models.length; j++) {
      var model = plan.models[j];
      var check = costLib.isComputable(model);
      if (check.computable && model.rates.input > 0) {
        computable = { plan: plan, model: model };
        break;
      }
    }
    if (computable) break;
  }
  if (!computable) return '<p class="cost-no-data">\u65e0\u53ef\u793a\u4f8b\u6a21\u578b</p>';

  var workload = { inputTokens: 1000000, outputTokens: 500000, cachedInputTokens: 200000, requests: 1 };
  var result = costLib.computeCost(computable.plan, computable.model, workload);
  var plan = computable.plan;
  var model = computable.model;

  var dims = costLib.TOKEN_DIMENSIONS;
  var rows = dims.map(function (dim) {
    var d = result.dimensions[dim];
    if (!d || !d.computable) return '';
    return '<tr><th>' + escapeHtml(dim) + '</th>'
      + '<td>' + escapeHtml(String(d.rate)) + '</td>'
      + '<td>' + escapeHtml(costLib.formatNumber(d.tokens)) + '</td>'
      + '<td>' + escapeHtml(costLib.formatDimension(dim, d)) + '</td></tr>';
  }).join('');

  return '<div class="cost-example">'
    + '<h2>\u793a\u4f8b\uff08\u56fa\u5b9a\u8ba1\u7b97\uff0c\u975e\u5b98\u65b9\u62a5\u4ef7\uff09</h2>'
    + '<table class="ptable"><caption>\u6a21\u578b\uff1a' + escapeHtml(model.name)
    + ' \u00b7 \u5e01\u79cd\uff1a' + escapeHtml(plan.pricing.currency)
    + ' \u00b7 \u5355\u4f4d\uff1a' + escapeHtml(costLib.unitLabel(plan.pricing.unit)) + '</caption>'
    + '<thead><tr><th>\u7ef4\u5ea6</th><th>\u5355\u4ef7</th><th>tokens</th><th>\u6210\u672c</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table>'
    + '<p class="cost-total-row">\u5408\u8ba1\uff1a' + escapeHtml(costLib.formatTotal(result)) + '</p>'
    + '<p class="cost-source">\u8ba1\u7b97\u503c\u3002\u5355\u4ef7\u6765\u6e90\uff1a'
    + escapeHtml(plan.id) + ' \u00b7 \u6838\u5bf9\u65e5\u671f\uff1a' + escapeHtml(plan.lastSeen) + '</p>'
    + '</div>';
}

/**
 * \u6784\u5efa\u8868\u5355\u7684\u4e0b\u62c9\u9009\u9879\uff08\u6a21\u578b / \u53d8\u4f53 / \u901a\u9053\uff09\u3002
 */
function buildSelects(apiPlans) {
  var models = [];
  var variants = new Set(['standard']);
  var channels = new Set(['standard']);
  for (var i = 0; i < apiPlans.plans.length; i++) {
    var plan = apiPlans.plans[i];
    channels.add(plan.channel);
    for (var j = 0; j < plan.models.length; j++) {
      var model = plan.models[j];
      variants.add(model.variant || 'standard');
      models.push({
        key: model.modelKey,
        label: model.name + ' (' + plan.provider + ')',
        provider: plan.provider,
        modelKey: model.modelKey,
        variant: model.variant || 'standard',
        channel: plan.channel,
        hasRate: model.rates && model.rates.input !== null && model.rates.input !== undefined && model.rates.input > 0
      });
    }
  }
  models.sort(function (a, b) {
    var aScore = (a.hasRate ? 2 : 0) + (a.variant === 'standard' ? 1 : 0);
    var bScore = (b.hasRate ? 2 : 0) + (b.variant === 'standard' ? 1 : 0);
    if (aScore !== bScore) return bScore - aScore;
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });

  function opts(items, valKey, labelKey) {
    return items.map(function (item) {
      return '<option value="' + escapeHtml(String(item[valKey])) + '">' + escapeHtml(String(item[labelKey])) + '</option>';
    }).join('');
  }

  return {
    modelOptions: opts(models, 'modelKey', 'label'),
    variantOptions: Array.from(variants).sort(function (a, b) {
      if (a === 'standard') return -1;
      if (b === 'standard') return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    }).map(function (v) {
      return '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>';
    }).join(''),
    channelOptions: Array.from(channels).sort(function (a, b) {
      if (a === 'standard') return -1;
      if (b === 'standard') return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    }).map(function (c) {
      return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
    }).join('')
  };
}

/**
 * \u9875\u9762\u6b63\u6587 HTML\u3002
 */
function apiCostPageBody(apiPlans, ctx) {
  var note = noteIn(ctx);
  var prefix = (ctx && ctx.prefix) || '../../';
  var payload = buildPayload(apiPlans);
  var selects = buildSelects(apiPlans);
  var example = renderExample(apiPlans);

  var notes = [
    '\u8fd9\u662f\u4e00\u4e2a\u8ba1\u7b97\u5de5\u5177\uff0c\u4e0d\u662f\u5b98\u65b9\u62a5\u4ef7\u3002\u7ed3\u679c\u6309\u4f60\u8f93\u5165\u7684\u7528\u91cf\u548c\u5df2\u6536\u5f55\u7684\u5b98\u65b9\u5355\u4ef7\u8ba1\u7b97\uff0c\u4e0d\u4ee3\u8868\u5b98\u65b9\u627f\u8bfa\u3002',
    '\u5b98\u65b9\u4ef7\u683c\u53ef\u80fd\u5df2\u53d8\uff08\u6700\u540e\u6838\u5bf9\u65e5\u671f\u89c1\u6bcf\u6761\u7ed3\u679c\uff09\uff1b\u6211\u4eec\u4e5f\u53ef\u80fd\u6536\u5f55\u9519\u2014\u2014\u8bf7\u70b9\u5b98\u65b9\u5b9a\u4ef7\u9875\u6838\u5bf9\u3002',
    '\u7f3a\u7ef4\u5ea6\u4e0d\u56de\u9000\u6807\u51c6\u4ef7\uff1a\u67d0\u4e2a\u6a21\u578b\u6ca1\u6709\u7f13\u5b58\u547d\u4e2d\u4ef7\uff0c\u5c31\u4e0d\u4f1a\u7528\u8f93\u5165\u4ef7\u9876\u4e0a\u3002',
    '0 \u4e0e null \u662f\u4e24\u53e5\u4e0d\u540c\u7684\u8bdd\uff1a\u5b98\u65b9\u514d\u8d39 = 0\uff0c\u6ca1\u6709\u90a3\u4e00\u6863\u7684\u4ef7 = \u7b97\u4e0d\u51fa\u3002',
    '\u4e0d\u8de8\u5e01\u79cd\u6c42\u548c\u3002CNY \u548c USD \u53ea\u80fd\u5e76\u6392\u5c55\u793a\uff0c\u4e0d\u6298\u7b97\u3001\u4e0d\u6c42\u548c\u3002',
    'credits \u4e0d\u8fdb\u8ba1\u7b97\u5668\uff1acredits \u662f\u94b1\uff0c\u4e0d\u662f token \u6570\u91cf\u3002'
  ];

  var notesHtml = notes.map(function (text) {
    return note({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY },
      '<p class="snote">' + escapeHtml(text) + '</p>');
  }).join('\n');

  var body = '<div id="api-cost">'
    + '<div class="stop">'
    + '<h1>' + escapeHtml(API_COST_HEADING) + '</h1>'
    + '<span class="meta">v3.1 \u00b7 \u6309\u5b98\u65b9\u5355\u4ef7\u8ba1\u7b97</span>'
    + '</div>'
    + '\n'
    + notesHtml
    + '\n'
    + example
    + '\n'
    + note({ kind: 'noscript-hint', slot: 'main-snote', classes: 'snote pnoscript', declaredBy: NOTES_DECLARED_BY },
      '<p class="snote pnoscript"><noscript>\u65e0 JavaScript \u65f6\u65e0\u6cd5\u8ba1\u7b97\u3002\u4e0a\u65b9\u7684\u793a\u4f8b\u662f\u9759\u6001\u9884\u6e32\u67d3\u7684\u56fa\u5b9a\u8ba1\u7b97\u7ed3\u679c\u3002</noscript></p>')
    + '\n'
    + '<form data-api-cost-form class="cost-form">'
    + '<fieldset><legend>\u9009\u62e9\u6a21\u578b\u4e0e\u53c2\u6570</legend>'
    + '<div class="cost-row">'
    + '<label class="pclab">\u6a21\u578b <select data-model aria-label="\u9009\u62e9\u6a21\u578b">' + selects.modelOptions + '</select></label>'
    + '<label class="pclab">\u53d8\u4f53 <select data-variant aria-label="\u9009\u62e9\u53d8\u4f53">' + selects.variantOptions + '</select></label>'
    + '<label class="pclab">\u901a\u9053 <select data-channel aria-label="\u9009\u62e9\u901a\u9053">' + selects.channelOptions + '</select></label>'
    + '</div>'
    + '<div class="cost-row">'
    + '<label class="pclab">\u8f93\u5165 tokens <input type="text" data-input-tokens placeholder="0" inputmode="numeric" aria-label="\u8f93\u5165 token \u6570"></label>'
    + '<label class="pclab">\u8f93\u51fa tokens <input type="text" data-output-tokens placeholder="0" inputmode="numeric" aria-label="\u8f93\u51fa token \u6570"></label>'
    + '<label class="pclab">\u8bf7\u6c42\u6570 <input type="text" data-requests value="1" inputmode="numeric" aria-label="\u8bf7\u6c42\u6570"></label>'
    + '</div>'
    + '<details class="cost-advanced"><summary>\u7f13\u5b58\u76f8\u5173\uff08\u53ef\u9009\uff09</summary>'
    + '<div class="cost-row">'
    + '<label class="pclab">\u7f13\u5b58\u547d\u4e2d\u8f93\u5165 <input type="text" data-cached-tokens placeholder="0" inputmode="numeric"></label>'
    + '<label class="pclab">\u7f13\u5b58\u5199\u5165(5min) <input type="text" data-cache-write-tokens placeholder="0" inputmode="numeric"></label>'
    + '<label class="pclab">\u7f13\u5b58\u5199\u5165(1h) <input type="text" data-cache-write-long-tokens placeholder="0" inputmode="numeric"></label>'
    + '</div></details>'
    + '</fieldset>'
    + '</form>'
    + '\n'
    + '<div data-api-cost-results class="cost-results"></div>'
    + '\n'
    + '<script type="application/json" id="api-cost-data">' + JSON.stringify(payload) + '</script>'
    + '\n'
    + '<p class="cost-footer-link"><a href="' + prefix + 'plans/api/">\u67e5\u770b API \u8ba1\u8d39\u5bf9\u6bd4\u8868 →</a></p>'
    + '</div>'
    ;

  return body;
}

/**
 * \u8bda\u5b9e\u6027\u65ad\u8a00\uff1a\u68c0\u67e5\u9875\u9762\u6587\u672c\u662f\u5426\u542b\u7981\u6b62\u8bcd\u6c47\u3002
 */
function assertPageHonesty(html) {
  var problems = [];
  var text = html.replace(/<[^>]+>/g, ' ');
  for (var i = 0; i < FORBIDDEN_CLAIM_WORDS.length; i++) {
    var word = FORBIDDEN_CLAIM_WORDS[i];
    if (text.indexOf(word) !== -1) {
      problems.push('\u9875\u9762\u542b\u7981\u6b62\u8bcd\u300c' + word + '\u300d');
    }
  }
  if (/credits[^<]{0,40}(\u53ef\u8d2d|\u53ef\u8d2d\u4e70|\u7ea6\s*[\d.]+\s*(\u4e07|\u4ebf)?\s*(token|Token|tokens))/.test(text)) {
    problems.push('\u9875\u9762\u628a credits \u6298\u7b97\u6210\u4e86 token \u6570\u91cf');
  }
  return problems;
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

module.exports = {
  API_COST_ROUTE: API_COST_ROUTE,
  API_COST_HEADING: API_COST_HEADING,
  API_COST_DESCRIPTION: API_COST_DESCRIPTION,
  NOTES_DECLARED_BY: NOTES_DECLARED_BY,
  buildPayload: buildPayload,
  apiCostPageBody: apiCostPageBody,
  renderExample: renderExample,
  assertPageHonesty: assertPageHonesty,
  FORBIDDEN_CLAIM_WORDS: FORBIDDEN_CLAIM_WORDS
};
