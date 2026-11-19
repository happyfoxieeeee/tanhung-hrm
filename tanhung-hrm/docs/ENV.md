# Biến môi trường

Khai báo trên Vercel (**Settings › Environment Variables**) hoặc trong file `.env` khi chạy máy chủ riêng. Mẫu: `.env.example`.
**Không** đưa giá trị thật vào Git. Mã nguồn không chứa bất kỳ secret nào.

## Bắt buộc

| Biến | Mô tả |
|---|---|
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL 13+. Máy chủ từ xa cần `?sslmode=require` (mã hóa) hoặc `?sslmode=verify-full` (mã hóa + xác minh chứng chỉ). Có thể thêm `DATABASE_SSL_CA` (nội dung chứng chỉ CA) nếu nhà cung cấp yêu cầu. |
| `APP_SECRET` | Chuỗi ngẫu nhiên ≥ 32 ký tự, dùng làm khóa HMAC cho mã OTP. Sinh bằng `npm run secrets`. |
| `INITIAL_SETUP_TOKEN` | Mã cho phép tạo mật khẩu quản trị lần đầu, ≥ 24 ký tự. Chỉ dùng được một lần, sau đó có thể xóa. |

## Email OTP

| Biến | Mặc định | Mô tả |
|---|---|---|
| `ADMIN_OTP_EMAIL` | (trống) | Email nhận OTP. Nếu đặt, email bị cố định (giao diện không đổi được). Để trống nếu muốn khai báo trong **Bảo mật**; đổi email trên giao diện cần OTP gửi tới email cũ. |
| `EMAIL_PROVIDER` | (trống) | `smtp` hoặc `resend`. Để trống thì không gửi được OTP. |
| `MAIL_FROM` | — | Người gửi, ví dụ `TAN HUNG HRM <no-reply@tanhung.vn>` |
| `SMTP_HOST` / `SMTP_PORT` | — / `587` | Máy chủ SMTP |
| `SMTP_SECURE` | `false` | `true` khi dùng cổng 465 (TLS ngay từ đầu). Với cổng 587, hệ thống tự nâng cấp STARTTLS. |
| `SMTP_USER` / `SMTP_PASS` | — | Tài khoản SMTP (Gmail: mật khẩu ứng dụng) |
| `SMTP_REQUIRE_TLS` | `true` | Từ chối gửi nếu máy chủ SMTP không hỗ trợ mã hóa |
| `SMTP_TLS_REJECT_UNAUTHORIZED` | `true` | Xác minh chứng chỉ máy chủ SMTP |
| `RESEND_API_KEY` | — | Khóa API khi `EMAIL_PROVIDER=resend` |

## Phiên đăng nhập & giới hạn

| Biến | Mặc định | Mô tả |
|---|---|---|
| `SESSION_IDLE_MINUTES` | `30` | Thời gian không hoạt động trước khi tự đăng xuất (giá trị ban đầu; đổi được trong Bảo mật, 5–240 phút) |
| `SESSION_MAX_HOURS` | `12` | Thời hạn tối đa của một phiên |
| `LOGIN_MAX_FAILS_PER_IP` | `5` | Số lần đăng nhập sai tối đa của một IP trong cửa sổ thời gian |
| `LOGIN_MAX_FAILS_GLOBAL` | `20` | Tổng số lần sai (mọi IP) trước khi khóa tạm tài khoản |
| `LOGIN_WINDOW_MINUTES` / `LOGIN_LOCK_MINUTES` | `15` / `15` | Cửa sổ đếm và thời gian khóa |
| `OTP_MAX_ATTEMPTS` | `5` | Số lần nhập sai OTP trước khi mã bị vô hiệu |
| `OTP_RESEND_COOLDOWN_SECONDS` | `60` | Thời gian chờ giữa hai lần gửi mã |
| `OTP_MAX_PER_HOUR` | `5` | Số mã tối đa gửi trong 1 giờ |

Thời hạn OTP được cố định **5 phút** theo yêu cầu.

## Hệ thống

| Biến | Mặc định | Mô tả |
|---|---|---|
| `NODE_ENV` | — | `production` để bật cookie `Secure` (tiền tố `__Host-`) và HSTS. Vercel tự nhận là production. |
| `COOKIE_SECURE` | theo `NODE_ENV` | Ép bật/tắt cookie Secure (chỉ tắt khi chạy thử qua http://localhost) |
| `TRUST_PROXY` | `true` trên Vercel | Đọc IP người dùng từ `X-Forwarded-For`. Chỉ bật khi đứng sau proxy tin cậy (Vercel, Caddy, Nginx). |
| `PG_POOL_MAX` | `2` (Vercel) / `5` | Số kết nối CSDL tối đa mỗi tiến trình |
| `PORT` | `3000` | Cổng khi chạy `npm start` |
| `APP_TIMEZONE` | `Asia/Ho_Chi_Minh` | Múi giờ hiển thị |
