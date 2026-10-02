// Seed akun admin pertama — JANGAN commit (ada di .gitignore), sandi harus langsung diganti.
const db = require('./src/db');
const { hashSandi } = require('./src/security');

(async () => {
  const rows = db.prepare('SELECT count(*) c FROM konselor').get();
  if (rows.c > 0) return console.log('sudah ada konselor, skip');
  db.prepare('INSERT INTO konselor (username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?)')
    .run('admin', 'Admin Utama', await hashSandi('ganti-saya-123'), 'admin', 1, 0, Date.now());
  console.log('seed selesai. login: admin / ganti-saya-123  <-- GANTI SEGERA');
})();
