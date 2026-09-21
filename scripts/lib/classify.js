/**
 * 归类工具：地区、有效期抽取。
 * 地区绝不由描述文字猜测，只由"来源"决定。
 */

const { normalizeDate, cleanText } = require('./schema');

/** 采集器 id / 来源名 → 地区 */
const SOURCE_REGIONS = {
  // 国内
  'curated-cn': 'cn',
  cn_deepseek: 'cn',
  cn_zhipu: 'cn',
  cn_aliyun: 'cn',
  cn_moonshot: 'cn',
  cn_qianfan: 'cn',
  '智谱AI': 'cn',
  '深度求索': 'cn',
  '阿里云百炼': 'cn',
  '月之暗面': 'cn',
  '百度千帆': 'cn',
  '火山引擎': 'cn',
  '腾讯混元': 'cn',
  '讯飞星火': 'cn',
  'MiniMax': 'cn',
  '硅基流动': 'cn',
  '魔搭社区': 'cn',
  '商汤科技': 'cn',
  // 国外
  curated_global: 'global',
  'curated-global': 'global',
  aitools: 'global',
  futurepedia: 'global',
  futuretools: 'global',
  layer3labs: 'global',
  appsumo: 'global',
  'aitools.fyi': 'global',
  Futurepedia: 'global',
  Futuretools: 'global',
  Layer3Labs: 'global',
  AppSumo: 'global'
};

function inferRegion(sourceId, fallback = 'global') {
  if (!sourceId) return fallback;
  const key = String(sourceId).toLowerCase();
  if (SOURCE_REGIONS[sourceId]) return SOURCE_REGIONS[sourceId];
  if (SOURCE_REGIONS[key]) return SOURCE_REGIONS[key];
  return fallback;
}

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

/**
 * 从一段文案中抽取截止日期。
 * 只认明确年份的写法，避免把"3 天试用"误判成日期。
 */
function extractExpiry(text, { today = null } = {}) {
  const raw = cleanText(text, 600);
  if (!raw) return null;

  let m = raw.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
  if (m) return normalizeDate(`${m[1]}-${m[2]}-${m[3]}`);

  m = raw.match(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i);
  if (m) return normalizeDate(`${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1]}`);

  m = raw.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (m) return normalizeDate(`${m[3]}-${MONTHS[m[1].toLowerCase()]}-${m[2]}`);

  m = raw.match(/valid (?:through|until|till)\s+(\d{4})-(\d{1,2})-(\d{1,2})/i);
  if (m) return normalizeDate(`${m[1]}-${m[2]}-${m[3]}`);

  if (today && /长期有效|永久有效|ongoing|no expiration|always available/i.test(raw)) {
    return null;
  }
  return null;
}

/** "长期有效"标注（前端展示用，不占用 expiresAt） */
function isOngoing(text) {
  return /长期有效|永久有效|ongoing|no expiration|always available|长期/.test(cleanText(text, 400));
}

module.exports = { SOURCE_REGIONS, inferRegion, extractExpiry, isOngoing };
