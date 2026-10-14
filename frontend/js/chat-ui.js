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
          '<button type="button" class="btn-icon" id="btnAiBaru" aria-label="Mulai obrolan baru" title="Mulai obrolan baru" hidden>' +
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>' +
          '</button>' +
          '<button type="button" class="btn-icon tiket-salin" id="btnSalinTiketSesi" aria-label="Salin nomor tiket sesi ini" title="Salin nomor tiket sesi ini" hidden>' +
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
          '</button>' +
          '<button type="button" class="btn-icon chat-toggle-hide" id="btnSembunyiChatHeader" aria-label="Sembunyikan chat" title="Sembunyikan chat">' +
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A9 9 0 0121 11.5"/><path d="M6.3 6.4A9 9 0 003 11.5a9 9 0 0013.4 6.1"/><path d="M12 16.4v.01"/></svg>' +
          '</button>' +
          '<button type="button" class="btn-icon" id="tutupChat" aria-label="Tutup chat">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '<form class="chat-gate" id="formTiket" novalidate>' +
        '<button type="button" class="gate-pilih gate-pilih-utama" id="btnMulaiAi">' +
          '<span class="gate-ikon">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4M9 4h6"/><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/></svg>' +
          '</span>' +
          '<span class="gate-teks-wrap"><strong>Ngobrol dengan Sahabat AI</strong><small>Anonim · tanpa tiket · kapan saja</small></span>' +
          '<svg class="gate-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>' +
        '</button>' +
        '<div class="gate-divider"><span>atau</span></div>' +
        '<button type="button" class="gate-pilih" id="btnPilihTiket">' +
          '<span class="gate-ikon">' +
            '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5 20c1.2-3.6 4-5.2 7-5.2s5.8 1.6 7 5.2"/></svg>' +
          '</span>' +
          '<span class="gate-teks-wrap"><strong>Konselor manusia</strong><small>Punya nomor tiket laporan</small></span>' +
          '<svg class="gate-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>' +
        '</button>' +
        '<div class="gate-tiket-wrap" id="gateTiketWrap" hidden>' +
          '<div class="tiket-input-wrap">' +
            '<input type="text" id="inputTiketChat" placeholder="PN-YYYYMMDD-XXXX" autocomplete="off" spellcheck="false" />' +
            '<button type="button" class="btn-icon tiket-salin" id="btnSalinTiketGate" aria-label="Salin nomor tiket" title="Salin nomor tiket" hidden>' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
            '</button>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary btn-block">Mulai Chat</button>' +
          '<p class="gate-hint">Belum punya tiket? <a href="/#pengaduan" id="gateKePengaduan">Buat laporan anonim dulu</a> · <a href="#" id="gateTelegram">atau via Telegram</a></p>' +
        '</div>' +
      '</form>' +
      '<div class="chat-isi" id="chatIsi" hidden>' +
        '<div class="chat-mode-tabs" id="chatModeTabs" hidden>' +
          '<button type="button" class="mode-tab aktif" data-mode="konselor" id="tabKonselor">Konselor</button>' +
          '<button type="button" class="mode-tab" data-mode="ai" id="tabAi">Sahabat AI</button>' +
        '</div>' +
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
