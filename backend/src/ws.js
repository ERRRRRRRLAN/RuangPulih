// WebSocket chat real-time: 2 peran — anonim (no_tiket) & konselor (JWT).
// Setiap koneksi dapat sid (session id) unik supaya pengirim TIDAK menerima
// pesannya sendiri dua kali (pengirim sudah render bubble secara lokal).
const { WebSocketServer } = require('ws');
const { verifikasiJWT, encrypt, decrypt } = require('./security');
const db = require('./db');
const audit = require('./audit');
const crypto = require('crypto');

let wssRef = null; // disimpan untuk broadcast cross-route (dashboard auto-update)

function parseCookie(header) { // cookie jar -> object
  const out = {};
  if (!header) return out;
  for (const bag of String(header).split(';')) {
    const i = bag.indexOf('=');
    if (i < 0) continue;
    out[bag.slice(0, i).trim()] = decodeURIComponent(bag.slice(i + 1).trim());
  }
  return out;
}

function pengirimDari(sesi) { return sesi.konselor ? 'konselor' : 'user'; }

function pasang(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wssRef = wss;
  const klien = new Set(); // {tiket?, konselor?, sid, ws}

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const tiket = url.searchParams.get('tiket');      // anonim: cukup no_tiket
    const token = url.searchParams.get('token') || parseCookie(req.headers.cookie).session; // konselor: JWT
    let sesi = {};

    if (token) {
      try {
        const j = verifikasiJWT(token);
        const k = await db.prepare('SELECT id,username,nama,peran,aktif FROM konselor WHERE id=$1').get(j.id);
        if (!k || !k.aktif) return ws.close(4001, 'akun nonaktif');
        sesi.konselor = k;
      } catch { return ws.close(4001, 'token tidak valid'); }
    } else if (tiket) {
      // Tiket bisa berasal dari pengaduan (PN-...) atau dari pendaftaran minat
      // program pemulihan (PM-...). Keduanya berhak chat anonim tanpa identitas.
      const p = await db.prepare('SELECT no_tiket FROM pengaduan WHERE no_tiket=$1').get(tiket);
      const m = await db.prepare('SELECT kode_lacak FROM minat_program WHERE kode_lacak=$1').get(tiket);
      if (!p && !m) return ws.close(4004, 'tiket tidak ditemukan');
      sesi.tiket = tiket;
    } else {
      // Tanpa tiket & tanpa token = tidak ada alasan valid konek.
      // (Dashboard live memakai cookie JWT, jadi tetap ter-autentikasi.)
      return ws.close(4003, 'tiket atau token diperlukan');
    }

    const sid = crypto.randomBytes(8).toString('hex');
    ws.__sid = sid;
    ws.__konselor = sesi.konselor || null;
    ws.__tiket = sesi.tiket || null;

    // perkenalkan sid ke klien supaya ia bisa mengabaikan pesannya sendiri
    ws.send(JSON.stringify({ type: 'hello', sid }));

    const klienSesi = { ...sesi, sid, ws };
    klien.add(klienSesi);
    ws.on('close', () => klien.delete(klienSesi));

    // Kirim history pesan tiket ini baik ke pelapor MAUPUN ke konselor.
    // Konselor terhubung dengan ?tiket=X (cookie JWT autentikasi mereka), jadi
    // gunakan tiket dari query — bukan sesi.tiket yang hanya diisi untuk pelapor.
    kirimHistory(ws, tiket);

    ws.on('message', async (data) => {
      let m;
      try { m = JSON.parse(data); } catch { return ws.send(JSON.stringify({ error: 'json tidak valid' })); }

      // indikator "sedang mengetik" — diteruskan ke lawan bicara, tidak disimpan
      if (m.type === 'typing') {
        if (!m.tiket) return;
        const t = JSON.stringify({ type: 'typing', sid, tiket: m.tiket, dari: pengirimDari(sesi) });
        for (const k of klien) {
          const relevan = k.konselor ? true : (k.tiket === m.tiket);
          if (relevan && k.sid !== sid && k.ws.readyState === 1) k.ws.send(t);
        }
        return;
      }
      if (m.type === 'baca') { // tandai pesan dibaca pelapor → hapus badge konselor
        if (m.tiket) broadcastKonselor({ type: 'dibaca', tiket: m.tiket }, sid);
        return;
      }

      if (m.type !== 'pesan' || !String(m.isi || '').trim()) return;
      if (String(m.isi).length > 2000) return ws.send(JSON.stringify({ error: 'pesan maksimal 2000 karakter' }));
      if (!m.tiket) return;

      // Tiket bisa dari pengaduan (PN-...) atau minat program (PM-...).
      // Pesan disimpan di tabel `pesan` yang sama, jadi chat lintas-fitur.
      const p = await db.prepare('SELECT no_tiket,darurat FROM pengaduan WHERE no_tiket=$1').get(m.tiket);
      const pm = await db.prepare('SELECT kode_lacak FROM minat_program WHERE kode_lacak=$1').get(m.tiket);
      if (!p && !pm) return ws.send(JSON.stringify({ error: 'tiket tidak ditemukan' }));

      // anonim HANYA bisa kirim ke tiketnya sendiri
      if (sesi.tiket && sesi.tiket !== m.tiket) return ws.send(JSON.stringify({ error: 'tidak diizinkan' }));

      const pengirim = sesi.konselor ? 'konselor' : 'user';
      const sekarang = Date.now();
      await db.prepare('INSERT INTO pesan (no_tiket, pengirim, pengirim_id, isi_enc, dibuat) VALUES ($1,$2,$3,$4,$5)')
        .run(m.tiket, pengirim, sesi.konselor ? sesi.konselor.id : null, encrypt(String(m.isi)), sekarang);

      // sid disertakan: klien pengirim akan mengabaikan pesannya sendiri,
      // klien/tab lain (termasuk tab konselor & pelapor lain) tetap menerimanya.
      const payload = JSON.stringify({ type: 'pesan', sid, tiket: m.tiket, pengirim, isi: String(m.isi), dibuat: sekarang });
      for (const k of klien) {
        // konselor menerima semua tiket (PUSH_PESAN), pelapor hanya tiketnya
        const relevan = k.konselor ? true : (k.tiket === m.tiket);
        if (relevan && k.sid !== sid && k.ws.readyState === 1) k.ws.send(payload);
      }
      // beritahu konselor online yang sedang TIDAK membuka tiket ini → badge unread
      if (pengirim === 'user') {
        broadcastKonselor({ type: 'pesan_baru', tiket: m.tiket, oleh: pengirim }, sid);
      }
      audit.catat(sesi.konselor ? sesi.konselor.username : `user:${m.tiket}`,
                  'KIRIM_PESAN', `${m.tiket} dari=${pengirim}`, req.socket.remoteAddress);
    });
  });
}

async function kirimHistory(ws, tiket) {
  const rows = await db.prepare('SELECT pengirim, isi_enc, dibuat FROM pesan WHERE no_tiket=$1 ORDER BY dibuat ASC').all(tiket);
  ws.send(JSON.stringify({ type: 'history', tiket, pesan: rows.map(r => ({ pengirim: r.pengirim, isi: decrypt(r.isi_enc), dibuat: r.dibuat })) }));
}

// Broadcast ke SEMUA konselor yang sedang online (dashboard auto-update).
// Dipanggil dari routes saat ada pengaduan baru / perubahan status.
function broadcastKonselor(payload, kecualiSid) {
  if (!wssRef) return;
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  for (const ws of wssRef.clients) {
    if (ws.readyState !== 1 || !ws.__konselor) continue;
    if (kecualiSid && ws.__sid === kecualiSid) continue;
    ws.send(data);
  }
}

// Kirim pesan ke pelapor yang sedang online di tiket tertentu.
// Dipakai untuk notifikasi non-chat: rujukan dibuat, status berubah, dll.
// Pelapor tetap anonim — pesan dikirim ke koneksi yang memegang tiket itu.
function kirimKeTiket(tiket, payload) {
  if (!wssRef) return false;
  const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
  let terkirim = false;
  for (const ws of wssRef.clients) {
    if (ws.readyState !== 1 || ws.__konselor || ws.__tiket !== tiket) continue;
    ws.send(data);
    terkirim = true;
  }
  return terkirim;
}

module.exports = { pasang, broadcastKonselor, kirimKeTiket };
