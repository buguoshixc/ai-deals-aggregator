/**
 * `scripts/data/audience-overrides.json` —— 六字段的**第二个人工来源**。
 *
 * ## 这个文件解决的问题
 *
 * `deals.json` 里曾有一批值**只存在于它自己**：采集器不产出六字段（`makeDeal` 生成 0/6），
 * 人工策展文件里也没有它们。实测（`scripts/tools/check-reproducible.js`）：
 * 56 条采集侧条目、203 个值，把六字段剥掉重放一轮 merge，**一个都产不出来**。
 *
 * 后果不是「值错了」（值是对的），而是**「这个值是谁说的」不可回答**：
 * 任何一次手工编辑都不进版本历史、不进 diff、不可追溯，而 `provenance` 按设计单调退化
 * 且永不回春 —— 一次手工写入会被下一轮 merge 原样继承下去，错误也一起继承。
 *
 * ## 为什么不是「把它们塞进 curated_*.json」
 *
 * 那会让这些记录**变成策展条目**：`source` 变 `Curated`、`score()` 的 SOURCE_PRIORITY 抬高、
 * 整条记录的可信度变成 curated，卡片上的来源标签也跟着换 —— 而它们事实上是采集来的条目，
 * 只是**六个字段**由人补的。改动一个字段的来源不该改一条记录的身份。
 *
 * 所以这里走**逐字段注入**：记录保持原样，只把那六个字段 + 一份逐字段出处记在它身上。
 *
 * ## 为什么是「注入」而不是「当作第三方记录参与 merge」
 *
 * 试过、会坏：合成记录一旦在 `dedup.merge` 里按 `score()` 胜出，`merged = {...winner}`
 * 就把它当成了整条记录的代表 —— `source` 会变成 `Curated`（非空，所以 loser 的真实来源
 * 填不进来）、`discountInfo` 等字段全被顶掉。契约 §5.3 特意把「谁当代表」与「六字段取值」
 * 拆开，就是为了不让这件事发生。
 */

const fs = require('fs');
const path = require('path');

const audience = require('./audience');
const { AUDIENCE_FIELD_ORDER, MAX_PROVENANCE_NOTE_LENGTH } = require('./schema');
const { CREDIBILITY_RANK } = require('./dedup');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OVERRIDES_FILE = path.join(DATA_DIR, 'audience-overrides.json');

/** 本文件的来源档位。人工读官方页写下、带引文，但**没有**人工回访核验 → curated 而不是 editorial */
const OVERRIDE_CREDIBILITY = 'curated';

/** 字段写了（含 `{chinaUsable:'unknown'}` 这种「明确查过、没有证据」）*/
const present = value => value !== undefined && value !== null;

/**
 * 读取并归一 overrides。
 *
 * @returns {{byId:Map<string,object>, entries:object[], report:object}}
 *   `report.invalid` 非空即表示**文件里有写坏的东西被丢弃**——调用方必须当错误处理，
 *   否则一个拼错的枚举值会让那条记录看起来「本来就没写」，页面上少一行而没人知道
 *   （与 `loadCurated` 的 `audienceDropped` 同一把尺子）。
 */
function loadOverrides({ file = OVERRIDES_FILE } = {}) {
  const report = { file: path.relative(path.join(__dirname, '..', '..'), file), missing: false, total: 0, ok: 0, invalid: [] };
  if (!fs.existsSync(file)) {
    report.missing = true;
    return { byId: new Map(), entries: [], report };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`${report.file} JSON 解析失败: ${error.message}`);
  }
  const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.entries) ? parsed.entries : null;
  if (!list) throw new Error(`${report.file} 必须是数组或含 entries 数组的对象`);
  report.total = list.length;

  const byId = new Map();
  const entries = [];
  list.forEach((raw, index) => {
    const where = `${report.file}[${index}]`;
    if (!raw || typeof raw !== 'object') {
      report.invalid.push({ index, reason: '不是对象' });
      return;
    }
    if (!/^[0-9a-f]{12}$/.test(String(raw.id || ''))) {
      report.invalid.push({ index, title: raw.title, reason: `id 非法(${raw.id})——必须是 12 位十六进制，与 deals.json 的 id 同一出处` });
      return;
    }
    if (byId.has(raw.id)) {
      report.invalid.push({ index, title: raw.title, id: raw.id, reason: 'id 重复' });
      return;
    }

    // 逐字段归一到与 deals.json 同一套语义（否则 overrides 会成为一条绕过归一的后门）
    const fields = {};
    for (const field of AUDIENCE_FIELD_ORDER) {
      if (!present(raw[field])) continue;
      const normalized = normalizeField(field, raw[field]);
      if (!present(normalized)) {
        report.invalid.push({ index, title: raw.title, id: raw.id, field, reason: `归一后为空（声明了 ${JSON.stringify(raw[field])}）` });
        continue;
      }
      fields[field] = normalized;
    }
    if (!Object.keys(fields).length) {
      report.invalid.push({ index, title: raw.title, id: raw.id, reason: '没有任何六字段内容' });
      return;
    }

    const inferredFields = Array.isArray(raw.inferredFields) ? raw.inferredFields.filter(f => AUDIENCE_FIELD_ORDER.includes(f)) : [];
    const evidence = typeof raw.evidence === 'string' ? raw.evidence.trim() : '';
    if (!evidence) report.invalid.push({ index, title: raw.title, id: raw.id, reason: '没有依据引文 —— 值没有可核的推理链' });

    const entry = {
      id: raw.id,
      title: typeof raw.title === 'string' ? raw.title : '',
      fields,
      inferredFields,
      evidence,
      ...(typeof raw.sourceUrl === 'string' && raw.sourceUrl ? { sourceUrl: raw.sourceUrl } : {})
    };
    byId.set(entry.id, entry);
    entries.push(entry);
    report.ok++;
  });

  return { byId, entries, report };
}

/** 与 schema.attachAudienceFields 用的是同一组归一函数 —— 单一出处 */
function normalizeField(field, value) {
  switch (field) {
    case 'audience': return audience.normalizeEnumList(value, audience.AUDIENCES);
    case 'benefitType': return audience.normalizeEnumList(value, audience.BENEFIT_TYPES);
    case 'eligibilityDetail': return audience.normalizeTristateMap(value, audience.ELIGIBILITY_KEYS);
    case 'claimRequirements': return audience.normalizeTristateMap(value, audience.CLAIM_KEYS);
    case 'availability': return audience.normalizeAvailability(value);
    default: return null;
  }
}

/** 贡献者按「只增不减」并集（契约 §5.3.3：记账单调，永不回春） */
function unionContributors(existing, add) {
  const list = Array.isArray(existing) ? [...existing] : [];
  for (const item of add) if (!list.includes(item)) list.push(item);
  return list;
}

/**
 * 把一条 overrides 条目注入一条记录。
 *
 * 关键约束：**contrib 只增不减**。第二轮采集时既有记录身上已经带着上一轮的 `contrib`，
 * 如果这里直接覆盖成 `['curated']`，采集侧真的提供了某个值的那份记账就没了 ——
 * 那正是 §5.2.2 要禁止的「不落盘等于没做」的反面：**落盘了又被抹掉**。
 */
function applyOverride(deal, entry) {
  const next = { ...deal };
  const previous = deal.provenance && typeof deal.provenance === 'object' ? deal.provenance : null;
  const prevContrib = previous && previous.contrib && typeof previous.contrib === 'object' ? previous.contrib : {};
  const prevFields = previous && previous.fields && typeof previous.fields === 'object' ? previous.fields : {};

  const contrib = {};
  for (const [field, list] of Object.entries(prevContrib)) contrib[field] = [...list];

  const fields = {};
  for (const [field, raw] of Object.entries(prevFields)) fields[field] = { ...raw };

  for (const field of AUDIENCE_FIELD_ORDER) {
    if (!present(entry.fields[field])) continue;
    next[field] = entry.fields[field];
    contrib[field] = unionContributors(contrib[field], [OVERRIDE_CREDIBILITY]);
    // `fields` 只对**真的有值**的字段写：validateDeal 会拦「出处指向一个没有值的字段」。
    // `{chinaUsable:'unknown'}` 属于「没有已知值」，于是它进 contrib 但不进 fields ——
    // 出处声明宁缺毋假（§5.3.2）。
    if (!audience.hasKnown(entry.fields[field])) continue;
    const inferred = entry.inferredFields.includes(field);
    fields[field] = {
      basis: 'source',
      derived: inferred ? 'inferred' : 'stated',
      // 声明为推断就必须带推理链（validateDeal 硬拦）。引文截到上限内。
      ...(inferred && entry.evidence ? { note: audience.truncate(entry.evidence, MAX_PROVENANCE_NOTE_LENGTH) } : {})
    };
  }

  // 顶层 credibility = 全部贡献者的**最低档**（与 rebuildProvenance 同一条规则，方向同样易写反）
  const ranks = [];
  for (const list of Object.values(contrib)) {
    for (const item of list) {
      if (CREDIBILITY_RANK[item] !== undefined) ranks.push(CREDIBILITY_RANK[item]);
    }
  }
  const worst = ranks.length ? Math.max(...ranks) : null;
  const credibility = worst === null
    ? OVERRIDE_CREDIBILITY
    : Object.keys(CREDIBILITY_RANK).find(k => k !== 'none' && CREDIBILITY_RANK[k] === worst) || OVERRIDE_CREDIBILITY;

  const provenance = { credibility };
  const sourceUrl = (previous && previous.sourceUrl) || entry.sourceUrl;
  if (sourceUrl) provenance.sourceUrl = sourceUrl;
  if (previous && previous.verifiedAt) provenance.verifiedAt = previous.verifiedAt;
  if (Object.keys(contrib).length) provenance.contrib = contrib;
  if (Object.keys(fields).length) provenance.fields = fields;

  next.provenance = Object.keys(contrib).length ? provenance : null;
  return next;
}

/**
 * 批量注入。未命中 overrides 的记录**原样返回**（不是拷贝后丢信息）。
 *
 * @param {object[]} deals
 * @param {Map<string,object>} byId
 * @param {{applied:number, conflicts:Array}} [stats]
 */
function applyOverrides(deals, byId, stats) {
  if (!byId || !byId.size) return deals;
  return deals.map(deal => {
    const entry = deal && byId.get(deal.id);
    if (!entry) return deal;
    if (stats) {
      stats.applied++;
      for (const field of AUDIENCE_FIELD_ORDER) {
        if (!present(entry.fields[field])) continue;
        const before = deal[field];
        if (present(before) && JSON.stringify(before) !== JSON.stringify(entry.fields[field])) {
          stats.conflicts.push({
            title: deal.title,
            field,
            inFile: before,
            inOverrides: entry.fields[field]
          });
        }
      }
    }
    return applyOverride(deal, entry);
  });
}

module.exports = {
  OVERRIDES_FILE,
  OVERRIDE_CREDIBILITY,
  loadOverrides,
  applyOverride,
  applyOverrides,
  normalizeField
};
