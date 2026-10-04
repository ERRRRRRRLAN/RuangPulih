/* ===================== CHAT UI: FAB + MODAL (pelapor) ===================== */
// Satu sumber kebenaran untuk FAB & modal chat konseling. Dipakai oleh
// index.html dan program.html — tinggal sediakan <div id="chatRoot"></div>.
// Mencegah dua halaman punya struktur berbeda (bug sebelumnya: tombol chat
// di /program tidak berfungsi karena modal tidak ada di halaman itu).
(function () {
  'use strict';
  var root = document.getElementById('chatRoot');
  if (!root || document.getElementById('chatModal')) return;

  root.innerHTML =
  '<button type="button" id="fabChat" class="fab-chat" aria-label="Chat dengan konselor" aria-expanded="false">' +
    '<svg class="fab-ikon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 01-8.5 8.5c-1.5 0-3-.4-4.2-1.1L3 20l1.1-5.3A8.5 8.5 0 1121 11.5z"/></svg>' +
    '<svg class="fab-tutup" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
    '<span class="fab-badge" id="fabBadge" hidden>0</span>' +
  '</button>' +
  '<div class="chat-modal" id="chatModal" role="dialog" aria-modal="true" aria-labelledby="chatModalJudul" hidden>' +
    '<div class="chat-modal-kotak card">' +
      '<div class="chat-header">' +
        '<div class="chat-identitas">' +
          '<span class="avatar" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c1.2-3.6 4-5.2 7-5.2s5.8 1.6 7 5.2"/></svg>' +
          '</span>' +
          '<div>' +
            '<strong id="chatModalJudul">Konselor Ruang Pulih</strong>' +
            '<span id="sesiLabel">Masukkan nomor tiket untuk mulai</span>' +
          '</div>' +
        '</div>' +
        '<div class="chat-header-aksi">' +
          '<button type="button" class="btn-icon chat-toggle-hide" id="btnSembunyiChatHeader" aria-label="Sembunyikan chat" title="Sembunyikan chat">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A9 9 0 0121 11.5"/><path d="M6.3 6.4A9 9 0 003 11.5a9 9 0 0013.4 6.1"/><path d="M12 16.4v.01"/></svg>' +
          '</button>' +
          '<button type="button" class="btn-icon" id="tutupChat" aria-label="Tutup chat">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<form class="chat-gate" id="formTiket" novalidate>' +
        '<p class="gate-teks">Chat ini terhubung ke laporan Anda. Masukkan nomor tiket yang Anda dapatkan saat melaporkan agar konselor bisa membalas.</p>' +
        '<div class="field">' +
          '<label for="inputTiketChat">Nomor tiket</label>' +
          '<input type="text" id="inputTiketChat" placeholder="PN-YYYYMMDD-XXXX" autocomplete="off" spellcheck="false" />' +
        '</div>' +
        '<button type="submit" class="btn btn-primary btn-block">Mulai Chat</button>' +
        '<p class="gate-bawah">Belum punya tiket? <a href="/#pengaduan" id="gateKePengaduan">Buat laporan anonim dulu</a></p>' +
      '</form>' +
      '<div class="chat-isi" id="chatIsi" hidden>' +
        '<div class="chat-body" id="chatBody" aria-live="polite"></div>' +
        '<div class="chat-quick" id="quickReplies">' +
          '<button type="button" class="chat-quick-toggle" id="quickRepliesToggle" aria-expanded="true" aria-controls="quickRepliesList">' +
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>' +
            '<span>Balasan cepat</span>' +
            '<svg class="chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
          '</button>' +
          '<div class="chat-quick-list" id="quickRepliesList">' +
            '<button type="button" class="chip" data-q="Saya merasa sangat stres dan mau cerita">Saya merasa stres</button>' +
            '<button type="button" class="chip" data-q="Saya ingin berhenti tapi sulit">Mau berhenti tapi sulit</button>' +
            '<button type="button" class="chip" data-q="Bagaimana cara mendaftar rehabilitasi?">Cara daftar rehabilitasi</button>' +
            '<button type="button" class="chip" data-q="Apakah benar-benar anonim dan aman?">Apakah ini anonim?</button>' +
            '<button type="button" class="chip" data-q="Saya butuh bantuan darurat">Butuh bantuan darurat</button>' +
          '</div>' +
        '</div>' +
        '<form class="chat-input" id="formChat">' +
          '<input type="text" id="inputChat" placeholder="Tulis pesan Anda..." autocomplete="off" aria-label="Pesan ke konselor" />' +
          '<button type="submit" class="btn-icon btn-send" aria-label="Kirim pesan">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2.5L11 13.5"/><path d="M22 2.5l-7 19-4-8-8-4 19-7z"/></svg>' +
          '</button>' +
        '</form>' +
      '</div>' +
    '</div>' +
  '</div>';

  // Backdrop modal: klik di luar kotak = tutup (lebih cepat dari cari tombol X).
  root.querySelector('#chatModal').addEventListener('click', function (e) {
    if (e.target === this && typeof window.__tutupChatModal === 'function') window.__tutupChatModal();
  });
})();
