// Seed akun admin pertama — JANGAN commit (ada di .gitignore), sandi harus langsung diganti.
const db = require('./src/db');
const { hashSandi } = require('./src/security');

(async () => {
  try {
    await db.prepare(`INSERT INTO konselor (username,nama,sandi_hash,peran,aktif,gagal,dibuat)
              VALUES ($1,$2,$3,$4,$5,$6,$7)
              ON CONFLICT(username) DO UPDATE SET
                sandi_hash=excluded.sandi_hash, aktif=1, gagal=0, terkunci_sampai=NULL`)
      .run('admin', 'Admin Utama', await hashSandi('ganti-saya-123'), 'admin', 1, 0, Date.now());
    console.log('seed selesai. login: admin / ganti-saya-123  <-- GANTI SEGERA');
  } catch (e) {
    console.error('seed gagal:', e.message);
    process.exit(1);
  }
})();
