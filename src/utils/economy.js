'use strict';

const { db } = require('../database');

const START_BALANCE = 50000;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;
const STREAK_WINDOW = 48 * 60 * 60 * 1000;
const WORK_COOLDOWN = 60 * 60 * 1000;

const q = {
  ensure: db.prepare('INSERT INTO economy (guild_id, user_id, balance) VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO NOTHING'),
  get: db.prepare('SELECT * FROM economy WHERE guild_id = ? AND user_id = ?'),
  add: db.prepare('UPDATE economy SET balance = balance + ? WHERE guild_id = ? AND user_id = ?'),
  take: db.prepare('UPDATE economy SET balance = balance - ? WHERE guild_id = ? AND user_id = ? AND balance >= ?'),
  daily: db.prepare('UPDATE economy SET balance = balance + ?, last_daily = ?, daily_streak = ? WHERE guild_id = ? AND user_id = ?'),
  work: db.prepare('UPDATE economy SET balance = balance + ?, last_work = ? WHERE guild_id = ? AND user_id = ?'),
  won: db.prepare('UPDATE economy SET total_won = total_won + ? WHERE guild_id = ? AND user_id = ?'),
  lost: db.prepare('UPDATE economy SET total_lost = total_lost + ? WHERE guild_id = ? AND user_id = ?'),
  top: db.prepare('SELECT * FROM economy WHERE guild_id = ? ORDER BY balance DESC, user_id ASC LIMIT ? OFFSET ?'),
  count: db.prepare('SELECT COUNT(*) AS n FROM economy WHERE guild_id = ?'),
  rank: db.prepare('SELECT COUNT(*) + 1 AS rank FROM economy WHERE guild_id = ? AND balance > ?'),
};

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Ambil dompet user (dibuat otomatis dengan saldo awal). */
function wallet(guildId, userId) {
  q.ensure.run(guildId, userId, START_BALANCE);
  return q.get.get(guildId, userId);
}

function addCoins(guildId, userId, amount) {
  if (amount <= 0) return;
  wallet(guildId, userId);
  q.add.run(amount, guildId, userId);
}

/** Kurangi saldo secara atomik. Return false kalau saldo tidak cukup. */
function tryTake(guildId, userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) return false;
  wallet(guildId, userId);
  return q.take.run(amount, guildId, userId, amount).changes > 0;
}

/**
 * Selesaikan taruhan: `returned` = jumlah koin yang dikembalikan ke pemain
 * (0 = kalah, bet = seri, bet*2 = menang 2x, dst). Taruhan harus sudah dipotong lebih dulu lewat tryTake.
 */
function settle(guildId, userId, bet, returned) {
  if (returned > 0) addCoins(guildId, userId, returned);
  if (returned > bet) q.won.run(returned - bet, guildId, userId);
  else if (returned < bet) q.lost.run(bet - returned, guildId, userId);
  return wallet(guildId, userId).balance;
}

function claimDaily(guildId, userId) {
  const w = wallet(guildId, userId);
  const now = Date.now();
  const remaining = w.last_daily + DAILY_COOLDOWN - now;
  if (remaining > 0) return { ok: false, remaining };

  const streak = w.last_daily && now - w.last_daily <= STREAK_WINDOW ? w.daily_streak + 1 : 1;
  const reward = 10000 + Math.min(streak - 1, 19) * 2000; // 500 -> 1100
  q.daily.run(reward, now, streak, guildId, userId);
  return { ok: true, reward, streak, balance: w.balance + reward };
}

function claimWork(guildId, userId) {
  const w = wallet(guildId, userId);
  const now = Date.now();
  const remaining = w.last_work + WORK_COOLDOWN - now;
  if (remaining > 0) return { ok: false, remaining };

  const reward = rand(1000, 30000);
  q.work.run(reward, now, guildId, userId);
  return { ok: true, reward, balance: w.balance + reward };
}

function transfer(guildId, fromId, toId, amount) {
  if (!tryTake(guildId, fromId, amount)) return false;
  addCoins(guildId, toId, amount);
  return true;
}

/** Format angka gaya Indonesia: 1.234.567 */
const num = (n) => Number(n).toLocaleString('id-ID');
const coins = (n) => `${num(n)} 🪙`;

module.exports = {
  START_BALANCE,
  rand,
  wallet,
  addCoins,
  tryTake,
  settle,
  claimDaily,
  claimWork,
  transfer,
  top: (guildId, limit, offset = 0) => q.top.all(guildId, limit, offset),
  count: (guildId) => q.count.get(guildId).n,
  rankOf: (guildId, balance) => q.rank.get(guildId, balance).rank,
  num,
  coins,
};
