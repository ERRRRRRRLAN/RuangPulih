// Realtime helper: tulis event metadata ke tabel chat_event + notifikasi Telegram.
// Supabase Realtime mem-push event ini ke klien (bel notifikasi).
// Pesan chat TIDAK ditulis di sini — trigger PG handle insert ke tabel pesan.
// Event di sini hanya untuk notifikasi non-pesan: pengaduan baru, rujukan, status.
const db = require('./db');
const config = require('./config');

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

/* ===================== TELEGRAM ===================== */
// Dual-dispatch: selain push Realtime ke browser pelapor, kirim juga ke Telegram
// kalau dia sudah binding. Telegram = pseudonim persisten: user tetap anonymous,
// tapi notifikasi masuk ke HP. Transport MTProto, isinya tetap dienkripsi di DB.

function apiTelegram(method, body) {
  if (!config.TELEGRAM_TOKEN) return Promise.resolve(null); // fitur mati
  return fetch(`https://api.telegram.org/bot${config.TELEGRAM_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json().then(j => j).catch(() => ({ error: 'bad response' })))
    .catch(e => ({ error: e.message }));
}

// Cari chat_id Telegram yang terikat ke tiket/program
async function cariTujuanTelegram(tiket) {
  const baris = await db.prepare(
    'SELECT chat_id FROM ikatan_telegram WHERE no_tiket=$1 OR no_program=$1'
  ).get(tiket);
  return baris && baris.chat_id ? String(baris.chat_id) : null;
}

// Kirim notifikasi pesan baru ke Telegram pelapor
async function kirimNotifTelegram(tiket, pengirim, isi) {
  const chatId = await cariTujuanTelegram(tiket);
  if (!chatId) return null; // pelapor belum binding TG — skip (bukan error)
  const teks = pengirim === 'konselor'
    ? `Konselor: ${isi}` // plain, supaya balasan natural
    : `Anda: ${isi}`;
  try {
    const res = await apiTelegram('sendMessage', {
      chat_id: chatId,
      text: teks,
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Balas via web (aman)', url: 'https://website-konseling-narkotika.vercel.app/?chat=' + tiket }],
          [{ text: 'Lihat status tiket', url: 'https://website-konseling-narkotika.vercel.app/program' }]
        ]
      }
    });
    return res;
  } catch (e) {
    return null;
  }
}

// Kirim pesan teks dari pelapor (lewat bot) → balasan konselor tidak dikirim ulang
function kirimPesanTelegram(chatId, teks, extra) {
  return apiTelegram('sendMessage', Object.assign({ chat_id: chatId, text: teks }, extra || {}));
}

module.exports = {
  buatEvent, buatEventPesan, buatEventPengaduanBaru, buatEventRujukan, buatEventStatus,
  kirimNotifTelegram, kirimPesanTelegram, apiTelegram
};
