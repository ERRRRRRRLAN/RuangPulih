# Deploy Checklist — Ruang Pulih

Backend (Express + WebSocket) + frontend statis dalam **satu proses**.
Pilih salah satu: Railway, Render, atau VPS Node.

## 1. Persiapan

```bash
# generate secrets baru (JANGN pakai nilai dev)
node -e "console.log('DATA_KEY_HEX=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
```

## 2. Railway

1. `railway login`
2. `railway init` (atau `railway link` kalau project sudah ada)
3. `railway up` — pakai Dockerfile otomatis
4. Set Variables di dashboard:
   - `DATA_KEY_HEX`, `JWT_SECRET` (dari langkah 1)
   - `PGHOST`, `PGPORT=6543`, `PGUSER`, `PGPASSWORD`, `PGDATABASE=postgres`
   - `NODE_ENV=production`
5. Railway kasih domain otomatis (`.up.railway.app`). WS support native.

## 3. Render

1. New → Web Service → connect repo
2. Environment: **Docker** (pakai `render.yaml` atau manual)
3. Set env vars sama seperti Railway (dashboard Render → Environment)
4. Free plan OK untuk demo; WS support native.

## 4. VPS Node (manual)

```bash
git clone <repo> && cd ruang-pulih/backend
cp .env.example .env && vi .env          # isi semua
npm install --omit=dev
node src/server.js                        # atau pakai pm2/systemd
```

Kalau ada reverse proxy (nginx), WS butuh header Upgrade:

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

## 5. Setelah deploy — verifikasi

```bash
curl https://<domain>/api/layanan                 # harus 200, array layanan
curl https://<domain>/                            # harus 200, ada "nav-pill"
```

Lalu login konselor (ganti sandi default!), kirim laporan test, cek chat WS.

## Catatan

- `.env` **tidak** di-commit (lihat .gitignore). Hosting dashboard = satu-satunya tempat isi secret.
- Cookie session auto `secure` saat `NODE_ENV=production` (HTTPS di hosting).
- Supabase: connection pooler IPv4 port 6543. Direct host IPv6-only (tidak reachable dari banyak host).
