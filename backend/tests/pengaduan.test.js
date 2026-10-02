const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const r_pengaduan = require('../src/routes/pengaduan');
const r_auth = require('../src/routes/auth');
const db = require('../src/db');
const { hashSandi } = require('../src/security');

let base, server;
test.before(async () => {
  db.prepare('DELETE FROM pesan').run(); db.prepare('DELETE FROM pengaduan').run(); db.prepare('DELETE FROM konselor').run();
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(1, 'dr.sari', 'dr. Sari', await hashSandi('rahasia123'), 'konselor', 1, 0, Date.now());
  const app = express().use(express.json()).use(cookieParser())
    .use('/api/pengaduan', r_pengaduan).use('/api/auth', r_auth);
  server = app.listen(0); base = 'http://localhost:' + server.address().port;
});
test.after(() => server.close());
async function P(path, o = {}) {
  const r = await fetch(base + path, { method: o.method || 'POST', headers: { 'content-type': 'application/json', ...(o.cookie ? { cookie: o.cookie } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { status: r.status, body: await r.json() };
}
async function login() {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'dr.sari', sandi: 'rahasia123' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('publik buat tiket → 201 + no_tiket PN-', async () => {
  const r = await P('/api/pengaduan', { body: { untuk: 'Diri sendiri', kategori: 'Penyalahgunaan zat', cerita: 'saya butuh bantuan' } });
  assert.equal(r.status, 201);
  assert.match(r.body.no_tiket, /^PN-\d{8}-[0-9A-F]{4}$/);
});
test('cerita wajib → 400', async () => {
  assert.equal((await P('/api/pengaduan', { body: { untuk: 'Diri sendiri', kategori: 'x' } })).status, 400);
});
test('publik cek tiket → tanpa cerita', async () => {
  const b = (await P('/api/pengaduan', { body: { untuk: 'Diri sendiri', kategori: 'x', cerita: 'rahasia sekali' } })).body;
  const r = await P('/api/pengaduan/' + b.no_tiket, { method: 'GET' });
  assert.equal(r.status, 200);
  assert.equal(r.body.no_tiket, b.no_tiket);
  assert.equal('cerita' in r.body, false, 'endpoint publik tidak boleh kirim cerita');
});
test('tiket palsu → 404', async () => {
  assert.equal((await P('/api/pengaduan/PN-00000000-AAAA', { method: 'GET' })).status, 404);
});
test('konselor lihat daftar (login)', async () => {
  const c = await login();
  const r = await P('/api/pengaduan', { method: 'GET', cookie: c });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
});
test('daftar tanpa login → 401', async () => {
  assert.equal((await P('/api/pengaduan', { method: 'GET' })).status, 401);
});
test('konselor baca detail berisi cerita + status flow', async () => {
  const c = await login();
  const b = (await P('/api/pengaduan', { body: { untuk: 'Diri sendiri', kategori: 'x', cerita: 'rahasia sekali' } })).body;
  const d = await P('/api/pengaduan/' + b.no_tiket + '/detail', { method: 'GET', cookie: c });
  assert.equal(d.body.cerita, 'rahasia sekali');
  const u = await P('/api/pengaduan/' + b.no_tiket + '/status', { method: 'PATCH', cookie: c, body: { status: 'Ditinjau' } });
  assert.equal(u.body.status, 'Ditinjau');
  const bad = await P('/api/pengaduan/' + b.no_tiket + '/status', { method: 'PATCH', cookie: c, body: { status: 'BOGUS' } });
  assert.equal(bad.status, 400);
});
