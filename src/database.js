'use strict';

const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'database');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'pro.db');

/**
 * Pakai better-sqlite3 kalau bisa dimuat. Kalau gagal (mis. script install diblokir npm
 * atau belum ada build tools di Windows), otomatis pakai node:sqlite bawaan Node 22.5+.
 */
let db;
try {
  const Database = require('better-sqlite3');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
} catch (err) {
  console.warn(`[db] better-sqlite3 tidak bisa dimuat (${err.message.split('\n')[0]}). Memakai node:sqlite bawaan Node.`);
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
}

db.exec(`
  CREATE TABLE IF NOT EXISTS voice247 (
    guild_id   TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS warnings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason       TEXT NOT NULL,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_warnings_user ON warnings (guild_id, user_id);
  CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id        TEXT PRIMARY KEY,
    welcome_channel TEXT,
    welcome_message TEXT,
    autorole        TEXT,
    log_channel     TEXT
  );
`);

// ---------- fitur v3.1: AFK, level, ekonomi ----------
db.exec(`
  CREATE TABLE IF NOT EXISTS afk (
    guild_id TEXT NOT NULL,
    user_id  TEXT NOT NULL,
    reason   TEXT NOT NULL,
    since    INTEGER NOT NULL,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS levels (
    guild_id      TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    xp            INTEGER NOT NULL DEFAULT 0,
    messages      INTEGER NOT NULL DEFAULT 0,
    voice_minutes INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_levels_xp ON levels (guild_id, xp DESC);
  CREATE TABLE IF NOT EXISTS level_config (
    guild_id   TEXT PRIMARY KEY,
    enabled    INTEGER NOT NULL DEFAULT 1,
    channel_id TEXT,
    multiplier REAL NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS level_roles (
    guild_id TEXT NOT NULL,
    level    INTEGER NOT NULL,
    role_id  TEXT NOT NULL,
    PRIMARY KEY (guild_id, level)
  );
  CREATE TABLE IF NOT EXISTS economy (
    guild_id     TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    balance      INTEGER NOT NULL DEFAULT 1000,
    last_daily   INTEGER NOT NULL DEFAULT 0,
    daily_streak INTEGER NOT NULL DEFAULT 0,
    last_work    INTEGER NOT NULL DEFAULT 0,
    total_won    INTEGER NOT NULL DEFAULT 0,
    total_lost   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_economy_balance ON economy (guild_id, balance DESC);
`);

// ---------- voice 24/7 ----------
const q = {
  get247: db.prepare('SELECT * FROM voice247 WHERE guild_id = ?'),
  all247: db.prepare('SELECT * FROM voice247'),
  set247: db.prepare(`
    INSERT INTO voice247 (guild_id, channel_id, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, updated_at = excluded.updated_at
  `),
  del247: db.prepare('DELETE FROM voice247 WHERE guild_id = ?'),
  addWarn: db.prepare('INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at) VALUES (?, ?, ?, ?, ?)'),
  getWarns: db.prepare('SELECT * FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id DESC'),
  countWarns: db.prepare('SELECT COUNT(*) AS n FROM warnings WHERE guild_id = ? AND user_id = ?'),
  clearWarns: db.prepare('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?'),
  getSettings: db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?'),
  ensureSettings: db.prepare('INSERT INTO guild_settings (guild_id) VALUES (?) ON CONFLICT(guild_id) DO NOTHING'),
};

const SETTING_KEYS = new Set(['welcome_channel', 'welcome_message', 'autorole', 'log_channel']);

module.exports = {
  db,
  get247: (guildId) => q.get247.get(guildId),
  all247: () => q.all247.all(),
  set247: (guildId, channelId) => q.set247.run(guildId, channelId, Date.now()),
  remove247: (guildId) => q.del247.run(guildId),

  addWarning(guildId, userId, moderatorId, reason) {
    q.addWarn.run(guildId, userId, moderatorId, reason, Date.now());
    return q.countWarns.get(guildId, userId).n;
  },
  getWarnings: (guildId, userId) => q.getWarns.all(guildId, userId),
  clearWarnings: (guildId, userId) => q.clearWarns.run(guildId, userId).changes,

  getSettings: (guildId) => q.getSettings.get(guildId) ?? {},
  setSetting(guildId, key, value) {
    if (!SETTING_KEYS.has(key)) throw new Error(`Setting tidak valid: ${key}`);
    q.ensureSettings.run(guildId);
    db.prepare(`UPDATE guild_settings SET ${key} = ? WHERE guild_id = ?`).run(value, guildId);
  },
};
