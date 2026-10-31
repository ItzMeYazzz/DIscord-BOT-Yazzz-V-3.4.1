'use strict';

/**
 * Lobi multi-pemain generik (dipakai Ludo, Monopoly, dan game lain).
 * - Satu game per channel (claim/release)
 * - Taruhan opsional: koin dipotong saat join, dikembalikan kalau lobi batal
 * - Bot pengisi kursi (hanya kalau tanpa taruhan)
 */

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const config = require('../config');
const eco = require('./economy');

const channelGames = new Map(); // channelId -> nama game
const BOT_NAMES = ['Budi', 'Siti', 'Joko', 'Dewi', 'Agus', 'Rina', 'Bayu', 'Wulan'];

const claim = (channelId, name) => {
  if (channelGames.has(channelId)) return false;
  channelGames.set(channelId, name);
  return true;
};
const release = (channelId) => channelGames.delete(channelId);
const runningIn = (channelId) => channelGames.get(channelId) ?? null;

/** Antrean serial: aksi dijalankan satu per satu supaya tidak balapan. */
function makeQueue() {
  let p = Promise.resolve();
  return (fn) => {
    p = p.then(fn).catch((err) => console.error('[game-queue]', err));
    return p;
  };
}

/** Kembalikan taruhan semua pemain manusia. */
function refundAll(guildId, players, stake) {
  if (!stake) return;
  for (const p of players) if (!p.bot) eco.settle(guildId, p.id, stake, stake);
}

/** Bagikan pot ke pemenang (bukan bot), catat rugi untuk yang lain. */
function payout(guildId, players, stake, winnerId) {
  if (!stake) return 0;
  const humans = players.filter((p) => !p.bot);
  const pot = stake * humans.length;
  for (const p of humans) {
    if (p.id === winnerId) eco.settle(guildId, p.id, stake, pot);
    else eco.settle(guildId, p.id, stake, 0);
  }
  return pot;
}

/**
 * Jalankan lobi. Resolve dengan { players, message, stake } kalau dimulai, atau null kalau batal.
 * Pesan lobi yang sama dipakai game selanjutnya (message.edit).
 */
async function runLobby(interaction, opts) {
  const {
    title, emoji = '🎮', rules = '', min = 2, max = 4, stake = 0, allowBots = true, joinTimeout = 180_000,
  } = opts;
  const guildId = interaction.guildId;
  const host = { id: interaction.user.id, name: interaction.member?.displayName ?? interaction.user.username, bot: false };
  const players = [host];
  let botCount = 0;

  if (stake > 0 && !eco.tryTake(guildId, host.id, stake)) {
    const bal = eco.wallet(guildId, host.id).balance;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(config.colors.error).setDescription(`Saldo tidak cukup untuk taruhan **${eco.coins(stake)}**. Saldomu **${eco.coins(bal)}**.`)], flags: MessageFlags.Ephemeral });
    return null;
  }

  const canBots = allowBots && stake === 0;
  const render = (disabled = false, note = '') => {
    const list = players.map((p, i) => `${i + 1}. ${p.bot ? '🤖' : '👤'} **${p.name}**${i === 0 ? ' 👑' : ''}`).join('\n');
    const e = new EmbedBuilder()
      .setColor(config.colors.main)
      .setTitle(`${emoji} ${title} — Lobi`)
      .setDescription(
        [
          rules,
          '',
          `**Pemain (${players.length}/${max}):**`,
          list,
          stake > 0 ? `\n💰 Taruhan masuk: **${eco.coins(stake)}** • Pot sekarang: **${eco.coins(stake * players.filter((p) => !p.bot).length)}** (pemenang ambil semua)` : '',
          note ? `\n${note}` : '',
        ].filter((x) => x !== '').join('\n'),
      )
      .setFooter({ text: `Host: ${host.name} • lobi otomatis tutup dalam ${Math.round(joinTimeout / 60000)} menit` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('lobby:join').setLabel('Gabung').setEmoji('✋').setStyle(ButtonStyle.Primary).setDisabled(disabled || players.length >= max),
      new ButtonBuilder().setCustomId('lobby:leave').setLabel('Keluar').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
      ...(canBots ? [new ButtonBuilder().setCustomId('lobby:bot').setLabel('+ Bot').setEmoji('🤖').setStyle(ButtonStyle.Secondary).setDisabled(disabled || players.length >= max)] : []),
      new ButtonBuilder().setCustomId('lobby:start').setLabel('Mulai').setEmoji('▶️').setStyle(ButtonStyle.Success).setDisabled(disabled || players.length < min),
      new ButtonBuilder().setCustomId('lobby:cancel').setLabel('Batal').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    );
    return { content: '', embeds: [e], components: [row] };
  };

  await interaction.reply(render());
  const message = await interaction.fetchReply();

  return new Promise((resolve) => {
    let finished = false;
    const collector = message.createMessageComponentCollector({ time: joinTimeout, filter: (i) => i.customId.startsWith('lobby:') });

    const cancel = async (reason) => {
      if (finished) return;
      finished = true;
      collector.stop('closed');
      refundAll(guildId, players, stake);
      await message.edit({ ...render(true, `❌ ${reason}${stake ? ' Taruhan dikembalikan.' : ''}`) }).catch(() => {});
      resolve(null);
    };

    collector.on('collect', async (i) => {
      const isHost = i.user.id === host.id;
      const name = i.member?.displayName ?? i.user.username;
      const ephemeral = (text) => i.reply({ content: text, flags: MessageFlags.Ephemeral }).catch(() => {});

      switch (i.customId) {
        case 'lobby:join': {
          if (players.some((p) => p.id === i.user.id)) return ephemeral('Kamu sudah ada di lobi.');
          if (players.length >= max) return ephemeral('Lobi sudah penuh.');
          if (stake > 0 && !eco.tryTake(guildId, i.user.id, stake)) {
            return ephemeral(`Saldo tidak cukup untuk taruhan **${eco.coins(stake)}**.`);
          }
          players.push({ id: i.user.id, name, bot: false });
          return i.update(render()).catch(() => {});
        }
        case 'lobby:leave': {
          const idx = players.findIndex((p) => p.id === i.user.id);
          if (idx === -1) return ephemeral('Kamu tidak ada di lobi.');
          if (isHost) return ephemeral('Host tidak bisa keluar. Tekan **Batal** untuk membubarkan lobi.');
          players.splice(idx, 1);
          if (stake) eco.settle(guildId, i.user.id, stake, stake);
          return i.update(render()).catch(() => {});
        }
        case 'lobby:bot': {
          if (!isHost) return ephemeral('Hanya host yang bisa menambah bot.');
          if (players.length >= max) return ephemeral('Lobi sudah penuh.');
          players.push({ id: `bot:${botCount}`, name: `Bot ${BOT_NAMES[botCount % BOT_NAMES.length]}`, bot: true });
          botCount++;
          return i.update(render()).catch(() => {});
        }
        case 'lobby:start': {
          if (!isHost) return ephemeral('Hanya host yang bisa memulai.');
          if (players.length < min) return ephemeral(`Butuh minimal ${min} pemain.`);
          finished = true;
          collector.stop('started');
          await i.deferUpdate().catch(() => {});
          return resolve({ players, message, stake });
        }
        case 'lobby:cancel': {
          if (!isHost) return ephemeral('Hanya host yang bisa membatalkan.');
          await i.deferUpdate().catch(() => {});
          return cancel('Lobi dibatalkan host.');
        }
        default:
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') cancel('Waktu lobi habis.');
    });
  });
}

module.exports = { claim, release, runningIn, makeQueue, runLobby, refundAll, payout, BOT_NAMES };
