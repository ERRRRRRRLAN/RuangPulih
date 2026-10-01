/* ============================================================
   RUANG PULIH — Logika interaksi
   ------------------------------------------------------------
   Semua kontrol custom: neo-select, stepper, chip, radio card,
   checkbox neomorphism. Tidak ada elemen native yang tampil apa
   adanya. Animasi memakai sistem easing yang sama dengan CSS.
   ============================================================ */
(function () {
  'use strict';

  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Penampung nilai kontrol custom (select, stepper, chip)
  var nsData = {};

  /* ===================== TOAST ===================== */
  var toastWrap = (function () {
    var w = document.createElement('div');
    w.className = 'toast-wrap';
    document.body.appendChild(w);
    return w;
  })();

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    toastWrap.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 380);
    }, 3200);
  }

  /* ===================== RIPPLE (tombol) ===================== */
  document.addEventListener('pointerdown', function (e) {
    var btn = e.target.closest('.btn, .btn-icon, .btn-send, .neo-step-btn');
    if (!btn || reduceMotion) return;
    var r = btn.getBoundingClientRect();
    btn.style.setProperty('--rx', ((e.clientX - r.left) / r.width * 100) + '%');
    btn.style.setProperty('--ry', ((e.clientY - r.top) / r.height * 100) + '%');
    btn.classList.remove('rippling');
    void btn.offsetWidth;
    btn.classList.add('rippling');
    setTimeout(function () { btn.classList.remove('rippling'); }, 520);
  });

  /* ===================== TEMA ===================== */
  var root = document.documentElement;
  var themeToggle = $('#themeToggle');
  var THEME_KEY = 'ruang-pulih-theme';

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (err) { /* penyimpanan diblokir */ }
  }
  (function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (err) { saved = null; }
    applyTheme(saved === 'dark' ? 'dark' : 'light');
  })();
  themeToggle.addEventListener('click', function () {
    applyTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  /* ===================== NAVBAR ===================== */
  var navbar = $('#navbar');
  var navLinks = $('#navLinks');
  var navToggle = $('#navToggle');
  var progress = $('#scrollProgress');

  navToggle.addEventListener('click', function () {
    var open = navLinks.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  navLinks.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  function onScroll() {
    var y = window.pageYOffset;
    navbar.classList.toggle('scrolled', y > 8);
    var h = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.width = (h > 0 ? Math.min(100, y / h * 100) : 0) + '%';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Nav link aktif mengikuti section terlihat
  var sections = $$('main section[id]');
  var linkMap = {};
  navLinks.querySelectorAll('a').forEach(function (a) { linkMap[a.getAttribute('href')] = a; });
  if ('IntersectionObserver' in window) {
    var navIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          navLinks.querySelectorAll('a').forEach(function (a) { a.classList.remove('active'); });
          var l = linkMap['#' + en.target.id];
          if (l) l.classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(function (s) { navIO.observe(s); });
  }

  /* ===================== REVEAL ON SCROLL ===================== */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var revIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); revIO.unobserve(en.target); }
      });
    }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { revIO.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ===================== CUSTOM SELECT ===================== */
  $$('.neo-select').forEach(function (ns) {
    var trigger = ns.querySelector('.neo-select-trigger');
    var panel = ns.querySelector('.neo-select-panel');
    var valueEl = ns.querySelector('.neo-select-value');
    var options = $$('.neo-select-option', panel);
    var placeholder = ns.getAttribute('data-placeholder') || 'Pilih';
    var key = ns.getAttribute('data-key');
    var store = nsData[key] = { value: '' };

    function render() {
      options.forEach(function (o) { o.classList.toggle('sel', o.getAttribute('data-value') === store.value); });
    }
    function setOpen(open) {
      ns.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function choose(o) {
      store.value = o.getAttribute('data-value');
      valueEl.textContent = o.textContent.trim() || placeholder;
      render();
      ns.classList.remove('invalid');
    }

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!ns.classList.contains('open'));
    });
    options.forEach(function (o, i) {
      o.addEventListener('click', function (e) {
        e.stopPropagation();
        choose(o);
        setOpen(false);
      });
      o.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(o); setOpen(false); trigger.focus(); }
      });
    });
    trigger.addEventListener('keydown', function (e) {
      var open = ns.classList.contains('open');
      if (e.key === 'Escape') { if (open) { setOpen(false); } return; }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) { setOpen(true); }
        var cur = options.findIndex(function (o) { return o.classList.contains('sel'); });
        var next = cur < 0 ? 0 : cur + (e.key === 'ArrowDown' ? 1 : -1);
        next = Math.max(0, Math.min(options.length - 1, next));
        options.forEach(function (o) { o.tabIndex = -1; });
        options[next].tabIndex = 0;
        options[next].focus();
      }
    });

    ns.setValue = function (v) {
      var match = options.filter(function (o) { return o.getAttribute('data-value') === v; })[0];
      if (match) choose(match);
    };
    render();
  });

  // Klik di luar menutup select & menu mobile
  document.addEventListener('click', function () {
    $$('.neo-select.open').forEach(function (ns) { ns.classList.remove('open'); ns.querySelector('.neo-select-trigger').setAttribute('aria-expanded', 'false'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      $$('.neo-select.open').forEach(function (ns) { ns.classList.remove('open'); ns.querySelector('.neo-select-trigger').setAttribute('aria-expanded', 'false'); });
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  /* ===================== STEPPER (usia) ===================== */
  $$('.neo-stepper').forEach(function (st) {
    var key = st.getAttribute('data-key');
    var min = parseInt(st.getAttribute('data-min'), 10) || 0;
    var max = parseInt(st.getAttribute('data-max'), 10) || 999;
    var input = st.querySelector('.neo-step-value');
    var store = nsData[key] = { value: '' };

    function sync() { store.value = input.value.trim(); }
    function clamp(v) { return Math.max(min, Math.min(max, v)); }

    $$('.neo-step-btn', st).forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = parseInt(b.getAttribute('data-dir'), 10);
        var n = parseInt(input.value, 10);
        var next = clamp(isNaN(n) ? (dir > 0 ? min : max) : n + dir);
        input.value = String(next);
        sync();
      });
    });
    input.addEventListener('input', function () {
      input.value = input.value.replace(/[^\d]/g, '').slice(0, 3);
      sync();
    });
    input.addEventListener('blur', function () {
      var n = parseInt(input.value, 10);
      if (!isNaN(n)) input.value = String(clamp(n));
      sync();
    });
  });

  /* ===================== CHIP MULTI-SELECT ===================== */
  var chipStore = nsData['narkoba'] = { value: [] };
  $$('#chipNarkoba .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      var v = c.getAttribute('data-val');
      var i = chipStore.value.indexOf(v);
      if (i >= 0) { chipStore.value.splice(i, 1); c.classList.remove('on'); }
      else { chipStore.value.push(v); c.classList.add('on'); }
    });
  });

  /* ===================== RADIO CARD ===================== */
  function syncRadios(group) {
    $$('input[name="' + group + '"]').forEach(function (r) {
      r.closest('.radio-card').classList.toggle('on', r.checked);
    });
  }
  ['untuk', 'darurat'].forEach(function (g) {
    $$('input[name="' + g + '"]').forEach(function (r) {
      r.addEventListener('change', function () { syncRadios(g); });
    });
  });

  /* ===================== PENGHITUNG KARAKTER ===================== */
  var cerita = $('#inputCerita');
  var countCerita = $('#countCerita');
  var MIN_CERITA = 20;
  cerita.addEventListener('input', function () {
    var n = cerita.value.trim().length;
    countCerita.textContent = n + ' karakter' + (n < MIN_CERITA ? ' (minimal ' + MIN_CERITA + ')' : '');
    countCerita.classList.toggle('warn', n > 0 && n < MIN_CERITA);
    cerita.closest('.field').classList.remove('invalid');
  });

  /* ===================== UTIL VALIDASI ===================== */
  function shake(el) {
    if (!el || reduceMotion) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(function () { el.classList.remove('shake'); }, 450);
  }

  function randomCode(prefix, len) {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var s = '';
    for (var i = 0; i < len; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return prefix + '-' + y + m + day + '-' + s;
  }

  function copyText(text, doneMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (err) { /* abaikan */ }
      document.body.removeChild(ta);
      toast(doneMsg);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(doneMsg); }, fallback);
    } else {
      fallback();
    }
  }

  /* ===================== FORM PENGADUAN ===================== */
  var formPengaduan = $('#formPengaduan');
  var bodyPengaduan = $('#bodyPengaduan');
  var hasilPengaduan = $('#hasilPengaduan');
  var databaseTiket = {}; // simulasi penyimpanan tiket (prototype)

  formPengaduan.addEventListener('submit', function (e) {
    e.preventDefault();

    var untuk = formPengaduan.querySelector('input[name="untuk"]:checked');
    var darurat = formPengaduan.querySelector('input[name="darurat"]:checked');
    var konfirmasi = $('#konfirmasi');
    var masalah = [];

    function tunda(group) { return formPengaduan.querySelector('input[name="' + group + '"]:checked'); }

    if (!untuk) {
      masalah.push('untuk');
      shake($('#untukSiapa').closest('.field-group'));
    }
    if (chipStore.value.length === 0) {
      masalah.push('narkoba');
      shake($('#chipNarkoba').closest('.field'));
    }
    if (cerita.value.trim().length < MIN_CERITA) {
      masalah.push('cerita');
      shake(cerita.closest('.field'));
      cerita.closest('.field').classList.add('invalid');
    }
    if (!darurat) {
      masalah.push('darurat');
      shake($('#daruratRow').closest('.field'));
    }
    if (!konfirmasi.checked) {
      masalah.push('konfirmasi');
      shake(konfirmasi.closest('.checkbox-line'));
    }

    if (masalah.length) {
      toast('Lengkapi bagian yang ditandai dulu, ya.');
      var first = formPengaduan.querySelector('.shake');
      if (first) first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      return;
    }

    var tiket = randomCode('PN', 4);
    var idPelapor = randomCode('ID', 6);
    databaseTiket[tiket] = {
      status: darurat.value === 'Ya' ? 'Prioritas — ditindaklanjuti hari ini'
              : 'Diterima — menunggu giliran tim rujukan',
      untuk: untuk.value,
      zat: chipStore.value.join(', '),
      waktu: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
    };

    $('#hasilTiket').textContent = tiket;
    $('#hasilID').textContent = idPelapor;

    bodyPengaduan.hidden = true;
    hasilPengaduan.hidden = false;
    hasilPengaduan.classList.add('show');
    toast('Laporan tercatat. Simpan nomor tiket Anda.');

    $('#salinTiket').onclick = function () {
      copyText(tiket + ' | ID: ' + idPelapor, 'Tiket disalin ke clipboard');
    };
  });

  /* ===================== CEK STATUS ===================== */
  var formStatus = $('#formStatus');
  var inputTiket = $('#inputTiket');
  var statusResult = $('#statusResult');
  var statusBadge = $('#statusBadge');
  var statusText = $('#statusText');

  formStatus.addEventListener('submit', function (e) {
    e.preventDefault();
    var kode = inputTiket.value.trim().toUpperCase();
    if (!kode) {
      shake(inputTiket.closest('.field'));
      toast('Masukkan nomor tiket dulu.');
      return;
    }
    var data = databaseTiket[kode];
    statusResult.hidden = false;
    statusResult.classList.remove('show');
    void statusResult.offsetWidth;
    statusResult.classList.add('show');
    if (data) {
      statusBadge.textContent = data.status.split('—')[0].trim();
      statusText.textContent = 'Laporan untuk ' + data.untuk.toLowerCase() +
        ' terkait ' + data.zat.toLowerCase() + '. Diterima ' + data.waktu +
        '. Tim rujukan akan menghubungi Anda jika Anda meninggalkan kontak.';
    } else {
      statusBadge.textContent = 'Tidak ditemukan';
      statusText.textContent = 'Nomor tiket "' + kode + '" tidak ada di sistem kami. Periksa kembali penulisannya, atau buat laporan baru jika tiket hilang.';
    }
  });

  /* ===================== FORM REHAB ===================== */
  var formRehab = $('#formRehab');
  var bodyRehab = $('#bodyRehab');
  var hasilRehab = $('#hasilRehab');

  formRehab.addEventListener('submit', function (e) {
    e.preventDefault();
    var program = nsData['program'].value;

    if (!program) {
      var ns = formRehab.querySelector('.neo-select');
      ns.classList.add('invalid');
      shake(ns);
      toast('Pilih program yang diminati dulu.');
      ns.querySelector('.neo-select-trigger').focus();
      return;
    }

    var kontak = $('#inputKontak').value.trim();
    var panggilan = $('#inputPanggilan').value.trim();
    $('#hasilRehabText').textContent = kontak
      ? 'Minat Anda untuk program "' + program + '" tercatat. Konseler akan menghubungi ' + kontak +
        ' dalam 1 sampai 2 hari kerja.' + (panggilan ? ' Kami akan memanggil Anda dengan sebutan ' + panggilan + '.' : '')
      : 'Minat Anda untuk program "' + program + '" tercatat. Karena tidak ada kontak yang diberikan, ' +
        'silakan hubungi 188 atau datang ke Puskesmas terdekat untuk melanjutkan pendaftaran.';

    bodyRehab.hidden = true;
    hasilRehab.hidden = false;
    hasilRehab.classList.add('show');
    toast('Pendaftaran minat tersimpan.');
  });

  /* ===================== CHAT KONSELING ===================== */
  var chatBody = $('#chatBody');
  var inputChat = $('#inputChat');
  var formChat = $('#formChat');
  var btnSend = formChat.querySelector('.btn-send');
  var resetChat = $('#resetChat');
  var sesiLabel = $('#sesiLabel');
  var sedangMengetik = false;

  function kodeSesi() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var s = '';
    for (var i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }
  sesiLabel.textContent = 'Sesi #' + kodeSesi();

  function jam() {
    return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  function bubble(teks, arah) {
    var div = document.createElement('div');
    div.className = 'msg ' + arah;
    var p = document.createElement('p');
    p.textContent = teks;
    var t = document.createElement('span');
    t.className = 'mtime';
    t.textContent = jam();
    div.appendChild(p);
    div.appendChild(t);
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
    return div;
  }

  function typing() {
    var div = document.createElement('div');
    div.className = 'typing';
    div.setAttribute('aria-hidden', 'true');
    div.innerHTML = '<i></i><i></i><i></i>';
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
    return div;
  }

  function balas(pesan) {
    var teks = pesan.toLowerCase();
    var kata = {
      darurat: ['darurat', 'mendesak', 'overdosis', 'tidak sadar', 'napas', 'keracunan', 'pingsan'],
      krisis: ['menyakiti', 'bunuh', 'ingin mati', 'mengakhiri', 'menyakiti diri', 'berpikir untuk mati'],
      stres: ['stres', 'cemas', 'takut', 'sedih', 'depresi', 'kepikiran', 'panik', 'capek', 'lelah'],
      berhenti: ['berhenti', 'sulit', 'ketergantungan', 'ketagihan', 'kambuh', 'menghentikan'],
      rehab: ['rehabilitasi', 'daftar', 'program', 'detoks', 'rawat inap', 'rawat jalan', 'pusat'],
      anonim: ['anonim', 'aman', 'privasi', 'nama', 'rahasia', 'bocor'],
      sapa: ['halo', 'hai', 'selamat', 'selamat pagi', 'selamat siang', 'selamat malam', 'test', 'tes'],
      terima: ['terima kasih', 'makasih', 'tks']
    };

    if (kata.darurat.some(function (k) { return teks.indexOf(k) >= 0; })) {
      return 'Kalau ada yang mengancam nyawa sekarang, telepon 119 atau langsung ke IGD terdekat. Jika overdosis: posisikan tubuh miring ke satu sisi, jangan tinggalkan sendirian, dan bawa kemasan zatnya agar tenaga medis tahu penanganannya. Cerita Anda tetap di sini setelahnya, tidak ke mana-mana.';
    }
    if (kata.krisis.some(function (k) { return teks.indexOf(k) >= 0; })) {
      return 'Yang Anda rasakan berat, dan saya senang Anda menyampaikannya. Untuk pikiran seperti ini, hubungi 119 atau 188 sekarang — ada orang yang akan mendampingi langsung. Saya tetap di sini kalau mau lanjut bercerita setelahnya.';
    }
    if (kata.berhenti.some(function (k) { return teks.indexOf(k) >= 0; })) {
      return 'Niat untuk berhenti itu langkah besar, dan memang wajar kalau terasa berat — ketergantungan bekerja begitu. Anda tidak harus melakukannya sendirian. Mau ceritakan sudah mencoba cara apa sejauh ini, atau mau saya jelaskan opsi pendampingannya?';
    }
    if (kata.rehab.some(function (k) { return teks.indexOf(k) >= 0; })) {
      return 'Ada empat jalur: detoksifikasi (3 sampai 10 hari, butuh pengawasan medis), rawat inap (1 sampai 6 bulan), rawat jalan (8 sampai 12 minggu, tetap aktivitas harian), dan aftercare kelompok dukungan. Pilihannya tergantung seberapa kuat ketergantungannya dan seberapa besar dukungan di sekitar Anda. Mau isi formulir minat di bagian rehabilitasi agar konselor menindaklanjutinya?';
    }
    if (kata.stres.some(function (k) { return teks.indexOf(k) >= 0; })) {
      return 'Terima kasih sudah berbagi. Berat hal yang Anda pikirkan, dan wajar kalau semuanya terasa menumpuk. Kalau nyaman, ceritakan apa yang paling membebani Anda sekarang — tidak perlu rapi, tidak perlu urut.';
    }
    if (kata.anonim.some(function (k) { return teks.indexOf(k) >= 0; })) {
      return 'Sesinya tidak meminta nama, nomor, atau email. Tidak ada rekam jejak yang dikaitkan ke Anda, dan isi obrolan tidak diteruskan ke pihak mana pun. Satu-satunya pengecualian: kalau ada nyawa terancam, kami akan mengarahkan Anda ke jalur darurat.';
    }
    if (kata.sapa.some(function (k) { return teks.indexOf(k) >= 0; })) {
      return 'Halo. Senang Anda mampir. Ini ruang untuk cerita apa pun seputar narkotika — untuk diri sendiri, keluarga, atau teman. Mau mulai dari mana?';
    }
    if (kata.terima.some(function (k) { return teks.indexOf(k) >= 0; })) {
      return 'Sama-sama. Kalau nanti ada yang ingin disampaikan lagi, ruang ini tetap buka untuk Anda. Jaga diri Anda.';
    }
    return 'Saya dengarkan. Mau ceritakan lebih lanjut tentang situasinya — kapan mulai, dan bagaimana kondisinya sekarang? Kalau lebih nyaman, pilih salah satu topik di bawah kotak chat ini.';
  }

  function kirimPesan(teks) {
    if (sedangMengetik) return;
    bubble(teks, 'out');
    inputChat.value = '';
    btnSend.disabled = true;
    sedangMengetik = true;

    var t = typing();
    setTimeout(function () {
      if (t.parentNode) t.parentNode.removeChild(t);
      bubble(balas(teks), 'in');
      sedangMengetik = false;
      inputChat.focus();
    }, 900 + Math.random() * 700);
  }

  formChat.addEventListener('submit', function (e) {
    e.preventDefault();
    var teks = inputChat.value.trim();
    if (!teks) { shake(inputChat); return; }
    kirimPesan(teks);
  });
  inputChat.addEventListener('input', function () { btnSend.disabled = !inputChat.value.trim(); });

  $$('#quickReplies .chip').forEach(function (c) {
    c.addEventListener('click', function () { kirimPesan(c.getAttribute('data-q')); });
  });

  resetChat.addEventListener('click', function () {
    chatBody.innerHTML = '';
    sesiLabel.textContent = 'Sesi #' + kodeSesi();
    toast('Sesi baru dimulai. Riwayat sebelumnya tidak disimpan.');
    pesanPembuka();
  });

  function pesanPembuka() {
    bubble('Halo. Ini ruang anonim untuk berbicara tentang narkotika — untuk diri sendiri, keluarga, atau teman. Tidak ada penilaian di sini. Mau mulai dari mana?', 'in');
  }
  pesanPembuka();

  /* ===================== HOTLINE KLIK ===================== */
  $$('.hotline-card[href^="tel:"]').forEach(function (a) {
    a.addEventListener('click', function () {
      toast('Menghubungi ' + a.querySelector('.hotline-num').textContent + '...');
    });
  });

  /* ===================== FOOTER TAHUN ===================== */
  $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
