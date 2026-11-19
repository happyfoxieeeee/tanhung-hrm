'use strict';
// Áp dụng migration CSDL: npm run migrate  (cần biến môi trường DATABASE_URL)
const { migrate, db } = require('../server/db');
(async () => {
  try { console.log('Đang áp dụng migration…'); await migrate(); await db.end(); console.log('Hoàn tất.'); }
  catch (e) { console.error('Migration thất bại:', e.message); await db.end().catch(() => {}); process.exit(1); }
})();
