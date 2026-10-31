'use strict';

/**
 * Kartu rank bergambar. Memakai @napi-rs/canvas (opsional).
 * Kalau paket belum terpasang / gagal dimuat, renderRankCard() mengembalikan null
 * dan command /rank otomatis memakai embed biasa.
 */
let canvasLib = null;
try {
  canvasLib = require('@napi-rs/canvas');
} catch {
  /* opsional */
}

const FONT = 'sans-serif';
const nf = (n) => Number(n).toLocaleString('id-ID');

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, v + amount));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
}

async function loadAvatar(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await canvasLib.loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

const isAvailable = () => canvasLib !== null;

/**
 * @param {{username:string, avatarUrl:string, level:number, rank:number, current:number,
 *          needed:number, percent:number, totalXp:number, messages:number, voiceMinutes:number, color:string}} d
 * @returns {Promise<Buffer|null>}
 */
async function renderRankCard(d) {
  if (!canvasLib) return null;
  try {
    const W = 934;
    const H = 282;
    const accent = d.color || '#5865f2';
    const canvas = canvasLib.createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // latar
    roundRect(ctx, 0, 0, W, H, 28);
    ctx.clip();
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#16171f');
    bg.addColorStop(1, '#2a2d44');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // dekorasi lingkaran
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(W - 40, -10, 190, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(120, H + 70, 150, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // panel kaca
    roundRect(ctx, 18, 18, W - 36, H - 36, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.stroke();

    // avatar + ring
    const cx = 130;
    const cy = H / 2;
    const r = 78;
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
    ctx.fillStyle = accent; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = '#16171f'; ctx.fill();
    const avatar = await loadAvatar(d.avatarUrl);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
    if (avatar) ctx.drawImage(avatar, cx - r, cy - r, r * 2, r * 2);
    else { ctx.fillStyle = '#40444b'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); }
    ctx.restore();

    const left = 250;
    const right = W - 52;

    // rank & level (kanan atas)
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.font = `bold 54px ${FONT}`;
    const lvlText = String(d.level);
    ctx.fillText(lvlText, right, 92);
    const lvlW = ctx.measureText(lvlText).width;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('LEVEL', right - lvlW - 10, 92);
    const rankLabelX = right - lvlW - 10 - ctx.measureText('LEVEL').width - 34;
    ctx.font = `bold 54px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    const rankText = `#${d.rank}`;
    ctx.fillText(rankText, rankLabelX, 92);
    const rankW = ctx.measureText(rankText).width;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText('RANK', rankLabelX - rankW - 10, 92);

    // nama
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold 38px ${FONT}`;
    const nameMax = Math.max(120, rankLabelX - rankW - 110 - left);
    ctx.fillText(fitText(ctx, d.username, nameMax), left, 92);

    // statistik kecil
    ctx.font = `500 20px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`${nf(d.messages)} pesan  •  ${nf(d.voiceMinutes)} menit voice`, left, 128);

    // teks xp
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(`Total ${nf(d.totalXp)} XP`, left, 178);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${nf(d.current)} / ${nf(d.needed)} XP`, right, 178);

    // progress bar
    const barX = left;
    const barY = 192;
    const barW = right - left;
    const barH = 38;
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    const fillW = Math.max(barH, barW * d.percent);
    ctx.save();
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.clip();
    const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
    grad.addColorStop(0, shade(accent, -30));
    grad.addColorStop(1, shade(accent, 50));
    roundRect(ctx, barX, barY, fillW, barH, barH / 2);
    ctx.fillStyle = grad;
    ctx.fill();
    // kilau
    roundRect(ctx, barX, barY, fillW, barH / 2, barH / 4);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.floor(d.percent * 100)}%`, barX + barW / 2, barY + 26);

    return canvas.toBuffer('image/png');
  } catch (err) {
    console.warn('[rankcard] gagal membuat kartu:', err.message);
    return null;
  }
}

module.exports = { renderRankCard, isAvailable };
