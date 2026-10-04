/**
 * 官方落地页解析 + **官方来源域登记**与「声称 official 必须能兑现」判据。
 *
 * ## 四个 URL 的角色（它们不是同一个东西，刻意不合并）
 *
 * 审计 `F-r1-identity-004`（P3-11）记的是：同一条记录上两个「来源 URL」互相冲突
 * （顶层 `sourceUrl` 指向聚合站、`provenance.sourceUrl` 指向厂商官方页），而页面上只渲染
 * 顶层那个。结论是**两个字段各有角色**，缺的是把角色写下来 —— 不是把它们合并成一个：
 *
 * | 字段 | 角色 | 允许第三方吗 | 谁来管 |
 * |---|---|---|---|
 * | `deal.url` / `plan.officialUrl` | **官方落地页**：读者点「查看」去的那个页面 | 不允许 | 本模块的官方域登记（`officialDomainProblems`）|
 * | `deal.sourceUrl` / `plan.sourceUrl` | **收录渠道**：这条记录最初是从哪里被发现的（`SOURCE_TYPES` 判 official/directory/curated）| 允许（目录站/聚合站就是 discovery）| `provenance.SOURCE_TYPES` + `validate` 的来源登记守卫 |
 * | `deal.provenance.sourceUrl` | **断言依据出处**：字段值是从哪一页读来的 | 声称官方时不允许 | 本模块的「声称 official 必须兑现」判据 |
 * | `evidence[].sourceUrl` | **官方原文片段出处**：逐条引文来自哪一页 | 不允许（黑名单 + 白名单双保险）| `provenance.normalizeEvidenceItem`（黑名单）+ 本模块（白名单）|
 *
 * 所以「同一条记录两个 URL 不同」本身**不是**错误：一个是「我们从哪里发现的」，
 * 另一个是「值是从哪一页读的」。只有「声称官方、而依据出处落在第三方目录站」才是矛盾。
 *
 * ## 官方域登记（白名单）
 *
 * 在 t7 之前，这一层只有 4 个聚合站的**黑名单**（`provenance.AGGREGATOR_HOSTS`）：
 * 只要一个 URL 不落在 4 个站里，就能被标成「官方」。黑名单挡不住「把第三方内容写成官方」
 * 这类错误 —— 它只挡得住那 4 个站。白名单登记在两处，按身份空间分开：
 *
 *   · `scripts/data/providers.json` 的每条 `officialDomains` —— **B 空间**（plans / api-plans
 *     的 provider）。它是「该 provider 的官方来源登记」，判据是：该 provider 名下的计划、
 *     API 计划、模型映射引文的官方出处必须落在这些域上。
 *   · `scripts/data/official_urls.json` 的 `_officialDomains` —— **A 空间**里有身份、
 *     而 B 空间没有 provider 的公司（deals 侧独有的产品/厂商）。键就是 `vendorOf(deal).key`
 *     会产出的那个键（命中规则时是 A 空间键，命中不了时是厂商原始串 —— 与 `vendorOf` 同口径）。
 *
 * 同一家公司**只能登记在一处**（B 空间优先）：两处都写 = 两个真相，`officialDomainProblems` 报红。
 *
 * ## 判据（`validate --strict` 的 `checkOfficialDomainGuard` 只负责跑它）
 *
 * 1. 登记表形态：裸 host、非空、同一条内不重复、**不得是第三方 discovery 域**
 *    （把聚合站登记成官方域 = 把第三方来源提升成官方证据）、必须被至少一条真实记录用过
 *    （僵尸登记 = 一句自我声明）。
 * 2. 计划侧：`officialUrl` / `sourceUrl` / `evidence[].sourceUrl` 的 host 必须在该 provider
 *    的官方域里。
 * 3. 关系层：模型映射（`model-registry-links.json`）的官方引文必须落在其计划/API 计划的
 *    provider 官方域里。
 * 4. deals 侧：`evidence[].sourceUrl` 必须是官方域（本公司登记域，或该记录自己声明的
 *    官方落地页域）；**声称官方依据**（`provenance.fields[*].basis` 是 `source`/`documented`）
 *    的记录，其依据出处（`provenance.sourceUrl`，缺席时退到 `url`）必须落在本公司登记域里，
 *    否则就是「声称官方却兑现不出官方域」；来源登记为 `official` 的记录，其依据出处与引文
 *    出处都不得是第三方 discovery 域（第三方发现来源不得被提升成官方证据）。
 *
 * 这一层**不做任何网络请求**：它只核对「记录自己声明的身份」与「显式登记表」是否一致。
 */

const officialUrls = require('../data/official_urls.json');
const { aliasKey } = require('./dedup');
const provenance = require('./provenance');

const MAP = Object.fromEntries(Object.entries(officialUrls).filter(([k]) => !k.startsWith('_')));

/** providers.json 里官方域数组的字段名（只在这里写一次：拼错一个字母会静默退化成「没登记」） */
const OFFICIAL_DOMAINS_FIELD = 'officialDomains';
/** official_urls.json 里 deals 侧（A 空间）官方域登记的键 */
const DEALS_OFFICIAL_DOMAINS_KEY = '_officialDomains';

/** 裸 host 的形状：至少两段，允许连字符，不允许下划线/通配/端口/路径 */
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** 去掉 `_` 开头的元信息键（与 providers.js / vendor-slugs.json 的既有约定一致） */
function withoutMeta(object) {
  const out = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (key.startsWith('_')) continue;
    out[key] = value;
  }
  return out;
}

/**
 * 归一成**裸 host**：小写、去协议/路径/端口/尾点；非法返回 null。
 *
 * 允许登记时顺手粘整条 URL（`https://openai.com/pricing/`），但只取 host ——
 * 「登记的是域，不是页面」这条判据不能靠自觉：写成整条 URL 时如果不归一，
 * 后面对账时会稳定地匹配不上，而错误表现是「官方域核对通过」（假绿）。
 */
function normalizeDomain(value) {
  if (typeof value !== 'string') return null;
  let text = value.trim().toLowerCase();
  if (!text) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(text)) {
    const host = provenance.hostOf(text);
    if (!host) return null;
    text = host;
  }
  text = text.replace(/\.+$/, '');
  return DOMAIN_RE.test(text) ? text : null;
}

/** host 是否落在登记域上（精确相等或子域） */
function hostMatchesDomain(host, domain) {
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

/** host 是否落在任一登记域上 */
function hostInDomains(host, domains) {
  return (Array.isArray(domains) ? domains : []).some(domain => hostMatchesDomain(host, domain));
}

/** 第三方 discovery（聚合站 / 目录站）判定：白名单里不得出现它们 */
function isDiscoveryHost(host) {
  const value = String(host || '').toLowerCase();
  return provenance.AGGREGATOR_HOSTS.some(item => value === item || value.endsWith(`.${item}`));
}

/** 一个身份（provider 条目或 deals 侧登记数组）登记的官方域（已归一；非法项由 officialDomainProblems 报出） */
function domainsOf(entry) {
  const raw = Array.isArray(entry)
    ? entry
    : (entry && typeof entry === 'object' ? entry[OFFICIAL_DOMAINS_FIELD] : null);
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeDomain).filter(Boolean);
}

/** official_urls.json 的 deals 侧官方域登记表（`_officialDomains` 段；不是别名→官方页那一段） */
function dealsRegistryOf(officialUrlsDoc) {
  const raw = officialUrlsDoc && typeof officialUrlsDoc === 'object'
    ? officialUrlsDoc[DEALS_OFFICIAL_DOMAINS_KEY] : null;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

/**
 * 建立登记索引。
 *
 * @param {{providers?:object, officialUrls?:object}} [input]
 * @returns {{
 *   byProvider: Map<string,string[]>,        provider key → 官方域
 *   byVendor: Map<string,string[]>,          A 空间键（或未归一厂商串）→ 官方域
 *   providerOfVendorKey: Map<string,string>, A 空间键 → provider key
 *   registered: string[]                     全部登记域（去重）
 * }}
 */
function domainIndex({ providers: providersDoc = null, officialUrls: officialUrlsDoc = null } = {}) {
  const providerTable = withoutMeta(providersDoc || {});
  const byProvider = new Map();
  const providerOfVendorKey = new Map();
  for (const [key, entry] of Object.entries(providerTable)) {
    const domains = domainsOf(entry);
    if (domains.length) byProvider.set(key, domains);
    const vendorKey = entry && typeof entry.vendorKey === 'string' && entry.vendorKey ? entry.vendorKey : null;
    if (vendorKey && !providerOfVendorKey.has(vendorKey)) providerOfVendorKey.set(vendorKey, key);
  }
  const dealsTable = dealsRegistryOf(officialUrlsDoc);
  const byVendor = new Map();
  for (const [key, value] of Object.entries(dealsTable)) {
    const domains = domainsOf(value);
    if (domains.length) byVendor.set(key, domains);
  }
  const registered = [...new Set([...byProvider.values(), ...byVendor.values()].flat())].sort();
  return { byProvider, byVendor, providerOfVendorKey, registered };
}

/** 一条记录（deal）的官方域：先看它的身份是不是 provider，再看 deals 侧登记 */
function domainsForDeal(deal, index, vendorKeyOfDeal) {
  const key = typeof vendorKeyOfDeal === 'function' ? vendorKeyOfDeal(deal) : null;
  if (!key) return { key: null, owner: null, domains: [] };
  const providerKey = index.providerOfVendorKey.get(key);
  if (providerKey && index.byProvider.has(providerKey)) {
    return { key, owner: `provider ${providerKey}`, domains: index.byProvider.get(providerKey) };
  }
  if (index.byVendor.has(key)) return { key, owner: `deals 侧登记「${key}」`, domains: index.byVendor.get(key) };
  return { key, owner: null, domains: [] };
}

/**
 * 这条记录在页面上会不会印出「官方页面明写 / 依据官方条款原文」——
 * 判据与渲染层**逐格相同**（`provenance.basisWordingKey`：basis + derived + sourceType 三轴）。
 *
 * 为什么判据必须与渲染层同源，而不是「basis 里写了 source 就算」：第三方目录站收录的记录
 * （`sourceType==='directory'`）字段级 basis 也是 `source`（值为真），但页面按档位渲染成
 * 「第三方收录页原文」—— 它**没有**声称官方，因此不该被这条判据要求兑现官方域。
 * 反过来，一旦某条记录在页面上印出「官方页面明写」，它的依据出处就必须落在官方域登记里。
 */
function claimsOfficialWording(deal, sourceType) {
  const fields = deal && deal.provenance && deal.provenance.fields;
  if (!fields || typeof fields !== 'object') return false;
  return Object.values(fields).some(entry => {
    const key = provenance.basisWordingKey(entry, sourceType);
    return key === 'source' || key === 'documented';
  });
}

/** 记录的依据出处（字段值是从哪一页读来的）；缺席时退到官方落地页 */
function basisOriginUrl(deal) {
  const declared = deal && deal.provenance && typeof deal.provenance.sourceUrl === 'string'
    ? deal.provenance.sourceUrl : null;
  if (declared) return { url: declared, from: 'provenance.sourceUrl' };
  const landing = deal && typeof deal.url === 'string' && deal.url ? deal.url : null;
  return landing ? { url: landing, from: 'url' } : { url: null, from: null };
}

/**
 * 官方域判据。返回问题列表（空 = 通过）；**只读**，不写盘、不发请求。
 *
 * @param {object} input
 * @param {object} input.providers           providers.json 原样（含 `_` 元信息）
 * @param {object} input.officialUrls        official_urls.json 原样
 * @param {Array}  [input.deals]             deals.json 的 deals
 * @param {Array}  [input.plans]             plans.json 的 plans
 * @param {Array}  [input.apiPlans]          api-plans.json 的 plans
 * @param {Array}  [input.registryLinks]     model-registry-links.json 的 links
 * @param {Array}  [input.vendorKeys]        A 空间键/名对（`[{key,name}]`；缺省 = 不校验 deals 侧身份键）
 * @param {(deal:object)=>string|null} [input.vendorKeyOfDeal] A 空间取值器（`vendorOf(deal).key`）
 * @param {object} [input.sourceTypes]       来源登记表（缺省用 `provenance.SOURCE_TYPES`）
 * @returns {string[]}
 */
function officialDomainProblems(input = {}) {
  const problems = [];
  const {
    providers: providersDoc = null,
    officialUrls: officialUrlsDoc = null,
    deals = [],
    plans = [],
    apiPlans = [],
    registryLinks = [],
    vendorKeys = null,
    vendorKeyOfDeal = null,
    sourceTypes = provenance.SOURCE_TYPES
  } = input;

  if (!providersDoc || typeof providersDoc !== 'object') {
    return ['官方域判据：providers.json 没有读进来 —— 判据没有输入，会假绿（缺文件不是通过）'];
  }
  if (!officialUrlsDoc || typeof officialUrlsDoc !== 'object') {
    return ['官方域判据：official_urls.json 没有读进来 —— 判据没有输入，会假绿（缺文件不是通过）'];
  }
  if (typeof vendorKeyOfDeal !== 'function') {
    return ['官方域判据：缺少 A 空间取值器（vendorOf(deal).key）—— deals 侧的身份无法对上官方域登记'];
  }

  const providerTable = withoutMeta(providersDoc);
  const dealsTable = dealsRegistryOf(officialUrlsDoc);
  const index = domainIndex({ providers: providersDoc, officialUrls: officialUrlsDoc });
  const knownVendorKeys = new Set((Array.isArray(vendorKeys) ? vendorKeys : [])
    .map(pair => String((pair && pair.key) || '')).filter(Boolean));
  // 「真实可产出的键」还包括**没命中 VENDOR_RULES 的厂商原始串**：vendorOf() 对命中不了的
  // 厂商原样返回原始串（宁可显示原始名，也不给没有规则的条目硬套一个厂商），所以
  // `vendorOf(deal).key` 的取值空间 = A 空间键 ∪ 真实出现过的原始厂商串。
  for (const deal of Array.isArray(deals) ? deals : []) {
    const key = typeof vendorKeyOfDeal === 'function' ? vendorKeyOfDeal(deal) : null;
    if (key) knownVendorKeys.add(String(key));
  }

  /* ---- ① 登记表形态 ---- */
  const checkDomainList = (domains, where) => {
    if (!Array.isArray(domains)) {
      problems.push(`${where}: 缺少 ${OFFICIAL_DOMAINS_FIELD}（官方域登记；没有就写空数组也要写出来）`);
      return;
    }
    if (!domains.length) {
      problems.push(`${where}: ${OFFICIAL_DOMAINS_FIELD} 是空数组 —— 声称官方时必须能兑现出一个官方域`);
      return;
    }
    const seen = new Set();
    for (const raw of domains) {
      const host = normalizeDomain(raw);
      if (!host) {
        problems.push(`${where}: ${OFFICIAL_DOMAINS_FIELD} 里的「${raw}」不是裸 host（只写域，不写协议/路径/通配）`);
        continue;
      }
      if (host !== raw) {
        problems.push(`${where}: ${OFFICIAL_DOMAINS_FIELD} 里的「${raw}」不是归一形态（应为「${host}」）`);
        continue;
      }
      if (seen.has(host)) problems.push(`${where}: ${OFFICIAL_DOMAINS_FIELD} 里的「${host}」重复`);
      seen.add(host);
      if (isDiscoveryHost(host)) {
        problems.push(`${where}: ${OFFICIAL_DOMAINS_FIELD} 里的「${host}」是第三方目录站/聚合站 —— 第三方 discovery source 不得被登记（更不得被提升）成官方域`);
      }
    }
  };
  for (const [key, entry] of Object.entries(providerTable)) {
    checkDomainList(entry && entry[OFFICIAL_DOMAINS_FIELD], `providers.json 的 ${key}`);
  }
  for (const [key, value] of Object.entries(dealsTable)) {
    checkDomainList(value, `official_urls.json 的 _officialDomains「${key}」`);
    if (knownVendorKeys.size && !knownVendorKeys.has(key)) {
      problems.push(`official_urls.json 的 _officialDomains「${key}」不是真实记录上 vendorOf() 会产出的键` +
        '（A 空间键，或未命中规则时的厂商原始串）—— 这条登记兑现不到任何记录');
    }
    const owner = index.providerOfVendorKey.get(key);
    if (owner) {
      problems.push(`official_urls.json 的 _officialDomains「${key}」与 providers.json 的 ${owner} 是同一家公司` +
        `（provider 的 vendorKey 就是它）—— 官方域只能登记在一处，两处登记就是两个真相`);
    }
  }

  /* ---- ② 计划侧（plans / api-plans）：officialUrl / sourceUrl / evidence 必须落在 provider 官方域 ---- */
  const missingProviderDomains = new Set();
  const checkPlanSide = (list, label) => {
    for (const record of Array.isArray(list) ? list : []) {
      if (!record || typeof record !== 'object') continue;
      const providerKey = String(record.provider || '');
      const domains = index.byProvider.get(providerKey) || [];
      const where = `${label} ${record.id || record.planName || '(无 id)'}（provider ${providerKey || '未登记'}）`;
      if (!domains.length) {
        // 一个 provider 只报一次：它名下可能有几十条计划，逐条报只会把错误账淹掉
        if (!missingProviderDomains.has(providerKey)) {
          missingProviderDomains.add(providerKey);
          problems.push(`${label}: provider「${providerKey || '(未登记)'}」在 providers.json 里没有官方域登记 —— 计划声称官方时无法兑现`);
        }
        continue;
      }
      const check = (url, role) => {
        const host = provenance.hostOf(url);
        if (!host) return;
        if (!hostInDomains(host, domains)) {
          problems.push(`${where}: ${role} 的域 ${host} 不在该 provider 登记的官方域里` +
            `（${domains.join(' / ')}）—— 声称 official 的出处必须落在官方来源登记上`);
        }
      };
      check(record.officialUrl, 'officialUrl');
      check(record.sourceUrl, 'sourceUrl');
      for (const item of (Array.isArray(record.evidence) ? record.evidence : [])) {
        check(item && item.sourceUrl, 'evidence[].sourceUrl');
      }
    }
  };
  checkPlanSide(plans, 'plans.json');
  checkPlanSide(apiPlans, 'api-plans.json');

  /* ---- ③ 关系层：模型映射的官方引文 ---- */
  const planById = new Map();
  for (const record of [...(Array.isArray(plans) ? plans : []), ...(Array.isArray(apiPlans) ? apiPlans : [])]) {
    if (record && record.id) planById.set(record.id, record);
  }
  for (const link of Array.isArray(registryLinks) ? registryLinks : []) {
    if (!link || typeof link !== 'object') continue;
    const evidence = Array.isArray(link.evidence) ? link.evidence : [];
    if (!evidence.length) continue;
    const planId = link.planId || link.apiPlanId || null;
    const plan = planId ? planById.get(planId) : null;
    const providerKey = plan ? String(plan.provider || '') : '';
    const domains = index.byProvider.get(providerKey) || [];
    const where = `模型映射 ${link.registrySlug || '(无 slug)'} → ${planId || '(无计划)'}`;
    if (!domains.length) {
      problems.push(`${where}: 该计划的 provider 没有官方域登记 —— 映射引文声称官方时无法兑现`);
      continue;
    }
    for (const item of evidence) {
      const host = provenance.hostOf(item && item.sourceUrl);
      if (!host) continue;
      if (!hostInDomains(host, domains)) {
        problems.push(`${where}: 引文（basis=${link.basis}）的域 ${host} 不在 ${providerKey} 登记的官方域里` +
          `（${domains.join(' / ')}）`);
      }
    }
  }

  /* ---- ④ deals 侧 ---- */
  // 「官方出处 host」的全库清单（供 ⑤ 的僵尸登记判据用）：计划的 officialUrl / sourceUrl
  // （plans 的 source 契约只有 official 三档，所以它的 sourceUrl 也是官方角色）、
  // 计划与模型映射的官方引文、以及 deals 的官方落地页 / 依据出处 / 引文出处。
  const usedHosts = [];
  const noteHost = url => { const host = provenance.hostOf(url); if (host) usedHosts.push(host); };
  for (const record of [...(Array.isArray(plans) ? plans : []), ...(Array.isArray(apiPlans) ? apiPlans : [])]) {
    if (!record) continue;
    noteHost(record.officialUrl);
    noteHost(record.sourceUrl);
    for (const item of (Array.isArray(record.evidence) ? record.evidence : [])) noteHost(item && item.sourceUrl);
  }
  for (const link of Array.isArray(registryLinks) ? registryLinks : []) {
    for (const item of (link && Array.isArray(link.evidence) ? link.evidence : [])) noteHost(item && item.sourceUrl);
  }

  for (const deal of Array.isArray(deals) ? deals : []) {
    if (!deal || typeof deal !== 'object') continue;
    const where = `deals.json 的 ${deal.id || deal.title || '(无 id)'}（来源 ${deal.source || '未登记'}）`;
    const landingHost = provenance.hostOf(deal.url);
    noteHost(deal.url);
    noteHost(deal.provenance && deal.provenance.sourceUrl);
    const own = domainsForDeal(deal, index, vendorKeyOfDeal);
    const sourceType = sourceTypes && sourceTypes[deal.source] ? sourceTypes[deal.source] : 'unknown';

    // ④.1 引文出处必须是官方域（本公司登记域，或该记录自己声明的官方落地页域），且不得是 discovery 域
    for (const [i, item] of (Array.isArray(deal.evidence) ? deal.evidence : []).entries()) {
      const host = provenance.hostOf(item && item.sourceUrl);
      if (!host) continue;
      noteHost(item && item.sourceUrl);
      if (isDiscoveryHost(host)) {
        problems.push(`${where}: evidence[${i}] 的出处是第三方目录站/聚合站（${host}）—— 官方原文片段不能出自第三方 discovery source`);
        continue;
      }
      const ok = hostInDomains(host, own.domains) || (landingHost && hostMatchesDomain(host, landingHost));
      if (!ok) {
        const where2 = own.owner
          ? `${own.owner} 的官方域登记（${own.domains.join(' / ')}）`
          : '本公司（在官方域登记表里没有登记）';
        problems.push(`${where}: evidence[${i}] 的域 ${host} 既不在${where2}里，也不等于该记录声明的官方落地页域` +
          `${landingHost ? `（${landingHost}）` : '（该记录没有 url）'} —— 引文出处必须是官方域`);
      }
    }

    // ④.2 页面上印出「官方页面明写 / 依据官方条款原文」⇒ 依据出处必须能兑现出一个官方域
    if (claimsOfficialWording(deal, sourceType)) {
      const origin = basisOriginUrl(deal);
      if (!own.domains.length) {
        problems.push(`${where}: 字段级依据在页面上印出「官方页面明写 / 依据官方条款原文」，但该公司` +
          `${own.key ? `（${own.key}）` : ''}在官方域登记表里没有官方域 —— 声称官方必须先登记官方来源` +
          '（providers.json 的 officialDomains，或 official_urls.json 的 _officialDomains）');
      } else if (!origin.url) {
        problems.push(`${where}: 字段级依据声称官方，但既没有 provenance.sourceUrl 也没有 url —— 兑现不出官方域`);
      } else {
        const host = provenance.hostOf(origin.url);
        if (host && !hostInDomains(host, own.domains)) {
          problems.push(`${where}: 字段级依据声称官方（页面上会印「官方页面明写 / 依据官方条款原文」），` +
            `而依据出处 ${origin.from} 的域 ${host} 不在${own.owner} 的官方域里（${own.domains.join(' / ')}）` +
            ' —— 要么改依据出处，要么把这条记录的来源类型如实改成第三方收录（那样页面也不会再声称官方）');
        }
      }
    }

    // ④.3 来源登记为「厂商官方页直采」的记录，其依据/引文出处不得是第三方 discovery 域
    if (sourceType === 'official') {
      const origin = basisOriginUrl(deal);
      const originHost = origin.url ? provenance.hostOf(origin.url) : null;
      if (originHost && isDiscoveryHost(originHost)) {
        problems.push(`${where}: 来源登记为「厂商官方页直采」，而依据出处 ${origin.from} 指向第三方目录站（${originHost}）` +
          ' —— 第三方发现来源不得被提升成官方证据（来源身份或登记表必须改一处）');
      }
      for (const [i, item] of (Array.isArray(deal.evidence) ? deal.evidence : []).entries()) {
        const host = provenance.hostOf(item && item.sourceUrl);
        if (host && isDiscoveryHost(host)) {
          problems.push(`${where}: 来源登记为「厂商官方页直采」，而 evidence[${i}] 指向第三方目录站（${host}）`);
        }
      }
    }
  }

  /* ---- ⑤ 僵尸登记：登记的域必须被至少一条真实记录用过 ---- */
  const hostUsed = host => usedHosts.some(item => hostMatchesDomain(item, host));
  for (const host of index.registered) {
    if (!hostUsed(host)) {
      problems.push(`官方域登记里的「${host}」在 plans / api-plans / 模型映射 / deals 的任何官方出处里都没出现过` +
        ' —— 一条用不上的登记等于一句自我声明（要么它写错了，要么该出处还没落盘）');
    }
  }

  return problems;
}

/**
 * @param {string} title
 * @param {string} fallback 官方页缺失时的兜底 URL（通常是聚合站页）
 * @returns {{url:string, matched:boolean}}
 */
function resolveOfficialUrl(title, fallback) {
  const key = aliasKey(title);
  const official = key ? MAP[key] : null;
  if (official) return { url: official, matched: true };
  return { url: fallback, matched: false };
}

module.exports = {
  resolveOfficialUrl,
  OFFICIAL_URL_MAP: MAP,
  OFFICIAL_DOMAINS_FIELD,
  DEALS_OFFICIAL_DOMAINS_KEY,
  normalizeDomain,
  hostMatchesDomain,
  hostInDomains,
  isDiscoveryHost,
  domainsOf,
  dealsRegistryOf,
  domainIndex,
  claimsOfficialWording,
  basisOriginUrl,
  officialDomainProblems
};
