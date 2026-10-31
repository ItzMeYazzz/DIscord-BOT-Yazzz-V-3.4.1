'use strict';

const { Events, ActivityType, MessageFlags } = require('discord.js');
const config = require('../config');
const voiceManager = require('../utils/voiceManager');
const musicManager = require('../music/musicManager');
const { error } = require('../utils/helpers');

const BOOT_AT = Date.now();
const STALE_GRACE = 30_000; // toleransi selisih jam komputer vs Discord

/**
 * Ukur ke mana waktu terbuang: "sampai ke bot" (jaringan masuk) vs "proses bot" (kode kita) vs
 * balasan pertama terkirim. Hanya mencetak peringatan kalau total sampai balasan pertama > 2 detik.
 */
function trackLatency(interaction, label) {
  const receivedAt = Date.now();
  const inbound = receivedAt - interaction.createdTimestamp;
  let done = false;
  for (const name of ['reply', 'deferReply', 'showModal']) {
    const orig = interaction[name];
    if (typeof orig !== 'function') continue;
    interaction[name] = async function tracked(...args) {
      const sentAt = Date.now();
      const res = await orig.apply(interaction, args);
      if (!done) {
        done = true;
        const total = Date.now() - interaction.createdTimestamp;
        if (total > 2000) {
          console.warn(
            `[latency] /${label}: dibalas ${total} ms setelah dijalankan — sampai ke bot ${inbound} ms, ` +
              `proses bot ${sentAt - receivedAt} ms, kirim balasan ${Date.now() - sentAt} ms (batas Discord 3000 ms)`,
          );
        }
      }
      return res;
    };
  }
}

module.exports = [
  {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
      console.log(`[bot] Online sebagai ${client.user.tag} di ${client.guilds.cache.size} server`);
      client.user.setPresence({
        status: 'online',
        activities: [{ name: config.statusText, type: ActivityType.Playing }],
      });
      await voiceManager.restoreAll(client);
      voiceManager.startHealthCheck(client);
    },
  },

  {
    name: Events.InteractionCreate,
    async execute(client, interaction) {
      // Semua game memakai collector di memori. Tombol di pesan yang dibuat SEBELUM bot menyala
      // tidak punya pengelola lagi -> tanpa ini Discord menampilkan "This interaction failed".
      if (interaction.isMessageComponent()) {
        const born = interaction.message?.createdTimestamp;
        if (born && born < BOOT_AT - STALE_GRACE) {
          return interaction
            .reply({ content: '⌛ Tombol ini sudah tidak aktif (bot sempat restart / game sudah berakhir). Mulai lagi dengan commandnya.', flags: MessageFlags.Ephemeral })
            .catch(() => {});
        }
        return;
      }
      if (!interaction.isChatInputCommand()) return;
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      if (command.ownerOnly && !config.ownerIds.includes(interaction.user.id)) {
        return interaction.reply({ embeds: [error('Command ini khusus owner bot.')], flags: MessageFlags.Ephemeral });
      }

      trackLatency(interaction, interaction.commandName);
      try {
        await command.execute(interaction, client);
      } catch (err) {
        if (err?.code === 10062) {
          // Interaksi kedaluwarsa: bot membalas >3 detik (biasanya koneksi lambat). Tidak ada yang bisa dibalas lagi.
          return console.warn(`[cmd:${interaction.commandName}] interaksi kedaluwarsa (10062). Cek koneksi internet / DNS.`);
        }
        console.error(`[cmd:${interaction.commandName}]`, err);
        const payload = { embeds: [error('Terjadi error saat menjalankan command. Cek izin bot lalu coba lagi.')], flags: MessageFlags.Ephemeral };
        if (interaction.deferred && !interaction.replied) await interaction.editReply({ embeds: payload.embeds }).catch(() => {});
        else if (interaction.replied) await interaction.followUp(payload).catch(() => {});
        else await interaction.reply(payload).catch(() => {});
      }
    },
  },

  {
    // Kalau bot dikeluarkan/dipindah dari voice channel 24/7, kembalikan.
    name: Events.VoiceStateUpdate,
    execute(client, oldState, newState) {
      musicManager.handleVoiceUpdate(client, oldState, newState);
      if (newState.id !== client.user.id) return;
      const target = voiceManager.targetChannel(newState.guild.id);
      if (!target) return;
      if (newState.channelId !== target) {
        voiceManager.scheduleRejoin(client, newState.guild.id, 3_000, true);
      }
    },
  },

  {
    // Bot dikeluarkan dari server: bersihkan pengaturan 24/7.
    name: Events.GuildDelete,
    execute(client, guild) {
      voiceManager.leave(guild.id);
    },
  },
];
