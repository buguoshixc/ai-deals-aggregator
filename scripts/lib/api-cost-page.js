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
 *
 * \u8868\u683c\u672c\u8eab\u7531 `lib/api-cost.js` \u7684 `breakdownTable()` \u6e32\u67d3 —— \u4e0e\u9875\u9762\u5e95\u90e8
 * \u7684**\u5b9e\u65f6\u7ed3\u679c\u8868\u662f\u540c\u4e00\u4efd\u5217\u6a21\u578b**\uff08\u7ef4\u5ea6 / \u5355\u4ef7 / tokens / \u6210\u672c\uff09\uff0c
 * \u5426\u5219\u4e24\u5f20\u8868\u4f1a\u5404\u81ea\u6f02\u79fb\uff0c\u800c\u8bfb\u8005\u53ea\u80fd\u9760\u773c\u775b\u53d1\u73b0\u5b83\u4eec\u5bf9\u4e0d\u4e0a\u3002
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
  if (!computable) return '<p class="cost-msg">\u65e0\u53ef\u793a\u4f8b\u6a21\u578b</p>';

  var workload = { inputTokens: 1000000, outputTokens: 500000, cachedInputTokens: 200000, requests: 1 };
  var result = costLib.computeCost(computable.plan, computable.model, workload);
  var plan = computable.plan;

  // 固定用量逐项写出来（数字直接取自上面那个 workload 对象，不另抄一份）：
  // 示例与实时结果的数不一样，读者必须能一眼看出**差在哪个量**，否则只会以为算错了。
  var fixed = '\u56fa\u5b9a\u7528\u91cf\uff08\u4e0d\u968f\u4e0a\u65b9\u8f93\u5165\u53d8\u5316\uff09\uff1a'
    + '\u8f93\u5165 ' + costLib.formatNumber(workload.inputTokens)
    + ' \u00b7 \u8f93\u51fa ' + costLib.formatNumber(workload.outputTokens)
    + ' \u00b7 \u7f13\u5b58\u547d\u4e2d ' + costLib.formatNumber(workload.cachedInputTokens)
    + ' tokens \u00b7 \u8bf7\u6c42\u6570 ' + workload.requests;

  return '<div class="cost-example">'
    + '<h2 class="ph2">\u793a\u4f8b\uff08\u56fa\u5b9a\u8ba1\u7b97\uff0c\u975e\u5b98\u65b9\u62a5\u4ef7\uff09</h2>'
    + '<p class="cost-fix">' + escapeHtml(fixed) + '</p>'
    + '<div class="ptable-wrap">'
    + costLib.breakdownTable(result, { className: 'ptable cost-tbl' })
    + '</div>'
    + '<p class="cost-total-row"><span class="cost-total-lab">\u5408\u8ba1</span>'
    + '<span class="cost-total-val">' + escapeHtml(costLib.formatTotal(result)) + '</span></p>'
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
 * \u8868\u5355\u91cc\u7684\u4e00\u683c\uff1a\u53ef\u89c1\u6587\u5b57\u5728\u4e0a\u3001\u63a7\u4ef6\u5728\u4e0b\uff0c\u4e24\u8005\u540c\u5c5e\u4e00\u4e2a `<label>`\u3002
 * \u6587\u5b57\u5728\u4e0a\u800c\u4e0d\u662f\u5de6\u8fb9\uff1a\u4e09\u683c\u4e00\u884c\u65f6\uff0c\u63a7\u4ef6\u7684\u5de6\u8fb9\u7f18\u56e0\u6b64\u5bf9\u9f50\uff0c
 * \u800c\u4e0d\u662f\u9760\u300c\u54ea\u4e2a\u6807\u7b7e\u5b57\u591a\u300d\u51b3\u5b9a\u63a7\u4ef6\u8d77\u70b9\u3002
 */
function costField(label, control) {
  return '<label class="cost-field">'
    + '<span class="cost-lab">' + escapeHtml(label) + '</span>'
    + control
    + '</label>';
}

/**
 * \u9875\u9762\u6b63\u6587 HTML\u3002
 *
 * ## \u5e03\u5c40\u987a\u5e8f\uff08v3.1 \u6536\u5c3e\uff09\uff1a\u8ba1\u7b97\u5668\u5728\u9996\u5c4f\uff0c\u53e3\u5f84\u5728\u5e95\u90e8
 *
 * \u8ba1\u7b97\u5668\u662f\u8fd9\u4e00\u9875\u7684**\u4e3b\u4f53**\uff0c\u6240\u4ee5\u5b83\u5728 `h1` \u4e4b\u540e\u7b2c\u4e00\u4e2a\uff1b\u516d\u6761\u53e3\u5f84
 * \uff08\u4e0e\u9759\u6001\u793a\u4f8b\uff09\u5728\u5b83\u4e0b\u9762\u3002\u65e7\u987a\u5e8f\u662f\u516d\u6761\u53e3\u5f84 + \u793a\u4f8b\u5148\u5360\u6389\u6574\u4e2a\u9996\u5c4f\uff0c
 * \u8bfb\u8005\u8981\u6eda\u4e00\u5c4f\u624d\u770b\u5f97\u5230\u8f93\u5165\u6846 \u2014\u2014 H11 \u8981\u6c42\u9996\u5c4f\u5148\u7ed9\u6570\u636e\uff0c\u800c\u8fd9\u4e00\u9875\u7684\u6570\u636e
 * \u5c31\u662f\u300c\u4f60\u8f93\u5165\u7528\u91cf\u540e\u7b97\u51fa\u7684\u90a3\u4e2a\u6570\u300d\u3002\u53e3\u5f84\u4e00\u6761\u4e0d\u5220\uff08\u5b83\u4eec\u662f\u8fd9\u4e00\u9875\u7684\u8bda\u5b9e\u6027\u627f\u8bfa\uff09\uff0c
 * \u53ea\u662f\u6539\u5230\u7ed3\u679c\u4e0e\u793a\u4f8b\u4e4b\u540e\uff0c\u5e76\u52a0\u4e00\u4e2a `.ph2` \u6807\u9898\u8ba9\u5b83\u4eec\u53ef\u88ab\u626b\u5230\u3002
 *
 * \u987a\u5e8f\u91cc\u6709\u4e24\u4e2a\u4e0d\u80fd\u52a8\u7684\u7ea6\u675f\uff1a
 *   \u00b7 `.snote` \u5fc5\u987b\u7ee7\u7eed\u662f `#api-cost` \u7684**\u76f4\u63a5\u5b50\u8282\u70b9\u3001\u6ee1\u5bbd**\uff08\u4e0d\u8fdb\u4efb\u4f55\u5185\u8fb9\u8ddd\u5bb9\u5668\uff09\uff0c
 *     \u5426\u5219 `verify-site.js` \u00a722c \u7684 note-narrow / note-ink-narrow / note-axis \u4f1a\u7ea2\uff1b
 *   \u00b7 `table.ptable` \u662f\u00a722c \u8ba4\u7684\u300c\u4e3b\u6570\u636e\u533a\u300d\u951a\u70b9\uff0c\u4fdd\u6301\u5b83\u5728\u8bf4\u660e**\u4e4b\u524d**\uff0c
 *     \u8bf4\u660e\u56e0\u6b64\u843d\u5728\u9996\u5c4f\u533a\u4e4b\u5916\uff08\u5b83\u672c\u6765\u5c31\u4e0d\u8be5\u5728\u9996\u5c4f\uff09\u3002
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
    + '<div class="cost-panel">'
    + '<form data-api-cost-form class="cost-form">'
    + '<fieldset class="cost-fs">'
    + '<legend class="cost-legend">\u9009\u62e9\u6a21\u578b\u4e0e\u53c2\u6570</legend>'
    + '<div class="cost-grid">'
    + costField('\u6a21\u578b', '<select class="cost-ctl" data-model aria-label="\u9009\u62e9\u6a21\u578b">' + selects.modelOptions + '</select>')
    + costField('\u53d8\u4f53', '<select class="cost-ctl" data-variant aria-label="\u9009\u62e9\u53d8\u4f53">' + selects.variantOptions + '</select>')
    + costField('\u901a\u9053', '<select class="cost-ctl" data-channel aria-label="\u9009\u62e9\u901a\u9053">' + selects.channelOptions + '</select>')
    + '</div>'
    + '<div class="cost-grid">'
    + costField('\u8f93\u5165 tokens', '<input class="cost-ctl cost-num" type="text" data-input-tokens placeholder="0" inputmode="numeric" aria-label="\u8f93\u5165 token \u6570">')
    + costField('\u8f93\u51fa tokens', '<input class="cost-ctl cost-num" type="text" data-output-tokens placeholder="0" inputmode="numeric" aria-label="\u8f93\u51fa token \u6570">')
    + costField('\u8bf7\u6c42\u6570', '<input class="cost-ctl cost-num" type="text" data-requests value="1" inputmode="numeric" aria-label="\u8bf7\u6c42\u6570">')
    + '</div>'
    + '<details class="cost-adv"><summary>\u7f13\u5b58\u76f8\u5173\uff08\u53ef\u9009\uff09</summary>'
    + '<div class="cost-grid">'
    + costField('\u7f13\u5b58\u547d\u4e2d\u8f93\u5165', '<input class="cost-ctl cost-num" type="text" data-cached-tokens placeholder="0" inputmode="numeric">')
    + costField('\u7f13\u5b58\u5199\u5165(5min)', '<input class="cost-ctl cost-num" type="text" data-cache-write-tokens placeholder="0" inputmode="numeric">')
    + costField('\u7f13\u5b58\u5199\u5165(1h)', '<input class="cost-ctl cost-num" type="text" data-cache-write-long-tokens placeholder="0" inputmode="numeric">')
    + '</div></details>'
    + '</fieldset>'
    + '</form>'
    + '<div data-api-cost-results class="cost-results"></div>'
    + '</div>'
    + '\n'
    + example
    + '\n'
    + note({ kind: 'noscript-hint', slot: 'main-snote', classes: 'snote pnoscript', declaredBy: NOTES_DECLARED_BY },
      '<p class="snote pnoscript"><noscript>\u65e0 JavaScript \u65f6\u65e0\u6cd5\u8ba1\u7b97\u3002\u4e0a\u65b9\u7684\u793a\u4f8b\u662f\u9759\u6001\u9884\u6e32\u67d3\u7684\u56fa\u5b9a\u8ba1\u7b97\u7ed3\u679c\u3002</noscript></p>')
    + '\n'
    + '<h2 class="ph2">\u53e3\u5f84\u4e0e\u8bf4\u660e</h2>'
    + notesHtml
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
