#!/usr/bin/env node
/**
 * 演练用的**本机静态托管**（t12）：像真实静态托管那样服务一个产物目录，
 * 供 `online-smoke.cjs --base=http://127.0.0.1:<port>/<prefix>` 走**与线上完全相同**的代码路径。
 *
 * 为什么不用 `--dir=`：那条路是**读盘**，绕过了"通过 HTTP 取 sitemap / 解析绝对 URL / 站内相对链接
 * 的解析基准"这三件只在真实托管上才出现的事。演练的价值恰恰在于把它们跑一遍。
 *
 * 与线上（GitHub Pages 项目站）对齐的四处行为：
 *   ① 目录 → `index.html`（`/student/` ⇒ `dist/student/index.html`，与 Pages 同口径）；
 *   ② 支持**子路径挂载**（`--prefix=/ai-deals-aggregator/`）：项目站的 URL 就长这样，
 *      而且 sitemap 里的 `<loc>` 也带着这个前缀 —— 这是最接近线上的形状；
 *   ③ 目录请求不带尾斜杠时 301 到带斜杠（`/student` ⇒ `/student/`），与 Pages 一致；
 *   ④ 访问日志（`--log=` / 内存里也能取）：`GET /sitemap.xml 200` 这样一行行记下来 ——
 *      **这就是"确实走了 HTTP"的原始证据**。
 *
 * 只绑 `127.0.0.1`（回环），端口缺省 0 = 由内核分配随机端口。
 *
 * 用法（CLI）：
 *   node …/release/serve-dist-http.cjs --dir=dist [--prefix=/ai-deals-aggregator/] [--port=0] [--log=<file>]
 *   node …/release/serve-dist-http.cjs --dir=dist --hang          # 健壮性②：连得上但**永不响应**
 *   node …/release/serve-dist-http.cjs --dir=dist --prefix=/x/ --sitemap=<path>   # 用另一份 sitemap 顶替
 *
 * `--hang` 模式刻意只接受连接、不写任何字节：用来实测"取 sitemap 超时"这一支
 * （`online-smoke.cjs` 的 `--sitemap-timeout=`）。没有它就只能"在代码里论证"超时行为，
 * 而那正是本任务要消灭的东西。
 *
 * 也可被 `require`（编排器 `rehearse-online-path.cjs` 就是这么用的）：导出 `startStaticServer()`。
 */

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json'
};

const normalizePrefix = raw => {
  const trimmed = String(raw || '/').replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
};

/**
 * 起一个只服务 `dir` 的静态服务。
 * @param {{dir:string, prefix?:string, port?:number, hang?:boolean, log?:(line:string)=>void, overrides?:Object}} options
 *        `overrides`：路径 → 内容（绝对接管某个 URL，用来伪造 `sitemap.xml`，不必往磁盘写假文件）
 * @returns {Promise<{server:import('http').Server, port:number, base:string, access:Array, close:()=>Promise<void>}>}
 */
function startStaticServer(options) {
  const dir = path.resolve(options.dir);
  const prefix = normalizePrefix(options.prefix);
  const hang = Boolean(options.hang);
  const overrides = options.overrides || {};
  const access = [];
  const record = line => {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    access.push(stamped);
    if (typeof options.log === 'function') options.log(stamped);
  };
  if (!fs.existsSync(dir)) throw new Error(`--dir=${dir} 不存在`);

  const server = http.createServer((req, res) => {
    const urlPath = (() => { try { return decodeURIComponent(String(req.url).split('?')[0]); } catch { return null; } })();
    if (urlPath === null) { record(`GET ${req.url} 400`); res.writeHead(400).end('bad url'); return; }

    if (hang) { record(`GET ${urlPath} [--hang：接受连接但不写任何字节]`); return; }

    if (prefix !== '/' && !urlPath.startsWith(prefix)) {
      record(`GET ${urlPath} 404（不在挂载前缀 ${prefix} 下）`);
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    const rel = (prefix === '/' ? urlPath.replace(/^\/+/, '') : urlPath.slice(prefix.length)).replace(/\/+$/, '') || 'index.html';

    if (Object.prototype.hasOwnProperty.call(overrides, rel)) {
      const body = overrides[rel];
      record(`GET ${urlPath} 200 (override: ${rel}, ${Buffer.byteLength(body)}B)`);
      res.writeHead(200, { 'content-type': MIME[path.extname(rel).toLowerCase()] || 'text/plain; charset=utf-8' });
      res.end(body);
      return;
    }

    let file = path.resolve(dir, rel);
    if (!file.startsWith(dir)) { record(`GET ${urlPath} 403`); res.writeHead(403).end('forbidden'); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!urlPath.endsWith('/')) {   // ③ 与 Pages 同口径：目录不带尾斜杠 ⇒ 301
        record(`GET ${urlPath} 301 → ${urlPath}/`);
        res.writeHead(301, { location: `${urlPath}/` }).end();
        return;
      }
      file = path.join(file, 'index.html');
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      record(`GET ${urlPath} 404`);
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
      return;
    }
    record(`GET ${urlPath} 200 (${path.relative(dir, file).split(path.sep).join('/')})`);
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(options.port || 0), '127.0.0.1', () => {
      const { port } = server.address();
      const base = `http://127.0.0.1:${port}${prefix === '/' ? '/' : prefix}`;
      record(`SERVING ${dir} at ${base}${hang ? '（--hang：永不响应）' : ''}`);
      resolve({
        server, port, base, access, dir, prefix, hang,
        close: () => new Promise(done => {
          if (typeof server.closeAllConnections === 'function') server.closeAllConnections();   // --hang 会吊住连接，必须先掐
          server.close(() => done());
        })
      });
    });
  });
}

module.exports = { startStaticServer, normalizePrefix, MIME };

/* ------------------------------------------------------------------ */
/* CLI                                                                */
/* ------------------------------------------------------------------ */

if (require.main === module) {
  const arg = name => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  const LOG = arg('log');
  if (LOG) fs.mkdirSync(path.dirname(path.resolve(LOG)), { recursive: true });
  const overrides = {};
  const sitemapOverride = arg('sitemap');
  if (sitemapOverride) overrides['sitemap.xml'] = fs.readFileSync(path.resolve(sitemapOverride), 'utf8');

  startStaticServer({
    dir: arg('dir') || 'dist',
    prefix: arg('prefix') || '/',
    port: Number(arg('port') || 0),
    hang: process.argv.includes('--hang'),
    overrides,
    log: LOG ? line => fs.appendFileSync(path.resolve(LOG), `${line}\n`, 'utf8') : line => console.log(line)
  }).then(started => {
    // 给调用方（pwsh / 脚本）一行机器可读的形态，便于抓端口
    console.log(`URL=${started.base}`);
  }).catch(error => { console.error(`FAILED: ${error.message}`); process.exit(2); });
}
