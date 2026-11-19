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
