'use strict';

const { db } = require('../database');

const q = {
  get: db.prepare('SELECT * FROM afk WHERE guild_id = ? AND user_id = ?'),
  set: db.prepare(`
    INSERT INTO afk (guild_id, user_id, reason, since) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET reason = excluded.reason, since = excluded.since
  `),
  del: db.prepare('DELETE FROM afk WHERE guild_id = ? AND user_id = ?'),
  list: db.prepare('SELECT * FROM afk WHERE guild_id = ? ORDER BY since ASC'),
};

const NICK_PREFIX = '[AFK] ';

module.exports = {
  NICK_PREFIX,
  get: (guildId, userId) => q.get.get(guildId, userId),
  set: (guildId, userId, reason) => q.set.run(guildId, userId, reason, Date.now()),
  remove: (guildId, userId) => q.del.run(guildId, userId).changes > 0,
  list: (guildId) => q.list.all(guildId),

  /** Tambah prefix [AFK] di nickname (best effort, abaikan kalau bot tidak punya izin). */
  async markNick(member) {
    try {
      if (!member?.manageable) return;
      const current = member.nickname ?? member.user.displayName;
      if (current.startsWith(NICK_PREFIX)) return;
      await member.setNickname((NICK_PREFIX + current).slice(0, 32), 'AFK');
    } catch {
      /* tidak ada izin Manage Nicknames: tidak masalah */
    }
  },

  /** Hapus prefix [AFK] dari nickname. */
  async unmarkNick(member) {
    try {
      if (!member?.manageable || !member.nickname?.startsWith(NICK_PREFIX)) return;
      const base = member.nickname.slice(NICK_PREFIX.length).trim();
      const isDefault = !base || base === member.user.displayName || base === member.user.username;
      await member.setNickname(isDefault ? null : base, 'Kembali dari AFK');
    } catch {
      /* abaikan */
    }
  },
};
