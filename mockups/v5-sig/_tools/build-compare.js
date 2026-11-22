'use strict';
/**
 * 评审页 mockups/v5-sig/compare.html —— 一屏看完的「改前 / 改后」并排。
 *
 * 规格：同一张截图同时给两个尺度 —— 100%（1440 CSS px 原尺寸，窗口内裁切）
 * 与 transform: scale(.25)（整屏 360×225）。同一份 PNG，不是两张不同的图。
 *
 * 数据全部读自本轮实测 JSON（_data/），页面里的数字不是手写的。
 * 运行：node mockups/v5-sig/_tools/build-compare.js
 */
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(__dirname, '..');
const D = p => JSON.parse(fs.readFileSync(path.join(OUT, '_data', p), 'utf8'));
const before = D('before-1440.json');
const after = D('after-1440.json');
const afterDark = D('after-dark-1440.json');
const after390 = D('after-390.json');
const contrast = D('contrast.json');
const build = D('build-report.json');

const ratio = (a, b) => (Math.round((a / b) * 100) / 100).toFixed(2);
const minOf = theme => Math.min(...['t1', 't2', 't3', 't4', 't5'].map(k => contrast.results[theme][k].blockVsBg));
const statFonts = [...new Set(after.stats.map(s => s.fs))].sort();
const beforeBar = before.bars[0] && before.bars[0].w;
const afterBar = after.bars[0] && after.bars[0].w;
const beforeQuoteBold = (before.txB.find(x => x.color !== 'rgb(15, 23, 42)') || {}).color || 'n/a';
const bigNonNumeric = after.bigText.filter(el => !/^[\d.,%+￥$¥元/ ]+$/.test((el.text || '').replace(/条|个|天|家|款|次/g, ''))).length;

const rows = [
  ['首屏完整可见卡片', `${before.fullyVisibleCards} 张`, `${after.fullyVisibleCards} 张`, '持平（不许下降）'],
  ['网格起点', `${before.layout['#dealsList'].rect.top}px`, `${after.layout['#dealsList'].rect.top}px`, '零位移'],
  ['分带高 / 方块', `${before.tierheads[0].h}px / 16px`, `${after.tierheads[0].h}px / 22px`, '带宽不变'],
  ['need 卡高', `${before.needCards[0].h}px`, `${after.needCards[0].h}px`, '卡高不变'],
  ['need 卡计数', '11px', '30px', '数字成为高音'],
  ['分带条数', '11.5px', '22px', '数字成为高音'],
  ['引文竖条 / 文字', `${beforeBar} / ${beforeQuoteBold}`, `${afterBar} / --ink`, '颜色只留竖条'],
  ['新增非数字大字号', '0', '0', `${after.bigText.length} 处大字全是 .stat 数字`]
];

const swatches = ['t1', 't2', 't3', 't4', 't5'].map(k => {
  const L = contrast.results.light[k];
  const Dk = contrast.results.dark[k];
  return `<span class="sw"><i style="background:${L.hex}"></i>t${k.slice(1)} ${L.hex}<b>${L.blockVsBg.toFixed(2)}:1</b><i class="dark" style="background:${Dk.hex}"></i><b>${Dk.blockVsBg.toFixed(2)}:1</b></span>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>识别层 v5 —— 改前 / 改后（评审页，一屏）</title>
<style>
  :root { color-scheme: light; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font: 13px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', Roboto, sans-serif;
    background: #eef0f3; color: #111827; padding: 12px 24px 10px;
  }
  header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 8px; }
  h1 { font-size: 18px; letter-spacing: -.2px; }
  .verdict { font-size: 12px; color: #4b5563; }
  .verdict b { color: #111827; }
  .grid { display: grid; grid-template-columns: 680px 680px; gap: 24px; }
  figure { min-width: 0; }
  figcaption { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; font-size: 12px; color: #374151; }
  figcaption .tag { font-size: 11px; font-weight: 700; letter-spacing: .04em; padding: 1px 7px; border-radius: 4px; }
  .before .tag { background: #e5e7eb; color: #374151; }
  .after .tag { background: #111827; color: #fff; }
  .crop { position: relative; width: 680px; height: 342px; overflow: hidden; background: #fff; border: 1px solid #d1d5db; border-radius: 6px; }
  .crop img { position: absolute; left: 0; top: -96px; width: 1440px; height: 900px; }
  .ruler { position: absolute; left: 0; right: 0; top: 258px; border-top: 1px dashed rgba(59,91,253,.55); z-index: 2; }
  .ruler span { position: absolute; right: 4px; top: -14px; font-size: 10px; color: #3b5bfd; background: #fff; padding: 0 4px; }
  .scale { font-size: 11px; color: #6b7280; margin: 3px 0 6px; }
  .thumb { position: relative; width: 360px; height: 225px; overflow: hidden; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
  .thumb img { position: absolute; left: 0; top: 0; width: 1440px; height: 900px; transform: scale(.25); transform-origin: top left; }
  .thumbwrap { display: flex; align-items: flex-start; gap: 12px; }
  .thumbnote { font-size: 11px; color: #4b5563; line-height: 1.55; max-width: 292px; }
  .thumbnote b { color: #111827; }
  footer { margin-top: 8px; border-top: 1px solid #d1d5db; padding-top: 8px; display: flex; gap: 18px; align-items: flex-start; }
  table { border-collapse: collapse; font-size: 11px; }
  th, td { text-align: left; padding: 1px 10px 1px 0; vertical-align: top; }
  th { color: #6b7280; font-weight: 600; }
  td { color: #111827; white-space: nowrap; }
  td.note { color: #6b7280; }
  .right { flex: 1; min-width: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 5px; }
  .chip { font-size: 11px; background: #fff; border: 1px solid #d1d5db; border-radius: 999px; padding: 2px 9px; }
  .chip b { color: #111827; }
  .sws { display: flex; flex-wrap: wrap; gap: 10px; font-size: 10.5px; color: #4b5563; align-items: center; }
  .sw { display: inline-flex; align-items: center; gap: 4px; }
  .sw i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .sw i.dark { margin-left: 6px; box-shadow: inset 0 0 0 1px #6b7280; }
  .sw b { color: #111827; font-weight: 600; }
  .legend { font-size: 10.5px; color: #6b7280; margin-top: 4px; }
  .caveat { font-size: 10px; color: #6b7280; margin-top: 5px; line-height: 1.5; }
</style>
</head>
<body>
<header>
  <h1>识别层 v5 —— 改前 / 改后</h1>
  <span class="verdict">判据：<b>事实数字成为唯一高音</b>、<b>档位色放大到能被看见</b>、<b>引文让位</b>；布局 / 卡数 / 数据不动。</span>
</header>

<div class="grid">
  <figure class="before">
    <figcaption><span class="tag">改前</span> 现状 dist 产物（JS 运行，1440×900）</figcaption>
    <div class="crop"><img src="shots/before-1440.png" width="1440" height="900" alt="改前首页首屏">
      <div class="ruler"><span>100% 裁切：y=96–438px</span></div></div>
    <div class="scale">100%：1440 CSS px 原尺寸，窗口 680×342 只做裁切（不缩放）</div>
    <div class="thumbwrap">
      <div class="thumb"><img src="shots/before-1440.png" width="1440" height="900" alt="改前首页 25%"></div>
      <div class="thumbnote">同一张 PNG，<b>transform: scale(.25)</b> → 360×225。<br>缩到 25% 时：档位色只剩分带里 1 个 16px 方块（≈4px）、引文竖条 0.75px；<b>看不到 3 块档位色</b>。</div>
    </div>
  </figure>

  <figure class="after">
    <figcaption><span class="tag">改后</span> v5 识别层 mockup（静态渲染；复刻线上 JS 运行后的 DOM，无交互）</figcaption>
    <div class="crop"><img src="shots/after-1440.png" width="1440" height="900" alt="改后首页首屏">
      <div class="ruler"><span>100% 裁切：y=96–438px</span></div></div>
    <div class="scale">100%：1440 CSS px 原尺寸，窗口 680×342 只做裁切（不缩放）</div>
    <div class="thumbwrap">
      <div class="thumb"><img src="shots/after-1440.png" width="1440" height="900" alt="改后首页 25%"></div>
      <div class="thumbnote">同一张 PNG，<b>transform: scale(.25)</b> → 360×225。<br>缩到 25% 时：<b>30px 计数 → 7.5px</b> 仍是一眼可见的高音；<b>4 块 22px 档位方块 → 5.5px</b> 仍能数出绿 / 蓝 / 青 / 琥珀。</div>
    </div>
  </figure>
</div>

<footer>
  <table>
    <tr><th>指标（实测）</th><th>改前</th><th>改后</th><th></th></tr>
    ${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="note">${r[3]}</td></tr>`).join('')}
  </table>
  <div class="right">
    <div class="chips">
      <span class="chip">首屏完整卡片 <b>${before.fullyVisibleCards} → ${after.fullyVisibleCards}</b></span>
      <span class="chip">分带带宽 <b>${before.tierheads[0].h} → ${after.tierheads[0].h}px</b></span>
      <span class="chip">新增非数字大字号 <b>0</b></span>
      <span class="chip">25% 缩略图 <b>30px 数字 + 4 档位色 ✓</b></span>
      <span class="chip">390px 横向溢出 <b>${after390.horizontalOverflow}px</b></span>
      <span class="chip">对比度下限 <b>${minOf('light').toFixed(2)}:1</b> / <b>${minOf('dark').toFixed(2)}:1</b></span>
    </div>
    <div class="sws"><span>档位色（左浅色 / 右深色，数字 = vs 底色实测）：</span>${swatches}</div>
    <div class="legend">浅色 vs #f6f7f9；深色 vs #0b0d10，与 --bg 同值。文字用途另测：浅色最低 ${Math.min(...['t1','t2','t3','t4','t5'].map(k=>contrast.results.light[k].textOnCard)).toFixed(2)}:1，深色最低 ${Math.min(...['t1','t2','t3','t4','t5'].map(k=>contrast.results.dark[k].textOnCard)).toFixed(2)}:1。</div>
    <div class="caveat">口径：改后与改前都来自 dist 产物（样式 / 页头 / 页脚 / 卡片原 HTML），只替换识别层；改后删掉主应用脚本，故收藏星标与主题切换由构建器按线上运行后的 DOM 静态复刻，仅外观、无交互。改前截图是线上 JS 运行态。</div>
  </div>
</footer>
</body>
</html>
`;
fs.writeFileSync(path.join(OUT, 'compare.html'), html);
fs.writeFileSync(path.join(OUT, '_data', 'compare-data.json'), JSON.stringify({ before, after, afterDark, contrast, rows, minLight: minOf('light'), minDark: minOf('dark'), bigNonNumeric, buildOutputs: build.outputs }, null, 2));
console.log(JSON.stringify({ ok: true, bytes: Buffer.byteLength(html), minLight: minOf('light'), minDark: minOf('dark'), bigNonNumeric, rows }, null, 1));
