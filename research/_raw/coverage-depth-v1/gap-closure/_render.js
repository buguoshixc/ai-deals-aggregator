/**
 * 一次性取证工具（只写 research/_raw 下的输出文件）：
 * 用仓库自带的 headless 渲染器把 JS 渲染的官方页面取成纯文本，供人工逐字引用。
 *
 * 用法：node research/_raw/coverage-depth-v1/gap-closure/_render.js <url> <out.txt> [waitForText]
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const browser = require(path.join(ROOT, 'scripts', 'lib', 'browser'));

async function main() {
  const url = process.argv[2];
  const out = process.argv[3];
  const waitForText = process.argv[4] || null;
  if (!url || !out) throw new Error('用法: _render.js <url> <out.txt> [waitForText]');
  const r = await browser.withPage(page => browser.render(page, url, {
    waitForText,
    waitForTextTimeout: 45000,
    settleWait: 2500,
    diagnostics: true
  }));
  fs.writeFileSync(out, String(r.text || ''), 'utf8');
  console.log(JSON.stringify({
    ok: true,
    url: r.url,
    title: r.title,
    textLen: String(r.text || '').length,
    domLen: String(r.domText || '').length,
    matchedNeedle: r.matchedNeedle || null,
    notes: r.notes || null
  }));
}

main().catch(error => {
  console.error('RENDER-FAILED: ' + error.message);
  process.exit(1);
});
