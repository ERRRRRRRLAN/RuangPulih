// Pencatatan aktivitas untuk auditabilitas (PDF 3.8).
const db = require('./db');

async function catat(aktor, aksi, detail = null, ip = null) {
  await db.prepare('INSERT INTO audit_log (aktor, aksi, detail, ip, waktu) VALUES ($1,$2,$3,$4,$5)')
    .run(aktor, aksi, detail, ip, Date.now());
}
module.exports = { catat };
