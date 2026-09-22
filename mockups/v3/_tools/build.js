#!/usr/bin/env node
/**
 * mockups/v3 生成器（一次性工具，与 mockups/_tools/build-009.js 同一路数）。
 *
 * 为什么用生成而不是手写：三套方案的 demo 要用**真实数据与真实卡片结构**，
 * 手抄 60 张卡既慢又容易与线上不一致。这里直接从**构建产物** `dist/index.html`
 * 里把每张卡的渲染结果解析出来（含构建期算好的厂商 logo key、档位、特性 chip、
 * 核验状态），再与 `dist/deals.json` 按标题对齐拿全字段——所以 demo 里的卡片
 * 与线上逐字段一致，只是套用了提案里的 token 层与组件层。
 *
 * 用法：node mockups/v3/_tools/build.js     （先跑过 npm run build）
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..', '..', '..');
const V3 = path.join(ROOT, 'mockups', 'v3');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('缺少 dist/index.html，请先执行：npm run build');
  process.exit(1);
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const store = JSON.parse(fs.readFileSync(path.join(DIST, 'deals.json'), 'utf8'));
const deals = store.deals || store;
const byTitle = new Map(deals.map(d => [String(d.title).trim(), d]));

/* ---------- 从构建产物里解析卡片 ---------- */

const $ = cheerio.load(html);
const cards = [];

$('article.g').each((_, el) => {
  const node = $(el);
  const cls = node.attr('class') || '';
  const tier = Number(node.attr('data-tier') || (cls.match(/\bt([1-5])\b/) || [])[1] || 0);
  const title = node.find('.gt h3').text().trim();
  const deal = byTitle.get(title) || null;

  const logos = [];
  node.find('.logos .lg').each((__, lg) => {
    const tile = $(lg);
    const key = tile.attr('data-logo');
    if (key) {
      logos.push({ type: 'logo', key });
    } else if (tile.hasClass('more')) {
      logos.push({ type: 'more', text: tile.text().trim() });
    } else {
      logos.push({ type: 'text', text: tile.text().trim(), style: tile.attr('style') || '' });
    }
  });

  const tags = [];
  node.find('.gh .tg').each((__, tg) => {
    const t = $(tg);
    const kind = t.hasClass('cn') ? 'cn' : t.hasClass('gl') ? 'gl' : t.hasClass('due') ? 'due' : 'zh';
    tags.push({ kind, text: t.text().trim() });
  });

  cards.push({
    tier,
    title,
    href: node.find('.gt h3 a').attr('href') || (deal && deal.url) || '#',
    vendorLine: node.find('.vendor').text().trim(),
    offerHtml: node.find('.of .tx').html() || '',
    offerPlain: node.hasClass('tool'),
    feats: node.find('.feats span').map((__, s) => $(s).text().trim()).get(),
    metaText: node.find('.meta').clone().children().remove().end().text().replace(/\s+/g, ' ').trim(),
    verified: node.hasClass('verified'),
    tool: node.hasClass('tool'),
    cta: node.find('.meta .go').text().trim() || '获取 →',
    logos,
    tags,
    deal
  });
});

console.log(`从 dist/index.html 解析到 ${cards.length} 张卡片，其中 ${cards.filter(c => c.deal).length} 张能对上 deals.json`);

/* ---------- 选一批代表性卡片（各档位、国内/国外、折叠卡、工具卡） ---------- */

const pick = (predicate, n) => cards.filter(predicate).slice(0, n);
const selected = [
  ...pick(c => c.tier === 1 && c.logos.some(l => l.type === 'logo'), 3),
  ...pick(c => c.tier === 2 && (c.deal && c.deal.region === 'cn'), 3),
  ...pick(c => c.tier === 2 && (c.deal && c.deal.region === 'global'), 2),
  ...pick(c => c.tier === 3, 3),
  ...pick(c => c.tier === 4, 2),
  ...pick(c => c.tool, 2)
];
const seen = new Set();
const slice = selected.filter(c => (seen.has(c.title) ? false : (seen.add(c.title), true)));
console.log(`选用 ${slice.length} 张：${slice.map(c => `t${c.tier}`).join(' ')}`);

/* ---------- 路径：生成时写占位符，落盘时按输出深度解析 ----------
   踩过的坑：CSS 与 logo 的相对路径按「方案子目录」写死（../shared、../../assets/logos/）时，
   顶层 index.html 的样式表 404 —— 页面退化成浏览器默认样式，而**对比度检查照样是绿的**
   （默认黑字白底 21:1）。结构检查（断链）才抓得住这类问题。
   改成占位符 + 落盘时解析，就不会因为「哪一页在第几层」而写错。 */
const CSS = file => `__CSS:${file}__`;
const LOGO = file => `__LOGO:${file}__`;
const HOME = '__HOME__';

/* ---------- 渲染片段 ---------- */

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const logoHtml = c =>
  c.logos
    .map(l => {
      if (l.type === 'logo') {
        return `<span class="lg"><img src="../../assets/logos/${l.key}.svg" alt="" onerror="this.replaceWith(document.createTextNode('${esc(l.key).slice(0, 2).toUpperCase()}'))"></span>`;
      }
      if (l.type === 'more') return `<span class="lg">${esc(l.text)}</span>`;
      return `<span class="lg" style="${esc(l.style)}">${esc(l.text)}</span>`;
    })
    .join('');

// logo 文件可能是 .png，img 的 onerror 兜底会退成首字母块（静态稿里允许这一处内联兜底）
const logoSrc = key => {
  for (const ext of ['svg', 'png']) {
    if (fs.existsSync(path.join(ROOT, 'assets', 'logos', `${key}.${ext}`))) return LOGO(`${key}.${ext}`);
  }
  return null;
};

const logoHtmlReal = c =>
  c.logos
    .map(l => {
      if (l.type === 'logo') {
        const src = logoSrc(l.key);
        const fallback = esc((l.key || '').slice(0, 2).toUpperCase());
        if (!src) return `<span class="lg">${fallback}</span>`;
        return `<span class="lg"><img src="${src}" alt="" loading="lazy" onerror="this.parentNode.textContent='${fallback}'"></span>`;
      }
      if (l.type === 'more') return `<span class="lg">${esc(l.text)}</span>`;
      return `<span class="lg text" style="${esc(l.style)}">${esc(l.text)}</span>`;
    })
    .join('');

const tagHtml = c => c.tags.map(t => `<span class="tg ${t.kind}">${esc(t.text)}</span>`).join('');

const cardHtml = (c, opts = {}) =>
  `<article class="g" data-tier="${c.tier}" data-verified="${c.verified ? 1 : 0}"${opts.tool ? ' data-tool="1"' : ''}>` +
  `<span class="tiernum" aria-hidden="true">${c.tier}</span>` +
  `<div class="gh"><div class="logos">${logoHtmlReal(c)}</div>` +
  `<div class="gt"><h3>${opts.detail ? `<a href="#">${esc(c.title)}</a>` : `<a href="${esc(opts.titleHref || c.href)}">${esc(c.title)}</a>`}</h3>` +
  (c.vendorLine ? `<div class="vendor">${esc(c.vendorLine)}</div>` : '') +
  `</div>${tagHtml(c)}</div>` +
  `<div class="of${c.offerPlain ? ' plain' : ''}"><span class="bar"></span><div class="tx">${c.offerHtml}</div></div>` +
  (c.feats.length ? `<div class="feats">${c.feats.slice(0, 3).map(f => `<span>${esc(f)}</span>`).join('')}</div>` : '') +
  `<div class="meta">${esc(c.metaText)}<span class="sp">` +
  (opts.correction ? `<a class="cta ghost" href="#">信息有误</a>` : '') +
  (opts.fav ? `<button class="cta ghost" type="button">收藏</button><button class="cta ghost" type="button">对比</button>` : '') +
  `<a class="cta" href="${esc(c.href)}">${esc(c.cta)}</a></span></div>` +
  `</article>`;

/** 行视图里只放第一个 logo 块（行高 46px，塞不下 logo 簇） */
const firstLogoHtml = c => {
  const l = c.logos[0];
  if (!l) return '<span class="lg">·</span>';
  if (l.type === 'logo') {
    const src = logoSrc(l.key);
    const fallback = esc((l.key || '').slice(0, 2).toUpperCase());
    return src ? `<span class="lg"><img src="${src}" alt="" loading="lazy" onerror="this.parentNode.textContent='${fallback}'"></span>`
               : `<span class="lg">${fallback}</span>`;
  }
  if (l.type === 'more') return `<span class="lg">${esc(l.text)}</span>`;
  return `<span class="lg text" style="${esc(l.style)}">${esc(l.text)}</span>`;
};

const rowHtml = c =>
  `<div class="row" data-tier="${c.tier}">` +
  `<span class="tiernum" aria-hidden="true">${c.tier}</span>` +
  firstLogoHtml(c) +
  `<span class="t">${esc(c.title)}</span>` +
  `<span class="o">${String(c.offerHtml).replace(/<[^>]+>/g, '').slice(0, 52)}</span>` +
  `<span class="v">${esc(c.vendorLine.split(' · ')[0] || '')}</span>` +
  `<span class="v">${esc(c.feats[0] || c.tags.map(t => t.text)[0] || '')}</span>` +
  `<span class="when">${c.verified ? '已核验' : '数据更新'}</span>` +
  `</div>`;

/* ---------- 页面外壳 ---------- */

const shell = ({ title, nav, body, scripts = '', note = '' }) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${CSS('tokens.css')}">
<link rel="stylesheet" href="${CSS('base.css')}">
<style>
  .vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .demohead { max-width: var(--maxW); margin: 0 auto; padding: var(--s4) var(--s4) 0; }
  .demohead h1 { font-size: 22px; font-weight: 700; }
  .demohead p { color: var(--mut); font-size: var(--fs-md); margin-top: 6px; max-width: 900px; }
  .demohead p b { color: var(--ink); }
  .anno { display: inline-block; font-size: var(--fs-xs); color: var(--mut); border: 1px dashed var(--line); border-radius: 999px; padding: 2px 9px; margin-right: 6px; }
</style>
</head>
<body>
<a class="skip" href="#main">跳到主要内容</a>
<input class="vh" type="radio" name="theme" id="theme-auto" checked>
<input class="vh" type="radio" name="theme" id="theme-light">
<input class="vh" type="radio" name="theme" id="theme-dark">
<header class="top">
  <div class="topin">
    <a class="brand" href="${HOME}"><span class="mark">AI</span><span class="btxt"><b>AI 优惠<em>聚合器</em></b><small>MOCKUP v3 · ${esc(nav)}</small></span></a>
    <div class="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="搜索模型、厂商或优惠…" aria-label="搜索"></div>
    <div class="seg" role="group" aria-label="主题">
      <label for="theme-auto">跟随系统</label><label for="theme-light">浅色</label><label for="theme-dark">深色</label>
    </div>
    <div class="topstat"><b>80</b> 条优惠 · 已核验 32</div>
  </div>
</header>
${note ? `<p class="note">${note}</p>` : ''}
<main id="main" class="wrap">
${body}
</main>
<footer><div class="wrap" style="padding-bottom:0">静态展示稿 · 数据取自 <code>dist/deals.json</code> 的真实条目 · 只有 CSS，没有交互脚本（仅图片加载失败时有一处内联兜底）<br>
排序与推荐理由不出售 · 全部链接指向厂商官方页</div></footer>
${scripts}
</body>
</html>
`;

const write = (rel, content) => {
  // 输出在第几层：'index.html' 是 0 层，'A-conservative/index.html' 是 1 层
  const depth = rel.split('/').length - 1;
  const up = n => '../'.repeat(n);
  const resolved = content
    .replace(/__CSS:([^_]+)__/g, (_, file) => `${up(depth)}shared/${file}`)
    .replace(/__LOGO:([^_]+)__/g, (_, file) => `${up(depth + 2)}assets/logos/${file}`)
    .replace(/__HOME__/g, `${up(depth)}index.html`);
  const leftover = resolved.match(/__[A-Z]+[:_][^_]*__/);
  if (leftover) throw new Error(`${rel} 里有未解析的占位符：${leftover[0]}`);
  const file = path.join(V3, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, resolved, 'utf8');
  console.log(`  ✓ ${path.relative(ROOT, file)}`);
};

/* ============================ A · 保守 ============================ */

const aCards = slice.slice(0, 8);
write(
  'A-conservative/index.html',
  shell({
    title: '方案 A · 保守 — 只动视觉层',
    nav: 'A 保守',
    note:
      '这一页要看的只有一件事：<b>同一批卡片，换掉 token 层之后是什么样</b>。' +
      '右上角切「跟随系统 / 浅色 / 深色」——深色不是把浅色反过来，而是底 / 面 / 发丝环三件套（见 <code>shared/tokens.css</code> 注释）。' +
      '缩到 760px 以下还能看手机端。',
    body: `
<section class="demohead" style="padding:0 0 var(--s3)">
  <h1>方案 A · 保守：视觉层重做，信息架构与 URL 一个都不碰</h1>
  <p>卡片密度、筛选、折叠、链接指向全部保持线上现状；改的只有颜色、字阶、圆角、层级与动效。下面是同一批真实数据。</p>
</section>
<div class="band t1"><span class="n">1</span><b>完全免费</b><span class="line"></span><span>扫一眼就知道这一档不用掏钱</span></div>
<div class="grid">${aCards.slice(0, 3).map(c => cardHtml(c, { correction: true })).join('')}</div>
<div class="band t2"><span class="n">2</span><b>免费额度</b><span class="line"></span><span>新用户额度 / 免费模型</span></div>
<div class="grid">${aCards.slice(3, 6).map(c => cardHtml(c, { correction: true })).join('')}</div>
<div class="band t3"><span class="n">3</span><b>身份优惠</b><span class="line"></span><span>学生 / 教师 / 非营利</span></div>
<div class="grid">${aCards.slice(6, 8).map(c => cardHtml(c, { correction: true })).join('')}</div>

<section class="demohead" style="padding:var(--s4) 0 0">
  <h1 style="font-size:18px">token 对照（左边是线上现值，右边是提案值）</h1>
  <p>对比度是按 WCAG 相对亮度公式算的（纯色背景）：<b>--mut 这一处从 2.84:1 提到 4.50:1</b>，而它承载的是 11px 的元信息文字——线上实测 400 个文本节点里有 100 条不达标，主要就是它。</p>
</section>
<div class="tokens">
  <div class="sw"><div class="chip" style="background:#8c94a6"></div><div class="n">--mut 现值 #8c94a6</div><div class="m">--bg 上 2.84:1 ✗ · --card 上 3.04:1 ✗</div></div>
  <div class="sw"><div class="chip" style="background:#6b7280"></div><div class="n">--mut 提案 #6b7280</div><div class="m">--bg 上 4.50:1 ✓ · --card 上 4.83:1 ✓</div></div>
  <div class="sw"><div class="chip" style="background:#0e9f6e"></div><div class="n">档位 1 · 完全免费</div><div class="m">亮色 #0e9f6e → 暗色 #3ddc97（降饱和提亮）</div></div>
  <div class="sw"><div class="chip" style="background:#7c3aed"></div><div class="n">档位 2 · 免费额度</div><div class="m">亮色 #7c3aed → 暗色 #b18cff</div></div>
  <div class="sw"><div class="chip" style="background:#2563eb"></div><div class="n">档位 3 · 身份优惠</div><div class="m">亮色 #2563eb → 暗色 #7aa2ff</div></div>
  <div class="sw"><div class="chip" style="background:#c2410c"></div><div class="n">档位 4 · 折扣促销</div><div class="m">亮色 #c2410c → 暗色 #ffab6b</div></div>
</div>

<section class="demohead" style="padding:var(--s4) 0 0">
  <h1 style="font-size:18px">动效与层级</h1>
  <p>
    <span class="anno">--t-fast 100ms</span><span class="anno">--t-base 150ms</span><span class="anno">--t-slow 250ms</span>
    <span class="anno">--e-std cubic-bezier(.4,0,.2,1)</span><span class="anno">--e-out cubic-bezier(.22,1,.36,1)</span>
    时长与曲线都取自标杆实测里出现次数最多的取值（Tailwind 默认 150ms 跨站最多；linear 用 100ms；openrouter 用 expo-out 250ms 做进场）。
    把鼠标放到卡片上：<b>边框消失、换成 1px 发丝环 + 微投影</b>，而不是现在的 18px 扩散投影——高密度网格里相邻卡片不会被互相压暗。
    系统开启「减少动态效果」后，这里的过渡会全部停掉。
  </p>
</section>`
  })
);

/* ============================ B · 均衡 ============================ */

const bCards = slice.slice(0, 12);

/**
 * 紧凑视图 demo。生成两份：默认卡片态（与线上一致）与默认行态——
 * 后者是给「一眼看完紧凑视图」和**用仪器量密度**用的（隐藏元素量不到）。
 */
const denseBody = rowsDefault => `
<section class="demohead" style="padding:0 0 var(--s3)">
  <h1>方案 B · 均衡：卡片 ↔ 紧凑行，两种视图切换</h1>
  <p>信息一条都不少，只是排布方式不同。切到紧凑视图后，档位号、厂商 logo、标题、优惠摘要、适用条件、核验状态、CTA 仍在同一行里。</p>
</section>

<input class="vh" type="radio" name="view" id="view-cards"${rowsDefault ? '' : ' checked'}>
<input class="vh" type="radio" name="view" id="view-rows"${rowsDefault ? ' checked' : ''}>
<style>
  #view-cards:checked ~ main .only-rows, #view-rows:checked ~ main .only-cards { display: none; }
</style>
<div class="note" style="padding:0 0 var(--s3)">
  <label for="view-cards" class="f" style="cursor:pointer">卡片视图（首屏 9 张）</label>
  <label for="view-rows" class="f" style="cursor:pointer">紧凑视图（首屏 16 行）</label>
</div>

<div class="only-cards">
  <div class="grid">${bCards.slice(0, 9).map(c => cardHtml(c, { correction: true })).join('')}</div>
</div>
<div class="only-rows">
  <div class="rowhead"><span>档</span><span></span><span>标题</span><span>优惠</span><span>厂商</span><span>适用/特性</span><span style="text-align:right">状态</span></div>
  ${bCards.map(rowHtml).join('')}
</div>

<section class="demohead" style="padding:var(--s4) 0 0">
  <h1 style="font-size:18px">为什么是 46px 而不是更矮</h1>
  <p>
    llm-prices 的行高 45px（<code>tr ×159</code>）、openrouter 47px（<code>div ×21</code>）——两家都在 45–47px。
    再矮就得砍掉厂商 logo（24px）或触控目标（移动端最小 44px），所以 46px 是「密度」与「可点」的交点。
    紧凑视图在 760px 以下改成两列信息（标题 + CTA），触控目标仍 ≥44px。
  </p>
</section>`;

write(
  'B-balanced/dense.html',
  shell({
    title: '方案 B · 均衡 — 紧凑行视图',
    nav: 'B 均衡',
    note:
      '这一页看的是<b>一屏能放多少条</b>。默认卡片态与线上一致（192px 定高，首屏 9 张）；' +
      '切到紧凑行态，行高 46px —— 标杆里 llm-prices 用 45px 表格行做到首屏 16 行、' +
      'openrouter 用 47px 做到 15 行，这是它们的实测值，不是估算。',
    body: denseBody(false)
  })
);

write(
  'B-balanced/dense-rows.html',
  shell({
    title: '方案 B · 均衡 — 紧凑行视图（默认行态）',
    nav: 'B 紧凑行',
    note: '同一页，只是默认落在紧凑行态，便于一眼看完与<b>用同一把尺子量密度</b>（<code>display:none</code> 的元素量不到）。',
    body: denseBody(true)
  })
);

const detailDeal = (bCards.find(c => c.deal && c.deal.zh) || bCards.find(c => c.deal) || {}).deal || {};
const detailCard = bCards.find(c => c.deal === detailDeal) || bCards[0];
const bg = detailDeal;
write(
  'B-balanced/detail.html',
  shell({
    title: '方案 B · 均衡 — 单条详情页',
    nav: 'B 详情页',
    note:
      '这一页是 <b>每条优惠一个静态页</b> 的样例（构建期生成 <code>dist/deal/&lt;id&gt;/index.html</code>，当前 80 条）。' +
      '首页卡片标题指向这里，<b>「获取 →」仍然直达厂商官方页</b>——「落地页指向官方」的原则不变。' +
      '页面不执行 JS 也能读到全部字段（构建期预渲染）。',
    body: `
<nav class="crumb" aria-label="面包屑"><a href="#">首页</a> › <a href="#">${esc(bg.category || 'API服务')}</a> › <span>${esc(detailCard.title)}</span></nav>
<article>
  <div class="dtitle">
    <div class="logos">${logoHtmlReal(detailCard)}</div>
    <div><h1>${esc(detailCard.title)}</h1>
      <div class="dsub">${esc(detailCard.vendorLine)} <span class="tg ${bg.region === 'cn' ? 'cn' : 'gl'}">${bg.region === 'cn' ? '国内' : '国外'}</span>
      ${detailCard.verified ? '<span class="tg" style="background:var(--cnbg);color:var(--cn)">已核验</span>' : ''}
      <span class="tg" style="background:var(--line2);color:var(--ink2)">档位 ${detailCard.tier}</span></div>
    </div>
  </div>

  <div class="doffer"><div class="lab">优惠内容</div><p>${String(detailCard.offerHtml).replace(/<[^>]+>/g, '')}</p>
    ${bg.zh && bg.zh.discountInfo ? `<div class="dzh">中文翻译：${esc(bg.zh.discountInfo)}</div>` : ''}</div>

  <div class="dgrid">
    <div class="cv"><div class="k">适用条件</div><div class="v">${esc(bg.eligibility || '官方页未写明门槛')}</div></div>
    <div class="cv"><div class="k">有效期</div><div class="v">${esc(bg.validity || '官方页未给出绝对截止日期')}</div></div>
    <div class="cv"><div class="k">价格阶梯</div><div class="v">${esc(bg.priceLine || '官方页未明确写出免费 → 付费的路径')}</div></div>
    <div class="cv"><div class="k">核验状态</div><div class="v">${detailCard.verified ? `已人工核验${bg.verifiedAt ? ' · ' + esc(bg.verifiedAt) : ''}` : `数据更新 ${esc(bg.lastSeen || '')}（自动采集，未人工核验）`}</div></div>
    <div class="cv"><div class="k">分类</div><div class="v">${esc(bg.category || '')}</div></div>
    <div class="cv"><div class="k">定价模式</div><div class="v">${esc(bg.pricingModel || '—')}</div></div>
  </div>

  ${bg.models && bg.models.length > 1 ? `<div class="dgrid" style="grid-template-columns:1fr"><div class="cv"><div class="k">覆盖 ${bg.models.length} 个模型</div><div class="v">${bg.models.map(m => esc(m)).join(' · ')}</div></div></div>` : ''}

  <div class="dact">
    <a class="pri" href="${esc(bg.url || '#')}">前往厂商官方页获取 →</a>
    <a class="sec" href="#">信息有误 / 我核验过</a>
    <a class="sec" href="#">加入对比</a>
  </div>

  <div class="dsrc">
    来源署名：${esc(bg.source || '人工策展')}${bg.sourceUrl ? ` · <a href="${esc(bg.sourceUrl)}">原始出处</a>` : ''}<br>
    本页 canonical：<code>https://buguoshixc.github.io/ai-deals-aggregator/deal/${esc(bg.id || '')}/</code> ·
    结构化数据：BreadcrumbList + ItemList（与首页同一套 RENDER-CORE 纯函数产出）<br>
    排序与推荐理由不出售；本页不收录任何付费推广位。
  </div>
</article>`
  })
);

write(
  'B-balanced/affordances.html',
  shell({
    title: '方案 B · 均衡 — 状态、订阅与纠错入口',
    nav: 'B 附属',
    note: '这一页看<b>四个状态</b>（空 / 无结果 / 加载骨架 / 出错）与三个零依赖出口：订阅（<code>feed.xml</code> + <code>feed.json</code>）、纠错入口（预填 GitHub Issue）、手机端紧凑视图。',
    body: `
<section class="demohead" style="padding:0 0 var(--s3)"><h1>状态与出口</h1>
<p>四个状态都必须成立，且<b>无 JS 时页面仍能读到全部预渲染正文</b>——所以状态只覆盖列表区，不动正文。</p></section>

<div class="grid">
  <div class="state"><b>没有匹配的优惠</b>试试更短的关键词，或清掉筛选条件。<br><a href="#">清空筛选</a></div>
  <div class="state" style="border-style:solid"><b>数据加载失败</b>页面已按上次构建的静态内容展示（不执行 JS 也能用）。<br><a href="#">重新加载</a></div>
  <div class="skel"><i></i><i></i><i></i></div>
</div>

<section class="demohead" style="padding:var(--s4) 0 var(--s3)"><h1 style="font-size:18px">三个出口（全部零依赖）</h1>
<p>
  <span class="anno">feed.xml（RSS 2.0）</span><span class="anno">feed.json（JSON Feed 1.1）</span><span class="anno">GitHub Issue 纠错模板</span>
  订阅与纠错都是<b>构建期生成的静态文件/链接</b>，不新增任何外部请求，也不需要后端。
</p></section>

<div class="grid">
  ${bCards.slice(0, 3).map(c => cardHtml(c, { correction: true, fav: false })).join('')}
</div>`
  })
);

/* ============================ C · 进取 ============================ */

write(
  'C-ambitious/home.html',
  shell({
    title: '方案 C · 进取 — 首页按意图重排',
    nav: 'C 进取',
    note:
      '这一页看<b>一级入口的粒度</b>：从「一个列表 + 筛选条」变成按意图直达的入口（免费额度 / 学生·教育 / 国内厂商 / 全部工具 / 全部优惠），' +
      '每个入口是<b>独立静态路径</b>（<code>/free/</code>、<code>/student/</code>…），各自 canonical，不用 query 变体稀释权重。' +
      '排序与分档逻辑不变。',
    body: `
<section class="demohead" style="padding:0 0 var(--s3)"><h1>按意图直达，而不是先看一屏再筛</h1>
<p>线上现在只有一个入口：默认视图（力度分档）+ facet 筛选。下面这五个入口在方案 C 里各自是一条独立路径。</p></section>
<nav class="facetsin" style="background:transparent;padding:0 0 var(--s3)" aria-label="一级入口">
  <button class="f" aria-pressed="true">全部优惠 <b>80</b></button>
  <button class="f" aria-pressed="false">完全免费 <b>12</b></button>
  <button class="f" aria-pressed="false">免费额度 <b>26</b></button>
  <button class="f" aria-pressed="false">学生 / 教育 <b>18</b></button>
  <button class="f" aria-pressed="false">国内厂商 <b>60</b></button>
  <button class="f" aria-pressed="false">全部工具 <b>50</b></button>
</nav>
<div class="grid">${slice.slice(0, 6).map(c => cardHtml(c, { correction: true, fav: true })).join('')}</div>

<section class="demohead" style="padding:var(--s4) 0 0"><h1 style="font-size:18px">收藏与对比</h1>
<p>卡片右下角多了「收藏 / 对比」。两者都只写 <code>localStorage</code>，并生成可分享 URL（<code>?compare=id1,id2</code>）；
<b>没有 JS 时这两个按钮不渲染</b>——沿用现有「没有 JS 就不给可点暗示」的做法，不出现死按钮。</p>
<table style="width:100%;border-collapse:collapse;margin-top:var(--s3);font-size:var(--fs-md);background:var(--card);border:1px solid var(--line);border-radius:var(--r);overflow:hidden">
  <thead><tr style="background:var(--line2);text-align:left">
    <th style="padding:10px">字段</th><th style="padding:10px">${esc(slice[0].title)}</th><th style="padding:10px">${esc(slice[3].title)}</th><th style="padding:10px">${esc(slice[5].title)}</th></tr></thead>
  <tbody>
    <tr><td style="padding:10px;color:var(--mut)">力度档位</td><td style="padding:10px">${slice[0].tier}</td><td style="padding:10px">${slice[3].tier}</td><td style="padding:10px">${slice[5].tier}</td></tr>
    <tr><td style="padding:10px;color:var(--mut);border-top:1px solid var(--line2)">优惠</td><td style="padding:10px;border-top:1px solid var(--line2)">${String(slice[0].offerHtml).replace(/<[^>]+>/g, '').slice(0, 40)}</td><td style="padding:10px;border-top:1px solid var(--line2)">${String(slice[3].offerHtml).replace(/<[^>]+>/g, '').slice(0, 40)}</td><td style="padding:10px;border-top:1px solid var(--line2)">${String(slice[5].offerHtml).replace(/<[^>]+>/g, '').slice(0, 40)}</td></tr>
    <tr><td style="padding:10px;color:var(--mut);border-top:1px solid var(--line2)">核验</td><td style="padding:10px;border-top:1px solid var(--line2)">${slice[0].verified ? '已核验' : '自动采集'}</td><td style="padding:10px;border-top:1px solid var(--line2)">${slice[3].verified ? '已核验' : '自动采集'}</td><td style="padding:10px;border-top:1px solid var(--line2)">${slice[5].verified ? '已核验' : '自动采集'}</td></tr>
    <tr><td style="padding:10px;color:var(--mut);border-top:1px solid var(--line2)">厂商</td><td style="padding:10px;border-top:1px solid var(--line2)">${esc(slice[0].vendorLine.split(' · ')[0])}</td><td style="padding:10px;border-top:1px solid var(--line2)">${esc(slice[3].vendorLine.split(' · ')[0])}</td><td style="padding:10px;border-top:1px solid var(--line2)">${esc(slice[5].vendorLine.split(' · ')[0])}</td></tr>
  </tbody>
</table>
<p class="note" style="padding:var(--s2) 0 0">对比表只展示<b>有值的字段</b>：缺值的行不占位、不写「暂无数据」（<code>priceLine</code> 目前只有 3 条、<code>features</code> 31 条，硬撑一张满格表格只会暴露空白）。</p>`
  })
);

write(
  'C-ambitious/i18n.html',
  shell({
    title: '方案 C · 进取 — 中英双版本',
    nav: 'C 英文',
    note:
      '这一页只说明<b>英文覆盖长什么样、成本落在哪</b>：英文页与中文页 hreflang 互指，sitemap 收两套。' +
      '译文沿用现有 <code>zh</code> 覆盖层的同一套机制（<code>translations_en.json</code> + 原文指纹 + 逐字段停用），' +
      '<b>不做机器翻译</b>；厂商名与模型名等专有名词不翻译。',
    body: `
<section class="demohead" style="padding:0 0 var(--s3)"><h1>同一份数据，两套语言入口</h1>
<p><code>hreflang</code>：<code>zh-CN</code>（自指）· <code>en</code> · <code>x-default</code>。英文页只覆盖 <code>type:"deal"</code> 与首页静态文案。</p></section>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--s3)">
  <div>
    <div class="band t2" style="margin-top:0"><span class="n">2</span><b>免费额度</b><span class="line"></span><span>中文</span></div>
    <div class="grid" style="grid-template-columns:1fr">${slice.slice(0, 2).map(c => cardHtml(c, { correction: true })).join('')}</div>
  </div>
  <div>
    <div class="band t2" style="margin-top:0"><span class="n">2</span><b>Free credits</b><span class="line"></span><span>English</span></div>
    <div class="grid" style="grid-template-columns:1fr">
      ${slice.slice(0, 2).map(c => `
      <article class="g" data-tier="${c.tier}" data-verified="0">
        <span class="tiernum" aria-hidden="true">${c.tier}</span>
        <div class="gh"><div class="logos">${logoHtmlReal(c)}</div>
          <div class="gt"><h3><a href="#">${esc(c.title)}</a></h3><div class="vendor">${esc(c.vendorLine)}</div></div>
          <span class="tg gl">EN</span></div>
        <div class="of"><span class="bar"></span><div class="tx">${esc(c.deal && c.deal.description ? String(c.deal.description).slice(0, 120) : String(c.offerHtml).replace(/<[^>]+>/g, '').slice(0, 120))}</div></div>
        <div class="meta">Verified data · updated ${esc((c.deal && c.deal.lastSeen) || '')}<span class="sp"><a class="cta" href="${esc(c.href)}">Get the offer →</a></span></div>
      </article>`).join('')}
    </div>
  </div>
</div>
<section class="demohead" style="padding:var(--s4) 0 0"><h1 style="font-size:18px">成本要说清楚</h1>
<p>英文覆盖<b>不是一次性成本</b>：每新增一条优惠都要有人写英文译文（与现在的中文译文同样的工作量）。
建议先做首页 + 20 条高价值条目，其余英文页回退中文原文并如实标注——而不是上机器翻译。</p></section>`
  })
);

/* ============================ 对比页 ============================ */

write(
  'index.html',
  shell({
    title: 'mockups v3 · 三套方案对比',
    nav: '方案对比',
    note: '三套方案都能点开看。共同点：都<b>不引入任何依赖</b>、不热链 CDN、保持零构建单文件、不编造数据、不卖排序。差别只在<b>动到哪一层</b>。',
    body: `
<section class="demohead" style="padding:0 0 var(--s3)">
  <h1>三套方案 · 同一批真实数据</h1>
  <p>所有数字都来自实测（<code>research/EVIDENCE.md</code>、<code>research/GAP-MATRIX.md</code>、<code>research/DESIGN-TOKENS.md</code>）。下面每套都能点开对应 demo。</p>
</section>

<div class="tokens" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  <div class="sw">
    <div class="n" style="font-size:var(--fs-lg)">A · 保守</div>
    <div class="m" style="margin-top:6px">只动视觉层：token、暗色、动效、对比度、层级、排版权重、语义标签、四态。</div>
    <div class="m" style="margin-top:8px">
      <b>改后指标</b>：对比度不达标 100/400 → ≤20 · 假字重 354 → 0 · 字号 12 种 → 6 级 · 暗色 0 → 2 套 ·
      动效 3 组 ad-hoc → 4 token + 可关 · 断言 55 → ≥64
    </div>
    <div class="m" style="margin-top:8px"><b>不动</b>：URL 结构、卡片密度（首屏仍 9 张）、筛选与折叠逻辑</div>
    <p style="margin-top:12px"><a class="cta" href="./A-conservative/index.html">打开 A 的 demo</a>
    <a class="cta ghost" href="./A-conservative/PLAN.md" style="margin-left:6px">PLAN.md</a></p>
  </div>

  <div class="sw" style="border-color:var(--brand)">
    <div class="n" style="font-size:var(--fs-lg)">B · 均衡 <span class="tg" style="background:var(--glbg);color:var(--gl)">推荐</span></div>
    <div class="m" style="margin-top:6px">A 的全部 + 每条优惠一个静态页 + 紧凑行视图 + feed + 纠错入口 + 手机端密度。</div>
    <div class="m" style="margin-top:8px">
      <b>改后指标</b>：可索引 URL 1 → 81 · 同源内链 1 → ~140 · 首屏 9 → <b>16+</b>（紧凑视图）·
      手机 15 屏 → ≤12 · 断言 55 → ≥70
    </div>
    <div class="m" style="margin-top:8px"><b>不动</b>：数据结构（详情页字段全是派生）、投稿/账号/统计</div>
    <p style="margin-top:12px">
      <a class="cta" href="./B-balanced/dense.html">紧凑视图</a>
      <a class="cta ghost" href="./B-balanced/detail.html" style="margin-left:6px">详情页</a>
      <a class="cta ghost" href="./B-balanced/affordances.html" style="margin-left:6px">状态与出口</a>
      <a class="cta ghost" href="./B-balanced/PLAN.md" style="margin-left:6px">PLAN.md</a>
    </p>
  </div>

  <div class="sw">
    <div class="n" style="font-size:var(--fs-lg)">C · 进取</div>
    <div class="m" style="margin-top:6px">B 的全部 + 收藏/对比 + 首页按意图重排（5 个一级入口）+ 英文覆盖。</div>
    <div class="m" style="margin-top:8px">
      <b>改后指标</b>：一级视图 1 → 5 · 收藏/对比从无到有 · hreflang 2 → 4 条 + <code>/en/</code> 页面集 ·
      断言 55 → ≥90
    </div>
    <div class="m" style="margin-top:8px"><b>注意</b>：英文覆盖是<b>持续人工成本</b>（每条新数据都要译），不是一次性投入</div>
    <p style="margin-top:12px">
      <a class="cta" href="./C-ambitious/home.html">首页 IA</a>
      <a class="cta ghost" href="./C-ambitious/i18n.html" style="margin-left:6px">中英双版</a>
      <a class="cta ghost" href="./C-ambitious/PLAN.md" style="margin-left:6px">PLAN.md</a>
    </p>
  </div>
</div>

<section class="demohead" style="padding:var(--s4) 0 0">
  <h1 style="font-size:18px">三套都不做的事（红线）</h1>
  <p>
    <span class="anno">不引入前端框架 / 打包器</span><span class="anno">不热链 CDN 或 Web 字体</span>
    <span class="anno">不加载任何统计或广告脚本</span><span class="anno">不编造 priceLine / features / 核验状态</span>
    <span class="anno">不卖排序与推荐位</span><span class="anno">不做机器翻译</span>
  </p>
</section>

<section class="demohead" style="padding:var(--s4) 0 0">
  <h1 style="font-size:18px">这些提案是从哪来的（证据链）</h1>
  <p>
    20 个参考站（12 个同类垂直站 + 8 个设计标杆）用 <code>scripts/tools/study-site.js</code> 拆成结构化证据 →
    <code>research/EVIDENCE.md</code>（原始数字总表）→ <code>research/GAP-MATRIX.md</code>（差距与取舍）→
    <code>research/DESIGN-TOKENS.md</code>（token 级结论）。我们自己也用同一把尺子量了一遍（<code>research/_raw/ours-baseline/</code>），
    所以「首屏 9 张 / 5.9 屏 / 1 条内链 / 对比度 100 条不达标」都是实测值，不是估计。
  </p>
</section>`
  })
);

console.log('\n完成。用 npm run serve 打开 mockups/v3/index.html 查看（或直接双击文件）。');
