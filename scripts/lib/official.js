/**
 * 官方落地页解析：聚合站来源的条目，尽量把"查看"落到厂商官方页。
 */

const officialUrls = require('../data/official_urls.json');
const { aliasKey } = require('./dedup');

const MAP = Object.fromEntries(Object.entries(officialUrls).filter(([k]) => !k.startsWith('_')));

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

module.exports = { resolveOfficialUrl, OFFICIAL_URL_MAP: MAP };
