// Membaca .env dan memvalidasi secret. Fail-closed: server harus mati jika secret hilang.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

function need(k) {
  const v = process.env[k];
  if (!v || !v.trim()) throw new Error(`env ${k} wajib diisi (lihat backend/.env.example)`);
  return v.trim();
}

const config = {
  DATA_KEY: Buffer.from(need('DATA_KEY_HEX'), 'hex'), // 32 bytes AES-256
  JWT_SECRET: need('JWT_SECRET'),
  JWT_TTL: process.env.JWT_TTL || '8h',
  PORT: process.env.PORT || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
};

if (config.DATA_KEY.length !== 32) throw new Error('DATA_KEY_HEX harus 32 byte (64 hex chars)');

module.exports = config;
