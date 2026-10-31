'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const eco = require('../utils/economy');
const { fail, respond, formatDuration, success } = require('../utils/helpers');

const WORK_JOBS = [
  'jadi kurir paket kilat', 'ngojek online seharian', 'jaga warung kopi tengah malam',
  'jadi barista di kafe', 'jual gorengan di depan sekolah', 'bantu pindahan rumah tetangga',
  'jadi editor video freelance', 'ngajar les privat', 'perbaiki laptop tetangga',
  'jadi streamer dadakan', 'nyetir bus malam', 'jadi tukang foto wisuda',
];

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('balance')
      .setDescription('Cek saldo koin')
      .setDMPermission(false)
      .addUserOption((o) => o.setName('user').setDescription('User (bawaan: kamu)')),
    async execute(interaction) {
      const user = interaction.options.getUser('user') ?? interaction.user;
      if (user.bot) return fail(interaction, 'Bot tidak punya dompet.');
      const w = eco.wallet(interaction.guildId, user.id);
      const rank = eco.rankOf(interaction.guildId, w.balance);
      const embed = new EmbedBuilder()
        .setColor(config.colors.warn)
        .setAuthor({ name: user.displayName, iconURL: user.displayAvatarURL() })
        .setTitle(`💰 ${eco.coins(w.balance)}`)
        .addFields(
          { name: 'Peringkat', value: `#${rank}`, inline: true },
          { name: 'Total menang', value: eco.coins(w.total_won), inline: true },
          { name: 'Total kalah', value: eco.coins(w.total_lost), inline: true },
        )
        .setFooter({ text: 'Dapatkan koin dari /daily, /work, naik level, atau menang game!' });
      await respond(interaction, { embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('daily').setDescription('Klaim hadiah harian (makin lama streak, makin besar)').setDMPermission(false),
    async execute(interaction) {
      const r = eco.claimDaily(interaction.guildId, interaction.user.id);
      if (!r.ok) return fail(interaction, `Hadiah harian sudah diambil. Coba lagi dalam **${formatDuration(r.remaining)}**.`);
      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('🎁 Hadiah Harian')
        .setDescription(`Kamu mendapat **${eco.coins(r.reward)}**!\n🔥 Streak: **${r.streak} hari** (maks. bonus di hari ke-7)`)
        .setFooter({ text: `Saldo: ${eco.num(r.balance)} koin` });
      await respond(interaction, { embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder().setName('work').setDescription('Kerja untuk dapat koin (cooldown 1 jam)').setDMPermission(false),
    async execute(interaction) {
      const r = eco.claimWork(interaction.guildId, interaction.user.id);
      if (!r.ok) return fail(interaction, `Kamu masih capek. Istirahat dulu **${formatDuration(r.remaining)}**.`);
      const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle('💼 Kerja Keras')
        .setDescription(`Kamu ${job} dan dibayar **${eco.coins(r.reward)}**.`)
        .setFooter({ text: `Saldo: ${eco.num(r.balance)} koin` });
      await respond(interaction, { embeds: [embed] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Kirim koin ke member lain')
      .setDMPermission(false)
      .addUserOption((o) => o.setName('user').setDescription('Penerima').setRequired(true))
      .addIntegerOption((o) => o.setName('jumlah').setDescription('Jumlah koin').setMinValue(1).setMaxValue(10_000_000).setRequired(true)),
    async execute(interaction) {
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('jumlah', true);
      if (target.bot) return fail(interaction, 'Tidak bisa mengirim koin ke bot.');
      if (target.id === interaction.user.id) return fail(interaction, 'Tidak bisa mengirim koin ke diri sendiri.');
      if (!eco.transfer(interaction.guildId, interaction.user.id, target.id, amount)) {
        return fail(interaction, `Saldo tidak cukup. Saldomu: **${eco.coins(eco.wallet(interaction.guildId, interaction.user.id).balance)}**`);
      }
      await respond(interaction, { embeds: [success(`${interaction.user} mengirim **${eco.coins(amount)}** ke ${target}. 💸`)] });
    },
  },

  {
    data: new SlashCommandBuilder()
      .setName('givecoins')
      .setDescription('Admin: beri koin ke user (tanpa mengurangi saldo siapa pun)')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .setDMPermission(false)
      .addUserOption((o) => o.setName('user').setDescription('Penerima').setRequired(true))
      .addIntegerOption((o) => o.setName('jumlah').setDescription('Jumlah koin').setMinValue(1).setMaxValue(100_000_000).setRequired(true)),
    async execute(interaction) {
      const target = interaction.options.getUser('user', true);
      const amount = interaction.options.getInteger('jumlah', true);
      if (target.bot) return fail(interaction, 'Bot tidak punya dompet.');
      eco.addCoins(interaction.guildId, target.id, amount);
      await respond(interaction, { embeds: [success(`${target} menerima **${eco.coins(amount)}** dari admin.`)] });
    },
  },
];
