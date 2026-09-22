#!/usr/bin/env node
/**
 * 参考站拆解器 —— 把「优秀网页」拆成可复核的结构与样式证据。
 *
 * 为什么需要：本项目的迭代方式是「先看别人怎么做，再决定自己改什么」。口头印象
 * 无法复核，所以这里把参考站拆成四份**原始证据**；之后的差距分析只允许引用这四份
 * 里的数字与选择器，不允许凭印象写结论：
 *
 *   1. metrics.json     结构与规模：容器宽、栅格列数、候选卡片签名与高度分布、
 *                       首屏**完整可见**卡片数（与 verify-site.js 同一口径：
 *                       卡片底边 ≤ 视口底边）、同源链接的 URL 形态（判断有没有
 *                       「每一条一个独立页」）、canonical / hreflang / JSON-LD、
 *                       外部域名与请求数、静态正文长度、对比度抽样
 *   2. tokens.json      视觉系统：色值 / 字阶 / 行高 / 字重 / 圆角 / 阴影 / 间距 /
 *                       动效的**频次分布** —— 频次才是「设计系统」的证据，单取值不是
 *   3. dom-outline.txt  语义骨架 + class 命名频次
 *   4. shots/*.png      桌面首屏 / 桌面整页 / 手机首屏
 *
 * 刻意不做的事：
 *  - 不做登录态：不加载 profile、不注入 cookie、不传凭据（与 lib/browser.js 同一条边界）
 *  - 不下载浏览器内核：复用 playwright-core + 本机 Edge / Chrome
 *  - 不解释、不打分、不给建议 —— 工具只产出证据，「该不该学」由人写进报告
 *  - 尊重 robots.txt：不允许就退出（--force 可越过，仅限你已确认可抓的站点）
 *
 * 用法：
 *   node scripts/tools/study-site.js <url> --out=research/_raw/<slug>
 *   node scripts/tools/study-site.js <url> --out=... --proxy=http://127.0.0.1:7890
 *   node scripts/tools/study-site.js <url> --out=... --wait=文案A|文案B   # SPA 显式等文案
 *
 * 网络诊断纪律（2.13 的教训，勿忘）：
 *   直连超时 ≠ 站点不可达。先确认本机代理状态，需要时用 --proxy 重试，
 *   再把结论写进报告 —— 别把「本机出口」的问题写成「站点不可达」。
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { detectChannel } = require('../lib/browser');
const { isAllowedByRobots, DEFAULT_UA } = require('../lib/http');

const ROOT = path.join(__dirname, '..', '..');
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const GOTO_TIMEOUT = 30000;
const CONTENT_TIMEOUT = 20000;
const SETTLE_WAIT = 900;

const args = process.argv.slice(2);
const has = name => args.includes(`--${name}`);
const opt = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const target = args.find(a => !a.startsWith('--'));

function usage(message) {
  if (message) console.error(`错误：${message}\n`);
  console.error('用法：node scripts/tools/study-site.js <url> --out=research/_raw/<slug> [选项]');
  console.error('   --out=<dir>       证据输出目录（缺省 research/_raw/<host>）');
  console.error('   --proxy=<url>     浏览器代理，如 http://127.0.0.1:7890');
  console.error('   --wait=文案A|文案B 显式等待目标文案出现（SPA 必用；不要用 networkidle）');
  console.error(`   --settle=<ms>     渲染稳定后再等的毫秒数（缺省 ${SETTLE_WAIT}）`);
  console.error('   --scheme=light|dark  强制 prefers-color-scheme（验证暗色模式用）');
  console.error('   --force            robots.txt 不允许时仍然抓取（仅限你确认可抓的站点）');
  console.error('   --no-shots         不截图（只要结构化证据时更快）');
  console.error('   --mobile-only      只截手机首屏');
  process.exit(message ? 2 : 0);
}

if (!target) usage('缺少目标 URL');
if (!/^https?:\/\//i.test(target)) usage(`URL 必须是 http(s)：${target}`);

const proxy = opt('proxy');
const needles = String(opt('wait', '')).split('|').map(s => s.trim()).filter(Boolean);
const settleWait = Math.max(0, Number(opt('settle', SETTLE_WAIT)) || SETTLE_WAIT);
// 让浏览器按指定偏好渲染：验证暗色模式与 prefers-reduced-motion 时必须能强制
const scheme = ['light', 'dark'].includes(opt('scheme')) ? opt('scheme') : null;
const outDir = path.resolve(ROOT, opt('out', path.join('research', '_raw', hostSlug(target))));
const shots = !has('no-shots');
const mobileOnly = has('mobile-only');

function hostSlug(url) {
  try {
    return new URL(url).host.replace(/^www\./, '').replace(/[^a-z0-9.-]/gi, '_');
  } catch (error) {
    return 'site';
  }
}

/** 优先本机 Edge/Chrome（与 lib/browser.js 同一策略），仅在需要时挂代理 */
async function launchBrowser() {
  const channel = await detectChannel();
  if (!channel) {
    throw new Error(
      '未找到可用的浏览器内核：需要本机安装 Microsoft Edge / Google Chrome，' +
      '或执行 npx playwright install chromium'
    );
  }
  const options = channel === 'bundled' ? { headless: true } : { channel, headless: true };
  if (proxy) options.proxy = { server: proxy };
  return chromium.launch(options);
}

/* ------------------------------------------------------------------ */
/* 页面内分析：全部在浏览器上下文里跑，不依赖任何外部库                  */
/* ------------------------------------------------------------------ */

function analyzePage() {
  const bump = (map, key, n = 1) => {
    if (key === null || key === undefined) return;
    const k = String(key).trim();
    if (!k || k === 'rgba(0, 0, 0, 0)' || k === 'transparent' || k === 'none' || k === 'normal') return;
    map[k] = (map[k] || 0) + n;
  };
  const top = (map, limit = 30) =>
    Object.entries(map)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([value, count]) => ({ value, count }));

  const visible = el => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  };

  /* ---- WCAG 对比度（近似：只做纯色背景，渐变/图片背景标记为 unknown）---- */
  const parseColor = value => {
    const m = String(value).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(x => parseFloat(x));
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { rgb: [parts[0], parts[1], parts[2]], a: parts.length > 3 ? parts[3] : 1 };
  };
  const luminance = rgb => {
    const f = c => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const contrastOf = (a, b) => {
    const l1 = luminance(a);
    const l2 = luminance(b);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** 向上找到第一个不透明背景；遇到渐变/图片背景返回 null（无法可靠计算） */
  const effectiveBg = el => {
    let node = el;
    while (node && node !== document.documentElement.parentNode) {
      const s = getComputedStyle(node);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parseColor(s.backgroundColor);
      if (c && c.a >= 0.95) return c.rgb;
      node = node.parentElement;
    }
    return [255, 255, 255];
  };

  const out = {};
  const doc = document.documentElement;
  out.url = location.href;
  out.title = document.title;
  out.lang = doc.getAttribute('lang') || null;
  out.viewport = { width: innerWidth, height: innerHeight };
  out.pageHeight = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
  out.scrollScreens = Math.round((out.pageHeight / innerHeight) * 10) / 10;

  /* ---- 头部与结构化数据 ---- */
  const meta = name => {
    const el = document.querySelector(`meta[name="${name}"]`) || document.querySelector(`meta[property="${name}"]`);
    return el ? el.getAttribute('content') : null;
  };
  out.meta = {
    description: meta('description'),
    ogImage: meta('og:image'),
    colorScheme: meta('color-scheme'),
    themeColor: meta('theme-color'),
    viewport: meta('viewport')
  };
  const canonical = document.querySelector('link[rel="canonical"]');
  out.canonical = canonical ? canonical.getAttribute('href') : null;
  out.hreflang = [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(l => ({
    hreflang: l.getAttribute('hreflang'),
    href: l.getAttribute('href')
  }));
  const jsonLd = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent);
      const walk = node => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (node['@type']) jsonLd.push(...[].concat(node['@type']).map(String));
        if (node['@graph']) walk(node['@graph']);
      };
      walk(parsed);
    } catch (error) {
      jsonLd.push('PARSE_ERROR');
    }
  }
  out.jsonLdTypes = [...new Set(jsonLd)];

  /* ---- 骨架 ---- */
  const landmarks = {};
  for (const tag of ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'form', 'dialog']) {
    landmarks[tag] = document.querySelectorAll(tag).length;
  }
  out.landmarks = landmarks;
  out.headings = [...document.querySelectorAll('h1,h2,h3')].slice(0, 40).map(h => ({
    level: Number(h.tagName[1]),
    text: (h.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70)
  }));

  /* ---- 同源链接形态：有没有「每一条一个独立页」 ---- */
  const STATIC_SEGMENTS = /^(about|pricing|price|blog|news|docs|doc|login|signin|signup|register|terms|privacy|policy|contact|careers|jobs|faq|help|support|api|apps|app|tools|tool|deals|deal|models|model|category|categories|tags|tag|search|explore|browse|submit|dashboard|account|legal|cookie|cookies|sitemap|feed|rss)$/i;
  const shapes = new Map();
  const host = location.host;
  let hashOnly = 0;
  for (const a of document.querySelectorAll('a[href]')) {
    let parsed;
    try {
      parsed = new URL(a.getAttribute('href'), location.href);
    } catch (error) {
      continue;
    }
    if (parsed.host !== host) continue;
    if (parsed.pathname === '/' || parsed.pathname === '') {
      // 同页锚点（目录站常见的「跳到分类」）不是详情页，单独计数，不混进 URL 形态
      if (parsed.hash) hashOnly++;
      continue;
    }
    const segments = parsed.pathname.split('/').filter(Boolean);
    const shape = '/' + segments
      .map(seg => {
        if (/^\d+$/.test(seg)) return ':num';
        if (STATIC_SEGMENTS.test(seg)) return seg.toLowerCase();
        if (/^[0-9a-f]{8,}$/i.test(seg)) return ':id';
        return ':slug';
      })
      .join('/');
    if (!shapes.has(shape)) shapes.set(shape, { shape, count: 0, samples: [] });
    const entry = shapes.get(shape);
    entry.count++;
    if (entry.samples.length < 3 && !entry.samples.includes(parsed.href)) entry.samples.push(parsed.href);
  }
  out.detailUrlPatterns = [...shapes.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  out.hashOnlyLinks = hashOnly;
  out.internalLinkCount = [...document.querySelectorAll('a[href]')].filter(a => {
    try {
      return new URL(a.getAttribute('href'), location.href).host === host;
    } catch (error) {
      return false;
    }
  }).length;

  /* ---- 候选卡片：按 tag+class 签名分组，取「同一父级下的重复项」 ---- */
  const groups = new Map();
  // 「一个条目」通常可点（整卡是 <a>，或卡内含链接/按钮）；标题、段落这类纯文本块不算，
  // 否则 h2 × N 会盖过真正的卡片集合（free-for.dev 上真出现过这个假阳性）。
  const clickable = el =>
    el.matches('a[href], button, [role="button"]') || Boolean(el.querySelector('a[href], button, [role="button"]'));
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    if (!clickable(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 24) continue;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).sort().join('.') : '';
    const sig = `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(el);
  }
  const candidates = [];
  for (const [sig, list] of groups) {
    if (list.length < 6) continue;
    const parents = new Set(list.map(el => el.parentElement));
    if (parents.size > 4) continue;
    const rects = list.map(el => el.getBoundingClientRect());
    const heights = rects.map(r => Math.round(r.height));
    const fullyVisible = rects.filter(r => r.bottom <= innerHeight + 0.5 && r.top >= -0.5).length;
    const inViewport = rects.filter(r => r.top < innerHeight && r.bottom > 0).length;
    candidates.push({
      signature: sig,
      count: list.length,
      parents: parents.size,
      width: Math.round(rects[0].width),
      height: { min: Math.min(...heights), max: Math.max(...heights), median: heights.slice().sort((a, b) => a - b)[Math.floor(heights.length / 2)] },
      fullyVisibleFirstScreen: fullyVisible,
      touchedFirstScreen: inViewport
    });
  }
  candidates.sort((a, b) => b.count - a.count);
  out.repeatedComponents = candidates.slice(0, 6);
  out.primaryList = candidates.length
    ? candidates.slice().sort((a, b) => b.fullyVisibleFirstScreen - a.fullyVisibleFirstScreen || b.count - a.count)[0]
    : null;

  /* ---- 布局与视觉 token 频次 ---- */
  const colors = {};
  const backgrounds = {};
  const fontSizes = {};
  const lineHeights = {};
  const fontWeights = {};
  const fontFamilies = {};
  const radii = {};
  const shadows = {};
  const gaps = {};
  const paddings = {};
  const transitions = {};
  const maxWidths = {};
  const gridTemplates = {};
  const resourceTypes = {};
  const domains = {};
  let stickyCount = 0;
  let fixedCount = 0;
  let darkRuleCount = 0;
  let imageCount = 0;
  let lazyImageCount = 0;

  const elements = [...document.querySelectorAll('body *')];
  const CAP = 4000;
  for (const el of elements.slice(0, CAP)) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    bump(colors, s.color);
    bump(backgrounds, s.backgroundColor);
    bump(fontSizes, s.fontSize);
    bump(lineHeights, s.lineHeight);
    bump(fontWeights, s.fontWeight);
    bump(fontFamilies, String(s.fontFamily).split(',')[0].replace(/["']/g, '').trim());
    bump(radii, s.borderRadius);
    bump(shadows, s.boxShadow);
    bump(gaps, s.gap !== 'normal' ? s.gap : s.rowGap);
    if (s.paddingTop !== '0px' || s.paddingBottom !== '0px') bump(paddings, `${s.paddingTop} ${s.paddingBottom}`);
    if (s.transitionDuration !== '0s' || s.animationName !== 'none') {
      bump(transitions, `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction}`.trim());
    }
    if (s.position === 'sticky') stickyCount++;
    if (s.position === 'fixed') fixedCount++;
    const mw = parseFloat(s.maxWidth);
    if (mw >= 640) bump(maxWidths, s.maxWidth);
    if (s.display === 'grid' && s.gridTemplateColumns && s.gridTemplateColumns !== 'none') {
      const tracks = s.gridTemplateColumns.split(' ').filter(Boolean).length;
      bump(gridTemplates, `${tracks} tracks`);
    }
    if (el.tagName === 'IMG' || el.tagName === 'PICTURE') {
      imageCount++;
      if (el.getAttribute('loading') === 'lazy') lazyImageCount++;
    }
  }
  try {
    for (const entry of performance.getEntriesByType('resource')) {
      bump(resourceTypes, entry.initiatorType);
      try {
        const h = new URL(entry.name).host;
        if (h && h !== host) bump(domains, h);
      } catch (error) {
        /* 忽略无法解析的资源地址 */
      }
    }
  } catch (error) {
    /* resource timing 不可用 */
  }
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch (error) {
      continue; // 跨域样式表读不到规则，如实跳过
    }
    if (!rules) continue;
    const scan = list => {
      for (const rule of list) {
        if (rule.conditionText && /prefers-color-scheme/i.test(rule.conditionText)) darkRuleCount++;
        if (rule.cssRules) scan(rule.cssRules);
      }
    };
    scan(rules);
  }

  out.tokens = {
    textColors: top(colors, 24),
    backgrounds: top(backgrounds, 24),
    fontSizes: top(fontSizes, 20),
    lineHeights: top(lineHeights, 16),
    fontWeights: top(fontWeights, 10),
    fontFamilies: top(fontFamilies, 8),
    radii: top(radii, 14),
    shadows: top(shadows, 12),
    gaps: top(gaps, 16),
    paddings: top(paddings, 16),
    transitions: top(transitions, 14),
    containerMaxWidths: top(maxWidths, 10),
    gridTemplates: top(gridTemplates, 10)
  };

  out.behavior = {
    stickyElements: stickyCount,
    fixedElements: fixedCount,
    prefersColorSchemeRules: darkRuleCount,
    bodyBgIsDark: (() => {
      const c = parseColor(getComputedStyle(document.body).backgroundColor);
      return c ? luminance(c.rgb) < 0.4 : null;
    })(),
    images: imageCount,
    lazyImages: lazyImageCount,
    searchInputs: document.querySelectorAll('input[type="search"], input[placeholder*="搜索" i], input[placeholder*="search" i]').length,
    selects: document.querySelectorAll('select').length,
    buttons: document.querySelectorAll('button, [role="button"]').length,
    tabs: document.querySelectorAll('[role="tab"], [aria-pressed]').length,
    relNext: document.querySelectorAll('a[rel="next"], link[rel="next"]').length
  };
  out.externalDomains = top(domains, 20);
  out.resourceTypes = top(resourceTypes, 10);
  out.requestCount = (() => {
    try {
      return performance.getEntriesByType('resource').length;
    } catch (error) {
      return null;
    }
  })();

  /* ---- 静态正文长度：不执行 JS 时应能读到的内容规模（此处以渲染后 body 文本近似）---- */
  out.textLength = document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().length : 0;

  /* ---- 对比度抽样（近似）---- */
  const samples = [];
  let unknownBg = 0;
  for (const el of elements.slice(0, CAP)) {
    if (samples.length >= 400) break;
    if (!visible(el)) continue;
    // 注意：单个字符也采样（档位号「1」这类就一个字符）。早期版本要求 ≥2 个字符，
    // 结果档位角标这种最容易出问题的元素被整类漏掉——门禁自己不能有盲区。
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length >= 1);
    if (!own) continue;
    const s = getComputedStyle(el);
    const fg = parseColor(s.color);
    if (!fg) continue;
    const bg = effectiveBg(el);
    if (!bg) {
      unknownBg++;
      continue;
    }
    // 半透明文字色先与实际背景混合：否则 rgba(0,0,0,.5) 会被当成纯黑，算出虚高的对比度
    const fgRgb = fg.a >= 0.95 ? fg.rgb : [0, 1, 2].map(i => fg.rgb[i] * fg.a + bg[i] * (1 - fg.a));
    const ratio = contrastOf(fgRgb, bg);
    const fontSize = parseFloat(s.fontSize);
    const bold = Number(s.fontWeight) >= 700;
    const large = fontSize >= 24 || (fontSize >= 18.66 && bold);
    samples.push({
      selector: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : ''),
      text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      fontSize,
      ratio: Math.round(ratio * 100) / 100,
      required: large ? 3 : 4.5
    });
  }
  const ratios = samples.map(s => s.ratio).sort((a, b) => a - b);
  out.contrast = {
    sampled: samples.length,
    skippedForComplexBackground: unknownBg,
    min: ratios.length ? ratios[0] : null,
    p10: ratios.length ? ratios[Math.floor(ratios.length * 0.1)] : null,
    median: ratios.length ? ratios[Math.floor(ratios.length / 2)] : null,
    belowRequirement: samples.filter(s => s.ratio < s.required).length,
    worst: samples.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 8)
  };

  return out;
}

/** DOM 骨架文本 + class 命名频次（单独一次 evaluate，避免把长文本塞进 JSON） */
function outlinePage() {
  const lines = [];
  const classFreq = {};
  const LIMIT = 320;
  const INTERESTING = new Set(['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'form', 'ul', 'ol', 'table', 'dialog', 'h1', 'h2', 'h3']);
  const walk = (el, depth) => {
    if (lines.length >= LIMIT) return;
    const tag = el.tagName.toLowerCase();
    if (typeof el.className === 'string') {
      for (const cls of el.className.trim().split(/\s+/).filter(Boolean)) {
        classFreq[cls] = (classFreq[cls] || 0) + 1;
      }
    }
    const children = [...el.children];
    const interesting = INTERESTING.has(tag);
    if (interesting) {
      const cls = typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.')
        : '';
      const rect = el.getBoundingClientRect();
      const heading = /^h[1-3]$/.test(tag) ? ' — ' + (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60) : '';
      lines.push(`${'  '.repeat(depth)}<${tag}${cls}> ${Math.round(rect.width)}x${Math.round(rect.height)}${heading}`);
      depth++;
    }
    if (!interesting && children.length > 10) {
      // 子节点很多的容器（SPA 的 body / #app、列表容器）：不是一头扎进叶子节点，
      // 但也不能直接跳过——那样骨架只剩一两层（ai-bot.cn 上实测只剩 10 行）。
      // 折中：打印子节点数，再只往下走「自己还有结构」的那几个子节点。
      lines.push(`${'  '.repeat(depth)}… ${children.length} children (${tag})`);
      const structural = children.filter(child => child.children.length >= 3).slice(0, 8);
      for (const child of structural) walk(child, depth + 1);
      return;
    }
    for (const child of children.slice(0, 60)) walk(child, depth);
  };
  if (document.body) walk(document.body, 0);

  // 兜底：整页都是 div 的站点（Tailwind 类名、几乎没有语义标签）走不出层级，
  // 这时按「渲染面积」列出最大的 40 个元素 —— 至少能看出页面由哪几块组成。
  // 触发条件：正常骨架不足 25 行（vercel / notion / toolify 这类页面实测就是这种情况）。
  if (lines.length < 25 && document.body) {
    const big = [...document.querySelectorAll('body *')]
      .map(el => {
        const r = el.getBoundingClientRect();
        return { el, w: Math.round(r.width), h: Math.round(r.height), area: r.width * r.height };
      })
      .filter(item => item.w >= 40 && item.h >= 20)
      .sort((a, b) => b.area - a.area)
      .slice(0, 40);
    lines.push('', '## 面积兜底：渲染面积最大的 40 个元素（语义层级不足时看页面由哪几块组成）');
    for (const item of big) {
      const cls = typeof item.el.className === 'string' && item.el.className.trim()
        ? '.' + item.el.className.trim().split(/\s+/).slice(0, 3).join('.')
        : '';
      lines.push(`${String(item.w).padStart(5)}×${String(item.h).padStart(5)}  <${item.el.tagName.toLowerCase()}${cls}>`);
    }
  }

  const freq = Object.entries(classFreq).sort((a, b) => b[1] - a[1]).slice(0, 45);
  return { outline: lines.join('\n'), classFrequency: freq };
}

/* ------------------------------------------------------------------ */

async function renderInto(context, url, { viewport, shotFirst, shotFull }) {
  const page = await context.newPage();
  const notes = [];
  const started = Date.now();
  const textLength = () =>
    page.evaluate(() => (document.body ? document.body.innerText.replace(/\s+/g, ' ').trim().length : 0)).catch(() => 0);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT });
  } catch (error) {
    notes.push(`goto 失败: ${String(error.message).split('\n')[0]}`);
  }

  // load 事件是有界等待，不是主策略：有长轮询/埋点的站点可能永远不触发，超时就继续。
  try {
    await page.waitForLoadState('load', { timeout: 8000 });
  } catch (error) {
    notes.push('load 事件 8s 内未触发（有长轮询/埋点的站点常见），继续按内容判断');
  }

  const textBefore = await textLength();
  if (needles.length) {
    try {
      await page.waitForFunction(
        list => Boolean(document.body && list.some(n => (document.body.textContent || '').includes(n))),
        needles,
        { timeout: CONTENT_TIMEOUT }
      );
    } catch (error) {
      notes.push(`等待目标文案超时（期望其一：${needles.join(' / ')}）—— 结果是空壳时先排查代理/等待条件`);
    }
  } else {
    // 通用水合等待（SPA 无 --wait 时的兜底）：正文长度连续 1.2s 不变即认为首屏渲染完成，上限 10s。
    // 刻意不用 networkidle 作主策略 —— 2.7 的坑：长轮询 SPA 永远等不到 idle。
    const cap = Date.now() + 10000;
    let last = textBefore;
    let stableSince = Date.now();
    while (Date.now() < cap) {
      await page.waitForTimeout(250);
      const now = await textLength();
      if (now !== last) {
        last = now;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= 1200) {
        break;
      }
    }
  }
  if (settleWait) await page.waitForTimeout(settleWait);
  const textAfter = await textLength();
  if (textAfter === 0) {
    notes.push('渲染后正文长度为 0 —— 极可能是空壳：建议用 --wait 指定页面里必然出现的文案后重试');
  }
  // 截图前把还没解码完的图片等一等（上限 3s），否则整页截图会出现空白块
  await page
    .evaluate(
      () =>
        Promise.all(
          [...document.images]
            .filter(img => !img.complete)
            .map(img => new Promise(resolve => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
              setTimeout(resolve, 3000);
            }))
        )
    )
    .catch(() => {});
  if (shotFirst) await page.screenshot({ path: shotFirst });
  if (shotFull) await page.screenshot({ path: shotFull, fullPage: true });
  const evidence = await page.evaluate(analyzePage);
  const outline = await page.evaluate(outlinePage);
  await page.close();
  return { evidence, outline, notes, elapsedMs: Date.now() - started, viewport, hydration: { textBefore, textAfter } };
}

async function main() {
  if (!has('force') && !(await isAllowedByRobots(target))) {
    console.error(`robots.txt 不允许抓取：${target}`);
    console.error('（确认可抓时用 --force；本工具只做只读研究，但仍以 robots 为准）');
    process.exit(3);
  }

  fs.mkdirSync(path.join(outDir, 'shots'), { recursive: true });
  const slug = path.basename(outDir);
  const results = [];
  const browser = await launchBrowser();
  try {
    if (!mobileOnly) {
      const desktop = await browser.newContext({ userAgent: DEFAULT_UA, locale: 'zh-CN', viewport: DESKTOP, colorScheme: scheme || undefined });
      results.push(
        await renderInto(desktop, target, {
          viewport: DESKTOP,
          shotFirst: shots ? path.join(outDir, 'shots', 'desktop-first.png') : null,
          shotFull: shots ? path.join(outDir, 'shots', 'desktop-full.png') : null
        })
      );
      await desktop.close();
    }
    const mobile = await browser.newContext({
      userAgent: DEFAULT_UA,
      locale: 'zh-CN',
      viewport: MOBILE,
      colorScheme: scheme || undefined,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2
    });
    results.push(
      await renderInto(mobile, target, {
        viewport: MOBILE,
        shotFirst: shots ? path.join(outDir, 'shots', 'mobile-first.png') : null,
        shotFull: null
      })
    );
    await mobile.close();
  } finally {
    await browser.close().catch(() => {});
  }

  const [primary] = results;
  const metrics = {
    _note:
      '本文件是原始证据。transferSize 在跨域无 Timing-Allow-Origin 时可能为 0；对比度为纯色背景近似值，' +
      'complex background 的样本被计入 skippedForComplexBackground。',
    slug,
    target,
    fetchedAt: new Date().toISOString(),
    proxy: proxy || null,
    needles,
    renderedAt: results.map(r => ({ viewport: r.viewport, elapsedMs: r.elapsedMs, hydration: r.hydration, notes: r.notes })),
    desktop: results[0] ? results[0].evidence : null,
    mobile: results[1]
      ? {
          viewport: results[1].evidence.viewport,
          pageHeight: results[1].evidence.pageHeight,
          scrollScreens: results[1].evidence.scrollScreens,
          primaryList: results[1].evidence.primaryList,
          repeatedComponents: results[1].evidence.repeatedComponents.slice(0, 3),
          tokens: { fontSizes: results[1].evidence.tokens.fontSizes.slice(0, 8) },
          textLength: results[1].evidence.textLength
        }
      : null
  };
  const tokens = primary ? { slug, target, fetchedAt: metrics.fetchedAt, tokens: primary.evidence.tokens, behavior: primary.evidence.behavior, contrast: primary.evidence.contrast } : {};

  fs.writeFileSync(path.join(outDir, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(outDir, 'tokens.json'), `${JSON.stringify(tokens, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    path.join(outDir, 'dom-outline.txt'),
    [
      `# ${target}`,
      `# 抓取时间 ${metrics.fetchedAt}`,
      '',
      '## 语义骨架（缩进 = 层级，数字 = 渲染尺寸）',
      primary ? primary.outline.outline : '(未抓到)',
      '',
      '## class 命名频次（前 45）',
      ...(primary ? primary.outline.classFrequency : []).map(([name, count]) => `${String(count).padStart(5)}  ${name}`)
    ].join('\n') + '\n',
    'utf8'
  );

  const e = primary ? primary.evidence : null;
  console.log(`参考站拆解：${target}`);
  console.log(`  输出目录        : ${path.relative(ROOT, outDir)}`);
  console.log(`  标题            : ${e ? e.title : '(未抓到)'}`);
  console.log(`  渲染耗时        : ${results.map(r => `${r.viewport.width}px ${Math.round(r.elapsedMs / 1000)}s`).join(' / ')}`);
  if (e) {
    console.log(`  页面高度        : ${e.pageHeight}px（${e.scrollScreens} 屏 @${e.viewport.width}x${e.viewport.height}）`);
    console.log(`  静态正文长度    : ${e.textLength} 字符`);
    console.log(`  水合证据        : ${results.map(r => `${r.viewport.width}px 正文 ${r.hydration.textBefore}→${r.hydration.textAfter} 字符`).join(' / ')}`);
    console.log(`  同源链接        : ${e.internalLinkCount} 条；URL 形态 ${e.detailUrlPatterns.length} 种`);
    const topShape = e.detailUrlPatterns[0];
    if (topShape) console.log(`  最常见 URL 形态 : ${topShape.shape} × ${topShape.count}`);
    if (e.primaryList) {
      const p = e.primaryList;
      console.log(
        `  主列表组件      : ${p.signature} × ${p.count}，${p.width}×${p.height.median}px（高 ${p.height.min}–${p.height.max}）` +
          `，首屏完整可见 ${p.fullyVisibleFirstScreen} 个`
      );
    } else {
      console.log('  主列表组件      : 未识别到重复组件（可能是内容型页面而非列表页）');
    }
    console.log(`  外部域名        : ${(e.externalDomains || []).slice(0, 6).map(d => `${d.value}×${d.count}`).join(', ') || '无'}（共 ${(e.externalDomains || []).length} 个，请求 ${e.requestCount} 个）`);
    console.log(`  对比度抽样      : ${e.contrast.sampled} 个文本节点，最低 ${e.contrast.min}，中位 ${e.contrast.median}，低于要求 ${e.contrast.belowRequirement} 个`);
    console.log(`  暗色相关        : color-scheme=${e.meta.colorScheme || '无'}，prefers-color-scheme 规则 ${e.behavior.prefersColorSchemeRules} 条，body 背景偏暗=${e.behavior.bodyBgIsDark}`);
    console.log(`  JSON-LD 类型    : ${e.jsonLdTypes.length ? e.jsonLdTypes.join(', ') : '无'}`);
  }
  const warnings = results.flatMap(r => r.notes);
  warnings.forEach(w => console.log(`  ⚠️  ${w}`));
  console.log(`  截图            : ${shots ? path.join(path.relative(ROOT, outDir), 'shots') : '(已跳过)'}`);
}

main().catch(error => {
  console.error(`拆解失败：${error.message}`);
  if (/ETIMEDOUT|ECONNREFUSED|ERR_/.test(error.message)) {
    console.error('提示：先确认本机代理状态（例如 127.0.0.1:7890）再用 --proxy 重试 —— 直连超时 != 站点不可达。');
  }
  process.exit(1);
});
