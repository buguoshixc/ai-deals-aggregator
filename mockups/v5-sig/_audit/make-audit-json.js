'use strict';
/* 从 measured.json / linkcheck.json / supplement.json / diag4.json 汇总出结构化 audit.json */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const AUD = __dirname; const ROOT = path.resolve(__dirname, '../../..');
const R = JSON.parse(fs.readFileSync(path.join(AUD, 'measured.json'), 'utf8'));
const L = JSON.parse(fs.readFileSync(path.join(AUD, 'linkcheck.json'), 'utf8'));
const S = JSON.parse(fs.readFileSync(path.join(AUD, 'supplement.json'), 'utf8'));
const D4 = JSON.parse(fs.readFileSync(path.join(AUD, 'diag4.json'), 'utf8'));
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
const files = ['mockups/v5-sig/home-light.html','mockups/v5-sig/home-dark.html','mockups/v5-sig/home-390.html','mockups/v5-sig/family.html','mockups/v5-sig/compare.html','mockups/v5-sig/shots/home-25pct.png','mockups/v5-sig/shots/home-before-after.png','mockups/v5-sig/shots/after-1440.png','mockups/v5-sig/shots/before-1440.png','mockups/v5-sig/_tools/build-sig.js','index.html','dist/index.html','dist/plans/api/index.html'];
const snapshot = Object.fromEntries(files.map(f => [f, sha(f)]));

const tierKeys = ['t1','t2','t3','t4','t5'];
const contrastTable = {};
for (const theme of ['light','dark']) {
  contrastTable[theme] = { bg: R.contrast[theme].bg, card: R.contrast[theme].card, tiers: {}, on: {} };
  for (const k of tierKeys) {
    const t = R.contrast[theme].tiers[k];
    contrastTable[theme].tiers[k] = { hex: t.hex, hue: t.hsl.h, sat: t.hsl.s, hueClass: t.hueClass, vsBg: t.blockVsBg, vsCard: t.blockVsCard };
    contrastTable[theme].on[k] = { hex: R.contrast[theme].on[k].hex, onVsBlock: R.contrast[theme].on[k].onVsBlock };
  }
}
const min = (theme, field) => Math.min(...tierKeys.map(k => R.contrast[theme].tiers[k][field]));
const big = d => d.bigText.map(b => ({ fs: b.fs, direct: b.direct, isStat: b.isStat, tag: b.tag }));

const out = {
  generatedAt: new Date().toISOString(),
  auditor: 'audit-verifier (independent)',
  method: 'Playwright Chromium headless (playwright-core bundled), LD_LIBRARY_PATH set; 127.0.0.1:8081; viewport 1440x900 (light/dark) + 390x844; dpr=1; all numbers re-measured here, not read from _data/*.json.',
  files: snapshot,
  overall: {
    verdict: 'FAIL',
    reason: '8 项硬清单中 7 项 PASS；工程纪律项 FAIL：family.html 30/32 内部链接解析到不存在的 dist/dist/…（HTTP 404）。视觉规格全部 PASS。',
    passCount: 7, failCount: 1, failItems: ['7-engineering-discipline: family.html 相对链接双 dist 前缀']
  },
  items: [
    { id: 1, title: '样式改动与规格对应', verdict: 'PASS', evidence: {
      tokens: { light: { '--fs-stat-sm': R.afterLight.tokens['--fs-stat-sm'], '--fs-stat': R.afterLight.tokens['--fs-stat'], '--fs-stat-lg': R.afterLight.tokens['--fs-stat-lg'] }, dark: { '--fs-stat-sm': R.afterDark.tokens['--fs-stat-sm'], '--fs-stat': R.afterDark.tokens['--fs-stat'], '--fs-stat-lg': R.afterDark.tokens['--fs-stat-lg'] } },
      statComputed: { count: R.afterLight.statEls.length, allTabularNums: R.afterLight.statEls.every(s => s.fvn === 'tabular-nums'), letterSpacing: [...new Set(R.afterLight.statEls.map(s => s.ls))], lineHeightEqualsFontSize: R.afterLight.statEls.every(s => s.lh === s.fs), fontWeight: [...new Set(R.afterLight.statEls.map(s => s.fw))], color: [...new Set(R.afterLight.statEls.map(s => s.color))] },
      statUnit: R.afterLight.statUnits[0],
      needCard: { count: R.afterLight.needCards.length, heights: [...new Set(R.afterLight.needCards.map(c => c.h))], countFs: [...new Set(R.afterLight.needCards.map(c => c.b && c.b.fs))], beforeHeights: [...new Set(R.beforeLight.needCards.map(c => c.h))], beforeCountFs: [...new Set(R.beforeLight.needCards.map(c => c.b && c.b.fs))] },
      tierhead: { heights: [...new Set(R.afterLight.tierheads.map(t => t.h))], square: R.afterLight.tierheads.map(t => t.n && `${t.n.rect.w}x${t.n.rect.h}/${t.n.fs}`), countFs: R.afterLight.tierheads.map(t => t.stat && t.stat.fs), countTexts: R.afterLight.tierheads.map(t => t.stat && t.stat.text), beforeSquare: R.beforeLight.tierheads.map(t => t.n && `${t.n.rect.w}x${t.n.rect.h}/${t.n.fs}`), beforeHeights: [...new Set(R.beforeLight.tierheads.map(t => t.h))] },
      tierLine: R.afterLight.tierheads.map(t => ({ tier: t.cls, h: t.line.h, bg: t.line.bg, opacity: t.line.opacity })),
      quoteBar: { widths: R.afterLight.barWidths, beforeWidths: R.beforeLight.barWidths, perTierBg: Object.values(R.afterLight.ofGroups).map(g => ({ cls: g.cls, barBg: g.barBg, barW: g.barW })) },
      quoteText: { txColors: R.afterLight.txColors, txBoldColors: R.afterLight.txBoldColors, darkTxBoldColors: R.afterDark.txBoldColors, beforeBoldColors: R.beforeLight.txBoldColors },
      tinkUsage: { t1ink: R.cssDiff.t1inkUsageAfter, t2ink: R.cssDiff.t2inkUsageAfter, textColorsLight: R.afterLight.textColorCount, textColorsDark: R.afterDark.textColorCount },
      decoration: R.cssDiff.deco,
      hueSequence: { light: tierKeys.map(k => `${k}:${R.contrast.light.tiers[k].hex} h${R.contrast.light.tiers[k].hsl.h} s${R.contrast.light.tiers[k].hsl.s}%/${R.contrast.light.tiers[k].hueClass}`), dark: tierKeys.map(k => `${k}:${R.contrast.dark.tiers[k].hex} h${R.contrast.dark.tiers[k].hsl.h} s${R.contrast.dark.tiers[k].hsl.s}%/${R.contrast.dark.tiers[k].hueClass}`) },
      stat42Usage: 'token 与 .stat-42 规则存在，本轮页面无 42px 实例（未滥用）'
    } },
    { id: 2, title: '对比度（渲染后 computed token 自算 WCAG）', verdict: 'PASS', evidence: {
      minAsText: { light: min('light', 'asTextVsBg'), dark: min('dark', 'asTextVsCard') },
      minAsBlockVsBg: { light: min('light', 'blockVsBg'), dark: min('dark', 'blockVsBg') },
      minOnVsBlock: { light: Math.min(...tierKeys.map(k => R.contrast.light.on[k].onVsBlock)), dark: Math.min(...tierKeys.map(k => R.contrast.dark.on[k].onVsBlock)) },
      table: contrastTable
    } },
    { id: 3, title: '1440×900 首屏（home-light / home-dark）', verdict: 'PASS', evidence: {
      fullyVisibleCards: { beforeLight: R.beforeLight.fullyVisibleCards, beforeDark: R.beforeDark.fullyVisibleCards, afterLight: R.afterLight.fullyVisibleCards, afterDark: R.afterDark.fullyVisibleCards },
      totalCards: { before: R.beforeLight.cardCount, after: R.afterLight.cardCount },
      gridTop: { beforeLight: R.beforeLight.gridTop, afterLight: R.afterLight.gridTop, beforeDark: R.beforeDark.gridTop, afterDark: R.afterDark.gridTop },
      horizontalOverflow: { beforeLight: R.beforeLight.horizontalOverflow, afterLight: R.afterLight.horizontalOverflow, afterDark: R.afterDark.horizontalOverflow },
      tierheadHeight: { light: [...new Set(R.afterLight.tierheads.map(t => t.h))], dark: [...new Set(R.afterDark.tierheads.map(t => t.h))] },
      needCardHeight: { light: [...new Set(R.afterLight.needCards.map(c => c.h))], dark: [...new Set(R.afterDark.needCards.map(c => c.h))] },
      tierSquare: { light: R.afterLight.tierheads.map(t => `${t.n.rect.w}x${t.n.rect.h}`), dark: R.afterDark.tierheads.map(t => `${t.n.rect.w}x${t.n.rect.h}`) },
      bigTextLight: big(R.afterLight), bigTextDark: big(R.afterDark),
      bigTextAllStatDigits: R.afterLight.bigText.every(b => b.isStat && /^\d+$/.test(b.direct)) && R.afterDark.bigText.every(b => b.isStat && /^\d+$/.test(b.direct))
    } },
    { id: 4, title: '390×844（home-390）', verdict: 'PASS', evidence: {
      horizontalOverflow: R.after390.horizontalOverflow,
      needCardHeight: [...new Set(R.after390.needCards.map(c => c.h))],
      needCountFs: [...new Set(R.after390.needCards.map(c => c.b && c.b.fs))],
      needCountInsideCard: R.after390.needCards.every(c => c.b.rect.top >= c.rect.top && c.b.rect.bottom <= c.rect.bottom && c.b.rect.left >= c.rect.left && c.b.rect.right <= c.rect.right),
      needCopyOverflowX: R.after390.needCards.map(c => c.copyOverflowX),
      tierheads: R.after390.tierheads.map(t => ({ cls: t.cls, h: t.h, hintDisplay: t.hint && t.hint.display, square: `${t.n.rect.w}x${t.n.rect.h}`, stat: t.stat && t.stat.fs, line: t.line && { h: t.line.h, bg: t.line.bg, opacity: t.line.opacity } })),
      controlPoint: { chooser: '.jump a（档位图例 chip：构造成「不折行/不被裁」的控点）', chips: R.after390.jumpLinks.map(j => ({ text: j.text, w: j.rect.w, h: j.rect.h, padding: j.padding, gap: j.gap, scrollW: j.scrollW, clientW: j.clientW, singleLineTextH: j.textRect && j.textRect.h, square: `${j.jn.rect.w}x${j.jn.rect.h}` })), note: '4 枚 chip 78.02×28，scrollWidth=clientWidth=76，label 单行；22×22 图例方块在 chip 内' },
      facetScroller: { preexisting: true, note: '.facetsin overflowX:auto，scrollW 1418 / client 390，改前改后同值；是站点既有横向筛选滚区，document 无横向溢出' },
      bigText: big(R.after390)
    } },
    { id: 5, title: '25% 缩略图 shots/home-25pct.png（360×225）', verdict: 'PASS', evidence: {
      dimensions: R.thumb.natural,
      pixelCounts: R.thumb.counts,
      measurableTierColors: R.thumb.measurableTierColors,
      clusters: S.thumbClusters,
      rescaledFromAfter1440: R.thumb.rescaledFromAfter,
      beforeRescaled: R.thumb.beforeRescaled,
      visual: 'read_image 目检：可见 need 卡 30px 级数字（13/7/1/30/66/45/44/7/12/67），4× 放大图 thumb-zoom-need.png 可确认字形'
    } },
    { id: 6, title: 'family.html', verdict: 'PASS', evidence: {
      h1Stats: R.family.statEls.map(s => ({ fs: s.fs, direct: s.direct, cls: s.cls })),
      stopstatsRect: R.family.head.stopstats,
      h1: R.family.head.h1,
      distPlansApiMeta: R.beforeFamily.meta,
      valuesMatchSource: true,
      horizontalOverflow: R.family.horizontalOverflow,
      styleInBody: R.family.head.bodyStyleTags, bodyHasCssText: R.family.head.bodyHasCssText,
      styleTags: R.family.head.styleTags,
      sameSiteBasis: {
        headerEqualBytewise: S.sameSite.headerEqual,
        footerEqualBytewise: S.sameSite.footerEqual,
        sharedStyleEqual: S.sameSite.sharedStyleEqual,
        sharedStyleLen: S.sameSite.homeStyleLen,
        tokensEqual: S.sameSite.tokensEqual,
        fontEqual: S.sameSite.fontEqual,
        logosEqual: S.sameSite.logosEqual,
        themeMetaEqual: S.sameSite.themeMetaEqual,
        footerText: 'home 与 family 的 footer 5 段文案一致（仅「最后更新」占位不同：-- vs 见首页）',
        headerNote: 'family 为 /plans/api 子页变体：同一 .top/.topin/.brand/.mark/.btxt 品牌块与字体；把首页的搜索/主题/套餐导航换成「返回全部优惠」+ GitHub —— 同站子页，非换站'
      }
    } },
    { id: 7, title: '工程纪律', verdict: 'FAIL', evidence: {
      headScripts: Object.fromEntries(Object.entries(R.htmlScan).map(([k, v]) => [k, { headScriptCount: v.headScriptCount, bodyScriptCount: v.bodyScriptCount, jsonLd: v.jsonLd, themeScript: v.themeScript, styleInBody: v.styleInBody, analytics: v.analytics }])),
      themeScriptByteIdenticalToDist: D4.themeScript,
      git: R.git,
      indexHtmlUnmodified: R.git.indexHtmlUnmodified,
      distIgnoredByGit: R.git.distIgnored,
      distMtimeBeforeSession: S.mtimes['dist/index.html'].mtime,
      homeLinks: Object.fromEntries(['home-light.html','home-dark.html','home-390.html'].map(f => [f, { total: L[f].total, bad: L[f].bad, prefixes: L[f].prefixes }])),
      familyLinks: { total: L['family.html'].total, bad: L['family.html'].bad, prefixes: L['family.html'].prefixes, badSamples: L['family.html'].badSamples.slice(0, 6), http404Confirmed: ['mockups/v5-sig/../../dist/dist/ 404', 'mockups/v5-sig/../../dist/dist/student/ 404'], correctTarget: 'mockups/v5-sig/../../dist/student/ 200' },
      rootCause: "build-sig.js buildFamily(): const urls = h => rewriteUrls(h, 'dist/plans/api/') —— dist/plans/api 页面的 ../../ 相对链接先按含 dist/ 的前缀解析，再被 rewriteUrls 加一次 ../../dist/，得到 ../../dist/dist/…；应传 'plans/api/'。",
      compareHtml: { headScripts: R.htmlScan['compare.html'].headScriptCount, note: '评审页，无脚本/无样式泄漏；shots/ 相对路径为其自有截图资产（非站点 mockup）' }
    } },
    { id: 8, title: 'compare.html', verdict: 'PASS', evidence: {
      scrollHeight: R.compare.scrollHeight, innerHeight: R.compare.innerHeight, bodyScrollHeight: R.compare.bodyScrollHeight, footerBottom: R.compare.footerRect.bottom,
      images: R.compare.imgs.map(i => ({ src: i.src, transform: i.transform, natural: `${i.nw}x${i.nh}`, parent: i.parent })),
      samePngBothScales: R.compare.figs.map(f => ({ figure: f.cls, cropSrc: f.crops, thumbSrc: f.thumbs, same: f.crops[0] === f.thumbs[0] })),
      displayedNumbers: { tableRows: R.compare.tableRows, chips: R.compare.chips, swatches: R.compare.sws, notes: R.compare.figNotes },
      retestConsistency: '全部表格/胶囊/色卡数字与复测一致（6→6、352→352、26/16→26/22、68/68、11→30、11.5→22、3→6、0→0、5.05/7.59、5.41/7.01）',
      shot: { file: 'shots/home-before-after.png', dims: S.shots.homeBeforeAfter, docScrollHeight: R.compare.scrollHeight },
      textInconsistencies: ['文案「窗口 680×400」与实际 .crop 680×342 不符（ruler y=96–438 本身也是 342 高）']
    } }
  ],
  extraFindings: [
    { severity: 'high', item: 'family.html 导航链接全部失效（30/32）', detail: '后 30 个 href 为 ../../dist/dist/…，HTTP 404；head 的 logos.css/favicon 正常。修复：build-sig.js buildFamily 的 rewriteUrls 第二参数改为 plans/api/ 后重新生成 family.html。' },
    { severity: 'low', item: 'compare.html 文案与实际几何不符', detail: '「窗口 680×400 只做裁切」×2，实际 .crop 为 680×342（y=96–438）。' },
    { severity: 'info', item: '390 全页高度 16849→16813（−36px，不是加高）', detail: 'footer 已与改前等高（271.77px）；全部 −36px 来自 t2/t3 分带：改前 <b> 标题被长 hint 挤成 2 行（带高 44px），改后 26px。属修复既有窄屏缺陷，未向“加高度”方向走。' },
    { severity: 'info', item: '25% 缩略图档位色可测但余量小', detail: '±20/通道容差下 t2/t3/t4 仅 11/12/13 px（各自 1 个 4×5 连通块 = 图例方块），t1 164px；「≥3 块不同档位色」成立但仰赖图例方块，建议 NOTES 注明证据强度。' },
    { severity: 'info', item: '42px 档位 token 已定义但本轮无实例', detail: '.stat-42 规则与 --fs-stat-lg 存在；三个 mockup 页面均未使用 42px（符合“只给事实数字”的克制，未滥用）。' }
  ],
  artifacts: {
    scripts: ['_audit/audit.js', '_audit/supplement.js', '_audit/diag2.js', '_audit/diag3.js', '_audit/diag4.js', '_audit/linkcheck.js', '_audit/pixdiff.js', '_audit/probe1.js', '_audit/probe2.js', '_audit/make-audit-json.js'],
    data: ['_audit/measured.json', '_audit/supplement.json', '_audit/linkcheck.json', '_audit/diag2.json', '_audit/diag4.json', '_audit/probe2.out.json', '_audit/audit-console.json', '_audit/snapshot-start.sha256'],
    screenshots: ['_audit/verify-home-light-1440.png', '_audit/verify-home-dark-1440.png', '_audit/verify-home-390.png', '_audit/verify-family-1440.png', '_audit/verify-compare-1440.png', '_audit/verify-before-light-1440.png', '_audit/thumb-zoom-need.png', '_audit/thumb-zoom-legend.png']
  }
};
fs.writeFileSync(path.join(AUD, 'audit.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ verdict: out.overall.verdict, items: out.items.map(i => i.id + ':' + i.verdict), extra: out.extraFindings.map(e => e.severity + ' ' + e.item) }, null, 1));
