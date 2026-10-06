#!/usr/bin/env node
/**
 * T21 · 把 mutations-real/M-summary.json 归纳成一张「期望 vs 实测」表（落盘到 logs/T3-mutation-table.txt）。
 * 只读，不再跑浏览器。用法：node research/_raw/secondary-page-layout-unification/t21/mutation-table.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const T = 'research/_raw/secondary-page-layout-unification/t21';
const abs = rel => path.join(ROOT, rel);
const summary = JSON.parse(fs.readFileSync(abs(`${T}/mutations-real/M-summary.json`), 'utf8'));
const uniq = list => [...new Set(list || [])];
const out = [];
const W = line => out.push(String(line));

W(`source: ${summary.source.report}  (reportTotal=${summary.source.reportTotal} reportFailed=${summary.source.reportFailed})`);
W(`label=${summary.label} · dir=${summary.source.dir} · 标的 sha 记录处 verifySiteSha256=${String(summary.source.verifySiteSha256 || '').slice(0, 16)}`);
W('');
W('| id | route | vw | 期望 | 实测（去重） | 命中 | 逐条键 | anchor(门禁/磁盘) | 注入串保留 sha |');
W('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const row of summary.rows) {
  W(`| ${row.id} | ${row.route} | ${row.viewport} | ${row.expect} | ${uniq(row.observed).join(', ') || '（空）'} | ${row.hit} | `
    + `${(row.narrowKeys || []).join(' ') || '（无）'} | ${row.anchorFromVerifySite}/${row.anchorFromDisk} | ${row.sha256Equal} |`);
}
W('');
W(`对照组（不注入，M8/M9a/M9b/M10 的靶页在对应档位本来一条窄码都没有）：allClean=${summary.noInjectionControl.allClean}`);
for (const row of summary.noInjectionControl.rows) W(`  ${row.id} ${row.route} @${row.width} noteNarrow=${row.noteNarrow} codes=${JSON.stringify(row.codes)}`);
W('');
const m5 = summary.m5Reuse;
W(`M5 复用（§22b）：断言 ${m5.assertions} 项 / 失败 ${m5.failing} · hit=${m5.hit} · 码 ${JSON.stringify(m5.codes)}`);
W(`  §22b 期望 ${JSON.stringify(m5.expect)}`);
W('');
W(`零磁盘污染：${summary.zeroDiskPollution.files} 文件逐一比对，changed=${JSON.stringify(summary.zeroDiskPollution.changed)} identical=${summary.zeroDiskPollution.identical}`);
W('');
W('逐条 JSON（原始读数）：');
for (const row of summary.rows) W(`  ${row.id}: research/_raw/secondary-page-layout-unification/t21/mutations-real/${row.id}.json`);
W(`  M5-reuse: research/_raw/secondary-page-layout-unification/t21/mutations-real/M5-reuse.json`);
W(`  no-injection-control: research/_raw/secondary-page-layout-unification/t21/mutations-real/no-injection-control.json`);

fs.mkdirSync(abs(`${T}/logs`), { recursive: true });
fs.writeFileSync(abs(`${T}/logs/T3-mutation-table.txt`), `${out.join('\n')}\n`, 'utf8');
console.log(`${out.length} 行 → ${T}/logs/T3-mutation-table.txt`);
