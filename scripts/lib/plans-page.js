/**
 * `/plans/coding/` 的**正文渲染**（v2.1 的第二段：把套餐数据变成读者能看的页面）。
 *
 * ## 为什么渲染放在 lib 而不是 build-local 里
 *
 * 因为要能被**离线自测直接调用**：`build-local.js` 一 require 就会跑整条构建链，
 * 自测不可能把它当库用（与 `lib/changes.js` 被 `changes-selftest` 直接调是同一个理由）。
 * 这一支因此是**纯函数**：不读盘、不联网、不看时钟、不写盘 —— 输入是 plans 记录，
 * 输出是 HTML 字符串与 JSON-LD 对象。
 *
 * ## 这一页的三条硬承诺（都有断言，见 `assertPageHonesty()`）
 *
 * 1. **只列事实，不做结论**。没有评分、没有排名、没有"性价比"、没有"最值得买"。
 *    页面上不许出现这些词 —— 这一条在 v2.1 的第一段还只是产品规则，
 *    现在有了 `FORBIDDEN_CLAIM_WORDS` 这个唯一出处，构建期与真浏览器各查一遍。
 * 2. **缺值不占位**。未知一律显式写成「未标注」（文本）/「—」（数值）/「未确认」（三态），
 *    绝不写 0、也绝不合成一句"暂无"。原价未知的套餐显示「未标注」，而不是把它算成 0 元。
 * 3. **不可比较的绝不硬塞进可比列**。「名义 Token 单价」算不出来就显示「—」，
 *    并且**不参与"谁更便宜"的观感**（表格不排序、不加颜色分级）——
 *    把 requests / 限速 / 用量池当成 0 元每亿 Token，是这一页最容易犯、也最坏的错。
 */

const planSchema = require('./plan-schema');
const providersLib = require('./providers');

const PLANS_ROUTE = 'plans/coding/';
/**
 * 回到站根的相对前缀。
 *
 * **由路由深度推导，不写死**：这一页是两层路由，`../` 只会回到 `/plans/`（一个不存在的地址），
 * 必须 `../../`。构建期的 SEO 内链存在性检查当场抓到过这一点 ——
 * 而页面上看起来完全正常，只有点下去才发现问题。
 */
const PLANS_HOME_HREF = '../'.repeat(PLANS_ROUTE.split('/').filter(Boolean).length);
const PLANS_HEADING = 'AI Coding 套餐对比';
const PLANS_DESCRIPTION = '把各平台长期在售的 AI Coding 套餐放在一张表里比：正常价格、当前活动价、'
  + '计费周期、可用模型、原始额度与额度类型。只列事实，不排名、不评分、不替读者判断值不值。';

/** 未知的三种表现形态。语义不同所以写上不同的词（H4b：缺失要说清是哪一种） */
const UNKNOWN_TEXT = '未标注';
const UNKNOWN_NUM = '—';
const UNKNOWN_TRI = '未确认';

/**
 * 页面上**不许出现**的结论性词汇。唯一出处。
 *
 * 为什么单列一张表而不是散在断言里：题面明确禁用「性价比 / 最划算 / TOP 1」这类标签，
 * 而 v2.1 第一段时它们**没有任何守卫**（只在文档里写着）。现在构建期与真浏览器
 * 都拿这一份清单去查同一页。
 *
 * 刻意**不**收录的：`推荐` / `排序` —— 页脚既有句子「本站不收录付费推广位，
 * 排序与推荐理由不出售」里就有这两个词，把裸词写进清单会让每一条断言永远为真。
 */
const FORBIDDEN_CLAIM_WORDS = [
  '性价比', '最划算', '最超值', '最值得买', '值得买', '排行榜', '排行',
  '综合评分', '星级', '推荐指数', 'TOP 1', 'TOP1', '第一名', '最优选'
];

/** 口径与说明（题面 §十 的五条，一条都不能少） */
const PLANS_NOTES = [
  '不同平台的计量方式不同：Token、积分、请求次数、按窗口限速、用量池 —— 本页**照原样列出**，不互相换算。',
  'Token 额度不一定完全可比：额度随模型倍率变化时，我们把它记成「积分」而不是固定 Token（否则就是把不可比的东西写成可比）。',
  '「名义 Token 单价」只在能算的时候才算 —— 需要额度确实是 Token、额度周期与计费周期一致、币种可处理、当前价明确、且折算不随模型变化。算不出的一律显示「—」，不填 0，也不参与任何排序。',
  '价格与额度以官方页面为准：表中每条都链到该平台的官方定价页，本站只做收录与整理。',
  '「最近更新」是我们最后一次人工对照官方页的日期，不是官方承诺不变的日期。'
];

const CURRENCY_SYMBOL = { CNY: '¥', USD: '$', HKD: 'HK$', EUR: '€', JPY: '¥', GBP: '£', SGD: 'S$' };

const BILLING_PERIOD_LABEL = {
  monthly: '每月', yearly: '每年', one_time: '一次性', usage_based: '按量计费', other: '其他'
};
const QUOTA_PERIOD_LABEL = {
  monthly: '每月', yearly: '每年', weekly: '每周', daily: '每日',
  hourly: '每小时', rolling: '滚动窗口', one_time: '一次性', other: '其他'
};
const QUOTA_TYPE_LABEL = {
  tokens: 'Token', credits: '积分', requests: '请求次数', messages: '消息数',
  rate_limited: '按窗口限速', unlimited_fair_use: '公平使用', compute_units: '算力单位', other: '其他'
};
const QUOTA_UNIT_LABEL = {
  tokens: 'Token', credits: '积分', requests: '次', messages: '条', compute_units: '单位'
};
const MODEL_ROLE_LABEL = { included: '可用', limited: '受限', pool: '动态池', family: '模型族' };
const RESTRICTION_LABEL = {
  concurrency: '并发', rate_limit: '限速', per_day_cap: '每日上限', rolling_window: '刷新窗口',
  output_limit: '输出上限', fair_use: '公平使用', region_restriction: '地区限制',
  account_required: '需要账号', invite_only: '仅限受邀', new_user_only: '仅限新用户'
};

/* ------------------------------------------------------------------ */
/* 小工具（都是纯函数）                                                 */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 千分位。**不用 toLocaleString** —— 它的输出依赖运行环境的 locale，产物会因此不可复现 */
function formatNumber(value) {
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  const [int, frac] = text.split('.');
  const sign = int.startsWith('-') ? '-' : '';
  const digits = sign ? int.slice(1) : int;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${grouped}${frac ? `.${frac}` : ''}`;
}

function providerNameOf(key, table) {
  const source = table || providersLib.load().table;
  const entry = source[key];
  return entry && entry.name ? entry.name : String(key || '');
}

/** 价格渲染：未知 → null（调用方负责写「未标注」），已知 → {text, code} */
function priceOf(value, currency) {
  if (value === null || value === undefined) return null;
  const symbol = CURRENCY_SYMBOL[currency] || '';
  return { text: `${symbol}${formatNumber(value)}`, code: currency || '' };
}

function triText(value) {
  if (value === true) return '是';
  if (value === false) return '否';
  return UNKNOWN_TRI;
}

function quotaAmountText(plan) {
  const quota = plan.quota || {};
  if (quota.amount === null || quota.amount === undefined) return null;
  const unit = QUOTA_UNIT_LABEL[quota.type] || '';
  const period = quota.period ? ` / ${QUOTA_PERIOD_LABEL[quota.period] || quota.period}` : '';
  return `${formatNumber(quota.amount)}${unit ? ` ${unit}` : ''}${period}`;
}

function restrictionText(item) {
  const label = RESTRICTION_LABEL[item.kind] || item.kind;
  const value = typeof item.value === 'number' || typeof item.value === 'string'
    ? (item.value === 'unknown' ? UNKNOWN_TRI : String(item.value))
    : triText(item.value);
  return `${label}：${value}`;
}

/**
 * 一行 = 一个套餐的全部展示文本。**先算数据、再拼 HTML** ——
 * 这样自测可以直接断言"这一行给读者看的到底是什么"，不必去解析 HTML。
 */
function planRowOf(plan, { providerTable = null } = {}) {
  const billing = plan.billing || {};
  const quota = plan.quota || {};
  /**
   * 渲染层的 fail-closed 守卫：**只有当额度类型确实是 tokens 时才显示单价**。
   *
   * 数据层已经保证过这件事（`validatePlan` 会把 `derivedMetrics` 与重新推导的结果逐字节比对），
   * 所以正常数据上这一行没有任何作用。它挡的是「数据被绕过了」那一种：
   * 把 requests / 限速 / 用量池显示成一个 Token 单价，是这一页**最坏**的错
   * （读者会拿它去比"谁更便宜"），而多加这一个条件的代价只有一行。
   */
  const rawMetric = plan.derivedMetrics ? plan.derivedMetrics.nominalUnitPrice : null;
  const metric = quota.type === 'tokens' ? rawMetric : null;

  const regular = priceOf(billing.regularPrice, billing.currency);
  const promo = priceOf(billing.promoPrice, billing.currency);

  // 「确实免费」与「原价未知」必须能被读成两句不同的话：前者是 ¥0，后者是未标注。
  const regularText = regular ? regular.text : (billing.regularPrice === 0 ? '¥0' : UNKNOWN_TEXT);
  const regularCode = regular && regular.code ? regular.code : (billing.currency || '');

  const models = Array.isArray(plan.supportedModels)
    ? plan.supportedModels.map(item => (item.role && item.role !== 'included'
      ? `${item.name}（${MODEL_ROLE_LABEL[item.role] || item.role}）`
      : item.name)).join('、')
    : '';

  const restrictions = Array.isArray(plan.restrictions) ? plan.restrictions.map(restrictionText) : [];
  const noteParts = [];
  if (billing.promoNote) noteParts.push(`活动价说明：${billing.promoNote}`);
  if (billing.note) noteParts.push(billing.note);

  return {
    id: plan.id,
    providerKey: plan.provider,
    provider: providerNameOf(plan.provider, providerTable),
    planName: plan.planName,
    officialUrl: plan.officialUrl,
    sourceLabel: planSchema.PLAN_SOURCE_TYPES[plan.source] === 'official' ? '官方页' : '',
    regularText,
    regularCode,
    regularValue: billing.regularPrice === undefined ? null : billing.regularPrice,
    promoText: promo ? promo.text : UNKNOWN_NUM,
    promoCode: promo ? promo.code : '',
    promoValue: billing.promoPrice === undefined ? null : billing.promoPrice,
    periodText: BILLING_PERIOD_LABEL[billing.period] || billing.period || UNKNOWN_TEXT,
    modelsText: models || UNKNOWN_TEXT,
    quotaTypeText: QUOTA_TYPE_LABEL[quota.type] || quota.type || UNKNOWN_TEXT,
    quotaAmountText: quotaAmountText(plan) || UNKNOWN_TEXT,
    quotaDescription: quota.description || '',
    restrictions,
    unitPriceText: metric
      ? `${formatNumber(metric.price)} ${metric.currency}/亿 Token（${metric.basis === 'monthly' ? '按月' : '按年'}）`
      : UNKNOWN_NUM,
    unitPriceComputable: Boolean(metric),
    updatedText: plan.lastSeen || UNKNOWN_TEXT,
    verifiedText: plan.verifiedAt || UNKNOWN_TEXT,
    noteText: noteParts.length ? noteParts.join('；') : UNKNOWN_NUM,
    regionText: plan.region === 'cn' ? '国内' : plan.region === 'global' ? '国外' : UNKNOWN_TEXT
  };
}

function plansRows(plans, opts = {}) {
  return (plans || []).map(plan => planRowOf(plan, opts));
}

/* ------------------------------------------------------------------ */
/* 正文 HTML                                                            */
/* ------------------------------------------------------------------ */

function renderRow(row) {
  const restrictions = row.restrictions.length
    ? `<small>${escapeHtml(row.restrictions.join(' · '))}</small>`
    : '';
  const quotaDescription = row.quotaDescription
    ? `<small>${escapeHtml(row.quotaDescription)}</small>`
    : '';
  const official = row.officialUrl
    ? `<small><a href="${escapeHtml(row.officialUrl)}" rel="noopener">官方定价页 ↗</a>`
      + `<span class="ptag">${escapeHtml(row.sourceLabel)}</span></small>`
    : '';
  const unitPrice = row.unitPriceComputable
    ? `<b>${escapeHtml(row.unitPriceText)}</b>`
    : `<span class="pnone" title="不可比较：额度类型或口径不满足计算条件">${escapeHtml(row.unitPriceText)}</span>`;

  return `
        <tr data-item="${escapeHtml(row.id)}">
          <th scope="row">${escapeHtml(row.provider)}<small>${escapeHtml(row.regionText)}</small></th>
          <td>${escapeHtml(row.planName)}${official}</td>
          <td class="num">${escapeHtml(row.regularText)}${
  row.regularCode ? `<small>${escapeHtml(row.regularCode)}</small>` : ''}</td>
          <td class="num">${escapeHtml(row.promoText)}${
  row.promoCode ? `<small>${escapeHtml(row.promoCode)}</small>` : ''}</td>
          <td>${escapeHtml(row.periodText)}</td>
          <td>${escapeHtml(row.modelsText)}</td>
          <td>${escapeHtml(row.quotaTypeText)}</td>
          <td>${escapeHtml(row.quotaAmountText)}${quotaDescription}${restrictions}</td>
          <td class="num">${unitPrice}</td>
          <td><time datetime="${escapeHtml(row.updatedText)}">${escapeHtml(row.updatedText)}</time>
            ${row.verifiedText && row.verifiedText !== row.updatedText
    ? `<small>核对 ${escapeHtml(row.verifiedText)}</small>` : ''}</td>
          <td>${escapeHtml(row.noteText)}</td>
        </tr>`;
}

/**
 * `<main>` 里的全部内容（含 `<h1>`）。面包屑、页头、页脚、`<head>` 由构建期套壳。
 *
 * @param {object[]} plans plans.json 的记录
 * @param {{providerTable?:object}} [opts]
 */
function plansPageBody(plans, opts = {}) {
  const rows = plansRows(plans, opts);
  const home = opts.homeHref || PLANS_HOME_HREF;
  const computable = rows.filter(row => row.unitPriceComputable).length;
  const withPromo = rows.filter(row => row.promoText !== UNKNOWN_NUM).length;
  const providerCount = new Set(rows.map(row => row.providerKey)).size;

  return `      <nav class="crumb" aria-label="面包屑"><a href="${home}">首页</a> › <span>${escapeHtml(PLANS_HEADING)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(PLANS_HEADING)}</h1>
        <span class="meta">共 ${rows.length} 条套餐 · ${providerCount} 个平台 · 国内 ${rows.filter(r => r.regionText === '国内').length} 条</span>
      </div>

      <p class="snote">${escapeHtml(PLANS_DESCRIPTION)}</p>

      <div class="ptable-wrap">
      <table class="ptable">
        <caption>共 ${rows.length} 条套餐 · 有活动价 ${withPromo} 条 · 名义 Token 单价可计算 ${computable} 条
          （算不出的显示「${UNKNOWN_NUM}」，不填 0、不参与排序）</caption>
        <thead>
          <tr>
            <th scope="col">平台</th>
            <th scope="col">套餐</th>
            <th scope="col" class="num">正常价格</th>
            <th scope="col" class="num">当前活动价</th>
            <th scope="col">计费周期</th>
            <th scope="col">可用模型</th>
            <th scope="col">额度类型</th>
            <th scope="col">原始额度</th>
            <th scope="col" class="num">名义 Token 单价</th>
            <th scope="col">最近更新</th>
            <th scope="col">备注</th>
          </tr>
        </thead>
        <tbody>${rows.map(renderRow).join('')}
        </tbody>
      </table>
      </div>

      <h2 class="ph2">口径与说明</h2>
      <ul class="plist">
        ${PLANS_NOTES.map(note => `<li>${renderNote(note)}</li>`).join('\n        ')}
      </ul>

      <p class="snote" style="margin-top: var(--s3)">
        名义 Token 单价的口径：${escapeHtml(planSchema.PLAN_WORDING.nominalUnitPriceNote)}
        数据集与判据：<a href="${home}plans.json">plans.json</a>（每条套餐的原始字段，含官方原文引文）。
        这一页只做收录与整理，价格、额度与条款以各平台官方页面为准。
      </p>`;
}

/**
 * 口径文案里允许两处极小的强调标记（`**…**` → `<b>`）。
 * 只支持这一种，且**只在我们自己的文案上**使用 —— 数据里的文本一律走 escapeHtml。
 */
function renderNote(text) {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

/** JSON-LD：#1 CollectionPage、#2 BreadcrumbList、#3 ItemList（一段一个对象） */
function plansJsonLd(plans, { siteUrl, providerTable = null } = {}) {
  const pageUrl = `${siteUrl}${PLANS_ROUTE}`;
  const rows = plansRows(plans, { providerTable });
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${PLANS_HEADING} · AI 优惠聚合器`,
      description: PLANS_DESCRIPTION,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: 'AI 优惠聚合器', url: siteUrl }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: PLANS_HEADING, item: pageUrl }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: PLANS_HEADING,
      // ItemList 指向**各自的官方定价页**（与首页同一条口径：主链接给到厂商官方页）。
      // 因此 seo.js 的 itemlist-members 对不上（它按站内 deal 路由判成员），
      // 描述符里显式关掉那一条 —— 不去伪造一个本站不存在的详情页。
      numberOfItems: rows.length,
      itemListElement: rows.map((row, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: row.officialUrl,
        name: `${row.provider} ${row.planName}`
      }))
    }
  ];
}

/* ------------------------------------------------------------------ */
/* 诚实性断言（构建期与自测**共用同一个函数**）                          */
/* ------------------------------------------------------------------ */

/** 取每一行的 HTML（`data-item` 到下一个 `data-item` 之间），用于逐行断言 */
function rowHtmlById(html) {
  const map = new Map();
  const chunks = String(html).split('<tr data-item="');
  for (const chunk of chunks.slice(1)) {
    const id = chunk.slice(0, chunk.indexOf('"'));
    map.set(id, chunk);
  }
  return map;
}

/** 只取单元格里 `<small>` 之前的那段文本（价格单元格把币种放在 `<small>` 里） */
function cellText(markup) {
  return String(markup).split('<small>')[0].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * 页面级诚实性断言。返回问题列表（空 = 通过）。
 *
 * 这就是题面第三条要求的那件事：把「不许出现结论性词汇」「未知必须显式写出」
 * 「算不出的单价不得显示成 0」从产品规则变成**可失败的断言**。
 */
function assertPageHonesty(html, plans, opts = {}) {
  const problems = [];
  const text = String(html);
  const rows = plansRows(plans, opts);
  const byId = rowHtmlById(text);

  if (!/<h1>/.test(text)) problems.push('缺少 <h1>');
  if (!text.includes(PLANS_HEADING)) problems.push(`缺少标题「${PLANS_HEADING}」`);

  // ① 口径文案必须在页面上（题面 §四 点名要求）
  if (!text.includes(escapeHtml(planSchema.PLAN_WORDING.nominalUnitPriceNote))) {
    problems.push('缺少「名义 Token 单价只用于粗略比较」的口径说明');
  }

  // ② 结论性词汇一律不许出现
  for (const word of FORBIDDEN_CLAIM_WORDS) {
    if (text.includes(word)) problems.push(`页面出现结论性词汇「${word}」（本页只列事实，不做价值判断）`);
  }

  // ③ 每一行都在，且行数 == 套餐数
  if (byId.size !== rows.length) {
    problems.push(`页面行数 ${byId.size} ≠ 套餐数 ${rows.length}`);
  }
  for (const row of rows) {
    const chunk = byId.get(row.id);
    if (!chunk) { problems.push(`缺少套餐行 ${row.id}（${row.provider} ${row.planName}）`); continue; }

    // ④ 官方链接必须在行内（来源可追溯）
    if (!chunk.includes(row.officialUrl)) problems.push(`${row.planName}: 行内没有官方链接`);

    // ⑤ 三个数值列**逐个单元格**比对到行模型。
    //
    // 为什么不能拿整行做正则：第一版写的是 `/0\b/` 之类的"整行里有没有 0"，
    // 于是 `2,000` 的末位 0 被判成「原价未知却像 0」—— 断言在**正常数据**上失败。
    // 单元格级的比对既没有这个歧义，也比正则强：它同时钉住了「未知那一格显示的到底是什么」。
    const numericCells = [...chunk.matchAll(/<td class="num">([\s\S]*?)<\/td>/g)].map(m => cellText(m[1]));
    if (numericCells.length !== 3) {
      problems.push(`${row.planName}: 数值列应有 3 个（正常价格 / 活动价 / 名义 Token 单价），实得 ${numericCells.length} 个`);
    } else {
      const [regular, promo, unitPrice] = numericCells;
      if (regular !== row.regularText) {
        problems.push(`${row.planName}: 正常价格渲染成「${regular}」，应为「${row.regularText}」`);
      }
      if (promo !== row.promoText) {
        problems.push(`${row.planName}: 活动价渲染成「${promo}」，应为「${row.promoText}」`);
      }
      if (unitPrice !== row.unitPriceText) {
        problems.push(`${row.planName}: 名义 Token 单价渲染成「${unitPrice}」，应为「${row.unitPriceText}」`);
      }
      // ⑧ 「原价未知」与「确实免费」必须**长得不一样**（H4 的核心）。
      //    这一条是**成对**的：只看一半（比如"未知不许是 0"）会在另一个方向上漏掉 ——
      //    把 `regularPrice: 0` 也渲染成「未标注」，读者就再也看不到免费档了。
      if (row.regularValue === null && regular !== UNKNOWN_TEXT) {
        problems.push(`${row.planName}: 原价未知必须写「${UNKNOWN_TEXT}」，实得「${regular}」`);
      }
      if (row.regularValue === 0 && !/0/.test(regular)) {
        problems.push(`${row.planName}: 确实是免费档（regularPrice=0），价格必须显示成含 0 的数字，实得「${regular}」`);
      }
      if (row.promoValue === null && promo !== UNKNOWN_NUM) {
        problems.push(`${row.planName}: 没有活动价时必须写「${UNKNOWN_NUM}」，实得「${promo}」`);
      }
    }

    // ⑥ 算不出的单价必须显式标记，不能看起来像一个数字
    if (!row.unitPriceComputable && !chunk.includes(`class="pnone"`)) {
      problems.push(`${row.planName}: 名义 Token 单价不可比较，却没有标记为「${UNKNOWN_NUM}」`);
    }
  }

  // ⑦ 可计算单价的行数必须与数据一致（不多报也不少报）
  const computable = rows.filter(row => row.unitPriceComputable).length;
  if (!text.includes(`名义 Token 单价可计算 ${computable} 条`)) {
    problems.push(`页面声明"可计算 N 条"与实际不一致（应为 ${computable} 条）`);
  }
  return problems;
}

/** 数据层：结论性词汇也不许出现在**我们写的数据**里（套餐名 / 备注 / 额度口径） */
function assertDataHonesty(plans) {
  const problems = [];
  const scan = (plan, field, value) => {
    if (typeof value !== 'string') return;
    for (const word of FORBIDDEN_CLAIM_WORDS) {
      if (value.includes(word)) problems.push(`${plan.planName} 的 ${field} 含结论性词汇「${word}」`);
    }
  };
  for (const plan of plans || []) {
    scan(plan, 'planName', plan.planName);
    scan(plan, 'billing.note', plan.billing && plan.billing.note);
    scan(plan, 'billing.promoNote', plan.billing && plan.billing.promoNote);
    scan(plan, 'quota.description', plan.quota && plan.quota.description);
  }
  return problems;
}

module.exports = {
  PLANS_ROUTE,
  PLANS_HOME_HREF,
  PLANS_HEADING,
  PLANS_DESCRIPTION,
  PLANS_NOTES,
  FORBIDDEN_CLAIM_WORDS,
  UNKNOWN_TEXT,
  UNKNOWN_NUM,
  UNKNOWN_TRI,
  CURRENCY_SYMBOL,
  BILLING_PERIOD_LABEL,
  QUOTA_PERIOD_LABEL,
  QUOTA_TYPE_LABEL,
  MODEL_ROLE_LABEL,
  RESTRICTION_LABEL,
  escapeHtml,
  formatNumber,
  providerNameOf,
  planRowOf,
  plansRows,
  plansPageBody,
  plansJsonLd,
  rowHtmlById,
  cellText,
  assertPageHonesty,
  assertDataHonesty
};
