'use strict';

/** Game kata & angka: Tebak Angka, Hangman, Wordle, Cepat Hitung, Acak Kata. */

const { StringSelectMenuBuilder, ActionRowBuilder, MessageFlags } = require('discord.js');
const L = require('../utils/miniLogic');
const D = require('../utils/miniData');
const C = require('./common');
const { btn, row, embed, open, ephemeral, ButtonStyle: S, eco, config } = C;

// ======================================================= TEBAK ANGKA (grup)
async function tebakangka(interaction) {
  const unlock = await C.lockChannel(interaction, 'Tebak Angka');
  if (!unlock) return;
  const secret = L.rnd(100) + 1;
  const MAX = 10;
  let lo = 1, hi = 100, tries = 0, over = false;
  const hist = [];

  const view = (note = '', won = null) => ({
    embeds: [embed('🔢 Tebak Angka', `Aku memikirkan angka **1–100**. Semua boleh menebak!\nRentang sekarang: **${lo} – ${hi}** • Sisa percobaan: **${MAX - tries}**\n\n${hist.slice(-8).join('\n') || '_Belum ada tebakan._'}${note ? `\n\n${note}` : ''}`, won ? config.colors.success : config.colors.main)],
    components: [row(btn('mini:ta:guess', 'Tebak', S.Primary, '🎯', over))],
  });
  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 120_000, filter: (i) => i.customId === 'mini:ta:guess' });

  col.on('collect', async (i) => {
    if (over) return i.deferUpdate().catch(() => {});
    const sub = await C.askModal(i, { id: `mini:ta:m:${i.user.id}`, title: 'Tebak angka 1–100', fields: [{ id: 'n', label: 'Angkamu', max: 3, placeholder: 'mis. 42' }] });
    if (!sub || over) return;
    const n = parseInt(sub.fields.getTextInputValue('n'), 10);
    if (!Number.isInteger(n) || n < 1 || n > 100) return sub.reply({ content: 'Masukkan angka 1–100.', flags: MessageFlags.Ephemeral }).catch(() => {});
    tries++;
    if (n === secret) {
      over = true;
      const prize = 400 + (MAX - tries) * 100;
      C.reward(interaction.guildId, i.user.id, prize);
      hist.push(`🎯 <@${i.user.id}> menebak **${n}** — BENAR!`);
      col.stop('done');
      return sub.update(view(`🏆 <@${i.user.id}> menang! Angkanya **${secret}**.\n💰 Hadiah **${eco.coins(prize)}**`, true)).catch(() => {});
    }
    if (n < secret) lo = Math.max(lo, n + 1); else hi = Math.min(hi, n - 1);
    hist.push(`${n < secret ? '⬆️ lebih besar' : '⬇️ lebih kecil'} dari **${n}** — <@${i.user.id}>`);
    if (tries >= MAX) {
      over = true;
      col.stop('done');
      return sub.update(view(`💀 Kesempatan habis! Angkanya **${secret}**.`)).catch(() => {});
    }
    return sub.update(view()).catch(() => {});
  });
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'idle' && !over) {
      over = true;
      msg.edit(view(`⌛ Waktu habis. Angkanya **${secret}**.`)).catch(() => {});
    }
  });
}

// ======================================================= HANGMAN (grup)
const GALLOWS = ['😀', '😐', '😟', '😨', '😰', '😱', '💀'];
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('');
async function hangman(interaction) {
  const unlock = await C.lockChannel(interaction, 'Tebak Kata');
  if (!unlock) return;
  const cat = L.pick(Object.keys(D.WORDS));
  const word = L.pick(D.WORDS[cat]);
  const guessed = new Set();
  const contributors = new Map(); // userId -> huruf benar
  const MAX_WRONG = 6;
  let over = false, won = false;
  const wrong = () => [...guessed].filter((c) => !word.includes(c));

  const view = (note = '') => {
    const shown = [...word].map((c) => (guessed.has(c) || over ? `**${c.toUpperCase()}**` : '＿')).join(' ');
    const rest = ALPHA.filter((c) => !guessed.has(c));
    const menus = [rest.slice(0, 13), rest.slice(13)].filter((g) => g.length).map((g, k) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`mini:hm:${k}`).setPlaceholder(k ? 'Huruf N–Z…' : 'Huruf A–M…').setDisabled(over)
          .addOptions(g.map((c) => ({ label: c.toUpperCase(), value: c }))),
      ));
    return {
      embeds: [embed('🪢 Tebak Kata', `Kategori: **${cat}** • ${word.length} huruf\n\n${GALLOWS[wrong().length]}  ${shown}\n\nSalah (${wrong().length}/${MAX_WRONG}): ${wrong().map((c) => c.toUpperCase()).join(' ') || '—'}${note ? `\n\n${note}` : ''}`, won ? config.colors.success : over ? config.colors.error : config.colors.main)],
      components: over ? [] : menus,
    };
  };
  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 150_000, filter: (i) => i.customId.startsWith('mini:hm:') });

  col.on('collect', async (i) => {
    if (over) return i.deferUpdate().catch(() => {});
    const c = i.values[0];
    if (guessed.has(c)) return i.deferUpdate().catch(() => {});
    guessed.add(c);
    if (word.includes(c)) contributors.set(i.user.id, (contributors.get(i.user.id) ?? 0) + 1);
    if ([...word].every((x) => guessed.has(x))) {
      over = won = true;
      const list = [...contributors.keys()];
      list.forEach((id) => C.reward(interaction.guildId, id, 400));
      col.stop('done');
      return i.update(view(`🎉 Kata terjawab: **${word.toUpperCase()}**!\n💰 Setiap yang menyumbang huruf benar dapat **${eco.coins(400)}** (${list.map((id) => `<@${id}>`).join(', ')})`)).catch(() => {});
    }
    if (wrong().length >= MAX_WRONG) {
      over = true;
      col.stop('done');
      return i.update(view(`💀 Kalah! Katanya **${word.toUpperCase()}**.`)).catch(() => {});
    }
    return i.update(view(`<@${i.user.id}> memilih **${c.toUpperCase()}** ${word.includes(c) ? '✅' : '❌'}`)).catch(() => {});
  });
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'idle' && !over) {
      over = true;
      msg.edit(view(`⌛ Waktu habis. Katanya **${word.toUpperCase()}**.`)).catch(() => {});
    }
  });
}

// ======================================================= WORDLE (sendiri)
const WL = { g: '🟩', y: '🟨', x: '⬛' };
async function wordle(interaction) {
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  const answer = L.pick(D.WORDLE);
  const rows = [];
  const used = new Map(); // huruf -> status terbaik
  let over = false, won = false;
  const MAX = 6;
  const rank = { g: 3, y: 2, x: 1 };

  const view = (note = '') => {
    const grid = rows.map((r) => `${r.score.map((s) => WL[s]).join('')}  \`${r.guess.toUpperCase()}\``).join('\n');
    const empty = Array(MAX - rows.length).fill('⬜⬜⬜⬜⬜').join('\n');
    const keys = [...used.entries()].sort().map(([ch, s]) => `${WL[s]}${ch.toUpperCase()}`).join(' ');
    return {
      embeds: [embed('🔤 Wordle (kata 5 huruf)', `${grid}${grid && empty ? '\n' : ''}${empty}\n\n${keys ? `Huruf: ${keys}\n` : ''}${over && !won ? `Jawabannya: **${answer.toUpperCase()}**\n` : ''}${note}`, won ? config.colors.success : over ? config.colors.error : config.colors.main)],
      components: [row(btn('mini:wl:guess', 'Tebak kata', S.Primary, '✍️', over))],
    };
  };
  const msg = await open(interaction, view('🟩 benar & pas • 🟨 ada tapi salah posisi • ⬛ tidak ada'));
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 300_000, filter: (i) => i.customId === 'mini:wl:guess' });

  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return ephemeral(i, 'Ini game milik orang lain. Jalankan `/mini wordle` sendiri ya 🙂');
    if (over) return i.deferUpdate().catch(() => {});
    const sub = await C.askModal(i, { id: `mini:wl:m:${i.user.id}`, title: 'Tebak kata 5 huruf', fields: [{ id: 'w', label: 'Kata (5 huruf)', max: 5, placeholder: 'mis. lampu' }] });
    if (!sub || over) return;
    const guess = sub.fields.getTextInputValue('w').trim().toLowerCase();
    if (!/^[a-z]{5}$/.test(guess)) return sub.reply({ content: 'Harus tepat 5 huruf a–z.', flags: MessageFlags.Ephemeral }).catch(() => {});
    const score = L.wordleScore(guess, answer);
    rows.push({ guess, score });
    [...guess].forEach((ch, k) => {
      if (!used.has(ch) || rank[score[k]] > rank[used.get(ch)]) used.set(ch, score[k]);
    });
    if (guess === answer) {
      over = won = true;
      const prize = Math.max(300, 2000 - (rows.length - 1) * 300);
      C.reward(interaction.guildId, interaction.user.id, prize);
      col.stop('done');
      return sub.update(view(`🎉 Benar dalam **${rows.length}** percobaan!\n💰 Hadiah **${eco.coins(prize)}**`)).catch(() => {});
    }
    if (rows.length >= MAX) {
      over = true;
      col.stop('done');
      return sub.update(view('💀 Percobaan habis.')).catch(() => {});
    }
    return sub.update(view()).catch(() => {});
  });
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'idle' && !over) {
      over = true;
      msg.edit(view('⌛ Waktu habis.')).catch(() => {});
    }
  });
}

// ======================================================= BALAPAN JAWAB (hitung & acak kata)
async function race(interaction, { title, emoji, rounds, roundTime, makeRound, lockName, prizePerRound }) {
  const unlock = await C.lockChannel(interaction, lockName);
  if (!unlock) return;
  const scores = new Map();
  let current = null; // { prompt, check, reveal, done, winner, resolve }
  let over = false;

  const board = () => [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id, n], k) => `${C.medal(k)} <@${id}> — **${n}**`).join('\n') || '_belum ada skor_';
  const view = (round, text, disabled = false) => ({
    embeds: [embed(`${emoji} ${title}`, `Ronde **${round}/${rounds}** • ${roundTime} detik\n\n${text}\n\n**Skor:**\n${board()}`)],
    components: [row(btn('mini:rc:ans', 'Jawab', S.Primary, '✍️', disabled))],
  });

  current = { done: true };
  const first = makeRound(1);
  current = { ...first, done: false };
  const msg = await open(interaction, view(1, current.prompt));
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ filter: (i) => i.customId === 'mini:rc:ans' });
  let roundNo = 1;

  col.on('collect', async (i) => {
    if (over || current.done) return i.deferUpdate().catch(() => {});
    const myRound = roundNo;
    const sub = await C.askModal(i, { id: `mini:rc:m:${i.user.id}:${myRound}`, title: title, fields: [{ id: 'a', label: 'Jawabanmu', max: 40 }], time: roundTime * 1000 });
    if (!sub) return;
    if (over || current.done || myRound !== roundNo) return sub.reply({ content: 'Ronde ini sudah selesai.', flags: MessageFlags.Ephemeral }).catch(() => {});
    const ans = sub.fields.getTextInputValue('a');
    if (!current.check(ans)) return sub.reply({ content: '❌ Salah, coba lagi!', flags: MessageFlags.Ephemeral }).catch(() => {});
    current.done = true;
    current.winner = i.user.id;
    await sub.deferUpdate().catch(() => {});
    current.resolve?.();
  });

  for (let r = 1; r <= rounds; r++) {
    roundNo = r;
    if (r > 1) {
      current = { ...makeRound(r), done: false };
      await msg.edit(view(r, current.prompt)).catch(() => {});
    }
    await new Promise((resolve) => {
      current.resolve = resolve;
      setTimeout(resolve, roundTime * 1000);
    });
    current.done = true;
    const w = current.winner;
    if (w) {
      scores.set(w, (scores.get(w) ?? 0) + 1);
      C.reward(interaction.guildId, w, prizePerRound);
    }
    await msg.edit(view(r, `${w ? `✅ <@${w}> benar! **${current.reveal}** (+${eco.coins(prizePerRound)})` : `⌛ Tidak ada yang benar. Jawabannya **${current.reveal}**`}`, true)).catch(() => {});
    if (r < rounds) await C.sleep(2500);
  }
  over = true;
  col.stop('done');
  unlock();
  const top = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  await msg.edit({
    embeds: [embed(`${emoji} ${title} — Selesai`, `${top ? `🏆 Pemenang: <@${top[0]}> dengan **${top[1]}** poin!` : 'Tidak ada pemenang kali ini.'}\n\n**Skor akhir:**\n${board()}`, config.colors.success)],
    components: [],
  }).catch(() => {});
}

const hitung = (interaction) =>
  race(interaction, {
    title: 'Cepat Hitung', emoji: '🧮', rounds: 5, roundTime: 25, lockName: 'Cepat Hitung', prizePerRound: 300,
    makeRound: (r) => {
      const p = L.mathProblem(r <= 2 ? 1 : r <= 4 ? 2 : 3);
      return { prompt: `Berapa hasil dari:\n## ${p.text} = ?`, check: (a) => Number(String(a).replace(/[^\d-]/g, '')) === p.answer, reveal: String(p.answer) };
    },
  });

const acakkata = (interaction) => {
  const used = new Set();
  return race(interaction, {
    title: 'Acak Kata', emoji: '🔀', rounds: 5, roundTime: 25, lockName: 'Acak Kata', prizePerRound: 300,
    makeRound: () => {
      let cat, w;
      do {
        cat = L.pick(Object.keys(D.WORDS));
        w = L.pick(D.WORDS[cat]);
      } while (used.has(w));
      used.add(w);
      return { prompt: `Susun huruf ini jadi kata (kategori **${cat}**):\n## ${L.scramble(w).toUpperCase().split('').join(' ')}`, check: (a) => String(a).trim().toLowerCase() === w, reveal: w.toUpperCase() };
    },
  });
};

module.exports = { tebakangka, hangman, wordle, hitung, acakkata };
