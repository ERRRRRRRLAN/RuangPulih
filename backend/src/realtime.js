// Realtime helper: tulis event metadata ke tabel chat_event.
// Supabase Realtime mem-push event ini ke klien (bel notifikasi).
// Pesan chat TIDAK ditulis di sini — trigger PG handle insert ke tabel pesan.
// Event di sini hanya untuk notifikasi non-pesan: pengaduan baru, rujukan, status.
const db = require('./db');

function buatEvent(tipe, noTiket, data = {}) {
  // return promise, gak throw — realtime gagal gak boleh putus request utama
  return db.prepare('INSERT INTO chat_event (no_tiket, tipe, data, dibuat) VALUES ($1,$2,$3,$4)')
    .run(noTiket, tipe, JSON.stringify(data), Date.now())
    .catch(e => console.error('buatEvent gagal:', e.message));
}

function buatEventPesan(noTiket) {
  return buatEvent('pesan', noTiket);
}

function buatEventPengaduanBaru(noTiket, darurat) {
  return buatEvent('pengaduan_baru', noTiket, { darurat: !!darurat });
}

function buatEventRujukan(noTiket, tujuan) {
  return buatEvent('rujukan', noTiket, { tujuan });
}

function buatEventStatus(noTiket, status) {
  return buatEvent('status', noTiket, { status });
}

module.exports = { buatEvent, buatEventPesan, buatEventPengaduanBaru, buatEventRujukan, buatEventStatus };
