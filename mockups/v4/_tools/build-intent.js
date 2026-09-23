#!/usr/bin/env node
/**
 * 方案 C ·「首页按意图重排」—— 可点开的静态页面生成器
 *
 * 为什么要有这个：入口方案用文字描述看不出差别，必须**点开看**。而且不能拿一个
 * 长得像的 mockup 去看——所以这里不重写卡片，而是**从真实构建产物里取**：
 * 复用产物的 <style>、页头、页脚与 62 张卡片的原始 HTML，只把「入口层」换掉。
 * 于是看到的就是线上长相，唯一差别就是本文件新加的那一层。
 *
 * 用法：
 *   node mockups/v4/_tools/build-intent.js                 # 默认读 dist/（先 npm run build）
 *   node mockups/v4/_tools/build-intent.js --in=<目录>      # 读一份冻结快照（不受并发构建影响）
 *   node mockups/v4/_tools/build-intent.js --out=<目录>
 *
 * 口径（都来自产物自身，不自己发明）：
 *   · 分档规则抄自 index.html 的 TIERS：1 完全免费 / 2 免费额度 / 3 身份优惠 / 4 折扣促销 / 5 付费为主
 *   · 卡片集合 = 产物里预渲染的那 62 张（与页面上「优惠 62」一致）
 *   · 计数全部由本脚本数出来，并写进 ../_summary.json 供复核
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const argOf = (k, d) => {
  const hit = args.find(x => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};

const ROOT = path.join(__dirname, '..', '..', '..');
const IN = path.resolve(ROOT, argOf('in', 'dist'));
const OUT = path.resolve(ROOT, argOf('out', 'mockups/v4/intent'));
const REL = '../../../dist'; // 从 mockups/v4/intent/ 回指 dist/（file:// 与本地服务器都成立）

const srcPath = path.join(IN, 'index.html');
if (!fs.existsSync(srcPath)) {
  console.error(`找不到 ${srcPath}，先 npm run build，或用 --in=<快照目录>`);
  process.exit(1);
}
const html = fs.readFileSync(srcPath, 'utf8');

/* ---------- 从真实产物里切出可复用的零件 ---------- */
const styleTag = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
const headOpen = html.slice(0, html.indexOf('</head>'));
const bodyOpen = (html.match(/<body[^>]*>/) || ['<body>'])[0];
const header = (html.match(/<header class="top">[\s\S]*?<\/header>/) || [''])[0];
const footer = (html.match(/<footer[\s\S]*?<\/footer>/) || [''])[0];
// 第一段 <script> 是「首屏前决定主题」的内联脚本，必须留（否则暗色不跟随系统）；
// 第二段是主应用脚本 —— 必须删，否则它会重新渲染网格、把我们筛好的静态内容冲掉。
const themeScript = (headOpen.match(/<script>[\s\S]*?<\/script>/) || [''])[0];

/**
 * 页面 <head> 由本函数**显式重建**，不再整段搬运产物的 head。
 * 为什么（踩过的坑）：产物 head 里已经含主题脚本、<style> 与 5 段 JSON-LD，
 * 早期版本把它们搬过来之后又追加了一份主题脚本与样式 —— 结果是脚本与 CSS 各出现两次，
 * 还把真站的结构化数据带进了 mockup（会让人误以为 mockup 也声明了这些节点）。
 * mockup 只该有：字符集、视口、标题、canonical（用来说明它将来的路径）、
 * 主题预涂脚本、产物样式、本文件的补充样式。
 */
const headHtml = (title, canonical) => `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${title}</title>
  <link rel="canonical" href="${canonical}">
  <link rel="stylesheet" href="${REL}/logos.css">
${themeScript}
${styleTag}
<style>${MOCK_CSS}</style>`;

const rawCards = html.match(/<article class="g[^"]*"[\s\S]*?<\/article>/g) || [];
if (!rawCards.length) {
  console.error('没切到任何卡片，产物结构可能变了 —— 先看 dist/index.html 再改本脚本');
  process.exit(1);
}

/* ---------- 给每张卡打上筛选用得着的属性 ---------- */
const EDU_RE = /学生|教师|教育|学校|高校|大学|在校|学费|学术|奖学金|student|teacher|educat|academic|faculty|campus|university|college|school/i;
const OSS_RE = /初创|开源|维护者|非营利|非盈利|公益|startup|open\s*source|maintainer|non-?profit|\bngo\b/i;

const cards = rawCards.map(htmlCard => {
  const open = htmlCard.slice(0, htmlCard.indexOf('>') + 1);
  const pick = (re) => (open.match(re) || [])[1] || '';
  const text = htmlCard.replace(/<[^>]+>/g, ' ');
  return {
    htmlCard,
    tier: Number(pick(/data-tier="(\d)"/) || 0),
    rule: pick(/data-rule="([^"]*)"/),
    verified: /class="g [^"]*\bverified\b/.test(open),
    cn: /class="tg cn"/.test(htmlCard),
    title: ((htmlCard.match(/<h3><a [^>]*>([\s\S]*?)<\/a>/) || [])[1] || '').trim(),
    text,
    edu: EDU_RE.test(text),
    oss: OSS_RE.test(text),
  };
});

/* ---------- 入口定义（计数一律现场数出来） ---------- */
const TIER_NAME = { 1: '完全免费', 2: '免费额度', 3: '身份优惠', 4: '折扣促销', 5: '付费为主' };
const count = (fn) => cards.filter(fn).length;
const byTier = (n) => cards.filter(c => c.tier === n);

const t1 = byTier(1), t2 = byTier(2), t3 = byTier(3);
const eduNarrow = t3.filter(c => c.edu);
const t3Other = t3.filter(c => !c.edu);

const CN_COUNT = count(c => c.cn);
const ALL_COUNT = cards.length;
const FREE_COUNT = t1.length + t2.length;
// 「全部工具」的计数不在卡片里（工具是另一个 Tab，客户端渲染），取产物 facet 条上的官方数字
const TOOLS_COUNT = Number(((html.match(/data-value="tools"[^>]*>[^<]*<b>(\d+)<\/b>/) || [])[1]) || 0);

const ENTRIES = [
  { id: 'all', file: 'deals.html', path: '/', label: '全部优惠', n: ALL_COUNT, note: '现状默认视图（力度分档）' },
  { id: 'free', file: 'free.html', path: '/free/', label: '免费额度', n: FREE_COUNT, note: `含完全免费 ${t1.length}` },
  { id: 'edu', file: 'edu.html', path: '/student/', label: '学生 · 教育', n: eduNarrow.length, note: `身份优惠共 ${t3.length}` },
  { id: 'cn', file: 'cn.html', path: '/cn/', label: '国内厂商', n: CN_COUNT, note: 'region = cn' },
  { id: 'tools', file: 'tools.html', path: '/tools/', label: '全部工具', n: TOOLS_COUNT, note: '另一个 Tab，非优惠' },
];

/* ---------- 卡片 href 改指到 dist（本地点得开） ---------- */
const rewired = (list) => list
  .map(c => c.htmlCard.replace(/href="(deal\/[^"]*)"/g, (m, p) => `href="${REL}/${p}index.html"`))
  .join('\n');

/* ---------- 页面外壳 ---------- */
const MOCK_CSS = `
/* ==== 以下是 mockup 专用样式（真实产物里没有），全部走既有 token，并带兜底值 ==== */
.mkbar{background:var(--card,#fff);border-bottom:1px solid var(--line,#e5e7eb);padding:var(--s2,8px) 0}
.mkbar .in{max-width:var(--maxW,1280px);margin:0 auto;padding:0 var(--s4,20px);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.mkbar .tag{font-size:var(--fs-xs,12px);color:var(--mut,#6b7280);border:1px solid var(--line,#e5e7eb);border-radius:999px;padding:2px 9px}
.mkbar a.f{text-decoration:none}
.mk{max-width:var(--maxW,1280px);margin:0 auto;padding:var(--s4,20px)}
.mk h1{font-size:22px;font-weight:700;margin:0 0 6px}
.mk h2{font-size:16px;font-weight:700;margin:var(--s4,20px) 0 6px}
.mk p{color:var(--mut,#6b7280);font-size:var(--fs-md,14px);max-width:1000px;margin:0 0 8px}
.mk p b,.mk li b{color:var(--ink,#111)}
.mk .callout{border:1px solid var(--line,#e5e7eb);border-left:3px solid var(--t2,#2563eb);border-radius:var(--r,10px);background:var(--card,#fff);padding:var(--s3,14px) var(--s4,20px);margin:var(--s3,14px) 0}
.mk .callout h2{margin-top:0}
.mk ul{margin:6px 0 0 18px;color:var(--mut,#6b7280);font-size:var(--fs-md,14px)}
.mk li{margin:3px 0}
.mk .paths{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:var(--fs-xs,12px);color:var(--mut,#6b7280)}
.mk .big{font-size:15px;color:var(--ink,#111)}
.mk .split{display:flex;gap:var(--s4,20px);flex-wrap:wrap}
.mk .split>div{flex:1 1 320px;min-width:280px}
`;

function navHtml(activeId) {
  const items = ENTRIES.map(e => {
    const on = e.id === activeId ? ' on' : '';
    return `<a class="f${on}" href="${e.file}"${e.id === activeId ? ' aria-current="page"' : ''}>${e.label}<b>${e.n}</b></a>`;
  }).join('');
  return `<div class="mkbar"><div class="in">
  <span class="tag">一级入口（mockup）</span>
  <nav class="facetsin" aria-label="一级入口">${items}</nav>
  <span class="tag"><a href="index.html">← 回到审阅总览</a></span>
</div></div>`;
}

function page({ file, title, entryId, h1, intro, review, body }) {
  const entry = ENTRIES.find(e => e.id === entryId);
  const canonical = `https://buguoshixc.github.io/ai-deals-aggregator${entry ? entry.path : '/'}`;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
${headHtml(title, canonical)}
</head>
${bodyOpen}
<a class="skip" href="#main">跳到主要内容</a>
${header}
${navHtml(entryId)}
<div class="mk">
  <h1>${h1}</h1>
  ${intro}
  <div class="callout">
    <h2>这一页要你审的点</h2>
    ${review}
    <p class="paths">建议路径：${entry ? entry.path : '/'} · canonical：${canonical} · 口径：${entry ? entry.note : ''}（${entry ? entry.n : ALL_COUNT} 条）</p>
  </div>
</div>
<main id="main">
<div class="grid" id="dealsList">
${body}
</div>
</main>
${footer}
</body>
</html>
`;
}

/* ---------- 各页正文 ---------- */
const commonIntro = (lead) => `<p>${lead}</p>`;

const PAGES = [];

PAGES.push({
  file: 'deals.html',
  title: '全部优惠 —— 现状默认视图（方案 C mockup）',
  entryId: 'all',
  h1: '全部优惠：现状默认视图',
  intro: commonIntro(`这是<b>现在线上首页</b>的那一屏：一个列表 + 力度分档 + 筛选条，共 <b>${ALL_COUNT}</b> 条。
    新方案里它仍然是默认落地页，一级入口只是<b>快捷方式</b>，不改默认行为。`),
  review: `<ul>
    <li>默认视图保持不动，你认可吗？（改动面最小、SEO 最稳）</li>
    <li>下面 4 个入口页的卡片与这一页<b>完全同源</b>，只是集合不同 —— 请对比看它们的差别。</li>
  </ul>`,
  body: rewired(cards),
});

PAGES.push({
  file: 'free.html',
  title: '免费额度（含完全免费）—— 方案 C mockup',
  entryId: 'free',
  h1: `免费额度：注册就能省下的那一类（${FREE_COUNT} 条）`,
  intro: commonIntro(`按你的意见，<b>「完全免费」已并入这一页</b>：完全免费 ${t1.length} 条 + 免费额度 ${t2.length} 条 = <b>${FREE_COUNT}</b> 条。
    下面按「① 完全免费 / ② 免费额度」两段分开列，因为这两类的<b>到手条件不一样</b>
    （前者注册即可用，后者要等额度到账、且有有效期）——分成一段会让人误判。`),
  review: `<ul>
    <li><b>要不要保留这两段小标题？</b>合成一段更短，但会混掉「注册即用」和「等额度到账」的区别。</li>
    <li>这一页是四个入口里<b>搜索意图最强</b>的（「XX 免费额度」是真实搜索词），所以它最值得给独立路径与独立正文。</li>
  </ul>`,
  body: `<h2>① 完全免费（${t1.length} 条）</h2>\n${rewired(t1)}\n<h2>② 免费额度（${t2.length} 条）</h2>\n${rewired(t2)}`,
});

PAGES.push({
  file: 'edu.html',
  title: '学生 · 教育 —— 方案 C mockup',
  entryId: 'edu',
  h1: `学生 · 教育：身份优惠里的教育子集（${eduNarrow.length} 条）`,
  intro: commonIntro(`线上第 3 档叫<b>「身份优惠」</b>，一共 ${t3.length} 条，但它把三类人混在一起：
    学生/教师、初创团队、开源维护者。这一页只取<b>教育子集 ${eduNarrow.length} 条</b>；
    剩下的 ${t3Other.length} 条（初创 / 开源 / 非营利等）留在别处。`),
  review: `<ul>
    <li><b>口径二选一</b>：窄口径「学生·教育」= ${eduNarrow.length} 条（本页现状）；宽口径「身份优惠」= ${t3.length} 条（含初创/开源）。
      窄的好处在搜索意图更准，宽的好处是不漏。你选哪个？</li>
    <li>如果选宽口径，路径建议叫 <span class="paths">/identity/</span> 而不是 <span class="paths">/student/</span>（名实相符）。</li>
  </ul>`,
  body: rewired(eduNarrow),
});

PAGES.push({
  file: 'cn.html',
  title: '国内厂商 —— 方案 C mockup',
  entryId: 'cn',
  h1: `国内厂商：可直连、需实名的那一类（${CN_COUNT} 条）`,
  intro: commonIntro(`按 <b>region = cn</b> 取，共 <b>${CN_COUNT}</b> 条（同页显示的「国内 42 · 国外 20」同源）。
    这类的共同点是<b>要实名认证、支付走国内渠道</b>，与「要不要翻墙/有没有海外卡」直接相关，
    所以单独成页比混在列表里更有用。`),
  review: `<ul>
    <li>路径用 <span class="paths">/cn/</span> 还是更明确的中文拼音/英文 <span class="paths">/domestic/</span>？</li>
    <li>要不要在这页顶部写清「需实名」这类<b>共同前提</b>（现在只在每条卡片里各写一遍）？</li>
  </ul>`,
  body: rewired(cards.filter(c => c.cn)),
});

PAGES.push({
  file: 'tools.html',
  title: '全部工具 —— 方案 C mockup',
  entryId: 'tools',
  h1: `全部工具：另一个 Tab（${TOOLS_COUNT} 条）`,
  intro: commonIntro(`「全部工具」<b>不是优惠</b>，是工具目录，线上已经是筛选条里的一个 Tab（<b>${TOOLS_COUNT}</b> 条），
    由客户端脚本渲染，所以这一页没有静态卡片可以搬 —— 本 mockup 不重建它，只说明它在入口体系里的位置。`),
  review: `<ul>
    <li><b>它该不该升成一级入口？</b>它是站内唯一「非优惠」的内容型入口，混在优惠入口里可能稀释「这里全是真优惠」的印象。</li>
    <li>若保留：路径 <span class="paths">/tools/</span>；若降级：继续留在筛选条里不动。</li>
  </ul>`,
  body: `<p class="big">（本页故意不放卡片：工具列表由客户端脚本渲染，静态搬过来会变成一个与线上不一致的假页面。）</p>`,
});

/* ---------- 总览页 ---------- */
const overview = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
${headHtml('方案 C · 首页按意图重排 —— 审阅总览', 'https://buguoshixc.github.io/ai-deals-aggregator/')}
<style>
.mk table{border-collapse:collapse;width:100%;font-size:var(--fs-md,14px);background:var(--card,#fff);border:1px solid var(--line,#e5e7eb);border-radius:var(--r,10px);overflow:hidden}
.mk th,.mk td{padding:9px 12px;text-align:left;border-top:1px solid var(--line2,#f1f3f5)}
.mk thead th{border-top:0;background:var(--line2,#f1f3f5)}
</style>
</head>
${bodyOpen}
<a class="skip" href="#main">跳到主要内容</a>
${header}
<div class="mk">
  <h1>首页按意图重排：5 个入口，一页一个，点开看</h1>
  <p>你要求「先做出各个情况静态页面再审核」。所以这里不是描述，是 <b>5 个真的能点开的静态页面</b>：
  它们的<b>样式、页头、页脚、卡片 HTML 全部取自真实构建产物</b>（只删掉主脚本、换掉入口层），
  所以看到的长相就是线上长相，唯一的差别就是新加的那一条入口栏。</p>
  <p>已按你的意见把<b>「完全免费」并入「免费额度」</b>（不再单列）。</p>

  <div class="callout">
    <h2>先点这五个</h2>
    <table>
      <thead><tr><th>入口</th><th>建议路径</th><th>条数</th><th>口径</th></tr></thead>
      <tbody>
      ${ENTRIES.map(e => `<tr><td><a href="${e.file}"><b>${e.label}</b></a></td><td class="paths">${e.path}</td><td>${e.n}</td><td>${e.note}</td></tr>`).join('\n      ')}
      </tbody>
    </table>
    <p>条数不是我从文档里抄的，是脚本从产物里<b>现场数出来</b>的（见 <span class="paths">mockups/v4/_tools/build-intent.js</span> 与 <span class="paths">mockups/v4/_summary.json</span>）。</p>
  </div>

  <div class="callout">
    <h2>要你定的四件事</h2>
    <div class="split">
      <div>
        <p class="big"><b>1. 入口集合</b></p>
        <p>现在是 5 个：全部优惠 / 免费额度 / 学生·教育 / 国内厂商 / 全部工具。
        「完全免费」已按你的意见并进「免费额度」。</p>
      </div>
      <div>
        <p class="big"><b>2. 学生页口径（本页有真实分歧）</b></p>
        <p>窄口径「学生·教育」= ${eduNarrow.length} 条；宽口径「身份优惠」= ${t3.length} 条（还含初创/开源 ${t3Other.length} 条）。
        见 <a href="edu.html">学生 · 教育</a> 页。</p>
      </div>
      <div>
        <p class="big"><b>3. 路径命名</b></p>
        <p class="paths">/free/ /student/ /cn/ /tools/</p>
        <p>备选：<span class="paths">/edu/</span>、<span class="paths">/identity/</span>、<span class="paths">/domestic/</span>。
        用独立静态路径（各自 canonical），不用 query 变体。</p>
      </div>
      <div>
        <p class="big"><b>4.「全部工具」的位置</b></p>
        <p>它是唯一的非优惠入口，${TOOLS_COUNT} 条。升成一级入口，还是继续留在筛选条里？
        见 <a href="tools.html">全部工具</a> 页。</p>
      </div>
    </div>
  </div>

  <div class="callout">
    <h2>这个 mockup 刻意没做的事（免得你按它验收时误会）</h2>
    <ul>
      <li><b>主脚本已删</b>：搜索、筛选、排序、视图切换、详情弹层都不工作 —— 这是为了让你看到的集合是<b>我筛好的静态集合</b>，不被脚本重渲染冲掉。</li>
      <li><b>卡片上的标题链接</b>指向本地 <span class="paths">dist/deal/…</span>，需要先 <span class="paths">npm run build</span> 才有；「获取 →」仍指向厂商官方页。</li>
      <li><b>没有改首页</b>：这只是评审用的静态页面，线上 index.html 一行都没动。</li>
      <li>重复内容风险是真的：5 条近似路径必须有各自那段独立正文（每页顶部那段就是候选），否则等于拿 5 个薄页换 SEO。</li>
    </ul>
  </div>
</div>
${footer}
</body>
</html>
`;

/* ---------- 落盘 ---------- */
fs.mkdirSync(OUT, { recursive: true });
const written = [];
for (const p of PAGES) {
  fs.writeFileSync(path.join(OUT, p.file), page(p), 'utf8');
  written.push(p.file);
}
fs.writeFileSync(path.join(OUT, 'index.html'), overview, 'utf8');
written.push('index.html');

const summary = {
  generatedFrom: srcPath,
  generatedAt: new Date().toISOString(),
  cardsTotal: ALL_COUNT,
  tiers: { 完全免费: t1.length, 免费额度: t2.length, 身份优惠: t3.length, 折扣促销: byTier(4).length, 付费为主: byTier(5).length },
  verified: count(c => c.verified),
  region: { cn: CN_COUNT, global: ALL_COUNT - CN_COUNT },
  entries: ENTRIES,
  eduNarrow: eduNarrow.length,
  eduOtherInTier3: t3Other.length,
  toolsCountFromFacetBar: TOOLS_COUNT,
  pages: written,
};
fs.writeFileSync(path.join(OUT, '..', '_summary.json'), JSON.stringify(summary, null, 2), 'utf8');

// 控制台只打 ASCII，避免 Windows 控制台编码把中文变成乱码
console.log('OK wrote ' + written.length + ' pages to ' + OUT);
console.log('cards=' + ALL_COUNT + ' free(t1+t2)=' + FREE_COUNT + ' (t1=' + t1.length + ',t2=' + t2.length + ')');
console.log('tier3=' + t3.length + ' eduNarrow=' + eduNarrow.length + ' eduOther=' + t3Other.length);
console.log('cn=' + CN_COUNT + ' tools(facet)=' + TOOLS_COUNT + ' verified=' + summary.verified);
