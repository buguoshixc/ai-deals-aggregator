/**
 * 人工策展数据加载：策展文件是可信内容来源（人工核验的官方优惠）。
 */

const fs = require('fs');
const path = require('path');
const { makeDeal, todayCN } = require('./schema');
const { auditAudienceFields } = require('./audience-audit');
const provenance = require('./provenance');

const DATA_DIR = path.join(__dirname, '..', 'data');

const CURATED_FILES = [
  { file: 'curated_cn.json', region: 'cn', source: 'Curated-CN' },
  { file: 'curated_global.json', region: 'global', source: 'Curated' }
];

/**
 * @param {object} opts { dir }
 * @returns {{deals:object[], report:Array, audienceDropped:Array}}
 *   `audienceDropped` 是 v1.1 的新出口：策展文件里「声明了却归一后消失」的新字段位置。
 *   它不是「构造失败」（那是 `dropped`），而是**构造成功但内容被静默清洗掉**——
 *   一个拼错的枚举值会让那条记录看起来像「本来就没写」，页面上少一行而没人知道。
 *   调用方必须把它当**错误**看待（`validate.js checkCurated` 就是这么做的），
 *   否则手写数据里的错字永远不会有人发现。
 */
function loadCurated({ dir = DATA_DIR } = {}) {
  const deals = [];
  const report = [];
  const audienceDropped = [];
  const evidenceDropped = [];

  for (const spec of CURATED_FILES) {
    const full = path.join(dir, spec.file);
    if (!fs.existsSync(full)) {
      report.push({ file: spec.file, total: 0, ok: 0, dropped: [], audienceDropped: [], evidenceDropped: [], missing: true });
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
    const fileAudienceDropped = [];
    const fileEvidenceDropped = [];
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
      // 归一之后立刻对账：raw 声明了实质内容、而归一结果里没有 → 报出来。
      // 放在这里而不是调用方，是因为只有这里同时握着 raw 与 deal。
      const audit = auditAudienceFields(raw, deal);
      audit.dropped.forEach(item => {
        const entry = {
          file: spec.file,
          index,
          title: deal.title || raw.title || '(无标题)',
          field: item.field,
          ...(item.key ? { key: item.key } : {}),
          reason: item.reason
        };
        fileAudienceDropped.push(entry);
        audienceDropped.push(entry);
      });
      // v1.3：声明了官方引文、而归一之后不见了 —— 与六字段同一条理由：
      // 校验器只看得到归一之后的世界，写坏的字只在这里能对上账。
      provenance.auditEvidence(raw.evidence, deal.evidence, { today: todayCN() }).forEach(item => {
        const entry = {
          file: spec.file,
          index,
          title: deal.title || raw.title || '(无标题)',
          reason: item.reason
        };
        fileEvidenceDropped.push(entry);
        evidenceDropped.push(entry);
      });
      deal.verified = raw.verified === true;
      deals.push(deal);
      ok++;
    });

    report.push({
      file: spec.file,
      total: list.length,
      ok,
      dropped,
      audienceDropped: fileAudienceDropped,
      evidenceDropped: fileEvidenceDropped,
      missing: false
    });
  }

  return { deals, report, audienceDropped, evidenceDropped };
}

module.exports = { loadCurated, CURATED_FILES, DATA_DIR };
