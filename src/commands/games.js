'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const config = require('../config');
const eco = require('../utils/economy');
const g = require('../utils/gameLogic');
const { fail, respond } = require('../utils/helpers');

const MIN_BET = 10;
const MAX_BET = 10_000_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const activeGames = new Set(); // cegah main blackjack/rps paralel

/** Update pesan dari klik tombol; kalau interaksi sudah kedaluwarsa, edit pesan aslinya. */
async function safeUpdate(i, root, payload) {
  try {
    await i.update(payload);
  } catch {
    await root.editReply(payload).catch(() => {});
  }
}

/** Balasan pertama sebuah game. Kalau gagal (mis. koneksi lambat -> interaksi kedaluwarsa), taruhan dikembalikan. */
async function openReply(interaction, bet, payload) {
  try {
    await respond(interaction, payload);
    return true;
  } catch (err) {
    console.warn(`[games] balasan pertama gagal (${err.code ?? err.message}); taruhan ${bet} dikembalikan.`);
    if (bet > 0) eco.settle(interaction.guildId, interaction.user.id, bet, bet);
    return false;
  }
}

const betOption = (o, required = true) =>
  o.setName('taruhan').setDescription(`Jumlah taruhan (${MIN_BET}-${eco.num(MAX_BET)})`).setMinValue(required ? MIN_BET : 0).setMaxValue(MAX_BET).setRequired(required);

/** Potong taruhan dari saldo. Kalau saldo kurang, kirim pesan error dan return false. */
async function takeBet(interaction, bet) {
  if (eco.tryTake(interaction.guildId, interaction.user.id, bet)) return true;
  const bal = eco.wallet(interaction.guildId, interaction.user.id).balance;
  await fail(interaction, `Saldo tidak cukup. Saldomu **${eco.coins(bal)}** — coba /daily atau /work dulu.`);
  return false;
}

/** Embed hasil game: warna & teks untung/rugi otomatis dari net. */
function resultEmbed({ title, body, bet, returned, balance }) {
  const net = returned - bet;
  const color = net > 0 ? config.colors.success : net === 0 ? config.colors.warn : config.colors.error;
  const verdict =
    net > 0 ? `✅ **Menang +${eco.coins(net)}**`
    : net === 0 ? '🤝 **Seri — taruhan kembali**'
    : returned > 0 ? `⚠️ **Rugi ${eco.coins(-net)}** (sebagian kembali)`
    : `❌ **Kalah −${eco.coins(bet)}**`;
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(`${body}\n\n${verdict}`)
    .setFooter({ text: `Saldo: ${eco.num(balance)} koin` });
}

const waitEmbed = (title, text) => new EmbedBuilder().setColor(config.colors.main).setTitle(title).setDescription(text);

module.exports = [
  // ================= SLOTS =================
  {
    data: new SlashCommandBuilder()
      .setName('slots')
      .setDescription('Main mesin slot 🎰')
      .setDMPermission(false)
      .addIntegerOption((o) => betOption(o)),
    async execute(interaction) {
      const bet = interaction.options.getInteger('taruhan', true);
      if (!(await takeBet(interaction, bet))) return;

      const reels = [g.spinReel(), g.spinReel(), g.spinReel()];
      const spin = '🎰';
      const frame = (a, b, c, note) =>
        waitEmbed('🎰 SLOTS', `## ${a} │ ${b} │ ${c}\n${note}`).setFooter({ text: '3 sama = x4–x100 • 2 🍒 = x2 • sepasang = x0.5' });

      if (!(await openReply(interaction, bet, { embeds: [frame(spin, spin, spin, 'Memutar...')] }))) return;
      try {
        await sleep(800);
        await interaction.editReply({ embeds: [frame(reels[0].emoji, spin, spin, 'Memutar...')] });
        await sleep(800);
        await interaction.editReply({ embeds: [frame(reels[0].emoji, reels[1].emoji, spin, 'Hampir...')] });
        await sleep(900);
      } catch {
        /* animasi gagal: tetap selesaikan taruhan di bawah */
      }

      const { mult, label } = g.slotMultiplier(reels);
      const returned = Math.floor(bet * mult);
      const balance = eco.settle(interaction.guildId, interaction.user.id, bet, returned);
      const embed = resultEmbed({
        title: mult >= 20 ? '🎰 SLOTS — 🎉 JACKPOT! 🎉' : '🎰 SLOTS',
        body: `## ${reels.map((r) => r.emoji).join(' │ ')}\n${label}${mult > 0 ? ` — **x${mult}**` : ''}`,
        bet, returned, balance,
      });
      await interaction.editReply({ embeds: [embed] }).catch(() => respond(interaction, { embeds: [embed] }).catch(() => {}));
    },
  },

  // ================= COINFLIP =================
  {
    data: new SlashCommandBuilder()
      .setName('coinflip')
      .setDescription('Tebak lemparan koin: gambar atau angka (menang x2)')
      .setDMPermission(false)
      .addStringOption((o) =>
        o.setName('pilihan').setDescription('Tebakanmu').setRequired(true).addChoices(
          { name: 'Gambar', value: 'gambar' },
          { name: 'Angka', value: 'angka' },
        ),
      )
      .addIntegerOption((o) => betOption(o)),
    async execute(interaction) {
      const pick = interaction.options.getString('pilihan', true);
      const bet = interaction.options.getInteger('taruhan', true);
      if (!(await takeBet(interaction, bet))) return;

      if (!(await openReply(interaction, bet, { embeds: [waitEmbed('🪙 Coinflip', 'Koin dilempar ke udara...')] }))) return;
      await sleep(1200);

      const result = Math.random() < 0.5 ? 'gambar' : 'angka';
      const returned = result === pick ? bet * 2 : 0;
      const balance = eco.settle(interaction.guildId, interaction.user.id, bet, returned);
      const embed = resultEmbed({
        title: '🪙 Coinflip',
        body: `Tebakanmu: **${pick}**\nHasil: **${result}**`,
        bet, returned, balance,
      });
      await interaction.editReply({ embeds: [embed] }).catch(() => {});
    },
  },

  // ================= DICE =================
  {
    data: new SlashCommandBuilder()
      .setName('dice')
      .setDescription('Adu lempar 2 dadu melawan bot (menang x2)')
      .setDMPermission(false)
      .addIntegerOption((o) => betOption(o)),
    async execute(interaction) {
      const bet = interaction.options.getInteger('taruhan', true);
      if (!(await takeBet(interaction, bet))) return;

      if (!(await openReply(interaction, bet, { embeds: [waitEmbed('🎲 Adu Dadu', 'Mengocok dadu...')] }))) return;
      await sleep(1100);

      const mine = [g.rollDie(), g.rollDie()];
      const theirs = [g.rollDie(), g.rollDie()];
      const sum = (a) => a[0] + a[1];
      const show = (a) => `${g.DICE_FACES[a[0] - 1]} ${g.DICE_FACES[a[1] - 1]}  = **${sum(a)}**`;
      const returned = sum(mine) > sum(theirs) ? bet * 2 : sum(mine) === sum(theirs) ? bet : 0;
      const balance = eco.settle(interaction.guildId, interaction.user.id, bet, returned);
      const embed = resultEmbed({
        title: '🎲 Adu Dadu',
        body: `Kamu: ${show(mine)}\nBot: ${show(theirs)}`,
        bet, returned, balance,
      });
      await interaction.editReply({ embeds: [embed] }).catch(() => {});
    },
  },

  // ================= ROULETTE =================
  {
    data: new SlashCommandBuilder()
      .setName('roulette')
      .setDescription('Roulette: tebak warna, genap/ganjil, atau angka 0-36')
      .setDMPermission(false)
      .addIntegerOption((o) => betOption(o))
      .addStringOption((o) =>
        o.setName('pilihan').setDescription('Merah/Hitam/Genap/Ganjil x2 • Hijau x36').addChoices(
          { name: '🔴 Merah (x2)', value: 'merah' },
          { name: '⚫ Hitam (x2)', value: 'hitam' },
          { name: 'Genap (x2)', value: 'genap' },
          { name: 'Ganjil (x2)', value: 'ganjil' },
          { name: '🟢 Hijau / 0 (x36)', value: 'hijau' },
        ),
      )
      .addIntegerOption((o) => o.setName('angka').setDescription('Atau tebak angka persis 0-36 (x36)').setMinValue(0).setMaxValue(36)),
    async execute(interaction) {
      const bet = interaction.options.getInteger('taruhan', true);
      const color = interaction.options.getString('pilihan');
      const number = interaction.options.getInteger('angka');
      if ((color === null) === (number === null)) {
        return fail(interaction, 'Pilih **salah satu**: `pilihan` (warna/genap/ganjil) **atau** `angka`.');
      }
      if (!(await takeBet(interaction, bet))) return;

      const pick = number ?? color;
      if (!(await openReply(interaction, bet, { embeds: [waitEmbed('🎡 Roulette', 'Bola berputar...')] }))) return;
      await sleep(1500);

      const n = Math.floor(Math.random() * 37);
      const col = g.rouletteColor(n);
      const returned = bet * g.rouletteMultiplier(n, pick);
      const balance = eco.settle(interaction.guildId, interaction.user.id, bet, returned);
      const embed = resultEmbed({
        title: '🎡 Roulette',
        body: `Taruhanmu: **${number !== null ? `angka ${number}` : color}**\nBola berhenti di ${g.COLOR_EMOJI[col]} **${n}** (${col})`,
        bet, returned, balance,
      });
      await interaction.editReply({ embeds: [embed] }).catch(() => {});
    },
  },

  // ================= ROCK PAPER SCISSORS =================
  {
    data: new SlashCommandBuilder()
      .setName('rps')
      .setDescription('Batu-gunting-kertas lawan bot (taruhan opsional, menang x2)')
      .setDMPermission(false)
      .addIntegerOption((o) => betOption(o, false)),
    async execute(interaction) {
      const bet = interaction.options.getInteger('taruhan') ?? 0;
      const gid = interaction.guildId;
      const uid = interaction.user.id;
      const key = `rps:${gid}:${uid}`;
      if (activeGames.has(key)) return fail(interaction, 'Kamu masih punya game RPS yang berjalan.');
      if (bet > 0 && !(await takeBet(interaction, bet))) return;
      activeGames.add(key);

      const row = new ActionRowBuilder().addComponents(
        ...Object.entries(g.RPS).map(([name, { emoji }]) =>
          new ButtonBuilder().setCustomId(`rps:${name}`).setLabel(name[0].toUpperCase() + name.slice(1)).setEmoji(emoji).setStyle(ButtonStyle.Primary),
        ),
      );

      let done = false;
      const refund = () => {
        if (done) return;
        done = true;
        activeGames.delete(key);
        if (bet > 0) eco.settle(gid, uid, bet, bet);
      };

      try {
        await respond(interaction, {
          embeds: [waitEmbed('✊ Batu Gunting Kertas', `Pilih senjatamu dalam 30 detik!${bet ? `\nTaruhan: **${eco.coins(bet)}**` : ''}`)],
          components: [row],
        });
        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ time: 30_000 });

        collector.on('collect', async (i) => {
          if (i.user.id !== uid) return i.reply({ content: 'Ini bukan gamemu 😅', flags: MessageFlags.Ephemeral });
          if (done) return;
          const mine = i.customId.split(':')[1];
          const bot = Object.keys(g.RPS)[Math.floor(Math.random() * 3)];
          const returned = mine === bot ? bet : g.RPS[mine].beats === bot ? bet * 2 : 0;
          done = true;
          activeGames.delete(key);
          const balance = eco.settle(gid, uid, bet, returned);
          const body = `Kamu: ${g.RPS[mine].emoji} **${mine}**\nBot: ${g.RPS[bot].emoji} **${bot}**`;
          const embed = bet > 0
            ? resultEmbed({ title: '✊ Batu Gunting Kertas', body, bet, returned, balance })
            : new EmbedBuilder()
                .setColor(mine === bot ? config.colors.warn : returned ? config.colors.success : config.colors.error)
                .setTitle('✊ Batu Gunting Kertas')
                .setDescription(`${body}\n\n${mine === bot ? '🤝 **Seri!**' : returned ? '✅ **Kamu menang!**' : '❌ **Bot menang!**'}`);
          collector.stop('done');
          await safeUpdate(i, interaction, { embeds: [embed], components: [] });
        });

        collector.on('end', async (_c, reason) => {
          if (reason === 'done') return;
          refund();
          await interaction.editReply({ embeds: [waitEmbed('✊ Batu Gunting Kertas', `⌛ Waktu habis.${bet ? ' Taruhanmu dikembalikan.' : ''}`)], components: [] }).catch(() => {});
        });
      } catch (err) {
        refund();
        throw err;
      }
    },
  },

  // ================= BLACKJACK =================
  {
    data: new SlashCommandBuilder()
      .setName('blackjack')
      .setDescription('Blackjack lawan dealer (menang x2, blackjack x2.5)')
      .setDMPermission(false)
      .addIntegerOption((o) => betOption(o)),
    async execute(interaction) {
      const gid = interaction.guildId;
      const uid = interaction.user.id;
      const key = `bj:${gid}:${uid}`;
      const bet = interaction.options.getInteger('taruhan', true);
      if (activeGames.has(key)) return fail(interaction, 'Kamu masih punya game blackjack yang berjalan.');
      if (!(await takeBet(interaction, bet))) return;
      activeGames.add(key);

      const deck = g.newDeck();
      const player = [deck.pop(), deck.pop()];
      const dealer = [deck.pop(), deck.pop()];
      let stake = bet;
      let finished = false;
      let outcome = '';
      let returned = 0;

      const render = (reveal) => {
        const dealerText = reveal
          ? `${g.showHand(dealer)}\nTotal: **${g.handValue(dealer)}**`
          : `${g.showHand([dealer[0]])} \`❓\`\nTotal: **?**`;
        const e = new EmbedBuilder()
          .setColor(config.colors.main)
          .setTitle('🃏 Blackjack')
          .addFields(
            { name: `Kartumu`, value: `${g.showHand(player)}\nTotal: **${g.handValue(player)}**`, inline: true },
            { name: 'Dealer', value: dealerText, inline: true },
          )
          .setFooter({ text: `Taruhan: ${eco.num(stake)} koin` });
        return e;
      };

      const finalEmbed = (balance) => {
        const net = returned - stake;
        const e = render(true);
        e.setColor(net > 0 ? config.colors.success : net === 0 ? config.colors.warn : config.colors.error);
        const verdict = net > 0 ? `✅ **Menang +${eco.coins(net)}**` : net === 0 ? '🤝 **Seri — taruhan kembali**' : `❌ **Kalah −${eco.coins(stake)}**`;
        e.setDescription(`${outcome}\n${verdict}`);
        e.setFooter({ text: `Taruhan: ${eco.num(stake)} • Saldo: ${eco.num(balance)} koin` });
        return e;
      };

      const buttons = () =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('bj:hit').setLabel('Hit').setEmoji('🃏').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('bj:stand').setLabel('Stand').setEmoji('✋').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('bj:double').setLabel('Double').setEmoji('💰').setStyle(ButtonStyle.Success).setDisabled(player.length > 2),
        );

      /** Selesaikan game: dealer bermain, hitung hasil, bayar. */
      const finish = () => {
        if (finished) return null;
        finished = true;
        activeGames.delete(key);
        const pv = g.handValue(player);
        if (pv > 21) {
          outcome = `💥 **Bust!** Totalmu ${pv}, melebihi 21.`;
          returned = 0;
        } else {
          g.dealerPlay(deck, dealer);
          const dv = g.handValue(dealer);
          if (dv > 21) { outcome = `🎉 Dealer **bust** (${dv})!`; returned = stake * 2; }
          else if (pv > dv) { outcome = `Kamu ${pv} vs dealer ${dv}.`; returned = stake * 2; }
          else if (pv === dv) { outcome = `Sama-sama ${pv}.`; returned = stake; }
          else { outcome = `Kamu ${pv} vs dealer ${dv}.`; returned = 0; }
        }
        return eco.settle(gid, uid, stake, returned);
      };

      try {
        // Blackjack alami
        const pBJ = g.isBlackjack(player);
        const dBJ = g.isBlackjack(dealer);
        if (pBJ || dBJ) {
          finished = true;
          activeGames.delete(key);
          if (pBJ && dBJ) { outcome = '🃏 Sama-sama **Blackjack**!'; returned = stake; }
          else if (pBJ) { outcome = '🃏 **BLACKJACK!** Bayaran x2.5'; returned = Math.floor(stake * 2.5); }
          else { outcome = '😬 Dealer punya **Blackjack**.'; returned = 0; }
          const balance = eco.settle(gid, uid, stake, returned);
          return respond(interaction, { embeds: [finalEmbed(balance)] });
        }

        await respond(interaction, { embeds: [render(false)], components: [buttons()] });
        const msg = await interaction.fetchReply();
        const collector = msg.createMessageComponentCollector({ idle: 60_000 });

        collector.on('collect', async (i) => {
          if (i.user.id !== uid) return i.reply({ content: 'Ini bukan gamemu 😅', flags: MessageFlags.Ephemeral });
          if (finished) return;
          try {
            const action = i.customId.split(':')[1];

            if (action === 'double') {
              if (player.length > 2) return i.deferUpdate();
              if (!eco.tryTake(gid, uid, bet)) {
                return i.reply({ content: 'Saldo tidak cukup untuk double down.', flags: MessageFlags.Ephemeral });
              }
              stake = bet * 2;
              player.push(deck.pop());
              const balance = finish();
              collector.stop('finished');
              return safeUpdate(i, interaction, { embeds: [finalEmbed(balance)], components: [] });
            }

            if (action === 'hit') {
              player.push(deck.pop());
              if (g.handValue(player) < 21) return safeUpdate(i, interaction, { embeds: [render(false)], components: [buttons()] });
            }

            // stand, atau hit sampai >= 21
            const balance = finish();
            collector.stop('finished');
            return safeUpdate(i, interaction, { embeds: [finalEmbed(balance)], components: [] });
          } catch (err) {
            console.error('[blackjack]', err);
            if (!finished) {
              finished = true;
              activeGames.delete(key);
              eco.settle(gid, uid, stake, stake); // kembalikan taruhan kalau error
              collector.stop('error');
            }
          }
        });

        collector.on('end', async (_c, reason) => {
          if (finished) return;
          // Tidak ada respon 60 detik: otomatis stand
          const balance = finish();
          await interaction.editReply({ embeds: [finalEmbed(balance).setTitle('🃏 Blackjack — ⌛ waktu habis (auto-stand)')], components: [] }).catch(() => {});
        });
      } catch (err) {
        if (!finished) {
          finished = true;
          activeGames.delete(key);
          eco.settle(gid, uid, stake, stake);
        }
        throw err;
      }
    },
  },
];
