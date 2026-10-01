/**
 * 故障注入 provider（`AI_PROVIDER=fail`）：**只给牙测试用**。
 *
 * 牙测试要证明的不是"正常情况下能跑"，而是"坏的时候会怎样"：
 * 超时会不会拖停采集、非法 JSON 会不会被当成候选、非法 enum 会不会落地……
 * 这些都必须**可复现地**制造出来，不能靠"等某天模型真的抽风"。
 *
 * `AI_FAIL_MODE` 决定制造哪一种坏：
 *   timeout / http        → 在传输层失败（provider 返回 ok:false）
 *   json                  → 返回一段不是 JSON 的文本
 *   schema / enum / missing_required → 返回合法 JSON 但违反对应约束
 *   evidence_missing      → JSON 与 schema 都合法，但**没有证据**（由候选层规则 R1 拦）
 *   unsupported_false     → 有引文的 false 断言，但引文里没有任何否定线索（牙测试第 3 条）
 */

'use strict';

const BAD_TEXT = {
  json: '这里是模型的自由发挥，不是 JSON。',
  schema: '{"audience": "student"}'
};

function payloadFor(task, mode) {
  if (BAD_TEXT[mode]) return BAD_TEXT[mode];
  if (mode === 'enum') {
    if (task === 'dedup_pair') {
      return JSON.stringify({ relation: 'same_product', confidence: 0.9, reason: 'x', evidence: ['y'] });
    }
    if (task === 'diagnose_source') {
      return JSON.stringify({ causes: ['unknown_reason'], confidence: 0.5, evidence: ['x'] });
    }
    return JSON.stringify({ audience: ['studentt'], evidence: [{ field: 'audience', quote: '只针对在校学生' }] });
  }
  if (mode === 'missing_required') {
    if (task === 'dedup_pair') return JSON.stringify({ confidence: 0.9, reason: 'x', evidence: ['y'] });
    if (task === 'translate_field') return JSON.stringify({ confidence: 0.9 });
    return JSON.stringify({});
  }
  if (mode === 'evidence_missing') {
    // schema 合法、规则不合法：非 unknown 的字段**没有**同名引文
    return JSON.stringify({
      audience: ['student'],
      benefitType: ['student_plan'],
      evidence: [],
      confidence: { audience: 0.97 }
    });
  }
  if (mode === 'unsupported_false') {
    return JSON.stringify({
      claimRequirements: { creditCardRequired: false },
      evidence: [{ field: 'claimRequirements', quote: '注册后即可开始使用该额度' }],
      confidence: { claimRequirements: 0.91 }
    });
  }
  return JSON.stringify({});
}

async function call(ctx) {
  const mode = process.env.AI_FAIL_MODE || 'timeout';
  if (mode === 'timeout') return { ok: false, reason: 'timeout', detail: '注入的故障：超时' };
  if (mode === 'http') return { ok: false, reason: 'http', detail: '注入的故障：HTTP 500' };
  return {
    ok: true,
    text: payloadFor(ctx.task, mode),
    model: 'fail-injected',
    usage: { inputTokens: 0, outputTokens: 0 }
  };
}

module.exports = { id: 'fail', call };
