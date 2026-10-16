/**
 * API 成本计算器（/tools/api-cost/）的**计算逻辑**，一份实现、两个宿主。
 *
 * ## 为什么是「双宿主」而不是两个文件
 *
 * 这些语义必须**同时**活在两个地方：
 *   · 浏览器里（读者填表单、选模型、改 token 数时实时算）；
 *   · 构建期与离线自测里（`api-cost-selftest.js` 直接 `require` 它，给这些语义长牙）。
 *
 * 复制两份是这一页最容易分家的写法（"页面上的计算和自测里的计算不是同一件事"），
 * 而分家之后**两边都还是绿的**。所以：文件末尾 `module.exports` 给 Node，
 * `init(document)` 给浏览器，`build-local.js` 把本文件的源码**逐字节内联**进页面 ——
 * 内联的那一份与 `require` 的那一份在结构上不可能是两个版本。
 *
 * ## 纪律（与 `lib/plans-compare.js` 同一条）
 *
 * 纯函数不读盘、不联网、不看时钟、不写盘；**不做价值判断**（不评分、不排名、不推荐、不折价）。
 * 不可比较的东西永远不进比较：`null` 不是 0，也不参与任何求和。
 *
 * ## 红线
 *
 * 1. **缺维度绝不回退标准价**：cachedInput 缺了不能拿 input 价顶上。
 * 2. **0 与 null 是两句不同的话**：官方免费 = 0，没有那一档的价 = null（算不出）。
 * 3. **不跨币种求和**：CNY 和 USD 只能出两张并排结果，永不求和。
 * 4. **不折算 credits → tokens**：credits 是钱，不是 token 数量。
 * 5. **分档 / 通道必须用户显式选**：自动挑档 = 替用户做判断。
 */

(function () {
  'use strict';

  var MODULE_VERSION = '1.0.0';

  /**
   * 计价单位 → 除数。单价是「每 N tokens 的价格」，算成本时要把 token 数除以 N。
   * **不做换算**：per_1K 不会乘 1000 变成 per_1M —— 换算会让两个口径不同的数字看起来可直接比较。
   */
  var UNIT_DIVISORS = {
    per_1M_tokens: 1000000,
    per_1K_tokens: 1000
  };

  /** 舍入到 6 位小数（内部计算精度；显示精度由 formatNumber 另外控制） */
  var ROUND_DIGITS = 6;

  /** token 输入上限（防溢出；远超真实用量但仍在 double 安全区内） */
  var MAX_TOKENS = 1e15;

  /** 参与 token 计算的维度（顺序即显示顺序） */
  var TOKEN_DIMENSIONS = ['input', 'output', 'cachedInput', 'cacheWrite', 'cacheWriteLong'];

  /**
   * FORBIDDEN_CLAIM_WORDS —— 与套餐页**同一份**清单（唯一出处 `lib/plans-page.js`）。
   * Node 里 require 拿到；浏览器里内联脚本不在本模块查（页面渲染层负责）。
   */
  var FORBIDDEN_CLAIM_WORDS;
  if (typeof require === 'function') {
    try { FORBIDDEN_CLAIM_WORDS = require('./plans-page').FORBIDDEN_CLAIM_WORDS; } catch (e) {}
  }
  if (!FORBIDDEN_CLAIM_WORDS) FORBIDDEN_CLAIM_WORDS = [];

  /**
   * 判断一个模型是否可以进 token 计算器。
   *
   * 不能进的两种情况：
   *   · mediaRates 非空 → 按 分钟 / 每秒 / 每 1M token·小时 等非 token 口径计费（8 条）
   *   · rates.input === null → 没有输入价（如 gpt-live-1，按分钟计价走 mediaRates）
   *
   * @param {object} model — api-plans.json 的 models[] 元素
   * @returns {{ computable: boolean, reason: string|null }}
   */
  function isComputable(model) {
    if (!model || !model.rates) return { computable: false, reason: 'no-rates' };
    if (model.mediaRates && model.mediaRates.length > 0) return { computable: false, reason: 'non-token-pricing' };
    if (model.rates.input === null || model.rates.input === undefined) return { computable: false, reason: 'no-input-price' };
    return { computable: true, reason: null };
  }

  /**
   * 把 token 数量解析成 number。拒绝负数、NaN、科学计数里的溢出。
   * 全角数字 → 半角；千分位逗号 → 去掉；空串 / null / undefined → 0。
   *
   * @param {string|number|null|undefined} raw
   * @returns {{ value: number, valid: boolean, error: string|null }}
   */
  function parseTokens(raw) {
    if (raw === null || raw === undefined || raw === '') return { value: 0, valid: true, error: null };
    if (typeof raw === 'number') {
      if (!isFinite(raw) || raw < 0) return { value: 0, valid: false, error: 'invalid-number' };
      if (raw > MAX_TOKENS) return { value: 0, valid: false, error: 'overflow' };
      return { value: raw, valid: true, error: null };
    }
    var s = String(raw).trim();
    if (s === '') return { value: 0, valid: true, error: null };
    // 全角 → 半角
    s = s.replace(/[\uFF10-\uFF19]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48); });
    s = s.replace(/\uFF0E/g, '.').replace(/\uFF0C/g, '').replace(/[\u2018\u2019\u201C\u201D]/g, '');
    // 去千分位逗号
    s = s.replace(/,/g, '');
    var n = parseFloat(s);
    if (isNaN(n)) return { value: 0, valid: false, error: 'not-a-number' };
    if (n < 0) return { value: 0, valid: false, error: 'negative' };
    if (n > MAX_TOKENS) return { value: 0, valid: false, error: 'overflow' };
    return { value: n, valid: true, error: null };
  }

  /**
   * 固定舍入：到 ROUND_DIGITS 位小数，四舍五入。
   * 不用 toLocaleString / toFixed 的 locale 行为 —— 自己实现，确保两次构建不漂。
   */
  function round(n) {
    if (n === null || n === undefined || isNaN(n)) return null;
    var f = Math.pow(10, ROUND_DIGITS);
    return Math.round(n * f) / f;
  }

  /**
   * 千分位格式化（不用 toLocaleString，确保跨 locale 不漂）。
   * 0 → 「0」；null → 「—」；大数加千分位逗号。
   */
  function formatNumber(n) {
    if (n === null || n === undefined || isNaN(n)) return '\u2014';
    if (n === 0) return '0';
    var abs = Math.abs(n);
    var str;
    if (abs >= 100) str = n.toFixed(2);
    else if (abs >= 1) str = n.toFixed(4);
    else if (abs >= 0.000001) str = n.toFixed(6);
    else str = n.toExponential(2);
    var parts = str.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  /**
   * 币种符号。
   */
  var CURRENCY_SYMBOL = { CNY: '\u00a5', USD: '$' };

  function currencyLabel(currency) {
    return CURRENCY_SYMBOL[currency] || currency || '';
  }

  /**
   * 计费单位的显示标签。
   */
  var UNIT_LABELS = {
    per_1M_tokens: '/ \u6bcf 100 \u4e07 tokens',
    per_1K_tokens: '/ \u6bcf 1000 tokens'
  };

  function unitLabel(unit) {
    return UNIT_LABELS[unit] || unit || '';
  }

  /**
   * 计算 API 调用成本。
   *
   * @param {object} plan — api-plans.json 的 plans[] 元素（含 pricing / channel / officialUrl / lastSeen / id）
   * @param {object} model — plan.models[] 元素（含 modelKey / variant / rates / mediaRates / note）
   * @param {object} inputs — 用户输入
   * @param {number} inputs.inputTokens — 输入 token 数
   * @param {number} inputs.outputTokens — 输出 token 数
   * @param {number|null} [inputs.cachedInputTokens] — 缓存命中输入 token 数（可选）
   * @param {number|null} [inputs.cacheWriteTokens] — 缓存写入（5min TTL）token 数（可选）
   * @param {number|null} [inputs.cacheWriteLongTokens] — 缓存写入（1h TTL）token 数（可选）
   * @param {number} [inputs.requests=1] — 请求数（token 总量 = 请求数 × 单请求 tokens）
   * @returns {object} 结果对象
   *
   * ## 算法规则（顺序不能改）
   *
   * 1. 先判「这个模型能不能进 token 计算器」（mediaRates / input=null → 不能）
   * 2. 再判「用户填的每个维度，这个模型有没有价」
   * 3. 有价 → 算：cost = rate × tokens / divisor × requests
   * 4. 无价但用户填了 → 标「该维度无已收录单价」（**不回退 input 价**）
   * 5. 无价且用户没填 → 跳过（不报错、不算 0）
   * 6. rate=0 → cost=0（官方明说免费，是对的）
   * 7. 汇总：只把 computable 的维度加进 total
   * 8. 舍入：固定 6 位小数
   */
  function computeCost(plan, model, inputs) {
    if (!plan || !model || !inputs) return { computable: false, reason: 'missing-args' };

    var pricing = plan.pricing || {};
    var currency = pricing.currency || null;
    var unit = pricing.unit || null;
    var unitNote = pricing.unitNote || null;
    var divisor = UNIT_DIVISORS[unit];

    if (!divisor) return { computable: false, reason: 'unknown-unit', unit: unit };

    // Step 1: 这个模型能不能进 token 计算器
    var check = isComputable(model);
    if (!check.computable) {
      return {
        computable: false,
        reason: check.reason,
        currency: currency,
        unit: unit,
        unitNote: unitNote,
        planId: plan.id || null,
        officialUrl: plan.officialUrl || null,
        lastSeen: plan.lastSeen || null
      };
    }

    var rates = model.rates;
    var requests = inputs.requests || 1;
    if (requests < 1) requests = 1;

    // Step 2-7: 逐维度判断 + 计算
    var dimensions = {};
    var total = 0;
    var hasAnyComputable = false;

    for (var i = 0; i < TOKEN_DIMENSIONS.length; i++) {
      var dim = TOKEN_DIMENSIONS[i];
      var rate = rates[dim];
      var tokenKey = dim + 'Tokens';
      var rawTokens = inputs[tokenKey];
      var parsed = parseTokens(rawTokens);

      if (rate === null || rate === undefined) {
        // 该维度无价
        dimensions[dim] = {
          computable: false,
          reason: (parsed.value > 0) ? 'no-rate-for-filled-dimension' : 'not-requested',
          rate: null,
          tokens: parsed.value,
          cost: null
        };
      } else {
        // 有价（包括 0 = 官方免费）
        var t = parsed.value;
        var cost = (rate * t * requests) / divisor;
        dimensions[dim] = {
          computable: true,
          reason: null,
          rate: rate,
          tokens: t,
          cost: round(cost)
        };
        total += cost;
        hasAnyComputable = true;
      }
    }

    if (!hasAnyComputable) {
      return {
        computable: false,
        reason: 'no-computable-dimensions',
        currency: currency,
        unit: unit,
        unitNote: unitNote,
        dimensions: dimensions,
        planId: plan.id || null,
        officialUrl: plan.officialUrl || null,
        lastSeen: plan.lastSeen || null
      };
    }

    return {
      computable: true,
      reason: null,
      currency: currency,
      unit: unit,
      unitNote: unitNote,
      dimensions: dimensions,
      total: round(total),
      requests: requests,
      planId: plan.id || null,
      officialUrl: plan.officialUrl || null,
      lastSeen: plan.lastSeen || null,
      provider: plan.provider || null,
      planName: plan.planName || null,
      channel: plan.channel || null,
      modelKey: model.modelKey || null,
      modelName: model.name || null,
      variant: model.variant || null
    };
  }

  /**
   * 格式化单个维度结果为显示文本。
   */
  function formatDimension(dim, result) {
    if (!result.computable) {
      if (result.reason === 'no-rate-for-filled-dimension') return '\u8be5\u7ef4\u5ea6\u65e0\u5df2\u6536\u5f55\u5355\u4ef7';
      return '\u2014';
    }
    if (result.tokens === 0 && result.rate > 0) return '\u2014';
    if (result.cost === 0) return '\u514d\u8d39';
    return formatNumber(result.cost);
  }

  /**
   * 单价的显示文本。
   *
   * `null` 是「没有那一档的价」，要写成「—」而**不是** `null` 两个字，也不是 0 ——
   * 0 是官方明说免费（见红线 2），两者在页面上必须看得出差别。
   */
  function rateText(rate) {
    if (rate === null || rate === undefined) return '\u2014';
    return String(rate);
  }

  /**
   * 结果表的题注：模型 / 变体 / 币种 / 单位。四个量都来自**同一次计算的结果对象**。
   */
  function resultCaption(result) {
    var bits = [];
    if (result.modelName) bits.push('\u6a21\u578b\uff1a' + result.modelName);
    if (result.variant) bits.push('\u53d8\u4f53\uff1a' + result.variant);
    if (result.currency) bits.push('\u5e01\u79cd\uff1a' + result.currency);
    if (result.unit) bits.push('\u5355\u4f4d\uff1a' + unitLabel(result.unit));
    return bits.join(' \u00b7 ');
  }

  /**
   * 维度明细表（维度 / 单价 / tokens / 成本）。
   *
   * **一份实现、两个宿主**：构建期为静态示例调它，浏览器里为实时结果调它 ——
   * 两张表的列模型、数字格式与「缺维度写 —」的口径因此不可能分家。
   *
   * 缺价的维度**照样占一行**（单价与成本都写「—」）：少一行会让读者以为
   * 「这个维度不存在」，多一行「—」才是在说「这一档我们没有收录价」。
   *
   * @param {object} result — computeCost 的返回值
   * @param {object} [opts] — { className } 附加类名（两处宿主只有外观容器不同）
   */
  function breakdownTable(result, opts) {
    var className = (opts && opts.className) || 'cost-breakdown';
    var html = '<table class="' + escapeText(className) + '">'
      + '<caption>' + escapeText(resultCaption(result)) + '</caption>'
      + '<thead><tr><th>\u7ef4\u5ea6</th>'
      + '<th class="num">\u5355\u4ef7</th>'
      + '<th class="num">tokens</th>'
      + '<th class="num">\u6210\u672c</th></tr></thead><tbody>';
    var dims = (result && result.dimensions) || {};
    for (var i = 0; i < TOKEN_DIMENSIONS.length; i++) {
      var dim = TOKEN_DIMENSIONS[i];
      var d = dims[dim];
      if (!d) continue;
      html += '<tr><th scope="row">' + escapeText(dim) + '</th>'
        + '<td class="num">' + escapeText(rateText(d.rate)) + '</td>'
        + '<td class="num">' + escapeText(formatNumber(d.tokens)) + '</td>'
        + '<td class="num">' + escapeText(formatDimension(dim, d)) + '</td></tr>';
    }
    return html + '</tbody></table>';
  }

  /**
   * 格式化总计结果。
   */
  function formatTotal(result) {
    if (!result.computable) return '\u2014';
    if (result.total === 0) return '\u514d\u8d39';
    return formatNumber(result.total) + ' ' + currencyLabel(result.currency);
  }

  /**
   * 浏览器侧初始化：绑定表单事件、实时计算、渲染结果。
   * 在里程碑 4 创建页面 HTML 后完善。
   */
  function init(document) {
    var root = document.getElementById('api-cost');
    if (!root) return;

    var form = root.querySelector('[data-api-cost-form]');
    if (!form) return;

    var resultsContainer = root.querySelector('[data-api-cost-results]');
    if (!resultsContainer) return;

    // 从内嵌 JSON 载荷读取数据（与 /plans/coding/ 同构：第二事实来源）
    var payloadScript = root.querySelector('#api-cost-data');
    var data = {};
    if (payloadScript && payloadScript.textContent) {
      try { data = JSON.parse(payloadScript.textContent); } catch (e) { data = {}; }
    }

    function recalculate() {
      // 读取表单值
      var modelSelect = form.querySelector('[data-model]');
      var variantSelect = form.querySelector('[data-variant]');
      var channelSelect = form.querySelector('[data-channel]');
      var inputEl = form.querySelector('[data-input-tokens]');
      var outputEl = form.querySelector('[data-output-tokens]');
      var cachedEl = form.querySelector('[data-cached-tokens]');
      var cacheWriteEl = form.querySelector('[data-cache-write-tokens]');
      var cacheWriteLongEl = form.querySelector('[data-cache-write-long-tokens]');
      var requestsEl = form.querySelector('[data-requests]');

      var modelKey = modelSelect ? modelSelect.value : '';
      var variant = variantSelect ? variantSelect.value : 'standard';
      var channel = channelSelect ? channelSelect.value : 'standard';

      // 查找匹配的 plan + model
      var match = findModel(data, modelKey, variant, channel);
      if (!match) {
        renderNoMatch(resultsContainer);
        return;
      }

      var inputs = {
        inputTokens: inputEl ? parseTokens(inputEl.value) : { value: 0, valid: true },
        outputTokens: outputEl ? parseTokens(outputEl.value) : { value: 0, valid: true },
        cachedInputTokens: cachedEl && cachedEl.value ? parseTokens(cachedEl.value) : null,
        cacheWriteTokens: cacheWriteEl && cacheWriteEl.value ? parseTokens(cacheWriteEl.value) : null,
        cacheWriteLongTokens: cacheWriteLongEl && cacheWriteLongEl.value ? parseTokens(cacheWriteLongEl.value) : null,
        requests: requestsEl ? parseTokens(requestsEl.value) : { value: 1, valid: true }
      };

      // 输入校验
      var errors = [];
      for (var key in inputs) {
        var parsed = inputs[key];
        if (parsed && !parsed.valid) errors.push(key + ': ' + parsed.error);
      }
      if (errors.length) {
        renderError(resultsContainer, errors);
        return;
      }

      // 转成纯值
      var cleanInputs = {
        inputTokens: inputs.inputTokens.value,
        outputTokens: inputs.outputTokens.value,
        cachedInputTokens: inputs.cachedInputTokens ? inputs.cachedInputTokens.value : null,
        cacheWriteTokens: inputs.cacheWriteTokens ? inputs.cacheWriteTokens.value : null,
        cacheWriteLongTokens: inputs.cacheWriteLongTokens ? inputs.cacheWriteLongTokens.value : null,
        requests: inputs.requests ? inputs.requests.value : 1
      };

      var result = computeCost(match.plan, match.model, cleanInputs);

      // 一个 token 都没填：不显示「免费」（见 renderEmpty 的注释）。
      var anyTokens = cleanInputs.inputTokens > 0
        || cleanInputs.outputTokens > 0
        || (cleanInputs.cachedInputTokens || 0) > 0
        || (cleanInputs.cacheWriteTokens || 0) > 0
        || (cleanInputs.cacheWriteLongTokens || 0) > 0;
      if (!anyTokens) {
        renderEmpty(resultsContainer);
        return;
      }

      renderResult(resultsContainer, result);
    }

    form.addEventListener('input', recalculate);
    form.addEventListener('change', recalculate);
    recalculate();
  }

  /**
   * 从数据载荷中查找匹配的 plan + model。
   */
  function findModel(data, modelKey, variant, channel) {
    if (!data || !data.plans) return null;
    for (var i = 0; i < data.plans.length; i++) {
      var plan = data.plans[i];
      if (channel && plan.channel !== channel) continue;
      for (var j = 0; j < plan.models.length; j++) {
        var model = plan.models[j];
        if (model.modelKey === modelKey && model.variant === variant) {
          return { plan: plan, model: model };
        }
      }
    }
    return null;
  }

  function renderResult(container, result) {
    var html = '<div class="cost-result">';
    if (!result.computable) {
      html += '<p class="cost-msg cost-uncomputable">\u8be5\u6a21\u578b\u65e0\u6cd5\u8ba1\u7b97\uff1a' + escapeText(result.reason) + '</p>';
    } else {
      html += '<p class="cost-sum">'
        + '<span class="cost-sum-lab">\u5408\u8ba1</span>'
        + '<span class="cost-sum-val">' + escapeText(formatTotal(result)) + '</span>'
        + '<span class="cost-sum-note">\u8bf7\u6c42\u6570 ' + escapeText(String(result.requests || 1)) + '</span>'
        + '</p>';
      html += '<div class="ptable-wrap">' + breakdownTable(result, { className: 'cost-tbl cost-breakdown' }) + '</div>';
      html += '<p class="cost-source">\u8ba1\u7b97\u503c\uff0c\u975e\u5b98\u65b9\u62a5\u4ef7\u3002\u5355\u4ef7\u6765\u6e90\uff1a'
        + escapeText(result.planId || '') + ' \u00b7 \u6838\u5bf9\u65e5\u671f\uff1a' + escapeText(result.lastSeen || '\u2014') + '</p>';
    }
    html += '</div>';
    container.innerHTML = html;
  }

  /**
   * 还没填用量时的占位。
   *
   * 为什么需要它：不填 tokens 时 total 恰好是 0，而 0 在这套口径里读作「官方免费」——
   * 直接把 0 显示成「免费」是把「没输入」说成了「不要钱」，与本模块红线 2
   * （0 与 null 是两句不同的话）是同一类错。所以**先用一句话要输入**，算出 0 才说免费。
   */
  function renderEmpty(container) {
    container.innerHTML = '<p class="cost-msg cost-idle">\u5728\u4e0a\u9762\u586b\u5165 token \u7528\u91cf\uff0c\u8fd9\u91cc\u663e\u793a\u6309\u5df2\u6536\u5f55\u5b98\u65b9\u5355\u4ef7\u7b97\u51fa\u7684\u6210\u672c\u3002</p>';
  }

  function renderNoMatch(container) {
    container.innerHTML = '<p class="cost-msg cost-no-match">\u8bf7\u9009\u62e9\u6a21\u578b\u4e0e\u6863\u4f4d</p>';
  }

  function renderError(container, errors) {
    container.innerHTML = '<p class="cost-msg cost-error">\u8f93\u5165\u65e0\u6548\uff1a' + escapeText(errors.join('\uff0c')) + '</p>';
  }

  function escapeText(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── 浏览器自动初始化 ──
  if (typeof document !== 'undefined' && document.getElementById) init(document);

  // ── Node 导出（离线自测 require 的同一份字节）──
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      computeCost: computeCost,
      isComputable: isComputable,
      parseTokens: parseTokens,
      round: round,
      formatNumber: formatNumber,
      formatDimension: formatDimension,
      formatTotal: formatTotal,
      rateText: rateText,
      resultCaption: resultCaption,
      breakdownTable: breakdownTable,
      currencyLabel: currencyLabel,
      unitLabel: unitLabel,
      init: init,
      FORBIDDEN_CLAIM_WORDS: FORBIDDEN_CLAIM_WORDS,
      TOKEN_DIMENSIONS: TOKEN_DIMENSIONS,
      UNIT_DIVISORS: UNIT_DIVISORS,
      MODULE_VERSION: MODULE_VERSION
    };
  }
})();
