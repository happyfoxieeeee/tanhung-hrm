# TAN HUNG HRM

Hệ thống quản trị nhân sự & tiền lương nội bộ của **CÔNG TY TNHH MỸ THUẬT TÂN HƯNG**.
Website chính thức được nâng cấp từ prototype: giữ nguyên giao diện, 10 module, dữ liệu mẫu và toàn bộ công thức tính lương; bổ sung backend, PostgreSQL, xác thực một tài khoản quản trị, OTP email và các lớp bảo mật.

## Tính năng

| Nhóm | Nội dung |
|---|---|
| Nghiệp vụ | Dashboard · Nhân sự (hồ sơ, lịch sử mức lương) · Chấm công (lưới kiểu Excel, phím tắt, giờ vào/ra) · Đi trễ · Tăng ca (150% / 200% / 300%) · Phụ cấp chuyên cần 200.000 đ, xăng xe, thưởng, khấu trừ · Ứng lương theo tuần · Bảng lương + chốt/mở khóa có lịch sử · Phiếu lương (in, PDF từng người / hàng loạt) · Cài đặt · Nhập/xuất Excel |
| Dữ liệu | PostgreSQL với ràng buộc toàn vẹn: không trùng mã NV, không trùng công cùng ngày, phiếu ứng có mã duy nhất, mỗi nhân viên một dòng bảng lương/tháng; **tháng đã chốt bị khóa bằng trigger ở cấp CSDL**; bảng lương chốt được **máy chủ tính lại** và lưu ảnh chụp cố định |
| Xác thực | Một tài khoản duy nhất `hrsystem-ctytanhung` · thiết lập lần đầu bằng `INITIAL_SETUP_TOKEN` dùng một lần · Argon2id (OWASP: m=19 MiB, t=2) · phiên lưu CSDL, cookie HttpOnly/Secure/SameSite=Strict, CSRF token · tự đăng xuất khi không hoạt động · quản lý & thu hồi phiên |
| Đổi mật khẩu | OTP 6 số qua email (SMTP hoặc Resend) · hiệu lực 5 phút · dùng một lần · mã mới vô hiệu mã cũ · tối đa 5 lần nhập sai · chờ 60 giây giữa các lần gửi · tối đa 5 mã/giờ · lưu dạng HMAC, không trả về giao diện, không ghi log · email hiển thị dạng che |
| Chống tấn công | Khóa IP sau 5 lần đăng nhập sai/15 phút, khóa toàn hệ thống sau 20 lần · thời gian phản hồi như nhau khi sai username · CSP, HSTS, X-Frame-Options, kiểm tra nguồn yêu cầu · kiểm tra & làm sạch mọi dữ liệu đầu vào ở máy chủ |
| Nhật ký | Lịch sử đăng nhập/đổi mật khẩu/OTP/phiên · nhật ký thay đổi dữ liệu (thêm/sửa/xóa NV, cập nhật tháng, chốt/mở khóa, sao lưu, khôi phục) |

## Kiến trúc

```
public/            Giao diện (HTML/CSS/JS thuần, không cần build) — phục vụ tĩnh
  assets/engine.js Bộ máy tính công/lương — DÙNG CHUNG cho trình duyệt và máy chủ
  assets/app.js    Mã giao diện (tạo từ web/ bằng npm run build:web)
web/               Mã nguồn giao diện (app-core, views, auth, events)
api/index.js       Điểm vào serverless cho Vercel
server/            Backend Node.js thuần — KHÔNG phụ thuộc thư viện npm nào
  app.js           Định tuyến API, xác thực, CSRF, header bảo mật
  auth.js          Thiết lập lần đầu, đăng nhập, phiên, OTP, đổi mật khẩu
  repo.js          Đọc/ghi dữ liệu HRM, chốt lương, sao lưu/khôi phục, nhật ký
  db/pg.js         Driver PostgreSQL (SCRAM-SHA-256, TLS, pool, transaction)
  crypto/argon2.js Argon2id (đã kiểm chứng bằng vector RFC 9106)
  mail.js          Gửi email SMTP (STARTTLS/TLS) hoặc Resend
migrations/        Lược đồ CSDL (SQL)
scripts/           migrate, backup, restore, reset-admin, secrets, build-web
tests/             Kiểm thử tự động (engine, Argon2, PostgreSQL, SMTP, API đầu–cuối)
docs/              Hướng dẫn triển khai, biến môi trường, email OTP, sao lưu
```

**Vì sao không dùng thư viện npm?** Toàn bộ backend chạy bằng Node.js thuần (≥ 20): không có `node_modules`, không có lỗ hổng chuỗi cung ứng từ thư viện bên thứ ba, deploy không cần `npm install`. Các thành phần tự viết (driver PostgreSQL, Argon2id, SMTP) đều có kiểm thử với PostgreSQL 16 thật, vector chuẩn RFC 9106 và máy chủ SMTP có STARTTLS.

## Chạy thử trên máy

```bash
cp .env.example .env              # điền DATABASE_URL, APP_SECRET, INITIAL_SETUP_TOKEN, SMTP…
npm run secrets                   # sinh APP_SECRET và INITIAL_SETUP_TOKEN ngẫu nhiên
npm run migrate                   # tạo bảng CSDL
npm start                         # http://localhost:3000
```

Mở website → nhập `INITIAL_SETUP_TOKEN` và đặt mật khẩu → đăng nhập → chọn **Nạp dữ liệu mẫu** hoặc **Bắt đầu trống**.

## Kiểm thử

```bash
npm test     # cần PostgreSQL cho tests/pg.test.js và tests/api.test.js (biến TEST_ADMIN_DATABASE_URL)
```

Kết quả lần chạy bàn giao: **26/26 nhóm kiểm thử đạt** (56 phép kiểm tra công thức lương, hơn 100 phép kiểm tra API/bảo mật). Xem `docs/TESTING.md`.

## Tài liệu

- [docs/DEPLOY.md](docs/DEPLOY.md) — triển khai lên Internet (Vercel + Neon PostgreSQL, hoặc VPS/Docker), tên miền, HTTPS
- [docs/ENV.md](docs/ENV.md) — danh sách biến môi trường
- [docs/EMAIL-OTP.md](docs/EMAIL-OTP.md) — cấu hình SMTP / Resend và email nhận OTP
- [docs/SECURITY.md](docs/SECURITY.md) — INITIAL_SETUP_TOKEN, chính sách mật khẩu, khôi phục khi quên mật khẩu
- [docs/BACKUP.md](docs/BACKUP.md) — sao lưu & khôi phục dữ liệu
- [docs/TESTING.md](docs/TESTING.md) — các tình huống đã kiểm thử
