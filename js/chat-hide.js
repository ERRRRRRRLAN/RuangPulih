/* ===================== QUICK CHAT: sembunyi/tampilkan ===================== */
// FAB punya dua aksi (satu tombol, hemat ruang mobile):
//   klik singkat  -> toggle modal chat
//   tahan 600ms    -> sembunyikan FAB total (mode "jangan ganggu")
// Pilihan hide disimpan di localStorage; ada saklar muncul-kembali.
(function () {
  'use strict';
  var KEY = 'rp-chat-disembunyikan';
  var SEMBUNYI = 'ya';
  var fab = document.getElementById('fabChat');
  var modal = document.getElementById('chatModal');
  if (!fab || !modal) return;

  var LAMA_TEKAN = 600; // ms
  var timerTekan = null;
  var sudahTekan = false;

  function sembunyikan() {
    try { localStorage.setItem(KEY, SEMBUNYI); } catch (e) { /* mode privat */ }
    document.body.classList.add('chat-disembunyikan');
  }
  function tampilkan() {
    try { localStorage.removeItem(KEY); } catch (e) { /* mode privat */ }
    document.body.classList.remove('chat-disembunyikan');
  }
  function awalSembunyi() {
    var s = null;
    try { s = localStorage.getItem(KEY); } catch (e) { s = null; }
    return s === SEMBUNYI;
  }

  // Sakelar kecil untuk memunculkan kembali FAB (hanya tampil saat disembunyikan).
  var pulihkan = document.createElement('button');
  pulihkan.type = 'button';
  pulihkan.className = 'chat-unhide';
  pulihkan.id = 'btnMunculkanChat';
  pulihkan.setAttribute('aria-label', 'Munculkan chat konselor');
  pulihkan.title = 'Munculkan chat konselor';
  pulihkan.innerHTML =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 01-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1121 11.5z"/></svg>' +
    '<span>Chat</span>';
  document.body.appendChild(pulihkan);
  pulihkan.addEventListener('click', function () {
    tampilkan();
    if (typeof window.__bukaChatModal === 'function') window.__bukaChatModal();
  });

  // Inisialisasi awal.
  if (awalSembunyi()) document.body.classList.add('chat-disembunyikan');

  // --- long-press FAB = sembunyikan total ---
  // Pakai pointer events agar jalan di mouse & touch. Klik singkat tetap
  // dikelola script.js (toggle modal) — di sini hanya tangkap tekan lama.
  function mulaiTekan(e) {
    sudahTekan = false;
    timerTekan = setTimeout(function () {
      sudahTekan = true;
      fab.classList.add('ditekan');
    }, LAMA_TEKAN);
  }
  function selesaiTekan(e) {
    clearTimeout(timerTekan);
    fab.classList.remove('ditekan');
    if (sudahTekan) {
      sudahTekan = false;
      sembunyikan();
      if (typeof window.__tutupChatModal === 'function') window.__tutupChatModal();
      var toast = document.getElementById('toastChatHide');
      if (toast) {
        toast.classList.add('show');
        clearTimeout(toast.__t);
        toast.__t = setTimeout(function () { toast.classList.remove('show'); }, 5000);
      }
    }
  }
  fab.addEventListener('pointerdown', mulaiTekan);
  fab.addEventListener('pointerup', selesaiTekan);
  fab.addEventListener('pointerleave', function () {
    clearTimeout(timerTekan);
    fab.classList.remove('ditekan');
  });
  // Batalkan long-press kalau modal terbuka di tengah tekan (FAB jadi tombol X).
  fab.addEventListener('click', function () { clearTimeout(timerTekan); });

  // Tombol "Munculkan" di toast notifikasi.
  var toastShow = document.getElementById('toastChatShow');
  if (toastShow) {
    toastShow.addEventListener('click', function () {
      tampilkan();
      var toast = document.getElementById('toastChatHide');
      if (toast) toast.classList.remove('show');
    });
  }

  // Tombol "Sembunyikan chat" di header modal (ikon mata-slash).
  var btnSembunyiHeader = document.getElementById('btnSembunyiChatHeader');
  if (btnSembunyiHeader) {
    btnSembunyiHeader.addEventListener('click', function () {
      sembunyikan();
      if (typeof window.__tutupChatModal === 'function') window.__tutupChatModal();
      var toast = document.getElementById('toastChatHide');
      if (toast) {
        toast.classList.add('show');
        clearTimeout(toast.__t);
        toast.__t = setTimeout(function () { toast.classList.remove('show'); }, 5000);
      }
    });
  }

  // Ekspos supaya bagian lain bisa konsisten.
  window.__chatDisembunyikan = sembunyikan;
  window.__chatTampilkan = tampilkan;
})();
