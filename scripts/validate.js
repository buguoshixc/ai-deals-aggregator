#!/usr/bin/env node
/**
 * 数据门禁：校验 deals.json 与策展数据。
 * 零外部依赖（不 require axios/cheerio），因此 CI 中无需 npm install 即可运行。
 *
 * 用法：
 *   node scripts/validate.js             # 完整性校验（部署门禁）
 *   node scripts/validate.js --strict    # 额外校验数量指标（内容质量门禁）
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { validateDeal, cleanText, isGarbage, SCHEMA_VERSION } = require('./lib/schema');
const { CATEGORIES } = require('./lib/categories');

const ROOT = path.join(__dirname, '..');
const DEALS_FILE = path.join(ROOT, 'deals.json');
const INDEX_FILE = path.join(ROOT, 'index.html');
const CURATED_FILES = [
  path.join(__dirname, 'data', 'curated_cn.json'),
  path.join(__dirname, 'data', 'curated_global.json')
];

const AGGREGATOR_HOSTS = ['layer3labs.io', 'futuretools.io', 'futurepedia.io', 'aitools.fyi'];

const errors = [];
const warnings = [];

function error(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(file, label) {
  if (!fs.existsSync(file)) {
    error(`${label} 不存在: ${path.relative(ROOT, file)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    error(`${label} JSON 解析失败: ${e.message}`);
    return null;
  }
}

/* ---------------- deals.json ---------------- */

function checkDealsFile() {
  const store = readJson(DEALS_FILE, 'deals.json');
  if (!store) return { deals: [] };

  if (Array.isArray(store)) {
    error('deals.json 仍是 v1 裸数组格式，请运行 `npm run migrate`');
    return { deals: [] };
  }

  if (store.schemaVersion !== SCHEMA_VERSION) {
    error(`deals.json schemaVersion 应为 ${SCHEMA_VERSION}，实际 ${store.schemaVersion}`);
  }
  if (!store.updatedAt || Number.isNaN(Date.parse(store.updatedAt))) {
    error('deals.json updatedAt 缺失或非法');
  }
  if (typeof store.count !== 'number') error('deals.json count 缺失');
  if (!Array.isArray(store.deals)) {
    error('deals.json deals 必须是数组');
    return { deals: [] };
  }
  if (store.count !== store.deals.length) {
    error(`deals.json count(${store.count}) 与 deals 长度(${store.deals.length}) 不一致`);
  }

  const ids = new Set();
  const titleKeys = new Set();
  let dealCount = 0;
  let cnCount = 0;
  let withExpiry = 0;
  let withValidity = 0;
  let verified = 0;

  store.deals.forEach((deal, index) => {
    const result = validateDeal(deal, index);
    if (!result.ok) result.errors.forEach(error);

    if (ids.has(deal.id)) error(`deals.json 重复 id: ${deal.id}（${deal.title}）`);
    ids.add(deal.id);

    const titleKey = cleanText(deal.title, 150).toLowerCase();
    if (titleKeys.has(titleKey)) warn(`可能存在重复标题: ${deal.title}`);
    titleKeys.add(titleKey);

    if (deal.type === 'deal') dealCount++;
    if (deal.region === 'cn') cnCount++;
    if (deal.expiresAt) withExpiry++;
    if (deal.validity) withValidity++;
    if (deal.verified) verified++;

    const host = hostOf(deal.url);
    if (host && AGGREGATOR_HOSTS.some(h => host.endsWith(h))) {
      warn(`落地页仍指向聚合站（建议换官方页 + sourceUrl 署名）: ${deal.title} → ${deal.url}`);
    }
  });

  const stats = {
    total: store.deals.length,
    deals: dealCount,
    cn: cnCount,
    global: store.deals.length - cnCount,
    withExpiry,
    withValidity,
    withTimeInfo: withExpiry + withValidity,
    verified,
    withFeatures: store.deals.filter(d => Array.isArray(d.features) && d.features.length).length,
    withPriceLine: store.deals.filter(d => d.priceLine).length,
    trustedMissingFeatures: store.deals.filter(d => d.verified && !(Array.isArray(d.features) && d.features.length)).length
  };

  checkCoverage(store.deals);
  checkSuspectedDuplicates(store.deals);
  return { stats };
}

/** 疑似重复：同一地区下，一条的归一化标题是另一条的前缀（说明别名表漏登记） */
function checkSuspectedDuplicates(deals) {
  const norm = title => String(title || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
  const items = deals.map(deal => ({ key: norm(deal.title), deal })).filter(x => x.key.length >= 4);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.deal.region !== b.deal.region) continue;
      if (a.key === b.key) continue;
      const [short, long] = a.key.length <= b.key.length ? [a, b] : [b, a];
      if (long.key.startsWith(short.key)) {
        warn(`疑似同一优惠未合并：${short.deal.title} ↔ ${long.deal.title}（可在 scripts/data/aliases.json 登记别名）`);
      }
    }
  }
}

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch (e) {
    return null;
  }
}

/** 分类覆盖度：枚举必须都能被命中，否则说明映射表失效 */
function checkCoverage(deals) {
  const used = new Set(deals.map(d => d.category));
  const unused = CATEGORIES.filter(c => !used.has(c));
  if (deals.length > 20 && unused.length > 6) {
    warn(`分类枚举覆盖偏低，未使用: ${unused.join('、')}`);
  }
}

/* ---------------- 策展数据 ---------------- */

function checkCurated() {
  let total = 0;
  for (const file of CURATED_FILES) {
    if (!fs.existsSync(file)) {
      warn(`策展文件缺失（可选）: ${path.relative(ROOT, file)}`);
      continue;
    }
    const list = readJson(file, path.basename(file));
    if (!Array.isArray(list)) {
      error(`${path.basename(file)} 必须是数组`);
      continue;
    }
    list.forEach((raw, index) => {
      // 策展文件允许"人写的原始字段"，但必须能通过 makeDeal 生成合规记录
      const { makeDeal } = require('./lib/schema');
      const isCN = file.includes('curated_cn');
      const deal = makeDeal(raw, {
        source: raw.source || (isCN ? 'Curated-CN' : 'Curated'),
        region: raw.region || (isCN ? 'cn' : 'global'),
        sourceUrl: raw.sourceUrl
      });
      if (!deal) {
        error(`${path.basename(file)}[${index}] 无法构造合规记录: ${raw.title || '(无标题)'}`);
        return;
      }
      const result = validateDeal(deal, index);
      if (!result.ok) {
        result.errors.forEach(e => error(`${path.basename(file)}: ${e}`));
      }
      if (isCN && deal.region !== 'cn') error(`${path.basename(file)}[${index}] 国内策展数据 region 必须是 cn`);
      total++;
    });
  }
  return { curated: total };
}

/* ---------------- 前端 ---------------- */

function checkIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    error('index.html 不存在');
    return;
  }
  const html = fs.readFileSync(INDEX_FILE, 'utf8');
  if (!/deals\.json/.test(html)) error('index.html 未引用 deals.json');
  if (!/payload\.deals/.test(html) && !/schemaVersion/.test(html)) {
    warn('index.html 似乎没有按 v2 结构（payload.deals）读取数据');
  }

  // 预渲染标记：删掉它们会让 SEO 静态骨架静默失效（构建期才会报错），这里提前告警
  for (const marker of [
    '<!--PRERENDER:deals-->', '<!--PRERENDER:facets-->', '<!--PRERENDER:topstat-->',
    '<!--PRERENDER:stats-->', '<!--PRERENDER:categories-->', '<!--PRERENDER:jsonld-->'
  ]) {
    if (!html.includes(marker)) {
      warn(`index.html 缺少预渲染标记 ${marker}（会让构建期静态骨架失效）`);
    }
  }
  if (!/RENDER-CORE:START/.test(html) || !/RENDER-CORE:END/.test(html)) {
    warn('index.html 缺少 RENDER-CORE 标记区块（构建期无法抽取渲染核心）');
  }
  if (!/logos\.css/.test(html)) {
    warn('index.html 未引用 logos.css（厂商 logo 不会显示）');
  }
  if (!/__SITE_URL__/.test(html) && !/rel="canonical"/.test(html)) {
    warn('index.html 缺少 canonical 或 __SITE_URL__ 占位');
  }

  // 内联脚本语法校验（能抓出拼写/括号类低级错误）
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  if (!scripts.length) {
    warn('index.html 未找到内联脚本');
    return;
  }
  for (const [index, source] of scripts.entries()) {
    try {
      new vm.Script(source, { filename: `index.html#script[${index}]` });
    } catch (e) {
      error(`index.html 内联脚本第 ${index + 1} 段语法错误: ${e.message}`);
    }
  }

  if (!/rel="canonical"|og:title/.test(html)) warn('index.html 缺少 SEO meta（og:title 等）');
}

/* ---------------- 主流程 ---------------- */

function main() {
  const strict = process.argv.includes('--strict');
  const { stats } = checkDealsFile();
  const curatedStats = checkCurated();
  checkIndex();

  console.log('=== 数据校验 ===');
  if (stats) {
    console.log(`总条数        : ${stats.total}`);
    console.log(`真实优惠      : ${stats.deals}`);
    console.log(`国内 / 国外   : ${stats.cn} / ${stats.global}`);
    console.log(`含截止时间    : ${stats.withExpiry}`);
    console.log(`含有效期说明  : ${stats.withValidity}（合计时间信息 ${stats.withTimeInfo}）`);
    console.log(`人工核验      : ${stats.verified}`);
    console.log(`卡片特性标签  : ${stats.withFeatures} 条`);
    console.log(`价格阶梯      : ${stats.withPriceLine} 条`);
  }
  console.log(`策展数据      : ${curatedStats.curated} 条`);

  // 覆盖率提示：人工核验过却还没有特性标签的条目，是最值得优先补齐的（卡片会退化成纯文字块）
  if (stats && stats.trustedMissingFeatures > 0) {
    warn(`有 ${stats.trustedMissingFeatures} 条已核验条目缺少 features 标签，卡片将退化为纯 discountInfo 展示`);
  }

  if (strict && stats) {
    if (stats.deals < 40) error(`[strict] 真实优惠 ${stats.deals} 条 < 40`);
    if (stats.cn < 20) error(`[strict] 国内条目 ${stats.cn} 条 < 20`);
    // 总条数门槛刻意设为 100 而非更高的数字：注册表里只有 7 个实测有产出的来源，
    // 再往上只能靠堆目录站的"工具介绍"条目凑数，那正是本项目要修掉的问题。
    if (stats.total < 100) error(`[strict] 总条数 ${stats.total} < 100`);
    if (stats.withTimeInfo < stats.deals * 0.6) {
      error(`[strict] 带时间信息（截止日期或有效期说明）的优惠 ${stats.withTimeInfo} 条 < 60% 的 ${stats.deals} 条`);
    }
  }

  if (warnings.length) {
    console.log(`\n⚠️  警告 ${warnings.length} 条：`);
    warnings.slice(0, 30).forEach(w => console.log(`  - ${w}`));
    if (warnings.length > 30) console.log(`  ...（其余 ${warnings.length - 30} 条省略）`);
  }

  if (errors.length) {
    console.error(`\n❌ 校验失败，共 ${errors.length} 项：`);
    errors.slice(0, 40).forEach(e => console.error(`  - ${e}`));
    if (errors.length > 40) console.error(`  ...（其余 ${errors.length - 40} 项省略）`);
    process.exit(1);
  }

  console.log(`\n✅ 校验通过${strict ? '（strict 模式）' : ''}`);
}

main();
