const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const rujukan = require('../src/routes/rujukan');
const db = require('../src/db');
const { hashSandi } = require('../src/security');

let base, server;
test.before(async () => {
  db.prepare('DELETE FROM pesan').run();
  db.prepare('DELETE FROM rujukan').run();
  db.prepare('DELETE FROM minat_program').run();
  db.prepare('DELETE FROM pengaduan').run();
  db.prepare('DELETE FROM audit_log').run();
  db.prepare('DELETE FROM konselor').run();
  const h = await hashSandi('rahasia123');
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(1, 'dr.sari', 'dr. Sari', h, 'konselor', 1, 0, Date.now());
  // tiket pengaduan PN- dan minat program PM- sebagai sumber rujukan
  db.prepare('INSERT INTO pengaduan (no_tiket,untuk,kategori,cerita_enc,status,dibuat) VALUES (?,?,?,?,?,?)')
    .run('PN-20260101-AAAA', 'Diri sendiri', 'Narkoba', 'cipher', 'Ditinjau', Date.now());
  db.prepare('INSERT INTO minat_program (kode_lacak,program,panggilan,status,dibuat) VALUES (?,?,?,?,?)')
    .run('PM-20260101-BBBB', 'Rawat Jalan', 'Rina', 'Dihubungi', Date.now());

  const app = express().use(express.json()).use(cookieParser()).use('/api/rujukan', rujukan);
  server = app.listen(0);
  base = 'http://localhost:' + server.address().port;
});

test.after(() => server.close());

async function login() {
  const auth = express().use(express.json()).use(cookieParser());
  auth.post('/login', async (req, res) => {
    const jwt = require('../src/security');
    const k = db.prepare('SELECT * FROM konselor WHERE username=?').get('dr.sari');
    const ok = await jwt.cekSandi(req.body.sandi, k.sandi_hash);
    if (!ok) return res.status(401).json({ error: 'salah' });
    res.cookie('session', jwt.buatJWT({ id: k.id, username: k.username, peran: k.peran }), { httpOnly: true });
    res.json({ ok: true });
  });
  const s = auth.listen(0);
  const port = s.address().port;
  const res = await fetch(`http://localhost:${port}/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sandi: 'rahasia123' }),
  });
  const cookie = res.headers.get('set-cookie').split(';')[0];
  s.close();
  return cookie;
}

let cookieGlobal;

test('konselor buat rujukan ke polisi → 201 + kode RJ-', async () => {
  cookieGlobal = await login();
  const res = await fetch(base + '/api/rujukan', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieGlobal },
    body: JSON.stringify({ tiket: 'PM-20260101-BBBB', tujuan: 'Polisi', alasan: 'Kasus penyalahgunaan oleh orang di sekitar korban, perlu penanganan hukum.' }),
  });
  const j = await res.json();
  assert.strictEqual(res.status, 201);
  assert.ok(/^RJ-\d{8}-[0-9A-F]{4}$/.test(j.kode_rujukan), 'format kode RJ valid');
});

test('rujukan ganda (tiket+tujuan sama, masih aktif) → 409', async () => {
  const res = await fetch(base + '/api/rujukan', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieGlobal },
    body: JSON.stringify({ tiket: 'PM-20260101-BBBB', tujuan: 'Polisi', alasan: 'coba buat lagi yang sama seharusnya ditolak' }),
  });
  assert.strictEqual(res.status, 409);
});

test('tujuan tidak valid → 400', async () => {
  const res = await fetch(base + '/api/rujukan', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieGlobal },
    body: JSON.stringify({ tiket: 'PM-20260101-BBBB', tujuan: 'Pengacara', alasan: 'tujuan tidak valid harusnya ditolak' }),
  });
  assert.strictEqual(res.status, 400);
});

test('alasan terlalu pendek → 400', async () => {
  const res = await fetch(base + '/api/rujukan', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieGlobal },
    body: JSON.stringify({ tiket: 'PM-20260101-BBBB', tujuan: 'Dokter', alasan: 'pendek' }),
  });
  assert.strictEqual(res.status, 400);
});

test('buat tanpa login → 401', async () => {
  const res = await fetch(base + '/api/rujukan', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tiket: 'PM-20260101-BBBB', tujuan: 'Dokter', alasan: 'tidak login harusnya ditolak' }),
  });
  assert.strictEqual(res.status, 401);
});

test('GET daftar rujukan (konselor) — sumber_tiket & alasan tampil', async () => {
  const res = await fetch(base + '/api/rujukan', { headers: { cookie: cookieGlobal } });
  const j = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(j.total, 1);
  assert.strictEqual(j.items[0].sumber_tiket, 'PM-20260101-BBBB');
  assert.ok(j.items[0].alasan.length > 10);
  assert.strictEqual(j.items[0].tujuan, 'Polisi');
});

test('PATCH status rujukan → Diterima', async () => {
  const list = await (await fetch(base + '/api/rujukan', { headers: { cookie: cookieGlobal } })).json();
  const kode = list.items[0].kode_rujukan;
  const res = await fetch(base + '/api/rujukan/' + kode, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: cookieGlobal },
    body: JSON.stringify({ status: 'Diterima' }),
  });
  assert.strictEqual(res.status, 200);
});

test('lacak publik: pihak berwajib / pelapor cek status — TIDAK ada sumber_tiket & alasan', async () => {
  const list = await (await fetch(base + '/api/rujukan', { headers: { cookie: cookieGlobal } })).json();
  const kode = list.items[0].kode_rujukan;
  const res = await fetch(base + '/api/rujukan/lacak/' + kode);
  const j = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(j.tujuan, 'Polisi');
  assert.ok(j.keterangan, 'ada keterangan status');
  // KUNCI PRIVASI: field sensitif tidak boleh bocor ke endpoint publik
  assert.ok(!('sumber_tiket' in j), 'sumber_tiket tidak boleh tampil di lacak publik');
  assert.ok(!('alasan' in j), 'alasan kasus tidak boleh tampil di lacak publik');
});

test('lacak publik tanpa login bisa akses', async () => {
  const res = await fetch(base + '/api/rujukan/lacak/RJ-20260101-AAAA', { headers: {} });
  // kode palsu → 404 (tapi tidak 401 — endpoint publik)
  assert.strictEqual(res.status, 404);
});

test('rujukan dari tiket PN- (pengaduan) juga jalan', async () => {
  const res = await fetch(base + '/api/rujukan', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieGlobal },
    body: JSON.stringify({ tiket: 'PN-20260101-AAAA', tujuan: 'Dokter', alasan: 'Butuh pemeriksaan medis karena gejala putus zat yang dilaporkan.' }),
  });
  assert.strictEqual(res.status, 201);
});
