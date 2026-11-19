# Kết quả kiểm thử trước bàn giao

Chạy: `npm test`. Kết quả: **26/26 nhóm kiểm thử đạt** (ngày 19/11/2026, Node.js 22, PostgreSQL 16.15).

Môi trường kiểm thử là **thật**, không giả lập:
- máy chủ `server/index.js` chạy như production;
- PostgreSQL 16 thật (xác thực SCRAM-SHA-256, có SSL);
- máy chủ SMTP cục bộ hỗ trợ STARTTLS + AUTH. Mã OTP được đọc từ email nhận qua giao thức SMTP, không lấy qua đường tắt nào.

## 15 tình huống bắt buộc

| # | Tình huống | Kết quả kiểm chứng |
|---|---|---|
| 1 | Truy cập khi chưa đăng nhập | Trang tĩnh không chứa dữ liệu; `/api/state`, `/api/backup`, `/api/audit`, `/api/auth/me` và cả đường dẫn API không tồn tại → `401`; ghi dữ liệu → `401` |
| 2 | Đăng nhập sai username | `401`, thông báo chung, không cấp cookie |
| 3 | Đăng nhập sai mật khẩu | `401`, cùng thông báo; sau 5 lần/IP → `429` có `Retry-After`, IP khác vẫn đăng nhập được |
| 4 | Thiết lập mật khẩu lần đầu | Token sai → `403`; mật khẩu yếu / username sai / xác nhận không khớp → `400`; đúng → lưu Argon2id `$argon2id$v=19$m=19456,t=2,p=1$…` |
| 5 | Thiết lập lại khi đã có tài khoản | `409 ALREADY_SETUP`; token đã dùng bị từ chối kể cả sau khi reset tài khoản bằng CLI |
| 6 | Gửi OTP | Email 6 số đến đúng hộp thư, tiêu đề `[TAN HUNG HRM] Mã xác thực đổi mật khẩu`, nêu hiệu lực 5 phút + cảnh báo; API không trả mã; CSDL chỉ lưu HMAC; email hiển thị dạng che; gửi lại ngay → `429` |
| 7 | Nhập OTP sai | `400 – Còn 4 lần thử`, số lần sai được lưu; sai 5 lần → mã bị hủy (nhập đúng cũng không dùng được); mã của phiên khác bị từ chối |
| 8 | OTP hết hạn | `400 OTP_EXPIRED` |
| 9 | Dùng lại OTP | `400 OTP_USED`; mã cũ bị vô hiệu khi yêu cầu mã mới |
| 10 | Đổi mật khẩu thành công | Mật khẩu yếu/trùng mật khẩu cũ bị từ chối; thành công → mọi phiên bị thu hồi; ticket xác thực không dùng lại được |
| 11 | Đăng nhập bằng mật khẩu mới | Mật khẩu cũ `401`, mật khẩu mới `200` |
| 12 | Gọi API trực tiếp khi chưa đăng nhập | `401`; đã đăng nhập nhưng thiếu/giả `X-CSRF-Token` → `403` |
| 13 | Tải lại website | Dữ liệu đọc lại từ CSDL giống hệt |
| 14 | Đăng xuất rồi đăng nhập lại | Nhân sự, chấm công, bảng lương còn nguyên, thực lĩnh tính đúng |
| 15 | Sao lưu & khôi phục | Sao lưu → xóa sạch → khôi phục: dữ liệu khớp từng tháng; khôi phục file lỗi → transaction hủy, dữ liệu cũ giữ nguyên; khôi phục được cả file sao lưu của prototype |

## Kiểm thử bổ sung
- **Công thức lương** (56 phép kiểm tra, `tests/engine.test.js`): công chuẩn theo lịch, thiếu 0,5 công, nghỉ nhiều ngày, đi trễ 30 phút, tăng ca 120 phút thứ 4 / chủ nhật, chuyên cần, xăng xe + thưởng công trình, ứng nhiều lần, khấu trừ chỉ khi đã xác nhận, lịch sử tăng lương nhiều mốc.
  Thực lĩnh T11/2026 với dữ liệu mẫu: NV001 15.095.000 · NV002 8.182.500 · NV003 5.560.000 · NV004 9.850.000 · NV005 11.200.000 · NV006 10.245.000. Kết quả trùng khớp khi tính lại từ dữ liệu trong PostgreSQL.
- **Toàn vẹn dữ liệu:** trùng mã nhân viên → `409`; phiếu ứng trùng mã sang tháng khác → `409`; gửi lại cùng dữ liệu tháng 2 lần không nhân đôi phiếu ứng; giá trị công ngoài 0–1 → `400`.
- **Tháng đã chốt:** sửa qua API → `409 LOCKED`; sửa trực tiếp bằng SQL (`UPDATE attendance…`, `UPDATE payroll_snapshots…`) → trigger CSDL từ chối.
- **Chốt lương ở máy chủ:** tăng lương NV001 lên 18 triệu từ T11 → bảng lương T10 đã chốt giữ nguyên; chốt T11 do máy chủ tính: lương 18.000.000, thực lĩnh 18.140.000; không chốt hai lần; mở khóa bắt buộc có lý do; chốt lại ghi chênh lệch.
- **Phiên:** thu hồi phiên thiết bị khác → thiết bị đó bị `401`; không hoạt động quá 30 phút → phiên hết hạn.
- **Hạ tầng tự viết:** Argon2id khớp vector chuẩn RFC 9106; BLAKE2b khớp OpenSSL; driver PostgreSQL với `sslmode=disable/require`, lỗi SQL, pool song song, rollback; SMTP STARTTLS + AUTH, báo lỗi `535` khi sai mật khẩu SMTP.
- **Dòng lệnh:** `npm run backup`, `npm run restore -- file --yes` (thiếu `--yes` bị từ chối), `npm run reset-admin -- --confirm …`.

## Kiểm thử giao diện (Chrome, kết nối backend thật)
Thiết lập lần đầu → đăng nhập sai/đúng → nạp dữ liệu mẫu → bấm ô chấm công chọn "Nửa ngày" (lưu vào CSDL) → thêm & xóa nhân viên → **tải lại trang: dữ liệu còn nguyên** → chốt lương → ô công tháng đã chốt bị khóa → trang Bảo mật (phiên, lịch sử, nhật ký, trạng thái CSDL) → đổi mật khẩu: gửi OTP, nhập sai (báo còn 4 lần), nhập đúng, đặt mật khẩu mới → bị đăng xuất → đăng nhập bằng mật khẩu mới → đăng xuất. Giao diện điện thoại (390 px) có menu trượt. Không có lỗi JavaScript.

## Chưa kiểm thử được trong môi trường bàn giao
- **Gửi email tới hộp thư thật** (Gmail/Resend): cần thông tin SMTP/API của công ty. Giao thức SMTP đã được kiểm thử với máy chủ cục bộ; cần kiểm tra lại sau khi cấu hình (xem `EMAIL-OTP.md`).
- **Xuất Excel/PDF và tải thư viện từ cdnjs:** môi trường kiểm thử không có Internet. Mã xuất file giữ nguyên từ prototype; kiểm tra lại sau khi deploy.
- **Chạy trên Vercel/Neon thực tế:** cần tài khoản của công ty (xem `DEPLOY.md`).
