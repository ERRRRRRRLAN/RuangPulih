/* ===================== QUICK CHAT: sembunyi/tampilkan ===================== */
// Pelapor (terutama mobile) bisa sembunyikan FAB chat bila mengganggu.
// Pilihan disimpan di localStorage; FAB & modal ikut disembunyikan total.
(function () {
  var KEY = 'rp-chat-disembunyikan';
  var SEMBUNYI = 'ya';
  var fab = document.getElementById('fabChat');
  var modal = document.getElementById('chatModal');
  if (!fab || !modal) return;

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

  // Tombol "Sembunyikan chat" di header modal.
  var header = modal.querySelector('.chat-header');
  if (header) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-icon chat-hide-btn';
    btn.id = 'btnSembunyiChat';
    btn.setAttribute('aria-label', 'Sembunyikan chat');
    btn.title = 'Sembunyikan chat (bisa dibuka lagi dari menu)';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A9 9 0 0121 11.5"/><path d="M21 11.5a9 9 0 01-1.6 5.2"/><path d="M6.3 6.4A9 9 0 003 11.5a9 9 0 0013.4 6.1"/><path d="M12 16.4v.01"/></svg>';
    // Sisipkan sebelum tombol tutup (paling kanan tetep tombol tutup).
    var tutup = document.getElementById('tutupChat');
    header.insertBefore(btn, tutup);
    btn.addEventListener('click', function () {
      sembunyikan();
      // Tutup modal dulu supaya tidak nyangkut terbuka di layar.
      if (typeof window.__tutupChatModal === 'function') window.__tutupChatModal();
      var toast = document.getElementById('toastChatHide');
      if (toast) {
        toast.classList.add('show');
        clearTimeout(toast.__t);
        toast.__t = setTimeout(function () { toast.classList.remove('show'); }, 5000);
      }
    });
  }

  // Saklar kecil untuk memunculkan kembali FAB (muncul saat chat disembunyikan).
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

  // Tombol "Munculkan" di toast notifikasi.
  var toastShow = document.getElementById('toastChatShow');
  if (toastShow) {
    toastShow.addEventListener('click', function () {
      tampilkan();
      var toast = document.getElementById('toastChatHide');
      if (toast) toast.classList.remove('show');
    });
  }
})();
