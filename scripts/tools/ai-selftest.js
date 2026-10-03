#!/usr/bin/env node
/**
 * AI 层自检（v2.0）—— **离线、确定性**，因此进得了门禁。
 *
 * 这里测的不是"AI 聪明不聪明"，而是**边界守不守得住**。
 * 每一条都对应一个具体的失败模式，而且每一条都必须在没有 API key、没有网络的情况下跑得动：
 * 一条只有在"模型今天恰好抽风"时才能验证的规则，等于没有规则。
 *
 * 六颗主牙（对应 docs/AI-MAINTENANCE-v2.0.md 的牙测试清单）：
 *   1  非 unknown 的断言没有证据        → 候选无效
 *   2  非法 enum                        → 候选无效
 *   3  没有证据支撑的 false             → 审核层必须能发现（降级 needs_human）
 *   4  模型认为两条同厂商记录重复        → 结构上不可能自动合并
 *   5  AI 超时 / 挂掉                    → 确定性链路丝毫不变
 *   6  候选里出现密钥形状的串            → 安全扫描必须报警
 *
 * 加上「候选 → 生产真值」这条红线上的三颗（§10.5 的完整生命周期，也是 P1-1 / P2-14 的回归钉）：
 *   7  生成侧只能写 .ai-cache/** 或 research/**；生产真值（deals.json / plans.json /
 *      api-plans.json / models.json / model-registry-links.json / scripts/data/** …）**结构上拒绝**；
 *      `../` 穿越、`.ai-cache/../deals.json` 一律 exit≠0，且真值文件逐字节不变
 *   8  「必须人工 accept」只有一处判据（`candidates.acceptedOf`）：未经 accept 的候选一个都推不动，
 *      人点了 accept 但机器门没过的同样拒绝；生成层不得调用 accept/apply 工具（隐式 accept 结构性不可能）
 *   9  候选信封被手工复制进生产真值时，必须有一个 gate 报警（等价 Gate，见 `productionTruthEnvelopes`）
 *
 * 另有若干结构性牙（模块边界、缓存确定性、声明表覆盖、快照体积、.ai-cache 不入仓……）：
 * 它们守的是那些"靠纪律记不住"的事。
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// 自检自己要用的缓存目录：放临时区，绝不污染仓库里的 .ai-cache
process.env.AI_CACHE_DIR = path.join(os.tmpdir(), `ai-selftest-${process.pid}-${Date.now()}`);

const ROOT = path.join(__dirname, '..', '..');

const provider = require('../ai/provider');
const schemas = require('../ai/schemas');
const candidates = require('../ai/candidates');
const cache = require('../ai/cache');
const usage = require('../ai/usage');
const pricing = require('../ai/pricing');
const redact = require('../ai/redact');
const guard = require('../ai/translate-guard');
const patch = require('../ai/patch');
const dedupAi = require('../ai/dedup');
const domDigest = require('../lib/dom-digest');
const secretScan = require('../lib/secret-scan');
const registry = require('../collectors');
const { validateValue } = require('../ai/json-schema');

let checks = 0;
let failures = 0;
const failed = [];

function ok(name, detail = '') {
  checks++;
  console.log(`  ✓ ${name}${detail ? `  —— ${detail}` : ''}`);
}

function bad(name, detail) {
  checks++;
  failures++;
  failed.push(name);
  console.log(`  ✗ ${name}  —— ${detail}`);
}

function assert(name, condition, detail = '') {
  if (condition) ok(name);
  else bad(name, detail || '断言失败');
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function sha256File(rel) {
  return sha256(fs.readFileSync(path.join(ROOT, rel)));
}

/** 跑一个 CLI 子进程，失败（非 0 退出）也把 stdout+stderr 拿回来 */
function runCli(script, args, env = {}) {
  try {
    const output = execFileSync(process.execPath, [path.join(ROOT, script), ...args], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env }
    });
    return { status: 0, output };
  } catch (error) {
    return {
      status: Number.isInteger(error.status) && error.status !== 0 ? error.status : 1,
      output: `${error.stdout || ''}${error.stderr || ''}` || String(error.message)
    };
  }
}

function throws(fn) {
  try {
    fn();
    return false;
  } catch (error) {
    return true;
  }
}

/**
 * 静态扫描只看**代码**，不看注释：注释里出现 `review.decision === 'accept'` 是说明，
 * 不是实现（扫描要是连说明都算，下一个人就会把说明删掉以"修绿"，那才是最坏的结果）。
 */
function codeOf(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/* ================================================================== */
/* 六颗主牙                                                            */
/* ================================================================== */

async function tooth1_missingEvidence() {
  process.env.AI_PROVIDER = 'fail';
  process.env.AI_FAIL_MODE = 'evidence_missing';
  const r = await provider.generateStructured({ task: 'extract_offer', system: 'x', content: 'y'.repeat(20), cache: false });
  if (!r.ok) return bad('牙1 非 unknown 断言必须有证据', `provider 层就失败了：${r.invalid.reason}`);
  const built = candidates.buildFromResult({
    result: r.result, meta: r.meta, task: 'extract_offer', dealId: 'tooth1',
    candidateValue: r.result, evidence: r.result.evidence, confidence: r.result.confidence
  });
  if (!built.invalid) return bad('牙1 非 unknown 断言必须有证据', '没有证据的断言被放行了');
  assert('牙1 非 unknown 断言必须有证据', /R1/.test(built.invalid.detail), built.invalid.detail.slice(0, 90));
}

async function tooth2_invalidEnum() {
  process.env.AI_PROVIDER = 'fail';
  process.env.AI_FAIL_MODE = 'enum';
  // cache:false 是必须的：牙测试不能依赖（也不能污染）缓存状态，
  // 否则第二次跑会拿到上一次的响应，"这次测的是什么"就说不清了。
  const r = await provider.generateStructured({ task: 'extract_offer', system: 'x', content: 'y'.repeat(20), cache: false });
  assert('牙2 非法 enum 必须判无效', !r.ok && r.invalid.reason === 'enum_invalid', r.ok ? '放行了非法枚举' : r.invalid.detail.slice(0, 90));

  // 三态的字面量纪律：null / 0 / "true" 都不许通过
  const lenient = validateValue(schemas.SCHEMAS.extract_offer, { eligibilityDetail: { studentRequired: null } });
  assert('牙2b 三态不接受 null', !lenient.ok, 'null 被当成合法三态放行了');
  const bogus = validateValue(schemas.SCHEMAS.extract_offer, { eligibilityDetail: { studentRequired: 'true' } });
  assert('牙2c 三态不接受字符串 "true"', !bogus.ok, '字符串被当成布尔放行了');
}

async function tooth3_unsupportedFalse() {
  process.env.AI_PROVIDER = 'fail';
  process.env.AI_FAIL_MODE = 'unsupported_false';
  const r = await provider.generateStructured({ task: 'extract_offer', system: 'x', content: 'y'.repeat(20), cache: false });
  const built = candidates.buildFromResult({
    result: r.result, meta: r.meta, task: 'extract_offer', dealId: 'tooth3',
    candidateValue: r.result, evidence: r.result.evidence, confidence: r.result.confidence
  });
  if (!built.candidate) return bad('牙3 无据的 false 必须被审核层标出', `候选被直接判无效（也算拦住，但期望是降级）: ${built.invalid.detail}`);
  const flagged = built.candidate.status === 'needs_human' && built.candidate.flags.some(f => f.code === 'unsupported_false');
  assert('牙3 无据的 false 必须被审核层标出', flagged, `status=${built.candidate.status} flags=${built.candidate.flags.map(f => f.code).join(',')}`);

  // 反向：引文里带否定线索时应当放行（否则这条规则会因为误报而被关掉）
  const withNegation = candidates.checkDeterministic(
    { claimRequirements: { creditCardRequired: false } },
    { task: 'extract_offer', evidence: [{ field: 'claimRequirements', quote: '无需信用卡即可开通' }], confidence: {} }
  );
  assert('牙3b 有否定线索的 false 不被误报', withNegation.errors.length === 0 && withNegation.flags.length === 0,
    JSON.stringify(withNegation));
}

function tooth4_noAutoMerge() {
  const exported = Object.keys(dedupAi);
  const forbidden = exported.filter(name => /merge|apply|accept|write|update|save/i.test(name));
  assert('牙4 AI 去重模块不得导出任何合并/写入符号', forbidden.length === 0, `导出了 ${forbidden.join(',')}`);

  // 端到端：真跑一轮疑似重复候选，确认 deals.json 一个字节都没变
  const before = sha256(read('deals.json'));
  let output = '';
  try {
    output = execFileSync(process.execPath, [path.join(ROOT, 'scripts/ai/maintenance.js'), '--task=dedup', '--provider=fail', '--limit=3'], {
      cwd: ROOT, encoding: 'utf8', env: { ...process.env, AI_PROVIDER: 'fail', AI_FAIL_MODE: 'enum' }
    });
  } catch (error) {
    return bad('牙4b 跑一轮重复候选后 deals.json 不变', `维护任务异常：${String(error.message).slice(0, 120)}`);
  }
  const after = sha256(read('deals.json'));
  assert('牙4b 跑一轮重复候选后 deals.json 不变', before === after, 'deals.json 被改动了');
  assert('牙4c 重复候选不写入任何生产文件', !/写盘|已写入 deals/.test(output), '输出里出现了写生产文件的迹象');
}

function tooth5_aiFailureIsNotOutage() {
  // ① 结构：采集链路不许引用 AI 层
  const coreFiles = ['scripts/collect.js', 'scripts/lib/store.js', 'scripts/lib/dedup.js'];
  const leaks = [];
  for (const rel of coreFiles) {
    const text = read(rel);
    if (/require\(['"][^'"]*\/ai\//.test(text) || /require\(['"]\.\/ai\//.test(text) || /scripts\/ai\//.test(text)) leaks.push(rel);
  }
  assert('牙5 确定性链路不得引用 AI 层', leaks.length === 0, leaks.join(', '));

  // ② 行为：把 AI 设成必然失败，核心命令的产出必须一模一样
  const run = env => execFileSync(process.execPath, [path.join(ROOT, 'scripts/collect.js'), '--list'], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }
  });
  const offOut = run({ AI_PROVIDER: 'off' });
  const failOut = run({ AI_PROVIDER: 'fail', AI_FAIL_MODE: 'timeout' });
  assert('牙5b AI 超时不影响采集器清单', offOut === failOut, '两次输出不同');

  const validateOk = (() => {
    try {
      execFileSync(process.execPath, [path.join(ROOT, 'scripts/validate.js')], {
        cwd: ROOT, encoding: 'utf8', env: { ...process.env, AI_PROVIDER: 'fail', AI_FAIL_MODE: 'thttp' }
      });
      return true;
    } catch (error) {
      return false;
    }
  })();
  assert('牙5c AI 挂掉时 validate 仍然通过', validateOk, '确定性门禁受 AI 影响');

  // ③ provider 永不 throw：五种坏法都收敛成结构化结果。
  //    这里用 `dedup_pair` 而不是 `extract_offer`：后者的所有字段都是可选的
  //    （"什么都没查到"是合法结果），所以它**产生不出** missing_required 这种坏法。
  const reasons = new Set();
  const modes = ['timeout', 'http', 'json', 'enum', 'missing_required'];
  return (async () => {
    for (const mode of modes) {
      process.env.AI_FAIL_MODE = mode;
      const r = await provider.generateStructured({
        task: 'dedup_pair', system: 'x', content: `${mode}`.repeat(10),
        provider: 'fail', cache: false
      });
      if (r.ok) reasons.add(`unexpected_ok:${mode}`);
      else reasons.add(`${mode}=>${r.invalid.reason}`);
    }
    delete process.env.AI_FAIL_MODE;
    const noProvider = await provider.generateStructured({ task: 'dedup_pair', system: 'x', content: 'z'.repeat(10), provider: 'off', cache: false });
    const allClassified = modes.every(mode => [...reasons].some(entry => entry.startsWith(`${mode}=>`)));
    assert('牙5d provider 永不抛异常且失败可归类',
      allClassified && noProvider.invalid.reason === 'no_provider',
      [...reasons].join(', '));
  })();
}

function tooth6_secretScan() {
  const samples = [
    `OPENAI_API_KEY=sk-${'A'.repeat(32)}`,
    `AKIA${'B'.repeat(16)}`,
    `Authorization: Bearer ${'c'.repeat(40)}`,
    '-----BEGIN RSA PRIVATE KEY-----',
    `ghp_${'d'.repeat(30)}`,
    `AIza${'e'.repeat(35)}`
  ];
  const missed = samples.filter(sample => !secretScan.hasSecret(sample));
  assert('牙6 密钥模式扫描覆盖六类样本', missed.length === 0, `漏检 ${missed.length} 类`);

  const preview = secretScan.scanText(samples[0])[0];
  assert('牙6b 扫描结果不泄露完整密钥', preview && !preview.preview.includes('A'.repeat(32)), JSON.stringify(preview));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-secret-'));
  const leaky = path.join(dir, 'candidate.json');
  fs.writeFileSync(leaky, JSON.stringify({ task: 'extract_offer', note: `key: sk-${'F'.repeat(30)}` }), 'utf8');
  const hits = secretScan.scanFiles([dir]);
  assert('牙6c 候选文件里的密钥会被扫出来', hits.length === 1 && hits[0].hits.length > 0, `命中 ${hits.length} 个文件`);

  const buildSource = read('scripts/tools/build-local.js');
  assert('牙6d 产物自检已接入密钥扫描', /secretScan|secret-scan/.test(buildSource), 'build-local.js 里没有扫描调用');

  const redacted = redact.prepareInput({ text: `key: sk-${'G'.repeat(30)}`, maxChars: 500 });
  assert('牙6e 送模型前会脱敏', !redacted.text.includes('G'.repeat(30)) && redacted.redacted > 0, JSON.stringify(redacted.text.slice(0, 80)));
}

/* ================================================================== */
/* 牙7–9：候选 → 生产真值这条红线（P1-1 / P2-14 的回归钉）             */
/* ================================================================== */

/**
 * 生产真值清单：AI 生成物与 accept/apply 之外的任何路径都不许写它们。
 * 与 `candidates.productionTruthFiles()` 同一口径（那份是给"信封扫描"用的），这里只关心指纹。
 */
const TRUTH_FILES = [
  'deals.json', 'plans.json', 'api-plans.json', 'models.json', 'model-registry-links.json',
  path.join('scripts', 'data', 'deal-history.json'),
  path.join('scripts', 'data', 'plan-history.json'),
  path.join('scripts', 'data', 'api-plan-history.json'),
  path.join('scripts', 'data', 'curated_cn.json'),
  path.join('scripts', 'data', 'curated_global.json'),
  path.join('scripts', 'data', 'audience-overrides.json'),
  path.join('scripts', 'data', 'translations_zh.json')
];

function truthSnapshot() {
  const map = new Map();
  for (const rel of TRUTH_FILES) map.set(rel, sha256File(rel));
  return map;
}

/** 造一份自检夹具（落在自检自己的临时缓存目录里 —— 那里在白名单内，且绝不碰仓库里的 .ai-cache） */
function writeFixtureEnvelope({ tag, decision = null, deterministic = null }) {
  const deal = JSON.parse(read('deals.json')).deals.find(item => item.type === 'deal');
  const candidate = candidates.makeCandidate({
    task: 'extract_offer',
    dealId: deal.id,
    field: 'audience',
    sourceUrl: deal.url,
    provider: 'off',
    model: 'selftest',
    promptVersion: 'selftest',
    inputHash: 'sha256:selftest',
    candidate: { audience: ['student'] },
    evidence: [{ field: 'audience', quote: 'Students can start free with a campus email.' }],
    confidence: { audience: 0.9 }
  });
  if (deterministic) Object.assign(candidate.deterministic, deterministic);
  if (decision) {
    candidate.review = { decision, at: new Date().toISOString(), note: '自检夹具：人工决定' };
    candidate.status = 'accepted';
  }
  const payload = {
    schemaVersion: 1,
    task: 'extract_offer',
    label: '自检夹具',
    promptVersion: 'selftest',
    provider: 'off',
    model: 'selftest',
    generatedAt: new Date().toISOString(),
    generatedForDate: '2026-01-01',
    counts: { units: 1, runnable: 1, candidates: 1, needsHuman: 0, invalid: 0, skipped: 0, cachedCalls: 0, calls: 0 },
    invalid: [],
    skipped: [],
    candidates: [candidate]
  };
  const file = path.join(cache.candidatesDir(), `selftest-${tag}.json`);
  candidates.writeCandidates(file, payload, { cause: decision ? 'review' : 'generation' });
  return { file, candidate, payload };
}

function tooth7_generationCannotWriteTruth() {
  const before = truthSnapshot();

  // ① 结构：全部生产真值文件 + 穿越路径，一个都不许写（单元级，无副作用）
  const refused = [];
  for (const rel of TRUTH_FILES) {
    if (!throws(() => cache.assertAiOutputPath(path.join(ROOT, rel), { label: '候选文件' }))) refused.push(rel);
  }
  for (const rel of ['../deals.json', '.ai-cache/../deals.json', 'research/../deals.json',
    'scripts/data/../deals.json', 'scripts/data/deal-history.json', '.git/config',
    'research/audit/AUDIT-SUMMARY-ALL.md']) {
    if (!throws(() => cache.assertAiOutputPath(path.join(ROOT, rel), { label: '候选文件' }))) refused.push(rel);
  }
  assert('牙7a 生成侧结构上拒绝全部生产真值与穿越路径', refused.length === 0, `漏放 ${refused.join(', ')}`);

  // 反向：白名单本身不许形同虚设（否则上面那组断言会因为"全都拒绝"而假绿）
  assert('牙7b 白名单允许 .ai-cache/** 与 research/**',
    !throws(() => cache.assertAiOutputPath(path.join(ROOT, '.ai-cache', 'candidates', 'x.json'))) &&
    !throws(() => cache.assertAiOutputPath(path.join(ROOT, 'research', 'x.json'))));

  // ② 端到端：真跑生成命令，非法落点必须 exit≠0（探针刻意选**尚不存在的生产目录内文件**：
  //    断言在守卫坏掉时也必须安全 —— 它最多创建一个可删的探针，不会覆盖任何真值文件）
  const probe = path.join(ROOT, 'scripts', 'data', 'ai-selftest-out-probe.json');
  const spawned = runCli('scripts/ai/maintenance.js',
    ['--task=translate', '--limit=1', '--provider=off', '--out=scripts/data/ai-selftest-out-probe.json'],
    { AI_PROVIDER: 'off' });
  assert('牙7c 生成侧非法 --out 端到端 exit≠0', spawned.status !== 0 && /拒绝/.test(spawned.output),
    `exit=${spawned.status} ${spawned.output.slice(-120)}`);
  assert('牙7d 被拒的落点没有留下任何文件', !fs.existsSync(probe), probe);

  // ③ 端到端：合法落点必须能写（否则"拒绝"没有意义）。
  //    用**自检自己的临时缓存目录**的绝对路径，避免污染仓库里的 .ai-cache。
  const okFile = path.join(cache.candidatesDir(), 'selftest-legal-out.json');
  const legal = runCli('scripts/ai/maintenance.js',
    ['--task=translate', '--limit=1', '--provider=off', `--out=${okFile}`],
    { AI_PROVIDER: 'off' });
  assert('牙7e 生成侧合法 --out（.ai-cache/candidates/**）写入成功',
    legal.status === 0 && fs.existsSync(okFile), `exit=${legal.status} ${legal.output.slice(-120)}`);

  // ④ 结构：即使绕过 CLI，写函数本身也拒绝（"生成侧不能写生产"不是参数校验，是落盘层的结构）
  const payload = { schemaVersion: 1, task: 'translate_field', candidates: [] };
  assert('牙7f 绕过 CLI 直接调写函数同样拒绝写生产真值',
    throws(() => candidates.writeCandidates(path.join(ROOT, 'deals.json'), payload)) &&
    throws(() => candidates.writeCandidates(path.join(ROOT, 'scripts', 'data', 'curated_cn.json'), payload)));

  // ⑤ 生成侧不许产出「已经下过人工决定」的候选（implicit accept 在结构上写不出去）
  const pending = writeFixtureEnvelope({ tag: 'generation-ok' });
  assert('牙7g 生成路径拒绝写出带 review.decision 的候选',
    throws(() => candidates.writeCandidates(path.join(cache.candidatesDir(), 'selftest-leak.json'),
      { ...pending.payload, candidates: [{ ...pending.candidate, review: { decision: 'accept' } }] }, { cause: 'generation' })));
  assert('牙7h 生成产出的候选一律「未下决定」',
    pending.payload.candidates.every(item => item.review.decision === null && item.status !== 'accepted'));

  // ⑥ 真实生成（离线 mock provider，确定性）：产出的候选一律「未下决定」，
  //    且整轮生成不碰任何生产真值（顺势把"真的产出了候选"的情形也纳进指纹对比）
  const realOut = path.join(cache.candidatesDir(), 'selftest-real-generation.json');
  const real = runCli('scripts/ai/maintenance.js',
    ['--task=extract', '--source=record', '--limit=1', '--provider=mock', `--out=${realOut}`],
    {
      AI_PROVIDER: 'mock',
      AI_MOCK_RESPONSE: JSON.stringify({
        audience: ['student'],
        evidence: [{ field: 'audience', quote: 'Students can start free with a campus email.' }],
        confidence: { audience: 0.9 }
      })
    });
  const realDoc = fs.existsSync(realOut) ? JSON.parse(fs.readFileSync(realOut, 'utf8')) : null;
  assert('牙7j 真实生成（离线 mock provider）产出了候选', Boolean(realDoc && realDoc.candidates.length),
    `exit=${real.status} ${real.output.slice(-160)}`);
  assert('牙7k 生成产出的候选一律未下决定、且不在可落地集合里',
    Boolean(realDoc) && realDoc.candidates.every(item => item.review.decision === null && item.status !== 'accepted') &&
    candidates.acceptedOf(realDoc || {}).length === 0);

  // ⑦ 全量指纹：跑完这一串生成命令（含一次真实生成），生产真值一个字节都没变
  const changed = [...truthSnapshot()].filter(([rel, hash]) => before.get(rel) !== hash).map(([rel]) => rel);
  assert('牙7i 生成侧跑完，生产真值逐字节不变', changed.length === 0, changed.join(', '));
}

function tooth8_noImplicitAccept() {
  // ① 纯函数：判定只有一处实现，且三个条件缺一不可
  const pending = writeFixtureEnvelope({ tag: 'pending' });
  assert('牙8a 未经 accept 的候选集合为空', candidates.acceptedOf(pending.payload).length === 0);

  const accepted = writeFixtureEnvelope({ tag: 'accepted', decision: 'accept' });
  assert('牙8b 显式 accept 之后恰好 1 条可落地', candidates.acceptedOf(accepted.payload).length === 1);
  assert('牙8c 状态与决定必须一致（status=accepted 才算数）',
    candidates.acceptedOf({ candidates: [{ ...accepted.candidate, status: 'candidate' }] }).length === 0);
  assert('牙8d 机器门（schema/enum/evidence）缺一关都不算数',
    candidates.acceptedOf({ candidates: [{ ...accepted.candidate, deterministic: { schema: 'fail', enum: 'pass', evidence: 'pass' } }] }).length === 0);

  // ② 端到端（M17 的原命令形态）：未接受候选推不动；显式 accept 之后才推得动
  const pendingRun = runCli('scripts/tools/ai-apply.js',
    ['--all-accepted', '--dry-run', `--file=${pending.file}`]);
  assert('牙8e 未接受候选：ai-apply exit≠0 且拒绝落地（M17 回归钉）',
    pendingRun.status !== 0 && /没有"已接受"的候选匹配/.test(pendingRun.output),
    `exit=${pendingRun.status} ${pendingRun.output.slice(-160)}`);

  const acceptRun = runCli('scripts/tools/ai-accept.js',
    [`--id=${pending.candidate.id}`, `--file=${pending.file}`, '--note=自检：人工确认']);
  assert('牙8f 显式 accept 是一个独立动作（ai-accept 写在候选文件里）', acceptRun.status === 0, acceptRun.output.slice(-160));
  assert('牙8g accept 之后 re-read 仍只认那一条',
    candidates.acceptedOf(candidates.readCandidatesStrict(pending.file)).length === 1);

  const acceptedRun = runCli('scripts/tools/ai-apply.js',
    ['--all-accepted', '--dry-run', `--file=${pending.file}`]);
  assert('牙8h 显式 accept 之后 ai-apply 推进到写入判定点',
    acceptedRun.status === 0 && /会写入/.test(acceptedRun.output), `exit=${acceptedRun.status} ${acceptedRun.output.slice(-160)}`);

  // ③ 人点了 accept、机器门没过：仍然拒绝（点名，不静默丢）
  const broken = writeFixtureEnvelope({ tag: 'broken', decision: 'accept', deterministic: { schema: 'fail' } });
  const brokenRun = runCli('scripts/tools/ai-apply.js',
    ['--all-accepted', '--dry-run', `--file=${broken.file}`]);
  assert('牙8i 人工接受但机器门未过：ai-apply exit≠0 并点名',
    brokenRun.status !== 0 && /机器门未过/.test(brokenRun.output), `exit=${brokenRun.status} ${brokenRun.output.slice(-160)}`);

  // ④ 手改候选：assert 的内容没有同名引文 → ai-accept 必须拒绝（schema/domain 门在这里再核一遍）
  const tampered = writeFixtureEnvelope({ tag: 'tampered' });
  const tamperedDoc = candidates.readCandidatesStrict(tampered.file);
  tamperedDoc.candidates[0].candidate.discountInfo = '手改出来的优惠';
  fs.writeFileSync(tampered.file, `${JSON.stringify(tamperedDoc, null, 2)}\n`, 'utf8');
  const tamperedRun = runCli('scripts/tools/ai-accept.js',
    [`--id=${tampered.candidate.id}`, `--file=${tampered.file}`, '--note=自检：手改的']);
  assert('牙8j 手改候选（断言无引文）在 accept 时被机器门拒绝',
    tamperedRun.status !== 0 && /机器门未通过/.test(tamperedRun.output), `exit=${tamperedRun.status} ${tamperedRun.output.slice(-160)}`);

  // ⑤ 结构：接受判定只有一处实现 + 生成层碰不到 accept/apply 工具
  const applyCode = codeOf(read('scripts/tools/ai-apply.js'));
  assert('牙8k ai-apply 的接受判定走唯一实现 candidates.acceptedOf（不再有行内 filter）',
    /candidates\.acceptedOf\(/.test(applyCode) && !/review\.decision\s*===\s*['"]accept['"]/.test(applyCode),
    '又出现了行内的 accept filter');
  const aiFiles = fs.readdirSync(path.join(ROOT, 'scripts/ai')).filter(name => name.endsWith('.js'));
  const leaks = aiFiles.filter(name =>
    /require\([^)]*tools\/ai-(apply|accept)|exec(File)?Sync\([^)]*ai-(apply|accept)/.test(codeOf(read(path.join('scripts/ai', name)))));
  assert('牙8l 生成层（scripts/ai/**）不得调用 accept/apply 工具（禁隐式 accept）',
    leaks.length === 0, leaks.join(', '));
}

function tooth9_candidateEnvelopeInProduction() {
  // ① 现状：生产真值里一个候选信封都不许有
  const hits = candidates.productionTruthEnvelopes();
  assert('牙9a 生产真值里没有候选信封（AI 输出没有绕过 accept 混进来）', hits.length === 0, hits.join(', '));

  // ② 检测器自身必须会报警：把一份真的候选信封放到一个"生产真值"位置上看它抓不抓
  //    （只读地传一份文件清单进去 —— 不往生产目录写任何东西）
  const sample = path.join(cache.mockDir(), 'envelope-sample.json');
  const payload = writeFixtureEnvelope({ tag: 'envelope-sample' }).payload;
  fs.writeFileSync(sample, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const caught = candidates.productionTruthEnvelopes([
    sample,
    path.join(ROOT, 'deals.json'),
    path.join(ROOT, 'scripts', 'data', 'deal-history.json')
  ]);
  assert('牙9b 检测器能认出被复制进生产真值的候选信封', caught.length === 1 && caught[0].endsWith('envelope-sample.json'),
    caught.join(', '));

  // ③ 反例：正常的生产真值不许被误报（否则这条门会因为误报而被关掉）
  const falsePositives = candidates.productionTruthEnvelopes([
    path.join(ROOT, 'deals.json'),
    path.join(ROOT, 'scripts', 'data', 'deal-history.json'),
    path.join(ROOT, 'scripts', 'data', 'audience-overrides.json')
  ]);
  assert('牙9c 正常生产真值不被误报', falsePositives.length === 0, falsePositives.join(', '));
}

/* ================================================================== */
/* 结构性牙                                                            */
/* ================================================================== */

function structuralTeeth() {
  // 候选信封
  const envelope = candidates.makeCandidate({
    task: 'extract_offer', dealId: 'x', promptVersion: 'v1', inputHash: 'sha256:0',
    candidate: { audience: ['student'] }, evidence: [], confidence: {}
  });
  for (const key of ['generatedAt', 'provider', 'model', 'promptVersion', 'inputHash', 'candidate', 'evidence', 'confidence', 'status']) {
    if (!(key in envelope)) {
      bad('结构 候选信封字段齐全', `缺 ${key}`);
      return;
    }
  }
  ok('结构 候选信封字段齐全（可追溯：谁、何时、基于什么）');

  // 缓存 key 的确定性
  const keyOf = (patchObj = {}) => cache.cacheKeyOf({ task: 't', promptVersion: 'v1', provider: 'p', model: 'm', inputHash: 'sha256:abc', ...patchObj });
  assert('结构 缓存 key 与时间无关且可复现', keyOf() === keyOf(), '两次算出不同 key');
  assert('结构 缓存 key 随 promptVersion 变化', keyOf() !== keyOf({ promptVersion: 'v2' }), 'promptVersion 没进 key');
  assert('结构 缓存 key 随 model 变化', keyOf() !== keyOf({ model: 'm2' }), 'model 没进 key');
  assert('结构 canonicalJson 与键序无关',
    cache.canonicalJson({ b: 1, a: [2, { d: 4, c: 3 }] }) === cache.canonicalJson({ a: [2, { c: 3, d: 4 }], b: 1 }),
    '键序影响了哈希');

  // 声明表覆盖：注册的采集器一个都不能少（含无头来源 —— 它们也在探针表里）
  let ids;
  try {
    ids = registry.all({ headless: true }).map(entry => entry.id);
  } catch (error) {
    ids = registry.all().map(entry => entry.id);
  }
  const coverage = domDigest.probeCoverage(ids);
  assert('结构 探针声明表覆盖全部注册采集器', coverage.missing.length === 0 && coverage.unknown.length === 0,
    `缺 ${coverage.missing.join(',') || '无'} / 多 ${coverage.unknown.join(',') || '无'}`);

  // fixture 与注册表一致（只看目录；scripts/data/fixtures/ 里还躺着 v1.1 的两个迁移样例文件）
  const fixturesDir = path.join(ROOT, 'scripts/data/fixtures');
  const fixtureDirs = fs.existsSync(fixturesDir)
    ? fs.readdirSync(fixturesDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name)
    : [];
  const declared = registry.all().filter(entry => entry.fixture).map(entry => entry.fixture);
  const undeclared = fixtureDirs.filter(name => !declared.includes(name));
  assert('结构 每个 fixture 都有采集器登记', undeclared.length === 0 && fixtureDirs.length > 0,
    undeclared.length ? undeclared.join(',') : '一个 fixture 目录都没有');

  // 快照：不含正文、体积可控
  const prose = '这是一段只应该出现在摘要之外的正文'.repeat(3);
  const snapshotProbe = domDigest.digest(
    `<html><head><title>${prose}</title></head><body><p>${prose}</p><table><tr><td>a</td></tr></table></body></html>`,
    { probes: domDigest.probesFor('layer3labs'), url: 'https://example.com' }
  );
  // 判据刻意做成**结构性**的，而不是"某个词没出现"：
  // 摘要里除 url 外不允许出现超过 40 字的字符串 —— 页面正文/标题/段落来多少都会被挡住，
  // 而计数、标记、类名、我们声明的探针词全在阈值之内。
  // （写成关键词黑名单的话，下一次有人往摘要里加一个 heading 字段时，它什么都不会说。）
  const longStrings = [];
  const walkDigest = (value, path) => {
    if (typeof value === 'string') {
      if (value.length > 40 && !path.endsWith('.url')) longStrings.push(`${path}(${value.length} 字)`);
      return;
    }
    if (Array.isArray(value)) { value.forEach((item, index) => walkDigest(item, `${path}[${index}]`)); return; }
    if (value && typeof value === 'object') for (const key of Object.keys(value)) walkDigest(value[key], `${path}.${key}`);
  };
  walkDigest(snapshotProbe, 'digest');
  assert('结构 页面摘要不含页面正文', longStrings.length === 0,
    `摘要里出现了超过 40 字的字符串：${longStrings.slice(0, 3).join('、')}`);
  const doc = domDigest.buildSnapshotDoc({ entries: ids.map(id => ({ source: id, name: id, digests: [snapshotProbe] })) });
  const serialized = domDigest.serializeSnapshotDoc(doc);
  assert('结构 快照文件在体积上限内', Buffer.byteLength(serialized) <= domDigest.MAX_SNAPSHOT_BYTES,
    `${Buffer.byteLength(serialized)} 字节`);

  // 快照的两代推进
  const doc2 = domDigest.buildSnapshotDoc({ previousDoc: doc, entries: ids.map(id => ({ source: id, name: id, digests: [snapshotProbe] })) });
  const row = doc2.sources[0];
  assert('结构 快照保留两代（current/previous）', Boolean(row.current) && Boolean(row.previous), JSON.stringify(Object.keys(row)));

  // .ai-cache 不入仓
  const gitignore = read('.gitignore');
  assert('结构 .ai-cache 已被 gitignore', /^\.ai-cache\/?$/m.test(gitignore), '.gitignore 里没有 .ai-cache');

  // 生产数据契约不变：deal 记录里不许出现 status 之类的新字段
  const deals = JSON.parse(read('deals.json'));
  const sample = deals.deals[0];
  assert('结构 deal 记录未新增 AI 字段', !('aiCandidate' in sample) && !('status' in sample) && !('assist' in sample),
    Object.keys(sample).filter(k => /ai|candidate|assist|status/i.test(k)).join(','));

  // 译文守卫：对 63 篇人工译文零误报（这条是守卫能不能被信任的关键）
  const overlay = JSON.parse(read('scripts/data/translations_zh.json'));
  const byId = new Map(deals.deals.map(deal => [deal.id, deal]));
  let pairs = 0;
  const falsePositives = [];
  for (const [id, entry] of Object.entries(overlay.byId || {})) {
    const deal = byId.get(id);
    if (!deal || !entry.src) continue;
    const terms = require('../ai/translate').termsOf(deal);
    for (const [field, zh] of Object.entries(entry)) {
      if (field === 'src' || field === '_title') continue;
      const en = entry.src[field];
      if (typeof en !== 'string' || typeof zh !== 'string') continue;
      pairs++;
      const result = guard.check({ en, zh, terms, field });
      if (!result.ok) falsePositives.push(`${id}.${field}: ${result.violations.map(v => v.code).join(',')}`);
    }
  }
  assert('结构 译文守卫对人工译文零误报', falsePositives.length === 0 && pairs > 0,
    pairs === 0 ? '没有可比对的语料' : `${pairs} 篇中误报 ${falsePositives.length}：${falsePositives.slice(0, 3).join(' | ')}`);

  // 补丁应用器：能应用、能拒绝对不上的上下文
  const collectorSource = read('scripts/collectors/global_deals.js');
  const lines = collectorSource.split('\n');
  const idx = lines.findIndex(line => line.includes('if (!title || PSEUDO_TITLES.test(title)) return;'));
  const goodDiff = [
    '--- a/scripts/collectors/global_deals.js',
    '+++ b/scripts/collectors/global_deals.js',
    `@@ -${idx},3 +${idx},4 @@`,
    ` ${lines[idx - 1]}`,
    `-${lines[idx]}`,
    `+${lines[idx]}`,
    `+      // 自检插入的一行`,
    ` ${lines[idx + 1]}`
  ].join('\n');
  const applied = patch.applyUnifiedDiff(collectorSource, goodDiff);
  assert('结构 补丁应用器能干净应用', applied.ok && applied.hunks === 1, applied.error || '应用失败');
  // 反例：把一条上下文行改成页面上不存在的内容，必须被拒（否则"能应用"这句话没有意义）
  const brokenDiff = [
    '--- a/scripts/collectors/global_deals.js',
    '+++ b/scripts/collectors/global_deals.js',
    `@@ -${idx},3 +${idx},4 @@`,
    ' 这段上下文在源码里不存在',
    `-${lines[idx]}`,
    `+${lines[idx]}`,
    `+      // 自检插入的一行`,
    ` ${lines[idx + 1]}`
  ].join('\n');
  assert('结构 补丁应用器拒绝上下文对不上的补丁', !patch.applyUnifiedDiff(collectorSource, brokenDiff).ok, '坏上下文被接受了');
  assert('结构 补丁路径只允许 scripts/collectors/**', !patch.ALLOWED_PATH.test('scripts/lib/http.js') && patch.ALLOWED_PATH.test('scripts/collectors/x.js'), '路径白名单形同虚设');

  // 输入上限：超限直接拒收，不裁剪后硬送
  ok('结构 成本与输入上限有单一出处（schemas.TASK_LIMITS）',
    Object.keys(schemas.TASK_LIMITS).length === Object.keys(schemas.SCHEMAS).length);

  // 价格未知时不猜价格
  const cost = pricing.estimateCost('某个不存在的模型', { inputTokens: 1000, outputTokens: 1000 });
  assert('结构 查不到价目时报"成本未知"而不是 0', cost.costKnown === false && cost.estimatedCostUsd === 0, JSON.stringify(cost));

  // usage 账本格式
  const summary = usage.summarize([
    { task: 't', provider: 'p', model: 'm', ok: true, inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.001, costKnown: true, cached: false }
  ]);
  assert('结构 用量账本能汇总', summary.total.calls === 1 && summary.byTask.t.calls === 1, JSON.stringify(summary.total));
}

/* ================================================================== */

async function main() {
  console.log('AI 层自检（离线，不依赖任何 API key 与网络）');
  console.log('');

  process.env.AI_PROVIDER = 'fail';
  await tooth1_missingEvidence();
  await tooth2_invalidEnum();
  await tooth3_unsupportedFalse();
  tooth4_noAutoMerge();
  await tooth5_aiFailureIsNotOutage();
  tooth6_secretScan();
  tooth7_generationCannotWriteTruth();
  tooth8_noImplicitAccept();
  tooth9_candidateEnvelopeInProduction();
  structuralTeeth();

  // provider 的环境变量不该泄漏给后续步骤
  delete process.env.AI_PROVIDER;
  delete process.env.AI_FAIL_MODE;

  console.log('');
  console.log(`AI 自检 ${checks} 项 · 失败 ${failures}`);
  if (failures) {
    console.log(`失败项：${failed.join(' / ')}`);
    return 1;
  }
  console.log('✅ AI 层边界完好：候选不合格就进不来，AI 挂掉不影响确定性链路，');
  console.log('   AI 生成物写不出生产真值，未经 accept 的候选一个都推不动。');
  return 0;
}

main().then(code => process.exit(code)).catch(error => {
  console.error(`AI 自检异常：${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
