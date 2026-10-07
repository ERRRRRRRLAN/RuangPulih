-- ============================================================
-- MIGRASI 003 — Rate limit persisten (serverless-safe)
-- ============================================================
-- Masalah: middleware rateLimit memakai in-memory Map. Vercel serverless
-- menjalankan tiap request pada instance yang bisa berbeda → Map kosong,
-- proteksi brute-force login (5/menit) TIDAK efektif di produksi.
--
-- Solusi: simpan hit di Postgres (sudah dipakai app, gratis, tahan lintas
-- instance). Tabel kecil dengan TTL jendela; diisi oleh role app.

CREATE TABLE IF NOT EXISTS rate_limit_hit (
  ip text NOT NULL,
  ts bigint NOT NULL,
  PRIMARY KEY (ip, ts)
);

-- Index untuk hapus hit kedaluwarsa (sweeper tiap request)
CREATE INDEX IF NOT EXISTS rate_limit_hit_ts_idx ON rate_limit_hit (ts);

-- Hak untuk role app: catat hit, hapus yang kedaluwarsa, hitung.
GRANT SELECT, INSERT, DELETE ON TABLE rate_limit_hit TO ruangpulih_app;

-- RLS: role app bebas kelola tabel ini; anon TIDAK boleh.
ALTER TABLE rate_limit_hit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rate_limit_hit_app_full ON rate_limit_hit;
CREATE POLICY rate_limit_hit_app_full ON rate_limit_hit
  FOR ALL TO ruangpulih_app USING (true) WITH CHECK (true);

-- Default privileges untuk tabel baru
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO ruangpulih_app;
