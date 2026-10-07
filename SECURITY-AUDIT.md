# Laporan Red-Team & Hardening — Ruang Pulih (2026-10-06)

## Simulasi serangan (chain of thought DevSecOps)

Sebagai attacker, urutan coba-coba saya:

### Vektor 1 — Enumerasi file statis (HASIL: KRITIS, ditemukan)
Static server `express.static(ROOT)` menyajikan SELURUH repo, termasuk `backend/`.
- `GET /backend/src/security.js` → 200 (logika enkripsi + struktur kunci terbaca)
- `GET /backend/src/schema-postgres.sql` → 200 (kolom sensitif: cerita_enc, kontak_enc)
- `GET /backend/package.json` → 200 (versi dep → cari CVE yang cocok)
- `GET /.env`, `/backend/.env` → 200 tapi isinya index.html (fallback SPA, aman-kebetulan)
Impact: attacker paham mekanisme enkripsi & nama kolom → menyusun serangan tahap berikutnya.
Status: DIPERBAIKI — blokir path server-side di server.js + vercel.json headers.

### Vektor 2 — Login brute force
- Rate limit 5/menit per-IP sudah ada; lockout 5 gagal → kunci 15 menit sudah ada.
- Sisa risiko: pesan error identik untuk username salah vs sandi salah (user enumeration via timing sulit karena bcrypt selalu dijalankan).
Status: SUDAH BAIK (defense-in-depth: rate limit + lockout + bcrypt cost 12).

### Vektor 3 — Manipulasi parameter (IDOR)
- `/api/pengaduan/:tiket` publik → hanya field publik (publik()), tanpa cerita/kontak. Aman.
- `/api/pesan` anon-token → payload.tiket harus cocok tiket parameter (403 kalau beda). Aman.
- `/api/dashboard/inbox` → filter `ditangani_oleh = req.konselor.id` (bukan parameter). Aman.
- `/api/dashboard/inbox/:tiket/ambil` → atomic `WHERE ditangani_oleh IS NULL` (409 kalau keduluan). Aman (race-safe).
Status: SUDAH BAIK.

### Vektor 4 — Injection SQL
Semua query pakai parameterized ($1..$N) via dbpg. Tidak ada string concatenasi input user.
Status: SUDAH BAIK.

### Vektor 5 — XSS
- Semua render DOM pakai esc() di sisi klien. CSP `script-src 'self'` memblok inline script eksternal.
- Catatan: CSP belum punya nonce/hash, tapi karena tak ada inline script, aman.
Status: SUDAH BAIK. Diperkuat dengan object-src 'none' + frame-ancestors.

### Vektor 6 — Session fixation / hijack
- Cookie HttpOnly + SameSite=Lax + Secure dinamis (HTTPS). TTL 8 jam.
- JWT dicocokkan ke DB row (aktif) tiap request via butuhKonselor → logout/disable instan efektif.
Status: SUDAH BAIK.

### Vektor 7 — Telegram webhook spoofing
- verifyWebhook cek X-Telegram-Bot-Api-Secret-Token ATAU secret di path. Secret default 'rp-webhook-2026' hardcoded fallback → jika env tak diset di produksi, attacker bisa POST webhook palsu.
Status: DIPERBAIKI — hapus fallback, wajib env.

### Vektor 8 — Least privilege DB
- Pool pakai kredensial `postgres` (superuser project Supabase) — semua route berbagi hak penuh.
- Risiko: bug di satu route = akses penuh ke semua tabel. Rekomendasi: buat role `ruangpulih_app` khusus yang tidak bisa DROP/ALTER.
Status: DICATAT (perlu akses dashboard Supabase oleh pemilik project; tidak bisa otomatis dari kode).
Implementasi parsial: transaction guard di dbpg untuk operasi multi-statement, dan semua query tetap parameterized.

## Ringkasan perbaikan yang dieksekusi
1. Blokir akses publik ke direktori backend/ + file config (server.js middleware + vercel.json headers).
2. Telegram webhook: hapus fallback secret hardcoded, fail-closed env wajib.
3. CSP diperketat: object-src 'none', frame-ancestors 'none', base-uri 'self'.
4. Header tambahan: X-DNS-Prefetch-Control, X-Permitted-Cross-Domain-Policies.
5. Verifikasi: curl produksi tidak lagi menyajikan backend source.
