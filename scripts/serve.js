#!/usr/bin/env node
/**
 * 零依赖本地预览服务器（避免依赖 npx http-server 联网下载）。
 *
 * 用法：
 *   node scripts/serve.js                 # 预览仓库根目录（源码 index.html）
 *   node scripts/serve.js --dir=dist      # 预览发布产物（预渲染后的 index.html）
 *   node scripts/serve.js --port 8080
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? Number(process.argv[portArg + 1]) : 8080;
const dirArg = process.argv.find(a => a.startsWith('--dir='));
const ROOT = dirArg
  ? path.resolve(dirArg.slice(6))
  : path.join(__dirname, '..');

if (!fs.existsSync(ROOT)) {
  console.error(`目录不存在: ${ROOT}（先跑 npm run build 生成 dist/）`);
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);

  // 防目录穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`本地预览： http://127.0.0.1:${PORT}/`);
  console.log(`服务目录： ${ROOT}`);
  console.log('（Ctrl+C 停止）');
});
