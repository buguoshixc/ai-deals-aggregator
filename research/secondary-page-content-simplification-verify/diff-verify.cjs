#!/usr/bin/env node
'use strict';
/**
 * secondary-page-content-simplification —— **HTML 内容等价**验收（一次性装置，不进 CI）。
 *
 * ## 为什么不是「剥掉 style 后逐字节相同」
 *
 * 本轮**就是要改可见正文**（顶部说明 / 题注 / 底部说明），所以旧验收口径
 * （「HTML 去 style 后 byte identical」）在这一轮是**必然失败**的 —— 它测的是上一轮的目标。
 * 这一轮改测四件事，它们才对应本轮的红线：
 *
 *   ① **结构化数据 0 变化**：三段 JSON-LD 逐字节相同（prompt §26）；
 *   ② **数据 0 变化**：`data-item` / `data-child` 行数相同、集合相同（prompt §11）；
 *   ③ **链接 0 变化**：页面里全部 `href` 的集合相同（prompt §11）；
 *   ④ **SEO 结构 0 变化**：canonical / `<title>` / `meta description` / `robots` 相同（§25/§27）。
 *
 * 外加一条**受控的**正文等价：剥掉 **Diff Allowlist**（本轮允许变化的四个区域）之后，
 * HTML 必须逐字节相同。这条守的是「改动没有溢出到 allowlist 之外」——
 * 它比「什么都不许变」弱，但比「只看几个数字」强得多：任何一处意外的标记改动都会露出来。
 *
 * ## Diff Allowlist（prompt §29）
 *
 *   1. intro 说明：首个数据区**之前**的 `<p class="snote">…</p>`
 *   2. 底部说明：`<p class="snote" style="margin-top: var(--s3)">…</p>`
 *   3. 折叠说明：`<details class="page-notes">…</details>`
 *   4. 题注与摘要的小字：`<caption>…</caption>`、`.lsum` 项上的 `title` 与 `<small>`
 *   5. **Markdown 强调 → `<b>`**（两侧同等归一）：本轮顺带修掉了厂商页 `.vsnote` 里
 *      字面 `**套餐变化日志**` 的缺陷（25 页读者原先看到的是星号）。这条改写是
 *      `rich()` 的语义等价（`**x**` ⇄ `<b>x</b>`），**两侧都归一**，所以它只能掩盖
 *      「星号与 `<b>` 的写法差异」这一件事 —— 掩盖不了别的改动。
 *
 * ## 用法
 *
 *   node research/_raw/secondary-page-content-simplification/diff-verify.cjs \
 *     --base=dist.baseline --dir=dist --out=research/_raw/.../diff-verify.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const arg = name => (process.argv.find(a => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const BASE = path.resolve(ROOT, arg('base') || 'dist.baseline');
const DIR = path.resolve(ROOT, arg('dir') || 'dist');
const OUT = arg('out') ? path.resolve(ROOT, arg('out')) : null;

const sha = text => crypto.createHash('sha256').update(text).digest('hex');

function walk(dir, rel = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const child = `${rel}${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(dir, `${child}/`));
    else out.push(child);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Diff Allowlist 归一                                                  */
/* ------------------------------------------------------------------ */

/**
 * 把本轮**允许变化**的四个区域替换成占位符。
 *
 * 顺序有讲究：先摘 `<style>`（每页约 39 KB，且本轮新增了 `.page-notes` 规则），
 * 再按区域替换，最后才比。占位符用不可能出现在产物里的形态（`\u0000NAME\u0000`），
 * 避免「占位符恰好等于某段真实标记」这种假等价。
 *
 * ## 为什么还要做行级归一
 *
 * 删掉一整块标记会连带删掉它占的那几行，于是**只剩缩进与空行的差别**。
 * 第一次跑这份工具时，45 个页面就是这样报出来的 —— 差异全是
 * 「基线多一行空行 + 一个占位符」。那不是改动，是**量具的噪声**：
 * 一份把「缩进变了」报成「内容变了」的工具，会让人开始忽略它的输出。
 *
 * 归一的范围**明确限定为**：丢掉只含空白的行 + 去掉每行首尾空白。
 * 行内任何字符的变化（文字、标签、属性、相邻标签之间的空格）都会照旧露出来。
 *
 * ⚠️ 占位符最后**整块删掉**（不是留着比）。因为本轮有页面把说明**删干净**了 ——
 * 基线那一侧留下一个占位符、改动那一侧什么都没有，两边就不相等了。
 * 实测第一次跑时这正是 43 个页面报出来的原因（量具的问题，不是产物的问题）。
 * 「允许变化」的语义就是：这个区域里**有没有、写什么**都不参与比对。
 */
function normalize(html) {
  const drop = () => '';
  const substituted = html
    .replace(/<style>[\s\S]*?<\/style>/gi, drop())
    // ① intro：`<main>` 内、首个数据区之前的 `.snote`（含别名页的 aliasNote）
    .replace(/(<main\b[^>]*>)([\s\S]*?)(<ul class="lsum"|<div class="ctable-wrap"|<table)/,
      (m, open, middle, anchor) => `${open}${middle.replace(/<p class="snote"[^>]*>[\s\S]*?<\/p>/g, drop())}${anchor}`)
    // ② 底部说明（旧形态）与 ③ 折叠说明（新形态）：两者互为替代，都整块删掉
    .replace(/<p class="snote" style="margin-top: var\(--s3\)">[\s\S]*?<\/p>/g, drop())
    .replace(/<details class="page-notes">[\s\S]*?<\/details>/g, drop())
    // ④ 题注 + 摘要小字（`.lsum` 项上的 title 与 <small>）
    .replace(/<caption>[\s\S]*?<\/caption>/g, drop())
    .replace(/(<li data-summary-label="[^"]*" data-summary-value="[^"]*")[^>]*(>)/g, '$1$2')
    // 摘要小字：基线是 `<small title="…">判据：…</small>`（**有正文**），改动后整块没了 ——
    // 所以这里必须匹配「有内容的小字」，只匹配空标签会漏掉全部 43 页（实测踩过）。
    .replace(/<small title="[^"]*">[\s\S]*?<\/small>/g, drop())
    // ⑤ Markdown 强调 ⇄ <b>（两侧同等归一，见文件头的 allowlist #5）
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  return substituted.split('\n').map(line => line.trim()).filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ */
/* 逐页读数                                                             */
/* ------------------------------------------------------------------ */

const stripScript = html => html.replace(/<script[\s\S]*?<\/script>/gi, '');
const rowsOf = html => {
  const body = stripScript(html);
  return (body.match(/data-item="([^"]*)"/g) || []).map(s => s.slice(11, -1))
    .concat((body.match(/data-child="([^"]*)"/g) || []).map(s => s.slice(12, -1)));
};
const hrefsOf = html => [...new Set([...stripScript(html).matchAll(/href="([^"]*)"/g)].map(m => m[1]))].sort();
const jsonLdOf = html => [...stripScript(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
const metaOf = html => ({
  title: (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1],
  description: (html.match(/<meta name="description" content="([^"]*)"/) || [, ''])[1],
  canonical: (html.match(/<link rel="canonical" href="([^"]*)"/) || [, ''])[1],
  robots: (html.match(/<meta name="robots" content="([^"]*)"/) || [, ''])[1]
});

/* ------------------------------------------------------------------ */

const baseFiles = walk(BASE).sort();
const dirFiles = walk(DIR).sort();
const problems = [];
const notes = [];

const baseSet = new Set(baseFiles);
const dirSet = new Set(dirFiles);
for (const file of baseFiles) if (!dirSet.has(file)) problems.push(`产物缺失：${file}`);
for (const file of dirFiles) if (!baseSet.has(file)) problems.push(`新增产物：${file}`);

const htmlFiles = dirFiles.filter(f => f.endsWith('.html') && baseSet.has(f));
const otherFiles = dirFiles.filter(f => !f.endsWith('.html') && baseSet.has(f));

// ① 非 HTML 产物**逐字节相同**（Feed / sitemap / JSON / logo 资产 / 图片）
let otherDiff = 0;
for (const file of otherFiles) {
  const a = fs.readFileSync(path.join(BASE, file));
  const b = fs.readFileSync(path.join(DIR, file));
  if (!a.equals(b)) { otherDiff += 1; problems.push(`非 HTML 产物变了：${file}`); }
}
notes.push(`非 HTML 产物 ${otherFiles.length} 个逐字节相同的 ${otherFiles.length - otherDiff} 个`);

// ②–④ 逐页结构等价
const perPage = [];
let htmlIdenticalRaw = 0;
let htmlIdenticalNormalized = 0;
for (const file of htmlFiles) {
  const a = fs.readFileSync(path.join(BASE, file), 'utf8');
  const b = fs.readFileSync(path.join(DIR, file), 'utf8');
  const na = normalize(a);
  const nb = normalize(b);
  const row = { file };

  if (a === b) htmlIdenticalRaw += 1;
  if (na === nb) htmlIdenticalNormalized += 1;
  else {
    row.normalizedDiff = true;
    // 找出第一处差异，便于定位「allowlist 之外」的改动
    let i = 0;
    while (i < Math.min(na.length, nb.length) && na[i] === nb[i]) i += 1;
    row.firstDiff = { base: na.slice(Math.max(0, i - 60), i + 90), after: nb.slice(Math.max(0, i - 60), i + 90) };
    problems.push(`归一后仍有差异（改动溢出 Diff Allowlist）：${file}`);
  }

  const [rowsA, rowsB] = [rowsOf(a), rowsOf(b)];
  if (JSON.stringify(rowsA) !== JSON.stringify(rowsB)) {
    row.rowsChanged = true;
    problems.push(`数据行变化：${file}（${rowsA.length} → ${rowsB.length}）`);
  }
  const [hrefA, hrefB] = [hrefsOf(a), hrefsOf(b)];
  if (JSON.stringify(hrefA) !== JSON.stringify(hrefB)) {
    row.hrefsChanged = true;
    const added = hrefB.filter(h => !hrefA.includes(h));
    const removed = hrefA.filter(h => !hrefB.includes(h));
    problems.push(`链接集合变化：${file}（+${added.length} / -${removed.length}`
      + `${added.length ? ` 新增 ${added.slice(0, 3).join(' ')}` : ''}`
      + `${removed.length ? ` 移除 ${removed.slice(0, 3).join(' ')}` : ''}）`);
  }
  const [ldA, ldB] = [jsonLdOf(a), jsonLdOf(b)];
  if (JSON.stringify(ldA) !== JSON.stringify(ldB)) {
    row.jsonLdChanged = true;
    problems.push(`JSON-LD 变化：${file}（${ldA.length} 段 → ${ldB.length} 段）`);
  }
  const [mA, mB] = [metaOf(a), metaOf(b)];
  if (JSON.stringify(mA) !== JSON.stringify(mB)) {
    row.metaChanged = true;
    for (const key of Object.keys(mA)) {
      if (mA[key] !== mB[key]) problems.push(`${key} 变化：${file}（${mA[key].slice(0, 40)} → ${mB[key].slice(0, 40)}）`);
    }
  }
  row.rows = rowsA.length;
  row.jsonLdSha = ldA.map(sha);
  perPage.push(row);
}

const payload = {
  generatedAt: new Date().toISOString(),
  base: path.relative(ROOT, BASE),
  dir: path.relative(ROOT, DIR),
  totals: {
    files: dirFiles.length,
    html: htmlFiles.length,
    nonHtml: otherFiles.length,
    htmlIdenticalRaw,
    htmlIdenticalNormalized,
    problems: problems.length
  },
  problems,
  notes,
  perPage
};

if (OUT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
}

console.log(`基线 ${payload.base} → ${payload.dir}`);
console.log(`  文件 ${dirFiles.length}（HTML ${htmlFiles.length} · 其它 ${otherFiles.length}）`);
console.log(`  非 HTML 逐字节相同：${otherFiles.length - otherDiff}/${otherFiles.length}`);
console.log(`  HTML 逐字节相同（原样）：${htmlIdenticalRaw}/${htmlFiles.length}`);
console.log(`  HTML 逐字节相同（剥掉 Diff Allowlist 后）：${htmlIdenticalNormalized}/${htmlFiles.length}`);
console.log(`  JSON-LD 段数/内容逐字节相同：${perPage.filter(p => !p.jsonLdChanged).length}/${htmlFiles.length}`);
console.log(`  数据行集合相同：${perPage.filter(p => !p.rowsChanged).length}/${htmlFiles.length}`);
console.log(`  链接集合相同：${perPage.filter(p => !p.hrefsChanged).length}/${htmlFiles.length}`);
console.log(`  canonical/title/description/robots 相同：${perPage.filter(p => !p.metaChanged).length}/${htmlFiles.length}`);
if (OUT) console.log(`→ ${path.relative(ROOT, OUT)}`);
if (problems.length) {
  console.log(`\n❌ ${problems.length} 处问题：`);
  for (const problem of problems.slice(0, 12)) console.log(`   · ${problem}`);
  const first = perPage.find(p => p.normalizedDiff);
  if (first) {
    console.log(`\n第一处归一后差异（${first.file}）：`);
    console.log(`  基线：…${first.firstDiff.base}…`);
    console.log(`  改动：…${first.firstDiff.after}…`);
  }
  process.exit(1);
}
console.log('\n✅ Diff Allowlist 之外 0 变化（结构化数据 / 数据行 / 链接 / SEO 结构 / 全文归一）');
