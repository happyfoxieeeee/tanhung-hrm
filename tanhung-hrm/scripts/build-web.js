'use strict';
// Gộp mã nguồn giao diện (web/*.js) thành public/assets/app.js — không cần công cụ build bên ngoài.
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const order = ['app-core.js', 'views-a.js', 'views-b.js', 'views-c.js', 'auth.js', 'events.js'];
const body = order.map((f) => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(root, 'web', f), 'utf8')).join('\n');
const out = `/* TAN HUNG HRM — mã giao diện (được tạo bởi scripts/build-web.js từ thư mục web/, đừng sửa trực tiếp) */\n(function () {\n'use strict';\nconst E = window.Engine;\n${body}\n})();\n`;
fs.writeFileSync(path.join(root, 'public', 'assets', 'app.js'), out);
console.log('Đã tạo public/assets/app.js (' + out.length + ' byte)');
