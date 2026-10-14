-- ============================================================
-- MIGRASI 004 — Sahabat AI tanpa tiket (sesi anonim mandiri)
-- ============================================================
-- Fitur: pengunjung yang belum berani bikin laporan bisa ngobrol dengan AI
-- dulu. Tanpa nama, tanpa tiket — hanya sesi_id acak di localStorage browser.
--
-- Tabel ai_chat menyimpan riwayat AI (terenkripsi AES sama seperti pesan).
-- TIDAK terkait pengaduan; tidak pernah muncul di inbox konselor.
-- Kalau pelapor akhirnya bikin laporan, riwayat AI TIDAK otomatis pindah
-- (privasi: dsb.) — dia bisa cerita ulang, atau bawa sendiri poin-poinnya.

CREATE TABLE IF NOT EXISTS ai_chat (
  id bigserial PRIMARY KEY,
  sesi_id text NOT NULL,          -- acak 32-byte hex, milik browser pelapor
  pengirim text NOT NULL,         -- 'user' | 'ai'
  isi_enc text NOT NULL,          -- AES-256-GCM, sama seperti pesan.isi_enc
  dibuat bigint NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_chat_sesi_idx ON ai_chat (sesi_id, dibuat);

-- Least privilege role app: SELECT/INSERT/UPDATE utk table ini, DELETE revokes
GRANT SELECT, INSERT, UPDATE ON TABLE ai_chat TO ruangpulih_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ruangpulih_app;

-- RLS: role app akses penuh (via policy), anon kosong
ALTER TABLE ai_chat ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_chat_app_full ON ai_chat;
CREATE POLICY ai_chat_app_full ON ai_chat FOR ALL TO ruangpulih_app
  USING (true) WITH CHECK (true);

-- Kuota harian per sesi via tabel ai_chat sendiri (hitung baris per sesi/hari)
-- Tidak perlu chat_event — chat_event dipakai untuk notifikasi konselor saja.
