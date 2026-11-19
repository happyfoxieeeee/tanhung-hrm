'use strict';
/**
 * Driver PostgreSQL tối giản (giao thức v3) viết bằng Node thuần — không phụ thuộc thư viện ngoài.
 * Hỗ trợ: TLS (sslmode), xác thực SCRAM-SHA-256 / MD5 / cleartext, truy vấn tham số hóa ($1, $2…)
 * qua extended protocol (câu lệnh không đặt tên → tương thích PgBouncer/Neon pooler), simple query
 * cho migration, transaction và connection pool.
 */
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

class PgError extends Error {
  constructor(fields) { super(fields.M || 'Lỗi PostgreSQL'); this.code = fields.C; this.detail = fields.D; this.constraint = fields.n; this.severity = fields.S; this.table = fields.t; this.column = fields.c; }
}

function parseUrl(url) {
  const u = new URL(url);
  const sslmode = u.searchParams.get('sslmode') || process.env.PGSSLMODE || (/(localhost|127\.0\.0\.1)$/.test(u.hostname) ? 'disable' : 'require');
  return {
    host: u.hostname, port: Number(u.port || 5432), user: decodeURIComponent(u.username), password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, '') || 'postgres'), sslmode,
  };
}

/* ---------- Ghi thông điệp ---------- */
function msg(type, body) {
  const b = Buffer.alloc(5 + body.length); b.write(type, 0, 'latin1'); b.writeInt32BE(4 + body.length, 1); body.copy(b, 5); return b;
}
const cstr = (s) => Buffer.concat([Buffer.from(String(s), 'utf8'), Buffer.from([0])]);
const i16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const i32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };

function serialize(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return '\\x' + v.toString('hex');
  if (typeof v === 'boolean') return v ? 't' : 'f';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
function parseValue(oid, s) {
  switch (oid) {
    case 16: return s === 't';
    case 20: case 21: case 23: case 26: case 700: case 701: case 1700: return Number(s);
    case 114: case 3802: return JSON.parse(s);
    case 1184: case 1114: { let iso = s.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1'); iso = oid === 1114 ? iso + 'Z' : iso.replace(/([+-]\d\d)$/, '$1:00'); return new Date(iso); }
    default: return s; // text, varchar, date (YYYY-MM-DD), time, uuid…
  }
}

class Connection {
  constructor(cfg) { this.cfg = cfg; this.buf = Buffer.alloc(0); this.queue = []; this.busy = false; this.dead = false; this.lastUsed = Date.now(); }

  async connect() {
    const { cfg } = this;
    let sock = await new Promise((res, rej) => { const s = net.connect({ host: cfg.host, port: cfg.port }); s.once('connect', () => res(s)); s.once('error', rej); s.setTimeout(15000, () => { s.destroy(new Error('Hết thời gian kết nối CSDL')); }); });
    sock.setTimeout(0); sock.setNoDelay(true);
    if (cfg.sslmode !== 'disable') {
      sock.write(Buffer.from([0, 0, 0, 8, 0x04, 0xd2, 0x16, 0x2f]));
      const ans = await new Promise((res, rej) => { sock.once('data', (d) => res(d[0])); sock.once('error', rej); });
      if (ans === 0x53) {
        const verify = cfg.sslmode === 'verify-full' || cfg.sslmode === 'verify-ca' || !!process.env.DATABASE_SSL_CA;
        sock = await new Promise((res, rej) => {
          const t = tls.connect({ socket: sock, servername: net.isIP(cfg.host) ? undefined : cfg.host, rejectUnauthorized: verify, ca: process.env.DATABASE_SSL_CA ? process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n') : undefined,
            checkServerIdentity: cfg.sslmode === 'verify-ca' ? () => undefined : tls.checkServerIdentity });
          t.once('secureConnect', () => res(t)); t.once('error', rej);
        });
      } else if (cfg.sslmode === 'require' || cfg.sslmode.startsWith('verify')) {
        sock.destroy(); throw new Error('Máy chủ CSDL không hỗ trợ SSL nhưng cấu hình yêu cầu SSL');
      }
    }
    this.sock = sock;
    sock.on('data', (d) => this.onData(d));
    sock.on('error', (e) => this.fail(e));
    sock.on('close', () => this.fail(new Error('Kết nối CSDL đã đóng')));
    await this.startup();
    return this;
  }

  fail(err) {
    if (this.dead) return; this.dead = true;
    const h = this.handler; this.handler = null; if (h) h.reject(err);
    this.queue.splice(0).forEach((q) => q.reject(err));
    try { this.sock && this.sock.destroy(); } catch (e) { /* bỏ qua */ }
  }

  onData(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1); if (this.buf.length < 1 + len) break;
      const type = String.fromCharCode(this.buf[0]); const body = this.buf.subarray(5, 1 + len);
      this.buf = this.buf.subarray(1 + len);
      if (type === 'N' || type === 'A') continue; // notice / notification
      if (type === 'S' && !this.handler) continue;
      if (this.handler) this.handler.onMessage(type, body);
    }
  }

  // Chờ chuỗi thông điệp đến khi handler gọi done()
  run(onMessage) {
    return new Promise((resolve, reject) => { this.handler = { onMessage: (t, b) => onMessage(t, b, (v) => { this.handler = null; resolve(v); }, (e) => { this.handler = null; reject(e); }), reject }; });
  }

  async startup() {
    const { cfg } = this;
    const params = Buffer.concat([i32(196608), cstr('user'), cstr(cfg.user), cstr('database'), cstr(cfg.database), cstr('client_encoding'), cstr('UTF8'), cstr('application_name'), cstr('tanhung-hrm'), Buffer.from([0])]);
    const startMsg = Buffer.concat([i32(params.length + 4), params]);
    let scram = null; let errFields = null;
    const p = this.run((type, body, done, fail) => {
      if (type === 'R') {
        const code = body.readInt32BE(0);
        if (code === 0) return; // AuthenticationOk — chờ ReadyForQuery
        if (code === 3) return this.sock.write(msg('p', cstr(cfg.password)));
        if (code === 5) { const salt = body.subarray(4, 8); const inner = crypto.createHash('md5').update(cfg.password + cfg.user).digest('hex'); return this.sock.write(msg('p', cstr('md5' + crypto.createHash('md5').update(Buffer.concat([Buffer.from(inner), salt])).digest('hex')))); }
        if (code === 10) {
          const mechs = body.subarray(4).toString('utf8').split('\0'); if (!mechs.includes('SCRAM-SHA-256')) return fail(new Error('Máy chủ không hỗ trợ SCRAM-SHA-256'));
          const nonce = crypto.randomBytes(18).toString('base64'); const first = 'n=*,r=' + nonce; scram = { nonce, first };
          const data = Buffer.from('n,,' + first, 'utf8');
          return this.sock.write(msg('p', Buffer.concat([cstr('SCRAM-SHA-256'), i32(data.length), data])));
        }
        if (code === 11) {
          const sf = body.subarray(4).toString('utf8'); const a = Object.fromEntries(sf.split(',').map((kv) => [kv[0], kv.slice(2)]));
          if (!a.r || !a.r.startsWith(scram.nonce)) return fail(new Error('SCRAM: nonce không hợp lệ'));
          const salted = crypto.pbkdf2Sync(cfg.password.normalize('NFKC'), Buffer.from(a.s, 'base64'), Number(a.i), 32, 'sha256');
          const clientKey = crypto.createHmac('sha256', salted).update('Client Key').digest();
          const storedKey = crypto.createHash('sha256').update(clientKey).digest();
          const finalNoProof = 'c=biws,r=' + a.r; const authMsg = scram.first + ',' + sf + ',' + finalNoProof;
          const sig = crypto.createHmac('sha256', storedKey).update(authMsg).digest();
          const proof = Buffer.alloc(32); for (let i = 0; i < 32; i++) proof[i] = clientKey[i] ^ sig[i];
          scram.serverSig = crypto.createHmac('sha256', crypto.createHmac('sha256', salted).update('Server Key').digest()).update(authMsg).digest('base64');
          return this.sock.write(msg('p', Buffer.from(finalNoProof + ',p=' + proof.toString('base64'), 'utf8')));
        }
        if (code === 12) { const v = body.subarray(4).toString('utf8'); if (v !== 'v=' + scram.serverSig) return fail(new Error('SCRAM: chữ ký máy chủ không khớp')); return; }
        return fail(new Error('Phương thức xác thực CSDL không được hỗ trợ: ' + code));
      }
      if (type === 'E') { errFields = parseError(body); return fail(new PgError(errFields)); }
      if (type === 'Z') return done();
    });
    this.sock.write(startMsg);
    await p;
  }

  /** Truy vấn tham số hóa (extended protocol) */
  query(text, params = []) {
    return new Promise((resolve, reject) => { this.queue.push({ text, params, resolve, reject }); this.pump(); });
  }
  /** Simple query — cho phép nhiều câu lệnh (dùng cho migration) */
  simple(text) {
    return new Promise((resolve, reject) => { this.queue.push({ text, simple: true, resolve, reject }); this.pump(); });
  }
  async pump() {
    if (this.busy || this.dead) return; const q = this.queue.shift(); if (!q) return;
    this.busy = true; this.lastUsed = Date.now();
    try { q.resolve(await (q.simple ? this.execSimple(q.text) : this.execExtended(q.text, q.params))); }
    catch (e) { q.reject(e); }
    finally { this.busy = false; this.lastUsed = Date.now(); if (this.queue.length) this.pump(); }
  }
  collect(resultFactory) {
    let fields = null; let rows = []; let error = null; let result = null; const results = [];
    return this.run((type, body, done) => {
      if (type === 'T') { fields = parseRowDesc(body); rows = []; }
      else if (type === 'D') rows.push(parseDataRow(body, fields));
      else if (type === 'C') { const tag = body.toString('utf8').replace(/\0$/, ''); const m = /(\d+)$/.exec(tag); result = { rows, rowCount: m ? Number(m[1]) : rows.length, command: tag.split(' ')[0], fields: fields ? fields.map((f) => f.name) : [] }; results.push(result); fields = null; rows = []; }
      else if (type === 'I') { results.push({ rows: [], rowCount: 0 }); }
      else if (type === 'E') error = new PgError(parseError(body));
      else if (type === 'Z') { if (error) { this.handler = null; done({ __error: error }); } else done(resultFactory(results, result)); }
    }).then((v) => { if (v && v.__error) throw v.__error; return v; });
  }
  execExtended(text, params) {
    const vals = params.map(serialize);
    const bindParts = [cstr(''), cstr(''), i16(0), i16(vals.length)];
    for (const v of vals) { if (v === null) bindParts.push(i32(-1)); else { const b = Buffer.from(v, 'utf8'); bindParts.push(i32(b.length), b); } }
    bindParts.push(i16(0));
    const p = this.collect((results, last) => last || { rows: [], rowCount: 0, fields: [] });
    this.sock.write(Buffer.concat([
      msg('P', Buffer.concat([cstr(''), cstr(text), i16(0)])), msg('B', Buffer.concat(bindParts)),
      msg('D', Buffer.concat([Buffer.from('P'), cstr('')])), msg('E', Buffer.concat([cstr(''), i32(0)])), msg('S', Buffer.alloc(0)),
    ]));
    return p;
  }
  execSimple(text) { const p = this.collect((results) => results); this.sock.write(msg('Q', cstr(text))); return p; }
  close() { try { if (!this.dead) this.sock.write(msg('X', Buffer.alloc(0))); this.sock.end(); } catch (e) { /* */ } this.dead = true; }
}

function parseError(body) {
  const f = {}; let i = 0;
  while (i < body.length && body[i] !== 0) { const code = String.fromCharCode(body[i]); const end = body.indexOf(0, i + 1); f[code] = body.subarray(i + 1, end).toString('utf8'); i = end + 1; }
  return f;
}
function parseRowDesc(body) {
  const n = body.readInt16BE(0); const out = []; let i = 2;
  for (let k = 0; k < n; k++) { const end = body.indexOf(0, i); const name = body.subarray(i, end).toString('utf8'); i = end + 1; const typeOid = body.readInt32BE(i + 6); out.push({ name, typeOid }); i += 18; }
  return out;
}
function parseDataRow(body, fields) {
  const n = body.readInt16BE(0); const row = {}; let i = 2;
  for (let k = 0; k < n; k++) {
    const len = body.readInt32BE(i); i += 4;
    if (len === -1) row[fields[k].name] = null;
    else { row[fields[k].name] = parseValue(fields[k].typeOid, body.subarray(i, i + len).toString('utf8')); i += len; }
  }
  return row;
}

/* ---------- Pool ---------- */
class Pool {
  constructor(url, opts = {}) { this.cfg = parseUrl(url); this.max = opts.max || 5; this.idleMs = opts.idleMs || 30000; this.all = new Set(); this.idle = []; this.waiters = []; }
  async acquire() {
    while (this.idle.length) { const c = this.idle.pop(); if (!c.dead) return c; this.all.delete(c); }
    if (this.all.size < this.max) {
      const c = new Connection(this.cfg); this.all.add(c);
      try { await c.connect(); } catch (e) { this.all.delete(c); throw e; }
      return c;
    }
    return new Promise((res, rej) => { const t = setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) this.waiters.splice(i, 1); rej(new Error('Hết thời gian chờ kết nối CSDL')); }, 15000); const w = (c) => { clearTimeout(t); res(c); }; this.waiters.push(w); });
  }
  release(c) {
    if (c.dead) { this.all.delete(c); return; }
    const w = this.waiters.shift(); if (w) return w(c);
    c.lastUsed = Date.now(); this.idle.push(c);
    if (!this.timer) { this.timer = setInterval(() => this.reap(), 10000); this.timer.unref && this.timer.unref(); }
  }
  reap() { const now = Date.now(); this.idle = this.idle.filter((c) => { if (now - c.lastUsed > this.idleMs) { c.close(); this.all.delete(c); return false; } return true; }); }
  async query(text, params) {
    const c = await this.acquire();
    try { return await c.query(text, params); } finally { this.release(c); }
  }
  async simple(text) { const c = await this.acquire(); try { return await c.simple(text); } finally { this.release(c); } }
  /** Chạy fn(client) trong một transaction; tự ROLLBACK khi có lỗi */
  async tx(fn) {
    const c = await this.acquire();
    try {
      await c.query('BEGIN');
      const client = { query: (t, p) => c.query(t, p) };
      const r = await fn(client);
      await c.query('COMMIT');
      return r;
    } catch (e) {
      try { await c.query('ROLLBACK'); } catch (e2) { c.fail(e2); }
      throw e;
    } finally { this.release(c); }
  }
  async end() { clearInterval(this.timer); this.timer = null; [...this.all].forEach((c) => c.close()); this.all.clear(); this.idle = []; }
}

module.exports = { Pool, Connection, PgError, parseUrl };
