// Security headers manual (helmet-style) + CSP.
// Diletakkan SEBELUM router (middleware global), coverage penuh semua response.
module.exports = function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');                // anti clickjacking
  res.setHeader('X-XSS-Protection', '1; mode=block');       // legacy browser guard
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  // CSP: self-only, tidak ada inline script, WebSocket dari origin sendiri,
  //        object-src none (mencegah plugin flash / embed berbahaya),
  //        frame-ancestors none (tidak bisa diembed di iframe manapun).
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "script-src 'self'",
    "img-src 'self' data: https://cdn.jsdelivr.net https://*.supabase.co",
    "connect-src 'self' ws: wss: https://*.supabase.co https://api.telegram.org",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; '));
  next();
};
