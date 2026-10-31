'use strict';

/** Kuis pilihan ganda multi-pemain: Kuis Umum & Tebak Bendera. */

const L = require('../utils/miniLogic');
const D = require('../utils/miniData');
const C = require('./common');
const { btn, row, embed, open, ephemeral, ButtonStyle: S, eco, config } = C;

const LETTERS = ['A', 'B', 'C', 'D'];

async function quizGame(interaction, { title, emoji, lockName, rounds, roundTime, makeRound }) {
  const unlock = await C.lockChannel(interaction, lockName);
  if (!unlock) return;
  const scores = new Map(); // userId -> benar
  const PER_CORRECT = 5000;
  let answers = new Map(); // userId -> { choice, at }
  let open_ = false;
  let startedAt = 0;
  let q = null;

  const board = () => [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id, n], k) => `${C.medal(k)} <@${id}> — **${n}**`).join('\n') || '_belum ada skor_';
  const view = (round, reveal = false) => ({
    embeds: [embed(`${emoji} ${title}`, `Ronde **${round}/${rounds}** ${reveal ? '' : `• jawab dalam ${roundTime} detik`}\n\n${q.prompt}\n\n${q.options.map((o, k) => `${reveal ? (k === q.correct ? '✅' : '▫️') : '▫️'} **${LETTERS[k]}.** ${o}`).join('\n')}${reveal ? `\n\n${answers.size} orang menjawab.` : `\n\nSudah menjawab: **${answers.size}**`}\n\n**Skor:**\n${board()}`, reveal ? config.colors.warn : config.colors.main)],
    components: reveal ? [] : [row(q.options.map((_, k) => btn(`mini:qz:${k}`, LETTERS[k], S.Primary)))],
  });

  q = makeRound(1);
  const msg = await open(interaction, view(1));
  if (!msg) return unlock();
  open_ = true;
  startedAt = Date.now();
  const col = msg.createMessageComponentCollector({ filter: (i) => i.customId.startsWith('mini:qz:') });
  col.on('collect', async (i) => {
    if (!open_) return i.deferUpdate().catch(() => {});
    if (answers.has(i.user.id)) return ephemeral(i, 'Kamu sudah menjawab ronde ini.');
    const choice = Number(i.customId.split(':')[2]);
    answers.set(i.user.id, { choice, at: Date.now() - startedAt });
    await ephemeral(i, `Jawabanmu **${LETTERS[choice]}** tercatat ✅ (kunci dibuka setelah waktu habis)`);
  });

  for (let r = 1; r <= rounds; r++) {
    if (r > 1) {
      q = makeRound(r);
      answers = new Map();
      open_ = true;
      startedAt = Date.now();
      await msg.edit(view(r)).catch(() => {});
    }
    await C.sleep(roundTime * 1000);
    open_ = false;
    const right = [...answers.entries()].filter(([, a]) => a.choice === q.correct).sort((a, b) => a[1].at - b[1].at);
    right.forEach(([id]) => scores.set(id, (scores.get(id) ?? 0) + 1));
    const fastest = right[0] ? `⚡ Tercepat: <@${right[0][0]}> (${(right[0][1].at / 1000).toFixed(1)} dtk)` : 'Tidak ada yang benar.';
    await msg.edit({ ...view(r, true), content: `Jawaban benar: **${LETTERS[q.correct]}. ${q.options[q.correct]}** • ${right.length} benar • ${fastest}` }).catch(() => {});
    if (r < rounds) await C.sleep(3500);
  }
  col.stop('done');
  unlock();
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  ranked.forEach(([id, n]) => C.reward(interaction.guildId, id, n * PER_CORRECT));
  await msg.edit({
    content: '',
    embeds: [embed(`${emoji} ${title} — Selesai`, `${ranked.length ? `🏆 Juara: <@${ranked[0][0]}> dengan **${ranked[0][1]}/${rounds}** benar!` : 'Tidak ada yang menjawab benar.'}\n\n**Skor akhir** (+${eco.coins(PER_CORRECT)} per jawaban benar):\n${board()}`, config.colors.success)],
    components: [],
  }).catch(() => {});
}

const kuis = (interaction) => {
  const n = interaction.options.getInteger('jumlah') ?? 5;
  const pool = L.shuffle(D.QUIZ).slice(0, n);
  return quizGame(interaction, {
    title: 'Kuis Pengetahuan', emoji: '🧠', lockName: 'Kuis', rounds: pool.length, roundTime: 15,
    makeRound: (r) => {
      const [text, right, wrong, cat] = pool[r - 1];
      const options = L.shuffle([right, ...wrong]);
      return { prompt: `**[${cat}]** ${text}`, options, correct: options.indexOf(right) };
    },
  });
};

const bendera = (interaction) => {
  const n = interaction.options.getInteger('jumlah') ?? 5;
  const pool = L.shuffle(D.FLAGS).slice(0, n);
  return quizGame(interaction, {
    title: 'Tebak Bendera', emoji: '🏳️', lockName: 'Tebak Bendera', rounds: pool.length, roundTime: 12,
    makeRound: (r) => {
      const [flag, name] = pool[r - 1];
      const wrong = L.shuffle(D.FLAGS.filter((f) => f[1] !== name)).slice(0, 3).map((f) => f[1]);
      const options = L.shuffle([name, ...wrong]);
      return { prompt: `Bendera negara apakah ini?\n# ${flag}`, options, correct: options.indexOf(name) };
    },
  });
};

module.exports = { kuis, bendera };
