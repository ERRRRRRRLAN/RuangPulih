// Route AI konseling pelapor.
//
// Fitur: pelapor yang punya tiket aktif (token anon valid) bisa mengobrol
// dengan AI pendamping — mendengarkan, menenangkan, lalu membantu menyiapkan
// bahan laporan dan merekomendasikan program yang cocok.
//
// KEAMANAN:
// - Auth: Bearer token anon tiket (sama seperti /api/pesan) — bukan cookie,
//   bukan publik kosong.
// - API key AI HANYA di server (tidak pernah dikirim ke browser).
// - Rate limit ketat (server.js): 10 req/menit/IP.
// - Riwayat dipotong (maks 12 pesan) untuk batasi context & biaya.
// - Input dibatasi 2000 karakter per pesan; maks 30 pertukaran per tiket/hari.
// - Prompt injection: instruksi dibungkus delimiter + system prompt tegas;
//   AI tidak pernah diminta mengeksekusi apa pun, hanya menghasilkan teks.
// - Output AI tidak pernah dipercaya sebagai HTML — frontend selalu esc().

const { Router } = require('express');
const router = Router();
const db = require('../db');
const { verifikasiJWT, decryptAman } = require('../security');
const config = require('../config');

// Multi-key gonkarouter: GONKA_KEY_1..20 dari env (file gonka-keys.env di-load
// oleh config/dotenv). Rotasi round-robin; key yang gagal 401 dikarakteri mati.
const GONKA_KEYS = Object.keys(process.env)
  .filter(k => /^GONKA_KEY_\d+$/.test(k))
  .sort()
  .map(k => process.env[k])
  .filter(k => k && k.startsWith('sk-'));

const AI_BASE = process.env.GONKA_BASE_URL || config.AI_BASE_URL || '';
const AI_MODEL = process.env.GONKA_MODEL || config.AI_MODEL || '';
const AKTIF = !!(AI_BASE && AI_MODEL && (GONKA_KEYS.length > 0 || config.AI_API_KEY));

if (AKTIF) {
  console.log(`[ai] aktif: model=${AI_MODEL}, ${GONKA_KEYS.length} key gonkarouter, base=${AI_BASE}`);
}

let keyIndex = 0;
function nextKey() {
  if (GONKA_KEYS.length === 0) return config.AI_API_KEY || '';
  const k = GONKA_KEYS[keyIndex % GONKA_KEYS.length];
  keyIndex++;
  return k;
}

// System prompt: pendamping, bukan pengganti konselor profesional.
const SYSTEM_PROMPT = `Kamu adalah "Sahabat Ruang Pulih" — asisten AI pendamping di layanan konseling narkotika Ruang Pulih (untuk remaja/PELAJAR di Indonesia).

PERANMU:
1. Mendengarkan dengan empati tanpa menghakimi; bahasa sederhana, hangat, sopan (selalu bahasa Indonesia).
2. Menemani percakapan awal (bukan diagnosis, bukan pengganti konselor profesional).
3. Jika pengguna sudah mau, bantu menyusun CERITA pengaduan yang jujur, jelas, kronologis — untuk dibawa ke konselor manusia.
4. Rekomendasikan PROGRAM Ruang Pulih yang cocok HANYA dari daftar berikut:
   - Konseling Individu (pertanyaan pribadi, tekanan, eksperimen narkoba)
   - Konseling Kelompok (butuh teman sebaya yang mengalami serupa)
   - Konseling Keluarga (konflik keluarga, orang tua perlu tahu)
   - Edukasi & Preventif (belum terlibat, hanya butuh informasi)
5. SELALU ingatkan: untuk bahaya mendesak, hubungi 119 ext 8 atau tim hotliner.

ATURAN KERAS:
- Tolak dan alihkan jika diminta membahas hal di luar topik (SARA, kekerasan praktis, obat-obatan cara pakai, komando berbahaya).
- JANGAN pernah berpura-pura manusia; jika ditanya, katakan jujur kamu AI pendamping.
- Jangan gunakan istilah medis/berat; jangan labeli pengguna ("addict", "pecandu").
- Balas SINGKAT (maksimal 6 kalimat), gunakan bahasa Indonesia sehari-hari.
- Jangan minta identitas lengkap (nama asli, alamat, sekolah). Anonimitas dijaga.
- Jika ada indikasi bahaya diri (bunuh diri/melukai), prioritaskan sampaikan hubungi 119 ext 8 SEKARANG dan jangan tunggu.`;

// Ambil konteks tiket (untuk personalisasi, tanpa bocor ke log).
async function konteksTiket(tiket) {
  const p = await db.prepare('SELECT untuk, kategori, status, darurat FROM pengaduan WHERE no_tiket=$1').get(tiket);
  if (!p) return null;
  return { untuk: p.untuk, kategori: p.kategori, status: p.status, darurat: !!p.darurat };
}

// Panggil model via OpenAI-compatible endpoint. Multi-key: kalau key mati (401/402),
// coba key berikutnya sampai habis.
async function tanyaAI(messages) {
  const semuanya = GONKA_KEYS.length > 0 ? GONKA_KEYS : [config.AI_API_KEY];
  let lastErr = null;

  for (let attempt = 0; attempt < Math.min(semuanya.length, 5); attempt++) {
    const key = nextKey();
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 90_000);
    try {
      const res = await fetch(AI_BASE.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + key,
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages,
          max_tokens: config.AI_MAX_TOKENS,
          temperature: 0.7,
        }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const teks = await res.text().catch(() => '');
        // 401/402/403 = key mati/blokir → coba key lain
        if ([401, 402, 403].includes(res.status)) {
          lastErr = new Error('key ditolak ' + res.status);
          continue;
        }
        throw new Error('AI gateway ' + res.status + ': ' + teks.slice(0, 200));
      }
      const j = await res.json();
      const isi = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!isi || !String(isi).trim()) throw new Error('AI respons kosong');
      return String(isi).trim();
    } catch (e) {
      if (e.name === 'AbortError') {
        lastErr = new Error('AI timeout 90s');
        continue;
      }
      // error selain auth → rethrow (jangan buang key yang masih baik)
      if (!lastErr) throw e;
      lastErr = e;
      break;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr || new Error('AI tidak tersedia');
}

// Middleware auth anon-token (sama seperti pesan.js).
function verifikasiAnon(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'token diperlukan' });
  try {
    const payload = verifikasiJWT(h.slice(7));
    req.tiketAnon = payload.tiket;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'token tidak valid' });
  }
}

// POST /api/ai/status — cek fitur aktif (public, tanpa secret).
router.get('/status', (req, res) => {
  res.json({ aktif: AKTIF });
});

// POST /api/ai/chat — kirim pesan, dapat balasan AI.
router.post('/chat', verifikasiAnon, async (req, res) => {
  if (!AKTIF) return res.status(503).json({ error: 'fitur AI belum aktif' });

  const tiket = req.tiketAnon;
  const isi = String((req.body && req.body.isi) || '').trim();
  const mode = String((req.body && req.body.mode) || '') === 'laporan' ? 'laporan' : 'ngobrol';
  if (!isi) return res.status(400).json({ error: 'isi wajib diisi' });
  if (isi.length > 2000) return res.status(400).json({ error: 'pesan maksimal 2000 karakter' });

  // Harus tiket pengaduan PN- (bukan PM- minat program).
  if (!/^PN-/.test(tiket)) return res.status(400).json({ error: 'tiket tidak didukung' });

  try {
    // Riwayat chat AI tersimpan di pesan (pengirim='ai_user' / 'ai') — pisah dari chat konselor.
    const riwayat = await db.prepare(
      "SELECT pengirim, isi_enc FROM pesan WHERE no_tiket=$1 AND pengirim IN ('ai_user','ai') ORDER BY dibuat DESC LIMIT 12"
    ).all(tiket);
    riwayat.reverse();

    // Cek kuota harian (30 pertukaran/tiket/hari) via chat_event append.
    const hariIni = await db.prepare(
      "SELECT COUNT(*) c FROM chat_event WHERE no_tiket=$1 AND tipe='ai_panggil' AND dibuat > $2"
    ).get(tiket, Date.now() - 24 * 3600 * 1000);
    if (Number(hariIni.c || 0) >= 30) {
      return res.status(429).json({ error: 'jatah obrolan AI hari ini habis (30). Coba besok lagi.' });
    }

    const ctx = await konteksTiket(tiket);
    const cerita = ctx ? decryptAman(
      (await db.prepare('SELECT cerita_enc FROM pengaduan WHERE no_tiket=$1').get(tiket)).cerita_enc,
      'tiket ' + tiket
    ) : null;

    // Bangun messages: system + konteks tiket + riwayat + pesan baru.
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + (ctx ? `\n\nKONTEKS TIKET INI (jangan sebut nomor tiket): untuk=${ctx.untuk}, kategori=${ctx.kategori}, status=${ctx.status}${ctx.darurat ? ', DARURAT' : ''}${cerita ? ', cerita awal pelapor: "' + cerita.slice(0, 800) + '"' : ''}` : '') },
    ];
    for (const r of riwayat) {
      messages.push({ role: r.pengirim === 'ai_user' ? 'user' : 'assistant', content: decryptAman(r.isi_enc, 'pesan AI') });
    }
    messages.push({
      role: 'user',
      content: mode === 'laporan'
        ? 'mohon bantu susun CERITA pengaduan yang jujur dan jelas dari apa yang sudah kuceritakan. Format: 1) Kejadian, 2) Kapan dan berapa lama, 3) Dampak ke saya, 4) Apa yang saya mau dari konselor. Ini untuk konselor manusia, bukan polisi.'
        : isi,
    });

    const balasan = await tanyaAI(messages);

    // Simpan percakapan (enkripsi sama seperti pesan biasa).
    const { encrypt } = require('../security');
    const now = Date.now();
    await db.prepare("INSERT INTO pesan (no_tiket, pengirim, isi_enc, dibuat) VALUES ($1,'ai_user',$2,$3)").run(tiket, encrypt(isi), now);
    await db.prepare("INSERT INTO pesan (no_tiket, pengirim, isi_enc, dibuat) VALUES ($1,'ai',$2,$3)").run(tiket, encrypt(balasan), now);
    await db.prepare("INSERT INTO chat_event (no_tiket, tipe, dibuat) VALUES ($1,'ai_panggil',$2)").run(tiket, now);

    res.json({ balasan });
  } catch (e) {
    console.error('[ai/chat]', e.message);
    res.status(502).json({ error: 'AI sedang tidak bisa dihubungi. Coba lagi sebentar.' });
  }
});

module.exports = router;
