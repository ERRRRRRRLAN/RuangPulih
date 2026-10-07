// Dashboard konselor + admin: statistik, antrian, filter, audit log, antrian minat.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { butuhKonselor, butuhAdmin } = require('../deps');
const { hashSandi, decrypt, decryptAman } = require('../security');
const { catat } = require('../audit');

// GET /api/dashboard/stats — ringkasan untuk dashboard konselor
router.get('/stats', butuhKonselor, async (req, res) => {
  const total = (await db.prepare('SELECT COUNT(*) c FROM pengaduan').get()).c;
  const baru = (await db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Diterima'").get()).c;
  const aktif = (await db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Ditinjau' OR status='Dalam Penanganan'").get()).c;
  const selesai = (await db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Selesai'").get()).c;
  const belumDibaca = (await db.prepare('SELECT COUNT(*) c FROM pengaduan WHERE dibaca=0').get()).c;
  const darurat = (await db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE darurat=1 AND status!='Selesai'").get()).c;
  const sehari = (await db.prepare('SELECT COUNT(*) c FROM pengaduan WHERE dibuat >= $1').get(Date.now() - 24 * 60 * 60 * 1000)).c;
  res.json({ total, baru, aktif, selesai, belumDibaca, darurat, sehari });
});

// GET /api/dashboard/antrian — daftar tiket dengan filter status + pagination
router.get('/antrian', butuhKonselor, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;
  const status = req.query.status;
  const q = status
    ? await db.prepare('SELECT * FROM pengaduan WHERE status=$1 ORDER BY dibaca ASC, dibuat DESC LIMIT $2 OFFSET $3').all(status, limit, offset)
    : await db.prepare('SELECT * FROM pengaduan ORDER BY dibaca ASC, dibuat DESC LIMIT $1 OFFSET $2').all(limit, offset);
  const total = status
    ? (await db.prepare('SELECT COUNT(*) c FROM pengaduan WHERE status=$1').get(status)).c
    : (await db.prepare('SELECT COUNT(*) c FROM pengaduan').get()).c;
  res.json({ total, items: q.map(p => ({
    no_tiket: p.no_tiket, untuk: p.untuk, kategori: p.kategori, status: p.status,
    darurat: !!p.darurat,
    dibuat: p.dibuat, diperbarui: p.diperbarui, dibaca: !!p.dibaca,
    ditangani_oleh: p.ditangani_oleh || null,
  })) });
});

// GET /api/dashboard/audit — admin saja: log audit (auditabilitas PDF 3.8)
router.get('/audit', butuhKonselor, butuhAdmin, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = await db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT $1').all(limit);
  res.json(rows);
});

// GET /api/dashboard/konselor — admin saja: daftar akun konselor
router.get('/konselor', butuhKonselor, butuhAdmin, async (req, res) => {
  const rows = await db.prepare('SELECT id, username, nama, peran, aktif, dibuat FROM konselor ORDER BY id ASC').all();
  res.json(rows);
});

// POST /api/dashboard/konselor — admin saja: tambah akun konselor
router.post('/konselor', butuhKonselor, butuhAdmin, async (req, res) => {
  const { username, nama, sandi, peran } = req.body || {};
  if (!username || !nama || !sandi) return res.status(400).json({ error: 'username, nama, dan sandi wajib diisi' });
  if (peran && !['konselor', 'admin'].includes(peran)) return res.status(400).json({ error: 'peran tidak valid' });
  try {
    await db.prepare('INSERT INTO konselor (username, nama, sandi_hash, peran, aktif, gagal, dibuat) VALUES ($1,$2,$3,$4,$5,$6,$7)')
      .run(username.trim(), nama.trim(), await hashSandi(sandi), peran || 'konselor', 1, 0, Date.now());
  } catch (e) {
    return res.status(409).json({ error: 'username sudah dipakai' });
  }
  catat(req.konselor.username, 'tambah konselor', username.trim(), req.ip);
  res.status(201).json({ ok: true });
});

// PATCH /api/dashboard/konselor/:id/aktif — admin saja: aktifkan/nonaktifkan akun
router.patch('/konselor/:id/aktif', butuhKonselor, butuhAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id tidak valid' });
  if (id === req.konselor.id) return res.status(400).json({ error: 'tidak dapat mengubah akun sendiri' });
  const aktif = req.body && req.body.aktif ? 1 : 0;
  const hasil = await db.prepare('UPDATE konselor SET aktif=$1 WHERE id=$2').run(aktif, id);
  if (hasil.changes === 0) return res.status(404).json({ error: 'akun tidak ditemukan' });
  catat(req.konselor.username, aktif ? 'aktifkan konselor' : 'nonaktifkan konselor', String(id), req.ip);
  res.json({ ok: true, aktif: !!aktif });
});

// GET /api/dashboard/minat — antrian pendaftar minat program pemulihan.
// Inilah jembatan: konselor lihat siapa butuh bantuan, assign diri sendiri,
// lalu chat langsung lewat kode PM-... tanpa identitas pelapor terungkap.
router.get('/minat', butuhKonselor, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;
  const status = req.query.status;
  const idKonselor = req.query.saya === '1' ? req.konselor.id : null;

  const kondisi = [];
  const params = [];
  let n = 0;
  if (status && ['Baru', 'Dihubungi', 'Terdaftar', 'Selesai'].includes(status)) {
    n += 1;
    kondisi.push('m.status = $' + n);
    params.push(status);
  }
  if (idKonselor) {
    n += 1;
    kondisi.push('m.ditangani_oleh = $' + n);
    params.push(idKonselor);
  }
  const where = kondisi.length ? 'WHERE ' + kondisi.join(' AND ') : '';
  const limitPh = '$' + (n + 1);
  const offsetPh = '$' + (n + 2);

  const total = (await db.prepare('SELECT COUNT(*) c FROM minat_program m ' + where).get(...params)).c;
  const rows = await db.prepare(
    'SELECT m.kode_lacak, m.program, m.panggilan, m.usia, m.status, m.prioritas, ' +
    'm.kontak_enc, m.catatan_enc, m.dibuat, m.diperbarui, ' +
    'k.nama AS ditangani_oleh_nama ' +
    'FROM minat_program m ' +
    'LEFT JOIN konselor k ON k.id = m.ditangani_oleh ' +
    where + ' ' +
    "ORDER BY (m.prioritas = 'Tinggi') DESC, m.dibuat DESC " +
    'LIMIT ' + limitPh + ' OFFSET ' + offsetPh
  ).all(...params, limit, offset);

  // kontak + catatan dienkripsi — dekripsi hanya untuk konselor yang login.
  const items = rows.map((r) => ({
    kode_lacak: r.kode_lacak,
    program: r.program,
    panggilan: r.panggilan,
    usia: r.usia,
    status: r.status,
    prioritas: r.prioritas,
    kontak: decryptAman(r.kontak_enc, `minat ${r.kode_lacak}`),
    catatan: decryptAman(r.catatan_enc, `minat ${r.kode_lacak}`),
    dibuat: r.dibuat,
    diperbarui: r.diperbarui,
    ditangani_oleh: r.ditangani_oleh_nama || null,
  }));

  res.json({ total, items });
});

// PATCH /api/dashboard/minat/:kode — update status minat + assign konselor.
router.patch('/minat/:kode', butuhKonselor, async (req, res) => {
  const kode = String(req.params.kode || '').trim().toUpperCase();
  if (!/^PM-\d{8}-[0-9A-F]{4}$/.test(kode)) {
    return res.status(400).json({ error: 'kode lacak tidak valid' });
  }

  const ada = await db.prepare('SELECT id, status FROM minat_program WHERE kode_lacak = $1').get(kode);
  if (!ada) return res.status(404).json({ error: 'minat tidak ditemukan' });

  const status = req.body.status ? String(req.body.status).trim() : null;
  const ambil = req.body.ambil === true || req.body.ambil === '1';
  const lepas = req.body.lepas === true || req.body.lepas === '1';
  // /program <nama>: konselor bisa langsung ganti program pendaftar dari chat
  // (mis. ternyata cocoknya rawat inap, bukan rawat jalan).
  const program = req.body.program ? String(req.body.program).trim() : null;

  const statusValid = ['Baru', 'Dihubungi', 'Terdaftar', 'Selesai'];
  const programValid = ['Detoksifikasi', 'Rehabilitasi Rawat Inap', 'Rehabilitasi Rawat Jalan', 'Aftercare'];
  const set = [];
  const params = [];
  let n = 0;
  if (status && statusValid.includes(status)) { n += 1; set.push('status = $' + n); params.push(status); }
  if (ambil) { n += 1; set.push('ditangani_oleh = $' + n); params.push(req.konselor.id); }
  else if (lepas) { set.push('ditangani_oleh = NULL'); }
  if (program && programValid.includes(program)) { n += 1; set.push('program = $' + n); params.push(program); }
  if (!set.length) return res.status(400).json({ error: 'tidak ada perubahan' });

  n += 1;
  set.push('diperbarui = $' + n);
  params.push(Date.now());
  n += 1;
  params.push(kode);
  await db.prepare('UPDATE minat_program SET ' + set.join(', ') + ' WHERE kode_lacak = $' + n).run(...params);

  catat(req.konselor.username, 'UPDATE_MINAT', 'kode=' + kode + ' status=' + (status || ada.status) + (program ? ' program=' + program : ''), req.ip);
  res.json({ ok: true });
});

module.exports = router;
