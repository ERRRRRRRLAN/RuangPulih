// Skema database SQLite (single-file, WAL mode, foreign keys ON).
const Database = require('better-sqlite3');
const config = require('./config');

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS konselor (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  nama TEXT NOT NULL,
  sandi_hash TEXT NOT NULL,
  peran TEXT NOT NULL DEFAULT 'konselor',  -- 'konselor' | 'admin'
  aktif INTEGER NOT NULL DEFAULT 1,
  gagal INTEGER NOT NULL DEFAULT 0,
  terkunci_sampai INTEGER,                  -- epoch ms, NULL = tidak terkunci
  dibuat INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pengaduan (
  id INTEGER PRIMARY KEY,
  no_tiket TEXT UNIQUE NOT NULL,            -- PN-YYYYMMDD-XXXX
  untuk TEXT NOT NULL,                      -- 'Diri sendiri' | 'Orang lain'
  kategori TEXT NOT NULL,
  frekuensi TEXT,
  usia INTEGER,
  cerita_enc TEXT NOT NULL,                 -- AES-GCM
  kontak_enc TEXT,                          -- AES-GCM, boleh NULL (minimisasi data)
  status TEXT NOT NULL DEFAULT 'Diterima',  -- Diterima->Ditinjau->Dalam Penanganan->Selesai
  dibaca INTEGER NOT NULL DEFAULT 0,        -- 0 = belum dibaca konselor
  ditangani_oleh INTEGER REFERENCES konselor(id),
  dibuat INTEGER NOT NULL,
  diperbarui INTEGER
);
CREATE TABLE IF NOT EXISTS pesan (
  id INTEGER PRIMARY KEY,
  no_tiket TEXT NOT NULL REFERENCES pengaduan(no_tiket),
  pengirim TEXT NOT NULL,                   -- 'user' | 'konselor'
  pengirim_id INTEGER REFERENCES konselor(id),
  isi_enc TEXT NOT NULL,                    -- AES-GCM
  dibuat INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS layanan (
  id INTEGER PRIMARY KEY,
  jenis TEXT NOT NULL,                      -- Konseling | Pendampingan | Rehabilitasi | Darurat
  nama TEXT NOT NULL,
  deskripsi TEXT, persyaratan TEXT, jam TEXT,
  kontak TEXT, lokasi TEXT, prosedur TEXT,
  urutan INTEGER NOT NULL DEFAULT 0,
  aktif INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  aktor TEXT,                               -- username konselor atau 'user:<tiket>'
  aksi TEXT NOT NULL,                       -- LOGIN | BACA_PENGADUAN | UBAH_STATUS | ...
  detail TEXT, ip TEXT,
  waktu INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pengaduan_status ON pengaduan(status);
CREATE INDEX IF NOT EXISTS idx_pesan_tiket ON pesan(no_tiket, dibuat);
`);
module.exports = db;
