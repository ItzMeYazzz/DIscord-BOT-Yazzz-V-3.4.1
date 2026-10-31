'use strict';

require('dotenv').config();

const missing = ['DISCORD_TOKEN', 'CLIENT_ID'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[config] File .env belum lengkap, isi dulu: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID || null,
  ownerIds: (process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
  statusText: process.env.STATUS_TEXT || 'VR',
  vrIcon: (process.env.VR_ICON ?? 'true').toLowerCase() !== 'false',
  // Prefix command: "yz play lofi" berjalan berdampingan dengan slash command (slash TIDAK dihapus).
  // Butuh "Message Content Intent" (Developer Portal > Bot). PREFIX_ENABLED=false untuk mematikan.
  prefix: {
    enabled: (process.env.PREFIX_ENABLED ?? 'true').toLowerCase() !== 'false',
    text: (process.env.PREFIX || 'yz').trim().toLowerCase(),
  },
  // NodeLink (server audio yang kompatibel dengan Lavalink). Samakan dengan server.host/port/password di config.ts NodeLink.
  nodelink: {
    name: process.env.NODELINK_NAME || 'NodeLink',
    host: process.env.NODELINK_HOST || 'localhost',
    port: process.env.NODELINK_PORT || '3000',
    password: process.env.NODELINK_PASSWORD || 'youshallnotpass',
    secure: (process.env.NODELINK_SECURE ?? 'false').toLowerCase() === 'true',
    resume: (process.env.NODELINK_RESUME ?? 'false').toLowerCase() === 'true',
    // Prefiks pencarian Lavalink. Ganti kalau mau, mis. ytmsearch (YouTube Music).
    searchYoutube: process.env.MUSIC_SEARCH_YOUTUBE || 'ytsearch',
    searchSoundcloud: process.env.MUSIC_SEARCH_SOUNDCLOUD || 'scsearch',
  },
  colors: {
    main: 0x5865f2,
    success: 0x57f287,
    error: 0xed4245,
    warn: 0xfee75c,
  },
};
