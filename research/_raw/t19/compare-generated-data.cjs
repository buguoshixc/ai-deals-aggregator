// t19 部署前置（只读）：对比「我方 HEAD」与「origin/master」在 4 个自动生成数据文件上的结构差异，
// 为合并冲突的人工裁决提供依据（不是猜，逐键/逐条列出）。
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const WT = path.resolve(__dirname, '..', '..', '..');
const FILES = ['deals.json', 'scripts/data/source-health.json', 'scripts/data/source-snapshots.json', 'scripts/data/zh-pending.json'];

function show(rev, file) {
  try { return execFileSync('git', ['show', `${rev}:${file}`], { cwd: WT, maxBuffer: 1 << 28 }).toString('utf8'); }
  catch { return null; }
}
const keysOf = v => (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).filter(k => !k.startsWith('_')) : null;
const arrKey = v => Array.isArray(v) ? v.length : null;

for (const f of FILES) {
  console.log(`\n===== ${f} =====`);
  for (const rev of ['HEAD', 'origin/master']) {
    const raw = show(rev, f);
    if (raw === null) { console.log(`${rev}: (不存在)`); continue; }
    let v; try { v = JSON.parse(raw); } catch (e) { console.log(`${rev}: JSON 解析失败 ${e.message}`); continue; }
    const bytes = Buffer.byteLength(raw, 'utf8');
    const ks = keysOf(v);
    console.log(`${rev}: bytes=${bytes} 顶层键=${ks ? ks.length : '(数组)'} ${ks ? JSON.stringify(ks.slice(0, 14)) : ''}`);
    if (Array.isArray(v)) console.log(`       数组长度=${v.length}`);
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const k of ['count', 'dist', 'generatedAt', 'updatedAt', 'schemaVersion']) {
        if (v[k] !== undefined) console.log(`       ${k} = ${JSON.stringify(v[k]).slice(0, 160)}`);
      }
      // 逐键计数（数组 / 记录表）
      for (const [k, val] of Object.entries(v)) {
        if (k.startsWith('_')) continue;
        if (Array.isArray(val)) console.log(`       ${k}: array(${val.length})`);
        else if (val && typeof val === 'object') console.log(`       ${k}: object{${Object.keys(val).length}}`);
      }
    }
  }
  const a = show('HEAD', f), b = show('origin/master', f);
  console.log(`相同? ${a === b}`);
}
