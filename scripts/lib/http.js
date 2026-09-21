/**
 * 统一 HTTP 客户端：UA、超时、重试、并发限流、robots.txt 友好。
 * 采集器只应通过本模块访问网络。
 */

const axios = require('axios');

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT = 15000;
const DEFAULT_RETRIES = 2;

const robotsCache = new Map();

function client(extraHeaders = {}) {
  return axios.create({
    timeout: DEFAULT_TIMEOUT,
    headers: {
      'User-Agent': DEFAULT_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      ...extraHeaders
    },
    maxRedirects: 5,
    decompress: true,
    // 让调用方自己判断状态码，采集器不因 404 抛栈
    validateStatus: status => status >= 200 && status < 400
  });
}

const http = client();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * GET 文本，带重试。失败返回 null（单源失败不影响整体）。
 */
async function getText(url, options = {}) {
  const { retries = DEFAULT_RETRIES, timeout = DEFAULT_TIMEOUT, headers = {}, allow = true } = options;

  if (allow && !(await isAllowedByRobots(url))) {
    throw new Error(`robots.txt 不允许抓取: ${url}`);
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await http.get(url, { timeout, headers });
      return typeof res.data === 'string' ? res.data : String(res.data);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(600 * (attempt + 1));
    }
  }
  throw new Error(`${url} 抓取失败: ${describeError(lastError)}`);
}

/** GET JSON */
async function getJson(url, options = {}) {
  const text = await getText(url, options);
  return JSON.parse(text);
}

/** HEAD，返回重定向目标（用于解析厂商真实官网） */
async function followRedirect(url, options = {}) {
  try {
    const res = await axios.head(url, {
      timeout: options.timeout || 8000,
      maxRedirects: 0,
      headers: { 'User-Agent': DEFAULT_UA, ...(options.headers || {}) },
      validateStatus: s => s < 400
    });
    return res.headers && res.headers.location ? res.headers.location : null;
  } catch (error) {
    const res = error.response;
    if (res && res.status >= 300 && res.status < 400 && res.headers && res.headers.location) {
      return res.headers.location;
    }
    return null;
  }
}

/** 简易 robots.txt 检查：仅看 User-agent: * 段的 Disallow */
async function isAllowedByRobots(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    return true;
  }
  const origin = parsed.origin;
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, loadRobots(origin));
  }
  const rules = await robotsCache.get(origin);
  const path = parsed.pathname || '/';
  return !rules.some(prefix => prefix && path.startsWith(prefix));
}

async function loadRobots(origin) {
  try {
    const res = await axios.get(`${origin}/robots.txt`, {
      timeout: 6000,
      headers: { 'User-Agent': DEFAULT_UA },
      validateStatus: () => true,
      responseType: 'text'
    });
    if (res.status !== 200 || typeof res.data !== 'string') return [];
    return parseRobots(res.data);
  } catch (e) {
    return [];
  }
}

function parseRobots(text) {
  const disallow = [];
  let applies = false;
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, '').trim();
    if (!clean) continue;
    const [rawKey, ...rest] = clean.split(':');
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*';
    else if (key === 'disallow' && applies && value && value !== '/') disallow.push(value);
  }
  return disallow;
}

/** 并发映射，限制同时在跑的请求数 */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length || 1)).fill(0).map(async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { __error: describeError(error) };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function describeError(error) {
  if (!error) return 'unknown';
  if (error.response && error.response.status) return `HTTP ${error.response.status}`;
  if (error.code) return error.code;
  return error.message || String(error);
}

module.exports = {
  DEFAULT_UA,
  client,
  getText,
  getJson,
  followRedirect,
  isAllowedByRobots,
  mapLimit,
  describeError
};
