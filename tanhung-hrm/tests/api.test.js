'use strict';
/**
 * Kiểm thử tích hợp đầu–cuối: máy chủ thật (server/index.js) + PostgreSQL thật + máy chủ SMTP cục bộ.
 * Cần PostgreSQL: TEST_ADMIN_DATABASE_URL (mặc định postgres://hrm:Pg-Test%232026@127.0.0.1:55432/postgres)
 */
const test = require('node:test'); const assert = require('node:assert');
const { spawn } = require('child_process'); const path = require('path');
const { Pool } = require('../server/db/pg');
const { startSink } = require('./helpers/smtp-sink');
const E = require('../public/assets/engine.js');

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL || 'postgres://hrm:Pg-Test%232026@127.0.0.1:55432/postgres';
const DB_NAME = 'tanhung_it_' + process.pid;
const DB_URL = ADMIN_URL.replace(/\/[^/?]+(\?|$)/, '/' + DB_NAME + '$1');
const SETUP_TOKEN = 'setup-token-ABCDEFGHIJKLMNOPQRSTUVWX-123';
const USER = 'hrsystem-ctytanhung';
const PW1 = 'TanHung@2026-Quantri', PW2 = 'Moi#MatKhau2027!';
let srv, base, sink, sql;

function client(ip = '10.0.0.1') {
  const jar = {}; let csrf = null;
  const c = async (method, p, body, extra = {}) => {
    const headers = { 'X-Forwarded-For': ip, ...(extra.headers || {}) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (csrf && method !== 'GET' && !extra.noCsrf) headers['X-CSRF-Token'] = csrf;
    const ck = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '); if (ck) headers.Cookie = ck;
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const s of sc) { const [kv] = s.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); if (v === '' || /Max-Age=0/.test(s)) delete jar[k]; else jar[k] = v; c.lastCookie = s; }
    let data = null; const txt = await res.text(); try { data = JSON.parse(txt); } catch (e) { data = txt; }
    return { status: res.status, data, headers: res.headers };
  };
  c.login = async (u = USER, pw = PW1) => { const r = await c('POST', '/api/auth/login', { username: u, password: pw }); if (r.status === 200) { const me = await c('GET', '/api/auth/me'); csrf = me.data.csrfToken; } return r; };
  c.setCsrf = (v) => { csrf = v; }; c.jar = jar;
  return c;
}
const lastOtp = () => {
  const m = sink.messages[sink.messages.length - 1];
  const html = Buffer.from(m.data.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString();
  const text = Buffer.from(m.data.split('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString();
  return { code: /: (\d{6})\n/.exec(text)[1], html, text, to: m.rcpt[0], raw: m.data };
};

test.before(async () => {
  const admin = new Pool(ADMIN_URL); await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`); await admin.query(`CREATE DATABASE ${DB_NAME}`); await admin.end();
  sink = await startSink();
  const port = 40000 + Math.floor(Math.random() * 20000);
  const env = { ...process.env, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: DB_URL, APP_SECRET: 'x'.repeat(16) + 'test-secret-0123456789abcdef', INITIAL_SETUP_TOKEN: SETUP_TOKEN,
    ADMIN_OTP_EMAIL: 'quantri.tanhung@example.com', EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(sink.port), SMTP_USER: sink.user, SMTP_PASS: sink.pass,
    MAIL_FROM: 'TAN HUNG HRM <no-reply@tanhung.test>', SMTP_TLS_REJECT_UNAUTHORIZED: 'false', TRUST_PROXY: 'true', OTP_RESEND_COOLDOWN_SECONDS: '2', OTP_MAX_PER_HOUR: '20', LOGIN_MAX_FAILS_GLOBAL: '50' };
  const mig = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'migrate.js')], { env, stdio: 'pipe' });
  await new Promise((res, rej) => mig.on('exit', (c) => (c === 0 ? res() : rej(new Error('migrate thất bại')))));
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  srv.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  await new Promise((res) => srv.stdout.on('data', (d) => { if (String(d).includes('đang chạy')) res(); }));
  base = `http://127.0.0.1:${port}`;
  sql = new Pool(DB_URL);
});
test.after(async () => { srv && srv.kill(); sink && sink.close(); if (sql) await sql.end(); const admin = new Pool(ADMIN_URL); await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`).catch(() => {}); await admin.end(); });

let A; // phiên quản trị chính
test('1. Chưa đăng nhập: không xem được dữ liệu, API bị chặn', async () => {
  const c = client();
  const page = await fetch(base + '/'); const html = await page.text();
  assert.strictEqual(page.status, 200); assert.ok(html.includes('TAN HUNG HRM')); assert.ok(!/Nguyễn|15\.000\.000/.test(html), 'trang tĩnh không chứa dữ liệu');
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  for (const p of ['/api/state', '/api/backup', '/api/audit', '/api/auth/me', '/api/khong-ton-tai']) assert.strictEqual((await c('GET', p)).status, 401, p);
  assert.strictEqual((await c('PUT', '/api/employees', { list: [] })).status, 401);
  assert.strictEqual((await c('POST', '/api/restore', { data: {} })).status, 401);
  assert.deepStrictEqual((await c('GET', '/api/health')).data.db, 'connected');
  assert.strictEqual((await c('GET', '/api/auth/status')).data.setupRequired, true);
  assert.strictEqual((await c('POST', '/api/auth/login', { username: USER, password: PW1 })).status, 409, 'chưa thiết lập thì không đăng nhập được');
});

test('4–5. Thiết lập mật khẩu lần đầu bằng INITIAL_SETUP_TOKEN, không chạy lại được', async () => {
  const c = client('10.0.0.2');
  assert.strictEqual((await c('POST', '/api/auth/setup', { setupToken: 'sai-token', username: USER, password: PW1, confirm: PW1 })).status, 403);
  let r = await c('POST', '/api/auth/setup', { setupToken: SETUP_TOKEN, username: USER, password: 'yeu', confirm: 'yeu' });
  assert.strictEqual(r.status, 400); assert.match(r.data.error, /tối thiểu 10 ký tự/);
  r = await c('POST', '/api/auth/setup', { setupToken: SETUP_TOKEN, username: 'admin', password: PW1, confirm: PW1 }); assert.strictEqual(r.status, 400);
  r = await c('POST', '/api/auth/setup', { setupToken: SETUP_TOKEN, username: USER, password: PW1, confirm: PW1 + 'x' }); assert.strictEqual(r.status, 400);
  r = await c('POST', '/api/auth/setup', { setupToken: SETUP_TOKEN, username: USER, password: PW1, confirm: PW1 }); assert.strictEqual(r.status, 200);
  const row = (await sql.query('SELECT username, password_hash FROM admin_account')).rows[0];
  assert.strictEqual(row.username, USER); assert.match(row.password_hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/); assert.ok(!row.password_hash.includes(PW1));
  r = await c('POST', '/api/auth/setup', { setupToken: SETUP_TOKEN, username: USER, password: 'Khac#MatKhau123', confirm: 'Khac#MatKhau123' });
  assert.strictEqual(r.status, 409); assert.strictEqual(r.data.code, 'ALREADY_SETUP');
  assert.strictEqual((await sql.query('SELECT count(*)::int AS n FROM setup_tokens_used')).rows[0].n, 1);
  assert.strictEqual((await c('GET', '/api/auth/status')).data.setupRequired, false);
});

test('2–3. Đăng nhập sai username / sai mật khẩu bị từ chối với thông báo chung', async () => {
  const c = client('10.0.0.3');
  const a = await c('POST', '/api/auth/login', { username: 'admin', password: PW1 }); assert.strictEqual(a.status, 401);
  const b = await c('POST', '/api/auth/login', { username: USER, password: 'SaiMatKhau#1' }); assert.strictEqual(b.status, 401);
  assert.ok(a.data.error.startsWith('Tên đăng nhập hoặc mật khẩu không đúng') && b.data.error.startsWith('Tên đăng nhập hoặc mật khẩu không đúng'));
  assert.strictEqual(Object.keys(c.jar).length, 0, 'không cấp cookie khi đăng nhập sai');
});

test('Đăng nhập đúng: cookie HttpOnly + SameSite=Strict, CSRF bắt buộc cho thao tác ghi', async () => {
  A = client('10.0.0.4');
  const r = await A.login(); assert.strictEqual(r.status, 200);
  assert.match(A.lastCookie, /HttpOnly/); assert.match(A.lastCookie, /SameSite=Strict/);
  const me = await A('GET', '/api/auth/me'); assert.strictEqual(me.data.username, USER); assert.strictEqual(me.data.maskedEmail, 'qu*************@e******.com');
  assert.strictEqual((await A('PUT', '/api/settings', { settings: E.defaultSettings() }, { noCsrf: true })).status, 403);
  assert.strictEqual((await A('PUT', '/api/settings', { settings: E.defaultSettings() }, { headers: { 'X-CSRF-Token': 'gia-mao' }, noCsrf: true })).status, 403);
  assert.strictEqual((await A('PUT', '/api/settings', { settings: E.defaultSettings() })).status, 200);
});

let sample;
test('Dữ liệu HRM lưu vào PostgreSQL, công thức lương giữ nguyên', async () => {
  sample = E.buildSample('2026-11');
  const r = await A('POST', '/api/restore', { app: 'tanhung-hrm', data: sample }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  assert.strictEqual(r.data.employees, 7); assert.strictEqual(r.data.months, 3);
  const st = (await A('GET', '/api/state')).data;
  assert.strictEqual(st.employees.length, 7);
  const P = E.payroll(st.settings, st.employees, '2026-11', st.months['2026-11']);
  const net = Object.fromEntries(P.rows.map((x) => [x.code, x.net]));
  assert.deepStrictEqual(net, { NV001: 15095000, NV002: 8182500, NV003: 5560000, NV004: 9850000, NV005: 11200000, NV006: 10245000 });
  assert.strictEqual(st.months['2026-10'].status, 'locked'); assert.strictEqual(st.months['2026-10'].snapshot.rows.length, 6);
  assert.strictEqual((await sql.query("SELECT count(*)::int AS n FROM attendance WHERE work_date >= '2026-11-01' AND work_date < '2026-12-01'")).rows[0].n, 150);
});

test('Ràng buộc: không trùng mã NV, không trùng phiếu ứng, không sửa được tháng đã chốt (kể cả bằng SQL)', async () => {
  const st = (await A('GET', '/api/state')).data;
  const dup = st.employees.map((e) => ({ ...e })); dup[1].code = dup[0].code;
  assert.strictEqual((await A('PUT', '/api/employees', { list: dup })).status, 409);
  // phiếu ứng của tháng 11 bị gửi trùng id sang tháng 9 (chưa chốt? T9 đã chốt) → dùng tháng 12
  const advId = st.months['2026-11'].adv[0].id;
  const m12 = { ...E.emptyMonth(), adv: [{ id: advId, empId: 'e002', date: '2026-12-02', week: 1, amount: 1000000 }] };
  const r12 = await A('PUT', '/api/months/2026-12', { month: m12 }); assert.strictEqual(r12.status, 409); assert.match(r12.data.error, /trùng/);
  // gửi lại đúng tháng 11 hai lần (mạng chập chờn) không nhân đôi phiếu ứng
  for (let i = 0; i < 2; i++) { const s = await A('PUT', '/api/months/2026-11', { month: st.months['2026-11'] }); assert.strictEqual(s.status, 200, JSON.stringify(s.data)); }
  assert.strictEqual((await sql.query("SELECT count(*)::int AS n FROM salary_advances WHERE month = '2026-11'")).rows[0].n, 4);
  // sửa công + thêm tăng ca rồi đọc lại từ CSDL
  const m11 = JSON.parse(JSON.stringify(st.months['2026-11'])); m11.att.e005[2] = 0.5; m11.att.e005[3] = { i: '08:00', o: '16:30' };
  m11.ot.push({ id: 'otTest1', empId: 'e005', date: '2026-11-15', minutes: 60, note: 'CN' });
  const sv = await A('PUT', '/api/months/2026-11', { month: m11 }); assert.strictEqual(sv.status, 200, JSON.stringify(sv.data));
  assert.strictEqual(sv.data.att.e005[2], 0.5); assert.deepStrictEqual(sv.data.att.e005[3], { i: '08:00', o: '16:30' }); assert.ok(sv.data.ot.some((o) => o.id === 'otTest1'));
  const back = (await A('PUT', '/api/months/2026-11', { month: st.months['2026-11'] })); assert.strictEqual(back.status, 200); assert.strictEqual(back.data.att.e005[2], 1);
  // tháng đã chốt
  const m10 = st.months['2026-10']; const mod = JSON.parse(JSON.stringify(m10)); mod.att.e001[1] = 0;
  const locked = await A('PUT', '/api/months/2026-10', { month: mod }); assert.strictEqual(locked.status, 409); assert.strictEqual(locked.data.code, 'LOCKED');
  await assert.rejects(sql.query("UPDATE attendance SET value = 0 WHERE employee_id = 'e001' AND work_date = '2026-10-01'"), /đã chốt lương/);
  await assert.rejects(sql.query("UPDATE payroll_snapshots SET net = 1 WHERE month = '2026-10'"), /không được sửa trực tiếp/);
  // giá trị không hợp lệ bị từ chối
  const bad = JSON.parse(JSON.stringify(st.months['2026-11'])); bad.att.e001[2] = 7;
  assert.strictEqual((await A('PUT', '/api/months/2026-11', { month: bad })).status, 400);
});

test('Bảng lương đã chốt không đổi khi tăng lương; máy chủ tự tính khi chốt', async () => {
  let st = (await A('GET', '/api/state')).data;
  const before = st.months['2026-10'].snapshot.rows.find((r) => r.empId === 'e001').net;
  const emps = st.employees.map((e) => ({ ...e })); E.setPayFrom(emps.find((e) => e.id === 'e001'), '2026-11', 18000000, 6000000);
  assert.strictEqual((await A('PUT', '/api/employees', { list: emps })).status, 200);
  st = (await A('GET', '/api/state')).data;
  assert.strictEqual(st.months['2026-10'].snapshot.rows.find((r) => r.empId === 'e001').net, before);
  // chốt tháng 11 ở máy chủ
  const lk = await A('POST', '/api/months/2026-11/lock', {}); assert.strictEqual(lk.status, 200, JSON.stringify(lk.data));
  const row = lk.data.snapshot.rows.find((r) => r.empId === 'e001'); assert.strictEqual(row.salary, 18000000); assert.strictEqual(row.net, 18140000);
  assert.strictEqual((await A('POST', '/api/months/2026-11/lock', {})).status, 409, 'không chốt hai lần');
  assert.strictEqual((await sql.query("SELECT count(*)::int AS n FROM payroll_snapshots WHERE month = '2026-11'")).rows[0].n, 6);
  assert.strictEqual((await A('POST', '/api/months/2026-11/unlock', { reason: 'x' })).status, 400, 'mở khóa phải có lý do');
  const ul = await A('POST', '/api/months/2026-11/unlock', { reason: 'Bổ sung thưởng tết' }); assert.strictEqual(ul.status, 200); assert.strictEqual(ul.data.status, 'review');
  const relock = await A('POST', '/api/months/2026-11/lock', {}); assert.strictEqual(relock.data.log.slice(-1)[0].action, 'Chốt lại lương');
  assert.ok((await sql.query("SELECT count(*)::int AS n FROM audit_log WHERE action LIKE 'payroll.%'")).rows[0].n >= 3);
});

let otpReq;
test('6. Gửi OTP đổi mật khẩu qua email (6 số, không lộ mã/email đầy đủ)', async () => {
  const before = sink.messages.length;
  const r = await A('POST', '/api/auth/otp/request', { purpose: 'password' }); assert.strictEqual(r.status, 200, JSON.stringify(r.data));
  otpReq = r.data;
  assert.strictEqual(sink.messages.length, before + 1);
  const m = lastOtp(); assert.match(m.code, /^\d{6}$/); assert.strictEqual(m.to, '<quantri.tanhung@example.com>');
  assert.ok(m.html.includes('5 phút') && m.html.includes('TAN HUNG HRM') && /Không phải bạn thực hiện/.test(m.html));
  assert.ok(!JSON.stringify(r.data).includes(m.code), 'API không trả mã OTP');
  assert.strictEqual(r.data.maskedEmail, 'qu*************@e******.com');
  const row = (await sql.query('SELECT code_hash FROM otp_requests WHERE id = $1', [otpReq.requestId])).rows[0];
  assert.ok(!row.code_hash.includes(m.code) && row.code_hash.length === 64, 'OTP được lưu dạng HMAC');
  assert.strictEqual((await A('POST', '/api/auth/otp/request', { purpose: 'password' })).status, 429, 'có thời gian chờ gửi lại');
});

test('7. Nhập OTP sai → báo số lần còn lại; mã thuộc phiên khác bị từ chối', async () => {
  const code = lastOtp().code; const wrong = code === '000000' ? '111111' : '000000';
  const r = await A('POST', '/api/auth/otp/verify', { requestId: otpReq.requestId, code: wrong }); assert.strictEqual(r.status, 400); assert.match(r.data.error, /Còn 4 lần/);
  assert.strictEqual((await sql.query('SELECT attempts FROM otp_requests WHERE id = $1', [otpReq.requestId])).rows[0].attempts, 1, 'số lần sai được lưu');
  const B = client('10.0.0.9'); await B.login();
  const other = await B('POST', '/api/auth/otp/verify', { requestId: otpReq.requestId, code }); assert.strictEqual(other.status, 400); assert.match(other.data.error, /không thuộc phiên/);
});

test('8. OTP hết hạn bị từ chối', async () => {
  await sql.query("UPDATE otp_requests SET expires_at = now() - interval '1 second' WHERE id = $1", [otpReq.requestId]);
  const r = await A('POST', '/api/auth/otp/verify', { requestId: otpReq.requestId, code: lastOtp().code });
  assert.strictEqual(r.status, 400); assert.strictEqual(r.data.code, 'OTP_EXPIRED');
});

let ticket;
test('9. Mã mới vô hiệu mã cũ; OTP đã dùng không dùng lại được', async () => {
  await new Promise((r) => setTimeout(r, 2100));
  const r1 = await A('POST', '/api/auth/otp/request', { purpose: 'password' }); const c1 = lastOtp().code;
  await new Promise((r) => setTimeout(r, 2100));
  const r2 = await A('POST', '/api/auth/otp/request', { purpose: 'password' }); const c2 = lastOtp().code;
  const old = await A('POST', '/api/auth/otp/verify', { requestId: r1.data.requestId, code: c1 }); assert.strictEqual(old.data.code, 'OTP_INVALID', 'mã cũ bị vô hiệu khi có mã mới');
  const ok = await A('POST', '/api/auth/otp/verify', { requestId: r2.data.requestId, code: c2 }); assert.strictEqual(ok.status, 200); ticket = ok.data.ticket;
  const again = await A('POST', '/api/auth/otp/verify', { requestId: r2.data.requestId, code: c2 }); assert.strictEqual(again.status, 400); assert.strictEqual(again.data.code, 'OTP_USED');
});

test('Nhập sai quá 5 lần → mã bị vô hiệu', async () => {
  await new Promise((r) => setTimeout(r, 2100));
  const r = await A('POST', '/api/auth/otp/request', { purpose: 'password' }); const code = lastOtp().code; const wrong = code === '999999' ? '888888' : '999999';
  let last; for (let i = 0; i < 5; i++) last = await A('POST', '/api/auth/otp/verify', { requestId: r.data.requestId, code: wrong });
  assert.strictEqual(last.data.code, 'OTP_INVALID');
  assert.strictEqual((await A('POST', '/api/auth/otp/verify', { requestId: r.data.requestId, code })).data.code, 'OTP_INVALID', 'đúng mã cũng không dùng được nữa');
});

test('10–11. Đổi mật khẩu thành công → mọi phiên bị đăng xuất; đăng nhập bằng mật khẩu mới', async () => {
  assert.strictEqual((await A('POST', '/api/auth/password', { ticket, newPassword: PW1, confirm: PW1 })).status, 400, 'không trùng mật khẩu cũ');
  const weak = await A('POST', '/api/auth/password', { ticket, newPassword: 'abc', confirm: 'abc' }); assert.strictEqual(weak.status, 400);
  const ok = await A('POST', '/api/auth/password', { ticket, newPassword: PW2, confirm: PW2 }); assert.strictEqual(ok.status, 200);
  assert.strictEqual((await A('GET', '/api/state')).status, 401, 'phiên cũ bị thu hồi');
  assert.strictEqual((await sql.query('SELECT count(*)::int AS n FROM sessions WHERE revoked_at IS NULL')).rows[0].n, 0);
  const C = client('10.0.0.5');
  assert.strictEqual((await C.login(USER, PW1)).status, 401, 'mật khẩu cũ không còn dùng được');
  assert.strictEqual((await C.login(USER, PW2)).status, 200);
  assert.strictEqual((await C('POST', '/api/auth/password', { ticket, newPassword: 'Khac#MatKhau2028', confirm: 'Khac#MatKhau2028' })).status, 400, 'ticket không dùng lại');
  A = C;
});

test('13–14. Tải lại & đăng xuất rồi đăng nhập lại: dữ liệu còn nguyên', async () => {
  const s1 = (await A('GET', '/api/state')).data;
  const s2 = (await A('GET', '/api/state')).data; assert.deepStrictEqual(s1, s2);
  assert.strictEqual((await A('POST', '/api/auth/logout', {})).status, 200);
  assert.strictEqual((await A('GET', '/api/state')).status, 401);
  const D = client('10.0.0.6'); await D.login(USER, PW2);
  const s3 = (await D('GET', '/api/state')).data; assert.deepStrictEqual(s3, s1);
  const P = E.payroll(s3.settings, s3.employees, '2026-11', s3.months['2026-11']); assert.strictEqual(P.rows.find((r) => r.code === 'NV002').net, 8182500);
  A = D;
});

test('15. Sao lưu và khôi phục', async () => {
  const b = await A('GET', '/api/backup'); assert.strictEqual(b.status, 200); assert.strictEqual(b.data.app, 'tanhung-hrm');
  const snapshot = JSON.stringify(b.data.data);
  // xóa sạch rồi khôi phục
  assert.strictEqual((await A('POST', '/api/restore', { data: { settings: E.defaultSettings(), employees: [], months: {} } })).status, 200);
  assert.strictEqual((await A('GET', '/api/state')).data.employees.length, 0);
  const r = await A('POST', '/api/restore', b.data); assert.strictEqual(r.status, 200);
  const after = (await A('GET', '/api/backup')).data.data;
  assert.strictEqual(JSON.stringify(after.employees), JSON.stringify(b.data.data.employees));
  for (const ym of Object.keys(b.data.data.months)) {
    const x = after.months[ym], y = b.data.data.months[ym];
    assert.deepStrictEqual({ ...x, log: x.log.map((l) => ({ ...l, t: 0 })) }, { ...y, log: y.log.map((l) => ({ ...l, t: 0 })) }, 'tháng ' + ym);
  }
  // khôi phục lỗi → dữ liệu cũ giữ nguyên (transaction)
  const badPayload = JSON.parse(snapshot); badPayload.employees[0].code = badPayload.employees[1].code;
  assert.strictEqual((await A('POST', '/api/restore', { data: badPayload })).status, 409);
  assert.strictEqual((await A('GET', '/api/state')).data.employees.length, 7);
});

test('Tự đăng xuất khi không hoạt động; quản lý phiên', async () => {
  const X = client('10.0.0.7'); await X.login(USER, PW2);
  const list = (await A('GET', '/api/auth/sessions')).data; assert.ok(list.length >= 2); assert.strictEqual(list.filter((s) => s.current).length, 1);
  const xs = list.find((s) => !s.current);
  assert.strictEqual((await A('DELETE', '/api/auth/sessions/' + xs.id)).status, 200);
  assert.strictEqual((await X('GET', '/api/state')).status, 401, 'phiên bị thu hồi');
  const Y = client('10.0.0.8'); await Y.login(USER, PW2);
  await sql.query("UPDATE sessions SET last_seen_at = now() - interval '31 minutes' WHERE revoked_at IS NULL AND id <> (SELECT id FROM sessions WHERE revoked_at IS NULL ORDER BY created_at LIMIT 1)");
  assert.strictEqual((await Y('GET', '/api/state')).status, 401, 'hết hạn do không hoạt động');
});

test('Chống brute force: khóa IP sau 5 lần sai', async () => {
  const Z = client('10.9.9.9');
  for (let i = 0; i < 5; i++) assert.strictEqual((await Z('POST', '/api/auth/login', { username: USER, password: 'Sai#' + i + 'aaaaaaa' })).status, 401);
  const r = await Z('POST', '/api/auth/login', { username: USER, password: PW2 }); assert.strictEqual(r.status, 429, 'đúng mật khẩu cũng bị chặn trong thời gian khóa');
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  const W = client('10.1.1.1'); assert.strictEqual((await W.login(USER, PW2)).status, 200, 'IP khác vẫn đăng nhập được');
  const ev = (await W('GET', '/api/auth/events?limit=200')).data; assert.ok(ev.some((e) => e.event === 'login' && e.success === false)); assert.ok(ev.some((e) => e.event === 'password_change'));
});
