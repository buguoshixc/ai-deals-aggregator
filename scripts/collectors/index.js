/**
 * 采集器注册表。
 *
 * 规则：只注册**实测有产出**的来源。零产出的采集器不上线（避免"代码在跑但没数据"的假象）。
 *
 * 无头浏览器来源（collectors/headless.js）按需加载：默认路径（含 CI）完全不 require
 * playwright-core，只有 `collect.js --headless` 才会把它并进来。
 */

const globalDirectories = require('./global_directories');
const globalDeals = require('./global_deals');
const cnDocs = require('./cn_docs');

const BASE = [...cnDocs, ...globalDeals, ...globalDirectories];

/** 惰性加载无头来源：缺 playwright-core 时给出可读错误，而不是把默认链路拖崩 */
function loadHeadless() {
  try {
    return require('./headless');
  } catch (error) {
    const wrapped = new Error(`无头采集器不可用（需要 playwright-core 与本机浏览器内核）: ${error.message}`);
    wrapped.code = 'HEADLESS_UNAVAILABLE';
    throw wrapped;
  }
}

function all(options = {}) {
  return options.headless ? [...BASE, ...loadHeadless()] : BASE;
}

/** 按 id 取采集器；ids 为空时返回全部 */
function select(ids = [], options = {}) {
  const available = all(options);
  if (!ids.length) return { picked: available, missing: [] };
  const wanted = new Set(ids);
  const picked = available.filter(c => wanted.has(c.id));
  const missing = [...wanted].filter(id => !available.some(c => c.id === id));
  return { picked, missing };
}

function list(options = {}) {
  return all(options).map(c => ({
    id: c.id,
    name: c.name,
    region: c.region,
    headless: c.headless === true
  }));
}

module.exports = { BASE, all, select, list };
