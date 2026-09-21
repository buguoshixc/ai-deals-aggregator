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

/** 优先 Edge（Windows 自带）→ Chrome → playwright 自带 chromium（Linux/CI 场景） */
const CHANNELS = ['msedge', 'chrome', 'bundled'];
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_EXTRA_WAIT = 1500;

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

/** 渲染单个公开页面，返回 { html, text, domText, title, url }
 *  text    = innerText：用户在页面上看得到的文本（用于探测"可见正文"）
 *  domText = 整个 DOM 的文本，含 display:none 的横幅与未激活面板（用于规则匹配）
 */
async function render(page, url, options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT,
    extraWait = DEFAULT_EXTRA_WAIT,
    allow = true,
    screenshot = null
  } = options;

  if (allow && !(await isAllowedByRobots(url))) {
    throw new Error(`robots.txt 不允许抓取: ${url}`);
  }

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout });
  } catch (error) {
    // 长轮询/广告请求会让 networkidle 永不触发：退一步用 domcontentloaded
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  }
  if (extraWait) await page.waitForTimeout(extraWait);

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

  return { html, text, domText, title, url: page.url() };
}

/** 一次性渲染多个 URL（共用一个内核），单个失败不影响其余 */
async function renderAll(urls, options = {}) {
  return withPage(async page => {
    const results = [];
    for (const url of urls) {
      try {
        results.push(await render(page, url, options));
      } catch (error) {
        results.push({ url, error: error.message, html: '', text: '', domText: '', title: '' });
      }
    }
    return results;
  }, options);
}

const available = async () => Boolean(await detectChannel());

module.exports = { detectChannel, launch, withPage, render, renderAll, available };
