'use strict';

const { SlashCommandBuilder, ChannelType, EmbedBuilder } = require('discord.js');
const config = require('../config');
const lavalink = require('../music/lavalink');
const musicManager = require('../music/musicManager');
const { success, info, fail, respond } = require('../utils/helpers');

const { fmtTime, trackLine, nowPlayingEmbed } = musicManager;

/** Pastikan ada sesi musik dan user berada di voice channel yang sama dengan bot. */
async function requireSession(interaction) {
  const q = musicManager.get(interaction.guildId);
  if (!q) {
    await fail(interaction, 'Tidak ada musik yang sedang diputar.');
    return null;
  }
  if (interaction.member.voice?.channelId !== q.voiceChannelId) {
    await fail(interaction, `Kamu harus berada di <#${q.voiceChannelId}> untuk mengontrol musik.`);
    return null;
  }
  return q;
}

const guildOnly = (b) => b.setDMPermission(false);

module.exports = [
  {
    data: guildOnly(
      new SlashCommandBuilder()
        .setName('play')
        .setDescription('Putar lagu dari YouTube / SoundCloud (judul, URL, atau playlist)')
        .addStringOption((o) => o.setName('query').setDescription('Judul lagu atau URL').setRequired(true).setMaxLength(300))
        .addStringOption((o) =>
          o
            .setName('source')
            .setDescription('Sumber pencarian (bawaan: YouTube)')
            .addChoices({ name: 'YouTube', value: 'youtube' }, { name: 'SoundCloud', value: 'soundcloud' }),
        ),
    ),
    async execute(interaction, client) {
      const query = interaction.options.getString('query', true).trim();
      const source = interaction.options.getString('source') ?? 'youtube';

      const vc = interaction.member.voice?.channel;
      if (!vc) return fail(interaction, 'Masuk dulu ke voice channel, lalu jalankan `/play`.');
      if (vc.type === ChannelType.GuildStageVoice) return fail(interaction, 'Stage channel belum didukung untuk musik. Pakai voice channel biasa.');

      let queue = musicManager.get(interaction.guildId);
      if (queue && queue.voiceChannelId !== vc.id) {
        return fail(interaction, `Bot sedang memutar musik di <#${queue.voiceChannelId}>. Masuk ke channel itu dulu.`);
      }

      await interaction.deferReply();

      // Cari lagu di NodeLink dan masuk voice BERSAMAAN (dulu berurutan, jadi waktunya dijumlahkan).
      const t0 = Date.now();
      const created = !queue;
      if (created) queue = musicManager.create(client, interaction.guild, interaction.channel);
      const timed = async (fn) => {
        const t = Date.now();
        try {
          return { value: await fn(), ms: Date.now() - t };
        } catch (error) {
          return { error, ms: Date.now() - t };
        }
      };
      const [found, joined] = await Promise.all([
        timed(() => lavalink.resolve(query, { source })),
        created ? timed(() => queue.connect(vc)) : Promise.resolve({ value: { ok: true }, ms: 0 }),
      ]);

      const total = Date.now() - t0;
      if (total > 1500) console.log(`[music] /play selesai ${total} ms — cari lagu ${found.ms} ms, masuk voice ${joined.ms} ms`);

      const abort = (text) => {
        if (created) queue.destroy();
        return fail(interaction, text);
      };
      if (found.error) return abort(`Gagal mencari lagu: ${found.error.message}`);
      const tracks = found.value;
      if (!tracks.length) return abort('Tidak ada hasil untuk pencarian itu.');
      if (joined.error) return abort(`Gagal masuk voice: ${joined.error.message}`);
      if (!joined.value.ok) return abort(joined.value.reason);
      queue.textChannel = interaction.channel;

      const added = queue.add(tracks, interaction.user.id);
      if (!added) return fail(interaction, 'Antrean penuh (maksimal 200 lagu).');

      const text =
        tracks.length === 1
          ? `Ditambahkan ke antrean: ${trackLine(tracks[0])}`
          : `**${added}** lagu dari playlist ditambahkan ke antrean.`;
      return respond(interaction, { embeds: [success(text)] });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('pause').setDescription('Jeda lagu')),
    async execute(interaction) {
      const q = await requireSession(interaction);
      if (!q) return;
      if (!q.pause()) return fail(interaction, 'Lagu sudah dijeda atau tidak ada yang diputar.');
      return respond(interaction, { embeds: [success('⏸️ Dijeda.')] });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('resume').setDescription('Lanjutkan lagu yang dijeda')),
    async execute(interaction) {
      const q = await requireSession(interaction);
      if (!q) return;
      if (!q.resume()) return fail(interaction, 'Lagu tidak sedang dijeda.');
      return respond(interaction, { embeds: [success('▶️ Dilanjutkan.')] });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('skip').setDescription('Lewati lagu saat ini')),
    async execute(interaction) {
      const q = await requireSession(interaction);
      if (!q) return;
      const title = q.current?.title;
      if (!q.skip()) return fail(interaction, 'Tidak ada lagu yang sedang diputar.');
      return respond(interaction, { embeds: [success(`⏭️ Melewati **${title}**.`)] });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('stop').setDescription('Hentikan musik, kosongkan antrean, dan keluar dari voice')),
    async execute(interaction) {
      const q = await requireSession(interaction);
      if (!q) return;
      q.destroy();
      return respond(interaction, { embeds: [success('⏹️ Musik dihentikan.')] });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('nowplaying').setDescription('Lihat lagu yang sedang diputar')),
    async execute(interaction) {
      const q = musicManager.get(interaction.guildId);
      if (!q?.current) return fail(interaction, 'Tidak ada lagu yang sedang diputar.');
      const e = nowPlayingEmbed(q.current, q.paused ? '⏸️ Dijeda' : '🎶 Sedang diputar');
      e.addFields(
        { name: 'Posisi', value: `${fmtTime(q.elapsedSeconds)} / ${fmtTime(q.current.duration)}`, inline: true },
        { name: 'Loop', value: q.loop, inline: true },
      );
      return respond(interaction, { embeds: [e] });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('queue').setDescription('Lihat antrean lagu')),
    async execute(interaction) {
      const q = musicManager.get(interaction.guildId);
      if (!q || (!q.current && !q.tracks.length)) return fail(interaction, 'Antrean kosong.');
      const lines = q.tracks.slice(0, 10).map((t, i) => `**${i + 1}.** ${trackLine(t)}`);
      const e = new EmbedBuilder()
        .setColor(config.colors.main)
        .setTitle('🎵 Antrean')
        .setDescription(
          [
            q.current ? `**Sekarang:** ${trackLine(q.current)}` : null,
            lines.length ? `\n${lines.join('\n')}` : '\n*Tidak ada lagu berikutnya.*',
            q.tracks.length > 10 ? `\n…dan ${q.tracks.length - 10} lagu lainnya` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .setFooter({ text: `Loop: ${q.loop} • ${q.tracks.length} lagu menunggu` });
      return respond(interaction, { embeds: [e] });
    },
  },

  {
    data: guildOnly(
      new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Atur mode ulang')
        .addStringOption((o) =>
          o
            .setName('mode')
            .setDescription('Mode')
            .setRequired(true)
            .addChoices(
              { name: 'Mati', value: 'off' },
              { name: 'Ulangi lagu ini', value: 'track' },
              { name: 'Ulangi seluruh antrean', value: 'queue' },
            ),
        ),
    ),
    async execute(interaction) {
      const q = await requireSession(interaction);
      if (!q) return;
      q.loop = interaction.options.getString('mode', true);
      return respond(interaction, { embeds: [success(`🔁 Mode loop: **${q.loop}**`)] });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('shuffle').setDescription('Acak urutan antrean')),
    async execute(interaction) {
      const q = await requireSession(interaction);
      if (!q) return;
      if (q.tracks.length < 2) return fail(interaction, 'Perlu minimal 2 lagu di antrean.');
      q.shuffle();
      return respond(interaction, { embeds: [success('🔀 Antrean diacak.')] });
    },
  },

  {
    data: guildOnly(
      new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Hapus satu lagu dari antrean')
        .addIntegerOption((o) => o.setName('position').setDescription('Nomor di /queue').setMinValue(1).setRequired(true)),
    ),
    async execute(interaction) {
      const q = await requireSession(interaction);
      if (!q) return;
      const removed = q.remove(interaction.options.getInteger('position', true));
      if (!removed) return fail(interaction, 'Nomor itu tidak ada di antrean.');
      return respond(interaction, { embeds: [success(`Dihapus: **${removed.title}**`)] });
    },
  },

  {
    data: guildOnly(
      new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Atur volume musik (0–200%, bawaan 100)')
        .addIntegerOption((o) => o.setName('level').setDescription('Volume dalam persen').setMinValue(0).setMaxValue(200).setRequired(true)),
    ),
    async execute(interaction) {
      const q = await requireSession(interaction);
      if (!q) return;
      q.setVolume(interaction.options.getInteger('level', true));
      return respond(interaction, { embeds: [success(`🔊 Volume: **${q.volume}%**`)] });
    },
  },

  {
    data: guildOnly(new SlashCommandBuilder().setName('clearqueue').setDescription('Kosongkan antrean (lagu saat ini tetap diputar)')),
    async execute(interaction) {
      const q = await requireSession(interaction);
      if (!q) return;
      return respond(interaction, { embeds: [success(`${q.clear()} lagu dihapus dari antrean.`)] });
    },
  },
];
