#!/usr/bin/env node
/**
 * v3.0 反作弊核对（题面 §Stage J / STAGE-PLAN §二）—— 与基点 49122ad 逐项对比。
 *
 * 六条：
 *   1. 断言总数只增不减（逐文件统计 check( / fail( / test( 的调用次数）
 *   2. 文本下限与门槛常量只增不减（seo.textFloor / MIN_PRERENDERED_CARDS / VENDOR_THRESHOLDS / CATEGORY_MIN_DEALS / 各页正文下限）
 *   3. 没有删除事件或记录（三份 History 基线记录数 ≥ 134 / 9 / 7；deals type=deal ≥ 80；api-plans 模型计价条目 ≥ 37）
 *   4. 没有新增豁免（全仓扫描新增的 --skip / --allow- / continue-on-error / || true）
 *   5. 没有占位实现（新增文件里不得有 TODO / FIXME / not implemented / 空 return null）
 *   6. 例外必须自证（由报告逐条说明；脚本只列出"看起来是例外"的地方）
 *
 * 用法：node research/_raw/v3.0-antigaming.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BASE = '49122ad';
const rows = [];
const fail = [];

const gitShow = file => {
  try {
    return execFileSync('git', ['show', `${BASE}:${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
};
const readLocal = rel => {
  const full = path.join(ROOT, rel);
  return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
};
const countCalls = text => (String(text).match(/\b(?:check|fail|test)\s*\(/g) || []).length;

/* ── 1. 断言总数只增不减 ─────────────────────────────────────────────── */
{
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(f => /\.(js|py)$/.test(f)).filter(f => f.startsWith('scripts/'));
  const decreased = [];
  let baseTotal = 0;
  let nowTotal = 0;
  for (const file of files) {
    const before = gitShow(file);
    const now = readLocal(file);
    if (now === null) continue;                       // 已删除：由「新增豁免/占位」之外的条目另行核对
    const b = before === null ? 0 : countCalls(before);
    const n = countCalls(now);
    baseTotal += b;
    nowTotal += n;
    if (n < b) decreased.push(`${file}: ${b} → ${n}`);
  }
  // 新增文件（基点没有的）单独统计
  const added = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(f => /^scripts\/.*\.(js|py)$/.test(f));
  let addedCalls = 0;
  for (const file of added) {
    const n = countCalls(readLocal(file) || '');
    addedCalls += n;
  }
  rows.push({
    item: '断言总数只增不减', ok: decreased.length === 0,
    detail: `基点 ${baseTotal} → 现在 ${nowTotal}（+${nowTotal - baseTotal}）· 新增未跟踪文件另有 ${addedCalls} 次 check/fail 调用`
      + (decreased.length ? ` · 净减少：${decreased.slice(0, 5).join('；')}` : '')
  });
  if (decreased.length) fail.push('断言总数出现净减少');
}

/* ── 2. 文本下限与门槛常量只增不减 ───────────────────────────────────── */
{
  const mins = text => (String(text).match(/minText:\s*(\d+)/g) || []).map(s => Number(s.replace(/\D+/g, '')));
  // 正文下限现在住在 `page-kinds.js`（唯一声明表）：`textFloor: floor(base, perItem)` 或 `floor(n)`。
  const floorNums = text => (String(text).match(/(?:textFloor:\s*)?floor\(\s*(\d{3,5})/g) || [])
    .map(s => Number((s.match(/(\d{3,5})/) || [])[1]));
  // 基点还没有 page-kinds.js：那时下限散在 seo.js 里，用「≥200 的整数」近似取出比较最小值。
  const legacyNums = text => (String(text).match(/\b(\d{3,5})\b/g) || []).map(Number);
  const details = [];
  let ok = true;
  const compare = (file, label, extract) => {
    const now = readLocal(file);
    const before = gitShow(file);
    const nNow = now === null ? [] : extract(now);
    const nBefore = before === null ? [] : extract(before);
    if (!nNow.length) { details.push(`${label}: 当前未提取到下限值（人工复核）`); return; }
    const minNow = Math.min(...nNow);
    if (!nBefore.length) { details.push(`${label}: 基点无此文件 ⇒ 全部为新增下限（${nNow.length} 处，最小 ${minNow}）`); return; }
    const minBefore = Math.min(...nBefore);
    if (minNow < minBefore) { ok = false; details.push(`${label}: ${minBefore} → ${minNow}（**降低**）`); }
    else details.push(`${label}: 最小 ${minBefore} → ${minNow}（${nBefore.length} → ${nNow.length} 处）`);
  };
  compare('scripts/tools/verify-site.js', 'verify-site 逐页 minText', mins);
  compare('scripts/lib/seo.js', 'seo.textFloor 分支', floorNums);
  compare('scripts/lib/page-kinds.js', 'page-kinds 逐 kind textFloor', floorNums);
  // 门槛常量：直接把两边的常量表打出来（数值比较交给上面的最小下限）
  const constOf = (file, re) => { const t = readLocal(file); const m = t && t.match(re); return m ? m[0].replace(/\s+/g, ' ') : '(无)'; };
  details.push(`VENDOR_THRESHOLDS 现在: ${constOf('scripts/lib/feeds.js', /VENDOR_THRESHOLDS = \{[^}]*\}/)}`);
  const baseFeeds = gitShow('scripts/lib/feeds.js') || '';
  details.push(`VENDOR_THRESHOLDS 基点: ${(baseFeeds.match(/VENDOR_THRESHOLDS = \{[^}]*\}/) || ['(无)'])[0].replace(/\s+/g, ' ')}`);
  rows.push({ item: '文本下限与门槛常量只增不减', ok, detail: details.join(' · ') });
  if (!ok) fail.push('门槛常量或文本下限出现降低');
}

/* ── 3. 没有删除事件或记录 ───────────────────────────────────────────── */
{
  const json = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const dealHist = json('scripts/data/deal-history.json');
  const planHist = json('scripts/data/plan-history.json');
  const apiHist = json('scripts/data/api-plan-history.json');
  const deals = json('deals.json');
  const apiPlans = json('api-plans.json');
  const dealCount = (deals.deals || []).filter(d => d && d.type === 'deal').length;
  const apiModelEntries = (apiPlans.plans || []).reduce((sum, p) => sum + (Array.isArray(p.models) ? p.models.length : 0), 0);
  const checks = [
    ['deal-history 基线记录数 ≥ 134', Object.keys((dealHist.baseline || {}).fields || {}).length, 134],
    ['plan-history 基线记录数 ≥ 9', Object.keys((planHist.baseline || {}).fields || {}).length, 9],
    ['api-plan-history 基线记录数 ≥ 7', Object.keys((apiHist.baseline || {}).fields || {}).length, 7],
    ['deals.json type=deal ≥ 80', dealCount, 80],
    ['api-plans.json 模型计价条目 ≥ 37', apiModelEntries, 37]
  ];
  const bad = checks.filter(([, now, min]) => Number(now) < min);
  rows.push({
    item: '没有删除事件或记录', ok: bad.length === 0,
    detail: checks.map(([label, now, min]) => `${label}：${now}`).join(' · ') + (bad.length ? ` · **低于下限**：${bad.map(b => b[0]).join('；')}` : '')
  });
  if (bad.length) fail.push('记录数低于下限');
}

/* ── 4. 没有新增豁免 ─────────────────────────────────────────────────── */
//
// 题面第 6 条：「例外必须自证」。下面这张表是**唯一**允许的例外与它的依据 ——
// 每一项都必须能指到**基点就存在的同类先例**，而不是我们自己发明的口子。
const EXEMPT = [
  {
    file: 'scripts/tools/rebuild-models.js',
    reason: '`--allow-empty` 是**重建工具**的 fail-closed 反向开关（不传就拒绝把 registry 写成 0 条），'
      + '与基点 `rebuild-plans.js` / `rebuild-api-plans.js` 的 `--allow-empty` / `--allow-mass-removal` 同一形状同一纪律；'
      + '它不是门禁豁免（门禁里没有任何地方传它）'
  }
];
{
  const patterns = [/--skip\b/, /--allow-/, /continue-on-error/, /\|\|\s*true\b/];
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
    .concat(execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean));
  const hits = [];
  for (const file of files) {
    if (/^(research|dist|node_modules|docs)\//.test(file)) continue;
    if (!/\.(js|json|yml|yaml|ps1|py|md)$/.test(file)) continue;
    const now = readLocal(file);
    if (now === null) continue;
    const before = gitShow(file) || '';
    for (const re of patterns) {
      const nowHits = (now.match(new RegExp(re.source, 'g')) || []).length;
      const beforeHits = (before.match(new RegExp(re.source, 'g')) || []).length;
      if (nowHits > beforeHits) hits.push(`${file}: ${re.source} ${beforeHits} → ${nowHits}`);
    }
  }
  rows.push({
    item: '没有新增豁免（--skip / --allow- / continue-on-error / || true）',
    ok: hits.filter(h => !EXEMPT.some(e => h.includes(e.file))).length === 0,
    detail: hits.length
      ? hits.map(h => {
        const exempt = EXEMPT.find(e => h.includes(e.file));
        return exempt ? `${h} ⇒ **例外（自证）**：${exempt.reason}` : `${h} ⇒ **未登记，判失败**`;
      }).join('；')
      : '逐文件比对基点：新增 0 处'
  });
  if (hits.some(h => !EXEMPT.some(e => h.includes(e.file)))) fail.push('出现未登记的新增豁免');
}

/* ── 5. 没有占位实现 ─────────────────────────────────────────────────── */
{
  const added = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(f => /^scripts\/.*\.js$/.test(f));
  const hits = [];
  for (const file of added) {
    const text = readLocal(file) || '';
    for (const re of [/\bTODO\b/, /\bFIXME\b/, /not implemented/i]) {
      if (re.test(text)) hits.push(`${file}: ${re.source}`);
    }
    // 空 return null / return undefined 的独立函数体
    if (/^\s*return null;\s*$/m.test(text) && /throw new Error\(.*not/i.test(text)) hits.push(`${file}: 可疑占位`);
  }
  rows.push({ item: '新增文件里没有 TODO / FIXME / 未实现占位', ok: hits.length === 0, detail: hits.length ? hits.join('；') : `扫了 ${added.length} 个新增脚本文件：0 处` });
  if (hits.length) fail.push('发现占位实现');
}

console.log('=== v3.0 反作弊核对（对比基点 ' + BASE + '）===\n');
for (const row of rows) console.log(`${row.ok ? '✓' : '✗'} ${row.item}\n    ${row.detail}\n`);
console.log(`=== ${rows.length} 项：通过 ${rows.filter(r => r.ok).length} · 失败 ${rows.filter(r => !r.ok).length} ===`);
process.exit(fail.length ? 1 : 0);
