// WebSocket chat real-time: 2 peran — anonim (no_tiket) & konselor (JWT).
const { WebSocketServer } = require('ws');
const { verifikasiJWT, encrypt, decrypt } = require('./security');
const db = require('./db');
const audit = require('./audit');

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

function pasang(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const klien = new Set(); // {tiket?, konselor?, ws}

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const tiket = url.searchParams.get('tiket');      // anonim: cukup no_tiket
    const token = url.searchParams.get('token') || parseCookie(req.headers.cookie).session; // konselor: JWT
    let sesi = {};

    if (token) {
      try {
        const j = verifikasiJWT(token);
        const k = db.prepare('SELECT id,username,nama,peran,aktif FROM konselor WHERE id=?').get(j.id);
        if (!k || !k.aktif) return ws.close(4001, 'akun nonaktif');
        sesi.konselor = k;
      } catch { return ws.close(4001, 'token tidak valid'); }
    } else if (tiket) {
      const p = db.prepare('SELECT no_tiket FROM pengaduan WHERE no_tiket=?').get(tiket);
      if (!p) return ws.close(4004, 'tiket tidak ditemukan');
      sesi.tiket = tiket;
    } else return ws.close(4000, 'butuh tiket atau token');

    const klienSesi = { ...sesi, ws };
    klien.add(klienSesi);
    ws.on('close', () => klien.delete(klienSesi));

    // kirim history pesan tiket ini
    const tujuan = sesi.tiket || null;
    if (tujuan) kirimHistory(ws, tujuan);

    ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(data); } catch { return ws.send(JSON.stringify({ error: 'json tidak valid' })); }
      if (m.type !== 'pesan' || !String(m.isi || '').trim()) return;
      if (String(m.isi).length > 2000) return ws.send(JSON.stringify({ error: 'pesan maksimal 2000 karakter' }));
      if (!m.tiket) return;

      const p = db.prepare('SELECT no_tiket FROM pengaduan WHERE no_tiket=?').get(m.tiket);
      if (!p) return ws.send(JSON.stringify({ error: 'tiket tidak ditemukan' }));

      // anonim HANYA bisa kirim ke tiketnya sendiri
      if (sesi.tiket && sesi.tiket !== m.tiket) return ws.send(JSON.stringify({ error: 'tidak diizinkan' }));

      const pengirim = sesi.konselor ? 'konselor' : 'user';
      const sekarang = Date.now();
      db.prepare('INSERT INTO pesan (no_tiket, pengirim, pengirim_id, isi_enc, dibuat) VALUES (?,?,?,?,?)')
        .run(m.tiket, pengirim, sesi.konselor ? sesi.konselor.id : null, encrypt(String(m.isi)), sekarang);

      const payload = JSON.stringify({ type: 'pesan', tiket: m.tiket, pengirim, isi: String(m.isi), dibuat: sekarang });
      // kirim ke pengirim + semua klien yang relevan (pemilik tiket / konselor di tiket itu)
      for (const k of klien) {
        const relevan = k.konselor ? true : (k.tiket === m.tiket);
        if (relevan && k.ws.readyState === 1) k.ws.send(payload);
      }
      audit.catat(sesi.konselor ? sesi.konselor.username : `user:${m.tiket}`,
                  'KIRIM_PESAN', `${m.tiket} dari=${pengirim}`, req.socket.remoteAddress);
    });
  });
}

function kirimHistory(ws, tiket) {
  const rows = db.prepare('SELECT pengirim, isi_enc, dibuat FROM pesan WHERE no_tiket=? ORDER BY dibuat ASC').all(tiket);
  ws.send(JSON.stringify({ type: 'history', tiket, pesan: rows.map(r => ({ pengirim: r.pengirim, isi: decrypt(r.isi_enc), dibuat: r.dibuat })) }));
}

module.exports = { pasang };
