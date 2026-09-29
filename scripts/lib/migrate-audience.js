/**
 * `migrate.js --audience`：给**存量**数据补 `provenance`（v1.1 契约 §6.1）。
 *
 * 这个文件只做一件事：给「有据可查」的存量条目补一份**出处声明**，且只补出处。
 * 它刻意**不写六个字段的任何值** —— 那些值是人工策展（t3）与采集器的工作，脚本凭空
 * 填一个 `audience` 就是编造数据；也刻意**不填 `"unknown"` 占位** —— 缺席本来就是
 * unknown（契约 §3），写出来只会让覆盖率虚高、让「查过但没证据」与「没查」看起来一样。
 *
 * 补的规则（§6.1）——**只有人工策展来源会被补**：
 *   · `source ∈ {Curated, Curated-CN}` 且 `verified:true` + `verifiedAt` → `editorial` + `verifiedAt`；
 *   · `source ∈ {Curated, Curated-CN}` 的其余情况                      → `curated`；
 *   · 其余                                                             → **什么都不补**
 *     （凭空盖一个来源就是造假）。
 *   前两种都会把**真的有值**的新字段逐条列进 `fields`（`basis:'source'` / `derived:'stated'`）。
 *   档位本身不在这里定义，直接由 `dedup.credibilityOf` 给出（见下）。
 *
 * 这里有一处必须说清楚的张力：契约同时写着「凭空盖来源是造假」与「策展来源要补出处」。
 * 两者不冲突的原因是**依据的性质不同**：
 *   · `verified` / `verifiedAt` 是人在 curated 文件里**逐条写下的事实**（「我在这天回访过
 *     官方页」），把它记成 `credibility:'editorial'` 是**转录**，不是推断；
 *   · `source ∈ {Curated, Curated-CN}` 同理，它是数据自己的来源标记。
 * 而 `fields` 里的 `basis:'source'` 说的是「这个字段的值来自官方来源（人工策展转录）」——
 * 对 curated 条目**成立**，因为这些条目本来就是人对着官方页写下来的。两条规则都不越界。
 *
 * 另一条纪律：**只在没有 provenance 时补**。已有 provenance 的条目不碰 —— 那可能是
 * merge 按 §5.3.2 单调退化后的结果（丢过条目、降过档），而**没有任何路径能把它加回来**，
 * 迁移脚本也不该成为那条路径（否则「人工回访」会被脚本的推断悄悄续命）。
 */

const { AUDIENCE_FIELD_ORDER } = require('./schema');
const { CURATED_SOURCES, credibilityOf } = require('./dedup');
const audience = require('./audience');

/**
 * 一条记录该补什么可信度。返回 null = **不补**。
 *
 * 规则**直接复用 `dedup.credibilityOf`**，不在这里重新写一遍：它读的是同一组输入
 * （`source` / `verified` / `verifiedAt`），于是「补出处时认的档位」与「合并时认的档位」
 * 在结构上不可能分家。`migrationCredibility(deal)` 因此恒为 `null` 或 `credibilityOf(deal)`。
 *
 * ⚠️ 这个不变量是 2026-09-29 收口时才成立的。此前这个函数写的是
 * 「`verified === true` 且带 `verifiedAt` → `editorial`」，**不看来源**；
 * 而 `credibilityOf` 早已被加固成「editorial 还要求来源是人工策展」——
 * `dedup.js` 里那段注释记着加固的理由：「任意自动采集条目只要带上这两个字段就被当成
 * 『人工核验过』，t1 核验实测放行过这条」。**同一个洞在 dedup 堵上了，在这里没有。**
 *
 * 后果不是理论上的：`migrate.js --audience` 会给一条自动采集来的、恰好带
 * `verified` + `verifiedAt` 的记录盖上 `credibility:'editorial'` 的出处声明，
 * 而 `fields` 里同时写着 `basis:'source'`（「这个值是官方页明说的」）—— 两句都不成立，
 * 而 `validateDeal` 两种档位都放行，不会有任何东西变红。
 * 实测当前数据里 `source` 非策展且 `verified === true` 的记录是 **0 条**，
 * 所以这是**潜伏**缺陷（等某个采集源开始写 `verified` 才发作），不是正在流血。
 *
 * 不变量由 `audience-selftest.js` 钉住（而不是只靠这里写得对）。
 */
function migrationCredibility(deal) {
  if (!deal || typeof deal !== 'object') return null;
  // 只有人工策展来源才可能被「转录」成出处声明：自动采集条目的值是采集器说的，
  // 不是某个人对着官方页写下来的，给它补 provenance 就是在编造出处。
  if (!CURATED_SOURCES.has(deal.source)) return null;
  return credibilityOf(deal);
}

/**
 * 一份 provenance 应当覆盖哪些字段：只有**最终真的有值**的新字段。
 *
 * 「有值」的判据只用 `hasKnown()`（唯一出处）：三态里 `"unknown"` 不算值，
 * `false` **算**值（「来源明说不需要」是一条信息 —— 这里踩过坑，见 audience.js 的注释）。
 */
function provableFields(deal) {
  return AUDIENCE_FIELD_ORDER
    .filter(field => field !== 'provenance')
    .filter(field => audience.hasKnown(deal[field]));
}

/**
 * 构造一份 provenance（不改 deal）。无可补依据或无字段可覆盖时返回 null。
 *
 * `fields[field]` 的 `basis:'source'` + `derived:'stated'` 是**如实**的：这些字段的值
 * 就写在人工策展条目里，是来源明说的（原样转录），不是我们从条款推的。
 */
function buildProvenance(deal) {
  const credibility = migrationCredibility(deal);
  if (!credibility) return null;
  const fields = provableFields(deal);
  if (!fields.length) return null;

  const provenance = { credibility };
  if (credibility === 'editorial' && deal.verifiedAt) provenance.verifiedAt = deal.verifiedAt;
  provenance.fields = {};
  for (const field of fields) {
    provenance.fields[field] = { basis: 'source', derived: 'stated' };
  }
  return provenance;
}

/**
 * 给一组记录补 provenance。**纯函数**：返回新数组，输入不被修改。
 *
 * `sourceUrl` 刻意不抄进来：providence 的 `sourceUrl` 说「这条断言依据的官方页」，
 * 而既有条目的 `sourceUrl` 是「这条优惠的原始出处」，多数为 null；照抄会产出一份
 * 看起来更可信、实际上没多任何信息的声明。
 *
 * @param {object[]} deals
 * @returns {{deals:object[], stats:{total,considered,provenanceAdded,editorial,curated,nothingToCover,skippedExisting,fieldsCovered:object,bySource:object,added:Array<{id,title,credibility,fields:string[],verifiedAt?:string}>}}}
 */
function attachAudienceProvenance(deals) {
  const stats = {
    total: 0,
    provenanceAdded: 0,
    editorial: 0,
    curated: 0,
    /** 有依据可补，但这条记录上没有任何**真的有值**的新字段 → 不补（补了就是空声明） */
    nothingToCover: 0,
    /** 已有 provenance：一律不碰（见文件头的单调退化说明） */
    skippedExisting: 0,
    fieldsCovered: {},
    bySource: {},
    added: []
  };
  const out = [];

  for (const deal of Array.isArray(deals) ? deals : []) {
    stats.total++;
    if (!deal || typeof deal !== 'object') {
      out.push(deal);
      continue;
    }
    if (deal.provenance !== undefined && deal.provenance !== null) {
      stats.skippedExisting++;
      out.push(deal);
      continue;
    }

    const provenance = buildProvenance(deal);
    if (!provenance) {
      if (migrationCredibility(deal)) stats.nothingToCover++;
      out.push(deal);
      continue;
    }

    stats.provenanceAdded++;
    stats[provenance.credibility]++;
    const fields = Object.keys(provenance.fields);
    for (const field of fields) {
      stats.fieldsCovered[field] = (stats.fieldsCovered[field] || 0) + 1;
    }
    const source = deal.source || '(未标注)';
    stats.bySource[source] = stats.bySource[source] || { added: 0, editorial: 0, curated: 0 };
    stats.bySource[source].added++;
    stats.bySource[source][provenance.credibility]++;
    stats.added.push({
      id: deal.id,
      title: deal.title,
      credibility: provenance.credibility,
      fields,
      ...(provenance.verifiedAt ? { verifiedAt: provenance.verifiedAt } : {})
    });

    // 只追加 provenance：既有键的顺序与取值一个都不动。
    // 这条也是「除 provenance 外任何既有字段逐字节不变」这条验收标准的实现方式——
    // 用展开重建整条记录是**可以**做到同样效果，但只要有人日后顺手加一行归一，
    // 那条验收就被无声破坏；`{...deal}` + 单键赋值把不变量钉在语法上。
    out.push({ ...deal, provenance });
  }

  return { deals: out, stats };
}

module.exports = {
  CURATED_SOURCES,
  migrationCredibility,
  provableFields,
  buildProvenance,
  attachAudienceProvenance
};
