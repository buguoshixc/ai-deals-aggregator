'use strict';
/**
 * mockups/v5-sig 生成器 —— 「识别层」静态示意图。
 *
 * 口径（沿用 mockups/v4 的结论）：
 *   1. 只读 dist/ 产物。共享 <style>、页头、页脚、卡片原始 HTML 一律复用，不重画；
 *   2. **显式重建 head**：只留主题预涂脚本 + 一份改过的 <style>（不搬 JSON-LD / 分析脚本 /
 *      主应用脚本）。主应用脚本必须删，否则它会重渲染网格、冲掉静态集合；
 *   3. 全部改动 = CSS_PATCHES 里的显式字符串替换 + 三处标记（need 计数 / 分带条数 / 跳到档位）
 *      的包装，每一条都断言命中次数；生成报告写 _data/build-report.json。
 *
 * 运行：node mockups/v5-sig/_tools/build-sig.js
 * 预览：node scripts/serve.js --port 8081
 *       http://127.0.0.1:8081/mockups/v5-sig/home-light.html
 *
 * 本文件不写 mockups/v5-sig 之外的任何路径；dist/ 与 index.html 只读。
 */
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.resolve(__dirname, '..');
const DATA = path.join(OUT, '_data');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const report = { generatedAt: new Date().toISOString(), patches: [], markup: [], outputs: [], notes: [] };
let CURRENT_PAGE = '';

/* ------------------------------------------------------------------ *
 * 1. 设计 token 与样式改动（每条 = 一条规格）
 * ------------------------------------------------------------------ */

// 新档位色：绿 → 蓝 → 青 → 琥珀 → 灰
const LIGHT = { t1: '#0b7a44', t2: '#1d4ed8', t3: '#155e75', t4: '#92400e', t5: '#475569' };
const DARK = { t1: '#4ade80', t2: '#60a5fa', t3: '#22d3ee', t4: '#fbbf24', t5: '#94a3b8' };

const CSS_PATCHES = [
  {
    id: 'tokens/stat',
    spec: '规格 1 字号断崖',
    find: '      --fs-xl: 19px;\n',
    replace: '      --fs-xl: 19px;\n'
      + '      /* v5 识别层：事实数字的三级断崖。只有「事实数字」能用这一档 —— 标签 / 标题 / 说明一律不许。 */\n'
      + '      --fs-stat-sm: 22px;\n'
      + '      --fs-stat: 30px;\n'
      + '      --fs-stat-lg: 42px;\n'
  },
  {
    id: 'palette/light',
    spec: '规格 5 档位色重排（浅色）',
    find: `      --t1: #0e9f6e;
      --t2: #7c3aed;
      --t3: #2563eb;
      --t4: #c2410c;
      --t5: #94a3b8;
`,
    replace: `      /* v5：原 t2 紫 #7c3aed / t3 蓝 #2563eb / --brand 蓝 #3b5bfd 三色挤在同一段蓝紫，
         放大成 22px 方块会变彩虹。改成一串可辨识的档位序列：绿 → 蓝 → 青 → 琥珀 → 灰。
         每个色都实测过（见 _data/contrast.json 与 NOTES.md）：作文字 / 色块 vs 底色 ≥ 5.05:1。 */
      --t1: ${LIGHT.t1};
      --t2: ${LIGHT.t2};
      --t3: ${LIGHT.t3};
      --t4: ${LIGHT.t4};
      --t5: ${LIGHT.t5};
`
  },
  {
    id: 'palette/light-ink',
    spec: '规格 4 引文让位（取消彩色文字）',
    find: `      --t1-ink: #0b7a44;
      --t2-ink: #6d28d9;
`,
    replace: `      /* v5：引文文字统一回 --ink，--t*-ink 不再承载彩色文字；保留 token 且值 = 新档位色，
         以免将来误用时对比度掉到 4.5:1 以下。 */
      --t1-ink: ${LIGHT.t1};
      --t2-ink: ${LIGHT.t2};
`
  },
  {
    id: 'palette/light-on',
    spec: '规格 5 色块上的数字（浅色）',
    find: `      --on-t1: #05291c;
      --on-t2: #fff;
      --on-t3: #fff;
      --on-t4: #fff;
      --on-t5: #1f2937;
`,
    replace: `      /* v5：新档位色都足够深，统一白字；每个组合的实测对比度 ≥ 5.41:1（11px 数字也过 AA）。 */
      --on-t1: #fff;
      --on-t2: #fff;
      --on-t3: #fff;
      --on-t4: #fff;
      --on-t5: #fff;
`
  },
  {
    id: 'palette/dark',
    spec: '规格 5 档位色重排（深色）',
    find: `      --t1: #3ddc97;
      --t2: #b18cff;
      --t3: #7aa2ff;
      --t4: #ffab6b;
      --t5: #8d97a5;
      --t1-ink: #3ddc97;   /* 暗色下档位色本身够亮，直接当文字用 */
      --t2-ink: #b18cff;
`,
    replace: `      /* v5：同一串档位序列的深色版（色相不变、亮度抬高）；实测 vs --bg / --card ≥ 7.01:1。 */
      --t1: ${DARK.t1};
      --t2: ${DARK.t2};
      --t3: ${DARK.t3};
      --t4: ${DARK.t4};
      --t5: ${DARK.t5};
      --t1-ink: ${DARK.t1};
      --t2-ink: ${DARK.t2};
`
  },
  {
    id: 'palette/prefers-dark',
    spec: '规格 5 档位色重排（跟随系统深色）',
    find: `        --t1: #3ddc97; --t2: #b18cff; --t3: #7aa2ff; --t4: #ffab6b; --t5: #8d97a5;
        --t1-ink: #3ddc97; --t2-ink: #b18cff;
`,
    replace: `        --t1: ${DARK.t1}; --t2: ${DARK.t2}; --t3: ${DARK.t3}; --t4: ${DARK.t4}; --t5: ${DARK.t5};
        --t1-ink: ${DARK.t1}; --t2-ink: ${DARK.t2};
`
  },
  {
    id: 'need/baseline',
    spec: '规格 2 首页 need 卡计数 11px → 30px',
    find: `    .need-card .need-copy {
      display: flex; flex-wrap: wrap; align-items: center; gap: 1px var(--s2);
      flex: 1 1 auto; min-width: 0;
    }
`,
    replace: `    .need-card .need-copy {
      /* v5：30px 数字与 12px 标题按基线对齐（同一行里两种字号）；卡高仍是 68px，靠卡内纵向余量。 */
      display: flex; flex-wrap: wrap; align-items: baseline; gap: 1px var(--s2);
      flex: 1 1 auto; min-width: 0;
    }
`
  },
  {
    id: 'need/count',
    spec: '规格 2 首页 need 卡计数 11px → 30px',
    find: '    .need-card .need-copy b { font-size: var(--fs-xs); font-weight: 600; color: var(--mut); }\n',
    replace: '    .need-card .need-copy b { font-size: var(--fs-stat); font-weight: 700; color: var(--ink); }\n'
  },
  {
    id: 'quote/bar',
    spec: '规格 3 卡片引文竖条 3px → 6px',
    find: '    .of .bar { flex: none; width: 3px; border-radius: var(--r-pill); background: var(--t5); margin-top: 1px; }\n',
    replace: '    .of .bar { flex: none; width: 6px; border-radius: var(--r-pill); background: var(--t5); margin-top: 1px; }\n'
  },
  {
    id: 'quote/t4-bar',
    spec: '规格 5 档位色统一（删掉 t4 用 --warn 的第二套色）',
    find: '    .of.t4 .bar { background: var(--warn); }\n',
    replace: ''
  },
  {
    id: 'quote/ink',
    spec: '规格 4 引文让位：颜色只留在 6px 竖条上，引文文字回 --ink',
    find: '    .of .tx b { color: var(--deal); font-weight: 700; }\n    .of.t1 .tx b { color: var(--t1-ink); }\n    .of.t2 .tx b { color: var(--t2-ink); }\n',
    replace: `    /* v5 引文让位：三批视觉复核都说「引文比标题抢眼」。颜色只留在左侧 6px 竖条上，
       引文（含加粗的「事实短语」）一律回正文色 --ink。 */
    .of .tx b { color: var(--ink); font-weight: 700; }
`
  },
  {
    id: 'tier/square',
    spec: '规格 3 分带方块 16 → 22px（数字 9.5 → 11px）',
    find: '    .tierhead .n { width: 16px; height: 16px; border-radius: var(--r-sm); display: grid; place-items: center; font-size: 9.5px; font-weight: 700; font-family: ui-monospace, monospace; flex: none; }\n',
    replace: '    .tierhead .n { width: 22px; height: 22px; border-radius: var(--r-sm); display: grid; place-items: center; font-size: 11px; font-weight: 700; font-family: ui-monospace, monospace; flex: none; }\n'
  },
  {
    id: 'tier/band-height',
    spec: '自查 4（规格 3）：22px 方块塞进 26px 带',
    find: '      background: linear-gradient(var(--bg) 72%, transparent); padding: var(--s1) 0;\n    }\n',
    replace: '      /* v5：22px 方块 + calc(--s1/2)*2 = 26px —— 与旧带宽逐像素相同，首屏卡数不动。 */\n'
      + '      background: linear-gradient(var(--bg) 72%, transparent); padding: calc(var(--s1) / 2) 0;\n    }\n'
  },
  {
    id: 'tier/hint',
    spec: '规格 2/3 分带条数 22px（不挤掉方块与标题）',
    find: '    .tierhead .hint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n',
    replace: '    /* v5：条数是「事实数字」，从 .hint 里拆出来单独排版（.hint 只剩说明，继续可截断）。 */\n'
      + '    .tierhead .hint { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n'
  },
  {
    id: 'jump/pill',
    spec: '自查 1（首屏要能看见 ≥3 块档位色）：跳到档位升级为档位图例',
    find: `    .jump a {
      color: var(--ink2); text-decoration: none; border: 1px solid var(--line);
      border-radius: var(--r-pill); padding: var(--s1) 12px;
`,
    replace: `    /* v5：首屏原本只有一个档位色（t1 分带 + t1 引文条），25% 缩略图里「≥3 块档位色」不可能成立。
       把已有的「跳到档位」四枚 chip 升级成档位图例：22px 方块与 .tierhead .n 同一尺度，
       没有新增色值、没有新增高度行（chip 高度只跟着方块走）。 */
    .jump a {
      display: inline-flex; align-items: center; gap: 6px;
      /* v5：纵向内边距减半 ⇒ 22px 方块 + 2px*2 = 26px，与旧 chip 28px 的带高不变（整行仍是 28px）。 */
      color: var(--ink2); text-decoration: none; border: 1px solid var(--line);
      border-radius: var(--r-pill); padding: calc(var(--s1) / 2) 12px;
`
  }
];

/** 追加在共享 <style> 结尾的 v5 新规则（不是替换 —— 没有既有规则可改） */
const V5_APPEND_CSS = `
    /* ============================================================
       v5 识别层（新增规则；不新增圆角 / 阴影 / 边框色，尺寸只用既有 token）
       ============================================================ */
    /* 事实数字：唯一允许的三级字号。tabular-nums 让同列数字不跳，-.02em 收紧大字号的字距。 */
    .stat { font-variant-numeric: tabular-nums; letter-spacing: -.02em; line-height: 1; font-weight: 700; }
    .stat-22 { font-size: var(--fs-stat-sm); }
    .stat-30 { font-size: var(--fs-stat); }
    .stat-42 { font-size: var(--fs-stat-lg); }
    .stat-unit { font-size: var(--fs-xs); font-weight: 500; color: var(--mut); letter-spacing: 0; font-variant-numeric: normal; }

    /* need 卡：数字是 30px 唯一高音，单位回 11px 灰字；卡高不变 */
    .need-card .need-copy .stat-unit { margin-left: 2px; }

    /* 分带：条数 22px；1px 细线改成该档位色（40% 不透明度），不再是一条无信息的灰线 */
    .tierhead .stat { color: var(--ink); flex: none; }
    .tierhead .stat-unit { margin-left: 2px; }
    .tierhead.t1 .line { background: var(--t1); opacity: .4; }
    .tierhead.t2 .line { background: var(--t2); opacity: .4; }
    .tierhead.t3 .line { background: var(--t3); opacity: .4; }
    .tierhead.t4 .line { background: var(--t4); opacity: .4; }
    .tierhead.t5 .line { background: var(--t5); opacity: .4; }

    /* 跳到档位 = 档位图例：22px 方块 + 11px 等宽数字，与 .tierhead .n 完全同尺度 */
    .jump .jn {
      width: 22px; height: 22px; border-radius: var(--r-sm); flex: none;
      display: grid; place-items: center;
      font-size: 11px; font-weight: 700; font-family: ui-monospace, monospace;
    }
    .jump .jn.t1 { background: var(--t1); color: var(--on-t1); }
    .jump .jn.t2 { background: var(--t2); color: var(--on-t2); }
    .jump .jn.t3 { background: var(--t3); color: var(--on-t3); }
    .jump .jn.t4 { background: var(--t4); color: var(--on-t4); }
    .jump .jn.t5 { background: var(--t5); color: var(--on-t5); }

    /* 窄屏：分带里那半句说明让位给 22px 方块 + 22px 条数（规格 4 自查的回落方案） */
    @media (max-width: 760px) {
      .tierhead .hint { display: none; }
      /* 档位图例 chip：窄屏恢复既有 2px 横向内边距（本文件的 .jump a 规则在媒体查询之后，
         不写这一条会把窄屏的 2px 覆盖成 12px，360/390px 会把 label 挤出 chip）。 */
      .jump a { padding: calc(var(--s1) / 2) 2px; gap: 2px; }
    }
    /* 320–348px：4 枚 chip 均分后每枚只剩 ~69px，22px 方块 + 4 字标签放不下。
       沿用站点既有的 348px 断点，只在这一档收起图例方块（档位色仍由分带 22px 方块与 6px 竖条承担）。 */
    @media (max-width: 348px) {
      .jump .jn { display: none; }
    }
`;

function applyCssPatches(styleTag) {
  let css = styleTag;
  for (const p of CSS_PATCHES) {
    const count = css.split(p.find).length - 1;
    if (count !== 1) throw new Error(`CSS 补丁 ${p.id} 命中 ${count} 次（要求恰好 1 次）`);
    css = css.replace(p.find, p.replace);
    report.patches.push({ id: p.id, spec: p.spec, hit: count });
  }
  // 追加在 </style> 前
  const close = '  </style>';
  if (!css.includes(close)) throw new Error('共享 <style> 找不到收尾标记');
  css = css.replace(close, V5_APPEND_CSS + close);
  report.patches.push({ id: 'append/v5-rules', spec: '规格 1/2/3 + 自查 1', hit: 1 });
  return css;
}

/* ------------------------------------------------------------------ *
 * 2. 标记改动（只动数字的包装，不动卡片 / 网格结构）
 * ------------------------------------------------------------------ */

function patchMarkup($) {
  // 2.1 need 卡计数：<b>13</b> → <b class="stat stat-30">13<span class="stat-unit">条</span></b>
  let need = 0;
  $('.need-card').each((i, el) => {
    const b = $(el).find('.need-copy b');
    const num = b.text().trim();
    if (!/^\d+$/.test(num)) throw new Error(`need 卡计数不是纯数字：${num}`);
    b.attr('class', 'stat stat-30');
    b.text('');
    b.append(num);
    b.append('<span class="stat-unit">条</span>');
    need++;
  });
  report.markup.push({ page: CURRENT_PAGE, id: 'need/count', count: need, spec: '规格 2：need 卡计数 → 30px（真数，来自 dist）' });

  // 2.2 分带条数：hint 里拆出「N 条」
  let tier = 0;
  const tierNums = [];
  $('.tierhead').each((i, el) => {
    const hint = $(el).find('.hint');
    const raw = hint.text().replace(/\s+/g, ' ').trim();
    const m = raw.match(/^(.*?)\s*·\s*(\d+)\s*条$/);
    if (!m) throw new Error(`分带 hint 形态不符：${raw}`);
    hint.text(m[1]);
    const stat = $(`<span class="stat stat-22">${m[2]}<span class="stat-unit">条</span></span>`);
    hint.after(stat);
    tierNums.push({ tier: $(el).attr('class').replace('tierhead ', ''), num: m[2], desc: m[1] });
    tier++;
  });
  report.markup.push({ page: CURRENT_PAGE, id: 'tier/count', count: tier, spec: '规格 2：分带条数 → 22px', tiers: tierNums });

  // 2.3 跳到档位：①..④ → 22px 档位方块 + 文字标签
  let jump = 0;
  $('.jump a').each((i, el) => {
    const label = $(el).text().replace(/^[①②③④⑤]\s*/, '').trim();
    const n = i + 1;
    $(el).html(`<span class="jn t${n}" aria-hidden="true">${n}</span>${label}`);
    jump++;
  });
  report.markup.push({ page: CURRENT_PAGE, id: 'jump/legend', count: jump, spec: '自查 1：首屏 ≥3 块档位色（四档图例进首屏）' });
  return { need, tier, jump };
}

/* ------------------------------------------------------------------ *
 * 3. 页面组装
 * ------------------------------------------------------------------ */

function stripComments(html) { return html.replace(/<!--[\s\S]*?-->/g, ''); }

/** 把页面里的站内相对链接改写成「从 mockups/v5-sig/ 指向 dist/ 产物」 */
function rewriteUrls(html, sourcePrefix) {
  const base = 'http://mock.local/' + sourcePrefix;
  return html.replace(/\b(href|src)="([^"]*)"/g, (m, attr, val) => {
    const v = val.trim();
    if (!v || /^(https?:|mailto:|tel:|data:|javascript:|#|\/)/i.test(v)) return m;
    let u;
    try { u = new URL(v, base); } catch (e) { return m; }
    const p = u.pathname.replace(/^\//, '');
    return `${attr}="../../dist/${p}${u.search}${u.hash}"`;
  });
}

/** 让 mockup 与「线上 JS 已运行」的视觉状态一致：body.js 开关只影响 .seg 可见性 / 详情提示 / 收藏位 */
function markJsOn($) { $('body').attr('class', 'js'); }

/** 主题切换器：静态页没有脚本更新 aria-pressed，这里按要展示的主题把选中态写上 */
function selectThemeSeg($, value) {
  $('#themeSeg button').each((i, el) => {
    $(el).attr('aria-pressed', $(el).attr('data-theme-value') === value ? 'true' : 'false');
  });
}

/**
 * 收藏按钮是线上 JS 在渲染后追加的（dist 静态 HTML 里没有），前面的「改前」截图里每张卡都有它。
 * 为让并排对比只差设计层，这里按线上真实 DOM 逐字复刻一份静态外观（无交互、无事件）。
 * 标记来源：dist 首页 JS 运行后的 article.g 尾部 outerHTML（2026-11-11 抽取）。
 */
function injectFavs($) {
  let n = 0;
  $('article.g').each((i, el) => {
    if ($(el).find('[data-fav-toggle]').length) return;
    const title = $(el).find('h3 a').first().text().trim() || $(el).find('h3').first().text().trim();
    const btn = $('<button type="button" class="fav" data-fav-toggle="" aria-pressed="false"><span class="st" aria-hidden="true"></span></button>');
    btn.attr('aria-label', `收藏 ${title}`);
    btn.attr('title', '收藏（只存在本机，不上传）');
    $(el).append(btn);
    n++;
  });
  report.markup.push({ page: CURRENT_PAGE, id: 'fav/static-repro', count: n, spec: '保真：复刻线上 JS 生成的收藏按钮（静态外观）' });
}

/**
 * 页脚 #lastUpdated 在线上是 JS 填的（offers.json.updatedAt → zh-CN/Asia-Shanghai 字符串）。
 * 静态 mockup 若留 `--`，与「JS 已接管」的改前截图不一致；这里用**同一份数据 + 同一个格式化表达式**
 * 复刻线上值（不是手写日期）。取不到数据时保持 `--` 并写进报告，不猜。
 */
function footerStamp() {
  try {
    const o = JSON.parse(read('dist/assets/data/offers.json'));
    if (!o.updatedAt) return null;
    return new Date(o.updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch (e) { return null; }
}

function collectParts($) {
  const header = stripComments($('header.top').toString().trim());
  const facets = stripComments($('nav.facets').toString().trim());
  const needs = stripComments($('nav.needs').toString().trim());
  const main = stripComments($('main').toString().trim());
  const footer = stripComments($('footer').toString().trim());
  if (!header || !main || !footer) throw new Error('页头 / main / 页脚抽取失败（dist 结构与 page-shell 约定不符）');
  return { header, facets, needs, main, footer };
}

function headHtml({ title, description, themeScript, css, extraCss = '', themeAttr = '' }) {
  // css 传入的是完整 <style> 标签；这里只取内容，外层由本函数恰好包一次。
  const innerCss = css.replace(/^<style>/, '').replace(/<\/style>$/, '');
  return `<!DOCTYPE html>
<html lang="zh-CN"${themeAttr}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f7f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0d10" media="(prefers-color-scheme: dark)">
${themeScript}
<link rel="stylesheet" href="../../dist/logos.css">
<link rel="icon" href="../../dist/favicon.svg" type="image/svg+xml">
<style>${innerCss}</style>${extraCss}
</head>`;
}

function buildHome({ fileName, themeAttr, label }) {
  CURRENT_PAGE = fileName;
  const distHtml = read('dist/index.html');
  const styleTag = (distHtml.match(/<style>[\s\S]*?<\/style>/) || [])[0];
  const themeScript = (distHtml.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [])[0];
  if (!styleTag || !themeScript) throw new Error('dist/index.html 里抽不到共享 <style> 或主题预涂脚本');

  const patchedCss = applyCssPatches(styleTag);
  const $ = cheerio.load(distHtml, { decodeEntities: false });
  $('script').remove();
  $('dialog').remove();
  $('style, link, meta, title').remove();   // head 由本文件显式重建
  patchMarkup($);
  markJsOn($);
  selectThemeSeg($, themeAttr.includes('dark') ? 'dark' : 'light');
  injectFavs($);
  const parts = collectParts($);
  const stamp = footerStamp();
  if (stamp && parts.footer.includes('<span id="lastUpdated">--</span>')) {
    parts.footer = parts.footer.replace('<span id="lastUpdated">--</span>', `<span id="lastUpdated">${stamp}</span>`);
    report.markup.push({ page: CURRENT_PAGE, id: 'footer/lastUpdated', count: 1, value: stamp, spec: '保真：复刻线上 JS 填入的 updatedAt（同数据 + 同格式化表达式）' });
  } else {
    report.notes.push('页脚 #lastUpdated 未替换（数据缺失或标记形态变化），保持 --');
  }
  const urls = html => rewriteUrls(html, '');
  const body = `${urls(parts.header)}

${urls(parts.facets)}
${urls(parts.needs)}

${urls(`<div class="wrap">${parts.main}\n${parts.footer}</div>`)}

<!-- mockup v5-sig：只读复用 dist 产物；主应用脚本已删（否则会重渲染网格冲掉静态集合） -->
`;
  const html = headHtml({
    title: `【mockup v5】${label} · AI 优惠聚合器`,
    description: '识别层静态示意图：事实数字 30/22px 成为唯一高音，档位色放大到 22px 方块 / 6px 竖条。数据来自 dist 产物。',
    themeScript,
    css: patchedCss,
    themeAttr
  }) + '<body class="js">\n' + body + '</body>\n</html>\n';
  write(path.join(OUT, fileName), html);
  report.outputs.push({ file: fileName, bytes: Buffer.byteLength(html), stats: (html.match(/class="stat /g) || []).length });
  return html;
}

/* 二级页面族：/plans/api/ */
function buildFamily() {
  CURRENT_PAGE = 'family.html';
  const src = read('dist/plans/api/index.html');
  const styles = [...src.matchAll(/<style>[\s\S]*?<\/style>/g)].map(m => m[0]);
  if (styles.length !== 2) throw new Error(`/plans/api/ 期望 2 份 <style>（共享 + 页面级），实得 ${styles.length}`);
  const sharedCss = applyCssPatches(styles[0]);
  const pageCss = styles[1];
  const themeScript = (src.match(/<script>\s*\/\* 主题必须在首次绘制前决定[\s\S]*?<\/script>/) || [])[0];
  const title = ($ => $('title').text().trim())(cheerio.load(src, { decodeEntities: false }));
  const desc = ($ => $('meta[name="description"]').attr('content') || '')(cheerio.load(src, { decodeEntities: false }));
  if (!themeScript) throw new Error('/plans/api/ 里抽不到主题预涂脚本');

  const $ = cheerio.load(src, { decodeEntities: false });
  $('script').remove();
  $('style, link, meta, title').remove();
  markJsOn($);
  selectThemeSeg($, 'light');
  injectFavs($);

  // h1 旁：1–3 个事实数字（真数取自本页 .stop .meta，替换原来那串 12px 小字，不新增数据）
  const meta = $('.stop .meta');
  const metaRaw = meta.text().replace(/\s+/g, ' ').trim();
  const m = metaRaw.match(/^(\d+)\s*条计费记录\s*·\s*(\d+)\s*个平台\s*·\s*(\d+)\s*个模型计价条目\s*·\s*最后核对\s*(\d{4}-\d{2}-\d{2})$/);
  if (!m) throw new Error(`/plans/api/ 的 .stop .meta 形态不符：${metaRaw}`);
  const [, nRecords, nPlatforms, nModels, checkedAt] = m;
  report.markup.push({ page: CURRENT_PAGE, id: 'family/h1-stats', count: 3, spec: '规格 2：页面族 h1 旁放 1–3 个 .stat', values: { nRecords, nPlatforms, nModels, checkedAt } });
  meta.replaceWith(`
        <div class="stopstats" aria-label="本页事实数字">
          <span class="stopstat"><b class="stat stat-22">${nRecords}</b><span class="stopstat-lb">条计费记录</span></span>
          <span class="stopstat"><b class="stat stat-22">${nPlatforms}</b><span class="stopstat-lb">个平台</span></span>
          <span class="stopstat"><b class="stat stat-22">${nModels}</b><span class="stopstat-lb">个模型计价条目</span></span>
        </div>
        <span class="meta">最后核对 ${checkedAt}</span>`);

  const FAMILY_CSS = `
    /* ---------- v5 识别层：页面族 h1 旁的事实数字（页面级样式，仍只用共享 token） ---------- */
    .stopstats { display: flex; align-items: baseline; flex-wrap: wrap; gap: var(--s1) var(--s4); }
    .stopstat { display: flex; align-items: baseline; gap: var(--s1); }
    .stopstat .stat { color: var(--ink); }
    .stopstat-lb { font-size: var(--fs-xs); color: var(--mut); }
    @media (max-width: 760px) { .stopstats { gap: var(--s2) var(--s3); } }
`;
  const pageCssBody = pageCss.replace(/^<style>/, '').replace(/<\/style>\s*$/, '');
  if (pageCssBody === pageCss) throw new Error('/plans/api/ 页面级 <style> 标签剥离失败');
  const pageStyleTag = `<style>${pageCssBody}${FAMILY_CSS}</style>`;

  const header = stripComments($('header.top').toString().trim());
  const main = stripComments($('main').toString().trim());
  const footer = stripComments($('footer').toString().trim());
  // 基准是「站根 = dist/」，页面自身路径 plans/api/；写成 dist/plans/api/ 会多一层前缀（../../dist/dist/…）。
  const urls = h => rewriteUrls(h, 'plans/api/');
  const body = `${urls(header)}

${urls(`<div class="wrap">${main}\n${footer}</div>`)}

<!-- mockup v5-sig：/plans/api/ 换肤演示；脚本已删，.stop 里的 12px 小字换成 h1 旁事实数字（同数） -->
`;
  const html = headHtml({
    title: `【mockup v5】${title}`,
    description: desc,
    themeScript,
    css: sharedCss,
    extraCss: '\n' + pageStyleTag,
    themeAttr: ' data-theme="light"'
  }) + '<body class="js">\n' + body + '</body>\n</html>\n';
  write(path.join(OUT, 'family.html'), html);
  report.outputs.push({ file: 'family.html', bytes: Buffer.byteLength(html), stats: (html.match(/class="stat /g) || []).length, h1Stats: 3 });
}

/* ------------------------------------------------------------------ *
 * 4. 运行
 * ------------------------------------------------------------------ */
fs.mkdirSync(DATA, { recursive: true });
buildHome({ fileName: 'home-light.html', themeAttr: ' data-theme="light"', label: '首页 · 浅色' });
buildHome({ fileName: 'home-dark.html', themeAttr: ' data-theme="dark"', label: '首页 · 深色' });
buildHome({ fileName: 'home-390.html', themeAttr: ' data-theme="light"', label: '首页 · 手机 390px' });
buildFamily();
// 同一批补丁被 4 个文档各应用一次；报告里按 id 去重（每次命中都已断言恰好 1 次）
{
  const seen = new Map();
  for (const p of report.patches) if (!seen.has(p.id)) seen.set(p.id, { ...p, documents: 1 }); else seen.get(p.id).documents++;
  report.patches = [...seen.values()];
}
write(path.join(DATA, 'build-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
