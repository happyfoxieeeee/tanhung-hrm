'use strict';
/** Máy chủ Node độc lập (VPS, Render, Railway, Docker…): phục vụ giao diện tĩnh + API trên cùng một cổng */
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { handle, SECURITY_HEADERS } = require('./app');

const missing = config.validate();
if (missing.length) { console.error('Thiếu biến môi trường bắt buộc: ' + missing.join(', ')); process.exit(1); }

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(400); return res.end(); }
  fs.stat(file, (err, st) => {
    const target = !err && st.isFile() ? file : path.join(PUBLIC, 'index.html');
    if (err && path.extname(p)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không tìm thấy'); }
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handle(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
});
server.headersTimeout = 30000; server.requestTimeout = 60000;
server.listen(config.port, () => console.log(`TAN HUNG HRM đang chạy tại http://localhost:${config.port} (${config.production ? 'production' : 'development'})`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
