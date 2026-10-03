const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const auth = require('../src/routes/auth');
const db = require('../src/db');
const { hashSandi } = require('../src/security');

let server, baseUrl;
test.before(async () => {
  db.prepare('DELETE FROM pesan').run();        // FK: pesan → konselor & pengaduan
  db.prepare('DELETE FROM pengaduan').run();    // FK: pengaduan.ditangani_oleh → konselor
  db.prepare('DELETE FROM minat_program').run(); // FK: minat_program.ditangani_oleh → konselor
  db.prepare('DELETE FROM audit_log').run();
  db.prepare('DELETE FROM rujukan').run(); // FK: rujukan.dibuat_oleh -> konselor
  db.prepare('DELETE FROM konselor').run();
  const h = await hashSandi('rahasia123');
  const stmt = db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)');
  stmt.run(1, 'dr.sari', 'dr. Sari', h, 'konselor', 1, 0, Date.now());
  stmt.run(2, 'dr.lock', 'dr. Lock', h, 'konselor', 1, 0, Date.now());
  stmt.run(3, 'dr.me', 'dr. Me', h, 'konselor', 1, 0, Date.now());
  const app = express().use(express.json()).use(cookieParser()).use('/api/auth', auth);
  server = app.listen(0);
  baseUrl = 'http://localhost:' + server.address().port;
});
test.after(() => server.close());

async function req(path, { method = 'POST', body, cookie } = {}) {
  const res = await fetch(baseUrl + path, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') };
}

test('login benar kasih cookie + data', async () => {
  const r = await req('/api/auth/login', { body: { username: 'dr.sari', sandi: 'rahasia123' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.nama, 'dr. Sari');
  assert.match(r.cookie, /session=[^;]+/);
  assert.match(r.cookie, /HttpOnly/i);
});
test('login salah ditolak 401', async () => {
  const r = await req('/api/auth/login', { body: { username: 'dr.sari', sandi: 'salah' } });
  assert.equal(r.status, 401);
});
test('5x salah = terkunci (429)', async () => {
  for (let i = 0; i < 4; i++) await req('/api/auth/login', { body: { username: 'dr.lock', sandi: 'salah' } });
  const r5 = await req('/api/auth/login', { body: { username: 'dr.lock', sandi: 'salah' } });
  assert.equal(r5.status, 429);
  const r6 = await req('/api/auth/login', { body: { username: 'dr.lock', sandi: 'rahasia123' } });
  assert.equal(r6.status, 429, 'sandi benar pun tetap terkunci selama window');
});
test('/me tanpa cookie = 401', async () => {
  assert.equal((await req('/api/auth/me', { method: 'GET' })).status, 401);
});
test('/me pakai cookie = 200', async () => {
  const r = await req('/api/auth/login', { body: { username: 'dr.me', sandi: 'rahasia123' } });
  assert.equal(r.status, 200);
  const m = await req('/api/auth/me', { method: 'GET', cookie: r.cookie.split(';')[0] });
  assert.equal(m.status, 200);
  assert.equal(m.body.username, 'dr.me');
});
