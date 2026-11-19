'use strict';
const test = require('node:test'); const assert = require('node:assert');
const { startSink } = require('./helpers/smtp-sink');
test('Gửi email OTP qua SMTP thật (STARTTLS + AUTH)', async () => {
  const sink = await startSink();
  Object.assign(process.env, { EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(sink.port), SMTP_USER: sink.user, SMTP_PASS: sink.pass, MAIL_FROM: 'TAN HUNG HRM <no-reply@tanhung.test>', SMTP_TLS_REJECT_UNAUTHORIZED: 'false' });
  delete require.cache[require.resolve('../server/config')]; delete require.cache[require.resolve('../server/mail')];
  const mail = require('../server/mail');
  const m = mail.otpEmail({ code: '482915', minutes: 5, purposeLabel: 'đổi mật khẩu' });
  await mail.sendMail({ to: 'quantri@tanhung.test', ...m });
  sink.close();
  assert.strictEqual(sink.messages.length, 1); const msg = sink.messages[0];
  assert.ok(msg.tls, 'phải chuyển sang TLS'); assert.ok(msg.auth, 'phải đăng nhập SMTP');
  assert.deepStrictEqual(msg.rcpt, ['<quantri@tanhung.test>']);
  assert.match(msg.data, /Subject: =\?UTF-8\?B\?/);
  const subj = Buffer.from(/Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(msg.data)[1], 'base64').toString(); assert.strictEqual(subj, '[TAN HUNG HRM] Mã xác thực đổi mật khẩu');
  const htmlB64 = msg.data.split('Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
  const html = Buffer.from(htmlB64.replace(/\r\n/g, ''), 'base64').toString(); assert.ok(html.includes('>4<') && html.includes('5 phút'));
});
test('SMTP sai mật khẩu → báo lỗi rõ ràng', async () => {
  const sink = await startSink();
  Object.assign(process.env, { SMTP_PORT: String(sink.port), SMTP_PASS: 'sai' });
  delete require.cache[require.resolve('../server/config')]; delete require.cache[require.resolve('../server/mail')];
  const mail = require('../server/mail');
  await assert.rejects(mail.sendMail({ to: 'a@b.c', subject: 's', text: 't', html: 'h' }), /535/); sink.close();
});
