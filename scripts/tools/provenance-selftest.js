#!/usr/bin/env node
/**
 * v1.3 信息来源（evidence / provenance）自测：零依赖、离线、秒级。
 *
 * 为什么必须自测而不是「跑一遍 build 看看」：
 *  ① 引文的上限（条数 / 字数 / 全库预算）是**版权红线**。它一旦失效，表现是页面正常、
 *     构建正常、只有仓库里多了一大段第三方正文 —— 没有任何东西会红。
 *  ② 「最近成功采集」的四种状态（known / na / unknown / unavailable）互相之间长得很像，
 *     写错方向的后果是把「人工策展」说成「采集失败」，或者把「心跳整份不可用」说成
 *     「这个来源查不到」——两者都是**看起来很正常**的页面上的一句假话。
 *     实测已经踩过一次：`known` 没被单独放行，于是每一条真采到的记录都渲染成「未知」，
 *     而当时构建自检全绿。
 *  ③ 块的措辞必须能被证明「没有本站自发的有效性结论」——那是最容易顺手写回去的东西。
 *
 * 用法：node scripts/tools/provenance-selftest.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const provenance = require('../lib/provenance');
const audience = require('../lib/audience');
const { makeDeal, validateDeal } = require('../lib/schema');
const { load: loadRenderCore } = require('../lib/render-core');

let pass = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; return; }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

function checkEqual(name, actual, expected) {
  check(name, actual === expected, `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);
}

const TODAY = '2026-09-30';
const goodQuote = {
  field: 'discountInfo',
  quote: '官方原话：年付五折',
  sourceUrl: 'https://example.com/pricing',
  capturedAt: '2026-01-01'
};

/* ------------------------------------------------------------------ */
/* ① 引文归一：上限与拒绝理由                                          */
/* ------------------------------------------------------------------ */

console.log('=== ① 引文归一 ===');
checkEqual('合法引文：字段顺序固定', JSON.stringify(provenance.normalizeEvidence([goodQuote], { today: TODAY })), JSON.stringify([goodQuote]));
checkEqual('缺席 → null（不是空数组）', provenance.normalizeEvidence(undefined, { today: TODAY }), null);
checkEqual('空数组 → null', provenance.normalizeEvidence([], { today: TODAY }), null);
checkEqual('超长引文被拒绝', provenance.normalizeEvidence(
  [{ ...goodQuote, quote: 'x'.repeat(provenance.MAX_EVIDENCE_QUOTE_LENGTH + 1) }], { today: TODAY }), null);
checkEqual('恰好 200 字放行', Boolean(provenance.normalizeEvidence(
  [{ ...goodQuote, quote: 'x'.repeat(provenance.MAX_EVIDENCE_QUOTE_LENGTH) }], { today: TODAY })), true);
checkEqual('未知字段被拒绝', provenance.normalizeEvidence([{ ...goodQuote, field: 'nope' }], { today: TODAY }), null);
checkEqual('聚合站出处被拒绝', provenance.normalizeEvidence(
  [{ ...goodQuote, sourceUrl: 'https://futuretools.io/tools/x' }], { today: TODAY }), null);
checkEqual('聚合站子域也被拒绝', provenance.normalizeEvidence(
  [{ ...goodQuote, sourceUrl: 'https://cdn.futuretools.io/x' }], { today: TODAY }), null);
checkEqual('非 http(s) 被拒绝', provenance.normalizeEvidence([{ ...goodQuote, sourceUrl: 'ftp://a.com/x' }], { today: TODAY }), null);
checkEqual('未来日期被拒绝', provenance.normalizeEvidence([{ ...goodQuote, capturedAt: '2099-01-01' }], { today: TODAY }), null);
checkEqual('日期格式非法被拒绝', provenance.normalizeEvidence([{ ...goodQuote, capturedAt: '2026/01/01' }], { today: TODAY }), null);
checkEqual('空引文被拒绝', provenance.normalizeEvidence([{ ...goodQuote, quote: '   ' }], { today: TODAY }), null);

const cleaned = provenance.normalizeEvidence(
  [{ ...goodQuote, quote: '  <b>官方</b>\u200b 原话：年付   五折 ' }], { today: TODAY });
checkEqual('去 HTML / 零宽 / 压缩空白', cleaned[0].quote, '官方 原话：年付 五折');
checkEqual('lang 非法被丢弃', provenance.normalizeEvidence([{ ...goodQuote, lang: 'klingon' }], { today: TODAY })[0].lang, undefined);
checkEqual('lang 合法保留', provenance.normalizeEvidence([{ ...goodQuote, lang: 'zh' }], { today: TODAY })[0].lang, 'zh');

const four = [
  goodQuote,
  { ...goodQuote, field: 'validity' },
  { ...goodQuote, field: 'priceLine' },
  { ...goodQuote, field: 'eligibility' }
];
const capped = provenance.normalizeEvidence(four, { today: TODAY });
checkEqual(`条数截到上限 ${provenance.MAX_EVIDENCE_ITEMS}`, capped.length, provenance.MAX_EVIDENCE_ITEMS);
check('截断后按字段固定次序（discountInfo 在前）', capped[0].field === 'discountInfo', capped.map(i => i.field).join(','));

const dup = provenance.normalizeEvidence([goodQuote, { ...goodQuote }], { today: TODAY });
checkEqual('完全相同的两条引文去重', dup.length, 1);

/* ------------------------------------------------------------------ */
/* ② 合并：并集、确定性、上限                                          */
/* ------------------------------------------------------------------ */

console.log('=== ② 合并（merge） ===');
const a = [goodQuote];
const b = [{ ...goodQuote, field: 'audience', quote: 'Students only' }];
const merged = provenance.mergeEvidence(a, b);
checkEqual('并集保留两侧', merged.length, 2);
checkEqual('与输入顺序无关（确定性）',
  JSON.stringify(provenance.mergeEvidence(a, b)), JSON.stringify(provenance.mergeEvidence(b, a)));
checkEqual('两侧都没有 → null', provenance.mergeEvidence(undefined, null), null);
checkEqual('重复项只留一条', provenance.mergeEvidence(a, a).length, 1);
checkEqual('并集也受条数上限约束',
  provenance.mergeEvidence(four.slice(0, 3), four).length, provenance.MAX_EVIDENCE_ITEMS);
checkEqual('输出顺序按字段序（audience 在 discountInfo 之后）',
  provenance.mergeEvidence(b, a).map(i => i.field).join(','), 'discountInfo,audience');

/* ------------------------------------------------------------------ */
/* ③ 入口对账：写了却没生效必须能说出原因                              */
/* ------------------------------------------------------------------ */

console.log('=== ③ 入口对账（audit） ===');
const audit = provenance.auditEvidence([
  goodQuote,
  { ...goodQuote, field: 'nope' },
  { ...goodQuote, quote: 'x'.repeat(300) },
  { ...goodQuote, sourceUrl: 'https://futuretools.io/x' },
  { ...goodQuote, capturedAt: '2099-01-01' }
], provenance.normalizeEvidence([goodQuote], { today: TODAY }), { today: TODAY });
checkEqual('四条写坏的都被点名', audit.length, 4);
check('原因里点名了字段', audit.some(item => /field/.test(item.reason)), JSON.stringify(audit.map(i => i.reason)));
check('原因里点名了超长', audit.some(item => /超过 200 字/.test(item.reason)), JSON.stringify(audit.map(i => i.reason)));
check('原因里点名了聚合站', audit.some(item => /聚合站/.test(item.reason)), JSON.stringify(audit.map(i => i.reason)));
check('原因里点名了日期', audit.some(item => /capturedAt/.test(item.reason)), JSON.stringify(audit.map(x => x.reason)));
checkEqual('没有声明引文时不产出噪音', provenance.auditEvidence(undefined, null, { today: TODAY }).length, 0);

/* ------------------------------------------------------------------ */
/* ④ 数据层：makeDeal 归一 / validateDeal 拦截                         */
/* ------------------------------------------------------------------ */

console.log('=== ④ 数据层（schema） ===');
const base = makeDeal({
  title: 'Evidence Probe Deal',
  url: 'https://example.com/evidence',
  discountInfo: 'Save 50% on the annual plan'
}, { source: 'aitools.fyi', region: 'global' });
check('探针记录可构造', Boolean(base));
checkEqual('缺席 evidence 不产出该键', 'evidence' in base, false);

const withEvidence = makeDeal({ ...base, evidence: [goodQuote] }, { source: 'aitools.fyi', region: 'global' });
checkEqual('合法引文被挂上', JSON.stringify(withEvidence.evidence), JSON.stringify([goodQuote]));
checkEqual('挂上后 validateDeal 通过', validateDeal(withEvidence, 0).ok, true);

const mustFail = [
  ['超长引文', [goodQuote, { ...goodQuote, field: 'validity', quote: 'x'.repeat(300) }]],
  ['空数组', []],
  ['非数组', goodQuote],
  ['未知字段', [{ ...goodQuote, field: 'nope' }]]
];
mustFail.forEach(([name, evidence]) => {
  check(`validateDeal 拦下：${name}`, validateDeal({ ...base, evidence }, 0).ok === false);
});
check('validateDeal 只报合法项被拒（不静默）',
  validateDeal({ ...base, evidence: [] }, 0).errors.some(e => /空数组/.test(e)));

/* ------------------------------------------------------------------ */
/* ⑤ 采集事实：四种状态各自的含义                                      */
/* ------------------------------------------------------------------ */

console.log('=== ⑤ 采集事实（sourceFacts） ===');
const index = provenance.buildSourceIndex({
  sources: [
    { source: 'cn_qianfan', name: '百度千帆', kind: 'static', lastSuccessAt: '2026-09-29T13:04:54.254Z', status: 'healthy' },
    { source: 'cn_volc_ark', name: '火山方舟', kind: 'headless', lastSuccessAt: '2026-09-29T13:04:54.254Z', status: 'degraded' },
    { source: 'cn_zhipu', name: '智谱AI', kind: 'static', lastSuccessAt: null, status: 'degraded' }
  ]
});
const known = provenance.factsFor({ source: '百度千帆' }, { index });
checkEqual('已知：状态 known', known.lastSuccessState, 'known');
checkEqual('已知：采集方式来自心跳 kind', known.method, 'static');
checkEqual('已知：最近成功时间来自心跳', known.lastSuccessAt, '2026-09-29T13:04:54.254Z');
checkEqual('已知：来源类型来自登记表', known.sourceType, 'official');
const headless = provenance.factsFor({ source: '火山方舟' }, { index });
checkEqual('无头来源：method=headless', headless.method, 'headless');
checkEqual('无头来源：健康档位保留（degraded）', headless.healthStatus, 'degraded');
checkEqual('有心跳但从未成功 → unknown', provenance.factsFor({ source: '智谱AI' }, { index }).lastSuccessState, 'unknown');

const curated = provenance.factsFor({ source: 'Curated-CN' }, { index });
checkEqual('人工策展：状态 na（不是 unknown）', curated.lastSuccessState, 'na');
checkEqual('人工策展：method=curated', curated.method, 'curated');
checkEqual('人工策展：来源类型 curated', curated.sourceType, 'curated');

const unknownSource = provenance.factsFor({ source: '未曾登记的来源' }, { index });
checkEqual('未登记来源：状态 unknown', unknownSource.lastSuccessState, 'unknown');
checkEqual('未登记来源：类型 unknown', unknownSource.sourceType, 'unknown');
checkEqual('未登记来源：方法 unknown', unknownSource.method, 'unknown');

const noDoc = provenance.factsFor({ source: '百度千帆' }, { index, healthMissing: true });
checkEqual('心跳整份缺失：状态 unavailable（优先于 unknown）', noDoc.lastSuccessState, 'unavailable');
const brokenDoc = provenance.factsFor({ source: '百度千帆' }, { index, healthBroken: true });
checkEqual('心跳损坏：状态 unavailable', brokenDoc.lastSuccessState, 'unavailable');

checkEqual('directory 来源类型', provenance.factsFor({ source: 'Futuretools' }, { index }).sourceType, 'directory');
check('登记表覆盖当前全部来源', (() => {
  const deals = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8')).deals;
  return [...new Set(deals.map(d => d.source))].every(source => Boolean(provenance.SOURCE_TYPES[source]));
})(), 'deals.json 里有来源没登记 —— 页面上会成片显示「来源类型：未知」');

/* ------------------------------------------------------------------ */
/* ⑥ 预算：版权红线                                                    */
/* ------------------------------------------------------------------ */

console.log('=== ⑥ 预算 ===');
const budget = provenance.budgetOf([
  { evidence: [goodQuote, { ...goodQuote, field: 'validity' }] },
  { evidence: [goodQuote] },
  {}
]);
checkEqual('条数', budget.items, 3);
checkEqual('有引文的记录数', budget.withEvidence, 2);
checkEqual('单条记录最大条数', budget.maxPerDeal, 2);
checkEqual('字符数', budget.chars, goodQuote.quote.length * 3);
check('预算常量存在且是有限数', Number.isFinite(provenance.EVIDENCE_TOTAL_BUDGET_CHARS) && provenance.EVIDENCE_TOTAL_BUDGET_CHARS > 0);
check('比例上限存在且 < 1', provenance.EVIDENCE_BUDGET_RATIO > 0 && provenance.EVIDENCE_BUDGET_RATIO < 1);

/* ------------------------------------------------------------------ */
/* ⑦ 渲染：四种状态说出口 + 引文可见 + 没有自封结论                    */
/* ------------------------------------------------------------------ */

console.log('=== ⑦ 渲染（RENDER-CORE） ===');
const renderCore = loadRenderCore(path.join(ROOT, 'index.html'));
const wording = audience.parseWordingBlock(audience.extractWordingBlock(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')));
check('措辞块可解析（两个常量都在）', Boolean(wording && wording.SOURCE_LABELS && wording.SOURCE_STATE));
const contract = audience.checkWordingContract(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
check('措辞契约跨层一致', contract.ok, contract.reasons.join('；'));

const renderDeal = (factsPatch, extra = {}) => ({
  title: 'Render Probe',
  url: 'https://example.com/p',
  source: '百度千帆',
  sourceUrl: null,
  firstSeen: '2026-09-01',
  lastSeen: '2026-09-29',
  sourceFacts: factsPatch,
  ...extra
});

const knownBlock = renderCore.sourceBlockHtml(renderDeal({ ...known, lastSuccessState: 'known' }));
check('known：渲染 <time datetime>', /<time datetime="2026-09-29T13:04:54.254Z">/.test(knownBlock), knownBlock.slice(0, 200));
check('known：时间按北京时间显示', knownBlock.includes('2026-09-29 21:04'), knownBlock.slice(0, 300));
check('known：带最近一次采集状态', knownBlock.includes(wording.SOURCE_HEALTH.healthy));
check('known：来源类型与采集方式都说出来',
  knownBlock.includes(wording.SOURCE_TYPE.official) && knownBlock.includes(wording.SOURCE_METHOD.static));

const curatedBlock = renderCore.sourceBlockHtml({ title: 'C', url: 'https://example.com/c', source: 'Curated', sourceFacts: curated });
check('na：显示「不适用」', curatedBlock.includes(wording.SOURCE_STATE.na));
check('na：给出原因（人工策展没有采集器）', curatedBlock.includes(wording.SOURCE_REASON.curated));
check('na：不会显示成「不可用」', !curatedBlock.includes(wording.SOURCE_STATE.unavailable));

const unknownBlock = renderCore.sourceBlockHtml({ title: 'U', url: 'https://example.com/u', source: '某来源' });
check('缺 sourceFacts：显示「未知」', unknownBlock.includes(wording.SOURCE_STATE.unknown));
check('缺 sourceFacts：不会假装成 known（没有 <time>）', !/<time datetime=/.test(unknownBlock));

const unavailableBlock = renderCore.sourceBlockHtml(renderDeal({ ...noDoc, lastSuccessState: 'unavailable' }));
check('unavailable：显示「不可用」', unavailableBlock.includes(wording.SOURCE_STATE.unavailable));
check('unavailable：原因指向「本次构建没有心跳数据」', unavailableBlock.includes(wording.SOURCE_REASON.no_health_doc));

const evidenceBlock = renderCore.sourceBlockHtml(renderDeal({ ...known, lastSuccessState: 'known' }, { evidence: [goodQuote] }));
check('引文可见', evidenceBlock.includes(goodQuote.quote));
check('引文带出处链接', evidenceBlock.includes(goodQuote.sourceUrl));
check('引文带采集日期', evidenceBlock.includes(`采集于 ${goodQuote.capturedAt}`));
check('引文带「仅用于核对」的说明', evidenceBlock.includes(wording.SOURCE_NOTES.evidenceNote));
const noEvidenceBlock = renderCore.sourceBlockHtml(renderDeal({ ...known, lastSuccessState: 'known' }));
check('没有引文时明说「未收录官方原文片段」', noEvidenceBlock.includes(wording.SOURCE_NOTES.noEvidence));

check('没有原始出处时明说', unknownBlock.includes(wording.SOURCE_NOTES.noOrigin));
check('每块都带免责句', [knownBlock, curatedBlock, unknownBlock, unavailableBlock].every(b => b.includes(wording.SOURCE_NOTES.disclaimer)));

checkEqual('空输入返回空串', renderCore.sourceBlockHtml(null), '');
checkEqual('非对象返回空串', renderCore.sourceBlockHtml('x'), '');
check('未知 method/sourceType 不会渲染成 undefined', !unknownBlock.includes('undefined'));

// 红线：我们自己写的字里不许有本站自发的有效性结论
const ownWords = Object.keys(wording)
  .filter(group => group.startsWith('SOURCE_'))
  .flatMap(group => Object.values(wording[group] || {}))
  .map(String);
provenance.STAMP_PATTERNS.forEach(stamp => {
  check(`措辞里没有「${stamp.why}」`, !ownWords.some(text => stamp.re.test(text)), stamp.re.toString());
});
check('措辞里没有「已核验」', !ownWords.some(text => text.includes('已核验')));

// 三个缺失状态的词必须互不相同（否则三种事实被合并成一句话）
const states = ['na', 'unknown', 'unavailable'].map(key => wording.SOURCE_STATE[key]);
checkEqual('三个缺失状态各有各的说法', new Set(states).size, 3);

/* ------------------------------------------------------------------ */

console.log(`\n${failures.length ? '❌' : '✅'} provenance 自测：${pass} 项通过，${failures.length} 项失败`);
if (failures.length) {
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
