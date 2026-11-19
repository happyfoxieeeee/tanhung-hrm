'use strict';
/**
 * KHÔI PHỤC QUYỀN QUẢN TRỊ khi quên mật khẩu (chỉ dành cho người có quyền truy cập máy chủ/CSDL).
 * Xóa tài khoản quản trị + mọi phiên đăng nhập, giữ nguyên toàn bộ dữ liệu nhân sự.
 * Sau đó đặt một INITIAL_SETUP_TOKEN MỚI (token cũ đã bị đánh dấu sử dụng) và mở website để thiết lập lại.
 *   npm run reset-admin -- --confirm hrsystem-ctytanhung
 */
const { db } = require('../server/db');
(async () => {
  if (process.argv[process.argv.indexOf('--confirm') + 1] !== 'hrsystem-ctytanhung') {
    console.error('Cách dùng: npm run reset-admin -- --confirm hrsystem-ctytanhung\nThao tác xóa mật khẩu quản trị hiện tại; dữ liệu nhân sự KHÔNG bị ảnh hưởng.'); process.exit(1);
  }
  try {
    await db.tx(async (c) => {
      await c.query("UPDATE sessions SET revoked_at = now(), revoke_reason = 'khôi phục quyền quản trị' WHERE revoked_at IS NULL");
      await c.query('DELETE FROM admin_account');
      await c.query("INSERT INTO auth_events (event, success, ip, detail) VALUES ('admin_reset', true, 'cli', 'xóa tài khoản quản trị qua dòng lệnh để thiết lập lại')");
      await c.query("INSERT INTO audit_log (action, entity, summary, ip) VALUES ('auth.reset', 'admin', 'Khôi phục quyền quản trị qua dòng lệnh', 'cli')");
    });
    console.log('Đã xóa tài khoản quản trị. Hãy đặt INITIAL_SETUP_TOKEN MỚI rồi mở website để thiết lập mật khẩu.');
  } catch (e) { console.error('Thất bại:', e.message); process.exitCode = 1; } finally { await db.end(); }
})();
