/**
 * AI 候选的 JSON Schema（唯一出处）。
 *
 * ## 为什么枚举全部从生产模块里 import，而不是在这里重写一遍
 *
 * `scripts/data/curated_*.json` 里把 `studentt` 拼错时，值会被静默清洗掉，
 * 表现与「本来就没写」完全一样 —— `scripts/lib/audience-audit.js` 整个文件就是为这件事存在的。
 * AI 候选是**更强的**同型风险：它由模型生成，拼错的概率比人高得多，而且一次可能几百条。
 *
 * 所以这里的每一张 enum 都直接取 `audience.AUDIENCES` / `audience.BENEFIT_TYPES` /
 * `audience.ELIGIBILITY_KEYS` / `audience.CLAIM_KEYS` / `categories.CATEGORIES`。
 * 生产枚举变了，AI 侧**自动跟着变** —— 不存在「两处各写一份、迟早不一致」。
 *
 * ## 受限子集
 *
 * schema 只写 `scripts/ai/json-schema.js` 支持的那些词。写了不支持的词会在校验时
 * 报 `unsupported_keyword`（fail-closed），而不是被静默忽略。
 */

'use strict';

const audience = require('../lib/audience');
const { CATEGORIES } = require('../lib/categories');
const { EVIDENCE_LANGS } = require('../lib/provenance');

/** 六字段里 AI 可以直接提候选的部分（`provenance` 不是值，不该由 AI 生成） */
const MANAGED_FIELDS = ['audience', 'benefitType', 'eligibilityDetail', 'claimRequirements', 'availability'];

/** 内容字段：AI 可以提候选，但落地通道与六字段不同（见 docs/AI-MAINTENANCE-v2.0.md 第十三节） */
const CONTENT_FIELDS = ['discountInfo', 'eligibility', 'validity'];

/** 候选里可以出现在 `evidence[].field` 的字段名 */
const CANDIDATE_FIELDS = [...MANAGED_FIELDS, ...CONTENT_FIELDS];

const TRISTATE_UNKNOWN = audience.TRISTATE_UNKNOWN; // 'unknown'

/** 三态：只认 true / false / "unknown"。null、0、"true" 都是非法 —— 与生产同一把尺子 */
const TRISTATE = {
  oneOf: [
    { type: 'boolean' },
    { const: TRISTATE_UNKNOWN, description: '原文没有明确说明时必须是这个字面量，不得猜' }
  ]
};

function tristateMap(keys) {
  const properties = {};
  for (const key of keys) properties[key] = { ...TRISTATE, description: key };
  return {
    type: 'object',
    properties,
    additionalProperties: false,
    minProperties: 1
  };
}

const EVIDENCE_ITEM = {
  type: 'object',
  properties: {
    field: { enum: CANDIDATE_FIELDS, description: '这条引文支持哪个字段（必须与断言字段同名）' },
    quote: { type: 'string', minLength: 1, maxLength: 200, description: '官方页原话（≤200 字，逐字摘录）' },
    sourceUrl: { type: 'string', maxLength: 300 },
    lang: { enum: EVIDENCE_LANGS }
  },
  required: ['field', 'quote'],
  additionalProperties: false
};

const CONFIDENCE = { type: 'number', minimum: 0, maximum: 1 };

/* ------------------------------------------------------------------ */
/* 任务 1：优惠字段提取                                                 */
/* ------------------------------------------------------------------ */

const extractOffer = {
  title: 'extract_offer',
  schema: {
    type: 'object',
    properties: {
      audience: {
        type: 'array',
        items: { enum: audience.AUDIENCES },
        maxItems: 6,
        description: '适用人群；原文没写就不要给这个键'
      },
      benefitType: {
        type: 'array',
        items: { enum: audience.BENEFIT_TYPES },
        maxItems: 9
      },
      eligibilityDetail: tristateMap(audience.ELIGIBILITY_KEYS),
      claimRequirements: tristateMap(audience.CLAIM_KEYS),
      availability: {
        type: 'object',
        properties: {
          chinaUsable: { ...TRISTATE },
          regionRestriction: { type: 'string', maxLength: 120 }
        },
        additionalProperties: false,
        minProperties: 1
      },
      discountInfo: { type: 'string', maxLength: 240 },
      eligibility: { type: 'string', maxLength: 120 },
      validity: { type: 'string', maxLength: 60 },
      evidence: {
        type: 'array',
        items: EVIDENCE_ITEM,
        // 上限是「每个可断言字段一条」，不是生产侧那个 3 条：
        // 生产侧 3 条是**版权预算**（存进 deals.json 的引文总量受全库上限约束）；
        // 候选侧是**证据覆盖**——5 个六字段 + 3 个内容字段都可能各需要一条引文。
        // 两者混用会出现一个荒谬的结果：断言了 4 个字段的候选永远无法带上足够证据，
        // 于是它只能被判无效，而不是"证据齐全"。落地时再按 3 条裁剪（见 ai-apply.js）。
        maxItems: 7,
        description: '每个非 unknown 字段都必须在这里有一条同名引文；没有就把它写成 unknown'
      },
      confidence: {
        type: 'object',
        additionalProperties: CONFIDENCE,
        description: 'AI 自己的置信度，不是事实，不参与取值'
      },
      notes: { type: 'string', maxLength: 200 }
    },
    additionalProperties: false
  }
};

/* ------------------------------------------------------------------ */
/* 任务 2：疑似重复                                                     */
/* ------------------------------------------------------------------ */

const DEDUP_RELATIONS = [
  'same_offer',
  'same_product_different_offer',
  'same_vendor',
  'unrelated',
  'uncertain'
];

const dedupPair = {
  title: 'dedup_pair',
  schema: {
    type: 'object',
    properties: {
      relation: { enum: DEDUP_RELATIONS },
      confidence: CONFIDENCE,
      reason: { type: 'string', minLength: 1, maxLength: 200 },
      evidence: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 120 },
        minItems: 1,
        maxItems: 3
      }
    },
    required: ['relation', 'confidence', 'reason', 'evidence'],
    additionalProperties: false
  }
};

/* ------------------------------------------------------------------ */
/* 任务 3：采集器 DOM drift 诊断                                        */
/* ------------------------------------------------------------------ */

const DIAGNOSE_CAUSES = [
  'class_renamed',
  'table_to_cards',
  'ssr_to_spa',
  'wording_changed',
  'login_required',
  'captcha',
  'robots_blocked',
  'http_error',
  'rate_limited',
  'unknown'
];

const diagnoseSource = {
  title: 'diagnose_source',
  schema: {
    type: 'object',
    properties: {
      causes: {
        type: 'array',
        items: { enum: DIAGNOSE_CAUSES },
        minItems: 1,
        maxItems: 4
      },
      confidence: CONFIDENCE,
      evidence: {
        type: 'array',
        items: { type: 'string', minLength: 1, maxLength: 200 },
        minItems: 1,
        maxItems: 4,
        description: '必须引用摘要里的具体数字/标记，不许泛泛而谈'
      },
      suggestedProbes: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            kind: { enum: ['selector', 'regex', 'keyword'] },
            op: { enum: ['add', 'replace', 'remove'] },
            value: { type: 'string', minLength: 1, maxLength: 200 },
            why: { type: 'string', minLength: 1, maxLength: 200 }
          },
          required: ['kind', 'op', 'value', 'why'],
          additionalProperties: false
        }
      },
      patchHint: { type: 'string', maxLength: 400 }
    },
    required: ['causes', 'confidence', 'evidence'],
    additionalProperties: false
  }
};

/* ------------------------------------------------------------------ */
/* 任务 4：采集器补丁候选（只出 diff）                                   */
/* ------------------------------------------------------------------ */

const patchCollector = {
  title: 'patch_collector',
  schema: {
    type: 'object',
    properties: {
      unifiedDiff: { type: 'string', minLength: 1, maxLength: 8000 },
      files: { type: 'array', items: { type: 'string', maxLength: 200 }, minItems: 1, maxItems: 3 },
      rationale: { type: 'string', minLength: 1, maxLength: 600 },
      riskNotes: { type: 'string', maxLength: 400 }
    },
    required: ['unifiedDiff', 'files', 'rationale'],
    additionalProperties: false
  }
};

/* ------------------------------------------------------------------ */
/* 任务 5：翻译草稿                                                     */
/* ------------------------------------------------------------------ */

const translateField = {
  title: 'translate_field',
  schema: {
    type: 'object',
    properties: {
      zh: { type: 'string', minLength: 1, maxLength: 300 },
      confidence: CONFIDENCE,
      notes: { type: 'string', maxLength: 200 }
    },
    required: ['zh', 'confidence'],
    additionalProperties: false
  }
};

/* ------------------------------------------------------------------ */
/* 任务 6：数据质量审计（只报警）                                        */
/* ------------------------------------------------------------------ */

const auditRecord = {
  title: 'audit_record',
  schema: {
    type: 'object',
    properties: {
      findings: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            code: { type: 'string', minLength: 2, maxLength: 60, description: '稳定的短码，便于收敛成确定性规则' },
            severity: { enum: ['info', 'warn', 'error'] },
            field: { type: 'string', maxLength: 40 },
            claim: { type: 'string', minLength: 1, maxLength: 200 },
            contradiction: { type: 'string', minLength: 1, maxLength: 300 },
            suggestedValidatorRule: { type: 'string', maxLength: 200 }
          },
          required: ['code', 'severity', 'claim', 'contradiction'],
          additionalProperties: false
        }
      },
      confidence: CONFIDENCE
    },
    required: ['findings', 'confidence'],
    additionalProperties: false
  }
};

/* ------------------------------------------------------------------ */

const SCHEMAS = {
  extract_offer: extractOffer.schema,
  dedup_pair: dedupPair.schema,
  diagnose_source: diagnoseSource.schema,
  patch_collector: patchCollector.schema,
  translate_field: translateField.schema,
  audit_record: auditRecord.schema
};

/** 提示词版本：改提示词就升版本号。版本号进候选信封、缓存 key 与成本记账 */
const PROMPT_VERSIONS = {
  extract_offer: 'extract-offer-v1',
  dedup_pair: 'dedup-pair-v1',
  diagnose_source: 'collector-diagnose-v1',
  patch_collector: 'collector-patch-v1',
  translate_field: 'translate-field-v1',
  audit_record: 'audit-record-v1'
};

/**
 * 每次任务的输入上限（字符）。
 * 网页**不整页送**：先经 `redact.js` 做 DOM 清洗 → 正文提取 → 截到这里的上限。
 */
const TASK_LIMITS = {
  extract_offer: 12000,
  diagnose_source: 8000,
  patch_collector: 8000,
  dedup_pair: 4000,
  audit_record: 4000,
  translate_field: 2000
};

const TASKS = Object.keys(SCHEMAS);

module.exports = {
  SCHEMAS,
  PROMPT_VERSIONS,
  TASK_LIMITS,
  TASKS,
  MANAGED_FIELDS,
  CONTENT_FIELDS,
  CANDIDATE_FIELDS,
  DEDUP_RELATIONS,
  DIAGNOSE_CAUSES,
  TRISTATE,
  TRISTATE_UNKNOWN,
  EVIDENCE_ITEM,
  CONFIDENCE,
  CATEGORIES
};
