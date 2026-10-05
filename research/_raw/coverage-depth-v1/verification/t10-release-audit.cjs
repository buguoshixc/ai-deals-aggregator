#!/usr/bin/env node
/**
 * t10 · Release Evidence 独立稽核（不引用 t2/t9 的脚本）。
 *
 * 三件事：
 *   ① 结构面：每一条 releasedAt != null 的 entry 必须有非空 releaseEvidence；每条 evidence 必须有
 *      url / capturedAt / quote|reading，且 url 的域落在该 developer 的 officialDomains 里（或 provider 表登记域）
 *   ② 日期语义面：releasedAt 必须是 YYYY-MM-DD 且是**真实日历日**；新增批次（capturedAt=2026-10-05）逐条列出
 *   ③ 忠实度面（抽样 + 全量机械核对）：quote 的**特征串**必须能在 research/_raw/coverage-depth-v1/release-evidence/raw/
 *      的现场抓取页里逐字找到（全量机械核对 + 5 条人工式逐条复核：贴出命中的 raw 文件与上下文）
 *
 * 用法：node t10-release-audit.cjs <repoRoot> <outJson>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2]);
const outFile = path.resolve(process.argv[3]);
const models = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/data/models.json'), 'utf8'));
const providers = JSON.parse(fs.readFileSync(path.join(repo, 'scripts/data/providers.json'), 'utf8'));
const published = JSON.parse(fs.readFileSync(path.join(repo, 'models.json'), 'utf8'));

const entries = Object.entries(models).filter(([k]) => !k.startsWith('_'));
// 现场抓取页的**全集**：release-evidence/raw/** + gap-closure/raw-*.txt（t8 新增身份的证据页在那里）
const rawRoot = path.join(repo, 'research/_raw/coverage-depth-v1');
const rawFiles = [];
const collectRaw = dir => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectRaw(p);
    else if (/\.(html|txt)$/i.test(e.name) && /raw|gap-closure/i.test(p)) rawFiles.push(p);
  }
};
collectRaw(rawRoot);
const rawCache = new Map();
const rawText = f => {
  if (!rawCache.has(f)) rawCache.set(f, fs.readFileSync(f, 'utf8'));
  return rawCache.get(f);
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = s => {
  if (!DATE_RE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const hostOf = url => { try { return new URL(url).host; } catch { return null; } };
const domainMatches = (host, list) => Boolean(host) && list.some(d => host === d || host.endsWith(`.${d}`));
const unescapeHtml = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#x27;/g, "'");
const norm = s => unescapeHtml(String(s)).replace(/\s+/g, ' ').trim();
// 去装饰：引文里常见的 markdown 装饰 / 引用符先剥掉，再找特征串
const decorStrip = s => norm(s).replace(/[`*|]/g, '').trim();

const out = { repo, ranAt: new Date().toISOString(), totals: {}, structure: [], dateSemantics: [], sampleAudit: [], mechanical: [], problems: [] };

/* ① 结构面 */
for (const [slug, entry] of entries) {
  const rel = entry.releasedAt;
  if (rel === null || rel === undefined) continue;
  const ev = Array.isArray(entry.releaseEvidence) ? entry.releaseEvidence : [];
  const row = { slug, releasedAt: rel, evidenceCount: ev.length, issues: [] };
  if (!ev.length) row.issues.push('有 releasedAt 但没有 releaseEvidence');
  const developer = entry.developer || null;
  const provRow = providers[developer] || Object.values(providers).find(p => p && p.name === developer);
  const officialDomains = (provRow && Array.isArray(provRow.officialDomains) ? provRow.officialDomains : []);
  for (const [i, e] of ev.entries()) {
    const url = e && (e.sourceUrl || e.url);
    const host = hostOf(url);
    if (!url) row.issues.push(`evidence[${i}] 没有 sourceUrl/url`);
    else if (!domainMatches(host, officialDomains)) row.issues.push(`evidence[${i}] 域 ${host} 不在 ${developer} 的 officialDomains ${JSON.stringify(officialDomains)}`);
    if (!e || !DATE_RE.test(String(e.capturedAt || ''))) row.issues.push(`evidence[${i}] capturedAt 不是 YYYY-MM-DD`);
    const text = e && (e.quote || e.reading);
    if (!text || String(text).trim().length < 8) row.issues.push(`evidence[${i}] quote/reading 为空或过短`);
  }
  out.structure.push(row);
  if (row.issues.length) out.problems.push(`${slug}: ${row.issues.join('；')}`);
}

/* ② 日期语义面 */
for (const [slug, entry] of entries) {
  if (entry.releasedAt === null || entry.releasedAt === undefined) continue;
  const ok = DATE_RE.test(String(entry.releasedAt)) && validDate(String(entry.releasedAt));
  out.dateSemantics.push({ slug, releasedAt: entry.releasedAt, valid: ok });
  if (!ok) out.problems.push(`${slug}: releasedAt「${entry.releasedAt}」不是合法 YYYY-MM-DD`);
}

/* ③ 忠实度：机械全量 + 抽样逐条 */
const captured2026_10_05 = [];
for (const [slug, entry] of entries) {
  const ev = Array.isArray(entry.releaseEvidence) ? entry.releaseEvidence : [];
  for (const e of ev) {
    if (String(e.capturedAt) === '2026-10-05') captured2026_10_05.push({ slug, ...e });
  }
}
out.totals = {
  registryEntries: entries.length,
  withReleasedAt: out.dateSemantics.length,
  withoutReleasedAt: entries.length - out.dateSemantics.length,
  newBatchCaptured2026_10_05: captured2026_10_05.length,
  rawFilesAvailable: rawFiles.length,
  structureRows: out.structure.length
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateForms = ymd => {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const mon = MONTHS[m - 1];
  return [String(ymd), `${mon} ${d}, ${y}`, `${mon} ${d} ${y}`, `${d} ${mon} ${y}`, `${y}年${m}月${d}日`,
    `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, `${y}-${m}-${d}`, `${y}/${m}/${d}`, `${y}.${m}.${d}`];
};
const findQuoteInRaw = (quote, releasedAt) => {
  const text = decorStrip(quote);
  const words = text.split(/[^0-9A-Za-z\u4e00-\u9fa5]+/).filter(w => w.length >= 6).sort((a, b) => b.length - a.length);
  const probes = [...new Set(words.slice(0, 3))];
  const forms = dateForms(releasedAt);
  const dateInQuote = forms.some(f => String(quote).includes(f));
  if (!probes.length) return { file: null, probes, dateInQuote, dateInRaw: false };
  let best = { file: null, probes, dateInQuote, dateInRaw: false };
  for (const f of rawFiles) {
    const t = decorStrip(rawText(f));
    const hits = probes.filter(p => t.includes(p)).length;
    const dateInRaw = forms.some(x => t.includes(x));
    if (hits === probes.length && dateInRaw) return { file: f, probes, dateInQuote, dateInRaw, hits };
    if (hits === probes.length && !best.file) best = { file: f, probes, dateInQuote, dateInRaw, hits };
  }
  return best;
};
for (const ev of captured2026_10_05) {
  const quote = ev.quote || ev.reading || '';
  const hit = findQuoteInRaw(quote, models[ev.slug].releasedAt);
  out.mechanical.push({
    slug: ev.slug, url: ev.sourceUrl || ev.url, capturedAt: ev.capturedAt,
    releasedAt: models[ev.slug].releasedAt,
    quoteLen: String(quote).length,
    probes: hit.probes,
    probesAllFound: Boolean(hit.file),
    dateInQuote: hit.dateInQuote,
    dateInRaw: hit.dateInRaw,
    rawFile: hit.file
  });
}
const notFound = out.mechanical.filter(m => !m.probesAllFound);
const dateMissingInRaw = out.mechanical.filter(m => m.probesAllFound && !m.dateInRaw);
const dateMissingInQuote = out.mechanical.filter(m => !m.dateInQuote);
if (notFound.length) {
  out.problems.push(`机械忠实度：${notFound.length}/${out.mechanical.length} 条新增引文的特征词在 raw/ 现场页里找不到：${notFound.slice(0, 6).map(m => m.slug).join(', ')}`);
}
if (dateMissingInRaw.length) {
  out.problems.push(`日期-出处核对：${dateMissingInRaw.length} 条引文所在 raw 页里找不到该 releasedAt 的任一日历写法：${dateMissingInRaw.slice(0, 6).map(m => m.slug).join(', ')}`);
}
out.counts = {
  mechanical: out.mechanical.length,
  probesAllFound: out.mechanical.filter(m => m.probesAllFound).length,
  dateInRaw: out.mechanical.filter(m => m.dateInRaw).length,
  dateInQuote: out.mechanical.filter(m => m.dateInQuote).length
};

/* 抽样 5 条：贴出 raw 命中上下文（人工式复核的现场） */
const sample = out.mechanical.filter(m => m.probesAllFound && m.dateInRaw).slice(0, 5);
for (const m of sample) {
  const ev = captured2026_10_05.find(x => x.slug === m.slug);
  const probe = (m.probes || [])[0] || '';
  const t = decorStrip(rawText(m.rawFile));
  const at = probe ? t.indexOf(probe) : -1;
  out.sampleAudit.push({
    slug: m.slug, url: ev.sourceUrl || ev.url, capturedAt: ev.capturedAt,
    releasedAt: models[m.slug].releasedAt,
    quoteHead: String(ev.quote || ev.reading || '').slice(0, 120),
    rawFile: m.rawFile, probes: m.probes,
    rawContext: at >= 0 ? t.slice(Math.max(0, at - 80), at + 160) : '(未定位)'
  });
}

fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`);
console.log(`registry ${out.totals.registryEntries} 条：有日期 ${out.totals.withReleasedAt} / 无日期 ${out.totals.withoutReleasedAt}`);
console.log(`本轮新增批次（capturedAt=2026-10-05）${out.totals.newBatchCaptured2026_10_05} 条；raw 现场页 ${out.totals.rawFilesAvailable} 份`);
console.log(`机械忠实度：特征词 ${out.counts.probesAllFound}/${out.counts.mechanical} 条在同一份现场页里找齐；其中 ${out.counts.dateInRaw}/${out.counts.mechanical} 条的现场页里能找到该 releasedAt 的日历写法；引文自身含日期的 ${out.counts.dateInQuote}/${out.counts.mechanical} 条`);
console.log(`结构面：${out.structure.length} 条有日期的 entry 逐条核对（域 / capturedAt / 引文非空）`);
console.log(`抽样 ${out.sampleAudit.length} 条：`);
for (const s of out.sampleAudit) console.log(`  · ${s.slug} releasedAt=${s.releasedAt} url=${s.url} raw=${s.rawFile}\n      ${s.rawContext.slice(0, 150).replace(/\s+/g, ' ')}`);
console.log(`\n问题 ${out.problems.length} 条${out.problems.length ? '：\n  ' + out.problems.join('\n  ') : ''}`);
process.exit(out.problems.length ? 1 : 0);
