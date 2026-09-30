/**
 * 候选信封 + 候选层的确定性规则（R1–R5）。
 *
 * 这里是「AI 的话」变成「可以给人看的东西」的那道闸。过了 schema 只说明**形状**对，
 * 过了这里才说明**它说的话有出处**。
 *
 * ## 为什么"有出处"必须由代码判，不能靠提示词
 *
 * 提示词里写「没有证据就写 unknown」是**请求**，不是保证。模型在"看起来该是 false 的地方"
 * 给出 false 是最常见的失败模式，而它恰恰是最危险的一种：一个错的 `unknown` 只是少一行信息，
 * 一个错的 `false` 是**平台对读者说了一句假话**。
 *
 * 所以这里的规则只做一件事：**没有同名引文的断言，不许通过**。
 * 引文是否真的支持这个断言（语义问题）无法用正则判定 —— 那种情况一律降级成
 * `needs_human`（人来看），而不是"看起来有引文就放行"。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cache = require('./cache');
const schemas = require('./schemas');

const STATUS = {
  candidate: 'candidate',
  invalid: 'invalid',
  needsHuman: 'needs_human',
  accepted: 'accepted',
  rejected: 'rejected'
};

/**
 * 否定线索：`false` 断言必须能在引文里找到这类词，否则降级给人看。
 *
 * 刻意**不收**「免费」：免费额度/免费试用经常仍然要求绑卡，把「免费」当成
 * 「不需要信用卡」的依据是一次语义跳跃 —— 而错的 `false` 是平台对读者说假话。
 * 这种"看起来像、其实要人判"的情况正是 `unsupported_false` 要标出来的东西。
 */
const NEGATION_CUES = /\b(no|not|never|without|none|excluded|n\/a)\b|无需|不需要|不用|不必|没有|毋需|未要求|毋须/i;

function shortId(parts) {
  return crypto.createHash('sha1').update(parts.filter(Boolean).join('|'), 'utf8').digest('hex').slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* 值 → 「这条字段到底断言了什么」                                       */
/* ------------------------------------------------------------------ */

/**
 * 把一个字段值拆成"叶子断言"列表：`eligibilityDetail` → `[{key:'newUserOnly', value:true}]`。
 * 只有**非 unknown 的叶子**才算断言 —— 「我查过但没有证据」不是断言。
 */
function leafAssertions(value, prefix = '') {
  const out = [];
  if (value === undefined || value === null || value === schemas.TRISTATE_UNKNOWN) return out;
  if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
    out.push({ key: prefix || '(值)', value });
    return out;
  }
  if (Array.isArray(value)) {
    if (value.length) out.push({ key: prefix || '(列表)', value });
    return out;
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value).sort()) {
      out.push(...leafAssertions(value[key], prefix ? `${prefix}.${key}` : key));
    }
  }
  return out;
}

/** 一条字段值是否"声明了实质内容"（与 audience-audit.hasDeclared 同一口径） */
function assertsSomething(value) {
  return leafAssertions(value).length > 0;
}

/* ------------------------------------------------------------------ */
/* 规则 R1–R5                                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {object} candidateValue `result` 里的候选值（不含 evidence/confidence）
 * @param {{task:string, evidence:object[], confidence:object}} ctx
 * @returns {{errors:string[], flags:{code:string, field:string, detail:string}[]}}
 */
function checkDeterministic(candidateValue, ctx = {}) {
  const errors = [];
  const flags = [];
  const task = ctx.task || 'extract_offer';
  const evidence = Array.isArray(ctx.evidence) ? ctx.evidence : [];

  // R5：引文条数与长度（schema 已管一次，这里对任何任务都再管一次）
  if (evidence.length > 3) errors.push(`R5 引文最多 3 条，实际 ${evidence.length} 条`);
  if (task === 'dedup_pair') {
    // 重复候选的 evidence 是**短句列表**（"same official URL" 这种），不是 {field,quote}
    for (const item of evidence) {
      if (typeof item !== 'string' || !item.trim()) errors.push('R5 重复候选的 evidence 必须是非空字符串');
      else if (item.length > 120) errors.push('R5 重复候选的 evidence 每条不得超过 120 字');
    }
  } else {
    for (const item of evidence) {
      if (!item || typeof item !== 'object') {
        errors.push('R5 引文必须是对象');
        continue;
      }
      if (typeof item.quote !== 'string' || !item.quote.trim()) errors.push(`R5 引文 ${item.field || '?'} 的 quote 为空`);
      if (typeof item.quote === 'string' && item.quote.length > 200) errors.push(`R5 引文 ${item.field} 超过 200 字`);
    }
  }

  // R4：置信度
  if (ctx.confidence !== undefined && ctx.confidence !== null) {
    if (typeof ctx.confidence !== 'object' || Array.isArray(ctx.confidence)) {
      errors.push('R4 confidence 必须是对象');
    } else {
      for (const key of Object.keys(ctx.confidence)) {
        const v = ctx.confidence[key];
        if (typeof v !== 'number' || v < 0 || v > 1) errors.push(`R4 confidence.${key} 必须是 0–1 的数字`);
      }
    }
  }

  if (task === 'extract_offer' || !schemas.SCHEMAS[task] || task === 'audit_record') {
    errors.push(...checkCandidateFields(candidateValue, evidence, flags));
  }

  return { errors, flags };
}

function checkCandidateFields(candidateValue, evidence, flags) {
  const errors = [];
  if (!candidateValue || typeof candidateValue !== 'object' || Array.isArray(candidateValue)) return errors;

  for (const field of schemas.CANDIDATE_FIELDS) {
    if (!(field in candidateValue)) continue;
    const value = candidateValue[field];
    const assertions = leafAssertions(value);
    if (!assertions.length) continue; // 全 unknown / 空 → 不是断言，不需要引文

    // R2：三态字面量
    if (['eligibilityDetail', 'claimRequirements'].includes(field)) {
      for (const key of Object.keys(value)) {
        const v = value[key];
        if (!(v === true || v === false || v === schemas.TRISTATE_UNKNOWN)) {
          errors.push(`R2 ${field}.${key} 只能是 true / false / "${schemas.TRISTATE_UNKNOWN}"，实际 ${JSON.stringify(v)}`);
        }
      }
    }
    if (field === 'availability' && value && 'chinaUsable' in value) {
      const v = value.chinaUsable;
      if (!(v === true || v === false || v === schemas.TRISTATE_UNKNOWN)) {
        errors.push(`R2 availability.chinaUsable 只能是 true / false / "${schemas.TRISTATE_UNKNOWN}"，实际 ${JSON.stringify(v)}`);
      }
    }

    // R1：非 unknown 的断言必须有**同名**引文
    const own = evidence.filter(item => item && item.field === field && typeof item.quote === 'string' && item.quote.trim());
    if (!own.length) {
      errors.push(`R1 ${field} 断言了内容但没有同名引文（原文没写就应写成 unknown）`);
      continue;
    }

    // 引文存在但语义是否支持，正则判不了 —— 只对 `false` 做一条**保守**检查：
    // 没有任何否定线索的引文，撑不起一个否定结论 → 降级给人看（牙测试第 3 条）。
    for (const leaf of assertions) {
      if (leaf.value !== false) continue;
      const quoted = own.map(item => item.quote).join(' ');
      if (!NEGATION_CUES.test(quoted)) {
        flags.push({
          code: 'unsupported_false',
          field,
          detail: `${field}${leaf.key && leaf.key !== '(值)' ? '.' + leaf.key : ''} 判为 false，但引文里没有任何否定线索：「${quoted.slice(0, 60)}」`
        });
      }
    }
  }
  return errors;
}

/* ------------------------------------------------------------------ */
/* 信封                                                                */
/* ------------------------------------------------------------------ */

function makeCandidate({
  task, dealId, field = null, sourceUrl = null, provider = null, model = null,
  promptVersion, inputHash, candidate, evidence = [], confidence = {},
  deterministic = null, flags = []
} = {}) {
  const id = shortId([task, dealId, field, inputHash, cache.canonicalJson(candidate)]);
  const status = flags.length ? STATUS.needsHuman : STATUS.candidate;
  return {
    candidateVersion: 1,
    id,
    task,
    dealId: dealId || null,
    field,
    sourceUrl,
    generatedAt: new Date().toISOString(),
    provider,
    model,
    promptVersion,
    inputHash,
    candidate,
    evidence,
    confidence,
    status,
    deterministic: deterministic || { schema: 'pass', enum: 'pass', evidence: 'pass', audienceAudit: 'n/a' },
    review: { decision: null, at: null, note: null },
    flags
  };
}

/** 从 `generateStructured` 的结果造候选；失败时返回 `{invalid: {...}}` 供归档 */
function buildFromResult({
  result, meta, task, dealId, sourceUrl, candidateValue, evidence, confidence,
  extraErrors = [], extraFlags = [], extraDeterministic = null, notes = null
}) {
  const check = checkDeterministic(candidateValue, { task, evidence, confidence });
  const errors = [...check.errors, ...extraErrors];
  const flags = [...check.flags, ...extraFlags];
  if (errors.length) {
    return {
      invalid: {
        task,
        dealId: dealId || null,
        reason: 'deterministic_rules',
        detail: errors.join('; '),
        provider: meta.provider,
        model: meta.model,
        promptVersion: meta.promptVersion,
        inputHash: meta.inputHash,
        generatedAt: new Date().toISOString()
      }
    };
  }
  const candidate = makeCandidate({
    task,
    dealId,
    sourceUrl,
    provider: meta.provider,
    model: meta.model,
    promptVersion: meta.promptVersion,
    inputHash: meta.inputHash,
    candidate: candidateValue,
    evidence,
    confidence: confidence || {},
    flags
  });
  if (extraDeterministic) Object.assign(candidate.deterministic, extraDeterministic);
  if (notes) candidate.notes = notes;
  return { candidate };
}

function partition(list) {
  const valid = [];
  const invalid = [];
  const needsHuman = [];
  for (const item of list) {
    if (!item) continue;
    if (item.status === STATUS.invalid) invalid.push(item);
    else if (item.status === STATUS.needsHuman) needsHuman.push(item);
    else valid.push(item);
  }
  return { valid, invalid, needsHuman };
}

/* ------------------------------------------------------------------ */
/* 落盘                                                                */
/* ------------------------------------------------------------------ */

function candidatesPath(task, stamp) {
  const name = stamp ? `${task}-${stamp}.json` : `${task}.json`;
  return path.join(cache.candidatesDir(), name);
}

function writeCandidates(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return file;
}

function readCandidates(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || !Array.isArray(parsed.candidates)) throw new Error(`${file} 里没有 candidates 数组`);
  return parsed;
}

/** 找到最近一份候选文件（`--latest` 用） */
function latestCandidatesFile(task = null) {
  const dir = cache.candidatesDir();
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .filter(name => (task ? name.startsWith(`${task}-`) || name === `${task}.json` : true))
    .map(name => path.join(dir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

/** 不允许自动落地的关系：重复候选里只有 same_offer 值得人去看，而且永远不能自动合并 */
const NEVER_AUTO_MERGE = ['same_offer', 'same_product_different_offer', 'same_vendor', 'uncertain', 'unrelated'];

module.exports = {
  STATUS,
  NEVER_AUTO_MERGE,
  NEGATION_CUES,
  shortId,
  leafAssertions,
  assertsSomething,
  checkDeterministic,
  makeCandidate,
  buildFromResult,
  partition,
  candidatesPath,
  writeCandidates,
  readCandidates,
  latestCandidatesFile
};
