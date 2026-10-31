'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const leveling = require('./leveling');
const economy = require('./economy');

/** Beri semua role reward yang sudah memenuhi syarat level. Return daftar role yang baru didapat. */
async function applyRoleRewards(guild, userId, level) {
  const rewards = leveling.getRoles(guild.id).filter((r) => r.level <= level);
  if (!rewards.length) return [];
  const member = guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  if (!member) return [];

  const gained = [];
  for (const r of rewards) {
    const role = guild.roles.cache.get(r.role_id);
    if (!role || member.roles.cache.has(role.id)) continue;
    try {
      await member.roles.add(role, `Reward level ${r.level}`);
      gained.push(role);
    } catch (e) {
      console.warn(`[level] gagal memberi role ${role.name}: ${e.message}`);
    }
  }
  return gained;
}

/**
 * Tangani naik level: bonus koin, role reward, dan pengumuman.
 * @param channel channel fallback jika server belum mengatur channel level (boleh null).
 */
async function handleLevelUp(client, guild, userId, result, channel = null) {
  const cfg = leveling.getConfig(guild.id);
  const bonus = result.newLevel * 50;
  economy.addCoins(guild.id, userId, bonus);
  const roles = await applyRoleRewards(guild, userId, result.newLevel);

  const target =
    (cfg.channel_id && (guild.channels.cache.get(cfg.channel_id) ?? (await guild.channels.fetch(cfg.channel_id).catch(() => null)))) ||
    channel;
  if (!target?.isTextBased?.()) return;

  const user = client.users.cache.get(userId) ?? (await client.users.fetch(userId).catch(() => null));
  const embed = new EmbedBuilder()
    .setColor(config.colors.success)
    .setTitle('🎉 Level Up!')
    .setDescription(`<@${userId}> naik ke **Level ${result.newLevel}**!`)
    .addFields({ name: '🎁 Bonus', value: economy.coins(bonus), inline: true })
    .setTimestamp();
  if (user) embed.setThumbnail(user.displayAvatarURL({ size: 128 }));
  if (roles.length) embed.addFields({ name: '🏅 Role baru', value: roles.map((r) => r.toString()).join(' '), inline: true });

  target.send({ embeds: [embed], allowedMentions: { users: [userId] } }).catch(() => {});
}

module.exports = { handleLevelUp, applyRoleRewards };
