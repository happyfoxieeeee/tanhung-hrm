'use strict';
const fs = require('fs');
const path = require('path');
const { Pool } = require('./pg');
const config = require('../config');

let pool = null;
function getPool() {
  if (!pool) {
    if (!config.databaseUrl) throw Object.assign(new Error('Chưa cấu hình DATABASE_URL'), { status: 503 });
    pool = new Pool(config.databaseUrl, { max: config.poolMax });
  }
  return pool;
}
const db = {
  query: (t, p) => getPool().query(t, p),
  tx: (fn) => getPool().tx(fn),
  simple: (t) => getPool().simple(t),
  end: async () => { if (pool) { await pool.end(); pool = null; } },
};

/** Áp dụng các file migrations/*.sql chưa chạy, theo thứ tự tên file, mỗi file trong một transaction */
async function migrate(log = console.log) {
  const p = getPool();
  await p.simple('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  await p.simple('SELECT pg_advisory_lock(727001)');
  try {
    const done = new Set((await p.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
    const dir = path.join(__dirname, '..', '..', 'migrations');
    const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    let n = 0;
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      await p.tx(async (c) => {
        // chạy toàn bộ file trong cùng transaction
        for (const stmt of splitSql(sql)) await c.query(stmt);
        await c.query('INSERT INTO schema_migrations (version) VALUES ($1)', [f]);
      });
      log('  ✓ đã áp dụng migration ' + f); n++;
    }
    if (!n) log('  CSDL đã ở phiên bản mới nhất (' + files.length + ' migration)');
    return n;
  } finally { await p.simple('SELECT pg_advisory_unlock(727001)'); }
}

/** Tách file SQL thành các câu lệnh, giữ nguyên khối $$ … $$ của hàm PL/pgSQL */
function splitSql(sql) {
  const out = []; let cur = ''; let inDollar = false; let inLine = false; let inBlock = false; let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i], nx = sql[i + 1];
    if (inLine) { if (ch === '\n') inLine = false; continue; }
    if (inBlock) { if (ch === '*' && nx === '/') { inBlock = false; i++; } continue; }
    if (!inDollar && !inStr && ch === '-' && nx === '-') { inLine = true; continue; }
    if (!inDollar && !inStr && ch === '/' && nx === '*') { inBlock = true; i++; continue; }
    if (!inStr && ch === '$' && nx === '$') { inDollar = !inDollar; cur += '$$'; i++; continue; }
    if (!inDollar && ch === "'") inStr = !inStr;
    if (!inDollar && !inStr && ch === ';') { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

module.exports = { db, migrate, getPool, splitSql };
