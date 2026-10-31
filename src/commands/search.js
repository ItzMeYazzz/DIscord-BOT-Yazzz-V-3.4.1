'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const config = require('../config');
const lavalink = require('../music/lavalink');
const { fmtTime } = require('../music/musicManager');
const { enqueueTracks } = require('../music/enqueue');
const { success, fail, respond } = require('../utils/helpers');

const SOURCES = { youtube: { label: 'YouTube', emoji: '▶️' }, soundcloud: { label: 'SoundCloud', emoji: '☁️' } };
const TIMEOUT = 60_000;

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function resultsEmbed(query, source, results, picked = new Set()) {
  const lines = results.map((t, i) => {
    const mark = picked.has(i) ? '✅' : `**${i + 1}.**`;
    return `${mark} [${clip(t.title, 70)}](${t.url}) \`${fmtTime(t.duration)}\`${t.author ? `\n┗ ${clip(t.author, 40)}` : ''}`;
  });
  return new EmbedBuilder()
    .setColor(config.colors.main)
    .setTitle(`🔎 Hasil pencarian: ${clip(query, 60)}`)
    .setDescription(lines.join('\n').slice(0, 4000))
    .setThumbnail(results[0]?.thumbnail ?? null)
    .setFooter({ text: `${SOURCES[source].label} • pilih 1–5 lagu di menu bawah • berlaku 60 detik` });
}

function components(results, source, disabled = false, picked = []) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('search:pick')
    .setPlaceholder('Pilih lagu untuk diputar…')
    .setMinValues(1)
    .setMaxValues(Math.min(5, results.length))
    .setDisabled(disabled)
    .addOptions(
      results.map((t, i) => ({
        label: clip(`${i + 1}. ${t.title}`, 100),
        description: clip(`${fmtTime(t.duration)}${t.author ? ` • ${t.author}` : ''}`, 100),
        value: String(i),
        default: picked.includes(String(i)),
      })),
    );
  const other = source === 'youtube' ? 'soundcloud' : 'youtube';
  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('search:first').setLabel('Putar #1').setEmoji('▶️').setStyle(ButtonStyle.Success).setDisabled(disabled),
      new ButtonBuilder().setCustomId('search:switch').setLabel(`Cari di ${SOURCES[other].label}`).setEmoji(SOURCES[other].emoji).setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      new ButtonBuilder().setCustomId('search:cancel').setLabel('Batal').setEmoji('✖️').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    ),
  ];
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('search')
      .setDescription('Cari judul lagu lalu pilih mana yang mau disetel di voice')
      .setDMPermission(false)
      .addStringOption((o) => o.setName('judul').setDescription('Judul lagu / nama artis').setRequired(true).setMaxLength(200))
      .addStringOption((o) =>
        o.setName('source').setDescription('Sumber pencarian (bawaan: YouTube)').addChoices({ name: 'YouTube', value: 'youtube' }, { name: 'SoundCloud', value: 'soundcloud' }),
      ),
    async execute(interaction, client) {
      const query = interaction.options.getString('judul', true).trim();
      let source = interaction.options.getString('source') ?? 'youtube';

      await interaction.deferReply();
      const doSearch = (src) => lavalink.search(query, { source: src, limit: 10 });

      let results;
      try {
        results = await doSearch(source);
      } catch (err) {
        return fail(interaction, `Gagal mencari lagu: ${err.message}`);
      }
      if (!results.length) return fail(interaction, `Tidak ada hasil untuk **${clip(query, 80)}**.`);

      const msg = await respond(interaction, { embeds: [resultsEmbed(query, source, results)], components: components(results, source) });
      const message = await interaction.fetchReply().catch(() => msg);

      const collector = message.createMessageComponentCollector({ time: TIMEOUT, filter: (i) => i.message.id === message.id });
      let busy = false;

      collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: 'Hanya yang menjalankan `/search` yang bisa memilih. Jalankan `/search` sendiri ya 🙂', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        if (busy) return i.deferUpdate().catch(() => {});

        if (i.customId === 'search:cancel') {
          collector.stop('cancel');
          return i.update({ embeds: [resultsEmbed(query, source, results).setFooter({ text: 'Dibatalkan' })], components: components(results, source, true) }).catch(() => {});
        }

        if (i.customId === 'search:switch') {
          busy = true;
          await i.deferUpdate().catch(() => {});
          const next = source === 'youtube' ? 'soundcloud' : 'youtube';
          try {
            const r = await doSearch(next);
            if (!r.length) throw new Error(`tidak ada hasil di ${SOURCES[next].label}`);
            source = next;
            results = r;
            collector.resetTimer();
            await interaction.editReply({ embeds: [resultsEmbed(query, source, results)], components: components(results, source) }).catch(() => {});
          } catch (err) {
            await i.followUp({ content: `Gagal pindah sumber: ${err.message}`, flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          busy = false;
          return;
        }

        const indexes = i.customId === 'search:first' ? [0] : i.values.map(Number);
        const tracks = indexes.map((n) => results[n]).filter(Boolean);
        busy = true;
        await i.deferUpdate().catch(() => {});

        const res = await enqueueTracks({ client, guild: interaction.guild, member: i.member, textChannel: interaction.channel, tracks });
        if (!res.ok) {
          busy = false;
          return i.followUp({ embeds: [require('../utils/helpers').error(res.reason)], flags: MessageFlags.Ephemeral }).catch(() => {});
        }

        collector.stop('done');
        const names = tracks.map((t) => `• [${clip(t.title, 70)}](${t.url}) \`${fmtTime(t.duration)}\``).join('\n');
        await interaction
          .editReply({
            embeds: [success(`Ditambahkan ke antrean (${res.added} lagu):\n${names}`, '🎶 Siap disetel')],
            components: components(results, source, true, indexes.map(String)),
          })
          .catch(() => {});
      });

      collector.on('end', (_, reason) => {
        if (reason === 'time') {
          interaction.editReply({ embeds: [resultsEmbed(query, source, results).setFooter({ text: 'Waktu habis — jalankan /search lagi' })], components: components(results, source, true) }).catch(() => {});
        }
      });
    },
  },
];
