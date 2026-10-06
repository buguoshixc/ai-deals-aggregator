/**
 * T6 复审 · 造「对抗产物」（只在 review/scratch/** 里，**永不碰 dist / dist.baseline**）。
 *
 *   negative     ：① 让 student/ 的冻结串出现 2 次（≥2 次锚点的端到端负例）
 *                  ② 新增一条布局族解析不出来的路由（unclassified-layout 的端到端负例）
 *   false-green-c1：把「盒子宽度一字不动、有字区域被 padding 压成 480px」的回归写进 student/ 的共享 <style>
 *                 （用来验证：整轮套件会不会照样全绿）
 *
 * 每个产物都会打印：源文件 sha256、注入文本、注入后 sha256、以及「基线未被触碰」的校验。
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const SRC = path.join(ROOT, 'dist');
const SCRATCH = path.join(__dirname, 'scratch');

const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const shaTree = dir => {
  const h = crypto.createHash('sha256');
  const walk = (d, base) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full, base);
      else { h.update(path.relative(base, full).split(path.sep).join('/')).update('\0').update(fs.readFileSync(full)); }
    }
  };
  walk(dir, dir);
  return h.digest('hex');
};

const distTreeBefore = shaTree(SRC);
const target = process.argv[2];
const GRID_TARGETS = ['false-green-grid', 'r3-false-green-grid'];
const R3_TARGETS = ['r3-pseudo', 'r3-multicol-float', 'r3-newforms', 'r3-balance', 'r3-b760'];
if (!['negative', 'false-green-c1', 'plain', ...GRID_TARGETS, ...R3_TARGETS].includes(target)) {
  console.error('用法：node make-scratch.cjs negative|false-green-c1|false-green-grid|r3-false-green-grid|plain|' + R3_TARGETS.join('|'));
  process.exit(1);
}
const dest = path.join(SCRATCH, target);
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(SRC, dest, { recursive: true });
console.log(`复制 dist → ${path.relative(ROOT, dest)}（${shaTree(dest) === distTreeBefore ? '树哈希一致' : '树哈希不一致!'}）`);

const FROZEN = '.snote { color: var(--mut); font-size: var(--fs-sm); line-height: 1.7; margin: 0 0 var(--s3); max-width: none; overflow-wrap: anywhere; }';

if (target === 'negative') {
  // ① student/：复制共享 <style>，冻结串出现 2 次（M1 的锚点变成非唯一）
  const file = path.join(dest, 'student', 'index.html');
  const before = sha(file);
  const html = fs.readFileSync(file, 'utf8');
  const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html);
  const injected = `${html.slice(0, m.index + m[0].length)}\n${m[0]}\n${html.slice(m.index + m[0].length)}`;
  fs.writeFileSync(file, injected);
  const count = [...injected.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .reduce((n, mm) => n + mm[1].split(FROZEN).length - 1, 0);
  console.log(`① student/index.html：复制共享 <style> ⇒ 冻结串出现 ${count} 次（期望 2）`);
  console.log(`   sha256 ${before.slice(0, 12)}… → ${sha(file).slice(0, 12)}…`);

  // ② 新增一条任何 ROUTE_PATTERNS / kindByRoute 都命中不了的路由
  const orphanDir = path.join(dest, 'unknown-family');
  fs.mkdirSync(orphanDir, { recursive: true });
  fs.copyFileSync(path.join(SRC, 'docs', 'data', 'index.html'), path.join(orphanDir, 'index.html'));
  console.log('② 新增路由 unknown-family/（产物里有 index.html，但布局族解析不出来）');
}

if (target === 'false-green-c1') {
  // 把回归写进 student/ 的**共享 <style>**（就是那条「宽度唯一出处」所在的位置）。
  //   padding-right: calc(100% - 70ch) ⇒ 有字区域恒等于 70ch（= 改动前那 4 个壳把说明压成的样子），
  //   而 border-box 宽度一字不动。选 calc 而不是写死 900px：后者在窄视口会把页面撑宽，
  //   会被 §22c 的溢出检查顺带咬到 —— 那样验的就不是「判据能不能看穿盒子」了。
  const file = path.join(dest, 'student', 'index.html');
  const before = sha(file);
  let html = fs.readFileSync(file, 'utf8');
  const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html);
  const rule = '\n  /* 对抗注入：border-box 宽度一字不动，靠 padding 把有字区域压成 70ch */\n'
    + '  .snote { padding-right: calc(100% - 70ch); }\n';
  html = html.slice(0, m.index + m[0].length - '</style>'.length) + rule + html.slice(m.index + m[0].length - '</style>'.length);
  fs.writeFileSync(file, html);
  const after = fs.readFileSync(file, 'utf8');
  const frozenCount = [...after.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .reduce((n, mm) => n + mm[1].split(FROZEN).length - 1, 0);
  console.log('student/index.html：注入「.snote { padding-right: calc(100% - 70ch); }」');
  console.log(`   冻结串出现次数（必须仍是 1，否则红的原因就不是它了）：${frozenCount}`);
  console.log(`   sha256 ${before.slice(0, 12)}… → ${sha(file).slice(0, 12)}…`);
}

if (GRID_TARGETS.includes(target)) {
  // 只用**一条 CSS 规则**（不改标记）在 changes/ 上复现「页面级说明是 70ch 窄柱」：
  //   .snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; }
  // changes/ 的 13 条 .snote 都是纯文本 —— 文本成为**匿名网格项**，DOM 里没有任何元素承载它。
  // round 2 的口径（textWidth = 内容盒）因此判绿；round 3 的**逐行字迹口径**必须咬到。
  // 冻结串照旧恰好 1 次。`r3-false-green-grid` 与 `false-green-grid` 是同一构造（t15 的 verify 命令用前者）。
  const file = path.join(dest, 'changes', 'index.html');
  const before = sha(file);
  let html = fs.readFileSync(file, 'utf8');
  const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html);
  const rule = '\n  /* 对抗注入：一条 CSS 规则，把说明文字挤进 minmax(0,70ch) 的匿名网格项（盒宽一字不动） */\n'
    + '  .snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; }\n';
  html = html.slice(0, m.index + m[0].length - '</style>'.length) + rule + html.slice(m.index + m[0].length - '</style>'.length);
  fs.writeFileSync(file, html);
  const after = fs.readFileSync(file, 'utf8');
  const frozenCount = [...after.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .reduce((n, mm) => n + mm[1].split(FROZEN).length - 1, 0);
  console.log('changes/index.html：注入「.snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; }」');
  console.log(`   冻结串出现次数（必须仍是 1）：${frozenCount}`);
  console.log(`   sha256 ${before.slice(0, 12)}… → ${sha(file).slice(0, 12)}…`);
}

if (R3_TARGETS.includes(target)) {
  /** 往某条路由的**共享 <style>** 末尾插 CSS；冻结串必须仍是 1 次，否则红的原因就不是我们要判的了。 */
  const inject = (route, label, css) => {
    const file = path.join(dest, route, 'index.html');
    const before = sha(file);
    const html = fs.readFileSync(file, 'utf8');
    const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html);
    if (!m) { console.error(`✗ ${route} 没有 <style>，注入失败`); process.exit(1); }
    const injected = html.slice(0, m.index + m[0].length - '</style>'.length) + `\n${css}\n` + html.slice(m.index + m[0].length - '</style>'.length);
    fs.writeFileSync(file, injected);
    const count = [...injected.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
      .reduce((n, mm) => n + mm[1].split(FROZEN).length - 1, 0);
    console.log(`${route}：${label}`);
    console.log(`   冻结串出现次数（必须仍是 1）：${count}${count === 1 ? '' : ' ← ✗ 不是 1，注入作废'}`);
    console.log(`   sha256 ${before.slice(0, 12)}… → ${sha(file).slice(0, 12)}…`);
    if (count !== 1) process.exit(1);
  };

  if (target === 'r3-pseudo') {
    // F-R2-2：正文交给 ::before 画，真实文本 font-size:0（一个可见字形盒都没有）。盒宽/行数一切正常。
    inject('changes/', 'F-R2-2 伪元素承载正文（font-size:0 + ::before{content}）',
      '  /* 对抗注入：正文交给伪元素画 —— 真实文本零字形盒 */\n'
      + '  .snote { font-size: 0; }\n'
      + '  .snote::before { content: "对抗注入：这一段正文由 ::before 的 content 画出来，DOM 里的真实文本一个字形盒都没有。"; font-size: var(--fs-sm); }\n');
  }

  if (target === 'r3-multicol-float') {
    // t11 的两个形态（本轮的独立复现）：multicol（盒/内容盒都满宽）与 ::before 右浮动 70%（同上）。
    inject('changes/', 't11 形态①：multicol（column-count: 3）',
      '  /* 对抗注入：multicol —— 盒子与内容盒都满宽，只有字迹铺不开 */\n'
      + '  .snote { column-count: 3; column-gap: 24px; }\n');
    inject('student/', 't11 形态②：::before float:right 70%',
      '  /* 对抗注入：::before 右浮动占 70%，文字只能挤在左侧 30% */\n'
      + '  .snote::before { content: ""; float: right; width: 70%; height: 12em; }\n');
  }

  if (target === 'r3-newforms') {
    // round 3 新增形态（t5/t8/t11 都没试过的机制）+ 三个「本来就该绿」的对照 + 一个前置条件对照。
    // 注意：`changes/` 在 dist 里 13 条说明都是单行（balance 无从生效）⇒ balance 放到确实有多行说明的 vendor/aliyun/。
    inject('vendor/aliyun/', '新形态①：text-wrap: balance（平衡换行，盒满宽、每行都短）',
      '  .snote { text-wrap: balance; }\n');
    inject('student/', '新形态②：zoom: 0.5（渲染期整体缩放）',
      '  .snote { zoom: 0.5; }\n');
    inject('docs/data/', '新形态③：display:table + table-layout:fixed + ::before 占 60% 单元格',
      '  .snote { display: table; table-layout: fixed; width: 100%; }\n'
      + '  .snote::before { content: ""; display: table-cell; width: 60%; }\n');
    inject('status/', '对照 A：direction: rtl + unicode-bidi: bidi-override（不是窄化，应绿）',
      '  .snote { direction: rtl; unicode-bidi: bidi-override; }\n');
    inject('vendor/ai360/', '对照 B：clip-path: inset(0 70% 0 0)（绘制类遮盖，§22c 明示不承诺，应绿）',
      '  .snote { clip-path: inset(0 70% 0 0); }\n');
    inject('plans/', '对照 C：不透明覆盖层 ::after（绘制类遮盖，应绿）',
      '  .snote { position: relative; }\n'
      + '  .snote::after { content: ""; position: absolute; top: 0; right: 0; width: 70%; height: 100%; background: #000; }\n');
    inject('need/free-api/', '前置条件对照：font-size: 4px（单行短说明 + 盒满宽，不许被 note-ink-narrow 命中）',
      '  .snote { font-size: 4px; }\n');
    // 只在 ≤760 生效的窄化（B 项盲区的实测形态；这条用来把「盲区」变成可复现的读数）
    inject('category/api/', 'B 盲区形态：@media (max-width:760px) 里才生效的 grid 70ch 窄柱',
      '  @media (max-width: 760px) { .snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; } }\n');
    // contentBox === 0 ⇒ textWidth 回落 border-box（L6429–6431）这条旁路：padding 把内容盒压成 0
    inject('need/china-usable/', '旁路 A：padding: 0 50%（内容盒 = 0 ⇒ 旧码回落 border-box 满宽；字迹必须被咬）',
      '  .snote { padding-left: 50%; padding-right: 50%; }\n');
    // 无盒形态：display:contents（.snote 自己不生成盒子）—— 看两条码各自的读数与归因
    inject('developer/', '旁路 B：display: contents（.snote 不生成盒子；文本仍由父级满宽排版）',
      '  .snote { display: contents; }\n');
    // F-R2-2 的**更简写法**：只写 font-size:0、不加伪元素（盒子高度也塌成 0）
    inject('vendor/anthropic/', 'F-R2-2 简写：.snote { font-size: 0 }（文本不可见 + 盒高塌 0）',
      '  .snote { font-size: 0; }\n');
    // 不可见性对照（acceptance 明示属预期放行的一类）
    inject('need/free-tier/', '对照 D：color: transparent（不可见性，属预期放行）',
      '  .snote { color: transparent; }\n');
  }

  if (target === 'r3-balance') {
    // 只为 round 3 的 balance 形态单开一份（newforms 那份的注入面保持不动，便于追溯）。
    // vendor/aliyun/ 在 dist 里确实有多行说明（1/3 行），balance 才可能生效。
    inject('vendor/aliyun/', '新形态①：text-wrap: balance（平衡换行，盒满宽、每行都短）',
      '  .snote { text-wrap: balance; }\n');
    inject('category/api/', 'B 盲区形态：@media (max-width:760px) 里才生效的 grid 70ch 窄柱',
      '  @media (max-width: 760px) { .snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; } }\n');
  }

  if (target === 'r3-b760') {
    // B 项的**决定性形态**：和 F-R2-1 一模一样的一条 CSS，但只在 ≤760 生效。
    // 挑 changes/：它的 13 条说明是纯文本（无块级子元素）⇒ .snote 自己的内容盒始终满宽 ⇒ 旧口径看不见。
    inject('changes/', 'B 盲区形态（纯文本页）：@media (max-width:760px) 里的 grid 70ch 窄柱',
      '  @media (max-width: 760px) { .snote { display: grid; grid-template-columns: minmax(0, 70ch) 1fr; } }\n');
  }
}

console.log(`\n回执：dist 未被触碰 = ${shaTree(SRC) === distTreeBefore}（树哈希 ${distTreeBefore.slice(0, 16)}…）`);
console.log(`产物树哈希：${shaTree(dest).slice(0, 16)}…`);
