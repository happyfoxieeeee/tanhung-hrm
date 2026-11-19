# Bảo mật & tài khoản quản trị

## Tài khoản duy nhất
- Username cố định: **`hrsystem-ctytanhung`** (khai báo trong `server/config.js`).
- Không có chức năng đăng ký, tạo thêm tài khoản hay phân quyền. CSDL chỉ cho phép **một dòng** trong bảng `admin_account` (`CHECK (id = 1)`).
- Mọi API dữ liệu đều kiểm tra phiên ở máy chủ. Giao diện tĩnh không chứa dữ liệu; người chưa đăng nhập chỉ thấy trang đăng nhập.

## INITIAL_SETUP_TOKEN — thiết lập mật khẩu lần đầu
1. Sinh token ngẫu nhiên ≥ 24 ký tự: `npm run secrets`. Không dùng chuỗi dễ đoán.
2. Khai báo biến `INITIAL_SETUP_TOKEN` trước khi deploy.
3. Mở website lần đầu → nhập token + mật khẩu → hệ thống:
   - kiểm tra token bằng so sánh an toàn thời gian (timing-safe);
   - giới hạn 5 lần nhập sai mỗi IP/15 phút;
   - tạo tài khoản và **đánh dấu token đã dùng** (lưu SHA-256 trong `setup_tokens_used`) trong cùng một transaction.
4. Khi đã có tài khoản, mọi yêu cầu thiết lập lại đều bị từ chối (`409 – Hệ thống đã được khởi tạo`), kể cả khi biết token.
5. Sau khi thiết lập xong có thể xóa biến `INITIAL_SETUP_TOKEN`.

Người lạ truy cập website trước bạn cũng **không thể** chiếm quyền quản trị nếu không có token.

## Chính sách mật khẩu
Tối thiểu 10 ký tự, có chữ hoa, chữ thường, chữ số, ký tự đặc biệt, không chứa tên đăng nhập. Mật khẩu băm bằng **Argon2id** (m = 19 MiB, t = 2, p = 1 theo khuyến nghị OWASP), lưu dạng `$argon2id$v=19$…`. Không lưu dạng văn bản thuần.

## Phiên đăng nhập
- Token phiên 256 bit ngẫu nhiên; CSDL chỉ lưu SHA-256 của token.
- Cookie: `HttpOnly`, `Secure`, `SameSite=Strict`, tiền tố `__Host-` khi chạy production.
- CSRF: mọi thao tác ghi phải gửi header `X-CSRF-Token` khớp với phiên. Đăng nhập/thiết lập kiểm tra cùng nguồn (Origin) và chỉ nhận JSON.
- Tự đăng xuất sau N phút không hoạt động (máy chủ thu hồi phiên; giao diện cảnh báo trước 1 phút). Thời hạn tối đa 12 giờ.
- **Bảo mật › Phiên đăng nhập**: xem thiết bị, IP, thời gian; thu hồi từng phiên hoặc đăng xuất mọi thiết bị khác.
- Đổi mật khẩu thành công → toàn bộ phiên bị thu hồi.

## Chống dò mật khẩu
- Một IP sai 5 lần trong 15 phút → bị chặn 15 phút (kể cả khi sau đó nhập đúng).
- Tổng 20 lần sai từ mọi IP trong 15 phút → tạm khóa tài khoản 15 phút.
- Sai username hay sai mật khẩu đều nhận cùng một thông báo, thời gian phản hồi tương đương.

## Header bảo mật
`Content-Security-Policy` (chỉ cho phép script từ chính website và cdnjs cho thư viện Excel/PDF), `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.

## Nhật ký
- **Lịch sử đăng nhập & bảo mật** (`auth_events`): đăng nhập thành công/thất bại, đăng xuất, hết phiên, thu hồi phiên, gửi/xác thực OTP, đổi mật khẩu, khóa tạm thời.
- **Nhật ký thay đổi dữ liệu** (`audit_log`): thêm/sửa/xóa nhân viên (kèm trường thay đổi), cập nhật dữ liệu tháng, chốt/mở khóa bảng lương (kèm chênh lệch thực lĩnh), cài đặt, sao lưu, khôi phục.

## Quên mật khẩu
Theo yêu cầu, website **không có** chức năng "quên mật khẩu" công khai. Người có quyền truy cập máy chủ/CSDL khôi phục như sau:
1. Trên máy có mã nguồn và `DATABASE_URL` của production:
   ```bash
   npm run reset-admin -- --confirm hrsystem-ctytanhung
   ```
   Lệnh xóa mật khẩu quản trị và thu hồi mọi phiên. **Dữ liệu nhân sự không bị ảnh hưởng.**
2. Đặt `INITIAL_SETUP_TOKEN` **mới** (token cũ đã bị vô hiệu vĩnh viễn) → Redeploy → mở website và thiết lập mật khẩu lại.

Nếu còn đăng nhập được, dùng **Đổi mật khẩu (OTP email)** trong ứng dụng.

## Khuyến nghị vận hành
- Giữ `APP_SECRET`, `DATABASE_URL`, thông tin SMTP trong trình quản lý biến môi trường; không gửi qua chat/email.
- Bật xác minh 2 bước cho tài khoản GitHub, Vercel, Neon và email nhận OTP: chiếm được email OTP đồng nghĩa có thể đổi mật khẩu.
- Sao lưu định kỳ (xem `BACKUP.md`) và lưu bản sao ở nơi tách biệt.
