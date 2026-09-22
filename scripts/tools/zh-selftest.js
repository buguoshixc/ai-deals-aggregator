#!/usr/bin/env node
/**
 * 中文译文门禁演练（自恢复，不留污染）。
 *
 * 门禁这种东西，没见过它失败就不知道它到底管不管用。这里把几种坏数据真的塞进去，
 * 看构建是拦下来还是照发不误：
 *   ① 译文不含汉字         → 必须硬失败（合成一个「看起来像译文」的英文最危险）
 *   ② 原文指纹对不上       → 构建成功，但该字段译文停用（不能拿旧译文配新原文）
 *   ③ 译文键对不上任何条目 → 构建成功并告警（孤儿）
 *   ④ 覆盖层删掉一条译文   → 产物里也必须消失（不能靠 deals.json 里的残留撑着）
 *   ⑤ 同一份孤儿数据       → `zh-todo --check` 必须非零退出（建议性门禁要看得见漂移）
 *
 * 用法：node scripts/tools/zh-selftest.js
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const FILE = path.join(ROOT, 'scripts', 'data', 'translations_zh.json');

/**
 * 用 spawnSync 而不是 execFileSync：构建的告警走 console.warn（stderr），
 * 而 execFileSync 在成功时只返回 stdout，会把告警整段丢掉——用它演练会得出
 * 「没有告警」的错误结论，把没做的事判成做了。
 */
function run() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'tools', 'build-local.js')],
    { cwd: ROOT, encoding: 'utf8' });
  return {
    code: typeof r.status === 'number' ? r.status : 1,
    out: `${r.stdout || ''}${r.stderr || ''}`,
    signal: r.signal
  };
}

const badLines = out => out.split('\n').filter(l => l.includes('✗') || l.includes('❌')).map(l => l.trim());
const zhLine = out => (out.split('\n').find(l => l.includes('中文译文: ')) || '').trim();

/** 跑一次译文漂移门禁（zh-todo --check）：它不构建，只回答「有没有要人处理的事」 */
function runCheck() {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'tools', 'zh-todo.js'), '--check'],
    { cwd: ROOT, encoding: 'utf8' });
  return {
    code: typeof r.status === 'number' ? r.status : 1,
    out: `${r.stdout || ''}${r.stderr || ''}`
  };
}

const original = fs.readFileSync(FILE, 'utf8');
const results = [];

function record(name, pass, detail, r) {
  results.push({ name, pass, detail });
  if (pass) return;
  console.log(`\n--- 用例「${name}」失败详情 (exit=${r.code}${r.signal ? ' signal=' + r.signal : ''}) ---`);
  badLines(r.out).forEach(l => console.log('   ' + l));
  console.log('   ' + zhLine(r.out));
}

function write(doc) {
  fs.writeFileSync(FILE, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
}

try {
  const doc = JSON.parse(original);
  const ids = Object.keys(doc.byId).filter(id => doc.byId[id].description);
  if (!ids.length) throw new Error('覆盖层里没有任何 description 译文，无法演练');
  // 只带一个字段的条目：它的译文一旦作废，整条 zh 应该消失
  const onlyOne = ids.find(id => Object.keys(doc.byId[id])
    .filter(k => !k.startsWith('_') && k !== 'src').length === 1) || ids[0];

  // ① 译文不是中文 → 必须硬失败
  const bad = JSON.parse(original);
  bad.byId[ids[0]].description = 'This is still English.';
  write(bad);
  const r1 = run();
  record('译文不含汉字 → 阻断发布', r1.code !== 0 && /中文译文不合规/.test(r1.out),
    r1.code !== 0 ? '构建已中止' : '构建竟然通过了', r1);

  // ② 原文指纹对不上 → 构建通过，但该字段译文停用
  const stale = JSON.parse(original);
  stale.byId[onlyOne].src.description = 'This English no longer exists in deals.json.';
  write(stale);
  const r2 = run();
  const counted = /中文译文: \d+\/\d+ 条带中文译文（(\d+) 个字段）/.exec(r2.out);
  const expected = Object.keys(original ? JSON.parse(original).byId : {})
    .reduce((n, id) => n + Object.keys(JSON.parse(original).byId[id])
      .filter(k => !k.startsWith('_') && k !== 'src').length, 0) - 1;
  record('原文已变 → 警告并停用该字段译文',
    r2.code === 0 && /原文已变，译文已停用待复核/.test(r2.out) &&
    counted && Number(counted[1]) === expected,
    r2.code === 0 ? `字段数 ${counted ? counted[1] : '?'}（应为 ${expected}）` : '构建失败', r2);

  // ③ 孤儿译文 → 构建通过并告警
  const orphan = JSON.parse(original);
  orphan.byId.deadbeef0000 = { _title: '不存在的条目', description: '这段译文对应不上任何条目。' };
  write(orphan);
  const r3 = run();
  record('译文对不上 id → 告警但不阻断',
    r3.code === 0 && /译文对不上任何条目 id/.test(r3.out),
    r3.code === 0 ? '已告警' : '构建失败', r3);

  // ⑤ 同一份孤儿数据：构建放行（发布不该被卡），但门禁必须把它标出来
  const r3b = runCheck();
  record('译文对不上 id → check:zh 非零退出',
    r3b.code !== 0 && /漂移 1 处/.test(r3b.out) && /孤儿\s+\[deadbeef0000\]/.test(r3b.out),
    r3b.code !== 0 ? '已按漂移退出' : '竟然返回 0（漂移会被漏掉）', r3);

  // ④ 覆盖层删掉一条译文 → 产物里也必须消失
  const removed = JSON.parse(original);
  delete removed.byId[onlyOne].description;
  if (removed.byId[onlyOne].src) delete removed.byId[onlyOne].src.description;
  write(removed);
  const r4 = run();
  const distZh = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'deals.json'), 'utf8'));
  const stillThere = distZh.deals.some(d => d.id === onlyOne && d.zh && d.zh.description);
  record('覆盖层删掉译文 → 产物同步消失',
    r4.code === 0 && !stillThere,
    r4.code === 0 ? (stillThere ? '产物里还留着旧译文' : '产物已同步') : '构建失败', r4);
} finally {
  fs.writeFileSync(FILE, original, 'utf8');
}

// 复原后再构建一次：确认演练没有把覆盖层改坏
const back = run();
const fields = Object.keys(JSON.parse(original).byId)
  .reduce((n, id) => n + Object.keys(JSON.parse(original).byId[id])
    .filter(k => !k.startsWith('_') && k !== 'src').length, 0);
const restored = back.code === 0 && new RegExp(`中文译文: \\d+/\\d+ 条带中文译文（${fields} 个字段）`).test(back.out);
// 复原后门禁也必须回到 0：一个常年红的检查等于没有检查
const backCheck = runCheck();
const checkClean = backCheck.code === 0 && /译文与数据一致/.test(backCheck.out);

console.log('\n=== 中文译文门禁演练 ===');
results.forEach(r => console.log(`  ${r.pass ? '✓' : '✗'} ${r.name} — ${r.detail}`));
console.log(`  ${restored ? '✓' : '✗'} 复原后构建回到 ${fields} 个译文字段`);
console.log(`  ${checkClean ? '✓' : '✗'} 复原后 check:zh 回到 0（建议性门禁不会常红）`);
const extra = [restored, checkClean];
const failed = results.filter(r => !r.pass).length + extra.filter(v => !v).length;
console.log(`\n${failed ? '❌' : '✅'} 演练 ${results.length + extra.length} 项，失败 ${failed} 项`);
process.exit(failed ? 1 : 0);
