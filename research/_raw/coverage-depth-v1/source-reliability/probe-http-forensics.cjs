#!/usr/bin/env node
/**
 * 只读取证（t4 / Workstream C-1）：futurepedia（及可选的任意 URL）的**HTTP 归因实验**。
 *
 * 目的：把「本机 200 / CI 403」这一差异拆成可复核的变量，而不是凭印象归因。
 * 变量表（同 URL、同机器、逐项只改一个变量）：
 *   V1 采集器现状头（http.js 的默认 UA + Accept + Accept-Language + 采集器自己的 Referer）
 *   V2 完全不发 User-Agent
 *   V3 满浏览器头（sec-ch-ua / sec-fetch-* / Accept-Encoding: br）
 *   V4 Googlebot UA（对照：是否按 UA 分流）
 *   V5 生产路径 http.getText()（robot 检查 + 重试全都在内）—— 与采集器逐字同一条代码路径
 *   V6 3 轮连续首页请求（时间敏感反证：每轮记时间戳与结果）
 *   V7 详情页（/tool/...）N 个：确认失败/成功是否只发生在首页
 *   V8 robots.txt 原文与解析结果
 *   V9 出口身份（api.ipify.org）：本机出口 IP ≠ GitHub Actions 出口 IP 是本轮**唯一**无法在
 *      本机复现的变量，必须把它的读数记下来（不是结论，是观测）
 *
 * 纪律：只发公开 GET；只写本目录；不写任何生产文件。
 *
 * 用法：node probe-http-forensics.cjs [--url=https://www.futurepedia.io/] [--tag=fp] [--details=3]
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const httpLib = require(path.join(ROOT, 'scripts', 'lib', 'http'));
const domDigest = require(path.join(ROOT, 'scripts', 'lib', 'dom-digest'));

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const found = args.find(a => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const TARGET = opt('url', 'https://www.futurepedia.io/');
const TAG = opt('tag', 'fp');
const DETAILS = Number(opt('details', '3'));
const UA = httpLib.DEFAULT_UA;
const COLLECTOR_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://www.futurepedia.io/'
};

const nowIso = () => new Date().toISOString();

/** 只保留诊断需要的响应头（原始值，不做解释） */
const HEADER_WHITELIST = [
  'server', 'date', 'content-type', 'content-length', 'cache-control', 'cf-ray', 'cf-cache-status',
  'cf-mitigated', 'x-vercel-id', 'x-vercel-cache', 'via', 'age', 'location', 'vary', 'set-cookie',
  'x-powered-by', 'x-amz-cf-id', 'x-cache', 'alt-svc', 'content-encoding', 'strict-transport-security'
];

function pickHeaders(headers = {}) {
  const out = {};
  for (const key of Object.keys(headers)) {
    if (HEADER_WHITELIST.includes(key.toLowerCase())) {
      const value = headers[key];
      out[key] = key.toLowerCase() === 'set-cookie'
        ? `[${Array.isArray(value) ? value.length : 1} cookie(s)]`
        : String(value).slice(0, 200);
    }
  }
  return out;
}

async function rawGet(url, headers, extra = {}) {
  const started = Date.now();
  const res = await axios.get(url, {
    timeout: extra.timeout || 20000,
    headers,
    maxRedirects: extra.maxRedirects === undefined ? 0 : extra.maxRedirects,
    decompress: true,
    validateStatus: () => true,
    responseType: extra.responseType || 'text'
  });
  const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  const socket = res.request && res.request.socket;
  const httpRes = res.request && res.request.res;
  return {
    requestedAtUtc: nowIso(),
    url,
    status: res.status,
    ms: Date.now() - started,
    bytes: body.length,
    httpVersion: (httpRes && httpRes.httpVersion) || null,
    remoteAddress: (socket && socket.remoteAddress) || null,
    remoteFamily: (socket && socket.remoteFamily) || null,
    headers: pickHeaders(res.headers),
    location: res.headers && res.headers.location ? String(res.headers.location) : null,
    body
  };
}

/** 结构摘要（生产 lib/dom-digest.js 的同一函数）：回答「HTML 结构有没有变」 */
function digestOf(body, opts = {}) {
  return domDigest.digest(body, opts);
}

async function main() {
  const out = {
    probe: 'probe-http-forensics.cjs',
    tag: TAG,
    target: TARGET,
    ranAtUtc: nowIso(),
    ranAtLocal: new Date().toString(),
    node: process.version,
    collectorUA: UA,
    collectorHeaders: COLLECTOR_HEADERS,
    variants: {},
    rounds: [],
    details: [],
    robots: null,
    egress: null,
    productionPath: null,
    notes: []
  };

  // ---------- V1：采集器现状头，0 重定向 & 跟随重定向两次观测 ----------
  {
    const raw = await rawGet(TARGET, COLLECTOR_HEADERS, { maxRedirects: 0 });
    out.variants.V1_collector_headers_no_follow = {
      status: raw.status, ms: raw.ms, bytes: raw.bytes, location: raw.location,
      httpVersion: raw.httpVersion, remoteAddress: raw.remoteAddress, remoteFamily: raw.remoteFamily,
      headers: raw.headers,
      digest: raw.status === 200 ? digestOf(raw.body, { url: TARGET, httpStatus: raw.status }) : null
    };
    const followed = await rawGet(TARGET, COLLECTOR_HEADERS, { maxRedirects: 5 });
    out.variants.V1b_collector_headers_followed = {
      status: followed.status, ms: followed.ms, bytes: followed.bytes, location: followed.location,
      headers: followed.headers,
      digest: followed.status === 200 ? digestOf(followed.body, { url: TARGET, httpStatus: followed.status }) : null,
      title: (followed.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || null
    };
  }

  // ---------- V2：完全不发 UA ----------
  {
    const raw = await rawGet(TARGET, {}, { maxRedirects: 5 });
    out.variants.V2_no_ua = { status: raw.status, ms: raw.ms, bytes: raw.bytes, headers: raw.headers };
  }

  // ---------- V3：满浏览器头 ----------
  {
    const headers = {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'sec-ch-ua': '"Chromium";v="125", "Not.A/Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'document',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-site': 'none',
      'sec-fetch-user': '?1',
      'upgrade-insecure-requests': '1',
      Referer: 'https://www.futurepedia.io/'
    };
    const raw = await rawGet(TARGET, headers, { maxRedirects: 5 });
    out.variants.V3_full_browser_headers = { status: raw.status, ms: raw.ms, bytes: raw.bytes, headers: raw.headers };
  }

  // ---------- V4：Googlebot UA ----------
  {
    const raw = await rawGet(TARGET, {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    }, { maxRedirects: 5 });
    out.variants.V4_googlebot_ua = { status: raw.status, ms: raw.ms, bytes: raw.bytes, headers: raw.headers };
  }

  // ---------- V5：生产路径 http.getText() ----------
  {
    const started = Date.now();
    try {
      const html = await httpLib.getText(TARGET, { headers: { Referer: 'https://www.futurepedia.io/' } });
      out.productionPath = {
        ok: true, ms: Date.now() - started, bytes: html.length,
        atUtc: nowIso(),
        digest: digestOf(html, { url: TARGET, httpStatus: 200 })
      };
    } catch (error) {
      out.productionPath = { ok: false, ms: Date.now() - started, error: httpLib.describeError(error), atUtc: nowIso() };
    }
  }

  // ---------- V6：3 轮连续首页请求 ----------
  for (let i = 1; i <= 3; i++) {
    const raw = await rawGet(TARGET, COLLECTOR_HEADERS, { maxRedirects: 5 });
    out.rounds.push({
      round: i,
      requestedAtUtc: raw.requestedAtUtc,
      status: raw.status,
      ms: raw.ms,
      bytes: raw.bytes,
      cfRay: raw.headers['cf-ray'] || null,
      server: raw.headers.server || null,
      ipHits: raw.status === 200 ? (raw.body.match(/\/tool\//g) || []).length : 0,
      digestMarkers: raw.status === 200 ? digestOf(raw.body, { url: TARGET, httpStatus: raw.status }).markers : null
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // ---------- V7：详情页（详情 URL 用**生产解析器**取，不自己写正则） ----------
  const homeBody = out.variants.V1b_collector_headers_followed.digest
    ? (await rawGet(TARGET, COLLECTOR_HEADERS, { maxRedirects: 5 })).body
    : '';
  const detailUrls = [];
  {
    const registry = require(path.join(ROOT, 'scripts', 'collectors'));
    const collector = registry.all({}).find(c => c.id === 'futurepedia');
    let parsed = [];
    if (collector && typeof collector.parse === 'function') {
      parsed = collector.parse(homeBody);
      out.notes.push(`详情页 URL 由生产解析器 collector.parse() 取得：共 ${parsed.length} 条`);
    }
    for (const page of parsed) {
      if (detailUrls.length >= DETAILS) break;
      if (page && page.pageUrl && !detailUrls.includes(page.pageUrl)) detailUrls.push(page.pageUrl);
    }
    if (!detailUrls.length) {
      const re = /href="(\/tool\/[^"#?]+)"/g;
      let m;
      while ((m = re.exec(homeBody)) && detailUrls.length < DETAILS) {
        const url = m[1].startsWith('http') ? m[1] : `https://www.futurepedia.io${m[1]}`;
        if (!detailUrls.includes(url)) detailUrls.push(url);
      }
      out.notes.push('生产解析器没给出详情 URL，回退到 href 正则（读数时请注明）');
    }
  }
  for (const url of detailUrls) {
    const raw = await rawGet(url, COLLECTOR_HEADERS, { maxRedirects: 5 });
    const title = (raw.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || null;
    out.details.push({
      url,
      requestedAtUtc: raw.requestedAtUtc,
      status: raw.status,
      ms: raw.ms,
      bytes: raw.bytes,
      title,
      cfRay: raw.headers['cf-ray'] || null,
      digest: raw.status === 200 ? digestOf(raw.body, { url, httpStatus: raw.status }) : null
    });
  }

  // ---------- V8：robots.txt ----------
  {
    const robotsUrl = 'https://www.futurepedia.io/robots.txt';
    const raw = await rawGet(robotsUrl, COLLECTOR_HEADERS, { maxRedirects: 5 });
    out.robots = {
      url: robotsUrl,
      status: raw.status,
      ms: raw.ms,
      bytes: raw.bytes,
      headers: raw.headers,
      body: raw.body.slice(0, 4000),
      allowedHome: await httpLib.isAllowedByRobots('https://www.futurepedia.io/'),
      allowedTool: await httpLib.isAllowedByRobots('https://www.futurepedia.io/tool/example')
    };
  }

  // ---------- V9：本机出口 IP（多个回显服务，任一可用即可） ----------
  out.egress = { atUtc: nowIso(), attempts: [] };
  for (const echoUrl of ['https://api.ipify.org?format=json', 'https://ifconfig.me/ip', 'https://icanhazip.com']) {
    try {
      const raw = await rawGet(echoUrl, { 'User-Agent': UA }, { maxRedirects: 5, timeout: 15000 });
      const text = raw.body.trim().slice(0, 120);
      const ip = (text.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/) || [])[0] || null;
      out.egress.attempts.push({ url: echoUrl, status: raw.status, body: text, ip, remoteAddress: raw.remoteAddress });
      if (ip) { out.egress.observedIp = ip; out.egress.source = echoUrl; break; }
    } catch (error) {
      out.egress.attempts.push({ url: echoUrl, error: String(error.message).slice(0, 160) });
    }
  }
  try {
    const trace = await rawGet('https://www.futurepedia.io/cdn-cgi/trace', { 'User-Agent': UA }, { maxRedirects: 5, timeout: 15000 });
    out.egress.zoneTrace = { status: trace.status, body: trace.body.slice(0, 600) };
  } catch (error) {
    out.egress.zoneTrace = { error: String(error.message).slice(0, 160) };
  }

  out.notes.push('本探针只发公开 GET；所有变体同 URL、同机器，逐项只改一个变量。');
  out.notes.push('V9 是本机出口读数，不是对 Cloudflare 的断言：本机与 GitHub Actions 的出口 IP/机房必然不同。');

  const outFile = path.join(__dirname, `http-forensics-${TAG}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

  const line = (label, v) => console.log(`${label.padEnd(34)} status=${v.status} bytes=${v.bytes} ms=${v.ms}${v.location ? ` location=${v.location}` : ''}`);
  console.log(`[http-forensics] target=${TARGET} ranAt=${out.ranAtUtc}`);
  for (const [key, value] of Object.entries(out.variants)) line(key, value);
  console.log(`productionPath http.getText(): ${JSON.stringify(out.productionPath && { ok: out.productionPath.ok, bytes: out.productionPath.bytes, ms: out.productionPath.ms, error: out.productionPath.error || null })}`);
  for (const round of out.rounds) console.log(`round${round.round} ${round.requestedAtUtc} status=${round.status} bytes=${round.bytes} cf-ray=${round.cfRay} /tool/ 出现=${round.ipHits}`);
  for (const detail of out.details) console.log(`detail ${detail.status} ${detail.bytes}B ${detail.url}`);
  console.log(`robots.txt status=${out.robots.status} bytes=${out.robots.bytes} allowedHome=${out.robots.allowedHome} allowedTool=${out.robots.allowedTool}`);
  console.log(`egress=${JSON.stringify(out.egress)}`);
  console.log(`[http-forensics] 写出: ${outFile}`);
}

main().catch(error => {
  console.error(`[http-forensics] 失败: ${error.stack || error.message}`);
  process.exit(1);
});
