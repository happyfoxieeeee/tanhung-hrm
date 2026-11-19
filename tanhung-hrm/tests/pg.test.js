'use strict';
const test = require('node:test'); const assert = require('node:assert');
const { Pool, PgError } = require('../server/db/pg');
const BASE = process.env.TEST_DATABASE_URL || 'postgres://hrm:Pg-Test%232026@127.0.0.1:55432/tanhung_test';
for (const mode of ['disable', 'require']) {
  test('Driver PostgreSQL — sslmode=' + mode, async () => {
    const pool = new Pool(BASE + '?sslmode=' + mode, { max: 3 });
    try {
      const r = await pool.query("select $1::int + 1 as n, $2::text as s, $3::jsonb as j, now() as t, null::text as z, true as b, '2026-11-19'::date as d, 12345678901.5::numeric as num, (select ssl from pg_stat_ssl where pid = pg_backend_pid()) as ssl", [41, 'Tân Hưng – ứng lương', { a: [1, 'ư'] }]);
      const row = r.rows[0];
      assert.strictEqual(row.n, 42); assert.strictEqual(row.s, 'Tân Hưng – ứng lương'); assert.deepStrictEqual(row.j, { a: [1, 'ư'] });
      assert.ok(row.t instanceof Date && !isNaN(row.t)); assert.strictEqual(row.z, null); assert.strictEqual(row.b, true); assert.strictEqual(row.d, '2026-11-19'); assert.strictEqual(row.num, 12345678901.5);
      assert.strictEqual(row.ssl, mode === 'require');
      await pool.query('create temp table if not exists x(id int primary key)').catch(() => {});
      await assert.rejects(pool.query('select * from bang_khong_ton_tai'), (e) => e instanceof PgError && e.code === '42P01');
      // kết nối vẫn dùng được sau lỗi
      assert.strictEqual((await pool.query('select 7 as v')).rows[0].v, 7);
      // song song qua pool
      const many = await Promise.all(Array.from({ length: 12 }, (_, i) => pool.query('select $1::int * 2 as v, pg_sleep(0.01)', [i])));
      assert.deepStrictEqual(many.map((m) => m.rows[0].v), Array.from({ length: 12 }, (_, i) => i * 2));
      // transaction + rollback
      await pool.simple('drop table if exists t_tx; create table t_tx(id int primary key, v text);');
      await assert.rejects(pool.tx(async (c) => { await c.query('insert into t_tx values (1, $1)', ['a']); await c.query('insert into t_tx values (1, $1)', ['trùng']); }), (e) => e.code === '23505');
      assert.strictEqual((await pool.query('select count(*)::int as n from t_tx')).rows[0].n, 0);
      await pool.tx(async (c) => { await c.query('insert into t_tx values (1, $1)', ['ok']); });
      assert.strictEqual((await pool.query('select v from t_tx where id = 1')).rows[0].v, 'ok');
      const multi = await pool.simple('select 1 as a; select 2 as b;'); assert.strictEqual(multi.length, 2);
    } finally { await pool.end(); }
  });
}
test('Sai mật khẩu CSDL bị từ chối', async () => {
  const pool = new Pool('postgres://hrm:sai@127.0.0.1:55432/tanhung_test?sslmode=disable');
  await assert.rejects(pool.query('select 1'), (e) => e.code === '28P01'); await pool.end();
});
