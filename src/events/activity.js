'use strict';

const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const afk = require('../utils/afk');
const leveling = require('../utils/leveling');
const { rand } = require('../utils/economy');
const { handleLevelUp } = require('../utils/levelUp');
const { formatDuration } = require('../utils/helpers');

const MESSAGE_XP_COOLDOWN = 60_000; // 1 menit per user
const MESSAGE_XP = [15, 25];
const VOICE_XP_PER_MINUTE = 10;
const xpCooldown = new Map();

/** Bersihkan cooldown lama supaya Map tidak membengkak. */
setInterval(() => {
  const limit = Date.now() - MESSAGE_XP_COOLDOWN;
  for (const [k, t] of xpCooldown) if (t < limit) xpCooldown.delete(k);
}, 10 * 60_000).unref();

// ---------- AFK ----------
async function handleAfk(message) {
  const gid = message.guild.id;

  // 1) Pemilik AFK kembali (kirim pesan)
  const own = afk.get(gid, message.author.id);
  if (own) {
    afk.remove(gid, message.author.id);
    afk.unmarkNick(message.member);
    const embed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setDescription(`👋 Selamat datang kembali, ${message.author}! AFK-mu sudah dihapus.\n⏱️ Kamu AFK selama **${formatDuration(Date.now() - own.since)}**.`);
    message.reply({ embeds: [embed] }).then((m) => setTimeout(() => m.delete().catch(() => {}), 10_000)).catch(() => {});
  }

  // 2) Ada yang menyebut user AFK
  const lines = [];
  for (const user of message.mentions.users.values()) {
    if (user.bot || user.id === message.author.id) continue;
    const entry = afk.get(gid, user.id);
    if (!entry) continue;
    lines.push(`😴 **${user.displayName}** sedang AFK: ${entry.reason} — <t:${Math.floor(entry.since / 1000)}:R>`);
    if (lines.length >= 5) break;
  }
  if (lines.length) {
    const embed = new EmbedBuilder().setColor(config.colors.warn).setDescription(lines.join('\n'));
    message.reply({ embeds: [embed] }).then((m) => setTimeout(() => m.delete().catch(() => {}), 20_000)).catch(() => {});
  }
}

// ---------- XP pesan ----------
async function handleMessageXp(client, message) {
  const cfg = leveling.getConfig(message.guild.id);
  if (!cfg.enabled) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const last = xpCooldown.get(key) ?? 0;
  if (Date.now() - last < MESSAGE_XP_COOLDOWN) return;
  xpCooldown.set(key, Date.now());

  const gain = Math.max(1, Math.round(rand(MESSAGE_XP[0], MESSAGE_XP[1]) * cfg.multiplier));
  const result = leveling.addXp(message.guild.id, message.author.id, gain, { message: true });
  if (result.leveledUp) await handleLevelUp(client, message.guild, message.author.id, result, message.channel);
}

// ---------- XP voice ----------
function startVoiceXp(client) {
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      try {
        const cfg = leveling.getConfig(guild.id);
        if (!cfg.enabled) continue;
        const gain = Math.max(1, Math.round(VOICE_XP_PER_MINUTE * cfg.multiplier));

        for (const channel of guild.channels.cache.values()) {
          if (!channel.isVoiceBased() || channel.id === guild.afkChannelId) continue;
          const humans = channel.members.filter((m) => !m.user.bot);
          if (humans.size < 2) continue; // sendirian tidak dapat XP (anti-farming)

          for (const m of humans.values()) {
            if (m.voice.selfDeaf || m.voice.serverDeaf) continue;
            const result = leveling.addXp(guild.id, m.id, gain, { voiceMinute: true });
            if (result.leveledUp) await handleLevelUp(client, guild, m.id, result, null);
          }
        }
      } catch (err) {
        console.warn(`[voicexp] ${guild.id}: ${err.message}`);
      }
    }
  }, 60_000).unref();
}

module.exports = [
  {
    name: Events.MessageCreate,
    async execute(client, message) {
      if (!message.guild || message.author.bot || message.webhookId || message.system) return;
      try {
        await handleAfk(message);
        await handleMessageXp(client, message);
      } catch (err) {
        console.warn('[activity]', err.message);
      }
    },
  },
  {
    name: Events.ClientReady,
    once: true,
    execute(client) {
      startVoiceXp(client);
    },
  },
  {
    // Member keluar server: hapus status AFK-nya.
    name: Events.GuildMemberRemove,
    execute(client, member) {
      afk.remove(member.guild.id, member.id);
    },
  },
];
