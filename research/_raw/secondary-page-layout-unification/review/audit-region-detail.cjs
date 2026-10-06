/** T6 复审 · 定位「静态复算 .chgsec 2 页 / 浏览器 1 页」的那一页。只读。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const DIR = path.join(ROOT, process.argv[2] || 'dist');
const SEL = ['.ctable', '.stable', '.chgsec', '.chglist', '.flist', '.fsec', '.ptable', '.lsum', '.pchglist'];
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) walk(f, out);
    else if (e.name === 'index.html') out.push(f);
  }
  return out;
}
for (const file of walk(DIR).sort()) {
  const html = fs.readFileSync(file, 'utf8');
  const route = path.relative(DIR, file).split(path.sep).join('/');
  for (const sel of SEL) {
    const cls = sel.slice(1);
    const re = new RegExp(`class\\s*=\\s*"[^"]*\\b${cls}\\b[^"]*"`);
    const m = re.exec(html);
    if (m) {
      const before = html.slice(0, m.index);
      const opens = (before.match(/<script\b/gi) || []).length;
      const closes = (before.match(/<\/script>/gi) || []).length;
      const inScript = opens > closes;
      const inMain = /<main[\s>]/.test(before) && before.lastIndexOf('</main>') < before.lastIndexOf('<main');
      const inTemplate = opens > closes && /<template\b/i.test(before.slice(before.lastIndexOf('<script')));
      console.log(`${route.padEnd(34)} ${sel.padEnd(10)} inScript=${inScript} inMain=${inMain} template=${inTemplate}`);
      if (sel === '.chgsec') {
        console.log(`      ctx: ${JSON.stringify(html.slice(Math.max(0, m.index - 220), m.index + 80))}`);
      }
      break;
    }
  }
}
