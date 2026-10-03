-- Skema database Ruang Pulih untuk PostgreSQL (Supabase)
-- Porting langsung dari skema SQLite di backend/src/db.js.
-- Catatan: SQLite INTEGER dipetakan ke BIGINT (kolom "dibuat" menyimpan epoch ms,
-- bisa melebihi rentang INTEGER 32-bit di tahun 2038+).

CREATE TABLE IF NOT EXISTS konselor (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  nama TEXT NOT NULL,
  sandi_hash TEXT NOT NULL,
  peran TEXT NOT NULL DEFAULT 'konselor',
  aktif SMALLINT NOT NULL DEFAULT 1,
  gagal SMALLINT NOT NULL DEFAULT 0,
  terkunci_sampai BIGINT,
  dibuat BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS pengaduan (
  id BIGSERIAL PRIMARY KEY,
  no_tiket TEXT UNIQUE NOT NULL,
  untuk TEXT NOT NULL,
  kategori TEXT NOT NULL,
  frekuensi TEXT,
  usia SMALLINT,
  cerita_enc TEXT NOT NULL,
  kontak_enc TEXT,
  status TEXT NOT NULL DEFAULT 'Diterima',
  darurat SMALLINT NOT NULL DEFAULT 0,
  lokasi TEXT,
  dibaca SMALLINT NOT NULL DEFAULT 0,
  ditangani_oleh BIGINT REFERENCES konselor(id),
  dibuat BIGINT NOT NULL,
  diperbarui BIGINT
);

CREATE TABLE IF NOT EXISTS pesan (
  id BIGSERIAL PRIMARY KEY,
  no_tiket TEXT NOT NULL,
  pengirim TEXT NOT NULL,
  pengirim_id BIGINT REFERENCES konselor(id),
  isi_enc TEXT NOT NULL,
  dibuat BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS layanan (
  id BIGSERIAL PRIMARY KEY,
  jenis TEXT NOT NULL,
  nama TEXT NOT NULL,
  deskripsi TEXT, persyaratan TEXT, jam TEXT,
  kontak TEXT, lokasi TEXT, prosedur TEXT,
  urutan SMALLINT NOT NULL DEFAULT 0,
  aktif SMALLINT NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS minat_program (
  id BIGSERIAL PRIMARY KEY,
  kode_lacak TEXT UNIQUE NOT NULL,
  program TEXT NOT NULL,
  panggilan TEXT,
  usia SMALLINT,
  kontak_enc TEXT,
  catatan_enc TEXT,
  status TEXT NOT NULL DEFAULT 'Baru',
  prioritas TEXT NOT NULL DEFAULT 'Normal',
  ditangani_oleh BIGINT REFERENCES konselor(id),
  dibuat BIGINT NOT NULL,
  diperbarui BIGINT
);

CREATE TABLE IF NOT EXISTS rujukan (
  id BIGSERIAL PRIMARY KEY,
  kode_rujukan TEXT UNIQUE NOT NULL,
  sumber_tiket TEXT NOT NULL,
  tujuan TEXT NOT NULL,
  instansi TEXT,
  alasan_enc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Dikirim',
  dibuat_oleh BIGINT REFERENCES konselor(id),
  dibuat BIGINT NOT NULL,
  diperbarui BIGINT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  aktor TEXT,
  aksi TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  waktu BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_minat_status ON minat_program(status, dibuat DESC);
CREATE INDEX IF NOT EXISTS idx_minat_kode ON minat_program(kode_lacak);
CREATE INDEX IF NOT EXISTS idx_rujukan_status ON rujukan(status, dibuat DESC);
CREATE INDEX IF NOT EXISTS idx_rujukan_kode ON rujukan(kode_rujukan);
CREATE INDEX IF NOT EXISTS idx_rujukan_sumber ON rujukan(sumber_tiket);
CREATE INDEX IF NOT EXISTS idx_pengaduan_status ON pengaduan(status);
CREATE INDEX IF NOT EXISTS idx_pesan_tiket ON pesan(no_tiket, dibuat);
