# Plan — Ruang Pulih: Frontend Revamp + Backend Konselor (Chat Real-time, Enkripsi, Keamanan Penuh)

> **Goal (1 kalimat):** Mengubah situs statis "Ruang Pulih" menjadi aplikasi full-stack — frontend neumorphism yang lapang, non-pasaran, mobile-perfect; backend FastAPI dengan login konselor, chat real-time dokter↔pengguna tiket, pengaduan terenkripsi, dashboard konselor, dan security hardening menyeluruh.

---

## 1. Current Context / Asumsi

### 1.1 Yang sudah ada (jangan rombak dari nol)
Repo: `C:\Users\erlan\website-konseling-narkotika\` — **belum ada git repo**.

| File | Isi sekarang |
|---|---|
| `index.html` (556 baris) | Navbar, hero (h1 + lead + hero-card cek status), section Pengaduan (form), Rehabilitasi (program cards + form minat), Konseling (chat box), Hotline (188/119/110), Footer. `<html lang="id">`, favicon data-URI, Google Fonts "Plus Jakarta Sans". |
| `css/style.css` (~650 baris) | Token neomorphism lengkap: `--out/--out-sm/--in/--in-deep` dual-light shadow (light `:root` baris 22–56, dark baris 59–73), 9 tingkat `--navy-*`, `--bg #e8edf8` light / `#141d31` dark, easing `--ease/--ease-back/--ease-io`, radius 8–26px, stagger `.reveal:nth-child`, reduced-motion override ±baris 639–645. |
| `js/script.js` (567 baris) | Toast, ripple, theme toggle (`localStorage["ruang-pulih-theme"]`), navbar, reveal-on-scroll, custom select/stepper/chip/radio-card, validasi + shake, form pengaduan (generate tiket `PN-YYYYMMDD-XXXX` lokal), cek status (array palsu), form rehab, **chat palsu** (`balas()` keyword-matching baris 478–516 → harus diganti), hotline click, footer year. |
| Lainnya | `Web Konselor Anonim.pdf` (spesifikasi), `preview-*.png` (screenshot). |

**Frontend sudah lolos audit anti-AI-slop 3 ronde** (skill `no-ai-slop-ui`). Keluhan user sekarang: layout sempit/minim whitespace, terlalu banyak teks yang tidak akan dibaca user, kesan "pasaran", neomorphism belum kuat melekat.

### 1.2 Kebutuhan dari PDF (`Web Konselor Anonim.pdf`)
- **3.1** Chat konseling anonim, identitas samaran / nomor tiket, respons dari konselor berwenang.
- **3.2** Pengaduan rahasia; data disimpan aman, hanya pihak berwenang.
- **3.3** Enkripsi data sensitif.
- **3.4** Layanan rehabilitasi (info: jenis, deskripsi, persyaratan, jam, kontak, lokasi, prosedur).
- **3.5** Direktori bantuan.
- **3.6** Sistem nomor tiket; status `Diterima → Ditinjau → Dalam Penanganan → Selesai`.
- **3.7** Dashboard konselor/admin: lihat laporan, filter kategori, beri respons, tindak lanjut, update status, kelola info layanan; **akses dibatasi**.
- **3.8** Privasi & keamanan: enkripsi, kontrol akses, minimisasi data, proteksi akun admin, **pencatatan aktivitas (audit log)**, kebijakan privasi.
- **4.3** Backend bebas (PHP/Laravel/Python/Node), DB MySQL/PostgreSQL, HTTPS/TLS.
- **4.4** 3 peran: pengguna umum, konselor/pendamping, administrator. Referensi UU 27/2022 (Perlindungan Data Pribadi).

### 1.3 Asumsi & keputusan teknis (default, gampang diganti)
- **Backend: Python FastAPI + SQLite + WebSocket.** FastAPI 0.133.1, uvicorn 0.41.0, cryptography 50.0.0, pydantic 2.13.4 **sudah terinstall**. SQLite dipilih karena zero-install (PDF 4.3 mengizinkan DB apa pun; SQLite → PostgreSQL tinggal ganti connection string). WebSocket dipilih untuk chat real-time (PDF 3.1: "respons dari konselor").
- **Frontend tetap vanilla HTML/CSS/JS** — pertahankan investasi neumorphism; tidak pakai framework (YAGNI).
- **Chat AI: belum dikerjakan** (user: "belakangan aja"). Router chat dirancang agar provider AI mudah disambung nanti tanpa rombak.
- Tidak ada kredensial/API key pihak ketiga. Semua kata sandi konselor & kunci enkripsi **dibuat lokal** saat setup.

---

## 2. Arsitektur / Pendekatan

Monorepo, satu server FastAPI melayani API (`/api/*`), WebSocket (`/ws/*`), dan frontend statis (root) + halaman konselor (`/konselor/*`). SQLite (file `backend/ruangpulih.db`) via SQLAlchemy 2.0 ORM. Keamanan: **enkripsi application-layer Fernet** (field `isi_pengaduan` + `isi pesan chat` di-encrypt saat disimpan, decrypt hanya saat dibaca pihak berwenang), **bcrypt** untuk sandi konselor, **JWT dalam cookie HttpOnly** untuk sesi konselor, **audit log** untuk setiap aksi sensitif, **rate limiting + CSP header** middleware.

Urutan kerja: **Fase 0** fondasi → **Fase 1** DB+enkripsi → **Fase 2** auth konselor → **Fase 3** API pengaduan+tiket → **Fase 4** WebSocket chat → **Fase 5** dashboard konselor → **Fase 6** integrasi frontend → **Fase 7** revamp UI/whitespace/mobile → **Fase 8** hardening + kebijakan privasi → **Fase 9** uji end-to-end. Setiap fase diakhiri commit.

---

## 3. Struktur Folder Akhir

```
website-konseling-narkotika/
├── .gitignore
├── .env.example                      # template env (tanpa rahasia)
├── index.html                        # (existing, direvamp Fase 7)
├── css/style.css                     # (existing, direvamp Fase 7)
├── js/script.js                      # (existing, diubah Fase 6)
├── konselor/
│   ├── login.html                    # login dokter
│   └── dashboard.html                # dashboard konselor/admin
├── backend/
│   ├── requirements.txt
│   ├── .env                          # FERNET_KEY + JWT_SECRET (gitignored!)
│   ├── ruangpulih.db                 # (gitignored!)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # app, middleware, static mount, router include
│   │   ├── config.py                 # Settings (pydantic-settings)
│   │   ├── database.py               # engine + Base + get_db()
│   │   ├── models.py                 # tabel DB
│   │   ├── schemas.py                # model pydantic (request/response)
│   │   ├── security.py               # Fernet, bcrypt, JWT, audit helper
│   │   ├── deps.py                   # dependency: konselor_saat_ini / admin_saat_ini
│   │   ├── rate_limit.py             # middleware bucket per-IP
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── auth.py               # login / logout / siapa-saya
│   │   │   ├── pengaduan.py          # buat pengaduan + cek status
│   │   │   ├── layanan.py            # CRUD info layanan (admin)
│   │   │   ├── dashboard.py          # list tiket, update status, detail
│   │   │   └── chat.py               # riwayat chat (REST) + endpoint WS
│   │   └── ws_manager.py             # room manager WebSocket
│   └── tests/
│       ├── conftest.py
│       ├── test_security.py
│       ├── test_auth.py
│       ├── test_pengaduan.py
│       └── test_chat.py
└── Web Konselor Anonim.pdf
```

---

## 4. Step-by-Step Tasks

### FASE 0 — Fondasi repo & environment

#### T0.1 — Init git repo + `.gitignore`
```bash
cd "C:/Users/erlan/website-konseling-narkotika"
git init
git add -A && git commit -m "frontend statis: kondisi awal sebelum fullstack"
```
Buat `.gitignore`:
```gitignore
# Rahasia & data
.env
*.db
*.db-journal
__pycache__/
*.pyc
.pytest_cache/
venv/
node_modules/
# Sementara
backend/seed_demo.py

#### T0.2 — Buat venv backend & install dependency
```bash
cd "C:/Users/erlan/website-konseling-narkotika/backend"
python -m venv venv
./venv/Scripts/python -m pip install --upgrade pip
./venv/Scripts/pip install "fastapi==0.133.1" "uvicorn[standard]==0.41.0" "sqlalchemy==2.0.*" "bcrypt==4.*" "pydantic==2.13.4" "pydantic-settings" "cryptography==50.0.0" "pytest" "httpx" "python-multipart"
./venv/Scripts/pip freeze > requirements.txt
```
**Verifikasi** (mengembalikan nama modul tanpa error):
```bash
./venv/Scripts/python -c "import fastapi,uvicorn,sqlalchemy,bcrypt,cryptography,pytest,httpx,multipart; print('all ok')"
```
Output yang diharapkan: `all ok`. Commit: `git add backend/requirements.txt && git commit -m "backend: requirements"`.

> Catatan: pakai venv terpisah agar tidak menabrak python Hermes. **Jangan pernah** menjalankan `pip install` ke Python global (`C:\Users\erlan\AppData\Local\hermes\hermes-agent\venv`).

---

### FASE 1 — Database + Enkripsi (PDF 3.3, 3.8)

#### T1.1 — `backend/app/config.py`
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./backend/ruangpulih.db"
    # WAJIB di-generate saat setup (T1.2), tidak boleh hardcode
    FERNET_KEY: str = ""
    JWT_SECRET: str = ""
    JWT_ALG: str = "HS256"
    JWT_TTL_MENIT: int = 480  # 8 jam
    app_name: str = "Ruang Pulih"

    class Config:
        env_file = "backend/.env"

settings = Settings()
```

#### T1.2 — Generate rahasia lokal (sekali saja, tulis ke `backend/.env`)
```bash
cd "C:/Users/erlan/website-konseling-narkotika"
python -c "from cryptography.fernet import Fernet; print('FERNET_KEY=' + Fernet.generate_key().decode())"
python -c "import secrets; print('JWT_SECRET=' + secrets.token_urlsafe(48))"
```
Output: dua baris `FERNET_KEY=...` / `JWT_SECRET=...` → **tempel ke `backend/.env`**. Buat juga `.env.example` berisi placeholder kosong (untuk orang lain). Commit `.env.example` saja (`.env` sudah di-gitignore). Verifikasi `.env` tidak terlacak:
```bash
git status --porcelain backend/.env      # harus kosong (tidak listed)
```

#### T1.3 — `backend/app/security.py` (Fernet + bcrypt + JWT + audit)
```python
from cryptography.ferret import Fernet  # typo! harus Fernet
```
**Tulis dengan benar** (ini adalah copy-paste final):
```python
from cryptography.fernet import Fernet
import bcrypt, jwt, time
from datetime import datetime, timezone
from .config import settings

_f = Fernet(settings.FERNET_KEY.encode())

def encrypt(teks: str) -> str:
    """Encrypt field sensitif (isi pengaduan, isi chat) sebelum ke DB."""
    if teks is None: return None
    return _f.encrypt(teks.encode()).decode()

def decrypt(teks: str) -> str:
    if teks is None: return None
    return _f.decrypt(teks.encode()).decode()

def hash_sandi(sandi: str) -> str:
    return bcrypt.hashpw(sandi.encode(), bcrypt.gensalt()).decode()

def cek_sandi(sandi: str, hash_: str) -> bool:
    try:
        return bcrypt.checkpw(sandi.encode(), hash_.encode())
    except ValueError:
        return False

def buat_token(sub: str, peran: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "peran": peran, "iat": int(now.timestamp()),
               "exp": int(now.timestamp()) + settings.JWT_TTL_MENIT * 60}
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)

def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except Exception:
        return None
```

**TDD — `backend/tests/test_security.py`** (tuliskan dulu, jalankan untuk lihat gagal):
```python
from app.security import encrypt, decrypt, hash_sandi, cek_sandi, buat_token, decode_token

def test_encrypt_decrypt_rountrip():
    assert decrypt(encrypt("cerita sensitif")) == "cerita sensitif"

def test_encrypt_bukan_plaintext():
    assert "sensitif" not in encrypt("cerita sensitif")

def test_sandi_benar_dan_salah():
    h = hash_sandi("rahasia123")
    assert cek_sandi("rahasia123", h) is True
    assert cek_sandi("salah", h) is False

def test_token_rountrip_dan_peran():
    t = buat_token("dr.sari", "konselor")
    d = decode_token(t)
    assert d["sub"] == "dr.sari" and d["peran"] == "konselor"

def test_token_palsu_ditolak():
    assert decode_token("bukan.jwt.valid") is None
```
**Jalankan & lihat gagal dulu:**
```bash
cd "C:/Users/erlan/website-konseling-narkotika"
./backend/venv/Scripts/python -m pytest backend/tests/test_security.py -q
# Expected: FAILED (moduleNotFoundError / ImportError) — ini fase RED
```
Lalu buat `backend/app/__init__.py` (kosong) + file-file Fase 1, lalu jalankan lagi → **harus 5 passed**. Commit.

#### T1.4 — `backend/app/database.py`
```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

#### T1.5 — `backend/app/models.py` (PDF 3.2, 3.6, 3.7, 4.4)
```python
from sqlalchemy import Column, Integer, Text, String, DateTime, ForeignKey, Boolean
from datetime import datetime, timezone
from .database import Base

class Konselor(Base):
    """Akun dokter/konselor/admin (PDF 4.4)."""
    __tablename__ = "konselor"
    id = Column(Integer, primary_key=True)
    username = Column(String(48), unique=True, nullable=False)   # mis. "dr.sari"
    nama = Column(String(120), nullable=False)
    sandi_hash = Column(String(255), nullable=False)             # bcrypt
    peran = Column(String(16), nullable=False, default="konselor")  # "konselor" | "admin"
    aktif = Column(Boolean, default=True)
    dibuat = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Pengaduan(Base):
    """Laporan rahasia (PDF 3.2). Isi TERENKRIPSI di DB."""
    __tablename__ = "pengaduan"
    id = Column(Integer, primary_key=True)
    no_tiket = Column(String(24), unique=True, nullable=False)   # PN-YYYYMMDD-XXXX
    untuk = Column(String(60), nullable=False)                   # "Diri sendiri" / "Orang lain"
    kategori = Column(String(60), nullable=False)                # mis. "Penyalahgunaan zat"
    frekuensi = Column(String(40))
    usia = Column(Integer)
    cerita_enc = Column(Text, nullable=False)                    # Fernet
    kontak_enc = Column(Text)                                    # Fernet, boleh NULL (minimisasi data)
    status = Column(String(24), nullable=False, default="Diterima")
    # status: Diterima -> Ditinjau -> Dalam Penanganan -> Selesai  (PDF 3.6)
    ditangani_oleh = Column(Integer, ForeignKey("konselor.id"))
    dibuat = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    diperbarui = Column(DateTime, onupdate=lambda: datetime.now(timezone.utc))

class Pesan(Base):
    """Pesan chat konseling (PDF 3.1). Isi TERENKRIPSI."""
    __tablename__ = "pesan"
    id = Column(Integer, primary_key=True)
    no_tiket = Column(String(24), ForeignKey("pengaduan.no_tiket"), nullable=False)
    pengirim = Column(String(16), nullable=False)                # "user" | "konselor"
    pengirim_id = Column(Integer, ForeignKey("konselor.id"))     # NULL jika user anonim
    isi_enc = Column(Text, nullable=False)                       # Fernet
    dibuat = Column(DateTime, default=lambda: datetime.now(timezone.utc))

class Layanan(Base):
    """Direktori bantuan / info rehabilitasi (PDF 3.4, 3.5). Admin-managed."""
    __tablename__ = "layanan"
    id = Column(Integer, primary_key=True)
    jenis = Column(String(60), nullable=False)       # "Konseling" | "Pendampingan" | "Rehabilitasi" | "Darurat"
    nama = Column(String(120), nullable=False)
    deskripsi = Column(Text)
    persyaratan = Column(Text)
    jam = Column(String(120))
    kontak = Column(String(120))                     # hotline nyata: 188 / 119 / 110
    lokasi = Column(Text)
    prosedur = Column(Text)
    aktif = Column(Boolean, default=True)

class AuditLog(Base):
    """Pencatatan aktivitas sistem (PDF 3.8)."""
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True)
    aktor = Column(String(120))                     # username konselor atau "user:<tiket>"
    aksi = Column(String(60), nullable=False)       # "LOGIN" | "BACA_PENGADUAN" | "UBAH_STATUS" | ...
    detail = Column(Text)
    ip = Column(String(64))
    waktu = Column(DateTime, default=lambda: datetime.now(timezone.utc))
```
**Verifikasi skema jalan:**
```bash
./backend/venv/Scripts/python -c "from app.database import Base, engine; from app import models; Base.metadata.create_all(engine); print('tabel:', sorted(Base.metadata.tables))"
```
Output: `tabel: ['audit_log', 'konselor', 'layanan', 'pesan', 'pengaduan']`. Commit.

---

### FASE 2 — Auth Konselor (PDF 3.7, 3.8)

#### T2.1 — `backend/app/routers/auth.py`
Endpoint: `POST /api/auth/login` (body `{username, sandi}`), `POST /api/auth/logout`, `GET /api/auth/saya` (butuh login).

Alur login:
1. Cari `Konselor` by username + `aktif=True`.
2. `cek_sandi()` — jika salah 5× dalam 10 menit per-IP → kunci 15 menit (proteksi brute force, PDF 3.8).
3. Buat JWT → set cookie:
```python
from fastapi.responses import JSONResponse
resp = JSONResponse({"ok": True, "peran": k.peran})
resp.set_cookie("rp_session", token, max_age=settings.JWT_TTL_MENIT*60,
                httponly=True, secure=True, samesite="strict", path="/")
return resp
```
Logout: hapus cookie. `GET /api/auth/saya`: baca cookie `rp_session` → decode → return `{username, nama, peran}` atau 401.

#### T2.2 — `backend/app/deps.py`
```python
from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session
from .database import get_db
from .security import decode_token
from .models import Konselor
import jwt

def _dari_cookie(request: Request) -> dict:
    token = request.cookies.get("rp_session")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Belum login")
    data = decode_token(token)
    if not data:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesi tidak valid")
    return data

def konselor_saat_ini(request: Request, db: Session = Depends(get_db)) -> Konselor:
    data = _dari_cookie(request)
    k = db.query(Konselor).filter_by(username=data["sub"], aktif=True).first()
    if not k:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Akun nonaktif")
    return k

def admin_saat_ini(request: Request, db: Session = Depends(get_db)) -> Konselor:
    k = konselor_saat_ini(request, db)
    if k.peran != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Hanya admin")
    return k
```
*(pada T2.2, tambahkan `from fastapi import Depends` di import baris atas.)*

#### T2.3 — Seed akun konselor awal (dijalankan sekali)
`backend/seed_demo.py` (di-gitignore):
```python
from app.database import SessionLocal, Base, engine
from app import models
from app.security import hash_sandi

Base.metadata.create_all(engine)
db = SessionLocal()
if not db.query(models.Konselor).first():
    db.add_all([
        models.Konselor(username="admin", nama="Administrator Sistem", peran="admin",
                        sandi_hash=hash_sandi("GantiSaya123!")),
        models.Konselor(username="dr.sari", nama="dr. Sari Wulandari", peran="konselor",
                        sandi_hash=hash_sandi("GantiSaya123!")),
    ])
    db.commit()
    print("Seed konselor dibuat (username: admin / dr.sari, sandi: GantiSaya123!)")
```
**Verifikasi:**
```bash
./backend/venv/Scripts/python backend/seed_demo.py
# Expected: "Seed konselor dibuat (username: admin / dr.sari, sandi: GantiSaya123!)"
```
> **WAJIB:** Ubah sandi default ini dari dashboard sebelum produksi (catat di bagian 8).

**TDD — `backend/tests/test_auth.py`** (RED dulu):
```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_login_benar_dapat_cookie():
    r = client.post("/api/auth/login", json={"username": "dr.sari", "sandi": "GantiSaya123!"})
    assert r.status_code == 200
    assert "rp_session" in r.cookies

def test_login_salah_ditolak():
    r = client.post("/api/auth/login", json={"username": "dr.sari", "sandi": "salah"})
    assert r.status_code == 401
    assert "rp_session" not in r.cookies

def test_saya_butuh_login():
    r = client.get("/api/auth/saya")
    assert r.status_code == 401

def test_saya_dengan_cookie():
    client.post("/api/auth/login", json={"username": "dr.sari", "sandi": "GantiSaya123!"})
    r = client.get("/api/auth/saya")
    assert r.status_code == 200 and r.json()["username"] == "dr.sari"
```
Jalankan → lihat 4 FAILED → implementasi → 4 passed. Commit.

---

### FASE 3 — API Pengaduan + Sistem Tiket (PDF 3.2, 3.6)

#### T3.1 — `backend/app/routers/pengaduan.py`
- `POST /api/pengaduan` (publik, anonim): terima `{untuk, kategori, frekuensi, usia, cerita, kontak?}`.
  - Validasi panjang minimal `cerita` (≥ 20 karakter), kategori dari daftar tetap.
  - Generate `no_tiket`: `f"PN-{tanggal:%Y%m%d}-{secrets.token_urlsafe(4)[:4].upper()}"`, cek unik (retry jika bentrok).
  - Simpan `cerita_enc = encrypt(cerita)`, `kontak_enc = encrypt(kontak)`.
  - Log `AuditLog(aktor=f"user:{tiket}", aksi="KIRIM_PENGADUAN")`.
  - Return `{no_tiket, status: "Diterima"}`.
- `GET /api/pengaduan/{no_tiket}` (publik, anonim): return **hanya** `{no_tiket, status, diperbarui}` — TIDAK mengembalikan isi pengaduan ke publik (minimisasi data). Hanya konselor yang bisa baca isi (Fase 5).

#### T3.2 — Status flow helper
```python
ALUR_STATUS = ["Diterima", "Ditinjau", "Dalam Penanganan", "Selesai"]
def status_index(s): return ALUR_STATUS.index(s)
```
Konselor hanya bisa maju ke status berikutnya dalam urutan itu (tidak boleh melompat mundur), dilakukan di Fase 5.

**TDD — `backend/tests/test_pengaduan.py`**:
```python
def test_kirim_pengaduan_dapat_tiket():
    r = client.post("/api/pengaduan", json={"untuk": "Diri sendiri", "kategori": "Penyalahgunaan zat",
        "frekuensi": "Setiap hari", "usia": 17,
        "cerita": "Saya ingin berhenti tapi selalu kambuh dan tidak tahu harus minta bantuan ke mana."})
    assert r.status_code == 201
    t = r.json()["no_tiket"]
    assert t.startswith("PN-") and len(t) >= 14

def test_cek_status_anonim():
    r = client.post("/api/pengaduan", json={...})
    tiket = r.json()["no_tiket"]
    r2 = client.get(f"/api/pengaduan/{tiket}")
    assert r2.status_code == 200
    assert r2.json()["status"] == "Diterima"
    assert "cerita" not in r2.json()   # isi tidak bocor ke publik

def test_isi_pengaduan_terenkripsi_di_db():
    # cek langsung isi kolom DB bukan plaintext
    from app.database import SessionLocal
    from app.models import Pengaduan
    db = SessionLocal(); p = db.query(Pengaduan).first()
    db.close()
    assert "kambuh" not in p.cerita_enc   # ciphertext tidak mengandung kata plaintext

def test_tiket_palsu():
    assert client.get("/api/pengaduan/PN-00000000-XXXX").status_code == 404
```
Jalankan → 4 FAILED → implementasi → 4 passed. Commit.

---

### FASE 4 — WebSocket Chat Real-time (PDF 3.1)

#### T4.1 — `backend/app/ws_manager.py`
Room manager: 1 room per `no_tiket`. Daftar koneksi per room; broadcast pesan masuk ke semua member room (user anonim + konselor yang join).
```python
class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, set[WebSocket]] = {}
    async def connect(self, room: str, ws: WebSocket):
        await ws.accept(); self.rooms.setdefault(room, set()).add(ws)
    def disconnect(self, room: str, ws: WebSocket):
        self.rooms.get(room, set()).discard(ws)
        if not self.rooms.get(room): self.rooms.pop(room, None)
    async def broadcast(self, room: str, payload: dict):
        for ws in list(self.rooms.get(room, ())):
            try: await ws.send_json(payload)
            except Exception: self.disconnect(room, ws)

manager = ConnectionManager()
```

#### T4.2 — `backend/app/routers/chat.py`
- `GET /api/chat/{no_tiket}/riwayat` — **publik**: kembalikan 50 pesan terakhir untuk tiket itu, **didekripsi**. Alasan: ini satu-satunya cara user mengakses percakapannya; izin ditentukan oleh "tahu nomor tiket" (token capability). Tiket = 14+ char acak, tidak dapat ditebak.
  - Log `AuditLog(aksi="BACA_CHAT", aktor=f"user:{tiket}")`.
- `WS /ws/chat/{no_tiket}` — real-time, dua peran di satu room:
  - **User anonim**: connect dengan query param `?role=user` (tidak butuh login).
  - **Konselor**: connect dengan query param `?role=konselor&token=<JWT>`. Server decode token, simpan `pengirim_id`. Jika token invalid → `ws.close(code=4401)`.
  - Pesan masuk (`{isi}`) → simpan ke DB (`isi_enc = encrypt(isi)`) → broadcast `{pengirim, isi, waktu}` ke room → konfirmasi `{ok: true, id}` ke pengirim.
  - Validasi server-side: `isi` ≤ 2000 char, bukan string kosong; rate-limit per koneksi (max 10 pesan/menit).
  - **Tidak ada relay server-side lain** — pesan lain hanya disimpan & diteruskan.

**TDD — `backend/tests/test_chat.py`** (WebSocket via TestClient):
```python
from starlette.testclient import TestClient   # mendukung websocket_connect
from app.main import app

client = TestClient(app)

def test_chat_two_way_user_dan_konselor():
    # login konselor dulu
    client.post("/api/auth/login", json={"username": "dr.sari", "sandi": "GantiSaya123!"})
    # buat tiket
    t = client.post("/api/pengaduan", json={...}).json()["no_tiket"]
    # join konselor
    token = client.cookies["rp_session"]
    wk = client.websocket_connect(f"/ws/chat/{t}?role=konselor&token={token}")
    # join user
    wu = client.websocket_connect(f"/ws/chat/{t}?role=user")
    wu.send_json({"isi": "Halo, saya butuh bantuan"})
    msg = wk.receive_json()
    assert msg["isi"] == "Halo, saya butuh bantuan" and msg["pengirim"] == "user"
    wk.send_json({"isi": "Halo, saya dengarkan. Mau ceritakan?"})
    msg2 = wu.receive_json()
    assert msg2["isi"] == "Halo, saya dengarkan..." and msg2["pengirim"] == "konselor"

def test_pesan_tersimpan_terenkripsi_di_db():
    # setelah test di atas, cek DB
    from app.database import SessionLocal
    from app.models import Pesan
    db = SessionLocal()
    p = db.query(Pesan).order_by(Pesan.id.desc()).first()
    db.close()
    assert "butuh bantuan" not in p.isi_enc   # ciphertext
    from app.security import decrypt
    assert "butuh bantuan" in decrypt(p.isi_enc)

def test_ws_tanpa_token_konselor_ditolak():
    t = client.post("/api/pengaduan", json={...}).json()["no_tiket"]
    with pytest.raises(Exception):
        with client.websocket_connect(f"/ws/chat/{t}?role=konselor"):
            pass
```

---

### FASE 5 — Dashboard Konselor (PDF 3.7)

#### T5.1 — `backend/app/routers/dashboard.py` (semua butuh `Depends(konselor_saat_ini)`)
- `GET /api/dashboard/pengaduan` — list pengaduan (hanya field non-sensitif: tiket, kategori, status, untuk, usia, dibuat, ditangani_oleh). Filter `?status=` & `?kategori=`. Audit `LIST_PENGADUAN`.
- `GET /api/dashboard/pengaduan/{no_tiket}` — detail + **decrypt cerita** (izin konselor). Audit `BACA_PENGADUAN` (lengkap: konselor yang baca + IP).
- `PATCH /api/dashboard/pengaduan/{no_tiket}/status` — body `{status_baru}`. Hanya boleh maju 1 langkah dalam `ALUR_STATUS` (kecuali admin bisa bebas). Audit `UBAH_STATUS`.
- `POST /api/dashboard/pengaduan/{no_tiket}/klaim` — set `ditangani_oleh` = konselor login. Audit `KLAIM_PENGADUAN`.

#### T5.2 — `backend/app/routers/layanan.py`
- `GET /api/layanan` (publik) — semua layanan aktif (untuk section Direktori Bantuan & Rehabilitasi frontend).
- `POST/PUT/DELETE /api/layanan/{id}` — **hanya `admin_saat_ini`** (PDF 3.7: "mengelola informasi layanan bantuan"). Audit `UBAH_LAYANAN`.

**TDD — `backend/tests/test_dashboard.py`**:
```python
def test_dashboard_butuh_login():
    assert client.get("/api/dashboard/pengaduan").status_code == 401

def test_list_pengaduan_tidak_bocor_isi():
    login_konselor()
    r = client.get("/api/dashboard/pengaduan")
    assert r.status_code == 200
    assert len(r.json()["items"]) >= 1
    assert all("cerita" not in x for x in r.json()["items"])

def test_detail_bisa_baca_isi_terdekripsi():
    login_konselor()
    r = client.get(f"/api/dashboard/pengaduan/{tiket}")
    assert "kambuh" in r.json()["cerita"]      # terdekripsi untuk konselor

def test_status_maju_satu_langkah():
    login_konselor()
    r = client.patch(f"/api/dashboard/pengaduan/{tiket}/status", json={"status_baru": "Dalam Penanganan"})
    assert r.status_code == 400                 # lompat dari Diterima dilarang
    r2 = client.patch(f"/api/dashboard/pengaduan/{tiket}/status", json={"status_baru": "Ditinjau"})
    assert r2.status_code == 200 and r2.json()["status"] == "Ditinjau"

def test_layanan_hanya_admin():
    login_konselor()   # dr.sari = konselor, bukan admin
    r = client.post("/api/layanan", json={...})
    assert r.status_code == 403
```

---

### FASE 6 — Integrasi Frontend (ganti semua logika palsu)

> **Prinsip:** frontend tetap vanilla. Ganti "palsu" dengan "nyata"; jangan rombak struktur DOM yang sudah direvamp di Fase 7.

#### T6.1 — `js/script.js` — ganti blok "FORM PENGADUAN" (baris 301–368)
Hapus logika `localStorage`/array palsu. Ganti `submit` handler:
```javascript
form.addEventListener('submit', async function (e) {
  e.preventDefault();
  // ... validasi yang sudah ada (shake dsb) tetap ...
  const data = {
    untuk: form.querySelector('input[name="untuk"]:checked').value,
    kategori: neoSelectValue('kategori'),
    frekuensi: neoSelectValue('frekuensi'),
    usia: usiaStepperValue(),
    cerita: form.querySelector('#cerita').value.trim(),
    kontak: form.querySelector('#kontak')?.value.trim() || null
  };
  try {
    btnSubmit.disabled = true; btnSubmit.textContent = 'Mengirim...';
    const r = await fetch(API + '/api/pengaduan', {method:'POST',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)});
    if (!r.ok) throw new Error(await r.text());
    const res = await r.json();
    tampilkanHasilTiket(res.no_tiket, res.status);   // tampilkan tiket nyata
  } catch (err) {
    toast('Gagal mengirim. Coba lagi, atau hubungi 119 bila mendesak.');
  } finally {
    btnSubmit.disabled = false; btnSubmit.textContent = 'Kirim Laporan';
  }
});
```
*(konstanta `API` didefinisikan di atas script: `const API = window.location.origin;` — file dilayani server yang sama, tidak ada CORS.)*

#### T6.2 — `js/script.js` — ganti blok "CEK STATUS" (baris 369–399)
```javascript
async function cekStatus(tiket) {
  const r = await fetch(API + '/api/pengaduan/' + encodeURIComponent(tiket));
  if (r.status === 404) { /* tampilkan: tiket tidak ditemukan */ return; }
  const d = await r.json();
  renderStepperStatus(d.status);   // Diterima -> Ditinjau -> Dalam Penanganan -> Selesai
}
```
*(`renderStepperStatus` baru: gambar 4 step horizontal neumorphic, step saat ini "ditekan"/inset.)*

#### T6.3 — `js/script.js` — ganti total blok "CHAT KONSELING" (baris 432–556)
Hapus `balas()`, `kirimPesan()`, `setTimeout` palsu. Ganti dengan WebSocket:
```javascript
let ws = null, chatSiap = false;
function bukaChat(tiket) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(proto + '//' + location.host + '/ws/chat/' + tiket + '?role=user');
  ws.onopen = () => { chatSiap = true; };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.ok) return;                        // konfirmasi server
    bubble(m.isi, m.pengirim === 'user' ? 'out' : 'in');
  };
  ws.onclose = () => { chatSiap = false; /* tampilkan status "terputus, menyambung ulang" */ };
}
formChat.addEventListener('submit', function (e) {
  e.preventDefault();
  const teks = inputChat.value.trim();
  if (!teks || !chatSiap) { shake(inputChat); return; }
  ws.send(JSON.stringify({ isi: teks }));
  inputChat.value = ''; btnSend.disabled = true;
});
// tombol "Sesi Baru" (resetChat): tutup WS lama, buka room baru (tiket baru dibuat saat user kirim laporan pertama)
```
**Aturan UX penting:** karena chat sekarang ke konselor **manusia**, pesan pembuka harus jujur — bukan janji respons instan:
```javascript
bubble('Ini ruang anonim. Pesan Anda dibaca konselor — bukan bot. Mereka membalas saat ada yang online, kadang butuh beberapa menit. Kalau mendesak, telepon 119 atau 188.', 'in');
```
> Catatan Fase 6.3: `typing()` indicator dipakai hanya saat ada sinyal "konselor sedang mengetik" dari server (fitur `typing` event via WS, opsional). Jangan digunakan untuk memalsukan jeda.

#### T6.4 — Halaman login konselor `konselor/login.html`
Form neumorphism (`username` + `sandi` + tombol `.btn-primary`), submit → `POST /api/auth/login` → redirect `/konselor/dashboard.html`. Tampilkan error shake saat 401. Tambahkan note kecil: "Hanya untuk konselor & admin yang terdaftar."

#### T6.5 — Halaman dashboard `konselor/dashboard.html` + `js/konselor.js`
Panel layout (desktop: sidebar daftar tiket kiri 340px, area detail kanan; mobile: stack):
- **Sidebar**: filter status (4 chip neumorphic), list tiket (kategori + status badge + waktu relatif). Klik → detail.
- **Detail kanan**: header tiket (nomor, kategori, status stepper, tombol Klaim), cerita (hasil decrypt), **chat box** (WebSocket `?role=konselor&token=<jwt>`), tombol update status (hanya aktif jika klaim).
- **Tab Layanan (admin saja)**: CRUD info layanan.
- Cek sesi saat load: `GET /api/auth/saya`; jika 401 → redirect ke `login.html`.

**TDD frontend** — `backend/tests/test_e2e.py` (via TestClient + JS di browser harness):
```python
def test_alur_lengkap_user_konselor():
    # 1. user kirim pengaduan
    t = client.post("/api/pengaduan", json={...}).json()["no_tiket"]
    # 2. user cek status
    assert client.get(f"/api/pengaduan/{t}").json()["status"] == "Diterima"
    # 3. konselor login, lihat list, baca, klaim, majukan status
    client.post("/api/auth/login", json={"username":"dr.sari","sandi":"GantiSaya123!"})
    assert client.get("/api/dashboard/pengaduan").status_code == 200
    assert "kambuh" in client.get(f"/api/dashboard/pengaduan/{t}").json()["cerita"]
    assert client.post(f"/api/dashboard/pengaduan/{t}/klaim").status_code == 200
    assert client.patch(f"/api/dashboard/pengaduan/{t}/status",
                        json={"status_baru":"Ditinjau"}).status_code == 200
    # 4. user lihat statusnya maju
    assert client.get(f"/api/pengaduan/{t}").json()["status"] == "Ditinjau"
    # 5. chat dua arah via WS (seperti test_chat.py)
```

---

### FASE 7 — Revamp UI: Whitespace, Bukan Pasaran, Neomorphism Kuat

> Referensi wajib sebelum mengerjakan fase ini: **skill `no-ai-slop-ui`** (10 pola + cara audit). Setiap perubahan harus lolos audit itu.

#### T7.1 — Lepas layout: perluas ruang napas (CSS)
Di `css/style.css`, ubah token spacing fundamental:
```css
.container { width: min(1240px, 90%); margin-inline: auto; }
.section { padding: clamp(72px, 9vw, 128px) 0; }
.section-head { max-width: 62ch; margin: 0 0 56px; }
.section-head p { font-size: 1.04rem; max-width: 56ch; }
.hero { padding-top: calc(var(--nav-h) + 88px); padding-bottom: clamp(80px, 10vw, 140px); }
.hero-grid { grid-template-columns: 1.12fr .88fr; gap: clamp(40px, 5.2vw, 76px); }
.form-card { padding: clamp(28px, 3.4vw, 44px); }
.program-card, .hotline-card, .neo-card { padding: clamp(22px, 2.4vw, 34px); }
```
**Verifikasi numerik** (bukan anggapan):
```bash
cd "C:/Users/erlan/website-konseling-narkotika"
python - <<'PY'
import re
css = open('css/style.css', encoding='utf-8').read()
# semua .section padding harus >= 72px
for m in re.finditer(r'\.section\s*\{([^}]*)\}', css):
    print('section:', m.group(1))
PY
```
Output harus menunjukkan `padding: clamp(72px, ...)` — bukan `84px` lama.

#### T7.2 — Pangkas teks yang tidak akan dibaca (HTML)
Aturan: tiap section boleh punya **1 paragraf pengantar maksimal 2 kalimat**. Sisanya: bullet pendek atau hapus. Target konkret di `index.html`:
- **Section Rehabilitasi**: hapus paragraf panjang penjelasan " Rehabilitasi berbentuk rumah singgah ...". Ganti dengan grid 3 kartu singkat (nama layanan + 1 baris kondisi + kontak). Info detail pindah ke direktori layanan (DB, Fase 5).
- **Section Hotline**: gabungkan 4 kartu hotline jadi **satu pita darurat** (banner tunggal, bukan barisan kartu identik — ini pola AI-slop "kartu identik berikon"). Isi: nomor (188 BNN, 119 Medis, 110 Polri, Puskesmas) + 1 baris kapan dipakai. Hapus paragraf panjang di bawahnya.
- **Hero**: tagline pendek max 1 kalimat. Hapus paragraf penjelasan hero; biarkan CTA + hero-card (tiket) yang jadi bukti konkret.
- **Section Pengaduan**: hapus paragraf pembuka yang mengulang heading. Form langsung.
- **Footer**: max 3 kolom, tiap kolom max 3 baris. Hapus paragraf "Prototipe layanan" panjang → 1 baris saja di paling bawah.
- **Syarat emas**: setelah pangkas, hitung kata. Target: section selain form < 80 kata per section.
```bash
# verifikasi hitung kata per section (parse DOM via browser harness)
grep -o '<section.*</section>' index.html | head -1   # sanity: masih utuh strukturnya
```

#### T7.3 — Sempit → lega: perbaiki elemen "sempit-sempit"
Audit elemen yang terlalu padat di `css/style.css`:
- `.form-grid` gap: `clamp(18px, 2.2vw, 28px)` (dari 14px).
- `.neo-field input` padding: `14px 18px` (dari 12px 14px).
- `.neo-select-trigger` padding: `14px 18px` + min-height 52px (target ketuk mobile ≥44px).
- `.chat-bubble` padding: `12px 18px`, `border-radius: 18px 18px 18px 4px` (dari 12px seragam).
- `.btn` padding: `13px 26px` + min-height 50px.
- Line-height body: 1.7 (dari 1.55) — paragraf pendek tapi napas.
- **Verifikasi mobile**: buka di 390×844; **tidak boleh ada** overflow horizontal:
```javascript
// di browser harness, set viewport 390x844 lalu:
j('document.documentElement.scrollWidth')   // harus <= 390
j('document.querySelector(".container").getBoundingClientRect().width')  // <= 390 - 0
```

#### T7.2b — Pecah simetri .program-grid (residual audit ronde-3, skor 9/10)
Audit fresh-eyes menandai `.program-grid` (repeat(4,1fr), 4 kartu struktur identik) sebagai residual AI-slop. Di `css/style.css` + `index.html`:

1. Jangan 4 kartu ukuran sama. Ubah `.program-grid` jadi **grid 6 kolom** dengan span tak simetris:
```css
.program-grid {
  grid-template-columns: repeat(6, 1fr);
  gap: clamp(20px, 2.4vw, 30px);
}
.program-card:nth-child(1) { grid-column: span 3; }  /* Detoksifikasi — layanan utama */
.program-card:nth-child(2) { grid-column: span 3; }
.program-card:nth-child(3) { grid-column: span 2; }
.program-card:nth-child(4) { grid-column: span 4; }  /* Aftercare — lebar */
@media (max-width: 900px) { .program-card:nth-child(n) { grid-column: span 6; } }
```
2. Hapus ikon identik di tiap kartu; jadikan tag `meta` singkat ("Butuh pengawasan medis", "Lingkungan terkontrol", "Tetap aktivitas harian", "Support group") sebagai visual utama, bukan ikon.

**Verifikasi:**
- `js("getComputedStyle(document.querySelector('.program-grid')).gridTemplateColumns")` harus mengandung **6** track.
- `js("[...document.querySelectorAll('.program-card')].map(c=>c.querySelector('svg,img')?1:0).join('')")` harus `"0000"` — nol ikon identik.

#### T7.4 — Neumorphism diperkuat & konsisten
Sumber cahaya tetap **kiri-atas**. Perkuat:
- Shadow utama: `box-shadow: 9px 9px 18px var(--navy-shadow-dark), -9px -9px 18px var(--navy-shadow-light);` (naikkan dari 6px — terlalu halus sekarang).
- Shadow "ditekan" (inset): `inset 5px 5px 10px var(--navy-shadow-dark), inset -5px -5px 10px var(--navy-shadow-light);`
- Semua sudut membulat 12–26px (bervariasi per komponen, bukan seragam 14px).
- Kontras teks: body text minimum `navy-800` di light (cek WCAG AA: 4.5:1 terhadap `#e8edf8`).
- **Verifikasi piksel** (metode yang sudah terbukti): screenshot light + dark, sampling PIL:
```bash
python -c "from PIL import Image; im=Image.open('shot.png').convert('RGB'); print([im.getpixel(p) for p in [(1242,604),(10,604),(631,40)]])"
# light: [(200,210,233),(232,237,248),(232,237,248)]  dark: [(26,39,64),(20,29,49),(20,29,49)]
```

#### T7.5 — Audit AI-slop wajib sebelum tutup Fase 7
Jalankan **skill `no-ai-slop-ui`** (10 pola). Verifikasi dengan browser harness:
```bash
# cek bukti-bukti konkret di DOM:
grep -c "backdrop-filter" css/style.css          # harus 0
grep -c "background-clip\|-webkit-background-clip" css/style.css  # harus 0 (no gradient text)
grep -c "text-align: center" css/style.css       # hanya pada micro-label/chat (<= 3)
grep -o "section-head[^{]*{[^}]*text-align: center" css/style.css  # harus kosong
```
Lalu minta **fresh-eyes audit** via delegate_task (model lain via DOM, bukan OCR) — pola: eyebrow/kicker, stat banner, gradient text, centered, glassmorphism, headline puitis, CTA generik, logo strip. Target: semua TIDAK ADA.

---

### FASE 8 — Keamanan & Privasi (lapisan tambahan, PDF 3.8)

#### T8.1 — `backend/app/main.py` — middleware & startup
```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from .database import Base, engine
from .routers import auth, pengaduan, chat, dashboard, layanan

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)   # dev only; produksi pakai Alembic
    yield

app = FastAPI(title="Ruang Pulih API", lifespan=lifespan)

# Same-origin saja (frontend dilayani server ini)
app.add_middleware(CORSMiddleware, allow_origins=[], allow_credentials=False)

# Static frontend
app.mount("/", StaticFiles(directory="..", html=True), name="static")

app.include_router(auth.router, prefix="/api/auth")
app.include_router(pengaduan.router, prefix="/api/pengaduan")
app.include_router(dashboard.router, prefix="/api/dashboard")
app.include_router(layanan.router, prefix="/api/layanan")
app.include_router(chat.router)   # /ws/chat/...
```
> **Trapmount**: `StaticFiles` di "/" akan menelan `/ws/*`? Tidak — FastAPI route (`@app.websocket`) di-registrasi sebelum mount, jadi WebSocket match duluan. **Verifikasi:** test_chat.py harus pass setelah mount.

#### T8.2 — Rate limiting & hardening
- `pip install slowapi` → limiter global 60 req/menit per-IP, endpoint pengaduan 5/menit, login 10/menit (lihat T2.1 lockout lokal juga).
- Header keamanan via middleware custom:
```python
@app.middleware("http")
async def security_headers(request, call_next):
    r = await call_next(request)
    r.headers["X-Content-Type-Options"] = "nosniff"
    r.headers["X-Frame-Options"] = "DENY"
    r.headers["Referrer-Policy"] = "no-referrer"
    r.headers["Content-Security-Policy"] = ("default-src 'self'; script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; "
        "connect-src 'self' ws: wss:; img-src 'self' data:")
    return r
```
> Catatan CSP: `'unsafe-inline'` untuk script/style karena vanilla JS/CSS inline-event. Fase tersendiri bila mau strict CSP dengan nonce.

#### T8.3 — Minimisasi data & retensi
- Field kontak **opsional**; jika kosong, simpan NULL (bukan string kosong).
- **Tidak ada** log yang mencatat isi pesan/pengaduan — hanya aksi + nomor tiket.
- `AuditLog.detail` tidak boleh berisi plaintext isi; hanya metadata (mis. `{"dari":"Diterima","ke":"Ditinjau"}`).
- Retensi: pesan & pengaduan **tidak dihapus otomatis** pada prototipe (butuh keputusan kebijakan retensi — lihat bagian 9).
- Cookie `secure=True` (HTTPS only). **Di dev (http://localhost) cookie tidak akan terkirim** — gunakan flag env `DEV_INSECURE_COOKIE=1` untuk allow secure=False di dev saja:
```python
resp.set_cookie(..., secure=not settings.DEV_INSECURE_COOKIE, ...)
```

#### T8.4 — Test keamanan yang harus lulus
```python
# backend/tests/test_security_e2e.py
def test_isi_tidak_bocor_endpoint_publik():
    # GET /api/pengaduan/{t} tidak mengandung cerita
    assert "cerita" not in client.get(f"/api/pengaduan/{t}").json()

def test_chat_publik_tidak_bisa_baca_tiket_lain():
    # user A tidak bisa baca room user B tanpa tiketnya
    assert client.get(f"/api/chat/{t_b}/riwayat").status_code == 404  # tiket B tidak ada di room A

def test_login_brute_force_dikunci():
    for _ in range(5):
        client.post("/api/auth/login", json={"username":"dr.sari","sandi":"salah"})
    r = client.post("/api/auth/login", json={"username":"dr.sari","sandi":"GantiSaya123!"})
    assert r.status_code == 429 or r.status_code == 401   # terkunci walau sandi benar

def test_cors_ditolak():
    r = client.options("/api/pengaduan", headers={"Origin":"https://jahat.com"})
    # tidak ada header Access-Control-Allow-Origin
    assert "access-control-allow-origin" not in r.headers

def test_sesi_invalid_setelah_logout():
    client.post("/api/auth/login", json={...})
    client.post("/api/auth/logout")
    assert client.get("/api/auth/saya").status_code == 401
```

---

## 5. Urutan Eksekusi (roadmap)

| Urut | Fase | Konten | Bukti selesai |
|------|------|--------|---------------|
| 1 | T0 | Repo, gitignore, venv, requirements | `git log` ada commit; `pytest --version` jalan |
| 2 | T1 | DB + enkripsi + security | `pytest test_security.py` → 5 passed |
| 3 | T2 | Auth konselor + seed | `pytest test_auth.py` → 4 passed |
| 4 | T3 | API pengaduan + tiket | `pytest test_pengaduan.py` → 4 passed |
| 5 | T4 | WebSocket chat | `pytest test_chat.py` → 3 passed |
| 6 | T5 | Dashboard API + layanan | `pytest test_dashboard.py` → 5 passed |
| 5+6 | T6 | Integrasi frontend | `test_e2e.py` → 1 passed; chat real-time di browser |
| 7 | T7 | Revamp UI (setelah fitur jadi) | Fresh-eyes audit: semua pola TIDAK ADA; scrollWidth ≤ 390 |
| 8 | T8 | Security hardening | `test_security_e2e.py` → 5 passed |
| 9 | — | Deploy lokal: `uvicorn app.main:app --reload` | Buka `http://localhost:8000`; alur penuh klik-lalu |

---

## 6. Risiko, Tradeoff, Pertanyaan Terbuka

### Risiko teknis
1. **WebSocket + StaticFiles mount conflict** — mitigasi: route WS di-include router setelah mount tapi FastAPI match route eksplisit duluan; test_chat.py adalah penjaga.
2. **`secure=True` cookie di localhost** — mitigasi: env `DEV_INSECURE_COOKIE` (T8.3).
3. **SQLite + WebSocket concurrency** — SQLite menulis serial; chat real-time bisa jadi bottleneck di >100 concurrent. Untuk prototipe ok. Produksi: ganti PostgreSQL.
4. **Enkripsi Fernet + key rotation** — key di `.env` tidak bisa di-rotate tanpa decrypt-reencrypt semua. Buat script `backend/rotate_key.py` (opsional, di luar scope).
5. **`check_same_thread=False`** wajib untuk SQLite + FastAPI async — sudah di T1.4.
6. **CORS middleware config default allow all** — dipasang allow_origins=[] (T8.1) lalu diuji (T8.4).
7. **Frontend dilayani backend (mount "/")** — `js/script.js` dan `css/style.css` harus accessible via `http://localhost:8000/js/script.js`. Verifikasi di T6.1.
8. **PDF menyebut fitur "artikel/edukasi narkotika" (3.4)** — tidak ada di frontend sekarang. **Pertanyaan untuk user**: apakah mau ditambahkan section edukasi, atau dicukupkan info layanan saja?

### Tradeoff
- **Tiket sebagai capability token** (siapa tahu nomor = bisa baca chat) vs **akun user**. Pilihan: tetap anonim tanpa akun (sesuai judul "anonim"), tiket 14+ char acak. Konsekuensi: jika user hilang nomor tiket, percakapan tidak bisa diakses lagi — tidak ada recovery (sesuai sifat anonim).
- **Chat ke konselor manusia** vs **bot AI** — pilihan: manusia dulu (user explicit minta AI "belakangan"). Konsekuensi: di luar jam kerja tidak ada respons instan — UX harus jujur (sudah di T6.3).
- **DB plaintext vs encrypted-at-rest** — pilihan: field sensitif Fernet. Konsekuensi: pencarian teks penuh di isi pengaduan tidak mungkin (harus decrypt dulu). OK untuk prototipe.

### Pertanyaan terbuka untuk user (sebelum eksekusi)
1. **Stack backend**: FastAPI + SQLite (saran saya — tercepat, WebSocket native), atau Node/PHP?
2. **Real-time**: WebSocket (saran) atau polling 5 detik?
3. **Auth konselor**: username+sandi (saran) atau +2FA TOTP?
4. **Fitur artikel/edukasi (PDF 3.4)**: ditambahkan atau tidak?
5. **Retensi data**: berapa lama pengaduan/chat disimpan? (Prototipe: selamanya. Produksi butuh kebijakan.)
6. **Sandi default seed** `GantiSaya123!` wajib diganti sebelum produksi — siapa yang pegang akun admin?

---

## 7. Definisi Selesai (semua harus lulus)

- [ ] `pytest backend/tests/` → **semua passed** (target ≥ 22 test).
- [ ] Alur lengkap manual di browser: kirim pengaduan → dapat tiket → cek status → chat dengan konselor (login `dr.sari` di dashboard) → konselor majukan status → user lihat status berubah.
- [ ] Chat real-time: pesan muncul di kedua sisi tanpa reload.
- [ ] Dark mode + light mode tampil benar (verifikasi piksel PIL).
- [ ] Mobile 390×844: `scrollWidth ≤ 390`, semua kontrol ≥ 44px target ketuk.
- [ ] Audit AI-slop fresh-eyes: **semua pola TIDAK ADA**.
- [ ] Whitespace: section padding ≥ 72px, container ≤ 1240px, 1 paragraf pengantar per section (≤2 kalimat).
- [ ] Isi pengaduan & chat terenkripsi di DB (cek ciphertext langsung di DB file).
- [ ] `backend/.env` tidak ter-commit (cek `git log --all -- backend/.env` kosong).
- [ ] Tidak ada error di console browser saat alur lengkap.
- [ ] Stop instruction: `stop.bat` (double-click) atau satu perintah untuk mematikan server uvicorn (sesuai standing rule user).
