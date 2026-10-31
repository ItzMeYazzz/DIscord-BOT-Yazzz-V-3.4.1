'use strict';

/**
 * Prefix command ("yz play lofi", "yz skip", "yz mini wordle" ...).
 * Memakai ulang semua slash command lewat adaptor — slash command tetap utuh.
 */

const { Events } = require('discord.js');
const config = require('../config');
const { error } = require('../utils/helpers');
const { T, tokenize, parseOptions, usageOf, PrefixInteraction, PrefixOptions } = require('../utils/prefixAdapter');

// Singkatan (hanya dipasang kalau command tujuannya ada)
const ALIASES = {
  p: 'play', pl: 'play', sc: { command: 'play', preset: { source: 'soundcloud' } },
  find: 'search', cari: 'search',
  s: 'skip', next: 'skip', np: 'nowplaying', now: 'nowplaying', q: 'queue', vol: 'volume', v: 'volume',
  l: 'loop', mix: 'shuffle', cq: 'clearqueue', dc: 'stop', leave: 'stop', disconnect: 'stop',
  bal: 'balance', saldo: 'balance', lb: 'leaderboard', top: 'leaderboard',
  h: 'help', bantuan: 'help', ui: 'userinfo', si: 'serverinfo', av: 'avatar', pfp: 'avatar',
  bj: 'blackjack', cf: 'coinflip',
  ttt: { command: 'mini', sub: 'tictactoe' }, c4: { command: 'mini', sub: 'connect4' },
};

const COOLDOWN_MS = 700;
const lastUse = new Map();

/** nama -> { command, sub?, preset? }  (nama command, singkatan, dan nama game /mini & /arcade) */
function buildIndex(client) {
  const map = new Map();
  for (const [name, command] of client.commands) map.set(name, { command });

  for (const [alias, target] of Object.entries(ALIASES)) {
    const t = typeof target === 'string' ? { command: target } : target;
    const command = client.commands.get(t.command);
    if (command && !map.has(alias)) map.set(alias, { command, sub: t.sub, preset: t.preset });
  }

  // "yz wordle" = "yz mini wordle", "yz 2048" = "yz arcade 2048" (kalau namanya tidak bentrok)
  const subs = new Map();
  for (const command of client.commands.values()) {
    if (!['mini', 'arcade'].includes(command.category)) continue;
    for (const o of command.data.toJSON().options ?? []) {
      if (o.type !== T.SUB || o.name === 'daftar') continue;
      subs.set(o.name, subs.has(o.name) ? null : { command, sub: o.name });
    }
  }
  for (const [name, v] of subs) if (v && !map.has(name)) map.set(name, v);
  return map;
}

const reply = (message, text, extra = {}) =>
  message.reply({ embeds: [error(text)], allowedMentions: { parse: [], repliedUser: false }, ...extra }).catch(() => {});

async function handle(client, message) {
  if (!config.prefix.enabled || message.author.bot || !message.guild || !message.content) return;

  const prefix = config.prefix.text;
  const content = message.content;
  if (content.slice(0, prefix.length).toLowerCase() !== prefix) return;
  const rest = content.slice(prefix.length).trimStart();
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(rest);
  if (!m) return;

  client.prefixIndex ??= buildIndex(client);
  const target = client.prefixIndex.get(m[1].toLowerCase());
  if (!target) return; // bukan command kita: abaikan diam-diam
  const { command } = target;
  const args = m[2] ?? '';

  const now = Date.now();
  if (now - (lastUse.get(message.author.id) ?? 0) < COOLDOWN_MS) return;
  lastUse.set(message.author.id, now);

  if (command.ownerOnly && !config.ownerIds.includes(message.author.id)) return reply(message, 'Command ini khusus owner bot.');
  const json = command.data.toJSON();
  if (json.default_member_permissions && !message.member?.permissions.has(BigInt(json.default_member_permissions))) {
    return reply(message, 'Kamu tidak punya izin untuk command ini.');
  }

  const name = target.alias ?? command.data.name;
  const ctx = { client, message, guild: message.guild };
  let defs = json.options ?? [];
  let tokens = tokenize(args);
  let sub = target.sub ?? null;
  let group = null;

  // subcommand (dan grup subcommand)
  if (defs.some((o) => o.type === T.SUB || o.type === T.GROUP)) {
    const pick = (list, tk) => {
      if (!tk) return null;
      const n = tk.raw.toLowerCase();
      return list.find((o) => o.name.toLowerCase() === n) ?? null;
    };
    const subsOf = (list) => list.filter((o) => o.type === T.SUB || o.type === T.GROUP).map((o) => o.name).join(', ');
    if (!sub) {
      const found = pick(defs.filter((o) => o.type === T.SUB || o.type === T.GROUP), tokens[0]);
      if (!found) {
        return reply(message, `Pemakaian: \`${prefix} ${name} <${subsOf(defs)}>\`${tokens[0] ? `\nSubcommand **${tokens[0].raw}** tidak dikenal.` : ''}`);
      }
      tokens = tokens.slice(1);
      if (found.type === T.GROUP) {
        group = found.name;
        const inner = pick(found.options ?? [], tokens[0]);
        if (!inner) return reply(message, `Pemakaian: \`${prefix} ${name} ${found.name} <${subsOf(found.options ?? [])}>\``);
        tokens = tokens.slice(1);
        sub = inner.name;
        defs = inner.options ?? [];
      } else {
        sub = found.name;
        defs = found.options ?? [];
      }
    } else {
      defs = defs.find((o) => o.name === sub)?.options ?? [];
    }
  }

  const parsed = await parseOptions(defs, tokens, args, ctx, target.preset);
  const label = sub ? `${name} ${sub}` : name;
  if (parsed.error === 'missing') {
    return reply(message, `Argumen kurang: **${parsed.missing}**\nPemakaian: \`${usageOf(prefix, label, defs)}\``);
  }
  if (parsed.error) return reply(message, `${parsed.error}\nPemakaian: \`${usageOf(prefix, label, defs)}\``);

  const members = new Map();
  for (const v of parsed.values.values()) {
    if (v?.id && v.username !== undefined) {
      const mem = message.guild.members.cache.get(v.id) ?? (await message.guild.members.fetch(v.id).catch(() => null));
      if (mem) members.set(v.id, mem);
    }
  }

  const adapter = new PrefixInteraction({
    client,
    message,
    command,
    options: new PrefixOptions(parsed.values, { subcommand: sub, group, members }),
  });

  try {
    await command.execute(adapter, client);
  } catch (err) {
    console.error(`[prefix:${command.data.name}]`, err);
    const payload = { embeds: [error('Terjadi error saat menjalankan command. Cek izin bot lalu coba lagi.')] };
    if (adapter.sent) await adapter.sent.edit({ ...payload, content: '' }).catch(() => {});
    else await message.reply({ ...payload, allowedMentions: { parse: [], repliedUser: false } }).catch(() => {});
  }
}

module.exports = [
  {
    name: Events.MessageCreate,
    execute(client, message) {
      return handle(client, message).catch((err) => console.error('[prefix]', err));
    },
  },
];
module.exports.buildIndex = buildIndex;
