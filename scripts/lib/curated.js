/**
 * 人工策展数据加载：策展文件是可信内容来源（人工核验的官方优惠）。
 */

const fs = require('fs');
const path = require('path');
const { makeDeal } = require('./schema');

const DATA_DIR = path.join(__dirname, '..', 'data');

const CURATED_FILES = [
  { file: 'curated_cn.json', region: 'cn', source: 'Curated-CN' },
  { file: 'curated_global.json', region: 'global', source: 'Curated' }
];

/**
 * @param {object} opts { dir }
 * @returns {{deals:object[], report:Array}}
 */
function loadCurated({ dir = DATA_DIR } = {}) {
  const deals = [];
  const report = [];

  for (const spec of CURATED_FILES) {
    const full = path.join(dir, spec.file);
    if (!fs.existsSync(full)) {
      report.push({ file: spec.file, total: 0, ok: 0, dropped: [], missing: true });
      continue;
    }

    let list;
    try {
      list = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (error) {
      throw new Error(`${spec.file} JSON 解析失败: ${error.message}`);
    }
    if (!Array.isArray(list)) throw new Error(`${spec.file} 必须是数组`);

    const dropped = [];
    let ok = 0;
    list.forEach((raw, index) => {
      const deal = makeDeal(raw, {
        source: raw.source || spec.source,
        region: raw.region || spec.region,
        sourceUrl: raw.sourceUrl,
        // 人工策展是可信来源：允许显式指定 type
        trustType: true
      });
      if (!deal) {
        dropped.push({ index, title: raw.title || '(无标题)', reason: '无法构造合规记录（标题/URL 不合法）' });
        return;
      }
      // 策展数据默认视为已核验（人工维护，且在 validate 中二次校验）
      if (deal.type === 'tool' && raw.type === 'deal') {
        dropped.push({ index, title: deal.title, reason: '标记为 deal 但缺少有效优惠文案' });
        return;
      }
      deal.verified = raw.verified === true;
      deals.push(deal);
      ok++;
    });

    report.push({ file: spec.file, total: list.length, ok, dropped, missing: false });
  }

  return { deals, report };
}

module.exports = { loadCurated, CURATED_FILES, DATA_DIR };
