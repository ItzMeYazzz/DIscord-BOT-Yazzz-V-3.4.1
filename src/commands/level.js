'use strict';

const {
  SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, AttachmentBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const config = require('../config');
const leveling = require('../utils/leveling');
const economy = require('../utils/economy');
const { renderRankCard } = require('../utils/rankCard');
const { applyRoleRewards, handleLevelUp } = require('../utils/levelUp');
const { success, info, fail, respond } = require('../utils/helpers');

const PER_PAGE = 10;
const MEDALS = ['🥇', '🥈', '🥉'];

/** Update pesan dari klik tombol; kalau interaksi kedaluwarsa, edit pesan aslinya. */
async function safeUpdate(i, root, payload) {
  try {
    await i.update(payload);
  } catch {
    await root.editReply(payload).catch(() => {});
  }
}

const hex = (n) => `#${(n || 0x5865f2).toString(16).padStart(6, '0')}`;

function progressBar(percent, size = 14) {
  const filled = Math.round(percent * size);
  return '▰'.repeat(filled) + '▱'.repeat(size - filled);
}

module.exports = [
  // ================= /rank =================
  {
    data: new SlashCommandBuilder()
      .setName('rank')
      .setDescription('Lihat kartu level & XP kamu (atau user lain)')
      .setDMPermission(false)
      .addUserOption((o) => o.setName('user').setDescription('User (bawaan: kamu)')),
    async execute(interaction) {
      await interaction.deferReply();
      const user = interaction.options.getUser('user') ?? interaction.user;
      if (user.bot) return fail(interaction, 'Bot tidak punya level.');

      const gid = interaction.guildId;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const row = leveling.get(gid, user.id);
      const p = leveling.progress(row.xp);
      const rank = leveling.rankOf(gid, row.xp);
      const color = hex(member?.displayColor);

      const buffer = await renderRankCard({
        username: member?.displayName ?? user.displayName,
        avatarUrl: (member ?? user).displayAvatarURL({ extension: 'png', size: 256 }),
        level: p.level, rank, current: p.current, needed: p.needed, percent: p.percent,
        totalXp: row.xp, messages: row.messages, voiceMinutes: row.voice_minutes, color,
      });
      if (buffer) return respond(interaction, { files: [new AttachmentBuilder(buffer, { name: 'rank.png' })] });

      // Fallback embed kalau @napi-rs/canvas tidak terpasang
      const embed = new EmbedBuilder()
        .setColor(member?.displayColor || config.colors.main)
        .setAuthor({ name: member?.displayName ?? user.displayName, iconURL: user.displayAvatarURL() })
        .setTitle(`Level ${p.level}  •  Rank #${rank}`)
        .setDescription(`${progressBar(p.percent)} **${Math.floor(p.percent * 100)}%**\n\`${economy.num(p.current)} / ${economy.num(p.needed)} XP\``)
        .addFields(
          { name: 'Total XP', value: economy.num(row.xp), inline: true },
          { name: 'Pesan', value: economy.num(row.messages), inline: true },
          { name: 'Voice', value: `${economy.num(row.voice_minutes)} menit`, inline: true },
        );
      return respond(interaction, { embeds: [embed] });
    },
  },

  // ================= /leaderboard =================
  {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Papan peringkat server')
      .setDMPermission(false)
      .addStringOption((o) =>
        o.setName('tipe').setDescription('Peringkat apa (bawaan: level)').addChoices(
          { name: 'Level / XP', value: 'level' },
          { name: 'Koin terkaya', value: 'koin' },
        ),
      ),
    async execute(interaction) {
      await interaction.deferReply();
      const type = interaction.options.getString('tipe') ?? 'level';
      const gid = interaction.guildId;
      const isLevel = type === 'level';

      const total = isLevel ? leveling.count(gid) : economy.count(gid);
      const pages = Math.max(1, Math.ceil(total / PER_PAGE));
      let page = 0;

      const build = (disabled = false) => {
        const offset = page * PER_PAGE;
        const rows = isLevel ? leveling.top(gid, PER_PAGE, offset) : economy.top(gid, PER_PAGE, offset);
        const lines = rows.map((r, i) => {
          const pos = offset + i;
          const badge = MEDALS[pos] ?? `**${pos + 1}.**`;
          return isLevel
            ? `${badge} <@${r.user_id}> — Level **${leveling.levelFromXp(r.xp)}** • ${economy.num(r.xp)} XP`
            : `${badge} <@${r.user_id}> — ${economy.coins(r.balance)}`;
        });

        const mine = isLevel ? leveling.get(gid, interaction.user.id).xp : economy.wallet(gid, interaction.user.id).balance;
        const myRank = isLevel ? leveling.rankOf(gid, mine) : economy.rankOf(gid, mine);

        const embed = new EmbedBuilder()
          .setColor(isLevel ? config.colors.main : config.colors.warn)
          .setTitle(isLevel ? `🏆 Leaderboard Level — ${interaction.guild.name}` : `💰 Orang Terkaya — ${interaction.guild.name}`)
          .setDescription(lines.join('\n') || 'Belum ada data. Mulai ngobrol atau main game dulu!')
          .setFooter({ text: `Halaman ${page + 1}/${pages} • Peringkatmu: #${myRank}` });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('lb_prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page === 0),
          new ButtonBuilder().setCustomId('lb_page').setLabel(`${page + 1} / ${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('lb_next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= pages - 1),
        );
        return { embeds: [embed], components: pages > 1 ? [row] : [] };
      };

      const msg = await interaction.editReply(build());
      if (pages <= 1) return;

      const collector = msg.createMessageComponentCollector({ time: 120_000 });
      collector.on('collect', async (i) => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: 'Hanya yang menjalankan command ini yang bisa ganti halaman.', flags: MessageFlags.Ephemeral });
        }
        if (i.customId === 'lb_prev') page = Math.max(0, page - 1);
        if (i.customId === 'lb_next') page = Math.min(pages - 1, page + 1);
        await safeUpdate(i, interaction, build());
      });
      collector.on('end', () => interaction.editReply(build(true)).catch(() => {}));
    },
  },

  // ================= /levelsetup =================
  {
    data: new SlashCommandBuilder()
      .setName('levelsetup')
      .setDescription('Atur sistem level server')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .setDMPermission(false)
      .addSubcommand((s) => s.setName('status').setDescription('Lihat pengaturan level saat ini'))
      .addSubcommand((s) =>
        s.setName('toggle').setDescription('Nyalakan / matikan sistem level')
          .addBooleanOption((o) => o.setName('aktif').setDescription('true = nyala').setRequired(true)),
      )
      .addSubcommand((s) =>
        s.setName('channel').setDescription('Channel pengumuman level up (kosongkan = di channel tempat user chat)')
          .addChannelOption((o) => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),
      )
      .addSubcommand((s) =>
        s.setName('multiplier').setDescription('Pengali XP (event double XP, dll)')
          .addNumberOption((o) => o.setName('nilai').setDescription('0.5 - 5').setMinValue(0.5).setMaxValue(5).setRequired(true)),
      )
      .addSubcommand((s) =>
        s.setName('reward-add').setDescription('Beri role otomatis saat mencapai level tertentu')
          .addIntegerOption((o) => o.setName('level').setDescription('Level').setMinValue(1).setMaxValue(500).setRequired(true))
          .addRoleOption((o) => o.setName('role').setDescription('Role hadiah').setRequired(true)),
      )
      .addSubcommand((s) =>
        s.setName('reward-remove').setDescription('Hapus role reward')
          .addIntegerOption((o) => o.setName('level').setDescription('Level').setMinValue(1).setMaxValue(500).setRequired(true)),
      )
      .addSubcommand((s) => s.setName('reward-list').setDescription('Daftar role reward'))
      .addSubcommand((s) =>
        s.setName('givexp').setDescription('Tambah XP ke user')
          .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
          .addIntegerOption((o) => o.setName('jumlah').setDescription('Jumlah XP').setMinValue(1).setMaxValue(1_000_000).setRequired(true)),
      )
      .addSubcommand((s) =>
        s.setName('setlevel').setDescription('Set level user langsung')
          .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
          .addIntegerOption((o) => o.setName('level').setDescription('Level').setMinValue(0).setMaxValue(500).setRequired(true)),
      )
      .addSubcommand((s) =>
        s.setName('reset').setDescription('Reset XP satu user')
          .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
      )
      .addSubcommand((s) =>
        s.setName('reset-all').setDescription('Reset XP SEMUA user di server (tidak bisa dibatalkan)')
          .addStringOption((o) => o.setName('konfirmasi').setDescription('Ketik RESET untuk konfirmasi').setRequired(true)),
      ),

    async execute(interaction, client) {
      const sub = interaction.options.getSubcommand();
      const gid = interaction.guildId;
      const guild = interaction.guild;

      if (sub === 'status') {
        const cfg = leveling.getConfig(gid);
        const rewards = leveling.getRoles(gid);
        const embed = new EmbedBuilder()
          .setColor(config.colors.main)
          .setTitle('⚙️ Pengaturan Level')
          .addFields(
            { name: 'Status', value: cfg.enabled ? '✅ Aktif' : '❌ Nonaktif', inline: true },
            { name: 'Multiplier', value: `x${cfg.multiplier}`, inline: true },
            { name: 'Channel pengumuman', value: cfg.channel_id ? `<#${cfg.channel_id}>` : 'Channel tempat user chat', inline: true },
            { name: 'Role reward', value: `${rewards.length} role` , inline: true },
            { name: 'Cara dapat XP', value: '💬 Chat: 15–25 XP (cooldown 1 menit)\n🎙️ Voice: 10 XP/menit (min. 2 orang, tidak deafen)' },
          );
        return respond(interaction, { embeds: [embed] });
      }

      if (sub === 'toggle') {
        const on = interaction.options.getBoolean('aktif', true);
        leveling.setConfig(gid, 'enabled', on ? 1 : 0);
        return respond(interaction, { embeds: [success(`Sistem level sekarang **${on ? 'aktif' : 'nonaktif'}**.`)] });
      }

      if (sub === 'channel') {
        const ch = interaction.options.getChannel('channel');
        leveling.setConfig(gid, 'channel_id', ch?.id ?? null);
        return respond(interaction, { embeds: [success(ch ? `Pengumuman level up dikirim ke ${ch}.` : 'Pengumuman level up dikirim di channel tempat user chat.')] });
      }

      if (sub === 'multiplier') {
        const v = interaction.options.getNumber('nilai', true);
        leveling.setConfig(gid, 'multiplier', v);
        return respond(interaction, { embeds: [success(`Multiplier XP diatur ke **x${v}**.`)] });
      }

      if (sub === 'reward-add') {
        const level = interaction.options.getInteger('level', true);
        const role = interaction.options.getRole('role', true);
        if (role.managed || role.id === guild.id) return fail(interaction, 'Role itu tidak bisa dipakai sebagai reward (role bot/integrasi atau @everyone).');
        if (guild.members.me.roles.highest.position <= role.position) {
          return fail(interaction, 'Role itu lebih tinggi atau sama dengan role bot. Naikkan role bot di pengaturan server dulu.');
        }
        leveling.setRole(gid, level, role.id);
        return respond(interaction, { embeds: [success(`Member yang mencapai **Level ${level}** akan mendapat ${role}.`)] });
      }

      if (sub === 'reward-remove') {
        const level = interaction.options.getInteger('level', true);
        const n = leveling.removeRole(gid, level);
        return respond(interaction, { embeds: [n ? success(`Reward Level ${level} dihapus.`) : info(`Tidak ada reward di Level ${level}.`)] });
      }

      if (sub === 'reward-list') {
        const rewards = leveling.getRoles(gid);
        const text = rewards.length ? rewards.map((r) => `**Level ${r.level}** → <@&${r.role_id}>`).join('\n') : 'Belum ada role reward. Tambah dengan `/levelsetup reward-add`.';
        return respond(interaction, { embeds: [info(text, '🏅 Role Reward')] });
      }

      if (sub === 'givexp') {
        const user = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('jumlah', true);
        if (user.bot) return fail(interaction, 'Bot tidak punya level.');
        const res = leveling.addXp(gid, user.id, amount);
        if (res.leveledUp) await handleLevelUp(client, guild, user.id, res, interaction.channel);
        return respond(interaction, { embeds: [success(`+${economy.num(amount)} XP untuk ${user}. Sekarang **Level ${res.newLevel}**.`)] });
      }

      if (sub === 'setlevel') {
        const user = interaction.options.getUser('user', true);
        const level = interaction.options.getInteger('level', true);
        if (user.bot) return fail(interaction, 'Bot tidak punya level.');
        leveling.setXp(gid, user.id, leveling.totalXpForLevel(level));
        await applyRoleRewards(guild, user.id, level);
        return respond(interaction, { embeds: [success(`${user} diatur ke **Level ${level}**.`)] });
      }

      if (sub === 'reset') {
        const user = interaction.options.getUser('user', true);
        leveling.resetUser(gid, user.id);
        return respond(interaction, { embeds: [success(`XP ${user} direset.`)] });
      }

      if (sub === 'reset-all') {
        if (interaction.options.getString('konfirmasi', true) !== 'RESET') return fail(interaction, 'Konfirmasi salah. Ketik persis `RESET` (huruf besar).');
        const n = leveling.resetGuild(gid);
        return respond(interaction, { embeds: [success(`Data level ${n} user dihapus.`)] });
      }
    },
  },
];
