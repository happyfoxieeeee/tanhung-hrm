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
