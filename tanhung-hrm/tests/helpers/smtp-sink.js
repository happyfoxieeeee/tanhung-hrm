'use strict';
// Máy chủ SMTP cục bộ dùng cho kiểm thử: hỗ trợ EHLO, STARTTLS, AUTH PLAIN/LOGIN, nhận thư thật qua giao thức SMTP
const net = require('net'); const tls = require('tls'); const fs = require('fs'); const { execSync } = require('child_process'); const os = require('os'); const path = require('path');
function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'smtpcert-'));
  execSync(`openssl req -new -x509 -days 2 -nodes -subj "/CN=localhost" -keyout ${dir}/k.pem -out ${dir}/c.pem 2>/dev/null`);
  return { key: fs.readFileSync(dir + '/k.pem'), cert: fs.readFileSync(dir + '/c.pem') };
}
function startSink({ user = 'otp@test.local', pass = 'smtp-pass' } = {}) {
  const { key, cert } = makeCert(); const messages = [];
  const server = net.createServer((raw) => {
    let sock = raw; let buf = ''; let state = 'cmd'; let data = ''; let env = { tls: false, auth: false, rcpt: [] }; let authStep = null;
    const send = (l) => sock.write(l + '\r\n');
    const onData = (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (state === 'data') { if (line === '.') { state = 'cmd'; messages.push({ ...env, data: data.replace(/^\.\./gm, '.') }); data = ''; send('250 OK queued'); } else data += line + '\r\n'; continue; }
        if (authStep === 'user') { env.user = Buffer.from(line, 'base64').toString(); authStep = 'pass'; send('334 UGFzc3dvcmQ6'); continue; }
        if (authStep === 'pass') { const ok = env.user === user && Buffer.from(line, 'base64').toString() === pass; authStep = null; env.auth = ok; send(ok ? '235 OK' : '535 Bad credentials'); continue; }
        const up = line.toUpperCase();
        if (up.startsWith('EHLO')) { sock.write('250-localhost\r\n' + (env.tls ? '' : '250-STARTTLS\r\n') + '250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n'); }
        else if (up === 'STARTTLS') { send('220 Go ahead'); raw.removeListener('data', onData); const t = new tls.TLSSocket(raw, { isServer: true, key, cert }); sock = t; env.tls = true; t.on('data', onData); t.on('error', () => {}); }
        else if (up.startsWith('AUTH PLAIN')) { const p = Buffer.from(line.slice(11), 'base64').toString().split('\0'); env.auth = p[1] === user && p[2] === pass; send(env.auth ? '235 OK' : '535 Bad credentials'); }
        else if (up === 'AUTH LOGIN') { authStep = 'user'; send('334 VXNlcm5hbWU6'); }
        else if (up.startsWith('MAIL FROM')) { if (!env.auth) send('530 Auth required'); else { env.from = line.slice(10); send('250 OK'); } }
        else if (up.startsWith('RCPT TO')) { env.rcpt.push(line.slice(8)); send('250 OK'); }
        else if (up === 'DATA') { state = 'data'; send('354 End with .'); }
        else if (up === 'QUIT') { send('221 Bye'); sock.end(); }
        else send('502 Unknown');
      }
    };
    raw.on('data', onData); raw.on('error', () => {}); send('220 localhost test SMTP');
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ port: server.address().port, messages, close: () => server.close(), user, pass })));
}
module.exports = { startSink };
