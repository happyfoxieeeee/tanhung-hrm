'use strict';
/** Tiện ích HTTP: lỗi có mã trạng thái, đọc JSON, cookie, phản hồi an toàn */
class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; Object.assign(this, extra); }
}
function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return resolve(req.body); // Vercel đã parse sẵn
    if (typeof req.body === 'string') { try { return resolve(req.body ? JSON.parse(req.body) : {}); } catch (e) { return reject(new HttpError(400, 'JSON không hợp lệ')); } }
    const ct = String(req.headers['content-type'] || '');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'DELETE' && !/^application\/json\b/i.test(ct)) return reject(new HttpError(415, 'Yêu cầu phải dùng Content-Type: application/json'));
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > maxBytes) { reject(new HttpError(413, 'Dữ liệu gửi lên quá lớn')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { const raw = Buffer.concat(chunks).toString('utf8'); if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch (e) { reject(new HttpError(400, 'JSON không hợp lệ')); } });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {}; const h = req.headers.cookie || '';
  h.split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) { const k = p.slice(0, i).trim(); try { out[k] = decodeURIComponent(p.slice(i + 1).trim()); } catch (e) { /* bỏ qua */ } } });
  return out;
}
function cookie(name, value, { maxAge, secure, httpOnly = true, sameSite = 'Strict', path = '/' } = {}) {
  let c = `${name}=${encodeURIComponent(value)}; Path=${path}; SameSite=${sameSite}`;
  if (httpOnly) c += '; HttpOnly'; if (secure) c += '; Secure';
  if (maxAge !== undefined) c += `; Max-Age=${maxAge}`;
  return c;
}
function send(res, status, body, headers = {}) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}
function clientIp(req, trustProxy) {
  if (trustProxy) { const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim(); if (xf) return xf.slice(0, 64); const xr = req.headers['x-real-ip']; if (xr) return String(xr).slice(0, 64); }
  return String((req.socket && req.socket.remoteAddress) || '').slice(0, 64);
}
module.exports = { HttpError, readJson, parseCookies, cookie, send, clientIp };
