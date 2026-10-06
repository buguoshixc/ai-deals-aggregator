/**
 * T6 复审 · 只读：把若干页面里每一个 .snote 的「角色」摊开 —— 标签、类、父链、首 60 字。
 * 目的：判断 §22c 只量「文档序第一个 .snote」时，后面那些到底是页面级说明还是分节小注。
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..', '..');
const DIR = path.join(root, process.argv[2] || 'dist');
const routes = process.argv.slice(3);
if (!routes.length) routes.push('student/', 'status/', 'changes/', 'feeds/', 'category/', 'docs/data/', 'models/360zhinao-pro/', 'archive/');

const TAG = /<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)>|<\/([a-zA-Z][\w-]*)>/g;

function outline(html, route) {
  const mainStart = html.search(/<main[\s>]/);
  if (mainStart < 0) { console.log(`${route} 没有 <main>`); return; }
  const mainEnd = html.indexOf('</main>', mainStart);
  const body = html.slice(mainStart, mainEnd < 0 ? html.length : mainEnd);
  const stack = [];
  const notes = [];
  for (const m of body.matchAll(TAG)) {
    if (m[3]) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag === m[3]) { stack.length = i; break; }
      }
      continue;
    }
    const tag = m[1].toLowerCase();
    const attrs = m[2] || '';
    const selfClose = /\/\s*$/.test(attrs) || ['br', 'img', 'input', 'meta', 'link', 'hr'].includes(tag);
    const classMatch = attrs.match(/class\s*=\s*"([^"]*)"/);
    const classes = classMatch ? classMatch[1] : '';
    const idx = m.index + m[0].length;
    if (classes.split(/\s+/).includes('snote')) {
      const after = body.slice(idx, idx + 400).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      // 找闭合标签后面的文本
      const closeAt = body.indexOf(`</${tag}>`, idx);
      const innerText = body.slice(idx, closeAt < 0 ? idx + 400 : closeAt).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      notes.push({
        tag,
        classes,
        parentChain: stack.map(s => (s.classes ? `${s.tag}.${s.classes.split(/\s+/)[0]}` : s.tag)).slice(-4).join(' > '),
        inner: innerText.slice(0, 70),
        childTags: [...body.slice(idx, closeAt < 0 ? idx + 400 : closeAt).matchAll(/<([a-zA-Z][\w-]*)/g)].map(x => x[1].toLowerCase())
      });
      void after;
    }
    if (!selfClose) stack.push({ tag, classes });
  }
  console.log(`\n=== ${route || '/'}  <main> 里 .snote 共 ${notes.length} 个 ===`);
  notes.forEach((note, i) => {
    console.log(`  [${i}] <${note.tag} class="${note.classes}"> 父：${note.parentChain}`);
    console.log(`      子元素：${note.childTags.length ? note.childTags.join(',') : '（纯文本）'}`);
    console.log(`      文本：${note.inner}`);
  });
}

for (const route of routes) {
  const file = path.join(DIR, route, 'index.html');
  if (!fs.existsSync(file)) { console.log(`\n=== ${route} 缺失 ===`); continue; }
  outline(fs.readFileSync(file, 'utf8'), route);
}

// 全局：类里带 snote 的标签统计
const counts = new Map();
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.toLowerCase() === 'index.html') out.push(full);
  }
  return out;
}
for (const file of walk(DIR)) {
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[^<>]*?)?)>/g)) {
    const cm = (m[2] || '').match(/class\s*=\s*"([^"]*)"/);
    if (cm && cm[1].split(/\s+/).includes('snote')) {
      const key = `${m[1].toLowerCase()}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
}
console.log(`\n全站带 .snote 的标签分布：${[...counts.entries()].map(([k, v]) => `${k}×${v}`).join(' ')}`);
