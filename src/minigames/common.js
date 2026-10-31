'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const config = require('../config');
const eco = require('../utils/economy');
const lobby = require('../utils/lobby');
const { fail, respond } = require('../utils/helpers');

const MIN_BET = 10;
const MAX_BET = 1_000_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userLocks = new Set();
const lockKey = (i) => `${i.guildId}:${i.user.id}`;

const embed = (title, desc, color = config.colors.main) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc);
const row = (...c) => new ActionRowBuilder().addComponents(c.flat());
const btn = (id, label, style = ButtonStyle.Secondary, emoji = null, disabled = false) => {
  const b = new ButtonBuilder().setCustomId(id).setStyle(style).setDisabled(disabled);
  if (label) b.setLabel(String(label));
  if (emoji) b.setEmoji(emoji);
  return b;
};
const ephemeral = (i, content) => i.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});

/** Kirim balasan pertama dan ambil Message-nya. Return null bila gagal. */
async function open(interaction, payload) {
  try {
    await respond(interaction, payload);
    return await interaction.fetchReply();
  } catch (err) {
    console.warn('[mini] balasan pertama gagal:', err.code ?? err.message);
    return null;
  }
}

/** Satu game aktif per user (cegah spam & paralel taruhan). Return fungsi unlock atau null. */
async function lockUser(interaction) {
  const k = lockKey(interaction);
  if (userLocks.has(k)) {
    await fail(interaction, 'Kamu masih punya mini game yang berjalan. Selesaikan dulu ya.');
    return null;
  }
  userLocks.add(k);
  return () => userLocks.delete(k);
}

/** Satu game grup per channel. Return fungsi unlock atau null. */
async function lockChannel(interaction, name) {
  const running = lobby.runningIn(interaction.channelId);
  if (running) {
    await fail(interaction, `Di channel ini sedang ada game **${running}**. Tunggu selesai atau pakai channel lain.`);
    return null;
  }
  lobby.claim(interaction.channelId, name);
  return () => lobby.release(interaction.channelId);
}

/** Potong taruhan; kirim error kalau saldo kurang. */
async function takeBet(interaction, bet) {
  if (eco.tryTake(interaction.guildId, interaction.user.id, bet)) return true;
  const bal = eco.wallet(interaction.guildId, interaction.user.id).balance;
  await fail(interaction, `Saldo tidak cukup. Saldomu **${eco.coins(bal)}** — coba /daily atau /work dulu.`);
  return false;
}

const reward = (guildId, userId, amount) => {
  if (amount > 0) eco.addCoins(guildId, userId, Math.floor(amount));
};

/** Tampilkan modal 1-3 kolom dan tunggu jawabannya. */
async function askModal(i, { id, title, fields, time = 90_000 }) {
  const modal = new ModalBuilder().setCustomId(id).setTitle(title).addComponents(
    fields.map((f) => row(
      new TextInputBuilder().setCustomId(f.id).setLabel(f.label).setStyle(TextInputStyle.Short).setRequired(true)
        .setMaxLength(f.max ?? 30).setPlaceholder(f.placeholder ?? ''),
    )),
  );
  try {
    await i.showModal(modal);
    return await i.awaitModalSubmit({ time, filter: (m) => m.customId === id && m.user.id === i.user.id });
  } catch {
    return null;
  }
}

const medal = (n) => ['🥇', '🥈', '🥉'][n] ?? `${n + 1}.`;

module.exports = {
  MIN_BET, MAX_BET, sleep, embed, row, btn, ephemeral, open, lockUser, lockChannel, takeBet, reward, askModal, medal,
  ButtonStyle, MessageFlags, config, eco,
};
