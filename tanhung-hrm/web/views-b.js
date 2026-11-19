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
