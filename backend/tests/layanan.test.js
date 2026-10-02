const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const r_layanan = require('../src/routes/layanan');
const { seedLayanan } = require('../src/seedLayanan');

seedLayanan();
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
