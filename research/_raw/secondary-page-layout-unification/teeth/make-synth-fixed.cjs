#!/usr/bin/env node
/**
 * 合成已修复产物（`dist.synth-fixed`）—— T2 §22c 的**自验脚手架**，不是产品代码。
 *
 * 为什么需要它：§22c 要证明的是「T1 的产品改动（`.snote` 收成唯一一处、宽度改成 `max-width: none`）
 * 作用在**产物**上之后，全站 186 页的真浏览器几何全部合规」。但 T1 的 `dist/` 由另一个会话构建，
 * 不能拿来当自己的前置。于是这里把 `dist.baseline`（= commit 1f225d2 的忠实改动前产物）整份复制成
 * `dist.synth-fixed`，再**逐页**做两件与 T1 改动等价的事：
 *
 *   (a) 删掉页面内联 `<style>` 里**任何** `.snote { … }` 规则 —— 它们正是 build-local.js 里那 8 条
 *       页面级副本（4 条 `max-width: 70ch` + 4 条 `max-width: none`）编译进产物的样子；
 *       `.snote.chgwarn { … }` 这类修饰类规则**不在**删除范围（T1 的任务书明确保留它）。
 *   (b) 往页面**第一个** `<style>` 块（= index.html 的共享样式块，186 页里逐字相同）的
 *       `.detail-main` 规则后面注入冻结串，**每页只注入一次**：
 *
 *         .snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }
 *
 *       注入后每页内联样式里这条串恰好出现 1 次 —— 这既是 §22c 变异牙的锚点，
 *       也是「一处定义、全站生效」的机器可读证据。
 *
 * ⚠️ 关系说明（README 里同样写明，免得把脚手架当成产品读数）：
 *   · `dist.synth-fixed` 是**预测版本**：它模拟 T1 改动编译出来的产物，用于 §22c 的自验（绿线）。
 *   · 真正的权威读数来自 T3 在**真实 `dist/`**（T1 构建）上复跑的同一条命令。
 *   · `dist.baseline/` 只读：本脚本只读它，不写一个字节（跑完还会把 303 个文件的 sha256 与
 *     `baseline/dist-baseline-sha256.txt` 逐条对账）。
 *
 * 用法：
 *   node research/_raw/secondary-page-layout-unification/teeth/make-synth-fixed.cjs
 *   node research/_raw/secondary-page-layout-unification/teeth/make-synth-fixed.cjs --src=dist.baseline --out=dist.synth-fixed
 *
 * 幂等：每次都先删掉 `--out` 再整份重建，重复跑得到的字节完全相同。
 * 退出码非 0 = 产物不符合预期（不许拿它去当「绿」的证据）。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const argOf = (name, fallback) => {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const SRCDIR = path.join(ROOT, argOf('src', 'dist.baseline'));
const OUTDIR = path.join(ROOT, argOf('out', 'dist.synth-fixed'));
const MANIFEST = path.join(ROOT, 'research/_raw/secondary-page-layout-unification/baseline/dist-baseline-sha256.txt');

/** 冻结串：与 T1 任务书里那一行**逐字一致**（不含行首缩进）。§22c 的变异牙锚点就是它。 */
const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';
/** 页面级副本的唯一形态：`.snote {` + 一段声明 + `}`（修饰类 `.snote.chgwarn` 的 `{` 不紧跟 `.snote`，天然不匹配）。 */
const PAGE_SNOTE_RULE = /^[ \t]*\.snote[ \t]*\{[^}]*\}[ \t]*\r?\n/gm;
/** 共享样式块里的注入锚点：`.detail-main` 那条规则（186 页的共享块里逐字相同、恰好一条）。 */
const INJECT_ANCHOR = '    .detail-main { width: min(1120px, 100%); margin-inline: auto; }';

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const rel = full => path.relative(ROOT, full).split(path.sep).join('/');
const problems = [];
const stop = msg => { console.error(`✗ ${msg}`); process.exit(1); };

// ---- 0) 前置守卫：源目录必须是 baseline，输出目录不许是 baseline / dist ----
if (!fs.existsSync(path.join(SRCDIR, 'index.html'))) stop(`源目录 ${rel(SRCDIR)} 里没有 index.html`);
if (path.resolve(OUTDIR) === path.resolve(SRCDIR)) stop('输出目录不能等于源目录');
if (path.basename(OUTDIR) === 'dist' || path.basename(SRCDIR) === 'dist') {
  stop('本脚手架只服务 dist.baseline → dist.synth-fixed 的合成，不碰真实 dist/（那是 T1/T3 的产物）');
}

// ---- 0.5) 读源目录（含 sha256），跑完再对账一次证明源目录零改动 ----
const srcFiles = walk(SRCDIR).map(full => rel(full));
/** baseline 内的相对路径（`dist.baseline/index.html` → `index.html`）→ 源/产物里的落点。 */
const inSrc = r => path.join(ROOT, r);
const inOut = r => path.join(OUTDIR, r.slice(rel(SRCDIR).length + 1));
const srcBefore = new Map(srcFiles.map(r => [r, sha256(fs.readFileSync(inSrc(r)))]));

// ---- 1) 整份复制 ----
fs.rmSync(OUTDIR, { recursive: true, force: true });
fs.mkdirSync(OUTDIR, { recursive: true });
for (const r of srcFiles) {
  const to = inOut(r);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(inSrc(r), to);
}
console.log(`复制：${rel(SRCDIR)} → ${rel(OUTDIR)}（${srcFiles.length} 个文件）`);

// ---- 2) 逐页改产物 ----
const stats = { html: 0, removed70: 0, removedNone: 0, removedOther: 0, injected: 0, chgwarnKept: 0 };
const htmlFiles = srcFiles.filter(r => r.toLowerCase().endsWith('.html'));
for (const r of htmlFiles) {
  const outFile = inOut(r);
  const html = fs.readFileSync(outFile, 'utf8');
  const blocks = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)];
  if (!blocks.length) { problems.push(`${r}: 没有 <style> 块（无法注入冻结串）`); continue; }

  let next = html;

  // (a) 删除页面内联样式里任何 `.snote { … }` 规则 —— 逐块做，逐块记账。
  for (const block of blocks) {
    const css = block[0];
    const rules = [...css.matchAll(PAGE_SNOTE_RULE)].map(m => m[0]);
    if (!rules.length) continue;
    let replaced = css;
    for (const rule of rules) {
      const text = rule.trim();
      if (/max-width:\s*70ch/.test(text)) stats.removed70 += 1;
      else if (/max-width:\s*none/.test(text)) stats.removedNone += 1;
      else stats.removedOther += 1;
      replaced = replaced.replace(rule, '');
    }
    if (replaced !== css) next = next.replace(css, replaced);
  }

  // (b) 冻结串注入第一个 <style> 块：锚点必须恰好 1 条，否则拒绝生成（不许产出「看起来改了」的产物）。
  const first = blocks[0][0];
  const anchorCount = first.split(INJECT_ANCHOR).length - 1;
  if (anchorCount !== 1) {
    problems.push(`${r}: 共享样式块里 .detail-main 注入锚点出现 ${anchorCount} 次（必须恰好 1 次）`);
    continue;
  }
  if (first.includes(FROZEN)) {
    problems.push(`${r}: 共享样式块里已经存在冻结串（不能注入第二次）`);
    continue;
  }
  const injectedBlock = first.replace(INJECT_ANCHOR, `${INJECT_ANCHOR}\n    ${FROZEN}`);
  next = next.replace(first, injectedBlock);
  stats.injected += 1;

  if (/(^|\n)[ \t]*\.snote\.chgwarn[ \t]*\{/.test(html)) stats.chgwarnKept += 1;
  fs.writeFileSync(outFile, next, 'utf8');
  stats.html += 1;
}

// ---- 3) 产出自检：每页冻结串恰好 1 次、页面级 .snote 规则清零、70ch 不再残留 ----
let frozenOk = 0;
const frozenBad = [];
let pageRuleLeft = 0;
for (const r of htmlFiles) {
  const html = fs.readFileSync(inOut(r), 'utf8');
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const n = styles.split(FROZEN).length - 1;
  if (n === 1) frozenOk += 1; else frozenBad.push(`${r}: ${n} 次`);
  for (const m of styles.matchAll(/(^|\n)[ \t]*\.snote[ \t]*\{[^}]*\}/g)) {
    // 冻结串本身就是 `.snote { … }` 形态：它是**注入结果**，不是残留的页面级副本。
    if (m[0].trim() === FROZEN) continue;
    pageRuleLeft += 1;
    if (pageRuleLeft <= 3) problems.push(`${r}: 残留页面级 .snote 规则 ${m[0].trim().slice(0, 60)}`);
  }
  if (/\.snote[^{}]*\{[^}]*max-width:\s*70ch/.test(styles)) {
    problems.push(`${r}: 内联样式里仍有 max-width: 70ch 的 .snote`);
  }
}

// ---- 4) 源目录零改动对账 ----
const srcAfter = new Map(srcFiles.map(r => [r, sha256(fs.readFileSync(inSrc(r)))]));
const srcDrift = srcFiles.filter(r => srcBefore.get(r) !== srcAfter.get(r));

// ---- 5) 非 HTML 文件逐字节等于源（复制即相等，这里给机器可读证据） ----
const nonHtml = srcFiles.filter(r => !r.toLowerCase().endsWith('.html'));
const nonHtmlDrift = nonHtml.filter(r => srcBefore.get(r) !== sha256(fs.readFileSync(inOut(r))));

// ---- 6) 与 baseline 的 sha256 清单对账（证明 dist.baseline 没被这次跑动碰过） ----
let manifestChecked = 0;
const manifestDrift = [];
if (fs.existsSync(MANIFEST)) {
  // ⚠️ 清单是 UTF-8 BOM + CRLF：`(.+)$` 里的 `.` **不匹配 `\r`**（它是行终止符），首行还多一个 BOM。
  // 两处都不先剥掉，会一条都对不上（踩过：清单对账 0 条）。
  for (const raw of fs.readFileSync(MANIFEST, 'utf8').split('\n')) {
    const m = raw.replace(/^\uFEFF/, '').trimEnd().match(/^([0-9a-f]{64})\s{2}(.+)$/);
    if (!m) continue;
    manifestChecked += 1;
    const full = path.join(SRCDIR, m[2]);
    if (!fs.existsSync(full) || sha256(fs.readFileSync(full)) !== m[1]) manifestDrift.push(m[2]);
  }
}

console.log(`\n产物：${rel(OUTDIR)}`);
console.log(`  HTML ${stats.html} 页 · 注入冻结串 ${stats.injected} 次 · 删除页面级 .snote 规则 ${stats.removed70 + stats.removedNone + stats.removedOther} 条`
  + `（70ch ${stats.removed70} / none ${stats.removedNone} / 其它 ${stats.removedOther}）`);
console.log(`  冻结串恰好 1 次的页面 ${frozenOk}/${htmlFiles.length} · 残留页面级 .snote 规则 ${pageRuleLeft} 条 · 保留 .snote.chgwarn 的页面 ${stats.chgwarnKept}`);
console.log(`  ${rel(SRCDIR)} 零改动：${srcDrift.length === 0 ? '全等' : `漂移 ${srcDrift.length} 个 ${srcDrift.slice(0, 3).join(' ')}`}`
  + ` · 清单对账 ${manifestChecked} 条${manifestDrift.length ? `（漂移 ${manifestDrift.slice(0, 3).join(' ')}）` : '（无漂移）'}`);
console.log(`  非 HTML 文件逐字节等于源：${nonHtmlDrift.length === 0 ? `全部 ${nonHtml.length} 个` : `漂移 ${nonHtmlDrift.length} 个`}`);

for (const bad of frozenBad) problems.push(`冻结串出现次数不为 1：${bad}`);
for (const drift of srcDrift) problems.push(`源目录被改动：${drift}`);
for (const drift of manifestDrift) problems.push(`baseline 清单对账失败：${drift}`);
for (const drift of nonHtmlDrift) problems.push(`非 HTML 文件与源不一致：${drift}`);

if (problems.length) {
  console.error(`\n✗ 合成产物不合格（${problems.length} 条）：`);
  for (const p of problems.slice(0, 20)) console.error(`   · ${p}`);
  process.exit(1);
}
console.log('\n✅ 合成产物自检全过（每页冻结串恰好 1 次、页面级 .snote 规则清零、baseline 零改动）');
