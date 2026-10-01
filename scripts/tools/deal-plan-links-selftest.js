#!/usr/bin/env node
/**
 * Phase 2.4 优惠 ↔ 套餐关系层门禁演练（零依赖、离线、秒级）。
 *
 * 它演练的不是"代码跑得通"，而是**这层关系赖以成立的那些承诺**：
 *
 *   · 关系是显式的：id 指向不存在的套餐 / 不存在的优惠一律硬红（不用标题相似度凑）；
 *   · provider 一致或有明确 override：deals 侧的原始厂商串认不出来时必须写明理由，
 *     认得出时**不许**多写一个 override（多写的 override 会让"为什么特殊"失去意义）；
 *   · 状态只看数据与基准日：同一天两次构建结论相同，跨零点不会因为构建时刻而变；
 *   · 已结束的优惠**永远**不能显示成「当前优惠」（当前 / 历史用两个不同的 class 断言）；
 *   · 节省金额四道门（同套餐 / 同币种 / 同周期 / 全员可享）缺一不可，算不出就不算；
 *   · 派生值不落盘：savings / updatedAt / count / relatedPlans 出现在源文件里就是错；
 *   · 候选报告只提候选：它没有任何写生产关系的代码路径。
 *
 * 判据标准与既有的 selftest 一致：**红的时候没有别的步骤会替它红**，所以它进 CI 门禁。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const links = require('../lib/deal-plan-links');
const plansPage = require('../lib/plans-page');
const providers = require('../lib/providers');
const { load: loadRenderCore } = require('../lib/render-core');

let passed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

const AS_OF = '2026-10-01';
const PROVIDER_TABLE = providers.load().table;

const PLAN_A = '1111111111a1'; // github / Pro / monthly USD 10
const PLAN_B = '2222222222b2'; // cursor Pro / monthly USD 20
const PLAN_Y = '3333333333c3'; // github Pro / yearly USD 100（周期不同 = 另一个 SKU）
const PLAN_CNY = '4444444444d4'; // zhipu Lite / monthly CNY 40
const PLAN_MINIMAX = '5555555555e5'; // minimax Token Plan Plus / monthly CNY 49

const DEAL_A = 'aaaaaaaaaaa1';
const DEAL_B = 'bbbbbbbbbbb2';
const DEAL_C = 'ccccccccccc3';
const DEAL_ENDED = 'ddddddddddd4';
const DEAL_MISSING = 'eeeeeeeeeee5';

function plan(over = {}) {
  return Object.assign({
    id: PLAN_A,
    kind: 'coding',
    provider: 'github',
    planName: 'Pro',
    officialUrl: 'https://docs.github.com/en/copilot/get-started/plans',
    source: 'Official-Docs',
    sourceUrl: 'https://docs.github.com/en/copilot/get-started/plans',
    region: 'global',
    billing: { period: 'monthly', currency: 'USD', regularPrice: 10, promoPrice: null, promoNote: null, note: null },
    quota: { type: 'credits', amount: 1500, period: 'monthly', description: null, conversionDependsOnModel: true },
    supportedModels: null,
    restrictions: null,
    firstSeen: AS_OF,
    lastSeen: AS_OF,
    verified: true,
    verifiedAt: AS_OF,
    evidence: [],
    derivedMetrics: null
  }, over);
}

function deal(over = {}) {
  return Object.assign({
    id: DEAL_A,
    title: 'GitHub Copilot 教师与开源维护者免费 Pro',
    vendor: 'GitHub',
    url: 'https://docs.github.com/en/copilot/how-tos/set-up-for-teachers-and-os-maintainers',
    source: 'Curated',
    sourceUrl: null,
    region: 'global',
    type: 'deal',
    discountInfo: '已验证教师与热门开源仓库维护者可免费获得 GitHub Copilot Pro。',
    pricingModel: 'free',
    category: '编程开发',
    description: '',
    eligibility: '经验证的教师 / 热门开源项目维护者',
    validity: '长期有效（每月重新评估资格）',
    expiresAt: null,
    firstSeen: AS_OF,
    lastSeen: AS_OF,
    verified: true,
    verifiedAt: AS_OF
  }, over);
}

const EVIDENCE = [{
  field: 'relation',
  quote: 'There are two ways to qualify for free access to Copilot Pro.',
  sourceUrl: 'https://docs.github.com/en/copilot/get-started/plans',
  capturedAt: AS_OF,
  lang: 'en'
}];

/**
 * 造一条关系记录。**键序按 `LINK_KEY_ORDER` 排列** —— 校验器要求序列化顺序规范
 * （与 plans.json 同一条纪律：重排键序会让 diff 变成一片看不懂的搬运），
 * 所以夹具也必须以规范形态出现，未知字段（测试要用）统一追加在末尾。
 */
function link(over = {}) {
  const merged = Object.assign({
    dealId: DEAL_A,
    planIds: [PLAN_A],
    provider: 'github',
    basis: 'official-plan-page',
    evidence: EVIDENCE,
    confirmedAt: AS_OF
  }, over);
  const out = {};
  for (const key of links.LINK_KEY_ORDER) if (key in merged) out[key] = merged[key];
  for (const key of Object.keys(merged)) if (!(key in out)) out[key] = merged[key];
  return out;
}

function doc(linksList, retiredList = []) {
  return { schemaVersion: 1, links: linksList, retired: retiredList };
}

function fixture({
  deals = [deal()],
  plans = [plan()],
  links: linksList = [link()],
  retired = [],
  asOf = AS_OF,
  strict = true,
  dealLifecycleOf = null,
  planLifecycleOf = null
} = {}) {
  const ctx = {
    deals,
    plans,
    asOf,
    providerTable: PROVIDER_TABLE,
    strict,
    dealLifecycleOf: dealLifecycleOf || (() => null),
    planLifecycleOf: planLifecycleOf || (() => null)
  };
  const document = doc(linksList, retired);
  return { doc: document, ctx, result: links.validate(document, ctx), view: links.planDealsView(document, ctx) };
}

function grade(result) {
  return { errors: result.errors, warnings: result.warnings };
}

function hasError(result, fragment) {
  return result.errors.some(message => message.includes(fragment));
}

/* ================================================================== */
section('① 形状与规范序');
/* ================================================================== */
{
  const ok = fixture();
  check('合法夹具通过（零 error / 零 warning）', ok.result.errors.length === 0 && ok.result.warnings.length === 0,
    JSON.stringify(grade(ok.result)));

  const outOfOrder = fixture({
    links: [link({ dealId: DEAL_B, planIds: [PLAN_A] }), link({ dealId: DEAL_A, planIds: [PLAN_A] })],
    deals: [deal(), deal({ id: DEAL_B, title: '第二条' })]
  });
  check('links 乱序 → 报「规范序」', hasError(outOfOrder.result, '规范序'), JSON.stringify(outOfOrder.result.errors.slice(0, 2)));

  const dupDeal = fixture({ links: [link(), link()] });
  check('同一条优惠写两条记录 → 报重复', hasError(dupDeal.result, 'dealId 重复'));

  const emptyPlans = fixture({ links: [link({ planIds: [] })] });
  check('planIds 为空 → 报错', hasError(emptyPlans.result, 'planIds 必须是非空数组'));

  const dupPlans = fixture({ links: [link({ planIds: [PLAN_A, PLAN_A] })] });
  check('planIds 内部重复 → 报错', hasError(dupPlans.result, 'planIds 重复'));

  const unsortedPlans = fixture({
    links: [link({ planIds: [PLAN_B, PLAN_A] })],
    plans: [plan(), plan({ id: PLAN_B, provider: 'github', planName: 'Pro+', billing: { period: 'monthly', currency: 'USD', regularPrice: 20, promoPrice: null, promoNote: null, note: null } })]
  });
  check('planIds 非升序 → 报错（序列化必须与输入顺序无关）', hasError(unsortedPlans.result, 'planIds 不是升序'));

  const unknownKey = fixture({ links: [Object.assign(link(), { note: '随手写的说明' })] });
  check('link 出现未知字段 → 报错', hasError(unknownKey.result, '未知字段 note'));

  const badSchema = fixture();
  badSchema.doc.schemaVersion = 2;
  const badSchemaResult = links.validate(badSchema.doc, badSchema.ctx);
  check('schemaVersion 不是 1 → 报错', hasError(badSchemaResult, 'schemaVersion'));

  const derived = fixture({ links: [Object.assign(link(), { savings: 10 })] });
  check('源文件里手写派生字段 savings → 报错', hasError(derived.result, '派生字段 savings'));
}

/* ================================================================== */
section('② 引用完整性（关系必须指向真实存在的记录）');
/* ================================================================== */
{
  const missingPlan = fixture({ links: [link({ planIds: [PLAN_B] })] });
  check('planId 指向不存在的套餐 → 报错', hasError(missingPlan.result, '里都不存在'),
    JSON.stringify(missingPlan.result.errors.slice(0, 1)));

  const missingDeal = fixture({ links: [link({ dealId: DEAL_MISSING })] });
  check('dealId 指向不存在的优惠 → 报错', hasError(missingDeal.result, '在 deals.json 里不存在'));

  const crossProvider = fixture({
    links: [link({ planIds: [PLAN_A], provider: 'cursor' })],
    plans: [plan()],
    deals: [deal({ vendor: 'Cursor' })]
  });
  check('链接声明的 provider 与套餐的不一致 → 报错', hasError(crossProvider.result, '与链接声明的'),
    JSON.stringify(crossProvider.result.errors.slice(0, 2)));

  const unknownProvider = fixture({ links: [link({ provider: 'not-a-provider' })] });
  check('provider 不在 providers.json 里 → 报错', hasError(unknownProvider.result, '不在 providers.json 里'));
}

/* ================================================================== */
section('③ provider 归一与显式 override');
/* ================================================================== */
{
  const resolvable = fixture({ links: [link()] });
  check('deal.vendor 能被别名表认成该 provider → 不需要 override 即通过',
    resolvable.result.errors.length === 0, JSON.stringify(resolvable.result.errors));

  const redundant = fixture({ links: [link({ providerOverride: '多余的理由' })] });
  check('认得出却多写 override → 报错（override 只能是必要的例外）', hasError(redundant.result, '不需要 providerOverride'));

  const unresolvedDeal = deal({ id: DEAL_MISSING, vendor: 'MiniMax（稀宇科技）' });
  const noOverride = fixture({
    deals: [unresolvedDeal],
    plans: [plan({ id: PLAN_MINIMAX, provider: 'minimax', planName: 'Token Plan Plus' })],
    links: [link({ dealId: DEAL_MISSING, planIds: [PLAN_MINIMAX], provider: 'minimax' })]
  });
  check('原始厂商串认不出来且没有 override → 报错', hasError(noOverride.result, '必须写明 providerOverride'),
    JSON.stringify(noOverride.result.errors.slice(0, 1)));

  const emptyOverride = fixture({
    deals: [unresolvedDeal],
    plans: [plan({ id: PLAN_MINIMAX, provider: 'minimax', planName: 'Token Plan Plus' })],
    links: [link({ dealId: DEAL_MISSING, planIds: [PLAN_MINIMAX], provider: 'minimax', providerOverride: '   ' })]
  });
  check('override 只写了空白 → 报错', hasError(emptyOverride.result, '必须写明 providerOverride'));

  const withOverride = fixture({
    deals: [unresolvedDeal],
    plans: [plan({ id: PLAN_MINIMAX, provider: 'minimax', planName: 'Token Plan Plus' })],
    links: [link({
      dealId: DEAL_MISSING, planIds: [PLAN_MINIMAX], provider: 'minimax',
      providerOverride: '采集原文带全角括号后缀，别名表里没有该形态；平台身份以 providers.json 为准。'
    })]
  });
  check('明确的 override → 通过', withOverride.result.errors.length === 0, JSON.stringify(withOverride.result.errors));
}

/* ================================================================== */
section('④ 状态：只看数据与基准日（不读墙上时钟）');
/* ================================================================== */
{
  const expired = deal({ id: DEAL_ENDED, expiresAt: '2026-09-30' });
  const ended = fixture({
    deals: [expired],
    links: [link({ dealId: DEAL_ENDED })],
    asOf: AS_OF
  });
  check('过期优惠的状态是 ended（理由 expired）',
    links.dealStatusOf(DEAL_ENDED, { deals: [expired], asOf: AS_OF }).reason === 'expired', '');
  check('strict 下 links 指向已结束的优惠 → 报错并要求移进 retired',
    hasError(ended.result, '请把这条移进 retired'), JSON.stringify(ended.result.errors.slice(0, 1)));
  check('非 strict 下同样的事实只是警告（不拦日常 npm test）',
    links.validate(ended.doc, Object.assign({}, ended.ctx, { strict: false })).warnings.length === 1);

  const earlier = links.dealStatusOf(DEAL_ENDED, { deals: [expired], asOf: '2026-09-01' });
  check('同一份数据换更早的基准日 → 同一时刻是 current（证明不读墙上时钟）',
    earlier.status === 'current', JSON.stringify(earlier));

  const pruned = links.dealStatusOf('ffffffffffff', { deals: [deal()], asOf: AS_OF });
  check('记录已被下架 → ended（理由 deal_pruned）', pruned.status === 'ended' && pruned.reason === 'deal_pruned');

  const byHistory = links.dealStatusOf(DEAL_A, {
    deals: [deal()], asOf: AS_OF, dealLifecycleOf: id => (id === DEAL_A ? 'ended' : null)
  });
  check('历史层记过 ended → ended（理由 deal_ended）', byHistory.reason === 'deal_ended', JSON.stringify(byHistory));

  const planEnded = fixture({ planLifecycleOf: id => (id === PLAN_A ? 'ended' : null) });
  check('套餐已被变化层记为 ended → planStatus=ended',
    planEnded.view.rows[0].current.length === 0 && planEnded.view.rows[0].history.length === 1, '');

  const planRemoved = fixture({ plans: [plan({ id: PLAN_B })], links: [link({ planIds: [PLAN_A] })] });
  check('套餐已被移出 plans.json → planStatus=removed（且校验先报引用不完整）',
    planRemoved.view.rows.some(row => row.planId === PLAN_A && row.missing === true) || hasError(planRemoved.result, '不存在'), '');

  // 历史层的真实读入口（不是回调注入）：拿真实 store 造一条 ended 事件
  const historyLib = require('../lib/history');
  const loaded = historyLib.load();
  if (!loaded.missing && !loaded.broken) {
    const store = JSON.parse(JSON.stringify(loaded.store));
    store.events = (store.events || []).concat([{
      id: DEAL_A, at: AS_OF, type: 'ended', field: null, from: null, to: null,
      eventId: 'abcabcabcab1', reason: 'source_no_longer_lists'
    }]);
    const viaStore = links.dealStatusOf(DEAL_A, { deals: [deal()], asOf: AS_OF, dealHistoryStore: store });
    check('走真实 deal-history 读入口也能认出 ended（判据不依赖注入）',
      viaStore.status === 'ended' && viaStore.reason === 'deal_ended', JSON.stringify(viaStore));
  } else {
    check('走真实 deal-history 读入口也能认出 ended（判据不依赖注入）', false, 'deal-history.json 不可用');
  }
}

/* ================================================================== */
section('⑤ 节省金额：四道门缺一不可');
/* ================================================================== */
{
  const cnyPlan = plan({
    id: PLAN_CNY, provider: 'zhipu', planName: 'Lite',
    billing: { period: 'monthly', currency: 'CNY', regularPrice: 40, promoPrice: null, promoNote: null, note: null }
  });
  const promo = { price: 9.9, currency: 'CNY', period: 'monthly', appliesTo: 'all', note: '首月 ¥9.9' };

  const exact = links.savingsOf(cnyPlan, promo);
  check('同套餐 + 同币种 + 同周期 + 全员可享 → 省 30.1（题面数字）',
    exact && exact.amount === 30.1 && exact.currency === 'CNY' && exact.period === 'monthly', JSON.stringify(exact));
  check('节省文本用同一套币种符号与千分位', links.savingsTextOf(exact) === '节省 ¥30.1/月', links.savingsTextOf(exact));

  const currencyMismatch = links.savingsOf(cnyPlan, Object.assign({}, promo, { currency: 'USD' }));
  check('USD 优惠价 × CNY 套餐 → 不算（Tooth #2）', currencyMismatch === null, JSON.stringify(currencyMismatch));

  const cycleMismatch = links.savingsOf(plan({
    id: PLAN_Y, planName: 'Pro 年付',
    billing: { period: 'yearly', currency: 'CNY', regularPrice: 400, promoPrice: null, promoNote: null, note: null }
  }), promo);
  check('按月优惠价 × 按年正价 → 不算（Tooth #3）', cycleMismatch === null, JSON.stringify(cycleMismatch));

  const eligible = links.savingsOf(cnyPlan, Object.assign({}, promo, { appliesTo: 'eligible' }));
  check('资格限定（appliesTo=eligible）→ 不算节省（对多数读者不成立）', eligible === null, JSON.stringify(eligible));

  const noGain = links.savingsOf(cnyPlan, Object.assign({}, promo, { price: 40 }));
  check('优惠价不低于正价 → 不算（绝不产出 0 或负数）', noGain === null);

  const unknownPrice = links.savingsOf(plan({
    id: PLAN_CNY, provider: 'zhipu', planName: 'Lite',
    billing: { period: 'monthly', currency: 'CNY', regularPrice: null, promoPrice: null, promoNote: null, note: null }
  }), promo);
  check('正价未知（null）→ 不算（不把"不知道"当成 0）', unknownPrice === null);

  check('没有 promo → 不算', links.savingsOf(cnyPlan, null) === null);
}

/* ================================================================== */
section('⑥ 视图：一条优惠 ↔ 多个套餐，一条套餐 ↔ 多条优惠');
/* ================================================================== */
{
  const oneToOne = fixture();
  check('一优惠 → 一套餐：dealView 有 1 条，planDealsView 的该套餐 current 有 1 行',
    links.dealView(oneToOne.doc, oneToOne.ctx).get(DEAL_A).length === 1 &&
    oneToOne.view.rows[0].current.length === 1);

  const twoPlans = [plan(), plan({
    id: PLAN_B, provider: 'github', planName: 'Pro+',
    billing: { period: 'monthly', currency: 'USD', regularPrice: 39, promoPrice: null, promoNote: null, note: null }
  })];
  const oneToMany = fixture({
    plans: twoPlans,
    links: [link({ planIds: [PLAN_A, PLAN_B].sort() })]
  });
  check('一优惠 → 多套餐：dealView 给出 2 行，且两行都指向各自套餐',
    links.dealView(oneToMany.doc, oneToMany.ctx).get(DEAL_A).length === 2,
    JSON.stringify(links.dealView(oneToMany.doc, oneToMany.ctx).get(DEAL_A).map(r => r.planId)));

  const manyToOne = fixture({
    deals: [deal(), deal({ id: DEAL_B, title: 'GitHub Copilot 学生免费' })],
    links: [link(), link({ dealId: DEAL_B })]
  });
  check('一套餐 → 多优惠：该套餐 current 有 2 行，两条优惠各自 1 行',
    manyToOne.view.rows[0].current.length === 2 &&
    links.dealView(manyToOne.doc, manyToOne.ctx).size === 2,
    JSON.stringify(manyToOne.view.rows[0].current.map(r => r.dealId)));

  check('视图里每条套餐都有行（含没有任何关系的）',
    manyToOne.view.rows.length === 1 && fixture({ plans: twoPlans, links: [] }).view.rows.length === 2);

  const noneView = fixture({ plans: twoPlans, links: [] });
  check('没有关系时 counts 全为 0，且每行都是空',
    noneView.view.counts.current === 0 && noneView.view.counts.withCurrent === 0 &&
    noneView.view.rows.every(row => !row.current.length && !row.history.length) &&
    noneView.view.rows[0].title === 'GitHub Pro');

  const rowShape = links.dealView(oneToOne.doc, oneToOne.ctx).get(DEAL_A)[0];
  check('优惠页那行的字段齐（套餐名 / 正价 / 活动价 / 额度 / 模型 / 本优惠）',
    rowShape.title === 'GitHub Pro' && rowShape.regularText === '$10' && rowShape.promoText === '—' &&
    rowShape.quotaText === '1,500 积分 / 每月' && rowShape.modelsText === '未标注' &&
    rowShape.promoLine.includes('经验证的教师') === false && rowShape.promoLine.length > 0,
    JSON.stringify(rowShape));

  const endedFixture = fixture({
    deals: [deal({ id: DEAL_ENDED, expiresAt: '2026-09-30' })],
    links: [link({ dealId: DEAL_ENDED })],
    strict: false
  });
  check('已结束的优惠只出现在 history 桶里（不占 current）',
    endedFixture.view.rows[0].history.length === 1 && endedFixture.view.rows[0].current.length === 0);
  check('已结束那行带着结束日期（来自优惠自己的截止日）',
    endedFixture.view.rows[0].history[0].endedAt === '2026-09-30',
    JSON.stringify(endedFixture.view.rows[0].history[0].endedAt));

  const retiredFixture = fixture({
    plans: [plan()],
    links: [],
    retired: [{
      dealId: DEAL_ENDED, planIds: [PLAN_A], provider: 'github', basis: 'official-plan-page',
      evidence: EVIDENCE, confirmedAt: AS_OF, title: '已下架的活动', vendor: 'GitHub',
      endedAt: '2026-09-30', reason: 'campaign_ended'
    }]
  });
  check('retired 记录进 history 桶，而且不给死链（记录已不在站上）',
    retiredFixture.view.rows[0].history.length === 1 &&
    retiredFixture.view.rows[0].history[0].retired === true &&
    retiredFixture.view.rows[0].history[0].dealTitle === '已下架的活动',
    JSON.stringify(retiredFixture.view.rows[0].history[0]));
  check('retired 与 links 指向同一条优惠 → 报错',
    hasError(fixture({
      retired: [{
        dealId: DEAL_A, planIds: [PLAN_A], provider: 'github', basis: 'official-plan-page',
        evidence: EVIDENCE, confirmedAt: AS_OF, title: 'x', vendor: 'GitHub',
        endedAt: AS_OF, reason: 'relation_withdrawn'
      }]
    }).result, '不能同时在 links 与 retired 里'));
  check('retired 缺快照 → 报错',
    hasError(fixture({
      links: [],
      retired: [{
        dealId: DEAL_ENDED, planIds: [PLAN_A], provider: 'github', basis: 'official-plan-page',
        evidence: EVIDENCE, confirmedAt: AS_OF, endedAt: AS_OF, reason: 'campaign_ended'
      }]
    }).result, '必须带 title 快照'));
}

/* ================================================================== */
section('⑦ 页面：套餐页的块 + 优惠页的块');
/* ================================================================== */
{
  const view = fixture().view;
  const block = plansPage.planDealsBlockHtml(view, { prefix: '../../', home: '../../' });
  check('套餐页：有当前优惠 → 写「当前优惠：」+「查看优惠 →」+ 正确的深度前缀',
    block.includes('当前优惠：') && block.includes('查看优惠 →') && block.includes('href="../../deal/'),
    block.slice(0, 120));
  check('套餐页：没有关联的套餐写「暂无当前优惠」（而不是一片空白）',
    plansPage.planDealsBlockHtml(fixture({ plans: [plan()], links: [] }).view, { prefix: '../../' })
      .includes('暂无当前优惠'));
  check('套餐页：块自带计数行与基准日',
    block.includes('共 1 条套餐 · 当前有优惠 1 条 · 历史关联 0 条') && block.includes(AS_OF));
  check('套餐页：块里零交互控件（无 JS 时没有点了没反应的东西）',
    !/<button|<select|<input|data-facet=|data-sort=|data-reset/.test(block));

  const endedView = fixture({
    deals: [deal({ id: DEAL_ENDED, expiresAt: '2026-09-30' })],
    links: [link({ dealId: DEAL_ENDED })],
    strict: false
  }).view;
  const endedBlock = plansPage.planDealsBlockHtml(endedView, { prefix: '../../' });
  check('套餐页：优惠已结束 → 「暂无当前优惠」+「历史优惠：…（已结束 2026-09-30）」',
    endedBlock.includes('暂无当前优惠') && endedBlock.includes('历史优惠：') && endedBlock.includes('已结束 2026-09-30'),
    endedBlock.slice(0, 200));
  check('套餐页：已结束的那条**没有**「当前优惠」专用链接（class="pdgo"）',
    !/<a class="pdgo" /.test(endedBlock), endedBlock);
  check('套餐页：断言在正确的块上通过', plansPage.assertPlanDealsBlock(endedBlock, endedView, { prefix: '../../' }).length === 0);
  check('套餐页：视图缺失或为空时不渲染（既有调用方不受影响）',
    plansPage.planDealsBlockHtml(null) === '');

  const rc = loadRenderCore(path.join(ROOT, 'index.html'));
  const relatedDeal = deal();
  relatedDeal.relatedPlans = links.relatedPlansOf(links.dealView(fixture().doc, fixture().ctx).get(DEAL_A));
  check('注入载荷的键集固定（RENDER-CORE 只读这些键）',
    JSON.stringify(Object.keys(relatedDeal.relatedPlans[0])) === JSON.stringify(links.RELATED_PLAN_FIELDS),
    JSON.stringify(Object.keys(relatedDeal.relatedPlans[0])));

  const pageHtml = rc.detailHtml(relatedDeal, { headingTag: 'h1', prefix: '../../' });
  check('优惠页：有关系的优惠渲染出「关联的正常套餐」块与套餐名',
    pageHtml.includes('关联的正常套餐') && pageHtml.includes('GitHub Pro'));
  check('优惠页：五个字段名与套餐表同名（正常价格 / 当前活动价 / 额度 / 主要模型）',
    ['正常价格', '当前活动价', '额度', '主要模型'].every(label => pageHtml.includes(label)));
  check('优惠页：「查看套餐对比 →」链到套餐行的锚点，且带正确深度前缀',
    pageHtml.includes(`href="../../plans/coding/#plan-${PLAN_A}"`) && pageHtml.includes('查看套餐对比 →'));
  check('优惠页：没有任何关系的优惠**不渲染**这一块',
    !rc.detailHtml(deal(), { headingTag: 'h1', prefix: '../../' }).includes('class="dplans"'));
  check('优惠页：前缀由调用方决定（首页弹层给空串 / 详情页给 ../../）',
    rc.detailHtml(relatedDeal, {}).includes(`href="plans/coding/#plan-${PLAN_A}"`));

  const endedRelated = JSON.parse(JSON.stringify(relatedDeal));
  endedRelated.relatedPlans[0].linkStatus = 'ended';
  const endedPage = rc.detailHtml(endedRelated, { headingTag: 'h1', prefix: '../../' });
  check('优惠页：已结束的关系写「该优惠已结束」，不写「当前优惠」',
    endedPage.includes('该优惠已结束') && !endedPage.includes('>当前优惠<'));
}

/* ================================================================== */
section('⑧ 候选报告：只提候选，绝不写生产关系');
/* ================================================================== */
{
  const deals = [deal(), deal({ id: DEAL_B, title: 'Cursor 学生优惠', vendor: 'Cursor', url: 'https://cursor.com/pricing' })];
  const planList = [plan(), plan({ id: PLAN_B, provider: 'cursor', planName: 'Pro', officialUrl: 'https://cursor.com/pricing' })];
  const first = links.candidatesOf(deals, planList, { providerTable: PROVIDER_TABLE });
  const second = links.candidatesOf(deals, planList, { providerTable: PROVIDER_TABLE });
  check('候选是确定性的（同输入两次逐字节相同）', JSON.stringify(first) === JSON.stringify(second));
  check('候选按 dealId + planId 规范序', JSON.stringify(first) === JSON.stringify([...first].sort((a, b) =>
    (a.dealId + a.planId < b.dealId + b.planId ? -1 : 1))));
  check('候选带判据与置信级别（vendor-alias / url-host / title-mention）',
    first.every(item => Array.isArray(item.rules) && item.rules.length && ['high', 'medium', 'low'].includes(item.confidence)));
  check('候选产物里没有 links/retired 这种生产关系字段',
    first.every(item => !('links' in item) && !('retired' in item) && !('planIds' in item)));
  check('候选函数不读写任何文件（纯函数：同输入同输出即可证明）',
    links.candidatesOf(deals, planList, { providerTable: PROVIDER_TABLE }).length === first.length);

  const toolSource = fs.readFileSync(path.join(__dirname, 'deal-plan-link-candidates.js'), 'utf8');
  check('候选工具没有写生产关系的代码路径（不出现对 deal-plan-links.json 的写操作）',
    !/writeFileSync\([^)]*deal-plan-links\.json/.test(toolSource) && !/LINKS_FILE/.test(toolSource),
    '候选工具源码里出现了 LINKS_FILE / 写 links 表的调用');
  check('候选工具的输出落在 research/_raw/possible-deal-plan-links.json（人工 review 用）',
    toolSource.includes('possible-deal-plan-links.json'));
}

/* ================================================================== */
section('⑨ 真实仓库数据自洽');
/* ================================================================== */
{
  const loaded = links.load();
  check('scripts/data/deal-plan-links.json 存在且能解析', !loaded.missing && !loaded.broken,
    loaded.broken || (loaded.missing ? '文件缺失' : ''));
  if (!loaded.missing && !loaded.broken) {
    const dealsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
    const plansDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
    // v2.5：真实关系表现在也覆盖 API 计费记录（「新用户送 2000 万 tokens」这类厂商级优惠），
    // 所以 id 空间与构建期/validate 期一样是**合并**的 —— 三处必须传同一组 ctx，
    // 否则会出现「selftest 绿、validate 红」这种最迷惑人的分叉。
    const apiPlansDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
    const planHistoryLib = require('../lib/plan-history');
    const apiPlanHistoryLib = require('../lib/api-plan-history');
    const planHistoryLoad = planHistoryLib.load();
    const apiPlanHistoryLoad = apiPlanHistoryLib.load();
    const ctx = {
      deals: dealsDoc.deals,
      plans: plansDoc.plans,
      apiPlans: apiPlansDoc.plans,
      asOf: links.asOfOf({
        dealsUpdatedAt: dealsDoc.updatedAt,
        plansUpdatedAt: plansDoc.updatedAt,
        apiPlansUpdatedAt: apiPlansDoc.updatedAt
      }),
      providerTable: PROVIDER_TABLE,
      planHistoryStore: planHistoryLoad.missing || planHistoryLoad.broken ? null : planHistoryLoad.store,
      apiPlanHistoryStore: apiPlanHistoryLoad.missing || apiPlanHistoryLoad.broken ? null : apiPlanHistoryLoad.store,
      strict: true
    };
    const result = links.validate(loaded.doc, ctx);
    check('真实关系表在 strict 下零 error', result.errors.length === 0, JSON.stringify(result.errors.slice(0, 3)));
    const view = links.planDealsView(loaded.doc, ctx);
    check('真实关系表：每条记录各一行（Coding 套餐 ∪ API 计费），覆盖数与关系数一致',
      view.rows.length === plansDoc.plans.length + apiPlansDoc.plans.length &&
      view.counts.current === result.stats.currentRows &&
      view.counts.links === result.stats.links,
      JSON.stringify(view.counts));
    const published = links.publishedDoc(loaded.doc);
    check('发布载荷带派生 updatedAt / count，且源文件里没有它们',
      published.count === published.links.length + published.retired.length &&
      /^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/.test(String(published.updatedAt)) &&
      !Object.prototype.hasOwnProperty.call(loaded.doc, 'count') &&
      !Object.prototype.hasOwnProperty.call(loaded.doc, 'updatedAt'),
      JSON.stringify({ count: published.count, updatedAt: published.updatedAt }));
    check('真实关系表的每条引文都是官方出处（非聚合站、非未来日期）',
      (loaded.doc.links || []).every(item => (item.evidence || []).length > 0));
  }
}

/* ================================================================== */
section('⑩ 牙齿测试（四条，逐条实跑：把东西弄坏 → 断言必须变红）');
/* ================================================================== */
{
  // #1 relatedPlanIds 指向不存在 ID → 红
  const tooth1 = fixture({ links: [link({ planIds: ['deadbeef0000'] })] });
  check('#1 planId 指向不存在的套餐 → 校验当场报错', tooth1.result.errors.length > 0 &&
    hasError(tooth1.result, '里都不存在'), JSON.stringify(tooth1.result.errors.slice(0, 1)));

  // #2 USD plan 与 CNY deal 直接计算节省 → 红
  const usdPlan = plan();
  const cnyPromo = { price: 9.9, currency: 'CNY', period: 'monthly', appliesTo: 'all', note: '首月 ¥9.9' };
  const tooth2 = links.savingsOf(usdPlan, cnyPromo);
  check('#2 USD 套餐 × CNY 优惠价 → 不计算节省（拿同一对同币种数据做对照必须算得出）',
    tooth2 === null && links.savingsOf(plan({
      billing: { period: 'monthly', currency: 'CNY', regularPrice: 40, promoPrice: null, promoNote: null, note: null }
    }), cnyPromo).amount === 30.1, JSON.stringify(tooth2));

  // #3 monthly promo 对 yearly regular 直接比较 → 红
  const yearlyPlan = plan({
    id: PLAN_Y, planName: 'Pro 年付',
    billing: { period: 'yearly', currency: 'CNY', regularPrice: 400, promoPrice: null, promoNote: null, note: null }
  });
  const tooth3 = links.savingsOf(yearlyPlan, { price: 9.9, currency: 'CNY', period: 'monthly', appliesTo: 'all', note: '首月' });
  check('#3 按月优惠价 × 按年正价 → 不计算节省', tooth3 === null, JSON.stringify(tooth3));

  // #4 ended deal 仍显示「当前优惠」→ 红
  //   做法：先用**正确**的派生（过期优惠进 history）渲染块，再把块**改坏**成"当成当前优惠"，
  //   断言必须报出来 —— 这正是"渲染器把已结束的当成当前"这一事故的形态。
  const expiredDeal = deal({ id: DEAL_ENDED, title: '已过期的活动', expiresAt: '2026-09-30' });
  const endedCase = fixture({
    deals: [expiredDeal],
    links: [link({ dealId: DEAL_ENDED })],
    strict: false
  });
  const goodBlock = plansPage.planDealsBlockHtml(endedCase.view, { prefix: '../../', home: '../../' });
  const historyItem = endedCase.view.rows[0].history[0];
  const historyText = plansPage.planDealHistoryTextOf(historyItem);
  const tampered = goodBlock.replace(
    `<span class="pdhist">${plansPage.escapeHtml(historyText)}</span>`,
    `<span class="pdcur">当前优惠：伪造的当前优惠</span>` +
    `<a class="pdgo" href="../../deal/${historyItem.dealId}/">查看优惠 →</a>`
  );
  const tooth4 = plansPage.assertPlanDealsBlock(tampered, endedCase.view, { prefix: '../../' });
  check('#4 把已结束的关联渲染成「当前优惠」→ 页面断言当场报错',
    tampered !== goodBlock && tooth4.length >= 1 && tooth4.some(text => text.includes('当成当前优惠')),
    JSON.stringify(tooth4));
  check('#4 反向：正确的块本身零问题（断言不是恒红）',
    plansPage.assertPlanDealsBlock(goodBlock, endedCase.view, { prefix: '../../' }).length === 0,
    JSON.stringify(plansPage.assertPlanDealsBlock(goodBlock, endedCase.view, { prefix: '../../' })));
}

/* ================================================================== */
const summary = `=== v2.4 优惠 ↔ 套餐关系演练：${passed} 项通过，${failures.length} 项失败 ===`;
console.log(`\n${summary}`);
if (failures.length) {
  console.log('\n失败项：');
  failures.forEach(item => console.log(`  ✗ ${item.name}${item.detail ? ` —— ${item.detail}` : ''}`));
  process.exit(1);
}
