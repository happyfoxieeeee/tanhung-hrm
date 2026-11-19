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
