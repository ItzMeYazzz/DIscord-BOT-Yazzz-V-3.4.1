'use strict';

/** Logika murni untuk /arcade (tanpa Discord) — semua fungsi menerima `rnd` supaya bisa diuji deterministik. */

/** Sumber acak yang bisa diganti (untuk pengujian yang bisa diulang): rng.fn = seededRandom */
const rng = { fn: Math.random };
const rand = () => rng.fn();
const rint = (n, rnd = rand) => Math.floor(rnd() * n);
const shuffle = (arr, rnd = rand) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rint(i + 1, rnd);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ============================================================ 2048
const G = 4;

function spawn2048(grid, rnd = rand) {
  const empty = [];
  for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) if (!grid[r][c]) empty.push([r, c]);
  if (!empty.length) return false;
  const [r, c] = empty[rint(empty.length, rnd)];
  grid[r][c] = rnd() < 0.9 ? 2 : 4;
  return true;
}

function new2048(rnd = rand) {
  const grid = Array.from({ length: G }, () => Array(G).fill(0));
  spawn2048(grid, rnd);
  spawn2048(grid, rnd);
  return { grid, score: 0, moves: 0, won: false };
}

/** Geser & gabung satu baris ke kiri. */
function slideLine(line) {
  const vals = line.filter(Boolean);
  const out = [];
  let gained = 0;
  for (let i = 0; i < vals.length; i++) {
    if (vals[i] === vals[i + 1]) {
      out.push(vals[i] * 2);
      gained += vals[i] * 2;
      i++;
    } else out.push(vals[i]);
  }
  while (out.length < G) out.push(0);
  return { line: out, gained };
}

/** dir: 'left' | 'right' | 'up' | 'down'. Return grid baru (tidak mengubah input). */
function move2048(grid, dir) {
  const get = (i) => {
    if (dir === 'left') return grid[i].slice();
    if (dir === 'right') return grid[i].slice().reverse();
    const col = grid.map((row) => row[i]);
    return dir === 'up' ? col : col.reverse();
  };
  const next = Array.from({ length: G }, () => Array(G).fill(0));
  let gained = 0;
  let moved = false;
  for (let i = 0; i < G; i++) {
    const src = get(i);
    const { line, gained: g } = slideLine(src);
    gained += g;
    const placed = dir === 'left' || dir === 'up' ? line : line.slice().reverse();
    for (let k = 0; k < G; k++) {
      if (dir === 'left' || dir === 'right') next[i][k] = placed[k];
      else next[k][i] = placed[k];
    }
    const orig = dir === 'left' || dir === 'up' ? src : src.slice().reverse();
    if (orig.some((v, k) => v !== line[k])) moved = true;
  }
  return { grid: next, moved, gained };
}

function canMove2048(grid) {
  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      if (!grid[r][c]) return true;
      if (c + 1 < G && grid[r][c] === grid[r][c + 1]) return true;
      if (r + 1 < G && grid[r][c] === grid[r + 1][c]) return true;
    }
  }
  return false;
}

const maxTile = (grid) => Math.max(...grid.flat());

/** Satu langkah permainan: geser, tambah ubin baru. Return false kalau langkah tidak mengubah apa pun. */
function play2048(state, dir, rnd = rand) {
  const r = move2048(state.grid, dir);
  if (!r.moved) return false;
  state.grid = r.grid;
  state.score += r.gained;
  state.moves++;
  spawn2048(state.grid, rnd);
  if (maxTile(state.grid) >= 2048) state.won = true;
  return true;
}

const REWARD_2048 = [[4096, 6000], [2048, 3000], [1024, 1000], [512, 400], [256, 150], [128, 50]];
const reward2048 = (max) => (REWARD_2048.find(([t]) => max >= t) ?? [0, 0])[1];

// ============================================================ ULAR (Snake)
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

function placeFood(state, rnd = rand) {
  const taken = new Set(state.snake.map((p) => `${p.x},${p.y}`));
  const free = [];
  for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) if (!taken.has(`${x},${y}`)) free.push({ x, y });
  state.food = free.length ? free[rint(free.length, rnd)] : null;
}

function newSnake(size = 8, rnd = rand) {
  const mid = Math.floor(size / 2);
  const s = { size, snake: [{ x: mid, y: mid }, { x: mid - 1, y: mid }], dir: 'right', food: null, score: 0, alive: true, won: false, steps: 0 };
  placeFood(s, rnd);
  return s;
}

/** Maju satu petak ke arah `dir` (arah berlawanan dengan arah sekarang diabaikan). */
function stepSnake(s, dir, rnd = rand) {
  if (!s.alive) return s;
  if (dir && dir !== OPPOSITE[s.dir]) s.dir = dir;
  const [dx, dy] = DIRS[s.dir];
  const head = { x: s.snake[0].x + dx, y: s.snake[0].y + dy };
  const eating = s.food && head.x === s.food.x && head.y === s.food.y;
  const body = eating ? s.snake : s.snake.slice(0, -1); // ekor bergeser kalau tidak makan
  const out = head.x < 0 || head.y < 0 || head.x >= s.size || head.y >= s.size;
  if (out || body.some((p) => p.x === head.x && p.y === head.y)) {
    s.alive = false;
    s.cause = out ? 'tembok' : 'badan sendiri';
    return s;
  }
  s.snake.unshift(head);
  s.steps++;
  if (eating) {
    s.score++;
    placeFood(s, rnd);
    if (!s.food) {
      s.won = true;
      s.alive = false;
    }
  } else s.snake.pop();
  return s;
}

const rewardSnake = (score) => Math.min(600, score * 15);

// ============================================================ LABIRIN
/** Tile grid (2w+1)x(2h+1); true = dinding. Awal (1,1), pintu keluar (2w-1, 2h-1). */
function genMaze(w = 4, h = 4, rnd = rand) {
  const W = 2 * w + 1;
  const H = 2 * h + 1;
  const wall = Array.from({ length: H }, () => Array(W).fill(true));
  const stack = [[0, 0]];
  const seen = new Set(['0,0']);
  wall[1][1] = false;
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const nbrs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]], rnd)
      .map(([dx, dy]) => [cx + dx, cy + dy, dx, dy])
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < w && ny < h && !seen.has(`${nx},${ny}`));
    if (!nbrs.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, dx, dy] = nbrs[0];
    seen.add(`${nx},${ny}`);
    wall[2 * ny + 1][2 * nx + 1] = false;
    wall[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = false;
    stack.push([nx, ny]);
  }
  return { wall, W, H, start: { x: 1, y: 1 }, exit: { x: W - 2, y: H - 2 } };
}

/** Panjang jalur terpendek (BFS) dari start ke exit, atau -1. */
function mazePar(m) {
  const q = [[m.start.x, m.start.y, 0]];
  const seen = new Set([`${m.start.x},${m.start.y}`]);
  while (q.length) {
    const [x, y, d] = q.shift();
    if (x === m.exit.x && y === m.exit.y) return d;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H || m.wall[ny][nx] || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      q.push([nx, ny, d + 1]);
    }
  }
  return -1;
}

function mazeReward(par, steps) {
  const limit = par * 2;
  const eff = limit <= par ? 1 : Math.max(0, Math.min(1, (limit - steps) / (limit - par)));
  return 100 + Math.floor(150 * eff);
}

// ============================================================ SAPU RANJAU (Minesweeper klasik)
const MS = { rows: 4, cols: 5, mines: 4 };

function newMines(rows = MS.rows, cols = MS.cols, mines = MS.mines) {
  return { rows, cols, mines, set: null, revealed: new Set(), flags: new Set(), over: false, won: false, hit: null };
}

const nbrs = (g, r, c) => {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nc >= 0 && nr < g.rows && nc < g.cols) out.push([nr, nc]);
  }
  return out;
};

/** Ranjau baru dipasang saat klik pertama (klik pertama + tetangganya selalu aman kalau muat). */
function placeMines(g, safeR, safeC, rnd = rand) {
  const banned = new Set([`${safeR},${safeC}`]);
  const total = g.rows * g.cols;
  if (total - g.mines > 9) for (const [r, c] of nbrs(g, safeR, safeC)) banned.add(`${r},${c}`);
  const cells = [];
  for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) if (!banned.has(`${r},${c}`)) cells.push(`${r},${c}`);
  g.set = new Set(shuffle(cells, rnd).slice(0, g.mines));
}

const mineCount = (g, r, c) => nbrs(g, r, c).filter(([nr, nc]) => g.set.has(`${nr},${nc}`)).length;

/** Buka sel + sel nol di sekitarnya (flood fill). Mengisi g.revealed. */
function flood(g, r, c) {
  const stack = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop();
    const k = `${cr},${cc}`;
    if (g.revealed.has(k) || g.flags.has(k)) continue;
    g.revealed.add(k);
    if (mineCount(g, cr, cc) === 0) for (const [nr, nc] of nbrs(g, cr, cc)) stack.push([nr, nc]);
  }
}

function revealCell(g, r, c, rnd = rand) {
  if (g.over || g.revealed.has(`${r},${c}`) || g.flags.has(`${r},${c}`)) return g;
  if (!g.set) {
    // klik pertama: pasang ranjau; ulangi kalau klik pertama sudah menuntaskan papan (menang instan = tidak seru)
    for (let attempt = 0; attempt < 50; attempt++) {
      placeMines(g, r, c, rnd);
      flood(g, r, c);
      const instant = g.revealed.size === g.rows * g.cols - g.mines;
      g.revealed.clear();
      if (!instant) break;
    }
  }
  if (g.set.has(`${r},${c}`)) {
    g.over = true;
    g.hit = `${r},${c}`;
    return g;
  }
  flood(g, r, c);
  if (g.revealed.size === g.rows * g.cols - g.mines) {
    g.over = true;
    g.won = true;
  }
  return g;
}

function toggleFlag(g, r, c) {
  const k = `${r},${c}`;
  if (g.over || g.revealed.has(k)) return g;
  if (g.flags.has(k)) g.flags.delete(k);
  else g.flags.add(k);
  return g;
}

// ============================================================ SIMON
const SIMON_COLORS = ['red', 'green', 'blue', 'yellow'];
const simonNext = (seq, rnd = rand) => [...seq, rint(4, rnd)];
const rewardSimon = (level) => Math.min(800, level * level * 5 + level * 10);

// ============================================================ VIDEO POKER (8/5 Jacks or Better)
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANK_TEXT = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const cardText = (c) => `${RANK_TEXT[c.r] ?? c.r}${SUITS[c.s]}`;

function newPokerDeck(rnd = rand) {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
  return shuffle(d, rnd);
}

const POKER_PAY = [
  ['royal', 'Royal Flush', 250], ['sf', 'Straight Flush', 50], ['4k', 'Four of a Kind', 25], ['fh', 'Full House', 8],
  ['flush', 'Flush', 5], ['straight', 'Straight', 4], ['3k', 'Three of a Kind', 3], ['2p', 'Two Pair', 2], ['jb', 'Jacks or Better', 1],
];

function evalPoker(hand) {
  const ranks = hand.map((c) => c.r).sort((a, b) => a - b);
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] ?? 0) + 1;
  const groups = Object.entries(counts).map(([r, n]) => [Number(r), n]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = hand.every((c) => c.s === hand[0].s);
  const uniq = new Set(ranks).size === 5;
  const wheel = uniq && ranks.join() === '2,3,4,5,14';
  const straight = uniq && (ranks[4] - ranks[0] === 4 || wheel);
  let key = 'none';
  if (flush && straight && ranks.join() === '10,11,12,13,14') key = 'royal';
  else if (flush && straight) key = 'sf';
  else if (groups[0][1] === 4) key = '4k';
  else if (groups[0][1] === 3 && groups[1]?.[1] === 2) key = 'fh';
  else if (flush) key = 'flush';
  else if (straight) key = 'straight';
  else if (groups[0][1] === 3) key = '3k';
  else if (groups[0][1] === 2 && groups[1]?.[1] === 2) key = '2p';
  else if (groups[0][1] === 2 && groups[0][0] >= 11) key = 'jb';
  const row = POKER_PAY.find((p) => p[0] === key);
  return { key, name: row ? row[1] : 'Tidak ada', mult: row ? row[2] : 0 };
}

// ============================================================ CRASH
/** Titik crash: P(crash >= x) = 0.96 / x  → RTP 96% untuk strategi cashout apa pun. */
function crashPoint(rnd = rand) {
  const u = rnd();
  return Math.max(1, Math.floor((0.96 / (1 - u)) * 100) / 100);
}
/** Pengali pada detak ke-k (1 detak ≈ 1,2 detik). */
const crashMult = (k) => Math.floor((1 + 0.15 * k + 0.02 * k * k) * 100) / 100;

module.exports = {
  rng, rand, rint, shuffle,
  G, new2048, spawn2048, slideLine, move2048, canMove2048, maxTile, play2048, reward2048,
  DIRS, OPPOSITE, newSnake, stepSnake, placeFood, rewardSnake,
  genMaze, mazePar, mazeReward,
  MS, newMines, placeMines, mineCount, revealCell, toggleFlag, nbrs,
  SIMON_COLORS, simonNext, rewardSimon,
  SUITS, cardText, newPokerDeck, evalPoker, POKER_PAY,
  crashPoint, crashMult,
};
