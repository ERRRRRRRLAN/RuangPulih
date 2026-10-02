# Ruang Pulih

Konseling anonim, pengaduan, dan rujukan rehabilitasi narkotika. Frontend neumorphism
(dark/light), backend Node.js + Express + SQLite, chat real-time WebSocket.

## Menjalankan

```bash
cd backend
cp .env.example .env     # lalu isi DATA_KEY_HEX (32 byte hex) dan JWT_SECRET
node seed.js              # buat admin utama (idempoten, INSERT OR IGNORE)
node src/server.js        # jalan di http://localhost:3000
```

Database SQLite (`ruangpulih.db`) dibuat otomatis di `backend/`. Semua file `.db*`
diabaikan git.

## Test

```bash
cd backend
node run-tests.js         # 33 test berurutan, 0 fail
```

**Penting:** jangan pakai `node --test tests/` — runner paralel memakai satu DB
shared dan merobek data antar file. `run-tests.js` menjalankannya berurutan.

## Keamanan

- **AES-256-GCM** untuk `cerita`/`isi` pengaduan (kunci di `.env`, `DATA_KEY_HEX`).
- **bcrypt** untuk sandi konselor; **JWT** di cookie `HttpOnly` bernama `session`.
- **Rate limit:** login 5x/menit, pengaduan 10x/menit, API umum 30x/menit (429).
- **Security headers:** `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, HSTS, `Permissions-Policy`, dan CSP ketat
  (`script-src 'self'` — tidak ada inline script).
- **Minimisasi data:** endpoint publik `GET /api/pengaduan/:tiket` tidak
  mengembalikan `cerita`, hanya metadata status.
- **Lockout:** 5x sandi salah → akun nonaktif sampai direset admin.

## Deploy produksi

1. Isi `.env` produksi: `DATA_KEY_HEX` dan `JWT_SECRET` baru (jangan pakai nilai dev).
2. Cookie `session` otomatis `secure` saat `NODE_ENV=production`.
3. WebSocket butuh reverse proxy yang support `Upgrade` (nginx: `proxy_set_header Upgrade $http_connection;`).
4. Kompilasi ulang `better-sqlite3` bila pindah arsitektur: `npm rebuild better-sqlite3`.

## Risiko & tradeoffs

1. **better-sqlite3 build native** — butuh toolchain C++ saat `npm install`.
   Fallback: `node:sqlite` bawaan Node 24 (API mirip).
2. **WebSocket di production** — butuh reverse proxy yang support `Upgrade`.
3. **`.env` terlupa saat deploy** — server crash di startup (fail-loud, disengaja).
4. **Rate limit in-memory** — reset tiap restart, tidak shared antar instance.
   Cukup untuk skala 1 server.
5. **AES-256-GCM key rotation** — belum ada. Kalau nanti butuh, tambah kolom
   `key_version` di tabel `pengaduan`.

## Fitur yang ditunda (YAGNI)

- **AI chat box** — router WebSocket sudah punya field `pengirim: 'user'|'konselor'`;
  tinggal tambah mode `'ai'` + provider (OpenRouter) di satu tempat (`src/ws.js`)
  tanpa mengubah frontend.
- **2FA/TOTP** — username + sandi dulu; TOTP bisa ditambah di `src/routes/auth.js`.
- **Artikel/edukasi PDF** — skip.

## Struktur

```
backend/
  src/
    server.js              Express + static + WS + middleware
    ws.js                  WebSocket chat 2 peran (anonim ?tiket=, konselor cookie)
    security.js            AES-256-GCM, bcrypt, JWT
    db.js                  5 tabel: konselor, pengaduan, pesan, audit_log, layanan
    routes/                auth, pengaduan, dashboard, layanan
    middleware/            rateLimit, securityHeaders
  tests/                   7 file, 33 test
konselor/                  login.html + dashboard.html
css/ style.css + dashboard.css
js/  script.js, konselor-login.js, konselor-dashboard.js
```
