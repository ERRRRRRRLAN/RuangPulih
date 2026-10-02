// Pencatatan aktivitas untuk auditabilitas (PDF 3.8).
const db = require('./db');
const now = () => Date.now();

function catat(aktor, aksi, detail = null, ip = null) {
  db.prepare('INSERT INTO audit_log (aktor, aksi, detail, ip, waktu) VALUES (?,?,?,?,?)')
    .run(aktor, aksi, detail, ip, now());
}
module.exports = { catat };
