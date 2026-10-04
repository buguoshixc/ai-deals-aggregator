// t36 自检：既有条目零弱化（与 git HEAD 版本逐条对账）+ 新增内容齐备
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REL = 'research/coverage-expansion-v1-residual-register.md';
const ROOT = path.resolve(__dirname, '..', '..', '..');
const now = fs.readFileSync(path.join(ROOT, REL), 'utf8');
const head = execFileSync('git', ['show', `HEAD:${REL}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

const out = [];
const say = line => out.push(String(line));
let failures = 0;
function check(name, ok, detail = '') {
  say(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` —— ${detail}`}`);
  if (!ok) failures++;
}

// ① 只追加：HEAD 的每一行都必须在现行文件里按序出现。
// 例外只有两类，且都必须在 §6 的 t36 行里被点名（"不许静默改写"）：表头的「产出者/最后更新/追加说明」块、
// 以及 t34 小节标题（它被替换为带日期的新标题，内容行仍在）。
const DOCUMENTED_EDITS = [
  '> 产出者：ci-gate-engineer（t28 首版，attempt 1；**t34 更新**）· 基线 a4dd40f ·',
  '### t34（本次更新，2026-10-04）'
];
const nowLines = now.split(/\r?\n/);
const headLines = head.split(/\r?\n/);
let cursor = 0;
const missing = [];
for (const line of headLines) {
  const index = nowLines.indexOf(line, cursor);
  if (index < 0) { if (!DOCUMENTED_EDITS.includes(line)) missing.push(line.slice(0, 100)); continue; }
  cursor = index + 1;
}
check('只追加断言：HEAD 的每一行仍按原序存在（例外仅限 §6 已披露的 2 处表头/小节标题改写）', missing.length === 0, `丢失/乱序 ${missing.length} 行：${missing.slice(0, 5).join(' | ')}`);
// 被改写的两行必须在 §6 的 t36 行里有对应披露
check('被改写的表头/标题已在 §6 披露', now.includes('t36 追加（2026-10-04）') && now.includes('### t36（本次更新，2026-10-04）'), '§6 里找不到披露');
check(`行数只增不减（HEAD ${headLines.length} → 现行 ${nowLines.length}）`, nowLines.length >= headLines.length, `${headLines.length} → ${nowLines.length}`);

// ② 关键结论逐字保留
const mustKeep = [
  'b9d97c444e7e59d0d90b2855165a1bc67422b2d0dc573805569d2cc5e6c6f696',
  '**t20（最终报告）与 t21（Self-Audit）必须引用本表**',
  '| **条数** | **34** |',
  '§0 闭环核验：t14 的四条 finding',
  '§1B 本轮新增闭环条目',
  '### §4.1 T15-F6', '### §4.2 T26-F1',
  '| (a) |', '| (j) |'
];
for (const needle of mustKeep) check(`逐字保留：${needle.slice(0, 40)}`, now.includes(needle), '找不到');

// ③ 新增内容齐备（acceptance ①–⑥ 的可机读部分）
const required = [
  ['§4.3 标题', '### §4.3 M24 的边界结论（t35）'],
  ['三层覆盖', '三层覆盖'],
  ['没有第四层', '没有第四层'],
  ['(a) 抄件逐字耦合', '**(a) 抄件逐字耦合**'],
  ['(b) 独立审查', '**(b) 独立审查**'],
  ['(c) 自称牙', '**(c) 自称牙**'],
  ['API 侧 59', 'API 侧 **59**'],
  ['4 条改写件', '4 条改写件'],
  ['提交 af92d5d', 'af92d5d'],
  ['自称牙函数名', 'scanQuoteSelfClaims()'],
  ['292 条 quote', '292 条 quote'],
  ['13 篇文件', '13 篇文件'],
  ['注入后 exit 1', 'exit 1'],
  ['点名路径', 'deals.json deals[130].evidence[0].quote'],
  ['禁止措辞 1', '真实引文已逐条验真'],
  ['禁止措辞 2', '0 命中 ⇒ 引文都是真的'],
  ['官方原文/官方原话 边界', '不纳入自称模式'],
  ['编辑性括注不在射程', '编辑性括注混进引文正文'],
  ['同名 M24 消歧', '两条同名「M24」的消歧'],
  ['M24-①', 'M24-①'],
  ['M24-②', 'M24-②'],
  ['测试改自己', '测试改自己'],
  ['NOT_CAUGHT(KNOWN)', 'NOT_CAUGHT(KNOWN)'],
  ['M26 已删除', '再也落不下去'],
  ['PRECEDENCE 删除行数', '那 **3 行**'],
  ['deriveDimension 出处', 'deriveDimension()'],
  ['M25 复跑读数', '10 项失败'],
  ['§6 t36 小节', '### t36（本次更新，2026-10-04）'],
  ['§6 引用了证据', 'git diff --numstat -- scripts/lib/coverage-targets.js']
];
for (const [name, needle] of required) check(`新增内容：${name}`, now.includes(needle), `找不到 ${JSON.stringify(needle.slice(0, 50))}`);

// ④ 禁止措辞必须只出现在"不许写 / ❌"的上下文里（不得被当成结论使用）
const claim = '真实引文已逐条验真';
let claimViolations = 0;
{
  let index = now.indexOf(claim);
  while (index >= 0) {
    const context = now.slice(Math.max(0, index - 40), index + claim.length + 10);
    // 允许的上下文：明确标为禁止（❌ / 「不许写」/ 不许写成…结论）或反引号包裹的"禁止清单"引用
    const allowed = /❌/.test(context) || /不许/.test(context) || /禁止/.test(context) || /「真实引文已逐条验真」/.test(context);
    if (!allowed) { claimViolations++; say(`   ⚠ 可疑上下文（第 ${now.slice(0, index).split('\n').length} 行）：${context.replace(/\s+/g, ' ')}`); }
    index = now.indexOf(claim, index + claim.length);
  }
}
check(`禁止措辞只出现在"不许写"上下文里（出现 ${now.split(claim).length - 1} 次）`, claimViolations === 0, `${claimViolations} 处可疑`);

say('');
say(failures ? `❌ t36 自检：${failures} 项失败` : '✅ t36 自检：全部通过');
fs.writeFileSync(path.join(__dirname, 't36-selfcheck.txt'), out.join('\n') + '\n', 'utf8');
process.stdout.write(out.join('\n') + '\n');
process.exit(failures ? 1 : 0);
