# Plan — Ruang Pulih: Frontend Revamp + Backend Konselor (Node.js + Express + SQLite)

> **Goal (1 kalimat):** Mengubah situs statis "Ruang Pulih" menjadi aplikasi full-stack — frontend dirombak (_whitespace_, teks dipangkas, neumorphism kuat, bebas AI-slop) + backend Node.js/Express/SQLite yang menyimpan pengaduan dan chat **terenkripsi**, login konselor, dan chat real-time WebSocket — tanpa bug, mobile responsive, keamanan penuh.

## 1. Current context / asumsi

- Repo: `C:\Users\erlan\website-konseling-narkotika` — git sudah init, 1 commit (`frontend statis: kondisi awal sebelum fullstack`), branch `master`.
- File ada: `index.html` (32KB), `css/style.css`, `js/script.js` (semua logika masih **palsu / client-only**), 3 screenshot preview, dan PDF requirement `Web Konselor Anonim.pdf` (332 baris: BAB I–V, fitur 3.1–3.8).
- Frontend sudah lolos 3 ronde audit anti-AI-slop (fresh-eyes score 9/10). Dua residual yang tersisa (`program-grid` 4 kartu simetris, hotline 4 kartu identik) ditangani di Fase 7.
- Toolchain terverifikasi: **Node v24.14.0, npm 11.9.0**, `node:sqlite` built-in ada (experimental), npm registry reachable.
- **Stack dipilih user: Node.js + Express + SQLite.** Python sudah dibersihkan total; tidak ada artifact Python tersisa. Jangan pernah buat file Python lagi di proyek ini.
- AI chat: **sengaja tidak dibangun sekarang** (user belum ada ide). Router chat didesain agar provider AI tinggal disambung nanti (bagian 6).
- Password/kunci rahasia: jangan pernah hardcode; pakai `backend/.env` (di-gitignore).

## 2. Arsitektur / pendekatan

Satu proses Node (Express) menyajikan frontend statis + REST API `/api/*` + WebSocket `/ws` di port 3000. Data sensitif (isi pengaduan, isi chat, kontak) disimpan sebagai **ciphertext AES-256-GCM** di SQLite single-file `ruangpulih.db`; sandi konselor di-hash **bcrypt**; sesi = **JWT dalam cookie HttpOnly**. Pengunjung anonim membuat tiket tanpa login (`PN-YYYYMMDD-XXXX`) lalu chat via WebSocket memakai nomor tiket (tiket = satu-satunya "kunci" mereka); konselor login username+sandi, melihat dashboard tiket + chat dari sisi mereka.

## 3. Struktur file target

```
website-konseling-narkotika/
├── index.html                 (direvamp Fase 7)
├── css/style.css              (direvamp Fase 7)
├── js/script.js               (disambung ke API Fase 6)
├── konselor/
│   ├── login.html             (baru, Fase 6)
│   └── dashboard.html         (baru, Fase 6)
├── backend/
│   ├── package.json
│   ├── .env                   (gitignored: DATA_KEY_HEX, JWT_SECRET)
│   ├── .env.example
│   ├── ruangpulih.db          (gitignored, auto-created)
│   ├── seed.js                (gitignored: bikin akun konselor)
│   ├── src/
│   │   ├── config.js          (env + fail-closed guard)
│   │   ├── security.js        (AES-GCM, bcrypt, JWT)
│   │   ├── db.js              (better-sqlite3 + skema)
│   │   ├── audit.js           (audit log helper)
│   │   ├── deps.js            (middleware auth konselor/admin)
│   │   ├── ws.js              (WebSocket chat real-time)
│   │   ├── server.js          (app Express + static + ws + helmet)
│   │   └── routes/
│   │       ├── auth.js        (/api/auth/*)
│   │       ├── pengaduan.js   (/api/pengaduan/*)
│   │       ├── pesan.js       (/api/pesan/* REST fallback)
│   │       ├── layanan.js     (/api/layanan)
│   │       └── dashboard.js   (/api/dashboard/* konselor)
│   └── tests/
│       ├── security.test.js
│       ├── auth.test.js
│       ├── pengaduan.test.js
│       └── chat.test.js
```

## 4. Step-by-step tasks

> **Siklus tiap task kodenya: tulis test → jalankan lihat gagal (RED) → implementasi minimal → jalankan lihat lulus (GREEN) → commit.** Semua perintah dijalankan dari `C:/Users/erlan/website-konseling-narkotika`. Test runner: **`node --test` bawaan Node 24** (nol dependency tambahan).

### FASE 0 — Fondasi repo & environment

#### T0.1 — `backend/package.json` + install dependency

```bash
cd "C:/Users/erlan/website-konseling-narkotika/backend"
npm init -y
npm install express@^5 better-sqlite3 bcrypt jsonwebtoken cookie-parser ws dotenv helmet express-rate-limit zod
```

Lalu timpa `backend/package.json` dengan (script `test` pakai runner bawaan):

```json
{
  "name": "ruang-pulih-backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test tests/",
    "seed": "node seed.js"
  }
}
```

**Verifikasi** (mengembalikan tulisan tanpa error):
```bash
cd "C:/Users/erlan/website-konseling-narkotika/backend"
node -e "['express','better-sqlite3','bcrypt','jsonwebtoken','cookie-parser','ws','dotenv','helmet','express-rate-limit','zod'].forEach(m=>require(m)); console.log('deps ok')"
```
Output yang diharapkan: `deps ok`. Commit: `git add backend/package.json backend/package-lock.json && git commit -m "backend: package.json + deps"`.

> **Catatan:** `better-sqlite3` adalah native module — npm memakai prebuilt binary di Windows, tidak perlu compiler. Jika gagal (tidak ada prebuilt untuk kombinasi ini), fallback: `node:sqlite` built-in dengan penyesuaian API di `db.js`.

#### T0.2 — Secret `.env` + `.env.example` + `.gitignore`

Generate secret lokal (sekali saja):
```bash
cd "C:/Users/erlan/website-konseling-narkotika/backend"
node -e "console.log('DATA_KEY_HEX='+require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(48).toString('base64url'))"
```
Output: `DATA_KEY_HEX=<64 hex>` / `JWT_SECRET=<string>` → **tempel ke `backend/.env`**. Lalu buat `backend/.env.example` berisi placeholder kosong untuk orang lain. Commit `.env.example` saja.

Timpa root `.gitignore` (buang entri Python, tambah Node):
```gitignore
# Rahasia & data
.env
backend/.env
backend/ruangpulih.db
backend/ruangpulih.db-*
backend/seed.js
node_modules/
# Sementara
.hermes/plans/
```

**Verifikasi `.env` tidak terlacak:**
```bash
git status --porcelain backend/.env      # harus output KOSONG
```

### FASE 1 — Konfigurasi, enkripsi, database, audit

#### T1.1 — `backend/src/config.js` — baca env + fail-closed

```js
// backend/src/config.js
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

function need(k) {
  const v = process.env[k];
  if (!v || !v.trim()) throw new Error(`env ${k} wajib diisi (lihat backend/.env.example)`);
  return v.trim();
}

const config = {
  DATA_KEY: Buffer.from(need('DATA_KEY_HEX'), 'hex'), // 32 bytes AES-256
  JWT_SECRET: need('JWT_SECRET'),
  JWT_TTL: process.env.JWT_TTL || '8h',
  PORT: process.env.PORT || 3000,
  DB_PATH: process.env.DB_PATH || require('path').join(__dirname, '..', 'ruangpulih.db'),
  NODE_ENV: process.env.NODE_ENV || 'development',
};

if (config.DATA_KEY.length !== 32) throw new Error('DATA_KEY_HEX harus 32 byte (64 hex chars)');

module.exports = config;
```

**Verifikasi** (harus melempar karena `.env` kosong saat ini — ini GREEN-nya guard):
```bash
cd backend && node -e "try{require('./src/config')}catch(e){console.log('OK guard:', e.message)}"
```

#### T1.2 — `backend/src/security.js` — AES-256-GCM + bcrypt + JWT

```js
// backend/src/security.js
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('./config');

const ALGO = 'aes-256-gcm';

/** Enkripsi teks → base64 "iv:tag:ciphertext" (field DB selalu string). */
function encrypt(plain) {
  if (plain === undefined || plain === null) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv(ALGO, config.DATA_KEY, iv);
  const tag = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  const gcmTag = c.getAuthTag();
  return [iv, gcmTag, tag].map(b => b.toString('base64')).join(':');
}

/** Dekripsi; lempar Error jika tag tidak cocok (data pernah diubah / kunci salah). */
function decrypt(blob) {
  if (!blob) return null;
  const [ivB, tagB, dataB] = blob.split(':');
  const d = crypto.createDecipheriv(ALGO, config.DATA_KEY, Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(dataB, 'base64')), d.final()]).toString('utf8');
}

const hashSandi = p => bcrypt.hash(p, 12);
const cekSandi = (p, h) => bcrypt.compare(p, h);
const buatJWT = (payload) => jwt.sign(payload, config.JWT_SECRET, { expiresIn: config.JWT_TTL });
const verifikasiJWT = (t) => jwt.verify(t, config.JWT_SECRET);

module.exports = { encrypt, decrypt, hashSandi, cekSandi, buatJWT, verifikasiJWT };
```

**Test** — `backend/tests/security.test.js` (node:test bawaan):
```js
const test = require('node:test');
const assert = require('node:assert');
const { encrypt, decrypt, cekSandi, hashSandi, verifikasiJWT, buatJWT } = require('../src/security');

test('enkripsi roundtrip', () => {
  assert.equal(decrypt(encrypt('cerita rahasia')), 'cerita rahasia');
});
test('ciphertext tidak plaintext', () => {
  const c = encrypt('cerita rahasia');
  assert.ok(!c.includes('cerita'));
});
test('decrypt blob rusak gagal', () => {
  const c = encrypt('x');
  assert.throws(() => decrypt(c.slice(0, -2) + 'A='), Error);
});
test('bcrypt roundtrip', async () => {
  assert.ok(await cekSandi('rahasia123', await hashSandi('rahasia123')));
});
test('jwt roundtrip', () => {
  assert.equal(verifikasiJWT(buatJWT({ id: 7, peran: 'konselor' })).id, 7);
});
test('jwt palsu ditolak', () => {
  assert.throws(() => verifikasiJWT('xxx.yyy.zzz'));
});
```

**Verifikasi:**
```bash
cd backend && node --test tests/security.test.js
# expect: tests 6 passed / 0 failed
```

#### T1.3 — `backend/src/db.js` — skema SQLite + WAL + pragma foreign keys

```js
// backend/src/db.js
const Database = require('better-sqlite3');
const path = require('path');
const config = require('./config');

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS konselor (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  nama TEXT NOT NULL,
  sandi_hash TEXT NOT NULL,
  peran TEXT NOT NULL DEFAULT 'konselor',  -- 'konselor' | 'admin'
  aktif INTEGER NOT NULL DEFAULT 1,
  gagal INTEGER NOT NULL DEFAULT 0,
  terkunci_sampai INTEGER,                  -- epoch ms, NULL = tidak terkunci
  dibuat INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pengaduan (
  id INTEGER PRIMARY KEY,
  no_tiket TEXT UNIQUE NOT NULL,            -- PN-YYYYMMDD-XXXX
  untuk TEXT NOT NULL,                      -- 'Diri sendiri' | 'Orang lain'
  kategori TEXT NOT NULL,
  frekuensi TEXT,
  usia INTEGER,
  cerita_enc TEXT NOT NULL,                 -- AES-GCM
  kontak_enc TEXT,                          -- AES-GCM, boleh NULL (minimisasi data)
  status TEXT NOT NULL DEFAULT 'Diterima',  -- Diterima->Ditinjau->Dalam Penanganan->Selesai
  ditangani_oleh INTEGER REFERENCES konselor(id),
  dibuat INTEGER NOT NULL,
  diperbarui INTEGER
);
CREATE TABLE IF NOT EXISTS pesan (
  id INTEGER PRIMARY KEY,
  no_tiket TEXT NOT NULL REFERENCES pengaduan(no_tiket),
  pengirim TEXT NOT NULL,                   -- 'user' | 'konselor'
  pengirim_id INTEGER REFERENCES konselor(id),
  isi_enc TEXT NOT NULL,                    -- AES-GCM
  dibuat INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS layanan (
  id INTEGER PRIMARY KEY,
  jenis TEXT NOT NULL,                      -- Konseling | Pendampingan | Rehabilitasi | Darurat
  nama TEXT NOT NULL,
  deskripsi TEXT, persyaratan TEXT, jam TEXT,
  kontak TEXT, lokasi TEXT, prosedur TEXT,
  aktif INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  aktor TEXT,                               -- username konselor atau 'user:<tiket>'
  aksi TEXT NOT NULL,                       -- LOGIN | BACA_PENGADUAN | UBAH_STATUS | ...
  detail TEXT, ip TEXT,
  waktu INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pengaduan_status ON pengaduan(status);
CREATE INDEX IF NOT EXISTS idx_pesan_tiket ON pesan(no_tiket, dibuat);
`);
module.exports = db;
```

**Verifikasi:**
```bash
cd backend && node -e "const d=require('./src/db'); console.log('tables:', d.prepare(\"SELECT count(*) c FROM sqlite_master WHERE type='table'\").get().c)"
# expect: tables: 5
```

#### T1.4 — `backend/src/audit.js` — pencatatan aktivitas (PDF 3.8)

```js
// backend/src/audit.js
const db = require('./db');
const now = () => Date.now();

function catat(aktor, aksi, detail = null, ip = null) {
  db.prepare('INSERT INTO audit_log (aktor, aksi, detail, ip, waktu) VALUES (?,?,?,?,?)')
    .run(aktor, aksi, detail, ip, now());
}
module.exports = { catat };
```

**Verifikasi:**
```bash
cd backend && node -e "const a=require('./src/audit'); a.catat('test','TEST'); console.log('audit rows:', require('./src/db').prepare('SELECT count(*) c FROM audit_log').get().c)"
# expect: audit rows: 1   (lalu hapus db test: rm backend/ruangpulih.db)
```

### FASE 2 — Auth konselor (PDF 4.4)

#### T2.1 — `backend/src/deps.js` — middleware `butuhKonselor` / `butuhAdmin`

```js
// backend/src/deps.js
const { verifikasiJWT } = require('./security');
const db = require('./db');

function ambilSesi(req) {
  const t = req.cookies && req.cookies.session;
  if (!t) return null;
  try { return verifikasiJWT(t); } catch { return null; }
}

function butuhKonselor(req, res, next) {
  const s = ambilSesi(req);
  if (!s || (s.peran !== 'konselor' && s.peran !== 'admin')) return res.status(401).json({ error: 'belum login' });
  const row = db.prepare('SELECT id,username,nama,peran,aktif FROM konselor WHERE id=?').get(s.id);
  if (!row || !row.aktif) return res.status(401).json({ error: 'akun nonaktif' });
  req.konselor = row;
  next();
}

function butuhAdmin(req, res, next) {
  if (!req.konselor || req.konselor.peran !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}
module.exports = { ambilSesi, butuhKonselor, butuhAdmin };
```

#### T2.2 — `backend/src/routes/auth.js` — login + logout + lockout + audit

```js
// backend/src/routes/auth.js
const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../db');
const { buatJWT, cekSandi } = require('../security');
const { butuhKonselor } = require('../deps');
const audit = require('../audit');

const MAKS_GAGAL = 5, KUNCI_MS = 15 * 60 * 1000;

router.post('/login', (req, res) => {
  const { username, sandi } = req.body || {};
  const ip = req.ip;
  const k = db.prepare('SELECT * FROM konselor WHERE username=?').get(String(username || ''));

  // Brute-force lockout (selalu cek walau username tak dikenal, agar tidak bocor ada/tidaknya akun)
  if (k && k.terkunci_sampai && k.terkunci_sampai > Date.now()) {
    audit.catat(k.username, 'LOGIN_DIKUNCI', null, ip);
    return res.status(429).json({ error: 'terlalu banyak percobaan, coba lagi nanti' });
  }

  const cocok = !!(k && cekSandi(String(sandi || ''), k.sandi_hash));
  if (!cocok) {
    if (k) {
      const gagal = k.gagal + 1;
      db.prepare('UPDATE konselor SET gagal=?, terkunci_sampai=? WHERE id=?')
        .run(gagal, gagal >= MAKS_GAGAL ? Date.now() + KUNCI_MS : null, k.id);
      audit.catat(k.username, 'LOGIN_GAGAL', `gagal ke-${gagal}`, ip);
    } else audit.catat('unknown:' + String(username || ''), 'LOGIN_GAGAL', 'username tak dikenal', ip);
    return res.status(401).json({ error: 'username atau sandi salah' });
  }

  db.prepare('UPDATE konselor SET gagal=0, terkunci_sampai=NULL WHERE id=?').run(k.id);
  audit.catat(k.username, 'LOGIN', null, ip);
  const token = buatJWT({ id: k.id, peran: k.peran });
  res.cookie('session', token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict', maxAge: 8 * 60 * 60 * 1000,
  });
  res.json({ id: k.id, username: k.username, nama: k.nama, peran: k.peran });
});

router.post('/logout', butuhKonselor, (req, res) => {
  audit.catat(req.konselor.username, 'LOGOUT', null, req.ip);
  res.clearCookie('session');
  res.json({ ok: true });
});

router.get('/me', butuhKonselor, (req, res) => res.json(req.konselor));
module.exports = router;
```

**Test RED** — `backend/tests/auth.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const auth = require('../src/routes/auth');
const db = require('../src/db');
const { hashSandi } = require('../src/security');

let server, baseUrl;
test.before(async () => {
  db.prepare('DELETE FROM konselor').run();
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(1, 'dr.sari', 'dr. Sari', await hashSandi('rahasia123'), 'konselor', 1, 0, Date.now());
  const app = express().use(express.json()).use(cookieParser()).use('/api/auth', auth);
  server = app.listen(0);
  baseUrl = 'http://localhost:' + server.address().port;
});
test.after(() => server.close());

async function req(path, { method = 'POST', body, cookie } = {}) {
  const res = await fetch(baseUrl + path, {
    method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') };
}

test('login benar kasih cookie + data', async () => {
  const r = await req('/api/auth/login', { body: { username: 'dr.sari', sandi: 'rahasia123' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.nama, 'dr. Sari');
  assert.match(r.cookie, /session=[^;]+; Path=\/; HttpOnly/);
});
test('login salah ditolak 401', async () => {
  const r = await req('/api/auth/login', { body: { username: 'dr.sari', sandi: 'salah' } });
  assert.equal(r.status, 401);
});
test('5x salah = terkunci (429)', async () => {
  for (let i = 0; i < 4; i++) await req('/api/auth/login', { body: { username: 'dr.sari', sandi: 'salah' } });
  const r = await req('/api/auth/login', { body: { username: 'dr.sari', sandi: 'rahasia123' } });
  assert.equal(r.status, 429);
});
test('/me tanpa cookie = 401', async () => {
  assert.equal((await req('/api/auth/me', { method: 'GET' })).status, 401);
});
```

**Verifikasi:**
```bash
cd backend && node --test tests/auth.test.js
# expect: tests 4 passed
```

#### T2.3 — `backend/seed.js` (gitignored) — bikin akun konselor admin pertama

```js
// backend/seed.js  — JANGAN commit (ada di .gitignore)
const db = require('./src/db');
const { hashSandi } = require('./src/security');

(async () => {
  const rows = db.prepare('SELECT count(*) c FROM konselor').get();
  if (rows.c > 0) return console.log('sudah ada konselor, skip');
  db.prepare('INSERT INTO konselor (username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?)')
    .run('admin', 'Admin Utama', await hashSandi('ganti-saya-123'), 'admin', 1, 0, Date.now());
  console.log('seed selesai. login: admin / ganti-saya-123  <-- GANTI SEGERA');
})();
```

**Verifikasi:**
```bash
cd backend && node seed.js && node -e "console.log(require('./src/db').prepare('SELECT username,peran FROM konselor').all())"
# expect: seed selesai... ; [ { username: 'admin', peran: 'admin' } ]
```

### FASE 3 — API pengaduan publik (PDF 3.2, 3.6)

#### T3.1 — `backend/src/routes/pengaduan.js` — buat tiket + cek status + ambil detail

```js
// backend/src/routes/pengaduan.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { encrypt, decrypt } = require('../security');
const { butuhKonselor } = require('../deps');
const audit = require('../audit');
const crypto = require('crypto');

function buatTiket(d = new Date()) {
  const tgl = d.toISOString().slice(0, 10).replace(/-/g, '');
  const acak = crypto.randomBytes(2).toString('hex').toUpperCase(); // 4 hex chars
  return `PN-${tgl}-${acak}`;
}
function publik(p) { // field pengaduan untuk response publik (tanpa cerita!)
  return { no_tiket: p.no_tiket, untuk: p.untuk, kategori: p.kategori, frekuensi: p.frekuensi,
           usia: p.usia, status: p.status, dibuat: p.dibuat };
}
function lengkap(p) { // versi konselor: sertakan cerita & kontak didekripsi
  return { ...publik(p), cerita: decrypt(p.cerita_enc), kontak: decrypt(p.kontak_enc),
           ditangani_oleh: p.ditangani_oleh, diperbarui: p.diperbarui };
}

// POST /api/pengaduan — publik, anonim, tanpa login
router.post('/', (req, res) => {
  const { untuk, kategori, frekuensi, usia, cerita, kontak } = req.body || {};
  if (!untuk || !kategori || !cerita || !String(cerita).trim())
    return res.status(400).json({ error: 'untuk, kategori, cerita wajib diisi' });
  if (String(cerita).length > 5000) return res.status(400).json({ error: 'cerita maksimal 5000 karakter' });

  const no_tiket = buatTiket();
  const sekarang = Date.now();
  const info = db.prepare(
    `INSERT INTO pengaduan (no_tiket, untuk, kategori, frekuensi, usia, cerita_enc, kontak_enc, status, dibuat)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(no_tiket, String(untuk), String(kategori), frekuensi || null, usia || null,
        encrypt(String(cerita)), kontak ? encrypt(String(kontak)) : null, 'Diterima', sekarang);

  audit.catat(`user:${no_tiket}`, 'BUAT_PENGADUAN', `id=${info.lastInsertRowid}`, req.ip);
  res.status(201).json({ no_tiket, status: 'Diterima' });
});

// GET /api/pengaduan/:tiket — publik, hanya metadata + status (tidak kirim cerita)
router.get('/:tiket', (req, res) => {
  const p = db.prepare('SELECT * FROM pengaduan WHERE no_tiket=?').get(req.params.tiket);
  if (!p) return res.status(404).json({ error: 'tiket tidak ditemukan' });
  res.json(publik(p));
});

// GET /api/pengaduan — konselor: daftar tiket (filter status)
router.get('/', butuhKonselor, (req, res) => {
  const rows = req.query.status
    ? db.prepare('SELECT * FROM pengaduan WHERE status=? ORDER BY dibuat DESC').all(req.query.status)
    : db.prepare('SELECT * FROM pengaduan ORDER BY dibuat DESC').all();
  res.json(rows.map(publik));
});

// GET /api/pengaduan/:tiket/detail — konselor: baca cerita (audit!) (PDF 3.8)
router.get('/:tiket/detail', butuhKonselor, (req, res) => {
  const p = db.prepare('SELECT * FROM pengaduan WHERE no_tiket=?').get(req.params.tiket);
  if (!p) return res.status(404).json({ error: 'tiket tidak ditemukan' });
  audit.catat(req.konselor.username, 'BACA_PENGADUAN', p.no_tiket, req.ip);
  res.json(lengkap(p));
});

// PATCH /api/pengaduan/:tiket/status — konselor: ubah status (flow PDF 3.6)
const FLOW = ['Diterima', 'Ditinjau', 'Dalam Penanganan', 'Selesai'];
router.patch('/:tiket/status', butuhKonselor, (req, res) => {
  const baru = req.body && req.body.status;
  if (!FLOW.includes(baru)) return res.status(400).json({ error: `status harus salah satu: ${FLOW.join(', ')}` });
  const p = db.prepare('SELECT * FROM pengaduan WHERE no_tiket=?').get(req.params.tiket);
  if (!p) return res.status(404).json({ error: 'tiket tidak ditemukan' });

  const sekarang = Date.now();
  db.prepare('UPDATE pengaduan SET status=?, diperbarui=?, ditangani_oleh=COALESCE(ditangani_oleh,?) WHERE no_tiket=?')
    .run(baru, sekarang, req.konselor.id, p.no_tiket);
  audit.catat(req.konselor.username, 'UBAH_STATUS', `${p.no_tiket}: ${p.status} -> ${baru}`, req.ip);
  res.json({ no_tiket: p.no_tiket, status: baru });
});

module.exports = router;
module.exports.FLOW = FLOW;
module.exports.publik = publik;
module.exports.lengkap = lengkap;
```

**Test** — `backend/tests/pengaduan.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const r_pengaduan = require('../src/routes/pengaduan');
const r_auth = require('../src/routes/auth');
const db = require('../db');
const { hashSandi } = require('../security');

let base, server;
test.before(async () => {
  db.prepare('DELETE FROM pesan').run(); db.prepare('DELETE FROM pengaduan').run(); db.prepare('DELETE FROM konselor').run();
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(1, 'dr.sari', 'dr. Sari', await hashSandi('rahasia123'), 'konselor', 1, 0, Date.now());
  const app = express().use(express.json()).use(cookieParser())
    .use('/api/pengaduan', r_pengaduan).use('/api/auth', r_auth);
  server = app.listen(0); base = 'http://localhost:' + server.address().port;
});
test.after(() => server.close());
async function P(path, o = {}) {
  const r = await fetch(base + path, { method: o.method || 'POST', headers: { 'content-type': 'application/json', ...(o.cookie ? { cookie: o.cookie } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { status: r.status, body: await r.json() };
}
async function login() {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'dr.sari', sandi: 'rahasia123' }) });
  return r.headers.get('set-cookie').split(';')[0];
}

test('publik buat tiket → 201 + no_tiket PN-', async () => {
  const r = await P('/api/pengaduan', { body: { untuk: 'Diri sendiri', kategori: 'Penyalahgunaan zat', cerita: 'saya butuh bantuan' } });
  assert.equal(r.status, 201);
  assert.match(r.body.no_tiket, /^PN-\d{8}-[0-9A-F]{4}$/);
});
test('cerita wajib → 400', async () => {
  assert.equal((await P('/api/pengaduan', { body: { untuk: 'Diri sendiri', kategori: 'x' } })).status, 400);
});
test('publik cek tiket → tanpa cerita', async () => {
  const b = (await P('/api/pengaduan', { body: { untuk: 'Diri sendiri', kategori: 'x', cerita: 'rahasia sekali' } })).body;
  const r = await P('/api/pengaduan/' + b.no_tiket, { method: 'GET' });
  assert.equal(r.status, 200);
  assert.equal(r.body.no_tiket, b.no_tiket);
  assert.equal('cerita' in r.body, false, 'endpoint publik tidak boleh kirim cerita');
});
test('tiket palsu → 404', async () => {
  assert.equal((await P('/api/pengaduan/PN-00000000-AAAA', { method: 'GET' })).status, 404);
});
test('konselor lihat daftar (login)', async () => {
  const c = await login();
  const r = await P('/api/pengaduan', { method: 'GET', cookie: c });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body));
});
test('daftar tanpa login → 401', async () => {
  assert.equal((await P('/api/pengaduan', { method: 'GET' })).status, 401);
});
test('konselor baca detail berisi cerita + status flow', async () => {
  const c = await login();
  const b = (await P('/api/pengaduan', { body: { untuk: 'Diri sendiri', kategori: 'x', cerita: 'rahasia sekali' } })).body;
  const d = await P('/api/pengaduan/' + b.no_tiket + '/detail', { method: 'GET', cookie: c });
  assert.equal(d.body.cerita, 'rahasia sekali');
  const u = await P('/api/pengaduan/' + b.no_tiket + '/status', { method: 'PATCH', cookie: c, body: { status: 'Ditinjau' } });
  assert.equal(u.body.status, 'Ditinjau');
  const bad = await P('/api/pengaduan/' + b.no_tiket + '/status', { method: 'PATCH', cookie: c, body: { status: 'BOGUS' } });
  assert.equal(bad.status, 400);
});
```

**Verifikasi:**
```bash
cd backend && node --test tests/pengaduan.test.js
# expect: tests 7 passed
```

### FASE 4 — WebSocket chat real-time (PDF 3.1)

#### T4.1 — `backend/src/ws.js` — chat 2 peran: anonim (tiket) & konselor (JWT)

```js
// backend/src/ws.js
const { WebSocketServer } = require('ws');
const { verifikasiJWT } = require('./security');
const { encrypt, decrypt } = require('./security');
const db = require('./db');
const audit = require('./audit');

function pasang(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const klien = new Set(); // {tiket?, konselor?, ws}

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://x');
    const tiket = url.searchParams.get('tiket');      // anonim: cukup no_tiket
    const token = url.searchParams.get('token');      // konselor: JWT
    let sesi = {};

    if (token) {
      try {
        const j = verifikasiJWT(token);
        const k = db.prepare('SELECT id,username,nama,peran,aktif FROM konselor WHERE id=?').get(j.id);
        if (!k || !k.aktif) return ws.close(4001, 'akun nonaktif');
        sesi.konselor = k;
      } catch { return ws.close(4001, 'token tidak valid'); }
    } else if (tiket) {
      const p = db.prepare('SELECT no_tiket FROM pengaduan WHERE no_tiket=?').get(tiket);
      if (!p) return ws.close(4004, 'tiket tidak ditemukan');
      sesi.tiket = tiket;
    } else return ws.close(4000, 'butuh tiket atau token');

    const klienSesi = { ...sesi, ws };
    klien.add(klienSesi);
    ws.on('close', () => klien.delete(klienSesi));

    // kirim history pesan tiket ini
    const tujuan = sesi.tiket || null;
    if (tujuan) kirimHistory(ws, tujuan);

    ws.on('message', (data) => {
      let m;
      try { m = JSON.parse(data); } catch { return ws.send(JSON.stringify({ error: 'json tidak valid' })); }
      if (m.type !== 'pesan' || !String(m.isi || '').trim()) return;
      if (String(m.isi).length > 2000) return ws.send(JSON.stringify({ error: 'pesan maksimal 2000 karakter' }));
      if (!m.tiket) return;

      const p = db.prepare('SELECT no_tiket FROM pengaduan WHERE no_tiket=?').get(m.tiket);
      if (!p) return ws.send(JSON.stringify({ error: 'tiket tidak ditemukan' }));

      // anonim HANYA bisa kirim ke tiketnya sendiri
      if (sesi.tiket && sesi.tiket !== m.tiket) return ws.send(JSON.stringify({ error: 'tidak diizinkan' }));

      const pengirim = sesi.konselor ? 'konselor' : 'user';
      const sekarang = Date.now();
      db.prepare('INSERT INTO pesan (no_tiket, pengirim, pengirim_id, isi_enc, dibuat) VALUES (?,?,?,?,?)')
        .run(m.tiket, pengirim, sesi.konselor ? sesi.konselor.id : null, encrypt(String(m.isi)), sekarang);

      const payload = JSON.stringify({ type: 'pesan', tiket: m.tiket, pengirim, isi: String(m.isi), dibuat: sekarang });
      // kirim ke pengirim + semua klien yang relevan (pemilik tiket / konselor di tiket itu)
      for (const k of klien) {
        const relevan = k.konselor ? true : (k.tiket === m.tiket);
        if (relevan && k.ws.readyState === 1) k.ws.send(payload);
      }
      audit.catat(sesi.konselor ? sesi.konselor.username : `user:${m.tiket}`,
                  'KIRIM_PESAN', `${m.tiket} dari=${pengirim}`, req.socket.remoteAddress);
    });
  });
}

function kirimHistory(ws, tiket) {
  const rows = db.prepare('SELECT pengirim, isi_enc, dibuat FROM pesan WHERE no_tiket=? ORDER BY dibuat ASC').all(tiket);
  ws.send(JSON.stringify({ type: 'history', tiket, pesan: rows.map(r => ({ pengirim: r.pengirim, isi: decrypt(r.isi_enc), dibuat: r.dibuat })) }));
}

module.exports = { pasang };
```

**Test** — `backend/tests/chat.test.js` (WS via raw `ws` client):
```js
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { pasang } = require('../src/ws');
const db = require('../db');
const { hashSandi, buatJWT, encrypt } = require('../security');

let server, base, app;
test.before(async () => {
  db.prepare('DELETE FROM pesan').run(); db.prepare('DELETE FROM pengaduan').run(); db.prepare('DELETE FROM konselor').run();
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(1, 'dr.sari', 'dr. Sari', await hashSandi('rahasia123'), 'konselor', 1, 0, Date.now());
  db.prepare('INSERT INTO pengaduan (no_tiket,untuk,kategori,cerita_enc,status,dibuat) VALUES (?,?,?,?,?,?)')
    .run('PN-20260101-AAAA', 'Diri sendiri', 'x', encrypt('cerita'), 'Diterima', Date.now());
  app = express().use(express.json());
  server = http.createServer(app);
  pasang(server);
  await new Promise(r => server.listen(0, r));
  base = 'ws://localhost:' + server.address().port;
});
test.after(() => server.close());

function buka(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}
function terima(ws, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    ws.on('message', d => { clearTimeout(t); resolve(JSON.parse(d.toString())); });
  });
}
function kirim(ws, obj) { ws.send(JSON.stringify(obj)); }

test('anonim konek pakai tiket valid', async () => {
  const ws = await buka(`${base}/ws?tiket=PN-20260101-AAAA`);
  const m = await terima(ws);            // history (kosong)
  assert.equal(m.type, 'history');
  ws.close();
});
test('anonim konek tanpa tiket → ditolak', async () => {
  await assert.rejects(() => buka(`${base}/ws`), Error);
});
test('konselor konek pakai JWT', async () => {
  const token = buatJWT({ id: 1, peran: 'konselor' });
  const ws = await buka(`${base}/ws?token=${token}`);
  assert.equal(ws.readyState, WebSocket.OPEN);
  ws.close();
});
test('konselor kirim pesan, anonim terima (real-time)', async () => {
  const token = buatJWT({ id: 1, peran: 'konselor' });
  const [wK, wU] = await Promise.all([
    buka(`${base}/ws?token=${token}`),
    buka(`${base}/ws?tiket=PN-20260101-AAAA`),
  ]);
  await terima(wU);                       // skip history
  kirim(wK, { type: 'pesan', tiket: 'PN-20260101-AAAA', isi: 'halo, saya konselor' });
  const m = await terima(wU);
  assert.equal(m.type, 'pesan');
  assert.equal(m.isi, 'halo, saya konselor');
  assert.equal(m.pengirim, 'konselor');
  wK.close(); wU.close();
});
test('pesan tersimpan terenkripsi di DB', async () => {
  const row = db.prepare('SELECT isi_enc FROM pesan WHERE no_tiket=? ORDER BY id DESC LIMIT 1`).get('PN-20260101-AAAA');
  assert.ok(!row.isi_enc.includes('halo, saya konselor'), 'isi_enc harus ciphertext');
});
test('anonim tidak bisa kirim ke tiket orang lain', async () => {
  db.prepare('INSERT INTO pengaduan (no_tiket,untuk,kategori,cerita_enc,status,dibuat) VALUES (?,?,?,?,?,?)')
    .run('PN-20260101-BBBB', 'Diri sendiri', 'x', encrypt('c'), 'Diterima', Date.now());
  const wA = await buka(`${base}/ws?tiket=PN-20260101-AAAA`);
  await terima(wA);
  kirim(wA, { type: 'pesan', tiket: 'PN-20260101-BBBB', isi: 'merusak' });
  const m = await terima(wA);
  assert.equal(m.error, 'tidak diizinkan');
  wA.close();
});
```

**Verifikasi:**
```bash
cd backend && node --test tests/chat.test.js
# expect: tests 6 passed
```

### FASE 5 — Dashboard konselor + admin + direktori layanan (PDF 3.7)

#### T5.1 — `backend/src/routes/dashboard.js` — statistik + antrian + filter

```js
// backend/src/routes/dashboard.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { butuhKonselor, butuhAdmin } = require('../deps');

// GET /api/dashboard/stats — ringkasan untuk dashboard konselor
router.get('/stats', butuhKonselor, (req, res) => {
  const total = db.prepare('SELECT COUNT(*) c FROM pengaduan').get().c;
  const baru = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Diterima'").get().c;
  const aktif = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Ditinjau' OR status='Dalam Penanganan'").get().c;
  const selesai = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE status='Selesai'").get().c;
  const belumDibaca = db.prepare("SELECT COUNT(*) c FROM pengaduan WHERE dibaca=0").get().c;
  res.json({ total, baru, aktif, selesai, belumDibaca });
});

// GET /api/dashboard/antrian — daftar tiket dengan filter status + pagination
router.get('/antrian', butuhKonselor, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;
  const status = req.query.status;
  const q = status
    ? db.prepare('SELECT * FROM pengaduan WHERE status=? ORDER BY dibaca ASC, dibuat DESC LIMIT ? OFFSET ?').all(status, limit, offset)
    : db.prepare('SELECT * FROM pengaduan ORDER BY dibaca ASC, dibuat DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = status
    ? db.prepare('SELECT COUNT(*) c FROM pengaduan WHERE status=?').get(status).c
    : db.prepare('SELECT COUNT(*) c FROM pengaduan').get().c;
  res.json({ total, items: q.map(p => ({
    no_tiket: p.no_tiket, untuk: p.untuk, kategori: p.kategori, status: p.status,
    dibuat: p.dibuat, diperbarui: p.diperbarui, dibaca: !!p.dibaca,
  })) });
});

// GET /api/dashboard/audit — admin saja: log audit (auditabilitas PDF 3.8)
router.get('/audit', butuhAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
  res.json(rows);
});

module.exports = router;
```

**Test** — `backend/tests/dashboard.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const r_dashboard = require('../src/routes/dashboard');
const r_auth = require('../src/routes/auth');
const db = require('../db');
const { hashSandi } = require('../security');

let base, server;
test.before(async () => {
  db.prepare('DELETE FROM audit_log').run(); db.prepare('DELETE FROM pengaduan').run(); db.prepare('DELETE FROM konselor').run();
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(1, 'admin', 'Admin', await hashSandi('admin123'), 'admin', 1, 0, Date.now());
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(2, 'dr.sari', 'dr. Sari', await hashSandi('rahasia123'), 'konselor', 1, 0, Date.now());
  db.prepare('INSERT INTO pengaduan (no_tiket,untuk,kategori,cerita_enc,status,dibuat,dibaca) VALUES (?,?,?,?,?,?,?)')
    .run('PN-20260101-AAAA', 'Diri sendiri', 'x', 'enc', 'Diterima', Date.now(), 0);
  const app = express().use(express.json()).use(cookieParser())
    .use('/api/dashboard', r_dashboard).use('/api/auth', r_auth);
  server = app.listen(0); base = 'http://localhost:' + server.address().port;
});
test.after(() => server.close());
async function login(u, s) {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, sandi: s }) });
  return r.headers.get('set-cookie').split(';')[0];
}
async function G(path, cookie) {
  const r = await fetch(base + path, { headers: cookie ? { cookie } : {} });
  return { status: r.status, body: await r.json() };
}

test('konselor lihat stats', async () => {
  const c = await login('dr.sari', 'rahasia123');
  const r = await G('/api/dashboard/stats', c);
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.baru, 1);
  assert.equal(r.body.belumDibaca, 1);
});
test('antrian: filter status jalan', async () => {
  const c = await login('dr.sari', 'rahasia123');
  const a = await G('/api/dashboard/antrian', c);
  assert.equal(a.body.total, 1);
  assert.equal(a.body.items[0].no_tiket, 'PN-20260101-AAAA');
  const b = await G('/api/dashboard/antrian?status=Selesai', c);
  assert.equal(b.body.total, 0);
});
test('audit: admin 200, konselor 403', async () => {
  const ca = await login('admin', 'admin123');
  const ra = await G('/api/dashboard/audit', ca);
  assert.equal(ra.status, 200);
  const ck = await login('dr.sari', 'rahasia123');
  const rk = await G('/api/dashboard/audit', ck);
  assert.equal(rk.status, 403);
});
```

**Verifikasi:**
```bash
cd backend && node --test tests/dashboard.test.js
# expect: tests 3 passed
```

#### T5.2 — `backend/src/routes/layanan.js` — direktori layanan rujukan (publik)

Isi tabel `layanan` sesuai PDF (BNN 188, Medis 119, Polri 110, Puskesmas terdekat) — sumber data asli, bukan placeholder.

```js
// backend/src/routes/layanan.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/layanan — publik, tanpa login (anonim boleh lihat)
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT nama, jenis, kontak, deskripsi, urutan FROM layanan ORDER BY urutan ASC').all();
  res.json(rows);
});

module.exports = router;
```

**Seed** — `backend/src/seedLayanan.js`:
```js
const db = require('./db');
const LAYANAN = [
  { nama: 'BNN', jenis: 'darurat', kontak: '188', deskripsi: 'Layanan terpadu 24 jam untuk penanganan penyalahgunaan napza.', urutan: 1 },
  { nama: 'Medis / Ambulans', jenis: 'darurat', kontak: '119', deskripsi: 'Untuk overdosis atau kondisi medis darurat.', urutan: 2 },
  { nama: 'Polri', jenis: 'darurat', kontak: '110', deskripsi: 'Untuk laporan tindak pidana atau situasi tidak aman.', urutan: 3 },
  { nama: 'Puskesmas', jenis: 'rujukan', deskripsi: 'Cek kesehatan dan layanan konseling dasar tanpa biaya.', urutan: 4 },
];
if (db.prepare('SELECT COUNT(*) c FROM layanan').get().c === 0) {
  const stmt = db.prepare('INSERT INTO layanan (nama,jenis,kontak,deskripsi,urutan) VALUES (?,?,?,?,?)');
  LAYANAN.forEach(l => stmt.run(l.nama, l.jenis, l.kontak || null, l.deskripsi, l.urutan));
  console.log('seed layanan: ' + LAYANAN.length + ' baris');
}
```

**Test** — `backend/tests/layanan.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const r_layanan = require('../src/routes/layanan');
require('../src/seedLayanan');

const app = express().use('/api/layanan', r_layanan);
const server = app.listen(0);
const base = 'http://localhost:' + server.address().port;

test('publik lihat daftar layanan', async () => {
  const r = await fetch(base + '/api/layanan');
  const b = await r.json();
  assert.equal(r.status, 200);
  assert.ok(b.length >= 3);
  assert.equal(b[0].kontak, '188');
});
test.after(() => server.close());
```

**Verifikasi:**
```bash
cd backend && node --test tests/layanan.test.js
# expect: tests 1 passed
```

### FASE 6 — Frontend: sambungkan ke backend nyata (PDF 3.1–3.8)

> **Prinsip:** semua interaksi sekarang memanggil API. Pesan chat **jujur** — "dibaca konselor manusia, bukan bot". UI harus tetap memakai komponen neomorphism yang sudah ada (`.neo-select`, `.neo-stepper`, `.btn-primary`, `.card`, dsb) — jangan buat kelas baru.

#### T6.1 — `js/api.js` — wrapper fetch (BASE_URL dari window.location)

```js
// js/api.js
const API = (location.port === '3000' || location.hostname === 'localhost')
  ? 'http://localhost:3000/api' : '/api';

async function api(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = { error: 'respons server tidak valid' }; }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function uploadPengaduan(payload) { return api('/pengaduan', { method: 'POST', body: payload }); }
async function cekTiket(no_tiket) { return api('/pengaduan/' + no_tiket); }
async function daftarLayanan() { return api('/layanan'); }
```

#### T6.2 — `js/form.js` — ganti logika palsu form pengaduan

Hapus seluruh `setTimeout`/`Math.random()` palsu. Sambungkan ke `uploadPengaduan`:

```js
// js/form.js  (menggantikan blok form pengaduan di js/script.js)
import { uploadPengaduan } from './api.js';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!form.dataset.submitting) {
    form.dataset.submitting = '1';
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Mengirim...';
    try {
      const { no_tiket, status } = await uploadPengaduan({
        untuk: select('untuk').value,
        kategori: select('kategori').value,
        frekuensi: select('frekuensi').value,
        usia: Number(stepper('usia').textContent) || null,
        cerita: document.getElementById('cerita').value.trim(),
        kontak: document.getElementById('kontak').value.trim() || null,
      });
      hasilTiket.innerHTML = `Nomor tiket kamu: <strong>${no_tiket}</strong> — status <strong>${status}</strong>. Simpan nomor ini untuk cek status & chat dengan konselor.`;
      hasilTiket.hidden = false;
      sessionStorage.setItem('tiket-aktif', no_tiket);
      form.reset();
      btnSubmit.textContent = 'Laporan terkirim';
    } catch (err) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Coba lagi';
      hasilTiket.textContent = 'Gagal mengirim: ' + err.message;
      hasilTiket.hidden = false;
    } finally {
      delete form.dataset.submitting;
    }
  }
});
```

**Verifikasi manual:** buka `index.html#form` lewat `http://localhost:3000`, isi form, submit → muncul nomor tiket format `PN-YYYYMMDD-XXXX` (bukan fake). Cek DB: `node -e "const db=require('./src/db');console.log(db.prepare('SELECT no_tiket,status,cerita_enc FROM pengaduan').all())"` → baris baru, `cerita_enc` berisi ciphertext base64 AES-256-GCM (bukan teks polos).

#### T6.3 — `js/cek-status.js` — cek tiket nyata

```js
// js/cek-status.js
import { cekTiket } from './api.js';

btnCek.addEventListener('click', async () => {
  const no = inputTiket.value.trim().toUpperCase();
  if (!/^PN-\d{8}-[0-9A-F]{4}$/.test(no)) {
    hasilCek.textContent = 'Format nomor tiket salah. Contoh: PN-20260101-A1B2.';
    hasilCek.hidden = false;
    return;
  }
  try {
    const p = await cekTiket(no);
    hasilCek.innerHTML = `Status tiket <strong>${p.no_tiket}</strong>: <strong>${p.status}</strong>. ${p.status === 'Selesai' ? 'Penanganan selesai. Terima kasih sudah berbagi.' : 'Konselor sedang meninjau laporan kamu.'}`;
    sessionStorage.setItem('tiket-aktif', no);
    tombolChat.hidden = false; // buka akses chat
  } catch (err) {
    hasilCek.textContent = 'Tiket tidak ditemukan. Periksa kembali nomor tiketmu.';
    hasilCek.hidden = false;
  }
});
```

#### T6.4 — `js/chat-ws.js` — WebSocket chat pemegang tiket (anonim)

```js
// js/chat-ws.js  (menggantikan balasan otomatis bot palsu di js/script.js)
const tiket = sessionStorage.getItem('tiket-aktif');
const WS = (location.hostname === 'localhost') ? 'ws://localhost:3000/ws' : `wss://${location.host}/ws`;
let ws = null;

function bukaChat() {
  if (!tiket) return;
  ws = new WebSocket(`${WS}?tiket=${encodeURIComponent(tiket)}`);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'history') {
      m.pesan.forEach(tambahPesan);
    } else if (m.type === 'pesan') {
      tambahPesan(m);
    } else if (m.error) {
      tambahPesan({ pengirim: 'sistem', isi: m.error });
    }
  };
  ws.onclose = () => tambahPesan({ pengirim: 'sistem', isi: 'Sambungan terputus. Muat ulang halaman untuk menyambung lagi.' });
}

btnKirim.addEventListener('click', kirim);
inputChat.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kirim(); } });

function kirim() {
  const isi = inputChat.value.trim();
  if (!isi || !ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'pesan', tiket, isi }));
  inputChat.value = '';
}

function tambahPesan(m) {
  const el = document.createElement('div');
  el.className = 'chat-bubble chat-' + m.pengirim;
  el.textContent = m.isi; // textContent = anti-XSS
  areaChat.appendChild(el);
  areaChat.scrollTop = areaChat.scrollHeight;
}

disclaimer.textContent = 'Pesan kamu dibaca dan dibalas oleh konselor manusia, bukan bot. Jawaban bisa membutuhkan waktu.';
```

**Peringatan kejujuran wajib** (PDF 3.1): tidak boleh ada tulisan "AI akan membalas" atau balasan instan palsu. Hanya disclaimer di atas.

#### T6.5 — `konselor/login.html` + `konselor/dashboard.html` — halaman baru

Struktur halaman login (neomorphism, field `username` + `sandi`, POST `/api/auth/login`, redirect `dashboard.html` saat 200):

```html
<!-- konselor/login.html -->
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Login Konselor — Ruang Pulih</title>
  <link rel="stylesheet" href="/css/style.css">
  <style>
    .login-wrap { max-width: 420px; margin: 96px auto; padding: 40px; border-radius: 24px;
      background: var(--bg); box-shadow: var(--neo-out); }
    .login-wrap h1 { font-size: 1.5rem; margin-bottom: 8px; }
    .login-wrap p { color: var(--muted); margin-bottom: 24px; }
    .login-wrap label { display: block; font-size: 0.9rem; margin: 16px 0 6px; }
    .login-wrap input { width: 100%; padding: 12px 14px; border: 0; border-radius: 12px;
      background: var(--bg); box-shadow: var(--neo-in); font: inherit; }
    .err { color: #c62828; margin-top: 12px; min-height: 1.2em; }
  </style>
</head>
<body>
  <main class="login-wrap">
    <h1>Login Konselor</h1>
    <p>Area ini hanya untuk konselor Ruang Pulih.</p>
    <form id="formLogin">
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required>
      <label for="sandi">Sandi</label>
      <input id="sandi" name="sandi" type="password" autocomplete="current-password" required>
      <p class="err" id="err"></p>
      <button class="btn-primary" type="submit" style="width:100%;margin-top:16px">Masuk</button>
    </form>
  </main>
  <script type="module" src="/js/konselor-login.js"></script>
</body>
</html>
```

```js
// js/konselor-login.js
const form = document.getElementById('formLogin');
const err = document.getElementById('err');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  err.textContent = '';
  try {
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: form.username.value, sandi: form.sandi.value }),
    });
    location.href = '/konselor/dashboard.html';
  } catch { err.textContent = 'Username atau sandi salah.'; }
});
```

Dashboard (`konselor/dashboard.html`): kartu statistik (total / baru / aktif / selesai), tabel antrian (`GET /api/dashboard/antrian`), filter status, tombol "Baca detail" (membuka modal dengan cerita didekripsi dari `/api/pengaduan/:tiket/detail`), panel chat (WebSocket pakai JWT), tombol ubah status (`PATCH`), dan menu admin (kelola akun + audit log) yang hanya tampil untuk `peran=admin`.

#### T6.6 — `js/script.js` — bersihkan sisa logika palsu

Hapus: fungsi `kirimChatPalsu`, array `jawabanOtomatis`, `setTimeout` form, semua `sessionStorage` demo, dan hardcode `PN-20261001-PNGS`. Ganti dengan `import` dari modul T6.2–T6.4. Ubah `js/script.js` jadi ES module (`<script type="module">`) supaya `import` jalan.

**Verifikasi:**
```bash
cd backend && node --test tests/*.test.js          # semua test backend hijau
node src/server.js                                   # server jalan di :3000
```
Buka `http://localhost:3000/` → DevTools Console: **0 error**. Test alur lengkap manual: submit form → dapat tiket → cek status → chat → balasan muncul real-time di dashboard konselor (buka 2 tab).

### FASE 7 — Revamp UI: whitespace, pangkas teks, neomorphism kuat, anti-AI-slop

> Keluhan utama user: *"ui masih sangat pasaran dan simple, terlalu banyak text yang ga penting juga (gabakal kebaca sama user, user ga bakal peduli), layout juga sempit sempit (minim whitespace)"*. Fase ini memperbaiki **semua** itu. Target verifikasi: audit fresh-eyes baru skor 10/10.

#### T7.1 — `css/style.css` — perlebar container & padding section

```css
/* GANTI token lama di :root */
:root {
  --container: 1240px;      /* dari 1080px — layout lebih lega */
  --pad-section: 72px;      /* dari 40-48px — napas vertikal */
  --neo-blur: 9px;          /* shadow neumorphism lebih dalam */
  --neo-blur-min: 4px;
}
.container { max-width: var(--container); margin-inline: auto; padding-inline: 32px; }
section { padding-block: var(--pad-section); }
@media (max-width: 720px) { .container { padding-inline: 20px; } section { padding-block: 56px; } }
```

**Verifikasi:** `grep -n "max-width" css/style.css` → semua `max-width` container pakai `var(--container)`.

#### T7.2 — Pita darurat tunggal (ganti 4 kartu hotline)

Audit menemukan 4 kartu hotline identik (pola AI-slop). Ganti seluruh grid `.hotline-grid` jadi **satu banner**:

```html
<!-- index.html: ganti <section id="hotline"> ... </section> -->
<section id="hotline">
  <div class="container">
    <div class="pita-darurat">
      <div class="pita-teks">
        <span class="sec-num">03</span>
        <h2 class="section-head">Kalau bahaya terjadi sekarang</h2>
        <p>Hubungi langsung. BNN <strong>188</strong> · Medis <strong>119</strong> · Polri <strong>110</strong>. Semua layanan gratis dan rahasia.</p>
      </div>
      <div class="pita-cta">
        <a class="btn-primary" href="tel:188">Telepon 188</a>
      </div>
    </div>
  </div>
</section>
```

```css
/* css/style.css — tambah */
.pita-darurat {
  display: flex; align-items: center; justify-content: space-between; gap: 32px;
  padding: 40px 48px; border-radius: 28px;
  background: var(--bg); box-shadow: var(--neo-out);
}
.pita-teks h2 { margin: 12px 0 8px; }
.pita-teks p { max-width: 56ch; line-height: 1.6; }
@media (max-width: 840px) { .pita-darurat { flex-direction: column; align-items: flex-start; } .pita-cta { width: 100%; } }
```

Hapus paragraf panjang penjelas hotline di bawahnya (yang "gabakal kebaca sama user").

#### T7.2b — Pecah simetri `.program-grid` (residual audit ronde-3, skor 9/10)

Audit fresh-eyes menandai `.program-grid` (`repeat(4,1fr)`, 4 kartu struktur identik) sebagai residual AI-slop. Di `css/style.css`, ganti grid 4 kolom rata jadi grid asimetris 6-kolom dengan span berbeda:

```css
.program-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);   /* bukan repeat(4,1fr) */
  gap: 24px;
}
.program-card:nth-child(1) { grid-column: span 3; }   /* kartu utama lebih besar */
.program-card:nth-child(2) { grid-column: span 3; }
.program-card:nth-child(3) { grid-column: span 2; }
.program-card:nth-child(4) { grid-column: span 2; }
.program-card:nth-child(5) { grid-column: span 2; }
.program-card:not(:first-child) { opacity: 0.95; }
@media (max-width: 980px) { .program-grid { grid-template-columns: repeat(2,1fr); } .program-card { grid-column: span 2 !important; } }
@media (max-width: 600px) { .program-grid { grid-template-columns: 1fr; } }
```

**Plus hapus ikon identik di tiap kartu** — ganti dengan nomor besar (`01`, `02`, `03`) atau tanpa hiasan sama sekali. Ikon SVG/emoji yang sama di 4-5 kartu adalah tanda AI-slop paling jelas.

**Verifikasi:** `grep -n "program-grid" css/style.css` → hanya definisi baru. Screenshot mobile & desktop → tidak ada baris kartu identik.

#### T7.3 — Naikkan ketebalan neomorphism & target ketuk

```css
/* Semua shadow neumorphism: 6px → 9px (lebih melekat, perinta user) */
:root {
  --neo-out: -9px -9px 18px rgba(255,255,255,.7), 9px 9px 18px rgba(55,84,134,.28);
  --neo-in:  inset -6px -6px 12px rgba(255,255,255,.7), inset 6px 6px 12px rgba(55,84,134,.24);
}
/* dark mode */
[data-theme="dark"] {
  --neo-out: -9px -9px 18px rgba(6,10,20,.85), 9px 9px 18px rgba(0,0,0,.6);
  --neo-in:  inset -6px -6px 12px rgba(10,16,30,.9), inset 6px 6px 12px rgba(0,0,0,.55);
}
/* Target ketuk ≥44px (a11y + mobile) */
button, .btn-primary, .neo-select, .neo-stepper button, input, textarea {
  min-height: 44px;
}
.neo-stepper button { min-width: 44px; }
```

#### T7.4 — Pangkas teks section (≤80 kata per section)

Untuk setiap section di `index.html`: hapus paragraf penjelas lebih dari 2 baris, sisakan headline + 1-2 kalimat + elemen interaktif. Contoh Section Rehabilitasi (dari plan lama):

> **Sebelum:** 3 paragraf panjang tentang tahap rehabilitasi, durasi, pendekatan tim, jenis terapi (gabakal kebaca user).
> **Sesudah:** headline + 1 kalimat + grid 3 kartu singkat (Detoksifikasi, Terapi, Dukungan keluarga), masing-masing 1 baris.

**Verifikasi terprogram:**
```bash
node -e "
const fs=require('fs');
const h=fs.readFileSync('index.html','utf8');
for (const [nama,html] of h.split('<section').slice(1).map(s=>[s.match(/id=\"[^\"]+\"/)[0], '<section'+s])) {
  const kata = html.replace(/<[^>]+>/g,' ').trim().split(/\s+/).length;
  if (kata>80) console.log('OVER:',nama,kata);
}
console.log('cek selesai — baris OVER harus kosong');
"
```

#### T7.5 — Audit fresh-eyes anti-AI-slop (wajib skor 10/10)

Jalankan ulang audit DOM (sama seperti audit ronde-3 yang hasilnya 9/10) via subagent browser. Semua 10 pola harus **absent**:
gradient text, glassmorphism, eyebrow label generik, kartu identik berikon, stat banner tanpa sumber, serba centered, satu font, logo strip, slop vocab (seamless/empowering/dll), testimonial/FAQ template.

**Verifikasi:** `humanityScore = 10` dari audit script. Kalau masih ada residual, kerjakan ulang task T7.x yang relevan.

### FASE 8 — Hardening keamanan (rate limit, security headers, minimisasi data)

#### T8.1 — `backend/src/middleware/rateLimit.js` — sederhana, in-memory

```js
// backend/src/middleware/rateLimit.js
module.exports = function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map(); // ip -> [timestamps]
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'x';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
    arr.push(now); hits.set(ip, arr);
    next();
  };
};
```

Pasang di `src/server.js`:
```js
const rateLimit = require('./middleware/rateLimit');
app.use('/api/auth/login', rateLimit({ windowMs: 60_000, max: 5 }));   // login: 5x/menit
app.use('/api/pengaduan', rateLimit({ windowMs: 60_000, max: 10 }));   // pengaduan: 10x/menit
app.use('/api', rateLimit());                                          // umum: 30x/menit
```

#### T8.2 — `backend/src/middleware/securityHeaders.js` — helmet-style manual

```js
// backend/src/middleware/securityHeaders.js
module.exports = function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');              // anti clickjacking
  res.setHeader('Referrer-Policy', 'no-referrer');       // jangan bocor referrer
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  // CSP: tidak ada inline script selain yang diizinkan; WebSocket diizinkan dari origin sendiri
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss:",
  ].join('; '));
  next();
};
```
Pasang pertama di `server.js`: `app.use(securityHeaders)`.

#### T8.3 — Minimisasi data + logika server-side

- Endpoint publik `GET /api/pengaduan/:tiket` **tidak** mengembalikan `cerita` (lihat T3.1 — sudah benar, jangan diubah).
- Hapus sisa artifact lama dari fase scaffold batal: `backend/venv/`, file `.py`, `requirements.txt`, `.env` python — semua HARUS sudah hilang. Hapus data demo hardcoded dari frontend (`PN-20261001-PNGS`).
- Cookie JWT: `httpOnly; secure (produksi); sameSite=strict; maxAge=8 jam`.
- `.env` **tidak boleh** ter-commit. `git status --porcelain backend/.env` harus kosong.

#### T8.4 — `backend/tests/security.test.js` — 5 test keamanan wajib

```js
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const r_auth = require('../src/routes/auth');
const r_pengaduan = require('../src/routes/pengaduan');
const db = require('../db');
const { hashSandi } = require('../security');

let base, server;
test.before(async () => {
  db.prepare('DELETE FROM pengaduan').run(); db.prepare('DELETE FROM konselor').run();
  db.prepare('INSERT INTO konselor (id,username,nama,sandi_hash,peran,aktif,gagal,dibuat) VALUES (?,?,?,?,?,?,?,?)')
    .run(1, 'dr.sari', 'dr. Sari', await hashSandi('rahasia123'), 'konselor', 1, 0, Date.now());
  const app = express().use(express.json()).use(cookieParser())
    .use('/api/auth', r_auth).use('/api/pengaduan', r_pengaduan);
  server = app.listen(0); base = 'http://localhost:' + server.address().port;
});
test.after(() => server.close());

test('1. sandi bocor? hash bcrypt di DB, bukan polos', () => {
  const row = db.prepare('SELECT sandi_hash FROM konselor WHERE username=?').get('dr.sari');
  assert.ok(row.sandi_hash.startsWith('$2'), 'harus bcrypt hash');
  assert.ok(!row.sandi_hash.includes('rahasia123'));
});
test('2. brute force: 5x sandi salah → akun terkunci (lockout)', async () => {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'dr.sari', sandi: 'salah' }) });
    assert.equal(r.status, 401);
  }
  const r5 = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'dr.sari', sandi: 'salah' }) });
  const b5 = await r5.json();
  assert.equal(r5.status, 401);
  assert.match(b5.error, /terkunci|kunci/i, 'harus ada pesan terkunci setelah 5x gagal');
  const k = db.prepare('SELECT gagal,aktif FROM konselor WHERE username=?').get('dr.sari');
  assert.equal(k.aktif, 0, 'akun nonaktif setelah lockout');
});
test('3. endpoint konselor tanpa cookie → 401 (tidak bocor data)', async () => {
  const r = await fetch(base + '/api/pengaduan');
  assert.equal(r.status, 401);
  assert.ok(!(await r.json()).items, 'tidak boleh ada data tiket');
});
test('4. cookie HttpOnly (XSS tidak bisa baca token)', async () => {
  const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'dr.sari', sandi: 'rahasia123' }) });
  // reset lockout dulu dengan aktifkan ulang via DB (test-only)
  db.prepare('UPDATE konselor SET aktif=1, gagal=0 WHERE username=?').run('dr.sari');
  const set = r.headers.get('set-cookie') || '';
  assert.match(set, /HttpOnly/i, 'cookie harus HttpOnly');
});
test('5. cerita pengaduan tidak bisa diakses publik (hanya metadata)', async () => {
  const b = await (await fetch(base + '/api/pengaduan', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ untuk: 'x', kategori: 'x', cerita: 'rahasia besar' } }) }).json();
  const r = await fetch(base + '/api/pengaduan/' + b.no_tiket);
  const j = await r.json();
  assert.equal('cerita' in j, false, 'publik tidak boleh lihat cerita');
  const enc = db.prepare('SELECT cerita_enc FROM pengaduan WHERE no_tiket=?').get(b.no_tiket);
  assert.ok(!enc.cerita_enc.includes('rahasia besar'), 'DB harus terenkripsi');
});
```

**Verifikasi:**
```bash
cd backend && node --test tests/*.test.js
# expect: total tests ~22, 0 fail
```

### FASE 9 — Rintisan AI chat (deferred, jangan dikerjakan sekarang)

Router chat WebSocket (T4.1) sudah punya field `pengirim: 'user'|'konselor'`. Nanti tinggal tambah mode `'ai'` + provider (OpenRouter) di satu tempat saja (`src/ws.js` handler `message`), tanpa mengubah frontend. **Tidak ada task di fase ini** — YAGNI.

---

## 5. Risiko, tradeoffs, dan pertanyaan terbuka

**Risiko:**
1. **better-sqlite3 build native** — butuh toolchain C++ saat `npm install`. Mitigasi: node 24 sudah punya `node:sqlite` bawaan; kalau install gagal, fallback ke `node:sqlite` (API mirip: `dbSync.prepare().all()`).
2. **WebSocket di production** — butuh reverse proxy (nginx) yang support `Upgrade`. Mitigasi: untuk dev single-machine tidak masalah.
3. **`.env` terlupa saat deploy** — server langsung crash di startup (bagus, fail-loud). Mitigasi: dokumentasi deploy di README.
4. **Rate limit in-memory** — reset tiap restart, tidak shared antar instance. Mitigasi: cukup untuk skala 1 server.
5. **AES-256-GCM key rotation** — tidak ada (YAGNI). Kalau nanti butuh, tambah kolom `key_version`.

**Pertanyaan terbuka (sudah diputuskan, tinggal eksekusi):**
1. ~~Stack backend?~~ → **Node.js + Express + SQLite** (keputusan user).
2. ~~WebSocket vs polling?~~ → **WebSocket real-time** (`ws` library) — pengalaman seperti WhatsApp, konselor lihat tiket baru langsung.
3. ~~2FA?~~ → **username + sandi dulu** (bcrypt + JWT cookie). TOTP bisa ditambah belakangan di `src/routes/auth.js`.
4. ~~Fitur artikel/edukasi (PDF 3.4)?~~ → **skip (YAGNI)**. Fokus: pengaduan + chat + dashboard.

---

## 6. Urutan eksekusi (subagent-driven development)

Setiap fase = 1 subagent batch. Commit setelah test hijau:

| Fase | Isi | Test |
|---|---|---|
| 0 | scaffold + `.env` + git | server jalan "Ruang Pulih API" |
| 1 | config, security (AES-256-GCM, bcrypt, JWT), db, audit | tests/security-base |
| 2 | auth konselor (login, lockout, seed) | tests/auth |
| 3 | API pengaduan publik + status flow | tests/pengaduan |
| 4 | WebSocket chat 2 peran | tests/chat |
| 5 | dashboard + admin + layanan | tests/dashboard, tests/layanan |
| 6 | frontend → API nyata + halaman konselor | 0 error console, alur manual |
| 7 | revamp UI (T7.1–T7.5) | audit fresh-eyes 10/10 |
| 8 | hardening (rate limit, headers, security tests) | tests/security 5/5 |

**Standar kode (DRY/YAGNI/TDD):**
- Tiap file ≤ 200 baris. Fungsi ≤ 30 baris. Tidak ada komentar yang menjelaskan "what", hanya "why".
- Naming bahasa Indonesia untuk domain (`buatTiket`, `butuhKonselor`), Inggris untuk teknikal (`encrypt`, `router`).
- Tidak ada dead code / import tak terpakai.
- Commit message: `<fase>: <apa yang dikerjakan>` — contoh `fase 2: auth konselor + lockout`.

**Git flow:**
```bash
# setelah tiap fase test hijau
git add -A && git commit -m "fase N: <deskripsi>"
```

---

## 7. Struktur folder akhir

```
website-konseling-narkotika/
├── .gitignore
├── .env                          # TIDAK di-commit
├── package.json                  # workspaces: backend + frontend? atau 1 package saja
├── index.html                    # frontend revamp (Fase 6-7)
├── css/style.css
├── js/
│   ├── api.js
│   ├── form.js
│   ├── cek-status.js
│   ├── chat-ws.js
│   ├── konselor-login.js
│   ├── konselor-dashboard.js
│   └── script.js
├── konselor/
│   ├── login.html
│   └── dashboard.html
└── backend/
    ├── package.json
    ├── ruangpulih.db             # TIDAK di-commit
    ├── .env                      # TIDAK di-commit
    ├── src/
    │   ├── server.js
    │   ├── config.js
    │   ├── security.js
    │   ├── db.js
    │   ├── audit.js
    │   ├── deps.js
    │   ├── ws.js
    │   ├── seed.js
    │   ├── seedLayanan.js
    │   ├── routes/
    │   │   ├── auth.js
    │   │   ├── pengaduan.js
    │   │   ├── dashboard.js
    │   │   └── layanan.js
    │   └── middleware/
    │       ├── rateLimit.js
    │       └── securityHeaders.js
    └── tests/
        ├── auth.test.js
        ├── pengaduan.test.js
        ├── chat.test.js
        ├── dashboard.test.js
        ├── layanan.test.js
        └── security.test.js
```
[truncated]