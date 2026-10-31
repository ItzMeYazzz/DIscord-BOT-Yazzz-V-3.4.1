'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { fail, respond } = require('../utils/helpers');
const { MIN_BET, MAX_BET, embed } = require('../minigames/common');
const eco = require('../utils/economy');
const arcade = require('../minigames/arcade');

const bet = (o, required = true) => o.setName('taruhan').setDescription(`Taruhan (${MIN_BET}-${eco.num(MAX_BET)})`).setMinValue(MIN_BET).setMaxValue(MAX_BET).setRequired(required);

// [nama, judul, deskripsi, handler, builder]
const CATALOG = [
  ['2048', '🔢 2048', 'Gabungkan ubin sampai 2048, hadiah makin besar', arcade.game2048, (s) => s.setDescription('Puzzle 2048: geser & gabungkan ubin, hadiah sesuai ubin terbesar')],
  ['ular', '🐍 Ular', 'Makan apel, jangan menabrak (tiap apel = koin)', arcade.ular, (s) => s.setDescription('Game ular: makan apel sebanyak mungkin, tiap apel = koin')],
  ['labirin', '🐭 Labirin', 'Bantu tikus menemukan keju dengan energi terbatas', arcade.labirin, (s) => s.setDescription('Labirin acak: cari jalan ke keju sebelum energi habis').addStringOption((o) => o.setName('ukuran').setDescription('Ukuran labirin (bawaan: sedang)').addChoices({ name: 'Kecil', value: 'kecil' }, { name: 'Sedang', value: 'sedang' }, { name: 'Besar', value: 'besar' }))],
  ['sapu', '🚩 Sapu Ranjau', 'Minesweeper klasik dengan angka & bendera', arcade.sapu, (s) => s.setDescription('Sapu Ranjau (Minesweeper): buka petak aman, tandai ranjau')],
  ['simon', '🎨 Simon Says', 'Ingat & ulangi pola warna yang makin panjang', arcade.simon, (s) => s.setDescription('Simon Says: ingat pola warna, makin tinggi level makin besar hadiah')],
  ['poker', '🃏 Video Poker', 'Jacks or Better: tahan kartu, tarik, menang hingga x250', arcade.poker, (s) => s.setDescription('Video Poker (Jacks or Better): tahan kartu lalu tarik, hadiah hingga x250').addIntegerOption((o) => bet(o))],
  ['crash', '🚀 Crash', 'Cashout sebelum roket meledak (ada auto-cashout)', arcade.crash, (s) => s.setDescription('Crash: pengali naik terus, cashout sebelum meledak').addIntegerOption((o) => bet(o)).addNumberOption((o) => o.setName('auto').setDescription('Auto-cashout di pengali ini (1.1–100), cocok kalau internet lambat').setMinValue(1.1).setMaxValue(100))],
  ['bom', '💣 Bom Waktu', 'Oper bom ke teman sebelum meledak (2–8 pemain)', arcade.bom, (s) => s.setDescription('Bom Waktu: oper bom sebelum meledak, yang terakhir selamat menang').addIntegerOption((o) => bet(o, false))],
];

const builder = new SlashCommandBuilder().setName('arcade').setDescription('Arcade: 2048, Ular, Labirin, Sapu Ranjau, Simon, Poker, Crash, Bom Waktu').setDMPermission(false);
for (const [name, , , , cfg] of CATALOG) builder.addSubcommand((s) => cfg(s.setName(name)));
builder.addSubcommand((s) => s.setName('daftar').setDescription('Lihat semua game arcade'));

const handlers = new Map(CATALOG.map(([name, , , fn]) => [name, fn]));

module.exports = [
  {
    data: builder,
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === 'daftar') {
        const e = embed('🕹️ Arcade', CATALOG.map(([n, t, d]) => `**${t}** — \`/arcade ${n}\`\n┗ ${d}`).join('\n'));
        e.setFooter({ text: 'Game lain: /mini (18 game), /monopoly, /ludo, /slots, /blackjack • Menang = koin!' });
        return respond(interaction, { embeds: [e], flags: MessageFlags.Ephemeral });
      }
      const fn = handlers.get(sub);
      if (!fn) return fail(interaction, 'Game tidak dikenal.');
      return fn(interaction);
    },
  },
];
module.exports.CATALOG = CATALOG;
