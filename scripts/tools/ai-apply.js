#!/usr/bin/env node
/**
 * 落地工具：把**已被人工接受**的候选写进生产数据。
 *
 * 这是整个 AI 层里**唯一**会写生产数据的地方，所以它的每一条限制都是有意的：
 *
 *   1. 只处理 `review.decision === 'accept'` 的候选 —— 没被人点过的，一个都不写；
 *   2. 重复候选一律拒绝（要合并只有人工改 `aliases.json` 一条路）；
 *   3. 诊断 / 补丁 / 审计候选一律拒绝（它们是报告，不是数据）；
 *   4. 只写两个**已存在的人工来源层**：`curated_*.json` 与 `audience-overrides.json`；
 *      `deals.json` 是派生产物，由 `npm run collect` 重新推导 —— 不在这里碰；
 *   5. 写完全套门禁；**门禁红就把文件回滚**并把错误原样报出来。
 *      落地写到一半失败比不写更坏：数据会停在一个既不是旧值也不是新值的状态。
 *
 * 用法：
 *   node scripts/tools/ai-apply.js --id=<候选 id> [--file=…] [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const candidates = require('../ai/candidates');
const schemas = require('../ai/schemas');
const { makeDeal, todayCN } = require('../lib/schema');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(__dirname, '..', 'data');
const CURATED = {
  cn: path.join(DATA_DIR, 'curated_cn.json'),
  global: path.join(DATA_DIR, 'curated_global.json')
};
const OVERRIDES = path.join(DATA_DIR, 'audience-overrides.json');
const APPLIED_LOG = path.join(DATA_DIR, 'ai-applied-log.json');

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** 结论的人话写法（给推理链用）：`audience=[student]`、`newUserOnly=true` */
function conclusionOf(value) {
  if (Array.isArray(value)) return value.join('/');
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => `${key}=${item === 'unknown' ? 'unknown' : item}`).join(' ');
  }
  return String(value);
}

/** 推理链字符串：沿用 audience-overrides.json 里已有的写法（「原文」→ 结论） */
function reasoningOf(candidateValue, evidence) {
  const parts = [];
  for (const [field, value] of Object.entries(candidateValue)) {
    if (value === undefined || value === null) continue;
    const quote = (evidence || []).find(item => item && item.field === field);
    const conclusion = conclusionOf(value);
    parts.push(quote && quote.quote ? `${field}「${String(quote.quote).slice(0, 60)}」→ ${conclusion}` : `${field} → ${conclusion}`);
  }
  return parts.join('；').slice(0, 900);
}

/** 生产格式的引文（字段名必须落在 EVIDENCE_FIELDS 里，由 provenance 归一校验兜底） */
function quotesOf(candidate, deal) {
  const today = todayCN();
  return (candidate.evidence || [])
    .filter(item => item && item.quote && item.field)
    .map(item => ({
      field: item.field,
      quote: String(item.quote).slice(0, 200),
      sourceUrl: item.sourceUrl || deal.url,
      capturedAt: item.capturedAt || today,
      ...(item.lang ? { lang: item.lang } : {})
    }));
}

/** 用与 loadCurated 完全相同的方式算 id，才能把 deal 定位回人工文件里的那一条 */
function curatedEntryFor(region, dealId) {
  const file = CURATED[region] || CURATED.global;
  const list = readJson(file);
  const spec = { source: region === 'cn' ? 'Curated-CN' : 'Curated', region };
  for (let index = 0; index < list.length; index++) {
    const raw = list[index];
    const deal = makeDeal(raw, {
      source: raw.source || spec.source,
      region: raw.region || spec.region,
      sourceUrl: raw.sourceUrl,
      trustType: true
    });
    if (deal && deal.id === dealId) return { file, list, index, raw };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 两条落地路径                                                        */
/* ------------------------------------------------------------------ */

function applyToCurated(candidate, deal) {
  const found = curatedEntryFor(deal.region, deal.id);
  if (!found) return { ok: false, reason: `在 ${path.basename(CURATED[deal.region] || CURATED.global)} 里找不到这条记录（id=${deal.id}）` };

  const raw = found.raw;
  const value = { ...candidate.candidate };
  for (const [field, item] of Object.entries(value)) {
    if (!schemas.CANDIDATE_FIELDS.includes(field)) continue;
    raw[field] = item;
  }

  // provenance.fields：人工来源层里本来就写着逐字段出处；这里补上/更新被改动的那些
  const covered = Object.keys(value).filter(field => schemas.MANAGED_FIELDS.includes(field));
  if (covered.length) {
    raw.provenance = raw.provenance && typeof raw.provenance === 'object' ? raw.provenance : {};
    raw.provenance.fields = raw.provenance.fields && typeof raw.provenance.fields === 'object' ? raw.provenance.fields : {};
    for (const field of covered) {
      raw.provenance.fields[field] = {
        basis: 'source',
        derived: 'stated',
        note: reasoningOf({ [field]: value[field] }, candidate.evidence).slice(0, 200)
      };
    }
  }

  const quotes = quotesOf(candidate, deal);
  if (quotes.length) {
    const existing = Array.isArray(raw.evidence) ? raw.evidence : [];
    const merged = [...existing];
    for (const quote of quotes) {
      if (!merged.some(item => item && item.field === quote.field && item.quote === quote.quote)) merged.push(quote);
    }
    raw.evidence = merged.slice(0, 3);
  }

  found.list[found.index] = raw;
  writeJson(found.file, found.list);
  return { ok: true, target: path.relative(ROOT, found.file), detail: `记录 ${raw.title || deal.title}` };
}

function applyToOverrides(candidate, deal) {
  const value = {};
  const refused = [];
  for (const [field, item] of Object.entries(candidate.candidate || {})) {
    if (schemas.MANAGED_FIELDS.includes(field)) value[field] = item;
    else refused.push(field);
  }
  if (!Object.keys(value).length) {
    return {
      ok: false,
      reason: `字段 ${refused.join('、')} 属于采集侧的内容字段，今天没有"人工落地通道"` +
        '（它们由采集器产出；要人工断言就得让这条记录变成策展来源，那是改记录身份，不该由本工具顺手做）'
    };
  }

  const doc = readJson(OVERRIDES);
  doc.entries = Array.isArray(doc.entries) ? doc.entries : [];
  let entry = doc.entries.find(item => item && item.id === deal.id);
  if (!entry) {
    entry = { id: deal.id, title: deal.title };
    doc.entries.push(entry);
  }
  for (const [field, item] of Object.entries(value)) entry[field] = item;

  const reasoning = reasoningOf(value, candidate.evidence);
  entry.evidence = entry.evidence ? `${entry.evidence}；${reasoning}`.slice(0, 900) : reasoning;

  const quotes = quotesOf(candidate, deal);
  if (quotes.length) {
    const existing = Array.isArray(entry.evidenceQuotes) ? entry.evidenceQuotes : [];
    const merged = [...existing];
    for (const quote of quotes) {
      if (!merged.some(item => item && item.field === quote.field && item.quote === quote.quote)) merged.push(quote);
    }
    entry.evidenceQuotes = merged.slice(0, 3);
  }

  // 刻意**不排序**：新条目追加在末尾。重排 56 条已有条目会把一次「新增 1 条」
  // 变成「全文件重写」，reviewer 就看不出真正改了什么 —— 这个仓库对 diff 可读性
  // 是有纪律的（v1.1 迁移就专门为"不要因重排 key 让 134 条全变成改动"设计过）。
  writeJson(OVERRIDES, doc);
  return {
    ok: true,
    target: path.relative(ROOT, OVERRIDES),
    detail: `逐字段注入（记录身份保持 ${deal.source} 不变）${refused.length ? `；拒绝内容字段 ${refused.join('、')}` : ''}`
  };
}

/* ------------------------------------------------------------------ */

function runNode(script, args = []) {
  try {
    const output = execFileSync(process.execPath, [path.join(ROOT, script), ...args], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    });
    return { ok: true, output };
  } catch (error) {
    return { ok: false, output: `${error.stdout || ''}${error.stderr || ''}` || String(error.message) };
  }
}

/**
 * 落地之后必须重跑一遍**离线重建**，否则工作树会停在一个"数据与人工文件不一致"的状态里
 * （`audience-overrides.json` 改了、`deals.json` 还没跟上 ⇒ `check-reproducible` 必红）。
 * 那种状态本身没错（值确实还没被推导出来），但它很容易被误提交，也很容易变成
 * "反正它就是红的"。重建是离线且确定性的，所以这一步不该留给人记得。
 */
function runRebuild() {
  return runNode('scripts/tools/rebuild-deals.js');
}

function runGate() {
  return runNode('scripts/validate.js', ['--strict']);
}

function appendLog(entries) {
  let doc = { schemaVersion: 1, note: 'AI 候选被人工采纳的账（可追溯：谁、何时、基于什么）。AI 参与痕迹只记在这里，不改数据契约、不上前端。', entries: [] };
  if (fs.existsSync(APPLIED_LOG)) {
    try {
      doc = readJson(APPLIED_LOG);
      doc.entries = Array.isArray(doc.entries) ? doc.entries : [];
    } catch (error) {
      /* 账本坏了大不了重开一份，不能因此阻断落地 —— 但要在下面说明 */
    }
  }
  doc.entries.push(...entries);
  writeJson(APPLIED_LOG, doc);
}

function main() {
  const id = option('id');
  const allAccepted = flag('all-accepted');
  const dryRun = flag('dry-run');
  const file = option('file') ? path.resolve(ROOT, option('file')) : candidates.latestCandidatesFile(option('task'));

  if (!file || !fs.existsSync(file)) {
    console.error('找不到候选文件。先跑维护任务与 ai-accept。');
    return 1;
  }
  const payload = candidates.readCandidates(file);
  const accepted = payload.candidates.filter(item => item.review && item.review.decision === 'accept');
  const wanted = allAccepted ? accepted : accepted.filter(item => item.id === id || (id && item.id.startsWith(id)));

  if (!id && !allAccepted) {
    console.error('用法：node scripts/tools/ai-apply.js --id=<候选 id>（或 --all-accepted）');
    return 1;
  }
  if (!wanted.length) {
    console.error(`没有"已接受"的候选匹配 ${id || '(all)'}。先用 ai-accept 记录人工决定。`);
    return 1;
  }

  const deals = new Map(readJson(path.join(ROOT, 'deals.json')).deals.map(deal => [deal.id, deal]));
  const snapshots = new Map();
  const remember = target => {
    if (!snapshots.has(target)) snapshots.set(target, fs.readFileSync(target, 'utf8'));
  };
  const rollback = () => {
    for (const [target, text] of snapshots) fs.writeFileSync(target, text, 'utf8');
  };

  const logs = [];
  let applied = 0;
  let refused = 0;

  for (const item of wanted) {
    const deal = deals.get(item.dealId);
    console.log(`▸ ${item.id}  ${deal ? deal.title : item.dealId}`);

    if (item.task !== 'extract_offer') {
      console.log(`  ✗ 拒绝：${item.task} 候选不通过本工具落地（翻译走 zh:apply-candidates；重复/诊断/补丁/审计是报告，不是数据）`);
      refused++;
      continue;
    }
    if (!deal) {
      console.log(`  ✗ 拒绝：deals.json 里找不到 ${item.dealId}`);
      refused++;
      continue;
    }
    if (dryRun) {
      const route = ['Curated', 'Curated-CN'].includes(deal.source) ? 'curated_*.json' : 'audience-overrides.json';
      console.log(`  · dry-run：会写入 ${route}`);
      continue;
    }

    remember(CURATED[deal.region] || CURATED.global);
    remember(OVERRIDES);
    remember(path.join(ROOT, 'deals.json'));

    const result = ['Curated', 'Curated-CN'].includes(deal.source)
      ? applyToCurated(item, deal)
      : applyToOverrides(item, deal);

    if (!result.ok) {
      console.log(`  ✗ 拒绝：${result.reason}`);
      refused++;
      rollback();
      continue;
    }
    console.log(`  ✓ 已写入 ${result.target} —— ${result.detail}`);

    // ① 先离线重建 deals.json，让工作树重新自洽
    const rebuild = runRebuild();
    if (!rebuild.ok) {
      console.log('  ✗ 离线重建失败，已回滚本次写入：');
      String(rebuild.output).split('\n').filter(Boolean).slice(-8).forEach(line => console.log(`      ${line}`));
      rollback();
      refused++;
      continue;
    }
    console.log('  ✓ deals.json 已离线重建（未联网）');

    // ② 再跑确定性门禁
    const gate = runGate();
    if (!gate.ok) {
      console.log('  ✗ 门禁未通过，已回滚本次写入：');
      String(gate.output).split('\n').filter(Boolean).slice(-8).forEach(line => console.log(`      ${line}`));
      rollback();
      refused++;
      continue;
    }
    console.log('  ✓ validate --strict 通过');
    applied++;
    logs.push({
      appliedAt: new Date().toISOString(),
      targetFile: result.target,
      dealId: deal.id,
      dealTitle: deal.title,
      fields: Object.keys(item.candidate || {}).filter(field => schemas.CANDIDATE_FIELDS.includes(field)),
      candidateId: item.id,
      candidateHash: candidates.shortId([item.id, JSON.stringify(item.candidate)]),
      provider: item.provider,
      model: item.model,
      promptVersion: item.promptVersion,
      inputHash: item.inputHash,
      reviewNote: (item.review && item.review.note) || null,
      allowUnsupported: Boolean(item.review && item.review.allowUnsupported),
      acceptedBy: 'human'
    });
  }

  if (applied && !dryRun) {
    appendLog(logs);
    console.log(`\n已落地 ${applied} 条 · 拒绝 ${refused} 条 · 账本：${path.relative(ROOT, APPLIED_LOG)}`);
    console.log('工作树已自洽（deals.json 已离线重建）。建议再跑一次完整门禁：');
    console.log('  npm run test:strict && npm run check:reproducible && npm run check:zh');
  } else if (dryRun) {
    console.log('\ndry-run：没有写任何文件。');
  } else {
    console.log(`\n没有落地任何条目（拒绝 ${refused} 条）。`);
  }
  return applied || refused || dryRun ? 0 : 1;
}

process.exit(main());
