// Dashboard konselor + admin: statistik, antrian, filter, audit log.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { butuhKonselor, butuhAdmin } = require('../deps');

// GET /api/dashboard/stats — ringkasan untuk dashboard konselor
router.get('/stats', butuhKonselor, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM pengaduan').get().c;
  const baru = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Diterima'").get().c;
  const aktif = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Ditinjau' OR status='Dalam Penanganan'").get().c;
  const selesai = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Selesai'").get().c;
  const belumDibaca = db.prepare('SELECT COUNT(*) c FROM pengaduan WHERE dibaca=0').get().c;
  res.json({ total, baru, aktif, selesai, belumDibaca });
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

module.exports = router;
