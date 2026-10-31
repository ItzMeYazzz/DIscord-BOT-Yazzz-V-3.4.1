'use strict';
const net = require('./utils/netTuning');
net.applyEarly(); // IPv4 dulu + keep-alive koneksi; harus dijalankan sebelum discord.js dimuat
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const config = require('./config');
const { loadCommands } = require('./utils/loadCommands');
const voiceManager = require('./utils/voiceManager');
const lavalink = require('./music/lavalink');

// Ikon "VR" di samping nama bot: trik tidak resmi lewat properti identify gateway.
// Kalau tidak muncul / bermasalah, set VR_ICON=false di .env (teks "Playing VR" tetap jalan).
const WS_BROWSER = 'Discord VR';
const wsOptions = {};
if (config.vrIcon) {
  wsOptions.identifyProperties = { os: process.platform, browser: WS_BROWSER, device: 'discord.js' };
  try {
    const { DefaultWebSocketManagerOptions } = require('@discordjs/ws');
    DefaultWebSocketManagerOptions.identifyProperties.browser = WS_BROWSER;
  } catch {
    // paket @discordjs/ws tidak terjangkau: opsi di atas tetap dicoba
  }
}

const client = new Client({
  ws: wsOptions,
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates, // wajib untuk voice 24/7
    GatewayIntentBits.GuildMembers, // privileged: aktifkan "Server Members Intent" di Developer Portal
    GatewayIntentBits.GuildMessages, // untuk AFK & XP chat
    // privileged: wajib untuk prefix command (yz ...). Aktifkan "Message Content Intent" di Developer Portal.
    ...(config.prefix.enabled ? [GatewayIntentBits.MessageContent] : []),
  ],
  partials: [Partials.GuildMember],
  allowedMentions: { parse: [], repliedUser: false },
});

client.commands = loadCommands();

// NodeLink (Shoukaku) WAJIB diinisialisasi sebelum client.login()
lavalink.init(client);
client.once(Events.ClientReady, () => net.startMonitor(client));

// Muat event: satu file boleh mengekspor satu event atau array event
const eventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith('.js'))) {
  const mod = require(path.join(eventsDir, file));
  for (const ev of Array.isArray(mod) ? mod : [mod]) {
    const handler = (...args) => ev.execute(client, ...args);
    if (ev.once) client.once(ev.name, handler);
    else client.on(ev.name, handler);
  }
}

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));

function shutdown() {
  console.log('[bot] Mematikan bot...');
  voiceManager.destroyAll();
  client.destroy();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(config.token).catch((err) => {
  if (/disallowed intents/i.test(String(err?.message))) {
    console.error(
      '\n[login] Discord menolak intents. Buka https://discord.com/developers/applications > aplikasimu > Bot >\n' +
        '        "Privileged Gateway Intents" lalu aktifkan: SERVER MEMBERS INTENT dan MESSAGE CONTENT INTENT.\n' +
        '        (Atau set PREFIX_ENABLED=false di .env kalau tidak mau pakai prefix command.)\n',
    );
  } else {
    console.error('[login] gagal:', err);
  }
  process.exit(1);
});
