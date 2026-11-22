'use strict';
/**
 * 发布产物全量自检（selfCheck），从 scripts/tools/build-local.js 拆出。
 */
const fs = require('fs');
const path = require('path');
const { load: loadRenderCore } = require('../lib/render-core');
const appAsset = require('../lib/app-asset');
const styleAsset = require('../lib/style-asset');
const health = require('../lib/health');
const audience = require('../lib/audience');
const provenance = require('../lib/provenance');
const history = require('../lib/history');
const feed = require('../lib/feed');
const calendar = require('../lib/calendar');
const validate = require('../validate');
const changes = require('../lib/changes');
const site = require('../lib/site');
const landing = require('../lib/landing');
const vendorPage = require('../lib/vendor-page');
const seo = require('../lib/seo');
const secretScan = require('../lib/secret-scan');
const plansPage = require('../lib/plans-page');
const planHistory = require('../lib/plan-history');
const apiPlanHistory = require('../lib/api-plan-history');
const apiPlansPage = require('../lib/api-plans-page');
const apiCostPage = require('../lib/api-cost-page');
const plansHubPage = require('../lib/plans-hub-page');
const modelsPage = require('../lib/models-page');
const priceHistory = require('../lib/price-history');
const archiveLib = require('../lib/archive');
const publishedAssets = require('../lib/published-assets');
const shell = require('../lib/page-shell');
const planChanges = require('../lib/plan-changes');
const providers = require('../lib/providers');
const dealPlanLinks = require('../lib/deal-plan-links');
const analytics = require('../lib/analytics');
const siteVerification = require('../lib/site-verification');
const dataDocsPage = require('../lib/data-docs-page');
const searchIndex = require('../lib/search-index');
const searchPage = require('../lib/search-page');

const { SITE_URL, xmlEscape } = site;
const htmlEscape = xmlEscape;

function createSelfCheck(ctx) {
  const {
    ROOT,
    OUT,
    PUBLIC_FILES,
    GENERATED_FILES,
    OFFERS_ARTIFACT,
    ROUTE_HREFS,
    ROUTE_MARKERS,
    MIN_PRERENDERED_CARDS,
    NOTES_MANIFEST_FILE,
    NOTES_MANIFEST_PATH,
    CODEX_RESETS_ROUTE,
    listPageFiles,
    listArtifactFiles,
    NOTE_SLOTS,
    noteIntent,
    notesManifestText,
    noteManifestSelfCheck,
    FOOTER_KEPT_SENTENCE,
    normalizeForCompare,
    scanResidue,
    prerenderedText,
    extractFaq,
    visibleFaq,
    decodeEntities,
    plansCompareSource,
    searchFilterSource,
    renderApiCostPage,
    vendorHrefFor,
    renderDirectoryPage,
    getPlan,
    getVendorKeyOf
  } = ctx;

  function selfCheck(built) {
    const PLAN = getPlan();
    const VENDOR_KEY_OF = getVendorKeyOf();
  console.log('\n=== 4) 产物自检 ===');
  let failed = 0;
  const fail = (message) => { console.log('  ✗ ' + message); failed++; };

  /**
   * 变化日志的「发布面」自检（t29）。
   *
   * 可用 ⇒ `dist/<日志>` 与源文件**逐字节相同**（读者能下载到的那一份必须与真值一致）。
   * 不可用（缺失 / 解析失败）⇒ 断言产物就是**如实空账本**（`load()` 契约里的 `store`：
   * `startedAt: null`、0 事件、0 基线），**不是**整条跳过 —— 跳过就放过了「产物里凭空冒出一个日期」
   * 这种坏法，而那正是这一层要挡的。（口径与 deal-history 侧一致：那边由 `verifyStore` 的可用性分支守着。）
   */
  // t4：这里原先是 `checkPublishedLog()` —— 「产物里那份日志副本 == 源日志（或如实空账本）」的对账。
  // 日志副本不再发布（产物里不许有数据文件），这条断言随之删除：它与 L2 的 `check:plan-history` /
  // `check:api-plan-history` 判的是同一件事（源 ⇄ 派生），而那两条不依赖发布副本、更强。
  // 页面侧的口径一条都没放松：日志不可用时页面仍必须说「没有拿到日志」（见下面各页的断言）。

  /**
   * 两份变化日志在**自检**里的视图（t29）：与构建期那一次同一口径 ——
   * 不可用（缺失 / 解析失败）⇒ `null`，于是各模块走它们的「没有拿到日志」分支
   * （那条分支断言的是「页面必须说出没有拿到日志」，比计数对账更严）；可用 ⇒ 从 `dist/` 回读字节
   * （自检要查的正是**发布出去的那一份**）。直接解析 dist 里的如实空账本会得到一个 truthy
   * 但零事件的账本 ⇒ 模块以为日志可用，去要求一个本就不该存在的计数行 / 分栏。
   */
  const planLogSelf = planHistory.load();
  const apiPlanLogSelf = apiPlanHistory.load();
  // t4：原先这里读的是**产物里的那一份**日志副本（deal-history.json 等）。产物里不再有数据文件
  //（判据在 lib/published-assets.js），所以这里直接用构建期加载结果，语义完全一致：
  // 加载失败（缺失 / 损坏）⇒ null（模块走它的「没有拿到日志」分支，断言要求页面如实说出来）；
  // 加载成功 ⇒ 那份账本。两边的差别只有「读盘上副本还是内存对象」，而副本本来就是内存对象的序列化。
  const distLogView = (rel, load) => ((load.missing || load.broken) ? null : load.store);

  for (const file of [...PUBLIC_FILES, ...GENERATED_FILES]) {
    const ok = fs.existsSync(path.join(OUT, file));
    console.log(`  ${ok ? '✓' : '✗'} ${file}`);
    if (!ok) failed++;
  }

  /* ---- v3.2：订阅产物（Atom 1.0 + JSON Feed 1.1）的结构性自检 ----------------------------
   *
   * 为什么用正则而不是 XML 解析器：Node 没有内置 XML parser，而契约第 15 条**不许**为这件事
   * 加运行时依赖。要判的也不是"这篇 XML 在某个实现眼里合法"，而是**我们发出的每一种标签都
   * 开闭配平、每条 entry 的四个必备件都在** —— 那是结构性断言，正则够用，而且它照的正是
   * 「渲染器漏了一截」这一类坏法。
   *
   * 五组判据（扫描面 = 刚写下的两个文件的**磁盘字节**）：
   *   ① XML 声明 / 不许 DOCTYPE / 根元素唯一为冻结形态 / 每种标签开闭配平 / 每条 entry 有
   *      `<id>` `<title>` `<updated>` `<link href>`；
   *   ② 两个格式的条目数**恒等**，且与构建期账目一致（同一次 `entries` 渲染出来的）；
   *   ③ 每条链接（XML 的 `href` + JSON 的 item `url`）都是 `SITE_URL` 开头的绝对 URL，
   *      去掉前缀后的路径在产物里**真实存在且非空**；带 `#fragment` 的还要在那一页里找得到
   *      同名锚点 ——「不发死链」是订阅出口的硬纪律（t13 修的就是死链那一类）；
   *   ④ 全部时间形态都是冻结的 `T00:00:00+08:00`，且日期取值 ⊆ 日志里出现过的日期 ∪ 数据日期
   *      （构建期**不看时钟** ⇒ 产物里不该出现第五种日期）；
   *   ⑤ 两个文件纳入**禁词**（`plansPage.FORBIDDEN_CLAIM_WORDS`）与**元自称**
   *      （`scripts/validate.js` 的 `QUOTE_SELF_CLAIM_PATTERNS`，唯一出处）的扫描面。
   */
  {
    const feedProblems = [];
    const texts = new Map();
    for (const [file] of feed.FEED_FILES) {
      const abs = path.join(OUT, file);
      if (!fs.existsSync(abs)) { feedProblems.push(`缺少产物 ${file}`); continue; }
      const bytes = fs.readFileSync(abs);
      if (!bytes.length) { feedProblems.push(`${file} 是 0 字节（空 feed 不算通过）`); continue; }
      texts.set(file, bytes.toString('utf8'));
    }
    const xmlFile = [...texts.keys()].find(file => texts.get(file).startsWith('<?xml'));
    const jsonFile = [...texts.keys()].find(file => texts.get(file).startsWith('{'));
    if (!xmlFile) feedProblems.push(`没有一份订阅产物是 XML 形态（Atom 预期以 <?xml 开头）：${[...texts.keys()].join(' / ') || '（一条都没读到）'}`);
    if (!jsonFile) feedProblems.push(`没有一份订阅产物是 JSON 形态（JSON Feed 预期以 { 开头）：${[...texts.keys()].join(' / ') || '（一条都没读到）'}`);

    let xmlEntryCount = null;
    const hrefs = [];
    if (xmlFile) {
      const xml = texts.get(xmlFile);
      const where = `订阅产物 ${xmlFile}`;
      if (!xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n')) {
        feedProblems.push(`${where} 第一行不是冻结的 XML 声明`);
      }
      if (/<!DOCTYPE/.test(xml)) {
        feedProblems.push(`${where} 出现 DOCTYPE（全仓唯一的 document 出口是 lib/page-shell.js）`);
      }
      if (!xml.includes('<feed xmlns="http://www.w3.org/2005/Atom"')) {
        feedProblems.push(`${where} 根元素不是冻结形态 <feed xmlns="http://www.w3.org/2005/Atom" …>`);
      }
      const rootStarts = (xml.match(/<feed(?=[\s/>])/g) || []).length;
      const rootCloses = (xml.match(/<\/feed>/g) || []).length;
      if (rootStarts !== 1 || rootCloses !== 1) {
        feedProblems.push(`${where} 根元素不唯一（<feed ${rootStarts} 个 / </feed> ${rootCloses} 个）`);
      }
      // 标签配平：起 = 自闭合 + 收（渲染器发出的全部标签，见契约第 5.3 条的骨架）
      for (const tag of ['feed', 'title', 'subtitle', 'id', 'updated', 'link', 'author', 'name', 'entry', 'summary']) {
        const starts = (xml.match(new RegExp(`<${tag}(?=[\\s/>])`, 'g')) || []).length;
        const selfClosing = (xml.match(new RegExp(`<${tag}(?=[\\s/>])[^>]*/>`, 'g')) || []).length;
        const closes = (xml.match(new RegExp(`</${tag}>`, 'g')) || []).length;
        if (starts !== selfClosing + closes) {
          feedProblems.push(`${where} 标签 <${tag}> 开闭不配平（起 ${starts} / 自闭 ${selfClosing} / 收 ${closes}）`);
        }
      }
      // 每一条 entry 的四个必备件
      const blocks = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(match => match[1]);
      xmlEntryCount = blocks.length;
      if (!blocks.length) feedProblems.push(`${where} 一条 <entry> 都没有（空 feed 不算通过）`);
      blocks.forEach((block, index) => {
        const missing = ['<id>', '<title>', '<updated>'].filter(tag => !block.includes(tag));
        if (!/<link\b[^>]*\bhref="[^"]+"/.test(block)) missing.push('<link href>');
        if (missing.length) feedProblems.push(`${where} 第 ${index + 1} 条 entry 缺少 ${missing.join(' / ')}`);
      });
      for (const match of xml.matchAll(/\bhref="([^"]*)"/g)) hrefs.push(match[1]);
    }

    let jsonItemCount = null;
    if (jsonFile) {
      const where = `订阅产物 ${jsonFile}`;
      let box = null;
      try {
        box = JSON.parse(texts.get(jsonFile));
      } catch (error) {
        feedProblems.push(`${where} 不是合法 JSON：${error.message}`);
      }
      if (box) {
        if (typeof box.version !== 'string' || !box.version) feedProblems.push(`${where} 缺 version`);
        if (!Array.isArray(box.items)) {
          feedProblems.push(`${where} 缺 items 数组`);
        } else {
          jsonItemCount = box.items.length;
          if (!jsonItemCount) feedProblems.push(`${where} items 为空（空 feed 不算通过）`);
          box.items.forEach((item, index) => {
            const missing = ['id', 'url', 'title', 'date_published', 'date_modified']
              .filter(key => typeof (item || {})[key] !== 'string' || item[key] === '');
            if (missing.length) feedProblems.push(`${where} 第 ${index + 1} 条 item 缺少 ${missing.join(' / ')}`);
            if (item && typeof item.url === 'string') hrefs.push(item.url);
          });
        }
      }
    }

    // ② 条目数恒等 + 与构建期账目一致
    if (xmlEntryCount !== null && jsonItemCount !== null && xmlEntryCount !== jsonItemCount) {
      feedProblems.push(`两个格式的条目数不相等（XML ${xmlEntryCount} / JSON ${jsonItemCount}）——`
        + '它们由同一次 entries 渲染，不相等说明有一侧被改写或漏渲染');
    }
    if (built.feed && xmlEntryCount !== null && xmlEntryCount !== built.feed.entryCount) {
      feedProblems.push(`产物里 ${xmlEntryCount} 条 ≠ 构建期账目 ${built.feed.entryCount} 条`);
    }

    // ③ 链接：绝对 URL + 落点真实存在（含锚点）
    for (const href of hrefs) {
      if (!href.startsWith(SITE_URL)) {
        feedProblems.push(`链接不是 SITE_URL 开头的绝对 URL：${href}`);
        continue;
      }
      const rel = href.slice(SITE_URL.length);
      const hashAt = rel.indexOf('#');
      const pathPart = hashAt === -1 ? rel : rel.slice(0, hashAt);
      const fragment = hashAt === -1 ? '' : rel.slice(hashAt + 1);
      const relFile = pathPart === '' ? 'index.html' : (pathPart.endsWith('/') ? `${pathPart}index.html` : pathPart);
      const abs = path.join(OUT, relFile);
      if (!fs.existsSync(abs) || !fs.statSync(abs).size) {
        feedProblems.push(`链接落点不存在（${href} → ${relFile}）`);
        continue;
      }
      // 锚点也要有落点：`plans/*/#plan-<id>` 这类深链，页面里找不到同名 id 就是「点不动的死链」，
      // 而那种链接在浏览器里只是安静地停在页首 —— 正是订阅出口最该挡住的一类。
      if (fragment && !fs.readFileSync(abs, 'utf8').includes(`id="${fragment}"`)) {
        feedProblems.push(`链接锚点没有落点（${href} → ${relFile} 里找不到 id="${fragment}"）`);
      }
    }

    // ④ 时间形态与日期取值
    const allowedDates = new Set((built.feed && built.feed.dates) || []);
    const stamps = [...texts.values()]
      .flatMap(text => [...text.matchAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}/g)].map(match => match[0]));
    if (!stamps.length) feedProblems.push('两个产物里一个时间字段都没有');
    const wrongForm = [...new Set(stamps.filter(stamp => !stamp.endsWith('T00:00:00+08:00')))];
    if (wrongForm.length) {
      feedProblems.push(`时间形态不是冻结的 T00:00:00+08:00：${wrongForm.slice(0, 3).join(' / ')}`
        + '（有东西把「现在几点」写进产物了？构建期不看时钟）');
    }
    const outside = [...new Set(stamps.map(stamp => stamp.slice(0, 10)))].filter(date => !allowedDates.has(date));
    if (outside.length) {
      feedProblems.push(`日期不在数据日期集合里：${outside.slice(0, 3).join(' / ')}`
        + `（允许 ${allowedDates.size} 个：${[...allowedDates].join(' / ')}）`);
    }

    // ⑤ 禁词 / 元自称（两份清单都从唯一出处 require，不在这里复制一份）
    const forbidden = [];
    for (const [file, text] of texts) {
      const hits = plansPage.FORBIDDEN_CLAIM_WORDS.filter(word => text.includes(word));
      if (hits.length) forbidden.push(`${file}：${hits.join('、')}`);
    }
    if (forbidden.length) {
      feedProblems.push(`订阅产物出现结论性词汇（查了 ${plansPage.FORBIDDEN_CLAIM_WORDS.length} 个词）：${forbidden.join('；')}`);
    }
    const selfClaims = [];
    for (const [file, text] of texts) {
      const hits = validate.QUOTE_SELF_CLAIM_PATTERNS.filter(pattern => pattern.re.test(text));
      if (hits.length) selfClaims.push(`${file}：${hits.map(pattern => pattern.label).join('、')}`);
    }
    if (selfClaims.length) {
      feedProblems.push(`订阅产物出现元自称（查了 ${validate.QUOTE_SELF_CLAIM_PATTERNS.length} 条模式）：${selfClaims.join('；')}`);
    }

    if (feedProblems.length) {
      fail(`订阅产物未通过结构性自检（${feedProblems.length} 处）：${feedProblems.slice(0, 4).join('；')}`
        + `${feedProblems.length > 4 ? ` 等 ${feedProblems.length} 处` : ''}`);
    } else {
      console.log(`  ✓ 订阅产物: ${[...texts.keys()].join(' / ')} —— XML 声明 + 根元素唯一 + 标签配平`
        + ` + 每条 entry 四件齐 · 两格式条目数恒等（${xmlEntryCount}）`
        + ` · 链接 ${hrefs.length} 条全部绝对且落点真实存在（锚点逐条核对）+ 时间全部 T00:00:00+08:00`
        + ` · 日期 ⊆ 数据日期（${allowedDates.size} 个）· 无结论性词汇（${plansPage.FORBIDDEN_CLAIM_WORDS.length} 词）`
        + ` · 无元自称（${validate.QUOTE_SELF_CLAIM_PATTERNS.length} 条模式）`);
    }
  }

  // ---- 密钥扫描（v2.0）----
  // 为什么放在"产物自检"而不是某个 AI 脚本里：**发布出去的那一份**才是最后一道防线。
  // 候选文件、缓存、账本都在 gitignore 的 .ai-cache/ 里，但一个手滑把 key 拼进
  // 生成产物（或者把带 key 的调试串留在数据里），从这里漏出去就是永久的、公开的。
  // 扫的是整个暂存目录而不是固定清单：将来新增产物文件自动纳入，不需要记得改清单。
  {
    const hits = secretScan.scanFiles([OUT]);
    if (hits.length) {
      fail(`产物里出现疑似密钥（${hits.length} 个文件）：` +
        hits.map(item => `${path.relative(OUT, item.file)}[${[...new Set(item.hits.map(h => h.id))].join(',')}]`).join(' / '));
    } else {
      console.log('  ✓ 密钥扫描：产物里没有 API key / token / 私钥形状的串');
    }
  }

  // logo 资产：目录存在、文件数与 manifest 对得上、CSS 里每条规则都有对应文件
  const logoDir = path.join(OUT, 'logos');
  if (!fs.existsSync(logoDir)) fail('缺少 logos/ 目录');
  else {
    const sheet = fs.readFileSync(path.join(OUT, 'logos.css'), 'utf8');
    const rules = [...new Set([...sheet.matchAll(/^\.lg\[data-logo="([^"]+)"\]\{/gm)].map(m => m[1]))];
    const missing = rules.filter(key => !fs.existsSync(path.join(logoDir, `${key}.svg`)) &&
      !fs.existsSync(path.join(logoDir, `${key}.png`)));
    if (!rules.length) fail('logos.css 里没有任何 logo 规则');
    else if (missing.length) fail(`logos.css 引用了不存在的图形: ${missing.join(', ')}`);
    else console.log(`  ✓ logo: ${rules.length} 条规则 → logos/ ${fs.readdirSync(logoDir).length} 个文件`);
  }

  const payload = JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8'));
  console.log(`  ${OFFERS_ARTIFACT}: schemaVersion=${payload.schemaVersion}, count=${payload.count}, updatedAt=${payload.updatedAt}`);
  if (payload.schemaVersion !== 2) fail('schemaVersion 不是 2');
  if (payload.count !== payload.deals.length) fail('count 与 deals 长度不一致');

  // ---- v2.1：发布出去的那份 plans.json，必须与源文件逐字节相同 ----
  //
  // 与下面 deals 那一大段是**同一个理由**（发布数据 = 源 + 声明过的变换），
  // 但结论不同：plans 在发布链上**没有任何变换**（译文/派生字段都还不存在），
  // 所以这里断言的是最强的那一种 —— **逐字节相等**。
  // 一旦将来要在构建期给它注入派生字段（比如 provider 显示名），这条断言会立刻变红，
  // 逼人把「注入什么」写下来 —— 那正是它该干的事。
  // t4：这里原先断言「产物里的 plans.json 与源文件逐字节相同」。产物里不再发布这份数据集，
  // 那条断言随之删除 —— 替代者是既有的 L2 门禁 `check:plans:reproducible`（判「源 ⇄ 派生」，
  // 不依赖发布副本）。**页面与数据的对账一条都没少**：下面仍从内存 store 回读页面逐项比对。
  {

    // v2.3：套餐变化日志同样**逐字节**发布（读者能下载到的那一份必须与真值一致）。
    // 可用 / 不可用两种口径见 `selfCheck` 顶部的 `checkPublishedLog()`（t29：日志不可用时
    // 断言「产物就是如实空账本」，而不是整条跳过）。

    // 套餐对比页：**从磁盘回读**再跑一遍诚实性断言。
    //
    // 为什么不在写盘时信一次就够了：那个断言看的是内存里的字符串，
    // 而读者拿到的是磁盘上的字节（写盘编码、被别的步骤改写、路径写错……
    // 都是「内存里对、盘上不对」的形态）。这里读回来查，两边都要对得上。
    const plansPageFile = path.join(OUT, plansPage.PLANS_ROUTE, 'index.html');
    if (!fs.existsSync(plansPageFile)) fail(`缺少 ${plansPage.PLANS_ROUTE}index.html`);
    else {
      // 真值取**发布出去的那一份**（`dist/plans.json`）而不是仓库里的源：这一页的载荷是
      // 页面自己的派生数据，它必须与"读者能下载到的那份数据集"一致（v2.1 已断言 dist 与源逐字节相同）。
      const diskPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
      const diskTable = providers.load().table;
      const diskHtml = fs.readFileSync(plansPageFile, 'utf8');
      // t29：变化日志的**自检视图**与构建期那一次同一口径（不可用 ⇒ null ⇒ 模块走它的
      // 「没有拿到日志」分支，那条分支断言的是「页面必须说出没有拿到」——比计数对账更严）。
      // 直接解析 dist 里的如实空账本会得到一个 truthy 但零事件的账本 ⇒ 模块以为日志可用，
      // 去要求一个本就不该存在的计数行/分栏。
      const diskPlanHistory = distLogView('plan-history.json', planLogSelf);
      const pageProblems = [
        ...plansPage.assertPageHonesty(diskHtml, diskPlans.plans, {
          providerTable: diskTable,
          // v2.3：从磁盘回读时同样带上变化视图与日志 —— 最近变化块与详情时间线
          // 是这一页新增的事实面，不给它们断言等于「盘上少了也看不出来」。
          planChanges: built.planRadar,
          planHistoryStore: diskPlanHistory
        }),
        ...plansPage.assertDataHonesty(diskPlans.plans),
        ...(diskPlanHistory === null ? [] : plansPage.assertHistoryHonesty(diskPlans.plans, diskPlanHistory))
      ];
      // 交互逻辑**逐字节**内联：页面上跑的那一份与 `lib/plans-compare.js` 必须是同一份字节。
      // 少了这一条，将来把内联改成"精简版"也不会有人发现 —— 而那时浏览器与自测就是两套语义了。
      if (!diskHtml.includes(plansCompareSource())) {
        pageProblems.push('内联的交互脚本与 scripts/lib/plans-compare.js 不是同一份字节');
      }
      const templateCount = (diskHtml.match(/<template data-detail-for="/g) || []).length;
      if (templateCount !== diskPlans.plans.length) {
        pageProblems.push(`详情模板 ${templateCount} 个 ≠ 套餐 ${diskPlans.plans.length} 条`);
      }
      if (pageProblems.length) fail(`套餐对比页未通过诚实性断言：${pageProblems.slice(0, 3).join('、')}`);
      else {
        const forbidden = plansPage.FORBIDDEN_CLAIM_WORDS.filter(word => diskHtml.includes(word));
        if (forbidden.length) fail(`套餐对比页出现结论性词汇：${forbidden.join('、')}`);
        else {
          const payload = plansPage.comparePayloadOf(diskHtml).payload;
          console.log(`  ✓ 套餐对比页: ${diskPlans.count} 行 · 载荷 ${payload.rows.length} 行 / ` +
            `${payload.dimensions.provider.length} 平台选项 / 排序 ${[...payload.dimensions.sort.map(s => s.key)].join('+')} · ` +
            `详情模板 ${templateCount} 个（内容与引文逐条对账）· 口径文案在位 · 无结论性词汇（查了 ${plansPage.FORBIDDEN_CLAIM_WORDS.length} 个词）`);
        }
      }
    }
  }

  // ---- v2.5：发布出去的那份 api-plans.json 同样必须与源文件逐字节相同 ----
  //
  // 与 plans 同一条纪律：这一层在发布链上**没有任何变换**，所以断言的是最强的那一种。
  // 一旦将来要在构建期给它注入派生字段（比如模型显示名映射），这条断言会立刻变红。
  // t4：同 plans：产物里不再发布 api-plans.json，「发布副本 == 源」那条断言删除
  //（替代者是 L2 的 `check:api-plans:reproducible`）。页面与内存 store 的对账保留。
  {

    // v2.5：API 计费变化日志同样逐字节发布 —— 可用/不可用两种口径与上面 `plan-history.json` 同一把尺子。

    // API 计费页：**从磁盘回读**再跑一遍诚实性断言（与套餐页同一个理由）。
    const apiPlansPageFile = path.join(OUT, apiPlansPage.API_PLANS_ROUTE, 'index.html');
    if (!fs.existsSync(apiPlansPageFile)) fail(`缺少 ${apiPlansPage.API_PLANS_ROUTE}index.html`);
    else {
      const diskApiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
      const diskApiHistory = distLogView('api-plan-history.json', apiPlanLogSelf);
      const diskHtml = fs.readFileSync(apiPlansPageFile, 'utf8');
      const pageProblems = [
        ...apiPlansPage.assertPageHonesty(diskHtml, diskApiPlans.plans, { providerTable: providers.load().table }),
        ...apiPlansPage.assertDataHonesty(diskApiPlans.plans),
        ...apiPlansPage.assertHistoryHonesty(diskApiPlans.plans, diskApiHistory),
        // v2.4 那一支的断言对 API 计费页同样适用（只筛 kind=api 的行）：
        // 「已结束的关联被当成当前优惠」在这一页同样是必须挡住的事。
        ...plansPage.assertPlanDealsBlock(diskHtml, built.dealLinksView, {
          kind: 'api', unit: '条 API 计费记录', prefix: '../../'
        })
      ];
      // 这一页**刻意没有交互脚本**（v1 是预渲染静态表）—— 断言它真的没有，
      // 而不是"以后顺手加了筛选控件也没人知道"。JSON-LD 与主题脚本都是**内联**的，
      // 所以必须按 type/内容排除，而不是按"有没有 src"排除。
      //
      // private-analytics-v1：页脚里的分析 bootstrap 也是内联的，同样要排除 ——
      // 它是**全站共享页脚的一部分**（不是这一页的交互控件），且它加载的是外部观测脚本、
      // 不改变页面行为。排除它之后，这条断言仍然守着「这一页自己没有内联脚本」这件事。
      const withoutAllowedScripts = analytics.stripBootstrap(diskHtml)
        .replace(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/g, '')
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')
        .split(`<script>\n${apiPlansPage.API_PLANS_FILTER_SCRIPT}\n</script>`).join('');
      if (/<script(?![^>]*\bsrc=)[^>]*>/.test(withoutAllowedScripts)) {
        pageProblems.push('API 计费页出现了未登记的内联脚本');
      }
      if (!diskHtml.includes(apiPlansPage.API_PLANS_FILTER_SCRIPT)) {
        pageProblems.push('API 计费页缺少渐进增强筛选脚本（与 lib/api-plans-page.js 不同源）');
      }
      if (pageProblems.length) fail(`API 计费页未通过诚实性断言：${pageProblems.slice(0, 3).join('、')}`);
      else {
        const forbidden = apiPlansPage.FORBIDDEN_CLAIM_WORDS.filter(word => diskHtml.includes(word));
        if (forbidden.length) fail(`API 计费页出现结论性词汇：${forbidden.join('、')}`);
        else {
          const rows = apiPlansPage.apiRowsOf(diskApiPlans.plans, { providerTable: providers.load().table });
          console.log(`  ✓ API 计费页: ${diskApiPlans.count} 条记录 / ${rows.length} 行 · ` +
            `价格六格逐格与数据对账 · 计费单位列逐行在位 · 免费额度与 credits 明细节 · 官方原文节 · ` +
            `渐进增强筛选脚本与 lib 同源 · 无结论性词汇（查了 ${apiPlansPage.FORBIDDEN_CLAIM_WORDS.length} 个词）`);
        }
      }
    }
  }

  // ---- v3.1：API 成本计算器（/tools/api-cost/）从磁盘回读再跑一遍诚实性断言 --------
  //
  // 与套餐页 / API 计费页同一个理由：写盘时信一次不够，读者拿到的是**盘上的字节**。
  // v3.1 上线时这一页只在写盘那一刻对**内存 HTML** 跑过 assertPageHonesty（见上面
  // renderApiCostPage 之后那一段），写盘之后没有再验一次 —— 于是「写进去的字节被改坏」
  // 这类错误没有人守。这里补上，判据与内存那次**同一份**，不新造口径。
  //
  // 口径说明（刻意与兄弟页一致）：
  //   · 这里**只**再跑一遍诚实性断言（禁词 + credits 正则 + 硬承诺口径 + 结果分区措辞），
  //     不再跑第二遍渲染对账 —— 后者由 L2 的 `selftest:api-cost` 用同一份字节覆盖。
  //   · 每一页被断言两次（内存 / 磁盘）不是冗余：两次之间隔着 fs.writeFileSync，
  //     而回读这一份才是发布出去的那份。
  {
    const apiCostPageFile = path.join(OUT, apiCostPage.API_COST_ROUTE, 'index.html');
    if (!fs.existsSync(apiCostPageFile)) fail(`缺少 ${apiCostPage.API_COST_ROUTE}index.html`);
    else {
      const diskHtml = fs.readFileSync(apiCostPageFile, 'utf8');
      const costProblems = apiCostPage.assertPageHonesty(diskHtml);
      if (costProblems.length) {
        fail(`API 成本计算器（磁盘回读）未通过诚实性断言：${costProblems.slice(0, 3).join('、')}`);
      } else {
        console.log(`  ✓ API 成本计算器（磁盘回读）: 诚实性断言复跑通过（禁词 ${apiCostPage.FORBIDDEN_CLAIM_WORDS.length} 个 + credits 正则 + 硬承诺口径）`);
      }
    }
  }

  // ---- v3.0 Stage B：/plans/ 资料入口页（从磁盘回读对账）--------------------------------
  //
  // 与两个对比页同一条纪律：写盘时信一次不够，读者拿到的是盘上的字节。
  // 回读时带的上下文必须是**盘上的那一份数据**（仓库根的 plans.json + api-plans.json +
  // 盘上的两份日志），而不是构建期的内存对象 —— 否则「盘上的日志与页面上的计数不一致」
  // 这类错误在自检里看不出来。
  // ⚠️ 这里**不是** dist/api-plans.json：t4 起产物里不再发布 api-plans.json（同 plans.json 的处置），
  // 所以只能回到仓库根读那一份（下面两行 readFileSync 就是它）。
  {
    const hubFile = path.join(OUT, plansHubPage.PLANS_HUB_ROUTE, 'index.html');
    if (!fs.existsSync(hubFile)) fail(`缺少 ${plansHubPage.PLANS_HUB_ROUTE}index.html`);
    else {
      const diskHtml = fs.readFileSync(hubFile, 'utf8');
      const diskPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
      const diskApiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
      const diskPlanHistory = distLogView('plan-history.json', planLogSelf);
      const diskApiPlanHistory = distLogView('api-plan-history.json', apiPlanLogSelf);
      const pageProblems = plansHubPage.assertPageHonesty(diskHtml, {
        plans: diskPlans.plans,
        apiPlans: diskApiPlans.plans,
        providerTable: providers.load().table,
        planHistoryStore: diskPlanHistory,
        apiPlanHistoryStore: diskApiPlanHistory,
        dealLinks: built.dealLinksDoc,
        deals: JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8')).deals,
        asOf: built.dealLinksAsOf,
        prefix: '../',
        siteUrl: SITE_URL
      });
      // 「不是第三张重复大表」这条承诺要可验：这一页**不许**出现任何 <table>。
      // 复制粘贴一张大表在视觉上完全正常 —— 只有结构断言能挡住它。
      if (/<table[\s>]/.test(diskHtml)) {
        pageProblems.push('资料入口页出现了 <table> —— 它不该复制 Coding / API 页的大表');
      }
      // 无 JS 可读：正文全部是构建期写下的静态 HTML，且不许内联交互脚本。
      // （分析 bootstrap 与主题脚本、JSON-LD 一样属于**允许的共享内联段**，见上一处的说明。）
      const withoutAllowedScripts = analytics.stripBootstrap(diskHtml)
        .replace(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/g, '')
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
      if (/<script(?![^>]*\bsrc=)[^>]*>/.test(withoutAllowedScripts)) {
        pageProblems.push('资料入口页出现了内联脚本 —— 它是纯静态页（无 JS 也有完整内容）');
      }
      // JSON-LD 必须带 ItemList（两个子页），且声明数 == 元素数 == data-child 行数。
      pageProblems.push(...plansHubPage.assertItemListHonesty(diskHtml, { siteUrl: SITE_URL }));
      if (pageProblems.length) fail(`套餐资料入口页未通过诚实性断言：${pageProblems.slice(0, 3).join('、')}`);
      else {
        const forbidden = plansHubPage.FORBIDDEN_CLAIM_WORDS.filter(word => diskHtml.includes(word));
        if (forbidden.length) fail(`套餐资料入口页出现结论性词汇：${forbidden.join('、')}`);
        else {
          console.log(`  ✓ 套餐资料入口页: 计数与 dist 数据逐项对账 · 两个子页入口在位 · ` +
            `无大表（0 个 <table>）· 无内联脚本 · ItemList 2 项 == data-child 2 行 · ` +
            `无结论性词汇（查了 ${plansHubPage.FORBIDDEN_CLAIM_WORDS.length} 个词）`);
        }
      }
    }
  }

  // ---- v3.0 Stage D5/D6：模型页（页面从磁盘回读；真值按 D1 读仓库根）-------------
  //
  // 与两个对比页 / 资料入口同一条纪律：读者拿到的是盘上的字节 —— 所以**页面 HTML**
  // （`dist/models/index.html`）仍然从盘上回读。
  //
  // ⚠️ 别照旧注释理解取数来源：t4 / 决策 D1 已把**真值来源从产物移到仓库根**。
  //   · 那五份数据文件（models.json / model-registry-links.json / api-plans.json /
  //     plans.json / deal-plan-links.json）**已随本轮整体下架**，产物里根本没有 `dist/*.json` 可读；
  //   · 所以下面取的是 `path.join(ROOT, …)`（关系表真值在 `scripts/data/deal-plan-links.json`）；
  //   · 唯一的例外是 `dealLinks`：它只存在于构建期，`const diskDealLinks = built.dealLinksDoc;`
  //     用的**正是内存对象** —— 那不是"漏改成读盘"，是 D1 之后唯一还成立的取法。
  {
    const modelsIndexFile = path.join(OUT, modelsPage.MODELS_INDEX_ROUTE, 'index.html');
    if (!fs.existsSync(modelsIndexFile)) fail(`缺少 ${modelsPage.MODELS_INDEX_ROUTE}index.html`);
    else {
      const diskIndexHtml = fs.readFileSync(modelsIndexFile, 'utf8');
      const diskModels = JSON.parse(fs.readFileSync(path.join(ROOT, 'models.json'), 'utf8'));
      const diskLinks = JSON.parse(fs.readFileSync(path.join(ROOT, 'model-registry-links.json'), 'utf8'));
      const diskApiPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8'));
      const diskPlans = JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8'));
      const diskDeals = JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8'));
      const diskDealLinks = built.dealLinksDoc;
      const diskApiHistory = distLogView('api-plan-history.json', apiPlanLogSelf);
      const diskCtxBase = {
        links: diskLinks,
        apiPlans: diskApiPlans.plans,
        plans: diskPlans.plans,
        deals: diskDeals.deals,
        dealLinks: diskDealLinks,
        apiPlanHistoryStore: diskApiHistory,
        providerTable: providers.load().table,
        asOf: built.dealLinksAsOf,
        siteUrl: SITE_URL,
        vendorHrefOf: developer => vendorHrefFor(developer, providers.load().table, built.directoryPages)
      };
      const problems = modelsPage.assertPageHonesty(diskIndexHtml, {
        kind: 'models-index',
        registry: diskModels,
        ctx: { ...diskCtxBase, prefix: '../', __refCache: new Map() }
      });
      // 内联脚本**逐字节**比对：页面上跑的那一份与 `lib/models-page.js` 里的必须同一份字节
      // （与套餐页内联 `plans-compare.js` 是同一条纪律 —— 分家之后两边都还是绿的）。
      if (!diskIndexHtml.includes(modelsPage.MODELS_INDEX_FILTER_SCRIPT)) {
        problems.push('内联的筛选脚本与 lib/models-page.js 不是同一份字节');
      }
      // 构建期门槛：盘上不该出现未过门槛的模型页
      const diskSlugs = new Set(diskModels.models.map(model => model.slug));
      const untracked = built.modelGateSkipped.filter(gate => diskSlugs.has(gate.slug));
      if (untracked.length) problems.push(`${untracked.length} 个未过门槛的模型仍在发布数据里`);
      let detailProblems = [];
      for (const model of diskModels.models) {
        const route = modelsPage.modelHrefOf(model);
        const file = path.join(OUT, route, 'index.html');
        if (!fs.existsSync(file)) {
          if (built.modelDetailRoutes.includes(route)) detailProblems.push(`${route}: 过了门槛却没有产物`);
          continue;
        }
        const detailHtml = fs.readFileSync(file, 'utf8');
        const pageProblems = modelsPage.assertPageHonesty(detailHtml, {
          kind: 'model', model, ctx: { ...diskCtxBase, prefix: '../../', __refCache: new Map() }
        });
        detailProblems = detailProblems.concat(pageProblems.map(problem => `${route}: ${problem}`));
      }
      const allProblems = problems.concat(detailProblems);
      if (allProblems.length) fail(`模型页未通过诚实性断言：${allProblems.slice(0, 3).join('、')}`);
      else {
        const forbidden = modelsPage.FORBIDDEN_CLAIM_WORDS.filter(word => diskIndexHtml.includes(word));
        if (forbidden.length) fail(`模型索引页出现结论性词汇：${forbidden.join('、')}`);
        else {
          console.log(`  ✓ 模型页: 索引 ${diskModels.count} 行（含 ${diskModels.models.filter(m => m.aliases.length).length} 个带别名）` +
            ` · 详情 ${built.modelDetailCount} 个（计价表逐行与映射对账 · 摊 Provider 不许凭空出现）` +
            ` · 筛选脚本与 lib 逐字节同源 · 未过门槛 ${built.modelGateSkipped.length} 个未生成` +
            ` · 无结论性词汇（查了 ${modelsPage.FORBIDDEN_CLAIM_WORDS.length} 个词）`);
        }
      }
    }
  }

  // ---- v3.0 Stage F：历史档案（索引页从磁盘回读 + 账本重算）----------------------
  //
  // 三条牙的构建期落点：
  //   · #9  归档只依赖事件：**只喂 events**（故意不喂 anomalies / records）再重算一遍
  //         （`assertEntrySetStable`），条目集合必须逐条不变 —— 它证明条目集合只由事件推出。
  //         ⚠️ t4：产物里不再有数据文件，两侧输入现在都是**构建期账本**
  //         （`built.historyStore` / `built.planHistoryLoad` / `built.apiPlanHistoryLoad`），
  //         不再是"盘上的日志"；盘上仍读的是索引页 HTML。
  //   · #10 大批 ended：可疑标记与异常留档必须同时在（`assertArchiveIntegrity`）；
  //   · #11 ended→restored 之后状态必须是 restored（同样由 integrity 重推比对）。
  // 再加上：索引页三组齐、sitemap 成员 == 过门槛的详情页、不为历史 event 建页。
  {
    const archiveIndexFile = path.join(OUT, archiveLib.ARCHIVE_INDEX_ROUTE, 'index.html');
    if (!fs.existsSync(archiveIndexFile)) fail(`缺少 ${archiveLib.ARCHIVE_INDEX_ROUTE}index.html`);
    else {
      const diskHtml = fs.readFileSync(archiveIndexFile, 'utf8');
      const diskStores = {
        // t4：原先从产物回读这三份日志，现在直接用构建期账本（产物里不再有数据文件）。
        deal: built.historyStore.store,
        plan: built.planHistoryLoad.store,
        api: built.apiPlanHistoryLoad.store
      };
      const diskRecords = {
        deal: JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8')).deals,
        plan: built.plansStore.plans,
        api: built.apiPlansStore.plans
      };
      const diskArchives = ['deal', 'plan', 'api'].map(kind => archiveLib.buildArchive({
        kind,
        baseline: diskStores[kind] ? diskStores[kind].baseline : null,
        events: (diskStores[kind] && diskStores[kind].events) || [],
        absence: (diskStores[kind] && diskStores[kind].absence) || {},
        anomalies: (diskStores[kind] && diskStores[kind].anomalies) || [],
        records: diskRecords[kind],
        startedAt: diskStores[kind] ? diskStores[kind].startedAt : null,
        asOf: built.archiveAsOf
      }));
      const diskEntries = diskArchives.flatMap(archive => archive.entries);
      const problems = [
        ...diskArchives.flatMap(archive => archiveLib.assertArchiveIntegrity(archive)),
        ...archiveLib.assertPageHonesty(diskHtml, { kind: 'archive-index', archives: diskArchives }),
        ...archiveLib.assertEntrySetStable(
          { entries: diskEntries },
          { entries: diskArchives.flatMap(archive => archiveLib.buildArchive({
            kind: archive.kind,
            baseline: diskStores[archive.kind] ? diskStores[archive.kind].baseline : null,
            events: (diskStores[archive.kind] && diskStores[archive.kind].events) || [],
            absence: (diskStores[archive.kind] && diskStores[archive.kind].absence) || {},
            asOf: built.archiveAsOf
          }).entries) }
        ),
        ...archiveLib.assertArchiveDetailRoutes(built.archiveDetailRoutes, diskEntries)
      ];
      const diskGates = diskEntries.map(entry => archiveLib.archiveDetailGate(entry));
      const sitemapText = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
      problems.push(...archiveLib.assertArchiveSitemapEligibility({
        sitemapRoutes: [...sitemapText.matchAll(/<loc>([^<]+)<\/loc>/g)]
          .map(match => match[1].replace(SITE_URL, ''))
          .filter(route => route.startsWith(archiveLib.ARCHIVE_INDEX_ROUTE)),
        gateResults: diskGates
      }));
      for (const route of built.archiveDetailRoutes) {
        const file = path.join(OUT, route, 'index.html');
        if (!fs.existsSync(file)) { problems.push(`${route}: 缺少产物`); continue; }
        const entryHtml = fs.readFileSync(file, 'utf8');
        const entry = diskEntries.find(item => archiveLib.archiveEntryRoute(item) === route);
        problems.push(...archiveLib.assertPageHonesty(entryHtml, { kind: 'archive-entry', entry })
          .map(problem => `${route}: ${problem}`));
      }
      if (problems.length) fail(`历史档案未通过诚实性 / 完整性断言：${problems.slice(0, 3).join('、')}`);
      else {
        const forbidden = archiveLib.FORBIDDEN_CLAIM_WORDS.filter(word => diskHtml.includes(word));
        if (forbidden.length) fail(`历史档案页出现结论性词汇：${forbidden.join('、')}`);
        else {
          console.log(`  ✓ 历史档案: 索引三组齐（${diskArchives.map(archive => `${archive.kindLabel} ${archive.entries.length}`).join(' / ')}）` +
            ` · 详情页 ${built.archiveDetailCount} 个（门槛内）· 完整性重推零问题 · sitemap 成员逐个对账` +
            ` · 无结论性词汇（查了 ${archiveLib.FORBIDDEN_CLAIM_WORDS.length} 个词）`);
        }
      }
    }
  }

  // ---- F1：价格历史（盘上产物回读对账）----------------------------------------
  //
  // 走势图的每一张 `<svg>` 都带着 `data-ph-key`（序列键）、`data-ph-changes`（变化次数），
  // 外层区块带着 `data-ph-series` / `data-ph-changes`。这里**从盘上读回**产物，再与
  // `lib/price-history.js` 用真值现算的结果对账 —— 页面写「1 次变化」而日志里是 0 次，
  // 或者图上出现一条推导结果里不存在的序列，都会当场红，而不是等读者发现。
  {
    const apiPlans = built.apiPlansStore.plans || [];
    const plans = built.plansStore.plans || [];
    const apiStoreDoc = built.apiPlanHistoryLoad ? built.apiPlanHistoryLoad.store : null;
    const planStoreDoc = built.planHistoryLoad ? built.planHistoryLoad.store : null;
    const history = priceHistory.buildPriceHistory({
      apiStore: apiStoreDoc,
      apiPlans,
      planStore: planStoreDoc,
      plans,
      asOf: built.dealLinksAsOf
    });
    const knownKeys = new Set([...history.api.keys(), ...history.plan.keys()]);
    const unescapeAttr = text => String(text)
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const problems = [];
    const htmlFiles = listPageFiles(OUT);
    for (const rel of htmlFiles) {
      const html = fs.readFileSync(path.join(OUT, rel), 'utf8');
      const blocks = [...html.matchAll(/<section class="ph-block"[^>]*data-ph-series="(\d+)" data-ph-changes="(\d+)"/g)];
      if (!blocks.length) continue;
      for (const block of blocks) {
        const end = html.indexOf('</section>', block.index);
        const section = end < 0 ? html.slice(block.index) : html.slice(block.index, end);
        const svgCount = (section.match(/class="ph-svg"/g) || []).length;
        const changeSum = [...section.matchAll(/class="ph-svg"[^>]*data-ph-changes="(\d+)"/g)]
          .reduce((sum, match) => sum + Number(match[1]), 0);
        const chartChanges = [...section.matchAll(/class="ph-svg"[^>]*data-ph-key="([^"]*)"/g)]
          .map(match => unescapeAttr(match[1]));
        if (Number(block[1]) !== svgCount) {
          problems.push(`${rel}: 区块 data-ph-series=${block[1]}，但产物里有 ${svgCount} 张图`);
        }
        if (Number(block[2]) !== changeSum) {
          problems.push(`${rel}: 区块 data-ph-changes=${block[2]}，但各图 changes 之和是 ${changeSum}`);
        }
        for (const key of chartChanges) {
          if (!knownKeys.has(key)) problems.push(`${rel}: 图上的序列键不在推导结果里（${key}）`);
        }
      }
    }
    const apiHtml = fs.readFileSync(path.join(OUT, apiPlansPage.API_PLANS_ROUTE, 'index.html'), 'utf8');
    const apiBlock = apiHtml.match(/<section class="ph-block" id="api-price-history"[^>]*data-ph-series="(\d+)" data-ph-changes="(\d+)"/);
    const apiSeries = [...history.api.values()];
    const apiCharts = apiSeries.filter(series => series.changes.length > 0).length;
    const apiCounts = priceHistory.countsOf(apiSeries);
    if (!apiBlock) {
      problems.push('/plans/api/: 缺少 #api-price-history 价格历史节');
    } else {
      if (Number(apiBlock[1]) !== apiCharts) {
        problems.push(`/plans/api/: 价格历史节图数 ${apiBlock[1]} != 推导出的有事件序列数 ${apiCharts}`);
      }
      if (Number(apiBlock[2]) !== apiCounts.changes) {
        problems.push(`/plans/api/: 价格历史节变化数 ${apiBlock[2]} != 推导出的 ${apiCounts.changes}`);
      }
    }
    const apiSummary = `${apiCounts.entries} 个计价条目 · 基线以来 ${apiCounts.changes} 次价格变化`;
    if (!apiHtml.includes(apiSummary)) problems.push(`/plans/api/: 聚合陈述与推导结果不一致（应为「${apiSummary}」）`);
    if (problems.length) {
      fail(`价格历史盘上对账未通过（${problems.length} 处）：${problems.slice(0, 3).join('；')}`);
    } else {
      console.log(`  ✓ 价格历史: ${htmlFiles.length} 个 HTML 回读；` +
        `${apiSeries.length} 条 API 序列（${apiCharts} 条有价格事件）· ${priceHistory.countsOf(history.plan).series} 条套餐价格序列 · 键全部命中推导结果`);
    }
  }

  // ---- F2：到期日历（盘上产物回读对账）----------------------------------------
  //
  // 只写文件不算数：这里把 `expiry.ics` 从盘上读回来，独立重算「应有多少个事件」，
  // 并逐条验 RFC 5545 的硬形态（CRLF / 75 字节折行 / UID / DTSTART-DTEND 相邻日）。
  // 判据面与生成面刻意不同源：期望值直接从 `dist/assets/data/offers.json` 现数，不调 calendar.js。
  {
    const problems = [];
    const [file] = calendar.CALENDAR_FILES[0];
    const absolute = path.join(OUT, file);
    const text = fs.readFileSync(absolute, 'utf8');
    const offers = JSON.parse(fs.readFileSync(path.join(OUT, 'assets', 'data', 'offers.json'), 'utf8'));
    const asOf = String(offers.updatedAt || '').slice(0, 10);
    const expected = (offers.deals || []).filter(deal => deal && typeof deal.expiresAt === 'string' && deal.expiresAt >= asOf);
    const blocks = [...text.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT\r\n/g)];
    if (!text.startsWith('BEGIN:VCALENDAR\r\n')) problems.push('缺 BEGIN:VCALENDAR 起始行');
    if (!text.endsWith('END:VCALENDAR\r\n')) problems.push('缺 END:VCALENDAR 结束行');
    if (/(?<!\r)\n/.test(text)) problems.push('存在裸 LF（RFC 5545 要求 CRLF）');
    const longLines = text.split('\r\n').slice(0, -1).filter(line => Buffer.byteLength(line, 'utf8') > 75);
    if (longLines.length) problems.push(`${longLines.length} 行超过 75 字节（中文按 UTF-8 3 字节折行）`);
    if (blocks.length !== expected.length) problems.push(`事件数 ${blocks.length} != 现算 ${expected.length}`);
    const byUid = new Map();
    for (const block of blocks) {
      const body = block[1];
      const uid = (/^UID:([^\r]*)$/m.exec(body) || [])[1] || '';
      const start = (/^DTSTART;VALUE=DATE:(\d{8})$/m.exec(body) || [])[1] || '';
      const end = (/^DTEND;VALUE=DATE:(\d{8})$/m.exec(body) || [])[1] || '';
      const stamp = (/^DTSTAMP:(\d{8}T\d{6}Z)$/m.exec(body) || [])[1] || '';
      const host = new URL(site.SITE_URL).host;
      if (!/^[0-9a-f]{12}@/.test(uid) || !uid.endsWith(`@${host}`)) problems.push(`UID 不稳定：${uid || '(空)'}`);
      if (byUid.has(uid)) problems.push(`UID 重复：${uid}`);
      byUid.set(uid, true);
      if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end)) { problems.push(`${uid}: DTSTART/DTEND 不是 DATE 值`); continue; }
      const next = new Date(Date.parse(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}T00:00:00Z`) + 86400000)
        .toISOString().slice(0, 10).replace(/-/g, '');
      if (end !== next) problems.push(`${uid}: DTEND ${end} 不是 DTSTART ${start} 的次日`);
      // DTSTAMP 必须冻结在 asOf 前一日 16:00Z（= 北京时间零点），不许出现别的时刻。
      const expectedStamp = new Date(Date.parse(`${asOf}T00:00:00+08:00`)).toISOString()
        .replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      if (stamp !== expectedStamp) problems.push(`${uid}: DTSTAMP ${stamp || '(空)'} != 冻结值 ${expectedStamp}`);
    }
    if (problems.length) {
      fail(`到期日历盘上对账未通过（${problems.length} 处）：${problems.slice(0, 3).join('；')}`);
    } else {
      console.log(`  ✓ 到期日历: ${file} ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`
        + `（${blocks.length} 个事件 · 基准日 ${asOf} · 全部 CRLF / ≤75 字节 / UID 稳定 / DTEND=次日）`);
    }
  }

  // ---- F3：全站搜索（盘上产物回读对账）----------------------------------------
  //
  // 判据面：页面上的分组计数 `data-search-count` 与 `<li class="sitem">` 数必须等于
  // 索引推导的分组计数；每个 href 必须是站内路由且真实存在（不许发死链）；
  // 内联的过滤脚本必须与本文件逐字节相同。
  {
    const problems = [];
    const disk = fs.readFileSync(path.join(OUT, searchPage.SEARCH_ROUTE, 'index.html'), 'utf8');
    const index = built.searchIndex;
    const totalLis = (disk.match(/<li class="sitem"/g) || []).length;
    if (totalLis !== index.entries.length) problems.push(`目录条目数 ${totalLis} != 索引 ${index.entries.length}`);
    let sum = 0;
    for (const meta of searchIndex.SEARCH_KINDS) {
      const expected = index.counts[meta.kind] || 0;
      const start = disk.indexOf(`data-search-group="${meta.kind}"`);
      if (expected === 0) {
        if (start !== -1) problems.push(`空分组 ${meta.kind} 仍然渲染`);
        continue;
      }
      if (start === -1) { problems.push(`缺少分组 ${meta.kind}`); continue; }
      const end = disk.indexOf('</section>', start);
      const chunk = disk.slice(start, end);
      const claimed = Number((/data-search-count="[^"]*">(\d+)</.exec(chunk) || [])[1]);
      const lis = (chunk.match(/<li class="sitem"/g) || []).length;
      if (claimed !== expected) problems.push(`分组 ${meta.kind} 声明 ${claimed} != 索引 ${expected}`);
      if (lis !== expected) problems.push(`分组 ${meta.kind} 条目 ${lis} != 索引 ${expected}`);
      sum += lis;
    }
    if (sum !== totalLis) problems.push(`分组求和 ${sum} != 条目总数 ${totalLis}`);
    for (const match of disk.matchAll(/<li class="sitem"[^>]*>\s*<a href="\.\.\/([^"]+)"/g)) {
      const target = match[1].split('#')[0];
      if (!built.pageRoutes.has(target)) problems.push(`搜索链接不在已生成路由里：${target}`);
    }
    if (!disk.includes(searchFilterSource())) problems.push('内联的过滤脚本与 lib/search-filter.js 不是逐字节同一份');
    if (!/<input type="search" id="siteSearchInput"/.test(disk)) problems.push('缺搜索框 #siteSearchInput');
    if (problems.length) {
      fail(`全站搜索盘上对账未通过（${problems.length} 处）：${problems.slice(0, 3).join('；')}`);
    } else {
      console.log(`  ✓ 全站搜索: ${index.entries.length} 条 · ${Object.keys(index.counts).filter(k => index.counts[k] > 0).length} 个分组`
        + ` · 分组计数与条目数一致 · 链接全部落在已生成路由 · 过滤脚本逐字节内联`);
    }
  }

  // ---- t4：产物资产门禁（替代原「数据出口」闭环）--------------------------------
  //
  // 原先是数据出口的三条牙（文档里的 endpoint 存在 / schemaVersion 与真实数据一致 /
  // Manifest 条数与真实数据集数一致），随数据出口子系统下架一起删除。新的闭环更窄也更硬：
  // **产物里不许有数据文件**，只允许 `lib/published-assets.js` 里逐条写明理由的那一份
  //（首页应用自己的 `assets/data/offers.json`）。
  //
  // 为什么这条不能省：一个静态站会悄悄长出新数据文件（新增一份 JSON 导出、某处顺手写盘），
  // 而「多了一份没人知道的数据」从来不会自己变红 —— 它只会在某天被人从浏览器里下载走。
  // 三条纪律（空输入不许判绿 / 豁免逐路径写清不许通配 / 失败点名路径）写在那个模块里。
  {
    const problems = publishedAssets.assertNoPublishedData(OUT);
    if (problems.length) fail(`产物资产门禁未通过（${problems.length} 处）：${problems.slice(0, 3).join('；')}`);
    else {
      const summary = publishedAssets.summarizePublishedFiles(OUT);
      console.log(`  ✓ 产物资产: ${summary.total} 个文件（页面 ${summary.pages} / 非页面 ${summary.nonPages}`
        + ` · 数据资源 ${summary.data} 份 —— 只有首页那一份）· 无未登记文件 · 无 *.ndjson`
        // v3.2：这句原先写的是「无订阅产物」—— 本轮它成了假话（订阅出口回来了）。
        // 如实版：两条订阅产物**逐路径登记**在 ALLOWED_PATHS 里（不是数据面清单，见 lib/published-assets.js）。
        + ` · 订阅产物 ${feed.FEED_FILES.length} 份（已逐路径登记：${feed.FEED_FILES.map(([file]) => file).join(' / ')}）`);
    }
  }

  // ---- v2.4：优惠 ↔ 套餐关系（从磁盘回读对账）--------------------------------
  //
  // 这一层的坏法全都是「页面看起来正常」：注入漏了 → 有关系的那几条优惠页少一块；
  // 注入的是上一次的关系 → 页面显示一条谁也没确认过的关联；套餐页的块与视图不同步 →
  // 「当前优惠」与「暂无当前优惠」对不上。所以这里读回磁盘，对账三份东西：
  //   ① `dist/assets/data/offers.json` 的 `relatedPlans` 必须等于用关系表**重算**的结果（逐字段）；
  //   ② `dist/deal-plan-links.json` 的 links/retired 与源表深等，count/updatedAt 等于推导值；
  //   ③ 优惠页与套餐页上的块落到字节上（含 `../../` 深度前缀、套餐行锚点落点、反向无块）。
  {
    const problems = [];
    const sourceDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
    for (const deal of sourceDoc.deals || []) {
      if (deal && Object.prototype.hasOwnProperty.call(deal, 'relatedPlans')) {
        problems.push(`源 deals.json 里出现了构建期派生字段 relatedPlans（${deal.id}）`);
        break;
      }
    }

    // ① dist/assets/data/offers.json 的注入
    const published = JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8'));
    const expectedByDeal = new Map();
    for (const [dealId, rows] of built.dealLinksByDeal) expectedByDeal.set(dealId, dealPlanLinks.relatedPlansOf(rows));
    let injected = 0;
    for (const deal of published.deals || []) {
      const expected = expectedByDeal.get(deal.id) || null;
      const actual = Array.isArray(deal.relatedPlans) ? deal.relatedPlans : null;
      if (!expected) {
        if (actual) problems.push(`${deal.id} 没有关系却注入了 relatedPlans`);
        continue;
      }
      injected++;
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        problems.push(`${deal.id} 的 relatedPlans 与关系表重算结果不一致`);
      }
    }
    if (injected !== expectedByDeal.size) {
      problems.push(`注入到 dist 的关联条目 ${injected} ≠ 关系表覆盖的优惠 ${expectedByDeal.size} 条`);
    }

    // ② 发布的关系文件
    // t4：原先这里回读 `dist/deal-plan-links.json` 并与源表推导值对账。产物里不再发布这份数据集，
    // 这条对账随之删除 —— 关系表本身的对账仍在上面（① 注入到 offers.json 的 relatedPlans 逐字段重算）
    // 与 L2 的 `selftest:deal-plan-links` + `check:reproducible`（它们判源 ⇄ 派生，不依赖发布副本）。

    // ③ 页面上的块（套餐页 + 有关系的优惠详情页）
    const plansPagePath = path.join(OUT, plansPage.PLANS_ROUTE, 'index.html');
    const plansPageHtml = fs.existsSync(plansPagePath) ? fs.readFileSync(plansPagePath, 'utf8') : '';
    if (!plansPageHtml) problems.push(`缺少 ${plansPage.PLANS_ROUTE}index.html（关系块无处安放）`);
    problems.push(...plansPage.assertPlanDealsBlock(plansPageHtml, built.dealLinksView, { prefix: '../../' }));
    for (const [dealId, rows] of built.dealLinksByDeal) {
      const file = path.join(OUT, 'deal', dealId, 'index.html');
      if (!fs.existsSync(file)) { problems.push(`有关联的优惠缺少详情页 ${dealId}`); continue; }
      const page = fs.readFileSync(file, 'utf8');
      if (!page.includes('关联的正常套餐')) problems.push(`${dealId} 的详情页没有「关联的正常套餐」块`);
      for (const row of rows) {
        if (!page.includes(`data-plan-id="${row.planId}"`)) problems.push(`${dealId} 的详情页缺少记录 ${row.planId} 的一行`);
        // v2.5：链接目标按 kind 分派（Coding 套餐 → /plans/coding/，API 计费记录 → /plans/api/），
        // 与 RENDER-CORE 的 `PLAN_LINK_ROUTE` 是同一张表的两个落点。
        const route = row.planKind === 'api' ? apiPlansPage.API_PLANS_ROUTE : plansPage.PLANS_ROUTE;
        if (!page.includes(`data-plan-kind="${row.planKind === 'api' ? 'api' : 'coding'}"`)
          || !page.includes(`href="../../${route}#plan-${row.planId}"`)) {
          problems.push(`${dealId} 的详情页指向记录 ${row.planId} 的链接缺失或深度前缀不是 ../../（应为 ${route}）`);
        }
      }
    }
    // 反向：没有关系的优惠页不许出现这一块（多出来的块是「凭空造了一条关系」的那种坏法）
    for (const deal of published.deals || []) {
      if (expectedByDeal.has(deal.id)) continue;
      const file = path.join(OUT, 'deal', deal.id, 'index.html');
      if (fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('class="dplans"')) {
        problems.push(`${deal.id} 没有关系，详情页却渲染了关联块`);
        break;
      }
    }
    // 锚点落点：记录必须真在**它所在的那一页**上有 `id="plan-<planId>"`（否则关联链接是一条死锚点）。
    // v2.5：锚点分属两页 —— Coding 记录在 /plans/coding/，API 计费记录在 /plans/api/。
    // 不按 kind 分流的话，一行 API 记录会被要求出现在套餐页上，而那是永远不成立的。
    const apiPlansPageHtmlForAnchors = fs.existsSync(path.join(OUT, apiPlansPage.API_PLANS_ROUTE, 'index.html'))
      ? fs.readFileSync(path.join(OUT, apiPlansPage.API_PLANS_ROUTE, 'index.html'), 'utf8')
      : '';
    for (const row of built.dealLinksView.rows) {
      if (!row.current.length && !row.history.length) continue;
      const host = (row.planKind === 'api') ? apiPlansPageHtmlForAnchors : plansPageHtml;
      const where = (row.planKind === 'api') ? '/plans/api/' : '/plans/coding/';
      if (!host.includes(`id="plan-${row.planId}"`)) {
        problems.push(`${where} 缺少记录 ${row.planId} 的行锚点（关联链接会指向不存在的锚点）`);
      }
    }

    if (problems.length) fail(`优惠 ↔ 套餐关系：${problems.slice(0, 6).join('；')}`);
    else {
      const stats = built.dealLinksView.counts;
      console.log(`  ✓ 优惠 ↔ 套餐: ${stats.links} 条关系覆盖 ${stats.withCurrent} 条套餐` +
        `（当前 ${stats.current} 行 / 历史 ${stats.history} 行）· dist 注入 ${injected} 条` +
        ` · 优惠页与套餐页逐条对账（含锚点与深度前缀）· 基准日 ${built.dealLinksAsOf || '未知'}`);
    }
  }

  // ---- 源数据 vs 发布数据的一致性门禁（v1.0 就记着的债，v1.1 收口补上）----
  //
  // 为什么必须有：`dist/assets/data/offers.json` 是**发布出去的那一份** —— 浏览器 fetch 的是它，
  // 首页的每个数字、每张卡片都从它来。而在此之前，没有任何东西比对过它与源 `deals.json`：
  // 构建只断言了它的几个**属性**（schemaVersion / count），属性对了而**内容**是旧的、
  // 或者少了一批字段，照样发布。v1.0 的报告里就记着这条债，一直没还。
  //
  // 口径：dist 必须**恰好等于** 源 + 构建期**声明过的**变换，多一个字段少一个字段都算不一致。
  //   ① `collections` —— 构建期算出的分类归属（**只增**的派生字段）
  //   ①′ `needs`     —— 构建期算出的按需求命中（v1.2，同样只增）。两个派生字段都是
  //      「判据只写一遍、结果当数据传」的产物，所以它们只进 dist、不进源 `deals.json`，
  //      可重建性门禁（check-reproducible）因此不需要认识它们。
  //   ③ `sourceFacts` —— v1.3 构建期算出的采集事实（来源类型 / 采集方式 / 最近成功采集），
  //      同样只增；它的真值在 source-health.json 与 provenance.SOURCE_TYPES 里，
  //      这里只存放「渲染那一刻看到的值」。
  //   ② `zh`         —— 中文译文覆盖层。⚠️ 它**不是只增**：覆盖层会按指纹停用「原文已变」
  //      的译文、也会把撤回的译文从产物里去掉（`selftest:zh` 的两个用例正是这两件事）。
  //      所以它**不比字节**，只断言「不多出别的字段」；译文自身的正确性由它自己的门禁管
  //      （构建期的 zh 断言：译文没写进产物 / 译文顶掉了英文原文；以及 `check:zh` 的漂移检查）。
  //
  // ⚠️ 第一版把 `zh` 也按字节比了，于是 `selftest:zh` 的两个用例当场变红 ——
  // 那不是译文坏了，是**这条门禁对 `zh` 的语义断言错了**：它假设覆盖层只增不减。
  // 一个把正常行为判成失败的守卫，比没有守卫更糟（它会被绕过或被改松）。
  const BUILD_ADDED = new Set(['collections', 'needs', 'sourceFacts', 'history', 'relatedPlans']);
  const BUILD_MANAGED = new Set(['zh']);
  {
    const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
    const problems = [];
    if (source.schemaVersion !== payload.schemaVersion) problems.push('schemaVersion 不一致');
    if (source.updatedAt !== payload.updatedAt) problems.push(`updatedAt 不一致（源 ${source.updatedAt} / 产物 ${payload.updatedAt}）`);
    if (source.count !== payload.count) problems.push(`count 不一致（源 ${source.count} / 产物 ${payload.count}）`);
    if (source.deals.length !== payload.deals.length) {
      problems.push(`条目数不一致（源 ${source.deals.length} / 产物 ${payload.deals.length}）`);
    } else {
      for (let i = 0; i < source.deals.length; i++) {
        const a = source.deals[i];
        const b = payload.deals[i];
        if (a.id !== b.id) { problems.push(`第 ${i} 条 id 不一致（${a.id} / ${b.id}）`); break; }
        for (const key of Object.keys(a)) {
          if (BUILD_MANAGED.has(key)) continue;
          if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
            problems.push(`${a.id} 的 ${key} 与源不一致`);
            break;
          }
        }
        for (const key of Object.keys(b)) {
          if (!(key in a) && !BUILD_ADDED.has(key) && !BUILD_MANAGED.has(key)) {
            problems.push(`${a.id} 多了源里没有的字段 ${key}`);
            break;
          }
        }
        if (problems.length > 8) break;
      }
    }
    if (problems.length) fail(`源 deals.json 与发布产物 ${OFFERS_ARTIFACT} 不一致：${problems.slice(0, 8).join('；')}`);
    else console.log(`  ✓ 源/产物一致: ${payload.deals.length} 条逐字段相同（构建期只动 zh / collections / needs / sourceFacts / history / relatedPlans）`);
  }

  // ---- v1.3：信息来源块（evidence / sourceFacts）----------------------------
  //
  // 这一块要么在页面上说真话，要么不如不说：`lastSuccessAt` 是 join 出来的，
  // join 错了（来源改名、心跳换了字段名）页面**不会报错**，只会显示一个看起来正常的日期。
  // 所以这里逐条与 source-health.json 对账，并把渲染器真正产出的 HTML 拿出来扫两件事：
  // ① 三个缺失状态有没有各自说出来；② 有没有混进本站自发的有效性结论。
  //
  // 红线只在**我们自己写的字**上扫（SOURCE_WORDING 的全部取值 + provenance 的推理 note），
  // **不扫** evidence 里的官方引文 —— 官方原话里出现「保证」「永久」是事实，不是我们的承诺，
  // 把引文也纳入扫描会让这条红线在第一句真实引文上就变成假红，然后被人改松。
  {
    const problems = [];
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'source-health.json'), 'utf8'));
    const byName = new Map((doc.sources || []).map(row => [row.name, row]));

    const budget = provenance.budgetOf(payload.deals);
    if (budget.chars > provenance.EVIDENCE_TOTAL_BUDGET_CHARS) {
      problems.push(`引文字符 ${budget.chars} 超过全库预算 ${provenance.EVIDENCE_TOTAL_BUDGET_CHARS}`);
    }
    if (budget.maxLength > provenance.MAX_EVIDENCE_QUOTE_LENGTH) {
      problems.push(`单条引文 ${budget.maxLength} 字，超过 ${provenance.MAX_EVIDENCE_QUOTE_LENGTH} 字上限`);
    }
    if (budget.maxPerDeal > provenance.MAX_EVIDENCE_ITEMS) {
      problems.push(`单条记录引文 ${budget.maxPerDeal} 条，超过 ${provenance.MAX_EVIDENCE_ITEMS} 条上限`);
    }

    const rc = loadRenderCore(path.join(OUT, 'index.html'));
    const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
    const wording = audience.parseWordingBlock(audience.extractWordingBlock(appAsset.SOURCE)) || {};
    const ownWords = Object.keys(wording)
      .filter(group => group.startsWith('SOURCE_'))
      .flatMap(group => Object.values(wording[group] || {}))
      .map(String);
    for (const stamp of provenance.STAMP_PATTERNS) {
      const hit = ownWords.filter(text => stamp.re.test(text));
      if (hit.length) problems.push(`信息来源措辞里出现本站自发的有效性结论（${stamp.why}）：${hit.slice(0, 2).join(' / ')}`);
    }
    const LABELS = wording.SOURCE_LABELS || {};
    const NOTES = wording.SOURCE_NOTES || {};
    const STATE = wording.SOURCE_STATE || {};
    if (!LABELS.sectionTitle || !NOTES.disclaimer) {
      problems.push('产物里的 SOURCE_WORDING 措辞块缺失或不可解析（信息来源块没法校对）');
    }

    let curatedSeen = 0;
    let unavailableSeen = 0;
    let unknownSeen = 0;
    let evidenceSeen = 0;
    for (const deal of payload.deals) {
      const facts = deal.sourceFacts;
      if (!facts || typeof facts !== 'object') {
        problems.push(`${deal.id} 缺少 sourceFacts（派生字段没写进产物）`);
        continue;
      }
      if (!['static', 'headless', 'curated', 'unknown'].includes(facts.method)) {
        problems.push(`${deal.id} 的 sourceFacts.method 非法（${facts.method}）`);
      }
      // sourceType 的合法集合与 provenance.SOURCE_TYPES 的取值一致。`lead` = B 类资讯线索
      // （beta，2026-11 起）：页面按它显示「线索 · 未核验」，并把这类记录从优惠列表里排除。
      if (!['official', 'directory', 'curated', 'lead', 'unknown'].includes(facts.sourceType)) {
        problems.push(`${deal.id} 的 sourceFacts.sourceType 非法（${facts.sourceType}）`);
      }
      if (!['known', 'na', 'unknown', 'unavailable'].includes(facts.lastSuccessState)) {
        problems.push(`${deal.id} 的 sourceFacts.lastSuccessState 非法（${facts.lastSuccessState}）`);
      }

      const row = byName.get(deal.source);
      if (facts.method === 'curated') {
        curatedSeen++;
        if (facts.lastSuccessState !== 'na') {
          problems.push(`${deal.title}: 人工策展条目的 lastSuccessState 应为 na，实得 ${facts.lastSuccessState}`);
        }
      } else if (row) {
        if (facts.sourceId !== row.source) problems.push(`${deal.title}: sourceId ${facts.sourceId} ≠ 心跳 ${row.source}`);
        const expectedMethod = row.kind === 'headless' ? 'headless' : 'static';
        if (facts.method !== expectedMethod) problems.push(`${deal.title}: 采集方式 ${facts.method} ≠ 心跳 ${row.kind}`);
        if ((facts.lastSuccessAt || null) !== (row.lastSuccessAt || null)) {
          problems.push(`${deal.title}: 最近成功采集与心跳不一致`);
        }
      } else if (facts.lastSuccessState === 'known' || facts.lastSuccessState === 'na') {
        problems.push(`${deal.title}: 来源「${deal.source}」不在心跳里，却报告 ${facts.lastSuccessState}`);
      } else if (facts.lastSuccessState === 'unavailable') {
        unavailableSeen++;
      } else {
        unknownSeen++;
      }

      // 渲染器实际产出：必须成块、必须带免责句、缺失状态必须各自说出口
      const block = rc.sourceBlockHtml(deal);
      if (!block.includes(LABELS.sectionTitle)) problems.push(`${deal.title}: 信息来源块没有标题`);
      if (!block.includes(NOTES.disclaimer)) problems.push(`${deal.title}: 信息来源块没有免责句`);
      if (!block.includes(LABELS.lastSuccess)) problems.push(`${deal.title}: 缺少「最近成功采集」一行`);
      if (facts.lastSuccessState === 'na' && !block.includes(STATE.na)) {
        problems.push(`${deal.title}: 人工策展没有显示「${STATE.na}」`);
      }
      if (facts.lastSuccessState === 'unavailable' && !block.includes(STATE.unavailable)) {
        problems.push(`${deal.title}: 心跳不可用没有显示「${STATE.unavailable}」`);
      }
      if (facts.lastSuccessState === 'unknown' && !block.includes(STATE.unknown)) {
        problems.push(`${deal.title}: 来源未知没有显示「${STATE.unknown}」`);
      }
      // ⚠️ 这条是**实测补的**：第一版漏了它，于是「state 归一不认识 known」把每一条真的采到了
      // 的记录都渲染成「未知」，而上面那三条断言全绿 —— 页面看起来完全正常。
      if (facts.lastSuccessState === 'known' && !/<time datetime="[^"]+">/.test(block)) {
        problems.push(`${deal.title}: 最近成功采集是 known，却没有渲染出 <time>`);
      }
      if (/已核验/.test(block)) problems.push(`${deal.title}: 信息来源块里出现「已核验」（本站不给自己盖章）`);

      // 推理 note 也是我们自己写的字，同样不许变成有效性承诺
      const notes = deal.provenance && deal.provenance.fields
        ? Object.values(deal.provenance.fields).map(item => item && item.note).filter(Boolean) : [];
      for (const stamp of provenance.STAMP_PATTERNS) {
        const hit = notes.filter(text => stamp.re.test(text));
        if (hit.length) problems.push(`${deal.title}: 推理 note 里出现有效性承诺（${stamp.why}）`);
      }

      const evidence = Array.isArray(deal.evidence) ? deal.evidence : [];
      if (evidence.length) {
        evidenceSeen++;
        for (const item of evidence) {
          if (Array.from(String(item.quote)).length > provenance.MAX_EVIDENCE_QUOTE_LENGTH) {
            problems.push(`${deal.title}: 引文超长`);
          }
          if (!block.includes('dsrc-quote')) problems.push(`${deal.title}: 引文没有渲染出来`);
        }
      }
    }

    // 静态详情页也要有这一块（它由同一个 detailHtml 渲染，但**写盘路径不同**，
    // 断言必须落在产物文件上，而不是「我调用了同一个函数」这句自证上）。
    const dealIds = payload.deals.filter(deal => deal.type === 'deal' && deal.id).map(deal => deal.id);
    const missingPages = dealIds.filter(id => !fs.existsSync(path.join(OUT, 'deal', id, 'index.html')));
    if (missingPages.length) problems.push(`缺少详情页 ${missingPages.length} 个`);
    else if (dealIds.length && LABELS.sectionTitle) {
      const sample = fs.readFileSync(path.join(OUT, 'deal', dealIds[0], 'index.html'), 'utf8');
      if (!sample.includes(LABELS.sectionTitle)) problems.push('详情页里没有信息来源块');
    }

    if (problems.length) fail(`信息来源（v1.3）：${problems.slice(0, 6).join('；')}`);
    else {
      console.log(`  ✓ 信息来源: ${payload.deals.length} 条记录逐个与心跳对账一致（有引文 ${evidenceSeen} 条 · ` +
        `人工策展 ${curatedSeen} 条显示「${STATE.na}」 · 来源未知 ${unknownSeen} 条 · ` +
        `心跳不可用 ${unavailableSeen} 条）`);
    }
  }

  // ---- v1.4：变更记录（history）--------------------------------------------
  //
  // 这一层的坏法全部是「页面看起来正常」：注入漏了 → 每条都显示「暂无变更记录」；
  // 注入的不是日志里那一段 → 页面显示一段谁也没写过的历史。所以这里做三件事：
  //   ① 源数据里不许有 history（派生字段不得回流）；
  //   ② 注入的每条必须**逐字节等于**日志里该 id 的最近 N 条，且 dist/deal-history.json 与源日志一致；
  //   ③ 渲染器实际产出的 HTML 必须：有事件的列出事件、无事件的明说「暂无变更记录」、且措辞与后端逐项同源。
  {
    const problems = [];
    const sourceDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'deals.json'), 'utf8'));
    for (const deal of sourceDoc.deals || []) {
      if (deal && Object.prototype.hasOwnProperty.call(deal, 'history')) {
        problems.push(`源 deals.json 里出现了构建期派生字段 history（${deal.id}）`);
        break;
      }
    }

    const store = history.load();
    if (store.missing || store.broken) {
      problems.push(`历史日志不可用（${store.broken || '文件缺失'}）`);
    } else {
      const bytes = fs.statSync(store.file).size;
      const today = (payload.updatedAt || '').slice(0, 10) || undefined;
      problems.push(...history.verifyStore(store.store, payload.deals, { today, bytes }).slice(0, 4));

      const distLogPath = path.join(ROOT, 'scripts', 'data', 'deal-history.json');
      if (!fs.existsSync(distLogPath)) problems.push('缺少产物 deal-history.json');
      else if (fs.readFileSync(distLogPath, 'utf8') !== `${JSON.stringify(store.store, null, 2)}\n`) {
        problems.push('产物 deal-history.json 与源历史日志不一致');
      }

      let withEvents = 0;
      let injected = 0;
      for (const deal of payload.deals) {
        const expected = history.historyFor(store.store, deal.id);
        const actual = deal.history || null;
        if (JSON.stringify(expected) !== JSON.stringify(actual)) {
          problems.push(`${deal.id}: 注入的 history 与日志不一致（期望 ${expected ? expected.total : 'null'} 条）`);
          break;
        }
        if (actual) { injected++; withEvents += actual.events.length; }
      }

      const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
      const wording = audience.parseWordingBlock(audience.extractWordingBlock(appAsset.SOURCE)) || {};
      for (const group of Object.keys(history.HISTORY_WORDING)) {
        const expected = history.HISTORY_WORDING[group];
        const actual = wording[group];
        if (!actual || typeof actual !== 'object') { problems.push(`产物里缺措辞组 ${group}`); continue; }
        for (const key of Object.keys(expected)) {
          if (actual[key] !== expected[key]) problems.push(`${group}.${key}：前端「${actual[key]}」≠ 后端「${expected[key]}」`);
        }
      }
      const sinceTemplate = wording.HISTORY_LABELS && wording.HISTORY_LABELS.since;
      if (!sinceTemplate || !sinceTemplate.includes('{date}')) problems.push('「变更记录自 {date} 起」模板丢了槽位（退化成写死的一句话）');
      const moreTemplate = wording.HISTORY_LABELS && wording.HISTORY_LABELS.more;
      if (!moreTemplate || !moreTemplate.includes('{n}')) problems.push('「另有 {n} 条更早的记录」模板丢了槽位');

      const sampleWith = payload.deals.find(deal => deal.history && deal.history.events.length);
      const sampleWithout = payload.deals.find(deal => !deal.history);
      const rc = loadRenderCore(path.join(OUT, 'index.html'));
      if (sampleWith) {
        const block = rc.historyBlockHtml(sampleWith);
        if (!block.includes('data-hist-type=')) problems.push('有变更记录的条目没有渲染出事件行');
        if (!block.includes(String(sampleWith.history.total))) problems.push('变更记录块没有带上总条数');
        if (/已核验|100% 有效/.test(block)) problems.push('变更记录块里出现本站自发的有效性结论');
      }
      if (sampleWithout) {
        const block = rc.historyBlockHtml(sampleWithout);
        if (!block.includes(wording.HISTORY_LABELS.empty)) problems.push('无变更记录的条目没有明说「暂无变更记录」（空白冒充「没有变化」）');
        if (!block.includes(wording.HISTORY_NOTES.emptyNote)) problems.push('无变更记录的条目缺少「起算日之前没有历史」的说明');
        if (!block.includes('data-hist-total="0"')) problems.push('无变更记录的条目缺少 data-hist-total="0"');
      }
      if (!sampleWith) console.log(`    ℹ️  本次历史里还没有任何事件（起算日 ${store.store.startedAt}）——「有事件」那条断言本轮没有样本`);

      // 静态详情页（写盘路径与本函数不同）必须也带上这一块
      const firstDealId = (payload.deals.find(deal => deal.type === 'deal') || {}).id;
      if (firstDealId) {
        const page = path.join(OUT, 'deal', firstDealId, 'index.html');
        if (fs.existsSync(page)) {
          const html = fs.readFileSync(page, 'utf8');
          if (!html.includes(wording.HISTORY_LABELS.sectionTitle)) problems.push('详情页里没有变更记录块');
        }
      }

      if (problems.length) fail(`变更记录（v1.4）：${problems.slice(0, 6).join('；')}`);
      else {
        console.log(`  ✓ 变更记录: 日志 ${history.eventsOf(store.store).length} 条事件注入 ${injected} 条记录` +
          `（共 ${withEvents} 条渲染事件）· 起算日 ${store.store.startedAt} · 措辞与后端逐项同源`);
      }
    }
  }

  // ---- v1.5：变化雷达（首页条带 + /changes/ 静态页）-------------------------
  //
  // 这一层的坏法全部是「页面看起来正常」：条带注入漏了 → 首页那一行变成一句空态；
  // 窗口算错 → 三天前新增的条目哪儿都不显示；链接前缀写错 → 页面全对而内链全 404；
  // 措辞被人顺手改了 → 两处的说法开始分家。所以这里不是「文件存在就算过」，
  // 而是**三方对账**：条带 ↔ /changes/ 页 ↔ 日志与记录。
  if (!built.radar) {
    fail('变化雷达：assemble() 没有把 radar 交给自检（自检无法对账）');
  } else {
    const problems = [];
    const radar = built.radar;
    const W = changes.CHANGES_WORDING;
    const SECTION_KEYS = changes.SECTION_ORDER;
    const rc = loadRenderCore(path.join(OUT, 'index.html'));
    const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
    const strip = (indexHtml.match(/<nav class="radar"[\s\S]*?<\/nav>/) || [''])[0];
    const pageFile = path.join(OUT, 'changes', 'index.html');
    const highValueTotal = SECTION_KEYS.reduce((sum, key) => sum + (Number(radar.totals[key]) || 0), 0);

    // 常驻线索入口的真值（2026-11）：五个分栏 items 里 `lead === true` 的**去重**条数 ——
    // 也就是 `/changes/` 会渲染出的 `.leadcard` 集合（与 RENDER-CORE 的 `radarLeadEntryOf()`
    // 同一判据的构建期实现）。⚠️ 不能拿 deals.json 全量算：`itemsPerSection` 的截断会让
    // 它大于页面实际卡数，入口上的数字就会与读者数到的卡数对不上。
    const leadIdsInSections = new Set();
    for (const key of SECTION_KEYS) {
      const section = radar.sections && radar.sections[key];
      for (const item of (section && section.items) || []) {
        if (item && item.lead === true) leadIdsInSections.add(item.id);
      }
    }
    const leadCount = leadIdsInSections.size;

    // ① 首页条带：存在、总数与分栏一致、只有链接没有控件、入口在横滑区外
    if (!strip) {
      problems.push('首页没有变化雷达条带（预渲染标记没被替换？）');
    } else {
      const total = (strip.match(/data-radar-total="(\d+)"/) || [])[1];
      const other = (strip.match(/data-radar-other="(\d+)"/) || [])[1];
      if (total !== String(highValueTotal)) problems.push(`条带 data-radar-total=${total} ≠ 分栏合计 ${highValueTotal}`);
      if (other !== String(radar.totals.other)) problems.push(`条带 data-radar-other=${other} ≠ 其他变化 ${radar.totals.other}`);
      if (/<(button|input|select)\b/i.test(strip)) problems.push('条带里出现了 JS 控件（无 JS 时就是死按钮）');
      if (!/class="rmore" href="changes\/"/.test(strip)) problems.push('条带缺少指向 /changes/ 的入口（或前缀写错）');
      const scrollEnd = strip.indexOf('</div>');
      const moreAt = strip.indexOf('class="rmore"');
      if (moreAt >= 0 && scrollEnd >= 0 && moreAt < scrollEnd) {
        problems.push('「全部变化」入口落在横滑容器里（窄屏上会被滑走）');
      }
      // 条带里的条目必须**逐项等于** radar.home（顺序也算：优先级的唯一出处是 changes.HOME_PRIORITY）
      const stripIds = [...strip.matchAll(/class="ritem" data-deal-id="([0-9a-f]+)"/g)].map(m => m[1]);
      const homeIds = radar.home.items.map(item => item.id);
      if (JSON.stringify(stripIds) !== JSON.stringify(homeIds)) {
        problems.push(`条带条目与 radar.home 不一致（条带 ${stripIds.join(',') || '空'} / 数据 ${homeIds.join(',') || '空'}）`);
      }
      if (!radar.home.items.length && !leadCount && !/class="rnone"/.test(strip)) {
        problems.push('条带没有条目（也没有线索入口）时也没有明确空态');
      }
      // ---- 常驻线索入口（B 类未核验线索，2026-11）-------------------------------
      // 坏法全部是「页面看起来正常」：入口没了 / 计数与页面卡数对不上 / N=0 时还挂着入口 /
      // 显示封顶与数据层漂移。真值在 radar（构建期直接算），页面侧再数一遍 `.leadcard`。
      {
        const chip = strip.match(/class="rleadcount" data-lead-count="(\d+)"/);
        const changesHtml = fs.readFileSync(pageFile, 'utf8');
        const leadCardsOnPage = (changesHtml.match(/<article class="leadcard"/g) || []).length;
        if (leadCount > 0) {
          if (!chip) {
            problems.push(`条带缺少常驻线索入口（雷达五栏里 ${leadCount} 条线索）`);
          } else if (Number(chip[1]) !== leadCount) {
            problems.push(`条带 data-lead-count=${chip[1]} ≠ 雷达五栏去重后的线索 ${leadCount} 条`);
          }
        } else if (chip) {
          problems.push(`条带挂了线索入口（data-lead-count=${chip[1]}），但雷达五栏里一条线索都没有 —— N=0 时整块不渲染`);
        }
        if (leadCardsOnPage !== leadCount) {
          problems.push(`/changes/ 的 .leadcard ${leadCardsOnPage} 张 ≠ 雷达线索真值 ${leadCount} 条（入口计数会与页面卡数对不上）`);
        }
        if (chip && leadCount > 0) {
          // 锚点必须真的落在 /changes/ 上（否则首页那个链接是死锚）。锚点身份来自 identityOf()。
          const anchor = (strip.match(/class="rleadcount"[^>]*href="changes\/#([^"]+)"/) || [])[1] || '';
          if (!anchor || !changesHtml.includes(`id="${anchor}"`)) {
            problems.push(`线索入口的 changes/ 锚点${anchor ? `「${anchor}」` : '缺失'}在 /changes/ 页上没有落点（死锚）`);
          }
          // 显示封顶必须与数据层同值：用 `LIMITS.LEAD_CHIP_MAX + 1` 条合成线索现渲染一次，
          // 文案应是 countMore 的封顶形式（「3+ 条 →」）。两边漂移 = 读者看到的数字错。
          const cap = changes.LIMITS.LEAD_CHIP_MAX;
          const synthetic = {
            availability: 'ok', asOf: radar.asOf, startedAt: radar.startedAt,
            totals: { created: 0, changed: 0, endingSoon: 0, ended: 0, restored: 0, other: 0 },
            home: { items: [] },
            sections: Object.fromEntries(SECTION_KEYS.map(key => [key, { items: [], truncated: 0 }]))
          };
          synthetic.sections.created.items = Array.from({ length: cap + 1 }, (_, index) => {
            const id = `fffffffff${String(index).padStart(3, '0')}`;
            return { id, kind: 'created', lead: true, titled: true, title: '合成线索', anchor: `lead-${id}` };
          });
          const syntheticStrip = rc.changesStripHtml(synthetic);
          const syntheticCount = (syntheticStrip.match(/data-lead-count="(\d+)"/) || [])[1];
          const expectedText = W.CHANGES_LEAD.countMore.replace('{n}', String(cap));
          if (syntheticCount !== String(cap + 1) || !syntheticStrip.includes(expectedText)) {
            problems.push(`线索入口的显示封顶与 LIMITS.LEAD_CHIP_MAX=${cap} 不一致` +
              `（合成 ${cap + 1} 条时 data-lead-count=${syntheticCount || '缺失'}，文案应含「${expectedText}」）`);
          }
        }
      }
    }

    // ② 覆盖不变量：窗口内的事件必须**一条不漏**地出现在某个分栏或「其他变化」里。
    //    这是拿日志直接算的（不是拿 radar 自证），因此能抓住「buildRadar 把某类事件丢了」。
    if (radar.availability === 'ok') {
      const store = history.load();
      const events = history.eventsOf(store.store);
      const recentFrom = changes.addDays(radar.asOf, -(changes.WINDOWS.recentDays - 1));
      const endedFrom = changes.addDays(radar.asOf, -(changes.WINDOWS.endedDays - 1));
      const inRecent = events.filter(event => event.at >= recentFrom && event.at <= radar.asOf);
      const olderLifecycle = events.filter(event =>
        (event.type === 'ended' || event.type === 'restored') && event.at >= endedFrom && event.at < recentFrom);
      // ⚠️ 只数**事件**来源的分栏：`endingSoon` 是状态量（由 deals.json 的 expiresAt 现算），
      // 它不对应日志里的任何一条事件 —— 把它算进覆盖数会让这条不变量永远差几条。
      // 这条是演练抓出来的（非空数据上才暴露，空态下恒等于 0 看不出来）。
      const covered = ['created', 'changed', 'ended', 'restored']
        .reduce((sum, key) => sum + (Number(radar.totals[key]) || 0), 0) + (Number(radar.totals.other) || 0);
      if (covered !== inRecent.length + olderLifecycle.length) {
        problems.push(`覆盖不变量不成立：日志窗口内 ${inRecent.length + olderLifecycle.length} 条事件，` +
          `雷达只覆盖了 ${covered} 条（分栏 ${['created', 'changed', 'ended', 'restored'].map(k => `${k} ${radar.totals[k]}`).join(' + ')} + 其他 ${radar.totals.other}）`);
      }
      // 已离开数据集的条目：要么有详情页可链，要么**没有**链接（不许有半条死链）
      const dealDirs = fs.existsSync(path.join(OUT, 'deal')) ? new Set(fs.readdirSync(path.join(OUT, 'deal'))) : new Set();
      const dangling = SECTION_KEYS
        .flatMap(key => radar.sections[key].items)
        .filter(item => item.href && !dealDirs.has(item.id));
      if (dangling.length) problems.push(`雷达指向了不存在的详情页: ${dangling.slice(0, 3).map(i => i.id).join(', ')}`);
    }

    // ③ /changes/ 页：四条约定（预渲染 / 无 JS 可读 / sitemap / JSON-LD）——
    //    原来的第五条「双 feed」已随订阅层下架删除（下面紧邻处写明了它为什么失去对象）。
    if (!fs.existsSync(pageFile)) {
      problems.push('缺少 changes/index.html');
    } else {
      const page = fs.readFileSync(pageFile, 'utf8');
      const noScript = page.replace(/<script[\s\S]*?<\/script>/gi, '');
      if (!page.includes(`<link rel="canonical" href="${SITE_URL}changes/">`)) problems.push('changes/ 的 canonical 不是自指');
      // t4 删掉了「这一页声明了变化 Feed（`feed/changes.xml|json`）」那条断言 —— 它守的是**按变化流
      // 一份**的那一族订阅源，而 v3.2 请回来的是**站点级两条**（`feed.FEED_FILES`）。
      // ⚠️ 这不是"声明面没人管了"：构建期由上面的「订阅声明面」块对账（扫描面 = 全部 .html，
      // 路由 / 条数 / type 集合 / 绝对 URL），产物验收那一侧是 `tools/verify-site.js` 的
      // `subscriptionDeclarationProblem()`（唯一判据：href 落点真实存在且非空 + 条数 + type 集合
      // 不重不漏 + 保留 hreflang 那半边）。
      if (/__[A-Z_]+_HREF__/.test(page)) problems.push('changes/ 残留路由占位符');
      let ldTypes = [];
      try {
        ldTypes = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
          .map(m => JSON.parse(m[1])['@type']);
      } catch (error) {
        problems.push(`changes/ JSON-LD 解析失败: ${error.message}`);
      }
      const expectedLd = ['BreadcrumbList', 'CollectionPage', 'ItemList'];
      if (JSON.stringify(ldTypes.slice().sort()) !== JSON.stringify(expectedLd)) {
        problems.push(`changes/ JSON-LD 集合不是恰好 [${expectedLd.join(', ')}]，实得 [${ldTypes.slice().sort().join(', ')}]`);
      }
      // 分栏标题与总数必须来自权威表（标题在 CHANGES_SECTION，条数在 totals）。
      // ⚠️ 历史日志**不可用**时页面按纪律不渲染分栏、改说「没有拿到历史日志」——
      //    那种情况下这一组断言换成对「不可用文案」的断言（那一句本身在 ⑥ 里另有渲染器级的牙）。
      const historyLogUnavailable = Boolean((built.logAvailability || [])
        .find(item => item.id === 'deal-history' && item.availability !== 'ok'));
      if (historyLogUnavailable) {
        if (!noScript.includes(W.CHANGES_NOTES.unavailable)) {
          problems.push('changes/ 在历史日志不可用时没有明说「没有拿到历史日志」');
        }
        // ⚠️ 只查**优惠雷达自己的分栏**（`<section class="chgsec" id="<key>">`）：
        //    套餐 / API 那两块有各自的日志，它们的「今日新增（n）」子标题与这一条无关。
        const ownSections = SECTION_KEYS
          .filter(key => new RegExp(`<section class="chgsec" id="${key}"`).test(noScript));
        if (ownSections.length) {
          problems.push(`changes/ 在历史日志不可用时仍渲染了优惠雷达的分栏（${ownSections.join(', ')}）——`
            + '会把「没有拿到日志」伪装成「没有变化」');
        }
      } else {
        for (const key of SECTION_KEYS) {
          const heading = W.CHANGES_SECTION[key] + '（' + (Number(radar.totals[key]) || 0) + '）';
          if (!noScript.includes(heading)) problems.push(`changes/ 缺少分栏标题「${heading}」`);
        }
        if (!noScript.includes(W.CHANGES_LABELS.other)) problems.push('changes/ 缺少「不计入高价值的其他变化」块');
        if (!noScript.includes(changes.CHANGES_WORDING.CHANGES_NOTES.soonBasis)) problems.push('changes/ 缺少「即将结束」的判据说明');
        if (!noScript.includes(history.HISTORY_WORDING.HISTORY_NOTES.disclaimer)) problems.push('changes/ 缺少固定免责句');
        // 空态必须按原因分开说：数据里一条截止日期都没有 ≠ 有但都不在窗口内
        const emptySoon = radar.coverage.dealsWithExpiresAt === 0
          ? W.CHANGES_EMPTY.endingSoonNone
          : W.CHANGES_EMPTY.endingSoonLater.replace('{n}', String(radar.coverage.dealsWithExpiresAt))
            .replace('{days}', String(radar.windows.soonDays));
        if (!radar.sections.endingSoon.items.length && !noScript.includes(emptySoon)) {
          problems.push('changes/ 的「即将结束」空态没有说清是哪种空（数据缺口 vs 窗口内没有）');
        }
      }
      // 行 ↔ 数据双向对账：页面上的详情页链接集合 == 可链接条目集合。
      // ⚠️ 折叠块（其他变化）里的行**也会**链到详情页 —— 只数五个分栏会误报「多了几条」。
      const allItems = SECTION_KEYS.flatMap(key => radar.sections[key].items)
        .concat(radar.other.cosmetic || [], radar.other.metadata || []);
      const onPage = new Set([...noScript.matchAll(/href="\.\.\/deal\/([^/"]+)\/"/g)].map(m => decodeURIComponent(m[1])));
      const linkable = new Set(allItems.filter(item => item.href).map(item => item.id));
      const missing = [...linkable].filter(id => !onPage.has(id));
      const extra = [...onPage].filter(id => !linkable.has(id));
      if (missing.length) problems.push(`changes/ 漏了 ${missing.length} 条可链接条目（如 ${missing.slice(0, 3).join(', ')}）`);
      if (extra.length) problems.push(`changes/ 多了 ${extra.length} 条不在雷达里的链接（如 ${extra.slice(0, 3).join(', ')}）`);

      // ---- 行 ↔ ItemList 双向对账（v1.5 修复 P1-4 / F-r1-history-ai-001）------------
      //
      // 三份集合必须**逐条相等**，缺一不可：
      //   ① 判据层去重后的可链接集合（`changes.itemListRecords()`，唯一出处）；
      //   ② 页面 ItemList 的成员（从磁盘回读 JSON-LD，不信内存里那一段）；
      //   ③ 页面上的 `data-item` 行（SEO 门禁数的就是它）。
      // 修复前这三份各算各的（声明数取五栏 totals、元素按栏遍历不去重、行标记根本没有），
      // 只要有 1 条变化就必然对不上 —— 而这一页在生产数据上恒为 0 条，所以从未暴露。
      {
        const expectedIds = (built.changesItemList || []).map(record => record.id);
        const markers = [...noScript.matchAll(/data-item="([^"]*)"/g)].map(m => decodeEntities(m[1]));
        const list_ = seo.itemListOf(seo.jsonLdBlocks(page).blocks);
        if (!list_) {
          problems.push('changes/ 没有 ItemList 结构化数据（page-kinds 对 changes 声明它在场）');
        } else {
          const ids = list_.elements.map(element => {
            const rel = String(element.url || '').replace(SITE_URL, '');
            const match = rel.match(/^deal\/([^/]+)\/$/);
            return match ? decodeURIComponent(match[1]) : `（非法 url：${element.url}）`;
          });
          if (Number(list_.numberOfItems) !== list_.elements.length) {
            problems.push(`changes/ ItemList 声明 ${list_.numberOfItems} 项，实际发出 ${list_.elements.length} 项`);
          }
          if (list_.elements.length !== expectedIds.length) {
            problems.push(`changes/ ItemList ${list_.elements.length} 项 ≠ 去重后的可链接记录 ${expectedIds.length} 条`);
          }
          if (new Set(ids).size !== ids.length) {
            const dup = ids.filter((id, index) => ids.indexOf(id) !== index);
            problems.push(`changes/ ItemList 里同一记录出现多次（${[...new Set(dup)].slice(0, 3).join(', ')}）`);
          }
          const same = (a, b) => a.length === b.length && a.every(id => b.includes(id));
          if (!same(ids, expectedIds)) {
            const onlyList = ids.filter(id => !expectedIds.includes(id));
            const onlyJudge = expectedIds.filter(id => !ids.includes(id));
            problems.push(`changes/ ItemList 成员与判据集合不一致（多 ${onlyList.length} / 少 ${onlyJudge.length}：` +
              `${[...onlyList, ...onlyJudge].slice(0, 3).join(', ')}）`);
          }
          if (markers.length !== list_.elements.length) {
            problems.push(`changes/ 页面 ${markers.length} 个 data-item 行 ≠ ItemList ${list_.elements.length} 项`);
          }
          if (new Set(markers).size !== markers.length) {
            problems.push(`changes/ 页面上的 data-item 有重复（一个记录应当只有一行代表）`);
          }
          if (!same(markers, ids)) {
            const stray = markers.filter(id => !ids.includes(id));
            problems.push(`changes/ ItemList 成员在本页可见行里找不到对应行（${stray.slice(0, 3).join(', ') || '行集合不同'}）`);
          }
          for (const id of markers) {
            if (!onPage.has(id)) problems.push(`changes/ data-item 行 ${id} 在页面上没有对应链接（行与链接分了家）`);
          }
        }
      }
      // 预渲染正文（无 JS 可读）。阈值按「固定说明 700 + 每条实际渲染行 40 字」算
      //（唯一出处：`changes.changesPageTextFloor(radar)`，乘数为 `renderOrderOf(radar).length`）：
      // 实测空态页约 900 字，每条渲染行约 40–120 字。不能乘截断前的事件总数 `totals`——
      // 分栏按 `itemsPerSection=30` 封顶、线索跨栏去重，超出事件并不渲染成行
      // （issue #154：242 条事件里 144 条被截断，旧写法算出 10380 字 > 实测 10291 字，连续停版）。
      const text = prerenderedText(page);
      const renderedRows = changes.renderOrderOf(radar).length;
      const floor = changes.changesPageTextFloor(radar);
      if (text.length < floor) {
        problems.push(`changes/ 预渲染正文过短（${text.length} 字 < ${floor}，按 ${renderedRows} 条实际渲染行）`);
      }
      // 其它变化必须**显式列出**（不是悄悄丢掉）
      if (radar.totals.other > 0 && !noScript.includes('class="chgother"')) problems.push('有其他变化却没有列出折叠块');

      // ---- v2.3：套餐变化块（同一页的第二个事实面）---------------------------------
      //
      // 三条：① 锚点导航与 #plans / #deals 落点都在；② 四栏标题与条数来自套餐雷达
      // （权威表是 `plan-changes.js`）；③ 块里列出的变化条数 == 雷达条数（不许少一条）。
      const planW = planChanges.PLAN_CHANGES_WORDING;
      if (!page.includes('class="chgjump"')) problems.push('changes/ 缺少「优惠变化 / 套餐变化 / API 价格变化」锚点导航');
      if (!page.includes('id="deals"') || !page.includes('id="plans"')) problems.push('changes/ 的锚点导航没有落点（#deals / #plans）');
      // v3.0 Stage H1：三条变化流必须**都能从导航直达**（读者要能区分它们，而不是滚到一起）。
      for (const [href, label] of [['#deals', '优惠变化'], ['#plans', '套餐变化'], ['#api-plans', 'API 价格变化']]) {
        if (!page.includes(`href="${href}"`)) problems.push(`changes/ 的锚点导航缺少「${label}」（${href}）`);
      }
      // t4 删掉了「这一页声明了套餐变化 Feed（`feed/plans/coding/changes.*`）」那条断言：
      // 按变化流一份的那一族没有回来，v3.2 请回来的是站点级两条（见上面 /changes/ 那一处的注释：
      // 构建期由「订阅声明面」块对账，产物验收由 verify-site 的声明制判据判）。
      if (!noScript.includes(planW.PLAN_CHANGES_LABELS.sectionTitle)) problems.push('changes/ 缺少「套餐变化」分栏标题');
      const planBlock = (noScript.match(/<section class="chgsec pchanges" id="plans">[\s\S]*?<\/section>/) || [])[0] || '';
      if (!planBlock) problems.push('changes/ 缺少套餐变化块');
      else if (built.planRadar.availability !== 'ok') {
        // t29：套餐变化日志**不可用**时，这一块按纪律只留那一句「没有拿到日志」——
        // 「不可用」与「没有变化」不许混为一谈（t4/t7 的 e2 口径：不可用时整块不渲染分栏）。
        // 所以这里判的是**相反方向**：分栏标题与变化行一个都不许出现，而那句说明必须出现。
        if (!planBlock.includes(planW.PLAN_CHANGES_LABELS.unavailable)) {
          problems.push('套餐变化日志不可用时没有说清「没有拿到日志」');
        }
        for (const key of planChanges.PLAN_CHANGES_SECTION_ORDER) {
          const label = planW.PLAN_CHANGES_SECTION[key];
          if (planBlock.includes(label)) problems.push(`套餐变化日志不可用，却出现了分栏「${label}」`);
        }
        if (/<li>/.test(planBlock)) problems.push('套餐变化日志不可用，却列出了变化行');
      } else {
        for (const key of planChanges.PLAN_CHANGES_SECTION_ORDER) {
          const heading = planW.PLAN_CHANGES_SECTION[key] + '（' + (Number(built.planRadar.totals[key]) || 0) + '）';
          if (!planBlock.includes(heading)) problems.push(`套餐变化块缺少分栏标题「${heading}」`);
        }
        const listed = (planBlock.match(/<li>/g) || []).length;
        const expected = planChanges.PLAN_CHANGES_SECTION_ORDER
          .reduce((sum, key) => sum + built.planRadar.sections[key].items.length, 0);
        if (listed !== expected) problems.push(`套餐变化块列出 ${listed} 条 ≠ 雷达 ${expected} 条`);
        // 句子要用与渲染层同一份上下文（币种 / 额度单位从套餐记录里取），否则会写出「20 → 10」
        const planSentenceOpts = {
          plansById: new Map(built.plansStore.plans.map(p => [p.id, p])),
          providerTable: providers.load().table
        };
        for (const item of planChanges.itemsOf(built.planRadar)) {
          const sentence = plansPage.escapeHtml(plansPage.planChangeTextOf(item, planSentenceOpts));
          if (!planBlock.includes(sentence)) problems.push(`套餐变化块缺少一条变化：「${sentence}」`);
        }
        // 深链锚点：每一条套餐变化都要能落到套餐对比页的那一行上
        const plansPageHtml = fs.readFileSync(path.join(OUT, plansPage.PLANS_ROUTE, 'index.html'), 'utf8');
        const anchors = [...planBlock.matchAll(/href="#plan-([0-9a-f]{12})"/g)].map(m => m[1]);
        const dangling = anchors.filter(id => !plansPageHtml.includes(`id="plan-${id}"`));
        if (dangling.length) problems.push(`套餐变化块里有 ${dangling.length} 条锚点没有落点（如 ${dangling[0]}）`);
      }

      // ---- v3.0 Stage H1：API 价格变化块（同一页的第三个事实面）-----------------------
      //
      // 与套餐那一段逐条对应，另外多两条这一支特有的：
      //   · 链接**跨页**落到 `/plans/api/#plan-<id>`（这一页上没有 API 表格行）；
      //   · 判据来自 `api-plan-history`（`built.apiPlanRadar`），没有第二套变化检测。
      const apiW = planChanges.API_PLAN_CHANGES_WORDING;
      if (!page.includes(`id="api-plans"`)) problems.push('changes/ 缺少 API 价格变化块的锚点落点（#api-plans）');
      // t4：同上一处：这一页原先还断言声明了「API 价格变化」订阅源，随订阅层一起删除。
      // 「三条变化流都能从导航直达」那一条断言（上面 #deals / #plans / #api-plans 锚点）**保留** ——
      // 它判的是页面自己能不能被读者读懂，与订阅无关。
      if (!noScript.includes(apiW.API_PLAN_CHANGES_LABELS.sectionTitle)) {
        problems.push('changes/ 缺少「API 价格变化」分栏标题');
      }
      const apiBlock = (noScript.match(/<section class="chgsec apichanges" id="api-plans">[\s\S]*?<\/section>/) || [])[0] || '';
      if (!apiBlock) problems.push('changes/ 缺少 API 价格变化块');
      else if (built.apiPlanRadar.availability !== 'ok') {
        // t29：与套餐那一块同一口径 —— 日志不可用 ⇒ 只留「没有拿到日志」那一句，
        // 分栏标题与变化行一个都不许出现（不可用 ≠ 没有变化）。
        if (!apiBlock.includes(apiW.API_PLAN_CHANGES_LABELS.unavailable)) {
          problems.push('API 计费变化日志不可用时没有说清「没有拿到日志」');
        }
        for (const key of planChanges.PLAN_CHANGES_SECTION_ORDER) {
          const label = apiW.API_PLAN_CHANGES_SECTION[key];
          if (apiBlock.includes(label)) problems.push(`API 计费变化日志不可用，却出现了分栏「${label}」`);
        }
        if (/<li>/.test(apiBlock)) problems.push('API 计费变化日志不可用，却列出了变化行');
      } else {
        for (const key of planChanges.PLAN_CHANGES_SECTION_ORDER) {
          const heading = apiW.API_PLAN_CHANGES_SECTION[key] + '（' + (Number(built.apiPlanRadar.totals[key]) || 0) + '）';
          if (!apiBlock.includes(heading)) problems.push(`API 价格变化块缺少分栏标题「${heading}」`);
        }
        const listedApi = (apiBlock.match(/<li>/g) || []).length;
        const expectedApi = planChanges.PLAN_CHANGES_SECTION_ORDER
          .reduce((sum, key) => sum + built.apiPlanRadar.sections[key].items.length, 0);
        if (listedApi !== expectedApi) problems.push(`API 价格变化块列出 ${listedApi} 条 ≠ 雷达 ${expectedApi} 条`);
        // 句子必须与订阅正文/`/plans/api/` 是同一句（同一个函数渲染，两边不可能分家）
        for (const item of planChanges.itemsOf(built.apiPlanRadar)) {
          const sentence = apiPlansPage.escapeHtml(apiPlansPage.apiPlanChangeTextOf(item));
          if (sentence && !apiBlock.includes(sentence)) problems.push(`API 价格变化块缺少一条变化：「${sentence}」`);
        }
        // 跨页深链：每一条 API 变化都要落到 **/plans/api/** 的那一行上（不是本页锚点）
        const apiPageHtml = fs.readFileSync(path.join(OUT, apiPlansPage.API_PLANS_ROUTE, 'index.html'), 'utf8');
        const apiAnchors = [...apiBlock.matchAll(/href="\.\.\/plans\/api\/#plan-([0-9a-f]{12})"/g)].map(m => m[1]);
        const apiDangling = apiAnchors.filter(id => !apiPageHtml.includes(`id="plan-${id}"`));
        if (apiDangling.length) problems.push(`API 价格变化块里有 ${apiDangling.length} 条跨页锚点没有落点（如 ${apiDangling[0]}）`);
        if (expectedApi > 0 && apiAnchors.length !== expectedApi) {
          problems.push(`API 价格变化块的跨页深链 ${apiAnchors.length} 条 ≠ 变化 ${expectedApi} 条（有行没有链接）`);
        }
      }
    }

    // ④ 措辞同源：前端那份受控副本与 lib/changes.js 的权威表逐项比对
    const wording = audience.parseWordingBlock(audience.extractWordingBlock(appAsset.SOURCE)) || {};
    for (const group of Object.keys(W)) {
      const expected = W[group];
      const actual = wording[group];
      if (!actual || typeof actual !== 'object') { problems.push(`产物里缺 ${group}（变化雷达的措辞副本没了）`); continue; }
      for (const key of Object.keys(expected)) {
        if (actual[key] !== expected[key]) problems.push(`${group}.${key}：前端「${actual[key]}」≠ 权威表「${expected[key]}」`);
      }
    }
    // 模板必须真的带槽位（有人把 {date} / {n} 删掉、改成写死一句话时，两端字符串仍然「相等」）
    for (const [group, key] of [['CHANGES_LABELS', 'base'], ['CHANGES_LABELS', 'more'], ['CHANGES_LABELS', 'homeEmptyShort'], ['CHANGES_EMPTY', 'endingSoonLater'], ['CHANGES_SOON', 'days'], ['CHANGES_LEAD', 'count'], ['CHANGES_LEAD', 'countMore']]) {
      if (!String(W[group][key]).includes('{')) problems.push(`${group}.${key} 的槽位丢了（退化成写死的一句话）`);
    }

    // ⑤ 红线：我们**自己写的字**里不许出现本站自发的有效性结论（数据里的原文不扫）
    const ownWords = Object.keys(wording)
      .filter(group => group.startsWith('CHANGES_') || group.startsWith('HISTORY_'))
      .flatMap(group => Object.values(wording[group] || {}))
      .map(String);
    for (const stamp of provenance.STAMP_PATTERNS) {
      const hit = ownWords.filter(value => stamp.re.test(value));
      if (hit.length) problems.push(`雷达措辞里出现本站自发的有效性结论（${stamp.why}）：${hit.slice(0, 2).join(' / ')}`);
    }

    // ⑥ 「不可用」与「没有变化」必须是两句不同的话（拿渲染器直接断言，不靠人读代码）
    const unavailableRadar = changes.buildRadar({ deals: [], store: null, asOf: radar.asOf, availability: 'unavailable' });
    const unavailableStrip = rc.changesStripHtml(unavailableRadar);
    const unavailablePage = rc.changesPageHtml(unavailableRadar, '../');
    if (!unavailableStrip.includes(W.CHANGES_NOTES.unavailable) || !unavailablePage.includes(W.CHANGES_NOTES.unavailable)) {
      problems.push('历史日志不可用时，条带或页面没有明说「没有拿到历史日志」');
    }
    if (unavailablePage.includes(W.CHANGES_EMPTY.created)) problems.push('日志不可用时页面用「没有变化」冒充了「不可用」');

    if (problems.length) fail(`变化雷达（v1.5）：${problems.slice(0, 6).join('；')}`);
    else {
      console.log(`  ✓ 变化雷达: 条带 ${radar.home.items.length} 项 / 分栏合计 ${highValueTotal} 条 · 其他 ${radar.totals.other} 条` +
        ` · /changes/ 五栏 + 折叠块齐 · 覆盖不变量成立 · 措辞与 lib/changes.js 逐项同源`);
    }
  }

  // 数据源状态页：与 source-health.json 逐个来源对账（状态标签、条数、行数），
  // 而不是只看「文件存在」——状态页最容易的坏法是「页面上写着正常，数据里其实是失败」。
  const statusFile = path.join(OUT, 'status', 'index.html');
  if (!fs.existsSync(statusFile)) fail('缺少 status/index.html');
  else {
    const page = fs.readFileSync(statusFile, 'utf8');
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'data', 'source-health.json'), 'utf8'));
    const summary = health.summarize(doc);
    const rows = [...page.matchAll(/<span class="stt ([a-z]+)">/g)].map(m => m[1]);
    const problems = [];
    if (summary.total !== built.healthSources) {
      problems.push(`来源数不一致：产物里 ${rows.length} 行 / 数据里 ${summary.total} 个`);
    }
    for (const row of summary.rows) {
      const expected = health.STATUS_LABEL[row.status];
      if (!page.includes(expected)) problems.push(`${row.source} 的状态标签 ${expected} 不在页面上`);
    }
    const expectedStatuses = summary.rows.map(row => row.status).sort().join(',');
    if (rows.slice().sort().join(',') !== expectedStatuses) {
      problems.push(`状态序列不一致：页面 ${rows.join(',')} / 数据 ${expectedStatuses}`);
    }
    if (summary.total > 0 && !/<time datetime="[^"]*"/.test(page)) {
      problems.push('状态页没有任何 <time datetime>（无 JS 时可读性依赖它）');
    }
    // P3 熔断：暂停行必须在页面上**行内可见**（文案与判定同源于 health.pausedLabel，不复制一份）。
    // 数据驱动：当前心跳若没有 pausedAt 这一条不触发；一旦采集写下暂停态、页面却漏渲染，
    // 这里当场红 —— 否则"某个源已经停了"又会被页面上"今天没数据"的样子吞掉。
    const pausedRows = summary.rows.filter(row => row.pausedAt);
    for (const row of pausedRows) {
      const marker = htmlEscape(health.pausedLabel(row));
      if (!marker || !page.includes(marker)) {
        problems.push(`来源 ${row.source} 处于熔断暂停态，但状态页没有渲染暂停标记（应有：${marker.slice(0, 80)}）`);
      }
    }
    if (summary.total === 0 && !/还没有采集记录/.test(page)) {
      problems.push('没有采集数据时，状态页必须明说，而不是给一张空表');
    }
    // t3：这里原先断言「状态页必须指向 source-health.json」。那条链接与它的断言**一起删** ——
    // 链接指向的是一份数据文件，而本轮的目标正是让产物里不再有可下载的数据文件、读者面也不再
    // 提它们。留着断言就等于强制一个谁都不想要的链接（那是"为了绿而绿"，比没有断言更糟）。
    // 注意：**数据侧**的对账（读产物里的 source-health.json、逐来源比对状态标签与行数）一条都没动 ——
    // 这一页仍然被断言"页面上的每个状态都真的等于数据里的状态"。

    // ── 五条既有约定：这一页原先只满足两条（预渲染、无 JS 可读）────────────────
    //
    // 为什么必须在这里断言：sitemap / feed / JSON-LD 三条当时根本没做，而
    // **没有任何东西会因此变红** —— 连 `verify-site.js` 都 0 处覆盖（子代理核查结论）。
    // 一条「写漏了不会红」的约定等于没有这条约定：它靠记性维持，而记性不随构建变红。
    // 分类页那三条能站住，靠的就是这一段形状的自检 + 浏览器侧各一条断言。
    if (!page.includes(`<link rel="canonical" href="${SITE_URL}status/">`)) problems.push('canonical 不是自指');
      // t4：这里原先有两条订阅声明断言（每页必须声明两个根 Feed / 有专属 Feed 的页面必须声明它）。
      // 订阅子系统整体下架之后页面不再声明任何 Feed，这两条一起删除。
    let statusLd = [];
    try {
      statusLd = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map(m => JSON.parse(m[1])['@type']);
    } catch (error) {
      problems.push(`JSON-LD 解析失败: ${error.message}`);
    }
    for (const need of ['WebPage', 'BreadcrumbList']) {
      if (!statusLd.includes(need)) problems.push(`缺少 JSON-LD ${need}`);
    }
    // 「多了」也要拦，而且要拦得完整（重复的 WebPage 也算多）。
    //
    // §10.4.1 明确写了这一页**不发** Dataset / ItemList，理由是「机器可读的那一份是
    // source-health.json，同一份事实声明两次、两次迟早分家，而分家时没有任何东西会红」。
    // 只断言「包含」的话，那句话本身就是一句没有守卫的承诺 —— 加第三个 JSON-LD
    // （乃至加一个 Dataset）谁都不会发现。独立验证代理指出的正是这一点。
    const STATUS_LD_EXPECTED = ['BreadcrumbList', 'WebPage'];
    const statusLdActual = statusLd.slice().sort();
    if (JSON.stringify(statusLdActual) !== JSON.stringify(STATUS_LD_EXPECTED)) {
      problems.push(`JSON-LD 集合不是恰好 [${STATUS_LD_EXPECTED.join(', ')}]，实得 [${statusLdActual.join(', ')}]`);
    }
    // 预渲染正文的**下限按状态分档**，两个数字都取自实测的**内容**长度（剥掉 style 之后）：
    //   · 9 个来源、表格正常 → 1188 字
    //   · 一个来源都没有（合法状态）→ 646 字，页面明说「还没有采集记录」
    //   · 有来源但**表格没渲染出来** → 约 600 字（页头页脚 + 说明段，表体是空的）
    //
    // 所以「有来源」那一档取 **900**：它必须**高于**表格消失时的字数，否则这条断言
    // 在「表没了」这个最该红的情况下只差几个字就放行（第一版取 600，正好卡在边界上 ——
    // 反证时实测到的）。空数据那一档取 350：它只需证明「页面不是空的」。
    const statusText = prerenderedText(page);
    const statusFloor = summary.total > 0 ? 900 : 350;
    if (statusText.length < statusFloor) {
      problems.push(`预渲染正文过短（内容 ${statusText.length} 字 < ${statusFloor}），无 JS 时读不到内容`);
    }
    // 光有长度不算数：内容里必须真的有那张表。这条与上面的字数是**互相独立**的两件事 ——
    // 字数够而表是空的，说明渲染路径断了；表在而字数不够，说明文案被丢了。
    // ⚠️ 先把 `<script>` 摘掉再取 tbody：本文件自己的纪律是「数标记先摘 script」，
    //    不摘的话，将来某个内联脚本里出现 `<tbody>…<tr>…</tr>…</tbody>` 就会让这条断言
    //    变成**永远为真**的空转（独立验证代理指出这一点）。
    const statusBody = (page.replace(/<script[\s\S]*?<\/script>/gi, '').match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
    if (summary.total > 0 && !/<tr>/.test(statusBody)) {
      problems.push('预渲染正文够长，但 <tbody> 里一行都没有（表格没渲染出来）');
    }
    if (ROUTE_MARKERS.some(marker => page.includes(marker))) problems.push('残留路由占位符');
    if (problems.length) fail(`数据源状态页：${problems.join('；')}`);
    else console.log(`  ✓ 数据源状态: ${summary.total} 个来源与 source-health.json 逐个对账一致` +
      `（正常 ${summary.healthy} · 异常 ${summary.degraded} · 失败 ${summary.failed}）` +
      // t4：措辞同步 —— 这一页原先还声明两个根 Feed，那两条约定随订阅层一起撤了；
      // 现在仍然逐条查的是 sitemap 成员、自指 canonical、JSON-LD 与预渲染正文长度。
      ` · 约定齐（sitemap/canonical/JSON-LD ${statusLd.length} 段/预渲染 ${statusText.length} 字）`);
  }

  // 译文必须真的落到产物里：浏览器 fetch('assets/data/offers.json') 拿的就是这一份，
  // 这里漏写不会报错，只会让线上详情页静悄悄没有中文。
  const zhDeals = payload.deals.filter(deal => deal.zh && Object.keys(deal.zh).length);
  const zhFields = zhDeals.reduce((n, deal) => n + Object.keys(deal.zh).length, 0);
  if (zhDeals.length !== built.zhWithZh) {
    fail(`译文没写进产物：贴了 ${built.zhWithZh} 条，产物里只有 ${zhDeals.length} 条`);
  } else if (zhDeals.length) {
    // 英文原文必须原样保留：译文只能新增字段，不能顶掉原文
    const clobbered = zhDeals.filter((deal, i) => {
      return Object.keys(deal.zh).some(key => {
        const value = deal[key];
        return typeof value !== 'string' || !value.trim();
      });
    });
    if (clobbered.length) fail(`译文顶掉了英文原文: ${clobbered.slice(0, 3).map(d => d.title).join('、')}`);
    else console.log(`  ✓ 中文译文: ${zhDeals.length} 条 / ${zhFields} 个字段（英文原文原样保留）`);
  }
  const markCount = ((fs.readFileSync(path.join(OUT, 'index.html'), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, '').match(/class="zhmark"/g)) || []).length;
  if (zhDeals.length && !markCount) fail('有译文但预渲染卡片上没有「中文」提示');
  if (markCount) console.log(`  ✓ 卡片「中文」提示: 预渲染 ${markCount} 处`);

  // 产物里不该出现源码/依赖/文档
  for (const forbidden of ['scripts', 'node_modules', 'package.json', 'package-lock.json', '.git', '.github', 'PROJECT_STATUS.md', 'README.md']) {
    if (fs.existsSync(path.join(OUT, forbidden))) fail(`产物中不应出现 ${forbidden}`);
  }

  // --- 预渲染与 SEO 自检 ---
  const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  // v6：主脚本已外链；下面这些「JS 里写死的口径」从产物里那份 app.<hash>.js 回读，
  // 而不是从 index.html 的内联脚本里找（后者已被 stageAppScript 搬走）。
  const appSource = fs.readFileSync(path.join(OUT, appAsset.FILE), 'utf8');
  // 内联脚本里含模板字符串字面量（class="go" / data-logo="…" 之类），
  // 数标记时必须先把 <script> 摘掉，否则会把源码当成已渲染的卡片数进去。
  //
  // `<style>` 同样要摘掉，而且**必须**摘：样式注释里写到某个控件标记（例如
  // 「实测 data-fav-prune 只在有失效收藏时出现」）时，标记扫描会把注释当成控件本身——
  // 本次就是这么假失败过一次。这与下面 tier 计数那次踩的是同一个坑
  // （CSS 选择器 `[data-tier="1"] .rnum` 被算成档位角标）：**要数的是元素，不是文本。**
  const markup = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');

  if (/PRERENDER:/.test(html)) fail('产物 index.html 仍残留 PRERENDER 标记');
  if (/__SITE_URL__/.test(html)) fail('产物 index.html 仍残留 __SITE_URL__ 占位');
  {
    // 页脚链接的占位符必须被各自那一份替换掉：残留会变成一条 404 的死链。
    //
    // 扫描面 = **全部输出深度 × 全部路由占位符**（`ROUTE_HREFS` / `ROUTE_MARKERS` 同源）。
    // 原先只查 `__STATUS_HREF__`，而且只抽查首页 / 状态页 / 详情页三处 ——
    // 于是加一条路由时「漏了某一层」不会有任何东西变红，直到有人正好从那一层点页脚。
    // 现在两层都做成结构性检查：漏一层、漏一条路由，都会指名道姓地报出来。
    const indexHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
    const dealDirs = fs.existsSync(path.join(OUT, 'deal')) ? fs.readdirSync(path.join(OUT, 'deal')) : [];
    const routeOutputs = [
      ['index.html', ''],
      ['status/index.html', '../'],
      // v1.5：变化雷达页（浅一层路由）
      ['changes/index.html', '../'],
      // t4：订阅中心（feeds/index.html）已随订阅子系统下架删除，不再进这张逐层扫描表。
      // v3.0：/plans/ 资料入口是**一层**路由 —— 深度写错的话这一页的页头/页脚内链全是 404，
      // 而页面本身看起来完全正常，所以它必须进这张逐层扫描表。
      [`${plansHubPage.PLANS_HUB_ROUTE}index.html`, '../'],
      // v3.0 Stage D5/D6：模型索引（一层）与模型详情（两层）。深度由路由段数推导。
      [`${modelsPage.MODELS_INDEX_ROUTE}index.html`, '../'],
      ...built.modelDetailRoutes.map(route => [`${route}index.html`, '../../']),
      // v3.0 Stage F：档案索引（一层）与档案详情（**三层**：`archive/<kind>/<id>/`）。
      // 前缀一律问 `lib/archive.js` 要（`routePrefixOf`）——构建期与渲染层因此只有**一份**深度真相，
      // 不可能再出现「页面写 '../../'、自检也写 '../../'」的镜像错误（审计 F-r1-history-ai-002）。
      [`${archiveLib.ARCHIVE_INDEX_ROUTE}index.html`, '../'],
      ...built.archiveDetailRoutes.map(route => [`${route}index.html`, archiveLib.routePrefixOf(route)]),
      // v3.0 Stage G：数据文档页（两层路由）。
      // v2.1：套餐对比页是**两层**深路由。深度写错的话，这一页的页头/页脚内链全是 404，
      // 而页面本身看起来完全正常 —— 所以它必须进这张逐层扫描表。
      [`${plansPage.PLANS_ROUTE}index.html`, '../../'],
      // v2.5：API 计费页同样是两层深路由，深度写错的话这一页的页头/页脚内链全是 404。
      [`${apiPlansPage.API_PLANS_ROUTE}index.html`, '../../'],
      // v3.1：API 成本计算器同样是两层深路由。
      [`${apiCostPage.API_COST_ROUTE}index.html`, '../../'],
      ...built.collectionPages.map(page => [`${page.slug}/index.html`, '../']),
      // v1.2 遗留的扫描盲区：按需求页是**两层**路由，却一直没进这张表 ——
      // 于是「某一层页脚的相对前缀写错」在那 10 个页面上不会被这条断言照到。
      // 补进来是顺手加固，不是本轮改动的一部分；真红了说明这里本来就有一条错链。
      ...built.needPages.map(page => [`${page.route}index.html`, '../../']),
      // v1.7：新增的四类页面（分类落地页/厂商落地页两层、枢纽页一层、别名页两层）。
      // 深度由路由段数推导，**不写死** —— 新页面少写一层前缀的症状是所有内链 404，
      // 而页面本身看起来完全正常。
      ...built.directoryPages
        .filter(page => page.kind === 'category' || page.kind === 'vendor' || page.kind === 'hub' || page.kind === 'alias')
        .map(page => [`${page.route}index.html`, '../'.repeat(page.route.split('/').filter(Boolean).length)]),
      ...dealDirs.map(id => [`deal/${id}/index.html`, '../../'])
    ];
    const leftovers = [];
    for (const [rel, prefix] of routeOutputs) {
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) { leftovers.push(`${rel}（文件缺失）`); continue; }
      const page = fs.readFileSync(file, 'utf8');
      for (const marker of ROUTE_MARKERS) {
        if (page.includes(marker)) leftovers.push(`${rel} 残留 ${marker}`);
      }
      // 正向断言：每一条路由都必须按**这一层**的深度解析出来。
      // 只查「没有残留」是不够的 —— 把整行页脚删掉同样没有残留。
      for (const [, target] of ROUTE_HREFS) {
        if (!page.includes(`href="${prefix}${target}"`)) leftovers.push(`${rel} 缺少 ${prefix}${target} 的链接`);
      }
    }
    if (leftovers.length) {
      fail(`页脚路由链接不对（残留占位符或深度前缀错误）：${leftovers.slice(0, 6).join('、')}` +
        `${leftovers.length > 6 ? ` 等 ${leftovers.length} 处` : ''}`);
    } else {
      console.log(`  ✓ 页脚路由链接: ${ROUTE_HREFS.length} 条路由 × ${routeOutputs.length} 个输出，深度前缀与去占位逐项对账`);
    }

    /* ---- v3.2：订阅声明面（构建期自检侧）-----------------------------------------------
     *
     * **唯一判据**是 `tools/verify-site.js` 的 `subscriptionDeclarationProblem()`（门禁 L4 逐页族跑：
     * 判 href 的落点是否真实存在且非空、type 集合、条数、以及"剩下的 alternate 必须带 hreflang"
     * 那半边）。这里**不复制**那条判据，只做构建期的**路由 / 条数 / 前缀**对账 —— fail-fast：
     * 产物还在暂存目录里就拦住，不必等到 L4。
     *
     * 冻结事实的出处 = 契约第 2.1 条：允许声明的路由只有首页 `''` 与 `changes/`，各 2 条；
     * 其余页面族（含 `deal/<id>/` 详情页那两条 hreflang）**0 条**带 `type` 的声明。
     * 条数与 type 一律从 `FEED_FILES` 现取 —— 本文件里没有第二个文件名 / MIME 字面量。
     *
     * 扫描面 = **产物里全部 .html**（不写一张"哪些页面族有声明"的清单：那种清单漏一族就静默失效，
     * 而"多出一族偷偷声明"正是这一面要拦的事）。
     */
    {
      const declProblems = [];
      const allowedRoutes = new Set(['', 'changes/']);
      const feedTypes = feed.FEED_FILES.map(([, type]) => type);
      const htmlFiles = listPageFiles(OUT);
      const seenRoutes = new Set();
      const declared = [];
      for (const file of htmlFiles) {
        const route = file.replace(/index\.html$/, '');
        const page = fs.readFileSync(path.join(OUT, file), 'utf8');
        // 「带 type 的 rel=alternate」= 这一行同时有 rel="alternate" 与某个订阅 MIME 的 type
        const lines = page.split(/\r?\n/).filter(line => /<link\b/.test(line) && /rel="alternate"/.test(line)
          && feedTypes.some(type => line.includes(`type="${type}"`)));
        if (!allowedRoutes.has(route)) {
          if (lines.length) {
            declProblems.push(`${route || '/'} 声明了 ${lines.length} 条订阅源（这一族必须是 0 条）`);
          }
          continue;
        }
        seenRoutes.add(route);
        declared.push({ route, lines });
      }
      for (const route of allowedRoutes) {
        if (!seenRoutes.has(route)) {
          // 首页与 /changes/ 都必须在扫描面里：少了哪一个，"这一族 0 条"的结论就自动成立，
          // 而那种"因为没扫到所以合格"正是扫描面收缩型失效（本仓踩过的老坑）。
          declProblems.push(`扫描面里没有 ${route || '/'} 这一页（声明面因此无从对账）`);
        }
      }
      for (const { route, lines } of declared) {
        const label = route || '/';
        const types = lines.map(line => (line.match(/\btype="([^"]+)"/) || [])[1]);
        if (lines.length !== feedTypes.length) {
          declProblems.push(`${label} 的订阅声明 ${lines.length} 条 ≠ FEED_FILES 的 ${feedTypes.length} 条`);
        }
        const missing = feedTypes.filter(type => !types.includes(type));
        const extra = types.filter(type => !feedTypes.includes(type));
        if (missing.length || extra.length) {
          declProblems.push(`${label} 的声明 type 不是 FEED_FILES 那一组`
            + `（缺 ${missing.join(' / ') || '无'} · 多 ${extra.join(' / ') || '无'}）`);
        }
        for (const line of lines) {
          const href = (line.match(/\bhref="([^"]*)"/) || [])[1] || '';
          if (!href.startsWith(SITE_URL)) declProblems.push(`${label} 的订阅声明不是 SITE_URL 开头的绝对 URL：${href}`);
        }
      }
      if (declProblems.length) {
        fail(`订阅声明面不对（${declProblems.length} 处）：${declProblems.slice(0, 4).join('；')}`
          + `${declProblems.length > 4 ? ` 等 ${declProblems.length} 处` : ''}`);
      } else {
        console.log(`  ✓ 订阅声明: 只有 ${[...allowedRoutes].map(route => route || '首页').join(' 与 ')}`
          + ` 各 ${feedTypes.length} 条（type 不重不漏、href 绝对）· 其余 ${htmlFiles.length - declared.length} 页 0 条`);
      }
    }

    // v3.1：页头那枚 GitHub 图标入口的**全站正向断言**（上面那条的表只覆盖「进过深度表」的页面族，
    // 而图标是**每一页都有**的页壳件，所以这里直接走遍产物里的全部 .html）。
    //
    // 判据本体从**产物首页的 SHARED:ghlink 区间现取** —— 那就是它的唯一出处，不在这里抄第二份
    // （抄一份 URL 或一段 SVG 路径进自检，就多一处会各自漂移的副本，正是本文件反复在拆的形状）。
    // 六条：① 片段**本身仍是一个入口**（形状断言：`<a class="ghlink">` + 绝对 https + target/rel
    //          + 可读名字 + 内含 `<svg>`，且 host 是 github.com）；
    //       ② 共享 `<style>` 里仍有 `.ghlink` 规则、且没有被 display:none / visibility:hidden 藏掉；
    //       ③ 每一页按**元素**数恰好 1 枚（class token 级），且与首页那一枚逐字节相同；
    //       ④ 出现在 `<header>` 区间里（不是被塞进页脚或正文）；
    //       ⑤ 页脚区间里**不许**再出现仓库入口（v3.1 把仓库入口从页脚移到页头，删掉的不许回流）——
    //          链接（带仓库域名的那种）与被删文案的回流（原样字面与等价写法两遍，见 ⑤b）都拦；
    //       ⑥ 扫描面 = 产物里**全部 .html**（不是只认 `index.html` 这条没人断言的命名约定）。
    //
    // 为什么必须有：图标指向的是**绝对 URL**，不像页脚那样有路由占位符 —— 「某一页少了图标」
    // 不触发任何既有断言（`scanResidue()` 只认登记过的字面），构建与浏览器验收都会一路绿。
    //
    // ⚠️ ①②是**补上来的**（独立复核的 medium 发现）：只判「唯一 / 位置 / 逐字节一致」时，下面这些
    // 失效全都能全绿地穿过去（复核方用本文件原样切片的代码 + 按 `lib/page-shell.js` 的方式重新注入，
    // 逐个实测过）：片段换成 `<span class="ghlink" aria-hidden="true"></span>`（全站没有入口了）、
    // 换成一句注释、删掉 title/aria-label（图标链接没有可读名字）、href 改成别的站或相对路径、
    // 去掉 `<svg>`、把共享 `<style>` 里 `.ghlink` 那一块整块删掉或加 `display:none`（产物里还在但看不见）。
    // ⚠️ 被删的那段页脚尾巴（` · GitHub 仓库`）**刻意不登记**进 `scripts/data/residue-guard.json` 的
    // deletedCopy：裸词「GitHub 仓库」现在活在页头的 title / aria-label 里（每页 2 次），登记它等于
    // 永久假红；而真正危险的两种回流都由上面第⑤条逐页守着 —— 仓库**链接**（带仓库域名的那种）与
    // 仓库**文案**（**原样字面与等价写法两遍都判**，见 ⑤b 的两根针），两者都在
    // **页脚这个作用域**内判定，比"整篇产物命中必须为 0"的登记表更精确。
    // 这是本仓唯一一处「被删文案刻意不登记」的取舍，记在这里，免得下一个人以为是漏登记。
    {
      const ghFragment = ((indexHtml.match(/<!--SHARED:ghlink:START-->([\s\S]*?)<!--SHARED:ghlink:END-->/) || [])[1] || '').trim();
      if (!ghFragment) {
        fail('产物 index.html 里找不到 SHARED:ghlink 标记区间 ⇒ 页头图标入口的全站断言失去唯一出处'
          + '（它与 lib/page-shell.js 抽共享页头用的是同一对标记；锚点消失本身必须有人知道）');
      } else {
        const ghProblems = [];
        // ① 形状：只看形状，不抄 URL 里的仓库路径、也不抄 SVG —— 唯一出处仍然是上面那个片段。
        //    唯一多出来的字面量是 host `github.com/`：图标画的就是 GitHub，它必须还指向 GitHub
        //    （哪天换到别的托管，这条要连同图标一起**显式**改，而不是静默指过去）。
        const GH_SHAPE = /^<a\b(?=[^>]*\bclass="ghlink")(?=[^>]*\bhref="https:\/\/[^"]+")(?=[^>]*\btarget="_blank")(?=[^>]*\brel="noopener noreferrer")(?=[^>]*\b(?:aria-label|title)="[^"]+")[^>]*>[\s\S]*<svg[\s\S]*<\/svg>[\s\S]*<\/a>$/;
        if (!GH_SHAPE.test(ghFragment)) {
          ghProblems.push('SHARED:ghlink 片段不是一个可用入口（要求：`<a class="ghlink">` + 绝对 https 的 href '
            + '+ target="_blank" + rel="noopener noreferrer" + 可读名字（aria-label 或 title）+ 内含 <svg>）');
        }
        if (!/href="https:\/\/github\.com\//.test(ghFragment)) {
          ghProblems.push('SHARED:ghlink 片段的 href 不在 github.com 上 —— 图标是 GitHub 入口，指到别处就不是了');
        }
        // ② 样式：图标"看得见、点得着"依赖共享 <style> 里那几条 `.ghlink` 规则。
        //    ⚠️ 只判「存在一条 `.ghlink` 规则」是不够的（t1 的 M7c 探针实测）：把**主体**那条规则
        //    整块删掉、只留媒体查询里的 `.ghlink { order: 3; }`，构建照样全绿 —— 而图标已经丢了
        //    尺寸与颜色。所以判据分三层，都只判**有无**、不判具体值（值属于设计细节，改色改尺寸
        //    不该让构建红）：
        //      · 至少有一条 `.ghlink` **主体**规则（选择器就是 .ghlink 或它的伪类，不是 `.ghlink svg`
        //        这种后代选择器 —— 后代规则不能替主体背尺寸与颜色）；
        //      · 这些主体规则里要有尺寸（width/height）**且**有颜色（color/fill/background）；
        //      · 任何一条 `.ghlink` 规则里都不许出现 display:none / visibility:hidden —— **主体 / 后代 /
        //        兄弟组合器都算**（这段注释原本就写着"任何一条"，实现却只遍历主体规则；t6 的复核把这对注释/实现
        //        不一致摆出来时收口：`.ghlink svg { display: none }` 会让图标变成一个空的、仍可点的
        //        盒子。t1 第一轮也实测过它穿得过去）。声明的大小写一并认（`DISPLAY: NONE` 是同一件事）。
        //    ⚠️ 两条**已知边界**（刻意不越界，写在判据旁边，免得下一个人当成洞去补）：
        //      · 只认 display / visibility 这两种"藏"的写法；`opacity: 0`、`transform: scale(0)`
        //        这类"渐变/变形到看不见"不在射程内 —— 它们同样可以是正当的入场动效，
        //        要拦得先有一条能区分两者的判据；
        //      · 颜色那层只判"某个**主体**规则里有颜色来源"，`:hover` 里的颜色也算数（真删掉基础色时
        //        图标会继承页头文字色，仍看得见）—— 它是弱判据，不是"基础色必须写在本体规则里"。
        // ⚠️ 分析前先剥掉 CSS 注释：这一大段注释里就既有 `.ghlink` 又有 `{`（举反例时必然出现），
        //    不剥的话 `\.ghlink[^{]*\{` 会跨过注释去配下一条规则的 `{`，把注释读成一条规则。
        const stylePath = path.join(OUT, styleAsset.FILE);
        const inlineStyle = (indexHtml.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
        const externalStyle = indexHtml.includes(`href="${styleAsset.FILE}"`) && fs.existsSync(stylePath)
          ? fs.readFileSync(stylePath, 'utf8')
          : '';
        const sharedStyle = (externalStyle || inlineStyle).replace(/\/\*[\s\S]*?\*\//g, ' ');
        const ghAllRules = [];   // 全部 `.ghlink` 前缀规则（主体 + 后代 + 兄弟组合器）：判"有没有被藏掉"
        const ghRules = [];      // 只留**主体**规则：尺寸与颜色只能由它们背
        for (const rule of sharedStyle.matchAll(/\.ghlink(?![\w-])([^{}]*?)\{([^}]*)\}/g)) {
          const rawTail = rule[1];
          const trimmed = rawTail.trim();
          // 藏没藏要能指出**是哪条规则**：`.ghlink svg` 与 `.ghlink` 只差一个空格、含义完全不同。
          // ⚠️ 前缀型选择器（`.topin > .search ~ .ghlink`）在本正则里是从 `.ghlink` 开始匹配的，
          // 只报 `.ghlink` 会把"这条规则长什么样"说错（t7 的 B4 报文实测 + t8 的 M1）。所以往前
          // 回退到同一条选择器的起点（最近的 `{` / `}` / `;` / 换行），把那段前缀也带上；
          // 前缀里含逗号（选择器列表）就不带 —— 报一半比报全更糟。
          const beforeSel = sharedStyle.slice(0, rule.index);
          const selCut = Math.max(beforeSel.lastIndexOf('{'), beforeSel.lastIndexOf('}'), beforeSel.lastIndexOf(';'), beforeSel.lastIndexOf('\n'));
          const selLead = beforeSel.slice(selCut + 1).trim();
          // 护栏：`.ghlink` 若恰好是样式块**首条**且与 `<style>` 同行（`selCut === -1`），回退出来的前缀
          // 会是 `<style>` 这个标签名（t10 的 M1′ 预演到过；今天不发生 —— 首条是 `:root` 且 `<style>`
          // 后面紧跟换行）。标签不是选择器，丢掉它，宁可只报 `.ghlink` 也不能报错名字。
          const selPrefix = /^</.test(selLead) ? '' : selLead;
          ghAllRules.push({
            sel: ((selPrefix && !selPrefix.includes(',')) ? selPrefix + ' ' : '') + ('.ghlink' + rawTail).replace(/\s+/g, ' ').trim(),
            body: rule[2],
          });
          // 主体规则 = 选择器**就是** `.ghlink`（可能带伪类/复合类），它与 `{` 之间只有空白 ——
          // 本文件把它写成 `.ghlink {`，那一个空格会被正则捕进 tail，所以"tail 全是空白"也是主体。
          // 后代 / 兄弟选择器（`.ghlink svg`、`.ghlink > span`）tail 里有实质内容且以空白或组合符开头，
          // **不算主体**：它们管的是图标里面的东西。
          // ⚠️ 两个方向都实测踩过：① 先 `trim()` 再判前导空白 ⇒ `.ghlink svg { width: 18px }`
          //    被当主体、替主体背下尺寸（t1 的 M7c 探针）；② 直接按"以空白开头就跳过" ⇒ 把主体
          //    自己那条（`.ghlink {`）也跳掉，于是现状就被误判成"没有主体规则"。
          if (trimmed !== '' && /^[\s>+~]/.test(rawTail)) continue;
          ghRules.push({ tail: trimmed, body: rule[2] });
        }
        if (!ghRules.length) {
          ghProblems.push('共享 <style> 里没有 `.ghlink` 的**主体**规则（图标失去样式来源）');
        } else {
          // 大小写一并认（CSS 关键字不分大小写）：`WIDTH: 18px` 也是尺寸，漏判会把"有尺寸"读成假红。
          const sized = ghRules.some(r => /\b(?:width|height)\s*:/i.test(r.body));
          const painted = ghRules.some(r => /\b(?:color|fill|background(?:-color)?)\s*:/i.test(r.body));
          if (!sized || !painted) {
            ghProblems.push('共享 <style> 里 `.ghlink` 主体规则缺'
              + [!sized ? '尺寸（width/height）' : '', !painted ? '颜色（color/fill/background）' : '']
                .filter(Boolean).join(' 与 ')
              + ' —— 图标会丢盒子或丢颜色（只剩 order 之类的定位微调不算样式）');
          }
        }
        for (const hide of [{ re: 'display\\s*:\\s*none', label: 'display: none' }, { re: 'visibility\\s*:\\s*hidden', label: 'visibility: hidden' }]) {
          // ⚠️ 遍历的是 **ghAllRules**（主体 + 后代 + 兄弟组合器），不是 ghRules：上面注释里那句
          //    "任何一条 `.ghlink` 规则"是按字面兑现的 —— `.ghlink svg { display: none }` 藏掉的是
          //    图标内容，读者看到的同样是一个空的、仍可点的盒子（t6 复核点出的注释/实现不一致；
          //    t1 第一轮实测过它能穿过去）。报文里带上**命中规则**，否则 `.ghlink svg` 与 `.ghlink`
          //    这一空格之差在失败信息里看不出来。
          for (const r of ghAllRules) {
            if (new RegExp(hide.re, 'i').test(r.body)) {
              ghProblems.push(`共享 <style> 里 \`.ghlink\` 被 ${hide.label} 藏掉了（命中规则 \`${r.sel}\`；产物里还在，读者看不见）`);
            }
          }
        }
        // ③⑥ 逐页：扫描面 = 产物里全部 .html（不依赖"页面一定叫 index.html"这条命名约定）。
        // 走 `listArtifactFiles()`（本文件已有的"磁盘上真的有什么"枚举，不读任何清单）——
        // 自己再写一遍 walk 就多一处会各自漂移的实现。
        // ⑤b 的两根针与失败报文都从下面**同一个**字面量派生（唯一出处）：归一化那根由本文件自己的口径
        // 现算（`GitHub 仓库` ⇒ `github仓库`），`normalizeForCompare()` 的入参也用它 —— 换文案只改一处。
        // ⚠️ 这里必须**两遍都跑**（t7 的第二轮演练用 D5 实测逼出来的，别把其中任何一遍删掉）：
        //    · 原样那一遍（`includes(FOOTER_TEXT_LITERAL)`）：归一化**不是**字面判定的严格超集 ——
        //      `normalizeForCompare()` 里第一次 `.replace` 就是 `.replace(/<[^>]*>/g, '')`（那是它的第②步，
        //      第①步是实体解码），而一段 HTML 注释
        //      `<!-- … -->` 里唯一的 `>` 就是它自己的终止符 ⇒ **整段注释被当作一个标签整个剥掉**。
        //      实测：把被删文案写进页脚注释里，原样那遍命中、归一化那遍**看不见**（注释里原样
        //      复述在改造前是会红的 ⇒ 只留归一化那一遍就是一次覆盖回退，而不是"等价升级"）。
        //    · 归一化那一遍：覆盖可见文字里的等价写法（实体 / 夹标签 / 零宽 / 折行 / 大小写）。
        //    两遍取并集 ⇒ 是改造前（字面）与改造后（归一化）两种射程的**并**，两边都不丢。
        // ⚠️ 已知边界：**注释里再包一层等价写法**（例如注释里写 `GitHub&nbsp;仓库`）两遍都漏 ——
        //    原样那遍要字面、归一化那遍把注释剥掉了。注释里原样复述会被原样那遍拦下。
        // 误报面：t6 复核实测 184/184 页的页脚两遍都是 0 命中，所以换上不产生误红。
        const FOOTER_TEXT_LITERAL = 'GitHub 仓库';
        const FOOTER_TEXT_NEEDLE = normalizeForCompare(FOOTER_TEXT_LITERAL);
        const allPages = listPageFiles(OUT);
        for (const rel of allPages) {
          const page = fs.readFileSync(path.join(OUT, rel), 'utf8');
          // ③ 先按**元素**数（class token 级）：只差一个 class 的孪生锚（`class="ghlink gh-dup"`）
          //    用逐字节子串是数不到的 —— 同一份文件后面 `.snote` / `.vsnote` 那条注释已经立过这条
          //    纪律（"换个类名就静默失去覆盖"）。逐字节相同是**附加**条件，不是替代。
          const elements = (page.match(/<a\b[^>]*class="[^"]*\bghlink\b[^"]*"/g) || []).length;
          if (elements !== 1) ghProblems.push(`${rel} 页头图标入口元素出现 ${elements} 枚（应为恰好 1 枚）`);
          const hits = page.split(ghFragment).length - 1;
          if (hits !== 1) ghProblems.push(`${rel} 与首页逐字节相同的图标片段出现 ${hits} 次（应为恰好 1 次）`);
          const headerBlock = page.match(/<header[\s>][\s\S]*?<\/header>/);
          if (!headerBlock || !headerBlock[0].includes(ghFragment)) {
            ghProblems.push(`${rel} 页头图标入口不在 <header> 区间里`);
          }
          const footerBlock = page.match(/<footer[\s>][\s\S]*?<\/footer>/);
          if (footerBlock) {
            if (/github\.com/i.test(footerBlock[0])) {
              ghProblems.push(`${rel} 页脚区间里又出现了仓库链接 —— v3.1 已把仓库入口移到页头，删掉的不许回流`);
            }
            // ⑤b **文字形态**的回流同样要红（t3 的独立审计提的补牙）：上面那条只拦得住"带仓库域名的
            // 链接"，把被删的那段文案原样写回页脚（哪怕不加链接、改成纯文本）仍会漏过。
            // ⚠️ 而"纯文本"有无数种**等价写法**：`GitHub&nbsp;仓库`、`<b>GitHub</b> 仓库`、中间塞零宽
            // 字符、标签之间折行 —— t6 的复核（R1）实测这四种按**字面**匹配全部穿过去，而本文件自己的
            // `normalizeForCompare()` 四种全中。所以这里**两遍都跑**（两根针见上面；为什么必须是两遍、
            // 而不是只留归一化那一遍，见那段注释里 t7 的 D5 实测 —— 归一化会把整段注释当标签剥掉）。
            // ⚠️ 已知边界：归一化会**剥掉标签、去掉全部空白**，所以"页脚里裸写 GitHub 与「仓库」二字
            // 只隔标签"这种组合也会命中（今天 184/184 页都不成立；作用域是页脚、针是长串，误报面比
            // 整篇产物小得多）。真要在页脚同时放这两样，那是设计变更，应当显式改这条判据。
            // 为什么不用 `residue-guard.json` 的 deletedCopy：裸词「GitHub 仓库」现在活在页头的
            // title / aria-label 里（每页 2 次），按"整篇产物命中必须为 0"登记它必然永久假红；
            // 而**页脚这个作用域**里它是独一无二的 —— 做成作用域内的判据比登记表更精确
            // （登记表的扫描面是整份产物，且每条都要有 census 出处）。
            const footerRawHit = footerBlock[0].includes(FOOTER_TEXT_LITERAL);
            const footerNormHit = normalizeForCompare(footerBlock[0]).includes(FOOTER_TEXT_NEEDLE);
            if (footerRawHit || footerNormHit) {
              ghProblems.push(`${rel} 页脚区间里又出现了被删掉的仓库入口文案「${FOOTER_TEXT_LITERAL}」`
                + `（形态：${[footerRawHit ? '原样字面' : '', footerNormHit ? '等价写法' : ''].filter(Boolean).join(' + ')}）`
                + ' —— v3.1 起入口只留在页头，文字形态的回流同样不许');
            }
          }
        }
        if (ghProblems.length) {
          fail(`页头图标入口不对（形状 / 样式 / 缺失 / 重复 / 位置错 / 页脚回流）：${ghProblems.slice(0, 6).join('、')}`
            + `${ghProblems.length > 6 ? ` 等 ${ghProblems.length} 处` : ''}`);
        } else {
          console.log(`  ✓ 页头图标入口: ${allPages.length} 个产物页面逐页对账（片段是可用入口 · 样式在位未隐藏`
            + ' · 各恰好 1 枚元素且与首页逐字节相同 · 在 <header> 内 · 页脚零仓库链接且零被删文案）');
        }
      }
    }

    // 作者写的正文里不许残留 Markdown 记号 —— 它是**直接写进 HTML 的**，不是 Markdown。
    //
    // 为什么要有这条：`audience.js` 的页面说明与状态页/分类页的正文都曾把强调写成 `**这样**`、
    // 把字段名写成 `` `这样` ``，于是 **16 个 `**` 与 14 个反引号原样出现在读者眼前**
    // （独立验证代理在 4 类页面上数出来的），而没有任何门禁会因此变红。
    // 更糟的是「预渲染正文过短」那条长度断言还把星号当成内容算进去了 ——
    // 一条在数自己造成的排版噪声的守卫。
    //
    // 扫描面刻意收在**作者写的容器**里，而不是整页文本：
    // 采集来的文案（标题 / discountInfo）里出现 `**` 或反引号是**数据**，不是我们的排版错误；
    // 拿它判红会变成一条「在正常数据上失败」的守卫，而那比没有守卫更糟。
    //
    // ## 扫描面在 secondary-page-content-simplification 扩过一次（含一次真实漏网）
    //
    // 原先只有 `.snote` / `<caption>`。实测漏掉了 `.vsnote`：`vendor-page.js` 的
    // changesBlock 直接写了 `**套餐变化日志**` 且没过 `rich()`，于是**25 个厂商页**
    // 上读者看到的是字面星号，而构建全绿（2026-08 那版守卫的扫描面就是这里写的那两个）。
    // 同一次扩面还收进了 `<details>`：本轮把底部说明搬进折叠块，
    // 而那是个**非贪婪 `<p class="snote">…</p>` 正则**根本照不到的新容器 ——
    // 「搬个位置就静默失去覆盖」正是这条守卫最该防的失效方式。
    // ⚠️ 两个 `.snote` 文本容器用 **class token 级**匹配（`\bsnote\b` / `\bvsnote\b`），
    // 不用 `class="snote"` 这种精确串：后者对 `<p class="snote aliasnote">`（历史上）
    // 与 `<p class="snote mcount">`（`/models/` 里现在真实存在的多 class 形状）**一条都照不到**。
    // 「换个类名就静默失去覆盖」与本文件反复记录的那次 `.vsnote` 漏网是同一类失效。
    const PROSE_PATTERNS = [
      /<p\b[^>]*\bclass="[^"]*\bsnote\b[^"]*"[^>]*>([\s\S]*?)<\/p>/g,
      /<p\b[^>]*\bclass="[^"]*\bvsnote\b[^"]*"[^>]*>([\s\S]*?)<\/p>/g,
      /<caption>([\s\S]*?)<\/caption>/g,
      /<details\b[^>]*>([\s\S]*?)<\/details>/g
    ];
    const mdMarkers = [];
    for (const [rel] of routeOutputs) {
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) continue;
      const page = fs.readFileSync(file, 'utf8');
      const prose = PROSE_PATTERNS
        .flatMap(re => [...page.matchAll(re)].map(m => m[1]))
        .map(chunk => chunk.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      for (const chunk of prose) {
        const stars = (chunk.match(/\*\*/g) || []).length;
        const ticks = (chunk.match(/`/g) || []).length;
        if (stars || ticks) {
          mdMarkers.push(`${rel}（**×${stars} · 反引号×${ticks}）：${chunk.slice(0, 50)}…`);
        }
      }
    }
    if (mdMarkers.length) {
      fail(`作者正文里残留 Markdown 记号（读者会原样看到）：${mdMarkers.slice(0, 4).join('；')}`);
    } else {
      console.log('  ✓ 作者正文无 Markdown 记号: .snote / .vsnote / <caption> / <details> 里的强调一律用 <b>，字段名直接写');
    }

    // ---- 说明的**机器无关性**（t4 重挂：见 `lib/changes.js` 的头部注释）----------------
    //
    // 为什么这条还在：三份日志的页面措辞（`changes.js` / `plan-changes.js` / `api-plan-history.js`
    // 的 CHANGES_NOTES，以及 plans-hub / models / vendor / archive 各自的「没有拿到日志」句）
    // 全是**静态字面量**。Dataset Manifest 下架之后，那个「说明里不许出现宿主绝对路径」的不变量
    // 只剩这一处承重面 —— 判据不能零 owner。
    //
    // 判据：页面文本里出现「没有拿到」时，那段文本必须**机器无关**（没有盘符 / UNC / POSIX 绝对路径 /
    // 家目录记号）。红的时候点名 route 与命中的形状名，因为那种红的原因（谁把 `path.join(__dirname, …)`
    // 拼进了页面）离症状很远。
    const machineDependent = [];
    for (const [rel] of routeOutputs) {
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) continue;
      const text = prerenderedText(fs.readFileSync(file, 'utf8'));
      if (!text.includes('没有拿到')) continue;
      for (const shape of changes.machineDependenceProblems(text)) {
        machineDependent.push(`${rel}（${shape}）`);
      }
    }
    if (machineDependent.length) {
      fail(`页面上的「没有拿到」说明里含机器相关形状（跨机器不可复现、且会把宿主目录发布出去）：${machineDependent.slice(0, 4).join('；')}`);
    } else {
      console.log('  ✓ 说明机器无关性: 出现「没有拿到」的页面里没有宿主机绝对路径 / UNC / 家目录记号');
    }

    // 首屏说明**必须为空** —— secondary-page-intro-changes-v1 的主牙（**含一次真实盲区的修复**）。
    //
    // 为什么要有它：二级数据页首屏的任务是「有哪些优惠」。上一轮把三段口径删到「0~1 句」，
    // 而实测那 0~1 句在 **41 个页面**上各占至少一行，读者不看也照样能用这一页 —— 于是整层删除
    // （`userIntro` 字段与渲染路径一起删）。这条断言守的是**删掉之后不许回流**：再有人往注册表
    // 加一个 `userIntro`、或在模板里插一段顶部说明，构建当场红。注册表级还有一条
    // （`audience-selftest` §9），两层各管一半 —— 产物层这条连 `/vendor/<slug>/` 那种
    // **算出来的**文案（26 页）也照得到。
    //
    // ## 判据边界
    //
    //   · 扫描面**只限 intro 区** —— `.cstop` 结束到第一个数据区（`.lsum` / 表格容器）之间；
    //     表格里的「为什么在这一页」列、底部折叠说明、页脚都不在其中（那三处本来就该有字）。
    //   · **没有例外**（`secondary-page-residue-v1` 起）：上一版给别名页开了口子
    //     （`ALIAS_NOTE_ROUTES` / 恰好 1 条 `.aliasnote`），本轮把那条 `.aliasnote` 整条删除、
    //     口子一并退役。上面的理由（「导航更正」「读者必须知道自己在哪」）被实测推翻，
    //     详见 `renderDirectoryPage` 顶部那段说明块。**别名页现在与其它目录页走同一条判据**：
    //     intro 区 `.snote` 必须 **0 条**，多一条即红 —— 没有名单可绕。
    //   · 类名匹配是 **class token 级**的（`\bsnote\b`）。上一版用的是 `class="snote"` 精确串，
    //     于是 `<p class="snote aliasnote">` **一条都照不到**：别名页那句里的内部措辞
    //     （`benefitType`）从来没被这条守卫看见过。本轮实测出这个盲区并修掉
    //     （`changes-selftest` 里有正反例探针：旧正则 0 命中 / 新 matcher 必命中）。
    //     ⚠️ 这条 matcher **逐字保留**，不许改回精确串 —— `class="snote mcount"`（`/models/` 里
    //     真实存在）这类多 class 形状照样要靠它才照得到。
    //   · `判据` **不在禁词表里**：它同时是业务语义（例如 `/models/` 的导语），
    //     机械禁掉会变成一条在正常文案上失败的守卫 —— 那比没有守卫更糟。
    //   · 误报的处置是**改文案**或往 ALLOW 里登记理由，不是把词从表里删掉。
    const INTRO_INTERNAL_TERMS = [
      '数据模型', 'benefitType', 'predicate', 'collections', '关键词扫描', '映射表', '字段', '归一规则'
    ];
    // 逐条登记的白名单（空 = 当前没有例外）。键是 `路由|词`，值是「为什么这里是业务语义」。
    const INTRO_TERM_ALLOW = new Set([]);
    // class token 级匹配 —— `\bsnote\b` 既能命中 `class="snote aliasnote"`（历史上）与
    // `class="snote mcount"`（现在真实存在的多 class 形状），又不会误命中 `class="vsnote"`
    // （`v` 与 `s` 之间没有词边界）。
    // 同一个 matcher 也用在上面那段 Markdown 记号扫描里（同一次盲区修复）。
    const INTRO_SNOTE_RE = /<p\b[^>]*\bclass="[^"]*\bsnote\b[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
    // 题注形状（本轮新增的第三颗牙）：目录页家族的 `<caption>` 只允许两种逐字形状
    // —— `共 N 条。`（目录页，含别名页）与 `共 N 个入口。`（枢纽页，它没有条目表）。
    // 判定用**整串**匹配（不是 `includes`）：多一个字、少一个句号、换了破折号都算红。
    //
    // ⚠️ 判据是**条件式**的，不许改成「每题注都必须存在」（captain 独立裁定，2026-10-09）：
    //    `<caption>` 在任何浏览器里都**不渲染**（对读者零可见价值、也零干扰），
    //    而它有真实的 **a11y 价值**（表格的可访问名）。所以：
    //      · 题注**存在** ⇒ 渲染文本必须逐字匹配这个形状（长题注回流即红）；
    //      · 题注**不存在** ⇒ 只有在**这一页根本没有主表**时才算合法。
    //    「有表却把题注整条删掉」不是合法删除，是结构缺失 ⇒ 红（见下面 EXPECT_RE 的用法）。
    //    边界必须说清：这条牙**证不了**「别名页题注 == 非别名页题注」（两侧跑同一条规则），
    //    它证的是「存在的那些题注形状合规，且该有的地方没缺」。
    //
    // ## 反空洞守卫：**按产物现算**，不用绝对常量（对抗复核 F1 的第二半）
    //
    // 上一版是 `INTRO_CAPTION_MIN_SCANNED = 20` 这样的绝对门槛。它的失效不是「写错数」，
    // 而是**形态本身错**：门槛与「产物里应该有多少条题注」没有任何联系，于是
    // `captionScanned` 只要还 ≥ 20，**任意多页的题注都可以不被判形状**而构建全绿
    // （T4 沙箱 P6b/P6c/P6d 实测：45 页里改掉 3 页的标记即可静默，改满 25 页才会红）。
    // 现在的判据是 `captionScanned === captionExpected`，其中 `captionExpected`
    // 由产物现算（目录页家族里含主表的页数）⇒ 少扫到一页就红，不存在可退化的区间。
    const INTRO_CAPTION_RE = /^共 \d+ (?:条|个入口)。$/;
    // 题注标签：**容错属性**（`<caption>` / `<caption class="legacy">` 都算），见下面那条注释。
    const INTRO_CAPTION_TAG_RE = /<caption[^>]*>([\s\S]*?)<\/caption>/g;
    // 「这一页有主表」的判据 —— `.ctable-wrap` 是目录页的表格容器。
    // 只用它判「有表却没题注」，**不用它要求每页都有表**。
    const INTRO_CAPTION_EXPECT_RE = /<div class="ctable-wrap"|<table[\s>]/;
    const introProblems = [];
    const introHits = [];
    const captionProblems = [];
    let captionScanned = 0;
    // 「应有题注」的**现算**值：目录页家族里含主表的页数。与 `captionScanned` 逐页相等才算过。
    let captionExpected = 0;
    const directoryRoutes = new Set(built.directoryPages.map(page => page.route));
    for (const page of built.directoryPages) {
      const file = path.join(OUT, `${page.route}index.html`);
      if (!fs.existsSync(file)) continue;
      const html = fs.readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '');
      const mainStart = html.indexOf('<main');
      const cstopEnd = html.indexOf('</div>', html.indexOf('class="cstop"', mainStart));
      if (mainStart < 0 || cstopEnd < 0) continue;
      // intro 区 = .cstop 之后 → 第一个数据区之前。三个锚点谁先出现就用谁。
      const anchors = ['<ul class="lsum"', '<div class="ctable-wrap"', '<table']
        .map(anchor => html.indexOf(anchor, cstopEnd))
        .filter(index => index > 0);
      const introEnd = anchors.length ? Math.min(...anchors) : html.length;
      const introRegion = html.slice(cstopEnd, introEnd);
      const notes = [...introRegion.matchAll(INTRO_SNOTE_RE)].map(m => ({
        classes: (m[0].match(/class="([^"]*)"/) || ['', ''])[1].split(/\s+/).filter(Boolean),
        text: m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      })).filter(note => note.text);
      // ---- 牙 3：目录页家族（含别名页）的题注只允许「共 N 条。」/「共 N 个入口。」形状 ----
      // 题注取自 `.cstop` 之后的**整段文档**，不限于 intro 区：`<caption>` 是 `<table>` 的第一个
      // 子元素，而表格容器（`<div class="ctable-wrap"`）落在它**之前** ⇒ intro 区自己不含题注
      // （第一版把题注也塞进 intro 区里找，实测扫到 0 条 ⇒ 反空洞守卫当场把构建判红，
      // 这正是那条守卫存在的意义）。改成整段查找之后，属性写法与容器顺序都不再影响命中。
      // ⚠️ 取**第一条**题注判形状，但**多余条数单独判红**（多于一条 = 结构可疑，不许「取第一条了事」）。
      // 判据是**整串**逐字匹配，不是 `includes`。
      //
      // ⚠️ 判据边界（不许把这条牙说成比它实际更强的东西）：它**证不了**
      //    「别名页题注 == 非别名页题注」—— 两侧跑的是同一条规则、同一次扫描，
      //    别名页只是「目录页家族」这个集合里的一个元素，这条牙对任何一个元素一视同仁。
      //    「别名页确实走了 caption 的同一条分支」由**源码形状**（`const caption` 那一支里
      //    已经没有任何 kind 分叉）与 diff 保证。这条牙真正回答的是另一个问题：
      //    「有没有哪一页的题注悄悄长出第三种形状（长题注回流 / 换个说法）」。
      // ⚠️ **必须容错标签属性**（`secondary-page-residue-v1` · 对抗复核 F1）。
      //    第一版写的是 `/<caption>([\s\S]*?)<\/caption>/` —— 只认**无属性**标签。
      //    实测旁路（T4 沙箱 P6b）：把 3 个别名页的题注改成 `<caption class="legacy">`
      //    并注回 57 字长题注 ⇒ `npm run build` **exit 0**，读数还是「42 条逐字匹配」——
      //    那 3 页从扫描面里**消失**了，而不是被判红。只改标记不改内容（P6c）同样静默丢覆盖。
      //    这与「改个类名就隐形」是同一类失效（`.vsnote` / `class="snote"` 精确串都栽过），
      //    所以这里用 `<caption[^>]*>`，并且**允许多条**：多于一条即单独判红，不许「取第一条了事」。
      const hasMainTable = INTRO_CAPTION_EXPECT_RE.test(html.slice(cstopEnd));
      const captions = [...html.slice(cstopEnd).matchAll(INTRO_CAPTION_TAG_RE)];
      // 「应有题注」= 有主表的那些页 —— **从产物现算**，所以它天然跟着页面结构走，
      // 不像绝对常量那样留下「不判也绿」的区间。
      if (hasMainTable) captionExpected += 1;
      if (captions.length > 1) {
        captionProblems.push(`${page.route || '/'} 有 ${captions.length} 条 <caption> —— 主表只允许一条题注`);
      }
      if (captions.length) {
        captionScanned += 1;
        const captionText = captions[0][1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!INTRO_CAPTION_RE.test(captionText)) {
          captionProblems.push(`${page.route || '/'} 题注形状不对（${captionText.length} 字）：`
            + `${captionText.slice(0, 48)}${captionText.length > 48 ? '…' : ''}`);
        }
      } else if (hasMainTable) {
        // 有主表却没有题注 ⇒ 红。这是「整条删除题注」这条路径的收口：
        // T4 已裁定题注牙是**条件式**的（不要求每页都有题注），但那是针对「页面本来就没有表」；
        // 有表而没题注属于结构缺失，不是合法删除 —— 否则「把题注整条删掉」就是一条静默旁路。
        captionProblems.push(`${page.route || '/'} 有主表（${INTRO_CAPTION_EXPECT_RE.source}）却没有 <caption>`);
      }
      if (!notes.length) continue;
      // **没有例外**：所有目录页（含别名页）走同一条判据。
      introProblems.push(`${page.route || '/'} 首屏仍有 ${notes.length} 条说明`
        + `（二级数据页首屏只允许标题 / 条目数 / 更新时间）：${notes[0].text.slice(0, 40)}…`);
      for (const note of notes) {
        for (const term of INTRO_INTERNAL_TERMS) {
          if (note.text.includes(term) && !INTRO_TERM_ALLOW.has(`${page.route}|${term}`)) {
            introHits.push(`${page.route || '/'} 含「${term}」：${note.text.slice(0, 40)}…`);
          }
        }
      }
    }
    // 非目录页只查题注形状（同一段区间）：它们的题目本来就该描述数据形状，不要求逐字形状。
    // ⚠️ 这里的 `directoryRoutes` 只用来**如实报告**覆盖面，不参与放行 —— 放行与否由
    //    「目录页家族扫出来的每条题注都必须匹配」决定，非目录页的题注一条都不进 captionProblems。
    let captionNonDirectoryScanned = 0;
    {
      // 产物里**全部** index.html（按目录遍历现算，不写死路由清单）——
      // 这一段只为「非目录页题注覆盖率」这个**读数**服务，不参与任何判据。
      const stack = [''];
      const pageOutputs = [];
      while (stack.length) {
        const relDir = stack.pop();
        const absDir = path.join(OUT, relDir);
        if (!fs.existsSync(absDir)) continue;
        for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
          const relPath = relDir ? `${relDir}${entry.name}` : entry.name;
          if (entry.isDirectory()) stack.push(`${relPath}/`);
          else if (entry.name === 'index.html') pageOutputs.push(relPath);
        }
      }
      for (const rel of pageOutputs) {
        const file = path.join(OUT, rel);
        const route = rel === 'index.html' ? '' : rel.replace(/index\.html$/, '');
        if (directoryRoutes.has(route)) continue;
        const pageHtml = fs.readFileSync(file, 'utf8').replace(/<script[\s\S]*?<\/script>/gi, '');
        const mainStart = pageHtml.indexOf('<main');
        if (mainStart < 0) continue;
        // 同一处属性容错：这里只数**读数**（非目录页有多少条题注），但读数若用精确串，
        // 就会在报告里少报（而「少报」正是 F1 那类静默的开始）。两个计数器用手写同形的正则。
        if (INTRO_CAPTION_TAG_RE.test(pageHtml.slice(mainStart))) captionNonDirectoryScanned += 1;
        INTRO_CAPTION_TAG_RE.lastIndex = 0;
      }
    }
    if (introProblems.length) {
      fail(`二级数据页首屏出现了说明（分类判据、字段模型与解释性副标题都不占首屏，见 docs/DESIGN-RULES.md H13）：`
        + `${introProblems.slice(0, 4).join('；')}`);
    } else if (introHits.length) {
      fail(`二级页首屏出现内部实现措辞（分类判据 / 字段模型属于维护文档，见 docs/DESIGN-RULES.md 的口径归档）：`
        + `${introHits.slice(0, 4).join('；')}`);
    } else if (captionProblems.length) {
      fail(`目录页家族的题注超出「共 N 条。/ 共 N 个入口。」两种形状（长题注回流即红，见 docs/DESIGN-RULES.md H11）：`
        + `${captionProblems.slice(0, 4).join('；')}`);
    } else if (captionScanned !== captionExpected) {
      // 反空洞守卫（对抗复核 F1 后**改为按产物现算**）：判据是
      // `captionScanned === captionExpected`，其中 expected = 目录页家族里含主表的页数。
      //
      // 为什么不用绝对常量：上一版是 `captionScanned < 20` 这种写法，门槛与「应该有多少条题注」
      // 毫无联系 ⇒ 只要产物里还留着 20 条题注，**任意多页都可以不被判形状**而构建全绿
      // （T4 实测：45 页里改掉 3 页的标记即可静默，改满 25 页才会红）。
      // 现在少扫到**一页**就红，没有可退化的区间 —— 这条守卫防的是「扫描面本身坏了」，
      // 而「扫描面坏了」的精确表述就是「数出来的比该有的少」。
      fail(`题注形状牙的覆盖面与产物不符（扫描面坏了 / 有页没产出 / 标签写法逃过了匹配）：`
        + `目录页家族里判了 ${captionScanned} 条 <caption>，但含主表的目录页有 ${captionExpected} 页`);
    } else {
      console.log(`  ✓ 二级数据页首屏无说明: ${built.directoryPages.length} 页（**含别名页**，没有例外名单）`
        + ` · 残留说明 × ${INTRO_INTERNAL_TERMS.length} 个禁词 0 命中`);
      console.log(`  ✓ 目录页家族题注形状: ${captionScanned}/${captionExpected} 条 <caption> 逐字匹配`
        + `「共 N 条。/ 共 N 个入口。」（判了 ${captionScanned} · 应有 ${captionExpected} —— 两者必须相等）`
        + `（另有 ${captionNonDirectoryScanned} 条非目录页题注不在本规则射程内，只报告不判）`);
    }
  }

  // ---- 新扫描面（residue-v2）：删掉不许回流 + 扫描面不许收缩 ----
  // 判据实现在上面的 `scanResidue()`（那一段的注释是这条纪律的正式说明：为什么字面级、
  // 为什么剥离注释、豁免为什么锚在 SHARED:footer 且只在页脚区间内成立）。
  // 这里只负责把它接进构建期自检并**把读数打出来** —— 读数要能让人一眼看出扫描面还在
  // （几条字面 × 几个文件 × 7 类容器的实测/下限），而不是只有一句「✓」。
  {
    const residue = scanResidue(OUT);
    for (const problem of residue.problems.slice(0, 6)) fail(problem);
    if (residue.problems.length > 6) fail(`…另有 ${residue.problems.length - 6} 项（上面是前 6 项）`);
    if (!residue.problems.length) {
      const r = residue.readings;
      console.log(`  ✓ 删掉不许回流: ${r.literals} 条被删文案（登记 ${r.entries} 条 × 两个面，`
        + `${r.deadLiteralEntries} 条死字面） × ${r.files} 个产物文件（HTML 剥离 script/style/注释后）· 三遍命中 ${r.totalHits} 次`
        + `（原样 ${r.rawHits} · 归一化 ${r.normHits} · JSON 转义 ${r.jsonHits}）`);
      console.log(`    · **没有豁免名单**（t10/F1 已移除：取值面与作用域同源 ⇒ 白名单自证；基线受益者 0 条）`
        + ` · 归一化针 ${r.normNeedles} 条（另有 ${r.normSkipped.length} 条不适用：源码写法且无可见核 / 归一化后太短）`
        + ` · 只在 script/style/注释里的命中（**只报不判**）${r.commentOnly} 次`);
      console.log(`    · 射程边界（如实登记）: ${r.runtimeBoundary}；UTF-16LE+BOM 的产物页扫不到（t6 F4）`);
      console.log(`    · 共享页脚正面断言: 锚点 ${r.footerPages}/${r.htmlPages} 页 · 保留句「${FOOTER_KEPT_SENTENCE}」`
        + `在 ${r.footerKeptPages}/${r.htmlPages} 页的页脚里 · SHARED 页脚元素含登记字面 0 条`);
      console.log(`  ✓ 扫描面不许收缩: 阈值型下限 ${r.floors.join(' · ')}`
        + `（下限自守：floor ≥ measured × floorRatio，比例与依据见 scripts/data/residue-guard.json）`);
      console.log(`    · 关系式（详情页数 ${r.dealPages}，从产物现算）: ${r.relations.join(' · ')}`
        + '（t6 F7：把阈值型下限的 25% 余量收成 0；两条并存，谁严谁生效）');
    }
  }

  // ---- 站点归属验证 meta（v1.8-seo-answer-pages）----
  // 配置了 token ⇒ 首页 head 里必须恰好出现一次；没配置 ⇒ 一次都不许出现。
  // 两种方向都判，是因为「注入静默失效」与「假 token 上线」是两种不同的线上事故。
  {
    const homeHtml = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
    const config = siteVerification.readConfig();
    const problems = [];
    for (const key of siteVerification.PROVIDERS) {
      const entry = config[key];
      const count = homeHtml.split(`name="${entry.metaName}"`).length - 1;
      if (entry.token && count !== 1) problems.push(`${entry.metaName} 应恰好出现 1 次（实得 ${count}）`);
      if (!entry.token && count !== 0) problems.push(`${entry.metaName} 未配置 token 却出现在首页（${count} 次）`);
    }
    if (problems.length) fail(`站点归属验证 meta: ${problems.join('；')}`);
    else console.log(`  ✓ 站点归属验证 meta: ${siteVerification.summary(config)}（首页 head 回读对账）`);
  }

  const cardCount = (markup.match(/<article class="g /g) || []).length;
  if (cardCount < MIN_PRERENDERED_CARDS) {
    fail(`预渲染卡片 ${cardCount} 条 < ${MIN_PRERENDERED_CARDS}`);
  } else {
    console.log(`  ✓ 预渲染卡片: ${cardCount} 条`);
  }

  // 分档分带：默认按力度排序，五档里有卡片的档必须都有带
  const tierHeads = [...markup.matchAll(/<div class="tierhead t(\d)"[^>]*>/g)].map(m => Number(m[1]));
  // 只在**卡片本体**里数 data-tier：早先是在整份 markup 里数，于是 CSS 里
  // `[data-tier="1"] .rnum { … }` 这类选择器会被算成「档位角标」，一加样式就假失败。
  const cardChunks = markup.split('<article class="g ').slice(1).map(chunk => chunk.split('</article>')[0]);
  const tierDots = cardChunks.filter(chunk => /data-tier="\d"/.test(chunk)).length;
  if (built) {
    const expected = new Set(built.cards.map(card => card.tier));
    const missingTier = [...expected].filter(tier => !tierHeads.includes(tier));
    if (missingTier.length) fail(`档位 ${missingTier.join(', ')} 有卡片但缺少分带标题`);
    else if (tierDots !== cardCount) fail(`带档位角标的卡片 ${tierDots} 张 ≠ 卡片 ${cardCount} 条`);
    else console.log(`  ✓ 力度分带: ${tierHeads.length} 档（${built.dist}）`);
  }

  // 厂商 logo：卡片上的 data-logo 必须都能在产物里找到图形文件
  const tileKeys = [...new Set([...markup.matchAll(/data-logo="([^"]+)"/g)].map(m => m[1]))];
  const brokenLogos = tileKeys.filter(key => !fs.existsSync(path.join(logoDir, `${key}.svg`)) &&
    !fs.existsSync(path.join(logoDir, `${key}.png`)));
  const textTiles = (markup.match(/class="lg text"/g) || []).length;
  if (brokenLogos.length) fail(`卡片引用了产物里不存在的 logo: ${brokenLogos.join(', ')}`);
  else console.log(`  ✓ 卡片 logo: 官方图形 ${tileKeys.length} 个 / 名称缩写兜底 ${textTiles} 个`);

  // 「官方图形」与「名称缩写兜底」必须二选一：混在同一张卡上会让人以为缩写块也是官方 logo
  const cardsMarkup = markup.split('<article class="g ').slice(1).map(chunk => chunk.split('</article>')[0]);
  const mixed = cardsMarkup.filter(card => /data-logo="/.test(card) && /class="lg text"/.test(card)).length;
  if (mixed) fail(`有 ${mixed} 张卡片同时出现官方图形与名称缩写块（应二选一）`);
  else console.log(`  ✓ 图形与缩写不混用: ${cardsMarkup.length} 张卡片均为二选一`);

  // 骨架的其余部分不能留空
  if (/<!--PRERENDER:/.test(html)) fail('产物仍有未替换的预渲染标记');
  const facetCount = (markup.match(/data-facet="/g) || []).length;
  if (facetCount < 4) fail(`筛选条只有 ${facetCount} 个按钮（预渲染失败）`);
  else console.log(`  ✓ 筛选条: ${facetCount} 个 facet 按钮`);

  // 同页锚点：导航里的 #tier-N 必须在预渲染正文里有对应 id，否则就是死锚点
  const anchors = [...markup.matchAll(/href="#(tier-\d)"/g)].map(m => m[1]);
  const dangling = anchors.filter(id => !markup.includes(`id="${id}"`));
  if (!anchors.length) fail('找不到「跳到档位」锚点');
  else if (dangling.length) fail(`锚点没有落点：${[...new Set(dangling)].join(', ')}`);
  else console.log(`  ✓ 同页锚点: ${[...new Set(anchors)].length} 个都有落点`);

  // 收藏 / 对比（G11）：预渲染的 HTML 里**一个控件都不能有**。
  // 整块由 JS 建 DOM（星标挂在卡片上、对比条与对比弹层都是 createElement），
  // 所以无 JS 时页面上连一个「点了没反应」的死按钮都不存在——这是 PLAN.md G11 的硬要求，
  // 在这里用产物本身证明，而不是靠人读代码相信。
  //
  // 标记要写得足够具体：`.cmpbar` / `.fav` 这类**类名**在 <style> 里本来就有
  // （样式块不属于 markup），拿类名去找必然假失败——要找的是「控件元素」本身。
  // `data-fav-open`（收藏入口）/ `data-fav-prune`（清理失效收藏）与星标同源：
  // 收藏入口按「本机收藏数 > 0」才渲染，而构建期没有 localStorage ⇒ 预渲染里必然是零。
  const g11Controls = ['data-fav-toggle', 'data-fav=', 'data-fav-open', 'data-fav-prune',
    'data-cmp-open', 'data-cmp-clear', 'data-cmp-remove', 'class="cmpbar"', 'id="cmpbar"', 'id="compare"'];
  const g11Leaked = g11Controls.filter(token => markup.includes(token));
  if (g11Leaked.length) fail(`预渲染 HTML 里出现了收藏/对比控件（无 JS 时的死按钮）: ${g11Leaked.join(', ')}`);
  else console.log('  ✓ 收藏/对比: 预渲染 HTML 零控件（整块由 JS 建，无 JS 时不给可点暗示）');

  // 字段与表头口径：JS 里写死「最多 4 条」，产物自检跟着对一遍，避免两处漂移
  if (!/const CMP_MAX = 4;/.test(appSource)) fail('app 脚本里找不到 const CMP_MAX = 4（对比上限口径变了？）');
  else console.log('  ✓ 对比上限: CMP_MAX = 4（与页脚提示文案同源）');

  // 纠错入口：详情弹层是 JS 渲染的（与弹层本身一致），所以这里只断言模板存在，
  // 真实行为（点开详情能看到带 id 的 Issue 链接）由 verify-site.js 在浏览器里验。
  // A 包（判据只加不松）：原有 issue 入口断言一个字没删，后面追加三条新事实 ——
  //   ① 复制按钮与 aria-live 区域在模板里；
  //   ② 复制实现是**共享片段**（详情页与首页弹层同一份源码），不是第二份；
  //   ③ 按钮默认隐藏、只在 body.copy-ready 后显示 —— 无 JS 时不留死按钮。
  const styleSource = fs.existsSync(path.join(OUT, styleAsset.FILE))
    ? fs.readFileSync(path.join(OUT, styleAsset.FILE), 'utf8')
    : html;
  if (!/issues\/new\?title=/.test(appSource)) fail('详情模板里没有纠错入口');
  else if (!/class="dact-copy"/.test(appSource)) fail('详情模板里没有「这条领不到了？」复制按钮（.dact-copy）');
  else if (!/aria-live="polite"/.test(appSource)) fail('复制反馈缺少 aria-live 状态区域（读屏读不到反馈）');
  else if (!/SHARED:dealcopy:START/.test(appSource) || !/SHARED:dealcopy:END/.test(appSource)) {
    fail('详情页复制实现缺少 SHARED:dealcopy 共享标记（会退化成两份实现）');
  } else if (!/\.copy-ready \.dact \.dact-copy\s*\{/.test(styleSource)) {
    fail('复制按钮没有「JS 就绪才显示」的 CSS 门控（无 JS 时会出现死按钮）');
  } else {
    console.log('  ✓ 纠错入口: issue 链接 + 复制按钮 + aria-live（共享实现 · 无 JS 隐藏）');
  }

  // 只在「已渲染的卡片」里数，避免把内联脚本里的模板字符串字面量也算进去
  // （cardHtml 的源码里含有 class="go" / data-model-count 这些字面量）。
  const ctaCount = (markup.match(/class="go" href="https?:/g) || []).length;
  console.log(`  ✓ 官方页入口: ${ctaCount} 个`);
  if (ctaCount < cardCount) fail(`官方页入口 ${ctaCount} 个少于卡片 ${cardCount} 条`);

  // 首页内链：标题指向站内详情页（可索引、可内链），CTA 仍直达官方页
  const titleHrefs = [...markup.matchAll(/<h3><a href="([^"]+)"/g)].map(m => m[1]);
  const toDetail = titleHrefs.filter(href => href.startsWith('deal/')).length;
  if (!titleHrefs.length) fail('首页没有卡片标题链接');
  else if (toDetail !== titleHrefs.length) fail(`首页标题链接有 ${titleHrefs.length - toDetail} 个没指向站内详情页`);
  else console.log(`  ✓ 首页内链: ${toDetail} 个标题链接全部指向站内详情页（CTA 仍指官方）`);

  // 独立详情页：数量、canonical 自指、静态正文、纯静态（不拉数据）、sitemap 一致
  const dealEntries = payload.deals.filter(deal => deal.type === 'deal' && deal.id);
  // 窗口期页（到期但归档事件未落地）临时 noindex：文件仍全量生成，但**不进 sitemap**。
  // 所以 sitemap 对账只数可索引的那些；noindex 页反过来必须「不在 sitemap 里」（下面有牙）。
  const indexableDealPages = built.detailPages.filter(page => page.indexable);
  const limboDealPages = built.detailPages.filter(page => !page.indexable);
  const detailRoot = path.join(OUT, 'deal');
  const detailDirs = fs.existsSync(detailRoot)
    ? fs.readdirSync(detailRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).length
    : 0;
  if (detailDirs !== dealEntries.length) fail(`详情页 ${detailDirs} 个 ≠ type=deal ${dealEntries.length} 条`);
  else console.log(`  ✓ 详情页数量: ${detailDirs} 个（= type=deal 条数）`);

  const sitemapLocs = [...fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(match => match[1]);
  // ⚠️ 这里的算术**必须把目录页与状态页算进去**。原先写死 `dealEntries.length + 1`，
  // 加任何一条 URL 都会让构建直接失败 —— 这是刻意的硬门禁（sitemap 是发布面），
  // 所以新增路由时改这里不是「为了让测试通过」，而是契约变更的显式落点。
  // v1.2 把「分类页」这一项换成「目录页」（分类页 + 按需求页），两者是同一张注册表。
  //
  // 每一项都写成自述的：数字对不上时，报错信息里的分项就是排查路径。
  // v1.5：再加一项「变化雷达页」。v1.6：再加一项「订阅中心」。
  // v1.7：sitemap 只收**独立可索引**的页面；v1.8 起别名页不再 noindex 而是 canonical 指向正本，
  // 但它们**仍然不进 sitemap**（sitemap 是「请索引这些独立 URL」的声明）⇒ 这里按
  // `independent`（可索引 && canonical 自指）过滤，条数口径与 sitemap 生成端同一份。
  // 而且条数不再手写公式 —— 直接与构建期生成的那份 `sitemapEntries` 逐条对账。
  const indexableDirectories = built.directoryPages.filter(page => page.indexable && !page.canonicalRoute);
  const expectedLocs = indexableDealPages.length + 1 /* 首页 */ + indexableDirectories.length + 1 /* 状态页 */
    + 1 /* 变化雷达页 */ + 1 /* 资料入口页 */ + 1 /* 套餐对比页 */ + 1 /* API 计费页 */ + 1 /* API 成本计算器 */
    + 1 /* Codex 额度重置档案页 */
    + 1 /* 模型资料索引 */ + built.modelDetailCount /* 模型详情页 */
    + 1 /* 档案索引 */ + built.archiveDetailCount /* 档案详情页 */
    + 1 /* 数据文档与引用页 */
    + 1 /* 全站搜索页（v3.4 F3） */;
    // t4：公式里去掉「订阅中心 +1」与「数据文档页 +1」—— 那两页随订阅层与数据出口子系统下架。
    // v1.8：数据文档页以**更窄的定位**回来（不发布数据文件，只给许可与引用），公式加回它。
  if (sitemapLocs.length !== expectedLocs) {
    fail(`sitemap ${sitemapLocs.length} 条 ≠ 首页 1 + 可索引落地页 ${indexableDirectories.length}` +
      `（分类页 ${built.collectionPages.length} + 按需求页/别名 ${built.needPages.length} 中可索引的` +
      ` + 分类落地页 ${built.categoryPages.length} + 厂商落地页 ${built.vendorPages.length}` +
      ` + 枢纽 ${built.hubPages.length}）+ 状态页 1 + 变化雷达页 1 + 资料入口页 1 + 套餐对比页 1 + API 计费页 1` +
      ` + API 成本计算器 1 + Codex 额度重置档案页 1 + 模型索引 1 + 模型详情页 ${built.modelDetailCount}` +
      ` + 档案索引 1 + 档案详情页 ${built.archiveDetailCount} + 数据文档与引用页 1 + 全站搜索页 1` +
      ` + 详情页 ${indexableDealPages.length}` +
      `（窗口期 noindex ${limboDealPages.length} 个不进 sitemap）`);
  } else {
    const notListed = indexableDealPages.filter(page => !sitemapLocs.some(loc => loc.endsWith(`/deal/${encodeURIComponent(page.id)}/`)));
    // 反向牙：窗口期 noindex 页**绝不能**出现在 sitemap 里（noindex 进 sitemap 自相矛盾，
    // 也会把「到期-归档时间窗」的孤儿页重新暴露给搜索引擎）。
    const limboListed = limboDealPages.filter(page => sitemapLocs.some(loc => loc.endsWith(`/deal/${encodeURIComponent(page.id)}/`)));
    const directoriesNotListed = indexableDirectories.filter(page => !sitemapLocs.includes(page.url));
    const aliasesListed = built.aliasPages.filter(page => sitemapLocs.includes(page.url));
    if (notListed.length) fail(`sitemap 漏了 ${notListed.length} 个可索引详情页`);
    else if (limboListed.length) fail(`sitemap 里出现了 ${limboListed.length} 个窗口期 noindex 详情页（应临时排除）: ${limboListed.slice(0, 3).map(p => p.id).join('、')}`);
    else if (directoriesNotListed.length) fail(`sitemap 漏了落地页: ${directoriesNotListed.map(p => p.route).join(', ')}`);
    else if (aliasesListed.length) fail(`sitemap 里出现了 noindex 的别名页: ${aliasesListed.map(p => p.route).join(', ')}`);
    else if (!sitemapLocs.includes(`${SITE_URL}status/`)) fail('sitemap 漏了状态页 status/');
    else if (!sitemapLocs.includes(`${SITE_URL}changes/`)) fail('sitemap 漏了变化雷达页 changes/');
    else if (!sitemapLocs.includes(`${SITE_URL}${plansHubPage.PLANS_HUB_ROUTE}`)) fail(`sitemap 漏了资料入口页 ${plansHubPage.PLANS_HUB_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${modelsPage.MODELS_INDEX_ROUTE}`)) fail(`sitemap 漏了模型资料索引 ${modelsPage.MODELS_INDEX_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${archiveLib.ARCHIVE_INDEX_ROUTE}`)) fail(`sitemap 漏了历史档案索引 ${archiveLib.ARCHIVE_INDEX_ROUTE}`);
    else if (built.archiveDetailRoutes.some(route => !sitemapLocs.includes(`${SITE_URL}${route}`))) {
      const missing = built.archiveDetailRoutes.filter(route => !sitemapLocs.includes(`${SITE_URL}${route}`));
      fail(`sitemap 漏了 ${missing.length} 个档案详情页：${missing.slice(0, 3).join('、')}`);
    }
    else if (built.modelGateSkipped.some(gate => sitemapLocs.includes(`${SITE_URL}${gate.route}`))) {
      const bad = built.modelGateSkipped.filter(gate => sitemapLocs.includes(`${SITE_URL}${gate.route}`));
      fail(`sitemap 里出现了 ${bad.length} 个**未过生成门槛**的模型页（会造成死链）：${bad.slice(0, 3).map(gate => gate.route).join('、')}`);
    }
    else if (built.modelDetailRoutes.some(route => !sitemapLocs.includes(`${SITE_URL}${route}`))) {
      const missing = built.modelDetailRoutes.filter(route => !sitemapLocs.includes(`${SITE_URL}${route}`));
      fail(`sitemap 漏了 ${missing.length} 个模型详情页：${missing.slice(0, 3).join('、')}`);
    }
    else if (!sitemapLocs.includes(`${SITE_URL}${plansPage.PLANS_ROUTE}`)) fail(`sitemap 漏了套餐对比页 ${plansPage.PLANS_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${apiPlansPage.API_PLANS_ROUTE}`)) fail(`sitemap 漏了 API 计费页 ${apiPlansPage.API_PLANS_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${apiCostPage.API_COST_ROUTE}`)) fail(`sitemap 漏了 API 成本计算器 ${apiCostPage.API_COST_ROUTE}`);
    else if (!sitemapLocs.includes(`${SITE_URL}${CODEX_RESETS_ROUTE}`)) fail(`sitemap 漏了 Codex 额度重置档案页 ${CODEX_RESETS_ROUTE}`);
    else console.log(`  ✓ sitemap: ${sitemapLocs.length} 条（首页 + ${built.collectionPages.length} 个分类页 + ` +
      `按需求页中独立可索引的部分 + ${built.categoryPages.length} 个分类落地页 + ` +
      `${built.vendorPages.length} 个厂商落地页 + ${built.hubPages.length} 个枢纽页 + 状态页 + 变化雷达页 + ` +
      `资料入口页 + 套餐对比页 + API 计费页 + 模型索引 + ${built.modelDetailCount} 个模型详情页 + ` +
      `档案索引 + ${built.archiveDetailCount} 个档案详情页 + ` +
      `${indexableDealPages.length} 个可索引详情页${limboDealPages.length ? `（另 ${limboDealPages.length} 个窗口期页临时 noindex、不进 sitemap）` : ''}；${built.aliasPages.length} 条别名页按 canonical 收口、不进 sitemap）`);
  }

  // B 包：/codex-reset/ Codex 额度重置档案（构建期快速对账；完整牙在 verify-site.js 的新一节）。
  // 判据：页面行数 == 数据条数（不读内存里的渲染字符串，读**磁盘产物**）、无内联页面脚本、
  // canonical / hreflang 自指，以及页面侧诚实性守卫「预测 / 概率 / %」。
  // ⚠️ 「预测」的例外只有口径块那句否定句，且必须**恰好出现一次** —— 题面同时要求
  // 「口径块明写『本页不预测下一次重置』」与「出现『预测』即判红」，两句在字面上互斥；
  // 取交集：只允许这一句里出现，其余任何位置出现都判红（这比「有没有出现」更严，不是更松）。
  {
    const codexFile = path.join(OUT, 'codex-reset', 'index.html');
    const problems = [];
    if (!fs.existsSync(codexFile)) problems.push('缺少 codex-reset/index.html');
    else {
      const page = fs.readFileSync(codexFile, 'utf8');
      const rowCount = (page.match(/data-codex-event="/g) || []).length;
      const expectedTotal = built && built.codexResets ? built.codexResets.total : -1;
      if (rowCount !== expectedTotal) problems.push(`时间线行数 ${rowCount} ≠ 数据条数 ${expectedTotal}`);
      // 数标记前先摘掉 <script>/<style>/注释：页面共享的首页 <style> 里有一句
      // 「首页此前**一个 <h1> 都没有**」的 CSS 注释，直接 match 会把注释里的字面量数成元素
      // （实测一次报「h1 2 个」）—— 与 seo.js `h1Count()` 同一条纪律，不再自写第四处读点。
      const h1Count = seo.h1Count(page);
      if (h1Count !== 1) problems.push(`h1 ${h1Count} 个（必须恰好 1 个）`);
      if (!page.includes(`<link rel="canonical" href="${SITE_URL}${CODEX_RESETS_ROUTE}">`)) problems.push('canonical 不是自指');
      if (!/rel="alternate" hreflang="zh-CN"/.test(page)) problems.push('缺少 hreflang=zh-CN');
      if (!/rel="alternate" hreflang="x-default"/.test(page)) problems.push('缺少 hreflang=x-default');
      // 纯静态：分析 bootstrap、主题脚本、JSON-LD 是允许的共享内联段，除此之外不许有脚本。
      const withoutAllowedScripts = analytics.stripBootstrap(page)
        .replace(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/g, '')
        .replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
      if (/<script(?![^>]*\bsrc=)[^>]*>/.test(withoutAllowedScripts)) problems.push('出现了内联页面脚本（这一页必须是纯静态）');
    }
    if (problems.length) fail(`Codex 额度重置档案页：${problems.join('；')}`);
    else console.log(`  ✓ Codex 额度重置档案: ${built.codexResets.total} 行 == 数据条数 · 纯静态 · ` +
      'canonical/hreflang 自指（诚实性守卫的唯一实现在 verify-site.js §25，含可证伪变异自检）');
  }

  // 分类页：**逐条回读对账**，而不是「文件存在就算过」。
  //
  // 与 /status/ 同一套机制（读回产物 + 与机器可读的那份对账），但断言更硬：
  //   · 表格里的详情页链接集合 == dist/assets/data/offers.json 里 `collections` 筛出来的 id 集合
  //   · 每个分类页都要有 canonical 自指、要有三段 JSON-LD（含 BreadcrumbList）
  //     （原先还有「要声明两个 feed」一条：v3.2 的声明面只开给首页与 /changes/ 两个路由，
  //      目录页这一族**仍然是 0 条** —— 那 0 条由上面的「订阅声明面」块统一对账，
  //      判据本体在 tools/verify-site.js 的 subscriptionDeclarationProblem()，不在本块）
  //   · 无 JS 可读：表格是构建期写的，正文长度必须够
  // 为什么 jsonld 要有断言：`/status/` 那页恰恰是「有五条约定里的两条」——
  // 没有断言的三条，写漏了不会有任何东西红（子代理核查结论）。新路由不重复那个模式。
  {
    const problems = [];
    const published = JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8'));
    const publishedById = new Map(published.deals.map(deal => [deal.id, deal]));
    for (const page of built.directoryPages) {
      const prefix = '../'.repeat(page.route.split('/').length - 1);
      const field = page.kind === 'need' ? 'needs' : 'collections';
      const file = path.join(OUT, page.route, 'index.html');
      if (!fs.existsSync(file)) { problems.push(`缺少 ${page.route}index.html`); continue; }
      const body = fs.readFileSync(file, 'utf8');

      // ① 条目集合逐个 id 对账（页面 → 数据 与 数据 → 页面 两个方向）。
      //    v1.7：期望集合按**类型**从已发布数据独立重算一次 —— 不读构建期记下的 itemIds。
      //    （读自己写下的东西等于对账自己，那正是「页面写 12、实际列 7」能溜过去的原因。）
      const onPage = new Set([...body.matchAll(/href="([^"]*?)deal\/([^/"]+)\/"/g)].map(m => decodeURIComponent(m[2])));
      const pool = published.deals.filter(deal => deal.type === 'deal');
      let expected = new Set();
      if (page.kind === 'collection') expected = new Set(pool.filter(d => (d.collections || []).includes(page.slug)).map(d => d.id));
      else if (page.kind === 'need') expected = new Set(pool.filter(d => (d.needs || []).includes(page.slug)).map(d => d.id));
      else if (page.kind === 'alias') {
        const target = built.directoryPages.find(item => item.route === page.aliasOf);
        if (!target) problems.push(`${page.route} 的别名目标 ${page.aliasOf} 不在产物里`);
        else if (target.kind === 'collection') expected = new Set(pool.filter(d => (d.collections || []).includes(target.slug)).map(d => d.id));
        else expected = new Set(pool.filter(d => (d.needs || []).includes(target.slug)).map(d => d.id));
      } else if (page.kind === 'category') expected = new Set(pool.filter(d => d.category === page.key).map(d => d.id));
      else if (page.kind === 'vendor') expected = new Set(pool.filter(d => VENDOR_KEY_OF(d) === page.key).map(d => d.id));
      if (page.kind === 'hub') {
        // 枢纽页列的是**子页面**，不是条目：逐个核对子页链接，并断言没有混进条目行
        const children = page.childRoutes || [];
        for (const route of children) {
          if (!body.includes(`href="${prefix}${route}"`)) problems.push(`${page.route} 缺少到子页 ${route} 的链接`);
        }
        if (onPage.size) problems.push(`${page.route} 是枢纽页，却渲染了 ${onPage.size} 条条目行`);
      } else {
        const missing = [...expected].filter(id => !onPage.has(id));
        const extra = [...onPage].filter(id => !expected.has(id));
        if (missing.length) problems.push(`${page.route} 漏了 ${missing.length} 条（如 ${missing.slice(0, 3).join(', ')}）`);
        if (extra.length) problems.push(`${page.route} 多了 ${extra.length} 条不该在这一页里的（如 ${extra.slice(0, 3).join(', ')}）`);
        if (page.count !== expected.size) problems.push(`${page.route} 报告条数 ${page.count} ≠ 数据 ${expected.size}`);
      }
      // ①′ 内链前缀必须与输出层数一致。写死的症状极隐蔽：页面打得开、内容都对，
      //     只有**所有**内链 404。分类页 1 层（`../`）、按需求页 2 层（`../../`）。
      const wrongPrefix = [...body.matchAll(/href="((?:\.\.\/)+)deal\//g)]
        .map(m => m[1]).filter(p => p !== prefix);
      if (wrongPrefix.length) {
        problems.push(`${page.route} 的详情页内链前缀应为 ${prefix}，实得 ${[...new Set(wrongPrefix)].join(' / ')}`);
      }

      // ② 该有的元信息一个都不能少（v1.8：canonical 的期望值由 `canonicalRoute` 决定 ——
      // 别名页指向正本、其余自指；noindex 只允许出现在「策略判 noindex」的页面上，
      // 而目录页家族今天一条都没有）。这两条与 `lib/seo.js` 的 canonical-self / robots-policy
      // 同源不同实现：这里从**刚写下的字符串**回读，那边从**整站描述符**判。
      const expectedCanonical = page.canonicalRoute ? `${SITE_URL}${page.canonicalRoute}` : page.url;
      if (!body.includes(`<link rel="canonical" href="${expectedCanonical}">`)) {
        problems.push(`${page.route} canonical 不是 ${expectedCanonical}${page.canonicalRoute ? '（别名应以正本为 canonical）' : '（自指）'}`);
      }
      if (page.indexable && /name="robots"[^>]*noindex/.test(body)) problems.push(`${page.route} 可索引却带了 noindex`);
      if (!page.indexable && !/name="robots"[^>]*noindex/.test(body)) problems.push(`${page.route} 是 noindex 页面却没有 noindex`);
      // t4 删掉了两条订阅声明断言（每页必须声明两个根 Feed / 有专属 Feed 的页面必须声明它）。
      // v3.2 的声明面**只开给两个路由**（首页与 `/changes/`），这一块扫的是目录页 —— 它们仍然是 0 条，
      // 由自检里的「订阅声明面」块统一对账（扫描面 = 全部 .html；判据本体在 `tools/verify-site.js`）。
      let ldTypes = [];
      try {
        ldTypes = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
          .map(m => JSON.parse(m[1])['@type']);
      } catch (error) {
        problems.push(`${page.route} JSON-LD 解析失败: ${error.message}`);
      }
      for (const need of ['CollectionPage', 'BreadcrumbList', 'ItemList']) {
        if (!ldTypes.includes(need)) problems.push(`${page.route} 缺少 JSON-LD ${need}`);
      }
      // 「多了」同样要拦：只断言「包含」的话，多出一段不属于本页类型的结构化数据
      // （比如把状态页的 WebPage 抄过来、或给目录页发 Dataset）不会有任何东西变红。
      const COLLECTION_LD_EXPECTED = ['BreadcrumbList', 'CollectionPage', 'ItemList'];
      const ldActual = ldTypes.slice().sort();
      if (JSON.stringify(ldActual) !== JSON.stringify(COLLECTION_LD_EXPECTED)) {
        problems.push(`${page.route} JSON-LD 集合不是恰好 [${COLLECTION_LD_EXPECTED.join(', ')}]，实得 [${ldActual.join(', ')}]`);
      }
      // ②″ ItemList 的条数必须与页面上的数据行**逐一对上**（v1.7 的 Tooth Test #4）。
      //     老实现声明 `deals.length` 却只发 `slice(0,50)`：/developer/ 67 条页面声明 67、实列 50，
      //     没有任何断言会发现 —— 这就是加这一条的理由。
      {
        const itemListBlock = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
          .map(m => { try { return JSON.parse(m[1]); } catch (error) { return null; } })
          .find(data => data && data['@type'] === 'ItemList');
        const rows = (body.match(/data-item="/g) || []).length + (body.match(/data-child="/g) || []).length;
        if (!itemListBlock) problems.push(`${page.route} 没有 ItemList`);
        else {
          const elements = Array.isArray(itemListBlock.itemListElement) ? itemListBlock.itemListElement.length : 0;
          if (Number(itemListBlock.numberOfItems) !== elements) {
            problems.push(`${page.route} ItemList 声明 ${itemListBlock.numberOfItems} 项但只发了 ${elements} 项`);
          }
          if (elements !== rows) problems.push(`${page.route} ItemList 有 ${elements} 项，页面数据行有 ${rows} 行`);
        }
      }
      // ③ 预渲染正文（无 JS 可读）：表格是构建期写死的。
      //    阈值**按条目数成比例**，不是常数。常数版本连续踩了两次：
      //      · 第一版只剥 `<script>`，量到的 4 万字里 38950 是 CSS（等于没量）；
      //      · 改成量内容后取常数 500，而**表体空掉**时实测 610 / 659 / 691 字
      //        （/developer/ /free-api/ /student/）—— 全部大于 500，**照样放行**。
      //    实测每条约 90–100 字（/student/ 12 行 1884 · /developer/ 67 行 6593 ·
      //    /free-api/ 45 行 4820），页头页脚等固定部分约 650 字。取 60 字/条留余量：
      //    条目越多阈值越紧，而「表体空掉」在 count>0 时必然低于它。
      const text = prerenderedText(body);
      const textFloor = page.kind === 'hub' ? 500 + 60 * page.count : 600 + 60 * page.count;
      if (text.length < textFloor) {
        problems.push(`${page.route} 预渲染正文过短（内容 ${text.length} 字 < ${textFloor}）`);
      }
      // 结构断言与上面的字数是**互相独立**的两件事：字数够而表是空的，说明渲染路径断了。
      // ⚠️ 先把 `<script>` 摘掉再取 tbody（本文件自己的纪律：数标记先摘 script）——
      //    不摘的话，将来某个内联脚本里出现 `<tbody>…</tbody>` 就会让这条断言永远为真。
      const bodyNoScript = body.replace(/<script[\s\S]*?<\/script>/gi, '');
      // v1.8-seo-answer-pages：/free-api/ 的正文里现在有**两张**表（门槛速查 + 逐条明细），
      // 主表（含 data-item 行与详情链接）始终在最后 ⇒ 取最后一个 <tbody>，而不是第一个。
      // 只取第一个会把汇总表当成主表，报出「一个详情页链接都没有」这种假红。
      const tbodyMatches = [...bodyNoScript.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)];
      const tbody = tbodyMatches.length ? tbodyMatches[tbodyMatches.length - 1][1] : '';
      if (page.count > 0 && page.kind === 'hub' && !tbody.includes(`href="${prefix}`)) {
        problems.push(`${page.route} <tbody> 里一个子页链接都没有（表格没渲染出来）`);
      }
      if (page.count > 0 && page.kind !== 'hub' && !tbody.includes(`href="${prefix}deal/`)) {
        problems.push(`${page.route} <tbody> 里一个详情页链接都没有（表格没渲染出来）`);
      }
      // ③′ 有「命中依据」列的页面：表头必须有那一列，且 tbody 里至少有一行写了依据。
      //     没有这一列，那几条「数字让人意外」的页面就只剩一个光秃秃的条数，
      //     读者无法区分「没有这类优惠」与「我们没查到」。
      if (page.kind === 'need' || page.kind === 'category' || page.kind === 'vendor' || page.kind === 'alias') {
        if (!bodyNoScript.includes('为什么在这一页')) problems.push(`${page.route} 表头缺少「为什么在这一页」一列`);
        if (page.count > 0 && !/适用人群：|福利类型含|定价模式：|分类：|需要信用卡：|中国大陆可用性：|厂商：/.test(tbody)) {
          problems.push(`${page.route} <tbody> 里没有一行写出命中依据`);
        }
      }
      if (/__[A-Z_]+_HREF__/.test(body)) problems.push(`${page.route} 残留路由占位符`);
      if (body.includes('__PREFIX__')) problems.push(`${page.route} 残留 __PREFIX__ 占位符`);
      // ④ 三态措辞：不许把「没有依据」写成「不可用」
      if (/中国大陆[^。；]{0,12}不可用/.test(body) && !/尚未确认/.test(body)) {
        problems.push(`${page.route} 出现了「不可用」却没有任何「尚未确认」——三态措辞可能被压平`);
      }
      // ④′ 摘要块：每个数字都必须带机器可读的 data-summary-label/value，
      //     且**至少一行**（只有「当前条目」也算）—— 一个渲染失败的空摘要块会静默消失。
      if (page.kind !== 'hub' && page.count > 0 && !/data-summary-label="/.test(body)) {
        problems.push(`${page.route} 没有渲染数据摘要块`);
      }
    }

    // ⑤ 首页筛选器的分类入口必须与分类页注册表**逐个 slug 对齐**。
    //
    // 判据不重复（前端读的是数据），但「有哪些分类」这件事在两处各写了一份：
    // 一处是 `audience.COLLECTION_PAGES`（生成页面），一处是 index.html 的
    // `COLLECTION_FACETS`（渲染按钮）。写错 slug、漏一个、多一个 ——
    // 症状分别是「点了没反应」「入口消失」，两边都不会报错。所以在这里对齐一次。
    const facetBlock = (appSource.match(/const COLLECTION_FACETS = \[([\s\S]*?)\];/) || ['', ''])[1];
    if (!facetBlock) {
      problems.push('index.html 里找不到 COLLECTION_FACETS（首页分类入口没了？）');
    } else {
      const facetKeys = [...facetBlock.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]);
      const expectedSlugs = audience.COLLECTION_PAGES.map(page => page.slug);
      const missing = expectedSlugs.filter(slug => !facetKeys.includes(slug));
      const extra = facetKeys.filter(slug => !expectedSlugs.includes(slug));
      if (missing.length) problems.push(`首页筛选器缺少分类入口: ${missing.join(', ')}`);
      if (extra.length) problems.push(`首页筛选器有分类页注册表里没有的入口: ${extra.join(', ')}`);
    }

    // ⑥ 首页「按需求找优惠」导航卡与注册表 + 已生成页面**三处对齐**（v1.2 建、v1.8 改成整卡）。
    //
    // 这一块是构建期注入的（`renderNeedRow`），但「注入的东西对不对」必须回读产物来判：
    //   · 每个已生成的按需求页都必须在首页有一个入口（否则那一页没有任何站内入口）；
    //   · 首页每一个入口都必须指向一个**真实存在**的文件（否则是死链）；
    //   · 入口上的数字必须等于落地页的行数（否则「首页写 12、页面列 7」而两边都不报错）；
    //   · 入口必须是 `<a>` 而不是按钮：首页是静态文件，无 JS 时按钮点了没反应。
    // 最后一条最容易在重构里丢掉（比如有人为了「点了就地筛选」把它换成 button），
    // 所以它按**元素**判，不按类名判 —— v1.8 换成整卡之后，这一条再往前一步：
    // **逐张卡**判四件套（图标 / 标题 / 说明 / 箭头）齐不齐，以及卡上那串 `class="need-card"`
    // 是不是就长在 `<a>` 自己身上（「容器挂类名、里面只有文字是链接」那种形状要能被抓住）。
    // v5 识别层起，卡上的计数还必须是 `.stat stat-30` 形态（30px 事实数字；见循环里那条断言）。
    {
      const needsNav = (html.match(/<nav class="needs"[^>]*>([\s\S]*?)<\/nav>/) || [])[1];
      if (!needsNav) {
        problems.push('首页里找不到按需求入口行（nav.needs）——预渲染注入失败或标记被删');
      } else {
        // 整卡：`<a class="need-card" href="…">` 起、`</a>` 止。href 与卡片内容是同一个匹配里出来的，
        // 所以「哪张卡指向哪里」不需要第二次解析。`[^>]*` 只为容忍将来往 `<a>` 上再挂属性 ——
        // 「卡不是 <a> 本身」那种形状（容器挂类名、里面一个文字链接）仍然匹配不到。
        const cards = [...needsNav.matchAll(/<a class="need-card" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
        const cardClassHits = (needsNav.match(/class="need-card"/g) || []).length;
        if (cardClassHits !== cards.length) {
          problems.push(`class="need-card" 出现 ${cardClassHits} 次 ≠ 整卡链接 ${cards.length} 个（卡不是 <a> 本身，而是「容器挂类名 + 里面一个文字链接」那种形状）`);
        }
        if (cards.length !== built.needPages.length) {
          problems.push(`首页专题导航卡 ${cards.length} 张 ≠ 已生成页面 ${built.needPages.length} 个`);
        }
        const buttons = [...needsNav.matchAll(/<button|<input|<select|data-facet|aria-pressed|role="button"/g)].length;
        if (buttons) problems.push(`按需求导航卡里出现了 ${buttons} 个 JS 控件 / facet 语义（无 JS 时是死按钮，只允许 <a>）`);
        // v5 契约（识别层）：计数必须是 `<b class="stat stat-30">N<span class="stat-unit">条</span></b>`
        // —— 30px 事实数字。形态不对一张都不许放过；否则数字会悄悄退回 11px 灰字而不报错。
        const statHits = (needsNav.match(/<b class="stat stat-30">/g) || []).length;
        if (statHits !== cards.length) {
          problems.push(`按需求导航卡里 .stat stat-30 计数标记 ${statHits} 个 ≠ 卡片 ${cards.length} 张（v5 契约：每张卡的计数都是 30px 事实数字）`);
        }
        for (const [, href, inner] of cards) {
          // 四件套逐件取内容：图标允许内联 <svg> 或字符，取不到 = 那一件没了
          const icon = (inner.match(/<span class="need-icon" aria-hidden="true">([\s\S]*?)<\/span>/) || [])[1] || '';
          const label = (inner.match(/<strong>([^<]*)<\/strong>/) || [])[1] || '';
          const desc = (inner.match(/<small>([^<]*)<\/small>/) || [])[1] || '';
          const arrow = (inner.match(/<span class="need-arrow" aria-hidden="true">([^<]*)<\/span>/) || [])[1] || '';
          const badge = (inner.match(/<b class="stat stat-30">(\d+)<span class="stat-unit">条<\/span><\/b>/) || [])[1];
          if (!badge) problems.push(`专题导航卡 ${href} 的计数不是 .stat 形态（v5 契约：计数必须是 30px 事实数字）`);
          const missing = [!icon && '图标', !label && '标题', !desc && '说明', !arrow && '箭头'].filter(Boolean);
          if (missing.length) problems.push(`专题导航卡 ${href} 缺 ${missing.join(' / ')}（四件套不齐，卡片退化成一条看不懂的链接）`);
          // 「每条 href 有真实文件」：`built.needPages` 只能证明**计划里有**这一页，
          // 证明不了**盘上有** —— 这一条按产物判，死链在这里就被拦下。
          if (!fs.existsSync(path.join(OUT, href, 'index.html'))) {
            problems.push(`专题导航卡指向不存在的文件 ${href}index.html`);
          }
          const page = built.needPages.find(item => item.route === href);
          if (!page) { problems.push(`首页导航卡「${label}」指向未生成的 ${href}`); continue; }
          if (badge !== undefined && page.count !== Number(badge)) {
            problems.push(`首页导航卡「${label}」数字 ${badge} ≠ 落地页 ${page.count} 条`);
          }
        }
        const missingEntry = built.needPages.filter(page => !cards.some(card => card[1] === page.route));
        if (missingEntry.length) problems.push(`这些按需求页在首页没有入口: ${missingEntry.map(p => p.route).join(', ')}`);
      }
    }

    if (problems.length) fail(`目录页: ${problems.slice(0, 6).join('；')}`);
    else {
      const collectionSummary = built.collectionPages.map(p => `/${p.slug}/ ${p.count} 条`).join(' · ');
      const needSummary = built.needPages.map(p => `/${p.route} ${p.count} 条`).join(' · ');
      // 「双 feed」那一项是 t4 删掉的：这一块从不检查订阅声明（v3.2 的声明面只开给首页与
      // `/changes/`，目录页这一族的带 type 声明恒为 0），所以这里也不把它写成一条被验过的约定 ——
      // 日志只说这一块**真的**对过账的东西（那 0 条由上面「订阅声明面」块统一对账）。
      console.log(`  ✓ 分类页: ${collectionSummary}（逐条 id 对账 · canonical · 三段 JSON-LD · 预渲染正文）`);
      console.log(`  ✓ 按需求页: ${needSummary}（同上 + 命中依据列 · 内链前缀 ${'../../'} · 首页入口数字对齐）`);
    }
  }

  const sampleDeals = [dealEntries[0], dealEntries[Math.floor(dealEntries.length / 2)], dealEntries[dealEntries.length - 1]].filter(Boolean);  let detailBad = 0;
  // A 包：从**产物** index.html 抽出的 RENDER-CORE 现算复制话术（不在自检里抄第二份文本）。
  const copyRenderCore = loadRenderCore(path.join(OUT, 'index.html'));
  for (const deal of sampleDeals) {
    const pageFile = path.join(OUT, 'deal', deal.id, 'index.html');
    if (!fs.existsSync(pageFile)) { fail(`缺少详情页 ${deal.id}`); detailBad++; continue; }
    const page = fs.readFileSync(pageFile, 'utf8');
    if (!page.includes(`/deal/${encodeURIComponent(deal.id)}/`)) { fail(`详情页 canonical 不是自指: ${deal.id}`); detailBad++; }
    const prose = String(deal.discountInfo || '').slice(0, 12);
    if (prose && !page.includes(prose)) { fail(`详情页缺少本条优惠文案（不执行 JS 读不到）: ${deal.id}`); detailBad++; }
    // A 包：静态详情页也必须带「这条领不到了？」复制入口，且**话术在构建期就拼好**
    // （data-copy 属性里就是完整文本，浏览器端不重拼）。判据从产物 index.html 抽出的
    // RENDER-CORE 现算 —— 不在自检里抄第二份文本，改话术时两边一起变。
    if (!page.includes('class="dact-copy"')) {
      fail(`详情页缺少复制按钮（.dact-copy）: ${deal.id}`); detailBad++;
    } else {
      const expectedCopy = copyRenderCore.lostReportText(deal);
      const copyAttr = (page.match(/<button type="button" class="dact-copy" data-copy="([\s\S]*?)">/) || [])[1];
      if (!copyAttr || decodeEntities(copyAttr) !== expectedCopy) {
        fail(`详情页复制话术与 RENDER-CORE 的 lostReportText 不一致: ${deal.id}`);
        detailBad++;
      } else if (!expectedCopy.includes('条目 id：' + deal.id) || !expectedCopy.includes('官方页：' + (deal.url || ''))) {
        fail(`复制话术没有带条目 id / 官方页: ${deal.id}`);
        detailBad++;
      } else if (!page.includes("classList.add('copy-ready')")) {
        fail(`详情页没有注入共享复制脚本（按钮会永远是死的）: ${deal.id}`);
        detailBad++;
      }
    }
    // 详情页**不许**出现这次 fetch（它是纯静态页）—— 判据从 `OFFERS_ARTIFACT` 现拼，
    // 免得路径再搬家时这里留下一条"看起来还在守、其实已经失配"的断言。
    const offersFetchRe = new RegExp(`fetch\\('${OFFERS_ARTIFACT.replace(/\./g, '\\.')}'`);
    if (offersFetchRe.test(page)) { fail(`详情页仍会拉 ${OFFERS_ARTIFACT}（应纯静态）: ${deal.id}`); detailBad++; }
  }
  if (!detailBad) console.log(`  ✓ 详情页抽样: ${sampleDeals.length} 个均自指 canonical、含本条文案、纯静态`);

  // 折叠无损：产物里「折叠卡覆盖的模型数 + 单条卡数」必须等于未过期优惠条数，
  // 即数据层的无损断言确实落到了静态正文里（覆盖模型数真的被输出，而不是只写在内存里）
  if (built) {
    const modelsSum = [...markup.matchAll(/data-model-count="(\d+)"/g)]
      .reduce((n, m) => n + Number(m[1]), 0);
    const foldedCards = (markup.match(/<article class="g [^>]*data-model-count="/g) || []).length;
    const covered = (cardCount - foldedCards) + modelsSum;
    if (covered !== built.visibleCount) {
      fail(`折叠覆盖条目 ${covered} 条 ≠ 未过期优惠 ${built.visibleCount} 条（折叠卡 ${foldedCards} 张 / 覆盖模型 ${modelsSum} 个）`);
    } else {
      console.log(`  ✓ 折叠无损: ${cardCount} 张卡片覆盖 ${built.visibleCount} 条优惠（${foldedCards} 张折叠卡 / ${modelsSum} 个模型）`);
    }
  }

  if (!/rel="canonical"/.test(html)) fail('缺少 canonical');
  if (!/hreflang="x-default"/.test(html)) fail('缺少 hreflang');
  if (!/property="og:image"/.test(html)) fail('缺少 og:image');
  if (!/name="twitter:card"/.test(html)) fail('缺少 twitter card');
  if (/__SITE_URL__|buguoshixc\.github\.io\/ai-deals-aggregator\/"\/>/.test(html) === false && !html.includes(SITE_URL)) {
    fail('产物中找不到站点绝对地址');
  }

  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const expectedTypes = ['Organization', 'WebSite', 'BreadcrumbList', 'FAQPage', 'ItemList'];
  const foundTypes = [];
  for (const [i, block] of ldBlocks.entries()) {
    try {
      const data = JSON.parse(block);
      foundTypes.push(data['@type']);
    } catch (e) {
      fail(`JSON-LD 第 ${i + 1} 段解析失败: ${e.message}`);
    }
  }
  for (const type of expectedTypes) {
    if (!foundTypes.includes(type)) fail(`缺少 JSON-LD ${type}`);
  }
  if (ldBlocks.length === expectedTypes.length && foundTypes.length === expectedTypes.length) {
    console.log(`  ✓ JSON-LD: ${foundTypes.join(' / ')}`);
  }

  // ---- v3.0 Stage E：厂商资料页（**从磁盘回读**对账）------------------------------------
  //
  // 与其它区域的同一条纪律：不看内存里那个 HTML 字符串，而是把 `dist/vendor/<slug>/index.html`
  // 重新读一遍，再与**盘上的** plans / api-plans / models / 关系层 / 两份变化日志逐个对账。
  // 内存里的对象与盘上的产物必须互相印证，否则「构建期算对了、写盘写错了」不会有任何东西红。
  {
    const providerTableDisk = providers.load().table;
    // P1（slug 死锁机器化）：把机器账本与「本轮首次分配、待写盘工具落盘」的厂商名一起交给断言。
    // 权威链与计划层是同一份实现：人工覆盖表 → providers.json → 机器账本 → suggestSlug()。
    const planDoc = built.plan || PLAN;
    const ledgerSlugs = {};
    for (const row of (planDoc.vendorSlugLedger && planDoc.vendorSlugLedger.vendors) || []) ledgerSlugs[row.vendorName] = row.slug;
    const autoSlugNames = (planDoc.autoSlugVendors || []).map(row => row.vendorName);
    const problems = [
      ...vendorPage.assertVendorSlugCanonical(built.directoryPages, { providerTable: providerTableDisk, vendorSlugs: site.VENDOR_SLUGS, ledgerSlugs }),
      // slug 必须来自**权威链**（覆盖表 / providers.json / 机器账本 / 本轮首次分配）：补表不改变 URL，
      // 只是把「隐式兜底」换成「显式登记」——没有这条，改 slug 表也不会有人发现。
      ...vendorPage.assertVendorSlugDeclared(built.directoryPages, {
        vendorSlugs: site.VENDOR_SLUGS, ledgerSlugs, autoSlugNames, providerTable: providerTableDisk
      }),
      ...vendorPage.assertVendorCandidateIdentity(built.directoryPages, { providerTable: providerTableDisk }),
      ...vendorPage.assertNoParallelProviderRoutes(built.directoryPages)
    ];
    const diskApiPlans = built.apiPlansStore.plans;
    const diskPlans = built.plansStore.plans;
    const diskModels = built.publishedModelsDoc.models;
    const diskLinks = built.modelLinksDoc.links;
    const diskPlanHistory = distLogView('plan-history.json', planLogSelf);
    const diskApiHistory = distLogView('api-plan-history.json', apiPlanLogSelf);
    const vendorEntries = built.directoryPages.filter(page => page.kind === 'vendor');
    for (const spec of vendorEntries) {
      const file = path.join(OUT, spec.route, 'index.html');
      if (!fs.existsSync(file)) { problems.push(`${spec.route}: 缺少产物`); continue; }
      const pageHtml = fs.readFileSync(file, 'utf8');
      const pageDeals = landing.itemsOf(spec, JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8')).deals,
        { vendorKeyOf: VENDOR_KEY_OF });
      const ctx = {
        deals: pageDeals,
        plans: diskPlans, apiPlans: diskApiPlans, models: diskModels, modelLinks: diskLinks,
        planHistoryStore: diskPlanHistory, apiPlanHistoryStore: diskApiHistory,
        providerTable: providerTableDisk,
        // t3：不再传 `feeds`（厂商页的订阅节整节下架，那一层不再有订阅这个概念）。
        prefix: '../'.repeat(spec.depth || 1),
        siteUrl: SITE_URL
      };
      problems.push(...vendorPage.assertVendorPageHonesty(pageHtml, spec, ctx).map(problem => `${spec.route}: ${problem}`));
      problems.push(...vendorPage.assertVendorApiCounts(pageHtml, spec, ctx).map(problem => `${spec.route}: ${problem}`));
    }
    if (problems.length) {
      fail(`厂商资料页未通过诚实性断言（${problems.length} 处）：${problems.slice(0, 3).join('、')}`);
    } else {
      console.log(`  ✓ 厂商资料页: ${vendorEntries.length} 页 · slug 唯一且已登记 · 无 /provider/ 并行路由` +
        ` · API 计数按 api-plans 数据现算后与页面 data-vendor-count 逐个对账 · 资料区块五节齐`);
    }
  }

  // t4 删掉的**三块**订阅自检，v3.2 只请回来一块半 —— 逐条写清，免得下一个人以为漏了：
  //   ① 「整张注册表三方对账」（每页声明了哪些 Feed ↔ 注册表 ↔ 产物文件）**不回来**：
  //      注册表本身（每页一份 Feed 那一层）没有请回来，今天只有两张固定的站点级产物。
  //   ② 「订阅发现 rel=alternate」**部分回来、且换了位置**：构建期由上面的「订阅声明面」块对账
  //      （扫描面 = 产物里全部 .html；路由 / 条数 / type 集合 / 绝对 URL），产物验收那一侧是
  //      `tools/verify-site.js` 的 `subscriptionDeclarationProblem()` —— 后者才是**唯一判据**
  //      （它还判 href 落点是否真实存在且非空、以及「剩下的 alternate 必须带 hreflang」那半边）。
  //   ③ 「订阅中心页五条约定」**不回来**：`/feeds/` 那一族没有被请回来。
  // 产物文件那一侧仍然由产物资产门禁守：`lib/published-assets.js` 是**逐路径登记制**，
  // 只有登记过的那两条订阅产物放行，其余任何 `feed*` 基名照旧判红（文件在 = 读者能下载到）。

  // FAQ 可见文案与 FAQPage 必须逐字一致。
  //
  // 两层断言，缺一不可：
  //   ① 用 visibleFaq() 从产物**独立**回读可见文案（与生成侧不同源，段落拆法也不同），
  //      逐条比对问题与「各段用单空格拼接」的答案 —— 抓截断、丢段、边界处理分叉；
  //   ② 结构化答案里**不许出现 HTML 标签** —— 标签不是答案文本，搜索引擎会把它们
  //      当字面文字读给用户；这一层不依赖任何解析实现，是最硬的兜底。
  // （原来的实现可见侧也调 extractFaq()，两侧同源 ⇒ 比较恒等、永远不可能失败。）
  try {
    const faq = ldBlocks.map(b => JSON.parse(b)).find(d => d['@type'] === 'FAQPage');
    if (faq) {
      const visible = visibleFaq(html);
      const schema = faq.mainEntity.map(q => ({ question: q.name, answer: q.acceptedAnswer.text }));
      const problems = [];

      if (visible.length !== schema.length) {
        problems.push(`条数：可见 ${visible.length} / 结构化 ${schema.length}`);
      }
      visible.forEach((item, i) => {
        if (!schema[i]) return;
        if (item.question !== schema[i].question) problems.push(`第 ${i + 1} 条问题不一致`);
        if (item.paragraphs.join(' ') !== schema[i].answer) problems.push(`第 ${i + 1} 条答案不一致`);
      });
      schema.forEach((item, i) => {
        const tags = item.answer.match(/<\/?[a-z][^>]*>/gi);
        if (tags) problems.push(`第 ${i + 1} 条答案夹带 HTML 标签 ${[...new Set(tags)].join(' ')}`);
      });

      if (problems.length) fail(`FAQ 可见文案与 FAQPage 不一致：${problems.join('；')}`);
      else console.log(`  ✓ FAQ 文案与结构化数据一致: ${visible.length} 条（可见侧独立回读 + 无标签残留）`);
    }
  } catch (e) {
    fail('FAQ 一致性校验失败: ' + e.message);
  }

  // SEO 安全门禁（v1.7）：把**刚刚写下的全部页面**交给 `seo.validate()` 过一遍。
  //
  // 这一段是全站唯一一处「跨页面」的检查：标题/canonical 是否唯一、ItemList 与页面
  // 数据行是否一致、面包屑每一级是否真实存在、sitemap 与索引策略是否一致、
  // 有没有孤儿页、摘要数字能不能被独立重算。单页自检再多也照不到这些问题 ——
  // 它们全都只在**页面之间**才成立。
  //
  // 描述符从磁盘回读（而不是复用内存里刚生成的字符串）：这样「写盘时写坏了」
  // 也会被照到。`npm run verify:seo` 会用**另一套解析**再跑一次同一批规则。
  {
    const sitemapXml = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
    const sitemap = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    const sitemapSet = new Set(sitemap.map(url => url.slice(SITE_URL.length)));
    const published = JSON.parse(fs.readFileSync(path.join(OUT, OFFERS_ARTIFACT), 'utf8')).deals;
    const dealsById = new Map(published.map(deal => [deal.id, deal]));
    const descriptors = [];
    const readPage = (route, meta) => {
      const rel = route === '' ? 'index.html' : `${route}index.html`;
      const file = path.join(OUT, rel);
      if (!fs.existsSync(file)) { fail(`SEO 门禁：缺少页面文件 ${rel}`); return null; }
      return Object.assign({
        route,
        html: fs.readFileSync(file, 'utf8'),
        indexable: true,
        inSitemap: sitemapSet.has(route),
        itemIds: [],
        childRoutes: [],
        summary: []
      }, meta);
    };
    const fixed = [
      readPage('', {
        kind: 'home', expectItemList: true,
        // 首页的 ListItem 指向**官方页面**（v0.9 起的设计），而页面可见的卡片按折叠后的
        // 条数渲染（一张折叠卡覆盖多条优惠）—— 因此行数对账与成员对账在首页不适用，
        // 它由首页自己那几条断言守着（卡片数 / CTA 数 / 折叠无损 / JSON-LD 类型集合）。
        checkItemListRows: false, checkItemListMembers: false
      }),
      readPage('status/', { kind: 'status', expectItemList: false }),
      // v1.5 修复（P1-4）：变化页的 ItemList 成员就是本站的优惠详情页（`deal/<id>/`），
      // 因此 `itemIds` 传**判据层去重后的同一份集合**（不再留空 —— 留空等于声明
      // 「成员必须属于本页」，却没有任何集合可对，每一条成员都会被判成「不属于本页」）。
      // 行数对账（声明数 == 元素数 == 页面 data-item 行数）由页面的代表行标记承担。
      readPage('changes/', {
        kind: 'changes',
        expectItemList: true,
        itemIds: built.changesItemList.map(record => record.id)
      }),
      // t4：/feeds/ 订阅中心页已整体下架，SEO 门禁的页面清单里不再有它。
      // v3.0 Stage B：/plans/ 资料入口。三个开的默认值都来自 `lib/page-kinds.js` 的声明
      // （`plans-hub`：ItemList 在场 + 行数对账 + 成员对账关掉）。
      // 成员对账关掉的理由与首页/对比页同源：ItemList 指向**子页**，而 `seo.js` 的成员判据
      // 按站内 `deal/<id>/` 判 —— 这一页的成员一致性由它自己的 `assertItemListHonesty()` 查
      // （构建期已在磁盘回读那一段跑过），这里只保留在场性与行数两条。
      // `count` 是这一页的子页数（2），不是条目数：它决定 itemlist 行数对账的口径。
      readPage(`${plansHubPage.PLANS_HUB_ROUTE}`, {
        kind: 'plans-hub',
        count: plansHubPage.PLANS_HUB_CHILDREN.length
      }),
      // v3.0 Stage D5：模型索引。非优惠实体页 —— ItemList 的成员是**本站的模型详情页**，
      // 而 `seo.js` 的成员判据按站内 `deal/<id>/` 判，因此显式关掉成员对账
      // （在场性 + 声明数 == 元素数 + 声明数 == `data-item` 行数三条照常查）。
      // 成员一致性由页面自己的 `assertPageHonesty` 查（构建期已在写盘前后各跑一次）。
      readPage(`${modelsPage.MODELS_INDEX_ROUTE}`, {
        kind: 'models-index',
        checkItemListMembers: false,
        count: built.modelDetailCount
      }),
      // v3.0 Stage F：档案索引。同样是「非优惠实体页」——ItemList 成员是档案条目，
      // 不是 `deal/<id>/`，因此显式关掉成员对账（在场性与行数照常查）。
      readPage(`${archiveLib.ARCHIVE_INDEX_ROUTE}`, {
        kind: 'archive-index',
        checkItemListMembers: false,
        count: built.archiveEntries.length
      }),
      // v3.0 Stage G：数据文档页。ItemList 成员是**数据集 endpoint**（静态文件），
      // 不是站内 `deal/<id>/`，因此显式关掉成员对账；行数 = Manifest 数据集数。
      // v2.1：套餐对比页。ItemList 指向**各自的官方定价页**（与首页同一口径），
      // 所以成员校验对不上（它按站内 `deal/<id>/` 判成员）—— 显式关掉那一条，
      // 而不是为了让断言通过去伪造一个本站不存在的套餐详情页。
      // 行数校验**保留**：ItemList 条数必须等于页面上的 `data-item` 行数。
      readPage(`${plansPage.PLANS_ROUTE}`, {
        kind: 'plans',
        expectItemList: true,
        checkItemListMembers: false,
        // 【史述·已下架】v2.3 / v3.0：这一页当年有专属的套餐变化源，要声明它（与根 Feed 并列）；
        // 订阅层下架后页面不再声明任何订阅源（`seo.js` 的 feed-declared 检查码也与描述符里的
        // feedMatch / feedIds 一起删除），描述符里只剩行数（`count`）等既有字段。
        // 【故意保留·勿当垃圾清】描述符里的 `feedMatch` 现在是**死字段**（全仓消费者 0），
        // 但清它可能改变产物 ⇒ 作废本轮全部产物级证据；要清必须先用「产物逐文件 sha256 不变」证明。
        count: JSON.parse(fs.readFileSync(path.join(ROOT, 'plans.json'), 'utf8')).count
      }),
      // v2.5：API 计费页。与套餐页同样：ItemList 指向**各自的官方定价页**，
      // 所以成员校验不适用（本站不为每个模型编一个详情页）；行数校验保留。
      // 【史述·已下架】v3.0 Stage H：这一页当年有了自己的订阅源（API 价格变化），因此与套餐页一样
      // 走 feedMatch 判据；订阅层下架后页面不再声明任何订阅源，这里同样只剩行数（`count`）等字段。
      // 【故意保留·勿当垃圾清】同上面套餐页那条：`feedMatch` 已是死字段（全仓消费者 0），
      // 队长裁定本轮**不清**（清它可能改变产物 ⇒ 作废全部产物级证据）；要清先证「产物 sha256 不变」。
      readPage(`${apiPlansPage.API_PLANS_ROUTE}`, {
        kind: 'plans',
        expectItemList: true,
        checkItemListMembers: false,
        count: JSON.parse(fs.readFileSync(path.join(ROOT, 'api-plans.json'), 'utf8')).count
      }),
      // v3.1：API 成本计算器。工具页，不是 ItemList 页面。
      readPage(`${apiCostPage.API_COST_ROUTE}`, {
        kind: 'tool',
        expectItemList: false
      }),
      // B 包：/codex-reset/ Codex 额度重置档案。固定路由、无 ItemList（时间线的成员是站外推文，
      // 不冒充本站条目集合）。页面族/布局/正文下限由 page-kinds.js 的 codex-reset 声明。
      readPage(`${CODEX_RESETS_ROUTE}`, {
        kind: 'codex-reset',
        expectItemList: false,
        count: 0
      }),
      // v1.8-seo-answer-pages：/docs/data/ 数据文档与引用页（固定路由、无 ItemList）。
      // 它的页面族/布局/下限由 `page-kinds.js` 的 data-docs 声明；这里只告诉 SEO 规则层
      // 「它是一条独立可索引页面」（canonical 自指 + 进 sitemap）。
      // v3.4 F3：全站搜索。不是 ItemList 页（成员是站内各家族，不是一份数据集合）。
      readPage(`${searchPage.SEARCH_ROUTE}`, {
        kind: 'search', expectItemList: false
      }),
      readPage(`${dataDocsPage.DATA_DOCS_ROUTE}`, {
        kind: 'data-docs',
        expectItemList: false,
        count: 0
      })
    ].filter(Boolean);
    const dealIndexableById = new Map(built.detailPages.map(page => [page.id, page.indexable]));
    const dealDescriptors = dealEntries.map(deal => {
      const indexable = dealIndexableById.get(deal.id) !== false;
      return readPage(`deal/${encodeURIComponent(deal.id)}/`, {
        kind: 'deal', expectItemList: false, itemIds: [deal.id],
        // 窗口期页：noindex + dealLimbo 标记，交给 seo.dealIndexable 的一致性判据。
        indexable, dealLimbo: !indexable
      });
    }).filter(Boolean);
    // v3.0 Stage D6：模型详情页。它是**详情叶子**（刻意没有 ItemList），而且是"非优惠实体页" ——
    // 成员对账必须显式关掉（成员判据按 `deal/<id>/` 判，模型页上永远对不上）。
    const modelDescriptors = built.modelDetailRoutes.map(route => readPage(route, {
      kind: 'model',
      expectItemList: false,
      checkItemListRows: false,
      checkItemListMembers: false,
      count: 0
    })).filter(Boolean);
    // v3.0 Stage F：档案详情页。同属「非优惠实体页 + 详情叶子」：
    // 没有 ItemList（在场性/行数/成员三条都显式关掉），成员一致性由页面自己的断言查。
    const archiveDescriptors = built.archiveDetailRoutes.map(route => readPage(route, {
      kind: 'archive-detail',
      expectItemList: false,
      checkItemListRows: false,
      checkItemListMembers: false,
      count: 0
    })).filter(Boolean);
    const directoryDescriptors = built.directoryPages.map(page => readPage(page.route, {
      kind: page.kind,
      indexable: page.indexable,
      // v1.8：canonical 目标（别名页 = 正本；其余 = 自指）。规则层据此判
      // 「独立可索引」与 sitemap 成员资格，并核对页面上的 canonical 是否指向它。
      canonicalRoute: page.canonicalRoute,
      inSitemap: sitemapSet.has(page.route),
      itemIds: page.itemIds,
      childRoutes: page.childRoutes,
      summary: page.summary,
      count: page.count,
      pinned: page.pinned,
      expectItemList: true,
      // 【故意保留·勿当垃圾清】`page.feedMatch` 已无人产出（恒为 undefined）、`seo.js` 也不再读它，
      // 所以这一行是**死字段**。队长裁定本轮不清：清它可能改变产物（产物一旦变了，本轮全部
      // 产物级证据作废），收益为零。要清必须先证明「产物逐文件 sha256 不变」。
      feedMatch: page.feedMatch,
      // v3.0 Stage E：厂商页的门槛判据（`seo.js` 按与 landing **同一条 OR** 判）。
      // 不传这两个字段时 seo.js 的行为与 v2.x 逐字相同（只查条数）。
      eventCount: page.eventCount,
      nonDealMaterial: page.nonDealMaterial
    })).filter(Boolean);
    descriptors.push(...fixed, ...dealDescriptors, ...modelDescriptors, ...archiveDescriptors, ...directoryDescriptors);

    const result = seo.validate(descriptors, {
      siteUrl: SITE_URL,
      sitemap,
      pinned: landing.loadPinned().map(row => row.route),
      aliases: landing.loadAliases(),
      thresholds: {
        categoryMinDeals: landing.CATEGORY_MIN_DEALS,
        vendorMinDeals: site.VENDOR_THRESHOLDS.minDeals
      },
      dealsById,
      asOf: built.lastmod,
      vendorKeyOf: VENDOR_KEY_OF,
      // 静态文件的清单**从磁盘现场走一遍**，不手写：手写的清单漏一个就会把一条
      // 正常链接判成死链（第一版就漏了 46 个 Feed 文件，一次报出 76 条假红）。
      staticFiles: (() => {
        const set = new Set();
        const walk = (dir, base) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const rel = base ? `${base}/${entry.name}` : entry.name;
            if (entry.isDirectory()) walk(path.join(dir, entry.name), `${rel}`);
            else if (entry.name !== 'index.html') set.add(rel);
          }
        };
        walk(OUT, '');
        return set;
      })(),
      gate: { skipped: built.plan.skipped }
    });
    if (result.problems.length) {
      const byCode = seo.summarize(result).byCode;
      for (const problem of result.problems.slice(0, 12)) {
        fail(`SEO[${problem.code}] ${problem.route}：${problem.detail}`);
      }
      if (result.problems.length > 12) {
        fail(`SEO 还有 ${result.problems.length - 12} 处问题未逐条打印（按码统计：${JSON.stringify(byCode)}）`);
      }
    } else {
      const s = result.stats;
      console.log(`  ✓ SEO 安全门禁: ${seo.PROBLEM_CODES.length} 个检查码 × ${s.pages} 个页面全过` +
        `（可索引 ${s.indexable} · noindex ${s.noindex} · canonical 别名 ${s.canonicalAliases} · ` +
        `详情页 ${s.dealPages} · 落地页 ${s.landingPages} · ` +
        `厂商页 ${s.vendorPages} · 分类页 ${s.categoryPages} · sitemap ${s.sitemapEntries} · ` +
        `孤儿 ${s.orphans} · 重复 canonical ${s.duplicateCanonical} · 无效内链 ${s.invalidLinks}）`);
    }
  }

  // OG 图必须是合法 PNG 且尺寸正确
  const png = fs.readFileSync(path.join(OUT, 'og-image.png'));
  const isPng = png.slice(0, 8).toString('hex') === '89504e470d0a1a0a';
  const pngW = png.readUInt32BE(16);
  const pngH = png.readUInt32BE(20);
  if (!isPng) fail('og-image.png 不是合法 PNG');
  else if (pngW !== 1200 || pngH !== 630) fail(`og-image.png 尺寸异常 ${pngW}x${pngH}`);
  else console.log(`  ✓ og-image.png: ${pngW}x${pngH}`);

  // ---- 页面级说明的「意图 × 渲染」逐页对账（notes-manifest-v1）------------------------
  //
  // 收盘的那一条：清单是意图侧（内容构造点登记，**不看** class 名的来源），这里回读刚生成的
  // HTML 当渲染侧，逐页逐槽位按「class token 集合 × 条数」对账。改名（`.snote` → 别的）、
  // 换容器（`<p>` → `<div>` / 换成不含该 token 的 class）、漏渲染，三种都会让渲染侧少一条
  // ⇒ 这里红，消息点名 `route#index` 并给出两侧读数。台账（范围之外的模块）与页面族结构下限
  // 各自守一条：整族说明被删 / 被改名时，逐条对账两侧会同时少，只有下限还能把它挡住。
  {
    const { problems, readings } = noteManifestSelfCheck();
    const total = slotId => readings.reduce((sum, row) => sum + (row.dom[slotId] || 0), 0);
    const declaredTotal = slotId => readings.reduce((sum, row) => sum + (row.declared[slotId] || 0), 0);
    const untrackedPages = readings.filter(row => row.untracked);
    const pinnedNotes = noteIntent.size
      ? [...noteIntent.values()].reduce((sum, page) => sum + page.notes.filter(note => note.pinned).length, 0)
      : 0;
    for (const problem of problems.slice(0, 8)) fail(problem);
    if (problems.length > 8) fail(`…另有 ${problems.length - 8} 条说明对账差异（上面是前 8 条）`);
    if (!problems.length) {
      const slotLine = NOTE_SLOTS.map(slot => `${slot.id.replace('main-', '.')} 声明 ${declaredTotal(slot.id)} / 产物 ${total(slot.id)}`).join(' · ');
      console.log(`  ✓ 页面级说明清单: ${readings.length} 页 × ${NOTE_SLOTS.length} 个槽位逐页对账一致（${slotLine}）`);
      console.log(`    · 逐条登记 ${[...noteIntent.values()].reduce((sum, page) => sum + page.notes.length, 0)} 条`
        + `（其中组装点 pin ${pinnedNotes} 条）· 台账（构造点在范围之外的页面族）${untrackedPages.length} 页`
        + `${untrackedPages.length ? `：${[...new Set(untrackedPages.map(row => row.untracked))].join(' / ')}` : ''}`);
      console.log(`    · 清单文件 ${NOTES_MANIFEST_FILE} → ${path.relative(ROOT, NOTES_MANIFEST_PATH).split(path.sep).join('/')}`
        + `（${Buffer.byteLength(notesManifestText(), 'utf8')} 字节，NDJSON：首行 header + 每行一页，按 route 排序 ⇒ 逐字节可重建）`
        + `；它不在产物目录里，自检全过之后就位`);
    }
  }

  const size = fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log(`  产物总大小: ${(size / 1024).toFixed(1)} KB`);
  console.log(failed ? `\n❌ 产物自检失败（${failed} 项）` : '\n✅ 产物自检通过');
  return failed === 0;
}

  return selfCheck;
}

module.exports = { createSelfCheck };
