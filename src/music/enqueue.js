'use strict';

const { ChannelType } = require('discord.js');
const musicManager = require('./musicManager');

/**
 * Masukkan track ke antrean milik server. Membuat sesi + join voice kalau belum ada.
 * Dipakai bersama oleh /search (dan bisa dipakai command lain).
 * @returns {Promise<{ok: true, added: number, queue: object} | {ok: false, reason: string}>}
 */
async function enqueueTracks({ client, guild, member, textChannel, tracks }) {
  const vc = member.voice?.channel;
  if (!vc) return { ok: false, reason: 'Masuk dulu ke voice channel, lalu pilih lagunya lagi.' };
  if (vc.type === ChannelType.GuildStageVoice) return { ok: false, reason: 'Stage channel belum didukung. Pakai voice channel biasa.' };

  let queue = musicManager.get(guild.id);
  if (queue && queue.voiceChannelId !== vc.id) {
    return { ok: false, reason: `Bot sedang memutar musik di <#${queue.voiceChannelId}>. Masuk ke channel itu dulu.` };
  }

  if (!queue) {
    queue = musicManager.create(client, guild, textChannel);
    const res = await queue.connect(vc);
    if (!res.ok) {
      queue.destroy();
      return { ok: false, reason: res.reason };
    }
  }
  queue.textChannel = textChannel;

  const added = queue.add(tracks, member.id);
  if (!added) return { ok: false, reason: 'Antrean penuh (maksimal 200 lagu).' };
  return { ok: true, added, queue };
}

module.exports = { enqueueTracks };
