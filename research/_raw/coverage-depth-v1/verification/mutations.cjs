#!/usr/bin/env node
/**
 * t9 / 题面 §62：**Mutation M1–M15 真跑**（TEMP 沙箱，byte-exact restore）。
 *
 * 三条纪律，缺一条这份读数就不算数：
 *   ① 变异**只在 TEMP 沙箱副本**上做：共享工作区一个字节都不改（前后贴 sha256，逐文件比）；
 *   ② 每条变异前把沙箱从 pristine 恢复并**校验哈希相同**，跑完再恢复 —— 「byte-exact restore」是贴出来的读数，不是声明；
 *   ③ 判「红」用**增量**：先跑 pristine 基线，再跑变异；只有**新增失败**才算"这条变异被抓到"。
 *      （当前树上本来就有几条 selftest 是在飞数据顶红的，不减基线会把它们记成"抓到了"。）
 *
 * 用法：node mutations.cjs [--only=M1,M5] [--keep-sandbox]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SANDBOX = path.join(os.tmpdir(), 't9-mutation-sandbox');
const PRISTINE = path.join(os.tmpdir(), 't9-mutation-pristine');
const OUT = path.join(__dirname, 'mutations.json');
const LOG_DIR = path.join(__dirname, 'logs');
const ONLY = (() => {
  const hit = process.argv.slice(2).find(a => a.startsWith('--only='));
  return hit ? hit.slice('--only='.length).split(',').map(s => s.trim()) : null;
})();

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const hashFile = file => sha256(fs.readFileSync(file));

/* ------------------------------------------------------------------ */
/* 沙箱                                                               */
/* ------------------------------------------------------------------ */
const EXCLUDE = new Set(['node_modules', '.git', 'research', 'dist', 'mockups', 'assets', '.agent-teams']);

/** 虽然 research/ 整体不进沙箱，但 coverage-report 的两份候选登记件是它的输入（缺了它会自检红） */
const RESEARCH_INPUTS = [
  'research/v3.0-source-candidates.json',
  'research/v3.0-source-candidates.md'
];

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (EXCLUDE.has(entry.name) || entry.name.startsWith('.tmp-') || entry.name.startsWith('dist.')) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dst);
    else if (entry.isFile()) fs.copyFileSync(src, dst);
  }
}

function copyResearchInputs(target) {
  for (const file of RESEARCH_INPUTS) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) continue;
    fs.mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
    fs.copyFileSync(src, path.join(target, file));
  }
}

function linkNodeModules(sandbox) {
  const target = path.join(sandbox, 'node_modules');
  if (fs.existsSync(target)) return;
  fs.mkdirSync(sandbox, { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), target, 'junction');
}

/** 沙箱内会被变异触碰、因而需要逐字节校验的关键文件 */
const WATCHED = [
  'scripts/data/models.json',
  'models.json',
  'scripts/data/coverage-targets.json',
  'scripts/data/source-rulings.json',
  'scripts/data/model-registry-gaps.json',
  'scripts/data/model-registry-links.json',
  'deals.json',
  'api-plans.json',
  'scripts/lib/coverage-targets.js',
  'scripts/lib/model-freshness.js',
  'scripts/lib/analytics.js',
  'scripts/tools/coverage-report.js'
];

/* ------------------------------------------------------------------ */
/* 命令执行                                                             */
/* ------------------------------------------------------------------ */
function run(sandbox, command) {
  const started = Date.now();
  try {
    const out = execFileSync(process.execPath, [path.join(sandbox, command.file), ...(command.args || [])], {
      cwd: sandbox,
      timeout: 180000,
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    return { exitCode: 0, ms: Date.now() - started, output: out };
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}`;
    return { exitCode: typeof error.status === 'number' ? error.status : 1, ms: Date.now() - started, output: String(output) };
  }
}

function failureLines(output) {
  return String(output)
    .split(/\r?\n/)
    .filter(line => /(^|\s)(✗|❌)/.test(line) || /失败\s*\d+\s*项/.test(line))
    .map(line => line.trim())
    .slice(0, 12);
}

function signature(result) {
  return { exitCode: result.exitCode, failures: failureLines(result.output) };
}

const GATES = [
  { id: 'coverage-targets-selftest', file: 'scripts/tools/coverage-targets-selftest.js' },
  { id: 'model-freshness-selftest', file: 'scripts/tools/model-freshness-selftest.js' },
  { id: 'models-selftest', file: 'scripts/tools/models-selftest.js' },
  { id: 'models-page-selftest', file: 'scripts/tools/models-page-selftest.js', args: ['--allow-missing-dist'] },
  { id: 'api-plans-selftest', file: 'scripts/tools/api-plans-selftest.js' },
  { id: 'analytics-selftest', file: 'scripts/tools/analytics-selftest.js', args: ['--allow-missing-dist'] },
  { id: 'coverage-report', file: 'scripts/tools/coverage-report.js' },
  { id: 'validate-strict', file: 'scripts/validate.js', args: ['--strict'] },
  { id: 'history-verify', file: 'scripts/tools/history-verify.js' }
];

/* ------------------------------------------------------------------ */
/* 变异实现（每条：mutate(ctx) 在沙箱里改文件；expect 写清"预期红在哪"）    */
/* ------------------------------------------------------------------ */
const readSandboxJson = file => JSON.parse(fs.readFileSync(path.join(SANDBOX, file), 'utf8'));
const writeSandboxJson = (file, doc) => fs.writeFileSync(path.join(SANDBOX, file), `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
const readSandboxText = file => fs.readFileSync(path.join(SANDBOX, file), 'utf8');
const writeSandboxText = (file, text) => fs.writeFileSync(path.join(SANDBOX, file), text, 'utf8');
const replaceOnce = (text, from, to, label) => {
  if (!text.includes(from)) throw new Error(`${label}: 沙箱源码里找不到锚点（口径变了，变异脚本要跟着改）`);
  return text.replace(from, to);
};
const pickSlugWithDate = () => {
  const reg = readSandboxJson('scripts/data/models.json');
  return Object.keys(reg).find(slug => !slug.startsWith('_') && reg[slug] && reg[slug].releasedAt && (reg[slug].releaseEvidence || []).length);
};

const MUTATIONS = [
  {
    id: 'M1', what: '删掉一条 releasedAt 的 releaseEvidence', expect: 'models-selftest / validate 必红（releasedAt 与证据互为充要）',
    mutate() {
      const reg = readSandboxJson('scripts/data/models.json');
      const slug = pickSlugWithDate();
      delete reg[slug].releaseEvidence;
      writeSandboxJson('scripts/data/models.json', reg);
      return { slug };
    }
  },
  {
    id: 'M2', what: '写一个非法日期 2026-10', expect: 'models-selftest / model-freshness-selftest 必红（解析不出可判日）',
    mutate() {
      const reg = readSandboxJson('scripts/data/models.json');
      const slug = pickSlugWithDate();
      reg[slug].releasedAt = '2026-10';
      writeSandboxJson('scripts/data/models.json', reg);
      return { slug };
    }
  },
  {
    id: 'M3', what: '证据 sourceUrl 换成第三方域', expect: 'validate --strict 的官方域守卫必红',
    mutate() {
      const reg = readSandboxJson('scripts/data/models.json');
      const slug = pickSlugWithDate();
      reg[slug].releaseEvidence[0].sourceUrl = 'https://third-party-mirror.example.com/news';
      writeSandboxJson('scripts/data/models.json', reg);
      return { slug };
    }
  },
  {
    id: 'M4', what: '引文与日期无关（换成人造文本）', expect: '**预期是盲区**：日期仍在、域仍对，现有门禁很可能抓不到',
    mutate() {
      const reg = readSandboxJson('scripts/data/models.json');
      const slug = pickSlugWithDate();
      reg[slug].releaseEvidence[0].quote = '这是一段与日期无关的人造文本，用来检验引文忠实度是否有牙。';
      writeSandboxJson('scripts/data/models.json', reg);
      return { slug };
    }
  },
  {
    id: 'M5', what: 'releasedAt 置空（看会不会被派生 legacy）', expect: '派生必须是 unknown（不是 legacy）；若变成 legacy 即红',
    mutate() {
      const reg = readSandboxJson('scripts/data/models.json');
      const pub = readSandboxJson('models.json');
      const slug = pickSlugWithDate();
      reg[slug].releasedAt = null;
      reg[slug].releaseEvidence = [];
      writeSandboxJson('scripts/data/models.json', reg);
      return { slug, rebuild: true, observeModel: slug };
    }
  },
  {
    id: 'M6', what: 'firstSeen 混入 Freshness（改成很久以前）', expect: '**预期不受影响**（firstSeen 不是发布日）；受影响即红',
    mutate() {
      const pub = readSandboxJson('models.json');
      const model = pub.models.find(m => m.releasedAt);
      model.firstSeen = '2020-01-01';
      writeSandboxJson('models.json', pub);
      return { slug: model.slug, rebuild: true, observeModel: model.slug };
    }
  },
  {
    id: 'M7', what: '跨 modelRole 同组（不同档的模型塞进同一 freshnessGroup）', expect: '比它新的另一档模型把它挤成 legacy ⇒ 说明跨档互淘汰；门禁是否红另记',
    mutate() {
      const reg = readSandboxJson('scripts/data/models.json');
      const pub = readSandboxJson('models.json');
      const withDate = Object.keys(reg).filter(slug => !slug.startsWith('_') && reg[slug].releasedAt).sort();
      const older = withDate[0];
      const newer = withDate[withDate.length - 1];
      reg[older].freshnessGroup = 'm7-cross-role-group';
      reg[newer].freshnessGroup = 'm7-cross-role-group';
      writeSandboxJson('scripts/data/models.json', reg);
      return { slug: `${older} + ${newer}`, rebuild: true, observeModel: older };
    }
  },
  {
    id: 'M8', what: '删掉一个已被 current target 声明的 production 记录（api 侧 modelKey 行）', expect: 'coverage-report 里该格从 COVERED 掉档（PARTIAL/MISSING）；门禁是否红另记',
    mutate() {
      const api = readSandboxJson('api-plans.json');
      const targets = readSandboxJson('scripts/data/coverage-targets.json');
      const declared = [];
      for (const target of targets.targets) for (const item of (target.currentTargets || [])) if (item.dimension === 'api') declared.push({ provider: target.provider, modelKey: item.modelKey });
      const wanted = declared[0];
      const plan = api.plans.find(p => p.provider === wanted.provider && (p.models || []).some(m => m.modelKey === wanted.modelKey));
      const before = plan.models.length;
      plan.models = plan.models.filter(m => m.modelKey !== wanted.modelKey);
      writeSandboxJson('api-plans.json', api);
      return { provider: wanted.provider, modelKey: wanted.modelKey, removedRows: before - plan.models.length };
    }
  },
  {
    id: 'M9', what: '源码变异：DEFERRED 分支失效（延期的格子掉进 MISSING）', expect: 'coverage-targets-selftest 必红（它的牙就在这条短路）',
    mutate() {
      const file = 'scripts/lib/coverage-targets.js';
      let text = readSandboxText(file);
      text = replaceOnce(text, '  if (ruling) {\n    if (ruling.decision === \'unverifiable\') {', '  if (ruling && false) {\n    if (ruling.decision === \'unverifiable\') {', 'M9');
      writeSandboxText(file, text);
      return { file };
    }
  },
  {
    id: 'M10', what: '源码变异：PARTIAL 被当成 COVERED（部分兑现也算全兑现）', expect: 'coverage-targets-selftest 必红',
    mutate() {
      const file = 'scripts/lib/coverage-targets.js';
      let text = readSandboxText(file);
      text = replaceOnce(text, '  if (resolved > 0) {\n    return cell(STATES.PARTIAL, `声明的 ${declared.length} 条 current target 只兑现 ${resolved} 条`);',
        '  if (resolved > 0) {\n    return cell(STATES.COVERED, `M10 变异：只兑现 ${resolved} 条也当 COVERED`);', 'M10');
      writeSandboxText(file, text);
      return { file };
    }
  },
  {
    id: 'M11', what: '裁决数据变异：给仍在注册表里的来源写 retire', expect: 'coverage-report 的对账必红（retire 仍在采集器注册表）',
    mutate() {
      const doc = readSandboxJson('scripts/data/source-rulings.json');
      doc.rulings = doc.rulings.filter(r => r.source !== 'aitools');
      doc.rulings.push({
        source: 'aitools',
        decision: 'retire',
        reason: 'M11 变异：这条来源仍在采集器注册表里，却写了 retire',
        evidence: ['mutations.cjs M11'],
        overlap: null,
        whyKept: null,
        revisitBy: null,
        headlessStability: null
      });
      writeSandboxJson('scripts/data/source-rulings.json', doc);
      return { source: 'aitools' };
    }
  },
  {
    id: 'M12', what: '删掉历史 Deal（模拟"retire 顺手删数据"）', expect: 'history-verify 必红（账本与 deals.json 对不上）',
    mutate() {
      const doc = readSandboxJson('deals.json');
      const before = doc.deals.length;
      doc.deals = doc.deals.filter(deal => deal.source !== 'Futurepedia');
      doc.count = doc.deals.length;
      writeSandboxJson('deals.json', doc);
      return { removed: before - doc.deals.length };
    }
  },
  {
    id: 'M13', what: '让一个 registry 模型变 retired（legacy/historical 路由与索引行）', expect: 'models-page-selftest 或 models-selftest 变红',
    mutate() {
      const reg = readSandboxJson('scripts/data/models.json');
      const slug = pickSlugWithDate();
      reg[slug].status = 'retired';
      writeSandboxJson('scripts/data/models.json', reg);
      return { slug, rebuild: true, observeModel: slug };
    }
  },
  {
    id: 'M14', what: 'API Pricing 因 legacy 丢行（把已映射的 registry 模型置 retired）', expect: 'api-plans-selftest 或 coverage-report 变红',
    mutate() {
      const reg = readSandboxJson('scripts/data/models.json');
      const links = readSandboxJson('scripts/data/model-registry-links.json');
      const linked = (links.links || []).find(link => link && link.registrySlug);
      reg[linked.registrySlug].status = 'retired';
      writeSandboxJson('scripts/data/models.json', reg);
      return { slug: linked.registrySlug, rebuild: true, observeModel: linked.registrySlug };
    }
  },
  {
    id: 'M15', what: '源码变异：本地 Analytics 发网络请求', expect: 'analytics-selftest 必红（分析层零请求）',
    mutate() {
      const file = 'scripts/lib/analytics.js';
      let text = readSandboxText(file);
      const anchor = text.indexOf('\n');
      text = `${text.slice(0, anchor)}\n// M15 变异：本地分析层发请求\nfunction __m15Leak() { return fetch('https://analytics.example.com/collect'); }\n${text.slice(anchor)}`;
      writeSandboxText(file, text);
      return { file, where: 'guard 区块之外的帮助函数（未被调用）' };
    }
  },
  {
    id: 'M15b', what: '源码变异（加强版）：把网络请求塞进会被逐字内联到页面的 ANALYTICS-GUARD 区块', expect: 'analytics-selftest 必红（guard 在 vm 里只有白名单宿主）',
    mutate() {
      const file = 'scripts/lib/analytics.js';
      let text = readSandboxText(file);
      text = replaceOnce(text, '/* ANALYTICS-GUARD:START */', '/* ANALYTICS-GUARD:START */\nvar __m15b = fetch(\'https://analytics.example.com/collect\');', 'M15b');
      writeSandboxText(file, text);
      return { file, where: 'ANALYTICS-GUARD 区块内（构建期内联、selftest vm 求值）' };
    }
  }
];

/* ------------------------------------------------------------------ */
const SENTINELS = ['scripts/collect.js', 'scripts/data/models.json', 'models.json', 'api-plans.json'];
const copyComplete = dir => SENTINELS.every(file => fs.existsSync(path.join(dir, file)));

/** 副本必须"完整"（用哨兵文件判定）：半成品副本（只有 junction 或只有 research 输入）会被重建，而不是拿来用 */
function ensureCopy(dir, label) {
  if (copyComplete(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`[mutations] 复制 ${label} 副本…`);
  copyTree(ROOT, dir);
  copyResearchInputs(dir);
  return true;
}

function main() {
  const startedAt = new Date();
  if (process.argv.includes('--fresh')) {
    fs.rmSync(PRISTINE, { recursive: true, force: true });
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  }
  ensureCopy(PRISTINE, 'pristine');
  ensureCopy(SANDBOX, '沙箱');
  linkNodeModules(PRISTINE);
  linkNodeModules(SANDBOX);
  copyResearchInputs(SANDBOX);

  // 共享工作区指纹（整场前后各一次）
  const workspaceBefore = Object.fromEntries(WATCHED.map(file => [file, hashFile(path.join(ROOT, file))]));

  const restore = () => {
    for (const file of WATCHED) {
      const from = path.join(PRISTINE, file);
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(SANDBOX, file));
    }
  };
  const sandboxMatchesPristine = () => WATCHED.filter(file => {
    const a = path.join(PRISTINE, file);
    const b = path.join(SANDBOX, file);
    if (!fs.existsSync(a)) return false;
    return hashFile(a) !== hashFile(b);
  });

  restore();
  const pristineDrift = sandboxMatchesPristine();
  console.log(`[mutations] 沙箱已就绪（${SANDBOX}）；pristine 漂移=${JSON.stringify(pristineDrift)}`);

  // 基线：pristine 沙箱上跑全部 gate
  const baseline = {};
  for (const gate of GATES) {
    const result = run(SANDBOX, gate);
    baseline[gate.id] = signature(result);
    console.log(`[baseline] ${gate.id}: exit=${result.exitCode} 失败行=${baseline[gate.id].failures.length}`);
  }

  const results = [];
  for (const mutation of MUTATIONS) {
    if (ONLY && !ONLY.includes(mutation.id)) continue;
    restore();
    const driftBefore = sandboxMatchesPristine();
    let context;
    try {
      context = mutation.mutate() || {};
    } catch (error) {
      results.push({ id: mutation.id, what: mutation.what, expect: mutation.expect, error: String(error.message), restoreOk: sandboxMatchesPristine().length === 0 });
      console.log(`[${mutation.id}] 变异失败：${error.message}`);
      continue;
    }
    const rebuilt = context.rebuild
      ? run(SANDBOX, { file: 'scripts/tools/rebuild-models.js' })
      : null;
    const gates = {};
    for (const gate of GATES) {
      const result = run(SANDBOX, gate);
      const sig = signature(result);
      const base = baseline[gate.id];
      const newFailures = sig.failures.filter(line => !base.failures.includes(line));
      gates[gate.id] = {
        exitCode: sig.exitCode,
        baselineExitCode: base.exitCode,
        failures: sig.failures,
        newFailures,
        wentRed: base.exitCode === 0 && sig.exitCode !== 0,
        addedFailures: newFailures.length
      };
    }
    // 观察派生字段（rebuilt 的变异）
    let observed = null;
    if (rebuilt) {
      try {
        const pub = JSON.parse(fs.readFileSync(path.join(SANDBOX, 'models.json'), 'utf8'));
        const model = (pub.models || []).find(m => m.slug === context.observeModel);
        if (model) observed = { slug: model.slug, catalogStatus: model.catalogStatus, catalogReason: model.catalogReason, releasedAt: model.releasedAt, freshnessGroup: model.freshnessGroup, status: model.status };
      } catch (error) { observed = { error: String(error.message) }; }
    }
    restore();
    const driftAfter = sandboxMatchesPristine();
    const caughtBy = Object.entries(gates).filter(([, g]) => g.wentRed || g.addedFailures > 0).map(([id]) => id);
    results.push({
      id: mutation.id,
      what: mutation.what,
      expect: mutation.expect,
      context,
      rebuildExitCode: rebuilt ? rebuilt.exitCode : null,
      observed,
      gates,
      caughtBy,
      caught: caughtBy.length > 0,
      restoreOk: driftAfter.length === 0,
      restoreDrift: driftAfter
    });
    console.log(`[${mutation.id}] ${mutation.what} → 抓到=${caughtBy.length ? caughtBy.join(',') : '（无）'}${observed ? ` 派生=${observed.catalogStatus || observed.status}` : ''} restore=${driftAfter.length === 0 ? 'byte-exact' : JSON.stringify(driftAfter)}`);
  }

  const workspaceAfter = Object.fromEntries(WATCHED.map(file => [file, hashFile(path.join(ROOT, file))]));
  const workspaceDrift = Object.keys(workspaceBefore).filter(file => workspaceBefore[file] !== workspaceAfter[file]);

  const summary = {
    total: results.length,
    caught: results.filter(r => r.caught).length,
    blind: results.filter(r => !r.caught).map(r => r.id),
    restoreAllByteExact: results.every(r => r.restoreOk),
    workspaceDrift,
    baselineRedGates: Object.entries(baseline).filter(([, sig]) => sig.exitCode !== 0).map(([id, sig]) => ({ id, exitCode: sig.exitCode, failures: sig.failures }))
  };

  const out = {
    probe: 'mutations.cjs',
    ranAtUtc: startedAt.toISOString(),
    ranAtLocal: startedAt.toString(),
    sandbox: SANDBOX,
    pristine: PRISTINE,
    discipline: [
      '变异只在 TEMP 沙箱副本上做；共享工作区只读哈希',
      '每条变异前 restore + 哈希校验，跑完再 restore（byte-exact 是读数不是声明）',
      '判红用增量：pristine 基线已红的 gate 必须先减掉基线，再看新增失败'
    ],
    gates: GATES.map(g => g.id),
    workspaceHashes: { before: workspaceBefore, after: workspaceAfter, drift: workspaceDrift },
    baseline,
    summary,
    results
  };
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`\n[mutations] 抓到 ${summary.caught}/${summary.total}；盲区 ${JSON.stringify(summary.blind)}`);
  console.log(`[mutations] byte-exact restore 全部成功=${summary.restoreAllByteExact}；共享工作区漂移=${JSON.stringify(summary.workspaceDrift)}`);
  console.log(`[mutations] 基线就红的 gate：${JSON.stringify(summary.baselineRedGates.map(g => `${g.id}(exit ${g.exitCode})`))}`);
  console.log(`[mutations] 写出: ${path.relative(ROOT, OUT)}`);
  if (!process.argv.includes('--keep-sandbox')) {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  }
}

main();
