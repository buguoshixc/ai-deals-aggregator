/**
 * T6 复审（寻假绿）· 静态审计：dist / dist.baseline 里 .snote 的分布。
 *
 * 只读产物，不写盘。回答三个问题：
 *   ① 全站有多少页在 <main> 里有 ≥2 个 .snote（§22c 的 wideMeasure 只取第一个）？
 *   ② 有多少页在 <main> 里一个 .snote 都没有（「无页面级说明」）？
 *   ③ 页面内联样式里，除了共享 <style> 的冻结串，还有没有别的 `.snote` 规则？
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..', '..');
const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['dist', 'dist.baseline'];

const SNOTE_CLASS = /class\s*=\s*"([^"]*)"/g;
const hasSnote = cls => cls.split(/\s+/).includes('snote');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.toLowerCase() === 'index.html') out.push(full);
  }
  return out;
}

function mainSlice(html) {
  const start = html.search(/<main[\s>]/);
  if (start < 0) return null;
  const end = html.indexOf('</main>', start);
  return end < 0 ? html.slice(start) : html.slice(start, end);
}

function countSnoteIn(html) {
  let n = 0;
  for (const m of html.matchAll(SNOTE_CLASS)) if (hasSnote(m[1])) n += 1;
  return n;
}

for (const rel of dirs) {
  const DIR = path.join(root, rel);
  if (!fs.existsSync(DIR)) { console.log(`== ${rel} (missing) ==`); continue; }
  const files = walk(DIR).sort();
  const zero = [];
  const multi = [];
  const noMain = [];
  let multiInDoc = [];
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const route = path.relative(DIR, file).split(path.sep).join('/').replace(/index\.html$/, '') || '/';
    const main = mainSlice(html);
    if (main === null) { noMain.push(route); continue; }
    const n = countSnoteIn(main);
    if (n === 0) zero.push(route);
    else if (n > 1) multi.push([route, n]);
    const docN = countSnoteIn(html);
    if (docN > 1) multiInDoc.push([route, docN]);
  }
  console.log(`== ${rel}: ${files.length} 个 index.html ==`);
  console.log(`   <main> 里 0 个 .snote：${zero.length} 页`);
  console.log(`   <main> 里 ≥2 个 .snote：${multi.length} 页 ${JSON.stringify(multi.slice(0, 30))}`);
  console.log(`   整份文档 ≥2 个 .snote：${multiInDoc.length} 页 ${JSON.stringify(multiInDoc.slice(0, 30))}`);
  console.log(`   没有 <main>：${noMain.length} 页 ${JSON.stringify(noMain.slice(0, 10))}`);
}

// ③ 内联 <style> 里的 .snote 规则清点（按页面）
const { execSync } = require('child_process');
void execSync;
for (const rel of dirs) {
  const DIR = path.join(root, rel);
  if (!fs.existsSync(DIR)) continue;
  const files = walk(DIR).sort();
  const withRules = new Map();
  let frozenPages = 0;
  const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const route = path.relative(DIR, file).split(path.sep).join('/') || '/';
    let styles = '';
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) styles += m[1];
    if (styles.split(FROZEN).length - 1 === 1) frozenPages += 1;
    // 规则选择器里带 .snote 的（粗略：选择器片段 + { }）
    const rules = [...styles.matchAll(/([^{}]*\.snote[^{}]*)\{([^{}]*)\}/g)]
      .map(m => `${m[1].trim()} { ${m[2].trim()} }`);
    if (rules.length) withRules.set(route, rules);
  }
  console.log(`\n== ${rel}：内联样式里出现 .snote 规则的页面 ${withRules.size} 个；冻结串恰好 1 次的页面 ${frozenPages}/${files.length} ==`);
  const shapes = new Map();
  for (const [route, rules] of withRules) {
    for (const rule of rules) shapes.set(rule, (shapes.get(rule) || 0) + 1);
  }
  for (const [rule, n] of [...shapes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ×${n}  ${rule.slice(0, 160)}`);
  }
}
