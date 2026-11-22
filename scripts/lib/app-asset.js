'use strict';
/**
 * 首页应用脚本（`assets/app.js`）的**唯一产物名派生处**。
 *
 * 为什么要有这个模块：脚本文件名里带内容哈希（`app.<hash>.js`），而这个名字同时出现在
 * 三个地方——构建期写盘、`index.html` 的 `<script src>`、产物资产白名单（逐路径登记）。
 * 三处各算一次哈希，任何一处漏改都会变成「白名单拒绝一个真实文件」或「HTML 指向 404」。
 * 所以哈希只在这里算一次，另外两处都从 `file` 取。
 *
 * Phase 5：保留 `SOURCE`（原始可读源码，供 `validate.js` 与 `SHARED:dealcopy` 提取），
 * 并通过确定性词法级注释/缩进剥离产出 `OUTPUT`（省去 ~85 KB 注释与空白）；
 * 文件名哈希由 `OUTPUT` 派生，保证 `check:reproducible` 逐字节稳定。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** 源码相对仓库根的位置（`index.html` 的 `<script src>` 也写这个值） */
const SOURCE_REL = 'assets/app.js';
const SOURCE_PATH = path.join(__dirname, '..', '..', SOURCE_REL);
const SOURCE = fs.readFileSync(SOURCE_PATH, 'utf8');

/**
 * 确定性 JS 注释与前导缩进剥离（词法感知：正确跳过字符串、模板字面量、正则字面量）。
 * 零外部依赖、不重命名变量、不改换行分号语义。
 */
function stripJsComments(code) {
  const src = String(code || '');
  const n = src.length;
  let out = '';
  let i = 0;
  // 记录上一个有意义的非空白 token 尾字符/关键字，用于区分除法 `/` 与正则字面量 `/.../`
  let prevSig = '';
  let prevWord = '';

  const REGEX_PREV_KEYWORDS = new Set([
    'return', 'case', 'throw', 'in', 'instanceof', 'typeof', 'void', 'delete', 'new', 'do', 'else', 'of', 'yield', 'await'
  ]);
  const canStartRegex = () => {
    if (!prevSig) return true;
    if ('([{,=;:!?&|^~+-*%<>'.includes(prevSig)) return true;
    if (prevSig === 'w' && REGEX_PREV_KEYWORDS.has(prevWord)) return true;
    return false;
  };

  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    // 字符串字面量
    if (ch === '"' || ch === "'") {
      const q = ch;
      out += ch;
      i += 1;
      while (i < n) {
        const c = src[i];
        out += c;
        i += 1;
        if (c === '\\' && i < n) { out += src[i]; i += 1; }
        else if (c === q) break;
      }
      prevSig = 's';
      prevWord = '';
      continue;
    }

    // 模板字符串（简化处理：完整保留内容，含 ${...} 内部）
    if (ch === '`') {
      out += ch;
      i += 1;
      let braceDepth = 0;
      while (i < n) {
        const c = src[i];
        out += c;
        i += 1;
        if (c === '\\' && i < n) { out += src[i]; i += 1; }
        else if (c === '$' && src[i] === '{') { out += '{'; i += 1; braceDepth += 1; }
        else if (c === '}' && braceDepth > 0) { braceDepth -= 1; }
        else if (c === '`' && braceDepth === 0) break;
      }
      prevSig = 's';
      prevWord = '';
      continue;
    }

    // 单行注释 //
    if (ch === '/' && next === '/') {
      i += 2;
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }

    // 块注释 /* ... */
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) break;
      const chunk = src.slice(i, end + 2);
      // 保留 RENDER-CORE 与 SHARED:dealcopy 的结构边界标记注释（供 render-core.js 与构建自检识别）
      if (/RENDER-CORE:(?:START|END)|SHARED:dealcopy:(?:START|END)/.test(chunk)) {
        out += `\n${chunk}\n`;
      } else {
        // 若注释跨行，补一个换行避免相邻语句粘连；否则补一个空格避免标识符粘连
        out += chunk.includes('\n') ? '\n' : ' ';
      }
      i = end + 2;
      continue;
    }

    // 正则字面量
    if (ch === '/' && canStartRegex()) {
      out += ch;
      i += 1;
      let inClass = false;
      while (i < n) {
        const c = src[i];
        out += c;
        i += 1;
        if (c === '\\' && i < n) { out += src[i]; i += 1; }
        else if (c === '[') inClass = true;
        else if (c === ']') inClass = false;
        else if (c === '/' && !inClass) break;
      }
      while (i < n && /[a-z]/i.test(src[i])) { out += src[i]; i += 1; }
      prevSig = 'r';
      prevWord = '';
      continue;
    }

    // 标识符/关键字
    if (/[A-Za-z_$]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j += 1;
      const word = src.slice(i, j);
      out += word;
      prevSig = 'w';
      prevWord = word;
      i = j;
      continue;
    }

    out += ch;
    if (!/\s/.test(ch)) {
      prevSig = ch;
      prevWord = '';
    }
    i += 1;
  }

  return out
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n') + '\n';
}

const OUTPUT = stripJsComments(SOURCE);
/** 内容哈希：足够长以避免碰撞，又足够短以保持 URL 可读 */
const HASH = crypto.createHash('sha256').update(OUTPUT, 'utf8').digest('hex').slice(0, 16);
const FILE = `app.${HASH}.js`;

module.exports = {
  SOURCE_REL,
  SOURCE_PATH,
  SOURCE,
  OUTPUT,
  HASH,
  FILE,
  stripJsComments
};
