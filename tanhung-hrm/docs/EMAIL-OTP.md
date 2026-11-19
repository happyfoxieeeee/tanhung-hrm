# Cấu hình email nhận mã OTP

Đổi mật khẩu bắt buộc xác thực bằng **mã OTP 6 số gửi qua email**. Hệ thống không giả lập việc gửi: nếu chưa cấu hình dịch vụ email, chức năng đổi mật khẩu sẽ báo lỗi rõ ràng.

## 1. Chọn email nhận OTP
- **Cách 1 (khuyến nghị):** đặt biến `ADMIN_OTP_EMAIL=giamdoc@tanhung.vn`. Email bị cố định, không ai đổi được trên giao diện.
- **Cách 2:** để trống biến, sau khi đăng nhập vào **Bảo mật › Khai báo email OTP**. Lần đổi sau phải nhập OTP gửi tới email cũ.

Trên giao diện, email luôn được che một phần (ví dụ `gi******@t******.vn`).

## 2. Chọn dịch vụ gửi email

### a) Gmail / Google Workspace (SMTP)
1. Tài khoản Google cần bật **Xác minh 2 bước**.
2. Vào https://myaccount.google.com/apppasswords → tạo **Mật khẩu ứng dụng**, tên "TAN HUNG HRM" → sao chép 16 ký tự.
3. Khai báo:
   ```
   EMAIL_PROVIDER=smtp
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=tai-khoan@gmail.com          # hoặc email Workspace
   SMTP_PASS=abcdefghijklmnop             # mật khẩu ứng dụng, viết liền không dấu cách
   MAIL_FROM="TAN HUNG HRM <tai-khoan@gmail.com>"
   ```
   Gmail chỉ cho gửi bằng chính địa chỉ đã đăng nhập (hoặc bí danh đã xác minh).

### b) Zoho Mail / email theo tên miền của nhà cung cấp hosting
Dùng thông số SMTP do nhà cung cấp cung cấp, ví dụ Zoho: `smtp.zoho.com`, cổng `465` + `SMTP_SECURE=true`, hoặc cổng `587` + `SMTP_SECURE=false`.

### c) Resend (dịch vụ email giao dịch, gửi qua API HTTPS)
1. Đăng ký https://resend.com → **Domains** → thêm tên miền `tanhung.vn` → tạo các bản ghi DNS (SPF, DKIM) như hướng dẫn → chờ trạng thái *Verified*.
2. **API Keys** → tạo khóa quyền *Sending access*.
3. Khai báo:
   ```
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_xxxxxxxx
   MAIL_FROM="TAN HUNG HRM <no-reply@tanhung.vn>"
   ```

## 3. Kiểm tra
1. Deploy lại (Vercel: Redeploy) để biến mới có hiệu lực.
2. Đăng nhập → **Bảo mật**: dòng "Dịch vụ gửi email" phải là *Đã cấu hình*, "Email nhận OTP" hiển thị đúng địa chỉ (dạng che).
3. **Đổi mật khẩu (OTP email) › Gửi mã OTP** → kiểm tra hộp thư (cả thư rác). Email có tiêu đề **[TAN HUNG HRM] Mã xác thực đổi mật khẩu**.
4. Nếu báo *"Không gửi được email…"*: xem **Bảo mật › Lịch sử đăng nhập & bảo mật** (dòng *Gửi mã OTP – Thất bại* có mô tả lỗi, ví dụ `535` = sai mật khẩu SMTP). Trên Vercel cũng xem được trong **Logs**. Mã OTP không bao giờ được ghi vào log.

## 4. Quy định OTP đang áp dụng
| Quy định | Giá trị |
|---|---|
| Độ dài | 6 chữ số, sinh bằng `crypto.randomInt` (bộ sinh số ngẫu nhiên an toàn) |
| Hiệu lực | 5 phút, dùng một lần |
| Mã mới | Vô hiệu hóa mọi mã cũ chưa dùng |
| Nhập sai | Tối đa 5 lần, sau đó mã bị hủy |
| Gửi lại | Chờ 60 giây; tối đa 5 mã/giờ |
| Ràng buộc phiên | Mã chỉ dùng được trong đúng phiên đăng nhập đã yêu cầu |
| Lưu trữ | HMAC-SHA256 với `APP_SECRET`, không lưu mã gốc |
| Sau khi đổi mật khẩu | Mọi phiên đăng nhập bị thu hồi, phải đăng nhập lại |

## 5. Tránh email vào thư rác
- Dùng địa chỉ gửi thuộc tên miền của công ty và cấu hình **SPF/DKIM/DMARC** theo hướng dẫn của nhà cung cấp.
- Thêm địa chỉ gửi vào danh bạ của email nhận OTP.
