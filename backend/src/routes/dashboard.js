// Dashboard konselor + admin: statistik, antrian, filter, audit log.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { butuhKonselor, butuhAdmin } = require('../deps');
const { hashSandi } = require('../security');
const { catat } = require('../audit');

// GET /api/dashboard/stats — ringkasan untuk dashboard konselor
router.get('/stats', butuhKonselor, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM pengaduan').get().c;
  const baru = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Diterima'").get().c;
  const aktif = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Ditinjau' OR status='Dalam Penanganan'").get().c;
  const selesai = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Selesai'").get().c;
  const belumDibaca = db.prepare('SELECT COUNT(*) c FROM pengaduan WHERE dibaca=0').get().c;
  const darurat = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE darurat=1 AND status!='Selesai'").get().c;
  const sehari = db.prepare('SELECT COUNT(*) c FROM pengaduan WHERE dibuat >= ?').get(Date.now() - 24 * 60 * 60 * 1000).c;
  res.json({ total, baru, aktif, selesai, belumDibaca, darurat, sehari });
});

// GET /api/dashboard/antrian — daftar tiket dengan filter status + pagination
router.get('/antrian', butuhKonselor, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;
  const status = req.query.status;
  const q = status
    ? db.prepare('SELECT * FROM pengaduan WHERE status=? ORDER BY dibaca ASC, dibuat DESC LIMIT ? OFFSET ?').all(status, limit, offset)
    : db.prepare('SELECT * FROM pengaduan ORDER BY dibaca ASC, dibuat DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = status
    ? db.prepare('SELECT COUNT(*) c FROM pengaduan WHERE status=?').get(status).c
    : db.prepare('SELECT COUNT(*) c FROM pengaduan').get().c;
  res.json({ total, items: q.map(p => ({
    no_tiket: p.no_tiket, untuk: p.untuk, kategori: p.kategori, status: p.status,
    dibuat: p.dibuat, diperbarui: p.diperbarui, dibaca: !!p.dibaca,
  })) });
});

// GET /api/dashboard/audit — admin saja: log audit (auditabilitas PDF 3.8)
router.get('/audit', butuhKonselor, butuhAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
  res.json(rows);
});

// GET /api/dashboard/konselor — admin saja: daftar akun konselor
router.get('/konselor', butuhKonselor, butuhAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, username, nama, peran, aktif, dibuat FROM konselor ORDER BY id ASC').all();
  res.json(rows);
});

// POST /api/dashboard/konselor — admin saja: tambah akun konselor
router.post('/konselor', butuhKonselor, butuhAdmin, async (req, res) => {
  const { username, nama, sandi, peran } = req.body || {};
  if (!username || !nama || !sandi) return res.status(400).json({ error: 'username, nama, dan sandi wajib diisi' });
  if (peran && !['konselor', 'admin'].includes(peran)) return res.status(400).json({ error: 'peran tidak valid' });
  try {
    db.prepare('INSERT INTO konselor (username, nama, sandi_hash, peran, aktif, gagal, dibuat) VALUES (?,?,?,?,?,?,?)')
      .run(username.trim(), nama.trim(), await hashSandi(sandi), peran || 'konselor', 1, 0, Date.now());
  } catch (e) {
    return res.status(409).json({ error: 'username sudah dipakai' });
  }
  catat(req.konselor.username, 'tambah konselor', username.trim(), req.ip);
  res.status(201).json({ ok: true });
});

// PATCH /api/dashboard/konselor/:id/aktif — admin saja: aktifkan/nonaktifkan akun
router.patch('/konselor/:id/aktif', butuhKonselor, butuhAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id tidak valid' });
  if (id === req.konselor.id) return res.status(400).json({ error: 'tidak dapat mengubah akun sendiri' });
  const aktif = req.body && req.body.aktif ? 1 : 0;
  const hasil = db.prepare('UPDATE konselor SET aktif=? WHERE id=?').run(aktif, id);
  if (hasil.changes === 0) return res.status(404).json({ error: 'akun tidak ditemukan' });
  catat(req.konselor.username, aktif ? 'aktifkan konselor' : 'nonaktifkan konselor', String(id), req.ip);
  res.json({ ok: true, aktif: !!aktif });
});

module.exports = router;
