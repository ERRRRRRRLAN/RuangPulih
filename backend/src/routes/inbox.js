// Inbox konselor: daftar tiket + pesan terakhir + hitung belum dibaca.
// Sumber gabungan pengaduan (PN) + minat_program (PM) — satu timeline.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { butuhKonselor } = require('../deps');
const { decrypt } = require('../security');

function potong(teks, n) {
  const s = String(teks || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// GET /api/dashboard/inbox — feed chat: tiket + pesan terakhir + unread count.
router.get('/inbox', butuhKonselor, async (req, res) => {
  try {
    const pn = await db.prepare(`
      SELECT p.no_tiket, p.status, p.darurat, p.dibuat, p.dibaca,
             COALESCE(k.nama, '') AS penangan,
             (SELECT COUNT(*) FROM pesan ps WHERE ps.no_tiket = p.no_tiket) AS jumlah_pesan,
             (SELECT ps.isi_enc FROM pesan ps WHERE ps.no_tiket = p.no_tiket ORDER BY ps.dibuat DESC LIMIT 1) AS isi_terakhir_enc,
             (SELECT ps.pengirim FROM pesan ps WHERE ps.no_tiket = p.no_tiket ORDER BY ps.dibuat DESC LIMIT 1) AS pengirim_terakhir,
             (SELECT ps.dibuat FROM pesan ps WHERE ps.no_tiket = p.no_tiket ORDER BY ps.dibuat DESC LIMIT 1) AS pesan_terakhir_ts
      FROM pengaduan p
      LEFT JOIN konselor k ON k.id = p.ditangani_oleh
      ORDER BY p.dibaca ASC, p.dibuat DESC
      LIMIT 100
    `).all();

    const pm = await db.prepare(`
      SELECT m.kode_lacak AS no_tiket, m.status, m.prioritas, m.dibuat,
             k.nama AS penangan, m.program,
             (SELECT COUNT(*) FROM pesan ps WHERE ps.no_tiket = m.kode_lacak) AS jumlah_pesan,
             (SELECT ps.isi_enc FROM pesan ps WHERE ps.no_tiket = m.kode_lacak ORDER BY ps.dibuat DESC LIMIT 1) AS isi_terakhir_enc,
             (SELECT ps.pengirim FROM pesan ps WHERE ps.no_tiket = m.kode_lacak ORDER BY ps.dibuat DESC LIMIT 1) AS pengirim_terakhir,
             (SELECT ps.dibuat FROM pesan ps WHERE ps.no_tiket = m.kode_lacak ORDER BY ps.dibuat DESC LIMIT 1) AS pesan_terakhir_ts
      FROM minat_program m LEFT JOIN konselor k ON k.id = m.ditangani_oleh
      ORDER BY (m.prioritas='Tinggi') DESC, m.dibuat DESC LIMIT 200
    `).all();

    const items = [];
    const dek = (blob) => { try { return blob ? decrypt(blob) : null; } catch (e) { return '(pesan lama tak terbaca)'; } };
    for (const p of pn) {
      const lastDari = p.pengirim_terakhir || null;
      // unread = pesan terakhir dari user DAN tiket belum pernah dibuka (dibaca=0)
      const unread = (!p.dibaca && lastDari === 'user') ? 1 : 0;
      items.push({
        tiket: p.no_tiket,
        jenis: 'PN',
        label: p.darurat ? 'DARURAT' : '',
        status: p.status,
        penangan: p.penangan || null,
        preview: p.isi_terakhir_enc ? potong(dek(p.isi_terakhir_enc), 90) : '(belum ada pesan)',
        dari: lastDari,
        jumlah_pesan: Number(p.jumlah_pesan) || 0,
        pesan_ts: Number(p.pesan_terakhir_ts) || Number(p.dibuat),
        dibuat: Number(p.dibuat),
        unread
      });
    }
    for (const m of pm) {
      const lastDari = m.pengirim_terakhir || null;
      items.push({
        tiket: m.no_tiket,
        jenis: 'PM',
        label: m.program || '',
        status: m.status,
        penangan: m.penangan || null,
        preview: m.isi_terakhir_enc ? potong(dek(m.isi_terakhir_enc), 90) : '(belum ada pesan)',
        dari: lastDari,
        jumlah_pesan: Number(m.jumlah_pesan) || 0,
        pesan_ts: Number(m.pesan_terakhir_ts) || Number(m.dibuat),
        dibuat: Number(m.dibuat),
        unread: 0 // minat belum punya tracking dibaca — sederhana dulu
      });
    }
    // urutkan: yang ada pesan terbaru dulu
    items.sort((a, b) => b.pesan_ts - a.pesan_ts);
    res.json({ items });
  } catch (e) {
    console.error('inbox error', e);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/dashboard/inbox/:tiket/baca — tandai tiket sudah dibaca konselor.
router.post('/inbox/:tiket/baca', butuhKonselor, async (req, res) => {
  try {
    const tiket = String(req.params.tiket || '').toUpperCase();
    if (tiket.startsWith('PN-')) {
      await db.prepare('UPDATE pengaduan SET dibaca=1 WHERE no_tiket=$1').run(tiket);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/dashboard/inbox/:tiket/baca — tandai BELUM dibaca (pesan baru masuk).
router.delete('/inbox/:tiket/baca', butuhKonselor, async (req, res) => {
  try {
    const tiket = String(req.params.tiket || '').toUpperCase();
    if (tiket.startsWith('PN-')) {
      await db.prepare('UPDATE pengaduan SET dibaca=0 WHERE no_tiket=$1').run(tiket);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server error' });
  }
});

module.exports = router;
