const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const { WebSocket } = require('ws');
const { pasang } = require('../src/ws');
const db = require('../src/db');
const { hashSandi, buatJWT, encrypt } = require('../src/security');

let server, base, app;
test.before(async () => {
  db.prepare('DELETE FROM pesan').run(); db.prepare('DELETE FROM pengaduan').run(); db.prepare('DELETE FROM konselor').run();
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(1, 'dr.sari', 'dr. Sari', await hashSandi('rahasia123'), 'konselor', 1, 0, Date.now());
  db.prepare('INSERT INTO pengaduan (no_tiket,untuk,kategori,cerita_enc,status,dibuat) VALUES (?,?,?,?,?,?)')
    .run('PN-20260101-AAAA', 'Diri sendiri', 'x', encrypt('cerita'), 'Diterima', Date.now());
  app = express().use(express.json());
  server = http.createServer(app);
  pasang(server);
  await new Promise(r => server.listen(0, r));
  base = 'ws://localhost:' + server.address().port;
});
test.after(() => server.close());

// WebSocket dengan queue pesan — listener dipasang di konstruktor agar tidak ada
// pesan yang terlewat (history dikirim server tepat saat connection terbuka).
function wsBaru(url) {
  const ws = new WebSocket(url);
  ws._q = [];
  ws.on('message', d => ws._q.push(JSON.parse(d.toString())));
  return ws;
}
function buka(url) {
  return new Promise((resolve, reject) => {
    const ws = wsBaru(url);
    ws.on('open', () => resolve(ws));
    ws.on('close', () => reject(new Error('server menutup koneksi')));
    ws.on('error', reject);
  });
}
function terima(ws, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    const cek = () => {
      if (ws._q.length) {
        clearTimeout(t);
        const m = ws._q.shift();
        if (m.type === 'hello') { setTimeout(cek, 15); return; } // handshake sid, bukan pesan
        resolve(m);
      }
      else setTimeout(cek, 15);
    };
    cek();
  });
}
function kirim(ws, obj) { ws.send(JSON.stringify(obj)); }

test('anonim konek pakai tiket valid', async () => {
  const ws = await buka(`${base}/ws?tiket=PN-20260101-AAAA`);
  const m = await terima(ws);            // history (kosong)
  assert.equal(m.type, 'history');
  ws.close();
});
test('anonim konek tanpa tiket → ditolak', async () => {
  let ws;
  try { ws = await buka(`${base}/ws`); }
  catch (e) { return; }                  // server menolak sebelum handshake = OK
  // handshake sempat terbuka → server harusnya segera menutupnya
  await new Promise(resolve => {
    const t = setTimeout(resolve, 500);
    ws.on('close', () => { clearTimeout(t); resolve(); });
  });
  assert.equal(ws.readyState, WebSocket.CLOSED, 'server harusnya menutup koneksi tanpa tiket');
});
test('konselor konek pakai JWT', async () => {
  const token = buatJWT({ id: 1, peran: 'konselor' });
  const ws = await buka(`${base}/ws?token=${token}`);
  assert.equal(ws.readyState, WebSocket.OPEN);
  ws.close();
});
test('konselor kirim pesan, anonim terima (real-time)', async () => {
  const token = buatJWT({ id: 1, peran: 'konselor' });
  const [wK, wU] = await Promise.all([
    buka(`${base}/ws?token=${token}`),
    buka(`${base}/ws?tiket=PN-20260101-AAAA`),
  ]);
  await terima(wU);                       // skip history
  kirim(wK, { type: 'pesan', tiket: 'PN-20260101-AAAA', isi: 'halo, saya konselor' });
  const m = await terima(wU);
  assert.equal(m.type, 'pesan');
  assert.equal(m.isi, 'halo, saya konselor');
  assert.equal(m.pengirim, 'konselor');
  wK.close(); wU.close();
});
test('pesan tersimpan terenkripsi di DB', async () => {
  const row = db.prepare('SELECT isi_enc FROM pesan WHERE no_tiket=? ORDER BY id DESC LIMIT 1').get('PN-20260101-AAAA');
  assert.ok(row, 'pesan harus tersimpan');
  assert.ok(!row.isi_enc.includes('halo, saya konselor'), 'isi_enc harus ciphertext');
});
test('anonim tidak bisa kirim ke tiket orang lain', async () => {
  db.prepare('INSERT INTO pengaduan (no_tiket,untuk,kategori,cerita_enc,status,dibuat) VALUES (?,?,?,?,?,?)')
    .run('PN-20260101-BBBB', 'Diri sendiri', 'x', encrypt('c'), 'Diterima', Date.now());
  const wA = await buka(`${base}/ws?tiket=PN-20260101-AAAA`);
  await terima(wA);
  kirim(wA, { type: 'pesan', tiket: 'PN-20260101-BBBB', isi: 'merusak' });
  const m = await terima(wA);
  assert.equal(m.error, 'tidak diizinkan');
  wA.close();
});
