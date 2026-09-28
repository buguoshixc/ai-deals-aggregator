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
 *   ⑥ 整条译文从覆盖层撤回 → 构建放行，但 `zh-todo --check` 必须把 deals.json 里
 *                            残留的旧译文（unmanaged）计为漂移而非放过
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

/** 覆盖层里**真的有译文**的字段数（空字符串是 --scaffold 留下的空槽位，normalizeZh 当没译处理） */
const overlayFieldCount = () => Object.keys(JSON.parse(original).byId)
  .reduce((n, id) => n + Object.keys(JSON.parse(original).byId[id])
    .filter(k => !k.startsWith('_') && k !== 'src' &&
      typeof JSON.parse(original).byId[id][k] === 'string' && JSON.parse(original).byId[id][k].trim())
    .length, 0);

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
  const expected = overlayFieldCount() - 1;
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

  // ⑥ 整条译文从覆盖层撤回（deals.json 里还留着上次贴上的 zh）
  //    → 构建照旧放行（英文原文还在，发布不该被卡），但译文门禁必须报红。
  //    修复前这里会漏：覆盖层没覆盖的 id 走的是 lib/zh.js 的 unmanaged 分支
  //    （原样保留 deal.zh、不做指纹比对），而 check:zh 的漂移判据不算 unmanaged，
  //    于是「撤回一条译文」的结果是旧译文照发、门禁仍然 exit 0。
  const withdrawn = JSON.parse(original);
  delete withdrawn.byId[onlyOne];
  write(withdrawn);
  const r5 = run();
  const unmanagedZh = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'deals.json'), 'utf8'))
    .deals.some(d => d.id === onlyOne && d.zh && Object.keys(d.zh).length);
  record('撤回整条译文 → 构建放行但产物里的旧译文被标为覆盖层管不到',
    r5.code === 0 && unmanagedZh && /不在覆盖层里/.test(r5.out),
    r5.code === 0 ? (unmanagedZh ? '已按管不到告警' : '产物里没有旧译文（case ④ 的残留？）') : '构建失败', r5);

  const r5b = runCheck();
  record('撤回整条译文 → check:zh 非零退出（unmanaged 计入漂移）',
    r5b.code !== 0 && /漂移 1 处/.test(r5b.out) && /管不到/.test(r5b.out) && !/译文与数据一致/.test(r5b.out),
    r5b.code !== 0 ? '已按漂移退出' : '竟然返回 0（撤回的译文会被漏掉）', r5);
} finally {
  fs.writeFileSync(FILE, original, 'utf8');
}

// 复原后再构建一次：确认演练没有把覆盖层改坏
const back = run();
const fields = overlayFieldCount();
const restored = back.code === 0 && new RegExp(`中文译文: \\d+/\\d+ 条带中文译文（${fields} 个字段）`).test(back.out);

/**
 * 复原后的复核。判据从「exit 0」升级为「**漂移为 0**」——
 * 2026-09-28 起待译是按年龄判的（宽限 7 天），所以只要还有未超期的待译，
 * exit 0 与 exit 1 都可能出现，用它当判据就变成了「有没有人手翻译」而不是「门禁坏没坏」。
 * 但也不能只查漂移就放过：exit 非 0 时**必须**是「待译超期」这一个理由，
 * 否则（例如有人把待译做成永久静默、或漂移判据失效）这条同样会红。
 */
const backCheck = runCheck();
const driftZero = /漂移 0 处/.test(backCheck.out) && /✓ 漂移 0 处/.test(backCheck.out);
const checkClean = driftZero &&
  (backCheck.code === 0 || /待译已超过 \d+ 天宽限/.test(backCheck.out));

/* ------------------------------------------------------------------ */
/* ⑦ 待译的年龄门禁：新条目进得来、陈年条目不放过                        */
/* ------------------------------------------------------------------ */

/**
 * 这两条是「方案 A（英文可上线 + 待译状态）」唯一的牙。
 *
 * 做法：造一份**临时 deals.json**（zh-todo 支持 --file=），塞一条英文散文条目：
 *  · firstSeen = 30 天前 → 超过宽限 → 必须非零退出（否则「永远待译」没人管）；
 *  · firstSeen = 今天   → 宽限内 → 必须 exit 0 且输出里写明「待译 1 条」（否则待译被静默吞掉）。
 * 临时文件写在 dist/ 下（那是 gitignore 的构建产物目录），用完即删。
 */
const tmpDir = path.join(ROOT, 'dist');
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
const shiftDays = n => new Date(Date.now() + 8 * 3600 * 1000 - n * 86400000).toISOString().slice(0, 10);
const makeProbeFile = (file, firstSeen) => fs.writeFileSync(file, `${JSON.stringify({
  schemaVersion: 2,
  updatedAt: `${shiftDays(0)}T00:00:00+08:00`,
  count: 1,
  deals: [{
    id: 'selftest-pending-probe',
    title: 'Self-test pending probe',
    vendor: 'Self-test',
    url: 'https://example.com/selftest-pending-probe',
    source: 'Self-test',
    sourceUrl: null,
    region: 'global',
    type: 'tool',
    discountInfo: null,
    pricingModel: null,
    priceLine: null,
    features: null,
    category: '其他',
    description: 'A probe entry that is English prose and has no translation at all.',
    eligibility: null,
    validity: null,
    expiresAt: null,
    firstSeen,
    lastSeen: shiftDays(0),
    verified: false,
    verifiedAt: null
  }]
}, null, 2)}\n`, 'utf8');

const runCheckOn = (file, grace, overlay, pending) => {
  const args = [path.join(ROOT, 'scripts', 'tools', 'zh-todo.js'), '--check', `--file=${file}`, `--grace=${grace}`];
  if (overlay) args.push(`--overlay=${overlay}`);
  if (pending) args.push(`--pending=${pending}`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  return { code: typeof r.status === 'number' ? r.status : 1, out: `${r.stdout || ''}${r.stderr || ''}` };
};

/** 跑作者循环的 --scaffold（会写覆盖层与待译账本，所以必须全程指向探针文件） */
const runScaffoldOn = (file, overlay, pending) => {
  const args = [path.join(ROOT, 'scripts', 'tools', 'zh-todo.js'), '--scaffold', `--file=${file}`];
  if (overlay) args.push(`--overlay=${overlay}`);
  if (pending) args.push(`--pending=${pending}`);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  return { code: typeof r.status === 'number' ? r.status : 1, out: `${r.stdout || ''}${r.stderr || ''}` };
};

const staleProbe = path.join(tmpDir, '.zh-selftest-stale.json');
const freshProbe = path.join(tmpDir, '.zh-selftest-fresh.json');
// 空覆盖层：探针 deals.json 里只有一条自造条目，用真覆盖层会让 45 条译文全变「对不上 id」，
// 那样测到的是孤儿判据而不是年龄判据。
const emptyOverlay = path.join(tmpDir, '.zh-selftest-overlay.json');
// 待译状态探针：用来验「年龄从**进入待译**那天算起，而不是 firstSeen」
const pendingProbe = path.join(tmpDir, '.zh-selftest-pending.json');
// 待译账本「划账」探针：作者循环（--scaffold）必须只把**已译好**的行划掉
const pruneDealDone = 'A probe entry whose Chinese translation is already written and fingerprinted.';
const pruneProbe = path.join(tmpDir, '.zh-selftest-prune.json');
const pruneOverlay = path.join(tmpDir, '.zh-selftest-prune-overlay.json');
const prunePending = path.join(tmpDir, '.zh-selftest-prune-pending.json');
let agingStale;
let agingFresh;
let agingSince;
try {
  fs.writeFileSync(emptyOverlay, `${JSON.stringify({ _note: 'selftest', byId: {} }, null, 2)}\n`, 'utf8');

  makeProbeFile(staleProbe, shiftDays(30));
  const rStale = runCheckOn(staleProbe, 7, emptyOverlay);
  agingStale = {
    pass: rStale.code !== 0 && /待译 1 条/.test(rStale.out) && /最老 30 天/.test(rStale.out) &&
      /超过 7 天宽限/.test(rStale.out),
    detail: rStale.code !== 0 ? '已按超期拦下' : '竟然放行（陈年待译没人管）'
  };
  record('待译超过宽限期（30 天）→ check:zh 必须拦下', agingStale.pass, agingStale.detail, rStale);

  makeProbeFile(freshProbe, shiftDays(0));
  const rFresh = runCheckOn(freshProbe, 7, emptyOverlay);
  agingFresh = {
    pass: rFresh.code === 0 && /待译 1 条/.test(rFresh.out) && /最老 0 天/.test(rFresh.out),
    detail: rFresh.code === 0 ? '宽限内放行且可见' : '新条目被拦（等于方案 B，站点会停更）'
  };
  record('待译在宽限期内（今天新进）→ check:zh 放行但必须写明待译条数', agingFresh.pass, agingFresh.detail, rFresh);

  /**
   * 年龄的**基准**必须是「进入待译那天」，不是 firstSeen。
   * 反例就是 2026-09-28 实测到的：上游改写了 Midjourney / Grok 的英文，两条老条目的译文失效
   * ——它们的 firstSeen 是 7 天前，用 firstSeen 计时等于「刚失效就超期」，第二天门禁就红。
   *  · (a) firstSeen 30 天前 + 待译状态记的是今天 → **必须放行**（刚刚才进入待译）；
   *  · (b) firstSeen 今天     + 待译状态记的是 30 天前 → **必须拦下**（义务从 30 天前就存在）。
   */
  makeProbeFile(staleProbe, shiftDays(30));   // 复用它：firstSeen = 30 天前
  fs.writeFileSync(pendingProbe, `${JSON.stringify({
    schemaVersion: 1, updatedAt: new Date().toISOString(),
    byKey: { 'selftest-pending-probe|description': shiftDays(0) }
  }, null, 2)}\n`, 'utf8');
  const rSinceA = runCheckOn(staleProbe, 7, emptyOverlay, pendingProbe);
  agingSince = {
    pass: rSinceA.code === 0 && /最老 0 天/.test(rSinceA.out) && /依据 pending/.test(rSinceA.out),
    detail: rSinceA.code === 0 ? '按「进入待译」计时，刚失效的老条目不被误拦' : '仍然用 firstSeen 计时（老条目刚失效就超期）'
  };
  record('上游改写让老条目译文失效 → 年龄从「进入待译」算起（不误拦）', agingSince.pass, agingSince.detail, rSinceA);

  makeProbeFile(freshProbe, shiftDays(0));    // firstSeen = 今天
  fs.writeFileSync(pendingProbe, `${JSON.stringify({
    schemaVersion: 1, updatedAt: new Date().toISOString(),
    byKey: { 'selftest-pending-probe|description': shiftDays(30) }
  }, null, 2)}\n`, 'utf8');
  const rSinceB = runCheckOn(freshProbe, 7, emptyOverlay, pendingProbe);
  record('待译状态显示它已经等了 30 天 → 即便 firstSeen 是今天也必须拦下',
    rSinceB.code !== 0 && /最老 30 天/.test(rSinceB.out) && /超过 7 天宽限/.test(rSinceB.out),
    rSinceB.code !== 0 ? '已按进入待译的天数拦下' : '竟然放行（待译状态被忽略）', rSinceB);
  /**
   * 待译账本必须**只记还没译的字段** —— 已经译好的行要在作者循环里被划掉。
   * 不划掉就是个假红陷阱：上游之后改写原文、人按 H2 把译文撤下（而不是改写）时，
   * 账本会翻出**上一轮**的日期当成「这条已经等了很多天」，宽限期一天不剩、门禁当场转红。
   * （2026-09-28 收尾时 Midjourney / Grok 的行就停在 09-28，正是这个形状。）
   * 两侧都测，缺一条都不算数：
   *  · (a) 已经译好的字段 → 它的行必须消失；
   *  · (b) 仍然缺译的字段 → 行必须留下，**日期原样不动**（不能被顺手改成今天）。
   */
  const mkDeal = (id, title, description) => ({
    id, title, vendor: 'Self-test',
    url: `https://example.com/${id}`,
    source: 'Self-test', sourceUrl: null, region: 'global', type: 'tool',
    discountInfo: null, pricingModel: null, priceLine: null, features: null,
    category: '其他', description,
    eligibility: null, validity: null, expiresAt: null,
    firstSeen: shiftDays(40), lastSeen: shiftDays(0),
    verified: false, verifiedAt: null
  });
  fs.writeFileSync(pruneProbe, `${JSON.stringify({
    schemaVersion: 2,
    updatedAt: `${shiftDays(0)}T00:00:00+08:00`,
    count: 2,
    deals: [
      mkDeal('selftest-prune-done', 'Self-test prune done', pruneDealDone),
      mkDeal('selftest-prune-keep', 'Self-test prune keep',
        'A probe entry that is still waiting for its Chinese translation.')
    ]
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(pruneOverlay, `${JSON.stringify({
    _note: 'selftest',
    byId: {
      'selftest-prune-done': {
        _title: 'Self-test prune done',
        description: '这条已经有译文了。',
        src: { description: pruneDealDone }
      }
    }
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(prunePending, `${JSON.stringify({
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    byKey: {
      'selftest-prune-done|description': shiftDays(30),
      'selftest-prune-keep|description': shiftDays(5)
    }
  }, null, 2)}\n`, 'utf8');

  const rPrune = runScaffoldOn(pruneProbe, pruneOverlay, prunePending);
  const afterPrune = JSON.parse(fs.readFileSync(prunePending, 'utf8')).byKey || {};
  const doneGone = !('selftest-prune-done|description' in afterPrune);
  const clearedLogged = /划掉 1 行/.test(rPrune.out);
  const keepKept = afterPrune['selftest-prune-keep|description'] === shiftDays(5);
  record('已译好的字段 → 作者循环必须把它的待译行划掉（否则下次撤译文会假红）',
    rPrune.code === 0 && doneGone && clearedLogged,
    doneGone
      ? (clearedLogged ? '已划掉并打印明细' : '行已消失但没打印「划掉 N 行」明细（人看不到发生了什么）')
      : `行还在：${JSON.stringify(afterPrune)}`, rPrune);
  record('仍缺译的字段 → 作者循环必须保留原日期（不能顺手重置成今天）',
    keepKept,
    keepKept ? `原样保留 ${shiftDays(5)}` : `日期被改写为 ${afterPrune['selftest-prune-keep|description']}（等于把宽限期重置）`, rPrune);
} finally {
  for (const file of [staleProbe, freshProbe, emptyOverlay, pendingProbe, pruneProbe, pruneOverlay, prunePending]) {
    try { fs.unlinkSync(file); } catch (error) { /* 不存在就算了 */ }
  }
}

console.log('\n=== 中文译文门禁演练 ===');
results.forEach(r => console.log(`  ${r.pass ? '✓' : '✗'} ${r.name} — ${r.detail}`));
console.log(`  ${restored ? '✓' : '✗'} 复原后构建回到 ${fields} 个译文字段`);
console.log(`  ${checkClean ? '✓' : '✗'} 复原后 check:zh 漂移回到 0（待译只受宽限期约束）`);
const extra = [restored, checkClean];
const failed = results.filter(r => !r.pass).length + extra.filter(v => !v).length;
console.log(`\n${failed ? '❌' : '✅'} 演练 ${results.length + extra.length} 项，失败 ${failed} 项`);
if (failed && !checkClean) console.log(`  ↳ 复原后 check:zh 输出：${backCheck.out.split('\n').slice(0, 4).join(' | ')}`);
process.exit(failed ? 1 : 0);
