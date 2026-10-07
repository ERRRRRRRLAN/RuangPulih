// Rujukan anonim — JEMBATAN konselor -> pihak berwajib (polisi / dokter).
//
// Prinsip privasi (ini inti dari fitur ini):
//   - Pihak berwajib MELIHAT: kode rujukan RJ-..., tujuan, ringkasan kasus
//     (alasan dibuat oleh konselor, bebas data identitas), status.
//   - Pihak berwajib TIDAK MELIHAT: nomor tiket asli (PN-/PM-), kontak pelapor,
//     nama panggilan, cerita lengkap. Tiket sumber hanya ada di DB konselor.
//   - Pelapor tetap bisa lacak status rujukanannya lewat kode tiketnya sendiri,
//     tanpa perlu tahu kode RJ (dia tidak butuh — yang penting statusnya).
//
// Endpoint:
//   POST   /api/rujukan                    (konselor) buat rujukan dari tiket
//   GET    /api/rujukan                    (konselor) daftar rujukan yang dibuat
//   GET    /api/rujukan/:kode              (konselor) detail rujukan
//   PATCH  /api/rujukan/:kode              (konselor) update status / catatan
//   GET    /api/rujukan/lacak/:kode        (PUBLIK) cek status by kode RJ — tanpa login,
//                                          tanpa data sensitif

const express = require('express');
const router = express.Router();
const crypto = require('node:crypto');
const db = require('../db');
const { butuhKonselor } = require('../deps');
const { encrypt, decrypt, decryptAman } = require('../security');
const { catat } = require('../audit');
const { buatEventRujukan, buatEventStatus } = require('../realtime');

const TUJUAN_VALID = ['Polisi', 'Dokter'];
const STATUS_VALID = ['Dikirim', 'Diterima', 'Diproses', 'Selesai'];

// Status rujukan yang ditampilkan ke publik (pelapor) — minimal, tidak ada
// kode tiket sumber, tidak ada nama konselor detail.
const PETAS_PUBLIK = {
  Dikirim: 'Rujukan telah dikirim ke pihak berwajib',
  Diterima: 'Diterima oleh pihak berwajib',
  Diproses: 'Sedang diproses oleh pihak berwajib',
  Selesai: 'Penanganan selesai',
};

function buatKodeRujukan() {
  const tgl = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `RJ-${tgl}-${rand}`;
}

function validKode(kode) {
  return /^RJ-\d{8}-[0-9A-F]{4}$/.test(kode);
}

// Cek apakah sebuah tiket ada (PN- pengaduan atau PM- minat program).
// Rujukan bisa dibuat dari keduanya — pelapor adalah pelapor.
async function tiketAda(noTiket) {
  if (/^PN-\d{8}-[0-9A-F]{4}$/.test(noTiket)) {
    return !!(await db.prepare('SELECT 1 FROM pengaduan WHERE no_tiket = $1').get(noTiket));
  }
  if (/^PM-\d{8}-[0-9A-F]{4}$/.test(noTiket)) {
    return !!(await db.prepare('SELECT 1 FROM minat_program WHERE kode_lacak = $1').get(noTiket));
  }
  return false;
}

// POST /api/rujukan — konselor buat rujukan baru.
// Body: { tiket: 'PM-...', tujuan: 'Polisi'|'Dokter', alasan: '...', instansi?: '...' }
router.post('/', butuhKonselor, async (req, res) => {
  const tiket = String((req.body && req.body.tiket) || '').trim().toUpperCase();
  const tujuan = String((req.body && req.body.tujuan) || '').trim();
  const alasan = String((req.body && req.body.alasan) || '').trim();
  const instansi = String((req.body && req.body.instansi) || '').trim() || null;

  if (!validKodeTiket(tiket)) return res.status(400).json({ error: 'nomor tiket tidak valid' });
  if (!TUJUAN_VALID.includes(tujuan)) return res.status(400).json({ error: 'tujuan harus Polisi atau Dokter' });
  if (!alasan || alasan.length < 20) {
    return res.status(400).json({ error: 'alasan/ringkasan kasus wajib diisi (minimal 20 karakter)' });
  }
  if (alasan.length > 2000) return res.status(400).json({ error: 'alasan terlalu panjang (maks 2000 karakter)' });
  if (!tiketAda(tiket)) return res.status(404).json({ error: 'tiket tidak ditemukan' });

  // Cegah rujukan ganda untuk tiket + tujuan yang sama yang masih aktif.
  const sudah = await db.prepare(
    "SELECT kode_rujukan FROM rujukan WHERE sumber_tiket = $1 AND tujuan = $2 AND status != 'Selesai'"
  ).get(tiket, tujuan);
  if (sudah) return res.status(409).json({ error: 'rujukan aktif sudah ada untuk tiket & tujuan ini', kode_rujukan: sudah.kode_rujukan });

  const kode = buatKodeRujukan();
  await db.prepare(
    `INSERT INTO rujukan (kode_rujukan, sumber_tiket, tujuan, instansi, alasan_enc, status, dibuat_oleh, dibuat)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`
  ).run(kode, tiket, tujuan, instansi, encrypt(alasan), 'Dikirim', req.konselor.id, Date.now());

  catat(req.konselor.username, 'BUAT_RUJUKAN', `kode=${kode} tujuan=${tujuan} dari=${tiket}`, req.ip);

  // Notifikasi real-time ke pelapor via Supabase (event metadata saja).
  buatEventRujukan(tiket, tujuan);

  res.status(201).json({ ok: true, kode_rujukan: kode });
});

function validKodeTiket(t) {
  return /^(PN|PM)-\d{8}-[0-9A-F]{4}$/.test(t);
}

// GET /api/rujukan — daftar rujukan (konselor).
router.get('/', butuhKonselor, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;
  const status = req.query.status;

  const kondisi = [];
  const params = [];
  if (status && STATUS_VALID.includes(status)) { kondisi.push('r.status = $1'); params.push(status); }
  const where = kondisi.length ? 'WHERE ' + kondisi.join(' AND ') : '';

  const total = (await db.prepare(`SELECT COUNT(*) c FROM rujukan r ${where}`).get(...params)).c;
  // LIMIT/OFFSET nomornya menyusul setelah placeholder WHERE.
  const lp = params.length + 1, op = params.length + 2;
  const rows = await db.prepare(
    `SELECT r.kode_rujukan, r.sumber_tiket, r.tujuan, r.instansi, r.alasan_enc,
            r.status, r.dibuat, r.diperbarui, k.nama AS dibuat_oleh_nama
     FROM rujukan r
     LEFT JOIN konselor k ON k.id = r.dibuat_oleh
     ${where}
     ORDER BY (r.status = 'Selesai') ASC, r.dibuat DESC
     LIMIT $${lp} OFFSET $${op}`
  ).all(...params, limit, offset);

  const items = rows.map((r) => {
    let alasan = null;
    try { alasan = decrypt(r.alasan_enc); }
    catch (e) {
      // Data terenkripsi tidak bisa dibuka (key berubah / korup). Jangan
      // jatuhkan seluruh endpoint — tampilkan placeholder & log untuk admin.
      console.error('[rujukan] decrypt gagal', r.kode_rujukan, e.message);
      alasan = '[data tidak dapat dibaca]';
    }
    return {
      kode_rujukan: r.kode_rujukan,
      sumber_tiket: r.sumber_tiket,
      tujuan: r.tujuan,
      instansi: r.instansi,
      alasan,
      status: r.status,
      dibuat: r.dibuat,
      diperbarui: r.diperbarui,
      dibuat_oleh: r.dibuat_oleh_nama || null,
    };
  });

  res.json({ total, items });
});

// GET /api/rujukan/:kode — detail rujukan (konselor).
router.get('/:kode', butuhKonselor, async (req, res) => {
  const kode = String(req.params.kode || '').trim().toUpperCase();
  if (!validKode(kode)) return res.status(400).json({ error: 'kode rujukan tidak valid' });

  const r = await db.prepare(
    `SELECT r.*, k.nama AS dibuat_oleh_nama
     FROM rujukan r LEFT JOIN konselor k ON k.id = r.dibuat_oleh
     WHERE r.kode_rujukan = $1`
  ).get(kode);
  if (!r) return res.status(404).json({ error: 'rujukan tidak ditemukan' });

  catat(req.konselor.username, 'BACA_RUJUKAN', kode, req.ip);
  res.json({
    kode_rujukan: r.kode_rujukan,
    sumber_tiket: r.sumber_tiket,
    tujuan: r.tujuan,
    instansi: r.instansi,
    alasan: decryptAman(r.alasan_enc, `rujukan ${r.kode_rujukan}`),
    status: r.status,
    dibuat: r.dibuat,
    diperbarui: r.diperbarui,
    dibuat_oleh: r.dibuat_oleh_nama || null,
  });
});

// PATCH /api/rujukan/:kode — update status rujukan (konselor).
// Body: { status?: 'Diterima'|'Diproses'|'Selesai', alasan?: '...' }
router.patch('/:kode', butuhKonselor, async (req, res) => {
  const kode = String(req.params.kode || '').trim().toUpperCase();
  if (!validKode(kode)) return res.status(400).json({ error: 'kode rujukan tidak valid' });

  const ada = await db.prepare('SELECT id, status FROM rujukan WHERE kode_rujukan = $1').get(kode);
  if (!ada) return res.status(404).json({ error: 'rujukan tidak ditemukan' });

  const status = req.body && req.body.status ? String(req.body.status).trim() : null;
  const alasanBaru = req.body && req.body.alasan ? String(req.body.alasan).trim() : null;

  const set = [];
  const params = [];
  let n = 0;
  if (status && STATUS_VALID.includes(status)) { n++; set.push('status = $' + n); params.push(status); }
  if (alasanBaru !== null) {
    if (alasanBaru.length < 20) return res.status(400).json({ error: 'alasan minimal 20 karakter' });
    n++; set.push('alasan_enc = $' + n); params.push(encrypt(alasanBaru));
  }
  if (!set.length) return res.status(400).json({ error: 'tidak ada perubahan' });

  n++; set.push('diperbarui = $' + n); params.push(Date.now());
  n++; params.push(kode);
  await db.prepare(`UPDATE rujukan SET ${set.join(', ')} WHERE kode_rujukan = $` + n).run(...params);

  catat(req.konselor.username, 'UPDATE_RUJUKAN', `kode=${kode} status=${status || ada.status}`, req.ip);

  // Beri tahu pelapor via Supabase bahwa rujukannya maju status.
  if (status && PETAS_PUBLIK[status]) {
    const sumber = await db.prepare('SELECT sumber_tiket FROM rujukan WHERE kode_rujukan = $1').get(kode);
    if (sumber) buatEventStatus(sumber.sumber_tiket, status);
  }

  res.json({ ok: true });
});

// GET /api/rujukan/lacak/:kode — PUBLIK (tanpa login).
// Pelapor / siapa pun bisa cek status rujukan dengan kode RJ-...
// Respons sengaja dibuat minim: tidak ada tiket sumber, tidak ada alasan lengkap
// (alasan berisi detail kasus yang bisa mengandung info sensitif).
router.get('/lacak/:kode', async (req, res) => {
  const kode = String(req.params.kode || '').trim().toUpperCase();
  if (!validKode(kode)) return res.status(400).json({ error: 'kode rujukan tidak valid' });

  const r = await db.prepare(
    'SELECT tujuan, instansi, status, dibuat, diperbarui FROM rujukan WHERE kode_rujukan = $1'
  ).get(kode);
  if (!r) return res.status(404).json({ error: 'rujukan tidak ditemukan' });

  res.json({
    tujuan: r.tujuan,
    instansi: r.instansi,
    status: r.status,
    keterangan: PETAS_PUBLIK[r.status] || r.status,
    dibuat: r.dibuat,
    diperbarui: r.diperbarui,
  });
});

module.exports = router;
