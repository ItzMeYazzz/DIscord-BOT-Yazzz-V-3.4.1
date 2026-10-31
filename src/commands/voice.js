'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags } = require('discord.js');
const db = require('../database');
const voiceManager = require('../utils/voiceManager');
const { success, info, fail, respond } = require('../utils/helpers');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('247')
      .setDescription('Atur bot agar standby 24/7 di voice channel (AFK voice)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .setDMPermission(false)
      .addSubcommand((s) =>
        s
          .setName('set')
          .setDescription('Pasang bot di voice channel 24/7')
          .addChannelOption((o) =>
            o
              .setName('channel')
              .setDescription('Voice channel (kosongkan untuk pakai channel yang sedang kamu masuki)')
              .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice),
          ),
      )
      .addSubcommand((s) => s.setName('leave').setDescription('Matikan mode 24/7 dan keluarkan bot dari voice'))
      .addSubcommand((s) => s.setName('status').setDescription('Lihat status mode 24/7 server ini')),

    async execute(interaction, client) {
      const sub = interaction.options.getSubcommand();
      const guildId = interaction.guildId;

      if (sub === 'set') {
        const channel = interaction.options.getChannel('channel') ?? interaction.member.voice?.channel;
        if (!channel) {
          return fail(interaction, 'Pilih voice channel, atau masuk dulu ke voice channel lalu jalankan lagi command ini.');
        }

        await interaction.deferReply();

        // Simpan dulu supaya handler reconnect membaca tujuan yang benar
        const previous = db.get247(guildId);
        db.set247(guildId, channel.id);

        const res = await voiceManager.join(client, guildId, channel.id);
        if (!res.ok) {
          if (previous) db.set247(guildId, previous.channel_id);
          else db.remove247(guildId);
          return fail(interaction, res.reason);
        }
        return respond(interaction, {
          embeds: [success(`BOT standby 24/7 di ${channel}. Kalau terputus, aku akan masuk lagi otomatis.`)],
        });
      }

      if (sub === 'leave') {
        if (!db.get247(guildId)) return fail(interaction, 'Mode 24/7 belum aktif di server ini.');
        voiceManager.leave(guildId);
        return respond(interaction, { embeds: [success('Mode 24/7 dimatikan dan aku keluar dari voice channel.')] });
      }

      // status
      const row = db.get247(guildId);
      if (!row) return respond(interaction, { embeds: [info('Mode 24/7 **tidak aktif**. Aktifkan dengan `/247 set`.')], flags: MessageFlags.Ephemeral });
      return respond(interaction, {
        embeds: [info(`Channel: <#${row.channel_id}>\nKoneksi: \`${voiceManager.status(guildId)}\``, 'Mode 24/7 aktif')],
        flags: MessageFlags.Ephemeral,
      });
    },
  },
];
