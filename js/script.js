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
    btn.classList.remove('rippling');
    void btn.offsetWidth;
    btn.classList.add('rippling');
    setTimeout(function () { btn.classList.remove('rippling'); }, 520);
  });

  /* ===================== TEMA ===================== */
  var root = document.documentElement;
  var themeToggle = $('#themeToggle');
  var THEME_KEY = 'ruang-pulih-theme';

  var LOGO_LIGHT = '/assets/RuangPulih.jpg';
  var LOGO_DARK  = '/assets/RuangPulih2.jpg';

  function syncLogo(t) {
    document.querySelectorAll('img.brand-mark').forEach(function (img) {
      img.src = t === 'dark' ? LOGO_DARK : LOGO_LIGHT;
    });
    document.querySelectorAll('link[rel~="icon"]').forEach(function (link) {
      link.href = t === 'dark' ? LOGO_DARK : '/assets/favicon.ico';
    });
  }

  function applyTheme(t) {
    root.setAttribute('data-theme', t);
    syncLogo(t);
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

  if (navToggle && navLinks) {
    // Pindahkan menu ke <body>: .nav-pill punya transform (animasi ciut)
    // + overflow:hidden — itu menciptakan stacking context sendiri, sehingga
    // menu (position:fixed, z-index berapa pun) tidak bisa tampil di atas
    // hero. Di body, stacking context-nya root — z-index 9999 menang.
    var mediaMobile = window.matchMedia('(max-width: 980px)');

    function pindahNavLinks(keBody) {
      if (keBody && navLinks.parentElement !== document.body) {
        // taruh setelah navbar (di body), agar urutan DOM tetap rapi
        if (navbar && navbar.nextElementSibling) {
          document.body.insertBefore(navLinks, navbar.nextElementSibling);
        } else {
          document.body.appendChild(navLinks);
        }
      } else if (!keBody && navLinks.parentElement === document.body) {
        // kembalikan ke pill saat kembali ke desktop
        var pill = document.querySelector('.nav-pill');
        if (pill) pill.insertBefore(navLinks, pill.querySelector('.nav-actions'));
      }
    }

    pindahNavLinks(mediaMobile.matches);

    // Harus reactive: jika tidak, resize desktop↔mobile meninggalkan
    // navLinks di tempat yang salah (menu ter-clip / link hilang).
    if (mediaMobile.addEventListener) {
      mediaMobile.addEventListener('change', function (ev) {
        pindahNavLinks(ev.matches);
        if (!ev.matches) {
          navLinks.classList.remove('open');
          navToggle.setAttribute('aria-expanded', 'false');
        }
      });
    }

    navToggle.addEventListener('click', function (e) {
      // stopPropagation supaya document-click-handler di bawah tidak
      // langsung menutup menu yang baru saja dibuka.
      e.stopPropagation();
      var open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }
  /* ---------- navbar pill ciut saat scroll, klik logo → atas + pill penuh ---------- */
  var nav = document.querySelector('.navbar');
  var pill = document.querySelector('.nav-pill');
  var logo = document.querySelector('.nav-pill .brand');
  var ambang = 140;
  var lebarPenuh = pill ? pill.offsetWidth : 1151;
  var sedangAnimasi = false;

  function ukuranMini() {
    if (!pill) return 176;
    var brand = pill.querySelector('.brand');
    var cs = getComputedStyle(pill);
    var pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    return Math.ceil(brand.offsetWidth + pad) + 2;
  }

  function pillKecil() {
    if (!pill) return;
    if (sedangAnimasi) { sedangAnimasi = false; return; }
    lebarPenuh = pill.offsetWidth;                 // simpan posisi penuh terkini
    pill.style.width = lebarPenuh + 'px';          // kunci dulu agar transisi mulus
    requestAnimationFrame(function () {
      pill.style.width = ukuranMini() + 'px';
    });
    nav.classList.add('pill-mini');
    if (logo && logo.getAttribute('aria-expanded') === null) {
      logo.setAttribute('aria-expanded', 'false');
      logo.setAttribute('title', 'Klik untuk kembali ke atas');
    }
  }
  function pillPenuh() {
    if (!pill) return;
    nav.classList.remove('pill-mini');
    pill.style.width = lebarPenuh + 'px';          // tumbuh ke lebar semula
    if (logo) logo.setAttribute('aria-expanded', 'true');
    // setelah animasi selesai, kembalikan ke lebar natural (responsif)
    if (sedangAnimasi) return;
    sedangAnimasi = true;
    setTimeout(function () {
      if (!nav.classList.contains('pill-mini')) pill.style.width = '';
      sedangAnimasi = false;
    }, 550);
  }

  if (nav && pill) {
    var sedangGulir = false;
    window.addEventListener('resize', function () {
      if (!nav.classList.contains('pill-mini')) {
        pill.style.width = '';
        lebarPenuh = pill.offsetWidth;
      }
    });

    window.addEventListener('scroll', function () {
      if (window.pageYOffset > ambang) {
        if (!sedangGulir) { sedangGulir = true; pillKecil(); }
      } else if (sedangGulir) {
        sedangGulir = false; pillPenuh();
      }
    }, { passive: true });

    if (logo) {
      logo.setAttribute('role', 'button');
      logo.setAttribute('aria-expanded', window.pageYOffset > ambang ? 'false' : 'true');
      logo.addEventListener('click', function (e) {
        if (window.pageYOffset > ambang) {
          e.preventDefault();
          window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
          sedangAnimasi = false;
          sedangGulir = false;
          pillPenuh();
        }
      });
    }
  }
  var menuLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-links a[href^="#"]'));
  function tandaiMenuAktif(id) {
    menuLinks.forEach(function (a) {
      var sedang = a.getAttribute('href') === '#' + id;
      a.classList.toggle('active', sedang);
      if (sedang) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }
  if ('IntersectionObserver' in window && menuLinks.length) {
    var terlihat = '';
    var pengamat = new IntersectionObserver(function (entri) {
      entri.forEach(function (en) { if (en.isIntersecting) terlihat = en.target.id; });
      if (terlihat) tandaiMenuAktif(terlihat);
    }, { rootMargin: '-30% 0px -60% 0px', threshold: 0.01 });
    document.querySelectorAll('main section[id]').forEach(function (s) { pengamat.observe(s); });
  }
  if (navLinks) {
    navLinks.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        navLinks.classList.remove('open');
        if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Nav link aktif mengikuti section terlihat
  var sections = $$('main section[id]');
  var linkMap = {};
  if (navLinks) { navLinks.querySelectorAll('a').forEach(function (a) { linkMap[a.getAttribute('href')] = a; }); }
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
  document.addEventListener('click', function (e) {
    if (e.target.closest('.nav-toggle, .nav-links')) return;
    $$('.neo-select.open').forEach(function (ns) { ns.classList.remove('open'); ns.querySelector('.neo-select-trigger').setAttribute('aria-expanded', 'false'); });
    if (navLinks && !e.target.closest('.nav-toggle')) navLinks.classList.remove('open');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      $$('.neo-select.open').forEach(function (ns) { ns.classList.remove('open'); ns.querySelector('.neo-select-trigger').setAttribute('aria-expanded', 'false'); });
      if (navLinks) { navLinks.classList.remove('open'); }
      if (navToggle) { navToggle.setAttribute('aria-expanded', 'false'); }
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
  if (cerita && countCerita) {
  cerita.addEventListener('input', function () {
    var n = cerita.value.trim().length;
    countCerita.textContent = n + ' karakter' + (n < MIN_CERITA ? ' (minimal ' + MIN_CERITA + ')' : '');
    countCerita.classList.toggle('warn', n > 0 && n < MIN_CERITA);
    cerita.closest('.field').classList.remove('invalid');
  });
  }

  /* ===================== UTIL VALIDASI ===================== */
  function shake(el) {
    if (!el || reduceMotion) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
    setTimeout(function () { el.classList.remove('shake'); }, 450);
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

  if (formPengaduan) {
  formPengaduan.addEventListener('submit', async function (e) {
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

    var payload = {
      untuk: untuk.value,
      kategori: chipStore.value.join(', '),
      frekuensi: ($('#inputFrekuensi') ? $('#inputFrekuensi').value.trim() : ''),
      usia: ($('#inputUsia') ? Number($('#inputUsia').value.trim()) || null : null),
      cerita: cerita.value.trim(),
      darurat: darurat.value === 'Ya',
      kontak: ($('#inputKontakPelapor') ? $('#inputKontakPelapor').value.trim() : '')
    };

    var tombol = formPengaduan.querySelector('button[type="submit"]');
    tombol.disabled = true;
    tombol.textContent = 'Mengirim...';
    toast('Mengirim laporan...');

    try {
      var res = await fetch('/api/pengaduan/baru', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var json = await res.json();
      if (!res.ok) throw new Error(json.error || 'gagal');

      var tiket = json.no_tiket;
      var idPelapor = json.id_pelapor;

      // otomatis-binding chat ke tiket ini, supaya pelapor bisa langsung
      // chat dengan konselor tanpa perlu ketik tiket lagi
      window.__tiketChat = tiket;
      try { sessionStorage.setItem('tiket-aktif', tiket); } catch (e2) { /* mode privat */ }
      if (typeof sesiLabel !== 'undefined' && sesiLabel) {
        sesiLabel.textContent = 'Tiket ' + tiket + ' aktif';
      }

      // LANGSUNG subscribe ke tiket: jangan tunggu pesan pertama dari pelapor,
      // supaya konselor bisa memulai percakapan kapan saja.
      if (typeof socketSiap === 'function') socketSiap();

      $('#hasilTiket').textContent = tiket;
      $('#hasilID').textContent = idPelapor;

      bodyPengaduan.hidden = true;
      hasilPengaduan.hidden = false;
      hasilPengaduan.classList.add('show');
      toast('Laporan tercatat. Simpan nomor tiket Anda.');

      $('#salinTiket').onclick = function () {
        copyText(tiket + ' | ID: ' + idPelapor, 'Tiket disalin ke clipboard');
      };

      // ALUR: langsung hubungkan pelapor ke konselor. Laporan bukan sekadar
      // "tercatat" — pelapor butuh bantuan sekarang, jadi buka modal chat
      // dengan tiket yang baru dibuat (tanpa harus ketik ulang).
      setTimeout(function () {
        if (typeof window.__bukaChatModal === 'function') {
          var gate = document.getElementById('formTiket');
          var inputChat = document.getElementById('inputTiketChat');
          if (inputChat) inputChat.value = tiket;
          window.__bukaChatModal();
          // submit gate otomatis: validasi tiket -> tampil ruang chat
          if (gate) gate.requestSubmit();
        }
      }, 500);
    } catch (err) {
      toast('Gagal mengirim: ' + err.message + '. Cek koneksi, lalu coba lagi.');
      tombol.disabled = false;
      tombol.textContent = 'Kirim Laporan';
    }
  });
  } /* /if (formPengaduan) */

  /* ===================== CEK STATUS ===================== */
  var formStatus = $('#formStatus');
  var inputTiket = $('#inputTiket');
  var statusResult = $('#statusResult');
  var statusBadge = $('#statusBadge');
  var statusText = $('#statusText');

  formStatus.addEventListener('submit', async function (e) {
    e.preventDefault();
    var kode = inputTiket.value.trim().toUpperCase();
    if (!kode) {
      shake(inputTiket.closest('.field'));
      toast('Masukkan nomor tiket dulu.');
      return;
    }
    statusResult.hidden = false;
    statusResult.classList.remove('show');
    void statusResult.offsetWidth;
    statusResult.classList.add('show');
    try {
      var res = await fetch('/api/pengaduan/' + encodeURIComponent(kode));
      var data = await res.json();
      if (res.ok) {
        statusBadge.textContent = data.status;
        statusText.textContent = 'Tiket ' + data.no_tiket + ' untuk ' + data.untuk +
          ' (' + data.kategori + ') — status: ' + data.status + '. ' +
          (data.konselor ? 'Ditangani oleh ' + data.konselor + '. ' : '') +
          'Identitas Anda tetap anonim.';
      } else {
        statusBadge.textContent = 'Tidak ditemukan';
        statusText.textContent = 'Nomor tiket "' + kode + '" tidak ada di sistem kami. Periksa kembali penulisannya, atau buat laporan baru jika tiket hilang.';
      }
    } catch (err) {
      statusBadge.textContent = 'Gagal';
      statusText.textContent = 'Tidak bisa mengecek status sekarang. Cek koneksi Anda, lalu coba lagi.';
    }
  });

  /* ===================== FORM REHAB ===================== */
  // Form daftar minat program (hanya ada di /program).
  var formRehab = $('#formRehab');
  var bodyRehab = $('#bodyRehab');
  var hasilRehab = $('#hasilRehab');
  if (formRehab) {
  formRehab.addEventListener('submit', async function (e) {
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
    var tombol = formRehab.querySelector('button[type="submit"]');
    tombol.disabled = true;
    tombol.textContent = 'Menyimpan...';

    try {
      var res = await fetch('/api/layanan/minat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program: program,
          panggilan: panggilan || null,
          kontak: kontak || null,
        }),
      });
      if (!res.ok) throw new Error('gagal menyimpan');
      var data = await res.json();
    } catch (err) {
      toast('Gagal menyimpan: ' + err.message + '. Cek koneksi, lalu coba lagi.');
      tombol.disabled = false;
      tombol.textContent = 'Kirim Pendaftaran';
      return;
    }

    $('#hasilRehabText').innerHTML = kontak
      ? 'Minat Anda untuk program <strong>' + program + '</strong> tercatat. Konseler akan menghubungi ' + kontak +
        ' dalam 1 sampai 2 hari kerja.' + (panggilan ? ' Kami akan memanggil Anda dengan sebutan ' + panggilan + '.' : '')
      : 'Minat Anda untuk program <strong>' + program + '</strong> tercatat. Karena tidak ada kontak yang diberikan, ' +
        'konselor akan menunggu Anda di ruang chat.';

    $('#hasilRehabKode').textContent = data.kode_lacak;
    $('#hasilRehabKode').hidden = false;
    var cekLink = $('#hasilRehabCek');
    if (cekLink) {
      cekLink.href = '#program-lacak';
      cekLink.hidden = false;
    }

    bodyRehab.hidden = true;
    hasilRehab.hidden = false;
    hasilRehab.classList.add('show');
    toast('Pendaftaran minat tersimpan.');
    tombol.disabled = false;
    tombol.textContent = 'Kirim Pendaftaran';

    // ALUR: konselor akan menghubungi pendaftar — jadi buka ruang chat segera
    // dengan kode PM yang baru dibuat. Tanpa ini pendaftar harus cari tombol
    // chat sendiri setelah dapat kode.
    setTimeout(function () {
      if (typeof window.__bukaChatModal === 'function') {
        var inputChat = document.getElementById('inputTiketChat');
        if (inputChat) inputChat.value = data.kode_lacak;
        window.__bukaChatModal();
        var gate = document.getElementById('formTiket');
        if (gate) gate.requestSubmit();
      }
    }, 600);
  });
  } /* /if (formRehab) */

  /* ===================== CEK MINAT PROGRAM (PM-...) ===================== */
  var formCekMinat = $('#formCekMinat');
  if (formCekMinat) {
    var inputKodeMinat = $('#inputKodeMinat');
    var hasilCekMinat = $('#hasilCekMinat');
    var kodeMinatAktif = null;

    // Hanya format PM-... yang diterima.
    inputKodeMinat.addEventListener('input', function () {
      var pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      this.setSelectionRange(pos, pos);
    });

    formCekMinat.addEventListener('submit', async function (e) {
      e.preventDefault();
      var kode = inputKodeMinat.value.trim().toUpperCase();
      if (!/^PM-\d{8}-[0-9A-F]{4}$/.test(kode)) {
        shake(inputKodeMinat.closest('.form-mini'));
        toast('Format kode PM-... tidak tepat. Contoh: PM-20261003-AB12');
        return;
      }
      try {
        var res = await fetch('/api/layanan/minat/' + encodeURIComponent(kode));
        if (!res.ok) throw new Error('tidak ditemukan');
        var data = await res.json();

        kodeMinatAktif = kode;
        $('#cekMinatIsi').innerHTML =
          '<p class="cek-baris"><span class="cek-label">Program</span><b>' + data.program + '</b></p>' +
          '<p class="cek-baris"><span class="cek-label">Status</span><span class="cek-status">' + (data.status || 'Baru') + '</span></p>' +
          '<p class="cek-baris"><span class="cek-label">Konselor</span><b>' + (data.konselor || 'Belum ditugaskan') + '</b></p>';
        $('#cekMinatJudul').textContent = 'Status minat ' + kode;
        hasilCekMinat.hidden = false;
        hasilCekMinat.classList.add('show');
        setTimeout(function () { $('#btnChatMinatCek').focus(); }, 120);
      } catch (err) {
        toast('Kode lacak tidak ditemukan. Periksa kembali penulisannya.');
        shake(inputKodeMinat.closest('.form-mini'));
      }
    });

    function chatMinat(kode) {
      if (!kode) return;
      // isi gate tiket lalu buka modal chat
      inputTiketChat.value = kode;
      fabChat.click();
      setTimeout(function () { formTiket.requestSubmit(); }, 320);
    }

    $('#btnChatMinat').addEventListener('click', function () { chatMinat($('#hasilRehabKode').textContent.trim()); });
    $('#btnChatMinatCek').addEventListener('click', function () { chatMinat(kodeMinatAktif); });
  }

  /* ===================== CEK RUJUKAN (RJ-...) ===================== */
  // Pelapor lacak status rujukannya ke pihak berwajib tanpa login.
  // Server hanya mengembalikan tujuan + status + instansi; tidak ada
  // data identitas pelapor sama sekali.
  var formCekRujukan = $('#formCekRujukan');
  if (formCekRujukan) {
    var inputKodeRujukan = $('#inputKodeRujukan');
    var hasilCekRujukan = $('#hasilCekRujukan');

    inputKodeRujukan.addEventListener('input', function () {
      var pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      this.setSelectionRange(pos, pos);
    });

    formCekRujukan.addEventListener('submit', async function (e) {
      e.preventDefault();
      var kode = inputKodeRujukan.value.trim().toUpperCase();
      if (!/^RJ-\d{8}-[0-9A-F]{4}$/.test(kode)) {
        shake(inputKodeRujukan.closest('.form-mini'));
        toast('Format kode RJ-... tidak tepat. Contoh: RJ-20261003-AB12');
        return;
      }
      try {
        var res = await fetch('/api/rujukan/lacak/' + encodeURIComponent(kode));
        if (!res.ok) throw new Error('tidak ditemukan');
        var data = await res.json();

        $('#cekRujukanIsi').innerHTML =
          '<p class="cek-baris"><span class="cek-label">Dirujuk ke</span><b>' + data.tujuan + '</b></p>' +
          '<p class="cek-baris"><span class="cek-label">Instansi</span><b>' + (data.instansi || '—') + '</b></p>' +
          '<p class="cek-baris"><span class="cek-label">Status</span><span class="cek-status">' + (data.status || 'Dikirim') + '</span></p>';
        $('#cekRujukanJudul').textContent = 'Status rujukan ' + kode;
        hasilCekRujukan.hidden = false;
        hasilCekRujukan.classList.add('show');
      } catch (err) {
        toast('Kode rujukan tidak ditemukan. Periksa kembali penulisannya.');
        shake(inputKodeRujukan.closest('.form-mini'));
      }
    });
  }

  /* ===================== FAB + MODAL CHAT KONSELING ===================== */
  var fabChat = $('#fabChat');
  var chatModal = $('#chatModal');
  var formTiket = $('#formTiket');
  var inputTiketChat = $('#inputTiketChat');
  var chatIsi = $('#chatIsi');
  var chatBody = $('#chatBody');
  var chatSelesaiFlag = false; // true jika tiket ini sudah Selesai — input dikunci
  var inputChat = $('#inputChat');
  var formChat = $('#formChat');
  var btnSend = formChat.querySelector('.btn-send');
  var sesiLabel = $('#sesiLabel');
  var judulChat = $('#chatModalJudul');
  var fabBadge = $('#fabBadge');
  var socket = null;
  var antrianChat = []; // pesan tertahan sebelum socket siap
  var belumDibaca = 0;

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

  function bukaModal() {
    chatModal.hidden = false;
    requestAnimationFrame(function () { chatModal.classList.add('aktif'); });
    fabChat.classList.add('terbuka');
    document.body.classList.add('chat-terbuka');
    fabChat.setAttribute('aria-expanded', 'true');
    if (chatIsi.hidden) setTimeout(function () { inputTiketChat.focus(); }, 260);
    else setTimeout(function () { inputChat.focus(); }, 260);
  }
  function tutupModal() {
    chatModal.classList.remove('aktif');
    fabChat.classList.remove('terbuka');
    document.body.classList.remove('chat-terbuka');
    fabChat.setAttribute('aria-expanded', 'false');
    setTimeout(function () { if (!chatModal.classList.contains('aktif')) chatModal.hidden = true; }, 260);
  }
  // Diekspos supaya js/chat-hide.js bisa membuka/menutup modal konsisten.
  window.__bukaChatModal = bukaModal;
  window.__tutupChatModal = tutupModal;
  fabChat.addEventListener('click', function () {
    if (chatModal.classList.contains('aktif')) tutupModal(); else bukaModal();
  });
  $('#tutupChat').addEventListener('click', tutupModal);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && chatModal.classList.contains('aktif')) tutupModal();
  });

  // Link "Konseling" (nav, hero, footer, CTA pengaduan) juga membuka modal.
  $$('a[href="#chat"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      bukaModal();
    });
  });

  // Langkah 1: validasi tiket → langkah 2.
  // Kode PN-... = pengaduan, kode PM-... = pendaftaran minat program. Keduanya
  // berhak chat anonim — inilah jembatan pelapor ↔ konselor tanpa identitas.
  var quickPanel = $('#quickReplies');
  var quickToggle = $('#quickRepliesToggle');

  formTiket.addEventListener('submit', async function (e) {
    e.preventDefault();
    var kode = inputTiketChat.value.trim().toUpperCase();
    if (!kode) { shake(inputTiketChat.closest('.field')); toast('Masukkan nomor tiket dulu.'); return; }
    var tombol = formTiket.querySelector('button[type="submit"]');
    tombol.disabled = true;
    tombol.textContent = 'Memeriksa tiket...';
    try {
      var url = /^PM-\d{8}-[0-9A-F]{4}$/.test(kode)
        ? '/api/layanan/minat/' + encodeURIComponent(kode)
        : '/api/pengaduan/' + encodeURIComponent(kode);
      var res = await fetch(url);
      if (!res.ok) throw new Error('tiket tidak ditemukan');
      var data = await res.json();

      window.__tiketChat = kode;
      sessionStorage.setItem('tiket-aktif', kode);

      // Tampilkan identitas konselor penangan (jika sudah ditugaskan).
      judulChat.textContent = data.konselor
        ? 'Konselor ' + data.konselor
        : 'Konselor Ruang Pulih';
      var sambutan = data.program ? 'Program ' + data.program + ' · ' : '';
      sesiLabel.textContent = 'Tiket ' + kode + ' · ' + sambutan + (data.konselor ? 'ditangani oleh ' + data.konselor : 'belum ditugaskan');

      formTiket.hidden = true;
      chatIsi.hidden = false;
      chatBody.innerHTML = '';

      // Jika laporan/pendaftaran SUDAH SELESAI, jangan biarkan pelapor mengetik
      // pesan baru ke ruang kosong — beri tahu sesinya sudah ditutup.
      var selesai = String(data.status || '').toLowerCase() === 'selesai';
      chatSelesaiFlag = selesai;
      if (selesai) {
        sesiLabel.textContent = 'Tiket ' + kode + ' · sesi selesai';
        inputChat.disabled = true;
        btnSend.disabled = true;
        inputChat.placeholder = 'Sesi ini sudah selesai.';
        // Sembunyikan balasan cepat: tidak ada gunanya menawarkan
        // pembuka percakapan di sesi yang sudah ditutup konselor.
        quickPanel.classList.add('dilipat');
        quickPanel.style.display = 'none';
        var tutup = document.createElement('div');
        tutup.className = 'chat-selesai';
        tutup.innerHTML = '<strong>Sesi selesai</strong><span>Pelayanan untuk tiket ' + kode +
          ' sudah ditandai selesai oleh konselor. Jika kamu butuh bantuan lagi, silakan buat laporan baru.</span>';
        chatBody.appendChild(tutup);
      } else {
        inputChat.disabled = false;
        btnSend.disabled = false;
        inputChat.placeholder = 'Ketik pesan untuk konselor…';
        quickPanel.style.display = '';
      }

      socketSiap();
      setTimeout(function () { inputChat.focus(); }, 100);
    } catch (err) {
      toast('Nomor tiket tidak ditemukan. Periksa kembali penulisannya.');
      shake(inputTiketChat.closest('.field'));
    } finally {
      tombol.disabled = false;
      tombol.textContent = 'Mulai Chat';
    }
  });

  // Sambungan WebSocket: dibuka saat tiket divalidasi (bukan saat load) supaya
  // history pesan & pesan baru hanya untuk tiket yang dimaksud.
  function socketSiap() {
    if (socket && socket.readyState === 1) return true;
    var tiket = window.__tiketChat;
    if (!tiket) return false;
    try {
      var url = (location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + location.host + '/ws?tiket=' + encodeURIComponent(tiket);
      socket = new WebSocket(url);
    } catch (e) { return false; }
    socket.onopen = function () {
      sesiLabel.textContent = 'Tiket ' + tiket + ' · terhubung ke konselor';
      while (antrianChat.length) socket.send(antrianChat.shift());
    };
    socket.onmessage = function (ev) {
      try {
        var m = JSON.parse(ev.data);
        if (m.type === 'hello') { socket.__sid = m.sid; return; }
        if (m.type === 'typing') {
          if (m.dari === 'konselor') tampilkanMengetik();
          return;
        }
        if (m.type === 'pesan') {
          if (m.sid && m.sid === socket.__sid) return; // pesan kita sendiri
          // hanya render jika modal sedang menampilkan tiket ini
          if (window.__tiketChat !== tiket) return;
          hapusMengetik();
          bubble(m.isi, 'in');
          if (chatModal.classList.contains('aktif')) {
            socket.send(JSON.stringify({ type: 'baca', tiket: tiket }));
          } else {
            belumDibaca++;
            fabBadge.hidden = false;
            fabBadge.textContent = String(belumDibaca);
          }
        }
        else if (m.type === 'history' && Array.isArray(m.pesan)) {
          chatBody.innerHTML = ''; // bersihkan dulu — history bisa terkirim ulang saat reconnect
          m.pesan.forEach(function (p) { bubble(p.isi, p.pengirim === 'user' ? 'out' : 'in'); });
          // Pasang kembali pemberitahuan sesi selesai (dihapus innerHTML di atas)
          // — pelapor tetap harus tahu sesinya sudah ditutup.
          if (chatSelesaiFlag) {
            var tutup = document.createElement('div');
            tutup.className = 'chat-selesai';
            tutup.innerHTML = '<strong>Sesi selesai</strong><span>Jika kamu butuh bantuan lagi, silakan buat laporan baru.</span>';
            chatBody.appendChild(tutup);
          }
        }
        else if (m.error) bubble('Pesan gagal terkirim: ' + m.error, 'in');
      } catch (e) { /* abaikan format aneh */ }
    };
    socket.onclose = function () {
      sesiLabel.textContent = 'Koneksi terputus — coba buka chat lagi';
      socket = null;
    };
    return false;
  }

  function tampilkanMengetik() {
    if ($('#indikatorMengetik')) return;
    var d = document.createElement('div');
    d.className = 'msg in typing';
    d.id = 'indikatorMengetik';
    d.innerHTML = '<i></i><i></i><i></i>';
    chatBody.appendChild(d);
    chatBody.scrollTop = chatBody.scrollHeight;
  }
  function hapusMengetik() { var t = $('#indikatorMengetik'); if (t) t.remove(); }

  function kirimPesan(teks) {
    var tiket = window.__tiketChat;
    var payload = JSON.stringify({ type: 'pesan', tiket: tiket, isi: teks });
    bubble(teks, 'out');
    inputChat.value = '';
    btnSend.disabled = true;
    if (socketSiap()) socket.send(payload);
    else antrianChat.push(payload);
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

  // Lipat/urai panel balasan cepat (pelapor mobile sering merasa terganggu).
  // Pilihan tersimpan di localStorage: sekali dilipat, tetap dilipat.
  if (quickPanel && quickToggle) {
    var KEY_QUICK = 'rp-quick-dilipat';
    var dilipat = null;
    try { dilipat = localStorage.getItem(KEY_QUICK); } catch (e) { dilipat = null; }
    function setLipat(on) {
      quickPanel.classList.toggle('dilipat', on);
      quickToggle.setAttribute('aria-expanded', String(!on));
      try { on ? localStorage.setItem(KEY_QUICK, 'ya') : localStorage.removeItem(KEY_QUICK); } catch (e) { /* mode privat */ }
    }
    if (dilipat === 'ya') setLipat(true);
    quickToggle.addEventListener('click', function () {
      setLipat(!quickPanel.classList.contains('dilipat'));
    });
  }

  // Saat modal dibuka, reset badge & tandai pesan dibaca.
  var observerModal = new MutationObserver(function () {
    if (chatModal.classList.contains('aktif')) {
      belumDibaca = 0;
      fabBadge.hidden = true;
      if (socket && socket.readyState === 1 && window.__tiketChat) {
        socket.send(JSON.stringify({ type: 'baca', tiket: window.__tiketChat }));
      }
    }
  });
  observerModal.observe(chatModal, { attributes: true, attributeFilter: ['class'] });

  /* ===================== HOTLINE KLIK ===================== */
  $$('.pita-cta a[href^="tel:"]').forEach(function (a) {
    a.addEventListener('click', function () {
      toast('Menghubungi ' + a.textContent.trim() + '...');
    });
  });

  /* ===================== FOOTER TAHUN ===================== */
  $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
})();
