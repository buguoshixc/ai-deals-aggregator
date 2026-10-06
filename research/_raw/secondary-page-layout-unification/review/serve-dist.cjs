/** T6 复审用：把 dist 以 http 方式服务在 127.0.0.1:8123（模拟「线上模式」的 --url= 目标）。只读。 */
const fs = require('fs');
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..', '..', '..');
const DIR = path.join(ROOT, process.argv[2] || 'dist');
const PORT = Number(process.argv[3] || 8123);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8'
};
http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  let file = path.join(DIR, rel);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file.startsWith(DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '127.0.0.1', () => console.log(`serving ${DIR} at http://127.0.0.1:${PORT}/`));
