#!/usr/bin/env node
/**
 * 只读排查：本机 Windows 上，自测/被调脚本**工作区文件**的换行形态。
 * 关键问题：`'--links=' + 路径` 之类的参数如果被 CRLF 污染，Linux 侧行为会与本机不同。
 * 本脚本只读，不写任何文件。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const files = [
  'scripts/tools/coverage-report.js',
  'scripts/tools/coverage-targets-selftest.js',
  'scripts/lib/model-registry.js',
  '.gitattributes'
];

const count = (buf, byte) => buf.filter(b => b === byte).length;

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  const disk = fs.readFileSync(abs);
  let blob = null;
  try { blob = execFileSync('git', ['cat-file', 'blob', `HEAD:${rel}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }); } catch {}
  const lineOf = buf => {
    const i = buf.indexOf(0x0a);
    return JSON.stringify(buf.slice(Math.max(0, i - 3), i + 1).toString('latin1'));
  };
  console.log(`\n${rel}`);
  console.log(`  工作区: bytes=${disk.length} CR=${count(disk, 0x0d)} LF=${count(disk, 0x0a)}  第一个 LF 前 3 字节=${lineOf(disk)}`);
  if (blob) console.log(`  索引/HEAD: bytes=${blob.length} CR=${count(blob, 0x0d)} LF=${count(blob, 0x0a)}  第一个 LF 前 3 字节=${lineOf(blob)}`);
}

// 关键复现：把 report 的 stdout 按「自测里的 jsonOf」逐字跑一遍，并打印 marker 的字节级上下文
const os = require('os');
const { spawnSync } = require('child_process');
const registry = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'covd3-'));
const align = (rel, name) => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  doc.schemaVersion = registry.MODEL_SCHEMA_VERSION;
  const f = path.join(tmp, name);
  fs.writeFileSync(f, `${JSON.stringify(doc, null, 2)}\n`);
  return f;
};
const args = ['--json',
  `--links=${align('scripts/data/model-registry-links.json', 'links.json')}`,
  `--gaps=${align('scripts/data/model-registry-gaps.json', 'gaps.json')}`];
const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/tools/coverage-report.js'), ...args], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024
});
const out = r.stdout || '';
console.log('\n=== 传给 report 的 argv（逐字符，暴露隐藏字符）===');
for (const a of args) console.log('   ', JSON.stringify(a));
const M = '\nJSON:\n';
const at = out.indexOf(M);
console.log('\nmarker 位置:', at);
if (at >= 0) {
  console.log('marker 上下文码位:', JSON.stringify(Array.from(out.slice(at, at + M.length)).map(c => c.codePointAt(0))));
}
const rest = at >= 0 ? out.slice(at + M.length) : '';
const end = rest.lastIndexOf('\n✅');
console.log('切割点 end:', end);
console.log('切割点处码位:', JSON.stringify(Array.from(rest.slice(Math.max(0, end - 2), end + 3)).map(c => c.codePointAt(0))));
let parsed = null;
try { parsed = JSON.parse(end < 0 ? rest : rest.slice(0, end)); } catch (e) { console.log('parse 抛错:', e.message); }
console.log('解析结果:', parsed ? `成功，顶层键 ${Object.keys(parsed).length} 个` : '失败');
