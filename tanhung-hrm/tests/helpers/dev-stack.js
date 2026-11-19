'use strict';
// Dựng môi trường chạy thử: CSDL mới + SMTP cục bộ + máy chủ. Mã OTP nhận qua email được ghi vào file để kiểm thử trình duyệt.
const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path');
const { Pool } = require('../../server/db/pg'); const { startSink } = require('./smtp-sink');
(async () => {
  const ADMIN = 'postgres://hrm:Pg-Test%232026@127.0.0.1:55432/postgres'; const NAME = 'tanhung_e2e';
  const a = new Pool(ADMIN); await a.query('DROP DATABASE IF EXISTS ' + NAME); await a.query('CREATE DATABASE ' + NAME); await a.end();
  const sink = await startSink();
  setInterval(() => { const m = sink.messages[sink.messages.length - 1]; if (!m) return; const t = Buffer.from(m.data.split('Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString(); fs.writeFileSync('/tmp/thhrm-otp.txt', /: (\d{6})\n/.exec(t)[1] + ' ' + sink.messages.length); }, 200);
  const env = { ...process.env, PORT: '3456', DATABASE_URL: ADMIN.replace('/postgres', '/' + NAME), APP_SECRET: 'e2e-secret-0123456789-abcdefghijklmnopqrstuvwxyz', INITIAL_SETUP_TOKEN: 'E2E-setup-token-0123456789abcdef',
    ADMIN_OTP_EMAIL: 'quantri@tanhung.vn', EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(sink.port), SMTP_USER: sink.user, SMTP_PASS: sink.pass, MAIL_FROM: 'TAN HUNG HRM <no-reply@tanhung.vn>', SMTP_TLS_REJECT_UNAUTHORIZED: 'false', OTP_RESEND_COOLDOWN_SECONDS: '3' };
  await new Promise((res, rej) => spawn(process.execPath, [path.join(__dirname, '../../scripts/migrate.js')], { env, stdio: 'inherit' }).on('exit', (c) => (c ? rej(new Error('migrate')) : res())));
  const s = spawn(process.execPath, [path.join(__dirname, '../../server/index.js')], { env, stdio: 'inherit' });
  process.on('SIGTERM', () => { s.kill(); sink.close(); process.exit(0); });
})();
