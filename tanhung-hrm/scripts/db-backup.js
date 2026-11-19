'use strict';
// Sao lưu dữ liệu nghiệp vụ ra file JSON (định dạng giống nút "Sao lưu" trong ứng dụng): npm run backup [-- duong-dan.json]
const fs = require('fs');
const { db } = require('../server/db');
const repo = require('../server/repo');
(async () => {
  const file = process.argv[2] || `backup-tanhung-hrm-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  try { const b = await db.tx((c) => repo.backup(c)); fs.writeFileSync(file, JSON.stringify(b, null, 1)); console.log(`Đã sao lưu ${b.data.employees.length} nhân viên, ${Object.keys(b.data.months).length} tháng → ${file}`); }
  catch (e) { console.error('Sao lưu thất bại:', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
