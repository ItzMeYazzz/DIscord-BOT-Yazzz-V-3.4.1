'use strict';

/** Game seru-seruan: Reaksi, Duel Dadu, Truth or Dare, Pilih Salah Satu, Roda Keberuntungan. */

const L = require('../utils/miniLogic');
const D = require('../utils/miniData');
const C = require('./common');
const { fail } = require('../utils/helpers');
const { btn, row, embed, open, ephemeral, ButtonStyle: S, eco, config } = C;

// ======================================================= REAKSI
async function reaksi(interaction) {
  const unlock = await C.lockChannel(interaction, 'Reaksi');
  if (!unlock) return;
  let ready = false, over = false, goAt = 0;
  const out = new Set();

  const view = (label, style, text, disabled = false) => ({ embeds: [embed('⚡ Uji Reaksi', text)], components: [row(btn('mini:rx', label, style, null, disabled))] });
  const msg = await open(interaction, view('Tunggu…', S.Secondary, 'Bersiap… tombol akan berubah **hijau**. Klik secepat mungkin setelah hijau!\n⚠️ Klik sebelum hijau = **gugur**.'));
  if (!msg) return unlock();
  const col = msg.createMessageComponentCollector({ filter: (i) => i.customId === 'mini:rx', time: 60_000 });

  col.on('collect', async (i) => {
    if (over) return i.deferUpdate().catch(() => {});
    if (!ready) {
      out.add(i.user.id);
      return ephemeral(i, '😬 Terlalu cepat! Kamu gugur di ronde ini.');
    }
    if (out.has(i.user.id)) return ephemeral(i, 'Kamu sudah gugur.');
    over = true;
    const ms = Date.now() - goAt;
    C.reward(interaction.guildId, i.user.id, 300);
    col.stop('done');
    await i.update({ embeds: [embed('⚡ Uji Reaksi', `🏆 <@${i.user.id}> tercepat dengan **${ms} ms**!\n💰 +${eco.coins(300)}${out.size ? `\n💥 Gugur: ${[...out].map((id) => `<@${id}>`).join(', ')}` : ''}`, config.colors.success)], components: [row(btn('mini:rx', 'Selesai', S.Success, null, true))] }).catch(() => {});
  });

  await C.sleep(2000 + L.rnd(5000));
  if (over) return unlock();
  ready = true;
  goAt = Date.now();
  await msg.edit(view('KLIK SEKARANG!', S.Success, '🟢 **SEKARANG!**')).catch(() => {});
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'time' && !over) {
      over = true;
      msg.edit(view('Selesai', S.Secondary, '⌛ Tidak ada yang klik. Game selesai.', true)).catch(() => {});
    }
  });
}

// ======================================================= DUEL DADU (PvP + taruhan)
async function duel(interaction) {
  const opp = interaction.options.getUser('lawan', true);
  const bet = interaction.options.getInteger('taruhan', true);
  if (opp.bot || opp.id === interaction.user.id) return fail(interaction, 'Pilih lawan manusia lain.');
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  if (!(await C.takeBet(interaction, bet))) return unlock();
  const g = interaction.guildId;

  const msg = await open(interaction, {
    content: `<@${opp.id}>`,
    allowedMentions: { users: [opp.id] },
    embeds: [embed('🎲 Duel Dadu', `<@${interaction.user.id}> menantang <@${opp.id}> adu dadu!\nTaruhan masing-masing **${eco.coins(bet)}** — pemenang membawa **${eco.coins(bet * 2)}**.`, config.colors.warn)],
    components: [row(btn('mini:du:yes', 'Terima', S.Success, '✅'), btn('mini:du:no', 'Tolak', S.Danger, '❌'))],
  });
  if (!msg) {
    eco.settle(g, interaction.user.id, bet, bet);
    return unlock();
  }
  const col = msg.createMessageComponentCollector({ time: 60_000, filter: (i) => i.customId.startsWith('mini:du:') });
  let settled = false;
  const refund = (text) => {
    if (settled) return;
    settled = true;
    eco.settle(g, interaction.user.id, bet, bet);
    msg.edit({ content: '', embeds: [embed('🎲 Duel Dadu', text, config.colors.error)], components: [] }).catch(() => {});
  };

  col.on('collect', async (i) => {
    if (i.user.id === interaction.user.id && i.customId === 'mini:du:no') {
      col.stop('cancel');
      await i.deferUpdate().catch(() => {});
      return refund('Tantangan dibatalkan penantang. Taruhan dikembalikan.');
    }
    if (i.user.id !== opp.id) return ephemeral(i, 'Tantangan ini bukan untukmu.');
    if (i.customId === 'mini:du:no') {
      col.stop('declined');
      await i.deferUpdate().catch(() => {});
      return refund(`<@${opp.id}> menolak tantangan. Taruhan dikembalikan.`);
    }
    if (!eco.tryTake(g, opp.id, bet)) return ephemeral(i, `Saldomu tidak cukup untuk taruhan **${eco.coins(bet)}**.`);
    settled = true;
    col.stop('accepted');
    await i.update({ content: '', embeds: [embed('🎲 Duel Dadu', 'Mengocok dadu…')], components: [] }).catch(() => {});
    await C.sleep(1200);
    let a, b;
    do {
      a = [L.rnd(6) + 1, L.rnd(6) + 1];
      b = [L.rnd(6) + 1, L.rnd(6) + 1];
    } while (a[0] + a[1] === b[0] + b[1] && Math.random() < 0.6); // seri tetap mungkin tapi jarang
    const sa = a[0] + a[1], sb = b[0] + b[1];
    const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
    const show = (x) => `${faces[x[0] - 1]} ${faces[x[1] - 1]} = **${x[0] + x[1]}**`;
    let result;
    if (sa === sb) {
      eco.settle(g, interaction.user.id, bet, bet);
      eco.settle(g, opp.id, bet, bet);
      result = '🤝 **Seri!** Taruhan dikembalikan.';
    } else {
      const winner = sa > sb ? interaction.user.id : opp.id;
      const loser = sa > sb ? opp.id : interaction.user.id;
      eco.settle(g, winner, bet, bet * 2);
      eco.settle(g, loser, bet, 0);
      result = `🏆 <@${winner}> menang **${eco.coins(bet * 2)}** (laba ${eco.coins(bet)})!`;
    }
    await msg.edit({ embeds: [embed('🎲 Duel Dadu', `<@${interaction.user.id}>: ${show(a)}\n<@${opp.id}>: ${show(b)}\n\n${result}`, config.colors.success)] }).catch(() => {});
  });
  col.on('end', (_, reason) => {
    unlock();
    if (reason === 'time') refund(`<@${opp.id}> tidak menjawab. Taruhan dikembalikan.`);
  });
}

// ======================================================= TRUTH OR DARE
async function tod(interaction) {
  const target = interaction.options.getUser('untuk') ?? interaction.user;
  const view = (kind, text) => ({
    embeds: [embed(kind === 'truth' ? '🫣 TRUTH' : kind === 'dare' ? '🔥 DARE' : '🎭 Truth or Dare', `Untuk <@${target.id}>:\n\n${text ?? 'Pilih **Truth** atau **Dare**!'}`, kind === 'dare' ? 0xe67e22 : config.colors.main)],
    components: [row(btn('mini:td:truth', 'Truth', S.Primary, '🫣'), btn('mini:td:dare', 'Dare', S.Danger, '🔥'), btn('mini:td:rand', 'Acak', S.Secondary, '🎲'))],
  });
  const msg = await open(interaction, view('idle'));
  if (!msg) return;
  const col = msg.createMessageComponentCollector({ idle: 120_000, filter: (i) => i.customId.startsWith('mini:td:') });
  col.on('collect', async (i) => {
    let kind = i.customId.split(':')[2];
    if (kind === 'rand') kind = Math.random() < 0.5 ? 'truth' : 'dare';
    await i.update(view(kind, L.pick(kind === 'truth' ? D.TRUTHS : D.DARES))).catch(() => {});
  });
  col.on('end', () => msg.edit({ components: [] }).catch(() => {}));
}

// ======================================================= PILIH SALAH SATU (vote)
async function pilih(interaction) {
  const [a, b] = L.pick(D.WYR);
  const votes = new Map(); // userId -> 0|1
  const tally = () => [0, 1].map((k) => [...votes.values()].filter((v) => v === k).length);
  const bar = (n, total) => `${'█'.repeat(total ? Math.round((n / total) * 10) : 0)}${'░'.repeat(10 - (total ? Math.round((n / total) * 10) : 0))}`;
  const view = (done = false) => {
    const [x, y] = tally();
    const t = x + y;
    return {
      embeds: [embed('🤔 Pilih Salah Satu', `**A.** ${a}\n${bar(x, t)} **${x}** (${t ? Math.round((x / t) * 100) : 0}%)\n\n**B.** ${b}\n${bar(y, t)} **${y}** (${t ? Math.round((y / t) * 100) : 0}%)\n\n${done ? '🔒 Voting ditutup.' : 'Voting terbuka 60 detik — kamu boleh mengubah pilihan.'}`, done ? config.colors.success : config.colors.main)],
      components: done ? [] : [row(btn('mini:wy:0', 'A', S.Primary), btn('mini:wy:1', 'B', S.Danger))],
    };
  };
  const msg = await open(interaction, view());
  if (!msg) return;
  const col = msg.createMessageComponentCollector({ time: 60_000, filter: (i) => i.customId.startsWith('mini:wy:') });
  col.on('collect', (i) => {
    votes.set(i.user.id, Number(i.customId.split(':')[2]));
    i.update(view()).catch(() => {});
  });
  col.on('end', () => msg.edit(view(true)).catch(() => {}));
}

// ======================================================= RODA KEBERUNTUNGAN (taruhan)
async function roda(interaction) {
  const bet = interaction.options.getInteger('taruhan', true);
  const unlock = await C.lockUser(interaction);
  if (!unlock) return;
  if (!(await C.takeBet(interaction, bet))) return unlock();
  const wheelText = (idx) => L.WHEEL.map((s, k) => `${k === idx ? '👉' : '▫️'} ${s.label}`).join('\n');

  const msg = await open(interaction, { embeds: [embed('🎡 Roda Keberuntungan', `Taruhan **${eco.coins(bet)}**\n\n${wheelText(0)}\n\nRoda berputar…`)] });
  if (!msg) {
    eco.settle(interaction.guildId, interaction.user.id, bet, bet);
    return unlock();
  }
  const result = L.wheelSpin();
  const target = L.WHEEL.indexOf(result);
  try {
    let idx = 0;
    for (let step = 0; step < 14; step++) {
      idx = (idx + 1) % L.WHEEL.length;
      if (step % 2 === 1) await msg.edit({ embeds: [embed('🎡 Roda Keberuntungan', `Taruhan **${eco.coins(bet)}**\n\n${wheelText(idx)}\n\nRoda berputar…`)] }).catch(() => {});
      await C.sleep(260);
    }
  } catch { /* animasi opsional */ }
  const returned = Math.floor(bet * result.mult);
  const balance = eco.settle(interaction.guildId, interaction.user.id, bet, returned);
  const net = returned - bet;
  await msg.edit({
    embeds: [embed(`🎡 Roda Keberuntungan — ${result.label}`, `${wheelText(target)}\n\n${net > 0 ? `✅ **Menang +${eco.coins(net)}**` : net === 0 ? '🤝 **Impas — taruhan kembali**' : returned > 0 ? `⚠️ **Rugi ${eco.coins(-net)}** (sebagian kembali)` : `❌ **Kalah −${eco.coins(bet)}**`}\nSaldo: **${eco.num(balance)}** koin`, net > 0 ? config.colors.success : net === 0 ? config.colors.warn : config.colors.error)],
  }).catch(() => {});
  unlock();
}

module.exports = { reaksi, duel, tod, pilih, roda };
