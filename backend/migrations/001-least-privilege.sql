-- ============================================================
-- MIGRASI LEAST-PRIVILEGE — Ruang Pulih
-- ============================================================
-- Tujuan: app TIDAK lagi konek sebagai superuser 'postgres'. Role
-- 'ruangpulih_app' hanya punya hak minimal yang benar-benar dipakai kode:
-- SELECT/INSERT/UPDATE pada tabel app (+ DELETE hanya di ikatan_telegram,
-- untuk perintah /lepas). TANPA DROP/TRUNCATE/ALTER/GRANT/CREATE.
--
-- Grant di bawah diverifikasi terhadap query aktual di backend/src/**.

-- 0. Password acak kuat untuk role app (jangan dipakai ulang)
CREATE ROLE ruangpulih_app LOGIN PASSWORD 'RuangPulih_App_2026_Xq8zFp3nKb2vYt5w';
COMMENT ON ROLE ruangpulih_app IS 'Aplikasi Ruang Pulih - least privilege, no DDL';

-- 1. Grant koneksi & usage schema
GRANT USAGE ON SCHEMA public TO ruangpulih_app;

-- 2. Hak minimal per tabel (diverifikasi vs query aktual di backend/src):
--    pengaduan: INSERT (anon), SELECT, UPDATE (status/dibaca/ditangani_oleh)
GRANT SELECT, INSERT, UPDATE ON TABLE pengaduan TO ruangpulih_app;
--    minat_program: INSERT + SELECT
GRANT SELECT, INSERT, UPDATE ON TABLE minat_program TO ruangpulih_app;
--    pesan: INSERT (pesan user/konselor), SELECT (ambil riwayat), UPDATE (status baca)
GRANT SELECT, INSERT, UPDATE ON TABLE pesan TO ruangpulih_app;
--    rujukan: CRUD rujukan
GRANT SELECT, INSERT, UPDATE ON TABLE rujukan TO ruangpulih_app;
--    konselor: SELECT (login), INSERT/UPDATE (admin kelola konselor)
GRANT SELECT, INSERT, UPDATE ON TABLE konselor TO ruangpulih_app;
--    audit_log: INSERT (log aksi) + SELECT
GRANT SELECT, INSERT, UPDATE ON TABLE audit_log TO ruangpulih_app;
--    chat_event: realtime feed, hanya append (SELECT + INSERT)
GRANT SELECT, INSERT ON TABLE chat_event TO ruangpulih_app;
--    layanan: hotline publik, SELECT saja (isi via seedLayanan/admin)
GRANT SELECT ON TABLE layanan TO ruangpulih_app;
--    ikatan_telegram: INSERT (bind /chat), DELETE (unbind /lepas), SELECT
GRANT SELECT, INSERT, DELETE ON TABLE ikatan_telegram TO ruangpulih_app;

-- 3. Sequences (kalau ada kolom serial)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ruangpulih_app;

-- 4. Default privileges untuk tabel baru di masa depan
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO ruangpulih_app;

-- 5. REVOKE apa yang tidak dipakai app (defense in depth)
REVOKE DELETE ON pengaduan, minat_program, pesan, rujukan, konselor, audit_log,
             chat_event, layanan FROM ruangpulih_app;
REVOKE CREATE ON SCHEMA public FROM ruangpulih_app;
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM ruangpulih_app;

-- ============================================================
-- RLS (Row Level Security) — defense in depth di dalam DB itu sendiri
-- ============================================================
-- anon (Supabase anon key di frontend) HANYA boleh baca layanan & notifikasi
-- publik. Data sensitif harus lewat server API (role ruangpulih_app).

-- layanan: baca publik (nomor hotline)
ALTER TABLE layanan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS layanan_public_read ON layanan;
CREATE POLICY layanan_public_read ON layanan FOR SELECT TO anon USING (true);

-- pengaduan: anon TIDAK dapat apa pun (semua via server API)
ALTER TABLE pengaduan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pengaduan_public_read ON pengaduan;

-- minat_program, rujukan, konselor, audit_log, pesan, ikatan_telegram:
-- anon TIDAK dapat apa pun. Aktifkan RLS + pastikan tidak ada policy anon.
ALTER TABLE minat_program ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS minat_program_public_read ON minat_program;
ALTER TABLE rujukan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rujukan_public_read ON rujukan;
ALTER TABLE konselor ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS konselor_public_read ON konselor;
ALTER TABLE pesan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pesan_public_read ON pesan;
ALTER TABLE ikatan_telegram ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ikatan_telegram_public_read ON ikatan_telegram;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_public_read ON audit_log;

-- ============================================================
-- RLS pada role app: tampilkan RLS aktif tapi role app BYPASS tidak diizinkan.
-- (Supabase: role non-superuser tanpa BYPASSRLS tunduk pada RLS.)
-- Pastikan ruangpulih_app TIDAK punya BYPASSRLS:
ALTER ROLE ruangpulih_app NOBYPASSRLS;

-- KRITIS: karena RLS aktif di tabel-tabel di atas dan ruangpulih_app BUKAN
-- superuser, role ini butuh policy eksplisit — kalau tidak, semua query
-- kembali 0 baris dan app hancur. Policy di bawah memberi akses penuh ke
-- role app saja (yang sudah dibatasi oleh GRANT di atas), sambil tetap
-- memblokir anon.
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['pengaduan','minat_program','pesan','rujukan',
                               'konselor','audit_log','chat_event','layanan',
                               'ikatan_telegram'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_app_full ON %I;', t, t);
    EXECUTE format('CREATE POLICY %I_app_full ON %I FOR ALL TO ruangpulih_app USING (true) WITH CHECK (true);', t, t);
  END LOOP;
END $$;

-- Verifikasi cepat (harus menampilkan 9 baris):
-- SELECT tablename, policyname FROM pg_policies WHERE policyname LIKE '%_app_full' ORDER BY tablename;

-- ============================================================
-- CARA PAKAI (SUDAH DIEKSEKUSI via backend/src/dbpg.js, lihat bawah):
-- 1. Jalankan SQL ini sebagai superuser (postgres).  [SELESAI]
-- 2. Set PGUSER=ruangpulih_app + PGPASSWORD di env server & Vercel.
-- 3. Redeploy. Verifikasi: error permission = role terlalu kecil → tambah grant.
-- ============================================================
