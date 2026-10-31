'use strict';

/**
 * Mesin Monopoly (murni, tanpa Discord).
 *
 * Fitur: 5 peta (lihat monopolyMaps.js), 40 petak, sewa (set penuh = 2×, rumah/hotel, stasiun, utilitas), kartu Kesempatan & Dana Umum,
 * penjara (bayar / kartu / dadu ganda), lelang, bangun rumah (aturan merata + stok bank), gadai,
 * utang → jual aset / bangkrut, dagang antar pemain, batas ronde (pemenang = kekayaan bersih tertinggi).
 */

const { getMap, isOwnable, DEFAULT_MAP } = require('./monopolyMaps');

const START_CASH = 1500;
const GO_SALARY = 200;
const JAIL_FINE = 50;
const JAIL_POS = 10;
const MAX_HOUSES = 32;
const MAX_HOTELS = 12;

const fmt = (n) => `$${Number(n).toLocaleString('id-ID')}`;
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------------------------------------------------------- state
function createGame(players, { rounds = 40, map = DEFAULT_MAP } = {}) {
  const m = typeof map === 'string' ? getMap(map) : map;
  return {
    map: m,
    pot: 0, // kas Parkir (hanya peta dengan Jackpot Parkir)
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      bot: !!p.bot,
      token: m.tokens[i % m.tokens.length],
      cash: m.startCash,
      pos: 0,
      inJail: false,
      jailTurns: 0,
      jailCards: [], // 'chance' | 'chest'
      bankrupt: false,
    })),
    owner: Array(40).fill(null),
    mortgaged: Array(40).fill(false),
    houses: Array(40).fill(0), // 0-4 rumah, 5 = hotel
    turn: 0,
    phase: 'roll', // roll | buy | auction | debt | after | over
    dice: [0, 0],
    doubles: 0,
    rolledDoubles: false,
    pending: null, // petak yang sedang ditawarkan
    debt: null, // { pi, amount, creditor, reason }
    auction: null,
    decks: {
      chance: { order: shuffle(m.chance) },
      chest: { order: shuffle(m.chest) },
    },
    lastCard: null,
    log: [],
    rounds: 0,
    maxRounds: rounds, // 0 = tanpa batas
    winner: null,
    ranking: [],
    turnCount: 0,
  };
}

const cur = (s) => s.players[s.turn];
const alive = (s) => s.players.filter((p) => !p.bankrupt);
const idxOf = (s, p) => s.players.indexOf(p);

function log(s, text) {
  s.log.push(text);
  if (s.log.length > 8) s.log.shift();
}

// ---------------------------------------------------------------- query helper
const ownedBy = (s, pi) => s.map.board.filter((sq) => s.owner[sq.index] === pi).map((sq) => sq.index);
const countOwned = (s, pi, list) => list.filter((i) => s.owner[i] === pi).length;
const hasSet = (s, pi, group) => s.map.groupMembers[group].every((i) => s.owner[i] === pi);
const housesInUse = (s) => s.houses.reduce((a, h) => a + (h > 0 && h < 5 ? h : 0), 0);
const hotelsInUse = (s) => s.houses.filter((h) => h === 5).length;
const buildingUnits = (s, pi) => ownedBy(s, pi).reduce((a, i) => a + s.houses[i], 0);
const mortgageValue = (sq) => Math.floor(sq.price / 2);
const unmortgageCost = (sq) => Math.ceil(sq.price * 0.55);

function rentFor(s, pos, diceTotal, nearest = null) {
  const sq = s.map.board[pos];
  const o = s.owner[pos];
  if (o === null || s.mortgaged[pos]) return 0;
  const boost = (r) => Math.round(r * s.map.rentBoost);
  if (sq.type === 'property') {
    const h = s.houses[pos];
    let r = sq.rent[h];
    if (h === 0 && hasSet(s, o, sq.group)) r *= 2;
    return boost(r);
  }
  const unit = Math.max(1, Math.round(sq.price / (sq.type === 'rail' ? 200 : 150))); // skala harga peta
  if (sq.type === 'rail') {
    const n = countOwned(s, o, s.map.rails);
    const r = 25 * unit * 2 ** (n - 1);
    return boost(nearest === 'rail' ? r * 2 : r);
  }
  if (sq.type === 'util') {
    const n = countOwned(s, o, s.map.utils);
    const mult = nearest === 'util' ? 10 : n === 2 ? 10 : 4;
    return boost(mult * diceTotal * unit);
  }
  return 0;
}

function netWorth(s, pi) {
  const p = s.players[pi];
  let w = p.cash;
  for (const i of ownedBy(s, pi)) {
    const sq = s.map.board[i];
    w += s.mortgaged[i] ? mortgageValue(sq) : sq.price;
    if (sq.type === 'property') w += s.houses[i] * sq.house;
  }
  return w;
}

/** Uang tunai + hasil gadai semua properti + jual semua bangunan. */
function liquidation(s, pi) {
  const p = s.players[pi];
  let v = p.cash;
  for (const i of ownedBy(s, pi)) {
    const sq = s.map.board[i];
    if (!s.mortgaged[i]) v += mortgageValue(sq);
    if (sq.type === 'property') v += Math.floor((s.houses[i] * sq.house) / 2);
  }
  return v;
}

// ---------------------------------------------------------------- bangunan / gadai
function groupHouses(s, group) {
  return s.map.groupMembers[group].map((i) => s.houses[i]);
}

function canBuild(s, pi, pos) {
  const sq = s.map.board[pos];
  const p = s.players[pi];
  if (sq.type !== 'property' || s.owner[pos] !== pi || p.bankrupt) return { ok: false, why: 'Bukan propertimu.' };
  if (!hasSet(s, pi, sq.group)) return { ok: false, why: 'Kamu belum memiliki satu set warna penuh.' };
  if (s.map.groupMembers[sq.group].some((i) => s.mortgaged[i])) return { ok: false, why: 'Ada properti di set ini yang sedang digadai.' };
  const h = s.houses[pos];
  if (h >= 5) return { ok: false, why: 'Sudah hotel.' };
  if (h > Math.min(...groupHouses(s, sq.group))) return { ok: false, why: 'Bangun merata dulu di petak lain di set ini.' };
  if (h === 4 && hotelsInUse(s) >= MAX_HOTELS) return { ok: false, why: 'Stok hotel bank habis.' };
  if (h < 4 && housesInUse(s) >= MAX_HOUSES) return { ok: false, why: 'Stok rumah bank habis.' };
  if (p.cash < sq.house) return { ok: false, why: `Uang kurang (butuh ${fmt(sq.house)}).` };
  return { ok: true, cost: sq.house };
}

function build(s, pi, pos) {
  const c = canBuild(s, pi, pos);
  if (!c.ok) return c;
  s.players[pi].cash -= c.cost;
  s.houses[pos]++;
  log(s, `🏠 **${s.players[pi].name}** membangun ${s.houses[pos] === 5 ? 'HOTEL' : `rumah ke-${s.houses[pos]}`} di **${s.map.board[pos].name}**.`);
  return c;
}

function canSell(s, pi, pos) {
  const sq = s.map.board[pos];
  if (sq.type !== 'property' || s.owner[pos] !== pi) return { ok: false, why: 'Bukan propertimu.' };
  const h = s.houses[pos];
  if (h <= 0) return { ok: false, why: 'Tidak ada bangunan.' };
  if (h < Math.max(...groupHouses(s, sq.group))) return { ok: false, why: 'Jual merata: jual dulu dari petak yang paling banyak bangunannya.' };
  if (h === 5 && housesInUse(s) + 4 > MAX_HOUSES) return { ok: false, why: 'Stok rumah bank tidak cukup untuk menurunkan hotel.' };
  return { ok: true, refund: Math.floor(sq.house / 2) };
}

function sellHouse(s, pi, pos) {
  const c = canSell(s, pi, pos);
  if (!c.ok) return c;
  s.houses[pos]--;
  s.players[pi].cash += c.refund;
  log(s, `🏚️ **${s.players[pi].name}** menjual bangunan di **${s.map.board[pos].name}** (+${fmt(c.refund)}).`);
  return c;
}

function canMortgage(s, pi, pos) {
  const sq = s.map.board[pos];
  if (!isOwnable(sq) || s.owner[pos] !== pi) return { ok: false, why: 'Bukan propertimu.' };
  if (s.mortgaged[pos]) return { ok: false, why: 'Sudah digadai.' };
  if (sq.type === 'property' && s.map.groupMembers[sq.group].some((i) => s.houses[i] > 0)) return { ok: false, why: 'Jual dulu semua bangunan di set warna ini.' };
  return { ok: true, gain: mortgageValue(sq) };
}

function mortgage(s, pi, pos) {
  const c = canMortgage(s, pi, pos);
  if (!c.ok) return c;
  s.mortgaged[pos] = true;
  s.players[pi].cash += c.gain;
  log(s, `🏦 **${s.players[pi].name}** menggadaikan **${s.map.board[pos].name}** (+${fmt(c.gain)}).`);
  return c;
}

function canUnmortgage(s, pi, pos) {
  const sq = s.map.board[pos];
  if (!isOwnable(sq) || s.owner[pos] !== pi) return { ok: false, why: 'Bukan propertimu.' };
  if (!s.mortgaged[pos]) return { ok: false, why: 'Tidak sedang digadai.' };
  const cost = unmortgageCost(sq);
  if (s.players[pi].cash < cost) return { ok: false, why: `Uang kurang (butuh ${fmt(cost)}).` };
  return { ok: true, cost };
}

function unmortgage(s, pi, pos) {
  const c = canUnmortgage(s, pi, pos);
  if (!c.ok) return c;
  s.mortgaged[pos] = false;
  s.players[pi].cash -= c.cost;
  log(s, `🔓 **${s.players[pi].name}** menebus **${s.map.board[pos].name}** (−${fmt(c.cost)}).`);
  return c;
}

// ---------------------------------------------------------------- uang & utang
function pay(s, pi, amount, creditor) {
  const p = s.players[pi];
  p.cash -= amount;
  if (creditor === null && s.map.parkingPot) s.pot += amount; // pajak/denda -> Jackpot Parkir
  if (typeof creditor === 'number') s.players[creditor].cash += amount;
  else if (creditor === 'each') {
    const others = alive(s).filter((x) => x !== p);
    const share = Math.floor(amount / Math.max(1, others.length));
    for (const o of others) o.cash += share;
  }
}

/** Bayar sekarang kalau mampu; kalau tidak, masuk fase utang (atau langsung bangkrut kalau mustahil lunas). */
function charge(s, pi, amount, creditor = null, reason = '') {
  if (amount <= 0) return true;
  const p = s.players[pi];
  if (p.cash >= amount) {
    pay(s, pi, amount, creditor);
    return true;
  }
  if (liquidation(s, pi) < amount) {
    log(s, `💸 **${p.name}** tidak sanggup membayar ${fmt(amount)}${reason ? ` (${reason})` : ''}.`);
    bankrupt(s, pi, creditor);
    return false;
  }
  s.debt = { pi, amount, creditor, reason };
  s.phase = 'debt';
  log(s, `⚠️ **${p.name}** harus membayar **${fmt(amount)}**${reason ? ` (${reason})` : ''} tapi uangnya kurang — jual/gadai aset atau menyerah.`);
  return false;
}

function settleDebt(s) {
  if (s.phase !== 'debt' || !s.debt) return false;
  const { pi, amount, creditor } = s.debt;
  if (s.players[pi].cash < amount) return false;
  pay(s, pi, amount, creditor);
  s.debt = null;
  log(s, `✅ **${s.players[pi].name}** melunasi utang ${fmt(amount)}.`);
  finishAction(s);
  return true;
}

function bankrupt(s, pi, creditor = null) {
  const p = s.players[pi];
  if (p.bankrupt) return;
  const heir = typeof creditor === 'number' && !s.players[creditor].bankrupt ? s.players[creditor] : null;
  if (heir) {
    for (const i of ownedBy(s, pi)) {
      s.owner[i] = creditor;
      s.houses[i] = 0;
    }
    heir.cash += Math.max(0, p.cash);
    heir.jailCards.push(...p.jailCards);
    log(s, `💀 **${p.name}** bangkrut! Seluruh asetnya jatuh ke **${heir.name}**.`);
  } else {
    for (const i of ownedBy(s, pi)) {
      s.owner[i] = null;
      s.mortgaged[i] = false;
      s.houses[i] = 0;
    }
    for (const d of p.jailCards) s.decks[d].order.push(d === 'chance' ? s.map.chance.find((c) => c.type === 'jailCard') : s.map.chest.find((c) => c.type === 'jailCard'));
    log(s, `💀 **${p.name}** bangkrut! Properti kembali ke bank.`);
  }
  p.cash = 0;
  p.jailCards = [];
  p.bankrupt = true;
  p.inJail = false;
  if (s.debt?.pi === pi) s.debt = null;
  else if (s.debt?.creditor === pi) s.debt.creditor = null;
  if (s.turn === pi) s.pending = null;

  if (checkOver(s)) return;
  if (s.auction) {
    s.auction.passed.add(pi);
    if (s.auction.highBy === pi) {
      s.auction.high = 0;
      s.auction.highBy = null;
    }
    auctionCheck(s);
  }
  if (s.turn === pi && s.phase !== 'auction') nextTurn(s);
}

// ---------------------------------------------------------------- akhir game
function checkOver(s) {
  const a = alive(s);
  if (a.length <= 1) {
    finishGame(s, a[0] ?? null, 'Semua lawan bangkrut.');
    return true;
  }
  return false;
}

function finishGame(s, winner, why) {
  s.phase = 'over';
  s.ranking = s.players
    .map((p, i) => ({ p, w: p.bankrupt ? -1 : netWorth(s, i) }))
    .sort((x, y) => y.w - x.w);
  s.winner = winner ?? s.ranking[0].p;
  s.overReason = why;
  s.auction = null;
}

function nextTurn(s) {
  if (s.phase === 'over') return;
  const n = s.players.length;
  const prev = s.turn;
  let idx = prev;
  for (let k = 1; k <= n; k++) {
    idx = (prev + k) % n;
    if (!s.players[idx].bankrupt) break;
  }
  if (idx <= prev) {
    s.rounds++;
    if (s.maxRounds && s.rounds >= s.maxRounds) {
      const best = [...alive(s)].sort((a, b) => netWorth(s, idxOf(s, b)) - netWorth(s, idxOf(s, a)))[0];
      finishGame(s, best, `Batas ${s.maxRounds} ronde tercapai — pemenang ditentukan dari kekayaan bersih.`);
      return;
    }
  }
  s.turn = idx;
  s.phase = 'roll';
  s.doubles = 0;
  s.rolledDoubles = false;
  s.pending = null;
  s.turnCount++;
}

function endTurn(s) {
  if (s.phase !== 'after') return false;
  nextTurn(s);
  return true;
}

/** Dipanggil setelah semua efek sebuah langkah selesai & tidak ada yang tertunda. */
function finishAction(s) {
  if (s.phase === 'over') return;
  const p = cur(s);
  if (p.bankrupt) return nextTurn(s);
  if (s.rolledDoubles && !p.inJail) {
    s.phase = 'roll';
    log(s, `🎲 **${p.name}** dapat dadu kembar — lempar lagi!`);
  } else {
    s.phase = 'after';
  }
}

// ---------------------------------------------------------------- gerak
function goToJail(s, pi) {
  const p = s.players[pi];
  p.pos = JAIL_POS;
  p.inJail = true;
  p.jailTurns = 0;
  s.rolledDoubles = false;
  s.doubles = 0;
  log(s, `🚓 **${p.name}** masuk penjara!`);
}

function moveTo(s, target, { collect = true, nearest = null } = {}) {
  const p = cur(s);
  if (collect && target <= p.pos) {
    p.cash += s.map.goSalary;
    log(s, `💵 **${p.name}** melewati START (+${fmt(s.map.goSalary)}).`);
  }
  p.pos = target;
  landOn(s, { nearest });
}

function drawCard(s, deckName) {
  const deck = s.decks[deckName];
  const card = deck.order.shift();
  if (card.type !== 'jailCard') deck.order.push(card);
  return card;
}

function applyCard(s, card, deckName) {
  const p = cur(s);
  const pi = s.turn;
  s.lastCard = { deck: deckName, text: card.text, who: p.name };
  log(s, `🃏 **${p.name}** — ${deckName === 'chance' ? 'Kesempatan' : 'Dana Umum'}: ${card.text}`);
  switch (card.type) {
    case 'money':
      if (card.amount >= 0) p.cash += card.amount;
      else if (!charge(s, pi, -card.amount, null, 'kartu')) return;
      return finishAction(s);
    case 'moveTo':
      return moveTo(s, card.target);
    case 'nearest': {
      const list = card.kind === 'rail' ? s.map.rails : s.map.utils;
      const target = list.find((i) => i > p.pos) ?? list[0];
      return moveTo(s, target, { nearest: card.kind });
    }
    case 'back': {
      p.pos = (p.pos - card.steps + 40) % 40;
      return landOn(s);
    }
    case 'jail':
      goToJail(s, pi);
      return finishAction(s);
    case 'jailCard':
      p.jailCards.push(deckName);
      return finishAction(s);
    case 'repairs': {
      let cost = 0;
      for (const i of ownedBy(s, pi)) {
        const h = s.houses[i];
        cost += h === 5 ? card.hotel : h * card.house;
      }
      if (cost > 0 && !charge(s, pi, cost, null, 'renovasi')) return;
      return finishAction(s);
    }
    case 'payEach': {
      const others = alive(s).filter((x) => x !== p);
      const total = card.amount * others.length;
      if (!charge(s, pi, total, 'each', 'kartu')) return;
      return finishAction(s);
    }
    case 'collectEach': {
      for (const o of alive(s)) {
        if (o === p) continue;
        const give = Math.min(card.amount, o.cash);
        o.cash -= give;
        p.cash += give;
      }
      return finishAction(s);
    }
    default:
      return finishAction(s);
  }
}

function landOn(s, { nearest = null } = {}) {
  const pi = s.turn;
  const p = cur(s);
  const sq = s.map.board[p.pos];
  const dt = s.dice[0] + s.dice[1];

  if (isOwnable(sq)) {
    const o = s.owner[sq.index];
    if (o === null) {
      s.phase = 'buy';
      s.pending = sq.index;
      return;
    }
    if (o === pi) return finishAction(s);
    if (s.mortgaged[sq.index]) {
      log(s, `🏦 **${sq.name}** sedang digadai — tidak ada sewa.`);
      return finishAction(s);
    }
    const rent = rentFor(s, sq.index, dt, nearest);
    log(s, `🏠 **${p.name}** mendarat di **${sq.name}** milik **${s.players[o].name}** — sewa ${fmt(rent)}.`);
    if (!charge(s, pi, rent, o, `sewa ${sq.name}`)) return;
    return finishAction(s);
  }

  switch (sq.type) {
    case 'tax':
      log(s, `🧾 **${p.name}** bayar ${sq.name} ${fmt(sq.amount)}.`);
      if (!charge(s, pi, sq.amount, null, sq.name)) return;
      return finishAction(s);
    case 'chance':
    case 'chest': {
      const card = drawCard(s, sq.type);
      return applyCard(s, card, sq.type);
    }
    case 'gotojail':
      goToJail(s, pi);
      return finishAction(s);
    case 'parking':
      if (s.map.parkingPot && s.pot > 0) {
        p.cash += s.pot;
        log(s, `🅿️ **${p.name}** mendarat di ${sq.name} dan mengambil **JACKPOT ${fmt(s.pot)}**!`);
        s.pot = 0;
      }
      return finishAction(s);
    default:
      return finishAction(s);
  }
}

function advance(s, steps) {
  const p = cur(s);
  const np = (p.pos + steps) % 40;
  if (np < p.pos) {
    p.cash += s.map.goSalary;
    log(s, `💵 **${p.name}** melewati START (+${fmt(s.map.goSalary)}).`);
  }
  p.pos = np;
  landOn(s);
}

/** Lempar dadu. `forced` = [a, b] hanya untuk tes. */
function rollDice(s, forced) {
  if (s.phase !== 'roll') throw new Error('Bukan fase lempar dadu');
  const p = cur(s);
  const a = forced?.[0] ?? Math.floor(Math.random() * 6) + 1;
  const b = forced?.[1] ?? Math.floor(Math.random() * 6) + 1;
  s.dice = [a, b];
  const isDouble = a === b;
  const total = a + b;

  if (p.inJail) {
    if (isDouble) {
      p.inJail = false;
      p.jailTurns = 0;
      s.rolledDoubles = false; // keluar penjara dengan kembar: jalan, tapi tidak lempar lagi
      log(s, `🎲 **${p.name}** dapat kembar ${a}-${b} dan bebas dari penjara!`);
      return advance(s, total);
    }
    p.jailTurns++;
    if (p.jailTurns >= 3) {
      log(s, `🎲 **${p.name}** gagal 3× — wajib bayar denda ${fmt(s.map.jailFine)}.`);
      p.inJail = false;
      p.jailTurns = 0;
      s.rolledDoubles = false;
      if (!charge(s, s.turn, s.map.jailFine, null, 'denda penjara')) return;
      return advance(s, total);
    }
    log(s, `🎲 **${p.name}** (${a}-${b}) belum beruntung — tetap di penjara (${p.jailTurns}/3).`);
    s.phase = 'after';
    return;
  }

  if (isDouble) {
    s.doubles++;
    if (s.doubles >= 3) {
      log(s, `🎲 **${p.name}** kembar 3× berturut-turut (${a}-${b}) — langsung ke penjara!`);
      goToJail(s, s.turn);
      s.phase = 'after';
      return;
    }
    s.rolledDoubles = true;
  } else {
    s.rolledDoubles = false;
  }
  log(s, `🎲 **${p.name}** melempar ${a}-${b} (${total}).`);
  advance(s, total);
}

function payJailFine(s) {
  const p = cur(s);
  if (s.phase !== 'roll' || !p.inJail || p.cash < s.map.jailFine) return false;
  p.cash -= s.map.jailFine;
  if (s.map.parkingPot) s.pot += s.map.jailFine;
  p.inJail = false;
  p.jailTurns = 0;
  log(s, `💰 **${p.name}** membayar denda ${fmt(s.map.jailFine)} dan keluar penjara.`);
  return true;
}

function useJailCard(s) {
  const p = cur(s);
  if (s.phase !== 'roll' || !p.inJail || !p.jailCards.length) return false;
  const deckName = p.jailCards.shift();
  s.decks[deckName].order.push((deckName === 'chance' ? s.map.chance : s.map.chest).find((c) => c.type === 'jailCard'));
  p.inJail = false;
  p.jailTurns = 0;
  log(s, `🎫 **${p.name}** memakai kartu Bebas dari Penjara.`);
  return true;
}

// ---------------------------------------------------------------- beli & lelang
function buy(s) {
  if (s.phase !== 'buy') return false;
  const p = cur(s);
  const sq = s.map.board[s.pending];
  if (p.cash < sq.price) return false;
  p.cash -= sq.price;
  s.owner[sq.index] = s.turn;
  log(s, `🏷️ **${p.name}** membeli **${sq.name}** seharga ${fmt(sq.price)}.`);
  s.pending = null;
  finishAction(s);
  return true;
}

function declineBuy(s) {
  if (s.phase !== 'buy') return false;
  const sq = s.map.board[s.pending];
  s.pending = null;
  log(s, `🔨 **${sq.name}** dilelang!`);
  s.auction = { pos: sq.index, high: 0, highBy: null, passed: new Set() };
  s.phase = 'auction';
  auctionCheck(s);
  return true;
}

function auctionBid(s, pi, amount) {
  const a = s.auction;
  if (s.phase !== 'auction' || !a) return { ok: false, why: 'Tidak ada lelang.' };
  const p = s.players[pi];
  if (!p || p.bankrupt) return { ok: false, why: 'Kamu tidak ikut.' };
  if (!Number.isInteger(amount) || amount <= a.high) return { ok: false, why: `Tawaran harus lebih dari ${fmt(a.high)}.` };
  if (amount > p.cash) return { ok: false, why: 'Uangmu tidak cukup.' };
  a.high = amount;
  a.highBy = pi;
  a.passed.delete(pi);
  log(s, `🔨 **${p.name}** menawar ${fmt(amount)} untuk **${s.map.board[a.pos].name}**.`);
  auctionCheck(s);
  return { ok: true };
}

function auctionPass(s, pi) {
  const a = s.auction;
  if (s.phase !== 'auction' || !a) return false;
  a.passed.add(pi);
  auctionCheck(s);
  return true;
}

/** Lelang selesai kalau semua orang selain penawar tertinggi sudah pass / tidak mampu menawar lebih tinggi. */
function auctionCheck(s) {
  const a = s.auction;
  if (!a) return;
  const contenders = s.players.filter((p, i) => !p.bankrupt && i !== a.highBy && !a.passed.has(i) && p.cash > a.high);
  if (contenders.length === 0) auctionEnd(s);
}

function auctionEnd(s) {
  const a = s.auction;
  if (!a) return;
  const sq = s.map.board[a.pos];
  if (a.highBy !== null) {
    const w = s.players[a.highBy];
    w.cash -= a.high;
    s.owner[a.pos] = a.highBy;
    log(s, `🏆 **${w.name}** memenangkan lelang **${sq.name}** dengan ${fmt(a.high)}.`);
  } else {
    log(s, `🤷 Tidak ada yang menawar — **${sq.name}** tetap milik bank.`);
  }
  s.auction = null;
  s.phase = 'after';
  finishAction(s);
}

// ---------------------------------------------------------------- dagang
function validateTrade(s, o) {
  const a = s.players[o.from];
  const b = s.players[o.to];
  if (!a || !b || a.bankrupt || b.bankrupt || o.from === o.to) return { ok: false, why: 'Pemain tidak valid.' };
  const check = (list, owner) => {
    for (const i of list) {
      const sq = s.map.board[i];
      if (!sq || !isOwnable(sq) || s.owner[i] !== owner) return `${sq?.name ?? i} bukan milik pemain tsb.`;
      if (sq.type === 'property' && s.map.groupMembers[sq.group].some((j) => s.houses[j] > 0)) return `${sq.name}: jual dulu bangunan di set warnanya.`;
    }
    return null;
  };
  const err = check(o.giveProps, o.from) ?? check(o.getProps, o.to);
  if (err) return { ok: false, why: err };
  if (o.giveCash < 0 || o.getCash < 0 || o.giveCash > a.cash) return { ok: false, why: `${a.name} tidak punya uang sebanyak itu.` };
  if (o.getCash > b.cash) return { ok: false, why: `${b.name} tidak punya uang sebanyak itu.` };
  if (!o.giveProps.length && !o.getProps.length && !o.giveCash && !o.getCash) return { ok: false, why: 'Tawaran kosong.' };
  return { ok: true };
}

function executeTrade(s, o) {
  const v = validateTrade(s, o);
  if (!v.ok) return v;
  const a = s.players[o.from];
  const b = s.players[o.to];
  for (const i of o.giveProps) s.owner[i] = o.to;
  for (const i of o.getProps) s.owner[i] = o.from;
  a.cash += o.getCash - o.giveCash;
  b.cash += o.giveCash - o.getCash;
  log(s, `🤝 **${a.name}** & **${b.name}** sepakat dagang (${o.giveProps.length + o.getProps.length} properti, ${fmt(o.giveCash + o.getCash)} tunai).`);
  return { ok: true };
}

/** Nilai kasar sebuah tawaran dari sisi `side` ('to' = penerima). Dipakai bot menilai tawaran. */
function tradeValue(s, o, side) {
  const val = (list, forWho) =>
    list.reduce((sum, i) => {
      const sq = s.map.board[i];
      let v = s.mortgaged[i] ? sq.price * 0.6 : sq.price;
      if (sq.type === 'property') {
        const have = s.map.groupMembers[sq.group].filter((j) => s.owner[j] === forWho).length;
        if (have + 1 === s.map.groupMembers[sq.group].length) v *= 1.6; // melengkapi set
        else if (have > 0) v *= 1.15;
      }
      return sum + v;
    }, 0);
  if (side === 'to') return val(o.giveProps, o.to) + o.giveCash - (val(o.getProps, o.from) + o.getCash);
  return val(o.getProps, o.from) + o.getCash - (val(o.giveProps, o.to) + o.giveCash);
}

// ---------------------------------------------------------------- bot
function raiseMoney(s, pi, target) {
  // 1) jual bangunan mulai dari yang termahal, 2) gadai properti termurah dulu
  const p = s.players[pi];
  let guard = 200;
  while (p.cash < target && guard-- > 0) {
    const sellable = ownedBy(s, pi).filter((i) => canSell(s, pi, i).ok).sort((a, b) => s.map.board[b].house - s.map.board[a].house);
    if (sellable.length) {
      sellHouse(s, pi, sellable[0]);
      continue;
    }
    const mortgageable = ownedBy(s, pi).filter((i) => canMortgage(s, pi, i).ok).sort((a, b) => s.map.board[a].price - s.map.board[b].price);
    if (mortgageable.length) {
      mortgage(s, pi, mortgageable[0]);
      continue;
    }
    break;
  }
}

function wantsProperty(s, pi, pos) {
  const sq = s.map.board[pos];
  if (sq.type !== 'property') return 1;
  const have = s.map.groupMembers[sq.group].filter((j) => s.owner[j] === pi).length;
  const others = s.map.groupMembers[sq.group].filter((j) => s.owner[j] !== null && s.owner[j] !== pi).length;
  if (have + 1 === s.map.groupMembers[sq.group].length) return 1.5; // melengkapi set
  if (others > 0 && have === 0) return 0.9;
  return 1.05;
}

/** Satu langkah bot. Return true kalau melakukan sesuatu. */
function botStep(s) {
  if (s.phase === 'over') return false;
  const pi = s.phase === 'auction' ? null : s.turn;
  const p = pi === null ? null : s.players[pi];

  switch (s.phase) {
    case 'roll': {
      if (p.inJail) {
        if (p.jailCards.length) return useJailCard(s) || (rollDice(s), true);
        if (p.cash >= 450 && s.rounds < 25) return payJailFine(s) || (rollDice(s), true);
      }
      rollDice(s);
      return true;
    }
    case 'buy': {
      const sq = s.map.board[s.pending];
      const keep = 100 + (alive(s).length > 2 ? 0 : 0);
      if (p.cash - sq.price >= keep * (wantsProperty(s, pi, sq.index) >= 1.5 ? 0 : 1)) buy(s);
      else declineBuy(s);
      return true;
    }
    case 'auction': {
      const a = s.auction;
      const sq = s.map.board[a.pos];
      for (let i = 0; i < s.players.length; i++) {
        const b = s.players[i];
        if (!b.bot || b.bankrupt || a.passed.has(i) || a.highBy === i) continue;
        const limit = Math.min(Math.floor(sq.price * wantsProperty(s, i, a.pos) * 0.95), b.cash - 60);
        const step = Math.max(10, Math.round(sq.price * 0.1 / 10) * 10);
        const bid = Math.max(a.high + step, a.high + 10);
        if (bid <= limit) auctionBid(s, i, bid);
        else auctionPass(s, i);
        return true;
      }
      // tak ada bot yang bisa bertindak (menunggu manusia)
      return false;
    }
    case 'debt': {
      const d = s.debt;
      raiseMoney(s, d.pi, d.amount);
      if (!settleDebt(s)) bankrupt(s, d.pi, d.creditor);
      return true;
    }
    case 'after': {
      let guard = 12;
      // tebus gadai kalau kas longgar
      for (const i of ownedBy(s, pi)) {
        if (s.mortgaged[i] && p.cash > unmortgageCost(s.map.board[i]) + 400 && guard-- > 0) unmortgage(s, pi, i);
      }
      // bangun rumah (sisakan kas)
      const buildable = () =>
        ownedBy(s, pi)
          .filter((i) => canBuild(s, pi, i).ok && p.cash - s.map.board[i].house >= 250)
          .sort((a, b) => s.map.board[a].house - s.map.board[b].house || a - b);
      let list = buildable();
      while (list.length && guard-- > 0) {
        build(s, pi, list[0]);
        list = buildable();
      }
      endTurn(s);
      return true;
    }
    default:
      return false;
  }
}

module.exports = {
  START_CASH, GO_SALARY, JAIL_FINE, MAX_HOUSES, MAX_HOTELS, BOARD: getMap(DEFAULT_MAP).board, TOKENS: getMap(DEFAULT_MAP).tokens, getMap,
  fmt, createGame, cur, alive, ownedBy, hasSet, rentFor, netWorth, liquidation, mortgageValue, unmortgageCost,
  housesInUse, hotelsInUse,
  canBuild, build, canSell, sellHouse, canMortgage, mortgage, canUnmortgage, unmortgage,
  rollDice, payJailFine, useJailCard, buy, declineBuy, auctionBid, auctionPass, auctionEnd,
  settleDebt, bankrupt, endTurn, nextTurn, finishGame,
  validateTrade, executeTrade, tradeValue, botStep, raiseMoney,
};
