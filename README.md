# Ruang Pulih

Konseling anonim, pengaduan, dan rujukan rehabilitasi narkotika. Frontend neumorphism
(dark/light), backend Node.js + Express + Supabase PostgreSQL, chat real-time WebSocket.

## Menjalankan

```bash
cd backend
cp .env.example .env     # lalu isi DATA_KEY_HEX (32 byte hex), JWT_SECRET, dan PG_* (Supabase)
node seed.js             # buat admin utama (idempoten, INSERT OR IGNORE)
node src/server.js       # jalan di http://localhost:3000
```

Database: Supabase PostgreSQL via connection pooler IPv4
(`aws-0-ap-southeast-1.pooler.supabase.com:6543`, transaction mode).
Frontend statis dilayani oleh server yang sama (satu proses, satu port).

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

Backend + frontend statis + WebSocket dalam satu proses — cocok untuk Railway,
Render, Fly.io, atau VPS Node. Dockerfile, `railway.json`, dan `render.yaml`
sudah disediakan.

1. Push repo ini ke GitHub/GitLab (private), atau connect via CLI.
2. Buat service di Railway/Render, connect repo, set env vars:
   - `DATA_KEY_HEX` (64 hex chars / 32 byte AES-256) — **wajib generate baru**
   - `JWT_SECRET` — **wajib generate baru**
   - `NODE_ENV=production`
   - `PGHOST`, `PGPORT` (6543), `PGUSER`, `PGPASSWORD`, `PGDATABASE` (Supabase pooler)
3. Cookie `session` otomatis `secure` saat `NODE_ENV=production`.
4. Jangan pakai nilai dev di `.env` produksi.
5. Supabase pooler: pastikan IP host hosting di-whitelist (Supabase default allow all).

## Risiko & tradeoffs

1. **better-sqlite3 build native** — sudah tidak dipakai (migrated ke Supabase
   PostgreSQL). Dependency masih ada di package.json sebagai fallback dev.
2. **WebSocket di production** — Railway/Render native support WS, tapi kalau
   pakai VPS sendiri butuh reverse proxy yang support `Upgrade`.
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
    dbpg.js                pg Pool wrapper (Supabase, async, prepare/run/get/all)
    ws.js                  WebSocket chat 2 peran (anonim ?tiket=, konselor cookie)
    security.js            AES-256-GCM, bcrypt, JWT
    seedLayanan.js         seed data layanan hotline
    routes/                auth, pengaduan, dashboard, layanan, rujukan
    middleware/            rateLimit, securityHeaders
  .env                     (di-gitignore) DATA_KEY_HEX, JWT_SECRET, PG_*
konselor/                  login.html + dashboard.html
css/ style.css + dashboard.css + login.css
js/  script.js, program.js, chat-ui.js, chat-hide.js,
     konselor-login.js, konselor-dashboard.js
assets/ logo, favicon, apple-touch-icon
Dockerfile, railway.json, render.yaml   konfigurasi deploy
```
