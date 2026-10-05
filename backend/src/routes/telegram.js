// Route Telegram Bot (RuangPulihBot): binding tiket pelapor + terima/mirim pesan.
//
// Alur binding (privacy-preserving):
//   Pelapor buka web → dapat kode PN-... → klik "Chat via Telegram"
//     → https://t.me/RuangPulihBot?start=PN-...
//     → Bot binding telegram_id (pseudonim) ↔ no_tiket
//
// Setelah binding, pelapor dapat:
//   - notifikasi Telegram saat konselor membalas (dual-dispatch dari pesan.js)
//   - /status, /bantuan, /lepas
//
// Pengiriman pesan dari Telegram KE web: pelapor balas bot → bot insert ke pesan
// (encrypt server-side) → konselor lihat di dashboard seperti pesan web biasa.
const { Router } = require('express');
const db = require('../db');
const config = require('../config');
const audit = require('../audit');
const { encrypt } = require('../security');
const { buatEventPesan, kirimPesanTelegram, apiTelegram } = require('../realtime');

const router = Router();
const TELEGRAM_TOKEN = config.TELEGRAM_TOKEN || '';

// Webhook secret: header X-Telegram-Bot-Api-Secret-Token atau di URL path.
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || 'rp-webhook-2026';

// Quick-reply standar untuk pelapor (inline keyboard context-aware).
const URL_WEB = 'https://website-konseling-narkotika.vercel.app';

function keyboardCepat(tiket) {
  return {
    inline_keyboard: [
      [{ text: 'Mau tanya dulu', callback_data: 'qc:tanya' }, { text: 'Butuh bantuan darurat', callback_data: 'qc:darurat' }],
      [
        { text: 'Cek status', callback_data: 'qc:status' },
        { text: 'Buka di web', url: `${URL_WEB}/?chat=${encodeURIComponent(tiket || '')}` },
      ],
    ],
  };
}

// Cek keamanan: webhook harus tetap rahasia. Vercel: secret di env, bukan di repo.
function verifyWebhook(req) {
  // Prioritas: secret token header Telegram
  const headerSecret = req.get('X-Telegram-Bot-Api-Secret-Token');
  if (headerSecret && headerSecret === WEBHOOK_SECRET) return true;
  // atau rute URL bersecret
  if (req.url && req.url.includes('/' + WEBHOOK_SECRET)) return true;
  return false;
}

// Format pesan chat untuk Telegram (escape markdown sensitif)
function esc(s) {
  return String(s || '').replace(/[_[\]()*`~>#+=|{}.!\\-]/g, '\\$&');
}

// Pesan balasan standar
async function balas(chatId, teks, extra) {
  await kirimPesanTelegram(chatId, teks, extra);
}

// Tiket valid = pengaduan (PN) atau minat program (PM).
async function cekTiket(tiket) {
  const p = await db.prepare('SELECT no_tiket FROM pengaduan WHERE no_tiket=$1').get(tiket);
  if (p) return true;
  const m = await db.prepare('SELECT kode_lacak FROM minat_program WHERE kode_lacak=$1').get(tiket);
  return !!m;
}

// Status tiket untuk /status
async function statusTiket(tiket) {
  const p = await db.prepare('SELECT no_tiket,status,darurat,dibuat FROM pengaduan WHERE no_tiket=$1').get(tiket);
  if (p) {
    const d = new Date(p.dibuat);
    return `Tiket: ${tiket}\nStatus: ${p.status}${p.darurat ? ' (DARURAT)' : ''}\nDibuat: ${d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
  }
  const m = await db.prepare('SELECT kode_lacak,program,status FROM minat_program WHERE kode_lacak=$1').get(tiket);
  if (m) return `Tiket: ${tiket}\nProgram: ${m.program || '-'}\nStatus: ${m.status}`;
  return null;
}

// Binding telegram_id ↔ tiket
async function binding(msg) {
  const tgId = msg.from.id;
  const chatId = msg.chat.id;
  const nama = msg.from.first_name || msg.from.username || 'Anonim';
  const teks = (msg.text || '').trim();
  const args = teks.split(/\s+/);
  const kode = args.length > 1 ? args[1] : null;

  if (!kode) {
    await balas(chatId,
      'Halo! Saya RuangPulihBot.\n\n' +
      'Untuk menghubungkan chat ini dengan laporan Anda, buka web Ruang Pulih dan klik tombol "Chat via Telegram" — atau ketik /mulai PN-XXXX (nomor tiket Anda).');
    return;
  }

  if (!await cekTiket(kode)) {
    await balas(chatId, `Nomor tiket ${esc(kode)} tidak ditemukan. Pastikan format benar (contoh: PN-20261004-9F77).`);
    return;
  }

  // Upsert binding
  await db.prepare(
    `INSERT INTO ikatan_telegram (telegram_id, chat_id, no_tiket, no_program, nama_layar, dibuat)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (telegram_id) DO UPDATE SET
       chat_id=$2, no_tiket=$3, no_program=$4, nama_layar=$5, dibuat=$6`
  ).run(tgId, chatId, kode, null, nama, Date.now());

  await balas(chatId,
    `Chat Anda sudah terhubung dengan tiket ${esc(kode)}.\n\n` +
    'Konselor akan membalas di sini dan di web. Pesan Anda di sini tersimpan terenkripsi di server.\n\n' +
    'Perintah: /status — cek status tiket | /bantuan — bantuan | /lepas — putuskan ikatan',
    { reply_markup: keyboardCepat(kode) });
}

// Terima pesan balasan pelapor (dari Telegram) → insert ke DB (encrypt server-side)
async function terimaPesan(msg) {
  const tgId = msg.from.id;
  const chatId = msg.chat.id;
  const teks = (msg.text || '').trim();

  const ikatan = await db.prepare(
    'SELECT no_tiket, no_program FROM ikatan_telegram WHERE telegram_id=$1'
  ).get(tgId);
  if (!ikatan) {
    await balas(chatId, 'Anda belum menghubungkan tiket. Ketik /mulai PN-XXXX (nomor tiket Anda).');
    return;
  }
  const tiket = ikatan.no_tiket || ikatan.no_program;
  if (!teks) return;

  // Sesi sudah selesai? Kirim kartu "sesi selesai" alih-alih masukkan pesan.
  const selesai = await cekSelesai(tiket);
  if (selesai) {
    await balas(chatId,
      'Sesi untuk tiket ini sudah selesai.\n\n' +
      'Kalau butuh bantuan lagi, ajukan laporan baru di web lalu ketik /mulai dengan tiket baru — atau hubungi hotline: 188 (BNN) / 119 (Medis) / 110 (Polri).',
      { reply_markup: { inline_keyboard: [[
        { text: 'Ajukan laporan baru', url: `${URL_WEB}/` },
        { text: 'Lihat program', url: `${URL_WEB}/program` },
      ]] } });
    audit.catat(`tg:${tgId}`, 'PESAN_TOLAK_SELESAI', `${tiket} sesi=selesai`, 'telegram');
    return;
  }

  await db.prepare(
    'INSERT INTO pesan (no_tiket, pengirim, pengirim_id, isi_enc, dibuat) VALUES ($1,$2,$3,$4,$5)'
  ).run(tiket, 'user', null, encrypt(teks), Date.now());

  // Trigger PG otomatis push Realtime → konselor dashboard langsung lihat.

  audit.catat(`tg:${tgId}`, 'KIRIM_PESAN_TG', `${tiket} dari=user`, 'telegram');

  // Konfirmasi singkat ke pelapor (supaya dia tau pesannya terkirim)
  await balas(chatId, 'Terkirim. Konselor akan membalas secepatnya.');
}

// Cek apakah sesi tiket sudah selesai (pengaduan atau minat program)
async function cekSelesai(tiket) {
  const p = await db.prepare("SELECT 1 FROM pengaduan WHERE no_tiket=$1 AND status='Selesai'").get(tiket);
  if (p) return true;
  const m = await db.prepare("SELECT 1 FROM minat_program WHERE kode_lacak=$1 AND status='Selesai'").get(tiket);
  return !!m;
}

// Command handler
async function handleCommand(msg) {
  const chatId = msg.chat.id;
  const cmd = (msg.text || '').trim().split(/\s+/)[0].toLowerCase();
  const args = (msg.text || '').trim().split(/\s+/).slice(1).join(' ').trim();

  if (cmd === '/start') return binding(msg);
  if (cmd === '/mulai') return binding(msg);

  if (cmd === '/status') return handleStatusCommand(chatId, msg.from.id, args);

  if (cmd === '/bantuan' || cmd === '/help') {
    await balas(chatId,
      'Ruang Pulih Bot — konseling anonim narkotika.\n\n' +
      '/status — cek status tiket Anda\n' +
      '/mulai PN-XXXX — hubungkan tiket lain\n' +
      '/lepas — putuskan ikatan (chat Telegram tidak terkait tiket lagi)\n' +
      '/bantuan — bantuan ini\n\n' +
      'Chat dengan konselor: kirim pesan biasa di sini, atau buka web.\n' +
      'Hotline darurat: 188 (BNN) • 119 (Medis) • 110 (Polri)');
    return;
  }

  if (cmd === '/lepas') return handleLepasCommand(chatId, msg.from.id);

  // Pesan biasa (bukan command) → teruskan ke konselor
  return terimaPesan(msg);
}

// /status — cek status tiket (dipakai command & callback)
async function handleStatusCommand(chatId, tgId, args) {
  const ikatan = await db.prepare('SELECT no_tiket, no_program FROM ikatan_telegram WHERE telegram_id=$1').get(tgId);
  const kode = args || (ikatan && (ikatan.no_tiket || ikatan.no_program));
  if (!kode) { await balas(chatId, 'Penggunaan: /status PN-XXXX atau hubungkan tiket dulu via /mulai.'); return; }
  const s = await statusTiket(kode);
  await balas(chatId, s || `Tiket ${esc(kode)} tidak ditemukan.`);
}

// /lepas — putuskan ikatan Telegram ↔ tiket
async function handleLepasCommand(chatId, tgId) {
  await db.prepare('DELETE FROM ikatan_telegram WHERE telegram_id=$1').run(tgId);
  await balas(chatId, 'Ikatan tiket Anda sudah diputus. Akun Telegram Anda tidak lagi terkait tiket mana pun.');
}

// Handler callback inline keyboard (quick-reply pelapor)
async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const tgId = cb.from.id;
  const data = cb.data || '';

  // Selalu ack biar tombol tidak loading terus
  await apiTelegram('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});

  if (!data.startsWith('qc:')) return;

  const ikatan = await db.prepare(
    'SELECT no_tiket, no_program FROM ikatan_telegram WHERE telegram_id=$1'
  ).get(tgId);
  const tiket = ikatan ? (ikatan.no_tiket || ikatan.no_program) : null;

  if (data === 'qc:tanya') {
    await balas(chatId,
      'Silakan ketik pertanyaan Anda di sini. Konselor akan membalas secepatnya — biasanya beberapa jam.',
      { reply_markup: keyboardCepat(tiket) });
  } else if (data === 'qc:darurat') {
    await balas(chatId,
      'Kalau Anda dalam keadaan darurat sekarang, hubungi nomor ini langsung:\n\n' +
      '188 — BNN (Badan Narkotika Nasional)\n' +
      '119 — Bantuan medis\n' +
      '110 — Polri\n\n' +
      'Tetap di tempat aman. Kalau bukan darurat langsung, ketik pesan Anda — konselor akan membalas.',
      { reply_markup: { inline_keyboard: [[
        { text: 'Chat konselor', callback_data: 'qc:tanya' },
        { text: 'Lihat program', url: `${URL_WEB}/program` },
      ]] } });
  } else if (data === 'qc:status') {
    await handleStatusCommand(chatId, tgId);
  } else if (data === 'qc:lepas' || data === 'qc:putus') {
    await handleLepasCommand(chatId, tgId);
  }
}

// POST /api/telegram/webhook/:secret — Telegram kirim update ke sini
router.post('/webhook/:secret', async (req, res) => {
  try {
    if (req.params.secret !== WEBHOOK_SECRET) return res.status(401).json({ error: 'unauthorized' });
    const update = req.body || {};
    const cb = update.callback_query;
    if (cb && cb.from && cb.message && cb.message.chat) {
      await handleCallback(cb);
      return res.status(200).json({ ok: true });
    }
    const msg = update.message || update.edited_message;
    if (!msg || !msg.from || !msg.chat) return res.status(200).json({ ok: true, skip: true });

    if (!TELEGRAM_TOKEN) { res.status(200).json({ ok: true, disabled: true }); return; }

    // Command? atau pesan biasa
    if ((msg.text || '').startsWith('/')) await handleCommand(msg);
    else await terimaPesan(msg);

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('telegram webhook error', e);
    res.status(500).json({ error: 'server error' });
  }
});

// GET /api/telegram/webhook/:secret → health check
router.get('/webhook/:secret', (req, res) => {
  if (req.params.secret !== WEBHOOK_SECRET) return res.status(401).json({ error: 'unauthorized' });
  res.json({ ok: true, bot: !!TELEGRAM_TOKEN, name: config.TELEGRAM_BOTNAME });
});

// POST /api/telegram/setup — pasang webhook (dipanggil admin saat deploy)
router.post('/setup', async (req, res) => {
  try {
    if (!TELEGRAM_TOKEN) return res.status(400).json({ error: 'TELEGRAM_BOT_TOKEN belum diset' });
    const { url } = req.body || {};
    const base = url || process.env.PUBLIC_URL;
    if (!base) return res.status(400).json({ error: 'url wajib diisi' });
    const endpoint = `${base}/api/telegram/webhook/${WEBHOOK_SECRET}`;
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: endpoint, secret_token: WEBHOOK_SECRET })
    });
    const j = await r.json();
    res.json({ ok: j.ok, endpoint, result: j });
  } catch (e) { res.status(500).json({ error: 'server error' }); }
});

// DELETE /api/telegram/setup — lepas webhook (untuk dev lokal)
router.delete('/setup', async (req, res) => {
  if (!TELEGRAM_TOKEN) return res.status(400).json({ error: 'token belum diset' });
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteWebhook`, { method: 'POST' });
  const j = await r.json();
  res.json({ ok: j.ok, result: j });
});

// GET /api/telegram/info — status webhook + ikatan count (admin debug)
router.get('/info', async (req, res) => {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/getWebhookInfo`);
    const info = await r.json();
    const jml = await db.prepare('SELECT COUNT(*) as n FROM ikatan_telegram').get();
    res.json({ ok: true, webhook: info.result, ikatan: jml ? Number(jml.n) : 0, bot: config.TELEGRAM_BOTNAME });
  } catch (e) { res.status(500).json({ error: 'server error' }); }
});

module.exports = router;