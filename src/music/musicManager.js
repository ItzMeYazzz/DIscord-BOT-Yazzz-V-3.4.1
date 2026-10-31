'use strict';

/**
 * Antrean musik per server. Pemutaran dilakukan oleh NodeLink lewat Shoukaku (lihat lavalink.js);
 * kelas ini hanya mengatur antrean, loop, dan menanggapi event player (start/end/exception/stuck).
 */

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const voiceManager = require('../utils/voiceManager');

const IDLE_LEAVE_MS = 60_000; // antrean habis -> keluar setelah 1 menit
const EMPTY_LEAVE_MS = 120_000; // channel kosong -> keluar setelah 2 menit
const MAX_QUEUE = 200;
const MAX_FAILURES = 3; // lagu gagal berturut-turut sebelum antrean dikosongkan
const FALLBACK_MS = 4_000; // jaga-jaga kalau server tidak mengirim event "end" setelah error/skip

const queues = new Map();

function fmtTime(sec) {
  if (sec == null) return '—';
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const trackLink = (t) => (t.url ? `[${t.title.slice(0, 80)}](${t.url})` : t.title.slice(0, 80));
const trackLine = (t) => `${trackLink(t)} \`${t.isStream ? 'LIVE' : fmtTime(t.duration)}\``;

function nowPlayingEmbed(track, title = '🎶 Sedang diputar') {
  const e = new EmbedBuilder()
    .setColor(config.colors.main)
    .setTitle(title)
    .setDescription(track.url ? `[${track.title}](${track.url})` : track.title)
    .addFields({ name: 'Durasi', value: track.isStream ? 'LIVE' : fmtTime(track.duration), inline: true });
  if (track.author) e.addFields({ name: 'Channel', value: track.author, inline: true });
  if (track.requestedBy) e.addFields({ name: 'Diminta oleh', value: `<@${track.requestedBy}>`, inline: true });
  if (track.thumbnail) e.setThumbnail(track.thumbnail);
  return e;
}

const reasonOf = (ev) => String(ev?.reason ?? '').replace(/[^a-z]/gi, '').toUpperCase(); // 'loadFailed' / 'LOAD_FAILED' -> 'LOADFAILED'

class MusicQueue {
  constructor(client, guild, textChannel) {
    this.client = client;
    this.guild = guild;
    this.textChannel = textChannel;
    this.tracks = [];
    this.current = null;
    this.loop = 'off'; // off | track | queue
    this.volume = 100;
    this.voiceChannelId = null;

    this.player = null;
    this.handlers = null;
    this.pausedFlag = false;
    this.lastPosition = 0;
    this.startedAt = 0;
    this.gen = 0; // naik setiap ganti lagu; membatalkan callback lama
    this.skipFlag = false;
    this.failures = 0;
    this.lastException = null;
    this.destroyed = false;
    this.lastAnnounced = null;

    this.idleTimer = null;
    this.emptyTimer = null;
    this.fallbackTimer = null;
  }

  get paused() {
    return this.pausedFlag;
  }

  get elapsedSeconds() {
    return Math.floor((this.player?.position ?? this.lastPosition ?? 0) / 1000);
  }

  async connect(voiceChannel) {
    const me = this.guild.members.me ?? (await this.guild.members.fetchMe());
    const perms = voiceChannel.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.Speak)) {
      return { ok: false, reason: 'Bot tidak punya izin **Speak** di channel itu.' };
    }
    this.voiceChannelId = voiceChannel.id;
    voiceManager.musicStart(this.guild.id, voiceChannel.id, (player) => this._attach(player));

    const res = await voiceManager.join(this.client, this.guild.id, voiceChannel.id);
    if (!res.ok) return res;
    this._attach(res.player);
    return { ok: true };
  }

  /** Tambah lagu ke antrean. Return jumlah yang benar-benar masuk. */
  add(tracks, userId) {
    const room = Math.max(0, MAX_QUEUE - this.tracks.length);
    const added = tracks.slice(0, room).map((t) => ({ ...t, requestedBy: userId }));
    this.tracks.push(...added);
    this._clearIdle();
    if (!this.current && added.length) this._playNext();
    return added.length;
  }

  skip() {
    if (!this.current || !this.player) return false;
    this.skipFlag = true;
    const gen = this.gen;
    this._setFallback(() => {
      if (gen === this.gen && this.skipFlag) this._advance('STOPPED', true);
    });
    this.player.stopTrack().catch(() => {
      if (gen === this.gen) this._advance('STOPPED', true);
    });
    return true;
  }

  pause() {
    if (!this.current || this.pausedFlag || !this.player) return false;
    this.pausedFlag = true;
    this.player.setPaused(true).catch(() => {
      this.pausedFlag = false;
    });
    return true;
  }

  resume() {
    if (!this.current || !this.pausedFlag || !this.player) return false;
    this.pausedFlag = false;
    this.player.setPaused(false).catch(() => {
      this.pausedFlag = true;
    });
    return true;
  }

  setVolume(level) {
    this.volume = Math.max(0, Math.min(200, Math.round(level)));
    this.player?.setGlobalVolume(this.volume).catch(() => {});
  }

  shuffle() {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
  }

  remove(position) {
    return this.tracks.splice(position - 1, 1)[0] ?? null;
  }

  clear() {
    const n = this.tracks.length;
    this.tracks = [];
    return n;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._clearIdle();
    this.clearEmptyTimer();
    this._clearFallback();
    this.tracks = [];
    this.current = null;
    const p = this.player;
    this._detach();
    this.player = null;
    p?.stopTrack().catch(() => {});
    queues.delete(this.guild.id);
    voiceManager.musicEnd(this.client, this.guild.id);
  }

  startEmptyTimer() {
    if (this.emptyTimer || this.destroyed) return;
    this.emptyTimer = setTimeout(() => {
      this.textChannel?.send({ embeds: [new EmbedBuilder().setColor(config.colors.warn).setDescription('Voice channel kosong, musik dihentikan.')] }).catch(() => {});
      this.destroy();
    }, EMPTY_LEAVE_MS);
  }

  clearEmptyTimer() {
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
    this.emptyTimer = null;
  }

  // ---------- player ----------
  _attach(player) {
    if (this.destroyed || !player || this.player === player) return;
    const old = this.player;
    if (old) {
      this.lastPosition = old.position ?? this.lastPosition;
      this._detach();
    }
    this.player = player;

    const h = {
      start: () => this._onStart(player),
      end: (ev) => this._onEnd(player, ev),
      exception: (ev) => this._onException(player, ev),
      stuck: () => this._onStuck(player),
    };
    for (const [name, fn] of Object.entries(h)) player.on(name, fn);
    this.handlers = { player, h };

    if (this.volume !== 100) player.setGlobalVolume(this.volume).catch(() => {});
    // Player baru (NodeLink restart / gabung ulang): lanjutkan lagu yang sedang berjalan dari posisi terakhir
    if (this.current && old) {
      this.pausedFlag = false;
      this._startCurrent(this.lastPosition, false);
    }
  }

  _detach() {
    if (!this.handlers) return;
    const { player, h } = this.handlers;
    for (const [name, fn] of Object.entries(h)) player.removeListener(name, fn);
    this.handlers = null;
  }

  _setFallback(fn) {
    this._clearFallback();
    this.fallbackTimer = setTimeout(fn, FALLBACK_MS);
  }

  _clearFallback() {
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = null;
  }

  _onStart(player) {
    if (this.destroyed || player !== this.player) return;
    this.startedAt = Date.now();
    this._clearFallback();
  }

  _onEnd(player, ev) {
    if (this.destroyed || player !== this.player) return;
    const reason = reasonOf(ev);
    if (reason === 'REPLACED' || reason === 'CLEANUP') return;
    // event basi dari lagu sebelumnya
    const enc = ev?.track?.encoded;
    if (enc && this.current?.encoded && enc !== this.current.encoded) return;

    const wasSkipped = this.skipFlag;
    if (reason === 'STOPPED' && !wasSkipped) return; // dihentikan oleh kita saat destroy/ganti player
    this._clearFallback();
    this._advance(reason, wasSkipped);
  }

  _onException(player, ev) {
    if (this.destroyed || player !== this.player) return;
    const message = ev?.exception?.message ?? ev?.error ?? 'error tidak diketahui';
    this.lastException = String(message);
    const gen = this.gen;
    // normalnya server mengirim "end (loadFailed)" setelah ini; ini hanya jaga-jaga
    this._setFallback(() => {
      if (gen === this.gen && this.current) this._failCurrent();
    });
  }

  _onStuck(player) {
    if (this.destroyed || player !== this.player || !this.current) return;
    this.textChannel?.send({ embeds: [new EmbedBuilder().setColor(config.colors.warn).setDescription(`**${this.current.title}** macet, dilewati.`)] }).catch(() => {});
    this.skip();
  }

  /** Lagu selesai / dilewati / gagal -> tentukan lagu berikutnya. */
  _advance(reason, wasSkipped) {
    this.skipFlag = false;
    if (reason === 'LOADFAILED') return this._failCurrent();
    if (reason === 'FINISHED') this.failures = 0; // lagu benar-benar selesai diputar = server sehat lagi
    const finished = this.current;
    if (finished) {
      if (this.loop === 'track' && !wasSkipped) this.tracks.unshift(finished);
      else if (this.loop === 'queue') this.tracks.push(finished);
    }
    this._playNext();
  }

  _failCurrent(message) {
    const track = this.current;
    if (!track) return;
    const why = message ?? this.lastException ?? 'lagu tidak bisa dimuat';
    this.lastException = null;
    this.failures++;
    this.textChannel
      ?.send({ embeds: [new EmbedBuilder().setColor(config.colors.error).setDescription(`Gagal memutar **${track.title}**.\n\`${String(why).slice(0, 300)}\``)] })
      .catch(() => {});
    if (this.failures >= MAX_FAILURES) {
      const n = this.clear();
      this.failures = 0;
      this.textChannel
        ?.send({ embeds: [new EmbedBuilder().setColor(config.colors.warn).setDescription(`Beberapa lagu berturut-turut gagal diputar${n ? `, ${n} lagu tersisa dihapus` : ''}. Cek NodeLink (log & koneksi YouTube) lalu coba lagi.`)] })
        .catch(() => {});
    }
    this._playNext();
  }

  _playNext() {
    if (this.destroyed) return;
    this._clearIdle();
    this._clearFallback();
    this.skipFlag = false;

    const next = this.tracks.shift();
    if (!next) {
      this.current = null;
      this.idleTimer = setTimeout(() => {
        this.textChannel?.send({ embeds: [new EmbedBuilder().setColor(config.colors.main).setDescription('Antrean selesai. Sampai jumpa! 👋')] }).catch(() => {});
        this.destroy();
      }, IDLE_LEAVE_MS);
      return;
    }
    this.current = next;
    this.gen++;
    this.lastPosition = 0;
    this._startCurrent(0);
  }

  async _startCurrent(position = 0, announce = true) {
    const gen = this.gen;
    const track = this.current;
    if (!track) return;
    try {
      if (!this.player) throw new Error('Belum terhubung ke voice / NodeLink.');
      await this.player.playTrack({
        track: { encoded: track.encoded },
        paused: false,
        ...(position > 2000 ? { position: Math.floor(position) } : {}),
      });
      if (gen !== this.gen || this.destroyed) return;
      this.pausedFlag = false;
      this.startedAt = Date.now();
      if (announce) {
        const same = this.loop === 'track' && this.lastAnnounced === track.encoded;
        if (!same) this.textChannel?.send({ embeds: [nowPlayingEmbed(track)] }).catch(() => {});
        this.lastAnnounced = track.encoded;
      }
    } catch (err) {
      console.error(`[music:${this.guild.id}] gagal memutar:`, err.message);
      if (gen === this.gen && !this.destroyed) this._failCurrent(err.message);
    }
  }

  _clearIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }
}

module.exports = {
  get: (guildId) => queues.get(guildId) ?? null,
  create(client, guild, textChannel) {
    const q = new MusicQueue(client, guild, textChannel);
    queues.set(guild.id, q);
    return q;
  },
  handleVoiceUpdate(client, oldState, newState) {
    const q = queues.get(newState.guild.id);
    if (!q || !q.voiceChannelId) return;
    const channel = newState.guild.channels.cache.get(q.voiceChannelId);
    if (!channel?.members) return;
    const humans = channel.members.filter((m) => !m.user.bot).size;
    if (humans === 0) q.startEmptyTimer();
    else q.clearEmptyTimer();
  },
  fmtTime,
  trackLine,
  nowPlayingEmbed,
};
