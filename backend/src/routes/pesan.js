// Route pesan (serverless-safe): kirim & ambil pesan chat via HTTP.
// Realtime push dipegang Supabase (tabel chat_event) — route ini hanya tulis/baca.
const { Router } = require('express');
const { verifikasiJWT, encrypt, decrypt } = require('../security');
const { ambilSesi } = require('../deps');
const db = require('../db');
const audit = require('../audit');
const { buatEventPesan, kirimNotifTelegram } = require('../realtime');

const router = Router();
const MAX_PESAN = 2000;

// Isi req.session dari cookie JWT konselor (kalau ada). Pelapor anonim tidak
// punya cookie — mereka pakai anon-token via header Authorization.
router.use((req, _res, next) => {
  try { req.session = ambilSesi(req) || null; } catch { req.session = null; }
  next();
});

// Tiket valid = pengaduan (PN) atau pendaftaran minat program (PM).
async function cekTiket(tiket) {
  const p = await db.prepare('SELECT no_tiket FROM pengaduan WHERE no_tiket=$1').get(tiket);
  if (p) return true;
  const m = await db.prepare('SELECT kode_lacak FROM minat_program WHERE kode_lacak=$1').get(tiket);
  return !!m;
}

// POST /api/pesan  { tiket, isi }
// - Pelapor anonim: butuh header Authorization: Bearer <anon-token>
//   (didapat saat validasi tiket di /api/pesan/tiket)
// - Konselor: cookie session JWT (ambilSesi)
router.post('/', async (req, res) => {
  try {
    const { tiket, isi } = req.body || {};
    if (!tiket || !String(isi || '').trim()) return res.status(400).json({ error: 'tiket & isi wajib diisi' });
    if (String(isi).length > MAX_PESAN) return res.status(400).json({ error: 'pesan maksimal 2000 karakter' });
    if (!await cekTiket(tiket)) return res.status(404).json({ error: 'tiket tidak ditemukan' });

    let pengirim, pengirimId;

    // Anon-token eksplisit (header) MENANG atas cookie sisa. Kalau konselor
    // pernah login di browser yang sama, cookie ikut terkirim saat pelapor
    // chat di modal publik — tanpa ini pesan pelapor tersimpan 'konselor'.
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const sesi = req.session || null;

    if (token) {
      // Pelapor anonim: anon-token JWT berisi tiket yang mereka pegang
      let payload;
      try { payload = verifikasiJWT(token); } catch { return res.status(401).json({ error: 'token tidak valid' }); }
      if (payload.tiket !== tiket) return res.status(403).json({ error: 'tidak diizinkan' });
      pengirim = 'user';
      pengirimId = null;
    } else if (sesi && sesi.id) {
      const k = await db.prepare('SELECT id,aktif FROM konselor WHERE id=$1').get(sesi.id);
      if (!k) return res.status(401).json({ error: 'akun tidak ditemukan' });
      if (!k.aktif) return res.status(403).json({ error: 'akun nonaktif' });
      pengirim = 'konselor';
      pengirimId = k.id;
      // Auto-claim: konselor yang mengirim pesan pertama di tiket PN yang belum
      // ditangani otomatis jadi penangannya — ngobrol = menangani (sama seperti
      // alur minat). Tiket langsung pindah ke inbox konselor itu saja.
      if (tiket.startsWith('PN-')) {
        db.prepare('UPDATE pengaduan SET ditangani_oleh=$1 WHERE no_tiket=$2 AND ditangani_oleh IS NULL')
          .run(k.id, tiket).catch(() => {});
      }
    } else {
      return res.status(401).json({ error: 'token diperlukan' });
    }

    const sekarang = Date.now();
    await db.prepare('INSERT INTO pesan (no_tiket, pengirim, pengirim_id, isi_enc, dibuat) VALUES ($1,$2,$3,$4,$5)')
      .run(tiket, pengirim, pengirimId, encrypt(String(isi)), sekarang);

    // Pesan user masuk → tiket jadi "belum dibaca" lagi di inbox konselor.
    if (pengirim === 'user' && tiket.startsWith('PN-')) {
      db.prepare('UPDATE pengaduan SET dibaca=0 WHERE no_tiket=$1').run(tiket).catch(() => {});
    }

    // Trigger PG otomatis buat chat_event → Realtime push ke semua subscriber.
    // Tidak perlu insert manual di sini.

    // Dual-dispatch: kirim notifikasi Telegram ke pelapor (kalau sudah binding).
    // Gak await — notifikasi gagal gak boleh nahan response.
    if (pengirim === 'konselor') kirimNotifTelegram(tiket, 'konselor', String(isi)).catch(() => {});

    audit.catat(pengirim === 'konselor' ? ('konselor:' + pengirimId) : `user:${tiket}`,
      'KIRIM_PESAN', `${tiket} dari=${pengirim}`, req.ip);

    res.status(201).json({ ok: true, dibuat: sekarang, pengirim });
  } catch (e) {
    console.error('POST /api/pesan error', e);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/pesan?tiket=PN-...  → ambil history (plaintext, server-side decrypt)
// - Konselor: cookie session (baca semua tiket)
// - Pelapor: anon-token (hanya tiketnya sendiri)
router.get('/', async (req, res) => {
  try {
    const tiket = req.query.tiket;
    if (!tiket) return res.status(400).json({ error: 'tiket wajib diisi' });

    // Sama seperti POST: anon-token eksplisit menang atas cookie sisa.
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const sesi = req.session || null;
    if (token) {
      try {
        const payload = verifikasiJWT(token);
        if (payload.tiket !== tiket) return res.status(403).json({ error: 'tidak diizinkan' });
      } catch { return res.status(401).json({ error: 'token tidak valid' }); }
    } else if (!(sesi && sesi.id)) {
      return res.status(401).json({ error: 'token diperlukan' });
    }

    const rows = await db.prepare('SELECT pengirim, isi_enc, dibuat FROM pesan WHERE no_tiket=$1 ORDER BY dibuat ASC').all(tiket);
    res.json({ tiket, pesan: rows.map(r => ({ pengirim: r.pengirim, isi: decrypt(r.isi_enc), dibuat: r.dibuat })) });
  } catch (e) {
    console.error('GET /api/pesan error', e);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/pesan/tiket  { tiket }  → validasi tiket anonim, kirim anon-token
// Pelapor tidak perlu login — cukup tunjukkan nomor tiketnya.
// ANTI-ENUMERASI: pesan error identik untuk "tidak ada" & "format salah" agar
// attacker tak bisa membedakan valid/invalid lebih cepat dari rate limit.
router.post('/tiket', async (req, res) => {
  try {
    const { tiket } = req.body || {};
    // Format dulu: PN-/PM- + 8 digit + 4 hex. Format salah = 404 (bukan 400 —
    // jangan bedakan "format salah" dari "tidak ada", itukan oracle enumerasi).
    if (!tiket || !/^P[NM]-\d{8}-[0-9A-F]{4}$/.test(String(tiket).toUpperCase()))
      return res.status(404).json({ error: 'tiket tidak ditemukan' });
    if (!await cekTiket(tiket)) return res.status(404).json({ error: 'tiket tidak ditemukan' });

// Token anon: TTL pendek (2 jam) — tiket bocor tidak memberi akses permanen;
// pelapor yang sah bisa minta ulang kapan saja dari web.
const token = buatJWT({ tiket, anon: true }, '2h');
    res.json({ ok: true, token });
  } catch (e) {
    console.error('POST /api/pesan/tiket error', e);
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
