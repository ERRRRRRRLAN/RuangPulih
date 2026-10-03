// Database layer — PostgreSQL (Supabase) via node-postgres.
// Skema dikelola lewat migrasi Supabase (lihat schema-postgres.sql / dashboard).
// Module ini mengekspos API mirip better-sqlite3 (prepare/run/get/all) yang
// diemulasikan oleh src/dbpg.js, agar route tetap ringkas.
const db = require('./dbpg');
module.exports = db;
