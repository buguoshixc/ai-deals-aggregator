#!/usr/bin/env node
/**
 * T23 补抽样（§28 指定的其余面）：
 *   S1 AI candidate isolation 三连：M11（候选信封进真值）/M12（生成侧隐式 accept）/MM17（accept 判定恒真）
 *   S2 非空历史要求面：M03（Changes 非空 → build/verify 必须绿）
 *   R3 来源语义（P1-6）：把一条「目录站」来源的记录写成官方 basis/sourceType → 期望 validate/provenance 红
 *   R4 第 7 列证据绑定（P1-9）：产物 API 页面第 7 列单位错位 → 期望 api-plans-selftest 红
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const GOLD = 'D:\\qc-t23\\gold';
const WORK = 'D:\\qc-t23\\extra';
const OUT = path.resolve(__dirname, 'logs', 'extra-sample.json');
const GIT_BASH = 'C:\\Program Files\\Git\\bin\\bash.exe';
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const run = (cmd, cwd) => {
  const r = spawnSync(cmd, { cwd, shell: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, env: { ...process.env, DSH_BASH: GIT_BASH } });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  return { exit: r.status, hits: out.split('\n').map(l => l.trim()).filter(l => /✗|❌|失败|拒绝|点名|不符合/.test(l)).slice(0, 3) };
};
function cpDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.qc-') || e.name.startsWith('dist.qc-')) continue;
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    const st = fs.lstatSync(s);
    if (st.isSymbolicLink()) { try { fs.symlinkSync(fs.readlinkSync(s), d, 'junction'); } catch {} continue; }
    if (st.isDirectory()) cpDir(s, d); else { try { fs.copyFileSync(s, d); } catch (err) { if (err.code !== 'EPERM') throw err; } }
  }
}
const out = { S1: null, S2: null, R3: null, R4: null };
fs.mkdirSync(WORK, { recursive: true });

/* S1 + S2：直接复用 T20 电池（同一 harness，记录仍落在各自 json） */
{
  const s1 = run('node research/quality-closure/mutation-work/battery.cjs --only=M11,M12,MM17 --gold=D:\\qc-t23\\gold --work=D:\\qc-t23\\extra\\s1 --json=research/quality-closure/reauth-work/logs/s1-ai.json', ROOT);
  out.S1 = { command: 'battery --only=M11,M12,MM17', exit: s1.exit, hits: s1.hits };
  const s2 = run('node research/quality-closure/mutation-work/battery.cjs --only=M03 --gold=D:\\qc-t23\\gold --work=D:\\qc-t23\\extra\\s2 --json=research/quality-closure/reauth-work/logs/s2-m03.json', ROOT);
  out.S2 = { command: 'battery --only=M03（要求面）', exit: s2.exit, hits: s2.hits };
  console.log(`S1 AI 三连 exit=${s1.exit} · S2 M03 要求面 exit=${s2.exit}`);
}

/* R3：来源语义（找一条目录站来源的策展记录，把 basis/sourceType 写成官方） */
{
  const dir = path.join(WORK, 'R3-provenance');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  cpDir(GOLD, dir);
  const file = path.join(dir, 'scripts/data/curated_cn.json');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = sha(file);
  let hit = null;
  const walk = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') {
        const url = String(v.sourceUrl || v.officialUrl || '');
        const isDirectory = /futuretools|layer3labs|futurepedia|aitools\.fyi|theresanaiforthat/i.test(url);
        if (isDirectory && (v.sourceType || v.basis || v.derived)) {
          v.sourceType = 'official';
          if ('basis' in v) v.basis = 'official-page';
          if ('derived' in v) v.derived = 'source';
          hit = { key: k, url };
          return true;
        }
        if (walk(v)) return true;
      }
    }
    return false;
  };
  if (!walk(doc)) { console.log('R3：在 curated_cn.json 里没找到目录站来源记录（跳过）'); out.R3 = { skipped: 'no-directory-record' }; }
  else {
    fs.writeFileSync(file, `${JSON.stringify(doc, null, 2)}\n`);
    const gates = [['validate-strict', 'node scripts/validate.js --strict'], ['provenance-selftest', 'node scripts/tools/provenance-selftest.js']]
      .map(([n, c]) => { const r = run(c, dir); return { name: n, exit: r.exit, hits: r.hits }; });
    fs.copyFileSync(path.join(GOLD, 'scripts/data/curated_cn.json'), file);
    out.R3 = { mutation: `把目录站来源记录（${hit.key} · ${hit.url}）写成 sourceType=official`, shaBefore: before, gates, restoredByteExact: sha(file) === before };
    console.log(`R3 来源语义：${gates.map(g => `${g.name}=${g.exit}`).join(' · ')} · 恢复=${out.R3.restoredByteExact}`);
  }
}

/* R4：第 7 列（其他计费维度）单位错位（产物层） */
{
  const dir = path.join(WORK, 'R4-column7');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  cpDir(GOLD, dir);
  const page = path.join(dir, 'dist/plans/api/index.html');
  const html = fs.readFileSync(page, 'utf8');
  const before = sha(page);
  const cellRe = /<td class="num">([^<]*)<\/td>/g;
  const cells = [...html.matchAll(cellRe)];
  if (!cells.length) { console.log('R4：API 页面没有 class="num" 格（跳过）'); out.R4 = { skipped: 'no-num-cells' }; }
  else {
    // 把第一行的第三个价格格（缓存价）整格替换成一个明显错位值
    const target = cells[Math.min(2, cells.length - 1)];
    const mutated = html.replace(target[0], '<td class="num">¥999999</td>');
    fs.writeFileSync(page, mutated);
    const gates = [
      ['api-plans-selftest（默认读 dist）', 'node scripts/tools/api-plans-selftest.js'],
      ['MY join-audit（模型页数值维度，不含 API 页）', 'node research/quality-closure/verify-work/join-audit.cjs --dist=dist']
    ].map(([n, c]) => { const r = run(c, dir); return { name: n, exit: r.exit, hits: r.hits }; });
    fs.copyFileSync(path.join(GOLD, 'dist/plans/api/index.html'), page);
    out.R4 = { mutation: '产物 /plans/api/ 第一行第三个价格格改成 ¥999999', shaBefore: before, gates, restoredByteExact: sha(page) === before };
    console.log(`R4 第 7 列/价格格错位：${gates.map(g => `${g.name}=${g.exit}`).join(' · ')} · 恢复=${out.R4.restoredByteExact}`);
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
const bad = [];
if (out.S1.exit !== 0) bad.push('S1 AI 三连非 0');
if (out.S2.exit !== 0) bad.push('S2 M03 要求面非 0');
if (out.R3 && out.R3.gates && out.R3.gates.some(g => g.exit === 0)) bad.push('R3：来源语义变异未被抓');
if (out.R4 && out.R4.gates && out.R4.gates[0].exit === 0) bad.push('R4：产物价格格错位未被 api-plans-selftest 抓');
console.log(bad.length ? `\n✗ ${bad.join(' / ')}` : '\n✅ S1/S2/R3/R4 全部符合预期');
process.exit(bad.length ? 1 : 0);
