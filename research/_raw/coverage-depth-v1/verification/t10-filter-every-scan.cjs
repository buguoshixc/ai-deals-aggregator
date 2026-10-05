#!/usr/bin/env node
/**
 * t10 工具：全仓扫描「空集可达」形态的断言。
 *
 * 命中形态（题面里 captain 点名的同类风险）：
 *   · `X.filter(...).every(...)`   —— filter 出空集时恒真
 *   · `X.filter(...).some(...)`    —— some 在空集上恒假（反向风险：断言永假 / 或被 ! 包住变恒真）
 * 只扫**断言文件**（scripts/tools/**.js 与 scripts/validate.js 等），不扫生产 lib —— 生产代码里的
 * filter/every 是业务逻辑，不是"断言恒绿"风险。
 *
 * 每条命中给出：文件:行、源码片段、所在最近的 check(...) 名字（若有）、以及"有没有同行的非空前提线索"。
 *
 * 用法：node t10-filter-every-scan.cjs <repoRoot> <outFile.json>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2]);
const outFile = path.resolve(process.argv[3]);

const files = [];
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
    else if (e.isFile() && e.name.endsWith('.js')) files.push(p);
  }
};
walk(path.join(repo, 'scripts'));

const hits = [];
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!/\.filter\([^\n]*\)\.(every|some)\(/.test(line)) return;
    // 往上找最近的 check( 名字（最多 40 行）
    let checkName = null;
    for (let k = i; k >= Math.max(0, i - 40); k -= 1) {
      const m = lines[k].match(/check\(\s*[`'"]([^`'"]{0,140})/);
      if (m) { checkName = m[1]; break; }
    }
    // 同一条语句块（往下 6 行内）有没有非空前提（length > 0 / !length 早返回 / Math.min 等）
    const context = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 7)).join('\n');
    const guards = [];
    if (/\.length\s*(>|!==|===)\s*[1-9]/.test(context)) guards.push('同块有 length 比较');
    if (/Math\.min\(/.test(context)) guards.push('同块有 Math.min');
    if (/expectedCount|expectedRows|\.length === \w+\.length/.test(context)) guards.push('同块有"计数对账"形态');
    hits.push({
      file: path.relative(repo, file).split(path.sep).join('/'),
      line: i + 1,
      form: line.match(/\)\.(every|some)\(/)[1],
      code: line.trim().slice(0, 220),
      nearestCheck: checkName,
      guardHints: guards
    });
  });
}

const byForm = hits.reduce((acc, h) => { acc[h.form] = (acc[h.form] || 0) + 1; return acc; }, {});
const summary = {
  repo, scannedFiles: files.length, hits: hits.length, byForm,
  files: [...new Set(hits.map(h => h.file))],
  details: hits
};
fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`扫了 ${files.length} 个 scripts/**.js，命中 ${hits.length} 处 filter(...).every/some（every ${byForm.every || 0} / some ${byForm.some || 0}）`);
for (const h of hits) console.log(`  ${h.file}:${h.line} [${h.form}] ${h.nearestCheck ? `「${h.nearestCheck.slice(0, 60)}」` : '(未在 check 内)'} ${h.guardHints.length ? '· ' + h.guardHints.join('; ') : ''}\n      ${h.code.slice(0, 170)}`);
