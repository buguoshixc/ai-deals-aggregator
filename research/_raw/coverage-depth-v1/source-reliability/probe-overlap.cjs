#!/usr/bin/env node
/**
 * 只读取证（t4 / Workstream C-1）：futurepedia 的 overlap 与独有价值分析。
 *
 * 判据（**禁止**用 title === title）：
 *   T  titleKey   —— dedup.normalizeTitle() → dedup.aliasKey()（别名表 + 噪声后缀剥离）
 *   U  urlKey     —— 官方 URL 归一：host（去 www、小写）+ path（去尾斜杠、小写），丢掉 query
 *   V  vendorKey  —— render-core.vendorOf({vendor}).key（厂商归一；**粗判据**，只作诊断）
 *   S  sourceKey  —— 来源页归一（sourceUrl 的 host+path；用来发现「同一个源页、标题不同」）
 *   对照：rawTitle  —— 逐字相等（用来证明「不做归一会低估 overlap」）
 *
 * 另跑一次**生产实现**做对照：dedup.dedup()（它只按 aliasKey 合并）——
 * 于是「生产会真的合并多少」与「按扩展判据看到多少重复」两个数字都有。
 *
 * 用法：
 *   node probe-overlap.cjs --census=census-fp-round1.json --tag=fp-round1
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const dedup = require(path.join(ROOT, 'scripts', 'lib', 'dedup'));
const renderCore = require(path.join(ROOT, 'scripts', 'lib', 'render-core'));

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const CENSUS = opt('census', 'census-fp-round1.json');
const TAG = opt('tag', 'fp-round1');
const DEALS_FILE = path.join(ROOT, 'deals.json');

/** 官方 URL 归一：host + path（丢 query / 去 www / 去尾斜杠 / 小写） */
function urlKeyOf(url) {
  try {
    const parsed = new URL(String(url));
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${pathname}`;
  } catch (error) {
    return '';
  }
}

function main() {
  const census = JSON.parse(fs.readFileSync(path.join(__dirname, CENSUS), 'utf8'));
  const dealsDoc = JSON.parse(fs.readFileSync(DEALS_FILE, 'utf8'));
  const deals = Array.isArray(dealsDoc) ? dealsDoc : (dealsDoc.deals || []);
  const dealsMeta = Array.isArray(dealsDoc) ? {} : { schemaVersion: dealsDoc.schemaVersion, updatedAt: dealsDoc.updatedAt, count: dealsDoc.count };
  const core = renderCore.load();
  const vendorOf = deal => core.vendorOf({ vendor: deal && deal.vendor });

  const fpLive = (census.items && census.items.futurepedia && census.items.futurepedia.deals) || [];
  const fpRaw = (census.items && census.items.futurepedia && census.items.futurepedia.raw) || [];
  const fpLiveRoundAt = census.startedAtUtc;

  const identityOf = deal => ({
    title: deal.title,
    titleKey: dedup.aliasKey(deal.title),
    normalizeTitle: dedup.normalizeTitle(deal.title),
    urlKey: urlKeyOf(deal.url),
    sourceKey: urlKeyOf(deal.sourceUrl),
    vendor: deal.vendor || '',
    vendorKey: vendorOf(deal).key,
    vendorName: vendorOf(deal).name,
    source: deal.source,
    id: deal.id,
    discountInfo: deal.discountInfo || '',
    url: deal.url,
    sourceUrl: deal.sourceUrl || null,
    score: dedup.score(deal)
  });

  const otherDeals = deals.filter(deal => deal && deal.source !== 'Futurepedia');
  const fpDeals = deals.filter(deal => deal && deal.source === 'Futurepedia');

  // 索引：其它来源的身份键 → 记录
  const idx = { titleKey: new Map(), urlKey: new Map(), sourceKey: new Map(), vendorKey: new Map(), rawTitle: new Map() };
  const push = (map, key, deal) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(deal);
  };
  for (const deal of otherDeals) {
    const id = identityOf(deal);
    push(idx.titleKey, id.titleKey, deal);
    push(idx.urlKey, id.urlKey, deal);
    push(idx.sourceKey, id.sourceKey, deal);
    push(idx.vendorKey, id.vendorKey, deal);
    push(idx.rawTitle, String(deal.title || ''), deal);
  }
  // 全体（含 Futurepedia 自身）——用于「这条 live 条目在数据集里是否已经存在（无论哪个来源）」
  const allTitleKey = new Map();
  const allUrlKey = new Map();
  for (const deal of deals) {
    const id = identityOf(deal);
    push(allTitleKey, id.titleKey, deal);
    push(allUrlKey, id.urlKey, deal);
  }

  const perItem = fpLive.map(deal => {
    const id = identityOf(deal);
    const hit = {
      titleKey: idx.titleKey.get(id.titleKey) || [],
      urlKey: idx.urlKey.get(id.urlKey) || [],
      sourceKey: idx.sourceKey.get(id.sourceKey) || [],
      vendorKey: idx.vendorKey.get(id.vendorKey) || [],
      rawTitle: idx.rawTitle.get(String(deal.title || '')) || []
    };
    const extendedOverlap = Boolean(hit.titleKey.length || hit.urlKey.length || hit.sourceKey.length);
    const productionOverlap = Boolean(hit.titleKey.length);
    const rawOnly = Boolean(hit.rawTitle.length);
    return {
      live: id,
      matches: {
        titleKey: hit.titleKey.map(d => `${d.source} / ${d.title}`),
        urlKey: hit.urlKey.map(d => `${d.source} / ${d.title}`),
        sourceKey: hit.sourceKey.map(d => `${d.source} / ${d.title}`),
        vendorKey: hit.vendorKey.map(d => `${d.source} / ${d.title}`),
        rawTitle: hit.rawTitle.map(d => `${d.source} / ${d.title}`)
      },
      extendedOverlap,
      productionOverlap,
      rawTitleOverlap: rawOnly,
      inDatasetAtAll: Boolean((allTitleKey.get(id.titleKey) || []).length || (allUrlKey.get(id.urlKey) || []).length),
      competitorScores: hit.titleKey.map(d => ({ other: d.source, otherScore: dedup.score(d), fpScore: dedup.score(deal),
        fpWins: dedup.score(deal) >= dedup.score(d) }))
    };
  });

  // 历史：deals.json 里 Futurepedia 记录与其他来源的重合度
  const historical = fpDeals.map(deal => {
    const id = identityOf(deal);
    const overlapWith = otherDeals.filter(other => {
      const oid = identityOf(other);
      return (id.titleKey && oid.titleKey === id.titleKey) || (id.urlKey && oid.urlKey === id.urlKey);
    });
    return { record: id, overlapWith: overlapWith.map(o => `${o.source} / ${o.title}`), overlap: overlapWith.length > 0 };
  });

  // 生产实现对照：dedup() 只按 aliasKey 合并
  const beforeCount = otherDeals.length;
  const { deals: beforeDeals } = dedup.dedup(otherDeals.map(d => ({ ...d })));
  const { deals: combinedDeals, mergedCount } = dedup.dedup([...fpLive.map(d => ({ ...d })), ...otherDeals.map(d => ({ ...d }))]);
  // ---- 字段级贡献分析（overlap 的「独有价值」问题：重复≠零贡献） ----
  // 用**生产合并函数** dedup.merge()（纯函数）逐条模拟：
  //   · 与其它来源记录重合的：把 fp 条目并进去，看结果里哪些字段真的变了；
  //   · 与自己的历史记录重合的：比较 live 条目与已发布记录的字段差异（= 重采会不会刷新数据）。
  const LIFECYCLE_KEYS = new Set(['lastSeen', 'firstSeen', 'verified', 'verifiedAt']);
  const diffFields = (before, after) => {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    const out = [];
    for (const key of keys) {
      if (key === 'id' || key === 'provenance') continue;
      const b = before ? before[key] : undefined;
      const a = after ? after[key] : undefined;
      const bs = JSON.stringify(b === undefined ? null : b);
      const as = JSON.stringify(a === undefined ? null : a);
      if (bs !== as) {
        out.push({ field: key, before: bs.slice(0, 160), after: as.slice(0, 160), lifecycleOnly: LIFECYCLE_KEYS.has(key) });
      }
    }
    return out;
  };

  const fieldContribution = perItem.map(item => {
    const fpDeal = fpLive.find(d => dedup.aliasKey(d.title) === item.live.titleKey && urlKeyOf(d.url) === item.live.urlKey) || null;
    const matchedRecords = item.matches.titleKey.concat(item.matches.urlKey)
      .map(label => otherDeals.find(d => `${d.source} / ${d.title}` === label))
      .filter(Boolean);
    const record = matchedRecords.sort((a, b) => dedup.score(b) - dedup.score(a))[0] || null;
    const entry = { title: item.live.title, extendedOverlap: item.extendedOverlap, against: record ? `${record.source} / ${record.title}` : null };
    if (record && fpDeal) {
      const merged = dedup.merge({ ...record }, { ...fpDeal });
      const diffs = diffFields(record, merged);
      entry.mergeFieldDiffs = diffs;
      entry.contributesNonLifecycle = diffs.some(d => !d.lifecycleOnly);
      entry.contributesFields = diffs.filter(d => !d.lifecycleOnly).map(d => d.field);
    }
    // 与自己（同来源）已发布记录比：重采是否带来新信息
    const historicalSelf = deals.find(d => d.source === 'Futurepedia' && (dedup.aliasKey(d.title) === item.live.titleKey || urlKeyOf(d.url) === item.live.urlKey));
    if (historicalSelf && fpDeal) {
      const diffs = diffFields(historicalSelf, fpDeal);
      entry.selfRefreshDiffs = diffs.filter(d => !d.lifecycleOnly);
      entry.selfRefreshFields = entry.selfRefreshDiffs.map(d => d.field);
    }
    return entry;
  });

  const productionControl = {
    otherDeals: beforeCount,
    otherDealsAfterProductionDedup: beforeDeals.length,
    combinedInput: fpLive.length + otherDeals.length,
    combinedAfterDedup: combinedDeals.length,
    productionMergedCount: mergedCount,
    fpRepresentativesAfter: combinedDeals.filter(d => d.source === 'Futurepedia').length,
    deltaVsOthersOnly: combinedDeals.length - beforeDeals.length
  };

  const unique = perItem.filter(item => !item.extendedOverlap);
  const overlap = perItem.filter(item => item.extendedOverlap);

  // 独有候选中：厂商在数据集里**从未出现**的，覆盖价值最高
  const knownVendors = new Set(deals.map(d => vendorOf(d).key).filter(Boolean));
  for (const item of unique) {
    item.vendorKnownInDataset = knownVendors.has(item.live.vendorKey);
  }

  const sourceCensus = {};
  for (const deal of deals) sourceCensus[deal.source] = (sourceCensus[deal.source] || 0) + 1;

  const artifact = {
    probe: 'probe-overlap.cjs',
    tag: TAG,
    ranAtUtc: new Date().toISOString(),
    inputs: {
      censusFile: CENSUS,
      censusRunAtUtc: fpLiveRoundAt,
      dealsMeta,
      dealsFileSha256Note: 'deals.json 只读打开；sha256 见本目录 tracked-hashes.json',
      fpLiveRawItems: fpRaw.length,
      fpLiveDeals: fpLive.length,
      dealsTotal: deals.length,
      otherDeals: otherDeals.length,
      fpDealsInDataset: fpDeals.length,
      dealsSourceCensus: Object.fromEntries(Object.entries(sourceCensus).sort((a, b) => b[1] - a[1]))
    },
    criteria: {
      T_titleKey: 'dedup.aliasKey(dedup.normalizeTitle(title))',
      U_urlKey: 'URL host+path 归一（去 www / 丢 query / 去尾斜杠 / 小写）',
      V_vendorKey: 'render-core.vendorOf({vendor}).key（粗判据，仅诊断）',
      S_sourceKey: 'sourceUrl host+path 归一',
      rawTitle: '逐字相等（对照，仅用于证明归一的必要性）',
      extendedOverlap: 'T ∪ U ∪ S（源页相同也算同一件事）',
      productionOverlap: 'T（= dedup() 的真实行为）'
    },
    numbers: {
      fpLiveItems: fpLive.length,
      fpLiveExtendedOverlap: overlap.length,
      fpLiveExtendedUnique: unique.length,
      fpLiveProductionOverlap: perItem.filter(i => i.productionOverlap).length,
      fpLiveRawTitleOverlap: perItem.filter(i => i.rawTitleOverlap).length,
      fpLiveVendorOnlyOverlap: perItem.filter(i => !i.extendedOverlap && i.matches.vendorKey.length).length,
      fpHistoricalRecords: fpDeals.length,
      fpHistoricalOverlapWithOthers: historical.filter(h => h.overlap).length,
      fpHistoricalUniqueAgainstOthers: historical.filter(h => !h.overlap).length,
      fpRecentUniqueCandidates: unique.filter(u => !u.inDatasetAtAll).length,
      fpRecentUniqueCandidatesNewVendor: unique.filter(u => !u.inDatasetAtAll && !u.vendorKnownInDataset).length
    },
    perItem,
    historical,
    fieldContribution,
    productionControl,
    sourcePriority: dedup.SOURCE_PRIORITY
  };

  const outFile = path.join(__dirname, `overlap-${TAG}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log(`[overlap] census=${CENSUS} (round at ${fpLiveRoundAt}) deals.json=${deals.length} 条`);
  console.log(`[overlap] 来源条数普查: ${JSON.stringify(artifact.inputs.dealsSourceCensus)}`);
  console.log(`[overlap] 数字: ${JSON.stringify(artifact.numbers)}`);
  console.log(`[overlap] 生产对照: ${JSON.stringify(productionControl)}`);
  for (const item of perItem) {
    console.log(`  · ${item.live.title} [T=${item.matches.titleKey.length} U=${item.matches.urlKey.length} S=${item.matches.sourceKey.length} V=${item.matches.vendorKey.length} raw=${item.matches.rawTitle.length}] ` +
      `extended=${item.extendedOverlap ? 'overlap' : 'UNIQUE'} 在数据集内=${item.inDatasetAtAll} url=${item.live.url}`);
  }
  console.log(`[overlap] 写出: ${outFile}`);
}

main();
