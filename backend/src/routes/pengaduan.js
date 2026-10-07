// API pengaduan publik: buat tiket, cek status, baca detail (konselor), alur status.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { encrypt, decrypt, decryptAman } = require('../security');
const { butuhKonselor } = require('../deps');
const audit = require('../audit');
const { buatEventPengaduanBaru } = require('../realtime');
const crypto = require('crypto');

function buatTiket(d = new Date()) {
  const tgl = d.toISOString().slice(0, 10).replace(/-/g, '');
  const acak = crypto.randomBytes(2).toString('hex').toUpperCase();
  return 'PN-' + tgl + '-' + acak;
}
function publik(p) {
  return { no_tiket: p.no_tiket, untuk: p.untuk, kategori: p.kategori, frekuensi: p.frekuensi,
           usia: p.usia, status: p.status, darurat: !!p.darurat, dibuat: p.dibuat };
}
function lengkap(p) {
  return { ...publik(p), cerita: decryptAman(p.cerita_enc, `tiket ${p.no_tiket}`),
           kontak: decryptAman(p.kontak_enc, `tiket ${p.no_tiket}`),
           lokasi: p.lokasi, ditangani_oleh: p.ditangani_oleh, diperbarui: p.diperbarui };
}

async function buatPengaduan(req, res) {
  const { untuk, kategori, frekuensi, usia, cerita, kontak, lokasi, darurat } = req.body || {};
  if (!untuk || !kategori || !cerita || !String(cerita).trim())
    return res.status(400).json({ error: 'untuk, kategori, cerita wajib diisi' });
  if (String(cerita).length > 5000) return res.status(400).json({ error: 'cerita maksimal 5000 karakter' });

  const no_tiket = buatTiket();
  const sekarang = Date.now();
  const info = await db.prepare(
    'INSERT INTO pengaduan (no_tiket, untuk, kategori, frekuensi, usia, cerita_enc, kontak_enc, status, darurat, lokasi, dibuat) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)'
  ).run(no_tiket, String(untuk), String(kategori), frekuensi || null, usia || null,
        encrypt(String(cerita)), kontak ? encrypt(String(kontak)) : null, 'Diterima',
        darurat ? 1 : 0, lokasi || null, sekarang);

  audit.catat('user:' + no_tiket, 'BUAT_PENGADUAN', 'id=' + info.lastInsertRowid, req.ip);
  buatEventPengaduanBaru(no_tiket, darurat);
  res.status(201).json({ no_tiket, status: 'Diterima' });
}
router.post('/', buatPengaduan);
router.post('/baru', buatPengaduan);

router.get('/:tiket', async (req, res) => {
  const p = await db.prepare('SELECT * FROM pengaduan WHERE no_tiket=$1').get(String(req.params.tiket).toUpperCase());
  if (!p) return res.status(404).json({ error: 'tiket tidak ditemukan' });
  const k = p.ditangani_oleh
    ? await db.prepare('SELECT nama FROM konselor WHERE id=$1').get(p.ditangani_oleh)
    : null;
  res.json({ ...publik(p), konselor: k ? k.nama : null });
});

router.get('/', butuhKonselor, async (req, res) => {
  const rows = req.query.status
    ? await db.prepare('SELECT * FROM pengaduan WHERE status=$1 ORDER BY dibuat DESC').all(req.query.status)
    : await db.prepare('SELECT * FROM pengaduan ORDER BY dibuat DESC').all();
  res.json(rows.map(publik));
});

router.get('/:tiket/detail', butuhKonselor, async (req, res) => {
  const p = await db.prepare('SELECT * FROM pengaduan WHERE no_tiket=$1').get(req.params.tiket);
  if (!p) return res.status(404).json({ error: 'tiket tidak ditemukan' });
  audit.catat(req.konselor.username, 'BACA_PENGADUAN', p.no_tiket, req.ip);
  res.json(lengkap(p));
});

const FLOW = ['Diterima', 'Ditinjau', 'Dalam Penanganan', 'Selesai'];
router.patch('/:tiket/status', butuhKonselor, async (req, res) => {
  const baru = req.body && req.body.status;
  if (!FLOW.includes(baru)) return res.status(400).json({ error: 'status harus salah satu: ' + FLOW.join(', ') });
  const p = await db.prepare('SELECT * FROM pengaduan WHERE no_tiket=$1').get(req.params.tiket);
  if (!p) return res.status(404).json({ error: 'tiket tidak ditemukan' });

  const sekarang = Date.now();
  await db.prepare('UPDATE pengaduan SET status=$1, diperbarui=$2, ditangani_oleh=COALESCE(ditangani_oleh,$3) WHERE no_tiket=$4')
    .run(baru, sekarang, req.konselor.id, p.no_tiket);
  audit.catat(req.konselor.username, 'UBAH_STATUS', p.no_tiket + ': ' + p.status + ' -> ' + baru, req.ip);
  res.json({ no_tiket: p.no_tiket, status: baru });
});

module.exports = router;
module.exports.FLOW = FLOW;
module.exports.publik = publik;
module.exports.lengkap = lengkap;
