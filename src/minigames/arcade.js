'use strict';

/**
 * /arcade — mini game solo & grup yang lebih interaktif (tombol, animasi, taruhan).
 * Logika murni ada di utils/arcadeLogic.js; file ini hanya tampilan & alur Discord.
 */
const { StringSelectMenuBuilder } = require('discord.js');
const C = require('./common');
const A = require('../utils/arcadeLogic');
const lobby = require('../utils/lobby');

const { embed, row, btn, ephemeral, open, sleep, config, eco, ButtonStyle: S } = C;

/** Update pesan dari klik tombol; kalau interaksi telanjur kedaluwarsa (jaringan lambat), edit pesan aslinya. */
async function upd(i, msg, payload) {
  try {
    await i.update(payload);
  } catch {
    await msg.edit(payload).catch(() => {});
  }
}
// Pengaturan waktu (ms) — bisa diubah lewat .env, mis. ARCADE_BOM_MIN=20000
const num = (name, def) => Number(process.env[name] ?? def);
const foreign = (i, cmd) => ephemeral(i, `Ini game milik orang lain. Jalankan \`/arcade ${cmd}\` sendiri ya 🙂`);

/** Papan arah: ⬆️ / ⬅️ ⬇️ ➡️ + baris tambahan. */
function dpad(prefix, disabled, extra = []) {
  const blank = (k) => btn(`${prefix}:_${k}`, null, S.Secondary, '▫️', true);
  return [
    row(blank(1), btn(`${prefix}:up`, null, S.Primary, '⬆️', disabled), blank(2)),
    row(btn(`${prefix}:left`, null, S.Primary, '⬅️', disabled), btn(`${prefix}:down`, null, S.Primary, '⬇️', disabled), btn(`${prefix}:right`, null, S.Primary, '➡️', disabled)),
    ...(extra.length ? [row(extra)] : []),
  ];
}

// ======================================================================= 2048
const center = (t, w) => {
  const s = String(t);
  const left = Math.floor((w - s.length) / 2);
  return ' '.repeat(left) + s + ' '.repeat(w - s.length - left);
};

function gridText(grid) {
  const W = 6;
  const sep = (l, m, r) => l + Array(A.G).fill('─'.repeat(W)).join(m) + r;
  const lines = [sep('┌', '┬', '┐')];
  grid.forEach((rw, i) => {
    lines.push(`│${rw.map((v) => center(v || '·', W)).join('│')}│`);
    lines.push(i < A.G - 1 ? sep('├', '┼', '┤') : sep('└', '┴', '┘'));
  });
  return `\`\`\`\n${lines.join('\n')}\n\`\`\``;
}

async function game2048(interaction) {
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  const st = A.new2048();
  let over = false;
  let note = '';
  let paid = 0;

  const finish = (why) => {
    if (over) return;
    over = true;
    paid = A.reward2048(A.maxTile(st.grid));
    C.reward(interaction.guildId, interaction.user.id, paid);
    note = why;
  };

  const view = () => {
    const max = A.maxTile(st.grid);
    const next = [[128, 50], [256, 150], [512, 400], [1024, 1000], [2048, 3000]].find(([t]) => max < t);
    const status = over
      ? `🏁 **${note}**\nHadiah: **${paid ? eco.coins(paid) : 'belum ada (capai ubin 128)'}**`
      : `Hadiah sekarang: **${eco.coins(A.reward2048(max))}**${next ? ` • target berikut: ubin **${next[0]}** = ${eco.coins(next[1])}` : ''}`;
    return {
      embeds: [embed('🔢 2048', `${gridText(st.grid)}\nSkor **${eco.num(st.score)}** • Ubin terbesar **${max}** • Langkah **${st.moves}**\n\n${status}`, over ? (st.won ? config.colors.success : config.colors.warn) : config.colors.main)],
      components: dpad('arc:24', over, [btn('arc:24:end', 'Selesai & ambil hadiah', S.Success, '🏁', over)]),
    };
  };

  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 120_000, filter: (i) => i.customId.startsWith('arc:24:') });

  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return foreign(i, '2048');
    if (over) return i.deferUpdate().catch(() => {});
    const act = i.customId.split(':')[2];
    if (act === 'end') {
      finish('Kamu mengakhiri permainan.');
      col.stop('done');
      return upd(i, msg, view());
    }
    if (!['up', 'down', 'left', 'right'].includes(act)) return i.deferUpdate().catch(() => {});
    if (!A.play2048(st, act)) return i.deferUpdate().catch(() => {}); // langkah tak berpengaruh
    if (st.won && !st.celebrated) st.celebrated = true;
    if (!A.canMove2048(st.grid)) {
      finish(st.won ? '🎉 Ubin 2048 tercapai & papan penuh!' : 'Papan penuh — tidak ada langkah lagi.');
      col.stop('done');
    }
    return upd(i, msg, view());
  });
  col.on('end', (_, reason) => {
    unlock();
    if (!over) {
      finish('Waktu habis, hadiah otomatis diambil.');
      msg.edit(view()).catch(() => {});
    }
    void reason;
  });
}

// ======================================================================= ULAR
async function ular(interaction) {
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  const st = A.newSnake(8);
  let over = false;
  let paid = 0;

  const finish = () => {
    over = true;
    paid = A.rewardSnake(st.score);
    C.reward(interaction.guildId, interaction.user.id, paid);
  };

  const board = () => {
    const rows = [];
    const body = new Map(st.snake.map((p, k) => [`${p.x},${p.y}`, k]));
    for (let y = 0; y < st.size; y++) {
      let line = '';
      for (let x = 0; x < st.size; x++) {
        const k = body.get(`${x},${y}`);
        if (k === 0) line += st.alive ? '🟢' : '💥';
        else if (k !== undefined) line += '🟩';
        else if (st.food && st.food.x === x && st.food.y === y) line += '🍎';
        else line += '⬛';
      }
      rows.push(line);
    }
    return rows.join('\n');
  };

  const view = () => {
    const status = over
      ? `${st.won ? '🏆 **Papan penuh — kamu menang!**' : `💀 **Game over** (menabrak ${st.cause ?? 'sesuatu'})`}\nHadiah: **${paid ? eco.coins(paid) : 'belum ada'}**`
      : `Hadiah sekarang: **${eco.coins(A.rewardSnake(st.score))}** • tiap 🍎 = +${A.rewardSnake(1)} koin`;
    return {
      embeds: [embed('🐍 Ular', `${board()}\n\nApel **${st.score}** • Panjang **${st.snake.length}** • Langkah **${st.steps}**\n${status}`, over ? (st.won ? config.colors.success : config.colors.error) : config.colors.main)],
      components: dpad('arc:sn', over, [btn('arc:sn:fwd', 'Maju ×3', S.Secondary, '⏩', over), btn('arc:sn:end', 'Selesai', S.Success, '🏁', over)]),
    };
  };

  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 90_000, filter: (i) => i.customId.startsWith('arc:sn:') });

  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return foreign(i, 'ular');
    if (over) return i.deferUpdate().catch(() => {});
    const act = i.customId.split(':')[2];
    if (act === 'end') {
      finish();
      col.stop('done');
      return upd(i, msg, view());
    }
    if (act === 'fwd') for (let k = 0; k < 3 && st.alive; k++) A.stepSnake(st, null);
    else if (A.DIRS[act]) A.stepSnake(st, act);
    else return i.deferUpdate().catch(() => {});
    if (!st.alive) {
      finish();
      col.stop('done');
    }
    return upd(i, msg, view());
  });
  col.on('end', () => {
    unlock();
    if (!over) {
      finish();
      msg.edit(view()).catch(() => {});
    }
  });
}

// ======================================================================= LABIRIN
const SIZES = { kecil: 3, sedang: 4, besar: 5 };

/** Geser sepanjang lorong sampai persimpangan / jalan buntu / pintu keluar. */
function slideMaze(m, pos, dir) {
  const open = (x, y) => x >= 0 && y >= 0 && x < m.W && y < m.H && !m.wall[y][x];
  const path = [];
  let { x, y } = pos;
  let d = dir;
  let [dx, dy] = A.DIRS[d];
  if (!open(x + dx, y + dy)) return { pos, path };
  for (let guard = 0; guard < 200; guard++) {
    x += dx;
    y += dy;
    path.push({ x, y });
    if (x === m.exit.x && y === m.exit.y) break;
    const back = A.OPPOSITE[d];
    const exits = Object.entries(A.DIRS).filter(([k, [ax, ay]]) => k !== back && open(x + ax, y + ay));
    if (exits.length !== 1) break; // persimpangan (>1) atau buntu (0)
    [d] = exits[0];
    [dx, dy] = A.DIRS[d];
  }
  return { pos: { x, y }, path };
}

async function labirin(interaction) {
  const size = SIZES[interaction.options.getString('ukuran') ?? 'sedang'] ?? 4;
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  const m = A.genMaze(size, size);
  const par = A.mazePar(m);
  const limit = par * 2;
  let pos = { ...m.start };
  let steps = 0;
  const trail = new Set([`${pos.x},${pos.y}`]);
  let state = 'play'; // play | win | out
  let paid = 0;

  const grid = () => {
    const lines = [];
    for (let y = 0; y < m.H; y++) {
      let line = '';
      for (let x = 0; x < m.W; x++) {
        if (x === pos.x && y === pos.y) line += '🐭';
        else if (x === m.exit.x && y === m.exit.y) line += '🧀';
        else if (m.wall[y][x]) line += '⬛';
        else if (trail.has(`${x},${y}`)) line += '🟩';
        else line += '⬜';
      }
      lines.push(line);
    }
    return lines.join('\n');
  };

  const view = () => {
    const left = Math.max(0, limit - steps);
    const status = state === 'win'
      ? `🧀 **Kamu sampai!** ${steps} langkah (terpendek ${par}) → hadiah **${eco.coins(paid)}**`
      : state === 'out'
        ? '😵 **Energi habis** sebelum menemukan keju.'
        : `Energi: **${left}** langkah • Panah akan meluncur sampai persimpangan.`;
    return {
      embeds: [embed('🐭 Labirin', `${grid()}\n\n${status}`, state === 'win' ? config.colors.success : state === 'out' ? config.colors.error : config.colors.main)],
      components: dpad('arc:mz', state !== 'play', [btn('arc:mz:end', 'Menyerah', S.Danger, '🏳️', state !== 'play')]),
    };
  };

  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 120_000, filter: (i) => i.customId.startsWith('arc:mz:') });

  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return foreign(i, 'labirin');
    if (state !== 'play') return i.deferUpdate().catch(() => {});
    const act = i.customId.split(':')[2];
    if (act === 'end') {
      state = 'out';
      col.stop('done');
      return upd(i, msg, view());
    }
    if (!A.DIRS[act]) return i.deferUpdate().catch(() => {});
    const r = slideMaze(m, pos, act);
    if (!r.path.length) return i.deferUpdate().catch(() => {}); // tembok
    const path = r.path.slice(0, Math.max(0, limit - steps)); // luncuran dipotong sesuai sisa energi
    pos = path.at(-1);
    steps += path.length;
    for (const p of path) trail.add(`${p.x},${p.y}`);
    if (pos.x === m.exit.x && pos.y === m.exit.y) {
      state = 'win';
      paid = A.mazeReward(par, steps);
      C.reward(interaction.guildId, interaction.user.id, paid);
      col.stop('done');
    } else if (steps >= limit) {
      state = 'out';
      col.stop('done');
    }
    return upd(i, msg, view());
  });
  col.on('end', () => {
    unlock();
    if (state === 'play') {
      state = 'out';
      msg.edit(view()).catch(() => {});
    }
  });
}

// ======================================================================= SAPU RANJAU (klasik)
async function sapu(interaction) {
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  const g = A.newMines();
  let flagMode = false;
  const REWARD = 200;

  const view = () => {
    const rows = [];
    for (let r = 0; r < g.rows; r++) {
      const cells = [];
      for (let c = 0; c < g.cols; c++) {
        const k = `${r},${c}`;
        const id = `arc:ms:${r}:${c}`;
        if (g.revealed.has(k)) {
          const n = A.mineCount(g, r, c);
          cells.push(n ? btn(id, n, S.Secondary, null, true) : btn(id, null, S.Secondary, '▫️', true));
        } else if (g.over && g.set?.has(k)) cells.push(btn(id, null, g.hit === k ? S.Danger : S.Secondary, '💣', true));
        else if (g.flags.has(k)) cells.push(btn(id, null, S.Danger, '🚩', g.over));
        else cells.push(btn(id, null, S.Primary, '❔', g.over));
      }
      rows.push(row(cells));
    }
    rows.push(row(
      btn('arc:ms:mode', flagMode ? 'Mode bendera: ON' : 'Mode bendera: OFF', flagMode ? S.Danger : S.Secondary, '🚩', g.over),
      btn('arc:ms:end', 'Menyerah', S.Secondary, '🏳️', g.over),
    ));
    const left = g.mines - g.flags.size;
    const status = g.over
      ? g.won ? `🏆 **Semua ranjau terhindar!** Hadiah **${eco.coins(REWARD)}**` : '💥 **BOOM!** Kamu menginjak ranjau.'
      : `💣 ${g.mines} ranjau • 🚩 sisa bendera **${left}** • Angka = jumlah ranjau di 8 petak sekitarnya.\nKlik pertama selalu aman. Menang = ${eco.coins(REWARD)}.`;
    return { embeds: [embed('🚩 Sapu Ranjau', status, g.over ? (g.won ? config.colors.success : config.colors.error) : config.colors.main)], components: rows };
  };

  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 180_000, filter: (i) => i.customId.startsWith('arc:ms:') });

  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return foreign(i, 'sapu');
    if (g.over) return i.deferUpdate().catch(() => {});
    const [, , a, b] = i.customId.split(':');
    if (a === 'mode') flagMode = !flagMode;
    else if (a === 'end') {
      g.over = true;
      if (!g.set) A.placeMines(g, 0, 0);
      col.stop('done');
    } else {
      const r = Number(a);
      const c = Number(b);
      if (Number.isNaN(r) || Number.isNaN(c)) return i.deferUpdate().catch(() => {});
      if (flagMode) A.toggleFlag(g, r, c);
      else A.revealCell(g, r, c);
      if (g.over) {
        if (g.won) C.reward(interaction.guildId, interaction.user.id, REWARD);
        col.stop('done');
      }
    }
    return upd(i, msg, view());
  });
  col.on('end', () => {
    unlock();
    if (!g.over) {
      g.over = true;
      if (!g.set) A.placeMines(g, 0, 0);
      msg.edit(view()).catch(() => {});
    }
  });
}

// ======================================================================= SIMON
const SIMON = [
  { id: 'red', on: '🟥', off: '⬛', style: S.Danger },
  { id: 'green', on: '🟩', off: '⬛', style: S.Success },
  { id: 'blue', on: '🟦', off: '⬛', style: S.Primary },
  { id: 'yellow', on: '🟨', off: '⬛', style: S.Secondary },
];

async function simon(interaction) {
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  let seq = A.simonNext([]);
  let phase = 'show'; // show | input | over
  let idx = 0;
  let level = 1;
  let paid = 0;
  let flash = -1;
  let shown = 0;

  const pads = () => SIMON.map((c, k) => (flash === k ? c.on : c.off)).join(' ');
  const view = () => {
    let status;
    if (phase === 'show') status = `👀 **Perhatikan polanya!** (${shown}/${seq.length})`;
    else if (phase === 'input') status = `👆 **Giliranmu!** Ulangi pola: ${idx}/${seq.length}`;
    else status = `💥 **Salah!** Kamu bertahan sampai level **${level - 1}** → hadiah **${paid ? eco.coins(paid) : 'belum ada'}**`;
    return {
      embeds: [embed('🎨 Simon Says', `## ${pads()}\n\nLevel **${level}** • Hadiah sekarang: **${eco.coins(A.rewardSimon(level - 1))}**\n${status}`, phase === 'over' ? config.colors.error : config.colors.main)],
      components: [row(SIMON.map((c, k) => btn(`arc:si:${k}`, null, c.style, c.on, phase !== 'input')))],
    };
  };

  const msg = await open(interaction, view());
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ idle: 60_000, filter: (i) => i.customId.startsWith('arc:si:') });
  let ended = false;

  const play = async () => {
    phase = 'show';
    idx = 0;
    shown = 0;
    flash = -1;
    await msg.edit(view()).catch(() => {});
    await sleep(num('ARCADE_SIMON_PAUSE', 900));
    for (const k of seq) {
      if (ended) return;
      flash = k;
      shown++;
      await msg.edit(view()).catch(() => {});
      await sleep(num('ARCADE_SIMON_FLASH', 1000));
    }
    flash = -1;
    phase = 'input';
    await msg.edit(view()).catch(() => {});
  };

  const end = () => {
    if (ended) return;
    ended = true;
    phase = 'over';
    paid = A.rewardSimon(level - 1);
    C.reward(interaction.guildId, interaction.user.id, paid);
    col.stop('done');
  };

  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return foreign(i, 'simon');
    if (phase !== 'input' || ended) return i.deferUpdate().catch(() => {});
    const k = Number(i.customId.split(':')[2]);
    if (k !== seq[idx]) {
      end();
      return upd(i, msg, view());
    }
    idx++;
    if (idx >= seq.length) {
      level++;
      seq = A.simonNext(seq);
      phase = 'show';
      shown = 0;
      await upd(i, msg, view());
      return play();
    }
    return upd(i, msg, view());
  });
  col.on('end', () => {
    unlock();
    if (!ended) {
      end();
      msg.edit(view()).catch(() => {});
    }
  });

  play();
}

// ======================================================================= VIDEO POKER
async function poker(interaction) {
  const bet = interaction.options.getInteger('taruhan', true);
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  if (!(await C.takeBet(interaction, bet))) return unlock();

  const deck = A.newPokerDeck();
  let hand = deck.splice(0, 5);
  const held = Array(5).fill(false);
  let done = false;
  let paid = 0;
  let result = null;

  const view = () => {
    const cards = hand.map((c, k) => (held[k] && !done ? `**\`${A.cardText(c)}\`**🔒` : `\`${A.cardText(c)}\``)).join('  ');
    const live = A.evalPoker(hand);
    const pay = A.POKER_PAY.map(([, name, m]) => `${name} x${m}`).join(' • ');
    let status;
    if (done) {
      const net = paid - bet;
      status = result.mult
        ? `🎉 **${result.name}!** x${result.mult} → **+${eco.coins(net)}**`
        : `❌ Tidak ada kombinasi. **−${eco.coins(bet)}**`;
    } else status = `Tahan kartu yang mau disimpan lalu tekan **Tarik**. ${live.mult ? `Sekarang: **${live.name}** (x${live.mult})` : ''}`;
    const color = done ? (paid > bet ? config.colors.success : paid === bet ? config.colors.warn : config.colors.error) : config.colors.main;
    const e = embed('🃏 Video Poker', `Taruhan **${eco.coins(bet)}**\n\n## ${cards}\n\n${status}`, color);
    e.setFooter({ text: done ? `Saldo: ${eco.num(eco.wallet(interaction.guildId, interaction.user.id).balance)} koin` : pay.slice(0, 2000) });
    return {
      embeds: [e],
      components: [
        row(hand.map((c, k) => btn(`arc:pk:h${k}`, A.cardText(c), held[k] ? S.Success : S.Secondary, held[k] ? '🔒' : null, done))),
        row(btn('arc:pk:draw', 'Tarik kartu', S.Primary, '🃏', done)),
      ],
    };
  };

  const msg = await open(interaction, view());
  if (!msg) {
    eco.settle(interaction.guildId, interaction.user.id, bet, bet);
    return unlock();
  }
  const col = msg.createMessageComponentCollector({ idle: 90_000, filter: (i) => i.customId.startsWith('arc:pk:') });

  const draw = () => {
    if (done) return;
    done = true;
    hand = hand.map((c, k) => (held[k] ? c : deck.shift()));
    result = A.evalPoker(hand);
    paid = bet * result.mult;
    eco.settle(interaction.guildId, interaction.user.id, bet, paid);
    col.stop('done');
  };

  col.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) return foreign(i, 'poker');
    if (done) return i.deferUpdate().catch(() => {});
    const act = i.customId.split(':')[2];
    if (act === 'draw') draw();
    else if (/^h[0-4]$/.test(act)) held[Number(act[1])] = !held[Number(act[1])];
    else return i.deferUpdate().catch(() => {});
    return upd(i, msg, view());
  });
  col.on('end', () => {
    unlock();
    if (!done) {
      draw(); // waktu habis: tarik otomatis dengan kartu yang ditahan
      msg.edit(view()).catch(() => {});
    }
  });
}

// ======================================================================= CRASH
const crashHistory = new Map(); // guildId -> [x, ...]

async function crash(interaction) {
  const bet = interaction.options.getInteger('taruhan', true);
  const auto = interaction.options.getNumber('auto');
  const gid = interaction.guildId;
  const uid = interaction.user.id;
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  if (!(await C.takeBet(interaction, bet))) return unlock();

  const cp = A.crashPoint();
  let k = 0;
  let mult = 1;
  let state = 'run'; // run | cash | crash
  let paid = 0;
  let timer = null;
  const hist = () => (crashHistory.get(gid) ?? []).slice(-8).map((x) => `${x.toFixed(2)}x`).join(' • ') || '—';

  const bar = () => {
    const n = Math.min(20, Math.floor(Math.log(mult) / Math.log(100) * 20) + 1);
    return `${'🟩'.repeat(Math.min(n, 20))}${'⬛'.repeat(20 - Math.min(n, 20))}`;
  };

  const view = () => {
    let status;
    if (state === 'run') status = `Potensi: **${eco.coins(Math.floor(bet * mult))}**${auto ? ` • auto-cashout di **${auto}x**` : ''}\nTekan **Cashout** sebelum roket meledak!`;
    else if (state === 'cash') status = `✅ **Cashout di ${mult.toFixed(2)}x** → **${eco.coins(paid)}** (${paid >= bet ? '+' : ''}${eco.num(paid - bet)})\n_Roket meledak di ${cp.toFixed(2)}x_`;
    else status = `💥 **CRASH di ${cp.toFixed(2)}x!** Kamu kalah **−${eco.coins(bet)}**`;
    const e = embed(
      state === 'crash' ? '💥 Crash' : '🚀 Crash',
      `Taruhan **${eco.coins(bet)}**\n\n## ${state === 'crash' ? '💥' : '🚀'} ${(state === 'crash' ? cp : mult).toFixed(2)}x\n${state === 'crash' ? '🟥'.repeat(20) : bar()}\n\n${status}`,
      state === 'run' ? config.colors.main : state === 'cash' ? config.colors.success : config.colors.error,
    );
    e.setFooter({ text: `Riwayat crash: ${hist()}` });
    return { embeds: [e], components: [row(btn('arc:cr:cash', state === 'run' ? `Cashout ${eco.num(Math.floor(bet * mult))}` : 'Selesai', S.Success, '💰', state !== 'run'))] };
  };

  const pushHist = () => crashHistory.set(gid, [...(crashHistory.get(gid) ?? []).slice(-19), cp]);

  // crash instan (cp = 1.00x): tidak ada kesempatan cashout
  if (cp <= 1) {
    state = 'crash';
    eco.settle(gid, uid, bet, 0);
    pushHist();
    const ok = await open(interaction, view());
    if (!ok) eco.settle(gid, uid, bet, bet);
    return unlock();
  }

  const msg = await open(interaction, view());
  if (!msg) {
    eco.settle(gid, uid, bet, bet);
    return unlock();
  }
  const col = msg.createMessageComponentCollector({ filter: (i) => i.customId === 'arc:cr:cash' });

  const cashOut = () => {
    state = 'cash';
    paid = Math.floor(bet * mult);
    eco.settle(gid, uid, bet, paid);
    pushHist();
    clearTimeout(timer);
    col.stop('done');
  };

  const tick = async () => {
    if (state !== 'run') return;
    k++;
    const m = A.crashMult(k);
    if (m >= cp) {
      state = 'crash';
      eco.settle(gid, uid, bet, 0);
      pushHist();
      col.stop('done');
      return msg.edit(view()).catch(() => {});
    }
    mult = m;
    if ((auto && mult >= auto) || mult >= 100) {
      cashOut();
      return msg.edit(view()).catch(() => {});
    }
    await msg.edit(view()).catch(() => {});
    if (state === 'run') timer = setTimeout(tick, num('ARCADE_CRASH_TICK', 1200));
  };

  col.on('collect', async (i) => {
    if (i.user.id !== uid) return foreign(i, 'crash');
    if (state !== 'run') return i.deferUpdate().catch(() => {});
    cashOut();
    return upd(i, msg, view());
  });
  col.on('end', () => {
    unlock();
    clearTimeout(timer);
    if (state === 'run') {
      // kolektor berhenti tanpa hasil (mis. pesan dihapus): kembalikan taruhan
      state = 'cash';
      paid = bet;
      eco.settle(gid, uid, bet, bet);
    }
  });

  timer = setTimeout(tick, num('ARCADE_CRASH_TICK', 1200));
}

// ======================================================================= BOM WAKTU
async function bom(interaction) {
  const stake = interaction.options.getInteger('taruhan') ?? 0;
  const unlockCh = await C.lockChannel(interaction, 'Bom Waktu');
  if (!unlockCh) return;

  let res;
  try {
    res = await lobby.runLobby(interaction, {
      title: 'BOM WAKTU',
      emoji: '💣',
      rules: [
        '💣 **Bom waktu** berpindah-pindah di antara pemain.',
        '• Pemegang bom harus **mengoper** ke pemain lain secepatnya lewat menu.',
        '• Bom meledak di waktu **acak** (14–30 detik) — yang memegangnya **tereliminasi**.',
        '• Pemain terakhir yang selamat **menang**!',
      ].join('\n'),
      min: 2,
      max: 8,
      stake,
    });
  } catch (err) {
    unlockCh();
    throw err;
  }
  if (!res) return unlockCh();

  const { players, message } = res;
  const gid = interaction.guildId;
  let alive = [...players];
  let holder = null;
  let live = false;
  let passes = 0;
  let fuseTimer = null;
  let botTimer = null;
  let stopped = false;

  const render = (note = '') => {
    const others = alive.filter((p) => p.id !== holder?.id);
    const list = alive.map((p) => `${p.id === holder?.id ? '💣' : '❤️'} ${p.bot ? '🤖' : '👤'} **${p.name}**`).join('\n');
    const e = embed('💣 BOM WAKTU', `${holder ? `Bom ada di **${holder.name}**! ⏳ Oper secepatnya!` : 'Bersiap...'}\n\n${list}${note ? `\n\n${note}` : ''}`, config.colors.warn);
    e.setFooter({ text: `Sisa ${alive.length} pemain • ${passes} operan ronde ini` });
    const menu = new StringSelectMenuBuilder().setCustomId('arc:bm:pass').setPlaceholder(holder && !holder.bot ? '💣 Oper bom ke...' : holder ? '🤖 Bot sedang mengoper...' : '...')
      .setDisabled(!holder || holder.bot || !live);
    menu.addOptions(others.length ? others.slice(0, 25).map((p) => ({ label: p.name.slice(0, 100), value: p.id, emoji: p.bot ? '🤖' : '👤' })) : [{ label: '-', value: 'none' }]);
    return { content: '', embeds: [e], components: [row(menu)] };
  };

  const scheduleBot = () => {
    clearTimeout(botTimer);
    if (!live || !holder?.bot) return;
    botTimer = setTimeout(() => {
      if (!live || !holder?.bot) return;
      const others = alive.filter((p) => p.id !== holder.id);
      holder = others[A.rint(others.length)];
      passes++;
      message.edit(render()).catch(() => {});
      scheduleBot();
    }, num('ARCADE_BOM_BOT_MIN', 1500) + A.rint(num('ARCADE_BOM_BOT_SPAN', 2500)));
  };

  const col = message.createMessageComponentCollector({ filter: (i) => i.customId === 'arc:bm:pass' });
  col.on('collect', async (i) => {
    if (!live || i.user.id !== holder?.id) return ephemeral(i, '💣 Bom tidak ada di tanganmu!');
    const target = alive.find((p) => p.id === i.values?.[0]);
    if (!target || target.id === holder.id) return i.deferUpdate().catch(() => {});
    holder = target;
    passes++;
    await upd(i, message, render());
    scheduleBot();
  });

  const playRound = () => new Promise((resolve) => {
    holder = alive[A.rint(alive.length)];
    passes = 0;
    live = true;
    fuseTimer = setTimeout(() => {
      live = false;
      clearTimeout(botTimer);
      resolve(holder);
    }, num('ARCADE_BOM_MIN', 14_000) + A.rint(num('ARCADE_BOM_SPAN', 16_000)));
    message.edit(render()).catch(() => {});
    scheduleBot();
  });

  let winner = null;
  try {
    while (alive.length > 1 && !stopped) {
      if (alive.every((p) => p.bot)) break;
      const loser = await playRound();
      alive = alive.filter((p) => p.id !== loser.id);
      await message.edit({ content: '', embeds: [embed('💥 BOOM!', `💣 Bom meledak di tangan **${loser.name}**! ${loser.bot ? '🤖' : '👤'} tereliminasi.\n\nSisa pemain: ${alive.map((p) => `**${p.name}**`).join(', ')}`, config.colors.error)], components: [] }).catch(() => {});
      if (alive.length > 1) await sleep(num('ARCADE_BOM_PAUSE', 3000));
    }
    winner = alive.length === 1 ? alive[0] : alive.find((p) => !p.bot) ?? alive[0];
  } finally {
    clearTimeout(fuseTimer);
    clearTimeout(botTimer);
    col.stop('done');
    unlockCh();
  }

  let prize = '';
  if (winner && !winner.bot) {
    if (stake) prize = `\n💰 Hadiah pot: **${eco.coins(lobby.payout(gid, players, stake, winner.id))}**`;
    else {
      C.reward(gid, winner.id, 300);
      prize = `\n💰 Bonus: **${eco.coins(300)}**`;
    }
  } else if (stake) lobby.refundAll(gid, players, stake);
  await message.edit({
    content: '',
    embeds: [embed('🏆 Pemenang Bom Waktu', `${winner?.bot ? '🤖' : '🎉'} **${winner?.name ?? '—'}** selamat dari semua ledakan!${prize}`, config.colors.success)],
    components: [],
  }).catch(() => {});
}

module.exports = { game2048, ular, labirin, sapu, simon, poker, crash, bom, slideMaze, gridText };
