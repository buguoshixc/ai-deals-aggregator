/**
 * 套餐对比页的**筛选 / 搜索 / 排序 / 行内展开**逻辑，一份实现、两个宿主。
 *
 * ## 为什么是「双宿主」而不是两个文件
 *
 * 这些语义必须**同时**活在两个地方：
 *   · 浏览器里（读者点 chip、敲搜索框、点排序按钮时）；
 *   · 构建期与离线自测里（`plans-selftest.js` 直接 `require` 它，给这些语义长牙）。
 *
 * 复制两份是这一页最容易分家的写法（"页面上的筛选和自测里的筛选不是同一件事"），
 * 而分家之后**两边都还是绿的**。所以：文件末尾 `module.exports` 给 Node，
 * `init(document)` 给浏览器，`build-local.js` 把本文件的源码**逐字节内联**进页面 ——
 * 内联的那一份与 `require` 的那一份在结构上不可能是两个版本。
 *
 * ## 纪律（与 `lib/plans-page.js` 同一条）
 *
 * 纯函数不读盘、不联网、不看时钟、不写盘；**不做价值判断**（不评分、不排名、不推荐）。
 * 不可比较的东西永远不进比较：`null` 不是 0，也不参与任何排序。
 *
 * ## 未知与不可比较在排序里的唯一口径
 *
 * `regular` / `promo` / `unit` 三档先分区（可比 / 不可比）再排序，不可比的一律
 * **按规范序追加在末尾**，`asc` / `desc` 都不越过它 —— 否则翻一下方向就会把
 * "没有这个数据"的套餐顶到"最便宜"的位置上。
 */

(function () {
  'use strict';

  const CORE_VERSION = '2.2.0';

  /** 筛选维度（顺序即界面顺序；`q` 是自由文本，不进 chip 计数） */
  const FILTER_DIMENSIONS = ['provider', 'model', 'price', 'quotaType', 'region', 'promo'];
  /** 排序档位（`unit` 只在真的可比较时才出现在页面上，见 `sortsOf()`） */
  const SORT_KEYS = ['default', 'regular', 'promo', 'unit', 'updated'];
  /** 「模型未标注」这一档的保留键 —— 它不是模型名，所以不可能与真实模型名撞车 */
  const MODEL_NONE_KEY = '__none';

  /**
   * 价格区间阶梯。**这是本页唯一的任意常量**，所以显式写在唯一出处里并被文档引用。
   *
   * 为什么声明式而不是从数据推导：推导出来的分档（等分位之类）会随数据变化，
   * 于是同一个筛选器在两个版本里含义不同，而读者看到的标签长得一样。
   * 区间是**半开**的 `[min, max)`；末档 `null` = 开区间。
   */
  const PRICE_LADDER = {
    CNY: [0, 50, 100, 200],
    USD: [0, 10, 20, 50],
    HKD: [0, 50, 100, 200],
    EUR: [0, 10, 20, 50],
    GBP: [0, 10, 20, 50],
    SGD: [0, 10, 50, 100],
    JPY: [0, 1000, 3000, 10000]
  };

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** 搜索与被搜索的两边都走这一条：NFKC → 折叠空白 → 小写（不做任何模糊匹配） */
  function normalize(text) {
    return String(text === null || text === undefined ? '' : text)
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  /** 查询串切成词：每个词都必须命中（AND）。全空白 = 不限制。 */
  function queryTokens(query) {
    const normalized = normalize(query);
    return normalized ? normalized.split(' ') : [];
  }

  function emptyState() {
    return { provider: '', model: '', price: '', quotaType: '', region: '', promo: '', q: '', sort: 'default', dir: 'asc' };
  }

  /** 排序档位的默认方向：只有「最近更新」是降序（新的在前），其余是数值升序 */
  function defaultDirOf(sort) {
    return sort === 'updated' ? 'desc' : 'asc';
  }

  function bucketOf(buckets, key) {
    for (const bucket of buckets || []) if (bucket.key === key) return bucket;
    return null;
  }

  /**
   * 价格档位：只对**正常月费**生成，且只保留真的命中 ≥1 行的档位。
   *
   * 为什么按币种分组而不是折算成一个数：这一页没有汇率，也刻意不引入 ——
   * 把 `$20` 和 `¥99` 放进同一个区间里比，是"用不存在的知识"做筛选。
   * 币种顺序 = 该币种在规范序里首次出现的顺序（确定性，不依赖对象键序）。
   *
   * @param {object[]} rows 载荷行（需要 period / currency / regular）
   * @param {{symbols?:object}} [opts] 币种符号表（由调用方注入，避免第二份常量）
   */
  function priceBucketsOf(rows, opts) {
    const symbols = (opts && opts.symbols) || {};
    const byCurrency = new Map();
    for (const row of rows || []) {
      if (!row || row.period !== 'monthly') continue;
      if (typeof row.regular !== 'number') continue;
      if (!row.currency || !PRICE_LADDER[row.currency]) continue;
      if (!byCurrency.has(row.currency)) byCurrency.set(row.currency, []);
      byCurrency.get(row.currency).push(row.regular);
    }
    const out = [];
    for (const [currency, prices] of byCurrency) {
      const ladder = PRICE_LADDER[currency];
      for (let i = 0; i < ladder.length; i++) {
        const min = ladder[i];
        const max = i + 1 < ladder.length ? ladder[i + 1] : null;
        const hits = prices.filter(value => value >= min && (max === null || value < max)).length;
        if (!hits) continue; // 零命中的档位不出现（与「零计数入口不渲染」同源）
        const symbol = symbols[currency] || '';
        out.push({
          key: `${currency}-${min}-${max === null ? 'up' : max}`,
          label: max === null ? `${symbol}${min}+（${currency}）` : `${symbol}${min}–${max - 1}（${currency}）`,
          currency, period: 'monthly', min, max, count: hits
        });
      }
    }
    return out;
  }

  /**
   * 命中判定：七个维度 AND。
   *
   * 每个维度只在"被选中"时才限制；空串 = 不限制。价格档的四个条件必须一起成立
   * （同币种、同计费周期、原价已知、落在半开区间里）—— 少任何一个都会让
   * 「¥50–99」把一条美元套餐或一条年付套餐捞进来。
   */
  function matches(row, state, buckets) {
    if (!row) return false;
    if (state.provider && row.provider !== state.provider) return false;
    if (state.region && row.region !== state.region) return false;
    if (state.quotaType && row.quotaType !== state.quotaType) return false;
    if (state.promo === 'yes' && !(typeof row.promo === 'number')) return false;
    if (state.promo === 'no' && typeof row.promo === 'number') return false;

    if (state.model) {
      if (state.model === MODEL_NONE_KEY) {
        if (row.modelsMissing !== true) return false;
      } else if (!Array.isArray(row.models) || row.models.indexOf(state.model) < 0) {
        return false;
      }
    }

    if (state.price) {
      const bucket = bucketOf(buckets, state.price);
      if (!bucket) return false;
      if (row.period !== bucket.period || row.currency !== bucket.currency) return false;
      if (typeof row.regular !== 'number') return false;
      if (row.regular < bucket.min) return false;
      if (bucket.max !== null && row.regular >= bucket.max) return false;
    }

    const tokens = queryTokens(state.q);
    if (tokens.length) {
      const haystack = row.search || '';
      for (const token of tokens) if (haystack.indexOf(token) < 0) return false;
    }
    return true;
  }

  function filterRows(rows, state, buckets) {
    return (rows || []).filter(row => matches(row, state, buckets));
  }

  /**
   * 币种组序：**该币种在规范序里首次出现的顺序**（确定性，不依赖对象键序或 Set 迭代序）。
   *
   * 为什么每一次价格排序都要它：`¥99` 与 `$20` 之间没有大小关系（我们没有汇率）。
   * 把它们塞进同一个升序序列，等于用一个不存在的汇率替读者做了比较 —— 而页面上
   * 每一条价格都还写着各自的币种，看不出任何异常。
   */
  function currencyRankOf(rows, field = 'regular', currencyField = 'currency') {
    const rank = new Map();
    for (const row of rows || []) {
      if (typeof row[field] !== 'number') continue;
      const currency = row[currencyField];
      if (!currency || rank.has(currency)) continue;
      rank.set(currency, rank.size);
    }
    return rank;
  }

  /**
   * 排序。返回**新数组**（不改调用方的数组，也不改行对象）。
   *
   * 三条不可让步的性质：
   *   ① 不可比较（`null`）的行永远在可比行之后，`dir` 反转也不越过；
   *   ② 价格排序按币种分组，**币种组序不随 `dir` 反转**（跨币种不折算、也不互换位置）；
   *   ③ 恒为全序且稳定（平局按规范序 `index`），所以"再点一次"不会得到第三种顺序。
   */
  function sortRows(rows, sort, dir) {
    const list = (rows || []).slice();
    const order = dir === 'desc' ? -1 : 1;
    const byIndex = (a, b) => a.index - b.index;

    if (sort === 'regular' || sort === 'promo') {
      const field = sort === 'regular' ? 'regular' : 'promo';
      const rank = currencyRankOf(list);
      const comparable = list.filter(row => typeof row[field] === 'number');
      const rest = list.filter(row => typeof row[field] !== 'number').sort(byIndex);
      comparable.sort((a, b) => {
        const ra = rank.has(a.currency) ? rank.get(a.currency) : 0;
        const rb = rank.has(b.currency) ? rank.get(b.currency) : 0;
        if (ra !== rb) return ra - rb;
        return (a[field] - b[field]) * order || byIndex(a, b);
      });
      return comparable.concat(rest);
    }

    if (sort === 'unit') {
      const comparable = list.filter(row => typeof row.unit === 'number');
      const rest = list.filter(row => typeof row.unit !== 'number').sort(byIndex);
      const rank = currencyRankOf(list, 'unit', 'unitCurrency');
      comparable.sort((a, b) => {
        const ra = rank.has(a.unitCurrency) ? rank.get(a.unitCurrency) : 0;
        const rb = rank.has(b.unitCurrency) ? rank.get(b.unitCurrency) : 0;
        if (ra !== rb) return ra - rb;
        return (a.unit - b.unit) * order || byIndex(a, b);
      });
      return comparable.concat(rest);
    }

    if (sort === 'updated') {
      return list.sort((a, b) => {
        if (a.updated !== b.updated) return a.updated < b.updated ? order : -order;
        return byIndex(a, b);
      });
    }

    return list.sort(byIndex);
  }

  /**
   * 某一档的计数：**「点下去会看到多少条」** —— 与首页 `facetModel` 的 `count()`
   * 是同一条语义（把该维度设成这个值，其余维度保持当前状态）。
   * 所以已选中那一档显示的数字恰好等于当前结果数。
   */
  function countFor(rows, state, buckets, dimension, value) {
    const next = Object.assign({}, state);
    next[dimension] = value;
    return filterRows(rows, next, buckets).length;
  }

  /** 状态里真正生效的筛选项数（搜索算 1 项） */
  function activeCount(state) {
    let count = 0;
    for (const dimension of FILTER_DIMENSIONS) if (state[dimension]) count++;
    if (queryTokens(state.q).length) count++;
    return count;
  }

  function isDefault(state) {
    return activeCount(state) === 0 && state.sort === 'default';
  }

  /** 页面上应当出现的排序档位：`unit` 只在真的存在可比行时才给（否则是点了没用的控件） */
  function sortsOf(rows) {
    return SORT_KEYS.filter(key => {
      if (key === 'unit') return (rows || []).some(row => typeof row.unit === 'number');
      return true;
    });
  }

  if (typeof module === 'object' && module && module.exports) {
    module.exports = {
      CORE_VERSION, FILTER_DIMENSIONS, SORT_KEYS, MODEL_NONE_KEY, PRICE_LADDER,
      escapeHtml, normalize, queryTokens, emptyState, defaultDirOf, bucketOf,
      priceBucketsOf, currencyRankOf, matches, filterRows, sortRows, countFor, activeCount, isDefault, sortsOf,
      init
    };
  }

  /* ------------------------------------------------------------------ */
  /* 浏览器侧：把载荷变成控件，把状态变成 DOM                              */
  /* ------------------------------------------------------------------ */

  /**
   * 建控件、绑事件。**任何一步失败都不建控件** —— 宁可读者看到一个纯静态表，
   * 也不要给他一半能点、一半点了没反应的筛选条（无 JS 时的死控件是同一条纪律）。
   */
  function init(doc) {
    const host = doc.getElementById('plans-compare');
    const dataEl = doc.getElementById('plans-compare-data');
    if (!host) return;
    if (!dataEl) { console.error('套餐对比页：缺少数据载荷 #plans-compare-data'); return; }

    let payload;
    try {
      payload = JSON.parse(dataEl.textContent);
    } catch (error) {
      console.error('套餐对比页：数据载荷不是合法 JSON', error);
      return;
    }
    if (!payload || !Array.isArray(payload.rows) || !payload.dimensions) {
      console.error('套餐对比页：数据载荷形状不对（缺 rows / dimensions）');
      return;
    }

    const rows = payload.rows;
    const buckets = payload.dimensions.price || [];
    const columns = Number(payload.columns) || 0;

    // 载荷与 DOM 必须一一对应：少一行、多一行、id 对不上，都**不建控件**。
    // 这是「页面显示 N 条 == 数据 N 条」这条断言在浏览器里的落点。
    const rowEls = new Map();
    for (const tr of doc.querySelectorAll('.ptable tbody tr[data-item]')) {
      rowEls.set(tr.getAttribute('data-item'), tr);
    }
    if (rowEls.size !== rows.length || rows.some(row => !rowEls.has(row.id))) {
      console.error(`套餐对比页：页面 ${rowEls.size} 行 ≠ 数据载荷 ${rows.length} 行`);
      return;
    }
    if (!columns) { console.error('套餐对比页：数据载荷缺少 columns'); return; }

    const templates = new Map();
    for (const tpl of doc.querySelectorAll('template[data-detail-for]')) {
      templates.set(tpl.getAttribute('data-detail-for'), tpl);
    }

    const state = emptyState();
    const openDetails = new Map(); // id → <tr class="pdetail">

    host.innerHTML = panelHtml(payload);

    const chipButtons = [...host.querySelectorAll('[data-facet]')].filter(el => el.tagName === 'BUTTON');
    const selects = [...host.querySelectorAll('select[data-facet]')];
    const sortButtons = [...host.querySelectorAll('[data-sort]')];
    const searchInput = host.querySelector('input[data-facet="q"]');
    const statusEl = host.querySelector('.pstatus');
    const resetButton = host.querySelector('[data-reset]');

    /* ---- 详情（行内展开） ---- */
    for (const row of rows) {
      const tr = rowEls.get(row.id);
      const cell = tr.children[1];
      if (!cell || !templates.has(row.id)) continue;
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'pdetbtn';
      button.setAttribute('data-detail', row.id);
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', `pdetail-${row.id}`);
      button.textContent = '详情';
      cell.appendChild(button);
    }

    function triggerOf(id) {
      return doc.querySelector(`.ptable [data-detail="${id}"]`);
    }

    function toggleDetail(id) {
      const tr = rowEls.get(id);
      const trigger = triggerOf(id);
      const existing = openDetails.get(id);
      if (existing) {
        existing.remove();
        openDetails.delete(id);
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        return;
      }
      const template = templates.get(id);
      if (!template || !tr) return;
      const detailRow = doc.createElement('tr');
      detailRow.className = 'pdetail';
      detailRow.id = `pdetail-${id}`;
      const cell = doc.createElement('td');
      cell.colSpan = columns;
      cell.appendChild(template.content.cloneNode(true));
      detailRow.appendChild(cell);
      tr.parentNode.insertBefore(detailRow, tr.nextSibling);
      openDetails.set(id, detailRow);
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
    }

    /* ---- 重排：每个数据行与紧跟它的详情行作为一个整体 ---- */
    function reorder(ordered) {
      const tbody = doc.querySelector('.ptable tbody');
      if (!tbody) return;
      const groups = new Map();
      let current = null;
      for (const child of [...tbody.children]) {
        const id = child.getAttribute && child.getAttribute('data-item');
        if (id) { current = id; groups.set(id, [child]); }
        else if (current && groups.has(current)) groups.get(current).push(child);
      }
      for (const row of ordered) {
        for (const el of groups.get(row.id) || []) tbody.appendChild(el);
      }
    }

    function paint() {
      const visible = filterRows(rows, state, buckets);
      const ordered = sortRows(visible, state.sort, state.dir);
      const visibleIds = new Set(ordered.map(row => row.id));

      for (const row of rows) {
        const tr = rowEls.get(row.id);
        const shown = visibleIds.has(row.id);
        if (tr.hidden === shown) tr.hidden = !shown;
        if (!shown) {
          const detailRow = openDetails.get(row.id);
          if (detailRow) {
            detailRow.remove();
            openDetails.delete(row.id);
            const trigger = triggerOf(row.id);
            if (trigger) trigger.setAttribute('aria-expanded', 'false');
          }
        }
      }
      // 被筛掉的行也**按规范序追加到末尾**：它们在屏幕上不可见，但 DOM 顺序因此始终是
      // 确定的（"可见行按当前排序 + 不可见行按规范序"），断言可以直接比 DOM 顺序。
      reorder(ordered.concat(rows.filter(row => !visibleIds.has(row.id)).sort((a, b) => a.index - b.index)));

      for (const button of chipButtons) {
        const dimension = button.getAttribute('data-facet');
        const value = button.getAttribute('data-value') || '';
        const on = state[dimension] === value;
        button.classList.toggle('on', on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
        const count = button.querySelector('b');
        if (count) count.textContent = String(countFor(rows, state, buckets, dimension, value));
      }
      for (const select of selects) {
        const dimension = select.getAttribute('data-facet');
        select.value = state[dimension] || '';
        for (const option of select.options) {
          if (!option.value) continue;
          option.textContent = option.getAttribute('data-label') +
            `（${countFor(rows, state, buckets, dimension, option.value)}）`;
        }
      }
      for (const button of sortButtons) {
        const key = button.getAttribute('data-sort');
        const on = state.sort === key;
        button.classList.toggle('on', on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
        const arrow = button.querySelector('[data-dir]');
        if (arrow) arrow.textContent = on ? (state.dir === 'desc' ? '▼' : '▲') : '';
      }
      if (statusEl) {
        statusEl.textContent = `显示 ${visible.length} / 共 ${rows.length} 条套餐` +
          (activeCount(state) ? ` · 已启用 ${activeCount(state)} 项筛选` : '');
      }
      if (resetButton) resetButton.disabled = isDefault(state);
    }

    /**
     * 事件委托挂在 **document** 上而不是控件容器上：详情按钮长在**表格行**里，
     * 不在 `.pctl` 内部 —— 挂在容器上时"点详情没反应"，而其它控件照旧可用
     * （这是实测抓到的：详情行数恒为 0）。
     */
    doc.addEventListener('click', event => {
      const reset = event.target.closest('[data-reset]');
      if (reset) {
        Object.assign(state, emptyState(), { sort: 'default', dir: defaultDirOf('default') });
        if (searchInput) searchInput.value = '';
        paint();
        return;
      }
      const detail = event.target.closest('[data-detail]');
      if (detail && detail.tagName === 'BUTTON') { toggleDetail(detail.getAttribute('data-detail')); return; }
      const sort = event.target.closest('[data-sort]');
      if (sort) {
        const key = sort.getAttribute('data-sort');
        if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.sort = key; state.dir = defaultDirOf(key); }
        paint();
        return;
      }
      const chip = event.target.closest('button[data-facet]');
      if (chip) {
        const dimension = chip.getAttribute('data-facet');
        const value = chip.getAttribute('data-value') || '';
        state[dimension] = state[dimension] === value ? '' : value;
        paint();
      }
    });

    for (const select of selects) {
      select.addEventListener('change', () => {
        state[select.getAttribute('data-facet')] = select.value;
        paint();
      });
    }
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        state.q = searchInput.value;
        paint();
      });
    }

    paint();
  }

  /** 控件面板的 HTML（全部用页面已有的类；标签一律转义） */
  function panelHtml(payload) {
    const dimensions = payload.dimensions;
    const chips = (dimension, values) => values.map(item =>
      `<button type="button" class="f" data-facet="${escapeHtml(dimension)}" data-value="${escapeHtml(item.key)}"` +
      ` aria-pressed="false">${escapeHtml(item.label)}<b>0</b></button>`).join('');

    const providerRow = dimensions.provider.length
      ? `<div class="pcrow"><span class="pclb">平台</span><span class="pchips">${chips('provider', dimensions.provider)}</span></div>`
      : '';
    const quotaRow = dimensions.quotaType.length || dimensions.region.length || dimensions.promo.length
      ? `<div class="pcrow"><span class="pclb">额度 / 地区</span><span class="pchips">` +
        `${chips('quotaType', dimensions.quotaType)}<span class="fsep"></span>` +
        `${chips('region', dimensions.region)}<span class="fsep"></span>` +
        `${chips('promo', dimensions.promo)}</span></div>`
      : '';

    const select = (dimension, label, values) => values.length
      ? `<label class="catpick pclab">${escapeHtml(label)}` +
        `<select data-facet="${escapeHtml(dimension)}" aria-label="${escapeHtml(label)}">` +
        `<option value="">全部</option>` +
        values.map(item => `<option value="${escapeHtml(item.key)}" data-label="${escapeHtml(item.label)}">` +
          `${escapeHtml(item.label)}（0）</option>`).join('') +
        `</select></label>`
      : '';

    const sorts = sortsOf(payload.rows).map(key => {
      const item = dimensions.sort.find(row => row.key === key);
      if (!item) return '';
      return `<button type="button" data-sort="${escapeHtml(key)}" aria-pressed="false">` +
        `${escapeHtml(item.label)}<span data-dir aria-hidden="true"></span></button>`;
    }).join('');

    return `
      ${providerRow}
      ${quotaRow}
      <div class="pcrow">
        ${select('model', '模型', dimensions.model)}
        ${select('price', '正常月费', dimensions.price)}
        <label class="psearch"><span class="pclb">搜索</span>
          <input type="search" data-facet="q" placeholder="平台、套餐或模型…" aria-label="搜索平台、套餐或模型">
        </label>
      </div>
      <div class="pcrow pctail">
        <span class="pstatus" role="status" aria-live="polite"></span>
        <span class="sortbox" role="group" aria-label="排序">${sorts}</span>
        <button type="button" class="f" data-reset disabled>清除筛选</button>
      </div>`;
  }

  if (typeof document !== 'undefined' && document.getElementById) init(document);
})();
