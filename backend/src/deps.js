// Middleware otorisasi: cek sesi JWT dari cookie HttpOnly.
const { verifikasiJWT } = require('./security');
const db = require('./db');

function ambilSesi(req) {
  const t = req.cookies && req.cookies.session;
  if (!t) return null;
  try { return verifikasiJWT(t); } catch { return null; }
}

async function butuhKonselor(req, res, next) {
  const s = ambilSesi(req);
  if (!s || (s.peran !== 'konselor' && s.peran !== 'admin')) return res.status(401).json({ error: 'belum login' });
  const row = await db.prepare('SELECT id,username,nama,peran,aktif FROM konselor WHERE id=$1').get(s.id);
  if (!row || !row.aktif) return res.status(401).json({ error: 'akun nonaktif' });
  req.konselor = row;
  next();
}

function butuhAdmin(req, res, next) {
  if (!req.konselor || req.konselor.peran !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}
module.exports = { ambilSesi, butuhKonselor, butuhAdmin };
