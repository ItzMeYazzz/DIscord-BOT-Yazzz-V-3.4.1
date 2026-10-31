'use strict';

/**
 * Gambar papan Monopoly dengan @napi-rs/canvas (opsional, sama seperti kartu rank).
 * Tampilan mengikuti peta yang dipilih (s.map.theme): warna papan, nama petak, ikon, judul tengah.
 * Kalau paket tidak ada, renderBoard() mengembalikan null dan UI memakai tampilan teks.
 */
let canvasLib = null;
try {
  canvasLib = require('@napi-rs/canvas');
} catch {
  /* opsional */
}

const S = 1040; // ukuran kanvas
const C = 128; // sisi petak sudut
const W = (S - 2 * C) / 9; // lebar petak biasa
const FONT = 'sans-serif';
const BAND = 26;

const PLAYER_COLORS = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#8e44ad', '#e9c46a'];

function rectOf(i) {
  if (i === 0) return { x: S - C, y: S - C, w: C, h: C, side: 'corner' };
  if (i < 10) return { x: S - C - i * W, y: S - C, w: W, h: C, side: 'bottom' };
  if (i === 10) return { x: 0, y: S - C, w: C, h: C, side: 'corner' };
  if (i < 20) return { x: 0, y: S - C - (i - 10) * W, w: C, h: W, side: 'left' };
  if (i === 20) return { x: 0, y: 0, w: C, h: C, side: 'corner' };
  if (i < 30) return { x: C + (i - 21) * W, y: 0, w: W, h: C, side: 'top' };
  if (i === 30) return { x: S - C, y: 0, w: C, h: C, side: 'corner' };
  return { x: S - C, y: C + (i - 31) * W, w: C, h: W, side: 'right' };
}

function bandRect(r) {
  switch (r.side) {
    case 'bottom': return { x: r.x, y: r.y, w: r.w, h: BAND };
    case 'top': return { x: r.x, y: r.y + r.h - BAND, w: r.w, h: BAND };
    case 'left': return { x: r.x + r.w - BAND, y: r.y, w: BAND, h: r.h };
    case 'right': return { x: r.x, y: r.y, w: BAND, h: r.h };
    default: return null;
  }
}

function wrap(ctx, text, maxW) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !line) line = t;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function centerText(ctx, text, cx, cy, size, { bold = false, color = '#1b2a1b', maxW = 0 } = {}) {
  let sz = size;
  ctx.font = `${bold ? 'bold ' : ''}${sz}px ${FONT}`;
  if (maxW) while (sz > 8 && ctx.measureText(text).width > maxW) {
    sz -= 1;
    ctx.font = `${bold ? 'bold ' : ''}${sz}px ${FONT}`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy);
}

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawDie(ctx, x, y, size, value) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  rr(ctx, x, y, size, size, 14);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  rr(ctx, x, y, size, size, 14);
  ctx.stroke();
  const o = size / 4;
  const pos = { l: x + o, c: x + size / 2, r: x + size - o, t: y + o, m: y + size / 2, b: y + size - o };
  const pips = {
    1: [['c', 'm']], 2: [['l', 't'], ['r', 'b']], 3: [['l', 't'], ['c', 'm'], ['r', 'b']],
    4: [['l', 't'], ['r', 't'], ['l', 'b'], ['r', 'b']], 5: [['l', 't'], ['r', 't'], ['c', 'm'], ['l', 'b'], ['r', 'b']],
    6: [['l', 't'], ['r', 't'], ['l', 'm'], ['r', 'm'], ['l', 'b'], ['r', 'b']],
  }[value] ?? [];
  ctx.fillStyle = value === 1 ? '#d62828' : '#111';
  for (const [px, py] of pips) {
    ctx.beginPath();
    ctx.arc(pos[px], pos[py], size / 10, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * @param {object} s state dari monopolyEngine (s.map = peta aktif)
 * @param {object} [lib] (untuk tes) pengganti @napi-rs/canvas
 * @returns {Buffer|null} PNG
 */
function renderBoard(s, lib = canvasLib) {
  if (!lib) return null;
  const map = s.map;
  const th = map.theme;
  const dark = luminance(th.tile) < 0.4;
  const accent = dark
    ? { chance: '#ffb454', chest: '#6cb8ff', tax: '#ff8a8a' }
    : { chance: '#e67e22', chest: '#2980b9', tax: '#a33333' };

  const canvas = lib.createCanvas(S, S);
  const ctx = canvas.getContext('2d');

  // latar & bingkai
  ctx.fillStyle = th.bg;
  ctx.fillRect(0, 0, S, S);
  const grad = ctx.createLinearGradient(C, C, S - C, S - C);
  grad.addColorStop(0, th.center);
  grad.addColorStop(1, th.bg);
  ctx.fillStyle = grad;
  ctx.fillRect(C, C, S - 2 * C, S - 2 * C);

  // petak
  for (const sq of map.board) {
    const r = rectOf(sq.index);
    ctx.fillStyle = th.tile;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = th.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const band = bandRect(r);
    if (band && sq.type === 'property') {
      ctx.fillStyle = map.groups[sq.group].color;
      ctx.fillRect(band.x, band.y, band.w, band.h);
      ctx.strokeRect(band.x, band.y, band.w, band.h);
    }

    if (r.side === 'corner') {
      ctx.font = `bold 22px ${FONT}`;
      const lines = wrap(ctx, sq.name.toUpperCase(), r.w - 20).slice(0, 2);
      lines.forEach((ln, k) => centerText(ctx, ln, cx, r.y + 30 + k * 26, 22, { bold: true, maxW: r.w - 16, color: th.text }));
      let sub = '';
      if (sq.type === 'go') sub = `+$${map.goSalary} ➜`;
      else if (sq.type === 'jail') sub = 'Cuma mampir';
      else if (sq.type === 'parking' && map.parkingPot) sub = `Kas: $${s.pot ?? 0}`;
      if (sub) {
        const sy = sq.type === 'jail' ? r.y + r.h - 18 : r.y + 30 + lines.length * 26 - 2;
        centerText(ctx, sub, cx, sy, 15, { maxW: r.w - 16, color: sq.type === 'parking' ? '#d4a017' : th.sub, bold: sq.type === 'parking' });
      }
    } else {
      // area teks aman: sisihkan band warna (sisi dalam) dan strip pemilik (sisi luar)
      const STRIP = 11;
      let x0 = r.x + 3, x1 = r.x + r.w - 3, y0 = r.y + 4, y1 = r.y + r.h - 4;
      if (r.side === 'bottom') { y0 = r.y + BAND + 4; y1 = r.y + r.h - STRIP - 3; }
      if (r.side === 'top') { y0 = r.y + STRIP + 4; y1 = r.y + r.h - BAND - 4; }
      if (r.side === 'left') { x0 = r.x + STRIP + 3; x1 = r.x + r.w - BAND - 3; }
      if (r.side === 'right') { x0 = r.x + BAND + 3; x1 = r.x + r.w - STRIP - 3; }
      const tcx = (x0 + x1) / 2;
      const innerW = x1 - x0;

      ctx.font = `bold 13px ${FONT}`;
      const lines = wrap(ctx, sq.name, innerW).slice(0, 3);
      const color = sq.type === 'chance' ? accent.chance : sq.type === 'chest' ? accent.chest : sq.type === 'tax' ? accent.tax : th.text;
      const firstY = y0 + 8;
      lines.forEach((ln, k) => centerText(ctx, ln, tcx, firstY + k * 14, 13, { bold: true, color, maxW: innerW }));
      const namesEnd = firstY + (lines.length - 1) * 14 + 9;

      const price = sq.price ?? sq.amount;
      const priceY = y1 - 7;
      if (price) centerText(ctx, `$${price}`, tcx, priceY, 13, { color: sq.type === 'tax' ? accent.tax : th.price });

      // ikon di sisa ruang di antara nama dan harga
      const freeTop = namesEnd;
      const freeBottom = price ? priceY - 9 : y1;
      const space = freeBottom - freeTop;
      const iconY = (freeTop + freeBottom) / 2;
      if (space >= 20) {
        const size = Math.min(sq.type === 'chance' ? 34 : 26, Math.floor(space));
        if (sq.type === 'chance') centerText(ctx, '?', tcx, iconY, size, { bold: true, color: accent.chance });
        if (sq.type === 'chest') centerText(ctx, '✚', tcx, iconY, Math.min(size, 28), { bold: true, color: accent.chest });
        if (sq.type === 'rail') centerText(ctx, th.railIcon, tcx, iconY, Math.min(size, 22), { bold: true, color: dark ? '#cfd6ff' : '#444' });
        if (sq.type === 'util') centerText(ctx, sq.icon ?? '⚡', tcx, iconY, Math.min(size, 24), { bold: true, color: '#d4a017' });
      }
    }

    // kepemilikan
    const o = s.owner[sq.index];
    if (o !== null && o !== undefined) {
      ctx.fillStyle = PLAYER_COLORS[o % PLAYER_COLORS.length];
      if (r.side === 'bottom') ctx.fillRect(r.x, r.y + r.h - 11, r.w, 11);
      else if (r.side === 'top') ctx.fillRect(r.x, r.y, r.w, 11);
      else if (r.side === 'left') ctx.fillRect(r.x, r.y, 11, r.h);
      else if (r.side === 'right') ctx.fillRect(r.x + r.w - 11, r.y, 11, r.h);
    }
    if (s.mortgaged[sq.index]) {
      ctx.fillStyle = 'rgba(40,40,40,0.6)';
      ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      centerText(ctx, 'GADAI', cx, r.y + r.h / 2, 16, { bold: true, color: '#fff' });
    }
    const h = s.houses[sq.index];
    if (h > 0 && band) {
      const horizontal = r.side === 'bottom' || r.side === 'top';
      if (h === 5) {
        ctx.fillStyle = '#d62828';
        const hw = 26, hh = 16;
        ctx.fillRect(band.x + band.w / 2 - (horizontal ? hw / 2 : hh / 2), band.y + band.h / 2 - (horizontal ? hh / 2 : hw / 2), horizontal ? hw : hh, horizontal ? hh : hw);
      } else {
        ctx.fillStyle = '#1e9d3a';
        for (let k = 0; k < h; k++) {
          const sz = 13;
          const off = (k - (h - 1) / 2) * (sz + 3);
          const x = horizontal ? band.x + band.w / 2 + off - sz / 2 : band.x + band.w / 2 - sz / 2;
          const y = horizontal ? band.y + band.h / 2 - sz / 2 : band.y + band.h / 2 + off - sz / 2;
          ctx.fillRect(x, y, sz, sz);
          ctx.strokeStyle = '#0b4';
          ctx.strokeRect(x, y, sz, sz);
        }
      }
    }
  }

  // sorot petak pemain yang sedang jalan
  const turnP = s.players[s.turn];
  if (turnP && !turnP.bankrupt && s.phase !== 'over') {
    const r = rectOf(turnP.pos);
    ctx.save();
    ctx.shadowColor = PLAYER_COLORS[s.turn % PLAYER_COLORS.length];
    ctx.shadowBlur = 18;
    ctx.lineWidth = 5;
    ctx.strokeStyle = PLAYER_COLORS[s.turn % PLAYER_COLORS.length];
    ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
    ctx.restore();
  }

  // tengah papan
  const mid = S / 2;
  ctx.save();
  ctx.translate(mid, mid - 200);
  ctx.rotate(-Math.PI / 18);
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = th.title;
  ctx.fillRect(-300, -52, 600, 104);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = th.titleText;
  ctx.lineWidth = 3;
  ctx.strokeRect(-292, -44, 584, 88);
  centerText(ctx, 'MONOPOLI', 0, 4, 78, { bold: true, color: th.titleText });
  ctx.restore();
  centerText(ctx, `${map.subtitle}  •  ${map.name}`, mid, mid - 60, 24, { color: th.sub, bold: true, maxW: 560 });

  if (s.dice?.[0]) {
    drawDie(ctx, mid - 100, mid - 30, 84, s.dice[0]);
    drawDie(ctx, mid + 16, mid - 30, 84, s.dice[1]);
  }
  if (s.lastCard) {
    const text = s.lastCard.text.replaceAll('**', '');
    ctx.font = `15px ${FONT}`;
    const lines = wrap(ctx, text, 400).slice(0, 3);
    ctx.fillStyle = s.lastCard.deck === 'chance' ? (dark ? '#4a3a1f' : '#fde9c8') : (dark ? '#1f3a52' : '#d6ecfb');
    ctx.strokeStyle = th.line;
    ctx.lineWidth = 2;
    rr(ctx, mid - 220, mid + 78, 440, 40 + lines.length * 20, 14);
    ctx.fill();
    ctx.stroke();
    const deckName = s.lastCard.deck === 'chance' ? (map.labels.chance ?? 'Kesempatan') : (map.labels.chest ?? 'Dana Umum');
    centerText(ctx, deckName.toUpperCase(), mid, mid + 96, 14, { bold: true, color: th.text });
    lines.forEach((ln, k) => centerText(ctx, ln, mid, mid + 118 + k * 20, 15, { color: th.text, maxW: 420 }));
  }

  // jackpot parkir & info ronde
  if (map.parkingPot) {
    const potText = `🅿 JACKPOT PARKIR  $${s.pot ?? 0}`.replace('🅿 ', '');
    ctx.fillStyle = '#d4a017';
    rr(ctx, mid - 190, S - C - 96, 380, 44, 22);
    ctx.fill();
    centerText(ctx, potText, mid, S - C - 74, 24, { bold: true, color: '#3b2a00', maxW: 350 });
  }
  const roundText = `Ronde ${Math.min((s.rounds ?? 0) + 1, s.maxRounds || 999)}${s.maxRounds ? `/${s.maxRounds}` : ''}`;
  centerText(ctx, roundText, mid, S - C - 28, 20, { color: th.sub, bold: true });

  // pion: diletakkan di tepi dalam petak supaya tidak menutupi nama & harga
  const bySquare = new Map();
  s.players.forEach((p, i) => {
    if (p.bankrupt) return;
    if (!bySquare.has(p.pos)) bySquare.set(p.pos, []);
    bySquare.get(p.pos).push(i);
  });
  for (const [pos, list] of bySquare) {
    const r = rectOf(pos);
    const per = 3;
    list.forEach((pi, k) => {
      const col = k % per;
      const row = Math.floor(k / per);
      const along = (col - (Math.min(list.length, per) - 1) / 2) * 30;
      const depth = 15 + row * 30;
      const cxr = r.x + r.w / 2;
      const cyr = r.y + r.h / 2;
      let px;
      let py;
      if (r.side === 'bottom') { px = cxr + along; py = r.y + depth; }
      else if (r.side === 'top') { px = cxr + along; py = r.y + r.h - depth; }
      else if (r.side === 'left') { px = r.x + r.w - depth; py = cyr + along; }
      else if (r.side === 'right') { px = r.x + depth; py = cyr + along; }
      else if (pos === 10) {
        const p = s.players[pi];
        px = p.inJail ? cxr + (col - 1) * 28 : r.x + 22 + col * 24;
        py = p.inJail ? cyr - 4 + row * 28 : r.y + r.h - 20 - row * 26;
      } else {
        px = cxr + along;
        py = r.y + r.h - 22 - row * 30;
      }
      const isTurn = pi === s.turn;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.beginPath();
      ctx.arc(px, py, 15, 0, Math.PI * 2);
      ctx.fillStyle = PLAYER_COLORS[pi % PLAYER_COLORS.length];
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(px, py, 15, 0, Math.PI * 2);
      ctx.lineWidth = isTurn ? 4 : 2;
      ctx.strokeStyle = isTurn ? '#ffffff' : '#222';
      ctx.stroke();
      if (isTurn) {
        ctx.beginPath();
        ctx.arc(px, py, 18, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#111';
        ctx.stroke();
      }
      centerText(ctx, String(pi + 1), px, py + 1, 16, { bold: true, color: '#fff' });
    });
  }

  return canvas.toBuffer('image/png');
}

const isAvailable = () => canvasLib !== null;

module.exports = { renderBoard, isAvailable, PLAYER_COLORS };
