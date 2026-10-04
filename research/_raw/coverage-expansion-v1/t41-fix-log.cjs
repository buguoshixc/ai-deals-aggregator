'use strict';
/**
 * t41 · 把 UTF-16 的 log 重写为 UTF-8（内容逐字不变），并做「唯一读数」一致性断言。
 * 用法：node t41-fix-log.cjs
 */
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname);

/* ── ① 编码归一：UTF-16 → UTF-8（只改编码，一个字符都不动） ── */
const logPath = path.join(R, 't18-gate-run.log');
const buf = fs.readFileSync(logPath);
let text = null, from = null;
if (buf[0] === 0xFF && buf[1] === 0xFE) { text = buf.slice(2).toString('utf16le'); from = 'UTF-16LE+BOM'; }
else if (buf[0] === 0xFE && buf[1] === 0xFF) { text = buf.slice(2).swap16().toString('utf16le'); from = 'UTF-16BE+BOM'; }
else if (buf.includes(0x00)) { text = buf.toString('utf16le'); from = 'UTF-16LE(no BOM)'; }
else { text = buf.toString('utf8'); from = 'UTF-8'; }
const normalized = text.replace(/\r\n/g, '\n');
if (from !== 'UTF-8') fs.writeFileSync(logPath, normalized, 'utf8');
console.log('t18-gate-run.log: 原编码 ' + from + ' → UTF-8；' + buf.length + ' → ' + Buffer.byteLength(normalized) + ' bytes');

/* ── ② 唯一读数一致性断言 ── */
const g = JSON.parse(fs.readFileSync(path.join(R, 't18-gate-results.json'), 'utf8'));
const log = fs.readFileSync(logPath, 'utf8');
const md = fs.readFileSync(path.join(R, 't18-full-gate-report.md'), 'utf8');
const rd = JSON.parse(fs.readFileSync(path.join(R, 't41-derived-r5-readings.json'), 'utf8'));
const rt = JSON.parse(fs.readFileSync(path.join(R, 't41-reverse-teeth.json'), 'utf8'));
const head = g.head.sha.slice(0, 7);
const canonical = '门禁步骤：' + g.gateSummary.passed + ' 过 / ' + g.gateSummary.failed + ' 红 / ' + g.gateSummary.skipped + ' 跳过（共 ' + g.gateSummary.total + '）';

const checks = [
  ['gate-results ⇔ gate-run.log 同一读数（UTF-8 逐字）', log.includes(canonical)],
  ['gate-run.log 的 HEAD = gate-results 的 HEAD', log.includes('（HEAD ' + head + '）')],
  ['gate-results：48 过 / 0 红 / 1 跳过 / 共 49', g.gateSummary.passed === 48 && g.gateSummary.failed === 0 && g.gateSummary.skipped === 1 && g.gateSummary.total === 49],
  ['report §0 结论 = 48 / 49 过（0 红）', md.includes('**49 步里 48 过、0 红、1 跳过。**')],
  ['report 表格读数 = **48 / 49 过**', md.includes('**48 / 49 过**')],
  ['report 不含「47 / 49 过」这类结论', !md.includes('47 / 49 过') && !md.includes('**47 过、1 红')],
  ['report HEAD = gate HEAD', md.includes('`' + head + '`')],
  ['report §9 读数时间线在位（三套数字各有出处）', md.includes('## 9. 读数时间线') && md.includes('47 过 / 1 红 / 1 跳过') && md.includes('46 / 49 过')],
  ['report 的 Vendor-pages 步骤 = exit 0', /\| 37 \| Vendor-pages self-test \(\/vendor\/\) \| ✅ 0 \|/.test(md)],
  ['readings HEAD = gate HEAD', rd.head.startsWith(head)],
  ['readings：null 身份 9 / 有身份 25 / 厂商页 22 / 磁盘 22', rd.counts.nullIdentity === 9 && rd.counts.identity === 25 && rd.counts.vendorPages === 22 && rd.counts.diskVendorDirs === 22],
  ['readings：磁盘目录集合 == 计划 slug 集合（无孤儿、无缺目录）', rd.disk.equal === true && rd.disk.orphan.length === 0 && rd.disk.missing.length === 0],
  ['readings：9 个 null 身份逐条 OK', rd.nullIdentityRows.every(r => r.skipRows === 1 && !r.hasPage && !r.declaredInVendorSlugs && !r.skipRoute)],
  ['readings：反向（有身份+达标却无页）为空集', rd.reverseDirection.identityWithMaterialButNoPage.length === 0],
  ['反向牙：A 红 / B 绿 / C 红', rt.variants.find(v => v.id === 'A').exit !== 0 && rt.variants.find(v => v.id === 'B').exit === 0 && rt.variants.find(v => v.id === 'C').exit !== 0],
];
let bad = 0;
for (const [k, v] of checks) { if (!v) bad++; console.log('  ' + (v ? '✓' : '✗') + ' ' + k); }
console.log(bad ? '❌ 不一致 ' + bad + ' 项' : '✅ 一致性：' + checks.length + ' 项全过 —— 同一份产物里只有一套自洽读数');
process.exit(bad ? 1 : 0);
