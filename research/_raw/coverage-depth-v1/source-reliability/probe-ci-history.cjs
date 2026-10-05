#!/usr/bin/env node
/**
 * 只读取证（t4 / Workstream C-1）：从 git 历史重建 **CI 侧**的 source-health.json 逐次读数。
 *
 * 为什么要它：「本地读数与 CI 读数分开记录」是本任务的硬要求。CI 侧没有日志可读，
 * 但每次 CI 采集都会把 source-health.json 提交进仓库（chore(data) 机器人提交），
 * 于是 `git show <sha>:scripts/data/source-health.json` 就是**逐次的 CI 读数快照** ——
 * 这是同一条真值链上的历史，不引入第二套真相。
 *
 * 只读：不写生产文件，输出落本目录。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const sh = cmd => execSync(cmd, { cwd: ROOT, maxBuffer: 1024 * 1024 * 64 }).toString();

function main() {
  const shas = sh('git log --format=%H -- scripts/data/source-health.json').trim().split(/\r?\n/);
  const rows = [];
  for (const sha of shas) {
    let doc;
    try {
      doc = JSON.parse(sh(`git show ${sha}:scripts/data/source-health.json`));
    } catch (error) {
      rows.push({ commit: sha.slice(0, 7), parseError: String(error.message).slice(0, 120) });
      continue;
    }
    const commitTime = sh(`git log -1 --format=%cI ${sha}`).trim();
    const commitSubject = sh(`git log -1 --format=%s ${sha}`).trim();
    const census = { healthy: 0, degraded: 0, failed: 0, other: 0 };
    for (const row of doc.sources || []) {
      if (census[row.status] === undefined) census.other += 1; else census[row.status] += 1;
    }
    const nonHealthy = (doc.sources || []).filter(r => r.status !== 'healthy').map(r => `${r.source}:${r.status}:${r.consecutiveFailures}`);
    rows.push({
      commit: sha.slice(0, 7),
      commitTime,
      commitSubject,
      generatedAt: doc.generatedAt,
      census,
      nonHealthy,
      futurepedia: (doc.sources || []).find(r => r.source === 'futurepedia') || null
    });
  }

  const fp = rows.filter(r => r.futurepedia);
  const successes = fp.filter(r => r.futurepedia.status === 'healthy');
  const failures = fp.filter(r => r.futurepedia.status !== 'healthy');
  // 连续失败段：rows 是**新→旧**排序，所以「最近一次成功」= 从头开始遇到的第一个 healthy
  let firstHealthyIndex = -1;
  for (let i = 0; i < fp.length; i++) {
    if (fp[i].futurepedia.status === 'healthy') { firstHealthyIndex = i; break; }
  }
  const streak = fp.slice(0, firstHealthyIndex === -1 ? fp.length : firstHealthyIndex);

  const artifact = {
    probe: 'probe-ci-history.cjs',
    ranAtUtc: new Date().toISOString(),
    source: 'git log -- scripts/data/source-health.json（每次 CI 采集的提交）',
    readingsCount: rows.length,
    futurepediaSummary: {
      readings: fp.length,
      healthyReadings: successes.length,
      failedReadings: failures.length,
      lastHealthyGeneratedAt: successes.length ? successes[0].generatedAt : null,
      lastHealthyCommitTime: successes.length ? successes[0].commitTime : null,
      currentStreakFailures: streak.length,
      currentStreakFirstFailureGeneratedAt: streak.length ? streak[streak.length - 1].generatedAt : null,
      currentStreakLastFailureGeneratedAt: streak.length ? streak[0].generatedAt : null,
      consecutiveFailuresCounterAtHead: fp.length ? fp[0].futurepedia.consecutiveFailures : null,
      lastSuccessAtAtHead: fp.length ? fp[0].futurepedia.lastSuccessAt : null
    },
    nonHealthyAcrossAllReadings: [...new Set(rows.flatMap(r => (r.nonHealthy || []).map(x => x.split(':')[0])))]
      .map(source => ({
        source,
        readings: rows.filter(r => (r.nonHealthy || []).some(x => x.startsWith(`${source}:`))).length
      })),
    rows
  };

  const outFile = path.join(__dirname, 'ci-readings.json');
  fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`[ci-history] 读数 ${rows.length} 次；futurepedia healthy ${successes.length} / failed ${failures.length}`);
  console.log(`[ci-history] 最近一次 CI 成功: generatedAt=${artifact.futurepediaSummary.lastHealthyGeneratedAt} commitTime=${artifact.futurepediaSummary.lastHealthyCommitTime}`);
  console.log(`[ci-history] 连续失败段: ${artifact.futurepediaSummary.currentStreakFailures} 次，从 ${artifact.futurepediaSummary.currentStreakFirstFailureGeneratedAt} 到 ${artifact.futurepediaSummary.currentStreakLastFailureGeneratedAt}`);
  console.log(`[ci-history] HEAD 计数 consecutiveFailures=${artifact.futurepediaSummary.consecutiveFailuresCounterAtHead} lastSuccessAt=${artifact.futurepediaSummary.lastSuccessAtAtHead}`);
  console.log(`[ci-history] 所有读数里出现过的非 healthy 来源: ${JSON.stringify(artifact.nonHealthyAcrossAllReadings)}`);
  console.log(`[ci-history] 写出: ${outFile}`);
}

main();
