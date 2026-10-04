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
/* ⑧ 断言依据的档位：lib 判据 vs 真实渲染（全库逐条）                    */
/* ------------------------------------------------------------------ */

console.log('=== ⑧ 断言依据档位（t7：第三方收录 / 推断不得写成「官方页面明写」）===');

/**
 * 审计 `F-r1-identity-001`（14 条 / 29 处第三方目录站内容被写成「官方页面明写」）与
 * `F-r1-identity-003`（24 处声明为推断的字段按官方渲染）的共同根因是：
 * 「断言依据」只读 `basis`。判据的正本在 `provenance.basisWordingKey()`，
 * 而 RENDER-CORE 里有一份最小副本（沙箱不能 require）——这里用**全库真实数据**把两份
 * 实现逐条对账：期望档位由 lib 判据算，实际档位由 `sourceBlockHtml` 的真实求值数出来。
 *
 * 为什么必须用真实数据而不是只有夹具：这类漂移的形态是「页面上看起来完全正常」，
 * 夹具表只覆盖你想到的组合；88 条带字段级依据的记录 + 326 处字段是现成的对照物。
 */
{
  const healthDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'source-health.json'), 'utf8'));
  const healthIndex = provenance.buildSourceIndex(healthDoc);
  const allDeals = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8')).deals;
  const countOf = (text, needle) => String(text).split(needle).length - 1;
  const officialWord = wording.SOURCE_BASIS.source;

  // 基线自证：没有 sourceFacts 时来源类型是「未知」，不是官方（否则下面整张表都没意义）
  checkEqual('sourceType 判据：未登记来源 → unknown',
    provenance.factsFor({ source: '未曾登记的来源' }, { index: healthIndex }).sourceType, 'unknown');

  const buckets = new Map();       // sourceType → {records, fields, before, after}
  const inferred = { fields: 0, before: 0, after: 0 };
  const mismatches = [];
  // 「官方档位一处不靠删词抹平」的逐处留痕：从官方档移出去的每一处都必须能说出理由
  const unjustifiedDowngrades = [];
  const newOfficialClaims = [];
  for (const deal of allDeals) {
    const facts = provenance.factsFor(deal, { index: healthIndex });
    const fields = deal.provenance && deal.provenance.fields ? deal.provenance.fields : null;
    if (!fields) continue;
    const bucket = buckets.get(facts.sourceType) || { records: 0, fields: 0, before: 0, after: 0, movedInferred: 0, movedSourceType: 0 };
    bucket.records++;
    let expectedAfter = 0;
    let inferredFields = 0;
    for (const [field, entry] of Object.entries(fields)) {
      bucket.fields++;
      const key = provenance.basisWordingKey(entry, facts.sourceType);
      const beforeKey = entry && entry.basis === 'source' ? 'source'
        : entry && entry.basis === 'documented' ? 'documented'
          : entry && entry.basis === 'inferred' ? 'inferred' : 'none';
      if (beforeKey === 'source') bucket.before++;                      // 旧规则：只认 basis
      if (key === 'source') { bucket.after++; expectedAfter++; }
      if (key === 'inferred') inferredFields++;
      if (beforeKey === 'source' && key !== 'source') {
        const why = key === 'inferred' ? '声明为推断'
          : (facts.sourceType === 'directory' || facts.sourceType === 'unknown') ? `来源类型 ${facts.sourceType}（第三方收录）` : null;
        if (key === 'inferred') bucket.movedInferred++;
        else if (why) bucket.movedSourceType++;
        else unjustifiedDowngrades.push(`${deal.id}.${field}: ${beforeKey} → ${key}`);
      }
      if (beforeKey !== 'source' && key === 'source') newOfficialClaims.push(`${deal.id}.${field}: ${beforeKey} → source`);
      if (entry && (entry.basis === 'inferred' || entry.derived === 'inferred')) {
        inferred.fields++;
        if (entry.basis === 'source') inferred.before++;
        if (key === 'inferred') inferred.after++;
      }
    }
    buckets.set(facts.sourceType, bucket);

    // 真实求值：把这份 deal（含派生 sourceFacts）过一遍渲染器，数它实际印了几次「官方页面明写」
    const block = renderCore.sourceBlockHtml({ ...deal, sourceFacts: facts });
    const actual = countOf(block, officialWord);
    if (actual !== expectedAfter) {
      mismatches.push(`${deal.id}（${deal.source}/${facts.sourceType}）期望 ${expectedAfter} 处，渲染出 ${actual} 处`);
    }
    if (inferredFields && block.includes(officialWord) && actual !== expectedAfter) {
      mismatches.push(`${deal.id}: inferred 字段与「${officialWord}」同时出现`);
    }
  }
  check(`全库逐条对账：${allDeals.filter(d => d.provenance && d.provenance.fields).length} 条记录、${[...buckets.values()].reduce((s, b) => s + b.fields, 0)} 处字段的渲染档位与 lib 判据一致`,
    mismatches.length === 0, mismatches.slice(0, 3).join(' | '));
  check('红线：从「官方档」移出的每一处都能说出理由（声明为推断 / 来源类型是第三方收录）—— 不得靠删词抹平',
    unjustifiedDowngrades.length === 0, unjustifiedDowngrades.slice(0, 3).join(' | '));
  check('红线：没有任何字段从非官方档被**新**写成「官方页面明写」',
    newOfficialClaims.length === 0, newOfficialClaims.slice(0, 3).join(' | '));

  const dirBucket = buckets.get('directory') || { records: 0, fields: 0, before: 0, after: 0, movedInferred: 0, movedSourceType: 0 };
  const unknownBucket = buckets.get('unknown') || { records: 0, fields: 0, before: 0, after: 0, movedInferred: 0, movedSourceType: 0 };
  const officialBucket = buckets.get('official') || { records: 0, fields: 0, before: 0, after: 0, movedInferred: 0, movedSourceType: 0 };
  const curatedBucket = buckets.get('curated') || { records: 0, fields: 0, before: 0, after: 0, movedInferred: 0, movedSourceType: 0 };
  check('红线：sourceType=directory 的记录页面「官方页面明写」计数 = 0',
    dirBucket.after === 0, `before ${dirBucket.before} → after ${dirBucket.after}`);
  check('红线：sourceType=unknown 的记录页面「官方页面明写」计数 = 0',
    unknownBucket.after === 0, `before ${unknownBucket.before} → after ${unknownBucket.after}`);
  check('红线：声明为推断的字段一律按「由官方原文推断」（0 处按官方渲染）',
    inferred.after === inferred.fields, `${inferred.fields} 处里只有 ${inferred.after} 处按推断渲染`);
  // 「正确档位不减少」的可核形式：official / curated 两档**一处不减**（after 即正确档位），
  // 而这两档里所有移出的处数都被上面的「必须能说出理由」钉死为「声明为推断」或「第三方收录」。
  check('红线：官方直采（official）的正确档位一处不减（after 即该档正确档位）',
    officialBucket.after > 0 && officialBucket.movedSourceType === 0,
    `official ${officialBucket.before} → ${officialBucket.after}，其中按第三方理由移出 ${officialBucket.movedSourceType} 处`);
  check('红线：人工策展（curated）档的「官方页面明写」一处不减（before === after）',
    curatedBucket.before === curatedBucket.after,
    `curated ${curatedBucket.before} → ${curatedBucket.after}`);

  console.log('  官方页面明写（before → after，按记录 sourceType 分档）：');
  for (const type of ['official', 'curated', 'directory', 'unknown']) {
    const b = buckets.get(type) || { records: 0, fields: 0, before: 0, after: 0, movedInferred: 0, movedSourceType: 0 };
    console.log(`    ${type.padEnd(9)} ${b.records} 条 / ${b.fields} 处字段：${b.before} → ${b.after}` +
      `（移出 ${b.before - b.after} 处 = 声明为推断 ${b.movedInferred} + 第三方收录 ${b.movedSourceType}）`);
  }
  const totalBefore = ['official', 'curated', 'directory', 'unknown'].reduce((s, t) => s + (buckets.get(t) || { before: 0 }).before, 0);
  const totalAfter = ['official', 'curated', 'directory', 'unknown'].reduce((s, t) => s + (buckets.get(t) || { after: 0 }).after, 0);
  console.log(`    合计：${totalBefore} → ${totalAfter}（减少 ${totalBefore - totalAfter} 处 = 第三方收录 ${dirBucket.movedSourceType + unknownBucket.movedSourceType}` +
    ` + 声明为推断 ${officialBucket.movedInferred + curatedBucket.movedInferred + dirBucket.movedInferred + unknownBucket.movedInferred}）；` +
    `official 档正确档位 ${officialBucket.after} 处原样保留`);
  console.log(`  inferred 字段：${inferred.fields} 处（${inferred.before} → ${inferred.after} 处按「${wording.SOURCE_BASIS.inferred}」渲染）`);

/* ------------------------------------------------------------------ */
/* ⑨ 官方域判据：登记表 + 兑现 + 变异电池                              */
/* ------------------------------------------------------------------ */

  console.log('=== ⑨ 官方域判据（t7：evidence/officialUrl 必须兑现到官方来源登记）===');
  const official = require('../lib/official');
  const providersDoc = {
    alpha: { name: 'Alpha', slug: 'alpha', aliases: ['alpha'], logo: null, vendorKey: 'alphakey', officialDomains: ['alpha.example'] },
    beta: { name: 'Beta', slug: 'beta', aliases: ['beta'], logo: null, vendorKey: 'betakey', officialDomains: ['beta.example'] }
  };
  const officialUrlsDoc = { _comment: 'fixture', _officialDomains: { 'solo product': ['solo.example'] } };
  const vendorKeys = [
    { key: 'alphakey', name: 'Alpha' }, { key: 'betakey', name: 'Beta' }, { key: 'solo product', name: 'Solo' }
  ];
  const sourceTypesDoc = { 'Alpha Source': 'official', Curated: 'curated', Futuretools: 'directory' };
  const FIXTURE = {
    providers: providersDoc,
    officialUrls: officialUrlsDoc,
    deals: [
      { id: 'd-alpha', url: 'https://alpha.example/pricing', source: 'Alpha Source', __key: 'alphakey',
        provenance: { sourceUrl: 'https://alpha.example/pricing', fields: { audience: { basis: 'source', derived: 'stated' } } } },
      { id: 'd-dir', url: 'https://solo.example/deal', source: 'Futuretools', __key: 'solo product',
        provenance: { sourceUrl: 'https://futuretools.io/tools/sample', fields: { audience: { basis: 'source', derived: 'stated' } } } },
      { id: 'd-solo', url: 'https://solo.example/other', source: 'Curated', __key: 'solo product',
        provenance: { sourceUrl: 'https://solo.example/other', fields: { audience: { basis: 'source', derived: 'stated' } } } }
    ],
    plans: [
      { id: 'pl-alpha', provider: 'alpha', officialUrl: 'https://alpha.example/plans', sourceUrl: 'https://alpha.example/plans', evidence: [{ sourceUrl: 'https://alpha.example/plans/x' }] },
      { id: 'pl-beta', provider: 'beta', officialUrl: 'https://beta.example/plans', sourceUrl: 'https://beta.example/plans', evidence: [{ sourceUrl: 'https://beta.example/plans/x' }] }
    ],
    apiPlans: [],
    registryLinks: [{ registrySlug: 'm1', planId: 'pl-alpha', basis: 'official-plan-page', evidence: [{ sourceUrl: 'https://alpha.example/plans' }] }],
    vendorKeys,
    vendorKeyOfDeal: deal => deal.__key,
    sourceTypes: sourceTypesDoc
  };
  const runGuard = patch => official.officialDomainProblems({ ...FIXTURE, ...patch });
  const clone = () => JSON.parse(JSON.stringify(FIXTURE));
  const hits = (problems, re) => problems.some(message => re.test(message));

  check('官方域夹具基线：0 问题（对照组成立，红色确实来自变异）', runGuard().length === 0, runGuard().slice(0, 3).join(' | '));

  // P3-11（`F-r1-identity-004`）：同一条记录的两个「来源 URL」是**两个角色**，不同不是错误。
  // 顶层 sourceUrl 是收录渠道（可以是目录站），provenance.sourceUrl 是断言依据出处（声称官方
  // 就必须是官方域）。这条正向断言钉住「不把两个 URL 合并成一个」：真正合法的形态必须放行。
  const splitRoles = clone();
  splitRoles.deals.find(d => d.id === 'd-alpha').sourceUrl = 'https://futuretools.io/tools/sample';
  check('P3-11：顶层 sourceUrl 指向目录站、而依据出处指向官方域 → 不报错（两个 URL 各司其职，不合并）',
    runGuard(splitRoles).length === 0, runGuard(splitRoles).slice(0, 2).join(' | '));

  // 变异 M1：把一条 directory 来源的记录标成「官方直采」，而它的依据出处仍在第三方目录站
  //         （这正是验收里那条变异：第三方发现来源不得被提升成官方证据）
  const m1 = clone();
  m1.deals.find(d => d.id === 'd-dir').source = 'Alpha Source';
  const p1 = runGuard(m1);
  check('变异 M1：directory 记录被标成 official（依据出处仍在目录站）→ 报红', p1.length > 0, '变异没被抓住');
  check('变异 M1：报的是那条记录（d-dir）', hits(p1, /d-dir/), p1.slice(0, 2).join(' | '));

  // 变异 M2：给一条官方直采记录挂上目录站出处的「官方原文片段」
  const m2 = clone();
  m2.deals.find(d => d.id === 'd-alpha').evidence = [{ field: 'audience', quote: 'q', sourceUrl: 'https://futuretools.io/tools/x', capturedAt: '2026-01-01' }];
  const p2 = runGuard(m2);
  check('变异 M2：引文出处是第三方目录站 → 报红', hits(p2, /evidence\[0\].*第三方目录站|目录站/), p2.slice(0, 2).join(' | '));

  // 变异 M3：把第三方目录站登记成官方域（黑名单混进白名单）
  const m3 = clone();
  m3.providers.alpha.officialDomains = ['alpha.example', 'futuretools.io'];
  const p3 = runGuard(m3);
  check('变异 M3：把聚合站/目录站登记成官方域 → 报红', hits(p3, /第三方目录站|聚合站/), p3.slice(0, 2).join(' | '));

  // 变异 M4：provider 没有官方域登记（声称官方却兑现不出）
  const m4 = clone();
  delete m4.providers.alpha.officialDomains;
  const p4 = runGuard(m4);
  check('变异 M4：provider 缺 officialDomains → 报红', hits(p4, /officialDomains/), p4.slice(0, 2).join(' | '));

  // 变异 M5：把某 provider 的官方页落到别家域上
  const m5 = clone();
  m5.plans[0].officialUrl = 'https://beta.example/plans';
  const p5 = runGuard(m5);
  check('变异 M5：计划 officialUrl 落到别家官方域 → 报红', hits(p5, /pl-alpha.*officialUrl|officialUrl.*不在/), p5.slice(0, 2).join(' | '));

  // 变异 M6：模型映射的官方引文落到别家域
  const m6 = clone();
  m6.registryLinks[0].evidence[0].sourceUrl = 'https://beta.example/plans';
  check('变异 M6：模型映射引文落到别家官方域 → 报红', hits(runGuard(m6), /模型映射/), runGuard(m6).slice(0, 2).join(' | '));

  // 变异 M7：deals 侧登记键不是任何记录会产出的键（幽灵登记）
  const m7 = clone();
  m7.officialUrls._officialDomains.ghost = ['ghost.example'];
  check('变异 M7：登记键兑现不到任何记录 → 报红', hits(runGuard(m7), /ghost/), runGuard(m7).slice(0, 2).join(' | '));

  // 变异 M8：同一家公司两处登记（provider 的 vendorKey 又出现在 deals 侧）
  const m8 = clone();
  m8.officialUrls._officialDomains.alphakey = ['alpha.example'];
  check('变异 M8：同一家公司两处登记 → 报红（两处登记就是两个真相）', hits(runGuard(m8), /同一家公司/), runGuard(m8).slice(0, 2).join(' | '));

  // 变异 M9：登记项不是裸 host（写成整条 URL）
  const m9 = clone();
  m9.providers.beta.officialDomains = ['https://beta.example/plans'];
  check('变异 M9：登记项不是裸 host → 报红', hits(runGuard(m9), /不是归一形态|裸 host/), runGuard(m9).slice(0, 2).join(' | '));

  // 变异 M10：僵尸登记（登记的域没有任何真实出处用到）
  const m10 = clone();
  m10.providers.beta.officialDomains = ['beta.example', 'never-used.example'];
  check('变异 M10：僵尸登记 → 报红（用不上的登记等于一句自我声明）', hits(runGuard(m10), /never-used\.example/), runGuard(m10).slice(0, 2).join(' | '));

  // 复原：夹具回到基线（对照组成立的最后一环）
  check('复原后回到绿', runGuard().length === 0, runGuard().slice(0, 2).join(' | '));
}

/* ------------------------------------------------------------------ */

console.log(`\n${failures.length ? '❌' : '✅'} provenance 自测：${pass} 项通过，${failures.length} 项失败`);
if (failures.length) {
  failures.forEach(name => console.log(`  ✗ ${name}`));
  process.exit(1);
}
