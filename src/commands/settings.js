'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../database');
const { success, info, fail, respond } = require('../utils/helpers');

const DEFAULT_WELCOME = 'Selamat datang {user} di **{server}**! Kamu member ke-{count}.';

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('setup')
      .setDescription('Atur welcome, autorole, dan log server')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .setDMPermission(false)
      .addSubcommand((s) =>
        s
          .setName('welcome')
          .setDescription('Atur channel & pesan sambutan')
          .addChannelOption((o) => o.setName('channel').setDescription('Channel sambutan').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))
          .addStringOption((o) => o.setName('message').setDescription('Pakai {user} {username} {server} {count}').setMaxLength(500)),
      )
      .addSubcommand((s) =>
        s
          .setName('autorole')
          .setDescription('Role otomatis untuk member baru')
          .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('logs')
          .setDescription('Channel log moderasi & member')
          .addChannelOption((o) => o.setName('channel').setDescription('Channel log').addChannelTypes(ChannelType.GuildText).setRequired(true)),
      )
      .addSubcommand((s) =>
        s
          .setName('disable')
          .setDescription('Matikan salah satu fitur')
          .addStringOption((o) =>
            o.setName('feature').setDescription('Fitur').setRequired(true).addChoices(
              { name: 'welcome', value: 'welcome' },
              { name: 'autorole', value: 'autorole' },
              { name: 'logs', value: 'logs' },
            ),
          ),
      )
      .addSubcommand((s) => s.setName('view').setDescription('Lihat pengaturan saat ini')),

    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      const gid = interaction.guildId;

      if (sub === 'welcome') {
        const channel = interaction.options.getChannel('channel', true);
        const message = interaction.options.getString('message') ?? DEFAULT_WELCOME;
        db.setSetting(gid, 'welcome_channel', channel.id);
        db.setSetting(gid, 'welcome_message', message);
        return respond(interaction, { embeds: [success(`Sambutan aktif di ${channel}.\nPesan: ${message}`)] });
      }

      if (sub === 'autorole') {
        const role = interaction.options.getRole('role', true);
        if (role.managed || role.id === gid) return fail(interaction, 'Role itu tidak bisa dipakai sebagai autorole.');
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
          return fail(interaction, 'Role itu lebih tinggi dari role bot. Naikkan role bot dulu.');
        }
        db.setSetting(gid, 'autorole', role.id);
        return respond(interaction, { embeds: [success(`Member baru otomatis dapat ${role}.`)] });
      }

      if (sub === 'logs') {
        const channel = interaction.options.getChannel('channel', true);
        db.setSetting(gid, 'log_channel', channel.id);
        return respond(interaction, { embeds: [success(`Log dikirim ke ${channel}.`)] });
      }

      if (sub === 'disable') {
        const feature = interaction.options.getString('feature', true);
        if (feature === 'welcome') {
          db.setSetting(gid, 'welcome_channel', null);
          db.setSetting(gid, 'welcome_message', null);
        } else if (feature === 'autorole') db.setSetting(gid, 'autorole', null);
        else db.setSetting(gid, 'log_channel', null);
        return respond(interaction, { embeds: [success(`Fitur **${feature}** dimatikan.`)] });
      }

      // view
      const s = db.getSettings(gid);
      const v247 = db.get247(gid);
      const text = [
        `**Welcome:** ${s.welcome_channel ? `<#${s.welcome_channel}>` : 'mati'}`,
        `**Pesan:** ${s.welcome_message ?? '-'}`,
        `**Autorole:** ${s.autorole ? `<@&${s.autorole}>` : 'mati'}`,
        `**Log:** ${s.log_channel ? `<#${s.log_channel}>` : 'mati'}`,
        `**Voice 24/7:** ${v247 ? `<#${v247.channel_id}>` : 'mati'}`,
      ].join('\n');
      return respond(interaction, { embeds: [info(text, 'Pengaturan server')], flags: MessageFlags.Ephemeral });
    },
  },
];
