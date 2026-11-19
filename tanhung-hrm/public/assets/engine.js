/* ===== ENGINE (dùng chung trình duyệt + máy chủ): lịch công, tổng hợp công, tính lương (thuần, không phụ thuộc giao diện) ===== */
(function (root) {
  'use strict';
  const pad = (n) => String(n).padStart(2, '0');
  const EPS = 1e-9;

  function ymParts(ym) { const [y, m] = ym.split('-').map(Number); return { y, m }; }
  function daysIn(ym) { const { y, m } = ymParts(ym); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function dstr(ym, d) { return ym + '-' + pad(d); }
  function dow(ds) { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
  function addMonths(ym, k) { const { y, m } = ymParts(ym); const t = y * 12 + (m - 1) + k; return Math.floor(t / 12) + '-' + pad((t % 12) + 1); }
  function ymOf(ds) { return String(ds || '').slice(0, 7); }
  function dayOf(ds) { return Number(String(ds).slice(8, 10)); }
  function weekOfMonth(ds) { return Math.ceil(dayOf(ds) / 7); }
  function toMin(t) { if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }

  function defaultSettings() {
    return {
      company: 'CÔNG TY TNHH MỸ THUẬT TÂN HƯNG',
      taxCode: '',
      companyAddress: '',
      companyPhone: '',
      codePrefix: 'NV',
      workDows: [1, 2, 3, 4, 5, 6],          // Thứ 2 – Thứ 7
      holidays: [],                         // [{date:'YYYY-MM-DD', name}]
      holidayMode: 'excluded',              // 'excluded': trừ khỏi công chuẩn | 'paid': tính vào công chuẩn & tự cộng công hưởng lương
      paidLeave: true,                      // Nghỉ phép (P) được tính công hưởng lương
      leaveKeepsCC: false,                  // Nghỉ phép vẫn được hưởng chuyên cần
      lateBreaksCC: false,                  // Đi trễ làm mất chuyên cần
      stdHours: 8,
      workStart: '07:30', workEnd: '16:30', lunchStart: '11:30', lunchEnd: '12:30',
      otRates: { weekday: 150, weeklyOff: 200, holiday: 300 },
      ccAmount: 200000,
      ccBhxh: false, fuelBhxh: false,
      insEnabled: true,
      insRates: { bhxh: 8, bhyt: 1.5, bhtn: 1 },
      bonusTypes: ['Thưởng lễ', 'Thưởng Tết', 'Thưởng công trình', 'Thưởng hiệu suất', 'Hỗ trợ khác'],
    };
  }

  function emptyMonth() {
    return { att: {}, late: [], ot: [], adv: [], bonus: [], ded: [], allow: {}, status: 'none', snapshot: null, log: [] };
  }

  function isWorkDow(S, ds) { return (S.workDows || [1, 2, 3, 4, 5, 6]).includes(dow(ds)); }
  function holidayOf(S, ds) { return (S.holidays || []).find((h) => h.date === ds) || null; }
  function dayKind(S, ds) { if (holidayOf(S, ds)) return 'holiday'; return isWorkDow(S, ds) ? 'work' : 'off'; }

  /** Lịch tháng + công chuẩn tính theo lịch thực tế */
  function calendar(S, ym) {
    const n = daysIn(ym); const days = []; let work = 0, holOnWork = 0;
    for (let d = 1; d <= n; d++) {
      const ds = dstr(ym, d); const kind = dayKind(S, ds); const h = holidayOf(S, ds);
      const onWorkDow = isWorkDow(S, ds);
      if (kind === 'work') work++;
      if (kind === 'holiday' && onWorkDow) holOnWork++;
      days.push({ d, ds, dow: dow(ds), kind, holidayName: h ? h.name : '', onWorkDow });
    }
    const std = work + (S.holidayMode === 'paid' ? holOnWork : 0);
    return { ym, n, days, std, workDays: work, holidaysOnWork: holOnWork };
  }

  function timeHours(S, i, o) {
    const a = toMin(i), b = toMin(o); if (a == null || b == null || b <= a) return 0;
    const ls = toMin(S.lunchStart), le = toMin(S.lunchEnd);
    let lunch = 0; if (ls != null && le != null && le > ls) lunch = Math.max(0, Math.min(b, le) - Math.max(a, ls));
    return Math.max(0, b - a - lunch) / 60;
  }
  /** Giá trị công của 1 ô. Ô giờ vào/ra: công = giờ thực tế / giờ chuẩn (tối đa 1) */
  function cellCong(S, c) {
    if (c == null || c === '') return null;
    if (typeof c === 'number') return c;
    if (c === 'P' || c === 'K') return 0;
    if (typeof c === 'object') return Math.min(1, timeHours(S, c.i, c.o) / (S.stdHours || 8));
    return null;
  }

  /** Tổng hợp ngày công của 1 nhân viên trong tháng */
  function summarize(S, ym, row, cal) {
    cal = cal || calendar(S, ym); row = row || {};
    let worked = 0, P = 0, K = 0, zero = 0, blank = 0, absent = 0; const timeDays = [];
    for (const day of cal.days) {
      if (day.kind !== 'work') continue;
      const c = row[day.d];
      if (c == null || c === '') { blank++; continue; }
      if (c === 'P') { P++; absent += 1; continue; }
      if (c === 'K') { K++; absent += 1; continue; }
      const v = cellCong(S, c) || 0;
      if (typeof c === 'object') timeDays.push(day.d);
      if (v === 0) zero++;
      worked += v; absent += Math.max(0, 1 - v);
    }
    const holidaysPaid = S.holidayMode === 'paid' ? cal.holidaysOnWork : 0;
    const paidCong = worked + (S.paidLeave ? P : 0) + holidaysPaid;
    return { std: cal.std, worked, P, K, zero, blank, absent, holidaysPaid, paidCong, timeDays,
      ratio: cal.std > 0 ? paidCong / cal.std : 0 };
  }

  function otKind(S, ds) { if (holidayOf(S, ds)) return 'holiday'; return isWorkDow(S, ds) ? 'weekday' : 'weeklyOff'; }
  function otRate(S, ds) { return Number((S.otRates || {})[otKind(S, ds)] || 0); }

  function empInMonth(emp, ym, M) {
    const start = emp.startDate ? ymOf(emp.startDate) : '0000-00';
    if (start > ym) return false;
    const hasData = M && ((M.att && M.att[emp.id] && Object.keys(M.att[emp.id]).length) ||
      ['late', 'ot', 'adv', 'bonus', 'ded'].some((k) => (M[k] || []).some((x) => x.empId === emp.id)));
    if (emp.status === 'left') {
      if (hasData) return true;
      const left = emp.leftDate ? ymOf(emp.leftDate) : null;
      return !!left && left >= ym;
    }
    return true;
  }

  const r0 = (x) => Math.round(x);

  /** Mức lương có hiệu lực tại tháng ym (theo lịch sử tăng/giảm lương) */
  function payAt(emp, ym) {
    const h = (emp.salaryHistory || []).slice().sort((a, b) => a.from.localeCompare(b.from));
    if (!h.length) return { salary: Number(emp.salary) || 0, insSalary: Number(emp.insSalary) || 0, from: null };
    let cur = h[0]; for (const it of h) if (it.from <= ym) cur = it;
    return { salary: Number(cur.salary) || 0, insSalary: Number(cur.insSalary) || 0, from: cur.from };
  }
  /** Ghi nhận mức lương mới áp dụng từ tháng fromYm; các tháng trước giữ nguyên mức cũ */
  function setPayFrom(emp, fromYm, salary, insSalary) {
    let h = (emp.salaryHistory || []).map((it) => ({ ...it }));
    if (!h.length) h = [{ from: '0000-00', salary: Number(emp.salary) || 0, insSalary: Number(emp.insSalary) || 0 }];
    h = h.filter((it) => it.from !== fromYm);
    h.push({ from: fromYm, salary, insSalary });
    h.sort((a, b) => a.from.localeCompare(b.from));
    // gộp các mốc liền nhau trùng mức lương
    h = h.filter((it, i) => i === 0 || it.salary !== h[i - 1].salary || it.insSalary !== h[i - 1].insSalary);
    emp.salaryHistory = h;
    const last = h[h.length - 1]; emp.salary = last.salary; emp.insSalary = last.insSalary;
    return emp;
  }

  /** Tính lương 1 nhân viên / 1 tháng — mọi khoản lấy trực tiếp từ dữ liệu các module */
  function computeRow(S, emp, ym, M, cal) {
    M = M || emptyMonth(); cal = cal || calendar(S, ym);
    const sum = summarize(S, ym, (M.att || {})[emp.id], cal);
    const pay = payAt(emp, ym); const salary = pay.salary; const std = cal.std;
    const hourly = std > 0 ? salary / std / (S.stdHours || 8) : 0;
    const base = std > 0 ? r0(salary / std * sum.paidCong) : 0;

    const lateList = (M.late || []).filter((x) => x.empId === emp.id);
    const lateMin = lateList.reduce((a, x) => a + (Number(x.minutes) || 0), 0);
    const lateDed = r0(hourly * lateMin / 60);

    const otList = (M.ot || []).filter((x) => x.empId === emp.id);
    const otMin = { weekday: 0, weeklyOff: 0, holiday: 0 }; let otRaw = 0;
    for (const o of otList) { const k = otKind(S, o.date); const mins = Number(o.minutes) || 0; otMin[k] += mins; otRaw += hourly * mins / 60 * otRate(S, o.date) / 100; }
    const otPay = r0(otRaw);

    const al = (M.allow || {})[emp.id] || {};
    const ccBase = sum.worked + sum.holidaysPaid + (S.leaveKeepsCC ? sum.P : 0);
    const ccAuto = std > 0 && ccBase >= std - EPS && !(S.lateBreaksCC && lateMin > 0);
    const ccMode = al.cc || 'auto';
    const ccGet = ccMode === 'grant' ? true : ccMode === 'deny' ? false : ccAuto;
    const cc = ccGet ? (Number(S.ccAmount) || 0) : 0;
    const fuel = (al.fuel !== undefined && al.fuel !== null && al.fuel !== '') ? Number(al.fuel) || 0 : (Number(emp.fuelDefault) || 0);

    const bonusList = (M.bonus || []).filter((x) => x.empId === emp.id);
    const bonus = bonusList.reduce((a, x) => a + (Number(x.amount) || 0), 0);

    const gross = base - lateDed + otPay + cc + fuel + bonus;

    let ins = { base: 0, bhxh: 0, bhyt: 0, bhtn: 0, total: 0, applied: false, rates: null };
    if (S.insEnabled && emp.insJoin) {
      const rates = emp.insCustom && emp.insRates ? emp.insRates : S.insRates;
      const insBase = pay.insSalary + (S.ccBhxh ? cc : 0) + (S.fuelBhxh ? fuel : 0) +
        bonusList.filter((b) => b.bhxh).reduce((a, b) => a + (Number(b.amount) || 0), 0);
      const bhxh = r0(insBase * (Number(rates.bhxh) || 0) / 100);
      const bhyt = r0(insBase * (Number(rates.bhyt) || 0) / 100);
      const bhtn = r0(insBase * (Number(rates.bhtn) || 0) / 100);
      ins = { base: insBase, bhxh, bhyt, bhtn, total: bhxh + bhyt + bhtn, applied: true, rates: { ...rates } };
    }

    const dedList = (M.ded || []).filter((x) => x.empId === emp.id);
    const otherDed = dedList.filter((x) => x.confirmed).reduce((a, x) => a + (Number(x.amount) || 0), 0);
    const pendingDed = dedList.filter((x) => !x.confirmed).reduce((a, x) => a + (Number(x.amount) || 0), 0);
    const advList = (M.adv || []).filter((x) => x.empId === emp.id);
    const adv = advList.reduce((a, x) => a + (Number(x.amount) || 0), 0);

    const net = gross - ins.total - otherDed - adv;
    return {
      empId: emp.id, code: emp.code, name: emp.name, position: emp.position || '',
      salary, std, sum, worked: sum.worked, paidCong: sum.paidCong, hourly,
      base, lateMin, lateDed, otMin, otPay, ccAuto, ccMode, cc, fuel, bonus, gross,
      ins, otherDed, pendingDed, adv, advCount: advList.length, net,
      bonusItems: bonusList.map((b) => ({ name: b.name, amount: Number(b.amount) || 0, bhxh: !!b.bhxh })),
      dedItems: dedList.filter((x) => x.confirmed).map((d) => ({ name: d.name, amount: Number(d.amount) || 0 })),
    };
  }

  const TOTAL_KEYS = ['salary', 'base', 'lateDed', 'otPay', 'cc', 'fuel', 'bonus', 'gross', 'insTotal', 'otherDed', 'adv', 'net', 'lateMin'];
  function totals(rows) {
    const t = {}; TOTAL_KEYS.forEach((k) => (t[k] = 0));
    for (const r of rows) { TOTAL_KEYS.forEach((k) => (t[k] += k === 'insTotal' ? r.ins.total : r[k])); }
    t.count = rows.length; return t;
  }

  function livePayroll(S, employees, ym, M) {
    M = M || emptyMonth(); const cal = calendar(S, ym);
    const rows = employees.filter((e) => empInMonth(e, ym, M)).sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map((e) => computeRow(S, e, ym, M, cal));
    return { rows, totals: totals(rows), std: cal.std, live: true };
  }
  /** Bảng lương: nếu đã chốt thì dùng ảnh chụp tại thời điểm chốt (không bị thay đổi bởi dữ liệu sau này) */
  function payroll(S, employees, ym, M) {
    if (M && M.status === 'locked' && M.snapshot) return { rows: M.snapshot.rows, totals: totals(M.snapshot.rows), std: M.snapshot.std, live: false, lockedAt: M.snapshot.lockedAt };
    return livePayroll(S, employees, ym, M);
  }

  /* ---------- Đọc số tiền bằng chữ ---------- */
  const DG = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  function read3(n, full) {
    const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), u = n % 10; const out = [];
    if (full || h > 0) out.push(DG[h] + ' trăm');
    if (t > 1) { out.push(DG[t] + ' mươi'); if (u === 1) out.push('mốt'); else if (u === 5) out.push('lăm'); else if (u > 0) out.push(DG[u]); }
    else if (t === 1) { out.push('mười'); if (u === 5) out.push('lăm'); else if (u > 0) out.push(DG[u]); }
    else if (u > 0) { if (full || h > 0) out.push('lẻ'); out.push(DG[u]); }
    return out.join(' ');
  }
  function moneyWords(num) {
    num = Math.round(Math.abs(Number(num) || 0)); if (num === 0) return 'Không đồng';
    const units = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ']; const groups = [];
    while (num > 0) { groups.push(num % 1000); num = Math.floor(num / 1000); }
    const parts = [];
    for (let i = groups.length - 1; i >= 0; i--) { if (groups[i] === 0) continue; parts.push(read3(groups[i], i < groups.length - 1) + units[i]); }
    const s = parts.join(' ').replace(/\s+/g, ' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1) + ' đồng';
  }

  /* ---------- Dữ liệu mẫu (tháng hiện tại + 2 tháng trước đã chốt) ---------- */
  function buildSample(curYm) {
    const S = defaultSettings();
    S.taxCode = '3400353100';
    S.companyAddress = 'A55 Hùng Vương, phường Phú Thủy, tỉnh Lâm Đồng';
    const Y = ymParts(curYm).y;
    S.holidays = [
      { date: Y + '-01-01', name: 'Tết Dương lịch' },
      { date: Y + '-04-30', name: 'Ngày Giải phóng miền Nam' },
      { date: Y + '-05-01', name: 'Quốc tế Lao động' },
      { date: Y + '-09-01', name: 'Quốc khánh (nghỉ liền kề)' },
      { date: Y + '-09-02', name: 'Quốc khánh' },
    ];
    const E = (id, code, name, o) => Object.assign({ id, code, name, dob: '', gender: 'Nam', address: '', cccd: '', cccdDate: '', cccdPlace: 'Cục CS QLHC về TTXH', phone: '', position: '', startDate: '2023-03-01', salary: 0, insSalary: 0, insJoin: false, insCustom: false, insRates: { bhxh: 8, bhyt: 1.5, bhtn: 1 }, fuelDefault: 0, status: 'active', leftDate: '', note: '' }, o);
    const employees = [
      E('e001', 'NV001', 'Nguyễn Văn An', { dob: '1985-04-12', address: '12 Lê Văn Sỹ, P.13, Q.3, TP.HCM', cccd: '079085001234', cccdDate: '2021-06-15', phone: '0903 112 233', position: 'Quản lý xưởng', startDate: '2019-02-01', salary: 15000000, insSalary: 6000000, insJoin: true, fuelDefault: 300000 }),
      E('e002', 'NV002', 'Trần Thị Bình', { gender: 'Nữ', dob: '1990-09-23', address: '45 Nguyễn Trãi, P.2, Q.5, TP.HCM', cccd: '079190004567', cccdDate: '2021-08-02', phone: '0912 445 667', position: 'Kế toán', startDate: '2020-07-15', salary: 12000000, insSalary: 5500000, insJoin: true }),
      E('e003', 'NV003', 'Lê Văn Cường', { dob: '1995-01-30', address: '88 Quang Trung, P.10, Gò Vấp, TP.HCM', cccd: '079095007890', cccdDate: '2022-01-10', phone: '0938 778 899', position: 'Thợ sơn', startDate: '2022-03-01', salary: 9000000 }),
      E('e004', 'NV004', 'Phạm Thị Dung', { gender: 'Nữ', dob: '1993-11-05', address: '21 Phan Đăng Lưu, P.3, Bình Thạnh, TP.HCM', cccd: '079193002468', cccdDate: '2021-12-20', phone: '0977 246 810', position: 'Thợ mỹ thuật', startDate: '2021-05-10', salary: 10000000, insSalary: 5000000, insJoin: true }),
      E('e005', 'NV005', 'Hoàng Văn Em', { dob: '1997-06-18', address: '9 Lý Thường Kiệt, P.7, Tân Bình, TP.HCM', cccd: '079097001357', cccdDate: '2022-04-04', phone: '0988 135 790', position: 'Thợ thi công', startDate: '2022-09-01', salary: 9500000, fuelDefault: 500000 }),
      E('e006', 'NV006', 'Võ Thị Phương', { gender: 'Nữ', dob: '1996-02-14', address: '150 Cách Mạng Tháng 8, P.10, Q.3, TP.HCM', cccd: '079196008642', cccdDate: '2022-02-25', phone: '0909 864 202', position: 'Thiết kế', startDate: '2023-01-03', salary: 11000000, insSalary: 5500000, insJoin: true }),
      E('e007', 'NV007', 'Đỗ Văn Giang', { dob: '1992-08-08', address: '3 Võ Văn Ngân, Thủ Đức, TP.HCM', cccd: '079092009753', cccdDate: '2021-10-11', phone: '0918 975 310', position: 'Thợ thi công', startDate: '2021-01-04', salary: 8500000, status: 'left', leftDate: addMonths(curYm, -2) + '-30' }),
    ];
    let seq = 0; const id = (p) => p + (++seq).toString(36) + 's';
    const months = {};
    const workDaysOf = (ym) => calendar(S, ym).days.filter((d) => d.kind === 'work').map((d) => d.d);
    const firstDow = (ym, w) => calendar(S, ym).days.find((d) => d.dow === w).d;

    function fullAtt(ym, emps) { const att = {}; const wd = workDaysOf(ym); emps.forEach((e) => { att[e.id] = {}; wd.forEach((d) => (att[e.id][d] = 1)); }); return att; }

    // --- 2 tháng trước: dữ liệu đủ, đã chốt ---
    for (const k of [-2, -1]) {
      const ym = addMonths(curYm, k); const M = emptyMonth();
      const emps = employees.filter((e) => e.status === 'active' || (k === -2 && e.id === 'e007'));
      M.att = fullAtt(ym, emps); const wd = workDaysOf(ym);
      if (k === -2) { M.att.e003[wd[5]] = 'P'; M.att.e005[wd[11]] = 0.5; }
      else { M.att.e004[wd[8]] = 'K'; M.att.e002[wd[3]] = 'P'; }
      M.ot.push({ id: id('o'), empId: 'e005', date: dstr(ym, wd[6]), minutes: 90, note: 'Lắp đặt tranh tường' });
      M.ot.push({ id: id('o'), empId: 'e001', date: dstr(ym, firstDow(ym, 0)), minutes: 180, note: 'Hoàn thiện công trình' });
      M.adv.push({ id: id('a'), empId: 'e003', date: dstr(ym, 8), week: 2, amount: 1500000, note: '' });
      M.adv.push({ id: id('a'), empId: 'e002', date: dstr(ym, 15), week: 3, amount: 1000000, note: '' });
      if (k === -1) M.bonus.push({ id: id('b'), empId: 'e004', name: 'Thưởng hiệu suất', type: 'Thưởng hiệu suất', amount: 500000, bhxh: false, note: 'Hoàn thành sớm tiến độ' });
      M.late.push({ id: id('l'), empId: 'e006', date: dstr(ym, wd[2]), minutes: 15, note: '' });
      const pr = livePayroll(S, employees, ym, M);
      M.status = 'locked'; M.snapshot = { rows: pr.rows, std: pr.std, lockedAt: dstr(addMonths(ym, 1), 5) + 'T09:00:00' };
      M.log = [{ t: M.snapshot.lockedAt, action: 'Chốt lương', note: 'Chốt lương tháng ' + ym, net: pr.totals.net }];
      months[ym] = M;
    }

    // --- Tháng hiện tại: các tình huống kiểm thử ---
    const ym = curYm; const M = emptyMonth(); const wd = workDaysOf(ym);
    const active = employees.filter((e) => e.status === 'active');
    M.att = fullAtt(ym, active);
    M.att.e002[wd[9]] = 0.5;                                        // NV002: thiếu 0,5 công
    [wd[3], wd[4], wd[5]].forEach((d) => (M.att.e003[d] = 'K'));      // NV003: nghỉ nhiều ngày
    M.att.e003[wd[12]] = 0; M.att.e003[wd[15]] = 'P'; M.att.e003[wd[16]] = 'P';
    M.att.e006[wd[1]] = { i: '07:30', o: '16:30' };                 // NV006: chấm giờ vào/ra
    M.att.e006[wd[2]] = { i: '08:00', o: '16:30' };
    M.att.e006[wd[7]] = { i: '07:25', o: '16:35' };
    const wed = firstDow(ym, 3), sun = firstDow(ym, 0);
    M.ot.push({ id: id('o'), empId: 'e001', date: dstr(ym, wed), minutes: 120, note: 'Thi công biển hiệu – Thứ 4' });
    M.ot.push({ id: id('o'), empId: 'e004', date: dstr(ym, sun), minutes: 120, note: 'Vẽ tranh tường – Chủ nhật' });
    M.late.push({ id: id('l'), empId: 'e004', date: dstr(ym, wd[4]), minutes: 10, note: '' });
    M.late.push({ id: id('l'), empId: 'e004', date: dstr(ym, wd[10]), minutes: 20, note: 'Kẹt xe' });
    M.bonus.push({ id: id('b'), empId: 'e005', name: 'Thưởng công trình', type: 'Thưởng công trình', amount: 1000000, bhxh: false, note: 'Công trình trường MN Hoa Sen' });
    [[3, 1000000], [10, 1500000], [17, 500000]].forEach(([d, a]) => M.adv.push({ id: id('a'), empId: 'e002', date: dstr(ym, d), week: weekOfMonth(dstr(ym, d)), amount: a, note: '' }));
    M.adv.push({ id: id('a'), empId: 'e003', date: dstr(ym, 12), week: weekOfMonth(dstr(ym, 12)), amount: 2000000, note: 'Việc gia đình' });
    M.ded.push({ id: id('d'), empId: 'e006', name: 'Tiền đồng phục', amount: 150000, confirmed: true, note: 'Đã ký xác nhận' });
    M.ded.push({ id: id('d'), empId: 'e006', name: 'Bồi thường dụng cụ hỏng', amount: 300000, confirmed: false, note: 'Chờ giám đốc duyệt' });
    M.status = 'review';
    M.log = [{ t: new Date().toISOString(), action: 'Tính lương', note: 'Khởi tạo từ dữ liệu mẫu' }];
    months[ym] = M;
    return { settings: S, employees, months };
  }

  root.Engine = { pad, ymParts, daysIn, dstr, dow, addMonths, ymOf, dayOf, weekOfMonth, toMin, defaultSettings, emptyMonth,
    payAt, setPayFrom, isWorkDow, holidayOf, dayKind, calendar, timeHours, cellCong, summarize, otKind, otRate, empInMonth, computeRow,
    totals, livePayroll, payroll, moneyWords, buildSample };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Engine; // dùng chung cho máy chủ (Node)
})(typeof window !== 'undefined' ? window : globalThis);
