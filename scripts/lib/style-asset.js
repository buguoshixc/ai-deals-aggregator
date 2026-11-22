'use strict';
/**
 * 全站共享样式表（提取自 `index.html` 共享 `<style>`）的**唯一产物名派生处**。
 *
 * 与 `scripts/lib/app-asset.js` 同一纪律：
 *   · 源码仍以 `index.html` 的单个 `<style>` 为唯一出处（本地 `npm run serve` 直接可读）；
 *   · 构建期剥除所有 CSS 注释与多余缩进/空行后，产出内容哈希文件名 `style.<16hex>.css`，
 *     供首页与全部 400 个子页以 `<link rel="stylesheet">` 共享并长期缓存（不再把 ~110 KB
 *     样式内联重复写进 401 个 HTML 文件）；
 *   · 保留单行规则内部空格（例如 `.snote { ... }`），确保所有构建期/浏览器期 CSS 锚点逐字成立。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const INDEX_REL = 'index.html';
const INDEX_PATH = path.join(__dirname, '..', '..', INDEX_REL);

/**
 * 字符串感知的 CSS 注释剥离 + 确定性轻量压缩（保留规则内单空格，不破坏任何 CSS 语法或冻结规则串）。
 * @param {string} css
 * @returns {string}
 */
function minifyCss(css) {
  const src = String(css || '');
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    // 保留双引号/单引号字符串字面量原样（含内部 /* 序列）
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = src[i];
        out += c;
        i += 1;
        if (c === '\\' && i < n) {
          out += src[i];
          i += 1;
        } else if (c === quote) {
          break;
        }
      }
      continue;
    }
    // 跳过 /* ... */ 注释
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n') + '\n';
}

function readSharedStyleFromHtml(html) {
  const m = String(html || '').match(/<style>([\s\S]*?)<\/style>/);
  return m ? m[1] : '';
}

const INDEX_HTML = fs.readFileSync(INDEX_PATH, 'utf8');
const SOURCE = readSharedStyleFromHtml(INDEX_HTML);
if (!SOURCE) {
  throw new Error('scripts/lib/style-asset.js: index.html 里找不到共享 <style> 区块');
}
const OUTPUT = minifyCss(SOURCE);
const HASH = crypto.createHash('sha256').update(OUTPUT, 'utf8').digest('hex').slice(0, 16);
const FILE = `style.${HASH}.css`;

module.exports = {
  INDEX_REL,
  INDEX_PATH,
  SOURCE,
  OUTPUT,
  HASH,
  FILE,
  minifyCss
};
