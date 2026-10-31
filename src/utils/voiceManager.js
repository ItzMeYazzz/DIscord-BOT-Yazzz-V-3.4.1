'use strict';

/**
 * Manajer voice (berbasis NodeLink lewat Shoukaku).
 * - Mode 24/7: channel tujuan disimpan di SQLite; bot masuk lagi otomatis setelah restart / putus / di-kick.
 * - Mode musik: selama ada sesi musik, tujuan sementara = channel pemutar musik. Setelah selesai,
 *   bot kembali ke channel 24/7 (kalau ada) atau keluar.
 */

const { PermissionFlagsBits } = require('discord.js');
const db = require('../database');
const lavalink = require('../music/lavalink');

const retryTimers = new Map();
const musicTargets = new Map(); // guildId -> channelId (sesi musik aktif)
const connectHooks = new Map(); // guildId -> fn(player) dipanggil setiap player baru/ada siap
const joining = new Map(); // guildId -> Promise (cegah join ganda bersamaan)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let hookedClient = null;

/** Channel yang seharusnya dihuni bot saat ini (musik > 24/7 > tidak ada). */
function targetChannel(guildId) {
  return musicTargets.get(guildId) ?? db.get247(guildId)?.channel_id ?? null;
}

function runHook(guildId, player) {
  try {
    connectHooks.get(guildId)?.(player);
  } catch (err) {
    console.error(`[voice:${guildId}] hook error:`, err.message);
  }
}

async function _join(client, guildId, channelId, { force = false } = {}) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { ok: false, reason: 'Server tidak ditemukan.' };

  const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isVoiceBased()) return { ok: false, reason: 'Voice channel tidak ditemukan.' };

  const me = guild.members.me ?? (await guild.members.fetchMe());
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
    return { ok: false, reason: 'Bot tidak punya izin **View Channel** dan **Connect** di channel itu.' };
  }
  if (channel.full && !perms.has(PermissionFlagsBits.MoveMembers)) return { ok: false, reason: 'Channel penuh.' };

  if (!lavalink.isReady()) {
    return { ok: false, reason: 'Server musik (NodeLink) belum terhubung. Pastikan NodeLink sudah dijalankan, lalu coba lagi.' };
  }

  const existing = lavalink.getPlayer(guildId);
  if (existing) {
    const here = me.voice?.channelId === channelId;
    if (here && !force) {
      runHook(guildId, existing);
      return { ok: true, player: existing };
    }
    await lavalink.leave(guildId); // pindah channel / paksa gabung ulang = player baru
  }

  try {
    const player = await lavalink.joinVoice({ guildId, channelId, shardId: guild.shardId ?? 0 });
    runHook(guildId, player);
    return { ok: true, player };
  } catch (err) {
    console.warn(`[voice:${guildId}] gagal join: ${err.message}`);
    await lavalink.leave(guildId);
    return { ok: false, reason: /timeout|not established|seconds/i.test(err.message) ? 'Timeout saat menyambung ke voice. Coba lagi sebentar.' : `Gagal masuk voice: ${err.message}` };
  }
}

async function join(client, guildId, channelId, opts = {}) {
  const pending = joining.get(guildId);
  if (pending) await pending.catch(() => {});
  const p = _join(client, guildId, channelId, opts);
  joining.set(guildId, p);
  try {
    return await p;
  } finally {
    if (joining.get(guildId) === p) joining.delete(guildId);
  }
}

function clearRetry(guildId) {
  const t = retryTimers.get(guildId);
  if (t) clearTimeout(t);
  retryTimers.delete(guildId);
}

/** Matikan mode 24/7. Kalau musik sedang aktif, koneksi dibiarkan sampai musik selesai. */
function leave(guildId) {
  db.remove247(guildId); // hapus dulu supaya tidak masuk lagi
  if (musicTargets.has(guildId)) return;
  clearRetry(guildId);
  lavalink.leave(guildId);
}

/** Mulai sesi musik: tujuan sementara dialihkan ke channel musik. */
function musicStart(guildId, channelId, hook) {
  musicTargets.set(guildId, channelId);
  if (hook) connectHooks.set(guildId, hook);
  clearRetry(guildId);
}

/** Akhiri sesi musik: kembali ke channel 24/7 kalau ada, kalau tidak keluar dari voice. */
function musicEnd(client, guildId) {
  musicTargets.delete(guildId);
  connectHooks.delete(guildId);
  if (db.get247(guildId)) {
    scheduleRejoin(client, guildId, 500, true);
    return;
  }
  clearRetry(guildId);
  lavalink.leave(guildId);
}

/** Jadwalkan join ulang dengan backoff (maksimal 60 detik). */
function scheduleRejoin(client, guildId, delay = 5_000, force = false) {
  if (retryTimers.has(guildId)) return;
  const timer = setTimeout(async () => {
    retryTimers.delete(guildId);
    const target = targetChannel(guildId);
    if (!target) return;

    // Sudah di channel yang benar? Tidak perlu apa-apa.
    const me = client.guilds.cache.get(guildId)?.members.me;
    if (lavalink.getPlayer(guildId) && me?.voice.channelId === target) return;

    const res = await join(client, guildId, target, { force }).catch((e) => ({ ok: false, reason: e.message }));
    if (res.ok) return;
    console.warn(`[voice:${guildId}] gagal rejoin: ${res.reason}`);
    scheduleRejoin(client, guildId, Math.min(delay * 2, 60_000));
  }, delay);
  retryTimers.set(guildId, timer);
}

async function restoreAll(client) {
  hookedClient = client;
  await lavalink.waitReady(20_000); // beri NodeLink waktu tersambung dulu
  for (const row of db.all247()) {
    const res = await join(client, row.guild_id, row.channel_id).catch((e) => ({ ok: false, reason: e.message }));
    if (res.ok) console.log(`[voice] masuk ke ${row.channel_id} (server ${row.guild_id})`);
    else {
      console.warn(`[voice] gagal restore server ${row.guild_id}: ${res.reason}`);
      scheduleRejoin(client, row.guild_id, 10_000);
    }
    await sleep(1_000);
  }
}

function healthPass(client, { expedite = false } = {}) {
  const ids = new Set([...db.all247().map((r) => r.guild_id), ...musicTargets.keys()]);
  for (const guildId of ids) {
    const target = targetChannel(guildId);
    if (!target) continue;
    if (expedite) clearRetry(guildId); // NodeLink baru tersambung: tidak perlu menunggu backoff
    const player = lavalink.getPlayer(guildId);
    if (!player) {
      scheduleRejoin(client, guildId, expedite ? 500 : 1_000);
      continue;
    }
    const me = client.guilds.cache.get(guildId)?.members.me;
    if (me && me.voice.channelId !== target) scheduleRejoin(client, guildId, 1_000, true);
  }
}

function startHealthCheck(client, intervalMs = 60_000) {
  hookedClient = client;
  // NodeLink hidup lagi -> pulihkan koneksi 24/7 & sesi musik segera
  lavalink.events.on('ready', () => healthPass(client, { expedite: true }));
  return setInterval(() => healthPass(client), intervalMs);
}

function status(guildId) {
  if (!lavalink.isReady()) return 'nodelink-offline';
  return lavalink.getPlayer(guildId) ? 'connected' : 'disconnected';
}

function destroyAll() {
  for (const t of retryTimers.values()) clearTimeout(t);
  retryTimers.clear();
  void hookedClient;
}

module.exports = {
  join,
  leave,
  scheduleRejoin,
  restoreAll,
  startHealthCheck,
  status,
  destroyAll,
  targetChannel,
  musicStart,
  musicEnd,
};
