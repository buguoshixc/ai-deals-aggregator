/**
 * 生成 009 样稿：把 007 的骨架 + 真厂商 logo + 惠民分档排序，logo 全部内联为 data URI，
 * 文件自包含，不热链任何第三方（避免把访客 IP 交给 CDN，也不怕对方改文件）。
 */
const fs = require('fs');
const path = require('path');

const LOGODIR = path.join(__dirname, 'mockups', 'logos');
const OUT = path.join(__dirname, 'mockups', 'v2-dense', '009-真Logo版.html');
const brand = JSON.parse(fs.readFileSync(path.join(LOGODIR, '_brand-svg.json'), 'utf8'));

const MIME = { '.png': 'image/png', '.svg': 'image/svg+xml' };
const dataUri = (file) => {
  const ext = path.extname(file);
  return 'data:' + MIME[ext] + ';base64,' + fs.readFileSync(path.join(LOGODIR, file)).toString('base64');
};

// Microsoft 的 Simple Icons slug 抓不到，这里是官方四色方块（几何极简，可直接矢量重建）
const MS_SVG = '0 0 24 24';
const MS_D = 'M2 2h9.4v9.4H2V2Zm10.6 0H22v9.4h-9.4V2ZM2 12.6h9.4V22H2v-9.4Zm10.6 0H22V22h-9.4v-9.4Z';

// vendor key → 展示名 / 取图方式 / 额外适配
// fit:'wide' = 原图是长条（宽高比 >2），要塞进横向胶囊而不是方块
const RASTER = {
  'tencent-cloud': ['腾讯云 · 混元', 'tencent-cloud.png'],
  zhipu: ['智谱AI', 'zhipu.png'],
  volcengine: ['火山引擎 · 方舟', 'volcengine.png'],
  iflytek: ['科大讯飞 · 讯飞开放平台', 'iflytek.png'],
  siliconflow: ['硅基流动', 'siliconflow.svg', 'wide'],
  stepfun: ['阶跃星辰 StepFun', 'stepfun.svg'],
  sensetime: ['商汤科技 SenseTime', 'sensetime.png'],
  baichuan: ['百川智能 Baichuan', 'baichuan.png'],
  groq: ['Groq', 'groq.svg'],
  runway: ['Runway', 'runway.png'],
  aws: ['Amazon Web Services', 'aws.png']
};

/** 生成一个 logo tile 的 HTML */
function tile(key, size = 24, radius = 7) {
  if (key === 'microsoft') {
    return `<span class="lg svg" style="--b:#5E5E5E" title="Microsoft">` +
      `<svg viewBox="${MS_SVG}" width="${Math.round(size * 0.62)}" height="${Math.round(size * 0.62)}">` +
      `<path d="${MS_D}" fill="#5E5E5E"/></svg></span>`;
  }
  if (brand[key]) {
    const b = brand[key];
    const s = Math.round(size * 0.62);
    return `<span class="lg svg" style="--b:${b.color}" title="${b.name}">` +
      `<svg viewBox="${b.viewBox}" width="${s}" height="${s}">` +
      `<path d="${b.d}" fill="${b.color}"/></svg></span>`;
  }
  if (RASTER[key]) {
    const [name, file, fit] = RASTER[key];
    if (fit === 'wide') {
      // 长条图形（如硅基流动 156x32）塞进方块会被压成一条线：
      // 改成横向胶囊，宽度 2 倍，宽高比仍由 object-fit 保持
      const w = Math.round(size * 2), h = Math.round(size * 0.78);
      return `<span class="lg img wide" title="${name}" style="width:${w}px">` +
        `<img src="${dataUri(file)}" alt="${name}" width="${Math.round(w - 8)}" height="${h}"></span>`;
    }
    const s = Math.round(size * 0.78);
    return `<span class="lg img" title="${name}">` +
      `<img src="${dataUri(file)}" alt="${name}" width="${s}" height="${s}"></span>`;
  }
  throw new Error('没有该厂商的 logo: ' + key);
}

/** 还没有可信 logo 的厂商：显示"待确认"占位，绝不拿错图充数 */
function tileUnknown(label, size = 24) {
  return `<span class="lg unknown" title="${label} · logo 待确认">?</span>`;
}

function logos(keys) {
  const shown = keys.slice(0, 4);
  const rest = keys.length - shown.length;
  let html = '<div class="logos">' + shown.map((k) => tile(k)).join('');
  if (rest > 0) html += `<span class="lg more" title="另有 ${rest} 个厂商 / 模型">+${rest}</span>`;
  return html + '</div>';
}

console.log('已内联 logo：');
Object.keys(brand).forEach((k) => console.log('  ✓ ' + brand[k].name + '  （品牌 SVG ' + brand[k].color + '）'));
Object.entries(RASTER).forEach(([k, [n, f]]) => console.log('  ✓ ' + n + '  （官网文件 ' + f + '）'));
console.log('  ✓ Microsoft  （官方四色方块，矢量重建）');
console.log('\n生成中…');

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>样稿 009 · 真厂商 Logo + 惠民分档排序</title>
<style>
  :root{
    --bg:#f6f7f9; --card:#fff; --ink:#0f172a; --ink2:#495066; --mut:#8c94a6;
    --line:#e6e9ef; --line2:#f0f2f6;
    --brand:#3b5bfd; --deal:#d92d4b; --dealsoft:#fff1f4;
    --cn:#0b7a63; --cnbg:#e8f7f2; --gl:#2348c4; --glbg:#eef3ff;
    --ok:#0b7a63; --warn:#c2410c;
    --r:10px;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font:13.5px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink)}
  .wrap{max-width:1420px;margin:0 auto;padding:0 20px 60px}

  /* ---------- 顶栏 ---------- */
  .top{background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
  .topin{max-width:1420px;margin:0 auto;padding:0 20px;height:58px;display:flex;align-items:center;gap:18px}
  .brand{display:flex;align-items:center;gap:10px;white-space:nowrap;text-decoration:none;color:inherit}
  .mark{width:30px;height:30px;border-radius:9px;background:linear-gradient(140deg,#4f6bff,#3b5bfd);
        display:grid;place-items:center;flex:none;box-shadow:0 2px 6px -2px rgba(59,91,253,.55)}
  .brand .txt{display:flex;flex-direction:column;line-height:1.15}
  .brand .txt b{font-size:14.5px;font-weight:750;letter-spacing:-.2px}
  .brand .txt b em{font-style:normal;color:var(--deal)}
  .brand .txt small{font-size:10px;color:var(--mut);letter-spacing:.6px;font-weight:500}
  .search{flex:1;max-width:440px;display:flex;align-items:center;gap:9px;border:1px solid var(--line);border-radius:8px;padding:0 12px;background:#fafbfc}
  .search input{border:0;outline:0;background:0;flex:1;padding:8px 0;font:inherit;font-size:13px}
  .search input::placeholder{color:var(--mut)}
  .top .stat{font-size:12.5px;color:var(--mut);white-space:nowrap;margin-left:auto}
  .top .stat b{color:var(--ink)}

  .facets{background:#fff;border-bottom:1px solid var(--line);position:sticky;top:58px;z-index:19}
  .facetsin{max-width:1420px;margin:0 auto;padding:9px 20px;display:flex;gap:7px;align-items:center;overflow-x:auto}
  .f{font-size:12.5px;border:1px solid var(--line);background:#fff;color:var(--ink2);border-radius:999px;padding:4px 11px;white-space:nowrap;cursor:pointer}
  .f:hover{border-color:#c3ceff;color:var(--brand)}
  .f.on{background:var(--ink);border-color:var(--ink);color:#fff;font-weight:600}
  .f.ok{border-color:#b9e3d7;color:var(--ok);background:#f4fdfa}
  .f.ok.on{background:var(--ok);border-color:var(--ok);color:#fff}
  .f b{opacity:.7;margin-left:3px}
  .fsep{width:1px;height:15px;background:var(--line);flex:none;margin:0 3px}

  .rbar{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:16px 0 10px;font-size:12.5px;color:var(--mut);flex-wrap:wrap}
  .rbar b{color:var(--ink)}
  .sortbox{display:flex;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}
  .sortbox span{padding:5px 12px;font-size:12px;color:var(--ink2);border-left:1px solid var(--line);cursor:pointer;white-space:nowrap}
  .sortbox span:first-child{border-left:0}
  .sortbox span.on{background:var(--ink);color:#fff;font-weight:600}

  /* ---------- 网格 ---------- */
  .grid{display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:min-content;gap:12px}

  .g{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:13px 14px;
     height:172px;display:flex;flex-direction:column;position:relative;overflow:hidden;
     transition:border-color .13s,box-shadow .13s}
  .g:hover{border-color:#cdd6e6;box-shadow:0 6px 18px -12px rgba(15,23,42,.3)}
  .g.verified{box-shadow:inset 2px 0 0 var(--ok)}

  .g .tierdot{position:absolute;top:0;left:0;width:0;height:0;border-top:22px solid #cbd5e1;border-right:22px solid transparent;border-radius:var(--r) 0 0 0}
  .g.t1 .tierdot{border-top-color:#0e9f6e}
  .g.t2 .tierdot{border-top-color:#5b7cfa}
  .g.t3 .tierdot{border-top-color:#2563eb}
  .g.t4 .tierdot{border-top-color:#e08a2e}
  .g.t5 .tierdot{border-top-color:#94a3b8}
  .g .tiernum{position:absolute;top:2px;left:4px;font-size:9px;font-weight:800;color:#fff;font-family:ui-monospace,monospace;z-index:1}

  /* ---------- 卡片头：真 logo ---------- */
  .gh{display:flex;gap:10px;align-items:flex-start;padding-left:12px}
  .gt{flex:1;min-width:0}
  .g h3{font-size:14px;font-weight:680;line-height:1.4;letter-spacing:-.1px;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .g h3 a{color:inherit;text-decoration:none}
  .g h3 a:hover{color:var(--brand)}
  .g .vendor{font-size:11px;color:var(--mut);margin-top:3px;
             display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}

  /* logo 容器：压缩态叠加，hover 展开。实测必须避免改变盒高，否则整行网格会被顶动 */
  .logos{display:flex;flex:none;padding-top:1px;position:relative;z-index:2}
  .lg{
    width:24px;height:24px;border-radius:7px;display:grid;place-items:center;
    border:1.5px solid #fff;box-shadow:0 1px 3px -1px rgba(15,23,42,.28);
    margin-left:-8px;position:relative;background:#fff;overflow:hidden;
    transition:margin-left .18s cubic-bezier(.34,1.4,.64,1),width .18s;
  }
  .lg:first-child{margin-left:0}
  /* 品牌 SVG：淡色底 + 品牌色图形 */
  .lg.svg{background:color-mix(in srgb, var(--b) 11%, #fff)}
  .lg.svg svg{display:block}
  /* 位图 logo：白底直接放，轻微内缩 */
  .lg.img img{display:block;object-fit:contain}
  /* 汇总格 */
  .lg.more{background:#eef1f6;color:#5b6472;font-size:10px;font-weight:700;font-family:ui-monospace,monospace}
  /* 长条图形：横向胶囊，避免被压成一条线 */
  .lg.img.wide{width:48px}
  .lg.img.wide img{width:40px !important;max-width:40px}
  /* 暂无可信 logo：占位，绝不用错图充数 */
  .lg.unknown{background:#f4f6f9;border-color:#e6e9ef;color:#a5adbd;font-size:12px;font-weight:700;
              border-style:dashed;font-family:ui-monospace,monospace;margin-left:0}
  .logos:hover .lg{margin-left:3px}
  .logos:hover .lg:first-child{margin-left:0}
  .logos .lg:hover{width:29px;border-radius:8px;box-shadow:0 2px 6px -1px rgba(15,23,42,.42);z-index:6}
  .logos .lg.img.wide:hover{width:52px}

  .tg{flex:none;font-size:10px;font-weight:650;border-radius:4px;padding:2px 5px;white-space:nowrap}
  .tg.cn{background:var(--cnbg);color:var(--cn)}
  .tg.gl{background:var(--glbg);color:var(--gl)}
  .tg.due{background:#fff1f4;color:var(--deal)}

  .of{margin-top:9px;display:flex;gap:8px}
  .of .bar{flex:none;width:3px;border-radius:2px;background:var(--deal);margin-top:1px}
  .of.free .bar{background:#0e9f6e}
  .of.credit .bar{background:#7c3aed}
  .of.student .bar{background:#2563eb}
  .of.limited .bar{background:var(--warn)}
  .of .tx{font-size:13px;line-height:1.5;color:#1f2937;
          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .of .tx b{color:var(--deal);font-weight:700}
  .of.free .tx b{color:#0b7a44}
  .of.credit .tx b{color:#6d28d9}

  .feats{display:flex;gap:5px;margin-top:9px;flex-wrap:wrap;overflow:hidden;max-height:22px}
  .feats span{font-size:11px;background:#f2f4f8;color:#4b5563;border-radius:4px;padding:2px 7px;white-space:nowrap}
  .feats span.more{background:#eef2ff;color:var(--brand)}

  .meta{margin-top:auto;padding-top:10px;border-top:1px solid var(--line2);display:flex;align-items:center;gap:8px;font-size:11px;color:var(--mut)}
  .meta .ok{color:var(--ok);font-weight:650}
  .meta .sp{margin-left:auto;display:flex;gap:10px;align-items:center}
  .meta .det{color:var(--brand);font-weight:650;text-decoration:none;cursor:pointer}
  .meta .det:hover{text-decoration:underline}
  .meta .go{color:var(--brand);font-weight:650;text-decoration:none}
  .meta .go:hover{text-decoration:underline}

  .g.tool{background:#fcfcfd}
  .g.tool h3{font-weight:550;color:#6b7280}
  .g.tool .of{display:none}

  .tierhead{grid-column:1/-1;display:flex;align-items:center;gap:8px;margin:2px 0 -4px;
            font-size:11.5px;color:var(--mut);position:sticky;top:112px;z-index:5;
            background:linear-gradient(var(--bg) 72%,transparent);padding:3px 0 2px}
  .tierhead .n{width:16px;height:16px;border-radius:5px;display:grid;place-items:center;font-size:9.5px;font-weight:800;color:#fff;font-family:ui-monospace,monospace;flex:none}
  .tierhead.t1 .n{background:#0e9f6e}.tierhead.t2 .n{background:#5b7cfa}
  .tierhead.t3 .n{background:#2563eb}.tierhead.t4 .n{background:#e08a2e}
  .tierhead.t5 .n{background:#94a3b8}
  .tierhead b{color:var(--ink);font-size:12px}
  .tierhead .line{flex:1;height:1px;background:var(--line)}

  /* ---------- logo 来源说明 ---------- */
  .srctable{margin-top:34px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px 22px}
  .srctable h2{font-size:15px;font-weight:750;letter-spacing:-.2px}
  .srctable .lede{font-size:12.5px;color:var(--mut);margin-top:6px;line-height:1.7}
  .srctable table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px}
  .srctable th{text-align:left;font-size:10.5px;color:var(--mut);letter-spacing:.4px;font-weight:650;
               border-bottom:1px solid var(--line);padding:6px 10px;white-space:nowrap}
  .srctable td{border-bottom:1px solid var(--line2);padding:7px 10px;vertical-align:middle}
  .srctable tr:last-child td{border-bottom:0}
  .srctable .lt{width:34px}
  .srctable .lt .lg{margin-left:0;width:22px;height:22px;border-radius:6px;border-color:var(--line)}
  .srctable code{font-family:ui-monospace,monospace;font-size:11px;color:#5b6472;background:#f4f6f9;border-radius:4px;padding:1px 5px}
  .warn{color:var(--warn);font-weight:600}
  .good{color:var(--ok);font-weight:600}

  footer{margin-top:30px;text-align:center;color:var(--mut);font-size:12px;line-height:1.9}

  /* ---------- 详情面板 ---------- */
  .panel{position:fixed;inset:0;z-index:60;display:none}
  .panel:target{display:block}
  .panel .scrim{position:absolute;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(2px)}
  .panel .box{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
    width:min(680px,calc(100vw - 40px));max-height:86vh;overflow:auto;
    background:#fff;border-radius:14px;box-shadow:0 30px 70px -20px rgba(15,23,42,.5);padding:26px 28px 24px}
  .box .close{position:absolute;top:16px;right:18px;width:30px;height:30px;border-radius:8px;
              display:grid;place-items:center;color:var(--mut);text-decoration:none;font-size:17px;line-height:1}
  .box .close:hover{background:#f2f4f8;color:var(--ink)}
  .box .dh{display:flex;gap:12px;align-items:flex-start;padding-right:36px}
  .box .dh .lg{width:38px;height:38px;border-radius:11px;margin-left:0;border-color:var(--line)}
  .box .dh .lg svg{width:24px !important;height:24px !important}
  .box .dh .lg img{width:30px !important;height:30px !important}
  .box h2{font-size:19px;font-weight:750;line-height:1.35;letter-spacing:-.3px;flex:1}
  .box .dsub{font-size:12.5px;color:var(--mut);margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .box .doffer{margin-top:16px;background:var(--dealsoft);border-left:3px solid var(--deal);border-radius:0 9px 9px 0;padding:12px 14px}
  .box .doffer .lab{font-size:10.5px;font-weight:700;color:var(--deal);letter-spacing:.4px}
  .box .doffer p{margin-top:5px;font-size:14.5px;font-weight:600;color:#9f1239;line-height:1.6}
  .box .ddesc{font-size:13.5px;color:var(--ink2);margin-top:14px;line-height:1.7}
  .box .dgrid{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);
              border-radius:9px;overflow:hidden;margin-top:16px}
  .box .dgrid .cv{background:#fff;padding:11px 13px}
  .box .dgrid .cv .k{font-size:10.5px;color:var(--mut);letter-spacing:.4px}
  .box .dgrid .cv .v{font-size:13px;margin-top:3px;color:var(--ink)}
  .box .dgrid .cv .v.ok{color:var(--ok);font-weight:650}
  .box .dmodels{margin-top:15px}
  .box .dmodels .lb{font-size:10.5px;color:var(--mut);letter-spacing:.4px}
  .box .dmodels .lgs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
  .box .dmodels .lgs .lg{margin-left:0;width:26px;height:26px;border-radius:8px;border-color:var(--line)}
  .box .dact{margin-top:20px;display:flex;gap:10px}
  .box .dact .pri{flex:1;text-align:center;background:var(--brand);color:#fff;text-decoration:none;font-weight:650;font-size:14px;padding:12px;border-radius:9px}
  .box .dact .pri:hover{background:#2d4ae8}
  .box .dact .sec{border:1px solid var(--line);color:var(--ink2);text-decoration:none;font-size:13px;padding:12px 16px;border-radius:9px;white-space:nowrap}
  .box .dact .sec:hover{border-color:#c3ceff;color:var(--brand)}
  .box .src{margin-top:14px;font-size:11.5px;color:var(--mut)}

  @media(max-width:1180px){.grid{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:700px){
    .grid{grid-template-columns:1fr;gap:9px}
    .topin{gap:12px;height:auto;padding:10px 16px;flex-wrap:wrap}
    .search{max-width:none;order:3;min-width:100%}
    .facets{top:0;position:static}
    .wrap{padding:0 16px 50px}
    .g{height:auto;min-height:160px}
    .box{padding:22px 20px 20px}
    .box .dgrid{grid-template-columns:1fr}
    .srctable{padding:16px 14px}
    .srctable .hide-sm{display:none}
  }
</style>
</head>
<body>

<div class="top">
  <div class="topin">
    <a class="brand" href="#">
      <span class="mark">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7.2-7.2A2 2 0 0 1 3 12V4.6A1.6 1.6 0 0 1 4.6 3H12a2 2 0 0 1 1.4.6l7.2 7.2a2 2 0 0 1 0 2.6Z"/>
          <path d="M12 8v6"/><path d="m9.5 11.5 2.5 2.5 2.5-2.5"/>
        </svg>
      </span>
      <span class="txt"><b>AI <em>优惠</em>聚合器</b><small>真实优惠 · 每日核验</small></span>
    </a>
    <label class="search">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8c94a6" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input placeholder="搜索模型、厂商或优惠内容…">
    </label>
    <div class="stat"><b>71</b> 条优惠 · 已核验 <b style="color:var(--ok)">23</b> · 更新 2026-09-22</div>
  </div>
</div>

<div class="facets">
  <div class="facetsin">
    <span class="f ok on">✓ 已核验 <b>23</b></span>
    <span class="fsep"></span>
    <span class="f on">全部 <b>71</b></span>
    <span class="f">国内 <b>51</b></span>
    <span class="f">国外 <b>20</b></span>
    <span class="fsep"></span>
    <span class="f">百度智能云 <b>17</b></span>
    <span class="f">智谱AI <b>12</b></span>
    <span class="f">火山引擎 <b>12</b></span>
    <span class="fsep"></span>
    <span class="f">免费额度</span>
    <span class="f">学生 / 教育</span>
    <span class="f">非营利</span>
    <span class="f">限时促销</span>
  </div>
</div>

<div class="wrap">
  <div class="rbar">
    <div>显示 <b>71</b> 条 · 按「优惠力度」从免费到付费排列 · <b>厂商 logo 为官方品牌图形</b></div>
    <div class="sortbox"><span class="on">优惠力度优先</span><span>即将截止</span><span>最近更新</span></div>
  </div>

  <div class="grid">

    <div class="tierhead t1"><span class="n">1</span><b>完全免费</b><span>不用付钱、也不用等额度到账就能用</span><span class="line"></span></div>

    <article class="g verified t1">
      <span class="tierdot"></span><span class="tiernum">1</span>
      <div class="gh">${logos(['siliconflow'])}
        <div class="gt"><h3><a href="#">硅基流动 免费模型专区</a></h3><div class="vendor">硅基流动 · API服务</div></div>
        <span class="tg cn">国内</span></div>
      <div class="of free"><span class="bar"></span><div class="tx"><b>多款模型标价 0</b> · 文本 / 向量 / 图像 / 语音</div></div>
      <div class="feats"><span>十余款模型</span><span>创建 Key 即用</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t1">
      <span class="tierdot"></span><span class="tiernum">1</span>
      <div class="gh">${logos(['elevenlabs'])}
        <div class="gt"><h3><a href="#">ElevenLabs 免费计划 每月 10000 credits</a></h3><div class="vendor">ElevenLabs · 音频语音</div></div>
        <span class="tg gl">国外</span></div>
      <div class="of free"><span class="bar"></span><div class="tx"><b>每月 10,000 credits</b> · 永久免费档</div></div>
      <div class="feats"><span>无需信用卡</span><span>每月自动重置</span><span class="more">+1</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p2">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t1">
      <span class="tierdot"></span><span class="tiernum">1</span>
      <div class="gh">${logos(['iflytek'])}
        <div class="gt"><h3><a href="#">讯飞星火 Spark Lite 轻量级大模型免费使用</a></h3><div class="vendor">科大讯飞 · 对话模型 · <span style="color:var(--warn)">logo 待你确认</span></div></div>
        <span class="tg cn">国内</span></div>
      <div class="of free"><span class="bar"></span><div class="tx"><b>Spark Lite 免费</b> · 官方文档标注支持免费使用</div></div>
      <div class="feats"><span>长期有效</span><span>创建应用即可调用</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <div class="tierhead t2"><span class="n">2</span><b>免费额度</b><span>新用户一次性赠送，够跑一段时间</span><span class="line"></span></div>

    <article class="g verified t2">
      <span class="tierdot"></span><span class="tiernum">2</span>
      <div class="gh">${logos(['tencent-cloud'])}
        <div class="gt"><h3><a href="#">腾讯混元 新用户 100 万 tokens 免费资源包</a></h3><div class="vendor">腾讯云 · 对话模型</div></div>
        <span class="tg cn">国内</span></div>
      <div class="of free"><span class="bar"></span><div class="tx"><b>100 万 tokens</b> · 多个模型共用</div></div>
      <div class="feats"><span>100 万 tokens</span><span>有效期 1 年</span><span class="more">+1</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g t2">
      <span class="tierdot"></span><span class="tiernum">2</span>
      <div class="gh">${logos(['baidu', 'deepseek', 'qwen', 'moonshotai', 'zhipu', 'ollama'])}
        <div class="gt"><h3><a href="#">百度千帆 新用户 100 万 Tokens 免费额度</a></h3>
          <div class="vendor">百度智能云 · 17 个模型共用额度 · 鼠标移到 logo 看全部</div></div>
        <span class="tg cn">国内</span></div>
      <div class="of free"><span class="bar"></span><div class="tx"><b>100 万 Tokens</b> · 有效期 3 个月</div></div>
      <div class="feats"><span>17 个模型共用</span><span>需实名认证</span></div>
      <div class="meta"><span>数据更新 2026-09-22</span>
        <span class="sp"><a class="det" href="#p3">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t2">
      <span class="tierdot"></span><span class="tiernum">2</span>
      <div class="gh">${logos(['moonshotai'])}
        <div class="gt"><h3><a href="#">Kimi 开放平台 新用户 15 元代金券</a></h3><div class="vendor">月之暗面 · API服务</div></div>
        <span class="tg cn">国内</span></div>
      <div class="of credit"><span class="bar"></span><div class="tx"><b>15 元代金券</b> · 注册即赠</div></div>
      <div class="feats"><span>15 元代金券</span><span>需实名认证</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t2">
      <span class="tierdot"></span><span class="tiernum">2</span>
      <div class="gh">${logos(['volcengine'])}
        <div class="gt"><h3><a href="#">火山方舟 豆包全系模型 50 万 tokens 免费额度</a></h3><div class="vendor">火山引擎 · 对话模型</div></div>
        <span class="tg cn">国内</span></div>
      <div class="of free"><span class="bar"></span><div class="tx"><b>50 万 tokens</b> · 豆包全系模型</div></div>
      <div class="feats"><span>50 万 tokens</span><span>豆包全系模型</span><span class="more">+1</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t2">
      <span class="tierdot"></span><span class="tiernum">2</span>
      <div class="gh">${logos(['alibabacloud'])}
        <div class="gt"><h3><a href="#">阿里云百炼 新人免费额度</a></h3><div class="vendor">阿里云 · API服务</div></div>
        <span class="tg cn">国内</span></div>
      <div class="of free"><span class="bar"></span><div class="tx"><b>新用户免费额度</b> · 开通即得</div></div>
      <div class="feats"><span>新用户专享</span><span>需实名认证</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t2">
      <span class="tierdot"></span><span class="tiernum">2</span>
      <div class="gh">${logos(['sensetime'])}
        <div class="gt"><h3><a href="#">商汤日日新 Token Plan 首月限时免费</a></h3><div class="vendor">商汤科技 · API服务</div></div>
        <span class="tg cn">国内</span></div>
      <div class="of free"><span class="bar"></span><div class="tx"><b>首月免费</b> · 每 5 小时 1500 次调用</div></div>
      <div class="feats"><span>首月免费</span><span>无门槛配额</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t2">
      <span class="tierdot"></span><span class="tiernum">2</span>
      <div class="gh">${logos(['zhipu'])}
        <div class="gt"><h3><a href="#">智谱AI 新用户 2000 万 Tokens 资源包</a></h3><div class="vendor">智谱AI · API服务</div></div>
        <span class="tg cn">国内</span></div>
      <div class="of free"><span class="bar"></span><div class="tx"><b>2000 万 Tokens</b> · 注册即送</div></div>
      <div class="feats"><span>含 120 次图像视频</span><span>需实名认证</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <div class="tierhead t3"><span class="n">3</span><b>身份优惠</b><span>学生 / 教师 / 非营利 / 初创 —— 拿到资格也不花钱</span><span class="line"></span></div>

    <article class="g verified t3">
      <span class="tierdot"></span><span class="tiernum">3</span>
      <div class="gh">${logos(['githubcopilot'])}
        <div class="gt"><h3><a href="#">GitHub Copilot 学生免费（Copilot Student）</a></h3><div class="vendor">GitHub · 编程开发</div></div>
        <span class="tg gl">国外</span></div>
      <div class="of student"><span class="bar"></span><div class="tx"><b>全部付费功能免费</b></div></div>
      <div class="feats"><span>全部付费功能免费</span><span>需学籍验证</span><span class="more">+1</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t3">
      <span class="tierdot"></span><span class="tiernum">3</span>
      <div class="gh">${logos(['google'])}
        <div class="gt"><h3><a href="#">Google AI Pro 学生免费 12 个月（含 Gemini 高级版）</a></h3><div class="vendor">Google · 对话模型</div></div>
        <span class="tg gl">国外</span></div>
      <div class="of student"><span class="bar"></span><div class="tx"><b>免费 12 个月</b> · 价值 $19.99/月</div></div>
      <div class="feats"><span>免费 12 个月</span><span>价值 $19.99/月</span><span class="more">+1</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t3">
      <span class="tierdot"></span><span class="tiernum">3</span>
      <div class="gh">${logos(['notion'])}
        <div class="gt"><h3><a href="#">Notion 教育版 学生与教师免费 Plus</a></h3><div class="vendor">Notion · 办公效率</div></div>
        <span class="tg gl">国外</span></div>
      <div class="of student"><span class="bar"></span><div class="tx"><b>免费 Plus 计划</b> · 含无限存储、30 天版本历史</div></div>
      <div class="feats"><span>免费 Plus</span><span>学校须在 WHED</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t3">
      <span class="tierdot"></span><span class="tiernum">3</span>
      <div class="gh">${logos(['microsoft'])}
        <div class="gt"><h3><a href="#">Microsoft Azure for Students 学生免费 100 美元额度</a></h3><div class="vendor">Microsoft · API服务</div></div>
        <span class="tg gl">国外</span></div>
      <div class="of student"><span class="bar"></span><div class="tx"><b>$100 额度</b> · 可用于 Azure OpenAI</div></div>
      <div class="feats"><span>无需信用卡</span><span>12 个月可续</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t3">
      <span class="tierdot"></span><span class="tiernum">3</span>
      <div class="gh">${logos(['aws'])}
        <div class="gt"><h3><a href="#">AWS Activate 初创公司最高 20 万美元云 credits</a></h3><div class="vendor">AWS · API服务</div></div>
        <span class="tg gl">国外</span></div>
      <div class="of credit"><span class="bar"></span><div class="tx"><b>最高 $200,000</b> AWS Activate Credits</div></div>
      <div class="feats"><span>最高 $200,000</span><span>可用于 Bedrock</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t3">
      <span class="tierdot"></span><span class="tiernum">3</span>
      <div class="gh">${logos(['figma'])}
        <div class="gt"><h3><a href="#">Figma for Education 学生与教师免费</a></h3><div class="vendor">Figma · 设计创意</div></div>
        <span class="tg gl">国外</span></div>
      <div class="of student"><span class="bar"></span><div class="tx"><b>Figma + FigJam 免费</b></div></div>
      <div class="feats"><span>含课堂工具</span><span>长期有效</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <div class="tierhead t4"><span class="n">4</span><b>折扣促销</b><span>要花钱，但比标准价便宜</span><span class="line"></span></div>

    <article class="g verified t4">
      <span class="tierdot"></span><span class="tiernum">4</span>
      <div class="gh">${logos(['zhipu'])}
        <div class="gt"><h3><a href="#">智谱AI GLM-5.3-Flash 限时五折</a></h3><div class="vendor">智谱AI · API服务</div></div>
        <span class="tg cn">国内</span></div>
      <div class="of limited"><span class="bar"></span><div class="tx"><b>限时五折</b> · 输入 0.4 元 / 输出 1.4 元</div></div>
      <div class="feats"><span>限时五折</span><span>缓存命中 0.115 元</span></div>
      <div class="meta"><span>数据更新 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t4">
      <span class="tierdot"></span><span class="tiernum">4</span>
      <div class="gh">${logos(['anthropic'])}
        <div class="gt"><h3><a href="#">Anthropic Claude 非营利组织折扣</a></h3><div class="vendor">Anthropic · 对话模型</div></div>
        <span class="tg gl">国外</span></div>
      <div class="of"><span class="bar"></span><div class="tx"><b>Team $8 / Enterprise $10</b> 每用户每月</div></div>
      <div class="feats"><span>非营利折扣价</span><span>最少 2 席</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g verified t4">
      <span class="tierdot"></span><span class="tiernum">4</span>
      <div class="gh">${logos(['stepfun'])}
        <div class="gt"><h3><a href="#">阶跃星辰 StepAudio 3 语音大模型限时免费</a></h3><div class="vendor">阶跃星辰 · 音频语音</div></div>
        <span class="tg due">剩 5 天</span></div>
      <div class="of limited"><span class="bar"></span><div class="tx"><b>限时免费</b> · 输入/输出价格均标注免费</div></div>
      <div class="feats"><span>两个语音模型</span><span>截止 2026-09-27</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <div class="tierhead t5"><span class="n">5</span><b>付费为主</b><span>没有免费档，或免费档已取消</span><span class="line"></span></div>

    <article class="g t5">
      <span class="tierdot"></span><span class="tiernum">5</span>
      <div class="gh">${logos(['runway'])}
        <div class="gt"><h3><a href="#">Runway 免费计划 一次性 125 credits</a></h3><div class="vendor">Runway · 视频</div></div>
        <span class="tg gl">国外</span></div>
      <div class="of"><span class="bar"></span><div class="tx"><b>一次性 125 credits</b> · 用完需订阅</div></div>
      <div class="feats"><span>一次性额度</span><span>含 5GB 存储</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g t5">
      <span class="tierdot"></span><span class="tiernum">5</span>
      <div class="gh">${logos(['groq'])}
        <div class="gt"><h3><a href="#">Groq Cloud 免费额度</a></h3><div class="vendor">Groq · API服务</div></div>
        <span class="tg gl">国外</span></div>
      <div class="of"><span class="bar"></span><div class="tx"><b>免费额度 → 按 Token 付费</b></div></div>
      <div class="feats"><span>OpenAI 兼容</span><span>LPU 加速</span></div>
      <div class="meta"><span>数据更新 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

    <article class="g t5">
      <span class="tierdot"></span><span class="tiernum">5</span>
      <div class="gh">${logos(['baichuan'])}
        <div class="gt"><h3><a href="#">百川智能 海纳百川计划</a></h3><div class="vendor">百川智能 · 对话模型</div></div>
        <span class="tg cn">国内</span></div>
      <div class="of"><span class="bar"></span><div class="tx"><b>免费使用 M3Plus API</b> · 需申请审核</div></div>
      <div class="feats"><span>免费 API</span><span>需审核</span></div>
      <div class="meta"><span class="ok">✓ 已核验 2026-09-22</span>
        <span class="sp"><a class="det" href="#p1">详情</a><a class="go" href="#">获取 →</a></span></div>
    </article>

  </div>

  <!-- ---------- logo 来源说明：证明"这是真 logo" ---------- -->
  <section class="srctable">
    <h2>厂商 logo 来源（可复核）</h2>
    <p class="lede">
      全部为<strong>厂商官方品牌图形</strong>，无一是从标题里取字拼的。品牌图形优先用矢量 SVG（随样稿内联，
      不请求第三方）；只有品牌图形库确实没有的国内厂商，才取<strong>厂商官网自己发布的图标文件</strong>下载到本地。
      不热链任何 CDN——避免把访客 IP 交给第三方，也不怕对方改文件。
    </p>
    <table>
      <thead><tr>
        <th class="lt"></th><th>厂商</th><th>来源方式</th><th class="hide-sm">具体来源</th><th>质量</th>
      </tr></thead>
      <tbody>
        <tr><td class="lt">${tile('githubcopilot', 22, 6)}</td><td>GitHub / Copilot</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code> 官方品牌路径</td><td class="good">矢量，任意缩放</td></tr>
        <tr><td class="lt">${tile('google', 22, 6)}</td><td>Google</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('anthropic', 22, 6)}</td><td>Anthropic / Claude</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('notion', 22, 6)}</td><td>Notion</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('figma', 22, 6)}</td><td>Figma</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('elevenlabs', 22, 6)}</td><td>ElevenLabs</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('microsoft', 22, 6)}</td><td>Microsoft</td>
          <td>矢量重建</td><td class="hide-sm">官方四色方块（几何极简，可直接重建）</td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('aws', 22, 6)}</td><td>AWS</td>
          <td>官网文件</td><td class="hide-sm"><code>a0.awsstatic.com</code> touch-icon 144×144</td><td class="good">高清</td></tr>
        <tr><td class="lt">${tile('baidu', 22, 6)}</td><td>百度智能云</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('alibabacloud', 22, 6)}</td><td>阿里云百炼</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('tencent-cloud', 22, 6)}</td><td>腾讯云 · 混元</td>
          <td>官网文件</td><td class="hide-sm"><code>cloudcache.tencent-cloud.com</code> 300×300</td><td class="good">高清</td></tr>
        <tr><td class="lt">${tile('volcengine', 22, 6)}</td><td>火山引擎</td>
          <td>官网文件</td><td class="hide-sm"><code>portal.volccdn.com</code> 192×192</td><td class="good">高清</td></tr>
        <tr><td class="lt">${tile('siliconflow', 22, 6)}</td><td>硅基流动</td>
          <td>官网文件</td><td class="hide-sm"><code>siliconflow.cn/logo-new.svg</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('stepfun', 22, 6)}</td><td>阶跃星辰</td>
          <td>官网文件</td><td class="hide-sm"><code>stepfun.com/step_favicon.svg</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('groq', 22, 6)}</td><td>Groq</td>
          <td>官网文件</td><td class="hide-sm"><code>groq.com/favicon.svg</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('baichuan', 22, 6)}</td><td>百川智能</td>
          <td>官网文件</td><td class="hide-sm"><code>baichuan-ai.com</code> apple-touch-icon 180×180</td><td class="good">高清</td></tr>
        <tr><td class="lt">${tile('zhipu', 22, 6)}</td><td>智谱AI</td>
          <td>官网文件</td><td class="hide-sm"><code>bigmodel.cn</code> favicon 90×90</td><td>够用</td></tr>
        <tr><td class="lt">${tile('runway', 22, 6)}</td><td>Runway</td>
          <td>官网文件</td><td class="hide-sm"><code>runwayml.com</code> icon 320×320</td><td class="good">高清</td></tr>
        <tr><td class="lt">${tile('moonshotai', 22, 6)}</td><td>月之暗面 Kimi</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('deepseek', 22, 6)}</td><td>DeepSeek</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('qwen', 22, 6)}</td><td>Qwen</td>
          <td>品牌矢量</td><td class="hide-sm"><code>simple-icons</code></td><td class="good">矢量</td></tr>
        <tr><td class="lt">${tile('sensetime', 22, 6)}</td><td>商汤科技</td>
          <td>官网文件</td><td class="hide-sm"><code>sensetime.com</code> 方形图标 120×184</td><td class="warn">偏小，建议找高清版</td></tr>
        <tr><td class="lt">${tile('iflytek', 22, 6)}</td><td>科大讯飞</td>
          <td>官网文件</td><td class="hide-sm"><code>xfyun.cn/static/favicon.ico</code> 32×32</td><td class="warn">偏小（32px），颜色待人工确认</td></tr>
      </tbody>
    </table>
    <p class="lede" style="margin-top:14px">
      <strong>待你确认两点：</strong>① 科大讯飞的图标只有 32px favicon 可用，且解码出来偏青色——需要人工核对是否为其现行品牌图形；
      ② 商汤的方形图标偏小、<code>logo-frame10.png</code> 是 3.5:1 的长条词标不适合方块位。这两家建议直接找品牌方要矢量素材。
    </p>
  </section>

  <footer>
    本站不收录付费推广位 · 排序与推荐理由不出售<br>
    数据每日 08:00 / 20:00 自动更新 · 最后更新 2026-09-22 19:20 · 所有厂商 logo 版权归各厂商所有，仅作标识用途
  </footer>
</div>

<!-- ============ 详情面板 ============ -->
<div class="panel" id="p1">
  <a class="scrim" href="#"></a>
  <div class="box">
    <a class="close" href="#" aria-label="关闭">✕</a>
    <div class="dh">${tile('githubcopilot', 38, 11)}<h2>GitHub Copilot 学生免费（Copilot Student）</h2></div>
    <div class="dsub"><span>GitHub</span><span>·</span><span>编程开发</span><span>·</span>
      <span style="color:var(--ok);font-weight:650">✓ 已核验 2026-09-22</span></div>
    <div class="doffer"><div class="lab">学生免费 · 档位 3 身份优惠</div>
      <p>通过 GitHub Education 验证的在校学生可免费使用 Copilot 全部付费功能（Copilot Student）。</p></div>
    <p class="ddesc">在 github.com/settings/education/benefits 完成学籍验证后激活；验证通过与权益生效是两个步骤，可能需数天。</p>
    <div class="dgrid">
      <div class="cv"><div class="k">适用条件</div><div class="v">经 GitHub Education 验证的在校学生</div></div>
      <div class="cv"><div class="k">有效期</div><div class="v">长期有效（每月重新评估资格）</div></div>
      <div class="cv"><div class="k">定价模式</div><div class="v">免费</div></div>
      <div class="cv"><div class="k">核验状态</div><div class="v ok">✓ 已核验 2026-09-22</div></div>
    </div>
    <div class="dact"><a class="pri" href="#">前往官方页面领取 →</a><a class="sec" href="#">复制链接</a></div>
    <div class="src">来源：Curated · 首次收录 2026-09-21 · 最近采集 2026-09-22</div>
  </div>
</div>

<div class="panel" id="p2">
  <a class="scrim" href="#"></a>
  <div class="box">
    <a class="close" href="#" aria-label="关闭">✕</a>
    <div class="dh">${tile('elevenlabs', 38, 11)}<h2>ElevenLabs 免费计划 每月 10000 credits</h2></div>
    <div class="dsub"><span>ElevenLabs</span><span>·</span><span>音频语音</span><span>·</span>
      <span style="color:var(--ok);font-weight:650">✓ 已核验 2026-09-22</span></div>
    <div class="doffer"><div class="lab">免费额度 · 档位 1 完全免费</div>
      <p>Free 计划 $0，每月 10,000 credits，可用于 TTS、语音克隆、Dubbing 等全部产品。</p></div>
    <p class="ddesc">注册即得免费额度，无需付费；免费计划不参与 credits 结转。</p>
    <div class="dgrid">
      <div class="cv"><div class="k">适用条件</div><div class="v">所有新用户</div></div>
      <div class="cv"><div class="k">有效期</div><div class="v">长期有效的免费档</div></div>
      <div class="cv"><div class="k">价格阶梯</div><div class="v">免费档 $0 → 付费档</div></div>
      <div class="cv"><div class="k">核验状态</div><div class="v ok">✓ 已核验 2026-09-22</div></div>
    </div>
    <div class="dact"><a class="pri" href="#">前往官方页面领取 →</a><a class="sec" href="#">复制链接</a></div>
    <div class="src">来源：Curated · 最近采集 2026-09-22</div>
  </div>
</div>

<div class="panel" id="p3">
  <a class="scrim" href="#"></a>
  <div class="box">
    <a class="close" href="#" aria-label="关闭">✕</a>
    <div class="dh">${tile('baidu', 38, 11)}<h2>百度千帆 新用户 100 万 Tokens 免费额度</h2></div>
    <div class="dsub"><span>百度智能云</span><span>·</span><span>API服务</span><span>·</span>
      <span>数据更新 2026-09-22</span></div>
    <div class="doffer"><div class="lab">新用户免费额度 · 档位 2 免费额度</div>
      <p>首次开通千帆即自动发放：赠送 100 万 Tokens，有效期 3 个月。</p></div>
    <p class="ddesc">仅可抵扣预置模型在线推理消耗的 Tokens；需完成实名认证。</p>
    <div class="dmodels">
      <div class="lb">覆盖模型（17）· 共用同一份额度</div>
      <div class="lgs">${['baidu', 'deepseek', 'qwen', 'moonshotai', 'ollama'].map((k) => tile(k, 26, 8)).join('')}
        <span class="lg more" style="margin-left:0;width:26px;height:26px;border-radius:8px">+7</span></div>
    </div>
    <div class="dgrid">
      <div class="cv"><div class="k">适用条件</div><div class="v">千帆平台新用户（需实名认证）</div></div>
      <div class="cv"><div class="k">有效期</div><div class="v">自开通起 3 个月</div></div>
      <div class="cv"><div class="k">额度</div><div class="v">100 万 Tokens，17 个模型共用</div></div>
      <div class="cv"><div class="k">核验状态</div><div class="v">数据更新 2026-09-22（非人工核验）</div></div>
    </div>
    <div class="dact"><a class="pri" href="#">前往官方页面领取 →</a><a class="sec" href="#">复制链接</a></div>
    <div class="src">来源：百度千帆 · 同一份额度覆盖 17 个模型，不是每个模型各 100 万</div>
  </div>
</div>

</body>
</html>
`;

fs.writeFileSync(OUT, HTML, 'utf8');
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log('\n✅ 已生成 ' + path.relative(process.cwd(), OUT) + '（' + kb + ' KB，logo 全部内联，自包含）');
