'use strict';
/** Bộ định tuyến API — dùng chung cho máy chủ Node độc lập (server/index.js) và Vercel (api/index.js) */
const config = require('./config');
const { db } = require('./db');
const { HttpError, readJson, send } = require('./http');
const auth = require('./auth');
const repo = require('./repo');
const { PgError } = require('./db/pg');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  ...(config.production ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
};

const routes = [];
const r = (method, path, handler, opts = {}) => {
  const keys = []; const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, auth: opts.auth !== false });
};

/* ----- Công khai ----- */
r('GET', '/api/health', async () => {
  try { const t = Date.now(); const m = await db.query("SELECT to_regclass('public.admin_account') IS NOT NULL AS ok"); return { ok: true, db: 'connected', migrated: m.rows[0].ok, latencyMs: Date.now() - t }; }
  catch (e) { return { ok: false, db: 'error' }; }
}, { auth: false });
r('GET', '/api/auth/status', () => auth.status(), { auth: false });
r('POST', '/api/auth/setup', ({ req, body }) => auth.setup(req, body), { auth: false });
r('POST', '/api/auth/login', ({ req, res, body }) => auth.login(req, res, body), { auth: false });
r('POST', '/api/auth/logout', async ({ req, res }) => auth.logout(req, res, await auth.getSession(req)), { auth: false });

/* ----- Phiên & bảo mật (yêu cầu đăng nhập) ----- */
r('GET', '/api/auth/me', ({ sess }) => auth.me(sess));
r('GET', '/api/auth/sessions', ({ sess }) => auth.listSessions(sess));
r('DELETE', '/api/auth/sessions/:id', async ({ req, res, sess, params }) => { const out = await auth.revokeSession(req, sess, params.id); if (out.self) auth.setSessionCookie(res, '', true); return out; });
r('POST', '/api/auth/sessions/revoke-others', ({ req, sess }) => auth.revokeOthers(req, sess));
r('GET', '/api/auth/events', ({ query }) => auth.authEvents(query.get('limit')));
r('POST', '/api/auth/otp/request', ({ req, sess, body }) => auth.requestOtp(req, sess, body));
r('POST', '/api/auth/otp/verify', ({ req, sess, body }) => auth.verifyOtp(req, sess, body));
r('POST', '/api/auth/password', ({ req, res, sess, body }) => auth.changePassword(req, res, sess, body));
r('POST', '/api/security/otp-email', ({ req, sess, body }) => (body.ticket ? auth.changeEmail(req, sess, body) : auth.setInitialEmail(req, body)));
r('PUT', '/api/security/settings', ({ req, body }) => auth.setIdleMinutes(req, body));
r('GET', '/api/system/status', async () => {
  const t = Date.now(); const v = (await db.query('SELECT version() AS v, current_database() AS d, (SELECT max(version) FROM schema_migrations) AS mig')).rows[0];
  return { db: 'connected', latencyMs: Date.now() - t, server: v.v.split(' on ')[0], migration: v.mig, emailProvider: config.emailProvider || null, timezone: config.timezone };
});

/* ----- Dữ liệu HRM ----- */
r('GET', '/api/state', () => db.tx((c) => repo.loadState(c)));
r('PUT', '/api/settings', ({ body, ctx }) => db.tx((c) => repo.saveSettings(c, body.settings, ctx)));
r('PUT', '/api/employees', async ({ body, ctx }) => { const res = await db.tx((c) => repo.saveEmployees(c, body.list, ctx)); return { ...res, employees: (await db.tx((c) => repo.loadState(c, { months: [] }))).employees }; });
r('PUT', '/api/months/:ym', ({ body, params, ctx }) => db.tx((c) => repo.saveMonth(c, params.ym, body.month, ctx)));
r('POST', '/api/months/:ym/lock', ({ body, params, ctx }) => db.tx((c) => repo.lockMonth(c, params.ym, body.note, ctx)));
r('POST', '/api/months/:ym/unlock', ({ body, params, ctx }) => db.tx((c) => repo.unlockMonth(c, params.ym, body.reason, ctx)));
r('GET', '/api/backup', ({ ctx }) => db.tx(async (c) => { const b = await repo.backup(c); await repo.audit(c, 'data.backup', 'system', null, 'Tải bản sao lưu dữ liệu', null, ctx.ip); return b; }));
r('POST', '/api/restore', ({ body, ctx }) => db.tx((c) => repo.restore(c, body, ctx)));
r('GET', '/api/audit', ({ query }) => db.tx((c) => repo.auditList(c, query.get('limit'))));

async function handle(req, res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  const url = new URL(req.url, 'http://localhost');
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  try {
    const route = routes.find((x) => x.method === method && x.re.test(url.pathname));
    let sess = null;
    // Mọi API (trừ nhóm công khai) đều phải có phiên hợp lệ — kể cả đường dẫn không tồn tại
    if (!route || route.auth) {
      sess = await auth.getSession(req);
      if (!sess) throw new HttpError(401, 'Vui lòng đăng nhập', { code: 'UNAUTHENTICATED' });
      if (!route) throw new HttpError(404, 'Không tìm thấy API');
      if (method !== 'GET') auth.checkCsrf(req, sess);
      await auth.touch(sess);
    } else if (method !== 'GET') {
      // chống CSRF cho đăng nhập/thiết lập: chỉ chấp nhận yêu cầu cùng nguồn
      const origin = req.headers.origin; const host = req.headers['x-forwarded-host'] || req.headers.host;
      if (origin && host && new URL(origin).host !== host) throw new HttpError(403, 'Yêu cầu không hợp lệ (khác nguồn)');
    }
    const body = method === 'GET' ? {} : await readJson(req, config.maxBodyBytes);
    const m = route.re.exec(url.pathname); const params = {}; route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    const out = await route.handler({ req, res, body: body || {}, params, query: url.searchParams, sess, ctx: auth.ctxOf(req) });
    if (!res.headersSent) send(res, 200, out === undefined ? { ok: true } : out);
  } catch (e) {
    let status = 500, message = 'Lỗi máy chủ. Vui lòng thử lại.', extra = {};
    if (e instanceof HttpError) { status = e.status; message = e.message; if (e.code) extra.code = e.code; if (e.retryAfter) { extra.retryAfter = e.retryAfter; res.setHeader('Retry-After', String(e.retryAfter)); } }
    else if (e instanceof PgError && e.code === 'P0001') { status = 409; message = e.message; extra.code = 'LOCKED'; }
    else if (e instanceof PgError && (e.code === '23505' || e.code === '23503' || e.code === '23514')) { status = 409; message = 'Dữ liệu vi phạm ràng buộc toàn vẹn (trùng lặp hoặc không hợp lệ)'; }
    else if (e && e.status === 503) { status = 503; message = e.message; }
    else console.error('[api] ' + method + ' ' + url.pathname + ':', e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e);
    if (!res.headersSent) send(res, status, { error: message, ...extra });
  }
}

module.exports = { handle, SECURITY_HEADERS };
