/* ===================== HALAMAN PROGRAM: TAB & NAVIGASI ===================== */
// Satu halaman konsolidasi: jenis program, daftar minat, lacak status
// (tiket PN / minat PM / rujukan RJ) — semua "cek cek cek" lama disatukan.
(function () {
  'use strict';
  if (!document.body.classList.contains('halaman-program')) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- TAB INTERNAL: jenis / daftar / lacak ---------- */
  var tabTombol = Array.prototype.slice.call(document.querySelectorAll('.program-tab'));
  var tabPanel = tabTombol.map(function (t) { return document.getElementById(t.getAttribute('data-tab')); });

  function tampilkanTab(id, tanpaScroll) {
    // Animasi: panel lama fade-out dulu sebelum hidden, panel baru fade-in.
    // Sebelumnya pakai hidden=true langsung — pergantiannya kaku/instan.
    var panelLama = tabPanel.find(function (p) { return !p.hidden; });
    var panelBaru = tabPanel.find(function (p) { return p.id === id; });

    tabTombol.forEach(function (t, i) {
      var aktif = t.getAttribute('data-tab') === id;
      t.classList.toggle('aktif', aktif);
      t.setAttribute('aria-selected', String(aktif));
      t.tabIndex = aktif ? 0 : -1;
    });

    function munculkan() {
      tabPanel.forEach(function (p, i) {
        var aktif = p.id === id;
        p.hidden = !aktif;
        if (aktif) {
          p.classList.add('tab-masuk');
          p.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('rs'); });
          // paksa reflow supaya transisi dari .tab-masuk ke .tab-aktif jalan
          void p.offsetWidth;
          p.classList.add('tab-aktif');
        } else {
          p.classList.remove('tab-aktif', 'tab-masuk');
        }
      });
    }

    if (panelLama && panelLama !== panelBaru && !reduceMotion) {
      panelLama.classList.remove('tab-aktif');
      panelLama.classList.add('tab-keluar');
      setTimeout(function () {
        panelLama.classList.remove('tab-keluar');
        munculkan();
      }, 170);
    } else {
      munculkan();
    }

    if (!tanpaScroll) {
      var atas = document.getElementById('program-atas');
      if (atas && window.scrollY > atas.offsetTop + 120) {
        atas.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    }
    history.replaceState(null, '', '#' + id);
  }

  tabTombol.forEach(function (t) {
    t.addEventListener('click', function () { tampilkanTab(t.getAttribute('data-tab')); });
  });

  // Tombol "Daftar Minat Sekarang" pada tab jenis program.
  Array.prototype.slice.call(document.querySelectorAll('[data-tab-goto]')).forEach(function (b) {
    b.addEventListener('click', function () { tampilkanTab(b.getAttribute('data-tab-goto')); });
  });

  // Buka tab dari URL hash (#program-daftar, #program-lacak).
  var hash = location.hash.replace('#', '');
  if (tabTombol.some(function (t) { return t.getAttribute('data-tab') === hash; })) {
    tampilkanTab(hash, true);
  }

  /* ---------- SUB-TAB LACAK: PN / PM / RJ ---------- */
  var lacakTombol = Array.prototype.slice.call(document.querySelectorAll('.lacak-tab'));
  var lacakPanel = Array.prototype.slice.call(document.querySelectorAll('[data-lacak-panel]'));

  function tampilkanLacak(kode) {
    lacakTombol.forEach(function (t) {
      var aktif = t.getAttribute('data-lacak') === kode;
      t.classList.toggle('aktif', aktif);
      t.setAttribute('aria-selected', String(aktif));
    });
    lacakPanel.forEach(function (p) {
      p.hidden = p.getAttribute('data-lacak-panel') !== kode;
    });
  }

  lacakTombol.forEach(function (t) {
    t.addEventListener('click', function () { tampilkanLacak(t.getAttribute('data-lacak')); });
  });

  // Tombol "Lacak status minat" di hasil daftar minat.
  var btnMinatKeLacak = document.getElementById('btnMinatKeLacak');
  if (btnMinatKeLacak) {
    btnMinatKeLacak.addEventListener('click', function () {
      tampilkanTab('program-lacak');
      tampilkanLacak('pm');
    });
  }

  /* ---------- JEMBATAN KE CHAT KONSELOR ---------- */
  // Tombol chat di hasil lacak / hasil minat memakai modal chat global
  // (disediakan js/script.js + js/chat-hide.js) dengan menyiapkan kode
  // tiket yang sedang aktif, lalu membuka modal.
  function bukaChatDenganKode(kode) {
    var input = document.getElementById('inputTiketChat');
    if (!input) return;
    input.value = kode;
    if (typeof window.__bukaChatModal === 'function') window.__bukaChatModal();
    // Submit form gate tiket otomatis (validasi tiket → tampil chat).
    var form = document.getElementById('formTiket');
    if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
  }

  var btnChatTiket = document.getElementById('btnChatTiket');
  if (btnChatTiket) {
    btnChatTiket.addEventListener('click', function () {
      var input = document.getElementById('inputTiket');
      var kode = input ? input.value.trim().toUpperCase() : '';
      if (kode) bukaChatDenganKode(kode);
      else if (typeof window.__bukaChatModal === 'function') window.__bukaChatModal();
    });
  }

  // Catatan: btnChatMinat & btnChatMinatCek tetap ditangani js/script.js
  // karena memakai state kodeMinatAktif & hasilRehabKode yang sudah ada.
})();
