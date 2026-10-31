'use strict';

/**
 * Penyetelan jaringan ke Discord untuk koneksi yang lambat / tidak stabil.
 *
 * 1) IPv4 lebih dulu: banyak ISP/router punya IPv6 yang "setengah mati" -> Node menunggu IPv6 dulu baru pindah.
 * 2) Koneksi HTTPS dipertahankan lama (keep-alive). Bawaan Node hanya 4 detik, jadi tiap command setelah
 *    jeda >4 detik harus membuat koneksi TCP+TLS baru ke Discord -> inilah penyebab "delay" di jaringan lambat.
 * 3) "Penjaga hangat": ping ringan tiap 20 detik supaya selalu ada koneksi siap pakai, sekaligus
 *    memantau & memberi peringatan di terminal kalau koneksi ke Discord sedang lambat.
 */
const dns = require('node:dns');

function applyEarly() {
  try {
    dns.setDefaultResultOrder('ipv4first');
  } catch {
    /* Node lama: abaikan */
  }
  try {
    const { setGlobalDispatcher, Agent } = require('undici');
    setGlobalDispatcher(
      new Agent({
        connect: {
          timeout: Number(process.env.NET_CONNECT_TIMEOUT ?? 30_000),
          keepAlive: true,
          keepAliveInitialDelay: 15_000,
        },
        keepAliveTimeout: 60_000,
        keepAliveMaxTimeout: 600_000,
        keepAliveTimeoutThreshold: 1_000,
      }),
    );
  } catch (err) {
    console.warn('[net] tidak bisa mengatur undici:', err.message);
  }
}

function startMonitor(client, intervalMs = 20_000) {
  const { Routes } = require('discord.js');
  let first = true;

  const tick = async () => {
    const t0 = Date.now();
    try {
      await client.rest.get(Routes.gateway());
    } catch (err) {
      console.warn(`[net] ping REST ke Discord gagal (${err.code ?? err.message}). Cek internet / DNS / VPN.`);
      return;
    }
    const rest = Date.now() - t0;
    const ws = client.ws.ping;
    if (first) {
      first = false;
      console.log(`[net] latensi awal ke Discord: REST ${rest} ms, gateway ${ws} ms`);
    }
    if (rest > 1500 || ws > 800) {
      console.warn(`[net] koneksi ke Discord lambat — REST ${rest} ms, gateway ${ws} ms (command bisa terasa delay).`);
    }
  };

  void tick();
  return setInterval(tick, intervalMs).unref();
}

module.exports = { applyEarly, startMonitor };
