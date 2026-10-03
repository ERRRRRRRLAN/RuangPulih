// Lapisan kompatibilitas: API better-sqlite3 (prepare/run/get/all, lastInsertRowid,
// changes) di atas node-postgres (pg.Pool). Dipakai agar route-route yang memakai
// db.prepare(sql).run(...)/get(...)/all(...) bisa langsung jalan di PostgreSQL tanpa
// perubahan, hanya ganti require('./src/db') dengan driver ini.
//
// Perbedaan utama yang ditangani:
//   1. Placeholder ? (SQLite) -> $1..$N (Postgres)
//   2. Node pg async, route sync -> route WAJIB await db.prepare(sql).run(...)
//   3. lastInsertRowid dari INSERT -> RETURNING id
//   4. SMALLINT dikembalikan pg sebagai number (sama seperti SQLite)
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: parseInt(process.env.PGPORT || '6543', 10),
  user: process.env.PGUSER || 'postgres.veocdkfohucklvkntpyc',
  password: process.env.PGPASSWORD || '',
  database: process.env.PGDATABASE || 'postgres',
  ssl: process.env.PG_SSL_DISABLE === '1' ? false : { rejectUnauthorized: false },
  max: 10, // free tier Supabase kecil, jangan banyak koneksi
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('[db/pg] idle client error:', err.message);
});

// Konversi SELECT ... WHERE x=? AND y=? -> WHERE x=$1 AND y=$2
function konversiPlaceholder(sql) {
  let n = 0, out = '', i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") { // string literal, lewati placeholder di dalamnya
      out += c; i++;
      while (i < sql.length) {
        out += sql[i];
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '?') { n++; out += '$' + n; i++; continue; }
    out += c; i++;
  }
  return out;
}

// Hasil INSERT/UPDATE/DELETE dengan metadata seperti better-sqlite3.
function hasilRun(res, pesanInsert) {
  const changes = (res.rowCount != null) ? res.rowCount : 0;
  const rows = res.rows || [];
  // lastInsertRowid: ambil dari RETURNING id kalau ada (INSERT ... RETURNING id)
  let lastInsertRowid = undefined;
  if (rows.length && rows[0].id != null) lastInsertRowid = rows[0].id;
  return { changes, lastInsertRowid };
}

function stmt(sql) {
  const pgSql = konversiPlaceholder(sql);
  const isInsert = /^\s*INSERT\b/i.test(sql);

  return {
    // Async. Route yang memanggil tanpa await akan dapat Promise — itu bug yang
    // harus diperbaiki per-file (lihat catatan migrasi).
    async run(...params) {
      const client = await pool.connect();
      try {
        if (isInsert) {
          // Tambah RETURNING id supaya lastInsertRowid terisi (SQLite-compatible)
          const res = await client.query(pgSql.replace(/;\s*$/, '') + ' RETURNING id', params);
          return hasilRun(res);
        }
        const res = await client.query(pgSql, params);
        return hasilRun(res);
      } finally {
        client.release();
      }
    },

    // get(): kembalikan 1 baris atau undefined (SQLite return undefined kalau kosong)
    async get(...params) {
      const client = await pool.connect();
      try {
        const res = await client.query(pgSql, params);
        if (!res.rows.length) return undefined;
        return res.rows[0];
      } finally {
        client.release();
      }
    },

    // all(): kembalikan array (kosong kalau tidak ada)
    async all(...params) {
      const client = await pool.connect();
      try {
        const res = await client.query(pgSql, params);
        return res.rows;
      } finally {
        client.release();
      }
    },
  };
}

module.exports = {
  // API better-sqlite3-compatible (async!)
  prepare: stmt,
  async exec(sql) { // DDL, tidak ada placeholder
    const client = await pool.connect();
    try { await client.query(sql); } finally { client.release(); }
  },
  pragma() { /* no-op di Postgres */ },
  async close() { await pool.end(); },
  pool,
};
