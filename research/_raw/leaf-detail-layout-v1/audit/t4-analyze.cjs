#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */
/**
 * t4-analyze.cjs —— T4 的自算部分：把探针产出的 JSON 变成**可核对的判据表**（只读 JSON，不碰浏览器）。
 *
 * 输入（全部由 leaf-probe.cjs 用同一把尺子产出）：
 *   before.json / before-recheck.json      改动前快照（同一尺子两次跑的等价性证明）
 *   after-deal.json / after-models.json    改动后：契约点名的那两条路由
 *   after-axis.json                        改动后：叶子页同轴块（--extra-selectors=）
 *   after-compare.json                     改动后：与 before 同路由 + 768 + 非叶子页
 *   mutations-real/M1..M5.json             改动后：真实 dist 上的变异牙
 *   t4-static-checks.json                  静态部分（规则唯一性 / 波及面）
 *
 * 输出：t4-analysis.json + stdout 判据表
 */

const fs = require('fs');
const path = require('path');

const A = __dirname;
const load = (f) => JSON.parse(fs.readFileSync(path.join(A, f), 'utf8'));
const has = (f) => fs.existsSync(path.join(A, f));

const before = load('before.json');
const recheck = load('before-recheck.json');
const afterDeal = load('after-deal.json');
const afterModels = load('after-models.json');
const afterAxis = load('after-axis.json');
const afterCompare = load('after-compare.json');
const staticChecks = load('t4-static-checks.json');
const muts = {};
for (const m of ['M1', 'M2', 'M3', 'M4', 'M5']) if (has(`mutations-real/${m}.json`)) muts[m] = load(`mutations-real/${m}.json`);

const rt = (j, route) => j.routes.find(r => r.route === route) || j.routes.find(r => r.kind === route);
const el = (r, vp, sel) => (r.viewports[String(vp)] || {}).elements ? (r.viewports[String(vp)].elements[sel] || null) : null;
const scrollW = (r, vp) => r.viewports[String(vp)].documentElementScrollWidth;
const clientW = (r, vp) => r.viewports[String(vp)].clientWidth;

const checks = [];
const add = (id, ok, detail) => { checks.push({ id, status: ok ? 'passed' : 'failed', detail }); return ok; };
const num = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));

// ── 0) 同一把尺子：before.json 与用当前探针重跑的 before-recheck.json 逐值相等 ──
{
  const norm = (j) => {
    const o = {};
    for (const r of j.routes) {
      for (const [vk, V] of Object.entries(r.viewports)) {
        for (const [sk, e] of Object.entries(V.elements)) {
          o[`${r.route}|${vk}|${sk}|w`] = e.found ? e.offsetWidth : null;
          o[`${r.route}|${vk}|${sk}|wb`] = e.found ? e.computed.wordBreak : null;
          o[`${r.route}|${vk}|${sk}|mw`] = e.found ? e.computed.maxWidth : null;
          o[`${r.route}|${vk}|${sk}|cd`] = e.found ? e.centerDelta : null;
        }
        o[`${r.route}|${vk}|scrollW`] = V.documentElementScrollWidth;
      }
    }
    return o;
  };
  const x = norm(before); const y = norm(recheck);
  const diffs = Object.keys(x).filter(k => x[k] !== y[k]).map(k => `${k}: ${x[k]}→${y[k]}`);
  add('ruler-identical', diffs.length === 0, `before.json vs before-recheck.json 比较 ${Object.keys(x).length} 个数值，差异 ${diffs.length} 个${diffs.length ? '：' + diffs.slice(0, 5).join('; ') : ''}`);
}

// ── 1) desktop bounding box：deal 与 model 详情 @1600/1440/1280 ──
{
  const targets = [
    { label: 'deal/8e7b0fd03e73', r: afterDeal.routes[0] },
    { label: 'models/360zhinao-pro', r: afterModels.routes[0] }
  ];
  for (const { label, r } of targets) {
    for (const vp of [1600, 1440, 1280]) {
      const m = el(r, vp, 'main');
      const w = m ? m.offsetWidth : null;
      const cd = m ? m.centerDelta : null;
      const ok = w !== null && w >= 1080 && w <= 1120 && cd !== null && cd <= 8;
      add(`bbox-${label}@${vp}`, ok, `main offsetWidth=${num(w)}（要求 ∈[1080,1120]）· centerΔ=${num(cd)}（要求 ≤8）· rect ${m ? `${num(m.rect.left)}..${num(m.rect.right)}` : 'n/a'}`);
    }
  }
}

// ── 2) 同轴：deal 的 crumb/dpane/dpane-more/dpane-src 与 model 的 crumb/stop/minfo/ptable-wrap 左右极差 ≤1px ──
{
  const sets = {
    deal: ['.crumb', '.dpane', '.dpane-more', '.dpane-src'],
    models: ['.crumb', '.stop', '.minfo', '.ptable-wrap']
  };
  for (const r of afterAxis.routes) {
    const sels = sets[r.kind] || [];
    for (const vp of [1600, 1440, 1280]) {
      const rows = sels.map(s => ({ s, e: el(r, vp, s) })).filter(x => x.e && x.e.found);
      if (rows.length !== sels.length) {
        add(`axis-${r.kind}@${vp}`, false, `缺元素：${sels.filter(s => !(el(r, vp, s) || {}).found).join(', ')}`);
        continue;
      }
      const lefts = rows.map(x => x.e.rect.left); const rights = rows.map(x => x.e.rect.right);
      const ls = Math.max(...lefts) - Math.min(...lefts); const rs = Math.max(...rights) - Math.min(...rights);
      add(`axis-${r.kind}@${vp}`, ls <= 1 && rs <= 1,
        `${sels.join('/')} 左 ${lefts.map(num).join(',')} 极差 ${num(ls)}px · 右 ${rights.map(num).join(',')} 极差 ${num(rs)}px（要求 ≤1px）`);
    }
  }
  // 来源块宽 == 列宽（deal）
  for (const vp of [1600, 1440, 1280]) {
    const r = afterAxis.routes.find(x => x.kind === 'deal');
    const src = el(r, vp, '.dpane-src'); const main = el(r, vp, 'main');
    const d = src && main ? Math.abs(src.offsetWidth - main.offsetWidth) : null;
    add(`src-eq-column-deal@${vp}`, d !== null && d <= 1, `.dpane-src=${num(src && src.offsetWidth)} vs 列宽=${num(main && main.offsetWidth)} 差 ${num(d)}px（要求 ≤1px）`);
  }
}

// ── 3) mobile / 窄屏溢出 ──
{
  for (const { label, r } of [{ label: 'deal/8e7b0fd03e73', r: afterDeal.routes[0] }, { label: 'models/360zhinao-pro', r: afterModels.routes[0] }]) {
    const sw = scrollW(r, 390); const cw = clientW(r, 390);
    add(`mobile-390-${label}`, sw <= 391, `documentElement.scrollWidth=${sw}（要求 ≤391）· clientWidth=${cw} · 溢出 ${sw - cw}px`);
  }
  for (const route of ['/deal/2eae0e246de2/', '/models/claude-opus-5.5/']) {
    const r = rt(afterCompare, route);
    const sw = scrollW(r, 768);
    add(`narrow-768-${route}`, sw <= 768, `documentElement.scrollWidth=${sw}（要求 ≤768）· main=${num((el(r, 768, 'main') || {}).offsetWidth)}（铺满可用宽）`);
  }
  // 长 URL 页自身与页面级都不溢出（129 字符官方页 URL）
  const r = afterDeal.routes[0];
  for (const vp of [390, 1440]) {
    const sw = scrollW(r, vp);
    add(`long-url-${vp}`, sw <= (vp === 390 ? 391 : 1440), `deal/8e7b0fd03e73 @${vp} documentElement.scrollWidth=${sw}（≤${vp === 390 ? 391 : vp}）`);
  }
}

// ── 4) 改动前/后同路由对账（同一把尺子） ──
const pairs = [
  { route: '/deal/2eae0e246de2/', beforeRec: rt(before, '/deal/2eae0e246de2/'), afterRec: rt(afterCompare, '/deal/2eae0e246de2/') },
  { route: '/models/claude-opus-5.5/', beforeRec: rt(before, '/models/claude-opus-5.5/'), afterRec: rt(afterCompare, '/models/claude-opus-5.5/') },
  { route: '/', beforeRec: rt(before, '/'), afterRec: rt(afterCompare, '/') }
];
const comparison = [];
for (const p of pairs) {
  for (const vp of [1600, 1440, 1280, 390]) {
    const row = { route: p.route, viewport: vp, before: {}, after: {} };
    for (const sel of ['.wrap', 'main', '.dpane', '.dpane-more', '.dpane-src', '.topin', 'footer']) {
      const b = el(p.beforeRec, vp, sel); const a = el(p.afterRec, vp, sel);
      row.before[sel] = b && b.found ? { w: b.offsetWidth, cd: b.centerDelta, wb: b.computed.wordBreak, mw: b.computed.maxWidth } : null;
      row.after[sel] = a && a.found ? { w: a.offsetWidth, cd: a.centerDelta, wb: a.computed.wordBreak, mw: a.computed.maxWidth } : null;
    }
    row.before.scrollWidth = scrollW(p.beforeRec, vp);
    row.after.scrollWidth = scrollW(p.afterRec, vp);
    comparison.push(row);
  }
}
// 首页 main 不得被 .detail-main 波及
{
  const homeAfter = rt(afterCompare, '/').viewports['1440'].elements['main'];
  const homeBefore = rt(before, '/').viewports['1440'].elements['main'];
  add('home-main-untouched', homeAfter.offsetWidth === homeBefore.offsetWidth && homeAfter.offsetWidth === 1380,
    `首页 main @1440：改动前 ${homeBefore.offsetWidth} → 改动后 ${homeAfter.offsetWidth}（要求不变且 =1380）`);
}
// deal 与 model 同列（改动后）
{
  const d = rt(afterCompare, '/deal/2eae0e246de2/'); const m = rt(afterCompare, '/models/claude-opus-5.5/');
  for (const vp of [1600, 1440, 1280]) {
    const dw = el(d, vp, 'main').offsetWidth; const mw = el(m, vp, 'main').offsetWidth;
    const dl = el(d, vp, 'main').rect.left; const ml = el(m, vp, 'main').rect.left;
    add(`leaf-pair-same-column@${vp}`, dw === mw, `deal main=${dw} · model main=${mw} · 列左 ${num(dl)} vs ${num(ml)}（要求同宽）`);
  }
}
// 非叶子页未被波及
{
  const rows = [];
  for (const route of ['/', '/models/', '/archive/', '/category/api/', '/vendor/anthropic/']) {
    const r = rt(afterCompare, route);
    const main1440 = el(r, 1440, 'main').offsetWidth;
    const topin1440 = el(r, 1440, '.topin').offsetWidth;
    const cls = (el(r, 1440, 'main') || {}).classes;
    rows.push({ route, kind: r.kind, main1600: el(r, 1600, 'main').offsetWidth, main1440, main1280: el(r, 1280, 'main').offsetWidth, main768: el(r, 768, 'main').offsetWidth, topin1600: el(r, 1600, '.topin').offsetWidth, topin1440, topin1280: el(r, 1280, '.topin').offsetWidth, mainClass: cls, scrollW390: scrollW(r, 390) });
  }
  const badCls = rows.filter(r => /detail-main/.test(r.mainClass || ''));
  add('nonleaf-not-widened', rows.every(r => r.main1440 === 1380 && r.main1600 === 1380 && r.main1280 === 1240) && badCls.length === 0,
    rows.map(r => `${r.route} main ${r.main1600}/${r.main1440}/${r.main1280}/${r.main768} class="${r.mainClass}"`).join(' · '));
}

// ── 5) 变异牙（真实 dist）：每颗牙必须把对应指标推向违规侧 ──
{
  const base = afterAxis;
  const bEl = (kind, vp, sel) => el(rt(base, kind === 'deal' ? 'deal' : 'models'), vp, sel);
  const mEl = (j, kind, vp, sel) => el(rt(j, kind), vp, sel);
  const effects = [];
  if (muts.M1) {
    const d = mEl(muts.M1, 'deal', 1440, 'main').centerDelta; const dm = mEl(muts.M1, 'models', 1440, 'main').centerDelta;
    effects.push({ id: 'M1', expect: 'center', base: '0', after: `${num(d)} / ${num(dm)}`, ok: d > 8 && dm > 8 });
  }
  if (muts.M2) {
    const w = mEl(muts.M2, 'deal', 1440, 'main').offsetWidth;
    effects.push({ id: 'M2', expect: 'width', base: '1120', after: num(w), ok: w < 1080 });
  }
  if (muts.M3) {
    const src = mEl(muts.M3, 'deal', 1440, '.dpane-src'); const main = mEl(muts.M3, 'deal', 1440, 'main');
    effects.push({ id: 'M3', expect: 'src-width', base: `1120 / ${num(bEl('deal', 1440, '.dpane-src').offsetWidth)}`, after: `${num(src.offsetWidth)} / 列 ${num(main.offsetWidth)} 差 ${num(main.offsetWidth - src.offsetWidth)}`, ok: main.offsetWidth - src.offsetWidth > 1 });
  }
  if (muts.M4) {
    const sw = scrollW(rt(muts.M4, 'deal'), 390);
    effects.push({ id: 'M4', expect: 'page-overflow@390', base: '390', after: num(sw), ok: sw > 391 });
  }
  if (muts.M5) {
    const dw = mEl(muts.M5, 'deal', 1440, 'main').offsetWidth; const mw = mEl(muts.M5, 'models', 1440, 'main').offsetWidth;
    effects.push({ id: 'M5', expect: 'leaf-consistency', base: '1120 / 1120', after: `${num(dw)} / ${num(mw)}`, ok: mw !== dw });
  }
  add('mutations-bite', effects.length === 5 && effects.every(e => e.ok), effects.map(e => `${e.id}(${e.expect}) 基准 ${e.base} → 变异 ${e.after}`).join(' · '));
  var mutationEffects = effects;
  var mutationAnchors = Object.fromEntries(Object.entries(muts).map(([k, j]) => [k, j.mutations.map(m => ({ id: m.id, ok: m.ok, pages: m.pages.map(p => ({ route: p.route, applied: p.applied, hits: (p.steps || []).map(s => s.hits).join(',') })) }))]));
}

// ── 6) 静态：规则唯一性 / 波及面 ──
{
  const sc = staticChecks;
  const rulesOk = Object.values(sc.byKind).every(v => v.detailMainRuleSet.length === 1 && v.detailMainRuleSet[0] === 1 && v.maxWidth820Total === 0 && v.dpaneRuleMin === 1 && v.dpaneRuleMax === 1);
  add('static-single-rule', rulesOk && sc.pagesViolating.length === 0, `${sc.pageCount} 页全部：.detail-main 规则=1、.dpane 规则=1、max-width:820px=0；违规页 ${sc.pagesViolating.length}`);
  const leafPages = (sc.byKind['deal-leaf'] || {}).detailMainClassTotal + (sc.byKind['models-leaf'] || {}).detailMainClassTotal;
  const nonLeaf = Object.entries(sc.byKind).filter(([k]) => k !== 'deal-leaf' && k !== 'models-leaf').reduce((s, [, v]) => s + v.detailMainClassTotal, 0);
  add('static-class-scope', leafPages === 131 && nonLeaf === 0, `叶子页带 class="detail-main" 合计 ${leafPages}（80 deal + 51 model），非叶子页合计 ${nonLeaf}`);
  add('static-no-second-css', sc.suspiciousCssFiles.length === 0 && sc.cssRuleSourcesInRepo.length === 0,
    `detail*.css：${sc.suspiciousCssFiles.length ? sc.suspiciousCssFiles.join(',') : '无'} · 仓库 CSS 里含 .detail-main 的文件：${sc.cssRuleSourcesInRepo.length} · dist 内 CSS：${sc.cssFilesInDist.join(',')}`);
  add('static-source-rule', sc.sourceIndex.detailMainRule === 1 && sc.sourceIndex.dpaneRule === 1 && sc.sourceIndex.dpaneSrcRule === 1 && sc.sourceIndex.maxWidth820 === 0,
    `源码 index.html：.detail-main=${sc.sourceIndex.detailMainRule} .dpane=${sc.sourceIndex.dpaneRule} .dpane-src=${sc.sourceIndex.dpaneSrcRule} max-width:820px=${sc.sourceIndex.maxWidth820} break-all=${sc.sourceIndex.breakAll}（属于 .cmpshare，与详情页无关）`);
}

const failed = checks.filter(c => c.status === 'failed');
const out = {
  generatedAt: new Date().toISOString(),
  probeInputs: ['before.json', 'before-recheck.json', 'after-deal.json', 'after-models.json', 'after-axis.json', 'after-compare.json', 'mutations-real/M1..M5.json', 't4-static-checks.json'],
  checks, comparison, mutationEffects: (typeof mutationEffects !== 'undefined' ? mutationEffects : []),
  mutationAnchors: (typeof mutationAnchors !== 'undefined' ? mutationAnchors : {}),
  summary: { total: checks.length, passed: checks.length - failed.length, failed: failed.length }
};
fs.writeFileSync(path.join(A, 't4-analysis.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log('=== T4 自算判据表 ===');
for (const c of checks) console.log(`  ${c.status === 'passed' ? '✓' : '✗'} ${c.id.padEnd(30)} ${c.detail}`);
console.log(`\n合计 ${out.summary.passed}/${out.summary.total} 通过${failed.length ? `，未过：${failed.map(c => c.id).join(', ')}` : ''}`);
console.log(`→ JSON：${path.join(A, 't4-analysis.json')}`);
process.exit(failed.length ? 1 : 0);
