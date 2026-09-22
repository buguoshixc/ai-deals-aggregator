#!/usr/bin/env node
/**
 * 优惠信号探测器（人工策展的取证工具，不写盘）。
 *
 * 用途：给一个 URL，打印页面上所有命中「免费额度 / 赠送 / 限时 / 折扣」等优惠信号的
 * 上下文片段（前后各 40 字），用来判断这个源值不值得人工登记一条策展数据。
 *
 * 与 find-offers.js 的分工：
 *   find-offers.js  面向**聚合站**条目（找"某工具在打折"）
 *   probe-offers.js 面向**厂商官方页**（找"官方自己承诺的免费额度/活动"）
 *
 * 用法：
 *   node scripts/tools/probe-offers.js <url> [<url> ...]
 *   node scripts/tools/probe-offers.js --json <url>     # 输出机读结果
 *   node scripts/tools/probe-offers.js --terms=免费额度,赠送 <url>
 *   node scripts/tools/probe-offers.js --render <url>   # 无头内核渲染后再取信号（SPA 页必用）
 *
 * 为什么要 --render：国内厂商（魔搭 / 扣子 / 火山 / 智谱控制台）多为 SPA，静态 fetch
 * 只拿到几百字节空壳、0 条信号，直接判定「没有优惠」是错的。--render 复用
 * lib/browser.js 渲染完再扫，判定才可信。需要本机装有 Edge / Chrome。
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const TIMEOUT = 20000;

const DEFAULT_TERMS = [
  '免费额度', '免费领取', '免费使用', '免费调用', '免费模型', '免费体验',
  '赠送', '代金券', '新用户', '新注册', '限时', '折扣', '五折', '立减',
  '额度', 'tokens', 'Tokens', '实名认证', '有效期', '活动'
];

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/json,*/*' },
      redirect: 'follow',
      signal: controller.signal
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, body };
  } catch (error) {
    return { ok: false, status: 0, url, error: error.name === 'AbortError' ? 'timeout' : error.message, body: '' };
  } finally {
    clearTimeout(timer);
  }
}

/** 把 HTML 压成纯文本：去 script/style，标签换空格，实体解码 */
function toText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

function snippets(text, terms, { radius = 40, max = 6 } = {}) {
  const hits = [];
  const seen = new Set();
  for (const term of terms) {
    let from = 0;
    let count = 0;
    while (count < max) {
      const at = text.indexOf(term, from);
      if (at < 0) break;
      from = at + term.length;
      const start = Math.max(0, at - radius);
      const end = Math.min(text.length, at + term.length + radius);
      const snippet = text.slice(start, end).trim();
      const key = snippet.slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ term, snippet });
      count++;
    }
  }
  return hits;
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const useRender = args.includes('--render');
  const termsArg = args.find(a => a.startsWith('--terms='));
  const terms = termsArg ? termsArg.slice(8).split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_TERMS;
  const urls = args.filter(a => /^https?:\/\//i.test(a));

  if (!urls.length) {
    console.error('用法: node scripts/tools/probe-offers.js [--json] [--render] [--terms=a,b] <url> [<url> ...]');
    process.exit(1);
  }

  // 渲染模式：一次起内核渲染全部 URL（复用 browser.js 的等待策略与 robots 检查）
  let rendered = null;
  if (useRender) {
    const browser = require('../lib/browser');
    if (!(await browser.available())) {
      console.error('未找到可用浏览器内核（需要本机安装 Edge / Chrome）：去掉 --render 只能拿到 SPA 空壳');
      process.exit(1);
    }
    // 多数文档站在 domcontentloaded 之后还要异步取正文，光等渲染完成会拿到空 body：
    // 用「等待任一目标词出现」代替盲等，等到就立刻继续（与 headless.js 采集器同一策略）
    rendered = await browser.renderAll(urls, {
      waitForText: terms,
      waitForTextTimeout: 20000,
      settleWait: 800
    });
  }

  const output = [];
  for (const [index, url] of urls.entries()) {
    let res;
    let text;
    let note = '';

    if (rendered) {
      const page = rendered[index];
      if (page.error) {
        res = { ok: false, status: 0, url: page.url || url, error: page.error };
        text = '';
      } else {
        // innerText 是「用户看得到的正文」，spa 的活动横幅常在隐藏面板里，故两者并扫
        res = { ok: true, status: 200, url: page.url };
        text = `${page.text} ${page.domText}`.replace(/\s+/g, ' ').trim();
        if (page.notes.length) note = page.notes.join('；');
      }
    } else {
      res = await fetchText(url);
      text = res.ok ? toText(res.body) : '';
    }

    const hits = text ? snippets(text, terms) : [];
    output.push({ url, finalUrl: res.url, status: res.status, error: res.error || null, rendered: Boolean(rendered), textLength: text.length, note, hits });

    if (!asJson) {
      console.log(`\n=== ${url}`);
      console.log(`    HTTP ${res.status}${res.error ? ` (${res.error})` : ''} · 正文 ${text.length} 字${res.url !== url ? ` → ${res.url}` : ''}${rendered ? ' [已渲染]' : ''}`);
      if (note) console.log(`    等待说明: ${note}`);
      if (!res.ok) { console.log('    （抓取失败，无法取证）'); continue; }
      if (text.length < 200) console.log('    ⚠️  正文极短，可能是 SPA 空壳：加 --render 重试，或人工浏览器核验');
      if (!hits.length) { console.log('    → 0 条优惠信号'); continue; }
      for (const hit of hits) console.log(`    [${hit.term}] …${hit.snippet}…`);
    }
  }

  if (asJson) console.log(JSON.stringify(output, null, 2));
}

main().catch(error => { console.error(error); process.exit(1); });
