// Membaca .env dan memvalidasi secret. Fail-closed: server harus mati jika secret hilang.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// Key gonkarouter untuk AI (diekstrak dari 9router, tidak masuk git — cek .gitignore)
require('dotenv').config({ path: require('path').join(__dirname, '..', 'gonka-keys.env') });

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
  TELEGRAM_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '', // '' = fitur TG nonaktif
  TELEGRAM_BOTNAME: process.env.TELEGRAM_BOTNAME || 'RuangPulihBot',
  // AI konseling (opsional): kalau kosong, fitur chat AI nonaktif (UI disembunyikan).
  AI_BASE_URL: process.env.AI_BASE_URL || '',
  AI_API_KEY: process.env.AI_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || '',
  AI_MAX_TOKENS: parseInt(process.env.AI_MAX_TOKENS || '1200', 10),
};

if (config.DATA_KEY.length !== 32) throw new Error('DATA_KEY_HEX harus 32 byte (64 hex chars)');

module.exports = config;
