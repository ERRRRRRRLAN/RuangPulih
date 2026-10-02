// Direktori layanan rujukan (publik, tanpa login) — BNN 188, Medis 119, Polri 110, Puskesmas.
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/layanan — publik, anonim boleh lihat
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT nama, jenis, kontak, deskripsi, urutan FROM layanan ORDER BY urutan ASC').all();
  res.json(rows);
});

module.exports = router;
