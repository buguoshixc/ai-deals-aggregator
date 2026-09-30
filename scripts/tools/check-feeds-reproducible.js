#!/usr/bin/env node
/**
 * v1.6 订阅产物的**可复现**门禁：连续构建 N 次，逐字节比对全部 Feed 文件。
 *
 * 它回答的问题只有一个，而且是订阅层最要命的那一个：
 *
 *   > 同一个事件，构建 10 次之后还是同一个 guid 吗？
 *
 * `feeds-selftest` 已经在**纯函数**层面证明过「同输入必同输出」，但那证明不了
 * 「构建脚本没有把时钟、路径、运行次数之类的东西写进产物」。这一支用**真实构建**
 * 来证：每次跑一个完整的 `build-local.js`（与发布链同一条路径），把所有 Feed 文件的
 * SHA-256 记下来，第 2..N 次必须与第 1 次**逐字节相同**。
 *
 * 另外两条与构建时刻有关的独立检查（都在真实产物上做，不看内存对象）：
 *   · 每个 `date_published` / `date_modified` 都必须是「北京时间零点」这个形态 ——
 *     出现别的时分秒就说明某个环节把「现在几点」写进了产物；
 *   · RSS 的 `lastBuildDate` 必须是数据日期的 UTC 表示（同样是零点）。
 *
 * 用法：
 *   node scripts/tools/check-feeds-reproducible.js            # 与已构建的 dist/ 比，再自跑一次
 *   node scripts/tools/check-feeds-reproducible.js --runs=10   # 交付报告用的 10 次
 *   node scripts/tools/check-feeds-reproducible.js --out=dist.feeds-repro
 *
 * 临时输出目录用完即删（`finally` 里），不进仓库。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const runArg = process.argv.find(arg => arg.startsWith('--runs='));
const RUNS = Math.max(2, Number((runArg || '--runs=2').slice(7)) || 2);
const outArg = process.argv.find(arg => arg.startsWith('--out='));
const TMP = path.join(ROOT, outArg ? outArg.slice(6) : 'dist.feeds-repro');
const BUILT = path.join(ROOT, 'dist');

let failed = 0;
function fail(message) { console.log(`  ✗ ${message}`); failed++; }
function ok(message) { console.log(`  ✓ ${message}`); }

/** 收集产物里的全部 Feed 文件（相对路径 → sha256 + 字节数） */
function feedFiles(dir) {
  const list = [];
  const push = rel => {
    const file = path.join(dir, rel);
    if (!fs.existsSync(file)) return;
    const buf = fs.readFileSync(file);
    list.push({ rel, hash: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length });
  };
  for (const name of ['feed.xml', 'feed.json']) push(name);
  const feedDir = path.join(dir, 'feed');
  if (fs.existsSync(feedDir)) {
    const walk = (abs, rel) => {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        const nextAbs = path.join(abs, entry.name);
        const nextRel = `${rel}/${entry.name}`;
        if (entry.isDirectory()) walk(nextAbs, nextRel);
        else list.push({
          rel: nextRel,
          hash: crypto.createHash('sha256').update(fs.readFileSync(nextAbs)).digest('hex'),
          bytes: fs.statSync(nextAbs).size
        });
      }
    };
    walk(feedDir, 'feed');
  }
  return list.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

function fingerprint(list) {
  return crypto.createHash('sha256')
    .update(list.map(item => `${item.rel}\u0000${item.hash}`).join('\u0001'))
    .digest('hex');
}

/** 「构建时刻泄进产物」的独立探针：所有时间字段都必须是北京时间零点 */
function checkNoWallClock(dir) {
  const problems = [];
  const feedDir = path.join(dir, 'feed');
  const files = [path.join(dir, 'feed.json')];
  if (fs.existsSync(feedDir)) {
    const walk = abs => {
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        const next = path.join(abs, entry.name);
        if (entry.isDirectory()) walk(next);
        else if (entry.name.endsWith('.json')) files.push(next);
      }
    };
    walk(feedDir);
  }
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(dir, file).replace(/\\/g, '/');
    const box = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const item of box.items || []) {
      for (const key of ['date_published', 'date_modified']) {
        if (!item[key]) continue;
        if (!/T00:00:00\+08:00$/.test(item[key])) {
          problems.push(`${rel} 的 ${item.id} 在 ${key} 上带着非零点的时刻：${item[key]}`);
        }
      }
    }
  }
  // RSS 的 lastBuildDate 必须是**数据日期**（deals.json 的 updatedAt）的 UTC 表示，
  // 而不是运行时的「现在」。期望值从同一份产物里的 deals.json 现算 —— 这样探针
  // 不依赖任何硬编码日期，也不与生成侧共用实现。
  const payloadFile = path.join(dir, 'deals.json');
  const dataDate = fs.existsSync(payloadFile)
    ? String(JSON.parse(fs.readFileSync(payloadFile, 'utf8')).updatedAt || '').slice(0, 10)
    : null;
  if (!dataDate) problems.push('产物里没有 deals.json，无法核对 lastBuildDate');
  const expected = dataDate ? new Date(`${dataDate}T00:00:00+08:00`).toUTCString() : null;
  const xmlFiles = [path.join(dir, 'feed.xml')];
  if (fs.existsSync(feedDir)) xmlFiles.push(...collectXml(feedDir));
  for (const file of xmlFiles) {
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(dir, file).replace(/\\/g, '/');
    const m = /<lastBuildDate>([^<]+)<\/lastBuildDate>/.exec(fs.readFileSync(file, 'utf8'));
    if (!m) { problems.push(`${rel} 缺少 lastBuildDate`); continue; }
    if (expected && m[1] !== expected) {
      problems.push(`${rel} 的 lastBuildDate 不是数据日期（期望 ${expected}，实得 ${m[1]}）`);
    }
  }
  return problems;
}
function collectXml(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const next = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectXml(next));
    else if (entry.name.endsWith('.xml') && entry.name !== 'feed.xml') out.push(next);
  }
  return out;
}

console.log(`\n=== 订阅可复现门禁：连续构建 ${RUNS} 次，逐字节比对 ===`);
console.log(`  临时输出目录：${path.relative(ROOT, TMP)}（用完即删）`);

const reference = (() => {
  const built = feedFiles(BUILT);
  return built.length ? { label: 'dist/（上一次构建的产物）', files: built, hash: fingerprint(built) } : null;
})();
if (reference) {
  console.log(`  基线：${reference.label} —— ${reference.files.length} 个 Feed 文件`);
} else {
  console.log('  基线：dist/ 里没有 Feed 文件（先跑一次 npm run build）——本轮只做自比对');
}

let first = null;
try {
  for (let i = 1; i <= RUNS; i++) {
    fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'tools', 'build-local.js'), `--out=${path.relative(ROOT, TMP)}`], {
      cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
    });
    const files = feedFiles(TMP);
    if (!files.length) { fail(`第 ${i} 次构建没有产出任何 Feed 文件`); break; }
    const hash = fingerprint(files);
    if (i === 1) {
      first = { files, hash };
      ok(`第 1 次构建：${files.length} 个 Feed 文件（指纹 ${hash.slice(0, 12)}）`);
      const wall = checkNoWallClock(TMP);
      if (wall.length) fail(`构建时刻泄进产物：${wall.slice(0, 3).join('；')}`);
      else ok('时间字段全部是「数据日期的北京时间零点」（没有把「现在几点」写进产物）');
      if (reference && reference.hash !== hash) {
        const diff = reference.files.filter((item, index) => !first.files[index] || first.files[index].hash !== item.hash)
          .map(item => item.rel);
        fail(`dist/ 与本次构建不一致（${diff.slice(0, 3).join('、')}${diff.length > 3 ? ` 等 ${diff.length} 个` : ''}）`);
      } else if (reference) {
        ok('dist/ 与第 1 次构建逐字节一致');
      }
      continue;
    }
    if (hash !== first.hash) {
      const changed = files.filter((item, index) => !first.files[index] || first.files[index].hash !== item.hash)
        .map(item => `${item.rel}${jsonDiff(first, files, item.rel)}`);
      fail(`第 ${i} 次构建与第 1 次不一致：${changed.slice(0, 3).join('、')}`);
    } else {
      ok(`第 ${i} 次构建与第 1 次逐字节一致`);
    }
  }
} finally {
  fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

/** 为不一致的文件补一句「差在第几行」，让日志直接指向问题 */
function jsonDiff(a, b, rel) {
  const left = (a.files.find(item => item.rel === rel) || {}).bytes;
  const right = (b.files.find(item => item.rel === rel) || {}).bytes;
  return `（${left} → ${right} 字节）`;
}

console.log(`\n${failed ? '❌' : '✅'} 订阅可复现门禁：${RUNS} 次构建${failed ? `，${failed} 项失败` : '，全部逐字节一致'}`);
if (failed) process.exit(1);
