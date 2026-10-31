'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags, ChannelType } = require('discord.js');
const db = require('../database');
const config = require('../config');
const { success, info, respond, fail, hierarchyError, sendLog } = require('../utils/helpers');

const NO_REASON = 'Tidak ada alasan';

function modLog(guild, action, target, moderator, reason, extra) {
  const user = target.user ?? target;
  const e = new EmbedBuilder()
    .setColor(config.colors.warn)
    .setTitle(`🛡️ ${action}`)
    .addFields(
      { name: 'Target', value: `${user.tag} (${user.id})`, inline: true },
      { name: 'Moderator', value: `${moderator.tag} (${moderator.id})`, inline: true },
      { name: 'Alasan', value: reason },
    )
    .setTimestamp();
  if (extra) e.addFields({ name: 'Info', value: extra });
  return sendLog(guild, e);
}

const userOpt = (o, desc = 'Member') => o.setName('user').setDescription(desc).setRequired(true);
const reasonOpt = (o) => o.setName('reason').setDescription('Alasan').setMaxLength(400);

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('ban')
      .setDescription('Ban member dari server')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .setDMPermission(false)
      .addUserOption((o) => userOpt(o))
      .addStringOption(reasonOpt)
      .addIntegerOption((o) =>
        o.setName('delete_days').setDescription('Hapus pesan N hari terakhir (0-7)').setMinValue(0).setMaxValue(7),
      ),
    async execute(interaction) {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') ?? NO_REASON;
      const days = interaction.options.getInteger('delete_days') ?? 0;

      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) {
        const err = hierarchyError(interaction, member);
        if (err) return fail(interaction, err);
        if (!member.bannable) return fail(interaction, 'Aku tidak bisa mem-ban member ini.');
      }
      await interaction.guild.members.ban(user, {
        reason: `${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: days * 86400,
      });
      await respond(interaction, { embeds: [success(`**${user.tag}** di-ban.\nAlasan: ${reason}`)] });
      modLog(interaction.guild, 'Ban', user, interaction.user, reason);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Cabut ban berdasarkan ID user')
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .setDMPermission(false)
      .addStringOption((o) => o.setName('user_id').setDescription('ID user').setRequired(true))
      .addStringOption(reasonOpt),
    async execute(interaction) {
      const id = interaction.options.getString('user_id', true).trim();
      const reason = interaction.options.getString('reason') ?? NO_REASON;
      const ban = await interaction.guild.bans.fetch(id).catch(() => null);
      if (!ban) return fail(interaction, 'User itu tidak sedang di-ban (atau ID salah).');
      await interaction.guild.bans.remove(id, `${interaction.user.tag}: ${reason}`);
      await respond(interaction, { embeds: [success(`**${ban.user.tag}** di-unban.`)] });
      modLog(interaction.guild, 'Unban', ban.user, interaction.user, reason);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('kick')
      .setDescription('Kick member dari server')
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .setDMPermission(false)
      .addUserOption((o) => userOpt(o))
      .addStringOption(reasonOpt),
    async execute(interaction) {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') ?? NO_REASON;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return fail(interaction, 'Member tidak ada di server ini.');
      const err = hierarchyError(interaction, member);
      if (err) return fail(interaction, err);
      if (!member.kickable) return fail(interaction, 'Aku tidak bisa meng-kick member ini.');
      await member.kick(`${interaction.user.tag}: ${reason}`);
      await respond(interaction, { embeds: [success(`**${user.tag}** di-kick.\nAlasan: ${reason}`)] });
      modLog(interaction.guild, 'Kick', user, interaction.user, reason);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('timeout')
      .setDescription('Timeout (mute sementara) member')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption((o) => userOpt(o))
      .addIntegerOption((o) =>
        o.setName('minutes').setDescription('Durasi dalam menit (maks 40320 = 28 hari)').setMinValue(1).setMaxValue(40320).setRequired(true),
      )
      .addStringOption(reasonOpt),
    async execute(interaction) {
      const user = interaction.options.getUser('user', true);
      const minutes = interaction.options.getInteger('minutes', true);
      const reason = interaction.options.getString('reason') ?? NO_REASON;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return fail(interaction, 'Member tidak ada di server ini.');
      const err = hierarchyError(interaction, member);
      if (err) return fail(interaction, err);
      if (!member.moderatable) return fail(interaction, 'Aku tidak bisa men-timeout member ini.');
      await member.timeout(minutes * 60_000, `${interaction.user.tag}: ${reason}`);
      await respond(interaction, { embeds: [success(`**${user.tag}** di-timeout ${minutes} menit.\nAlasan: ${reason}`)] });
      modLog(interaction.guild, 'Timeout', user, interaction.user, reason, `${minutes} menit`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('untimeout')
      .setDescription('Cabut timeout member')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption((o) => userOpt(o)),
    async execute(interaction) {
      const user = interaction.options.getUser('user', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return fail(interaction, 'Member tidak ada di server ini.');
      if (!member.moderatable) return fail(interaction, 'Aku tidak bisa mengubah timeout member ini.');
      await member.timeout(null, `Dicabut oleh ${interaction.user.tag}`);
      await respond(interaction, { embeds: [success(`Timeout **${user.tag}** dicabut.`)] });
      modLog(interaction.guild, 'Untimeout', user, interaction.user, NO_REASON);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('warn')
      .setDescription('Beri peringatan ke member')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption((o) => userOpt(o))
      .addStringOption((o) => reasonOpt(o).setRequired(true)),
    async execute(interaction) {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) {
        const err = hierarchyError(interaction, member);
        if (err) return fail(interaction, err);
      }
      const total = db.addWarning(interaction.guildId, user.id, interaction.user.id, reason);
      user.send(`⚠️ Kamu mendapat peringatan di **${interaction.guild.name}**.\nAlasan: ${reason}`).catch(() => {});
      await respond(interaction, { embeds: [success(`**${user.tag}** diperingatkan (total ${total}).\nAlasan: ${reason}`)] });
      modLog(interaction.guild, 'Warn', user, interaction.user, reason, `Total warn: ${total}`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('warnings')
      .setDescription('Lihat daftar peringatan member')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption((o) => userOpt(o)),
    async execute(interaction) {
      const user = interaction.options.getUser('user', true);
      const rows = db.getWarnings(interaction.guildId, user.id);
      if (!rows.length) return respond(interaction, { embeds: [info(`**${user.tag}** belum punya peringatan.`)], flags: MessageFlags.Ephemeral });
      const lines = rows
        .slice(0, 10)
        .map((w) => `**#${w.id}** <t:${Math.floor(w.created_at / 1000)}:d> oleh <@${w.moderator_id}>\n${w.reason}`);
      await respond(interaction, {
        embeds: [info(lines.join('\n\n'), `Peringatan ${user.tag} (${rows.length})`)],
        flags: MessageFlags.Ephemeral,
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('clearwarnings')
      .setDescription('Hapus semua peringatan member')
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false)
      .addUserOption((o) => userOpt(o)),
    async execute(interaction) {
      const user = interaction.options.getUser('user', true);
      const n = db.clearWarnings(interaction.guildId, user.id);
      await respond(interaction, { embeds: [success(`${n} peringatan **${user.tag}** dihapus.`)] });
      modLog(interaction.guild, 'Clear Warnings', user, interaction.user, NO_REASON, `${n} dihapus`);
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('clear')
      .setDescription('Hapus pesan di channel ini')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .setDMPermission(false)
      .addIntegerOption((o) => o.setName('amount').setDescription('Jumlah pesan (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
      .addUserOption((o) => o.setName('user').setDescription('Hapus hanya pesan dari user ini')),
    async execute(interaction) {
      const amount = interaction.options.getInteger('amount', true);
      const target = interaction.options.getUser('user');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      let messages = await interaction.channel.messages.fetch({ limit: 100 });
      if (target) messages = messages.filter((m) => m.author.id === target.id);
      const deleted = await interaction.channel.bulkDelete([...messages.values()].slice(0, amount), true);
      await respond(interaction, {
        embeds: [success(`${deleted.size} pesan dihapus. (Pesan lebih dari 14 hari tidak bisa dihapus massal.)`)],
      });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('slowmode')
      .setDescription('Atur slowmode channel')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .setDMPermission(false)
      .addIntegerOption((o) => o.setName('seconds').setDescription('Detik (0 untuk mematikan, maks 21600)').setMinValue(0).setMaxValue(21600).setRequired(true))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (bawaan: channel ini)').addChannelTypes(ChannelType.GuildText)),
    async execute(interaction) {
      const seconds = interaction.options.getInteger('seconds', true);
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      await channel.setRateLimitPerUser(seconds, `Oleh ${interaction.user.tag}`);
      await respond(interaction, {
        embeds: [success(seconds ? `Slowmode ${channel} diatur ke **${seconds} detik**.` : `Slowmode ${channel} dimatikan.`)],
      });
    },
  },

  ...[
    { name: 'lock', desc: 'Kunci channel (member tidak bisa kirim pesan)', value: false, text: 'dikunci 🔒' },
    { name: 'unlock', desc: 'Buka kunci channel', value: null, text: 'dibuka 🔓' },
  ].map(({ name, desc, value, text }) => ({
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(desc)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .setDMPermission(false)
      .addChannelOption((o) => o.setName('channel').setDescription('Channel (bawaan: channel ini)').addChannelTypes(ChannelType.GuildText)),
    async execute(interaction) {
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: value }, { reason: `Oleh ${interaction.user.tag}` });
      await respond(interaction, { embeds: [success(`${channel} ${text}`)] });
    },
  })),
];
