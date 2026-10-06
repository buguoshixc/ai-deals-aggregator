/** T15 · 列出 §22b/§22c 的 check（名字 + 明细前 200 字），用于核对断言文本与反空洞自检。
 *  node review/harness/list-22c-checks.cjs <verify.json> [out.txt]
 */
const fs = require('fs');
const [jsonPath, outPath] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const cs = (j.checks || []).filter(c => /§22[bc]/.test(c.name || ''));
const lines = [`${jsonPath}：§22b/§22c check 共 ${cs.length} 条，失败 ${cs.filter(c => !c.ok).length} 条`];
for (const c of cs) lines.push(`${c.ok ? '✓' : '✗'} ${String(c.name).slice(0, 120)}\n     ${String(c.detail || '').slice(0, 220)}`);
const text = lines.join('\n');
if (outPath) { fs.mkdirSync(require('path').dirname(outPath), { recursive: true }); fs.writeFileSync(outPath, text); console.log(`写盘 ${outPath}`); }
console.log(text);
