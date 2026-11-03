'use strict';

/**
 * 事实摘要（`search-intent-v1` · W2）—— **唯一实现**。
 *
 * 为什么单独一个模块：这一块要同时被两处使用 ——
 *   · 构建期渲染（`scripts/tools/build-local.js` 的 `renderDirectoryPage()`）；
 *   · 门禁期重算（`scripts/tools/verify-site.js` §22e）。
 * 两处各写一份口径，就等于「页面说 12、断言按另一条公式算出 12」也能绿 ——
 * 那种绿是假的。所以**行怎么算**只在这里写一次，页面与断言都 `require` 它：
 * 断言重算的输入不是页面上的字符串，而是 `deals.json` 里那几个 id 的原始记录。
 *
 * 这一块**不是** `.snote`（页面级解释段）。§22c ③b 要求目录页首屏 `.snote` 数 = 0，
 * 那条判据一个字符都不动；这里是一个结构化容器 `aside.factsum`，内容全是
 * 「标签 + 现算值」的事实行，没有一句解释「这一页是干什么的」。
 * 边界见 `docs/DESIGN-RULES.md` 的「事实摘要 ≠ 解释段」一节。
 *
 * 三态纪律（与 `lib/threshold-summary.js` 同一条）：数据里没写 ≠ 不需要 / 不可用。
 * 「未说明」「未标注」是独立的第三态，不并入前两态。
 */

/**
 * 口径句 —— **常量**，页面渲染与断言重算引用同一份字面。
 * 改这句话会让断言 ②/口径逐字比对一起变，不会出现「页面改了、断言还在等旧句子」。
 */
const CALIBER = '口径：条数、平台分布、门槛、地区四项都在构建时由本页条目现算（deals.json），不是人工填写；'
  + '平台按规范厂商名归并；门槛与地区按三态计数，数据里没写明的不并入「不需要 / 不可用」。';

/** 行序固定，机器侧按 key 对账（断言不靠文案长什么样）。 */
const KEYS = ['count', 'topVendors', 'thresholds', 'region', 'date'];

function vendorCountOf(items, vendorKeyOf) {
  const counts = new Map();
  for (const item of items) {
    const name = String(vendorKeyOf(item) || (item && item.vendor) || '未标注');
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  // 稳定排序：条数降序 → 名称（zh）升序。不靠 Map 的插入序，换数据文件顺序也同结果。
  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || String(a[0]).localeCompare(String(b[0]), 'zh'));
}

function triCount(items, get) {
  let yes = 0;
  let no = 0;
  for (const item of items) {
    const value = get(item);
    if (value === true) yes += 1;
    else if (value === false) no += 1;
  }
  return { yes, no, unknown: items.length - yes - no };
}

/**
 * 算这一页的 5 行事实。
 *
 * @param {Array} items  已按本页判据筛好的条目（`landing.itemsOf()` 的返回值）
 * @param {object} opts  `{ asOf, vendorKeyOf }`；`asOf` 是**数据更新日**（不是「今天」），
 *                       所以同一份数据任何时候重建都是同一个字符串（确定性）。
 */
function rowsFor(items, opts = {}) {
  const list = Array.isArray(items) ? items : [];
  const asOf = String(opts.asOf || '').slice(0, 10);
  const vendorKeyOf = typeof opts.vendorKeyOf === 'function'
    ? opts.vendorKeyOf
    : (deal => String((deal && deal.vendor) || ''));

  const total = list.length;
  const vendors = vendorCountOf(list, vendorKeyOf);
  let topText;
  if (!vendors.length) {
    topText = '本页条目未标注平台';
  } else if (vendors.length === 1) {
    topText = `仅 ${vendors[0][0]} 一家 ${vendors[0][1]} 条`;
  } else {
    const [firstName, firstCount] = vendors[0];
    const [secondName, secondCount] = vendors[1];
    const share = total ? Math.round(((firstCount + secondCount) / total) * 100) : 0;
    topText = `${firstName} ${firstCount} 条 · ${secondName} ${secondCount} 条（前两名占 ${share}%）`;
  }

  const identity = triCount(list, deal => deal
    && deal.eligibilityDetail && deal.eligibilityDetail.identityVerificationRequired);
  const region = triCount(list, deal => deal && deal.availability && deal.availability.chinaUsable);

  return [
    { key: 'count', label: '收录条目', value: `${total} 条` },
    { key: 'topVendors', label: '平台分布', value: topText },
    {
      key: 'thresholds',
      label: '实名门槛',
      value: `明确免实名 ${identity.no} 条 · 明确需实名 ${identity.yes} 条 · 未说明 ${identity.unknown} 条`
    },
    {
      key: 'region',
      label: '中国大陆可用',
      value: `确认可用 ${region.yes} 条 · 确认不可用 ${region.no} 条 · 未标注 ${region.unknown} 条`
    },
    { key: 'date', label: '数据日期', value: asOf || '未标注' }
  ];
}

/**
 * 取第一句（确定性截断：同一条文本任何时候都切在同一处）。
 * 详情页那三行只能是**短事实**，长句留给正文。
 */
function firstSentence(text, max = 90) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  const cut = flat.split(/[。！；;]/)[0] || flat;
  return cut.length > max ? `${cut.slice(0, max - 1)}…` : cut;
}

/**
 * 免费模型详情页的三行事实（`search-intent-v1` · W3）。
 *
 * 这三行回答的是「X 免费模型」这个查询落地后的连续三问：
 *   · 免费到什么程度（0 元？有期限吗？）
 *   · 限制（实名 / 账号 / 绑卡 / 新用户 / 国内可用）
 *   · 怎么开始（一句话的操作路径）
 *
 * 三行**全部来自条目自身的字段**（`pricingModel` / `expiresAt` / `validity` /
 * `eligibilityDetail` / `claimRequirements` / `availability` / `description`），
 * 不含手写文案；字段没写就如实说「官方页未写明」，不替厂商补话。
 */
function freeModelRows(deal) {
  const d = deal || {};
  const detail = d.eligibilityDetail || {};
  const claim = d.claimRequirements || {};
  const availability = d.availability || {};

  const degree = [];
  degree.push(d.pricingModel === 'free' ? '官方标为免费模型，调用 0 元' : '官方标为免费额度');
  if (d.expiresAt) {
    degree.push(`截止 ${String(d.expiresAt).slice(0, 10)}`);
  } else if (d.validity && !/未标注|未注明/.test(String(d.validity))) {
    degree.push(firstSentence(d.validity, 30));
  } else {
    degree.push('未标注截止日期');
  }

  const limits = [];
  if (detail.identityVerificationRequired === true) limits.push('需实名认证');
  else if (detail.identityVerificationRequired === false) limits.push('不需要实名');
  if (claim.accountRequired === true) limits.push('需注册账号');
  if (claim.creditCardRequired === true) limits.push('需绑卡');
  else if (claim.creditCardRequired === false) limits.push('不需要信用卡');
  if (claim.manualApplication === true) limits.push('需提交申请');
  if (detail.newUserOnly === true) limits.push('仅新用户');
  if (availability.chinaUsable === false) limits.push('中国大陆不可直接使用');
  if (!limits.length) limits.push('官方页未写明附加条件');

  return [
    { key: 'degree', label: '免费到什么程度', value: degree.join(' · ') },
    { key: 'limits', label: '限制', value: limits.join(' · ') },
    {
      key: 'start',
      label: '怎么开始',
      value: firstSentence(d.description || d.eligibility, 90) || '打开官方页按页面指引开通'
    }
  ];
}

module.exports = { CALIBER, KEYS, rowsFor, freeModelRows, firstSentence };
