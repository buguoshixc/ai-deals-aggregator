/**
 * 采集器注册表。
 *
 * 规则：只注册**实测有产出**的来源。零产出的采集器不上线（避免"代码在跑但没数据"的假象）。
 */

const globalDirectories = require('./global_directories');
const globalDeals = require('./global_deals');
const cnDocs = require('./cn_docs');

const ALL = [...cnDocs, ...globalDeals, ...globalDirectories];

/** 按 id 取采集器；ids 为空时返回全部 */
function select(ids = []) {
  if (!ids.length) return { picked: ALL, missing: [] };
  const wanted = new Set(ids);
  const picked = ALL.filter(c => wanted.has(c.id));
  const missing = [...wanted].filter(id => !ALL.some(c => c.id === id));
  return { picked, missing };
}

module.exports = { ALL, select, list: () => ALL.map(c => ({ id: c.id, name: c.name, region: c.region })) };
