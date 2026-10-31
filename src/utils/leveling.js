'use strict';

const { db } = require('../database');

const q = {
  get: db.prepare('SELECT * FROM levels WHERE guild_id = ? AND user_id = ?'),
  add: db.prepare(`
    INSERT INTO levels (guild_id, user_id, xp, messages, voice_minutes) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET
      xp = xp + excluded.xp,
      messages = messages + excluded.messages,
      voice_minutes = voice_minutes + excluded.voice_minutes
  `),
  setXp: db.prepare(`
    INSERT INTO levels (guild_id, user_id, xp) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, user_id) DO UPDATE SET xp = excluded.xp
  `),
  rank: db.prepare('SELECT COUNT(*) + 1 AS rank FROM levels WHERE guild_id = ? AND xp > ?'),
  top: db.prepare('SELECT * FROM levels WHERE guild_id = ? ORDER BY xp DESC, user_id ASC LIMIT ? OFFSET ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM levels WHERE guild_id = ?'),
  resetUser: db.prepare('DELETE FROM levels WHERE guild_id = ? AND user_id = ?'),
  resetGuild: db.prepare('DELETE FROM levels WHERE guild_id = ?'),

  getCfg: db.prepare('SELECT * FROM level_config WHERE guild_id = ?'),
  ensureCfg: db.prepare('INSERT INTO level_config (guild_id) VALUES (?) ON CONFLICT(guild_id) DO NOTHING'),

  roles: db.prepare('SELECT * FROM level_roles WHERE guild_id = ? ORDER BY level ASC'),
  setRole: db.prepare(`
    INSERT INTO level_roles (guild_id, level, role_id) VALUES (?, ?, ?)
    ON CONFLICT(guild_id, level) DO UPDATE SET role_id = excluded.role_id
  `),
  delRole: db.prepare('DELETE FROM level_roles WHERE guild_id = ? AND level = ?'),
};

const CFG_KEYS = new Set(['enabled', 'channel_id', 'multiplier']);

// ---------- rumus level (gaya MEE6) ----------
/** XP yang dibutuhkan untuk naik dari `level` ke `level + 1`. */
const xpToNext = (level) => 5 * level * level + 50 * level + 100;

/** Total XP kumulatif yang dibutuhkan untuk mencapai `level`. */
function totalXpForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpToNext(i);
  return total;
}

function levelFromXp(xp) {
  let level = 0;
  let left = Math.max(0, xp);
  while (left >= xpToNext(level)) {
    left -= xpToNext(level);
    level++;
  }
  return level;
}

/** Info progres menuju level berikutnya. */
function progress(xp) {
  const level = levelFromXp(xp);
  const current = xp - totalXpForLevel(level);
  const needed = xpToNext(level);
  return { level, current, needed, percent: Math.min(1, current / needed) };
}

module.exports = {
  xpToNext,
  totalXpForLevel,
  levelFromXp,
  progress,

  get(guildId, userId) {
    return q.get.get(guildId, userId) ?? { guild_id: guildId, user_id: userId, xp: 0, messages: 0, voice_minutes: 0 };
  },

  /** Tambah XP. Mengembalikan info apakah user naik level. */
  addXp(guildId, userId, amount, { message = false, voiceMinute = false } = {}) {
    const before = q.get.get(guildId, userId)?.xp ?? 0;
    q.add.run(guildId, userId, amount, message ? 1 : 0, voiceMinute ? 1 : 0);
    const after = before + amount;
    const oldLevel = levelFromXp(before);
    const newLevel = levelFromXp(after);
    return { before, after, oldLevel, newLevel, leveledUp: newLevel > oldLevel };
  },

  setXp: (guildId, userId, xp) => q.setXp.run(guildId, userId, Math.max(0, Math.floor(xp))),
  rankOf: (guildId, xp) => q.rank.get(guildId, xp).rank,
  top: (guildId, limit, offset = 0) => q.top.all(guildId, limit, offset),
  count: (guildId) => q.count.get(guildId).n,
  resetUser: (guildId, userId) => q.resetUser.run(guildId, userId).changes,
  resetGuild: (guildId) => q.resetGuild.run(guildId).changes,

  // ---------- konfigurasi per server ----------
  getConfig(guildId) {
    return q.getCfg.get(guildId) ?? { guild_id: guildId, enabled: 1, channel_id: null, multiplier: 1 };
  },
  setConfig(guildId, key, value) {
    if (!CFG_KEYS.has(key)) throw new Error(`Config level tidak valid: ${key}`);
    q.ensureCfg.run(guildId);
    db.prepare(`UPDATE level_config SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
  },

  // ---------- role reward ----------
  getRoles: (guildId) => q.roles.all(guildId),
  setRole: (guildId, level, roleId) => q.setRole.run(guildId, level, roleId),
  removeRole: (guildId, level) => q.delRole.run(guildId, level).changes,
};
