// Entrypoint Vercel (serverless): re-export Express app tanpa WebSocket.
// Vercel menjalankan ini untuk setiap request; tidak ada state in-memory.
module.exports = require('./src/server.js');
