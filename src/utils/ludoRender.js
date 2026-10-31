'use strict';

/**
 * Gambar papan Ludo (opsional, butuh @napi-rs/canvas — sama seperti papan Monopoly).
 * Kalau paket tidak ada, renderBoard() mengembalikan null dan Ludo memakai papan emoji.
 */
let canvasLib = null;
try {
  canvasLib = require('@napi-rs/canvas');
} catch {
  /* opsional */
}

const L = require('./ludoEngine');

const CELL = 52;
const PAD = 14;
const SIZE = 15 * CELL + PAD * 2;
const FONT = 'sans-serif';

const THEMES = {
  klasik: {
    id: 'klasik', name: 'Klasik', emoji: '🎨', bg: '#efe6d2', frame: '#5d4b2f', track: '#fffdf6', trackLine: '#9a8a68', baseInner: '#fffdf6',
    colors: ['#e53935', '#43a047', '#fdd835', '#1e88e5'], text: '#2b2418', dark: false,
  },
  hutan: {
    id: 'hutan', name: 'Hutan', emoji: '🌳', bg: '#cfe3c4', frame: '#2e4a2a', track: '#f6fbef', trackLine: '#6b8a5a', baseInner: '#f1f8e8',
    colors: ['#d84315', '#2e7d32', '#f9a825', '#1565c0'], text: '#1d3a1b', dark: false,
  },
  samudra: {
    id: 'samudra', name: 'Samudra', emoji: '🌊', bg: '#bfe3ef', frame: '#134e6f', track: '#f3fcff', trackLine: '#5b95ad', baseInner: '#eaf8ff',
    colors: ['#ef5350', '#26a69a', '#ffca28', '#1976d2'], text: '#0d3550', dark: false,
  },
  neon: {
    id: 'neon', name: 'Neon', emoji: '🌌', bg: '#0e1022', frame: '#7c4dff', track: '#1b1e3a', trackLine: '#4a4f9a', baseInner: '#14172e',
    colors: ['#ff3d6e', '#2effa0', '#ffe94d', '#3da5ff'], text: '#e8ecff', dark: true,
  },
};

const getTheme = (id) => THEMES[id] ?? THEMES.klasik;

const px = (c) => PAD + c * CELL;

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function star(ctx, cx, cy, R, r) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const rad = k % 2 === 0 ? R : r;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
const shade = (hex, amt) => {
  const [r, g, b] = hexToRgb(hex).map((v) => Math.max(0, Math.min(255, v + amt)));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

function text(ctx, str, x, y, size, color, { bold = true, maxW = 0 } = {}) {
  let sz = size;
  ctx.font = `${bold ? 'bold ' : ''}${sz}px ${FONT}`;
  if (maxW) while (sz > 8 && ctx.measureText(str).width > maxW) {
    sz -= 1;
    ctx.font = `${bold ? 'bold ' : ''}${sz}px ${FONT}`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}

function drawPawn(ctx, x, y, r, color, label, { ring = false } = {}) {
  ctx.save();
  if (ring) {
    ctx.shadowColor = '#ffd54a';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(x, y, r + 6, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffd54a';
    ctx.stroke();
  }
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(color, 70));
  g.addColorStop(1, color);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.stroke();
  if (label) text(ctx, label, x, y + 1, Math.round(r * 1.1), '#ffffff');
}

function drawDie(ctx, cx, cy, size, value) {
  const x = cx - size / 2;
  const y = cy - size / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  rr(ctx, x, y, size, size, 10);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2.5;
  rr(ctx, x, y, size, size, 10);
  ctx.stroke();
  const o = size / 4;
  const pos = { l: x + o, c: cx, r: x + size - o, t: y + o, m: cy, b: y + size - o };
  const pips = {
    1: [['c', 'm']], 2: [['l', 't'], ['r', 'b']], 3: [['l', 't'], ['c', 'm'], ['r', 'b']],
    4: [['l', 't'], ['r', 't'], ['l', 'b'], ['r', 'b']], 5: [['l', 't'], ['r', 't'], ['c', 'm'], ['l', 'b'], ['r', 'b']],
    6: [['l', 't'], ['r', 't'], ['l', 'm'], ['r', 'm'], ['l', 'b'], ['r', 'b']],
  }[value] ?? [];
  ctx.fillStyle = value === 1 ? '#d62828' : '#111';
  for (const [a, b] of pips) {
    ctx.beginPath();
    ctx.arc(pos[a], pos[b], size / 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

const OFFSETS = {
  1: [[0, 0]],
  2: [[-0.2, 0], [0.2, 0]],
  3: [[-0.2, -0.14], [0.2, -0.14], [0, 0.2]],
  4: [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]],
};

/**
 * @param {object} s state dari ludoEngine
 * @param {number[]} highlight indeks pion giliran sekarang yang boleh dipilih
 * @param {object} [lib] (untuk tes) pengganti @napi-rs/canvas
 * @returns {Buffer|null} PNG
 */
function renderBoard(s, highlight = [], lib = canvasLib) {
  if (!lib) return null;
  const th = getTheme(s.theme);
  const canvas = lib.createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  const used = new Map(s.players.map((p) => [p.color, p]));

  // latar + bingkai
  ctx.fillStyle = th.frame;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = th.bg;
  rr(ctx, 5, 5, SIZE - 10, SIZE - 10, 18);
  ctx.fill();

  // basis 6x6
  L.COLORS.forEach((_, ci) => {
    const [r0, c0] = L.BASE_RECT[ci];
    const color = th.colors[ci];
    const owner = used.get(ci);
    const active = owner && !owner.out;
    ctx.save();
    ctx.globalAlpha = active ? 1 : 0.28;
    ctx.fillStyle = color;
    rr(ctx, px(c0), px(r0), CELL * 6, CELL * 6, 22);
    ctx.fill();
    ctx.fillStyle = th.baseInner;
    rr(ctx, px(c0) + CELL * 0.9, px(r0) + CELL * 0.9, CELL * 4.2, CELL * 4.2, 18);
    ctx.fill();
    for (const [r, c] of L.BASE_SLOTS[ci]) {
      ctx.beginPath();
      ctx.arc(px(c) + CELL / 2, px(r) + CELL / 2, CELL * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = rgba(color, 0.22);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba(color, 0.7);
      ctx.stroke();
    }
    ctx.restore();

    // nama pemain + titik finish
    if (owner) {
      const cx = px(c0) + CELL * 3;
      text(ctx, `${owner.bot ? '🤖 ' : ''}${owner.name}`.replace('🤖 ', '[BOT] '), cx, px(r0) + CELL * 1.45, 17, owner.out ? '#888' : shade(color, th.dark ? 40 : -45), { maxW: CELL * 3.8 });
      const n = owner.pawns.length;
      const done = L.finishedCount(owner);
      for (let k = 0; k < n; k++) {
        const dx = cx + (k - (n - 1) / 2) * 24;
        ctx.beginPath();
        ctx.arc(dx, px(r0) + CELL * 4.55, 8, 0, Math.PI * 2);
        ctx.fillStyle = k < done ? color : rgba(color, 0.18);
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    }
  });

  // jalur utama
  L.TRACK.forEach(([r, c], k) => {
    const ci = L.COLORS.findIndex((_, i) => k === L.startIndex(i));
    ctx.fillStyle = ci >= 0 ? th.colors[ci] : th.track;
    rr(ctx, px(c) + 1.5, px(r) + 1.5, CELL - 3, CELL - 3, 7);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = th.trackLine;
    ctx.stroke();
    if (L.SAFE.has(k)) {
      star(ctx, px(c) + CELL / 2, px(r) + CELL / 2, CELL * 0.3, CELL * 0.13);
      ctx.fillStyle = ci >= 0 ? '#ffffff' : '#f0a500';
      ctx.fill();
    }
  });
  // jalur rumah
  L.HOME_COL.forEach((col, ci) => {
    col.forEach(([r, c]) => {
      ctx.fillStyle = th.colors[ci];
      rr(ctx, px(c) + 1.5, px(r) + 1.5, CELL - 3, CELL - 3, 7);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = shade(th.colors[ci], -50);
      ctx.stroke();
    });
  });

  // pusat: 4 segitiga
  const x0 = px(6);
  const y0 = px(6);
  const m = CELL * 1.5;
  const tri = (pts, color) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    ctx.lineTo(pts[1][0], pts[1][1]);
    ctx.lineTo(pts[2][0], pts[2][1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = th.trackLine;
    ctx.stroke();
  };
  const cx0 = x0 + m;
  const cy0 = y0 + m;
  const a = CELL * 3;
  tri([[x0, y0], [x0, y0 + a], [cx0, cy0]], th.colors[0]); // kiri = merah
  tri([[x0, y0], [x0 + a, y0], [cx0, cy0]], th.colors[1]); // atas = hijau
  tri([[x0 + a, y0], [x0 + a, y0 + a], [cx0, cy0]], th.colors[2]); // kanan = kuning
  tri([[x0, y0 + a], [x0 + a, y0 + a], [cx0, cy0]], th.colors[3]); // bawah = biru

  // sorot basis pemain yang sedang jalan
  const curP = s.players[s.turn];
  if (curP && s.phase !== 'over') {
    const [r0, c0] = L.BASE_RECT[curP.color];
    ctx.save();
    ctx.shadowColor = th.colors[curP.color];
    ctx.shadowBlur = 22;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#ffffff';
    rr(ctx, px(c0) + 3, px(r0) + 3, CELL * 6 - 6, CELL * 6 - 6, 20);
    ctx.stroke();
    ctx.restore();
  }

  // pion
  const cells = new Map();
  s.players.forEach((p, pi) => {
    if (p.out) return;
    p.pawns.forEach((pos, i) => {
      const [r, c] = L.pawnCell(p, pos, i);
      const key = `${r},${c}`;
      if (!cells.has(key)) cells.set(key, { r, c, list: [] });
      cells.get(key).list.push({ pi, i, color: p.color, isCur: pi === s.turn, canMove: pi === s.turn && s.phase === 'move' && highlight.includes(i) });
    });
  });
  const draws = [];
  for (const { r, c, list } of cells.values()) {
    const n = Math.min(list.length, 4);
    const offs = OFFSETS[n];
    const rad = n === 1 ? CELL * 0.34 : n === 2 ? CELL * 0.27 : CELL * 0.23;
    list.slice(0, 4).forEach((d, k) => {
      draws.push({ x: px(c) + CELL / 2 + offs[k][0] * CELL, y: px(r) + CELL / 2 + offs[k][1] * CELL, rad, ...d, extra: list.length - 4 });
    });
  }
  draws.sort((p, q) => Number(p.canMove) - Number(q.canMove) || Number(p.isCur) - Number(q.isCur));
  for (const d of draws) {
    drawPawn(ctx, d.x, d.y, d.rad, th.colors[d.color], d.isCur ? String(d.i + 1) : '', { ring: d.canMove });
  }

  // dadu di tengah
  if (s.roll) drawDie(ctx, px(7) + CELL / 2, px(7) + CELL / 2, 50, s.roll);

  return canvas.toBuffer('image/png');
}

const isAvailable = () => canvasLib !== null;

module.exports = { renderBoard, isAvailable, THEMES, getTheme };
