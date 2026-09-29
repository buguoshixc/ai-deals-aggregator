/**
 * 「构造期静默丢弃 vs 校验期报错」这条缝的补丁（v1.1）。
 *
 * ## 缝在哪
 *
 * `makeDeal()` 对新字段的纪律是「只清洗，不外推」：非法枚举丢弃、`null` 省略、三态归一。
 * 于是手写数据（`scripts/data/curated_*.json`）里把枚举拼错时会**无声消失**：
 *
 *   { "audience": ["studentt"] }        → makeDeal 丢掉 → 记录上**没有** audience
 *   → validateDeal 只看到「字段缺席」，而缺席是**合法**的（契约 §3：旧条目就该缺席）
 *   → 校验全绿，页面上少一行，没有人知道有人写错过。
 *
 * 这是本阶段要根除的那类错误里最阴的一种：**错字的表现与「本来就没写」完全一样**。
 * 契约 §7.1 的硬拦救不了它 —— 校验器看到的是归一**之后**的世界，而字是在归一**之前**写错的。
 *
 * ## 补法
 *
 * 只在**构造的入口**（策展文件是人手写的，所以就是它）把「raw 声明了什么」与
 * 「归一后剩下了什么」对一遍，把**声明了实质内容但归一后消失**的那部分报出来。
 * 判据只有一条，两边共用（`loadCurated` 与 `validate.js checkCurated` 都调这个函数，
 * 不准各写一份 —— v1.0 的 ONGOING 教训）：
 *
 *   某个位置**原本有内容**，而归一之后**没有**了 → 报。
 *
 * ## 刻意不报的东西（「缺席」与「写错」必须分开）
 *
 * `null` / `undefined` / 字段没写 / **空数组** / **空对象** 一律不报：
 * 契约 §3 明说 `null` 合法且等价于「不写入」；`[]` 与 `{}` 是**校验期的硬错**
 * （§7.1 判非法），`validateDeal` 已经会报，这里再报一次只会让同一个错字出现两遍、
 * 把真正的「静默丢弃」淹掉。判定「有内容」用的是 `hasDeclared()`，它对 `[]` 与 `{}`
 * 返回 false，所以这条纪律是**结构上**保证的，不是靠调用方记得别传。
 *
 * 同理，一个键写成了 `'unknown'`（合法三态）不报；只有 `0` / `1` / `'true'` / `null`
 * 这类**会被丢掉**的写法才报 —— 报的永远是「你写的东西消失了」，不是「我觉得你写错了」。
 */

const audience = require('./audience');

/** provenance 里允许出现的字段名（provenance 自己不作为被覆盖的字段） */
const COVERABLE_FIELDS = ['audience', 'benefitType', 'eligibilityDetail', 'claimRequirements', 'availability'];

/** 值是否「**声明了实质内容**」：空容器与 null 都算没声明（见文件头） */
function hasDeclared(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/** 归一后的值是否「**真的有内容**」（用词表的唯一出处，不是自己再判一遍） */
function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/** 把非法值渲染成人看得懂的样子（'' 比 undefined 可读） */
function show(value) {
  return typeof value === 'undefined' ? '(未写)' : JSON.stringify(value);
}

/**
 * 比对一个手写条目的「声明」与「归一结果」。
 *
 * @param {object} raw  策展文件里的原始条目（人手写的）
 * @param {object} deal makeDeal() 的产物
 * @returns {{dropped:Array<{field:string,key?:string,reason:string}>, fields:string[], recordDropped?:boolean}}
 *          `dropped` 逐条列出「写了但消失」的位置；`fields` 是涉及的字段名（去重，报告用）。
 *          `recordDropped` = true 表示整条记录都没构造出来（标题/URL 不合法）——
 *          此时**不能返回空数组**：调用方已经在报「整条丢弃」，但那个报法不会说
 *          「你写的这几个新字段也跟着没了」，两条信息都有用。
 */
function auditAudienceFields(raw, deal) {
  const dropped = [];
  const push = (field, reason, key) => dropped.push(key ? { field, key, reason } : { field, reason });

  if (!raw || typeof raw !== 'object') return { dropped, fields: [] };

  // 整条没构造出来：把 raw 里**声明过的**新字段逐条报出来（值本身没法审，只能报「跟着丢了」）
  if (deal === null || deal === undefined) {
    for (const field of ['audience', 'benefitType', 'eligibilityDetail', 'claimRequirements', 'availability', 'provenance']) {
      if (hasDeclared(raw[field])) push(field, '整条记录未构造成功（标题或 URL 不合法），该字段随之丢失');
    }
    return { dropped, fields: [...new Set(dropped.map(item => item.field))], recordDropped: true };
  }

  /* ---- ① 枚举数组：audience / benefitType ---- */
  const lists = [
    ['audience', audience.AUDIENCES, audience.normalizeEnumList],
    ['benefitType', audience.BENEFIT_TYPES, audience.normalizeEnumList]
  ];
  for (const [field, allowed, normalize] of lists) {
    const declared = raw[field];
    if (!hasDeclared(declared)) continue;
    if (!Array.isArray(declared)) {
      // 单值写成字符串是最常见的手写形态（契约 §2.1 要求数组）
      push(field, `${field} 必须是非空数组（单值也要写成数组），实得 ${show(declared)}`);
      continue;
    }
    const view = normalize(declared, allowed);
    if (!hasValue(view)) {
      push(field, `${field} 的 N 个取值全部不在词表内：${show(declared)}（合法值：${allowed.join(' / ')}）`);
      continue;
    }
    if (view.length !== declared.length) {
      const illegal = declared.filter(item => !allowed.includes(typeof item === 'string' ? item.trim() : item));
      push(field, `${field} 丢弃 ${declared.length - view.length} 项：${show(illegal)}（合法值：${allowed.join(' / ')}）`);
    } else if (declared.some(item => typeof item === 'string' && item.trim() !== item)) {
      // 长度对得上但原文带空白：归一改写了它，那是清洗不是丢弃，不报（这条分支只为说明意图）
    }
  }

  /* ---- ② 三态映射：eligibilityDetail / claimRequirements ---- */
  const maps = [
    ['eligibilityDetail', audience.ELIGIBILITY_KEYS, audience.ELIGIBILITY_LABELS],
    ['claimRequirements', audience.CLAIM_KEYS, audience.CLAIM_LABELS]
  ];
  for (const [field, keys, labels] of maps) {
    const declared = raw[field];
    if (!hasDeclared(declared)) continue;
    if (typeof declared !== 'object' || Array.isArray(declared)) {
      push(field, `${field} 必须是对象（每个值 true / false / "unknown"），实得 ${show(declared)}`);
      continue;
    }
    const view = audience.normalizeTristateMap(declared, keys) || {};
    for (const key of Object.keys(declared)) {
      const label = labels[key] ? `${key}（${labels[key]}）` : key;
      if (!keys.includes(key)) {
        push(field, `${label} 不是已知维度，整键被丢弃（已知：${keys.join(' / ')}）`, key);
        continue;
      }
      if (audience.normalizeTristate(declared[key]) === null) {
        push(field, `${label} 的取值 ${show(declared[key])} 不是三态（只认 true / false / "${audience.TRISTATE_UNKNOWN}"），整键被丢弃`, key);
        continue;
      }
      if (view[key] === undefined) {
        push(field, `${label} 写了却没进归一结果`, key);
      }
    }
  }

  /* ---- ③ availability：三态 + 地区限制 ---- */
  const declaredAvailability = raw.availability;
  if (hasDeclared(declaredAvailability)) {
    if (typeof declaredAvailability !== 'object' || Array.isArray(declaredAvailability)) {
      push('availability', `availability 必须是对象，实得 ${show(declaredAvailability)}`);
    } else {
      const view = audience.normalizeAvailability(declaredAvailability) || {};
      for (const key of Object.keys(declaredAvailability)) {
        if (key === 'chinaUsable') {
          if (audience.normalizeTristate(declaredAvailability.chinaUsable) === null) {
            push('availability', `chinaUsable 的取值 ${show(declaredAvailability.chinaUsable)} 不是三态，整键被丢弃`, key);
          }
        } else if (key === 'regionRestriction') {
          const value = declaredAvailability.regionRestriction;
          if (typeof value !== 'string' || !value.trim()) {
            push('availability', `regionRestriction 写了却没有内容（${show(value)}），整键被丢弃`, key);
          }
        } else {
          push('availability', `${key} 不是已知键，整键被丢弃（已知：chinaUsable / regionRestriction）`, key);
        }
      }
      if (!hasValue(view)) {
        push('availability', `availability 声明了内容但归一后整组为空：${show(declaredAvailability)}`);
      }
    }
  }

  /* ---- ④ provenance：一处写错会被静默丢掉的来源声明 ---- */
  const declaredProvenance = raw.provenance;
  if (hasDeclared(declaredProvenance)) {
    if (typeof declaredProvenance !== 'object' || Array.isArray(declaredProvenance)) {
      push('provenance', `provenance 必须是对象，实得 ${show(declaredProvenance)}`);
    } else {
      const credibilityOk = audience.CREDIBILITIES.includes(declaredProvenance.credibility);
      if (!credibilityOk) {
        push('provenance', `credibility 非法（${show(declaredProvenance.credibility)}），整块 provenance 被丢弃；必须是 ${audience.CREDIBILITIES.join(' / ')}`);
      }
      const declaredFields = declaredProvenance.fields;
      // credibility 一旦非法，整块都没了：此时再逐条报 fields 只会把同一件事故意说三遍
      if (credibilityOk && hasDeclared(declaredFields)) {
        if (typeof declaredFields !== 'object' || Array.isArray(declaredFields)) {
          push('provenance', `provenance.fields 必须是对象，实得 ${show(declaredFields)}`);
        } else {
          const kept = deal.provenance && deal.provenance.fields ? deal.provenance.fields : {};
          for (const key of Object.keys(declaredFields)) {
            if (!COVERABLE_FIELDS.includes(key)) {
              push('provenance', `fields.${key} 不是 v1.1 字段，该条目被丢弃（已知：${COVERABLE_FIELDS.join(' / ')}）`, key);
              continue;
            }
            // 来源声明指向一个没有值的字段 = 假出处，契约 §7.1 硬拦；这里报的是**同一件事的成因**
            if (!audience.hasKnown(deal[key])) {
              push('provenance', `fields.${key} 指向一个归一后没有值的字段，该条目被丢弃`, key);
              continue;
            }
            const entry = declaredFields[key];
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
              push('provenance', `fields.${key} 必须是对象，实得 ${show(entry)}`, key);
              continue;
            }
            if (!audience.BASIS_VALUES.includes(entry.basis)) {
              push('provenance', `fields.${key}.basis 非法（${show(entry.basis)}），该条目被丢弃；必须是 ${audience.BASIS_VALUES.join(' / ')}`, key);
              continue;
            }
            if (entry.derived !== undefined && !audience.DERIVED_VALUES.includes(entry.derived)) {
              push('provenance', `fields.${key}.derived 非法（${show(entry.derived)}），该条目被丢弃`, key);
              continue;
            }
            if (entry.basis === 'inferred' && !(typeof entry.note === 'string' && entry.note.trim())) {
              push('provenance', `fields.${key}.basis=inferred 但没有 note，该条目被丢弃（推断链就是断言的一部分）`, key);
              continue;
            }
            if (kept[key] === undefined) {
              push('provenance', `fields.${key} 写了却没进归一结果`, key);
            }
          }
        }
      }
      const declaredFieldKeys = credibilityOk && declaredFields && typeof declaredFields === 'object' && !Array.isArray(declaredFields)
        ? Object.keys(declaredFields) : [];
      if (declaredFieldKeys.length && (!deal.provenance || !deal.provenance.fields)) {
        push('provenance', 'provenance 的字段说明整块被丢弃（所有条目都不合法）');
      }
    }
  }

  return { dropped, fields: [...new Set(dropped.map(item => item.field))] };
}

module.exports = { auditAudienceFields, hasDeclared, hasValue, COVERABLE_FIELDS };
