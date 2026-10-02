// Seed data layanan rujukan (dari PDF Bab III).
const db = require('./db');

const LAYANAN = [
  { nama: 'BNN', jenis: 'darurat', kontak: '188', deskripsi: 'Layanan terpadu 24 jam untuk penanganan penyalahgunaan napza.', urutan: 1 },
  { nama: 'Medis / Ambulans', jenis: 'darurat', kontak: '119', deskripsi: 'Untuk overdosis atau kondisi medis darurat.', urutan: 2 },
  { nama: 'Polri', jenis: 'darurat', kontak: '110', deskripsi: 'Untuk laporan tindak pidana atau situasi tidak aman.', urutan: 3 },
  { nama: 'Puskesmas', jenis: 'rujukan', kontak: null, deskripsi: 'Cek kesehatan dan layanan konseling dasar tanpa biaya.', urutan: 4 },
];

function seedLayanan() {
  if (db.prepare('SELECT COUNT(*) c FROM layanan').get().c === 0) {
    const stmt = db.prepare('INSERT INTO layanan (nama,jenis,kontak,deskripsi,urutan) VALUES (?,?,?,?,?)');
    LAYANAN.forEach(l => stmt.run(l.nama, l.jenis, l.kontak || null, l.deskripsi, l.urutan));
    console.log('seed layanan: ' + LAYANAN.length + ' baris');
  }
}

module.exports = { seedLayanan };
