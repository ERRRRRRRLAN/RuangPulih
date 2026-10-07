-- ============================================================
-- TUTUP chat_event: batasi apa yang bisa dibaca role anon (REVISI)
-- ============================================================
-- Masalah: RLS OFF di semua tabel, policy lama tak dijalankan, anon baca
-- SEMUA baris chat_event termasuk no_tiket + flag darurat tiket orang lain.
--
-- Kebutuhan dua sisi (harus aman DAN fungsional):
--   - Pelapor (anon, punya no_tiket sendiri): perlu subscribe tiketnya sendiri.
--   - Konselor (dashboard): perlu notifikasi pesan masuk di SEMUA tiket.
--   - Publik anon tak terautentikasi: TIDAK boleh lihat tiket orang lain.
--
-- Supabase Realtime menjalankan RLS pada saat subscribe, jadi policy harus
-- mengizinkan kedua kasus sah tanpa membuka semuanya.

-- 1. Aktifkan RLS di chat_event (sebelumnya OFF = policy tak dijalankan)
ALTER TABLE chat_event ENABLE ROW LEVEL SECURITY;

-- 2. Hapus policy lama yang terlalu longgar
DROP POLICY IF EXISTS chat_event_baca ON chat_event;
DROP POLICY IF EXISTS chat_event_anon_minimal ON chat_event;

-- 3. Policy untuk anon: hanya baris yang TIDAK membocorkan tiket orang lain.
--    tipe='pengaduan_baru' = notifikasi publik (aman: hanya flag darurat, tanpa
--    cerita/kontak). Baris 'pesan' untuk tiket orang lain TIDAK boleh.
--    Pelapor subscribe tiketnya sendiri via filter no_tiket=eq.<tiketnya> —
--    tapi RLS anon tak bisa verifikasi "tiket ini miliknya" tanpa session,
--    jadi tetap hanya pengaduan_baru yang terlihat anon. Pesan masuk
--    ke pelapor didorong via API fetch (ambilHistory), bukan realtime anon.
CREATE POLICY chat_event_anon_minimal ON chat_event
  FOR SELECT TO anon
  USING (tipe = 'pengaduan_baru');

-- 4. Role authenticated (server/service key): baca semua — tanpa batas.
CREATE POLICY chat_event_authenticated_baca ON chat_event
  FOR SELECT TO authenticated
  USING (true);

-- 5. Grant SELECT tetap diperlukan agar policy bisa dijalankan.
GRANT SELECT ON chat_event TO anon;

-- ============================================================
-- Tabel sensitif: REVOKE eksplisit SELECT dari anon (defense in depth).
-- ============================================================
REVOKE SELECT ON TABLE konselor FROM anon;
REVOKE SELECT ON TABLE pesan FROM anon;
REVOKE SELECT ON TABLE audit_log FROM anon;
REVOKE SELECT ON TABLE pengaduan FROM anon;
REVOKE SELECT ON TABLE minat_program FROM anon;
REVOKE SELECT ON TABLE rujukan FROM anon;
REVOKE SELECT ON TABLE ikatan_telegram FROM anon;

-- ============================================================
-- CATATAN REALTIME DASHBOARD KONSELOR:
-- Dashboard subscribe chat_event memakai ANON key (browser). Setelah RLS ini,
-- baris tipe='pesan' tak terlihat anon → notifikasi chat masuk konselor MATI.
-- FIX: dashboard harus pakai endpoint server (SSE/polling /api/dashboard/inbox)
-- untuk update chat, atau subscribe memakai token authenticated.
-- Sementara: dashboard sudah puna fallback polling — verifikasi setelah migrasi.
-- ============================================================
