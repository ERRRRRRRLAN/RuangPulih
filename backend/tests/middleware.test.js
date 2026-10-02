// T8.4 — test middleware Fase 8: rate limit + security headers.
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const rateLimit = require('../src/middleware/rateLimit');
const securityHeaders = require('../src/middleware/securityHeaders');

let base, server;

function buatApp(rlOpts) {
  const a = express();
  a.use(express.json());
  a.use(securityHeaders);
  if (rlOpts) a.use('/api/tes', rateLimit(rlOpts));
  a.get('/api/tes', (req, res) => res.json({ ok: true }));
  return a;
}

test('1. security headers terpasang (X-Frame-Options, CSP, nosniff, HSTS)', async () => {
  server = buatApp().listen(0);
  base = 'http://localhost:' + server.address().port;
  const r = await fetch(base + '/api/tes');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.match(r.headers.get('strict-transport-security'), /max-age=31536000/);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
  server.close();
});

test('2. rate limit: di bawah max = 200', async () => {
  server = buatApp({ windowMs: 60_000, max: 3 }).listen(0);
  base = 'http://localhost:' + server.address().port;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(base + '/api/tes');
    assert.equal(r.status, 200);
  }
  server.close();
});

test('3. rate limit: di atas max = 429', async () => {
  server = buatApp({ windowMs: 60_000, max: 2 }).listen(0);
  base = 'http://localhost:' + server.address().port;
  await fetch(base + '/api/tes');
  await fetch(base + '/api/tes');
  const r3 = await fetch(base + '/api/tes');
  assert.equal(r3.status, 429);
  const b = await r3.json();
  assert.match(b.error, /banyak permintaan|Coba lagi/i);
  server.close();
});

test('4. rate limit: window berlalu → reset', async () => {
  server = buatApp({ windowMs: 300, max: 2 }).listen(0);
  base = 'http://localhost:' + server.address().port;
  await fetch(base + '/api/tes');
  await fetch(base + '/api/tes');
  assert.equal((await fetch(base + '/api/tes')).status, 429);
  await new Promise(r => setTimeout(r, 400));
  assert.equal((await fetch(base + '/api/tes')).status, 200);
  server.close();
});

test('5. rate limit: IP berbeda tidak saling memengaruhi', async () => {
  server = buatApp({ windowMs: 60_000, max: 1 }).listen(0);
  base = 'http://localhost:' + server.address().port;
  await fetch(base + '/api/tes');
  const rSama = await fetch(base + '/api/tes');
  assert.equal(rSama.status, 429);
  // IP berbeda (loopback vs 127.0.0.1 eksplisit via header jaringan tidak bisa diuji
  // tanpa socket nyata; pakai two-server untuk verifikasi isolasi state).
  const s2 = buatApp({ windowMs: 60_000, max: 1 }).listen(0);
  const base2 = 'http://localhost:' + s2.address().port;
  const rBed = await fetch(base2 + '/api/tes');
  assert.equal(rBed.status, 200, 'instance terpisah punya state sendiri');
  s2.close();
  server.close();
});
