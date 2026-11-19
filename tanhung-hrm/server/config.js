'use strict';
/** Cấu hình đọc từ biến môi trường. Không có secret nào được viết cứng trong mã nguồn. */
const fs = require('fs');
const path = require('path');
// Tự đọc file .env (nếu có) khi chạy trên máy chủ riêng; không ghi đè biến đã có sẵn
(function loadDotEnv() {
  const f = path.join(__dirname, '..', '.env');
  if (process.env.VERCEL || !fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line); if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2]; if (/^".*"$|^'.*'$/.test(v)) v = v.slice(1, -1); else v = v.replace(/\s+#.*$/, '');
    process.env[m[1]] = v;
  }
})();
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));
const env = process.env;
const production = env.NODE_ENV === 'production' || !!env.VERCEL;

const config = {
  production,
  appName: 'TAN HUNG HRM',
  company: 'CÔNG TY TNHH MỸ THUẬT TÂN HƯNG',
  timezone: env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh',
  // Tài khoản quản trị duy nhất — username cố định theo yêu cầu
  adminUsername: 'hrsystem-ctytanhung',
  databaseUrl: env.DATABASE_URL || '',
  poolMax: int(env.PG_POOL_MAX, env.VERCEL ? 2 : 5),
  appSecret: env.APP_SECRET || '',
  initialSetupToken: env.INITIAL_SETUP_TOKEN || '',
  adminOtpEmail: (env.ADMIN_OTP_EMAIL || '').trim(),
  emailProvider: (env.EMAIL_PROVIDER || '').toLowerCase(),
  smtp: {
    host: env.SMTP_HOST || '', port: int(env.SMTP_PORT, 587), secure: bool(env.SMTP_SECURE, false),
    user: env.SMTP_USER || '', pass: env.SMTP_PASS || '', from: env.MAIL_FROM || '',
    requireTls: bool(env.SMTP_REQUIRE_TLS, true), rejectUnauthorized: bool(env.SMTP_TLS_REJECT_UNAUTHORIZED, true),
  },
  resend: { apiKey: env.RESEND_API_KEY || '', endpoint: env.RESEND_ENDPOINT || 'https://api.resend.com/emails' },
  otpSubject: '[TAN HUNG HRM] Mã xác thực đổi mật khẩu',
  session: {
    cookieName: production && bool(env.COOKIE_SECURE, true) ? '__Host-thhrm_sid' : 'thhrm_sid',
    idleMinutesDefault: int(env.SESSION_IDLE_MINUTES, 30),
    maxHours: int(env.SESSION_MAX_HOURS, 12),
    secureCookie: bool(env.COOKIE_SECURE, production),
  },
  otp: { ttlMinutes: 5, maxAttempts: int(env.OTP_MAX_ATTEMPTS, 5), cooldownSeconds: int(env.OTP_RESEND_COOLDOWN_SECONDS, 60), maxPerHour: int(env.OTP_MAX_PER_HOUR, 5), ticketMinutes: 10 },
  login: { maxFailsPerIp: int(env.LOGIN_MAX_FAILS_PER_IP, 5), maxFailsGlobal: int(env.LOGIN_MAX_FAILS_GLOBAL, 20), windowMinutes: int(env.LOGIN_WINDOW_MINUTES, 15), lockMinutes: int(env.LOGIN_LOCK_MINUTES, 15) },
  trustProxy: bool(env.TRUST_PROXY, !!env.VERCEL),
  port: int(env.PORT, 3000),
  maxBodyBytes: int(env.MAX_BODY_BYTES, 8 * 1024 * 1024),
};

function validate() {
  const errs = [];
  if (!config.databaseUrl) errs.push('DATABASE_URL');
  if (!config.appSecret || config.appSecret.length < 32) errs.push('APP_SECRET (tối thiểu 32 ký tự ngẫu nhiên)');
  return errs;
}
config.validate = validate;
module.exports = config;
