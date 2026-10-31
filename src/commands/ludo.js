'use strict';

const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder,
} = require('discord.js');
const config = require('../config');
const eco = require('../utils/economy');
const L = require('../utils/ludoEngine');
const R = require('../utils/ludoRender');
const lobby = require('../utils/lobby');
const { fail } = require('../utils/helpers');

const HUMAN_TIMEOUT = 75_000;
const BOT_DELAY = Number(process.env.LUDO_BOT_DELAY ?? 1500);
const MAX_STRIKES = 3;
const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

const rulesFor = (mode, theme) => [
  `🎲 **Cara main:** lempar dadu & gerakkan pion lebih dulu sampai **finish** (${mode.pawns} pion).`,
  `• Mode **${mode.emoji} ${mode.name}**: ${mode.desc}`,
  '• Dadu **6** = giliran tambahan (3× 6 beruntun = hangus)',
  '• Mendarat di pion lawan = **tangkap** (kembali ke base) + giliran tambahan',
  '• ⭐ & petak start = aman • 2 pion sewarna di satu petak = benteng',
  '• Masuk finish harus dengan dadu **pas**',
  `• Tema papan: **${theme.emoji} ${theme.name}**`,
].join('\n');

/** Gambar papan (PNG) atau null kalau canvas tidak tersedia / dimatikan (LUDO_NO_IMAGE=1). */
function boardImage(s) {
  if (process.env.LUDO_NO_IMAGE === '1') return null;
  try {
    return R.renderBoard(s, s.phase === 'move' ? s.legal : []);
  } catch (err) {
    console.warn('[ludo] render gambar gagal:', err.message);
    return null;
  }
}

function buildView(s, note = '') {
  const p = L.cur(s);
  const c = L.COLORS[p.color];
  const over = s.phase === 'over';
  const png = boardImage(s);
  const visual = png
    ? { content: '', files: [new AttachmentBuilder(png, { name: 'ludo.png' })], attachments: [] }
    : { content: L.renderBoard(s, s.phase === 'move' ? s.legal : []), files: [], attachments: [] };
  const n = s.mode.pawns;

  const standing = s.players
    .map((pl) => `${L.COLORS[pl.color].pawn} ${pl.out ? '~~' : ''}**${pl.name}**${pl.out ? '~~' : ''}${pl.bot ? ' 🤖' : ''} — 🏁 ${L.finishedCount(pl)}/${n}`)
    .join('\n');

  const e = new EmbedBuilder().setColor(over ? config.colors.success : [0xed4245, 0x57f287, 0xfee75c, 0x5865f2][p.color]).setTitle(`🎲 LUDO — ${s.mode.emoji} ${s.mode.name}`);
  if (png) e.setImage('attachment://ludo.png');

  if (over && !s.winner) {
    e.setColor(config.colors.warn).setDescription(`🛑 Permainan dihentikan.\n\n${standing}${note ? `\n\n${note}` : ''}`);
    return { ...visual, embeds: [e], components: [] };
  }
  if (over) {
    e.setDescription(`🏆 **${s.winner.name}** memenangkan permainan!\n\n${standing}\n\n${s.log.slice(-4).join('\n')}${note ? `\n\n${note}` : ''}`);
    return { ...visual, embeds: [e], components: [] };
  }

  const pawnInfo = p.pawns.map((pos, i) => `${L.KEYCAPS[i]} ${L.pawnLabel(pos)}`).join(' • ');
  const dice = s.roll ? `${DICE[s.roll - 1]} **${s.roll}**` : '🎲';
  e.setDescription(
    [
      `${c.pawn} Giliran **${p.name}**${p.bot ? ' 🤖' : ` (<@${p.id}>)`} ${dice}`,
      s.phase === 'move' ? '👉 Pilih pion yang mau dijalankan (nomornya tampil di papan).' : p.bot ? '🤖 Bot sedang berpikir…' : '👉 Tekan **Lempar dadu**.',
      '',
      standing,
      '',
      `**Pionmu:** ${pawnInfo}`,
      '',
      s.log.slice(-5).join('\n') || '*Permainan dimulai!*',
      note ? `\n${note}` : '',
    ].join('\n'),
  );

  const rows = [];
  if (s.phase === 'move') {
    rows.push(
      new ActionRowBuilder().addComponents(
        p.pawns.map((_, i) =>
          new ButtonBuilder()
            .setCustomId(`ludo:pawn:${i}`)
            .setLabel(`Pion ${i + 1}`)
            .setEmoji(L.KEYCAPS[i])
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!s.legal.includes(i) || p.bot),
        ),
      ),
    );
  } else {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ludo:roll').setLabel('Lempar dadu').setEmoji('🎲').setStyle(ButtonStyle.Success).setDisabled(p.bot),
      ),
    );
  }
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ludo:quit').setLabel('Menyerah').setEmoji('🏳️').setStyle(ButtonStyle.Secondary)));
  return { ...visual, embeds: [e], components: rows };
}

async function startGame(interaction, lobbyResult, { mode, theme }) {
  const { players, message, stake } = lobbyResult;
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const s = L.createGame(players, { mode, theme });
  const run = lobby.makeQueue();
  const strikes = new Map();
  let timer = null;
  let ended = false;

  const collector = message.createMessageComponentCollector({ filter: (i) => i.customId.startsWith('ludo:') });
  const clearTimer = () => timer && clearTimeout(timer);

  const render = (note) => message.edit(buildView(s, note)).catch((err) => console.warn('[ludo] edit gagal:', err.code ?? err.message));

  const end = async (note) => {
    if (ended) return;
    ended = true;
    clearTimer();
    collector.stop('over');
    let extra = note ?? '';
    if (s.winner && stake > 0) {
      const pot = lobby.payout(guildId, players, stake, s.winner.id);
      extra += `\n💰 **${s.winner.name}** membawa pulang pot **${eco.coins(pot)}**!`;
    } else if (!s.winner && stake > 0) {
      lobby.refundAll(guildId, players, stake);
      extra += '\n💰 Taruhan dikembalikan.';
    }
    await render(extra.trim());
    lobby.release(channelId);
  };

  const schedule = () => {
    clearTimer();
    if (ended) return;
    if (s.phase === 'over') return run(() => end());
    if (!s.players.some((x) => !x.bot && !x.out)) {
      s.phase = 'over';
      return run(() => end('Semua pemain manusia sudah pergi.'));
    }
    const p = L.cur(s);
    timer = setTimeout(() => run(() => (p.bot ? botStep() : idleStep())), p.bot ? BOT_DELAY : HUMAN_TIMEOUT);
  };

  /** Lempar + (kalau cuma 1 pilihan) jalan otomatis. Return true bila masih harus memilih pion. */
  const doRoll = () => {
    const info = L.rollDice(s);
    if (info.auto !== null && info.auto !== undefined) L.movePawn(s, info.auto);
    return s.phase === 'move';
  };

  async function botStep() {
    if (ended || s.phase === 'over') return;
    const p = L.cur(s);
    if (!p.bot) return;
    if (s.phase === 'roll') {
      L.rollDice(s);
    }
    if (s.phase === 'move') L.movePawn(s, L.botChoose(s));
    await render();
    schedule();
  }

  async function idleStep() {
    if (ended || s.phase === 'over') return;
    const idx = s.turn;
    const p = L.cur(s);
    const n = (strikes.get(p.id) ?? 0) + 1;
    strikes.set(p.id, n);
    let note = `⏰ **${p.name}** terlalu lama, langkah dijalankan otomatis (${n}/${MAX_STRIKES}).`;
    if (n >= MAX_STRIKES) {
      p.bot = true;
      note = `🤖 **${p.name}** AFK terlalu lama — pionnya diambil alih bot.`;
    }
    if (s.phase === 'roll') L.rollDice(s);
    if (s.phase === 'move') L.movePawn(s, L.botChoose(s));
    await render(note);
    if (s.players[idx]) schedule();
  }

  collector.on('collect', async (i) => {
    const pi = s.players.findIndex((p) => p.id === i.user.id && !p.bot && !p.out);
    const deny = (t) => i.reply({ content: t, flags: MessageFlags.Ephemeral }).catch(() => {});
    if (pi === -1 && !players.some((p) => p.id === i.user.id)) return deny('Kamu bukan pemain di game ini.');
    if (pi === -1) return deny('Kamu sudah keluar dari game ini.');

    if (i.customId === 'ludo:quit') {
      await i.deferUpdate().catch(() => {});
      return run(async () => {
        if (ended) return;
        L.removePlayer(s, pi);
        if (s.phase === 'over') return end(`🏳️ Lawan menyerah — ${s.winner.name} menang.`);
        await render();
        schedule();
      });
    }

    if (pi !== s.turn) return deny('Belum giliranmu ya 🙂');
    await i.deferUpdate().catch(() => {});

    run(async () => {
      if (ended || pi !== s.turn) return;
      const p = s.players[pi];
      strikes.set(p.id, 0);
      if (i.customId === 'ludo:roll' && s.phase === 'roll') {
        doRoll();
      } else if (i.customId.startsWith('ludo:pawn:') && s.phase === 'move') {
        const n = Number(i.customId.split(':')[2]);
        if (!s.legal.includes(n)) return;
        L.movePawn(s, n);
      } else {
        return;
      }
      await render();
      schedule();
    });
  });

  await render();
  schedule();
}

module.exports = [
  {
    data: new SlashCommandBuilder()
      .setName('ludo')
      .setDescription('Main Ludo 2–4 pemain: 3 mode, 4 tema papan, bot & taruhan koin')
      .setDMPermission(false)
      .addStringOption((o) =>
        o.setName('mode').setDescription('Varian permainan (bawaan: Klasik)').addChoices(
          ...Object.values(L.MODES).map((m) => ({ name: `${m.emoji} ${m.name} — ${m.pawns} pion`, value: m.id })),
        ),
      )
      .addStringOption((o) =>
        o.setName('tema').setDescription('Tema papan (bawaan: Klasik)').addChoices(
          ...Object.values(R.THEMES).map((t) => ({ name: `${t.emoji} ${t.name}`, value: t.id })),
        ),
      )
      .addIntegerOption((o) =>
        o.setName('taruhan').setDescription('Taruhan masuk per pemain (pemenang ambil pot). Kosong = tanpa taruhan').setMinValue(10).setMaxValue(1_000_000),
      ),
    async execute(interaction) {
      const stake = interaction.options.getInteger('taruhan') ?? 0;
      const mode = L.MODES[interaction.options.getString('mode')] ?? L.MODES.klasik;
      const theme = R.getTheme(interaction.options.getString('tema'));
      const running = lobby.runningIn(interaction.channelId);
      if (running) return fail(interaction, `Di channel ini sedang ada game **${running}**. Tunggu selesai atau pakai channel lain.`);
      lobby.claim(interaction.channelId, 'Ludo');
      try {
        const res = await lobby.runLobby(interaction, { title: 'LUDO', emoji: '🎲', rules: rulesFor(mode, theme), min: 2, max: 4, stake });
        if (!res) return lobby.release(interaction.channelId);
        await startGame(interaction, res, { mode: mode.id, theme: theme.id });
      } catch (err) {
        lobby.release(interaction.channelId);
        throw err;
      }
    },
  },
];
