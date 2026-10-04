#!/usr/bin/env node
/**
 * t40 自测夹具生成器：把 `live-baseline.json` 改造成两份**假的 after 快照**，
 * 用来证明 `compare-live.cjs` 不是恒绿（acceptance ④ 的加强版：自比 0 差异只是"不误报"，
 * 还要证明"该报的差异报得出来"）。
 *
 *   · selftest/after-deployed.json     —— 模拟"部署已生效"：ETag/Last-Modified 全变、
 *                                         data-model=44、models-show-legacy=1、详情页 data-release-date=1
 *   · selftest/after-version-only.json —— 模拟"换了版本但内容不对"：只有 ETag 变，三件事实仍为 0
 *
 * 只写 research/_raw/t40/selftest/；只读 when 之不为写。
 * 用法：node research/_raw/t40/make-selftest-after.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const OUT = path.join(DIR, 'selftest');
const baseline = JSON.parse(fs.readFileSync(path.join(DIR, 'live-baseline.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

const clone = () => JSON.parse(JSON.stringify(baseline));

/** 模拟部署：所有路由的 Last-Modified/ETag 换成新值（内容哈希按路由名伪造成唯一值） */
function markDeployed(snapshot, stamp) {
  for (const route of snapshot.routes) {
    route.headers['last-modified'] = 'Sun, 04 Oct 2026 14:00:00 GMT';
    route.headers.etag = `W/"${stamp}-${Buffer.from(route.route || 'root').toString('hex').slice(0, 8)}"`;
    route.headers.age = '0';
  }
  snapshot.capturedAt = '2026-10-04T14:00:05.000Z';
  return snapshot;
}

const deployed = markDeployed(clone(), 'deadbeef');
const models = deployed.routes.find(item => item.route === 'models/');
models.facts.dataModelCount = 44;
models.facts.modelsShowLegacyCount = 1;
deployed.routes.find(item => item.route === 'models/deepseek-v3.2/').facts.releaseDateMarkerCount = 1;
fs.writeFileSync(path.join(OUT, 'after-deployed.json'), `${JSON.stringify(deployed, null, 2)}\n`, 'utf8');

const versionOnly = markDeployed(clone(), 'feedface');
fs.writeFileSync(path.join(OUT, 'after-version-only.json'), `${JSON.stringify(versionOnly, null, 2)}\n`, 'utf8');

console.log('✅ 夹具已写出：');
console.log(`   ${path.relative(process.cwd(), path.join(OUT, 'after-deployed.json'))}（应判「本版已生效」）`);
console.log(`   ${path.relative(process.cwd(), path.join(OUT, 'after-version-only.json'))}（版本变了但三件事实仍为 0 ⇒ --require-deployed 应判红 exit 1）`);
