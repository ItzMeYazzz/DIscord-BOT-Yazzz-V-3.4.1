'use strict';

/** Logika murni mini games (mudah dites, tanpa Discord). */

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------------- Tic Tac Toe ----------------
const TTT_LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
function tttWinner(b) {
  for (const [x, y, z] of TTT_LINES) if (b[x] && b[x] === b[y] && b[y] === b[z]) return { mark: b[x], line: [x, y, z] };
  return b.every(Boolean) ? { mark: 'draw', line: [] } : null;
}
function tttMinimax(b, turn, me) {
  const w = tttWinner(b);
  if (w) return w.mark === me ? 10 : w.mark === 'draw' ? 0 : -10;
  let best = turn === me ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    const v = tttMinimax(b, turn === 'X' ? 'O' : 'X', me);
    b[i] = null;
    best = turn === me ? Math.max(best, v) : Math.min(best, v);
  }
  return best;
}
/** Langkah bot. `blunder` = peluang bot melangkah acak (supaya bisa dikalahkan). */
function tttBot(b, me, blunder = 0.2) {
  const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (Math.random() < blunder) return pick(free);
  const opp = me === 'X' ? 'O' : 'X';
  let bestV = -Infinity;
  let moves = [];
  for (const i of free) {
    b[i] = me;
    const v = tttMinimax(b, opp, me);
    b[i] = null;
    if (v > bestV) { bestV = v; moves = [i]; } else if (v === bestV) moves.push(i);
  }
  return pick(moves);
}

// ---------------- Connect 4 ----------------
const C4_ROWS = 6;
const C4_COLS = 7;
const c4New = () => Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(0));
function c4Drop(b, col, mark) {
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    if (!b[r][col]) {
      b[r][col] = mark;
      return r;
    }
  }
  return -1;
}
function c4Winner(b) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const m = b[r][c];
      if (!m) continue;
      for (const [dr, dc] of dirs) {
        const cells = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= C4_ROWS || cc < 0 || cc >= C4_COLS || b[rr][cc] !== m) break;
          cells.push([rr, cc]);
        }
        if (cells.length === 4) return { mark: m, cells };
      }
    }
  }
  return b[0].every(Boolean) ? { mark: 'draw', cells: [] } : null;
}
function c4Bot(b, me) {
  const opp = me === 1 ? 2 : 1;
  const valid = [...Array(C4_COLS).keys()].filter((c) => !b[0][c]);
  const tryMove = (col, mark) => {
    const r = c4Drop(b, col, mark);
    const w = c4Winner(b)?.mark === mark;
    b[r][col] = 0;
    return w;
  };
  for (const c of valid) if (tryMove(c, me)) return c;
  for (const c of valid) if (tryMove(c, opp)) return c;
  const safe = valid.filter((c) => {
    const r = c4Drop(b, c, me);
    let bad = false;
    if (r > 0) bad = tryMove(c, opp);
    b[r][c] = 0;
    return !bad;
  });
  const pool = safe.length ? safe : valid;
  const weights = pool.map((c) => 4 - Math.abs(3 - c));
  let t = Math.random() * weights.reduce((a, x) => a + x, 0);
  for (let i = 0; i < pool.length; i++) {
    t -= weights[i];
    if (t <= 0) return pool[i];
  }
  return pool[0];
}

// ---------------- Ranjau (minesweeper bertaruhan) ----------------
const MINE_CELLS = 20;
/** Pengali total setelah `k` kotak aman terbuka dengan `m` ranjau (edge rumah 3%, maks 100x). */
function mineMultiplier(k, m) {
  let p = 1;
  for (let i = 0; i < k; i++) p *= (MINE_CELLS - i) / (MINE_CELLS - m - i);
  return Math.min(100, Math.floor(p * 0.97 * 100) / 100);
}

// ---------------- Hi-Lo ----------------
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const drawCard = () => ({ v: rnd(13), suit: pick(SUITS) }); // v: 0..12
const cardText = (c) => `${RANKS[c.v]}${c.suit}`;
/** Pengali satu tebakan (seri = kalah). */
function hiloMult(v, dir) {
  const wins = dir === 'hi' ? 12 - v : v;
  if (wins <= 0) return 0;
  return Math.floor((0.96 * 13 / wins) * 100) / 100;
}

// ---------------- Wordle ----------------
/** Return array 'g' (hijau) / 'y' (kuning) / 'x' (abu). */
function wordleScore(guess, answer) {
  const res = Array(guess.length).fill('x');
  const left = {};
  for (let i = 0; i < answer.length; i++) {
    if (guess[i] === answer[i]) res[i] = 'g';
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < guess.length; i++) {
    if (res[i] === 'g') continue;
    if (left[guess[i]] > 0) {
      res[i] = 'y';
      left[guess[i]]--;
    }
  }
  return res;
}

// ---------------- Puzzle geser 3x3 ----------------
function slideNew(moves = 80) {
  const b = [1, 2, 3, 4, 5, 6, 7, 8, 0];
  let last = -1;
  for (let k = 0; k < moves; k++) {
    const z = b.indexOf(0);
    const opts = slideNeighbors(z).filter((n) => n !== last);
    const n = pick(opts);
    [b[z], b[n]] = [b[n], b[z]];
    last = z;
  }
  if (slideSolved(b)) return slideNew(moves);
  return b;
}
function slideNeighbors(z) {
  const r = Math.floor(z / 3), c = z % 3;
  const out = [];
  if (r > 0) out.push(z - 3);
  if (r < 2) out.push(z + 3);
  if (c > 0) out.push(z - 1);
  if (c < 2) out.push(z + 1);
  return out;
}
const slideSolved = (b) => b.every((v, i) => v === (i + 1) % 9);
function slideMove(b, idx) {
  const z = b.indexOf(0);
  if (!slideNeighbors(z).includes(idx)) return false;
  [b[z], b[idx]] = [b[idx], b[z]];
  return true;
}

// ---------------- Soal hitung & acak kata ----------------
function mathProblem(level = 1) {
  const a = (n) => rnd(n) + 2;
  if (level === 1) { const x = a(40), y = a(40); return rnd(2) ? { text: `${x} + ${y}`, answer: x + y } : { text: `${x + y} − ${y}`, answer: x }; }
  if (level === 2) { const x = a(11), y = a(11), z = a(30); return { text: `${x} × ${y} + ${z}`, answer: x * y + z }; }
  const x = a(12), y = a(12), z = a(9), w = a(40);
  return rnd(2) ? { text: `(${x} + ${z}) × ${y} − ${w}`, answer: (x + z) * y - w } : { text: `${x * y} ÷ ${y} × ${z} + ${w}`, answer: x * z + w };
}
function scramble(word) {
  let s = word;
  for (let i = 0; i < 20 && s === word; i++) s = shuffle([...word]).join('');
  return s;
}

// ---------------- Roda keberuntungan ----------------
const WHEEL = [
  { mult: 0, w: 35, label: '💀 ZONK' }, { mult: 0.5, w: 20, label: '🔸 x0.5' }, { mult: 1, w: 15, label: '🔹 x1' },
  { mult: 1.5, w: 12, label: '🟢 x1.5' }, { mult: 2, w: 10, label: '🟡 x2' }, { mult: 3, w: 5, label: '🟠 x3' },
  { mult: 5, w: 2, label: '🔴 x5' }, { mult: 10, w: 1, label: '💎 x10' },
];
function wheelSpin() {
  let t = Math.random() * WHEEL.reduce((a, s) => a + s.w, 0);
  for (const s of WHEEL) {
    t -= s.w;
    if (t < 0) return s;
  }
  return WHEEL[0];
}
const wheelRtp = () => WHEEL.reduce((a, s) => a + s.mult * s.w, 0) / WHEEL.reduce((a, s) => a + s.w, 0);

module.exports = {
  rnd, pick, shuffle,
  tttWinner, tttBot, c4New, c4Drop, c4Winner, c4Bot, C4_ROWS, C4_COLS,
  MINE_CELLS, mineMultiplier, RANKS, drawCard, cardText, hiloMult,
  wordleScore, slideNew, slideMove, slideSolved, mathProblem, scramble, WHEEL, wheelSpin, wheelRtp,
};
