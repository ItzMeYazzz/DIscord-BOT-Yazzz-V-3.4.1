'use strict';

/** Game papan berbasis tombol: Tic-Tac-Toe, Connect 4, Memory, Puzzle geser, Ranjau, Hi-Lo. */

const L = require('../utils/miniLogic');
const C = require('./common');
const { btn, row, embed, open, ephemeral, ButtonStyle: S, eco, config } = C;

// ======================================================= TIC TAC TOE
async function tictactoe(interaction) {
  const opp = interaction.options.getUser('lawan');
  if (opp && (opp.bot || opp.id === interaction.user.id)) return require('../utils/helpers').fail(interaction, 'Pilih lawan manusia lain, atau kosongkan untuk melawan bot.');
  const unlock = await C.lockChannel(interaction, 'Tic-Tac-Toe');
  if (!unlock) return;

  const players = { X: { id: interaction.user.id, name: interaction.user.username }, O: opp ? { id: opp.id, name: opp.username } : { id: null, name: 'Bot 🤖' } };
  const b = Array(9).fill(null);
  let turn = 'X';
  let winLine = [];
  let over = false;

  const view = (note = '') => {
    const w = L.tttWinner(b);
    const rows = [0, 1, 2].map((r) => row([0, 1, 2].map((c) => {
      const k = r * 3 + c;
      const style = winLine.includes(k) ? S.Success : b[k] === 'X' ? S.Danger : b[k] === 'O' ? S.Primary : S.Secondary;
      return btn(`mini:ttt:${k}`, null, style, b[k] === 'X' ? '❌' : b[k] === 'O' ? '⭕' : '⬜', over || !!b[k]);
    })));
    const status = w ? (w.mark === 'draw' ? '🤝 **Seri!**' : `🏆 **${players[w.mark].name}** menang!`) : `Giliran ${turn === 'X' ? '❌' : '⭕'} **${players[turn].name}**`;
    return { embeds: [embed('⭕❌ Tic-Tac-Toe', `❌ ${players.X.name}  vs  ⭕ ${players.O.name}\n\n${status}${note ? `\n${note}` : ''}`)], components: rows };
  };

  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 120_000, filter: (i) => i.customId.startsWith('mini:ttt:') });

  const check = () => {
    const w = L.tttWinner(b);
    if (w) {
      over = true;
      winLine = w.line;
      if (w.mark !== 'draw') {
        const win = players[w.mark];
        if (win.id) C.reward(interaction.guildId, win.id, 300);
      }
      col.stop('done');
      return true;
    }
    return false;
  };

  col.on('collect', async (i) => {
    if (over) return i.deferUpdate().catch(() => {});
    if (players[turn].id !== i.user.id) return ephemeral(i, players.X.id === i.user.id || players.O.id === i.user.id ? 'Belum giliranmu 🙂' : 'Kamu bukan pemain di game ini.');
    const k = Number(i.customId.split(':')[2]);
    if (b[k]) return i.deferUpdate().catch(() => {});
    b[k] = turn;
    turn = turn === 'X' ? 'O' : 'X';
    if (!check() && !players[turn].id) {
      b[L.tttBot(b, turn)] = turn;
      turn = turn === 'X' ? 'O' : 'X';
      check();
    }
    const w = L.tttWinner(b);
    await i.update(view(w && w.mark !== 'draw' && players[w.mark].id ? '💰 +300 koin untuk pemenang' : '')).catch(() => {});
  });
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'idle') {
      over = true;
      msg.edit({ ...view('⌛ Waktu habis.'), }).catch(() => {});
    }
  });
}

// ======================================================= CONNECT 4
const C4 = ['⚫', '🔴', '🟡'];
async function connect4(interaction) {
  const opp = interaction.options.getUser('lawan');
  if (opp && (opp.bot || opp.id === interaction.user.id)) return require('../utils/helpers').fail(interaction, 'Pilih lawan manusia lain, atau kosongkan untuk melawan bot.');
  const unlock = await C.lockChannel(interaction, 'Connect 4');
  if (!unlock) return;

  const players = { 1: { id: interaction.user.id, name: interaction.user.username }, 2: opp ? { id: opp.id, name: opp.username } : { id: null, name: 'Bot 🤖' } };
  const b = L.c4New();
  let turn = 1;
  let over = false;
  let win = null;

  const view = (note = '') => {
    const hl = new Set((win?.cells ?? []).map(([r, c]) => `${r},${c}`));
    const grid = b.map((r, ri) => r.map((v, ci) => (hl.has(`${ri},${ci}`) ? '🟢' : C4[v])).join('')).join('\n');
    const head = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'].join('');
    const status = win ? (win.mark === 'draw' ? '🤝 **Seri!**' : `🏆 **${players[win.mark].name}** menang!`) : `Giliran ${C4[turn]} **${players[turn].name}**`;
    const btns = [...Array(7).keys()].map((c) => btn(`mini:c4:${c}`, String(c + 1), S.Primary, null, over || !!b[0][c]));
    return {
      embeds: [embed('🔴🟡 Connect 4', `${C4[1]} ${players[1].name}  vs  ${C4[2]} ${players[2].name}\n\n${head}\n${grid}\n\n${status}${note ? `\n${note}` : ''}`)],
      components: [row(btns.slice(0, 4)), row(btns.slice(4))],
    };
  };

  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 180_000, filter: (i) => i.customId.startsWith('mini:c4:') });

  const finish = () => {
    win = L.c4Winner(b);
    if (!win) return false;
    over = true;
    if (win.mark !== 'draw' && players[win.mark].id) C.reward(interaction.guildId, players[win.mark].id, 400);
    col.stop('done');
    return true;
  };

  col.on('collect', async (i) => {
    if (over) return i.deferUpdate().catch(() => {});
    if (players[turn].id !== i.user.id) return ephemeral(i, players[1].id === i.user.id || players[2].id === i.user.id ? 'Belum giliranmu 🙂' : 'Kamu bukan pemain di game ini.');
    const c = Number(i.customId.split(':')[2]);
    if (L.c4Drop(b, c, turn) < 0) return i.deferUpdate().catch(() => {});
    turn = 3 - turn;
    if (!finish() && !players[turn].id) {
      L.c4Drop(b, L.c4Bot(b, turn), turn);
      turn = 3 - turn;
      finish();
    }
    await i.update(view(win && win.mark !== 'draw' && players[win.mark].id ? '💰 +400 koin untuk pemenang' : '')).catch(() => {});
  });
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'idle') {
      over = true;
      msg.edit(view('⌛ Waktu habis.')).catch(() => {});
    }
  });
}

// ======================================================= MEMORY
const MEMORY_EMOJI = ['🍎', '🍌', '🍇', '🍉', '🐱', '🐶', '⚽', '🚗', '🌟', '🎵', '🔔', '🍕'];
async function memory(interaction) {
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  const cards = L.shuffle(L.shuffle(MEMORY_EMOJI).slice(0, 8).flatMap((e) => [e, e]));
  const matched = new Set();
  let first = null;
  let shown = new Set();
  let moves = 0;
  let locked = false;
  let over = false;
  const startedAt = Date.now();

  const view = (note = '') => {
    const rows = [0, 1, 2, 3].map((r) => row([0, 1, 2, 3].map((c) => {
      const k = r * 4 + c;
      const open_ = matched.has(k) || shown.has(k);
      return btn(`mini:mem:${k}`, null, matched.has(k) ? S.Success : open_ ? S.Primary : S.Secondary, open_ ? cards[k] : '❓', over || matched.has(k) || shown.has(k));
    })));
    return { embeds: [embed('🧠 Memory', `Cocokkan 8 pasang kartu!\nLangkah: **${moves}** • Pasangan: **${matched.size / 2}/8**${note ? `\n\n${note}` : ''}`)], components: rows };
  };

  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 120_000, filter: (i) => i.customId.startsWith('mini:mem:') });

  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return ephemeral(i, 'Ini game milik orang lain. Jalankan `/mini memory` sendiri ya 🙂');
    if (locked || over) return i.deferUpdate().catch(() => {});
    const k = Number(i.customId.split(':')[2]);
    if (matched.has(k) || shown.has(k)) return i.deferUpdate().catch(() => {});
    shown.add(k);
    if (first === null) {
      first = k;
      return i.update(view()).catch(() => {});
    }
    moves++;
    if (cards[first] === cards[k]) {
      matched.add(first).add(k);
      shown = new Set();
      first = null;
      if (matched.size === 16) {
        over = true;
        const secs = Math.round((Date.now() - startedAt) / 1000);
        const prize = Math.max(100, 1200 - (moves - 8) * 70);
        C.reward(interaction.guildId, interaction.user.id, prize);
        col.stop('done');
        return i.update(view(`🎉 **Selesai!** ${moves} langkah dalam ${secs} detik.\n💰 Hadiah **${eco.coins(prize)}**`)).catch(() => {});
      }
      return i.update(view('✅ Cocok!')).catch(() => {});
    }
    locked = true;
    await i.update(view('❌ Tidak cocok…')).catch(() => {});
    await C.sleep(1100);
    shown = new Set();
    first = null;
    locked = false;
    await msg.edit(view()).catch(() => {});
  });
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'idle') {
      over = true;
      msg.edit(view('⌛ Waktu habis.')).catch(() => {});
    }
  });
}

// ======================================================= PUZZLE GESER
async function puzzle(interaction) {
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  const b = L.slideNew();
  let moves = 0;
  let over = false;

  const view = (note = '') => {
    const z = b.indexOf(0);
    const rows = [0, 1, 2].map((r) => row([0, 1, 2].map((c) => {
      const k = r * 3 + c;
      if (b[k] === 0) return btn(`mini:pz:${k}`, null, S.Secondary, '⬛', true);
      const near = !over && Math.abs(Math.floor(k / 3) - Math.floor(z / 3)) + Math.abs((k % 3) - (z % 3)) === 1;
      return btn(`mini:pz:${k}`, b[k], over ? S.Success : near ? S.Primary : S.Secondary, null, over);
    })));
    rows.push(row(btn('mini:pz:give', 'Menyerah', S.Danger, '🏳️', over)));
    return { embeds: [embed('🔢 Puzzle Geser', `Urutkan angka **1–8** (kotak kosong di pojok kanan bawah).\nKlik angka di samping kotak kosong untuk menggesernya.\nLangkah: **${moves}**${note ? `\n\n${note}` : ''}`)], components: rows };
  };

  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 300_000, filter: (i) => i.customId.startsWith('mini:pz:') });
  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return ephemeral(i, 'Ini game milik orang lain. Jalankan `/mini puzzle` sendiri ya 🙂');
    const arg = i.customId.split(':')[2];
    if (arg === 'give') {
      over = true;
      col.stop('done');
      return i.update(view('🏳️ Kamu menyerah.')).catch(() => {});
    }
    if (!L.slideMove(b, Number(arg))) return i.deferUpdate().catch(() => {});
    moves++;
    if (L.slideSolved(b)) {
      over = true;
      const prize = Math.max(200, 1500 - moves * 15);
      C.reward(interaction.guildId, interaction.user.id, prize);
      col.stop('done');
      return i.update(view(`🎉 **Terpecahkan** dalam ${moves} langkah!\n💰 Hadiah **${eco.coins(prize)}**`)).catch(() => {});
    }
    return i.update(view()).catch(() => {});
  });
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'idle') {
      over = true;
      msg.edit(view('⌛ Waktu habis.')).catch(() => {});
    }
  });
}

// ======================================================= RANJAU (bertaruhan)
async function ranjau(interaction) {
  const bet = interaction.options.getInteger('taruhan', true);
  const mines = interaction.options.getInteger('bom') ?? 4;
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  if (!(await C.takeBet(interaction, bet))) return unlock();

  const minePos = new Set(L.shuffle([...Array(L.MINE_CELLS).keys()]).slice(0, mines));
  const revealed = new Set();
  let over = false;
  let state = 'play'; // play | cash | boom
  let paid = 0;

  const mult = () => (revealed.size ? L.mineMultiplier(revealed.size, mines) : 1);
  const view = (note = '') => {
    const rows = [0, 1, 2, 3].map((r) => row([0, 1, 2, 3, 4].map((c) => {
      const k = r * 5 + c;
      const isMine = minePos.has(k);
      if (revealed.has(k)) return btn(`mini:mn:${k}`, null, S.Success, '💎', true);
      if (over && isMine) return btn(`mini:mn:${k}`, null, state === 'boom' ? S.Danger : S.Secondary, '💣', true);
      return btn(`mini:mn:${k}`, null, S.Secondary, '❔', over);
    })));
    const next = L.mineMultiplier(revealed.size + 1, mines);
    rows.push(row(btn('mini:mn:cash', revealed.size ? `Ambil ${eco.num(Math.floor(bet * mult()))}` : 'Buka kotak dulu', S.Success, '💰', over || !revealed.size)));
    const status = state === 'boom' ? `💥 **BOOM!** Kamu kalah **−${eco.coins(bet)}**` : state === 'cash' ? `✅ Kamu mengambil **${eco.coins(paid)}** (${paid >= bet ? '+' : ''}${eco.num(paid - bet)})` : `Kotak berikutnya: **x${next}** jika aman`;
    return {
      embeds: [embed('💣 Ranjau', `Taruhan **${eco.coins(bet)}** • ${mines} bom di 20 kotak\nMultiplier sekarang: **x${mult()}** (${eco.coins(Math.floor(bet * mult()))})\n\n${status}${note ? `\n${note}` : ''}`, state === 'boom' ? config.colors.error : state === 'cash' ? config.colors.success : config.colors.main)],
      components: rows,
    };
  };

  const msg = await open(interaction, view());
  if (!msg) {
    eco.settle(interaction.guildId, interaction.user.id, bet, bet);
    return unlock();
  }
  const col = msg.createMessageComponentCollector({ idle: 120_000, filter: (i) => i.customId.startsWith('mini:mn:') });

  const cashOut = () => {
    over = true;
    state = 'cash';
    paid = Math.floor(bet * mult());
    eco.settle(interaction.guildId, interaction.user.id, bet, paid);
    col.stop('done');
  };

  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return ephemeral(i, 'Ini game milik orang lain. Jalankan `/mini ranjau` sendiri ya 🙂');
    if (over) return i.deferUpdate().catch(() => {});
    const arg = i.customId.split(':')[2];
    if (arg === 'cash') {
      if (!revealed.size) return i.deferUpdate().catch(() => {});
      cashOut();
      return i.update(view()).catch(() => {});
    }
    const k = Number(arg);
    if (revealed.has(k)) return i.deferUpdate().catch(() => {});
    if (minePos.has(k)) {
      over = true;
      state = 'boom';
      revealed.delete(k);
      minePos.add(k);
      eco.settle(interaction.guildId, interaction.user.id, bet, 0);
      col.stop('done');
      return i.update(view()).catch(() => {});
    }
    revealed.add(k);
    if (revealed.size >= L.MINE_CELLS - mines || mult() >= 100) {
      cashOut();
      return i.update(view('🏆 Semua kotak aman terbuka / batas x100!')).catch(() => {});
    }
    return i.update(view()).catch(() => {});
  });
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'idle' && !over) {
      if (revealed.size) cashOut();
      else {
        over = true;
        state = 'cash';
        paid = bet;
        eco.settle(interaction.guildId, interaction.user.id, bet, bet);
      }
      msg.edit(view('⌛ Waktu habis — otomatis diambil.')).catch(() => {});
    }
  });
}

// ======================================================= HI-LO (bertaruhan)
async function hilo(interaction) {
  const bet = interaction.options.getInteger('taruhan', true);
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  if (!(await C.takeBet(interaction, bet))) return unlock();

  let card = L.drawCard();
  let total = 1;
  let streak = 0;
  let over = false;
  let state = 'play';
  let paid = 0;
  const history = [];

  const view = (note = '') => {
    const hi = L.hiloMult(card.v, 'hi'), lo = L.hiloMult(card.v, 'lo');
    const status = state === 'lose' ? `❌ Salah! **−${eco.coins(bet)}**` : state === 'cash' ? `✅ Diambil **${eco.coins(paid)}** (${paid >= bet ? '+' : ''}${eco.num(paid - bet)})` : 'Tebak kartu berikutnya **lebih tinggi** atau **lebih rendah** (seri = kalah).';
    return {
      embeds: [embed('🃏 Hi-Lo', `Taruhan **${eco.coins(bet)}** • Streak **${streak}** • Multiplier **x${total.toFixed(2)}** (${eco.coins(Math.floor(bet * total))})\n\nKartu sekarang: ## ${L.cardText(card)}\n${history.length ? `Riwayat: ${history.slice(-6).join(' ➜ ')}\n` : ''}\n${status}${note ? `\n${note}` : ''}`, state === 'lose' ? config.colors.error : state === 'cash' ? config.colors.success : config.colors.main)],
      components: [row(
        btn('mini:hl:hi', hi ? `Lebih tinggi x${hi}` : 'Lebih tinggi', S.Primary, '⬆️', over || !hi),
        btn('mini:hl:lo', lo ? `Lebih rendah x${lo}` : 'Lebih rendah', S.Primary, '⬇️', over || !lo),
        btn('mini:hl:cash', streak ? `Ambil ${eco.num(Math.floor(bet * total))}` : 'Ambil', S.Success, '💰', over || !streak),
      )],
    };
  };

  const msg = await open(interaction, view());
  if (!msg) {
    eco.settle(interaction.guildId, interaction.user.id, bet, bet);
    return unlock();
  }
  const col = msg.createMessageComponentCollector({ idle: 90_000, filter: (i) => i.customId.startsWith('mini:hl:') });
  const cashOut = () => {
    over = true;
    state = 'cash';
    paid = Math.floor(bet * total);
    eco.settle(interaction.guildId, interaction.user.id, bet, paid);
    col.stop('done');
  };

  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return ephemeral(i, 'Ini game milik orang lain. Jalankan `/mini hilo` sendiri ya 🙂');
    if (over) return i.deferUpdate().catch(() => {});
    const act = i.customId.split(':')[2];
    if (act === 'cash') {
      if (!streak) return i.deferUpdate().catch(() => {});
      cashOut();
      return i.update(view()).catch(() => {});
    }
    const m = L.hiloMult(card.v, act);
    if (!m) return i.deferUpdate().catch(() => {});
    const next = L.drawCard();
    const win = act === 'hi' ? next.v > card.v : next.v < card.v;
    history.push(L.cardText(card));
    card = next;
    if (!win) {
      over = true;
      state = 'lose';
      eco.settle(interaction.guildId, interaction.user.id, bet, 0);
      col.stop('done');
      return i.update(view()).catch(() => {});
    }
    total = Math.min(100, total * m);
    streak++;
    if (total >= 100) {
      cashOut();
      return i.update(view('🏆 Batas x100 tercapai!')).catch(() => {});
    }
    return i.update(view('✅ Benar!')).catch(() => {});
  });
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'idle' && !over) {
      if (streak) cashOut();
      else {
        over = true;
        state = 'cash';
        paid = bet;
        eco.settle(interaction.guildId, interaction.user.id, bet, bet);
      }
      msg.edit(view('⌛ Waktu habis — otomatis diambil.')).catch(() => {});
    }
  });
}

module.exports = { tictactoe, connect4, memory, puzzle, ranjau, hilo };
