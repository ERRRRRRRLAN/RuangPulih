-- ============================================================
-- MIGRASI LEAST-PRIVILEGE — Ruang Pulih (jalankan di Supabase SQL Editor)
-- ============================================================
-- Tujuan: app TIDAK lagi konek sebagai superuser 'postgres'. Role
-- 'ruangpulih_app' hanya punya hak minimal yang benar-benar dipakai kode:
-- SELECT/INSERT/UPDATE pada 6 tabel app. TANPA DROP/TRUNCATE/ALTER/GRANT.

-- 1. Buat role app (password GANTI sebelum jalan — generate acak 32 byte)
--    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
CREATE ROLE ruangpulih_app LOGIN PASSWORD 'GANTI_SEBELUM_JALAN';
COMMENT ON ROLE ruangpulih_app IS 'Aplikasi Ruang Pulih - least privilege, no DDL';

-- 2. Grant koneksi & usage schema
GRANT USAGE ON SCHEMA public TO ruangpulih_app;

-- 3. Hak minimal per tabel (prinsip least privilege):
--    pengaduan: app membuat (anon), membaca, mengubah status/penangan. Tidak DELETE.
GRANT SELECT, INSERT, UPDATE ON TABLE pengaduan TO ruangpulih_app;
GRANT SELECT, INSERT, UPDATE ON minat_program TO ruangpulih_app;
GRANT SELECT, INSERT, UPDATE ON pesan TO ruangpulih_app;
GRANT SELECT, INSERT, UPDATE ON rujukan TO ruangpulih_app;
GRANT SELECT, INSERT, UPDATE ON konselor TO ruangpulih_app;
GRANT SELECT, INSERT, UPDATE ON audit_log TO ruangpulih_app;
GRANT SELECT, INSERT ON chat_event TO ruangpulih_app; -- realtime feed: hanya append

-- 4. Sequences (kalau ada kolom serial)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ruangpulih_app;

-- 5. Default privileges untuk tabel baru di masa depan
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO ruangpulih_app;

-- 6. REVOKE apa yang tidak dipakai app
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM ruangpulih_app;
REVOKE CREATE ON SCHEMA public FROM ruangpulih_app;

-- ============================================================
-- RLS (Row Level Security) — defense in depth di dalam DB itu sendiri
-- ============================================================
-- anon (Supabase anon key di frontend) HANYA boleh baca layanan & event chat.
ALTER TABLE layanan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS layanan_public_read ON layanan;
CREATE POLICY layanan_public_read ON layanan FOR SELECT USING (true);

ALTER TABLE pengaduan ENABLE ROW LEVEL SECURITY;
-- Supabase anon TIDAK dapat apa pun di pengaduan (semua akses via server API).
DROP POLICY IF EXISTS pengaduan_public_read ON pengaduan;

-- ============================================================
-- CARA PAKAI:
-- 1. Jalankan di Supabase SQL Editor (service_role atau owner).
-- 2. Di Supabase dashboard -> Settings -> Database -> buat user 'ruangpulih_app'
--    (atau pakai SQL: CREATE USER sudah dilakukan di atas), catat passwordnya.
-- 3. Vercel env vars: ganti PGUSER=ruangpulih_app, PGPASSWORD=<password baru>.
--    (PGHOST tetap pooler; DATABASE_URL ikut berubah jika dipakai.)
-- 4. Redeploy. Verifikasi: error permission = role terlalu kecil → tambah grant.
-- ============================================================
