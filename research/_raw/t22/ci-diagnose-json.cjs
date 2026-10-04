#!/usr/bin/env node
/**
 * 只读诊断：为什么 `coverage-targets-selftest.js` 的「（隔离上游）JSON 可解析」在 CI(Linux) 红、
 * 在本机(Windows) 绿？
 *
 * 判据与自测里那一段**逐字相同**：
 *   isoArgs = [--json, --links=<临时 links.json>, --gaps=<临时 gaps.json>]（只把顶层 schemaVersion 对齐）
 *   jsonOf(stdout) = 找 '\nJSON:\n' → 取其后 → 去掉最后一个 '\n✅' 之后的部分 → JSON.parse
 *
 * 本脚本把「决定成败的那几步」全部打出来：marker 在不在、切割点对不对、parse 报什么错、
 * stdout/stderr 的字节数、以及关键环境指纹。**不写任何生产文件**（只写自己的 stdout）。
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const REPORT = path.join(ROOT, 'scripts', 'tools', 'coverage-report.js');
const MARKER = '\nJSON:\n';

const sha = buf => crypto.createHash('sha256').update(buf).digest('hex');

function jsonOf(stdout) {
  const at = stdout.indexOf(MARKER);
  if (at < 0) return { payload: null, why: 'marker 没找到（indexOf < 0）', at };
  const rest = stdout.slice(at + MARKER.length);
  const end = rest.lastIndexOf('\n✅');
  try {
    return { payload: JSON.parse(end < 0 ? rest : rest.slice(0, end)), why: null, at, end };
  } catch (error) {
    return { payload: null, why: `JSON.parse 抛错：${String(error.message).slice(0, 200)}`, at, end };
  }
}

function main() {
  console.log('=== 环境指纹 ===');
  console.log('platform      :', process.platform, process.arch);
  console.log('node          :', process.version);
  console.log('cwd           :', process.cwd());
  console.log('ROOT          :', ROOT);
  console.log('TZ            :', process.env.TZ || '(未设)');
  console.log('os.tmpdir()   :', os.tmpdir());
  console.log('argv          :', process.argv.slice(2).join(' ') || '(无)');

  const registry = require(path.join(ROOT, 'scripts', 'lib', 'model-registry.js'));
  console.log('MODEL_SCHEMA_VERSION :', registry.MODEL_SCHEMA_VERSION);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'covdiag-'));
  const isoArgs = [];
  const align = (rel, name) => {
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    doc.schemaVersion = registry.MODEL_SCHEMA_VERSION;
    const file = path.join(tmpDir, name);
    fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    return file;
  };
  isoArgs.push(`--links=${align('scripts/data/model-registry-links.json', 'links.json')}`);
  isoArgs.push(`--gaps=${align('scripts/data/model-registry-gaps.json', 'gaps.json')}`);
  console.log('\n=== 临时夹具 ===');
  for (const arg of isoArgs) {
    const file = arg.slice(arg.indexOf('=') + 1);
    const buf = fs.readFileSync(file);
    console.log(`  ${arg}\n    exists=${fs.existsSync(file)} bytes=${buf.length} sha256=${sha(buf).slice(0, 16)}`);
  }

  const runs = [];
  for (let i = 1; i <= 2; i++) {
    const r = spawnSync(process.execPath, [REPORT, '--json', ...isoArgs], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024
    });
    const stdout = r.stdout || '';
    const stderr = r.stderr || '';
    const parsed = jsonOf(stdout);
    runs.push({ stdout, stderr, status: r.status, parsed, signal: r.signal });
    console.log(`\n=== 第 ${i} 次 report:coverage --json（隔离上游）===`);
    console.log('  status      :', r.status, ' signal:', r.signal ?? '(无)');
    console.log('  stdout 字符  :', stdout.length, ' 字节:', Buffer.byteLength(stdout, 'utf8'), ' sha256:', sha(stdout).slice(0, 16));
    console.log('  stderr 字符  :', stderr.length, ' sha256:', sha(stderr).slice(0, 16));
    console.log('  marker 位置  :', parsed.at, parsed.at < 0 ? '  ⇒ 没找到 marker' : `（期望 >=0）`);
    console.log('  切割点 end   :', parsed.end, parsed.end < 0 ? '  ⇒ 没找到 "\\n✅"' : '');
    console.log('  JSON.parse   :', parsed.payload ? '成功' : `失败 —— ${parsed.why}`);
    if (parsed.at >= 0) {
      const rest = stdout.slice(parsed.at + MARKER.length);
      console.log('  marker 之前 40 字符:', JSON.stringify(stdout.slice(Math.max(0, parsed.at - 40), parsed.at)));
      console.log('  marker 之后 40 字符:', JSON.stringify(rest.slice(0, 40)));
      console.log('  stdout 末尾 60 字符:', JSON.stringify(stdout.slice(-60)));
      const bad = rest.slice(0, parsed.end < 0 ? undefined : parsed.end);
      console.log('  待解析段长度 :', bad.length);
      // 逐字节看前若干字符，暴露 BOM / 控制字符 / 代理对问题
      console.log('  待解析段前 12 个码位:', JSON.stringify(Array.from(bad.slice(0, 12)).map(c => c.codePointAt(0))));
      console.log('  待解析段末 12 个码位:', JSON.stringify(Array.from(bad.slice(-12)).map(c => c.codePointAt(0))));
      console.log('  待解析段里有孤立 CR 吗:', bad.includes('\r'));
    }
    if (stderr.trim()) {
      console.log('  --- stderr ---');
      console.log(stderr.split('\n').slice(0, 15).map(l => `    ${l}`).join('\n'));
    }
  }

  console.log('\n=== 判定 ===');
  const [a, b] = runs;
  console.log('两次 stdout 逐字节一致      :', a.stdout === b.stdout);
  console.log('两次都解析成功              :', Boolean(a.parsed.payload) && Boolean(b.parsed.payload));
  console.log('上游自检问题（stderr 的 "- " 行）:', a.stderr.split('\n').filter(l => l.trim().startsWith('- ')).length, '处');
  console.log('复现 CI 的红？              :', !a.parsed.payload ? '是（本机也红 ⇒ 与平台无关，是真缺陷）' : '否（本机绿 ⇒ 平台/环境相关，见上面的差异）');
  return a.parsed.payload ? 0 : 1;
}

process.exit(main());
