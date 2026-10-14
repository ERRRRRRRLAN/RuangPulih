// Route AI konseling — "Sahabat AI".
//
// DUA pintu:
//   1. Mode utama: SIAPA PUN tanpa tiket — sesi_id acak 64-hex dari server,
//      disimpan localStorage browser. TANPA nama, TANPA tiket. Riwayat di
//      tabel ai_chat (terenkripsi AES, terpisah dari tabel pesan konselor).
//   2. Mode tiket: pelapor dengan Bearer anon-token — riwayat AI di tabel
//      pesan (pengirim ai_user/ai), terkait laporan (kompatibilitas).
//
// KEAMANAN:
// - sesi_id = 64 hex dari crypto.randomBytes(32). Yang punya sesi_id bisa
//   melanjutkan percakapan itu (by design, seperti token sesi).
// - API key AI hanya di server (env Vercel), tidak pernah ke browser.
// - Rate limit 10/menit/IP (server.js). Kuota 40 pertukaran per sesi/hari.
// - Output AI tidak pernah dipercaya sebagai HTML — frontend selalu esc().

const { Router } = require('express');
const router = Router();
const crypto = require('node:crypto');
const db = require('../db');
const { verifikasiJWT, decryptAman, encrypt } = require('../security');
const config = require('../config');

// Multi-key gonkarouter: GONKA_KEY_1..20 rotasi + failover.
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

// System prompt: pendamping bagi yang belum berani ke konselor manusia.
const SYSTEM_PROMPT = `Kamu adalah "Sahabat AI" — teman bercerita di layanan konseling narkotika Ruang Pulih (untuk remaja/PELAJAR di Indonesia).

KONTEKS PENTING: Orang yang ngobrol denganmu BELUM BERANI bicara dengan konselor manusia. Peranmu jembatan: buat mereka merasa aman didengar dulu. JANGAN paksa bikin laporan; cukup ingatkan lembut bahwa konselor manusia siap KETIKA mereka siap — tidak di setiap balasan.

PERANMU:
1. Mendengarkan dengan empati tanpa menghakimi; bahasa sederhana, hangat, santai (selalu bahasa Indonesia).
2. Menemani percakapan awal — bukan diagnosis, bukan pengganti konselor profesional.
3. Jika mereka siap, bantu menyusun CERITA pengaduan yang jujur, kronologis — untuk dibawa ke konselor manusia.
4. Rekomendasikan PROGRAM Ruang Pulih yang cocok HANYA dari daftar ini:
   - Konseling Individu (pertanyaan pribadi, tekanan, eksperimen narkoba)
   - Konseling Kelompok (butuh teman sebaya yang alami serupa)
   - Konseling Keluarga (konflik keluarga, orang tua perlu tahu)
   - Edukasi & Preventif (belum terlibat, hanya butuh informasi)
5. SELALU ingatkan untuk situasi darurat: hubungi 119 ext 8 atau tim hotliner.

ATURAN KERAS:
- Tolak dan alihkan jika diminta hal di luar topik (SARA, cara pakai narkoba, komando berbahaya).
- JANGAN berpura-pura manusia — jika ditanya, katakan jujur kamu AI pendamping.
- Jangan istilah medis berat; jangan labeli pengguna ("addict", "pecandu").
- Balas SINGKAT (maks 6 kalimat), bahasa Indonesia sehari-hari.
- Format: boleh pakai **teks tebal** untuk poin penting dan daftar pendek dengan tanda '-', TANPA heading '##'/'###' markdown panjang — chat, bukan dokumen.
- Jangan minta identitas (nama asli, alamat, sekolah). Anonimitas dijaga.
- Indikasi bahaya diri (bunuh diri/melukai): prioritaskan sampaikan hubungi 119 ext 8 SEKARANG.

AKSI OTOMATIS [DRAFT_FORM]:
- Gunakan HANYA jika pengguna secara EKSPLISIT memakai kata buat/buatkan/isi/modifikasi/siapkan/status 'lapor/form/draft' yang mengacu ke laporan ATAU bertindak seolah ingin melapor SEKARANG.
- JANGAN pakai tag ini kalau pengguna hanya: bertanya ("obat jenis apa"), curhat, minta saran, atau klarifikasi — itu BUKAN permintaan laporan.
- Ragu? JANGAN pakai tag. Tanya balik: "Mau aku bantu susun laporannya?"
- Jika syarat di atas terpenuhi, AKHIRI balasanmu dengan tag ini di baris baru terpisah:
[DRAFT_FORM]{"untuk":"...","kategori":["..."],"frekuensi":"...","usia":16,"lokasi":"Tangerang Selatan","cerita":"...","darurat":false}
- Isi JSON dari informasi yang sudah diceritakan pengguna. cerita WAJIB orang pertama, merangkum semua fakta yang dia share. JANGAN mengarang.
- Format tag: [DRAFT_FORM]<json satu baris> — front-end akan otomatis membuka form pengaduan dan mengisi kolom-kolomnya.
- Jangan gunakan tag ini jika pengguna hanya cerita biasa tanpa permintaan laporan.`;

const PROMPT_LAPORAN = 'mohon bantu susun CERITA pengaduan yang jujur dan jelas dari apa yang sudah kuceritakan. Format: 1) Kejadian, 2) Kapan dan berapa lama, 3) Dampak ke saya, 4) Apa yang saya mau dari konselor. Ini untuk konselor manusia, bukan polisi.';

// ============ helpers ============

function sesiValid(s) {
  return typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
}

// Normalisasi draft form agar cocok dengan opsi form pengaduan.
const UNTUK_VALID = ['Diri sendiri', 'Teman', 'Anggota keluarga', 'Orang lain / tetangga', 'Jaringan pengedar'];
const KATEGORI_VALID = ['Ganja', 'Metamfetamina (Sabu)', 'Ekstasi', 'Heroin / Putaw', 'Obat resep disalahgunakan', 'Alkohol berlebihan', 'Lem / pelarut menguap', 'Belum yakin'];
const FREKUENSI_VALID = ['Pernah sekali / coba-coba', 'Beberapa kali', 'Sering (mingguan)', 'Hampir setiap hari', 'Tidak tahu / orang lain'];

function sanitasiDraft(d, transkrip) {
  d = d || {};
  const tr = String(transkrip || '').toLowerCase();

  // ===== Deteksi subjek pemakai (orang lain vs pelapor sendiri) =====
  const adaOrangLain = /\b(temen|teman|kawan|kakak|adik|abang|sepupu|ortu|orang\s+tua|tetangga|jaringan|pengedar|bilal)\b/.test(tr);
  const adaAkuPakai = /(^|\s)(aku|saya)(\s+(sendiri|sendirian|juga))?(\s+yang)?\s+(pakai|memakai|hisap|nyium|ngonsumsi|mencoba|coba|kecanduan)\b/.test(tr);
  const adaOrangPakai = /\b(temen|teman|kawan|kakak|adik|abang|sepupu|dia)\b[^.]{0,40}\b(pakai|memakai|hisap|nyium|ngonsumsi|mencoba|coba|nawarin|ngajak)\b/.test(tr) ||
                        /\b(nawarin|ngajak|nyium|hisap)[^.] {0,30}\b(ke\s+aku|ke\s+saya)/.test(tr);
  // pelapor = pemakai hanya jika "aku/saya + kata pakai" ADA dan TIDAK ada orang lain yang juga bermasalah
  const pakaiSendiri = adaAkuPakai && !(adaOrangLain && adaOrangPakai);
  const pakaiOrangLain = adaOrangLain && !pakaiSendiri;

  // ===== untuk siapa =====
  let untuk = String(d.untuk || '').toLowerCase();
  let untukFix = 'Diri sendiri';
  if (/teman|temen|kawan|sobat|friend/.test(untuk)) untukFix = 'Teman';
  else if (/keluarga|ortu|orang\s+tua|abang|kakak|adik|sepupu/.test(untuk)) untukFix = 'Anggota keluarga';
  else if (/pengedar|jaringan|bandar/.test(untuk)) untukFix = 'Jaringan pengedar';
  else if (/tetangga|orang\s+lain|warga/.test(untuk)) untukFix = 'Orang lain / tetangga';
  else if (/diri\s+sendiri|sendiri|aku|saya/.test(untuk)) untukFix = 'Diri sendiri';
  // Koreksi dari transkrip: "kakak aku pakai" = Anggota keluarga (bukan Diri sendiri)
  if (pakaiOrangLain) {
    if (/\b(kakak|adik|abang|sepupu|ortu|orang\s+tua)\b/.test(tr)) untukFix = 'Anggota keluarga';
    else if (/\b(temen|teman|kawan|sobat)\b/.test(tr)) untukFix = 'Teman';
    else if (/\b(tetangga|warga|pengedar|jaringan)\b/.test(tr)) untukFix = untukFix === 'Jaringan pengedar' ? 'Jaringan pengedar' : (untukFix === 'Jaringan pengedar' ? 'Jaringan pengedar' : 'Orang lain / tetangga');
  }

  // ===== kategori =====
  const katIn = String(d.kategori && Array.isArray(d.kategori) ? d.kategori.join(' ') : d.kategori || '').toLowerCase() + ' ' + tr;
  const kategori = [];
  const peta = [
    ['ganja', 'Ganja'], ['sabu', 'Metamfetamina (Sabu)'], ['metamfetamin', 'Metamfetamina (Sabu)'],
    ['ekstasi', 'Ekstasi'], ['heroin', 'Heroin / Putaw'], ['putaw', 'Heroin / Putaw'],
    ['obat resep', 'Obat resep disalahgunakan'], ['alkohol', 'Alkohol berlebihan'], ['miras', 'Alkohol berlebihan'],
    ['lem', 'Lem / pelarut menguap'], ['kamper', 'Lem / pelarut menguap'], ['inhalan', 'Lem / pelarut menguap'],
  ];
  for (const [kata, nilai] of peta) {
    if (katIn.includes(kata) && kategori.indexOf(nilai) === -1) kategori.push(nilai);
  }
  for (let i = kategori.length - 1; i >= 0; i--) {
    if (KATEGORI_VALID.indexOf(kategori[i]) === -1) kategori.splice(i, 1);
  }
  if (!kategori.length) kategori.push('Belum yakin');

  // ===== frekuensi =====
  let freq = String(d.frekuensi || '');
  const freqFix = FREKUENSI_VALID.find(function (f) { return f.toLowerCase() === freq.toLowerCase(); }) ||
                  FREKUENSI_VALID.find(function (f) { return freq.toLowerCase().indexOf(f.split(' ')[0].toLowerCase()) !== -1; }) ||
                  (/(tiap\s*hari|hampir\s*tiap|setiap\s*hari)/.test(tr) ? 'Hampir setiap hari' :
                   /(beberapa\s*kali)/.test(tr) ? 'Beberapa kali' :
                   /(sekali|coba)/.test(tr) ? 'Pernah sekali / coba-coba' : '');

  // ===== usia (dari transkrip: "16 tahun", "umur 16") =====
  let usia = Number(d.usia) || null;
  if (!usia) {
    const m = tr.match(/\b(1[0-9]|20)\s*(tahun|thn|yo)?\b/);
    if (m) usia = Number(m[1]);
  }
  if (usia && (usia < 1 || usia > 120)) usia = null;

  // ===== lokasi (kota: kata setelah "di ")heuristik sederhana =====
  let lokasi = String(d.lokasi || '') || null;
  if (!lokasi) {
    const mL = tr.match(/\b(?:di|kota)\s+([a-z][a-z\s]{2,30})/);
    if (mL) lokasi = mL[1].trim().replace(/\b(ya|kok|dong|sih)\b/g, '').trim();
  }

  // ===== cerita =====
  const cerita = String(d.cerita || '').replace(/\[DRAFT_FORM\][\s\S]*/g, '').trim().slice(0, 5000);

  return {
    untuk: untukFix,
    kategori: kategori.slice(0, 3),
    frekuensi: freqFix,
    usia: usia,
    lokasi: lokasi,
    cerita: cerita,
    darurat: !!d.darurat,
    sinyalKrisis: !!d.sinyalKrisis,
  };
}

async function aiHistorySesi(sesiId, limit = 12) {
  const rows = await db.prepare(
    'SELECT pengirim, isi_enc FROM ai_chat WHERE sesi_id=$1 ORDER BY dibuat DESC LIMIT ' + Number(limit)
  ).all(sesiId);
  rows.reverse();
  return rows.map(r => ({
    role: r.pengirim === 'user' ? 'user' : 'assistant',
    content: decryptAman(r.isi_enc, 'ai sesi'),
  }));
}

async function aiKuotaSesi(sesiId, perHari = 40) {
  const r = await db.prepare(
    "SELECT COUNT(*) c FROM ai_chat WHERE sesi_id=$1 AND pengirim='user' AND dibuat > $2"
  ).get(sesiId, Date.now() - 24 * 3600 * 1000);
  return { terpakai: Number(r.c || 0), perHari };
}

async function aiSimpanSesi(sesiId, pengirim, isi) {
  await db.prepare('INSERT INTO ai_chat (sesi_id, pengirim, isi_enc, dibuat) VALUES ($1,$2,$3,$4)')
    .run(sesiId, pengirim, encrypt(isi), Date.now());
}

// Mode tiket (kompatibilitas) — riwayat di tabel pesan.
async function aiHistoryTiket(tiket) {
  const rows = await db.prepare(
    "SELECT pengirim, isi_enc FROM pesan WHERE no_tiket=$1 AND pengirim IN ('ai_user','ai') ORDER BY dibuat DESC LIMIT 12"
  ).all(tiket);
  rows.reverse();
  return rows.map(r => ({
    role: r.pengirim === 'ai_user' ? 'user' : 'assistant',
    content: decryptAman(r.isi_enc, 'pesan AI'),
  }));
}

async function aiKuotaTiket(tiket, perHari = 30) {
  const r = await db.prepare(
    "SELECT COUNT(*) c FROM pesan WHERE no_tiket=$1 AND pengirim='ai_user' AND dibuat > $2"
  ).get(tiket, Date.now() - 24 * 3600 * 1000);
  return { terpakai: Number(r.c || 0), perHari };
}

async function aiSimpanTiket(tiket, pengirim, isi) {
  await db.prepare("INSERT INTO pesan (no_tiket, pengirim, isi_enc, dibuat) VALUES ($1,$2,$3,$4)")
    .run(tiket, pengirim, encrypt(isi), Date.now());
}

// Panggil model (multi-key failover: 401/402/403 = coba key berikutnya).
async function tanyaAI(messages) {
  const semuanya = GONKA_KEYS.length > 0 ? GONKA_KEYS : [config.AI_API_KEY];
  let lastErr = null;

  for (let attempt = 0; attempt < Math.min(semuanya.length, 5); attempt++) {
    const key = nextKey();
    // Attempt >= 2: fallback ke DeepSeek (jauh lebih cepat dari GLM reasoning)
    const modelPakai = attempt < 2 ? (process.env.GONKA_MODEL || AI_MODEL) : 'zai-org/GLM-5.3-Flash';
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), attempt >= 2 ? 60_000 : 120_000);
    try {
      const res = await fetch(AI_BASE.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify(modelPakai.includes('deepseek')
          ? { model: modelPakai, messages, max_tokens: 32000, temperature: 0.4, reasoning_effort: 'medium' }
          : { model: modelPakai, messages, max_tokens: 32000, temperature: 0.4, thinking: { type: 'enabled', budget_tokens: 512 } }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const teks = await res.text().catch(() => '');
        if ([401, 402, 403].includes(res.status)) { lastErr = new Error('key ditolak ' + res.status); continue; }
        throw new Error('AI gateway ' + res.status + ': ' + teks.slice(0, 200));
      }
      const j = await res.json();
      const isi = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!isi || !String(isi).trim()) throw new Error('AI respons kosong');
      return String(isi).trim();
    } catch (e) {
      if (e.name === 'AbortError') { lastErr = new Error('AI timeout 120s'); continue; }
      if (!lastErr) throw e;
      lastErr = e; break;
    } finally { clearTimeout(timeout); }
  }
  throw lastErr || new Error('AI tidak tersedia');
}

// Varian khusus tugas "keluarkan JSON panjang": token dikali besar (reasoning
// model memakan token untuk berpikir sebelum JSON lengkap tercetak).
async function tanyaAIJson(messages) {
  const semuanya = GONKA_KEYS.length > 0 ? GONKA_KEYS : [config.AI_API_KEY];
  let lastErr = null;
  for (let attempt = 0; attempt < Math.min(semuanya.length, 5); attempt++) {
    const key = nextKey();
    const modelPakai = attempt < 2 ? (process.env.GONKA_MODEL || AI_MODEL) : 'zai-org/GLM-5.3-Flash';
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), attempt >= 2 ? 60_000 : 120_000);
    try {
      const res = await fetch(AI_BASE.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify(modelPakai.includes('deepseek')
          ? { model: modelPakai, messages, max_tokens: 32000, temperature: 0.3, reasoning_effort: 'medium' }
          : { model: modelPakai, messages, max_tokens: 32000, temperature: 0.3, thinking: { type: 'enabled', budget_tokens: 512 } }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const teks = await res.text().catch(() => '');
        if ([401, 402, 403].includes(res.status)) { lastErr = new Error('key ditolak ' + res.status); continue; }
        throw new Error('AI gateway ' + res.status + ': ' + teks.slice(0, 200));
      }
      const j = await res.json();
      const isi = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (!isi || !String(isi).trim()) { lastErr = new Error('AI respons kosong'); continue; }
      return String(isi).trim();
    } catch (e) {
      if (e.name === 'AbortError') { lastErr = new Error('AI timeout 120s'); continue; }
      if (!lastErr) throw e;
      lastErr = e; break;
    } finally { clearTimeout(timeout); }
  }
  throw lastErr || new Error('AI tidak tersedia');
}


// Versi streaming dari tanyaAI: mengirim event fase riil ke client.
// res: Express response (SSE sudah diset oleh pemanggil).
// events: fungsi cb(fase) — 'berpikir' | 'menulis'
// return: teks lengkap balasan AI.
async function tanyaAIStream(messages, res, kirimEvent) {
  const semuanya = GONKA_KEYS.length > 0 ? GONKA_KEYS : [config.AI_API_KEY];
  let lastErr = null;

  for (let attempt = 0; attempt < Math.min(semuanya.length, 5); attempt++) {
    const key = nextKey();
    const modelPakai = attempt < 2 ? (process.env.GONKA_MODEL || AI_MODEL) : 'zai-org/GLM-5.3-Flash';
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), attempt < 2 ? 120_000 : 90_000);
    try {
      const res2 = await fetch(AI_BASE.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify(modelPakai.includes('deepseek')
          ? { model: modelPakai, messages, max_tokens: 32000, temperature: 0.4, reasoning_effort: 'low', stream: true }
          : { model: modelPakai, messages, max_tokens: 32000, temperature: 0.4, thinking: { type: 'enabled', budget_tokens: 512 }, stream: true }),
        signal: ac.signal,
      });
      if (!res2.ok) {
        const teks = await res2.text().catch(() => '');
        if ([401, 402, 403].includes(res2.status)) { lastErr = new Error('key ditolak ' + res2.status); continue; }
        throw new Error('AI gateway ' + res2.status + ': ' + teks.slice(0, 200));
      }

      // Parse SSE dari provider, teruskan fase ke client.
      const reader = res2.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let balasan = '';
      let faseSekarang = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6);
          if (d === '[DONE]') continue;
          try {
            const j = JSON.parse(d);
            const delta = j.choices && j.choices[0] && j.choices[0].delta || {};
            // DeepSeek: 'reasoning' + 'content'; GLM: 'reasoning_content' + 'content'
            const reasoning = delta.reasoning || delta.reasoning_content;
            const content = delta.content;
            if (reasoning && faseSekarang !== 'berpikir') {
              faseSekarang = 'berpikir';
              kirimEvent({ fase: 'berpikir' });
            }
            if (content) {
              if (faseSekarang !== 'menulis') {
                faseSekarang = 'menulis';
                kirimEvent({ fase: 'menulis' });
              }
              balasan += content;
              kirimEvent({ chunk: content });
            }
          } catch (e) { /* skip chunk rusak */ }
        }
      }
      if (!balasan.trim()) { lastErr = new Error('AI respons kosong'); continue; }
      return balasan.trim();
    } catch (e) {
      if (e.name === 'AbortError') { lastErr = new Error('AI timeout'); continue; }
      if (!lastErr) throw e;
      lastErr = e; break;
    } finally { clearTimeout(timeout); }
  }
  throw lastErr || new Error('AI tidak tersedia');
}

// Auth opsional: Bearer anon-token (mode tiket) kalau ada.
function verifikasiAnonOpsional(req, res, next) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try { req.tiketAnon = verifikasiJWT(h.slice(7)).tiket; } catch (e) { /* invalid = anon */ }
  }
  next();
}

// ============ routes ============

router.get('/status', (req, res) => {
  res.json({ aktif: AKTIF });
});

// POST /api/ai/sesi — buat sesi AI anonim baru (tanpa tiket, tanpa identitas).
router.post('/sesi', async (req, res) => {
  if (!AKTIF) return res.status(503).json({ error: 'fitur AI belum aktif' });
  const sesiId = crypto.randomBytes(32).toString('hex');
  res.status(201).json({ sesiId });
});

// GET /api/ai/riwayat?sesi=... — restore riwayat di browser.
router.get('/riwayat', verifikasiAnonOpsional, async (req, res) => {
  if (!AKTIF) return res.status(503).json({ error: 'fitur AI belum aktif' });
  try {
    if (req.tiketAnon) {
      return res.json({ riwayat: await aiHistoryTiket(req.tiketAnon) });
    }
    const sesi = String(req.query.sesi || '');
    if (!sesiValid(sesi)) return res.status(400).json({ error: 'sesi tidak valid' });
    res.json({ riwayat: await aiHistorySesi(sesi) });
  } catch (e) {
    console.error('[ai/riwayat]', e.message);
    res.status(500).json({ error: 'server error' });
  }
});

// DELETE /api/ai/sesi/:sesiId — user minta obrolan baru: hapus riwayat server
// supaya sesi lama benar-benar hilang (privasi: komputer bersama/pinjam).
router.delete('/sesi/:sesiId', async (req, res) => {
  if (!AKTIF) return res.status(503).json({ error: 'fitur AI belum aktif' });
  const sesi = String(req.params.sesiId || '');
  if (!sesiValid(sesi)) return res.status(400).json({ error: 'sesi tidak valid' });
  try {
    await db.prepare('DELETE FROM ai_chat WHERE sesi_id=$1').run(sesi);
    res.json({ ok: true });
  } catch (e) {
    console.error('[ai/sesi delete]', e.message);
    res.status(500).json({ error: 'server error' });
  }
});

// POST /api/ai/chat
// Body: { sesi?: hex64, isi: string(maks 2000), mode?: 'ngobrol'|'laporan' }
// Tanpa Bearer = wajib sesi. Dengan Bearer anon-token = mode tiket.
// Sweeper: hapus sesi AI lebih tua dari 7 hari (privacy: tidak simpan selamanya).
let sweepTerakhir = 0;  // sesi AI > 24 jam dibuang (privasi)
async function sweepSesiLama() {
  const now = Date.now();
  if (now - sweepTerakhir < 3600_000) return;  // maks 1x/jam
  sweepTerakhir = now;
  try { await db.prepare('DELETE FROM ai_chat WHERE dibuat < $1').run(now - 24 * 3600 * 1000); }
  catch (e) { /* abaikan */ }
}

router.post('/chat', verifikasiAnonOpsional, async (req, res) => {
  if (!AKTIF) return res.status(503).json({ error: 'fitur AI belum aktif' });
  sweepSesiLama();

  const isi = String((req.body && req.body.isi) || '').trim();
  const mode = String((req.body && req.body.mode) || '') === 'laporan' ? 'laporan' : 'ngobrol';
  const sesi = String((req.body && req.body.sesi) || '');
  const tiket = req.tiketAnon || null;

  if (!isi) return res.status(400).json({ error: 'isi wajib diisi' });
  if (isi.length > 2000) return res.status(400).json({ error: 'pesan maksimal 2000 karakter' });
  if (!tiket && !sesiValid(sesi)) return res.status(400).json({ error: 'sesi tidak valid' });

  try {
    let messages;

    if (tiket) {
      // ---- mode tiket (kompatibilitas) ----
      const kuota = await aiKuotaTiket(tiket);
      if (kuota.terpakai >= kuota.perHari) {
        return res.status(429).json({ error: `jatah obrolan AI hari ini habis (${kuota.perHari}). Coba besok lagi.` });
      }
      const riwayat = await aiHistoryTiket(tiket);
      const systemMsg = { role: 'system', content: SYSTEM_PROMPT };
      messages = [systemMsg, ...riwayat];
      const p = await db.prepare('SELECT untuk, kategori, status, darurat, cerita_enc FROM pengaduan WHERE no_tiket=$1').get(tiket);
      if (p) {
        const cerita = decryptAman(p.cerita_enc, 'tiket ' + tiket);
        systemMsg.content += `\n\nKONTEKS TIKET (jangan sebut nomor tiket): untuk=${p.untuk}, kategori=${p.kategori}, status=${p.status}${p.darurat ? ', DARURAT' : ''}${cerita ? ', cerita awal pelapor: "' + cerita.slice(0, 800) + '"' : ''}`;
      }
      messages.push({ role: 'user', content: mode === 'laporan' ? PROMPT_LAPORAN : isi });
      let balasan = await tanyaAI(messages);
      let draftForm = null;
      const mDraft = balasan.match(/\[DRAFT_FORM\](\{[\s\S]*?\})(?:\n|$)/);
      if (mDraft) {
        try { draftForm = sanitasiDraft(JSON.parse(mDraft[1]), transkrip || ''); } catch (e) {}
        balasan = balasan.replace(/\[DRAFT_FORM\][\s\S]*$/, '').trim();
      }
      await aiSimpanTiket(tiket, 'ai_user', isi);
      await aiSimpanTiket(tiket, 'ai', balasan);
      return res.json(draftForm ? { balasan, draftForm } : { balasan });
    }

    // ---- mode sesi mandiri (utama) ----
    const kuota = await aiKuotaSesi(sesi);
    if (kuota.terpakai >= kuota.perHari) {
      return res.status(429).json({ error: `jatah obrolan AI sesi ini habis (${kuota.perHari}/hari). Coba besok lagi.` });
    }

    const riwayat = await aiHistorySesi(sesi);
    messages = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\nCATATAN: Pengguna BELUM membuat laporan formal. Biarkan mereka nyaman dulu; ajakan lembut ke konselor manusia cukup sekali saat percakapan mengalir, bukan tiap balasan.' },
      ...riwayat,
      { role: 'user', content: mode === 'laporan' ? PROMPT_LAPORAN : isi },
    ];

    let balasan = await tanyaAI(messages);
    let draftForm = null;
    const mDraft = balasan.match(/\[DRAFT_FORM\](\{[\s\S]*?\})(?:\n|$)/);
    if (mDraft) {
      try { draftForm = sanitasiDraft(JSON.parse(mDraft[1]), transkrip || ''); } catch (e) { /* tag rusak = abaikan */ }
      balasan = balasan.replace(/\[DRAFT_FORM\][\s\S]*$/, '').trim();
    }
    await aiSimpanSesi(sesi, 'user', isi);
    await aiSimpanSesi(sesi, 'ai', balasan);
    res.json(draftForm ? { balasan, draftForm } : { balasan });
  } catch (e) {
    console.error('[ai/chat]', e.message);
    res.status(502).json({ error: 'AI sedang tidak bisa dihubungi. Coba lagi sebentar.' });
  }
});

// POST /api/ai/siapkan-laporan
// Body: { sesi } — AI merangkum seluruh percakapan sesi menjadi draft laporan
// yang mengisi form pengaduan: { untuk, kategori[], cerita, frekuensi, butuhTiket }
// TIDAK mengirim apa pun ke pengaduan — hanya draft untuk di-review user.
router.post('/siapkan-laporan', async (req, res) => {
  if (!AKTIF) return res.status(503).json({ error: 'fitur AI belum aktif' });
  const sesi = String((req.body && req.body.sesi) || '');
  if (!sesiValid(sesi)) return res.status(400).json({ error: 'sesi tidak valid' });

  try {
    const riwayat = await aiHistorySesi(sesi, 40);
    if (riwayat.filter(m => m.role === 'user').length < 1) {
      return res.status(400).json({ error: 'belum ada percakapan untuk dirangkum' });
    }

    const transkrip = riwayat.map(m => (m.role === 'user' ? 'PENGguna: ' : 'SAHABAT AI: ') + m.content).join('\n').slice(0, 6000);
    const promptRingkas = `Kamu menerima transkrip percakapan antara pengguna anonim dan Sahabat AI di layanan konseling narkotika Ruang Pulih.
Tugas: susun DRAFT laporan pengaduan dari sudut pandang pengguna (orang pertama "saya"), jujur, kronologis, tanpa mengarang fakta baru.

SEBELUM memilih, pikirkan dulu secara internal:
 • "Laporan ini untuk siapa?" — Lihat SIAPA yang memakai zat, bukan siapa pelapor.
    - "temenku/bilal/dia memakai" → Tentu bukan Diri sendiri (pelapor menceritakan orang lain).
    - "kakak/adik/sepupuku memakai" → Anggota keluarga. "kakak aku pakai ekstasi" → Anggota keluarga, MESKIPUN ada kata "aku" di kalimat (itu menunjuk pemilik, bukan pemakai).
    - HANYA "aku/saya memakai" → Diri sendiri.
 • "Seberapa sering?" — Petakan kata pengguna: 'hampir tiap hari/tiap hari/setiap hari' → 'Hampir setiap hari'; 'sering/mingguan' → 'Sering (mingguan)'; 'beberapa kali/2-3x' → 'Beberapa kali'; 'sekali/coba-coba' → 'Pernah sekali / coba-coba'; tidak jelas → 'Tidak tahu / orang lain'.
 • "Jenis zat apa?" — Petakan: sabu → 'Metamfetamina (Sabu)'; ganja → 'Ganja'; lem/kamper/inhalan → 'Lem / pelarut menguap'; alkohol/miras → 'Alkohol berlebihan'; ekstasi → 'Ekstasi'; heroin/putaw → 'Heroin / Putaw'; obat resep → 'Obat resep disalahgunakan'. Tidak disebut → ['Belum yakin'].
 • "Usia & kota?" — HANYA jika angka/nama kota secara eksplisit di transkrip. Jangan tebak.

Balas HANYA JSON valid (tanpa markdown, tanpa penjelasan):
{"butuhTiket": true|false,
 "butuhTiketAlasan": "1 kalimat alasan kenapa perlu/tidak perlu laporan",
 "untuk": "Diri sendiri"|"Teman"|"Anggota keluarga"|"Orang lain / tetangga"|"Jaringan pengedar",
 "kategori": ["maksimal 3 dari: Ganja","Metamfetamina (Sabu)","Ekstasi","Heroin / Putaw","Obat resep disalahgunakan","Alkohol berlebihan","Lem / pelarut menguap","Belum yakin"],
 "frekuensi": ""|"Pernah sekali / coba-coba"|"Beberapa kali"|"Sering (mingguan)"|"Hampir setiap hari"|"Tidak tahu / orang lain",
 "usia": angka atau null,
 "lokasi": "nama kota/wilayah bila disebut, atau null",
 "cerita": "3-6 kalimat orang pertama, kronologis, fakta dari percakapan saja",
 "darurat": true|false,
 "sinyalKrisis": true|false}

Aturan:
- butuhTiket=false bila percakapan masih umum/edukasi tanpa kejadian nyata yang melibatkan narkoba.
- sinyalKrisis=true bila adaindikasi bunuh diri/melukai diri/overdose — WAJIB disertai butuhTiket=true.
- Jika tidak yakin jenis narkoba: kategori ["Belum yakin"].
- cerita WAJIB merangkum dengan kata-kata pengguna sendiri, jangan menghakimi.
- ATURAN ANTI-HALUSINASI KERAS: HANYA gunakan fakta yang pengguna sebut eksplisit.
  • Usia, kota, nama, sekolah, jenis zat — jika TIDAK disebut pengguna, isi null / ['Belum yakin'], JANGAN menebak.
  • Contoh SALAH: pengguna bilang 'dia' tanpa usia → menulis usia 16. Contoh BENAR: usia null.
  • Jangan menambah detail deskriptif apa pun yang di luar transkrip.

PERHATIAN EDIT: Jika pengguna sebelumnya sudah meminta draft, transkrip akan mengandung draft lama.
Terapkan PERUBAHAN yang diminta ke draft LAMA — pertahankan fakta lama yang masih benar, ubah hanya yang diminta.

TRANSKRIP:
${transkrip}`;

    const draftMentah = await tanyaAIJson([
      { role: 'user', content: promptRingkas },
    ]);
    // Pre-seed berarti responsnya lanjutan — rekonstruksi JSON lengkap
    const draftMentahFix = draftMentah.startsWith('{') ? draftMentah : '{' + draftMentah;
    // Parse JSON dari balasan (buang markdown fence kalau ada)
    const bersih = draftMentahFix.replace(/```json|```/g, '').trim();
    const awal = bersih.indexOf('{');
    const akhir = bersih.lastIndexOf('}');
    if (awal === -1 || akhir === -1) throw new Error('AI tidak mengembalikan JSON');
    const draft = sanitasiDraft(JSON.parse(bersih.slice(awal, akhir + 1)), transkrip);

    res.json({
      butuhTiket: true,  // endpoint ini memang untuk menyiapkan laporan
      butuhTiketAlasan: String(draft.butuhTiketAlasan || '').slice(0, 300),
      untuk: draft.untuk || 'Diri sendiri',
      kategori: draft.kategori,
      frekuensi: draft.frekuensi || '',
      usia: draft.usia,
      lokasi: draft.lokasi || '',
      cerita: String(draft.cerita || '').slice(0, 5000),
      darurat: !!draft.darurat,
      sinyalKrisis: !!draft.sinyalKrisis,
    });
  } catch (e) {
    console.error('[ai/siapkan-laporan]', e.message);
    res.status(502).json({ error: 'Gagal menyiapkan draft laporan. Coba lagi sebentar.' });
  }
});


// POST /api/ai/chat/stream — versi SSE dari /chat (mode sesi utama).
// Event: {fase:'berpikir'|'menulis'} lalu {chunk:'...'} berulang, akhir {done:true, draftForm?}
router.post('/chat/stream', verifikasiAnonOpsional, async (req, res) => {
  if (!AKTIF) return res.status(503).json({ error: 'fitur AI belum aktif' });

  const isi = String((req.body && req.body.isi) || '').trim();
  const sesi = String((req.body && req.body.sesi) || '');
  const mode = String((req.body && req.body.mode) || '') === 'laporan' ? 'laporan' : 'ngobrol';
  const tiket = req.tiketAnon || null;

  if (!isi) return res.status(400).json({ error: 'isi wajib diisi' });
  if (isi.length > 2000) return res.status(400).json({ error: 'pesan maksimal 2000 karakter' });
  if (!tiket && !sesiValid(sesi)) return res.status(400).json({ error: 'sesi tidak valid' });

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const kirim = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) {} };

  try {
    let messages;
    if (tiket) {
      const kuota = await aiKuotaTiket(tiket);
      if (kuota.terpakai >= kuota.perHari) {
        kirim({ error: 'jatah obrolan AI hari ini habis' });
        return res.end();
      }
      const riwayat = await aiHistoryTiket(tiket);
      const systemMsg = { role: 'system', content: SYSTEM_PROMPT };
      messages = [systemMsg, ...riwayat];
      const p = await db.prepare('SELECT untuk, kategori, status, darurat, cerita_enc FROM pengaduan WHERE no_tiket=$1').get(tiket);
      if (p) {
        const cerita = decryptAman(p.cerita_enc, 'tiket ' + tiket);
        systemMsg.content += `\n\nKONTEKS TIKET: untuk=${p.untuk}, kategori=${p.kategori}, status=${p.status}${cerita ? ', cerita: "' + cerita.slice(0, 600) + '"' : ''}`;
      }
      messages.push({ role: 'user', content: mode === 'laporan' ? PROMPT_LAPORAN : isi });
    } else {
      const kuota = await aiKuotaSesi(sesi);
      if (kuota.terpakai >= kuota.perHari) {
        kirim({ error: 'jatah obrolan AI sesi ini habis (' + kuota.perHari + '/hari)' });
        return res.end();
      }
      const riwayat = await aiHistorySesi(sesi);
      messages = [
        { role: 'system', content: SYSTEM_PROMPT + '\n\nCATATAN: Pengguna BELUM membuat laporan formal. Ajakan lembut ke konselor cukup sekali saat mengalir.' },
        ...riwayat,
        { role: 'user', content: mode === 'laporan' ? PROMPT_LAPORAN : isi },
      ];
    }

    // Streaming: fase + chunk real-time
    let balasan = await tanyaAIStream(messages, res, (ev) => kirim(ev));

    // Deteksi tag DRAFT_FORM di balasan lengkap
    let draftForm = null;
    const mDraft = balasan.match(/\[DRAFT_FORM\](\{[\s\S]*?\})(?:\n|$)/);
    if (mDraft) {
      try { draftForm = sanitasiDraft(JSON.parse(mDraft[1]), transkrip || ''); } catch (e) {}
      balasan = balasan.replace(/\[DRAFT_FORM\][\s\S]*$/, '').trim();
    }

    // Simpan riwayat
    if (tiket) {
      await aiSimpanTiket(tiket, 'ai_user', isi);
      await aiSimpanTiket(tiket, 'ai', balasan);
    } else {
      await aiSimpanSesi(sesi, 'user', isi);
      await aiSimpanSesi(sesi, 'ai', balasan);
    }

    kirim({ done: true, balasan, draftForm });
    res.end();
  } catch (e) {
    console.error('[ai/chat/stream]', e.message);
    kirim({ error: 'AI sedang tidak bisa dihubungi. Coba lagi sebentar.' });
    res.end();
  }
});

module.exports = router;
