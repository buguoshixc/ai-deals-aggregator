#!/usr/bin/env node
/**
 * captain 独立核对（只读）：**新增/全部 releasedAt 的引文里到底有没有日期**。
 *
 * 为什么需要它：t10 的审计脚本只按 ISO 写法（`2026-03-18`）在页面里找日期，于是把
 * `minimax-m2.7` / `m2.7-highspeed` 判成「未能定位」（T10-F4）。但官方页用的是**中文长写**
 * （`2026 年 3 月 18 日`）。这条差别的意义很大：如果真找不到日期，那是 §49 的 provenance 缺陷；
 * 如果只是写法不同，那是**审计器太窄**。两者必须分清楚，不能含混过去。
 *
 * 判据：quote 里必须出现该日期的**任一种**写法（ISO / 中文长写 / 中文短写 yyyy年M月 /
 * 斜杠式 / 点式 / 英文月名缩写），否则点名。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/data/models.json'), 'utf8'));
const MONTH_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];
// ⚠️ 必须**恰好 12 个**：早前一版把 'sep' 与 'sept' 并列放进来，13 个元素让 9 月之后的索引全体错位
// （month 10 取到 'sept'），于是 10/11/12 月的中文短写日期被误判成「引文无日期」。'sept' 作为
// **别名**另列，不占索引位。
const MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_ABBR_ALIAS = { sep: ['sept'] };

function formsOf(iso) {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y] = [m[1]];
  const mo = String(Number(m[2]));
  const d = String(Number(m[3]));
  const moPad = m[2];
  const dPad = m[3];
  const mon = MONTH_EN[Number(moPad) - 1];
  const abbr = MONTH_ABBR[Number(moPad) - 1];
  return {
    iso: [
      `${y}-${moPad}-${dPad}`, `${y}/${moPad}/${dPad}`, `${y}.${moPad}.${dPad}`,
      // 官方页大量使用**不补零**写法（`2026-8-19` / `2026/8/5`）—— 不补这一档会误判成"引文无日期"
      `${y}-${mo}-${d}`, `${y}/${mo}/${d}`, `${y}.${mo}.${d}`
    ],
    cn: [`${y} 年 ${mo} 月 ${d} 日`, `${y}年${mo}月${d}日`, `${y} 年 ${mo} 月`, `${y}年${mo}月`],
    en: [`${mon} ${d}, ${y}`, `${abbr} ${d}, ${y}`, `${d} ${mon} ${y}`, `${d} ${abbr} ${y}`,
      ...(MONTH_ABBR_ALIAS[abbr] || []).flatMap(a => [`${a} ${d}, ${y}`, `${d} ${a} ${y}`])],
    cnPattern: new RegExp(`${y}\\s*年\\s*0?${mo}\\s*月\\s*0?${d}\\s*日`),
    cnMonthPattern: new RegExp(`${y}\\s*年\\s*0?${mo}\\s*月`)
  };
}

function hits(quote, f) {
  const q = String(quote || '');
  // **大小写不敏感**：官方页写 `Sep 1, 2026` / `September 3, 2026`，只比对小写会误判
  const ql = q.toLowerCase();
  const found = [];
  for (const s of [...f.iso, ...f.cn, ...f.en]) if (ql.includes(s.toLowerCase())) found.push(`literal:${s}`);
  if (f.cnPattern.test(q)) found.push('regex:CN-long');
  if (f.cnMonthPattern.test(q)) found.push('regex:CN-month-only');
  return found;
}

const keys = Object.keys(registry).filter(k => !k.startsWith('_'));
const rows = [];
for (const slug of keys) {
  const entry = registry[slug];
  if (!entry.releasedAt) continue;
  const f = formsOf(entry.releasedAt);
  if (!f) { rows.push({ slug, releasedAt: entry.releasedAt, ok: false, why: 'releasedAt 形态非法' }); continue; }
  const quote = (entry.releaseEvidence || []).map(e => e.quote).join('\n');
  const found = hits(quote, f);
  rows.push({
    slug,
    releasedAt: entry.releasedAt,
    ok: found.length > 0,
    matched: found,
    monthOnly: found.length === 1 && found[0] === 'regex:CN-month-only',
    quoteHead: String(quote).replace(/\s+/g, ' ').slice(0, 90),
    sourceUrl: (entry.releaseEvidence || [])[0] ? entry.releaseEvidence[0].sourceUrl : null
  });
}

const bad = rows.filter(r => !r.ok);
const monthOnly = rows.filter(r => r.monthOnly);
console.log(`有 releasedAt 的条目：${rows.length}`);
console.log(`引文含该日期的某种写法：${rows.length - bad.length}`);
console.log(`引文**没有**该日期的任何写法：${bad.length}`);
bad.forEach(r => console.log(`  ✗ ${r.slug} :: ${r.releasedAt} :: ${r.why || ''} :: quote="${r.quoteHead}"`));
if (monthOnly.length) {
  console.log(`\n⚠ 引文只到「年+月」而日期精确到日的：${monthOnly.length}`);
  monthOnly.forEach(r => console.log(`  ? ${r.slug} :: ${r.releasedAt} :: quote="${r.quoteHead}"`));
}
console.log('\n--- 按写法的分布 ---');
const dist = {};
for (const r of rows) for (const m of (r.matched || [])) {
  const kind = m.startsWith('literal:') ? 'literal' : m.replace('regex:', 'regex-');
  dist[kind] = (dist[kind] || 0) + 1;
}
console.log(JSON.stringify(dist, null, 1));
const cnForm = rows.filter(r => (r.matched || []).some(m => /CN/.test(m)));
console.log(`\n其中靠**中文长写**命中的：${cnForm.length} 条 —— ${cnForm.map(r => r.slug).slice(0, 12).join(', ')}${cnForm.length > 12 ? ' …' : ''}`);

fs.writeFileSync(path.join(__dirname, 'date-in-quote-audit.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), total: rows.length, bad: bad.length, rows }, null, 2)}\n`, 'utf8');
console.log(`\n结果：research/_raw/coverage-depth-v1/gate/date-in-quote-audit.json`);
process.exit(bad.length ? 1 : 0);
