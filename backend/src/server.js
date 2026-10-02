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

// Trust proxy (httpOnly cookie aman di balik reverse proxy)
app.set('trust proxy', 1);

// Route API
app.use('/api/auth', require('./routes/auth'));
app.use('/api/pengaduan', require('./routes/pengaduan'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/layanan', require('./routes/layanan'));

// Frontend statis (root repo) — melayani index.html, css/, js/, konselor/
const ROOT = path.resolve(__dirname, '..', '..');
const opsiStatic = { extensions: ['html'], maxAge: 0 };
app.use(express.static(ROOT, opsiStatic));

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

seedLayanan();

if (require.main === module) {
  server.listen(config.PORT, () => {
    console.log('Ruang Pulih jalan di http://localhost:' + config.PORT);
    console.log('Login konselor: http://localhost:' + config.PORT + '/konselor/login.html');
  });
}

module.exports = server;
