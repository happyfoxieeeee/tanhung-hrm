'use strict';
/**
 * Xác thực một tài khoản quản trị duy nhất:
 *  - Thiết lập mật khẩu lần đầu bằng INITIAL_SETUP_TOKEN (dùng một lần, khóa vĩnh viễn sau khi đã có tài khoản)
 *  - Đăng nhập (Argon2id), giới hạn đăng nhập sai theo IP và toàn cục, khóa tạm thời
 *  - Phiên làm việc lưu ở CSDL (token băm SHA-256), cookie HttpOnly/Secure/SameSite=Strict, CSRF token, tự hết hạn khi không hoạt động
 *  - OTP 6 số qua email để đổi mật khẩu / đổi email nhận OTP (HMAC, 5 phút, dùng một lần, giới hạn nhập sai & gửi lại)
 */
const crypto = require('crypto');
const config = require('./config');
const { db } = require('./db');
const { HttpError, cookie, parseCookies, clientIp } = require('./http');
const argon2 = require('./crypto/argon2');
const mail = require('./mail');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const hmac = (s) => crypto.createHmac('sha256', config.appSecret).update(String(s)).digest('hex');
const token = (n = 32) => crypto.randomBytes(n).toString('base64url');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
// Băm giả để thời gian phản hồi giống nhau khi username sai / chưa có tài khoản
let dummyHash = null;
const getDummy = () => dummyHash || (dummyHash = argon2.hashPassword(crypto.randomBytes(16).toString('hex')));

function ctxOf(req) { return { ip: clientIp(req, config.trustProxy), ua: String(req.headers['user-agent'] || '').slice(0, 300) }; }
async function event(c, name, success, ctx, detail) {
  await (c || db).query('INSERT INTO auth_events (event, success, ip, user_agent, detail) VALUES ($1,$2,$3,$4,$5)', [name, success, ctx.ip || null, ctx.ua || null, detail ? String(detail).slice(0, 500) : null]);
}

/* ---------- Chính sách mật khẩu ---------- */
function passwordProblems(pw, username = config.adminUsername) {
  const p = []; const s = String(pw || '');
  if (s.length < 10) p.push('tối thiểu 10 ký tự');
  if (s.length > 128) p.push('tối đa 128 ký tự');
  if (!/[a-zà-ỹ]/.test(s)) p.push('có chữ thường');
  if (!/[A-ZÀ-Ỹ]/.test(s)) p.push('có chữ hoa');
  if (!/\d/.test(s)) p.push('có chữ số');
  if (!/[^A-Za-z0-9À-ỹ]/.test(s)) p.push('có ký tự đặc biệt');
  if (username && s.toLowerCase().includes(username.toLowerCase())) p.push('không chứa tên đăng nhập');
  if (/^(.)\1+$/.test(s)) p.push('không lặp một ký tự');
  return p;
}
function checkPassword(pw, confirm) {
  const p = passwordProblems(pw); if (p.length) throw new HttpError(400, 'Mật khẩu chưa đạt yêu cầu: ' + p.join(', '));
  if (pw !== confirm) throw new HttpError(400, 'Mật khẩu xác nhận không khớp');
}
function maskEmail(e) {
  if (!e) return null; const [local, domain = ''] = e.split('@'); const parts = domain.split('.'); const tld = parts.length > 1 ? parts.pop() : '';
  const m = (x, keep) => x.slice(0, keep) + '*'.repeat(Math.max(2, x.length - keep));
  return `${m(local, Math.min(2, local.length))}@${m(parts.join('.'), 1)}${tld ? '.' + tld : ''}`;
}
const validEmail = (e) => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/.test(e) && e.length <= 254;

async function getAdmin(c) { return (await (c || db).query('SELECT * FROM admin_account WHERE id = 1')).rows[0] || null; }
function otpEmailOf(admin) { return config.adminOtpEmail || (admin && admin.otp_email) || ''; }

/* ---------- Trạng thái & thiết lập lần đầu ---------- */
async function status() { const a = await getAdmin(); return { setupRequired: !a, username: config.adminUsername, setupTokenConfigured: !!config.initialSetupToken }; }

async function setup(req, body) {
  const ctx = ctxOf(req);
  if (!config.initialSetupToken || config.initialSetupToken.length < 24) throw new HttpError(503, 'Máy chủ chưa cấu hình INITIAL_SETUP_TOKEN (tối thiểu 24 ký tự)');
  const fails = (await db.query("SELECT count(*)::int AS n FROM auth_events WHERE event = 'setup' AND success = false AND ip = $1 AND at > now() - interval '15 minutes'", [ctx.ip])).rows[0].n;
  if (fails >= 5) throw new HttpError(429, 'Thử thiết lập sai quá nhiều lần. Vui lòng thử lại sau 15 phút.');
  if (await getAdmin()) { await event(null, 'setup', false, ctx, 'đã khởi tạo trước đó'); throw new HttpError(409, 'Hệ thống đã được khởi tạo. Không thể chạy lại thiết lập lần đầu.', { code: 'ALREADY_SETUP' }); }
  const tok = String(body.setupToken || '');
  const tokHash = sha256(tok);
  if (!safeEq(tokHash, sha256(config.initialSetupToken))) { await event(null, 'setup', false, ctx, 'sai mã thiết lập'); throw new HttpError(403, 'Mã thiết lập ban đầu (INITIAL_SETUP_TOKEN) không đúng'); }
  if ((await db.query('SELECT 1 FROM setup_tokens_used WHERE token_hash = $1', [tokHash])).rows.length) { await event(null, 'setup', false, ctx, 'mã đã dùng'); throw new HttpError(403, 'Mã thiết lập này đã được sử dụng'); }
  if (String(body.username || '') !== config.adminUsername) throw new HttpError(400, 'Tên đăng nhập phải là ' + config.adminUsername);
  checkPassword(body.password, body.confirm);
  const hash = argon2.hashPassword(body.password);
  await db.tx(async (c) => {
    const r = await c.query('INSERT INTO admin_account (id, username, password_hash, idle_minutes) VALUES (1, $1, $2, $3) ON CONFLICT (id) DO NOTHING', [config.adminUsername, hash, config.session.idleMinutesDefault]);
    if (r.rowCount !== 1) throw new HttpError(409, 'Hệ thống đã được khởi tạo. Không thể chạy lại thiết lập lần đầu.', { code: 'ALREADY_SETUP' });
    await c.query('INSERT INTO setup_tokens_used (token_hash) VALUES ($1)', [tokHash]);
    await event(c, 'setup', true, ctx, 'thiết lập mật khẩu quản trị lần đầu');
    await c.query("INSERT INTO audit_log (action, entity, summary, ip) VALUES ('auth.setup', 'admin', 'Thiết lập mật khẩu quản trị lần đầu', $1)", [ctx.ip]);
  });
  return { ok: true };
}

/* ---------- Đăng nhập / phiên ---------- */
async function login(req, res, body) {
  const ctx = ctxOf(req); const L = config.login;
  const admin = await getAdmin();
  if (!admin) throw new HttpError(409, 'Hệ thống chưa được thiết lập mật khẩu quản trị', { code: 'SETUP_REQUIRED' });
  if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(admin.locked_until) - Date.now()) / 60000);
    await event(null, 'login', false, ctx, 'tài khoản đang tạm khóa');
    throw new HttpError(429, `Tài khoản tạm khóa do đăng nhập sai nhiều lần. Thử lại sau ${mins} phút.`, { retryAfter: mins * 60 });
  }
  const ipFails = (await db.query(`SELECT count(*)::int AS n, max(at) AS last FROM auth_events WHERE event = 'login' AND success = false AND ip = $1 AND at > now() - make_interval(mins => $2)`, [ctx.ip, L.windowMinutes])).rows[0];
  if (ipFails.n >= L.maxFailsPerIp) {
    const until = new Date(new Date(ipFails.last).getTime() + L.lockMinutes * 60000); const mins = Math.max(1, Math.ceil((until - Date.now()) / 60000));
    throw new HttpError(429, `Đăng nhập sai quá ${L.maxFailsPerIp} lần. Vui lòng thử lại sau ${mins} phút.`, { retryAfter: mins * 60 });
  }
  const userOk = safeEq(String(body.username || ''), config.adminUsername);
  const pwOk = argon2.verifyPassword(String(body.password || '').slice(0, 256), userOk ? admin.password_hash : getDummy()) && userOk;
  if (!pwOk) {
    await event(null, 'login', false, ctx, userOk ? 'sai mật khẩu' : 'sai tên đăng nhập');
    const g = (await db.query(`SELECT count(*)::int AS n FROM auth_events WHERE event = 'login' AND success = false AND at > now() - make_interval(mins => $1)`, [L.windowMinutes])).rows[0].n;
    if (g >= L.maxFailsGlobal) { await db.query('UPDATE admin_account SET locked_until = now() + make_interval(mins => $1) WHERE id = 1', [L.lockMinutes]); await event(null, 'lockout', true, ctx, `khóa ${L.lockMinutes} phút do ${g} lần sai`); }
    const left = Math.max(0, L.maxFailsPerIp - ipFails.n - 1);
    throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng' + (left <= 2 ? ` (còn ${left} lần thử)` : ''));
  }
  if (argon2.needsRehash(admin.password_hash)) await db.query('UPDATE admin_account SET password_hash = $1 WHERE id = 1', [argon2.hashPassword(body.password)]);
  const sess = await createSession(ctx);
  await event(null, 'login', true, ctx, 'đăng nhập thành công');
  housekeeping().catch(() => {});
  setSessionCookie(res, sess.token);
  return { ok: true };
}
async function createSession(ctx) {
  const t = token(32); const csrf = token(24);
  const r = await db.query(`INSERT INTO sessions (token_hash, csrf_token, expires_at, ip, user_agent) VALUES ($1, $2, now() + make_interval(hours => $3), $4, $5) RETURNING id`, [sha256(t), csrf, config.session.maxHours, ctx.ip, ctx.ua]);
  return { id: r.rows[0].id, token: t, csrf };
}
function setSessionCookie(res, value, clear) {
  res.setHeader('Set-Cookie', cookie(config.session.cookieName, clear ? '' : value, { maxAge: clear ? 0 : config.session.maxHours * 3600, secure: config.session.secureCookie }));
}
/** Lấy phiên hợp lệ từ cookie (tự thu hồi khi quá thời gian không hoạt động) */
async function getSession(req) {
  const t = parseCookies(req)[config.session.cookieName]; if (!t || t.length > 100) return null;
  const r = (await db.query(`SELECT s.*, a.idle_minutes, a.password_changed_at FROM sessions s CROSS JOIN admin_account a
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [sha256(t)])).rows[0];
  if (!r) return null;
  const idleMs = r.idle_minutes * 60000;
  if (Date.now() - new Date(r.last_seen_at).getTime() > idleMs) {
    await db.query("UPDATE sessions SET revoked_at = now(), revoke_reason = 'hết thời gian không hoạt động' WHERE id = $1", [r.id]);
    await event(null, 'session_timeout', true, ctxOf(req), 'tự đăng xuất do không hoạt động');
    return null;
  }
  return r;
}
async function touch(sess) { if (Date.now() - new Date(sess.last_seen_at).getTime() > 15000) await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [sess.id]); }
function checkCsrf(req, sess) {
  const h = String(req.headers['x-csrf-token'] || '');
  if (!h || !safeEq(h, sess.csrf_token)) throw new HttpError(403, 'Phiên làm việc không hợp lệ (CSRF). Vui lòng tải lại trang.');
}
async function logout(req, res, sess) {
  if (sess) { await db.query("UPDATE sessions SET revoked_at = now(), revoke_reason = 'đăng xuất' WHERE id = $1", [sess.id]); await event(null, 'logout', true, ctxOf(req)); }
  setSessionCookie(res, '', true);
  return { ok: true };
}
async function me(sess) {
  const admin = await getAdmin(); const email = otpEmailOf(admin);
  return { username: admin.username, csrfToken: sess.csrf_token, sessionId: sess.id, idleMinutes: admin.idle_minutes, expiresAt: sess.expires_at,
    maskedEmail: maskEmail(email), emailSource: config.adminOtpEmail ? 'env' : (admin.otp_email ? 'db' : null), emailConfigured: !!config.emailProvider,
    passwordChangedAt: admin.password_changed_at, timezone: config.timezone };
}
async function listSessions(sess) {
  const rows = (await db.query(`SELECT id, created_at, last_seen_at, expires_at, ip, user_agent FROM sessions WHERE revoked_at IS NULL AND expires_at > now() ORDER BY last_seen_at DESC`)).rows;
  return rows.map((r) => ({ ...r, current: r.id === sess.id }));
}
async function revokeSession(req, sess, id) {
  if (!/^[0-9a-f-]{36}$/.test(String(id))) throw new HttpError(400, 'Mã phiên không hợp lệ');
  await db.query("UPDATE sessions SET revoked_at = now(), revoke_reason = 'thu hồi thủ công' WHERE id = $1 AND revoked_at IS NULL", [id]);
  await event(null, 'session_revoke', true, ctxOf(req), id === sess.id ? 'thu hồi phiên hiện tại' : 'thu hồi phiên ' + id.slice(0, 8));
  return { ok: true, self: id === sess.id };
}
async function revokeOthers(req, sess) {
  const r = await db.query("UPDATE sessions SET revoked_at = now(), revoke_reason = 'đăng xuất các thiết bị khác' WHERE revoked_at IS NULL AND id <> $1", [sess.id]);
  await event(null, 'session_revoke', true, ctxOf(req), `thu hồi ${r.rowCount} phiên khác`);
  return { ok: true, revoked: r.rowCount };
}
async function authEvents(limit) { return (await db.query('SELECT at, event, success, ip, user_agent, detail FROM auth_events ORDER BY at DESC, id DESC LIMIT $1', [Math.min(500, Math.max(1, Number(limit) || 100))])).rows; }

/* ---------- OTP qua email ---------- */
const PURPOSE_LABEL = { password: 'đổi mật khẩu', email: 'đổi email nhận mã OTP' };
async function requestOtp(req, sess, body) {
  const ctx = ctxOf(req); const O = config.otp;
  const purpose = body.purpose === 'email' ? 'email' : 'password';
  const admin = await getAdmin(); const email = otpEmailOf(admin);
  if (!email) throw new HttpError(400, 'Chưa cấu hình email nhận mã OTP. Đặt biến môi trường ADMIN_OTP_EMAIL hoặc khai báo trong Cài đặt › Bảo mật.');
  if (!config.emailProvider) throw new HttpError(503, 'Máy chủ chưa cấu hình dịch vụ gửi email (EMAIL_PROVIDER/SMTP).');
  let newEmail = null;
  if (purpose === 'email') {
    if (config.adminOtpEmail) throw new HttpError(400, 'Email nhận OTP đang được cố định bằng biến môi trường ADMIN_OTP_EMAIL');
    newEmail = String(body.newEmail || '').trim().toLowerCase(); if (!validEmail(newEmail)) throw new HttpError(400, 'Email mới không hợp lệ');
  }
  const last = (await db.query('SELECT created_at FROM otp_requests ORDER BY created_at DESC LIMIT 1')).rows[0];
  if (last) { const wait = O.cooldownSeconds - Math.floor((Date.now() - new Date(last.created_at).getTime()) / 1000); if (wait > 0) throw new HttpError(429, `Vui lòng chờ ${wait} giây trước khi yêu cầu mã mới.`, { retryAfter: wait }); }
  const hourly = (await db.query("SELECT count(*)::int AS n FROM otp_requests WHERE created_at > now() - interval '1 hour'")).rows[0].n;
  if (hourly >= O.maxPerHour) throw new HttpError(429, `Đã gửi quá ${O.maxPerHour} mã trong 1 giờ. Vui lòng thử lại sau.`);
  const id = crypto.randomUUID(); const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await db.tx(async (c) => {
    await c.query('UPDATE otp_requests SET invalidated_at = now() WHERE used_at IS NULL AND invalidated_at IS NULL');
    await c.query(`INSERT INTO otp_requests (id, session_id, purpose, code_hash, email, new_email, expires_at) VALUES ($1, $2, $3, $4, $5, $6, now() + make_interval(mins => $7))`, [id, sess.id, purpose, hmac(id + ':' + code), email, newEmail, O.ttlMinutes]);
  });
  try {
    await mail.sendMail({ to: email, ...mail.otpEmail({ code, minutes: O.ttlMinutes, purposeLabel: PURPOSE_LABEL[purpose] }) });
  } catch (e) {
    await db.query('UPDATE otp_requests SET invalidated_at = now() WHERE id = $1', [id]);
    await event(null, 'otp_send', false, ctx, 'gửi email thất bại: ' + String(e.message).slice(0, 200));
    console.error('[otp] gửi email thất bại:', e.message);
    throw new HttpError(502, 'Không gửi được email chứa mã OTP. Kiểm tra cấu hình SMTP/email của máy chủ.');
  }
  await event(null, 'otp_send', true, ctx, PURPOSE_LABEL[purpose]);
  return { requestId: id, maskedEmail: maskEmail(email), expiresInSeconds: O.ttlMinutes * 60, resendAfterSeconds: O.cooldownSeconds, maxAttempts: O.maxAttempts };
}
async function verifyOtp(req, sess, body) {
  const ctx = ctxOf(req); const O = config.otp;
  const id = String(body.requestId || ''); const code = String(body.code || '').trim();
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(400, 'Yêu cầu xác thực không hợp lệ');
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'Mã OTP gồm đúng 6 chữ số');
  const out = await db.tx(async (c) => {
    const r = (await c.query('SELECT * FROM otp_requests WHERE id = $1 AND session_id = $2 FOR UPDATE', [id, sess.id])).rows[0];
    if (!r) { await event(c, 'otp_verify', false, ctx, 'không thuộc phiên hiện tại'); return { __err: new HttpError(400, 'Mã OTP không thuộc phiên yêu cầu này. Vui lòng yêu cầu mã mới.') }; }
    if (r.used_at) { await event(c, 'otp_verify', false, ctx, 'mã đã sử dụng'); return { __err: new HttpError(400, 'Mã OTP đã được sử dụng. Vui lòng yêu cầu mã mới.', { code: 'OTP_USED' }) }; }
    if (r.invalidated_at) { await event(c, 'otp_verify', false, ctx, 'mã đã vô hiệu'); return { __err: new HttpError(400, 'Mã OTP đã bị vô hiệu (đã có mã mới hoặc nhập sai quá số lần). Vui lòng yêu cầu mã mới.', { code: 'OTP_INVALID' }) }; }
    if (new Date(r.expires_at) <= new Date()) { await event(c, 'otp_verify', false, ctx, 'mã hết hạn'); return { __err: new HttpError(400, 'Mã OTP đã hết hạn. Vui lòng yêu cầu mã mới.', { code: 'OTP_EXPIRED' }) }; }
    if (!safeEq(hmac(id + ':' + code), r.code_hash)) {
      const attempts = r.attempts + 1; const dead = attempts >= O.maxAttempts;
      await c.query(`UPDATE otp_requests SET attempts = $2${dead ? ', invalidated_at = now()' : ''} WHERE id = $1`, [id, attempts]);
      await event(c, 'otp_verify', false, ctx, `sai mã (lần ${attempts})`);
      return { __err: new HttpError(400, dead ? 'Nhập sai quá số lần cho phép. Mã đã bị vô hiệu, vui lòng yêu cầu mã mới.' : `Mã OTP không đúng. Còn ${O.maxAttempts - attempts} lần thử.`, { code: dead ? 'OTP_INVALID' : 'OTP_WRONG' }) };
    }
    await c.query('UPDATE otp_requests SET used_at = now() WHERE id = $1', [id]);
    const t = token(32);
    await c.query(`INSERT INTO auth_tickets (session_id, otp_id, purpose, token_hash, payload, expires_at) VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6))`, [sess.id, id, r.purpose, sha256(t), r.new_email, O.ticketMinutes]);
    await event(c, 'otp_verify', true, ctx, PURPOSE_LABEL[r.purpose]);
    return { ticket: t, purpose: r.purpose, expiresInSeconds: O.ticketMinutes * 60 };
  });
  if (out.__err) throw out.__err; // lỗi được ném SAU khi commit để lưu số lần nhập sai / nhật ký
  return out;
}
async function useTicket(c, sess, t, purpose) {
  const r = (await c.query('SELECT * FROM auth_tickets WHERE token_hash = $1 AND session_id = $2 AND purpose = $3 FOR UPDATE', [sha256(String(t || '')), sess.id, purpose])).rows[0];
  if (!r || r.used_at || new Date(r.expires_at) <= new Date()) throw new HttpError(400, 'Phiên xác thực OTP không hợp lệ hoặc đã hết hạn. Vui lòng xác thực lại.');
  await c.query('UPDATE auth_tickets SET used_at = now() WHERE id = $1', [r.id]);
  return r;
}
async function changePassword(req, res, sess, body) {
  const ctx = ctxOf(req);
  checkPassword(body.newPassword, body.confirm);
  const admin = await getAdmin();
  if (argon2.verifyPassword(body.newPassword, admin.password_hash)) throw new HttpError(400, 'Mật khẩu mới phải khác mật khẩu hiện tại');
  const hash = argon2.hashPassword(body.newPassword);
  await db.tx(async (c) => {
    await useTicket(c, sess, body.ticket, 'password');
    await c.query('UPDATE admin_account SET password_hash = $1, password_changed_at = now(), locked_until = NULL WHERE id = 1', [hash]);
    await c.query("UPDATE sessions SET revoked_at = now(), revoke_reason = 'đổi mật khẩu' WHERE revoked_at IS NULL");
    await event(c, 'password_change', true, ctx, 'đổi mật khẩu qua OTP email');
    await c.query("INSERT INTO audit_log (action, entity, summary, ip) VALUES ('auth.password_change', 'admin', 'Đổi mật khẩu quản trị (xác thực OTP email)', $1)", [ctx.ip]);
  });
  setSessionCookie(res, '', true);
  return { ok: true };
}
async function changeEmail(req, sess, body) {
  const ctx = ctxOf(req);
  await db.tx(async (c) => {
    const t = await useTicket(c, sess, body.ticket, 'email');
    await c.query('UPDATE admin_account SET otp_email = $1 WHERE id = 1', [t.payload]);
    await event(c, 'otp_email_change', true, ctx, 'đổi email nhận OTP → ' + maskEmail(t.payload));
    await c.query("INSERT INTO audit_log (action, entity, summary, ip) VALUES ('security.otp_email', 'admin', $1, $2)", ['Đổi email nhận OTP thành ' + maskEmail(t.payload), ctx.ip]);
  });
  return { ok: true };
}
/** Khai báo email nhận OTP lần đầu (chỉ khi chưa có email nào được cấu hình) */
async function setInitialEmail(req, body) {
  const ctx = ctxOf(req); const admin = await getAdmin();
  if (otpEmailOf(admin)) throw new HttpError(409, 'Đã có email nhận OTP. Muốn đổi email cần xác thực OTP gửi tới email hiện tại.');
  const e = String(body.email || '').trim().toLowerCase(); if (!validEmail(e)) throw new HttpError(400, 'Email không hợp lệ');
  await db.query('UPDATE admin_account SET otp_email = $1 WHERE id = 1', [e]);
  await event(null, 'otp_email_set', true, ctx, maskEmail(e));
  return { ok: true, maskedEmail: maskEmail(e) };
}
async function setIdleMinutes(req, body) {
  const n = Number(body.idleMinutes); if (!Number.isInteger(n) || n < 5 || n > 240) throw new HttpError(400, 'Thời gian tự đăng xuất phải từ 5 đến 240 phút');
  await db.query('UPDATE admin_account SET idle_minutes = $1 WHERE id = 1', [n]);
  await event(null, 'security_setting', true, ctxOf(req), `tự đăng xuất sau ${n} phút không hoạt động`);
  return { ok: true, idleMinutes: n };
}
async function housekeeping() {
  await db.query("DELETE FROM sessions WHERE expires_at < now() - interval '30 days' OR revoked_at < now() - interval '30 days'");
  await db.query("DELETE FROM auth_events WHERE at < now() - interval '400 days'");
}

module.exports = { status, setup, login, logout, getSession, touch, checkCsrf, me, listSessions, revokeSession, revokeOthers, authEvents,
  requestOtp, verifyOtp, changePassword, changeEmail, setInitialEmail, setIdleMinutes, passwordProblems, maskEmail, ctxOf, setSessionCookie };
