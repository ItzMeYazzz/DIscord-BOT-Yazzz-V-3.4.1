'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const afk = require('../utils/afk');
const { respond } = require('../utils/helpers');

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('afk')
      .setDescription('Tandai dirimu sedang AFK (otomatis hilang saat kamu chat lagi)')
      .setDMPermission(false)
      .addStringOption((o) => o.setName('alasan').setDescription('Alasan AFK').setMaxLength(100)),
    async execute(interaction) {
      const reason = (interaction.options.getString('alasan') ?? 'AFK').replace(/\s+/g, ' ').trim() || 'AFK';
      afk.set(interaction.guildId, interaction.user.id, reason);
      afk.markNick(interaction.member);

      const embed = new EmbedBuilder()
        .setColor(config.colors.warn)
        .setTitle('😴 Mode AFK aktif')
        .setDescription(`${interaction.user} sekarang AFK.\n**Alasan:** ${reason}`)
        .setFooter({ text: 'AFK dihapus otomatis saat kamu mengirim pesan.' });
      await respond(interaction, { embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('afklist')
      .setDescription('Lihat siapa saja yang sedang AFK di server ini')
      .setDMPermission(false),
    async execute(interaction) {
      const rows = afk.list(interaction.guildId);
      const embed = new EmbedBuilder().setColor(config.colors.main).setTitle('😴 Member yang sedang AFK');
      if (!rows.length) embed.setDescription('Tidak ada yang AFK sekarang. 🎉');
      else {
        const lines = rows.slice(0, 25).map((r) => `• <@${r.user_id}> — ${r.reason} (<t:${Math.floor(r.since / 1000)}:R>)`);
        if (rows.length > 25) lines.push(`…dan ${rows.length - 25} lainnya`);
        embed.setDescription(lines.join('\n'));
      }
      await respond(interaction, { embeds: [embed] });
    },
  },
];
