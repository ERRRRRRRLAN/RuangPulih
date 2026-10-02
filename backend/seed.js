// Seed akun admin pertama — JANGAN commit (ada di .gitignore), sandi harus langsung diganti.
const db = require('./src/db');
const { hashSandi } = require('./src/security');

(async () => {
  // jamin admin utama selalu ada & aktif (test hapus rows; INSERT OR IGNORE + reset state aman)
  db.prepare('INSERT OR IGNORE INTO konselor (username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?)').run('admin', 'Admin Utama', await hashSandi('ganti-saya-123'), 'admin', 1, 0, Date.now());
  db.prepare("UPDATE konselor SET aktif=1, gagal=0, terkunci_sampai=NULL WHERE username='admin'").run();
  console.log('seed selesai. login: admin / ganti-saya-123  <-- GANTI SEGERA');
})();
