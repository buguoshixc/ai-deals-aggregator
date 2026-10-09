/**
 * `/plans/api/` 的**正文渲染**（v2.5：把 API 计费数据变成读者能看的页面）。
 *
 * ## 与 `/plans/coding/` 的关系
 *
 * 同一个理由把渲染放在 lib：要能被**离线自测直接调用**（`build-local.js` 一 require
 * 就会跑整条构建链，自测不可能把它当库用）。这一支因此是**纯函数**：
 * 不读盘、不联网、不看时钟、不写盘。
 *
 * 但这一页**刻意不是套餐页的复用**，两者问的问题不同：
 *
 *   · 套餐页回答「长期订阅一个月多少钱、给多少额度」——行 = 一个可售套餐；
 *   · 这一页回答「按量计费时，某个模型每百万 token 多少钱」——行 = 一个模型计价条目。
 *
 * 所以列不同、单位不同、比较口径也不同（见 `API_PLANS_NOTES`）。
 *
 * ## 这一页的四条硬承诺（都有断言，见 `assertPageHonesty()`）
 *
 * 1. **只列事实，不做结论**。没有评分、没有排名、没有"性价比"、没有"哪个更便宜"。
 *    页面上不许出现结论性词汇 —— 与套餐页**共用同一份** `FORBIDDEN_CLAIM_WORDS`。
 * 2. **单位永远与数字同时出现**。每个价格单元格旁边就写着币种，整行还有「计费单位」列
 *    （如 `USD / 每 100 万 tokens`）。**不把「每千」换算成「每百万」** —— 换算会让
 *    读者以为两个不同口径的数字可直接比较。
 * 3. **缺值不占位**。未知一律显式写成「未标注」/「—」/「未确认」，绝不写 0；
 *    `0` 只用于官方明说免费的那一项，并且渲染成「免费」而不是「$0」。
 * 4. **credits 绝不折算成 token**。这一页不会把「充 $10 得 10 credits」写成任何 token 数量 ——
 *    页面上也没有任何地方接受这种写法（数据层的草稿结构里压根没有 token 字段）。
 */

const apiSchema = require('./api-plan-schema');
const providersLib = require('./providers');
const plansPage = require('./plans-page');

/**
 * 说明登记（notes-manifest-residual-v1）：`.snote` 构造点不再直接写进页面 —— 每个构造点在
 * 产出那一段 HTML 的**同一次调用**里登记（`ctx.note` 由 `build-local.js` 按 route 注入）。
 * 与 `lib/vendor-page.js` 同形：参数可以是 ctx 对象（含 `.note`），也可以是 note 函数本身；
 * 都没有时是恒等函数（断言 / selftest 路径不产出页面）。
 */
const NOTES_DECLARED_BY = 'lib/api-plans-page.js';
const noteIn = source => {
  if (typeof source === 'function') return source;
  if (source && typeof source.note === 'function') return source.note;
  return (decl, html) => html;
};


const API_PLANS_ROUTE = 'plans/api/';
const API_PLANS_HEADING = 'API / Token 计费对比';
const API_PLANS_DESCRIPTION = '把各平台按量计费（API / Token）的官方价格放在一张表里比：'
  + '输入价、输出价、缓存命中价、其他计费维度（缓存写入 / 推理 / 非 token 计费）、免费额度与 credits。'
  + '只列事实，不排名、不评分、不替读者判断值不值。';

const UNKNOWN_TEXT = plansPage.UNKNOWN_TEXT;
const UNKNOWN_NUM = plansPage.UNKNOWN_NUM;
const UNKNOWN_TRI = plansPage.UNKNOWN_TRI;

/** 列模型（顺序即列序）。表头与断言共用这一份，不可能"加了列却忘了改另一处"。 */
const API_PLANS_COLUMNS = [
  '平台', '模型', '变体', '计费单位', '输入价', '输出价', '缓存命中输入',
  '其他计费维度', '免费额度 / credits', '最近更新', '官方来源'
];

/** 与套餐页**同一份**清单（唯一出处），不另立一套结论性词汇。 */
const FORBIDDEN_CLAIM_WORDS = plansPage.FORBIDDEN_CLAIM_WORDS;

const REGION_LABEL = { cn: '国内', global: '国外' };

/** 口径与说明：读不完这些，这张表会被读成"哪个便宜"。 */
const API_PLANS_NOTES = [
  '本页列的是**按量计费（API / Token）的官方单价**，与「长期订阅套餐」（[Coding 套餐对比](plans/coding/)）是两件事：前者按用量计费，后者按月/年收费。两者不互相换算。',
  '**单位永远写出来**：每一行的「计费单位」列写明这一行数字的口径（例如 `USD / 每 100 万 tokens`）。'
  + '不同单位之间**不做换算**（我们不把「每 1000 tokens」乘 1000 变成「每 100 万」）——'
  + '换算会让两个口径不同的数字看起来可以直接比较。',
  '**输入价与输出价是两列**，不合并成一个「价格」。缓存命中、缓存写入、推理 token、批处理价各占自己的位置；'
  + '按图 / 秒 / 分钟等非 token 口径计费的项写在「其他计费维度」列里，并各自带单位。',
  '`0` 只表示**官方明说免费**（渲染成「免费」）；官方没有公布的那一项写「—」，'
  + '两者含义不同，绝不互相顶替。',
  '「免费额度」栏**逐条标注性质**：**长期提供**（官方长期提供的免费档 / 免费模型）、'
  + '**新用户赠送**（首次开通 / 新注册的赠送）、**限时赠送**（活动期内的赠品）。'
  + '只有标为「长期提供」的才是长期免费能力；后两类**不是** —— 它们是官方的一次性或限时赠送，'
  + '本站照原样收录并标注（它们的优惠形态属于优惠（Deals）；若本站有对应条目，会以显式关系互链）。',
  '**credits 是预付费额度（钱），不是 token 数量**。本页不把「充 $10 得 10 credits」折算成任何 token 数 ——'
  + '那不是套餐的原始额度，而是需要「选定模型 + 选定单价 + 明确扣减条件」才能算出的**计算值**。'
  + '需要这类估算请等待后续的 API 成本计算器。',
  '**本页不产出任何派生单价**：把输入价与输出价按某个比例加权得到"混合单价"，需要先假设一个工作负载；'
  + '假设一变结论就变，那不是价格事实。',
  // [T5-api-plans-88-footer-dup]
  // T5 删除（census B · 重复）：删本条**句首**的「价格与额度以官方页面为准：」—— 与共享页脚
  // （每页都有「优惠信息来自各厂商官方页面与公开折扣页，最终以官方页面为准。」）同义重复。
  // ⚠️ 与 /plans/coding/ 那条**同一形状**（两页共用这一份清单的写法），处理也保持一致：
  //   删的只是**重复的那半句**，不是整条 —— 「表中每条都链到该平台的官方定价页」是这一页自己的
  //   可核对路径，「官方已公告的调价写在「其他计费维度」列的备注里（本站只记录当前生效价）」
  //   是 C 类数据语义（读者要知道这一列里那行备注是什么），两件都不在页脚里。
  // 删后整条仍是完整句子：「表中每条都链到该平台的官方定价页，本站只做收录与整理；官方已公告的
  // 调价写在「其他计费维度」列的备注里（本站只记录当前生效价）。」
  // ⚠️ 与页面口径牙无关：`api-plans-selftest` 只查「长期提供 / 新用户赠送 / 限时赠送」三条（第 5 条）；
  //    `verify-site.js:5592` 只查「单位不换算 / credits 不是 token」（第 2、6 条）。
  '表中每条都链到该平台的官方定价页，本站只做收录与整理；'
  + '官方已公告的调价写在「其他计费维度」列的备注里（本站只记录当前生效价）。',
  '「最近更新」是我们最后一次人工对照官方页的日期，不是官方承诺不变的日期。'
];

const CURRENCY_SYMBOL = plansPage.CURRENCY_SYMBOL;

/* ------------------------------------------------------------------ */
/* 行模型                                                              */
/* ------------------------------------------------------------------ */

function providerNameOf(key, table) {
  const table_ = table || providersLib.load().table;
  const entry = table_ && table_[key];
  return entry && entry.name ? entry.name : key;
}

function providerLogoOf(key, table) {
  const table_ = table || providersLib.load().table;
  const entry = table_ && table_[key];
  return (entry && entry.logo) || null;
}

/** 价格文本：`null` → 「—」；`0` → 「免费」；其余带币种符号 */
function priceText(value, currency) {
  if (value === null || value === undefined) return UNKNOWN_NUM;
  if (value === 0) return '免费';
  const symbol = CURRENCY_SYMBOL[currency] || '';
  return `${symbol}${plansPage.formatNumber(value)}`;
}

/** 单价数字与单位一起说：`USD 每 100 万 tokens` */
function unitTextOf(plan) {
  const pricing = (plan && plan.pricing) || {};
  if (!pricing.unit) return UNKNOWN_TEXT;
  const label = apiSchema.API_UNIT_LABEL[pricing.unit] || pricing.unit;
  return `${pricing.currency || UNKNOWN_TEXT} / ${label}`;
}

/** 一条模型计价条目 → 一行 */
function apiRowOf(plan, entry, { providerTable = null, first = false } = {}) {
  return {
    plan,
    planId: plan.id,
    planKind: plan.kind || 'api',
    providerKey: plan.provider,
    provider: providerNameOf(plan.provider, providerTable),
    logo: providerLogoOf(plan.provider, providerTable),
    region: plan.region,
    regionLabel: REGION_LABEL[plan.region] || plan.region,
    planName: plan.planName,
    channel: plan.channel,
    channelLabel: apiSchema.API_CHANNEL_LABEL[plan.channel] || plan.channel,
    model: entry.name,
    modelKey: entry.modelKey,
    variant: entry.variant,
    variantLabel: apiSchema.MODEL_VARIANT_LABEL[entry.variant] || entry.variant,
    rates: entry.rates,
    mediaRates: entry.mediaRates,
    note: entry.note,
    currency: (plan.pricing && plan.pricing.currency) || null,
    unit: (plan.pricing && plan.pricing.unit) || null,
    unitText: unitTextOf(plan),
    freeTier: plan.freeTier || null,
    credits: plan.credits || null,
    limits: plan.limits || null,
    officialUrl: plan.officialUrl,
    lastSeen: plan.lastSeen,
    first,
    anchorId: first ? `plan-${plan.id}` : null
  };
}

/** 全部行（记录顺序 = 规范序；记录内顺序 = 模型条目的规范序） */
function apiRowsOf(plans, opts = {}) {
  const rows = [];
  for (const plan of plans || []) {
    if (!plan || !Array.isArray(plan.models)) continue;
    plan.models.forEach((entry, index) => {
      rows.push(apiRowOf(plan, entry, { ...opts, first: index === 0 }));
    });
  }
  return rows;
}

/** 供 `deal-plan-links` 复用的展示文本（与表格同一套格式化，不在这里重写价格口径） */
function apiRowTextsOf(plan, ctx = {}) {
  const entry = (plan.models || [])[0] || null;
  const row = entry ? apiRowOf(plan, entry, { providerTable: (ctx && ctx.providerTable) || null, first: true }) : null;
  const providerName = providerNameOf(plan.provider, ctx && ctx.providerTable);
  const title = `${providerName} ${plan.planName}`;
  const rates = entry ? entry.rates : {};
  return {
    providerKey: plan.provider,
    providerName,
    planName: plan.planName,
    title,
    regularText: `${providerName} · ${plan.planName}`,
    regularCode: '',
    promoText: UNKNOWN_NUM,
    promoCode: '',
    periodText: unitTextOf(plan),
    quotaText: freeTierShortText(plan),
    modelsText: modelsTextOf(plan),
    inputText: entry ? priceText(rates.input, plan.pricing && plan.pricing.currency) : UNKNOWN_NUM,
    outputText: entry ? priceText(rates.output, plan.pricing && plan.pricing.currency) : UNKNOWN_NUM,
    unitText: unitTextOf(plan),
    row
  };
}

function modelsTextOf(plan) {
  const keys = [...new Set((plan.models || []).map(entry => entry.modelKey))].sort();
  if (!keys.length) return UNKNOWN_TEXT;
  return keys.length > 6 ? `${keys.slice(0, 6).join('、')} 等 ${keys.length} 个模型` : keys.join('、');
}

/**
 * 「免费额度」的性质措辞（**唯一出处** = `apiSchema.FREE_TIER_STABILITY_LABEL`）。
 *
 * 为什么渲染层必须把它印出来（P1-11 / `F-r2-api-005`）：审计实测的形态是
 * 「一次性赠送被读者读成长期免费能力」—— 页面口径写着「只记官方长期提供的免费能力」，
 * 而数据里混着 `period:'one_time'` 的新用户赠送。两个修法都要落在**同一个地方**：
 * 数据层从此必填 `stability`（缺省即错误），渲染层则每一档都带自己的名字，
 * 而且赠送 / 限时那两档**明说「非长期能力」**（不是靠少说一句话来实现的）。
 *
 * 返回 `null` = 数据缺性质（schema 已把它判红；渲染层退化成不加前后缀，不编一个档位）。
 */
function freeTierNatureWrap(free, core) {
  const stability = free && free.stability;
  const label = apiSchema.FREE_TIER_STABILITY_LABEL[stability];
  if (!label) return core;
  // 长期档：把性质词放进短语本身（「长期提供的免费模型」）；赠送档：缀在末尾并**明说非长期**。
  // 两档的措辞形状不同，是为了让「这一条到底是不是长期能力」在单元格里一眼可读。
  if (stability === 'standing') return `${label}的${core}`;
  return `${core}（${label}，非长期能力）`;
}

/** 免费额度单元格的**核心短语**（不含性质词）：性质由 `freeTierNatureWrap` 加。 */
function freeTierCoreTextOf(free, nameOf) {
  if (free.type === 'none') return `官方明说无免费额度${free.description ? `（${free.description}）` : ''}`;
  if (free.type === 'models') return `免费模型：${(free.models || []).map(nameOf).join('、')}`;
  if (free.type === 'tokens' || free.type === 'credits' || free.type === 'requests') {
    // 单位词只从 schema 的 `FREE_TIER_UNIT_LABEL` 取 —— 这里曾经是一个本地三元表达式
    // （第三份手写单位表），"tokens 被印成 credits" 那种缺陷正是它带来的。
    const unit = apiSchema.FREE_TIER_UNIT_LABEL[free.type] || free.type;
    return `免费额度 ${plansPage.formatNumber(free.amount)} ${unit}${free.period ? ` / ${free.period}` : ''}`;
  }
  return free.description || free.type;
}

/** 「免费额度 / credits」单元格的短文本（完整句子在页面下方的明细节里） */
function freeTierShortText(plan) {
  const parts = [];
  const free = (plan && plan.freeTier) || null;
  const nameOf = key => {
    const entry = ((plan && plan.models) || []).find(item => item.modelKey === key);
    return entry ? entry.name : key;
  };
  if (free) parts.push(freeTierNatureWrap(free, freeTierCoreTextOf(free, nameOf)));
  for (const item of (plan && plan.credits) || []) {
    parts.push(`credits：付 ${CURRENCY_SYMBOL[item.currency] || ''}${plansPage.formatNumber(item.pay)} 得 ${plansPage.formatNumber(item.gets)} ${item.unit}`);
  }
  if (!parts.length) return UNKNOWN_NUM;
  return parts.join('；');
}

/** 「其他计费维度」单元格：非列内 token 维度 + 非 token 计费项 + 备注 */
function otherRatesTextOf(row) {
  const lines = [];
  for (const key of apiSchema.TOKEN_RATE_KEYS) {
    if (key === 'input' || key === 'output' || key === 'cachedInput') continue;
    const value = row.rates ? row.rates[key] : null;
    if (value === null || value === undefined) continue;
    lines.push(`${apiSchema.TOKEN_RATE_LABEL[key]} ${priceText(value, row.currency)}`);
  }
  for (const media of row.mediaRates || []) {
    lines.push(`${apiSchema.MEDIA_RATE_LABEL[media.kind] || media.kind} ${priceText(media.price, row.currency)} / ${apiSchema.MEDIA_RATE_UNIT_LABEL[media.unit] || media.unit}`);
  }
  if (row.note) lines.push(row.note);
  return lines.length ? lines : null;
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
  return plansPage.escapeHtml(value);
}

function cell(lines, className = '') {
  if (!lines || !lines.length) return `<td class="${className ? `${className} ` : ''}pnone">${UNKNOWN_NUM}</td>`;
  const first = escapeHtml(lines[0]);
  const rest = lines.slice(1).map(line => `<small>${escapeHtml(line)}</small>`).join('');
  return `<td${className ? ` class="${className}"` : ''}>${first}${rest}</td>`;
}

function numCell(value, currency) {
  const text = priceText(value, currency);
  const cls = value === null || value === undefined ? 'num pnone' : 'num';
  return `<td class="${cls}">${escapeHtml(text)}</td>`;
}

/**
 * 平台 logo。
 *
 * ⚠️ 类名必须是 `lg` —— 它是 `logos.css` 里那条 `.lg[data-logo="key"]{background-image:…}`
 * 的**唯一**匹配条件（图形、配色、内缩全在那一份 CSS 里，模板只写属性）。
 * 自造一个类名（曾经写成 `plogo`）的表现是：属性在、尺寸在、**图不在** ——
 * 页面看起来只是"logo 位有点空"，而构建期与"无外部请求"的断言都不会红。
 * 真浏览器那一条 `verify-site` §20 会把背景图量出来，专门挡这种坏法。
 */
function logoHtml(row) {
  if (!row.logo) return '';
  return `<span class="lg" data-logo="${escapeHtml(row.logo)}" role="img"`
    + ` aria-label="${escapeHtml(`${row.provider} 标识`)}"></span>`;
}

function rowHtml(row) {
  const idAttr = row.anchorId ? ` id="${escapeHtml(row.anchorId)}"` : '';
  return `      <tr data-item="${escapeHtml(row.modelKey)}|${escapeHtml(row.variant)}" data-plan="${escapeHtml(row.planId)}">
        <td class="pv">${logoHtml(row)}<span class="pvname">${escapeHtml(row.provider)}</span><small>${escapeHtml(row.regionLabel)}</small></td>
        <th scope="row"${idAttr}>${escapeHtml(row.model)}<small>${escapeHtml(row.planName)} · ${escapeHtml(row.channelLabel)}</small></th>
        <td>${escapeHtml(row.variantLabel)}</td>
        <td class="punit">${escapeHtml(row.unitText)}</td>
        ${numCell(row.rates ? row.rates.input : null, row.currency)}
        ${numCell(row.rates ? row.rates.output : null, row.currency)}
        ${numCell(row.rates ? row.rates.cachedInput : null, row.currency)}
        ${cell(otherRatesTextOf(row))}
        <td class="pfree">${escapeHtml(freeTierShortText(row.plan))}</td>
        <td class="pdate">${escapeHtml(row.lastSeen)}</td>
        <td><a href="${escapeHtml(row.officialUrl)}" rel="nofollow noopener" target="_blank">官方定价页 ↗</a></td>
      </tr>`;
}

/** 免费额度与 credits 的明细（厂商级事实，逐条带官方口径） */
function freeTierSectionHtml(plans, note = null) {
  const items = [];
  for (const plan of plans) {
    if (!plan.freeTier && !plan.credits) continue;
    const lines = [];
    if (plan.freeTier) {
      const free = plan.freeTier;
      const type = {
        tokens: '免费 token 额度', credits: '免费积分', requests: '免费请求次数',
        models: '免费模型', rate_limited: '免费档（按窗口限速）',
        unlimited_fair_use: '免费档（公平使用）', none: '官方明说没有免费额度', other: '其他'
      }[free.type] || free.type;
      const amount = free.amount === null || free.amount === undefined ? '' : ` ${plansPage.formatNumber(free.amount)}`;
      const period = free.period ? `（刷新周期：${free.period}）` : '';
      // 性质摆在最前面（与上表那一列同一个词表）：读者先看到「新用户赠送」「限时赠送」，
      // 再看到额度和官方条件 —— 「它不是长期能力」这件事不靠读者自己推断。
      const nature = apiSchema.FREE_TIER_STABILITY_LABEL[free.stability] || null;
      const heading = nature ? `${nature} · ${type}` : type;
      lines.push(`<li><b>${escapeHtml(providerNameOf(plan.provider))} · ${escapeHtml(plan.planName)}</b>：${escapeHtml(heading)}${escapeHtml(amount)}${escapeHtml(period)}`
        + (free.models ? ` —— 覆盖模型：${escapeHtml(free.models.join('、'))}` : '')
        + `${free.description ? `<br><span class="pftdesc">${escapeHtml(free.description)}</span>` : ''}</li>`);
    }
    for (const credit of plan.credits || []) {
      lines.push(`<li><b>${escapeHtml(providerNameOf(plan.provider))} · ${escapeHtml(plan.planName)}</b>：预付费额度 —— `
        + `付 ${escapeHtml(CURRENCY_SYMBOL[credit.currency] || '')}${escapeHtml(plansPage.formatNumber(credit.pay))}`
        + ` 得 ${escapeHtml(plansPage.formatNumber(credit.gets))} ${escapeHtml(credit.unit)}`
        + `<br><span class="pftdesc">${escapeHtml(credit.description)}</span>`
        + `${credit.usageNote ? `<br><span class="pftdesc">扣减口径：${escapeHtml(credit.usageNote)}</span>` : ''}`
        + `${credit.expires ? `<br><span class="pftdesc">有效期：${escapeHtml(credit.expires)}</span>` : ''}</li>`);
    }
    items.push(...lines);
  }
  if (!items.length) return '';
  return `      <h2 class="ph2" id="api-free">免费额度与 credits（厂商级事实）</h2>
      ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">这一节把上表那一列的短文本展开，并逐条写明<b>性质</b>：长期提供的免费能力 / 新用户赠送 / 限时赠送。
      只有「长期提供」才是长期免费能力；后两类是一次性或限时赠送，官方条件写在每条的说明里。</p>`)}
      <ul class="pftlist">
${items.map(item => `        ${item}`).join('\n')}
      </ul>`;
}

/** 官方原文引文（原生 details，无 JS 可折叠） */
function evidenceSectionHtml(plans) {
  const blocks = plans.map(plan => {
    const evidence = Array.isArray(plan.evidence) ? plan.evidence : [];
    if (!evidence.length) return '';
    const items = evidence.map(item => `          <li><span class="pevfield">${escapeHtml(item.field)}</span>`
      + `<q>${escapeHtml(item.quote)}</q>`
      + `<small>${escapeHtml(item.sourceUrl)} · 抓取于 ${escapeHtml(item.capturedAt)}</small></li>`).join('\n');
    return `        <details class="pevd">
          <summary>${escapeHtml(providerNameOf(plan.provider))} · ${escapeHtml(plan.planName)}（${escapeHtml(apiSchema.API_CHANNEL_LABEL[plan.channel] || plan.channel)}）的官方原文</summary>
          <ul class="pev">
${items}
          </ul>
        </details>`;
  }).filter(Boolean);
  if (!blocks.length) return '';
  return `      <h2 class="ph2" id="api-evidence">官方原文（每条价格的出处）</h2>
${blocks.join('\n')}`;
}

function crossLinkHtml(prefix, note = null) {
  return `      ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote" id="api-cross">相关页面：<a href="${prefix}plans/coding/">AI Coding 套餐对比</a>`
    + `（长期订阅的价格与额度） · <a href="${prefix}changes/">最近变化</a> · <a href="${prefix}feeds/">订阅</a></p>`)}`;
}

/**
 * 「最近变化」块：**构建期静态渲染**（无 JS 也读得到）。
 *
 * 事件来自 `api-plan-history.json` —— 与 Coding 套餐共用同一个写入内核
 * （`lib/plan-history.js` 的 `recordWithProfile`），但判据与措辞各有一份
 * （`lib/api-plan-history.js`）。**页面上不自己造事件**：这里只把日志里已有的
 * 条目排版，日志为空就如实写「暂无」。
 *
 * @param {object|null} store   `api-plan-history.json` 的内容（null = 不可用）
 * @param {object[]}    plans   当前记录（取标题快照）
 */
// [T5-api-plans-435-changes-note-head]
// T5 删除（census B · 半句）：删「以下是本站重建 API 计费数据时留下的观测记录（最多 ${limit} 条）。」—— 生成方式自证 + 条数上限自证（上限是实现细节，读者看到的就是实际条数）。保留后半句「「不再收录」表示人工来源层不再列出它，**不表示厂商已经下架**」—— 三态解释是 C 类。⚠️ 同一构造点同时供给 /plans/api/ 与 /plans/ 两页。
function apiChangesBlockHtml(store, plans, { limit = 12 } = {}, note = null) {
  const history = require('./api-plan-history');
  const W = history.API_PLAN_HISTORY_WORDING;
  const byId = new Map((plans || []).map(plan => [plan.id, plan]));

  if (!store) {
    return `      <h2 class="ph2" id="api-changes">最近变化</h2>
      ${noteIn(note)({ kind: 'page-note-empty', slot: 'main-snote', classes: 'snote pnone', declaredBy: NOTES_DECLARED_BY }, `<p class="snote pnone">${escapeHtml(W.API_PLAN_HISTORY_LABELS.unavailable)}</p>`)}`;
  }

  const events = (store.events || []).filter(event => event && event.type !== 'updated');
  if (!events.length) {
    const since = (store.baseline && store.baseline.at) || null;
    return `      <h2 class="ph2" id="api-changes">最近变化</h2>
      ${noteIn(note)({ kind: 'page-note-empty', slot: 'main-snote', classes: 'snote pnone', declaredBy: NOTES_DECLARED_BY }, `<p class="snote pnone">${escapeHtml(W.API_PLAN_HISTORY_LABELS.empty)}`
      + `${since ? `（变更记录自 ${escapeHtml(since)} 起）` : ''}</p>`)}`;
  }

  const sorted = [...events].sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1)).slice(0, limit);
  const items = sorted.map(event => {
    const plan = byId.get(event.planId) || null;
    const title = plan ? `${providerNameOf(plan.provider)} · ${plan.planName}` : `${event.planId}（已不在当前数据里）`;
    const type = W.API_PLAN_HISTORY_TYPES[event.type] || event.type;
    const field = event.field ? (W.API_PLAN_HISTORY_FIELD_LABELS[event.field] || event.field) : '';
    const detail = apiPlanChangeTextOf(event);
    return `        <li><span class="pchgwhen">${escapeHtml(event.at)}</span>`
      + `<span class="pchgwho">${escapeHtml(title)}</span>`
      + `<span class="pchgtype">${escapeHtml(type)}</span>`
      + `${field ? `<span class="pchgwhat">${escapeHtml(field)}</span>` : ''}`
      + `${detail ? `<span class="pchgorigin">${escapeHtml(detail)}</span>` : ''}</li>`;
  }).join('\n');

  return `      <h2 class="ph2" id="api-changes">最近变化</h2>
      ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">`
    + `「不再收录」表示人工来源层不再列出它，<b>不表示厂商已经下架</b>。</p>`)}
      <ul class="pchglist">
${items}
      </ul>`;
}

/**
 * 一条 API 计费变化 → 一行 HTML（v3.0 Stage H）。
 *
 * 与套餐那一支（`plans-page.planChangeItemHtml`）**同一套 class**，因此 `/changes/` 上
 * 两块的视觉语言是同一套，不新增 CSS 词汇。
 *
 * `opts.planHref(item)` 决定「哪条记录变了」那段文字链到哪里：
 *   · 缺省是页内锚点 `#plan-<id>`（`/plans/api/` 的表格行带这个 id）；
 *   · 渲染在**别的页面**上（`/changes/`）时必须传它 —— 那里没有 API 表格行，
 *     页内锚点会变成点不动的死链。
 */
function apiPlanChangeItemHtml(item, opts = {}) {
  const W = require('./api-plan-history').API_PLAN_HISTORY_WORDING;
  const who = item.titled
    ? `${item.vendor ? `${item.vendor} · ` : ''}${item.title}`
    : W.API_PLAN_HISTORY_LABELS.tombstone;
  const typeLabel = W.API_PLAN_HISTORY_TYPES[item.type] || item.type;
  const href = typeof opts.planHref === 'function'
    ? opts.planHref(item)
    : (item.planId ? `#plan-${item.planId}` : null);
  const link = href
    ? `<a class="pchgwho" href="${escapeHtml(href)}">${escapeHtml(who)}</a>`
    : `<span class="pchgwho">${escapeHtml(who)}</span>`;
  return `<span class="pchgwhen"><time datetime="${escapeHtml(item.at)}">${escapeHtml(item.at)}</time></span>`
    + `${link}<span class="pchgtype">${escapeHtml(typeLabel)}</span>`
    + `<span class="pchgwhat">${escapeHtml(apiPlanChangeTextOf(item))}</span>`;
}

/**
 * `/changes/` 的 **API 价格变化**分栏（v3.0 Stage H1）。
 *
 * 与套餐那一支结构逐项对应（同一套 class、同一套四栏、同样的空态与截断说明），
 * 差别只有两处，且两处都是**数据事实**而不是排版偏好：
 *   · 判据来自 `api-plan-history.json`（`plan-changes.buildApiPlanRadar()`），
 *     **不新建第二套变化检测**；
 *   · 链接跨页落到 `/plans/api/#plan-<id>` —— API 计费记录的表格行在那一页上。
 *
 * @param {object} radar `plan-changes.buildApiPlanRadar()` 的结果
 * @param {object} [opts] `{ prefix, providerTable }`
 */
function apiPlanChangesPageBlockHtml(radar, opts = {}) {
  const planChanges = require('./plan-changes');
  const W = planChanges.API_PLAN_CHANGES_WORDING.API_PLAN_CHANGES_LABELS;
  const S = planChanges.API_PLAN_CHANGES_WORDING.API_PLAN_CHANGES_SECTION;
  const prefix = opts.prefix || '';

  if (!radar || radar.availability !== 'ok') {
    return `<section class="chgsec apichanges" id="api-plans">
      <h2>${escapeHtml(W.sectionTitle)}</h2>
      ${noteIn(opts)({ kind: 'page-note-warn', slot: 'main-snote', classes: 'snote chgwarn', declaredBy: NOTES_DECLARED_BY }, `<p class="snote chgwarn">${escapeHtml(W.unavailable)}</p>`)}
    </section>
`;
  }

  // 渲染在 **/changes/** 上：页面上没有 API 表格行，链接必须跨页落到 `/plans/api/`。
  const itemOpts = {
    ...opts,
    planHref: item => (item.planId ? `${prefix}plans/api/#plan-${item.planId}` : null)
  };
  const sections = planChanges.PLAN_CHANGES_SECTION_ORDER.map(key => {
    const section = radar.sections[key];
    const items = section.items;
    const list = items.length
      ? `<ul class="chglist">
${items.map(item => `          <li>${apiPlanChangeItemHtml(item, itemOpts)}</li>`).join('\n')}
        </ul>`
      : `${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(W.emptySection[key])}</p>`)}`;
    const truncated = section.truncated > 0
      ? `\n        ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(W.more.replace('{n}', String(section.truncated)))}</p>`)}` : '';
    return `      <div class="chgsub">
        <h3>${escapeHtml(S[key])}（${radar.totals[key]}）</h3>
${list}${truncated}
      </div>`;
  }).join('\n');

  const metaNote = radar.totals.meta > 0
    ? `      ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">另有 ${radar.totals.meta} 条只影响记录元信息的变化（官方定价页 / 来源类型 / 来源地址），`
      + `不计入上面的分栏；它们仍出现在各条计费记录的变化记录里。</p>`)}\n`
    : '';

  return `<section class="chgsec apichanges" id="api-plans">
      <h2>${escapeHtml(W.sectionTitle)}</h2>
      ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(W.plansSource.replace('{date}', radar.startedAt || '未知'))}</p>`)}
${sections}
${metaNote}      ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(W.disclaimer)}</p>`)}
    </section>
`;
}

/**
 * 生命周期事件（`created` / `restored`）**没有 from/to**：它们描述的是「这条记录在数据集里的
 * 状态变化」，不是某个字段的新旧值。
 *
 * 为什么必须单列（T07 的非空 E2E 抓到的生产可见缺陷）：旧实现把这类事件也塞进
 * `fieldsDiffText` 的「新增：{to}」模板，两侧都缺席时 `to` 被渲染成占位符 —— 页面上出现
 * 「首次收录 · **新增：—**」（生产 6 处、合成非空态 9 处）：类型列已经说了「首次收录」，
 * 旁边再写一句「新增：—」既不构成一句话，也在暗示"新增了某个东西"。
 */
const LIFECYCLE_CHANGE_TEXT = {
  created: '本条记录首次进入数据集（此前没有它的观测记录）',
  restored: '本条记录重新出现（此前记为不再收录）'
};

/**
 * 一条 API 计费变化事件 → 「变了什么」的句子。**唯一出处**：`/plans/api/` 的「最近变化」块、
 * `/changes/` 的 API 分栏与 `feed/plans/api/changes.*` 的正文都读它 ——
 * 同一件事在页面与订阅源里必须是同一句话（复制一份就会漂）。
 *
 * 「不再收录」事件说**原因**而不是值差：它没有 from/to，而且原因才是读者要知道的那件事。
 * 生命周期事件同理（见 `LIFECYCLE_CHANGE_TEXT`）；**任何事件都不许渲染成空**——
 * `/changes/` 的「变了什么」格没有"空"这个形态，空值只会表现成一句假话。
 */
function apiPlanChangeTextOf(event) {
  const W = require('./api-plan-history').API_PLAN_HISTORY_WORDING;
  if (!event || typeof event !== 'object') return '';
  if (event.type === 'ended') {
    return W.API_PLAN_HISTORY_END_REASONS[event.reason] || event.reason || '';
  }
  if (LIFECYCLE_CHANGE_TEXT[event.type]) return LIFECYCLE_CHANGE_TEXT[event.type];
  const text = fieldsDiffText(event);
  if (text) return text;
  // 兜底：认得出类型就说类型名，认不出才退回类型原串（绝不返回空串）
  return W.API_PLAN_HISTORY_TYPES[event.type] || event.type;
}

/** 事件的新旧值 → 一句人话（只描述数值本身，不做任何加减与结论） */
function fieldsDiffText(event) {
  if (event.type === 'model_added' || event.type === 'model_removed') {
    const entry = event.to || event.from;
    const key = entry ? `${entry.modelKey}｜${apiSchema.MODEL_VARIANT_LABEL[entry.variant] || entry.variant}` : '';
    return key;
  }
  if (event.field === 'models' && event.from && event.to) {
    const parts = [];
    for (const key of apiSchema.TOKEN_RATE_KEYS) {
      const a = event.from.rates ? event.from.rates[key] : null;
      const b = event.to.rates ? event.to.rates[key] : null;
      if (a === b) continue;
      parts.push(`${apiSchema.TOKEN_RATE_LABEL[key]} ${a === null ? UNKNOWN_NUM : a} → ${b === null ? UNKNOWN_NUM : b}`);
    }
    if (!parts.length) parts.push('别名 / 备注 / 非 token 计费项变化');
    return parts.join('；');
  }
  if (event.field === 'pricing.unit') return `${event.from || UNKNOWN_TEXT} → ${event.to || UNKNOWN_TEXT}`;
  // 两侧都缺席 ⇒ 模板拼不出句子（旧实现拼出「新增：—」）。交给调用方按事件类型说语义。
  if (event.from === null || event.from === undefined) {
    if (event.to === null || event.to === undefined) return '';
    return `新增：${shortValue(event.to)}`;
  }
  if (event.to === null || event.to === undefined) return `移除：${shortValue(event.from)}`;
  return `${shortValue(event.from)} → ${shortValue(event.to)}`;
}

function shortValue(value) {
  if (value === null || value === undefined) return UNKNOWN_NUM;
  if (typeof value === 'object') {
    const text = JSON.stringify(value);
    return text.length > 60 ? `${text.slice(0, 57)}…` : text;
  }
  return String(value);
}

/**
 * 页面正文（纯函数）。
 *
 * @param {object[]} plans   `api-plans.json` 的 `plans`（规范序）
 * @param {object}   opts    { providerTable, prefix }
 */
function apiPlansPageBody(plans, opts = {}) {
  const prefix = opts.prefix || '';
  const providerTable = opts.providerTable || null;
  const rows = apiRowsOf(plans, { providerTable });
  const providers = [...new Set(plans.map(plan => plan.provider))];
  const updatedAt = plans.map(plan => plan.lastSeen).filter(Boolean).sort().pop() || UNKNOWN_TEXT;

  const notes = API_PLANS_NOTES.map(text => `        <li>${markdownish(text, prefix)}</li>`).join('\n');
  const body = rows.map(rowHtml).join('\n');

  return `      <nav class="crumb" aria-label="面包屑"><a href="${prefix}">首页</a> › <span>${escapeHtml(API_PLANS_HEADING)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(API_PLANS_HEADING)}</h1>
        <span class="meta">${plans.length} 条计费记录 · ${providers.length} 个平台 · ${rows.length} 个模型计价条目 · 最近核对 ${escapeHtml(updatedAt)}</span>
      </div>

      ${noteIn(opts)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(API_PLANS_DESCRIPTION)}</p>`)}

      <h2 class="ph2" id="api-notes">口径与说明（先读这一段）</h2>
      <ul class="plist">
${notes}
      </ul>

      <div class="ptable-wrap">
      <table class="ptable">
        <caption>表头 ${API_PLANS_COLUMNS.length} 列；每一行是一个「平台 × 模型 × 变体」的计价条目。价格单位见「计费单位」列，不跨单位换算。</caption>
        <thead>
          <tr>${API_PLANS_COLUMNS.map((name, index) => `<th${index === 0 ? '' : ' scope="col"'}>${escapeHtml(name)}</th>`).join('')}</tr>
        </thead>
        <tbody>
${body}
        </tbody>
      </table>
      </div>

${freeTierSectionHtml(plans, opts.note)}

${apiChangesBlockHtml(opts.historyStore || null, plans, {}, opts.note)}

${dealLinksBlockHtml(opts.dealLinks || null, opts.note)}

${evidenceSectionHtml(plans)}

${crossLinkHtml(prefix, opts.note)}
`;
}

/**
 * 「各计费记录当前优惠」块。
 *
 * 复用套餐页那一支（`plans-page.planDealsBlockHtml`）而不是另写一份：当前/历史优惠的**结构差别**
 * （`class="pdgo"` vs `pdgo pdgo-hist`）是 v2.4 的 Tooth Test 靠的东西，两页各写一套必然分家。
 * 只筛 `kind: 'api'` 的行，并把标题与计数名词换成这一页的说法。
 * 锚点指向每条记录的**第一行**（`#plan-<recordId>`），因此这一块在无 JS 时同样可跳。
 */
function dealLinksBlockHtml(view, note = null) {
  if (!view) return '';
  return plansPage.planDealsBlockHtml(view, {
    prefix: '../../',
    note,
    kind: 'api',
    heading: '各计费记录当前优惠',
    unit: '条 API 计费记录'
  });
}

/**
 * 极简行内标记：只支持 `[文字](链接)` 与 `**加粗**`，且**只在我们的常量里**使用。
 * 数据原文一律走 escapeHtml，永不进这个函数 —— 数据不是 Markdown。
 */
function markdownish(text, prefix) {
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  out = out.replace(/\[([^\]]+)\]\(([^)]*)\)/g, (match, label, href) => {
    const url = href.startsWith('http') ? href : `${prefix}${href}`;
    return `<a href="${escapeHtml(url)}">${label}</a>`;
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* 结构化数据                                                          */
/* ------------------------------------------------------------------ */

function apiPlansJsonLd(plans, { siteUrl, providerTable = null } = {}) {
  const pageUrl = `${siteUrl}${API_PLANS_ROUTE}`;
  const rows = apiRowsOf(plans, { providerTable });
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${API_PLANS_HEADING} · AI 优惠聚合器`,
      description: API_PLANS_DESCRIPTION,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: 'AI 优惠聚合器', url: siteUrl }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: API_PLANS_HEADING, item: pageUrl }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: API_PLANS_HEADING,
      numberOfItems: rows.length,
      itemListElement: rows.map((row, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: `${row.provider} ${row.model}（${row.variantLabel}）`,
        // 与套餐页同一条口径：指向**该平台官方定价页**，不伪造本站的 /plans/api/<id>/
        url: row.officialUrl
      }))
    }
  ];
}

/* ------------------------------------------------------------------ */
/* 诚实性断言                                                          */
/* ------------------------------------------------------------------ */

/** 只留标签与文本，去掉属性值（避免把 href 里的词算进正文） */
function textOnly(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** 从渲染结果里按行取出单元格文本（断言与自测共用这一个解析器） */
function rowsOfHtml(html) {
  const rows = [];
  const trRe = /<tr data-item="([^"]*)" data-plan="([^"]*)">([\s\S]*?)<\/tr>/g;
  let match;
  while ((match = trRe.exec(html))) {
    const cells = [...match[3].matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/g)]
      .map(cellMatch => textOnly(cellMatch[1]));
    rows.push({ item: match[1], planId: match[2], cells });
  }
  return rows;
}

/**
 * 页面诚实性：**从渲染结果回读**再与数据逐格对账。
 *
 * 为什么必须逐格：把输入价渲染到输出价那一列，页面上看起来完全正常
 * （两列都是价格，都带币种），而读者会据此得出反向的结论。
 * 数据层挡不住这种错 —— 它只存在于渲染层。
 */
function assertPageHonesty(html, plans, opts = {}) {
  const problems = [];
  const providerTable = opts.providerTable || null;
  const text = textOnly(html);

  if (!text.includes(API_PLANS_HEADING)) problems.push(`缺少标题「${API_PLANS_HEADING}」`);
  for (const word of FORBIDDEN_CLAIM_WORDS) {
    if (text.includes(word)) problems.push(`页面出现结论性词汇「${word}」—— 这一页只列事实`);
  }
  if (!html.includes('口径与说明')) problems.push('缺少口径与说明段落');

  // 表头列数
  const headHtml = (html.match(/<thead>[\s\S]*?<\/thead>/) || [''])[0];
  const thCount = (headHtml.match(/<th[\s>]/g) || []).length;
  if (thCount !== API_PLANS_COLUMNS.length) {
    problems.push(`表头 ${thCount} 列 ≠ 列模型 ${API_PLANS_COLUMNS.length} 列`);
  }

  const expected = apiRowsOf(plans, { providerTable });
  const actual = rowsOfHtml(html);
  const flat = value => String(value === null || value === undefined ? '' : value).replace(/\s+/g, '');
  if (actual.length !== expected.length) {
    problems.push(`渲染行数 ${actual.length} ≠ 数据行数 ${expected.length}`);
  } else {
    expected.forEach((row, index) => {
      const cells = actual[index].cells;
      const where = `第 ${index + 1} 行（${row.provider} ${row.model}）`;
      const expectCell = (position, value, label) => {
        if (flat(cells[position]) !== flat(value)) {
          problems.push(`${where} 的「${label}」单元格是「${cells[position]}」，按数据应为「${value}」`);
        }
      };
      expectCell(0, `${row.provider}${row.regionLabel}`, '平台');
      expectCell(1, `${row.model}${row.planName} · ${row.channelLabel}`, '模型');
      expectCell(2, row.variantLabel, '变体');
      expectCell(3, row.unitText, '计费单位');
      expectCell(4, priceText(row.rates.input, row.currency), '输入价');
      expectCell(5, priceText(row.rates.output, row.currency), '输出价');
      expectCell(6, priceText(row.rates.cachedInput, row.currency), '缓存命中输入');
      expectCell(9, row.lastSeen, '最近更新');

      // 第 8 列（免费额度 / credits）的**性质**对账（P1-11 / `F-r2-api-005`）：
      // 期望值从**数据**重算（只借唯一词表取词，不调用 `freeTierShortText`），
      // 所以「渲染层把一次性赠送写成长期能力」与「长期能力丢了标注」两个方向都会红。
      const free = row.plan && row.plan.freeTier;
      if (free) {
        const standingWord = apiSchema.FREE_TIER_STABILITY_LABEL.standing;
        const label = apiSchema.FREE_TIER_STABILITY_LABEL[free.stability];
        // credits 是**另一段**（`；credits：…`）：免费额度的单位词只在第一段里对账，
        // 否则「有 credits 的记录」会被误判成"把 tokens 标成了 credits"。
        const freePart = cells[8].split('；credits：')[0];
        if (free.type === 'none') {
          if (cells[8].includes(standingWord) || cells[8].includes('长期免费')) {
            problems.push(`${where}: 「官方明说没有免费额度」的单元格里出现长期能力字样：「${cells[8]}」`);
          }
        } else if (!label) {
          problems.push(`${where}: 免费额度没有 stability —— 页面无法说明它是不是长期能力（数据层判据已要求必填）`);
        } else if (!cells[8].includes(label)) {
          problems.push(`${where}: 免费额度的单元格「${cells[8]}」没有印出性质「${label}」（数据里就是这么标的）`);
        } else if (free.stability !== 'standing'
          && (cells[8].includes(standingWord) || cells[8].includes('长期免费'))) {
          problems.push(`${where}: stability=${free.stability}（${label}）的免费额度被渲染成长期能力：「${cells[8]}」`
            + ' —— 一次性 / 限时赠送绝不是长期免费能力');
        } else if (free.stability === 'standing' && cells[8].includes('非长期能力')) {
          problems.push(`${where}: stability=standing 的免费额度被标成了「非长期能力」：「${cells[8]}」`);
        }
        // 数额单位词必须与 `freeTier.type` 一致（P1-10 / F-r2-api-004：tokens 额度被标成 credits）：
        // 唯一词表是 schema.FREE_TIER_UNIT_LABEL，期望值从**数据**取，不调用 freeTierShortText。
        const unitWord = apiSchema.FREE_TIER_UNIT_LABEL[free.type];
        if (unitWord && free.type !== 'none') {
          if (!freePart.includes(unitWord)) {
            problems.push(`${where}: 免费额度是 type=${free.type}，格子里却没有单位词「${unitWord}」：「${freePart}」`);
          }
          for (const [otherType, otherWord] of Object.entries(apiSchema.FREE_TIER_UNIT_LABEL)) {
            if (otherType === free.type || otherWord === unitWord) continue;
            if (freePart.includes(otherWord)) {
              problems.push(`${where}: 免费额度是 type=${free.type}（单位词「${unitWord}」），`
                + `格子里却出现了「${otherWord}」—— 类型词必须与 freeTier.type 同源`);
            }
          }
        }
      }

      // 第 7 列（其他计费维度）逐项对账：数字 + 单位 + 标签三件都在，且**单位来自数据的 unit 字段**。
      // 期望值按数据的 TOKEN_RATE_KEYS / mediaRates 独立拼装（不调用 otherRatesTextOf）。
      const expectedOther = [
        ...apiSchema.TOKEN_RATE_KEYS
          .filter(key => key !== 'input' && key !== 'output' && key !== 'cachedInput'
            && row.rates && row.rates[key] !== null && row.rates[key] !== undefined)
          .map(key => `${apiSchema.TOKEN_RATE_LABEL[key]} ${priceText(row.rates[key], row.currency)}`),
        ...(row.mediaRates || []).map(media => `${apiSchema.MEDIA_RATE_LABEL[media.kind] || media.kind} `
          + `${priceText(media.price, row.currency)} / ${apiSchema.MEDIA_RATE_UNIT_LABEL[media.unit] || media.unit}`)
      ];
      for (const text of expectedOther) {
        if (!cells[7].includes(text)) {
          problems.push(`${where}: 「其他计费维度」格「${cells[7]}」缺少按数据应为「${text}」的那一项`
            + '（单位必须原样来自数据的 unit 字段，不能在渲染层重写）');
        }
      }
      // 单位计数对账：错位（把 per_image 印成 per_second）会让假单位多出来、真单位少下去，两种都红
      const mediaUnitCounts = new Map();
      for (const media of row.mediaRates || []) mediaUnitCounts.set(media.unit, (mediaUnitCounts.get(media.unit) || 0) + 1);
      for (const [unit, expectedCount] of mediaUnitCounts) {
        const unitLabel = apiSchema.MEDIA_RATE_UNIT_LABEL[unit] || unit;
        const actual = cells[7].split(unitLabel).length - 1;
        if (actual !== expectedCount) {
          problems.push(`${where}: 「其他计费维度」格里「${unitLabel}」出现 ${actual} 次，数据里是 ${expectedCount} 条`
            + ' —— 单位与数据不一致（错位 / 串位）');
        }
      }
      for (const unit of apiSchema.MEDIA_RATE_UNITS) {
        if (mediaUnitCounts.has(unit)) continue;
        const unitLabel = apiSchema.MEDIA_RATE_UNIT_LABEL[unit];
        if (unitLabel && cells[7].includes(unitLabel)) {
          problems.push(`${where}: 「其他计费维度」格出现了数据里没有的单位「${unitLabel}」`);
        }
      }
    });
  }

  // 单位列必须逐行可见（这是"0.14 却不知道每千还是每百万"的防线）
  const unitCells = (html.match(/<td class="punit">([\s\S]*?)<\/td>/g) || []);
  if (unitCells.length !== expected.length) {
    problems.push(`带单位声明的行 ${unitCells.length} ≠ 数据行数 ${expected.length}`);
  }

  // credits 绝不能被折算成 token：页面上不许出现"credits ... 可购 X token"这类句子
  if (/credits[^<]{0,40}(可购|可购买|约\s*[\d.]+\s*(万|亿)?\s*(token|Token|tokens))/.test(text)) {
    problems.push('页面把 credits 折算成了 token 数量 —— credits 是钱，不是额度');
  }

  // 变化块里不许出现**空的 from/to 占位**（T07 非空 E2E 抓到的生产可见缺陷）：
  // 生命周期事件（created / restored）没有 from/to，套进「新增：{to}」模板就成了「新增：—」
  // （生产 6 处、合成非空态 9 处）。合法形态里 `新增：X` / `移除：X` 的 X 一定是真值，
  // 而「— → —」只可能来自两侧都缺席 —— 三种形态都是占位，一律判红。
  const placeholders = [
    ...(text.match(/(新增|移除)[:：]\s*—(?![0-9])/g) || []),
    ...(text.match(/—\s*→|→\s*—/g) || [])
  ];
  if (placeholders.length) {
    problems.push(`变化块里出现了空的 from/to 占位 ${placeholders.length} 处（「${placeholders[0]}」）`
      + ' —— 没有 from/to 的事件（首次收录 / 重新出现 / 不再收录）必须按真实语义说');
  }

  // 官方来源链接：每行都要有，且指向数据里的那个地址
  const links = (html.match(/官方定价页 ↗/g) || []).length;
  if (links !== expected.length) problems.push(`官方来源链接 ${links} 个 ≠ 数据行数 ${expected.length}`);

  // 锚点：每条记录一个（订阅源与深链的落点）
  for (const plan of plans) {
    if (!html.includes(`id="plan-${plan.id}"`)) problems.push(`缺少记录锚点 #plan-${plan.id}`);
  }

  if (!html.includes('免费额度与 credits（厂商级事实）')) problems.push('缺少免费额度与 credits 明细节');
  if (!html.includes('官方原文（每条价格的出处）')) problems.push('缺少官方原文节');
  if (!html.includes('id="api-changes"')) problems.push('缺少「最近变化」块（无变化时也要有明确空态）');
  if (!html.includes('plans/coding/')) problems.push('缺少指向 Coding 套餐对比页的交叉链接');

  return problems;
}

/** 数据层诚实性：记录名、备注、自由文本里不许出现结论性词汇（构建期查一遍） */
function assertDataHonesty(plans) {
  const problems = [];
  for (const plan of plans) {
    const texts = [plan.planName, plan.pricing && plan.pricing.unitNote];
    for (const entry of plan.models || []) {
      texts.push(entry.name, entry.note);
      for (const media of entry.mediaRates || []) texts.push(media.note);
    }
    if (plan.freeTier) texts.push(plan.freeTier.description);
    for (const credit of plan.credits || []) texts.push(credit.description, credit.usageNote);
    for (const text of texts) {
      if (!text) continue;
      for (const word of FORBIDDEN_CLAIM_WORDS) {
        if (String(text).includes(word)) {
          problems.push(`${plan.provider}/${plan.planName}: 文本里出现结论性词汇「${word}」（${String(text).slice(0, 40)}）`);
        }
      }
    }
  }
  return problems;
}

/** 历史诚实性：日志里的字段名与事件类型必须都能被说明（没有"无名变化"） */
function assertHistoryHonesty(plans, store) {
  const problems = [];
  const wording = require('./api-plan-history').API_PLAN_HISTORY_WORDING;
  const types = require('./api-plan-history').API_PLAN_EVENT_TYPES;
  for (const event of (store && store.events) || []) {
    if (!types.includes(event.type)) problems.push(`日志里有未登记的事件类型 ${event.type}`);
    if (event.field && !wording.API_PLAN_HISTORY_FIELD_LABELS[event.field]) {
      problems.push(`日志里的字段 ${event.field} 没有对应的中文标签（页面上会显示成机器名）`);
    }
    for (const word of FORBIDDEN_CLAIM_WORDS) {
      if (String(event.type).includes(word)) problems.push(`事件类型里出现结论性词汇「${word}」`);
    }
    // 每一条事件都必须能被说成**一句话**：空文案 = /changes/ 上的空白「变了什么」格；
    // 空 from/to 占位 = 「首次收录 · 新增：—」那句假话（T07 非空 E2E 抓到的形态）。
    const text = apiPlanChangeTextOf(event);
    if (!text) {
      problems.push(`事件 ${event.type}（${event.planId || event.id || '-'}）渲染成空文案 —— 「变了什么」没有"空"这个形态`);
    }
    if (/(新增|移除)[:：]\s*—(?![0-9])/.test(text) || /—\s*→|→\s*—/.test(text)) {
      problems.push(`事件 ${event.type}（${event.planId || event.id || '-'}）渲染成空 from/to 占位「${text}」`);
    }
  }
  return problems;
}

module.exports = {
  API_PLANS_ROUTE,
  API_PLANS_HEADING,
  API_PLANS_DESCRIPTION,
  API_PLANS_COLUMNS,
  API_PLANS_NOTES,
  FORBIDDEN_CLAIM_WORDS,
  UNKNOWN_TEXT,
  UNKNOWN_NUM,
  UNKNOWN_TRI,
  apiRowOf,
  apiRowsOf,
  apiRowTextsOf,
  apiPlansPageBody,
  apiChangesBlockHtml,
  apiPlanChangeTextOf,
  apiPlanChangeItemHtml,
  apiPlanChangesPageBlockHtml,
  fieldsDiffText,
  dealLinksBlockHtml,
  apiPlansJsonLd,
  priceText,
  unitTextOf,
  freeTierShortText,
  otherRatesTextOf,
  providerNameOf,
  modelsTextOf,
  escapeHtml,
  textOnly,
  rowsOfHtml,
  assertPageHonesty,
  assertDataHonesty,
  assertHistoryHonesty
};
