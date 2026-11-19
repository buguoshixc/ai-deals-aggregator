'use strict';
/**
 * page-fit 自测（issue #150 的结构性修复）。
 *
 * ## 为什么需要这个文件
 *
 * `page-fit.js` 只做一件事：把「数据契约允许的 150 字符标题」适配到「搜索结果允许的
 * 80 字符」，并在截断后做确定性消歧。它很容易被写成「看起来对」的样子：
 *
 *   · 少给后缀留位置 → 边界上仍然超 1 个字符；
 *   · 截断点劈开 emoji 的代理对 → 页面里出现 U+FFFD；
 *   · 消歧只看标题不看 id → 两条同前缀记录仍然撞 `title-unique`；
 *   · 只在单测里过、真实构建里不过 → 门禁绿而发布红。
 *
 * 所以这里有三层牙，每层都必须能**红**：
 *
 *   A. 单元牙：直接咬边界算术、留痕、幂等、代理对与消歧阶梯；
 *   B. 变异牙：在内存里把 `fitTitle` 改成恒等、把 `uniqueTitles` 改成普通适配，
 *      断言边界与碰撞真的会失守 —— 证明 A 的断言不是空转；
 *   C. 沙箱构建牙：复制一份真实仓库数据到临时目录，追加合成记录，跑完整的
 *      `build-local.js`（SEO 自检是构建的一部分），再跑 `seo-verify.js` 独立复核。
 *      数据集 0 是真实数据回归（0a2fc31c76cc 的 86 字符档案），1–10 是契约边界。
 *
 * 沙箱里改的是**副本**；仓库里的 `page-fit.js` 在整轮演练前后 SHA-256 必须一致。
 * 所有合成记录先过 `schema.validateDeal`（fail-closed），档案夹具先过
 * `archive.archiveDetailGate`，避免「测试绿了，因为夹具根本没进产物」。
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const LIB_FILE = path.join(ROOT, 'scripts', 'lib', 'page-fit.js');
const pageFit = require('../lib/page-fit');
const seo = require('../lib/seo');
const schema = require('../lib/schema');
const site = require('../lib/site');
const history = require('../lib/history');
const archive = require('../lib/archive');

/** 与 build-local 里逐字相同的两个后缀；长度本身就是契约，先在这里钉住。 */
const DEAL_SUFFIX = ` — 官方优惠与免费额度 | ${site.SITE_NAME}`;
const SITE_SUFFIX = ` · ${site.SITE_NAME}`;
const ARCHIVE_SUFFIX = `${SITE_SUFFIX}`;
const ARCHIVE_LABEL = ` · ${archive.ARCHIVE_HEADING}`;

const passed = [];
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed.push(name);
    console.log(`  ✓ ${name}${detail ? ` · ${detail}` : ''}`);
  } else {
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ` · ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

function throws(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function occurrencesOf(haystack, needle) {
  let count = 0;
  let index = 0;
  while ((index = haystack.indexOf(needle, index)) !== -1) {
    count += 1;
    index += needle.length;
  }
  return count;
}

const repeat = (char, count) => char.repeat(count);
const x = count => repeat('x', count);

// ─────────────────────────────────────────────────────────────────────────────
// A. 单元牙
// ─────────────────────────────────────────────────────────────────────────────

section('A1 标题 / 描述预算边界');

check(
  '后缀长度契约：deal 后缀 23、站点后缀 11',
  DEAL_SUFFIX.length === 23 && SITE_SUFFIX.length === 11,
  `deal=${DEAL_SUFFIX.length}, site=${SITE_SUFFIX.length}`
);
check('TITLE_MAX_LENGTH 单源为 80', seo.TITLE_MAX_LENGTH === 80, String(seo.TITLE_MAX_LENGTH));
check('DESC_MAX_LENGTH 单源为 150', pageFit.DESC_MAX_LENGTH === 150, String(pageFit.DESC_MAX_LENGTH));

const deal57 = x(57);
check('57 字符 deal 正文直通（57 + 23 = 80）', pageFit.fitTitle(deal57, DEAL_SUFFIX) === deal57);
const deal58 = pageFit.fitTitle(x(58), DEAL_SUFFIX);
check('58 字符 deal 正文截到 57 并留痕', deal58.length === 57 && deal58.endsWith('…'), deal58);
check('截断后最终标题恰为 80', deal58.length + DEAL_SUFFIX.length === 80, String(deal58.length + DEAL_SUFFIX.length));

const site69 = pageFit.fitTitle(x(69), SITE_SUFFIX);
const site70 = pageFit.fitTitle(x(70), SITE_SUFFIX);
check('站点后缀 69 直通、70 截到 69', site69.length === 69 && site70.length === 69 && site70.endsWith('…'));
check('站点后缀最终标题不超过 80', site69.length + SITE_SUFFIX.length === 80 && site70.length + SITE_SUFFIX.length === 80);

const archive62 = `${x(62)}${ARCHIVE_LABEL}`;
const archive63 = `${x(63)}${ARCHIVE_LABEL}`;
check('档案组合 62 + 7 = 69 直通', pageFit.fitTitle(archive62, ARCHIVE_SUFFIX) === archive62);
const fittedArchive63 = pageFit.fitTitle(archive63, ARCHIVE_SUFFIX);
check(
  '档案组合 63 + 7 = 70 截到 69 并留痕',
  fittedArchive63.length === 69 && fittedArchive63.endsWith('…'),
  fittedArchive63
);
check('档案组合最终标题恰为 80', fittedArchive63.length + ARCHIVE_SUFFIX.length === 80);

const desc150 = x(150);
const desc151 = pageFit.fitDescription(x(151));
check('描述 150 直通', pageFit.fitDescription(desc150) === desc150);
check('描述 151 截到 150 并留痕', desc151.length === 150 && desc151.endsWith('…'), String(desc151.length));

check('标题 reserve 参与预算（57 正文 + reserve 8 → 49）', pageFit.fitTitle(x(57), DEAL_SUFFIX, 8).length === 49);
check('描述 reserve 参与预算（150 正文 + reserve 12 → 138）', pageFit.fitDescription(x(150), 12).length === 138);
check('标题 reserve 负数抛错（fail-closed）', throws(() => pageFit.fitTitle('a', DEAL_SUFFIX, -1)));
check('标题 reserve 非整数抛错', throws(() => pageFit.fitTitle('a', DEAL_SUFFIX, 1.5)));
check('后缀吃掉全部预算时抛错', throws(() => pageFit.fitTitle('a', x(80))));
check('描述预算小于 1 时抛错', throws(() => pageFit.fitDescription('a', 151)));

section('A2 留痕、幂等与 Unicode');

const spaced = `${x(55)} bcd`;
const trimmed = pageFit.fitTitle(spaced, DEAL_SUFFIX);
check(
  '切点落在空白时 trimEnd 收掉（不出现「词尾空格 + …」）',
  trimmed === `${x(55)}…` && !trimmed.includes(' …'),
  trimmed
);
const once = pageFit.fitTitle(x(88), DEAL_SUFFIX);
check(
  '二次适配对截断结果幂等',
  pageFit.fitTitle(once, DEAL_SUFFIX) === once,
  `${once.length} → ${pageFit.fitTitle(once, DEAL_SUFFIX).length}`
);
check('短串不带省略号（只有截断才留痕）', pageFit.fitTitle('短标题', DEAL_SUFFIX) === '短标题');

const surrogateAtCut = `${repeat('汉', 55)}😀${repeat('字', 10)}`;
const fittedSurrogate = pageFit.fitTitle(surrogateAtCut, DEAL_SUFFIX);
check(
  '切点劈开代理对时少切一个码元（不产出 U+FFFD）',
  fittedSurrogate.length === 56 && !fittedSurrogate.includes('\uFFFD') && fittedSurrogate.endsWith('…'),
  `${fittedSurrogate.length} 字符`
);
check(
  '代理对没有被留下半个（无孤立高位代理）',
  !/[\uD800-\uDBFF]$/.test(fittedSurrogate) && !/[\uDC00-\uDFFF]/.test(fittedSurrogate)
);

section('A3 集合消歧（唯一性、确定性与阶梯）');

const raw150 = repeat('标', 150);
const pairEntries = [
  ['k2', raw150, 'bbbbbb222222', 'deal'],
  ['k1', raw150, 'aaaaaa111111', 'deal']
];
const pair = pageFit.uniqueTitles(pairEntries, SITE_SUFFIX);
const pairA = pair.get('k1');
const pairB = pair.get('k2');
check(
  '两条相同 150 字符 raw 适配后互不相同',
  Boolean(pairA) && Boolean(pairB) && pairA !== pairB
);
check('消歧后仍 ≤69 正文（+11 = 80）', pairA.length <= 69 && pairB.length <= 69, `${pairA.length}/${pairB.length}`);
check(
  '各自带对称 id 标签（id 前 6 位）',
  pairA.includes('（aaaaaa）') && pairB.includes('（bbbbbb）'),
  `${pairA.slice(-12)} / ${pairB.slice(-12)}`
);

const pairAgain = pageFit.uniqueTitles(pairEntries, SITE_SUFFIX);
check(
  '同输入两次得到相同 Map',
  pairAgain.get('k1') === pairA && pairAgain.get('k2') === pairB
);
const pairReversed = pageFit.uniqueTitles([...pairEntries].reverse(), SITE_SUFFIX);
check(
  '输入顺序反转不改变结果（按 key 排序）',
  pairReversed.get('k1') === pairA && pairReversed.get('k2') === pairB
);

const third = pageFit.uniqueTitles(
  [...pairEntries, ['k3', repeat('独', 150), 'cccccc333333', 'deal']],
  SITE_SUFFIX
);
check(
  '新增第三条不改变既有两条的标签',
  third.get('k1') === pairA && third.get('k2') === pairB
);

const samePrefix = pageFit.uniqueTitles(
  [
    ['p1', raw150, 'dddddd111111', 'deal'],
    ['p2', raw150, 'dddddd222222', 'deal']
  ],
  SITE_SUFFIX
);
check(
  '前 6 位相同的 id 会升到第二阶全 12 位',
  samePrefix.get('p1').includes('（dddddd111111）') && samePrefix.get('p2').includes('（dddddd222222）'),
  `${samePrefix.get('p1').slice(-16)} / ${samePrefix.get('p2').slice(-16)}`
);

const crossKind = pageFit.uniqueTitles(
  [
    ['deal-key', raw150, 'eeeeee123456', 'deal'],
    ['plan-key', raw150, 'eeeeee123456', 'plan']
  ],
  SITE_SUFFIX
);
check(
  '跨 kind 复用同一个 id 时升到第三阶（kind·id）',
  crossKind.get('deal-key').includes('（deal·eeeeee123456）')
    && crossKind.get('plan-key').includes('（plan·eeeeee123456）')
);

const descRaw = repeat('述', 220);
const descPair = pageFit.uniqueDescriptions([
  ['d1', descRaw, 'aaaaaa111111', 'deal'],
  ['d2', descRaw, 'bbbbbb222222', 'deal']
]);
check(
  '两条相同描述适配后互不相同且 ≤150',
  descPair.get('d1') !== descPair.get('d2')
    && descPair.get('d1').length <= 150
    && descPair.get('d2').length <= 150
);
check(
  '描述消歧同样带 id 标签',
  descPair.get('d1').includes('（aaaaaa）') && descPair.get('d2').includes('（bbbbbb）')
);

check(
  '标签阶梯耗尽时 fail-closed（同 id 同 kind 无法区分）',
  throws(() => pageFit.uniqueTitles(
    [
      ['a', raw150, 'ffffffffffff', 'deal'],
      ['b', raw150, 'ffffffffffff', 'deal']
    ],
    SITE_SUFFIX
  ))
);
check('重复 key 抛错', throws(() => pageFit.uniqueTitles([['a', 'x'], ['a', 'y']], SITE_SUFFIX)));
check(
  '空 id 抛错（拒绝静默产出不可区分的标签）',
  throws(() => pageFit.uniqueTitles(
    [
      ['a', raw150, '', 'deal'],
      ['b', raw150, '', 'deal']
    ],
    SITE_SUFFIX
  ))
);

// ─────────────────────────────────────────────────────────────────────────────
// A4. 内存变异牙：证明上面的断言不是空转
// ─────────────────────────────────────────────────────────────────────────────

section('A4 内存变异牙（断言有牙）');

const SRC = fs.readFileSync(LIB_FILE, 'utf8');
const SRC_SHA = sha256(SRC);
const FIT_ANCHOR = 'function fitTitle(raw, suffix, reserve = 0) {';
const UNIQUE_ANCHOR = "  return disambiguate(entries, fitted, (entry, reserve) => fitTitle(entry.raw, suffix, reserve), 'uniqueTitles');";

check('变异锚点 fitTitle 唯一', occurrencesOf(SRC, FIT_ANCHOR) === 1);
check('变异锚点 uniqueTitles 唯一', occurrencesOf(SRC, UNIQUE_ANCHOR) === 1);

function localRequire(fromDir, request) {
  if (!request.startsWith('.')) return require(request);
  return require(path.resolve(fromDir, request));
}

function loadVariant(source) {
  const module = { exports: {} };
  const fn = new Function('module', 'exports', 'require', '__filename', '__dirname', source);
  fn(
    module,
    module.exports,
    request => localRequire(path.join(ROOT, 'scripts', 'lib'), request),
    LIB_FILE,
    path.dirname(LIB_FILE)
  );
  return module.exports;
}

const identityVariant = loadVariant(
  SRC.replace(FIT_ANCHOR, `${FIT_ANCHOR}\n  return String(raw == null ? '' : raw);`)
);
const badBoundary = identityVariant.fitTitle(x(58), DEAL_SUFFIX);
check(
  '把 fitTitle 改成恒等 → 58 字符边界失守（证明 A1 有牙）',
  badBoundary.length === 58 && !badBoundary.endsWith('…'),
  String(badBoundary.length)
);

const plainVariant = loadVariant(
  SRC.replace(
    UNIQUE_ANCHOR,
    '  return new Map(entries.map((entry, index) => [entry.key, fitted[index]]));'
  )
);
const plainCollision = plainVariant.uniqueTitles(pairEntries, SITE_SUFFIX);
check(
  '把 uniqueTitles 改成普通适配 → 撞车复现（证明 A3 有牙）',
  plainCollision.get('k1') === plainCollision.get('k2')
);
check('内存变异演练后仓库 page-fit.js 未变（SHA-256）', sha256(fs.readFileSync(LIB_FILE, 'utf8')) === SRC_SHA);

// ─────────────────────────────────────────────────────────────────────────────
// B. 契约驱动的沙箱构建
// ─────────────────────────────────────────────────────────────────────────────

section('B 沙箱构建（真实数据 + 合成契约记录）');

const ROOT_FILES = [
  'index.html',
  'favicon.svg',
  'robots.txt',
  '.nojekyll',
  'BingSiteAuth.xml',
  'deals.json',
  'plans.json',
  'api-plans.json',
  'models.json',
  'model-registry-links.json',
  'codex-resets.json',
  'package.json'
];

const realDeals = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
const realDealIds = new Set((realDeals.deals || []).map(deal => deal.id));
const realPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
const realPlanIds = new Set((realPlans.plans || []).map(plan => plan.planId));
const sandboxes = [];

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'page-fit-selftest-'));
  for (const file of ROOT_FILES) {
    fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
  fs.cpSync(path.join(ROOT, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'assets'), path.join(dir, 'assets'), { recursive: true });
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  sandboxes.push(dir);
  return dir;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function redLines(result) {
  return `${result.stdout || ''}\n${result.stderr || ''}`
    .split('\n')
    .filter(line => /^\s*(✗|❌)/.test(line));
}

function tail(text, limit = 1200) {
  const value = String(text || '').trim();
  return value.length > limit ? `…${value.slice(-limit)}` : value;
}

function runNode(dir, args, timeout = 180000) {
  return spawnSync(process.execPath, args, {
    cwd: dir,
    encoding: 'utf8',
    timeout,
    maxBuffer: 32 * 1024 * 1024
  });
}

function runBuild(dir) {
  const result = runNode(dir, ['scripts/tools/build-local.js', '--out=dist']);
  const red = redLines(result);
  return {
    result,
    red,
    ok: result.status === 0 && red.length === 0
  };
}

function runSeoVerify(dir) {
  const result = runNode(dir, ['scripts/tools/seo-verify.js', `--dir=${path.join(dir, 'dist')}`]);
  const red = redLines(result);
  return {
    result,
    red,
    ok: result.status === 0 && red.length === 0
  };
}

function pageHtml(dir, route) {
  return fs.readFileSync(path.join(dir, 'dist', route, 'index.html'), 'utf8');
}

function titleOfPage(dir, route) {
  return seo.titleOf(pageHtml(dir, route));
}

function descriptionOfPage(dir, route) {
  return seo.descriptionOf(pageHtml(dir, route));
}

// ── 合成记录：先过 validateDeal，再进沙箱 ──────────────────────────────────

const usedSyntheticIds = new Set();
let syntheticSeq = 0;

function ensureFreshId(id) {
  if (!/^[0-9a-f]{12}$/.test(id)) throw new Error(`自测 id 必须是 12 位 hex：${id}`);
  if (realDealIds.has(id) || realPlanIds.has(id) || usedSyntheticIds.has(id)) {
    throw new Error(`自测 id 与真实数据 / 已用 id 冲突：${id}`);
  }
  usedSyntheticIds.add(id);
  return id;
}

function makeSynthetic(overrides = {}) {
  syntheticSeq += 1;
  const raw = {
    title: '自测优惠',
    url: `https://example.com/page-fit-selftest/${syntheticSeq}`,
    vendor: '自测厂商',
    discountInfo: '限时 5 折优惠',
    region: 'global',
    category: '编程开发',
    pricingModel: 'freemium',
    priceLine: '¥0 起',
    features: ['免费额度'],
    description: '用于页面预算自测的合法记录。',
    firstSeen: '2026-09-01',
    lastSeen: '2026-09-02',
    verified: false,
    ...overrides
  };
  const deal = schema.makeDeal(raw, { trustType: true });
  const validation = schema.validateDeal(deal, 0);
  if (!validation.ok) {
    throw new Error(`合成记录未过 validateDeal：${validation.errors.join('；')}\n${JSON.stringify(deal)}`);
  }
  return deal;
}

function endedEvent(id, title, vendor, extra = {}) {
  return {
    id,
    at: '2026-09-02',
    type: 'ended',
    reason: 'source_no_longer_lists',
    label: { title, vendor },
    ...extra
  };
}

function applyFixture(dir, fixture) {
  if (fixture.real) return;
  const dealsFile = path.join(dir, 'deals.json');
  const dealsDoc = readJson(dealsFile);
  const historyFile = path.join(dir, 'scripts/data/deal-history.json');
  const historyDoc = readJson(historyFile);

  dealsDoc.deals.push(...(fixture.deals || []));
  dealsDoc.count = dealsDoc.deals.length;
  writeJson(dealsFile, dealsDoc);

  for (const deal of fixture.deals || []) {
    // 只写 title/type/category 不够：产物自检会逐字段重放 tracked fields，
    // 合成记录必须在真实日志里有一份与当前值完全一致的历史锚点。
    Object.assign(historyDoc.baseline.fields, history.baselineOf([deal], { at: '2026-09-01' }).fields);
  }
  historyDoc.events.push(...(fixture.dealEvents || []));
  writeJson(historyFile, historyDoc);

  if (fixture.planEvents && fixture.planEvents.length) {
    const planFile = path.join(dir, 'scripts/data/plan-history.json');
    const planDoc = readJson(planFile);
    planDoc.events.push(...fixture.planEvents);
    writeJson(planFile, planDoc);
  }
}

function assertArchiveGate(dir, kind, id) {
  const storeFile = kind === 'deal'
    ? path.join(dir, 'scripts/data/deal-history.json')
    : kind === 'plan'
      ? path.join(dir, 'scripts/data/plan-history.json')
      : path.join(dir, 'scripts/data/api-plan-history.json');
  const store = readJson(storeFile);
  const records = kind === 'deal'
    ? readJson(path.join(dir, 'deals.json')).deals
    : kind === 'plan'
      ? readJson(path.join(dir, 'plans.json')).plans
      : readJson(path.join(dir, 'api-plans.json')).plans;
  const built = archive.buildArchive({
    kind,
    baseline: store.baseline,
    events: store.events,
    records,
    asOf: '2026-11-19'
  });
  const entry = (built.entries || []).find(item => item.id === id);
  const gate = entry ? archive.archiveDetailGate(entry) : null;
  if (!gate || !gate.ok) {
    throw new Error(
      `档案夹具未过 archiveDetailGate：${kind}/${id}`
      + `（${gate && gate.reasons ? gate.reasons.join('；') : '没有生成档案条目'}）`
    );
  }
  return gate;
}

function assertBuildAndSeo(dir, label, seoVerify) {
  const build = runBuild(dir);
  check(`${label}：构建 exit 0`, build.result.status === 0, `status=${build.result.status}`);
  check(`${label}：构建输出无 ✗/❌`, build.ok, build.red[0] || tail(build.result.stderr));
  if (!build.ok) {
    console.log(tail(build.result.stdout));
    if (build.result.stderr) console.log(tail(build.result.stderr));
    return false;
  }
  if (seoVerify) {
    const verify = runSeoVerify(dir);
    check(`${label}：seo-verify exit 0`, verify.result.status === 0, `status=${verify.result.status}`);
    check(`${label}：seo-verify 无 ✗/❌`, verify.ok, verify.red[0] || tail(verify.result.stderr));
    if (!verify.ok) return false;
  }
  return true;
}

function dataset0() {
  const label = '数据集 0 · 真实数据回归（0a2fc31c76cc）';
  const dir = makeSandbox();
  if (!assertBuildAndSeo(dir, label, true)) return;
  const route = 'archive/deal/0a2fc31c76cc/';
  const file = path.join(dir, 'dist', route, 'index.html');
  check(`${label}：86 字符档案页存在`, fs.existsSync(file), route);
  if (!fs.existsSync(file)) return;
  const title = titleOfPage(dir, route);
  check(`${label}：标题 ≤80`, title.length <= 80, `${title.length} 字符`);
  check(`${label}：截断留痕`, title.includes('…'), title);
}

function dataset1() {
  const label = '数据集 1 · deal 150 字符标题 + 60 字符厂商';
  const id = ensureFreshId('a1b2c3d4e501');
  const title = repeat('长', 150);
  const deal = makeSynthetic({ id, title, vendor: repeat('厂', 60) });
  const dir = makeSandbox();
  applyFixture(dir, { deals: [deal] });
  if (!assertBuildAndSeo(dir, label, true)) return;
  const pageTitle = titleOfPage(dir, `deal/${id}/`);
  check(`${label}：标题恰为 80`, pageTitle.length === 80, `${pageTitle.length} 字符`);
  check(`${label}：截断留痕`, pageTitle.endsWith(`…${DEAL_SUFFIX}`), pageTitle);
}

function dataset2() {
  const label = '数据集 2 · free_model 前缀把 52/53 顶到 57/58';
  const id1 = ensureFreshId('a2b2c3d4e502');
  const id2 = ensureFreshId('a3b2c3d4e503');
  const t52 = `免额${repeat('标', 50)}`;
  const t53 = `免额${repeat('标', 51)}`;
  const deal1 = makeSynthetic({ id: id1, title: t52, benefitType: ['free_model'] });
  const deal2 = makeSynthetic({ id: id2, title: t53, benefitType: ['free_model'] });
  const dir = makeSandbox();
  applyFixture(dir, { deals: [deal1, deal2] });
  if (!assertBuildAndSeo(dir, label, false)) return;
  const title1 = titleOfPage(dir, `deal/${id1}/`);
  const title2 = titleOfPage(dir, `deal/${id2}/`);
  check(
    `${label}：52 + 前缀 5 = 57 直通、无省略号`,
    title1 === `免费模型：${t52}${DEAL_SUFFIX}` && title1.length === 80,
    title1
  );
  check(
    `${label}：53 + 前缀 5 = 58 截断留痕`,
    title2.length === 80 && title2.endsWith(`…${DEAL_SUFFIX}`),
    title2
  );
}

function dataset3() {
  const label = '数据集 3 · ended 档案墓碑 150 字符';
  const id = ensureFreshId('a4b2c3d4e504');
  const title = repeat('墓', 150);
  const deal = makeSynthetic({ id, title });
  const dir = makeSandbox();
  applyFixture(dir, { deals: [deal], dealEvents: [endedEvent(id, title, deal.vendor)] });
  const gate = assertArchiveGate(dir, 'deal', id);
  check(`${label}：档案夹具过 archiveDetailGate`, Boolean(gate.ok));
  if (!assertBuildAndSeo(dir, label, false)) return;
  const route = `archive/deal/${id}/`;
  const pageTitle = titleOfPage(dir, route);
  check(`${label}：档案标题 ≤80`, pageTitle.length <= 80, `${pageTitle.length} 字符`);
  check(`${label}：正文保留完整墓碑标题`, pageHtml(dir, route).includes(title));
}

function dataset4() {
  const label = '数据集 4 · 两条同 150 标题的 ended 档案';
  const id1 = ensureFreshId('a11a11a11111');
  const id2 = ensureFreshId('b22b22b22222');
  const title = repeat('同', 150);
  // 两条标题逐字相同会让首页折叠键相同；`models` 去重后卡片覆盖数会少 1，
  // 触发构建的「折叠丢失条目」断言（那是独立于 page-fit 的诚实性门禁）。
  // 用不同的 validity 把它们分到两个折叠组，标题仍然逐字相同 —— 页面预算的碰撞照测。
  const deal1 = makeSynthetic({ id: id1, title, validity: '长期有效' });
  const deal2 = makeSynthetic({ id: id2, title, validity: '限时有效' });
  const dir = makeSandbox();
  applyFixture(dir, {
    deals: [deal1, deal2],
    dealEvents: [endedEvent(id1, title, deal1.vendor), endedEvent(id2, title, deal2.vendor)]
  });
  const gate1 = assertArchiveGate(dir, 'deal', id1);
  const gate2 = assertArchiveGate(dir, 'deal', id2);
  check(`${label}：两条档案夹具都过 archiveDetailGate`, Boolean(gate1.ok && gate2.ok));
  if (!assertBuildAndSeo(dir, label, true)) return;

  const dealTitle1 = titleOfPage(dir, `deal/${id1}/`);
  const dealTitle2 = titleOfPage(dir, `deal/${id2}/`);
  check(`${label}：两个 deal 标题互异`, dealTitle1 !== dealTitle2);
  check(
    `${label}：两个 deal 标题各带 id`,
    dealTitle1.includes(id1.slice(0, 6)) && dealTitle2.includes(id2.slice(0, 6))
  );
  const archiveTitle1 = titleOfPage(dir, `archive/deal/${id1}/`);
  const archiveTitle2 = titleOfPage(dir, `archive/deal/${id2}/`);
  check(`${label}：两个档案标题互异`, archiveTitle1 !== archiveTitle2);
  check(
    `${label}：两个档案标题各带 id`,
    archiveTitle1.includes(id1.slice(0, 6)) && archiveTitle2.includes(id2.slice(0, 6))
  );
  const desc1 = descriptionOfPage(dir, `deal/${id1}/`);
  const desc2 = descriptionOfPage(dir, `deal/${id2}/`);
  check(`${label}：两个 meta description 互异`, desc1 !== desc2 && desc1.length <= 150 && desc2.length <= 150);
  const archiveDesc1 = descriptionOfPage(dir, `archive/deal/${id1}/`);
  const archiveDesc2 = descriptionOfPage(dir, `archive/deal/${id2}/`);
  check(`${label}：两个档案 meta description 互异`, archiveDesc1 !== archiveDesc2);
}

function dataset5() {
  const label = '数据集 5 · 档案标题 62/63（组合预算 69）';
  const id1 = ensureFreshId('a5b2c3d4e505');
  const id2 = ensureFreshId('a6b2c3d4e506');
  const title62 = repeat('界', 62);
  const title63 = `${repeat('界', 62)}甲`;
  const deal1 = makeSynthetic({ id: id1, title: title62 });
  const deal2 = makeSynthetic({ id: id2, title: title63 });
  const dir = makeSandbox();
  applyFixture(dir, {
    deals: [deal1, deal2],
    dealEvents: [endedEvent(id1, title62, deal1.vendor), endedEvent(id2, title63, deal2.vendor)]
  });
  const gate1 = assertArchiveGate(dir, 'deal', id1);
  const gate2 = assertArchiveGate(dir, 'deal', id2);
  check(`${label}：两条档案夹具都过 archiveDetailGate`, Boolean(gate1.ok && gate2.ok));
  if (!assertBuildAndSeo(dir, label, false)) return;
  const titleA = titleOfPage(dir, `archive/deal/${id1}/`);
  const titleB = titleOfPage(dir, `archive/deal/${id2}/`);
  check(`${label}：62 + 7 = 69 直通、无省略号`, titleA.length === 80 && !titleA.includes('…'), titleA);
  check(`${label}：63 + 7 = 70 截断留痕`, titleB.length === 80 && titleB.includes('…'), titleB);
  check(`${label}：正文保留完整 62/63 字符标题`, pageHtml(dir, `archive/deal/${id1}/`).includes(title62)
    && pageHtml(dir, `archive/deal/${id2}/`).includes(title63));
}

function dataset6() {
  const label = '数据集 6 · 可选字段全空（deal / tool 两态）';
  const dealId = ensureFreshId('a7b2c3d4e507');
  const toolId = ensureFreshId('a8b2c3d4e508');
  const deal = makeSynthetic({
    id: dealId,
    title: '极简优惠',
    vendor: null,
    pricingModel: null,
    priceLine: null,
    features: null,
    // description 不是「可选空」：详情页的来源行 `.ddesc` 由它渲染，residue 关系式
    // 要求每张详情页恰好一条。这里保留最小非空说明，其余可选字段才真的为空。
    description: '极简优惠的说明。'
  });
  const tool = makeSynthetic({
    id: toolId,
    title: '极简工具',
    type: 'tool',
    vendor: null,
    discountInfo: null,
    pricingModel: null,
    priceLine: null,
    features: null,
    description: null
  });
  const dir = makeSandbox();
  applyFixture(dir, { deals: [deal, tool] });
  if (!assertBuildAndSeo(dir, label, false)) return;
  check(`${label}：最小 deal 详情页存在`, fs.existsSync(path.join(dir, 'dist', `deal/${dealId}/index.html`)));
  const offers = readJson(path.join(dir, 'dist', 'assets/data/offers.json'));
  const savedTool = (offers.deals || []).find(item => item.id === toolId);
  check(`${label}：offers.json 含最小 tool`, Boolean(savedTool) && savedTool.type === 'tool');
  check(`${label}：最小 tool 没有 discountInfo`, Boolean(savedTool) && !savedTool.discountInfo);
}

function dataset7() {
  const label = '数据集 7 · features/excerpt/priceLine/description 全取上限';
  const id = ensureFreshId('a9b2c3d4e509');
  const features = [repeat('特', 20), repeat('征', 20), repeat('标', 20)];
  const excerpt = repeat('引', 240);
  const priceLine = repeat('价', 60);
  const description = repeat('述', 600);
  const deal = makeSynthetic({ id, title: '极值优惠', features, excerpt, priceLine, description });
  const dir = makeSandbox();
  applyFixture(dir, { deals: [deal] });
  if (!assertBuildAndSeo(dir, label, false)) return;
  const offers = readJson(path.join(dir, 'dist', 'assets/data/offers.json'));
  const saved = (offers.deals || []).find(item => item.id === id);
  check(`${label}：offers.json 保留该记录`, Boolean(saved));
  check(
    `${label}：features 3×20 未被削短`,
    Boolean(saved) && saved.features.length === 3 && saved.features.every(item => item.length === 20)
  );
  check(`${label}：excerpt 240 未被削短`, Boolean(saved) && saved.excerpt.length === 240);
  check(`${label}：priceLine 60 未被削短`, Boolean(saved) && saved.priceLine.length === 60);
  check(`${label}：description 600 未被削短`, Boolean(saved) && saved.description.length === 600);
  check(`${label}：标题仍 ≤80`, titleOfPage(dir, `deal/${id}/`).length <= 80);
}

function dataset8() {
  const label = '数据集 8 · Unicode / emoji / 零宽 / 切点';
  const cutId = ensureFreshId('aab2c3d4e510');
  const mixedId = ensureFreshId('abb2c3d4e511');
  const cutTitle = `${repeat('汉', 55)}😀${repeat('字', 20)}\u200b`;
  const mixedTitle = `${repeat('汉', 10)}𠀀😀e\u0301\u200b${repeat('字', 5)}`;
  const cutDeal = makeSynthetic({ id: cutId, title: cutTitle });
  const mixedDeal = makeSynthetic({ id: mixedId, title: mixedTitle });
  const dir = makeSandbox();
  applyFixture(dir, { deals: [cutDeal, mixedDeal] });
  if (!assertBuildAndSeo(dir, label, false)) return;
  const cutPageTitle = titleOfPage(dir, `deal/${cutId}/`);
  check(
    `${label}：切点标题无 U+FFFD 且留痕`,
    !cutPageTitle.includes('\uFFFD') && cutPageTitle.endsWith(`…${DEAL_SUFFIX}`),
    cutPageTitle
  );
  check(`${label}：切点标题 ≤80`, cutPageTitle.length <= 80, `${cutPageTitle.length} 字符`);
  check(`${label}：零宽字符被 cleanText 去掉`, !mixedDeal.title.includes('\u200b'));
  check(
    `${label}：混合 Unicode 短标题保留扩展字符与组合符`,
    mixedDeal.title.includes('𠀀') && mixedDeal.title.includes('\u0301') && mixedDeal.title.includes('😀'),
    mixedDeal.title
  );
  const mixedPageTitle = titleOfPage(dir, `deal/${mixedId}/`);
  check(
    `${label}：混合标题直通、无替换字符`,
    mixedPageTitle.startsWith(mixedDeal.title) && !mixedPageTitle.includes('\uFFFD')
  );
}

function dataset9() {
  const label = '数据集 9 · 两条 deal 共享 80 字符前缀且 id 共享前 6 位';
  const id1 = ensureFreshId('c33c33c11111');
  const id2 = ensureFreshId('c33c33c22222');
  const prefix = repeat('共', 80);
  const deal1 = makeSynthetic({ id: id1, title: `${prefix}${repeat('甲', 70)}` });
  const deal2 = makeSynthetic({ id: id2, title: `${prefix}${repeat('乙', 70)}` });
  const dir = makeSandbox();
  applyFixture(dir, { deals: [deal1, deal2] });
  if (!assertBuildAndSeo(dir, label, true)) return;
  const title1 = titleOfPage(dir, `deal/${id1}/`);
  const title2 = titleOfPage(dir, `deal/${id2}/`);
  check(`${label}：两个标题互异`, title1 !== title2);
  check(`${label}：两个标题都 ≤80`, title1.length <= 80 && title2.length <= 80);
  check(
    `${label}：前 6 位撞车后升到全 id`,
    title1.includes(`（${id1}）`) && title2.includes(`（${id2}）`),
    `${title1.slice(-20)} / ${title2.slice(-20)}`
  );
}

function dataset10() {
  const label = '数据集 10 · 跨 kind 复用同一个 id 与标题';
  const id = ensureFreshId('d44d44d00010');
  const title = repeat('跨', 150);
  const deal = makeSynthetic({ id, title });
  const dir = makeSandbox();
  applyFixture(dir, {
    deals: [deal],
    dealEvents: [endedEvent(id, title, deal.vendor)],
    planEvents: [{
      planId: id,
      // 与 deal 事件同一天会让 feed 的 eventKey（含 at）算出同一个条目 id，
      // 触发与 page-fit 无关的「订阅条目身份碰撞」。错开一天，档案标题碰撞照测。
      at: '2026-10-06',
      type: 'ended',
      reason: 'source_no_longer_lists',
      label: { title, vendor: '套餐厂商' }
    }]
  });
  const dealGate = assertArchiveGate(dir, 'deal', id);
  const planGate = assertArchiveGate(dir, 'plan', id);
  check(`${label}：deal / plan 档案夹具都过 archiveDetailGate`, Boolean(dealGate.ok && planGate.ok));
  if (!assertBuildAndSeo(dir, label, false)) return;
  const dealTitle = titleOfPage(dir, `archive/deal/${id}/`);
  const planTitle = titleOfPage(dir, `archive/plan/${id}/`);
  check(`${label}：两个档案页都存在`, Boolean(dealTitle) && Boolean(planTitle));
  check(`${label}：两个标题互异`, dealTitle !== planTitle);
  check(`${label}：deal 标题含（deal·id）`, dealTitle.includes(`（deal·${id}）`), dealTitle);
  check(`${label}：plan 标题含（plan·id）`, planTitle.includes(`（plan·${id}）`), planTitle);
  check(`${label}：两个标题都 ≤80`, dealTitle.length <= 80 && planTitle.length <= 80);
}

// ── 沙箱副本可证伪牙：改副本，断言真实构建会红 ─────────────────────────────

function sandboxMutationTeeth() {
  const label = '沙箱变异牙 · fitTitle → 恒等';
  const identityId = ensureFreshId('e55e55e00001');
  const identityDeal = makeSynthetic({ id: identityId, title: repeat('长', 150), vendor: repeat('厂', 60) });
  const identityDir = makeSandbox();
  applyFixture(identityDir, { deals: [identityDeal] });
  const identityFile = path.join(identityDir, 'scripts/lib/page-fit.js');
  const identitySrc = fs.readFileSync(identityFile, 'utf8');
  fs.writeFileSync(
    identityFile,
    identitySrc.replace(FIT_ANCHOR, `${FIT_ANCHOR}\n  return String(raw == null ? '' : raw);`)
  );
  const identityBuild = runBuild(identityDir);
  check(
    `${label}：数据集 1 必须红 title-length`,
    identityBuild.result.status !== 0 && /title-length/.test(`${identityBuild.result.stdout}${identityBuild.result.stderr}`),
    identityBuild.red[0] || `status=${identityBuild.result.status}`
  );

  const collisionLabel = '沙箱变异牙 · uniqueTitles → 普通适配';
  const collisionId1 = ensureFreshId('e55e55e00002');
  const collisionId2 = ensureFreshId('e66e66e00003');
  const collisionTitle = repeat('同', 150);
  const collisionDeal1 = makeSynthetic({ id: collisionId1, title: collisionTitle, validity: '长期有效' });
  const collisionDeal2 = makeSynthetic({ id: collisionId2, title: collisionTitle, validity: '限时有效' });
  const collisionDir = makeSandbox();
  applyFixture(collisionDir, {
    deals: [collisionDeal1, collisionDeal2],
    dealEvents: [
      endedEvent(collisionId1, collisionTitle, collisionDeal1.vendor),
      endedEvent(collisionId2, collisionTitle, collisionDeal2.vendor)
    ]
  });
  const collisionFile = path.join(collisionDir, 'scripts/lib/page-fit.js');
  const collisionSrc = fs.readFileSync(collisionFile, 'utf8');
  fs.writeFileSync(
    collisionFile,
    collisionSrc.replace(
      UNIQUE_ANCHOR,
      '  return new Map(entries.map((entry, index) => [entry.key, fitted[index]]));'
    )
  );
  const collisionBuild = runBuild(collisionDir);
  check(
    `${collisionLabel}：数据集 4 必须红 title-unique`,
    collisionBuild.result.status !== 0 && /title-unique/.test(`${collisionBuild.result.stdout}${collisionBuild.result.stderr}`),
    collisionBuild.red[0] || `status=${collisionBuild.result.status}`
  );
}

const DATASETS = [dataset0, dataset1, dataset2, dataset3, dataset4, dataset5, dataset6, dataset7, dataset8, dataset9, dataset10];

try {
  for (const dataset of DATASETS) {
    try {
      dataset();
    } catch (error) {
      check(`${dataset.name}：测试自身不抛错`, false, error && error.message ? error.message : String(error));
    }
  }
  try {
    sandboxMutationTeeth();
  } catch (error) {
    check('沙箱变异牙：测试自身不抛错', false, error && error.message ? error.message : String(error));
  }
} finally {
  for (const dir of sandboxes) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    } catch (error) {
      console.log(`  ⚠ 清理沙箱失败：${dir}（${error.message}）`);
    }
  }
}

check('整轮演练后仓库 page-fit.js SHA-256 未变', sha256(fs.readFileSync(LIB_FILE, 'utf8')) === SRC_SHA);

console.log(`\npage-fit 自测：${passed.length} 通过，${failures.length} 失败`);
if (failures.length) {
  for (const failure of failures) {
    console.log(`  ✗ ${failure.name}${failure.detail ? ` · ${failure.detail}` : ''}`);
  }
  process.exit(1);
}
