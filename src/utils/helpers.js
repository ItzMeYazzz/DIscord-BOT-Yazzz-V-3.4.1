'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const db = require('../database');

const makeEmbed = (color, description, title) => {
  const e = new EmbedBuilder().setColor(color).setDescription(description);
  if (title) e.setTitle(title);
  return e;
};
const success = (d, t) => makeEmbed(config.colors.success, d, t);
const error = (d, t) => makeEmbed(config.colors.error, d, t);
const info = (d, t) => makeEmbed(config.colors.main, d, t);

/** Balas interaksi dengan aman, baik sudah di-defer, sudah dibalas, atau belum. */
async function respond(interaction, data) {
  if (interaction.deferred && !interaction.replied) {
    const { flags, ...rest } = data;
    return interaction.editReply(rest);
  }
  if (interaction.replied) return interaction.followUp(data);
  return interaction.reply(data);
}

const fail = (interaction, text) =>
  respond(interaction, { embeds: [error(text)], flags: MessageFlags.Ephemeral });

/** Cek apakah moderator/bot boleh bertindak terhadap target. Return teks error atau null. */
function hierarchyError(interaction, member) {
  const { guild, client } = interaction;
  if (member.id === interaction.user.id) return 'Kamu tidak bisa melakukan ini pada dirimu sendiri.';
  if (member.id === client.user.id) return 'Aku tidak bisa melakukan ini pada diriku sendiri.';
  if (member.id === guild.ownerId) return 'Tidak bisa melakukan ini pada owner server.';
  if (
    interaction.user.id !== guild.ownerId &&
    interaction.member.roles.highest.position <= member.roles.highest.position
  ) {
    return 'Role target sama atau lebih tinggi dari rolemu.';
  }
  if (guild.members.me.roles.highest.position <= member.roles.highest.position) {
    return 'Role target sama atau lebih tinggi dari role bot. Naikkan role bot di pengaturan server.';
  }
  return null;
}

/** Kirim embed ke channel log server (jika sudah diatur lewat /setup logs). */
async function sendLog(guild, embed) {
  const s = db.getSettings(guild.id);
  if (!s.log_channel) return;
  const ch =
    guild.channels.cache.get(s.log_channel) ??
    (await guild.channels.fetch(s.log_channel).catch(() => null));
  if (!ch?.isTextBased()) return;
  ch.send({ embeds: [embed] }).catch(() => {});
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}h`);
  if (h) parts.push(`${h}j`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s % 60}d`);
  return parts.join(' ');
}

function formatTemplate(text, member) {
  return text
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
}

module.exports = { success, error, info, respond, fail, hierarchyError, sendLog, formatDuration, formatTemplate };
