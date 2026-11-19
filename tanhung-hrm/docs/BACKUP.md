# Sao lưu & khôi phục dữ liệu

Có hai cấp sao lưu, nên dùng **cả hai**.

## 1. Sao lưu nghiệp vụ (file JSON)
Chứa toàn bộ dữ liệu HRM: cài đặt, hồ sơ nhân viên và lịch sử lương, chấm công, đi trễ, tăng ca, ứng lương, phụ cấp, thưởng, khấu trừ, bảng lương đã chốt (ảnh chụp cố định) và lịch sử chốt/mở khóa. Không chứa mật khẩu hay phiên đăng nhập.

**Trên giao diện:** Cài đặt › Dữ liệu & sao lưu › **Tải bản sao lưu (JSON)**.
**Bằng dòng lệnh** (máy có mã nguồn + `DATABASE_URL`):
```bash
npm run backup                         # tạo backup-tanhung-hrm-YYYY-MM-DD-HH-MM-SS.json
npm run backup -- /duong-dan/sao-luu.json
```

**Khôi phục:**
- Giao diện: Cài đặt › Dữ liệu & sao lưu › **Khôi phục từ file** → xác nhận.
- Dòng lệnh: `npm run restore -- sao-luu.json --yes`

Khôi phục chạy trong **một transaction**: nếu file lỗi, toàn bộ thao tác bị hủy và dữ liệu cũ giữ nguyên. Thao tác được ghi vào nhật ký.
File sao lưu từ **bản prototype** (nút "Sao lưu" cũ) cũng khôi phục được. Đây là cách chuyển dữ liệu đang nhập thử sang website chính thức.

## 2. Sao lưu cấp CSDL (pg_dump)
Bao gồm mọi bảng, kể cả tài khoản quản trị, nhật ký đăng nhập và nhật ký thay đổi. Cần công cụ `pg_dump`/`pg_restore` cùng phiên bản lớn với máy chủ (PostgreSQL 16/17).

```bash
# sao lưu (định dạng nén, khôi phục chọn lọc được)
pg_dump "$DATABASE_URL" --format=custom --no-owner --file=tanhung-$(date +%F).dump

# khôi phục vào một CSDL trống
createdb tanhung_restore       # hoặc tạo database/branch mới trên Neon
pg_restore --no-owner --dbname="postgres://.../tanhung_restore?sslmode=require" tanhung-YYYY-MM-DD.dump
```
Với Neon, dùng chuỗi kết nối **không pooler** (bỏ `-pooler` trong tên máy chủ) cho `pg_dump`/`pg_restore`.
Sau khi khôi phục vào CSDL mới, đổi `DATABASE_URL` trên Vercel sang CSDL đó rồi Redeploy.

## 3. Sao lưu tự động của nhà cung cấp
- **Neon:** có *Point-in-time restore* (khôi phục về một thời điểm trong khoảng lưu giữ; gói miễn phí giữ ngắn, gói trả phí giữ 7–30 ngày) và *Branches* để thử khôi phục mà không ảnh hưởng dữ liệu đang chạy.
- **Supabase / dịch vụ khác:** bật sao lưu hằng ngày trong bảng điều khiển.

## 4. Lịch sao lưu khuyến nghị
| Khi nào | Việc cần làm |
|---|---|
| Sau mỗi lần **chốt lương tháng** | Tải bản sao lưu JSON, lưu vào ổ chung của công ty (Google Drive/OneDrive) |
| Hằng tuần | `pg_dump` (hoặc kiểm tra sao lưu tự động của nhà cung cấp) |
| Hằng quý | **Diễn tập khôi phục**: khôi phục bản sao lưu vào CSDL thử, đăng nhập kiểm tra số liệu bảng lương |

Bản sao lưu chứa dữ liệu cá nhân (CCCD, lương): lưu ở nơi có kiểm soát truy cập, tốt nhất là mã hóa (7-Zip AES-256 hoặc ổ đĩa mã hóa).

## 5. Lịch sử thay đổi
Ngoài sao lưu, mọi thay đổi quan trọng đều được ghi ở **Bảo mật › Nhật ký thay đổi dữ liệu** (bảng `audit_log`), kèm thời gian và IP. Bảng lương đã chốt luôn có ảnh chụp cố định; mỗi lần mở khóa/chốt lại đều lưu lý do và chênh lệch thực lĩnh từng người.
