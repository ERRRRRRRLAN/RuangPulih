// Server produksi: Express + static frontend + WebSocket + semua route API.
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const http = require('node:http');
const config = require('./config');
const { ambilSesi } = require('./deps');
const { seedLayanan } = require('./seedLayanan');

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(cookieParser());
app.use(require('./middleware/securityHeaders'));

// Trust proxy (httpOnly cookie aman di balik reverse proxy)
app.set('trust proxy', 1);

// Rate limit per endpoint (T8.1)
const rateLimit = require('./middleware/rateLimit');
app.use('/api/auth/login', rateLimit({ windowMs: 60_000, max: 5 }));   // login: 5x/menit
app.use('/api/pengaduan', rateLimit({ windowMs: 60_000, max: 10 }));  // pengaduan: 10x/menit
app.use('/api', rateLimit());                                          // umum: 30x/menit

// Route API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/pengaduan', require('./routes/pengaduan'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/layanan', require('./routes/layanan'));
app.use('/api/rujukan', require('./routes/rujukan'));

// Frontend statis (root repo) — melayani index.html, css/, js/, konselor/
const ROOT = path.resolve(__dirname, '..', '..');
const opsiStatic = { extensions: ['html'], maxAge: 0 };
app.use(express.static(ROOT, opsiStatic));

// URL bersih (profesional, tanpa ekstensi .html):
//   /konselor          -> /konselor/login.html (atau dashboard jika sudah login)
//   /konselor/masuk    -> /konselor/login.html
//   /konselor/dashboard-> /konselor/dashboard.html
// dan jalankan .html lama agar bookmark lama tetap jalan.
app.get(['/konselor', '/konselor/masuk', '/konselor/login'], (req, res) => {
  res.sendFile(path.join(ROOT, 'konselor', 'login.html'));
});
app.get('/konselor/dashboard', ambilSesi, (req, res) => {
  res.sendFile(path.join(ROOT, 'konselor', 'dashboard.html'));
});
// redirect .html -> URL bersih (301 permanen, hapus jejak .html lama)
app.get(['/konselor/login.html', '/konselor/dashboard.html'], (req, res) => {
  const bersih = req.url.replace(/\.html$/, '').replace('/login', '/masuk');
  res.redirect(301, bersih);
});

// Fallback: rute non-API & non-file → index.html
app.use((req, res, next) => {
  if (req.url.startsWith('/api/')) return next();
  const file = path.join(ROOT, req.url);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return next();
  res.sendFile(path.join(ROOT, 'index.html'));
});

// Penanganan error terakhir
app.use((err, req, res, next) => {
  console.error('ERROR', err);
  res.status(500).json({ error: 'server error' });
});

const server = http.createServer(app);
require('./ws').pasang(server);

seedLayanan().catch(e => console.error('seed layanan gagal:', e.message));

if (require.main === module) {
  server.listen(config.PORT, () => {
    console.log('Ruang Pulih jalan di http://localhost:' + config.PORT);
    console.log('Login konselor: http://localhost:' + config.PORT + '/konselor/login.html');
  });
}

module.exports = server;
