'use strict';

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, version: djsVersion } = require('discord.js');
const db = require('../database');
const config = require('../config');
const { info, respond, formatDuration } = require('../utils/helpers');

const ts = (ms, style = 'F') => `<t:${Math.floor(ms / 1000)}:${style}>`;

module.exports = [
  {
    data: new SlashCommandBuilder().setName('ping').setDescription('Cek latensi bot'),
    async execute(interaction, client) {
      const sent = await interaction.reply({ content: 'Pinging...', withResponse: true });
      const rtt = sent.resource.message.createdTimestamp - interaction.createdTimestamp;
      const worst = Math.max(rtt, client.ws.ping);
      const verdict = worst < 400 ? '🟢 Lancar' : worst < 1200 ? '🟡 Agak lambat' : '🔴 Lambat — cek internet/DNS/VPN (atau pindah ke VPS)';
      await interaction.editReply({ content: '', embeds: [info(`Roundtrip: **${rtt}ms**\nWebSocket: **${client.ws.ping}ms**\nStatus: ${verdict}`, '🏓 Pong!')] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('help').setDescription('Daftar semua command'),
    async execute(interaction, client) {
      const groups = {};
      for (const c of client.commands.values()) (groups[c.category] ??= []).push(c);
      const labels = { voice: '🎧 Voice 24/7', music: '🎵 Musik', moderation: '🛡️ Moderasi', utility: '🧰 Utility', settings: '⚙️ Pengaturan', afk: '😴 AFK', level: '📈 Level', economy: '💰 Ekonomi', games: '🎮 Game', arcade: '🕹️ Arcade', search: '🔎 Cari Lagu', ludo: '🎲 Ludo', monopoly: '🎩 Monopoly', mini: '🕹️ Mini Games' };
      const e = new EmbedBuilder().setColor(config.colors.main).setTitle('Daftar command');
      for (const [cat, list] of Object.entries(groups)) {
        e.addFields({
          name: labels[cat] ?? cat,
          value: list.map((c) => `\`/${c.data.name}\` ${c.data.description}`).join('\n').slice(0, 1024),
        });
      }
      if (config.prefix.enabled) e.setFooter({ text: `Prefix: ${config.prefix.text} <command> — contoh: ${config.prefix.text} play lofi • ${config.prefix.text} skip • ${config.prefix.text} mini wordle` });
      await respond(interaction, { embeds: [e], flags: MessageFlags.Ephemeral });
    },
  },

  {
    data: new SlashCommandBuilder().setName('botinfo').setDescription('Informasi bot'),
    async execute(interaction, client) {
      const mem = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
      const e = new EmbedBuilder()
        .setColor(config.colors.main)
        .setTitle(client.user.username)
        .setThumbnail(client.user.displayAvatarURL())
        .addFields(
          { name: 'Uptime', value: formatDuration(client.uptime), inline: true },
          { name: 'Ping', value: `${client.ws.ping}ms`, inline: true },
          { name: 'Server', value: String(client.guilds.cache.size), inline: true },
          { name: 'Voice 24/7 aktif', value: String(db.all247().length), inline: true },
          { name: 'Memori', value: `${mem} MB`, inline: true },
          { name: 'Versi', value: `Node ${process.version}\ndiscord.js ${djsVersion}`, inline: true },
        );
      await respond(interaction, { embeds: [e] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('serverinfo')
      .setDescription('Informasi server')
      .setDMPermission(false),
    async execute(interaction) {
      const g = interaction.guild;
      const e = new EmbedBuilder()
        .setColor(config.colors.main)
        .setTitle(g.name)
        .setThumbnail(g.iconURL())
        .addFields(
          { name: 'Owner', value: `<@${g.ownerId}>`, inline: true },
          { name: 'Member', value: String(g.memberCount), inline: true },
          { name: 'Channel', value: String(g.channels.cache.size), inline: true },
          { name: 'Role', value: String(g.roles.cache.size), inline: true },
          { name: 'Boost', value: `Level ${g.premiumTier} (${g.premiumSubscriptionCount ?? 0})`, inline: true },
          { name: 'Dibuat', value: ts(g.createdTimestamp, 'D'), inline: true },
        )
        .setFooter({ text: `ID: ${g.id}` });
      await respond(interaction, { embeds: [e] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Informasi user')
      .setDMPermission(false)
      .addUserOption((o) => o.setName('user').setDescription('User (bawaan: kamu)')),
    async execute(interaction) {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const e = new EmbedBuilder()
        .setColor(member?.displayColor || config.colors.main)
        .setTitle(user.tag)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: user.id, inline: true },
          { name: 'Akun dibuat', value: ts(user.createdTimestamp, 'R'), inline: true },
        );
      if (member) {
        const roles = member.roles.cache.filter((r) => r.id !== interaction.guildId).map((r) => r.toString());
        e.addFields(
          { name: 'Join server', value: ts(member.joinedTimestamp, 'R'), inline: true },
          { name: `Role (${roles.length})`, value: roles.slice(0, 15).join(' ') || '-' },
        );
      }
      await respond(interaction, { embeds: [e] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('avatar')
      .setDescription('Tampilkan avatar user')
      .addUserOption((o) => o.setName('user').setDescription('User (bawaan: kamu)')),
    async execute(interaction) {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const e = new EmbedBuilder()
        .setColor(config.colors.main)
        .setTitle(`Avatar ${user.username}`)
        .setImage(user.displayAvatarURL({ size: 1024 }));
      await respond(interaction, { embeds: [e] });
    },
  },
];
