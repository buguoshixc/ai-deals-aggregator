#!/usr/bin/env node
/**
 * t9 / 题面 §63：**源可靠性结论的时间敏感反证**。
 *
 * 要证的不是「futurepedia 现在能不能抓」，而是「那条裁决不是被一时网络抖动影响的」：
 *   A. CI 侧读数：`git log -- scripts/data/source-health.json` 逐次重建（每次 CI 采集的落地读数），带 generatedAt；
 *   B. 本机侧读数：**现在**连跑 N 轮，每轮记时间戳与结果（同一批代码路径：生产 collector）；
 *   C. 两侧分开记录、都带时间戳；结论只允许写 observed unstable。
 *
 * 只读：不写任何生产文件；本机采集走 `scripts/collect.js --dry-run`（不写盘）。
 *
 * 用法：node source-reliability-counterproof.cjs [--rounds=3]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const OUT = path.join(__dirname, 'source-reliability-counterproof.json');
const argOf = (name, fallback) => {
  const hit = process.argv.slice(2).find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(`--${name}=`.length) : fallback;
};
const ROUNDS = Number(argOf('rounds', '3'));

const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const git = args => execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }).toString();

function ciReadings() {
  const shas = git(['log', '--format=%H', '--', 'scripts/data/source-health.json']).trim().split(/\r?\n/);
  const rows = [];
  for (const sha of shas) {
    let doc;
    try {
      doc = JSON.parse(git(['show', `${sha}:scripts/data/source-health.json`]));
    } catch (error) {
      continue;
    }
    const futurepedia = (doc.sources || []).find(row => row.source === 'futurepedia') || null;
    rows.push({
      commit: sha.slice(0, 7),
      commitTime: git(['log', '-1', '--format=%cI', sha]).trim(),
      generatedAt: doc.generatedAt,
      futurepedia: futurepedia && {
        status: futurepedia.status,
        consecutiveFailures: futurepedia.consecutiveFailures,
        lastSuccessAt: futurepedia.lastSuccessAt,
        lastItemCount: futurepedia.lastItemCount,
        lastError: futurepedia.lastError
      }
    });
  }
  let streak = 0;
  for (const row of rows) {
    if (row.futurepedia && row.futurepedia.status === 'healthy') break;
    streak += 1;
  }
  const healthy = rows.filter(row => row.futurepedia && row.futurepedia.status === 'healthy').length;
  return {
    readings: rows.length,
    healthy,
    failed: rows.length - healthy,
    currentStreakFailures: streak,
    streakFrom: streak ? rows[streak - 1].generatedAt : null,
    streakTo: streak ? rows[0].generatedAt : null,
    rows
  };
}

function localRounds() {
  const rounds = [];
  for (let index = 1; index <= ROUNDS; index++) {
    const startedAt = new Date();
    let result;
    try {
      const output = execFileSync(process.execPath, ['scripts/collect.js', '--dry-run', '--only=futurepedia'], {
        cwd: ROOT,
        timeout: 180000,
        maxBuffer: 32 * 1024 * 1024,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      const valid = /Futurepedia\s+国外\s+(\d+)/.exec(output);
      result = {
        round: index,
        startedAtUtc: startedAt.toISOString(),
        startedAtLocal: startedAt.toString(),
        exitCode: 0,
        produced: valid ? Number(valid[1]) : null,
        failedCollectors: /采集器失败\s+(\d+)\/(\d+)/.exec(output) ? /采集器失败\s+(\d+)\/(\d+)/.exec(output)[0] : null
      };
    } catch (error) {
      result = {
        round: index,
        startedAtUtc: startedAt.toISOString(),
        startedAtLocal: startedAt.toString(),
        exitCode: typeof error.status === 'number' ? error.status : 1,
        error: String(error.stdout || error.message).slice(-400)
      };
    }
    rounds.push(result);
    if (index < ROUNDS) {
      const waitUntil = Date.now() + 2000;
      while (Date.now() < waitUntil) { /* 让三轮之间有明确时间差 */ }
    }
  }
  return rounds;
}

function main() {
  const startedAt = new Date();
  const health = readJson('scripts/data/source-health.json');
  const rulings = readJson('scripts/data/source-rulings.json');
  const ci = ciReadings();
  const local = localRounds();
  const longFailing = (health.sources || []).filter(row => Number(row.consecutiveFailures) >= 3)
    .map(row => ({ source: row.source, consecutiveFailures: row.consecutiveFailures, status: row.status, lastError: row.lastError }));

  const out = {
    probe: 'source-reliability-counterproof.cjs',
    ranAtUtc: startedAt.toISOString(),
    ranAtLocal: startedAt.toString(),
    question: '来源裁决（futurepedia = keep-degraded）是不是被一时网络抖动影响的？',
    ciSide: {
      source: 'git log -- scripts/data/source-health.json（每次 CI 采集的落地读数；TZ=Asia/Shanghai，cron 0 0/12 * * * UTC）',
      healthFileGeneratedAt: health.generatedAt,
      healthFileSha256: require('crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'scripts/data/source-health.json'))).digest('hex'),
      ...ci
    },
    localSide: {
      source: 'node scripts/collect.js --dry-run --only=futurepedia（生产代码路径，不写盘）',
      rounds: local,
      allSucceeded: local.every(round => round.exitCode === 0),
      itemCounts: local.map(round => round.produced)
    },
    rulingsOnDisk: {
      reviewedAt: rulings.reviewedAt,
      decisions: (rulings.rulings || []).map(row => ({ source: row.source, decision: row.decision, revisitBy: row.revisitBy || null }))
    },
    longFailingFromLiveHealth: longFailing,
    verdict: null
  };

  const ciFailing = ci.currentStreakFailures > 0;
  const localOk = out.localSide.allSucceeded;
  out.verdict = ciFailing && localOk
    ? 'observed unstable（CI 侧连续失败 / 本机侧本轮全成功；两侧读数分开、都带时间戳）—— 这是**当次观测**，不是"已恢复"，也不是"来源坏了"'
    : ciFailing && !localOk
      ? '两侧都失败：来源当前不可用（仍不是永久结论，需再看一轮）'
      : '两侧都成功：本刻没有可复现的失败（仍不足以写 fixed —— 需要跨天多轮）';

  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`[counterproof] CI 侧：${ci.readings} 次读数，healthy ${ci.healthy} / failed ${ci.failed}，当前连续失败 ${ci.currentStreakFailures}（${ci.streakFrom} → ${ci.streakTo}）`);
  console.log(`[counterproof] 本机侧：${local.length} 轮 --dry-run --only=futurepedia，全成功=${localOk}，每轮条数=${JSON.stringify(out.localSide.itemCounts)}`);
  for (const round of local) console.log(`   round${round.round} ${round.startedAtUtc} exit=${round.exitCode} produced=${round.produced}`);
  console.log(`[counterproof] 盘上裁决：${JSON.stringify(out.rulingsOnDisk.decisions)}（cf≥3 的来源 ${JSON.stringify(longFailing.map(r => r.source))}）`);
  console.log(`[counterproof] 结论：${out.verdict}`);
  console.log(`[counterproof] 写出: ${path.relative(ROOT, OUT)}`);
}

main();
