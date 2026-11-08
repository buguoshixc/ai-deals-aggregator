#!/usr/bin/env node
/**
 * 中文译文层演练（自恢复，不留污染）。
 *
 * 门禁这种东西，没见过它失败就不知道它到底管不管用。这里把几种坏数据真的塞进去，
 * 看构建是拦下来还是照发不误。**2026-11-08 起译文层是建议性的**：坏译文一律
 * 「丢弃该字段、回退英文原文」，构建照发；`check:zh` 只报告、exit 0；
 * 想要硬拦必须显式加 `--strict`（人要求时才生效）。演练同时守住这两面：
 *   ① 译文不含汉字         → 字段丢弃、回退英文，构建照发（不能把坏译文发上线，也不能停站）
 *   ② 原文指纹对不上       → 构建成功，但该字段译文停用（不能拿旧译文配新原文）
 *   ③ 译文键对不上任何条目 → 构建成功并告警（孤儿）
 *   ④ 覆盖层删掉一条译文   → 产物里也必须消失（不能靠 deals.json 里的残留撑着）
 *   ⑤ 同一份孤儿数据       → `check:zh` 必须把漂移标出来（**exit 0**），`--strict` 才 exit 1
 *   ⑥ 整条译文从覆盖层撤回 → 构建放行，但 `check:zh` 必须把 deals.json 里
 *                            残留的旧译文（unmanaged）计入漂移
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

/**
 * 读**产物**里的一份文件；读不到就报「构建没把产物交出来」，而不是让 `readFileSync` 抛裸 ENOENT。
 *
 * 为什么要有它（2026-10-16 的真实事故）：本演练好几个用例都是「先 run() 一次构建，再从 `dist/`
 * 回读产物」。构建**失败**时产物根本不会就位（构建是「装进暂存目录 → 自检全过 → 才就位」，
 * 见 build-local.js 末尾），于是裸 ENOENT 会把真正的原因埋掉 —— 采集链那四轮（run 55–58）的
 * 日志末尾就只剩一段 `Error: ENOENT: … dist/assets/data/offers.json` 的栈，而构建自己明明打印过
 * `✗ .chgnote 在产物里只有 3 次 < 下限 14`。**判据红的时候，第一个看见的人必须能直接读到原因。**
 * 调用点的 `record()` 会把构建的 ✗/❌ 行一并打出来，这里只保证错误信息指向「构建失败」这件事。
 */
function readProduct(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    throw new Error(`产物里没有 ${rel} —— 构建没有把产物交出来（构建失败时产物不会就位：`
      + '先看上面那次构建自己打印的 ✗/❌ 行，那才是原因）');
  }
  return fs.readFileSync(file, 'utf8');
}

/** 跑一次译文检查（zh-todo --check）：它不构建，只回答「有没有漂移 / 待译」；默认建议性 exit 0 */
function runCheck(extra = []) {
  const r = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts', 'tools', 'zh-todo.js'), '--check', ...extra],
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

  // ① 译文不是中文 → 该字段丢弃、回退英文原文，构建照发（译文层不阻塞发布）。
  //    断言两件事：构建 exit 0 且**产物里少掉这一个字段**——「回退英文」不能靠嘴说，
  //    字段数必须真的减 1；同时输出里必须留下「已回退英文原文」的告警。
  const bad = JSON.parse(original);
  bad.byId[ids[0]].description = 'This is still English.';
  write(bad);
  const r1 = run();
  const counted1 = /中文译文: \d+\/\d+ 条带中文译文（(\d+) 个字段）/.exec(r1.out);
  const expected1 = overlayFieldCount() - 1;
  record('译文不含汉字 → 丢弃该字段、回退英文，构建照发',
    r1.code === 0 && /译文不合规，已回退英文原文/.test(r1.out) &&
      counted1 && Number(counted1[1]) === expected1,
    r1.code === 0 ? `字段数 ${counted1 ? counted1[1] : '?'}（应为 ${expected1}）` : '构建失败（译文层不该阻塞发布）', r1);

  // ② 原文指纹对不上 → 构建通过，但该字段译文停用
  const stale = JSON.parse(original);
  stale.byId[onlyOne].src.description = 'This English no longer exists in deals.json.';
  write(stale);
  const r2 = run();
  const counted = /中文译文: \d+\/\d+ 条带中文译文（(\d+) 个字段）/.exec(r2.out);
  const expected = overlayFieldCount() - 1;
  record('原文已变 → 警告并停用该字段译文',
    r2.code === 0 && /原文已变，译文已停用/.test(r2.out) &&
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

  // ⑤ 同一份孤儿数据：构建放行（发布不该被卡），但检查必须把它标出来；
  //    默认建议性 exit 0，只有显式 --strict 才 exit 1（判据不能被悄悄弱化成「看不见」）。
  const r3b = runCheck();
  const r3bStrict = runCheck(['--strict']);
  record('译文对不上 id → check 标出漂移但不阻塞（--strict 才拦）',
    r3b.code === 0 && /漂移 1 处/.test(r3b.out) && /孤儿\s+\[deadbeef0000\]/.test(r3b.out) &&
      r3bStrict.code !== 0 && /--strict/.test(r3bStrict.out),
    r3b.code === 0
      ? (r3bStrict.code !== 0 ? '建议性已标出，--strict 已拦' : '建议性放行，但 --strict 竟然也放行（牙没了）')
      : '建议性竟然非零退出（会重新卡死发布）', r3b);

  // ④ 覆盖层删掉一条译文 → 产物里也必须消失
  const removed = JSON.parse(original);
  delete removed.byId[onlyOne].description;
  if (removed.byId[onlyOne].src) delete removed.byId[onlyOne].src.description;
  write(removed);
  const r4 = run();
  // t6：首页那份数据资源在产物里的路径本轮迁到 `assets/data/offers.json`
  //（仓库根的 `deals.json` 仍是数据真值，但**不再进产物**）。
  // ⚠️ 这里**必须继续读产物**、不能改读仓库根：这一条的语义是「覆盖层撤掉一条译文后，
  // **产物**里也必须消失」——读源文件就证明不了构建真的把译文拿掉了。
  // ⚠️ 产物读不到时**记录本用例失败并继续**，不许把整个自测崩掉：
  //    本演练是「构建真的会红吗」的取证工具，构建红了正是它最该跑完的时候 ——
  //    崩在中途会让后面六条用例一条都不出结果，而报告里只剩一段 ENOENT 栈。
  let distZh = null;
  let distZhError = '';
  try {
    distZh = JSON.parse(readProduct('dist/assets/data/offers.json'));
  } catch (error) {
    distZhError = error.message;
  }
  const stillThere = distZh
    ? distZh.deals.some(d => d.id === onlyOne && d.zh && d.zh.description)
    : false;
  record('覆盖层删掉译文 → 产物同步消失',
    r4.code === 0 && !stillThere,
    r4.code === 0 ? (stillThere ? '产物里还留着旧译文' : '产物已同步') : `构建失败（${distZhError || '产物未就位'}）`, r4);

  // ⑥ 整条译文从覆盖层撤回（deals.json 里还留着上次贴上的 zh）
  //    → 构建照旧放行（英文原文还在，发布不该被卡），但译文门禁必须报红。
  //    修复前这里会漏：覆盖层没覆盖的 id 走的是 lib/zh.js 的 unmanaged 分支
  //    （原样保留 deal.zh、不做指纹比对），而 check:zh 的漂移判据不算 unmanaged，
  //    于是「撤回一条译文」的结果是旧译文照发、门禁仍然 exit 0。
  const withdrawn = JSON.parse(original);
  delete withdrawn.byId[onlyOne];
  write(withdrawn);
  const r5 = run();
  // 同 ④ 的口径：读**产物**（`assets/data/offers.json`），不读仓库根。同 ④ 的失败处理。
  let unmanagedZh = false;
  let unmanagedError = '';
  try {
    unmanagedZh = JSON.parse(readProduct('dist/assets/data/offers.json'))
      .deals.some(d => d.id === onlyOne && d.zh && Object.keys(d.zh).length);
  } catch (error) {
    unmanagedError = error.message;
  }
  record('撤回整条译文 → 构建放行但产物里的旧译文被标为覆盖层管不到',
    r5.code === 0 && unmanagedZh && /不在覆盖层里/.test(r5.out),
    r5.code === 0
      ? (unmanagedZh ? '已按管不到告警' : '产物里没有旧译文（case ④ 的残留？）')
      : `构建失败（${unmanagedError || '产物未就位'}）`, r5);

  const r5b = runCheck();
  const r5bStrict = runCheck(['--strict']);
  record('撤回整条译文 → check 标出「管不到」但不阻塞（--strict 才拦）',
    r5b.code === 0 && /漂移 1 处/.test(r5b.out) && /管不到/.test(r5b.out) && !/译文与数据一致/.test(r5b.out) &&
      r5bStrict.code !== 0,
    r5b.code === 0
      ? (r5bStrict.code !== 0 ? '建议性已标出，--strict 已拦' : '建议性放行，但 --strict 竟然也放行（牙没了）')
      : '建议性竟然非零退出（会重新卡死发布）', r5);
} finally {
  fs.writeFileSync(FILE, original, 'utf8');
}

// 复原后再构建一次：确认演练没有把覆盖层改坏
const back = run();
const fields = overlayFieldCount();
const restored = back.code === 0 && new RegExp(`中文译文: \\d+/\\d+ 条带中文译文（${fields} 个字段）`).test(back.out);

/**
 * 复原后的复核：要求**漂移回到 0 且 exit 0**。
 *
 * 为什么不再看「有没有待译超期」：2026-11-08 起译文层是**建议性**的，待译/超期只报告、
 * 不影响退出码。但也不能只查 exit 0（那等于「什么都看不见」也是绿的）：
 * 「漂移 0 处」证明检测器仍然看得见脏数据，只是不拦发布。
 * 反过来说，复原后 exit 非 0 就说明建议性语义坏了（会重新卡死发布），这条同样会红。
 */
const backCheck = runCheck();
const driftZero = /漂移 0 处/.test(backCheck.out) && /✓ 漂移 0 处/.test(backCheck.out);
const checkClean = driftZero && backCheck.code === 0;

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

const runCheckOn = (file, grace, overlay, pending, extra = []) => {
  const args = [path.join(ROOT, 'scripts', 'tools', 'zh-todo.js'), '--check', `--file=${file}`, `--grace=${grace}`, ...extra];
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
  const rStaleStrict = runCheckOn(staleProbe, 7, emptyOverlay, null, ['--strict']);
  agingStale = {
    // 建议性：条目再陈年也只是报告，exit 0；「超期」必须被点名（不能静默）+ --strict 必须拦。
    pass: rStale.code === 0 && /待译 1 条/.test(rStale.out) && /最老 30 天/.test(rStale.out) &&
      /超期 1 条/.test(rStale.out) && rStaleStrict.code !== 0 && /超过 7 天宽限/.test(rStaleStrict.out),
    detail: rStale.code === 0
      ? (rStaleStrict.code !== 0 ? '陈年待译已标为超期且不阻塞，--strict 已拦' : '--strict 竟然放行（牙没了）')
      : '建议性竟然非零退出（会重新卡死发布）'
  };
  record('待译超过宽限期（30 天）→ check 标出超期但不阻塞（--strict 才拦）', agingStale.pass, agingStale.detail, rStale);

  makeProbeFile(freshProbe, shiftDays(0));
  const rFresh = runCheckOn(freshProbe, 7, emptyOverlay);
  agingFresh = {
    pass: rFresh.code === 0 && /待译 1 条/.test(rFresh.out) && /最老 0 天/.test(rFresh.out),
    detail: rFresh.code === 0 ? '建议性放行且待译条数可见' : '新条目被拦（会重新卡死发布）'
  };
  record('待译在宽限期内（今天新进）→ check 放行但必须写明待译条数', agingFresh.pass, agingFresh.detail, rFresh);

  /**
   * 年龄的**基准**必须是「进入待译那天」，不是 firstSeen。
   * 反例就是 2026-09-28 实测到的：上游改写了 Midjourney / Grok 的英文，两条老条目的译文失效
   * ——它们的 firstSeen 是 7 天前，用 firstSeen 计时等于「刚失效就超期」，第二天就被标成超期。
   *  · (a) firstSeen 30 天前 + 待译状态记的是今天 → **必须按 0 天算**（刚刚才进入待译）；
   *  · (b) firstSeen 今天     + 待译状态记的是 30 天前 → **必须按 30 天算**（义务从 30 天前就存在）。
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
  const rSinceBStrict = runCheckOn(freshProbe, 7, emptyOverlay, pendingProbe, ['--strict']);
  record('待译状态显示它已经等了 30 天 → 即便 firstSeen 是今天也要按 30 天算（--strict 拦下）',
    rSinceB.code === 0 && /最老 30 天/.test(rSinceB.out) && /超期 1 条/.test(rSinceB.out) &&
      rSinceBStrict.code !== 0 && /超过 7 天宽限/.test(rSinceBStrict.out),
    rSinceB.code === 0
      ? (rSinceBStrict.code !== 0 ? '已按进入待译的天数标为超期，--strict 已拦' : '--strict 竟然放行（待译状态被忽略）')
      : '建议性竟然非零退出', rSinceB);
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

console.log('\n=== 中文译文层演练（建议性：坏译文回退英文，不阻塞发布）===');
results.forEach(r => console.log(`  ${r.pass ? '✓' : '✗'} ${r.name} — ${r.detail}`));
console.log(`  ${restored ? '✓' : '✗'} 复原后构建回到 ${fields} 个译文字段`);
console.log(`  ${checkClean ? '✓' : '✗'} 复原后 check 漂移回到 0 且建议性 exit 0`);
const extra = [restored, checkClean];
const failed = results.filter(r => !r.pass).length + extra.filter(v => !v).length;
console.log(`\n${failed ? '❌' : '✅'} 演练 ${results.length + extra.length} 项，失败 ${failed} 项`);
if (failed && !checkClean) console.log(`  ↳ 复原后 check:zh 输出：${backCheck.out.split('\n').slice(0, 4).join(' | ')}`);
process.exit(failed ? 1 : 0);
