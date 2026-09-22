/**
 * 从 index.html 抽出 RENDER-CORE（纯渲染核心）并在无 DOM 的沙箱里求值。
 *
 * 构建期预渲染与「分档/厂商报告」类工具都走这里，保证它们读到的模板与线上完全一致。
 * 沙箱里只提供 escapeHtml/escapeAttr 需要的那个 createElement 垫片；
 * 一旦有人在区块内引用 document/window/state，这里立即抛错。
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const RENDER_CORE_RE = /\/\* =+\s*\n\s*\* RENDER-CORE:START[\s\S]*?\/\* =+\s*\n\s*\* RENDER-CORE:END[\s\S]*?\*\//;

/** 契约：这些函数必须存在，构建与工具都依赖它们 */
const REQUIRED = [
  'cardHtml', 'gridHtml', 'detailHtml', 'defaultVisible', 'defaultCards', 'defaultFilters',
  'facetBarHtml', 'statsHtml', 'topStatHtml', 'categoryOptionsHtml', 'logoKeys', 'tierOf',
  'vendorOf', 'offerOf', 'featsOf'
];

function load(htmlPath = path.join(ROOT, 'index.html')) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(RENDER_CORE_RE);
  if (!match) {
    throw new Error(`${path.relative(ROOT, htmlPath)} 中找不到 RENDER-CORE 标记区块（纯渲染核心）`);
  }

  const shim = {
    document: {
      createElement() {
        let text = '';
        return {
          set textContent(value) { text = value === null || value === undefined ? '' : String(value); },
          get textContent() { return text; },
          get innerHTML() {
            return text
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;');
          }
        };
      }
    }
  };

  const context = vm.createContext(shim);
  new vm.Script(match[0], { filename: 'index.html#RENDER-CORE' }).runInContext(context);

  for (const name of REQUIRED) {
    if (typeof context[name] !== 'function') {
      throw new Error(`RENDER-CORE 区块缺少函数 ${name}()`);
    }
  }
  return context;
}

module.exports = { ROOT, load, REQUIRED };
