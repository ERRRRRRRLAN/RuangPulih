// API pengaduan publik: buat tiket, cek status, baca detail (konselor), alur status.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { encrypt, decrypt } = require('../security');
const { butuhKonselor } = require('../deps');
const audit = require('../audit');
const crypto = require('crypto');

function buatTiket(d = new Date()) {
  const tgl = d.toISOString().slice(0, 10).replace(/-/g, '');
  const acak = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 hex chars
  return `PN-${tgl}-${acak}`;
}
function publik(p) { // field pengaduan untuk response publik (tanpa cerita!)
  return { no_tiket: p.no_tiket, untuk: p.untuk, kategori: p.kategori, frekuensi: p.frekuensi,
           usia: p.usia, status: p.status, dibuat: p.dibuat };
}
function lengkap(p) { // versi konselor: sertakan cerita & kontak didekripsi
  return { ...publik(p), cerita: decrypt(p.cerita_enc), kontak: p.kontak_enc ? decrypt(p.kontak_enc) : null,
           ditangani_oleh: p.ditangani_oleh, diperbarui: p.diperbarui };
}

// POST /api/pengaduan — publik, anonim, tanpa login
router.post('/', (req, res) => {
  const { untuk, kategori, frekuensi, usia, cerita, kontak } = req.body || {};
  if (!untuk || !kategori || !cerita || !String(cerita).trim())
    return res.status(400).json({ error: 'untuk, kategori, cerita wajib diisi' });
  if (String(cerita).length > 5000) return res.status(400).json({ error: 'cerita maksimal 5000 karakter' });

  const no_tiket = buatTiket();
  const sekarang = Date.now();
  const info = db.prepare(
    `INSERT INTO pengaduan (no_tiket, untuk, kategori, frekuensi, usia, cerita_enc, kontak_enc, status, dibuat)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(no_tiket, String(untuk), String(kategori), frekuensi || null, usia || null,
        encrypt(String(cerita)), kontak ? encrypt(String(kontak)) : null, 'Diterima', sekarang);

  audit.catat(`user:${no_tiket}`, 'BUAT_PENGADUAN', `id=${info.lastInsertRowid}`, req.ip);
  res.status(201).json({ no_tiket, status: 'Diterima' });
});

// GET /api/pengaduan/:tiket — publik, hanya metadata + status (tidak kirim cerita)
router.get('/:tiket', (req, res) => {
  const p = db.prepare('SELECT * FROM pengaduan WHERE no_tiket=?').get(req.params.tiket);
  if (!p) return res.status(404).json({ error: 'tiket tidak ditemukan' });
  res.json(publik(p));
});

// GET /api/pengaduan — konselor: daftar tiket (filter status)
router.get('/', butuhKonselor, (req, res) => {
  const rows = req.query.status
    ? db.prepare('SELECT * FROM pengaduan WHERE status=? ORDER BY dibuat DESC').all(req.query.status)
    : db.prepare('SELECT * FROM pengaduan ORDER BY dibuat DESC').all();
  res.json(rows.map(publik));
});

// GET /api/pengaduan/:tiket/detail — konselor: baca cerita (audit!) (PDF 3.8)
router.get('/:tiket/detail', butuhKonselor, (req, res) => {
  const p = db.prepare('SELECT * FROM pengaduan WHERE no_tiket=?').get(req.params.tiket);
  if (!p) return res.status(404).json({ error: 'tiket tidak ditemukan' });
  audit.catat(req.konselor.username, 'BACA_PENGADUAN', p.no_tiket, req.ip);
  res.json(lengkap(p));
});

// PATCH /api/pengaduan/:tiket/status — konselor: ubah status (flow PDF 3.6)
const FLOW = ['Diterima', 'Ditinjau', 'Dalam Penanganan', 'Selesai'];
router.patch('/:tiket/status', butuhKonselor, (req, res) => {
  const baru = req.body && req.body.status;
  if (!FLOW.includes(baru)) return res.status(400).json({ error: `status harus salah satu: ${FLOW.join(', ')}` });
  const p = db.prepare('SELECT * FROM pengaduan WHERE no_tiket=?').get(req.params.tiket);
  if (!p) return res.status(404).json({ error: 'tiket tidak ditemukan' });

  const sekarang = Date.now();
  db.prepare('UPDATE pengaduan SET status=?, diperbarui=?, ditangani_oleh=COALESCE(ditangani_oleh,?) WHERE no_tiket=?')
    .run(baru, sekarang, req.konselor.id, p.no_tiket);
  audit.catat(req.konselor.username, 'UBAH_STATUS', `${p.no_tiket}: ${p.status} -> ${baru}`, req.ip);
  res.json({ no_tiket: p.no_tiket, status: baru });
});

module.exports = router;
module.exports.FLOW = FLOW;
module.exports.publik = publik;
module.exports.lengkap = lengkap;
