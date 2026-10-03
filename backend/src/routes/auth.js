// Auth konselor: login (bcrypt + JWT cookie HttpOnly + lockout), logout, /me.
const express = require('express');
const router = express.Router();
const db = require('../db');
const { buatJWT, cekSandi } = require('../security');
const { butuhKonselor } = require('../deps');
const audit = require('../audit');

const MAKS_GAGAL = 5, KUNCI_MS = 15 * 60 * 1000;

router.post('/login', async (req, res) => {
  const { username, sandi } = req.body || {};
  const ip = req.ip;
  const k = await db.prepare('SELECT * FROM konselor WHERE username=$1').get(String(username || ''));

  // Brute-force lockout: terkunci_sampai sudah di-SET pada percobaan ke-(MAKS) yang gagal.
  // Tampilan di sini berarti ini percobaan ke-MAKS+1 — tolak tanpa menghitung.
  if (k && k.terkunci_sampai && k.terkunci_sampai > Date.now()) {
    audit.catat(k.username, 'LOGIN_DIKUNCI', null, ip);
    return res.status(429).json({ error: 'terlalu banyak percobaan, coba lagi nanti' });
  }

  const cocok = !!(k && await cekSandi(String(sandi || ''), k.sandi_hash));
  if (!cocok) {
    if (k) {
      const gagal = k.gagal + 1;
      const terkunci = gagal >= MAKS_GAGAL;
      await db.prepare('UPDATE konselor SET gagal=$1, terkunci_sampai=$2 WHERE id=$3')
        .run(gagal, terkunci ? Date.now() + KUNCI_MS : null, k.id);
      if (terkunci) {
        audit.catat(k.username, 'LOGIN_DIKUNCI', 'terkunci setelah ' + gagal + ' gagal', ip);
        return res.status(429).json({ error: 'terlalu banyak percobaan, coba lagi nanti' });
      }
      audit.catat(k.username, 'LOGIN_GAGAL', `gagal ke-${gagal}`, ip);
    } else audit.catat('unknown:' + String(username || ''), 'LOGIN_GAGAL', 'username tak dikenal', ip);
    return res.status(401).json({ error: 'username atau sandi salah' });
  }

  await db.prepare('UPDATE konselor SET gagal=0, terkunci_sampai=NULL WHERE id=$1').run(k.id);
  audit.catat(k.username, 'LOGIN', null, ip);
  const token = buatJWT({ id: k.id, peran: k.peran });
  res.cookie('session', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({ id: k.id, username: k.username, nama: k.nama, peran: k.peran });
});

router.post('/logout', butuhKonselor, (req, res) => {
  audit.catat(req.konselor.username, 'LOGOUT', null, req.ip);
  res.clearCookie('session');
  res.json({ ok: true });
});

router.get('/me', butuhKonselor, (req, res) => res.json(req.konselor));
module.exports = router;
