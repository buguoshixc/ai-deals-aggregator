#!/usr/bin/env node
/**
 * 记录**人工决定**（只改候选文件，不碰任何生产数据）。
 *
 * 用法：
 *   node scripts/tools/ai-accept.js --id=<候选 id> [--note="…"]
 *   node scripts/tools/ai-accept.js --id=<候选 id> --allow-unsupported --note="我查过官方页，确实不需要信用卡"
 *   node scripts/tools/ai-reject.js …（用 --reject 走同一条路）
 *
 * 为什么把"接受"与"落地"拆成两步：
 *   `accept` 只写下"人看过了、同意"这个事实；`apply` 才写生产数据。
 *   拆开之后，误点一次不会改数据；而且候选文件里留下了**谁在什么时候同意了什么**，
 *   这正是"AI 候选可追溯"里属于人的那一半。
 *
 * 需要 `--allow-unsupported` 的情形：候选被标了 `needs_human`（例如判了 `false` 但引文里
 * 没有否定线索）。那意味着**看的人要自己给出依据** —— 所以这个开关刻意长、刻意难打，
 * 而且会把 note 记进账里。
 *
 * 两道入口纪律（P1-1 / P2-14 的守卫）：
 *   · `--file` 只接受**候选文件**：落点必须在 `.ai-cache/**` 或 `research/**`（白名单），
 *     内容必须是候选信封 —— `--file=deals.json` 这类调用会被明确拒掉（exit 1）；
 *   · 记录 accept 之前，用与生成时**同一套**规则重算机器门（schema / enum / evidence）：
 *     人同意的是"这条候选"，不是一个形状已经被改坏的东西。
 */

'use strict';

const path = require('path');
const candidates = require('../ai/candidates');

const ROOT = path.join(__dirname, '..', '..');

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function main() {
  const id = option('id');
  const note = option('note');
  const reject = flag('reject');
  const allowUnsupported = flag('allow-unsupported');

  if (!id) {
    console.error('用法：node scripts/tools/ai-accept.js --id=<候选 id> [--note="…"] [--reject]');
    return 1;
  }

  let file;
  try {
    file = option('file')
      ? candidates.resolveOutputPath(option('file'), { label: '候选文件' })
      : candidates.latestCandidatesFile(option('task'));
    if (!file) throw new Error('没有找到候选文件：先跑一次 node scripts/ai/maintenance.js --task=…');
  } catch (error) {
    console.error(`❌ ${error.message}`);
    return 1;
  }

  let payload;
  try {
    payload = candidates.readCandidatesStrict(file);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    return 1;
  }

  const hits = payload.candidates.filter(item => item.id === id || item.id.startsWith(id));
  if (!hits.length) {
    console.error(`候选文件 ${path.relative(ROOT, file)} 里没有 id 以 ${id} 开头的候选`);
    return 1;
  }
  if (hits.length > 1) {
    console.error(`id 前缀 ${id} 命中 ${hits.length} 条，请给全一点`);
    return 1;
  }

  const item = hits[0];
  if (reject) {
    item.review = { decision: 'reject', at: new Date().toISOString(), note: note || null };
    item.status = 'rejected';
    candidates.writeCandidates(file, payload);
    console.log(`已记录：拒绝 ${item.id}（${note || '未写说明'}）`);
    return 0;
  }

  // 机器门（schema / enum / evidence）：生成时记下的结论 + 用同一套规则重算一遍。
  // 重算的意义：候选文件是**可以被人手改**的（它就是给人看的），所以"生成时过了"这句话
  // 必须在记 accept 的这一刻仍然成立。任何一处改动都会在这里被抓住。
  const recheck = candidates.checkDeterministic(item.candidate, {
    task: item.task,
    evidence: item.evidence,
    confidence: item.confidence
  });
  const gateProblems = [
    ...candidates.deterministicFailures(item).map(text => `生成时记录未过门：${text}`),
    ...recheck.errors
  ];
  if (gateProblems.length) {
    console.error(`拒绝接受 ${item.id}：机器门未通过，不能进入生产。`);
    gateProblems.forEach(text => console.error(`  ✗ ${text}`));
    console.error('  （要放弃这条就用 --reject 记下拒绝；要修复就改候选或重跑生成。）');
    return 1;
  }

  if (item.status === 'needs_human' && !allowUnsupported) {
    console.error(`拒绝接受 ${item.id}：它被标为 needs_human。`);
    for (const flagItem of item.flags || []) console.error(`  ⚠ ${flagItem.code}：${flagItem.detail}`);
    console.error('');
    console.error('这意味着 AI 给了结论但依据不足。请先自己核对官方页面：');
    console.error('  · 核对后认为结论正确 → 加 --allow-unsupported 并写清依据：--note="…"');
    console.error('  · 认为结论不对 → 用 --reject 记下拒绝');
    return 1;
  }

  if (item.status === 'invalid') {
    console.error(`拒绝接受 ${item.id}：它被确定性规则判为无效，不能落地。`);
    return 1;
  }

  item.review = {
    decision: 'accept',
    at: new Date().toISOString(),
    note: note || null,
    allowUnsupported: item.status === 'needs_human' ? true : undefined
  };
  item.status = 'accepted';
  candidates.writeCandidates(file, payload);

  console.log(`已记录：接受 ${item.id}（${item.dealId || ''}${item.field ? ` / ${item.field}` : ''}）`);
  if (!note) console.log('提示：没写 --note —— 将来只会看到"人接受过"，看不到为什么。');
  console.log('下一步：node scripts/tools/ai-apply.js --id=' + item.id);
  return 0;
}

process.exit(main());
