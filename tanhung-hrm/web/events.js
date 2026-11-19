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
