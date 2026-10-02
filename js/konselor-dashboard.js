// Dashboard konselor — antrian, detail, chat WS, status; panel admin (akun + audit).
var $ = function (s) { return document.querySelector(s); };
var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

var state = { saya: null, tiketAktif: null, ws: null };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function badge(status) {
  var kelas = status.split(' ')[0];
  return '<span class="badge badge-' + esc(kelas) + '">' + esc(status) + '</span>';
}
function waktu(ts) {
  var d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

async function api(path, opts) {
  var r = await fetch(path, Object.assign({ credentials: 'include' }, opts || {}));
  var body = null;
  var teks = await r.text();
  if (teks) { try { body = JSON.parse(teks); } catch (e) { body = teks; } }
  if (!r.ok) throw new Error((body && body.error) || ('HTTP ' + r.status));
  return body;
}

/* ---------- bootstrap ---------- */
(async function init() {
  try {
    state.saya = await api('/api/auth/me');
  } catch (e) {
    location.href = '/konselor/masuk';
    return;
  }
  if (state.saya.peran === 'admin') $('#tabAdmin').hidden = false;
  muatStatistik();
  muatAntrian();
  sambungDashboardWS();
  $('#btnLogout').addEventListener('click', logout);
  $('#filterStatus').addEventListener('change', muatAntrian);
  $('#tabAntrian').addEventListener('click', function () { gantiTab('antrian'); });
  $('#tabAdmin').addEventListener('click', function () { gantiTab('admin'); });
  $('#formAkun').addEventListener('submit', tambahAkun);
  $('#mdTutup').addEventListener('click', tutupModal);
  $('#mdSimpan').addEventListener('click', simpanStatus);
  $('#mdFormChat').addEventListener('submit', kirimChat);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') tutupModal(); });
  if (state.saya.peran === 'admin') muatAdmin();
})();

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* abaikan */ }
  location.href = '/konselor/masuk';
}

function gantiTab(t) {
  $('#tabAntrian').classList.toggle('active', t === 'antrian');
  $('#tabAdmin').classList.toggle('active', t === 'admin');
  $('#panelAntrian').hidden = t !== 'antrian';
  $('#panelAdmin').hidden = t !== 'admin';
  if (t === 'admin') muatAdmin();
}

/* ---------- statistik ---------- */
async function muatStatistik() {
  try {
    var s = await api('/api/dashboard/stats');
    $('#stTotal').textContent = s.total;
    $('#stBaru').textContent = s.baru;
    $('#stAktif').textContent = s.aktif;
    $('#stSelesai').textContent = s.selesai;
    if ($('#stDarurat')) $('#stDarurat').textContent = s.darurat || 0;
    if ($('#stHari')) $('#stHari').textContent = s.sehari || 0;
  } catch (e) { /* statistik non-kritis */ }
}

/* ---------- antrian ---------- */
async function muatAntrian() {
  var status = $('#filterStatus').value;
  var url = '/api/dashboard/antrian';
  if (status) url += '?status=' + encodeURIComponent(status);
  try {
    var data = await api(url);
    var tbody = $('#bodyAntrian');
    $('#antrianKosong').hidden = data.items.length > 0;
    tbody.innerHTML = data.items.map(function (p) {
      return '<tr>' +
        '<td><strong>' + esc(p.no_tiket) + '</strong>' + (p.dibaca ? '' : ' <span class="titik-baru" title="Baru"></span>') + (p.darurat ? ' <span class="tag tag-darurat">DARURAT</span>' : '') + '</td>' +
        '<td>' + esc(p.untuk) + '</td>' +
        '<td>' + esc(p.kategori) + '</td>' +
        '<td>' + badge(p.status) + '</td>' +
        '<td>' + waktu(p.dibuat) + '</td>' +
        '<td><button class="btn-buka" data-tiket="' + esc(p.no_tiket) + '">Buka</button></td>' +
        '</tr>';
    }).join('');
    $$('#bodyAntrian .btn-buka').forEach(function (b) {
      b.addEventListener('click', function () { bukaDetail(b.dataset.tiket); });
    });
  } catch (e) {
    $('#antrianKosong').hidden = false;
    $('#antrianKosong').textContent = 'Gagal memuat antrian: ' + e.message;
  }
}

/* ---------- detail tiket ---------- */
async function bukaDetail(tiket) {
  state.tiketAktif = tiket;
  $('#mdJudul').textContent = tiket;
  $('#mdInfo').innerHTML = '';
  $('#mdCerita').textContent = 'Memuat...';
  $('#mdChat').innerHTML = '';
  $('#modalDetail').hidden = false;
  try {
    var d = await api('/api/pengaduan/' + encodeURIComponent(tiket) + '/detail');
    $('#mdInfo').innerHTML =
      '<div><dt>Untuk</dt><dd>' + esc(d.untuk) + '</dd></div>' +
      '<div><dt>Kategori</dt><dd>' + esc(d.kategori) + '</dd></div>' +
      '<div><dt>Darurat</dt><dd>' + (d.darurat ? 'Ya' : 'Tidak') + '</dd></div>' +
      '<div><dt>Kontak pelapor</dt><dd>' + esc(d.kontak || '—') + '</dd></div>';
    $('#mdCerita').textContent = d.cerita || '(kosong)';
    $('#mdStatus').value = d.status;
    sambungWS(tiket);
  } catch (e) {
    $('#mdCerita').textContent = 'Gagal memuat detail: ' + e.message;
  }
}

function tutupModal() {
  $('#modalDetail').hidden = true;
  if (state.ws) { try { state.ws.close(); } catch (e) { /* abaikan */ } state.ws = null; }
  state.tiketAktif = null;
  muatAntrian();
}

/* ---------- ubah status ---------- */
async function simpanStatus() {
  if (!state.tiketAktif) return;
  var status = $('#mdStatus').value;
  try {
    await api('/api/pengaduan/' + encodeURIComponent(state.tiketAktif) + '/status', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: status })
    });
    var btn = $('#mdSimpan');
    btn.textContent = 'Tersimpan';
    setTimeout(function () { btn.textContent = 'Simpan'; }, 1500);
    muatStatistik();
  } catch (e) {
    alert('Gagal mengubah status: ' + e.message);
  }
}

/* ---------- chat WS konselor ---------- */
// Koneksi "live" dashboard: dengarkan pengaduan baru & pesan masuk,
// refresh antrian + statistik secara otomatis tanpa reload.
function sambungDashboardWS() {
  var url = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws';
  try { state.wsLive = new WebSocket(url); } catch (e) { return; }
  state.wsLive.onmessage = function (ev) {
    try {
      var m = JSON.parse(ev.data);
      if (m.type === 'hello') { state.wsLiveSid = m.sid; return; }
      if (m.type === 'pengaduan_baru') {
        muatStatistik();
        muatAntrian();
        notifLive((m.darurat ? 'Laporan darurat baru' : 'Laporan baru') + ': ' + m.tiket);
      }
    } catch (e) { /* abaikan */ }
  };
  state.wsLive.onclose = function () {
    setTimeout(function () { if (!state.wsLive || state.wsLive.readyState === 3) sambungDashboardWS(); }, 3000);
  };
}

function notifLive(teks) {
  var n = document.createElement('div');
  n.className = 'toast-dash';
  n.textContent = teks;
  document.body.appendChild(n);
  requestAnimationFrame(function () { n.classList.add('show'); });
  setTimeout(function () {
    n.classList.remove('show');
    setTimeout(function () { n.remove(); }, 350);
  }, 4200);
}

function sambungWS(tiket) {
  var url = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws?tiket=' + encodeURIComponent(tiket);
  // cookie HttpOnly 'session' ikut otomatis, jadi konselor terauth tanpa JS menyentuh token
  var ws;
  try { ws = new WebSocket(url); } catch (e) { bubbleChat('Tidak bisa terhubung ke server chat.', 'in'); return; }
  state.ws = ws;
  ws.onmessage = function (ev) {
    try {
      var m = JSON.parse(ev.data);
      if (m.type === 'hello') { state.wsSid = m.sid; return; }
      if (m.type === 'history' && Array.isArray(m.pesan)) {
        m.pesan.forEach(function (p) { bubbleChat(p.isi, p.pengirim === 'user' ? 'in' : 'out'); });
      } else if (m.type === 'pesan') {
        if (m.sid && m.sid === state.wsSid) return; // pesan kita sendiri, jangan double
        bubbleChat(m.isi, m.pengirim === 'user' ? 'in' : 'out');
      } else if (m.error) {
        bubbleChat('Pesan gagal: ' + m.error, 'in');
      }
    } catch (e) { /* abaikan */ }
  };
  ws.onerror = function () { bubbleChat('Koneksi chat terganggu.', 'in'); };
  ws.onclose = function () { if (state.ws === ws) state.ws = null; };
}

function bubbleChat(teks, arah) {
  var area = $('#mdChat');
  var b = document.createElement('div');
  b.className = 'bubble ' + (arah === 'out' ? 'bubble-out' : 'bubble-in');
  b.textContent = teks;
  area.appendChild(b);
  area.scrollTop = area.scrollHeight;
}

async function kirimChat(e) {
  e.preventDefault();
  var input = $('#mdInputChat');
  var teks = input.value.trim();
  if (!teks || !state.ws || state.ws.readyState !== 1) return;
  input.value = '';
  try {
    state.ws.send(JSON.stringify({ type: 'pesan', tiket: state.tiketAktif, isi: teks }));
    bubbleChat(teks, 'out');
  } catch (e2) { bubbleChat('Pesan gagal terkirim.', 'in'); }
}

/* ---------- panel admin ---------- */
async function muatAdmin() {
  try {
    var rows = await api('/api/dashboard/konselor');
    $('#bodyAkun').innerHTML = rows.map(function (k) {
      return '<tr>' +
        '<td><strong>' + esc(k.username) + '</strong>' + (k.id === state.saya.id ? ' (saya)' : '') + '</td>' +
        '<td>' + esc(k.nama) + '</td>' +
        '<td>' + esc(k.peran) + '</td>' +
        '<td>' + (k.aktif ? 'Aktif' : 'Nonaktif') + '</td>' +
        '<td>' + (k.id === state.saya.id ? '' :
          '<button class="btn-kecil" data-id="' + k.id + '" data-aktif="' + (k.aktif ? 0 : 1) + '">' +
          (k.aktif ? 'Nonaktifkan' : 'Aktifkan') + '</button>') + '</td>' +
        '</tr>';
    }).join('');
    $$('#bodyAkun .btn-kecil').forEach(function (b) {
      b.addEventListener('click', function () { toggleAkun(b.dataset.id, b.dataset.aktif === '1'); });
    });
  } catch (e) { /* abaikan */ }
  try {
    var log = await api('/api/dashboard/audit');
    $('#bodyAudit').innerHTML = log.map(function (a) {
      return '<tr><td>' + waktu(a.waktu) + '</td><td>' + esc(a.aktor) + '</td><td>' + esc(a.aksi) + '</td><td>' + esc(a.detail || '') + '</td></tr>';
    }).join('');
  } catch (e) { /* abaikan */ }
}

async function toggleAkun(id, jadiAktif) {
  try {
    await api('/api/dashboard/konselor/' + id + '/aktif', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aktif: jadiAktif })
    });
    muatAdmin();
  } catch (e) { alert('Gagal: ' + e.message); }
}

async function tambahAkun(e) {
  e.preventDefault();
  var f = e.target;
  try {
    await api('/api/dashboard/konselor', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: f.akunUsername.value.trim(),
        nama: f.akunNama.value.trim(),
        sandi: f.akunSandi.value,
        peran: f.akunPeran.value
      })
    });
    f.reset();
    muatAdmin();
  } catch (e2) { alert('Gagal menambah akun: ' + e2.message); }
}
