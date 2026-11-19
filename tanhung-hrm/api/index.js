'use strict';
/** Điểm vào serverless cho Vercel: mọi yêu cầu /api/* được chuyển tới bộ định tuyến chung */
const { handle } = require('../server/app');
const config = require('../server/config');
module.exports = async (req, res) => {
  const missing = config.validate();
  if (missing.length) { res.statusCode = 503; res.setHeader('Content-Type', 'application/json; charset=utf-8'); return res.end(JSON.stringify({ error: 'Máy chủ chưa cấu hình đủ biến môi trường: ' + missing.join(', ') })); }
  // Khi Vercel chuyển tiếp qua rewrite, khôi phục đường dẫn gốc từ tham số __path
  const u = new URL(req.url, 'http://localhost');
  if (u.searchParams.has('__path')) { const p = u.searchParams.get('__path'); u.searchParams.delete('__path'); const qs = u.searchParams.toString(); req.url = '/api/' + p.replace(/^\/+/, '') + (qs ? '?' + qs : ''); }
  return handle(req, res);
};
