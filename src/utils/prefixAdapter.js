'use strict';

/**
 * Adaptor prefix command: mengubah pesan "yz <command> <argumen>" menjadi objek yang meniru
 * ChatInputCommandInteraction, sehingga SEMUA slash command yang sudah ada bisa dipakai lewat prefix
 * tanpa menulis ulang. Slash command tetap berfungsi seperti biasa.
 */

const T = { SUB: 1, GROUP: 2, STRING: 3, INTEGER: 4, BOOLEAN: 5, USER: 6, CHANNEL: 7, ROLE: 8, MENTIONABLE: 9, NUMBER: 10, ATTACHMENT: 11 };

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------------------------------------------------------------- tokenizer
/** Pecah teks jadi token; "teks berspasi" dan key:"teks berspasi" dihitung satu token. */
function tokenize(text) {
  const re = /([A-Za-z_][A-Za-z0-9_-]*:)?(?:"([^"]*)"|'([^']*)')|\S+/g;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    let key = null;
    let value = raw;
    if (m[2] !== undefined || m[3] !== undefined) {
      key = m[1] ? m[1].slice(0, -1).toLowerCase() : null;
      value = m[2] ?? m[3];
    } else {
      const k = /^([A-Za-z_][A-Za-z0-9_-]*):(.+)$/.exec(raw);
      if (k) {
        key = k[1].toLowerCase();
        value = k[2];
      }
    }
    out.push({ raw, key, value, start: m.index, end: m.index + raw.length });
  }
  return out;
}

const stripQuotes = (s) => {
  const t = s.trim();
  return t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) ? t.slice(1, -1) : t;
};

// ---------------------------------------------------------------- konversi nilai
function matchChoice(opt, text) {
  if (!opt.choices?.length) return undefined;
  const n = norm(text);
  if (!n) return undefined;
  const exact = opt.choices.find((c) => norm(c.value) === n || norm(c.name) === n);
  if (exact) return exact.value;
  const pref = opt.choices.filter((c) => norm(c.name).startsWith(n) || norm(c.value).startsWith(n));
  return pref.length === 1 ? pref[0].value : undefined;
}

function parseNumber(text, integer) {
  let t = String(text).trim().toLowerCase().replace(/_/g, '');
  const suffix = /([kmb])$/.exec(t);
  const mult = suffix ? { k: 1e3, m: 1e6, b: 1e9 }[suffix[1]] : 1;
  if (suffix) t = t.slice(0, -1);
  if (integer) {
    t = t.replace(/[.,](?=\d{3}(\D|$))/g, ''); // 1.000 / 1,000 -> 1000
    if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(t)) return NaN;
    const v = Number(t.replace(',', '.')) * mult;
    return Number.isInteger(v) ? v : NaN;
  }
  if (!/^[+-]?\d+(?:[.,]\d+)?$/.test(t)) return NaN;
  return Number(t.replace(',', '.')) * mult;
}

async function resolveUser(text, ctx) {
  const m = /^<@!?(\d{15,25})>$/.exec(text) ?? /^(\d{15,25})$/.exec(text);
  if (m) return ctx.message.mentions.users.get(m[1]) ?? (await ctx.client.users.fetch(m[1]).catch(() => null));
  const name = text.replace(/^@/, '').toLowerCase();
  if (!name) return null;
  const member = ctx.guild.members.cache.find((mm) => mm.user.username.toLowerCase() === name || mm.displayName.toLowerCase() === name);
  return member?.user ?? null;
}

async function coerce(opt, text, ctx) {
  switch (opt.type) {
    case T.STRING: {
      if (opt.choices?.length) {
        const c = matchChoice(opt, text);
        return c === undefined ? { ok: false, reason: `pilihan: ${opt.choices.map((x) => x.name).join(', ')}` } : { ok: true, value: c };
      }
      if (opt.max_length && text.length > opt.max_length) return { ok: false, reason: `maksimal ${opt.max_length} karakter` };
      return { ok: true, value: text };
    }
    case T.INTEGER:
    case T.NUMBER: {
      if (opt.choices?.length) {
        const c = matchChoice(opt, text);
        if (c !== undefined) return { ok: true, value: c };
      }
      const v = parseNumber(text, opt.type === T.INTEGER);
      if (Number.isNaN(v)) return { ok: false, reason: 'harus berupa angka' };
      if (opt.min_value !== undefined && v < opt.min_value) return { ok: false, reason: `minimal ${opt.min_value}` };
      if (opt.max_value !== undefined && v > opt.max_value) return { ok: false, reason: `maksimal ${opt.max_value}` };
      return { ok: true, value: v };
    }
    case T.BOOLEAN: {
      const n = norm(text);
      if (['ya', 'yes', 'y', 'true', 'on', '1', 'aktif', 'hidup'].includes(n)) return { ok: true, value: true };
      if (['tidak', 'no', 'n', 'false', 'off', '0', 'mati', 'nonaktif'].includes(n)) return { ok: true, value: false };
      return { ok: false, reason: 'ya / tidak' };
    }
    case T.USER: {
      const u = await resolveUser(text, ctx);
      return u ? { ok: true, value: u } : { ok: false, reason: 'user tidak ditemukan (pakai @mention atau ID)' };
    }
    case T.CHANNEL: {
      const id = /^<#(\d+)>$/.exec(text)?.[1] ?? (/^\d{15,25}$/.test(text) ? text : null);
      const ch = id ? ctx.guild.channels.cache.get(id) : ctx.guild.channels.cache.find((c) => c.name?.toLowerCase() === text.replace(/^#/, '').toLowerCase());
      return ch ? { ok: true, value: ch } : { ok: false, reason: 'channel tidak ditemukan (pakai #channel)' };
    }
    case T.ROLE:
    case T.MENTIONABLE: {
      const id = /^<@&(\d+)>$/.exec(text)?.[1] ?? (/^\d{15,25}$/.test(text) ? text : null);
      const role = id ? ctx.guild.roles.cache.get(id) : ctx.guild.roles.cache.find((r) => r.name.toLowerCase() === text.replace(/^@/, '').toLowerCase());
      if (role) return { ok: true, value: role };
      if (opt.type === T.MENTIONABLE) return coerce({ ...opt, type: T.USER }, text, ctx);
      return { ok: false, reason: 'role tidak ditemukan (pakai @role)' };
    }
    default:
      return { ok: false, reason: 'jenis argumen ini tidak bisa lewat prefix (pakai slash command)' };
  }
}

// ---------------------------------------------------------------- parser argumen
/**
 * Petakan token ke opsi command. Mendukung:
 *  - bernama:      source:soundcloud  taruhan:500  query:"lofi beats"
 *  - berurutan:    yz coinflip heads 500
 *  - string rakus: opsi string tanpa pilihan mengambil sisa kalimat (yz play lofi beats)
 *  - pilihan di ekor: "yz play lofi soundcloud" -> source=soundcloud
 */
async function parseOptions(defs, tokens, text, ctx, preset = {}) {
  const values = new Map(Object.entries(preset));
  const names = new Map(defs.map((o) => [o.name.toLowerCase(), o]));

  const pos = [];
  for (const tk of tokens) {
    if (tk.key && names.has(tk.key)) {
      const r = await coerce(names.get(tk.key), tk.value, ctx);
      if (!r.ok) return { error: `Nilai **${tk.key}** tidak valid: ${r.reason}` };
      values.set(names.get(tk.key).name, r.value);
    } else {
      // token "kunci:nilai" yang bukan opsi (mis. URL https://...) diperlakukan sebagai teks biasa
      pos.push({ ...tk, value: tk.key ? tk.raw : tk.value });
    }
  }

  const remaining = defs.filter((o) => !values.has(o.name));
  let i = 0;
  for (let k = 0; k < remaining.length && i < pos.length; k++) {
    const opt = remaining[k];
    if (values.has(opt.name)) continue;
    if (opt.type === T.STRING && !opt.choices?.length) {
      let end = pos.length;
      const later = remaining.slice(k + 1).find((o) => !values.has(o.name) && o.choices?.length);
      if (later && end - i > 1) {
        const c = matchChoice(later, pos[end - 1].value);
        if (c !== undefined) {
          values.set(later.name, c);
          end--;
        }
      }
      values.set(opt.name, stripQuotes(text.slice(pos[i].start, pos[end - 1].end)));
      i = pos.length;
      break;
    }
    const r = await coerce(opt, pos[i].value, ctx);
    if (r.ok) {
      values.set(opt.name, r.value);
      i++;
    } else if (opt.required) {
      return { error: `Nilai **${opt.name}** tidak valid: ${r.reason}` };
    }
    // opsi opsional yang tidak cocok: dilewati tanpa memakan token
  }

  for (const o of defs) if (o.required && !values.has(o.name)) return { error: 'missing', missing: o.name };
  return { values };
}

function usageOf(prefix, cmdName, defs) {
  const parts = defs.map((o) => {
    const hint = o.choices?.length && o.choices.length <= 5 ? o.choices.map((c) => String(c.name).split(' ')[0].toLowerCase()).join('|') : o.name;
    return o.required ? `<${hint}>` : `[${hint}]`;
  });
  return `${prefix} ${cmdName}${parts.length ? ` ${parts.join(' ')}` : ''}`;
}

// ---------------------------------------------------------------- objek mirip Interaction
class PrefixOptions {
  constructor(values, { subcommand = null, group = null, members = new Map() } = {}) {
    this._v = values;
    this._sub = subcommand;
    this._group = group;
    this._members = members;
  }
  _get(name, required) {
    const v = this._v.get(name);
    if (v === undefined) {
      if (required) throw new Error(`Argumen wajib "${name}" tidak ada`);
      return null;
    }
    return v;
  }
  get(name, required = false) { return this._get(name, required); }
  getString(name, required = false) { return this._get(name, required); }
  getInteger(name, required = false) { return this._get(name, required); }
  getNumber(name, required = false) { return this._get(name, required); }
  getBoolean(name, required = false) { return this._get(name, required); }
  getUser(name, required = false) { return this._get(name, required); }
  getChannel(name, required = false) { return this._get(name, required); }
  getRole(name, required = false) { return this._get(name, required); }
  getMentionable(name, required = false) { return this._get(name, required); }
  getMember(name) {
    const u = this._v.get(name);
    return u ? this._members.get(u.id) ?? null : null;
  }
  getSubcommand(required = true) {
    if (!this._sub && required) throw new Error('Tidak ada subcommand');
    return this._sub;
  }
  getSubcommandGroup(required = false) {
    if (!this._group && required) throw new Error('Tidak ada grup');
    return this._group;
  }
}

class PrefixInteraction {
  constructor({ client, message, command, options }) {
    this.client = client;
    this.message = message;
    this.commandName = command.data.name;
    this.command = command;
    this.options = options;
    this.id = message.id;
    this.createdTimestamp = message.createdTimestamp;
    this.user = message.author;
    this.member = message.member;
    this.memberPermissions = message.member?.permissions ?? null;
    this.guild = message.guild;
    this.guildId = message.guildId;
    this.channel = message.channel;
    this.channelId = message.channelId;
    this.deferred = false;
    this.replied = false;
    this.sent = null;
    this.isPrefix = true;
  }

  isChatInputCommand() { return true; }
  isMessageComponent() { return false; }
  isButton() { return false; }
  isRepliable() { return true; }
  inGuild() { return true; }
  inCachedGuild() { return true; }

  /** Pesan prefix tidak bisa ephemeral: buang opsi khusus slash. */
  _clean(payload) {
    const p = typeof payload === 'string' ? { content: payload } : { ...(payload ?? {}) };
    delete p.flags;
    delete p.ephemeral;
    delete p.fetchReply;
    delete p.withResponse;
    if (!p.allowedMentions) p.allowedMentions = { parse: [], repliedUser: false };
    return p;
  }

  async _first(payload) {
    try {
      return await this.message.reply(payload);
    } catch {
      return this.channel.send(payload); // pesan asli sudah dihapus
    }
  }

  async reply(payload) {
    if (this.sent) return this.followUp(payload);
    const withResponse = !!payload?.withResponse;
    const msg = await this._first(this._clean(payload));
    this.sent = msg;
    this.replied = true;
    return withResponse ? { resource: { message: msg }, message: msg } : msg;
  }

  async deferReply() {
    this.deferred = true;
    this.channel.sendTyping?.().catch(() => {});
  }

  async editReply(payload) {
    const clean = this._clean(payload);
    if (!this.sent) {
      this.sent = await this._first(clean);
      this.replied = true;
      return this.sent;
    }
    return this.sent.edit(clean);
  }

  async followUp(payload) {
    const msg = await this.channel.send(this._clean(payload));
    this.replied = true;
    return msg;
  }

  async fetchReply() {
    return this.sent;
  }

  async deleteReply() {
    await this.sent?.delete().catch(() => {});
  }
}

module.exports = { T, tokenize, parseOptions, usageOf, coerce, matchChoice, parseNumber, PrefixInteraction, PrefixOptions };
