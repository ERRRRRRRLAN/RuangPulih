// Client realtime berbasis Supabase (pengganti WebSocket).
// - Notifikasi (ada pesan/pengaduan baru) → Supabase Realtime (tabel chat_event)
// - Isi pesan → fetch via API (server-side decrypt) — gak pernah lewat plaintext di Realtime
// - Typing indicator → Supabase broadcast channel (ephemeral, gak disimpan)
(function () {
  'use strict';

  var SUPABASE_URL = 'https://veocdkfohucklvkntpyc.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlb2Nka2ZvaHVja2x2a250cHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwMTMxMDUsImV4cCI6MjEwNjU4OTEwNX0.TDr--0kwMzvK1v4F7mK_Q5tGX8fRFQEm37ZFFi98F48';

  var supabase = null;
  var channel = null;
  var anonToken = null;
  var listeners = {};

  function getSupabase() {
    if (!supabase && window.supabase) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        realtime: { params: { eventsPerSecond: 10 } }
      });
    }
    return supabase;
  }

  // Ambil anon-token untuk tiket (validasi server-side, JWT terikat tiket itu)
  async function mintaAnonToken(tiket) {
    var r = await fetch('/api/pesan/tiket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiket: tiket })
    });
    if (!r.ok) throw new Error('tiket tidak valid');
    var j = await r.json();
    anonToken = j.token;
    return anonToken;
  }

  // Subscribe ke perubahan pada tiket (pelapor) atau semua tiket (konselor).
  // onEvent({ tipe, no_tiket, data })
  function subscribe(tiket, onEvent, opts) {
    var sb = getSupabase();
    if (!sb) { console.warn('supabase-js belum ter-load'); return; }
    unsubscribe();

    var namaChannel = 'chat:' + (tiket || 'konselor');
    channel = sb.channel(namaChannel);

    // Postgres Changes: dengarkan INSERT di chat_event
    var filter = tiket ? 'no_tiket=eq.' + tiket : null;
    channel.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_event', filter: filter || undefined },
      function (payload) {
        var row = payload.new || {};
        onEvent({ tipe: row.tipe, no_tiket: row.no_tiket, data: row.data || {}, dibuat: row.dibuat });
      });

    // Broadcast: typing indicator (ephemeral)
    channel.on('broadcast', { event: 'typing' }, function (msg) {
      var p = msg.payload || {};
      onEvent({ tipe: 'typing', no_tiket: p.tiket, dari: p.dari });
    });
    channel.on('broadcast', { event: 'baca' }, function (msg) {
      onEvent({ tipe: 'baca', no_tiket: (msg.payload || {}).tiket });
    });

    channel.subscribe(function (status) {
      if (status === 'SUBSCRIBED' && opts && opts.onReady) opts.onReady();
      if (status === 'CHANNEL_ERROR' && opts && opts.onError) opts.onError();
      if (status === 'TIMED_OUT' && opts && opts.onError) opts.onError();
    });
  }

  function unsubscribe() {
    if (channel) {
      try { channel.unsubscribe(); } catch (e) { /* abaikan */ }
      channel = null;
    }
  }

  // Kirim typing indicator (broadcast, gak disimpan)
  function kirimTyping(tiket, dari) {
    var sb = getSupabase();
    if (!sb || !channel) return;
    try {
      channel.send({ type: 'broadcast', event: 'typing', payload: { tiket: tiket, dari: dari } });
    } catch (e) { /* abaikan */ }
  }

  // Tandai pesan sudah dibaca pelapor (notifikasi ke konselor)
  function kirimBaca(tiket) {
    var sb = getSupabase();
    if (!sb || !channel) return;
    try {
      channel.send({ type: 'broadcast', event: 'baca', payload: { tiket: tiket } });
    } catch (e) { /* abaikan */ }
  }

  // Kirim pesan via API (server encrypt + insert; trigger buat chat_event otomatis)
  async function kirimPesan(tiket, isi) {
    var headers = { 'Content-Type': 'application/json' };
    if (anonToken) headers['Authorization'] = 'Bearer ' + anonToken;
    var r = await fetch('/api/pesan', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ tiket: tiket, isi: isi })
    });
    if (!r.ok) {
      var j = null;
      try { j = await r.json(); } catch (e) {}
      throw new Error((j && j.error) || 'gagal mengirim');
    }
    return await r.json();
  }

  // Ambil history pesan (plaintext, server-side decrypt)
  async function ambilHistory(tiket) {
    var headers = {};
    if (anonToken) headers['Authorization'] = 'Bearer ' + anonToken;
    var r = await fetch('/api/pesan?tiket=' + encodeURIComponent(tiket), { headers: headers });
    if (!r.ok) throw new Error('gagal ambil history');
    var j = await r.json();
    return j.pesan || [];
  }

  window.RuangPulihRT = {
    mintaAnonToken: mintaAnonToken,
    subscribe: subscribe,
    unsubscribe: unsubscribe,
    kirimTyping: kirimTyping,
    kirimBaca: kirimBaca,
    kirimPesan: kirimPesan,
    ambilHistory: ambilHistory,
    setAnonToken: function (t) { anonToken = t; }
  };
})();
