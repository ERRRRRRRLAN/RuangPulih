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
