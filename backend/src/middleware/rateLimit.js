// Rate limiter sederhana, in-memory (ip -> timestamps).
// Cukup untuk skala 1 server; reset tiap restart.
module.exports = function rateLimit({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map();
  return (req, res, next) => {
    const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'x';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' });
    }
    arr.push(now);
    hits.set(ip, arr);
    next();
  };
};
