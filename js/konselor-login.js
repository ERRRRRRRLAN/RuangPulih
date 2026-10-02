// Login konselor — POST /api/auth/login, cookie HttpOnly, redirect ke dashboard.
var form = document.getElementById('formLogin');
var err = document.getElementById('err');
var btn = form.querySelector('button[type="submit"]');

form.addEventListener('submit', async function (e) {
  e.preventDefault();
  err.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Memeriksa...';
  try {
    var r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: form.username.value.trim(), sandi: form.sandi.value })
    });
    if (r.ok) {
      location.href = '/konselor/dashboard.html';
      return;
    }
    var b = await r.json().catch(function () { return {}; });
    err.textContent = b.error || 'Username atau sandi salah.';
  } catch (e2) {
    err.textContent = 'Tidak bisa terhubung ke server. Coba lagi.';
  }
  btn.disabled = false;
  btn.textContent = 'Masuk';
});
