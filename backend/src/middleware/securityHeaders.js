// Security headers manual (helmet-style) + CSP.
module.exports = function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');              // anti clickjacking
  res.setHeader('Referrer-Policy', 'no-referrer');       // jangan bocor referrer
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  // CSP: tidak ada inline script; WebSocket diizinkan dari origin sendiri
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self' ws: wss:"
  ].join('; '));
  next();
};
