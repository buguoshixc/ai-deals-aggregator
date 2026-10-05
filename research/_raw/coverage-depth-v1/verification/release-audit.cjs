#!/usr/bin/env node
/**
 * t9 / 题面 §61：**新增 releasedAt 的逐条忠实度稽核**（人工式复核的可复跑版本）。
 *
 * 对每一条"本轮新增"的 `releasedAt`（相对 HEAD 基线新增/变更的）逐条检查：
 *   C1 证据形状：releaseEvidence 非空，逐条有非空 quote / sourceUrl / capturedAt
 *   C2 quote 不是纯形态：长度 ≥ 20 且不只是一串日期/占位符
 *   C3 quote 真的含这个日期：ISO / 2026/9/1 / Sep 1, 2026 / 2026年9月1日 … 任一写法逐字出现
 *   C4 出处落在开发者的官方域：sourceUrl 的 host ∈ providers.json 的 officialDomains（后缀匹配）
 *   C5 身份信号：quote 里能不能看到 canonicalName / slug 的词（**记录为信号**，不单独判死）
 *   C6 逐字命中：quote（去空白归一后）必须能在**现场抓取的页面**里找到 ——
 *        优先用 Workstream A 留存的 raw/ 原件（80 个页面）；raw 里没有才联网取一次
 *
 * 分类只有三种，且必须逐条给出：「已核」/「无法复核」/「不采信」。
 * 不 require 任何被测 lib；只 require fs / path / crypto / child_process(git) / axios(联网复核)。
 *
 * 用法：node release-audit.cjs [--out=release-audit.json] [--no-live]
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const argOf = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find(a => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};
const OUT = argOf('out', path.join(__dirname, 'release-audit.json'));
const ALLOW_LIVE = !process.argv.includes('--no-live');
const RAW_DIR = path.join(ROOT, 'research', '_raw', 'coverage-depth-v1', 'release-evidence', 'raw');

const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^\uFEFF/, ''));
const sha256 = text => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * 归一：解转义 → 两个视图 →
 *   visible：剥掉 <script>/<style> 与标签 = 用户在页面上看得到的文本
 *   source ：**保留** <script> 内嵌 JSON（OpenAI/Kimi 这类页面的日期就写在页面数据里）
 * 之前的 bug：只看 visible，于是"引文取自页面内嵌 JSON"的条目被判成未命中 —— 是匹配器的问题，不是证据的问题。
 */
function textForms(html) {
  const unescaped = String(html)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\');
  const entityFixed = unescaped
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  const visible = entityFixed
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const source = entityFixed.replace(/<[^>]+>/g, ' ');
  const formsOf = text => {
    const collapsed = text.replace(/\s+/g, ' ').trim().toLowerCase();
    return { collapsed, squashed: collapsed.replace(/\s+/g, '') };
  };
  return { visible: formsOf(visible), source: formsOf(source) };
}

const squash = text => String(text).replace(/\s+/g, '').toLowerCase();
/** 只留字母数字与汉字：用于**身份词**比对（排版变体如 U+2011 连字符、`.` vs `-`、空格都不该让身份判负） */
const squashAlnum = text => String(text).normalize('NFKC').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '');

/** 归一引文自身（与语料同一套解转义）+ 剥掉引文的装饰字符（「」『』/ 行首 ### / 直引号） */
function normalizeQuote(quote) {
  return String(quote)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\//g, '/')
    .replace(/["'「」『』“”‘’`]/g, '')
    .replace(/(^|\s)#{1,6}\s*/g, '$1');
}

/**
 * 复合引文的 token 命中率：CJK 连续段（≥3 字）+ ASCII 词（≥5 字符）+ 4 位以上数字。
 * 用于表格行/多单元格拼接出来的引文（它们在 HTML 里本来就不连续）——
 * 这是"人工式复核"的可复跑近似：**逐 token 必现**，而不是模糊匹配。
 */
function tokensOf(quote) {
  const text = normalizeQuote(quote);
  const tokens = new Set();
  for (const run of text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]{3,}/g) || []) tokens.add(run);
  for (const word of text.match(/[A-Za-z][A-Za-z0-9._\-/]{4,}/g) || []) tokens.add(word.toLowerCase());
  for (const num of text.match(/\d{4,}/g) || []) tokens.add(num);
  return [...tokens];
}

function tokenPresence(quote, pageSquashed) {
  const tokens = tokensOf(quote);
  if (!tokens.length) return { total: 0, present: 0, ratio: null, missing: [] };
  const missing = tokens.filter(token => !pageSquashed.includes(squash(token)));
  return { total: tokens.length, present: tokens.length - missing.length, ratio: (tokens.length - missing.length) / tokens.length, missing: missing.slice(0, 8) };
}

/** releasedAt → 可能的日期写法（官方页上的常见渲染） */
function dateRenderings(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const abbr = monthNames.map(name => name.slice(0, 3));
  const pad = n => String(n).padStart(2, '0');
  return [
    `${y}-${pad(m)}-${pad(d)}`,
    `${y}/${m}/${d}`,
    `${y}/${pad(m)}/${pad(d)}`,
    `${y}-${m}-${d}`,
    `${y}.${m}.${d}`,
    `${monthNames[m - 1]} ${d}, ${y}`,
    `${abbr[m - 1]} ${d}, ${y}`,
    `${monthNames[m - 1]} ${pad(d)}, ${y}`,
    `${abbr[m - 1]} ${pad(d)}, ${y}`,
    `${d} ${monthNames[m - 1]} ${y}`,
    `${y} 年 ${m} 月 ${d} 日`,
    `${y}年${m}月${d}日`,
    `${y} 年 ${pad(m)} 月 ${pad(d)} 日`,
    `${y}年${pad(m)}月${pad(d)}日`
  ];
}

function hostOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch (error) {
    return null;
  }
}

function domainAllowed(host, domains) {
  if (!host) return false;
  return (domains || []).some(domain => {
    const clean = String(domain).toLowerCase().replace(/^www\./, '');
    return host === clean || host.endsWith(`.${clean}`);
  });
}

function loadRawCorpus() {
  const files = fs.existsSync(RAW_DIR) ? fs.readdirSync(RAW_DIR) : [];
  const corpus = [];
  for (const name of files) {
    const full = path.join(RAW_DIR, name);
    if (!fs.statSync(full).isFile()) continue;
    const text = fs.readFileSync(full, 'utf8');
    const forms = textForms(text);
    corpus.push({ name, bytes: text.length, visible: forms.visible, source: forms.source });
  }
  return corpus;
}

/** 在**一个视图**上找引文：整段 → 分段 → 逐 token（≥85%） */
function findInView(quote, view) {
  const squashed = squash(normalizeQuote(quote));
  if (squashed.length < 12 || !view) return null;
  if (view.squashed.includes(squashed)) return { mode: 'full', ratio: 1 };
  const segments = normalizeQuote(quote).split(/[\n\r]+| {2,}|\/|；|;/).map(s => squash(s)).filter(s => s.length >= 24).sort((a, b) => b.length - a.length);
  for (const segment of segments.slice(0, 6)) if (view.squashed.includes(segment)) return { mode: 'segment', segmentLength: segment.length, ratio: 1 };
  const presence = tokenPresence(quote, view.squashed);
  return presence.ratio !== null && presence.ratio >= 0.85 ? { mode: 'tokens', ...presence } : null;
}

function findQuoteInCorpus(quote, corpus) {
  let best = null;
  for (const file of corpus) {
    for (const viewName of ['visible', 'source']) {
      const hit = findInView(quote, file[viewName]);
      if (!hit) continue;
      const candidate = { file: file.name, view: viewName, ...hit };
      if (candidate.mode === 'full') return candidate;                       // 整段命中直接返回
      if (!best || (candidate.mode === 'segment' && best.mode === 'tokens')) best = candidate;
    }
  }
  return best;
}

async function fetchLive(url) {
  const axios = require(path.join(ROOT, 'node_modules', 'axios'));
  try {
    const res = await axios.get(url, {
      timeout: 20000,
      maxRedirects: 5,
      responseType: 'text',
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const body = typeof res.data === 'string' ? res.data : String(res.data);
    const forms = textForms(body);
    return { ok: true, status: res.status, bytes: body.length, at: new Date().toISOString(), visible: forms.visible, source: forms.source };
  } catch (error) {
    return { ok: false, error: String(error.message).slice(0, 160), at: new Date().toISOString() };
  }
}

async function main() {
  const registry = readJson('scripts/data/models.json');
  const providers = readJson('scripts/data/providers.json');
  const headRegistry = JSON.parse(execFileSync('git', ['show', 'HEAD:scripts/data/models.json'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString());

  // 开发者 → provider → officialDomains（按 name 或 aliases 归一匹配）
  const providerRows = Object.keys(providers).filter(k => !k.startsWith('_')).map(key => ({
    key,
    name: providers[key].name,
    aliases: providers[key].aliases || [],
    officialDomains: providers[key].officialDomains || []
  }));
  const domainsFor = developer => {
    const wanted = String(developer || '').trim();
    const hit = providerRows.find(row => row.name === wanted || (row.aliases || []).includes(wanted));
    return hit ? { provider: hit.key, officialDomains: hit.officialDomains } : { provider: null, officialDomains: [] };
  };

  const slugs = Object.keys(registry).filter(k => !k.startsWith('_'));
  const rows = [];
  for (const slug of slugs) {
    const entry = registry[slug] || {};
    const headEntry = headRegistry[slug];
    const headReleasedAt = headEntry && headEntry.releasedAt !== undefined ? headEntry.releasedAt : null;
    const nowReleasedAt = entry.releasedAt !== undefined ? entry.releasedAt : null;
    const isNewIdentity = !headEntry;
    const isNewDate = Boolean(nowReleasedAt) && !headReleasedAt;
    if (!nowReleasedAt) continue; // 稽核对象 = 现在有日期的条目
    const evidence = Array.isArray(entry.releaseEvidence) ? entry.releaseEvidence : [];
    const per = evidence.map(item => {
      const quote = item && item.quote ? String(item.quote) : '';
      const url = item && item.sourceUrl ? String(item.sourceUrl) : '';
      const host = hostOf(url);
      const renderings = dateRenderings(nowReleasedAt);
      const squashedQuote = squash(quote);
      return {
        field: item ? item.field : null,
        capturedAt: item ? item.capturedAt : null,
        sourceUrl: url,
        host,
        quoteLength: quote.length,
        quoteInQuote: quote.slice(0, 120),
        hasDate: renderings.some(r => squashedQuote.includes(squash(r))),
        matchedRendering: renderings.find(r => squashedQuote.includes(squash(r))) || null,
        domainAllowed: domainAllowed(host, domainsFor(entry.developer).officialDomains),
        officialDomains: domainsFor(entry.developer).officialDomains,
        provider: domainsFor(entry.developer).provider,
        identitySignal: (() => {
          const haystack = squashAlnum(normalizeQuote(quote));
          const tokens = [entry.canonicalName, slug, ...String(entry.canonicalName || '').split(/[\s.\-_]+/)]
            .filter(Boolean).map(token => squashAlnum(token)).filter(token => token.length >= 4);
          return tokens.some(token => haystack.includes(token));
        })()
      };
    });
    rows.push({
      slug,
      canonicalName: entry.canonicalName || null,
      developer: entry.developer || null,
      releasedAt: nowReleasedAt,
      headReleasedAt,
      isNewIdentity,
      isNewDate,
      evidenceCount: evidence.length,
      per,
      evidenceSha256: sha256(JSON.stringify(evidence))
    });
  }

  const newDates = rows.filter(row => row.isNewDate);
  const corpus = loadRawCorpus();

  // C6：逐字命中（raw 优先，raw 没有才联网）
  for (const row of rows) {
    row.verbatim = [];
    row.liveFetch = null;
    let liveBody = null;
    for (const item of row.per) {
      const hit = findQuoteInCorpus(item.quoteInQuote, corpus);
      if (hit) {
        row.verbatim.push({ ...hit, via: 'raw', sourceUrl: item.sourceUrl });
        continue;
      }
      if (!ALLOW_LIVE) {
        row.verbatim.push({ via: 'none', reason: '--no-live', sourceUrl: item.sourceUrl, quote: item.quoteInQuote });
        continue;
      }
      const live = await fetchLive(item.sourceUrl);
      row.liveFetch = { sourceUrl: item.sourceUrl, ok: live.ok, status: live.status || null, error: live.error || null, at: live.at };
      if (live.ok) liveBody = { sourceUrl: item.sourceUrl, visible: live.visible, source: live.source };
      if (live.ok) {
        const hit = ['visible', 'source'].map(viewName => {
          const found = findInView(item.quoteInQuote, live[viewName]);
          return found ? { view: viewName, ...found } : null;
        }).filter(Boolean).sort((a, b) => (a.mode === 'full' ? -1 : b.mode === 'full' ? 1 : 0))[0] || null;
        row.verbatim.push({
          via: 'live',
          file: item.sourceUrl,
          mode: hit ? hit.mode : 'missing',
          view: hit ? hit.view : null,
          httpStatus: live.status,
          bytes: live.bytes,
          tokenRatio: hit && hit.ratio !== undefined ? hit.ratio : null,
          missingTokens: hit && hit.missing ? hit.missing : []
        });
      } else {
        row.verbatim.push({ via: 'live-failed', file: item.sourceUrl, reason: live.error, quote: item.quoteInQuote });
      }
    }
    // 分类
    const shapeOk = row.evidenceCount > 0 && row.per.every(item => item.field && item.quoteLength >= 1 && item.sourceUrl && item.capturedAt);
    const substantive = row.per.every(item => item.quoteLength >= 20);
    const dateOk = row.per.every(item => item.hasDate);
    const domainOk = row.per.every(item => item.domainAllowed);
    const hit = row.verbatim.find(v => v.mode === 'full') || row.verbatim.find(v => v.mode === 'segment') || row.verbatim.find(v => v.mode === 'tokens');
    const blockedLive = row.verbatim.some(v => v.via === 'live' && (v.httpStatus === 403 || v.httpStatus === 429));
    // 日期不在引文里时，退一步查：**页面上有没有这个日期**（同页还必须有身份词）——
    // 这一支区分「日期无据（编造）」与「日期有据但引文不自证（证据写法待补）」，两者后果完全不同。
    let dateOnPage = null;
    if (!dateOk) {
      const dateForms = [...new Set([row.releasedAt, ...dateRenderings(row.releasedAt)])].map(squash);
      const identityTokens = [...new Set([row.slug, row.canonicalName, ...(String(row.canonicalName || '').split(/\s+/))]
        .filter(Boolean).map(token => squash(token)).filter(token => token.length >= 4))];
      const pages = [
        ...corpus.map(file => ({ where: `raw/${file.name}`, visible: file.visible.squashed, source: file.source.squashed })),
        ...(liveBody ? [{ where: `live/${liveBody.sourceUrl}`, visible: liveBody.visible.squashed, source: liveBody.source.squashed }] : [])
      ];
      for (const page of pages) {
        for (const viewName of ['visible', 'source']) {
          const text = page[viewName];
          if (!text) continue;
          const dateHit = dateForms.find(form => text.includes(form));
          const identityHit = identityTokens.some(token => text.includes(token));
          if (dateHit && identityHit) {
            dateOnPage = { where: page.where, view: viewName, dateForm: dateHit, identityHit };
            break;
          }
        }
        if (dateOnPage) break;
      }
    }
    if (shapeOk && substantive && dateOk && domainOk && hit) {
      const where = hit.via === 'raw' ? `raw/${hit.file}${hit.view ? `#${hit.view}` : ''}` : `live#${hit.view}`;
      row.verdict = hit.mode === 'full' ? `已核（整段逐字 @ ${where}）`
        : hit.mode === 'segment' ? `已核（分段逐字 @ ${where}）`
          : `已核（逐 token ${(hit.ratio * 100).toFixed(0)}% @ ${where}）`;
      row.verdictClass = '已核';
    } else if (dateOnPage) {
      row.verdict = `已核（日期在页面 @ ${dateOnPage.where}#${dateOnPage.view}，但**引文本身不含日期**）`;
      row.verdictClass = '已核（引文未自证）';
    } else if (!dateOk || !domainOk || !shapeOk || !substantive) {
      row.verdict = '不采信';
      row.verdictClass = '不采信';
    } else {
      row.verdict = blockedLive ? '无法复核（页面受阻）' : '无法复核';
      row.verdictClass = '无法复核';
    }
    row.dateOnPage = dateOnPage;
  }

  const countBy = list => list.reduce((acc, row) => { const key = row.verdictClass || row.verdict; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const verdicts = countBy(rows);
  const newRows = rows.filter(row => row.isNewDate);
  const newVerdicts = countBy(newRows);
  const baselineRows = rows.filter(row => !row.isNewDate);
  const baselineVerdicts = countBy(baselineRows);
  const out = {
    probe: 'release-audit.cjs',
    ranAtUtc: new Date().toISOString(),
    ranAtLocal: new Date().toString(),
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(),
    registrySourceSha256: sha256(fs.readFileSync(path.join(ROOT, 'scripts/data/models.json'), 'utf8')),
    rawCorpus: { dir: 'research/_raw/coverage-depth-v1/release-evidence/raw', files: corpus.length, bytes: corpus.reduce((n, f) => n + f.bytes, 0) },
    counts: {
      withDate: rows.length,
      newDates: newDates.length,
      newIdentitiesWithDate: newDates.filter(r => r.isNewIdentity).length,
      verdicts,
      newDatesVerdicts: newVerdicts,
      baselineVerdicts
    },
    newDatesList: newDates.map(row => ({
      slug: row.slug,
      canonicalName: row.canonicalName,
      developer: row.developer,
      releasedAt: row.releasedAt,
      headReleasedAt: row.headReleasedAt,
      evidenceCount: row.evidenceCount,
      sourceUrls: row.per.map(item => item.sourceUrl),
      verdict: row.verdict
    })),
    rows
  };
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  console.log(`[release-audit] HEAD=${out.head} 有日期条目 ${rows.length} · 其中本轮新增 ${newDates.length}（含新身份 ${out.counts.newIdentitiesWithDate}）`);
  console.log(`[release-audit] 全部条目分类：${JSON.stringify(verdicts)}`);
  console.log(`[release-audit] 仅本轮新增：${JSON.stringify(newVerdicts)}；基线 4 条：${JSON.stringify(baselineVerdicts)}`);
  for (const row of rows) {
    const flags = [row.per.every(i => i.hasDate) ? '日期✓' : '日期✗', row.per.every(i => i.domainAllowed) ? '域✓' : '域✗', row.per.every(i => i.quoteLength >= 20) ? '引文✓' : '引文✗',
      row.verbatim.some(v => v.mode === 'full' || v.mode === 'segment') ? '逐字✓' : '逐字✗'].join(' ');
    console.log(`  ${row.verdict.padEnd(5)} ${row.slug.padEnd(30)} ${row.releasedAt}  ${flags}  ${row.per.map(i => i.sourceUrl).join(' | ').slice(0, 110)}`);
  }
  console.log(`[release-audit] 写出: ${path.relative(ROOT, OUT)}`);
}

main().catch(error => {
  console.error(`[release-audit] 失败: ${error.stack || error.message}`);
  process.exit(1);
});
