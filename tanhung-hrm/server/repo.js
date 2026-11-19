'use strict';
/**
 * Tầng dữ liệu HRM: đọc/ghi PostgreSQL, kiểm tra dữ liệu đầu vào, chốt/mở khóa bảng lương (tính lại ở máy chủ),
 * sao lưu/khôi phục và nhật ký thay đổi. Dữ liệu trả về có cùng cấu trúc với prototype để giữ nguyên giao diện.
 */
const E = require('../public/assets/engine.js');
const { HttpError } = require('./http');

/* ---------- Kiểm tra & làm sạch dữ liệu ---------- */
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const clean = (s, max = 500) => (s == null ? '' : String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max));
const dateOrNull = (s) => { const v = clean(s, 10); if (!v) return null; if (!DATE.test(v) || isNaN(Date.parse(v + 'T00:00:00Z'))) throw new HttpError(400, 'Ngày không hợp lệ: ' + v); return v; };
const money = (v, { min = 0, allowNull = false } = {}) => {
  if (allowNull && (v === null || v === undefined || v === '')) return null;
  const n = Number(v); if (!Number.isFinite(n) || !Number.isInteger(Math.round(n)) || n < min || n > 1e12) throw new HttpError(400, 'Số tiền không hợp lệ: ' + v);
  return Math.round(n);
};
const intIn = (v, a, b, label) => { const n = Number(v); if (!Number.isInteger(n) || n < a || n > b) throw new HttpError(400, `${label} không hợp lệ: ${v}`); return n; };
const checkYm = (ym) => { if (!YM.test(String(ym))) throw new HttpError(400, 'Tháng không hợp lệ'); return ym; };
const checkId = (id) => { if (!ID.test(String(id || ''))) throw new HttpError(400, 'Mã bản ghi không hợp lệ'); return String(id); };
const nextMonthStart = (ym) => E.addMonths(ym, 1) + '-01';
const pad = E.pad;

async function audit(c, action, entity, entityId, summary, detail, ip) {
  await c.query('INSERT INTO audit_log (action, entity, entity_id, summary, detail, ip) VALUES ($1,$2,$3,$4,$5,$6)', [action, entity, entityId, summary, detail ? JSON.stringify(detail) : null, ip || null]);
}

/* ---------- Cài đặt ---------- */
function sanitizeSettings(input) {
  if (!input || typeof input !== 'object') throw new HttpError(400, 'Cài đặt không hợp lệ');
  const d = E.defaultSettings(); const s = { ...d };
  for (const k of ['company', 'companyAddress', 'companyPhone', 'taxCode', 'codePrefix']) if (input[k] !== undefined) s[k] = clean(input[k], 200);
  for (const k of ['workStart', 'workEnd', 'lunchStart', 'lunchEnd']) if (input[k] !== undefined) { const v = clean(input[k], 5); if (!/^\d{2}:\d{2}$/.test(v)) throw new HttpError(400, 'Giờ không hợp lệ: ' + k); s[k] = v; }
  for (const k of ['paidLeave', 'leaveKeepsCC', 'lateBreaksCC', 'ccBhxh', 'fuelBhxh', 'insEnabled']) if (input[k] !== undefined) s[k] = !!input[k];
  if (input.holidayMode !== undefined) s.holidayMode = input.holidayMode === 'paid' ? 'paid' : 'excluded';
  if (input.stdHours !== undefined) { const v = Number(input.stdHours); if (!(v >= 1 && v <= 24)) throw new HttpError(400, 'Số giờ chuẩn không hợp lệ'); s.stdHours = v; }
  if (input.ccAmount !== undefined) s.ccAmount = money(input.ccAmount);
  if (Array.isArray(input.workDows)) { const w = [...new Set(input.workDows.map(Number).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6))].sort(); if (!w.length) throw new HttpError(400, 'Cần ít nhất một ngày làm việc'); s.workDows = w; }
  if (input.otRates) s.otRates = { weekday: rate(input.otRates.weekday, d.otRates.weekday), weeklyOff: rate(input.otRates.weeklyOff, d.otRates.weeklyOff), holiday: rate(input.otRates.holiday, d.otRates.holiday) };
  if (input.insRates) s.insRates = insRates(input.insRates);
  if (Array.isArray(input.holidays)) {
    const seen = new Set(); s.holidays = [];
    for (const h of input.holidays.slice(0, 400)) { const date = dateOrNull(h && h.date); if (!date || seen.has(date)) continue; seen.add(date); s.holidays.push({ date, name: clean(h.name, 120) || 'Ngày nghỉ' }); }
  }
  if (Array.isArray(input.bonusTypes)) s.bonusTypes = input.bonusTypes.map((x) => clean(x, 60)).filter(Boolean).slice(0, 30);
  return s;
}
function rate(v, d) { const n = Number(v ?? d); if (!(n >= 100 && n <= 1000)) throw new HttpError(400, 'Hệ số tăng ca phải từ 100% đến 1000%'); return n; }
function insRates(r) { const f = (v) => { const n = Number(v); if (!(n >= 0 && n <= 50)) throw new HttpError(400, 'Tỷ lệ bảo hiểm không hợp lệ'); return n; }; return { bhxh: f(r.bhxh), bhyt: f(r.bhyt), bhtn: f(r.bhtn) }; }

async function saveSettings(c, input, ctx = {}) {
  const s = sanitizeSettings(input);
  const before = (await c.query('SELECT data FROM app_settings WHERE id = 1')).rows[0];
  await c.query(`INSERT INTO app_settings (id, data, initialized, updated_at) VALUES (1, $1, true, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, initialized = true, updated_at = now()`, [s]);
  const changed = before ? Object.keys(s).filter((k) => JSON.stringify(s[k]) !== JSON.stringify(before.data[k])) : ['khởi tạo'];
  if (changed.length) await audit(c, 'settings.update', 'settings', '1', 'Cập nhật cài đặt: ' + changed.join(', '), null, ctx.ip);
  return s;
}

/* ---------- Nhân sự ---------- */
function sanitizeEmployee(e) {
  if (!e || typeof e !== 'object') throw new HttpError(400, 'Hồ sơ nhân viên không hợp lệ');
  const name = clean(e.name, 120); if (!name) throw new HttpError(400, 'Thiếu họ tên nhân viên');
  const code = clean(e.code, 32); if (!code) throw new HttpError(400, 'Thiếu mã nhân viên: ' + name);
  const cccd = clean(e.cccd, 12).replace(/\D/g, ''); if (cccd && !/^\d{9,12}$/.test(cccd)) throw new HttpError(400, 'Số CCCD không hợp lệ: ' + name);
  const hist = Array.isArray(e.salaryHistory) ? e.salaryHistory.slice(0, 200).map((h) => {
    const from = clean(h.from, 7); if (from !== '0000-00' && !YM.test(from)) throw new HttpError(400, 'Mốc lương không hợp lệ: ' + name);
    return { from, salary: money(h.salary), insSalary: money(h.insSalary || 0) };
  }) : [];
  return {
    id: checkId(e.id), code, name, dob: dateOrNull(e.dob), gender: clean(e.gender, 10) || null, address: clean(e.address, 300) || null,
    cccd: cccd || null, cccd_date: dateOrNull(e.cccdDate), cccd_place: clean(e.cccdPlace, 120) || null, phone: clean(e.phone, 30) || null,
    position: clean(e.position, 80) || null, start_date: dateOrNull(e.startDate), salary: money(e.salary), ins_salary: money(e.insSalary || 0),
    ins_join: !!e.insJoin, ins_custom: !!e.insCustom, ins_rates: e.insRates ? insRates(e.insRates) : null, fuel_default: money(e.fuelDefault || 0),
    status: e.status === 'left' ? 'left' : 'active', left_date: dateOrNull(e.leftDate), note: clean(e.note, 1000) || null, hist,
  };
}
const EMP_COLS = 'id text, code text, name text, dob date, gender text, address text, cccd text, cccd_date date, cccd_place text, phone text, position text, start_date date, salary bigint, ins_salary bigint, ins_join boolean, ins_custom boolean, ins_rates jsonb, fuel_default bigint, status text, left_date date, note text';
const EMP_FIELDS = ['code', 'name', 'dob', 'gender', 'address', 'cccd', 'cccd_date', 'cccd_place', 'phone', 'position', 'start_date', 'salary', 'ins_salary', 'ins_join', 'ins_custom', 'ins_rates', 'fuel_default', 'status', 'left_date', 'note'];

async function saveEmployees(c, list, ctx = {}) {
  if (!Array.isArray(list) || list.length > 2000) throw new HttpError(400, 'Danh sách nhân viên không hợp lệ');
  const rows = list.map(sanitizeEmployee);
  const codes = new Map(); for (const r of rows) { if (codes.has(r.code)) throw new HttpError(409, `Trùng mã nhân viên ${r.code} (${codes.get(r.code)} và ${r.name})`); codes.set(r.code, r.name); }
  const ids = new Set(rows.map((r) => r.id)); if (ids.size !== rows.length) throw new HttpError(409, 'Trùng mã định danh nhân viên');
  const before = (await c.query('SELECT * FROM employees WHERE deleted_at IS NULL')).rows; const byId = new Map(before.map((b) => [b.id, b]));
  const removed = before.filter((b) => !ids.has(b.id));
  // xóa mềm trước để giải phóng mã cho trường hợp đổi mã
  if (removed.length) await c.query('UPDATE employees SET deleted_at = now(), updated_at = now() WHERE id = ANY(string_to_array($1, \',\')) AND deleted_at IS NULL', [removed.map((r) => r.id).join(',')]);
  const changedRows = rows.filter((r) => { const b = byId.get(r.id); return !b || EMP_FIELDS.some((f) => normCmp(b[f]) !== normCmp(r[f])); });
  if (changedRows.length) {
    // tạm đổi mã các NV sẽ đổi mã để tránh vướng ràng buộc duy nhất khi hoán đổi mã
    await c.query(`UPDATE employees SET code = '~' || id WHERE id = ANY(string_to_array($1, ',')) AND deleted_at IS NULL`, [changedRows.filter((r) => byId.has(r.id) && byId.get(r.id).code !== r.code).map((r) => r.id).join(',') || '~']);
    try {
      await c.query(`INSERT INTO employees (${EMP_FIELDS.join(', ')}, id) SELECT ${EMP_FIELDS.join(', ')}, id FROM jsonb_to_recordset($1::jsonb) AS x(${EMP_COLS})
        ON CONFLICT (id) DO UPDATE SET ${EMP_FIELDS.map((f) => `${f} = EXCLUDED.${f}`).join(', ')}, deleted_at = NULL, updated_at = now()`, [changedRows.map(({ hist, ...r }) => r)]);
    } catch (e) { if (e.code === '23505') throw new HttpError(409, 'Mã nhân viên đã tồn tại'); throw e; }
  }
  // lịch sử mức lương
  const histRows = []; for (const r of rows) for (const h of r.hist) histRows.push({ employee_id: r.id, from_month: h.from, salary: h.salary, ins_salary: h.insSalary });
  const histBefore = (await c.query('SELECT employee_id, from_month, salary, ins_salary FROM salary_history ORDER BY employee_id, from_month')).rows;
  const key = (a) => a.map((h) => `${h.employee_id}|${h.from_month}|${h.salary}|${h.ins_salary}`).sort().join(';');
  const relevantBefore = histBefore.filter((h) => ids.has(h.employee_id));
  if (key(relevantBefore) !== key(histRows)) {
    await c.query('DELETE FROM salary_history WHERE employee_id = ANY(string_to_array($1, \',\'))', [[...ids].join(',') || '~']);
    if (histRows.length) await c.query('INSERT INTO salary_history (employee_id, from_month, salary, ins_salary) SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(employee_id text, from_month text, salary bigint, ins_salary bigint)', [histRows]);
  }
  for (const r of changedRows) {
    const b = byId.get(r.id);
    if (!b) await audit(c, 'employee.create', 'employee', r.id, `Thêm nhân viên ${r.code} ${r.name}`, null, ctx.ip);
    else { const diff = EMP_FIELDS.filter((f) => normCmp(b[f]) !== normCmp(r[f])); await audit(c, 'employee.update', 'employee', r.id, `Sửa hồ sơ ${r.code} ${r.name}: ${diff.join(', ')}`, Object.fromEntries(diff.map((f) => [f, { truoc: b[f], sau: r[f] }])), ctx.ip); }
  }
  for (const r of removed) await audit(c, 'employee.delete', 'employee', r.id, `Xóa nhân viên ${r.code} ${r.name}`, null, ctx.ip);
  return { added: changedRows.filter((r) => !byId.has(r.id)).length, updated: changedRows.filter((r) => byId.has(r.id)).length, removed: removed.length };
}
// So sánh ổn định: jsonb của PostgreSQL sắp xếp lại khóa, nên chuẩn hóa thứ tự khóa trước khi so sánh
const stable = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}') : JSON.stringify(v));
function normCmp(v) { if (v === null || v === undefined || v === '') return ''; if (typeof v === 'object') return stable(v); return String(v); }

/* ---------- Dữ liệu tháng ---------- */
async function activeEmployeeIds(c) { return new Set((await c.query('SELECT id FROM employees WHERE deleted_at IS NULL')).rows.map((r) => r.id)); }

function sanitizeMonth(ym, m, empIds) {
  if (!m || typeof m !== 'object') throw new HttpError(400, 'Dữ liệu tháng không hợp lệ');
  const n = E.daysIn(ym); const emp = (id) => { if (!empIds.has(id)) throw new HttpError(400, 'Nhân viên không tồn tại: ' + id); return id; };
  const inMonth = (d, label) => { const v = dateOrNull(d); if (!v || v.slice(0, 7) !== ym) throw new HttpError(400, `${label} phải thuộc tháng ${ym}`); return v; };
  const att = [];
  for (const [eid, days] of Object.entries(m.att || {})) {
    if (!days || typeof days !== 'object') continue; emp(eid);
    for (const [dk, v] of Object.entries(days)) {
      const d = intIn(dk, 1, n, 'Ngày công'); const work_date = `${ym}-${pad(d)}`;
      if (v === null || v === undefined || v === '') continue;
      if (v === 'P' || v === 'K') att.push({ employee_id: eid, work_date, kind: v, value: null, time_in: null, time_out: null });
      else if (typeof v === 'number') { if (!(v >= 0 && v <= 1)) throw new HttpError(400, 'Số công phải từ 0 đến 1'); att.push({ employee_id: eid, work_date, kind: 'num', value: Math.round(v * 10000) / 10000, time_in: null, time_out: null }); }
      else if (typeof v === 'object' && /^\d{2}:\d{2}$/.test(v.i) && /^\d{2}:\d{2}$/.test(v.o) && v.o > v.i) att.push({ employee_id: eid, work_date, kind: 'time', value: null, time_in: v.i, time_out: v.o });
      else throw new HttpError(400, 'Giá trị chấm công không hợp lệ');
    }
  }
  const list = (k) => (Array.isArray(m[k]) ? m[k] : []);
  const seen = new Set(); const uniq = (id) => { checkId(id); if (seen.has(id)) throw new HttpError(409, 'Bản ghi bị trùng: ' + id); seen.add(id); return id; };
  const late = list('late').map((x) => ({ id: uniq(x.id), employee_id: emp(x.empId), month: ym, work_date: x.date ? inMonth(x.date, 'Ngày đi trễ') : null, minutes: intIn(x.minutes, 1, 1440 * 31, 'Số phút trễ'), note: clean(x.note) || null }));
  const ot = list('ot').map((x) => ({ id: uniq(x.id), employee_id: emp(x.empId), month: ym, work_date: inMonth(x.date, 'Ngày tăng ca'), minutes: intIn(x.minutes, 1, 1440, 'Số phút tăng ca'), note: clean(x.note) || null }));
  const adv = list('adv').map((x) => { const d = inMonth(x.date, 'Ngày ứng'); return { id: uniq(x.id), employee_id: emp(x.empId), month: ym, advance_date: d, week: x.week ? intIn(x.week, 1, 5, 'Tuần') : E.weekOfMonth(d), amount: money(x.amount, { min: 1 }), note: clean(x.note) || null }; });
  const bonus = list('bonus').map((x) => ({ id: uniq(x.id), employee_id: emp(x.empId), month: ym, type: clean(x.type, 60) || null, name: clean(x.name, 120) || clean(x.type, 60) || 'Thưởng', amount: money(x.amount, { min: 1 }), bhxh: !!x.bhxh, note: clean(x.note) || null }));
  const ded = list('ded').map((x) => ({ id: uniq(x.id), employee_id: emp(x.empId), month: ym, name: clean(x.name, 120) || 'Khấu trừ', amount: money(x.amount, { min: 1 }), confirmed: !!x.confirmed, note: clean(x.note) || null }));
  const allow = Object.entries(m.allow || {}).filter(([, a]) => a && (a.cc || a.ccNote || (a.fuel !== undefined && a.fuel !== null && a.fuel !== ''))).map(([eid, a]) => ({
    employee_id: emp(eid), month: ym, cc_mode: ['auto', 'grant', 'deny'].includes(a.cc) ? a.cc : null, cc_note: clean(a.ccNote) || null, fuel: money(a.fuel, { allowNull: true }) }));
  return { att, late, ot, adv, bonus, ded, allow, status: ['none', 'review'].includes(m.status) ? m.status : null };
}

async function writeMonthData(c, ym, d) {
  const first = ym + '-01', next = nextMonthStart(ym);
  await c.query('DELETE FROM attendance WHERE work_date >= $1 AND work_date < $2', [first, next]);
  if (d.att.length) await c.query(`INSERT INTO attendance (employee_id, work_date, kind, value, time_in, time_out) SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(employee_id text, work_date date, kind text, value numeric, time_in time, time_out time)`, [d.att]);
  const tables = [
    ['late_records', d.late, 'id text, employee_id text, month text, work_date date, minutes int, note text'],
    ['overtime_records', d.ot, 'id text, employee_id text, month text, work_date date, minutes int, note text'],
    ['salary_advances', d.adv, 'id text, employee_id text, month text, advance_date date, week smallint, amount bigint, note text'],
    ['bonuses', d.bonus, 'id text, employee_id text, month text, type text, name text, amount bigint, bhxh boolean, note text'],
    ['deductions', d.ded, 'id text, employee_id text, month text, name text, amount bigint, confirmed boolean, note text'],
    ['monthly_allowances', d.allow, 'employee_id text, month text, cc_mode text, cc_note text, fuel bigint'],
  ];
  for (const [t, rows, cols] of tables) {
    await c.query(`DELETE FROM ${t} WHERE month = $1`, [ym]);
    if (rows.length) {
      try { await c.query(`INSERT INTO ${t} SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(${cols})`, [rows]); }
      catch (e) { if (e.code === '23505') throw new HttpError(409, 'Bản ghi đã tồn tại ở tháng khác (trùng mã) — không ghi nhận trùng'); throw e; }
    }
  }
}

async function saveMonth(c, ym, m, ctx = {}) {
  checkYm(ym);
  await c.query('INSERT INTO payroll_periods (month) VALUES ($1) ON CONFLICT (month) DO NOTHING', [ym]);
  const p = (await c.query('SELECT status FROM payroll_periods WHERE month = $1 FOR UPDATE', [ym])).rows[0];
  if (p.status === 'locked') throw new HttpError(409, `Tháng ${ym} đã chốt lương — mở khóa trước khi chỉnh sửa`, { code: 'LOCKED' });
  const empIds = await activeEmployeeIds(c);
  const d = sanitizeMonth(ym, m, empIds);
  const before = await monthCounts(c, ym);
  await writeMonthData(c, ym, d);
  const status = d.status || p.status;
  await c.query('UPDATE payroll_periods SET status = $2, updated_at = now() WHERE month = $1', [ym, status]);
  if (status === 'review' && p.status === 'none') await c.query('INSERT INTO payroll_events (month, action, note) VALUES ($1, $2, $3)', [ym, 'Tính lương', 'Tổng hợp dữ liệu và tính bảng lương']);
  const after = { att: d.att.length, late: d.late.length, ot: d.ot.length, adv: d.adv.length, bonus: d.bonus.length, ded: d.ded.length, allow: d.allow.length };
  const diff = Object.keys(after).filter((k) => after[k] !== before[k]).map((k) => `${LABEL[k]} ${before[k]}→${after[k]}`);
  await audit(c, 'month.update', 'payroll_period', ym, `Cập nhật dữ liệu tháng ${ym}${diff.length ? ': ' + diff.join(', ') : ''}`, null, ctx.ip);
  return loadMonth(c, ym);
}
const LABEL = { att: 'ô công', late: 'đi trễ', ot: 'tăng ca', adv: 'ứng lương', bonus: 'thưởng', ded: 'khấu trừ', allow: 'phụ cấp' };
async function monthCounts(c, ym) {
  const r = (await c.query(`SELECT
    (SELECT count(*) FROM attendance WHERE work_date >= $1::date AND work_date < $2::date)::int AS att,
    (SELECT count(*) FROM late_records WHERE month = $3)::int AS late, (SELECT count(*) FROM overtime_records WHERE month = $3)::int AS ot,
    (SELECT count(*) FROM salary_advances WHERE month = $3)::int AS adv, (SELECT count(*) FROM bonuses WHERE month = $3)::int AS bonus,
    (SELECT count(*) FROM deductions WHERE month = $3)::int AS ded, (SELECT count(*) FROM monthly_allowances WHERE month = $3)::int AS allow`, [ym + '-01', nextMonthStart(ym), ym])).rows[0];
  return r;
}

/* ---------- Chốt / mở khóa (tính lại ở máy chủ từ dữ liệu trong CSDL) ---------- */
async function lockMonth(c, ym, note, ctx = {}) {
  checkYm(ym);
  await c.query('INSERT INTO payroll_periods (month) VALUES ($1) ON CONFLICT (month) DO NOTHING', [ym]);
  const p = (await c.query('SELECT status, prev_snapshot FROM payroll_periods WHERE month = $1 FOR UPDATE', [ym])).rows[0];
  if (p.status === 'locked') throw new HttpError(409, `Tháng ${ym} đã được chốt trước đó`, { code: 'LOCKED' });
  const st = await loadState(c, { months: [ym] });
  const P = E.livePayroll(st.settings, st.employees, ym, st.months[ym] || E.emptyMonth());
  if (!P.rows.length) throw new HttpError(400, 'Tháng này chưa có nhân viên nào để chốt lương');
  await c.query("SELECT set_config('hrm.snapshot_write', 'on', true)");
  await c.query('DELETE FROM payroll_snapshots WHERE month = $1', [ym]);
  await c.query('INSERT INTO payroll_snapshots (month, employee_id, code, name, net, data) SELECT $1, x.employee_id, x.code, x.name, x.net, x.data FROM jsonb_to_recordset($2::jsonb) AS x(employee_id text, code text, name text, net bigint, data jsonb)',
    [ym, P.rows.map((r) => ({ employee_id: r.empId, code: r.code, name: r.name, net: Math.round(r.net), data: r }))]);
  await c.query("SELECT set_config('hrm.snapshot_write', 'off', true)");
  const changes = [];
  if (p.prev_snapshot) {
    const old = new Map(p.prev_snapshot.map((r) => [r.empId, r]));
    P.rows.forEach((r) => { const o = old.get(r.empId); if (!o) changes.push(`${r.code} ${r.name}: thêm mới, thực lĩnh ${vndTxt(r.net)}`); else if (o.net !== r.net) changes.push(`${r.code} ${r.name}: thực lĩnh ${vndTxt(o.net)} → ${vndTxt(r.net)} (${r.net > o.net ? '+' : ''}${vndTxt(r.net - o.net)})`); });
    p.prev_snapshot.forEach((o) => { if (!P.rows.find((r) => r.empId === o.empId)) changes.push(`${o.code} ${o.name}: bị loại khỏi bảng lương`); });
    if (!changes.length) changes.push('Không có thay đổi số liệu');
  }
  await c.query('UPDATE payroll_periods SET status = $2, locked_at = now(), std_days = $3, prev_snapshot = NULL, updated_at = now() WHERE month = $1', [ym, 'locked', P.std]);
  const action = p.prev_snapshot ? 'Chốt lại lương' : 'Chốt lương';
  await c.query('INSERT INTO payroll_events (month, action, note, net, changes) VALUES ($1, $2, $3, $4, $5)', [ym, action, (clean(note, 200) ? clean(note, 200) + ' · ' : '') + P.rows.length + ' nhân viên', Math.round(P.totals.net), changes.length ? JSON.stringify(changes) : null]);
  await audit(c, 'payroll.lock', 'payroll_period', ym, `${action} tháng ${ym}: ${P.rows.length} NV, tổng thực lĩnh ${vndTxt(P.totals.net)}`, changes.length ? { changes } : null, ctx.ip);
  return loadMonth(c, ym);
}
async function unlockMonth(c, ym, reason, ctx = {}) {
  checkYm(ym); const why = clean(reason, 500);
  if (why.length < 5) throw new HttpError(400, 'Vui lòng nhập lý do mở khóa (ít nhất 5 ký tự)');
  const p = (await c.query('SELECT status FROM payroll_periods WHERE month = $1 FOR UPDATE', [ym])).rows[0];
  if (!p || p.status !== 'locked') throw new HttpError(409, 'Tháng này chưa chốt lương');
  await c.query("SELECT set_config('hrm.snapshot_write', 'on', true)");
  await c.query(`UPDATE payroll_periods SET prev_snapshot = (SELECT jsonb_agg(data ORDER BY code) FROM payroll_snapshots WHERE month = $1), status = 'review', locked_at = NULL, updated_at = now() WHERE month = $1`, [ym]);
  await c.query('DELETE FROM payroll_snapshots WHERE month = $1', [ym]);
  await c.query("SELECT set_config('hrm.snapshot_write', 'off', true)");
  await c.query('INSERT INTO payroll_events (month, action, note) VALUES ($1, $2, $3)', [ym, 'Mở khóa', why]);
  await audit(c, 'payroll.unlock', 'payroll_period', ym, `Mở khóa bảng lương tháng ${ym}: ${why}`, null, ctx.ip);
  return loadMonth(c, ym);
}
const vndTxt = (n) => Math.round(Number(n) || 0).toLocaleString('vi-VN');

/* ---------- Đọc dữ liệu (cấu trúc giống prototype) ---------- */
const str = (v) => (v == null ? '' : String(v));
function mapEmployee(r, hist) {
  return { id: r.id, code: r.code, name: r.name, dob: str(r.dob), gender: str(r.gender), address: str(r.address), cccd: str(r.cccd), cccdDate: str(r.cccd_date), cccdPlace: str(r.cccd_place),
    phone: str(r.phone), position: str(r.position), startDate: str(r.start_date), salary: Number(r.salary), insSalary: Number(r.ins_salary), insJoin: r.ins_join, insCustom: r.ins_custom,
    insRates: r.ins_rates || { bhxh: 8, bhyt: 1.5, bhtn: 1 }, fuelDefault: Number(r.fuel_default), status: r.status, leftDate: str(r.left_date), note: str(r.note),
    ...(hist && hist.length ? { salaryHistory: hist } : {}) };
}
async function loadState(c, { months: onlyMonths } = {}) {
  const sRow = (await c.query('SELECT data, initialized FROM app_settings WHERE id = 1')).rows[0];
  const settings = Object.assign(E.defaultSettings(), sRow ? sRow.data : {});
  const histRows = (await c.query('SELECT employee_id, from_month, salary, ins_salary FROM salary_history ORDER BY from_month')).rows;
  const histBy = {}; histRows.forEach((h) => (histBy[h.employee_id] = histBy[h.employee_id] || []).push({ from: h.from_month, salary: Number(h.salary), insSalary: Number(h.ins_salary) }));
  const employees = (await c.query('SELECT * FROM employees WHERE deleted_at IS NULL ORDER BY code')).rows.map((r) => mapEmployee(r, histBy[r.id]));
  const months = await loadMonths(c, onlyMonths);
  return { settings, employees, months, initialized: !!(sRow && sRow.initialized) || employees.length > 0 };
}
async function loadMonth(c, ym) { return (await loadMonths(c, [ym]))[ym] || E.emptyMonth(); }
async function loadMonths(c, only) {
  const filt = only ? ' WHERE month = ANY(string_to_array($1, \',\'))' : ''; const args = only ? [only.join(',')] : [];
  const months = {};
  const get = (ym) => (months[ym] = months[ym] || E.emptyMonth());
  for (const p of (await c.query('SELECT month, status, std_days, locked_at, prev_snapshot FROM payroll_periods' + filt, args)).rows) {
    const M = get(p.month); M.status = p.status; M._std = p.std_days; M._lockedAt = p.locked_at; if (p.prev_snapshot) M.prevSnapshot = { rows: p.prev_snapshot };
  }
  const attQ = only ? ` WHERE to_char(work_date, 'YYYY-MM') = ANY(string_to_array($1, ','))` : '';
  for (const a of (await c.query(`SELECT employee_id, to_char(work_date, 'YYYY-MM') AS ym, extract(day from work_date)::int AS d, kind, value, to_char(time_in, 'HH24:MI') AS ti, to_char(time_out, 'HH24:MI') AS tout FROM attendance${attQ}`, args)).rows) {
    const M = get(a.ym); M.att[a.employee_id] = M.att[a.employee_id] || {};
    M.att[a.employee_id][a.d] = a.kind === 'num' ? Number(a.value) : a.kind === 'time' ? { i: a.ti, o: a.tout } : a.kind;
  }
  for (const r of (await c.query('SELECT * FROM late_records' + filt + ' ORDER BY work_date NULLS FIRST, id', args)).rows) get(r.month).late.push({ id: r.id, empId: r.employee_id, date: str(r.work_date), minutes: r.minutes, note: str(r.note) });
  for (const r of (await c.query('SELECT * FROM overtime_records' + filt + ' ORDER BY work_date, id', args)).rows) get(r.month).ot.push({ id: r.id, empId: r.employee_id, date: r.work_date, minutes: r.minutes, note: str(r.note) });
  for (const r of (await c.query('SELECT * FROM salary_advances' + filt + ' ORDER BY advance_date, id', args)).rows) get(r.month).adv.push({ id: r.id, empId: r.employee_id, date: r.advance_date, week: r.week, amount: Number(r.amount), note: str(r.note) });
  for (const r of (await c.query('SELECT * FROM bonuses' + filt + ' ORDER BY id', args)).rows) get(r.month).bonus.push({ id: r.id, empId: r.employee_id, type: str(r.type), name: r.name, amount: Number(r.amount), bhxh: r.bhxh, note: str(r.note) });
  for (const r of (await c.query('SELECT * FROM deductions' + filt + ' ORDER BY id', args)).rows) get(r.month).ded.push({ id: r.id, empId: r.employee_id, name: r.name, amount: Number(r.amount), confirmed: r.confirmed, note: str(r.note) });
  for (const r of (await c.query('SELECT * FROM monthly_allowances' + filt, args)).rows) {
    const a = {}; if (r.cc_mode) a.cc = r.cc_mode; if (r.cc_note) a.ccNote = r.cc_note; if (r.fuel !== null) a.fuel = Number(r.fuel); get(r.month).allow[r.employee_id] = a;
  }
  const snaps = {}; for (const r of (await c.query('SELECT month, data FROM payroll_snapshots' + filt + ' ORDER BY code', args)).rows) (snaps[r.month] = snaps[r.month] || []).push(r.data);
  for (const r of (await c.query('SELECT month, at, action, note, net, changes FROM payroll_events' + filt + ' ORDER BY at, id', args)).rows) {
    get(r.month).log.push({ t: r.at.toISOString(), action: r.action, note: str(r.note), ...(r.net !== null ? { net: Number(r.net) } : {}), ...(r.changes ? { changes: r.changes } : {}) });
  }
  for (const [ym, M] of Object.entries(months)) {
    if (M.status === 'locked') M.snapshot = { rows: snaps[ym] || [], std: Number(M._std), lockedAt: M._lockedAt ? M._lockedAt.toISOString() : null };
    delete M._std; delete M._lockedAt;
  }
  return months;
}

/* ---------- Sao lưu & khôi phục ---------- */
async function backup(c) {
  const st = await loadState(c);
  return { app: 'tanhung-hrm', format: 'TAN HUNG HRM backup', version: 2, exportedAt: new Date().toISOString(), data: { settings: st.settings, employees: st.employees, months: st.months } };
}
async function restore(c, payload, ctx = {}) {
  const d = payload && (payload.data || payload);
  if (!d || !Array.isArray(d.employees) || typeof d.months !== 'object' || !d.settings) throw new HttpError(400, 'File không phải bản sao lưu của hệ thống');
  await c.query("SELECT set_config('hrm.restore', 'on', true)");
  await c.query('TRUNCATE payroll_events, payroll_snapshots, monthly_allowances, deductions, bonuses, salary_advances, overtime_records, late_records, attendance, salary_history, payroll_periods, employees, app_settings RESTART IDENTITY');
  const settings = sanitizeSettings(d.settings);
  await c.query('INSERT INTO app_settings (id, data, initialized) VALUES (1, $1, true)', [settings]);
  await saveEmployees(c, d.employees, ctx);
  const empIds = await activeEmployeeIds(c);
  // nhân viên chỉ còn xuất hiện trong bảng lương đã chốt vẫn được giữ trong ảnh chụp
  let nMonths = 0;
  for (const [ym, M] of Object.entries(d.months).sort()) {
    checkYm(ym); nMonths++;
    const locked = M.status === 'locked' && M.snapshot && Array.isArray(M.snapshot.rows) && M.snapshot.rows.length;
    await c.query('INSERT INTO payroll_periods (month, status, std_days, locked_at, prev_snapshot) VALUES ($1, $2, $3, $4, $5)', [ym, locked ? 'locked' : (M.status === 'review' ? 'review' : 'none'),
      locked ? Number(M.snapshot.std) || null : null, locked ? (M.snapshot.lockedAt ? new Date(M.snapshot.lockedAt) : new Date()) : null, M.prevSnapshot && Array.isArray(M.prevSnapshot.rows) ? JSON.stringify(M.prevSnapshot.rows) : null]);
    const keep = (arr) => (Array.isArray(arr) ? arr.filter((x) => x && empIds.has(x.empId)) : []);
    const allow = Object.fromEntries(Object.entries(M.allow || {}).filter(([k]) => empIds.has(k)));
    const data = sanitizeMonth(ym, { ...M, att: filterAtt(M.att, empIds), late: keep(M.late), ot: keep(M.ot), adv: keep(M.adv), bonus: keep(M.bonus), ded: keep(M.ded), allow }, empIds);
    await writeMonthData(c, ym, data);
    if (locked) {
      await c.query('INSERT INTO payroll_snapshots (month, employee_id, code, name, net, data) SELECT $1, x.employee_id, x.code, x.name, x.net, x.data FROM jsonb_to_recordset($2::jsonb) AS x(employee_id text, code text, name text, net bigint, data jsonb)',
        [ym, M.snapshot.rows.map((r) => ({ employee_id: checkId(r.empId), code: clean(r.code, 32), name: clean(r.name, 120), net: Math.round(Number(r.net) || 0), data: r }))]);
    }
    for (const l of (Array.isArray(M.log) ? M.log : []).slice(-500)) {
      await c.query('INSERT INTO payroll_events (month, at, action, note, net, changes) VALUES ($1, $2, $3, $4, $5, $6)', [ym, l.t && !isNaN(Date.parse(l.t)) ? new Date(l.t) : new Date(), clean(l.action, 60) || 'Ghi chú', clean(l.note, 500), l.net != null ? Math.round(Number(l.net)) : null, Array.isArray(l.changes) ? JSON.stringify(l.changes.map((x) => clean(x, 300))) : null]);
    }
  }
  await c.query("SELECT set_config('hrm.restore', 'off', true)");
  await audit(c, 'data.restore', 'system', null, `Khôi phục dữ liệu: ${d.employees.length} nhân viên, ${nMonths} tháng`, { exportedAt: payload.exportedAt || null }, ctx.ip);
  return { employees: d.employees.length, months: nMonths };
}
function filterAtt(att, ids) { const o = {}; for (const [k, v] of Object.entries(att || {})) if (ids.has(k)) o[k] = v; return o; }

async function auditList(c, limit = 200) {
  return (await c.query('SELECT at, action, entity, entity_id, summary, ip FROM audit_log ORDER BY at DESC, id DESC LIMIT $1', [Math.min(1000, Math.max(1, Number(limit) || 200))])).rows;
}

module.exports = { loadState, loadMonth, saveSettings, saveEmployees, saveMonth, lockMonth, unlockMonth, backup, restore, auditList, audit, sanitizeSettings };
