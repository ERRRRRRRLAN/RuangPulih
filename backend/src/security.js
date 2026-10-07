// Enkripsi field sensitif (AES-256-GCM) + hashing sandi (bcryptjs) + sesi (JWT).
// bcryptjs = pure JS (kompatibel serverless Vercel); bcrypt native binary tidak bisa.
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');

const ALGO = 'aes-256-gcm';

/** Enkripsi teks → base64 "iv:tag:ciphertext" (field DB selalu string). */
function encrypt(plain) {
  if (plain === undefined || plain === null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALGO, config.DATA_KEY, iv);
  const tag = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  const gcmTag = c.getAuthTag();
  return [iv, gcmTag, tag].map(b => b.toString('base64')).join(':');
}

/** Dekripsi; lempar Error jika tag tidak cocok (data pernah diubah / kunci salah). */
function decrypt(blob) {
  if (!blob) return null;
  const [ivB, tagB, dataB] = blob.split(':');
  const d = crypto.createDecipheriv(ALGO, config.DATA_KEY, Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dataB, 'base64')), d.final()]).toString('utf8');
}

/**
 * Dekripsi yang tidak pernah melempar — untuk membangun response API.
 * Satu data lama yang tak terbaca (key diganti / korup) tidak boleh
 * menjatuhkan seluruh endpoint (500). Kembalikan placeholder + log.
 */
function decryptAman(blob, label = 'data') {
  if (!blob) return null;
  try { return decrypt(blob); }
  catch (e) {
    console.error(`[decrypt] gagal membuka ${label}:`, e.message);
    return '[data tidak dapat dibaca]';
  }
}

const hashSandi = p => bcrypt.hash(p, 12);
const cekSandi = (p, h) => bcrypt.compare(p, h);
const buatJWT = (payload, ttl) => jwt.sign(payload, config.JWT_SECRET, { expiresIn: ttl || config.JWT_TTL });
const verifikasiJWT = (t) => jwt.verify(t, config.JWT_SECRET);

module.exports = { encrypt, decrypt, decryptAman, hashSandi, cekSandi, buatJWT, verifikasiJWT };
