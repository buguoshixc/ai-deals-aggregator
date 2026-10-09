/**
 * `/plans/` 统一资料入口（v3.0 Stage B）—— **正文渲染 + 诚实性断言**。
 *
 * ## 这一页是什么、不是什么
 *
 * 它是「AI 套餐与 API 计费资料库」的入口：告诉读者**这里有哪些资料、各自收录什么、
 * 最近发生了什么、有哪些仍然有效的关联优惠**，并把读者送到真正的大表页
 * （`/plans/coding/` 与 `/plans/api/`）。
 *
 * 它**不是**第三张重复大表：
 *
 *   · 不复制套餐表与 API 表的行（那两张表在各自页面上，这里只给计数与入口）；
 *   · 不写第二套变化判据（变化块直接复用 `plan-changes.js` 与
 *     `api-plans-page.apiChangesBlockHtml()` —— 同一份事件、同一套措辞）；
 *   · 不写第二套优惠关联判据（当前相关优惠直接来自 `deal-plan-links.js` 的
 *     `planDealsView()`，已结束的关联**结构上**拿不到"当前"标记）。
 *
 * ## 三条硬承诺（都有断言，见 `assertPageHonesty()`）
 *
 * 1. **只列事实**：没有评分、没有排名、没有"最值得买"、没有"性价比" ——
 *    与套餐页 / API 页**共用同一份** `FORBIDDEN_CLAIM_WORDS`。
 * 2. **计数与数据逐条对账**：页面上每一个数字（套餐数 / 平台数 / 记录数 / 模型计价条目数 /
 *    当前关联优惠数）都必须能由输入数据重算出来。
 * 3. **空是事实，不是故障**：没有变化就写「当前没有观测到…」；没有关联优惠就写
 *    「暂无当前优惠」；日志缺失就写「没有拿到日志」—— 三种情况三句不同的话。
 *
 * ## 纯函数
 *
 * 不读盘、不联网、不看时钟、不写盘：输入是各 store 的记录与日志（调用方读好传进来），
 * 输出是 HTML 字符串。因此它能被离线自测直接调用（`planshub-selftest`），
 * 也能被构建期在内存里渲染后立刻交给 `assertPageHonesty()`。
 */

'use strict';

/**
 * 说明登记（notes-manifest-residual-v1）：`.snote` 构造点不再直接写进页面 —— 每个构造点在
 * 产出那一段 HTML 的**同一次调用**里登记（`ctx.note` 由 `build-local.js` 按 route 注入）。
 * 与 `lib/vendor-page.js` 同形：参数可以是 ctx 对象（含 `.note`），也可以是 note 函数本身；
 * 都没有时是恒等函数（断言 / selftest 路径不产出页面）。
 */
const NOTES_DECLARED_BY = 'lib/plans-hub-page.js';
const noteIn = source => {
  if (typeof source === 'function') return source;
  if (source && typeof source.note === 'function') return source.note;
  return (decl, html) => html;
};


const plansPage = require('./plans-page');
const apiPlansPage = require('./api-plans-page');
const planChanges = require('./plan-changes');
const dealPlanLinks = require('./deal-plan-links');
const pageKinds = require('./page-kinds');
// 指向 `/changes/` 的那一枚入口锚：文案**只有一个出处** —— `changes.js` 的措辞表。
// 这一页以前自己写了一份字面量（P2 残留 e3 登记的那一处），于是「同一件事只有一个词」
// 只对一半的页面成立 —— 改措辞表不会改到这一页。现在在**渲染时**从表里取词
// （`p2-honesty-single-source-v1`），并由 `seo-selftest §七` 的变异牙钉住：
// 把表里的词换掉 ⇒ 这一页渲染出来的锚文本跟着变；手写字面量 ⇒ 判据变红。
const changes = require('./changes');

const PLANS_HUB_ROUTE = 'plans/';
/** 回到站根的相对前缀：由路由深度推导，不写死（这一页是一层） */
const PLANS_HUB_HOME_HREF = '../'.repeat(PLANS_HUB_ROUTE.split('/').filter(Boolean).length);
const PLANS_HUB_HEADING = 'AI 套餐与 API 计费资料库';
// [T5-plans-hub-68-description-tail]
// T5 删除（census B · 重复）：删导语尾句「价格与条款最终以厂商官方页面为准。」—— 它与共享页脚
// （每页都有「优惠信息来自各厂商官方页面与公开折扣页，最终以官方页面为准。」）同义，属 B 类
// 「同一句话的第二个容器」。**只删尾句**：前半句「本站只做收录与整理，不排名、不评分、不替读者
// 判断值不值」不在共享页脚里（那是详情页 `.dpane-src` 的另一份说法，不是同一页的重复），删了
// 读者就少一条「这一页不做什么」的口径 —— 删后整句仍是完整句子（「…不替读者判断值不值。」）。
// ⚠️ 这一条是上一轮 v1 普查 §3.4 登记的「仅登记、本轮不动」的那一行（当时建议「单开一轮把
// 页脚已说的免责从所有导语里拿掉」）—— 本轮的 scope 2 就是那一轮。
// ⚠️ 这个常量同时是这一页的 `<meta name="description">` 与 JSON-LD 的 description
// （`build-local.js:2067` · `plans-hub-page.js:374`）⇒ 改动会同时改**可见导语 + 元数据**；
// 已实测：全仓没有任何断言引用这句字面（`checkWordingContract` 只管 `audience.js` 的措辞表）。
// 同时它**不是**上一轮 census 说的那条「去分号的 `最终以厂商官方页面为准。`」在 `/plans/` 的合法存在
// —— 那一处是 `plan-history.js` 的「不表示厂商已经下架或套餐已经停售。」（C 类口径，本轮保留）；
// 本条的字面是 `；价格与条款最终…`，与它不同一个字符串。
// [T6-plans-hub-104-notes-clause]
// 队长裁定（t3 登记 → 本处执行）：`PLANS_HUB_NOTES` 第 4 条**句首分句**「价格、额度与条款最终以
// 厂商官方页面为准；」与共享页脚同义，属 B 类「同一句话的第二个容器」，**与上面导语尾句是同一个
// 判断、同一轮该一起做**；t3 因它不在枚举列表里而只登记未动。**只删分句、不删条目**：
// 「「最近更新」是…不是官方承诺不变的日期。」本身是 C 类（`lastSeen` 的语义完全靠它界定，
// 删了会变成「没说的东西」），且删后整句仍是完整句子。t3 备的切点（删到「…不是官方承诺
// 不变的日期。」）等于把 C 类那半句也一起删掉，故未采纳。
// ⚠️ 这条**不是**构建期「题注形状牙」的承重面（那条牙只查 `<caption>`），也不是页族
// `main-snote` 下限的承重面（它在折叠条目里，不是 `.snote`）。
const PLANS_HUB_DESCRIPTION = '把各平台长期在售的订阅型 Coding 套餐、按量计费的 API 单价、'
  + '由官方出处确认的优惠关联，以及这些资料的变化记录，整理成一个可查、可追溯的入口。'
  + '本站只做收录与整理，不排名、不评分、不替读者判断值不值。';

const UNKNOWN_TEXT = plansPage.UNKNOWN_TEXT;
const UNKNOWN_NUM = plansPage.UNKNOWN_NUM;
const FORBIDDEN_CLAIM_WORDS = plansPage.FORBIDDEN_CLAIM_WORDS;

const escapeHtml = plansPage.escapeHtml;

/** 这一页的子页（ItemList 与 `data-child` 对账的唯一出处） */
const PLANS_HUB_CHILDREN = [
  { route: `${PLANS_HUB_ROUTE}coding/`, name: 'Coding 套餐对比' },
  { route: `${PLANS_HUB_ROUTE}api/`, name: 'API / Token 计费对比' }
];

/** 口径与说明：这一页的身份、收录边界与三条"不做" */
const PLANS_HUB_NOTES = [
  '这一页是**资料入口**：Coding 套餐的完整表格在 [Coding 套餐对比](plans/coding/)，'
  + 'API 单价表在 [API / Token 计费对比](plans/api/)。本页只给计数、口径与变化，不复制那两张表。',
  '三份资料是**互相独立**的：订阅套餐按月/年收费，API 按量计费，优惠是厂商的促销或赠送。'
  + '它们之间**不互相换算**（我们不把 API 单价折成月费，也不把 credits 折成 token）。',
  '「相关优惠」只来自**显式确认**的关联（`deal-plan-links.json`，每条都带官方出处），'
  + '并且只在优惠尚未结束、记录仍在售时显示；相似度匹配只产出候选报告，不会自动写进这一页。',
  '「最近更新」是我们最后一次人工对照官方页的日期，不是官方承诺不变的日期。'
];

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

/** 一组记录里最近一次核对日（没有就如实写「未标注」，不写今天） */
function latestSeenOf(records) {
  const dates = (records || []).map(record => record && record.lastSeen).filter(Boolean).sort();
  return dates.length ? String(dates[dates.length - 1]) : null;
}

function countProviders(records) {
  return new Set((records || []).map(record => record && record.provider).filter(Boolean)).size;
}

function countModelItems(records) {
  return (records || []).reduce((sum, record) => sum + (Array.isArray(record && record.models) ? record.models.length : 0), 0);
}

/* ------------------------------------------------------------------ */
/* 视图（先算数据、再拼 HTML）                                          */
/* ------------------------------------------------------------------ */

/**
 * 这一页需要的全部派生视图。
 *
 * 单独抽出来是为了让 `assertPageHonesty()` 能从**同一份**视图重算页面上的每个数字 ——
 * 断言与渲染分家是这一页最容易犯的错（页面上写 9、数据里 8，而两边都看不出问题）。
 *
 * @param {object} ctx 见文件头与 `renderPlansHubPage()`
 */
function plansHubView(ctx = {}) {
  const plans = Array.isArray(ctx.plans) ? ctx.plans : [];
  const apiPlans = Array.isArray(ctx.apiPlans) ? ctx.apiPlans : [];
  const providerTable = ctx.providerTable || null;
  const asOf = ctx.asOf || null;

  const coding = {
    plans: plans.length,
    providers: countProviders(plans),
    updatedAt: latestSeenOf(plans)
  };
  const api = {
    records: apiPlans.length,
    providers: countProviders(apiPlans),
    modelItems: countModelItems(apiPlans),
    updatedAt: latestSeenOf(apiPlans)
  };

  // 变化：Coding 走 `plan-changes` 的雷达（唯一判据），API 走 API 页那一块（同一份事件与措辞）。
  const codingRadar = planChanges.buildPlanRadar({
    plans,
    store: ctx.planHistoryStore || null,
    asOf,
    availability: ctx.planHistoryStore ? 'ok' : 'unavailable'
  });
  const codingChanges = codingRadar.availability === 'ok'
    ? {
      availability: 'ok',
      created: codingRadar.totals.created,
      changed: codingRadar.totals.changed,
      ended: codingRadar.totals.ended,
      restored: codingRadar.totals.restored
    }
    : { availability: 'unavailable', created: 0, changed: 0, ended: 0, restored: 0 };

  const apiEvents = (ctx.apiPlanHistoryStore && Array.isArray(ctx.apiPlanHistoryStore.events))
    ? ctx.apiPlanHistoryStore.events.filter(event => event && event.type !== 'updated')
    : [];
  const apiChanges = {
    availability: ctx.apiPlanHistoryStore ? 'ok' : 'unavailable',
    total: apiEvents.length
  };

  // 当前相关优惠：唯一判据在 `deal-plan-links.js`。这里只做**去重与排序**，
  // 不重新判断"哪条还算当前" —— `row.current` 已经由那支的 `isCurrentRelation()` 定好。
  const view = ctx.dealLinks
    ? dealPlanLinks.planDealsView(ctx.dealLinks, {
      deals: ctx.deals || [],
      plans,
      apiPlans,
      asOf,
      providerTable,
      strict: true
    })
    : null;
  const currentOffers = [];
  if (view) {
    for (const row of view.rows) {
      for (const item of row.current) {
        currentOffers.push({
          dealId: item.dealId,
          planId: row.planId,
          planKind: row.planKind || 'coding',
          planTitle: row.title || row.planName || row.planId,
          dealTitle: item.dealTitle || null,
          promoLine: item.promoLine || '',
          eligible: Boolean(item.eligible),
          deadlineText: item.deadlineText || null,
          savingsText: item.savingsText || null
        });
      }
    }
  }
  currentOffers.sort((a, b) => {
    if (a.dealId !== b.dealId) return a.dealId < b.dealId ? -1 : 1;
    return a.planId < b.planId ? -1 : a.planId > b.planId ? 1 : 0;
  });

  return { coding, api, codingChanges, apiChanges, currentOffers, asOf, providerTable, codingRadar };
}

/* ------------------------------------------------------------------ */
/* 正文 HTML                                                           */
/* ------------------------------------------------------------------ */

function statHtml(label, value, hint) {
  return `          <li><span class="phubl">${escapeHtml(label)}</span>`
    + `<b class="phubv" data-summary-label="${escapeHtml(label)}" data-summary-value="${escapeHtml(String(value))}">${escapeHtml(String(value))}</b>`
    + `${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</li>`;
}

function codingSectionHtml(view, prefix, note = null) {
  const c = view.coding;
  const ch = view.codingChanges;
  const changeLine = ch.availability === 'ok'
    ? `最近 7 天变化 ${ch.changed} 条 · 今日新增 ${ch.created} 条 · 不再收录 ${ch.ended} 条 · 重新出现 ${ch.restored} 条`
    : '本次构建没有拿到套餐变更日志 —— 这不表示「没有变化」。';
  return `      <section class="phubsec" id="plans-hub-coding" data-child="${PLANS_HUB_CHILDREN[0].route}">
        <h2 class="ph2">Coding 套餐</h2>
        ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">这里收录 <b>订阅型 / Coding 套餐</b>：月费、活动价、可用模型、额度、限制与官方来源。
          这些是长期在售的套餐，与按量计费是两件事。</p>`)}
        <ul class="phubstats">
${statHtml('套餐数', c.plans, '条')}
${statHtml('平台数', c.providers, '个提供方')}
${statHtml('数据最近核对', c.updatedAt || UNKNOWN_TEXT, '')}
        </ul>
        ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(changeLine)}</p>`)}
        <p><a class="phubgo" href="${escapeHtml(`${prefix}plans/coding/`)}">进入 Coding 套餐对比 →</a></p>
      </section>`;
}

function apiSectionHtml(view, prefix, note = null) {
  const a = view.api;
  const ch = view.apiChanges;
  const changeLine = ch.availability === 'ok'
    ? `API 计费变化日志共 ${ch.total} 条事件`
    : '本次构建没有拿到 API 计费变化日志 —— 这不表示「没有变化」。';
  return `      <section class="phubsec" id="plans-hub-api" data-child="${PLANS_HUB_CHILDREN[1].route}">
        <h2 class="ph2">API 计费</h2>
        ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">这里收录 <b>按量计费（API / Token）的官方单价</b>：输入价、输出价、缓存、Batch、
          Off-Peak、免费额度、credits 与其他官方计费维度。单位逐行写出，不跨单位换算。</p>`)}
        <ul class="phubstats">
${statHtml('计费记录', a.records, '条')}
${statHtml('模型计价条目', a.modelItems, '条')}
${statHtml('平台数', a.providers, '个提供方')}
${statHtml('数据最近核对', a.updatedAt || UNKNOWN_TEXT, '')}
        </ul>
        ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(changeLine)}</p>`)}
        <p><a class="phubgo" href="${escapeHtml(`${prefix}plans/api/`)}">进入 API / Token 计费对比 →</a></p>
      </section>`;
}

// [T5-plans-hub-267-268-changes]
// T5 删除（census A · 两处半句，同一条 .snote 内）：删「变化 <b>直接来自本站的变更日志</b>（优惠、套餐、API 计费三套各自独立），」与「这里只搬运，不另立一套判据；」—— 前者是**数据来源自证**，后者是**实现自证**。保留「「不再收录」表示人工来源层不再列出它，不表示厂商已经下架。」（C 类三态解释）⇒ **元素保留**（这一页 main-snote 仍 ≥ 1）。门禁：`/plans/` 是本轮 M1/M6/M8/M10/M12 的壳（要求 `<main>` 内 `.snote` ≥ 1）—— 本条 kind=half、元素不删 ⇒ 12 条读数不变（收口时复跑壳守卫确认）。
function changesSectionHtml(view, prefix, note = null) {
  // 这一页没有套餐表格行，因此变化块里「谁变了」的链接必须跨页落到 `/plans/coding/#plan-<id>` ——
  // 复用 `planChangesBlockHtml`（同一份事件、同一句话）但换掉链接落点，
  // 否则页面上会出现点不动的 `#plan-<id>` 死锚点（真浏览器验收会红）。
  const planHref = item => (item.planId ? `${prefix}plans/coding/#plan-${item.planId}` : null);
  const coding = plansPage.planChangesBlockHtml(view.codingRadar, {
    prefix, providerTable: view.providerTable, planHref, note
  });
  const api = apiPlansPage.apiChangesBlockHtml(view.apiPlanHistoryStore || null, view.apiPlans || [], {}, note);
  return `      <section class="phubsec" id="plans-hub-changes">
        <h2 class="ph2">最近套餐与价格变化</h2>
        ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">「不再收录」表示人工来源层不再列出它，不表示厂商已经下架。</p>`)}
${coding}
${api}
        ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote"><a href="${escapeHtml(`${prefix}changes/`)}">${escapeHtml(changes.CHANGES_WORDING.CHANGES_LABELS.all)} →</a> ·
          <a href="${escapeHtml(`${prefix}feeds/`)}">订阅变化（RSS / JSON Feed） →</a></p>`)}
      </section>`;
}

function currentOffersHtml(view, prefix, note = null) {
  const rows = view.currentOffers;
  const kindLabel = kind => (kind === 'api' ? 'API 计费' : 'Coding 套餐');
  const body = rows.length
    ? rows.map(item => {
      const link = `<a class="phubgo" href="${escapeHtml(`${prefix}deal/${encodeURIComponent(item.dealId)}/`)}">查看优惠 →</a>`;
      const title = item.dealTitle || item.dealId;
      const promo = item.promoLine ? `<span class="phubpromo">${escapeHtml(item.promoLine)}</span>` : '';
      const save = item.savingsText ? `<span class="phubsave">${escapeHtml(item.savingsText)}</span>` : '';
      const eligible = item.eligible ? `<span class="phubelig">（限符合条件者）</span>` : '';
      const deadline = item.deadlineText ? `<span class="phubdeadline">· ${escapeHtml(item.deadlineText)}</span>` : '';
      return `          <li class="phubdeal" data-item="${escapeHtml(item.dealId)}">`
        + `<span class="phubwho">${escapeHtml(item.planTitle)}</span>`
        + `<span class="phubkind">${escapeHtml(kindLabel(item.planKind))}</span>`
        + `<span class="phubtitle">${escapeHtml(title)}</span>${promo}${save}${eligible}${deadline}${link}</li>`;
    }).join('\n')
    : `          <li class="phubnone">暂无当前优惠 —— 关系只来自显式确认的关联，没有确认过的就不显示。</li>`;
  return `      <section class="phubsec" id="plans-hub-deals">
        <h2 class="ph2">当前相关优惠</h2>
        ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">只列 <b>尚未结束</b> 的关联：优惠与它关联的套餐记录都必须仍然是当前的。
          已结束的关联不会出现在这里（它们仍留在各自套餐的「历史优惠」里）。</p>`)}
        <ul class="phubdeals">
${body}
        </ul>
        ${noteIn(note)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">共 ${rows.length} 条当前关联优惠。</p>`)}
      </section>`;
}

/**
 * `/plans/` 正文（纯函数）。
 *
 * @param {object} ctx
 *   `plans`               `plans.json` 的记录（规范序）
 *   `apiPlans`            `api-plans.json` 的记录
 *   `providerTable`       `providers.json` 的归一表（显示名用）
 *   `planHistoryStore`    `plan-history.json`（无 → 变化块如实说「没有拿到日志」）
 *   `apiPlanHistoryStore` `api-plan-history.json`
 *   `dealLinks`           `deal-plan-links.json`（无 → 不渲染这一块）
 *   `deals`               优惠记录（判关联是否仍然当前）
 *   `asOf`                数据基准日（**不是构建时刻**）
 *   `prefix`              回到站根的相对前缀（缺省由路由深度推导）
 */
function renderPlansHubPage(ctx = {}) {
  const prefix = ctx.prefix === undefined ? PLANS_HUB_HOME_HREF : ctx.prefix;
  const view = plansHubView(ctx);
  const notes = PLANS_HUB_NOTES.map(text => `        <li>${markdownish(text, prefix)}</li>`).join('\n');
  const dataDate = view.coding.updatedAt || view.api.updatedAt;
  const meta = `${view.coding.plans} 条 Coding 套餐 · ${view.api.records} 条 API 计费记录`
    + ` · ${view.api.providers} 个平台${dataDate ? ` · 数据日期 ${dataDate}` : ''}`;

  return `      <nav class="crumb" aria-label="面包屑"><a href="${escapeHtml(prefix)}">首页</a> › <span>${escapeHtml(PLANS_HUB_HEADING)}</span></nav>

      <div class="stop">
        <h1>${escapeHtml(PLANS_HUB_HEADING)}</h1>
        <span class="meta">${escapeHtml(meta)}</span>
      </div>

      ${noteIn(ctx)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote">${escapeHtml(PLANS_HUB_DESCRIPTION)}</p>`)}

      <h2 class="ph2" id="plans-hub-notes">这一页收录什么</h2>
      <ul class="plist">
${notes}
      </ul>

${codingSectionHtml(view, prefix, ctx.note)}

${apiSectionHtml(view, prefix, ctx.note)}

${changesSectionHtml({ ...view, apiPlanHistoryStore: ctx.apiPlanHistoryStore || null, apiPlans: ctx.apiPlans || [] }, prefix, ctx.note)}

${ctx.dealLinks === undefined || ctx.dealLinks === null ? '' : `${currentOffersHtml(view, prefix, ctx.note)}\n`}      ${noteIn(ctx)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote" id="plans-hub-data">数据出口：
        <a href="${escapeHtml(`${prefix}deals.json`)}">deals.json</a> ·
        <a href="${escapeHtml(`${prefix}plans.json`)}">plans.json</a> ·
        <a href="${escapeHtml(`${prefix}api-plans.json`)}">api-plans.json</a>${
  // `/docs/data/` 由 Stage G 生成。**只有它真的存在时才链接** —— 站内链接存在性是硬门禁，
  // 先写一条指向未来页面的链接就是造一条死链（t10 接上之后由构建期传 `dataDocs: true`）。
  ctx.dataDocs ? ` ·\n        <a href="${escapeHtml(`${prefix}docs/data/`)}">数据文档</a>` : ''}
      </p>`)}

      ${noteIn(ctx)({ kind: 'page-note', slot: 'main-snote', classes: 'snote', declaredBy: NOTES_DECLARED_BY }, `<p class="snote" id="plans-hub-cross">相关资料库：
        <a href="${escapeHtml(`${prefix}models/`)}">模型资料索引</a> ·
        <a href="${escapeHtml(`${prefix}vendor/`)}">按厂商浏览</a> ·
        <a href="${escapeHtml(`${prefix}archive/`)}">历史档案</a> ·
        <a href="${escapeHtml(`${prefix}changes/`)}">最近变化</a>
      </p>`)}
`;
}

/** JSON-LD：CollectionPage + BreadcrumbList + ItemList（两个子页）。每段一个对象。 */
function plansHubJsonLd(ctx = {}) {
  const siteUrl = ctx.siteUrl || '';
  const pageUrl = `${siteUrl}${PLANS_HUB_ROUTE}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `${PLANS_HUB_HEADING} · AI 优惠聚合器`,
      description: PLANS_HUB_DESCRIPTION,
      url: pageUrl,
      inLanguage: 'zh-CN',
      isPartOf: { '@type': 'WebSite', name: 'AI 优惠聚合器', url: siteUrl }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: PLANS_HUB_HEADING, item: pageUrl }
      ]
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: PLANS_HUB_HEADING,
      numberOfItems: PLANS_HUB_CHILDREN.length,
      itemListElement: PLANS_HUB_CHILDREN.map((child, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: child.name,
        url: `${siteUrl}${child.route}`
      }))
    }
  ];
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
/* 诚实性断言                                                          */
/* ------------------------------------------------------------------ */

/** 只保留标记：摘掉 script / style / 注释（断言与渲染共用一套读法） */
function markupOnly(html) {
  return plansPage.markupOnly(html);
}

/** 从 HTML 里读 ItemList（断言不信任调用方报的数，只认页面里真的写了什么）。
 *  ⚠️ 必须在**原文**上找：JSON-LD 就在 `<script type="application/ld+json">` 里，
 *  先摘 `<script>` 会把它自己摘掉（这个仓库吃过同款教训）。 */
function itemListOf(html) {
  const blocks = [...String(html || '').matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const block of blocks) {
    try {
      const data = JSON.parse(block[1]);
      if (data && data['@type'] === 'ItemList') return data;
    } catch (error) { /* 解析失败按「没有 ItemList」处理，下面会报出来 */ }
  }
  return null;
}

/**
 * ItemList 与 `data-child` 的对账（无条件版）。
 *
 * 单独导出是为了让自测能**直接**演练这条牙（污染 ItemList 的声明数 / 成员 / 行数，
 * 断言必须变红），也让构建期在拿到整页（含套壳注入的 JSON-LD）时可以单独调用。
 */
function assertItemListHonesty(html, ctx = {}) {
  const problems = [];
  const text = markupOnly(String(html || ''));
  const list = itemListOf(html);
  const children = [...text.matchAll(/data-child="([^"]*)"/g)].map(match => match[1]);
  if (!list) {
    problems.push('没有 ItemList 结构化数据');
    return problems;
  }
  if (Number(list.numberOfItems) !== (list.itemListElement || []).length) {
    problems.push(`ItemList 声明 ${list.numberOfItems} 项，实际 ${(list.itemListElement || []).length} 项`);
  }
  if ((list.itemListElement || []).length !== children.length) {
    problems.push(`ItemList ${(list.itemListElement || []).length} 项 ≠ 页面 data-child 行 ${children.length} 行`);
  }
  const expected = new Set(PLANS_HUB_CHILDREN.map(child => child.route));
  for (const element of list.itemListElement || []) {
    const rel = String(element.url || '').replace(String(ctx.siteUrl || ''), '');
    if (!expected.has(rel)) problems.push(`ItemList 里的 ${rel} 不是本页的子页`);
  }
  for (const route of children) {
    if (!expected.has(route)) problems.push(`data-child="${route}" 不是本页的子页`);
  }
  return problems;
}

/**
 * 页面级诚实性断言。返回问题列表（空 = 通过）。
 *
 * **从渲染结果回读**再与视图重算的数字逐项对账 —— 页面上写 9、数据里 8 时，
 * 两边各自看都正常，只有对账能发现。
 *
 * @param {string} html 正文（整页或 `<main>` 片段都可以：脚本会被摘掉）
 * @param {object} ctx  与 `renderPlansHubPage()` 相同的输入
 */
function assertPageHonesty(html, ctx = {}) {
  const problems = [];
  const text = markupOnly(String(html || ''));
  const view = plansHubView(ctx);

  if (!/<h1[\s>]/.test(text)) problems.push('缺少 <h1>');
  if (!text.includes(PLANS_HUB_HEADING)) problems.push(`缺少标题「${PLANS_HUB_HEADING}」`);
  if (!text.includes('这一页收录什么')) problems.push('缺少「这一页收录什么」的口径段');

  for (const word of FORBIDDEN_CLAIM_WORDS) {
    if (text.includes(word)) problems.push(`页面出现结论性词汇「${word}」—— 这一页只列事实`);
  }

  // 计数逐项对账
  const expect = [
    ['套餐数', view.coding.plans],
    ['平台数', view.coding.providers],
    ['计费记录', view.api.records],
    ['模型计价条目', view.api.modelItems]
  ];
  for (const [label, value] of expect) {
    const re = new RegExp(`data-summary-label="${label}"[^>]*data-summary-value="${value}"`);
    if (!re.test(text)) problems.push(`摘要行「${label}=${value}」在 HTML 里没有对应的数据标记`);
    if (!text.includes(label)) problems.push(`页面缺少「${label}」这一项`);
  }
  // API 的平台数是同名标签的第二个（套餐平台数与 API 平台数不同），单独查一次
  if (!text.includes(`data-summary-label="平台数" data-summary-value="${view.api.providers}"`)) {
    problems.push(`API 平台数应显示为 ${view.api.providers}`);
  }

  // 两个入口链接必须在页面上（否则读者到不了真正的大表）
  const prefix = ctx.prefix === undefined ? PLANS_HUB_HOME_HREF : ctx.prefix;
  for (const child of PLANS_HUB_CHILDREN) {
    if (!text.includes(`href="${prefix}${child.route}"`)) {
      problems.push(`缺少子页链接（${prefix}${child.route}）`);
    }
    if (!text.includes(child.name)) problems.push(`缺少子页名称「${child.name}」`);
  }

  // ItemList：声明数 == 元素数 == 页面上的 data-child 行数，且成员就是这页的子页。
  // ⚠️ JSON-LD 由套壳注入，因此**只在页面里真的带了 JSON-LD 时**查这一条：
  //    否则对"正文片段"调用会恒红（假红比没有断言更糟）。在场性由 `seo.js` 的
  //    `itemlist-arity` 在构建期与独立门禁两侧各查一遍；这里查的是**内容一致性**。
  if (/<script[^>]+type="application\/ld\+json"/.test(String(html || ''))) {
    problems.push(...assertItemListHonesty(html, ctx));
  }

  // 变化块：三种情况（有变化 / 没有变化 / 没拿到日志）必须分开说，且不许混说
  if (!text.includes('id="plans-hub-changes"')) {
    problems.push('缺少「最近套餐与价格变化」块');
  } else if (view.codingChanges.availability !== 'ok') {
    if (!text.includes('没有拿到套餐变更日志')) problems.push('套餐日志不可用时没有说清「没有拿到日志」');
  } else if (!text.includes(`最近 7 天变化 ${view.codingChanges.changed} 条`)) {
    problems.push(`变化计数与数据不一致（应为「最近 7 天变化 ${view.codingChanges.changed} 条」）`);
  }

  // 当前相关优惠：计数对账 + **已结束的关联一个都不许挂上"查看优惠"**
  if (ctx.dealLinks) {
    if (!text.includes('id="plans-hub-deals"')) {
      problems.push('传入了关系表却没有「当前相关优惠」块');
    } else {
      const lis = (text.match(/<li class="phubdeal" data-item="/g) || []).length;
      if (lis !== view.currentOffers.length) {
        problems.push(`当前相关优惠 ${lis} 条 ≠ 视图 ${view.currentOffers.length} 条`);
      }
      if (!text.includes(`共 ${view.currentOffers.length} 条当前关联优惠。`)) {
        problems.push(`计数行与实际不一致（应为「共 ${view.currentOffers.length} 条当前关联优惠。」）`);
      }
      const currentIds = new Set(view.currentOffers.map(item => item.dealId));
      const linked = [...text.matchAll(/<a class="phubgo" href="[^"]*?deal\/([0-9a-f]{12})\//g)].map(match => match[1]);
      const wrong = [...new Set(linked.filter(id => !currentIds.has(id)))];
      if (wrong.length) {
        problems.push(`把已结束 / 未确认的关联 ${wrong.join('、')} 当成了当前优惠`);
      }
      if (!view.currentOffers.length && !text.includes('暂无当前优惠')) {
        problems.push('没有当前关联优惠时必须写「暂无当前优惠」');
      }
    }
  }

  // 声明表必须覆盖这一页（新增家族漏登记的牙）
  const kind = pageKinds.kindOfRoute(PLANS_HUB_ROUTE);
  if (kind !== 'plans-hub') problems.push(`page-kinds 里 ${PLANS_HUB_ROUTE} 的 kind 应为 plans-hub，实得 ${kind}`);

  return problems;
}

module.exports = {
  PLANS_HUB_ROUTE,
  PLANS_HUB_HOME_HREF,
  PLANS_HUB_HEADING,
  PLANS_HUB_DESCRIPTION,
  PLANS_HUB_NOTES,
  PLANS_HUB_CHILDREN,
  FORBIDDEN_CLAIM_WORDS,
  UNKNOWN_TEXT,
  UNKNOWN_NUM,
  escapeHtml,
  markdownish,
  latestSeenOf,
  countProviders,
  countModelItems,
  plansHubView,
  renderPlansHubPage,
  plansHubJsonLd,
  markupOnly,
  itemListOf,
  assertItemListHonesty,
  assertPageHonesty
};
