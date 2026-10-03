'use strict';
/**
 * T18 自写静态服务器（供 browser-matrix / subpath-check 共用）。
 * 支持把产物挂在**子路径前缀**下（模拟 GitHub Pages 项目页 /ai-deals-aggregator/）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2'
};

function resolveFile(root, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = path.join(root, rel);
  if (!abs.startsWith(root)) return null;
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  const asDir = path.join(abs, 'index.html');
  if (fs.existsSync(asDir)) return asDir;
  return null;
}

/** 启动服务器；prefix 形如 '' 或 '/ai-deals-aggregator' */
function startServer(distDir, prefix = '') {
  const root = path.resolve(distDir);
  const hits = [];
  const misses = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let pathname = url.pathname;
    if (prefix && pathname.startsWith(prefix)) pathname = pathname.slice(prefix.length) || '/';
    const file = resolveFile(root, pathname);
    if (!file) {
      misses.push(pathname);
      res.statusCode = 404;
      res.end('404');
      return;
    }
    hits.push(pathname);
    res.statusCode = 200;
    res.setHeader('content-type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        base: `http://127.0.0.1:${port}${prefix}/`,
        hits, misses,
        close: () => new Promise(r => server.close(r))
      });
    });
  });
}

module.exports = { startServer, resolveFile };
