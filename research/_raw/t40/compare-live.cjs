#!/usr/bin/env node
/**
 * t40 —— 线上 before/after 比较器 + 快照抓取（**只读**）。
 *
 * 解决的是 t19 线上冒烟里的一个具体麻烦：
 *   · 现在线上跑的还是**旧版本**（`data-model=0` / `models-show-legacy=0`）；
 *   · 部署之后要机器判定「换版本了没有」，而不是人眼看；
 *   · GitHub Pages 前面有 CDN（`Cache-Control: max-age=600`，响应带 `Age`）⇒
 *     「刷新后还是旧的」可能只是缓存没过期，**不能**据此判缺陷；
 *   · **绝不用查询串绕缓存来自证**（`?v=` 只会证明"源站有新版"，而读者看到的是缓存里那一份）。
 *
 * 三个模式：
 *   1) 抓快照：      node compare-live.cjs --snapshot=research/_raw/t40/live-baseline.json
 *   2) 比较：        node compare-live.cjs --before=… --after=… [--json=out.json] [--require-deployed]
 *   3) 等部署再比：  node compare-live.cjs --poll-after=… --before=… [--timeout-min=12] [--interval-sec=45]
 *
 * 退出码（**给 t19 判红用**）：
 *   0 = 比较完成且满足期望（0 差异，或差异已如实给出且未要求 --require-deployed）
 *   1 = `--require-deployed` 下不满足期望（版本没变 / 关键 DOM 事实不对）
 *   2 = **after 取不到**（文件不存在、读不了，或 after 的所有路由都取不到）—— 明确输出，不崩
 *   3 = 用法错误
 *
 * 依赖：只用 Node 内建（`fetch`）。本脚本只读线上；**只写调用方指定的快照/JSON 路径**。
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'https://buguoshixc.github.io/ai-deals-aggregator/';
const SCHEMA_VERSION = 1;

/**
 * 七条路由（acceptance ① 点名的那七条）。
 * `facts` 说明这条路由上要数什么 —— 数的是**页面原文里的属性出现次数**，
 * 与 t19 要验的三件新事实一一对应：
 *   · `data-model=`        索引页静态表行数（本版 = 44；旧版 = 0）
 *   · `models-show-legacy` 「显示旧型号」入口（本版 ≥1；旧版 = 0）
 *   · `data-release-date=` 详情页发布时间标记（旧版没有）
 */
const ROUTES = [
  { route: '', facts: {} },
  { route: 'models/', facts: { dataModelCount: 'data-model=', modelsShowLegacyCount: 'models-show-legacy' } },
  { route: 'models/deepseek-v3.2/', facts: { releaseDateMarkerCount: 'data-release-date=' } },
  { route: 'plans/api/', facts: {} },
  { route: 'plans/coding/', facts: {} },
  { route: 'sitemap.xml', facts: { locCount: '<loc>' } },
  { route: 'feeds/', facts: {} }
];

/** 本版上线后应当成立的期望读数（t19 判红用） */
const EXPECTATIONS = {
  dataModelCount: 44,
  modelsShowLegacyCountMin: 1,
  releaseDateMarkerCountMin: 1,
  note: 't40 预检时线上是旧版本：data-model=0 / models-show-legacy=0 / 详情页无 data-release-date'
};

const HEADER_KEYS = ['last-modified', 'etag', 'cache-control', 'age', 'content-length', 'server', 'x-proxy-cache', 'date'];

function argOf(name) {
  const hit = process.argv.find(arg => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const flagOf = name => process.argv.includes(`--${name}`);

/** 抓一条路由：GET（要数 DOM 事实只能拿 body），超时 30 秒，不跟随到站外 */
async function fetchRoute(entry, base = BASE) {
  const url = `${base}${entry.route}`;
  const headers = {};
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      // 只关掉**客户端**缓存（undici 本来也没有 HTTP 缓存）；**不影响** CDN，
      // 也**不**在 URL 上加任何查询串 —— 绕过 CDN 自证更新是被明令禁止的那种做法。
      cache: 'no-store',
      signal: AbortSignal.timeout(30000)
    });
    const body = await response.text();
    for (const key of HEADER_KEYS) headers[key] = response.headers.get(key);
    const facts = {};
    for (const [name, needle] of Object.entries(entry.facts || {})) {
      facts[name] = body.split(needle).length - 1;
    }
    return {
      route: entry.route,
      url,
      status: response.status,
      ok: response.ok,
      headers,
      facts,
      bodyBytes: Buffer.byteLength(body, 'utf8'),
      error: null
    };
  } catch (error) {
    return {
      route: entry.route,
      url,
      status: 0,
      ok: false,
      headers,
      facts: {},
      bodyBytes: 0,
      error: String((error && error.message) || error)
    };
  }
}

/** 抓一份完整快照（只读） */
async function capture(base = BASE) {
  const routes = [];
  for (const entry of ROUTES) routes.push(await fetchRoute(entry, base));
  return {
    schemaVersion: SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    base,
    expectations: EXPECTATIONS,
    routes
  };
}

/* ------------------------------------------------------------------ */
/* 比较                                                                */
/* ------------------------------------------------------------------ */

/** 版本信号：状态 / Last-Modified / ETag —— `Age` 是缓存计数器，永远在变，**不作为判据** */
const versionSignalOf = item => ({
  status: item.status,
  lastModified: item.headers['last-modified'] || null,
  etag: item.headers.etag || null
});

function compareRoutes(before, after) {
  const byRoute = new Map((after.routes || []).map(item => [item.route, item]));
  const rows = [];
  for (const old of before.routes || []) {
    const now = byRoute.get(old.route);
    if (!now) {
      rows.push({ route: old.route, missing: true, differences: ['after 快照里没有这条路由'], noise: [] });
      continue;
    }
    const differences = [];
    const noise = [];
    const oldSignal = versionSignalOf(old);
    const newSignal = versionSignalOf(now);
    if (oldSignal.status !== newSignal.status) {
      differences.push(`状态 ${oldSignal.status} → ${newSignal.status}${now.error ? `（${now.error}）` : ''}`);
    }
    if (oldSignal.lastModified !== newSignal.lastModified) {
      differences.push(`Last-Modified ${oldSignal.lastModified} → ${newSignal.lastModified}`);
    }
    if (oldSignal.etag !== newSignal.etag) {
      differences.push(`ETag ${oldSignal.etag} → ${newSignal.etag}`);
    }
    for (const key of new Set([...Object.keys(old.facts || {}), ...Object.keys(now.facts || {})])) {
      if ((old.facts || {})[key] !== (now.facts || {})[key]) {
        differences.push(`DOM 事实 ${key}: ${JSON.stringify((old.facts || {})[key])} → ${JSON.stringify((now.facts || {})[key])}`);
      }
    }
    if ((old.headers || {}).age !== (now.headers || {}).age) {
      noise.push(`Age ${old.headers.age} → ${now.headers.age}（缓存计数器，不算版本变化）`);
    }
    rows.push({ route: old.route, missing: false, differences, noise, before: old, after: now });
  }
  return rows;
}

/** 期望读数是否成立（t19 判红条件） */
function expectationChecks(after) {
  const factsOf = route => {
    const hit = (after.routes || []).find(item => item.route === route);
    return (hit && hit.facts) || {};
  };
  const models = factsOf('models/');
  const detail = factsOf('models/deepseek-v3.2/');
  const checks = [
    {
      name: `索引页 data-model == ${EXPECTATIONS.dataModelCount}`,
      ok: models.dataModelCount === EXPECTATIONS.dataModelCount,
      actual: models.dataModelCount
    },
    {
      name: `索引页 models-show-legacy >= ${EXPECTATIONS.modelsShowLegacyCountMin}`,
      ok: typeof models.modelsShowLegacyCount === 'number' && models.modelsShowLegacyCount >= EXPECTATIONS.modelsShowLegacyCountMin,
      actual: models.modelsShowLegacyCount
    },
    {
      name: `legacy 详情页 data-release-date >= ${EXPECTATIONS.releaseDateMarkerCountMin}`,
      ok: typeof detail.releaseDateMarkerCount === 'number' && detail.releaseDateMarkerCount >= EXPECTATIONS.releaseDateMarkerCountMin,
      actual: detail.releaseDateMarkerCount
    },
    {
      name: '七条路由全部 200',
      ok: (after.routes || []).length > 0 && (after.routes || []).every(item => item.status === 200),
      actual: (after.routes || []).filter(item => item.status !== 200).map(item => `${item.route || '/'}=${item.status}`).join(',') || '7/7 200'
    }
  ];
  return checks;
}

function printComparison(before, after, rows, checks) {
  console.log(`before：${before.capturedAt || '(无 capturedAt)'}  ${before.base || ''}`);
  console.log(`after ：${after.capturedAt || '(无 capturedAt)'}  ${after.base || ''}`);
  console.log('\n逐路由：');
  let totalDiff = 0;
  for (const row of rows) {
    totalDiff += row.differences.length;
    const mark = row.missing ? '⛔' : row.differences.length ? '≠' : '=';
    console.log(`  ${mark} ${(row.route || '/').padEnd(24)} ${row.missing ? 'after 取不到这条路由' : `${row.differences.length} 处差异`}`);
    for (const line of row.differences) console.log(`      · ${line}`);
    for (const line of row.noise) console.log(`      ~ ${line}`);
  }
  console.log(`\n合计差异：${totalDiff} 处`);
  if (checks) {
    console.log('\n期望读数（t19 判红条件）：');
    for (const item of checks) console.log(`  ${item.ok ? '✓' : '✗'} ${item.name} —— 实得 ${JSON.stringify(item.actual)}`);
  }
  const versionChanged = rows.some(row => !row.missing && row.differences.some(line =>
    line.startsWith('Last-Modified') || line.startsWith('ETag') || line.startsWith('状态')));
  const stillOld = (after.routes || []).find(item => item.route === 'models/');
  const oldMarker = stillOld && stillOld.facts && stillOld.facts.dataModelCount === 0;
  console.log('\n判定：');
  console.log(`  · 版本信号（状态 / Last-Modified / ETag 有变化）：${versionChanged ? '有' : '无'}`);
  console.log(`  · 索引页 data-model：${stillOld && stillOld.facts ? stillOld.facts.dataModelCount : '(取不到)'}` +
    `${oldMarker ? ' ⇒ 仍是旧版本（**先等 CDN ≤600 秒，不要判缺陷**）' : ''}`);
  if (checks) {
    console.log(`  · 期望读数：${checks.every(item => item.ok) ? '全部成立 ⇒ 本版已生效' : '未全部成立 ⇒ 见上（若版本信号也为「无」，那是还没部署/缓存没过期，不是内容缺陷）'}`);
  }
  return { totalDiff, versionChanged, expectationsOk: checks ? checks.every(item => item.ok) : null };
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

async function main() {
  const snapshotTo = argOf('snapshot');
  const beforePath = argOf('before');
  const afterPath = argOf('after');
  const pollTo = argOf('poll-after');
  const jsonTo = argOf('json');
  const requireDeployed = flagOf('require-deployed');
  const timeoutMin = Number(argOf('timeout-min') || 12);
  const intervalSec = Number(argOf('interval-sec') || 45);

  if (snapshotTo) {
    const snapshot = await capture();
    fs.writeFileSync(snapshotTo, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    const models = (snapshot.routes.find(item => item.route === 'models/') || {}).facts || {};
    const detail = (snapshot.routes.find(item => item.route === 'models/deepseek-v3.2/') || {}).facts || {};
    console.log(`✅ 快照已写出：${snapshotTo}（${snapshot.capturedAt}）`);
    console.log(`   根路由：${snapshot.routes[0].status} · Last-Modified ${snapshot.routes[0].headers['last-modified']} · ETag ${snapshot.routes[0].headers.etag} · Age ${snapshot.routes[0].headers.age}`);
    console.log(`   关键 DOM 事实：data-model=${models.dataModelCount} · models-show-legacy=${models.modelsShowLegacyCount} · 详情页 data-release-date=${detail.releaseDateMarkerCount}`);
    const failed = snapshot.routes.filter(item => item.status !== 200);
    if (failed.length) console.log(`   ⚠️ 非 200 的路由：${failed.map(item => `${item.route || '/'}=${item.status}${item.error ? `(${item.error})` : ''}`).join(' · ')}`);
    return 0;
  }

  if (pollTo) {
    if (!beforePath) { console.error('用法：--poll-after=<file> 需要同时给 --before=<file>'); return 3; }
    if (!fs.existsSync(beforePath)) { console.error(`⛔ before 快照取不到：${beforePath}`); return 2; }
    const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
    const baselineRoot = (before.routes || [])[0] || { headers: {} };
    console.log(`轮询等待部署上线（**不**加查询串、**不**绕缓存）：最长 ${timeoutMin} 分钟 · 每 ${intervalSec} 秒一次`);
    console.log(`before 根路由：Last-Modified ${baselineRoot.headers['last-modified']} · ETag ${baselineRoot.headers.etag}`);
    const deadline = Date.now() + timeoutMin * 60 * 1000;
    let attempt = 0;
    for (;;) {
      attempt += 1;
      const snapshot = await capture();
      const root = snapshot.routes[0];
      const changed = root.headers['last-modified'] !== baselineRoot.headers['last-modified']
        || root.headers.etag !== baselineRoot.headers.etag;
      const models = (snapshot.routes.find(item => item.route === 'models/') || {}).facts || {};
      console.log(`  [${attempt}] Age=${root.headers.age} x-proxy-cache=${root.headers['x-proxy-cache']}` +
        ` Last-Modified=${root.headers['last-modified']} data-model=${models.dataModelCount}` +
        `${changed ? ' ⇒ 版本已变' : ''}`);
      if (changed) {
        fs.writeFileSync(pollTo, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
        console.log(`✅ 检测到版本变化，after 快照已写出：${pollTo}`);
        const rows = compareRoutes(before, snapshot);
        const checks = expectationChecks(snapshot);
        const { expectationsOk } = printComparison(before, snapshot, rows, checks);
        if (jsonTo) fs.writeFileSync(jsonTo, `${JSON.stringify({ before: beforePath, after: pollTo, rows: rows.map(row => ({ route: row.route, missing: row.missing, differences: row.differences })), checks }, null, 2)}\n`, 'utf8');
        return requireDeployed && !expectationsOk ? 1 : 0;
      }
      if (Date.now() >= deadline) {
        fs.writeFileSync(pollTo, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
        console.log(`⏱️ ${timeoutMin} 分钟内没有观察到版本变化 —— 已把最后一次快照写到 ${pollTo}`);
        console.log('   处置：先确认 deploy workflow 成功（gh run list --workflow "Deploy to GitHub Pages"）；');
        console.log('   若 deploy 成功而这里仍未变，是 CDN 还没过期（max-age=600）⇒ 稍后再跑本命令，**不要**加查询串绕缓存。');
        return requireDeployed ? 1 : 0;
      }
      await new Promise(resolve => setTimeout(resolve, intervalSec * 1000));
    }
  }

  if (!beforePath || !afterPath) {
    console.log('用法：');
    console.log('  node compare-live.cjs --snapshot=<out.json>');
    console.log('  node compare-live.cjs --before=<a.json> --after=<b.json> [--json=<out.json>] [--require-deployed]');
    console.log('  node compare-live.cjs --poll-after=<b.json> --before=<a.json> [--timeout-min=12] [--interval-sec=45]');
    return 3;
  }

  if (!fs.existsSync(beforePath)) { console.error(`⛔ before 快照取不到：${beforePath}`); return 2; }
  if (!fs.existsSync(afterPath)) {
    console.error(`⛔ after 快照取不到：${afterPath}`);
    console.error('   （先跑 --snapshot=… 抓 after，或用 --poll-after=… 等部署上线；本次没有比较任何东西）');
    return 2;
  }
  let before;
  let after;
  try {
    before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
    after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));
  } catch (error) {
    console.error(`⛔ 快照不是合法 JSON：${String(error.message)}`);
    return 2;
  }
  if (!Array.isArray(after.routes) || !after.routes.length) {
    console.error('⛔ after 快照里没有任何路由读数（结构不对或抓取全失败）—— 不进行比较');
    return 2;
  }

  const rows = compareRoutes(before, after);
  const checks = expectationChecks(after);
  const { totalDiff, versionChanged, expectationsOk } = printComparison(before, after, rows, checks);
  if (jsonTo) {
    fs.writeFileSync(jsonTo, `${JSON.stringify({
      before: beforePath,
      after: afterPath,
      totalDiff,
      versionChanged,
      expectationsOk,
      rows: rows.map(row => ({ route: row.route, missing: row.missing, differences: row.differences, noise: row.noise })),
      checks
    }, null, 2)}\n`, 'utf8');
    console.log(`（机器可读结果：${jsonTo}）`);
  }
  if (totalDiff === 0) console.log('\n✅ 0 差异（反证：同一份快照自比必然是 0 —— 见 README 的自比命令）');
  if (requireDeployed && !expectationsOk) {
    console.log('\n❌ --require-deployed：期望读数没有全部成立（若「版本信号」也是「无」，说明还没部署或 CDN 未过期）');
    return 1;
  }
  return 0;
}

main().then(code => process.exit(code)).catch(error => {
  console.error(`⛔ 比较器异常退出：${String((error && error.stack) || error)}`);
  process.exit(2);
});
