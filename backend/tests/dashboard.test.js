const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const r_dashboard = require('../src/routes/dashboard');
const r_auth = require('../src/routes/auth');
const db = require('../src/db');
const { hashSandi } = require('../src/security');

let base, server;
test.before(async () => {
  db.prepare('DELETE FROM pesan').run();
  db.prepare('DELETE FROM audit_log').run(); db.prepare('DELETE FROM pengaduan').run(); db.prepare('DELETE FROM konselor').run();
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(1, 'admin', 'Admin', await hashSandi('admin123'), 'admin', 1, 0, Date.now());
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(2, 'dr.sari', 'dr. Sari', await hashSandi('rahasia123'), 'konselor', 1, 0, Date.now());
  db.prepare('INSERT INTO pengaduan (no_tiket,untuk,kategori,cerita_enc,status,dibuat,dibaca) VALUES (?,?,?,?,?,?,?)')
    .run('PN-20260101-AAAA', 'Diri sendiri', 'x', 'enc', 'Diterima', Date.now(), 0);
  const app = express().use(express.json()).use(cookieParser())
    .use('/api/dashboard', r_dashboard).use('/api/auth', r_auth);
  server = app.listen(0); base = 'http://localhost:' + server.address().port;
});
test.after(() => server.close());
async function login(u, s) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, sandi: s }) });
  return r.headers.get('set-cookie').split(';')[0];
}
async function G(path, cookie) {
  const r = await fetch(base + path, { headers: cookie ? { cookie } : {} });
  return { status: r.status, body: await r.json() };
}

test('konselor lihat stats', async () => {
  const c = await login('dr.sari', 'rahasia123');
  const r = await G('/api/dashboard/stats', c);
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.baru, 1);
  assert.equal(r.body.belumDibaca, 1);
});
test('antrian: filter status jalan', async () => {
  const c = await login('dr.sari', 'rahasia123');
  const a = await G('/api/dashboard/antrian', c);
  assert.equal(a.body.total, 1);
  assert.equal(a.body.items[0].no_tiket, 'PN-20260101-AAAA');
  const b = await G('/api/dashboard/antrian?status=Selesai', c);
  assert.equal(b.body.total, 0);
});
test('audit: admin 200, konselor 403', async () => {
  const ca = await login('admin', 'admin123');
  const ra = await G('/api/dashboard/audit', ca);
  assert.equal(ra.status, 200);
  const ck = await login('dr.sari', 'rahasia123');
  const rk = await G('/api/dashboard/audit', ck);
  assert.equal(rk.status, 403);
});
