#!/usr/bin/env node
'use strict';
/**
 * 把 6 张原始截图合成 3 张「改前 / 改后」并排图。
 * 产物：mockups/v6-fix/1440-light.png、1440-dark.png、390.png
 * 说明：图片经 127.0.0.1:8081 静态服务读取；合成页只做标题/标签/图注，不改截图内容。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../../..');
const BASE = 'http://127.0.0.1:8081/mockups/v6-fix/shots/';
const OUT = path.resolve(__dirname, '..');

const CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--ink); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .page { padding: 34px 40px 44px; }
  .kicker { font-size: 14px; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
  h1 { margin: 6px 0 4px; font-size: 40px; line-height: 1.2; letter-spacing: -.01em; }
  .sub { margin: 0 0 26px; color: var(--muted); font-size: 18px; }
  .pair { display: flex; gap: 18px; align-items: flex-start; }
  figure { margin: 0; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.10); }
  figcaption { display: flex; align-items: center; gap: 10px; padding: 2px 2px 10px; font-size: 19px; font-weight: 700; color: var(--ink); }
  figcaption .file { font-weight: 400; color: var(--muted); font-size: 15px; }
  .tag { display: inline-block; font-size: 13px; line-height: 1; padding: 7px 10px; border-radius: 6px; font-weight: 700; letter-spacing: .04em; }
  .tag.before { background: #fee2e2; color: #991b1b; }
  .tag.after { background: #dcfce7; color: #166534; }
  img { display: block; width: 100%; height: auto; border-radius: 4px; }
  .legend { margin-top: 22px; padding: 16px 20px; border: 1px dashed var(--border); border-radius: 10px; color: var(--ink2); font-size: 17px; line-height: 1.75; background: var(--legend); }
  .legend b { color: var(--ink); }
  .num { display: inline-block; min-width: 22px; padding: 1px 6px; margin-right: 4px; border-radius: 5px; background: var(--accent); color: #fff; font-weight: 700; font-size: 13px; line-height: 20px; text-align: center; }
  .details { margin-top: 34px; }
  .details h2 { font-size: 21px; margin: 0 0 12px; }
  .dgroup { margin-top: 24px; }
  .dgroup .pair { gap: 16px; justify-content: center; }
  .dgroup figure { width: 904px; }
  .dgroup figcaption { font-size: 16px; }
  .dgroup img { width: 904px; }
  .needs .dgroup figure { width: 390px; }
  .needs .dgroup img { width: 390px; height: 758px; }
  .needs .dgroup figcaption { flex-wrap: wrap; font-size: 14px; }
  .needs .dgroup figcaption .file { display: none; }
  .note { margin-top: 18px; color: var(--muted); font-size: 14.5px; }
  .light { --bg: #e8edf3; --panel: #fff; --ink: #16202c; --ink2: #33465c; --muted: #5b6b7f; --border: #b9c5d3; --accent: #2563eb; --legend: #f4f7fb; }
  .dark { --bg: #0b0e12; --panel: #11161d; --ink: #e6edf3; --ink2: #c3cfdd; --muted: #9aabbf; --border: #2b3746; --accent: #7c93ff; --legend: #121922; }
  .mobile { --bg: #edf1f6; --panel: #fff; --ink: #16202c; --ink2: #33465c; --muted: #5b6b7f; --border: #b9c5d3; --accent: #2563eb; --legend: #f4f7fb; }
`;

function figure(src, tag, label, w, h, extra = '') {
  return `<figure${extra}><figcaption><span class="tag ${tag}">${tag === 'before' ? '改前' : '改后'}</span>${label} <span class="file">${src.split('/').pop()}</span></figcaption><img src="${BASE}${src}" width="${w}" height="${h}" alt="${label}"></figure>`;
}

function page({ cls, width, kicker, title, sub, left, right, legend, details = '', note = '' }) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${CSS}</style></head><body class="${cls}"><div class="page" style="width:${width}px">
  <div class="kicker">${kicker}</div><h1>${title}</h1><p class="sub">${sub}</p>
  <div class="pair">${left}${right}</div>
  ${details}
  <div class="legend">${legend}</div>
  ${note ? `<div class="note">${note}</div>` : ''}
</div></body></html>`;
}

const IMG = {
  b1440l: ['before-1440-light.png', 1440, 1800],
  a1440l: ['after-1440-light.png', 1440, 1800],
  b1440d: ['before-1440-dark.png', 1440, 1800],
  a1440d: ['after-1440-dark.png', 1440, 1800],
  b390: ['before-390-light.png', 390, 900],
  a390: ['after-390-light.png', 390, 900],
  bfm: ['detail-before-fmembers.png', 904, 384],
  afm: ['detail-after-merged.png', 904, 384],
  btitle: ['detail-before-title.png', 904, 384],
  atitle: ['detail-after-title.png', 904, 384],
  bneeds: ['detail-before-needs.png', 780, 1516],
  aneeds: ['detail-after-needs.png', 716, 1516]
};

const legend1440 = `<b>图上对应：</b><span class="num">2</span>顶栏 3 枚实心药丸 → 1 枚实心 + 2 枚全称文字链
  · <span class="num">3</span>9 张 OpenRouter 免费模型卡并成 1 张（首行首卡）
  · <span class="num">4</span>角标「未标注截止日期」→「未标注」
  · <span class="num">5</span>成员行不再横向滚动（见下方细节）
  · <span class="num">6</span>筛选条两端渐隐`;
const legendDark = `<b>图上对应：</b><span class="num">2</span>暗色下顶栏降权：1 枚实心药丸 + 2 枚全称文字链（文字链 <code>--ink2</code> on <code>--bg</code>，对比约 10:1）
  · <span class="num">3</span>合并卡
  · <span class="num">4</span>角标「未标注」
  · <span class="num">5</span>成员行省略号
  · <span class="num">6</span>筛选条渐隐`;
const needsDetail = `<div class="details needs"><h2>入口卡块（10 张）· 改前在首屏 / 改后在优惠网格之后（top≈17,253px）</h2><div class="dgroup"><div class="pair">${figure(IMG.bneeds[0], 'before', '改前：同块在首屏（10 张）', 390, 758)}${figure(IMG.aneeds[0], 'after', '改后：同块在网格之后（10 张）', 358, 758)}</div></div></div>`;
const legend390 = `<b>图上对应：</b><span class="num">1</span>10 张入口卡整块移到优惠网格之后（不折叠、不新增交互；改后首屏第一张是优惠卡）
  · <span class="num">3</span>合并卡
  · <span class="num">4</span>角标「未标注」
  · <span class="num">5</span>成员行省略号
  · <span class="num">6</span>筛选条右端渐隐`;

const details1440 = `
<div class="details">
  <h2>细节（2× 裁切，均为同一页面的真实渲染）</h2>
  <div class="dgroup">
    <div class="pair">
      ${figure(IMG.bfm[0], 'before', '智谱AI 免费模型：.fmembers 出现 15px 横向滚动条', 904, 384)}
      ${figure(IMG.afm[0], 'after', '合并卡：单行 + 省略号，无横向滚动条', 904, 384)}
    </div>
  </div>
  <div class="dgroup">
    <div class="pair">
      ${figure(IMG.btitle[0], 'before', '讯飞星火：角标占位，标题折成 2 行', 904, 384)}
      ${figure(IMG.atitle[0], 'after', '角标缩成「未标注」后，同一标题收回 1 行', 904, 384)}
    </div>
  </div>
</div>`;

const specs = [
  {
    out: '1440-light.png', w: 2976,
    html: page({
      cls: 'light', width: 2896,
      kicker: 'mockups/v6-fix · 第 0 步示意图',
      title: 'AI 优惠聚合器 · 首页改版',
      sub: '1440 亮色 · 同一份 dist/index.html 的改前 / 改后补丁副本 · 视口 1440×1800（截到第二屏）',
      left: figure(IMG.b1440l[0], 'before', '完整首页', 1440, 1800),
      right: figure(IMG.a1440l[0], 'after', '完整首页', 1440, 1800),
      legend: legend1440,
      details: details1440,
      note: '滚动条为 Windows 经典滚动条条件复现（Chromium 启动时关闭 --hide-scrollbars，并单独隐藏页面级竖滚动条）；Linux headless 默认不画内部滚动条。'
    })
  },
  {
    out: '1440-dark.png', w: 2976,
    html: page({
      cls: 'dark', width: 2896,
      kicker: 'mockups/v6-fix · 第 0 步示意图',
      title: 'AI 优惠聚合器 · 首页改版',
      sub: '1440 暗色 · 同一份 dist/index.html 的改前 / 改后补丁副本 · 视口 1440×1800（截到第二屏）',
      left: figure(IMG.b1440d[0], 'before', '完整首页', 1440, 1800),
      right: figure(IMG.a1440d[0], 'after', '完整首页', 1440, 1800),
      legend: legendDark,
      note: '暗色由页面自带 data-theme=dark 渲染；文字链颜色取页面变量 --ink2，未另造颜色。'
    })
  },
  {
    out: '390.png', w: 1640,
    html: page({
      cls: 'mobile', width: 1576,
      kicker: 'mockups/v6-fix · 第 0 步示意图',
      title: 'AI 优惠聚合器 · 首页改版',
      sub: '390（iPhone 12 档）· 改前 / 改后 · 视口 390×900（首屏：改前 0 张优惠卡，改后首张完整可见）',
      left: figure(IMG.b390[0], 'before', '首屏：入口卡占满，网格在 1149px 之后', 390, 900),
      right: figure(IMG.a390[0], 'after', '首屏：优惠卡出现', 390, 900),
      legend: legend390,
      details: needsDetail,
      note: '改后入口卡整块在优惠网格之后（实测 top≈17,253px），未删除、未折叠；390×900 首屏内改前 0 张、改后 2 张完整优惠卡（合并卡 + 百川）。入口卡图标为页面原生 emoji：Linux 截图中因缺彩色 emoji 字体显示为方框（Windows 为原生 emoji），不影响布局。'
    })
  }
];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const spec of specs) {
    const ctx = await browser.newContext({ viewport: { width: spec.w, height: 1200 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.setContent(spec.html, { waitUntil: 'load' });
    await p.evaluate(() => Promise.all([...document.images].map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; }))));
    await p.waitForTimeout(300);
    const out = path.join(OUT, spec.out);
    await p.screenshot({ path: out, fullPage: true });
    const size = await p.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }));
    console.log(JSON.stringify({ out, ...size }));
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
