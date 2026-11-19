'use strict';
/**
 * 展示层的「页面预算」适配层（issue #150 的结构性修复）。
 *
 * ## 为什么需要这一层
 *
 * 数据契约允许一条逐字采集的标题长到 150 字符（`schema.js` 的 `MAX_TITLE_LENGTH`），
 * 而搜索结果与 `<title>` 的硬上限只有 80（`seo.js` 的 `TITLE_MAX_LENGTH`）。两把尺子
 * 中间原本没有桥：每个拼接点自己拼后缀、自己截断（或干脆不截），于是「合法数据」可以
 * 让产物门禁红、让发布停版 —— 2026-11-18/19 的 68 字符 RSS 线索归档后正是这样把
 * `<title>` 顶到 86 字符（issue #150）。
 *
 * 这一层把「按预算适配」变成**一个纯函数**：调用方给原文、后缀与预留量，它负责
 * 截断、留痕、以及截断之后的重名消歧。渲染器拥有后缀，就拥有适配 —— 谁拼后缀，
 * 谁必须经过这里。
 *
 * ## 刻意不做的事
 *
 *   · 不改写逐字数据：只影响 `<title>` / meta description 这两个**展示预算**字段；
 *     h1、正文、JSON-LD、og 仍然拿完整标题（社交卡片没有长度门禁，截断是搜索结果的
 *     预算，不是内容改写）。
 *   · 不把 80 与 150 合成一个数：那是「为了 SEO 改写采集数据」，红线。
 *   · 不做 HTML 转义：转义是渲染器的职责；`seo.js` 的解析器会把实体解回原文，
 *     所以预算必须按**原文**算，而不是按转义后的字节算。
 */

const { TITLE_MAX_LENGTH } = require('./seo');

/**
 * meta description 的展示预算（**唯一出处**，从 build-local 的内联 slice 搬来）。
 *
 * 它比 `<title>` 宽，因为描述本来就是一句话而不是导航标签；150 是既有的产品口径，
 * 本次只把它收进适配层，不借机调整。
 */
const DESC_MAX_LENGTH = 150;

/** 截断留痕：读者与维护者都能看出「这里被预算切过」，而不是数据本身少了一截。 */
const ELLIPSIS = '…';

function assertReserve(reserve) {
  if (!Number.isInteger(reserve) || reserve < 0) {
    throw new Error(`page-fit：reserve 必须是非负整数（实得 ${String(reserve)}）`);
  }
}

function assertBudget(budget, where) {
  if (!Number.isInteger(budget) || budget < 1) {
    throw new Error(`page-fit：${where} 的预算 ${String(budget)} < 1，无法产出合法文本（fail-closed，绝不静默输出超长串）`);
  }
}

/**
 * 按预算截断并留痕。
 *
 * 约定沿用 build-local 里**唯一既有**的那条规矩（`slice(0, budget-1).trimEnd() + '…'`）：
 * 先给省略号留一格，再切，切点落在空格上时把尾部空白收掉 —— 否则会出现「词尾空格 + …」。
 * `raw.length <= budget` 时原样返回，因此二次适配恒等（幂等），双重 fit 是安全的。
 */
function fitText(raw, budget, where) {
  assertBudget(budget, where);
  const text = String(raw == null ? '' : raw);
  if (text.length <= budget) return text;
  let cut = text.slice(0, budget - 1);
  // 预算的单位是 UTF-16 码元（seo.js 的 `title.length` 也是），但截断点可能正好落在
  // 一个 emoji 的代理对中间。那样写进 HTML 会变成 U+FFFD（�），不是「留痕」而是内容损坏。
  // 宁可少切一个码元，也不把一个字符劈成两半 —— 截断后仍 ≤ budget。
  if (/[\uD800-\uDBFF]$/.test(cut) && /[\uDC00-\uDFFF]/.test(text.charAt(cut.length))) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}${ELLIPSIS}`;
}

/**
 * 把标题正文适配到「80 − 后缀长度 − 预留量」。
 *
 * 返回的是**不含后缀**的正文；调用方负责拼上后缀（渲染器拥有后缀 ⇒ 渲染器拥有适配）。
 * `reserve` 给消歧标签留位置：标签会追加在正文之后，不预留就会把最终串顶过 80。
 */
function fitTitle(raw, suffix, reserve = 0) {
  const tail = String(suffix == null ? '' : suffix);
  assertReserve(reserve);
  return fitText(raw, TITLE_MAX_LENGTH - tail.length - reserve, `fitTitle(后缀「${tail}」, reserve=${reserve})`);
}

/** 把描述适配到「150 − 预留量」；`reserve` 的用途与 `fitTitle` 相同。 */
function fitDescription(raw, reserve = 0) {
  assertReserve(reserve);
  return fitText(raw, DESC_MAX_LENGTH - reserve, `fitDescription(reserve=${reserve})`);
}

/**
 * 消歧标签阶梯（对称、确定性、预算感知）。
 *
 * 为什么需要它：两条不同的长标题可能共享前 57 个字符，截断后正文逐字相同 ——
 * 标题唯一性门禁（`seo.js` 的 title-unique）会红。只看 `aliasKey` 不够：它剥的是
 * 噪声后缀，不会替截断后的撞车负责。
 *
 * 三阶都由**稳定身份**构成，不是内容改写：
 *   ① `（id前6位）` —— 最短、可读；
 *   ② `（id全12位）` —— 前 6 位撞车时；
 *   ③ `（kind·id）` —— 跨集合复用同一个 id 时（档案的 deal / plan / api 三份日志
 *      各自独立，同一个 12-hex id 在两边都合法）。
 *
 * 为什么是「整组升级」而不是逐个升级：同一组（截断后正文相同）的成员必须拿到**同一阶**
 * 的标签，输出才是对称的；否则先出现的那条短、后出现的这条长，读者看到的消歧强度取决
 * 于数据顺序。整组按 key 排序迭代 ⇒ 与输入顺序无关。
 */
function tagLadder(id, kind) {
  const tagId = String(id == null ? '' : id);
  if (!tagId) throw new Error('page-fit：消歧需要稳定 id，实得空值（拒绝静默产出不可区分的标签）');
  const tags = [`（${tagId.slice(0, 6)}）`, `（${tagId}）`];
  tags.push(kind ? `（${kind}·${tagId}）` : `（${tagId}）`);
  return tags;
}

/** 把 `[key, raw, id?, kind?]` 统一成内部条目；key 必须唯一，否则消歧失去坐标系。 */
function normalizeEntries(rawByKey) {
  if (!Array.isArray(rawByKey)) {
    throw new Error('page-fit：rawByKey 必须是 Array<[key, raw]>（可选第三项 id、第四项 kind）');
  }
  const seen = new Set();
  const entries = rawByKey.map(item => {
    if (!Array.isArray(item) || item.length < 2) {
      throw new Error('page-fit：rawByKey 的每一项必须是 [key, raw]');
    }
    const key = String(item[0]);
    if (!key) throw new Error('page-fit：rawByKey 的 key 不能为空');
    if (seen.has(key)) throw new Error(`page-fit：rawByKey 的 key「${key}」重复 —— 映射会互相覆盖`);
    seen.add(key);
    return {
      key,
      raw: item[1],
      // 标签默认用 key：对 deal 来说 key 就是 id；档案则显式传 entry.id（key 是路由）。
      id: item.length > 2 ? item[2] : key,
      kind: item.length > 3 ? String(item[3] || '') : ''
    };
  });
  // 按 key 排序：分组与升级顺序都不能依赖调用方的遍历顺序（同一个集合换个顺序必须同结果）。
  entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return entries;
}

/**
 * 对「适配后正文相同」的组做对称消歧。
 *
 * @param {Array} entries normalizeEntries 的结果（已按 key 排序）
 * @param {Array<string>} fitted 与 entries 对齐的初适配结果
 * @param {(entry, reserve:number)=>string} fit 带预留量的适配函数
 * @param {string} label 报错用的函数名
 * @returns {Map<string,string>} key → 最终适配值
 */
function disambiguate(entries, fitted, fit, label) {
  const groups = new Map();
  entries.forEach((entry, index) => {
    const value = fitted[index];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push({ entry, value });
  });

  // 其他组的初适配值也是「已占用的字符串」：某个组的标签结果不许恰好等于另一组的
  // 无标签结果，否则全局唯一性仍然破。先收集起来，作为每一阶都要避开的保留集。
  const plainByGroup = new Map();
  for (const [value, members] of groups) plainByGroup.set(value, members.length);

  const assigned = new Set();
  const result = new Map();
  // 组按初适配值排序：升级顺序同样不能依赖输入顺序。
  const orderedValues = [...groups.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  for (const value of orderedValues) {
    const members = groups.get(value);
    // 单成员组不需要标签；但它仍然可能与早先组的标签结果撞车（病态输入）。
    // 早先组在选标签时已经把「所有其他组的初适配值」列为保留集，所以这里只会是空集。
    if (members.length === 1) {
      if (assigned.has(value)) {
        throw new Error(`page-fit：${label} 的单成员结果「${value}」与既有标签撞车（无法在不改内容的前提下消歧）`);
      }
      assigned.add(value);
      result.set(members[0].entry.key, value);
      continue;
    }

    // 保留集 = 其他所有组的初适配值 + 已分配的最终值。
    const reserved = new Set(assigned);
    for (const [plain, count] of plainByGroup) {
      if (plain !== value) reserved.add(plain);
    }

    let chosen = null;
    // 每一阶都必须用**成员自己的** id/kind 生成标签：整组升级说的是「同一阶」，
    // 不是「同一个标签」。若拿组内第一条的标签套给全组，不同 id 也会得到相同结果，
    // 消歧就永远失败（自测 A3 的「不同 id 应互异」正是咬这一点）。
    const rungCount = tagLadder(members[0].entry.id, members[0].entry.kind).length;
    for (let rung = 0; rung < rungCount; rung += 1) {
      const tags = members.map(member => tagLadder(member.entry.id, member.entry.kind)[rung]);
      const candidates = members.map((member, index) => `${fit(member.entry, tags[index].length)}${tags[index]}`);
      const unique = new Set(candidates);
      if (unique.size === candidates.length && candidates.every(candidate => !reserved.has(candidate))) {
        chosen = candidates;
        break;
      }
    }
    if (!chosen) {
      throw new Error(
        `page-fit：${label} 的消歧标签阶梯耗尽（${members.length} 条初适配值相同：「${value}」）。`
        + '拒绝静默产出重复标题 / 描述 —— 请检查这些条目是否真的拥有稳定且可区分的 id。'
      );
    }

    members.forEach((member, index) => {
      assigned.add(chosen[index]);
      result.set(member.entry.key, chosen[index]);
    });
  }

  // 最终不变量：同一个 Map 里不许出现重复值。上面的逻辑已经保证，这里再硬查一次 ——
  // 这是「消歧函数」自己的 fail-closed 出口，不把唯一性留给调用方自觉。
  const finalValues = [...result.values()];
  if (new Set(finalValues).size !== finalValues.length) {
    throw new Error(`page-fit：${label} 产出重复值（这是实现缺陷，不是数据问题）`);
  }
  return result;
}

/**
 * 集合级标题消歧：先全体按预算适配，再把「适配后相同」的组用 id 标签整组升级。
 *
 * @param {Array<[string, string, string?, string?]>} rawByKey `[key, raw, id?, kind?]`
 * @param {string} suffix 页面后缀（如 ` · 历史档案 · AI 优惠聚合器`）
 * @returns {Map<string,string>} key → 适配后的标题正文（**不含** suffix，调用方拼）
 */
function uniqueTitles(rawByKey, suffix) {
  const entries = normalizeEntries(rawByKey);
  const fitted = entries.map(entry => fitTitle(entry.raw, suffix));
  return disambiguate(entries, fitted, (entry, reserve) => fitTitle(entry.raw, suffix, reserve), 'uniqueTitles');
}

/**
 * 集合级描述消歧：与 `uniqueTitles` 同一套阶梯，预算换成 150。
 *
 * 描述没有后缀，但同样会被截断；两条共享 149 字符前缀的描述在截断后逐字相同，
 * 会撞 `desc-unique`。标签追加在描述末尾（读者看到的是「说明 + 身份」）。
 *
 * @param {Array<[string, string, string?, string?]>} rawByKey `[key, raw, id?, kind?]`
 * @returns {Map<string,string>}
 */
function uniqueDescriptions(rawByKey) {
  const entries = normalizeEntries(rawByKey);
  const fitted = entries.map(entry => fitDescription(entry.raw));
  return disambiguate(entries, fitted, (entry, reserve) => fitDescription(entry.raw, reserve), 'uniqueDescriptions');
}

module.exports = {
  DESC_MAX_LENGTH,
  fitTitle,
  fitDescription,
  uniqueTitles,
  uniqueDescriptions
};
