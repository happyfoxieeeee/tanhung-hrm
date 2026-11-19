require('../public/assets/engine.js');
const E = globalThis.Engine;
let fails = 0;
const eq = (label, got, exp) => { const ok = Math.abs(got - exp) < 1e-6; if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + label + ': ' + got + (ok ? '' : ' (kỳ vọng ' + exp + ')')); };

const ym = '2026-11';
const D = E.buildSample(ym);
const S = D.settings, M = D.months[ym];
const cal = E.calendar(S, ym);
eq('Công chuẩn T11/2026 (30 ngày - 5 CN)', cal.std, 25);
eq('Công chuẩn T10/2026', E.calendar(S, '2026-10').std, 27);
eq('Công chuẩn T9/2026 (26 T2-T7, trừ lễ 1,2/9)', E.calendar(S, '2026-09').std, 24);
eq('Công chuẩn T9 khi lễ tính hưởng lương', E.calendar({ ...S, holidayMode: 'paid' }, '2026-09').std, 26);

const P = E.livePayroll(S, D.employees, ym, M);
const R = Object.fromEntries(P.rows.map((r) => [r.empId, r]));
eq('Số NV trong bảng lương T11 (NV007 đã nghỉ bị loại)', P.rows.length, 6);

// NV001 đủ công, tăng ca 120' thứ 4, chuyên cần, BH
eq('NV001 lương giờ', R.e001.hourly, 75000);
eq('NV001 lương theo công', R.e001.base, 15000000);
eq('NV001 tăng ca thứ 4 (75.000×2×150%)', R.e001.otPay, 225000);
eq('NV001 chuyên cần', R.e001.cc, 200000);
eq('NV001 tổng thu nhập', R.e001.gross, 15725000);
eq('NV001 BH NLĐ 10,5% × 6tr', R.e001.ins.total, 630000);
eq('NV001 thực lĩnh', R.e001.net, 15095000);

// NV002 thiếu 0,5 công, ứng 3 lần
eq('NV002 công thực tế', R.e002.paidCong, 24.5);
eq('NV002 lương theo công 12tr/25×24,5', R.e002.base, 11760000);
eq('NV002 không chuyên cần', R.e002.cc, 0);
eq('NV002 tổng ứng 3 lần', R.e002.adv, 3000000);
eq('NV002 số lần ứng', R.e002.advCount, 3);
eq('NV002 thực lĩnh', R.e002.net, 8182500);

// NV003 nghỉ nhiều ngày
eq('NV003 công đi làm', R.e003.worked, 19);
eq('NV003 công hưởng lương (+2 phép)', R.e003.paidCong, 21);
eq('NV003 tổng công nghỉ', R.e003.sum.absent, 6);
eq('NV003 nghỉ không lương', R.e003.sum.K, 3);
eq('NV003 lương theo công', R.e003.base, 7560000);
eq('NV003 thực lĩnh', R.e003.net, 5560000);

// NV004 đi trễ 30' (2 lần 10+20), tăng ca CN 120'
eq('NV004 tổng phút trễ cộng dồn', R.e004.lateMin, 30);
eq('NV004 tiền trừ trễ 50.000×30/60', R.e004.lateDed, 25000);
eq('NV004 tăng ca CN 50.000×2×200%', R.e004.otPay, 200000);
eq('NV004 chuyên cần (trễ không mất CC theo cài đặt)', R.e004.cc, 200000);
eq('NV004 thực lĩnh', R.e004.net, 9850000);

// NV005 xăng xe + thưởng công trình
eq('NV005 xăng xe', R.e005.fuel, 500000);
eq('NV005 thưởng', R.e005.bonus, 1000000);
eq('NV005 tổng thu nhập', R.e005.gross, 11200000);
eq('NV005 không BH (chưa cấu hình tham gia)', R.e005.ins.total, 0);

// NV006 chấm giờ vào/ra, khấu trừ đã/không xác nhận
eq('NV006 công (22 + 1 + 0,9375 + 1)', R.e006.worked, 24.9375);
eq('NV006 lương theo công', R.e006.base, 10972500);
eq('NV006 khấu trừ chỉ khoản đã xác nhận', R.e006.otherDed, 150000);
eq('NV006 khoản chờ xác nhận không áp dụng', R.e006.pendingDed, 300000);
eq('NV006 thực lĩnh', R.e006.net, 10245000);

// Tổng cộng phải bằng tổng từng dòng (không tính trùng)
const sumNet = P.rows.reduce((a, r) => a + r.net, 0);
eq('Tổng thực lĩnh = Σ dòng', P.totals.net, sumNet);
const advAll = M.adv.reduce((a, x) => a + x.amount, 0);
eq('Tổng ứng bảng lương = Σ phiếu ứng tháng', P.totals.adv, advAll);
// Ứng lương tháng trước không bị trừ vào tháng này
const prevAdv = D.months['2026-10'].adv.filter((x) => x.empId === 'e002').reduce((a, x) => a + x.amount, 0);
eq('Ứng T10 của NV002 không bị trừ lại ở T11', R.e002.adv, 3000000);
console.log('  (ứng T10 NV002 = ' + prevAdv + ', nằm riêng trong T10)');
// Công thức thực lĩnh nhất quán
P.rows.forEach((r) => eq(r.code + ' thực lĩnh = TN − BH − KT − ứng', r.net, r.gross - r.ins.total - r.otherDed - r.adv));
// Bảng lương đã chốt không đổi khi đổi lương hồ sơ
const emps2 = D.employees.map((e) => (e.id === 'e001' ? { ...e, salary: 99000000 } : e));
const locked = E.payroll(S, emps2, '2026-10', D.months['2026-10']);
eq('T10 đã chốt giữ nguyên lương NV001 khi hồ sơ đổi', locked.rows.find((r) => r.empId === 'e001').salary, 15000000);
// Lịch sử lương: tăng lương từ T11 không ảnh hưởng T10 (kể cả khi T10 chưa chốt)
const e1 = JSON.parse(JSON.stringify(D.employees.find((e) => e.id === 'e001')));
E.setPayFrom(e1, '2026-11', 18000000, 7000000);
const M10open = { ...D.months['2026-10'], status: 'review', snapshot: null };
eq('Tăng lương từ T11: T10 (chưa chốt) vẫn lương cũ', E.computeRow(S, e1, '2026-10', M10open).salary, 15000000);
eq('Tăng lương từ T11: T11 dùng lương mới', E.computeRow(S, e1, '2026-11', M).salary, 18000000);
eq('BH T11 theo mức đóng mới 7tr × 10,5%', E.computeRow(S, e1, '2026-11', M).ins.total, 735000);
eq('BH T10 theo mức đóng cũ 6tr', E.computeRow(S, e1, '2026-10', M10open).ins.total, 630000);
eq('Hồ sơ hiển thị lương hiện hành', e1.salary, 18000000);
E.setPayFrom(e1, '2027-01', 20000000, 7000000);
eq('T12 vẫn 18tr khi đã có mốc 01/2027', E.payAt(e1, '2026-12').salary, 18000000);
eq('Số mốc lịch sử', e1.salaryHistory.length, 3);
// Thời gian
eq('Giờ 07:30–16:30 trừ nghỉ trưa', E.timeHours(S, '07:30', '16:30'), 8);
console.log('Bằng chữ: ' + E.moneyWords(15095000) + ' | ' + E.moneyWords(8182500) + ' | ' + E.moneyWords(1005000));
console.log(fails ? '\n' + fails + ' LỖI' : '\nTẤT CẢ ĐẠT');
process.exit(fails ? 1 : 0);
