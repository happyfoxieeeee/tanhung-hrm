/* TAN HUNG HRM — mã giao diện (được tạo bởi scripts/build-web.js từ thư mục web/, đừng sửa trực tiếp) */
(function () {
'use strict';
const E = window.Engine;
/* ---- app-core.js ---- */
/* ===== CORE: tiện ích, lưu trữ, khung giao diện, hộp thoại, xuất file ===== */
const pad = E.pad;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vnd = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');
const num = (n, dp = 2) => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: dp });
const fmtDate = (ds) => (ds ? String(ds).slice(0, 10).split('-').reverse().join('/') : '');
const TZ = 'Asia/Ho_Chi_Minh';
const fmtDT = (iso) => { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return String(iso); return d.toLocaleString('vi-VN', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); };
const ymLabel = (ym) => { const { y, m } = E.ymParts(ym); return 'Tháng ' + m + '/' + y; };
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DOW_FULL = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
// Dữ liệu từ bộ nhớ đám mây được giao ở dạng chỉ đọc (frozen) — luôn sao chép sâu trước khi dùng/sửa
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const parseMoney = (v) => { const s = String(v ?? '').replace(/[^\d-]/g, ''); return s ? Number(s) : 0; };
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD theo giờ Việt Nam
const curYm = () => todayStr().slice(0, 7);
const STATUS_LABEL = { none: 'Chưa tính', review: 'Đang kiểm tra', locked: 'Đã chốt lương' };
const OT_LABEL = { weekday: 'Ngày thường', weeklyOff: 'Chủ nhật', holiday: 'Ngày lễ' };

/* ---------- Trạng thái ---------- */
function emptyState() { return { settings: E.defaultSettings(), employees: [], months: {}, initialized: false }; }
let S = emptyState();
const UI = {
  route: 'dashboard', ym: curYm(),
  emp: { q: '', status: 'active', pos: '', sort: 'code', dir: 1, page: 1, size: 10 },
  pay: { q: '', sort: 'code', dir: 1 },
  att: { q: '', sel: new Set(), day: null }, focus: null,
  otEmp: '', advEmp: '', allowTab: 'cc', profileTab: 'pay', slipEmp: '', setTab: 'general',
};

/* ---------- Lưu trữ: API máy chủ + PostgreSQL (không dùng localStorage cho dữ liệu chính thức) ---------- */
// Mọi lần ghi được xếp hàng tuần tự; hồ sơ nhân sự luôn được lưu trước dữ liệu tháng tham chiếu tới nó.
const Store = {
  sync: 'idle', syncMsg: '', dirty: {}, timers: {}, chain: Promise.resolve(), loaded: false,
  async load() {
    const st = await API.call('GET', '/api/state');
    S = { settings: Object.assign(E.defaultSettings(), st.settings || {}), employees: st.employees || [], months: st.months || {}, initialized: !!st.initialized };
    this.loaded = true; setSync('saved');
  },
  touch(key) {
    S.initialized = true; this.dirty[key] = true; setSync('saving');
    clearTimeout(this.timers[key]); this.timers[key] = setTimeout(() => this.enqueue(key), 350);
  },
  enqueue(key) { clearTimeout(this.timers[key]); this.chain = this.chain.then(() => this.flush(key)).catch(() => {}); return this.chain; },
  pending() { return Object.keys(this.dirty).filter((k) => this.dirty[k]); },
  /** Ghi ngay mọi thay đổi đang chờ (gọi trước khi chốt lương, đăng xuất…) */
  async flushAll() { const keys = this.pending().sort((a, b) => rank(a) - rank(b)); for (const k of keys) await this.enqueue(k); await this.chain; return !this.pending().length; },
  async flush(key) {
    if (!this.dirty[key]) return;
    if (key.startsWith('month:') && this.dirty.employees) await this.flush('employees');
    this.dirty[key] = false;
    try {
      if (key === 'settings') await API.call('PUT', '/api/settings', { settings: S.settings });
      else if (key === 'employees') { const r = await API.call('PUT', '/api/employees', { list: S.employees }); if (!this.dirty.employees) S.employees = r.employees; }
      else if (key.startsWith('month:')) { const ym = key.slice(6); const m = await API.call('PUT', '/api/months/' + ym, { month: S.months[ym] || E.emptyMonth() }); if (!this.dirty[key]) { S.months[ym] = m; scheduleRender(); } }
      if (!this.pending().length) setSync('saved');
    } catch (e) {
      if (e.status === 401) return;
      toast('Chưa lưu được: ' + e.message, e.status === 409 ? 'warn' : 'err');
      setSync('error', e.message);
      // đồng bộ lại với dữ liệu thật trên máy chủ để không hiển thị số liệu chưa được lưu
      try { await this.load(); scheduleRender(); } catch (e2) { /* bỏ qua */ }
    }
  },
  async replaceAll(ns) {
    await this.flushAll();
    const r = await API.call('POST', '/api/restore', { app: 'tanhung-hrm', data: { settings: ns.settings, employees: ns.employees, months: ns.months } });
    await this.load(); return r;
  },
};
const rank = (k) => (k === 'settings' ? 0 : k === 'employees' ? 1 : 2);
window.addEventListener('beforeunload', (e) => { if (Store.pending().length) { e.preventDefault(); e.returnValue = ''; } });
function setSync(state, msg) {
  Store.sync = state; Store.syncMsg = msg || '';
  const el = $('#sync'); if (!el) return;
  const map = { idle: ['dot-gray', 'Đang kết nối…'], saving: ['dot-amber', 'Đang lưu vào CSDL…'], saved: ['dot-green', 'CSDL: đã kết nối · đã lưu'], offline: ['dot-red', 'Mất kết nối máy chủ'], error: ['dot-red', 'Lỗi lưu: ' + (msg || '')] };
  const [c, t] = map[state] || map.idle; el.innerHTML = `<span class="dot ${c}"></span><span>${esc(t)}</span>`; el.title = t;
}
let pendingRender = false;
function scheduleRender() { if ($('#modal-root').children.length || $('#pop').classList.contains('show')) { pendingRender = true; return; } render(); }

/* ---------- Truy cập dữ liệu tháng ---------- */
function getM(ym) { return S.months[ym] || E.emptyMonth(); }
function isLocked(ym) { return (S.months[ym] || {}).status === 'locked'; }
function mutMonth(ym, fn, opts = {}) {
  if (isLocked(ym)) { toast(ymLabel(ym) + ' đã chốt lương. Mở khóa ở mục Bảng lương để chỉnh sửa.', 'warn'); return false; }
  if (!S.months[ym]) S.months[ym] = E.emptyMonth();
  const M = S.months[ym];
  ['att', 'allow'].forEach((k) => (M[k] = M[k] || {})); ['late', 'ot', 'adv', 'bonus', 'ded', 'log'].forEach((k) => (M[k] = M[k] || []));
  fn(M);
  Store.touch('month:' + ym);
  if (!opts.silent) render();
  return true;
}
function saveSettings() { Store.touch('settings'); render(); }
function saveEmployees() { Store.touch('employees'); render(); }
function empById(id) { return S.employees.find((e) => e.id === id); }
function empName(id) { const e = empById(id); return e ? e.name : '(đã xóa)'; }
function empsForMonth(ym) { const M = getM(ym); return S.employees.filter((e) => E.empInMonth(e, ym, M)).sort((a, b) => String(a.code).localeCompare(String(b.code))); }
function empOptions(ym, selected, opts = {}) {
  const list = ym ? empsForMonth(ym) : S.employees;
  return (opts.blank ? `<option value="">${esc(opts.blank)}</option>` : '') + list.map((e) => `<option value="${e.id}" ${e.id === selected ? 'selected' : ''}>${esc(e.code)} – ${esc(e.name)}</option>`).join('');
}
function nextCode() {
  const pre = S.settings.codePrefix || 'NV';
  const max = S.employees.reduce((m, e) => { const mm = String(e.code || '').match(/(\d+)$/); return mm ? Math.max(m, Number(mm[1])) : m; }, 0);
  return pre + String(max + 1).padStart(3, '0');
}

/* ---------- Thông báo, hộp thoại ---------- */
function toast(msg, kind = 'ok') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3700);
}
function openModal({ title, body, wide, foot, onOpen }) {
  const root = $('#modal-root');
  const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Đóng">${ICON.x}</button></div><div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  root.appendChild(wrap);
  const close = () => { wrap.remove(); if (!root.children.length && pendingRender) { pendingRender = false; render(); } };
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  wrap._close = close; wrap.tabIndex = -1;
  setTimeout(() => { const f = wrap.querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea'); (f || wrap).focus(); }, 30);
  if (onOpen) onOpen(wrap, close);
  return { el: wrap, close };
}
function confirmBox(title, msg, { ok = 'Đồng ý', danger = false } = {}) {
  return new Promise((res) => {
    let done = false;
    const m = openModal({ title, body: `<div class="confirm-msg">${msg}</div>`, foot: `<button class="btn" data-close>Hủy</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>`,
      onOpen: (w, close) => { w.querySelector('[data-ok]').addEventListener('click', () => { done = true; close(); res(true); }); } });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) res(false); } });
    obs.observe($('#modal-root'), { childList: true });
  });
}
function formModal({ title, fields, values = {}, okLabel = 'Lưu', wide, onSubmit, extra = '' }) {
  const body = `<form class="form-grid ${wide ? 'cols3' : ''}" novalidate>${fields.map((f) => fieldHtml(f, values[f.name])).join('')}</form>${extra}`;
  openModal({ title, wide, body, foot: `<button class="btn" data-close>Hủy</button><button class="btn primary" data-ok>${esc(okLabel)}</button>`,
    onOpen: (w, close) => {
      const form = w.querySelector('form');
      const submit = (e) => { e && e.preventDefault(); const vals = readForm(form, fields); const err = onSubmit(vals, w); if (err) { toast(err, 'warn'); return; } close(); };
      w.querySelector('[data-ok]').addEventListener('click', submit); form.addEventListener('submit', submit);
    } });
}
function fieldHtml(f, v) {
  if (f.type === 'section') return `<div class="form-section">${esc(f.label)}</div>`;
  const val = v ?? f.default ?? '';
  const req = f.required ? ' <span class="req">*</span>' : '';
  const cls = 'field' + (f.full ? ' full' : '');
  let input;
  if (f.type === 'select') input = `<select name="${f.name}">${f.options.map((o) => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(ov)}" ${String(ov) === String(val) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
  else if (f.type === 'checkbox') return `<label class="${cls} check"><input type="checkbox" name="${f.name}" ${val ? 'checked' : ''}> ${esc(f.label)}</label>`;
  else if (f.type === 'money') input = `<input class="money" name="${f.name}" inputmode="numeric" value="${val === '' ? '' : vnd(val)}" placeholder="${esc(f.placeholder || '0')}">`;
  else if (f.type === 'textarea') input = `<textarea name="${f.name}" rows="2">${esc(val)}</textarea>`;
  else input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(val)}" ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''} placeholder="${esc(f.placeholder || '')}">`;
  return `<label class="${cls}"><span>${esc(f.label)}${req}</span>${input}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</label>`;
}
function readForm(form, fields) {
  const out = {};
  fields.forEach((f) => {
    if (f.type === 'section') return; const el = form.elements[f.name]; if (!el) return;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'money') out[f.name] = el.value.trim() === '' ? '' : parseMoney(el.value);
    else if (f.type === 'number') out[f.name] = el.value === '' ? '' : Number(el.value);
    else out[f.name] = el.value.trim();
  });
  return out;
}
// định dạng tiền khi gõ
document.addEventListener('input', (e) => {
  const t = e.target; if (!t.classList || !t.classList.contains('money')) return;
  const raw = t.value.replace(/[^\d]/g, ''); const pos = t.value.length - t.selectionStart;
  t.value = raw ? Number(raw).toLocaleString('vi-VN') : ''; const np = Math.max(0, t.value.length - pos); t.setSelectionRange(np, np);
});

/* ---------- Xuất / lưu file ---------- */
async function saveFile(filename, data, mime) {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); toast('Đã tải xuống ' + filename); return true;
  } catch (e) { toast('Không tải được file: ' + e.message, 'err'); return false; }
}
function needXLSX() { if (!window.XLSX) { toast('Thư viện Excel chưa tải xong, vui lòng thử lại sau vài giây', 'warn'); return false; } return true; }
function xlsxBuffer(wb) { return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }); }
function sheetFromAoa(aoa, widths, moneyCols = [], fromRow = 0) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let R = fromRow; R <= range.e.r; R++) for (const C of moneyCols) { const a = XLSX.utils.encode_cell({ r: R, c: C }); if (ws[a] && typeof ws[a].v === 'number') ws[a].z = '#,##0'; }
  return ws;
}
function pickFile(accept) {
  return new Promise((res) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
    inp.addEventListener('change', () => { res(inp.files[0] || null); inp.remove(); }); document.body.appendChild(inp); inp.click();
  });
}
function parseDateCell(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate());
  if (typeof v === 'number' && window.XLSX) { const d = XLSX.SSF.parse_date_code(v); if (d) return d.y + '-' + pad(d.m) + '-' + pad(d.d); }
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
  return '';
}

/* ---------- Biểu tượng ---------- */
const sv = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  dashboard: sv('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  users: sv('<path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="10" cy="8" r="3.5"/><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.3M15.5 4.7a3.5 3.5 0 0 1 0 6.6"/>'),
  calendar: sv('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/>'),
  clock: sv('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  late: sv('<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2 1.5M9 2.5h6M19 5.5l1.5 1.5"/>'),
  wallet: sv('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3"/><rect x="3" y="7.5" width="18" height="12" rx="2"/><circle cx="16.5" cy="13.5" r="1.2"/>'),
  gift: sv('<rect x="3.5" y="8.5" width="17" height="4" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8.5V20M12 8.5S10.5 4 8 4.5 7 8.5 12 8.5zM12 8.5S13.5 4 16 4.5s1 4-4 4z"/>'),
  table: sv('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 9v11M15 9v11"/>'),
  slip: sv('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>'),
  gear: sv('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>'), x: sv('<path d="M6 6l12 12M18 6L6 18"/>'),
  edit: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  trash: sv('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  eye: sv('<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="2.8"/>'),
  download: sv('<path d="M12 4v11M7 10.5l5 5 5-5M4.5 20h15"/>'), upload: sv('<path d="M12 16V5M7 9.5l5-5 5 5M4.5 20h15"/>'),
  lock: sv('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  unlock: sv('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.8-1.3"/>'),
  print: sv('<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="1.5"/><path d="M7 14h10v6.5H7z"/>'),
  chevL: sv('<path d="M15 5l-7 7 7 7"/>'), chevR: sv('<path d="M9 5l7 7-7 7"/>'),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>'), alert: sv('<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.2"/>'),
  copy: sv('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  fill: sv('<path d="M4 20h16M6 16l6-12 6 12M8.5 11h7"/>'), calc: sv('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h1.5M11.3 11h1.5M14.5 11H16M8 14.5h1.5M11.3 14.5h1.5M14.5 14.5V18M8 18h1.5M11.3 18h1.5"/>'),
  history: sv('<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 4v4.5H8M12 8v4.5l3 1.5"/>'),
};

/* ---------- Khung ứng dụng ---------- */
const NAV = [
  ['dashboard', 'Dashboard', 'dashboard'], ['nhan-su', 'Nhân sự', 'users'], ['cham-cong', 'Chấm công', 'calendar'],
  ['di-tre', 'Đi trễ', 'late'], ['tang-ca', 'Tăng ca', 'clock'], ['ung-luong', 'Ứng lương', 'wallet'],
  ['phu-cap', 'Phụ cấp & Thưởng', 'gift'], ['bang-luong', 'Bảng lương', 'table'], ['phieu-luong', 'Phiếu lương', 'slip'], ['cai-dat', 'Cài đặt', 'gear'],
];
const VIEWS = {};
const TITLES = { ...Object.fromEntries(NAV.map((n) => [n[0], n[1]])), 'bao-mat': 'Bảo mật & phiên đăng nhập', 'doi-mat-khau': 'Đổi mật khẩu' };

function renderShell() {
  const r = UI.route.startsWith('ho-so-') ? 'nhan-su' : UI.route;
  $('#sb-nav').innerHTML = NAV.map(([k, label, ic]) => `<a href="#${k}" class="nav-item ${r === k ? 'active' : ''}">${ICON[ic]}<span>${label}</span></a>`).join('');
  const M = S.months[UI.ym]; const st = (M && M.status) || 'none';
  const showMonth = !['nhan-su', 'cai-dat', 'bao-mat', 'doi-mat-khau'].includes(UI.route);
  const title = UI.route.startsWith('ho-so-') ? 'Hồ sơ nhân viên' : TITLES[UI.route] || '';
  $('#top').innerHTML = `<div class="top-title"><button class="icon-btn nav-btn" data-act="nav-toggle" aria-label="Mở menu">${sv('<path d="M4 7h16M4 12h16M4 17h16"/>')}</button><h1>${esc(title)}</h1></div>
    <div class="top-right">${showMonth || UI.route.startsWith('ho-so-') ? `<div class="month-pick"><button class="icon-btn" data-act="month-prev" title="Tháng trước">${ICON.chevL}</button>
      <input type="month" id="ym-input" value="${UI.ym}" aria-label="Chọn tháng"><button class="icon-btn" data-act="month-next" title="Tháng sau">${ICON.chevR}</button></div>
      <span class="badge st-${st}">${st === 'locked' ? ICON.lock : ''}${STATUS_LABEL[st]}</span>` : ''}</div>`;
}
let lastRoute = null;
function render() {
  const active = document.activeElement; const aid = active && active.id; let sel = null;
  try { sel = aid && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null; } catch (e) { sel = null; }
  const routeChanged = lastRoute !== UI.route; lastRoute = UI.route;
  renderShell();
  const view = $('#view');
  let html;
  if (!S.initialized && !S.employees.length) html = vWelcome();
  else if (UI.route.startsWith('ho-so-')) html = vProfile(UI.route.slice(6));
  else html = (VIEWS[UI.route] || VIEWS.dashboard)();
  const sc = view.scrollTop; const gridSc = $('.grid-scroll') ? [$('.grid-scroll').scrollLeft, $('.grid-scroll').scrollTop] : null;
  view.innerHTML = html;
  if (!routeChanged) { view.scrollTop = sc; const g = $('.grid-scroll'); if (g && gridSc) { g.scrollLeft = gridSc[0]; g.scrollTop = gridSc[1]; } } else view.scrollTop = 0;
  if (aid) { const el = document.getElementById(aid); if (el && el !== document.activeElement) { el.focus(); try { if (sel) el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* */ } } }
  afterPwRender();
  if (UI.route === 'cham-cong' && UI.focus && UI.focus.restore) { const td = $(`td.cell[data-e="${UI.focus.e}"][data-d="${UI.focus.d}"]`); if (td) td.focus({ preventScroll: true }); UI.focus.restore = false; }
  setSync(Store.sync, Store.syncMsg);
}
function route() {
  let h = (location.hash || '').replace('#', '');
  if (!h || (!TITLES[h] && !h.startsWith('ho-so-'))) h = 'dashboard';
  if (h === 'bao-mat' && UI.route !== 'bao-mat') SEC.sessions = null;
  UI.route = h; document.body.classList.remove('nav-open'); hidePop(); $$('#modal-root .modal-wrap').forEach((w) => w._close && w._close()); render();
}
function go(r) { if (location.hash === '#' + r) route(); else location.hash = r; }

/* ---------- Bảng sắp xếp được ---------- */
function sortRows(rows, key, dir, getter) { const g = getter || ((r) => r[key]); return rows.slice().sort((a, b) => { const x = g(a, key), y = g(b, key); if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir; return String(x ?? '').localeCompare(String(y ?? ''), 'vi') * dir; }); }
function th(label, key, st, cls = '') { const on = st.sort === key; return `<th class="sortable ${cls} ${on ? 'on' : ''}" data-sort="${key}">${label}<i>${on ? (st.dir > 0 ? '▲' : '▼') : '↕'}</i></th>`; }

document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; const ws = $$('#modal-root .modal-wrap'); if (ws.length) { e.preventDefault(); ws[ws.length - 1]._close(); } });

/* ---- views-a.js ---- */
/* ===== VIEWS A: Chào mừng, Dashboard, Nhân sự, Hồ sơ ===== */
function vWelcome() {
  return `<div class="welcome card"><div class="welcome-mark">TH</div><h2>Chào mừng đến hệ thống Nhân sự & Tiền lương</h2>
  <p>${esc(S.settings.company)}</p><p class="muted">Chưa có dữ liệu. Bạn có thể nạp bộ dữ liệu mẫu (7 nhân viên, 3 tháng, đầy đủ tình huống kiểm thử) để trải nghiệm, hoặc bắt đầu với dữ liệu trống.</p>
  <div class="row gap center"><button class="btn primary lg" data-act="load-sample">${ICON.download} Nạp dữ liệu mẫu</button><button class="btn lg" data-act="start-empty">Bắt đầu trống</button></div>
  <p class="muted small" id="sync-note">Đang kiểm tra dữ liệu đã lưu…</p></div>`;
}

/* ---------- Dashboard ---------- */
VIEWS.dashboard = function () {
  const ym = UI.ym, M = getM(ym), P = E.payroll(S.settings, S.employees, ym, M), t = P.totals;
  const activeCount = S.employees.filter((e) => e.status === 'active').length;
  const lateRows = P.rows.filter((r) => r.lateMin > 0);
  const short = P.rows.filter((r) => r.paidCong < r.std - 1e-9);
  const tiles = [
    ['Nhân viên đang làm', activeCount, 'người', 'users'],
    ['Tổng quỹ lương', vnd(t.gross), 'đ', 'table'],
    ['Tổng tiền tăng ca', vnd(t.otPay), 'đ', 'clock'],
    ['Phụ cấp & thưởng', vnd(t.cc + t.fuel + t.bonus), 'đ', 'gift'],
    ['Tổng tiền ứng lương', vnd(t.adv), 'đ', 'wallet'],
    ['Tổng thực lĩnh', vnd(t.net), 'đ', 'slip'],
    ['Nhân viên đi trễ', lateRows.length, 'người · ' + num(t.lateMin, 0) + ' phút', 'late'],
  ];
  // biểu đồ quỹ lương theo tháng của năm đang chọn
  const year = E.ymParts(ym).y; const trend = [];
  for (let m = 1; m <= 12; m++) { const k = year + '-' + pad(m); const MM = S.months[k]; if (!MM) { trend.push({ k, m, v: null }); continue; } const pp = E.payroll(S.settings, S.employees, k, MM); trend.push({ k, m, v: pp.totals.gross, net: pp.totals.net, st: MM.status }); }
  const maxV = Math.max(1, ...trend.map((x) => x.v || 0));
  const bars = trend.map((x) => `<div class="vbar-col ${x.k === ym ? 'cur' : ''}" data-tip="${x.v == null ? 'T' + x.m + ': chưa có dữ liệu' : 'T' + x.m + '/' + year + ' · Tổng thu nhập ' + vnd(x.v) + ' đ · Thực lĩnh ' + vnd(x.net) + ' đ · ' + STATUS_LABEL[x.st || 'none']}">
      <div class="vbar-val">${x.v == null ? '' : num(x.v / 1e6, 1)}</div><div class="vbar-track"><div class="vbar" style="height:${x.v == null ? 0 : Math.max(2, (x.v / maxV) * 100)}%"></div></div><div class="vbar-lbl">T${x.m}</div></div>`).join('');
  const parts = [['Lương theo công', t.base], ['Tăng ca', t.otPay], ['Phụ cấp chuyên cần', t.cc], ['Phụ cấp xăng xe', t.fuel], ['Thưởng / phúc lợi', t.bonus]];
  const pSum = parts.reduce((a, p) => a + p[1], 0) || 1; const pMax = Math.max(1, ...parts.map((p) => p[1]));
  const hbars = parts.map(([l, v]) => `<div class="hbar-row" data-tip="${l}: ${vnd(v)} đ (${num((v / pSum) * 100, 1)}%)"><div class="hbar-lbl">${l}</div><div class="hbar-track"><div class="hbar" style="width:${(v / pMax) * 100}%"></div></div><div class="hbar-val">${vnd(v)}<small>${num((v / pSum) * 100, 1)}%</small></div></div>`).join('');
  const deds = [['Trừ đi trễ', t.lateDed], ['BHXH/BHYT/BHTN (NLĐ)', t.insTotal], ['Khấu trừ khác', t.otherDed], ['Ứng lương', t.adv]];
  return `<div class="kpis">${tiles.map(([l, v, u, ic]) => `<div class="kpi card"><div class="kpi-ic">${ICON[ic]}</div><div><div class="kpi-lbl">${l}</div><div class="kpi-val">${v}<small> ${u}</small></div></div></div>`).join('')}</div>
  <div class="grid2">
    <div class="card"><div class="card-head"><h3>Biến động quỹ lương ${year}</h3><span class="muted small">Tổng thu nhập theo tháng, triệu đồng</span></div><div class="vbars">${bars}</div>
      <details class="tbl-toggle"><summary>Xem dạng bảng</summary><table class="tbl compact"><thead><tr><th>Tháng</th><th class="r">Tổng thu nhập</th><th class="r">Thực lĩnh</th><th>Trạng thái</th></tr></thead><tbody>${trend.filter((x) => x.v != null).map((x) => `<tr><td>T${x.m}/${year}</td><td class="r">${vnd(x.v)}</td><td class="r">${vnd(x.net)}</td><td>${STATUS_LABEL[x.st || 'none']}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Chưa có dữ liệu</td></tr>'}</tbody></table></details></div>
    <div class="card"><div class="card-head"><h3>Cơ cấu chi phí nhân sự · ${ymLabel(ym)}</h3></div><div class="hbars">${hbars}</div>
      <div class="ded-strip">${deds.map(([l, v]) => `<div><span>${l}</span><b>${vnd(v)}</b></div>`).join('')}</div></div>
  </div>
  <div class="grid2">
    <div class="card"><div class="card-head"><h3>Nhân viên chưa đủ công</h3><span class="muted small">Công chuẩn ${ymLabel(ym)}: <b>${P.std}</b></span></div>
      ${short.length ? `<table class="tbl compact"><thead><tr><th>Nhân viên</th><th class="r">Công hưởng lương</th><th class="r">Thiếu</th><th class="r">Phép</th><th class="r">KL</th></tr></thead><tbody>${short.map((r) => `<tr class="click" data-go="ho-so-${r.empId}"><td><b>${esc(r.code)}</b> ${esc(r.name)}</td><td class="r">${num(r.paidCong)}/${r.std}</td><td class="r neg">${num(r.std - r.paidCong)}</td><td class="r">${r.sum.P}</td><td class="r">${r.sum.K}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Tất cả nhân viên đủ công.</div>'}</div>
    <div class="card"><div class="card-head"><h3>Đi trễ trong tháng</h3></div>
      ${lateRows.length ? `<table class="tbl compact"><thead><tr><th>Nhân viên</th><th class="r">Tổng phút</th><th class="r">Tiền trừ</th></tr></thead><tbody>${lateRows.map((r) => `<tr><td><b>${esc(r.code)}</b> ${esc(r.name)}</td><td class="r">${r.lateMin}</td><td class="r neg">${vnd(r.lateDed)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Không có nhân viên đi trễ.</div>'}
      <div class="row gap mt"><a class="btn" href="#bang-luong">${ICON.table} Mở bảng lương</a><a class="btn" href="#cham-cong">${ICON.calendar} Chấm công</a></div></div>
  </div>`;
};

/* ---------- Nhân sự ---------- */
const EMP_FIELDS = () => [
  { type: 'section', label: 'Thông tin cá nhân' },
  { name: 'code', label: 'Mã nhân viên', hint: 'Tự động sinh, có thể sửa' },
  { name: 'name', label: 'Họ và tên', required: true },
  { name: 'dob', label: 'Ngày sinh', type: 'date' },
  { name: 'gender', label: 'Giới tính', type: 'select', options: ['Nam', 'Nữ', 'Khác'] },
  { name: 'phone', label: 'Số điện thoại' },
  { name: 'address', label: 'Địa chỉ thường trú', full: true },
  { name: 'cccd', label: 'Số CCCD' }, { name: 'cccdDate', label: 'Ngày cấp CCCD', type: 'date' }, { name: 'cccdPlace', label: 'Nơi cấp CCCD' },
  { type: 'section', label: 'Công việc & lương' },
  { name: 'position', label: 'Chức danh / vị trí' },
  { name: 'startDate', label: 'Ngày bắt đầu làm việc', type: 'date', required: true },
  { name: 'status', label: 'Tình trạng', type: 'select', options: [['active', 'Đang làm'], ['left', 'Đã nghỉ']] },
  { name: 'salary', label: 'Mức lương thỏa thuận / tháng', type: 'money', required: true },
  { name: 'payFrom', label: 'Mức lương (và lương đóng BH) áp dụng từ tháng', type: 'month', hint: 'Khi tăng/giảm lương: các tháng trước tháng này giữ nguyên mức cũ' },
  { name: 'fuelDefault', label: 'Phụ cấp xăng xe mặc định / tháng', type: 'money' },
  { name: 'leftDate', label: 'Ngày nghỉ việc', type: 'date' },
  { type: 'section', label: 'Bảo hiểm (BHXH/BHYT/BHTN)' },
  { name: 'insJoin', label: 'Tham gia BH bắt buộc — khấu trừ phần NLĐ đóng', type: 'checkbox' },
  { name: 'insSalary', label: 'Mức lương làm căn cứ đóng BHXH', type: 'money', hint: 'Quản lý riêng với lương thỏa thuận' },
  { name: 'insCustom', label: 'Dùng tỷ lệ riêng cho NV này', type: 'checkbox' },
  { name: 'rBhxh', label: 'BHXH NLĐ (%)', type: 'number', step: '0.1' }, { name: 'rBhyt', label: 'BHYT NLĐ (%)', type: 'number', step: '0.1' }, { name: 'rBhtn', label: 'BHTN NLĐ (%)', type: 'number', step: '0.1' },
  { name: 'note', label: 'Ghi chú', type: 'textarea', full: true },
];
function openEmpForm(id) {
  const e = id ? empById(id) : null; const sr = S.settings.insRates;
  const v = e ? { ...e, payFrom: curYm(), rBhxh: (e.insRates || sr).bhxh, rBhyt: (e.insRates || sr).bhyt, rBhtn: (e.insRates || sr).bhtn }
    : { payFrom: curYm(), code: nextCode(), gender: 'Nam', status: 'active', startDate: todayStr(), cccdPlace: 'Cục CS QLHC về TTXH', insJoin: false, rBhxh: sr.bhxh, rBhyt: sr.bhyt, rBhtn: sr.bhtn };
  formModal({ title: e ? 'Sửa hồ sơ ' + e.code : 'Thêm nhân viên', fields: EMP_FIELDS(), values: v, wide: true, onSubmit: (x) => {
    if (!x.name) return 'Vui lòng nhập họ tên';
    if (!x.startDate) return 'Vui lòng nhập ngày bắt đầu làm việc';
    if (!(x.salary > 0)) return 'Mức lương thỏa thuận phải lớn hơn 0';
    const code = x.code || nextCode();
    if (S.employees.some((o) => o.code === code && o.id !== id)) return 'Mã nhân viên ' + code + ' đã tồn tại';
    if (x.cccd && !/^\d{9,12}$/.test(x.cccd)) return 'Số CCCD phải gồm 9–12 chữ số';
    if (x.insJoin && !(x.insSalary > 0)) return 'Nhân viên tham gia BH cần có mức lương đóng BHXH';
    if (e && (x.salary !== e.salary || (x.insSalary || 0) !== (e.insSalary || 0)) && !/^\d{4}-\d{2}$/.test(x.payFrom || '')) return 'Chọn tháng bắt đầu áp dụng mức lương mới';
    const payChanged = e && (x.salary !== e.salary || (x.insSalary || 0) !== (e.insSalary || 0));
    const rec = { ...(e || { id: uid('e') }), code, name: x.name, dob: x.dob, gender: x.gender, phone: x.phone, address: x.address, cccd: x.cccd, cccdDate: x.cccdDate, cccdPlace: x.cccdPlace,
      position: x.position, startDate: x.startDate, status: x.status, leftDate: x.status === 'left' ? (x.leftDate || todayStr()) : '', salary: x.salary || 0, fuelDefault: x.fuelDefault || 0,
      insJoin: x.insJoin, insSalary: x.insSalary || 0, insCustom: x.insCustom, insRates: { bhxh: Number(x.rBhxh) || 0, bhyt: Number(x.rBhyt) || 0, bhtn: Number(x.rBhtn) || 0 }, note: x.note };
    if (e) {
      const oldSal = e.salary, oldIns = e.insSalary || 0;
      if (payChanged) { delete rec.salary; delete rec.insSalary; }
      Object.assign(e, rec);
      if (payChanged) { E.setPayFrom(e, x.payFrom, x.salary, x.insSalary || 0); afterPayChange(e, x.payFrom, oldSal, oldIns); }
    } else S.employees.push(rec);
    saveEmployees(); if (!payChanged) toast(e ? 'Đã cập nhật hồ sơ' : 'Đã thêm ' + rec.name);
  } });
}
function afterPayChange(e, from, oldSal, oldIns) {
  const lockedAfter = Object.keys(S.months).filter((ym) => ym >= from && isLocked(ym) && (S.months[ym].snapshot || { rows: [] }).rows.some((r) => r.empId === e.id)).sort();
  const openBefore = Object.keys(S.months).filter((ym) => ym < from && !isLocked(ym) && E.empInMonth(e, ym, S.months[ym])).sort();
  let msg = `Đã ghi nhận lương ${e.name}: ${vnd(oldSal)} → ${vnd(e.salary)} đ từ ${ymLabel(from)}. Các tháng trước giữ nguyên mức cũ.`;
  if (lockedAfter.length) msg += ` Lưu ý: ${lockedAfter.map(ymLabel).join(', ')} đã chốt nên không thay đổi — mở khóa nếu muốn áp dụng.`;
  toast(msg, lockedAfter.length ? 'warn' : 'ok');
  if (openBefore.length) setTimeout(() => toast(`Gợi ý: ${openBefore.map(ymLabel).join(', ')} chưa chốt — vào Bảng lương › “Chốt các tháng trước” để khóa cứng số liệu.`, 'info'), 400);
}
async function deleteEmp(id) {
  const e = empById(id); if (!e) return;
  const inLocked = Object.values(S.months).some((M) => M.status === 'locked' && M.snapshot && M.snapshot.rows.some((r) => r.empId === id));
  const ok = await confirmBox('Xóa nhân viên', `Xóa <b>${esc(e.name)}</b> (${esc(e.code)})? Dữ liệu chấm công, tăng ca, ứng lương… của nhân viên này ở các tháng <b>chưa chốt</b> cũng bị xóa.${inLocked ? '<br><br>Bảng lương các tháng đã chốt vẫn giữ nguyên. Nếu nhân viên nghỉ việc, nên chuyển trạng thái “Đã nghỉ” thay vì xóa.' : ''}`, { ok: 'Xóa', danger: true });
  if (!ok) return;
  S.employees = S.employees.filter((x) => x.id !== id);
  Object.entries(S.months).forEach(([ym, M]) => { if (M.status === 'locked') return; let ch = false; if (M.att && M.att[id]) { delete M.att[id]; ch = true; } if (M.allow && M.allow[id]) { delete M.allow[id]; ch = true; }
    ['late', 'ot', 'adv', 'bonus', 'ded'].forEach((k) => { const n = (M[k] || []).length; M[k] = (M[k] || []).filter((x) => x.empId !== id); if (M[k].length !== n) ch = true; }); if (ch) Store.touch('month:' + ym); });
  saveEmployees(); toast('Đã xóa nhân viên');
}
VIEWS['nhan-su'] = function () {
  const f = UI.emp; const q = f.q.trim().toLowerCase();
  const positions = [...new Set(S.employees.map((e) => e.position).filter(Boolean))].sort();
  let rows = S.employees.filter((e) => (f.status === 'all' || e.status === f.status) && (!f.pos || e.position === f.pos) &&
    (!q || [e.code, e.name, e.phone, e.cccd, e.position].join(' ').toLowerCase().includes(q)));
  rows = sortRows(rows, f.sort, f.dir);
  const pages = Math.max(1, Math.ceil(rows.length / f.size)); f.page = Math.min(f.page, pages);
  const view = rows.slice((f.page - 1) * f.size, f.page * f.size);
  return `<div class="toolbar"><input id="emp-q" class="search" placeholder="Tìm theo mã, tên, SĐT, CCCD…" value="${esc(f.q)}" data-model="emp.q">
    <select data-model="emp.status"><option value="active" ${f.status === 'active' ? 'selected' : ''}>Đang làm</option><option value="left" ${f.status === 'left' ? 'selected' : ''}>Đã nghỉ</option><option value="all" ${f.status === 'all' ? 'selected' : ''}>Tất cả</option></select>
    <select data-model="emp.pos"><option value="">Mọi chức danh</option>${positions.map((p) => `<option ${p === f.pos ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    <div class="spacer"></div>
    <button class="btn" data-act="emp-import">${ICON.upload} Nhập Excel</button><button class="btn" data-act="emp-export">${ICON.download} Xuất Excel</button>
    <button class="btn primary" data-act="emp-add">${ICON.plus} Thêm nhân viên</button></div>
  <div class="card flush"><div class="tbl-wrap"><table class="tbl" data-sorttbl="emp"><thead><tr>${th('Mã NV', 'code', f)}${th('Họ và tên', 'name', f)}${th('Chức danh', 'position', f)}<th>SĐT</th>${th('Ngày vào làm', 'startDate', f)}${th('Lương thỏa thuận', 'salary', f, 'r')}${th('Lương đóng BH', 'insSalary', f, 'r')}<th>BH</th>${th('Tình trạng', 'status', f)}<th class="r">Thao tác</th></tr></thead>
  <tbody>${view.map((e) => `<tr><td><b>${esc(e.code)}</b></td><td><a href="#ho-so-${e.id}" class="link">${esc(e.name)}</a></td><td>${esc(e.position)}</td><td>${esc(e.phone)}</td><td>${fmtDate(e.startDate)}</td>
    <td class="r">${vnd(e.salary)}</td><td class="r">${e.insSalary ? vnd(e.insSalary) : '—'}</td><td>${e.insJoin ? '<span class="pill ok">Có</span>' : '<span class="pill">Không</span>'}</td>
    <td>${e.status === 'active' ? '<span class="pill ok">Đang làm</span>' : '<span class="pill gray">Đã nghỉ</span>'}</td>
    <td class="r nowrap"><a class="icon-btn" href="#ho-so-${e.id}" title="Hồ sơ">${ICON.eye}</a><button class="icon-btn" data-act="emp-edit" data-id="${e.id}" title="Sửa">${ICON.edit}</button><button class="icon-btn danger" data-act="emp-del" data-id="${e.id}" title="Xóa">${ICON.trash}</button></td></tr>`).join('') || `<tr><td colspan="10" class="empty">Không có nhân viên phù hợp.</td></tr>`}</tbody></table></div>
  <div class="pager"><span class="muted">${rows.length} nhân viên</span><div class="spacer"></div>
    <select data-model="emp.size">${[10, 20, 50].map((n) => `<option value="${n}" ${n === f.size ? 'selected' : ''}>${n}/trang</option>`).join('')}</select>
    <button class="icon-btn" data-act="emp-page" data-p="${f.page - 1}" ${f.page <= 1 ? 'disabled' : ''}>${ICON.chevL}</button><span>Trang ${f.page}/${pages}</span><button class="icon-btn" data-act="emp-page" data-p="${f.page + 1}" ${f.page >= pages ? 'disabled' : ''}>${ICON.chevR}</button></div></div>`;
};

/* ---------- Hồ sơ nhân viên ---------- */
function vProfile(id) {
  const e = empById(id); if (!e) return `<div class="card empty">Không tìm thấy nhân viên. <a href="#nhan-su" class="link">Về danh sách</a></div>`;
  const months = Object.keys(S.months).sort().reverse();
  const rows = months.map((ym) => { const M = S.months[ym]; const P = E.payroll(S.settings, S.employees, ym, M); const r = P.rows.find((x) => x.empId === id); return r ? { ym, M, r } : null; }).filter(Boolean);
  const tabs = [['pay', 'Bảng lương các tháng'], ['att', 'Chấm công'], ['ot', 'Tăng ca & đi trễ'], ['adv', 'Ứng lương'], ['bonus', 'Phụ cấp & thưởng']];
  const t = UI.profileTab; let body = '';
  if (t === 'pay') body = `<table class="tbl compact"><thead><tr><th>Tháng</th><th class="r">Công</th><th class="r">Lương theo công</th><th class="r">Tăng ca</th><th class="r">Phụ cấp + thưởng</th><th class="r">Tổng thu nhập</th><th class="r">BH</th><th class="r">Ứng</th><th class="r">Thực lĩnh</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows.map(({ ym, M, r }) => `<tr><td>${ymLabel(ym)}</td><td class="r">${num(r.paidCong)}/${r.std}</td><td class="r">${vnd(r.base)}</td><td class="r">${vnd(r.otPay)}</td><td class="r">${vnd(r.cc + r.fuel + r.bonus)}</td><td class="r">${vnd(r.gross)}</td><td class="r">${vnd(r.ins.total)}</td><td class="r">${vnd(r.adv)}</td><td class="r b">${vnd(r.net)}</td><td><span class="badge st-${M.status || 'none'}">${STATUS_LABEL[M.status || 'none']}</span></td><td><button class="btn sm" data-act="slip-open" data-ym="${ym}" data-id="${id}">${ICON.slip} Phiếu</button></td></tr>`).join('') || '<tr><td colspan="11" class="empty">Chưa có dữ liệu lương.</td></tr>'}</tbody></table>`;
  if (t === 'att') body = `<table class="tbl compact"><thead><tr><th>Tháng</th><th class="r">Công chuẩn</th><th class="r">Công đi làm</th><th class="r">Phép</th><th class="r">Nghỉ KL</th><th class="r">Tổng công nghỉ</th><th class="r">Công hưởng lương</th><th class="r">Tỷ lệ</th><th class="r">Chưa chấm</th></tr></thead><tbody>${rows.map(({ ym, r }) => `<tr><td>${ymLabel(ym)}</td><td class="r">${r.std}</td><td class="r">${num(r.sum.worked)}</td><td class="r">${r.sum.P}</td><td class="r">${r.sum.K}</td><td class="r">${num(r.sum.absent)}</td><td class="r b">${num(r.paidCong)}</td><td class="r">${num(r.sum.ratio * 100, 1)}%</td><td class="r">${r.sum.blank}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Chưa có dữ liệu.</td></tr>'}</tbody></table>`;
  if (t === 'ot') {
    const ots = [], lates = []; months.forEach((ym) => { const M = S.months[ym]; (M.ot || []).filter((x) => x.empId === id).forEach((o) => ots.push({ ...o, ym })); (M.late || []).filter((x) => x.empId === id).forEach((l) => lates.push({ ...l, ym })); });
    body = `<h4>Tăng ca</h4><table class="tbl compact"><thead><tr><th>Ngày</th><th>Loại ngày</th><th class="r">Phút</th><th class="r">Hệ số</th><th>Ghi chú / công trình</th></tr></thead><tbody>${ots.map((o) => `<tr><td>${fmtDate(o.date)} (${DOW[E.dow(o.date)]})</td><td>${OT_LABEL[E.otKind(S.settings, o.date)]}</td><td class="r">${o.minutes}</td><td class="r">${E.otRate(S.settings, o.date)}%</td><td>${esc(o.note)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Không có.</td></tr>'}</tbody></table>
    <h4>Đi trễ</h4><table class="tbl compact"><thead><tr><th>Tháng</th><th>Ngày</th><th class="r">Phút</th><th>Ghi chú</th></tr></thead><tbody>${lates.map((l) => `<tr><td>${ymLabel(l.ym)}</td><td>${l.date ? fmtDate(l.date) : 'Tổng tháng'}</td><td class="r">${l.minutes}</td><td>${esc(l.note)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Không có.</td></tr>'}</tbody></table>`;
  }
  if (t === 'adv') { const list = []; months.forEach((ym) => (S.months[ym].adv || []).filter((x) => x.empId === id).forEach((a) => list.push({ ...a, ym })));
    body = `<table class="tbl compact"><thead><tr><th>Tháng</th><th>Ngày ứng</th><th>Tuần</th><th class="r">Số tiền</th><th>Ghi chú</th></tr></thead><tbody>${list.map((a) => `<tr><td>${ymLabel(a.ym)}</td><td>${fmtDate(a.date)}</td><td>Tuần ${a.week}</td><td class="r">${vnd(a.amount)}</td><td>${esc(a.note)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Chưa ứng lương.</td></tr>'}</tbody></table>`; }
  if (t === 'bonus') body = `<table class="tbl compact"><thead><tr><th>Tháng</th><th class="r">Chuyên cần</th><th class="r">Xăng xe</th><th>Thưởng / phúc lợi</th><th class="r">Tổng</th></tr></thead><tbody>${rows.map(({ ym, r }) => `<tr><td>${ymLabel(ym)}</td><td class="r">${vnd(r.cc)}</td><td class="r">${vnd(r.fuel)}</td><td>${r.bonusItems.map((b) => esc(b.name) + ': ' + vnd(b.amount)).join('<br>') || '—'}</td><td class="r b">${vnd(r.cc + r.fuel + r.bonus)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Không có.</td></tr>'}</tbody></table>`;
  const info = [['Mã NV', e.code], ['Ngày sinh', fmtDate(e.dob)], ['Giới tính', e.gender], ['SĐT', e.phone], ['CCCD', e.cccd + (e.cccdDate ? ' · cấp ' + fmtDate(e.cccdDate) : '') + (e.cccdPlace ? ' · ' + e.cccdPlace : '')], ['Địa chỉ', e.address], ['Ngày vào làm', fmtDate(e.startDate)], ['Lương thỏa thuận', vnd(e.salary) + ' đ'], ['Lương đóng BHXH', e.insJoin ? vnd(e.insSalary) + ' đ' : 'Không tham gia'], ['Tỷ lệ BH NLĐ', e.insJoin ? (e.insCustom ? `${e.insRates.bhxh}% + ${e.insRates.bhyt}% + ${e.insRates.bhtn}% (riêng)` : `Theo cài đặt chung`) : '—'], ['Xăng xe mặc định', vnd(e.fuelDefault) + ' đ']];
  const hist = (e.salaryHistory || []).slice().sort((a, b) => b.from.localeCompare(a.from));
  const histHtml = hist.length > 1 ? `<div class="card flush pad"><h3>Lịch sử mức lương</h3><table class="tbl compact"><thead><tr><th>Áp dụng từ</th><th class="r">Lương thỏa thuận</th><th class="r">Lương đóng BHXH</th><th class="r">Thay đổi</th></tr></thead><tbody>${hist.map((h, i) => { const prev = hist[i + 1]; const d = prev ? h.salary - prev.salary : 0; return `<tr><td>${h.from === '0000-00' ? 'Ban đầu' : ymLabel(h.from)}${i === 0 ? ' <span class="pill ok">Hiện hành</span>' : ''}</td><td class="r">${vnd(h.salary)}</td><td class="r">${vnd(h.insSalary)}</td><td class="r ${d > 0 ? 'net' : d < 0 ? 'neg' : ''}">${prev ? (d > 0 ? '+' : '') + vnd(d) : '—'}</td></tr>`; }).join('')}</tbody></table></div>` : '';
  return `<div class="row gap mb"><a href="#nhan-su" class="btn">${ICON.chevL} Danh sách</a><div class="spacer"></div><button class="btn" data-act="emp-edit" data-id="${e.id}">${ICON.edit} Sửa hồ sơ</button></div>
  <div class="card profile-head"><div class="avatar">${esc(e.name.split(' ').slice(-1)[0][0] || '?')}</div><div><h2>${esc(e.name)}</h2><div class="muted">${esc(e.position)} · ${e.status === 'active' ? '<span class="pill ok">Đang làm</span>' : '<span class="pill gray">Đã nghỉ' + (e.leftDate ? ' từ ' + fmtDate(e.leftDate) : '') + '</span>'}</div></div>
  <dl class="info-grid">${info.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v) || '—'}</dd></div>`).join('')}</dl></div>
  ${histHtml}
  <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${t === k ? 'on' : ''}" data-act="profile-tab" data-t="${k}">${l}</button>`).join('')}</div><div class="card flush pad">${body}</div>`;
}

/* ---- views-b.js ---- */
/* ===== VIEWS B: Chấm công, Đi trễ, Tăng ca, Ứng lương ===== */
function cellView(S0, c) {
  if (c == null || c === '') return { cls: 'c-blank', txt: '' };
  if (c === 'P') return { cls: 'c-P', txt: 'P' };
  if (c === 'K') return { cls: 'c-K', txt: 'KL' };
  if (typeof c === 'object') return { cls: 'c-time', txt: num(E.cellCong(S0, c), 2), tip: `Giờ vào ${c.i} – ra ${c.o} · ${num(E.timeHours(S0, c.i, c.o), 2)} giờ` };
  if (c === 1) return { cls: 'c-full', txt: 'X' };
  if (c === 0.5) return { cls: 'c-half', txt: '0,5' };
  if (c === 0) return { cls: 'c-zero', txt: '0' };
  return { cls: 'c-custom', txt: num(c, 2) };
}
const LEGEND = [['c-full', 'X', 'Cả ngày (1)'], ['c-half', '0,5', 'Nửa ngày'], ['c-zero', '0', 'Nghỉ (0)'], ['c-P', 'P', 'Nghỉ phép'], ['c-K', 'KL', 'Nghỉ không lương'], ['c-custom', '0,75', 'Công tùy chỉnh'], ['c-time', '0,94', 'Theo giờ vào/ra'], ['c-off', 'CN', 'Chủ nhật'], ['c-hol', 'L', 'Nghỉ lễ']];

VIEWS['cham-cong'] = function () {
  const ym = UI.ym, M = getM(ym), Sx = S.settings, cal = E.calendar(Sx, ym), locked = isLocked(ym);
  const q = UI.att.q.trim().toLowerCase();
  const emps = empsForMonth(ym).filter((e) => !q || (e.code + ' ' + e.name).toLowerCase().includes(q));
  const lateDays = {}; (M.late || []).forEach((l) => { if (l.date) (lateDays[l.empId] = lateDays[l.empId] || new Set()).add(E.dayOf(l.date)); });
  const sel = UI.att.sel; const day = UI.att.day;
  const head = cal.days.map((d) => `<th class="dcol k-${d.kind} ${day === d.d ? 'sel' : ''}" ${d.kind === 'work' ? `data-act="att-day" data-d="${d.d}"` : ''} title="${DOW_FULL[d.dow]} ${fmtDate(d.ds)}${d.holidayName ? ' · ' + esc(d.holidayName) : ''}"><div>${d.d}</div><small>${DOW[d.dow]}</small></th>`).join('');
  let totW = 0;
  const body = emps.map((e, i) => {
    const row = (M.att || {})[e.id] || {}; const s = E.summarize(Sx, ym, row, cal); totW += s.paidCong;
    const warn = s.timeDays.filter((d) => lateDays[e.id] && lateDays[e.id].has(d));
    const cells = cal.days.map((d) => {
      if (d.kind === 'off') return `<td class="cell c-off">${d.holidayName ? 'L' : ''}</td>`;
      if (d.kind === 'holiday') return `<td class="cell c-hol" title="${esc(d.holidayName)}">L</td>`;
      const v = cellView(Sx, row[d.d]);
      return `<td class="cell ${v.cls} ${day === d.d ? 'colsel' : ''}" tabindex="0" data-e="${e.id}" data-d="${d.d}" ${v.tip ? `title="${esc(v.tip)}"` : ''}>${v.txt}</td>`;
    }).join('');
    return `<tr class="${sel.has(e.id) ? 'rsel' : ''}"><td class="stk s0"><input type="checkbox" data-act="att-sel" data-id="${e.id}" ${sel.has(e.id) ? 'checked' : ''} aria-label="Chọn"></td><td class="stk s1">${i + 1}</td><td class="stk s2"><b>${esc(e.code)}</b></td><td class="stk s3 name">${esc(e.name)}${warn.length ? ` <span class="warn-ic" title="Ngày ${warn.join(', ')}: có chấm giờ vào/ra VÀ có ghi nhận đi trễ — giờ chấm đã phản ánh việc vào trễ, kiểm tra để tránh trừ hai lần">${ICON.alert}</span>` : ''}</td>${cells}
      <td class="sum b">${num(s.worked)}</td><td class="sum">${s.P || ''}</td><td class="sum">${s.K || ''}</td><td class="sum">${num(s.absent) === '0' ? '' : num(s.absent)}</td><td class="sum b hl">${num(s.paidCong)}</td><td class="sum">${num(s.ratio * 100, 1)}%</td><td class="sum ${s.blank ? 'warnc' : ''}">${s.blank || ''}</td></tr>`;
  }).join('');
  const hol = cal.days.filter((d) => d.kind === 'holiday');
  return `<div class="att-top card"><div class="stat"><span>Công chuẩn ${ymLabel(ym)}</span><b>${cal.std}</b><small>${cal.workDays} ngày làm việc T2–T7${hol.length ? ' · ' + hol.length + ' ngày lễ ' + (Sx.holidayMode === 'paid' ? '(tính hưởng lương)' : '(trừ khỏi công chuẩn)') : ''}</small></div>
    <div class="legend">${LEGEND.map(([c, t, l]) => `<span><i class="lg ${c}">${t}</i>${l}</span>`).join('')}</div></div>
  ${locked ? `<div class="alert info">${ICON.lock} Tháng đã chốt lương — bảng công chỉ xem. Mở khóa ở mục <a href="#bang-luong" class="link">Bảng lương</a> để chỉnh sửa.</div>` : ''}
  <div class="toolbar"><input id="att-q" class="search" placeholder="Tìm nhân viên…" value="${esc(UI.att.q)}" data-model="att.q">
    <span class="muted small">${sel.size ? 'Đã chọn ' + sel.size + ' NV' : 'Áp dụng cho tất cả NV (tick để chọn)'}${day ? ' · Ngày ' + day : ''}</span><div class="spacer"></div>
    ${locked ? '' : `<button class="btn" data-act="att-copy-prev" ${day ? '' : 'disabled title="Bấm tiêu đề một ngày để chọn"'}>${ICON.copy} Sao chép ngày trước${day ? ' → ' + day : ''}</button>
    <button class="btn" data-act="att-fill-blank">${ICON.check} Điền X ngày trống</button>
    <button class="btn" data-act="att-bulk">${ICON.fill} Điền hàng loạt</button>`}
    <button class="btn" data-act="att-import">${ICON.upload} Nhập Excel</button><button class="btn" data-act="att-export">${ICON.download} Xuất Excel</button></div>
  <div class="card flush"><div class="grid-scroll"><table class="att ${locked ? 'locked' : ''}"><thead><tr><th class="stk s0"><input type="checkbox" data-act="att-sel-all" ${emps.length && emps.every((e) => sel.has(e.id)) ? 'checked' : ''} aria-label="Chọn tất cả"></th><th class="stk s1">#</th><th class="stk s2">Mã</th><th class="stk s3">Họ tên</th>${head}
    <th class="sum" title="Tổng công đi làm thực tế">Công<br>đi làm</th><th class="sum" title="Ngày nghỉ phép">Phép</th><th class="sum" title="Nghỉ không lương">KL</th><th class="sum" title="Tổng công nghỉ (P + KL + 0 + phần thiếu)">Nghỉ</th><th class="sum hl" title="Công tính lương = đi làm${Sx.paidLeave ? ' + phép' : ''}${Sx.holidayMode === 'paid' ? ' + lễ' : ''}">Công<br>tính lương</th><th class="sum">Tỷ lệ<br>công</th><th class="sum" title="Số ngày làm việc chưa chấm">Chưa<br>chấm</th></tr></thead>
    <tbody>${body || `<tr><td colspan="${cal.n + 11}" class="empty">Không có nhân viên.</td></tr>`}</tbody></table></div>
  <div class="grid-help">${locked ? '' : '<b>Bấm vào ô</b> để chọn nhanh công. <b>Phím tắt:</b> chọn ô rồi gõ <kbd>X</kbd>/<kbd>1</kbd> cả ngày · <kbd>H</kbd>/<kbd>5</kbd> nửa ngày · <kbd>0</kbd> nghỉ · <kbd>P</kbd> phép · <kbd>K</kbd> không lương · <kbd>Del</kbd> xóa · <kbd>Enter</kbd> mở bảng chọn (tùy chỉnh / giờ vào–ra) · phím mũi tên để di chuyển. Bấm tiêu đề ngày để chọn cột. '}Tổng công tính lương: <b>${num(totW)}</b></div></div>`;
};
function setCell(e, d, val, move) {
  const ym = UI.ym;
  const ok = mutMonth(ym, (M) => { M.att[e] = M.att[e] || {}; if (val == null) delete M.att[e][d]; else M.att[e][d] = val; }, { silent: true });
  if (!ok) return;
  let nd = d;
  if (move) { const cal = E.calendar(S.settings, ym); const wd = cal.days.filter((x) => x.kind === 'work').map((x) => x.d); const i = wd.indexOf(d); if (i >= 0 && i < wd.length - 1) nd = wd[i + 1]; }
  UI.focus = { e, d: nd, restore: true }; render();
}
function moveFocus(td, dx, dy) {
  const tr = td.parentElement; const cells = $$('td.cell[tabindex]', tr); let i = cells.indexOf(td);
  if (dx) { const n = cells[i + dx]; if (n) n.focus(); return; }
  let r = tr; for (;;) { r = dy > 0 ? r.nextElementSibling : r.previousElementSibling; if (!r) return; const t = r.querySelector(`td.cell[data-d="${td.dataset.d}"][tabindex]`); if (t) { t.focus(); return; } }
}
function showCellPop(td) {
  if (isLocked(UI.ym)) return;
  const e = td.dataset.e, d = Number(td.dataset.d); const c = ((getM(UI.ym).att || {})[e] || {})[d];
  const isT = c && typeof c === 'object'; const isNum = typeof c === 'number' && ![0, 0.5, 1].includes(c);
  const pop = $('#pop'); const Sx = S.settings;
  pop.innerHTML = `<div class="pop-head">${esc(empName(e))} · ${DOW_FULL[E.dow(E.dstr(UI.ym, d))]} ${d}/${E.ymParts(UI.ym).m}</div>
    <div class="pop-btns"><button data-v="1" class="c-full">X<small>Cả ngày</small></button><button data-v="0.5" class="c-half">0,5<small>Nửa ngày</small></button><button data-v="0" class="c-zero">0<small>Nghỉ</small></button><button data-v="P" class="c-P">P<small>Nghỉ phép</small></button><button data-v="K" class="c-K">KL<small>Không lương</small></button><button data-v="" class="c-blank">—<small>Xóa</small></button></div>
    <div class="pop-sec"><label>Số công tùy chỉnh</label><div class="row gap"><input type="number" id="pop-num" step="0.05" min="0" max="1" value="${isNum ? c : ''}" placeholder="vd 0,75"><button class="btn sm" data-p="num">Áp dụng</button></div></div>
    <div class="pop-sec"><label>Giờ vào – giờ ra <small class="muted">(nghỉ trưa ${Sx.lunchStart}–${Sx.lunchEnd}, chuẩn ${Sx.stdHours} giờ/công)</small></label><div class="row gap"><input type="time" id="pop-in" value="${isT ? c.i : Sx.workStart}"><input type="time" id="pop-out" value="${isT ? c.o : Sx.workEnd}"><button class="btn sm" data-p="time">Áp dụng</button></div><small class="muted" id="pop-calc"></small></div>`;
  const r = td.getBoundingClientRect(); pop.classList.add('show');
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  pop.style.left = Math.min(window.innerWidth - pw - 8, Math.max(8, r.left)) + 'px';
  pop.style.top = (r.bottom + ph + 8 > window.innerHeight ? Math.max(8, r.top - ph - 4) : r.bottom + 4) + 'px';
  const upd = () => { const h = E.timeHours(Sx, $('#pop-in').value, $('#pop-out').value); $('#pop-calc').textContent = `${num(h, 2)} giờ → ${num(Math.min(1, h / Sx.stdHours), 4)} công`; }; upd();
  $('#pop-in').addEventListener('input', upd); $('#pop-out').addEventListener('input', upd);
  pop.onclick = (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.v !== undefined) { const v = b.dataset.v; hidePop(); setCell(e, d, v === '' ? null : (v === 'P' || v === 'K') ? v : Number(v), false); return; }
    if (b.dataset.p === 'num') { const v = Number($('#pop-num').value); if ($('#pop-num').value === '' || isNaN(v) || v < 0 || v > 1) { toast('Số công phải từ 0 đến 1', 'warn'); return; } hidePop(); setCell(e, d, Math.round(v * 10000) / 10000, false); }
    if (b.dataset.p === 'time') { const i = $('#pop-in').value, o = $('#pop-out').value; if (!(E.toMin(o) > E.toMin(i))) { toast('Giờ ra phải sau giờ vào', 'warn'); return; } hidePop(); setCell(e, d, { i, o }, false); }
  };
  pop.onkeydown = (ev) => { if (ev.key === 'Escape') { hidePop(); td.focus(); } if (ev.key === 'Enter' && ev.target.id === 'pop-num') $('[data-p=num]', pop).click(); };
}
function hidePop() { const p = $('#pop'); if (p && p.classList.contains('show')) { p.classList.remove('show'); p.innerHTML = ''; if (pendingRender) { pendingRender = false; render(); } } }
function targetEmps(ym) { const ids = empsForMonth(ym).map((e) => e.id); return UI.att.sel.size ? ids.filter((i) => UI.att.sel.has(i)) : ids; }
function attBulkModal() {
  const ym = UI.ym; const n = E.daysIn(ym); const ids = targetEmps(ym);
  formModal({ title: 'Điền công hàng loạt', okLabel: 'Điền', fields: [
    { name: 'from', label: 'Từ ngày', type: 'number', min: 1, default: 1 }, { name: 'to', label: 'Đến ngày', type: 'number', min: 1, default: n },
    { name: 'val', label: 'Giá trị', type: 'select', options: [['1', 'X – Cả ngày (1 công)'], ['0.5', '0,5 – Nửa ngày'], ['0', '0 – Nghỉ'], ['P', 'P – Nghỉ phép'], ['K', 'KL – Nghỉ không lương'], ['clear', 'Xóa (để trống)']] },
    { name: 'onlyBlank', label: 'Chỉ điền vào ô còn trống', type: 'checkbox', default: true },
  ], extra: `<p class="muted small">Áp dụng cho <b>${ids.length}</b> nhân viên${UI.att.sel.size ? ' đã chọn' : ' (tất cả)'}, chỉ các ngày làm việc (bỏ qua Chủ nhật, ngày lễ).</p>`,
  onSubmit: (x) => {
    const a = Math.max(1, Number(x.from) || 1), b = Math.min(n, Number(x.to) || n); if (a > b) return 'Khoảng ngày không hợp lệ';
    const v = x.val === 'clear' ? null : (x.val === 'P' || x.val === 'K') ? x.val : Number(x.val);
    const days = E.calendar(S.settings, ym).days.filter((d) => d.kind === 'work' && d.d >= a && d.d <= b).map((d) => d.d); let cnt = 0;
    mutMonth(ym, (M) => { ids.forEach((id) => { M.att[id] = M.att[id] || {}; days.forEach((d) => { const cur = M.att[id][d]; if (x.onlyBlank && cur != null && cur !== '' && v !== null) return; if (v === null) delete M.att[id][d]; else M.att[id][d] = v; cnt++; }); }); });
    toast('Đã cập nhật ' + cnt + ' ô công');
  } });
}

/* ---------- Đi trễ ---------- */
VIEWS['di-tre'] = function () {
  const ym = UI.ym, M = getM(ym), P = E.payroll(S.settings, S.employees, ym, M), locked = isLocked(ym);
  const list = (M.late || []).slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const sums = P.rows.filter((r) => r.lateMin > 0);
  return `<div class="card"><div class="card-head"><h3>Ghi nhận đi trễ · ${ymLabel(ym)}</h3><span class="muted small">Lương giờ = Lương tháng ÷ Công chuẩn ÷ ${S.settings.stdHours} · Tiền trừ = Lương giờ × Phút trễ ÷ 60</span></div>
    ${locked ? lockNote() : `<form class="inline-form" data-form="late"><label>Nhân viên<select name="empId">${empOptions(ym, '')}</select></label>
      <label>Ngày <small>(để trống = nhập tổng tháng)</small><input type="date" name="date" min="${ym}-01" max="${E.dstr(ym, E.daysIn(ym))}"></label>
      <label>Số phút trễ<input type="number" name="minutes" min="1" step="1" placeholder="vd 15"></label><label class="grow">Ghi chú<input name="note" placeholder="Lý do…"></label>
      <button class="btn primary">${ICON.plus} Thêm</button></form>`}</div>
  <div class="grid2 wide-left"><div class="card flush"><div class="card-head pad"><h3>Chi tiết từng lần</h3></div><table class="tbl compact"><thead><tr><th>Ngày</th><th>Nhân viên</th><th class="r">Phút</th><th>Ghi chú</th><th></th></tr></thead><tbody>
    ${list.map((l) => `<tr><td>${l.date ? fmtDate(l.date) + ' (' + DOW[E.dow(l.date)] + ')' : '<span class="pill">Tổng tháng</span>'}</td><td>${esc(empName(l.empId))}</td><td class="r">${l.minutes}</td><td>${esc(l.note)}</td><td class="r nowrap">${locked ? '' : `<button class="icon-btn" data-act="late-edit" data-id="${l.id}">${ICON.edit}</button><button class="icon-btn danger" data-act="row-del" data-k="late" data-id="${l.id}">${ICON.trash}</button>`}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Chưa có ghi nhận đi trễ.</td></tr>'}</tbody></table></div>
  <div class="card flush"><div class="card-head pad"><h3>Tổng hợp theo nhân viên</h3></div><table class="tbl compact"><thead><tr><th>Nhân viên</th><th class="r">Tổng phút</th><th class="r">Lương giờ</th><th class="r">Tiền trừ</th></tr></thead><tbody>
    ${sums.map((r) => `<tr><td><b>${esc(r.code)}</b> ${esc(r.name)}</td><td class="r">${r.lateMin}</td><td class="r">${vnd(r.hourly)}</td><td class="r neg b">${vnd(r.lateDed)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Không có.</td></tr>'}</tbody></table></div></div>`;
};
function lockNote() { return `<div class="alert info">${ICON.lock} ${ymLabel(UI.ym)} đã chốt lương — chỉ xem. Mở khóa ở mục <a href="#bang-luong" class="link">Bảng lương</a> để chỉnh sửa.</div>`; }

/* ---------- Tăng ca ---------- */
VIEWS['tang-ca'] = function () {
  const ym = UI.ym, M = getM(ym), Sx = S.settings, locked = isLocked(ym);
  const P = E.payroll(Sx, S.employees, ym, M); const rowsBy = Object.fromEntries(P.rows.map((r) => [r.empId, r]));
  const list = (M.ot || []).filter((o) => !UI.otEmp || o.empId === UI.otEmp).slice().sort((a, b) => a.date.localeCompare(b.date));
  const R = Sx.otRates;
  return `<div class="card"><div class="card-head"><h3>Ghi nhận tăng ca · ${ymLabel(ym)}</h3><span class="muted small">Hệ số tự động: T2–T7 <b>${R.weekday}%</b> · Chủ nhật <b>${R.weeklyOff}%</b> · Ngày lễ <b>${R.holiday}%</b> · Tiền = Lương giờ × Phút ÷ 60 × Hệ số</span></div>
    ${locked ? lockNote() : `<form class="inline-form" data-form="ot"><label>Nhân viên<select name="empId" data-act="ot-preview">${empOptions(ym, '')}</select></label>
      <label>Ngày tăng ca<input type="date" name="date" min="${ym}-01" max="${E.dstr(ym, E.daysIn(ym))}" data-act="ot-preview"></label>
      <label>Số phút<input type="number" name="minutes" min="1" step="1" placeholder="vd 120" data-act="ot-preview"></label><label class="grow">Ghi chú / công trình<input name="note" placeholder="Tên công trình…"></label>
      <button class="btn primary">${ICON.plus} Thêm</button><div class="ot-preview muted small" id="ot-preview"></div></form>`}</div>
  <div class="card flush"><div class="card-head pad"><h3>Tổng hợp theo nhân viên</h3></div><table class="tbl compact"><thead><tr><th>Nhân viên</th><th class="r">Lương giờ</th><th class="r">Phút T2–T7</th><th class="r">Phút CN</th><th class="r">Phút lễ</th><th class="r">Tổng giờ</th><th class="r">Tiền tăng ca</th><th></th></tr></thead><tbody>
    ${P.rows.filter((r) => r.otPay > 0 || (r.otMin.weekday + r.otMin.weeklyOff + r.otMin.holiday) > 0).map((r) => `<tr><td><b>${esc(r.code)}</b> ${esc(r.name)}</td><td class="r">${vnd(r.hourly)}</td><td class="r">${r.otMin.weekday}</td><td class="r">${r.otMin.weeklyOff}</td><td class="r">${r.otMin.holiday}</td><td class="r">${num((r.otMin.weekday + r.otMin.weeklyOff + r.otMin.holiday) / 60)}</td><td class="r b">${vnd(r.otPay)}</td><td class="r"><button class="btn sm" data-act="ot-history" data-id="${r.empId}">${ICON.history} Lịch sử</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Chưa có tăng ca trong tháng.</td></tr>'}</tbody></table></div>
  <div class="card flush"><div class="card-head pad"><h3>Chi tiết</h3><select data-model="otEmp"><option value="">Tất cả nhân viên</option>${empOptions(ym, UI.otEmp)}</select></div><table class="tbl compact"><thead><tr><th>Ngày</th><th>Thứ</th><th>Nhân viên</th><th class="r">Phút</th><th>Loại ngày</th><th class="r">Hệ số</th><th class="r">Thành tiền</th><th>Ghi chú / công trình</th><th></th></tr></thead><tbody>
    ${list.map((o) => { const r = rowsBy[o.empId]; const hr = r ? r.hourly : 0; const k = E.otKind(Sx, o.date); return `<tr><td>${fmtDate(o.date)}</td><td>${DOW[E.dow(o.date)]}</td><td>${esc(empName(o.empId))}</td><td class="r">${o.minutes}</td><td><span class="pill ot-${k}">${OT_LABEL[k]}</span></td><td class="r">${E.otRate(Sx, o.date)}%</td><td class="r">${P.live ? vnd(hr * o.minutes / 60 * E.otRate(Sx, o.date) / 100) : '—'}</td><td>${esc(o.note)}</td><td class="r nowrap">${locked ? '' : `<button class="icon-btn" data-act="ot-edit" data-id="${o.id}">${ICON.edit}</button><button class="icon-btn danger" data-act="row-del" data-k="ot" data-id="${o.id}">${ICON.trash}</button>`}</td></tr>`; }).join('') || '<tr><td colspan="9" class="empty">Không có.</td></tr>'}</tbody></table></div>`;
};
function otHistory(id) {
  const e = empById(id); const rows = [];
  Object.keys(S.months).sort().reverse().forEach((ym) => { const M = S.months[ym]; const P = E.payroll(S.settings, S.employees, ym, M); const r = P.rows.find((x) => x.empId === id);
    (M.ot || []).filter((o) => o.empId === id).sort((a, b) => a.date.localeCompare(b.date)).forEach((o) => rows.push({ ym, o, amt: r ? r.hourly * o.minutes / 60 * E.otRate(S.settings, o.date) / 100 : 0 })); });
  openModal({ title: 'Lịch sử tăng ca · ' + (e ? e.name : ''), wide: true, body: `<table class="tbl compact"><thead><tr><th>Tháng</th><th>Ngày</th><th>Loại</th><th class="r">Phút</th><th class="r">Hệ số</th><th class="r">Thành tiền</th><th>Ghi chú</th></tr></thead><tbody>${rows.map(({ ym, o, amt }) => `<tr><td>${ymLabel(ym)}</td><td>${fmtDate(o.date)} (${DOW[E.dow(o.date)]})</td><td>${OT_LABEL[E.otKind(S.settings, o.date)]}</td><td class="r">${o.minutes}</td><td class="r">${E.otRate(S.settings, o.date)}%</td><td class="r">${vnd(amt)}</td><td>${esc(o.note)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Không có.</td></tr>'}</tbody></table>` });
}

/* ---------- Ứng lương ---------- */
VIEWS['ung-luong'] = function () {
  const ym = UI.ym, M = getM(ym), locked = isLocked(ym);
  const list = (M.adv || []).filter((a) => !UI.advEmp || a.empId === UI.advEmp).slice().sort((a, b) => a.date.localeCompare(b.date));
  const by = {}; (M.adv || []).forEach((a) => { const x = by[a.empId] = by[a.empId] || { n: 0, t: 0, w: [0, 0, 0, 0, 0] }; x.n++; x.t += Number(a.amount) || 0; x.w[Math.min(5, a.week || E.weekOfMonth(a.date)) - 1] += Number(a.amount) || 0; });
  const total = Object.values(by).reduce((s, x) => s + x.t, 0);
  const d0 = todayStr().startsWith(ym) ? todayStr() : ym + '-01';
  return `<div class="card"><div class="card-head"><h3>Phiếu tạm ứng · ${ymLabel(ym)}</h3><span class="muted small">Toàn bộ tiền đã ứng trong tháng tự động khấu trừ khi tính thực lĩnh (mỗi phiếu chỉ thuộc một tháng — không trừ trùng)</span></div>
    ${locked ? lockNote() : `<form class="inline-form" data-form="adv"><label>Nhân viên<select name="empId">${empOptions(ym, '')}</select></label>
      <label>Ngày ứng<input type="date" name="date" value="${d0}" min="${ym}-01" max="${E.dstr(ym, E.daysIn(ym))}" data-act="adv-week"></label>
      <label>Tuần<select name="week" id="adv-week">${[1, 2, 3, 4, 5].map((w) => `<option value="${w}" ${w === E.weekOfMonth(d0) ? 'selected' : ''}>Tuần ${w} (${(w - 1) * 7 + 1}–${Math.min(w * 7, E.daysIn(ym))})</option>`).join('')}</select></label>
      <label>Số tiền<input class="money" name="amount" inputmode="numeric" placeholder="vd 1.000.000"></label><label class="grow">Ghi chú<input name="note"></label>
      <button class="btn primary">${ICON.plus} Thêm</button></form>`}</div>
  <div class="card flush"><div class="card-head pad"><h3>Tổng hợp theo nhân viên</h3><span class="muted">Tổng ứng tháng: <b>${vnd(total)} đ</b></span></div><table class="tbl compact"><thead><tr><th>Nhân viên</th><th class="r">Số lần</th>${[1, 2, 3, 4, 5].map((w) => `<th class="r">Tuần ${w}</th>`).join('')}<th class="r">Tổng đã ứng</th><th></th></tr></thead><tbody>
    ${Object.entries(by).map(([id, x]) => `<tr><td>${esc(empById(id) ? empById(id).code + ' ' + empById(id).name : '(đã xóa)')}</td><td class="r">${x.n}</td>${x.w.map((v) => `<td class="r">${v ? vnd(v) : ''}</td>`).join('')}<td class="r b">${vnd(x.t)}</td><td class="r"><button class="btn sm" data-act="adv-history" data-id="${id}">${ICON.history} Lịch sử</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Chưa có phiếu ứng.</td></tr>'}</tbody></table></div>
  <div class="card flush"><div class="card-head pad"><h3>Danh sách phiếu ứng</h3><select data-model="advEmp"><option value="">Tất cả nhân viên</option>${empOptions(ym, UI.advEmp)}</select></div><table class="tbl compact"><thead><tr><th>Ngày ứng</th><th>Tuần</th><th>Nhân viên</th><th class="r">Số tiền</th><th>Ghi chú</th><th></th></tr></thead><tbody>
    ${list.map((a) => `<tr><td>${fmtDate(a.date)}</td><td>Tuần ${a.week}</td><td>${esc(empName(a.empId))}</td><td class="r">${vnd(a.amount)}</td><td>${esc(a.note)}</td><td class="r nowrap">${locked ? '' : `<button class="icon-btn" data-act="adv-edit" data-id="${a.id}">${ICON.edit}</button><button class="icon-btn danger" data-act="row-del" data-k="adv" data-id="${a.id}">${ICON.trash}</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Không có.</td></tr>'}</tbody></table></div>`;
};
function advHistory(id) {
  const e = empById(id); const rows = []; Object.keys(S.months).sort().reverse().forEach((ym) => (S.months[ym].adv || []).filter((a) => a.empId === id).forEach((a) => rows.push({ ym, a })));
  const byM = {}; rows.forEach(({ ym, a }) => (byM[ym] = (byM[ym] || 0) + Number(a.amount)));
  openModal({ title: 'Lịch sử ứng lương · ' + (e ? e.name : ''), wide: true, body: `<div class="chips">${Object.entries(byM).map(([ym, v]) => `<span class="chip">${ymLabel(ym)}: <b>${vnd(v)}</b></span>`).join('')}</div><table class="tbl compact"><thead><tr><th>Tháng</th><th>Ngày</th><th>Tuần</th><th class="r">Số tiền</th><th>Ghi chú</th></tr></thead><tbody>${rows.map(({ ym, a }) => `<tr><td>${ymLabel(ym)}</td><td>${fmtDate(a.date)}</td><td>${a.week}</td><td class="r">${vnd(a.amount)}</td><td>${esc(a.note)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Không có.</td></tr>'}</tbody></table>` });
}

/* ---- views-c.js ---- */
/* ===== VIEWS C: Phụ cấp & Thưởng, Bảng lương, Phiếu lương, Cài đặt ===== */
VIEWS['phu-cap'] = function () {
  const ym = UI.ym, M = getM(ym), Sx = S.settings, locked = isLocked(ym), P = E.livePayroll(Sx, S.employees, ym, M);
  const tab = UI.allowTab; const dis = locked ? 'disabled' : '';
  const tabs = [['cc', 'Chuyên cần & Xăng xe'], ['bonus', 'Thưởng & phúc lợi khác'], ['ded', 'Khấu trừ khác']];
  let body = '';
  if (tab === 'cc') {
    body = `<div class="card flush"><div class="card-head pad"><h3>Phụ cấp chuyên cần & xăng xe · ${ymLabel(ym)}</h3><span class="muted small">Chuyên cần ${vnd(Sx.ccAmount)} đ khi công đi làm${Sx.leaveKeepsCC ? ' (kể cả phép)' : ''} = công chuẩn (${P.std})${Sx.lateBreaksCC ? ', không đi trễ' : ''}. Xăng xe để trống = theo mức mặc định trong hồ sơ.</span></div>
    <table class="tbl compact"><thead><tr><th>Nhân viên</th><th class="r">Công đi làm / chuẩn</th><th>Tự động</th><th>Điều chỉnh (phê duyệt)</th><th>Ghi chú phê duyệt</th><th class="r">Chuyên cần</th><th class="r">Xăng xe mặc định</th><th>Xăng xe tháng này</th></tr></thead><tbody>
    ${P.rows.map((r) => { const al = (M.allow || {})[r.empId] || {}; const e = empById(r.empId) || {}; return `<tr><td><b>${esc(r.code)}</b> ${esc(r.name)}</td><td class="r">${num(r.sum.worked + r.sum.holidaysPaid + (Sx.leaveKeepsCC ? r.sum.P : 0))} / ${r.std}</td>
      <td>${r.ccAuto ? '<span class="pill ok">Đủ điều kiện</span>' : '<span class="pill warn">Không đủ</span>'}</td>
      <td><select data-allow="cc" data-id="${r.empId}" ${dis}><option value="auto" ${r.ccMode === 'auto' ? 'selected' : ''}>Tự động</option><option value="grant" ${r.ccMode === 'grant' ? 'selected' : ''}>Duyệt cho hưởng</option><option value="deny" ${r.ccMode === 'deny' ? 'selected' : ''}>Không cho hưởng</option></select></td>
      <td><input data-allow="ccNote" data-id="${r.empId}" value="${esc(al.ccNote || '')}" placeholder="${r.ccMode !== 'auto' ? 'Bắt buộc ghi lý do' : ''}" ${dis}></td>
      <td class="r b">${vnd(r.cc)}</td><td class="r muted">${vnd(e.fuelDefault)}</td>
      <td><input class="money sm-in" data-allow="fuel" data-id="${r.empId}" value="${al.fuel !== undefined && al.fuel !== null && al.fuel !== '' ? vnd(al.fuel) : ''}" placeholder="${vnd(e.fuelDefault)} (mặc định)" ${dis}></td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">Không có nhân viên.</td></tr>'}</tbody></table></div>`;
  }
  if (tab === 'bonus') {
    const list = (M.bonus || []);
    const by = {}; list.forEach((b) => (by[b.empId] = (by[b.empId] || 0) + Number(b.amount)));
    body = `<div class="card">${locked ? lockNote() : `<form class="inline-form" data-form="bonus"><label>Nhân viên<select name="empId"><option value="__all">— Tất cả NV trong tháng —</option>${empOptions(ym, '')}</select></label>
      <label>Loại khoản<select name="type">${Sx.bonusTypes.map((t) => `<option>${esc(t)}</option>`).join('')}<option value="__other">Khác…</option></select></label>
      <label>Tên khoản (tùy chọn)<input name="name" placeholder="Mặc định theo loại"></label><label>Số tiền<input class="money" name="amount" inputmode="numeric"></label>
      <label class="check-l"><input type="checkbox" name="bhxh"> Tính đóng BHXH</label><label class="grow">Ghi chú<input name="note" placeholder="vd: công trình…"></label><button class="btn primary">${ICON.plus} Thêm</button></form>`}</div>
    <div class="grid2 wide-left"><div class="card flush"><div class="card-head pad"><h3>Danh sách khoản thưởng / phúc lợi</h3></div><table class="tbl compact"><thead><tr><th>Nhân viên</th><th>Khoản</th><th class="r">Số tiền</th><th>BHXH</th><th>Ghi chú</th><th></th></tr></thead><tbody>
      ${list.map((b) => `<tr><td>${esc(empName(b.empId))}</td><td>${esc(b.name)}</td><td class="r">${vnd(b.amount)}</td><td>${b.bhxh ? '<span class="pill">Có</span>' : ''}</td><td>${esc(b.note)}</td><td class="r nowrap">${locked ? '' : `<button class="icon-btn" data-act="bonus-edit" data-id="${b.id}">${ICON.edit}</button><button class="icon-btn danger" data-act="row-del" data-k="bonus" data-id="${b.id}">${ICON.trash}</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Chưa có khoản nào.</td></tr>'}</tbody></table></div>
    <div class="card flush"><div class="card-head pad"><h3>Tổng theo nhân viên</h3></div><table class="tbl compact"><tbody>${Object.entries(by).map(([id, v]) => `<tr><td>${esc(empName(id))}</td><td class="r b">${vnd(v)}</td></tr>`).join('') || '<tr><td class="empty">—</td></tr>'}</tbody></table></div></div>`;
  }
  if (tab === 'ded') {
    const list = (M.ded || []);
    body = `<div class="card">${locked ? lockNote() : `<form class="inline-form" data-form="ded"><label>Nhân viên<select name="empId">${empOptions(ym, '')}</select></label>
      <label>Tên khoản khấu trừ<input name="name" placeholder="vd: Tiền đồng phục"></label><label>Số tiền<input class="money" name="amount" inputmode="numeric"></label>
      <label class="check-l"><input type="checkbox" name="confirmed"> Đã xác nhận</label><label class="grow">Ghi chú<input name="note"></label><button class="btn primary">${ICON.plus} Thêm</button></form>`}
      <p class="muted small mt">Chỉ khoản <b>đã xác nhận</b> mới được trừ vào thực lĩnh. Khoản chờ xác nhận được hiển thị để kiểm tra, không tự động khấu trừ.</p></div>
    <div class="card flush"><table class="tbl compact"><thead><tr><th>Nhân viên</th><th>Khoản</th><th class="r">Số tiền</th><th>Trạng thái</th><th>Ghi chú</th><th></th></tr></thead><tbody>
      ${list.map((d) => `<tr><td>${esc(empName(d.empId))}</td><td>${esc(d.name)}</td><td class="r">${vnd(d.amount)}</td><td><label class="check-l"><input type="checkbox" data-act="ded-toggle" data-id="${d.id}" ${d.confirmed ? 'checked' : ''} ${dis}> ${d.confirmed ? '<span class="pill ok">Đã xác nhận – áp dụng</span>' : '<span class="pill warn">Chờ xác nhận</span>'}</label></td><td>${esc(d.note)}</td><td class="r nowrap">${locked ? '' : `<button class="icon-btn danger" data-act="row-del" data-k="ded" data-id="${d.id}">${ICON.trash}</button>`}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Không có khoản khấu trừ.</td></tr>'}</tbody></table></div>`;
  }
  return `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="allow-tab" data-t="${k}">${l}</button>`).join('')}</div>${locked && tab === 'cc' ? lockNote() : ''}${body}`;
};

/* ---------- Bảng lương ---------- */
const PAY_COLS = [
  ['code', 'Mã NV'], ['name', 'Họ tên'], ['position', 'Chức danh'], ['salary', 'Lương tháng', 1], ['std', 'Công chuẩn', 2], ['paidCong', 'Công thực tế', 2],
  ['base', 'Lương theo công', 1], ['lateDed', 'Trừ đi trễ', 1], ['otPay', 'Tăng ca', 1], ['cc', 'PC chuyên cần', 1], ['fuel', 'PC xăng xe', 1], ['bonus', 'Thưởng/phúc lợi', 1],
  ['gross', 'Tổng thu nhập', 1], ['insTotal', 'BHXH NLĐ', 1], ['otherDed', 'Khấu trừ khác', 1], ['adv', 'Tổng ứng', 1], ['net', 'Thực lĩnh', 1],
];
const rowVal = (r, k) => (k === 'insTotal' ? r.ins.total : r[k]);
function payChecks(ym, P) {
  const M = getM(ym); const out = [];
  P.rows.forEach((r) => {
    if (r.sum && r.sum.blank) out.push(['warn', `${r.code} ${r.name}: còn ${r.sum.blank} ngày làm việc chưa chấm công`]);
    if (r.net < 0) out.push(['err', `${r.code} ${r.name}: thực lĩnh âm (${vnd(r.net)} đ) — kiểm tra khoản ứng/khấu trừ`]);
    if (r.pendingDed) out.push(['info', `${r.code} ${r.name}: có ${vnd(r.pendingDed)} đ khấu trừ chờ xác nhận (chưa áp dụng)`]);
    if (r.ccMode && r.ccMode !== 'auto' && !(((M.allow || {})[r.empId] || {}).ccNote)) out.push(['warn', `${r.code} ${r.name}: chuyên cần được điều chỉnh thủ công nhưng chưa ghi lý do phê duyệt`]);
  });
  const lateDays = {}; (M.late || []).forEach((l) => { if (l.date) (lateDays[l.empId] = lateDays[l.empId] || []).push(E.dayOf(l.date)); });
  P.rows.forEach((r) => { const td = (r.sum && r.sum.timeDays) || []; const dup = td.filter((d) => (lateDays[r.empId] || []).includes(d)); if (dup.length) out.push(['warn', `${r.code} ${r.name}: ngày ${dup.join(', ')} vừa chấm giờ vào/ra vừa ghi đi trễ — có thể bị trừ hai lần`]); });
  return out;
}
VIEWS['bang-luong'] = function () {
  const ym = UI.ym, M = getM(ym), st = M.status || 'none', P = E.payroll(S.settings, S.employees, ym, M), f = UI.pay;
  const q = f.q.trim().toLowerCase();
  let rows = P.rows.filter((r) => !q || (r.code + ' ' + r.name + ' ' + r.position).toLowerCase().includes(q));
  rows = sortRows(rows, f.sort, f.dir, rowVal);
  const t = P.totals; const checks = st === 'locked' ? [] : payChecks(ym, P);
  const blanks = P.rows.reduce((a, r) => a + ((r.sum && r.sum.blank) || 0), 0);
  const openPrev = openPrevMonths(ym);
  const steps = [
    ['Chọn tháng', true, ymLabel(ym)], ['Lịch & công chuẩn', true, P.std + ' công'], ['Chấm công', blanks === 0, blanks ? blanks + ' ô trống' : 'Đủ', 'cham-cong'],
    ['Đi trễ & tăng ca', true, (M.late || []).length + ' trễ · ' + (M.ot || []).length + ' TC', 'tang-ca'], ['Phụ cấp & thưởng', true, (M.bonus || []).length + ' khoản', 'phu-cap'],
    ['Ứng lương', true, vnd(t.adv) + ' đ', 'ung-luong'], ['Tính bảng lương', st !== 'none', st === 'none' ? 'Chưa tính' : 'Đã tính'], ['Kiểm tra & chốt', st === 'locked', st === 'locked' ? 'Đã chốt' : 'Chưa chốt'], ['Xuất Excel / PDF', st === 'locked', 'Excel · Phiếu lương', 'phieu-luong'],
  ];
  const actions = st === 'none' ? `<button class="btn primary" data-act="pay-calc">${ICON.calc} Tính bảng lương</button>`
    : st === 'review' ? `<button class="btn primary" data-act="pay-lock">${ICON.lock} Chốt lương</button>`
      : `<button class="btn warn" data-act="pay-unlock">${ICON.unlock} Mở khóa</button>`;
  return `<div class="steps">${steps.map(([l, done, sub, link], i) => `<${link ? `a href="#${link}"` : 'div'} class="step ${done ? 'done' : ''}"><span class="step-n">${done ? ICON.check : i + 1}</span><div><b>${l}</b><small>${esc(sub)}</small></div></${link ? 'a' : 'div'}>`).join('')}</div>
  <div class="card pay-status"><div><span class="badge lg st-${st}">${st === 'locked' ? ICON.lock : ''}${STATUS_LABEL[st]}</span>
    <span class="muted">${st === 'locked' ? 'Chốt lúc ' + fmtDT(M.snapshot && M.snapshot.lockedAt) + ' — số liệu được cố định, không bị thay đổi bởi dữ liệu nhập sau.' : st === 'review' ? 'Bảng lương tự động cập nhật theo dữ liệu các module. Kiểm tra rồi chốt.' : 'Số liệu đang tính tạm theo dữ liệu hiện có.'}</span></div>
    <div class="row gap">${actions}${openPrev.length ? `<button class="btn" data-act="pay-lock-prev">${ICON.lock} Chốt các tháng trước (${openPrev.length})</button>` : ''}<button class="btn" data-act="pay-export">${ICON.download} Xuất Excel</button><a class="btn" href="#phieu-luong">${ICON.slip} Phiếu lương</a></div></div>
  ${openPrev.length ? `<div class="alert info">${ICON.alert} ${openPrev.map(ymLabel).join(', ')} chưa chốt lương. Nên chốt để khóa cứng số liệu các tháng đã qua.</div>` : ''}
  ${checks.length ? `<div class="checks">${checks.map(([k, m]) => `<div class="chk ${k}">${ICON.alert}<span>${esc(m)}</span></div>`).join('')}</div>` : ''}
  <div class="toolbar"><input id="pay-q" class="search" placeholder="Tìm nhân viên…" value="${esc(f.q)}" data-model="pay.q"><span class="muted small">Bấm vào một dòng để xem chi tiết công thức</span></div>
  <div class="card flush"><div class="tbl-wrap"><table class="tbl pay" data-sorttbl="pay"><thead><tr><th>STT</th>${PAY_COLS.map(([k, l, n]) => th(l, k, f, n ? 'r' : '')).join('')}</tr></thead>
  <tbody>${rows.map((r, i) => `<tr class="click" data-act="pay-detail" data-id="${r.empId}"><td>${i + 1}</td>${PAY_COLS.map(([k, , n]) => { const v = rowVal(r, k); const cls = (n ? 'r ' : '') + (k === 'net' ? 'b net' : '') + (k === 'gross' ? ' b' : '') + (['lateDed', 'insTotal', 'otherDed', 'adv'].includes(k) && v ? ' neg' : ''); return `<td class="${cls}">${n === 1 ? vnd(v) : n === 2 ? num(v) : esc(v)}</td>`; }).join('')}</tr>`).join('') || `<tr><td colspan="${PAY_COLS.length + 1}" class="empty">Không có dữ liệu.</td></tr>`}</tbody>
  <tfoot><tr><td colspan="4">Tổng cộng (${t.count} NV)</td><td class="r">${vnd(t.salary)}</td><td></td><td></td>${['base', 'lateDed', 'otPay', 'cc', 'fuel', 'bonus', 'gross', 'insTotal', 'otherDed', 'adv', 'net'].map((k) => `<td class="r">${vnd(t[k])}</td>`).join('')}</tr></tfoot></table></div></div>
  <div class="card"><div class="card-head"><h3>Lịch sử chốt / điều chỉnh</h3></div>${(M.log || []).length ? `<table class="tbl compact"><thead><tr><th>Thời gian</th><th>Thao tác</th><th>Nội dung</th></tr></thead><tbody>${M.log.slice().reverse().map((l) => `<tr><td class="nowrap">${fmtDT(l.t)}</td><td><b>${esc(l.action)}</b></td><td>${esc(l.note)}${l.changes && l.changes.length ? '<ul class="chg">' + l.changes.map((c) => `<li>${esc(c)}</li>`).join('') + '</ul>' : ''}${l.net != null ? ` · Tổng thực lĩnh ${vnd(l.net)} đ` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Chưa có lịch sử.</div>'}</div>`;
};
function payDetail(id) {
  const ym = UI.ym; const P = E.payroll(S.settings, S.employees, ym, getM(ym)); const r = P.rows.find((x) => x.empId === id); if (!r) return;
  const L = (label, formula, val, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="muted small">${formula}</td><td class="r">${val}</td></tr>`;
  const sx = S.settings.stdHours || 8;
  openModal({ title: `Chi tiết lương ${r.code} · ${r.name} · ${ymLabel(ym)}`, wide: true, body: `<table class="tbl compact detail"><thead><tr><th>Khoản</th><th>Công thức</th><th class="r">Số tiền (đ)</th></tr></thead><tbody>
    ${L('Lương tháng', P.live ? 'Mức lương có hiệu lực ' + ymLabel(ym) : 'Theo bảng lương đã chốt', vnd(r.salary))}
    ${L('Công chuẩn / công thực tế', `Đi làm ${num(r.sum ? r.sum.worked : r.worked)}${r.sum && r.sum.P ? ' + phép ' + r.sum.P : ''}${r.sum && r.sum.holidaysPaid ? ' + lễ ' + r.sum.holidaysPaid : ''}`, num(r.paidCong) + ' / ' + r.std)}
    ${L('Lương theo công thực tế', `${vnd(r.salary)} ÷ ${r.std} × ${num(r.paidCong, 4)}`, vnd(r.base))}
    ${L('Lương theo giờ', `${vnd(r.salary)} ÷ ${r.std} ÷ ${sx}`, vnd(r.hourly))}
    ${L('Trừ đi trễ', `${vnd(r.hourly)} × ${r.lateMin} phút ÷ 60`, '−' + vnd(r.lateDed), 'neg')}
    ${L('Tiền tăng ca', `T2–T7 ${r.otMin.weekday}′ × ${S.settings.otRates.weekday}% · CN ${r.otMin.weeklyOff}′ × ${S.settings.otRates.weeklyOff}% · Lễ ${r.otMin.holiday}′ × ${S.settings.otRates.holiday}% (lương giờ × phút ÷ 60 × hệ số)`, '+' + vnd(r.otPay))}
    ${L('Phụ cấp chuyên cần', r.ccMode === 'auto' ? (r.ccAuto ? 'Đủ công → hưởng' : 'Thiếu công → không hưởng') : (r.ccMode === 'grant' ? 'Điều chỉnh: duyệt cho hưởng' : 'Điều chỉnh: không cho hưởng'), '+' + vnd(r.cc))}
    ${L('Phụ cấp xăng xe', '', '+' + vnd(r.fuel))}
    ${L('Thưởng / phúc lợi khác', (r.bonusItems || []).map((b) => esc(b.name) + ' ' + vnd(b.amount)).join(' · ') || '—', '+' + vnd(r.bonus))}
    ${L('<b>Tổng thu nhập</b>', 'Lương theo công − trễ + tăng ca + chuyên cần + xăng xe + thưởng', '<b>' + vnd(r.gross) + '</b>', 'tot')}
    ${L('BHXH (NLĐ)', r.ins.applied ? `${vnd(r.ins.base)} × ${r.ins.rates.bhxh}%` : 'Không áp dụng', '−' + vnd(r.ins.bhxh), 'neg')}
    ${L('BHYT (NLĐ)', r.ins.applied ? `${vnd(r.ins.base)} × ${r.ins.rates.bhyt}%` : '', '−' + vnd(r.ins.bhyt), 'neg')}
    ${L('BHTN (NLĐ)', r.ins.applied ? `${vnd(r.ins.base)} × ${r.ins.rates.bhtn}%` : '', '−' + vnd(r.ins.bhtn), 'neg')}
    ${L('Khấu trừ khác (đã xác nhận)', (r.dedItems || []).map((d) => esc(d.name) + ' ' + vnd(d.amount)).join(' · ') || '—', '−' + vnd(r.otherDed), 'neg')}
    ${L('Tổng đã ứng', `${r.advCount || 0} lần trong tháng`, '−' + vnd(r.adv), 'neg')}
    ${L('<b>THỰC LĨNH</b>', 'Tổng thu nhập − BH − khấu trừ khác − ứng lương', '<b>' + vnd(r.net) + '</b>', 'tot net')}
    </tbody></table>${r.pendingDed ? `<p class="muted small">Có ${vnd(r.pendingDed)} đ khấu trừ đang chờ xác nhận — chưa trừ.</p>` : ''}`,
    foot: `<button class="btn" data-close>Đóng</button><button class="btn primary" data-act="slip-open" data-ym="${ym}" data-id="${id}" data-close>${ICON.slip} Xem phiếu lương</button>` });
}
async function payLock() {
  const ym = UI.ym; const M = getM(ym); const P = E.livePayroll(S.settings, S.employees, ym, M); const checks = payChecks(ym, P);
  const ok = await confirmBox('Chốt lương ' + ymLabel(ym), `<p>Chốt bảng lương <b>${P.rows.length}</b> nhân viên — tổng thu nhập <b>${vnd(P.totals.gross)} đ</b>, tổng thực lĩnh <b>${vnd(P.totals.net)} đ</b>.</p><p>Sau khi chốt, dữ liệu chấm công, tăng ca, ứng lương, phụ cấp… của tháng này bị khóa.</p>${checks.length ? `<div class="checks">${checks.map(([k, m]) => `<div class="chk ${k}">${ICON.alert}<span>${esc(m)}</span></div>`).join('')}</div>` : '<p class="ok-t">Không phát hiện cảnh báo.</p>'}`, { ok: 'Chốt lương' });
  if (!ok) return;
  if (await lockMonth(ym)) { render(); toast('Đã chốt lương ' + ymLabel(ym) + ' — số liệu do máy chủ tính lại và lưu cố định'); }
}
/** Chốt lương ở máy chủ: máy chủ tính lại bảng lương từ dữ liệu trong CSDL và lưu ảnh chụp cố định */
async function lockMonth(ym, note) {
  if (!(await Store.flushAll())) { toast('Còn dữ liệu chưa lưu được — kiểm tra lại trước khi chốt', 'err'); return false; }
  try { S.months[ym] = await API.call('POST', '/api/months/' + ym + '/lock', { note: note || '' }); return true; }
  catch (e) { toast('Không chốt được ' + ymLabel(ym) + ': ' + e.message, 'err'); try { await Store.load(); } catch (e2) { /* */ } render(); return false; }
}
function openPrevMonths(ym) { return Object.keys(S.months).filter((k) => k < ym && !isLocked(k) && E.livePayroll(S.settings, S.employees, k, S.months[k]).rows.length).sort(); }
async function lockPrevMonths() {
  const ym = UI.ym; const list = openPrevMonths(ym); if (!list.length) { toast('Không còn tháng nào trước ' + ymLabel(ym) + ' chưa chốt'); return; }
  const rows = list.map((k) => { const P = E.livePayroll(S.settings, S.employees, k, S.months[k]); return `<tr><td>${ymLabel(k)}</td><td>${STATUS_LABEL[S.months[k].status || 'none']}</td><td class="r">${P.rows.length}</td><td class="r">${vnd(P.totals.net)}</td></tr>`; }).join('');
  const ok = await confirmBox('Chốt các tháng trước ' + ymLabel(ym), `<p>Chốt và khóa cứng bảng lương các tháng sau. Số liệu được lưu cố định theo mức lương có hiệu lực từng tháng — thay đổi hồ sơ, tăng lương sau này sẽ không làm thay đổi các tháng này.</p><table class="tbl compact"><thead><tr><th>Tháng</th><th>Trạng thái</th><th class="r">Số NV</th><th class="r">Tổng thực lĩnh</th></tr></thead><tbody>${rows}</tbody></table>`, { ok: 'Chốt ' + list.length + ' tháng' });
  if (!ok) return;
  let n = 0; for (const k of list) if (await lockMonth(k, 'Chốt hàng loạt các tháng trước')) n++;
  render(); if (n) toast('Đã chốt ' + n + ' tháng: ' + list.slice(0, n).map(ymLabel).join(', '));
}
function payUnlock() {
  const ym = UI.ym; if (!S.months[ym]) return;
  openModal({ title: 'Mở khóa bảng lương ' + ymLabel(ym), body: `<p>Mở khóa để điều chỉnh dữ liệu. Lý do mở khóa và các thay đổi thực lĩnh (khi chốt lại) sẽ được ghi vào lịch sử.</p><label class="field full"><span>Lý do mở khóa <span class="req">*</span></span><textarea id="unlock-reason" rows="3" placeholder="vd: Bổ sung thưởng công trình cho NV005"></textarea></label>`,
    foot: `<button class="btn" data-close>Hủy</button><button class="btn warn" data-ok>${ICON.unlock} Mở khóa</button>`, onOpen: (w, close) => {
      w.querySelector('[data-ok]').addEventListener('click', async () => { const r = $('#unlock-reason').value.trim(); if (r.length < 5) { toast('Vui lòng nhập lý do (ít nhất 5 ký tự)', 'warn'); return; }
        try { S.months[ym] = await API.call('POST', '/api/months/' + ym + '/unlock', { reason: r }); close(); render(); toast('Đã mở khóa — nhớ chốt lại sau khi điều chỉnh'); }
        catch (e) { toast(e.message, 'err'); } });
    } });
}
/* ---------- Phiếu lương ---------- */
function payslipHtml(r, ym, st) {
  const Sx = S.settings; const draft = st !== 'locked';
  const R = (l, v, cls = '') => `<tr class="${cls}"><td>${l}</td><td class="r">${v}</td></tr>`;
  return `<div class="slip">${draft ? '<div class="slip-draft">BẢN TẠM TÍNH</div>' : ''}
    <div class="slip-head"><div><div class="slip-co">${esc(Sx.company)}</div>${Sx.taxCode ? `<div class="slip-sub">Mã số thuế: ${esc(Sx.taxCode)}</div>` : ''}${Sx.companyAddress ? `<div class="slip-sub">Địa chỉ: ${esc(Sx.companyAddress)}</div>` : ''}${Sx.companyPhone ? `<div class="slip-sub">Điện thoại: ${esc(Sx.companyPhone)}</div>` : ''}</div></div>
    <h2 class="slip-title">PHIẾU LƯƠNG ${ymLabel(ym).toUpperCase()}</h2>
    <table class="slip-info"><tr><td>Mã nhân viên</td><td><b>${esc(r.code)}</b></td><td>Chức danh</td><td><b>${esc(r.position)}</b></td></tr><tr><td>Họ và tên</td><td><b>${esc(r.name)}</b></td><td>Mức lương tháng</td><td><b>${vnd(r.salary)} đ</b></td></tr>
      <tr><td>Tổng công chuẩn</td><td><b>${r.std}</b></td><td>Công thực tế</td><td><b>${num(r.paidCong)}</b>${r.sum && (r.sum.P || r.sum.K) ? ` <small>(phép ${r.sum.P}, KL ${r.sum.K})</small>` : ''}</td></tr></table>
    <div class="slip-cols"><div><div class="slip-sec">A. CÁC KHOẢN THU NHẬP</div><table class="slip-tbl">
      ${R('Lương theo công', vnd(r.base))}${R('Tiền tăng ca' + (r.otMin && (r.otMin.weekday + r.otMin.weeklyOff + r.otMin.holiday) ? ` <small>(${r.otMin.weekday + r.otMin.weeklyOff + r.otMin.holiday} phút)</small>` : ''), vnd(r.otPay))}
      ${R('Tiền trừ đi trễ' + (r.lateMin ? ` <small>(${r.lateMin} phút)</small>` : ''), r.lateDed ? '−' + vnd(r.lateDed) : '0')}
      ${R('Phụ cấp chuyên cần', vnd(r.cc))}${R('Phụ cấp xăng xe', vnd(r.fuel))}${R('Thưởng và phúc lợi khác', vnd(r.bonus))}
      ${(r.bonusItems || []).map((b) => R('<small>· ' + esc(b.name) + '</small>', '<small>' + vnd(b.amount) + '</small>', 'sub')).join('')}
      ${R('<b>TỔNG THU NHẬP</b>', '<b>' + vnd(r.gross) + '</b>', 'tot')}</table></div>
    <div><div class="slip-sec">B. CÁC KHOẢN KHẤU TRỪ</div><table class="slip-tbl">
      ${R('BHXH' + (r.ins.applied ? ` <small>(${r.ins.rates.bhxh}%)</small>` : ''), vnd(r.ins.bhxh))}${R('BHYT' + (r.ins.applied ? ` <small>(${r.ins.rates.bhyt}%)</small>` : ''), vnd(r.ins.bhyt))}${R('BHTN' + (r.ins.applied ? ` <small>(${r.ins.rates.bhtn}%)</small>` : ''), vnd(r.ins.bhtn))}
      ${R('Tổng tiền đã ứng' + (r.advCount ? ` <small>(${r.advCount} lần)</small>` : ''), vnd(r.adv))}${R('Các khoản khấu trừ khác', vnd(r.otherDed))}
      ${(r.dedItems || []).map((d) => R('<small>· ' + esc(d.name) + '</small>', '<small>' + vnd(d.amount) + '</small>', 'sub')).join('')}
      ${R('<b>TỔNG KHẤU TRỪ</b>', '<b>' + vnd(r.ins.total + r.adv + r.otherDed) + '</b>', 'tot')}</table></div></div>
    <div class="slip-net"><div>THỰC LĨNH</div><div class="slip-net-v">${vnd(r.net)} đ</div></div>
    <div class="slip-words">Bằng chữ: <i>${r.net < 0 ? 'Âm ' + E.moneyWords(r.net).toLowerCase() : E.moneyWords(r.net)}</i></div>
    <div class="slip-sign"><div><b>Người lập phiếu</b><small>(Ký, ghi rõ họ tên)</small></div><div><b>Kế toán</b><small>(Ký, ghi rõ họ tên)</small></div><div><b>Người nhận</b><small>(Ký, ghi rõ họ tên)</small></div></div>
    <div class="slip-foot">Phiếu lương được tạo tự động từ hệ thống quản lý nhân sự · ${draft ? 'Số liệu tạm tính, chưa chốt' : 'Đã chốt lương'} · In ngày ${fmtDate(todayStr())}</div></div>`;
}
VIEWS['phieu-luong'] = function () {
  const ym = UI.ym, M = getM(ym), P = E.payroll(S.settings, S.employees, ym, M);
  if (!UI.slipEmp || !P.rows.find((r) => r.empId === UI.slipEmp)) UI.slipEmp = P.rows[0] ? P.rows[0].empId : '';
  const r = P.rows.find((x) => x.empId === UI.slipEmp);
  return `<div class="slip-layout"><div class="card slip-side"><h3>Chọn phiếu lương</h3><p class="muted small">${ymLabel(ym)} · ${STATUS_LABEL[M.status || 'none']}${M.status !== 'locked' ? ' — phiếu sẽ có dấu “Bản tạm tính”' : ''}</p>
    <div class="slip-list">${P.rows.map((x) => `<button class="slip-item ${x.empId === UI.slipEmp ? 'on' : ''}" data-act="slip-pick" data-id="${x.empId}"><span><b>${esc(x.code)}</b> ${esc(x.name)}</span><span>${vnd(x.net)}</span></button>`).join('') || '<div class="empty">Không có dữ liệu.</div>'}</div>
    <div class="slip-actions"><div class="muted small">Phiếu đang chọn</div><button class="btn primary" data-act="slip-pdf" ${r ? '' : 'disabled'}>${ICON.download} Xuất PDF</button><button class="btn" data-act="slip-print" ${r ? '' : 'disabled'}>${ICON.print} In phiếu</button>
    <div class="muted small mt">Toàn bộ nhân viên (${P.rows.length})</div><button class="btn" data-act="slip-pdf-all" ${P.rows.length ? '' : 'disabled'}>${ICON.download} Xuất PDF hàng loạt</button><button class="btn" data-act="slip-print-all" ${P.rows.length ? '' : 'disabled'}>${ICON.print} In hàng loạt</button></div></div>
  <div class="slip-preview">${r ? payslipHtml(r, ym, M.status) : '<div class="card empty">Chọn nhân viên để xem phiếu lương.</div>'}</div></div>`;
};
async function slipPdf(all) {
  if (!window.html2canvas || !window.jspdf) { toast('Thư viện PDF chưa tải xong, vui lòng thử lại sau vài giây', 'warn'); return; }
  const ym = UI.ym, M = getM(ym), P = E.payroll(S.settings, S.employees, ym, M);
  const rows = all ? P.rows : P.rows.filter((r) => r.empId === UI.slipEmp); if (!rows.length) return;
  const stage = $('#pdf-stage'); const busy = $('#busy'); const { jsPDF } = window.jspdf; const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  busy.querySelector('span').textContent = 'Đang tạo PDF ' + rows.length + ' phiếu lương…'; busy.classList.add('show'); stage.classList.add('show');
  try {
    for (let i = 0; i < rows.length; i++) {
      stage.innerHTML = payslipHtml(rows[i], ym, M.status);
      await new Promise((r) => setTimeout(r, 30));
      busy.querySelector('span').textContent = `Đang tạo PDF… ${i + 1}/${rows.length}`;
      const canvas = await window.html2canvas(stage.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 1280 });
      const img = canvas.toDataURL('image/jpeg', 0.92); const w = 190; const h = canvas.height * w / canvas.width;
      if (i) pdf.addPage(); pdf.addImage(img, 'JPEG', 10, 10, w, Math.min(h, 277));
    }
  } catch (err) { toast('Không tạo được PDF: ' + (err && err.message ? err.message : err), 'err'); return; } finally { stage.innerHTML = ''; stage.classList.remove('show'); busy.classList.remove('show'); }
  const name = all ? `PhieuLuong_${ym}_TatCa.pdf` : `PhieuLuong_${ym}_${rows[0].code}.pdf`;
  await saveFile(name, pdf.output('arraybuffer'), 'application/pdf');
}
function slipPrint(all) {
  const ym = UI.ym, M = getM(ym), P = E.payroll(S.settings, S.employees, ym, M);
  const rows = all ? P.rows : P.rows.filter((r) => r.empId === UI.slipEmp);
  $('#print-area').innerHTML = rows.map((r) => `<div class="print-page">${payslipHtml(r, ym, M.status)}</div>`).join('');
  setTimeout(() => { try { window.print(); } catch (e) { toast('Trình duyệt chặn lệnh in — hãy dùng “Xuất PDF” rồi in từ file.', 'warn'); } }, 50);
}

/* ---------- Cài đặt ---------- */
VIEWS['cai-dat'] = function () {
  const Sx = S.settings; const tab = UI.setTab;
  const tabs = [['general', 'Công ty & ngày công'], ['pay', 'Hệ số & phụ cấp'], ['ins', 'Bảo hiểm'], ['holiday', 'Ngày lễ / nghỉ đặc biệt'], ['data', 'Dữ liệu & sao lưu']];
  const chk = (k, l, hint = '') => `<label class="set-check"><input type="checkbox" data-set="${k}" ${Sx[k] ? 'checked' : ''}><span><b>${l}</b>${hint ? `<small>${hint}</small>` : ''}</span></label>`;
  const inp = (k, l, type = 'text', hint = '', extra = '') => `<label class="field"><span>${l}</span><input type="${type}" data-set="${k}" value="${esc(k.split('.').reduce((o, p) => o[p], Sx))}" ${extra}>${hint ? `<small>${hint}</small>` : ''}</label>`;
  let body = '';
  if (tab === 'general') body = `<div class="card"><h3>Thông tin công ty</h3><div class="form-grid">${inp('company', 'Tên công ty')}${inp('taxCode', 'Mã số thuế')}${inp('companyAddress', 'Địa chỉ')}${inp('companyPhone', 'Điện thoại')}${inp('codePrefix', 'Tiền tố mã nhân viên', 'text', 'vd NV → NV001')}</div></div>
    <div class="card"><h3>Ngày làm việc & giờ làm</h3><div class="dow-pick">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label class="${Sx.workDows.includes(d) ? 'on' : ''}"><input type="checkbox" data-dow="${d}" ${Sx.workDows.includes(d) ? 'checked' : ''}>${DOW_FULL[d]}</label>`).join('')}</div>
      <p class="muted small">Công chuẩn mỗi tháng = số ngày làm việc thực tế theo lịch (mặc định Thứ 2 – Thứ 7, Chủ nhật nghỉ), không cố định 26 công.</p>
      <div class="form-grid cols3">${inp('workStart', 'Giờ vào', 'time')}${inp('workEnd', 'Giờ ra', 'time')}${inp('stdHours', 'Số giờ chuẩn / công', 'number', 'Dùng trong lương giờ = lương ÷ công chuẩn ÷ giờ chuẩn', 'step="0.5" min="1"')}${inp('lunchStart', 'Nghỉ trưa từ', 'time')}${inp('lunchEnd', 'Nghỉ trưa đến', 'time')}</div></div>
    <div class="card"><h3>Chính sách tính công</h3>${chk('paidLeave', 'Nghỉ phép (P) được tính công hưởng lương', 'Bỏ chọn nếu nghỉ phép không được trả lương')}${chk('leaveKeepsCC', 'Nghỉ phép vẫn được hưởng chuyên cần')}${chk('lateBreaksCC', 'Đi trễ làm mất phụ cấp chuyên cần')}</div>`;
  if (tab === 'pay') body = `<div class="card"><h3>Hệ số tăng ca</h3><div class="form-grid cols3">${inp('otRates.weekday', 'Ngày làm việc (T2–T7) %', 'number', '', 'min="100" step="5"')}${inp('otRates.weeklyOff', 'Ngày nghỉ hằng tuần (CN) %', 'number', '', 'min="100" step="5"')}${inp('otRates.holiday', 'Ngày lễ %', 'number', '', 'min="100" step="5"')}</div></div>
    <div class="card"><h3>Phụ cấp</h3><div class="form-grid"><label class="field"><span>Phụ cấp chuyên cần / tháng</span><input class="money" data-set="ccAmount" value="${vnd(Sx.ccAmount)}"></label></div>
      ${chk('ccBhxh', 'Phụ cấp chuyên cần tính vào lương đóng BHXH')}${chk('fuelBhxh', 'Phụ cấp xăng xe tính vào lương đóng BHXH')}<p class="muted small">Mặc định không khoản phụ cấp nào chịu BHXH. Với thưởng/phúc lợi, đánh dấu “Tính đóng BHXH” trên từng khoản.</p></div>
    <div class="card"><h3>Loại thưởng / phúc lợi</h3><label class="field full"><span>Danh sách (phân cách bằng dấu phẩy)</span><input data-set="bonusTypes" value="${esc(Sx.bonusTypes.join(', '))}"></label></div>`;
  if (tab === 'ins') body = `<div class="card"><h3>Bảo hiểm bắt buộc — phần người lao động đóng</h3>${chk('insEnabled', 'Áp dụng khấu trừ BHXH/BHYT/BHTN', 'Chỉ khấu trừ với nhân viên được đánh dấu “Tham gia BH” trong hồ sơ')}
    <div class="form-grid cols3">${inp('insRates.bhxh', 'BHXH (%)', 'number', '', 'step="0.1" min="0"')}${inp('insRates.bhyt', 'BHYT (%)', 'number', '', 'step="0.1" min="0"')}${inp('insRates.bhtn', 'BHTN (%)', 'number', '', 'step="0.1" min="0"')}</div>
    <p class="muted small">Tổng hiện tại: <b>${num(Number(Sx.insRates.bhxh) + Number(Sx.insRates.bhyt) + Number(Sx.insRates.bhtn), 2)}%</b> × mức lương đóng BHXH (quản lý riêng trong hồ sơ). Nhân viên có thể dùng tỷ lệ riêng. Hệ thống chưa áp trần/sàn mức đóng theo quy định — kiểm tra mức lương đóng BH cho phù hợp.</p></div>`;
  if (tab === 'holiday') body = `<div class="card"><h3>Ngày nghỉ lễ, Tết, nghỉ đặc biệt</h3>
    <div class="radio-row"><label><input type="radio" name="hm" data-set="holidayMode" value="excluded" ${Sx.holidayMode === 'excluded' ? 'checked' : ''}> Trừ khỏi công chuẩn (công chuẩn giảm)</label><label><input type="radio" name="hm" data-set="holidayMode" value="paid" ${Sx.holidayMode === 'paid' ? 'checked' : ''}> Tính vào công chuẩn và tự động cộng công hưởng lương</label></div>
    <form class="inline-form" data-form="holiday"><label>Ngày<input type="date" name="date"></label><label>Đến ngày (tùy chọn)<input type="date" name="to"></label><label class="grow">Tên ngày nghỉ<input name="name" placeholder="vd: Nghỉ Tết Nguyên đán"></label><button class="btn primary">${ICON.plus} Thêm</button></form>
    <table class="tbl compact mt"><thead><tr><th>Ngày</th><th>Thứ</th><th>Tên</th><th></th></tr></thead><tbody>${Sx.holidays.slice().sort((a, b) => a.date.localeCompare(b.date)).map((h) => `<tr><td>${fmtDate(h.date)}</td><td>${DOW_FULL[E.dow(h.date)]}</td><td>${esc(h.name)}</td><td class="r"><button class="icon-btn danger" data-act="hol-del" data-d="${h.date}">${ICON.trash}</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có ngày lễ.</td></tr>'}</tbody></table>
    <p class="muted small">Ngày lễ mẫu cần được rà soát theo thông báo nghỉ lễ chính thức hằng năm. Thay đổi chỉ ảnh hưởng các tháng chưa chốt.</p></div>`;
  if (tab === 'data') { const nM = Object.keys(S.months).length;
    body = `<div class="card"><h3>Lưu trữ</h3><p>${ICON.check} Dữ liệu được lưu trong <b>cơ sở dữ liệu PostgreSQL</b> của máy chủ ngay sau mỗi thao tác — không mất khi tải lại trang, đóng trình duyệt hay đổi thiết bị.</p><p class="muted small">Hiện có ${S.employees.length} nhân viên, ${nM} tháng dữ liệu. Lịch sử thay đổi xem tại <a class="link" href="#bao-mat">Bảo mật › Nhật ký thay đổi dữ liệu</a>.</p></div>
    <div class="card"><h3>Sao lưu & khôi phục</h3><div class="row gap wrap"><button class="btn primary" data-act="backup">${ICON.download} Tải bản sao lưu (JSON)</button><button class="btn" data-act="restore">${ICON.upload} Khôi phục từ file</button></div><p class="muted small">File sao lưu chứa toàn bộ hồ sơ, lịch sử lương, chấm công, tăng ca, ứng lương, phụ cấp, bảng lương đã chốt và cài đặt. Có thể khôi phục cả file sao lưu xuất từ bản prototype. Sao lưu cấp CSDL (pg_dump) xem tài liệu BACKUP.md.</p></div>
    <div class="card"><h3>Mẫu nhập Excel</h3><div class="row gap wrap"><button class="btn" data-act="tpl-emp">${ICON.download} Mẫu danh sách nhân viên</button><button class="btn" data-act="tpl-att">${ICON.download} Mẫu bảng chấm công ${ymLabel(UI.ym)}</button></div></div>
    <div class="card danger-zone"><h3>Vùng nguy hiểm</h3><div class="row gap wrap"><button class="btn" data-act="load-sample">Nạp dữ liệu mẫu</button><button class="btn danger" data-act="wipe">${ICON.trash} Xóa toàn bộ dữ liệu</button></div><p class="muted small">Các thao tác này thay thế toàn bộ dữ liệu trong CSDL. Hãy tải bản sao lưu trước khi thực hiện.</p></div>`; }
  return `<div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${tab === k ? 'on' : ''}" data-act="set-tab" data-t="${k}">${l}</button>`).join('')}</div>${body}`;
};

/* ---- auth.js ---- */
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

/* ---- events.js ---- */
/* ===== SỰ KIỆN, NHẬP/XUẤT, KHỞI ĐỘNG ===== */
function reportErr(err) { console.error(err); toast('Có lỗi xảy ra: ' + (err && err.message ? err.message : err), 'err'); }
window.addEventListener('error', (e) => reportErr(e.error || e.message));
window.addEventListener('unhandledrejection', (e) => reportErr(e.reason));
const ACT = {
  'month-prev': () => { UI.ym = E.addMonths(UI.ym, -1); render(); },
  'month-next': () => { UI.ym = E.addMonths(UI.ym, 1); render(); },
  'load-sample': async () => {
    if (S.initialized && (S.employees.length || Object.keys(S.months).length)) { const ok = await confirmBox('Nạp dữ liệu mẫu', 'Toàn bộ dữ liệu hiện tại sẽ được thay bằng dữ liệu mẫu. Tiếp tục?', { ok: 'Nạp dữ liệu mẫu', danger: true }); if (!ok) return; }
    const d = E.buildSample(curYm());
    try { await Store.replaceAll({ settings: d.settings, employees: d.employees, months: d.months }); UI.ym = curYm(); go('dashboard'); toast('Đã nạp dữ liệu mẫu vào CSDL'); } catch (e) { toast('Không nạp được dữ liệu mẫu: ' + e.message, 'err'); }
  },
  'start-empty': () => { S.initialized = true; Store.touch('settings'); go('nhan-su'); },
  'logout': () => Auth.logout(),
  'nav-toggle': () => document.body.classList.toggle('nav-open'),
  'sec-refresh': () => { SEC.sessions = null; loadSecurity(); render(); },
  'sec-revoke': async (el) => { const ok = await confirmBox('Thu hồi phiên đăng nhập', 'Thiết bị dùng phiên này sẽ bị đăng xuất ngay.', { ok: 'Thu hồi', danger: true }); if (!ok) return; try { const r = await API.call('DELETE', '/api/auth/sessions/' + el.dataset.id); if (r.self) { Auth.me = null; Auth.stopTimers(); showLogin('Đã đăng xuất phiên hiện tại.', 'ok'); return; } toast('Đã thu hồi phiên'); loadSecurity(); } catch (e) { toast(e.message, 'err'); } },
  'sec-revoke-others': async () => { const ok = await confirmBox('Đăng xuất các thiết bị khác', 'Mọi phiên đăng nhập khác (trừ phiên này) sẽ bị thu hồi.', { ok: 'Đăng xuất thiết bị khác', danger: true }); if (!ok) return; try { const r = await API.call('POST', '/api/auth/sessions/revoke-others', {}); toast('Đã thu hồi ' + r.revoked + ' phiên'); loadSecurity(); } catch (e) { toast(e.message, 'err'); } },
  'sec-email': () => secEmail(),
  'pw-send': () => pwSend(), 'pw-resend': () => pwSend(),
  'emp-add': () => openEmpForm(null), 'emp-edit': (el) => openEmpForm(el.dataset.id), 'emp-del': (el) => deleteEmp(el.dataset.id),
  'emp-page': (el) => { UI.emp.page = Number(el.dataset.p); render(); },
  'emp-export': () => exportEmployees(), 'emp-import': () => importEmployees(),
  'profile-tab': (el) => { UI.profileTab = el.dataset.t; render(); },
  'att-day': (el) => { const d = Number(el.dataset.d); UI.att.day = UI.att.day === d ? null : d; render(); },
  'att-sel': (el) => { el.checked ? UI.att.sel.add(el.dataset.id) : UI.att.sel.delete(el.dataset.id); render(); },
  'att-sel-all': (el) => { const ids = empsForMonth(UI.ym).map((e) => e.id); if (el.checked) ids.forEach((i) => UI.att.sel.add(i)); else UI.att.sel.clear(); render(); },
  'att-copy-prev': () => {
    const ym = UI.ym, d = UI.att.day; if (!d) return; const wd = E.calendar(S.settings, ym).days.filter((x) => x.kind === 'work').map((x) => x.d); const i = wd.indexOf(d);
    if (i <= 0) { toast('Không có ngày làm việc trước đó trong tháng', 'warn'); return; } const prev = wd[i - 1]; const ids = targetEmps(ym); let n = 0;
    mutMonth(ym, (M) => ids.forEach((id) => { const v = (M.att[id] || {})[prev]; M.att[id] = M.att[id] || {}; if (v == null) delete M.att[id][d]; else M.att[id][d] = typeof v === 'object' ? { ...v } : v; n++; }));
    toast(`Đã sao chép công ngày ${prev} → ngày ${d} cho ${n} nhân viên`);
  },
  'att-fill-blank': () => {
    const ym = UI.ym; const ids = targetEmps(ym); const days = E.calendar(S.settings, ym).days.filter((x) => x.kind === 'work').map((x) => x.d); let n = 0;
    mutMonth(ym, (M) => ids.forEach((id) => { const emp = empById(id); M.att[id] = M.att[id] || {}; days.forEach((d) => { const ds = E.dstr(ym, d); if (emp.startDate && ds < emp.startDate) return; if (emp.status === 'left' && emp.leftDate && ds > emp.leftDate) return; if (M.att[id][d] == null || M.att[id][d] === '') { M.att[id][d] = 1; n++; } }); }));
    toast('Đã điền X cho ' + n + ' ô trống');
  },
  'att-bulk': () => attBulkModal(), 'att-export': () => exportAttendance(), 'att-import': () => importAttendance(),
  'row-del': async (el) => { const k = el.dataset.k, id = el.dataset.id; const ok = await confirmBox('Xóa bản ghi', 'Xóa bản ghi này?', { ok: 'Xóa', danger: true }); if (!ok) return; mutMonth(UI.ym, (M) => { M[k] = (M[k] || []).filter((x) => x.id !== id); }); toast('Đã xóa'); },
  'late-edit': (el) => editEntry('late', el.dataset.id), 'ot-edit': (el) => editEntry('ot', el.dataset.id), 'adv-edit': (el) => editEntry('adv', el.dataset.id), 'bonus-edit': (el) => editEntry('bonus', el.dataset.id),
  'ot-history': (el) => otHistory(el.dataset.id), 'adv-history': (el) => advHistory(el.dataset.id),
  'allow-tab': (el) => { UI.allowTab = el.dataset.t; render(); },
  'pay-calc': () => { mutMonth(UI.ym, (M) => { M.status = 'review'; M.log.push({ t: new Date().toISOString(), action: 'Tính lương', note: 'Tổng hợp dữ liệu và tính bảng lương' }); }); toast('Đã tính bảng lương — kiểm tra rồi chốt'); },
  'pay-lock': () => payLock(), 'pay-lock-prev': () => lockPrevMonths(), 'pay-unlock': () => payUnlock(), 'pay-export': () => exportPayroll(),
  'pay-detail': (el) => payDetail(el.dataset.id),
  'slip-open': (el) => { UI.ym = el.dataset.ym || UI.ym; UI.slipEmp = el.dataset.id; go('phieu-luong'); },
  'slip-pick': (el) => { UI.slipEmp = el.dataset.id; render(); },
  'slip-pdf': () => slipPdf(false), 'slip-pdf-all': () => slipPdf(true), 'slip-print': () => slipPrint(false), 'slip-print-all': () => slipPrint(true),
  'set-tab': (el) => { UI.setTab = el.dataset.t; render(); },
  'hol-del': (el) => { S.settings.holidays = S.settings.holidays.filter((h) => h.date !== el.dataset.d); saveSettings(); },
  'backup': async () => { try { await Store.flushAll(); const b = await API.call('GET', '/api/backup'); saveFile(`SaoLuu_TanHungHRM_${todayStr()}.json`, JSON.stringify(b, null, 1), 'application/json'); } catch (e) { toast('Không tạo được bản sao lưu: ' + e.message, 'err'); } },
  'restore': () => restoreBackup(),
  'tpl-emp': () => templateEmployees(), 'tpl-att': () => exportAttendance(true),
  'wipe': async () => { const ok = await confirmBox('Xóa toàn bộ dữ liệu', 'Thao tác này xóa tất cả nhân viên, chấm công, bảng lương và cài đặt. Không thể hoàn tác.', { ok: 'Xóa toàn bộ', danger: true }); if (!ok) return; try { await Store.replaceAll({ settings: E.defaultSettings(), employees: [], months: {} }); go('dashboard'); toast('Đã xóa toàn bộ dữ liệu'); } catch (e) { toast(e.message, 'err'); } },
};

document.addEventListener('click', (e) => {
  const sortTh = e.target.closest('th[data-sort]');
  if (sortTh) { const tbl = sortTh.closest('[data-sorttbl]').dataset.sorttbl; const st = UI[tbl]; const k = sortTh.dataset.sort; if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = 1; } render(); return; }
  const go2 = e.target.closest('[data-go]'); if (go2 && !e.target.closest('a,button,input')) { go(go2.dataset.go); return; }
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act] && !(el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox'))) {
    if (el.type === 'checkbox' && !['att-sel', 'att-sel-all', 'ded-toggle'].includes(el.dataset.act)) return;
    if (el.dataset.act === 'ded-toggle') return; // xử lý ở change
    if (el.tagName === 'A' && el.getAttribute('href') && el.getAttribute('href').startsWith('#')) { /* để liên kết tự xử lý */ }
    try { const r = ACT[el.dataset.act](el, e); if (r && r.catch) r.catch(reportErr); } catch (err) { reportErr(err); } return;
  }
  if (!e.target.closest('#pop') && !e.target.closest('td.cell')) hidePop();
});
// bấm một lần vào ô công → mở bảng chọn nhanh (Cả ngày / Nửa ngày / Nghỉ / Phép / KL / Tùy chỉnh)
document.addEventListener('click', (e) => { const td = e.target.closest('td.cell[tabindex]'); if (!td) return; td.focus({ preventScroll: true }); if (isLocked(UI.ym)) { toast(ymLabel(UI.ym) + ' đã chốt lương — mở khóa ở mục Bảng lương để sửa công.', 'warn'); return; } showCellPop(td); });

document.addEventListener('keydown', (e) => {
  const td = e.target.closest && e.target.closest('td.cell[tabindex]'); if (!td || e.ctrlKey || e.metaKey || e.altKey) return;
  const id = td.dataset.e, d = Number(td.dataset.d); const k = e.key; if (k !== 'Enter' && k !== 'F2' && k !== ' ' && k !== 'Shift') hidePop();
  const map = { x: 1, X: 1, '1': 1, h: 0.5, H: 0.5, '5': 0.5, '0': 0, p: 'P', P: 'P', k: 'K', K: 'K' };
  if (k in map) { e.preventDefault(); setCell(id, d, map[k], true); return; }
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); setCell(id, d, null, false); return; }
  if (k === 'Enter' || k === 'F2' || k === ' ') { e.preventDefault(); showCellPop(td); return; }
  if (k === 'ArrowRight' || (k === 'Tab' && !e.shiftKey)) { e.preventDefault(); moveFocus(td, 1, 0); }
  else if (k === 'ArrowLeft' || (k === 'Tab' && e.shiftKey)) { e.preventDefault(); moveFocus(td, -1, 0); }
  else if (k === 'ArrowDown') { e.preventDefault(); moveFocus(td, 0, 1); }
  else if (k === 'ArrowUp') { e.preventDefault(); moveFocus(td, 0, -1); }
});
document.addEventListener('focusin', (e) => { const td = e.target.closest && e.target.closest('td.cell[tabindex]'); if (td) UI.focus = { e: td.dataset.e, d: Number(td.dataset.d) }; });

// ô nhập liên kết vào UI (tìm kiếm/lọc)
document.addEventListener('input', (e) => {
  const m = e.target.dataset && e.target.dataset.model; if (!m || e.target.tagName === 'SELECT') return;
  const [a, b] = m.split('.'); if (b) UI[a][b] = e.target.value; else UI[a] = e.target.value; if (a === 'emp') UI.emp.page = 1; render();
});
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'ym-input') { if (/^\d{4}-\d{2}$/.test(t.value)) { UI.ym = t.value; render(); } return; }
  if (t.dataset.model && t.tagName === 'SELECT') { const [a, b] = t.dataset.model.split('.'); const v = b === 'size' ? Number(t.value) : t.value; if (b) UI[a][b] = v; else UI[a] = v; if (a === 'emp') UI.emp.page = 1; render(); return; }
  if (t.dataset.allow) {
    const id = t.dataset.id, k = t.dataset.allow; const v = k === 'fuel' ? (t.value.trim() === '' ? null : parseMoney(t.value)) : t.value.trim();
    mutMonth(UI.ym, (M) => { M.allow[id] = M.allow[id] || {}; if (v === null || v === '') delete M.allow[id][k]; else M.allow[id][k] = v; }); return;
  }
  if (t.dataset.act === 'ded-toggle') { mutMonth(UI.ym, (M) => { const d = M.ded.find((x) => x.id === t.dataset.id); if (d) d.confirmed = t.checked; }); return; }
  if (t.dataset.act === 'ot-preview') { otPreview(t.form); return; }
  if (t.dataset.act === 'adv-week') { if (t.value) $('#adv-week').value = String(E.weekOfMonth(t.value)); return; }
  if (t.dataset.set) { applySetting(t); return; }
  if (t.id === 'idle-min') { API.call('PUT', '/api/security/settings', { idleMinutes: Number(t.value) }).then((r) => { if (Auth.me) Auth.me.idleMinutes = r.idleMinutes; toast('Sẽ tự đăng xuất sau ' + r.idleMinutes + ' phút không hoạt động'); }).catch((e) => toast(e.message, 'err')); return; }
  if (t.dataset.dow) { const d = Number(t.dataset.dow); const s = new Set(S.settings.workDows); t.checked ? s.add(d) : s.delete(d); if (!s.size) { toast('Cần ít nhất một ngày làm việc', 'warn'); render(); return; } S.settings.workDows = [...s].sort(); saveSettings(); return; }
});
document.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.act === 'ot-preview') otPreview(e.target.form); });
function applySetting(t) {
  const k = t.dataset.set; let v;
  if (t.type === 'checkbox') v = t.checked; else if (t.type === 'radio') v = t.value; else if (t.type === 'number') v = Number(t.value); else if (t.classList.contains('money')) v = parseMoney(t.value); else v = t.value;
  if (k === 'bonusTypes') v = String(v).split(',').map((s) => s.trim()).filter(Boolean);
  if (t.type === 'number' && (isNaN(v) || v < 0)) { toast('Giá trị không hợp lệ', 'warn'); render(); return; }
  const parts = k.split('.'); let o = S.settings; for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]]; o[parts[parts.length - 1]] = v;
  saveSettings(); toast('Đã lưu cài đặt');
}
function otPreview(form) {
  const out = $('#ot-preview'); if (!out || !form) return; const id = form.empId.value, ds = form.date.value, mins = Number(form.minutes.value);
  if (!id || !ds || !mins) { out.textContent = ''; return; }
  const emp = empById(id); const std = E.calendar(S.settings, E.ymOf(ds)).std; const hr = std ? E.payAt(emp, E.ymOf(ds)).salary / std / S.settings.stdHours : 0; const rate = E.otRate(S.settings, ds);
  out.innerHTML = `${DOW_FULL[E.dow(ds)]} ${fmtDate(ds)} · <b>${OT_LABEL[E.otKind(S.settings, ds)]}</b> · hệ số <b>${rate}%</b> · ${vnd(hr)} × ${mins}/60 × ${rate}% = <b>${vnd(hr * mins / 60 * rate / 100)} đ</b>`;
}

// gửi biểu mẫu nhập nhanh
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
  const kind = f.dataset.form; const g = (n) => (f.elements[n] ? f.elements[n].value.trim() : ''); const ym = UI.ym;
  if (kind === 'late') {
    const empId = g('empId'), date = g('date'), minutes = Number(g('minutes'));
    if (!empId) return toast('Chọn nhân viên', 'warn'); if (!(minutes > 0) || !Number.isInteger(minutes)) return toast('Số phút trễ phải là số nguyên dương', 'warn');
    if (date && E.ymOf(date) !== ym) return toast('Ngày phải thuộc ' + ymLabel(ym), 'warn');
    if (date && E.dayKind(S.settings, date) !== 'work') return toast('Ngày đi trễ phải là ngày làm việc', 'warn');
    mutMonth(ym, (M) => M.late.push({ id: uid('l'), empId, date, minutes, note: g('note') })); toast('Đã ghi nhận ' + minutes + ' phút trễ');
  }
  if (kind === 'ot') {
    const empId = g('empId'), date = g('date'), minutes = Number(g('minutes'));
    if (!empId || !date) return toast('Chọn nhân viên và ngày tăng ca', 'warn'); if (!(minutes > 0) || !Number.isInteger(minutes)) return toast('Số phút tăng ca phải là số nguyên dương', 'warn');
    if (minutes > 960) return toast('Số phút tăng ca trong một ngày vượt quá 16 giờ — kiểm tra lại', 'warn');
    mutMonth(E.ymOf(date), (M) => M.ot.push({ id: uid('o'), empId, date, minutes, note: g('note') })); toast(`Đã thêm ${minutes} phút tăng ca (${OT_LABEL[E.otKind(S.settings, date)]}, ${E.otRate(S.settings, date)}%)`);
  }
  if (kind === 'adv') {
    const empId = g('empId'), date = g('date'), amount = parseMoney(g('amount'));
    if (!empId || !date) return toast('Chọn nhân viên và ngày ứng', 'warn'); if (!(amount > 0)) return toast('Số tiền ứng phải lớn hơn 0', 'warn');
    const tym = E.ymOf(date);
    mutMonth(tym, (M) => M.adv.push({ id: uid('a'), empId, date, week: Number(g('week')) || E.weekOfMonth(date), amount, note: g('note') })); toast(`Đã ghi nhận tạm ứng ${vnd(amount)} đ` + (tym !== ym ? ' vào ' + ymLabel(tym) : ''));
  }
  if (kind === 'bonus') {
    const empId = g('empId'); let type = g('type'); let name = g('name'); const amount = parseMoney(g('amount'));
    if (type === '__other') { type = 'Khác'; if (!name) return toast('Nhập tên khoản thưởng/phúc lợi', 'warn'); }
    if (!(amount > 0)) return toast('Số tiền phải lớn hơn 0', 'warn');
    const ids = empId === '__all' ? empsForMonth(ym).filter((e) => e.status === 'active').map((e) => e.id) : [empId];
    mutMonth(ym, (M) => ids.forEach((id) => M.bonus.push({ id: uid('b'), empId: id, type, name: name || type, amount, bhxh: f.elements.bhxh.checked, note: g('note') }))); toast(`Đã thêm khoản “${name || type}” cho ${ids.length} nhân viên`);
  }
  if (kind === 'ded') {
    const empId = g('empId'), name = g('name'), amount = parseMoney(g('amount'));
    if (!empId || !name) return toast('Chọn nhân viên và nhập tên khoản', 'warn'); if (!(amount > 0)) return toast('Số tiền phải lớn hơn 0', 'warn');
    mutMonth(ym, (M) => M.ded.push({ id: uid('d'), empId, name, amount, confirmed: f.elements.confirmed.checked, note: g('note') })); toast('Đã thêm khoản khấu trừ' + (f.elements.confirmed.checked ? '' : ' (chờ xác nhận)'));
  }
  if (kind === 'holiday') {
    const a = g('date'), b = g('to') || a, name = g('name'); if (!a || !name) return toast('Nhập ngày và tên ngày nghỉ', 'warn'); if (b < a) return toast('Ngày kết thúc phải sau ngày bắt đầu', 'warn');
    let cur = a; let n = 0; while (cur <= b && n < 60) { if (!S.settings.holidays.some((h) => h.date === cur)) S.settings.holidays.push({ date: cur, name }); n++; const dt = new Date(cur + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + 1); cur = dt.toISOString().slice(0, 10); }
    saveSettings(); toast('Đã thêm ' + n + ' ngày nghỉ');
  }
});
function editEntry(kind, id) {
  const ym = UI.ym; const M = getM(ym); const x = (M[kind] || []).find((r) => r.id === id); if (!x) return;
  const F = {
    late: [{ name: 'date', label: 'Ngày (trống = tổng tháng)', type: 'date' }, { name: 'minutes', label: 'Số phút', type: 'number', min: 1 }, { name: 'note', label: 'Ghi chú', full: true }],
    ot: [{ name: 'date', label: 'Ngày tăng ca', type: 'date' }, { name: 'minutes', label: 'Số phút', type: 'number', min: 1 }, { name: 'note', label: 'Ghi chú / công trình', full: true }],
    adv: [{ name: 'date', label: 'Ngày ứng', type: 'date' }, { name: 'week', label: 'Tuần', type: 'select', options: [1, 2, 3, 4, 5].map((w) => [String(w), 'Tuần ' + w]) }, { name: 'amount', label: 'Số tiền', type: 'money' }, { name: 'note', label: 'Ghi chú', full: true }],
    bonus: [{ name: 'name', label: 'Tên khoản' }, { name: 'amount', label: 'Số tiền', type: 'money' }, { name: 'bhxh', label: 'Tính đóng BHXH', type: 'checkbox' }, { name: 'note', label: 'Ghi chú', full: true }],
  }[kind];
  formModal({ title: 'Sửa · ' + empName(x.empId), fields: F, values: { ...x, week: String(x.week || '') }, onSubmit: (v) => {
    if (v.minutes !== undefined && !(v.minutes > 0)) return 'Số phút phải lớn hơn 0';
    if (v.amount !== undefined && !(v.amount > 0)) return 'Số tiền phải lớn hơn 0';
    if (v.date && E.ymOf(v.date) !== ym) return 'Ngày phải thuộc ' + ymLabel(ym) + ' (muốn chuyển tháng, hãy xóa và tạo lại)';
    if (kind === 'ot' && !v.date) return 'Cần nhập ngày tăng ca';
    mutMonth(ym, (MM) => { const r = MM[kind].find((y) => y.id === id); Object.assign(r, v); if (kind === 'adv') r.week = Number(v.week) || E.weekOfMonth(v.date); }); toast('Đã cập nhật');
  } });
}

/* ---------- Xuất Excel ---------- */
function exportPayroll() {
  if (!needXLSX()) return; const ym = UI.ym, M = getM(ym), P = E.payroll(S.settings, S.employees, ym, M);
  const head = ['STT', 'Mã NV', 'Họ tên', 'Chức danh', 'Lương tháng', 'Tổng công chuẩn', 'Công thực tế', 'Lương theo công thực tế', 'Tiền trừ đi trễ', 'Tiền tăng ca', 'Phụ cấp chuyên cần', 'Phụ cấp xăng xe', 'Thưởng/phúc lợi khác', 'Tổng thu nhập', 'BHXH', 'BHYT', 'BHTN', 'BH NLĐ khấu trừ', 'Các khoản khấu trừ khác', 'Tổng ứng lương', 'Thực lĩnh'];
  const aoa = [[S.settings.company], ['BẢNG LƯƠNG ' + ymLabel(ym).toUpperCase()], ['Trạng thái: ' + STATUS_LABEL[M.status || 'none'] + (M.snapshot ? ' · Chốt lúc ' + fmtDT(M.snapshot.lockedAt) : '') + ' · Công chuẩn: ' + P.std], [], head];
  P.rows.forEach((r, i) => aoa.push([i + 1, r.code, r.name, r.position, r.salary, r.std, Math.round(r.paidCong * 10000) / 10000, r.base, r.lateDed, r.otPay, r.cc, r.fuel, r.bonus, r.gross, r.ins.bhxh, r.ins.bhyt, r.ins.bhtn, r.ins.total, r.otherDed, r.adv, r.net]));
  const t = P.totals; aoa.push(['', '', 'TỔNG CỘNG', '', t.salary, '', '', t.base, t.lateDed, t.otPay, t.cc, t.fuel, t.bonus, t.gross, P.rows.reduce((a, r) => a + r.ins.bhxh, 0), P.rows.reduce((a, r) => a + r.ins.bhyt, 0), P.rows.reduce((a, r) => a + r.ins.bhtn, 0), t.insTotal, t.otherDed, t.adv, t.net]);
  const wb = XLSX.utils.book_new();
  const ws = sheetFromAoa(aoa, [5, 9, 24, 16, 13, 9, 9, 15, 12, 12, 12, 12, 13, 15, 11, 11, 11, 13, 13, 13, 15], [4, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 5);
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }];
  XLSX.utils.book_append_sheet(wb, ws, 'Bảng lương');
  // chi tiết các module
  const ot = [['Ngày', 'Thứ', 'Mã NV', 'Họ tên', 'Số phút', 'Loại ngày', 'Hệ số %', 'Ghi chú']]; (M.ot || []).forEach((o) => { const e = empById(o.empId) || {}; ot.push([fmtDate(o.date), DOW[E.dow(o.date)], e.code, e.name, o.minutes, OT_LABEL[E.otKind(S.settings, o.date)], E.otRate(S.settings, o.date), o.note]); });
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(ot, [11, 5, 9, 24, 9, 12, 9, 30]), 'Tăng ca');
  const adv = [['Ngày ứng', 'Tuần', 'Mã NV', 'Họ tên', 'Số tiền', 'Ghi chú']]; (M.adv || []).forEach((a) => { const e = empById(a.empId) || {}; adv.push([fmtDate(a.date), a.week, e.code, e.name, a.amount, a.note]); });
  XLSX.utils.book_append_sheet(wb, sheetFromAoa(adv, [11, 6, 9, 24, 13, 30], [4], 1), 'Ứng lương');
  XLSX.utils.book_append_sheet(wb, attendanceSheet(ym, false), 'Chấm công');
  saveFile(`BangLuong_${ym}.xlsx`, xlsxBuffer(wb));
}
function attendanceSheet(ym, template) {
  const cal = E.calendar(S.settings, ym); const M = getM(ym);
  const head = ['Mã NV', 'Họ tên', ...cal.days.map((d) => d.d), ...(template ? [] : ['Công đi làm', 'Phép', 'KL', 'Công tính lương'])];
  const sub = ['', '', ...cal.days.map((d) => (d.kind === 'holiday' ? 'Lễ' : DOW[d.dow])), ...(template ? [] : ['', '', '', ''])];
  const aoa = [head, sub];
  empsForMonth(ym).forEach((e) => {
    const row = (M.att || {})[e.id] || {}; const s = E.summarize(S.settings, ym, row, cal);
    aoa.push([e.code, e.name, ...cal.days.map((d) => { if (d.kind === 'off') return 'CN'; if (d.kind === 'holiday') return 'L'; const c = row[d.d]; if (template || c == null) return ''; if (c === 1) return 'X'; if (c === 'K') return 'KL'; if (typeof c === 'object') return c.i + '-' + c.o; return c; }),
      ...(template ? [] : [Math.round(s.worked * 10000) / 10000, s.P, s.K, Math.round(s.paidCong * 10000) / 10000])]);
  });
  return sheetFromAoa(aoa, [9, 24, ...cal.days.map(() => 5), 10, 6, 6, 12]);
}
function exportAttendance(template) { if (!needXLSX()) return; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, attendanceSheet(UI.ym, template), 'Chấm công'); saveFile(`${template ? 'Mau_' : ''}ChamCong_${UI.ym}.xlsx`, xlsxBuffer(wb)); }
const EMP_COLS = [['code', 'Mã NV'], ['name', 'Họ và tên'], ['dob', 'Ngày sinh'], ['gender', 'Giới tính'], ['address', 'Địa chỉ thường trú'], ['cccd', 'Số CCCD'], ['cccdDate', 'Ngày cấp CCCD'], ['cccdPlace', 'Nơi cấp CCCD'], ['phone', 'Số điện thoại'], ['position', 'Chức danh'], ['startDate', 'Ngày bắt đầu làm việc'], ['salary', 'Mức lương thỏa thuận'], ['insSalary', 'Mức lương đóng BHXH'], ['insJoin', 'Tham gia BH (Có/Không)'], ['fuelDefault', 'Xăng xe mặc định'], ['status', 'Tình trạng (Đang làm/Đã nghỉ)']];
function exportEmployees() {
  if (!needXLSX()) return; const aoa = [EMP_COLS.map((c) => c[1])];
  S.employees.forEach((e) => aoa.push(EMP_COLS.map(([k]) => { const v = e[k]; if (['dob', 'cccdDate', 'startDate'].includes(k)) return fmtDate(v); if (k === 'insJoin') return v ? 'Có' : 'Không'; if (k === 'status') return v === 'left' ? 'Đã nghỉ' : 'Đang làm'; return v ?? ''; })));
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheetFromAoa(aoa, [9, 24, 11, 8, 36, 14, 12, 22, 14, 16, 12, 14, 14, 10, 12, 12], [11, 12, 14], 1), 'Nhân viên'); saveFile(`DanhSachNhanVien_${todayStr()}.xlsx`, xlsxBuffer(wb));
}
function templateEmployees() { if (!needXLSX()) return; const aoa = [EMP_COLS.map((c) => c[1]), ['', 'Nguyễn Văn Mẫu', '15/05/1995', 'Nam', '1 Đường A, Quận B, TP.HCM', '079095000000', '01/01/2022', 'Cục CS QLHC về TTXH', '0900 000 000', 'Thợ sơn', '01/12/2026', 9000000, 5000000, 'Có', 300000, 'Đang làm']]; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheetFromAoa(aoa, EMP_COLS.map(() => 16)), 'Nhân viên'); saveFile('Mau_DanhSachNhanVien.xlsx', xlsxBuffer(wb)); }
async function readWorkbook() { if (!needXLSX()) return null; const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return null; try { const buf = await f.arrayBuffer(); return XLSX.read(buf, { type: 'array', cellDates: true }); } catch (e) { toast('Không đọc được file Excel', 'err'); return null; } }
async function importEmployees() {
  const wb = await readWorkbook(); if (!wb) return; const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  const head = (rows[0] || []).map((h) => String(h).trim().toLowerCase()); const idx = {}; EMP_COLS.forEach(([k, l]) => { const i = head.findIndex((h) => h === l.toLowerCase() || h.startsWith(l.toLowerCase().split(' (')[0])); if (i >= 0) idx[k] = i; });
  if (idx.name == null) { toast('Không tìm thấy cột “Họ và tên” trong file', 'err'); return; }
  let add = 0, upd = 0, skip = 0;
  rows.slice(1).forEach((r) => {
    const get = (k) => (idx[k] != null ? r[idx[k]] : ''); const name = String(get('name')).trim(); if (!name) return;
    const rec = { name, dob: parseDateCell(get('dob')), gender: String(get('gender') || 'Nam'), address: String(get('address')), cccd: String(get('cccd')).replace(/\D/g, ''), cccdDate: parseDateCell(get('cccdDate')), cccdPlace: String(get('cccdPlace')), phone: String(get('phone')), position: String(get('position')),
      startDate: parseDateCell(get('startDate')) || todayStr(), salary: parseMoney(get('salary')), insSalary: parseMoney(get('insSalary')), insJoin: /^c[oó]|^y|^1|^x/i.test(String(get('insJoin'))), fuelDefault: parseMoney(get('fuelDefault')), status: /ngh/i.test(String(get('status'))) ? 'left' : 'active' };
    if (!(rec.salary > 0)) { skip++; return; }
    const code = String(get('code')).trim(); const ex = code && S.employees.find((e) => e.code === code);
    if (ex) { Object.assign(ex, rec); upd++; } else { S.employees.push({ id: uid('e'), code: code || nextCode(), insCustom: false, insRates: { ...S.settings.insRates }, leftDate: '', note: '', ...rec }); add++; }
  });
  saveEmployees(); toast(`Nhập xong: thêm ${add}, cập nhật ${upd}${skip ? ', bỏ qua ' + skip + ' dòng thiếu lương' : ''}`);
}
async function importAttendance() {
  const ym = UI.ym; if (isLocked(ym)) { toast('Tháng đã chốt lương', 'warn'); return; }
  const wb = await readWorkbook(); if (!wb) return; const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
  const head = rows[0] || []; const cal = E.calendar(S.settings, ym); const dayCol = {}; head.forEach((h, i) => { const n = Number(h); if (Number.isInteger(n) && n >= 1 && n <= cal.n) dayCol[n] = i; });
  const codeCol = head.findIndex((h) => /mã/i.test(String(h))); if (codeCol < 0) { toast('Không tìm thấy cột “Mã NV”', 'err'); return; }
  let cells = 0, miss = 0;
  const parse = (v) => { const s = String(v).trim().toUpperCase().replace(',', '.'); if (!s) return undefined; if (s === 'X') return 1; if (s === 'P') return 'P'; if (s === 'KL' || s === 'K') return 'K'; let m; if ((m = s.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/))) return { i: m[1].padStart(5, '0'), o: m[2].padStart(5, '0') }; const n = Number(s); if (!isNaN(n) && n >= 0 && n <= 1) return n; return undefined; };
  mutMonth(ym, (M) => rows.slice(1).forEach((r) => { const emp = S.employees.find((e) => e.code === String(r[codeCol]).trim()); if (!emp) { if (String(r[codeCol]).trim()) miss++; return; } M.att[emp.id] = M.att[emp.id] || {};
    cal.days.forEach((d) => { if (d.kind !== 'work' || dayCol[d.d] == null) return; const v = parse(r[dayCol[d.d]]); if (v !== undefined) { M.att[emp.id][d.d] = v; cells++; } }); }));
  toast(`Đã nhập ${cells} ô công${miss ? ', ' + miss + ' mã NV không tồn tại' : ''}`);
}
async function restoreBackup() {
  const f = await pickFile('.json,application/json'); if (!f) return; let obj;
  try { obj = JSON.parse(await f.text()); } catch (e) { toast('File không đúng định dạng JSON', 'err'); return; }
  const d = obj && obj.data; if (!d || !Array.isArray(d.employees) || typeof d.months !== 'object' || !d.settings) { toast('File không phải bản sao lưu của hệ thống', 'err'); return; }
  const ok = await confirmBox('Khôi phục dữ liệu', `Bản sao lưu lúc <b>${fmtDT(obj.exportedAt)}</b>: ${d.employees.length} nhân viên, ${Object.keys(d.months).length} tháng. Toàn bộ dữ liệu hiện tại sẽ bị thay thế.`, { ok: 'Khôi phục', danger: true });
  if (!ok) return;
  try { const r = await Store.replaceAll({ settings: Object.assign(E.defaultSettings(), d.settings), employees: d.employees, months: d.months }); render(); toast(`Đã khôi phục ${r.employees} nhân viên, ${r.months} tháng vào CSDL`); } catch (e) { toast('Khôi phục thất bại (dữ liệu cũ được giữ nguyên): ' + e.message, 'err'); }
}

/* ---------- Tooltip biểu đồ ---------- */
document.addEventListener('mouseover', (e) => { const el = e.target.closest('[data-tip]'); const tip = $('#tip'); if (!el) { tip.classList.remove('show'); return; } tip.textContent = el.dataset.tip; tip.classList.add('show'); });
document.addEventListener('mousemove', (e) => { const tip = $('#tip'); if (!tip.classList.contains('show')) return; const w = tip.offsetWidth; tip.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 12) + 'px'; tip.style.top = (e.clientY + 16) + 'px'; });

/* ---------- Khởi động ---------- */
window.addEventListener('hashchange', () => { if (Auth.me) route(); });
boot();

})();
