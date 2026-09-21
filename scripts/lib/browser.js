/**
 * 无头浏览器渲染（可选能力）。
 *
 * 为什么需要：国内厂商的活动页/文档页多为 SPA，静态 fetch 只能拿到几百字节的空壳
 * HTML（`cheerio` 解析出 0 条），所以这类来源此前只能靠人工策展。用本机已装的
 * 浏览器内核把页面渲染完再取 DOM，就能把其中公开页重新纳入自动采集。
 *
 * 边界（重要）：
 *  1. **只抓公开页，不做登录态抓取**：不加载用户 profile、不注入 cookie、不传凭据。
 *  2. 不下载浏览器内核：依赖 playwright-core + 本机已安装的 Edge / Chrome。
 *  3. **不参与 CI 发布链路**：`scripts/collect.js` 默认不加载本模块，只有显式的
 *     headless 采集器才 require 它，且本地跑得通才上线。
 *  4. 与 http.js 一致遵守 robots.txt。
 */

const { chromium } = require('playwright-core');
const cheerio = require('cheerio');
const { isAllowedByRobots, DEFAULT_UA } = require('./http');
const { cleanText } = require('./schema');

/** 优先 Edge（Windows 自带）→ Chrome → playwright 自带 chromium（Linux/CI 场景） */
const CHANNELS = ['msedge', 'chrome', 'bundled'];
const DEFAULT_TIMEOUT = 30000;
/** 等目标文案出现的最长时间（CI 慢，给足余量） */
const DEFAULT_CONTENT_TIMEOUT = 25000;
/** 文案出现后的可视化稳定期：只给样式/字体留时间，不做内容等待 */
const DEFAULT_SETTLE_WAIT = 600;

let cachedChannel;

function launchOptions(target) {
  return target === 'bundled' ? { headless: true } : { channel: target, headless: true };
}

/** 探测本机可用的浏览器内核，返回内核名（'msedge' / 'chrome' / 'bundled'）；都不可用返回 null */
async function detectChannel() {
  if (cachedChannel) return cachedChannel;
  for (const target of CHANNELS) {
    let browser = null;
    try {
      browser = await chromium.launch(launchOptions(target));
      cachedChannel = target;
      return target;
    } catch (error) {
      /* 该内核不可用，试下一个 */
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
  return null;
}

async function launch(options = {}) {
  const target = options.channel || (await detectChannel());
  if (!target) {
    const error = new Error(
      '未找到可用的浏览器内核：无头采集需要本机安装 Microsoft Edge / Google Chrome，' +
      '或执行 npx playwright install chromium 安装自带内核'
    );
    error.code = 'NO_BROWSER';
    throw error;
  }
  return chromium.launch(launchOptions(target));
}

/**
 * 起一个浏览器 → 执行 fn(page) → 无论成败都关掉。
 * 一个采集器抓多个页面时应只调用一次，避免反复启动内核。
 */
async function withPage(fn, options = {}) {
  const browser = await launch(options);
  try {
    const context = await browser.newContext({
      userAgent: options.userAgent || DEFAULT_UA,
      locale: options.locale || 'zh-CN',
      viewport: options.viewport || { width: 1440, height: 900 }
    });
    const page = await context.newPage();
    return await fn(page, context);
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * 渲染单个公开页面，返回 { html, text, domText, title, url, notes, matchedNeedle, ... }
 *
 *  text    = innerText：用户在页面上看得到的文本（用于探测"可见正文"）
 *  domText = 整个 DOM 的文本，含 display:none 的横幅与未激活面板（用于规则匹配）
 *
 * 等待策略（踩坑后重写，勿改回 networkidle 主策略）：
 *  1. goto 只用 `domcontentloaded` —— `networkidle` 在有长轮询/埋点请求的 SPA 上永远不触发，
 *     超时后如果**再次 goto**，等于把页面重新加载一遍，SPA 反而来不及渲染（CI 上实测：
 *     火山方舟正常、智谱产出 0，耗时 49.7s）。
 *  2. 之后用 `waitForText` 显式等待目标文案出现在 DOM 文本里，等到就立刻继续，不用盲等。
 *  3. 最后只留一个很短的可视化稳定期（settleWait），给样式计算留时间。
 */
async function render(page, url, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    waitForText = null,
    waitForTextTimeout = DEFAULT_CONTENT_TIMEOUT,
    settleWait = DEFAULT_SETTLE_WAIT,
    allow = true,
    screenshot = null,
    diagnostics = false
  } = options;

  if (allow && !(await isAllowedByRobots(url))) {
    throw new Error(`robots.txt 不允许抓取: ${url}`);
  }

  const notes = [];
  const consoleErrors = [];
  const failedRequests = [];
  if (diagnostics) {
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(cleanText(message.text(), 200));
    });
    page.on('requestfailed', request => {
      const reason = (request.failure() && request.failure().errorText) || 'failed';
      failedRequests.push(`${reason} ${request.url()}`);
    });
  }

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  } catch (error) {
    notes.push(`goto 失败: ${String(error.message).split('\n')[0]}`);
  }

  const needles = normalizeNeedles(waitForText);
  let matchedNeedle = null;
  if (needles.length) {
    const started = Date.now();
    try {
      const handle = await page.waitForFunction(
        list => {
          const text = document.body ? document.body.textContent || '' : '';
          return list.find(needle => text.includes(needle)) || false;
        },
        needles,
        { timeout: waitForTextTimeout }
      );
      matchedNeedle = await handle.jsonValue();
    } catch (error) {
      notes.push(
        `等待目标文案超时（${Math.round((Date.now() - started) / 1000)}s，期望其一：${needles.join(' / ')}）`
      );
    }
  }

  if (settleWait) await page.waitForTimeout(settleWait);

  const html = await page.content();
  const text = await page.evaluate(() =>
    document.body ? document.body.innerText.replace(/\s+/g, ' ').trim() : ''
  );
  // domText 与 text 的区别：innerText 只含"用户可见"内容，隐藏节点（display:none 的
  // 活动横幅、未激活的 tab 面板）会被排除；domText 取整个 DOM 的文本，适合规则匹配。
  const $ = cheerio.load(html);
  $('script,style,noscript,svg').remove();
  const domText = $('body').text().replace(/\s+/g, ' ').trim();
  const title = await page.title();
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });

  return {
    html,
    text,
    domText,
    title,
    url: page.url(),
    notes,
    matchedNeedle,
    consoleErrors,
    failedRequests
  };
}

/** 一次性渲染多个 URL（共用一个内核），单个失败不影响其余 */
async function renderAll(urls, options = {}) {
  return withPage(async page => {
    const results = [];
    for (const url of urls) {
      try {
        results.push(await render(page, url, options));
      } catch (error) {
        results.push({
          url, error: error.message, html: '', text: '', domText: '', title: '',
          notes: [], matchedNeedle: null, consoleErrors: [], failedRequests: []
        });
      }
    }
    return results;
  }, options);
}

/** 把 waitForText 归一为数组 */
function normalizeNeedles(waitForText) {
  if (!waitForText) return [];
  const list = Array.isArray(waitForText) ? waitForText : [waitForText];
  return list.map(item => String(item)).filter(Boolean);
}

const available = async () => Boolean(await detectChannel());

module.exports = {
  detectChannel,
  launch,
  withPage,
  render,
  renderAll,
  normalizeNeedles,
  available
};
