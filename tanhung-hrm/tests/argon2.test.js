'use strict';
const test = require('node:test'); const assert = require('node:assert');
const crypto = require('crypto');
const A = require('../server/crypto/argon2');
test('BLAKE2b-512 khớp với OpenSSL', () => {
  for (const len of [0, 3, 127, 128, 129, 1000]) {
    const data = crypto.randomBytes(len);
    const ours = Buffer.from(A.blake2b([new Uint8Array(data)], 64)).toString('hex');
    assert.strictEqual(ours, crypto.createHash('blake2b512').update(data).digest('hex'));
  }
});
test('Argon2id — vector kiểm thử RFC 9106 §5.3', () => {
  const tag = A.argon2idRaw({ password: new Uint8Array(32).fill(1), salt: new Uint8Array(16).fill(2), secret: new Uint8Array(8).fill(3), ad: new Uint8Array(12).fill(4), t: 3, m: 32, p: 4, tagLength: 32 });
  assert.strictEqual(Buffer.from(tag).toString('hex'), '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659');
});
test('hash/verify mật khẩu (tham số OWASP)', () => {
  const t0 = Date.now(); const h = A.hashPassword('Mật-khẩu Đúng 2026!'); const ms = Date.now() - t0;
  console.log('    thời gian băm m=19MiB,t=2:', ms, 'ms ·', h.slice(0, 40) + '…');
  assert.match(h, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.ok(A.verifyPassword('Mật-khẩu Đúng 2026!', h));
  assert.ok(!A.verifyPassword('Mật-khẩu Đúng 2026?', h));
  assert.ok(!A.verifyPassword('x', 'rác'));
});
