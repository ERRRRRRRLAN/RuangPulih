// Dashboard konselor — antrian, detail, chat WS, status; panel admin (akun + audit).
var $ = function (s) { return document.querySelector(s); };
var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

var state = { saya: null, tiketAktif: null, modeMinat: false, ws: null };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function badge(status) {
  var kelas = status.split(' ')[0];
  return '<span class="badge badge-' + esc(kelas) + '">' + esc(status) + '</span>';
}

/* ---------- custom dropdown (neo-select) ---------- */
// Sinkron antara elemen .neo-select (visual) dan <select> asli (tersembunyi).
// Sengaja tidak memakai script.js agar dashboard tetap mandiri.
function siapkanSatuNeoSelect(ns) {
  var trigger = ns.querySelector('.neo-select-trigger');
  var valueEl = ns.querySelector('.neo-select-value');
  var panel = ns.querySelector('.neo-select-panel');
  if (!trigger || !panel) return;
  // Hapus listener lama: bungkus dengan flag idempoten supaya aman dipanggil ulang
  // (opsi modal status ditukar saat mode minat → perlu rebind tanpa dobel).
  if (ns.__rebind) ns.__rebind();
  var hidden = document.getElementById(ns.id.replace(/Neo$/, '')) || null;

  function sync(value) {
    if (hidden) hidden.value = value;
    var chosen = null;
    panel.querySelectorAll('.neo-select-option').forEach(function (o) {
      var on = o.getAttribute('data-value') === String(value);
      o.classList.toggle('sel', on);
      if (on) chosen = o;
    });
    if (chosen) valueEl.textContent = chosen.textContent.trim();
  }
  function setOpen(open) {
    ns.classList.toggle('open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function onTrigger(e) { e.stopPropagation(); setOpen(!ns.classList.contains('open')); }
  function onOption(e) {
    e.stopPropagation();
    sync(e.currentTarget.getAttribute('data-value'));
    setOpen(false);
    if (hidden && hidden.id === 'filterStatus') muatAntrian();
  }
  function onDoc() { setOpen(false); }

  trigger.addEventListener('click', onTrigger);
  panel.querySelectorAll('.neo-select-option').forEach(function (o) { o.addEventListener('click', onOption); });
  document.addEventListener('click', onDoc);

  ns.__rebind = function () {
    trigger.removeEventListener('click', onTrigger);
    panel.querySelectorAll('.neo-select-option').forEach(function (o) { o.removeEventListener('click', onOption); });
    document.removeEventListener('click', onDoc);
    ns.__rebind = null;
  };

  // nilai awal dari <select> asli
  if (hidden && hidden.value) sync(hidden.value);
  else sync('');
}
function siapkanNeoSelect() {
  $$('.neo-select').forEach(siapkanSatuNeoSelect);
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
  $('#filterMinat').addEventListener('change', muatMinat);
  $('#filterRujukan').addEventListener('change', muatRujukan);
  $('#tabAntrian').addEventListener('click', function () { gantiTab('antrian'); });
  $('#tabMinat').addEventListener('click', function () { gantiTab('minat'); });
  $('#tabRujukan').addEventListener('click', function () { gantiTab('rujukan'); });
  $('#mdAmbil').addEventListener('click', function () {
    if (state.tiketAktif) ambilMinat(state.tiketAktif);
  });
  $('#tabAdmin').addEventListener('click', function () { gantiTab('admin'); });
  $('#formAkun').addEventListener('submit', tambahAkun);
  $('#mdTutup').addEventListener('click', tutupModal);
  $('#mdSimpan').addEventListener('click', simpanStatus);
  $('#mdRujuk').addEventListener('click', bukaModalRujuk);
  $('#mrTutup').addEventListener('click', tutupModalRujuk);
  $('#msrTutup').addEventListener('click', function () { $('#modalStatusRujuk').hidden = true; });
  $('#msrSimpan').addEventListener('click', simpanStatusRujukan);
  $('#formRujuk').addEventListener('submit', kirimRujukan);
  $('#mdFormChat').addEventListener('submit', kirimChat);
  $('#mdInputChat').addEventListener('input', kirimTyping);
  siapkanNeoSelect();
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('#modalStatusRujuk').hidden = true; tutupModalRujuk(); tutupModal(); } });
  // Klik backdrop (area gelap di luar kotak) = tutup modal. Lebih cepat dari
  // mencari tombol "Tutup" — apalagi di mobile.
  [['modalDetail', tutupModal], ['modalRujuk', tutupModalRujuk], ['modalStatusRujuk', function () { $('#modalStatusRujuk').hidden = true; }]].forEach(function (p) {
    var m = $('#' + p[0]);
    if (!m) return;
    m.addEventListener('click', function (e) { if (e.target === m) p[1](); });
  });
  if (state.saya.peran === 'admin') muatAdmin();
})();

async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* abaikan */ }
  location.href = '/konselor/masuk';
}

function gantiTab(t) {
  $('#tabAntrian').classList.toggle('active', t === 'antrian');
  $('#tabMinat').classList.toggle('active', t === 'minat');
  $('#tabRujukan').classList.toggle('active', t === 'rujukan');
  $('#tabAdmin').classList.toggle('active', t === 'admin');
  $('#panelAntrian').hidden = t !== 'antrian';
  $('#panelMinat').hidden = t !== 'minat';
  $('#panelRujukan').hidden = t !== 'rujukan';
  $('#panelAdmin').hidden = t !== 'admin';
  if (t === 'antrian') muatAntrian();
  if (t === 'minat') muatMinat();
  if (t === 'rujukan') muatRujukan();
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
      return '<tr data-tiket="' + esc(p.no_tiket) + '" tabindex="0">' +
        '<td><strong>' + esc(p.no_tiket) + '</strong>' + (p.dibaca ? '' : ' <span class="titik-baru" title="Baru"></span>') + (p.darurat ? ' <span class="tag tag-darurat">DARURAT</span>' : '') + '</td>' +
        '<td>' + esc(p.untuk) + '</td>' +
        '<td>' + esc(p.kategori) + '</td>' +
        '<td>' + badge(p.status) + '</td>' +
        '<td>' + waktu(p.dibuat) + '</td>' +
        '<td><button class="btn-buka" data-tiket="' + esc(p.no_tiket) + '">Buka</button></td>' +
        '</tr>';
    }).join('');
    $$('#bodyAntrian .btn-buka').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); bukaDetail(b.dataset.tiket); });
    });
    // seluruh baris juga bisa diklik (cursor pointer sudah diset di CSS)
    $$('#bodyAntrian tr[data-tiket]').forEach(function (tr) {
      tr.addEventListener('click', function () { bukaDetail(tr.dataset.tiket); });
    });
  } catch (e) {
    $('#antrianKosong').hidden = false;
    $('#antrianKosong').textContent = 'Gagal memuat antrian: ' + e.message;
  }
}

/* ---------- detail tiket ---------- */
async function bukaDetail(tiket) {
  state.tiketAktif = tiket;
  state.modeMinat = false;
  $('#mdAmbil').hidden = true;
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
    // Balasan cepat sesuai tingkat urgensi: tiket darurat pakai konteks darurat.
    isiQuickChat(d.darurat ? 'darurat' : 'biasa');
    // sinkron neo-select status modal ke nilai dari server
    var statusNeo = $('#mdStatusNeo');
    if (statusNeo) {
      var pilihStatus = statusNeo.querySelector('[data-value="' + esc(d.status) + '"]');
      if (pilihStatus) pilihStatus.click();
      else { statusNeo.querySelector('.neo-select-value').textContent = d.status; }
      $('#mdStatus').value = d.status;
    }
    sambungWS(tiket);
  } catch (e) {
    $('#mdCerita').textContent = 'Gagal memuat detail: ' + e.message;
  }
}

/* ---------- minat program pemulihan (PM-...) ---------- */
// Inilah jembatan: konselor melihat pendaftar minat, mengambil penanganan,
// mengubah status, dan chat langsung — semua tanpa identitas pelapor.
async function muatMinat() {
  var status = $('#filterMinat').value;
  var url = '/api/dashboard/minat';
  if (status) url += '?status=' + encodeURIComponent(status);
  try {
    var data = await api(url);
    var tbody = $('#bodyMinat');
    $('#minatKosong').hidden = data.items.length > 0;
    tbody.innerHTML = data.items.map(function (m) {
      return '<tr data-kode="' + esc(m.kode_lacak) + '" tabindex="0">' +
        '<td><strong>' + esc(m.kode_lacak) + '</strong>' + (m.prioritas === 'Tinggi' ? ' <span class="tag tag-darurat">PENTING</span>' : '') + '</td>' +
        '<td>' + esc(m.program) + '</td>' +
        '<td>' + esc(m.panggilan || '—') + (m.usia ? ' <span class="teks-mute">(' + m.usia + ' th)</span>' : '') + '</td>' +
        '<td>' + badge(m.status) + '</td>' +
        '<td>' + esc(m.prioritas) + '</td>' +
        '<td>' + esc(m.ditangani_oleh || '—') + '</td>' +
        '<td><button class="btn-buka" data-kode="' + esc(m.kode_lacak) + '">Buka</button></td>' +
        '</tr>';
    }).join('');
    $$('#bodyMinat .btn-buka').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); bukaDetailMinat(b.dataset.kode); });
    });
    $$('#bodyMinat tr[data-kode]').forEach(function (tr) {
      tr.addEventListener('click', function () { bukaDetailMinat(tr.dataset.kode); });
    });
  } catch (e) {
    $('#minatKosong').hidden = false;
    $('#minatKosong').textContent = 'Gagal memuat minat: ' + e.message;
  }
}

async function bukaDetailMinat(kode) {
  state.tiketAktif = kode;
  state.modeMinat = true;
  $('#mdJudul').textContent = 'Minat Program ' + kode;
  $('#mdInfo').innerHTML = '';
  $('#mdCerita').textContent = 'Memuat...';
  $('#mdChat').innerHTML = '';
  // Balasan cepat khusus konteks pendaftar program.
  isiQuickChat('minat');
  $('#modalDetail').hidden = false;
  $('#mdSimpan').dataset.mode = 'minat';

  // Status minat berbeda dari pengaduan: tukar opsi neo-select modal.
  var statusNeo = $('#mdStatusNeo');
  if (statusNeo) {
    var panel = statusNeo.querySelector('.neo-select-panel');
    panel.innerHTML = ['Baru', 'Dihubungi', 'Terdaftar', 'Selesai']
      .map(function (s) { return '<button type="button" class="neo-select-option" data-value="' + s + '">' + s + '</button>'; })
      .join('');
    var trigger = statusNeo.querySelector('.neo-select-trigger');
    if (trigger) trigger.setAttribute('aria-haspopup', 'listbox');
    // Pasang ulang listener neo-select: node option diganti total, listener
    // lama melekat pada node yang sudah dibuang.
    siapkanSatuNeoSelect(statusNeo);
  }

  try {
    var data = await api('/api/dashboard/minat');
    var m = data.items.find(function (x) { return x.kode_lacak === kode; });
    if (!m) throw new Error('minat tidak ditemukan');
    $('#mdInfo').innerHTML =
      '<div><dt>Program</dt><dd>' + esc(m.program) + '</dd></div>' +
      '<div><dt>Panggilan</dt><dd>' + esc(m.panggilan || '—') + '</dd></div>' +
      '<div><dt>Usia</dt><dd>' + (m.usia ? m.usia + ' tahun' : '—') + '</dd></div>' +
      '<div><dt>Prioritas</dt><dd>' + esc(m.prioritas) + '</dd></div>' +
      '<div><dt>Kontak</dt><dd>' + esc(m.kontak || 'tidak diberikan (anonim)') + '</dd></div>' +
      '<div><dt>Penangan</dt><dd>' + esc(m.ditangani_oleh || 'belum ditugaskan') + '</dd></div>';
    $('#mdCerita').textContent = m.catatan || '(tidak ada catatan)';
    // Tampilkan tombol ambil penanganan kalau belum ada yang menangani.
    $('#mdAmbil').hidden = !!m.ditangani_oleh && String(m.ditangani_oleh).toLowerCase() !== 'null';
    if (statusNeo) {
      var pilih = statusNeo.querySelector('[data-value="' + esc(m.status) + '"]');
      if (pilih) pilih.click();
      else statusNeo.querySelector('.neo-select-value').textContent = m.status;
      $('#mdStatus').value = m.status;
    }
    sambungWS(kode);
  } catch (e) {
    $('#mdCerita').textContent = 'Gagal memuat detail: ' + e.message;
  }
}

// Ambil alih penanganan minat (assign diri sendiri).
// Otomatis dipanggil saat konselor mengirim pesan pertama di tiket minat
// yang belum ditugaskan — ngobrol = menangani, tidak perlu klik tombol.
async function ambilMinat(kode) {
  try {
    await api('/api/dashboard/minat/' + encodeURIComponent(kode), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ambil: true, status: 'Dihubungi' })
    });
    notifLive('Minat ' + kode + ' sekarang ditangani Anda.');
    $('#mdAmbil').hidden = true;
    muatMinat();
  } catch (e) {
    alert('Gagal mengambil minat: ' + e.message);
  }
}

async function simpanMinat() {
  if (!state.tiketAktif || !state.modeMinat) return;
  var status = $('#mdStatus').value;
  try {
    await api('/api/dashboard/minat/' + encodeURIComponent(state.tiketAktif), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: status })
    });
    var btn = $('#mdSimpan');
    btn.textContent = 'Tersimpan';
    setTimeout(function () { btn.textContent = 'Simpan'; }, 1500);
    muatMinat();
  } catch (e) {
    alert('Gagal mengubah status: ' + e.message);
  }
}

/* ---------- rujukan ke pihak berwajib (RJ-...) ---------- */
// Jembatan konselor -> polisi/dokter. Pelapor tetap anonim: pihak berwajib
// hanya melihat kode rujukan + ringkasan kasus, tidak pernah sumber tiketnya.
async function muatRujukan() {
  var status = $('#filterRujukan').value;
  var url = '/api/rujukan';
  if (status) url += '?status=' + encodeURIComponent(status);
  try {
    var data = await api(url);
    var tbody = $('#bodyRujukan');
    $('#rujukanKosong').hidden = data.items.length > 0;
    tbody.innerHTML = data.items.map(function (r) {
      return '<tr data-kode="' + esc(r.kode_rujukan) + '">' +
        '<td><strong>' + esc(r.kode_rujukan) + '</strong></td>' +
        '<td>' + esc(r.tujuan) + '</td>' +
        '<td>' + esc(r.instansi || '—') + '</td>' +
        '<td>' + esc(r.sumber_tiket || '—') + '</td>' +
        '<td>' + badge(r.status) + '</td>' +
        '<td>' + waktu(r.diupdate || r.dibuat) + '</td>' +
        '<td><button class="btn-kecil" data-kode="' + esc(r.kode_rujukan) + '">Update Status</button></td>' +
        '</tr>';
    }).join('');
    $$('#bodyRujukan .btn-kecil').forEach(function (b) {
      b.addEventListener('click', function () { updateStatusRujukan(b.dataset.kode); });
    });
  } catch (e) {
    $('#rujukanKosong').hidden = false;
    $('#rujukanKosong').textContent = 'Gagal memuat rujukan: ' + e.message;
  }
}

function bukaModalRujuk() {
  if (!state.tiketAktif) return;
  $('#mrTiket').value = state.tiketAktif;
  $('#modalRujuk').hidden = false;
}

function tutupModalRujuk() {
  $('#modalRujuk').hidden = true;
  $('#formRujuk').reset();
}

async function kirimRujukan(e) {
  e.preventDefault();
  var tujuan = $('#mrTujuan').value;
  var alasan = $('#mrAlasan').value.trim();
  if (!tujuan) { alert('Pilih tujuan rujukan dulu.'); return; }
  if (alasan.length < 20) { alert('Alasan minimal 20 karakter.'); return; }
  var btn = $('#formRujuk button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Mengirim...';
  try {
    var res = await api('/api/rujukan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tiket: $('#mrTiket').value,
        tujuan: tujuan,
        instansi: $('#mrInstansi').value.trim(),
        alasan: alasan
      })
    });
    notifLive('Rujukan ' + res.kode_rujukan + ' terkirim ke ' + tujuan + '.');
    tutupModalRujuk();
    muatRujukan();
  } catch (e2) {
    alert('Gagal membuat rujukan: ' + e2.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Kirim Rujukan';
  }
}

async function updateStatusRujukan(kode) {
  state.rujukanAktif = kode;
  $('#msrJudul').textContent = 'Update Status Rujukan ' + kode;
  $('#msrStatus').value = 'Diproses';
  // sinkron tampilan neo-select ke nilai default
  var neo = $('#msrStatusNeo');
  if (neo) {
    var pilih = neo.querySelector('[data-value="Diproses"]');
    if (pilih) pilih.click();
  }
  $('#modalStatusRujuk').hidden = false;
}

async function simpanStatusRujukan() {
  var kode = state.rujukanAktif;
  var status = $('#msrStatus').value;
  if (!kode || !status) return;
  var btn = $('#msrSimpan');
  btn.disabled = true; btn.textContent = 'Menyimpan...';
  try {
    await api('/api/rujukan/' + encodeURIComponent(kode), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: status })
    });
    notifLive('Rujukan ' + kode + ' → ' + status);
    $('#modalStatusRujuk').hidden = true;
    muatRujukan();
  } catch (e) {
    alert('Gagal mengubah status rujukan: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Simpan';
  }
}

function tutupModal() {
  $('#modalDetail').hidden = true;
  if (state.ws) { try { state.ws.close(); } catch (e) { /* abaikan */ } state.ws = null; }
  state.tiketAktif = null;
  state.modeMinat = false;
  pulihkanOpsiStatus();
  if (!$('#panelMinat').hidden) muatMinat(); else muatAntrian();
}

// Modal detail dipakai bersama oleh pengaduan & minat. Opsi status minat
// ditukar saat buka detail minat; pulihkan ke opsi pengaduan saat ditutup.
function pulihkanOpsiStatus() {
  var statusNeo = $('#mdStatusNeo');
  if (!statusNeo) return;
  var panel = statusNeo.querySelector('.neo-select-panel');
  if (!panel) return;
  var pengaduan = ['Diterima', 'Ditinjau', 'Dalam Penanganan', 'Selesai'];
  if (!panel.querySelector('[data-value="' + pengaduan[0] + '"]')) {
    panel.innerHTML = pengaduan
      .map(function (s) { return '<button type="button" class="neo-select-option" data-value="' + s + '">' + s + '</button>'; })
      .join('');
    statusNeo.querySelector('.neo-select-value').textContent = 'Status';
    $('#mdStatus').value = '';
    siapkanSatuNeoSelect(statusNeo);
  }
}

/* ---------- ubah status ---------- */
async function simpanStatus() {
  if (!state.tiketAktif) return;
  // Mode minat program (PM-...) punya endpoint sendiri.
  if (state.modeMinat) return simpanMinat();
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
      } else if (m.type === 'pesan_baru') {
        // pelapor mengirim chat di tiket lain → tandai baris belum dibaca
        if (m.tiket !== state.tiketAktif) {
          muatAntrian();
          notifLive('Chat baru di ' + m.tiket);
        }
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
        // pastikan history hanya merender tiket yang sedang aktif (bisa terjadi
        // race: modal sudah ditutup/selesai membuka tiket lain saat WS lama balas)
        if (m.tiket !== state.tiketAktif) return;
        $('#mdChat').innerHTML = '';
        // server kirim {pengirim:'user'|'konselor'} — kita konselor, jadi
        // pesan user = masuk (in), pesan konselor = keluar (out)
        m.pesan.forEach(function (p) {
          bubbleChat(p.isi, p.pengirim === 'user' ? 'in' : 'out', p.dibuat);
        });
      } else if (m.type === 'typing') {
        if (m.dari === 'user') tampilkanMengetik();
      } else if (m.type === 'pesan') {
        if (m.sid && m.sid === state.wsSid) return; // pesan kita sendiri, jangan double
        // abaikan pesan yang bukan untuk tiket yang sedang dibuka
        if (m.tiket !== state.tiketAktif) return;
        // abaikan jika sudah ada (history baru saja memuat pesan yang sama)
        if (chatSudahAda($('#mdChat'), m.isi, m.dibuat)) return;
        hapusMengetik();
        // arah pasti: kita konselor → pesan pelapor selalu 'in' (kiri),
        // tidak peduli flag pengirim/dari dari server
        bubbleChat(m.isi, 'in', m.dibuat);
      } else if (m.error) {
        bubbleChat('Pesan gagal: ' + m.error, 'in');
      }
    } catch (e) { /* abaikan */ }
  };
  ws.onerror = function () { bubbleChat('Koneksi chat terganggu.', 'in'); };
  ws.onclose = function () { if (state.ws === ws) state.ws = null; };
}

// Cegah duplikat: pesan WS bisa tiba bersamaan/sebelum history saat reconnect
// cepat atau saat modal ditutup-buka. Bandingkan teks+timestamp bubble terakhir.
function chatSudahAda(area, teks, dibuat) {
  if (!area || teks == null) return false;
  var kids = area.querySelectorAll('.bubble:not(.typing)');
  if (!kids.length) return false;
  var last = kids[kids.length - 1];
  if (last.textContent !== String(teks)) return false;
  var t = last.getAttribute('data-ts');
  if (t && String(t) !== String(dibuat)) return false;
  return true;
}

function tampilkanMengetik() {
  var area = $('#mdChat');
  if (area.querySelector('.typing')) return;
  var d = document.createElement('div');
  d.className = 'bubble bubble-in typing';
  d.innerHTML = '<span class="titik"></span><span class="titik"></span><span class="titik"></span>';
  area.appendChild(d);
  area.scrollTop = area.scrollHeight;
}
function hapusMengetik() { var t = $('#mdChat .typing'); if (t) t.remove(); }

var timeoutMengetik = null;
function kirimTyping() {
  if (!state.ws || state.ws.readyState !== 1 || !state.tiketAktif) return;
  clearTimeout(timeoutMengetik);
  state.ws.send(JSON.stringify({ type: 'typing', tiket: state.tiketAktif }));
  // throttle: kirim tiap 1.2s saat terus mengetik
  timeoutMengetik = setTimeout(function () {}, 1200);
}

function bubbleChat(teks, arah, ts) {
  var area = $('#mdChat');
  var b = document.createElement('div');
  b.className = 'bubble ' + (arah === 'out' ? 'bubble-out' : 'bubble-in');
  b.textContent = teks;
  if (ts != null) b.setAttribute('data-ts', String(ts));
  area.appendChild(b);
  area.scrollTop = area.scrollHeight;
}

async function kirimChat(e) {
  e.preventDefault();
  var input = $('#mdInputChat');
  var teks = input.value.trim();
  if (!teks) return;

  // SLASH COMMAND: ubah status dll lewat chat, tanpa sentuh form.
  // /status selesai  /program Rehabilitasi Rawat Jalan  /ambil  /selesai
  if (teks.charAt(0) === '/' && jalankanPerintah(teks)) {
    input.value = '';
    return;
  }

  if (!state.ws || state.ws.readyState !== 1) return;
  input.value = '';

  // Mode minat: konselor sudah mengobrol → otomatis ambil penanganan jika
  // belum ada yang ditugaskan. Tidak perlu klik "Ambil Penanganan" dulu.
  if (state.modeMinat && state.tiketAktif && !$('#mdAmbil').hidden) {
    ambilMinat(state.tiketAktif);
  }

  try {
    state.ws.send(JSON.stringify({ type: 'pesan', tiket: state.tiketAktif, isi: teks }));
    bubbleChat(teks, 'out');
  } catch (e2) { bubbleChat('Pesan gagal terkirim.', 'in'); }
}

/* ===================== SLASH COMMAND KONSELOR ===================== */
// Filosofi: konselor sudah mengobrol dengan pelapor — kenapa harus pindah ke
// form cuma buat ganti status? Ketik aja di chat.
//
//   /status <status>   ubah status (dengan pelengkap/tab daftar status)
//   /selesai           shortcut status Selesai
//   /program <nama>    ubah program minat (mis. cocoknya pindah ke rawat inap)
//   /ambil             ambil alih penanganan
//   /bantuan           daftar perintah
//
// Command tidak dikirim ke pelapor — hanya dieksekusi. Umpan baliknya
// ditampilkan sebagai gelembung sistem (bukan pesan konselor).
function bubbleSistem(teks) {
  var area = $('#mdChat');
  var d = document.createElement('div');
  d.className = 'bubble bubble-sistem';
  d.textContent = teks;
  area.appendChild(d);
  area.scrollTop = area.scrollHeight;
}

// Daftar status valid per mode (untuk pelengkap & validasi).
function daftarStatus(mode) {
  return mode === 'minat'
    ? ['Baru', 'Dihubungi', 'Terdaftar', 'Selesai']
    : ['Diterima', 'Ditinjau', 'Dalam Penanganan', 'Selesai'];
}

function statusCocok(mode, nilai) {
  var pool = daftarStatus(mode);
  var v = String(nilai || '').trim().toLowerCase();
  if (!v) return null;
  var persis = pool.find(function (s) { return s.toLowerCase() === v; });
  if (persis) return persis;
  return pool.find(function (s) { return s.toLowerCase().indexOf(v) === 0; }) || null;
}

function jalankanPerintah(teks) {
  var bagian = teks.slice(1).split(/\s+/).filter(Boolean);
  if (!bagian.length) return false;
  var cmd = bagian[0].toLowerCase();
  var arg = bagian.slice(1).join(' ');
  var mode = state.modeMinat ? 'minat' : 'pengaduan';
  var tiket = state.tiketAktif;

  if (cmd === 'bantuan' || cmd === 'help') {
    bubbleSistem('PERINTAH — /status <status> · /selesai · /program <nama> · /ambil · /bantuan. Command ini tidak dikirim ke pelapor.');
    return true;
  }

  if (cmd === 'ambil') {
    if (mode !== 'minat') { bubbleSistem('/ambil hanya untuk pendaftaran program (PM-…).'); return true; }
    ambilMinat(tiket);
    return true;
  }

  // /status tanpa argumen: tampilkan daftar status (pelengkap/tab completer).
  if (cmd === 'status' && !arg) {
    bubbleSistem('Pilih status: ' + daftarStatus(mode).join(' · ') + '. Contoh: /status selesai');
    return true;
  }

  if (cmd === 'status' || cmd === 'selesai') {
    var nilai = cmd === 'selesai' ? 'Selesai' : statusCocok(mode, arg);
    if (!nilai) {
      bubbleSistem('Status tidak dikenal. Pilihan: ' + daftarStatus(mode).join(' · ') + '.');
      return true;
    }
    ubahStatusChat(mode, tiket, nilai);
    return true;
  }

  if (cmd === 'program') {
    if (mode !== 'minat') { bubbleSistem('/program hanya untuk pendaftaran program (PM-…).'); return true; }
    if (!arg) { bubbleSistem('Contoh: /program Rehabilitasi Rawat Inap'); return true; }
    ubahProgramChat(tiket, arg);
    return true;
  }

  bubbleSistem('Perintah tidak dikenal: /' + cmd + '. Ketik /bantuan untuk daftar.');
  return true;
}

// Ubah status langsung dari chat. Tidak ada tombol Simpan, tidak ada form.
async function ubahStatusChat(mode, tiket, nilai) {
  var endpoint = mode === 'minat'
    ? '/api/dashboard/minat/' + encodeURIComponent(tiket)
    : '/api/pengaduan/' + encodeURIComponent(tiket) + '/status';
  try {
    await api(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mode === 'minat' ? { status: nilai, ambil: true } : { status: nilai })
    });
    // sinkron tampilan neo-select modal ke nilai baru
    var neo = $('#mdStatusNeo');
    if (neo) {
      var pilih = neo.querySelector('[data-value="' + nilai + '"]');
      if (pilih) pilih.click();
    }
    var hid = $('#mdStatus');
    if (hid) hid.value = nilai;
    notifLive('Status ' + tiket + ' → ' + nilai);
    if (mode === 'minat') muatMinat(); else { muatAntrian(); muatStatistik(); }
  } catch (e) {
    bubbleChat('Gagal ubah status: ' + e.message, 'in');
  }
}

// Ubah program pendaftar langsung dari chat (mis. ternyata cocok rawat inap).
async function ubahProgramChat(tiket, program) {
  var pilihan = ['Detoksifikasi', 'Rehabilitasi Rawat Inap', 'Rehabilitasi Rawat Jalan', 'Aftercare'];
  var cocok = pilihan.find(function (p) { return p.toLowerCase().indexOf(program.toLowerCase()) === 0; });
  if (!cocok) {
    bubbleChat('Program tidak dikenal. Pilihan: ' + pilihan.join(', ') + '.', 'in');
    return;
  }
  try {
    await api('/api/dashboard/minat/' + encodeURIComponent(tiket), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ program: cocok })
    });
    notifLive('Program ' + tiket + ' → ' + cocok);
    muatMinat();
  } catch (e) {
    bubbleChat('Gagal ubah program: ' + e.message, 'in');
  }
}

/* ---------- BALASAN CEPAT KONSELOR ---------- */
// Daftar balasan siap pakai per konteks tiket.
var QUICK_TEKS = {
  darurat: [
    'Kamu sedang dalam kondisi yang berat. Kalau nyawa terancam sekarang, telepon 119 (medis) atau 110 (polisi) — saya tetap di sini menemani.',
    'Sementara ini, jauhi situasi yang membahayakan diri kamu. Kita cari langkah paling aman bersama-sama, perlahan-lahan.',
    'Kamu sudah berusaha sangat kuat sampai bisa cerita ke sini. Minta bantuan itu bukan kalah — itu langkah berani.',
    'Saya tetap di sini menemani kamu. Ceritakan apa yang membuat kamu merasa tidak aman, sebentar saja.'
  ],
  minat: [
    'Terima kasih sudah mendaftar minat program. Saya akan bantu mengarahkan kamu ke program yang paling sesuai.',
    'Ada beberapa pilihan: rawat inap, rawat jalan, atau aftercare. Kita bahas perlahan-lahan, tidak ada yang memaksa.',
    'Saya di sini mendengarkan. Ceritakan kondisi kamu sekarang, dan kita lihat program mana yang paling pas.',
    'Kamu sudah berusaha kuat. Mendaftar ke program ini langkah berani, dan kamu tidak akan melaluinya sendirian.'
  ],
  biasa: [
    'Terima kasih sudah cerita. Hal yang kamu rasakan itu sah, dan kamu tidak sendirian.',
    'Saya di sini mendengarkan. Tidak ada yang akan menilai atau memaksa.',
    'Kamu sudah berusaha kuat. Minta bantuan itu bukan kalah, itu langkah berani.',
    'Saya akan bantu memikirkan langkah aman berikutnya untuk kamu.'
  ]
};

// Isi panel balasan cepat sesuai konteks tiket yang sedang dibuka.
function isiQuickChat(mode) {
  var panel = $('#mdQuick');
  if (!panel) return;
  var daftar = QUICK_TEKS[mode] || QUICK_TEKS.biasa;
  panel.innerHTML = daftar.map(function (t) {
    return '<button type="button" class="chip" data-q="' + esc(t) + '">' + esc(t.length > 52 ? t.slice(0, 52) + '…' : t) + '</button>';
  }).join('');
  panel.setAttribute('data-konteks', mode);
  // Pasang pengiriman.
  panel.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      if (!state.ws || state.ws.readyState !== 1) { notifLive('Buka detail laporan dulu sebelum membalas.'); return; }
      var teks = c.getAttribute('data-q');
      state.ws.send(JSON.stringify({ type: 'pesan', tiket: state.tiketAktif, isi: teks }));
      bubbleChat(teks, 'out');
      var input = $('#mdInputChat');
      if (input) input.focus();
    });
  });
}

// Tombol untuk melipat/membuka panel balasan cepat.
(function () {
  var toggle = $('#mdQuickToggle');
  var panel = $('#mdQuick');
  if (!toggle || !panel) return;
  var terbuka = true;
  toggle.addEventListener('click', function () {
    terbuka = !terbuka;
    panel.hidden = !terbuka;
    toggle.setAttribute('aria-expanded', String(terbuka));
  });
})();

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
