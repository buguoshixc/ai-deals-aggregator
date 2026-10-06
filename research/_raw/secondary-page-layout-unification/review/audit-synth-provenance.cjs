/**
 * T6 复审 · 只读核查 dist.synth-fixed 的**出身**（严格版）：
 *
 *   ① 非样式部分（正文 / 脚本 / 注释）必须与 dist.baseline **逐字节相同**；
 *   ② 样式部分在「剥掉 .snote 规则（.snote.chgwarn 除外）」之后必须与 dist.baseline 逐字节相同；
 *   ③ synth 里除冻结串之外的 .snote 规则数必须是 0。
 *
 * 三条同时成立 ⇒ 该产物相对基线的唯一改动就是 .snote 的宽度声明，
 * 它变绿就只能归因于「缺陷被修掉」。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const A = path.join(ROOT, 'dist.baseline');
const B = path.join(ROOT, 'dist.synth-fixed');
const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';

function walk(dir, base, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

const ruleRe = /([^{}]*\.snote[^{}]*)\{[^{}]*\}/g;
const stripSnote = css => css.replace(ruleRe, (m, sel) => (/\.snote\.chgwarn/.test(sel) ? m : ''));
/** 再剥掉 CSS 注释：注释常常贴在规则前/规则里，会跟着 .snote 规则一起被删或一起留下。 */
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n');
const stylesOf = html => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n/* --块分隔-- */\n');
const withoutStyles = html => html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '<style/>');

const files = walk(A, A).sort();
const htmlFiles = files.filter(f => f.endsWith('.html'));
// 非 HTML：必须逐字节相同
const nonHtmlDiff = files.filter(f => !f.endsWith('.html')
  && Buffer.compare(fs.readFileSync(path.join(A, f)), fs.readFileSync(path.join(B, f))) !== 0);
console.log(`非 HTML 文件 ${files.length - htmlFiles.length} 个 · 内容不同的 ${nonHtmlDiff.length}${nonHtmlDiff.length ? `：${nonHtmlDiff.join(' ')}` : ''}`);
let bodyDiff = 0; let styleDiff = 0; let frozenOkPages = 0; let extraSnoteRules = 0;
const problems = [];
const styleDiffFiles = [];
for (const f of htmlFiles) {
  const a = fs.readFileSync(path.join(A, f), 'utf8');
  const b = fs.readFileSync(path.join(B, f), 'utf8');
  if (withoutStyles(a) !== withoutStyles(b)) {
    bodyDiff += 1;
    problems.push(`${f}：非样式部分不同`);
  }
  const sa = stripComments(stripSnote(stylesOf(a)));
  const sb = stripComments(stripSnote(stylesOf(b)));
  if (sa !== sb) {
    styleDiff += 1;
    styleDiffFiles.push(f);
    problems.push(`${f}：剥掉 .snote 规则后样式仍不同`);
  }
  const stylesB = stylesOf(b);
  if (stylesB.split(FROZEN).length - 1 === 1) frozenOkPages += 1; else problems.push(`${f}：冻结串出现 ${stylesB.split(FROZEN).length - 1} 次`);
  const rules = [...stylesB.matchAll(ruleRe)].map(m => m[0].trim()).filter(r => !/\.snote\.chgwarn/.test(r) && r !== FROZEN);
  extraSnoteRules += rules.length;
  if (rules.length) problems.push(`${f}：残留 .snote 规则 ${rules.slice(0, 2).join(' | ').slice(0, 100)}`);
}
console.log(`对比 ${htmlFiles.length} 个 HTML（dist.baseline → dist.synth-fixed）`);
console.log(`  ① 非样式部分不同的文件：${bodyDiff}`);
console.log(`  ② 剥掉 .snote 规则后样式仍不同的文件：${styleDiff}${styleDiff ? ` → ${styleDiffFiles.join(' ')}` : ''}`);
console.log(`  ③ 冻结串恰好 1 次的页面：${frozenOkPages}/${htmlFiles.length} · 除冻结串外的 .snote 规则：${extraSnoteRules} 条`);
console.log(`  问题合计：${problems.length}${problems.length ? `\n     ${problems.slice(0, 10).join('\n     ')}` : ''}`);
console.log(`\n结论：${bodyDiff === 0 && styleDiff === 0 && extraSnoteRules === 0 && frozenOkPages === htmlFiles.length && nonHtmlDiff.length === 0
  ? '✅ synth-fixed 相对 baseline 的唯一改动就是 .snote 宽度声明（可作「只修缺陷」的反证产物）'
  : '❌ synth-fixed 还改了别的东西 —— 见上面的问题清单'}`);

if (styleDiffFiles.length) {
  console.log('\n② 的细节（剥掉 .snote 规则后仍有差异的文件）：');
  for (const f of styleDiffFiles) {
    const a = stripComments(stripSnote(stylesOf(fs.readFileSync(path.join(A, f), 'utf8')))).split('\n');
    const b = stripComments(stripSnote(stylesOf(fs.readFileSync(path.join(B, f), 'utf8')))).split('\n');
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p += 1;
    let sa = a.length - 1; let sb = b.length - 1;
    while (sa >= p && sb >= p && a[sa] === b[sb]) { sa -= 1; sb -= 1; }
    console.log(`   ${f}：`);
    console.log(`      baseline 独有(${sa - p + 1} 行)：${JSON.stringify(a.slice(p, sa + 1).join('\\n').slice(0, 300))}`);
    console.log(`      synth 独有(${sb - p + 1} 行)：${JSON.stringify(b.slice(p, sb + 1).join('\\n').slice(0, 300))}`);
  }
}
