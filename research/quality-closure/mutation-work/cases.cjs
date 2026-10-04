'use strict';
/**
 * T20 变异电池用例定义（18 条 §21 + 1 条自设计）。
 *
 * 每条：{ id, title, lane, kind, mutator(root), expect, detectors, extra }
 *   · kind: source（改 scripts/data/**）| artifact（改产物 dist/**）| workflow（改 .github/**）
 *           | ai（AI 工具/候选链）| state（不改任何文件，只改运行状态/参数）
 *   · expect: 'RED'（必须被门禁抓住）| 'GREEN'（必须通过——用于「非空历史/归档」与「子路径」这类不得回归的面）
 *   · detectors: 期望的检测器（用于对照，实际以门禁退出码为准）
 *   · extra: 该用例额外的、不在公共门禁集合里的命令（仍逐条记录 exit code）
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** 规范序（与生产同一套：slug → planId → modelKey → variant） */
function orderKey(link) {
  if (!link) return '';
  if (link.apiPlanId !== undefined) {
    return `api\u0000${link.registrySlug}\u0000${link.apiPlanId}\u0000${link.modelKey}\u0000${link.variant === null || link.variant === undefined ? '' : link.variant}`;
  }
  return `coding\u0000${link.registrySlug}\u0000${link.planId}\u0000${link.modelName}`;
}
const sortLinks = list => [...list].sort((a, b) => (orderKey(a) < orderKey(b) ? -1 : orderKey(a) > orderKey(b) ? 1 : 0));

/** 找一个 fair_use=true 的 restriction（来源层） */
function findFairUse(root) {
  const src = readJson(path.join(root, 'scripts/data/curated_plans.json'));
  for (const [id, p] of Object.entries(src)) {
    if (id.startsWith('_')) continue;
    for (const r of (p.restrictions || [])) if (r.kind === 'fair_use' && r.value === true) return { id, src, r };
  }
  throw new Error('找不到 fair_use=true 的 restriction');
}

/** 找到一条 api-plans 记录（来源层） */
function findApiRecord(root) {
  const src = readJson(path.join(root, 'scripts/data/curated_api_plans.json'));
  const plans = Array.isArray(src) ? src : (src.plans || Object.values(src).find(v => Array.isArray(v)));
  if (!Array.isArray(plans)) throw new Error('curated_api_plans.json 结构未识别');
  const plan = plans.find(p => (p.evidence || []).length && (p.models || []).length);
  if (!plan) throw new Error('找不到带引文的 api-plan 记录');
  return { src, plans, plan };
}
function writeApiSource(root, src, plans) {
  const file = path.join(root, 'scripts/data/curated_api_plans.json');
  if (Array.isArray(src)) writeJson(file, plans);
  else if (Array.isArray(src.plans)) writeJson(file, { ...src, plans });
  else {
    const key = Object.keys(src).find(k => Array.isArray(src[k]));
    writeJson(file, { ...src, [key]: plans });
  }
}

const CASES = [];
const add = c => CASES.push(c);
/**
 * e2e 夹具准备（非空历史）：
 *   ① 把 T07 夹具生成器产出的三份非空历史移植进「当前代码」的用例工作区（gold 副本）；
 *   ② build-local 重建产物。两步都必须 exit 0（这就是 M03/M04 的"必须绿"断言的一部分）。
 */
const E2E_CMD = (goldDir, caseDir, fixtureDir, what) => ({
  id: `${what}：把 T07 生成器产出的非空历史移植进「当前代码」副本（gold 基底）`,
  cmd: `node "${path.join(__dirname, 'prepare-nonempty.cjs')}" --case="${caseDir}" --fixture="${fixtureDir}"`
});
const E2E_BUILD = what => ({ id: `${what}：build-local（非空状态必须构建成功）`, cmd: 'node scripts/tools/build-local.js' });
/** T07 夹具工作区（含三份非空历史）在电池工作区根下 */
const FIXTURE_DIR = 'D:\\qc-t20\\cases\\_e2e';

/* ---------------- 0：绿对照（不改任何文件；证明固定门禁集合在干净输入上是绿的） ---------------- */
add({
  id: 'M00-pristine-control',
  title: '【对照】不改任何文件 → 固定门禁集合必须全绿',
  lane: '对照组（电池的可判性前提）', kind: 'state',
  expect: 'GREEN', detectors: ['全部公共门禁'],
  mutator() { return []; }
});

/* ---------------- 1–14：数据/关系/计划侧（改来源层 scripts/data/**） ---------------- */

add({
  id: 'M01-identity-two-models',
  title: '一个 API pricing source identity → 两个 registry models',
  lane: '§17 Model Registry 身份唯一性（原 P0）', kind: 'source',
  expect: 'RED', detectors: ['check-model-registry-links', 'models-selftest', 'validate-strict', 'check-models-reproducible', 'rebuild-models'],
  mutator(root) {
    const file = path.join(root, 'scripts/data/model-registry-links.json');
    const doc = readJson(file);
    doc.links.push({
      registrySlug: 'glm-5.3', apiPlanId: 'ebc4af9a71b6', modelKey: 'qwen3-max', variant: null,
      basis: 'explicit-mapping', evidence: [], note: 'T20 M01：同一条计价记录第二次归属另一个 registry 模型（规范序合法追加）'
    });
    writeJson(file, { schemaVersion: doc.schemaVersion, links: sortLinks(doc.links) });
    return [file];
  }
});

add({
  id: 'M02-multivariant-page-loses-row',
  title: '同 model 两 variants 页面少一行（多变体吞行）',
  lane: '§17 / T06 多变体行完整', kind: 'artifact',
  expect: 'RED', detectors: ['models-page-selftest(--dir=dist)', 'my-join-audit(--dist=dist)', 'my-browser-matrix', 'verify-site'],
  browser: true,
  mutator(root) {
    const file = path.join(root, 'dist/models/glm-4.5v/index.html');
    const html = fs.readFileSync(file, 'utf8');
    const before = html;
    const next = html.replace(/<tr class="mapirow"[^>]*data-variant="standard"[\s\S]*?<\/tr>/, '');
    if (next === before) throw new Error('没匹配到 standard 行');
    fs.writeFileSync(file, next);
    return [file];
  }
});

add({
  id: 'M03-changes-history-nonempty',
  title: 'Changes history 非空 → build/verify 必须绿',
  lane: '§15 变化雷达（T07/T11 修复面）', kind: 'state',
  expect: 'GREEN',
  requirementGates: ['build-local', 'seo-verify', 'MY-browser-matrix', 'MY-join-audit', 'history-verify', 'check-plan-history', 'check-api-plan-history', 'data-docs-selftest', 'validate-strict'],
  detectors: ['build-local', 'seo-verify', 'verify-site', 'check-plan-history', 'check-api-plan-history', 'validate-strict'],
  browser: true,
  mutator() { return []; },
  setup: (root, gold) => [
    E2E_CMD(gold, root, FIXTURE_DIR, 'M03 Changes 非空'),
    E2E_BUILD('M03 Changes 非空')
  ]
});

add({
  id: 'M04-archive-nonempty',
  title: 'Archive 非空 → assets / internal links 必须绿',
  lane: '§15 历史档案（T08 修复面）', kind: 'state',
  expect: 'GREEN',
  requirementGates: ['build-local', 'seo-verify', 'MY-browser-matrix', 'MY-join-audit', 'data-docs-selftest', 'validate-strict'],
  detectors: ['archive-selftest(--dir=dist)', 'build-local', 'seo-verify', 'verify-site', 'my-join-audit'],
  browser: true,
  mutator() { return []; },
  setup: (root, gold) => [
    E2E_CMD(gold, root, FIXTURE_DIR, 'M04 Archive 非空'),
    E2E_BUILD('M04 Archive 非空')
  ]
});

add({
  id: 'M05-third-party-evidence-as-official',
  title: '第三方 evidence 却标 official',
  lane: '§7.1/§7.2 来源语义（T09 修复面）', kind: 'source',
  expect: 'RED', detectors: ['validate-strict（officialDomainProblems）', 'api-plans-selftest / provenance-selftest（basis+derived+sourceType 三轴措辞）'],
  mutator(root) {
    const { src, plans, plan } = findApiRecord(root);
    // 把一个聚合站 URL 写成「官方定价页」引文（域不在白名单）
    plan.evidence = [{ field: 'pricing.unit', quote: plan.evidence[0].quote, sourceUrl: 'https://futuretools.io/tools/x', capturedAt: '2026-10-01', lang: 'en' }];
    plan.officialUrl = 'https://futuretools.io/tools/x';
    writeApiSource(root, src, plans);
    return [path.join(root, 'scripts/data/curated_api_plans.json')];
  }
});

add({
  id: 'M06-new-user-credit-as-stable-freeTier',
  title: 'new-user free credit 被标成 stable freeTier',
  lane: '§7.3 freeTier 与 Deal 边界（T12/T13 修复面）', kind: 'source',
  expect: 'RED', detectors: ['api-plans-selftest', 'validate-strict'],
  mutator(root) {
    const { src, plans, plan } = findApiRecord(root);
    const hit = plans.find(p => p.freeTier && p.freeTier.stability === 'new_user');
    if (!hit) throw new Error('找不到 stability=new_user 的记录');
    hit.freeTier.stability = 'standing';
    hit.freeTier.description = '（T20 M06）首次开通即自动发放的新人专属免费额度，有效期 90 天';
    writeApiSource(root, src, plans);
    return [path.join(root, 'scripts/data/curated_api_plans.json')];
  }
});

add({
  id: 'M07-input-output-field-misbinding',
  title: 'input evidence / output source 字段错绑（引文里输入价必须在输出价之前）',
  lane: '§10.1–10.3 证据绑定（T13 修复面）', kind: 'source',
  expect: 'RED', detectors: ['validate-strict / rebuild-api-plans（evidenceBindingProblems B2 官方列序）'],
  mutator(root) {
    const { src, plans, plan } = findApiRecord(root);
    const problemsPre = [];
    // 找一条「引文里同时含输入值与输出值」的绑定，把两个数字的**位置**对调（官方列序被破坏）
    let done = null;
    for (const item of plan.evidence || []) {
      for (const model of plan.models || []) {
        const r = model.rates || {};
        if (typeof r.input !== 'number' || typeof r.output !== 'number' || r.input === r.output) continue;
        const qi = item.quote.indexOf(String(r.input));
        const qo = item.quote.indexOf(String(r.output));
        if (qi < 0 || qo < 0 || qi > qo) continue;
        const placeholder = '\u0001T20\u0001';
        const swapped = item.quote
          .replace(String(r.input), placeholder)
          .replace(String(r.output), String(r.input))
          .replace(placeholder, String(r.output));
        if (swapped.indexOf(String(r.output)) < swapped.indexOf(String(r.input))) {
          item.quote = swapped;
          done = { field: item.field, modelKey: model.modelKey, input: r.input, output: r.output };
        }
        break;
      }
      if (done) break;
    }
    if (!done) throw new Error('没有找到「引文同时含输入值与输出值」的绑定，M07 无法构造');
    problemsPre.push(done);
    writeApiSource(root, src, plans);
    return [path.join(root, 'scripts/data/curated_api_plans.json')];
  }
});

add({
  id: 'M08-per1M-evidence-vs-per1K-source',
  title: 'per 1M evidence 但 source 写 per 1K',
  lane: '§10.3 单位见证（T13 修复面）', kind: 'source',
  expect: 'RED', detectors: ['validate-strict / rebuild-api-plans（evidenceBindingProblems B3 单位同类）'],
  mutator(root) {
    const { src, plans, plan } = findApiRecord(root);
    // 只改记录级 unit，引文与 unitNote 一个字不动（它们说的是「每百万」）⇒ 单位矛盾必红
    plan.pricing = { ...plan.pricing, unit: 'per_1K_tokens' };
    writeApiSource(root, src, plans);
    return [path.join(root, 'scripts/data/curated_api_plans.json')];
  }
});

add({
  id: 'M09-unknown-downgraded-to-false',
  title: 'unknown 经 rebuild 变 false',
  lane: '§10.4 三态契约（T14 修复面）', kind: 'source',
  expect: 'RED', detectors: ['validate-strict', 'plans-selftest', 'check-plans-reproducible', 'rebuild-plans'],
  mutator(root) {
    const hit = findFairUse(root);
    hit.r.value = 'unknown';
    hit.r.note = '（T20 M09）查过官方文档，来源未说明这一条；随后把它降级成 false 但保留这条「未说明」记述';
    writeJson(path.join(root, 'scripts/data/curated_plans.json'), hit.src);
    hit.r.value = false;   // 降级，note 仍是「未说明」⇒ 取值与记述不同向
    writeJson(path.join(root, 'scripts/data/curated_plans.json'), hit.src);
    return [path.join(root, 'scripts/data/curated_plans.json')];
  }
});

add({
  id: 'M10-ai-generation-out-deals-json',
  title: 'AI generation --out=deals.json',
  lane: '§10.5 AI 隔离（T15 修复面）', kind: 'ai',
  expect: 'RED', detectors: ['maintenance CLI 落点白名单（exit≠0）', 'ai-selftest'],
  extra: [{ id: 'deals.json 未被改写', kind: 'hash-check', file: 'deals.json' }],
  mutator(root) {
    // 不改任何文件：只记录被保护文件的 sha，跑 CLI 后再比
    this._before = sha(path.join(root, 'deals.json'));
    return [];
  },
  commands: (root) => [{
    id: 'maintenance --out=deals.json',
    cmd: `node scripts/ai/maintenance.js --task=extract --out=${path.join(root, 'deals.json')} --dry-run`,
    expect: 'nonzero'
  }]
});

add({
  id: 'M11-candidate-envelope-in-production-truth',
  title: 'candidate envelope 直接放入 production truth',
  lane: '§10.5 AI 隔离（T15 修复面）', kind: 'artifact',
  expect: 'RED', detectors: ['validate-strict（productionTruthEnvelopes）', 'ai-selftest', 'check-reproducible'],
  mutator(root) {
    const file = path.join(root, 'deals.json');
    const envelope = {
      schemaVersion: 1, task: 'extract', label: 'T20-M11', generatedAt: '2026-10-03T00:00:00+08:00',
      model: 'mock', provider: 'mock', candidates: [{ id: 'cand-t20-m11', kind: 'new_deal', status: 'proposed', review: { decision: 'pending' } }]
    };
    writeJson(file, envelope);
    return [file];
  }
});

add({
  id: 'M12-generation-implicit-accept',
  title: 'generation 隐式 accept（生成侧写出带决定的候选）',
  lane: '§10.5 AI 隔离（T15 修复面）', kind: 'ai',
  expect: 'RED', detectors: ['candidates.writeCandidates({cause:generation}) 结构性拒绝', 'ai-selftest'],
  commands: (root) => [{
    id: 'writeCandidates(cause=generation) 带 review.decision',
    cmd: `node -e "const c=require('${root.replace(/\\/g, '/')}/scripts/lib/candidates.js');try{const r=c.writeCandidates('${root.replace(/\\/g, '/')}/.ai-cache/mut-implicit.json',{schemaVersion:1,task:'extract',label:'t20',generatedAt:'2026-10-03T00:00:00+08:00',model:'mock',provider:'mock',candidates:[{id:'c1',kind:'new_deal',status:'proposed',review:{decision:'accept'}}]},{cause:'generation'});console.log('WROTE',r);process.exit(0);}catch(e){console.log('REJECTED:',e.message.slice(0,160));process.exit(1);}"`,
    expect: 'nonzero'
  }],
  mutator() { return []; }
});

add({
  id: 'M13-missing-mapping-or-gap-adjudication',
  title: 'source model 少一条 mapping / gap adjudication',
  lane: '§10.6 两侧完整性（T05/T13 修复面）', kind: 'source',
  expect: 'RED', detectors: ['check-model-registry-links（API 侧完整性）', 'models-selftest', 'validate-strict'],
  mutator(root) {
    const file = path.join(root, 'scripts/data/model-registry-links.json');
    const doc = readJson(file);
    doc.links = doc.links.filter(l => !(l.apiPlanId === '4f8bae91f9f8' && l.modelKey === 'claude-fable-5.1'));
    writeJson(file, { schemaVersion: doc.schemaVersion, links: doc.links });
    return [file];
  }
});

add({
  id: 'M14-duplicate-registry-slug',
  title: 'duplicate registry slug（重复顶层 slug 键）',
  lane: '§8 牙 / F-T19-1', kind: 'source',
  expect: 'RED', detectors: ['check-model-registry-links', 'models-selftest', 'validate-strict', 'check-models-reproducible'],
  mutator(root) {
    const file = path.join(root, 'scripts/data/models.json');
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    const closing = raw.lastIndexOf('}');
    fs.writeFileSync(file, `${raw.slice(0, closing)},\n  "glm-5.3": ${JSON.stringify(parsed['glm-5.3'])}\n${raw.slice(closing)}`);
    return [file];
  }
});

/* ---------------- 15–18：产物 / 工作流 / 状态 ---------------- */

add({
  id: 'M15-new-public-dataset-not-in-manifest',
  title: '新增 public dataset 但 Manifest 漏登记',
  lane: '§10.7 Manifest 双向完整性（T16 修复面）', kind: 'artifact',
  expect: 'RED', detectors: ['data-docs-selftest(--dir=dist)', 'build-local（若由构建期产出则构建期红）', 'seo-verify'],
  mutator(root) {
    const file = path.join(root, 'dist/public-experiment-t20.json');
    writeJson(file, { schemaVersion: 1, note: 'T20 M15：未登记的公开 JSON' });
    return [file];
  }
});

add({
  id: 'M16-headless-unavailable-but-healthy',
  title: 'headless browser unavailable 但 source 仍标 healthy（关掉判定分支）',
  lane: '§8 Source Health（T11 修复面）', kind: 'source',
  expect: 'RED', detectors: ['health-selftest（真实链路组合矩阵：无头来源 + 浏览器没起来必须 headless_unavailable）', 'validate-strict'],
  mutator(root) {
    const file = path.join(root, 'scripts/lib/health.js');
    const text = fs.readFileSync(file, 'utf8');
    const before = text;
    const next = text.replace('if (kind === \'headless\' && attempt.headlessReady === false) {',
      'if (false && kind === \'headless\' && attempt.headlessReady === false) {   // T20 M16：关掉 headless_unavailable 判定');
    if (next === before) throw new Error('health.js 的 headless_unavailable 分支锚点没匹配');
    fs.writeFileSync(file, next);
    return [file];
  }
});

add({
  id: 'M17-production-gate-allow-degraded-true',
  title: 'production gate allow_degraded_run=true',
  lane: '§10.8 Gate 不得静默降级（T17 修复面）', kind: 'workflow',
  expect: 'RED', detectors: ['check-ci-consistency（(11) 调用方表达式求值）'],
  mutator(root) {
    const file = path.join(root, '.github/workflows/verify.yml');
    const text = fs.readFileSync(file, 'utf8');
    const before = text;
    const next = text.replace("allow_degraded_run: ${{ inputs.allow_degraded_run && 'true' || 'false' }}", "allow_degraded_run: 'true'");
    if (next === before) throw new Error('verify.yml 的 allow_degraded_run 注入没生效');
    fs.writeFileSync(file, next);
    return [file];
  }
});

add({
  id: 'M18-required-dist-missing-but-artifact-test-passes',
  title: 'required dist 缺失但 artifact test PASS（缺产物必须非 0）',
  lane: '§10.9 产物缺失 fail-closed（T17 修复面）', kind: 'state',
  expect: 'RED', detectors: ['6 个产物依赖工具全部 exit≠0', 'check-ci-consistency 的 --dir 冻结'],
  mutator(root) {
    // 不做文件级变异：只造一个空目录当 --dir（required artifact 缺失的状态）
    const empty = path.join(root, '.qc-t20-empty-dist');
    fs.rmSync(empty, { recursive: true, force: true });
    fs.mkdirSync(empty, { recursive: true });
    return [];
  },
  commands: (root) => {
    const empty = path.join(root, '.qc-t20-empty-dist');
    return ['archive-selftest', 'data-docs-selftest', 'models-page-selftest', 'planshub-selftest', 'vendor-page-selftest', 'check-feeds-reproducible']
      .map(t => ({ id: `${t}(缺产物)`, cmd: `node scripts/tools/${t}.js "--dir=${empty}"`, expect: 'nonzero' }))
      .concat([{ id: '对照：--allow-missing-dist 才允许跳过', cmd: `node scripts/tools/data-docs-selftest.js "--dir=${empty}" --allow-missing-dist`, expect: 'zero' }]);
  }
});

/* ---------------- 19：自设计（18 条覆盖不到的面） ---------------- */

add({
  id: 'M19-rendered-values-swapped-identity-intact',
  title: '【自设计】渲染层数值错位：行身份与行数都不变，只有 Input/Output 数值错位',
  lane: '§10.1–10.3 的**渲染侧**对称面（18 条里只有「少一行」的数据侧形态）', kind: 'artifact',
  expect: 'RED', detectors: ['models-page-selftest(--dir=dist)（assertPageHonesty 按数据重算期望值）', 'my-join-audit（三格价格逐格对账）', 'verify-site'],
  browser: true,
  mutator(root) {
    const file = path.join(root, 'dist/models/glm-4.5v/index.html');
    const html = fs.readFileSync(file, 'utf8');
    const rows = [...html.matchAll(/<tr class="mapirow"[\s\S]*?<\/tr>/g)];
    if (rows.length < 2) throw new Error('glm-4.5v 少于两行，取不到夹具');
    // 行身份保留，只把两行的三个价格格互换（standard ↔ long_context 的数值对调）
    const values = rows.map(r => [...r[0].matchAll(/<td class="num">([^<]*)<\/td>/g)].map(m => m[1]));
    let next = html;
    rows.forEach((r, i) => {
      const other = values[(i + 1) % values.length];
      let replaced = r[0];
      r[0].matchAll(/<td class="num">([^<]*)<\/td>/g);
      let k = 0;
      replaced = replaced.replace(/<td class="num">[^<]*<\/td>/g, () => `<td class="num">${other[k++]}</td>`);
      next = next.replace(r[0], replaced);
    });
    if (next === html) throw new Error('价格互换没有生效');
    fs.writeFileSync(file, next);
    return [file];
  }
});

/* ---------------- 20：审计唯一未捕获变异 M17（ai-apply accept 判定恒真） ---------------- */

add({
  id: 'MM17-audit-accept-filter-always-true',
  title: '【审计 M17】ai-apply 的「已接受」判定改成恒真（未人工 accept 的候选也能推进）',
  lane: '§10.5 AI 隔离（T15 修复面；审计 20 条里唯一未被捕获的那条）', kind: 'source',
  expect: 'RED', detectors: ['ai-selftest（牙8e 即 M17 原命令形态：`--all-accepted --dry-run`）'],
  extra: [{
    id: 'M17 原命令形态：--all-accepted --dry-run（用 pending 候选）',
    kind: 'command-after',
    // 候选文件由本用例先写好：review.decision = 'pending'
    cmd: 'node scripts/tools/ai-apply.js --all-accepted --dry-run --file=.ai-cache/mut-t20-pending.json',
    expect: 'nonzero'
  }],
  mutator(root) {
    // ① 把 candidates.acceptedOf 的判定改成恒真等价物：让 ai-apply 拿到「所有候选都算接受」
    const applyFile = path.join(root, 'scripts/tools/ai-apply.js');
    const text = fs.readFileSync(applyFile, 'utf8');
    const before = text;
    const next = text.replace('const accepted = candidates.acceptedOf(payload);',
      'const accepted = payload.candidates.slice();   // T20 审计 M17 变异：接受判定恒真（未人工 accept 也能推进）');
    if (next === before) throw new Error('ai-apply.js 的 acceptedOf 调用锚点没匹配');
    fs.writeFileSync(applyFile, next);
    // ② 准备一份 review.decision='pending' 的候选（结构合法，只是没人点过）
    const dir = path.join(root, '.ai-cache');
    fs.mkdirSync(dir, { recursive: true });
    const candFile = path.join(dir, 'mut-t20-pending.json');
    writeJson(candFile, {
      schemaVersion: 1, task: 'extract', label: 'T20-MM17', generatedAt: '2026-10-03T00:00:00+08:00',
      model: 'mock', provider: 'mock',
      candidates: [{ id: 'cand-t20-m17', kind: 'new_deal', status: 'proposed', review: { decision: 'pending' } }]
    });
    return [applyFile];
  }
});

module.exports = { CASES, sha, readJson, writeJson };
