#!/usr/bin/env node
/**
 * 变异工具（t16 / sources-residue-v1b）：在**内存里**把 `SOURCE_LABELS.origin` 改名，再跑判据。
 *
 * 为什么要它：`check-roles-note.js` 的判据建立在「注里的标签必须逐字等于 live 常量」上 ——
 * 这条关系只有在**有人把常量改名**的时候才会响。直接在磁盘上改 `scripts/lib/audience.js`
 * 是越界（本任务 in-scope 只有 `scripts/data/official_urls.json` 与 research/ 下的交付物），
 * 所以这里用 Node 的模块缓存做内存改名：`require` 拿到的是同一个对象，改它不会写盘。
 *
 *   node research/_raw/sources-residue-v1b/mutate-live-label.js [新标签名]
 *
 * 期望：判据红（注里那句「收录渠道」不再是 live 值）。磁盘上的 audience.js **一个字节都不会变**。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const AUDIENCE = path.join(ROOT, 'scripts', 'lib', 'audience.js');
const NEW_LABEL = process.argv[2] || '来源渠道';

const hashOf = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const beforeHash = hashOf(AUDIENCE);

const audience = require(AUDIENCE);
const oldLabel = audience.WORDING_CONTRACT.SOURCE_LABELS.origin;
audience.WORDING_CONTRACT.SOURCE_LABELS.origin = NEW_LABEL;

console.log(`[harness] 内存改名：SOURCE_LABELS.origin「${oldLabel}」→「${NEW_LABEL}」（**不写盘**）`);
console.log(`[harness] scripts/lib/audience.js sha256 前 = ${beforeHash.slice(0, 16)}`);

process.on('exit', () => {
  const afterHash = hashOf(AUDIENCE);
  console.log(`[harness] scripts/lib/audience.js sha256 后 = ${afterHash.slice(0, 16)}`);
  console.log(afterHash === beforeHash ? '[harness] ✅ 磁盘未被改动' : '[harness] ❌ 磁盘被改动（不应该发生）');
});

// 让判据看到被改名的常量（同一个模块对象），并把它自己的参数收窄成默认值
process.argv = [process.argv[0], path.join(__dirname, 'check-roles-note.js')];
require(path.join(__dirname, 'check-roles-note.js'));
