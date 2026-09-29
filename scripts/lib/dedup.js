/**
 * 去重：标题归一化 + 别名表 + 信息量择优合并。
 */

const aliases = require('../data/aliases.json');
const audience = require('./audience');

const ALIASES = Object.fromEntries(
  Object.entries(aliases).filter(([key]) => !key.startsWith('_'))
);

/** 营销后缀：归一化时剥离，避免 "ChatGPT" 与 "ChatGPT / OpenAI" 分裂 */
const NOISE_SUFFIXES = [
  'openai', 'official', 'official site', 'app', 'io', 'inc', 'ltd', 'llc',
  'ai tool', 'ai tools', '官网', '官方', '官方版', '中文版', '网页版'
];

const NOISE_TOKENS = new Set(['ai', 'the', 'a', 'an', 'www', 'com', 'io', 'app']);

/** 归一化标题：小写、仅保留字母数字与汉字 */
function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
    .trim();
}

/** 依次剥离噪声后缀/前缀，得到 key */
function aliasKey(title) {
  let key = normalizeTitle(title);
  if (!key) return '';
  if (ALIASES[key]) return ALIASES[key];

  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of NOISE_SUFFIXES) {
      const norm = normalizeTitle(suffix);
      if (norm && key.length > norm.length + 1 && key.endsWith(norm)) {
        key = key.slice(0, -norm.length);
        changed = true;
      }
    }
  }
  // 去掉首尾的 ai 噪声词
  for (const token of NOISE_TOKENS) {
    if (key.length > token.length + 1 && key.startsWith(token) && ALIASES[key.slice(token.length)]) {
      key = key.slice(token.length);
    }
  }
  return ALIASES[key] || key;
}

/** 信息量打分：优惠 > 工具 > 描述 > 截止日期 > 来源优先级 */
const SOURCE_PRIORITY = {
  Curated: 100,
  'Curated-CN': 100,
  Layer3Labs: 50,
  '智谱AI': 40,
  '智谱AI活动页': 40,
  '火山方舟': 40,
  '深度求索': 40,
  '阿里云百炼': 40,
  '月之暗面': 40,
  '百度千帆': 40,
  'aitools.fyi': 30,
  Futurepedia: 20,
  Futuretools: 10
};

function score(deal) {
  let total = 0;
  if (deal.type === 'deal') total += 50;
  if (deal.discountInfo) total += 25;
  if (deal.verified) total += 20;
  if (deal.expiresAt) total += 8;
  if (deal.description) total += 5;
  if (deal.eligibility) total += 3;
  total += SOURCE_PRIORITY[deal.source] || 0;
  return total;
}

/* ------------------------------------------------------------------ */
/* v1.1：新字段的逐字段可信度仲裁                                        */
/* ------------------------------------------------------------------ */

/**
 * 可信度次序（高 → 低）。`none` = 既没有 provenance、来源也推断不出（旧条目、无来源）。
 * 数值越小越可信；比较用 `rank()`。
 */
const CREDIBILITY_RANK = { editorial: 0, curated: 1, collected: 2, none: 3 };

/** 人工策展来源：其分类结果受信任，可信度也按 curated 起算 */
const CURATED_SOURCES = new Set(['Curated', 'Curated-CN']);

function credibilityRankOf(credibility) {
  return CREDIBILITY_RANK[credibility] === undefined ? CREDIBILITY_RANK.none : CREDIBILITY_RANK[credibility];
}

/**
 * 一条记录的**整条可信度**（契约 §5.2 / §5.2.1 / §5.2.2）。
 *
 * 优先读 `provenance.contrib`（逐字段记账的落点）：整条 = 全部贡献者的**最低档**。
 * 没有 contrib 时退回来源推断：
 *   editorial —— 人工策展来源 **且** 核验过且有日期
 *   curated   —— 人工策展来源（未核验）
 *   collected —— 其余有 source 的
 *   none      —— 连 source 都没有
 *
 * ⚠️ 两处刻意的保守：
 *  ① editorial **要求来源也是策展**：早先只判 `verified && verifiedAt`，于是任意自动采集
 *     条目只要带上这两个字段就被当成「人工核验过」——「已人工对照官方页」是人的声明，
 *     它只能出现在人工维护的来源上（t1 核验实测放行过这条）。
 *  ② 不读 `provenance.credibility` 的声明值：那是书写期的、偏高的那个；用它会**继承并
 *     放大假可信度**（契约 §5.2.1）。逐字段真实来源由 contrib 记账，不在这里猜。
 */
function credibilityOf(deal) {
  if (!deal || typeof deal !== 'object') return 'none';
  const contrib = deal.provenance && deal.provenance.contrib;
  if (contrib && typeof contrib === 'object') {
    const ranks = [];
    for (const list of Object.values(contrib)) {
      const items = Array.isArray(list) ? list : [list];
      for (const item of items) {
        if (CREDIBILITY_RANK[item] !== undefined) ranks.push(CREDIBILITY_RANK[item]);
      }
    }
    if (ranks.length) {
      const lowest = Math.max(...ranks);
      return Object.keys(CREDIBILITY_RANK).find(key => CREDIBILITY_RANK[key] === lowest) || 'none';
    }
  }
  if (CURATED_SOURCES.has(deal.source)) {
    return (deal.verified === true && deal.verifiedAt) ? 'editorial' : 'curated';
  }
  if (deal.source) return 'collected';
  return 'none';
}

/** 单值/三态仲裁：已知胜 unknown；都已知则可信度高者胜；同级保留 winner */
function pickScalar(winnerValue, loserValue, winnerSource, loserSource) {
  const wKnown = winnerValue !== null && winnerValue !== undefined && winnerValue !== audience.TRISTATE_UNKNOWN;
  const lKnown = loserValue !== null && loserValue !== undefined && loserValue !== audience.TRISTATE_UNKNOWN;
  if (!lKnown) return { value: winnerValue, source: wKnown ? winnerSource : null };
  if (!wKnown) return { value: loserValue, source: loserSource };
  if (winnerValue === loserValue) return { value: winnerValue, source: winnerSource };
  // 两侧都已知且冲突：可信度高的胜；同级时 winner 胜（口径 = score() 不变）
  return credibilityRankOf(loserSource) < credibilityRankOf(winnerSource)
    ? { value: loserValue, source: loserSource }
    : { value: winnerValue, source: winnerSource };
}

/**
 * 数组字段：并集。次序 = winner 现存次序 + loser 的新元素（保证合并可重跑且稳定）。
 *
 * `carry` 是**两侧各自带来的历史贡献者**（来自 `provenance.contrib`）：同值相遇时
 * 不能只记当前这一次的来源，否则跨轮的混合来源会被重新标成单一来源 —— 实测过的
 * 后果是「第一轮 correct 的 `editorial` 记账在第二轮消失，一个混源字段被重新当成单源」。
 * 记账必须只增不减，跟值一样。
 */
function pickArray(winnerList, loserList, winnerSource, loserSource, carryWinner, carryLoser) {
  const value = [];
  const sources = new Map();
  const add = (item, source, carry) => {
    const list = carry && carry.get(item) ? [...carry.get(item)] : [];
    if (!list.includes(source)) list.push(source);
    if (value.includes(item)) {
      // 同值（可能来自两侧）：贡献者取并集
      const current = sources.get(item) || [];
      for (const each of list) if (!current.includes(each)) current.push(each);
      sources.set(item, current);
      return;
    }
    value.push(item);
    sources.set(item, list);
  };
  for (const item of Array.isArray(winnerList) ? winnerList : []) add(item, winnerSource, carryWinner);
  for (const item of Array.isArray(loserList) ? loserList : []) add(item, loserSource, carryLoser);
  return { value: value.length ? value : null, sources };
}

/** 对象字段：逐键三态仲裁（carry 同上：两侧的历史贡献者并入该键的记账） */
function pickMap(winnerMap, loserMap, winnerSource, loserSource, carryWinner, carryLoser) {
  const value = {};
  const sources = new Map();
  const w = winnerMap && typeof winnerMap === 'object' ? winnerMap : {};
  const l = loserMap && typeof loserMap === 'object' ? loserMap : {};
  for (const key of new Set([...Object.keys(w), ...Object.keys(l)])) {
    const picked = pickScalar(w[key], l[key], winnerSource, loserSource);
    if (picked.value === null || picked.value === undefined) continue;
    value[key] = picked.value;
    // ⚠️ **只要某一侧提供了值，那一侧就是贡献者** —— 包括「提供了值但在可信度仲裁里输了」
    // 的那一侧。踩过的坑：只记 `picked.source`，于是「collected 提供值、被 curated 顶掉」
    // 这种情况里 collected 的贡献消失，一个真正的**多来源**字段被记成单来源
    // → `fields[field]` 被保留 → 那份出处署了一个它没提供过的值（契约 §5.3.2 的假出处，
    // 正是本阶段要根除的东西）。selftest ④ 的三条断言就是盯这件事的。
    const merged = [];
    if (w[key] !== undefined && carryWinner && carryWinner.get(key)) merged.push(...carryWinner.get(key));
    if (l[key] !== undefined && carryLoser && carryLoser.get(key)) merged.push(...carryLoser.get(key));
    if (w[key] !== undefined) merged.push(winnerSource);
    if (l[key] !== undefined) merged.push(loserSource);
    if (merged.length) sources.set(key, [...new Set(merged)]);
  }
  return { value: Object.keys(value).length ? value : null, sources };
}

/** availability：三态 + 地区限制原文，两者各自记账（carry 同上） */
function pickAvailability(winnerMap, loserMap, winnerSource, loserSource, carryWinner, carryLoser) {
  const w = winnerMap && typeof winnerMap === 'object' ? winnerMap : {};
  const l = loserMap && typeof loserMap === 'object' ? loserMap : {};
  const value = {};
  const sources = new Map();
  const china = pickScalar(w.chinaUsable, l.chinaUsable, winnerSource, loserSource);
  if (china.value !== null && china.value !== undefined) {
    value.chinaUsable = china.value;
    // 同 pickMap：提供了值的每一侧都算贡献者，包括仲裁里输掉的那一侧
    const merged = [
      ...((carryWinner && carryWinner.get('chinaUsable')) || []),
      ...((carryLoser && carryLoser.get('chinaUsable')) || [])
    ];
    if (w.chinaUsable !== undefined) merged.push(winnerSource);
    if (l.chinaUsable !== undefined) merged.push(loserSource);
    if (merged.length) sources.set('chinaUsable', [...new Set(merged)]);
  }
  const wRegion = typeof w.regionRestriction === 'string' ? w.regionRestriction.trim() : '';
  const lRegion = typeof l.regionRestriction === 'string' ? l.regionRestriction.trim() : '';
  const region = wRegion || lRegion;
  if (region) {
    value.regionRestriction = region;
    const merged = [
      ...((carryWinner && carryWinner.get('regionRestriction')) || []),
      ...((carryLoser && carryLoser.get('regionRestriction')) || [])
    ];
    if (wRegion) merged.push(winnerSource);
    if (lRegion) merged.push(loserSource);
    sources.set('regionRestriction', [...new Set(merged)]);
  }
  return { value: Object.keys(value).length ? value : null, sources };
}

/** 从一条记录**已有的** `provenance.contrib` 取某字段（或某键）的历史贡献者 */
function carryOf(deal, field, key) {
  const contrib = deal && deal.provenance && deal.provenance.contrib;
  const list = contrib && contrib[field];
  if (!Array.isArray(list) || !list.length) return null;
  return new Map([[key === undefined ? field : key, list]]);
}

/**
 * 重建 provenance（契约 §5.3.2：**不得为一个它没提供过的值背书**）。
 *
 * 规则只有一条，而且写成了可断言的形式：
 *   `fields[field]` 当且仅当**该字段全部值的贡献者可信度一致**时保留，且
 *   `credibility === 该一致值`；多来源就丢弃这个条目。
 *   顶层 credibility = 所有最终值贡献者的最低档；若最终没有任何 fields 条目 → 整块 provenance 不写。
 *
 * 为什么宁可丢掉出处：一个错的出处比没有出处更糟（v1.0 那 21 页伪造溯源就是
 * 「出处」写得比事实更确定）。丢掉之后页面上不会出现任何溯源声明。
 */
function rebuildProvenance(sides, contrib, mergedValues) {
  // 原样保留书写期的元信息（sourceUrl / verifiedAt），只重建 credibility / fields / contrib
  const source = sides.find(side => side && side.provenance && typeof side.provenance === 'object') || null;
  const base = source ? source.provenance : null;

  const fields = {};
  const ranks = [];
  const contribOut = {};
  for (const field of Object.keys(contrib)) {
    const sources = contrib[field];
    // 注意每个 Map 值是**贡献者的数组**，不是单个可信度 —— 必须摊平再收集。
    // 早先漏了 `concat(...)`，于是 contrib 落成了 `[["editorial"],["collected"]]`：
    // credibilityOf 取值时命不中字面量、静默退回 `collected`（听起来只是保守），
    // 而 validateDeal 会直接报「含非法可信度」—— 一个看不出症状的错记。
    const flat = sources instanceof Map
      ? [].concat(...[...sources.values()].map(item => (Array.isArray(item) ? item : [item])))
      : (Array.isArray(sources) ? [].concat(...sources.map(item => (Array.isArray(item) ? item : [item]))) : []);
    const unique = [...new Set(flat)].filter(item => CREDIBILITY_RANK[item] !== undefined);
    if (!unique.length) continue;
    ranks.push(...unique.map(credibilityRankOf));
    // contrib **无条件**记账（它是审计用的，不是出处声明）：只在单一来源时才顺带保留 fields
    contribOut[field] = unique;
    if (unique.length > 1) continue;
    // ⚠️ `fields` 只能指向**真的有值的**字段（契约 §5.3.2）。
    //
    // 这里原先不看值就写，是一个长期潜伏、只在特定组合下才显形的缺陷：
    // 它要求「两侧之一本来就有 provenance」**且**「合并后某个字段只剩 `unknown`」。
    // 在 v1.1 收口之前，带 provenance 的只有 32 条策展记录，而策展记录的
    // 「只有 unknown 值」那几条早被 t1 核验修掉了 —— 两个条件从没同时成立过。
    //
    // 2026-09-29 一次**真实采集**里同时成立了：收口给 56 条采集侧记录补了 provenance，
    // 其中 4 条的 `availability` 与 5 条的 `eligibilityDetail` 恰好只有 `unknown`
    // （那是「查过、没有证据」的明确记录，属于正常数据）。于是 merge 重建出了
    // `fields.availability` 指向一个只有 unknown 的字段，`assertAllValid` 直接拦下写盘：
    // 11 项错误、采集整体失败。
    //
    // 值得记一笔的是**它是怎么被发现的**：`--dry-run` 当时在 `assertAllValid` 之前就
    // return 了，所以预览一路绿灯，只有真正写盘的那一次才炸。两个缺陷互相掩护。
    if (mergedValues && !audience.hasKnown(mergedValues[field])) continue;
    const entry = base && base.fields && base.fields[field] ? base.fields[field] : { basis: 'source', derived: 'stated' };
    fields[field] = { ...entry };
  }
  if (!ranks.length) return null;

  // 顶层 credibility = 贡献者里**最差**的那一档。
  // ⚠️ 这里的比较方向极易写反（我第一版就写反了）：`CREDIBILITY_RANK` 是「越小越可信」
  // （editorial 0、curated 1、collected 2），所以「最差」= rank 的**最大值**。
  // 写成升序取第一个会得到「最可信的那一档」，于是一条混了采集来源的记录仍然署
  // `curated` —— 正是 §5.2.1 要禁止的假可信度，而且只在**多来源**时才会显形
  // （单来源时两者恰好相等，所以早先的用例全是绿的）。selftest ④ 用两轮合并把它钉住了。
  const worstRank = Math.max(...ranks);
  const lowest = Object.keys(CREDIBILITY_RANK)
    .find(key => key !== 'none' && CREDIBILITY_RANK[key] === worstRank);
  if (!lowest) return null;

  const out = { credibility: lowest };
  if (base && base.sourceUrl) out.sourceUrl = base.sourceUrl;
  if (base && base.verifiedAt) out.verifiedAt = base.verifiedAt;

  // contrib：逐字段的贡献者记账**必须落盘**（契约 §5.2.2）。
  // 不落盘的话，下一次 loadStore 读回来的记录没有记忆，credibilityOf 会退回书写期偏高的
  // 那一档，假可信度就按天被继承并放大 —— 这条修的就是「不落盘等于没做」。
  // 它**无条件**写（多来源时更要写）：它是审计账本，不是出处声明。
  if (Object.keys(contribOut).length) out.contrib = contribOut;
  // fields 则相反：多来源时不写（一个错的出处比没有出处更糟）。空对象非法，所以只在有内容时挂。
  if (Object.keys(fields).length) out.fields = fields;
  return out;
}

/**
 * 六个新字段的逐字段仲裁（契约 §5.1 / §5.3）。
 *
 * 为什么必须独立于 `score()`：实测过一条**会静默毁数据**的路径 ——
 * `score()` 选出的是「信息量最大」的记录，而它可能与「最可信」的记录不是同一条。
 * 复现：采集侧 `{source:'智谱AI', type:'deal', discountInfo, expiresAt}` = 123 分，
 * 策展侧 `{source:'Curated', type:'tool', verified}` = 120 分（策展条目一旦被判成 tool，
 * 就先输掉 50 分，`SOURCE_PRIORITY` 的 100 分追不回来）→ winner 是采集侧，
 * **人工核过的 `availability.chinaUsable=false` 被机器推的 `true` 静默覆盖**，
 * validate 看不出、日志里也没有任何痕迹。
 *
 * 所以：`score()` 继续决定「谁当这张卡的代表」（旧行为不变），而六个新字段的**取值**
 * 由这里按可信度重新仲裁；冲突推进 `stats.conflicts` 供人工复核。
 *
 * @param {object} winner 按 score 选出的胜者（原样写入旧字段）
 * @param {object} loser
 * @param {{conflicts:Array}} [stats] 可选的冲突收集器
 * @returns {object} 需要覆盖到结果上的字段
 */
function mergeAudienceFields(winner, loser, stats) {
  const wSource = credibilityOf(winner);
  const lSource = credibilityOf(loser);
  const out = {};
  const contrib = {};
  const note = (field, detail) => {
    if (!stats) return;
    if (!Array.isArray(stats.conflicts)) stats.conflicts = [];
    stats.conflicts.push({
      title: String(winner.title || loser.title || ''),
      field: field,
      detail: detail,
      winner: { credibility: wSource, value: detail.winnerValue },
      loser: { credibility: lSource, value: detail.loserValue }
    });
  };

  // ① 数组字段：并集
  for (const field of ['audience', 'benefitType']) {
    const picked = pickArray(winner[field], loser[field], wSource, lSource, carryOf(winner, field), carryOf(loser, field));
    if (!picked.value) continue;
    out[field] = picked.value;
    const distinct = [...new Set([].concat(...[...picked.sources.values()]))];
    if (distinct.length > 1) {
      note(field, {
        reason: '并集（两侧各有元素）',
        winnerValue: winner[field] || null,
        loserValue: loser[field] || null
      });
    }
    contrib[field] = picked.sources;
  }

  // ② 三态映射字段：逐键仲裁
  for (const field of ['eligibilityDetail', 'claimRequirements']) {
    const picked = pickMap(winner[field], loser[field], wSource, lSource, carryOf(winner, field), carryOf(loser, field));
    if (!picked.value) continue;
    out[field] = picked.value;
    const conflicts = [];
    for (const [key, source] of picked.sources) {
      const wv = winner[field] && winner[field][key];
      const lv = loser[field] && loser[field][key];
      if (wv !== undefined && lv !== undefined && wv !== lv) {
        conflicts.push({ key, winnerValue: wv, loserValue: lv, source });
      }
    }
    conflicts.forEach(c => note(field, { reason: `按键冲突：${c.key}`, winnerValue: c.winnerValue, loserValue: c.loserValue }));
    contrib[field] = picked.sources;
  }

  // ③ availability：三态 + 地区限制各自记账
  const picked = pickAvailability(winner.availability, loser.availability, wSource, lSource,
    carryOf(winner, 'availability', 'chinaUsable'), carryOf(loser, 'availability', 'chinaUsable'));
  if (picked.value) {
    out.availability = picked.value;
    const wChina = winner.availability && winner.availability.chinaUsable;
    const lChina = loser.availability && loser.availability.chinaUsable;
    if (wChina !== undefined && lChina !== undefined && wChina !== lChina) {
      note('availability', { reason: 'chinaUsable 冲突', winnerValue: wChina, loserValue: lChina });
    }
    contrib.availability = picked.sources;
  }

  // ④ 重建 provenance（可能整块不写）
  //
  // 只有当**至少一侧本来就有 provenance** 时才动它。两侧都没有 provenance 的条目
  // （自动采集、旧条目）合并后**仍然没有** —— 给它们盖一个 `credibility:'collected'`
  // 就等于声称「我们知道这些值的出处」，而事实上我们只知道「值是从哪条记录抄来的」。
  // 契约 §5.3.2 的「provenance 永不凭空生成」说的就是这件事。
  const hadProvenance = Boolean(winner.provenance || loser.provenance);
  if (hadProvenance) {
    // 把**合并后的六字段值**一起传进去：`fields` 只能指向真的有值的字段，
    // 而「有没有值」只有合并后才知道（见 rebuildProvenance 里的实测记录）。
    const rebuilt = rebuildProvenance([winner, loser], contrib, out);
    // 重建不出来（多来源 / 无贡献者）就**明确清掉**，不保留一份无法核对的出处声明
    out.provenance = rebuilt || null;
  }

  return out;
}

/** 合并两条同源记录：保留更全者，补齐缺失字段 */
function merge(a, b, stats) {
  const [winner, loser] = score(a) >= score(b) ? [a, b] : [b, a];
  const merged = { ...winner };
  for (const key of Object.keys(loser)) {
    if (key === 'id') continue;
    if (merged[key] === null || merged[key] === undefined || merged[key] === '') {
      merged[key] = loser[key];
    }
  }
  // 首次出现时间**只许变早**（见下面 merge 里的说明）：这里不做「更早才取」的判断，
  // 而是把两侧都带上，由 merge 统一取更早的那个。
  merged.verified = Boolean(a.verified || b.verified);
  // 核验日期取两侧更晚的非空值：`verified` 现在是「任一为真」，若不把日期一起钉住，
  // 会出现 `verified:true` 而 `verifiedAt` 落空 —— 那是 validateDeal 明确要拦的
  // 假声明形态（v1.0 那 21 页伪造溯源的同族）。
  const verifiedAts = [a.verifiedAt, b.verifiedAt].filter(Boolean).sort();
  merged.verifiedAt = verifiedAts.length ? verifiedAts[verifiedAts.length - 1] : null;

  // ⚠️ `firstSeen` 必须**单调不减地变早**，绝不能变晚。
  //
  // 实测事故（2026-09-29，被 data 成员在 DATA-BACKFILL.md 里抓出来）：32 条策展记录的
  // `firstSeen` 在一次真实 merge 里从 `2026-09-21` 被刷成了当天。根因是策展文件
  // （`scripts/data/curated_*.json`）**不带 `firstSeen`**，于是 `makeDeal` 按 `todayCN()`
  // 盖当天日期；策展侧在 merge 里赢了记录，那个"今天"就成了这条记录的首次收录日期。
  // 后果：**每一轮 merge 都会重置它**，「首次收录」这个字段从此不再表示任何历史；
  // 而 `lib/zh.js` 的译文年龄在账本缺记录时会退回 `firstSeen` 计时，也跟着失真。
  //
  // 修法：两侧都有值时取更早的那个（原实现只在 loser 更早时才覆盖，看似一样，
  // 但没处理「winner 的 firstSeen 是被当天盖出来的」这种情况 —— 取值上其实等价，
  // 真正的病根在 store.js 的 loadCurated 侧，这里同时钉住不变量，防止将来又有人写出
  // 「取更晚」的版本）。
  const firstSeens = [a.firstSeen, b.firstSeen].filter(Boolean).sort();
  merged.firstSeen = firstSeens.length ? firstSeens[0] : null;
  // 最近出现时间取更晚的
  const lastSeens = [a.lastSeen, b.lastSeen].filter(Boolean).sort();
  merged.lastSeen = lastSeens.length ? lastSeens[lastSeens.length - 1] : null;

  // v1.1：六个新字段走独立的可信度仲裁（不依赖 score，见 mergeAudienceFields 的注释）
  Object.assign(merged, mergeAudienceFields(winner, loser, stats));

  return merged;
}

/**
 * 按 id 与标题别名双键去重。
 * @param {object[]} deals
 * @param {{stats?:{conflicts:Array}}} [options] 可选的冲突收集器（不传则完全无副作用）
 * @returns {{deals:object[], mergedCount:number}}
 */
function dedup(deals, options) {
  const byId = new Map();
  const titleIndex = new Map();
  const stats = options && options.stats ? options.stats : null;
  let mergedCount = 0;

  for (const deal of deals) {
    if (!deal) continue;
    const titleKey = aliasKey(deal.title);
    const targetId = byId.has(deal.id) ? deal.id : (titleKey ? titleIndex.get(titleKey) : undefined);

    if (targetId && byId.has(targetId)) {
      const winner = merge(byId.get(targetId), deal, stats);
      if (winner.id !== targetId) byId.delete(targetId);
      byId.set(winner.id, winner);
      if (titleKey) titleIndex.set(titleKey, winner.id);
      titleIndex.set(aliasKey(winner.title), winner.id);
      mergedCount++;
      continue;
    }

    byId.set(deal.id, deal);
    if (titleKey) titleIndex.set(titleKey, deal.id);
  }

  return { deals: [...byId.values()], mergedCount };
}

module.exports = {
  normalizeTitle, aliasKey, score, merge, dedup, SOURCE_PRIORITY,
  CREDIBILITY_RANK, CURATED_SOURCES, credibilityOf, credibilityRankOf,
  mergeAudienceFields, rebuildProvenance
};
