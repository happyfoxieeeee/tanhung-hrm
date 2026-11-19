'use strict';
// Chạy khi Vercel build: tạo app.js từ web/ và áp dụng migration nếu đã có DATABASE_URL
require('./build-web');
if (!process.env.DATABASE_URL) { console.warn('⚠ Chưa có DATABASE_URL lúc build — bỏ qua migration. Hãy chạy "npm run migrate" thủ công.'); process.exit(0); }
require('./migrate');
