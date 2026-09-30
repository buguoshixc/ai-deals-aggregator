#!/usr/bin/env node
/**
 * 历史日志的**离线**交叉校验：用 git 里的 `deals.json` 版本反推字段变化，与事件日志对账。
 *
 * 用法：
 *   node scripts/tools/history-audit.js            # 有差异则退出 1
 *   node scripts/tools/history-audit.js --json     # 机器可读
 *   node scripts/tools/history-audit.js --since=2026-09-30
 *
 * ## 为什么它是离线工具，而不进 CI 门禁
 *
 * git 历史确实是一份独立的审计日志（这正是方案 B 的洞见），但它有两个不能进闸门的前提：
 *
 *   1. **CI 默认浅克隆**（`actions/checkout` 不设 `fetch-depth` 时只有 1 个提交），
 *      在 CI 里跑它要么取不到历史、要么得给采集与发布链加一个 `fetch-depth: 0` 的隐性依赖；
 *   2. **本仓出现过历史重写**（`backup-pre-rewrite` 那个分支），而重写过的历史不再是事实来源。
 *
 * 所以它是「换一把尺子量同一件事」的交叉证据：门禁（`check:history`）保证
 * 「基线 + 事件 ⇒ 当前状态」自洽；这里保证「日志里的变化在 git 里也发生过」。
 * 两者都过，才敢说这层历史不是自说自话。
 *
 * ## 口径
 *
 *   · 只对账 `--since`（默认取历史起算日）之后的提交 —— 之前的变化本来就没有历史；
 *   · 日期取提交时间的**北京时间日期**，与事件日志同口径；
 *   · 字段事件按 `id + field + to` 匹配，日期不同记为 date_mismatch；
 *   · 记录消失（旧版本有、新版本没有）与 `ended` 对账。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const history = require('../lib/history');

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const sinceArg = (args.find(a => a.startsWith('--since=')) || '').slice('--since='.length);

function beijingDate(iso) {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return null;
  return new Date(at.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function git(list) {
  return execFileSync('git', list, { cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
}

function main() {
  const loaded = history.load();
  if (loaded.missing || loaded.broken) {
    console.error(`❌ 历史日志不可用（${loaded.broken || '文件缺失'}）—— 先跑 check:history`);
    process.exit(1);
  }
  const since = sinceArg || loaded.store.startedAt;
  const logEvents = history.eventsOf(loaded.store);

  let commits;
  try {
    commits = git(['log', '--format=%H %cI', '--', 'deals.json'])
      .trim().split('\n').filter(Boolean)
      .map(line => {
        const [sha, iso] = line.split(' ');
        return { sha, iso, date: beijingDate(iso) };
      })
      .reverse(); // 旧 → 新
  } catch (error) {
    console.error(`❌ 读 git 历史失败：${error.message}`);
    process.exit(1);
  }

  const gitChanges = [];
  let versionsRead = 0;
  for (let i = 1; i < commits.length; i++) {
    const older = commits[i - 1];
    const newer = commits[i];
    // 严格晚于基线日：基线（`baseline.at`）冻结的是**当天结束时的状态**，
    // 所以当天（含）之前的提交已经被基线吸收，拿它们对账必然报「日志漏记」—— 那是假红。
    if (!newer.date || newer.date <= since) continue;
    let before;
    let after;
    try {
      before = JSON.parse(git(['show', `${older.sha}:deals.json`])).deals || [];
      after = JSON.parse(git(['show', `${newer.sha}:deals.json`])).deals || [];
      versionsRead++;
    } catch (error) {
      continue; // 该提交里文件不可解析（历史格式）——跳过，不猜
    }
    const beforeById = new Map(before.map(deal => [deal.id, deal]));
    const afterById = new Map(after.map(deal => [deal.id, deal]));
    for (const [id, deal] of afterById) {
      const prev = beforeById.get(id);
      if (!prev) {
        gitChanges.push({ id, field: null, type: 'created', at: newer.date, sha: newer.sha });
        continue;
      }
      for (const field of history.TRACKED_FIELDS) {
        const from = history.normValue(prev[field]);
        const to = history.normValue(deal[field]);
        if (history.sameValue(from, to)) continue;
        gitChanges.push({ id, field, type: history.FIELD_EVENT[field], from, to, at: newer.date, sha: newer.sha });
      }
    }
    for (const [id] of beforeById) {
      if (afterById.has(id)) continue;
      gitChanges.push({ id, field: null, type: 'ended', at: newer.date, sha: newer.sha });
    }
  }

  const relevantLog = logEvents.filter(event => event.at > since);
  const logKey = event => event.field ? `${event.id}|${event.field}|${JSON.stringify(history.normValue(event.to))}` : `${event.id}|${event.type}`;
  const gitKey = change => change.field ? `${change.id}|${change.field}|${JSON.stringify(history.normValue(change.to))}` : `${change.id}|${change.type}`;

  const gitByKey = new Map();
  for (const change of gitChanges) {
    const key = gitKey(change);
    if (!gitByKey.has(key)) gitByKey.set(key, []);
    gitByKey.get(key).push(change);
  }
  const logByKey = new Map();
  for (const event of relevantLog) {
    const key = logKey(event);
    if (!logByKey.has(key)) logByKey.set(key, []);
    logByKey.get(key).push(event);
  }

  const gitOnly = [];
  for (const change of gitChanges) {
    const matches = logByKey.get(gitKey(change)) || [];
    if (!matches.length) { gitOnly.push(change); continue; }
    const dates = matches.map(event => event.at);
    if (!dates.includes(change.at)) {
      gitOnly.push({ ...change, reason: `日志里的同名变化发生在 ${dates.join('/')}，git 是 ${change.at}` });
    }
  }
  const logOnly = [];
  for (const event of relevantLog) {
    const matches = gitByKey.get(logKey(event)) || [];
    if (!matches.length) logOnly.push(event);
  }

  const result = {
    since,
    commitsTotal: commits.length,
    commitsInWindow: versionsRead,
    gitChanges: gitChanges.length,
    logEvents: relevantLog.length,
    gitOnly: gitOnly.length,
    logOnly: logOnly.length,
    ok: gitOnly.length === 0 && logOnly.length === 0
  };

  if (JSON_OUT) {
    console.log(JSON.stringify({ ...result, gitOnlyExamples: gitOnly.slice(0, 10), logOnlyExamples: logOnly.slice(0, 10) }, null, 2));
  } else {
    console.log('=== 历史日志 × git 版本 交叉校验（离线）===');
    console.log(`起算日        : ${since}`);
    console.log(`提交          : ${commits.length} 个（窗口内可解析的相邻对 ${versionsRead} 组）`);
    console.log(`git 推导变化  : ${gitChanges.length} 处 · 日志事件 ${relevantLog.length} 条`);
    console.log(`只在 git 里   : ${gitOnly.length} 处`);
    console.log(`只在日志里    : ${logOnly.length} 条`);
    gitOnly.slice(0, 8).forEach(item => console.log(`   · [git] ${item.id} ${item.field || item.type} → ${JSON.stringify(item.to ?? null)} @ ${item.at}（${item.sha.slice(0, 7)}）${item.reason ? ` —— ${item.reason}` : ''}`));
    logOnly.slice(0, 8).forEach(item => console.log(`   · [log] ${item.id} ${item.field || item.type} @ ${item.at}`));
  }

  if (gitChanges.length === 0 && relevantLog.length === 0) {
    if (!JSON_OUT) console.log('\nℹ️  窗口内没有任何变化（历史起算日之后还没有数据提交）—— 这次对账没有可比的样本。');
    return;
  }
  if (!result.ok) {
    console.error('\n❌ 日志与 git 版本对不上：要么历史漏记，要么有人手改了 deals.json 而没走采集路径。');
    process.exit(1);
  }
  if (!JSON_OUT) console.log('\n✅ 交叉校验通过：窗口内日志与 git 版本一致。');
}

main();
