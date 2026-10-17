#!/usr/bin/env node
'use strict';
/**
 * IndexNow 自测（v3.3）—— 「主动通知搜索引擎」这一层赖以成立的全部承诺，逐条演练。
 *
 * ## 它守什么（每一条红的时候都没有别的步骤会替它红）
 *
 *   ① **协议约束**：密钥的 8–128 位 `[A-Za-z0-9-]`、`<key>.txt` 的命名、密钥文件内容
 *      **逐字节等于密钥**（多一个换行就够让归属验证失败）、keyLocation 的推导、作用域前缀。
 *   ② **「哪些 URL 变了」这条判据**：等于判据日的被选中、其余不选、无匹配时返回空数组（合法结果）、
 *      重复 URL 只算一次；以及**空输入与坏输入一律抛错**（本仓的「输入为空不许判绿」：
 *      把"读不到产物"当成"今天没有变更"会让整条通知链路静默停摆）。
 *   ③ **payload 与作用域**：字段与顺序、去重、空 urlList 必须被拒（服务端会回 400）、
 *      越出密钥作用域的 URL 必须被拒（协议 Option 2 —— 本站是共享主机上的项目站，
 *      这条正是"不许替同一主机上的别的项目背书"的落点）、超过 10,000 条必须被拒。
 *   ④ **产物登记制**：密钥文件名在 `lib/indexnow.js` 之外**不许出现第二份字面量**；
 *      它必须已被 `lib/published-assets.js` 登记、且已被 `build-local.js` 声明为构建期生成 ——
 *      三件事都用**实跑**（走真正的 `assertNoPublishedData`）验证，不是读字符串猜。
 *   ⑤ **变异牙**：把上面每一条判据的关键实现逐个改坏（在内存里改源码、实跑同一套判据、
 *      断言预期的判据**真的变红**），然后逐字节还原、断言判据回绿、且磁盘上的文件哈希未变。
 *      没有这一节，「这条判据其实永远不会响」是看不出来的。
 *
 * ## 为什么它是 L2（不需要产物目录）
 *
 * 判据本体（`lib/indexnow.js`）是纯函数，日期由调用方注入，本文件**不读产物、不联网、不看时钟** ——
 * 末节有一条自证：扫描本文件自己的源码，出现产物目录字样即红。所以它跑在门禁的构建步骤**之前**，
 * 与 `Feed self-test` 同层同位置（层的判据是「它需要什么才能跑」，见 `scripts/test/layers.js`）。
 *
 * ## 用法与退出码
 *
 *   node scripts/tools/indexnow-selftest.js       # 0 = 全部通过；1 = 有判据红了
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const LIB_FILE = path.join(ROOT, 'scripts', 'lib', 'indexnow.js');
const SITE = require('../lib/site');
const indexnow = require('../lib/indexnow');

const SRC = fs.readFileSync(LIB_FILE, 'utf8');
const SRC_SHA = crypto.createHash('sha256').update(SRC).digest('hex');

let passed = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failures.push({ name, detail }); console.log(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`); }
}
function section(title) { console.log(`\n${title}`); }

/* ------------------------------------------------------------------ */
/* 夹具（合成 sitemap —— 刻意不用磁盘上那份：判据要能脱离产物被验证）        */
/* ------------------------------------------------------------------ */

const S = SITE.SITE_URL;                       // 本站根（带尾斜杠）
const TODAY = '2026-10-17';
const OTHER_DAY = '2026-10-01';

/** 四条 URL：三条 lastmod = TODAY，一条 = OTHER_DAY（与真实产物的形态一致）。 */
const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${S}</loc>
    <lastmod>${TODAY}</lastmod>
  </url>
  <url>
    <loc>${S}student/</loc>
    <lastmod>${TODAY}</lastmod>
  </url>
  <url>
    <loc>${S}models/gpt-6-astra/</loc>
    <lastmod>${OTHER_DAY}</lastmod>
  </url>
  <url>
    <loc>${S}deal/abc/</loc>
    <lastmod>${TODAY}</lastmod>
  </url>
</urlset>`;

const FIXTURE_TODAY_URLS = [`${S}`, `${S}student/`, `${S}deal/abc/`];

/** 一份 404 页面：真实失效形态（产物没生成、或部署漏了文件）。 */
const HTML_404 = '<!DOCTYPE html><html><body>404 Not Found</body></html>';

const urlBlock = (loc, lastmod) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
const urlsetOf = blocks => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${blocks.join('\n')}
</urlset>`;

/**
 * 有 `<url>` 块、但**没有 `<urlset>`** 的文档。
 *
 * 为什么需要这一条夹具：`HTML_404` 那样"什么都没有"的输入会被**两道**守卫分别拦住
 * （`<urlset>` 存在性 + `<url>` 条数为零），于是"去掉 <urlset> 检查"那颗牙打不响 ——
 * 而一颗打不响的牙等于没有牙（本仓对「永远不响的判据」的态度是明确的：它比没有更糟，
 * 因为它看起来在守着什么）。这份夹具把两道守卫**分开**：它有 `<url>`，所以只有
 * `<urlset>` 那一道能拦它。真实形态是"某个页面里嵌了一段 sitemap 片段"。
 */
const FRAGMENT_WITHOUT_URLSET = `<?xml version="1.0" encoding="UTF-8"?>
${urlBlock(`${S}a/`, TODAY)}
`;

/** 断言「这一段必须抛错」，返回 {ok, detail}。 */
function throws(fn) {
  try { fn(); return { ok: false, detail: '它没有抛错（静默通过了）' }; }
  catch (error) { return { ok: true, detail: error.message.slice(0, 60) }; }
}
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\u0000') === [...b].sort().join('\u0000');

/* ------------------------------------------------------------------ */
/* 判据本体：一套判据，反复跑（干净模块一遍、每颗牙一遍）                     */
/* ------------------------------------------------------------------ */

/**
 * 全部判据都是 `mod` 的纯函数 —— 于是同一套判据可以在**变异体**上重跑，
 * 用来证明「这条判据真的会响」（而不是只在干净输入上返回 ok）。
 */
const JUDGEMENTS = [
  { group: '①', name: 'J1 密钥长度下界（少于 8 位必须判非法）', run: mod => ({ ok: !mod.isValidKey('abc1234') }) },
  { group: '①', name: 'J2 密钥字符集（下划线 / 空格 / 非 ASCII 必须判非法）', run: mod => ({ ok: !mod.isValidKey('abc_1234') && !mod.isValidKey('abc 1234') && !mod.isValidKey('密钥密钥密钥') }) },
  { group: '①', name: 'J3 合法密钥必须判合法（32 位十六进制）', run: mod => ({ ok: mod.isValidKey(mod.KEY) }) },
  { group: '①', name: 'J4 密钥文件名 = <key>.txt', run: mod => ({ ok: mod.keyFileName() === `${mod.KEY}.txt`, detail: mod.keyFileName() }) },
  {
    group: '①', name: 'J5 密钥文件内容逐字节等于密钥（不许有结尾换行）',
    run: mod => ({ ok: mod.keyFileContent() === mod.KEY, detail: JSON.stringify(mod.keyFileContent().slice(-4)) })
  },
  {
    group: '①', name: 'J6 keyLocation = 站点根 + 密钥文件名',
    run: mod => ({ ok: mod.keyLocation() === `${S}${mod.KEY}.txt`, detail: mod.keyLocation() })
  },
  { group: '①', name: 'J7 host 只取主机名（不含协议与路径）', run: mod => ({ ok: mod.hostOf() === 'buguoshixc.github.io', detail: mod.hostOf() }) },
  {
    group: '①', name: 'J8 作用域前缀由 keyLocation 推导（最后一个 / 之前的部分）',
    run: mod => ({ ok: mod.scopePrefixOf('https://example.com/catalog/k1.txt') === 'https://example.com/catalog/' })
  },
  {
    group: '②', name: 'J9 判据日命中的 URL 全被选中',
    run: mod => {
      const got = mod.changedUrls(FIXTURE, TODAY);
      return { ok: sameSet(got, FIXTURE_TODAY_URLS), detail: `${got.length} 条` };
    }
  },
  {
    group: '②', name: 'J10 其它日期的 URL 一律不选',
    run: mod => ({ ok: !mod.changedUrls(FIXTURE, TODAY).includes(`${S}models/gpt-6-astra/`) })
  },
  {
    group: '②', name: 'J11 没有匹配项时返回空数组（合法结果，不是抛错）',
    run: mod => {
      const got = mod.changedUrls(FIXTURE, '2026-10-18');
      return { ok: Array.isArray(got) && got.length === 0, detail: JSON.stringify(got) };
    }
  },
  {
    group: '②', name: 'J12 同一条 URL 出现两次只算一次（去重）',
    run: mod => {
      const twice = urlsetOf([urlBlock(`${S}a/`, TODAY), urlBlock(`${S}a/`, TODAY)]);
      const got = mod.changedUrls(twice, TODAY);
      return { ok: got.length === 1, detail: `${got.length} 条` };
    }
  },
  { group: '②', name: 'J13 判据日形状非法必须抛错（不许默默当成"没有变更"）', run: mod => throws(() => mod.changedUrls(FIXTURE, '2026-10-1')) },
  { group: '②', name: 'J14 缺 <urlset>（拿到一份 404 页面）必须抛错', run: mod => throws(() => mod.parseSitemap(HTML_404)) },
  { group: '②', name: 'J14b 有 <url> 但没有 <urlset> 的文档必须抛错（它根本不是 sitemap）', run: mod => throws(() => mod.parseSitemap(FRAGMENT_WITHOUT_URLSET)) },
  { group: '②', name: 'J15 <urlset> 里一条 <url> 都没有必须抛错', run: mod => throws(() => mod.parseSitemap('<?xml version="1.0"?><urlset xmlns="x"></urlset>')) },
  { group: '②', name: 'J16 空输入必须抛错', run: mod => throws(() => mod.parseSitemap('')) },
  { group: '②', name: 'J17 <loc> 不是绝对 URL 必须抛错', run: mod => throws(() => mod.parseSitemap(urlsetOf([urlBlock('student/', TODAY)]))) },
  { group: '②', name: 'J18 <lastmod> 形状非法必须抛错', run: mod => throws(() => mod.parseSitemap(urlsetOf([urlBlock(`${S}a/`, '2026/10/17')]))) },
  { group: '②', name: 'J19 缺 <lastmod> 必须抛错（判据不能对缺字段沉默）', run: mod => throws(() => mod.parseSitemap(urlsetOf([`  <url>\n    <loc>${S}a/</loc>\n  </url>`]))) },
  {
    group: '②', name: 'J20 newestDay 取最大日期（用于诊断输出）',
    run: mod => ({ ok: mod.newestDay(FIXTURE) === TODAY, detail: String(mod.newestDay(FIXTURE)) })
  },
  {
    group: '③', name: 'J21 payload 字段齐全且顺序为 host / key / keyLocation / urlList',
    run: mod => {
      const payload = mod.buildPayload({ urls: FIXTURE_TODAY_URLS });
      const keys = Object.keys(payload).join(',');
      const want = 'host,key,keyLocation,urlList';
      return { ok: keys === want && payload.urlList.length === 3, detail: keys };
    }
  },
  {
    group: '③', name: 'J22 payload 里的 URL 去重',
    run: mod => {
      const payload = mod.buildPayload({ urls: [`${S}a/`, `${S}a/`] });
      return { ok: payload.urlList.length === 1, detail: `${payload.urlList.length} 条` };
    }
  },
  { group: '③', name: 'J23 空 urlList 必须被拒（服务端会回 400，不许构造这种请求）', run: mod => throws(() => mod.buildPayload({ urls: [] })) },
  {
    group: '③', name: 'J24 越出密钥作用域的 URL 必须被拒（共享主机上别的项目）',
    run: mod => throws(() => mod.buildPayload({ urls: [`https://buguoshixc.github.io/other-project/page/`] }))
  },
  {
    group: '③', name: 'J25 超过协议上限 10,000 条必须被拒',
    run: mod => throws(() => mod.buildPayload({ urls: Array.from({ length: mod.MAX_URLS_PER_POST + 1 }, (_, i) => `${S}p/${i}/`) }))
  },
  { group: '③', name: 'J26 密钥非法时不许构造 payload', run: mod => throws(() => mod.buildPayload({ urls: FIXTURE_TODAY_URLS, key: 'short' })) },
  { group: '③', name: 'J27 作用域内 URL 零问题', run: mod => ({ ok: mod.checkUrlsInScope(FIXTURE_TODAY_URLS, mod.keyLocation()).length === 0 }) }
];

/** 在给定模块上跑全部判据 → Map(名字 → {ok, detail}) */
function runJudgements(mod) {
  const out = new Map();
  for (const judgement of JUDGEMENTS) {
    try {
      const result = judgement.run(mod) || {};
      out.set(judgement.name, { ok: !!result.ok, detail: result.detail || '' });
    } catch (error) {
      out.set(judgement.name, { ok: false, detail: `判据自身抛错：${error.message.slice(0, 80)}` });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ① ② ③ 干净模块：全部判据必须绿                                          */
/* ------------------------------------------------------------------ */

const clean = runJudgements(indexnow);
let lastGroup = '';
for (const judgement of JUDGEMENTS) {
  if (judgement.group !== lastGroup) {
    section(`${judgement.group} ${judgement.group === '①' ? '协议约束与唯一表' : judgement.group === '②' ? '判据本体：解析与变更集' : 'payload 与作用域'}`);
    lastGroup = judgement.group;
  }
  const result = clean.get(judgement.name);
  check(judgement.name, result.ok, result.detail);
}

/* ------------------------------------------------------------------ */
/* ④ 唯一表与产物登记制（实跑真正的那台机器）                                */
/* ------------------------------------------------------------------ */

section('④ 唯一表与产物登记制');

{
  // 密钥字面量只许在 lib/indexnow.js 里出现一次：别的文件一律走 keyFileName()。
  const keyLiteral = indexnow.KEY;
  const offenders = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(abs); continue; }
      if (!entry.name.endsWith('.js')) continue;
      const rel = path.relative(ROOT, abs).split(path.sep).join('/');
      if (rel === 'scripts/lib/indexnow.js') continue;
      if (fs.readFileSync(abs, 'utf8').includes(keyLiteral)) offenders.push(rel);
    }
  };
  walk(path.join(ROOT, 'scripts'));
  check('J28 密钥字面量只出现在 lib/indexnow.js（唯一表：别处一律走 keyFileName()）',
    offenders.length === 0, offenders.length ? offenders.join('、') : '扫了 scripts/** 下全部 .js');

  // 密钥文件名同样不许在「消费者」里写第二份字面量。
  const consumers = [
    'scripts/tools/build-local.js',
    'scripts/lib/published-assets.js',
    'scripts/tools/seo-report.js'
  ];
  const nameOffenders = consumers.filter(rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').includes(`${keyLiteral}.txt`));
  check('J29 密钥文件名在消费者里也是从唯一表现取的（不许写第二份字面量）',
    nameOffenders.length === 0, nameOffenders.length ? nameOffenders.join('、') : consumers.join(' / '));
}

{
  // 登记制：构建期要写出它、产物白名单要放行它 —— 两件事都读**真源码**确认。
  const buildSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'tools', 'build-local.js'), 'utf8');
  check('J30 build-local.js 已把密钥文件登记为构建期生成（GENERATED_FILES）',
    /indexnow\.keyFileName\(\)/.test(buildSrc) && /GENERATED_FILES = \[[\s\S]*?indexnow\.keyFileName\(\)/.test(buildSrc));
  check('J31 build-local.js 确实把它写进了产物（writeFileSync + keyFileContent）',
    /fs\.writeFileSync\(path\.join\(OUT, indexnow\.keyFileName\(\)\), indexnow\.keyFileContent\(\)/.test(buildSrc));

  const publishedAssets = require('../lib/published-assets');
  check('J32 lib/published-assets.js 的白名单已登记密钥文件（封闭世界的逐路径登记）',
    publishedAssets.ALLOWED_PATHS.some(([rel]) => rel === indexnow.keyFileName()));

  // 实跑那台机器：一个只有密钥文件的临时产物目录必须判绿；把名字改掉必须判红。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'indexnow-selftest-'));
  try {
    fs.writeFileSync(path.join(tmp, indexnow.keyFileName()), indexnow.keyFileContent(), 'utf8');
    const cleanProblems = publishedAssets.assertNoPublishedData(tmp);
    check('J33 实跑产物登记门禁：只含已登记的密钥文件 ⇒ 零问题', cleanProblems.length === 0, cleanProblems.slice(0, 2).join('；'));

    fs.renameSync(path.join(tmp, indexnow.keyFileName()), path.join(tmp, 'not-registered.txt'));
    const dirtyProblems = publishedAssets.assertNoPublishedData(tmp);
    check('J34【牙】同目录下一个**未登记**的 .txt 必须被点名报出来',
      dirtyProblems.length === 1 && dirtyProblems[0].includes('not-registered.txt'), dirtyProblems.length ? dirtyProblems[0].slice(0, 90) : '它没有报错');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  check('J35 临时目录已清理（自测不留磁盘残渣）', !fs.existsSync(tmp));
}

{
  // L2 自证：本文件不许碰产物目录（碰了它就不该跑在构建步骤之前）。
  // ⚠️ 判据样本用**拼接**写：本文件自己也在扫描射程内，直接写出那两个字样会把这条不变量变成自伤
  //    （同一坑在 `scripts/test/fitness.js` 的时间口径那一条里已经踩过一次，处理方式照抄）。
  const selfSrc = fs.readFileSync(__filename, 'utf8');
  const DIR_FLAG = '--' + 'dir=';
  const ARTIFACT_DIR = 'di' + 'st';
  const hits = [DIR_FLAG, ARTIFACT_DIR].filter(token => selfSrc.includes(token));
  check('J36 本自测不读产物目录（L2 自证：出现目录参数或产物目录名即红）',
    hits.length === 0, hits.length ? `命中了 ${hits.map(h => h.slice(0, 6)).join('、')}` : '源码里两样都没有');
}

/* ------------------------------------------------------------------ */
/* ⑤ 变异牙：改坏实现 → 实跑同一套判据 → 断言预期的那条真的变红               */
/* ------------------------------------------------------------------ */

section('⑤ 变异牙（内存里改源码 → 实跑同一套判据 → 逐字节还原 → 判据回绿）');

/** 出现次数（牙的前置：锚点必须唯一，否则变异会改到别处 —— 那是"牙自己失效"）。 */
const occurrencesOf = (haystack, needle) => haystack.split(needle).length - 1;

/**
 * 在内存里编译一份源码变体。刻意不用临时文件：临时文件要么写进仓库（污染），
 * 要么让源码里的 `require('./site')` 解析不到 —— 两种都不行。
 */
function loadVariant(source) {
  const libDir = path.join(ROOT, 'scripts', 'lib');
  const filename = path.join(libDir, 'indexnow.js');
  const module_ = { exports: {} };
  const localRequire = spec => (spec.startsWith('.')
    ? require(path.resolve(libDir, spec))
    : require(spec));
  // eslint-disable-next-line no-new-func
  const factory = new Function('module', 'exports', 'require', '__filename', '__dirname', source);
  factory(module_, module_.exports, localRequire, filename, libDir);
  return module_.exports;
}

const TEETH = [
  {
    id: 'T1', what: '把密钥长度下界从 8 放宽到 1',
    anchor: '{8,128}', replacement: '{1,128}', expectRed: ['J1 密钥长度下界（少于 8 位必须判非法）']
  },
  {
    id: 'T2', what: '把「等于判据日」反过来（等于改成不等于）',
    anchor: 'if (entry.lastmod !== day) continue;', replacement: 'if (entry.lastmod === day) continue;',
    expectRed: ['J9 判据日命中的 URL 全被选中', 'J10 其它日期的 URL 一律不选', 'J11 没有匹配项时返回空数组（合法结果，不是抛错）']
  },
  {
    id: 'T3', what: '去掉 <urlset> 存在性检查（于是"有 <url> 的片段"会被当成一份 sitemap 读进去）',
    anchor: "if (!text.includes('<urlset')) {", replacement: 'if (false) {',
    expectRed: ['J14b 有 <url> 但没有 <urlset> 的文档必须抛错（它根本不是 sitemap）']
  },
  {
    id: 'T4', what: '去掉空 urlList 拦截（构造出会被服务端 400 的请求）',
    anchor: 'if (!urlList.length) {', replacement: 'if (false) {',
    expectRed: ['J23 空 urlList 必须被拒（服务端会回 400，不许构造这种请求）']
  },
  {
    id: 'T5', what: '去掉作用域拦截（把别的项目的 URL 也报上去）',
    anchor: 'if (scopeProblems.length) {', replacement: 'if (false) {',
    expectRed: ['J24 越出密钥作用域的 URL 必须被拒（共享主机上别的项目）']
  },
  {
    id: 'T6', what: '给密钥文件内容补一个结尾换行',
    anchor: '  return key;\n}', replacement: "  return key + '\\n';\n}",
    expectRed: ['J5 密钥文件内容逐字节等于密钥（不许有结尾换行）']
  },
  {
    id: 'T7', what: '去掉 payload 的 URL 去重',
    anchor: 'const urlList = [...new Set(urls)];', replacement: 'const urlList = [...urls];',
    expectRed: ['J22 payload 里的 URL 去重']
  },
  {
    id: 'T8', what: '去掉「一条 <url> 都没有」的拦截（空的 <urlset> 被当成"解析成功、零变更"）',
    anchor: 'if (!blocks.length) {', replacement: 'if (false) {',
    expectRed: ['J15 <urlset> 里一条 <url> 都没有必须抛错']
  }
];

for (const tooth of TEETH) {
  const hits = occurrencesOf(SRC, tooth.anchor);
  if (hits !== 1) {
    check(`${tooth.id} 锚点唯一（${tooth.what}）`, false, `锚点出现 ${hits} 次（必须恰好 1 次，否则这颗牙改的不是它以为的地方）`);
    continue;
  }
  const mutant = runJudgements(loadVariant(SRC.split(tooth.anchor).join(tooth.replacement)));
  const notRed = tooth.expectRed.filter(name => {
    const result = mutant.get(name);
    return !result || result.ok;
  });
  const collateral = [...mutant.entries()]
    .filter(([, result]) => !result.ok)
    .map(([name]) => name)
    .filter(name => !tooth.expectRed.includes(name));
  check(`${tooth.id} ${tooth.what} ⇒ 预期判据变红`,
    notRed.length === 0,
    notRed.length
      ? `这些本该红却没红：${notRed.map(n => n.slice(0, 12)).join('、')}`
      : `红 ${tooth.expectRed.length} 条${collateral.length ? `（另有连带 ${collateral.length} 条，属预期外的扩散）` : ''}`);
}

// 牙跑完之后：磁盘上的实现必须**逐字节未变**，且干净模块必须仍然全绿。
check('J37 变异全程零磁盘污染（lib/indexnow.js 的 SHA-256 未变）',
  crypto.createHash('sha256').update(fs.readFileSync(LIB_FILE, 'utf8')).digest('hex') === SRC_SHA);
const recheck = runJudgements(require('../lib/indexnow'));
check('J38 还原后全部判据回绿（证明上面那些红是变异造成的，不是环境造成的）',
  [...recheck.values()].every(result => result.ok),
  [...recheck.entries()].filter(([, r]) => !r.ok).map(([n]) => n.slice(0, 12)).join('、'));

/* ------------------------------------------------------------------ */

console.log(`\n=== IndexNow 演练：${passed} 项通过，${failures.length} 项失败 ===`);
console.log(`  密钥文件：${indexnow.keyFileName()}（${indexnow.keyLocation()}）`);
console.log(`  端点：${indexnow.ENDPOINT} · 单次上限 ${indexnow.MAX_URLS_PER_POST} 条`);
if (failures.length) {
  for (const failure of failures) console.log(`  ✗ ${failure.name}${failure.detail ? ` —— ${failure.detail}` : ''}`);
  process.exit(1);
}
