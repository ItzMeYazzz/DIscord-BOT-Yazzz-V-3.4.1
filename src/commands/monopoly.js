'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags,
} = require('discord.js');
const config = require('../config');
const eco = require('../utils/economy');
const M = require('../utils/monopolyEngine');
const { isOwnable, MAP_LIST, getMap } = require('../utils/monopolyMaps');
const render = require('../utils/monopolyRender');
const lobby = require('../utils/lobby');
const { fail } = require('../utils/helpers');

const { fmt } = M;
const BOT_DELAY = Number(process.env.MONO_BOT_DELAY ?? 1600);
const HUMAN_TIMEOUT = Number(process.env.MONO_HUMAN_TIMEOUT ?? 120_000);
const AUCTION_WINDOW = Number(process.env.MONO_AUCTION_WINDOW ?? 25_000);
const MAX_STRIKES = 3;
const DOTS = ['🔴', '🟢', '🟠', '🔵', '🟣', '🟡']; // sama dengan warna pion di gambar papan

const rulesFor = (map, rounds) => [
  `${map.emoji} **Monopoli — ${map.name}** (${map.subtitle})`,
  `_${map.desc}_`,
  `• Uang awal **$${map.startCash.toLocaleString('id-ID')}**, lewat START **+$${map.goSalary}**, dadu kembar = lempar lagi (3× = penjara)`,
  '• Properti tak dibeli → **dilelang** • Set warna penuh = sewa 2× & boleh bangun rumah/hotel',
  '• Bisa **gadai**, **dagang** antar pemain, dan jual bangunan untuk bayar utang',
  map.rule ? `• ${map.rule}` : null,
  `• Game berhenti di batas ronde${rounds ? ` (**${rounds}**)` : ''}: **kekayaan bersih** tertinggi menang`,
].filter(Boolean).join('\n');

const sqLabel = (s, i) => {
  const sq = s.map.board[i];
  const g = sq.type === 'property' ? `${s.map.groups[sq.group].emoji} ` : sq.type === 'rail' ? '🚉 ' : sq.type === 'util' ? '💡 ' : '';
  return `${g}${sq.name}`;
};

// ------------------------------------------------------------------ tampilan utama
function playersField(s) {
  return s.players
    .map((p, i) => {
      const props = M.ownedBy(s, i).length;
      const tags = [p.inJail ? `🚓 penjara ${p.jailTurns}/3` : null, p.jailCards.length ? `🎫×${p.jailCards.length}` : null, p.bot ? '🤖' : null].filter(Boolean).join(' ');
      if (p.bankrupt) return `${DOTS[i]} ~~${p.name}~~ 💀`;
      return `${DOTS[i]} **${p.name}** ${tags}\n┗ ${fmt(p.cash)} • 📍${s.map.board[p.pos].name} • 🏘️${props}`;
    })
    .join('\n');
}

function promptFor(s) {
  const p = M.cur(s);
  const who = `${DOTS[s.turn]} **${p.name}**${p.bot ? ' 🤖' : ` (<@${p.id}>)`}`;
  switch (s.phase) {
    case 'roll':
      if (p.inJail) return `${who} sedang di **penjara** (percobaan ${p.jailTurns}/3). Lempar dadu (kembar = bebas), bayar ${fmt(s.map.jailFine)}${p.jailCards.length ? ' atau pakai kartu' : ''}.`;
      return `${who} — giliranmu! ${s.rolledDoubles ? '(dadu kembar, lempar lagi) ' : ''}Tekan **Lempar dadu**.`;
    case 'buy': {
      const sq = s.map.board[s.pending];
      const extra = sq.type === 'property' ? ` • sewa awal ${fmt(sq.rent[0])}` : '';
      return `${who} mendarat di **${sqLabel(s, sq.index)}**.\nHarga **${fmt(sq.price)}**${extra}. Beli, atau lelang ke semua pemain?`;
    }
    case 'auction': {
      const a = s.auction;
      const hi = a.highBy !== null ? `**${fmt(a.high)}** oleh ${DOTS[a.highBy]} ${s.players[a.highBy].name}` : '_belum ada tawaran_';
      return `🔨 **LELANG ${sqLabel(s, a.pos)}** (harga normal ${fmt(s.map.board[a.pos].price)})\nTertinggi: ${hi}\nSemua pemain boleh menawar — lelang berakhir kalau semua *pass* atau ${Math.round(AUCTION_WINDOW / 1000)} dtk tanpa tawaran baru.`;
    }
    case 'debt':
      return `⚠️ ${who} berutang **${fmt(s.debt.amount)}**${s.debt.reason ? ` (${s.debt.reason})` : ''}, uang ${fmt(p.cash)}.\nJual rumah / gadai properti lewat **Kelola**, lalu **Bayar utang** — atau menyerah.`;
    case 'after':
      return `${who} — bisa **Kelola** aset / **Dagang**, lalu **Akhiri giliran**.`;
    default:
      return '';
  }
}

function mainButtons(s) {
  if (s.phase === 'over') return [];
  const p = M.cur(s);
  const rows = [];
  const btn = (id, label, style, emoji, disabled = false) => {
    const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
    if (emoji) b.setEmoji(emoji);
    return b;
  };
  const Pri = ButtonStyle.Primary, Suc = ButtonStyle.Success, Sec = ButtonStyle.Secondary, Dan = ButtonStyle.Danger;

  if (s.phase === 'roll') {
    const row = [btn('mono:roll', 'Lempar dadu', Suc, '🎲', p.bot)];
    if (p.inJail) {
      row.push(btn('mono:jailpay', `Bayar ${fmt(s.map.jailFine)}`, Sec, '💰', p.bot || p.cash < s.map.jailFine));
      if (p.jailCards.length) row.push(btn('mono:jailcard', 'Pakai kartu', Sec, '🎫', p.bot));
    }
    rows.push(new ActionRowBuilder().addComponents(row));
  } else if (s.phase === 'buy') {
    const sq = s.map.board[s.pending];
    rows.push(new ActionRowBuilder().addComponents(
      btn('mono:buy', `Beli ${fmt(sq.price)}`, Suc, '🏷️', p.bot || p.cash < sq.price),
      btn('mono:decline', 'Lelang', Pri, '🔨', p.bot),
    ));
  } else if (s.phase === 'auction') {
    rows.push(new ActionRowBuilder().addComponents(
      btn('mono:bid:10', '+10', Pri, '🔨'), btn('mono:bid:50', '+50', Pri), btn('mono:bid:100', '+100', Pri), btn('mono:bid:500', '+500', Pri),
      btn('mono:pass', 'Pass', Sec, '✋'),
    ));
  } else if (s.phase === 'debt') {
    rows.push(new ActionRowBuilder().addComponents(
      btn('mono:paydebt', 'Bayar utang', Suc, '💸', p.bot || p.cash < s.debt.amount),
      btn('mono:bankrupt', 'Bangkrut', Dan, '💀', p.bot),
    ));
  } else if (s.phase === 'after') {
    rows.push(new ActionRowBuilder().addComponents(btn('mono:end', 'Akhiri giliran', Suc, '⏭️', p.bot)));
  }
  rows.push(new ActionRowBuilder().addComponents(
    btn('mono:manage', 'Kelola', Sec, '🏠'),
    btn('mono:trade', 'Dagang', Sec, '🤝', s.phase === 'auction' || s.phase === 'debt'),
    btn('mono:props', 'Properti', Sec, '📋'),
    btn('mono:quit', 'Menyerah', Dan, '🏳️'),
  ));
  return rows;
}

function buildMain(s, note = '', stake = 0) {
  const p = M.cur(s);
  const over = s.phase === 'over';
  const e = new EmbedBuilder()
    .setColor(over ? config.colors.success : [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d, 0x8e44ad, 0xe9c46a][s.turn % 6])
    .setTitle(over ? `${s.map.emoji} MONOPOLI ${s.map.name.toUpperCase()} — Selesai` : `${s.map.emoji} MONOPOLI ${s.map.name.toUpperCase()}`);

  if (over) {
    const rank = s.ranking.map((r, i) => `${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`} **${r.p.name}** — ${r.w < 0 ? 'bangkrut 💀' : `kekayaan ${fmt(r.w)}`}`).join('\n');
    e.setDescription(`🏆 **${s.winner.name}** menang!\n_${s.overReason ?? ''}_\n\n${rank}${note ? `\n\n${note}` : ''}`);
  } else {
    e.setDescription(`${promptFor(s)}${note ? `\n\n${note}` : ''}`);
  }
  e.addFields(
    { name: 'Pemain', value: playersField(s).slice(0, 1024) },
    { name: 'Kejadian terakhir', value: s.log.slice(-5).join('\n').slice(0, 1024) || '—' },
  );
  e.setFooter({ text: `Ronde ${Math.min(s.rounds + 1, s.maxRounds || 999)}${s.maxRounds ? `/${s.maxRounds}` : ''}${s.map.parkingPot ? ` • 🅿️ Jackpot ${fmt(s.pot)}` : ''}${stake ? ` • Pot ${eco.coins(stake * s.players.filter((x) => !x.bot).length)}` : ''}` });

  const files = [];
  let png = null;
  try {
    if (process.env.MONO_NO_IMAGE !== '1') png = render.renderBoard(s);
  } catch (err) {
    console.warn('[monopoly] render gagal:', err.message);
  }
  if (png) {
    files.push(new AttachmentBuilder(png, { name: 'monopoli.png' }));
    e.setImage('attachment://monopoli.png');
  } else if (!over) {
    e.addFields({ name: 'Posisi', value: s.players.filter((x) => !x.bankrupt).map((x) => `${DOTS[s.players.indexOf(x)]} ${sqLabel(s, x.pos)}`).join('\n').slice(0, 1024) });
  }
  return { content: '', embeds: [e], components: mainButtons(s), files, attachments: [] };
}

// ------------------------------------------------------------------ panel kelola aset
const STATUS = (s, i) => {
  const sq = s.map.board[i];
  if (s.mortgaged[i]) return 'GADAI';
  if (sq.type !== 'property') return sq.type === 'rail' ? 'Stasiun' : 'Utilitas';
  const h = s.houses[i];
  return h === 5 ? 'Hotel' : h ? `${h} rumah` : M.hasSet(s, s.owner[i], sq.group) ? 'Set penuh' : 'Kosong';
};

function manageView(s, pi, sel, page = 0) {
  const p = s.players[pi];
  const mine = M.ownedBy(s, pi);
  const e = new EmbedBuilder().setColor(config.colors.main).setTitle(`🏠 Kelola aset — ${p.name}`);
  const lines = mine.map((i) => `${sqLabel(s, i)} — ${STATUS(s, i)}`);
  e.setDescription(`💵 Uang: **${fmt(p.cash)}** • Kekayaan bersih: **${fmt(M.netWorth(s, pi))}**\n\n${lines.join('\n') || '_Belum punya properti._'}`.slice(0, 4000));

  const rows = [];
  if (mine.length) {
    const pages = Math.ceil(mine.length / 25);
    const pg = Math.min(page, pages - 1);
    const slice = mine.slice(pg * 25, pg * 25 + 25);
    rows.push(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`mono:m:sel:${pg}`).setPlaceholder('Pilih properti…').addOptions(
        slice.map((i) => ({ label: s.map.board[i].name.slice(0, 100), description: STATUS(s, i), value: String(i), default: i === sel })),
      ),
    ));
    if (sel !== null && s.owner[sel] === pi) {
      const b = M.canBuild(s, pi, sel), sl = M.canSell(s, pi, sel), mg = M.canMortgage(s, pi, sel), um = M.canUnmortgage(s, pi, sel);
      const sq = s.map.board[sel];
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('mono:m:build').setLabel(b.ok ? `Bangun −${fmt(b.cost)}` : 'Bangun').setEmoji('🏠').setStyle(ButtonStyle.Success).setDisabled(!b.ok),
        new ButtonBuilder().setCustomId('mono:m:sell').setLabel(sl.ok ? `Jual +${fmt(sl.refund)}` : 'Jual rumah').setEmoji('🏚️').setStyle(ButtonStyle.Secondary).setDisabled(!sl.ok),
        new ButtonBuilder().setCustomId('mono:m:mort').setLabel(mg.ok ? `Gadai +${fmt(mg.gain)}` : 'Gadai').setEmoji('🏦').setStyle(ButtonStyle.Secondary).setDisabled(!mg.ok),
        new ButtonBuilder().setCustomId('mono:m:unmort').setLabel(um.ok ? `Tebus −${fmt(um.cost)}` : 'Tebus').setEmoji('🔓').setStyle(ButtonStyle.Secondary).setDisabled(!um.ok),
      ));
      const why = [b, sl, mg, um].filter((x) => !x.ok && x.why && !/Tidak sedang|Tidak ada bangunan|Sudah digadai|Sudah hotel/.test(x.why))[0]?.why;
      e.setFooter({ text: `${sq.name}${sq.type === 'property' ? ` • rumah ${fmt(sq.house)}/unit` : ''}${why ? ` • ${why}` : ''}` });
    }
    if (pages > 1) {
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`mono:m:page:${pg - 1}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(pg === 0),
        new ButtonBuilder().setCustomId(`mono:m:page:${pg + 1}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(pg >= pages - 1),
      ));
    }
  }
  return { embeds: [e], components: rows, content: '' };
}

function propsView(s) {
  const parts = s.players.map((p, i) => {
    if (p.bankrupt) return `${DOTS[i]} ~~${p.name}~~ 💀`;
    const mine = M.ownedBy(s, i);
    const body = mine.length ? mine.map((x) => `• ${sqLabel(s, x)} — ${STATUS(s, x)}`).join('\n') : '_belum ada_';
    return `${DOTS[i]} **${p.name}** (${fmt(p.cash)}, kekayaan ${fmt(M.netWorth(s, i))})\n${body}`;
  });
  const free = s.map.board.filter((q) => isOwnable(q) && s.owner[q.index] === null).map((q) => q.name);
  const e = new EmbedBuilder().setColor(config.colors.main).setTitle('📋 Properti semua pemain').setDescription(parts.join('\n\n').slice(0, 3800));
  if (free.length) e.addFields({ name: `Masih milik bank (${free.length})`, value: free.join(', ').slice(0, 1024) });
  return { embeds: [e], components: [], content: '' };
}

// ------------------------------------------------------------------ dagang
function tradableProps(s, pi) {
  return M.ownedBy(s, pi).filter((i) => {
    const sq = s.map.board[i];
    return !(sq.type === 'property' && s.map.groupMembers[sq.group].some((j) => s.houses[j] > 0));
  });
}

function tradeDraftView(s, d) {
  const a = s.players[d.from], b = s.players[d.to];
  const list = (arr) => (arr.length ? arr.map((i) => `• ${sqLabel(s, i)}`).join('\n') : '_tidak ada_');
  const e = new EmbedBuilder().setColor(config.colors.warn).setTitle(`🤝 Dagang dengan ${b.name}`).addFields(
    { name: `Kamu beri (${a.name})`, value: `${list(d.giveProps)}\n💵 ${fmt(d.giveCash)}`, inline: true },
    { name: `Kamu minta (${b.name})`, value: `${list(d.getProps)}\n💵 ${fmt(d.getCash)}`, inline: true },
  );
  const mk = (id, ph, arr, options) =>
    new StringSelectMenuBuilder().setCustomId(id).setPlaceholder(ph).setMinValues(0).setMaxValues(Math.max(1, Math.min(options.length, 25)))
      .addOptions(options.slice(0, 25).map((i) => ({ label: s.map.board[i].name, value: String(i), default: arr.includes(i), description: STATUS(s, i) })));
  const rows = [];
  const mineT = tradableProps(s, d.from), theirT = tradableProps(s, d.to);
  if (mineT.length) rows.push(new ActionRowBuilder().addComponents(mk('mono:t:give', 'Properti yang kamu beri…', d.giveProps, mineT)));
  if (theirT.length) rows.push(new ActionRowBuilder().addComponents(mk('mono:t:get', `Properti yang kamu minta dari ${b.name}…`, d.getProps, theirT)));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mono:t:cash').setLabel('Atur uang').setEmoji('💵').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mono:t:send').setLabel('Kirim tawaran').setEmoji('📨').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('mono:t:cancel').setLabel('Batal').setStyle(ButtonStyle.Danger),
  ));
  return { embeds: [e], components: rows, content: '' };
}

function tradePicker(s, pi) {
  const others = s.players.map((p, i) => ({ p, i })).filter((x) => x.i !== pi && !x.p.bankrupt);
  const e = new EmbedBuilder().setColor(config.colors.warn).setTitle('🤝 Dagang').setDescription('Pilih pemain yang mau diajak dagang.');
  if (!others.length) return { embeds: [e.setDescription('Tidak ada pemain lain.')], components: [], content: '' };
  return {
    embeds: [e],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('mono:t:who').setPlaceholder('Pilih pemain…').addOptions(others.map((x) => ({ label: x.p.name.slice(0, 100), value: String(x.i), description: `${fmt(x.p.cash)} • ${M.ownedBy(s, x.i).length} properti` }))),
    )],
    content: '',
  };
}

// ------------------------------------------------------------------ permainan
async function startGame(interaction, lobbyResult, rounds, mapId) {
  const { players, message, stake } = lobbyResult;
  const guildId = interaction.guildId;
  const channel = interaction.channel;
  const s = M.createGame(players, { rounds, map: mapId });
  const run = lobby.makeQueue();
  const strikes = new Map();
  const drafts = new Map(); // userId -> draft dagang
  const selected = new Map(); // userId -> properti terpilih di panel
  const offers = new Map(); // id -> { offer, msg, timer }
  let offerSeq = 0;
  let botTimer = null;
  let idleTimer = null;
  let ended = false;

  const clearTimers = () => {
    if (botTimer) clearTimeout(botTimer);
    if (idleTimer) clearTimeout(idleTimer);
    botTimer = idleTimer = null;
  };
  const refresh = (note = '') => message.edit(buildMain(s, note, stake)).catch((err) => console.warn('[monopoly] edit gagal:', err.code ?? err.message));
  const log = (t) => { s.log.push(t); if (s.log.length > 8) s.log.shift(); };
  const humanIdx = (id) => s.players.findIndex((p) => p.id === id && !p.bot && !p.bankrupt);

  const collector = channel.createMessageComponentCollector({ filter: (i) => i.customId.startsWith('mono:') });

  const finish = async () => {
    if (ended) return;
    ended = true;
    clearTimers();
    collector.stop('over');
    await Promise.all([...offers.keys()].map((oid) => closeOffer(oid, '🏁 Game sudah selesai.', config.colors.warn)));
    let note = '';
    if (stake > 0) {
      if (s.winner && !s.winner.bot) {
        const pot = lobby.payout(guildId, players, stake, s.winner.id);
        note = `💰 **${s.winner.name}** membawa pulang pot **${eco.coins(pot)}**!`;
      } else {
        lobby.refundAll(guildId, players, stake);
        note = '💰 Taruhan dikembalikan.';
      }
    }
    await refresh(note);
    lobby.release(interaction.channelId);
  };

  // ---- penjadwalan: bot bergerak otomatis, manusia punya batas waktu
  function schedule() {
    clearTimers();
    if (ended) return;
    if (s.phase === 'over') return void run(finish);
    if (!s.players.some((p) => !p.bot && !p.bankrupt)) {
      s.phase = 'over';
      s.winner = null;
      s.ranking = s.players.map((p, i) => ({ p, w: p.bankrupt ? -1 : M.netWorth(s, i) })).sort((a, b) => b.w - a.w);
      s.winner = s.ranking[0].p;
      s.overReason = 'Semua pemain manusia sudah pergi.';
      return void run(finish);
    }
    const botCanAct = s.phase === 'auction'
      ? s.players.some((p, i) => p.bot && !p.bankrupt && !s.auction.passed.has(i) && s.auction.highBy !== i)
      : M.cur(s).bot;
    if (botCanAct) botTimer = setTimeout(() => run(botAct), BOT_DELAY);
    if (s.phase === 'auction') idleTimer = setTimeout(() => run(idleAct), AUCTION_WINDOW);
    else if (!M.cur(s).bot) idleTimer = setTimeout(() => run(idleAct), HUMAN_TIMEOUT);
  }

  async function botAct() {
    if (ended || s.phase === 'over') return;
    // bot menanggapi tawaran dagang ditangani terpisah
    M.botStep(s);
    await refresh();
    schedule();
  }

  async function idleAct() {
    if (ended || s.phase === 'over') return;
    let note = '';
    if (s.phase === 'auction') {
      M.auctionEnd(s);
    } else {
      const p = M.cur(s);
      const n = (strikes.get(p.id) ?? 0) + 1;
      strikes.set(p.id, n);
      note = `⏰ **${p.name}** terlalu lama — langkah dijalankan otomatis (${n}/${MAX_STRIKES}).`;
      if (n >= MAX_STRIKES) {
        p.bot = true;
        note = `🤖 **${p.name}** AFK terlalu lama — aset diambil alih bot.`;
      }
      if (s.phase === 'buy') M.declineBuy(s);
      else M.botStep(s);
    }
    await refresh(note);
    schedule();
  }

  // ---- tawaran dagang
  async function sendOffer(offer, fromName) {
    const id = ++offerSeq;
    const a = s.players[offer.from], b = s.players[offer.to];
    const list = (arr) => (arr.length ? arr.map((i) => sqLabel(s, i)).join(', ') : '—');
    const e = new EmbedBuilder().setColor(config.colors.warn).setTitle('🤝 Tawaran dagang').setDescription(
      `**${a.name}** menawarkan ke **${b.name}**:\n\n` +
      `📤 ${a.name} beri: ${list(offer.giveProps)}${offer.giveCash ? ` + ${fmt(offer.giveCash)}` : ''}\n` +
      `📥 ${a.name} minta: ${list(offer.getProps)}${offer.getCash ? ` + ${fmt(offer.getCash)}` : ''}`,
    );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`mono:o:acc:${id}`).setLabel('Terima').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`mono:o:rej:${id}`).setLabel('Tolak').setEmoji('❌').setStyle(ButtonStyle.Danger),
    );
    const msg = await channel.send({ content: b.bot ? '' : `<@${b.id}>`, embeds: [e], components: [row], allowedMentions: { users: b.bot ? [] : [b.id] } }).catch(() => null);
    if (!msg) return false;
    const timer = setTimeout(() => closeOffer(id, '⌛ Tawaran kedaluwarsa.'), 90_000);
    offers.set(id, { offer, msg, timer, embed: e });
    if (b.bot) setTimeout(() => run(() => botRespond(id)), 1800);
    void fromName;
    return true;
  }

  async function closeOffer(id, text, color = config.colors.error) {
    const o = offers.get(id);
    if (!o) return;
    clearTimeout(o.timer);
    offers.delete(id);
    o.embed.setColor(color).setFooter({ text });
    await o.msg.edit({ embeds: [o.embed], components: [], content: '' }).catch(() => {});
  }

  async function resolveOffer(id, accept) {
    const o = offers.get(id);
    if (!o) return;
    if (!accept) return closeOffer(id, '❌ Ditolak.');
    const res = M.executeTrade(s, o.offer);
    if (!res.ok) return closeOffer(id, `⚠️ Gagal: ${res.why}`);
    await closeOffer(id, '✅ Disepakati!', config.colors.success);
    await refresh();
    schedule();
  }

  async function botRespond(id) {
    const o = offers.get(id);
    if (!o || ended) return;
    resolveOffer(id, M.tradeValue(s, o.offer, 'to') >= 40);
  }

  // ---- handler interaksi
  collector.on('collect', async (i) => {
    const id = i.customId;
    // Diagnosa: Discord hanya memberi waktu 3 detik untuk membalas klik. Kalau log ini muncul,
    // klik sudah telat SEBELUM kode game dijalankan (jaringan/DNS lambat atau event loop sibuk).
    const lag = Date.now() - i.createdTimestamp;
    if (lag > 2000) console.warn(`[monopoly] klik "${id}" baru sampai ke bot ${lag} ms setelah ditekan (batas 3000 ms) -> bisa muncul "interaction failed".`);
    const deny = (t) => i.reply({ content: t, flags: MessageFlags.Ephemeral }).catch(() => {});
    const pi = humanIdx(i.user.id);

    // tawaran dagang boleh dijawab oleh penerima saja
    if (id.startsWith('mono:o:')) {
      const [, , act, oid] = id.split(':');
      const o = offers.get(Number(oid));
      if (!o) return deny('Tawaran ini sudah tidak berlaku.');
      if (o.offer.to !== pi) return deny('Tawaran ini bukan untukmu.');
      await i.deferUpdate().catch(() => {});
      return void run(() => resolveOffer(Number(oid), act === 'acc'));
    }

    if (pi === -1) return deny(players.some((p) => p.id === i.user.id) ? 'Kamu sudah keluar dari game ini.' : 'Kamu bukan pemain di game ini.');
    if (s.phase === 'over') return deny('Game sudah selesai.');
    const isTurn = pi === s.turn;

    // ----- tombol pribadi (ephemeral)
    if (id === 'mono:manage') {
      await i.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      return void run(() => i.editReply(manageView(s, pi, selected.get(i.user.id) ?? null)).catch(() => {}));
    }
    if (id === 'mono:props') {
      await i.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      return void run(() => i.editReply(propsView(s)).catch(() => {}));
    }
    if (id === 'mono:trade') {
      if (s.phase === 'auction' || s.phase === 'debt') return deny('Dagang tidak bisa saat lelang atau utang.');
      await i.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      return void run(() => i.editReply(tradePicker(s, pi)).catch(() => {}));
    }
    if (id === 'mono:quit') {
      return i.reply({
        content: 'Yakin mau **menyerah**? Asetmu kembali ke bank.',
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mono:quit:yes').setLabel('Ya, menyerah').setStyle(ButtonStyle.Danger))],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
    if (id === 'mono:quit:yes') {
      await i.update({ content: 'Kamu menyerah. 🏳️', components: [] }).catch(() => {});
      return void run(async () => {
        if (ended || s.players[pi].bankrupt) return;
        log(`🏳️ **${s.players[pi].name}** menyerah.`);
        M.bankrupt(s, pi, null);
        await refresh();
        schedule();
      });
    }
    // ----- panel kelola
    if (id.startsWith('mono:m:')) {
      await i.deferUpdate().catch(() => {});
      return void run(async () => {
        if (ended) return;
        let sel = selected.get(i.user.id) ?? null;
        let page = 0;
        const [, , act, arg] = id.split(':');
        if (act === 'sel') {
          sel = Number(i.values[0]);
          selected.set(i.user.id, sel);
          page = Number(arg) || 0;
        } else if (act === 'page') {
          page = Number(arg) || 0;
        } else if (sel !== null) {
          const fn = { build: M.build, sell: M.sellHouse, mort: M.mortgage, unmort: M.unmortgage }[act];
          if (fn) {
            const r = fn(s, pi, sel);
            if (!r.ok) await i.followUp({ content: r.why, flags: MessageFlags.Ephemeral }).catch(() => {});
            await refresh();
            if (s.phase === 'debt') schedule();
          }
        }
        await i.editReply(manageView(s, pi, sel, page)).catch(() => {});
      });
    }

    // ----- dagang (draft)
    if (id.startsWith('mono:t:')) {
      const act = id.split(':')[2];
      if (act === 'cash') {
        const d = drafts.get(i.user.id);
        if (!d) return deny('Mulai dagang lagi dari tombol **Dagang**.');
        const modal = new ModalBuilder().setCustomId(`mono:tm:${i.user.id}`).setTitle('Uang dalam tawaran').addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('give').setLabel('Uang yang kamu BERI ($)').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(d.giveCash)).setMaxLength(7)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('get').setLabel('Uang yang kamu MINTA ($)').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(d.getCash)).setMaxLength(7)),
        );
        await i.showModal(modal).catch(() => {});
        const sub = await i.awaitModalSubmit({ time: 120_000, filter: (m) => m.customId === `mono:tm:${i.user.id}` && m.user.id === i.user.id }).catch(() => null);
        if (!sub) return;
        await sub.deferUpdate().catch(() => {});
        return void run(async () => {
          const num = (v) => Math.max(0, Math.min(9_999_999, parseInt(String(v).replace(/\D/g, ''), 10) || 0));
          d.giveCash = num(sub.fields.getTextInputValue('give'));
          d.getCash = num(sub.fields.getTextInputValue('get'));
          await sub.editReply(tradeDraftView(s, d)).catch(() => {});
        });
      }
      await i.deferUpdate().catch(() => {});
      return void run(async () => {
        if (act === 'who') {
          const to = Number(i.values[0]);
          if (!s.players[to] || s.players[to].bankrupt) return;
          const d = { from: pi, to, giveProps: [], getProps: [], giveCash: 0, getCash: 0 };
          drafts.set(i.user.id, d);
          return void (await i.editReply(tradeDraftView(s, d)).catch(() => {}));
        }
        const d = drafts.get(i.user.id);
        if (!d) return void (await i.editReply({ content: 'Sesi dagang berakhir.', embeds: [], components: [] }).catch(() => {}));
        if (act === 'give') d.giveProps = i.values.map(Number);
        else if (act === 'get') d.getProps = i.values.map(Number);
        else if (act === 'cancel') {
          drafts.delete(i.user.id);
          return void (await i.editReply({ content: 'Dagang dibatalkan.', embeds: [], components: [] }).catch(() => {}));
        } else if (act === 'send') {
          const v = M.validateTrade(s, d);
          if (!v.ok) {
            await i.followUp({ content: `⚠️ ${v.why}`, flags: MessageFlags.Ephemeral }).catch(() => {});
          } else if (s.phase === 'auction' || s.phase === 'debt') {
            await i.followUp({ content: 'Dagang tidak bisa saat lelang atau utang.', flags: MessageFlags.Ephemeral }).catch(() => {});
          } else {
            drafts.delete(i.user.id);
            await sendOffer({ ...d }, s.players[pi].name);
            return void (await i.editReply({ content: '📨 Tawaran terkirim ke channel!', embeds: [], components: [] }).catch(() => {}));
          }
        }
        await i.editReply(tradeDraftView(s, d)).catch(() => {});
      });
    }

    // ----- lelang: semua pemain boleh ikut
    if (id.startsWith('mono:bid:') || id === 'mono:pass') {
      if (s.phase !== 'auction') return deny('Tidak ada lelang yang berlangsung.');
      await i.deferUpdate().catch(() => {});
      return void run(async () => {
        if (ended || s.phase !== 'auction') return;
        if (id === 'mono:pass') M.auctionPass(s, pi);
        else {
          const r = M.auctionBid(s, pi, s.auction.high + Number(id.split(':')[2]));
          if (!r.ok) return void (await i.followUp({ content: r.why, flags: MessageFlags.Ephemeral }).catch(() => {}));
        }
        await refresh();
        schedule();
      });
    }

    // ----- aksi giliran
    if (!isTurn) return deny('Belum giliranmu ya 🙂');
    await i.deferUpdate().catch(() => {});
    run(async () => {
      if (ended || pi !== s.turn) return;
      strikes.set(s.players[pi].id, 0);
      let ok = false;
      switch (id) {
        case 'mono:roll': if (s.phase === 'roll') { M.rollDice(s); ok = true; } break;
        case 'mono:jailpay': ok = M.payJailFine(s); break;
        case 'mono:jailcard': ok = M.useJailCard(s); break;
        case 'mono:buy': ok = M.buy(s); break;
        case 'mono:decline': ok = M.declineBuy(s); break;
        case 'mono:end': ok = M.endTurn(s); break;
        case 'mono:paydebt': ok = M.settleDebt(s); break;
        case 'mono:bankrupt':
          if (s.phase === 'debt') { M.bankrupt(s, pi, s.debt.creditor); ok = true; }
          break;
        default:
      }
      if (!ok) return;
      await refresh();
      schedule();
    });
  });

  await refresh();
  schedule();
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('monopoly')
      .setDescription('Main Monopoli 2–6 pemain: 5 peta, lelang, gadai, dagang, bot, taruhan')
      .setDMPermission(false)
      .addStringOption((o) =>
        o.setName('peta').setDescription('Pilih peta (bawaan: Nusantara)').addChoices(
          ...MAP_LIST.map((m) => ({ name: `${m.emoji} ${m.name}`, value: m.id })),
        ),
      )
      .addIntegerOption((o) =>
        o.setName('durasi').setDescription('Lama permainan (bawaan: Normal)').addChoices(
          { name: 'Cepat — 20 ronde', value: 20 },
          { name: 'Normal — 40 ronde', value: 40 },
          { name: 'Panjang — 80 ronde', value: 80 },
        ),
      )
      .addIntegerOption((o) =>
        o.setName('taruhan').setDescription('Taruhan masuk per pemain (pemenang ambil pot). Kosong = tanpa taruhan').setMinValue(10).setMaxValue(1_000_000),
      ),
    async execute(interaction) {
      const stake = interaction.options.getInteger('taruhan') ?? 0;
      const rounds = interaction.options.getInteger('durasi') ?? 40;
      const map = getMap(interaction.options.getString('peta'));
      const running = lobby.runningIn(interaction.channelId);
      if (running) return fail(interaction, `Di channel ini sedang ada game **${running}**. Tunggu selesai atau pakai channel lain.`);
      lobby.claim(interaction.channelId, 'Monopoly');
      try {
        const res = await lobby.runLobby(interaction, { title: `MONOPOLI — ${map.name}`, emoji: map.emoji, rules: rulesFor(map, rounds), min: 2, max: 6, stake });
        if (!res) return lobby.release(interaction.channelId);
        await startGame(interaction, res, rounds, map.id);
      } catch (err) {
        lobby.release(interaction.channelId);
        throw err;
      }
    },
  },
];
