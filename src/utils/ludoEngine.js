'use strict';

/**
 * Mesin Ludo (murni, tanpa Discord) — bisa dites tanpa bot.
 *
 * Aturan:
 *  - 2–4 pemain, masing-masing 4 pion. Warna searah jarum jam: merah, hijau, kuning, biru.
 *  - Keluar dari base hanya dengan dadu 6. Dadu 6 / menangkap lawan / pion masuk finish = giliran tambahan.
 *  - Tiga kali 6 beruntun: giliran hangus.
 *  - Jalur utama 52 petak. Petak start & bintang = aman. Dua pion sewarna di satu petak = benteng (tak bisa ditangkap).
 *  - Pion harus mendarat PAS di finish (dadu pas).
 */

const COLORS = [
  { key: 'red', name: 'Merah', square: '🟥', pawn: '🔴' },
  { key: 'green', name: 'Hijau', square: '🟩', pawn: '🟢' },
  { key: 'yellow', name: 'Kuning', square: '🟨', pawn: '🟡' },
  { key: 'blue', name: 'Biru', square: '🟦', pawn: '🔵' },
];
const KEYCAPS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

/** Varian permainan: jumlah pion per pemain & dadu yang boleh mengeluarkan pion dari base. */
const MODES = {
  klasik: { id: 'klasik', name: 'Klasik', emoji: '🎲', pawns: 4, exitRolls: [6], desc: '4 pion • keluar base dengan dadu **6**' },
  santai: { id: 'santai', name: 'Santai', emoji: '🌴', pawns: 4, exitRolls: [1, 6], desc: '4 pion • keluar base dengan dadu **1 atau 6**' },
  cepat: { id: 'cepat', name: 'Cepat', emoji: '⚡', pawns: 2, exitRolls: [1, 6], desc: '2 pion • keluar base dengan **1 atau 6** (game singkat)' },
};
const FINISH = 56; // 0..50 jalur utama, 51..55 jalur rumah, 56 = finish
const SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]);

// ---------- koordinat papan 15x15 ----------
const TRACK = [];
const seg = (cells) => cells.forEach((c) => TRACK.push(c));
const range = (a, b) => {
  const out = [];
  if (a <= b) for (let i = a; i <= b; i++) out.push(i);
  else for (let i = a; i >= b; i--) out.push(i);
  return out;
};
seg(range(1, 5).map((c) => [6, c]));
seg(range(5, 0).map((r) => [r, 6]));
seg([[0, 7], [0, 8]]);
seg(range(1, 5).map((r) => [r, 8]));
seg(range(9, 14).map((c) => [6, c]));
seg([[7, 14], [8, 14]]);
seg(range(13, 9).map((c) => [8, c]));
seg(range(9, 14).map((r) => [r, 8]));
seg([[14, 7], [14, 6]]);
seg(range(13, 9).map((r) => [r, 6]));
seg(range(5, 0).map((c) => [8, c]));
seg([[7, 0], [6, 0]]);
if (TRACK.length !== 52 || new Set(TRACK.map((c) => c.join())).size !== 52) throw new Error(`Jalur Ludo salah: ${TRACK.length}`);

const HOME_COL = [
  range(1, 5).map((c) => [7, c]), // merah
  range(1, 5).map((r) => [r, 7]), // hijau
  range(13, 9).map((c) => [7, c]), // kuning
  range(13, 9).map((r) => [r, 7]), // biru
];
const BASE_SLOTS = [
  [[2, 2], [2, 3], [3, 2], [3, 3]],
  [[2, 11], [2, 12], [3, 11], [3, 12]],
  [[11, 11], [11, 12], [12, 11], [12, 12]],
  [[11, 2], [11, 3], [12, 2], [12, 3]],
];
const BASE_RECT = [[0, 0], [0, 9], [9, 9], [9, 0]]; // pojok kiri-atas tiap base 6x6
const FINISH_CELL = [[7, 6], [6, 7], [7, 8], [8, 7]];

const startIndex = (color) => color * 13;
const absCell = (color, pos) => (startIndex(color) + pos) % 52;
const isSafeAbs = (abs) => SAFE.has(abs);

// ---------- state ----------
function createGame(players, { mode = 'klasik', theme = 'klasik' } = {}) {
  const m = MODES[mode] ?? MODES.klasik;
  if (players.length < 2 || players.length > 4) throw new Error('Ludo butuh 2–4 pemain');
  // 2 pemain duduk berseberangan (merah & kuning), 3 pemain: merah-hijau-kuning
  const seats = players.length === 2 ? [0, 2] : players.length === 3 ? [0, 1, 2] : [0, 1, 2, 3];
  return {
    mode: m,
    theme,
    players: players.map((p, i) => ({
      id: p.id,
      name: p.name,
      bot: !!p.bot,
      color: seats[i],
      pawns: Array(m.pawns).fill(-1),
      out: false, // menyerah
    })),
    turn: 0,
    phase: 'roll', // roll | move | over
    roll: null,
    sixStreak: 0,
    legal: [],
    winner: null,
    ranking: [],
    log: [],
    turnCount: 0,
  };
}

const cur = (s) => s.players[s.turn];
const finishedCount = (p) => p.pawns.filter((x) => x === FINISH).length;

function pushLog(s, text) {
  s.log.push(text);
  if (s.log.length > 6) s.log.shift();
}

/** Pion siapa saja yang ada di petak jalur utama `abs`. */
function pawnsAt(s, abs) {
  const out = [];
  s.players.forEach((p, pi) => {
    if (p.out) return;
    p.pawns.forEach((pos, i) => {
      if (pos >= 0 && pos <= 50 && absCell(p.color, pos) === abs) out.push({ pi, i });
    });
  });
  return out;
}

/** Hitung hasil kalau pion `i` pemain giliran jalan sesuai dadu. null = tidak legal. */
function simulate(s, i, roll = s.roll) {
  const p = cur(s);
  const pos = p.pawns[i];
  let to;
  if (pos === -1) {
    if (!s.mode.exitRolls.includes(roll)) return null;
    to = 0;
  } else if (pos === FINISH) {
    return null;
  } else {
    to = pos + roll;
    if (to > FINISH) return null;
  }

  const res = { from: pos, to, captures: [], finish: to === FINISH, enterHome: pos <= 50 && to > 50 && to < FINISH, safe: false, leave: pos === -1 };
  if (to <= 50) {
    const abs = absCell(p.color, to);
    res.safe = isSafeAbs(abs);
    if (!res.safe) {
      const byPlayer = new Map();
      for (const t of pawnsAt(s, abs)) {
        if (t.pi === s.turn) continue;
        if (!byPlayer.has(t.pi)) byPlayer.set(t.pi, []);
        byPlayer.get(t.pi).push(t.i);
      }
      for (const [pi, list] of byPlayer) if (list.length === 1) res.captures.push({ pi, i: list[0] });
    }
  }
  return res;
}

function computeLegal(s) {
  const out = [];
  for (let i = 0; i < cur(s).pawns.length; i++) if (simulate(s, i)) out.push(i);
  return out;
}

function nextTurn(s) {
  s.sixStreak = 0;
  s.roll = null;
  s.legal = [];
  const n = s.players.length;
  for (let k = 1; k <= n; k++) {
    const idx = (s.turn + k) % n;
    if (!s.players[idx].out) {
      s.turn = idx;
      break;
    }
  }
  s.phase = 'roll';
  s.turnCount++;
}

function checkWin(s) {
  const alive = s.players.filter((p) => !p.out);
  if (alive.length === 1 && s.players.length > 1) {
    return finish(s, alive[0]);
  }
  const w = s.players.find((p) => !p.out && finishedCount(p) === p.pawns.length);
  if (w) return finish(s, w);
  return false;
}

function finish(s, winner) {
  s.phase = 'over';
  s.winner = winner;
  s.ranking = [...s.players].sort((a, b) => {
    if (a === winner) return -1;
    if (b === winner) return 1;
    if (a.out !== b.out) return a.out ? 1 : -1;
    return progress(b) - progress(a);
  });
  return true;
}

const progress = (p) => p.pawns.reduce((a, x) => a + (x < 0 ? 0 : x + 1), 0);

/** Lempar dadu. `forced` hanya untuk tes. */
function rollDice(s, forced) {
  if (s.phase !== 'roll') throw new Error('Bukan fase lempar dadu');
  const p = cur(s);
  const v = forced ?? Math.floor(Math.random() * 6) + 1;
  s.roll = v;
  const info = { value: v, auto: null, passed: false, tripleSix: false };

  if (v === 6) s.sixStreak++;
  else s.sixStreak = 0;

  if (s.sixStreak >= 3) {
    info.tripleSix = true;
    pushLog(s, `🎲 **${p.name}** dapat 6 tiga kali beruntun — giliran hangus!`);
    nextTurn(s);
    info.passed = true;
    return info;
  }

  s.legal = computeLegal(s);
  if (!s.legal.length) {
    pushLog(s, `🎲 **${p.name}** dapat **${v}** — tidak ada pion yang bisa jalan.`);
    if (v === 6) {
      s.roll = null; // lempar lagi
      s.phase = 'roll';
    } else {
      nextTurn(s);
    }
    info.passed = true;
    return info;
  }
  s.phase = 'move';
  if (s.legal.length === 1) info.auto = s.legal[0];
  return info;
}

/** Jalankan pion `i`. */
function movePawn(s, i) {
  if (s.phase !== 'move' || !s.legal.includes(i)) throw new Error('Gerakan tidak legal');
  const p = cur(s);
  const roll = s.roll;
  const r = simulate(s, i);
  p.pawns[i] = r.to;

  const parts = [];
  if (r.leave) parts.push('keluar dari base');
  else if (r.finish) parts.push('**sampai finish!** 🏁');
  else if (r.enterHome) parts.push('masuk jalur rumah');
  else parts.push(`maju ${roll}`);

  for (const c of r.captures) {
    const victim = s.players[c.pi];
    victim.pawns[c.i] = -1;
    parts.push(`menangkap pion ${victim.name} 💥`);
  }
  pushLog(s, `🎲 **${p.name}** (${roll}): pion ${i + 1} ${parts.join(', ')}.`);

  if (checkWin(s)) return { ...r, extra: false, won: true };

  const extra = roll === 6 || r.captures.length > 0 || r.finish;
  s.legal = [];
  if (extra) {
    s.roll = null;
    s.phase = 'roll';
  } else {
    nextTurn(s);
  }
  return { ...r, extra, won: false };
}

/** Pemain menyerah / dikeluarkan. */
function removePlayer(s, pi) {
  const p = s.players[pi];
  if (p.out) return;
  p.out = true;
  p.pawns = p.pawns.map(() => -1);
  pushLog(s, `🏳️ **${p.name}** keluar dari permainan.`);
  if (checkWin(s)) return;
  if (s.turn === pi) nextTurn(s);
}

// ---------- AI bot ----------
function threatened(s, abs, ownerPi) {
  if (isSafeAbs(abs)) return false;
  for (let d = 1; d <= 6; d++) {
    const back = (abs - d + 52) % 52;
    for (const t of pawnsAt(s, back)) if (t.pi !== ownerPi) return true;
  }
  return false;
}

function botChoose(s) {
  const p = cur(s);
  let best = null;
  let bestScore = -Infinity;
  for (const i of s.legal) {
    const r = simulate(s, i);
    let score = Math.random() * 3;
    if (r.captures.length) score += 100;
    if (r.finish) score += 90;
    if (r.enterHome) score += 55;
    if (r.leave) score += 50;
    if (r.safe) score += 20;
    if (r.from >= 0 && r.from <= 50 && threatened(s, absCell(p.color, r.from), s.turn)) score += 35;
    if (r.to <= 50 && !r.safe && threatened(s, absCell(p.color, r.to), s.turn)) score -= 30;
    score += r.to * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

// ---------- render ----------
function pawnLabel(pos) {
  if (pos === -1) return 'Base';
  if (pos === FINISH) return 'Finish 🏁';
  if (pos > 50) return `Rumah ${pos - 50}/5`;
  return `Langkah ${pos + 1}`;
}

/** Koordinat [baris, kolom] pion di papan 15x15. */
function pawnCell(p, pos, i) {
  if (pos === -1) return BASE_SLOTS[p.color][i];
  if (pos === FINISH) return FINISH_CELL[p.color];
  if (pos > 50) return HOME_COL[p.color][pos - 51];
  return TRACK[absCell(p.color, pos)];
}

/** Papan 15x15 sebagai teks emoji. `highlight` = pion giliran saat ini yang bisa dipilih. */
function renderBoard(s, highlight = []) {
  const grid = Array.from({ length: 15 }, () => Array(15).fill('⬜'));

  // base 6x6 berwarna, slot kosong putih
  COLORS.forEach((c, ci) => {
    const [r0, c0] = BASE_RECT[ci];
    for (let r = 0; r < 6; r++) for (let k = 0; k < 6; k++) grid[r0 + r][c0 + k] = c.square;
    for (const [r, k] of BASE_SLOTS[ci]) grid[r][k] = '⬜';
  });
  // jalur rumah & start
  COLORS.forEach((c, ci) => {
    for (const [r, k] of HOME_COL[ci]) grid[r][k] = c.square;
    const [sr, sc] = TRACK[startIndex(ci)];
    grid[sr][sc] = c.square;
  });
  // bintang aman
  for (const a of [8, 21, 34, 47]) grid[TRACK[a][0]][TRACK[a][1]] = '⭐';
  // pusat
  for (let r = 6; r <= 8; r++) for (let k = 6; k <= 8; k++) grid[r][k] = '⬛';
  COLORS.forEach((c, ci) => (grid[FINISH_CELL[ci][0]][FINISH_CELL[ci][1]] = c.square));
  grid[7][7] = '🏆';

  // pion (yang bisa dipilih ditaruh terakhir supaya tampil di atas)
  const place = (r, k, e) => (grid[r][k] = e);
  const coordOf = (p, pos, i) => {
    if (pos === -1) return BASE_SLOTS[p.color][i];
    if (pos === FINISH) return FINISH_CELL[p.color];
    if (pos > 50) return HOME_COL[p.color][pos - 51];
    return TRACK[absCell(p.color, pos)];
  };
  s.players.forEach((p, pi) => {
    if (p.out) return;
    p.pawns.forEach((pos, i) => {
      const [r, k] = coordOf(p, pos, i);
      place(r, k, COLORS[p.color].pawn);
    });
  });
  if (highlight.length && s.phase === 'move') {
    const p = cur(s);
    for (const i of highlight) {
      const [r, k] = coordOf(p, p.pawns[i], i);
      place(r, k, KEYCAPS[i]);
    }
  }
  return grid.map((row) => row.join('')).join('\n');
}

module.exports = {
  COLORS, KEYCAPS, FINISH, TRACK, HOME_COL, BASE_SLOTS, BASE_RECT, FINISH_CELL, SAFE, MODES, pawnCell, startIndex,
  createGame, rollDice, movePawn, removePlayer, botChoose, simulate, computeLegal,
  renderBoard, pawnLabel, finishedCount, progress, cur, absCell,
};
