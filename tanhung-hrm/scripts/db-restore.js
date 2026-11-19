'use strict';
// Khôi phục dữ liệu nghiệp vụ từ file JSON: npm run restore -- duong-dan.json --yes
// (không đụng tới tài khoản quản trị / phiên đăng nhập)
const fs = require('fs');
const { db } = require('../server/db');
const repo = require('../server/repo');
(async () => {
  const file = process.argv[2];
  if (!file || !process.argv.includes('--yes')) { console.error('Cách dùng: npm run restore -- <file.json> --yes   (THAY THẾ toàn bộ dữ liệu nghiệp vụ hiện có)'); process.exit(1); }
  try { const payload = JSON.parse(fs.readFileSync(file, 'utf8')); const r = await db.tx((c) => repo.restore(c, payload, { ip: 'cli' })); console.log(`Đã khôi phục ${r.employees} nhân viên, ${r.months} tháng từ ${file}`); }
  catch (e) { console.error('Khôi phục thất bại (dữ liệu cũ giữ nguyên):', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
