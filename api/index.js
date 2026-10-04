// Entrypoint Vercel (serverless): re-export Express app tanpa WebSocket.
// Vercel menjalankan ini untuk setiap request; tidak ada state in-memory.
// File ini ada di <root>/api/index.js — path require relatif ke root repo.
module.exports = require('../backend/src/server.js');
