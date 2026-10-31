'use strict';

/**
 * Klien NodeLink/Lavalink (library: Shoukaku v4).
 * Audio diproses di server NodeLink terpisah — bot hanya mengirim perintah, jadi proses bot tetap ringan
 * dan suara tidak lagi patah-patah gara-gara event loop bot sibuk.
 *
 *   init(client)                 -> panggil SEBELUM client.login()
 *   resolve(query, opts)         -> array track (judul / URL / playlist)
 *   search(query, opts)          -> beberapa kandidat untuk /search
 *   getPlayer / joinVoice / leave
 */

const { EventEmitter } = require('events');
const { Shoukaku, Connectors } = require('shoukaku');
const config = require('../config');

const events = new EventEmitter(); // 'ready' saat node tersambung / tersambung kembali
let shoukaku = null;

const isUrl = (s) => /^https?:\/\//i.test(s);
const lastLog = new Map();
function logThrottled(key, text, every = 30_000) {
  const now = Date.now();
  if (now - (lastLog.get(key) ?? 0) < every) return;
  lastLog.set(key, now);
  console.warn(text);
}

function init(client) {
  if (shoukaku) return shoukaku;
  const n = config.nodelink;
  shoukaku = new Shoukaku(
    new Connectors.DiscordJS(client),
    [{ name: n.name, url: `${n.host}:${n.port}`, auth: n.password, secure: n.secure }],
    {
      resume: n.resume,
      resumeTimeout: 30,
      reconnectTries: 100_000, // terus mencoba sambung ulang kalau NodeLink belum/ sedang mati
      reconnectInterval: 5,
      restTimeout: 30,
      moveOnDisconnect: false,
      voiceConnectionTimeout: 20,
    },
  );

  shoukaku.on('ready', (name, reconnected) => {
    console.log(`[nodelink] ${name} terhubung${reconnected ? ' (tersambung kembali)' : ''}`);
    events.emit('ready', name);
  });
  shoukaku.on('error', (name, err) => {
    const msg = String(err?.message ?? err);
    logThrottled(`err:${msg}`, `[nodelink] ${name}: ${msg} — pastikan NodeLink sudah jalan (host ${n.host}, port ${n.port}) dan password cocok.`);
  });
  shoukaku.on('close', (name, code, reason) => {
    logThrottled(`close:${code}`, `[nodelink] ${name} terputus (kode ${code}${reason ? `, ${String(reason).slice(0, 80)}` : ''}). Mencoba menyambung ulang…`);
  });
  shoukaku.on('disconnect', (name) => {
    logThrottled('disc', `[nodelink] ${name} diputus oleh bot (percobaan sambung ulang habis).`);
  });
  return shoukaku;
}

const get = () => shoukaku;

/** Node yang sedang tersambung (beban paling ringan), atau null. */
function idealNode() {
  if (!shoukaku) return null;
  try {
    return shoukaku.getIdealNode?.() ?? shoukaku.options?.nodeResolver?.(shoukaku.nodes) ?? null;
  } catch {
    return null;
  }
}
const isReady = () => !!idealNode();

/** Tunggu sampai NodeLink tersambung. Return true/false. */
function waitReady(timeoutMs = 20_000) {
  if (isReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (v) => {
      clearTimeout(timer);
      events.off('ready', onReady);
      resolve(v);
    };
    const onReady = () => done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    events.on('ready', onReady);
  });
}

const getPlayer = (guildId) => shoukaku?.players.get(guildId) ?? null;

async function joinVoice({ guildId, channelId, shardId = 0 }) {
  if (!shoukaku) throw new Error('NodeLink belum diinisialisasi.');
  return shoukaku.joinVoiceChannel({ guildId, channelId, shardId, deaf: true });
}

async function leave(guildId) {
  if (!shoukaku) return;
  try {
    await shoukaku.leaveVoiceChannel(guildId);
  } catch {
    /* sudah tidak terhubung */
  }
}

// ---------------------------------------------------------------- track
function toTrack(t) {
  const i = t?.info ?? {};
  const len = typeof i.length === 'number' && i.length > 0 && i.length < 1e11 ? Math.floor(i.length / 1000) : null;
  return {
    encoded: t.encoded ?? t.track,
    title: i.title ?? 'Tanpa judul',
    url: i.uri && isUrl(i.uri) ? i.uri : null,
    duration: i.isStream ? null : len,
    author: i.author ?? null,
    thumbnail: i.artworkUrl ?? null,
    identifier: i.identifier ?? null,
    isStream: !!i.isStream,
    source: i.sourceName ?? null,
  };
}

/** Ubah balasan Lavalink (v4: {loadType, data}) menjadi array track. */
function normalize(res, limit) {
  if (!res) throw new Error('NodeLink tidak membalas. Coba lagi sebentar.');
  const type = String(res.loadType ?? '').toLowerCase();
  let list = [];
  if (type === 'track') list = [res.data];
  else if (type === 'search') list = res.data ?? [];
  else if (type === 'playlist') list = res.data?.tracks ?? [];
  else if (type === 'empty') list = [];
  else if (type === 'error') throw new Error(res.data?.message ?? res.data?.cause ?? 'NodeLink gagal memuat lagu.');
  else if (Array.isArray(res.tracks)) list = res.tracks; // bentuk lama
  else if (Array.isArray(res.data)) list = res.data;
  const tracks = list.filter((t) => t && (t.encoded ?? t.track)).map(toTrack);
  return limit ? tracks.slice(0, limit) : tracks;
}

function identifierFor(query, source) {
  if (isUrl(query)) return query;
  const prefix = source === 'soundcloud' ? config.nodelink.searchSoundcloud : config.nodelink.searchYoutube;
  return `${prefix}:${query}`;
}

async function load(identifier) {
  const node = idealNode();
  if (!node) throw new Error('Server musik (NodeLink) belum terhubung. Pastikan NodeLink sudah dijalankan.');
  return node.rest.resolve(identifier);
}

/**
 * @param {string} query  kata kunci atau URL (video/playlist)
 * @param {{source?: 'youtube'|'soundcloud', limit?: number}} opts
 */
async function resolve(query, { source = 'youtube', limit = 100 } = {}) {
  const url = isUrl(query);
  const res = await load(identifierFor(query, source));
  // pencarian teks: ambil hasil teratas saja; URL/playlist: semua track (dibatasi)
  return normalize(res, url ? limit : 1);
}

/** Kandidat pencarian untuk /search (hanya yang punya URL). */
async function search(query, { source = 'youtube', limit = 10 } = {}) {
  const res = await load(identifierFor(query, source));
  return normalize(res, limit).filter((t) => t.url);
}

module.exports = { init, get, events, idealNode, isReady, waitReady, getPlayer, joinVoice, leave, resolve, search, toTrack, normalize };
