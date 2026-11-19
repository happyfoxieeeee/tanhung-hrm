# Triển khai TAN HUNG HRM lên Internet

Hai phương án đều đã được chuẩn bị sẵn. **Khuyến nghị: Phương án A (Vercel + Neon)**: miễn phí khi bắt đầu, có HTTPS tự động, không cần quản trị máy chủ.

> Trước khi bắt đầu, sinh hai giá trị bí mật trên máy của bạn: `node scripts/gen-secrets.js`
> (nếu chưa cài Node.js: dùng trình quản lý mật khẩu để tạo chuỗi ngẫu nhiên 48 ký tự cho `APP_SECRET` và 32 ký tự cho `INITIAL_SETUP_TOKEN`).

---

## Phương án A — Vercel + Neon PostgreSQL

### Bước 1. Tạo CSDL PostgreSQL trên Neon
1. Đăng ký tại https://neon.tech → **Create project**. Region nên chọn **AWS Asia Pacific (Singapore)**, gần Việt Nam nhất. PostgreSQL 16 hoặc 17.
2. Tại **Connection Details**, bật **Connection pooling** và sao chép chuỗi kết nối, dạng:
   `postgresql://neondb_owner:xxxx@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   Đây là giá trị cho `DATABASE_URL`. Giữ nguyên `?sslmode=require`.

> Có thể dùng **Vercel Postgres / Supabase / bất kỳ PostgreSQL 13+** nào. Với Supabase, dùng chuỗi "Transaction pooler" (cổng 6543).

### Bước 2. Đưa mã nguồn lên GitHub
1. Tạo repository **Private** trên GitHub (ví dụ `tanhung-hrm`).
2. Đưa toàn bộ thư mục dự án lên, **trừ file `.env`** (đã có sẵn trong `.gitignore`).
   ```bash
   git init && git add . && git commit -m "TAN HUNG HRM v1.0"
   git branch -M main && git remote add origin https://github.com/<tai-khoan>/tanhung-hrm.git && git push -u origin main
   ```

### Bước 3. Tạo dự án trên Vercel
1. Đăng ký https://vercel.com bằng tài khoản GitHub → **Add New… › Project** → chọn repository `tanhung-hrm`.
2. **Framework Preset: Other**. Không cần sửa Build/Output vì `vercel.json` đã cấu hình sẵn: build sẽ chạy `npm run vercel-build` (tạo giao diện và **tự chạy migration CSDL**), thư mục tĩnh là `public`.
3. Mở **Environment Variables** và khai báo cho môi trường **Production** (xem chi tiết từng biến trong `docs/ENV.md`):

   | Biến | Giá trị |
   |---|---|
   | `DATABASE_URL` | chuỗi kết nối Neon ở Bước 1 |
   | `APP_SECRET` | chuỗi ngẫu nhiên ≥ 32 ký tự |
   | `INITIAL_SETUP_TOKEN` | chuỗi ngẫu nhiên ≥ 24 ký tự |
   | `ADMIN_OTP_EMAIL` | email nhận mã OTP, ví dụ `giamdoc@tanhung.vn` |
   | `EMAIL_PROVIDER` | `smtp` hoặc `resend` |
   | `MAIL_FROM` | `TAN HUNG HRM <no-reply@ten-mien.vn>` |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | theo `docs/EMAIL-OTP.md` |

4. Bấm **Deploy**. Nhật ký build cần có dòng `✓ đã áp dụng migration 001_init.sql`.
5. Mở địa chỉ `https://tanhung-hrm.vercel.app` (hoặc tên Vercel cấp). Kiểm tra nhanh: `https://<địa-chỉ>/api/health` phải trả về `{"ok":true,"db":"connected","migrated":true,…}`.

### Bước 4. Thiết lập mật khẩu quản trị lần đầu
1. Mở website: trang hiển thị *"Chào mừng đến với TAN HUNG HRM. Vui lòng thiết lập mật khẩu quản trị để bắt đầu sử dụng."*
2. Nhập `INITIAL_SETUP_TOKEN`, username cố định `hrsystem-ctytanhung` và mật khẩu mới (≥ 10 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt).
3. Đăng nhập → vào **Bảo mật** kiểm tra email OTP và trạng thái dịch vụ email → thử **Đổi mật khẩu** một lần để xác nhận email OTP hoạt động.
4. *(Khuyến nghị)* Xóa biến `INITIAL_SETUP_TOKEN` trên Vercel rồi Redeploy. Token đã bị vô hiệu hóa trong CSDL sau khi dùng, nhưng xóa đi để giảm bề mặt tấn công.

### Bước 5. Gắn tên miền riêng và HTTPS
1. Vercel › Project › **Settings › Domains** → **Add** → nhập `hrm.tanhung.vn` (ví dụ).
2. Tại nhà quản lý DNS của tên miền (Mắt Bão, PA Việt Nam, Cloudflare…), tạo bản ghi theo hướng dẫn Vercel hiển thị:
   - Tên miền con: **CNAME** `hrm` → `cname.vercel-dns.com`
   - Tên miền gốc: **A** `@` → `76.76.21.21`
3. Vercel tự cấp và gia hạn chứng chỉ **HTTPS (Let's Encrypt)**. Hệ thống gửi header HSTS và cookie `Secure`, nên luôn truy cập bằng `https://`.

### Cập nhật phiên bản sau này
Đẩy mã mới lên nhánh `main` → Vercel tự build. Migration mới (nếu có) chạy tự động khi build.
Nếu build không thấy `DATABASE_URL` (ví dụ khi chỉ khai báo biến cho Runtime), chạy thủ công trên máy: `DATABASE_URL=... node scripts/migrate.js`.

---

## Phương án B — Máy chủ riêng (VPS) / Docker

Phù hợp khi muốn đặt máy chủ tại Việt Nam hoặc tự quản lý toàn bộ.

### B1. Docker (khuyến nghị cho VPS)
```bash
# trên VPS Ubuntu 22.04+ đã cài Docker
git clone <repo> tanhung-hrm && cd tanhung-hrm
cp .env.example .env && nano .env      # điền các biến, đặt TRUST_PROXY=true khi chạy sau Caddy/Nginx
docker build -t tanhung-hrm .
docker run -d --name tanhung-hrm --restart unless-stopped --env-file .env -p 127.0.0.1:3000:3000 tanhung-hrm
```
Container tự chạy migration rồi khởi động máy chủ. PostgreSQL có thể là dịch vụ quản lý (Neon, Supabase…) hoặc cài trên cùng VPS (`apt install postgresql`).

### B2. Chạy trực tiếp bằng Node.js 20+
```bash
cp .env.example .env && nano .env
node scripts/migrate.js
node server/index.js            # nên chạy dưới systemd hoặc pm2 để tự khởi động lại
```

### B3. HTTPS bằng Caddy (tự cấp chứng chỉ)
`/etc/caddy/Caddyfile`:
```
hrm.tanhung.vn {
    reverse_proxy 127.0.0.1:3000
}
```
`sudo systemctl reload caddy`. Trỏ bản ghi **A** của `hrm.tanhung.vn` về IP VPS. Trong `.env` đặt `TRUST_PROXY=true` và `NODE_ENV=production`.

---

## Danh sách kiểm tra sau khi deploy
- [ ] `/api/health` trả `db: connected`, `migrated: true`
- [ ] Truy cập `/api/state` khi chưa đăng nhập → `401`
- [ ] Thiết lập mật khẩu lần đầu thành công; mở lại trang setup → hệ thống báo đã khởi tạo
- [ ] Đăng nhập, nạp dữ liệu mẫu hoặc nhập dữ liệu thật, tải lại trang → dữ liệu còn nguyên
- [ ] Đổi mật khẩu: email OTP đến hộp thư (kiểm tra cả thư rác), đăng nhập lại bằng mật khẩu mới
- [ ] Tải bản sao lưu đầu tiên và cất giữ an toàn (xem `docs/BACKUP.md`)
- [ ] Xuất thử Excel bảng lương và PDF phiếu lương
