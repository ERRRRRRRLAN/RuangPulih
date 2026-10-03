// Direktori layanan rujukan (publik, tanpa login) — BNN 188, Medis 119, Polri 110, Puskesmas.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { encrypt } = require('../security');
const audit = require('../audit');
const crypto = require('node:crypto');

const PROGRAM_DIIZINKAN = [
  'Detoksifikasi',
  'Rehabilitasi Rawat Inap',
  'Rehabilitasi Rawat Jalan',
  'Aftercare dan Kelompok Dukungan',
  'Masih ragu, butuh konsultasi dulu',
];

// GET /api/layanan — publik, anonim boleh lihat
router.get('/', async (req, res) => {
  const rows = await db.prepare('SELECT nama, jenis, kontak, deskripsi, urutan FROM layanan ORDER BY urutan ASC').all();
  res.json(rows);
});

// POST /api/layanan/minat — daftar minat program pemulihan (anonim, kontak opsional).
router.post('/minat', async (req, res) => {
  const program = String(req.body.program || '').trim();
  if (!PROGRAM_DIIZINKAN.includes(program)) {
    return res.status(400).json({ error: 'program tidak valid' });
  }
  const panggilan = String(req.body.panggilan || '').trim().slice(0, 60) || null;
  const usia = Number.isInteger(req.body.usia) && req.body.usia > 0 && req.body.usia <= 120 ? req.body.usia : null;
  const kontak = String(req.body.kontak || '').trim().slice(0, 200) || null;
  const catatan = String(req.body.catatan || '').trim().slice(0, 2000) || null;

  const prioritas = (program === 'Rehabilitasi Rawat Inap' || program.startsWith('Masih ragu')) ? 'Tinggi' : 'Normal';

  const sekarang = Date.now();
  const tgl = new Date(sekarang).toISOString().slice(0, 10).replace(/-/g, '');
  const acak = crypto.randomBytes(2).toString('hex').toUpperCase();
  const kode = 'PM-' + tgl + '-' + acak;

  const info = await db.prepare(
    'INSERT INTO minat_program (kode_lacak, program, panggilan, usia, kontak_enc, catatan_enc, status, prioritas, dibuat) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)'
  ).run(kode, program, panggilan, usia, kontak ? encrypt(kontak) : null, catatan ? encrypt(catatan) : null, 'Baru', prioritas, sekarang);

  audit.catat('anonim', 'DAFTAR_MINAT_PROGRAM', 'id=' + info.lastInsertRowid + ' kode=' + kode + ' program=' + program, req.ip);
  res.status(201).json({ ok: true, id: info.lastInsertRowid, kode_lacak: kode });
});

// GET /api/layanan/minat/:kode — publik, cek status minat lewat kode (PM-...).
router.get('/minat/:kode', async (req, res) => {
  const kode = String(req.params.kode || '').trim().toUpperCase();
  if (!/^PM-\d{8}-[0-9A-F]{4}$/.test(kode)) {
    return res.status(400).json({ error: 'kode lacak tidak valid' });
  }
  const row = await db.prepare(
    'SELECT m.program, m.status, m.dibuat, m.diperbarui, k.nama AS konselor FROM minat_program m LEFT JOIN konselor k ON k.id = m.ditangani_oleh WHERE m.kode_lacak = $1'
  ).get(kode);
  if (!row) return res.status(404).json({ error: 'kode lacak tidak ditemukan' });
  res.json({
    program: row.program,
    status: row.status,
    dibuat: row.dibuat,
    diperbarui: row.diperbarui,
    konselor: row.konselor || null,
  });
});

module.exports = router;
