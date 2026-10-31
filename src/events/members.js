'use strict';

const { Events, EmbedBuilder } = require('discord.js');
const config = require('../config');
const db = require('../database');
const { sendLog, formatTemplate } = require('../utils/helpers');

module.exports = [
  {
    name: Events.GuildMemberAdd,
    async execute(client, member) {
      const s = db.getSettings(member.guild.id);

      if (s.autorole) {
        const role = member.guild.roles.cache.get(s.autorole);
        if (role) await member.roles.add(role, 'Autorole').catch((e) => console.warn('[autorole]', e.message));
      }

      if (s.welcome_channel) {
        const ch = member.guild.channels.cache.get(s.welcome_channel);
        if (ch?.isTextBased()) {
          const text = formatTemplate(s.welcome_message ?? 'Selamat datang {user}!', member);
          ch.send({ content: text, allowedMentions: { users: [member.id] } }).catch(() => {});
        }
      }

      sendLog(
        member.guild,
        new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle('📥 Member bergabung')
          .setDescription(`${member.user.tag} (${member.id})`)
          .addFields({ name: 'Akun dibuat', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` })
          .setTimestamp(),
      );
    },
  },

  {
    name: Events.GuildMemberRemove,
    execute(client, member) {
      sendLog(
        member.guild,
        new EmbedBuilder()
          .setColor(config.colors.error)
          .setTitle('📤 Member keluar')
          .setDescription(`${member.user.tag} (${member.id})`)
          .setTimestamp(),
      );
    },
  },
];
