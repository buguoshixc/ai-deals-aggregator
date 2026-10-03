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
 * **人工决定**的取值（`review.decision`）。它与上面的 `status` 是两套词，刻意分开写：
 * 决定是 `accept` / `reject`，状态是 `accepted` / `rejected` —— 把两套词混用正是那种
 * 「看起来对、跑起来恒假」的写法（`'accept' !== 'accepted'`），所以这里给它一个具名常量。
 */
const DECISION = { accept: 'accept', reject: 'reject' };

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

/** 这些任务的 `evidence` 是**短句列表**（不是 {field,quote}） */
const STRING_EVIDENCE_TASKS = ['dedup_pair', 'diagnose_source'];

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
  if (evidence.length > 7) errors.push(`R5 引文最多 7 条（每个可断言字段一条），实际 ${evidence.length} 条`);
  if (STRING_EVIDENCE_TASKS.includes(task)) {
    for (const item of evidence) {
      if (typeof item !== 'string' || !item.trim()) errors.push(`R5 ${task} 的 evidence 必须是非空字符串`);
      else if (item.length > 200) errors.push(`R5 ${task} 的 evidence 每条不得超过 200 字`);
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

  // 只有「字段候选」这一种任务需要逐字段的证据覆盖检查
  if (task === 'extract_offer') {
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
/* 「人工已接受」的唯一判据 + 候选信封的读写闸门                        */
/* ------------------------------------------------------------------ */

/**
 * 生成时记下的三道机器门（schema / enum / evidence）。落地前再核一遍，缺一不可。
 *
 * `audienceAudit` **刻意不算门**：它是审核提示（`n/a` 表示该任务不适用），不是 schema/domain 判据；
 * 把它当门会让一批本来合法的候选永远落不了地。
 */
const DETERMINISTIC_GATES = ['schema', 'enum', 'evidence'];

/** 返回没过门的项（人话列表）；空数组 = 三关全过 */
function deterministicFailures(item) {
  const det = item && item.deterministic;
  if (!det || typeof det !== 'object' || Array.isArray(det)) return ['deterministic=missing'];
  return DETERMINISTIC_GATES
    .filter(gate => det[gate] !== 'pass')
    .map(gate => `${gate}=${det[gate] === undefined ? 'missing' : det[gate]}`);
}

/**
 * 「这条候选可以被落地吗」——**红线就在这里，而且只在这里**（P1-1 / M17 的根因是它散落在
 * `ai-apply.js` 的一个行内 filter 里、没有任何门禁守着）。三个条件同时成立才算数：
 *
 *   ① `review.decision === 'accept'` —— 有人显式点过（accept 只能由 `ai-accept.js` 写下）；
 *   ② `status === 'accepted'`        —— 状态与决定一致（手改的半截状态不算）；
 *   ③ 机器门全过                     —— schema / enum / evidence 三关（既有 invariants）。
 *
 * 谁要落地候选，必须调这个函数（`ai-apply.js` 的写入路由就是这么做的，`ai-selftest` 会红）。
 */
function isAcceptedCandidate(item) {
  if (!item || typeof item !== 'object') return false;
  if (!item.review || item.review.decision !== DECISION.accept) return false;
  if (item.status !== STATUS.accepted) return false;
  return deterministicFailures(item).length === 0;
}

/** 候选信封里所有「已接受且过门」的候选（顺序保持文件里的顺序） */
function acceptedOf(payload) {
  const list = payload && Array.isArray(payload.candidates) ? payload.candidates : [];
  return list.filter(isAcceptedCandidate);
}

/**
 * 人点了 accept、但机器门没过（状态不一致 / 三道门缺一关）。
 * 落地工具必须**点名拒绝**这些 —— 静默丢掉等于让人以为"已经落地了"。
 */
function acceptedButUnverified(payload) {
  const list = payload && Array.isArray(payload.candidates) ? payload.candidates : [];
  return list.filter(item =>
    item && typeof item === 'object' && item.review && item.review.decision === DECISION.accept &&
    !isAcceptedCandidate(item));
}

/**
 * 这是不是一个**候选信封**（而不是生产真值文件被误当成候选、或半截 JSON）。
 * 判据刻意窄：顶层 `task` 字符串 + `candidates` 数组 + 每条候选有字符串 `id` 与 `review` 字段。
 */
function isCandidateEnvelope(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return false;
  if (typeof doc.task !== 'string' || !doc.task) return false;
  if (!Array.isArray(doc.candidates)) return false;
  return doc.candidates.every(item =>
    item && typeof item === 'object' && !Array.isArray(item) &&
    typeof item.id === 'string' && item.id &&
    item.review !== undefined);
}

/** 生成/审核工具的 `--out` / `--file` 落点：相对仓库根解析后过白名单（见 cache.assertAiOutputPath） */
function resolveOutputPath(value, { label = 'AI 生成物' } = {}) {
  return cache.assertAiOutputPath(path.resolve(cache.ROOT, value), { label });
}

/**
 * 读候选文件（**严格版**：落点白名单 + 信封形状）。`ai-accept` / `ai-apply` 用它，
 * 于是 `--file=deals.json` 这类"把生产真值当候选读"的调用会被明确拒掉。
 * 旧的 `readCandidates` 保留原语义，供只读的审阅/诊断工具继续用。
 */
function readCandidatesStrict(file) {
  const abs = cache.assertAiOutputPath(path.resolve(file), { label: '候选文件' });
  if (!fs.existsSync(abs)) throw new Error(`候选文件不存在：${path.relative(cache.ROOT, abs) || abs}`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (error) {
    throw new Error(`候选文件不是合法 JSON：${path.relative(cache.ROOT, abs)}（${error.message}）`);
  }
  if (!isCandidateEnvelope(parsed)) {
    throw new Error(
      `拒绝：${path.relative(cache.ROOT, abs) || abs} 不是候选信封（需要顶层 task + candidates[]，` +
      '每条候选带 id 与 review；生产真值文件不许当候选读）'
    );
  }
  return parsed;
}

/* ------------------------------------------------------------------ */
/* 落盘                                                                */
/* ------------------------------------------------------------------ */

function candidatesPath(task, stamp) {
  const name = stamp ? `${task}-${stamp}.json` : `${task}.json`;
  return path.join(cache.candidatesDir(), name);
}

/**
 * 写候选文件（**唯一实现**）。三件事都在这里，绕不过去：
 *   ① 落点白名单 + 生产真值硬拒绝（`cache.assertAiOutputPath`）；
 *   ② 形状：必须是候选信封（不然写出去的是一份没人认得出的东西）；
 *   ③ `cause==='generation'` 时，**不许产出已经带人工决定的候选** ——
 *      「generation 不得隐式 accept」是结构性的：生成侧连写都写不出去，而不是靠约定。
 */
function writeCandidates(file, payload, { cause = 'review' } = {}) {
  const abs = cache.assertAiOutputPath(path.resolve(file), { label: '候选文件' });
  if (!isCandidateEnvelope(payload)) {
    throw new Error('拒绝写入：这不是候选信封（需要顶层 task + candidates[]，每条候选带 id 与 review）');
  }
  if (cause === 'generation') {
    const decided = payload.candidates.filter(item => item.review && item.review.decision);
    if (decided.length) {
      throw new Error(
        `生成路径不许产出「已经下过人工决定」的候选（${decided.length} 条带 review.decision）——` +
        'accept / reject 只能由 scripts/tools/ai-accept.js 显式记录'
      );
    }
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return abs;
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

/* ------------------------------------------------------------------ */
/* 等价 Gate：候选信封不许出现在生产真值里                              */
/* ------------------------------------------------------------------ */

/**
 * 生产真值清单（**只读**，供门禁扫描用）。判据与 `cache.PROTECTED_*` 同源，另外点名三份 history
 * 与几个人工来源层文件 —— 它们正是 `--out` 能被误写进去的那几个，也是"AI 输出绕过
 * validator/review/accept 变成读者看到的事实"唯一的入口。
 */
function productionTruthFiles() {
  return [
    ...cache.PROTECTED_FILES.map(rel => path.join(cache.ROOT, rel)),
    ...['deal-history.json', 'plan-history.json', 'api-plan-history.json', 'curated_cn.json',
      'curated_global.json', 'curated_plans.json', 'curated_api_plans.json',
      'audience-overrides.json', 'translations_zh.json', 'ai-applied-log.json']
      .map(name => path.join(cache.ROOT, 'scripts', 'data', name))
  ];
}

/**
 * 生产真值里有没有**候选信封**（= 有人把 AI 输出手工复制进生产数据）。
 *
 * 为什么要有它，即使 `validate --strict` 已经会拦：validator 拦的是"数据不合契约"，
 * 它给出的理由是一串 schema 报错；这条门说的是**这件事本身**（AI 输出绕过 accept 成了生产真值）。
 * 两者是不同层面的判据，出问题时前者告诉你数据坏了，后者告诉你红线被踩了。
 *
 * @returns {string[]} 命中的文件（相对仓库根的路径）；空数组 = 干净
 */
function productionTruthEnvelopes(files = productionTruthFiles()) {
  const hits = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      continue;
    }
    if (!text.trim().startsWith('{')) continue;
    let doc;
    try {
      doc = JSON.parse(text);
    } catch (error) {
      continue;
    }
    if (isCandidateEnvelope(doc)) hits.push(path.relative(cache.ROOT, file) || file);
  }
  return hits;
}

/** 不允许自动落地的关系：重复候选里只有 same_offer 值得人去看，而且永远不能自动合并 */
const NEVER_AUTO_MERGE = ['same_offer', 'same_product_different_offer', 'same_vendor', 'uncertain', 'unrelated'];

module.exports = {
  STATUS,
  DECISION,
  NEVER_AUTO_MERGE,
  NEGATION_CUES,
  DETERMINISTIC_GATES,
  shortId,
  leafAssertions,
  assertsSomething,
  checkDeterministic,
  deterministicFailures,
  isAcceptedCandidate,
  acceptedOf,
  acceptedButUnverified,
  isCandidateEnvelope,
  resolveOutputPath,
  readCandidatesStrict,
  makeCandidate,
  buildFromResult,
  partition,
  candidatesPath,
  writeCandidates,
  readCandidates,
  latestCandidatesFile,
  productionTruthFiles,
  productionTruthEnvelopes
};
