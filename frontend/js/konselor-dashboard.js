// Dashboard konselor — antrian, detail, chat WS, status; panel admin (akun + audit).
var $ = function (s) { return document.querySelector(s); };
var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

var state = { saya: null, tiketAktif: null, modeMinat: false, ws: null, inbox: [], inboxFilter: '', poolBelumDiambil: [] };

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
    if (hidden && hidden.id === 'filterStatus') muatInbox();
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
  muatInbox();
  sambungDashboardWS();
  $('#btnLogout').addEventListener('click', logout);
  $('#filterMinat').addEventListener('change', muatMinat);
  $('#filterRujukan').addEventListener('change', muatRujukan);
  $('#tabAntrian').addEventListener('click', function () { gantiTab('antrian'); });
  $('#tabPool').addEventListener('click', function () { gantiTab('pool'); });
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
  $('#ibFormChat').addEventListener('submit', kirimChatInbox);
  $('#ibDetail').addEventListener('click', bukaDetailDariInbox);
  $$('.inbox-filter-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      state.inboxFilter = b.getAttribute('data-f') || '';
      $$('.inbox-filter-btn').forEach(function (x) { x.classList.toggle('aktif', x === b); });
      renderInbox();
    });
  });
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
  $('#tabPool').classList.toggle('active', t === 'pool');
  $('#tabMinat').classList.toggle('active', t === 'minat');
  $('#tabRujukan').classList.toggle('active', t === 'rujukan');
  $('#tabAdmin').classList.toggle('active', t === 'admin');
  $('#panelAntrian').hidden = t !== 'antrian';
  $('#panelPool').hidden = t !== 'pool';
  $('#panelMinat').hidden = t !== 'minat';
  $('#panelRujukan').hidden = t !== 'rujukan';
  $('#panelAdmin').hidden = t !== 'admin';
  if (t === 'antrian') muatInbox();
  if (t === 'pool') { muatInbox(); }
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
  if (window.RuangPulihRT) window.RuangPulihRT.unsubscribe();
  state.tiketAktif = null;
  state.modeMinat = false;
  pulihkanOpsiStatus();
  if (!$('#panelMinat').hidden) muatMinat(); else muatInbox();
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

/* ---------- chat realtime konselor (Supabase) ---------- */
// Koneksi "live" dashboard: dengarkan pengaduan baru & pesan masuk,
// refresh antrian + statistik secara otomatis tanpa reload.
// Dipakai: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
function sambungDashboardWS() {
  if (!window.RuangPulihRT) return;
  // Konselor subscribe SEMUA tiket (tidak difilter per-tiket)
  window.RuangPulihRT.subscribe(null, function (ev) {
    if (ev.tipe === 'pengaduan_baru') {
      muatStatistik();
      muatInbox();
      notifLive((ev.data && ev.data.darurat ? 'Laporan darurat baru' : 'Laporan baru') + ': ' + ev.no_tiket);
    } else if (ev.tipe === 'pesan') {
      // pesan baru di tiket mana pun → refresh list inbox
      muatInbox();
      muatStatistik();
      if (ev.no_tiket !== state.tiketAktif) {
        notifLive('Chat baru di ' + ev.no_tiket);
      }
    }
  });
  // FALLBACK PENTING: RLS chat_event sekarang membatasi role anon, jadi
  // event tipe='pesan' tidak sampai ke dashboard via Realtime (lihat
  // migrations/002-tutup-chat-event.sql). Polling aman via cookie konselor
  // memastikan notifikasi chat masuk tetap jalan.
  if (!state.pollInbox) {
    state.pollInbox = setInterval(function () {
      if ($('#panelAntrian') && !$('#panelAntrian').hidden) muatInbox();
    }, 15000);
  }
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
  if (!window.RuangPulihRT) { bubbleChat('Realtime belum siap, muat ulang halaman.', 'in'); return; }
  // Konselor: ambil history dulu, lalu subscribe tiket ini
  window.RuangPulihRT.ambilHistory(tiket).then(function (pesan) {
    $('#mdChat').innerHTML = '';
    (pesan || []).forEach(function (p) {
      bubbleChat(p.isi, p.pengirim === 'user' ? 'in' : 'out', p.dibuat);
    });
  }).catch(function () { bubbleChat('Gagal memuat riwayat chat.', 'in'); });

  window.RuangPulihRT.subscribe(tiket, function (ev) {
    if (ev.tipe === 'typing') {
      if (ev.dari === 'user') tampilkanMengetik();
      return;
    }
    if (ev.tipe === 'baca') return;

    // pesan baru di tiket ini → ambil hanya pesan terbaru via API
    if (ev.tipe === 'pesan') {
      if (ev.no_tiket !== state.tiketAktif) return;
      window.RuangPulihRT.ambilHistory(tiket).then(function (pesan) {
        // render ulang full history (dedup aman, idempoten)
        $('#mdChat').innerHTML = '';
        (pesan || []).forEach(function (p) {
          bubbleChat(p.isi, p.pengirim === 'user' ? 'in' : 'out', p.dibuat);
        });
        hapusMengetik();
      }).catch(function () { /* coba lagi nanti */ });
      return;
    }

    // rujukan/status berubah → info sistem di chat
    if (ev.tipe === 'rujukan' || ev.tipe === 'status') {
      if (ev.no_tiket !== state.tiketAktif) return;
      bubbleChat(ev.tipe === 'rujukan' ? 'Rujukan dibuat: ' + (ev.data.tujuan || '') : 'Status diperbarui.', 'in');
    }
  });
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
  if (!window.RuangPulihRT || !state.tiketAktif) return;
  clearTimeout(timeoutMengetik);
  window.RuangPulihRT.kirimTyping(state.tiketAktif, 'konselor');
  // throttle: kirim tiap 1.2s saat terus mengetik
  timeoutMengetik = setTimeout(function () {}, 1200);
}

function bubbleChat(teks, arah, ts) {
  var area = $('#mdChat');
  var b = document.createElement('div');
  b.className = 'bubble ' + (arah === 'out' ? 'bubble-out' : 'bubble-in');
  if (arah === 'out' || arah === 'in') b.setAttribute('data-dari', arah === 'out' ? 'Anda' : 'Pelapor');
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

  if (!state.tiketAktif) return;
  input.value = '';

  // Mode minat: konselor sudah mengobrol → otomatis ambil penanganan jika
  // belum ada yang ditugaskan. Tidak perlu klik "Ambil Penanganan" dulu.
  if (state.modeMinat && state.tiketAktif && !$('#mdAmbil').hidden) {
    ambilMinat(state.tiketAktif);
  }

  try {
    // Kirim via API (cookie session autentikasi konselor, gak butuh token anon).
    // Pesan kita sendiri gak di-render ulang Realtime — render lokal sudah cukup.
    await window.RuangPulihRT.kirimPesan(state.tiketAktif, teks);
    bubbleChat(teks, 'out');
  } catch (e2) { bubbleChat('Pesan gagal terkirim: ' + e2.message, 'in'); }
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
    if (mode === 'minat') muatMinat(); else { muatInbox(); muatStatistik(); }
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

/* ---------- INBOX: daftar tiket + chat dua kolom ---------- */
// Menggantikan tabel antrian: semua tiket terlihat, klik = langsung chat.
// Sumber: GET /api/dashboard/inbox (agregat pesan terakhir + unread).
var inboxCache = [];

function waktuPendek(ts) {
  var d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  var hariIni = new Date().toDateString() === d.toDateString();
  return hariIni
    ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

async function muatInbox() {
  try {
    var data = await api('/api/dashboard/inbox');
    state.inbox = data.items || [];
    // Pool tiket belum diambil siapa pun (ditangani_oleh NULL) — tampil di
    // section terpisah di bawah list pribadi. Bisa diambil manual dari sini.
    var pool = await api('/api/dashboard/antrian?limit=100');
    state.poolBelumDiambil = (pool.items || []).filter(function (p) {
      return p.ditangani_oleh == null;
    });
    renderInbox();
    renderPool();
    var pc = $('#poolCount');
    if (pc) {
      var pl = state.poolBelumDiambil || [];
      var nD = pl.filter(function (p) { return p.darurat; }).length;
      pc.hidden = pl.length === 0;
      // Badge informatif: jumlah + penanda darurat biar tak cuma angka polos.
      pc.textContent = pl.length + (nD ? ' · ' + nD + ' darurat' : '');
      pc.classList.toggle('pool-badge-darurat', nD > 0);
    }
  } catch (e) {
    var list = $('#inboxList');
    if (list) list.innerHTML = '<p class="dash-empty">Gagal memuat inbox: ' + esc(e.message) + '</p>';
  }
}

function renderInbox() {
  var list = $('#inboxList');
  if (!list) return;
  var semua = state.inbox || [];
  $('#antrianKosong').hidden = semua.length > 0;

  // Filter chip: semua / unread / darurat / selesai
  var f = state.inboxFilter || '';
  var items = semua.filter(function (it) {
    if (f === 'unread') return !!it.unread;
    if (f === 'darurat') return it.label === 'DARURAT';
    if (f === 'selesai') return it.status === 'Selesai';
    return true;
  });

  var count = $('#inboxCount');
  if (count) {
    var nUnread = semua.filter(function (x) { return x.unread; }).length;
    count.textContent = nUnread ? nUnread + ' belum dibaca' : semua.length + ' tiket';
  }

  // Kartu list: dot + tiket + waktu (baris 1), preview + unread (baris 2).
  // Program tag (PM) jadi baris tersendiri hanya kalau ada.
  var html = '';
  items.forEach(function (it) {
    var aktif = it.tiket === state.tiketAktif ? ' aktif' : '';
    var unread = it.unread ? '<span class="ib-unread" title="Pesan baru belum dibaca">1</span>' : '';
    var w = waktuPendek(it.pesan_ts);
    var dari = it.dari === 'konselor' ? 'Anda: ' : '';
    var dotStatus = '<span class="ib-dot" title="' + esc(it.status || '') + '"></span>';
    var tagDarurat = it.label === 'DARURAT' ? '<span class="ib-tag ib-tag-darurat">Darurat</span>' : '';
    var tagProgram = (it.label && it.label !== 'DARURAT')
      ? '<div class="ib-baris"><span class="ib-tag">' + esc(it.label) + '</span></div>'
      : '';
    html += '<button type="button" class="ib-item' + aktif + '" data-tiket="' + esc(it.tiket) + '">' +
      '<div class="ib-baris">' + dotStatus +
      '<strong>' + esc(it.tiket) + '</strong>' + tagDarurat +
      '<span class="ib-waktu">' + w + '</span></div>' +
      '<div class="ib-baris"><span class="ib-preview">' + esc(dari + it.preview) + '</span>' + unread + '</div>' +
      tagProgram +
      '</button>';
  });
  list.innerHTML = html || '<p class="inbox-filter-kosong">Tidak ada tiket pada filter ini.</p>';
  $$('#inboxList .ib-item').forEach(function (b) {
    b.addEventListener('click', function () { bukaInboxChat(b.dataset.tiket); });
  });
}

// Tab Antrian: pool tiket belum diambil siapa pun, halaman terpisah dari inbox.
function renderPool() {
  var wrap = $('#poolList');
  if (!wrap) return;
  var pool = state.poolBelumDiambil || [];
  $('#poolKosong').hidden = pool.length > 0;
  var html = '';
  pool.forEach(function (p) {
    var darurat = p.darurat ? '<span class="ib-tag ib-tag-darurat">Darurat</span>' : '';
    html += '<div class="ib-item ib-item-pool" data-tiket="' + esc(p.no_tiket) + '">' +
      '<div class="ib-baris"><span class="ib-dot"></span>' +
      '<strong>' + esc(p.no_tiket) + '</strong>' + darurat +
      '<span class="ib-waktu">' + waktuPendek(p.dibuat) + '</span></div>' +
      '<div class="ib-baris"><span class="ib-preview">' + esc(p.kategori || 'Laporan') + ' · untuk ' + esc(p.untuk || '-') + '</span></div>' +
      '<div class="ib-baris"><button type="button" class="btn-kecil ib-ambil" data-tiket="' + esc(p.no_tiket) + '">Ambil penanganan</button></div>' +
      '</div>';
  });
  wrap.innerHTML = html;
  $$('#poolList .ib-ambil').forEach(function (b) {
    b.addEventListener('click', function () { ambilDariPool(b.dataset.tiket); });
  });
}

// Ambil penanganan tiket dari pool (belum ditugaskan ke siapa pun).
async function ambilDariPool(tiket) {
  try {
    await api('/api/dashboard/inbox/' + encodeURIComponent(tiket) + '/ambil', { method: 'POST' });
    notifLive('Tiket ' + tiket + ' sekarang ditangani Anda.');
    await muatInbox();
    bukaInboxChat(tiket);
  } catch (e) {
    notifLive(e.message || 'Gagal mengambil tiket.');
    muatInbox();
  }
}

function waktuPendek(ts) {
  var d = new Date(Number(ts));
  if (isNaN(d.getTime())) return '';
  var hariIni = new Date().toDateString() === d.toDateString();
  return hariIni
    ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

async function bukaInboxChat(tiket) {
  state.tiketAktif = tiket;
  state.modeMinat = tiket.indexOf('PM-') === 0;
  $('#inboxKosong').hidden = true;
  $('#inboxAktif').hidden = false;
  $('#ibTiket').textContent = tiket;
  $('#ibChat').innerHTML = '';
  var it = (state.inbox || []).find(function (x) { return x.tiket === tiket; });
  $('#ibMeta').textContent = it ? (it.jenis === 'PM' ? 'Minat program' + (it.label ? ' · ' + it.label : '') : 'Laporan') + (it.penangan ? ' · ' + it.penangan : ' · belum ditugaskan') : '';
  $('#ibStatus').innerHTML = it ? badge(it.status) : '';
  // Quick replies sesuai konteks
  var mode = state.modeMinat ? 'minat' : (it && it.label === 'DARURAT' ? 'darurat' : 'biasa');
  isiQuickInbox(mode);
  // tandai dibaca
  try { await api('/api/dashboard/inbox/' + encodeURIComponent(tiket) + '/baca', { method: 'POST' }); } catch (e2) { /* non-kritis */ }
  renderInbox();
  sambungWSInbox(tiket);
}

function sambungWSInbox(tiket) {
  if (!window.RuangPulihRT) { bubbleInbox('Realtime belum siap, muat ulang halaman.', 'in'); return; }
  window.RuangPulihRT.ambilHistory(tiket).then(function (pesan) {
    $('#ibChat').innerHTML = '';
    (pesan || []).forEach(function (p) {
      bubbleInbox(p.isi, p.pengirim === 'user' ? 'in' : 'out', p.dibuat);
    });
  }).catch(function () { bubbleInbox('Gagal memuat riwayat chat.', 'in'); });

  window.RuangPulihRT.subscribe(tiket, function (ev) {
    if (ev.tipe === 'typing') {
      if (ev.dari === 'user') tampilkanMengetikInbox();
      return;
    }
    if (ev.tipe === 'baca') return;
    if (ev.tipe === 'pesan') {
      if (ev.no_tiket !== state.tiketAktif) { muatInbox(); return; }
      window.RuangPulihRT.ambilHistory(tiket).then(function (pesan) {
        $('#ibChat').innerHTML = '';
        (pesan || []).forEach(function (p) {
          bubbleInbox(p.isi, p.pengirim === 'user' ? 'in' : 'out', p.dibuat);
        });
        hapusMengetikInbox();
      }).catch(function () { /* coba lagi nanti */ });
      muatInbox();
      return;
    }
    if (ev.tipe === 'rujukan' || ev.tipe === 'status') {
      if (ev.no_tiket !== state.tiketAktif) return;
      bubbleInbox(ev.tipe === 'rujukan' ? 'Rujukan dibuat: ' + ((ev.data || {}).tujuan || '') : 'Status diperbarui.', 'in');
    }
  });
}

function bubbleInbox(teks, arah, ts) {
  var area = $('#ibChat');
  if (!area) return;
  var b = document.createElement('div');
  b.className = 'bubble ' + (arah === 'out' ? 'bubble-out' : 'bubble-in');
  if (arah === 'out' || arah === 'in') b.setAttribute('data-dari', arah === 'out' ? 'Anda' : 'Pelapor');
  b.textContent = teks;
  if (ts != null) b.setAttribute('data-ts', String(ts));
  area.appendChild(b);
  area.scrollTop = area.scrollHeight;
}

function tampilkanMengetikInbox() {
  var area = $('#ibChat');
  if (!area || area.querySelector('.typing')) return;
  var d = document.createElement('div');
  d.className = 'bubble bubble-in typing';
  d.innerHTML = '<span class="titik"></span><span class="titik"></span><span class="titik"></span>';
  area.appendChild(d);
  area.scrollTop = area.scrollHeight;
}
function hapusMengetikInbox() { var t = $('#ibChat .typing'); if (t) t.remove(); }

async function kirimChatInbox(e) {
  e.preventDefault();
  var input = $('#ibInputChat');
  var teks = input.value.trim();
  if (!teks || !state.tiketAktif) return;
  input.value = '';
  if (state.modeMinat && !$('#mdAmbil').hidden) ambilMinat(state.tiketAktif);
  try {
    await window.RuangPulihRT.kirimPesan(state.tiketAktif, teks);
    bubbleInbox(teks, 'out');
    muatInbox();
  } catch (e2) { bubbleInbox('Pesan gagal terkirim: ' + e2.message, 'in'); }
}

// Quick replies versi inbox (target panel ibQuick, bukan mdQuick).
function isiQuickInbox(mode) {
  var panel = $('#ibQuick');
  if (!panel) return;
  var daftar = QUICK_TEKS[mode] || QUICK_TEKS.biasa;
  panel.innerHTML = daftar.map(function (t) {
    return '<button type="button" class="chip" data-q="' + esc(t) + '">' + esc(t.length > 52 ? t.slice(0, 52) + '…' : t) + '</button>';
  }).join('');
  panel.setAttribute('data-konteks', mode);
  panel.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', async function () {
      if (!state.tiketAktif) return;
      var teks = c.getAttribute('data-q');
      try {
        await window.RuangPulihRT.kirimPesan(state.tiketAktif, teks);
        bubbleInbox(teks, 'out');
      } catch (e2) { notifLive('Pesan gagal terkirim.'); }
      var input = $('#ibInputChat');
      if (input) input.focus();
    });
  });
}

// Tombol "Detail & status" di header inbox → buka modal detail penuh.
function bukaDetailDariInbox() {
  var tiket = state.tiketAktif;
  if (!tiket) return;
  if (tiket.indexOf('PM-') === 0) bukaDetailMinat(tiket);
  else bukaDetail(tiket);
}


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
    c.addEventListener('click', async function () {
      if (!state.tiketAktif) { notifLive('Buka detail laporan dulu sebelum membalas.'); return; }
      var teks = c.getAttribute('data-q');
      try {
        await window.RuangPulihRT.kirimPesan(state.tiketAktif, teks);
        bubbleChat(teks, 'out');
      } catch (e2) { notifLive('Pesan gagal terkirim.'); }
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
