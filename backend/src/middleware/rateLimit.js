// Rate limiter — serverless-safe.
//
// PENJELASAN: middleware ini dulu memakai in-memory Map. Vercel serverless
// menjalankan setiap request pada instance yang bisa berbeda — Map baru selalu
// kosong, jadi pembatasan brute-force login 5/menit hanya ilusi di produksi.
//
// Sekarang hit disimpan di Postgres (tabel rate_limit_hit), yang berbagi state
// antar instance. In-memory tetap dipakai sebagai cache singkat + fallback
// kalau DB tidak terjangkau (fail-open untuk ketersediaan, bukan fail-closed:
// rate limiting bukan pertahanan terakhir kita — login juga punya lockout + bcrypt).
//
// Query dijalankan async; middleware menunggu hasil sebelum next().

let dbCache = null;
function getDb() {
  if (!dbCache) {
    try { dbCache = require('../dbpg'); } catch (e) { dbCache = false; }
  }
  return dbCache || null;
}

// Sweeper hapus hit kedaluwarsa — jangan tiap request (beban DB).
let sweepTerakhir = 0;
async function bersihkan(db, windowMs) {
  const now = Date.now();
  if (now - sweepTerakhir < 60000) return;   // paling sering 1x/menit
  sweepTerakhir = now;
  try {
    await db.prepare('DELETE FROM rate_limit_hit WHERE ts < $1').run(now - windowMs);
  } catch (e) { /* abaikan — bukan fatal */ }
}

module.exports = function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  // Cache in-memory per-window (fallback + kurangi beban DB)
  const hits = new Map();

  return async (req, res, next) => {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'x';
    const now = Date.now();

    // 1. Cek cache lokal dulu (cepat, tanpa round-trip DB)
    const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
    }

    // 2. Cek Postgres (sumber kebenaran lintas instance serverless)
    const db = getDb();
    if (db) {
      try {
        await bersihkan(db, windowMs);
        const r = await db.prepare(
          'SELECT COUNT(*) AS c FROM rate_limit_hit WHERE ip = $1 AND ts > $2'
        ).get(ip, now - windowMs);
        const jumlah = Number((r && r.c) || 0);
        if (jumlah >= max) {
          hits.set(ip, arr.concat(now));   // cache juga penolakan
          return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
        }
        await db.prepare('INSERT INTO rate_limit_hit (ip, ts) VALUES ($1, $2)').run(ip, now);
      } catch (e) {
        // DB gagal → andalkan cache in-memory saja (jangan jatuhkan request)
      }
    }

    arr.push(now);
    hits.set(ip, arr);
    next();
  };
};
