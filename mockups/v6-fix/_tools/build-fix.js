#!/usr/bin/env node
'use strict';
/**
 * v6-fix 示意图构建器（只读 dist，产物全部落在 mockups/v6-fix/）
 *
 * 产物：
 *   before.html / after.html          —— dist/index.html 的补丁副本（注入 <base> 指向 dist）
 * 说明：
 *   - 不改 dist、不改源码；after.html 只在末尾追加一段 <style> + 最小脚本。
 *   - 暗色不单独出文件：Playwright context 的 colorScheme=dark 走页面自带主题。
 *   - 390 的「needs 移到网格之后」由 after 脚本按 innerWidth<=560 执行。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const DIST = path.join(ROOT, 'dist/index.html');
const OUT = path.resolve(__dirname, '..');

function fail(message) {
  console.error('FAIL: ' + message);
  process.exit(1);
}

function replaceOnce(html, needle, replacement, label) {
  const first = html.indexOf(needle);
  if (first < 0) fail(label + ': needle not found');
  if (html.indexOf(needle, first + 1) >= 0) fail(label + ': needle matched more than once');
  return html.slice(0, first) + replacement + html.slice(first + needle.length);
}

const source = fs.readFileSync(DIST, 'utf8');
const sourceBytes = Buffer.byteLength(source, 'utf8');

/* ---------- 补丁 CSS（全部覆盖在 dist 原样式之后） ---------- */
const PATCH_CSS = `
/* ===== v6-fix 示意图补丁（仅 mockups，不进 dist） ===== */
/* A1 .fmembers：不再横向滚动；文本与链接仍留在 DOM，键盘 focus 仍可程序化滚入视野 */
.fmembers{overflow-x:hidden !important;text-overflow:ellipsis !important;white-space:nowrap !important}
/* C1 390：needs 移入 main 后补回 main 的 16px 横向 padding，卡片宽度与移动前一致 */
#dealsList + nav.needs{margin-left:-16px !important;margin-right:-16px !important}
/* A2 角标：label 缩短；全句由 title/aria-label 承担（脚本同步） */
/* A3 筛选条两端渐隐，暗示右侧还有内容（滚动条本身在现行 dist 已隐藏）。
   左渐隐只占 10px：容器 padding 16px，首枚 chip 从 16px 起，保持不透明；
   右渐隐 26px 才盖到最后一枚，用来提示「右边还有」。 */
.facetsin{
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 10px,#000 calc(100% - 26px),transparent 100%);
  mask-image:linear-gradient(90deg,transparent 0,#000 10px,#000 calc(100% - 26px),transparent 100%);
}
/* C2 顶栏：两枚次级入口从实心药丸降为普通文字链，文案恢复全称。
   11.5px/400/零横向内边距：1240 实测 search 203.61px（改前 201.28），
   降权后反而多出约 2.3px；断点保持 1240，与现行 CSS 一致。 */
.plansnav-api,.plansnav-cost{
  background:none;border:0;color:var(--ink2);
  padding:6px 0;font-size:11.5px;font-weight:400;
}
.plansnav-api:hover,.plansnav-cost:hover{background:none;color:var(--brand)}
@media (min-width:1240px){.plansnav-api,.plansnav-cost{display:inline-block}}
/* 合并卡：成员行与智谱卡同构；这里只保证它不会把卡片撑高 */
.fmembers [data-v6-note]{color:var(--mut)}
`;

/* ---------- 补丁脚本 ---------- */
const PATCH_JS = `
(function () {
  'use strict';
  if (window.__v6mock) return;
  var OPENROUTER_IDS = ['98cfbb26c5cc','f9844047fe7c','14f39f10f728','762a098836d7','6637868284f5','940d872f9eac','2374288880c3','75c584a4d6a2','ef3cba339a72'];
  var FULL_TITLE = 'OpenRouter · 免费模型（9 个）';
  var FULL_SENTENCE = '官方未标注截止日期，以官方页面为准';

  function badge() {
    document.querySelectorAll('.tg.uns').forEach(function (el) {
      if (el.textContent !== '未标注') el.textContent = '未标注';
      el.title = FULL_SENTENCE;
      el.setAttribute('aria-label', FULL_SENTENCE);
    });
  }

  function topbar() {
    var api = document.querySelector('.plansnav-api');
    var cost = document.querySelector('.plansnav-cost');
    if (api) api.textContent = 'API / Token 计费对比';
    if (cost) cost.textContent = 'API 成本计算器';
  }

  function mergeOpenRouter() {
    if (document.querySelector('article.g[data-v6-merged="1"]')) return;
    var all = [].slice.call(document.querySelectorAll('article.g'));
    var members = all.filter(function (a) {
      var ids = (a.getAttribute('data-deal-ids') || '').split(',');
      return ids.some(function (id) { return OPENROUTER_IDS.indexOf(id) >= 0; });
    });
    if (members.length !== 9) return; // 等首页脚本把 9 张都渲染出来再动手

    var first = members[0];
    var merged = first.cloneNode(true);
    merged.setAttribute('data-v6-merged', '1');
    merged.setAttribute('data-deal-ids', members.map(function (a) { return a.getAttribute('data-deal-ids'); }).join(','));
    merged.setAttribute('data-model-count', '9');
    merged.setAttribute('data-quota', 'shared');
    merged.setAttribute('data-models', members.map(function (a) {
      return a.querySelector('h3 a').textContent.trim();
    }).join('\\n'));
    merged.setAttribute('aria-label', FULL_TITLE + '（按回车查看详情）');

    var h3a = merged.querySelector('h3 a');
    h3a.textContent = FULL_TITLE;
    h3a.setAttribute('href', first.querySelector('h3 a').getAttribute('href'));

    var vendor = merged.querySelector('.vendor');
    if (vendor) vendor.textContent = 'OpenRouter · API服务';

    var logos = merged.querySelector('.logos');
    if (logos) {
      logos.setAttribute('title', 'OpenRouter：名称缩写，未取得官方品牌图形');
      logos.innerHTML = '<span class="lg text" style="background:#4a5568" role="img" ' +
        'aria-label="OpenRouter：名称缩写，未取得官方品牌图形" ' +
        'title="OpenRouter：名称缩写，未取得官方品牌图形">OR</span>';
    }

    var ofwrap = merged.querySelector('.ofwrap');
    if (ofwrap) {
      ofwrap.innerHTML = '';
      var fm = document.createElement('div');
      fm.className = 'fmembers';
      fm.setAttribute('data-fold-members', '9');
      fm.setAttribute('title', '9 个模型：' + members.map(function (a) {
        return a.querySelector('h3 a').textContent.trim();
      }).join('、'));
      members.forEach(function (a) {
        var link = a.querySelector('h3 a');
        var name = link.textContent.trim();
        var span = document.createElement('span');
        var a2 = document.createElement('a');
        a2.setAttribute('href', link.getAttribute('href'));
        a2.textContent = name;
        span.appendChild(a2);
        span.appendChild(document.createTextNode(name === 'Crouton Alpha' ? '：免费；限流未标注' : '：免费'));
        fm.appendChild(span);
        fm.appendChild(document.createTextNode(' '));
      });
      var of = document.createElement('div');
      of.className = 'of t1';
      of.innerHTML = '<span class="bar"></span><div class="tx"><b>OpenRouter 免费模型</b> · ' +
        'prompt / completion 价格均为 $0；限流：20 次/分钟；每日 50 次（累计购买 &lt;10 credits）' +
        '或 1000 次（≥10 credits）—— 出自 OpenRouter 官方限流文档；官方未标注免费截止日期</div>';
      ofwrap.appendChild(fm);
      ofwrap.appendChild(of);
    }

    var feats = merged.querySelector('.feats');
    if (feats) feats.innerHTML = '<span>9 个模型 · 均免费</span><span>20 RPM / 50–1000 RPD</span><span>:free 路由</span>';

    first.parentNode.insertBefore(merged, first);
    members.forEach(function (a) { a.remove(); });
  }

  // 折叠后卡片级计数必须跟着变（优惠级计数 #topStat / 筛选条保持 deals 口径，README 说明）
  function updateCounts() {
    var cards = [].slice.call(document.querySelectorAll('#dealsList article.g'));
    if (!cards.length) return;
    var by = {}, cn = 0;
    cards.forEach(function (c) {
      var t = c.getAttribute('data-tier') || '';
      by[t] = (by[t] || 0) + 1;
      if (c.querySelector('.tg.cn')) cn++;
    });
    var stats = document.getElementById('stats');
    if (stats) {
      stats.innerHTML = '显示 <b>' + cards.length + '</b> 条卡片 · 国内 ' + cn +
        ' · 国外 ' + (cards.length - cn) + ' · 覆盖 <b>' + Object.keys(by).length +
        '</b> 个力度档位';
    }
    [].forEach.call(document.querySelectorAll('.tierhead'), function (h) {
      var m = (h.className || '').match(/\\bt([1-4])\\b/);
      if (!m) return;
      var stat = h.querySelector('.stat');
      if (stat) stat.innerHTML = (by[m[1]] || 0) + '<span class="stat-unit">条</span>';
    });
  }

  function moveNeeds() {
    if (window.innerWidth > 560) return;
    var needs = document.querySelector('nav.needs');
    var grid = document.getElementById('dealsList');
    if (!needs || !grid) return;
    if (needs.previousElementSibling !== grid) grid.parentNode.insertBefore(needs, grid.nextSibling);
  }

  function apply() {
    document.documentElement.setAttribute('data-v6-mock', '1');
    badge();
    topbar();
    mergeOpenRouter();
    updateCounts();
    moveNeeds();
  }

  window.__v6patch = apply;
  window.__v6mock = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
  window.addEventListener('load', function () { apply(); setTimeout(apply, 250); });
  // 首页脚本会在 fetch 后重建网格：只在结构真的变化时再压一次（幂等）
  var grid = document.getElementById('dealsList');
  if (grid && window.MutationObserver) {
    var pending = null;
    new MutationObserver(function () {
      if (pending) return;
      pending = setTimeout(function () { pending = null; apply(); }, 60);
    }).observe(grid, { childList: true });
  }
})();
`;

function makePage(sourceHtml) {
  // <base> 只此一处：让 mockups/ 下的副本仍按 dist/ 解析相对资源
  let html = replaceOnce(sourceHtml, '<head>', '<head>\n  <base href="../../dist/">', 'inject base');
  return html;
}

const before = makePage(source);
fs.writeFileSync(path.join(OUT, 'before.html'), before);

let after = makePage(source);
after = replaceOnce(after, '</body>', '<style id="v6-mock-style">' + PATCH_CSS + '</style>\n<script id="v6-mock-script">' + PATCH_JS + '</script>\n</body>', 'append patch');
fs.writeFileSync(path.join(OUT, 'after.html'), after);

console.log(JSON.stringify({
  source: 'dist/index.html',
  sourceBytes,
  beforeBytes: Buffer.byteLength(before, 'utf8'),
  afterBytes: Buffer.byteLength(after, 'utf8'),
  outputs: ['before.html', 'after.html']
}, null, 2));
