'use strict';
/**
 * Gửi email qua SMTP (STARTTLS / TLS, AUTH PLAIN|LOGIN) hoặc API Resend — không phụ thuộc thư viện ngoài.
 * Mọi thông tin máy chủ thư lấy từ biến môi trường (xem .env.example). Không ghi nội dung mã OTP vào log.
 */
const net = require('net');
const tls = require('tls');
const os = require('os');
const crypto = require('crypto');
const config = require('./config');

function encWord(s) { return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?='; }
function b64lines(s) { return Buffer.from(s, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'); }
function addrOnly(a) { const m = /<([^>]+)>/.exec(a); return (m ? m[1] : a).trim(); }
function formatFrom(a) { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(a); return m && m[1] ? `${encWord(m[1])} <${m[2]}>` : a; }

function buildMime({ from, to, subject, text, html }) {
  const boundary = 'th_' + crypto.randomBytes(12).toString('hex');
  const domain = addrOnly(from).split('@')[1] || 'localhost';
  return [
    `From: ${formatFrom(from)}`, `To: ${to}`, `Subject: ${encWord(subject)}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`, 'MIME-Version: 1.0', 'Auto-Submitted: auto-generated',
    `Content-Type: multipart/alternative; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64lines(text),
    `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64lines(html),
    `--${boundary}--`, '',
  ].join('\r\n');
}

/* ---------- SMTP ---------- */
class SmtpSession {
  constructor(sock) { this.attach(sock); }
  attach(sock) { this.sock = sock; this.buf = ''; this.waiter = null; sock.setEncoding('utf8'); sock.on('data', (d) => { this.buf += d; this.check(); }); sock.on('error', (e) => { if (this.waiter) { const w = this.waiter; this.waiter = null; w.reject(e); } }); }
  check() {
    if (!this.waiter) return;
    const lines = this.buf.split('\r\n'); const done = lines.findIndex((l) => /^\d{3} /.test(l));
    if (done < 0) return;
    const resp = lines.slice(0, done + 1); this.buf = lines.slice(done + 1).join('\r\n');
    const w = this.waiter; this.waiter = null; w.resolve({ code: Number(resp[done].slice(0, 3)), lines: resp.map((l) => l.slice(4)) });
  }
  read(timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('SMTP: hết thời gian chờ phản hồi')), timeoutMs);
      this.waiter = { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } }; this.check();
    });
  }
  async cmd(line, expect) {
    if (line != null) this.sock.write(line + '\r\n');
    const r = await this.read();
    if (expect && !expect.includes(r.code)) { const e = new Error(`SMTP lỗi ${r.code}: ${r.lines.join(' ').slice(0, 200)}`); e.smtpCode = r.code; throw e; }
    return r;
  }
}
function connectSocket(host, port, secure) {
  return new Promise((resolve, reject) => {
    const opts = { host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: config.smtp.rejectUnauthorized };
    const s = secure ? tls.connect(opts) : net.connect(opts);
    s.once(secure ? 'secureConnect' : 'connect', () => resolve(s)); s.once('error', reject);
    s.setTimeout(30000, () => s.destroy(new Error('SMTP: hết thời gian kết nối')));
  });
}
async function sendSmtp(message) {
  const c = config.smtp;
  if (!c.host || !c.from) throw new Error('Chưa cấu hình SMTP (SMTP_HOST, MAIL_FROM)');
  const sock = await connectSocket(c.host, c.port, c.secure);
  const s = new SmtpSession(sock);
  try {
    await s.cmd(null, [220]);
    const helo = os.hostname().replace(/[^A-Za-z0-9.-]/g, '') || 'tanhung-hrm';
    let ehlo = await s.cmd('EHLO ' + helo, [250]);
    if (!c.secure) {
      const canTls = ehlo.lines.some((l) => /^STARTTLS/i.test(l));
      if (canTls) {
        await s.cmd('STARTTLS', [220]);
        sock.removeAllListeners('data');
        const tsock = await new Promise((resolve, reject) => { const t = tls.connect({ socket: sock, servername: net.isIP(c.host) ? undefined : c.host, rejectUnauthorized: c.rejectUnauthorized }); t.once('secureConnect', () => resolve(t)); t.once('error', reject); });
        s.attach(tsock);
        ehlo = await s.cmd('EHLO ' + helo, [250]);
      } else if (c.requireTls) throw new Error('Máy chủ SMTP không hỗ trợ STARTTLS (đặt SMTP_REQUIRE_TLS=false nếu chấp nhận gửi không mã hóa — không khuyến nghị)');
    }
    if (c.user) {
      const auth = (ehlo.lines.find((l) => /^AUTH[ =]/i.test(l)) || '').toUpperCase();
      if (auth.includes('PLAIN') || !auth.includes('LOGIN')) await s.cmd('AUTH PLAIN ' + Buffer.from(`\0${c.user}\0${c.pass}`, 'utf8').toString('base64'), [235]);
      else { await s.cmd('AUTH LOGIN', [334]); await s.cmd(Buffer.from(c.user).toString('base64'), [334]); await s.cmd(Buffer.from(c.pass).toString('base64'), [235]); }
    }
    await s.cmd(`MAIL FROM:<${addrOnly(c.from)}>`, [250]);
    await s.cmd(`RCPT TO:<${addrOnly(message.to)}>`, [250, 251]);
    await s.cmd('DATA', [354]);
    const body = buildMime({ ...message, from: c.from }).replace(/^\./gm, '..');
    await s.cmd(body + '\r\n.', [250]);
    try { await s.cmd('QUIT'); } catch (e) { /* bỏ qua */ }
  } finally { try { s.sock.end(); } catch (e) { /* */ } }
}

/* ---------- Resend (transactional email API) ---------- */
async function sendResend(message) {
  const key = config.resend.apiKey; if (!key || !config.smtp.from) throw new Error('Chưa cấu hình RESEND_API_KEY / MAIL_FROM');
  const res = await fetch(config.resend.endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.smtp.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }) });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Resend lỗi ${res.status}: ${t.slice(0, 200)}`); }
}

async function sendMail(message) {
  if (config.emailProvider === 'resend') return sendResend(message);
  if (config.emailProvider === 'smtp') return sendSmtp(message);
  throw new Error('Chưa cấu hình dịch vụ gửi email (EMAIL_PROVIDER=smtp hoặc resend)');
}

/* ---------- Mẫu email OTP ---------- */
function otpEmail({ code, minutes, purposeLabel }) {
  const subject = config.otpSubject;
  const digits = code.split('').map((d) => `<td style="width:46px;height:56px;background:#f4f3f0;border:1px solid #e0ddd6;border-radius:8px;font:700 28px/56px 'Segoe UI',Arial,sans-serif;color:#1c1b19;text-align:center">${d}</td><td style="width:6px"></td>`).join('');
  const html = `<!DOCTYPE html><html lang="vi"><body style="margin:0;background:#f4f3f0;padding:24px 12px;font-family:'Segoe UI',Arial,sans-serif;color:#1c1b19">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
  <table role="presentation" width="520" cellspacing="0" cellpadding="0" style="max-width:520px;width:100%;background:#ffffff;border-radius:12px;border:1px solid #e6e3dd">
   <tr><td style="padding:22px 28px;border-bottom:1px solid #eee"><span style="display:inline-block;background:#c4532f;color:#fff;font-weight:800;border-radius:8px;padding:6px 10px;letter-spacing:.5px">TAN HUNG HRM</span>
     <div style="font-size:12px;color:#888;margin-top:6px">Công ty TNHH Mỹ thuật Tân Hưng · Hệ thống quản trị nhân sự nội bộ</div></td></tr>
   <tr><td style="padding:26px 28px 6px"><h1 style="font-size:19px;margin:0 0 10px">Mã xác thực ${purposeLabel}</h1>
     <p style="margin:0 0 18px;line-height:1.6;color:#444">Bạn vừa yêu cầu ${purposeLabel} cho tài khoản quản trị <b>${config.adminUsername}</b>. Nhập mã gồm 6 chữ số dưới đây để tiếp tục:</p>
     <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 auto 18px"><tr>${digits}</tr></table>
     <p style="margin:0 0 6px;text-align:center;color:#a5461b;font-weight:600">Mã có hiệu lực trong ${minutes} phút và chỉ sử dụng được một lần.</p></td></tr>
   <tr><td style="padding:16px 28px 24px"><div style="background:#fff3d9;border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.55;color:#7a4a00">
     <b>Không phải bạn thực hiện?</b> Hãy bỏ qua email này và không chia sẻ mã cho bất kỳ ai. Mật khẩu của bạn chưa bị thay đổi. Nên đăng nhập và kiểm tra mục <i>Phiên đăng nhập</i> nếu nghi ngờ có truy cập trái phép.</div></td></tr>
   <tr><td style="padding:14px 28px;border-top:1px solid #eee;font-size:11px;color:#999">Email tự động từ TAN HUNG HRM — vui lòng không trả lời.</td></tr>
  </table></td></tr></table></body></html>`;
  const text = `TAN HUNG HRM — Công ty TNHH Mỹ thuật Tân Hưng\n\nMã xác thực ${purposeLabel}: ${code}\nMã có hiệu lực trong ${minutes} phút và chỉ dùng được một lần.\n\nNếu bạn không thực hiện yêu cầu này, hãy bỏ qua email và không chia sẻ mã cho bất kỳ ai.`;
  return { subject, html, text };
}

module.exports = { sendMail, otpEmail, buildMime };
