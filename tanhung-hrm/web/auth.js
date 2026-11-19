/* ===== API, XÁC THỰC, BẢO MẬT, KHỞI ĐỘNG ===== */
class ApiError extends Error { constructor(status, message, data) { super(message); this.status = status; this.data = data || {}; } }
const API = {
  csrf: null,
  async call(method, path, body) {
    const opt = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    if (method !== 'GET' && this.csrf) opt.headers['X-CSRF-Token'] = this.csrf;
    let res;
    try { res = await fetch(path, opt); } catch (e) { setSync('offline'); throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng.'); }
    let data = null; try { data = await res.json(); } catch (e) { data = null; }
    if (res.status === 401 && Auth.me && !/\/api\/auth\/(login|setup|status)$/.test(path)) { Auth.expired('Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.'); }
    if (!res.ok) throw new ApiError(res.status, (data && data.error) || 'Lỗi máy chủ (' + res.status + ')', data);
    return data;
  },
};

const Auth = {
  me: null, lastActivity: Date.now(), idleTimer: null, pingTimer: null,
  async expired(msg) {
    if (!this.me) return; this.me = null; API.csrf = null; this.stopTimers(); closeAllModals();
    showLogin(msg);
  },
  startTimers() {
    this.stopTimers(); this.lastActivity = Date.now();
    this.idleTimer = setInterval(() => {
      if (!this.me) return; const idleMs = (this.me.idleMinutes || 30) * 60000; const left = idleMs - (Date.now() - this.lastActivity);
      if (left <= 0) { this.logout('Bạn đã được đăng xuất tự động do không hoạt động ' + this.me.idleMinutes + ' phút.'); }
      else if (left < 60000 && !$('#idle-warn')) { const d = document.createElement('div'); d.id = 'idle-warn'; d.className = 'toast warn'; d.textContent = 'Sắp tự đăng xuất do không hoạt động — di chuột hoặc bấm phím để tiếp tục.'; $('#toasts').appendChild(d); }
    }, 10000);
    // giữ phiên phía máy chủ khi người dùng vẫn đang thao tác nhưng không gọi API
    this.pingTimer = setInterval(() => { if (this.me && Date.now() - this.lastActivity < 120000) API.call('GET', '/api/auth/me').then((m) => { if (this.me) { this.me = m; API.csrf = m.csrfToken; } }).catch(() => {}); }, 4 * 60000);
  },
  stopTimers() { clearInterval(this.idleTimer); clearInterval(this.pingTimer); },
  async logout(msg) {
    try { await Store.flushAll(); } catch (e) { /* bỏ qua */ }
    try { await API.call('POST', '/api/auth/logout', {}); } catch (e) { /* bỏ qua */ }
    this.me = null; API.csrf = null; this.stopTimers(); closeAllModals(); showLogin(msg || 'Đã đăng xuất.', 'ok');
  },
};
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => { Auth.lastActivity = Date.now(); const w = $('#idle-warn'); if (w) w.remove(); }, { passive: true, capture: true }));
function closeAllModals() { $$('#modal-root .modal-wrap').forEach((w) => w.remove()); hidePop(); }

/* ---------- Màn hình xác thực (toàn trang) ---------- */
function authShell(inner) {
  $('#app').hidden = true; const root = $('#auth-root'); root.hidden = false;
  root.innerHTML = `<div class="auth-wrap"><div class="auth-card"><div class="auth-brand"><div class="brand-mark">TH</div><div><b>TAN HUNG HRM</b><small>Công ty TNHH Mỹ thuật Tân Hưng</small></div></div>${inner}</div><p class="auth-foot">Hệ thống quản trị nhân sự nội bộ · Chỉ dành cho quản trị viên được ủy quyền</p></div>`;
  return root;
}
const PW_RULES = [[/.{10,}/, 'Tối thiểu 10 ký tự'], [/[a-zà-ỹ]/, 'Có chữ thường'], [/[A-ZÀ-Ỹ]/, 'Có chữ hoa'], [/\d/, 'Có chữ số'], [/[^A-Za-z0-9À-ỹ]/, 'Có ký tự đặc biệt']];
function pwChecklist(id) { return `<ul class="pw-rules" id="${id}">${PW_RULES.map(([, l], i) => `<li data-i="${i}">${l}</li>`).join('')}<li data-i="m">Mật khẩu xác nhận khớp</li></ul>`; }
function bindPwChecklist(root, pwSel, cfSel, listSel) {
  const upd = () => { const pw = $(pwSel, root).value, cf = $(cfSel, root).value; $$(listSel + ' li', root).forEach((li) => { const i = li.dataset.i; const ok = i === 'm' ? (pw && pw === cf) : PW_RULES[i][0].test(pw); li.classList.toggle('ok', !!ok); }); };
  $(pwSel, root).addEventListener('input', upd); $(cfSel, root).addEventListener('input', upd); upd();
}
function pwField(name, label, auto) { return `<label class="field"><span>${label}</span><div class="pw-wrap"><input type="password" name="${name}" autocomplete="${auto}" required maxlength="128"><button type="button" class="pw-eye" data-eye tabindex="-1" aria-label="Hiện mật khẩu">${ICON.eye}</button></div></label>`; }
document.addEventListener('click', (e) => { const b = e.target.closest('[data-eye]'); if (!b) return; const i = b.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; });

function showSetup() {
  const root = authShell(`<h1>Thiết lập lần đầu</h1>
    <div class="auth-msg info">Chào mừng đến với TAN HUNG HRM. Vui lòng thiết lập mật khẩu quản trị để bắt đầu sử dụng.</div>
    <form id="setup-form" class="auth-form" novalidate>
      <label class="field"><span>Mã thiết lập ban đầu (INITIAL_SETUP_TOKEN)</span><input name="setupToken" type="password" autocomplete="off" required><small>Mã do người triển khai đặt trong biến môi trường. Chỉ dùng được một lần.</small></label>
      <label class="field"><span>Tên đăng nhập</span><input name="username" value="hrsystem-ctytanhung" readonly></label>
      ${pwField('password', 'Mật khẩu mới', 'new-password')}${pwField('confirm', 'Xác nhận mật khẩu', 'new-password')}
      ${pwChecklist('setup-rules')}
      <div class="auth-err" id="setup-err" role="alert"></div>
      <button class="btn primary lg block" type="submit">Thiết lập mật khẩu</button></form>`);
  bindPwChecklist(root, '[name=password]', '[name=confirm]', '#setup-rules');
  $('#setup-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = e.target; const btn = f.querySelector('button[type=submit]'); btn.disabled = true; $('#setup-err').textContent = '';
    try {
      await API.call('POST', '/api/auth/setup', { setupToken: f.setupToken.value, username: f.username.value, password: f.password.value, confirm: f.confirm.value });
      showLogin('Đã thiết lập mật khẩu quản trị. Vui lòng đăng nhập.', 'ok');
    } catch (err) { $('#setup-err').textContent = err.message; btn.disabled = false; if (err.data && err.data.code === 'ALREADY_SETUP') setTimeout(() => showLogin(err.message), 1500); }
  });
}

function showLogin(msg, kind) {
  authShell(`<h1>Đăng nhập</h1>${msg ? `<div class="auth-msg ${kind === 'ok' ? 'ok' : 'warn'}">${esc(msg)}</div>` : ''}
    <form id="login-form" class="auth-form" novalidate>
      <label class="field"><span>Tên đăng nhập</span><input name="username" autocomplete="username" required autocapitalize="off" spellcheck="false"></label>
      ${pwField('password', 'Mật khẩu', 'current-password')}
      <div class="auth-err" id="login-err" role="alert"></div>
      <button class="btn primary lg block" type="submit">Đăng nhập</button></form>
    <p class="muted small center-t">Quên mật khẩu? Liên hệ người quản trị kỹ thuật để khôi phục theo tài liệu triển khai.</p>`);
  const f = $('#login-form'); f.username.focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Đang kiểm tra…'; $('#login-err').textContent = '';
    try { await API.call('POST', '/api/auth/login', { username: f.username.value.trim(), password: f.password.value }); await enterApp(); }
    catch (err) {
      $('#login-err').textContent = err.message; btn.disabled = false; btn.textContent = 'Đăng nhập'; f.password.value = ''; f.password.focus();
      if (err.data && err.data.code === 'SETUP_REQUIRED') showSetup();
    }
  });
}
function showFatal(err) {
  authShell(`<h1>Không thể kết nối</h1><div class="auth-msg warn">${esc(err.message || err)}</div><p class="muted small">Kiểm tra máy chủ, biến môi trường DATABASE_URL và đã chạy migration CSDL chưa.</p><button class="btn primary block" onclick="location.reload()">Thử lại</button>`);
}

async function enterApp() {
  const me = await API.call('GET', '/api/auth/me'); Auth.me = me; API.csrf = me.csrfToken;
  await Store.load();
  $('#auth-root').hidden = true; $('#auth-root').innerHTML = ''; $('#app').hidden = false;
  $('#sb-user').textContent = me.username;
  Auth.startTimers();
  if (!location.hash) location.hash = 'dashboard'; route();
}

async function boot() {
  let st;
  try { st = await API.call('GET', '/api/auth/status'); } catch (e) { return showFatal(e); }
  if (st.setupRequired) return showSetup();
  try { await enterApp(); }
  catch (e) { if (e.status === 401) showLogin(); else showFatal(e); }
}

/* ---------- Trang Bảo mật & phiên đăng nhập ---------- */
const SEC = { sessions: null, events: null, audit: null, sys: null, loading: false };
async function loadSecurity() {
  if (SEC.loading) return; SEC.loading = true;
  try {
    const [me, sessions, events, audit, sys] = await Promise.all([API.call('GET', '/api/auth/me'), API.call('GET', '/api/auth/sessions'), API.call('GET', '/api/auth/events?limit=60'), API.call('GET', '/api/audit?limit=80'), API.call('GET', '/api/system/status')]);
    Auth.me = me; API.csrf = me.csrfToken; Object.assign(SEC, { sessions, events, audit, sys });
  } catch (e) { toast(e.message, 'err'); } finally { SEC.loading = false; if (UI.route === 'bao-mat') render(); }
}
const EVENT_LABEL = { login: 'Đăng nhập', logout: 'Đăng xuất', setup: 'Thiết lập lần đầu', otp_send: 'Gửi mã OTP', otp_verify: 'Xác thực OTP', password_change: 'Đổi mật khẩu', session_timeout: 'Hết phiên (không hoạt động)', session_revoke: 'Thu hồi phiên', lockout: 'Khóa tạm thời', otp_email_change: 'Đổi email OTP', otp_email_set: 'Khai báo email OTP', security_setting: 'Cài đặt bảo mật' };
function uaShort(ua) { if (!ua) return '—'; const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Trình duyệt'; const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''; return b + (os ? ' · ' + os : ''); }
VIEWS['bao-mat'] = function () {
  if (!SEC.sessions && !SEC.loading) loadSecurity();
  const me = Auth.me || {};
  const sess = SEC.sessions; const sys = SEC.sys;
  return `<div class="grid2">
    <div class="card"><h3>Tài khoản quản trị</h3><dl class="kv"><dt>Tên đăng nhập</dt><dd><b>${esc(me.username)}</b></dd><dt>Đổi mật khẩu lần cuối</dt><dd>${fmtDT(me.passwordChangedAt)}</dd>
      <dt>Email nhận OTP</dt><dd>${me.maskedEmail ? esc(me.maskedEmail) + (me.emailSource === 'env' ? ' <span class="pill">biến môi trường</span>' : '') : '<span class="pill warn">Chưa cấu hình</span>'}</dd>
      <dt>Dịch vụ gửi email</dt><dd>${me.emailConfigured ? '<span class="pill ok">Đã cấu hình</span>' : '<span class="pill warn">Chưa cấu hình trên máy chủ</span>'}</dd></dl>
      <div class="row gap wrap mt"><a class="btn primary" href="#doi-mat-khau">${ICON.lock} Đổi mật khẩu (OTP email)</a>${me.emailSource !== 'env' ? `<button class="btn" data-act="sec-email">${ICON.edit} ${me.maskedEmail ? 'Đổi' : 'Khai báo'} email OTP</button>` : ''}</div></div>
    <div class="card"><h3>Phiên & hệ thống</h3><dl class="kv">
      <dt>Tự đăng xuất khi không hoạt động</dt><dd><select id="idle-min" data-act="sec-idle">${[10, 15, 30, 45, 60, 90, 120].map((n) => `<option value="${n}" ${n === me.idleMinutes ? 'selected' : ''}>${n} phút</option>`).join('')}</select></dd>
      <dt>Phiên hiện tại hết hạn</dt><dd>${fmtDT(me.expiresAt)}</dd>
      <dt>Cơ sở dữ liệu</dt><dd>${sys ? `<span class="pill ok">Đã kết nối</span> ${esc(sys.server)} · ${sys.latencyMs} ms · migration ${esc(sys.migration || '')}` : 'Đang kiểm tra…'}</dd>
      <dt>Múi giờ</dt><dd>${esc((sys && sys.timezone) || 'Asia/Ho_Chi_Minh')}</dd></dl>
      <div class="row gap wrap mt"><button class="btn" data-act="sec-refresh">${ICON.history} Làm mới</button><button class="btn danger" data-act="logout">Đăng xuất</button></div></div></div>
  <div class="card flush"><div class="card-head pad"><h3>Phiên đăng nhập đang hoạt động</h3>${sess && sess.length > 1 ? `<button class="btn sm" data-act="sec-revoke-others">Đăng xuất mọi thiết bị khác</button>` : ''}</div>
    <table class="tbl compact"><thead><tr><th>Thiết bị</th><th>Địa chỉ IP</th><th>Đăng nhập lúc</th><th>Hoạt động gần nhất</th><th>Hết hạn</th><th></th></tr></thead><tbody>
    ${sess ? sess.map((x) => `<tr><td>${esc(uaShort(x.user_agent))} ${x.current ? '<span class="pill ok">Phiên này</span>' : ''}</td><td>${esc(x.ip || '—')}</td><td>${fmtDT(x.created_at)}</td><td>${fmtDT(x.last_seen_at)}</td><td>${fmtDT(x.expires_at)}</td><td class="r"><button class="btn sm ${x.current ? '' : 'danger'}" data-act="sec-revoke" data-id="${x.id}">${x.current ? 'Đăng xuất' : 'Thu hồi'}</button></td></tr>`).join('') : '<tr><td colspan="6" class="empty">Đang tải…</td></tr>'}</tbody></table></div>
  <div class="grid2">
    <div class="card flush"><div class="card-head pad"><h3>Lịch sử đăng nhập & bảo mật</h3></div><div class="tbl-wrap scroll-y"><table class="tbl compact"><thead><tr><th>Thời gian</th><th>Sự kiện</th><th>IP</th><th>Chi tiết</th></tr></thead><tbody>
      ${(SEC.events || []).map((x) => `<tr><td class="nowrap">${fmtDT(x.at)}</td><td>${x.success === false ? '<span class="pill warn">Thất bại</span> ' : ''}${esc(EVENT_LABEL[x.event] || x.event)}</td><td>${esc(x.ip || '')}</td><td class="muted small">${esc(x.detail || '')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">—</td></tr>'}</tbody></table></div></div>
    <div class="card flush"><div class="card-head pad"><h3>Nhật ký thay đổi dữ liệu</h3></div><div class="tbl-wrap scroll-y"><table class="tbl compact"><thead><tr><th>Thời gian</th><th>Nội dung</th></tr></thead><tbody>
      ${(SEC.audit || []).map((x) => `<tr><td class="nowrap">${fmtDT(x.at)}</td><td>${esc(x.summary || x.action)}</td></tr>`).join('') || '<tr><td colspan="2" class="empty">—</td></tr>'}</tbody></table></div></div></div>`;
};

/* ---------- Đổi mật khẩu bằng OTP email ---------- */
const PW = { step: 1, req: null, ticket: null, sentAt: 0, timer: null };
VIEWS['doi-mat-khau'] = function () {
  const me = Auth.me || {};
  const steps = ['Gửi mã OTP', 'Nhập mã 6 số', 'Mật khẩu mới'];
  const head = `<div class="otp-steps">${steps.map((s, i) => `<div class="${PW.step === i + 1 ? 'on' : PW.step > i + 1 ? 'done' : ''}"><span>${PW.step > i + 1 ? ICON.check : i + 1}</span>${s}</div>`).join('')}</div>`;
  let body = '';
  if (PW.step === 1) body = `<p>Để đổi mật khẩu, hệ thống sẽ gửi một mã xác thực gồm <b>6 chữ số</b> tới email quản trị${me.maskedEmail ? ` <b>${esc(me.maskedEmail)}</b>` : ''}. Mã có hiệu lực trong <b>5 phút</b> và chỉ dùng được một lần.</p>
    ${!me.maskedEmail ? `<div class="alert info">${ICON.alert} Chưa cấu hình email nhận OTP. Khai báo tại <a class="link" href="#bao-mat">Bảo mật</a> hoặc đặt biến môi trường ADMIN_OTP_EMAIL.</div>` : ''}
    <button class="btn primary lg" data-act="pw-send" ${me.maskedEmail ? '' : 'disabled'}>${ICON.lock} Gửi mã OTP</button>`;
  if (PW.step === 2) body = `<p>Đã gửi mã tới <b>${esc(PW.req.maskedEmail)}</b>. Kiểm tra hộp thư (kể cả thư rác).</p>
    <form id="otp-form" class="otp-form" novalidate><div class="otp-boxes">${[0, 1, 2, 3, 4, 5].map((i) => `<input inputmode="numeric" maxlength="1" pattern="[0-9]" data-otp="${i}" aria-label="Chữ số ${i + 1}" autocomplete="${i === 0 ? 'one-time-code' : 'off'}">`).join('')}</div>
    <div class="otp-meta"><span id="otp-exp"></span><button type="button" class="btn sm" data-act="pw-resend" id="otp-resend" disabled>Gửi lại mã</button></div>
    <div class="auth-err" id="otp-err" role="alert"></div><button class="btn primary lg" type="submit">Xác thực mã</button></form>`;
  if (PW.step === 3) body = `<p>Mã OTP hợp lệ. Nhập mật khẩu mới (phiên xác thực có hiệu lực 10 phút).</p>
    <form id="newpw-form" class="auth-form narrow" novalidate>${pwField('newPassword', 'Mật khẩu mới', 'new-password')}${pwField('confirm', 'Xác nhận mật khẩu mới', 'new-password')}${pwChecklist('newpw-rules')}
    <div class="auth-err" id="newpw-err" role="alert"></div><button class="btn primary lg" type="submit">Lưu mật khẩu mới</button></form>`;
  return `<div class="card pw-card"><div class="row gap mb"><a class="btn" href="#bao-mat">${ICON.chevL} Bảo mật</a></div><h3>Đổi mật khẩu quản trị</h3>${head}${body}</div>`;
};
function afterPwRender() {
  if (UI.route !== 'doi-mat-khau') return;
  if (PW.step === 2 && $('#otp-form')) {
    const boxes = $$('[data-otp]'); if (!boxes.some((b) => b === document.activeElement)) boxes[0].focus();
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => { b.value = b.value.replace(/\D/g, '').slice(-1); if (b.value && boxes[i + 1]) boxes[i + 1].focus(); if (boxes.every((x) => x.value)) $('#otp-form').requestSubmit(); });
      b.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !b.value && boxes[i - 1]) boxes[i - 1].focus(); });
      b.addEventListener('paste', (e) => { const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6); if (t.length) { e.preventDefault(); t.split('').forEach((d, k) => { if (boxes[k]) boxes[k].value = d; }); (boxes[t.length] || boxes[5]).focus(); if (t.length === 6) $('#otp-form').requestSubmit(); } });
    });
    $('#otp-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const code = boxes.map((b) => b.value).join(''); if (code.length !== 6) { $('#otp-err').textContent = 'Nhập đủ 6 chữ số'; return; }
      try { const r = await API.call('POST', '/api/auth/otp/verify', { requestId: PW.req.requestId, code }); PW.ticket = r.ticket; PW.step = 3; clearInterval(PW.timer); render(); }
      catch (err) { $('#otp-err').textContent = err.message; boxes.forEach((b) => (b.value = '')); boxes[0].focus(); if (err.data && ['OTP_INVALID', 'OTP_EXPIRED', 'OTP_USED'].includes(err.data.code)) { $('#otp-resend').disabled = false; } }
    });
    clearInterval(PW.timer);
    const tick = () => {
      const el = $('#otp-exp'); if (!el) { clearInterval(PW.timer); return; }
      const left = Math.max(0, Math.round((PW.sentAt + PW.req.expiresInSeconds * 1000 - Date.now()) / 1000));
      el.innerHTML = left > 0 ? `Mã hết hạn sau <b>${Math.floor(left / 60)}:${pad(left % 60)}</b>` : '<span class="neg">Mã đã hết hạn — hãy gửi lại mã mới</span>';
      const rs = Math.max(0, Math.round((PW.sentAt + PW.req.resendAfterSeconds * 1000 - Date.now()) / 1000)); const b = $('#otp-resend');
      if (b) { b.disabled = rs > 0; b.textContent = rs > 0 ? `Gửi lại sau ${rs}s` : 'Gửi lại mã'; }
    };
    tick(); PW.timer = setInterval(tick, 1000);
  }
  if (PW.step === 3 && $('#newpw-form')) {
    const f = $('#newpw-form'); bindPwChecklist(f, '[name=newPassword]', '[name=confirm]', '#newpw-rules'); if (!f.contains(document.activeElement)) f.newPassword.focus();
    f.addEventListener('submit', async (e) => {
      e.preventDefault(); const btn = f.querySelector('button[type=submit]'); btn.disabled = true; $('#newpw-err').textContent = '';
      try { await API.call('POST', '/api/auth/password', { ticket: PW.ticket, newPassword: f.newPassword.value, confirm: f.confirm.value }); Object.assign(PW, { step: 1, req: null, ticket: null }); Auth.me = null; Auth.stopTimers(); showLogin('Đổi mật khẩu thành công. Tất cả phiên đăng nhập đã được đăng xuất — vui lòng đăng nhập lại bằng mật khẩu mới.', 'ok'); }
      catch (err) { $('#newpw-err').textContent = err.message; btn.disabled = false; if (/xác thực lại/.test(err.message)) { PW.step = 1; setTimeout(render, 1500); } }
    });
  }
}
async function pwSend() {
  try { const r = await API.call('POST', '/api/auth/otp/request', { purpose: 'password' }); PW.req = r; PW.sentAt = Date.now(); PW.step = 2; render(); toast('Đã gửi mã OTP tới ' + r.maskedEmail); }
  catch (err) { toast(err.message, 'err'); }
}
async function secEmail() {
  const me = Auth.me || {};
  if (!me.maskedEmail) {
    formModal({ title: 'Khai báo email nhận mã OTP', fields: [{ name: 'email', label: 'Email quản trị', type: 'email', required: true }], okLabel: 'Lưu', onSubmit: (v, w) => {
      API.call('POST', '/api/security/otp-email', { email: v.email }).then(() => { toast('Đã khai báo email nhận OTP'); SEC.sessions = null; loadSecurity(); }).catch((e) => toast(e.message, 'err'));
    } });
    return;
  }
  // đổi email: xác thực bằng OTP gửi tới email hiện tại
  openModal({ title: 'Đổi email nhận mã OTP', body: `<p>Mã xác thực sẽ được gửi tới email hiện tại <b>${esc(me.maskedEmail)}</b>.</p><label class="field"><span>Email mới</span><input type="email" id="new-email"></label><div id="em-step2" hidden><label class="field mt"><span>Mã OTP 6 số</span><input id="em-code" inputmode="numeric" maxlength="6"></label></div><div class="auth-err" id="em-err"></div>`,
    foot: `<button class="btn" data-close>Hủy</button><button class="btn primary" id="em-go">Gửi mã OTP</button>`, onOpen: (w, close) => {
      let req = null;
      $('#em-go', w).addEventListener('click', async () => {
        $('#em-err', w).textContent = '';
        try {
          if (!req) { req = await API.call('POST', '/api/auth/otp/request', { purpose: 'email', newEmail: $('#new-email', w).value.trim() }); $('#em-step2', w).hidden = false; $('#new-email', w).disabled = true; $('#em-go', w).textContent = 'Xác nhận đổi email'; $('#em-code', w).focus(); return; }
          const v = await API.call('POST', '/api/auth/otp/verify', { requestId: req.requestId, code: $('#em-code', w).value.trim() });
          await API.call('POST', '/api/security/otp-email', { ticket: v.ticket }); close(); toast('Đã đổi email nhận OTP'); loadSecurity();
        } catch (e) { $('#em-err', w).textContent = e.message; }
      });
    } });
}
