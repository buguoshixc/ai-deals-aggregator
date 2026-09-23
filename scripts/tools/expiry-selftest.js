#!/usr/bin/env node
/**
 * 活动期限自测。
 *
 * 两件事必须同时对，否则页面上的「剩 N 天 / 长期活动 / 未标注截止日期」会互相打架：
 *   ① 外侧抽取器（scripts/lib/expiry.js）：只认文案里写死的绝对截止日，不猜；
 *   ② 前端三分类（index.html 的 RENDER-CORE.expiryState）：三档归类与排序次序。
 *
 * 用法：node scripts/tools/expiry-selftest.js
 */

const { load: loadRenderCore } = require('../lib/render-core');
const { extractDeadline, isOngoing, applyDeadline } = require('../lib/expiry');
const { loadDeals } = require('../lib/store');
const { todayCN } = require('../lib/schema');

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    return;
  }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

function checkEqual(name, actual, expected) {
  check(name, actual === expected, `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);
}

/** 北京时间偏移 n 天后的 YYYY-MM-DD */
function shiftDays(n) {
  return new Date(Date.now() + 8 * 3600 * 1000 + n * 86400000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
console.log('=== 1) 抽取器：认得出写死的绝对截止日 ===');

const POSITIVE = [
  ['活动时间：2026年9月1日 至 2026年10月1日', '2026-10-01', '中文区间取结束端'],
  ['活动时间：2026年9月1日至2026年10月1日', '2026-10-01', '中文区间（无空格）'],
  ['限时活动，截止 2026-10-01', '2026-10-01', '「截止 + 短横线日期」'],
  ['优惠有效期至 2026年12月31日', '2026-12-31', '「至 + 中文日期」'],
  ['Valid through 2026-10-01', '2026-10-01', '英文 through'],
  ['Ends Dec 31, 2026', '2026-12-31', '英文 ends + 月名'],
  ['from 2026-09-01 to 2026-10-01', '2026-10-01', '英文区间取结束端'],
  ['报名截止时间 December 1, 2026', '2026-12-01', '英文月名前置']
];

for (const [text, expected, why] of POSITIVE) {
  checkEqual(`抽取：${why}`, extractDeadline(text), expected);
}

console.log('\n=== 2) 抽取器：不猜（负样例） ===');

const NEGATIVE = [
  ['自开通起 3个月', '相对期限'],
  ['资源包有效期 1 年，自开通服务起 1 年内未用完则过期作废', '相对期限（有效期 1 年）'],
  ['长期有效（保持非营利资格即可）', '长期有效'],
  ['长期活动（以官方页面展示为准）', '长期活动'],
  ['官方公告未标注截止日期，实际额度有效期以控制台为准', '压根没给日期'],
  ['限时活动（官方未标注截止日期）', '只写限时、不给日期'],
  ['该模型于 2026年5月9日 发布', '发布日不是截止日'],
  ['本文更新时间 2026年6月26日', '文档更新日不是截止日'],
  ['将于 2026 年 10 月 10 日下线', '下线日不是优惠截止日'],
  ['免费额度 90 天，自开通之日起算', '相对期限']
];

for (const [text, why] of NEGATIVE) {
  checkEqual(`不猜：${why}`, extractDeadline(text), null);
}

console.log('\n=== 3) applyDeadline：只补未来、不覆盖已有值 ===');

const future = shiftDays(30);
const past = shiftDays(-30);

checkEqual('补未来截止日', applyDeadline({ validity: `活动截止 ${future}` }).expiresAt, future);
check(
  '丢弃过去的日期（页面在讲往期活动，填进来会把本条误判成过期）',
  applyDeadline({ validity: `step-2x-large 已于 ${past} 结束限时免费` }).expiresAt === undefined,
  '不该补出 expiresAt'
);
checkEqual(
  '已有 expiresAt 不被覆盖',
  applyDeadline({ expiresAt: '2027-01-01', validity: `活动截止 ${future}` }).expiresAt,
  '2027-01-01'
);
check(
  '无期限文案的条目原样返回',
  applyDeadline({ validity: '长期有效' }) === undefined || applyDeadline({ validity: '长期有效' }).expiresAt === undefined
);

/* ------------------------------------------------------------------ */
console.log('\n=== 4) 前端三分类：与抽取器同一套结论 ===');

const core = loadRenderCore();
check('RENDER-CORE 暴露 expiryState()', typeof core.expiryState === 'function');

const today = todayCN();
const stateOf = deal => core.expiryState(deal).key;

checkEqual('今天截止 → due', stateOf({ expiresAt: today }), 'due');
checkEqual('5 天后截止 → due', stateOf({ expiresAt: shiftDays(5) }), 'due');
checkEqual('官方写明长期 → ongoing', stateOf({ validity: '长期有效（保持非营利资格即可）' }), 'ongoing');
checkEqual('「长期活动」也算 ongoing', stateOf({ validity: '长期活动（以官方页面展示为准）' }), 'ongoing');
checkEqual('只写限时、没日期 → unknown', stateOf({ validity: '限时活动（官方未标注截止日期）' }), 'unknown');
checkEqual('压根没提日期 → unknown', stateOf({ validity: '官方公告未标注截止日期，实际额度有效期以控制台为准' }), 'unknown');
checkEqual('相对期限 → unknown', stateOf({ validity: '资源包有效期 1 年，自开通服务起 1 年内未用完则过期作废' }), 'unknown');
checkEqual('空 validity → unknown', stateOf({}), 'unknown');

// 「未标注」不能被写成「长期」：这是诚实性红线，单独断言一次
check(
  '「未标注截止日期」与「长期活动」的角标文案不同',
  core.expiryState({ validity: '官方未标注截止日期' }).label !== core.expiryState({ validity: '长期有效' }).label,
  '两者文案相同就说明分类塌了'
);

console.log('\n=== 5) 前后端词表一致性 ===');

const WORDLIST_SAMPLES = [
  '长期有效', '长期活动（以官方页面展示为准）', '每日可领取（活动长期，官方未标注截止日期）',
  '长期有效的免费档（每月 10,000 credits）', '永久有效', '常年可用', '不限时', 'Ongoing offer',
  'no expiration date', 'always available', 'No end date',
  '官方公告未标注截止日期', '限时活动（官方未标注截止日期）', '自开通起 3个月', ''
];

for (const text of WORDLIST_SAMPLES) {
  const front = core.expiryState({ validity: text }).key === 'ongoing';
  const back = isOngoing(text);
  check(`词表一致：「${text || '(空)'}」`, front === back, `前端 ${front} / 后端 ${back}`);
}

console.log('\n=== 6) 「即将截止」排序次序 ===');

const cards = [
  { id: 'unknown-new', title: 'U2', lastSeen: '2026-09-22', validity: '官方未标注截止日期' },
  { id: 'ongoing', title: 'L1', lastSeen: '2026-09-22', validity: '长期有效' },
  { id: 'due-3', title: 'D3', lastSeen: '2026-09-22', expiresAt: shiftDays(3) },
  { id: 'due-1', title: 'D1', lastSeen: '2026-09-22', expiresAt: shiftDays(1) },
  { id: 'unknown-old', title: 'U1', lastSeen: '2026-09-01', validity: '官方未标注截止日期' },
  { id: 'due-10', title: 'D10', lastSeen: '2026-09-22', expiresAt: shiftDays(10) }
];

const order = core.orderCards(cards, 'expiry').map(card => card.id);
checkEqual(
  '次序 = 剩余天数升序 → 未标注 → 长期活动',
  order.join(','),
  'due-1,due-3,due-10,unknown-new,unknown-old,ongoing'
);

const sameDay = [
  { id: 'same-old', title: 'S1', lastSeen: '2026-09-01', expiresAt: shiftDays(7) },
  { id: 'same-new', title: 'S2', lastSeen: '2026-09-22', expiresAt: shiftDays(7) }
];
checkEqual(
  '同一天截止时按最近更新兜底（不再退回文件行序）',
  core.orderCards(sameDay, 'expiry').map(card => card.id).join(','),
  'same-new,same-old'
);

/* ------------------------------------------------------------------ */
console.log('\n=== 7) 卡片角标与详情弹层文案 ===');

const baseCard = { id: 'x', title: '测试条目', url: 'https://example.com/', region: 'cn', type: 'deal', discountInfo: '新用户免费额度' };

const dueCard = core.cardHtml({ ...baseCard, expiresAt: shiftDays(4) });
check('有截止日 → 角标「剩 4 天」', /class="tg due"/.test(dueCard) && dueCard.includes('剩 4 天'));

const longCard = core.cardHtml({ ...baseCard, validity: '长期有效（保持非营利资格即可）' });
check('长期活动 → 角标「长期活动」', /class="tg long"/.test(longCard) && longCard.includes('长期活动'));

const unsCard = core.cardHtml({ ...baseCard, validity: '官方公告未标注截止日期' });
check('未标注 → 角标「未标注截止日期」', /class="tg uns"/.test(unsCard) && unsCard.includes('未标注截止日期'));

const dueDetail = core.detailHtml({ ...baseCard, expiresAt: shiftDays(4) });
check('详情弹层「活动期限」行给日期', dueDetail.includes('活动期限') && dueDetail.includes(shiftDays(4)));

const longDetail = core.detailHtml({ ...baseCard, validity: '长期有效' });
check('详情弹层「活动期限」行给长期活动', longDetail.includes('活动期限') && longDetail.includes('长期活动'));

const unsDetail = core.detailHtml({ ...baseCard, validity: '官方公告未标注截止日期' });
check('详情弹层「活动期限」行给未标注', unsDetail.includes('活动期限') && unsDetail.includes('未标注截止日期'));

/* ------------------------------------------------------------------ */
console.log('\n=== 8) 当前数据分布（信息性，不作断言） ===');

const deals = loadDeals();
const tally = { due: 0, unknown: 0, ongoing: 0 };
for (const deal of deals) tally[core.expiryState({ ...deal, tier: undefined }).key]++;
console.log(`  ${deals.length} 条：有截止日期 ${tally.due} · 未标注截止日期 ${tally.unknown} · 长期活动 ${tally.ongoing}`);
if (tally.due === 0) {
  console.log('  ℹ️  当前没有任何条目带绝对截止日期——官方页面普遍只写「限时」不给日期，排序的末两档才是常态。');
}

/* ------------------------------------------------------------------ */
console.log(`\n${failures.length ? '❌' : '✅'} 活动期限自测：${pass} 项通过，${failures.length} 项失败`);
failures.forEach(message => console.error(`   - ${message}`));
if (failures.length) process.exit(1);
