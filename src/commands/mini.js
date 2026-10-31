'use strict';

const { SlashCommandBuilder } = require('discord.js');
const { fail } = require('../utils/helpers');
const { MIN_BET, MAX_BET, embed } = require('../minigames/common');
const eco = require('../utils/economy');
const board = require('../minigames/board');
const word = require('../minigames/word');
const quiz = require('../minigames/quiz');
const party = require('../minigames/party');
const { respond } = require('../utils/helpers');
const { MessageFlags } = require('discord.js');

const bet = (o) => o.setName('taruhan').setDescription(`Taruhan (${MIN_BET}-${eco.num(MAX_BET)})`).setMinValue(MIN_BET).setMaxValue(MAX_BET).setRequired(true);

const CATALOG = [
  ['tictactoe', '⭕ Tic-Tac-Toe', 'Lawan teman atau bot (bot pakai minimax)', board.tictactoe, (s) => s.setDescription('Main Tic-Tac-Toe lawan teman atau bot').addUserOption((o) => o.setName('lawan').setDescription('Lawan (kosong = lawan bot)'))],
  ['connect4', '🔴 Connect 4', 'Sambungkan 4 bidak, lawan teman atau bot', board.connect4, (s) => s.setDescription('Main Connect 4 lawan teman atau bot').addUserOption((o) => o.setName('lawan').setDescription('Lawan (kosong = lawan bot)'))],
  ['memory', '🧠 Memory', 'Cocokkan 8 pasang kartu', board.memory, (s) => s.setDescription('Game memori: cocokkan 8 pasang kartu')],
  ['puzzle', '🔢 Puzzle Geser', 'Urutkan angka 1–8', board.puzzle, (s) => s.setDescription('Puzzle geser 3×3: urutkan angka 1–8')],
  ['ranjau', '💣 Ranjau', 'Buka kotak aman, ambil kapan saja (taruhan)', board.ranjau, (s) => s.setDescription('Ranjau bertaruhan: buka kotak aman & cashout kapan saja').addIntegerOption(bet).addIntegerOption((o) => o.setName('bom').setDescription('Jumlah bom 2–10 (bawaan 4, makin banyak makin besar hadiah)').setMinValue(2).setMaxValue(10))],
  ['hilo', '🃏 Hi-Lo', 'Tebak kartu lebih tinggi/rendah (taruhan)', board.hilo, (s) => s.setDescription('Hi-Lo: tebak kartu berikutnya, kumpulkan streak (taruhan)').addIntegerOption(bet)],
  ['tebakangka', '🔢 Tebak Angka', 'Semua boleh menebak angka 1–100', word.tebakangka, (s) => s.setDescription('Tebak angka 1–100 bareng-bareng (10 percobaan)')],
  ['hangman', '🪢 Tebak Kata', 'Hangman beramai-ramai', word.hangman, (s) => s.setDescription('Tebak kata (hangman) beramai-ramai')],
  ['wordle', '🔤 Wordle', 'Tebak kata 5 huruf dalam 6 kali', word.wordle, (s) => s.setDescription('Wordle bahasa Indonesia: tebak kata 5 huruf')],
  ['hitung', '🧮 Cepat Hitung', 'Siapa paling cepat menjawab soal hitung', word.hitung, (s) => s.setDescription('Balapan menjawab soal hitung (5 ronde)')],
  ['acakkata', '🔀 Acak Kata', 'Susun huruf acak jadi kata', word.acakkata, (s) => s.setDescription('Susun huruf yang diacak jadi kata (5 ronde)')],
  ['kuis', '🧠 Kuis', 'Kuis pengetahuan umum pilihan ganda', quiz.kuis, (s) => s.setDescription('Kuis pengetahuan umum beramai-ramai').addIntegerOption((o) => o.setName('jumlah').setDescription('Jumlah soal (bawaan 5)').setMinValue(3).setMaxValue(15))],
  ['bendera', '🏳️ Tebak Bendera', 'Tebak negara dari bendera', quiz.bendera, (s) => s.setDescription('Tebak negara dari benderanya').addIntegerOption((o) => o.setName('jumlah').setDescription('Jumlah soal (bawaan 5)').setMinValue(3).setMaxValue(15))],
  ['reaksi', '⚡ Reaksi', 'Siapa klik tercepat setelah tombol hijau', party.reaksi, (s) => s.setDescription('Uji kecepatan reaksi: klik saat tombol hijau')],
  ['duel', '🎲 Duel Dadu', 'Adu dadu lawan teman dengan taruhan', party.duel, (s) => s.setDescription('Tantang teman adu dadu dengan taruhan koin').addUserOption((o) => o.setName('lawan').setDescription('Siapa yang ditantang').setRequired(true)).addIntegerOption(bet)],
  ['tod', '🫣 Truth or Dare', 'Pertanyaan & tantangan seru', party.tod, (s) => s.setDescription('Truth or Dare').addUserOption((o) => o.setName('untuk').setDescription('Untuk siapa (bawaan: kamu)'))],
  ['pilih', '🤔 Pilih Salah Satu', 'Voting dilema A atau B', party.pilih, (s) => s.setDescription('Voting "pilih salah satu" bareng-bareng')],
  ['roda', '🎡 Roda Keberuntungan', 'Putar roda, menang hingga x10 (taruhan)', party.roda, (s) => s.setDescription('Putar roda keberuntungan (taruhan, hadiah hingga x10)').addIntegerOption(bet)],
];

const builder = new SlashCommandBuilder().setName('mini').setDescription('Kumpulan mini games: Tic-Tac-Toe, Wordle, Kuis, Ranjau, dan banyak lagi').setDMPermission(false);
for (const [name, , , , cfg] of CATALOG) builder.addSubcommand((s) => cfg(s.setName(name)));
builder.addSubcommand((s) => s.setName('daftar').setDescription('Lihat semua mini games'));

const handlers = new Map(CATALOG.map(([name, , , fn]) => [name, fn]));

module.exports = [
  {
    data: builder,
    async execute(interaction) {
      const sub = interaction.options.getSubcommand();
      if (sub === 'daftar') {
        const e = embed('🎮 Mini Games', CATALOG.map(([n, t, d]) => `**${t}** — \`/mini ${n}\`\n┗ ${d}`).join('\n'));
        e.setFooter({ text: 'Juga ada: /arcade (2048, ular, poker, crash…), /monopoly, /ludo, /slots, /blackjack, /roulette • Menang = koin!' });
        return respond(interaction, { embeds: [e], flags: MessageFlags.Ephemeral });
      }
      const fn = handlers.get(sub);
      if (!fn) return fail(interaction, 'Game tidak dikenal.');
      return fn(interaction);
    },
  },
];
module.exports.CATALOG = CATALOG;
